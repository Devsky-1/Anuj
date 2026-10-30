import * as T from 'three';
import { EnemyType, DifficultyConfig, ObstacleBox, isPointBlocked } from './rules';

export interface EnemyActor {
  g: T.Group;
  type: EnemyType;
  def: {
    hp: number;
    spd: number;
    dmg: number;
    scale: number;
    cd?: [number, number];
    burst?: [number, number];
    range?: [number, number];
  };
  sc: number;
  hp: number;
  maxhp: number;
  dead: boolean;
  t: number;
  shootT: number;
  strafe: number;
  strafeT: number;
  speed: number;
  deadT: number;
  fd: number;
  parts: T.Mesh[];
  legs: T.Group[];
  dmg: number;
  vx: number;
  vz: number;
  stag: number;
  los: boolean;
  losT: number;
  yaw: number;
  meleeT: number;
  canShoot: boolean;
  mode: string;
  modeT: number;
  aimT: number;
  burst: number;
  burstMax: number;
  cover: { x: number; z: number } | null;
  range: number;
  bar: T.Group;
  fg: T.Mesh;
  fm: T.MeshBasicMaterial;
  laser?: T.Mesh;
}

export interface PickupItem {
  m: T.Group;
  kind: 'health' | 'loot';
  t: number;
  loot: boolean;
}

const EG = {
  torso: new T.BoxGeometry(0.5, 0.62, 0.28),
  vest: new T.BoxGeometry(0.54, 0.42, 0.33),
  head: new T.SphereGeometry(0.12, 14, 10),
  helm: new T.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  hood: new T.SphereGeometry(0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
  visor: new T.BoxGeometry(0.2, 0.035, 0.03),
  band: new T.BoxGeometry(0.26, 0.06, 0.26),
  leg: new T.BoxGeometry(0.18, 0.8, 0.2),
  arm: new T.BoxGeometry(0.13, 0.58, 0.13),
  gun: new T.BoxGeometry(0.07, 0.1, 0.7),
  rifle: new T.BoxGeometry(0.06, 0.08, 1.05),
  pack: new T.BoxGeometry(0.36, 0.42, 0.16),
  pouch: new T.BoxGeometry(0.12, 0.1, 0.08),
  pad: new T.BoxGeometry(0.22, 0.1, 0.3),
  scope: new T.BoxGeometry(0.05, 0.05, 0.2),
  shadow: new T.CircleGeometry(0.45, 14),
};

const contactShadowMat = new T.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
});

function mset(cloth: number, vest: number, helm: number, glow: number, metal = 0.1) {
  return {
    cloth: new T.MeshStandardMaterial({ color: cloth, roughness: 0.9 }),
    vest: new T.MeshStandardMaterial({ color: vest, roughness: 0.6, metalness: metal }),
    helm: new T.MeshStandardMaterial({ color: helm, roughness: 0.5, metalness: 0.35 }),
    glow: new T.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 2.2 }),
    skin: new T.MeshStandardMaterial({ color: 0x8a6a55, roughness: 0.8 }),
    gun: new T.MeshStandardMaterial({ color: 0x151719, roughness: 0.4, metalness: 0.8 }),
  };
}

const EM = {
  grunt: [mset(0x263d2b, 0x111713, 0x090d0b, 0x3b9d57), mset(0x172a40, 0x10151c, 0x080c12, 0x397ac4)],
  rusher: [mset(0x29462f, 0x121713, 0x090d0b, 0x43b765), mset(0x18314b, 0x10151c, 0x080c12, 0x4a8ee0)],
  heavy: [
    mset(0x202923, 0x303a33, 0x090d0b, 0x3a9b59, 0.6),
    mset(0x1b2d42, 0x252d38, 0x080c12, 0x397ac4, 0.6),
  ],
  marksman: [mset(0x263d2b, 0x111713, 0x090d0b, 0x3b9d57), mset(0x172a40, 0x10151c, 0x080c12, 0x397ac4)],
  zombie: [
    mset(0x29462f, 0x141a15, 0x080c09, 0x3b9d57),
    mset(0x172b42, 0x11161d, 0x080c12, 0x397ac4),
    mset(0x202923, 0x111713, 0x090d0b, 0x4a8ee0),
  ],
};

export const EDEF: Record<
  EnemyType,
  {
    hp: number;
    spd: number;
    dmg: number;
    scale: number;
    cd?: [number, number];
    burst?: [number, number];
    range?: [number, number];
  }
> = {
  grunt: { hp: 130, spd: 3.3, dmg: 6, scale: 1, cd: [0.12, 0.2], burst: [3, 5], range: [12, 20] },
  rusher: { hp: 85, spd: 6.4, dmg: 11, scale: 0.95 },
  heavy: { hp: 420, spd: 2.1, dmg: 9, scale: 1.22, cd: [0.09, 0.16], burst: [5, 8], range: [9, 15] },
  marksman: { hp: 90, spd: 2.6, dmg: 26, scale: 1, range: [30, 38] },
  zombie: { hp: 145, spd: 3.15, dmg: 18, scale: 1.06 },
};

