# הגדרת שליחת מייל (Gmail)

## שלב 1 — הפעל אימות דו-שלבי ב-Gmail

1. עבור לכתובת: https://myaccount.google.com/security
2. לחץ על "אימות דו-שלבי" והפעל אם לא מופעל

## שלב 2 — צור App Password

1. עבור לכתובת: https://myaccount.google.com/apppasswords
2. בשדה "Select app" בחר **Mail**
3. בשדה "Select device" בחר **Other** ורשום "Anime Tracker"
4. לחץ **Generate**
5. תקבל סיסמה בת 16 תווים (כמו: `abcd efgh ijkl mnop`)

## שלב 3 — עדכן את קובץ `.env.local`

פתח את הקובץ `.env.local` ומלא:

```
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=abcdefghijklmnop    # ← הסיסמה שקיבלת (ללא רווחים)
NOTIFY_EMAIL=your_email@gmail.com
```

## בדיקה

הרץ את האפליקציה ולחץ **"בדוק עדכונים"** — אם יש עונה חדשה לאנימה שעוקב אחריה,
תקבל מייל. אפשר לבדוק בצורה ישירה:

```
POST http://localhost:3000/api/check-updates
```

## פתרון בעיות נפוצות

| שגיאה | פתרון |
|-------|--------|
| `Invalid login` | בדוק שה-App Password נכון (ללא רווחים) |
| `Less secure app blocked` | חייב App Password, לא סיסמה רגילה |
| מייל לא מגיע | בדוק תיקיית Spam |
