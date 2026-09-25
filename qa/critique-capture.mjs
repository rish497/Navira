import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

const routes = [
  ['landing', '/', 1440, 1000, true],
  ['landing-mobile', '/', 390, 844, true],
  ['command', '/app/command', 1440, 1000, false],
  ['command-mobile', '/app/command', 390, 844, false],
  ['map', '/app/map', 1440, 1000, false],
  ['incidents', '/app/incidents', 1440, 1000, false],
  ['evacuation', '/app/evacuation', 1440, 1000, false],
  ['dispatch', '/app/dispatch', 1440, 1000, false],
  ['resources', '/app/resources', 1440, 1000, false],
  ['infrastructure', '/app/infrastructure', 1440, 1000, false],
  ['simulation', '/app/simulation', 1440, 1000, false],
  ['timeline', '/app/timeline', 1440, 1000, false],
  ['analytics', '/app/analytics', 1440, 1000, false],
  ['civilian', '/app/civilian', 1440, 1000, false],
];

for (const [name, route, width, height, fullPage] of routes) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:5180${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `.impeccable/critique-evidence/${name}.png`, fullPage, animations: 'disabled' });
  const geometry = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  console.log(name, JSON.stringify(geometry));
  await page.close();
}

await browser.close();