const barGeo = new T.PlaneGeometry(1, 0.09);
const barFillGeo = new T.PlaneGeometry(1, 0.09);
barFillGeo.translate(0.5, 0, 0);
const barBg = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, fog: false });
const laserMat = new T.MeshBasicMaterial({
  color: 0xff2a2a,
  transparent: true,
  opacity: 0.75,
  blending: T.AdditiveBlending,
  depthWrite: false,
  fog: false,
});

export function createEnemyActor(
  scene: T.Scene,
  trGeo: T.BufferGeometry,
  x: number,
  z: number,
  type: EnemyType,
  wave: number,
  D: DifficultyConfig
): EnemyActor {
  const def = EDEF[type];
  const M = EM[type][Math.floor(Math.random() * EM[type].length)];
  const g = new T.Group();
  g.rotation.order = 'YXZ';
  g.position.set(x, 0, z);
  const sc = def.scale * (0.96 + Math.random() * 0.08);
  g.scale.setScalar(sc);

  // Contact shadow disc
  const cShadow = new T.Mesh(EG.shadow, contactShadowMat);
  cShadow.rotation.x = -Math.PI / 2;
  cShadow.position.y = 0.015;
  g.add(cShadow);

  const hpMax = def.hp * D.hp * (1 + wave * 0.03);
  const bar = new T.Group();
  const bg = new T.Mesh(barGeo, barBg);
  const fm = new T.MeshBasicMaterial({ color: 0xd6442e, fog: false });
  const fg = new T.Mesh(barFillGeo, fm);
  fg.position.set(-0.5, 0, 0.001);
  bar.add(bg);
  bar.add(fg);
  bar.scale.set(type === 'heavy' ? 1.3 : 0.9, 1, 1);
  scene.add(bar);
  bar.visible = false;

  const e: EnemyActor = {
    g,
    type,
    def,
    sc,
    hp: hpMax,
    maxhp: hpMax,
    dead: false,
    t: Math.random() * 5,
    shootT: 1.2 + Math.random() * 1.2,
    strafe: Math.random() > 0.5 ? 1 : -1,
    strafeT: 1 + Math.random() * 2,
    speed: def.spd * D.spd * (0.92 + Math.random() * 0.16),
    deadT: 0,
    fd: Math.random() > 0.5 ? 1 : -1,
    parts: [],
    legs: [],
    dmg: (def.dmg + Math.min(wave, 6) * 0.6) * D.dmg,
    vx: 0,
    vz: 0,
    stag: 0,
    los: false,
    losT: Math.random() * 0.25,
    yaw: 0,
    meleeT: 0,
    canShoot: false,
    mode: 'advance',
    modeT: 0,
    aimT: 0,
    burst: 0,
    burstMax: def.burst ? Math.round(def.burst[0] + Math.random() * (def.burst[1] - def.burst[0])) : 0,
    cover: null,
    range: def.range ? def.range[0] + Math.random() * (def.range[1] - def.range[0]) : 0,
    bar,
    fg,
    fm,
  };

  const mk = (
    geo: T.BufferGeometry,
    mat: T.Material,
    px: number,
    py: number,
    pz: number,
    parent?: T.Object3D | null,
    head = false,
    shadow = false
  ) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.castShadow = shadow;
    m.userData = { enemy: e, head };
    (parent || g).add(m);
    e.parts.push(m);
    return m;
  };

  if (type === 'zombie') {
    mk(EG.torso, M.cloth, 0, 1.08, 0, null, false, true);
    mk(EG.head, M.skin, 0, 1.58, 0.06, null, true);
    const woundMat = new T.MeshStandardMaterial({ color: 0x572b25, roughness: 0.86 });
    mk(new T.SphereGeometry(0.12, 8, 6), woundMat, -0.17, 1.64, 0.13, null, true);
    mk(EG.arm, M.cloth, -0.31, 1.04, 0.06);
    mk(EG.arm, M.cloth, 0.31, 0.96, 0.1);
    [-1, 1].forEach((side) => {
      const lp = new T.Group();
      lp.position.set(side * 0.14, 0.78, 0);
      g.add(lp);
      mk(EG.leg, M.cloth, 0, -0.39, 0, lp, false, true);
      e.legs.push(lp);
    });
    g.rotation.z = (Math.random() - 0.5) * 0.12;
  } else {
    mk(EG.torso, M.cloth, 0, 1.12, 0, null, false, true);
    mk(EG.vest, M.vest, 0, 1.18, 0);
    mk(EG.head, M.skin, 0, 1.62, 0.01, null, true);
    if (type === 'rusher') {
      mk(EG.band, M.glow, 0, 1.68, 0.01, null, true);
    } else if (type === 'marksman') {
      mk(EG.hood, M.helm, 0, 1.63, 0.0, null, true);
      mk(EG.visor, M.glow, 0, 1.64, 0.15, null, true);
    } else {
      mk(EG.helm, M.helm, 0, 1.64, 0.01, null, true);
      mk(EG.visor, M.glow, 0, 1.665, 0.15, null, true);
    }
    mk(EG.pack, M.cloth, 0, 1.15, -0.22);
    mk(EG.pouch, M.vest, 0.18, 0.88, 0.14);
    mk(EG.pouch, M.vest, -0.18, 0.88, 0.14);
    if (type === 'heavy') {
      mk(EG.pad, M.vest, 0.36, 1.42, 0);
      mk(EG.pad, M.vest, -0.36, 1.42, 0);
    }
    [-1, 1].forEach((s) => {
      const lp = new T.Group();
      lp.position.set(s * 0.13, 0.8, 0);
      g.add(lp);
      mk(EG.leg, M.cloth, 0, -0.4, 0, lp, false, true);
      e.legs.push(lp);
      const ap = new T.Group();
      ap.position.set(s * 0.34, 1.4, 0);
      ap.rotation.x = -1.35;
      ap.rotation.z = -s * 0.12;
      g.add(ap);
      mk(EG.arm, M.cloth, 0, -0.29, 0, ap);
    });
    if (type === 'marksman') {
      mk(EG.rifle, M.gun, 0.14, 1.22, 0.6);
      mk(EG.scope, M.glow, 0.14, 1.29, 0.5);
    } else {
      mk(EG.gun, M.gun, 0.14, 1.2, 0.5);
    }
  }

  scene.add(g);
  if (type === 'marksman') {
    const L = new T.Mesh(trGeo, laserMat);
    L.userData.w = 0.5;
    L.visible = false;
    scene.add(L);
    e.laser = L;
  }
  return e;
}

