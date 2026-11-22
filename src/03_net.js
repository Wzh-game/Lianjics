/* ============================================================
   三角洲行动 · 网页版  —— 网络层
   WebRTC DataChannel（手动 SDP 交换，无需信令服务器）
   房主权威（host-authoritative）：房主模拟全部玩家与机器人，
   20Hz 广播快照；客户端 30Hz 上报输入并做本地预测。

   通道设计：双方各自建立「可靠 + 高速」两条通道，任意已打开的
   通道都可收发，按消息类型选择可靠/高速通道。这样无论谁的通道
   先打开、标签如何，都能正常通信。
   ============================================================ */

const RTC_CFG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ],
  iceCandidatePoolSize: 2
};

function b64enc(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/=+$/, '');
}
function b64dec(str) {
  str = str.trim().replace(/\s+/g, '');
  if (str.indexOf('DF1|') === 0) str = str.slice(4);
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return decodeURIComponent(escape(atob(str)));
}
// DF2 将 SDP 压缩后用 URL 安全的 Base64 编码；旧版 DF1 仍可读取。
// SDP 已包含收集到的 ICE 候选，不再重复附带一份候选列表。
DF.encodeSDP = async (obj) => {
  const json = JSON.stringify({ type: obj.type, sdp: obj.sdp });
  if (typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined') {
    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate'));
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return 'DF2|' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (_) { /* 旧浏览器退回无压缩格式 */ }
  }
  return 'DF1|' + b64enc(json);
};
DF.decodeSDP = async (code) => {
  code = code.trim().replace(/\s+/g, '');
  if (!code.startsWith('DF2|')) return JSON.parse(b64dec(code));
  if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持短邀请码，请更新浏览器');
  let data = code.slice(4).replace(/-/g, '+').replace(/_/g, '/');
  while (data.length % 4) data += '=';
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return JSON.parse(await new Response(stream).text());
};

function waitIce(pc, maxMs) {
  return new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') return resolve();
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    const t = setTimeout(fin, maxMs || 4000);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); fin(); }
    });
  });
}

function newPC() {
  const pc = new RTCPeerConnection(RTC_CFG);
  pc._ice = [];
  pc.onicecandidate = (e) => {
    if (e.candidate && pc._ice) pc._ice.push(e.candidate.toJSON());
  };
  return pc;
}

/* ============================================================
   Net 管理器
   ============================================================ */
DF.Net = function () {
  this.role = null;         // solo | host | guest
  this.clients = new Map(); // playerId -> slot
  this.slots = [];          // host 侧槽位
  this.tickTimer = null;
  this.lastTick = 0;
  this.snapBuf = [];
  this.lastInputSent = 0;
  this.rtt = 0;
  this.pingTimer = null;
  this.slotCounter = 0;
  this.connected = false;
  this.myPlayerId = 'local';
  this.chans = [];          // guest 侧通道
  this.guestPc = null;
  this.scoreList = [];
  this.timeLeft = CFG.timeLimit;
};

const Net = DF.Net.prototype;

/* ---------------- 通道工具 ---------------- */
function attachChan(owner, ch, onMsg, onOpen) {
  owner.chans.push(ch);
  ch.onopen = () => onOpen && onOpen(ch);
  ch.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    onMsg(m);
  };
  if (ch.readyState === 'open') onOpen && onOpen(ch);
}
function pickChan(chans, reliable) {
  // 优先匹配可靠性，否则退回任意已打开通道
  for (const ch of chans) {
    if (ch.readyState !== 'open') continue;
    const isRel = ch.ordered && ch.maxRetransmits == null;
    if (reliable ? isRel : !isRel) return ch;
  }
  for (const ch of chans) if (ch.readyState === 'open') return ch;
  return null;
}
Net._sendOn = function (chans, obj, reliable) {
  const ch = pickChan(chans, reliable);
  if (!ch) return false;
  try { ch.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); return true; }
  catch (e) { return false; }
};

