import * as THREE from 'three';
import GUI from 'lil-gui';
import { vert, frag } from './shaders';
import { DEFAULTS, PRESETS, RANGES, PATTERNS, SURFACES, clampParams, randomParams, type Params } from './params';

const P: Params = { ...DEFAULTS };
const STORE = 'fur-v2-presets';

// ---------- renderer (WebGL2; see README for why not WebGPU yet) ----------
const LOW = new URLSearchParams(location.search).get('q') === 'low';
const SHELL_CAP = LOW ? 12 : 96;
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(LOW ? 0.5 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute('aria-label', 'Interactive fur. Drag to brush, two fingers to orbit, pinch to zoom.');
renderer.domElement.setAttribute('role', 'img');
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
{ // soft studio gradient backdrop
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#2a2d38'); g.addColorStop(0.6, '#15161c'); g.addColorStop(1, '#0a0a0d');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
}
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 100);
const orbit = { theta: 0.4, phi: 1.25, r: 3.6 };
function placeCam() { orbit.phi = Math.min(2.9, Math.max(0.2, orbit.phi)); orbit.r = Math.min(8, Math.max(1.6, orbit.r));
  cam.position.setFromSphericalCoords(orbit.r, orbit.phi, orbit.theta); cam.lookAt(0, 0, 0); }
placeCam();
{ // contact shadow disc
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = -1.35; scene.add(m);
}

// ---------- fur material ----------
const U = {
  uLen: { value: 0 }, uShells: { value: 1 }, uDroop: { value: 2 }, uDensity: { value: 0 }, uThick: { value: 0 }, uClump: { value: 0 }, uFrizz: { value: 0 },
  uLenVar: { value: 0 }, uPattern: { value: 0 }, uPScale: { value: 1 }, uPContrast: { value: 0 }, uJitter: { value: 0 }, uSmooth: { value: 0 },
  uSheen: { value: 0 }, uShift: { value: 0 }, uIrid: { value: 0 }, uFilm: { value: 400 }, uRim: { value: 0 },
  uRoot: { value: new THREE.Color() }, uTip: { value: new THREE.Color() }, uAccent: { value: new THREE.Color() },
  uL1: { value: new THREE.Vector3(0.6, 0.7, 0.4).normalize() }, uL2: { value: new THREE.Vector3(-0.7, 0.2, -0.6).normalize() },
};
const mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: U, vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide, alphaToCoverage: !LOW, toneMapped: true });
const MAXSH = 96;
let geo!: THREE.BufferGeometry, mesh!: THREE.InstancedMesh, N = 0;
let pos!: Float32Array, nrm!: Float32Array, off!: Float32Array, vel!: Float32Array, comb!: Float32Array;
let offAttr!: THREE.BufferAttribute, combAttr!: THREE.BufferAttribute;
const picker = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial());
function makeGeo(kind: string): THREE.BufferGeometry {
  switch (kind) {
    case 'plane': return new THREE.PlaneGeometry(2.4, 2.4, 110, 110).rotateX(-Math.PI / 2).translate(0, -0.6, 0);
    case 'torus': return new THREE.TorusGeometry(0.8, 0.36, 72, 144).rotateX(-0.6);
    case 'knot': return new THREE.TorusKnotGeometry(0.62, 0.23, 280, 36);
    default: return new THREE.SphereGeometry(1, 144, 108);
  }
}
function build(kind: string) {
  if (mesh) { scene.remove(mesh); geo.dispose(); }
  mat.side = kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide; mat.needsUpdate = true;
  geo = makeGeo(kind); N = geo.attributes.position.count;
  pos = geo.attributes.position.array as Float32Array; nrm = geo.attributes.normal.array as Float32Array;
  off = new Float32Array(N * 3); vel = new Float32Array(N * 3); comb = new Float32Array(N * 3);
  offAttr = new THREE.BufferAttribute(off, 3).setUsage(THREE.DynamicDrawUsage); combAttr = new THREE.BufferAttribute(comb, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('offset', offAttr); geo.setAttribute('comb', combAttr);
  geo.computeBoundingSphere();
  mesh = new THREE.InstancedMesh(geo, mat, MAXSH); mesh.frustumCulled = false; mesh.count = Math.min(P.shells, SHELL_CAP);
  scene.add(mesh); picker.geometry = geo;
}
function syncUniforms() {
  U.uLen.value = P.length; U.uShells.value = P.shells; U.uDroop.value = P.droop; U.uDensity.value = P.density; U.uThick.value = P.thickness;
  U.uClump.value = P.clumping; U.uFrizz.value = P.frizz; U.uLenVar.value = P.lengthVar; U.uPattern.value = P.pattern; U.uPScale.value = P.patternScale;
  U.uPContrast.value = P.patternContrast; U.uJitter.value = P.colorJitter; U.uSmooth.value = P.smoothness; U.uSheen.value = P.sheen; U.uShift.value = P.shift;
  U.uIrid.value = P.iridescence; U.uFilm.value = P.filmThickness; U.uRim.value = P.rim;
  U.uRoot.value.set(P.root); U.uTip.value.set(P.tip); U.uAccent.value.set(P.accent);
  renderer.toneMappingExposure = P.exposure; if (mesh) mesh.count = Math.min(P.shells, SHELL_CAP);
}
build(P.surface); syncUniforms();

// ---------- input: pointer events (mouse, touch, pen) ----------
const el = renderer.domElement;
const pointers = new Map<number, { x: number; y: number; type: string; button: number }>();
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
let brush: { p: THREE.Vector3; dir: THREE.Vector3; move: THREE.Vector3 } | null = null;
let lastHit: THREE.Vector3 | null = null; let pinch0 = 0;
function hitAt(x: number, y: number) { ndc.set(x / innerWidth * 2 - 1, -y / innerHeight * 2 + 1); ray.setFromCamera(ndc, cam);
  return ray.intersectObject(picker)[0]?.point ?? null; }
function isOrbit(e: { type: string; button: number }) { return pointers.size >= 2 || (e.type === 'mouse' && e.button === 2); }
el.addEventListener('contextmenu', e => e.preventDefault());
el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, button: e.button });
  if (pointers.size === 2) { brush = null; lastHit = null; const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } });
