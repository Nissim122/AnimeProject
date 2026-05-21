-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SentNotification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sequelAnilistId" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MONTH_START',
    "sequelTitle" TEXT NOT NULL,
    "parentTitle" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_SentNotification" ("id", "parentTitle", "sentAt", "sequelAnilistId", "sequelTitle") SELECT "id", "parentTitle", "sentAt", "sequelAnilistId", "sequelTitle" FROM "SentNotification";
DROP TABLE "SentNotification";
ALTER TABLE "new_SentNotification" RENAME TO "SentNotification";
CREATE UNIQUE INDEX "SentNotification_sequelAnilistId_type_key" ON "SentNotification"("sequelAnilistId", "type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
