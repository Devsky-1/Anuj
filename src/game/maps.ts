import * as T from 'three';
import { ObstacleBox, clamp } from './rules';
import { pbr, getHaloTex } from './textures';

export interface LampRef {
  l: T.PointLight;
  base: number;
  ph: number;
}

export interface WeatherConfig {
  count: number;
  color: number;
  size: number;
  opacity: number;
  fall: number;
  wx: number;
  wz: number;
}

export interface MapTheme {
  hor: [number, number, number];
  mid: [number, number, number];
  top: [number, number, number];
  sunGlow: number;
  sunDir: [number, number, number];
  fog: number;
  fogD: number;
  hemiSky: number;
  hemiGround: number;
  hemiInt: number;
  fillInt: number;
  sunHex: number;
  sunInt: number;
  sunOff: [number, number, number];
  exp: number;
  cloud: number;
  ridge: number;
  weather: WeatherConfig;
}

export interface MapContext {
  level: T.Group;
  obs: ObstacleBox[];
  statics: T.Object3D[];
  lamps: LampRef[];
  bound: number;
  isTouch: boolean;
  rand: () => number;
  lampLights: number;
}

function addBox(
  ctx: MapContext,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  mat: T.Material,
  collide = true,
  y0 = 0
) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.position.set(x, y0 + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  ctx.level.add(m);
  ctx.statics.push(m);
  if (collide) {
    ctx.obs.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  return m;
}

function addCyl(
  ctx: MapContext,
  x: number,
  z: number,
  r: number,
  h: number,
  mat: T.Material,
  collide = true,
  y0 = 0
) {
  const m = new T.Mesh(new T.CylinderGeometry(r, r, h, 14), mat);
  m.position.set(x, y0 + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  ctx.level.add(m);
  ctx.statics.push(m);
  if (collide) {
    const s = r * 0.85;
    ctx.obs.push({ minX: x - s, maxX: x + s, minZ: z - s, maxZ: z + s });
  }
  return m;
}

function freeSpot(ctx: MapContext, x: number, z: number, m: number) {
  if (Math.abs(x) > ctx.bound - 3 || Math.abs(z) > ctx.bound - 3 || Math.hypot(x, z - 22) < 8)
    return false;
  return !ctx.obs.some(
    (o) => x > o.minX - m && x < o.maxX + m && z > o.minZ - m && z < o.maxZ + m
  );
}

function scatter(ctx: MapContext, n: number, margin: number, fn: (x: number, z: number, idx: number) => void) {
  let placed = 0;
  let tries = 0;
  while (placed < n && tries < n * 30) {
    tries++;
    const x = (ctx.rand() - 0.5) * 76;
    const z = (ctx.rand() - 0.5) * 76;
    if (freeSpot(ctx, x, z, margin)) {
      fn(x, z, placed);
      placed++;
    }
  }
}

function arena(ctx: MapContext, floorTex: string, rep: number, wallTex: string, wallTint: number) {
  // Extend ground well beyond playable zone for natural horizon blend
  const floor = new T.Mesh(
    new T.PlaneGeometry(ctx.bound * 2.6, ctx.bound * 2.6),
    pbr(floorTex, rep, rep, { roughness: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  ctx.level.add(floor);
  ctx.statics.push(floor);

  // Outer perimeter rock outcrops & low security barriers instead of indoor box walls
  const rockMat = pbr(wallTex, 3, 2, { roughness: 0.96, color: wallTint });
  const coneGeo = new T.ConeGeometry(8, 14, 7);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const r = ctx.bound + 8 + (i % 3) * 4;
    const m = new T.Mesh(coneGeo, rockMat);
    const hScale = 0.8 + (i % 4) * 0.35;
    m.scale.set(1 + (i % 3) * 0.3, hScale, 1 + ((i + 1) % 3) * 0.3);
    m.position.set(Math.cos(a) * r, 7 * hScale - 1, Math.sin(a) * r);
    m.rotation.y = a;
    ctx.level.add(m);
  }
}

function lampPost(ctx: MapContext, x: number, z: number, col: number, h = 7) {
  const pole = new T.Mesh(
    new T.CylinderGeometry(0.1, 0.14, h, 8),
    new T.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.8, roughness: 0.5 })
  );
  pole.position.set(x, h / 2, z);
  pole.castShadow = true;
  ctx.level.add(pole);
  ctx.statics.push(pole);

  const bulb = new T.Mesh(
    new T.SphereGeometry(0.28, 12, 8),
    new T.MeshStandardMaterial({ color: 0xffe0a8, emissive: col, emissiveIntensity: 3 })
  );
  bulb.position.set(x, h + 0.1, z);
  ctx.level.add(bulb);

  if (ctx.lampLights < (ctx.isTouch ? 3 : 5)) {
    const l = new T.PointLight(col, 1.8, 34, 1.6);
    l.position.set(x, h - 0.2, z);
    ctx.level.add(l);
    ctx.lampLights++;
    ctx.lamps.push({ l, base: 1.8, ph: ctx.rand() * 10 });
  }

  const halo = new T.Sprite(
    new T.SpriteMaterial({
      map: getHaloTex(),
      color: col,
      blending: T.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.75,
    })
  );
  halo.scale.set(5.5, 5.5, 1);
  halo.position.set(x, h + 0.1, z);
  ctx.level.add(halo);
  ctx.obs.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15 });
}

