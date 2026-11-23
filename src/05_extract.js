/* ============================================================
   搜打撤（Extraction）模式系统
   搜物资 → 交火 → 撤离。阵亡丢失背包物资（保险箱内保留）。

   设计要点
   - 撤离点「延时开放」+ 撤离时「全图广播」（硬核设定）
   - 资产仅做累计展示（不参与配装）
   - 单人对 AI / 房主权威多人均适用：全部状态由权威端（solo/host）计算
   ============================================================ */

/* ---------------- 物资定义 ---------------- */
const LOOT = {
  // 常见（白）
  ammo:    { name: '5.56 弹药箱', short: '弹药',  value: 220,   slot: 1, weight: 0.5, size: 2, color: '#c8cfc0', w: 26 },
  meds:    { name: '急救绷带',    short: '绷带',  value: 300,   slot: 1, weight: 0.4, size: 1, color: '#d8e0c8', w: 22, heal: 50 },
  // 少见（绿）
  helmet:  { name: '战术头盔',    short: '头盔',  value: 900,   slot: 2, weight: 1.2, size: 3, color: '#7dd069', w: 16, armor: 0.18 },
  vest:    { name: '防弹衣',      short: '防弹衣', value: 1250, slot: 2, weight: 2.0, size: 4, color: '#7dd069', w: 13, armor: 0.22 },
  // 稀有（蓝）
  optic:   { name: '全息瞄准镜',  short: '瞄具',  value: 2200,  slot: 2, weight: 0.6, size: 2, color: '#5fa8d8', w: 9, spread: 0.45 },
  gpu:     { name: '显卡',        short: '显卡',  value: 3400,  slot: 2, weight: 0.8, size: 2, color: '#5fa8d8', w: 8 },
  // 史诗（紫）
  gold:    { name: '金条',        short: '金条',  value: 8000,  slot: 2, weight: 1.5, size: 2, color: '#c07ad8', w: 4 },
  intel:   { name: '情报硬盘',    short: '情报',  value: 6000,  slot: 2, weight: 0.5, size: 1, color: '#c07ad8', w: 4 },
  // 传说（橙）
  core:    { name: '机密核心',    short: '核心',  value: 18000, slot: 2, weight: 1.0, size: 2, color: '#ff8c1a', w: 1 }
};
const LOOT_KEYS = Object.keys(LOOT);
const SAFE_SLOTS = 2;        // 保险箱格数
const BAG_SLOTS = 10;        // 背包格数

/* 按稀有度权重随机 */
function rollLootKey(bonus) {
  const pool = [];
  LOOT_KEYS.forEach(k => {
    let w = LOOT[k].w;
    if (bonus) w *= LOOT[k].value >= 2200 ? (1 + bonus) : 1;   // 高级容器提升稀有物权重
    for (let i = 0; i < Math.ceil(w); i++) pool.push(k);
  });
  return pool[Math.floor(Math.random() * pool.length)];
}
DF.LOOT = LOOT;

/* ---------------- 容器类型 ---------------- */
const CONTAINER_TYPES = {
  crate:  { label: '木箱',   color: '#8b6238', items: 1, size: [1.0, 1.0, 1.0], search: 1.6, bonus: 0.2, y: 0.5 },
  locker: { label: '储物柜', color: '#4a5b64', items: 2, size: [1.1, 2.0, 0.6], search: 2.0, bonus: 0.5, y: 1.0 },
  safe:   { label: '保险箱', color: '#8a6a2a', items: 2, size: [1.0, 1.1, 0.9], search: 3.0, bonus: 1.6, y: 0.55 },
  airdrop:{ label: '空投箱', color: '#7d3a2a', items: 3, size: [1.6, 1.2, 1.6], search: 3.2, bonus: 2.4, y: 0.6 }
};

/* ============================================================
   资产档案（持久化）
   ============================================================ */
