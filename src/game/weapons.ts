import * as T from 'three';
import { WEAPONS } from './rules';
import { canvasTex, lightDark } from './textures';

export interface GunViewmodelResult {
  gun: T.Group;
  models: T.Group[];
  flashTex: T.CanvasTexture;
}

export function createGunViewmodel(): GunViewmodelResult {
  const gun = new T.Group();
  const models: T.Group[] = [];

  const steel = new T.MeshStandardMaterial({ color: 0x22262a, metalness: 0.9, roughness: 0.32 });
  const poly = new T.MeshStandardMaterial({ color: 0x14161a, metalness: 0.2, roughness: 0.7 });
  const tan = new T.MeshStandardMaterial({ color: 0x6b5d44, metalness: 0.1, roughness: 0.65 });
  const wood = new T.MeshStandardMaterial({ color: 0x5a3b22, metalness: 0.05, roughness: 0.6 });
  const lens = new T.MeshStandardMaterial({ color: 0x4aa0ff, emissive: 0x2a70ff, emissiveIntensity: 1.2, metalness: 0.2, roughness: 0.1 });
  const dot = new T.MeshStandardMaterial({ color: 0xff3a2a, emissive: 0xff3a2a, emissiveIntensity: 2 });
  const B = (a: number, b: number, c: number) => new T.BoxGeometry(a, b, c);
  const C = (r: number, l: number) => new T.CylinderGeometry(r, r, l, 10);
  const PI2 = Math.PI / 2;

  const gloveTex = canvasTex(
    128,
    128,
    (x, w, h) => {
      x.fillStyle = '#262a2e';
      x.fillRect(0, 0, w, h);
      const ld = lightDark(0.2);
      for (let i = 0; i < 2000; i++) {
        x.fillStyle = ld(Math.random());
        x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      x.strokeStyle = 'rgba(255,255,255,.05)';
      for (let i = 0; i < h; i += 4) {
        x.beginPath();
        x.moveTo(0, i);
        x.lineTo(w, i);
        x.stroke();
      }
    },
    true
  );

  const sleeveTex = canvasTex(
    128,
    128,
    (x, w, h) => {
      x.fillStyle = '#4c5538';
      x.fillRect(0, 0, w, h);
      const ld = lightDark(0.24);
      for (let i = 0; i < 2800; i++) {
        x.fillStyle = ld(Math.random());
        x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      x.fillStyle = 'rgba(0,0,0,.13)';
      for (let i = 0; i < 18; i++) {
        x.fillRect(Math.random() * w, Math.random() * h, 10 + Math.random() * 24, 6 + Math.random() * 14);
      }
    },
    true
  );

  const glove = new T.MeshStandardMaterial({ map: gloveTex, roughness: 0.86, metalness: 0.02 });
  const pad = new T.MeshStandardMaterial({ color: 0x0e1012, roughness: 0.45, metalness: 0.4 });
  const skin = new T.MeshStandardMaterial({ color: 0xb98462, roughness: 0.6, metalness: 0 });
  const sleeve = new T.MeshStandardMaterial({ map: sleeveTex, roughness: 0.93, metalness: 0 });
  const strap = new T.MeshStandardMaterial({ color: 0x6b5d44, roughness: 0.8 });
  const dark = new T.MeshStandardMaterial({ color: 0x07080a, metalness: 0.3, roughness: 0.6 });
  const blk = new T.MeshStandardMaterial({ color: 0x1a1d21, metalness: 0.85, roughness: 0.34 });
  const brass = new T.MeshStandardMaterial({ color: 0xb38a3c, metalness: 0.9, roughness: 0.3 });
  const red = new T.MeshStandardMaterial({ color: 0xa3231c, roughness: 0.55, metalness: 0.05 });

  const mk = (
    p: T.Object3D,
    geo: T.BufferGeometry,
    mat: T.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0
  ) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    p.add(m);
    return m;
  };
  const HB = (a: number, b: number, c: number) => new T.BoxGeometry(a, b, c);
  const V3 = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
  const CG = (r: number, l: number) => new T.CapsuleGeometry(r, l, 3, 8);

  function vHand(p: T.Object3D, x: number, y: number, z: number, sd: number, rx = 0) {
    const h = new T.Group();
    h.position.set(x, y, z);
    h.rotation.x = rx;
    mk(h, HB(0.034, 0.088, 0.068), glove, sd * 0.042, 0, 0);
    mk(h, HB(0.028, 0.03, 0.036), pad, sd * 0.061, 0.014, -0.012);
    for (let i = 0; i < 4; i++) {
      const yy = 0.031 - i * 0.021;
      mk(h, CG(0.0112, 0.05), glove, sd * 0.003, yy, -0.047, 0, 0, Math.PI / 2);
      mk(h, CG(0.0098, 0.022), glove, -sd * 0.034, yy, -0.036, 0, 0, Math.PI / 2);
      mk(h, CG(0.0075, 0.008), skin, -sd * 0.044, yy, -0.03, 0, 0, Math.PI / 2);
    }
    mk(h, CG(0.0118, 0.04), glove, -sd * 0.034, 0.034, 0.008, 0.9, 0, 0);
    mk(h, CG(0.0085, 0.01), skin, -sd * 0.036, 0.046, -0.02, 0.9, 0, 0);
    p.add(h);
    return h;
  }

  function hHand(p: T.Object3D, x: number, y: number, z: number, half: number) {
    const h = new T.Group();
    h.position.set(x, y, z);
    const fx = half + 0.013;
    mk(h, HB(half * 2 + 0.03, 0.03, 0.1), glove, 0, -0.012, 0);
    mk(h, HB(0.05, 0.012, 0.05), pad, fx * 0.4, -0.027, 0);
    for (let i = 0; i < 4; i++) {
      const zz = -0.04 + i * 0.026;
      mk(h, CG(0.0112, 0.034), glove, fx, 0.012, zz);
      mk(h, CG(0.0098, 0.02), glove, fx - 0.014, 0.044, zz, 0, 0, Math.PI / 2.4);
      mk(h, CG(0.0075, 0.008), skin, fx - 0.026, 0.05, zz, 0, 0, Math.PI / 2.4);
    }
    mk(h, CG(0.0118, 0.04), glove, -fx, 0.012, -0.02, Math.PI / 2.6, 0, 0);
    mk(h, CG(0.0085, 0.01), skin, -fx + 0.004, 0.03, -0.05, Math.PI / 2.6, 0, 0);
    p.add(h);
    return h;
  }

  function arm(p: T.Object3D, w: T.Vector3, e: T.Vector3) {
    const d = V3(0, 0, 0).subVectors(e, w);
    const len = d.length();
    const a = new T.Group();
    a.position.copy(w);
    a.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
    mk(a, new T.CylinderGeometry(0.03, 0.028, 0.06, 12), skin, 0, 0.03, 0);
    mk(a, new T.CylinderGeometry(0.04, 0.036, 0.09, 12), glove, 0, 0.07, 0);
    mk(a, new T.CylinderGeometry(0.043, 0.043, 0.016, 12), strap, 0, 0.11, 0);
    mk(a, new T.CylinderGeometry(0.066, 0.047, len - 0.1, 14), sleeve, 0, 0.1 + (len - 0.1) / 2, 0);
    mk(a, new T.CylinderGeometry(0.05, 0.05, 0.014, 14), sleeve, 0, 0.105, 0);
    p.add(a);
    return a;
  }

  const handsFor = (
    g: T.Group,
    cfg: { r: number[] | null; l: [number, number, number, number, string?, number?] | null }
  ) => {
    if (cfg.r) {
      const r = cfg.r;
      vHand(g, r[0], r[1], r[2], 1, r[3]);
      arm(g, V3(r[0] + 0.02, r[1] - 0.06, r[2] + 0.07), V3(r[0] + 0.12, r[1] - 0.34, r[2] + 0.62));
    }
    if (cfg.l) {
      const l = cfg.l;
      const rig = new T.Group();
      rig.position.set(-0.22, -0.46, 0.44);
      const hx = l[0] - rig.position.x;
      const hy = l[1] - rig.position.y;
      const hz = l[2] - rig.position.z;
      if (l[4] === 'v') vHand(rig, hx, hy, hz, -1, l[5] || 0);
      else hHand(rig, hx, hy, hz, l[3]);
      arm(rig, V3(hx - 0.005, hy - 0.02, hz + 0.075), V3(0, 0, 0));
      g.add(rig);
      g.userData.lh = rig;
    }
  };

  WEAPONS.forEach((w) => {
    const g = new T.Group();
    const add = (
      geo: T.BufferGeometry,
      mat: T.Material,
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
      rz = 0
    ) => mk(g, geo, mat, x, y, z, rx, ry, rz);

    if (w.id === 'ar') {
      add(B(0.06, 0.09, 0.38), blk, 0, 0, 0);
      add(B(0.063, 0.05, 0.2), steel, 0, -0.036, 0.04);
      add(B(0.055, 0.05, 0.3), poly, 0, 0.01, -0.3);
      add(B(0.062, 0.04, 0.18), tan, 0, -0.045, -0.28);
      for (let i = 0; i < 5; i++) add(B(0.058, 0.016, 0.02), dark, 0, 0.014, -0.2 - i * 0.05);
      add(C(0.012, 0.3), steel, 0, 0.015, -0.55, PI2);
      add(C(0.02, 0.06), steel, 0, 0.015, -0.7, PI2);
      add(C(0.018, 0.07), blk, 0, 0.015, -0.75, PI2);
      add(B(0.045, 0.02, 0.2), steel, 0, 0.06, -0.02);
      for (let i = 0; i < 11; i++) add(B(0.034, 0.006, 0.018), blk, 0, 0.073, -0.4 + i * 0.05);
      add(B(0.02, 0.05, 0.03), steel, 0, 0.04, -0.46);
      add(B(0.05, 0.16, 0.07), poly, 0, -0.12, 0.02, 0.28);
      add(B(0.04, 0.12, 0.05), poly, 0, -0.11, 0.17, -0.2);
      add(B(0.05, 0.075, 0.22), tan, 0, -0.01, 0.28);
    } else if (w.id === 'smg') {
      add(B(0.055, 0.085, 0.3), blk, 0, 0, 0);
      add(B(0.05, 0.05, 0.2), poly, 0, 0.01, -0.22);
      add(C(0.011, 0.2), steel, 0, 0.012, -0.44, PI2);
      add(C(0.018, 0.1), blk, 0, 0.012, -0.56, PI2);
      add(B(0.04, 0.2, 0.05), poly, 0, -0.15, -0.06, 0.08);
      add(B(0.045, 0.12, 0.06), poly, 0, -0.1, 0.1, -0.25);
      add(B(0.04, 0.05, 0.18), steel, 0, 0.01, 0.22);
      add(B(0.034, 0.034, 0.07), dot, 0, 0.07, -0.05);
      add(B(0.034, 0.04, 0.004), lens, 0, 0.072, -0.087);
    } else if (w.id === 'sg') {
      add(B(0.065, 0.095, 0.34), blk, 0, 0, 0);
      add(C(0.022, 0.66), steel, 0, 0.02, -0.52, PI2);
      add(C(0.017, 0.5), steel, 0, -0.035, -0.46, PI2);
      add(B(0.075, 0.06, 0.18), wood, 0, -0.03, -0.38);
      add(B(0.055, 0.1, 0.3), wood, 0, -0.02, 0.3);
      add(B(0.04, 0.12, 0.05), poly, 0, -0.1, 0.12, -0.25);
      add(B(0.012, 0.03, 0.012), dot, 0, 0.058, -0.84);
      for (let i = 0; i < 4; i++) {
        add(C(0.009, 0.045), red, 0.031, 0.02, 0.18 + i * 0.03, 0, 0, PI2);
        const s = add(C(0.006, 0.012), brass, 0.031, 0.02, 0.18 + i * 0.03, 0, 0, PI2);
        s.position.x = 0.047;
      }
    } else if (w.id === 'pi') {
      add(B(0.055, 0.085, 0.23), steel, 0, 0, 0);
      add(B(0.05, 0.07, 0.12), poly, 0, 0.025, -0.12);
      add(B(0.045, 0.14, 0.055), poly, 0, -0.105, 0.055, -0.12);
      add(C(0.01, 0.05), blk, 0, 0.02, -0.2, PI2);
      add(B(0.012, 0.025, 0.025), dot, 0, 0.052, -0.1);
    } else if (w.id === 'gr') {
      const gm = new T.MeshStandardMaterial({ color: 0x33452a, roughness: 0.78, metalness: 0.2 });
      add(new T.SphereGeometry(0.09, 16, 12), gm, 0, 0, -0.12);
      for (let k = -2; k <= 2; k++) add(C(0.0905 - Math.abs(k) * 0.008, 0.005), dark, 0, k * 0.028, -0.12);
      add(C(0.02, 0.05), steel, 0, 0.1, -0.12);
      add(B(0.045, 0.016, 0.13), steel, 0, 0.126, -0.12);
      add(new T.TorusGeometry(0.022, 0.003, 6, 14), brass, 0.034, 0.12, -0.12, PI2);
    } else {
      add(B(0.055, 0.085, 0.4), blk, 0, 0, 0);
      add(C(0.013, 0.86), steel, 0, 0.015, -0.64, PI2);
      add(C(0.02, 0.12), blk, 0, 0.015, -1.05, PI2);
      add(B(0.065, 0.05, 0.34), poly, 0, -0.045, -0.34);
      add(C(0.03, 0.3), blk, 0, 0.095, -0.04, PI2);
      add(C(0.031, 0.01), lens, 0, 0.095, -0.23, PI2);
      add(B(0.06, 0.1, 0.36), tan, 0, -0.02, 0.32);
      add(B(0.04, 0.12, 0.05), poly, 0, -0.1, 0.1, -0.25);
    }

    const handConfigs: Record<string, { r: number[] | null; l: [number, number, number, number, string?, number?] | null }> = {
      ar: { r: [0, -0.11, 0.17, -0.2], l: [0, -0.078, -0.3, 0.031] },
      smg: { r: [0, -0.1, 0.1, -0.25], l: [0, -0.027, -0.24, 0.025] },
      sg: { r: [0, -0.1, 0.12, -0.25], l: [0, -0.065, -0.38, 0.037] },
      sn: { r: [0, -0.1, 0.1, -0.25], l: [0, -0.058, -0.16, 0.027] },
      pi: { r: [0, -0.105, 0.06, -0.12], l: [0, -0.14, 0.07, 0, 'v', -0.12] },
      gr: { r: null, l: [0, -0.095, -0.12, 0.085] },
    };
    handsFor(g, handConfigs[w.id]);
    g.visible = false;
    gun.add(g);
    models.push(g);
  });

  const flashTex = canvasTex(
    128,
    128,
    (x) => {
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,230,1)');
      g.addColorStop(0.25, 'rgba(255,200,90,.9)');
      g.addColorStop(1, 'rgba(255,120,20,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    },
    true
  );

  const mat = new T.SpriteMaterial({
    map: flashTex,
    blending: T.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  });
  const fl = new T.Sprite(mat);
  fl.scale.set(0.35, 0.35, 0.35);
  fl.position.set(0, 0.015, -0.78);
  fl.visible = false;
  gun.add(fl);

  const fll = new T.PointLight(0xffb347, 0, 14, 2);
  fll.position.set(0, 0.02, -0.9);
  gun.add(fll);

  const vml = new T.PointLight(0xfff0dc, 2.2, 2.4, 2);
  vml.position.set(-0.1, 0.35, 0.25);
  gun.add(vml);

  gun.userData = { flash: fl, flight: fll };
  gun.position.set(0.2, -0.2, -0.42);
  return { gun, models, flashTex };
}
