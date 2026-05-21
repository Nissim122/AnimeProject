# Anime Tracker — אפיון מלא

## מה המערכת

אפליקציית Next.js למעקב אחרי אנימות. המשתמש מסמן אנימות שצפה בהן (לפי עונה), והמערכת שולחת מייל אוטומטי כשיוצאת עונה חדשה לאחת האנימות במעקב.

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
DATABASE_URL=file:./dev.db
EMAIL_USER=...@gmail.com       # חשבון שולח
EMAIL_PASS=...                 # App Password של Gmail
NOTIFY_EMAIL=...@gmail.com     # לאן שולחים את ההתראות
```

אם `EMAIL_USER` / `EMAIL_PASS` / `NOTIFY_EMAIL` חסרים — המייל נדלג בשקט (warning בלבד), האפליקציה ממשיכה לעבוד.

---

## מבנה קבצים

```
app/
  page.tsx                   # דף ראשי (client component)
  layout.tsx                 # html lang="he" dir="rtl", רקע #0f0f1a
  globals.css
  api/
    search/route.ts          # GET ?q=  — חיפוש אנימה
    seasons/route.ts         # GET ?id= — כל עונות סדרה
    track/route.ts           # POST / DELETE — הוספה/הסרה ממעקב
    tracked/route.ts         # GET — רשימת מעוקבות
    check-updates/route.ts   # POST — בדיקת עדכונים + שליחת מייל

components/
  SearchBar.tsx              # שורת חיפוש + רשת תוצאות + פתיחת modal
  AnimeCard.tsx              # קלף אנימה בתוצאות חיפוש
  AnimeDetailModal.tsx       # modal לבחירת עונה ספציפית
  TrackedList.tsx            # רשת האנימות במעקב

lib/
  anilist.ts                 # כל קריאות ל-AniList GraphQL
  translate.ts               # זיהוי עברית + תרגום דרך Google Translate
  mailer.ts                  # שליחת מייל עם Nodemailer
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
| trackedAt | DateTime | תאריך הוספה |
| knownSequels | KnownSequel[] | רלייציה |

### `KnownSequel`
| שדה | סוג | הערה |
|---|---|---|
| id | Int PK | |
| trackedAnimeId | Int FK | → TrackedAnime |
| sequelAnilistId | Int | מזהה סיקוול |
| unique | (trackedAnimeId, sequelAnilistId) | |

### `SentNotification`
| שדה | סוג | הערה |
|---|---|---|
| id | Int PK | |
| sequelAnilistId | Int unique | מונע כפילויות |
| sequelTitle | String | |
| parentTitle | String | |
| sentAt | DateTime | |

---

## API Endpoints

### `GET /api/search?q=`
- פחות מ-2 תווים → מחזיר `{ results: [] }`
- **חיפוש עברי:** מזהה עברית עם regex, מתרגם דרך Google Translate, מחפש בעברית ובתרגום במקביל, ממזג ומנכה כפילויות. אם פחות מ-3 תוצאות — fallback חיפוש מילה-מילה.
- **חיפוש אנגלי:** ישירות ל-AniList.
- מחזיר רק `TV` ו-`TV_SHORT` (לא סרטים/OVA).

### `GET /api/seasons?id=`
- מקבל AniList ID של עונה כלשהי בסדרה.
- מחזיר **כל** עונות הסדרה (prequel + sequel) ממוינות לפי שנה.
- מוגבל ל-20 עונות כדי למנוע לולאה אינסופית.

### `POST /api/track`
```json
{ "anilistId": 123, "title": "...", "coverImage": "..." }
```
- בודק אם כבר קיים → מחזיר existing.
- יוצר TrackedAnime ושומר סיקוולים ידועים כ-KnownSequel (כדי שלא יתריע עליהם בעתיד).

### `DELETE /api/track?anilistId=`
- מוחק TrackedAnime (KnownSequel נמחק ב-cascade).