DF.Profile = {
  data: { raids: 0, extracted: 0, died: 0, bank: 0, best: 0, last: 0, kills: 0, searched: 0, frontierRaids: 0, frontierExtracted: 0, delta: 0 },
  load() {
    try {
      const raw = localStorage.getItem('df_profile');
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) { }
    return this.data;
  },
  save() { try { localStorage.setItem('df_profile', JSON.stringify(this.data)); } catch (e) { } },
  addExtraction(gained, kills, mapId) {
    const d = this.data;
    d.raids++; d.extracted++; d.bank += gained; d.last = gained; d.kills += (kills || 0);
    if (mapId === 'frontier') { d.frontierRaids = (d.frontierRaids | 0) + 1; d.frontierExtracted = (d.frontierExtracted | 0) + 1; }
    if (gained > d.best) d.best = gained;
    this.save();
  },
  addDeath(kills, mapId) {
    const d = this.data;
    d.raids++; d.died++; d.last = 0; d.kills += (kills || 0);
    if (mapId === 'frontier') d.frontierRaids = (d.frontierRaids | 0) + 1;
    this.save();
  },
  addSearch() {
    const d = this.data;
    d.searched = (d.searched | 0) + 1;
    this.save();
  },
  addDelta(n) {
    const d = this.data;
    d.delta = (d.delta | 0) + (n | 0);
    this.save();
  },
  // 行动经验与等级：全部由真实行动数据推导（不存新字段）
  xp() {
    const d = this.data;
    return (d.raids | 0) * 15 + (d.extracted | 0) * 120 + (d.kills | 0) * 10 + (d.searched | 0) * 3;
  },
  level() {
    const XP_PER = 150;
    const xp = this.xp();
    return Math.min(99, 1 + Math.floor(xp / XP_PER));
  },
  levelProgress() {
    const XP_PER = 150;
    return (this.xp() % XP_PER) / XP_PER;
  }
};

/* ============================================================
   玩家资产容器（背包 / 保险箱）
   ============================================================ */
DF.initInventory = function (p) {
  p.inv = {
    bag: [],        // [{key, id}]
    safe: [],       // 保险箱
    items: []       // 已搜索容器产出的待拾取列表（当前打开的容器）
  };
  p.armor = 0;      // 减伤 0~0.55
  p.currentContainer = null;
  p.searching = null;   // {containerId, endAt}
};

DF.bagValue = function (p) {
  let v = 0;
  (p.inv ? p.inv.bag : []).forEach(it => { v += LOOT[it.key].value; });
  return v;
};
DF.safeValue = function (p) {
  let v = 0;
  (p.inv ? p.inv.safe : []).forEach(it => { v += LOOT[it.key].value; });
  return v;
};
DF.bagSlotsUsed = function (p) {
  return (p.inv ? p.inv.bag : []).reduce((n, it) => n + (LOOT[it.key].size || 1), 0);
};
DF.BAG_CAP = BAG_SLOTS;

/* ============================================================
   地图：搜索容器 + 撤离点
   ============================================================ */
DF.EXTRACT_DEFS = [
  { id: 'ex-n', name: '北部撤离点', x: 0, z: -78, openAt: 0,   radius: 4.2, color: 0x7dd069, tag: 'A' },
  { id: 'ex-se', name: '东南撤离点', x: 72, z: 66, openAt: 150, radius: 4.2, color: 0xffb347, tag: 'B' },
  { id: 'ex-sw', name: '西南撤离点', x: -72, z: 70, openAt: 300, radius: 4.2, color: 0xff6b5e, tag: 'C' }
];
// 每张地图可覆盖撤离点布局（开放大地图把撤离点拉到边缘）
DF.EXTRACT_DEFS_BY_MAP = {
  frontier: [
    { id: 'ex-n', name: '北部撤离点', x: 0, z: -1465, openAt: 0,   radius: 4.2, color: 0x7dd069, tag: 'A' },
    { id: 'ex-se', name: '东南撤离点', x: 1425, z: 1425, openAt: 360, radius: 4.2, color: 0xffb347, tag: 'B' },
    { id: 'ex-sw', name: '西南撤离点', x: -1425, z: 1445, openAt: 720, radius: 4.2, color: 0xff6b5e, tag: 'C' }
  ]
};
DF.getExtractDefs = function (mapId) {
  return (mapId && DF.EXTRACT_DEFS_BY_MAP[mapId]) || DF.EXTRACT_DEFS;
};

