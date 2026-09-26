import { chromium } from 'playwright-core';
import { pointOnFeature } from '@turf/turf';

const baseURL = process.env.NAVIRA_BASE_URL || 'http://localhost:5180';
const live = await (await fetch(`${baseURL}/api/live-events`)).json();
const target = live.events.find((event) => event.gdacsKey && event.country === 'China') || live.events.find((event) => event.gdacsKey);
if (!target) throw new Error('No GDACS event is available for the safety-flow check');
const boundaryQuery = new URLSearchParams(target.gdacsKey);
const boundaryPayload = await (await fetch(`${baseURL}/api/gdacs-geometry?${boundaryQuery}`)).json();
const boundaryFeature = boundaryPayload.data?.features?.find((feature) => ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type));
if (!boundaryFeature) throw new Error('The selected GDACS event has no polygon geometry');
const [longitude, latitude] = pointOnFeature(boundaryFeature).geometry.coordinates;

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const consoleErrors = [];

async function openSafety(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, geolocation: { longitude, latitude }, permissions: ['geolocation'] });
  const page = await context.newPage();
  await page.addInitScript(() => window.localStorage.setItem('navira-session-v1', JSON.stringify({ id: 'qa-safety-user', name: 'QA Safety User', email: 'safety@example.test', role: 'civilian', organization: null, signedInAt: new Date().toISOString() })));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto(`${baseURL}/safety`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Near you/i }).click();
  await page.getByText('Location available on this device').waitFor({ timeout: 15000 });
  await page.locator('.nearby-hazards__list button').filter({ hasText: target.title }).first().click();
  await page.getByText('Inside verified warning area').waitFor({ timeout: 30000 });
  return { context, page };
}

const desktop = await openSafety({ width: 1440, height: 1000 });
await desktop.page.screenshot({ path: 'qa/safety-desktop.png', animations: 'disabled' });
await desktop.page.getByRole('button', { name: /Plan escape route/i }).click();
await desktop.page.getByLabel('Destination name or address').fill('Chengdu China');
await desktop.page.getByRole('button', { name: 'Search' }).click();
await desktop.page.locator('.destination-results button').first().click();
await desktop.page.getByRole('button', { name: /Compare real road routes/i }).click();
await desktop.page.locator('.route-ledger').waitFor({ timeout: 45000 });
await desktop.page.getByText('Why it differs', { exact: true }).first().waitFor();
if (await desktop.page.locator('.route-role--safer').count()) await desktop.page.getByText(/Safer · lower exposure/i).waitFor();
else await desktop.page.locator('.route-comparison__notice').waitFor();
await desktop.page.screenshot({ path: 'qa/safety-routes-desktop.png', animations: 'disabled' });
await desktop.context.close();

const mobile = await openSafety({ width: 390, height: 844 });
await mobile.page.screenshot({ path: 'qa/safety-mobile.png', animations: 'disabled' });
const dimensions = await mobile.page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
await mobile.context.close();

await browser.close();
console.log(JSON.stringify({ target: target.title, location: [longitude, latitude], dimensions, consoleErrors }, null, 2));
if (consoleErrors.length || dimensions.page > dimensions.viewport) process.exit(1);
