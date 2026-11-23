/* ============================================================
   云邮箱（Mail）—— Firebase 匿名登录 + Cloud Firestore
   - 首次打开时匿名注册并建立/绑定「邮箱地址」（handle）
   - 地址簿：handles/{handle} = { uid, createdAt }（仅创建者可写，见火规则）
   - 收件箱：handles/{handle}/inbox/{mailId}
       读/改/删 仅 owner；create 任意登录用户（from 必须等于自己 uid）
   - 已发记录存本机 localStorage（df_mail_sent）
   - 未读角标实时更新（onSnapshot）
   配置为公开的 firebaseConfig（本来就是公开的），真正防滥用靠 Firestore 规则。
   ============================================================ */
(function () {
  'use strict';
  const DF_FIREBASE_CONFIG = {
    apiKey: 'AIzaSyChuO3R_VtYy9YoziBdaMua1nxldbxULBY',
    authDomain: 'coffee-spark-ai-barista-4411a.firebaseapp.com',
    projectId: 'coffee-spark-ai-barista-4411a',
    storageBucket: 'coffee-spark-ai-barista-4411a.firebasestorage.app',
    messagingSenderId: '532095472689',
    appId: '1:532095472689:web:ffbc2479394a5f14aef110'
  };
  if (typeof DF === 'undefined') return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = ts => {
    try {
      const d = new Date(ts); const now = Date.now();
      const diff = now - ts;
      if (diff < 60e3) return '刚刚';
      if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
      if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
      const sameYear = d.getFullYear() === new Date().getFullYear();
      return (sameYear ? '' : d.getFullYear() + '/') + (d.getMonth() + 1) + '/' + d.getDate();
    } catch (e) { return ''; }
  };

  let auth = null, db = null, uid = null, initPromise = null;
  let myHandle = null, inited = false, bootFailed = false;
  let unsub = null, currentReaderMail = null;
  const SENT_KEY = 'df_mail_sent', HANDLE_KEY = 'df_mail_handle';

  const status = (msg, isErr) => {
    const el = $('mail-status'); if (!el) return;
    if (!msg) { el.hidden = true; return; }
    el.textContent = msg; el.classList.toggle('err', !!isErr); el.hidden = false;
  };
  const setBadge = n => {
    const b = $('mail-badge'), btn = $('btn-mail');
    if (b) { b.textContent = n > 99 ? '99+' : String(n); b.hidden = !(n > 0); }
    if (btn) btn.classList.toggle('has-mail', n > 0);
    const un = $('mail-unread'); if (un) { un.textContent = String(n); un.hidden = !(n > 0); }
  };
  const loadSent = () => { try { return JSON.parse(localStorage.getItem(SENT_KEY) || '[]'); } catch (e) { return []; } };
  const saveSent = list => { try { localStorage.setItem(SENT_KEY, JSON.stringify(list.slice(0, 50))); } catch (e) { } };

  /* ---------------- 初始化（匿名登录） ---------------- */
  async function ensureInit() {
    if (inited) return true;
    if (initPromise) return initPromise;
    initPromise = doEnsureInit();
    try { return await initPromise; } finally { initPromise = null; }
  }
  async function doEnsureInit() {
    if (inited) return true;
    if (!window.firebase || !firebase.initializeApp) { bootFailed = true; status('邮箱 SDK 未加载（firebase-compat）', true); return false; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(DF_FIREBASE_CONFIG);
      auth = firebase.auth();
      await auth.signInAnonymously();
      uid = auth.currentUser && auth.currentUser.uid;
      if (!uid) throw new Error('未获取到匿名 uid');
      db = firebase.firestore();
      // 不启用离线持久化：Cloud Firestore 多 tab 持久化在该调用重入时会挂起后续读写
      inited = true;
      return true;
    } catch (e) {
      bootFailed = true;
      const msg = (e && (e.code || e.message)) || String(e);
      status('邮箱连接失败：' + msg + (String(msg).indexOf('auth/') === 0 || String(msg).indexOf('permission') >= 0 ? '（请确认已在 Firebase 控制台启用「匿名」登录、创建 Firestore 并发布规则）' : ''), true);
      return false;
    }
  }

  /* ---------------- 地址（handle） ---------------- */
  async function verifyOrClaim() {
    if (!db) return null;
    let saved = null;
    try { saved = localStorage.getItem(HANDLE_KEY); } catch (e) { }
    if (saved) {
      try {
        const snap = await db.collection('handles').doc(saved).get();
        if (snap.exists && snap.data().uid === uid) { myHandle = saved; return myHandle; }
      } catch (e) { /* 读失败则留在认领界面 */ }
      try { localStorage.removeItem(HANDLE_KEY); } catch (e) { }
    }
    return null;
  }
  async function claimHandle(raw) {
    const h = String(raw || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(h)) throw new Error('地址须为 3-20 位：小写字母 / 数字 / 下划线');
    if (!db) { const ok2 = await ensureInit(); if (!ok2 || !db) throw new Error('云端连接未就绪，请稍后重试'); }
    const ref = db.collection('handles').doc(h);
    const snap = await ref.get();
    if (snap.exists) {
      if (snap.data().uid === uid) { /* 自己在别机已注册，本机重绑 */ }
      else throw new Error('该地址已被占用');
    } else {
      await ref.set({ uid: uid, createdAt: Date.now() });
    }
    myHandle = h;
    try { localStorage.setItem(HANDLE_KEY, myHandle); } catch (e) { }
    return myHandle;
  }

  /* ---------------- 收件箱 ---------------- */
  function renderInbox(items) {
    const list = $('mail-list'); if (!list) return;
    if (!items.length) { list.innerHTML = '<div class="df-mail-empty">收件箱是空的</div>'; return; }
    list.innerHTML = items.map(m => `
      <div class="df-mail-item${m.read ? '' : ' unread'}" data-mailid="${esc(m.id)}" role="button" tabindex="0">
        <div class="df-mail-item-ic">✉</div>
        <div class="df-mail-item-main">
          <div class="df-mail-item-from">${esc(m.fromHandle || '未知')}</div>
          <div class="df-mail-item-title">${esc(m.title || '（无标题）')}</div>
        </div>
        <div class="df-mail-item-time">${fmtTime(m.ts)}</div>
      </div>`).join('');
  }
  function subscribeInbox() {
    if (unsub) { try { unsub(); } catch (e) { } unsub = null; }
    if (!db || !myHandle) return;
    unsub = db.collection('handles').doc(myHandle).collection('inbox')
      .orderBy('ts', 'desc').limit(50)
      .onSnapshot(snap => {
        const items = [];
        snap.forEach(d => items.push(Object.assign({ id: d.id }, d.data())));
        renderInbox(items);
        setBadge(items.filter(m => !m.read).length);
      }, err => {
        status('读取收件箱失败：' + (err.code || err.message || err), true);
      });
  }
  async function openMail(id) {
    if (!db || !myHandle) return;
    const ref = db.collection('handles').doc(myHandle).collection('inbox').doc(id);
    try {
      const snap = await ref.get();
      if (!snap.exists) return;
      const m = Object.assign({ id: snap.id }, snap.data());
      currentReaderMail = m;
      if (!m.read) { ref.update({ read: true }).catch(() => { }); }
      $('mail-reader-title').textContent = m.title || '（无标题）';
      $('mail-reader-meta').textContent = '发件人：' + (m.fromHandle || '未知') + '  ·  ' + (m.ts ? new Date(m.ts).toLocaleString() : '');
      $('mail-reader-body').textContent = m.body || '';
      $('mail-reader').hidden = false;
    } catch (e) { status('打开邮件失败：' + (e.code || e.message || e), true); }
  }
  async function deleteCurrentMail() {
    if (!currentReaderMail || !db) return;
    try {
      await db.collection('handles').doc(myHandle).collection('inbox').doc(currentReaderMail.id).delete();
      $('mail-reader').hidden = true; currentReaderMail = null;
    } catch (e) { status('删除失败：' + (e.code || e.message || e), true); }
  }

  /* ---------------- 已发记录（本机） ---------------- */
  function renderSent() {
    const list = $('mail-sent'); if (!list) return;
    const sent = loadSent();
    if (!sent.length) { list.innerHTML = '<div class="df-mail-empty">本机暂无已发记录（仅存本机）</div>'; return; }
    list.innerHTML = sent.map(m => `
      <div class="df-mail-item" data-sentidx="${esc(m.idx)}" role="button" tabindex="0">
        <div class="df-mail-item-ic">↗</div>
        <div class="df-mail-item-main">
          <div class="df-mail-item-from">To：${esc(m.to)}</div>
          <div class="df-mail-item-title">${esc(m.title || '（无标题）')}</div>
        </div>
        <div class="df-mail-item-time">${fmtTime(m.ts)}</div>
      </div>`).join('');
  }
  function viewSent(idx) {
    const sent = loadSent();
    const m = sent.find(x => String(x.idx) === String(idx));
    if (!m) return;
    $('mail-reader-title').textContent = m.title || '（无标题）';
    $('mail-reader-meta').textContent = 'To：' + m.to + '  ·  ' + new Date(m.ts).toLocaleString() + '  ·  本机存档';
    $('mail-reader-body').textContent = m.body || '';
    $('mail-del').hidden = true;
    $('mail-reader').hidden = false;
  }

  /* ---------------- 发送 ---------------- */
  async function sendMail() {
    const to = ($('mail-to').value || '').trim().toLowerCase();
    const title = ($('mail-subject').value || '').trim();
    const body = ($('mail-body-input').value || '').trim();
    if (!/^[a-z0-9_]{3,20}$/.test(to)) { status('收件人地址格式不对（3-20 位小写字母/数字/下划线）', true); return; }
    if (!title) { status('请填写标题', true); return; }
    if (!body) { status('请填写正文', true); return; }
    if (title.length > 100 || body.length > 2000) { status('超出长度限制（标题 100 / 正文 2000）', true); return; }
    if (!myHandle) { status('请先设定你的邮箱地址', true); return; }
    const btn = $('mail-send'); btn.disabled = true; btn.textContent = '发送中…';
    try {
      const target = await db.collection('handles').doc(to).get();
      if (!target.exists) throw new Error('收件人地址不存在（确认对方已设定过地址）');
      await db.collection('handles').doc(to).collection('inbox').add({
        from: uid, fromHandle: myHandle, title: title, body: body, ts: Date.now(), read: false
      });
      const sent = loadSent();
      sent.unshift({ to: to, title: title, body: body, ts: Date.now(), idx: String(Date.now()) + '_' + Math.floor(Math.random() * 1e6) });
      saveSent(sent);
      $('mail-to').value = ''; $('mail-subject').value = ''; $('mail-body-input').value = '';
      $('mail-count').textContent = '0 / 2000';
      status('已发送给 ' + to, false);
      switchTab('sent');
    } catch (e) {
      status('发送失败：' + (e.message || e.code || e), true);
    } finally {
      btn.disabled = false; btn.textContent = '发 送';
    }
  }

  /* ---------------- UI 切换 ---------------- */
  function switchTab(name) {
    document.querySelectorAll('#mail-tabs [data-mailtab]').forEach(b => b.classList.toggle('on', b.getAttribute('data-mailtab') === name));
    document.querySelectorAll('[data-mailpane]').forEach(pn => { pn.hidden = pn.getAttribute('data-mailpane') !== name; });
    if (name === 'sent') renderSent();
  }
  function showClaimedUI() {
    $('mail-claim').hidden = true; $('mail-tabs').hidden = false;
    const addr = $('mail-addr'); if (addr) addr.textContent = myHandle + '@Lianjics';
  }
  function showClaimUI() {
    $('mail-claim').hidden = false; $('mail-tabs').hidden = true;
    const addr = $('mail-addr'); if (addr) addr.textContent = '未设定地址';
  }
  function openModal() {
    const m = $('mail-modal'); if (!m) return;
    m.hidden = false; document.body.style.overflow = 'hidden';
    $('mail-reader').hidden = true; $('mail-del').hidden = false;
    if (bootFailed) return; // 状态条已显示原因
    (async () => {
      status('正在连接云端…（首次匿名登录可能需要几秒）', false);
      const ok = await ensureInit(); if (!ok) return;
      status(null);
      const h = await verifyOrClaim();
      if (h) { showClaimedUI(); subscribeInbox(); switchTab('inbox'); }
      else showClaimUI();
    })();
  }
  function closeModal() {
    const m = $('mail-modal'); if (!m) return;
    m.hidden = true; document.body.style.overflow = '';
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    const btn = $('btn-mail');
    if (btn) btn.addEventListener('click', openModal);
    const close = $('mail-close');
    if (close) close.addEventListener('click', closeModal);
    const modal = $('mail-modal');
    if (modal) {
      modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
    }
    const claimBtn = $('mail-claim-btn');
    if (claimBtn) claimBtn.addEventListener('click', async () => {
      claimBtn.disabled = true;
      status(null);
      try { await claimHandle($('mail-handle-input').value); showClaimedUI(); subscribeInbox(); switchTab('inbox'); status('地址已设定：' + myHandle, false); }
      catch (e) { status((e && e.message) || String(e), true); }
      finally { claimBtn.disabled = false; }
    });
    const claimInput = $('mail-handle-input');
    if (claimInput) claimInput.addEventListener('keydown', e => { if (e.key === 'Enter') claimBtn && claimBtn.click(); });
    document.querySelectorAll('#mail-tabs [data-mailtab]').forEach(b => b.addEventListener('click', () => switchTab(b.getAttribute('data-mailtab'))));
    $('mail-send') && $('mail-send').addEventListener('click', sendMail);
    $('mail-body-input') && $('mail-body-input').addEventListener('input', e => { $('mail-count').textContent = (e.target.value.length) + ' / 2000'; });
    const list = $('mail-list');
    if (list) list.addEventListener('click', e => { const it = e.target.closest('[data-mailid]'); if (it) openMail(it.getAttribute('data-mailid')); });
    const sent = $('mail-sent');
    if (sent) sent.addEventListener('click', e => { const it = e.target.closest('[data-sentidx]'); if (it) { $('mail-del').hidden = true; viewSent(it.getAttribute('data-sentidx')); } });
    $('mail-reader-back') && $('mail-reader-back').addEventListener('click', () => { $('mail-reader').hidden = true; $('mail-del').hidden = false; });
    $('mail-del') && $('mail-del').addEventListener('click', deleteCurrentMail);
  }

  /* 启动：静默初始化拿角标（失败不影响游戏） */
  function boot() {
    bind();
    (async () => {
      const ok = await ensureInit().catch(() => false);
      if (!ok) return;
      const h = await verifyOrClaim().catch(() => null);
      if (h) { myHandle = h; subscribeInbox(); }
    })().catch(() => { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  DF.Mail = { open: openModal, close: closeModal };
})();
