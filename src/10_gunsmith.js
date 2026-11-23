/* ============================================================
   枪械工坊（Gunsmith）—— 六把枪自由改装 + 实战生效
   - 六把枪均可更换五个配件位（瞄具/枪口/握把/弹匣/枪托）
   - 三把已入库（M4A1/AK-74M/MP5）可「出战装备」；三把未解锁枪可预览改装、不可出战
   - 改装影响实战：弹匣容量 / 换弹时间 / 伤害 / 据枪散布 / 移动散布 / 后坐
   - 单人与房主本地生效；联机客人经 'wsel' 消息向房主声明（房主权威伤害/弹药）
   - 所有改装 localStorage 持久化（df_gm_atts / df_gm_equipped）
   ============================================================ */
(function () {
  'use strict';
  if (typeof DF === 'undefined') return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const GUNS = window.DF_GUNS || [];

  /* ---------- 武器基础参数（与枪械库展示条目一一对应） ---------- */
  const BASE = {
    m4a1: { short: 'M4A1', dmg: 1.00, spread: 1.00, recoil: 1.00, mag: 30,  reload: 2.05 },
    ak74: { short: 'AK-74M', dmg: 1.13, spread: 1.08, recoil: 1.15, mag: 30, reload: 2.20 },
    mp5:  { short: 'MP5',  dmg: 0.67, spread: 0.90, recoil: 0.80, mag: 30,  reload: 2.35 },
    awm:  { short: 'AWM',  dmg: 2.45, spread: 0.65, recoil: 1.60, mag: 5,   reload: 3.20 },
    m249: { short: 'M249', dmg: 0.95, spread: 1.25, recoil: 1.20, mag: 100, reload: 4.60 },
    vss:  { short: 'VSS',  dmg: 1.55, spread: 0.75, recoil: 0.90, mag: 10,  reload: 2.80 }
  };
  const BASE_OWNED = { m4a1: true, ak74: true, mp5: true };
  /* 未入库枪的解锁条件：读取真实档案（DF.Profile），与大厅展示一致 */
  const UNLOCK = {
    awm:  { ok: d => (d.kills | 0) >= 80,            label: '累计击杀 80 解锁' },
    m249: { ok: d => (d.kills | 0) >= 150,           label: '累计击杀 150 解锁' },
    vss:  { ok: d => (d.frontierExtracted | 0) >= 3, label: '累计从吴家村成功撤离 3 次解锁' }
  };
  /* 枪械工坊在解析期即做出战枪校验，早于 DF.init 的 Profile.load()；
     这里主动 load 一次（幂等），保证解锁判断基于真实档案 */
  if (typeof DF !== 'undefined' && DF.Profile && DF.Profile.load) { try { DF.Profile.load(); } catch (e) { } }
  const profileData = () => (typeof DF !== 'undefined' && DF.Profile && DF.Profile.data) ? DF.Profile.data : {};
  const isGunUnlocked = id => !!BASE_OWNED[id] || (UNLOCK[id] ? !!UNLOCK[id].ok(profileData()) : false);
  DF.isGunUnlocked = isGunUnlocked;

  /* ---------- 配件表（mod 均为累计加减，正值越大该属性越「强」） ---------- */
  const SLOTS = [
    { key: 'sight', name: '瞄具', opts: [
      { n: '原厂机瞄',     m: {} },
      { n: '红点瞄准镜',   m: { spread: -0.15, adsSpread: -0.18 } },
      { n: '全息瞄准镜',   m: { spread: -0.18, adsSpread: -0.12 } },
      { n: '2倍战术镜',    m: { adsSpread: -0.26, dmg: +0.06 } },
      { n: '4倍狙击镜',    m: { adsSpread: -0.42, spread: +0.10, dmg: +0.08 } }
    ] },
    { key: 'muzzle', name: '枪口', opts: [
      { n: '无枪口',       m: {} },
      { n: '补偿器',       m: { recoil: -0.22 } },
      { n: '消焰器',       m: { recoil: -0.12, spread: -0.04 } },
      { n: '制退器',       m: { recoil: -0.35, spread: +0.08 } },
      { n: '消音器',       m: { dmg: -0.12, spread: -0.10, recoil: -0.10 } }
    ] },
    { key: 'grip', name: '握把', opts: [
      { n: '无握把',       m: {} },
      { n: '垂直握把',     m: { recoil: -0.12, moveSpread: -0.15 } },
      { n: '直角握把',     m: { spread: -0.12 } },
      { n: '轻型握把',     m: { moveSpread: -0.25 } },
      { n: '橡胶握把',     m: { recoil: -0.08, spread: -0.06 } }
    ] },
    { key: 'mag', name: '弹匣', opts: [
      { n: '原厂弹匣',     m: {} },
      { n: '扩容弹匣',     m: { mag: +0.50 } },
      { n: '快速弹匣',     m: { reload: -0.28 } },
      { n: '快速扩容弹匣', m: { mag: +0.30, reload: -0.15 } },
      { n: '轻量弹匣',     m: { reload: -0.12, mag: +0.10 } }
    ] },
    { key: 'stock', name: '枪托', opts: [
      { n: '原厂枪托',     m: {} },
      { n: '轻型枪托',     m: { moveSpread: -0.18, spread: -0.05 } },
      { n: '战术枪托',     m: { recoil: -0.10 } },
      { n: '重型枪托',     m: { recoil: -0.18, moveSpread: +0.10 } },
      { n: '射手枪托',     m: { recoil: -0.08, adsSpread: -0.12 } }
    ] }
  ];
  const SLOT_KEYS = SLOTS.map(s => s.key);

  /* ---------- 持久化 ---------- */
  function loadAtts() {
    try {
      const raw = JSON.parse(localStorage.getItem('df_gm_atts') || '{}');
      const out = {};
      Object.keys(BASE).forEach(id => {
        const a = Array.isArray(raw[id]) ? raw[id] : [];
        out[id] = SLOT_KEYS.map((_, i) => {
          const v = a[i] | 0;
          return v >= 0 && v < SLOTS[i].opts.length ? v : 0;
        });
      });
      return out;
    } catch (e) { return Object.fromEntries(Object.keys(BASE).map(id => [id, [0, 0, 0, 0, 0]])); }
  }
  function loadEquipped() {
    // 本地存档可被手动篡改：未入库的枪一律回落 M4A1（与大厅出战校验一致）
    try { const g = localStorage.getItem('df_gm_equipped'); return (BASE[g] && isGunUnlocked(g)) ? g : 'm4a1'; } catch (e) { return 'm4a1'; }
  }
  const persist = () => {
    try {
      localStorage.setItem('df_gm_atts', JSON.stringify(DF.gunsmithAtts));
      localStorage.setItem('df_gm_equipped', DF.gunsmithEquipped);
    } catch (e) { }
  };
  DF.gunsmithAtts = loadAtts();
  DF.gunsmithEquipped = loadEquipped();
  DF.weapon = { gun: DF.gunsmithEquipped, atts: DF.gunsmithAtts[DF.gunsmithEquipped].slice() };
  DF.refreshWeaponRef = function () {
    DF.weapon.gun = DF.gunsmithEquipped;
    DF.weapon.atts = DF.gunsmithAtts[DF.gunsmithEquipped].slice();
  };
  DF.stockWeapon = () => ({ gun: 'm4a1', atts: [0, 0, 0, 0, 0] });
  DF.equippedWeapon = () => ({ gun: DF.gunsmithEquipped, atts: (DF.gunsmithAtts[DF.gunsmithEquipped] || [0, 0, 0, 0, 0]).slice() });

  /* ---------- 实战属性（房主权威与本地预测共用；bot/未改装=原厂） ---------- */
  const weaponOf = p => {
    const w = (p && p.weapon) ? p.weapon : p;   // 兼容直接传 {gun, atts} 与 player.weapon 两种形状
    return (w && BASE[w.gun]) ? w : { gun: 'm4a1', atts: [0, 0, 0, 0, 0] };
  };
  const attsOf = p => {
    const w = weaponOf(p);
    return (Array.isArray(w.atts) && w.atts.length === 5) ? w.atts : [0, 0, 0, 0, 0];
  };
  const sumMod = (p, key) => {
    let s = 0;
    attsOf(p).forEach((ai, i) => {
      const o = SLOTS[i].opts[clamp(ai | 0, 0, SLOTS[i].opts.length - 1)];
      if (o.m && o.m[key]) s += o.m[key];
    });
    return s;
  };
  const defOf = p => BASE[weaponOf(p).gun] || BASE.m4a1;
  DF.effMag = p => Math.max(1, Math.round(defOf(p).mag * (1 + sumMod(p, 'mag'))));
  DF.effReload = p => clamp(defOf(p).reload * (1 + sumMod(p, 'reload')), 0.7, 6);
  DF.effDmg = p => Math.max(0.25, defOf(p).dmg * (1 + sumMod(p, 'dmg')));
  DF.effSpread = p => clamp(defOf(p).spread * (1 + sumMod(p, 'spread')), 0.45, 3);
  DF.effAdsSpread = p => clamp(1 + sumMod(p, 'spread') * 0.6 + sumMod(p, 'adsSpread'), 0.35, 2.5);
  DF.effMoveSpread = p => clamp(1 + sumMod(p, 'moveSpread'), 0.3, 2);
  DF.effRecoil = p => clamp(defOf(p).recoil * (1 + sumMod(p, 'recoil')), 0.35, 2.6);
  DF.effStats = p => ({
    mag: DF.effMag(p), reload: DF.effReload(p), dmg: DF.effDmg(p),
    spread: DF.effSpread(p), adsSpread: DF.effAdsSpread(p),
    moveSpread: DF.effMoveSpread(p), recoil: DF.effRecoil(p)
  });


  /* ============================================================
     第一人称枪械模型 · 六枪可切换 · 五槽配件可视化
     与 createViewModel 共用一套局部坐标（-z 向前）；
     DF.syncViewModel() 按「当前出战枪 + 配件」重建枪组
     ============================================================ */
  /* ---------- 涂装（商城购买 · 持久化） ---------- */
  const SKINS_KEY = 'df_skins';
  const loadSkins = () => { try { const a = JSON.parse(localStorage.getItem(SKINS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const saveSkins = a => { try { localStorage.setItem(SKINS_KEY, JSON.stringify(a)); } catch (e) { } };
  DF.skins = {
    owned: () => loadSkins(),
    isOn: key => loadSkins().includes(key),
    own: key => { const a = loadSkins(); if (!a.includes(key)) { a.push(key); saveSkins(a); } }
  };

  const GUN_SPECS = {
    m4a1: { receiver: [0.075, 0.10, 0.40], receiverZ: -0.12, rail: 0.52, railZ: -0.18,
      hand: [0.068, 0.078, 0.34], handZ: -0.44, handMat: 'tan', vents: 5,
      barrelR: 0.014, barrelLen: 0.34, barrelZ: -0.72, tip: -0.89,
      mag: [0.05, 0.16, 0.075], magY: -0.125, magRot: -0.12, magMat: 'body2',
      stock: [0.05, 0.085, 0.24], stockMat: 'body2', sight: 'reflex', fgZ: -0.36 },
    ak74: { receiver: [0.078, 0.105, 0.42], receiverZ: -0.12, rail: 0.30, railZ: -0.14,
      hand: [0.07, 0.08, 0.30], handZ: -0.42, handMat: 'wood', vents: 4,
      barrelR: 0.014, barrelLen: 0.38, barrelZ: -0.73, tip: -0.92,
      mag: [0.052, 0.20, 0.08], magY: -0.14, magRot: -0.34, magMat: 'bakelite',
      stock: [0.052, 0.088, 0.26], stockMat: 'wood', sight: 'iron', fgZ: -0.36,
      defaultMuzzle: 'slant' },
    mp5: { receiver: [0.072, 0.098, 0.36], receiverZ: -0.11, rail: 0.30, railZ: -0.13,
      hand: [0.066, 0.075, 0.24], handZ: -0.38, handMat: 'body2', vents: 3,
      barrelR: 0.013, barrelLen: 0.20, barrelZ: -0.55, tip: -0.65,
      mag: [0.048, 0.17, 0.075], magY: -0.13, magRot: -0.10, magMat: 'body2',
      stock: [0.045, 0.07, 0.17], stockMat: 'body2', sight: 'reflex', fgZ: -0.33 },
    awm: { receiver: [0.075, 0.105, 0.46], receiverZ: -0.13, rail: 0.40, railZ: -0.15,
      hand: [0.066, 0.078, 0.40], handZ: -0.46, handMat: 'body2', vents: 0,
      barrelR: 0.016, barrelLen: 0.55, barrelZ: -0.88, tip: -1.15,
      mag: [0.045, 0.10, 0.07], magY: -0.115, magRot: -0.05, magMat: 'body2',
      stock: [0.05, 0.095, 0.30], stockMat: 'body', sight: 'scope4x', fgZ: -0.40,
      defaultMuzzle: 'brake' },
    m249: { receiver: [0.095, 0.115, 0.46], receiverZ: -0.14, rail: 0.34, railZ: -0.15,
      hand: [0.085, 0.088, 0.34], handZ: -0.44, handMat: 'tan', vents: 6,
      barrelR: 0.021, barrelLen: 0.46, barrelZ: -0.83, tip: -1.06,
      mag: [0.095, 0.13, 0.17], magY: -0.165, magRot: 0, magMat: 'ammoBox', magBox: true,
      stock: [0.055, 0.088, 0.26], stockMat: 'body2', sight: 'iron', fgZ: -0.37,
      defaultMuzzle: 'flashHider', bipod: true },
    vss: { receiver: [0.07, 0.095, 0.36], receiverZ: -0.11, rail: 0.26, railZ: -0.13,
      hand: [0.066, 0.075, 0.26], handZ: -0.39, handMat: 'tan', vents: 0,
      barrelR: 0.013, barrelLen: 0.16, barrelZ: -0.52, tip: -0.60,
      integralSupp: { r: 0.034, len: 0.26, z: -0.72 },
      mag: [0.048, 0.11, 0.07], magY: -0.115, magRot: -0.08, magMat: 'body2',
      stock: [0.045, 0.08, 0.18], stockMat: 'wood', sight: 'reflex', fgZ: -0.33 }
  };
  const MAG_MUL = { 0: 1, 1: 1.45, 2: 1.0, 3: 1.3, 4: 1.12 };
  const MUZZLES = {
    flashHider: { r: 0.021, r2: 0.024, len: 0.09, rot: 0, damp: 1.0, out: 0.075 },
    comp:       { r: 0.023, r2: 0.023, len: 0.07, rot: 0, damp: 0.85, out: 0.058 },
    slant:      { r: 0.024, r2: 0.024, len: 0.095, rot: 0.22, damp: 1.0, out: 0.08 },
    brakeBig:   { r: 0.029, r2: 0.031, len: 0.12, rot: 0, damp: 0.9, out: 0.10 },
    brake:      { r: 0.023, r2: 0.023, len: 0.14, rot: 0, damp: 1.0, out: 0.125 },
    suppressor: { r: 0.033, r2: 0.033, len: 0.30, rot: 0, damp: 0.4, out: 0.285 }
  };

  DF.syncViewModel = function () {
    const vm = DF.viewModel;
    if (!vm || !vm.userData || !vm.userData.gunRoot) return;
    const root = vm.userData.gunRoot;
    const M = vm.userData.mats;
    const disposables = [];
    // 清空旧枪组，释放几何体与临时材质
    const old = root.children.slice();
    old.forEach(c => {
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.__gmTemp) o.material.dispose(); });
      root.remove(c);
    });
    const w = DF.equippedWeapon();
    const spec = GUN_SPECS[w.gun] || GUN_SPECS.m4a1;
    // 沙暴涂装：持有 m4a1_sand 且出战 M4A1 时，机匣/护木等换沙暴色（临时材质随枪组释放）
    const sandOn = w.gun === 'm4a1' && DF.skins && DF.skins.isOn('m4a1_sand');
    const sand = h => { const m = new T.MeshStandardMaterial({ color: h, roughness: 0.72, metalness: 0.35 }); m.__gmTemp = true; return m; };
    const sandBody = sandOn ? sand(0x8a7648) : null;
    const sandBody2 = sandOn ? sand(0x6e5b33) : null;
    const sandTan = sandOn ? sand(0x9a8a5e) : null;
    const atts = (Array.isArray(w.atts) && w.atts.length === 5) ? w.atts : [0, 0, 0, 0, 0];
    const box = (x, y, z) => new T.BoxGeometry(x, y, z);
    const cyl = (r, len) => new T.CylinderGeometry(r, r, len, 12);
    const add = (geo, mat, x, y, z, rx, rz) => {
      const mesh = new T.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      if (rx) mesh.rotation.x = rx;
      if (rz) mesh.rotation.z = rz;
      root.add(mesh);
      return mesh;
    };
    const v3 = (hex, opacity) => { const m = new T.MeshStandardMaterial({ color: hex, roughness: 0.15, metalness: 0.3, transparent: true, opacity }); m.__gmTemp = true; return m; };

    // ===== 机匣 =====
    add(box(spec.receiver[0], spec.receiver[1], spec.receiver[2]), sandBody || M.body, 0, 0, spec.receiverZ);
    // ===== 上导轨 =====
    add(box(0.055, 0.024, spec.rail), sandBody2 || M.body2, 0, 0.062, spec.railZ);
    // ===== 护木 =====
    add(box(spec.hand[0], spec.hand[1], spec.hand[2]), sandTan || M[spec.handMat] || M.tan, 0, -0.002, spec.handZ);
    // ===== 散热孔 =====
    for (let i = 0; i < (spec.vents || 0); i++) add(box(0.072, 0.012, 0.022), M.body, 0, 0.012, -0.30 - i * 0.055);
    // ===== 枪管 =====
    const barrel = add(cyl(spec.barrelR, spec.barrelLen), sandBody || M.body, 0, 0.012, spec.barrelZ, Math.PI / 2);
    // ===== VSS 一体消音套筒 =====
    if (spec.integralSupp) add(cyl(spec.integralSupp.r, spec.integralSupp.len), M.body2, 0, 0.012, spec.integralSupp.z, Math.PI / 2);
    // ===== M249 两脚架 =====
    if (spec.bipod) {
      [-1, 1].forEach(s => {
        const leg = add(cyl(0.0075, 0.20), M.body2, s * 0.038, -0.075, -0.34);
        leg.rotation.z = s * 0.45; leg.rotation.x = 0.4;
      });
    }
    // ===== 枪口装置（配件位 2） =====
    const muzKey = (atts[1] === 0) ? (spec.defaultMuzzle || 'flashHider') : (['flashHider', 'comp', 'flashHider', 'brakeBig', 'suppressor'][atts[1]] || 'flashHider');
    const mz = MUZZLES[muzKey];
    const muzLen = mz.len;
    const muzCenter = spec.tip - muzLen / 2 + 0.02;
    const muzzleZ = spec.tip - mz.out;
    const mzMesh = add(new T.CylinderGeometry(mz.r, mz.r2, muzLen, 12), M.body2, 0, 0.012, muzCenter, Math.PI / 2, mz.rot);
    // ===== 弹匣（武器型 + 配件位 4 容量倍率） =====
    const magMul = MAG_MUL[atts[3]] || 1;
    const magH = spec.mag[1] * magMul;
    const magCY = spec.magY - (magH - spec.mag[1]) * 0.5;
    const magGeo = spec.magBox ? box(spec.mag[0], magH, spec.mag[2]) : box(spec.mag[0], magH, spec.mag[2]);
    const magMesh = add(magGeo, M[spec.magMat] || M.body2, 0, magCY, spec.receiverZ + 0.02, spec.magRot);
    if (spec.magRot) magMesh.rotation.x = spec.magRot;   // AK 弯弹匣
    // ===== 握把 =====
    add(box(0.05, 0.15, 0.07), sandBody || M.body, 0, -0.12, 0.06, 0.28);
    // ===== 前握把（配件位 3） =====
    if (atts[2] > 0) {
      const rot = atts[2] === 2 ? -0.4 : 0.12;
      add(box(0.045, atts[2] === 3 ? 0.085 : 0.11, 0.055), M.rubber, 0, -0.085, spec.fgZ, rot);
      if (atts[2] === 4) { add(box(0.05, 0.012, 0.062), M.body2, 0, -0.045, spec.fgZ, rot); add(box(0.05, 0.012, 0.062), M.body2, 0, -0.085, spec.fgZ, rot); }
    }
    // ===== 枪托（配件位 5） =====
    let stockLen = spec.stock[2], stockScale = 1;
    if (atts[4] === 1) { stockScale = 0.78; stockLen *= 0.8; }
    else if (atts[4] === 3) { stockScale = 1.28; stockLen *= 1.12; }
    const stockCenter = 0.08 + stockLen / 2 - 0.02;
    add(box(spec.stock[0] * stockScale, spec.stock[1] * stockScale, stockLen), sandBody2 || M[spec.stockMat] || M.body2, 0, -0.005, stockCenter);
    if (atts[4] === 2) add(box(0.034, 0.022, 0.11), M.rubber, 0, 0.045, stockCenter + 0.01);          // 战术托颊腮
    else if (atts[4] === 4) add(box(0.055, 0.1, 0.03), M.rubber, 0, -0.01, stockCenter + stockLen / 2 - 0.01, 0.35);  // 射手托底板
    // ===== 瞄具（配件位 1；0 = 原厂默认） =====
    const sightKey = atts[0] === 0 ? spec.sight : (atts[0] === 1 ? 'reflex' : atts[0] === 2 ? 'holo' : atts[0] === 3 ? 'scope2x' : 'scope4x');
    let redDot;
    if (sightKey === 'iron') {
      add(box(0.009, 0.024, 0.009), M.body2, 0, 0.075, -0.28);
      add(box(0.030, 0.016, 0.01), M.body2, 0, 0.073, 0.03);
      add(box(0.008, 0.030, 0.008), M.body2, -0.012, 0.07, 0.035);
      add(box(0.008, 0.030, 0.008), M.body2, 0.012, 0.07, 0.035);
      redDot = add(new T.CircleGeometry(0.0032, 8), M.dot, 0, 0.075, -0.277);
      redDot.rotation.y = Math.PI;
    } else if (sightKey === 'reflex' || sightKey === 'holo') {
      add(box(0.026, 0.055, 0.09), M.body2, 0, 0.10, -0.056);
      add(box(0.05, 0.03, 0.10), M.body2, 0, 0.088, -0.06);
      const ringGeo = new T.TorusGeometry(0.030, 0.0065, 8, 18);
      add(ringGeo, M.body, 0, 0.128, -0.085);
      add(ringGeo, M.body2, 0, 0.128, -0.028);
      const lensTint = sightKey === 'holo' ? v3(0x2bd06a, 0.22) : (atts[0] === 1 ? v3(0xd0503a, 0.22) : v3(0x8fd0e0, 0.16));
      const lens = new T.Mesh(new T.CircleGeometry(0.029, 18), lensTint);
      lens.position.set(0, 0.128, -0.028); root.add(lens);
      redDot = add(new T.CircleGeometry(0.0032, 10), M.dot, 0, 0.128, -0.026);
    } else {
      // 2倍 / 4倍战术镜
      const r = sightKey === 'scope4x' ? 0.040 : 0.033;
      const len = sightKey === 'scope4x' ? 0.23 : 0.16;
      const tube = add(cyl(r, len), M.scopeBody, 0, 0.122, -0.06, Math.PI / 2);
      const ringGeo = new T.TorusGeometry(r, 0.005, 8, 18);
      add(ringGeo, M.body2, 0, 0.122, -0.06 - len / 2 + 0.02);
      add(ringGeo, M.body2, 0, 0.122, -0.06 + len / 2 - 0.02);
      add(box(0.03, 0.035, 0.05), M.body2, 0, 0.085, -0.06);           // 镜座
      if (sightKey === 'scope4x') {
        add(box(0.02, 0.032, 0.024), M.scopeBody, 0, 0.162, -0.06);    // 高低塔
        add(cyl(0.013, 0.02), M.scopeBody, 0.042, 0.122, -0.06, 0, Math.PI / 2); // 方向塔
      }
      const lensTint = v3(0x9fd8e8, 0.28);
      const lens = new T.Mesh(new T.CircleGeometry(r - 0.004, 18), lensTint);
      lens.position.set(0, 0.122, -0.06 - len / 2 + 0.005); root.add(lens);
      redDot = add(new T.CircleGeometry(0.0028, 10), M.dot, 0, 0.122, -0.06 - len / 2 + 0.01);
      redDot.rotation.y = Math.PI;
    }
    // ===== 更新 vm 挂钩（装填动画 / ADS / 火光） =====
    vm.userData.mag = magMesh;
    vm.userData.magBaseY = magCY;
    vm.userData.redDot = redDot;
    vm.userData.muzzle.position.z = muzzleZ;
    vm.userData.flash.position.z = muzzleZ - 0.07;
    vm.userData.flash2.position.z = muzzleZ - 0.04;
    vm.userData.flashLight.position.set(0, 0.0, muzzleZ - 0.05);
    vm.userData.flashDamp = mz.damp;
  };

  /* ---------- 武器 HUD 标签 ---------- */
  DF.refreshWeaponLabel = function () {
    const el = document.getElementById('weapon');
    if (!el) return;
    const d = defOf(DF.equippedWeapon());
    const modified = (DF.gunsmithAtts[DF.gunsmithEquipped] || []).some(v => v !== 0);
    el.textContent = `${d.short} · ${modified ? '已改装' : '全自动'}`;
  };

  /* ---------- 枪械工坊 UI ---------- */
  let selected = 'm4a1';
  const $ = id => document.getElementById(id);
  const el = s => document.querySelector(s);
  const gunById = id => GUNS.find(g => g.id === id) || GUNS[0];
  const isOwned = id => isGunUnlocked(id);
  const modCount = id => (DF.gunsmithAtts[id] || []).filter(v => v !== 0).length;
  const unlockProgress = id => {
    if (isGunUnlocked(id)) return '';
    const d = profileData();
    if (id === 'vss') return `吴家村撤离进度 ${Math.min(d.frontierExtracted | 0, 3)}/3`;
    if (id === 'awm') return `击杀进度 ${Math.min(d.kills | 0, 80)}/80`;
    if (id === 'm249') return `击杀进度 ${Math.min(d.kills | 0, 150)}/150`;
    return '';
  };

  function renderList() {
    const grid = $('gun-grid');
    if (!grid) return;
    grid.innerHTML = GUNS.map(g => `
      <div class="df-gcard${g.id === selected ? ' sel' : ''}${isOwned(g.id) ? '' : ' locked'}" data-gun="${g.id}" role="button" tabindex="0" aria-label="${g.name}">
        ${DF.gunsmithEquipped === g.id ? '<span class="df-equipped">出战中</span>' : ''}
        <svg viewBox="0 0 200 64" fill="#b8c2a4" aria-hidden="true">${g.svg}</svg>
        <div>
          <div class="df-gs-nm" style="font-size:13px">${g.name}</div>
          <div class="gno">${g.no}</div>
          <div class="gs ${isOwned(g.id) ? 'own' : 'lk'}">${isOwned(g.id) ? (modCount(g.id) ? `已改装 ×${modCount(g.id)}` : '原厂') : '🔒 未解锁 · ' + unlockProgress(g.id)}</div>
        </div>
      </div>`).join('');
  }

  const statRow = (label, val, max, text, delta, invertGood) => {
    const pct = clamp(val / max * 100, 2, 100);
    let dc = 'df-fl', dt = '±0';
    if (delta !== null && Math.abs(delta) > 0.001) {
      const good = invertGood ? delta < 0 : delta > 0;
      dc = good ? 'df-up' : 'df-dn';
      dt = (delta > 0 ? '+' : '') + (Math.abs(delta) >= 1 ? delta.toFixed(1) : Math.round(delta * 100) + '%');
    }
    return `<div class="df-gs-stat">${label}<b>${text}<span class="df-gs-delta ${dc}">${dt}</span></b><div class="df-gs-bar"><i style="width:${pct}%"></i></div></div>`;
  };

  function renderDetail() {
    const host = $('gunsmith');
    if (!host) return;
    const g = gunById(selected);
    const atts = DF.gunsmithAtts[selected];
    const pseudo = { weapon: { gun: selected, atts } };
    const st = DF.effStats(pseudo);
    const stock = DF.effStats({ weapon: { gun: selected, atts: [0, 0, 0, 0, 0] } });
    const owned = isOwned(selected);
    const dmgBody = Math.round(32 * st.dmg);
    const stockDmg = Math.round(32 * stock.dmg);
    host.innerHTML = `
      <div class="df-gs-head">
        <div class="df-gs-icon"><svg viewBox="0 0 200 64" fill="#b8c2a4" aria-hidden="true">${g.svg}</svg></div>
        <div>
          <div class="df-gs-nm">${g.name}</div>
          <div class="df-gs-no">${g.no}</div>
          ${owned ? '<div class="df-gs-own">✓ 已入库 · 可出战</div>' : `<div class="df-gs-lk">🔒 ${g.req} · ${unlockProgress(selected)}</div>`}
        </div>
        <button class="df-gs-equip${owned ? '' : ' locked'}" id="gs-equip" ${owned ? '' : 'aria-disabled="true"'}>${owned ? (DF.gunsmithEquipped === selected ? '已 装 备' : '出 战 装 备') : '未 解 锁'}</button>
      </div>
      <div class="df-gs-stats">
        ${statRow('伤害（躯干）', dmgBody, 80, String(dmgBody), dmgBody - stockDmg, false)}
        ${statRow('弹匣容量', st.mag, 150, String(st.mag) + ' 发', st.mag - stock.mag, false)}
        ${statRow('换弹时间', clamp(5 - st.reload, 0, 5), 5, st.reload.toFixed(2) + 's', -(st.reload - stock.reload), false)}
        ${statRow('据枪稳定', clamp(1.3 / st.spread, 0, 1.45), 1.45, '×' + st.spread.toFixed(2), -(st.spread - stock.spread), true)}
        ${statRow('后坐控制', clamp(1.6 / st.recoil, 0, 1.7), 1.7, '×' + st.recoil.toFixed(2), -(st.recoil - stock.recoil), true)}
        ${statRow('爆头伤害', Math.round(65 * st.dmg), 160, String(Math.round(65 * st.dmg)), Math.round(65 * (st.dmg - stock.dmg)), false)}
      </div>
      ${SLOTS.map((slot, i) => `
        <div class="df-gs-slot">
          <div class="df-gs-slotname">${slot.name}</div>
          <div class="df-gs-opts" data-slot="${i}">
            ${slot.opts.map((o, j) => `<button class="df-gs-opt${atts[i] === j ? ' sel' : ''}" data-opt="${j}">${o.n}</button>`).join('')}
          </div>
        </div>`).join('')}
      <div class="df-gs-foot">
        <button class="df-gs-reset" id="gs-reset">恢复原厂</button>
        <span class="df-gs-hint">改装自动保存到本机；联机时随阵容同步给房主</span>
      </div>`;
    // 绑定
    host.querySelectorAll('.df-gs-opts').forEach(box => {
      box.addEventListener('click', e => {
        const btn = e.target.closest('.df-gs-opt');
        if (!btn) return;
        const slot = +box.getAttribute('data-slot');
        const opt = +btn.getAttribute('data-opt');
        DF.gunsmithAtts[selected][slot] = opt;
        DF.refreshWeaponRef();
        persist();
        renderList();
        renderDetail();
        DF.refreshWeaponLabel();
        DF.syncViewModel && DF.syncViewModel();
      });
    });
    const eq = $('gs-equip');
    if (eq) eq.addEventListener('click', () => {
      if (!isOwned(selected)) { DF.toast(`「${gunById(selected).name}」未解锁：${gunById(selected).req}`); return; }
      DF.gunsmithEquipped = selected;
      DF.refreshWeaponRef();
      persist();
      renderList();
      renderDetail();
      DF.refreshWeaponLabel();
      DF.syncViewModel && DF.syncViewModel();
      DF.toast(`已出战装备「${gunById(selected).name}」`);
    });
    const rs = $('gs-reset');
    if (rs) rs.addEventListener('click', () => {
      DF.gunsmithAtts[selected] = [0, 0, 0, 0, 0];
      DF.refreshWeaponRef();
      persist();
      renderList();
      renderDetail();
      DF.refreshWeaponLabel();
      DF.toast('已恢复原厂配置');
    });
  }

  function bindArmory() {
    const grid = $('gun-grid');
    if (grid) grid.addEventListener('click', e => {
      const card = e.target.closest('.df-gcard');
      if (!card) return;
      selected = card.getAttribute('data-gun');
      renderList();
      renderDetail();
    });
    renderList();
    renderDetail();
  }

  window.addEventListener('DOMContentLoaded', () => {
    bindArmory();
    DF.refreshWeaponLabel();
    DF.syncViewModel && DF.syncViewModel();
  });

  /* ---------- 客人→房主 武器声明（联机） ---------- */
  DF.declareWeaponToHost = function () {
    if (DF.mode === 'guest' && DF.net && DF.net.role === 'guest' && DF.net._sendRel) {
      DF.net._sendRel({ t: 'wsel', g: DF.weapon.gun, a: DF.weapon.atts.slice() });
    }
  };
  const _beginPlay = DF.beginPlay;
  if (_beginPlay) {
    DF.beginPlay = function () {
      const r = _beginPlay.apply(this, arguments);
      DF.refreshWeaponRef();
      const me = DF.players && DF.players.get && DF.players.get(DF.myId);
      if (me) {
        me.weapon = DF.weapon;
        if (DF.effMag) me.ammo = DF.effMag(me);
      }
      DF.declareWeaponToHost();
      DF.refreshWeaponLabel();
      DF.syncViewModel && DF.syncViewModel();
      return r;
    };
  }
})();
