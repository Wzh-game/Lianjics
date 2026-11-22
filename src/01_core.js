/* ============================================================
   三角洲行动 · 网页版  —— 核心：常量 / 贴图 / 地图 / 碰撞
   ============================================================ */
'use strict';
const T = THREE;
const DF = {};
DF.VERSION = '1.2.0';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const now = () => performance.now() / 1000;
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const angLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/* ---------------- 全局配置 ---------------- */
const CFG = {
  eye: 1.62, crouchEye: 1.05, radius: 0.42,
  walk: 5.4, sprint: 7.9, adsSpeed: 2.9, crouchSpeed: 2.2,
  jumpV: 5.6, gravity: 19.5,
  maxHp: 150,
  // 伤害下调：无护甲时躯干 5 枪、爆头 3 枪、腿部 9 枪（血量 150）
  fireRate: 0.0875, dmgBody: 32, dmgHead: 65, dmgLeg: 18,
  mag: 30, reserveMax: 150, reloadTime: 2.05,
  respawnTime: 4.0, killTarget: 20, timeLimit: 720,
  tickHz: 20, sendHz: 30,
  spread: 0.016, adsSpread: 0.0042, moveSpread: 0.02,
  mapHalf: 88, botNames: ['游隼', '黑鹰', '蝰蛇', '铁壁', '夜莺', '风暴', '猎豹', '山猫', '寒鸦', '钢牙'],
  colors: ['#5c6b47', '#6d6144', '#4a5b64', '#6b4f45', '#575f43', '#4f5a51', '#6a6247'],
  maxClients: 6
};

DF.net = null;          // 网络管理器
DF.players = new Map(); // id -> player entity
DF.myId = 'local';
DF.isHost = true;
DF.mode = 'single';     // single | host | guest
DF.time = 0;            // 本地时间
DF.M = {};              // 事件/数据总线