/* ---------------- 房主：创建槽位邀请码 ---------------- */
Net.createSlot = async function () {
  const slotId = ++this.slotCounter;
  const pc = newPC();
  const slot = {
    id: 'slot' + slotId, pc, chans: [], player: null, accepted: false,
    connected: false, offer: null, onState: null
  };
  this.slots.push(slot);

  // 房主侧也建通道（保证 offer 有 m-line）；双方通道都可用
  const cRel = pc.createDataChannel('h-rel', { ordered: true });
  const cFast = pc.createDataChannel('h-fast', { ordered: false, maxRetransmits: 0 });
  const onMsg = (m) => this._hostHandleMessage(slot, m);
  const onOpen = () => { slot.peerOpen = true; if (slot.onState) slot.onState(slot.connected ? 'connected' : 'peer-open'); };
  attachChan(slot, cRel, onMsg, onOpen);
  attachChan(slot, cFast, onMsg, onOpen);
  pc.ondatachannel = (ev) => {
    attachChan(slot, ev.channel, onMsg, onOpen);
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIce(pc);
  slot.offer = { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
  pc._ice = null;

  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (slot.onState) slot.onState(st);
    if (st === 'failed' || st === 'closed' || st === 'disconnected') this._hostDropSlot(slot, st);
  };
  return slot;
};

Net.slotOfferCode = function (slot) {
  return DF.encodeSDP(slot.offer);
};

Net.acceptAnswer = async function (slot, answerCode) {
  let ans;
  try { ans = await DF.decodeSDP(answerCode); } catch (e) { throw new Error(e.message.includes('不支持短邀请码') ? e.message : '回复码格式错误，请确认复制完整'); }
  if (!ans || ans.type !== 'answer' || !ans.sdp) throw new Error('回复码无效');
  await slot.pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp });
  if (ans.ice) for (const c of ans.ice) { try { await slot.pc.addIceCandidate(c); } catch (e) { } }
  slot.accepted = true;
  if (slot.onState) slot.onState('accepted');
};

Net._hostSend = function (slot, obj, reliable) {
  return this._sendOn(slot.chans, obj, reliable !== false);
};

Net._hostHandleMessage = function (slot, m) {
  const pl = slot.player;
  switch (m.t) {
    case 'hello': {
      const first = !slot.connected;
      slot.connected = true;
      if (!slot.player) this._hostAdmit(slot, m.name);
      if (first && slot.onState) slot.onState('connected');
      break;
    }
    case 'in': {
      if (!pl || !pl.alive) break;
      pl.input.f = m.f || 0;
      pl.input.s = m.s || 0;
      pl.input.jump = !!m.j;
      pl.input.crouch = !!m.c;
      pl.input.ads = !!m.a;
      pl.input.sprint = !!m.sp;
      pl.yaw = m.y; pl.pitch = m.p;
      pl.netSeq = m.q;
      pl.lastPacket = DF.time;
      // 位置纠偏：客人上报位置与房主模拟结果差距过大时校正
      if (typeof m.x === 'number' && typeof m.z === 'number') {
        const dx = m.x - pl.pos.x, dz = m.z - pl.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1.6) {
          // 瞬移/长距离漂移：直接采纳（避免客人卡在墙里或位置不同步）
          pl.pos.x = clamp(m.x, -CFG.mapHalf + 2, CFG.mapHalf - 2);
          pl.pos.z = clamp(m.z, -CFG.mapHalf + 2, CFG.mapHalf - 2);
          pl.vel.set(0, 0, 0);
        } else if (dist > 0.45) {
          pl.pos.x += dx * 0.35;
          pl.pos.z += dz * 0.35;
        }
      }
      if (m.r) this._hostGuestReload(pl);
      if (m.f2) this._hostGuestFire(pl, m);
      break;
    }
    case 'ping': this._hostSend(slot, { t: 'pong', ts: m.ts }, true); break;
    case 'chat': {
      const nm = pl ? pl.name : '访客', col = pl ? pl.color : '#aaa';
      DF.M.onChat && DF.M.onChat(nm, m.msg, col, false);
      this.hostBroadcast({ t: 'chat', n: nm, c: col, m: String(m.msg).slice(0, 80) });
      break;
    }
  }
};

