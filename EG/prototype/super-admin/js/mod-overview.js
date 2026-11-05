/* EG Super Admin prototype — mod-overview.js  (SA-22 النظرة العامة — «إيه اللي محتاجني دلوقتي؟»)
   Route: #/overview (perm sa.overview.view). One home for Owner / GM / IT / Sales Manager … showing Super Admin AND HR together.
   Every number is derived LIVE from the store (users, roles, approvals, dealerRequests, audit, employees, payrollRuns, leaveRequests, requisitions, loans, settlements, modules, settings) — nothing hard-coded,
   so it always equals the detail screens. Each panel loads independently (skeleton → content | error with retry) so one failing panel never breaks the others (UC-OVW-01).
   Permission-aware: a panel whose permission the persona lacks shows a locked note; the sales KPI is hidden without the finance permission; HR panels respect the HR module switch (SA-09),
   hr.dashboard.view and the wage key (hr.salary.view → payroll gross is redacted otherwise). Quick approve/reject goes through SA.approvals.decide() (same rules + Step-up + SoD as SA-16 — UC-OVW-02).
   Empty / not-connected values: sales, production, stock alerts have no data source in this prototype → honest "غير متصل — عقد البيانات Open" cards, never invented numbers. */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  (function () {
    if (document.querySelector('style[data-mod="overview"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'overview');
    s.textContent = `
.sapo-hello { display: flex; flex-direction: column; gap: 4px; } .sapo-hello .sapo-sum { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.sapo-main { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 16px; align-items: start; } @media (max-width: 1100px) { .sapo-main { grid-template-columns: 1fr; } }
.sapo-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.sapo-sec { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 -4px; } .sapo-sec h2 { margin: 0; font-size: var(--text-h3); color: var(--eg-navy-deep); display: flex; align-items: center; gap: 8px; } .sapo-sec small { color: var(--color-text-muted); }
.sapo-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 14px; } .sapo-kpi { display: flex; flex-direction: column; gap: 2px; text-decoration: none; color: inherit; position: relative; transition: transform var(--duration-fast), box-shadow var(--duration-fast); } a.sapo-kpi:hover { transform: translateY(-2px); box-shadow: var(--sap-shadow-2); }
.sapo-kpi small { color: var(--color-text-muted); font-size: 12px; line-height: 1.5; } .sapo-kpi.is-bad { border-color: var(--color-danger); } .sapo-kpi.is-warn { border-color: var(--color-warning); } .sapo-kpi.is-off { background: var(--color-bg-alt); } .sapo-kpi.is-off .kpi-value { font-size: 1rem; color: var(--color-text-muted); }
.sapo-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; } .sapo-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 12px; background: #fff; } .sapo-item > .sapo-body { flex: 1; min-width: 0; } .sapo-item b { display: block; font-size: var(--text-dense); font-weight: 600; line-height: 1.4; } .sapo-item small { display: block; color: var(--color-text-muted); font-size: 12px; margin-top: 2px; }
.sapo-item.is-mine { border-color: var(--eg-navy-soft); background: linear-gradient(var(--color-primary-tint), #fff 60%); } .sapo-item a.sapo-title { color: inherit; text-decoration: none; } .sapo-item a.sapo-title:hover b { color: var(--color-primary); }
.sapo-ico { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: none; background: var(--color-primary-tint); color: var(--eg-navy); } .sapo-ico.is-danger { background: var(--color-danger-tint); color: var(--color-danger); } .sapo-ico.is-warn { background: var(--color-warning-tint); color: var(--color-warning); } .sapo-ico.is-info { background: var(--color-info-tint); color: var(--color-info); }
.sapo-act { display: flex; gap: 6px; flex: none; } .sapo-lock { display: flex; align-items: center; gap: 8px; padding: 14px; border-radius: 12px; background: var(--color-bg-alt); color: var(--color-text-muted); font-size: var(--text-dense); }
.sapo-split { display: flex; gap: 8px; flex-wrap: wrap; }
@media (max-width: 700px) { .sapo-item { flex-wrap: wrap; } .sapo-act { width: 100%; } }`;
    document.head.appendChild(s);
  })();
  const me = () => SA.session.user; const H24 = 864e5;
  const RUN = { prepared: 'مجهّز', hr_review: 'قيد مراجعة HR', finance_approved: 'اعتمدته المالية', gm_approved: 'اعتمده المدير العام', released: 'مُطلَق' };
  const T = SA.catalog.approvalTypes;
  const openable = (route) => { const m = SA.router.parse('#/' + route).module; return !!(m && SA.canOpen(m) && (m.app !== 'hr' || SA.appEnabled('hr'))); };
  const href = (route) => (openable(route) ? SA.href(route) : null);
  const locked = (perm, text) => h('div.sapo-lock', {}, SA.icon('lock', 'icon-sm'), h('span', {}, text || 'ليست من صلاحياتك', perm ? [' ', h('code', {}, perm)] : null));
  const pendingVisible = () => (st.get('approvals') || []).filter((a) => SA.approvals && SA.approvals.visible(a) && (a.status === 'pending' || a.status === 'delegated'));

  /* ── panel factory: independent loading / error / locked / live refresh ── */
  function panel(o) {
    const body = h('div'); let state = 'loading'; let timer = null; let dead = false;
    const card = o.bare ? h('div', {}, body) : SA.card({ title: o.title, actions: o.actions || null, class: o.class }, body);
    function draw() {
      SA.clear(body);
      if (o.perm && !SA.can(o.perm)) { body.append(locked(o.perm, o.lockText || 'هذه اللوحة ليست من صلاحياتك')); return; }
      if (state === 'loading') { body.append(SA.skeleton({ kind: 'form', rows: 3 })); return; }
      if (state === 'error') { body.append(SA.errorState({ title: 'تعذّر تحميل هذه اللوحة', text: 'باقي اللوحات تعمل. جرّب مرة أخرى.', onRetry: load })); return; }
      try { body.append(o.body()); } catch (e) { console.error(e); state = 'error'; draw(); }
    }
    function load() { state = 'loading'; draw(); clearTimeout(timer); timer = setTimeout(() => { SA.delay(0, { write: false }).then(() => { if (dead) return; state = 'ready'; draw(); }, () => { if (dead) return; state = 'error'; draw(); }); }, 80 + Math.random() * 380); }
    const offs = (o.paths || []).map((p) => st.subscribe(p, () => { if (state === 'ready') draw(); }));
    draw(); load();
    return { el: card, destroy() { dead = true; clearTimeout(timer); offs.forEach((f) => f()); } };
  }
  const kpi = (label, value, o) => { o = o || {}; const hf = o.route ? href(o.route) : null; return h((hf ? 'a' : 'div') + '.card.kpi.sapo-kpi' + (o.tone ? '.is-' + o.tone : '') + (o.off ? '.is-off' : ''), hf ? { href: hf } : {}, h('span.kpi-label', {}, label), h('span.kpi-value.num', typeof value === 'string' && value.length > 5 ? { style: { fontSize: '1.25rem', lineHeight: '1.6' } } : {}, value), o.sub ? h('small', {}, o.sub) : null); };

  /* ── data ── */
  function alerts() {
    const out = []; const users = st.get('users') || []; const L = st.get('audit') || []; const canU = SA.can('sa.users.view') || SA.can('sa.security_center.view');
    const locked = users.filter((u) => u.status === 'locked'); if (locked.length && canU) out.push({ tone: 'danger', icon: 'lock', text: locked.length + ' حساب موقوف: ' + locked.slice(0, 2).map((u) => u.name).join('، ') + (locked.length > 2 ? '…' : ''), route: SA.can('sa.users.view') ? 'users' : 'security-center', q: SA.can('sa.users.view') ? { status: 'locked' } : null, cta: 'فك القفل' });
    const sas = SA.rbac.superAdmins(true); const nomfa = sas.filter((u) => !u.mfa); if (nomfa.length && canU) out.push({ tone: 'danger', icon: 'shield', text: nomfa.length + ' حساب Super Admin بدون MFA: ' + nomfa.map((u) => u.name).join('، '), route: 'users', q: { mfa: 'no' }, cta: 'راجع' });
    if (sas.length < 2 && canU) out.push({ tone: 'danger', icon: 'shield', text: 'يوجد حساب Super Admin نشط واحد فقط — المطلوب حسابان على الأقل', route: 'users/security', cta: 'افتح الأمان' });
    const failed = L.filter((e) => (e.code === 'AUTH.LOGIN_FAILED' || e.code === 'AUTH.MFA_FAILED') && Date.now() - new Date(e.ts) < H24).reduce((a, e) => a + (e.count || 1), 0); if (failed && SA.can('sa.audit.view')) out.push({ tone: failed >= 5 ? 'warn' : 'info', icon: 'alert', text: failed + ' محاولة دخول فاشلة آخر 24 ساعة', route: 'audit', q: { code: 'AUTH.LOGIN_FAILED', range: '24h' }, cta: 'السجل' });
    const pend = users.filter((u) => u.status === 'pending'); if (pend.length && SA.can('sa.users.view')) out.push({ tone: 'info', icon: 'userplus', text: pend.length + ' مستخدم بانتظار التفعيل', route: 'users', q: { status: 'pending' }, cta: 'عرض' });
    const c = st.get('settings.company') || {}; const miss = [['الرقم الضريبي', c.taxId], ['السجل التجاري', c.commercialReg], ['العنوان الرسمي', c.address]].filter((x) => !x[1]); if (miss.length && SA.can('sa.company.view')) out.push({ tone: 'warn', icon: 'building', text: 'بيانات رسمية ناقصة: ' + miss.map((x) => x[0]).join('، '), route: 'company', cta: 'استكمل' });
    const disabledReq = (st.get('approvals') || []).filter((a) => (a.status === 'pending') && a.requesterDisabled && SA.approvals && SA.approvals.visible(a)); if (disabledReq.length) out.push({ tone: 'warn', icon: 'userx', text: disabledReq.length + ' طلب اعتماد مقدّمه معطّل', route: 'approvals', cta: 'افتح' });
    if (!SA.appEnabled('hr') && (st.get('approvals') || []).some((a) => a.area === 'hr' && a.status === 'pending') && SA.can('sa.modules.view')) out.push({ tone: 'warn', icon: 'layers', text: 'موديول الموارد البشرية معطّل وفيه اعتمادات HR معلّقة', route: 'modules', cta: 'الموديولات' });
    return out;
  }
  const tone = { danger: 'is-danger', warn: 'is-warn', info: 'is-info' };

  function approvalsBody() {
    const mine = SA.approvals ? SA.approvals.pendingForMe() : []; const all = pendingVisible(); const others = all.filter((a) => mine.indexOf(a) < 0 && !mine.some((m) => m.id === a.id));
    const list = mine.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(0, 5); const rest = list.length < 5 ? others.slice(0, 5 - list.length) : [];
    const bySa = all.filter((a) => a.area === 'sa').length, byHr = all.filter((a) => a.area === 'hr').length;
    const row = (a, isMine) => { const w = SA.approvals.why(a); return h('li.sapo-item' + (isMine ? '.is-mine' : ''), {}, h('span.sapo-ico' + (a.area === 'hr' ? '.is-info' : ''), {}, SA.icon((T[a.type] || {}).icon || 'inbox', 'icon-sm')), h('div.sapo-body', {}, h('a.sapo-title', { href: SA.href('approvals/' + a.id) }, h('b', {}, a.title)), h('small', {}, (T[a.type] || {}).label + ' · ' + SA.userName(a.requesterId) + ' · ' + SA.fmt.rel(a.createdAt) + (isMine ? '' : ' · بانتظار ' + (a.chain.find((c) => c.step === a.currentStep) || {}).label))), isMine ? h('div.sapo-act', {}, SA.btn({ label: 'اعتماد', icon: 'check', kind: 'primary', size: 'sm', reason: w, onClick: () => SA.approvals.decide(a.id, 'approve') }), SA.btn({ label: 'رفض', icon: 'x', kind: 'ghost', size: 'sm', reason: w, onClick: () => SA.approvals.decide(a.id, 'reject') })) : h('a.btn.btn-ghost.btn-sm', { href: SA.href('approvals/' + a.id) }, 'فتح')); };
    if (!list.length && !rest.length) return SA.empty({ icon: 'checkcircle', title: 'لا شيء ينتظر قرارك', text: 'كل الاعتمادات المطلوبة منك تم البتّ فيها.' });
    return h('div', {}, h('div.sapo-split', { style: { marginBottom: '10px' } }, SA.chip('Super Admin ' + bySa, 'neutral'), SA.chip('الموارد البشرية ' + byHr, 'info'), SA.chip('عليك ' + mine.length, mine.length ? 'warning' : 'neutral')), h('ul.sapo-list', {}, list.map((a) => row(a, true)), rest.length ? rest.map((a) => row(a, false)) : null));
  }

  function render(root, ctx) {
    ctx.setCrumbs([{ label: 'نظرة عامة' }]);
    const u = me(); const first = (u.name || '').split(' ')[0]; const hr = new Date().getHours(); const greet = hr < 12 ? 'صباح الخير' : hr < 18 ? 'مساء الخير' : 'مساء النور';
    const head = h('div'); const panels = []; const host = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
    const mineN = SA.approvals ? SA.approvals.count() : 0; const apRoute = openable('approvals') ? 'approvals' : openable('hr/approvals') ? 'hr/approvals' : null;
    head.append(SA.pageHead({ title: greet + ' يا ' + first, desc: 'أول ما تفتح تعرف إيه اللي محتاجك دلوقتي، وبعدها الأرقام — لـSuper Admin والموارد البشرية معًا.', actions: [apRoute ? SA.btn({ label: 'صندوق الاعتمادات' + (mineN ? ' (' + mineN + ')' : ''), icon: 'inbox', kind: 'accent', onClick: () => SA.nav(apRoute) }) : null] }));
    const add = (p) => { panels.push(p); return p.el; };
    /* now: approvals + dealers + alerts */
    const pApprovals = add(panel({ title: 'تنتظر قراري', paths: ['approvals', 'users'], actions: [apRoute ? h('a.sap-linkbtn', { href: SA.href(apRoute) }, 'كل الاعتمادات') : null], body: approvalsBody }));
    const pAlerts = add(panel({ title: 'تنبيهات', paths: ['users', 'audit', 'settings', 'modules', 'approvals'], body: () => { const a = alerts(); if (!a.length) return SA.empty({ icon: 'shield', title: 'لا تنبيهات', text: SA.can('sa.users.view') || SA.can('sa.audit.view') ? 'كل شيء سليم الآن.' : 'لا تنبيهات في نطاق صلاحياتك.' }); return h('ul.sapo-list', {}, a.map((x) => { const hf = href(x.route + (x.q ? '?' + Object.keys(x.q).map((k) => k + '=' + encodeURIComponent(x.q[k])).join('&') : '')); return h('li.sapo-item', {}, h('span.sapo-ico.' + tone[x.tone], {}, SA.icon(x.icon, 'icon-sm')), h('div.sapo-body', {}, h('b', {}, x.text)), hf ? h('a.btn.btn-ghost.btn-sm', { href: hf }, x.cta || 'فتح') : null); })); } }));
    const pDealers = add(panel({ title: 'طلبات تسجيل التجار', perm: 'sa.dealers.view', paths: ['dealerRequests'], actions: [href('dealers/requests') ? h('a.sap-linkbtn', { href: SA.href('dealers/requests') }, 'كل الطلبات') : null], body: () => { const p = (st.get('dealerRequests') || []).filter((r) => r.status === 'pending_review'); if (!p.length) return SA.empty({ icon: 'inbox', title: 'لا طلبات بانتظار المراجعة', text: 'طلبات التجار الجديدة تظهر هنا.' }); return h('ul.sapo-list', {}, p.slice(0, 3).map((r) => h('li.sapo-item', {}, h('span.sapo-ico', {}, SA.icon('building', 'icon-sm')), h('div.sapo-body', {}, h('a.sapo-title', { href: SA.link.dealer(r.id) }, h('b', {}, r.company)), h('small', {}, r.city + ' · مستندات ' + r.docs.filter((d) => d.ok).length + '/' + r.docs.length + ' · ' + SA.fmt.rel(r.submittedAt))), h('a.btn.btn-ghost.btn-sm', { href: SA.link.dealer(r.id) }, 'مراجعة')))); } }));
    const pActivity = add(panel({ title: 'آخر النشاط', perm: 'sa.audit.view', lockText: 'سجل النشاط يحتاج صلاحية', paths: ['audit'], actions: [href('audit') ? h('a.sap-linkbtn', { href: SA.href('audit') }, 'السجل الكامل') : null], body: () => { const ev = (st.get('audit') || []).slice(0, 5); if (!ev.length) return SA.empty({ icon: 'history', title: 'لا نشاط بعد' }); return h('div.audit.sap-audit-mini', {}, ev.map((e) => h('div.audit-item', { style: { cursor: 'pointer' }, onclick: () => SA.auditView && SA.auditView.open(e) }, h('span.audit-ico' + (e.result !== 'success' ? '.is-bad' : e.severity === 'high' || e.severity === 'critical' ? '.is-warn' : ''), {}, SA.icon(/^AUTH/.test(e.code) ? 'lock' : /^HR\./.test(e.code) ? 'id' : 'history')), h('div', {}, h('b', {}, SA.auditLabel(e.code), e.area === 'hr' ? h('span.chip.chip-info', { style: { marginInlineStart: '6px' } }, 'HR') : null), h('small', {}, (e.actor && e.actor.name) + (e.target ? ' · ' + (e.target.label || e.target.id) : ''))), h('time', {}, SA.fmt.rel(e.ts))))); } }));
    /* KPIs */
    const kSa = add(panel({ title: 'مؤشرات النظام', bare: true, paths: ['users', 'roles', 'approvals', 'modules'], body: () => {
      const us = st.get('users') || []; const act = us.filter((x) => x.status === 'active').length; const pen = us.filter((x) => x.status === 'pending').length; const ap = pendingVisible().length; const mods = st.get('modules') || []; const man = mods.find((m) => m.key === 'manufacturing');
      const fin = SA.canSensitive('finance.reports.export') || SA.can('sa.policies.finance.view');
      return h('div.sapo-kpis', {}, kpi('مستخدمون نشطون', act, { route: 'users?status=active', sub: us.length + ' إجمالًا' }), kpi('بانتظار التفعيل', pen, { route: 'users?status=pending', tone: pen ? 'warn' : '' }), kpi('الأدوار', (st.get('roles') || []).length, { route: 'roles' }), kpi('طلبات اعتماد معلّقة', ap, { route: 'approvals', sub: SA.approvals ? SA.approvals.count() + ' عليك' : '' }),
        fin ? kpi('مبيعات الشهر', SA.openValue('غير متصل'), { off: true, sub: 'عقد البيانات مع المبيعات Open — لا رقم مخترع' }) : null,
        kpi('حالة الإنتاج', man && man.enabled ? 'مفعّل' : 'معطّل', { off: true, sub: 'بيانات الإنتاج غير متصلة (Open)' }), kpi('تنبيهات المخزون', SA.openValue('غير متصل'), { off: true, sub: '[New] تعتمد على عقد بيانات المخزون' }));
    } }));
    /* HR block */
    const hrOn = SA.appEnabled('hr'); const hrCan = SA.can('hr.dashboard.view') || SA.can('hr.employees.view');
    const kHr = add(panel({ title: 'الموارد البشرية', bare: true, paths: ['employees', 'payrollRuns', 'leaveRequests', 'requisitions', 'loans', 'settlements', 'approvals', 'modules'], actions: [hrOn && hrCan && href('hr/dashboard') ? h('a.sap-linkbtn', { href: SA.href('hr/dashboard') }, 'لوحة HR') : null], body: () => {
      if (!SA.appEnabled('hr')) return h('div', {}, SA.empty({ icon: 'layers', title: 'موديول الموارد البشرية معطّل', text: 'عُطّل من «الموديولات» (SA-09). مؤشرات HR لا تظهر حتى يُفعَّل.', action: SA.can('sa.modules.toggle') ? { label: 'فتح الموديولات', icon: 'layers', onClick: () => SA.nav('modules') } : null }));
      if (!hrCan) return locked('hr.dashboard.view', 'مؤشرات الموارد البشرية ليست من صلاحياتك');
      const emps = st.get('employees') || []; const live = emps.filter((e) => e.status !== 'terminated'); const run = (st.get('payrollRuns') || [])[0]; const hrAp = pendingVisible().filter((a) => a.area === 'hr'); const sal = SA.canSensitive('hr.salary.view');
      const byType = {}; hrAp.forEach((a) => { byType[a.type] = (byType[a.type] || 0) + 1; }); const split = Object.keys(byType).map((k) => T[k].label + ' ' + byType[k]).join(' · ');
      const lv = (st.get('leaveRequests') || []).filter((r) => r.status === 'pending').length; const rq = (st.get('requisitions') || []).filter((r) => r.status === 'pending_approval' || r.status === 'approved' || r.status === 'open').length; const ln = (st.get('loans') || []).filter((r) => r.status === 'requested').length; const ex = (st.get('settlements') || []).filter((r) => r.status !== 'paid').length;
      return h('div.sapo-kpis', {}, kpi('الموظفون', live.length, { route: 'hr/employees', sub: 'تجربة ' + live.filter((e) => e.status === 'probation').length + ' · إجازة ' + live.filter((e) => e.status === 'leave').length }), kpi('اعتمادات HR معلّقة', hrAp.length, { route: 'hr/approvals', tone: hrAp.length ? 'warn' : '', sub: split || 'لا شيء معلّق' }),
        run ? kpi('كشف المرتبات ' + run.id, RUN[run.status] || run.status, { route: 'hr/payroll', sub: sal ? 'الإجمالي ' + SA.fmt.money(run.gross) + ' (تجريبي)' : h('span', {}, SA.icon('lock', 'icon-sm'), ' الإجمالي سري — hr.salary.view') }) : kpi('كشف المرتبات', '—', { sub: 'لا كشف حالي' }),
        kpi('طلبات إجازة معلّقة', lv, { route: 'hr/leave' }), kpi('طلبات توظيف نشطة', rq, { route: 'hr/requisitions' }), kpi('سلف معلّقة', ln, { route: 'hr/loans' }), kpi('مخالصات غير مصروفة', ex, { route: 'hr/settlement' }));
    } }));
    host.append(h('div.sapo-main', {}, h('div.sapo-col', {}, pApprovals, pActivity), h('div.sapo-col', {}, pAlerts, pDealers)),
      h('div.sapo-sec', {}, h('h2', {}, SA.icon('shield', 'icon-sm'), 'النظام')), kSa, h('div.sapo-sec', {}, h('h2', {}, SA.icon('id', 'icon-sm'), 'الموارد البشرية'), h('small', {}, 'تُشتق من نفس بيانات شاشات HR')), kHr);
    root.append(head, host);
    return () => panels.forEach((p) => p.destroy());
  }
  SA.register({ id: 'overview', group: 'overview', title: 'نظرة عامة', icon: 'dashboard', route: 'overview', perm: 'sa.overview.view', order: 1, desc: 'إيه اللي محتاجني دلوقتي', render });
  SA.missions.add({ id: 'M-B9', area: 'approvals', title: 'من النظرة العامة: قرار سريع ثم شاهد العدّادات تتحدّث', persona: 'owner', route: 'overview', est: '3 د', goal: 'افتح النظرة العامة كصاحب الشركة: لاحظ لوحة «تنتظر قراري» ومؤشرات HR. اعتمد/ارفض طلبًا من اللوحة مباشرة ثم شاهد عدّاد الاعتمادات وآخر النشاط يتغيّران. جرّب عطّل موديول HR من الموديولات وارجع.', steps: [{ text: 'افتح النظرة العامة', route: 'overview' }, { text: 'اتخذ قرارًا من اللوحة', audit: 'APPROVAL.REJECTED' }], detect: [{ route: 'overview' }, { event: 'approval.decided' }] });
})();