function uShape(ctx: MapContext, x: number, z: number, w: number, d: number, open: string, mat: T.Material) {
  const t = 1.1;
  const H = 3.6;
  if (open !== 'n') addBox(ctx, x, z - d / 2 + t / 2, w, t, H, mat);
  if (open !== 's') addBox(ctx, x, z + d / 2 - t / 2, w, t, H, mat);
  if (open !== 'w') addBox(ctx, x - w / 2 + t / 2, z, t, d - 2 * t, H, mat);
  if (open !== 'e') addBox(ctx, x + w / 2 - t / 2, z, t, d - 2 * t, H, mat);
  if (open === 'n' || open === 's') {
    const zz = open === 'n' ? z - d / 2 + t / 2 : z + d / 2 - t / 2;
    addBox(ctx, x - w / 2 + 1.2, zz, 2.4, t, 1.4, mat);
    addBox(ctx, x + w / 2 - 1.2, zz, 2.4, t, 1.4, mat);
  } else {
    const xx = open === 'w' ? x - w / 2 + t / 2 : x + w / 2 - t / 2;
    addBox(ctx, xx, z - d / 2 + 1.8, t, 2.4, 1.4, mat);
    addBox(ctx, xx, z + d / 2 - 1.8, t, 2.4, 1.4, mat);
  }
}

function buildYard(ctx: MapContext) {
  arena(ctx, 'concrete', 20, 'concrete', 0xb9b9b4);
  const lm = new T.MeshStandardMaterial({ color: 0xcfc08a, roughness: 0.9 });
  for (let i = -3; i <= 3; i++) {
    const s = new T.Mesh(new T.PlaneGeometry(0.25, 6), lm);
    s.rotation.x = -Math.PI / 2;
    s.position.set(i * 9, 0.02, 18);
    s.receiveShadow = true;
    ctx.level.add(s);
  }
  const names = ['red', 'blue', 'green'];
  const containers: [number, number, number, number][] = [
    [-14, -6, 12, 2.6],
    [15, -14, 2.6, 12],
    [-8, 12, 12, 2.6],
    [24, 6, 2.6, 12],
    [-26, -22, 12, 2.6],
    [2, -26, 12, 2.6],
    [-30, 8, 2.6, 12],
  ];
  containers.forEach((c, i) => {
    addBox(
      ctx,
      c[0],
      c[1],
      c[2],
      c[3],
      2.7,
      pbr(names[i % 3], c[2] > c[3] ? 3 : 1, c[2] > c[3] ? 1 : 3, { roughness: 0.55, metalness: 0.55 })
    );
  });
  addBox(ctx, -14, -6, 12, 2.6, 2.7, pbr('blue', 3, 1, { roughness: 0.55, metalness: 0.55 }), false, 2.7);
  addBox(ctx, 15, -14, 2.6, 12, 2.7, pbr('red', 1, 3, { roughness: 0.55, metalness: 0.55 }), false, 2.7);
  scatter(ctx, 20, 3, (x, z) => {
    const s = 1.4 + ctx.rand() * 0.8;
    const h = ctx.rand() > 0.6 ? s * 2 : s;
    addBox(ctx, x, z, s, s, h, pbr('crate', 1, h > s ? 2 : 1, { roughness: 0.8 }));
  });
  [
    [-20, 10],
    [20, -4],
    [-2, -14],
    [8, 24],
    [-32, -6],
    [30, -28],
  ].forEach((p) => lampPost(ctx, p[0], p[1], 0xffc27a, 7));
}

