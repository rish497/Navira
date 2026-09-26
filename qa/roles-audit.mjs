import { chromium } from 'playwright-core';
import { pointOnFeature } from '@turf/turf';

const baseURL = process.env.NAVIRA_BASE_URL || 'http://localhost:5175';
const actor = (id, role, name, organization = '') => ({
  'Content-Type': 'application/json',
  'X-Navira-User': id,
  'X-Navira-Role': role,
  'X-Navira-Name': encodeURIComponent(name),
  'X-Navira-Organization': encodeURIComponent(organization),
});
async function api(path, options = {}) {
  const response = await fetch(`${baseURL}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${body.error || response.status}`);
  return body;
}

const civilianHeaders = actor('qa-civilian', 'civilian', 'QA Civilian');
const operatorHeaders = actor('qa-operator', 'operator', 'QA Operator', 'QA Emergency Office');
const live = await api('/api/live-events');
let target;
let boundary;
for (const event of live.events.filter((item) => item.gdacsKey)) {
  const query = new URLSearchParams(event.gdacsKey);
  const candidate = await api(`/api/gdacs-geometry?${query}`).catch(() => null);
  const polygon = candidate?.data?.features?.find((feature) => ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type));
  if (polygon) { target = event; boundary = polygon; break; }
}
if (!target || !boundary) throw new Error('No live GDACS polygon was available for role-flow QA');
const [longitude, latitude] = pointOnFeature(boundary).geometry.coordinates;

await api('/api/operations/location', { method: 'POST', headers: civilianHeaders, body: JSON.stringify({ longitude, latitude, accuracy: 10 }) });
await api('/api/operations/help', { method: 'POST', headers: civilianHeaders, body: JSON.stringify({ eventId: target.id, longitude, latitude, need: 'QA medical assistance', people: 2, details: 'QA-only verified request' }) });
let operatorData = await api('/api/operations', { headers: operatorHeaders });
const request = operatorData.helpRequests.find((item) => item.userId === 'qa-civilian');
await api('/api/operations/dispatch', { method: 'POST', headers: operatorHeaders, body: JSON.stringify({ requestId: request.id, team: 'QA Response Team', capability: 'QA medical transport' }) });
await api('/api/operations/resource', { method: 'POST', headers: operatorHeaders, body: JSON.stringify({ name: 'QA Medical Kits', category: 'Medical', quantity: 12, unit: 'kits', base: 'QA Depot' }) });
operatorData = await api('/api/operations', { headers: operatorHeaders });
await api('/api/operations/allocation', { method: 'POST', headers: operatorHeaders, body: JSON.stringify({ resourceId: operatorData.resources[0].id, requestId: request.id, quantity: 3 }) });
await api('/api/operations/infrastructure', { method: 'POST', headers: operatorHeaders, body: JSON.stringify({ name: 'QA Emergency Clinic', type: 'Hospital', location: 'QA District', capacity: 40, unit: 'beds', status: 'operational' }) });
operatorData = await api('/api/operations', { headers: operatorHeaders });
await api('/api/operations/simulation', { method: 'POST', headers: operatorHeaders, body: JSON.stringify({ assetId: operatorData.infrastructure[0].id, scenario: 'QA surge comparison', scenarioLoad: 52, notes: 'QA-only deterministic capacity check' }) });

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });

await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Full name').fill('QA Civilian');
await page.getByLabel('Email address').fill('civilian@example.test');
await page.getByRole('button', { name: /Continue to NAVIRA/ }).click();
await page.waitForURL('**/app/command');
await page.getByRole('link', { name: 'Near you' }).waitFor();
if (await page.getByRole('link', { name: 'Dispatch' }).count()) throw new Error('Civilian navigation exposed operator dispatch');
await page.getByRole('button', { name: /Sign out/ }).click();
await page.waitForURL('**/login');

await page.getByRole('button', { name: /Operator/ }).click();
await page.getByLabel('Full name').fill('QA Operator');
await page.getByLabel('Email address').fill('operator@example.test');
await page.getByLabel('Government organization').fill('QA Emergency Office');
await page.getByRole('button', { name: /Continue to NAVIRA/ }).click();
await page.waitForURL('**/app/command');
for (const name of ['Local operations', 'Help requests', 'Evacuation', 'Dispatch', 'Resources', 'Infrastructure', 'Simulation']) await page.getByRole('link', { name }).waitFor();

await page.getByRole('link', { name: 'Local operations' }).click();
await page.getByText('People and hazards in one local picture').waitFor();
await page.locator('.maplibregl-canvas').waitFor({ timeout: 30000 });
await page.getByText('1 active help requests').waitFor();
await page.getByRole('link', { name: 'Dispatch' }).click();
await page.getByText('QA Response Team').waitFor();
await page.getByRole('link', { name: 'Resources' }).click();
await page.locator('.resource-board article strong').filter({ hasText: 'QA Medical Kits' }).first().waitFor();
await page.getByRole('link', { name: 'Infrastructure' }).click();
await page.getByText('QA Emergency Clinic').waitFor();
await page.getByRole('link', { name: 'Simulation' }).click();
await page.getByText('QA surge comparison').waitFor();
await page.getByRole('link', { name: 'Analytics' }).click();
await page.getByRole('textbox', { name: 'Analyze a location' }).waitFor();
await page.getByRole('link', { name: 'News context' }).click();
await page.getByRole('textbox', { name: 'Filter reporting by location' }).waitFor();
await page.screenshot({ path: 'qa/operator-workspace.png', fullPage: true, animations: 'disabled' });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${baseURL}/app/local-map`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Open navigation' }).click();
await page.locator('.side-navigation.is-open').waitFor();
const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
await page.screenshot({ path: 'qa/operator-mobile.png', fullPage: true, animations: 'disabled' });
await browser.close();

console.log(JSON.stringify({ event: target.title, location: [longitude, latitude], records: { requests: 1, dispatches: 1, resources: 1, allocations: 1, infrastructure: 1, simulations: 1 }, dimensions, errors }, null, 2));
if (errors.length || dimensions.page > dimensions.viewport) process.exit(1);
