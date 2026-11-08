/* EG Super Admin prototype — auth.js
   Start screen, login (email + password → MFA → lockout), forgot/reset password, account activation,
   idle lock overlay, session-validity watcher and persona switching. Public API: SA.auth.* */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h;
  SA.catalog.status.session.ended = ['منتهية', 'neutral'];
  const DEMO_PW = 'Demo@1234', DEMO_OTP = '123456';
  const A = (SA.auth = { notice: null, intended: null });

  const sec = () => SA.store.get('settings.security') || {};
  const findByEmail = (e) => (SA.store.get('users') || []).find((u) => u.email.toLowerCase() === String(e || '').trim().toLowerCase());

  /* ───────────────────────── core login operations ───────────────────────── */
  function startSession(user, via) {
    const sid = SA.store.nextId('sessions', 'SE', 3); const now = new Date().toISOString(); const dev = SA.session.device;
    SA.store.update('sessions', (l) => { l.unshift({ id: sid, userId: user.id, platform: 'web', device: dev.ua, ip: dev.ip, createdAt: now, lastActive: now, status: 'active', pushStatus: 'none', current: true }); });
    SA.store.patch('users', user.id, { lastLogin: now, failed: 0 });
    SA.store.set('session', { userId: user.id, snap: SA.session.takeSnapshot(user), sessionId: sid, loginAt: now, lastActive: now, locked: false });
    SA.audit('AUTH.LOGIN_SUCCESS', { target: { type: 'user', id: user.id, label: user.name }, reason: via === 'testlab' ? 'تبديل شخصية من وضع الاختبار' : '' });
    lastActivity = Date.now(); SA.emit('login', user);
  }
  /** Validate credentials. Returns {ok:true, user, mfa:boolean} | {ok:false, msg, locked?:bool} and writes audit/notifications. */
  A.checkCredentials = function (email, pw) {
    const user = findByEmail(email); const thr = sec().lockoutThreshold;
    const generic = 'بيانات الدخول غير صحيحة. تأكد منها أو تواصل مع مدير النظام.';
    if (!user) { SA.audit('AUTH.LOGIN_FAILED', { actor: { id: 'ANON', name: String(email || '—'), roleId: null }, target: { type: 'user', id: String(email || ''), label: String(email || '') }, result: 'failure', reason: 'مستخدم غير موجود' }); return { ok: false, msg: generic }; }
    const failAudit = (reason, sev) => SA.audit('AUTH.LOGIN_FAILED', { actor: { id: user.id, name: user.name, roleId: user.roleId }, target: { type: 'user', id: user.id, label: user.name }, result: 'failure', reason, severity: sev });
    if (user.status === 'disabled') { failAudit('حساب معطّل'); return { ok: false, msg: generic }; }
    if (user.status === 'pending') { failAudit('حساب لم يُفعَّل'); return { ok: false, msg: 'الحساب لم يُفعَّل بعد. استخدم رابط التفعيل المرسل إليك أو اطلب رابطًا جديدًا من مدير النظام.' }; }
    if (user.status === 'locked') { failAudit('حساب موقوف'); return { ok: false, locked: true, msg: 'الحساب موقوف بعد محاولات فاشلة. تواصل مع مدير النظام لفك القفل.' }; }
    const pw0 = (SA.store.get('creds') || {})[user.id] || DEMO_PW;
    if (pw !== pw0) {
      const f = (user.failed || 0) + 1; SA.store.patch('users', user.id, { failed: f });
      failAudit('كلمة مرور خاطئة (' + f + (thr ? ' من ' + thr : '') + ')', f >= 3 ? 'medium' : 'info');
      if (thr && f >= thr) {
        SA.store.patch('users', user.id, { status: 'locked', lockedAt: new Date().toISOString() });
        SA.audit('AUTH.ACCOUNT_LOCKED', { actor: { id: user.id, name: user.name, roleId: user.roleId }, target: { type: 'user', id: user.id, label: user.name }, result: 'failure', reason: 'تجاوز حد المحاولات الفاشلة (' + thr + ')' });
        SA.notify({ title: 'حساب موقوف: ' + user.name, body: 'تم قفل الحساب بعد تجاوز حد المحاولات الفاشلة. افتح المستخدمين أو مركز الأمان لفك القفل.', level: 'urgent', to: ['R-01', 'R-10'], link: '#/users/' + user.id });
        return { ok: false, locked: true, msg: 'تم قفل الحساب مؤقتًا بعد محاولات فاشلة متكررة. تواصل مع مدير النظام.' };
      }
      return { ok: false, msg: generic };
    }
    return { ok: true, user, mfa: !!user.mfa };
  };
  A.verifyMfa = function (user, code) {
    if (String(code).trim() === DEMO_OTP) return true;
    const f = (SA.store.find('users', user.id).failed || 0) + 1; SA.store.patch('users', user.id, { failed: f });
    SA.audit('AUTH.MFA_FAILED', { actor: { id: user.id, name: user.name, roleId: user.roleId }, target: { type: 'user', id: user.id, label: user.name }, result: 'failure' });
    const thr = sec().lockoutThreshold;
    if (thr && f >= thr) { SA.store.patch('users', user.id, { status: 'locked', lockedAt: new Date().toISOString() }); SA.audit('AUTH.ACCOUNT_LOCKED', { actor: { id: user.id, name: user.name, roleId: user.roleId }, target: { type: 'user', id: user.id, label: user.name }, result: 'failure', reason: 'فشل MFA متكرر' }); SA.notify({ title: 'حساب موقوف: ' + user.name, body: 'قُفل الحساب بعد فشل التحقق الثاني.', level: 'urgent', to: ['R-01', 'R-10'], link: '#/users/' + user.id }); }
    return false;
  };
  A.completeLogin = function (user, via) { startSession(user, via); const go = A.intended || ''; A.intended = null; SA.nav(go && go.indexOf('#/login') < 0 && go.indexOf('#/start') < 0 ? go : SA.homeRoute() || 'users', { replace: true }); };
  /** Close the current session record and clear the session. reason: text shown on the login screen. */
  A.logout = function (reason, o) {
    o = o || {}; const s = SA.session.data;
    if (s.sessionId) SA.store.update('sessions', (l) => { const r = l.find((x) => x.id === s.sessionId); if (r && r.status === 'active') { r.status = o.revoked ? 'revoked' : 'ended'; r.lastActive = new Date().toISOString(); } });
    SA.store.set('session', { userId: null, snap: null, sessionId: null, loginAt: null, lastActive: null, locked: false });
    A.notice = reason || null; SA.emit('logout'); SA.layers.closeAll(); SA.nav('login', { replace: true });
  };
  /** Instant "login as" persona (Test Lab). Keeps all data. Returns false (with toast) if the persona account cannot log in. */
  A.loginAs = function (personaId) {
    const user = (SA.store.get('users') || []).find((u) => u.persona === personaId);
    if (!user) { SA.toast('الشخصية غير موجودة', 'error'); return false; }
    if (user.status !== 'active') { SA.toast('حساب «' + user.name + '» ' + (user.status === 'disabled' ? 'معطّل' : user.status === 'locked' ? 'موقوف' : 'غير مفعّل') + ' — فعّله أو افتح قفله من شاشة المستخدمين أولًا (كصاحب الشركة).', 'warn', { ms: 7000 }); return false; }
    const s = SA.session.data;
    if (s.sessionId) SA.store.update('sessions', (l) => { const r = l.find((x) => x.id === s.sessionId); if (r && r.status === 'active') r.status = 'ended'; });
    SA.layers.closeAll(); startSession(user, 'testlab');
    SA.store.set('ui.app', null); const m = SA.route && SA.route.module; const target = m && SA.canOpen(m) && m.app === ((SA.session.role && SA.session.role.homeApp) || 'sa') && !SA.isEss() ? SA.route.raw : '#/' + (SA.homeRoute() || '');
    SA.router.refresh(); SA.nav(target.replace(/^#\/?/, ''), { replace: true }); SA.toast('أنت الآن: ' + user.name + ' — ' + SA.roleName(user.roleId), 'info');
    return true;
  };

  /* ───────────────────────── idle lock + session watcher ───────────────────────── */
  let lastActivity = Date.now(); let lockEl = null;
  const touch = SA.debounce(() => { if (!SA.session.locked) lastActivity = Date.now(); }, 250);
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, touch, { passive: true, capture: true }));
  A.idleLimitSec = () => { const o = SA.store.get('tour.idleOverrideSec'); return o ? Number(o) : (sec().idleMinutes ? sec().idleMinutes * 60 : 0); };
  A.lock = function (why) {
    if (!SA.session.isAuthed || SA.session.locked) return;
    SA.store.set('session.locked', true); SA.track('idle.locked'); showLock(why);
  };
  function showLock(why) {
    if (lockEl) return; const u = SA.session.user; if (!u) return;
    const app = document.getElementById('app'); if (app) { app.setAttribute('inert', ''); app.setAttribute('aria-hidden', 'true'); }
    SA.layers.closeAll();
    const pw = SA.form.field({ name: 'pw', label: 'كلمة المرور أو كود التحقق', type: 'password', hint: 'تجريبي: Demo@1234 أو 123456' });
    const unlock = () => {
      const v = pw.get().trim(); const pass = (SA.store.get('creds') || {})[u.id] || DEMO_PW;
      if (v === pass || v === DEMO_OTP) { SA.store.set('session.locked', false); lastActivity = Date.now(); hideLock(); SA.toast('تم فتح الجلسة', 'success'); } else { pw.error('بيانات التحقق غير صحيحة'); pw.focus(); }
    };
    lockEl = h('div.sap-lockscreen', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lock-t' },
      h('div.sap-lock-card', {}, h('span.sap-state-ico', {}, SA.icon('lock', 'icon-lg')), h('h2#lock-t', {}, 'الجلسة مقفولة بسبب الخمول'), h('p.t-muted', {}, why || 'البيانات اتخفت لحمايتك. أعد التحقق للمتابعة من نفس الشاشة.'), h('div.sap-usercell.is-center', {}, SA.avatar(u.name), h('div', {}, h('b', {}, u.name), h('small', {}, SA.roleName(u.roleId)))), pw.el,
        h('div.cluster', { style: { justifyContent: 'center' } }, h('button.btn.btn-primary', { type: 'button', onclick: unlock }, SA.icon('unlock', 'icon-sm'), 'فتح الجلسة'), h('button.btn.btn-ghost', { type: 'button', onclick: () => { hideLock(); A.logout('تم تسجيل الخروج من شاشة القفل.'); } }, 'تسجيل الخروج'))));
    lockEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); unlock(); } });
    document.body.appendChild(lockEl); setTimeout(() => pw.focus(), 30);
  }
  function hideLock() { if (lockEl) { lockEl.remove(); lockEl = null; } const app = document.getElementById('app'); if (app) { app.removeAttribute('inert'); app.removeAttribute('aria-hidden'); } }
  A.hideLock = hideLock;
  A.initWatchers = function () {
    if (A._init) return; A._init = true;
    setInterval(() => {
      if (!SA.session.userId) { if (lockEl) hideLock(); return; }
      const u = SA.session.user;
      if (!u || u.status === 'disabled') return A.logout('تم تعطيل حسابك من مدير النظام. تواصل معه لإعادة التفعيل.', { revoked: true });
      if (u.status === 'locked') return A.logout('تم إيقاف حسابك مؤقتًا. تواصل مع مدير النظام لفك القفل.', { revoked: true });
      const sess = SA.store.find('sessions', SA.session.data.sessionId);
      if (sess && sess.status === 'revoked') return A.logout('تم إنهاء جلستك من مدير النظام. سجّل الدخول من جديد.');
      if (SA.session.locked && !lockEl) showLock();
      if (!SA.session.locked && lockEl) hideLock();
      const lim = A.idleLimitSec();
      if (lim && !SA.session.locked && Date.now() - lastActivity > lim * 1000) A.lock();
    }, 1500);
  };

  /* ───────────────────────── views ───────────────────────── */
  function shellFrame(inner, wide) {
    return h('div.sap-auth', {}, h('div.sap-auth-hero', {}, h('img', { src: '../../assets/images/logo/wordmark-white.png', alt: 'EG', class: 'sap-auth-logo' }), h('h1', {}, 'نظام المصرية الألمانية'), h('p', {}, 'نظام واحد للمصنع كله: المبيعات والتصنيع والجودة والمخازن والشحن والمالية والموارد البشرية والصيانة — كل شخصية تشوف اللي يخصها بالصلاحيات.'), h('ul.sap-auth-points', {}, ['نموذج تفاعلي — لا يتصل بخادم', 'كل الإجراءات تنعكس على السجل والإشعارات', 'الشاشات تتغير حسب صلاحيات الشخصية'].map((t) => h('li', {}, SA.icon('check', 'icon-sm'), t)))), h('div.sap-auth-main', {}, h('div.sap-auth-card' + (wide ? '.is-wide' : ''), {}, inner)));
  }
  function startView() {
    const points = ['ده نموذج تفاعلي (Prototype) لنظام المصنع كله — تجربة واحدة متصلة، مش شاشات متفرقة.', 'الإجراءات حقيقية جوه المتصفح: تعطيل مستخدم بيظهر في سجل التدقيق ومركز الأمان وبيمنعه من الدخول.', 'الشاشات والأزرار بتتغير حسب صلاحيات الشخصية اللي دخلت بيها (وفي أزرار مقفولة بسبب مكتوب).', 'افتح «وضع الاختبار» (الزر العائم) للمهام الجاهزة وتبديل الشخصيات ومحاكاة الأخطاء وتسجيل ملاحظاتك.', 'مفيش اتصال بخادم — البيانات تجريبية ومحفوظة في متصفحك، وتقدر تعيد ضبطها في أي وقت.'];
    return shellFrame(h('div.sap-start', {}, h('img.sap-auth-logo-dark', { src: '../../assets/images/logo/wordmark-color.png', alt: 'EG' }), h('span.sap-eyebrow', {}, 'نموذج تفاعلي · نظام المصرية الألمانية'), h('h2', {}, 'جرّب النظام كأنه شغّال'),
      h('ol.sap-start-list', {}, points.map((p) => h('li', {}, p))),
      h('div.cluster.sap-start-actions', {}, h('a.btn.btn-accent.btn-lg', { href: '#/login?as=owner' }, SA.icon('shield'), 'ابدأ كصاحب الشركة'), h('a.btn.btn-ghost.btn-lg', { href: '#/login?pick=1' }, SA.icon('users'), 'اختر شخصية')),
      h('div.cluster.sap-start-more', {}, h('span.t-caption', {}, 'أو ادخل مباشرة:'), h('a.sap-linkbtn', { href: '#/login?as=hr' }, 'HR Manager'), h('a.sap-linkbtn', { href: '#/login?as=employee' }, 'موظف (خدماتي)'), h('a.sap-linkbtn', { href: '#/login?as=salesmgr' }, 'Sales Manager')),
      h('p.t-caption', {}, 'البيانات المعروضة تجريبية بالكامل، والقيم اللي لسه Open في التوثيق بتظهر «غير مُعدّ» بدل ما نخترع أرقام.')), true);
  }
  function loginView(q) {
    const msg = h('div.sap-auth-msg', { role: 'alert', 'aria-live': 'assertive', hidden: true });
    const email = SA.form.field({ name: 'email', label: 'البريد الإلكتروني', type: 'email', required: true, autocomplete: 'username', rules: [SA.form.rules.email] });
    const pw = SA.form.field({ name: 'pw', label: 'كلمة المرور', type: 'password', required: true, autocomplete: 'current-password' });
    let pending = null; // user awaiting MFA
    const formBox = h('form.sap-auth-form', { novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(); } });
    const showMsg = (t, kind) => { msg.hidden = !t; msg.textContent = t || ''; msg.className = 'sap-auth-msg is-' + (kind || 'danger'); };
    if (A.notice) { showMsg(A.notice, 'info'); A.notice = null; }
    const btn = h('button.btn.btn-accent.btn-lg', { type: 'submit' }, SA.icon('arrowright', 'icon-sm icon-flip'), 'دخول');
    function renderCreds() {
      pending = null; SA.clear(formBox);
      formBox.append(email.el, pw.el, h('div.spread', {}, h('a', { href: '#/forgot' }, 'نسيت كلمة المرور؟')), btn,
        h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'بعد ', h('b.num', {}, sec().lockoutThreshold == null ? '—' : sec().lockoutThreshold), ' محاولات فاشلة بيتقفل الحساب. ', sec().lockoutDemo ? SA.demoValue('الحد تجريبي') : SA.openValue('الحد غير مُعدّ'))));
    }
    function renderMfa() {
      SA.clear(formBox);
      const code = SA.form.field({ name: 'code', label: 'كود التحقق (6 أرقام)', type: 'text', required: true, autocomplete: 'one-time-code' }); code.input.setAttribute('inputmode', 'numeric'); code.input.setAttribute('maxlength', '6');
      formBox.dataset.step = 'mfa'; let tries = 0;
      formBox.onsubmit = (e) => {
        e.preventDefault(); if (!code.validate()) return; btn2.disabled = true;
        SA.delay(250).then(() => {
          btn2.disabled = false;
          if (A.verifyMfa(pending, code.get())) { A.completeLogin(SA.store.find('users', pending.id)); return; }
          tries++; const u = SA.store.find('users', pending.id);
          if (u.status === 'locked') { showMsg('تم قفل الحساب بعد فشل التحقق المتكرر. تواصل مع مدير النظام.'); formBox.onsubmit = (e2) => { e2.preventDefault(); submit(); }; renderCreds(); return; }
          if (tries >= 3) { showMsg('فشل التحقق 3 مرات. ابدأ تسجيل الدخول من جديد.'); formBox.onsubmit = (e2) => { e2.preventDefault(); submit(); }; renderCreds(); return; }
          code.error('الكود غير صحيح (متبقي ' + (3 - tries) + ')'); code.focus();
        }, (er) => { btn2.disabled = false; showMsg(SA.errorText(er)); });
      };
      const btn2 = h('button.btn.btn-accent.btn-lg', { type: 'submit' }, SA.icon('check', 'icon-sm'), 'تحقق');
      formBox.append(h('div.sap-mfa-head', {}, h('span.sap-state-ico', {}, SA.icon('finger', 'icon-lg')), h('div', {}, h('h3', {}, 'التحقق بخطوتين'), h('p.t-muted', {}, 'أدخل الكود من تطبيق المصادقة لحساب ' + pending.email + '. (طريقة MFA الفعلية: ', SA.openValue('غير مُحدّدة'), ')'))), code.el,
        h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الكود التجريبي: ', h('code', {}, DEMO_OTP))), btn2,
        h('button.btn.btn-ghost', { type: 'button', onclick: () => { formBox.onsubmit = (e2) => { e2.preventDefault(); submit(); }; showMsg(''); renderCreds(); } }, 'رجوع'));
      setTimeout(() => code.focus(), 30);
    }
    function submit() {
      showMsg('');
      if (!email.validate() | !pw.validate()) { (email.validate() ? pw : email).focus(); return; }
      btn.disabled = true; btn.firstChild && (btn.lastChild.textContent = 'جاري التحقق…');
      SA.delay(300).then(() => {
        btn.disabled = false; btn.lastChild.textContent = 'دخول';
        const r = A.checkCredentials(email.get(), pw.get());
        if (!r.ok) { showMsg(r.msg); pw.set(''); pw.focus(); return; }
        if (r.mfa) { pending = r.user; renderMfa(); } else A.completeLogin(r.user);
      }, (er) => { btn.disabled = false; btn.lastChild.textContent = 'دخول'; showMsg(SA.errorText(er) + '. لم يتم تنفيذ الدخول.'); });
    }
    renderCreds();
    /* demo accounts */
    const personas = Object.keys(SA.catalog.personas).map((pid) => { const u = (SA.store.get('users') || []).find((x) => x.persona === pid); return u ? { pid, u } : null; }).filter(Boolean);
    const fill = (p) => { email.set(p.u.email); pw.set((SA.store.get('creds') || {})[p.u.id] || DEMO_PW); showMsg(''); SA.$$('.sap-persona', side).forEach((b) => b.classList.toggle('is-picked', b.dataset.pid === p.pid)); setTimeout(() => btn.focus(), 10); };
    const side = h('div.sap-auth-side' + (q.pick ? '.is-highlight' : ''), {}, h('h3', {}, 'حسابات تجريبية'), h('p.t-caption', {}, 'اضغط على شخصية لتعبئة البيانات (كلمة المرور ', h('code', {}, DEMO_PW), ' · كود MFA ', h('code', {}, DEMO_OTP), ').'),
      h('div.sap-persona-list', {}, personas.map((p) => h('button.sap-persona', { type: 'button', dataset: { pid: p.pid }, onclick: () => fill(p) }, SA.avatar(p.u.name), h('span', {}, h('b', {}, SA.catalog.personas[p.pid].label), h('small', {}, p.u.email), p.u.status !== 'active' ? h('small.is-bad', {}, p.u.status === 'disabled' ? 'الحساب معطّل' : p.u.status === 'locked' ? 'الحساب موقوف' : 'بانتظار التفعيل') : null), p.u.mfa ? h('span.chip.chip-info.chip-plain', { title: 'MFA مطلوب' }, SA.icon('finger', 'icon-sm'), 'MFA') : null))));
    if (q.as) { const p = personas.find((x) => x.pid === q.as); if (p) setTimeout(() => fill(p), 20); }
    return shellFrame(h('div.sap-login-grid', {}, h('div.sap-login-main', {}, h('a.sap-back', { href: '#/start' }, SA.icon('arrowright', 'icon-sm icon-flip'), 'البداية'), h('h2', {}, 'تسجيل الدخول'), h('p.t-muted', {}, 'ادخل ببريدك وكلمة المرور. الحسابات المعطّلة بتظهر لها رسالة عامة من غير كشف السبب.'), msg, formBox), side), true);
  }
  function forgotView() {
    const email = SA.form.field({ name: 'email', label: 'البريد الإلكتروني المسجّل', type: 'email', required: true, rules: [SA.form.rules.email] });
    const out = h('div');
    const form = h('form', { novalidate: true, onsubmit: (e) => {
      e.preventDefault(); if (!email.validate()) return;
      SA.delay(350).then(() => {
        const u = findByEmail(email.get()); let link = null;
        if (u && u.status !== 'disabled') { const token = 'rst-' + Math.random().toString(36).slice(2, 10); SA.store.patch('users', u.id, { resetToken: { token, at: new Date().toISOString() } }); link = '#/reset/' + token; }
        SA.audit('AUTH.PASSWORD_RESET_REQUESTED', { actor: u ? { id: u.id, name: u.name, roleId: u.roleId } : { id: 'ANON', name: email.get(), roleId: null }, target: { type: 'user', id: u ? u.id : email.get(), label: u ? u.name : email.get() }, reason: 'من شاشة نسيت كلمة المرور' });
        SA.clear(out); out.append(SA.alert('success', 'لو البريد ده مسجّل عندنا، هنبعت رابط مؤقت لإعادة التعيين. (رسالة عامة: لا نكشف وجود الحساب)'),
          link ? h('div.sap-demo-box', {}, h('b', {}, 'للتجربة فقط'), h('p', {}, 'النموذج لا يرسل بريدًا حقيقيًا، فالرابط يظهر هنا. صلاحية الرابط: ', SA.openValue('غير مُعدّة')), h('a.btn.btn-primary', { href: link }, SA.icon('link', 'icon-sm'), 'افتح الرابط المؤقت')) : null);
      }, (er) => SA.fail(er));
    } }, email.el, h('button.btn.btn-primary.btn-lg', { type: 'submit' }, 'أرسل الرابط'));
    return shellFrame(h('div.sap-login-main.is-narrow', {}, h('a.sap-back', { href: '#/login' }, SA.icon('arrowright', 'icon-sm icon-flip'), 'رجوع للدخول'), h('h2', {}, 'استرجاع كلمة المرور'), h('p.t-muted', {}, 'هنبعتلك رابطًا مؤقتًا على بريدك المسجّل (بند 15).'), form, out));
  }
  function setPasswordView(kind, key) {
    const users = SA.store.get('users') || [];
    const user = kind === 'reset' ? users.find((u) => u.resetToken && u.resetToken.token === key) : users.find((u) => u.activationToken === key);
    if (!user || (kind === 'activate' && user.status !== 'pending')) return shellFrame(h('div.sap-login-main.is-narrow', {}, SA.empty({ icon: 'link', title: 'الرابط منتهي أو غير صالح', text: kind === 'activate' ? 'اطلب رابطًا جديدًا من مدير النظام.' : 'اطلب رابطًا جديدًا من شاشة نسيت كلمة المرور.', action: { label: 'العودة للدخول', icon: 'arrowright', onClick: () => SA.nav('login') } })));
    const p1 = SA.form.field({ name: 'p1', label: 'كلمة المرور الجديدة', type: 'password', required: true, autocomplete: 'new-password' });
    const p2 = SA.form.field({ name: 'p2', label: 'تأكيد كلمة المرور', type: 'password', required: true, autocomplete: 'new-password' });
    const form = h('form', { novalidate: true, onsubmit: (e) => {
      e.preventDefault(); const a = p1.validate(), b = p2.validate(); if (!a || !b) return;
      if (p1.get() !== p2.get()) { p2.error('كلمتا المرور غير متطابقتين'); p2.focus(); return; }
      SA.delay(300).then(() => {
        SA.store.update('creds', (c) => { c[user.id] = p1.get(); });
        SA.store.patch('users', user.id, (r) => (kind === 'activate' ? { status: 'active', activationToken: null } : { resetToken: null, failed: 0 }));
        SA.audit('AUTH.PASSWORD_CHANGED', { actor: { id: user.id, name: user.name, roleId: user.roleId }, target: { type: 'user', id: user.id, label: user.name }, reason: kind === 'activate' ? 'تفعيل الحساب (UC-USR-07)' : 'إعادة تعيين عبر رابط مؤقت' });
        A.notice = kind === 'activate' ? 'تم تفعيل حسابك. سجّل الدخول الآن.' : 'تم تغيير كلمة المرور. سجّل الدخول بالجديدة.';
        SA.nav('login?as=' + (user.persona || ''), { replace: true });
      }, (er) => SA.fail(er));
    } }, p1.el, p2.el, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'سياسة كلمة المرور (الحد الأدنى/التعقيد/الانتهاء): ', SA.openValue('غير مُعدّة'))), h('button.btn.btn-primary.btn-lg', { type: 'submit' }, kind === 'activate' ? 'فعّل الحساب' : 'احفظ كلمة المرور'));
    return shellFrame(h('div.sap-login-main.is-narrow', {}, h('h2', {}, kind === 'activate' ? 'تفعيل حسابك' : 'تعيين كلمة مرور جديدة'), h('p.t-muted', {}, 'مرحبًا ' + user.name + ' (' + user.email + ')'), form));
  }
  /** Render the unauthenticated area into `host`. */
  A.render = function (host, route) {
    const s0 = route.segs[0] || 'start'; if (s0 === 'start' && route.query.persona) { SA.nav('login?as=' + encodeURIComponent(route.query.persona), { replace: true }); return; }
    SA.clear(host); let v;
    if (s0 === 'login') v = loginView(route.query); else if (s0 === 'forgot') v = forgotView(); else if (s0 === 'reset') v = setPasswordView('reset', route.segs[1]); else if (s0 === 'activate') v = setPasswordView('activate', route.segs[1]); else v = startView();
    host.appendChild(v); document.title = 'نظام المصرية الألمانية — نموذج تفاعلي · EG';
    const first = SA.$('input:not([type=checkbox])', host); if (s0 === 'login' && first && !route.query.as) first.focus();
  };
})();
