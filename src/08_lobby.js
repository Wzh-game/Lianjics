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
  const hasFrame = () => { try { return localStorage.getItem(FRAME_KEY) === '1'; } catch (e) { return false; } };
  const setFrame = v => { try { localStorage.setItem(FRAME_KEY, v ? '1' : '0'); } catch (e) { } };

  /* ---------- 干员 ---------- */
  const OPERATORS = [
    { id: 'hwolf',  name: '红狼', en: 'D-WOLF',  role: '突击 · 进攻核心', desc: '近距离爆发见长的突击干员，适合正面打开突破口，搜打撤老手之选。', power: 82, c1: '#ff8c1a', c2: '#5a3410' },
    { id: 'bullot', name: '莽兽', en: 'BULLET',  role: '重装 · 突破',     desc: 'S1 首发付费干员。重装突破型，购买即永久解锁出战。',             power: 78, c1: '#d06a6a', c2: '#3e1616', premium: true, price: 240 },
    { id: 'weilong',name: '威龙', en: 'STRIKER', role: '突击 · 均衡型',   desc: '无明显短板的标准答案，从新手到老兵都能稳定发挥的万金油。',     power: 74, c1: '#e0d060', c2: '#4a4218' },
    { id: 'fengyi', name: '蜂医', en: 'SHEPHERD',role: '支援 · 救援',     desc: '战场上最值得信赖的生命线，专注于拉人、保人、把队友带出撤离点。', power: 68, c1: '#7dd069', c2: '#1e3a1c' },
    { id: 'gu',     name: '蛊',   en: 'TOX',     role: '工兵 · 破障',     desc: '以装备与陷阱掌控地形，擅长把敌人逼进自己铺好的杀戮区。',       power: 71, c1: '#c07ad8', c2: '#33203e' },
    { id: 'luna',   name: '露娜', en: 'LUNA',    role: '侦察 · 信息',     desc: '掌握战场视野的人，才能掌握战局走向。开镜即索敌，信息即胜利。', power: 65, c1: '#6ac3d8', c2: '#163a44' },
    { id: 'shendan',name: '深蓝', en: 'DEEPBLUE',role: '工程 · 防御',     desc: '防线的守护者，擅长在要点扎根、架设防御并反守为攻。',           power: 70, c1: '#8a9bd0', c2: '#1f2740' }
  ];

  function opIcon(o, size) {
    return `<svg class="df-opicon" viewBox="0 0 64 64" width="58" height="58" aria-hidden="true">
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
        <div class="df-opname">${o.name}${locked ? ' <span class="df-oplock">🔒</span>' : ''}</div>
        <div class="df-oprole">${o.role} · ${o.en}</div>
        <div class="df-opdesc">${locked ? '商城购买「干员『' + o.name + '』档案 · ' + (o.price || 0) + ' 三角券 即可解锁出战。' : o.desc}</div>
        <div class="df-opbar"><span>战力</span><div class="bar"><i style="width:${o.power}%"></i></div><span>${o.power}</span></div>
      </div>`;
    }).join('');
    wireOnce(grid, '__opsWired', e => {
      const card = e.target.closest('.df-opcard');
      if (!card) return;
      const opId = card.getAttribute('data-op');
      const op = OPERATORS.find(o => o.id === opId);
      if (op && op.premium && !loadOwnedOps().includes(op.id)) {
        toast(`「${op.name}」未解锁：商城购买「干员『${op.name}』档案」（${op.price || 0} 三角券）`);
        return;
      }
      sel = opId;
      try { localStorage.setItem('df_operator', sel); } catch (err) { }
      grid.querySelectorAll('.df-opcard').forEach(c => c.classList.toggle('sel', c.getAttribute('data-op') === sel));
      toast(`已选择干员「${op ? op.name : sel}」`);
    });
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
      svg: '<rect x="22" y="26" width="86" height="11" rx="2"/><rect x="108" y="28" width="40" height="6"/><rect x="148" y="27" width="26" height="8" rx="3"/><rect x="50" y="37" width="8" height="15" transform="rotate(8 54 37)"/><rect x="16" y="24" width="10" height="16"/><rect x="58" y="20" width="10" height="6"/><path d="M70 37l5 11h5l-3-11z"/>' }
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
        ${g.owned ? '<div class="df-own">✓ 已入库 · 可出勤</div>' : `<div class="df-lock">🔒 ${g.req}</div>`}
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
    if (av) av.classList.toggle('framed', hasFrame());
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

  /* ---------- 商城（四件实物商品：钱货两讫，持久化生效） ---------- */
  const SHOP = [
    { id: 'op_bullot', n: '干员「莽兽」档案', d: 'S1 首发付费干员 · 重装突破型。购买即永久解锁出战（干员页可选）。', p: '240 三角券', price: 240, color: '#d06a6a', glyph: 'M32 10 50 22v18L32 54 14 40V22Z' },
    { id: 'm4a1_sand', n: 'M4A1「沙暴」涂装', d: '沙暴迷彩战术涂装。购买后 M4A1 持枪模型自动换装沙暴配色。', p: '120 三角券', price: 120, color: '#e0b45a', glyph: 'M12 34h96l10-14h14v12l10 2v6h-18l-8 8h-8l4-8H24l-4 8H10z' },
    { id: 'frame_wujia', n: '头像框「吴家村守望者」', d: 'S1 赛季永久头像框，点亮大厅头像。黑石行动任务奖励亦可获得。', p: '60 三角券', price: 60, color: '#7dd069', glyph: 'M32 8 52 18v26L32 56 12 44V18Z' },
    { id: 'safe_plus', n: '扩容保险箱 +1 格', d: '安全箱永久 +1 格（最多 +2，当前基础 2 格 + 已购扩容）。阵亡也保得住更多物资。', p: '150 三角券', price: 150, color: '#c9a25a', glyph: 'M14 26h36v20H14zM50 30h12v12H50zM22 20h4v6h-4zM34 20h4v6h-4z' }
  ];
  const shopItemState = item => {
    const prof = (typeof DF !== 'undefined' && DF.Profile) ? DF.Profile.data : null;
    switch (item.id) {
      case 'op_bullot': return { owned: loadOwnedOps().includes('bullot') };
      case 'm4a1_sand': return { owned: !!(DF.skins && DF.skins.owned().includes('m4a1_sand')) };
      case 'frame_wujia': return { owned: hasFrame() };
      case 'safe_plus': { const n = prof ? (prof.safeBonus | 0) : 0; return { owned: n >= 2, count: n }; }
      default: return { owned: false };
    }
  };
  function buyItem(item) {
    const st = shopItemState(item);
    if (item.id === 'safe_plus') {
      if ((DF.Profile.data.safeBonus | 0) >= 2) { toast('扩容保险箱已达上限（+2）'); return; }
    } else if (st.owned) { toast(`「${item.n}」已拥有`); return; }
    const price = item.price | 0;
    const delta = DF.Profile.data.delta | 0;
    if (delta < price) { toast(`三角券不足：还差 ${price - delta} 枚（对局任务可获取）`); return; }
    DF.Profile.data.delta = delta - price;
    switch (item.id) {
      case 'op_bullot': saveOwnedOps([...loadOwnedOps(), 'bullot']); break;
      case 'm4a1_sand': if (DF.skins) DF.skins.own('m4a1_sand'); break;
      case 'frame_wujia': setFrame(true); break;
      case 'safe_plus': DF.Profile.data.safeBonus = (DF.Profile.data.safeBonus | 0) + 1; break;
    }
    DF.Profile.save();
    toast(`「${item.n}」购买成功`);
    renderShop();
    renderOperators();
    renderTopBar();
    if (DF.renderProfile) DF.renderProfile();
    if (DF.syncViewModel) DF.syncViewModel();
  }
  function renderShop() {
    const grid = $('shop-grid');
    if (!grid) return;
    grid.innerHTML = SHOP.map(s => {
      const st = shopItemState(s);
      const countNote = (s.id === 'safe_plus' && st.count > 0) ? `（已购 ×${st.count}）` : '';
      const btn = st.owned ? '已 拥 有' : '购 买';
      return `
      <div class="df-shopcard">
        <div class="art"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><path d="${s.glyph}" fill="none" stroke="${s.color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg></div>
        <div class="n">${s.n}</div>
        <div class="d">${s.d}</div>
        <div class="df-price">${s.p}${countNote}</div>
        <button class="df-buy" data-id="${s.id}" ${st.owned ? 'disabled' : ''}>${btn}</button>
      </div>`;
    }).join('');
    wireOnce(grid, '__shopWired', e => {
      const btn = e.target.closest('.df-buy');
      if (!btn || btn.disabled) return;
      const item = SHOP.find(x => x.id === btn.getAttribute('data-id'));
      if (item) buyItem(item);
    });
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