el.addEventListener('pointermove', e => { const pt = pointers.get(e.pointerId); if (!pt) return; e.preventDefault();
  const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
  if (isOrbit(pt)) {
    const k = pointers.size >= 2 ? 0.5 : 1; orbit.theta -= dx * 0.006 * k; orbit.phi -= dy * 0.006 * k;
    if (pointers.size === 2) { pt.x = e.clientX; pt.y = e.clientY; const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) orbit.r *= pinch0 / d; pinch0 = d; }
    placeCam();
  } else {
    const h = hitAt(e.clientX, e.clientY);
    if (h) { const move = lastHit ? h.clone().sub(lastHit) : new THREE.Vector3(); brush = { p: h, dir: ray.ray.direction.clone(), move }; lastHit = h; }
    else { brush = null; lastHit = null; }
  }
  pt.x = e.clientX; pt.y = e.clientY; });
const up = (e: PointerEvent) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; if (pointers.size === 0) { brush = null; lastHit = null; } };
el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
el.addEventListener('wheel', e => { e.preventDefault(); orbit.r *= Math.exp(e.deltaY * 0.001); placeCam(); }, { passive: false });
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------- simulation: per-root damped spring, semi-implicit Euler, auto-substeps ----------
let t = 0; const stats = { fps: 0, simMs: 0, roots: 0, shells: 0, substeps: 1, maxOffsetOverLength: 0, combMax: 0, pixelRatio: 1, nan: false, frames: 0 };
function simulate(dt: number) {
  const k = P.stiffness, c = P.damping, L = P.length;
  const sub = Math.max(1, Math.ceil(dt * Math.sqrt(k) / 0.5)); const h = dt / sub; stats.substeps = sub;
  const a = P.windDir * Math.PI / 180, wx = Math.cos(a), wz = Math.sin(a);
  const g = P.gravity * 0.5, ws = P.wind * 0.5, bs = P.brushStrength * 0.5, R = P.brushRadius, R2 = R * R;
  const decay = Math.exp(-P.recovery * dt), maxComb = 0.9 * L;
  let maxR = 0, nan = false, cMax = 0;
  const bp = brush?.p, bd = brush?.dir, bm = brush?.move;
  for (let i = 0; i < N; i++) {
    const j = i * 3, x = pos[j], y = pos[j + 1], z = pos[j + 2], nx = nrm[j], ny = nrm[j + 1], nz = nrm[j + 2];
    const gust = ws * (1 - P.turbulence + P.turbulence * (0.5 + 0.5 * Math.sin(t * 2.3 + x * 3 + z * 2) * Math.sin(t * 1.7 + y * 4)));
    let fx = wx * gust, fy = -g, fz = wz * gust;
    let cx = comb[j] * decay, cy = comb[j + 1] * decay, cz = comb[j + 2] * decay;
    if (bp && bd && bm) { const dx = x - bp.x, dy = y - bp.y, dz = z - bp.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < R2) { const f = 1 - Math.sqrt(d2) / R;
        if (P.brushMode === 'push') { fx += bd.x * f * bs; fy += bd.y * f * bs; fz += bd.z * f * bs; }
        else { const s = f * P.brushStrength * 0.02; cx += bm.x * s * 10; cy += bm.y * s * 10; cz += bm.z * s * 10; } } }
    // comb stays tangent and bounded
    const cn = cx * nx + cy * ny + cz * nz; cx -= cn * nx; cy -= cn * ny; cz -= cn * nz;
    const cm = Math.hypot(cx, cy, cz); if (cm > maxComb) { const s = maxComb / cm; cx *= s; cy *= s; cz *= s; }
    comb[j] = cx; comb[j + 1] = cy; comb[j + 2] = cz; const cr = Math.hypot(cx, cy, cz) / L; if (cr > cMax) cMax = cr;
    let ox = off[j], oy = off[j + 1], oz = off[j + 2], vx = vel[j], vy = vel[j + 1], vz = vel[j + 2];
    for (let s = 0; s < sub; s++) {
      vx += (fx - k * ox - c * vx) * h; vy += (fy - k * oy - c * vy) * h; vz += (fz - k * oz - c * vz) * h;
      ox += vx * h; oy += vy * h; oz += vz * h;
      const dn = (ox + cx) * nx + (oy + cy) * ny + (oz + cz) * nz;          // surface half-space collision
      if (dn < -0.8 * L) { const q = -0.8 * L - dn; ox += nx * q; oy += ny * q; oz += nz * q; const vn = vx * nx + vy * ny + vz * nz; if (vn < 0) { vx -= vn * nx; vy -= vn * ny; vz -= vn * nz; } }
      const m = Math.hypot(ox, oy, oz), M = 1.2 * L; if (m > M) { const q = M / m; ox *= q; oy *= q; oz *= q; }   // stretch clamp
    }
    if (!(isFinite(ox) && isFinite(vx) && isFinite(oy) && isFinite(oz))) { nan = true; ox = oy = oz = vx = vy = vz = 0; }
    off[j] = ox; off[j + 1] = oy; off[j + 2] = oz; vel[j] = vx; vel[j + 1] = vy; vel[j + 2] = vz;
    const r = Math.hypot(ox + cx, oy + cy, oz + cz) / L; if (r > maxR) maxR = r;
  }
  if (brush) brush.move.set(0, 0, 0);
  stats.maxOffsetOverLength = maxR; stats.combMax = cMax; stats.nan = stats.nan || nan;
  offAttr.needsUpdate = true; combAttr.needsUpdate = true;
}