### `GET /api/tracked`
- מחזיר כל TrackedAnime ממוין `trackedAt DESC`.

### `POST /api/check-updates`
- עובר על כל המעוקבות.
- לכל אנימה קורא `getAnimeSequels` מ-AniList.
- סיקוול חדש (לא ב-KnownSequel) + סטטוס `RELEASING` או `NOT_YET_RELEASED` + לא נשלחה כבר הודעה → שולח מייל ורושם ב-SentNotification.
- delay 700ms בין כל קריאה (rate limit AniList).
- מחזיר `{ checked, notified, errors, notifications }`.

---

## לוגיקת UI — כללים חשובים

### חיפוש (SearchBar)
- Debounce 400ms
- ביטול בקשות in-flight (AbortController) — תוצאות ישנות לא דורסות חדשות
- לחיצה על כרטיסייה פותחת AnimeDetailModal (לא מוסיפה ישירות!)

### AnimeDetailModal
- טוען את כל עונות הסדרה דרך `/api/seasons?id=`
- ברירת מחדל: העונה שנלחצה (לא בהכרח עונה 1)
- אפשר לשנות בחירה לפני האישור
- **חוק עונות:** כשמסמנים עונה — כל עונה אחרת מאותה הסדרה שכבר במעקב **מוסרת אוטומטית**. כך מניחים שהמשתמש ראה עד העונה שבחר.
- אם עונה אחרת כבר במעקב — מוצגת אזהרה כתומה `⚠️ עונה אחרת מהסדרה כבר במעקב — תוחלף בבחירה החדשה`
- כפתור disabled אם העונה הנבחרת כבר במעקב

### רשימת מעוקבות (TrackedList)
- גריד רספונסיבי: 2 עמודות → 3 → 4 → 5
- מציג: תמונה, כותרת, תאריך מעקב (עברית), כפתור הסרה
- אם ריקה: הודעה "עדיין לא עוקב אחרי אנימות"

### Toasts
- מוצגים בפינה ימנית תחתית
- נעלמים אחרי 4 שניות
- צבעים: ירוק = success, אדום = error, אפור = info

### כפתור "בדוק עדכונים"
- מושבת כשאין אנימות במעקב או כשבדיקה רצה
- מציג ⟳ מסתובב בזמן בדיקה
- לאחר בדיקה: toast עם מספר עדכונים שנמצאו

---

## Cron — בדיקה יומית

`server.js` מריץ cron בכל יום בשעה **09:00 שעון ירושלים** שקורא ל-`POST /api/check-updates`.

---

## עיצוב וסגנון

- **שפה:** ממשק בעברית מלא, dir="rtl"
- **טקסט מזהה אנימה:** english ?? romaji (עברית לא מוצגת)
- **צבעי ברירת מחדל:** רקע `#0f0f1a` (כחול-שחור כהה), כרטיסיות `gray-800`, הדגשה `pink-500`
- **אין next/image** — משתמשים ב-`<img>` רגיל (AniList CDN)

---

## נקודות שימו לב בתיקון באגים

1. **חיפוש עברי** — לוגיקה ב-`app/api/search/route.ts` + `lib/translate.ts`. תרגום דרך `translate.googleapis.com` (לא API מוסמך).
2. **עונות** — `getAllSeasons` ב-`lib/anilist.ts` עושה traversal של PREQUEL+SEQUEL, מוגבל ל-20 nodes.
3. **כפילויות נוטיפיקציה** — `SentNotification.sequelAnilistId` הוא unique, מגן מפני כפל מיילים.
4. **החלפת עונה** — הלוגיקה ב-`handleTrack` ב-`app/page.tsx` (שורות 61-87): מוחק קודם עונות אחרות מאותה הסדרה.
5. **Rate limit** — `delay(700)` ב-check-updates; `getAllSeasons` לא מושהה — לא לקרוא ל-getAllSeasons בלולאה על הרבה אנימות.
