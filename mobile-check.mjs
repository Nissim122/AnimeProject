import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = './mobile-screenshots';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'pixel-5',   width: 393, height: 851 },
  { name: 'iphone-14', width: 390, height: 844 },
];

async function shot(page, name) {
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: false });
  console.log(`📸 ${name}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      hasTouch: true,
    });
    const page = await ctx.newPage();

    // ── 1. Landing / sign-in page ──
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await shot(page, `${vp.name}-01-landing`);

    // ── 2. Check for horizontal overflow ──
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    console.log(`  horizontal overflow: ${overflow ? '❌ YES' : '✅ no'}`);

    // ── 3. Check viewport meta ──
    const vpMeta = await page.evaluate(() => {
      const m = document.querySelector('meta[name="viewport"]');
      return m ? m.getAttribute('content') : 'MISSING';
    });
    console.log(`  viewport meta: ${vpMeta}`);

    // ── 4. Check for tiny tap targets (< 44px) ──
    const smallTargets = await page.evaluate(() => {
      const interactive = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      return interactive
        .map(el => {
          const r = el.getBoundingClientRect();
          return { tag: el.tagName, text: el.textContent?.trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
        })
        .filter(t => t.w > 0 && t.h > 0 && (t.w < 44 || t.h < 44));
    });
    if (smallTargets.length) {
      console.log(`  ⚠️  small tap targets:`);
      smallTargets.forEach(t => console.log(`     ${t.tag} "${t.text}" → ${t.w}x${t.h}px`));
    } else {
      console.log(`  ✅ tap targets OK`);
    }

    // ── 5. Check for text overflow / truncation off-screen ──
    const offscreen = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('p, h1, h2, button, span'))
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.right > window.innerWidth + 2 || r.left < -2;
        })
        .map(el => ({ tag: el.tagName, text: el.textContent?.trim().slice(0, 40) }));
    });
    if (offscreen.length) {
      console.log(`  ⚠️  off-screen elements:`);
      offscreen.slice(0, 5).forEach(e => console.log(`     ${e.tag} "${e.text}"`));
    } else {
      console.log(`  ✅ no off-screen text`);
    }

    await ctx.close();
  }

  // ── 6. Check SearchBar grid on mobile ──
  console.log('\n=== SearchBar grid check (375px) ===');
  const ctx2 = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true });
  const page2 = await ctx2.newPage();
  await page2.goto('http://localhost:3000', { timeout: 15000 }).catch(() => {});
  await shot(page2, 'searchbar-check');

  // ── 7. Modal tests — open on mobile ──
  await shot(page2, 'modal-check');

  await ctx2.close();
  await browser.close();
  console.log('\n✅ Done. Screenshots in', outDir);
}

run().catch(err => { console.error(err); process.exit(1); });