Net._hostAdmit = function (slot, name) {
  const active = Array.from(this.clients.values()).filter(c => c.player);
  if (active.length >= CFG.maxClients) {
    this._hostSend(slot, { t: 'full' }, true);
    return;
  }
  const id = 'r' + (++__pid);
  const spawn = DF.pickSpawn();
  const p = DF.createPlayer({
    id, name: (name || '玩家').slice(0, 12),
    color: CFG.colors[(active.length + 1) % CFG.colors.length], spawn
  });
  p.input = { f: 0, s: 0, jump: false, crouch: false, ads: false, sprint: false, fire: false };
  p.netSeq = 0; p.lastPacket = DF.time;
  DF.players.set(id, p);
  DF.attachMesh(p, DF.scene);
  slot.player = p;
  slot.id = id;
  this.clients.set(id, slot);

  this._hostSend(slot, {
    t: 'welcome', id, spawn: [p.pos.x, p.pos.y, p.pos.z],
    roster: this._roster(), kt: CFG.killTarget,
    timeLeft: Math.max(0, CFG.timeLimit - (DF.matchTime || 0)),
    running: !!DF.matchRunning
  }, true);
  DF.M.onRoster && DF.M.onRoster();
  DF.toast && DF.toast(`${p.name} 加入了战斗`);
  this.hostBroadcast({ t: 'sys', m: `${p.name} 加入了战斗` });
  // 如果战斗已进行，通知客人开局
  if (DF.matchRunning) this._hostSend(slot, { t: 'start', map: DF.mapId, kt: CFG.killTarget, tl: this.timeLeft }, true);
};

Net._hostDropSlot = function (slot, why) {
  if (slot.dropped) return;
  slot.dropped = true;
  this.slots = this.slots.filter(s => s !== slot);
  if (slot.player) {
    const p = slot.player;
    DF.players.delete(p.id);
    DF.detachMesh(p, DF.scene);
    this.clients.delete(p.id);
    DF.M.onRoster && DF.M.onRoster();
    DF.toast && DF.toast(`${p.name} 离开了战斗`);
    this.hostBroadcast({ t: 'sys', m: `${p.name} 离开了战斗` });
  }
  try { slot.pc.close(); } catch (e) { }
};

Net._hostGuestFire = function (pl, m) {
  const t = DF.time;
  if (!pl.alive || t - (pl.lastFire || 0) < CFG.fireRate * 0.92) return;
  if (pl.reloading) return;
  if (pl.ammo <= 0) { DF.startReload(pl); return; }
  pl.lastFire = t;
  pl.ammo--;
  DF.onShotFired(pl);
  const eye = new T.Vector3(pl.pos.x, pl.pos.y + 1.62, pl.pos.z);
  const o = (m.o && m.o.length === 3) ? new T.Vector3(m.o[0], m.o[1], m.o[2]) : eye.clone();
  // 反作弊：枪口位置必须贴近房主认定的玩家位置
  if (o.distanceTo(eye) > 2.0) o.copy(eye);
  const d = (m.d && m.d.length === 3)
    ? new T.Vector3(m.d[0], m.d[1], m.d[2]).normalize()
    : new T.Vector3(0, 0, -1).applyEuler(new T.Euler(pl.pitch, pl.yaw, 0, 'YXZ'));
  // 方向必须与房主记录的朝向接近
  const expect = new T.Vector3(0, 0, -1).applyEuler(new T.Euler(pl.pitch, pl.yaw, 0, 'YXZ'));
  if (d.dot(expect) < 0.5) d.copy(expect);
  DF.hostShoot(pl, o, d, false);
};

Net._hostGuestReload = function (pl) {
  if (pl.reloading || pl.ammo >= CFG.mag || pl.reserve <= 0) return;
  DF.startReload(pl);
  this.hostBroadcast({ t: 'rl', id: pl.id });
};

