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
CRON_SECRET=...                # סוד ל-cron jobs — מוגדר ע"י Vercel אוטומטית (ב-local dev אפשר להשאיר ריק)
```

- אם `EMAIL_USER` / `EMAIL_PASS` / `NOTIFY_EMAIL` חסרים — המייל נדלג בשקט (warning בלבד), האפליקציה ממשיכה לעבוד.
- **`ADMIN_SECRET` חובה.** אם חסר:
  - `generateApprovalToken` ב-`pending/page.tsx` זורק שגיאה (עוטופה ב-`try/catch` בשורה 88 של הדף)
  - `verifyToken` בשניהם `approve/route.ts` ו-`deny/route.ts` מחזיר `false` ו-logs שגיאה
  - כתוצאה: קישורי האישור/דחייה בעמוד pending לא יעבדו, המשתמש לא יקבל מייל אישור, וקישורי אישור מ-מייל יחזירו "אימות נכשל"
- **`CRON_SECRET`** (חדש) — מגן על cron endpoints (`/api/check-updates` ו-`/api/check-episode-releases`):
  - ב-Vercel: מוגדר אוטומטית, Vercel מוסיף header `Authorization: Bearer <CRON_SECRET>` לכל בקשת cron
  - ב-local dev: אם לא מוגדר → בדיקה תעבור (ללא הגנה), פיתוח לא יישבר

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
    check-episode-releases/route.ts # GET — בדיקת פרקים שיצאו אתמול + שליחת מייל לכל users (ציבורי)
    test-episode-email/route.ts # GET — בדיקת שליחת מייל פרקים (test/debug endpoint)
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
- **פונקציונליות:** בדיקת פרקים שיצאו היום (לפי שעון ישראל) לכל המשתמשים, ושליחת מיילי התראה לגביהם.
- **ניתן גישה ציבורית** (ב-middleware) לשימוש בcron jobs או external triggers בלא הרשאות Clerk.
- **תהליך:**
  1. בונה טווח זמן עבור יום "היום" לפי timezone `Asia/Jerusalem` (כולל DST אוטומטי):
     - `from` = 00:00 היום שעון ישראל (as Unix timestamp)
     - `to` = 00:00 מחר שעון ישראל (= סוף היום)
  2. שולף את כל הפרקים המתוזמנים לטווח זה מ-AniList `getAiringScheduleInRange` (כוללים פרקים שכבר יצאו וגם שעדיין יציאו בערב אותו יום)
  3. עובר על כל users שיש להם אנימות במעקב
  4. לכל user: מסנן פרקים רלוונטיים (שייכים לאנימות במעקב או sequels שלהן)
  5. בדיקת כפילויות: קריאה אחת `findMany` עם `OR` עבור כל הפרקים (מנע duplicates `EPISODE_${episode}`)
  6. לכל פרק חדש: טוען upcoming עד 3 פרקים הבאים דרך `getAnimeAiringSchedule`
  7. שולח מייל `sendNewEpisodeEmail` עם רשימת הפרקים
  8. שומר רשומת `SentNotification` עם type `EPISODE_${episode}`

**אופטימיזציה:**
1. **batch dedup:** `findMany` עם `OR` עבור כל הפרקים הרלוונטיים (במקום `findUnique` בלולאה)
2. **rate limit משותף:** כל קריאות ה-`getAnimeAiringSchedule` בתוך context אחד של `withRateLimit` (700ms spacing כללי)
3. **batch insert:** `createMany` עם `skipDuplicates: true` עבור כל התראות (מנע כפל EPISODE_X)

- מחזיר `{ checked, notified, errors }`:
  - `checked` = מספר users שנבדקו
  - `notified` = כמה users קיבלו מיילים בהצלחה
  - `errors` = כמה עיבודים נכשלו

### `GET /api/test-episode-email`
- **פונקציונליות:** endpoint debug לבדיקת פונקציית שליחת מיילי פרקים.
- **ניתן גישה ציבורית** (ב-middleware) — משמש בעיקר לטיפול ודבגים של תוכנה.
- שולח מייל test עם 3 אנימות לדוגמה (Demon Slayer, Jujutsu Kaisen, Solo Leveling) לכתובת המוגדרת ב-`NOTIFY_EMAIL` (ברירת מחדל: `nisimelec77@gmail.com`).
- מחזיר:
  - `{ sent: true, to: EMAIL, episodes: 3 }` אם המייל נשלח בהצלחה
  - `{ sent: false, reason: 'email config missing or send failed' }` (status 500) אם השליחה נכשלה

### `POST /api/check-updates` + `GET /api/check-updates`
**הגנת Cron:**
- `GET` ו-`POST` עם `sendEmails: true` דורשים `CRON_SECRET`
- בדיקה: header `Authorization: Bearer <CRON_SECRET>` — Vercel מוסיף אוטומטית לכל בקשת cron
- אם `CRON_SECRET` לא מוגדר בסביבה: בדיקה מחליפה והפונקציה מתבצעת (לא מונעת)
- אחרת: מחזיר 401 אם ה-secret לא תואם

**קבלת פרמטרים (POST בלבד):**
- `sendEmails` (default: `true`) — אם `false` → check-only mode בלא שליחת מיילים
- `userOnly` (default: `false`) — אם `true` → רץ רק עבור המשתמש המחובר, דורש `sendEmails: true` + Clerk auth

**מצב 1 — Check Only (ללא מיילים, דורש Clerk auth):**
- `POST` ללא body או עם `sendEmails: false`
- מחזיר `{ checked, errors, releasingAnimes, availableSequels, pendingNotifications, availableUnwatched }`
  - `availableUnwatched` — כל אחד מוגדר עם `parentTitle`, `sequelTitle`, `sequelId`, `coverImage` (אופציונלי), ו-`parentAnilistId` (אופציונלי)
- משמש לכפתור "בדוק עדכונים" בממשק לתצוגת מצב בלבד

**מצב 2 — Update (עם מיילים) — עבור משתמש יחיד (דורש Clerk auth):**
- `POST { sendEmails: true, userOnly: true }`
- קורא לפונקציה `runUpdateCheckForUser(userId, toEmail)` עם email מ-Clerk
- מחזיר `{ checked, notified, errors, notifications }`

**מצב 3 — Update (עם מיילים) — עבור כל המשתמשים (Cron — דורש CRON_SECRET):**
- `POST { sendEmails: true }` או `GET`
- קורא לפונקציה `runUpdateCheck()`
- איטרציה על כל users ב-`trackedAnime`, fetching email מ-Clerk

**שלב 1 — איסוף נתונים (משותף לכל המצבים):**
- `fetchSentNotificationKeys` — query בודד לכל user מ-`SentNotification`, מחזיר `Set<string>` (סוג: `${sequelId}_${type}`)
- **batch pre-fetch סטטוסים:** לפני הלולאה, טוען את סטטוס כל האנימות בבאצ'ים של עד 50 לכל קריאה (מוגבל ל-1 batch = כ-700ms)
- ב-loop: אם סטטוס נמצא בבאצ' → O(1) lookup מ-`statusBatchMap`; אם לא → fallback לקריאה בודדת עם 700ms delay
- סיקוולים ישירים מ-AniList תמיד במקביל עם batch
- **collection cover images:** כל סיקוול זמין (unopened finished sequel) נאסף עם `coverImage` מהאנימה ממנה חזרה בDB (אם קיימת)
- עובר על KnownSequel לזיהוי שרשראות רב-דוריות (S1→S2 ידוע, S3 חדש).
- delay 700ms בין כל קריאה בודדת (rate limit AniList) — **לא בבאצ'ים**
- בדיקת כפילויות בזמן O(1) מול ה-Set (במקום query בדוק לכל סיקוול).
- **לאנימות RELEASING:** קריאה ל-`getAnimeAiringSchedule` להשגת עד 3 פרקים קרובים (או הפרק הבא אם אין יותר).

**שלב 2 — שליחת מיילים (רק אם `sendEmails: true`):**
- עשור `consolidatedItems` מהפנדינג נוטיפיקציות + enrichment עם עברית + עונות
- **עבור כל item במעקב:** חישוב `existingSeasonCount` — כמה עונות של הסדרה קיימות לפני העונה הנוכחית
- **עבור כל item RELEASING:** קריאה ל-`getAnimeAiringSchedule` להשגת רשימת עד 3 פרקים קרובים
- **עבור סיקוולים זמינים:** אם יש `parentAnilistId` — חישוב `currentSeasonNumber` כמספר העונה של ה-parent בסדרה
- enrichment סיקוולים זמינים: נוסף `coverImage` מ-`availableUnwatched` לכל פריט (עדיפות: DB שלנו קודם, AniList כ-fallback)
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
| `sendConsolidatedMonthlyEmail` | עדכון חודשי משולב | מייל עם 3 סקשנים: "בשידור כעת", "הוכרזה עונה", "ממתין לצפייה". **כרטיסיות:** **בקשן "בשידור":** פורמט קומפקטי — כותרה (עברית + עונה אם רלוונטי) + עד 2-3 פרקים קרובים (בפורמט צפוף: "פרק X - תאריך")  + תמונה `90px` בצד ימין (flex-direction:row-reverse). כרטיס בגובה מינימום `110px` עם דוד ורוד (`rgba(224,23,107,0.15)`). **בקשן "הוכרזה":** תמונה `76×107px` בצד שמאל + תוכן בצד ימין (flex). כותרה (עברית בלבד) + תג עונה (צהוב) + מספר עונות קיימות (אם רלוונטי) + תאריך הכרזה ב-container צהוב + expected episodes. דוד צהוב (`rgba(251,191,36,0.15)`). **בקשן "ממתין":** תמונה `76×107px` בצד שמאל + כותרה + "כל הפרקים זמינים ✓" (ירוק). דוד ירוק (`rgba(74,222,128,0.15)`). **תמונות:** `<img>` עם `width` + `height` (size-specific) + `style="width:Xpx;height:Ypx;object-fit:cover;display:block;"` — תאימות מלאה לקליינטי מייל. placeholder: `<div>` בצבע background כהה. **inline attachments:** כל תמונה מורדת server-side וצמודה כ-inline attachment עם CID ייחודי — `<img src="cid:...">` במקום URL חיצוני. |
| `sendNewEpisodeEmail` | כשיוצאים פרקים חדשים באותו יום לאנימות במעקב (דרך `/api/check-episode-releases`) | מייל עם רשימת הפרקים שיוצאים היום וטבלת הפרקים הקרובים הבאים. כותרת קבועה: `פרקים חדשים להיום - animeAI` |

כל המיילים בסגנון dark theme עם CSS inline.

**תמונות — הטמעה בתור attachments (עדכון חדש):**
- **בעיה:** Gmail חוסם תמונות חיצוניות מ-AniList CDN — התמונות לא נטענות עבור משתמשים רבים.
- **פתרון:** כל תמונה מורדת server-side לפני שליחת המייל, צמודה כ-inline attachment עם CID ייחודי (לדוגמה: `cover0@anime`, `cover1@anime`), והתג `<img>` משתמש ב-`cid:` במקום URL חיצוני.
- **תהליך:**
  - פונקציה `fetchImageAttachments(urls)` מקבלת array של URLs, מורידה כל תמונה עם timeout 5 שניות, וממפה URL → CID.
  - בכל פונקציית מייל (`sendConsolidatedMonthlyEmail`, `sendUpdatesEmail`, `sendNewEpisodeEmail`): תחילה מורידים את כל התמונות, ולאחר מכן בדיקה: אם URL קיים במפה `urlToCid` → משתמשים ב-`<img src="cid:...">`; אחרת → מציגים `<div>` ריקה עם background כהה (placeholder).
  - המייל נשלח עם שדה `attachments` המכיל את כל ה-inline attachments (type: `inline`, disposition: `inline`).
- **יתרונות:** תמונות מוטמעות ישירות בגוף המייל, אינן תלויות בחיבור חיצוני או CDN, תואמות לכל קליינטי מייל.
- **fallback:** אם תמונה לא מורדת (timeout או שגיאה) — מוצג `<div>` ריקה בצבע background כהה במקום תמונה שבורה.

**אבטחה — HTML Escaping:**
- פונקציה `escHtml()` מחליפה תווים מסוכנים (`& < > " '`) בentities בטוחות (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`)
- משמשת ב-`sendApprovalRequestEmail` ו-`sendUserApprovedEmail` ל-escape של `userName` ו-`userEmail` לפני הכנסה ל-HTML
- מונעת HTML injection אם שם משתמש מכיל תגים או סקריפטים (לדוגמה: `</span><a href="evil.com">` יוצג כ-`&lt;/span&gt;&lt;a href=&quot;evil.com&quot;&gt;`)
- **הערה:** שורות הנושא (subjects) הן טקסט רגיל ולא דורשות escaping

**הערה:** `sendNewEpisodeEmail` נשלח מ-`check-episode-releases` כ-part מepisode detection אוטומטי (דרך cron או external trigger).

---

## AniList + Rate Limiting (lib/anilist.ts)

- `gqlFetch` — אוכף 700ms מינימום בין קריאות
- HTTP 429 → retry עד 2 פעמים עם exponential backoff (3s, 6s)
- GQL-level 429 (HTTP 200 + שגיאה בגוף) — מטופל גם כן
- `getAllSeasons` — BFS על PREQUEL+SEQUEL, מוגבל ל-20 nodes
- `getAnimeAiringSchedule` — שליפת לוח שידורים של אנימה (מחזיר הפרק הבא + כל הפרקים הקרובים עד 3), משמשת ב-`check-updates` להוספת פרקים קרובים לתצוגת מייל RELEASING

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
