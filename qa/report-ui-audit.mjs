import { chromium } from 'playwright-core';

const baseURL = process.env.NAVIRA_BASE_URL || 'http://localhost:5180';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, geolocation: { longitude: 77.5946, latitude: 12.9716 }, permissions: ['geolocation'] });
const errors = [];
const civilian = { id: 'report-ui-civilian', name: 'Report UI Civilian', email: 'report-ui@navira.test', role: 'civilian', organization: null, signedInAt: new Date().toISOString() };
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript((profile) => localStorage.setItem('navira-session-v1', JSON.stringify(profile)), civilian);
await page.goto(`${baseURL}/app/requests`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Check your location first/i }).click();
await page.getByRole('dialog').waitFor();
await page.getByText('Show operators what you can see.').waitFor();
await page.getByRole('button', { name: 'Submit image' }).waitFor();
await page.screenshot({ path: 'qa/incident-report-popup.png', fullPage: true, animations: 'disabled' });
await page.getByRole('button', { name: 'Close image report' }).click();

await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: /Check your location first/i }).click();
const dialogBounds = await page.getByRole('dialog').boundingBox();
if (!dialogBounds || dialogBounds.width > 390 || dialogBounds.height > 844) throw new Error('Image report dialog exceeds the mobile viewport');
await page.screenshot({ path: 'qa/incident-report-popup-mobile.png', animations: 'disabled' });
await page.getByRole('button', { name: 'Close image report' }).click();
await page.setViewportSize({ width: 1280, height: 900 });

await page.goto(`${baseURL}/safety`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Near you/i }).click();
await page.getByText(/12\.97160°/).waitFor({ timeout: 20000 });
await page.getByRole('heading', { name: 'Select a hazard' }).waitFor();

const operatorPage = await context.newPage();
const operator = { id: 'report-ui-operator', name: 'Report UI Operator', email: 'operator-ui@navira.test', role: 'operator', organization: 'Response Office', signedInAt: new Date().toISOString() };
await operatorPage.addInitScript((profile) => localStorage.setItem('navira-session-v1', JSON.stringify(profile)), operator);
await operatorPage.route('**/api/operations', async (route) => {
  if (route.request().method() !== 'GET') return route.continue();
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    helpRequests: [], locations: [], dispatches: [], resources: [], allocations: [], infrastructure: [], simulations: [], evacuations: [], communityEvents: [], notifications: [],
    incidentReports: [{ id: 'visual-report', userId: 'civilian-visual', userName: 'Civilian report', disasterType: 'Flood', details: 'Water rising across the visible road.', imageData: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4MDAgNTAwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjUwMCIgZmlsbD0iIzY4NzM3YSIvPjxwYXRoIGQ9Ik0wIDMyMGg4MDB2MTgwSDB6IiBmaWxsPSIjMTgyODMwIi8+PC9zdmc+', longitude: 77.5946, latitude: 12.9716, accuracy: 14, status: 'pending-review', createdAt: new Date().toISOString() }],
    updatedAt: new Date().toISOString(),
  }) });
});
await operatorPage.goto(`${baseURL}/app/command`, { waitUntil: 'networkidle' });
if (await operatorPage.getByRole('link', { name: 'Live disaster map', exact: true }).count()) throw new Error('Operator sidebar still contains Live disaster map');
if (await operatorPage.getByRole('link', { name: 'Infrastructure', exact: true }).count()) throw new Error('Operator sidebar still contains Infrastructure');
await operatorPage.getByRole('link', { name: 'People + hazards', exact: true }).waitFor();
await operatorPage.getByRole('link', { name: 'People + hazards', exact: true }).click();
await operatorPage.getByRole('button', { name: /Flood Civilian report/ }).click();
await operatorPage.getByRole('button', { name: 'Natural disaster' }).waitFor();
await operatorPage.screenshot({ path: 'qa/operator-image-review.png', fullPage: true, animations: 'disabled' });

console.log(JSON.stringify({ status: errors.length ? 'failed' : 'passed', errors }, null, 2));
await browser.close();
if (errors.length) process.exit(1);
