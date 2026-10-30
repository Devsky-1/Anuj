export interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Vec2XZ {
  x: number;
  z: number;
}

export interface DifficultyConfig {
  name: string;
  sub: string;
  hp: number;
  dmg: number;
  acc: number;
  cd: number;
  tok: number;
  count: number;
  spd: number;
  regen: number;
  regenDelay: number;
  peek: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  tag: string;
  dmg: number;
  head: number;
  rate: number;
  mag: number;
  res: number;
  max: number;
  rel: number;
  hip: number;
  ads: number;
  rec: number;
  zoom: number;
  pel: number;
  muz: number;
  falloff?: boolean;
  scope?: boolean;
  grenade?: boolean;
  snd: {
    v: number;
    f: number;
    d: number;
    th: number;
  };
}

export const PLAYER_MAX_HP = 200;

export const DIFFS: DifficultyConfig[] = [
  { name: 'Easy', sub: 'Relaxed', hp: 0.75, dmg: 0.6, acc: 0.7, cd: 1.4, tok: -1, count: 0.8, spd: 0.92, regen: 20, regenDelay: 3, peek: 1.3 },
  { name: 'Normal', sub: 'Balanced', hp: 1, dmg: 1, acc: 1, cd: 1, tok: 0, count: 1, spd: 1, regen: 14, regenDelay: 4, peek: 1 },
  { name: 'Hard', sub: 'Smart squads', hp: 1.3, dmg: 1.4, acc: 1.2, cd: 0.8, tok: 1, count: 1.2, spd: 1.08, regen: 10, regenDelay: 5, peek: 0.8 },
  { name: 'Insane', sub: 'No mercy', hp: 1.7, dmg: 1.9, acc: 1.4, cd: 0.65, tok: 1, count: 1.4, spd: 1.15, regen: 6, regenDelay: 6, peek: 0.65 },
];

export const WEAPONS: WeaponDef[] = [
  { id: 'ar', name: 'Vanguard AR', tag: 'Assault rifle', dmg: 24, head: 3, rate: 0.092, mag: 30, res: 150, max: 240, rel: 1.5, hip: 0.005, ads: 0.0012, rec: 1, zoom: 50, pel: 1, muz: -0.8, snd: { v: 0.5, f: 4200, d: 0.28, th: 110 } },
  { id: 'smg', name: 'Viper SMG', tag: 'Submachine gun', dmg: 15, head: 2.4, rate: 0.056, mag: 40, res: 200, max: 320, rel: 1.3, hip: 0.007, ads: 0.003, rec: 0.6, zoom: 58, pel: 1, muz: -0.62, snd: { v: 0.38, f: 5200, d: 0.18, th: 150 } },
  { id: 'sg', name: 'Breaker 12G', tag: 'Shotgun', dmg: 11, head: 1.6, rate: 0.85, mag: 6, res: 36, max: 60, rel: 2.2, hip: 0.05, ads: 0.032, rec: 5, zoom: 62, pel: 9, muz: -0.9, falloff: true, snd: { v: 0.8, f: 2600, d: 0.42, th: 70 } },
  { id: 'sn', name: 'Longshot .338', tag: 'Sniper rifle', dmg: 125, head: 3, rate: 1.15, mag: 5, res: 25, max: 40, rel: 2.5, hip: 0.035, ads: 0.0002, rec: 7, zoom: 13, pel: 1, muz: -1.15, scope: true, snd: { v: 0.9, f: 3000, d: 0.6, th: 60 } },
  { id: 'pi', name: 'Ranger Pistol', tag: 'Semi-auto pistol', dmg: 34, head: 2.6, rate: 0.24, mag: 12, res: 72, max: 120, rel: 1.05, hip: 0.012, ads: 0.0028, rec: 1.8, zoom: 60, pel: 1, muz: -0.62, snd: { v: 0.3, f: 3600, d: 0.2, th: 160 } },
  { id: 'gr', name: 'Frag Grenade', tag: 'Explosive · throw', dmg: 115, head: 1, rate: 0.9, mag: 2, res: 6, max: 12, rel: 1.2, hip: 0.01, ads: 0.01, rec: 0.3, zoom: 65, pel: 1, muz: -0.45, snd: { v: 0.5, f: 700, d: 0.5, th: 90 }, grenade: true },
];

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export function createSeededRng(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveCircleAABBCollision(
  p: Vec2XZ,
  r: number,
  obs: ObstacleBox[],
  bound: number
): Vec2XZ {
  for (const o of obs) {
    const cx = clamp(p.x, o.minX, o.maxX);
    const cz = clamp(p.z, o.minZ, o.maxZ);
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const k = r - d;
        p.x += (dx / d) * k;
        p.z += (dz / d) * k;
      } else {
        const l = p.x - o.minX;
        const rr = o.maxX - p.x;
        const t = p.z - o.minZ;
        const b = o.maxZ - p.z;
        const m = Math.min(l, rr, t, b);
        if (m === l) p.x = o.minX - r;
        else if (m === rr) p.x = o.maxX + r;
        else if (m === t) p.z = o.minZ - r;
        else p.z = o.maxZ + r;
      }
    }
  }
  p.x = clamp(p.x, -bound + r, bound - r);
  p.z = clamp(p.z, -bound + r, bound - r);
  return p;
}