/* 销毁当前撤离物资（容器 / 撤离点 / 标记），切换地图时重建 */
DF.destroyExtractionWorld = function () {
  const disposeTree = (root) => {
    if (!root) return;
    root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    if (DF.scene) DF.scene.remove(root);
  };
  if (DF.containers) DF.containers.forEach(c => {
    disposeTree(c.mesh);
    if (c.mark) {
      if (DF.scene) DF.scene.remove(c.mark);
      if (c.mark.geometry) c.mark.geometry.dispose();
      if (c.mark.material) c.mark.material.dispose();
    }
  });
  if (DF.extracts) DF.extracts.forEach(e => disposeTree(e.group));
  DF.containers = [];
  DF.containersById = {};
  DF.extracts = [];
  DF.searchMarkers = [];
  DF.airdrop = null;
};
const EXTRACT_HOLD = 10;       // 需站住 10 秒
const RAID_TIME = 720;         // 12 分钟

DF.buildExtractionWorld = function (scene) {
  const mapId = DF.mapId || 'base';
  const extractDefs = DF.getExtractDefs(mapId);
  DF.containers = [];
  DF.containersById = {};
  DF.extracts = [];
  DF.searchMarkers = [];

  /* ---------------- 搜索容器 ---------------- */
  let cid = 0;
  const addContainer = (type, x, z, rotY) => {
    const def = CONTAINER_TYPES[type];
    const g = new T.Group();
    const [w, h, d] = def.size;
    const mat = new T.MeshStandardMaterial({
      color: new T.Color(def.color), roughness: 0.75, metalness: type === 'safe' ? 0.7 : 0.25
    });
    const body = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    body.castShadow = true; body.receiveShadow = true;
    body.position.y = h / 2;
    g.add(body);
    // 装饰：盖板 / 把手 / 锁
    if (type === 'crate') {
      const band = new T.Mesh(new T.BoxGeometry(w * 1.02, 0.06, d * 0.18),
        new T.MeshStandardMaterial({ color: 0x5a4020, roughness: 0.8, metalness: 0.4 }));
      band.position.y = h * 0.72; g.add(band);
    } else if (type === 'locker') {
      const line = new T.Mesh(new T.BoxGeometry(0.03, h * 0.9, d * 0.05),
        new T.MeshStandardMaterial({ color: 0x2a333a }));
      line.position.set(0, h / 2, d / 2 + 0.01); g.add(line);
      const handle = new T.Mesh(new T.BoxGeometry(0.05, 0.22, 0.05),
        new T.MeshStandardMaterial({ color: 0xb0b4b8, metalness: 0.9, roughness: 0.3 }));
      handle.position.set(0.18, h / 2, d / 2 + 0.04); g.add(handle);
    } else if (type === 'safe') {
      const knob = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 0.06, 12),
        new T.MeshStandardMaterial({ color: 0xd0c090, metalness: 0.95, roughness: 0.2 }));
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0, h * 0.55, d / 2 + 0.03); g.add(knob);
    } else if (type === 'airdrop') {
      // 空投烟雾
      const smoke = new T.Mesh(new T.ConeGeometry(0.6, 1.6, 8, 1, true),
        new T.MeshBasicMaterial({ color: 0xffcf9a, transparent: true, opacity: 0.16, depthWrite: false, side: T.DoubleSide }));
      smoke.position.y = h + 0.8; g.add(smoke);
      const light = new T.PointLight(0xff9a4a, 1.6, 16, 2);
      light.position.y = 1.4; g.add(light);
      const stripe = new T.Mesh(new T.BoxGeometry(w * 1.02, 0.22, d * 1.02),
        new T.MeshStandardMaterial({ color: 0xe8d8a0, roughness: 0.7 }));
      stripe.position.y = h * 0.5; g.add(stripe);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY || 0;
    scene.add(g);

    // 未搜索图示（黄色小方块，被搜后消失）
    const mark = new T.Mesh(new T.OctahedronGeometry(0.16),
      new T.MeshBasicMaterial({ color: 0xffc14a, transparent: true, opacity: 0.9 }));
    mark.position.set(x, h + 0.45, z);
    scene.add(mark);

    DF.colliders.push({
      minx: x - w / 2, maxx: x + w / 2, miny: 0, maxy: h,
      minz: z - d / 2, maxz: z + d / 2
    });

    const c = {
      id: 'c' + (++cid), type, x, z, y: h, mesh: g, mark,
      searched: false, loot: [], searchedBy: null
    };
    // 预生成内容（确定在房主端，广播给客人）
    const n = def.items;
    for (let i = 0; i < n; i++) c.loot.push({ key: rollLootKey(def.bonus), id: 'i' + cid + '_' + i });
    DF.containers.push(c);
    DF.containersById[c.id] = c;
    DF.searchMarkers.push(mark);
    return c;
  };

  /* 布置容器（按地图分开布置，贴合各自建筑） */
  if (mapId === 'frontier') {
    // 吴家村 · 开放大地图（3000×3000m）：容器贴地标布置
    // 北部机场（z≈-1150）：机库、塔台、残骸客机
    addContainer('crate', -32, -1129); addContainer('safe', 18, -1125, 0.4);
    addContainer('locker', 44.5, -1128.5, 1.6); addContainer('crate', 12, -1144.5);
    // 吴家村：民居、祠堂、村口
    addContainer('crate', -13, 6.5); addContainer('locker', 12, 4.5, 0.4);
    addContainer('safe', 0, 13.5, 2.0); addContainer('crate', 7.5, -16);
    // 河畔集市（-480, 170）
    addContainer('locker', -490, 164.5, 0.2); addContainer('crate', -477, 173); addContainer('safe', -483, 176, 1.8);
    // 废弃军事基地（980, 28）
    addContainer('locker', 976, 19.5, 0.1); addContainer('crate', 983, 37.5); addContainer('safe', 989, 13.2, 0.9);
    // 西南工业区（-950, 786）
    addContainer('safe', -950, 779, 0.3); addContainer('crate', -934.5, 795);
    addContainer('locker', -954, 796, 1.2); addContainer('crate', -942, 770);
    // 高岭村 / 边境哨站 / 东南物流站 / 南郊村落
    addContainer('crate', 1052, -738); addContainer('locker', -1145, -848, 0.7);
    addContainer('safe', 1150, 958, 0.5); addContainer('crate', 1140, 944); addContainer('crate', -318, 1155);
    // 野外零散（按 ~4.5× 放大散布）
    addContainer('crate', -576, -260); addContainer('locker', 270, -260);
    addContainer('crate', 108, 380); addContainer('locker', -135, -400);
    addContainer('crate', 630, -215); addContainer('crate', 72, 570);
    addContainer('locker', -575, -35); addContainer('safe', 530, 540, 0.6);
    addContainer('crate', -290, -610); addContainer('crate', -1200, -400);
    addContainer('locker', 1250, -200, 1.1); addContainer('crate', 0, -800); addContainer('safe', -700, 1200, 0.9);
  } else {
  // 仓库内部
  addContainer('locker', -56, -46, 0.2); addContainer('locker', -56, -42, 0.2);
  addContainer('crate', -46, -50); addContainer('crate', -44, -38);
  addContainer('safe', -51, -32, 0.4);
  // 办公楼内部
  addContainer('locker', 38, -52, 1.6); addContainer('locker', 41, -52, 1.6);
  addContainer('crate', 48, -46); addContainer('safe', 44, -42, 2.0);
  // 集装箱堆场
  addContainer('crate', -6, 18); addContainer('crate', 7, 17.5);
  addContainer('crate', 20, 24); addContainer('locker', 31, 4.5, 1.0);
  addContainer('crate', -27, 7); addContainer('safe', -59, 33, 0.6);
  // 塔 / 南侧
  addContainer('locker', 63, 59, 2.4); addContainer('crate', 66, 66);
  addContainer('crate', -10, 55); addContainer('crate', 26, 55);
  addContainer('safe', 2, 47, 0.3);
  // 零散
  addContainer('crate', 22, -13); addContainer('crate', -16, -9);
  addContainer('locker', -62, -12, 1.2); addContainer('crate', 59, -22);
  addContainer('crate', -40, 45); addContainer('crate', 44, 46);
  }
  // 空投（局内第 15 分钟投放，初始隐藏；吴家村落点 = 村中心广场）
  const airSpot = mapId === 'frontier' ? [2, 22] : [0, -20];   // 吴家村：空投落村中心
  const air = addContainer('airdrop', airSpot[0], airSpot[1]);
  air.pendingDrop = true;
  air.mesh.visible = false;
  air.mark.visible = false;
  air.collidersIdx = DF.colliders.length - 1;
  DF.airdrop = air;

  /* ---------------- 撤离点 ---------------- */
  extractDefs.forEach(def => {
    const g = new T.Group();
    g.position.set(def.x, 0, def.z);
    // 地面光圈
    const ring = new T.Mesh(new T.RingGeometry(def.radius * 0.72, def.radius, 40),
      new T.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);
    // 内圈
    const inner = new T.Mesh(new T.CircleGeometry(def.radius * 0.70, 32),
      new T.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.10, side: T.DoubleSide, depthWrite: false }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.02;
    g.add(inner);
    // 光柱
    const beam = new T.Mesh(new T.CylinderGeometry(def.radius * 0.55, def.radius * 0.8, 14, 18, 1, true),
      new T.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.09, side: T.DoubleSide, depthWrite: false }));
    beam.position.y = 7;
    g.add(beam);
    // 标识牌
    const board = new T.Mesh(new T.BoxGeometry(2.6, 1.4, 0.16),
      new T.MeshStandardMaterial({ color: 0x2a3326, roughness: 0.8 }));
    board.position.y = 2.2;
    board.rotation.y = Math.atan2(-def.x, -def.z);
    g.add(board);
    const lamp = new T.PointLight(def.color, def.open ? 2.2 : 0.5, 26, 2);
    lamp.position.y = 2.4;
    g.add(lamp);
    scene.add(g);

    DF.extracts.push({
      ...def, group: g, ring, inner, beam, lamp,
      open: false, progress: 0, holder: null, holding: []
    });
  });
  // 容器/空投向 DF.colliders 追加了碰撞盒：重建空间哈希
  if (DF.rebuildColliderGrid) DF.rebuildColliderGrid();
};

