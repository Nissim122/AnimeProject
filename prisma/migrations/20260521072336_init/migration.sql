-- CreateTable
CREATE TABLE "TrackedAnime" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "anilistId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "coverImage" TEXT,
    "trackedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "KnownSequel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trackedAnimeId" INTEGER NOT NULL,
    "sequelAnilistId" INTEGER NOT NULL,
    CONSTRAINT "KnownSequel_trackedAnimeId_fkey" FOREIGN KEY ("trackedAnimeId") REFERENCES "TrackedAnime" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SentNotification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sequelAnilistId" INTEGER NOT NULL,
    "sequelTitle" TEXT NOT NULL,
    "parentTitle" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedAnime_anilistId_key" ON "TrackedAnime"("anilistId");

-- CreateIndex
CREATE UNIQUE INDEX "KnownSequel_trackedAnimeId_sequelAnilistId_key" ON "KnownSequel"("trackedAnimeId", "sequelAnilistId");

-- CreateIndex
CREATE UNIQUE INDEX "SentNotification_sequelAnilistId_key" ON "SentNotification"("sequelAnilistId");
