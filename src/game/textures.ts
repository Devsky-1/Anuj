import * as T from 'three';

let maxAniso = 4;
export function setMaxAnisotropy(v: number) {
  maxAniso = Math.max(1, v);
}

export function canvasTex(
  w: number,
  h: number,
  draw: (x: CanvasRenderingContext2D, w: number, h: number) => void,
  srgb = false
): T.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  draw(x, w, h);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = maxAniso;
  if (srgb) {
    if ('colorSpace' in t) (t as unknown as { colorSpace: string }).colorSpace = T.SRGBColorSpace;
  }
  t.generateMipmaps = true;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.magFilter = T.LinearFilter;
  return t;
}

function noise(
  x: CanvasRenderingContext2D,
  w: number,
  h: number,
  n: number,
  col: (v: number) => string
) {
  for (let i = 0; i < n; i++) {
    const v = Math.random();
    x.fillStyle = col(v);
    x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

export const lightDark = (a: number) => (v: number) =>
  v > 0.5 ? `rgba(255,255,255,${a * (0.4 + v * 0.6)})` : `rgba(0,0,0,${a * (1.4 - v)})`;

function metalTex(base: string, stripe: string) {
  const color = canvasTex(
    512,
    512,
    (x, w, h) => {
      x.fillStyle = base;
      x.fillRect(0, 0, w, h);
      noise(x, w, h, 18000, lightDark(0.1));
      for (let i = 0; i < 4; i++) {
        x.fillStyle = 'rgba(0,0,0,.28)';
        x.fillRect(i * 128 - 2, 0, 4, h);
      }
      x.fillStyle = stripe;
      x.fillRect(0, h * 0.46, w, h * 0.08);
      for (let i = 0; i < 30; i++) {
        x.strokeStyle = `rgba(210,190,150,${Math.random() * 0.35})`;
        x.lineWidth = 1;
        x.beginPath();
        const px = Math.random() * w;
        const py = Math.random() * h;
        x.moveTo(px, py);
        x.lineTo(px + Math.random() * 50 - 25, py + Math.random() * 50 - 25);
        x.stroke();
      }
      x.fillStyle = 'rgba(150,80,30,.10)';
      for (let i = 0; i < 14; i++) {
        x.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 28, 2 + Math.random() * 9);
      }
    },
    true
  );
  const bump = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#909090';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = '#101010';
      x.fillRect(i * 128 - 3, 0, 6, h);
      x.fillStyle = '#c8c8c8';
      x.fillRect(i * 128 + 4, 0, 4, h);
    }
    noise(x, w, h, 16000, lightDark(0.2));
  });
  return { color, bump };
}

function groundTex(base: string, spots: string, seams: boolean, ripple: boolean) {
  const color = canvasTex(
    512,
    512,
    (x, w, h) => {
      x.fillStyle = base;
      x.fillRect(0, 0, w, h);
      noise(x, w, h, 20000, lightDark(0.1));
      for (let i = 0; i < 20; i++) {
        const g = x.createRadialGradient(
          Math.random() * w,
          Math.random() * h,
          2,
          Math.random() * w,
          Math.random() * h,
          40 + Math.random() * 90
        );
        g.addColorStop(0, spots);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
      }
      if (ripple) {
        x.strokeStyle = 'rgba(120,90,50,.16)';
        x.lineWidth = 2;
        for (let i = 0; i < 24; i++) {
          x.beginPath();
          const y = Math.random() * h;
          x.moveTo(0, y);
          for (let k = 0; k <= 8; k++) {
            x.lineTo((k * w) / 8, y + Math.sin(k * 1.7 + i) * 6);
          }
          x.stroke();
        }
      }
      if (seams) {
        x.strokeStyle = 'rgba(20,20,18,.5)';
        x.lineWidth = 2;
        x.strokeRect(0, 0, w, h);
      }
    },
    true
  );
  const bump = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#808080';
    x.fillRect(0, 0, w, h);
    noise(x, w, h, 24000, lightDark(0.22));
    if (seams) {
      x.strokeStyle = '#202020';
      x.lineWidth = 3;
      x.strokeRect(0, 0, w, h);
    }
  });
  return { color, bump };
}

