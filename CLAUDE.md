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
```

אם `EMAIL_USER` / `EMAIL_PASS` / `NOTIFY_EMAIL` חסרים — המייל נדלג בשקט (warning בלבד), האפליקציה ממשיכה לעבוד.

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

### `POST /api/check-updates`
**שלב 1 — איסוף נתונים:**
- לכל אנימה במעקב: מביא סטטוס + סיקוולים ישירים מ-AniList.
- אם RELEASING — מוסיף לתור התראות.
- עובר על KnownSequel לזיהוי שרשראות רב-דוריות (S1→S2 ידוע, S3 חדש).
- delay 700ms בין כל קריאה (rate limit AniList).

**שלב 2 — שליחת מיילים:**
- `MONTH_START`: סיקוול RELEASING או בחודש הנוכחי → מייל מפורט עם כל העונות.
- `DAY_BEFORE`: סיקוול מחר → מייל קצר.
- כל סוג נשלח רק פעם אחת (unique על sequelAnilistId + type).

**שלב 3 — reminder:**
- אם לא נשלחו מיילים אבל יש סיקוולים שיצאו ולא נצפו → מייל תזכורת כללי.

מחזיר `{ checked, notified, errors, notifications }`.

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

---

## מיילים — 3 סוגים (lib/mailer.ts)

| פונקציה | מתי נשלחת | תוכן |
|---|---|---|
| `sendMonthStartEmail` | RELEASING או בחודש הנוכחי | מייל מפורט: טבלת כל העונות, עונה חדשה מסומנת באדום, סקשן אופציונלי של סיקוולים שיצאו |
| `sendDayBeforeEmail` | מחר בדיוק | מייל קצר עם תאריך וכותרת |
| `sendAvailableSeasonsEmail` | לא נשלחו מיילים אחרים אבל יש סיקוולים שיצאו | רשימת כל הסיקוולים הזמינים |

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
