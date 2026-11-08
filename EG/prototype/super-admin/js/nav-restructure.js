/* EG ERP prototype — nav-restructure.js (lead). Loaded AFTER every mod-*.js and BEFORE app.js.
   «Super Admin» is a ROLE (صاحب الشركة — كل الصلاحيات), not a module. The old `sa` workspace becomes «الإعدادات والإدارة»
   (system settings, roles & permissions, security & audit). Screens that duplicated other modules are moved to their owner module
   (same routes → old links keep working) or hidden when another module replaces them. The approvals inbox becomes a global top-bar button. */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, C = SA.catalog;

  /* 1. the workspace itself */
  const sa = C.appById('sa');
  Object.assign(sa, { title: 'الإعدادات والإدارة', short: 'الإعدادات', icon: 'settings', home: 'admin-home' });
  C.apps.splice(C.apps.indexOf(sa), 1); C.apps.splice(C.apps.findIndex((a) => a.id === 'portal'), 0, sa); // settings last (before portal)
  const GT = { overview: 'الرئيسية', access: 'المستخدمون والصلاحيات', org: 'الشركة والهيكل', policies: 'السياسات والمستندات', data: 'البيانات الأساسية', oversight: 'الرقابة والأمان', reports: 'التقارير', system: 'النظام والتكاملات' };
  C.groups.forEach((g) => { if (GT[g.id]) g.title = GT[g.id]; });

  /* 2. role & persona wording: Super Admin = role of the owner */
  Object.assign(C.personas.owner, { label: 'صاحب الشركة (كل الصلاحيات)', desc: 'كل المساحات والصلاحيات · MFA إلزامي' });
  Object.assign(C.personas.backup, { label: 'حساب المالك الاحتياطي', desc: 'الاسترجاع والاستمرارية · MFA إلزامي' });
  C.personas.hr.desc = 'مساحة الموارد البشرية — بدون إعدادات النظام: جرّب الشاشات الممنوعة';
  C.perms.forEach((p) => { if (p.res === 'superadmin') p.label = 'أمان حسابات المالك'; });
  ERP.addSeed('restructure', (S) => {
    const r = S.roles.find((x) => x.id === 'R-01'); if (r) { r.nameAr = 'صاحب الشركة (كل الصلاحيات)'; r.nameEn = 'Owner (all permissions)'; }
    const u = S.users.find((x) => x.id === 'U-02'); if (u) u.jobTitle = 'حساب المالك الاحتياطي';
  });

  /* 3. move / hide screens (mutate the registered defs in place — some have permission getters) */
  const MOVE = {
    customers: { app: 'crm', group: 'crm-cust', title: 'قوائم الأسعار وبيانات العملاء', order: 90 },
    dealers: { app: 'crm', group: 'crm-cust', title: 'حسابات التجار وطلبات التسجيل', order: 91 },
    suppliers: { app: 'scm', group: 'scm-buy', title: 'دليل الموردين', order: 90 },
    warehouses: { app: 'scm', group: 'scm-inv', title: 'تعريف المخازن', order: 90 },
    'pol-finance': { app: 'fin', group: 'fin-gl', title: 'إعدادات المالية والضريبة', order: 90 },
    sacct: { title: 'أمان حسابات المالك' },
    overview: { nav: false }, reports: { nav: false }, mobile: { nav: false }, approvals: { nav: false }
  };
  function applyMoves() {
    Object.keys(MOVE).forEach((id) => { const m = SA.moduleById(id); if (!m) return; Object.keys(MOVE[id]).forEach((k) => Object.defineProperty(m, k, { value: MOVE[id][k], writable: true, enumerable: true, configurable: true })); });
    SA.emit('modules');
  }
  applyMoves();

  /* 4. settings home: one hub page listing the admin areas the user may open */
  SA.register({ id: 'admin-home', app: 'sa', group: 'overview', title: 'الإعدادات والإدارة', icon: 'settings', route: 'admin', perm: null, order: 0,
    render(root, ctx) {
      ctx.setCrumbs([{ label: 'الإعدادات والإدارة' }]);
      const mods = SA.navModules('sa').filter((m) => m.id !== 'admin-home');
      if (!mods.length) { root.append(SA.empty({ icon: 'lock', title: 'لا توجد إعدادات متاحة لدورك', text: 'إعدادات النظام لصاحب الشركة ومن يمنحه صلاحية.' })); return; }
      const ap = SA.approvals ? SA.approvals.count() : 0; const users = SA.store.get('users') || []; const audit = SA.store.get('audit') || [];
      root.append(SA.pageHead({ title: 'الإعدادات والإدارة', desc: 'إعدادات النظام والأدوار والصلاحيات والأمان. «صاحب الشركة» دور بكل الصلاحيات — وكل قسم يدير بياناته الأساسية من موديوله.' }),
        ERP.ui.kpis([
          SA.can('sa.users.view') ? ERP.ui.kpi({ label: 'المستخدمون النشطون', value: users.filter((u) => u.status === 'active').length, icon: 'users', href: '#/users', sub: users.filter((u) => u.status === 'locked').length + ' موقوف' }) : null,
          SA.can('sa.roles.view') ? ERP.ui.kpi({ label: 'الأدوار', value: (SA.store.get('roles') || []).length, icon: 'key', href: '#/roles' }) : null,
          ERP.ui.kpi({ label: 'اعتمادات تنتظرك', value: ap, icon: 'inbox', href: '#/approvals', tone: ap ? 'warning' : null }),
          SA.can('sa.audit.view') ? ERP.ui.kpi({ label: 'أحداث التدقيق (24 ساعة)', value: audit.filter((e) => Date.now() - new Date(e.ts).getTime() < 86400000).length, icon: 'history', href: '#/audit' }) : null
        ]),
        h('div.erp-grid.erp-grid-3', {}, C.groups.slice().sort((a, b) => a.order - b.order).map((g) => {
          const items = mods.filter((m) => m.group === g.id); if (!items.length) return null;
          return SA.card({ title: g.title }, h('div.adm-links', {}, items.map((m) => h('a.adm-link', { href: '#/' + m.route }, SA.icon(m.icon || 'grid', 'icon-sm'), h('span', {}, h('b', {}, m.title), m.desc ? h('small', {}, m.desc) : null)))));
        })),
        SA.alert('info', h('b', {}, 'أين ذهبت باقي الشاشات؟ '), 'العملاء وقوائم الأسعار وحسابات التجار ← المبيعات وCRM · الموردون وتعريف المخازن ← المشتريات والمخازن · إعدادات المالية ← المالية · النظرة العامة والتقارير ← لوحة القيادة · الاعتمادات ← زر «اعتماداتي» أعلى الشاشة.'));
    } });
  Object.defineProperty(SA.moduleById('admin-home'), 'perm', { configurable: true, get() { return SA.modules.some((m) => m.app === 'sa' && m.nav && m.id !== 'admin-home' && (!m.perm || SA.can(m.perm))) ? null : 'sa.settings_home.view'; } });
  const st = document.createElement('style'); st.setAttribute('data-mod', 'restructure');
  st.textContent = '.adm-links{display:flex;flex-direction:column;gap:4px}.adm-link{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:10px;text-decoration:none;color:inherit}.adm-link:hover{background:var(--color-primary-tint)}.adm-link .icon{margin-top:3px;color:var(--eg-navy)}.adm-link b{display:block;font-size:var(--text-dense)}.adm-link small{display:block;color:var(--color-text-muted);font-size:12px;line-height:1.5}' +
    '.sap-apbtn{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--color-border);background:#fff;color:var(--eg-navy);font-weight:700;font-size:var(--text-dense);text-decoration:none;position:relative}.sap-apbtn:hover{background:var(--color-primary-tint)}.sap-apbtn .sap-apcount{min-width:20px;height:20px;border-radius:999px;background:var(--eg-red);color:#fff;font:700 11px var(--font-en);display:inline-grid;place-items:center;padding:0 5px}@media (max-width:760px){.sap-apbtn span.sap-aptext{display:none}}';
  document.head.appendChild(st);

  /* 5. global «اعتماداتي» button in the top bar (every workspace) */
  function drawApBtn() {
    const host = document.querySelector('.sap-top-actions'); if (!host || !SA.session.isAuthed || !SA.approvals) return;
    let btn = host.querySelector('.sap-apbtn');
    const visible = SA.can('sa.approvals.view') || (SA.store.get('approvals') || []).some((a) => SA.approvals.visible(a));
    if (!visible) { if (btn) btn.remove(); return; }
    const n = SA.approvals.count();
    if (!btn) { btn = h('a.sap-apbtn', { href: '#/approvals', title: 'صندوق الاعتمادات' }); host.insertBefore(btn, host.firstChild); }
    SA.clear(btn); btn.append(SA.icon('inbox', 'icon-sm'), h('span.sap-aptext', {}, 'اعتماداتي'), n ? h('span.sap-apcount', { 'aria-label': n + ' بانتظارك' }, n > 99 ? '99+' : n) : null);
  }
  SA.router.onChange(() => setTimeout(drawApBtn, 0));
  SA.store.subscribe('approvals', () => setTimeout(drawApBtn, 0));
  SA.on('login', () => setTimeout(drawApBtn, 50));
})();
