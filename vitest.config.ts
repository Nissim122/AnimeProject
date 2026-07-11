/**
 * Vitest configuration with named projects per source domain.
 *
 * Run a single project:   npx vitest run --project lib
 * Run multiple:           npx vitest run --project lib --project api-track
 * Run all:                npm test
 *
 * The pre-commit hook uses `vitest related <files>` to auto-detect which
 * projects are affected by staged changes and run only those.
 */

import { defineConfig } from 'vitest/config'
import path from 'path'

const alias = { '@': path.resolve(__dirname, '.') }

export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'node',
    projects: [
      // ─── lib/* ───────────────────────────────────────────────────────────
      // AniList client, mailer, translation, caches, title utilities
      {
        resolve: { alias },
        test: {
          name: 'lib',
          environment: 'node',
          include: [
            '__tests__/anilist.test.ts',
            '__tests__/mailer.test.ts',
            '__tests__/translate.test.ts',
            '__tests__/titleUtils.test.ts',
            '__tests__/seasonCache.test.ts',
            '__tests__/statusCache.test.ts',
          ],
        },
      },

      // ─── api/track & api/tracked ─────────────────────────────────────────
      {
        resolve: { alias },
        test: {
          name: 'api-track',
          environment: 'node',
          include: ['__tests__/track.test.ts', '__tests__/tracked.test.ts'],
        },
      },

      // ─── api/watchlist ───────────────────────────────────────────────────
      {
        resolve: { alias },
        test: { name: 'api-watchlist', environment: 'node', include: ['__tests__/watchlist.test.ts'] },
      },

      // ─── api/onhold ──────────────────────────────────────────────────────
      {
        resolve: { alias },
        test: { name: 'api-onhold', environment: 'node', include: ['__tests__/onhold.test.ts'] },
      },

      // ─── api/search ──────────────────────────────────────────────────────
      {
        resolve: { alias },
        test: { name: 'api-search', environment: 'node', include: ['__tests__/search.test.ts'] },
      },

      // ─── api/seasons ─────────────────────────────────────────────────────
      {
        resolve: { alias },
        test: { name: 'api-seasons', environment: 'node', include: ['__tests__/seasons.test.ts'] },
      },

      // ─── api/next-seasons ────────────────────────────────────────────────
      {
        resolve: { alias },
        test: { name: 'api-next-seasons', environment: 'node', include: ['__tests__/next-seasons.test.ts'] },
      },

      // ─── api/airing-schedule ─────────────────────────────────────────────
      {
        resolve: { alias },
        test: { name: 'api-airing', environment: 'node', include: ['__tests__/airing-schedule.test.ts'] },
      },

      // ─── api/check-updates ───────────────────────────────────────────────
      // Monthly consolidated email + multi-generation sequel discovery
      {
        resolve: { alias },
        test: { name: 'api-check-updates', environment: 'node', include: ['__tests__/check-updates.test.ts'] },
      },

      // ─── api/check-episode-releases ──────────────────────────────────────
      {
        resolve: { alias },
        test: { name: 'api-check-episodes', environment: 'node', include: ['__tests__/check-episode-releases.test.ts'] },
      },

      // ─── api/refresh-season-cache ────────────────────────────────────────
      // Weekly cron: clears + refills status + season caches
      {
        resolve: { alias },
        test: { name: 'api-cache-refresh', environment: 'node', include: ['__tests__/refresh-season-cache.test.ts'] },
      },

      // ─── api/admin/approve & deny ────────────────────────────────────────
      // HMAC-signed email links for user access approval
      {
        resolve: { alias },
        test: {
          name: 'api-admin',
          environment: 'node',
          include: ['__tests__/admin-approve.test.ts', '__tests__/admin-deny.test.ts'],
        },
      },

      // ─── components/TrackedList — categorize() ────────────────────────────
      // Category bucketing logic (available/watching/releasing/upcoming/completed/error)
      {
        resolve: { alias },
        test: { name: 'components-tracked-list', environment: 'node', include: ['__tests__/TrackedList.test.ts'] },
      },
    ],
  },
})
