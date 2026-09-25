import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('http://localhost:5180/app/map', { waitUntil: 'networkidle' });
await page.locator('.maplibregl-canvas').waitFor({ state: 'visible', timeout: 30000 });

const routeMotion = await page.locator('.workspace-view').evaluate(node => {
  const style = getComputedStyle(node);
  return { name: style.animationName, duration: style.animationDuration };
});
if (routeMotion.name !== 'workspace-enter' || routeMotion.duration !== '0.18s') throw new Error(`Unexpected route motion: ${JSON.stringify(routeMotion)}`);

const layer = page.locator('.map-layer-panel > button').first();
await layer.click();
await page.waitForTimeout(170);
const layerState = await layer.locator('i').evaluate(node => {
  const style = getComputedStyle(node);
  return { opacity: style.opacity, transform: style.transform };
});
if (Number(layerState.opacity) > 0.5 || layerState.transform === 'none') throw new Error(`Layer state motion did not settle: ${JSON.stringify(layerState)}`);

await page.getByRole('button', { name: 'Close details' }).click();
await page.locator('.event-detail--closing').waitFor({ state: 'attached', timeout: 1000 });
const exitMotion = await page.locator('.event-detail--closing').evaluate(node => ({
  name: getComputedStyle(node).animationName,
  duration: getComputedStyle(node).animationDuration,
}));
if (exitMotion.name !== 'panel-exit' || exitMotion.duration !== '0.18s') throw new Error(`Unexpected panel exit: ${JSON.stringify(exitMotion)}`);
await page.waitForTimeout(260);
if (await page.locator('.event-detail').count()) throw new Error('Detail panel did not unmount after exit');

await page.getByRole('link', { name: 'Analytics', exact: true }).click();
await page.waitForURL('**/app/analytics');
await page.getByRole('heading', { name: 'Observed event analysis' }).waitFor();
const routedMotion = await page.locator('.workspace-view').evaluate(node => {
  const style = getComputedStyle(node);
  return { name: style.animationName, duration: style.animationDuration, opacity: style.opacity, transform: style.transform };
});
if (routedMotion.name !== 'workspace-enter') throw new Error(`Route animation missing after navigation: ${JSON.stringify(routedMotion)}`);
await page.close();

const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
await reduced.goto('http://localhost:5180/app/analytics', { waitUntil: 'networkidle' });
const reducedMotion = await reduced.locator('.workspace-view').evaluate(node => {
  const style = getComputedStyle(node);
  return { name: style.animationName, duration: style.animationDuration };
});
if (reducedMotion.name !== 'reduced-fade-in' || reducedMotion.duration !== '0.1s') throw new Error(`Reduced motion mismatch: ${JSON.stringify(reducedMotion)}`);
await reduced.close();

await browser.close();
console.log(JSON.stringify({ routeMotion, layerState, reducedMotion, status: 'passed' }, null, 2));