/* ---------------- 房主：开始 / 广播 ---------------- */
Net.startHost = function () {
  this.role = 'host';
  this.lastTick = now();
  this._lastRealTick = now();
  if (this.tickTimer) clearInterval(this.tickTimer);
  this.tickTimer = setInterval(() => this._tick(), 50);
  // 撤离判定用独立定时器（不依赖渲染帧率）
  if (this.exTimer) clearInterval(this.exTimer);
  this.exTimer = setInterval(() => {
    if (!DF.matchRunning || DF.matchOver) return;
    DF._exLastT = 0;   // 让逻辑按真实时间重新锚定
    DF.updateExtractionLogic && DF.updateExtractionLogic(0.1);
    DF.checkRaidOver && DF.checkRaidOver();
  }, 100);
};

Net.hostBroadcast = function (obj, reliable) {
  this.clients.forEach(slot => this._sendOn(slot.chans, obj, reliable !== false));
};
Net.hostBroadcastFx = function (obj) {
  // 特效走高速通道
  this.clients.forEach(slot => this._sendOn(slot.chans, obj, false) || this._sendOn(slot.chans, obj, true));
};

Net._roster = function () {
  const r = [];
  DF.players.forEach(p => r.push({ id: p.id, n: p.name, c: p.color, b: p.isBot ? 1 : 0, k: p.kills, d: p.deaths }));
  return r;
};

/* ---------------- 房主：权威 tick（20Hz） ---------------- */
Net._tick = function () {
  const t = now();
  let dt = t - this.lastTick;
  this.lastTick = t;
  if (dt > 0.25) dt = 0.25;
  DF.time = t;
  // 用真实 tick 间隔推进（低帧率设备上帧 dt 不可靠）
  if (DF.matchRunning && !DF.matchOver) {
    const realDt = Math.min(2, Math.max(0, (t - (this._lastRealTick || t)) ));
    this._lastRealTick = t;
    DF.matchTime = (DF.matchTime || 0) + realDt;
  }

  // 1. 模拟远程玩家 / 机器人
  DF.players.forEach(p => {
    if (p.isLocal) return;
    if (!p.alive) {
      if (this.role === 'host' && DF.matchRunning && t >= p.respawnAt) {
        DF.spawnPlayer(p);
        DF.net.hostBroadcast({ t: 'rs', id: p.id, p: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)] });
      }
      return;
    }
    if (p.reloading && t >= p.reloadEnd) DF.finishReload(p);
    if (p.isBot) {
      DF.updateBot(p, dt);
    } else {
      if (t - (p.lastPacket || 0) > 1.2) {
        p.input.f = 0; p.input.s = 0; p.input.fire = false;
      }
      DF.applyMovement(p, p.input, dt);
    }
  });

  // 撤离点 / 搜刮权威结算
  if (DF.matchRunning && !DF.matchOver) {
    if (DF.airdrop && DF.airdrop.pendingDrop && DF.matchTime >= (CFG.airdropAt || 300)) {
      DF.airdrop.pendingDrop = false;
      DF.airdrop.mesh.visible = true;
      DF.airdrop.mark.visible = true;
      DF.pushKillfeed('<span style="color:#ff8c1a">' + (DF.mapId === 'frontier' ? '✈ 空投已投放（吴家村村中心）' : '✈ 空投已投放（地图中央）') + '</span>');
      this.hostBroadcast({ t: 'drop', x: DF.airdrop.x, z: DF.airdrop.z });
    }
  }

  // 2. 广播快照
  if (this.clients.size) {
    const tl = Math.max(0, CFG.timeLimit - DF.matchTime);
    this.timeLeft = tl;
    this.hostBroadcast({
      t: 'S', p: this._snapPlayers(), tl, st: this._scoreList(),
      ex: (DF.extracts || []).map(e => [e.id, e.open ? 1 : 0, +(e.progress || 0).toFixed(1),
        +e.x.toFixed(1), +e.z.toFixed(1)])
    }, false);
  }
};

