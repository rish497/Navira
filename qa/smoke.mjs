import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const baseURL = process.env.NAVIRA_BASE_URL || 'http://localhost:5180';
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
const resourceFailures = [];
page.on('console', message => {
  if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
});
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (response.status() >= 400) resourceFailures.push(`${response.status()} ${response.url()}`);
});

const liveResponse = page.waitForResponse(response => response.url().includes('/api/live-events') && response.status() === 200);
await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
const payload = await (await liveResponse).json();
if (!payload.events.length) throw new Error('No live events returned');
for (const id of ['gdacs', 'usgs']) {
  if (payload.sources.find(source => source.id === id)?.status !== 'available') throw new Error(`${id} is unavailable`);
}

await page.locator('.maplibregl-canvas').first().waitFor({ state: 'visible', timeout: 30000 });
await page.locator('.map-loading').waitFor({ state: 'hidden', timeout: 30000 });
await page.getByRole('heading', { name: 'Know the danger. Find your way out.' }).waitFor();
await page.getByRole('link', { name: /Open NAVIRA/ }).click();
await page.waitForURL('**/login?role=civilian');
await page.getByLabel('Full name').fill('Smoke Test Civilian');
await page.getByLabel('Email address').fill('smoke@example.test');
await page.getByRole('button', { name: /Continue to NAVIRA/ }).click();
await page.waitForURL('**/app/command');
await page.goto(`${baseURL}/safety`, { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'Find a verified way out.' }).waitFor();
await page.goto(`${baseURL}/app/map`, { waitUntil: 'networkidle' });
await page.locator('.maplibregl-canvas').waitFor({ state: 'visible', timeout: 30000 });
await page.locator('.map-loading').waitFor({ state: 'hidden', timeout: 30000 });
await page.getByText('Official evacuation routes').waitFor();
await page.getByText('Data unavailable').first().waitFor();

const gdacsEvent = payload.events.find(event => event.gdacsKey);
await page.getByRole('link', { name: 'Command', exact: true }).click();
await page.waitForURL('**/app/command');
await page.locator('.event-list button').filter({ hasText: gdacsEvent.title }).first().click();
await page.getByText('Source geometry').waitFor({ timeout: 30000 });

await page.getByRole('link', { name: 'Event ledger' }).click();
await page.waitForURL('**/app/events');
await page.locator('.event-list button').nth(1).click();
await page.getByText('Values are displayed as published').waitFor();

await page.getByRole('link', { name: 'News context' }).click();
await page.waitForURL('**/app/news');
await page.getByText(/Reporting context for/i).waitFor();
await page.getByText(/separate from agency-verified incident facts/i).waitFor();

await page.getByRole('link', { name: 'Evacuation' }).click();
await page.getByRole('heading', { name: 'Your verified evacuation routes' }).waitFor();
await page.getByRole('link', { name: /Plan an escape route/ }).waitFor();

const text = await page.locator('body').innerText();
for (const fabricated of ['NV-2841', 'Cyclone Varuna', 'Southbank / Pier 8', 'North Reach']) {
  if (text.includes(fabricated)) throw new Error(`Fabricated legacy content remains: ${fabricated}`);
}

await page.goto(`${baseURL}/app/map`, { waitUntil: 'networkidle' });
await page.locator('.map-loading').waitFor({ state: 'hidden', timeout: 30000 });
await page.screenshot({ path: 'qa/live-map-desktop.png', fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
await page.locator('.map-loading').waitFor({ state: 'hidden', timeout: 30000 });
await page.screenshot({ path: 'qa/live-landing-mobile.png', fullPage: true });
await page.goto(`${baseURL}/app/map`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Open navigation' }).click();
await page.locator('.side-navigation.is-open').waitFor();
await page.getByRole('link', { name: 'Analytics' }).click();
await page.waitForURL('**/app/analytics');
await page.getByRole('heading', { name: 'Observed event analysis' }).waitFor();
await page.screenshot({ path: 'qa/live-app-mobile.png', fullPage: true });

console.log(JSON.stringify({
  status: errors.length || resourceFailures.some(entry => entry.includes(`${baseURL}/api/`)) ? 'failed' : 'passed',
  eventCount: payload.events.length,
  sources: payload.sources.map(source => ({ id: source.id, status: source.status, count: source.count })),
  errors,
  resourceFailures,
}, null, 2));
await browser.close();
if (errors.length || resourceFailures.some(entry => entry.includes(`${baseURL}/api/`))) process.exit(1);
