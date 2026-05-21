import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(20000);

await page.goto('http://localhost:3000');
await page.waitForLoadState('networkidle');

// Search for KonoSuba
const input = await page.locator('input').first();
await input.fill('KonoSuba');
await page.waitForTimeout(2500);

await page.screenshot({ path: 'screenshot-search.png' });
console.log('Screenshot 1 saved');

// Log what's on screen
const body = await page.locator('body').innerText();
console.log('Page text snippet:', body.slice(0, 600));

// Find and click the בחר עונה button
const btn = page.locator('button').filter({ hasText: 'בחר עונה' }).first();
const btnCount = await btn.count();
console.log('Found בחר עונה buttons:', btnCount);

if (btnCount > 0) {
  await btn.click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'screenshot-modal.png' });
  console.log('Screenshot 2 saved (modal)');
  const modal = page.locator('.fixed').first();
  const modalExists = await modal.count();
  if (modalExists) {
    console.log('\n=== Modal text ===');
    console.log(await modal.innerText());
  }
}

await browser.close();