function buildDesert(ctx: MapContext) {
  arena(ctx, 'sand', 26, 'sandstone', 0xd6ba8c);
  const wall = pbr('sandstone', 3, 1, { roughness: 0.95 });
  uShape(ctx, -18, -10, 12, 9, 'e', wall);
  uShape(ctx, 16, -8, 10, 10, 'w', wall);
  uShape(ctx, -4, -24, 14, 8, 's', wall);
  uShape(ctx, 26, 10, 8, 10, 'n', wall);
  uShape(ctx, -26, 8, 8, 12, 'e', wall);
  uShape(ctx, 4, 2, 9, 7, 'n', wall);
  const bags = pbr('sand', 2, 1, { color: 0xb09a6a, roughness: 1 });
  [
    [-6, 16, 5, 1],
    [8, 14, 5, 1],
    [-18, 20, 6, 1],
    [18, 22, 5, 1],
    [0, -10, 6, 1],
  ].forEach((b) => addBox(ctx, b[0], b[1], b[2], b[3], 1.2, bags));
  const barrel = pbr('rust', 1, 1, { roughness: 0.5, metalness: 0.6 });
  scatter(ctx, 14, 2.5, (x, z) => addCyl(ctx, x, z, 0.45, 1.1, barrel));
  scatter(ctx, 14, 3, (x, z) => {
    const s = 1.4 + ctx.rand() * 0.8;
    addBox(ctx, x, z, s, s, s, pbr('crate', 1, 1, { roughness: 0.8 }));
  });
}

function buildFrost(ctx: MapContext) {
  arena(ctx, 'snow', 18, 'ice', 0xdbe6f0);
  const hut = pbr('ice', 2, 1, { color: 0xc9d4dd, roughness: 0.7, metalness: 0.2 });
  const roof = new T.MeshStandardMaterial({ color: 0xf2f6fa, roughness: 0.95 });
  [
    [-16, -8, 8, 5],
    [14, -14, 5, 8],
    [22, 8, 8, 5],
    [-28, -24, 8, 5],
    [-4, -30, 8, 5],
  ].forEach((h) => {
    addBox(ctx, h[0], h[1], h[2], h[3], 3.2, hut);
    addBox(ctx, h[0], h[1], h[2] + 0.6, h[3] + 0.6, 0.35, roof, false, 3.2);
  });
  const tank = pbr('red', 3, 1, { roughness: 0.5, metalness: 0.6 });
  [
    [-6, 6],
    [10, -2],
    [-24, 10],
  ].forEach((p) => addCyl(ctx, p[0], p[1], 1.6, 3.4, tank));
  const bark = new T.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.95 });
  const needle = new T.MeshStandardMaterial({ color: 0x2b4a3a, roughness: 0.9 });
  const snowCap = new T.MeshStandardMaterial({ color: 0xeef3f8, roughness: 0.95 });
  const coneG = [
    new T.ConeGeometry(2.1, 2.6, 10),
    new T.ConeGeometry(1.6, 2.3, 10),
    new T.ConeGeometry(1.1, 2, 10),
  ];
  scatter(ctx, ctx.isTouch ? 12 : 18, 2.5, (x, z) => {
    addCyl(ctx, x, z, 0.35, 2, bark, true);
    for (let k = 0; k < 3; k++) {
      const c = new T.Mesh(coneG[k], k === 2 ? snowCap : needle);
      c.position.set(x, 2.2 + k * 1.5, z);
      c.castShadow = true;
      ctx.level.add(c);
    }
  });
  [
    [-20, 12],
    [18, -6],
    [2, -22],
    [26, 22],
  ].forEach((p) => lampPost(ctx, p[0], p[1], 0xcfe3ff, 6.5));
}

