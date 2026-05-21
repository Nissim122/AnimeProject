import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(20000);

await page.goto('http://localhost:3000');
await page.waitForLoadState('networkidle');

const input = await page.locator('input').first();
await input.fill('KonoSuba');
await page.waitForTimeout(2500);

await page.screenshot({ path: 'screenshot-search.png' });
console.log('Screenshot 1 (search) saved');

// Card is a div with onClick — click on any div containing KONOSUBA text
const card = page.locator('div').filter({ hasText: /KONOSUBA.*2016/ }).first();
const count = await card.count();
console.log('Found card:', count);

await card.click();
await page.waitForTimeout(6000); // wait for seasons API (multiple AniList calls)

await page.screenshot({ path: 'screenshot-modal.png' });
console.log('Screenshot 2 (modal) saved');

const modal = page.locator('.fixed').first();
const modalExists = await modal.count();
if (modalExists) {
  console.log('\n=== Modal text ===');
  console.log(await modal.innerText());
}

await browser.close();