// ---------- GUI ----------
const gui = new GUI({ title: 'Fur v2' });
if (innerWidth < 700) gui.close();
const ctrls: Record<string, ReturnType<GUI['add']>> = {};
const rng = (f: GUI, k: keyof Params, name: string) => { const [a, b, s] = RANGES[k as string]; ctrls[k] = f.add(P, k, a, b, s).name(name).onChange(syncUniforms); };
const fp = gui.addFolder('Look');
const preset = { name: 'tabby' };
const allPresets = () => ({ ...PRESETS, ...JSON.parse(localStorage.getItem(STORE) || '{}') as Record<string, Partial<Params>> });
const presetCtrl = fp.add(preset, 'name', Object.keys(allPresets())).name('Preset').onChange((n: string) => applyPreset(n));
ctrls.surface = fp.add(P, 'surface', SURFACES).name('Surface').onChange((v: string) => build(v));
ctrls.pattern = fp.add(P, 'pattern', PATTERNS).name('Pattern').onChange(syncUniforms);
ctrls.root = fp.addColor(P, 'root').name('Root colour').onChange(syncUniforms);
ctrls.tip = fp.addColor(P, 'tip').name('Tip colour').onChange(syncUniforms);
ctrls.accent = fp.addColor(P, 'accent').name('Pattern colour').onChange(syncUniforms);
rng(fp, 'patternScale', 'Pattern scale'); rng(fp, 'patternContrast', 'Pattern contrast'); rng(fp, 'colorJitter', 'Colour jitter');
const fs = gui.addFolder('Sheen');
rng(fs, 'smoothness', 'Smoothness'); rng(fs, 'sheen', 'Sheen'); rng(fs, 'shift', 'Highlight shift'); rng(fs, 'iridescence', 'Iridescence');
rng(fs, 'filmThickness', 'Film thickness (nm)'); rng(fs, 'rim', 'Rim light'); rng(fs, 'exposure', 'Exposure');
const fg = gui.addFolder('Strands');
rng(fg, 'length', 'Length'); rng(fg, 'lengthVar', 'Length variation'); rng(fg, 'thickness', 'Coarseness'); rng(fg, 'clumping', 'Clumping');
rng(fg, 'frizz', 'Frizz'); rng(fg, 'density', 'Density'); rng(fg, 'shells', 'Shells'); rng(fg, 'droop', 'Tip droop');
const fd = gui.addFolder('Physics'); fd.close();
rng(fd, 'stiffness', 'Stiffness'); rng(fd, 'damping', 'Damping'); rng(fd, 'gravity', 'Gravity'); rng(fd, 'wind', 'Wind');
rng(fd, 'windDir', 'Wind direction'); rng(fd, 'turbulence', 'Turbulence');
const fb = gui.addFolder('Brush');
ctrls.brushMode = fb.add(P, 'brushMode', ['comb', 'push']).name('Mode');
rng(fb, 'brushStrength', 'Strength'); rng(fb, 'brushRadius', 'Radius'); rng(fb, 'recovery', 'Comb recovery');
function refresh() { gui.controllersRecursive().forEach(c => c.updateDisplay()); }
function setParams(next: Partial<Params>) { const prevSurface = P.surface; Object.assign(P, DEFAULTS, next); clampParams(P); if (P.surface !== prevSurface || !mesh) build(P.surface); syncUniforms(); refresh(); }
function applyPreset(name: string) { const p = allPresets()[name]; if (p) { setParams({ ...p, surface: P.surface }); preset.name = name; refresh(); } }
const actions = {
  randomize() { setParams({ ...randomParams(), surface: P.surface }); },
  save() { const n = prompt('Preset name', 'my fur'); if (!n) return; const s = JSON.parse(localStorage.getItem(STORE) || '{}'); s[n] = { ...P }; localStorage.setItem(STORE, JSON.stringify(s));
    presetCtrl.options(Object.keys(allPresets())); preset.name = n; refresh(); },
  async copyJSON() { const j = JSON.stringify(P, null, 2); try { await navigator.clipboard.writeText(j); } catch { prompt('Copy JSON', j); } },
  pasteJSON() { const j = prompt('Paste preset JSON'); if (!j) return; try { setParams(JSON.parse(j)); } catch { alert('Invalid JSON'); } },
  resetComb() { comb.fill(0); },
  reset() { setParams({ ...DEFAULTS, surface: P.surface }); },
};
const fa = gui.addFolder('Actions');
fa.add(actions, 'randomize').name('🎲 Randomize'); fa.add(actions, 'save').name('Save preset'); fa.add(actions, 'copyJSON').name('Copy JSON');
fa.add(actions, 'pasteJSON').name('Paste JSON'); fa.add(actions, 'resetComb').name('Smooth out comb'); fa.add(actions, 'reset').name('Reset defaults');
applyPreset('tabby');