export function createPickupCrate(scene: T.Scene, pos: T.Vector3): PickupItem {
  const kind = Math.random() < 0.18 ? 'health' : 'loot';
  const box = new T.Group();
  const base = new T.Mesh(
    new T.BoxGeometry(0.58, 0.34, 0.48),
    new T.MeshStandardMaterial({
      color: kind === 'health' ? 0x6b9d54 : 0x24372b,
      roughness: 0.7,
      metalness: 0.12,
    })
  );
  base.castShadow = true;
  box.add(base);
  const lid = new T.Mesh(
    new T.BoxGeometry(0.6, 0.09, 0.5),
    new T.MeshStandardMaterial({
      color: kind === 'health' ? 0x9fcf70 : 0x3f5f47,
      roughness: 0.55,
      metalness: 0.15,
    })
  );
  lid.position.y = 0.2;
  lid.castShadow = true;
  box.add(lid);
  const stripe = new T.Mesh(
    new T.BoxGeometry(0.08, 0.012, 0.51),
    new T.MeshStandardMaterial({ color: 0x3e9de0, emissive: 0x1a5b88, emissiveIntensity: 0.35 })
  );
  stripe.position.y = 0.25;
  box.add(stripe);
  box.position.set(pos.x, 0.35, pos.z);
  scene.add(box);
  return { m: box, kind, t: 0, loot: true };
}

export function findCoverSpot(
  e: EnemyActor,
  playerPos: T.Vector3,
  obs: ObstacleBox[],
  bound: number
): { x: number; z: number } | null {
  const g = e.g.position;
  let best: { x: number; z: number } | null = null;
  let bs = 1e9;
  for (const o of obs) {
    const hw = (o.maxX - o.minX) / 2;
    const hd = (o.maxZ - o.minZ) / 2;
    if (Math.max(hw, hd) > 8 || Math.max(hw, hd) < 0.3) continue;
    const cx = (o.minX + o.maxX) / 2;
    const cz = (o.minZ + o.maxZ) / 2;
    const dpx = cx - playerPos.x;
    const dpz = cz - playerPos.z;
    const dp = Math.hypot(dpx, dpz);
    if (dp < 7 || dp > 34) continue;
    const dg = Math.hypot(cx - g.x, cz - g.z);
    if (dg > 20) continue;
    const nx = dpx / dp;
    const nz = dpz / dp;
    const ext = Math.abs(nx) * hw + Math.abs(nz) * hd;
    const px = cx + nx * (ext + 1.15);
    const pz = cz + nz * (ext + 1.15);
    if (Math.abs(px) > bound - 2 || Math.abs(pz) > bound - 2 || isPointBlocked(px, pz, obs, 1))
      continue;
    const s = dg + Math.random() * 5;
    if (s < bs) {
      bs = s;
      best = { x: px, z: pz };
    }
  }
  return best;
}