function blockTex(base: string, mortar: string) {
  const color = canvasTex(
    512,
    512,
    (x, w, h) => {
      x.fillStyle = base;
      x.fillRect(0, 0, w, h);
      noise(x, w, h, 18000, lightDark(0.1));
      x.strokeStyle = mortar;
      x.lineWidth = 4;
      for (let r = 0; r < 4; r++) {
        const y = r * 128;
        x.beginPath();
        x.moveTo(0, y);
        x.lineTo(w, y);
        x.stroke();
        const off = r % 2 ? 64 : 0;
        for (let c = 0; c < 4; c++) {
          x.beginPath();
          x.moveTo(c * 128 + off, y);
          x.lineTo(c * 128 + off, y + 128);
          x.stroke();
        }
      }
    },
    true
  );
  const bump = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#a0a0a0';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#202020';
    x.lineWidth = 7;
    for (let r = 0; r < 4; r++) {
      const y = r * 128;
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(w, y);
      x.stroke();
      const off = r % 2 ? 64 : 0;
      for (let c = 0; c < 4; c++) {
        x.beginPath();
        x.moveTo(c * 128 + off, y);
        x.lineTo(c * 128 + off, y + 128);
        x.stroke();
      }
    }
    noise(x, w, h, 18000, lightDark(0.25));
  });
  return { color, bump };
}

function crateTex() {
  const color = canvasTex(
    256,
    256,
    (x, w, h) => {
      x.fillStyle = '#6b5a3e';
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        x.fillStyle = i % 2 ? 'rgba(30,20,10,.12)' : 'rgba(200,170,120,.12)';
        x.fillRect(0, i * (h / 9), w, h / 9 - 2);
      }
      noise(x, w, h, 7000, lightDark(0.08));
      x.strokeStyle = '#3b2f1e';
      x.lineWidth = 14;
      x.strokeRect(7, 7, w - 14, h - 14);
      x.beginPath();
      x.moveTo(10, 10);
      x.lineTo(w - 10, h - 10);
      x.moveTo(w - 10, 10);
      x.lineTo(10, h - 10);
      x.lineWidth = 10;
      x.stroke();
    },
    true
  );
  const bump = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#909090';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#e0e0e0';
    x.lineWidth = 14;
    x.strokeRect(7, 7, w - 14, h - 14);
    noise(x, w, h, 7000, lightDark(0.25));
  });
  return { color, bump };
}

function barrelTex(base: string) {
  const color = canvasTex(
    256,
    256,
    (x, w, h) => {
      x.fillStyle = base;
      x.fillRect(0, 0, w, h);
      noise(x, w, h, 7000, lightDark(0.12));
      x.fillStyle = 'rgba(0,0,0,.35)';
      [40, 128, 216].forEach((y) => x.fillRect(0, y - 3, w, 6));
    },
    true
  );
  const bump = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#909090';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#202020';
    [40, 128, 216].forEach((y) => x.fillRect(0, y - 3, w, 6));
    noise(x, w, h, 6000, lightDark(0.25));
  });
  return { color, bump };
}

const TEXGEN: Record<string, () => { color: T.CanvasTexture; bump: T.CanvasTexture }> = {
  concrete: () => groundTex('#6e6e6a', 'rgba(30,28,24,.28)', true, false),
  sand: () => groundTex('#c9aa72', 'rgba(150,110,60,.22)', false, true),
  snow: () => groundTex('#e4ecf3', 'rgba(150,175,205,.25)', false, false),
  sandstone: () => blockTex('#b58b5a', 'rgba(60,40,20,.55)'),
  ice: () => blockTex('#9db4c7', 'rgba(40,60,80,.5)'),
  red: () => metalTex('#7a2a20', '#e8e0cf'),
  blue: () => metalTex('#26455f', '#e8e0cf'),
  green: () => metalTex('#3a4d36', '#d9d2b8'),
  crate: crateTex,
  rust: () => barrelTex('#7a4128'),
  steel: () => barrelTex('#4b5258'),
};

const TXC: Record<string, { color: T.CanvasTexture; bump: T.CanvasTexture }> = {};

export function getTex(n: string) {
  return TXC[n] || (TXC[n] = TEXGEN[n]());
}

export function pbr(name: string, rx: number, ry: number, o?: T.MeshStandardMaterialParameters): T.MeshStandardMaterial {
  const tex = getTex(name);
  const c = tex.color.clone();
  const b = tex.bump.clone();
  [c, b].forEach((t) => {
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
  });
  return new T.MeshStandardMaterial({
    map: c,
    bumpMap: b,
    bumpScale: 0.9,
    roughness: 0.84,
    metalness: 0.035,
    envMapIntensity: 1.0,
    dithering: true,
    ...(o || {}),
  });
}

let cachedHaloTex: T.CanvasTexture | null = null;
export function getHaloTex(): T.CanvasTexture {
  if (!cachedHaloTex) {
    cachedHaloTex = canvasTex(
      128,
      128,
      (x) => {
        const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,240,210,1)');
        g.addColorStop(0.18, 'rgba(255,200,130,.55)');
        g.addColorStop(0.5, 'rgba(255,170,90,.12)');
        g.addColorStop(1, 'rgba(255,150,70,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, 128, 128);
      },
      true
    );
  }
  return cachedHaloTex;
}
