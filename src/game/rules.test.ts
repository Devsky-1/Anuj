import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEAPONS,
  DIFFS,
  PLAYER_MAX_HP,
  clamp,
  createSeededRng,
  resolveCircleAABBCollision,
  isPointBlocked,
  buildWaveQueue,
  computeWeaponDamage,
  selectWheelSlot,
  applyMedkitHeal,
  computeRegenHp,
  formatHudStatusLeft,
} from './rules';

test('clamp constrains numbers within bounds', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
});

test('seeded RNG produces deterministic sequences in [0, 1)', () => {
  const r1 = createSeededRng(42);
  const r2 = createSeededRng(42);
  for (let i = 0; i < 10; i++) {
    const v1 = r1();
    const v2 = r2();
    assert.equal(v1, v2);
    assert.ok(v1 >= 0 && v1 < 1);
  }
});

test('resolveCircleAABBCollision pushes circle outside obstacle and clamps arena bounds', () => {
  const obs = [{ minX: -2, maxX: 2, minZ: -2, maxZ: 2 }];
  const pos = resolveCircleAABBCollision({ x: 2.1, z: 0 }, 0.5, obs, 50);
  assert.ok(pos.x >= 2.49, `Expected x >= 2.49, got ${pos.x}`);

  const outOfBounds = resolveCircleAABBCollision({ x: 100, z: -100 }, 0.5, [], 50);
  assert.equal(outOfBounds.x, 49.5);
  assert.equal(outOfBounds.z, -49.5);
});

test('isPointBlocked detects points inside obstacle + margin', () => {
  const obs = [{ minX: -5, maxX: 5, minZ: -5, maxZ: 5 }];
  assert.equal(isPointBlocked(0, 0, obs, 1), true);
  assert.equal(isPointBlocked(5.5, 0, obs, 1), true);
  assert.equal(isPointBlocked(6.5, 0, obs, 1), false);
});

test('buildWaveQueue returns zombies on Dead Town (map 3) and mixed squad on other maps', () => {
  const rng = createSeededRng(11);
  const zombieWave = buildWaveQueue('endless', 3, 2, DIFFS[1].count, rng);
  assert.ok(zombieWave.length > 0);
  assert.ok(zombieWave.every((t) => t === 'zombie'));

  const squadWave = buildWaveQueue('endless', 0, 5, DIFFS[2].count, rng);
  assert.ok(squadWave.length > 10);
  assert.ok(squadWave.includes('grunt'));
});

test('computeWeaponDamage calculates headshot multiplier and shotgun distance falloff', () => {
  const ar = WEAPONS[0]; // Vanguard AR: dmg 24, head 3
  assert.equal(computeWeaponDamage(ar, false, 15), 24);
  assert.equal(computeWeaponDamage(ar, true, 15), 72);

  const sg = WEAPONS[2]; // Breaker 12G: dmg 11, falloff true
  const closeDmg = computeWeaponDamage(sg, false, 2);
  const farDmg = computeWeaponDamage(sg, false, 30);
  assert.ok(closeDmg > farDmg);
  assert.equal(farDmg, 11 * 0.2);
});

test('selectWheelSlot maps 2D drag vectors to 6 radial weapon slots', () => {
  // Upward drag (0, -100) -> slot 0
  assert.equal(selectWheelSlot(0, -100, 2, 6), 0);
  // Downward drag (0, 100) -> slot 3
  assert.equal(selectWheelSlot(0, 100, 0, 6), 3);
  // Small deadzone movement keeps current slot
  assert.equal(selectWheelSlot(5, 5, 4, 6), 4);
});

test('applyMedkitHeal and computeRegenHp restore player health up to PLAYER_MAX_HP', () => {
  const healRes = applyMedkitHeal(120, 2, 0);
  assert.equal(healRes.healed, true);
  assert.equal(healRes.hp, 185);
  assert.equal(healRes.medkits, 1);

  const blockedFull = applyMedkitHeal(PLAYER_MAX_HP, 2, 0);
  assert.equal(blockedFull.healed, false);

  const regenRes = computeRegenHp(150, 5.0, 4.0, 14, 1.0);
  assert.equal(regenRes, 164);
});

test('formatHudStatusLeft formats mode-specific objective status strings', () => {
  assert.equal(formatHudStatusLeft('endless', 45, 10, 7), '7 left');
  assert.equal(formatHudStatusLeft('timed', 60, 10, 7), '120s left');
  assert.equal(formatHudStatusLeft('cod', 60, 12, 5), '18 kills to win');
});
