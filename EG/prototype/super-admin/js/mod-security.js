/* EG Super Admin prototype — mod-security.js
   Three screens in one file:
   · SA-18 مركز الأمان     #/security-center   — cards derived LIVE from audit / users / sessions / roles (nothing hard-coded); direct actions: unlock (SA.users.unlock), force-logout, open user.
   · SA-05 الجلسات والأجهزة #/sessions          — all sessions/devices, filters, revoke one (SA.sessions.revoke) / bulk (Step-up) / all of a user (SA.users.forceLogout).
   · SA-06 حسابات التجار    #/dealers (accounts) · #/dealers/requests · #/dealers/requests/DR-xxx · #/dealers/DL-xx
       Sales (sa.dealers.review) decides requests (approve → creates dealers[] + customers[] + price-list assignment · reject/needs-info need a reason);
       Super Admin does NOT silently decide: he OVERRIDES a decision with reason + Step-up → DEALER.OVERRIDDEN (critical) and the sales manager is notified.
   Public API  SA.dealersApi = { decide(reqId, outcome, {reason, priceListId, via}), applyOverride(reqId, outcome, {reason, viaApproval}), suspend(id), reactivate(id) }  (applyOverride is used by the approvals inbox for type dealer_override).
   Collections written: dealerRequests (status · decision{by,at,reason,via:'sales'|'override'} · accountId) · dealers (status active|suspended · priceListId) · customers (insert type:'dealer', dealerId) · priceLists.assignedTo.
   Added audit codes: DEALER.REACTIVATED. */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  SA.catalog.addAudit('DEALER.REACTIVATED', 'إعادة تفعيل حساب تاجر', 'medium', 'dealer');
  const me = () => SA.session.user; const isSuper = () => { const r = SA.session.role; return !!(r && r.isProtected); };
  const NOPERM = (k) => 'ليست من صلاحياتك (' + k + ')';
  const H24 = 864e5;
  (function () {
    if (document.querySelector('style[data-mod="security"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'security');
    s.textContent = `
.saps-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 16px; align-items: start; }
.saps-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 14px; }
.saps-kpi { position: relative; } .saps-kpi.is-bad { border-color: var(--color-danger); background: linear-gradient(var(--color-danger-tint), #fff 70%); } .saps-kpi.is-warn { border-color: var(--color-warning); background: linear-gradient(var(--color-warning-tint), #fff 70%); } .saps-kpi.is-ok .kpi-value { color: var(--color-success); }
.saps-kpi small { display: block; color: var(--color-text-muted); font-size: 12px; margin-top: 4px; } .saps-kpi .saps-go { position: absolute; inset-block-start: 12px; inset-inline-end: 12px; color: var(--color-text-muted); }
.saps-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; } .saps-row { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: 10px; background: #fff; } .saps-row > div { flex: 1; min-width: 0; } .saps-row small { display: block; color: var(--color-text-muted); font-size: 12px; }
.saps-bar { display: flex; height: 10px; border-radius: 6px; overflow: hidden; background: var(--color-neutral-tint); } .saps-bar i { display: block; height: 100%; } .saps-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--color-text-muted); margin-top: 8px; } .saps-legend span::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-inline-end: 6px; background: var(--c); }
.saps-doc { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: var(--text-dense); } .saps-doc .is-ok { color: var(--color-success); } .saps-doc .is-miss { color: var(--color-danger); }
.saps-shared { font-size: 11px; font-weight: 700; color: var(--color-warning); background: var(--color-warning-tint); border-radius: 6px; padding: 1px 6px; margin-inline-start: 6px; }
.saps-callout { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; background: var(--color-primary-tint); color: var(--eg-navy); font-size: var(--text-dense); font-weight: 600; } .saps-callout a { margin-inline-start: auto; font-weight: 700; }
.saps-foot { display: flex; gap: 8px; flex-wrap: wrap; width: 100%; } .saps-foot .saps-grow { flex: 1; }`;
    document.head.appendChild(s);
  })();
  const linkIf = (route, label, cls) => { const m = SA.router.parse('#/' + route).module; return m && SA.canOpen(m) ? h('a.' + (cls || 'sap-linkbtn'), { href: '#/' + route }, label) : null; };
  const within = (ts, ms) => Date.now() - new Date(ts).getTime() <= ms;
  const A = () => st.get('audit') || [];
  const PLAT = { web: ['ويب', 'globe'], ios: ['iPhone', 'phone'], android: ['Android', 'phone'] };

  /* ═════════════════ SA-18 security centre ═════════════════ */
  const demoDormant = { days: 30 };
  function metrics() {
    const L = A(); const users = st.get('users') || [];
    const failed = L.filter((e) => (e.code === 'AUTH.LOGIN_FAILED' || e.code === 'AUTH.MFA_FAILED') && within(e.ts, H24));
    const failedN = failed.reduce((a, e) => a + (e.count || 1), 0);
    const locked = users.filter((u) => u.status === 'locked'); const sas = SA.rbac.superAdmins(true);
    const noMfaSA = sas.filter((u) => !u.mfa); const noMfaAll = users.filter((u) => u.status === 'active' && !u.mfa);
    const dormant = users.filter((u) => u.status === 'active' && u.lastLogin && Date.now() - new Date(u.lastLogin).getTime() > demoDormant.days * H24);
    const sess = (st.get('sessions') || []).filter((s) => s.status === 'active');
    const permEv = L.filter((e) => /^ROLE\.|^USER\.ROLE_CHANGED/.test(e.code) && within(e.ts, 7 * H24));
    const sens7 = L.filter((e) => SA.auditView && SA.auditView.isSensitiveRead(e.code) && within(e.ts, 7 * H24));
    const denied = L.filter((e) => e.code === 'ACCESS.DENIED' && within(e.ts, H24)).reduce((a, e) => a + (e.count || 1), 0);
    const exp7 = L.filter((e) => /^EXPORT\./.test(e.code) && within(e.ts, 7 * H24));
    const roles = (st.get('roles') || []).filter((r) => r.status === 'active' && !r.isProtected && r.sensitive && r.sensitive.length);
    const salHolders = users.filter((u) => u.status === 'active' && SA.roleSensitive(SA.roleById(u.roleId), 'hr.salary.view') && !(SA.roleById(u.roleId) || {}).isProtected);
    return { failed, failedN, locked, sas, noMfaSA, noMfaAll, dormant, sess, permEv, sens7, denied, exp7, roles, salHolders };
  }
  function renderCenter(root, ctx) {
    ctx.setCrumbs([{ label: 'الرقابة' }, { label: 'مركز الأمان' }]);
    const den = SA.guard('sa.security_center.view'); if (den) { root.appendChild(den); return; }
    const head = h('div'); const host = h('div'); root.append(head, host); let state = 'loading';
    const kpi = (label, value, o) => { o = o || {}; const tone = o.tone || ''; const el = h((o.href ? 'a' : 'div') + '.card.kpi.sap-kpi.saps-kpi' + (tone ? '.is-' + tone : ''), o.href ? { href: o.href } : {}, h('span.kpi-label', {}, label), h('span.kpi-value.num', {}, value), o.sub ? h('small', {}, o.sub) : null, o.href ? h('span.saps-go', {}, SA.icon('arrowleft', 'icon-sm')) : null); return el; };
    function row(u, extra, sub) { return h('li.saps-row', {}, SA.avatar(u.name), h('div', {}, h('b', {}, u.name), h('small', {}, sub || SA.roleName(u.roleId) + ' · ' + SA.fmt.rel(u.lastLogin))), extra); }
    function draw() {
      SA.clear(host); const m = metrics(); const canUsers = SA.can('sa.users.view'); const canAudit = SA.can('sa.audit.view');
      const uHref = (q) => (canUsers ? SA.href('users' + q) : null); const aHref = (q) => (canAudit ? SA.link.audit(q) : null);
      host.append(h('div.saps-kpis', {},
        kpi('محاولات دخول فاشلة (24 س)', SA.fmt.num(m.failedN), { href: aHref('code=AUTH.LOGIN_FAILED&range=24h'), tone: m.failedN >= 5 ? 'warn' : '', sub: m.failedN ? 'افتح السجل لتفاصيل المصدر' : 'لا شيء مريب' }),
        kpi('حسابات موقوفة', m.locked.length, { href: uHref('?status=locked'), tone: m.locked.length ? 'bad' : 'ok', sub: m.locked.length ? 'تحتاج فك قفل أو تحقيق' : 'لا حسابات موقوفة' }),
        kpi('Super Admin بدون MFA', m.noMfaSA.length, { href: uHref('?mfa=no'), tone: m.noMfaSA.length ? 'bad' : 'ok', sub: 'من ' + m.sas.length + ' حساب · ' + m.noMfaAll.length + ' مستخدم نشط بدون MFA' }),
        kpi('حسابات خاملة', m.dormant.length, { href: uHref(''), sub: h('span', {}, 'لم تدخل منذ ', SA.demoValue(demoDormant.days + ' يومًا'), ' — المدة Open') }),
        kpi('الجلسات النشطة', m.sess.length, { href: SA.can('sa.sessions.view') ? SA.href('sessions') : null, sub: m.sess.filter((s) => s.platform !== 'web').length + ' على الموبايل' }),
        kpi('محاولات وصول ممنوعة (24 س)', m.denied, { href: aHref('code=ACCESS.DENIED&range=24h'), tone: m.denied >= 5 ? 'warn' : '' }),
        kpi('اطلاع على بيانات حساسة (7 أيام)', m.sens7.length, { href: SA.can('sa.access_log.view') ? SA.href('access-log') : aHref('code=HR.SALARY.VIEWED'), sub: 'أجور · رقم قومي · طبي (HR)' }),
        kpi('عمليات تصدير (7 أيام)', m.exp7.length, { href: aHref('code=EXPORT.AUDIT') })));
      if (m.sas.length < 2) host.append(SA.alert('danger', h('b', {}, 'يوجد حساب Super Admin نشط واحد فقط. '), 'القاعدة المطلوبة حسابان نشطان على الأقل (UC-SAC-04). ', linkIf('users/security', 'افتح أمان Super Admin')));
      const locked = SA.card({ title: 'حسابات موقوفة (' + m.locked.length + ')', actions: [linkIf('users?status=locked', 'عرض الكل')] }, m.locked.length ? h('ul.saps-list', {}, m.locked.map((u) => row(u, h('span.cluster', {}, SA.btn({ label: 'فك القفل', icon: 'unlock', kind: 'primary', size: 'sm', perm: SA.can('sa.security_center.unlock') || SA.can('sa.users.unlock') ? null : 'sa.security_center.unlock', onClick: () => SA.users.unlock(u.id) }), canUsers ? h('a.btn.btn-ghost.btn-sm', { href: SA.link.user(u.id) }, 'فتح') : null), 'قُفل ' + SA.fmt.rel(u.lastLockedAt || u.lockedAt) + ' بعد ' + (u.failed || 0) + ' محاولة فاشلة'))) : SA.empty({ icon: 'checkcircle', title: 'لا توجد حسابات موقوفة', text: 'كل الحسابات تعمل بشكل طبيعي.' }));
      const byUser = {}; m.failed.forEach((e) => { const k = (e.target && e.target.label) || actorName(e); byUser[k] = (byUser[k] || 0) + (e.count || 1); });
      const top = Object.keys(byUser).sort((a, b) => byUser[b] - byUser[a]).slice(0, 5);
      const failedCard = SA.card({ title: 'محاولات الدخول الفاشلة (24 ساعة)', actions: [aHref('code=AUTH.LOGIN_FAILED&range=24h') ? h('a.sap-linkbtn', { href: aHref('code=AUTH.LOGIN_FAILED&range=24h') }, 'السجل') : null] }, top.length ? h('ul.saps-list', {}, top.map((k) => h('li.saps-row', {}, h('span.sap-sess-ico', {}, SA.icon('alert')), h('div', {}, h('b', {}, k), h('small', {}, 'آخر محاولة ' + SA.fmt.rel(m.failed.find((e) => ((e.target && e.target.label) || actorName(e)) === k).ts))), SA.chip(byUser[k] + ' محاولة', byUser[k] >= 3 ? 'danger' : 'warning')))) : SA.empty({ icon: 'shield', title: 'لا محاولات فاشلة', text: 'لم تُسجَّل محاولات دخول فاشلة آخر 24 ساعة.' }));
      const sas = SA.card({ title: 'الحسابات ذات الامتيازات العالية', actions: [linkIf('users/security', 'أمان Super Admin')] }, h('ul.saps-list', {}, m.sas.map((u) => row(u, u.mfa ? SA.chip('MFA مفعّل', 'success') : SA.chip('بدون MFA', 'danger'), 'Super Admin · آخر دخول ' + SA.fmt.rel(u.lastLogin))).concat(m.salHolders.length ? [h('li.saps-row', {}, h('span.sap-sess-ico', {}, SA.icon('coins')), h('div', {}, h('b', {}, m.salHolders.length + ' مستخدمين يملكون عرض الأجور (hr.salary.view)'), h('small', {}, m.salHolders.map((u) => u.name).join('، '))))] : [])));
      const perm = SA.card({ title: 'آخر تغييرات الصلاحيات (7 أيام)', actions: [aHref('range=7d') ? h('a.sap-linkbtn', { href: aHref('range=7d') }, 'السجل') : null] }, m.permEv.length ? h('div.audit.sap-audit-mini', {}, m.permEv.slice(0, 5).map((e) => h('div.audit-item', { style: { cursor: SA.auditView ? 'pointer' : '' }, onclick: () => SA.auditView && canAudit && SA.auditView.open(e) }, h('span.audit-ico', {}, SA.icon('key')), h('div', {}, h('b', {}, SA.auditLabel(e.code)), h('small', {}, actorName(e) + (e.target ? ' · ' + e.target.label : ''))), h('time', {}, SA.fmt.rel(e.ts))))) : SA.empty({ icon: 'key', title: 'لا تغييرات حديثة', text: 'لم تتغير صلاحيات آخر 7 أيام.' }));
      const pc = { web: 0, ios: 0, android: 0 }; m.sess.forEach((s) => { pc[s.platform] = (pc[s.platform] || 0) + 1; }); const tot = m.sess.length || 1; const shared = m.sess.filter((s) => /مشترك/.test(s.device)).length;
      const sessCard = SA.card({ title: 'الجلسات النشطة', actions: [SA.can('sa.sessions.view') ? h('a.sap-linkbtn', { href: SA.href('sessions') }, 'إدارة الجلسات') : null] }, h('div', {}, h('div.saps-bar', {}, ['web', 'ios', 'android'].map((k, i) => h('i', { style: { width: pc[k] / tot * 100 + '%', background: ['var(--eg-navy)', 'var(--color-accent)', 'var(--color-info)'][i] } }))), h('div.saps-legend', {}, [['web', 'ويب', 'var(--eg-navy)'], ['ios', 'iPhone', 'var(--color-accent)'], ['android', 'Android', 'var(--color-info)']].map((x) => h('span', { style: { '--c': x[2] } }, x[1] + ' ' + pc[x[0]]))), shared ? SA.alert('warning', shared + ' جلسة على جهاز مشترك — راجعها وأنهِها عند انتهاء الوردية (بند 30).') : null));
      const hrSens = SA.card({ title: 'الاطلاع على البيانات الحساسة (7 أيام)', actions: [SA.can('sa.access_log.view') ? h('a.sap-linkbtn', { href: SA.href('access-log') }, 'سجل الاطلاع') : null] }, m.sens7.length ? h('ul.saps-list', {}, Object.entries(m.sens7.reduce((o, e) => { const k = actorName(e); o[k] = (o[k] || 0) + 1; return o; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => h('li.saps-row', {}, h('span.sap-sess-ico', {}, SA.icon('eye')), h('div', {}, h('b', {}, x[0]), h('small', {}, 'فتح بيانات T3/T4')), SA.chip(x[1] + ' مرة', 'info')))) : SA.empty({ icon: 'eye', title: 'لا اطلاع مسجّل', text: 'لم يفتح أحد بيانات حساسة آخر 7 أيام.' }));
      host.append(h('div.saps-grid', { style: { marginTop: '16px' } }, locked, failedCard, sas, perm, sessCard, hrSens));
    }
    head.append(SA.pageHead({ title: 'مركز الأمان', desc: 'مؤشرات أمان حيّة مشتقة من نفس سجل التدقيق والمستخدمين والجلسات — كل رقم يفتح القائمة المفلترة وراءه.', tags: [SA.tag('new')], actions: [SA.can('sa.sessions.view') ? h('a.btn.btn-ghost', { href: SA.href('sessions') }, SA.icon('phone', 'icon-sm'), 'الجلسات والأجهزة') : null] }));
    host.append(SA.skeleton({ kind: 'cards', rows: 8 }));
    SA.delay(260, { write: false }).then(() => { state = 'ready'; draw(); }, () => { SA.clear(host); host.append(SA.errorState({ onRetry: () => SA.router.refresh() })); });
    const offs = ['audit', 'users', 'sessions', 'roles'].map((p) => st.subscribe(p, () => { if (state === 'ready') draw(); }));
    return () => offs.forEach((f) => f());
  }
  const actorName = (e) => (e.actor && e.actor.name) || '—';

  /* ═════════════════ SA-05 sessions & devices ═════════════════ */
  function renderSessions(root, ctx) {
    ctx.setCrumbs([{ label: 'الوصول' }, { label: 'الجلسات والأجهزة' }]);
    const den = SA.guard('sa.sessions.view'); if (den) { root.appendChild(den); return; }
    const q = ctx.params; let table = null; let state = 'loading'; const head = h('div'); const host = h('div'); root.append(head, host);
    const cur = () => SA.session.data.sessionId;
    const rows = () => st.get('sessions') || [];
    async function bulkRevoke(list) {
      const ok = list.filter((s) => s.status === 'active' && s.id !== cur()); if (!ok.length) { SA.toast('لا توجد جلسات نشطة قابلة للإنهاء ضمن المحدد (جلستك الحالية مستثناة).', 'warn'); return; }
      const r = await SA.confirm({ title: 'إنهاء ' + ok.length + ' جلسة/جهاز', danger: true, confirmLabel: 'إنهاء الكل', reasonRequired: true, reasonLabel: 'سبب الإنهاء', impact: ['تفقد الجلسات الوصول في أول طلب.', 'الأجهزة المحمولة يتوقف عنها الـpush.', 'المستخدمون: ' + Array.from(new Set(ok.map((s) => SA.userName(s.userId)))).slice(0, 5).join('، ')] }); if (!r.ok) return;
      if (!(await SA.stepUp('sessions.revoke_all'))) return;
      try { await SA.api(() => { const now = new Date().toISOString(); ok.forEach((s) => { st.patch('sessions', s.id, { status: 'revoked', revokedAt: now, revokedBy: me().id, pushStatus: s.platform !== 'web' ? 'revoked' : s.pushStatus }); SA.audit(s.platform === 'web' ? 'SESSION.REVOKED' : 'DEVICE.REVOKED', { target: { type: 'session', id: s.id, label: SA.userName(s.userId) + ' — ' + s.device }, reason: r.reason, before: { status: 'active' }, after: { status: 'revoked' } }); }); }); } catch (e) { SA.fail(e); return; }
      if (table) table.clearSelection(); SA.toast('تم إنهاء ' + ok.length + ' جلسة', 'success');
    }
    function build() {
      SA.clear(head); SA.clear(host); const act = rows().filter((s) => s.status === 'active'); const mob = act.filter((s) => s.platform !== 'web').length;
      head.append(SA.pageHead({ title: 'الجلسات والأجهزة', desc: 'كل الجلسات والأجهزة النشطة عبر النظام: تُنهى جلسة أو جهاز بعينه، وتفقد الجلسة الملغاة الوصول في أول طلب. إنهاء كل جلسات مستخدم يحتاج Step-up.', tags: [SA.tag('pending', 'Pending بند 15')], actions: [] }),
        h('div.sap-statrow.sap-pills', {}, h('span', {}, h('b.num', {}, act.length), 'جلسة نشطة'), h('span', {}, h('b.num', {}, mob), 'جهاز موبايل'), h('span', {}, h('b.num', {}, act.filter((s) => /مشترك/.test(s.device)).length), 'جهاز مشترك')));
      table = SA.table({
        rowId: 'id', selectable: true, pageSize: 10, state, caption: 'الجلسات والأجهزة', initial: { q: q.q || '', filters: { status: q.status || 'active', platform: q.platform || '', userId: q.user || '' }, sort: { key: 'lastActive', dir: 'desc' } },
        rows, search: { placeholder: 'ابحث بالمستخدم أو الجهاز أو IP…', keys: [(s) => SA.userName(s.userId), 'device', 'ip'] },
        filters: [{ key: 'status', label: 'الحالة', options: [['active', 'نشطة'], ['revoked', 'مُنهاة'], ['ended', 'منتهية']] }, { key: 'platform', label: 'المنصة', options: [['web', 'ويب'], ['ios', 'iPhone'], ['android', 'Android']] }, { key: 'userId', label: 'المستخدم', options: (st.get('users') || []).filter((u) => rows().some((s) => s.userId === u.id)).map((u) => [u.id, u.name]) }],
        columns: [
          { key: 'userId', label: 'المستخدم', sort: true, value: (s) => SA.userName(s.userId), render: (s) => { const u = SA.userById(s.userId); return u ? SA.userCell(u, { sub: SA.roleName(u.roleId), you: u.id === (me() || {}).id }) : s.userId; } },
          { key: 'device', label: 'الجهاز', sort: true, render: (s) => { const p = PLAT[s.platform] || PLAT.web; return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' } }, h('span.sap-sess-ico', { style: { width: '32px', height: '32px' } }, SA.icon(p[1], 'icon-sm')), h('span', {}, s.device, /مشترك/.test(s.device) ? h('span.saps-shared', {}, 'مشترك') : null, s.id === cur() ? h('span.sap-you', {}, 'جلستك') : null, h('br'), h('small.t-muted', {}, p[0]))); } },
          { key: 'ip', label: 'IP', render: (s) => h('span.num', { dir: 'ltr' }, s.ip) },
          { key: 'lastActive', label: 'آخر نشاط', sort: (a, b) => new Date(a.lastActive) - new Date(b.lastActive), render: (s) => h('span.t-muted', { title: SA.fmt.dt(s.lastActive) }, SA.fmt.rel(s.lastActive)) },
          { key: 'pushStatus', label: 'Push', render: (s) => (s.platform === 'web' ? h('span.sap-dash', {}, '—') : SA.chip(s.pushStatus === 'active' ? 'نشط' : 'ملغى', s.pushStatus === 'active' ? 'success' : 'neutral')) },
          { key: 'status', label: 'الحالة', sort: true, render: (s) => SA.statusChip('session', s.status) }
        ],
        bulk: [{ label: 'إنهاء المحدد', icon: 'logout', danger: true, perm: 'sa.sessions.revoke', run: bulkRevoke }],
        rowActions: (s) => [{ label: s.platform === 'web' ? 'إنهاء الجلسة' : 'إلغاء الجهاز', icon: 'logout', danger: true, disabled: s.status !== 'active' ? 'الجلسة غير نشطة' : s.id === cur() ? 'دي جلستك الحالية' : SA.can('sa.sessions.revoke') || SA.can('sa.users.force_logout') ? false : NOPERM('sa.sessions.revoke'), onClick: () => SA.sessions.revoke(s.id) }, { label: 'إنهاء كل جلسات المستخدم…', icon: 'userx', danger: true, disabled: s.userId === (me() || {}).id ? 'استخدم تسجيل الخروج لحسابك' : SA.can('sa.users.force_logout') ? false : NOPERM('sa.users.force_logout'), onClick: () => SA.users.forceLogout(s.userId) }, { divider: true }, { label: 'فتح المستخدم', icon: 'user', disabled: SA.can('sa.users.view') ? false : NOPERM('sa.users.view'), onClick: () => SA.nav('users/' + s.userId + '?tab=sessions') }],
        empty: { icon: 'phone', title: 'لا توجد جلسات', text: 'لا جلسات مطابقة.' }, onRetry: load
      });
      host.append(h('div.card.card-flush.sap-listcard', {}, table.el));
    }
    function load() { state = 'loading'; build(); SA.delay(280, { write: false }).then(() => { state = 'ready'; build(); }, () => { state = 'error'; build(); table.setState('error'); }); }
    load(); const unsub = st.subscribe('sessions', () => { if (state === 'ready' && table) table.refresh(); });
    return unsub;
  }

  /* ═════════════════ SA-06 dealers ═════════════════ */
  const REQ_ST = SA.catalog.status.dealer;
  const viaLabel = (d) => (d && d.via === 'override' ? 'تجاوز Super Admin' : d ? 'المبيعات' : '—');
  function askDialog(o) {
    return new Promise((resolve) => {
      const fields = o.fields || []; const reason = SA.form.field({ name: 'reason', label: o.reasonLabel || 'السبب', type: 'textarea', required: !!o.need, rows: 3, placeholder: o.need ? 'اكتب السبب (3 أحرف على الأقل)…' : 'اختياري', rules: o.need ? [(v) => (String(v || '').trim().length < 3 ? 'السبب مطلوب — 3 أحرف على الأقل' : null)] : [] });
      const btn = h('button.btn.' + (o.danger ? 'btn-accent' : 'btn-primary'), { type: 'button', onclick: () => { const ok = fields.concat([reason]).map((f) => f.validate()).every(Boolean); if (!ok) return; const vals = {}; fields.forEach((f) => { vals[f.name] = f.get(); }); m.close({ ok: true, reason: reason.get().trim(), vals }); } }, o.confirm || 'تأكيد');
      const m = SA.modal({ title: o.title, icon: o.icon || (o.danger ? 'alert' : 'info'), danger: !!o.danger, size: 'md', body: h('div.sap-confirm', {}, o.text ? h('p', {}, o.text) : null, (o.warnings || []).map((w) => SA.alert('warning', w)), o.impact && o.impact.length ? h('div.sap-impact', {}, h('b', {}, 'الأثر'), h('ul', {}, o.impact.map((t) => h('li', {}, t)))) : null, fields.map((f) => f.el), reason.el, h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), 'يتسجّل في سجل التدقيق باسمك مع الوقت والسبب.')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close({ ok: false }) }, 'إلغاء'), btn] });
      m.closed.then((r) => resolve(r || { ok: false }));
    });
  }
  const plOptions = () => (st.get('priceLists') || []).filter((p) => p.status === 'active').map((p) => [p.id, p.name]);
  function createAccount(req, priceListId) {
    const dId = st.nextId('dealers', 'DL', 2); const cId = st.nextId('customers', 'C', 3); const num = cId.split('-')[1];
    st.insert('customers', { id: cId, code: 'CUS-' + num, name: req.company, type: 'dealer', city: req.city, contacts: [{ name: req.contact, phone: req.phone }], salesRepId: null, priceListId, status: 'active', balance: 0, openOrders: 0, dealerId: dId });
    st.insert('dealers', { id: dId, requestId: req.id, company: req.company, customerId: cId, priceListId, status: 'active', createdAt: new Date().toISOString() });
    st.update('priceLists', (l) => { const p = l.find((x) => x.id === priceListId); if (p && p.assignedTo.indexOf(dId) < 0) p.assignedTo.push(dId); });
    return { dId, cId };
  }
  /** Apply a decision to a dealer request. via 'sales' → DEALER.REQUEST_*; via 'override' → DEALER.OVERRIDDEN. */
  function applyDecision(reqId, outcome, o) {
    const req = st.find('dealerRequests', reqId); const via = o.via || 'sales'; const u = me(); const now = new Date().toISOString(); const prev = { status: req.status, decidedVia: req.decision ? req.decision.via : null };
    const eff = [];
    st.patch('dealerRequests', reqId, { status: outcome, reviewerId: u.id, decision: { by: u.id, at: now, reason: o.reason || '', via } });
    if (outcome === 'approved') {
      if (req.accountId && st.find('dealers', req.accountId)) { st.patch('dealers', req.accountId, { status: 'active' }); const d = st.find('dealers', req.accountId); if (d.customerId) st.patch('customers', d.customerId, { status: 'active' }); eff.push('أُعيد تفعيل حساب التاجر ' + req.accountId); }
      else { const pl = o.priceListId || 'PL-02'; const a = createAccount(req, pl); st.patch('dealerRequests', reqId, { accountId: a.dId }); eff.push('أُنشئ حساب التاجر ' + a.dId + ' وسجل العميل ' + a.cId + ' وقائمة الأسعار ' + pl); }
    } else if (prev.status === 'approved' && req.accountId) {
      st.patch('dealers', req.accountId, { status: 'suspended' }); const d = st.find('dealers', req.accountId); if (d && d.customerId) st.patch('customers', d.customerId, { status: 'disabled' }); eff.push('أُوقف حساب التاجر ' + req.accountId + ' وعُطّل سجل العميل');
    }
    const tgt = { type: 'dealer_request', id: reqId, label: req.company };
    if (via === 'override') SA.audit('DEALER.OVERRIDDEN', { target: tgt, reason: o.reason + (o.viaApproval ? ' (عبر الاعتماد ' + o.viaApproval + ')' : ''), before: { status: prev.status, decidedVia: prev.decidedVia || '—' }, after: { status: outcome, decidedVia: 'override', effects: eff.join(' · ') } });
    else SA.audit({ approved: 'DEALER.REQUEST_APPROVED', rejected: 'DEALER.REQUEST_REJECTED', needs_info: 'DEALER.REQUEST_NEEDS_INFO' }[outcome], { target: tgt, reason: o.reason, before: { status: prev.status }, after: { status: outcome, effects: eff.join(' · ') || undefined } });
    if (via === 'override') SA.notify({ title: 'تم تجاوز قرار المبيعات: ' + req.company, body: 'قرار «' + (REQ_ST[prev.status] || [prev.status])[0] + '» صار «' + (REQ_ST[outcome] || [outcome])[0] + '» — السبب: ' + o.reason, level: 'urgent', to: ['R-03', 'R-01'], link: SA.link.dealer(reqId) });
    else if (outcome !== 'approved') SA.notify({ title: (outcome === 'rejected' ? 'رُفض' : 'مطلوب استكمال') + ' طلب تاجر: ' + req.company, body: o.reason, level: 'info', to: ['R-03'], link: SA.link.dealer(reqId) });
    return { eff, req: st.find('dealerRequests', reqId) };
  }
  async function decide(reqId, outcome) {
    const req = st.find('dealerRequests', reqId); if (!req) return false;
    if (isSuper() || !SA.can('sa.dealers.review')) { SA.toast(isSuper() ? 'القرار الأصلي للمبيعات — استخدم «تجاوز قرار المبيعات» مع سبب.' : NOPERM('sa.dealers.review'), 'warn', { ms: 5500 }); return false; }
    if (req.status !== 'pending_review' && req.status !== 'needs_info') { SA.toast('الطلب مُقرَّر بالفعل — التغيير بعد القرار للتجاوز فقط.', 'warn'); return false; }
    const missing = req.docs.filter((d) => !d.ok);
    const T = { approved: ['اعتماد طلب التاجر', 'اعتماد وإنشاء الحساب', 'checkcircle', false], rejected: ['رفض طلب التاجر', 'رفض الطلب', 'xcircle', true], needs_info: ['طلب استكمال بيانات', 'إرسال طلب الاستكمال', 'edit', false] }[outcome];
    const fields = outcome === 'approved' ? [SA.form.field({ name: 'priceListId', label: 'قائمة الأسعار', type: 'select', required: true, options: [['', 'اختر قائمة الأسعار…']].concat(plOptions()), hint: 'تحديد من يملك تعديل القوائم داخل المبيعات Open (بند 31).' })] : [];
    const r = await askDialog({ title: T[0] + ' — ' + req.company, confirm: T[1], icon: T[2], danger: T[3], need: outcome !== 'approved', reasonLabel: outcome === 'approved' ? 'ملاحظة (اختياري)' : outcome === 'rejected' ? 'سبب الرفض (يصل للتاجر)' : 'ما المطلوب استكماله؟ (يصل للتاجر)', fields,
      warnings: outcome === 'approved' && missing.length ? ['المستندات الناقصة: ' + missing.map((d) => d.name).join('، ') + ' — قائمة المستندات المطلوبة Open (بند 32).'] : [], impact: outcome === 'approved' ? ['ينشأ حساب تاجر منفصل عن المستخدمين الداخليين ولا يشارك أدوار RBAC.', 'يُربط بسجل عميل ويُسند قائمة الأسعار المختارة.', 'يصل التاجر إشعار بالاعتماد (محاكاة).'] : ['يصل التاجر إشعار بالقرار والسبب (محاكاة).'] });
    if (!r.ok) return false;
    try { await SA.api(() => applyDecision(reqId, outcome, { reason: r.reason, priceListId: r.vals.priceListId, via: 'sales' })); } catch (e) { SA.fail(e); return false; }
    SA.toast({ approved: 'تم اعتماد الطلب وإنشاء حساب التاجر', rejected: 'تم رفض الطلب', needs_info: 'تم إرسال طلب الاستكمال' }[outcome], 'success'); return true;
  }
  async function override(reqId) {
    const req = st.find('dealerRequests', reqId); if (!req) return false;
    if (!SA.can('sa.dealers.override')) { SA.toast(NOPERM('sa.dealers.override'), 'warn'); return false; }
    const opts = [['approved', 'اعتماد الطلب'], ['rejected', 'رفض الطلب']].filter((x) => x[0] !== req.status);
    const fields = [SA.form.field({ name: 'outcome', label: 'القرار الجديد', type: 'select', required: true, options: [['', 'اختر…']].concat(opts) }), SA.form.field({ name: 'priceListId', label: 'قائمة الأسعار (عند الاعتماد)', type: 'select', options: [['', 'القائمة الافتراضية (PL-02)']].concat(plOptions()) })];
    const r = await askDialog({ title: 'تجاوز قرار المبيعات — ' + req.company, confirm: 'تنفيذ التجاوز', icon: 'shield', danger: true, need: true, reasonLabel: 'سبب التجاوز (حرج — يُسجَّل ويصل لمدير المبيعات)', text: 'القرار الحالي: «' + (REQ_ST[req.status] || [req.status])[0] + '»' + (req.decision ? ' — ' + viaLabel(req.decision) + ': ' + (req.decision.reason || '—') : '') + '. المبيعات هي الأصل؛ تجاوزك يُسجَّل كحدث حرج (بند 32).', fields, impact: ['يُسجَّل DEALER.OVERRIDDEN (حرج) ويُبلَّغ مدير المبيعات.', 'اعتماد ⇒ ينشأ حساب التاجر · رفض بعد اعتماد ⇒ يُوقف الحساب ويُعطَّل سجل العميل.'], warnings: ['سيُطلب منك Step-up قبل التنفيذ.'] });
    if (!r.ok) return false;
    if (!(await SA.stepUp('dealer.override', { text: 'تجاوز قرار المبيعات عملية حرجة. أعد التحقق للمتابعة.' }))) return false;
    try { await SA.api(() => applyDecision(reqId, r.vals.outcome, { reason: r.reason, priceListId: r.vals.priceListId || 'PL-02', via: 'override' })); } catch (e) { SA.fail(e); return false; }
    SA.toast('تم تنفيذ التجاوز وتسجيله (حدث حرج)', 'success'); return true;
  }
  async function setStatus(id, to) {
    const d = st.find('dealers', id); if (!d) return false; if (!SA.can('sa.dealers.suspend')) { SA.toast(NOPERM('sa.dealers.suspend'), 'warn'); return false; }
    const sus = to === 'suspended'; const r = await askDialog({ title: (sus ? 'إيقاف حساب التاجر: ' : 'إعادة تفعيل حساب التاجر: ') + d.company, confirm: sus ? 'إيقاف الحساب' : 'إعادة التفعيل', danger: sus, need: true, icon: sus ? 'userx' : 'checkcircle', impact: sus ? ['لا يستطيع التاجر الدخول أو تقديم طلبات جديدة.', 'سجل العميل المرتبط يُعطَّل (لا حذف).'] : ['يعود الحساب نشطًا وسجل العميل المرتبط يُفعَّل.'] });
    if (!r.ok) return false;
    try { await SA.api(() => { st.patch('dealers', id, { status: to }); if (d.customerId) st.patch('customers', d.customerId, { status: sus ? 'disabled' : 'active' }); SA.audit(sus ? 'DEALER.SUSPENDED' : 'DEALER.REACTIVATED', { target: { type: 'dealer', id, label: d.company }, reason: r.reason, before: { status: d.status }, after: { status: to } }); }); } catch (e) { SA.fail(e); return false; }
    SA.toast(sus ? 'تم إيقاف حساب التاجر' : 'تمت إعادة التفعيل', 'success'); return true;
  }
  SA.dealersApi = { decide, applyOverride(reqId, outcome, o) { return applyDecision(reqId, outcome, Object.assign({ via: 'override' }, o)); }, suspend: (id) => setStatus(id, 'suspended'), reactivate: (id) => setStatus(id, 'active') };

  function reqDrawer(id, onClosed) {
    let leaving = false; const body = h('div.sap-drawer-inner'); const foot = h('div.saps-foot');
    const d = SA.drawer({ title: 'طلب تسجيل تاجر', subtitle: id, size: 'lg', body, foot: [foot], onClose: () => { unsub(); if (!leaving) onClosed(); } });
    function draw() {
      SA.clear(body); SA.clear(foot); const r = st.find('dealerRequests', id); if (!r) { body.append(SA.empty({ icon: 'inbox', title: 'الطلب غير موجود' })); return; }
      d.setTitle(r.company, r.id + ' · ' + SA.fmt.rel(r.submittedAt)); const open = r.status === 'pending_review' || r.status === 'needs_info'; const sales = !isSuper() && SA.can('sa.dealers.review'); const ovr = SA.can('sa.dealers.override');
      body.append(h('div.cluster', {}, SA.statusChip('dealer', r.status), r.decision ? SA.chip(viaLabel(r.decision), r.decision.via === 'override' ? 'danger' : 'info') : null),
        h('div.sapi-panel-sec', { style: { marginTop: '14px' } }, h('h4', {}, SA.icon('building', 'icon-sm'), 'بيانات المنشأة'), SA.kv([['المنشأة', r.company], ['المسؤول', r.contact], ['الهاتف', h('span.num', { dir: 'ltr' }, r.phone)], ['المدينة', r.city], ['قُدّم', SA.fmt.dt(r.submittedAt)]])),
        h('div.sapi-panel-sec', {}, h('h4', {}, SA.icon('doc', 'icon-sm'), 'المستندات'), h('div', {}, r.docs.map((x) => h('div.saps-doc', {}, SA.icon(x.ok ? 'checkcircle' : 'xcircle', 'icon-sm ' + (x.ok ? 'is-ok' : 'is-miss')), x.name, h('span.t-muted', {}, x.ok ? ' — مرفوع' : ' — ناقص')))), h('p.t-caption.t-muted', {}, 'قائمة المستندات المطلوبة: ', SA.openValue('Open (بند 32)'))));
      if (r.decision) body.append(h('div.sapi-panel-sec', {}, h('h4', {}, SA.icon('history', 'icon-sm'), 'القرار الحالي'), SA.kv([['القرار', (REQ_ST[r.status] || [r.status])[0]], ['بواسطة', SA.userName(r.decision.by) + ' — ' + viaLabel(r.decision)], ['السبب', r.decision.reason || '—'], ['الوقت', SA.fmt.dt(r.decision.at)], r.accountId ? ['حساب التاجر', SA.can('sa.dealers.view') ? h('a', { href: SA.href('dealers/' + r.accountId) }, r.accountId) : r.accountId] : null])));
      const ev = A().filter((e) => e.target && e.target.id === id).slice(0, 6);
      if (ev.length) body.append(h('div.sapi-panel-sec', {}, h('h4', {}, SA.icon('history', 'icon-sm'), 'السجل'), h('div.audit.sap-audit-mini', {}, ev.map((e) => h('div.audit-item', {}, h('span.audit-ico' + (e.code === 'DEALER.OVERRIDDEN' ? '.is-warn' : ''), {}, SA.icon('history')), h('div', {}, h('b', {}, SA.auditLabel(e.code)), h('small', {}, e.actor.name + (e.reason ? ' · ' + e.reason : ''))), h('time', {}, SA.fmt.rel(e.ts)))))));
      if (isSuper() && open) body.append(SA.alert('info', 'القرار الأصلي للمبيعات. كـSuper Admin يمكنك التجاوز بسبب مسجّل (Step-up) — لا اعتماد صامت.'));
      if (!sales && !isSuper() && !ovr) body.append(SA.alert('info', 'عرض فقط — المراجعة من صلاحيات المبيعات (sa.dealers.review).'));
      const lock = (k) => (SA.can(k) ? '' : NOPERM(k));
      if (sales && open) foot.append(SA.btn({ label: 'اعتماد', icon: 'check', kind: 'primary', class: 'saps-grow', onClick: () => decide(id, 'approved') }), SA.btn({ label: 'رفض', icon: 'x', kind: 'danger', onClick: () => decide(id, 'rejected') }), SA.btn({ label: 'طلب استكمال', icon: 'edit', kind: 'ghost', onClick: () => decide(id, 'needs_info') }));
      if (ovr) foot.append(SA.btn({ label: 'تجاوز قرار المبيعات…', icon: 'shield', kind: sales ? 'ghost' : 'primary', class: sales ? '' : 'saps-grow', reason: lock('sa.dealers.override'), onClick: () => override(id) }));
      if (!foot.children.length) foot.append(h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close() }, 'إغلاق'));
    }
    const unsub = (function () { const offs = ['dealerRequests', 'dealers', 'audit'].map((p) => st.subscribe(p, () => { if (document.body.contains(d.el)) draw(); })); return () => offs.forEach((f) => f()); })();
    draw(); return { close() { leaving = true; d.close(); } };
  }
  function accDrawer(id, onClosed) {
    let leaving = false; const body = h('div.sap-drawer-inner'); const foot = h('div.saps-foot');
    const d = SA.drawer({ title: 'حساب تاجر', subtitle: id, size: 'lg', body, foot: [foot], onClose: () => { unsub(); if (!leaving) onClosed(); } });
    function draw() {
      SA.clear(body); SA.clear(foot); const a = st.find('dealers', id); if (!a) { body.append(SA.empty({ icon: 'inbox', title: 'الحساب غير موجود' })); return; }
      d.setTitle(a.company, a.id); const pl = st.find('priceLists', a.priceListId); const cust = a.customerId ? st.find('customers', a.customerId) : null;
      body.append(h('div.cluster', {}, SA.statusChip('dealer', a.status)), SA.alert('info', 'حساب خارجي منفصل: لا يظهر في المستخدمين ولا يشارك أدوار RBAC، ولا يرى بيانات عملاء آخرين أو التكاليف (بند 27).'),
        h('div.sapi-panel-sec', {}, SA.kv([['المنشأة', a.company], ['أُنشئ', SA.fmt.dt(a.createdAt)], ['طلب التسجيل', SA.can('sa.dealers.view') ? h('a', { href: SA.link.dealer(a.requestId) }, a.requestId) : a.requestId], ['سجل العميل', cust ? (SA.can('sa.customers.view') ? h('a', { href: SA.href('customers?q=' + cust.code) }, cust.code + ' — ' + cust.name) : cust.code) : 'غير مربوط'], ['قائمة الأسعار', pl ? pl.name : '—']])));
      const ev = A().filter((e) => e.target && (e.target.id === id || e.target.id === a.requestId)).slice(0, 6);
      if (ev.length) body.append(h('div.sapi-panel-sec', {}, h('h4', {}, SA.icon('history', 'icon-sm'), 'السجل'), h('div.audit.sap-audit-mini', {}, ev.map((e) => h('div.audit-item', {}, h('span.audit-ico', {}, SA.icon('history')), h('div', {}, h('b', {}, SA.auditLabel(e.code)), h('small', {}, e.actor.name + (e.reason ? ' · ' + e.reason : ''))), h('time', {}, SA.fmt.rel(e.ts)))))));
      foot.append(SA.btn({ label: 'تغيير قائمة الأسعار…', icon: 'list', kind: 'ghost', reason: SA.can('sa.dealers.view') && (SA.can('sa.dealers.suspend') || SA.can('sa.dealers.override')) ? '' : NOPERM('sa.dealers.suspend'), onClick: () => changePl(a) }), a.status === 'active' ? SA.btn({ label: 'إيقاف الحساب', icon: 'userx', kind: 'danger', class: 'saps-grow', reason: SA.can('sa.dealers.suspend') ? '' : NOPERM('sa.dealers.suspend'), onClick: () => setStatus(id, 'suspended') }) : SA.btn({ label: 'إعادة التفعيل', icon: 'checkcircle', kind: 'primary', class: 'saps-grow', reason: SA.can('sa.dealers.suspend') ? '' : NOPERM('sa.dealers.suspend'), onClick: () => setStatus(id, 'active') }));
    }
    async function changePl(a) {
      const r = await askDialog({ title: 'تغيير قائمة الأسعار — ' + a.company, confirm: 'حفظ', fields: [SA.form.field({ name: 'pl', label: 'قائمة الأسعار الجديدة', type: 'select', required: true, options: plOptions(), value: a.priceListId })], need: true, impact: ['يتغيّر تسعير هذا التاجر في الطلبات الجديدة.', 'قاعدة الاعتماد لهذا التغيير Open (SA-12) — حاليًا يُنفَّذ مباشرة بسبب مسجّل.'] }); if (!r.ok) return;
      if (r.vals.pl === a.priceListId) { SA.toast('نفس القائمة الحالية', 'info'); return; }
      try { await SA.api(() => { st.update('priceLists', (l) => l.forEach((p) => { if (p.id === a.priceListId) p.assignedTo = p.assignedTo.filter((x) => x !== a.id); if (p.id === r.vals.pl && p.assignedTo.indexOf(a.id) < 0) p.assignedTo.push(a.id); })); st.patch('dealers', a.id, { priceListId: r.vals.pl }); if (a.customerId) st.patch('customers', a.customerId, { priceListId: r.vals.pl }); SA.audit('PRICELIST.CHANGED', { target: { type: 'dealer', id: a.id, label: a.company }, reason: r.reason, before: { priceList: a.priceListId }, after: { priceList: r.vals.pl } }); }); } catch (e) { SA.fail(e); return; }
      SA.toast('تم تغيير قائمة الأسعار', 'success');
    }
    const unsub = (function () { const offs = ['dealers', 'priceLists', 'audit'].map((p) => st.subscribe(p, () => { if (document.body.contains(d.el)) draw(); })); return () => offs.forEach((f) => f()); })();
    draw(); return { close() { leaving = true; d.close(); } };
  }
  function renderDealers(root, ctx) {
    const den = SA.guard('sa.dealers.view'); if (den) { root.appendChild(den); return; }
    const p0 = ctx.path[0] || ''; const tab = p0 === 'requests' ? 'requests' : 'accounts'; const openReq = p0 === 'requests' ? ctx.path[1] || null : null; const openAcc = /^DL-/.test(p0) ? p0 : null;
    const activeTab = openAcc ? 'accounts' : tab; let drawer = null, leaving = false, table = null, state = 'loading';
    ctx.setCrumbs([{ label: 'الوصول' }, { label: 'حسابات التجار', href: openReq || openAcc || activeTab === 'requests' ? '#/dealers' : null }].concat(activeTab === 'requests' ? [{ label: 'طلبات التسجيل', href: openReq ? '#/dealers/requests' : null }] : []).concat(openReq ? [{ label: openReq }] : openAcc ? [{ label: openAcc }] : []));
    const head = h('div'); const host = h('div'); root.append(head, host); const q = ctx.params;
    const pending = () => (st.get('dealerRequests') || []).filter((r) => r.status === 'pending_review');
    function build() {
      SA.clear(head); SA.clear(host);
      head.append(SA.pageHead({ title: 'حسابات التجار', desc: 'حسابات التجار الخارجية منفصلة عن المستخدمين الداخليين. المبيعات هي من يعتمد الطلبات؛ Super Admin يرى ويتجاوز بسبب مسجّل.', tags: [SA.tag('pending', 'Pending بنود 32 و34')] }));
      const t = SA.tabs({ label: 'حسابات التجار', tabs: [{ id: 'requests', label: 'طلبات التسجيل', icon: 'inbox', badge: pending().length }, { id: 'accounts', label: 'حسابات التجار', icon: 'building', badge: (st.get('dealers') || []).length }], active: activeTab, onChange: (id) => SA.nav(id === 'requests' ? 'dealers/requests' : 'dealers') });
      host.append(t.el);
      if (activeTab === 'accounts' && pending().length) host.append(h('div.saps-callout', { style: { marginBlock: '12px' } }, SA.icon('inbox', 'icon-sm'), pending().length + ' طلب تسجيل بانتظار مراجعة المبيعات', h('a', { href: SA.href('dealers/requests') }, 'افتح الطلبات')));
      if (activeTab === 'requests') {
        table = SA.table({
          rowId: 'id', pageSize: 10, state, caption: 'طلبات تسجيل التجار', initial: { q: q.q || '', filters: { status: q.status || '' }, sort: { key: 'submittedAt', dir: 'desc' } },
          rows: () => st.get('dealerRequests') || [], search: { placeholder: 'ابحث بالمنشأة أو المسؤول أو المدينة…', keys: ['company', 'contact', 'city', 'id'] },
          filters: [{ key: 'status', label: 'الحالة', options: Object.keys(REQ_ST).filter((k) => /pending_review|approved|rejected|needs_info/.test(k)).map((k) => [k, REQ_ST[k][0]]) }],
          columns: [
            { key: 'company', label: 'المنشأة', sort: true, render: (r) => h('span.sapi-title', {}, h('b', {}, r.company), h('small.num', {}, r.id + ' · ' + r.contact)) },
            { key: 'city', label: 'المدينة', sort: true },
            { key: 'docs', label: 'المستندات', render: (r) => { const ok = r.docs.filter((d) => d.ok).length; return SA.chip(ok + ' من ' + r.docs.length, ok === r.docs.length ? 'success' : 'warning'); } },
            { key: 'submittedAt', label: 'قُدّم', sort: (a, b) => new Date(a.submittedAt) - new Date(b.submittedAt), render: (r) => h('span.t-muted', {}, SA.fmt.rel(r.submittedAt)) },
            { key: 'status', label: 'الحالة', sort: true, render: (r) => SA.statusChip('dealer', r.status) },
            { key: 'decision', label: 'القرار', render: (r) => (r.decision ? h('span', {}, SA.userName(r.decision.by), h('br'), h('small.t-muted', {}, viaLabel(r.decision))) : h('span.sap-dash', {}, '—')) }
          ],
          rowActions: (r) => { const open = r.status === 'pending_review' || r.status === 'needs_info'; const sales = !isSuper() && SA.can('sa.dealers.review'); return [{ label: 'فتح التفاصيل', icon: 'eye', onClick: () => SA.nav('dealers/requests/' + r.id) }, { divider: true }, { label: 'اعتماد…', icon: 'check', hidden: !sales, disabled: open ? false : 'الطلب مُقرَّر', onClick: () => decide(r.id, 'approved') }, { label: 'رفض…', icon: 'x', danger: true, hidden: !sales, disabled: open ? false : 'الطلب مُقرَّر', onClick: () => decide(r.id, 'rejected') }, { label: 'تجاوز قرار المبيعات…', icon: 'shield', hidden: !SA.can('sa.dealers.override'), onClick: () => override(r.id) }]; },
          onRowClick: (r) => SA.nav('dealers/requests/' + r.id), empty: { icon: 'inbox', title: 'لا توجد طلبات تسجيل', text: 'ستظهر هنا طلبات التجار الجديدة.' }, onRetry: load
        });
      } else {
        table = SA.table({
          rowId: 'id', pageSize: 10, state, caption: 'حسابات التجار', initial: { q: q.q || '', filters: { status: q.status || '' }, sort: { key: 'createdAt', dir: 'desc' } },
          rows: () => st.get('dealers') || [], search: { placeholder: 'ابحث بالمنشأة…', keys: ['company', 'id'] },
          filters: [{ key: 'status', label: 'الحالة', options: [['active', 'نشط'], ['suspended', 'موقوف']] }],
          columns: [
            { key: 'company', label: 'المنشأة', sort: true, render: (a) => h('span.sapi-title', {}, h('b', {}, a.company), h('small.num', {}, a.id + ' · من الطلب ' + a.requestId)) },
            { key: 'priceListId', label: 'قائمة الأسعار', render: (a) => { const p = st.find('priceLists', a.priceListId); return p ? p.name : '—'; } },
            { key: 'createdAt', label: 'أُنشئ', sort: (a, b) => new Date(a.createdAt) - new Date(b.createdAt), render: (a) => h('span.t-muted', {}, SA.fmt.rel(a.createdAt)) },
            { key: 'status', label: 'الحالة', sort: true, render: (a) => SA.statusChip('dealer', a.status) }
          ],
          rowActions: (a) => [{ label: 'فتح التفاصيل', icon: 'eye', onClick: () => SA.nav('dealers/' + a.id) }, { divider: true }, a.status === 'active' ? { label: 'إيقاف الحساب…', icon: 'userx', danger: true, disabled: SA.can('sa.dealers.suspend') ? false : NOPERM('sa.dealers.suspend'), onClick: () => setStatus(a.id, 'suspended') } : { label: 'إعادة التفعيل…', icon: 'checkcircle', disabled: SA.can('sa.dealers.suspend') ? false : NOPERM('sa.dealers.suspend'), onClick: () => setStatus(a.id, 'active') }],
          onRowClick: (a) => SA.nav('dealers/' + a.id), empty: { icon: 'building', title: 'لا توجد حسابات تجار', text: 'تُنشأ الحسابات عند اعتماد طلبات التسجيل.' }, onRetry: load
        });
      }
      host.append(h('div.card.card-flush.sap-listcard', { style: { marginTop: '12px' } }, table.el));
    }
    function load() { state = 'loading'; build(); SA.delay(280, { write: false }).then(() => { state = 'ready'; build(); }, () => { state = 'error'; build(); table.setState('error'); }); }
    load();
    const offs = ['dealerRequests', 'dealers'].map((p) => st.subscribe(p, () => { if (state === 'ready') { build(); } }));
    if (openReq) { if (!st.find('dealerRequests', openReq)) { SA.toast('الطلب غير موجود', 'error'); history.replaceState(null, '', '#/dealers/requests'); } else drawer = reqDrawer(openReq, () => { if (!leaving) SA.nav('dealers/requests', { replace: true }); }); }
    if (openAcc) { if (!st.find('dealers', openAcc)) { SA.toast('الحساب غير موجود', 'error'); history.replaceState(null, '', '#/dealers'); } else drawer = accDrawer(openAcc, () => { if (!leaving) SA.nav('dealers', { replace: true }); }); }
    return () => { leaving = true; offs.forEach((f) => f()); if (drawer) drawer.close(); };
  }

  SA.register({ id: 'security-center', group: 'oversight', title: 'مركز الأمان', icon: 'shield', route: 'security-center', perm: 'sa.security_center.view', order: 30, desc: 'مؤشرات الأمان الحيّة', render: renderCenter });
  SA.register({ id: 'sessions', group: 'access', title: 'الجلسات والأجهزة', icon: 'phone', route: 'sessions', perm: 'sa.sessions.view', order: 40, desc: 'إنهاء الجلسات وإلغاء الأجهزة', render: renderSessions });
  SA.register({ id: 'dealers', group: 'access', title: 'حسابات التجار', icon: 'building', route: 'dealers', perm: 'sa.dealers.view', order: 50, desc: 'طلبات التسجيل وحسابات التجار', badge() { const n = pending().length; return SA.can('sa.dealers.view') && n ? n : null; }, render: renderDealers });
  function pending() { return (st.get('dealerRequests') || []).filter((r) => r.status === 'pending_review'); }
  SA.search.register({ id: 'dealers', label: 'التجار', perm: 'sa.dealers.view', query: (q) => (q ? (st.get('dealerRequests') || []).filter((r) => r.company.toLowerCase().indexOf(q) >= 0 || r.id.toLowerCase().indexOf(q) >= 0).map((r) => ({ title: r.company, sub: r.id + ' · ' + (REQ_ST[r.status] || [r.status])[0], icon: 'building', route: 'dealers/requests/' + r.id })) : []) });

  SA.missions.add({ id: 'M-B5', area: 'security', title: 'مركز الأمان: افتح قفل حساب وأنهِ جلسة من مكان واحد', persona: 'it', route: 'security-center', est: '3 د', goal: 'كـIT افتح مركز الأمان: لاحظ أن الأرقام مشتقة من السجل والمستخدمين. فك قفل «دعاء ماهر» ثم افتح «الجلسات» وأنهِ جلسة.', steps: [{ text: 'من البطاقة «حسابات موقوفة» اضغط فك القفل', audit: 'USER.UNLOCKED' }, { text: 'افتح الجلسات وأنهِ جلسة', audit: 'SESSION.REVOKED' }], detect: [{ audit: 'USER.UNLOCKED' }, { audit: 'SESSION.REVOKED' }] });
  SA.missions.add({ id: 'M-B6', area: 'dealers', title: 'تاجر جديد: المبيعات تعتمد ثم صاحب الشركة يتجاوز (رحلة كاملة)', persona: 'salesmgr', route: 'dealers/requests', est: '5 د', goal: 'كمدير مبيعات اعتمد طلب «مؤسسة النور» واختر قائمة أسعار (يُنشأ حساب تاجر + سجل عميل). ثم كصاحب الشركة افتح الطلب وتجاوز القرار برفضه مع سبب وStep-up؛ يُوقف الحساب ويصل إشعار لمدير المبيعات. تحقق من الأثر في العملاء والتدقيق.', steps: [{ text: 'اعتمد الطلب DR-102', audit: 'DEALER.REQUEST_APPROVED' }, { text: 'كصاحب الشركة: تجاوز القرار بسبب', audit: 'DEALER.OVERRIDDEN' }, { text: 'راجع الحدث في سجل التدقيق', route: 'audit' }], detect: [{ audit: 'DEALER.REQUEST_APPROVED' }, { audit: 'DEALER.OVERRIDDEN' }, { route: 'audit' }] });
})();