Net._snapPlayers = function () {
  const arr = [];
  DF.players.forEach(p => {
    let flags = 0;
    if (p.alive) flags |= 1;
    if (p.crouch) flags |= 2;
    if (p.sprint) flags |= 4;
    if (p.ads) flags |= 8;
    if (p.reloading) flags |= 16;
    if (!p.onGround) flags |= 32;
    arr.push([p.id, +p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2),
      +p.yaw.toFixed(3), +p.pitch.toFixed(3), Math.round(p.hp), flags, p.kills, p.deaths,
      p.ammo, p.reserve, DF.bagValue(p) + DF.safeValue(p), (p.extracted ? 1 : 0)]);
  });
  return arr;
};

Net._scoreList = function () {
  const r = [];
  DF.players.forEach(p => r.push([p.id, p.name, p.color, p.kills, p.deaths, p.isBot ? 1 : 0]));
  return r;
};

/* ============================================================
   客人：连接
   ============================================================ */
Net.connectAsGuest = async function (offerCode, myName) {
  let obj;
  try { obj = await DF.decodeSDP(offerCode); } catch (e) { throw new Error(e.message.includes('不支持短邀请码') ? e.message : '邀请码格式错误，请确认复制了完整内容'); }
  if (!obj || obj.type !== 'offer' || !obj.sdp) throw new Error('邀请码无效');

  this.role = 'guest';
  this.chans = [];
  const pc = newPC();
  this.guestPc = pc;

  const onMsg = (m) => this._guestHandle(m);
  const onOpen = () => {
    if (this.connected) return;
    this.connected = true;
    this._startGuestLoops();
    this._sendRel({ t: 'hello', name: myName || DF.nickname });
    setTimeout(() => this._sendRel({ t: 'hello', name: myName || DF.nickname }), 500);
    DF.M.onConnected && DF.M.onConnected();
  };
  const cRel = pc.createDataChannel('g-rel', { ordered: true });
  const cFast = pc.createDataChannel('g-fast', { ordered: false, maxRetransmits: 0 });
  attachChan(this, cRel, onMsg, onOpen);
  attachChan(this, cFast, onMsg, onOpen);
  pc.ondatachannel = (ev) => attachChan(this, ev.channel, onMsg, onOpen);

  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === 'failed') DF.M.onNetError && DF.M.onNetError('WebRTC 连接失败（NAT 穿透失败，可尝试开 VPN 或换网络）');
    if (st === 'disconnected' || st === 'closed') {
      if (this.connected) { this.connected = false; DF.M.onDisconnected && DF.M.onDisconnected(); }
    }
  };

  await pc.setRemoteDescription({ type: 'offer', sdp: obj.sdp });
  if (obj.ice) for (const c of obj.ice) { try { await pc.addIceCandidate(c); } catch (e) { } }
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIce(pc);
  const answerCode = DF.encodeSDP({
    type: pc.localDescription.type, sdp: pc.localDescription.sdp
  });
  return answerCode;
};

Net._sendRel = function (obj) { return this._sendOn(this.chans, obj, true); };
Net._sendFast = function (obj) { return this._sendOn(this.chans, obj, false) || this._sendOn(this.chans, obj, true); };

Net._startGuestLoops = function () {
  if (this.pingTimer) clearInterval(this.pingTimer);
  this.pingTimer = setInterval(() => {
    if (!this.connected) return;
    const ts = now();
    this._lastPingTs = ts;
    this._sendRel({ t: 'ping', ts });
  }, 2000);
};

