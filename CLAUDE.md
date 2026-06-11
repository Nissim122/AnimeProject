# Anime Tracker — אפיון מלא

## מה המערכת

אפליקציית Next.js למעקב אחרי אנימות. המשתמש מסמן אנימות שצפה בהן (לפי עונה), והמערכת שולחת מייל אוטומטי כשיוצאת עונה חדשה לאחת האנימות במעקב. קיים גם Watchlist נפרד לאנימות שרוצים לצפות בעתיד.

---

## Stack טכני

| שכבה | טכנולוגיה |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | SQLite דרך Prisma |
| Styling | Tailwind CSS |
| Anime API | AniList GraphQL (https://graphql.anilist.co) |
| Email | Nodemailer + Gmail |
| Cron | node-cron בתוך server.js מותאם |
| שפת קוד | TypeScript |
| Testing | Vitest + Playwright |

---

## הרצה

```bash
npm run dev   # מפעיל server.js שמריץ Next.js + cron
npm run build
npm start     # production
```

השרת רץ על `http://localhost:3000` ברירת מחדל. `PORT` ניתן לשינוי דרך env.

---

## משתני סביבה (env)

```
DATABASE_URL=file:C:/Users/nisim/.anime-tracker/anime.db
EMAIL_USER=...@gmail.com       # חשבון שולח
EMAIL_PASS=...                 # App Password של Gmail (לא סיסמה רגילה)
NOTIFY_EMAIL=...@gmail.com     # לאן שולחים את ההתראות
ADMIN_SECRET=...               # סוד ל-HMAC של קישורי אישור/דחייה (חובה)
ADMIN_EMAIL=...@gmail.com      # כתובת הנהלים שמקבלת בקשות אישור (ברירת מחדל: nisimelec77@gmail.com)
```

- אם `EMAIL_USER` / `EMAIL_PASS` / `NOTIFY_EMAIL` חסרים — המייל נדלג בשקט (warning בלבד), האפליקציה ממשיכה לעבוד.
- **`ADMIN_SECRET` חובה.** אם חסר:
  - `generateApprovalToken` ב-`pending/page.tsx` זורק שגיאה (עוטופה ב-`try/catch` בשורה 88 של הדף)
  - `verifyToken` בשניהם `approve/route.ts` ו-`deny/route.ts` מחזיר `false` ו-logs שגיאה
  - כתוצאה: קישורי האישור/דחייה בעמוד pending לא יעבדו, המשתמש לא יקבל מייל אישור, וקישורי אישור מ-מייל יחזירו "אימות נכשל"

---

## מבנה קבצים

```
app/
  page.tsx                   # דף ראשי (client component) — tabs: מעקב / watchlist
  layout.tsx                 # html lang="he" dir="rtl", רקע #0f0f1a
  globals.css
  api/
    search/route.ts          # GET ?q=  — חיפוש אנימה
    seasons/route.ts         # GET ?id= — כל עונות סדרה
    track/route.ts           # POST / DELETE — הוספה/הסרה ממעקב
    tracked/route.ts         # GET — רשימת מעוקבות
    next-seasons/route.ts    # GET ?ids= — מצב עונות עבור אנימות במעקב
    check-updates/route.ts   # POST — בדיקת עדכונים + שליחת מייל
    watchlist/route.ts       # GET / POST / DELETE — ניהול watchlist
    airing-schedule/route.ts # GET ?id= — לוח שידורים לסדרה (פרקים עתידיים)

components/
  SearchBar.tsx              # שורת חיפוש + רשת תוצאות + פתיחת modal
  AnimeCard.tsx              # קלף אנימה בתוצאות חיפוש
  AnimeDetailModal.tsx       # modal לבחירת עונה ספציפית
  TrackedList.tsx            # רשת האנימות במעקב
  WatchListView.tsx          # תצוגת watchlist

lib/
  anilist.ts                 # כל קריאות ל-AniList GraphQL + rate limiting
  translate.ts               # זיהוי עברית + תרגום דרך Google Translate
  mailer.ts                  # שליחת 3 סוגי מיילים עם Nodemailer
  prisma.ts                  # Prisma client singleton

prisma/
  schema.prisma              # מודלי DB
server.js                    # Custom server עם cron יומי ב-09:00 (ירושלים)
```

---

## מודל נתונים (Prisma / SQLite)

### `TrackedAnime`
| שדה | סוג | הערה |
|---|---|---|
| id | Int PK | auto |
| anilistId | Int unique | מזהה AniList |
| title | String | כותרת (english ?? romaji) |
| coverImage | String? | URL תמונה |
| watchStatus | String | `'watching'` (צופה כרגע) או `'completed'` (ראיתי). ברירת מחדל: `'completed'` |
| trackedAt | DateTime | תאריך הוספה |
| knownSequels | KnownSequel[] | רלייציה |

### `KnownSequel`
| שדה | סוג | הערה |
|---|---|---|
| id | Int PK | |
| trackedAnimeId | Int FK | → TrackedAnime, cascade delete |
| sequelAnilistId | Int | מזהה סיקוול |
| unique | (trackedAnimeId, sequelAnilistId) | |

### `SentNotification`
| שדה | סוג | הערה |
|---|---|---|
| id | Int PK | |
| sequelAnilistId | Int | |
| type | String | `'MONTH_START'` או `'DAY_BEFORE'` |
| sequelTitle | String | |
| parentTitle | String | |
| sentAt | DateTime | |
| unique | (sequelAnilistId, type) | מונע כפל מיילים לאותו סוג |

### `WatchListItem`
| שדה | סוג | הערה |
|---|---|---|
| id | Int PK | |
| anilistId | Int unique | מזהה AniList |
| title | String | |
| coverImage | String? | URL תמונה |
| addedAt | DateTime | תאריך הוספה |

---

## API Endpoints

### `GET /api/search?q=`
- פחות מ-2 תווים → מחזיר `{ results: [] }`
- **חיפוש עברי:** מזהה עברית עם regex, מתרגם דרך Google Translate, מחפש בעברית ובתרגום במקביל, ממזג ומנכה כפילויות. אם פחות מ-3 תוצאות — fallback חיפוש מילה-מילה.
- **חיפוש אנגלי:** ישירות ל-AniList.
- מחזיר רק `TV` ו-`TV_SHORT` (לא סרטים/OVA).
- **קיבוץ סדרות:** מאחד סיקוולים/פריקוולים לכרטיס אחד (union-find), מציג נציג אחד לסדרה.

### `GET /api/seasons?id=`
- מקבל AniList ID של עונה כלשהי בסדרה.
- מחזיר **כל** עונות הסדרה (prequel + sequel) ממוינות לפי שנה.
- מוגבל ל-20 עונות כדי למנוע לולאה אינסופית.

### `POST /api/track`
```json
{ "anilistId": 123, "title": "...", "coverImage": "...", "watchStatus": "watching" | "completed" }
```
- `watchStatus` אופציונלי — ברירת מחדל `"completed"`.
- בודק אם כבר קיים → מחזיר existing.
- יוצר TrackedAnime ושומר סיקוולים ידועים כ-KnownSequel (כדי שלא יתריע עליהם בעתיד).

### `PATCH /api/track`
- מקבל `{ anilistId, note?, watchStatus? }` — מעדכן note ו/או watchStatus.

### `DELETE /api/track?anilistId=`
- מוחק TrackedAnime (KnownSequel נמחק ב-cascade).

### `GET /api/tracked`
- מחזיר כל TrackedAnime ממוין `trackedAt DESC`.

### `GET /api/next-seasons?ids=`
- מקבל ids מופרדים בפסיק של אנימות במעקב.
- לכל אנימה מחשב:
  - `next` — עונה הבאה (RELEASING / NOT_YET_RELEASED)
  - `available` — סיקוול שכבר יצא אבל לא במעקב
  - `hasReleasingAhead` — יש עונה עתידית בזמן שהמשתמש מפגר
  - `allWatched` — כל העונות נצפו
- מחזיר object ממפה anilistId → AnimeSeasonInfo.

### `GET /api/check-episode-releases`
- רץ כל 25 שעות (בדיקת פרקים שיצאו בעבר).
- שולף את כל הפרקים שיצאו ב-25 השעות האחרונות מ-AniList `getAiringScheduleInRange`.
- לכל משתמש עם אנימות במעקב: מסנן פרקים רלוונטיים (שייכים לאנימות במעקב או sequels שלהן).

**אופטימיזציה:**
1. **בדיקת כפילויות — batch dedup:** קריאה אחת `findMany` עם `OR` עבור כל הפרקים הרלוונטיים (במקום `findUnique` בלולאה)
2. **rate limit משותף:** כל קריאות ה-`getAnimeAiringSchedule` בתוך context אחד של `withRateLimit` (700ms spacing עבור כל הקריאות, לא לכל אחת בנפרד)
3. **batch insert:** `createMany` עם `skipDuplicates: true` עבור כל התראות (במקום insert בלולאה)

- מחזיר `{ checked, notified, errors }`.

### `POST /api/check-updates`
**קבלת פרמטרים:**
- `sendEmails` (default: `true`) — אם `false` → check-only mode בלא שליחת מיילים
- `userOnly` (default: `false`) — אם `true` → רץ רק עבור המשתמש המחובר, דורש `sendEmails: true`
- ללא `sendEmails` ו-user logged-in → check-only mode עבור משתמש יחיד

**מצב 1 — Check Only (ללא מיילים):**
- מחזיר `{ checked, errors, releasingAnimes, availableSequels, pendingNotifications, availableUnwatched }`
- משמש לכפתור "בדוק עדכונים" בממשק לתצוגת מצב בלבד

**מצב 2 — Update (עם מיילים) — עבור משתמש יחיד:**
- קורא לפונקציה `runUpdateCheckForUser(userId, toEmail)` עם email מ-Clerk
- מחזיר `{ checked, notified, errors, notifications }`

**מצב 3 — Update (עם מיילים) — עבור כל המשתמשים (Cron):**
- קורא לפונקציה `runUpdateCheck()`
- איטרציה על כל users ב-`trackedAnime`, fetching email מ-Clerk

**שלב 1 — איסוף נתונים (משותף לכל המצבים):**
- `fetchSentNotificationKeys` — query בודד לכל user מ-`SentNotification`, מחזיר `Set<string>` (סוג: `${sequelId}_${type}`)
- **batch pre-fetch סטטוסים:** לפני הלולאה, טוען את סטטוס כל האנימות בבאצ'ים של עד 50 לכל קריאה (מוגבל ל-1 batch = כ-700ms)
- ב-loop: אם סטטוס נמצא בבאצ' → O(1) lookup מ-`statusBatchMap`; אם לא → fallback לקריאה בודדת עם 700ms delay
- סיקוולים ישירים מ-AniList תמיד במקביל עם batch
- עובר על KnownSequel לזיהוי שרשראות רב-דוריות (S1→S2 ידוע, S3 חדש).
- delay 700ms בין כל קריאה בודדת (rate limit AniList) — **לא בבאצ'ים**
- בדיקת כפילויות בזמן O(1) מול ה-Set (במקום query בדוק לכל סיקוול).

**שלב 2 — שליחת מיילים (רק אם `sendEmails: true`):**
- עשור `consolidatedItems` מהפנדינג נוטיפיקציות + enrichment עם עברית + עונות
- מייל קונסוליד (מיי יחיד) עם כל הפנדינג + זמינים שלא נצפו
- `createMany` עם `skipDuplicates: true` לשמירת רשומות נוטיפיקציה
- מחזיר `{ checked, notified, errors, notifications }`

מחזיר (check-only): `{ checked, errors, releasingAnimes, availableSequels, pendingNotifications, availableUnwatched }`
מחזיר (update): `{ checked, notified, errors, notifications }`

**אופטימיזציה:** 
- **קודם:** 20 אנימות × 1 קריאה סטטוס = 20 × 700ms = ~14s בשלב איסוף
- **אחרי:** 1 batch query (50 ids) = 700ms + fallback אם נחוץ
- כל סיקוול ידוע (KnownSequel) עדיין קריאה בודדת עם 700ms (אין batch מקביל קיים)

### `GET /api/watchlist`
- מחזיר כל WatchListItem ממוין `addedAt DESC`.

### `POST /api/watchlist`
```json
{ "anilistId": 123, "title": "...", "coverImage": "..." }
```
- בודק אם כבר קיים → מחזיר existing.

### `DELETE /api/watchlist?anilistId=`
- מוחק מה-watchlist.

### `GET /api/airing-schedule?id=`
- מקבל AniList ID של עונה ספציפית.
- קורא ישירות ל-AniList (לא דרך `gqlFetch` עם rate limit — קריאה בודדת triggered by user).
- מחזיר `{ status, nextAiringEpisode: { episode, airingAt } | null, upcoming: [{ episode, airingAt }] }`.
- `upcoming` = כל הפרקים שטרם שודרו (`notYetAired: true`), ממוינים לפי מספר פרק.
- משמש רק ל-RELEASING seasons — ה-modal לא קורא לזה אחרת.

### `GET /api/admin/approve?userId=&token=`
- Endpoint להאשרת משתמש חדש דרך קישור במייל.
- **אימות:** HMAC-SHA256 מחושב מ-`userId` עם `process.env.ADMIN_SECRET`.
  - אם `ADMIN_SECRET` חסר → `verifyToken` מחזיר `false`, logs שגיאה, מחזיר HTML "אימות נכשל"
  - אם token תקין → מעדכן status ל-`APPROVED` בדטה-בייס ושולח מייל אישור
- מחזיר HTML page בעברית עם סטטוס הפעולה

### `GET /api/admin/deny?userId=&token=`
- Endpoint לדחיית משתמש דרך קישור במייל.
- **אימות:** זהה ל-approve — HMAC-SHA256, אם env חסר → "אימות נכשל"
- אם token תקין → מעדכן status ל-`DENIED` בדטה-בייס
- מחזיר HTML page בעברית עם סטטוס הפעולה

**הערה אבטחה:** 
- `generateApprovalToken` ב-`pending/page.tsx` זורק שגיאה (explicit) אם `ADMIN_SECRET` חסר. הקריאה עוטפת ב-`try/catch` (שורה 88) כדי למנוע crash של הדף.
- אם `ADMIN_SECRET` לא מוגדר בסביבה:
  - עמוד pending לא יצליח לטעון קישורי אישור בדוא״ל
  - `approve` ו-`deny` endpoints יזרקו שגיאה בלוג ויחזירו "אימות נכשל" ללא גישה
  - users לא יקבלו מיילי אישור כלל

---

## לוגיקת UI — כללים חשובים

### מבנה דף ראשי (page.tsx)
- שני tabs: **מעקב** / **Watchlist**
- טוען tracked + watchlist + next-seasons בהעלאה
- State: `tracked`, `watchlist`, `activeView`, `seasonInfo`, `modalAnime`, `toasts`, `checking`, `trackedLoading`

### חיפוש (SearchBar)
- Debounce **700ms**
- ביטול בקשות in-flight (AbortController) — תוצאות ישנות לא דורסות חדשות
- כפתור חיפוש ידני + כפתור ניקוי
- לחיצה על כרטיסייה פותחת AnimeDetailModal (לא מוסיפה ישירות!)

### AnimeCard
- תג ⭐ זהוב אם `isTopResult` (הפופולרי ביותר בתוצאות)
- תג ✓ ירוק אם כבר במעקב
- hover: "📺 בחר עונה"

### AnimeDetailModal
- טוען את כל עונות הסדרה דרך `/api/seasons?id=`
- ברירת מחדל: העונה שנלחצה (לא בהכרח עונה 1)
- מחשב ממוספור אפיזודות רציף (מדלג על סרטים)
- **3 אפשרויות לסדרה שעוד לא במעקב:** `📺 צופה כרגע` (watchStatus=watching) | `סמן שראיתי עד עונה זו` (watchStatus=completed) | `+ לצפייה` (watchlist)
- **סדרה עם watchStatus=watching:** מציג כפתור `✓ סיימתי לצפות` במקום — משנה watchStatus ל-completed
- **לוח שידורים:** כשנבחרת עונה עם `status === 'RELEASING'` — נטען אוטומטית `/api/airing-schedule?id=` ומוצג סקשן "📅 לוח שידורים" מתחת לרשימת העונות. מציג: הפרק האחרון שיצא (✓ ירוק) + 3 פרקים הבאים עם תאריך מעוצב (היום = ורוד, מחר = צהוב, עתיד = כחול). State: `airingData`, `airingLoading`. נטען עם AbortController לביטול בשינוי עונה.
- **חוק עונות:** כשמסמנים עונה — כל עונה אחרת מאותה הסדרה שכבר במעקב **מוסרת אוטומטית**.
- אם עונה אחרת כבר במעקב — אזהרה כתומה `⚠️ עונה אחרת מהסדרה כבר במעקב — תוחלף בבחירה החדשה`
- כפתור disabled אם העונה הנבחרת כבר במעקב

### רשימת מעוקבות (TrackedList)
- גריד רספונסיבי: 2 עמודות → 5
- כרטיס מציג בורדר צבעוני לפי סטטוס: סגול = `available`, ירוק = `releasing`, אפור = רגיל
- הודעת ריק אם אין פריטים; אזהרה כתומה אם `seasonInfo` לא נטען

### WatchListView
- גריד זהה ל-TrackedList
- מציג: תמונה, כותרת, תאריך הוספה, כפתור הסרה
- הודעת ריק אם אין פריטים

### Toasts
- מוצגים בפינה ימנית תחתית
- נעלמים אחרי 4 שניות
- צבעים: ירוק = success, אדום = error, אפור = info

### כפתור "בדוק עדכונים"
- מושבת כשאין אנימות במעקב או כשבדיקה רצה
- מציג ⟳ מסתובב בזמן בדיקה
- לאחר בדיקה: toast עם מספר עדכונים שנמצאו
- קורא ל-`POST /api/check-updates` בלא גוף (check-only mode) — מחזיר רשימת פנדינג בלא שליחת מיילים

---

## מיילים — 4 סוגים (lib/mailer.ts)

| פונקציה | מתי נשלחת | תוכן |
|---|---|---|
| `sendMonthStartEmail` | RELEASING או בחודש הנוכחי | מייל מפורט: טבלת כל העונות, עונה חדשה מסומנת באדום, סקשן אופציונלי של סיקוולים שיצאו |
| `sendDayBeforeEmail` | מחר בדיוק | מייל קצר עם תאריך וכותרת |
| `sendAvailableSeasonsEmail` | לא נשלחו מיילים אחרים אבל יש סיקוולים שיצאו | רשימת כל הסיקוולים הזמינים |
| `sendNewEpisodeEmail` | כשפרקים חדשים יוצאים לאנימות במעקב | מייל עם רשימת הפרקים שיצאו וטבלת הפרקים הקרובים הבאים. כותרת קבועה: `animeAI - פרקים חדשים` |

כל המיילים בסגנון dark theme עם CSS inline.

---

## AniList + Rate Limiting (lib/anilist.ts)

- `gqlFetch` — אוכף 700ms מינימום בין קריאות
- HTTP 429 → retry עד 2 פעמים עם exponential backoff (3s, 6s)
- GQL-level 429 (HTTP 200 + שגיאה בגוף) — מטופל גם כן
- `getAllSeasons` — BFS על PREQUEL+SEQUEL, מוגבל ל-20 nodes

---

## Cron — רענון שבועי

`vercel.json` מגדיר cron שרץ כל **רביעי בשעה 03:00 UTC** (05:00–06:00 שעון ירושלים תלוי בעונה) שקורא ל-`GET /api/refresh-season-cache`. הפונקציה מנקה את כל ה-cache (עונות + סטטוסים) ומושכת מחדש את כל הנתונים מ-AniList עבור כל האנימות במעקב.

---

## עיצוב וסגנון

- **שפה:** ממשק בעברית מלא, dir="rtl"
- **טקסט מזהה אנימה:** english ?? romaji (עברית לא מוצגת)
- **צבעי ברירת מחדל:** רקע `#0f0f1a` (כחול-שחור כהה), כרטיסיות `gray-800`, הדגשה `pink-500`
- **אין next/image** — משתמשים ב-`<img>` רגיל (AniList CDN)

---

## נקודות שימו לב בתיקון באגים

1. **חיפוש עברי** — לוגיקה ב-`app/api/search/route.ts` + `lib/translate.ts`. תרגום דרך `translate.googleapis.com` (לא API מוסמך).
2. **עונות** — `getAllSeasons` ב-`lib/anilist.ts` עושה BFS של PREQUEL+SEQUEL, מוגבל ל-20 nodes.
3. **כפילויות נוטיפיקציה** — `SentNotification` unique על `(sequelAnilistId, type)` — שני סוגים שונים לאותו סיקוול אפשריים, אותו סוג רק פעם אחת.
4. **החלפת עונה** — הלוגיקה ב-`handleTrack` ב-`app/page.tsx`: מוחק קודם עונות אחרות מאותה הסדרה, אחר כך מוסיף את החדשה.
5. **Rate limit** — `gqlFetch` ב-`lib/anilist.ts` מאכף 700ms; לא לקרוא ל-`getAllSeasons` בלולאה על הרבה אנימות.
6. **Watchlist** — פיצ'ר נפרד לחלוטין מ-tracked: טבלה נפרדת, endpoints נפרדים, אין התראות מייל ל-watchlist.
7. **next-seasons** — קריאה ב-batch בטעינת הדף; מחשב `seasonInfo` לכל אנימה במעקב (משמש להצגת בורדר + badge על הכרטיס).
8. **watchStatus** — שדה ב-`TrackedAnime`: `'watching'` = צופה כרגע (מופיע ב-"📺 צופה" גם בלי סיקוול זמין), `'completed'` = ראיתי. `categorize()` ב-`TrackedList.tsx` בודק `watchStatus` לאחר בדיקת `available`/`next` — רק אם שניהם null ו-watchStatus=watching מחזיר `'watching'`.
