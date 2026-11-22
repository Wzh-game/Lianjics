/* ============================================================
   三角洲行动 · 网页版  —— 核心：常量 / 贴图 / 地图 / 碰撞
   ============================================================ */
'use strict';
const T = THREE;
const DF = {};
DF.VERSION = '1.4.2';

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
  mapHalf: 88, botNames: ['游隼', '黑鹰', '蝰蛇', '铁壁', '夜莺', '风暴', '猎豹', '山猫', '寒鸦', '钢牙', '孤狼', '雷霆'],
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
  // 每张地图的尺寸 / 氛围参数（frontier = 3000×3000m 开放大地图）
  const TUNING = {
    base:    { half: 88,  fogN: 55, fogF: 245, ground: 400,  shadow: 95,  shadowMap: 1536, shadowFar: 300, sunPos: [70, 110, 45], texRepeat: 30, raidTime: 720, airdropAt: 300, sight: 62 },
    outpost: { half: 88,  fogN: 55, fogF: 245, ground: 400,  shadow: 95,  shadowMap: 1536, shadowFar: 300, sunPos: [70, 110, 45], texRepeat: 30, raidTime: 720, airdropAt: 300, sight: 62 },
    oilfield:{ half: 88,  fogN: 55, fogF: 245, ground: 400,  shadow: 95,  shadowMap: 1536, shadowFar: 300, sunPos: [70, 110, 45], texRepeat: 30, raidTime: 720, airdropAt: 300, sight: 62 },
    urban:   { half: 88,  fogN: 55, fogF: 245, ground: 400,  shadow: 95,  shadowMap: 1536, shadowFar: 300, sunPos: [70, 110, 45], texRepeat: 30, raidTime: 720, airdropAt: 300, sight: 62 },
    harbor:  { half: 88,  fogN: 55, fogF: 245, ground: 400,  shadow: 95,  shadowMap: 1536, shadowFar: 300, sunPos: [70, 110, 45], texRepeat: 30, raidTime: 720, airdropAt: 300, sight: 62 },
    frontier:{ half: 1500, fogN: 160, fogF: 1500, ground: 5200, shadow: 85, shadowMap: 2048, shadowFar: 420, sunPos: [95, 135, 65], texRepeat: 250, raidTime: 1800, airdropAt: 900, sight: 110, followSun: true }
  }[mapId];
  CFG.mapHalf = TUNING.half;
  CFG.timeLimit = TUNING.raidTime;
  CFG.airdropAt = TUNING.airdropAt;
  DF.sightRange = TUNING.sight;
  DF.sunOffset = [TUNING.sunPos[0], TUNING.sunPos[1], TUNING.sunPos[2]];

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
  DF.sky = sky;

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
  scene.add(sun.target);
  DF.sun = sun;
  DF.followSun = !!TUNING.followSun;
  DF.sunOffset = [TUNING.sunPos[0], TUNING.sunPos[1], TUNING.sunPos[2]];

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
  // 材质缓存：相同尺寸的盒子共享克隆材质/纹理，避免重复上传（大地图关键）
  const matCache = new Map();
  function box(x, y, z, w, h, d, mat, opt) {
    opt = opt || {};
    const g = new T.BoxGeometry(w, h, d);
    // 让贴图按尺寸缩放（同尺寸复用克隆材质）
    let m;
    if (mat.map) {
      const key = mat.uuid + '|' + (Math.round(w * 2) / 2) + '|' + (Math.round(h * 2) / 2) + '|' + (Math.round(d * 2) / 2);
      m = matCache.get(key);
      if (!m) {
        m = mat.clone();
        m.map = m.map.clone();
        m.map.needsUpdate = true;
        m.map.wrapS = m.map.wrapT = T.RepeatWrapping;
        m.map.repeat.set(Math.max(1, w / 4), Math.max(1, h / 4));
        matCache.set(key, m);
      }
    } else {
      m = matCache.get(mat.uuid);
      if (!m) { m = mat.clone(); matCache.set(mat.uuid, m); }
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
    // 吴家村 · 开放大地图（3000×3000m，世界坐标 ±1500）：
    //   北 北部机场（跑道/机库/塔台/残骸客机，z≈-1150，连接南北干道）
    //   中 吴家村（民居/祠堂/院墙/村口牌坊，z≈0，空投点与主要攻守枢纽）
    //   西 河畔集市（原「洛水集」，z≈170）｜东 废弃军事基地（x≈980）｜西南 西南工业区（x≈-950,z≈780）
    //   新增：高岭村（东北）、边境哨站（西北）、东南物流站、南郊村落 —— 全图 9 个命名地标。
    //   另有斜穿西侧河道 + 桥、三条贯通公路、26 片森林、巨石/灌木散布、远景山脊。
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

    // 远离关键位置的散布校验：每个地标自带半径，散布点再加 pad
    const keepClear = [
      [0, -1465, 16], [1425, 1425, 16], [-1425, 1445, 16],   // 撤离点
      [0, -1150, 74],                                        // 北部机场（跑道 120m）
      [0, 0, 42],                                            // 吴家村
      [-360, -6, 30],                                        // 桥
      [-480, 170, 36],                                       // 河畔集市
      [980, 28, 48],                                         // 废弃军事基地
      [-950, 786, 64],                                       // 西南工业区
      [1050, -750, 38],                                      // 高岭村
      [-1150, -850, 34],                                     // 边境哨站
      [1150, 950, 40],                                       // 东南物流站
      [-320, 1150, 38]                                       // 南郊村落
    ];
    const isClear = (x, z, pad) => keepClear.every(([kx, kz, kr]) => Math.hypot(kx - x, kz - z) > kr + pad);
    // 道路净空：南北干道 x=8、东西干道 z=-6、南线 z=60、机场连接线 z=-1150
    const onRoad = (x, z) => Math.abs(x - 8) < 10 || Math.abs(z + 6) < 10 || Math.abs(z - 60) < 9 || Math.abs(z + 1150) < 9;

    // ============ 山体（全部实体：圆形碰撞体积；大山不是背景）============
    const mtnMatsF = [
      new T.MeshStandardMaterial({ color: 0x6b7261, roughness: 1, flatShading: true }),
      new T.MeshStandardMaterial({ color: 0x5f6858, roughness: 1, flatShading: true }),
      new T.MeshStandardMaterial({ color: 0x767c6a, roughness: 1, flatShading: true })
    ];
    const mtnKeep = [];
    const mtnRnd = mulberry32(20261124);
    const addMountain = (x, z, rad, h) => {
      const cone = new T.Mesh(new T.ConeGeometry(rad, h, 7 + Math.floor(mtnRnd() * 3)), mtnMatsF[Math.floor(mtnRnd() * 3)]);
      cone.position.set(x, h / 2 - 5, z);
      cone.rotation.y = mtnRnd() * 3;
      cone.castShadow = true; cone.receiveShadow = true; scene.add(cone);
      DF.colliders.push({ circle: true, x, z, r: rad * 0.9, miny: 0, maxy: h - 5 });
      DF.obstacleMeta.push({ x, z, w: rad * 1.8, d: rad * 1.8, h: h * 0.7 });
      mtnKeep.push([x, z, rad + 14]);
      // 主峰旁的侧峰（同样实体）
      if (mtnRnd() < 0.55) {
        const sr = rad * 0.55, sh = h * 0.68;
        const sx = x + (mtnRnd() - 0.5) * rad * 1.1, sz = z + (mtnRnd() - 0.5) * rad * 1.1;
        const c2 = new T.Mesh(new T.ConeGeometry(sr, sh, 6 + Math.floor(mtnRnd() * 3)), mtnMatsF[Math.floor(mtnRnd() * 3)]);
        c2.position.set(sx, sh / 2 - 5, sz); c2.rotation.y = mtnRnd() * 3;
        c2.castShadow = true; c2.receiveShadow = true; scene.add(c2);
        DF.colliders.push({ circle: true, x: sx, z: sz, r: sr * 0.9, miny: 0, maxy: sh - 5 });
        mtnKeep.push([sx, sz, sr + 14]);
      }
    };
    // 三座命名大山（地标）：大沟顶(东北) / 黑风山(西) / 白云顶(南)
    addMountain(1150, -350, 150, 175);   // 大沟顶
    addMountain(-1200, 380, 165, 185);   // 黑风山
    addMountain(420, 1250, 140, 165);    // 白云顶
    // 边缘环山（实体，遮挡地图边界；避开出生点/撤离点）
    const _msp = [[-1350,-1350],[1350,-1350],[-1350,60],[1350,60],[-1350,1350],[1350,1350],[-350,1400],[350,-1400],[-900,-1380],[900,1380],[-1400,600],[1400,-800],[-600,1400],[600,-1400],[0,-880]];
    const _mex = [[0,-1465],[1425,1425],[-1425,1445]];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + (mtnRnd() - 0.5) * 0.26;
      const rr = 1300 + mtnRnd() * 135;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (_msp.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 255)) continue;
      if (_mex.some(([ex, ez]) => Math.hypot(ex - x, ez - z) < 215)) continue;
      addMountain(x, z, 120 + mtnRnd() * 55, 95 + mtnRnd() * 65);
    }
    keepClear.push.apply(keepClear, mtnKeep);   // 散布/森林避让山体

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
    function watchtower(x, z) {
      [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]].forEach(([dx, dz]) => box(x + dx, 0, z + dz, 0.55, 7, 0.55, M.wood));
      box(x, 6.9, z, 5.6, 0.35, 5.6, M.wood, { collide: false, noShadow: true });
      box(x, 7.25, z - 2.65, 5.6, 1.1, 0.3, M.wood, { collide: false });
      box(x, 7.25, z + 2.65, 5.6, 1.1, 0.3, M.wood, { collide: false });
      box(x - 2.65, 7.25, z, 0.3, 1.1, 5.6, M.wood, { collide: false });
      box(x + 2.65, 7.25, z, 0.3, 1.1, 5.6, M.wood, { collide: false });
      const roof = new T.Mesh(new T.ConeGeometry(4.3, 1.5, 4), rustMatF);
      roof.position.set(x, 9.4, z); roof.rotation.y = Math.PI / 4; roof.castShadow = true; scene.add(roof);
    }
    function tank(x, z, r, h) {
      const body = new T.Mesh(new T.CylinderGeometry(r, r, h, 18), new T.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.55, metalness: 0.5 }));
      body.position.set(x, h / 2, z); body.castShadow = true; body.receiveShadow = true; scene.add(body);
      DF.worldMeshes.push(body);
      const roof = new T.Mesh(new T.CylinderGeometry(r * 1.02, r * 1.02, 0.25, 18), rustMatF);
      roof.position.set(x, h + 0.12, z); scene.add(roof);
      DF.colliders.push({ minx: x - r * 0.78, maxx: x + r * 0.78, miny: 0, maxy: h, minz: z - r * 0.78, maxz: z + r * 0.78 });
      DF.obstacleMeta.push({ x, z, w: r * 1.6, d: r * 1.6, h });
    }
    function chimney(x, z, h) {
      const s = new T.Mesh(new T.CylinderGeometry(1.0, 1.4, h, 10), concreteMat);
      s.position.set(x, h / 2, z); s.castShadow = true; scene.add(s);
      DF.worldMeshes.push(s);
      const band = new T.Mesh(new T.CylinderGeometry(1.05, 1.05, 1.6, 10), new T.MeshStandardMaterial({ color: 0x8a2f22, roughness: 0.6 }));
      band.position.set(x, h - 1.2, z); scene.add(band);
      DF.colliders.push({ minx: x - 1.3, maxx: x + 1.3, miny: 0, maxy: h, minz: z - 1.3, maxz: z + 1.3 });
      DF.obstacleMeta.push({ x, z, w: 2.4, d: 2.4, h });
    }
    // 边界：大小错落的陡岩环（取代围墙），Spacing 22m
    const rim = mulberry32(20261123);
    const rimMat = new T.MeshStandardMaterial({ color: 0x6f6a5c, roughness: 1, flatShading: true });
    const rimMat2 = new T.MeshStandardMaterial({ color: 0x7e7867, roughness: 1, flatShading: true });
    const o = HW + 3;
    for (let x = -HW - 4; x <= HW + 4; x += 22) {
      box(x + (rim() - 0.5) * 4, 0, -o, 21 + rim() * 6, 7 + rim() * 5.5, 6 + rim() * 3, rim() < 0.5 ? rimMat : rimMat2);
      box(x + (rim() - 0.5) * 4, 0, o, 21 + rim() * 6, 7 + rim() * 5.5, 6 + rim() * 3, rim() < 0.5 ? rimMat : rimMat2);
    }
    for (let z = -HW - 4; z <= HW + 4; z += 22) {
      box(-o, 0, z + (rim() - 0.5) * 4, 6 + rim() * 3, 7 + rim() * 5.5, 21 + rim() * 6, rim() < 0.5 ? rimMat : rimMat2);
      box(o, 0, z + (rim() - 0.5) * 4, 6 + rim() * 3, 7 + rim() * 5.5, 21 + rim() * 6, rim() < 0.5 ? rimMat : rimMat2);
    }
    [[-o, -o], [o, -o], [-o, o], [o, o]].forEach(([cx, cz]) => box(cx, 0, cz, 15, 11 + rim() * 4, 15, rimMat));

    // ============ 河道（斜穿西侧 ±1500，可蹚过）+ 公路 + 桥 ============
    const river = new T.Mesh(new T.PlaneGeometry(26, 3400), waterMat);
    river.rotation.x = -Math.PI / 2; river.rotation.z = 0.12; river.position.set(-360, 0.015, 0); scene.add(river);
    // 公路：南北干道（贯通机场 → 村 → 南端撤离点方向）
    const roadNS = new T.Mesh(new T.PlaneGeometry(9, HW * 2), dirtMat);
    roadNS.rotation.x = -Math.PI / 2; roadNS.position.set(8, 0.02, 0); roadNS.receiveShadow = true; scene.add(roadNS);
    // 公路：东西干道（贯穿全图，跨河大桥所在）
    const roadEW = new T.Mesh(new T.PlaneGeometry(HW * 2, 9), dirtMat);
    roadEW.rotation.x = -Math.PI / 2; roadEW.position.set(0, 0.021, -6); roadEW.receiveShadow = true; scene.add(roadEW);
    // 公路：南线（工业区方向 → 村南 → 军事基地铁岭）
    const roadS = new T.Mesh(new T.PlaneGeometry(HW * 2, 8), dirtMat);
    roadS.rotation.x = -Math.PI / 2; roadS.position.set(0, 0.022, 60); roadS.receiveShadow = true; scene.add(roadS);
    // 公路：机场连接线（东西，接南北干道）
    const roadAir = new T.Mesh(new T.PlaneGeometry(560, 8), dirtMat);
    roadAir.rotation.x = -Math.PI / 2; roadAir.position.set(-220, 0.021, -1150); roadAir.receiveShadow = true; scene.add(roadAir);
    // 河上桥（东西干道跨处 x≈-360）：桥面可走，两侧护栏装饰
    box(-360, 0, -6, 27, 0.35, 9, concreteMat, { collide: false, noShadow: true });
    box(-360, 0.35, -10.4, 27, 0.75, 0.35, concreteMat, { collide: false });
    box(-360, 0.35, -1.6, 27, 0.75, 0.35, concreteMat, { collide: false });
    // 十字路口与村口广场
    const cross = new T.Mesh(new T.CircleGeometry(9, 26), dirtMat);
    cross.rotation.x = -Math.PI / 2; cross.position.set(8, 0.023, -6); cross.receiveShadow = true; scene.add(cross);
    const cross2 = new T.Mesh(new T.CircleGeometry(7, 24), dirtMat);
    cross2.rotation.x = -Math.PI / 2; cross2.position.set(8, 0.023, 60); cross2.receiveShadow = true; scene.add(cross2);
    const crossA = new T.Mesh(new T.CircleGeometry(7, 24), dirtMat);
    crossA.rotation.x = -Math.PI / 2; crossA.position.set(8, 0.023, -1150); crossA.receiveShadow = true; scene.add(crossA);

    // ============ 北部机场（跑道/机库/塔台/残骸客机），z ≈ -1150 ============
    const AZ = -1150;
    const runway = new T.Mesh(new T.PlaneGeometry(120, 13), asphaltMat);
    runway.rotation.x = -Math.PI / 2; runway.position.set(0, 0.025, AZ); runway.receiveShadow = true; scene.add(runway);
    for (let x = -52; x <= 52; x += 8) {
      const dash = new T.Mesh(new T.PlaneGeometry(3.2, 0.5), whiteMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(x, 0.028, AZ); scene.add(dash);
    }
    [AZ + 6.8, AZ - 6.8].forEach(z => {
      const edge = new T.Mesh(new T.PlaneGeometry(120, 0.4), whiteMat);
      edge.rotation.x = -Math.PI / 2; edge.position.set(0, 0.028, z); scene.add(edge);
    });
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
    hangar(-32, AZ + 22, 22, 13, 7);
    hangar(18, AZ + 22, 22, 13, 7);
    // 塔台
    const towerShaft = new T.Mesh(new T.CylinderGeometry(1.7, 2.1, 9.5, 10), M.metal);
    towerShaft.position.set(48, 4.75, AZ + 17); towerShaft.castShadow = true; scene.add(towerShaft);
    DF.worldMeshes.push(towerShaft);
    box(48, 9.5, AZ + 17, 4.6, 2.6, 4.6, M.wallDark);
    box(48, 12.1, AZ + 17, 5.2, 0.3, 5.2, rustMatF, { collide: false, noShadow: true });
    box(48, 0, AZ + 17, 4.2, 1.2, 4.2, concreteMat);
    const antenna = new T.Mesh(new T.CylinderGeometry(0.08, 0.12, 3.4, 6), M.metal);
    antenna.position.set(48, 13.6, AZ + 17); scene.add(antenna);
    DF.colliders.push({ minx: 46.3, maxx: 49.7, miny: 0, maxy: 9.5, minz: AZ + 15.3, maxz: AZ + 18.7 });
    // 残骸客机（停在跑道上）
    const planeMat = new T.MeshStandardMaterial({ color: 0x53575e, roughness: 0.6, metalness: 0.35 });
    const fuselage = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 13, 12), planeMat);
    fuselage.rotation.z = Math.PI / 2; fuselage.position.set(0, 1.7, AZ); fuselage.castShadow = true; scene.add(fuselage);
    const nose = new T.Mesh(new T.ConeGeometry(1.6, 3.2, 12), planeMat);
    nose.rotation.z = -Math.PI / 2; nose.position.set(8.1, 1.7, AZ); scene.add(nose);
    const tailFin = new T.Mesh(new T.BoxGeometry(0.25, 2.6, 1.8), rustMatF);
    tailFin.position.set(-5.6, 3.8, AZ); scene.add(tailFin);
    const wingL = new T.Mesh(new T.BoxGeometry(3.4, 0.16, 7.2), planeMat);
    wingL.position.set(0.6, 1.9, AZ); wingL.rotation.x = 0.06; scene.add(wingL);
    const tailWing = new T.Mesh(new T.BoxGeometry(2.2, 0.14, 4.6), planeMat);
    tailWing.position.set(-5.8, 2.6, AZ); scene.add(tailWing);
    DF.colliders.push({ minx: -6.6, maxx: 6.6, miny: 0, maxy: 3.4, minz: AZ - 3.7, maxz: AZ + 3.7 });
    DF.obstacleMeta.push({ x: 0, z: AZ, w: 13, d: 7, h: 3.4 });
    // 机场围栏（南侧，中间留路口）
    fence(-29, AZ + 34, 66, 'x'); fence(37, AZ + 34, 50, 'x');

    // ============ 吴家村（民居/祠堂/院墙/村口牌坊），z ≈ 0 ============
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
    // 牌匾「吴家村」（双面可读）
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

    // ============ 河畔集市（集市建筑/开放广场/货摊），(-480, 170) ============
    const plaza = new T.Mesh(new T.CircleGeometry(9, 26), dirtMat);
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(-480, 0.024, 170); plaza.receiveShadow = true; scene.add(plaza);
    // 集市建筑（朝广场开门）
    house(-490, 159.5, 5.5, 4.5, 3.4, M.wall, M.contA);
    house(-480, 157.5, 5.5, 4.5, 3.4, M.wallDark, M.contA);
    house(-470, 159.5, 5.5, 4.5, 3.4, M.wood, M.contA);
    // 货摊（两排对面，仅桌面碰撞）
    const stallMats = [M.contA, M.contB, M.contC, M.sand, hayMat, M.wood];
    [[-486, 167], [-486, 171], [-486, 175], [-474, 167], [-474, 171], [-474, 175]].forEach(([sx, sz], i) => {
      box(sx, 0, sz, 2.3, 0.9, 1.5, M.wood);
      const aw = new T.Mesh(new T.BoxGeometry(2.7, 0.12, 2.1), stallMats[i % stallMats.length]);
      aw.position.set(sx, 2.15, sz); scene.add(aw);
      box(sx - 1.15, 0.9, sz - 0.85, 0.14, 1.25, 0.14, M.wood, { collide: false });
      box(sx + 1.15, 0.9, sz - 0.85, 0.14, 1.25, 0.14, M.wood, { collide: false });
    });
    drums(-485, 179.5); drums(-475, 164);

    // ============ 废弃军事基地（营房/塔台/掩体/坦克），(980, 28) ============
    factory(980, 20, 19, 6.5, 4.6, 'south');                     // 营房A（可进入）
    factory(983, 38, 17, 6.5, 4.2, 'south');                     // 营房B（可进入）
    // 枪眼（视觉）
    box(970.4, 2.2, 20, 0.15, 0.7, 2.2, darkMat, { collide: false });
    box(974.4, 2.1, 38, 0.15, 0.7, 2.2, darkMat, { collide: false });
    // 塔台（东侧高点）
    watchtower(998, 29);
    // 混凝土掩体（半埋，顶面可站）
    box(989, -0.6, 10, 4.6, 2.4, 3.2, concreteMat);
    box(973, -0.6, 6, 4.6, 2.4, 3.2, concreteMat);
    // 沙袋阵地
    box(970, 0, 32, 6, 1.05, 1, M.sand);
    box(990, 0, 24.5, 1, 1.05, 6, M.sand);
    box(981, 0, 14, 5, 1.05, 1, M.sand);
    // 废弃坦克
    box(973, 0, 29, 4.8, 1.15, 2.7, darkMat);
    box(973, 0, 29, 5.0, 0.55, 1.1, darkMat, { collide: false });
    box(973.6, 1.15, 29, 2.3, 0.85, 1.9, rustMatF);
    const barrel = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 3.2, 8), darkMat);
    barrel.rotation.z = Math.PI / 2; barrel.position.set(970.6, 1.55, 29); scene.add(barrel);
    DF.obstacleMeta.push({ x: 973, z: 29, w: 5, d: 2.7, h: 2 });
    fence(952, 52, 22, 'x'); fence(1004, 14, 14, 'y');

    // ============ 西南工业区（厂房/储油罐/集装箱/烟囱），(-950, 786) ============
    factory(-950, 780, 26, 13, 7, 'south');
    factory(-924, 796, 26, 13, 7, 'north');
    tank(-966, 774, 4.2, 8.5); tank(-974, 789, 3.6, 7.5); tank(-961, 792, 4.6, 9.5); tank(-969, 804, 3.2, 7);
    chimney(-938, 766, 18); chimney(-926, 808, 15);
    // 集装箱堆场
    const cms = [M.contA, M.contB, M.contC];
    [[-942, 793, 0, 0], [-935, 795, 1, 0], [-942, 793, 2, 2.9], [-931, 786, 0, 2.9]].forEach(([x, z, rot, stack], i) => {
      const w = rot ? 3.2 : 8, d = rot ? 8 : 3.2;
      box(x, stack || 0, z, w, 2.9, d, cms[i % 3]);
    });
    // 输油管（视觉）
    box(-952, 0.4, 788, 34, 0.8, 0.9, darkMat, { collide: false });
    box(-938, 0.4, 780, 0.9, 0.8, 22, darkMat, { collide: false });
    drums(-942, 784);

    // ============ 高岭村（东北新地标：村落 + 干草），(1050, -750) ============
    house(1032, -762, 6, 5.5, 3.4, M.wall, rustMatF);
    house(1068, -770, 7, 6, 3.7, M.wood, rustMatF);
    house(1052, -724, 6, 5, 3.2, M.wallDark, rustMatF);
    hayBale(1042, -735); hayBale(1062, -758); drums(1050, -745);

    // ============ 边境哨站（西北新地标：营房 + 哨塔），(-1150, -850) ============
    factory(-1150, -850, 18, 7, 4.4, 'south');
    watchtower(-1122, -858);
    box(-1170, 0, -830, 6, 1.05, 1, M.sand);
    box(-1130, 0, -838, 1, 1.05, 6, M.sand);
    drums(-1160, -862);

    // ============ 东南物流站（新地标：厂房/罐/烟囱/货柜），(1150, 950) ============
    factory(1150, 950, 22, 11, 6, 'south');
    tank(1120, 930, 4.2, 8);
    chimney(1176, 916, 14);
    box(1150, 0, 968, 8, 2.9, 3.2, M.contB);
    box(1150, 2.9, 968, 8, 2.9, 3.2, M.contC);
    box(1142, 0, 974, 3.2, 2.9, 8, M.contA);
    drums(1162, 946);

    // ============ 南郊村落（最南新地标），(-320, 1150) ============
    house(-340, 1138, 6, 5, 3.3, M.wood, rustMatF);
    house(-300, 1140, 6.5, 5.5, 3.5, M.wall, rustMatF);
    house(-322, 1178, 6, 5, 3.2, M.wallDark, rustMatF);
    hayBale(-310, 1160); hayBale(-334, 1166);

    // ============ 森林（26 簇，实例化锥/柱；树干/树冠预收集）============
    const pineXf = [];
    function pine(x, z, s) {
      s = s || 1;
      pineXf.push({ x, z, s });
      DF.colliders.push({ minx: x - 0.5 * s, maxx: x + 0.5 * s, miny: 0, maxy: 1.6 * s + 1, minz: z - 0.5 * s, maxz: z + 0.5 * s });
    }
    const CLUSTERS = 26;
    for (let ci = 0; ci < CLUSTERS; ci++) {
      let cx = 0, cz = 0, ok = false;
      for (let t = 0; t < 24 && !ok; t++) {
        cx = rndF() * 2720 - 1360; cz = rndF() * 2720 - 1360;
        ok = isClear(cx, cz, 34) && !onRoad(cx, cz);
      }
      if (!ok) continue;
      const n = 5 + Math.floor(rndF() * 4);
      for (let i = 0; i < n; i++) {
        const a = rndF() * Math.PI * 2, rr = 3 + rndF() * 16;
        pine(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, 0.72 + rndF() * 0.85);
      }
    }
    // 单桃孤树
    for (let i = 0; i < 70; i++) {
      let x = 0, z = 0, ok = false;
      for (let t = 0; t < 10 && !ok; t++) { x = rndF() * 2780 - 1390; z = rndF() * 2780 - 1390; ok = isClear(x, z, 8) && !onRoad(x, z); }
      if (ok) pine(x, z, 0.7 + rndF() * 0.9);
    }
    // 实例化树木
    if (pineXf.length) {
      const trunkG = new T.CylinderGeometry(0.32, 0.4, 1.6, 7);
      const c1G = new T.ConeGeometry(1.9, 3.4, 8);
      const c2G = new T.ConeGeometry(1.25, 2.4, 8);
      const trunkIM = new T.InstancedMesh(trunkG, trunkMat, pineXf.length);
      const c1IM = new T.InstancedMesh(c1G, pineMat, pineXf.length);
      const c2IM = new T.InstancedMesh(c2G, pineMat2, pineXf.length);
      const _m = new T.Matrix4(), _q = new T.Quaternion(), _p = new T.Vector3(), _s = new T.Vector3();
      pineXf.forEach((t, i) => {
        const s = t.s;
        _q.set(0, 0, 0, 1);
        _s.set(s, s, s);
        _p.set(t.x, 0.8 * s, t.z); _m.compose(_p, _q, _s); trunkIM.setMatrixAt(i, _m);
        _p.set(t.x, 3.1 * s, t.z); _m.compose(_p, _q, _s); c1IM.setMatrixAt(i, _m);
        _p.set(t.x, 4.7 * s, t.z); _m.compose(_p, _q, _s); c2IM.setMatrixAt(i, _m);
      });
      [trunkIM, c1IM, c2IM].forEach(im => { im.castShadow = true; im.instanceMatrix.needsUpdate = true; scene.add(im); });
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
    for (let i = 0; i < 46; i++) {
      let x = 0, z = 0, ok = false;
      for (let t = 0; t < 10 && !ok; t++) { x = rndF() * 2820 - 1410; z = rndF() * 2820 - 1410; ok = isClear(x, z, 7) && !onRoad(x, z); }
      if (ok) boulder(x, z, 1.8 + rndF() * 1.7);
    }

    // ============ 灌木（实例化，无碰撞）============
    const BUSH = 380;
    const bushG = new T.IcosahedronGeometry(1, 0);
    const bushIM = new T.InstancedMesh(bushG, bushMat, BUSH);
    const _bm = new T.Matrix4(), _bq = new T.Quaternion(), _bp = new T.Vector3(), _bs = new T.Vector3(), _be = new T.Euler();
    for (let i = 0; i < BUSH; i++) {
      let x = 0, z = 0, t = 0;
      do { x = rndF() * 2920 - 1460; z = rndF() * 2920 - 1460; } while ((!isClear(x, z, 3) || onRoad(x, z)) && ++t < 6);
      const bs = 0.5 + rndF() * 0.9;
      // 灌木可穿过（不注册碰撞体）
      _be.set(0, rndF() * 3, 0); _bq.setFromEuler(_be);
      _bs.set(bs, bs * 0.7, bs); _bp.set(x, bs * 0.55, z);
      _bm.compose(_bp, _bq, _bs); bushIM.setMatrixAt(i, _bm);
    }
    bushIM.instanceMatrix.needsUpdate = true; scene.add(bushIM);
    // 村边/机场/基地少量栅栏装饰
    fence(-30, 44, 16, 'x'); fence(34, 30, 12, 'y'); fence(-58, 52, 12, 'x');
  }

  // ===== 远处山体（实体碰撞体积；地图外最远环山不可达，但同样登记碰撞）=====
  const mtnMats = [
    new T.MeshStandardMaterial({ color: 0x6b7261, roughness: 1, flatShading: true }),
    new T.MeshStandardMaterial({ color: 0x5f6858, roughness: 1, flatShading: true }),
    new T.MeshStandardMaterial({ color: 0x767c6a, roughness: 1, flatShading: true })
  ];
  if (mapId === 'frontier') {
    // 天际线山脊（地图外 1750~2350m，远眺层次，登记实体）
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2 + rnd(-0.1, 0.1);
      const r = rnd(1760, 2350);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = rnd(80, 160), rad = rnd(95, 165);
      const cone = new T.Mesh(new T.ConeGeometry(rad, h, rndInt(6, 9)), mtnMats[i % 3]);
      cone.position.set(x, h / 2 - 26, z); cone.rotation.y = Math.random() * 3; scene.add(cone);
      DF.colliders.push({ circle: true, x, z, r: rad * 0.9, miny: 0, maxy: h - 26 });
    }
  } else {
    // 其他地图：远景山脊（实体）
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd(-0.1, 0.1);
      const r = rnd(230, 340);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = rnd(38, 96), rad = rnd(55, 105);
      const cone = new T.Mesh(new T.ConeGeometry(rad, h, rndInt(6, 9)), mtnMats[i % 3]);
      cone.position.set(x, h / 2 - 26, z);
      cone.rotation.y = Math.random() * 3;
      cone.scale.set(rnd(0.8, 1.5), rnd(0.8, 1.2), rnd(0.8, 1.5));
      scene.add(cone);
      DF.colliders.push({ circle: true, x, z, r: rad * 1.5, miny: 0, maxy: h - 26 });
    }
  }

  // 出生点
  const spawnSets = {
    base: [{x:0,z:0},{x:-48,z:-40},{x:44,z:-34},{x:0,z:70},{x:-70,z:0},{x:70,z:0},{x:0,z:-70},{x:-60,z:60},{x:60,z:-60},{x:62,z:40},{x:-62,z:-30},{x:30,z:40},{x:-30,z:70},{x:74,z:-40},{x:-74,z:-60}],
    outpost: [{x:0,z:0},{x:-60,z:-34},{x:58,z:-34},{x:-58,z:18},{x:58,z:20},{x:-28,z:-58},{x:28,z:-58},{x:-28,z:58},{x:28,z:58},{x:0,z:44},{x:0,z:-30},{x:-72,z:0},{x:72,z:0},{x:-42,z:0},{x:42,z:0}],
    oilfield: [{x:0,z:0},{x:-16,z:20},{x:18,z:20},{x:-66,z:-20},{x:66,z:-28},{x:-20,z:-62},{x:24,z:-62},{x:-60,z:56},{x:42,z:52},{x:0,z:52},{x:0,z:-10},{x:-34,z:10},{x:36,z:12},{x:-68,z:0},{x:68,z:0}],
    urban: [{x:0,z:0},{x:-18,z:-30},{x:18,z:-30},{x:-66,z:-10},{x:66,z:-10},{x:-18,z:58},{x:18,z:58},{x:-30,z:-62},{x:30,z:-62},{x:-60,z:24},{x:60,z:24},{x:-8,z:28},{x:8,z:28},{x:-38,z:0},{x:38,z:0}],
    harbor: [{x:0,z:0},{x:-8,z:-12},{x:12,z:-12},{x:-68,z:26},{x:68,z:26},{x:-20,z:58},{x:20,z:58},{x:-68,z:-48},{x:68,z:-48},{x:-4,z:48},{x:4,z:48},{x:-28,z:4},{x:28,z:4},{x:-60,z:4},{x:60,z:4}],
    frontier: [{x:-1350,z:-1350},{x:1350,z:-1350},{x:-1350,z:60},{x:1350,z:60},{x:-1350,z:1350},{x:1350,z:1350},{x:-350,z:1400},{x:350,z:-1400},{x:-900,z:-1380},{x:900,z:1380},{x:-1400,z:600},{x:1400,z:-800},{x:-600,z:1400},{x:600,z:-1400},{x:0,z:-880}]
  };
  DF.spawns = spawnSets[mapId] || spawnSets.base;

  // 载具（按地图固定出生点；随地图缓存进出场景）
  if (DF.spawnMapVehicles) DF.spawnMapVehicles(scene, mapId);

  DF.worldMeshes.forEach(m => { m.updateMatrixWorld(true); });
  DF.rebuildColliderGrid();
};

