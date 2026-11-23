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
  const OWNED = { m4a1: true, ak74: true, mp5: true };

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
    try { const g = localStorage.getItem('df_gm_equipped'); return BASE[g] ? g : 'm4a1'; } catch (e) { return 'm4a1'; }
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
  const isOwned = id => !!OWNED[id];
  const modCount = id => (DF.gunsmithAtts[id] || []).filter(v => v !== 0).length;

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
          <div class="gs ${isOwned(g.id) ? 'own' : 'lk'}">${isOwned(g.id) ? (modCount(g.id) ? `已改装 ×${modCount(g.id)}` : '原厂') : '🔒 未解锁'}</div>
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
          ${owned ? '<div class="df-gs-own">✓ 已入库 · 可出战</div>' : `<div class="df-gs-lk">🔒 ${g.req}</div>`}
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
      return r;
    };
  }
})();
