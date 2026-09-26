import { chromium } from 'playwright-core';

const baseURL = process.env.NAVIRA_BASE_URL || 'http://localhost:5180';
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

const operator = {
  id: 'visual-audit-operator',
  name: 'Visual Audit Operator',
  email: 'audit@navira.test',
  role: 'operator',
  organization: 'NAVIRA Response Office',
  signedInAt: new Date().toISOString(),
};

const routes = [
  ['command', '/app/command'],
  ['map', '/app/map'],
  ['events', '/app/events'],
  ['timeline', '/app/timeline'],
  ['analytics', '/app/analytics'],
  ['news', '/app/news'],
  ['local-map', '/app/local-map'],
  ['requests', '/app/requests'],
  ['evacuation', '/app/evacuation'],
  ['dispatch', '/app/dispatch'],
  ['resources', '/app/resources'],
  ['infrastructure', '/app/infrastructure'],
  ['simulation', '/app/simulation'],
  ['safety', '/safety'],
];

const report = [];
const errors = [];

async function makePage(width, height, authenticated = false) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (authenticated) {
    await page.addInitScript((profile) => {
      window.localStorage.setItem('navira-session-v1', JSON.stringify(profile));
    }, operator);
  }
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });
  return page;
}

async function inspect(page, name, path, screenshot, fullPage = false) {
  await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(path.includes('simulation') || path.includes('infrastructure') ? 2400 : 1300);
  await page.screenshot({ path: `qa/${screenshot}`, fullPage, animations: 'disabled' });
  const measurements = await page.evaluate(() => {
    const root = document.documentElement;
    const buttons = [...document.querySelectorAll('button, a')].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    });
    return {
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim() || null,
      overflow: root.scrollWidth - root.clientWidth,
      smallTargets: buttons.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 40 || rect.height < 40;
      }).length,
    };
  });
  report.push({ name, ...measurements });
}

const landing = await makePage(1440, 1000);
await inspect(landing, 'landing-desktop', '/', 'signal-foundry-landing-desktop.png');
await landing.close();

const login = await makePage(1440, 1000);
await inspect(login, 'login-desktop', '/login?role=operator', 'signal-foundry-login-desktop.png');
await login.close();

const desktop = await makePage(1440, 1000, true);
for (const [name, path] of routes) {
  await inspect(desktop, `${name}-desktop`, path, `signal-foundry-${name}-desktop.png`);
}
await desktop.close();

const mobileLanding = await makePage(390, 844);
await inspect(mobileLanding, 'landing-mobile', '/', 'signal-foundry-landing-mobile.png');
await mobileLanding.close();

const mobile = await makePage(390, 844, true);
for (const [name, path] of [['command', '/app/command'], ['safety', '/safety'], ['simulation', '/app/simulation']]) {
  await inspect(mobile, `${name}-mobile`, path, `signal-foundry-${name}-mobile.png`);
}
await mobile.close();

await browser.close();
console.log(JSON.stringify({ report, errors: [...new Set(errors)] }, null, 2));
if (report.some((item) => item.overflow > 0) || errors.length) process.exitCode = 1;