/* 撤离点动画（每帧） */
DF.updateExtracts = function (dt) {
  if (!DF.extracts) return;
  const t = DF.time;
  DF.extracts.forEach(ex => {
    const pulse = 0.45 + Math.sin(t * 2.4 + ex.x) * 0.16;
    ex.ring.material.opacity = ex.open ? pulse + 0.18 : 0.16;
    ex.inner.material.opacity = ex.open ? 0.13 : 0.04;
    ex.beam.material.opacity = ex.open ? 0.10 + Math.sin(t * 1.6) * 0.03 : 0.02;
    ex.lamp.intensity = ex.open ? 2.2 : 0.35;
    ex.group.rotation.y += dt * (ex.open ? 0.35 : 0.1);
  });
  // 未搜索容器标识上下浮动
  if (DF.searchMarkers) {
    DF.searchMarkers.forEach(m => {
      if (!m.visible) return;
      m.position.y += Math.sin(t * 3 + m.position.x) * 0.002;
      m.rotation.y += dt * 1.6;
    });
  }
};

/* 房主端：判定玩家是否在撤离点内并累计进度
   注意：进度必须按「真实经过时间」累计，不能用帧 dt
   （低帧率设备上帧 dt 与真实时间差距很大） */
DF.updateExtractionLogic = function (dt) {
  if (!DF.extracts || !DF.matchRunning) return;
  const tNow = now();
  const realDt = Math.min(2, Math.max(0, tNow - (DF._exLastT || tNow)));
  DF._exLastT = tNow;
  const elapsed = DF.matchTime;
  DF.extracts.forEach(ex => {
    const nowOpen = elapsed >= ex.openAt;
    if (nowOpen !== ex.open) {
      ex.open = nowOpen;
      if (nowOpen) {
        DF.pushKillfeed(`<span style="color:#7dd069">☑ ${ex.name} 已开放</span>`);
        DF.net && DF.net.hostBroadcast({ t: 'sys', m: `${ex.name} 已开放撤离` });
      }
    }
    if (!ex.open) {
      ex.progress = 0; ex.holding = [];
      DF.players.forEach(p => {
        if (p.exProgress) p.exProgress[ex.id] = 0;
        if (p.exStartAt) p.exStartAt[ex.id] = null;
      });
      return;
    }
    // 谁在圈内
    const inside = [];
    DF.players.forEach(p => {
      if (!p.alive) return;
      const d = Math.hypot(p.pos.x - ex.x, p.pos.z - ex.z);
      if (d <= ex.radius) inside.push(p);
    });
    ex.holding = inside;
    if (inside.length > 0) {
      // 进度按人数取最大者推进（每人独立累计）
      inside.forEach(p => {
        p.exProgress = p.exProgress || {};
        // 记录进入圈的时间（首帧零进度，之后按真实时间计算）
        if (typeof p.exStartAt !== 'object' || p.exStartAt === null) p.exStartAt = {};
        if (p.exStartAt[ex.id] == null) p.exStartAt[ex.id] = tNow;
        const pr = tNow - p.exStartAt[ex.id];
        p.exProgress[ex.id] = pr;
        if (pr >= EXTRACT_HOLD) {
          DF.finishExtraction(p, ex);
        }
      });
      if (!ex._warned) {
        ex._warned = true;
        DF.pushKillfeed(`<span style="color:#ff6b5e">⚠ ${ex.name} 有人正在撤离！</span>`);
        DF.net && DF.net.hostBroadcast({ t: 'warn', id: ex.id, name: ex.name });
      }
    } else {
      ex._warned = false;
      DF.players.forEach(p => {
        if (p.exProgress) p.exProgress[ex.id] = 0;
        if (p.exStartAt) p.exStartAt[ex.id] = null;
      });
    }
  });
};

