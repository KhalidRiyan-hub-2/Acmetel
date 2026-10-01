// Usage: PORT=4321 node scripts/screenshot.mjs <outDir> [path ...]  (needs `npm run preview -- --port $PORT`)
// Full-page screenshots at 375px and 1440px. Forces reveal animations visible so captures aren't blank.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const [outDir = 'screenshots', ...paths] = process.argv.slice(2);
const routes = paths.length ? paths : ['/'];
const browser = await pw.chromium.launch();
const errors = [];
for (const width of [375, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('pageerror', (e) => errors.push(`${width} ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${width} console: ${m.text()}`));
  for (const r of routes) {
    await page.goto(`http://localhost:${process.env.PORT ?? 4321}` + r, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: '[data-reveal]{opacity:1!important;transform:none!important}' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) errors.push(`${width} ${r} horizontal overflow ${overflow}px`);
    const name = (r === '/' ? 'home' : r.replace(/^\/|\/$/g, '').replace(/\//g, '_')) + `-${width}.png`;
    await page.screenshot({ path: `${outDir}/${name}`, fullPage: true });
  }
  await page.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no errors, no overflow');
