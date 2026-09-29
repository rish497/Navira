import path from 'node:path';
import { chromium } from 'playwright-core';

const baseURL = 'http://127.0.0.1:5196';
const output = path.resolve('artifacts/navira-hackathon-deck/build/screens');
const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const password = 'NaviraDeck2026';

async function register(context, profile) {
  const response = await context.request.post(`${baseURL}/api/auth/register`, {
    data: { ...profile, password },
  });
  if (!response.ok()) throw new Error(`Registration failed: ${await response.text()}`);
}

async function capture(page, file, route, options = {}) {
  await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(options.wait ?? 2_500);
  if (options.map) await page.locator('.maplibregl-canvas').first().waitFor({ timeout: 45_000 });
  await page.screenshot({
    path: path.join(output, file),
    animations: 'disabled',
    fullPage: false,
  });
}

const browser = await chromium.launch({ executablePath, headless: true });

const publicPage = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await capture(publicPage, '01-landing.png', '/', { wait: 4_000 });
await publicPage.close();

const civilian = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  geolocation: { longitude: 77.209, latitude: 28.6139 },
  permissions: ['geolocation'],
});
await register(civilian, {
  role: 'civilian',
  name: 'Rishabh Demo Civilian',
  email: `civilian-${Date.now()}@navira.demo`,
});
const civilianPage = await civilian.newPage();
await capture(civilianPage, '02-live-map.png', '/app/map', { map: true, wait: 4_000 });
await civilianPage.goto(`${baseURL}/app/local-map`, { waitUntil: 'domcontentloaded' });
await civilianPage.getByRole('button', { name: 'Use my location' }).click();
await civilianPage.getByText(/Location shared at/).waitFor({ timeout: 30_000 }).catch(() => civilianPage.waitForTimeout(3_000));
await civilianPage.screenshot({ path: path.join(output, '03-near-you.png'), animations: 'disabled' });
await civilianPage.goto(`${baseURL}/safety`, { waitUntil: 'domcontentloaded' });
await civilianPage.getByRole('button', { name: 'Use my location' }).first().click();
await civilianPage.getByText('Closest reviewed records').waitFor({ timeout: 45_000 });
await civilianPage.waitForTimeout(2_000);
await civilianPage.screenshot({ path: path.join(output, '04-civilian-safety.png'), animations: 'disabled' });
await civilian.close();

const operator = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await register(operator, {
  role: 'operator',
  name: 'Rishabh Demo Operator',
  email: `operator-${Date.now()}@navira.demo`,
  organization: 'Hackathon Emergency Operations',
});
await operator.request.post(`${baseURL}/api/operations/incident-create`, {
  data: {
    name: 'Delhi preparedness exercise',
    type: 'Flood preparedness exercise',
    geographicArea: 'Delhi NCR exercise area',
    severity: 'MODERATE',
    operationalPhase: 'READINESS',
    commandLead: 'Rishabh Mittal',
    operationalNotes: 'Hackathon demonstration record. No real emergency is represented.',
  },
});
const operatorPage = await operator.newPage();
await capture(operatorPage, '05-operator-command.png', '/app/command', { map: true, wait: 4_000 });
await capture(operatorPage, '06-people-hazards.png', '/app/local-map', { map: true, wait: 4_000 });
await capture(operatorPage, '07-incidents.png', '/app/incidents', { wait: 2_500 });
await capture(operatorPage, '08-audit.png', '/app/audit', { wait: 2_500 });
await capture(operatorPage, '09-analytics.png', '/app/analytics', { wait: 3_000 });
await capture(operatorPage, '10-news.png', '/app/news', { wait: 5_000 });
await capture(operatorPage, '11-simulation.png', '/app/simulation', { wait: 8_000 });
await operator.close();

await browser.close();
console.log('Captured NAVIRA product surfaces');