/* 撤离完成 */
DF.finishExtraction = function (p, ex) {
  if (!p.alive || p.extracted) return;
  p.extracted = true;
  const value = DF.bagValue(p) + DF.safeValue(p);
  p.extractValue = value;
  p.extractPoint = ex.name;
  DF.onPlayerExtracted(p, ex, value);
};

DF.onPlayerExtracted = function (p, ex, value) {
  const txt = `<b style="color:${p.color}">${escapeHtml(p.name)}</b> <span style="color:#7dd069">已从 ${ex.name} 成功撤离</span> <span style="color:#ffb347">+$${value.toLocaleString()}</span>`;
  DF.pushKillfeed(txt);
  DF.net && DF.net.hostBroadcast({
    t: 'ext', id: p.id, name: p.name, color: p.color, ex: ex.name, v: value
  });
  if (p.isLocal) {
    DF.Profile.addExtraction(value, p.kills, DF.mapId);
    DF.M.onLocalExtracted && DF.M.onLocalExtracted(p, ex, value);
  }
  // 移出战场（保留数据用于结算）
  p.extracted = true;
  p.alive = false;
  // 检查是否所有真人玩家都已撤离/阵亡
  DF.checkRaidOver && DF.checkRaidOver();
};

/* 房主端：是否结束一局（所有人撤离或阵亡） */
DF.checkRaidOver = function () {
  if (!DF.matchRunning || DF.matchOver) return;
  const humans = [];
  DF.players.forEach(p => { if (!p.isBot) humans.push(p); });
  if (!humans.length) return;
  const allDone = humans.every(p => p.extracted || !p.alive);
  if (allDone) {
    DF.M.gameEnd && DF.M.gameEnd(null, 'allDone');
  }
};

