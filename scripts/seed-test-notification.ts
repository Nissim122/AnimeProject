/**
 * מכין את ה-DB לבדיקת התראה אמיתית:
 * מוסיף Re:ZERO Season 3 למעקב ללא KnownSequel,
 * כך שה-check-updates ימצא את Season 4 (RELEASING) וישלח מייל.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SEASON3_ID = 163134
const SEASON3_TITLE = 'Re:ZERO -Starting Life in Another World- Season 3'
const SEASON3_COVER =
  'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx163134-yieRFbvUOH9a.jpg'
const SEASON4_ID = 189046

async function main() {
  console.log('--- מכין סביבת בדיקה ---\n')

  // נקה TrackedAnime קיים אם יש (cascade מוחק KnownSequel)
  const existing = await prisma.trackedAnime.findUnique({ where: { anilistId: SEASON3_ID } })
  if (existing) {
    await prisma.trackedAnime.delete({ where: { anilistId: SEASON3_ID } })
    console.log('✓ הוסר TrackedAnime קיים ל-Season 3')
  }

  // נקה SentNotification ל-Season 4 (MONTH_START + DAY_BEFORE) אם קיים
  const deleted = await prisma.sentNotification.deleteMany({
    where: { sequelAnilistId: SEASON4_ID },
  })
  if (deleted.count > 0) {
    console.log(`✓ הוסרו ${deleted.count} SentNotification קיימות ל-Season 4`)
  }

  // הוסף Season 3 למעקב ישירות — ללא KnownSequel!
  await prisma.trackedAnime.create({
    data: {
      anilistId: SEASON3_ID,
      title: SEASON3_TITLE,
      coverImage: SEASON3_COVER,
    },
  })
  console.log('✓ נוסף TrackedAnime: Re:ZERO Season 3 (ללא KnownSequel)')
  console.log('\n✅ מוכן! עכשיו לחץ "בדוק עדכונים" באפליקציה.')
  console.log('   המערכת תמצא את Season 4 (RELEASING) ותשלח מייל ל-nisimelec77@gmail.com')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
