import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

const captures = [
  ['landing-desktop-final.png', '/', 1440, 1000],
  ['landing-mobile-final.png', '/', 390, 844],
  ['command-mobile-final.png', '/app/command', 390, 844],
  ['map-desktop.png', '/app/map', 1440, 1000],
  ['incidents-desktop.png', '/app/incidents', 1440, 1000],
  ['simulation-desktop.png', '/app/simulation', 1440, 1000],
  ['civilian-desktop.png', '/app/civilian', 1440, 1000],
];

for (const [name, route, width, height] of captures) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:5180${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    title: document.title,
  }));
  await page.screenshot({ path: `qa/${name}`, animations: 'disabled' });
  console.log(name, JSON.stringify(dimensions));
  await page.close();
}

await browser.close();
