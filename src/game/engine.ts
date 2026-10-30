import * as T from 'three';
import {
  WEAPONS,
  DIFFS,
  PLAYER_MAX_HP,
  ObstacleBox,
  EnemyType,
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
import {
  audioInit,
  setAudioVolumes,
  toggleMute,
  isAudioMuted,
  sndShot,
  sndStep,
  sndHit,
  sndHurt,
  sndClick,
  sndPick,
  sndKill,
  sndSwap,
  sndLaser,
  sndVictory,
  sndDefeat,
  SND_EN,
  tone,
} from './audio';
import { setMaxAnisotropy, canvasTex, pbr } from './textures';
import { createGunViewmodel } from './weapons';
import { MAPS, generateMapArtDataUri, LampRef } from './maps';
import { EnemyActor, PickupItem, createEnemyActor, createPickupCrate, findCoverSpot } from './enemies';

export function initDeadYardEngine(mountHost: HTMLElement): () => void {
  const $ = (id: string) => document.getElementById(id)!;
  const isTouch =
    (window.matchMedia && matchMedia('(pointer:coarse)').matches) || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('touch');

  // Software WebGL detection per Three.js skill
  const isSoftwareGl = (() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  })();

  let rand = createSeededRng(7);

  /* ---------- Renderer ---------- */
  const renderer = new T.WebGLRenderer({
    antialias: !isTouch && !isSoftwareGl,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.sortObjects = true;
  const maxPR = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
  let pr = isSoftwareGl ? 1 : isTouch ? Math.min(maxPR, 1.2) : maxPR;
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  if ('outputColorSpace' in renderer) {
    (renderer as unknown as { outputColorSpace: string }).outputColorSpace = T.SRGBColorSpace;
  }
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0x171b19, 1);
  renderer.info.autoReset = true;
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = isTouch ? T.PCFShadowMap : T.PCFSoftShadowMap;
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
  mountHost.innerHTML = '';
  mountHost.appendChild(renderer.domElement);

  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x4a4d52, 0.0105);
  const camera = new T.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 220);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const onResize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  /* ---------- Sky + IBL ---------- */
  const SKY = {
    uHor: { value: new T.Color() },
    uMid: { value: new T.Color() },
    uTop: { value: new T.Color() },
    uSunCol: { value: new T.Color() },
    uSunDir: { value: new T.Vector3(0, 0.2, -1) },
    uFogC: { value: new T.Color() },
    uCloud: { value: 0.6 },
    uRidge: { value: 1 },
    uTime: { value: 0 },
  };

  function skyMesh(r: number) {
    const m = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: SKY,
      vertexShader:
        'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'uniform vec3 uHor;uniform vec3 uMid;uniform vec3 uTop;uniform vec3 uSunCol;uniform vec3 uSunDir;uniform vec3 uFogC;uniform float uCloud;uniform float uRidge;uniform float uTime;varying vec3 vP;float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n2(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}float fbm(vec2 p){float a=.5;float s=0.;for(int i=0;i<4;i++){s+=a*n2(p);p*=2.03;a*=.5;}return s;}void main(){ vec3 d=normalize(vP);float h=clamp(d.y,-.1,1.); vec3 c=mix(uHor,uMid,smoothstep(0.,.18,h));c=mix(c,uTop,smoothstep(.18,.8,h)); float sd=max(dot(d,normalize(uSunDir)),0.); c+=uSunCol*pow(sd,60.)*1.4+uSunCol*pow(sd,7.)*.22; if(d.y>.015){ vec2 uv=d.xz/(d.y+.22)*1.5+vec2(uTime*.012,3.); float cl=fbm(uv*1.2);cl=smoothstep(.46,.82,cl)*uCloud*smoothstep(.015,.22,d.y); vec3 cc=mix(uMid*1.15,vec3(1.),.5)*(.62+.55*pow(sd,2.)); c=mix(c,cc,cl*.8); } float ang=atan(d.z,d.x); float rg=(.012+.085*fbm(vec2(ang*2.3,1.7)))*uRidge; float m=(1.-smoothstep(rg-.002,rg+.006,d.y))*step(-.2,d.y); c=mix(c,mix(uFogC,uHor,.35)*.5,m*.9); gl_FragColor=vec4(c,1.);}',
    });
    return new T.Mesh(new T.SphereGeometry(r, 28, 14), m);
  }

  const sky = skyMesh(150);
  scene.add(sky);
  const pmrem = new T.PMREMGenerator(renderer);
  const envScene = new T.Scene();
  envScene.add(skyMesh(50));
  let envRT: T.WebGLRenderTarget | null = null;
  function refreshEnv() {
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
  }

  /* ---------- Lights ---------- */
  const hemi = new T.HemisphereLight(0xc2d9ff, 0x40302f, 1.28);
  scene.add(hemi);
  const fillL = new T.DirectionalLight(0x9ddcff, 0.95);
  fillL.position.set(20, 30, 40);
  scene.add(fillL);
  const sun = new T.DirectionalLight(0xffc49a, 2.35);
  const sunOff = new T.Vector3(-34, 22, -46);
  sun.position.copy(sunOff);
  sun.castShadow = !isSoftwareGl;
  sun.shadow.mapSize.set(isTouch ? 768 : 1024, isTouch ? 768 : 1024);
  const sc = sun.shadow.camera;
  sc.left = -34;
  sc.right = 34;
  sc.top = 34;
  sc.bottom = -34;
  sc.near = 1;
  sc.far = 130;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  /* ---------- Settings ---------- */
  interface LayoutItem {
    x: number;
    y: number;
    s: number;
    o: number;
    h: boolean;
  }

  const DEF = {
    sens: 1,
    adsSens: 0.7,
    invY: false,
    deadzone: 0.12,
    stickFixed: false,
    stickSize: 1,
    lefty: false,
    btnScale: 1,
    op: 1,
    sprintMode: isTouch ? 'toggle' : 'hold',
    crouchMode: 'toggle',
    adsMode: isTouch ? 'toggle' : 'hold',
    auto: true,
    assist: 1,
    vibe: true,
    showRadar: true,
    showBars: true,
    showDmg: true,
    showDir: true,
    showFps: false,
    hudScale: 1,
    cxStyle: 'cross',
    cxColor: '#ffffff',
    cxSize: 1,
    fov: 72,
    shake: 1,
    bob: 1,
    wheelSlow: 0.2,
    autoReload: true,
    hitFx: true,
    q: isSoftwareGl ? 'low' : isTouch ? 'high' : 'ultra',
    shadows: !isSoftwareGl,
    res: isSoftwareGl ? 1 : isTouch ? 1.05 : 1.1,
    weather: true,
    bright: 1.02,
    fogMul: 0.72,
    vig: true,
    grain: false,
    vMaster: 1,
    vSfx: 1,
    vAmb: 1,
    map: 0,
    diff: 1,
    mode: 'endless',
    layout: {} as Record<string, LayoutItem>,
    keys: {} as Record<string, string>,
  };

  const S = JSON.parse(JSON.stringify(DEF)) as typeof DEF;
  try {
    const raw = localStorage.getItem('deadyard.set4');
    if (raw) {
      const sv = JSON.parse(raw);
      for (const k of Object.keys(DEF) as (keyof typeof DEF)[]) {
        if (!(k in sv)) continue;
        const v = sv[k];
        const d = DEF[k];
        if (typeof d === 'number' && typeof v === 'number' && isFinite(v)) (S as Record<string, unknown>)[k] = v;
        else if (typeof d === 'boolean' && typeof v === 'boolean') (S as Record<string, unknown>)[k] = v;
        else if (typeof d === 'string' && typeof v === 'string') (S as Record<string, unknown>)[k] = v;
        else if (v && typeof v === 'object') (S as Record<string, unknown>)[k] = v;
      }
    }
  } catch {
    // ignore storage errors
  }
  if (!(S.map >= 0 && S.map < MAPS.length)) S.map = 0;
  if (!(S.diff >= 0 && S.diff < 4)) S.diff = 1;
  if (!['endless', 'timed', 'cod', 'megafps'].includes(S.mode)) S.mode = 'endless';
  if (isSoftwareGl) {
    S.shadows = false;
    S.res = 1;
  }

  function saveSet() {
    try {
      localStorage.setItem('deadyard.set4', JSON.stringify(S));
    } catch {
      // ignore
    }
  }

  const KD: Record<string, string> = {
    fwd: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    jump: 'Space',
    sprint: 'ShiftLeft',
    crouch: 'KeyC',
    reload: 'KeyR',
    wheel: 'KeyQ',
    fire: 'KeyF',
    medkit: 'KeyH',
  };
  const K: Record<string, string> = { ...KD, ...S.keys };
  let D = DIFFS[S.diff];

  /* ---------- Level & Weather ---------- */
  let BOUND = 130;
  const level = new T.Group();
  scene.add(level);
  const obs: ObstacleBox[] = [];
  const statics: T.Object3D[] = [];
  const lamps: LampRef[] = [];
  let weather: {
    p: T.Points;
    a: Float32Array;
    n: number;
    fall: number;
    wx: number;
    wz: number;
  } | null = null;
  let mapIdx = -1;

  function applyTheme(t: typeof MAPS[0]['theme']) {
    SKY.uHor.value.setRGB(t.hor[0], t.hor[1], t.hor[2]);
    SKY.uMid.value.setRGB(t.mid[0], t.mid[1], t.mid[2]);
    SKY.uTop.value.setRGB(t.top[0], t.top[1], t.top[2]);
    SKY.uSunCol.value.setHex(t.sunGlow);
    SKY.uSunDir.value.set(t.sunDir[0], t.sunDir[1], t.sunDir[2]);
    SKY.uFogC.value.setHex(t.fog);
    SKY.uCloud.value = t.cloud;
    SKY.uRidge.value = t.ridge;
    (scene.fog as T.FogExp2).color.setHex(t.fog);
    (scene.fog as T.FogExp2).density = t.fogD * S.fogMul;
    hemi.color.setHex(t.hemiSky);
    hemi.groundColor.setHex(t.hemiGround);
    hemi.intensity = t.hemiInt;
    fillL.intensity = t.fillInt;
    sun.color.setHex(t.sunHex);
    sun.intensity = t.sunInt;
    sunOff.set(t.sunOff[0], t.sunOff[1], t.sunOff[2]);
    renderer.toneMappingExposure = t.exp * S.bright;
    refreshEnv();
  }

  function clearLevel() {
    for (const c of level.children.slice()) {
      level.remove(c);
    }
    obs.length = 0;
    statics.length = 0;
    lamps.length = 0;
    weather = null;
  }

  function makeWeather(w: typeof MAPS[0]['theme']['weather']) {
    const n = isSoftwareGl ? Math.min(80, w.count) : isTouch ? Math.min(w.count, 160) : w.count;
    const g = new T.BufferGeometry();
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = (Math.random() - 0.5) * 80;
      a[i * 3 + 1] = Math.random() * 12;
      a[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    g.setAttribute('position', new T.BufferAttribute(a, 3));
    const p = new T.Points(
      g,
      new T.PointsMaterial({
        color: w.color,
        size: w.size,
        transparent: true,
        opacity: w.opacity,
        depthWrite: false,
      })
    );
    p.frustumCulled = false;
    p.visible = S.weather;
    level.add(p);
    weather = { p, a, n, fall: w.fall, wx: w.wx, wz: w.wz };
  }

  function updateWeather(dt: number) {
    if (!weather) return;
    const { a, n, fall, wx, wz } = weather;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      a[k] += wx * dt;
      a[k + 1] -= fall * dt;
      a[k + 2] += wz * dt;
      if (a[k + 1] < 0) a[k + 1] += 12;
      if (a[k] > 40) a[k] -= 80;
      else if (a[k] < -40) a[k] += 80;
      if (a[k + 2] > 40) a[k + 2] -= 80;
      else if (a[k + 2] < -40) a[k + 2] += 80;
    }
    weather.p.geometry.attributes.position.needsUpdate = true;
  }

  function addSurfaceDetail() {
    const isSnow = mapIdx === 2;
    const isSand = mapIdx === 1;
    const rockMat = new T.MeshStandardMaterial({
      color: isSnow ? 0xc7d2d8 : isSand ? 0x81735d : 0x454743,
      roughness: 0.96,
      metalness: 0,
    });
    const gritGeo = new T.IcosahedronGeometry(1, 0);
    const count = isSoftwareGl ? 36 : isTouch ? 56 : 90;
    const im = new T.InstancedMesh(gritGeo, rockMat, count);
    const dummy = new T.Object3D();
    for (let i = 0; i < count; i++) {
      const x = (rand() - 0.5) * (mapIdx === 3 ? 168 : mapIdx === 5 ? 220 : 72);
      const z = (rand() - 0.5) * (mapIdx === 3 ? 168 : mapIdx === 5 ? 220 : 72);
      const scale = 0.04 + rand() * 0.1;
      dummy.position.set(x, scale * 0.45, z);
      dummy.scale.set(scale * (0.8 + rand()), scale * 0.45, scale * (0.7 + rand()));
      dummy.rotation.set(rand(), rand() * Math.PI, rand());
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    level.add(im);
  }

  function loadMap(i: number) {
    mapIdx = i;
    BOUND = i === 5 && S.mode === 'megafps' ? 160 : 120;
    clearLevel();
    rand = createSeededRng(MAPS[i].seed);
    applyTheme(MAPS[i].theme);
    MAPS[i].build({
      level,
      obs,
      statics,
      lamps,
      bound: BOUND,
      isTouch,
      rand,
      lampLights: 0,
    });
    addSurfaceDetail();
    makeWeather(MAPS[i].theme.weather);
  }

  /* ---------- Weapons & Viewmodel ---------- */
  const WS = WEAPONS.map((w) => ({ mag: w.mag, res: w.res }));
  let cw = 0;
  const { gun, models, flashTex } = createGunViewmodel();
  camera.add(gun);

  const muzV = new T.Vector3();
  const muzzleWorld = () => gun.localToWorld(muzV.set(0, 0.015, WEAPONS[cw].muz)).clone();

  let hudDirty = true;
  function applyWeapon() {
    models.forEach((m, i) => {
      m.visible = i === cw;
    });
    gun.userData.flash.position.z = WEAPONS[cw].muz + 0.02;
    gun.userData.flight.position.z = WEAPONS[cw].muz - 0.1;
    $('wname').textContent = WEAPONS[cw].name;
    $('wName').textContent = WEAPONS[cw].name;
    $('wSlot').textContent = `${cw + 1} / ${WEAPONS.length} · ${WEAPONS[cw].tag}`;
    hudDirty = true;
  }

  /* ---------- Pooled Particles, Tracers & Decals ---------- */
  const parts: { m: T.Mesh; v: T.Vector3; life: number }[] = [];
  const pGeo = new T.BoxGeometry(0.04, 0.04, 0.04);
  for (let i = 0; i < 80; i++) {
    const m = new T.Mesh(pGeo, new T.MeshBasicMaterial({ color: 0xffaa44, transparent: true, fog: true }));
    m.visible = false;
    scene.add(m);
    parts.push({ m, v: new T.Vector3(), life: 0 });
  }
  let pi = 0;
  function burst(pt: T.Vector3, n: number, nrm: T.Vector3, hot: boolean) {
    for (let i = 0; i < n; i++) {
      const p = parts[pi++ % parts.length];
      p.m.position.copy(pt);
      p.m.visible = true;
      p.life = 0.35 + Math.random() * 0.35;
      (p.m.material as T.MeshBasicMaterial).color.setHex(
        hot ? (Math.random() > 0.5 ? 0xffb03a : 0xff6a1a) : Math.random() > 0.5 ? 0x9a9890 : 0x6c6b66
      );
      p.v
        .set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3)
        .addScaledVector(nrm, hot ? 4 : 2);
      p.m.scale.setScalar(hot ? 1 : 1.6);
    }
  }

  const UP = new T.Vector3(0, 1, 0);
  const tmpA = new T.Vector3();
  const tmpN = new T.Vector3();
  const tracers: { m: T.Mesh; life: number }[] = [];
  const trGeo = new T.CylinderGeometry(0.012, 0.012, 1, 4, 1, true);
  const trMat = new T.MeshBasicMaterial({
    color: 0xffd9a0,
    transparent: true,
    opacity: 0.9,
    fog: false,
    blending: T.AdditiveBlending,
    depthWrite: false,
  });

  function placeBeam(m: T.Mesh, a: T.Vector3, b: T.Vector3) {
    const len = a.distanceTo(b);
    m.position.copy(a).lerp(b, 0.5);
    const w = (m.userData.w as number) || 1;
    m.scale.set(w, len, w);
    m.quaternion.setFromUnitVectors(UP, tmpA.copy(b).sub(a).normalize());
  }

  function tracer(a: T.Vector3, b: T.Vector3, col?: number) {
    if (a.distanceTo(b) < 0.5) return;
    const m = new T.Mesh(trGeo, trMat.clone());
    if (col) (m.material as T.MeshBasicMaterial).color.setHex(col);
    placeBeam(m, a, b);
    scene.add(m);
    tracers.push({ m, life: 0.07 });
  }

  const decals: T.Mesh[] = [];
  const dGeo = new T.PlaneGeometry(0.14, 0.14);
  const dTex = canvasTex(64, 64, (x) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,.9)');
    g.addColorStop(0.5, 'rgba(10,8,6,.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
  });

  function decal(pt: T.Vector3, nrm: T.Vector3) {
    let d: T.Mesh;
    if (decals.length < 36) {
      d = new T.Mesh(
        dGeo,
        new T.MeshBasicMaterial({
          map: dTex,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
        })
      );
      scene.add(d);
      decals.push(d);
    } else {
      d = decals.shift()!;
      decals.push(d);
    }
    d.position.copy(pt).addScaledVector(nrm, 0.015);
    d.lookAt(tmpA.copy(pt).add(nrm));
    d.rotateZ(Math.random() * 6);
  }

  const eFlash: { s: T.Sprite; life: number }[] = [];
  let efi = 0;
  for (let i = 0; i < 8; i++) {
    const s = new T.Sprite(
      new T.SpriteMaterial({
        map: flashTex,
        blending: T.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false,
      })
    );
    s.scale.set(0.55, 0.55, 0.55);
    s.visible = false;
    scene.add(s);
    eFlash.push({ s, life: 0 });
  }
  function enemyFlash(p: T.Vector3) {
    const f = eFlash[efi++ % eFlash.length];
    f.s.position.copy(p);
    f.s.visible = true;
    f.life = 0.06;
  }

  /* ---------- Floating Damage Numbers ---------- */
  const dnPool: HTMLDivElement[] = [];
  let dni = 0;
  const dnWrap = $('dnwrap');
  dnWrap.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const d = document.createElement('div');
    d.className = 'dn';
    dnWrap.appendChild(d);
    dnPool.push(d);
  }
  const pv = new T.Vector3();
  function dmgNum(pt: T.Vector3, v: number, head: boolean) {
    if (!S.showDmg) return;
    pv.copy(pt).project(camera);
    if (pv.z < -1 || pv.z > 1) return;
    const d = dnPool[dni++ % dnPool.length];
    d.textContent = String(Math.round(v));
    d.className = head ? 'dn hd' : 'dn';
    d.style.left = (pv.x * 0.5 + 0.5) * innerWidth + 'px';
    d.style.top = (-pv.y * 0.5 + 0.5) * innerHeight + 'px';
    d.style.animation = 'none';
    void d.offsetWidth;
    d.style.animation = '';
  }

  /* ---------- Game State & Actors ---------- */
  const enemies: EnemyActor[] = [];
  const pickups: PickupItem[] = [];
  const grenades: { m: T.Mesh; v: T.Vector3; t: number; fuse: number }[] = [];

  const STATS: {
    bestWave: number;
    bestKills: number;
    totalKills: number;
    runs: number;
    bestTime: number;
  } = (() => {
    try {
      return {
        bestWave: 0,
        bestKills: 0,
        totalKills: 0,
        runs: 0,
        bestTime: 0,
        ...JSON.parse(localStorage.getItem('deadyard.stats1') || '{}'),
      };
    } catch {
      return { bestWave: 0, bestKills: 0, totalKills: 0, runs: 0, bestTime: 0 };
    }
  })();

  function saveStats() {
    try {
      localStorage.setItem('deadyard.stats1', JSON.stringify(STATS));
    } catch {
      // ignore
    }
  }

  const P = {
    pos: new T.Vector3(0, 1.7, 22),
    vel: new T.Vector3(),
    yaw: 0,
    pitch: 0,
    ground: true,
    hp: PLAYER_MAX_HP,
    reloading: 0,
    fireT: 0,
    kick: 0,
    bob: 0,
    hurtT: 0,
    ads: 0,
    lastHurt: 99,
    lastStep: 0,
    shake: 0,
    sprinting: false,
    crouchT: 0,
    swapT: 0,
    swapTo: -1,
    sk: 0,
    coyoteT: 0,
    jumpBufT: 0,
    scaleY: 1,
  };

  let state: 'menu' | 'play' | 'paused' | 'dead' | 'won' = 'menu';
  let hitstopT = 0;
  let wave = 0;
  let kills = 0;
  let runTime = 0;
  let queue: EnemyType[] = [];
  let grp = 0;
  let spawnT = 0;
  let gateT = 0;
  let sinceGroup = 0;
  let waveDelay = 0;
  let noLock = false;
  let mouseDown = false;
  let adsOn = false;
  let crouchTog = false;
  let sprintTog = false;
  let editing = false;
  let medkits = 2;
  let medkitCooldown = 0;
  let streak = 0;
  let streakT = 0;
  let aimT: { e: EnemyActor; ang: number; dx: number; dy: number; dz: number; d: number } | null = null;
  let listCache: T.Object3D[] = [];
  let listDirty = true;
  let tscale = 1;

  function syncBodyState() {
    const map: Record<typeof state, string> = {
      menu: 'title',
      play: 'playing',
      paused: 'paused',
      dead: 'gameover',
      won: 'gameover',
    };
    document.body.dataset.state = map[state];
  }
  syncBodyState();

  const keys: Record<string, boolean> = {};
  const TI = { mx: 0, my: 0, lx: 0, ly: 0, fire: false, sprint: false, crouch: false };
  const ray = new T.Raycaster();
  ray.far = 140;

  const hud = {
    hp: $('hpnum'),
    fill: $('hpfill'),
    ghost: $('hpghost'),
    wave: $('wavenum'),
    kills: $('kills'),
    mag: $('mag'),
    res: $('res'),
    ammo: $('ammo'),
    reload: $('reload'),
    msg: $('msg'),
    cross: $('cross'),
    hurt: $('hurt'),
    left: $('left'),
  };

  let bannerTimer = 0;
  function banner(t: string, ms = 2200) {
    hud.msg.textContent = t;
    hud.msg.style.opacity = '1';
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => {
      hud.msg.style.opacity = '0';
    }, ms);
  }

  function aliveCount() {
    let n = 0;
    for (const e of enemies) if (!e.dead) n++;
    return n;
  }

  function updMedkit() {
    const a = $('medkitCount');
    if (a) a.textContent = String(medkits);
    ['bMedkit', 'medkitBtn'].forEach((id) => {
      const b = document.getElementById(id) as HTMLButtonElement | null;
      if (b) b.disabled = medkits <= 0 || P.hp >= PLAYER_MAX_HP || medkitCooldown > 0;
    });
  }

  function useMedkit() {
    if (state !== 'play') return;
    const res = applyMedkitHeal(P.hp, medkits, medkitCooldown);
    if (!res.healed) return;
    P.hp = res.hp;
    medkits = res.medkits;
    P.lastHurt = 99;
    medkitCooldown = 1.1;
    banner('MEDKIT +65', 1100);
    sndPick();
    hudDirty = true;
    updHud();
    updMedkit();
  }

  function updHud() {
    const hp = Math.max(0, Math.round(P.hp));
    const pct = (hp / PLAYER_MAX_HP) * 100 + '%';
    hud.hp.textContent = `${hp} / ${PLAYER_MAX_HP}`;
    hud.fill.style.width = pct;
    hud.ghost.style.width = pct;
    hud.fill.style.background =
      hp > 110 ? 'var(--moss)' : hp > 50 ? 'var(--amber)' : 'var(--blood)';
    const w = WEAPONS[cw];
    const ws = WS[cw];
    hud.mag.textContent = String(ws.mag);
    hud.res.textContent = String(ws.res);
    hud.ammo.classList.toggle('low', ws.mag <= Math.max(1, Math.round(w.mag * 0.2)));
    hud.wave.textContent = String(wave);
    hud.kills.textContent = String(kills);
    hud.left.textContent = formatHudStatusLeft(
      S.mode,
      runTime,
      kills,
      queue.length + aliveCount(),
      Math.hypot(P.pos.x, P.pos.z)
    );
    hudDirty = false;
  }

  function getList() {
    if (listDirty) {
      listCache = statics.slice();
      for (const e of enemies) {
        if (!e.dead) {
          for (const p of e.parts) listCache.push(p);
        }
      }
      listDirty = false;
    }
    return listCache;
  }

  function removeEnemy(e: EnemyActor) {
    scene.remove(e.g);
    scene.remove(e.bar);
    e.fm.dispose();
    if (e.laser) scene.remove(e.laser);
    const i = enemies.indexOf(e);
    if (i >= 0) enemies.splice(i, 1);
    listDirty = true;
  }

  function startWave() {
    wave++;
    queue = buildWaveQueue(S.mode, mapIdx, wave, D.count);
    grp = 0;
    gateT = 0.45;
    sinceGroup = 0;
    banner(
      S.mode === 'megafps'
        ? `MEGA ARENA · Wave ${wave} · Hostiles closing in`
        : S.mode === 'cod'
        ? `ELIMINATION · ${Math.max(0, 30 - kills)} kills to win`
        : S.mode === 'timed'
        ? `TIMED SURVIVAL · Wave ${wave}`
        : mapIdx === 3
        ? `Wave ${wave} · zombies approaching`
        : `Wave ${wave} · hostiles ahead`,
      2400
    );
    updHud();
  }

  function pickSpawn(): { x: number; z: number } {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 90; i++) {
        const a = P.yaw + (Math.random() - 0.5) * (pass === 0 ? 2.4 : Math.PI * 2);
        const r =
          (S.mode === 'megafps' ? 32 : mapIdx === 3 ? 26 : pass === 0 ? 22 : 14) +
          Math.random() * (S.mode === 'megafps' ? 22 : 14);
        const x = clamp(P.pos.x - Math.sin(a) * r, -BOUND + 4, BOUND - 4);
        const z = clamp(P.pos.z - Math.cos(a) * r, -BOUND + 4, BOUND - 4);
        if (!isPointBlocked(x, z, obs, 1)) return { x, z };
      }
    }
    return {
      x: clamp(P.pos.x + 10, -BOUND + 4, BOUND - 4),
      z: clamp(P.pos.z - 14, -BOUND + 4, BOUND - 4),
    };
  }

  function spawnOne(type: EnemyType) {
    const s = pickSpawn();
    const e = createEnemyActor(scene, trGeo, s.x, s.z, type, wave, D);
    enemies.push(e);
    listDirty = true;
    tmpA.set(s.x, 0.3, s.z);
    burst(tmpA, 10, UP, false);
  }

  function resetGame() {
    D = DIFFS[S.diff];
    runTime = 0;
    for (const e of enemies.slice()) removeEnemy(e);
    pickups.forEach((p) => scene.remove(p.m));
    pickups.length = 0;
    for (const gr of grenades) scene.remove(gr.m);
    grenades.length = 0;

    P.pos.set(0, 1.7, mapIdx === 3 ? 12 : 22);
    P.vel.set(0, 0, 0);
    P.yaw = 0;
    P.pitch = 0;
    P.hp = PLAYER_MAX_HP;
    medkits = 2;
    medkitCooldown = 0;
    updMedkit();
    P.reloading = 0;
    P.ads = 0;
    P.lastHurt = 99;
    P.crouchT = 0;
    P.swapT = 0;
    P.swapTo = -1;
    WEAPONS.forEach((w, i) => {
      WS[i].mag = w.mag;
      WS[i].res = w.res;
    });
    cw = 0;
    applyWeapon();
    adsOn = false;
    crouchTog = false;
    sprintTog = false;
    wave = 0;
    kills = 0;
    waveDelay = 0;
    queue = [];
    grp = 0;
    streak = 0;
    aimT = null;
    listDirty = true;
    startWave();
  }

  function reload() {
    const w = WEAPONS[cw];
    const ws = WS[cw];
    if (P.reloading > 0 || ws.mag >= w.mag || ws.res <= 0 || P.swapT > 0) return;
    P.reloading = w.rel;
    adsOn = false;
    $('bAds').classList.remove('on');
    sndClick();
    window.setTimeout(() => tone(300, 0.05, 0.08, 'square'), w.rel * 600);
  }

  const buzz = (ms: number) => {
    try {
      if (isTouch && S.vibe && navigator.vibrate) navigator.vibrate(ms);
    } catch {
      // ignore
    }
  };

  let hurtDirTimer = 0;
  function hurt(d: number, src: T.Vector3 | null) {
    if (state !== 'play') return;
    if (src && S.showDir) {
      const th = Math.atan2(src.x - P.pos.x, src.z - P.pos.z);
      const tf = Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw));
      const dd = $('dmgdir');
      dd.style.transform = `rotate(${-(th - tf)}rad)`;
      dd.style.opacity = '1';
      window.clearTimeout(hurtDirTimer);
      hurtDirTimer = window.setTimeout(() => {
        dd.style.opacity = '0';
      }, 700);
    }
    P.hp -= d;
    P.hurtT = 0.4;
    P.lastHurt = 0;
    P.shake = 0.5;
    buzz(40);
    hud.hurt.style.opacity = '1';
    sndHurt();
    hudDirty = true;
    window.setTimeout(() => {
      hud.hurt.style.opacity = '0';
    }, 120);
    if (P.hp <= 0) {
      P.hp = 0;
      updHud();
      gameOver();
    }
  }

  function setOutcomeStats(l1: string, v1: string, l2: string, v2: string, l3: string, v3: string) {
    const wrap = $('finalStats');
    wrap.hidden = false;
    wrap.innerHTML = `
      <div class="stat-tile"><div class="lab">${l1}</div><b>${v1}</b></div>
      <div class="stat-tile"><div class="lab">${l2}</div><b>${v2}</b></div>
      <div class="stat-tile"><div class="lab">${l3}</div><b>${v3}</b></div>
    `;
  }

  function renderPauseArsenal() {
    const wrap = $('pauseWeapons');
    wrap.innerHTML = '';
    WEAPONS.forEach((w, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt' + (i === cw ? ' on' : '');
      b.innerHTML = `<span>[${i + 1}] ${w.name}</span><small>${w.tag} · ${WS[i].mag} / ${WS[i].res}</small>`;
      b.addEventListener('click', () => {
        cw = i;
        P.swapT = 0;
        P.swapTo = -1;
        P.reloading = 0;
        applyWeapon();
        renderPauseArsenal();
      });
      wrap.appendChild(b);
    });
  }

  function showCard(full: boolean, isPaused = false) {
    $('card').hidden = false;
    $('mdwrap').style.display = full ? '' : 'none';
    $('modeStep').style.display = full ? '' : 'none';
    $('pauseRestart').hidden = !isPaused;
    $('pauseTitle').hidden = !isPaused;
    const pa = document.getElementById('pauseArsenal');
    if (pa) {
      pa.hidden = !isPaused;
      if (isPaused) renderPauseArsenal();
    }
  }

  function gameOver() {
    STATS.bestWave = Math.max(STATS.bestWave, wave);
    STATS.bestKills = Math.max(STATS.bestKills, kills);
    saveStats();
    state = 'dead';
    syncBodyState();
    sndDefeat();
    closeWheel(false);
    if (document.pointerLockElement) document.exitPointerLock?.();
    $('title').innerHTML = 'Down<br><em>Range</em>';
    $('kicker').textContent = `Signal lost · ${MAPS[S.map].name} · ${D.name}`;
    setOutcomeStats('Wave Reached', String(wave), 'Eliminations', String(kills), 'Best Wave', String(STATS.bestWave));
    $('blurb').textContent =
      mapIdx === 3
        ? 'The infected overran the town. Redeploy, loot carefully, and survive longer waves.'
        : 'You were overrun. Pick another map or difficulty, or redeploy. Watch the radar and use cover.';
    $('go').textContent = 'Try Again';
    showCard(true, false);
    hud.cross.hidden = true;
    $('radar').hidden = true;
    $('topRightHud').hidden = true;
    $('medkitBtn').hidden = true;
    $('touch').hidden = true;
    syncStick();
    setScope(0);
  }

  function gameWin() {
    if (state !== 'play') return;
    STATS.bestWave = Math.max(STATS.bestWave, wave);
    STATS.bestKills = Math.max(STATS.bestKills, kills);
    STATS.bestTime = Math.max(STATS.bestTime, Math.floor(runTime));
    saveStats();
    state = 'won';
    syncBodyState();
    sndVictory();
    TI.fire = false;
    mouseDown = false;
    closeWheel(false);
    if (document.pointerLockElement) document.exitPointerLock?.();
    $('title').innerHTML = 'Mission<br><em>Complete</em>';
    $('kicker').textContent = `${S.mode === 'cod' ? 'Elimination' : 'Timed Survival'} · ${MAPS[S.map].name}`;
    setOutcomeStats('Clear Time', `${Math.round(runTime)}s`, 'Eliminations', String(kills), 'Best Kills', String(STATS.bestKills));
    $('blurb').textContent =
      S.mode === 'cod'
        ? '30 eliminations achieved. Redeploy for another match or raise the difficulty.'
        : 'You survived the 3:00 timed challenge. Try a harder difficulty or switch battlefields.';
    $('go').textContent = 'Play Again';
    showCard(true, false);
    hud.cross.hidden = true;
    $('radar').hidden = true;
    $('topRightHud').hidden = true;
    $('medkitBtn').hidden = true;
    $('touch').hidden = true;
    syncStick();
    setScope(0);
  }

  /* ---------- Weapon Wheel ---------- */
  const wheel = { open: false, vx: 0, vy: 0, sel: 0 };
  const wheelEl = $('wheel');
  const wring = $('wring');
  const wcenter = $('wcenter');
  const slotEls: HTMLDivElement[] = [];

  function buildWheel() {
    wring.querySelectorAll('.slot').forEach((n) => n.remove());
    slotEls.length = 0;
    const r = Math.min(128, Math.min(innerWidth, innerHeight) * 0.3);
    const n = WEAPONS.length;
    WEAPONS.forEach((w, i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / n;
      const d = document.createElement('div');
      d.className = 'slot';
      d.style.left = Math.cos(a) * r * 1.18 + 'px';
      d.style.top = Math.sin(a) * r + 'px';
      d.innerHTML = `<span>${w.name}</span><small></small>`;
      d.addEventListener('click', () => {
        wheel.sel = i;
        closeWheel(true);
      });
      wring.appendChild(d);
      slotEls.push(d);
    });
  }

  function wheelRefresh() {
    slotEls.forEach((d, i) => {
      d.classList.toggle('sel', i === wheel.sel);
      const sm = d.querySelector('small');
      if (sm) sm.textContent = `[${i + 1}] · ${WS[i].mag} / ${WS[i].res}${i === cw ? ' · active' : ''}`;
    });
    wcenter.innerHTML = `${WEAPONS[wheel.sel].name}<small>${WEAPONS[wheel.sel].tag} · release to equip</small>`;
  }

  function openWheel() {
    if (state !== 'play' || wheel.open || P.swapT > 0) return;
    wheel.open = true;
    wheel.vx = 0;
    wheel.vy = 0;
    wheel.sel = cw;
    wheelEl.style.display = 'flex';
    wheelRefresh();
    TI.fire = false;
    mouseDown = false;
  }

  function wheelMove(dx: number, dy: number, absolute: boolean) {
    if (!wheel.open) return;
    if (absolute) {
      wheel.vx = dx;
      wheel.vy = dy;
    } else {
      wheel.vx = clamp(wheel.vx + dx, -140, 140);
      wheel.vy = clamp(wheel.vy + dy, -140, 140);
    }
    wheel.sel = selectWheelSlot(wheel.vx, wheel.vy, wheel.sel, WEAPONS.length);
    wheelRefresh();
  }

  function closeWheel(apply: boolean) {
    if (!wheel.open) return;
    wheel.open = false;
    wheelEl.style.display = 'none';
    if (apply && wheel.sel !== cw) switchTo(wheel.sel);
  }

  function switchTo(i: number) {
    if (state !== 'play' || i === cw || P.swapT > 0 || i < 0 || i >= WEAPONS.length) return;
    P.swapT = 0.36;
    P.swapTo = i;
    P.reloading = 0;
    adsOn = false;
    $('bAds').classList.remove('on');
    hud.reload.textContent = '';
    sndSwap();
  }

  const cycleWeapon = (dir: number) => switchTo((cw + dir + WEAPONS.length) % WEAPONS.length);

  /* ---------- Scope ---------- */
  const scopeEl = $('scope');
  const reticleEl = $('reticle');
  function setScope(a: number) {
    const w = WEAPONS[cw];
    if (w.scope) {
      scopeEl.style.opacity = String(clamp((a - 0.55) / 0.35, 0, 1));
      reticleEl.style.opacity = '0';
      gun.visible = a < 0.7;
    } else {
      scopeEl.style.opacity = '0';
      reticleEl.style.opacity = String(clamp((a - 0.5) / 0.4, 0, 1));
      gun.visible = true;
    }
    hud.cross.style.opacity = a > 0.3 ? '0' : '1';
  }

  /* ---------- Shooting & Grenades ---------- */
  function throwGrenade() {
    const ws = WS[cw];
    if (ws.mag <= 0) {
      if (ws.res > 0) reload();
      else sndClick();
      return;
    }
    ws.mag--;
    P.fireT = WEAPONS[cw].rate;
    hudDirty = true;
    camera.updateMatrixWorld();
    const m = new T.Mesh(
      new T.SphereGeometry(0.16, 12, 10),
      new T.MeshStandardMaterial({ color: 0x354b2e, roughness: 0.78, metalness: 0.18 })
    );
    const start = camera.getWorldDirection(new T.Vector3());
    m.position
      .copy(P.pos)
      .add(new T.Vector3(0, -0.18, 0))
      .addScaledVector(start, 0.8);
    scene.add(m);
    grenades.push({
      m,
      v: start.multiplyScalar(14).add(new T.Vector3(0, 5, 0)),
      t: 0,
      fuse: 1.55,
    });
    sndShot(0.25, false, { f: 900, d: 0.28, th: 110 });
  }

  function onKill(e: EnemyActor, head: boolean) {
    e.dead = true;
    e.deadT = 0;
    kills++;
    STATS.totalKills++;
    saveStats();
    listDirty = true;
    e.bar.visible = false;
    if (e.laser) e.laser.visible = false;
    pickups.push(createPickupCrate(scene, e.g.position));
    sndKill();
    hitstopT = head ? 0.045 : 0.028;
    streak++;
    streakT = 4;
    const names = ['', '', 'Double kill', 'Triple kill', 'Quad kill', 'Rampage'];
    if (streak >= 2) banner(names[Math.min(streak, 5)] + (head ? ' · headshot' : ''), 1400);
    else if (head) banner('Headshot', 900);
    hudDirty = true;
  }

  function explodeGrenade(gr: { m: T.Mesh; v: T.Vector3; t: number; fuse: number }) {
    const pos = gr.m.position.clone();
    scene.remove(gr.m);
    const idx = grenades.indexOf(gr);
    if (idx >= 0) grenades.splice(idx, 1);
    burst(pos, 36, UP, true);
    P.shake = Math.max(P.shake, 0.55);
    sndShot(0.85, false, { f: 520, d: 0.55, th: 60 });
    for (const e of enemies) {
      if (e.dead) continue;
      const d = e.g.position.distanceTo(pos);
      if (d < 6.5) {
        e.hp -= WEAPONS[5].dmg * clamp(1 - d / 7, 0.15, 1);
        e.stag = 0.5;
        if (e.hp <= 0 && !e.dead) onKill(e, false);
      }
    }
    if (P.pos.distanceTo(pos) < 5.5) hurt(16, pos);
    banner('GRENADE BLAST', 700);
  }

  function updateGrenades(dt: number) {
    for (const gr of grenades.slice()) {
      gr.t += dt;
      gr.fuse -= dt;
      gr.v.y -= 14 * dt;
      gr.m.position.addScaledVector(gr.v, dt);
      if (gr.m.position.y < 0.18) {
        gr.m.position.y = 0.18;
        gr.v.y = Math.abs(gr.v.y) * 0.28;
        gr.v.x *= 0.72;
        gr.v.z *= 0.72;
      }
      gr.m.rotation.x += dt * 5;
      gr.m.rotation.z += dt * 4;
      if (gr.fuse <= 0) explodeGrenade(gr);
    }
  }

  let crossFlashTimer = 0;
  function crossFlash(h: boolean) {
    const c = hud.cross;
    c.classList.remove('hit', 'head');
    c.classList.add(h ? 'head' : 'hit');
    window.clearTimeout(crossFlashTimer);
    crossFlashTimer = window.setTimeout(() => c.classList.remove('hit', 'head'), 110);
  }

  function fire() {
    const w = WEAPONS[cw];
    const ws = WS[cw];
    if (P.reloading > 0 || P.fireT > 0 || P.swapT > 0 || wheel.open) return;
    if (w.grenade) {
      throwGrenade();
      return;
    }
    if (ws.mag <= 0) {
      if (S.autoReload) reload();
      else sndClick();
      return;
    }
    ws.mag--;
    P.fireT = w.rate;
    P.kick = Math.min(P.kick + (w.rate > 0.5 ? 3 : 1), 3);
    hudDirty = true;
    const ak = 1 - 0.5 * P.ads;
    P.pitch += w.rec * (0.0055 + Math.random() * 0.003) * ak;
    P.yaw += (Math.random() - 0.5) * 0.004 * w.rec * ak;
    sndShot(w.snd.v, false, w.snd);

    const f = gun.userData as { flash: T.Sprite; flight: T.PointLight };
    f.flash.visible = true;
    f.flash.material.rotation = Math.random() * 6;
    f.flash.scale.setScalar((0.25 + Math.random() * 0.2) * (w.pel > 1 ? 1.6 : 1));
    f.flight.intensity = 4;
    window.setTimeout(() => {
      f.flash.visible = false;
      f.flight.intensity = 0;
    }, 38);

    const mv = Math.hypot(P.vel.x, P.vel.z);
    const base = w.hip + (w.ads - w.hip) * P.ads;
    const sp =
      (base +
        (w.pel > 1 ? 0 : P.kick * 0.0012 * Math.sqrt(w.rec) + mv * 0.0004 * (w.id === 'sn' ? 3 : 1))) *
      (1 - 0.25 * P.crouchT) *
      (P.sprinting ? 2 : 1);

    camera.updateMatrixWorld();
    const list = getList();
    const from = muzzleWorld();
    const agg = new Map<EnemyActor, { dmg: number; head: boolean; pt: T.Vector3 }>();

    for (let k = 0; k < w.pel; k++) {
      ray.setFromCamera(
        new T.Vector2((Math.random() - 0.5) * sp * 2, (Math.random() - 0.5) * sp * 2),
        camera
      );
      const hits = ray.intersectObjects(list, false);
      if (hits.length) {
        const h = hits[0];
        const o = h.object;
        if (k < 3) tracer(from, h.point);
        if (h.face) tmpN.copy(h.face.normal).transformDirection(o.matrixWorld);
        else tmpN.set(0, 1, 0);

        if (o.userData.enemy) {
          const e = o.userData.enemy as EnemyActor;
          const head = !!o.userData.head;
          const dmg = computeWeaponDamage(w, head, h.distance);
          e.hp -= dmg;
          e.stag = 0.14;
          burst(h.point, w.pel > 1 ? 2 : 6, tmpN, true);
          const a = agg.get(e) || { dmg: 0, head: false, pt: h.point.clone() };
          a.dmg += dmg;
          a.head = a.head || head;
          a.pt.copy(h.point);
          agg.set(e, a);
        } else {
          const mat = (o as T.Mesh).material as T.MeshStandardMaterial | undefined;
          burst(h.point, w.pel > 1 ? 2 : 7, tmpN, !!(mat && mat.metalness > 0.3));
          if (k < 4) decal(h.point, tmpN);
        }
      } else if (k < 3) {
        tracer(from, tmpA.copy(from).addScaledVector(ray.ray.direction, 60));
      }
    }

    agg.forEach((a, e) => {
      if (S.hitFx) {
        sndHit(a.head);
        crossFlash(a.head);
      }
      dmgNum(a.pt, a.dmg, a.head);
      if (e.hp <= 0 && !e.dead) onKill(e, a.head);
    });
  }

  /* ---------- Input & State Transitions ---------- */
  function jump() {
    if (state !== 'play' || wheel.open) return;
    if (P.ground || P.coyoteT > 0) {
      P.vel.y = 6.4;
      P.ground = false;
      P.coyoteT = 0;
      P.jumpBufT = 0;
      P.scaleY = 1.15;
    } else {
      P.jumpBufT = 0.12;
    }
  }

  function startOrResumeGame() {
    audioInit();
    if (mapIdx < 0) loadMap(S.map);
    if (state === 'dead' || state === 'won' || state === 'menu') {
      $('finalStats').hidden = true;
      STATS.runs++;
      saveStats();
      resetGame();
    }
    state = 'play';
    syncBodyState();
    $('hud').hidden = false;
    $('radar').hidden = false;
    $('topRightHud').hidden = false;
    $('medkitBtn').hidden = isTouch;
    $('card').hidden = true;
    hud.cross.hidden = false;
    updMedkit();
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (isTouch) {
      noLock = true;
      $('touch').hidden = false;
      syncStick();
    } else {
      lock();
      window.setTimeout(() => {
        if (!document.pointerLockElement) noLock = true;
      }, 400);
    }
  }

  function pauseGame() {
    if (state !== 'play') return;
    closeWheel(false);
    state = 'paused';
    syncBodyState();
    if (document.pointerLockElement) document.exitPointerLock?.();
    TI.fire = false;
    TI.mx = TI.my = 0;
    mouseDown = false;
    adsOn = false;
    $('bAds').classList.remove('on');
    $('medkitBtn').hidden = true;
    $('title').innerHTML = 'Hold<br><em>Fire</em>';
    $('kicker').textContent = `Paused · ${MAPS[S.map].name} · ${D.name}`;
    setOutcomeStats('Current Wave', String(wave), 'Eliminations', String(kills), 'Vitals', `${Math.ceil(P.hp)} / ${PLAYER_MAX_HP}`);
    $('blurb').textContent = 'Simulation paused. Resume combat, switch loadout weapons, restart the wave, or return to the title screen.';
    $('go').textContent = 'Resume';
    showCard(false, true);
    hud.cross.hidden = true;
    setScope(0);
  }

  function returnToTitle() {
    closeWheel(false);
    state = 'menu';
    syncBodyState();
    if (document.pointerLockElement) document.exitPointerLock?.();
    $('hud').hidden = true;
    $('radar').hidden = true;
    $('topRightHud').hidden = true;
    $('medkitBtn').hidden = true;
    $('touch').hidden = true;
    $('finalStats').hidden = true;
    $('title').innerHTML = 'Dead<br><em>Yard</em>';
    $('kicker').textContent = 'First-person survival combat';
    $('blurb').textContent =
      'Hostile squads push in from the front. Heavies soak damage, rushers run you down, marksmen mark you with a laser before they fire. Use cover and the radar.';
    $('go').textContent = 'Start';
    showCard(true, false);
    hud.cross.hidden = true;
    setScope(0);
  }

  let rebinding: string | null = null;
  let rebindBtn: HTMLButtonElement | null = null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (rebinding) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code !== 'Escape') {
        K[rebinding] = e.code;
        S.keys[rebinding] = e.code;
        saveSet();
      }
      if (rebindBtn) rebindBtn.textContent = keyName(K[rebinding]);
      rebinding = null;
      rebindBtn = null;
      return;
    }

    keys[e.code] = true;

    // Title-to-Start keyboard handshake
    if (state === 'menu' && !$('settings').classList.contains('open') && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      startOrResumeGame();
      return;
    }

    // Pause / Resume toggle
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat && !editing && !$('settings').classList.contains('open')) {
      if (state === 'play') {
        pauseGame();
        return;
      } else if (state === 'paused') {
        startOrResumeGame();
        return;
      }
    }

    if (e.code === 'KeyM' && !e.repeat) {
      const m = toggleMute();
      $('utilMute').setAttribute('aria-pressed', String(m));
      banner(m ? 'AUDIO MUTED' : 'AUDIO ACTIVE', 900);
      return;
    }

    if (state !== 'play') return;
    if (e.code === K.reload && !wheel.open) reload();
    if (e.code === K.jump && !e.repeat) jump();
    if (e.code === K.medkit && !e.repeat) useMedkit();
    if (e.code === K.crouch && !e.repeat && S.crouchMode === 'toggle') crouchTog = !crouchTog;
    if (e.code === K.sprint && !e.repeat && S.sprintMode === 'toggle') sprintTog = !sprintTog;
    if (e.code === K.wheel && !e.repeat) openWheel();
    if (e.code.startsWith('Digit')) {
      const n = +e.code.slice(5) - 1;
      if (n >= 0 && n < WEAPONS.length) switchTo(n);
    }
    if ([K.jump, 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
      e.preventDefault();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    keys[e.code] = false;
    if (e.code === K.jump && P.vel.y > 0) {
      P.vel.y *= 0.48; // variable jump cut
    }
    if (e.code === K.wheel) closeWheel(true);
  };

  const onWheel = (e: WheelEvent) => {
    if (state === 'play' && !wheel.open && Math.abs(e.deltaY) > 1) {
      cycleWeapon(e.deltaY > 0 ? 1 : -1);
    }
  };

  const onMouseDown = (e: MouseEvent) => {
    audioInit();
    if (e.button === 0) {
      mouseDown = true;
      if (state === 'play' && !noLock && !document.pointerLockElement) lock();
    }
    if (e.button === 2) {
      if (S.adsMode === 'toggle') adsOn = !adsOn;
      else adsOn = true;
    }
  };

  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2 && S.adsMode !== 'toggle') adsOn = false;
  };

  const onMouseMove = (e: MouseEvent) => {
    if (state !== 'play') return;
    if (wheel.open) {
      wheelMove(e.movementX, e.movementY, false);
      return;
    }
    if (!document.pointerLockElement && !mouseDown) return;
    const k = 0.0021 * S.sens * (1 - (1 - S.adsSens) * P.ads);
    P.yaw -= e.movementX * k;
    P.pitch = clamp(P.pitch - e.movementY * k * (S.invY ? -1 : 1), -1.5, 1.5);
  };

  const clearInputsOnBlur = () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    mouseDown = false;
    TI.fire = false;
    TI.mx = 0;
    TI.my = 0;
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('wheel', onWheel, { passive: true });
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', clearInputsOnBlur);

  function lock() {
    try {
      const r = renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => { noLock = true; });
    } catch {
      noLock = true;
    }
  }

  const onPointerLockChange = () => {
    if (document.pointerLockElement) {
      $('card').hidden = true;
      hud.cross.hidden = false;
      state = 'play';
      syncBodyState();
    } else if (state === 'play' && !noLock) {
      pauseGame();
    }
  };
  document.addEventListener('pointerlockchange', onPointerLockChange);

  $('wBtn').addEventListener('click', () => {
    if (!isTouch && state === 'play' && !editing) cycleWeapon(1);
  });
  $('medkitBtn').addEventListener('click', useMedkit);
  $('utilMute').addEventListener('click', (e) => {
    const m = toggleMute();
    (e.currentTarget as HTMLElement).blur();
    banner(m ? 'AUDIO MUTED' : 'AUDIO ACTIVE', 900);
  });
  $('utilPause').addEventListener('click', (e) => {
    (e.currentTarget as HTMLElement).blur();
    if (state === 'play') pauseGame();
  });
  $('utilRestart').addEventListener('click', (e) => {
    (e.currentTarget as HTMLElement).blur();
    if (state === 'play') {
      resetGame();
      banner('MATCH RESTARTED', 1200);
    }
  });
  $('pauseRestart').addEventListener('click', () => {
    resetGame();
    startOrResumeGame();
  });
  $('pauseTitle').addEventListener('click', returnToTitle);

  /* ---------- Menu & Settings UI ---------- */
  const MODE_ICONS: Record<string, string> = {
    endless:
      '<svg viewBox="0 0 24 24"><path d="M12 3C7.6 3 4.5 6 4.5 10c0 2.3 1 3.7 2.5 4.8V18h10v-3.2c1.5-1.1 2.5-2.5 2.5-4.8C19.5 6 16.4 3 12 3z"/><circle cx="9" cy="10.5" r="1.6"/><circle cx="15" cy="10.5" r="1.6"/><path d="M10 18v3M14 18v3"/></svg>',
    timed:
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>',
    cod:
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="2"/></svg>',
    megafps:
      '<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>',
  };

  const TB_ICONS: Record<string, [string, string]> = {
    bFire: ['<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>', ''],
    bFire2: ['<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>', ''],
    bJump: ['<path d="M5 14l7-7 7 7M5 20l7-7 7 7"/>', 'Jump'],
    bCrouch: ['<path d="M5 8l7 7 7-7"/><path d="M7 20h10"/>', 'Duck'],
    bReload: ['<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>', 'Reload'],
    bAds: ['<circle cx="12" cy="12" r="8"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/>', 'Aim'],
    bSprint: ['<path d="M6 6l6 6-6 6M12 6l6 6-6 6"/>', 'Run'],
    bPause: ['<path d="M8 5v14M16 5v14"/>', ''],
  };

  function setIcons() {
    for (const id in TB_ICONS) {
      const b = document.getElementById(id);
      if (b) {
        b.innerHTML = `<svg viewBox="0 0 24 24">${TB_ICONS[id][0]}</svg>${TB_ICONS[id][1] ? `<b>${TB_ICONS[id][1]}</b>` : ''}`;
      }
    }
    document.querySelectorAll<HTMLButtonElement>('#modes [data-mode]').forEach((b) => {
      const m = b.dataset.mode || '';
      if (MODE_ICONS[m] && !b.querySelector('.mi')) {
        const e = document.createElement('i');
        e.className = 'mi';
        e.innerHTML = MODE_ICONS[m];
        b.insertBefore(e, b.firstChild);
      }
    });
  }

  function buildMenuMapRefresh() {
    const mp = $('maps');
    [...mp.children].forEach((c, j) => c.classList.toggle('on', j === S.map));
    document.querySelectorAll<HTMLButtonElement>('#modes [data-mode]').forEach((b) => {
      b.classList.toggle('on', b.dataset.mode === S.mode);
    });
  }

  function buildMenu() {
    const mp = $('maps');
    const df = $('diffs');
    mp.innerHTML = '';
    df.innerHTML = '';
    MAPS.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt' + (i === S.map ? ' on' : '');
      b.id = 'map' + i;
      b.innerHTML = `<span>${m.name}</span><small>${m.sub}</small>`;
      b.style.backgroundImage = `url("${generateMapArtDataUri(i)}")`;
      b.addEventListener('click', () => {
        S.map = i;
        saveSet();
        buildMenuMapRefresh();
        loadMap(i);
        listDirty = true;
      });
      mp.appendChild(b);
    });
    DIFFS.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt' + (i === S.diff ? ' on' : '');
      b.id = 'diff' + i;
      b.innerHTML = `<span>${d.name}</span><small>${d.sub}</small>`;
      b.addEventListener('click', () => {
        S.diff = i;
        D = DIFFS[i];
        saveSet();
        [...df.children].forEach((c, j) => c.classList.toggle('on', j === i));
      });
      df.appendChild(b);
    });
  }
  setIcons();

  function setPR(v: number) {
    pr = isSoftwareGl ? 1 : v;
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight);
  }

  function prCeil() {
    if (isSoftwareGl) return 1;
    return Math.max(0.65, Math.min(maxPR * S.res, isTouch ? 1.35 : 2));
  }

  function applyQuality() {
    const ceiling = prCeil();
    setPR(
      S.q === 'low'
        ? Math.min(ceiling, isTouch ? 0.68 : 1)
        : S.q === 'ultra'
        ? Math.min(ceiling, isTouch ? 1.35 : 2)
        : S.q === 'high'
        ? Math.min(ceiling, isTouch ? 1.05 : 1.75)
        : ceiling
    );
    if (!isSoftwareGl) {
      const sm = S.q === 'low' ? 512 : S.q === 'ultra' ? (isTouch ? 1024 : 2048) : 1024;
      sun.shadow.mapSize.set(sm, sm);
      sun.shadow.needsUpdate = true;
    }
  }

  document.querySelectorAll<HTMLButtonElement>('#modes [data-mode]').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === S.mode);
    b.addEventListener('click', () => {
      S.mode = b.dataset.mode || 'endless';
      if (S.mode === 'megafps') {
        S.map = 5;
        loadMap(5);
      }
      saveSet();
      buildMenuMapRefresh();
    });
  });

  $('go').addEventListener('click', startOrResumeGame);

  /* ---------- Touch Controls ---------- */
  let stickActive = false;
  function syncStick() {
    const b = $('stickBase');
    const t = $('touch');
    b.classList.toggle('fixed', !!S.stickFixed);
    t.classList.toggle('fixedstick', !!S.stickFixed);
    if (S.stickFixed) {
      b.style.left = '';
      b.style.top = '';
      b.hidden = t.hidden;
    } else if (!stickActive) {
      b.hidden = true;
    }
  }

  if (isTouch) {
    const zone = $('stickZone');
    const base = $('stickBase');
    const knob = $('stickKnob');
    const look = $('lookZone');
    let sid: number | null = null;
    let sx = 0;
    let sy = 0;
    let lid: number | null = null;
    let lx0 = 0;
    let ly0 = 0;
    let R = 52;
    let sf = 1;

    const updateStick = (cx: number, cy: number) => {
      let dx = cx - sx;
      let dy = cy - sy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx *= R / d;
        dy *= R / d;
      }
      knob.style.transform = `translate(${dx / sf}px,${dy / sf}px)`;
      const m = Math.min(1, Math.hypot(dx, dy) / R);
      const dz = S.deadzone;
      const s = m < dz ? 0 : Math.pow((m - dz) / (1 - dz), 1.15) / Math.max(m, 0.0001);
      TI.mx = (dx / R) * s;
      TI.my = (dy / R) * s;
    };

    zone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        if (editing || sid !== null) return;
        const t = e.changedTouches[0];
        sid = t.identifier;
        stickActive = true;
        const ls = S.layout.stickBase;
        sf = S.stickSize * ((ls && ls.s) || 1);
        R = 52 * sf;
        if (S.stickFixed) {
          const br = base.getBoundingClientRect();
          sx = br.left + br.width / 2;
          sy = br.top + br.height / 2;
        } else {
          sx = t.clientX;
          sy = t.clientY;
          base.style.left = sx + 'px';
          base.style.top = sy + 'px';
          base.hidden = false;
        }
        knob.style.transform = '';
        updateStick(t.clientX, t.clientY);
      },
      { passive: false }
    );

    zone.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === sid) updateStick(t.clientX, t.clientY);
        }
      },
      { passive: false }
    );

    const endStick = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === sid) {
          sid = null;
          stickActive = false;
          TI.mx = TI.my = 0;
          knob.style.transform = '';
          if (!S.stickFixed) base.hidden = true;
        }
      }
    };
    zone.addEventListener('touchend', endStick);
    zone.addEventListener('touchcancel', endStick);

    look.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        audioInit();
        if (editing || lid !== null) return;
        const t = e.changedTouches[0];
        lid = t.identifier;
        lx0 = t.clientX;
        ly0 = t.clientY;
      },
      { passive: false }
    );

    look.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === lid) {
            TI.lx += t.clientX - lx0;
            TI.ly += t.clientY - ly0;
            lx0 = t.clientX;
            ly0 = t.clientY;
          }
        }
      },
      { passive: false }
    );

    const endLook = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lid) lid = null;
      }
    };
    look.addEventListener('touchend', endLook);
    look.addEventListener('touchcancel', endLook);

    const hold = (id: string, on: () => void, off?: () => void) => {
      const b = $(id);
      b.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          if (editing) return;
          audioInit();
          on();
        },
        { passive: false }
      );
      const f = (e: TouchEvent) => {
        e.preventDefault();
        if (editing) return;
        if (off) off();
      };
      b.addEventListener('touchend', f, { passive: false });
      b.addEventListener('touchcancel', f, { passive: false });
    };

    let fires = 0;
    const fireOn = (id: string) => () => {
      fires++;
      TI.fire = true;
      $(id).classList.add('on');
    };
    const fireOff = (id: string) => () => {
      fires = Math.max(0, fires - 1);
      if (!fires) TI.fire = false;
      $(id).classList.remove('on');
    };
    hold('bFire', fireOn('bFire'), fireOff('bFire'));
    hold('bFire2', fireOn('bFire2'), fireOff('bFire2'));
    hold('bJump', jump);
    hold('bPause', pauseGame);
    hold('bMedkit', useMedkit);
    hold('bReload', () => {
      if (state === 'play') reload();
    });
    hold(
      'bSprint',
      () => {
        if (S.sprintMode === 'hold') TI.sprint = true;
        else TI.sprint = !TI.sprint;
        $('bSprint').classList.toggle('on', TI.sprint);
      },
      () => {
        if (S.sprintMode === 'hold') {
          TI.sprint = false;
          $('bSprint').classList.remove('on');
        }
      }
    );
    hold(
      'bAds',
      () => {
        if (S.adsMode === 'hold') adsOn = true;
        else adsOn = !adsOn;
        $('bAds').classList.toggle('on', adsOn);
      },
      () => {
        if (S.adsMode === 'hold') {
          adsOn = false;
          $('bAds').classList.remove('on');
        }
      }
    );
    hold(
      'bCrouch',
      () => {
        if (S.crouchMode === 'hold') TI.crouch = true;
        else crouchTog = !crouchTog;
        $('bCrouch').classList.toggle('on', S.crouchMode === 'hold' ? TI.crouch : crouchTog);
      },
      () => {
        if (S.crouchMode === 'hold') {
          TI.crouch = false;
          $('bCrouch').classList.remove('on');
        }
      }
    );

    const wb = $('wBtn');
    let wt = 0;
    let wid: number | null = null;
    let wx = 0;
    let wy = 0;
    let wOpened = false;
    wb.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        if (editing) return;
        audioInit();
        const t = e.changedTouches[0];
        wid = t.identifier;
        wx = t.clientX;
        wy = t.clientY;
        wOpened = false;
        window.clearTimeout(wt);
        wt = window.setTimeout(() => {
          wOpened = true;
          openWheel();
        }, 230);
      },
      { passive: false }
    );
    wb.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        if (editing) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === wid && wheel.open) wheelMove(t.clientX - wx, t.clientY - wy, true);
        }
      },
      { passive: false }
    );
    const wEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (editing) return;
      window.clearTimeout(wt);
      if (wheel.open) closeWheel(true);
      else if (!wOpened && state === 'play') cycleWeapon(1);
      wOpened = false;
    };
    wb.addEventListener('touchend', wEnd, { passive: false });
  }

  /* ---------- HUD Layout Customizer ---------- */
  const LAY: [string, string, number?][] = [
    ['hp', 'Health'],
    ['wave', 'Wave info'],
    ['ammo', 'Ammo'],
    ['radar', 'Radar'],
    ['wBtn', 'Weapon button'],
    ['bPause', 'Pause', 1],
    ['bMedkit', 'Medkit', 1],
    ['medkitBtn', 'Medkit (desktop)'],
    ['bFire', 'Fire (right)', 1],
    ['bFire2', 'Fire (left)', 1],
    ['bJump', 'Jump', 1],
    ['bReload', 'Reload', 1],
    ['bAds', 'Aim', 1],
    ['bCrouch', 'Duck', 1],
    ['bSprint', 'Run', 1],
    ['stickBase', 'Joystick', 1],
  ];

  function lay(id: string): LayoutItem {
    return S.layout[id] || (S.layout[id] = { x: 0, y: 0, s: 1, o: 1, h: false });
  }

  function editable(it: [string, string, number?]) {
    return (isTouch || !it[2]) && (it[0] !== 'stickBase' || S.stickFixed);
  }

  function applyLayout() {
    for (const it of LAY) {
      const id = it[0];
      const el = document.getElementById(id);
      if (!el) continue;
      const l = S.layout[id] || { x: 0, y: 0, s: 1, o: 1, h: false };
      let s = l.s * (it[2] ? S.btnScale : S.hudScale);
      if (id === 'stickBase') s = l.s * S.stickSize;
      const move = !(id === 'stickBase' && !S.stickFixed);
      el.style.translate = move ? `${l.x}px ${l.y}px` : '';
      el.style.scale = String(s);
      el.style.setProperty('--eo', String(l.o));
      let hide = !!l.h;
      if (id === 'radar' && !S.showRadar) hide = true;
      if (id === 'stickBase') hide = false;
      el.classList.toggle('uihide', hide);
    }
  }

  let selId: string | null = null;
  let drag: { id: string; px: number; py: number; x0: number; y0: number } | null = null;

  function selectEd(id: string) {
    selId = id;
    LAY.forEach((it) => {
      const el = document.getElementById(it[0]);
      if (el) el.classList.toggle('sel', it[0] === id);
    });
    const l = lay(id);
    const found = LAY.find((i) => i[0] === id);
    $('edName').textContent = `${found ? found[1] : id} · drag to move`;
    ($('edSize') as HTMLInputElement).value = String(l.s);
    ($('edOp') as HTMLInputElement).value = String(l.o);
    $('edHide').textContent = l.h ? 'Show' : 'Hide';
    $('edSizeO').textContent = Math.round(l.s * 100) + '%';
    $('edOpO').textContent = Math.round(l.o * 100) + '%';
  }

  function startEdit() {
    if (editing) return;
    editing = true;
    document.body.classList.add('editing');
    $('settings').classList.remove('open');
    $('card').hidden = true;
    $('hud').hidden = false;
    $('radar').hidden = false;
    $('topRightHud').hidden = false;
    if (isTouch) {
      $('touch').hidden = false;
      syncStick();
    }
    LAY.forEach((it) => {
      const el = document.getElementById(it[0]);
      if (el && editable(it)) el.classList.add('ed');
    });
    applyLayout();
    selectEd(isTouch ? 'bFire' : 'hp');
  }

  function endEdit() {
    editing = false;
    document.body.classList.remove('editing');
    LAY.forEach((it) => {
      const el = document.getElementById(it[0]);
      if (el) el.classList.remove('ed', 'sel');
    });
    if (state !== 'paused') {
      $('hud').hidden = true;
      $('radar').hidden = true;
      $('topRightHud').hidden = true;
      $('touch').hidden = true;
    }
    syncStick();
    applyLayout();
    saveSet();
    $('settings').classList.add('open');
  }

  LAY.forEach((it) => {
    const el = document.getElementById(it[0]);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      if (!editing || !el.classList.contains('ed')) return;
      e.preventDefault();
      e.stopPropagation();
      selectEd(it[0]);
      const l = lay(it[0]);
      drag = { id: it[0], px: e.clientX, py: e.clientY, x0: l.x, y0: l.y };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== it[0]) return;
      const l = lay(it[0]);
      l.x = drag.x0 + (e.clientX - drag.px);
      l.y = drag.y0 + (e.clientY - drag.py);
      applyLayout();
    });
    const up = () => {
      if (drag) {
        saveSet();
        drag = null;
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });

  $('edSize').addEventListener('input', (e) => {
    if (!selId) return;
    const l = lay(selId);
    l.s = +(e.target as HTMLInputElement).value;
    $('edSizeO').textContent = Math.round(l.s * 100) + '%';
    applyLayout();
    saveSet();
  });
  $('edOp').addEventListener('input', (e) => {
    if (!selId) return;
    const l = lay(selId);
    l.o = +(e.target as HTMLInputElement).value;
    $('edOpO').textContent = Math.round(l.o * 100) + '%';
    applyLayout();
    saveSet();
  });
  $('edHide').addEventListener('click', () => {
    if (!selId) return;
    const l = lay(selId);
    l.h = !l.h;
    $('edHide').textContent = l.h ? 'Show' : 'Hide';
    applyLayout();
    saveSet();
  });
  $('edResetOne').addEventListener('click', () => {
    if (!selId) return;
    delete S.layout[selId];
    applyLayout();
    selectEd(selId);
    saveSet();
  });
  $('edResetAll').addEventListener('click', () => {
    S.layout = {};
    applyLayout();
    if (selId) selectEd(selId);
    saveSet();
  });
  $('edDone').addEventListener('click', endEdit);

  /* ---------- Settings Panel ---------- */
  function applyAll() {
    document.documentElement.style.setProperty('--op', String(S.op));
    $('touch').dir = S.lefty ? 'rtl' : 'ltr';
    const c = hud.cross;
    ['cx-cross', 'cx-dot', 'cx-circle', 'cx-none'].forEach((n) => c.classList.remove(n));
    c.classList.add('cx-' + S.cxStyle);
    c.style.setProperty('--cc', S.cxColor);
    c.style.setProperty('--cs', String(S.cxSize));
    $('fps').style.display = S.showFps ? '' : 'none';
    $('vignette').style.display = S.vig ? '' : 'none';
    $('grain').style.display = S.grain ? '' : 'none';
    sun.castShadow = !isSoftwareGl && !!S.shadows;
    if (mapIdx >= 0) {
      renderer.toneMappingExposure = MAPS[mapIdx].theme.exp * S.bright;
      (scene.fog as T.FogExp2).density = MAPS[mapIdx].theme.fogD * S.fogMul;
    }
    if (weather) weather.p.visible = !!S.weather;
    setAudioVolumes(S.vMaster, S.vSfx, S.vAmb, isAudioMuted());
    syncStick();
    applyLayout();
  }

  function applyKey(k: string) {
    applyAll();
    if (k === 'q' || k === 'res') applyQuality();
  }

  const pct = (v: number) => Math.round(v * 100) + '%';
  const MODE2: [string, string][] = [
    ['toggle', 'Toggle'],
    ['hold', 'Hold'],
  ];

  type SchemaItem =
    | [keyof typeof S, 'range', string, number, number, number, (v: number) => string, 'touch'?]
    | [keyof typeof S, 'check', string, 'touch'?]
    | [keyof typeof S, 'select', string, [string, string][]]
    | [string, 'action', string, string];

  const SCHEMA: { tab: string; desktop?: boolean; keys?: boolean; items: SchemaItem[] }[] = [
    {
      tab: 'Controls',
      items: [
        ['sens', 'range', 'Look speed', 0.3, 3, 0.05, (v) => v.toFixed(2) + '×'],
        ['adsSens', 'range', 'Zoom look speed', 0.2, 1.2, 0.05, pct],
        ['invY', 'check', 'Invert Y axis'],
        ['sprintMode', 'select', 'Sprint', MODE2],
        ['crouchMode', 'select', 'Crouch', MODE2],
        ['adsMode', 'select', 'Aim down sights', [['hold', 'Hold'], ['toggle', 'Toggle']]],
        ['auto', 'check', 'Auto-fire when crosshair is on an enemy', 'touch'],
        ['assist', 'range', 'Aim assist strength', 0, 1.5, 0.1, pct, 'touch'],
        ['vibe', 'check', 'Vibration', 'touch'],
        ['stickFixed', 'check', 'Fixed joystick (instead of floating)', 'touch'],
        ['stickSize', 'range', 'Joystick size', 0.7, 1.6, 0.05, pct, 'touch'],
        ['deadzone', 'range', 'Joystick dead zone', 0, 0.35, 0.01, pct, 'touch'],
        ['lefty', 'check', 'Left-handed layout', 'touch'],
        ['btnScale', 'range', 'Button size', 0.7, 1.5, 0.05, pct, 'touch'],
        ['op', 'range', 'Button opacity', 0.25, 1, 0.05, pct, 'touch'],
      ],
    },
    {
      tab: 'HUD',
      items: [
        ['_edit', 'action', 'Edit HUD layout', 'Drag, resize, fade or hide every control'],
        ['_resetLayout', 'action', 'Reset HUD layout', 'Put every control back'],
        ['hudScale', 'range', 'HUD size', 0.7, 1.5, 0.05, pct],
        ['showRadar', 'check', 'Radar'],
        ['showBars', 'check', 'Enemy health bars'],
        ['showDmg', 'check', 'Damage numbers'],
        ['showDir', 'check', 'Incoming-fire arrow'],
        ['showFps', 'check', 'FPS counter'],
        [
          'cxStyle',
          'select',
          'Crosshair',
          [
            ['cross', 'Cross'],
            ['dot', 'Dot'],
            ['circle', 'Circle'],
            ['none', 'None'],
          ],
        ],
        [
          'cxColor',
          'select',
          'Crosshair color',
          [
            ['#ffffff', 'White'],
            ['#8fd16a', 'Green'],
            ['#5ad7ff', 'Cyan'],
            ['#ffc13d', 'Amber'],
            ['#ff4d4d', 'Red'],
          ],
        ],
        ['cxSize', 'range', 'Crosshair size', 0.5, 2, 0.05, pct],
      ],
    },
    {
      tab: 'Gameplay',
      items: [
        [
          'mode',
          'select',
          'Game mode',
          [
            ['endless', 'Endless survival'],
            ['timed', 'Timed survival · 3 minutes'],
            ['cod', 'Elimination · 30 kills'],
            ['megafps', 'Mega Arena · Largest Map'],
          ],
        ],
        ['fov', 'range', 'Field of view', 60, 100, 1, (v) => v + '°'],
        ['shake', 'range', 'Screen shake', 0, 1.5, 0.1, pct],
        ['bob', 'range', 'Camera bob', 0, 1.5, 0.1, pct],
        [
          'wheelSlow',
          'range',
          'Weapon wheel slow-motion',
          0.05,
          1,
          0.05,
          (v) => (v >= 0.99 ? 'Off' : Math.round(v * 100) + '% speed'),
        ],
        ['autoReload', 'check', 'Reload automatically when empty'],
        ['hitFx', 'check', 'Hit marker and sound'],
      ],
    },
    {
      tab: 'Graphics',
      items: [
        [
          'q',
          'select',
          'Quality',
          [
            ['auto', 'Auto (adapts to your device)'],
            ['ultra', 'Ultra (best visuals)'],
            ['high', 'High'],
            ['low', 'Low (fastest)'],
          ],
        ],
        ['res', 'range', 'Resolution scale', 0.5, 1.25, 0.05, pct],
        ['shadows', 'check', 'Shadows'],
        ['weather', 'check', 'Weather particles'],
        ['bright', 'range', 'Brightness', 0.7, 1.4, 0.05, pct],
        ['fogMul', 'range', 'Fog amount', 0.3, 1.6, 0.05, pct],
        ['vig', 'check', 'Vignette'],
        ['grain', 'check', 'Film grain'],
      ],
    },
    {
      tab: 'Audio',
      items: [
        ['vMaster', 'range', 'Master volume', 0, 1, 0.05, pct],
        ['vSfx', 'range', 'Effects', 0, 1, 0.05, pct],
        ['vAmb', 'range', 'Ambient wind', 0, 1, 0.05, pct],
      ],
    },
    { tab: 'Keys', desktop: true, keys: true, items: [] },
  ];

  const KEYACT: [string, string][] = [
    ['fwd', 'Move forward'],
    ['back', 'Move back'],
    ['left', 'Strafe left'],
    ['right', 'Strafe right'],
    ['jump', 'Jump'],
    ['sprint', 'Sprint'],
    ['crouch', 'Crouch'],
    ['reload', 'Reload'],
    ['medkit', 'Use Medkit'],
    ['wheel', 'Weapon wheel (hold)'],
    ['fire', 'Alternate fire'],
  ];

  const keyName = (c: string) =>
    String(c)
      .replace(/^(Key|Digit)/, '')
      .replace('ShiftLeft', 'L-Shift')
      .replace('ShiftRight', 'R-Shift')
      .replace('ControlLeft', 'L-Ctrl')
      .replace('Space', 'Space');

  let curTab = 0;
  const tabs = SCHEMA.filter((t) => !(t.desktop && isTouch));

  function mkEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string,
    txt?: string
  ): HTMLElementTagNameMap[K] {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (txt !== undefined) d.textContent = txt;
    return d;
  }

  function rowFor(it: SchemaItem) {
    const [k, t, label] = it;
    const r = mkEl('div', 'srow');
    if (t === 'range') {
      const [, , , min, max, step, fmt] = it;
      const l = mkEl('label', '', label);
      l.htmlFor = 'st_' + k;
      const inp = mkEl('input');
      inp.type = 'range';
      inp.id = 'st_' + k;
      inp.min = String(min);
      inp.max = String(max);
      inp.step = String(step);
      inp.value = String(S[k as keyof typeof S]);
      const o = mkEl('output', '', fmt(Number(S[k as keyof typeof S])));
      inp.addEventListener('input', () => {
        (S as Record<string, unknown>)[k] = +inp.value;
        o.textContent = fmt(+inp.value);
        saveSet();
        applyKey(k);
      });
      r.appendChild(l);
      r.appendChild(inp);
      r.appendChild(o);
    } else if (t === 'check') {
      r.className = 'srow chk';
      const l = mkEl('label', '', label);
      l.htmlFor = 'st_' + k;
      const inp = mkEl('input');
      inp.type = 'checkbox';
      inp.id = 'st_' + k;
      inp.checked = !!S[k as keyof typeof S];
      inp.addEventListener('change', () => {
        (S as Record<string, unknown>)[k] = inp.checked;
        saveSet();
        applyKey(k);
      });
      r.appendChild(l);
      r.appendChild(inp);
    } else if (t === 'select') {
      const l = mkEl('label', '', label);
      l.htmlFor = 'st_' + k;
      const sel = mkEl('select');
      sel.id = 'st_' + k;
      it[3].forEach((op) => {
        const o = mkEl('option', '', op[1]);
        o.value = op[0];
        sel.appendChild(o);
      });
      sel.value = String(S[k as keyof typeof S]);
      sel.addEventListener('change', () => {
        (S as Record<string, unknown>)[k] = sel.value;
        if (k === 'mode' && S.mode === 'megafps') S.map = 5;
        saveSet();
        applyKey(k);
        if (k === 'mode') {
          loadMap(S.mode === 'megafps' ? 5 : S.map);
          buildMenuMapRefresh();
        }
      });
      r.appendChild(l);
      r.appendChild(sel);
    } else {
      r.className = 'srow two';
      const l = mkEl('label', '', label);
      const sm = mkEl('small', '', it[3]);
      l.appendChild(sm);
      const b = mkEl('button', 'opt on', k === '_edit' ? 'Edit' : 'Reset');
      b.type = 'button';
      b.addEventListener('click', () => {
        if (k === '_edit') startEdit();
        else {
          S.layout = {};
          applyLayout();
          saveSet();
        }
      });
      r.appendChild(l);
      r.appendChild(b);
    }
    return r;
  }

  function renderTab(i: number) {
    curTab = i;
    const body = $('sbody');
    body.innerHTML = '';
    [...$('stabs').children].forEach((b, j) => b.classList.toggle('on', j === i));
    const tab = tabs[i];
    if (tab.keys) {
      KEYACT.forEach((a) => {
        const r = mkEl('div', 'srow two');
        const l = mkEl('label', '', a[1]);
        const b = mkEl('button', 'opt', keyName(K[a[0]]));
        b.type = 'button';
        b.addEventListener('click', () => {
          if (rebindBtn && rebinding) rebindBtn.textContent = keyName(K[rebinding]);
          rebinding = a[0];
          rebindBtn = b;
          b.textContent = 'Press a key…';
        });
        r.appendChild(l);
        r.appendChild(b);
        body.appendChild(r);
      });
      const r = mkEl('div', 'srow two');
      r.appendChild(mkEl('label', '', 'Weapons 1–6 and the mouse wheel stay fixed.'));
      const b = mkEl('button', 'opt on', 'Reset keys');
      b.type = 'button';
      b.addEventListener('click', () => {
        S.keys = {};
        Object.assign(K, KD);
        saveSet();
        renderTab(i);
      });
      r.appendChild(b);
      body.appendChild(r);
      return;
    }
    tab.items.forEach((it) => {
      if (it[it.length - 1] === 'touch' && !isTouch) return;
      body.appendChild(rowFor(it));
    });
  }

  function buildSettings() {
    const tb = $('stabs');
    tb.innerHTML = '';
    tabs.forEach((t, i) => {
      const b = mkEl('button', 'opt', t.tab);
      b.type = 'button';
      b.addEventListener('click', () => renderTab(i));
      tb.appendChild(b);
    });
    renderTab(0);
  }

  $('openSet').addEventListener('click', () => {
    $('card').hidden = true;
    $('settings').classList.add('open');
    renderTab(curTab);
  });
  $('setBack').addEventListener('click', () => {
    $('settings').classList.remove('open');
    $('card').hidden = false;
  });
  $('setReset').addEventListener('click', () => {
    const keep = { map: S.map, diff: S.diff };
    const fresh = JSON.parse(JSON.stringify(DEF));
    Object.assign(S, fresh, keep);
    Object.assign(K, KD);
    saveSet();
    applyAll();
    applyQuality();
    renderTab(curTab);
  });

  if (S.mode === 'megafps') S.map = 5;
  buildMenu();
  buildWheel();
  applyWeapon();
  loadMap(S.mode === 'megafps' ? 5 : S.map);
  buildSettings();
  applyAll();
  applyQuality();

  /* ---------- Simulation Loop ---------- */
  const GUN_BASE = new T.Vector3(0.2, -0.2, -0.42);
  const GUN_ADS = new T.Vector3(0, -0.135, -0.34);
  const losRay = new T.Raycaster();
  const eyeV = new T.Vector3();
  const toV = new T.Vector3();
  const mzV = new T.Vector3();
  const tgtV = new T.Vector3();
  const shotV = new T.Vector3();
  let tAll = 0;

  function hasLOS(e: EnemyActor) {
    eyeV.set(e.g.position.x, 1.5, e.g.position.z);
    toV.set(P.pos.x - eyeV.x, P.pos.y - 0.6 * P.crouchT - eyeV.y, P.pos.z - eyeV.z);
    const d = toV.length();
    toV.normalize();
    losRay.set(eyeV, toV);
    losRay.far = d;
    const h = losRay.intersectObjects(statics, false);
    return h.length === 0 || h[0].distance > d - 0.4;
  }

  function findAim() {
    let best: { e: EnemyActor; ang: number; dx: number; dy: number; dz: number; d: number } | null = null;
    const cp = Math.cos(P.pitch);
    const fx = -Math.sin(P.yaw) * cp;
    const fy = Math.sin(P.pitch);
    const fz = -Math.cos(P.yaw) * cp;
    for (const e of enemies) {
      if (e.dead || !e.los) continue;
      const dx = e.g.position.x - P.pos.x;
      const dy = 1.3 * e.sc - P.pos.y;
      const dz = e.g.position.z - P.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 80 || d < 1) continue;
      const dot = (dx * fx + dy * fy + dz * fz) / d;
      if (dot < 0.97) continue;
      const ang = Math.acos(Math.min(1, dot));
      if (!best || ang < best.ang) best = { e, ang, dx, dy, dz, d };
    }
    return best;
  }

  function updatePlayer(dt: number) {
    const w = WEAPONS[cw];
    const ws = WS[cw];
    const ss = 1 - (1 - S.adsSens * (w.scope ? 0.65 : 1)) * P.ads;
    if (wheel.open) {
      TI.lx = 0;
      TI.ly = 0;
    }
    const aL = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
    const aU = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
    if (!wheel.open) {
      P.yaw += aL * dt * 2.1 * ss;
      P.pitch = clamp(P.pitch + aU * dt * 1.6 * ss, -1.5, 1.5);
    }
    if (isTouch) {
      const f = 1 - Math.exp(-dt * 32);
      const ax = TI.lx * f;
      const ay = TI.ly * f;
      TI.lx -= ax;
      TI.ly -= ay;
      const rate = Math.hypot(ax, ay) / Math.max(dt, 0.001);
      let lk = 0.0044 * S.sens * (1 + Math.min(rate, 1800) / 2400) * ss;
      if (S.assist > 0 && aimT && aimT.ang < 0.075) lk *= 1 - 0.5 * Math.min(1, S.assist);
      P.yaw -= ax * lk;
      P.pitch = clamp(P.pitch - ay * lk * (S.invY ? -1 : 1), -1.5, 1.5);
    }
    aimT = findAim();
    const firing = (mouseDown || TI.fire || keys[K.fire]) && !wheel.open;
    if (isTouch && S.assist > 0 && aimT && firing && aimT.ang < 0.1) {
      const k = Math.min(1, dt * 4 * S.assist);
      let dy = Math.atan2(-aimT.dx, -aimT.dz) - P.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      P.yaw += dy * k;
      P.pitch += (Math.atan2(aimT.dy, Math.hypot(aimT.dx, aimT.dz)) - P.pitch) * k;
    }

    if (P.swapT > 0) {
      P.swapT = Math.max(0, P.swapT - dt);
      if (P.swapTo >= 0 && P.swapT <= 0.18) {
        cw = P.swapTo;
        P.swapTo = -1;
        applyWeapon();
      }
    }
    const swapLow = P.swapT > 0 ? Math.sin(clamp(1 - P.swapT / 0.36, 0, 1) * Math.PI) : 0;

    const fw = clamp((keys[K.fwd] ? 1 : 0) - (keys[K.back] ? 1 : 0) - TI.my, -1, 1);
    const st = clamp((keys[K.right] ? 1 : 0) - (keys[K.left] ? 1 : 0) + TI.mx, -1, 1);
    if (fw <= 0) sprintTog = false;
    const sprintReq = (S.sprintMode === 'toggle' ? sprintTog : keys[K.sprint]) || TI.sprint || TI.my < -0.92;
    const sprint = sprintReq && fw > 0 && P.reloading <= 0 && !wheel.open;
    if (sprint && crouchTog) {
      crouchTog = false;
      $('bCrouch').classList.remove('on');
    }
    P.sprinting = sprint;
    const wantC = (crouchTog || (S.crouchMode === 'hold' && (keys[K.crouch] || TI.crouch)) || keys.ControlLeft) && !sprint;
    P.crouchT += ((wantC ? 1 : 0) - P.crouchT) * Math.min(1, dt * 10);
    P.ads += ((adsOn && !sprint && P.swapT <= 0 ? 1 : 0) - P.ads) * Math.min(1, dt * 12);

    const sp = (sprint ? 8.4 : 5.2) * (1 - 0.35 * P.ads) * (1 - 0.42 * P.crouchT);
    const sy = Math.sin(P.yaw);
    const cy = Math.cos(P.yaw);
    let wx = -sy * fw + cy * st;
    let wz = -cy * fw - sy * st;
    const l = Math.hypot(wx, wz);
    if (l > 1) {
      wx /= l;
      wz /= l;
    }
    const k2 = Math.min(1, dt * (P.ground ? 12 : 3));
    P.vel.x += (wx * sp - P.vel.x) * k2;
    P.vel.z += (wz * sp - P.vel.z) * k2;
    P.vel.y -= 18 * dt;
    P.pos.x += P.vel.x * dt;
    P.pos.z += P.vel.z * dt;
    P.pos.y += P.vel.y * dt;

    if (P.ground) P.coyoteT = 0.1;
    else P.coyoteT = Math.max(0, P.coyoteT - dt);
    if (P.jumpBufT > 0) P.jumpBufT = Math.max(0, P.jumpBufT - dt);

    if (P.pos.y <= 1.7) {
      if (!P.ground && P.vel.y < -2) {
        P.scaleY = 0.86; // landing squash
      }
      P.pos.y = 1.7;
      P.vel.y = 0;
      P.ground = true;
      if (P.jumpBufT > 0) jump();
    }
    P.scaleY += (1 - P.scaleY) * Math.min(1, dt * 12);

    resolveCircleAABBCollision(P.pos, 0.45, obs, BOUND);

    const moving = Math.hypot(P.vel.x, P.vel.z);
    if (P.ground && moving > 1.5) {
      P.bob += dt * moving * 1.5;
      const stp = Math.floor(P.bob / Math.PI);
      if (stp !== P.lastStep) {
        P.lastStep = stp;
        sndStep(sprint);
      }
    }
    const bobY = P.ground ? Math.sin(P.bob * 2) * 0.025 * Math.min(1, moving / 5) * (1 - P.ads) * S.bob : 0;
    P.shake = Math.max(0, P.shake - dt * 2.2);
    const roll = P.shake > 0 ? Math.sin(tAll * 60) * P.shake * P.shake * 0.025 * S.shake : 0;
    const swayK = w.scope ? P.ads : 0;
    const swY = Math.sin(tAll * 1.3) * 0.0012 * swayK;
    const swP = Math.cos(tAll * 1.7) * 0.0012 * swayK;
    camera.position.set(P.pos.x, P.pos.y * P.scaleY + bobY - 0.6 * P.crouchT, P.pos.z);
    camera.rotation.set(
      P.pitch + swP + (P.shake > 0 ? Math.sin(tAll * 47) * P.shake * P.shake * 0.01 * S.shake : 0),
      P.yaw + swY,
      roll
    );
    P.sk = P.sk + ((sprint ? 1 : 0) - P.sk) * Math.min(1, dt * 8);
    const fov = S.fov + (w.zoom - S.fov) * P.ads + P.sk * 5 * (1 - P.ads);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    setScope(P.ads);

    P.kick = Math.max(0, P.kick - dt * 9);
    P.fireT = Math.max(0, P.fireT - dt);
    const rl = P.reloading > 0 ? Math.sin(clamp(1 - P.reloading / w.rel, 0, 1) * Math.PI) : 0;
    const a = P.ads;
    const sw = (moving / 5) * (1 - a);
    gun.position.set(
      GUN_BASE.x + (GUN_ADS.x - GUN_BASE.x) * a + Math.sin(P.bob) * 0.006 * sw + (sprint ? -0.05 : 0),
      GUN_BASE.y +
        (GUN_ADS.y - GUN_BASE.y) * a +
        Math.abs(Math.cos(P.bob)) * 0.008 * sw -
        rl * 0.16 -
        swapLow * 0.3,
      GUN_BASE.z +
        (GUN_ADS.z - GUN_BASE.z) * a +
        P.kick * 0.035 * (1 - 0.5 * a) * (w.rec > 3 ? 1.8 : 1) +
        (sprint ? 0.03 : 0)
    );
    gun.rotation.set(P.kick * 0.05 * (1 - 0.5 * a) + rl * 0.7 + swapLow * 0.5, sprint ? 0.35 : 0, rl * -0.25);
    const lh = models[cw] && (models[cw].userData.lh as T.Group | undefined);
    if (lh) {
      lh.rotation.set(rl * 0.62 - P.kick * 0.02, rl * 0.28, -rl * 0.1);
      lh.position.set(-0.22 - rl * 0.04, -0.46 - rl * 0.06, 0.44 + rl * 0.05);
    }
    document.body.classList.toggle('lowhp', P.hp < PLAYER_MAX_HP * 0.3 && P.hp > 0);

    if (P.reloading > 0) {
      P.reloading -= dt;
      hud.reload.textContent = 'Reloading';
      if (P.reloading <= 0) {
        const n = Math.min(w.mag - ws.mag, ws.res);
        ws.mag += n;
        ws.res -= n;
        hud.reload.textContent = '';
        hudDirty = true;
        sndClick();
      }
    } else if (ws.mag === 0 && ws.res === 0) hud.reload.textContent = 'Out of ammo';
    else hud.reload.textContent = ws.mag <= Math.max(1, Math.round(w.mag * 0.2)) ? 'Low — press R' : '';

    P.lastHurt += dt;
    const nextHp = computeRegenHp(P.hp, P.lastHurt, D.regenDelay, D.regen, dt);
    if (nextHp !== P.hp) {
      P.hp = nextHp;
      hudDirty = true;
      updMedkit();
    }

    let auto = false;
    if (isTouch && S.auto && P.reloading <= 0 && aimT && !wheel.open) {
      auto = aimT.ang < 0.4 / aimT.d + 0.008 && (!w.scope || P.ads > 0.8);
    }
    if (firing || auto) fire();
  }

  function enemyShoot(e: EnemyActor, dist: number) {
    const g = e.g;
    sndShot(0.1 + (1 - clamp(dist / 40, 0, 1)) * 0.28, true, SND_EN);
    g.localToWorld(mzV.set(0.14, 1.2, 1));
    shotV.copy(mzV);
    enemyFlash(shotV);
    let hp = clamp(0.62 - dist * 0.014, 0.12, 0.55) * D.acc;
    if (Math.hypot(P.vel.x, P.vel.z) > 6) hp *= 0.7;
    hp *= (1 - 0.25 * P.ads) * (1 - 0.2 * P.crouchT);
    hp = Math.min(hp, 0.85);
    tgtV.set(P.pos.x, P.pos.y - 0.25 - 0.6 * P.crouchT, P.pos.z);
    if (Math.random() < hp) {
      tracer(shotV, tgtV, 0xff8a50);
      hurt(e.dmg, g.position);
    } else {
      tgtV.x += (Math.random() - 0.5) * 3;
      tgtV.y += (Math.random() - 0.5) * 2;
      tgtV.z += (Math.random() - 0.5) * 3;
      tracer(shotV, tgtV, 0xff8a50);
    }
  }

  function updateEnemies(dt: number) {
    let alive = 0;
    const live: EnemyActor[] = [];
    for (const e of enemies) {
      if (!e.dead) {
        alive++;
        live.push(e);
      }
    }
    const cands = live.filter((e) => (e.mode === 'peek' || e.mode === 'aim') && e.los);
    cands.sort((a, b) => a.g.position.distanceToSquared(P.pos) - b.g.position.distanceToSquared(P.pos));
    const tokens = Math.max(1, (wave < 3 ? 2 : 3) + D.tok);
    for (const e of live) e.canShoot = false;
    for (let i = 0; i < cands.length && i < tokens; i++) cands[i].canShoot = true;

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const g = e.g;
      if (e.dead) {
        e.deadT += dt;
        const f = Math.min(e.deadT * 3.2, 1.5);
        g.rotation.x = -f * e.fd;
        g.rotation.z = f * 0.25 * e.fd;
        g.position.y = f * 0.08;
        if (e.deadT > 5) removeEnemy(e);
        continue;
      }
      e.t += dt;
      e.stag = Math.max(0, e.stag - dt);
      e.modeT -= dt;
      const dx = P.pos.x - g.position.x;
      const dz = P.pos.z - g.position.z;
      const dist = Math.max(0.01, Math.hypot(dx, dz));
      const ty = Math.atan2(dx, dz);
      let dyaw = ty - e.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      e.yaw += dyaw * Math.min(1, dt * 9);
      g.rotation.y = e.yaw;
      e.losT -= dt;
      if (e.losT <= 0) {
        e.los = hasLOS(e);
        e.losT = 0.25;
      }

      let mx = 0;
      let mz = 0;
      let spdM = 1;
      const px = -dz / dist;
      const pz = dx / dist;

      if (e.type === 'rusher' || e.type === 'zombie') {
        mx = dx / dist;
        mz = dz / dist;
        e.meleeT -= dt;
        const reach = e.type === 'zombie' ? 2.15 : 2.2;
        if (dist < reach && e.meleeT <= 0) {
          e.meleeT = e.type === 'zombie' ? 0.72 : 0.8;
          hurt(e.dmg, g.position);
          if (e.type === 'zombie') {
            e.stag = 0.08;
            g.rotation.x = -0.12;
          }
        }
      } else if (e.mode === 'advance') {
        mx = dx / dist;
        mz = dz / dist;
        if (e.los && dist < e.range) {
          e.mode = e.type === 'marksman' ? 'aim' : 'peek';
          e.modeT = (2.2 + Math.random() * 1.6) * D.peek;
          e.aimT = 0;
          e.burst = 0;
          e.shootT = 0.5 + Math.random() * 0.6;
        }
      } else if (e.mode === 'peek') {
        e.strafeT -= dt;
        if (e.strafeT <= 0) {
          e.strafe = -e.strafe;
          e.strafeT = 1.2 + Math.random() * 1.8;
        }
        mx = px * e.strafe * 0.5;
        mz = pz * e.strafe * 0.5;
        if (dist < 8) {
          mx -= (dx / dist) * 0.7;
          mz -= (dz / dist) * 0.7;
        }
        if (!e.los && e.modeT < 1.2) {
          e.mode = 'advance';
        } else if (e.modeT <= 0) {
          const c = findCoverSpot(e, P.pos, obs, BOUND);
          if (c) {
            e.cover = c;
            e.mode = 'toCover';
            e.modeT = 6;
          } else e.modeT = (1.6 + Math.random() * 1.6) * D.peek;
        }
        if (e.canShoot && dist < 40 && e.def.cd && e.def.burst) {
          e.shootT -= dt;
          if (e.shootT <= 0) {
            enemyShoot(e, dist);
            e.burst++;
            if (e.burst >= e.burstMax) {
              e.burst = 0;
              e.burstMax = Math.round(e.def.burst[0] + Math.random() * (e.def.burst[1] - e.def.burst[0]));
              e.shootT = (0.9 + Math.random() * 0.9) * D.cd;
            } else {
              e.shootT = (e.def.cd[0] + Math.random() * (e.def.cd[1] - e.def.cd[0])) * D.cd;
            }
          }
        }
      } else if (e.mode === 'toCover' && e.cover) {
        const cx = e.cover.x - g.position.x;
        const cz = e.cover.z - g.position.z;
        const cd = Math.hypot(cx, cz);
        if (cd < 0.8 || e.modeT <= 0) {
          e.mode = 'hold';
          e.modeT = 1.1 + Math.random() * 1.7;
        } else {
          mx = cx / cd;
          mz = cz / cd;
          spdM = 1.35;
        }
      } else if (e.mode === 'hold') {
        if (e.modeT <= 0) {
          e.mode = e.los ? 'peek' : 'advance';
          e.modeT = (2 + Math.random() * 2) * D.peek;
          e.burst = 0;
          e.shootT = 0.4 + Math.random() * 0.5;
        }
      } else if (e.mode === 'aim' && e.laser) {
        if (e.canShoot && e.los) {
          if (e.aimT === 0) sndLaser();
          e.aimT += dt;
          g.localToWorld(mzV.set(0.14, 1.28, 1.1));
          shotV.copy(mzV);
          tgtV.set(P.pos.x, P.pos.y - 0.3 - 0.6 * P.crouchT, P.pos.z);
          e.laser.visible = true;
          placeBeam(e.laser, shotV, tgtV);
          if (e.aimT >= 1.1) {
            e.laser.visible = false;
            e.aimT = 0;
            sndShot(0.4, true, { f: 2200, d: 0.5, th: 90 });
            enemyFlash(shotV);
            const still = Math.hypot(P.vel.x, P.vel.z) < 2;
            const hp = Math.min(0.92, (still ? 0.9 : 0.4) * D.acc * (1 - 0.15 * P.crouchT));
            if (Math.random() < hp) {
              tracer(shotV, tgtV, 0xff5a40);
              hurt(e.dmg, g.position);
            } else {
              tgtV.x += (Math.random() - 0.5) * 2;
              tracer(shotV, tgtV, 0xff5a40);
            }
            e.mode = 'recover';
            e.modeT = 2.2 * D.cd;
          }
        } else {
          e.laser.visible = false;
          e.aimT = Math.max(0, e.aimT - dt);
          if (!e.los && e.modeT < -1.5) e.mode = 'advance';
        }
      } else if (e.mode === 'recover') {
        if (e.laser) e.laser.visible = false;
        mx = px * e.strafe * 0.4;
        mz = pz * e.strafe * 0.4;
        if (e.modeT <= 0) {
          e.mode = e.los ? 'aim' : 'advance';
          e.modeT = 0;
          e.aimT = 0;
        }
      }

      for (const o of live) {
        if (o !== e) {
          const ox = g.position.x - o.g.position.x;
          const oz = g.position.z - o.g.position.z;
          const od = Math.hypot(ox, oz);
          if (od < 1.1 && od > 0.001) {
            mx += (ox / od) * 0.6;
            mz += (oz / od) * 0.6;
          }
        }
      }
      const spd =
        e.speed *
        spdM *
        (e.stag > 0 ? 0.35 : 1) *
        (e.mode === 'hold' || e.mode === 'aim' ? 0 : 1) *
        (dist < 2.2 && e.type === 'rusher' ? 0 : 1);
      const k = Math.min(1, dt * 6);
      e.vx += (mx * spd - e.vx) * k;
      e.vz += (mz * spd - e.vz) * k;
      g.position.x += e.vx * dt;
      g.position.z += e.vz * dt;
      resolveCircleAABBCollision(g.position, 0.45, obs, BOUND);
      const ty2 = e.sc * (e.mode === 'hold' ? 0.8 : 1);
      g.scale.y += (ty2 - g.scale.y) * Math.min(1, dt * 10);
      const sw =
        Math.sin(e.t * e.speed * (e.type === 'zombie' ? 1.8 : 2.4)) *
        (e.type === 'zombie' ? 0.95 : 0.7) *
        Math.min(1, Math.hypot(e.vx, e.vz) / 2);
      e.legs[0].rotation.x = sw;
      e.legs[1].rotation.x = -sw;

      const b = e.bar;
      b.visible = S.showBars && e.hp < e.maxhp && dist < 45;
      if (b.visible) {
        b.position.set(g.position.x, 2.15 * e.sc, g.position.z);
        b.quaternion.copy(camera.quaternion);
        const r = Math.max(0, e.hp / e.maxhp);
        e.fg.scale.x = r;
        e.fm.color.setHex(r > 0.5 ? 0xd6442e : r > 0.25 ? 0xf0a23a : 0xe8e0cf);
      }
    }
    return alive;
  }

  function updateSpawns(dt: number, alive: number) {
    gateT -= dt;
    sinceGroup += dt;
    if (S.mode === 'cod' && kills >= 30) {
      gameWin();
      return;
    }
    if (grp > 0) {
      spawnT -= dt;
      if (!queue.length) grp = 0;
      else if (spawnT <= 0) {
        spawnOne(queue.shift()!);
        grp--;
        spawnT = mapIdx === 3 ? 0.22 : 0.45;
        hudDirty = true;
      }
      return;
    }
    if (queue.length) {
      if (mapIdx === 3) {
        const cap = Math.min(isTouch ? 24 : 38, 12 + Math.floor(wave * 1.6));
        if (alive < cap && (gateT <= 0 || alive < Math.min(6, cap))) {
          grp = Math.min(queue.length, Math.max(4, Math.min(8, 3 + Math.floor(wave / 2))), cap - alive);
          spawnT = 0;
          sinceGroup = 0;
          gateT = 0.45;
        }
      } else if (gateT <= 0 && (alive <= 1 || sinceGroup > 14)) {
        grp = Math.min(queue.length, 2 + Math.floor(wave / 3), 4);
        spawnT = 0;
        sinceGroup = 0;
        gateT = 1.2;
      }
      return;
    }
    if (waveDelay > 0) {
      waveDelay -= dt;
      if (waveDelay <= 0) startWave();
      return;
    }
    if (alive === 0) {
      waveDelay = 3;
      banner(`Wave ${wave} cleared`, 2200);
      for (let i = 0; i < WEAPONS.length; i++) {
        WS[i].res = Math.min(WEAPONS[i].max, WS[i].res + Math.round(WEAPONS[i].mag * 0.6));
      }
      P.hp = Math.min(PLAYER_MAX_HP, P.hp + 25);
      hudDirty = true;
    }
  }

  /* ---------- Radar with Obstacle Projection ---------- */
  const rc = $('radar') as HTMLCanvasElement;
  const rx = rc.getContext('2d')!;
  function drawRadar() {
    const Wd = rc.width;
    const c = Wd / 2;
    const R = c - 6;
    const range = 42;
    const sc = R / range;
    rx.clearRect(0, 0, Wd, Wd);
    rx.save();
    rx.beginPath();
    rx.arc(c, c, R + 4, 0, 7);
    rx.clip();
    rx.strokeStyle = 'rgba(233,230,220,.16)';
    rx.lineWidth = 1.5;
    rx.beginPath();
    rx.arc(c, c, R * 0.5, 0, 7);
    rx.stroke();
    rx.beginPath();
    rx.moveTo(c, c - R);
    rx.lineTo(c, c + R);
    rx.moveTo(c - R, c);
    rx.lineTo(c + R, c);
    rx.stroke();

    // Forward view cone
    rx.fillStyle = 'rgba(143,209,106,.14)';
    rx.beginPath();
    rx.moveTo(c, c);
    rx.arc(c, c, R, -Math.PI / 2 - 0.63, -Math.PI / 2 + 0.63);
    rx.closePath();
    rx.fill();

    const sy = Math.sin(P.yaw);
    const cy = Math.cos(P.yaw);

    // Project real navigable level obstacles onto radar
    rx.fillStyle = 'rgba(255,255,255,0.18)';
    for (const o of obs) {
      const wx = (o.minX + o.maxX) * 0.5;
      const wz = (o.minZ + o.maxZ) * 0.5;
      const dx = wx - P.pos.x;
      const dz = wz - P.pos.z;
      if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
      const X = dx * cy - dz * sy;
      const Y = -dx * sy - dz * cy;
      const w = Math.max(2, (o.maxX - o.minX) * sc);
      const h = Math.max(2, (o.maxZ - o.minZ) * sc);
      rx.fillRect(c + X * sc - w * 0.5, c - Y * sc - h * 0.5, w, h);
    }

    const dot = (wx: number, wz: number, col: string, s: number, sq: boolean) => {
      const dx = wx - P.pos.x;
      const dz = wz - P.pos.z;
      let X = dx * cy - dz * sy;
      let Y = -dx * sy - dz * cy;
      const d = Math.hypot(X, Y);
      if (d > range) {
        X *= range / d;
        Y *= range / d;
      }
      rx.fillStyle = col;
      if (sq) rx.fillRect(c + X * sc - s, c - Y * sc - s, s * 2, s * 2);
      else {
        rx.beginPath();
        rx.arc(c + X * sc, c - Y * sc, s, 0, 7);
        rx.fill();
      }
    };

    for (const p of pickups) {
      dot(p.m.position.x, p.m.position.z, p.kind === 'health' ? '#8fd16a' : '#ffc13d', 4.5, true);
    }
    for (const e of enemies) {
      if (e.dead) continue;
      dot(
        e.g.position.x,
        e.g.position.z,
        e.type === 'rusher'
          ? '#ffd24a'
          : e.type === 'heavy'
          ? '#e04bd0'
          : e.type === 'marksman'
          ? '#9d6bff'
          : '#ff4d4d',
        e.type === 'heavy' ? 8.5 : 6.5,
        false
      );
    }
    rx.restore();
    rx.fillStyle = '#f1f3f5';
    rx.beginPath();
    rx.moveTo(c, c - 9);
    rx.lineTo(c + 7, c + 7);
    rx.lineTo(c - 7, c + 7);
    rx.closePath();
    rx.fill();
  }

  /* ---------- Frame Loop with Software-WebGL Pacing ---------- */
  let last = performance.now();
  let qAvg = 1 / 60;
  let hudT = 0;
  let radT = 0;
  let fpsT = 0;
  const fpsEl = $('fps');
  let frameId = 0;
  let disposed = false;

  function afterDraw(cb: () => void) {
    if (disposed) return;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    } else {
      frameId = window.setTimeout(cb, 80);
    }
  }

  function tick() {
    if (disposed) return;
    const now = performance.now();
    const rdt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    tAll += rdt;
    SKY.uTime.value = tAll;
    qAvg += (rdt - qAvg) * 0.05;
    if (S.showFps) {
      fpsT -= rdt;
      if (fpsT <= 0) {
        fpsEl.textContent = Math.round(1 / qAvg) + ' fps';
        fpsT = 0.5;
      }
    }

    tscale += ((wheel.open ? S.wheelSlow : 1) - tscale) * Math.min(1, rdt * 10);
    if (hitstopT > 0) hitstopT = Math.max(0, hitstopT - rdt);
    const dt = hitstopT > 0 ? 0 : rdt * tscale;

    if (medkitCooldown > 0) {
      medkitCooldown = Math.max(0, medkitCooldown - rdt);
      if (medkitCooldown === 0) updMedkit();
    }

    if (state === 'play') {
      runTime += dt;
      if (S.mode === 'timed' && runTime >= 180) {
        gameWin();
      } else {
        updatePlayer(dt);
        const alive = updateEnemies(dt);
        updateSpawns(dt, alive);
        updateGrenades(dt);
        if (streakT > 0) {
          streakT -= dt;
          if (streakT <= 0) streak = 0;
        }
        for (let i = pickups.length - 1; i >= 0; i--) {
          const p = pickups[i];
          p.t += dt;
          p.m.rotation.y += dt * 2;
          p.m.position.y = 0.45 + Math.sin(p.t * 3) * 0.08;
          if (Math.hypot(p.m.position.x - P.pos.x, p.m.position.z - P.pos.z) < 1.8) {
            if (p.kind === 'health') {
              P.hp = Math.min(PLAYER_MAX_HP, P.hp + 40);
              banner('MEDKIT +40', 900);
            } else {
              const idx = Math.floor(Math.random() * WEAPONS.length);
              const w = WEAPONS[idx];
              const gain = idx === 5 ? 1 + Math.floor(Math.random() * 2) : Math.max(8, Math.round(w.mag * 0.75));
              WS[idx].res = Math.min(w.max, WS[idx].res + gain);
              banner(`LOOTED · ${w.name} +${gain}`, 1400);
            }
            sndPick();
            hudDirty = true;
            scene.remove(p.m);
            pickups.splice(i, 1);
          }
        }
        hudT -= rdt;
        if ((hudDirty || S.mode === 'timed') && hudT <= 0) {
          updHud();
          hudT = 0.1;
        }
        radT -= rdt;
        if (radT <= 0) {
          if (S.showRadar) drawRadar();
          radT = isTouch ? 0.1 : 0.05;
        }
        if (wheel.open) wheelRefresh();
        const sx = Math.round(P.pos.x / 2) * 2;
        const sz = Math.round(P.pos.z / 2) * 2;
        sun.target.position.set(sx, 0, sz);
        sun.position.set(sx + sunOff.x, sunOff.y, sz + sunOff.z);
      }
    } else {
      camera.position.set(Math.sin(tAll * 0.12) * 12, 4.4, 22 + Math.cos(tAll * 0.12) * 3);
      camera.rotation.set(-0.08, Math.sin(tAll * 0.12) * 0.25, 0);
      if (camera.fov !== S.fov) {
        camera.fov = S.fov;
        camera.updateProjectionMatrix();
      }
      gun.position.copy(GUN_BASE);
      gun.rotation.set(0, 0, 0);
      sun.target.position.set(0, 0, 10);
      sun.position.set(sunOff.x, sunOff.y, 10 + sunOff.z);
    }

    updateWeather(dt);
    for (const p of parts) {
      if (p.life > 0) {
        p.life -= rdt;
        p.v.y -= 9 * rdt;
        p.m.position.addScaledVector(p.v, rdt);
        (p.m.material as T.MeshBasicMaterial).opacity = Math.max(0, p.life * 3);
        if (p.life <= 0) p.m.visible = false;
      }
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= rdt;
      (t.m.material as T.MeshBasicMaterial).opacity = Math.max(0, t.life / 0.07);
      if (t.life <= 0) {
        scene.remove(t.m);
        (t.m.material as T.Material).dispose();
        tracers.splice(i, 1);
      }
    }
    for (const f of eFlash) {
      if (f.life > 0) {
        f.life -= rdt;
        if (f.life <= 0) f.s.visible = false;
      }
    }
    for (const l of lamps) {
      l.l.intensity = l.base * (0.92 + Math.sin(tAll * 7 + l.ph) * 0.04);
    }

    renderer.render(scene, camera);
    if (isSoftwareGl) afterDraw(tick);
    else frameId = requestAnimationFrame(tick);
  }

  resetGame();
  updHud();

  // Support ?autostart=1 query parameter to jump straight into gameplay
  if (new URLSearchParams(window.location.search).get('autostart') === '1') {
    startOrResumeGame();
  }

  if (isSoftwareGl) afterDraw(tick);
  else frameId = requestAnimationFrame(tick);

  return () => {
    disposed = true;
    cancelAnimationFrame(frameId);
    clearTimeout(frameId);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('blur', clearInputsOnBlur);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    renderer.dispose();
  };
}