Net._guestHandle = function (m) {
  switch (m.t) {
    case 'welcome': {
      this.myPlayerId = m.id;
      DF.myId = m.id;
      const p = DF.createPlayer({
        id: m.id, name: DF.nickname || '玩家', color: '#6f8f5a',
        spawn: new T.Vector3(m.spawn[0], m.spawn[1], m.spawn[2]), isLocal: true
      });
      p.hp = CFG.maxHp;
      DF.initInventory ? DF.initInventory(p) : null;
      DF.players.set(m.id, p);
      DF.attachMesh(p, DF.scene);
      DF.M.onWelcome && DF.M.onWelcome(m);
      break;
    }
    case 'pong': {
      if (this._lastPingTs) this.rtt = Math.max(0, (now() - this._lastPingTs) * 1000);
      DF.M.onRtt && DF.M.onRtt(this.rtt);
      break;
    }
    case 'S': this._applySnapshot(m); break;
    case 'rs': {
      const p = DF.players.get(m.id);
      if (p) {
        p.pos.set(m.p[0], m.p[1], m.p[2]);
        p.hp = CFG.maxHp; p.alive = true; p.vy = 0; p.ammo = CFG.mag;
        p.reloading = false;
        if (p.netTarget) p.netTarget.pos.copy(p.pos);
        if (m.id === DF.myId) DF.M.onLocalRespawn && DF.M.onLocalRespawn();
      }
      break;
    }
    case 'hp': {
      const p = DF.players.get(m.id);
      if (p && m.id === DF.myId) {
        const prev = p.hp;
        p.hp = m.hp;
        if (m.hp < prev) DF.M.onLocalDamage && DF.M.onLocalDamage(prev - m.hp, m.by);
      }
      break;
    }
    case 'kf':
      DF.pushKillfeed(`<b style="color:${m.ac}">${escapeHtml(m.a)}</b> <span class="hs">[${m.part === 'head' ? '爆头' : m.part === 'leg' ? '腿部' : '击杀'}]</span> <b style="color:${m.vc}">${escapeHtml(m.v)}</b>`);
      break;
    case 'tr':
      DF.fx.tracer(new T.Vector3(m.f[0], m.f[1], m.f[2]), new T.Vector3(m.to[0], m.to[1], m.to[2]), m.c || 0xffb060);
      break;
    case 'imp': DF.fx.impact(new T.Vector3(m.p[0], m.p[1], m.p[2]), new T.Vector3(m.n[0], m.n[1], m.n[2])); break;
    case 'bld': DF.fx.blood(new T.Vector3(m.p[0], m.p[1], m.p[2])); break;
    case 'rl': {
      const p = DF.players.get(m.id);
      if (p) { p.reloading = true; p.reloadEnd = DF.time + CFG.reloadTime; }
      break;
    }
    case 'chat': DF.M.onChat && DF.M.onChat(m.n, m.m, m.c, false); break;
    case 'sys': DF.M.onChat && DF.M.onChat('系统', m.m, '#ffb347', true); break;
    case 'roster': DF.M.onRoster && DF.M.onRoster(); break;
    case 'start': DF.M.onGuestStart && DF.M.onGuestStart(m); break;
    case 'ext': {
      const p = DF.players.get(m.id);
      if (p) { p.extracted = true; p.alive = false; }
      DF.pushKillfeed(`<b style="color:${m.color}">${escapeHtml(m.name)}</b> <span style="color:#7dd069">已从 ${escapeHtml(m.ex)} 撤离</span> <span style="color:#ffb347">+$${(m.v || 0).toLocaleString()}</span>`);
      if (m.id === DF.myId) {
        DF.Profile.addExtraction(m.v || 0, (DF.players.get(DF.myId) || {}).kills || 0);
        DF.Audio.extract && DF.Audio.extract();
        DF.showRaidResult(true, {
          value: m.v || 0, exName: m.ex,
          kills: (DF.players.get(DF.myId) || {}).kills || 0,
          bag: DF.bagValue(DF.players.get(DF.myId)), safe: DF.safeValue(DF.players.get(DF.myId))
        });
      }
      break;
    }
    case 'warn': {
      DF.pushKillfeed(`<span style="color:#ff6b5e">⚠ ${escapeHtml(m.name)} 有人正在撤离！</span>`);
      DF.Audio.warn && DF.Audio.warn();
      break;
    }
    case 'drop': {
      if (DF.airdrop) {
        DF.airdrop.pendingDrop = false;
        DF.airdrop.mesh.visible = true;
        DF.airdrop.mark.visible = true;
      }
      DF.pushKillfeed('<span style="color:#ff8c1a">' + (DF.mapId === 'frontier' ? '✈ 空投已投放（吴家村村中心）' : '✈ 空投已投放（地图中央）') + '</span>');
      break;
    }
    case 'end': DF.M.onRemoteEnd && DF.M.onRemoteEnd(m.id, m.reason); break;
    case 'full': DF.M.onNetError && DF.M.onNetError('房间已满，无法加入'); break;
  }
};

