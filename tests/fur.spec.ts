import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

type Stats = { fps: number; simMs: number; roots: number; shells: number; substeps: number; maxOffsetOverLength: number; combMax: number; nan: boolean; frames: number };
const metrics: Record<string, unknown> = {};
const stats = (p: Page) => p.evaluate(() => (window as unknown as { __fur: { stats: Stats } }).__fur.stats);
const run = (p: Page, js: string) => p.evaluate(js);

async function open(page: Page, errors: string[]) {
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?q=low');
  await page.waitForFunction(() => { const w = window as unknown as { __fur?: { stats: Stats } }; return !!w.__fur && w.__fur.stats.frames > 15; }, null, { timeout: 60_000 }); await page.waitForTimeout(3000);
}
// mean luminance variance of the WebGL canvas, to prove something rendered
const canvasVariance = (p: Page) => p.evaluate(() => {
  const src = document.querySelector('canvas') as HTMLCanvasElement; const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d')!; x.drawImage(src, 0, 0, 128, 128); const d = x.getImageData(0, 0, 128, 128).data;
  let s = 0, s2 = 0; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; s2 += l * l; } const n = d.length / 4; return s2 / n - (s / n) ** 2; });

test.afterAll(() => { fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/metrics.json', JSON.stringify(metrics, null, 2)); });

test('loads with no console errors and no GL errors', async ({ page }) => {
  const errors: string[] = []; await open(page, errors); await page.waitForTimeout(2000);
  const s = await stats(page); metrics.load = s;
  expect(await run(page, '__fur.gl()')).toBe(0);
  expect(s.nan).toBe(false); expect(errors).toEqual([]);
  fs.mkdirSync('shots', { recursive: true }); await page.screenshot({ path: 'shots/hero.png' });
});

test('every preset renders a non-blank frame', async ({ page }) => {
  const errors: string[] = []; await open(page, errors);
  const names = await run(page, '__fur.presets()') as string[]; const out: Record<string, number> = {};
  for (const n of names) {
    await run(page, `__fur.applyPreset(${JSON.stringify(n)})`); await page.waitForTimeout(1200);
    out[n] = await canvasVariance(page); expect(out[n], n).toBeGreaterThan(20);
    await page.screenshot({ path: `shots/preset-${n.replace(/\s+/g, '-')}.png` });
  }
  for (const s of ['plane', 'torus', 'knot']) { await run(page, `__fur.setParams({...__fur.P, surface:'${s}'})`); await page.waitForTimeout(1000);
    expect(await canvasVariance(page), s).toBeGreaterThan(20); await page.screenshot({ path: `shots/surface-${s}.png` }); }
  metrics.presetVariance = out; expect(errors).toEqual([]);
});

test('no NaN and bounded offsets after stress at control extremes', async ({ page }) => {
  const errors: string[] = []; await open(page, errors);
  await run(page, `__fur.setParams({...__fur.P, stiffness:400, damping:0.5, gravity:20, wind:30, turbulence:1, length:0.5, brushStrength:80, brushRadius:1, brushMode:'push', shells:96, density:600})`);
  const box = { w: 1280, h: 720 };
  for (let i = 0; i < 6; i++) { await page.mouse.move(box.w / 2 - 200, box.h / 2); await page.mouse.down(); await page.mouse.move(box.w / 2 + 200, box.h / 2 + 50, { steps: 15 }); await page.mouse.up(); }
  await run(page, `__fur.setParams({...__fur.P, stiffness:5, damping:0.5})`); await page.waitForTimeout(1500);
  await run(page, `__fur.setParams({...__fur.P, length:9999, stiffness:-5, density:NaN})`); await page.waitForTimeout(800); // out-of-range input must be clamped
  const p = await run(page, '({...__fur.P})') as Record<string, number>;
  expect(p.length).toBe(0.5); expect(p.stiffness).toBe(5); expect(p.density).toBe(240);
  const s = await stats(page); metrics.stress = s;
  expect(s.nan).toBe(false); expect(s.maxOffsetOverLength).toBeLessThanOrEqual(2.11); expect(errors).toEqual([]);
});

test('mouse/pen pointer drag combs the fur', async ({ page }) => {
  const errors: string[] = []; await open(page, errors);
  await run(page, `__fur.setParams({...__fur.P, brushMode:'comb', recovery:0.02})`);
  const before = (await stats(page)).combMax;
  await page.mouse.move(560, 300); await page.mouse.down(); await page.mouse.move(760, 420, { steps: 25 }); await page.mouse.up();
  await page.waitForTimeout(300); const after = (await stats(page)).combMax; metrics.mouseComb = { before, after };
  expect(after).toBeGreaterThan(before + 0.05); await page.screenshot({ path: 'shots/combed.png' }); expect(errors).toEqual([]);
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test('touch: one finger combs, two fingers pinch-zoom, no page scroll', async ({ page }) => {
    const errors: string[] = []; await open(page, errors);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    await run(page, `__fur.setParams({...__fur.P, brushMode:'comb', recovery:0.02})`);
    await touch('touchStart', [[150, 380]]); for (let i = 1; i <= 20; i++) { await touch('touchMove', [[150 + i * 5, 380 + i * 4]]); await page.waitForTimeout(16); } await touch('touchEnd', []);
    await page.waitForTimeout(200); const comb = (await stats(page)).combMax; expect(comb).toBeGreaterThan(0.05);
    const r0 = await run(page, '__fur.orbit.r') as number;
    await touch('touchStart', [[195, 300], [195, 500]]); for (let i = 1; i <= 15; i++) { await touch('touchMove', [[195, 300 + i * 5], [195, 500 - i * 5]]); await page.waitForTimeout(16); } await touch('touchEnd', []);
    const r1 = await run(page, '__fur.orbit.r') as number; metrics.touch = { comb, r0, r1 };
    expect(r1).toBeGreaterThan(r0 * 1.2);
    const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY, sw: document.documentElement.scrollWidth, ta: getComputedStyle(document.querySelector('canvas')!).touchAction }));
    expect(scroll).toEqual({ x: 0, y: 0, sw: 390, ta: 'none' });
    expect(await page.locator('.lil-gui.lil-root').evaluate(e => e.classList.contains('lil-closed'))).toBe(true);
    await page.screenshot({ path: 'shots/mobile.png' }); expect(errors).toEqual([]);
  });
});

test('control panel accessibility (axe, WCAG 2 A/AA) and keyboard reachability', async ({ page }) => {
  const errors: string[] = []; await open(page, errors);
  const res = await new AxeBuilder({ page }).include('.lil-gui').withTags(['wcag2a', 'wcag2aa']).analyze();
  metrics.axe = { violations: res.violations.map(v => `${v.id} (${v.nodes.length})`), passes: res.passes.length };
  expect(res.violations.map(v => v.id)).toEqual([]);
  const unnamed = await page.$$eval('.lil-gui input, .lil-gui select, .lil-gui button', els => els.filter(e => {
    const lb = e.getAttribute('aria-labelledby'); return !(e.getAttribute('aria-label') || (lb && document.getElementById(lb)?.textContent?.trim()) || e.textContent?.trim() || (e as HTMLInputElement).labels?.length); }).length);
  expect(unnamed).toBe(0);
  await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('.lil-gui'))).toBe(true);
});
