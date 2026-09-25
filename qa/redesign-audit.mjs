import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const errors = [];
const report = {};

async function inspect(name, route, width, height, screenshot, fullPage = false) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  await page.goto(`http://localhost:5180${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  if (await page.locator('.maplibregl-canvas').count()) {
    await page.locator('.maplibregl-canvas').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('.map-loading').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  }
  await page.screenshot({ path: `qa/${screenshot}`, fullPage, animations: 'disabled' });
  report[name] = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    h1: document.querySelector('h1')?.textContent?.trim(),
  }));
  return page;
}

const desktopLanding = await inspect('desktopLanding', '/', 1440, 1000, 'redesign-landing-desktop.png');
await desktopLanding.getByRole('heading', { name: 'Know the danger. Find your way out.' }).waitFor();
await desktopLanding.locator('.response-system').screenshot({ path: 'qa/redesign-response-desktop.png', animations: 'disabled' });
await desktopLanding.locator('.trust-system').screenshot({ path: 'qa/redesign-trust-desktop.png', animations: 'disabled' });
await desktopLanding.getByRole('link', { name: 'Check the live map' }).click();
await desktopLanding.waitForURL('**/app/map');
await desktopLanding.locator('.maplibregl-canvas').waitFor({ state: 'visible', timeout: 30000 });
await desktopLanding.locator('.module-navigation').waitFor({ state: 'visible' });
await desktopLanding.screenshot({ path: 'qa/redesign-map-desktop.png', animations: 'disabled' });
report.desktopMap = await desktopLanding.evaluate(() => ({
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  mapWidth: Math.round(document.querySelector('.map-workspace')?.getBoundingClientRect().width || 0),
  navVisible: getComputedStyle(document.querySelector('.module-navigation')).display !== 'none',
}));
await desktopLanding.close();

const mobileLanding = await inspect('mobileLanding', '/', 390, 844, 'redesign-landing-mobile.png');
await mobileLanding.getByRole('heading', { name: 'Know the danger. Find your way out.' }).waitFor();
await mobileLanding.close();

const mobileMap = await inspect('mobileMap', '/app/map', 390, 844, 'redesign-map-mobile.png');
await mobileMap.getByRole('button', { name: 'Open navigation' }).click();
await mobileMap.locator('.side-navigation.is-open').waitFor();
await mobileMap.getByRole('link', { name: 'Analytics' }).click();
await mobileMap.waitForURL('**/app/analytics');
await mobileMap.getByRole('heading', { name: 'Observed event analysis' }).waitFor();
await mobileMap.screenshot({ path: 'qa/redesign-analytics-mobile.png', fullPage: true, animations: 'disabled' });
report.mobileNavigation = { route: new URL(mobileMap.url()).pathname, drawerClosed: !(await mobileMap.locator('.side-navigation').evaluate(node => node.classList.contains('is-open'))) };
await mobileMap.close();

await browser.close();
console.log(JSON.stringify({ report, errors }, null, 2));
if (errors.length || Object.values(report).some(item => item.horizontalOverflow)) process.exit(1);