export function isPointBlocked(x: number, z: number, obs: ObstacleBox[], margin = 1): boolean {
  return obs.some(
    (o) => x > o.minX - margin && x < o.maxX + margin && z > o.minZ - margin && z < o.maxZ + margin
  );
}

export type EnemyType = 'grunt' | 'rusher' | 'heavy' | 'marksman' | 'zombie';

export function buildWaveQueue(
  mode: string,
  mapIdx: number,
  wave: number,
  diffCountMultiplier: number,
  rngFn: () => number = Math.random
): EnemyType[] {
  const base =
    mode === 'megafps'
      ? Math.min(42, 20 + wave * 4)
      : mode === 'br'
      ? 28
      : mode === 'cod'
      ? 12
      : (mapIdx === 3 ? 14 : 9) + wave * (mapIdx === 3 ? 6 : 3);
  const n = Math.max(1, Math.round(base * diffCountMultiplier));
  const q: EnemyType[] = [];
  let heavies = 0;
  let marks = 0;
  for (let i = 0; i < n; i++) {
    const r = rngFn();
    if (mapIdx === 3) {
      q.push('zombie');
      continue;
    }
    if (wave >= 3 && r < 0.13 && heavies < Math.ceil(wave / 3)) {
      q.push('heavy');
      heavies++;
    } else if (wave >= 4 && r < 0.25 && marks < Math.ceil((wave - 2) / 3)) {
      q.push('marksman');
      marks++;
    } else if (wave >= 2 && r < 0.42) {
      q.push('rusher');
    } else {
      q.push('grunt');
    }
  }
  return q;
}

export function computeWeaponDamage(
  weapon: WeaponDef,
  isHeadshot: boolean,
  distance: number
): number {
  const fall = weapon.falloff ? clamp(1.15 - distance / 22, 0.2, 1) : 1;
  return weapon.dmg * (isHeadshot ? weapon.head : 1) * fall;
}

export function selectWheelSlot(vx: number, vy: number, currentSlot: number, totalSlots: number): number {
  if (Math.hypot(vx, vy) <= 32) return currentSlot;
  let a = Math.atan2(vy, vx) + Math.PI / 2;
  a = (a + Math.PI * 2) % (Math.PI * 2);
  return Math.round((a / (Math.PI * 2)) * totalSlots) % totalSlots;
}

export function applyMedkitHeal(
  currentHp: number,
  medkits: number,
  cooldown: number
): { hp: number; medkits: number; healed: boolean } {
  if (medkits <= 0 || currentHp >= PLAYER_MAX_HP || cooldown > 0) {
    return { hp: currentHp, medkits, healed: false };
  }
  return {
    hp: Math.min(PLAYER_MAX_HP, currentHp + 65),
    medkits: medkits - 1,
    healed: true,
  };
}

export function computeRegenHp(
  currentHp: number,
  lastHurt: number,
  regenDelay: number,
  regenRate: number,
  dt: number
): number {
  if (lastHurt > regenDelay && currentHp < PLAYER_MAX_HP && currentHp > 0) {
    return Math.min(PLAYER_MAX_HP, currentHp + regenRate * dt);
  }
  return currentHp;
}

export function formatHudStatusLeft(
  mode: string,
  runTime: number,
  kills: number,
  remainingEnemies: number,
  playerDistFromOrigin = 0
): string {
  if (mode === 'timed') {
    return `${Math.max(0, Math.ceil(180 - runTime))}s left`;
  }
  if (mode === 'cod') {
    return `${Math.max(0, 30 - kills)} kills to win`;
  }
  if (mode === 'br') {
    const stormR = Math.max(14, 86 - runTime * 0.35);
    return `${Math.max(0, Math.ceil(180 - runTime))}s · ${playerDistFromOrigin > stormR ? 'STORM!' : 'SAFE ZONE'}`;
  }
  return `${remainingEnemies} left`;
}
