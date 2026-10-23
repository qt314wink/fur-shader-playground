export type Params = {
  pattern: number; root: string; tip: string; accent: string; patternScale: number; patternContrast: number; colorJitter: number;
  smoothness: number; sheen: number; shift: number; iridescence: number; filmThickness: number; rim: number; exposure: number;
  thickness: number; clumping: number; frizz: number; length: number; lengthVar: number; density: number; shells: number; droop: number;
  stiffness: number; damping: number; gravity: number; wind: number; windDir: number; turbulence: number;
  brushMode: 'push' | 'comb'; brushStrength: number; brushRadius: number; recovery: number; surface: string;
};
export const PATTERNS = { solid: 0, stripes: 1, spots: 2, gradient: 3, marble: 4 };
export const SURFACES = ['sphere', 'plane', 'torus', 'knot'];
// [min, max, step]; every numeric param is clamped to these on edit, preset load and JSON import
export const RANGES: Record<string, [number, number, number]> = {
  patternScale: [1, 30, 0.5], patternContrast: [0, 1, 0.01], colorJitter: [0, 0.5, 0.01],
  smoothness: [0, 1, 0.01], sheen: [0, 2, 0.01], shift: [-0.3, 0.3, 0.01], iridescence: [0, 1, 0.01], filmThickness: [100, 900, 10],
  rim: [0, 2, 0.01], exposure: [0.3, 2.5, 0.01], thickness: [0.15, 0.95, 0.01], clumping: [0, 1, 0.01], frizz: [0, 1, 0.01],
  length: [0.02, 0.5, 0.005], lengthVar: [0, 0.8, 0.01], density: [60, 600, 5], shells: [8, 96, 1], droop: [1, 3, 0.05],
  stiffness: [5, 400, 1], damping: [0.5, 30, 0.1], gravity: [0, 20, 0.1], wind: [0, 30, 0.1], windDir: [0, 360, 1], turbulence: [0, 1, 0.01],
  brushStrength: [0, 80, 1], brushRadius: [0.05, 1, 0.01], recovery: [0.02, 3, 0.01],
};
export const DEFAULTS: Params = {
  pattern: 0, root: '#5a3218', tip: '#e8c08a', accent: '#1a0f08', patternScale: 8, patternContrast: 0.8, colorJitter: 0.12,
  smoothness: 0.6, sheen: 0.8, shift: 0.08, iridescence: 0, filmThickness: 420, rim: 0.6, exposure: 1.1,
  thickness: 0.6, clumping: 0.3, frizz: 0.15, length: 0.16, lengthVar: 0.35, density: 240, shells: 56, droop: 2,
  stiffness: 80, damping: 6, gravity: 9.8, wind: 3, windDir: 30, turbulence: 0.5,
  brushMode: 'comb', brushStrength: 30, brushRadius: 0.3, recovery: 0.25, surface: 'sphere',
};
export const PRESETS: Record<string, Partial<Params>> = {
  tabby: { pattern: 1, root: '#6b3a16', tip: '#e9b276', accent: '#24130a', patternScale: 9, patternContrast: 0.85, length: 0.15, sheen: 0.7, iridescence: 0 },
  'snow leopard': { pattern: 2, root: '#b9b7b2', tip: '#f6f4ef', accent: '#3a3a3d', patternScale: 7, patternContrast: 0.9, length: 0.22, lengthVar: 0.45, frizz: 0.25, sheen: 0.6, iridescence: 0 },
  neon: { pattern: 3, root: '#ff1fa8', tip: '#20f0ff', accent: '#ffe600', patternScale: 6, length: 0.2, sheen: 1.4, smoothness: 0.85, rim: 1.4, exposure: 1.3, iridescence: 0.2 },
  'velvet moss': { pattern: 4, root: '#173d14', tip: '#8fc54a', accent: '#2c5a1c', patternScale: 5, length: 0.05, lengthVar: 0.2, thickness: 0.85, clumping: 0, frizz: 0.05, smoothness: 0.25, sheen: 1.1, rim: 1.2, stiffness: 200, iridescence: 0 },
  iridescent: { pattern: 0, root: '#101018', tip: '#3a3f55', accent: '#000000', iridescence: 1, filmThickness: 520, smoothness: 0.9, sheen: 1.6, length: 0.14, clumping: 0.5, rim: 0.8 },
  shaggy: { pattern: 4, root: '#3b2a1e', tip: '#cfae86', accent: '#5a4434', length: 0.42, lengthVar: 0.6, frizz: 0.7, clumping: 0.7, thickness: 0.7, smoothness: 0.3, stiffness: 25, damping: 3, iridescence: 0 },
};
const HEX = /^#[0-9a-f]{6}$/i;
export function clampParams(p: Params): Params {
  const a = p as unknown as Record<string, unknown>, d = DEFAULTS as unknown as Record<string, unknown>;
  for (const k in RANGES) { const [lo, hi] = RANGES[k]; const v = a[k]; a[k] = typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d[k]; }
  p.pattern = Math.min(4, Math.max(0, Math.round(Number(p.pattern) || 0)));
  for (const k of ['root', 'tip', 'accent'] as const) if (!HEX.test(String(p[k]))) p[k] = DEFAULTS[k];
  if (p.brushMode !== 'push') p.brushMode = 'comb'; if (!SURFACES.includes(p.surface)) p.surface = 'sphere';
  return p;
}
export function randomParams(rnd = Math.random): Params {
  const p = { ...DEFAULTS } as unknown as Record<string, unknown>;
  for (const k of ['patternScale','patternContrast','colorJitter','smoothness','sheen','shift','iridescence','filmThickness','rim','thickness','clumping','frizz','length','lengthVar']) {
    const [lo, hi] = RANGES[k]; p[k] = lo + (hi - lo) * rnd(); }
  const hex = () => '#' + Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0');
  p.root = hex(); p.tip = hex(); p.accent = hex(); p.pattern = Math.floor(rnd() * 5); p.length = 0.05 + 0.3 * rnd(); p.iridescence = rnd() < 0.3 ? rnd() : 0;
  return clampParams(p as unknown as Params);
}
