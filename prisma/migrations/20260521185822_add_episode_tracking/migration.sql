-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrackedAnime" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "anilistId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "coverImage" TEXT,
    "trackedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "watchedEpisodes" INTEGER NOT NULL DEFAULT 0,
    "totalEpisodes" INTEGER
);
INSERT INTO "new_TrackedAnime" ("anilistId", "coverImage", "id", "title", "trackedAt") SELECT "anilistId", "coverImage", "id", "title", "trackedAt" FROM "TrackedAnime";
DROP TABLE "TrackedAnime";
ALTER TABLE "new_TrackedAnime" RENAME TO "TrackedAnime";
CREATE UNIQUE INDEX "TrackedAnime_anilistId_key" ON "TrackedAnime"("anilistId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
