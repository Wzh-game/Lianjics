/* ============================================================
   三角洲行动 · 网页版  —— 核心：常量 / 贴图 / 地图 / 碰撞
   ============================================================ */
'use strict';
const T = THREE;
const DF = {};
DF.VERSION = '1.0.0';

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
  mapId = mapId === 'outpost' ? 'outpost' : 'base';
  DF.buildTextures();
  DF.worldMeshes = []; DF.colliders = []; DF.obstacleMeta = [];
  CFG.mapHalf = 88;

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

  scene.fog = new T.Fog(new T.Color('#a8a493'), 55, 245);
  scene.background = new T.Color('#a8a493');

  // ---- 光照 ----
  const hemi = new T.HemisphereLight(0xcfd8dc, 0x4a4436, 0.62);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xffe8c0, 1.0);
  sun.position.set(70, 110, 45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  const sc = sun.shadow.camera;
  sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 20; sc.far = 300;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  DF.sun = sun;

  // ---- 地面 ----
  const gMat = new T.MeshStandardMaterial({ map: DF.TEX.ground, roughness: 0.97, metalness: 0.02, color: 0xa8a089 });
  const ground = new T.Mesh(new T.PlaneGeometry(400, 400), gMat);
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

  // 外围围墙
  box(0, 0, -HW, HW * 2 + 4, 7, 2, M.wallDark);
  box(0, 0, HW, HW * 2 + 4, 7, 2, M.wallDark);
  box(-HW, 0, 0, 2, 7, HW * 2 + 4, M.wallDark);
  box(HW, 0, 0, 2, 7, HW * 2 + 4, M.wallDark);
  // 围墙压顶（装饰）
  [[0, -HW, HW * 2 + 4, 2], [0, HW, HW * 2 + 4, 2], [-HW, 0, 2, HW * 2 + 4], [HW, 0, 2, HW * 2 + 4]].forEach(([x, z, w, d]) => {
    box(x, 7, z, w, 0.35, d + 0.5, M.wall, { collide: false, noShadow: true });
  });

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

  } else {
    // 边境前哨：错落的断墙、货柜与沙袋形成开阔的多条交战路线。
    // 不覆盖搜刮容器及撤离点，确保原有搜打撤玩法在两张图均可使用。
    const protectedPoints = (DF.containers || []).map(c => [c.x, c.z])
      .concat((DF.EXTRACT_DEFS || []).map(e => [e.x, e.z]));
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
  }

  // ===== 远处山体剪影（装饰）=====
  const mtnMats = [
    new T.MeshStandardMaterial({ color: 0x6b7261, roughness: 1, flatShading: true }),
    new T.MeshStandardMaterial({ color: 0x5f6858, roughness: 1, flatShading: true }),
    new T.MeshStandardMaterial({ color: 0x767c6a, roughness: 1, flatShading: true })
  ];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rnd(-0.1, 0.1);
    const r = rnd(230, 340);
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
  DF.spawns = [
    { x: 0, z: 0 }, { x: -48, z: -40 }, { x: 44, z: -34 }, { x: 0, z: 70 },
    { x: -70, z: 0 }, { x: 70, z: 0 }, { x: 0, z: -70 }, { x: -60, z: 60 },
    { x: 60, z: -60 }, { x: 62, z: 40 }, { x: -62, z: -30 }, { x: 30, z: 40 },
    { x: -30, z: 70 }, { x: 74, z: -40 }, { x: -74, z: -60 }
  ];

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