/* ---------------- 程序化贴图 ---------------- */
function noiseCanvas(size, base, vary, extra) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * vary;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  g.putImageData(img, 0, 0);
  if (extra) extra(g, size);
  return c;
}
function texFromCanvas(c, rx, ry) {
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = 4;
  return t;
}
DF.buildTextures = function () {
  // 混凝土墙
  const wallC = noiseCanvas(128, '#8a8d7d', 26, (g, s) => {
    g.strokeStyle = 'rgba(40,45,36,.35)'; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      g.beginPath(); g.moveTo(Math.random() * s, Math.random() * s);
      let x = Math.random() * s, y = Math.random() * s;
      for (let k = 0; k < 6; k++) { x += rnd(-16, 16); y += rnd(-16, 16); g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(60,64,52,.28)';
    for (let i = 0; i < 8; i++) g.fillRect(Math.random() * s, Math.random() * s, rnd(6, 26), rnd(2, 5));
    // 砖缝
    g.strokeStyle = 'rgba(30,34,26,.18)';
    for (let y = 0; y < s; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
  });
  // 集装箱
  const cont = (base) => noiseCanvas(128, base, 16, (g, s) => {
    g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 3;
    for (let x = 0; x < s; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,.22)';
    for (let x = 6; x < s; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
    // 锈迹
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(${120 + Math.random() * 40},${60 + Math.random() * 30},30,${0.1 + Math.random() * 0.2})`;
      g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, rnd(3, 12), rnd(3, 10), 0, 0, 7); g.fill();
    }
  });
  // 沙袋
  const sand = noiseCanvas(128, '#a99873', 30, (g, s) => {
    for (let y = 0; y < s; y += 21) {
      g.strokeStyle = 'rgba(70,60,38,.55)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
      for (let x = (y / 21) % 2 === 0 ? 0 : 24; x < s; x += 48) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 21); g.stroke();
      }
    }
  });
  // 木箱
  const wood = noiseCanvas(128, '#8b6238', 24, (g, s) => {
    g.strokeStyle = 'rgba(50,32,14,.55)'; g.lineWidth = 3;
    g.strokeRect(2, 2, s - 4, s - 4);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
    g.strokeStyle = 'rgba(60,40,20,.3)'; g.lineWidth = 1;
    for (let y = 0; y < s; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
  });
  // 地面
  const ground = noiseCanvas(256, '#6d6a52', 22, (g, s) => {
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${70 + Math.random() * 50},${68 + Math.random() * 40},${45 + Math.random() * 30},${0.08 + Math.random() * 0.18})`;
      g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, rnd(6, 40), rnd(6, 34), Math.random() * 3, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(48,46,34,.22)'; g.lineWidth = 1;
    for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(Math.random() * s, 0); g.lineTo(Math.random() * s, s); g.stroke(); }
  });
  const metal = noiseCanvas(128, '#5c6068', 18, (g, s) => {
    g.strokeStyle = 'rgba(255,255,255,.07)';
    for (let x = 0; x < s; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(130,70,30,${0.1 + Math.random() * 0.2})`;
      g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, rnd(2, 9), rnd(2, 8), 0, 0, 7); g.fill();
    }
  });
  DF.TEX = {
    wall: texFromCanvas(wallC, 2, 1),
    ground: texFromCanvas(ground, 30, 30),
    sand: texFromCanvas(sand, 1, 1),
    wood: texFromCanvas(wood, 1, 1),
    metal: texFromCanvas(metal, 2, 1),
    contA: texFromCanvas(cont('#4a6f5c'), 1, 1),
    contB: texFromCanvas(cont('#8a4a3a'), 1, 1),
    contC: texFromCanvas(cont('#3f5a78'), 1, 1)
  };
};

/* ---------------- 场景初始化 ---------------- */
DF.worldMeshes = [];   // 用于射线检测的实体网格
DF.colliders = [];     // {minx,maxx,miny,maxy,minz,maxz}
DF.obstacleMeta = [];  // 小地图用

DF.initWorld = function (scene, mapId) {
  const validMaps = ['base', 'outpost', 'oilfield', 'urban', 'harbor', 'frontier'];
  mapId = validMaps.includes(mapId) ? mapId : 'base';
  DF.buildTextures();
  DF.worldMeshes = []; DF.colliders = []; DF.obstacleMeta = [];
  // 每张地图的尺寸 / 氛围参数（frontier = 320×320m 开放大地图）
  const TUNING = {
    base:    { half: 88,  fogN: 55, fogF: 245, ground: 400,  shadow: 95,  shadowMap: 1536, shadowFar: 300, sunPos: [70, 110, 45], texRepeat: 30 },
    outpost: { half: 88,  fogN: 55, fogF: 245, ground: 400,  shadow: 95,  shadowMap: 1536, shadowFar: 300, sunPos: [70, 110, 45], texRepeat: 30 },
    oilfield:{ half: 88,  fogN: 55, fogF: 245, ground: 400,  shadow: 95,  shadowMap: 1536, shadowFar: 300, sunPos: [70, 110, 45], texRepeat: 30 },
    urban:   { half: 88,  fogN: 55, fogF: 245, ground: 400,  shadow: 95,  shadowMap: 1536, shadowFar: 300, sunPos: [70, 110, 45], texRepeat: 30 },
    harbor:  { half: 88,  fogN: 55, fogF: 245, ground: 400,  shadow: 95,  shadowMap: 1536, shadowFar: 300, sunPos: [70, 110, 45], texRepeat: 30 },
    frontier:{ half: 160, fogN: 90, fogF: 560, ground: 1200, shadow: 178, shadowMap: 2048, shadowFar: 470, sunPos: [95, 135, 65], texRepeat: 84 }
  }[mapId];
  CFG.mapHalf = TUNING.half;

  // ---- 天空 ----
  const skyGeo = new T.SphereGeometry(600, 32, 20);
  const skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new T.Color('#27435e') },
      mid: { value: new T.Color('#8294a0') },
      bot: { value: new T.Color('#c4b18c') }
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      void main(){ float h = normalize(vP).y;
        vec3 c = h > 0.0 ? mix(mid, top, pow(h,0.65)) : mix(mid, bot, pow(-h,0.4));
        gl_FragColor = vec4(c,1.0); }`
  });
  const sky = new T.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  const atmosphere = {
    base:     { fog: '#a8a493', ground: 0xa8a089 },
    outpost:  { fog: '#a8a493', ground: 0xa8a089 },
    oilfield: { fog: '#c4a477', ground: 0xb69a69 },
    urban:    { fog: '#89939a', ground: 0x777b78 },
    harbor:   { fog: '#91aeb7', ground: 0x82989a },
    frontier: { fog: '#aab28b', ground: 0x7d8159 }
  }[mapId];
  scene.fog = new T.Fog(new T.Color(atmosphere.fog), TUNING.fogN, TUNING.fogF);
  scene.background = new T.Color(atmosphere.fog);

  // ---- 光照 ----
  const hemi = new T.HemisphereLight(0xcfd8dc, 0x4a4436, 0.62);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xffe8c0, 1.0);
  sun.position.set(TUNING.sunPos[0], TUNING.sunPos[1], TUNING.sunPos[2]);
  sun.castShadow = true;
  sun.shadow.mapSize.set(TUNING.shadowMap, TUNING.shadowMap);
  const sc = sun.shadow.camera;
  sc.left = -TUNING.shadow; sc.right = TUNING.shadow; sc.top = TUNING.shadow; sc.bottom = -TUNING.shadow; sc.near = 20; sc.far = TUNING.shadowFar;
  if (sc.updateProjectionMatrix) sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  DF.sun = sun;

  // ---- 地面 ----
  let groundMap = DF.TEX.ground;
  if (TUNING.texRepeat !== 30) {
    groundMap = DF.TEX.ground.clone();
    groundMap.needsUpdate = true;
    groundMap.repeat.set(TUNING.texRepeat, TUNING.texRepeat);
  }
  const gMat = new T.MeshStandardMaterial({ map: groundMap, roughness: 0.97, metalness: 0.02, color: atmosphere.ground });
  const ground = new T.Mesh(new T.PlaneGeometry(TUNING.ground, TUNING.ground), gMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);
  DF.worldMeshes.push(ground);

  // ---- 材质库 ----
  const M = {
    wall: new T.MeshStandardMaterial({ map: DF.TEX.wall, roughness: 0.92, color: 0xa9a897 }),
    wallDark: new T.MeshStandardMaterial({ map: DF.TEX.wall, roughness: 0.94, color: 0x84887a }),
    metal: new T.MeshStandardMaterial({ map: DF.TEX.metal, roughness: 0.55, metalness: 0.65, color: 0xc8ccd2 }),
    wood: new T.MeshStandardMaterial({ map: DF.TEX.wood, roughness: 0.88, color: 0xb59570 }),
    sand: new T.MeshStandardMaterial({ map: DF.TEX.sand, roughness: 1.0, color: 0xb4a986 }),
    contA: new T.MeshStandardMaterial({ map: DF.TEX.contA, roughness: 0.6, metalness: 0.45 }),
    contB: new T.MeshStandardMaterial({ map: DF.TEX.contB, roughness: 0.6, metalness: 0.45 }),
    contC: new T.MeshStandardMaterial({ map: DF.TEX.contC, roughness: 0.6, metalness: 0.45 })
  };
  DF.MATS = M;

  /**
   * 添加一个长方体（轴对齐）
   */
  function box(x, y, z, w, h, d, mat, opt) {
    opt = opt || {};
    const g = new T.BoxGeometry(w, h, d);
    // 让贴图按尺寸缩放
    const m = mat.clone();
    if (m.map) {
      m.map = m.map.clone();
      m.map.needsUpdate = true;
      m.map.wrapS = m.map.wrapT = T.RepeatWrapping;
      m.map.repeat.set(Math.max(1, w / 4), Math.max(1, h / 4));
    }
    const mesh = new T.Mesh(g, m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = opt.noShadow ? false : true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (opt.collide !== false) {
      mesh.userData.solid = true;
      DF.worldMeshes.push(mesh);
      DF.colliders.push({
        minx: x - w / 2, maxx: x + w / 2, miny: y, maxy: y + h,
        minz: z - d / 2, maxz: z + d / 2
      });
      DF.obstacleMeta.push({ x, z, w, d, h });
    }
    return mesh;
  }
  DF.box = box;

  /* ---------------- 地图布局 ---------------- */
  const HW = CFG.mapHalf;

  if (mapId === 'frontier') {
    // 开放大地图的天然边界：大小错落的陡岩环（取代围墙），保留开阔感但封闭边界
    const rimMat = new T.MeshStandardMaterial({ color: 0x6f6a5c, roughness: 1, flatShading: true });
    const rimMat2 = new T.MeshStandardMaterial({ color: 0x7e7867, roughness: 1, flatShading: true });
    const rim = mulberry32(20261122);
    const o = HW + 3;
    for (let x = -HW - 4; x <= HW + 4; x += 14) {
      box(x + (rim() - 0.5) * 3, 0, -o, 13 + rim() * 5, 6.5 + rim() * 5.5, 5 + rim() * 3, rim() < 0.5 ? rimMat : rimMat2);
      box(x + (rim() - 0.5) * 3, 0, o, 13 + rim() * 5, 6.5 + rim() * 5.5, 5 + rim() * 3, rim() < 0.5 ? rimMat : rimMat2);
    }
    for (let z = -HW - 4; z <= HW + 4; z += 14) {
      box(-o, 0, z + (rim() - 0.5) * 3, 5 + rim() * 3, 6.5 + rim() * 5.5, 13 + rim() * 5, rim() < 0.5 ? rimMat : rimMat2);
      box(o, 0, z + (rim() - 0.5) * 3, 5 + rim() * 3, 6.5 + rim() * 5.5, 13 + rim() * 5, rim() < 0.5 ? rimMat : rimMat2);
    }
    // 四角巨岩
    [[-o, -o], [o, -o], [-o, o], [o, o]].forEach(([cx, cz]) => box(cx, 0, cz, 11, 10 + rim() * 4, 11, rimMat));
  } else {
    // 外围围墙
    box(0, 0, -HW, HW * 2 + 4, 7, 2, M.wallDark);
    box(0, 0, HW, HW * 2 + 4, 7, 2, M.wallDark);
    box(-HW, 0, 0, 2, 7, HW * 2 + 4, M.wallDark);
    box(HW, 0, 0, 2, 7, HW * 2 + 4, M.wallDark);
    // 围墙压顶（装饰）
    [[0, -HW, HW * 2 + 4, 2], [0, HW, HW * 2 + 4, 2], [-HW, 0, 2, HW * 2 + 4], [HW, 0, 2, HW * 2 + 4]].forEach(([x, z, w, d]) => {
      box(x, 7, z, w, 0.35, d + 0.5, M.wall, { collide: false, noShadow: true });
    });
  }

  if (mapId === 'base') {
  // ===== 大型仓库（西北）=====
  (function warehouse() {
    const cx = -48, cz = -40, W = 34, D = 26, H = 8;
    // 北墙
    box(cx, 0, cz - D / 2, W, H, 1.2, M.wall);
    // 南墙（留两个门洞）
    box(cx - 11, 0, cz + D / 2, 12, H, 1.2, M.wall);
    box(cx + 11, 0, cz + D / 2, 12, H, 1.2, M.wall);
    box(cx, H - 2.2, cz + D / 2, 10, 2.2, 1.2, M.metal); // 门楣
    // 东西墙
    box(cx - W / 2, 0, cz, 1.2, H, D, M.wall);
    box(cx + W / 2, 0, cz, 1.2, H, D, M.wall);
    // 屋顶
    box(cx, H, cz, W + 1, 0.5, D + 1, M.metal, { collide: false, noShadow: true });
    // 内部货架/箱子
    box(cx - 9, 0, cz - 6, 2.4, 2.6, 8, M.metal);
    box(cx + 8, 0, cz - 4, 2.4, 2.6, 10, M.metal);
    box(cx - 2, 0, cz + 5, 3, 1.8, 3, M.wood);
    box(cx + 12, 0, cz + 7, 2, 2, 2, M.wood);
    box(cx - 13, 0, cz + 8, 2, 2, 2, M.wood);
    // 顶部补光（装饰灯）
    ['#ffd27a'].forEach(() => {
      const lamp = new T.Mesh(new T.SphereGeometry(0.35, 8, 6), new T.MeshBasicMaterial({ color: 0xffe0a0 }));
      lamp.position.set(cx, H - 1.2, cz);
      scene.add(lamp);
      const pl = new T.PointLight(0xffd090, 0.9, 40, 2);
      pl.position.set(cx, H - 2, cz);
      scene.add(pl);
    });
  })();

  // ===== 办公楼（东北）=====
  (function office() {
    const cx = 44, cz = -46, W = 26, D = 18, H = 10;
    box(cx, 0, cz - D / 2, W, H, 1.2, M.wall);
    box(cx - W / 2, 0, cz, 1.2, H, D, M.wall);
    box(cx + W / 2, 0, cz, 1.2, H, D, M.wall);
    // 南墙带缺口
    box(cx - 8, 0, cz + D / 2, 10, H, 1.2, M.wall);
    box(cx + 8, 0, cz + D / 2, 10, H, 1.2, M.wall);
    box(cx, H, cz, W + 1, 0.5, D + 1, M.metal, { collide: false, noShadow: true });
    // 二楼平台（视觉）
    box(cx, 3.2, cz, W - 3, 0.4, 5, M.metal, { collide: true });
    // 窗户（装饰）
    for (let i = 0; i < 3; i++) {
      const win = new T.Mesh(new T.PlaneGeometry(3.2, 2), new T.MeshStandardMaterial({ color: 0x2b3d4a, metalness: .8, roughness: .25 }));
      win.position.set(cx - 7 + i * 7, 5.5, cz - D / 2 + 0.65);
      scene.add(win);
    }
    // 入口掩体
    box(cx, 0, cz + D / 2 + 4, 6, 1.0, 1.0, M.sand);
  })();

  // ===== 集装箱堆场（中央 & 南）=====
  const contMats = [M.contA, M.contB, M.contC];
  function container(x, z, horiz, stacked) {
    const L = 8, Wd = 3.2, H = 2.9;
    box(x, 0, z, horiz ? L : Wd, H, horiz ? Wd : L, contMats[rndInt(0, 2)]);
    if (stacked) box(x, H, z, horiz ? L : Wd, H, horiz ? Wd : L, contMats[rndInt(0, 2)]);
  }
  container(-6, 14, true, false);
  container(6, 14, true, true);
  container(18, 20, false, false);
  container(-20, 26, true, false);
  container(30, 2, false, true);
  container(-30, 4, false, false);
  container(4, 44, true, false);
  container(-12, 52, false, false);
  container(24, 52, true, true);
  container(56, 26, false, false);
  container(-58, 30, true, false);

  // ===== 木箱群 =====
  const crates = [
    [-16, -8], [-14, -10], [-18, -10.6], [22, -12], [24, -9], [23, -14.5],
    [0, -22], [2.2, -21], [-40, 6], [-43, 8], [-41, 11], [40, 12], [43, 14],
    [8, 30], [10, 32], [9, 28], [-52, -6], [-55, -8], [36, 34], [38, 36], [60, -20], [62, -22]
  ];
  crates.forEach(([x, z], i) => {
    const s = i % 5 === 0 ? 2.2 : 1.7;
    box(x, 0, z, s, s * 0.95, s, M.wood);
    if (i % 4 === 1) box(x, s * 0.95, z, s * 0.85, s * 0.8, s * 0.85, M.wood);
  });

  // ===== 沙袋掩体线 =====
  const bags = [
    [0, 0, 8, 0], [-14, 20, 6, 0], [14, 22, 6, 0], [-24, -24, 1, 7], [26, -28, 1, 7],
    [-60, -14, 7, 0], [58, -8, 6, 0], [0, 62, 10, 0], [-40, 44, 1, 6], [40, 44, 1, 6],
    [-68, 52, 6, 0], [66, 54, 6, 0]
  ];
  bags.forEach(([x, z, w, d]) => {
    if (d === 0) box(x, 0, z, w, 1.0, 1.1, M.sand);
    else box(x, 0, z, 1.1, 1.0, d, M.sand);
  });

  // ===== 水泥隔离墩 =====
  for (let i = 0; i < 10; i++) {
    const x = -70 + i * 15.5, z = 68;
    box(x, 0, z, 4, 0.95, 0.9, M.wallDark);
  }

  // ===== 瞭望塔（东南）=====
  (function tower() {
    const cx = 66, cz = 62;
    // 四根柱子 + 平台，用矮台代替可通行结构
    box(cx - 2.2, 0, cz - 2.2, 0.8, 6, 0.8, M.metal);
    box(cx + 2.2, 0, cz - 2.2, 0.8, 6, 0.8, M.metal);
    box(cx - 2.2, 0, cz + 2.2, 0.8, 6, 0.8, M.metal);
    box(cx + 2.2, 0, cz + 2.2, 0.8, 6, 0.8, M.metal);
    box(cx, 6, cz, 5.6, 0.4, 5.6, M.wood);
    // 梯子（视觉）
    const ladder = new T.Mesh(new T.BoxGeometry(0.9, 6, 0.15), new T.MeshStandardMaterial({ color: 0x9aa0a6, metalness: .8, roughness: .4 }));
    ladder.position.set(cx - 2.9, 3, cz);
    scene.add(ladder);
    ladder.castShadow = true;
  })();

  } else if (mapId === 'outpost') {
    // 边境前哨：错落的断墙、货柜与沙袋形成开阔的多条交战路线。
    // 不覆盖搜刮容器及撤离点，确保原有搜打撤玩法在两张图均可使用。
    const protectedPoints = (DF.containers || []).map(c => [c.x, c.z])
      .concat(((DF.getExtractDefs ? DF.getExtractDefs(mapId) : DF.EXTRACT_DEFS) || []).map(e => [e.x, e.z]));
    function cover(x, z, w, h, d, mat) {
      const tooClose = protectedPoints.some(([px, pz]) =>
        Math.abs(px - x) < w / 2 + 3 && Math.abs(pz - z) < d / 2 + 3);
      if (!tooClose) box(x, 0, z, w, h, d, mat);
    }
    // 城区外围断墙和哨卡，故意留下宽阔通路。
    for (const x of [-54, -30, -6, 18, 42, 66]) {
      cover(x, -60, 12, 2.6, 1.2, M.wallDark);
      cover(x + 5, 34, 10, 2.4, 1.2, M.wall);
    }
    for (const z of [-44, -20, 4, 28, 52]) {
      cover(-35, z, 1.2, 3.1, 10, M.wallDark);
      cover(35, z + 6, 1.2, 2.7, 10, M.wall);
    }
    // 中央战壕与错位箱群，形成与军事基地明显不同的开阔战场。
    for (const [x,z,w,d] of [[-18,-3,8,1],[0,2,10,1],[18,-2,8,1],[-14,15,1,7],[13,17,1,7],[-50,17,8,1],[53,4,8,1],[-25,58,8,1],[20,66,8,1]])
      cover(x, z, w, 1.05, d, M.sand);
    for (const [x,z,rot] of [[-65,-26,0],[-18,-40,1],[13,-37,0],[60,-38,1],[-56,40,0],[-8,34,1],[18,38,0],[52,24,1]])
      cover(x, z, rot ? 3.2 : 8, 2.9, rot ? 8 : 3.2, M.contB);
    for (const [x,z] of [[-48,-18],[-24,-55],[7,-53],[29,-18],[50,15],[-46,58],[-7,66],[48,63]])
      cover(x, z, 3, 2, 3, M.wood);
  } else if (mapId === 'oilfield') {
    // 沙漠油田：储油罐、抽油机、管线和采油厂房，保持撤离区周边畅通。
    const tankMat = new T.MeshStandardMaterial({ color: 0x9b8055, metalness: 0.62, roughness: 0.48 });
    const rustMat = new T.MeshStandardMaterial({ color: 0x68452d, metalness: 0.58, roughness: 0.72 });
    const pipeMat = new T.MeshStandardMaterial({ color: 0x554b3d, metalness: 0.72, roughness: 0.42 });
    function tank(x, z, r, h) {
      const body = new T.Mesh(new T.CylinderGeometry(r, r, h, 20), tankMat);
      body.position.set(x, h / 2, z); body.castShadow = true; body.receiveShadow = true;
      scene.add(body); DF.worldMeshes.push(body);
      DF.colliders.push({minx:x-r,maxx:x+r,miny:0,maxy:h,minz:z-r,maxz:z+r});
      DF.obstacleMeta.push({x,z,w:r*2,d:r*2,h});
      box(x, 0, z, r * 1.8, 0.65, r * 1.8, M.wallDark);
      const roof = new T.Mesh(new T.CylinderGeometry(r * 1.02, r * 1.02, 0.22, 20), rustMat);
      roof.position.set(x, h + 0.08, z); scene.add(roof);
    }
    [[-48,-42,8,10],[-28,-48,5,8],[42,-42,7,9],[52,18,6,8],[-48,38,6,7]].forEach(v=>tank(...v));
    // 采油机：底座、支架、横梁和配重。
    function pumpjack(x,z) {
      box(x,0,z,8,1.1,5,M.wallDark);
      box(x,1.1,z,0.9,5.2,0.9,rustMat);
      box(x,5.5,z,8.5,0.55,1.0,rustMat);
      box(x+3.1,3.6,z,1.6,2.2,1.6,M.metal);
      box(x-3.2,4.5,z,1.0,2.8,1.0,M.metal);
      const arm = new T.Mesh(new T.CylinderGeometry(0.16,0.16,7.5,10), rustMat);
      arm.position.set(x,6.0,z); arm.rotation.z=Math.PI/2; scene.add(arm);
    }
    pumpjack(-16,-8); pumpjack(28,4); pumpjack(-42,54);
    // 炼油厂低矮设备、输油管线与维修棚。
    box(8,0,-48,18,6,12,M.wallDark);
    box(8,6,-48,19,0.45,13,M.metal,{collide:false});
    for (const z of [-25,-20,34,42]) {
      box(0,0,z,42,0.8,0.9,pipeMat);
      box(-18,0,z+2,0.8,2.2,0.8,M.metal);
      box(18,0,z+2,0.8,2.2,0.8,M.metal);
    }
    [[-62,-4],[62,-18],[-12,58],[36,48]].forEach(([x,z])=>box(x,0,z,7,2.0,2.2,M.sand));
  } else if (mapId === 'urban') {
    // 废弃城区：破损楼体、街区外墙、公交站与路障构成多层巷战空间。
    const concrete = new T.MeshStandardMaterial({ color: 0x777d7d, roughness: 0.96 });
    const glass = new T.MeshStandardMaterial({ color: 0x263b43, metalness: 0.55, roughness: 0.28 });
    function ruin(x,z,w,d,h,openSide) {
      box(x,0,z-d/2,w,h,0.9,concrete);
      box(x-w/2,0,z,0.9,h,d,concrete);
      box(x+w/2,0,z,0.9,h,d,concrete);
      if (!openSide) box(x,0,z+d/2,w,h,0.9,concrete);
      box(x,h,z,w+0.5,0.35,d+0.5,M.wallDark,{collide:false});
      for(let i=0;i<Math.floor(w/5);i++){
        const win=new T.Mesh(new T.PlaneGeometry(2.2,1.5),glass);
        win.position.set(x-w/2+3+i*5,3.7,z-d/2+0.48); scene.add(win);
      }
    }
    ruin(-48,-42,25,20,7,true);
    ruin(46,-42,24,20,8,true);
    ruin(-48,42,22,18,6,false);
    ruin(42,38,26,20,7,true);
    // 破损街墙与中央路口掩体，保留从地图中央通向三处撤离点的通道。
    for(const [x,z,w,d,h] of [[-18,-54,12,1,2.8],[10,-56,15,1,2.4],[ -58,0,1,18,2.8],[58,-4,1,20,2.6],[-22,34,13,1,2.5],[18,48,12,1,2.8],[-4,-18,1,12,2.2],[28,8,1,14,2.6]])
      box(x,0,z,w,h,d,M.wallDark);
    // 翻倒车辆与混凝土路障。
    [[-8,12],[8,16],[30,-16],[-34,8],[48,10],[-54,20]].forEach(([x,z],i)=>{
      box(x,0,z, i%2?5.8:3.2,1.35,i%2?2.5:5.8,i%2?M.metal:M.wall);
      box(x,1.2,z,2.8,0.65,2.0,glass,{collide:false});
    });
    for(const [x,z] of [[-5,48],[8,-38],[62,48],[-64,-18]]) box(x,0,z,5,1.1,1.2,M.sand);
  } else if (mapId === 'harbor') {
    // 临海港口：彩色货柜、装卸仓库、岸边吊机与成排系缆设施。
    const craneMat = new T.MeshStandardMaterial({ color: 0xc18a3c, metalness: 0.68, roughness: 0.42 });
    const sea = new T.Mesh(new T.PlaneGeometry(18,104), new T.MeshStandardMaterial({ color: 0x315f70, roughness: 0.34, metalness: 0.18 }));
    sea.rotation.x=-Math.PI/2; sea.position.set(79,0.018,-18); sea.receiveShadow=true; scene.add(sea);
    // 港区货柜：不同高度与朝向形成多条射击走廊。
    const cm=[M.contA,M.contB,M.contC];
    [[-52,-34,0,0],[-38,-34,1,1],[-18,-28,0,0],[18,-34,1,0],[38,-30,0,1],[56,-8,1,0],[-54,18,1,0],[-30,30,0,1],[0,34,1,0],[28,28,0,0],[52,44,1,0]].forEach(([x,z,rot,stack],i)=>{
      const w=rot?3.2:8,d=rot?8:3.2;
      box(x,0,z,w,2.9,d,cm[i%3]);
      if(stack) box(x,2.9,z,w,2.9,d,cm[(i+1)%3]);
    });
    // 装卸仓库和吊机门架。
    box(-12,0,-58,26,7,12,M.wall);
    box(-12,7,-58,27,0.45,13,M.metal,{collide:false});
    for(const x of [-62,62]){
      box(x,0,-8,1.4,15,1.4,craneMat);
      box(x,14,-8,1.4,1.4,38,craneMat);
      box(x,0,10,1.4,15,1.4,craneMat);
      box(x,7,-8,1.0,0.8,28,M.metal,{collide:false});
    }
    for(const x of [-70,-48,48,70]) box(x,0,54,3,1.0,5,M.wallDark);
    // 岸边地面标线。
    for(let z=-72;z<=68;z+=12){
      const line=new T.Mesh(new T.PlaneGeometry(0.16,7),new T.MeshBasicMaterial({color:0xd6c38a}));
      line.rotation.x=-Math.PI/2; line.position.set(76,0.025,z); scene.add(line);
    }
  } else if (mapId === 'frontier') {
    // 吴家村 · 开放大地图（320×320m）：
    //   北部 北部机场（跑道/机库/塔台/残骸客机）｜中部 吴家村（民居/祠堂/院墙/村口牌坊）
    //   东   废弃军事基地（营房/塔台/掩体/坦克）｜西南 西南工业区（厂房/储油罐/集装箱/烟囱）
    //   河畔 河畔集市（集市建筑/开放广场/货摊）  —— 另有河道、桥、三条公路、森林、远景山脊。
    const rndF = mulberry32(20261122);   // 固定随机种，保证每局布局一致
    const rockMat = new T.MeshStandardMaterial({ color: 0x6f6a5c, roughness: 1, flatShading: true });
    const rockMat2 = new T.MeshStandardMaterial({ color: 0x7e7867, roughness: 1, flatShading: true });
    const pineMat = new T.MeshStandardMaterial({ color: 0x2f4d2c, roughness: 0.95, flatShading: true });
    const pineMat2 = new T.MeshStandardMaterial({ color: 0x3a5732, roughness: 0.95, flatShading: true });
    const trunkMat = new T.MeshStandardMaterial({ color: 0x453322, roughness: 1 });
    const dirtMat = new T.MeshStandardMaterial({ color: 0x5e5138, roughness: 1 });
    const waterMat = new T.MeshStandardMaterial({ color: 0x2e5a66, roughness: 0.18, metalness: 0.35, transparent: true, opacity: 0.92 });
    const hayMat = new T.MeshStandardMaterial({ color: 0xb39b56, roughness: 1 });
    const rustMatF = new T.MeshStandardMaterial({ color: 0x6e4a2e, roughness: 0.7, metalness: 0.5 });
    const bushMat = new T.MeshStandardMaterial({ color: 0x4c5a34, roughness: 1, flatShading: true });
    const asphaltMat = new T.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.92 });
    const whiteMat = new T.MeshBasicMaterial({ color: 0xd8d8d0 });
    const gateRed = new T.MeshStandardMaterial({ color: 0x7e2a1e, roughness: 0.7 });
    const concreteMat = new T.MeshStandardMaterial({ color: 0x777d7d, roughness: 0.95 });
    const darkMat = new T.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.8, metalness: 0.3 });
    const roofRust = new T.MeshStandardMaterial({ color: 0x5c4a34, roughness: 0.85, metalness: 0.2 });
    const planeMat = new T.MeshStandardMaterial({ color: 0x53575e, roughness: 0.6, metalness: 0.35 });

    // 远离关键位置（撤离点/村/机场/基地/工业区/集市）的散布校验
    const keepClear = [[0,-140],[136,136],[-136,138],[0,16],[8,-118],[0,-96],[48,-100],[8,-6],[8,60],[-72,0],[-46,30],[103,11],[-108,84],[-82,100],[-124,78],[-132,93],[-119,96],[-127,108]];
    const isClear = (x, z, r) => keepClear.every(([kx, kz]) => Math.hypot(kx - x, kz - z) > r);

    // —— 小型结构助手 ——
    function hayBale(x, z) {
      const m = new T.Mesh(new T.CylinderGeometry(1.05, 1.05, 1.55, 12), hayMat);
      m.rotation.z = Math.PI / 2; m.rotation.y = rndF() * 3;
      m.position.set(x, 1.05, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
      DF.worldMeshes.push(m);
      DF.colliders.push({ minx: x - 1.15, maxx: x + 1.15, miny: 0, maxy: 1.6, minz: z - 1.15, maxz: z + 1.15 });
    }
    function drums(x, z) {
      for (let i = 0; i < 4; i++) {
        const dx = (i % 2) * 0.95 - 0.5, dz = Math.floor(i / 2) * 0.95 - 0.5;
        const d = new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 0.95, 10), i % 3 ? rustMatF : M.contB);
        d.position.set(x + dx, 0.48, z + dz); d.castShadow = true; scene.add(d);
      }
      DF.colliders.push({ minx: x - 1, maxx: x + 1, miny: 0, maxy: 0.95, minz: z - 1, maxz: z + 1 });
    }
    function fence(x, z, len, axis) {
      if (axis === 'x') box(x, 0, z, len, 1.0, 0.22, M.wood); else box(x, 0, z, 0.22, 1.0, len, M.wood);
    }

    function factory(cx, cz, W, D, H, doorSide) {
      box(cx, 0, cz - D / 2, W, H, 0.9, M.wallDark);                 // 后墙
      box(cx - W / 2, 0, cz, 0.9, H, D, M.wallDark);                 // 西墙
      box(cx + W / 2, 0, cz, 0.9, H, D, M.wallDark);                 // 东墙
      const dz = doorSide === 'south' ? cz + D / 2 : cz - D / 2;
      box(cx - W / 4 - 0.8, 0, dz, W / 2 - 2.6, H, 0.9, M.wall);     // 前墙左
      box(cx + W / 4 + 0.8, 0, dz, W / 2 - 2.6, H, 0.9, M.wall);     // 前墙右（留门洞 4m）
      box(cx, H, cz, W + 0.6, 0.35, D + 0.6, roofRust, { collide: false, noShadow: true });
      box(cx - W / 4, H + 0.35, cz - 1.5, 2.2, 1.1, 2.2, darkMat, { collide: false });   // 屋顶通风机
      box(cx + W / 4, H + 0.35, cz + 1.5, 2.2, 1.1, 2.2, darkMat, { collide: false });
    }

    // ============ 河道（斜穿西南，可蹚过）+ 公路 + 桥 ============
    const river = new T.Mesh(new T.PlaneGeometry(18, 560), waterMat);
    river.rotation.x = -Math.PI / 2; river.rotation.z = 0.30; river.position.set(-72, 0.015, 0); scene.add(river);
    // 公路：南北干道（机场→村→南）
    const roadNS = new T.Mesh(new T.PlaneGeometry(9, HW * 2), dirtMat);
    roadNS.rotation.x = -Math.PI / 2; roadNS.position.set(8, 0.02, 0); roadNS.receiveShadow = true; scene.add(roadNS);
    // 公路：东西干道（工业区→桥→村口→基地）
    const roadEW = new T.Mesh(new T.PlaneGeometry(HW * 2, 9), dirtMat);
    roadEW.rotation.x = -Math.PI / 2; roadEW.position.set(0, 0.021, -6); roadEW.receiveShadow = true; scene.add(roadEW);
    // 公路：南线（工业区→村南→基地）
    const roadS = new T.Mesh(new T.PlaneGeometry(HW * 2, 8), dirtMat);
    roadS.rotation.x = -Math.PI / 2; roadS.position.set(0, 0.022, 60); roadS.receiveShadow = true; scene.add(roadS);
    // 河上桥（东西干道跨处）：桥面可走，两侧护栏装饰
    box(-67, 0, -6, 21, 0.35, 8, concreteMat, { collide: false, noShadow: true });
    box(-67, 0.35, -10, 21, 0.75, 0.3, concreteMat, { collide: false });
    box(-67, 0.35, -2, 21, 0.75, 0.3, concreteMat, { collide: false });
    // 十字路口与村口广场
    const cross = new T.Mesh(new T.CircleGeometry(9, 26), dirtMat);
    cross.rotation.x = -Math.PI / 2; cross.position.set(8, 0.023, -6); cross.receiveShadow = true; scene.add(cross);
    const cross2 = new T.Mesh(new T.CircleGeometry(7, 24), dirtMat);
    cross2.rotation.x = -Math.PI / 2; cross2.position.set(8, 0.023, 60); cross2.receiveShadow = true; scene.add(cross2);

    // ============ 北部机场（跑道/机库/塔台/残骸客机）============
    // 跑道 + 标线
    const runway = new T.Mesh(new T.PlaneGeometry(120, 13), asphaltMat);
    runway.rotation.x = -Math.PI / 2; runway.position.set(0, 0.025, -118); runway.receiveShadow = true; scene.add(runway);
    for (let x = -52; x <= 52; x += 8) {
      const dash = new T.Mesh(new T.PlaneGeometry(3.2, 0.5), whiteMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(x, 0.028, -118); scene.add(dash);
    }
    [-111.2, -124.8].forEach(z => {
      const edge = new T.Mesh(new T.PlaneGeometry(120, 0.4), whiteMat);
      edge.rotation.x = -Math.PI / 2; edge.position.set(0, 0.028, z); scene.add(edge);
    });
    // 机库（可进入，门洞朝南）
    function hangar(cx, cz, W, D, H) {
      box(cx, 0, cz - D / 2, W, H, 0.9, M.wallDark);                       // 后墙
      box(cx - W / 2, 0, cz, 0.9, H, D, M.wallDark);                       // 西墙
      box(cx + W / 2, 0, cz, 0.9, H, D, M.wallDark);                       // 东墙
      box(cx - W / 2 + 2.5, 0, cz + D / 2, 5, H, 0.9, M.wall);             // 前墙左段
      box(cx + W / 2 - 2.5, 0, cz + D / 2, 5, H, 0.9, M.wall);             // 前墙右段
      box(cx, H - 2.0, cz + D / 2, W - 10, 2.0, 0.9, M.metal, { collide: false });  // 门楣
      const roof1 = new T.Mesh(new T.BoxGeometry(W * 0.62, 0.28, D + 1.2), rustMatF);
      roof1.position.set(cx - W * 0.26, H + 0.7, cz); roof1.rotation.z = 0.18; scene.add(roof1);
      const roof2 = new T.Mesh(new T.BoxGeometry(W * 0.62, 0.28, D + 1.2), rustMatF);
      roof2.position.set(cx + W * 0.26, H + 0.7, cz); roof2.rotation.z = -0.18; scene.add(roof2);
    }
    hangar(-32, -96, 22, 13, 7);
    hangar(18, -96, 22, 13, 7);
    // 塔台
    const towerShaft = new T.Mesh(new T.CylinderGeometry(1.7, 2.1, 9.5, 10), M.metal);
    towerShaft.position.set(48, 4.75, -101); towerShaft.castShadow = true; scene.add(towerShaft);
    DF.worldMeshes.push(towerShaft);
    box(48, 9.5, -101, 4.6, 2.6, 4.6, M.wallDark);
    box(48, 12.1, -101, 5.2, 0.3, 5.2, rustMatF, { collide: false, noShadow: true });
    box(48, 0, -101, 4.2, 1.2, 4.2, concreteMat);
    const antenna = new T.Mesh(new T.CylinderGeometry(0.08, 0.12, 3.4, 6), M.metal);
    antenna.position.set(48, 13.6, -101); scene.add(antenna);
    DF.colliders.push({ minx: 46.3, maxx: 49.7, miny: 0, maxy: 9.5, minz: -102.7, maxz: -99.3 });
    // 残骸客机（停在跑道上）
    const fuselage = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 13, 12), planeMat);
    fuselage.rotation.z = Math.PI / 2; fuselage.position.set(0, 1.7, -118); fuselage.castShadow = true; scene.add(fuselage);
    const nose = new T.Mesh(new T.ConeGeometry(1.6, 3.2, 12), planeMat);
    nose.rotation.z = -Math.PI / 2; nose.position.set(8.1, 1.7, -118); scene.add(nose);
    const tailFin = new T.Mesh(new T.BoxGeometry(0.25, 2.6, 1.8), rustMatF);
    tailFin.position.set(-5.6, 3.8, -118); scene.add(tailFin);
    const wingL = new T.Mesh(new T.BoxGeometry(3.4, 0.16, 7.2), planeMat);
    wingL.position.set(0.6, 1.9, -118); wingL.rotation.x = 0.06; scene.add(wingL);
    const tailWing = new T.Mesh(new T.BoxGeometry(2.2, 0.14, 4.6), planeMat);
    tailWing.position.set(-5.8, 2.6, -118); scene.add(tailWing);
    DF.colliders.push({ minx: -6.6, maxx: 6.6, miny: 0, maxy: 3.4, minz: -121.7, maxz: -114.3 });
    DF.obstacleMeta.push({ x: 0, z: -118, w: 13, d: 7, h: 3.4 });
    // 机场围栏（南侧，中间留路口）
    fence(-29, -84, 66, 'x'); fence(37, -84, 50, 'x');

    // ============ 吴家村（民居/祠堂/院墙/村口牌坊）============
    function house(x, z, w, d, h, bodyMat, roofMat) {
      box(x, 0, z - d / 2, w, h, 0.7, bodyMat);                     // 后墙
      box(x - w / 2, 0, z, 0.7, h, d, bodyMat);                     // 西墙
      box(x + w / 2, 0, z, 0.7, h, d, bodyMat);                     // 东墙
      box(x - w / 2 + 1.5, 0, z + d / 2, w / 2 - 1.2, h, 0.7, bodyMat);  // 前墙左（留门洞）
      box(x + w / 2 - 1.5, 0, z + d / 2, w / 2 - 1.2, h, 0.7, bodyMat);  // 前墙右
      const r1 = new T.Mesh(new T.BoxGeometry(w + 1.6, 0.25, d * 0.62), roofMat);
      r1.position.set(x, h + 0.72, z - d * 0.24); r1.rotation.x = 0.34; r1.castShadow = true; scene.add(r1);
      const r2 = new T.Mesh(new T.BoxGeometry(w + 1.6, 0.25, d * 0.62), roofMat);
      r2.position.set(x, h + 0.72, z + d * 0.24); r2.rotation.x = -0.34; r2.castShadow = true; scene.add(r2);
    }
    house(-13, 6, 7, 6, 3.6, M.wood, rustMatF);
    house(12, 4, 6, 5.5, 3.3, M.wall, rustMatF);
    house(-14, 24, 6, 5, 3.2, M.wall, rustMatF);
    house(13, 24, 7, 6, 3.7, M.wood, rustMatF);
    // 祠堂（村中心）
    house(0, 14.5, 9, 7, 4.2, M.wallDark, rustMatF);
    // 井
    const well = new T.Mesh(new T.CylinderGeometry(1.1, 1.2, 0.9, 10), concreteMat);
    well.position.set(7.5, 0.45, 19); well.castShadow = true; scene.add(well);
    DF.worldMeshes.push(well);
    DF.colliders.push({ minx: 6.4, maxx: 8.6, miny: 0, maxy: 0.9, minz: 17.9, maxz: 20.1 });
    // 院墙（北墙留路口，东西低墙，南面开放）
    box(-9.5, 0, 1.5, 21, 1.3, 0.45, M.wallDark);
    box(16.5, 0, 1.5, 7, 1.3, 0.45, M.wallDark);
    box(19, 0, 13, 0.45, 1.3, 23, M.wallDark);
    box(-19, 0, 13, 0.45, 1.3, 21, M.wallDark);
    box(-19, 0, 2.6, 0.45, 1.1, 2.4, M.wallDark);
    // 村口牌坊（北入口，横跨南北干道）
    box(4.2, 0, -12, 1.25, 5.6, 1.25, gateRed);
    box(11.8, 0, -12, 1.25, 5.6, 1.25, gateRed);
    box(8, 5.6, -12, 9.6, 0.9, 1.5, gateRed);
    box(8, 4.3, -12, 6.4, 0.55, 1.0, gateRed, { collide: false });
    // 牌匾「吴家村」
    const signC = document.createElement('canvas'); signC.width = 256; signC.height = 96;
    const sg = signC.getContext('2d');
    sg.fillStyle = '#2b1a10'; sg.fillRect(0, 0, 256, 96);
    sg.strokeStyle = '#c9a227'; sg.lineWidth = 6; sg.strokeRect(5, 5, 246, 86);
    sg.fillStyle = '#e8c56a'; sg.font = 'bold 52px serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
    sg.fillText('吴家村', 128, 52);
    const signTex = new T.CanvasTexture(signC);
    const signMat2 = new T.MeshStandardMaterial({ map: signTex, roughness: 0.6 });
    const signN = new T.Mesh(new T.PlaneGeometry(3.6, 1.35), signMat2);
    signN.position.set(8, 4.95, -12.79); signN.rotation.y = Math.PI; scene.add(signN);
    const signS = new T.Mesh(new T.PlaneGeometry(3.6, 1.35), signMat2);
    signS.position.set(8, 4.95, -11.21); scene.add(signS);
    // 干草与杂物
    hayBale(-9, 12); hayBale(14, 12); hayBale(-26, 9);

    // ============ 河畔集市（集市建筑/开放广场/货摊）============
    const plaza = new T.Mesh(new T.CircleGeometry(9, 26), dirtMat);
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(-46, 0.024, 30); plaza.receiveShadow = true; scene.add(plaza);
    // 集市建筑（朝广场开门）
    house(-56, 19.5, 5.5, 4.5, 3.4, M.wall, M.contA);
    house(-46, 17.5, 5.5, 4.5, 3.4, M.wallDark, M.contA);
    house(-36, 19.5, 5.5, 4.5, 3.4, M.wood, M.contA);
    // 货摊（两排对面，桌面可挡弹但人可过低缝——仅桌面碰撞）
    const stallMats = [M.contA, M.contB, M.contC, M.sand, hayMat, M.wood];
    [[-52, 27], [-52, 31], [-52, 35], [-40, 27], [-40, 31], [-40, 35]].forEach(([sx, sz], i) => {
      box(sx, 0, sz, 2.3, 0.9, 1.5, M.wood);
      const aw = new T.Mesh(new T.BoxGeometry(2.7, 0.12, 2.1), stallMats[i % stallMats.length]);
      aw.position.set(sx, 2.15, sz); scene.add(aw);
      box(sx - 1.15, 0.9, sz - 0.85, 0.14, 1.25, 0.14, M.wood, { collide: false });
      box(sx + 1.15, 0.9, sz - 0.85, 0.14, 1.25, 0.14, M.wood, { collide: false });
    });
    drums(-51, 39.5); drums(-41, 24);

    // ============ 废弃军事基地（营房/塔台/掩体/坦克）============
    factory(103, 2, 19, 6.5, 4.6, 'south');                     // 营房A（可进入）
    factory(106, 20, 17, 6.5, 4.2, 'south');                     // 营房B（可进入）
    // 枪眼（视觉）
    box(93.4, 2.2, 2, 0.15, 0.7, 2.2, darkMat, { collide: false });
    box(97.4, 2.1, 20, 0.15, 0.7, 2.2, darkMat, { collide: false });
    // 塔台（东侧高点）
    [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]].forEach(([dx, dz]) => box(121 + dx, 0, 11 + dz, 0.55, 7.6, 0.55, M.wood));
    box(121, 6.9, 11, 5.6, 0.35, 5.6, M.wood, { collide: false, noShadow: true });
    box(121, 7.25, 8.4, 5.6, 1.1, 0.3, M.wood, { collide: false });
    box(121, 7.25, 13.6, 5.6, 1.1, 0.3, M.wood, { collide: false });
    box(118.4, 7.25, 11, 0.3, 1.1, 5.6, M.wood, { collide: false });
    box(123.6, 7.25, 11, 0.3, 1.1, 5.6, M.wood, { collide: false });
    const milRoof = new T.Mesh(new T.ConeGeometry(4.3, 1.5, 4), rustMatF);
    milRoof.position.set(121, 9.4, 11); milRoof.rotation.y = Math.PI / 4; milRoof.castShadow = true; scene.add(milRoof);
    // 混凝土掩体（半埋，顶面可站）
    box(112, -0.6, -8, 4.6, 2.4, 3.2, concreteMat);
    box(96, -0.6, -12, 4.6, 2.4, 3.2, concreteMat);
    // 沙袋阵地
    box(93, 0, 14, 6, 1.05, 1, M.sand);
    box(113, 0, 6.5, 1, 1.05, 6, M.sand);
    box(104, 0, -4, 5, 1.05, 1, M.sand);
    // 废弃坦克
    box(96, 0, 11, 4.8, 1.15, 2.7, darkMat);
    box(96, 0, 11, 5.0, 0.55, 1.1, darkMat, { collide: false });
    box(96.6, 1.15, 11, 2.3, 0.85, 1.9, rustMatF);
    const barrel = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 3.2, 8), darkMat);
    barrel.rotation.z = Math.PI / 2; barrel.position.set(93.6, 1.55, 11); scene.add(barrel);
    DF.obstacleMeta.push({ x: 96, z: 11, w: 5, d: 2.7, h: 2 });

    // ============ 西南工业区（厂房/储油罐/集装箱/烟囱）============
    factory(-108, 84, 26, 13, 7, 'south');
    factory(-82, 100, 26, 13, 7, 'north');
    // 储油罐（圆柱+顶盖，独立碰撞）
    function tank(x, z, r, h) {
      const body = new T.Mesh(new T.CylinderGeometry(r, r, h, 18), new T.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.55, metalness: 0.5 }));
      body.position.set(x, h / 2, z); body.castShadow = true; body.receiveShadow = true; scene.add(body);
      DF.worldMeshes.push(body);
      const roof = new T.Mesh(new T.CylinderGeometry(r * 1.02, r * 1.02, 0.25, 18), rustMatF);
      roof.position.set(x, h + 0.12, z); scene.add(roof);
      DF.colliders.push({ minx: x - r * 0.78, maxx: x + r * 0.78, miny: 0, maxy: h, minz: z - r * 0.78, maxz: z + r * 0.78 });
      DF.obstacleMeta.push({ x, z, w: r * 1.6, d: r * 1.6, h });
    }
    tank(-124, 78, 4.2, 8.5); tank(-132, 93, 3.6, 7.5); tank(-119, 96, 4.6, 9.5); tank(-127, 108, 3.2, 7);
    // 烟囱
    [[-96, 70, 18], [-84, 112, 15]].forEach(([x, z, h]) => {
      const s = new T.Mesh(new T.CylinderGeometry(1.0, 1.4, h, 10), concreteMat);
      s.position.set(x, h / 2, z); s.castShadow = true; scene.add(s);
      DF.worldMeshes.push(s);
      const band = new T.Mesh(new T.CylinderGeometry(1.05, 1.05, 1.6, 10), new T.MeshStandardMaterial({ color: 0x8a2f22, roughness: 0.6 }));
      band.position.set(x, h - 1.2, z); scene.add(band);
      DF.colliders.push({ minx: x - 1.3, maxx: x + 1.3, miny: 0, maxy: h, minz: z - 1.3, maxz: z + 1.3 });
      DF.obstacleMeta.push({ x, z, w: 2.4, d: 2.4, h });
    });
    // 集装箱堆场
    const cms = [M.contA, M.contB, M.contC];
    [[-100, 97, 0], [-93, 99, 1], [-100, 97, 2, 2.9], [-89, 90, 0, 2.9]].forEach(([x, z, rot, stack], i) => {
      const w = rot ? 3.2 : 8, d = rot ? 8 : 3.2;
      box(x, stack || 0, z, w, 2.9, d, cms[i % 3]);
    });
    // 输油管（视觉）
    box(-110, 0.4, 92, 34, 0.8, 0.9, darkMat, { collide: false });
    box(-96, 0.4, 84, 0.9, 0.8, 22, darkMat, { collide: false });
    drums(-100, 88);

    // ============ 森林（簇 + 孤树）============
    function pine(x, z, s) {
      s = s || 1;
      const trunkH = 1.6 * s, trunkR = 0.32 * s;
      const trunk = new T.Mesh(new T.CylinderGeometry(trunkR, trunkR * 1.25, trunkH, 7), trunkMat);
      trunk.position.set(x, trunkH / 2, z); trunk.castShadow = true; scene.add(trunk);
      const c1 = new T.Mesh(new T.ConeGeometry(1.9 * s, 3.4 * s, 8), pineMat);
      c1.position.set(x, trunkH + 1.5 * s, z); c1.castShadow = true; scene.add(c1);
      const c2 = new T.Mesh(new T.ConeGeometry(1.25 * s, 2.4 * s, 8), pineMat2);
      c2.position.set(x, trunkH + 3.1 * s, z); c2.castShadow = true; scene.add(c2);
      DF.colliders.push({ minx: x - 0.5 * s, maxx: x + 0.5 * s, miny: 0, maxy: trunkH + 1, minz: z - 0.5 * s, maxz: z + 0.5 * s });
    }
    [[-138,-104],[130,-116],[-144,38],[138,64],[-34,136],[66,146],[-92,-46],[128,-32]].forEach(([cx, cz]) => {
      const n = 5 + Math.floor(rndF() * 4);
      for (let i = 0; i < n; i++) {
        const a = rndF() * Math.PI * 2, rr = 3 + rndF() * 14;
        pine(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, 0.72 + rndF() * 0.85);
      }
    });
    for (let i = 0; i < 14; i++) {
      let x = 0, z = 0, ok = false;
      for (let t = 0; t < 8 && !ok; t++) { x = rndF() * 290 - 145; z = rndF() * 290 - 145; ok = isClear(x, z, 9); }
      if (ok) pine(x, z, 0.7 + rndF() * 0.9);
    }

    // ============ 巨石散点 ============
    function boulder(x, z, r) {
      const m = new T.Mesh(new T.DodecahedronGeometry(r, 0), rndF() < 0.5 ? rockMat : rockMat2);
      m.position.set(x, r * 0.55, z);
      m.rotation.set(rndF() * 3, rndF() * 3, rndF() * 3);
      m.castShadow = true; m.receiveShadow = true; scene.add(m);
      DF.worldMeshes.push(m);
      DF.colliders.push({ minx: x - r * 0.78, maxx: x + r * 0.78, miny: 0, maxy: r * 1.15, minz: z - r * 0.78, maxz: z + r * 0.78 });
      DF.obstacleMeta.push({ x, z, w: r * 1.56, d: r * 1.56, h: r * 1.15 });
    }
    [[-150,-128,2.6],[150,-140,2.4],[44,120,2.2],[-146,-20,2.8],[156,18,2.0],[-64,-128,2.3]].forEach(([x,z,r]) => boulder(x, z, r));

    // ============ 灌木与栅栏 ============
    for (let i = 0; i < 60; i++) {
      const bx = rndF() * 300 - 150, bz = rndF() * 300 - 150, bs = 0.5 + rndF() * 0.9;
      const bush = new T.Mesh(new T.IcosahedronGeometry(bs, 0), bushMat);
      bush.position.set(bx, bs * 0.55, bz); bush.scale.y = 0.7; scene.add(bush);
    }
    fence(-30, 44, 16, 'x'); fence(34, 30, 12, 'y'); fence(-58, 52, 12, 'x'); fence(120, 40, 10, 'y'); fence(60, -80, 12, 'x');
  }
  // ===== 远处山体剪影（装饰）=====
  const mtnMats = [
    new T.MeshStandardMaterial({ color: 0x6b7261, roughness: 1, flatShading: true }),
    new T.MeshStandardMaterial({ color: 0x5f6858, roughness: 1, flatShading: true }),
    new T.MeshStandardMaterial({ color: 0x767c6a, roughness: 1, flatShading: true })
  ];
  const mtnCount = mapId === 'frontier' ? 44 : 26;
  const mtnNear = mapId === 'frontier' ? 390 : 230;
  const mtnFar = mapId === 'frontier' ? 560 : 340;
  for (let i = 0; i < mtnCount; i++) {
    const a = (i / mtnCount) * Math.PI * 2 + rnd(-0.1, 0.1);
    const r = rnd(mtnNear, mtnFar);
    const h = rnd(38, 96);
    const rad = rnd(55, 105);
    const cone = new T.Mesh(new T.ConeGeometry(rad, h, rndInt(6, 9)), mtnMats[i % 3]);
    cone.position.set(Math.cos(a) * r, h / 2 - 26, Math.sin(a) * r);
    cone.rotation.y = Math.random() * 3;
    cone.scale.set(rnd(0.8, 1.5), rnd(0.8, 1.2), rnd(0.8, 1.5));
    scene.add(cone);
    // 山脊装饰
    if (Math.random() < 0.5) {
      const c2 = new T.Mesh(new T.ConeGeometry(rad * 0.55, h * 0.7, 6), mtnMats[(i + 1) % 3]);
      c2.position.set(Math.cos(a) * r + rnd(-40, 40), h * 0.35 - 26, Math.sin(a) * r + rnd(-40, 40));
      scene.add(c2);
    }
  }

  // 出生点
  const spawnSets = {
    base: [{x:0,z:0},{x:-48,z:-40},{x:44,z:-34},{x:0,z:70},{x:-70,z:0},{x:70,z:0},{x:0,z:-70},{x:-60,z:60},{x:60,z:-60},{x:62,z:40},{x:-62,z:-30},{x:30,z:40},{x:-30,z:70},{x:74,z:-40},{x:-74,z:-60}],
    outpost: [{x:0,z:0},{x:-60,z:-34},{x:58,z:-34},{x:-58,z:18},{x:58,z:20},{x:-28,z:-58},{x:28,z:-58},{x:-28,z:58},{x:28,z:58},{x:0,z:44},{x:0,z:-30},{x:-72,z:0},{x:72,z:0},{x:-42,z:0},{x:42,z:0}],
    oilfield: [{x:0,z:0},{x:-16,z:20},{x:18,z:20},{x:-66,z:-20},{x:66,z:-28},{x:-20,z:-62},{x:24,z:-62},{x:-60,z:56},{x:42,z:52},{x:0,z:52},{x:0,z:-10},{x:-34,z:10},{x:36,z:12},{x:-68,z:0},{x:68,z:0}],
    urban: [{x:0,z:0},{x:-18,z:-30},{x:18,z:-30},{x:-66,z:-10},{x:66,z:-10},{x:-18,z:58},{x:18,z:58},{x:-30,z:-62},{x:30,z:-62},{x:-60,z:24},{x:60,z:24},{x:-8,z:28},{x:8,z:28},{x:-38,z:0},{x:38,z:0}],
    harbor: [{x:0,z:0},{x:-8,z:-12},{x:12,z:-12},{x:-68,z:26},{x:68,z:26},{x:-20,z:58},{x:20,z:58},{x:-68,z:-48},{x:68,z:-48},{x:-4,z:48},{x:4,z:48},{x:-28,z:4},{x:28,z:4},{x:-60,z:4},{x:60,z:4}],
    frontier: [{x:-142,z:-142},{x:142,z:-142},{x:-142,z:96},{x:142,z:96},{x:-142,z:-40},{x:142,z:40},{x:-40,z:146},{x:40,z:-146},{x:-96,z:-144},{x:96,z:144},{x:-144,z:64},{x:144,z:-88},{x:-64,z:144},{x:64,z:-144},{x:0,z:-60}]
  };
  DF.spawns = spawnSets[mapId] || spawnSets.base;

  DF.worldMeshes.forEach(m => { m.updateMatrixWorld(true); });
};