function buildDeadTown(ctx: MapContext) {
  arena(ctx, 'concrete', 32, 'concrete', 0x77766c);
  const road = new T.MeshStandardMaterial({ color: 0x343735, roughness: 0.97 });
  const wallMats = [0x8b7868, 0x9b9585, 0x6d7772, 0x8a6f61, 0x77716a].map(
    (c) => new T.MeshStandardMaterial({ color: c, roughness: 0.94 })
  );
  const roofMats = [0x393b3a, 0x51463e, 0x5b5b52].map(
    (c) => new T.MeshStandardMaterial({ color: c, roughness: 0.9 })
  );
  addBox(ctx, 0, 0, 12, ctx.bound * 2, 0.025, road, false, 0.02);

  let hi = 0;
  for (let x = -64; x <= 64; x += 32) {
    for (let z = -64; z <= 64; z += 32) {
      if (Math.abs(x) < 14 && Math.abs(z) < 25) continue;
      const w = 8 + (hi % 3);
      const d = 7 + ((hi + 1) % 3);
      const h = 3.4 + (hi % 3) * 0.22;
      const wx = x + (hi % 2 ? 2 : -2);
      const wz = z + ((hi % 3) - 1) * 2;
      const wall = wallMats[hi % wallMats.length];
      const roof = roofMats[hi % roofMats.length];
      addBox(ctx, wx, wz - d / 2, w, 0.28, h, wall);
      addBox(ctx, wx - w / 2, wz, 0.28, d, h, wall);
      addBox(ctx, wx + w / 2, wz, 0.28, d, h, wall);
      addBox(ctx, wx - w * 0.31, wz + d / 2, w * 0.38, 0.28, h, wall);
      addBox(ctx, wx + w * 0.31, wz + d / 2, w * 0.38, 0.28, h, wall);
      addBox(ctx, wx, wz, w + 0.8, d + 0.8, 0.35, roof, false, h);
      hi++;
    }
  }
  const carBody = new T.MeshStandardMaterial({ color: 0x454b4b, metalness: 0.45, roughness: 0.65 });
  const rubber = new T.MeshStandardMaterial({ color: 0x17191a, roughness: 0.95 });
  for (let i = 0; i < 9; i++) {
    const x = -65 + (i % 3) * 62;
    const z = -50 + Math.floor(i / 3) * 48;
    if (Math.abs(x) < 10 && Math.abs(z) < 20) continue;
    addBox(ctx, x, z, 4.2, 2.1, 1.05, carBody);
    addBox(ctx, x, z - 0.05, 2.6, 1.55, 0.62, rubber, false, 0.2);
  }
  for (let i = 0; i < 6; i++) {
    const x = -60 + i * 24;
    const z = (i % 2 ? 1 : -1) * 44;
    lampPost(ctx, x, z, 0xffc78a, 5.5);
  }
}

function buildRiverside(ctx: MapContext) {
  buildDeadTown(ctx);
  const water = new T.MeshStandardMaterial({
    color: 0x285766,
    roughness: 0.24,
    metalness: 0.12,
    transparent: true,
    opacity: 0.94,
    emissive: 0x061a20,
    emissiveIntensity: 0.25,
  });
  const bank = new T.MeshStandardMaterial({ color: 0x777768, roughness: 1 });
  // Fixed argument order bug from original HTML (had 9 args with 0.08, 0.03 before water)
  addBox(ctx, 82, 0, 24, ctx.bound * 2, 0.08, water, false, 0.02);
  addBox(ctx, 66, 0, 7, ctx.bound * 2, 0.4, bank, false, 0.08);
  addBox(ctx, 98, 0, 7, ctx.bound * 2, 0.4, bank, false, 0.08);
  addBox(ctx, 82, 8, 30, 7, 0.55, pbr('concrete', 4, 1, { color: 0x777b78, roughness: 0.88 }), false, 0.25);
  addBox(ctx, 82, 4.3, 30, 0.22, 0.65, pbr('concrete', 4, 1, { color: 0x424946 }), true, 0.55);
  addBox(ctx, 82, 11.7, 30, 0.22, 0.65, pbr('concrete', 4, 1, { color: 0x424946 }), true, 0.55);
}