/* ============================================================
   搜索 / 拾取 / 丢弃（本地交互）
   ============================================================ */
DF.nearestContainer = function (me, maxDist) {
  if (!DF.containers) return null;
  let best = null, bd = maxDist || 3.2;
  DF.containers.forEach(c => {
    if (c.searched || c.pendingDrop) return;
    const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z);
    if (d < bd) { bd = d; best = c; }
  });
  return best;
};

DF.startSearch = function (c) {
  const me = DF.players.get(DF.myId);
  if (!me || !me.alive || !c || c.searched) return;
  me.searching = { id: c.id, endAt: DF.time + CONTAINER_TYPES[c.type].search };
  DF.playSearchSound && DF.playSearchSound();
  DF.updateExtractHUD && DF.updateExtractHUD(0.016);
};

DF.completeSearch = function (c) {
  const me = DF.players.get(DF.myId);
  if (!me || !c) return;
  if (DF.Profile && DF.Profile.addSearch) DF.Profile.addSearch();
  c.searched = true;
  c.searchedBy = me.id;
  c.mark.visible = false;
  me.searching = null;
  me.currentContainer = c.id;
  me.inv.items = c.loot.map(it => ({ ...it, taken: false }));
  DF.Audio.loot && DF.Audio.loot();
  DF.openLootUI(c);
  DF.updateExtractHUD && DF.updateExtractHUD(0.016);
};

