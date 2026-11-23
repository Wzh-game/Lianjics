/* ============================================================
   大厅：三角洲行动风格主菜单
   —— 标签切换 / 行动简报联动 / 干员·枪械库·任务·商城 渲染
   （所有数据均为本地展示用静态内容，不影响战局逻辑）
   ============================================================ */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = s => document.querySelector(s);
  const els = s => Array.from(document.querySelectorAll(s));
  const toast = m => { if (typeof DF !== 'undefined' && DF.toast) DF.toast(m); };

  /* ---------- 地图简报 ---------- */
  const MAP_META = {
    base:     { mode: '搜打撤 · 经典战区', time: '行动时限 12:00', scale: '约 220×220m', desc: '军事禁区：仓库与集装箱纵横，物资密集。适合新兵上手，机器人相对稀疏。' },
    outpost:  { mode: '搜打撤 · 前线阵地', time: '行动时限 12:00', scale: '约 260×260m', desc: '边境前哨：断墙与战壕构成交叉火力网，注意壕沟之间的侧翼警戒。' },
    oilfield: { mode: '搜打撤 · 工业区',   time: '行动时限 12:00', scale: '约 300×300m', desc: '沙漠油田：储油罐与采油机林立，高价值物资出没，注意开阔地带的交火。' },
    urban:    { mode: '搜打撤 · 近距离作战', time: '行动时限 12:00', scale: '约 280×280m', desc: '废弃城区：破楼与街巷适合室内清房，转角交火频繁，听好脚步声。' },
    harbor:   { mode: '搜打撤 · 港口枢纽', time: '行动时限 12:00', scale: '约 320×320m', desc: '临海港口：货柜与吊机提供大量垂直机动空间，水边是撤离热点区域。' },
    frontier: { mode: '搜打撤 · 开放大地图', time: '袭击时限 20:00', scale: '3000×3000m', desc: '开放大地图「吴家村」：九个命名地标可自由选择落点，行动时限 20 分钟；天基空投第 10:00 落村中心。' }
  };

  function updateBrief() {
    const sel = $('map-select');
    if (!sel) return;
    const meta = MAP_META[sel.value] || MAP_META.frontier;
    const set = (id, v) => { const n = $(id); if (n) n.textContent = v; };
    set('brief-mode', meta.mode);
    set('brief-time', meta.time);
    set('brief-scale', meta.scale);
    set('brief-desc', meta.desc);
    set('cta-ai', sel.value === 'frontier' ? '对抗 12 名 AI（开放大地图）' : '对抗 7 名 AI');
  }

  /* ---------- 标签切换 ---------- */
  function switchTab(name) {
    els('.df-rail-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    els('.df-panel[data-panel]').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    // 非大厅标签页：隐藏菜单角色，保留干净背景；大厅标签：显示 3D 主角
    if (typeof DF !== 'undefined' && DF.menuActor) DF.menuActor.visible = (name === 'lobby');
  }
  window.DFswitchTab = switchTab;

  /* 列表重渲染后仍是同一 grid 元素：事件只绑定一次（防重复触发/重复扣款） */
  const wireOnce = (el, key, fn) => { if (el && !el[key]) { el[key] = true; el.addEventListener('click', fn); } };

  /* ---------- 付费干员 / 头像框 状态 ---------- */
  const OPS_KEY = 'df_owned_ops';
  const loadOwnedOps = () => { try { const a = JSON.parse(localStorage.getItem(OPS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const saveOwnedOps = a => { try { localStorage.setItem(OPS_KEY, JSON.stringify(a)); } catch (e) { } };
  const FRAME_KEY = 'df_frame';
  const FRAMES = {
    frame_wujia:       { n: '吴家村守望者', cls: 'f-wujia' },
    frame_blackstone:  { n: '黑石铁壁',     cls: 'f-bs' },
    frame_extractor:   { n: '撤离专家',     cls: 'f-ex' }
  };
  const frameId = () => {
    try {
      const v = localStorage.getItem(FRAME_KEY) || '';
      if (v === '1') return 'frame_wujia';        // 旧存档兼容
      return FRAMES[v] ? v : '';
    } catch (e) { return ''; }
  };
  const hasFrame = () => !!frameId();
  const FRAMES_OWNED_KEY = 'df_frames_owned';
  const loadOwnedFrames = () => {
    try { const a = JSON.parse(localStorage.getItem(FRAMES_OWNED_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  };
  const saveOwnedFrames = a => { try { localStorage.setItem(FRAMES_OWNED_KEY, JSON.stringify(a)); } catch (e) { } };
  /** 是否已拥有某个头像框（旧存档只有 df_frame='1' → 视为拥有守望者） */
  const ownsFrame = id => {
    if (!FRAMES[id]) return false;
    if (loadOwnedFrames().includes(id)) return true;
    if (id === 'frame_wujia') { try { return localStorage.getItem(FRAME_KEY) === '1' || frameId() === id; } catch (e) { return false; } }
    return frameId() === id;
  };
  const ownFrame = id => { const a = loadOwnedFrames(); if (!a.includes(id)) { a.push(id); saveOwnedFrames(a); } };
  const setFrame = v => {
    try {
      const id = (v === true || v === 1) ? 'frame_wujia' : (v === false || !v ? '0' : String(v));
      if (FRAMES[id]) { ownFrame(id); localStorage.setItem(FRAME_KEY, id); }
      else localStorage.setItem(FRAME_KEY, '0');
    } catch (e) { }
  };
  /* 旧存档迁移：df_frame 里实际装备过的框补登为「已拥有」，换框后仍可切回 */
  const migrateFrames = () => {
    try {
      const v = localStorage.getItem(FRAME_KEY) || '';
      if (v === '1') { ownFrame('frame_wujia'); localStorage.setItem(FRAME_KEY, 'frame_wujia'); }
      else if (FRAMES[v]) ownFrame(v);
    } catch (e) { }
  };
  migrateFrames();

  const NAMEFX_KEY = 'df_namefx';
  const hasNameFx = () => { try { return localStorage.getItem(NAMEFX_KEY) === '1'; } catch (e) { return false; } };
  const setNameFx = v => { try { localStorage.setItem(NAMEFX_KEY, v ? '1' : '0'); } catch (e) { } };

  /* ---------- 干员 ---------- */
  const OPERATORS = [
    { id: 'hwolf',  name: '红狼', en: 'D-WOLF',  role: '突击 · 进攻核心', desc: '近距离爆发见长的突击干员，适合正面打开突破口，搜打撤老手之选。', power: 82, c1: '#ff8c1a', c2: '#5a3410' },
    { id: 'bullot', name: '莽兽', en: 'BULLET',  role: '重装 · 突破',     desc: 'S1 首发付费干员。重装突破型，购买即永久解锁出战。',             power: 78, c1: '#d06a6a', c2: '#3e1616', premium: true, price: 240 },
    { id: 'weilong',name: '威龙', en: 'STRIKER', role: '突击 · 均衡型',   desc: '无明显短板的标准答案，从新手到老兵都能稳定发挥的万金油。',     power: 74, c1: '#e0d060', c2: '#4a4218' },
    { id: 'fengyi', name: '蜂医', en: 'SHEPHERD',role: '支援 · 救援',     desc: '战场上最值得信赖的生命线，专注于拉人、保人、把队友带出撤离点。', power: 68, c1: '#7dd069', c2: '#1e3a1c' },
    { id: 'gu',     name: '蛊',   en: 'TOX',     role: '工兵 · 破障',     desc: '以装备与陷阱掌控地形，擅长把敌人逼进自己铺好的杀戮区。',       power: 71, c1: '#c07ad8', c2: '#33203e' },
    { id: 'luna',   name: '露娜', en: 'LUNA',    role: '侦察 · 信息',     desc: '掌握战场视野的人，才能掌握战局走向。开镜即索敌，信息即胜利。', power: 65, c1: '#6ac3d8', c2: '#163a44' },
    { id: 'shendan',name: '深蓝', en: 'DEEPBLUE',role: '工程 · 防御',     desc: '防线的守护者，擅长在要点扎根、架设防御并反守为攻。',           power: 70, c1: '#8a9bd0', c2: '#1f2740' },
    { id: 'wuming', name: '无名', en: 'GHOST',   role: '突击 · 隐匿渗透', desc: '声波与侦察干扰，隐入阴影带着闪光弹与飞刃撕开突破口。',         power: 73, c1: '#9aa37a', c2: '#232620' },
    { id: 'jfeng',  name: '疾风', en: 'ZEPHYR',  role: '突击 · 机动突袭', desc: '爆发型脊椎，翻滚位移、锚点回拉，把遭遇战打成自己的节奏。',     power: 76, c1: '#ffd27a', c2: '#3a2a10' },
    { id: 'yehuo',  name: '野火', en: 'WILDFIRE',role: '突击 · 持续突破', desc: '愈战愈强，烟雾弹幕与盾式破障器正面碾开防线。',                 power: 77, c1: '#ff6a3a', c2: '#401208' },
    { id: 'dié',    name: '蝶',   en: 'VLINDER', role: '支援 · 生命守护', desc: '生命体征监测与蝶式救援无人机群，队友在任何角落都能被拉回来。', power: 67, c1: '#e59ad8', c2: '#33152e' },
    { id: 'lrying', name: '旅人', en: 'WANDERER',role: '支援 · 游击支援', desc: '求生专家四叶：气雾针剂枪与军犬协同的万金油支援位。',           power: 72, c1: '#d8b26a', c2: '#2e2412' },
    { id: 'myang',  name: '牧羊人',en: 'WARDEN', role: '工程 · 控场',     desc: '声波脉冲与信号干扰，用噪音和电波把战场变成自己的耳朵。',       power: 69, c1: '#c9a25a', c2: '#26200e' },
    { id: 'wululu', name: '乌鲁鲁',en: 'URIAL',  role: '工程 · 阵地战',   desc: '久经沙场，沙袋阵地与近炸地雷，让每一寸掩体都替他说话。',       power: 70, c1: '#c98a5a', c2: '#2e1a10' },
    { id: 'byte',   name: '比特', en: 'BIT',     role: '工程 · 防守陷阱', desc: '机械蜘蛛织网、捕网陷阱封路，布下陷阱的猎手守着杀戮区。',       power: 66, c1: '#6ab4ff', c2: '#101f33' },
    { id: 'yedan',  name: '液氮', en: 'CRYOGEN', role: '工程 · 冻结控制', desc: '连发冷凝榴弹与低温领域，把追击者一层层冻在原地。',             power: 68, c1: '#9fd8ff', c2: '#14303e' },
    { id: 'haozhao',name: '骇爪', en: 'RAZOR',   role: '侦察 · 隐匿侦察', desc: '隐匿消声的寂静猎手——破译信号，敌人还没看见他就已暴露。',     power: 67, c1: '#a0b060', c2: '#1e2812' },
    { id: 'yinyi',  name: '银翼', en: 'SILVERWING', role: '侦察 · 空中视野', desc: '猎鹰伴飞、全域扫描，用鹰眼把战场的每个角落都照亮。',       power: 71, c1: '#c2d1e0', c2: '#1c232e' },
    { id: 'huixiang',name: '回响', en: 'ECHO',   role: '侦察 · 声波感知', desc: '听风辨位、全图声呐——脚步、枪声、心跳他都能听见。',           power: 64, c1: '#a78ae8', c2: '#201633' }
  ];

  function opIcon(o, size) {
    size = size || 58;
    return `<svg class="df-opicon" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
      <path d="M32 3 58 17v30L32 61 6 47V17Z" fill="${o.c2}" stroke="${o.c1}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M32 12 50 23v18L32 52 14 41V23Z" fill="none" stroke="${o.c1}" stroke-width="1.4" opacity="0.75"/>
      <circle cx="32" cy="26" r="6.2" fill="${o.c1}"/>
      <path d="M18 45c2.4-8.6 7.6-12.4 14-12.4s11.6 3.8 14 12.4" fill="${o.c1}" opacity="0.9"/>
    </svg>`;
  }

  function renderOperators() {
    const grid = $('op-grid');
    if (!grid) return;
    const ownedOps = loadOwnedOps();
    const isUnlocked = o => !o.premium || ownedOps.includes(o.id);
    let sel = 'hwolf';
    try { sel = localStorage.getItem('df_operator') || 'hwolf'; } catch (e) { }
    // 已选中的干员被退回时（异常情况）回落红狼
    if (!isUnlocked(OPERATORS.find(o => o.id === sel) || OPERATORS[0])) sel = 'hwolf';
    grid.innerHTML = OPERATORS.map(o => {
      const locked = !isUnlocked(o);
      return `
      <div class="df-opcard${o.id === sel && !locked ? ' sel' : ''}${locked ? ' locked' : ''}" data-op="${o.id}" tabindex="0" role="button" aria-label="选择干员 ${o.name}">
        ${opIcon(o)}
        <div class="df-opname">${o.name}${locked ? ' <span class="df-oplock">锁</span>' : ''}</div>
        <div class="df-oprole">${o.role} · ${o.en}</div>
        <div class="df-opdesc">${locked ? '商城购买「干员『' + o.name + '』档案 · ' + (o.price || 0) + ' 三角券 即可解锁出战。' : o.desc}</div>
        <div class="df-opbar"><span>战力</span><div class="bar"><i style="width:${o.power}%"></i></div><span>${o.power}</span></div>
      </div>`;
    }).join('');
    const selectOp = (opId) => {
      const op = OPERATORS.find(o => o.id === opId);
      if (op && op.premium && !loadOwnedOps().includes(op.id)) {
        toast(`「${op.name}」未解锁：商城购买「干员『${op.name}』档案」（${op.price || 0} 三角券）`);
        return false;
      }
      sel = opId;
      try { localStorage.setItem('df_operator', sel); } catch (err) { }
      grid.querySelectorAll('.df-opcard').forEach(c => c.classList.toggle('sel', c.getAttribute('data-op') === sel));
      toast(`已选择干员「${op ? op.name : sel}」`);
      return true;
    };
    const detail = $('op-detail');
    const abilityRow = (a, cls, master) => `
      <div class="df-opd-ability ${cls || ''}">
        <div class="df-opd-key">${a.key || (master ? '◆' : '●')}</div>
        <div class="df-opd-aicon">${a.icon || '◆'}</div>
        <div class="df-opd-abody">
          <div class="df-opd-aname">${a.name}
            <span class="df-opd-acd">${a.cd != null ? `冷却 <b>${a.cd}s</b>` : ''}${a.dur != null ? ` · 持续 <b>${a.dur}s</b>` : ''}</span>
          </div>
          <div class="df-opd-adesc">${a.desc || ''}</div>
        </div>
      </div>`;
    const openDetail = (opId) => {
      if (!detail) return;
      const op = OPERATORS.find(o => o.id === opId);
      if (!op) return;
      const kit = (typeof DF !== 'undefined' && DF.operatorKits) ? DF.operatorKits[opId] : null;
      const locked = op.premium && !loadOwnedOps().includes(op.id);
      const ab = (kit && kit.abilities) || [];
      const qA = ab.find(a => a.key === 'Q') || ab[0];
      const eA = ab.find(a => a.key === 'E') || ab[1];
      const vA = ab.find(a => a.key === 'V') || ab[2];
      detail.innerHTML = `
      <div class="df-opd-panel" role="document">
        <button class="df-opd-close" data-opd-close aria-label="关闭">✕</button>
        <div class="df-opd-left">
          <div class="df-opd-hex">${opIcon(op, 132)}</div>
          <div class="df-opd-name">${op.name}</div>
          <div class="df-opd-en">${(kit && kit.en) ? kit.en : op.en}</div>
          <div class="df-opd-role">${op.role}</div>
          <div class="df-opd-chips"><span class="df-opd-chip">${kit ? kit.cls : op.role.split(' · ')[0]}</span>${op.premium ? '<span class="df-opd-chip">付费干员</span>' : ''}</div>
          <div class="df-opd-power"><span>战力</span><div class="bar"><i style="width:${op.power}%"></i></div><span>${op.power}</span></div>
          <div class="df-opd-desc">${op.desc}</div>
          ${locked
            ? `<div class="df-opd-locknote">该干员为付费干员，尚未解锁。<br>商城购买「干员『${op.name}』档案」（${op.price || 0} 三角券）后即可出战。</div>
               <button class="df-opd-deploy" disabled>未解锁 · 商城解锁</button>`
            : `<button class="df-opd-deploy" data-opd-deploy="${op.id}">出 战</button>`}
        </div>
        <div class="df-opd-right">
          <div class="df-opd-sec">被动技能 · PASSIVE</div>
          ${kit ? abilityRow({ key: '◇', icon: '✦', name: kit.passive.name, desc: kit.passive.desc }, 'is-passive', true) : '<div class="df-opd-adesc">暂无数据</div>'}
          <div class="df-opd-sec">战术技能 · Q / E</div>
          ${qA ? abilityRow(qA) : ''}
          ${eA ? abilityRow(eA) : ''}
          <div class="df-opd-sec">终极技能 · V</div>
          ${vA ? abilityRow(vA, 'ultimate') : ''}
          <div class="df-opd-foot"><span>单击卡片 = 选择 · 双击卡片 = 查看介绍</span><span>ESC / 点击遮罩关闭</span></div>
        </div>
      </div>`;
      detail.hidden = false;
      document.body.style.overflow = 'hidden';
      const onKey = ev => { if (ev.key === 'Escape') closeDetail(); };
      detail.__onKey = onKey;
      document.addEventListener('keydown', onKey);
    };
    const closeDetail = () => {
      if (!detail) return;
      detail.hidden = true;
      detail.innerHTML = '';
      document.body.style.overflow = '';
      if (detail.__onKey) { document.removeEventListener('keydown', detail.__onKey); detail.__onKey = null; }
    };
    // 单击 = 选择（延迟 260ms 判定，避免与双击冲突）；双击 = 打开介绍页
    let clickTimer = null, clickOp = null;
    wireOnce(grid, '__opsClickWired', e => {
      const card = e.target.closest('.df-opcard');
      if (!card) return;
      const opId = card.getAttribute('data-op');
      if (clickTimer && clickOp === opId) { clearTimeout(clickTimer); clickTimer = null; clickOp = null; openDetail(opId); return; }
      clickOp = opId;
      clickTimer = setTimeout(() => { clickTimer = null; clickOp = null; selectOp(opId); }, 260);
    });
    if (!grid.__opsDblWired) {
      grid.__opsDblWired = true;
      grid.addEventListener('dblclick', e => {
        const card = e.target.closest('.df-opcard');
        if (!card) return;
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; clickOp = null; }
        openDetail(card.getAttribute('data-op'));
      });
    }
    if (detail && !detail.__wired) {
      detail.__wired = true;
      detail.addEventListener('click', e => {
        if (e.target === detail || e.target.closest('[data-opd-close]')) { closeDetail(); return; }
        const dep = e.target.closest('[data-opd-deploy]');
        if (dep) { const id = dep.getAttribute('data-opd-deploy'); if (selectOp(id)) closeDetail(); }
      });
    }
  }

  /* ---------- 枪械库 ---------- */
  const GUNS = [
    { id: 'm4a1', name: 'M4A1 突击步枪', no: 'AR · 5.56mm', dmg: 46, rng: 62, rof: 72, owned: true,
      svg: '<rect x="14" y="26" width="98" height="12" rx="1.5"/><rect x="112" y="29" width="58" height="5"/><rect x="170" y="28" width="22" height="7"/><rect x="40" y="38" width="10" height="16" transform="rotate(8 45 38)"/><rect x="58" y="38" width="8" height="11"/><rect x="8" y="24" width="12" height="17"/><rect x="66" y="20" width="16" height="6"/><rect x="30" y="19" width="5" height="7"/>' },
    { id: 'ak74', name: 'AK-74M 突击步枪', no: 'AR · 5.45mm', dmg: 52, rng: 55, rof: 66, owned: true,
      svg: '<path d="M14 24h96v13H34l-6 12H14l6-12z"/><rect x="110" y="27" width="56" height="6"/><rect x="166" y="26" width="24" height="8"/><path d="M52 37l-4 18h9l5-18z"/><rect x="8" y="22" width="10" height="18"/><rect x="46" y="18" width="14" height="6"/>' },
    { id: 'mp5', name: 'MP5 冲锋枪', no: 'SMG · 9mm', dmg: 30, rng: 34, rof: 88, owned: true,
      svg: '<rect x="34" y="26" width="66" height="11" rx="2"/><rect x="100" y="29" width="46" height="5"/><rect x="146" y="28" width="14" height="7"/><rect x="52" y="37" width="9" height="17" transform="rotate(6 56 37)"/><rect x="66" y="37" width="8" height="10"/><path d="M30 26l-8 4v8l10 2z"/><rect x="62" y="20" width="12" height="6"/>' },
    { id: 'awm', name: 'AWM 狙击步枪', no: 'SR · 7.62mm', dmg: 95, rng: 97, rof: 12, owned: false, req: '累计击杀 80 解锁',
      svg: '<rect x="8" y="25" width="118" height="11" rx="1"/><rect x="126" y="28" width="52" height="5"/><rect x="178" y="26" width="16" height="8"/><rect x="40" y="36" width="9" height="14" transform="rotate(10 44 36)"/><rect x="64" y="36" width="7" height="10"/><path d="M4 28h10v13H4z"/><rect x="34" y="18" width="26" height="6"/><circle cx="34" cy="21" r="3.4"/><circle cx="60" cy="21" r="3.4"/><path d="M68 36l6 12h6l-4-12z"/>' },
    { id: 'm249', name: 'M249 轻机枪', no: 'LMG · 5.56mm', dmg: 40, rng: 60, rof: 80, owned: false, req: '累计击杀 150 解锁',
      svg: '<rect x="16" y="25" width="104" height="13" rx="1.5"/><rect x="120" y="28" width="52" height="6"/><rect x="172" y="27" width="16" height="8"/><rect x="46" y="38" width="8" height="12"/><path d="M64 38h10l4 16H60z"/><rect x="10" y="23" width="12" height="17"/><rect x="30" y="38" width="20" height="8" rx="4"/><rect x="58" y="19" width="18" height="6"/>' },
    { id: 'vss', name: 'VSS 微声狙击步枪', no: 'SR · 9mm', dmg: 64, rng: 74, rof: 38, owned: false, req: '累计从吴家村成功撤离 3 次解锁',
      svg: '<rect x="22" y="26" width="86" height="11" rx="2"/><rect x="108" y="28" width="40" height="6"/><rect x="148" y="27" width="26" height="8" rx="3"/><rect x="50" y="37" width="8" height="15" transform="rotate(8 54 37)"/><rect x="16" y="24" width="10" height="16"/><rect x="58" y="20" width="10" height="6"/><path d="M70 37l5 11h5l-3-11z"/>' },
    { id: 'm7', name: 'M7 战斗步枪', no: 'AR · 7.62mm', dmg: 55, rng: 68, rof: 56, owned: false, req: '累计击杀 120 解锁',
      svg: '<rect x="12" y="25" width="100" height="12" rx="1.5"/><rect x="112" y="28" width="60" height="5"/><rect x="172" y="27" width="18" height="7"/><rect x="42" y="37" width="10" height="17" transform="rotate(8 47 37)"/><rect x="8" y="23" width="12" height="17"/><rect x="64" y="19" width="18" height="6"/><rect x="28" y="19" width="5" height="6"/><path d="M152 28v-4h14v4z"/>' },
    { id: 'smg45', name: 'SMG-45 冲锋枪', no: 'SMG · .45ACP', dmg: 33, rng: 36, rof: 85, owned: false, req: '累计击杀 60 解锁',
      svg: '<rect x="32" y="25" width="62" height="11" rx="2"/><rect x="94" y="28" width="42" height="5"/><rect x="136" y="27" width="13" height="7"/><rect x="48" y="36" width="10" height="18" transform="rotate(7 53 36)"/><path d="M64 36h11l4 15H66z"/><path d="M28 25l-9 4v8l11 2z"/><rect x="56" y="19" width="12" height="6"/>' },
    { id: 'sks', name: 'SKS 半自动卡宾枪', no: 'CARBINE · 7.62mm', dmg: 60, rng: 76, rof: 33, owned: false, req: '累计击杀 40 解锁',
      svg: '<rect x="18" y="26" width="82" height="11" rx="1.5"/><rect x="100" y="29" width="54" height="5"/><rect x="154" y="27" width="18" height="7"/><path d="M44 37l-3 15h7l4-15z"/><path d="M130 29v-9h20v9z"/><rect x="14" y="24" width="9" height="15"/><path d="M150 29v-4h12v4z"/>' },
    { id: 'sr25', name: 'SR-25 精确射手步枪', no: 'DMR · 7.62mm', dmg: 72, rng: 89, rof: 27, owned: false, req: '累计击杀 100 解锁',
      svg: '<rect x="10" y="25" width="110" height="11" rx="1"/><rect x="120" y="28" width="58" height="5"/><rect x="178" y="26" width="15" height="8"/><rect x="46" y="36" width="9" height="15" transform="rotate(9 50 36)"/><path d="M4 27h11v13H4z"/><rect x="36" y="17" width="30" height="7"/><circle cx="36" cy="20" r="3.6"/><circle cx="66" cy="20" r="3.6"/><path d="M62 36l5 11h6l-4-11z"/>' },
    { id: 'pkm', name: 'PKM 通用机枪', no: 'LMG · 7.62mm', dmg: 44, rng: 65, rof: 72, owned: false, req: '累计击杀 200 解锁',
      svg: '<rect x="14" y="24" width="108" height="13" rx="1.5"/><rect x="122" y="27" width="52" height="6"/><rect x="174" y="26" width="15" height="8"/><rect x="42" y="37" width="8" height="11"/><path d="M60 37h12l4 15H64z"/><rect x="8" y="22" width="13" height="17"/><rect x="26" y="37" width="22" height="9" rx="4"/><rect x="150" y="30" width="4" height="10"/><path d="M176 34q10 4 14 12"/>' },
    { id: 'm82a1', name: 'M82A1 反器材狙击步枪', no: 'SR · .50BMG', dmg: 100, rng: 100, rof: 9, owned: false, req: '累计从吴家村成功撤离 5 次解锁',
      svg: '<rect x="4" y="24" width="128" height="12" rx="1"/><rect x="132" y="27" width="46" height="6"/><rect x="178" y="25" width="17" height="9" rx="2"/><rect x="44" y="36" width="10" height="14" transform="rotate(10 49 36)"/><path d="M0 27h10v14H0z"/><rect x="30" y="16" width="34" height="7"/><circle cx="30" cy="19" r="3.8"/><circle cx="64" cy="19" r="3.8"/><path d="M74 36l6 13h6l-4-13z"/>' }
  ];

  window.DF_GUNS = GUNS;   // 供枪械工坊复用卡面数据

  const statRow = (label, v) => `<div class="df-stat"><b>${label}</b><div class="bar"><i style="width:${v}%"></i></div><span>${v}</span></div>`;

  function renderGuns() {
    const grid = $('gun-grid');
    if (!grid) return;
    grid.innerHTML = GUNS.map(g => `
      <div class="df-gun ${g.owned ? 'owned' : 'locked'}">
        <div class="df-gunno">${g.no}</div>
        <div class="df-gunname">${g.name}</div>
        <svg viewBox="0 0 200 64" fill="#b8c2a4" aria-hidden="true">${g.svg}</svg>
        ${statRow('伤害', g.dmg)}${statRow('射程', g.rng)}${statRow('射速', g.rof)}
        ${g.owned ? '<div class="df-own">✓ 已入库 · 可出勤</div>' : `<div class="df-lock">锁 ${g.req}</div>`}
      </div>`).join('');
  }

  /* ---------- 任务 ---------- */
  const MISSIONS = [
    { icon: '◎', name: '撤离专家', desc: '累计成功撤离 3 次', max: 3, cur: d => d.extracted | 0, award: '5,000 哈弗币 + 20 三角券', hafu: 5000, delta: 20 },
    { icon: '✦', name: '百步穿杨', desc: '累计击杀 25 名敌人', max: 25, cur: d => d.kills | 0, award: '3,000 哈弗币 + 10 三角券', hafu: 3000, delta: 10 },
    { icon: '▣', name: '翻箱倒柜', desc: '搜索 40 个物资容器', max: 40, cur: d => d.searched | 0, award: '2,000 哈弗币 + 5 三角券', hafu: 2000, delta: 5 },
    { icon: '△', name: '黑石行动', desc: '在开放大地图「吴家村」完成 1 局行动', max: 1, cur: d => d.frontierRaids | 0, award: '1,000 哈弗币 + 30 三角券 + 头像框「吴家村守望者」', hafu: 1000, delta: 30, frame: true }
  ];

  const CLAIMED_KEY = 'df_missions_claimed';
  function loadClaimed() { try { const a = JSON.parse(localStorage.getItem(CLAIMED_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveClaimed(a) { try { localStorage.setItem(CLAIMED_KEY, JSON.stringify(a)); } catch (e) { } }
  /* ---------- 顶栏：等级 / 经验 / 双货币 —— 全部来自 DF.Profile ---------- */
  function renderTopBar() {
    const p = (typeof DF !== 'undefined' && DF.Profile) ? DF.Profile : null;
    if (!p) return;
    const d = p.data;
    const setText = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    setText('bank-hafu', (d.bank | 0).toLocaleString());
    setText('bank-delta', (d.delta | 0).toLocaleString());
    setText('player-lvl', 'LV.' + p.level());
    const bar = $('player-xpbar');
    if (bar) bar.style.width = Math.round(p.levelProgress() * 100) + '%';
    const av = $('df-avatar-top');
    if (av) {
      const fid = frameId();
      av.classList.toggle('framed', !!fid);
      Object.keys(FRAMES).forEach(k => av.classList.remove(FRAMES[k].cls));
      if (fid && FRAMES[fid]) av.classList.add(FRAMES[fid].cls);
      av.setAttribute('data-frame', fid || 'none');
    }
    const nick = $('name-input');
    if (nick) nick.classList.toggle('name-gold', hasNameFx());
  }
  DF.renderTopBar = renderTopBar;
  function refreshMissionBadge() {
    const badge = $('mission-badge');
    if (!badge) return;
    const d = (typeof DF !== 'undefined' && DF.Profile) ? DF.Profile.data : {};
    const claimed = loadClaimed();
    const n = MISSIONS.filter((m, i) => !claimed.includes(i) && m.cur(d) >= m.max).length;
    badge.textContent = String(n);
    badge.style.display = n > 0 ? '' : 'none';
  }

  function renderMissions() {
    const list = $('mission-list');
    if (!list) return;
    const prof = (typeof DF !== 'undefined' && DF.Profile && DF.Profile.data) ? DF.Profile.data : {};
    const claimed = loadClaimed();
    list.innerHTML = MISSIONS.map((m, i) => {
      const cur = m.cur(prof);
      const done = cur >= m.max;
      const isClaimed = claimed.includes(i);
      const pct = Math.min(100, Math.round(cur / m.max * 100));
      return `<div class="df-mission">
        <div class="df-micon">${m.icon}</div>
        <div class="df-minfo">
          <div class="df-mname">${m.name}</div>
          <div class="df-mdesc">${m.desc}</div>
          <div class="df-mbar"><div class="bar"><i style="width:${pct}%"></i></div><span>${Math.min(cur, m.max)}/${m.max}</span></div>
        </div>
        <button class="df-mclaim" data-idx="${i}" ${done && !isClaimed ? '' : 'disabled'}>${isClaimed ? '已领取' : (done ? '领取' : '未完成')}</button>
      </div>`;
    }).join('');
    refreshMissionBadge();
    wireOnce(list, '__missionWired', e => {
      const btn = e.target.closest('.df-mclaim');
      if (!btn || btn.disabled) return;
      const idx = Number(btn.getAttribute('data-idx'));
      const m = MISSIONS[idx];
      // 真实入账：哈弗币 + 三角券 计入档案资产并持久化
      if (typeof DF !== 'undefined' && DF.Profile && DF.Profile.data) {
        DF.Profile.data.bank += (m.hafu | 0);
        DF.Profile.data.delta = (DF.Profile.data.delta | 0) + (m.delta | 0);
        DF.Profile.save();
        if (m.frame) setFrame(true);
        if (DF.renderProfile) DF.renderProfile();
        renderTopBar();
      }
      const claimed = loadClaimed();
      if (!claimed.includes(idx)) claimed.push(idx);
      saveClaimed(claimed);
      btn.disabled = true;
      btn.textContent = '已领取';
      refreshMissionBadge();
      toast(`任务「${m.name}」奖励已发放：+$${(m.hafu | 0).toLocaleString()} 哈弗币 · +${m.delta | 0} 三角券`);
    });
  }

  /* ============================================================
     商城 v2.0：分类页签 · 双货币（三角券 / 哈弗币）· 稀有度 · 详情面板
     —— 所有商品钱货两讫，真实生效并持久化
     ============================================================ */
  const HAFU_PER_DELTA = 260;          // 1 三角券 ≈ 260 哈弗币（一局撤离约 $2k~$8k）
  const RARITY = {
    common: { n: '普通', c: '#9aa78a' },
    rare:   { n: '稀有', c: '#5fb0e8' },
    epic:   { n: '史诗', c: '#b98ce8' },
    legend: { n: '传说', c: '#ffb347' }
  };
  const ART = {
    rifle:  'M6 40h84l10-14h26v12l16 2v6h-30l-4 10h-12l4-10H52l-6 14H28l4-14H6z',
    smg:    'M18 36h70l8-10h30v10l12 2v6h-24l-8 12H70l6-12H34l-4 10H18z',
    sniper: 'M2 42h96l6-8h30v8h20v6h-24l-2 8h-12l2-8H60l-4 12H40l4-12H2z',
    lmg:    'M10 38h88v-10h20v10l18 2v8h-28l-6 10h-14l6-10H46l-8 16H20l8-16H10z',
    emblem: 'M32 8 52 18v26L32 56 12 44V18Z',
    badge:  'M32 6 54 20v20L32 58 10 40V20Z',
    square: 'M14 26h36v20H14zM50 30h12v12H50zM22 20h4v6h-4zM34 20h4v6h-4z'
  };

  const SHOP = [
    /* ── 武器涂装（购买即自动应用到该枪，联机/单人同时生效） ── */
    { id: 'm4a1_sand',   cat: 'skin', kind: 'skin', n: 'M4A1「沙暴」',      d: '沙暴迷彩战术涂装，机匣与护木换沙色系。出战 M4A1 时自动应用。', delta: 120, r: 'rare',    art: 'rifle',  feat: true },
    { id: 'ak74_ember',  cat: 'skin', kind: 'skin', n: 'AK-74M「余烬」',    d: '暗红余烬涂装：木质护木转为赤褐、机匣压暗。出战 AK-74M 时生效。', delta: 140, r: 'epic',   art: 'rifle' },
    { id: 'mp5_jungle',  cat: 'skin', kind: 'skin', n: 'MP5「雨林」',       d: '深绿雨林涂装，适合林区与河畔。出战 MP5 时生效。',               delta: 110, r: 'rare',   art: 'smg' },
    { id: 'awm_frost',   cat: 'skin', kind: 'skin', n: 'AWM「极地」',       d: '极地白灰涂装，长枪管与弹匣同步换色。出战 AWM 时生效。',         delta: 180, r: 'epic',   art: 'sniper' },
    { id: 'm7_obsidian', cat: 'skin', kind: 'skin', n: 'M7「黑曜」',        d: '黑曜石配色 + 哑金护木，S1 首发战斗步枪专属。出战 M7 时生效。',   delta: 160, r: 'epic',   art: 'rifle' },
    { id: 'pkm_scorch',  cat: 'skin', kind: 'skin', n: 'PKM「焦土」',       d: '焦土焦褐涂装，弹链盒与枪管同步压暗。出战 PKM 时生效。',         delta: 150, r: 'rare',   art: 'lmg' },
    { id: 'm82_dune',    cat: 'skin', kind: 'skin', n: 'M82A1「沙丘」',     d: '沙丘金涂装，反器材狙击的赛季主推外观。出战 M82A1 时生效。',     delta: 220, r: 'legend', art: 'sniper', feat: true },
    { id: 'sks_amber',   cat: 'skin', kind: 'skin', n: 'SKS「琥珀」',       d: '琥珀木纹涂装，老枪新皮。出战 SKS 时生效。',                     delta: 130, r: 'rare',   art: 'rifle' },
    { id: 'vss_ghost',   cat: 'skin', kind: 'skin', n: 'VSS「幽灵」',       d: '哑光幽灵涂装，配合一体消音器几乎不留轮廓。出战 VSS 时生效。',   delta: 170, r: 'epic',   art: 'sniper' },

    /* ── 干员 ── */
    { id: 'op_bullot',   cat: 'op', kind: 'op', n: '干员「莽兽」档案',       d: 'S1 首发付费干员 · 重装突破型。购买即永久解锁出战（干员页可选）。', delta: 240, r: 'legend', art: 'badge', feat: true },

    /* ── 外观（头像框 / 呼号） ── */
    { id: 'frame_wujia',      cat: 'cosmetic', kind: 'frame', n: '头像框「吴家村守望者」', d: 'S1 赛季永久头像框 · 绿色守望光环。黑石行动任务奖励亦可获得。', delta: 60,  r: 'rare',   art: 'emblem' },
    { id: 'frame_blackstone', cat: 'cosmetic', kind: 'frame', n: '头像框「黑石铁壁」',     d: 'S1 主打头像框 · 猩红铁壁光环，比守望者更硬派。',               delta: 90,  r: 'epic',   art: 'emblem', feat: true },
    { id: 'frame_extractor',  cat: 'cosmetic', kind: 'frame', n: '头像框「撤离专家」',     d: '撤离老兵的证明 · 赤金双环头像框。',                             delta: 80,  r: 'rare',   art: 'emblem' },
    { id: 'name_gold',        cat: 'cosmetic', kind: 'namefx', n: '呼号特效「鎏金」',      d: '大厅顶部呼号变为鎏金描边并带柔光，永久生效。',                 delta: 100, r: 'epic',   art: 'badge' },

    /* ── 补给 ── */
    { id: 'safe_plus',   cat: 'supply', kind: 'safe', n: '扩容保险箱 +1 格',  d: '安全箱永久 +1 格（最多 +2，基础 2 格）。阵亡也保得住更多物资。', delta: 150, r: 'epic', art: 'square' }
  ];

  const SHOP_CATS = [
    { id: 'featured', n: '精选' },
    { id: 'skin',     n: '武器涂装' },
    { id: 'op',       n: '干员' },
    { id: 'cosmetic', n: '外观' },
    { id: 'supply',   n: '补给' }
  ];
  let shopCat = 'featured';
  let shopSel = (SHOP.find(i => i.feat) || SHOP[0]).id;

  const PART_LABEL_KEYS = ['body', 'body2', 'tan', 'wood', 'bakelite'];
  const PART_LABEL = { body: '机匣', body2: '枪身', tan: '护木', wood: '木托', bakelite: '胶木' };
  const priceHafu = item => Math.ceil(item.delta * HAFU_PER_DELTA / 100) * 100;
  const fmt = n => (n | 0).toLocaleString();

  function shopState(item) {
    const prof = (typeof DF !== 'undefined' && DF.Profile) ? DF.Profile.data : null;
    switch (item.kind) {
      case 'skin':   return { owned: !!(DF.skins && DF.skins.isOn(item.id)) };
      case 'op':     return { owned: loadOwnedOps().includes('bullot') };
      case 'frame':  return { owned: ownsFrame(item.id), equipped: frameId() === item.id };
      case 'namefx': return { owned: hasNameFx() };
      case 'safe': { const n = prof ? (prof.safeBonus | 0) : 0; return { owned: n >= 2, count: n }; }
      default:       return { owned: false };
    }
  }

  function buyItem(item, cur) {
    const st = shopState(item);
    if (item.kind === 'safe') {
      if ((DF.Profile.data.safeBonus | 0) >= 2) { toast('扩容保险箱已达上限（+2）'); return; }
    } else if (st.owned) {
      toast(item.kind === 'frame' ? `「${item.n}」已拥有（可在详情里重新装备）` : `「${item.n}」已拥有`);
      return;
    }
    const cost = cur === 'hafu' ? priceHafu(item) : item.delta;
    const bal = cur === 'hafu' ? (DF.Profile.data.bank | 0) : (DF.Profile.data.delta | 0);
    if (bal < cost) {
      toast(cur === 'hafu'
        ? `哈弗币不足：还差 ${fmt(cost - bal)}（撤离带出物资可获得哈弗币）`
        : `三角券不足：还差 ${cost - bal} 枚（大厅任务奖励可获得）`);
      return;
    }
    if (cur === 'hafu') DF.Profile.data.bank = bal - cost; else DF.Profile.data.delta = bal - cost;
    switch (item.kind) {
      case 'skin':   if (DF.skins) DF.skins.own(item.id); break;
      case 'op':     saveOwnedOps([...loadOwnedOps(), 'bullot']); break;
      case 'frame':  ownFrame(item.id); setFrame(item.id); break;
      case 'namefx': setNameFx(true); break;
      case 'safe':   DF.Profile.data.safeBonus = (DF.Profile.data.safeBonus | 0) + 1; break;
    }
    DF.Profile.save();
    const payTxt = cur === 'hafu' ? `${fmt(cost)} 哈弗币` : `${cost} 三角券`;
    toast(`「${item.n}」购买成功 · 已支付 ${payTxt}`);
    renderShop();
    renderOperators();
    renderTopBar();
    if (DF.renderProfile) DF.renderProfile();
    if (DF.syncViewModel) DF.syncViewModel();
  }

  /* 已拥有（不可再买）的商品也允许「装备」：头像框切换 / 涂装提示 */
  function equipItem(item) {
    if (item.kind === 'frame') {
      setFrame(item.id);
      toast(`已装备「${FRAMES[item.id].n}」头像框`);
    } else if (item.kind === 'skin') {
      toast(`「${item.n}」为自动应用，出战 ${item.n.split('「')[0]} 即可查看`);
    } else {
      return;
    }
    renderTopBar();
    renderShop();
  }

  function shopCard(item) {
    const st = shopState(item);
    const rar = RARITY[item.r] || RARITY.common;
    const pal = item.kind === 'skin' && DF.skins ? DF.skins.paletteOf(item.id) : null;
    const stroke = pal ? '#' + (pal.body | 0x101010).toString(16).padStart(6, '0') : rar.c;
    const swatch = pal
      ? `<div class="df-skinrow">${PART_LABEL_KEYS
          .filter(k => pal[k] != null)
          .map(k => `<i style="background:#${(pal[k] | 0x080808).toString(16).padStart(6, '0')}"></i>`).join('')}</div>`
      : '';
    const countNote = (item.kind === 'safe' && st.count > 0) ? ` <em>已购 ×${st.count}</em>` : '';
    return `
      <div class="df-shopcard r-${item.r}${item.id === shopSel ? ' sel' : ''}" data-id="${item.id}" role="button" tabindex="0" aria-label="${item.n}">
        <div class="df-rcorner"></div>
        <div class="art"><svg viewBox="0 0 200 64" width="100%" height="64" aria-hidden="true"><path d="${ART[item.art] || ART.rifle}" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg></div>
        ${swatch}
        <div class="df-rar" style="color:${rar.c}">${rar.n}${countNote}</div>
        <div class="n">${item.n}</div>
        <div class="d">${item.d}</div>
        <div class="df-price">
          <span class="c-delta">Δ ${item.delta}</span>
          <span class="c-hafu">H ${fmt(priceHafu(item))}</span>
        </div>
        <div class="df-buystate">${st.owned ? ((item.kind === 'frame' && frameId() === item.id) ? '使用中' : (item.kind === 'frame' ? '已拥有 · 可装备' : '已拥有')) : (item.kind === 'safe' ? `可购买 ×${st.count}` : '可购买')}</div>
      </div>`;
  }

  function renderShopDetail() {
    const side = $('shop-detail');
    if (!side) return;
    const item = SHOP.find(i => i.id === shopSel);
    if (!item) { side.innerHTML = ''; return; }
    const st = shopState(item);
    const rar = RARITY[item.r] || RARITY.common;
    const pal = item.kind === 'skin' && DF.skins ? DF.skins.paletteOf(item.id) : null;
    const stroke = pal ? '#' + (pal.body | 0x101010).toString(16).padStart(6, '0') : rar.c;
    const canBuy = item.kind === 'safe' ? (st.count < 2) : !st.owned;
    const equippedNow = item.kind === 'frame' && frameId() === item.id;
    const ownedFrameNotEq = item.kind === 'frame' && st.owned && !equippedNow;
    const hafu = priceHafu(item);
    const balDelta = DF.Profile ? (DF.Profile.data.delta | 0) : 0;
    const balHafu = DF.Profile ? (DF.Profile.data.bank | 0) : 0;
    side.innerHTML = `
      <div class="df-sd-head r-${item.r}">
        <div class="df-sd-art"><svg viewBox="0 0 200 64" width="100%" height="86" aria-hidden="true"><path d="${ART[item.art] || ART.rifle}" fill="none" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg></div>
        <div class="df-sd-rar" style="color:${rar.c}">${rar.n}</div>
        <div class="df-sd-name">${item.n}</div>
        <div class="df-sd-desc">${item.d}</div>
        ${pal ? `<div class="df-sd-pal">${PART_LABEL_KEYS.filter(k => pal[k] != null)
          .map(k => `<span><i style="background:#${(pal[k] | 0x080808).toString(16).padStart(6, '0')}"></i>${PART_LABEL[k]}</span>`).join('')}</div>` : ''}
        <div class="df-sd-btns">
          ${canBuy ? `
            <button class="df-sd-buy delta" data-buy="delta" data-id="${item.id}"><b>Δ ${item.delta}</b><span>用三角券 · 余 ${fmt(balDelta)}</span></button>
            <button class="df-sd-buy hafu" data-buy="hafu" data-id="${item.id}"><b>H ${fmt(hafu)}</b><span>用哈弗币 · 余 ${fmt(balHafu)}</span></button>`
          : `<button class="df-sd-buy owned" disabled><b>${equippedNow ? '使用中' : '已拥有'}</b><span>${item.kind === 'skin' ? '出战该枪即自动应用' : '无需重复购买'}</span></button>
             ${ownedFrameNotEq ? `<button class="df-sd-buy eq" data-eq="1" data-id="${item.id}"><b>装备</b><span>设为当前头像框</span></button>` : ''}`}
        </div>
        <div class="df-sd-note">汇率 1 三角券 = ${HAFU_PER_DELTA} 哈弗币 · 购买即时生效并永久保存</div>
      </div>`;
  }

  function renderShop() {
    const tabs = $('shop-tabs');
    const grid = $('shop-grid');
    if (!grid) return;
    if (tabs) {
      tabs.innerHTML = SHOP_CATS.map(c => {
        const n = c.id === 'featured' ? SHOP.filter(i => i.feat).length : SHOP.filter(i => i.cat === c.id).length;
        return `<button class="df-shoptab${c.id === shopCat ? ' active' : ''}" data-cat="${c.id}">${c.n}<em>${n}</em></button>`;
      }).join('');
      wireOnce(tabs, '__shopTabsWired', e => {
        const b = e.target.closest('.df-shoptab');
        if (!b) return;
        shopCat = b.getAttribute('data-cat');
        const first = shopList()[0];
        if (first) shopSel = first.id;
        renderShop();
      });
    }
    grid.innerHTML = shopList().map(shopCard).join('');
    wireOnce(grid, '__shopWired', e => {
      const card = e.target.closest('.df-shopcard');
      if (!card) return;
      shopSel = card.getAttribute('data-id');
      grid.querySelectorAll('.df-shopcard').forEach(c => c.classList.toggle('sel', c === card));
      renderShopDetail();
    });
    grid.querySelectorAll('.df-shopcard').forEach(c => {
      c.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); c.click(); } });
    });
    renderShopDetail();
    const side = $('shop-detail');
    wireOnce(side, '__shopSideWired', e => {
      const b = e.target.closest('.df-sd-buy');
      if (!b || b.disabled) return;
      const item = SHOP.find(x => x.id === b.getAttribute('data-id'));
      if (!item) return;
      if (b.hasAttribute('data-eq')) { equipItem(item); return; }
      const cur = b.getAttribute('data-buy');
      if (cur === 'delta' || cur === 'hafu') buyItem(item, cur);
    });
  }
  function shopList() {
    return shopCat === 'featured' ? SHOP.filter(i => i.feat) : SHOP.filter(i => i.cat === shopCat);
  }

  /* ---------- 初始化 ---------- */
  function init() {
    // 标签切换
    els('.df-rail-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    // 行动简报联动
    const sel = $('map-select');
    if (sel) sel.addEventListener('change', updateBrief);
    updateBrief();
    // 各面板内容
    renderOperators();
    /* 枪械库改由 10_gunsmith.js 渲染 */
    renderMissions();
    renderShop();
    renderTopBar();
    // data-toast 占位按钮
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-toast]');
      if (t) toast(t.getAttribute('data-toast'));
    });
    // Enter 快速开始（焦点不在输入控件上时）
    window.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const menu = $('menu');
      if (!menu || menu.classList.contains('hidden')) return;
      const ae = document.activeElement;
      if (ae && ae.matches('input,select,textarea,button')) return;
      const b = $('btn-single');
      if (b) { e.preventDefault(); b.click(); }
    });
    // 结算/对局结束回到大厅时刷新档案
    if (typeof DF !== 'undefined' && DF.quitToMenu) {
      const _quit = DF.quitToMenu;
      DF.quitToMenu = function () {
        const r = _quit.apply(this, arguments);
        switchTab('lobby');
        if (typeof DF.renderProfile === 'function') DF.renderProfile();
        renderMissions();
        renderTopBar();
        return r;
      };
    }
    if (typeof DF !== 'undefined' && DF.renderProfile) DF.renderProfile();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