function buildOpenWorld(ctx: MapContext) {
  arena(ctx, 'concrete', 48, 'concrete', 0x777c70);
  const asphalt = new T.MeshStandardMaterial({ color: 0x303532, roughness: 0.96 });
  const sidewalk = new T.MeshStandardMaterial({ color: 0x96978d, roughness: 0.95 });
  const river = new T.MeshStandardMaterial({
    color: 0x285a68,
    roughness: 0.2,
    metalness: 0.12,
    transparent: true,
    opacity: 0.96,
    emissive: 0x071b20,
    emissiveIntensity: 0.22,
  });
  const wallCols = [0x817b70, 0x9a9b91, 0x6c7978, 0x7d7067, 0x8c8f84, 0x656d70];
  const roofCols = [0x343a3b, 0x4b4942, 0x595951, 0x383d40];

  // Fixed argument order bug from original HTML (had 9 args with 0.08, 0.02 before river)
  addBox(ctx, 74, 0, 24, ctx.bound * 2, 0.08, river, false, 0.03);
  addBox(ctx, 58, 0, 6, ctx.bound * 2, 0.45, sidewalk, false, 0.2);
  addBox(ctx, 90, 0, 6, ctx.bound * 2, 0.45, sidewalk, false, 0.2);
  addBox(ctx, 74, 18, 31, 8, 0.7, pbr('concrete', 4, 1, { color: 0x777d7b, roughness: 0.86 }), false, 0.35);

  for (let x = -120; x <= 120; x += 40) {
    if (x > 55 && x < 95) continue;
    addBox(ctx, x, 0, 7, ctx.bound * 2, 0.08, asphalt, false, 0.03);
  }
  for (let z = -120; z <= 120; z += 40) {
    addBox(ctx, 0, z, ctx.bound * 2, 7, 0.08, asphalt, false, 0.03);
  }

  let n = 0;
  for (let x = -108; x <= 108; x += 36) {
    for (let z = -108; z <= 108; z += 36) {
      if (Math.abs(x) < 22 && Math.abs(z) < 28) continue;
      if (x > 48 && x < 100) continue;
      const downtown = Math.abs(x) < 42 && z < -24;
      const w = downtown ? 8.5 : 7.5 + (n % 3) * 0.5;
      const d = 7.5 + (n % 4) * 0.35;
      const h = downtown ? 10 + (n % 4) * 2.8 : 4.2 + (n % 3) * 1.4;
      const wall = new T.MeshStandardMaterial({
        color: wallCols[n % wallCols.length],
        roughness: 0.88,
        metalness: downtown ? 0.12 : 0.02,
      });
      const roof = new T.MeshStandardMaterial({
        color: roofCols[n % roofCols.length],
        roughness: 0.92,
      });
      // Solid collision enabled on buildings so players and enemies cannot walk through them
      addBox(ctx, x, z, w, d, h, wall, true, 0);
      addBox(ctx, x, z, w + 0.5, d + 0.5, 0.35, roof, false, h);
      n++;
    }
  }
}

export interface MapDef {
  name: string;
  sub: string;
  swatch: string;
  build: (ctx: MapContext) => void;
  seed: number;
  theme: MapTheme;
}

