/* EG Super Admin prototype — mod-access-log.js  (SA-19 سجل الاطلاع على البيانات الحساسة — يدعم بند 46)
   Route: #/access-log  (perm sa.access_log.view)
   Shows READS of T3/T4 data derived from the shared audit log (HR.SALARY.VIEWED · HR.EMPLOYEE.PII_REVEALED · HR.MEDICAL.VIEWED · HR.DISCIPLINE.VIEWED · HR.LEGAL.VIEWED · DATA.COST.VIEWED · DATA.PROFIT.VIEWED),
   aggregated per user × data type (events + counter — not every page view). Drill-down lists the individual events (opens the audit event drawer).
   Switch: settings.accessLog.enabled (seeded true = demo; decision is Open بند 46). When it is OFF this screen shows the "not enabled" state AND new sensitive-read events are no longer written
   (SA.audit is wrapped here: reads codes are skipped while disabled) — HR modules keep calling SA.audit('HR.SALARY.VIEWED', …) as usual.
   Audit used: SETTINGS.CHANGED (enable/disable). */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  (function () {
    if (document.querySelector('style[data-mod="accesslog"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'accesslog');
    s.textContent = `
.sapl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 16px; align-items: start; }
.sapl-tier { font: 700 11px var(--font-en); border-radius: 6px; padding: 1px 7px; background: var(--color-warning-tint); color: var(--color-warning); } .sapl-tier.is-t4 { background: var(--color-danger-tint); color: var(--color-danger); }
.sapl-state { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 40px 20px; max-width: 640px; margin-inline: auto; } .sapl-state ul { text-align: start; margin: 0; padding-inline-start: 20px; color: var(--color-text-muted); font-size: var(--text-dense); display: grid; gap: 4px; }
.sapl-keys { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; } .sapl-keys li { display: flex; gap: 12px; align-items: flex-start; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: 10px; } .sapl-keys li > div { flex: 1; min-width: 0; } .sapl-keys small { display: block; color: var(--color-text-muted); font-size: 12px; margin-top: 2px; }
.sapl-switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }`;
    document.head.appendChild(s);
  })();
  const KINDS = {
    'HR.SALARY.VIEWED': { label: 'الأجور', tier: 'T3', key: 'hr.salary.view' }, 'HR.EMPLOYEE.PII_REVEALED': { label: 'بيانات شخصية كاملة', tier: 'T2', key: 'hr.pii.reveal' }, 'HR.MEDICAL.VIEWED': { label: 'سجلات طبية', tier: 'T4', key: 'hr.medical.view' },
    'HR.DISCIPLINE.VIEWED': { label: 'جزاءات وتحقيقات', tier: 'T4', key: 'hr.discipline.view' }, 'HR.LEGAL.VIEWED': { label: 'قضايا عمالية', tier: 'T4', key: 'hr.legal.view' }, 'DATA.COST.VIEWED': { label: 'التكاليف الداخلية', tier: 'T3', key: 'data.cost.view' }, 'DATA.PROFIT.VIEWED': { label: 'أرباح المصنع', tier: 'T3', key: 'data.profit.view' }
  };
  const isRead = (c) => !!KINDS[c];
  /* init settings (guarded, idempotent) + make the switch real */
  if (!SA.audit.__accessLogWrapped) {
    const orig = SA.audit;
    SA.audit = function (code) { if (isRead(code) && (st.get('settings.accessLog') || {}).enabled === false) return null; return orig.apply(this, arguments); };
    SA.audit.__accessLogWrapped = true;
  }
  const me = () => SA.session.user;
  const enabled = () => (st.get('settings.accessLog') || {}).enabled !== false;
  const tierChip = (t) => h('span.sapl-tier' + (t === 'T4' ? '.is-t4' : ''), {}, t);
  const RANGES = [['7d', 'آخر 7 أيام'], ['30d', 'آخر 30 يومًا']];

  function aggregate(range) {
    const ms = { '7d': 7 * 864e5, '30d': 30 * 864e5 }[range] || Infinity; const map = {};
    (st.get('audit') || []).filter((e) => isRead(e.code) && Date.now() - new Date(e.ts).getTime() <= ms).forEach((e) => {
      const k = (e.actor && e.actor.id) + '|' + e.code; const g = map[k] || (map[k] = { id: k, userId: e.actor && e.actor.id, userName: e.actor && e.actor.name, roleId: e.actor && e.actor.roleId, code: e.code, count: 0, targets: new Set(), last: e.ts, lastReason: e.reason, events: [] });
      g.count += e.count || 1; if (e.target) g.targets.add(e.target.id); g.events.push(e); if (new Date(e.ts) > new Date(g.last)) { g.last = e.ts; g.lastReason = e.reason; }
    });
    return Object.keys(map).map((k) => { const g = map[k]; g.targetN = g.targets.size; return g; });
  }
  async function toggle(on) {
    if (!SA.can('sa.settings.edit') && !(SA.session.role && SA.session.role.isProtected)) { SA.toast('ليست من صلاحياتك (sa.settings.edit)', 'warn'); return false; }
    const r = await SA.confirm({ title: on ? 'تفعيل سجل الاطلاع على البيانات الحساسة' : 'إيقاف سجل الاطلاع على البيانات الحساسة', danger: !on, confirmLabel: on ? 'تفعيل' : 'إيقاف', reasonRequired: true, impact: on ? ['يبدأ تسجيل أحداث فتح الأجور والبيانات الشخصية والطبية وغيرها (أحداث وعدّاد، لا كل تصفح).', 'تظهر النتائج هنا وفي مركز الأمان.', 'الأثر على خصوصية الموظفين وإبلاغهم: Open (بند 46).'] : ['يتوقف تسجيل أحداث الاطلاع الجديدة فورًا.', 'ما سُجّل سابقًا يبقى في سجل التدقيق (لا حذف).', 'مخاطرة: لن تعرف من فتح بيانات حساسة بعد الآن.'] });
    if (!r.ok) return false;
    try { await SA.api(() => { const b = SA.clone(st.get('settings.accessLog')); st.set('settings.accessLog', Object.assign({}, b, { enabled: on })); SA.audit('SETTINGS.CHANGED', { target: { type: 'settings', id: 'accessLog', label: 'سجل الاطلاع على الحساس' }, reason: r.reason, before: { enabled: b.enabled }, after: { enabled: on } }); }); } catch (e) { SA.fail(e); return false; }
    SA.toast(on ? 'تم تفعيل سجل الاطلاع' : 'تم إيقاف سجل الاطلاع', 'success'); return true;
  }
  function openGroup(g) {
    const kd = KINDS[g.code]; const sorted = g.events.slice().sort((a, b) => new Date(b.ts) - new Date(a.ts));
    SA.drawer({ title: g.userName + ' — ' + kd.label, subtitle: g.count + ' اطلاع · ' + g.targetN + ' سجل مختلف', size: 'md', body: h('div.sap-drawer-inner', {}, h('div.cluster', {}, tierChip(kd.tier), SA.chip(kd.key, 'neutral')), h('p.t-muted', { style: { marginBlock: '10px' } }, 'الأحداث الفردية (الأحدث أولًا). المسجّل أن المستخدم فتح البيان — لا تُخزَّن القيم نفسها.'),
      h('div.audit.sap-audit-mini', {}, sorted.map((e) => h('div.audit-item', { style: { cursor: 'pointer' }, onclick: () => SA.auditView && SA.auditView.open(e, sorted) }, h('span.audit-ico', {}, SA.icon('eye')), h('div', {}, h('b', {}, e.target ? e.target.label : SA.auditLabel(e.code)), h('small', {}, e.reason || 'بدون سبب مسجّل')), h('time', {}, SA.fmt.rel(e.ts)))))) });
  }
  function render(root, ctx) {
    ctx.setCrumbs([{ label: 'الرقابة' }, { label: 'سجل الاطلاع على الحساس' }]);
    const den = SA.guard('sa.access_log.view'); if (den) { root.appendChild(den); return; }
    if (!st.get('settings.accessLog')) st.set('settings.accessLog', { enabled: true, demo: true, retentionDays: null });
    const head = h('div'); const host = h('div'); root.append(head, host); let range = '30d'; let table = null; let state = 'loading';
    const canSwitch = SA.can('sa.settings.edit') || !!(SA.session.role && SA.session.role.isProtected);
    function holders() { // who holds each sensitive key right now (derived from roles)
      const keys = Object.keys(KINDS).map((c) => KINDS[c]); const seen = {};
      return keys.filter((k) => (seen[k.key] ? false : (seen[k.key] = true))).map((k) => ({ k, roles: (st.get('roles') || []).filter((r) => r.status === 'active' && SA.roleSensitive(r, k.key)) }));
    }
    function build() {
      SA.clear(head); SA.clear(host);
      head.append(SA.pageHead({ title: 'سجل الاطلاع على الحساس', desc: 'من فتح الأجور أو البيانات الشخصية أو الطبية أو التكاليف — أحداث وعدّاد لا كل تصفح. يدعم بند 46 ويُشتق من سجل التدقيق.', tags: [SA.tag('new'), SA.tag('open', 'تفعيله Open')], actions: [h('a.btn.btn-ghost', { href: SA.can('sa.audit.view') ? SA.link.audit('range=30d&q=VIEWED') : null, hidden: !SA.can('sa.audit.view') }, SA.icon('history', 'icon-sm'), 'السجل الكامل')] }));
      host.append(h('div.card.sap-card', { style: { marginBlock: '16px' } }, h('div.sapl-switch', {}, h('div', {}, h('b', {}, 'حالة السجل: ', enabled() ? SA.chip('مفعّل (تجريبي)', 'success') : SA.chip('غير مفعّل', 'neutral')), h('p.t-muted', { style: { margin: '4px 0 0', fontSize: 'var(--text-dense)' } }, 'مدة الاحتفاظ: ', SA.openValue('Open'), ' · إبلاغ الموظفين بأن الاطلاع على بياناتهم مسجّل: ', SA.openValue('Open (خصوصية)'))), SA.btn({ label: enabled() ? 'إيقاف التسجيل' : 'تفعيل التسجيل', icon: enabled() ? 'eyeoff' : 'eye', kind: enabled() ? 'ghost' : 'primary', reason: canSwitch ? '' : 'ليست من صلاحياتك (sa.settings.edit)', onClick: () => toggle(!enabled()) }))));
      if (!enabled()) { host.append(h('div.card.sap-card', {}, h('div.sapl-state', {}, h('span.sap-state-ico', {}, SA.icon('eyeoff', 'icon-lg')), h('strong', {}, 'سجل الاطلاع غير مفعّل'), h('p.t-muted', {}, 'لا تُسجَّل الآن أحداث فتح البيانات الحساسة. القرار ما زال Open (بند 46): هل المطلوب فعلًا؟ وما أثره على خصوصية الموظفين؟'), h('ul', {}, h('li', {}, 'ما سُجّل قبل الإيقاف يبقى متاحًا في سجل التدقيق.'), h('li', {}, 'عند التفعيل تظهر هنا أحداث الأجور (T3) والطبي/الجزاءات (T4) والكشف الكامل للبيانات الشخصية (T2).'), h('li', {}, 'الأحداث تُسجَّل كحدث وعدّاد — وليس كل تصفح.')), SA.btn({ label: 'تفعيل التسجيل', icon: 'eye', kind: 'primary', reason: canSwitch ? '' : 'ليست من صلاحياتك (sa.settings.edit)', onClick: () => toggle(true) })))); return; }
      const rows = aggregate(range); const total = rows.reduce((a, g) => a + g.count, 0); const users = new Set(rows.map((g) => g.userId)).size; const t4 = rows.filter((g) => KINDS[g.code].tier === 'T4').reduce((a, g) => a + g.count, 0);
      host.append(h('div.sap-grid-cards', { style: { marginBottom: '16px' } }, SA.kpi('اطلاعات مسجّلة', SA.fmt.num(total), { sub: RANGES.find((r) => r[0] === range)[1] }), SA.kpi('مستخدمون اطّلعوا', users), SA.kpi('اطلاعات T4 (طبي/جزاءات)', SA.fmt.num(t4), { accent: t4 > 0 }), SA.kpi('أنواع البيانات', new Set(rows.map((g) => g.code)).size)));
      table = SA.table({
        rowId: 'id', pageSize: 10, state, caption: 'سجل الاطلاع على الحساس', initial: { sort: { key: 'last', dir: 'desc' } },
        rows: () => aggregate(range), search: { placeholder: 'ابحث بالمستخدم أو البيان…', keys: ['userName', (g) => KINDS[g.code].label] },
        filters: [{ key: 'code', label: 'البيان', options: Object.keys(KINDS).map((c) => [c, KINDS[c].label]) }, { key: 'tier', label: 'السرية', options: [['T2', 'T2'], ['T3', 'T3'], ['T4', 'T4']], test: (g, v) => KINDS[g.code].tier === v }, { key: 'userId', label: 'المستخدم', options: Array.from(new Map(rows.map((g) => [g.userId, g.userName])).entries()) }],
        toolbar: [SA.segmented(RANGES, range, (v) => { range = v; build(); })],
        columns: [
          { key: 'userName', label: 'المستخدم', sort: true, render: (g) => h('span', {}, g.userName, h('br'), h('small.t-muted', {}, g.roleId ? SA.roleName(g.roleId) : '')) },
          { key: 'code', label: 'البيان', sort: true, value: (g) => KINDS[g.code].label, render: (g) => h('span', {}, KINDS[g.code].label, ' ', tierChip(KINDS[g.code].tier)) },
          { key: 'count', label: 'عدد مرات الاطلاع', sort: true, render: (g) => h('b.num', {}, g.count) },
          { key: 'targetN', label: 'سجلات مختلفة', sort: true, render: (g) => h('span.num', {}, g.targetN) },
          { key: 'last', label: 'آخر اطلاع', sort: (a, b) => new Date(a.last) - new Date(b.last), render: (g) => h('span.t-muted', { title: SA.fmt.dt(g.last) }, SA.fmt.rel(g.last)) },
          { key: 'lastReason', label: 'آخر سبب مسجّل', render: (g) => g.lastReason || h('span.sap-dash', {}, '—') }
        ],
        onRowClick: openGroup, empty: { icon: 'eye', title: 'لا اطلاع مسجّل في هذه الفترة', text: 'عندما يفتح مستخدم الأجور أو بيانات حساسة أخرى ستظهر الأحداث هنا.' }, onRetry: load
      });
      host.append(h('div.sapl-grid', {}, h('div', { style: { gridColumn: '1 / -1' } }, h('div.card.card-flush.sap-listcard', {}, table.el)), SA.card({ title: 'من يملك المفاتيح الآن؟' }, h('ul.sapl-keys', {}, holders().map((x) => h('li', {}, tierChip(x.k.tier), h('div', {}, h('b', {}, x.k.label, ' ', h('code', {}, x.k.key)), h('small', {}, x.roles.length ? x.roles.map((r) => r.nameAr).join('، ') : 'لا دور يملكها (غير المالك)'))))), h('p.t-caption.t-muted', {}, 'مشتق من الأدوار — Super Admin يملك الكل.')),
        SA.card({ title: 'ما الذي يُسجَّل؟' }, h('ul', { style: { margin: 0, paddingInlineStart: '18px', display: 'grid', gap: '6px', fontSize: 'var(--text-dense)' } }, h('li', {}, 'فتح الأجور في ملف الموظف أو كشف المرتبات أو طلب تغيير مرتب.'), h('li', {}, 'كشف الرقم القومي/الحساب البنكي كاملًا.'), h('li', {}, 'فتح السجلات الطبية أو الجزاءات أو القضايا.'), h('li', {}, 'لا تُسجَّل القيم نفسها — فقط من فتح ماذا ومتى وبأي سبب.')))));
    }
    function load() { state = 'loading'; build(); SA.delay(280, { write: false }).then(() => { state = 'ready'; build(); }, () => { state = 'error'; build(); if (table) table.setState('error'); }); }
    load();
    const offs = ['audit', 'settings.accessLog'].map((p) => st.subscribe(p, () => { if (state === 'ready') { if (table && enabled()) table.refresh(); else build(); } }));
    return () => offs.forEach((f) => f());
  }
  SA.register({ id: 'access-log', group: 'oversight', title: 'سجل الاطلاع على الحساس', icon: 'eye', route: 'access-log', perm: 'sa.access_log.view', order: 40, desc: 'من فتح الأجور والتكاليف والبيانات الحساسة', render });
  SA.missions.add({ id: 'M-B7', area: 'audit', title: 'من اطّلع على الأجور؟ — اربط الاطلاع بالسجل', persona: 'hr', route: 'approvals/AP-2011', est: '4 د', goal: 'كـHR Manager افتح طلب تغيير المرتب AP-2011 (يُسجَّل اطلاع على الأجور). ثم كصاحب الشركة افتح «سجل الاطلاع على الحساس» وشاهد العدّاد.', steps: [{ text: 'افتح AP-2011 كـHR Manager', audit: 'HR.SALARY.VIEWED' }, { text: 'كصاحب الشركة افتح سجل الاطلاع', route: 'access-log' }], detect: [{ audit: 'HR.SALARY.VIEWED' }, { route: 'access-log' }] });
})();
