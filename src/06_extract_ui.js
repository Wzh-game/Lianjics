/* ============================================================
   搜打撤 —— 交互与界面逻辑（本地/UI 侧）
   ============================================================ */

DF.searchMarkers = DF.searchMarkers || [];

/* ---------------- 音频补充 ---------------- */
DF.Audio.playSearchSound = function () { this.noise(0.08, 0.10, 1600, 'bandpass'); };
DF.Audio.loot = function () { this.thump(880, 0.10, 0.05); setTimeout(() => this.thump(1320, 0.09, 0.06), 55); };
DF.Audio.extract = function () {
  this.thump(440, 0.16, 0.14);
  setTimeout(() => this.thump(660, 0.15, 0.16), 130);
  setTimeout(() => this.thump(880, 0.14, 0.22), 280);
};
DF.Audio.warn = function () { this.thump(300, 0.18, 0.12); setTimeout(() => this.thump(220, 0.16, 0.18), 140); };

/* ============================================================
   每帧：搜索进度 / 撤离进度 / 提示
   ============================================================ */
DF.updateExtractHUD = function (dt) {
  const me = DF.players.get(DF.myId);
  if (!me) return;
  const hint = document.getElementById('lootHint');
  const searchbar = document.getElementById('searchbar');
  const touchSearch = document.getElementById('t-interact');
  if (touchSearch) {
    const canSearch = DF.touch.enabled && DF.matchRunning && me.alive && !DF.paused && !DF.lootOpen;
    const near = canSearch && !me.searching && DF.nearestContainer(me, 3.2);
    touchSearch.classList.toggle('hidden', !canSearch || (!near && !me.searching));
    touchSearch.disabled = !!me.searching;
    touchSearch.textContent = me.searching ? '搜索中…' : '搜索';
  }

  /* ----- 搜索中 ----- */
  if (me.searching) {
    const c = DF.containersById[me.searching.id];
    const total = c ? CONTAINER_TYPES[c.type].search : 1;
    const left = me.searching.endAt - DF.time;
    searchbar.classList.add('on');
    searchbar.querySelector('i').style.width = Math.round((1 - clamp(left / total, 0, 1)) * 100) + '%';
    hint.classList.add('on');
    document.getElementById('lootHint').querySelector('b').textContent = '…';
    document.getElementById('lootHintTxt').textContent = '搜索中 ' + (c ? CONTAINER_TYPES[c.type].label : '');
    if (left <= 0) {
      searchbar.classList.remove('on');
      if (c) DF.completeSearch(c);
    }
  } else if (!DF.lootOpen) {
    searchbar.classList.remove('on');
    /* ----- 附近容器提示 ----- */
    const near = DF.nearestContainer(me, 3.2);
    if (near && me.alive && !DF.paused) {
      hint.classList.add('on');
      document.getElementById('lootHint').querySelector('b').textContent = DF.touch.enabled ? '触控' : 'F';
      document.getElementById('lootHintTxt').textContent = '搜索 ' + CONTAINER_TYPES[near.type].label;
    } else {
      hint.classList.remove('on');
    }
  } else {
    hint.classList.remove('on');
    searchbar.classList.remove('on');
  }

  /* ----- 撤离进度 ----- */
  const ep = document.getElementById('extractPanel');
  let inZone = null;
  if (DF.extracts && me.alive) {
    for (const ex of DF.extracts) {
      if (!ex.open) continue;
      if (Math.hypot(me.pos.x - ex.x, me.pos.z - ex.z) <= ex.radius) { inZone = ex; break; }
    }
  }
  if (inZone) {
    const pr = (me.exProgress && me.exProgress[inZone.id]) || 0;
    ep.classList.add('on');
    ep.querySelector('.ttl').textContent = inZone.name + ' · 撤离中';
    ep.querySelector('.bar i').style.width = Math.round(clamp(pr / 10, 0, 1) * 100) + '%';
    ep.querySelector('.tip').textContent = `站住 ${Math.ceil(Math.max(0, 10 - pr))} 秒 · 撤离位置已暴露给全图`;
  } else {
    ep.classList.remove('on');
  }

  /* ----- 撤离点接近提示（未开放） ----- */
  if (DF.extracts && me.alive && !inZone) {
    for (const ex of DF.extracts) {
      const d = Math.hypot(me.pos.x - ex.x, me.pos.z - ex.z);
      if (d < ex.radius + 7) {
        if (!ex.open) {
          const left = Math.ceil(ex.openAt - DF.matchTime);
          if (!ex._nearToast || DF.time - ex._nearToast > 3) {
            ex._nearToast = DF.time;
            DF.toast(`${ex.name} 尚未开放，还需 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
          }
        }
        break;
      }
    }
  }

  /* ----- 顶部状态条 ----- */
  const rb = document.getElementById('raidbar');
  if (rb) {
    const tl = DF.getTimeLeft();
    const openCount = DF.extracts ? DF.extracts.filter(e => e.open).length : 0;
    const myVal = DF.bagValue(me) + DF.safeValue(me);
    const nextEx = DF.extracts ? DF.extracts.filter(e => !e.open).sort((a, b) => a.openAt - b.openAt)[0] : null;
    const nextTxt = nextEx
      ? `下一撤离点 ${Math.floor(Math.max(0, nextEx.openAt - DF.matchTime) / 60)}:${String(Math.floor(Math.max(0, nextEx.openAt - DF.matchTime)) % 60).padStart(2, '0')}`
      : '全部撤离点已开放';
    rb.innerHTML =
      `<span class="chip">⏱ <b>${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}</b></span>` +
      `<span class="chip">🎒 <b style="color:#ffb347">$${myVal.toLocaleString()}</b> · ${DF.bagSlotsUsed(me)}/${BAG_SLOTS}</span>` +
      `<span class="chip ${openCount ? 'hot' : ''}">🚪 撤离点 ${openCount}/${DF.extracts ? DF.extracts.length : 0}</span>` +
      `<span class="chip" style="font-size:11px">${nextTxt}</span>`;
  }
};

/* ============================================================
   交互按键
   ============================================================ */
DF.tryInteract = function () {
  if (!DF.matchRunning || DF.paused) return;
  if (DF.lootOpen) { DF.closeLootUI(); return; }
  const me = DF.players.get(DF.myId);
  if (!me || !me.alive) return;
  if (me.searching) return;
  // 载具优先：车内→下车；车旁→上车
  if (DF.driveVehicle) { DF.exitVehicle(); return; }
  const nv = DF.nearestVehicle ? DF.nearestVehicle(me, 2.6) : null;
  if (nv) { DF.enterVehicle(nv); return; }
  const near = DF.nearestContainer(me, 3.2);
  if (near) { DF.startSearch(near); return; }
  DF.toast('附近没有可搜索的容器');
};

/* ============================================================
   拾取界面
   ============================================================ */
DF.lootOpen = false;

DF.openLootUI = function (c) {
  DF.lootOpen = true;
  document.body.classList.add('loot-active');
  // 避免进入面板时仍在奔跑或开火；战场与 AI 不暂停。
  if (DF.touch) {
    DF.touch.f = 0; DF.touch.s = 0; DF.touch.mag = 0;
    DF.touch.joyId = null; DF.touch.lookId = null; DF.touch.fireHeld = false;
    const joy = document.getElementById('joy'); if (joy) joy.classList.remove('active');
    const knob = document.getElementById('joyknob'); if (knob) knob.style.transform = '';
  }
  if (DF.input) {
    DF.input.fire = false; DF.input.jumpQueued = false; DF.input.reload = false;
    DF.input.tdx = 0; DF.input.tdy = 0;
  }
  DF.lootContainer = c;
  document.getElementById('lootPanel').classList.remove('hidden');
  document.getElementById('lootTitle').textContent = c ? CONTAINER_TYPES[c.type].label : '背包';
  document.getElementById('lootSub').textContent = c
    ? '把值钱的东西装进背包；贵重物品可以放进保险箱（阵亡后仍保留）'
    : '背包与保险箱';
  DF.refreshLootUI();
  // 触屏 / 未锁定指针时，先释放鼠标以便点击
  if (!DF.touch.enabled && document.pointerLockElement) document.exitPointerLock();
};

DF.closeLootUI = function () {
  DF.lootOpen = false;
  document.body.classList.remove('loot-active');
  DF.lootContainer = null;
  document.getElementById('lootPanel').classList.add('hidden');
  const me = DF.players.get(DF.myId);
  if (me) { if (me.inv) me.inv.items = []; me.currentContainer = null; }
  if (!DF.touch.enabled && DF.matchRunning && !DF.matchOver) {
    DF.requestPointerLockSafe(DF.renderer.domElement);
  }
};

DF.refreshLootUI = function () {
  const me = DF.players.get(DF.myId);
  if (!me || !me.inv) return;

  /* 容器内物资 */
  const box = document.getElementById('lootItems');
  if (!me.inv.items.length) {
    box.innerHTML = '<div style="font-size:12px;color:#7a8a6a;padding:8px 0">容器已空</div>';
  } else {
    box.innerHTML = me.inv.items.map((it, i) => {
      const d = LOOT[it.key];
      return `<div class="lootitem ${it.taken ? 'taken' : ''}">
        <span class="dot" style="background:${d.color}"></span>
        <span class="nm">${d.name}<span style="color:#7a8a6a;font-size:10.5px"> · ${d.size}格</span></span>
        <span class="pr">$${d.value.toLocaleString()}</span>
        ${it.taken ? '<span class="act" style="opacity:.5">已拾取</span>' : `<button data-take="${i}">拾取</button>`}
      </div>`;
    }).join('');
    box.querySelectorAll('button[data-take]').forEach(b => {
      b.onclick = () => DF.takeItem(parseInt(b.getAttribute('data-take'), 10));
    });
  }

  /* 背包 */
  const used = DF.bagSlotsUsed(me);
  document.getElementById('bagCount').textContent = used + '/' + BAG_SLOTS;
  const grid = document.getElementById('bagGrid');
  let html = '';
  let slotUsed = 0;
  me.inv.bag.forEach((it, idx) => {
    const d = LOOT[it.key];
    if (slotUsed >= BAG_SLOTS) return;
    slotUsed += d.size;
    html += `<div class="bagslot filled" data-bag="${idx}" title="${d.name} · $${d.value}">
      <span class="sq" style="background:${d.color}"></span>
      <span class="nl">${d.short}</span>
      <span class="vl">$${d.value >= 1000 ? (d.value / 1000).toFixed(1) + 'k' : d.value}</span>
    </div>`;
  });
  for (let i = slotUsed; i < BAG_SLOTS; i++) html += '<div class="bagslot">空</div>';
  grid.innerHTML = html;
  grid.querySelectorAll('[data-bag]').forEach(el => {
    el.onclick = () => DF.showItemActions(parseInt(el.getAttribute('data-bag'), 10));
  });

  /* 保险箱 */
  document.getElementById('safeCount').textContent = me.inv.safe.length + '/' + SAFE_SLOTS;
  const sg = document.getElementById('safeGrid');
  let sh = me.inv.safe.map(it => {
    const d = LOOT[it.key];
    return `<div class="safeslot"><span class="sq" style="background:${d.color}"></span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${d.short}</span>
      <span style="color:#ffb347;font-size:10.5px">$${d.value >= 1000 ? (d.value / 1000).toFixed(1) + 'k' : d.value}</span></div>`;
  }).join('');
  for (let i = me.inv.safe.length; i < SAFE_SLOTS; i++) sh += '<div class="safeslot" style="opacity:.45;justify-content:center">空</div>';
  sg.innerHTML = sh;

  /* 价值 */
  document.getElementById('bagValue').textContent = '$' + DF.bagValue(me).toLocaleString();
  document.getElementById('safeValue').textContent = '$' + DF.safeValue(me).toLocaleString();
};

/* 背包物品操作（点击弹出小菜单） */
DF.showItemActions = function (idx) {
  const me = DF.players.get(DF.myId);
  if (!me || !me.inv.bag[idx]) return;
  const d = LOOT[me.inv.bag[idx].key];
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:36;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
  wrap.innerHTML = `<div style="background:#141a10;border:1px solid #4a5a38;padding:18px 22px;min-width:240px;text-align:center">
    <div style="font-size:15px;margin-bottom:4px">${d.name}</div>
    <div style="font-size:12px;color:#9aa78a;margin-bottom:12px">价值 $${d.value.toLocaleString()} · 占 ${d.size} 格</div>
    <div class="row" style="justify-content:center">
      ${d.heal ? '<button class="btn small primary" data-a="use">使用</button>' : ''}
      <button class="btn small" data-a="safe">放入保险箱</button>
      <button class="btn small" data-a="drop">丢弃</button>
      <button class="btn small" data-a="cancel">取消</button>
    </div></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => {
    const a = e.target.getAttribute && e.target.getAttribute('data-a');
    if (a === 'use') DF.useItem(idx);
    else if (a === 'safe') DF.moveToSafe(idx);
    else if (a === 'drop') DF.dropItem(idx);
    if (a) { document.body.removeChild(wrap); }
    else if (e.target === wrap) document.body.removeChild(wrap);
  });
};

/* ============================================================
   撤离 / 阵亡 结算
   ============================================================ */
DF.M.onLocalExtracted = function (p, ex, value) {
  DF.Audio.extract();
  DF.showRaidResult(true, {
    value, exName: ex.name, kills: p.kills,
    bag: DF.bagValue(p), safe: DF.safeValue(p)
  });
  DF.net && DF.net.role === 'guest' && DF.net._sendRel({ t: 'exdone', v: value });
};

DF.showRaidResult = function (ok, info) {
  DF.matchRunning = false;
  DF.matchOver = true;
  DF.showHUD(false);
  DF.hide('respawn');
  if (DF.lootOpen) DF.closeLootUI();
  if (document.pointerLockElement) document.exitPointerLock();

  const box = document.getElementById('extractResult');
  box.classList.remove('hidden', 'live', 'dead');
  box.classList.add(ok ? 'live' : 'dead');
  document.getElementById('erTitle').textContent = ok ? '撤 离 成 功' : '任 务 失 败';
  document.getElementById('erSub').textContent = ok
    ? `你从「${info.exName}」安全撤离，物资已入库`
    : (info.killer ? `你被 ${info.killer} 击杀，背包物资已丢失` : '你阵亡了，背包物资已丢失');

  const gainEl = document.getElementById('erGain');
  if (ok) {
    gainEl.classList.remove('lost');
    gainEl.textContent = '+$' + info.value.toLocaleString();
  } else {
    gainEl.classList.add('lost');
    gainEl.textContent = '-$' + (info.lost || 0).toLocaleString();
  }

  const prof = DF.Profile.data;
  document.getElementById('erRows').innerHTML = `
    <div><span>本局击杀</span><b>${info.kills || 0}</b></div>
    <div><span>撤离点</span><b>${ok ? info.exName : '—'}</b></div>
    <div><span>背包物资</span><b>$${(info.bag || 0).toLocaleString()}</b></div>
    <div><span>保险箱（保留）</span><b style="color:#ffb347">$${(info.safe || 0).toLocaleString()}</b></div>
    <div><span>资产变动</span><b>${ok ? '+' : '-'}$${(ok ? info.value : (info.lost || 0)).toLocaleString()}</b></div>`;
  document.getElementById('erProfile').innerHTML = `
    <div><div class="k">总资产</div><div class="v">$${prof.bank.toLocaleString()}</div></div>
    <div><div class="k">成功撤离</div><div class="v">${prof.extracted}</div></div>
    <div><div class="k">阵亡</div><div class="v" style="color:#c05a4a">${prof.died}</div></div>
    <div><div class="k">最高单局</div><div class="v">$${prof.best.toLocaleString()}</div></div>`;
  box.classList.remove('hidden');
};

DF.M.onLocalRaidDeath = function (attackerName) {
  const me = DF.players.get(DF.myId);
  if (!me) return;
  const lost = DF.bagValue(me);
  const safeKept = DF.safeValue(me);
  DF.Profile.addDeath(me.kills, DF.mapId);
  // 保险箱价值仍然入库（撤离失败也保留）
  if (safeKept > 0) { DF.Profile.data.bank += safeKept; DF.Profile.save(); }
  DF.showRaidResult(false, {
    killer: attackerName || '敌人', kills: me.kills,
    bag: lost, safe: safeKept, lost: lost
  });
};

/* ============================================================
   主菜单：资产档案 + 图例
   ============================================================ */
DF.renderProfile = function () {
  const p = DF.Profile.data;
  const el = document.getElementById('profile-box');
  if (!el) return;
  el.innerHTML = `
    <div><div class="k">总资产</div><div class="v">$${p.bank.toLocaleString()}</div></div>
    <div><div class="k">成功撤离</div><div class="v">${p.extracted}</div></div>
    <div><div class="k">阵亡</div><div class="v" style="color:#c05a4a">${p.died}</div></div>
    <div><div class="k">最高单局</div><div class="v">$${p.best.toLocaleString()}</div></div>`;
};