export const MAPS: MapDef[] = [
  {
    name: 'Freight Yard',
    sub: 'Dusk · containers',
    swatch: 'linear-gradient(90deg,#f2a15a,#4a5260)',
    build: buildYard,
    seed: 11,
    theme: {
      hor: [0.95, 0.52, 0.28],
      mid: [0.36, 0.38, 0.46],
      top: [0.07, 0.09, 0.15],
      sunGlow: 0xffa060,
      sunDir: [-0.6, 0.18, -0.78],
      fog: 0x4a4d52,
      fogD: 0.017,
      hemiSky: 0xa8b6d4,
      hemiGround: 0x3a342c,
      hemiInt: 1.1,
      fillInt: 0.9,
      sunHex: 0xffb480,
      sunInt: 2.6,
      sunOff: [-34, 22, -46],
      exp: 1.2,
      cloud: 0.55,
      ridge: 0.7,
      weather: { count: 400, color: 0xffd9a8, size: 0.06, opacity: 0.45, fall: 0.05, wx: 0.4, wz: 0.2 },
    },
  },
  {
    name: 'Dust Outpost',
    sub: 'Midday · ruins',
    swatch: 'linear-gradient(90deg,#8ec1f0,#d9bd86)',
    build: buildDesert,
    seed: 23,
    theme: {
      hor: [0.88, 0.8, 0.64],
      mid: [0.52, 0.7, 0.92],
      top: [0.2, 0.45, 0.82],
      sunGlow: 0xfff0c8,
      sunDir: [0.35, 0.8, -0.5],
      fog: 0xd6c6a4,
      fogD: 0.011,
      hemiSky: 0xbcd4ff,
      hemiGround: 0xa08a62,
      hemiInt: 1.15,
      fillInt: 0.5,
      sunHex: 0xfff1d0,
      sunInt: 3.3,
      sunOff: [28, 42, -24],
      exp: 1.05,
      cloud: 0.28,
      ridge: 0.9,
      weather: { count: 360, color: 0xe8d3a6, size: 0.07, opacity: 0.5, fall: 0.15, wx: 7, wz: 1.5 },
    },
  },
  {
    name: 'Frost Base',
    sub: 'Overcast · snow',
    swatch: 'linear-gradient(90deg,#c4d3e2,#f2f6fa)',
    build: buildFrost,
    seed: 37,
    theme: {
      hor: [0.78, 0.84, 0.9],
      mid: [0.62, 0.7, 0.8],
      top: [0.4, 0.5, 0.65],
      sunGlow: 0xdde8ff,
      sunDir: [-0.3, 0.5, -0.8],
      fog: 0xb7c4d2,
      fogD: 0.02,
      hemiSky: 0xdfeaff,
      hemiGround: 0x9fb0c2,
      hemiInt: 1.35,
      fillInt: 0.7,
      sunHex: 0xdfe9ff,
      sunInt: 1.4,
      sunOff: [-20, 30, -30],
      exp: 1.15,
      cloud: 0.95,
      ridge: 1.1,
      weather: { count: 420, color: 0xffffff, size: 0.09, opacity: 0.85, fall: 2.6, wx: 0.9, wz: 0.3 },
    },
  },
  {
    name: 'Dead Town',
    sub: 'Survival · zombies · houses',
    swatch: 'linear-gradient(90deg,#7d8b72,#292e2d)',
    build: buildDeadTown,
    seed: 49,
    theme: {
      hor: [0.38, 0.43, 0.37],
      mid: [0.19, 0.24, 0.22],
      top: [0.035, 0.055, 0.05],
      sunGlow: 0xc6b98c,
      sunDir: [-0.5, 0.35, -0.7],
      fog: 0x343c37,
      fogD: 0.009,
      hemiSky: 0x9aa99b,
      hemiGround: 0x292d28,
      hemiInt: 1.05,
      fillInt: 0.7,
      sunHex: 0xd2c5a0,
      sunInt: 1.8,
      sunOff: [-34, 24, -46],
      exp: 1.05,
      cloud: 0.85,
      ridge: 0.5,
      weather: { count: 220, color: 0xc3c9b9, size: 0.055, opacity: 0.22, fall: 0.05, wx: 0.3, wz: 0.2 },
    },
  },
  {
    name: 'Riverside Estate',
    sub: 'Overcast · bridge & houses',
    swatch: 'linear-gradient(90deg,#456b72,#252d2b)',
    build: buildRiverside,
    seed: 67,
    theme: {
      hor: [0.48, 0.56, 0.55],
      mid: [0.22, 0.31, 0.31],
      top: [0.045, 0.08, 0.1],
      sunGlow: 0xa5c3c1,
      sunDir: [-0.4, 0.42, -0.7],
      fog: 0x3a4b4c,
      fogD: 0.008,
      hemiSky: 0x9eb8bd,
      hemiGround: 0x2a302d,
      hemiInt: 1.2,
      fillInt: 0.75,
      sunHex: 0xc2d5cf,
      sunInt: 2.0,
      sunOff: [-28, 30, -42],
      exp: 1.1,
      cloud: 0.8,
      ridge: 1.0,
      weather: { count: 200, color: 0xc4d5d4, size: 0.055, opacity: 0.2, fall: 0.04, wx: 0.25, wz: 0.3 },
    },
  },
  {
    name: 'Metro Skyline Arena',
    sub: 'Largest FPS battlefield · golden hour',
    swatch: 'linear-gradient(90deg,#f59e0b,#38bdf8,#1e293b)',
    build: buildOpenWorld,
    seed: 89,
    theme: {
      hor: [0.96, 0.54, 0.34],
      mid: [0.38, 0.46, 0.62],
      top: [0.08, 0.12, 0.24],
      sunGlow: 0xffb36b,
      sunDir: [-0.5, 0.28, -0.72],
      fog: 0x4f4858,
      fogD: 0.0038,
      hemiSky: 0x91c9ef,
      hemiGround: 0x40353a,
      hemiInt: 1.32,
      fillInt: 1.02,
      sunHex: 0xffb899,
      sunInt: 3.05,
      sunOff: [-48, 42, -62],
      exp: 1.18,
      cloud: 0.55,
      ridge: 1.1,
      weather: { count: 90, color: 0xffe4c4, size: 0.04, opacity: 0.14, fall: 0.018, wx: 0.1, wz: 0.08 },
    },
  },
];