DF.takeItem = function (idx) {
  const me = DF.players.get(DF.myId);
  if (!me || !me.inv) return;
  const item = me.inv.items[idx];
  if (!item || item.taken) return;
  const def = LOOT[item.key];
  const used = DF.bagSlotsUsed(me);
  if (used + def.size > BAG_SLOTS) {
    DF.toast('背包已满（' + BAG_SLOTS + ' 格），可先塞进保险箱或丢弃物资');
    return;
  }
  item.taken = true;
  me.inv.bag.push({ key: item.key, id: item.id });
  if (def.heal) { me.hp = Math.min(CFG.maxHp, me.hp + def.heal); }
  if (def.armor) { me.armor = Math.min(0.55, (me.armor || 0) + def.armor); }
  DF.Audio.loot && DF.Audio.loot();
  DF.refreshLootUI();
  DF.updateHUD(true);
  DF.net && DF.net.role === 'host' && DF.net.hostBroadcast({
    t: 'roster', _loot: { id: me.id, v: DF.bagValue(me) }
  });
};

DF.moveToSafe = function (bagIdx) {
  const me = DF.players.get(DF.myId);
  if (!me || !me.inv) return;
  const it = me.inv.bag[bagIdx];
  if (!it) return;
  if (me.inv.safe.length >= SAFE_SLOTS) { DF.toast('保险箱已满（' + SAFE_SLOTS + ' 格）'); return; }
  me.inv.bag.splice(bagIdx, 1);
  me.inv.safe.push(it);
  DF.toast(`已放入保险箱：${LOOT[it.key].name}（阵亡后仍保留）`);
  DF.refreshLootUI();
  DF.updateHUD(true);
};

DF.dropItem = function (bagIdx) {
  const me = DF.players.get(DF.myId);
  if (!me || !me.inv) return;
  const it = me.inv.bag[bagIdx];
  if (!it) return;
  me.inv.bag.splice(bagIdx, 1);
  DF.toast(`已丢弃：${LOOT[it.key].name}`);
  DF.refreshLootUI();
  DF.updateHUD(true);
};

DF.useItem = function (bagIdx) {
  const me = DF.players.get(DF.myId);
  if (!me || !me.inv) return;
  const it = me.inv.bag[bagIdx];
  if (!it) return;
  const def = LOOT[it.key];
  if (!def.heal) { DF.toast(`${def.name} 无法直接使用`); return; }
  if (me.hp >= CFG.maxHp) { DF.toast('生命值已满'); return; }
  me.hp = Math.min(CFG.maxHp, me.hp + def.heal);
  me.inv.bag.splice(bagIdx, 1);
  DF.toast(`使用了 ${def.name}，恢复 ${def.heal} 生命`);
  DF.refreshLootUI();
  DF.updateHUD(true);
};