Net._applySnapshot = function (m) {
  const tRecv = now();
  this.lastSnapAt = tRecv;
  this.snapBuf.push({ t: tRecv, p: m.p });
  while (this.snapBuf.length > 30) this.snapBuf.shift();
  if (m.st) this.scoreList = m.st;
  if (typeof m.tl === 'number') this.timeLeft = m.tl;
  // 撤离点开放状态同步
  if (m.ex && DF.extracts) {
    m.ex.forEach(([id, open, pr, exX, exZ]) => {
      const ex = DF.extracts.find(e => e.id === id);
      if (!ex) return;
      if (open === 1 && !ex.open) {
        DF.pushKillfeed(`<span style="color:#7dd069">☑ ${ex.name} 已开放</span>`);
      }
      ex.open = open === 1;
      // 坐标同步（房主权威）
      if (typeof exX === 'number' && (Math.abs(ex.x - exX) > 0.05 || Math.abs(ex.z - exZ) > 0.05)) {
        ex.x = exX; ex.z = exZ;
        if (ex.group) ex.group.position.set(exX, 0, exZ);
      }
    });
  }

  const me = DF.players.get(DF.myId);
  const nameOf = (id) => {
    const r = (m.st || []).find(s => s[0] === id);
    return r ? r[1] : '玩家';
  };
  for (const row of m.p) {
    const id = row[0];
    if (id === DF.myId) {
      if (!me) continue;
      const sp = _v1.set(row[1], row[2], row[3]);
      const dist = me.pos.distanceTo(sp);
      if (dist > 2.0) me.pos.copy(sp);
      else if (dist > 0.08) me.pos.lerp(sp, 0.18);
      me.hp = row[6];
      const wasAlive = me.alive;
      me.alive = (row[7] & 1) === 1;
      me.ammo = row[10]; me.reserve = row[11];
      me.reloading = (row[7] & 16) === 16;
      me.kills = row[8]; me.deaths = row[9];
      if (row[13] === 1) me.extracted = true;
      if (wasAlive && !me.alive && DF.matchRunning && !me.extracted && !me.raidDead) {
        me.raidDead = true;
        DF.M.onLocalDeath && DF.M.onLocalDeath(me.lastAttacker);
      }
      continue;
    }
    let p = DF.players.get(id);
    if (!p) {
      p = DF.createPlayer({ id, name: nameOf(id), color: '#7a7a5a' });
      DF.initInventory ? DF.initInventory(p) : null;
      p.pos.set(row[1], row[2], row[3]);
      DF.players.set(id, p);
      DF.attachMesh(p, DF.scene);
    }
    if (!p.netTarget) p.netTarget = { pos: new T.Vector3().copy(p.pos) };
    p.netTarget.pos.set(row[1], row[2], row[3]);
    p.netTarget.yaw = row[4]; p.netTarget.pitch = row[5];
    p.netTarget.hp = row[6]; p.netTarget.flags = row[7];
    p.kills = row[8]; p.deaths = row[9];
    if (!p.netInit) {
      p.netInit = true;
      p.pos.copy(p.netTarget.pos);
      p.yaw = p.netTarget.yaw;
    }
  }
  // 清理已离开的玩家
  const ids = new Set(m.p.map(r => r[0]));
  DF.players.forEach(p => {
    if (p.id === DF.myId) return;
    if (!ids.has(p.id)) { DF.detachMesh(p, DF.scene); DF.players.delete(p.id); }
  });
  if (m.st && m.st.length) DF.M.onSnapshot && DF.M.onSnapshot(m);
};