export function generateMapArtDataUri(i: number): string {
  const t = MAPS[i].theme;
  const cl = (v: number) => Math.round(clamp(v, 0, 1) * 255);
  const rgb = (a: [number, number, number], k = 1) =>
    `rgb(${cl(a[0] * k)},${cl(a[1] * k)},${cl(a[2] * k)})`;
  const hx = (n: number) => '#' + ('000000' + n.toString(16)).slice(-6);
  const hor = rgb(t.hor);
  const mid = rgb(t.mid);
  const top = rgb(t.top);
  const sil = rgb(t.mid, 0.38);
  const sil2 = rgb(t.mid, 0.62);
  const gnd = rgb(t.hor, 0.32);

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${hor}"/></linearGradient><radialGradient id="g"><stop offset="0" stop-color="${hx(t.sunGlow)}" stop-opacity=".95"/><stop offset="1" stop-color="${hx(t.sunGlow)}" stop-opacity="0"/></radialGradient></defs>`;
  s += `<rect width="320" height="200" fill="url(#s)"/>`;
  const sx = i === 5 ? 220 : i === 1 ? 230 : i === 2 ? 90 : 70;
  const sy = i === 1 ? 42 : i === 5 ? 100 : 96;
  const sr = i === 5 ? 34 : i === 1 ? 20 : 26;
  s += `<circle cx="${sx}" cy="${sy}" r="${sr * 2.6}" fill="url(#g)"/><circle cx="${sx}" cy="${sy}" r="${sr * (i === 5 ? 1 : 0.4)}" fill="${hx(t.sunGlow)}" opacity=".9"/>`;

  const R = (x: number, y: number, w: number, h: number, f: string, o?: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"${o ? ` opacity="${o}"` : ''}/>`;
  const P = (d: string, f: string) => `<path d="${d}" fill="${f}"/>`;

  const ridge =
    'M0 128 L30 108 L55 122 L90 96 L128 120 L160 104 L200 124 L240 100 L280 118 L320 106 L320 200 L0 200Z';
  s += P(ridge, sil2);

  if (i === 0) {
    const cols = ['#a8452f', '#2f5d7a', '#b98a2a', '#556b3a'];
    for (let k = 0; k < 7; k++) {
      const x = k * 48 - 6;
      const h = 26 + ((k * 7) % 3) * 8;
      s += R(x, 150 - h, 42, h, cols[k % 4], 0.95) + R(x, 150 - h, 42, 3, 'rgba(0,0,0,.35)');
    }
  } else if (i === 1) {
    s += P('M0 150 Q60 120 120 142 T240 136 T320 144 L320 200 L0 200Z', gnd);
    s += R(40, 118, 10, 32, sil) + R(58, 128, 16, 22, sil) + R(190, 122, 12, 28, sil);
  } else if (i === 2) {
    s += P('M0 150 Q80 138 160 148 T320 142 L320 200 L0 200Z', 'rgba(235,243,250,.9)');
    for (let k = 0; k < 12; k++) {
      const x = k * 26 + ((k * 13) % 9);
      const h = 34 + ((k * 11) % 5) * 8;
      s += P(`M${x} 152 L${x + 11} ${152 - h} L${x + 22} 152Z`, k % 2 ? sil : sil2);
    }
  } else if (i === 3) {
    s += P('M0 160 L320 160 L320 200 L0 200Z', gnd);
    [
      [16, 110, 46, 50],
      [78, 98, 52, 62],
      [150, 114, 44, 46],
      [214, 100, 56, 60],
    ].forEach((h) => {
      s += R(h[0], h[1], h[2], h[3], sil);
    });
  } else if (i === 4) {
    s += P('M0 150 L320 150 L320 200 L0 200Z', gnd);
    s += P('M30 150 Q160 100 290 150 L290 156 Q160 112 30 156Z', sil);
  } else {
    for (let k = 0; k < 12; k++) {
      const x = k * 28;
      const h = 40 + ((k * 17) % 7) * 14;
      s += R(x, 160 - h, 22, h, k % 2 ? '#1a1c3a' : '#262a52');
    }
    s += R(0, 160, 320, 40, '#12132c');
  }
  s += `<rect width="320" height="200" fill="${rgb(t.hor, 0.6)}" opacity=".12"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
}
