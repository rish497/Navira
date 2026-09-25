import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

const routes = process.env.ROUTES?.split(',') || ['command', 'map', 'incidents', 'evacuation', 'dispatch', 'resources', 'infrastructure', 'simulation', 'timeline', 'analytics', 'civilian'];
const report = [];
for (const width of [390, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  for (const route of routes) {
    await page.goto(`http://localhost:5180/app/${route}`, { waitUntil: 'networkidle' });
    const measurements = await page.evaluate(() => {
      const visibleButtons = [...document.querySelectorAll('button')].filter(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      });
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        smallButtons: visibleButtons.filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        }).map(element => ({ name: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 40), width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height) })),
      };
    });
    report.push({ width, route, ...measurements });
  }
  report.push({ width, errors });
  await page.close();
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