/* ---------------- 碰撞：圆 vs AABB ---------------- */
DF.collideMove = function (pos, radius) {
  const feet = pos.y;
  for (let i = 0; i < DF.colliders.length; i++) {
    const c = DF.colliders[i];
    if (c.maxy < feet + 0.45) continue;      // 比抬腿高度矮：可通过
    if (c.miny > feet + 1.75) continue;      // 在头顶之上
    let cx = pos.x, cz = pos.z;
    const nx = clamp(cx, c.minx, c.maxx);
    const nz = clamp(cz, c.minz, c.maxz);
    let dx = cx - nx, dz = cz - nz;
    let d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = radius - d;
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
    } else {
      // 在盒子内部：沿最近边推出
      const dl = cx - c.minx, dr = c.maxx - cx, db = cz - c.minz, df = c.maxz - cz;
      const m = Math.min(dl, dr, db, df);
      if (m === dl) pos.x = c.minx - radius;
      else if (m === dr) pos.x = c.maxx + radius;
      else if (m === db) pos.z = c.minz - radius;
      else pos.z = c.maxz + radius;
    }
  }
  const lim = CFG.mapHalf - 2.5;
  pos.x = clamp(pos.x, -lim, lim);
  pos.z = clamp(pos.z, -lim, lim);
};

/* ---------------- 射线检测（世界 + 玩家） ---------------- */
DF.worldRay = new T.Raycaster();
DF.worldRay.far = 400;

DF.raycastWorld = function (origin, dir, maxDist) {
  DF.worldRay.set(origin, dir);
  DF.worldRay.far = maxDist;
  const hits = DF.worldRay.intersectObjects(DF.worldMeshes, false);
  return hits.length ? hits[0] : null;
};