/* ---------------- 碰撞空间哈希（开放大地图广相位） ---------------- */
DF.colliderCell = 48;      // 网格单元（米）
DF.colliderGrid = null;    // Map<"gx,gz", collider[]>
DF.colliderGridCount = 0;
DF._qStamp = 0;

DF.rebuildColliderGrid = function () {
  const cell = DF.colliderCell, inv = 1 / cell;
  const grid = new Map();
  const arr = DF.colliders;
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    c._q = 0;
    const bx0 = c.circle ? c.x - c.r : c.minx, bx1 = c.circle ? c.x + c.r : c.maxx;
    const bz0 = c.circle ? c.z - c.r : c.minz, bz1 = c.circle ? c.z + c.r : c.maxz;
    const x0 = Math.floor(bx0 * inv), x1 = Math.floor(bx1 * inv);
    const z0 = Math.floor(bz0 * inv), z1 = Math.floor(bz1 * inv);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const key = gx + ',' + gz;
        let bucket = grid.get(key);
        if (!bucket) { bucket = []; grid.set(key, bucket); }
        bucket.push(c);
      }
    }
  }
  DF.colliderGrid = grid;
  DF.colliderGridCount = arr.length;
  DF._qStamp = 0;
};

/* ---------------- 碰撞：圆 vs AABB ---------------- */
DF.collideMove = function (pos, radius) {
  if (!DF.colliderGrid || DF.colliderGridCount !== DF.colliders.length) DF.rebuildColliderGrid();
  const feet = pos.y;
  const stamp = ++DF._qStamp;
  const cell = DF.colliderCell, inv = 1 / cell;
  const cx0 = Math.floor((pos.x - radius) * inv), cx1 = Math.floor((pos.x + radius) * inv);
  const cz0 = Math.floor((pos.z - radius) * inv), cz1 = Math.floor((pos.z + radius) * inv);
  const grid = DF.colliderGrid;
  for (let gx = cx0; gx <= cx1; gx++) {
    for (let gz = cz0; gz <= cz1; gz++) {
      const bucket = grid.get(gx + ',' + gz);
      if (!bucket) continue;
      for (let k = 0; k < bucket.length; k++) {
    const c = bucket[k];
    if (c._q === stamp) continue;   // 已在本次查询中处理过
    c._q = stamp;
    if (c.maxy < feet + 0.45) continue;      // 比抬腿高度矮：可通过
    if (c.miny > feet + 1.75) continue;      // 在头顶之上
    if (c.circle) {                          // 圆形碰撞（山体/灌木）
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const rr = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2);
      if (d > 1e-6) {
        pos.x = c.x + (dx / d) * rr;
        pos.z = c.z + (dz / d) * rr;
      } else {
        pos.x = c.x + rr;   // 恰好在圆心：向任意方向推出
      }
      continue;
    }
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
    }
  }
  const lim = CFG.mapHalf - 2.5;
  pos.x = clamp(pos.x, -lim, lim);
  pos.z = clamp(pos.z, -lim, lim);
};

/* ---------------- 天空/阴影跟随（开放大地图） ---------------- */
DF.updateSkySun = function () {
  if (DF.sky) DF.sky.position.copy(DF.camera.position);
  if (DF.followSun && DF.sun) {
    const c = DF.camera.position;
    DF.sun.position.set(c.x + DF.sunOffset[0], DF.sunOffset[1], c.z + DF.sunOffset[2]);
    DF.sun.target.position.set(c.x, 0, c.z);
    DF.sun.target.updateMatrixWorld();
  }
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