// ---------- loop ----------
const hud = document.getElementById('hud')!;
let last = performance.now(); let frameMs = 16; const maxPR = LOW ? 0.5 : Math.min(devicePixelRatio, 2); let pr = maxPR;
function frame(now: number) {
  const realDt = Math.max(0.001, (now - last) / 1000); const dt = Math.min(0.033, realDt); last = now; t += dt;
  frameMs = frameMs * 0.9 + realDt * 100; stats.fps = 1000 / frameMs;
  // dynamic resolution: keep the frame near budget by trading pixel ratio (0.35x .. device ratio)
  if (stats.frames % 20 === 0 && stats.frames > 0) { const np = frameMs > 40 ? pr * 0.75 : frameMs < 18 ? pr * 1.15 : pr;
    const c = Math.min(maxPR, Math.max(0.35, np)); if (Math.abs(c - pr) > 0.01) { pr = c; renderer.setPixelRatio(pr); } }
  stats.pixelRatio = pr;
  const t0 = performance.now(); simulate(dt); stats.simMs = performance.now() - t0;
  renderer.render(scene, cam); stats.frames++; stats.roots = N; stats.shells = P.shells;
  if (stats.frames % 10 === 0) hud.textContent = `${stats.fps.toFixed(0)} fps · sim ${stats.simMs.toFixed(1)} ms · ${N.toLocaleString()} roots × ${P.shells} shells · ${stats.substeps} substeps · res ${pr.toFixed(2)}x`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test / console hook
declare global { interface Window { __fur: unknown } }
window.__fur = { P, stats, setParams, applyPreset, presets: () => Object.keys(allPresets()), orbit, mat, renderer, scene, getMesh: () => mesh, gl: () => renderer.getContext().getError() };