/* 客人：本地预测自己在撤离圈内的进度（仅 UI，最终以房主为准） */
Net.guestPredictExtract = function () {
  if (!DF.extracts) return;
  const me = DF.players.get(DF.myId);
  if (!me || !me.alive || me.extracted) return;
  const tNow = now();
  DF.extracts.forEach(ex => {
    if (!ex.open) {
      if (me.exProgress) me.exProgress[ex.id] = 0;
      if (me.exStartAt) me.exStartAt[ex.id] = null;
      return;
    }
    const d = Math.hypot(me.pos.x - ex.x, me.pos.z - ex.z);
    if (!me.exStartAt) me.exStartAt = {};
    if (!me.exProgress) me.exProgress = {};
    if (d <= ex.radius) {
      if (me.exStartAt[ex.id] == null) me.exStartAt[ex.id] = tNow;
      me.exProgress[ex.id] = tNow - me.exStartAt[ex.id];
    } else {
      me.exStartAt[ex.id] = null;
      me.exProgress[ex.id] = 0;
    }
  });
};

/* 客人：每帧插值远程玩家 */
Net.interpolateRemote = function (dt) {
  const k = Math.min(1, dt * 13);
  DF.players.forEach(p => {
    if (p.isLocal || !p.netTarget) return;
    p.pos.lerp(p.netTarget.pos, k);
    p.yaw = angLerp(p.yaw, p.netTarget.yaw, k);
    p.pitch = lerp(p.pitch, p.netTarget.pitch, k);
    p.hp = p.netTarget.hp;
    const f = p.netTarget.flags;
    p.alive = (f & 1) === 1;
    p.crouch = (f & 2) === 2;
    p.sprint = (f & 4) === 4;
    p.ads = (f & 8) === 8;
    p.reloading = (f & 16) === 16;
    p.onGround = (f & 32) === 32;
  });
};

/* 客人：发送输入（30Hz） */
Net.sendInput = function (input, yaw, pitch, extra) {
  const t = now();
  if (t - this.lastInputSent < 1 / 30) return;
  this.lastInputSent = t;
  this._inputSeq = (this._inputSeq || 0) + 1;
  const msg = {
    t: 'in', q: this._inputSeq,
    f: +input.f.toFixed(2), s: +input.s.toFixed(2),
    j: input.jump ? 1 : 0, c: input.crouch ? 1 : 0,
    a: input.ads ? 1 : 0, sp: input.sprint ? 1 : 0,
    f2: input.fire ? 1 : 0, r: input.reload ? 1 : 0,
    y: +yaw.toFixed(3), p: +pitch.toFixed(3)
  };
  if (extra && extra.shot) { msg.o = extra.o; msg.d = extra.d; msg.shot = 1; }
  const me = DF.players.get(DF.myId);
  if (me) { msg.x = +me.pos.x.toFixed(2); msg.z = +me.pos.z.toFixed(2); }
  this._sendFast(msg);
};

Net.sendChat = function (msg) {
  if (this.role === 'guest') this._sendRel({ t: 'chat', msg });
  else {
    const me = DF.players.get(DF.myId);
    DF.M.onChat && DF.M.onChat(me ? me.name : DF.nickname, msg, me ? me.color : '#ffb347', false);
    this.hostBroadcast({ t: 'chat', n: me ? me.name : DF.nickname, c: me ? me.color : '#ffb347', m: msg });
  }
};

Net.leave = function () {
  if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
  if (this.exTimer) { clearInterval(this.exTimer); this.exTimer = null; }
  if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  this.clients.forEach(slot => { try { slot.pc.close(); } catch (e) { } });
  this.clients.clear();
  this.slots.forEach(s => { try { s.pc.close(); } catch (e) { } });
  this.slots = [];
  if (this.guestPc) { try { this.guestPc.close(); } catch (e) { } this.guestPc = null; }
  this.chans = [];
  this.connected = false;
  this.role = null;
  this.snapBuf = [];
};
