/* EG Super Admin prototype — mod-scope.js  (SA-03 نطاق البيانات والصلاحيات الحساسة)
   Embedded as tabs in the role screen (SA.scope.renderTab / renderSensitive) AND its own screen: #/scope?role=R-04 */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store, C = SA.catalog, R = SA.rbac;
  const GROUPS = [['بيانات سرية', ['data.cost.view', 'data.profit.view', 'hr.salary.view']], ['HR — بيانات حساسة (T2–T4)', ['hr.medical.view', 'hr.discipline.view', 'hr.legal.view', 'hr.pii.reveal', 'hr.export.sensitive']], ['HR — المرتبات (تجهيز / اعتماد / إطلاق منفصلة)', ['hr.payroll.prepare', 'hr.payroll.approve', 'hr.payroll.release', 'hr.salary.change.request', 'hr.salary.change.approve']], ['HR — المخالصة النهائية (حساب / اعتماد / صرف)', ['hr.final_settlement.calculate', 'hr.final_settlement.approve', 'hr.final_settlement.pay']], ['سند الصرف (ثلاث صلاحيات منفصلة)', ['finance.voucher.create', 'finance.voucher.approve', 'finance.voucher.execute']], ['المبيعات', ['sales.discount.approve', 'sales.order.confirm']], ['تصدير', ['finance.reports.export']]];
  const SC = (SA.scope = {});

  /** Scope per (role × module): own | team | department | all. Edits go into the shared draft `d.cur.scope`. */
  SC.renderTab = function (role, d, ro) {
    const rows = C.resources.filter((r) => r.scoped && !r.locked && d.cur.matrix[r.id] && d.cur.matrix[r.id].view);
    const members = R.members(role.id); const noMgr = members.filter((u) => !u.managerId && u.status !== 'disabled');
    const wrap = h('div.sap-scopetab', {}, h('p.t-muted', {}, 'النطاق بيحدد ', h('b', {}, 'أي سجلات'), ' يشوفها الدور داخل كل موديول. الفلترة بتتم على الخادم (own = ', h('code', {}, 'owner/sales_rep = المستخدم'), ' · team = مرؤوسو المدير المباشر · department · all).'), SA.tag('new'));
    if (role.isProtected) wrap.appendChild(SA.alert('info', 'دور Super Admin يرى كل السجلات (الكل) ولا يُعدَّل.'));
    if (!rows.length) { wrap.appendChild(SA.empty({ icon: 'layers', title: 'لا توجد موديولات بعرض مفعّل', text: 'فعّل «عرض» لموديول من تبويب المصفوفة ليظهر هنا محدد النطاق.' })); return wrap; }
    const tbody = h('tbody'); const warn = h('div');
    const drawWarn = () => { SA.clear(warn); const hasTeam = rows.some((r) => d.cur.scope[r.id] === 'team'); if (hasTeam && noMgr.length) warn.appendChild(SA.alert('warning', h('b', {}, 'تنبيه (BR-SCP-02): '), noMgr.length + ' من أعضاء هذا الدور بدون مدير مباشر (' + noMgr.slice(0, 3).map((u) => u.name).join('، ') + (noMgr.length > 3 ? '…' : '') + ') — نطاق «الفريق» مش هيظهرهم في أي فريق.')); };
    rows.forEach((r) => {
      const cur = () => d.cur.scope[r.id] || 'own'; const base = d.base.scope[r.id] || 'own';
      const helpEl = h('td.sap-scope-help', {}); const tr = h('tr', { class: cur() !== base ? 'is-changed' : null });
      const seg = h('div.segmented.sap-scope-seg', { role: 'radiogroup', 'aria-label': 'نطاق ' + r.label }, C.scopes.map((s) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(cur() === s[0]), 'aria-pressed': String(cur() === s[0]), disabled: ro, onclick: () => { d.cur.scope[r.id] = s[0]; SA.$$('button', seg).forEach((b, i) => { const on = C.scopes[i][0] === s[0]; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-checked', String(on)); }); helpEl.textContent = C.scopeHelp[s[0]]; tr.classList.toggle('is-changed', s[0] !== base); drawWarn(); R.touch(role.id); } }, s[1])));
      helpEl.textContent = C.scopeHelp[cur()];
      tr.append(h('td', {}, h('div.mod', {}, h('b', {}, r.label), h('small', {}, r.sub))), h('td', {}, seg), helpEl); tbody.appendChild(tr);
    });
    wrap.append(h('div.card.card-flush', {}, h('div.table-wrap', {}, h('table.table.sap-scopetable', { 'aria-label': 'نطاق البيانات' }, h('thead', {}, h('tr', {}, h('th', {}, 'الموديول'), h('th', {}, 'النطاق'), h('th', {}, 'ماذا يعني'))), tbody))), warn,
      h('p.t-caption', {}, 'مثال (US-SCP-01): مندوب المبيعات بنطاق «ذاتي» على العملاء يرجع له عملاؤه فقط، وتجربة الوصول لعميل غيره = 403 مسجّل.'));
    drawWarn(); return wrap;
  };

  /** Sensitive permission switches with the documented warning wording. */
  SC.renderSensitive = function (role, d, ro) {
    const wrap = h('div.sap-senstab', {}, h('p.t-muted', {}, 'مفاتيح منفصلة عن المصفوفة. القيمة المحجوبة بتتحذف من الاستجابة مش بس بتتخفى (UC-SCP-03). منح أي مفتاح هنا بيطلب سبب + Step-up عند الحفظ.'));
    if (role.isProtected) wrap.appendChild(SA.alert('info', 'Super Admin يملك كل المفاتيح الحساسة ولا يُعدَّل.'));
    const sep = h('div'); const has = (k) => d.cur.sensitive[0] === '*' || d.cur.sensitive.indexOf(k) >= 0;
    const drawSep = () => { SA.clear(sep); const v = ['finance.voucher.create', 'finance.voucher.approve', 'finance.voucher.execute'].filter(has); if (v.length > 1 && !role.isProtected) sep.appendChild(SA.alert('warning', h('b', {}, 'فصل المهام: '), 'الدور يملك ' + v.length + ' من صلاحيات السند الثلاث. نفس الشخص لا يعتمد ما أنشأه (US-SCP-03) — يُفضّل توزيعها على أدوار مختلفة.')); };
    const pay = h('div'); const drawPay = () => { SA.clear(pay); const p = ['hr.payroll.prepare', 'hr.payroll.approve', 'hr.payroll.release'].filter(has); if (p.length > 1 && !role.isProtected) pay.appendChild(SA.alert('warning', h('b', {}, 'فصل مهام (HR §7.3): '), 'الدور يملك ' + p.length + ' من تجهيز/اعتماد/إطلاق كشف المرتبات — يُفضّل توزيعها.')); };
    GROUPS.forEach((g) => {
      wrap.appendChild(h('section.card.card-flush.sap-senscard', {}, h('div.card-head', {}, h('h3.sap-card-title', {}, g[0])), g[1].map((k) => {
        const s = C.sensitive.find((x) => x.key === k); const base = d.base.sensitive[0] === '*' || d.base.sensitive.indexOf(k) >= 0; const warnBox = h('div.sap-sens-warn', { hidden: !has(k) || base });
        const inp = h('input', { type: 'checkbox', checked: has(k), disabled: ro, 'aria-label': s.label, onchange: (e) => { const set = new Set(d.cur.sensitive); if (e.target.checked) set.add(k); else set.delete(k); d.cur.sensitive = Array.from(set); const changed = e.target.checked !== base; row.classList.toggle('is-changed', changed); warnBox.hidden = !(e.target.checked && changed); drawSep(); drawPay(); R.touch(role.id); } });
        warnBox.append(SA.icon('alert', 'icon-sm'), h('span', {}, s.warn));
        const row = h('div.setting-row.sap-sensrow' + (has(k) !== base ? '.is-changed' : ''), {}, h('div', {}, h('b', {}, s.label, ' ', SA.tag(s.tag)), h('small', {}, s.desc), h('code', {}, s.key), warnBox), h('label.switch', {}, inp, h('span')));
        return row;
      })));
    });
    wrap.append(sep, pay); drawSep(); drawPay(); return wrap;
  };

  /* ───────────────────────── standalone screen ───────────────────────── */
  function render(root, ctx) {
    ctx.setCrumbs([{ label: 'الوصول' }, { label: 'نطاق البيانات والحساسة' }]);
    let roleId = ctx.params.role || 'R-04'; let tab = ctx.params.tab || 'scope';
    const roles = st.get('roles') || []; if (!SA.roleById(roleId)) roleId = roles[0] && roles[0].id;
    const sel = SA.form.field({ name: 'role', label: 'الدور', type: 'select', options: roles.map((r) => [r.id, r.nameAr]), value: roleId });
    const body = h('div.sap-scope-body'); const bar = h('div.sap-unsaved-host'); const overview = h('div');
    let unOn = null;
    function drawBar() { SA.clear(bar); const role = SA.roleById(roleId); const df = R.draftDiff(roleId); if (!df.total) return; bar.append(h('div.sap-unsaved', { role: 'region' }, SA.icon('alert'), h('span.sap-unsaved-text', {}, h('b.num', {}, df.total), ' تغيير غير محفوظ على ', h('b', {}, role.nameAr)), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { R.reset(roleId); draw(); } }, 'تراجع عن الكل'), SA.btn({ label: 'مراجعة الفروقات وحفظ', icon: 'check', kind: 'primary', size: 'sm', perm: 'sa.roles.edit', onClick: async () => { if (await R.commit(roleId)) draw(); } }))); }
    function draw() {
      SA.clear(body); const role = SA.roleById(roleId); if (!role) { body.append(SA.empty({ icon: 'key', title: 'الدور غير موجود' })); return; }
      const d = R.draft(roleId); const why = R.readonlyReason(role); const ro = !!why;
      if (why) body.appendChild(h('div.sap-banner.is-lock', {}, SA.icon('lock'), h('span.sap-banner-text', {}, why)));
      body.appendChild(tab === 'scope' ? SC.renderTab(role, d, ro) : SC.renderSensitive(role, d, ro)); drawBar();
      drawOverview();
    }
    function drawOverview() {
      SA.clear(overview); const rs = st.get('roles') || [];
      if (tab === 'scope') {
        const cols = C.resources.filter((r) => r.scoped && !r.locked);
        overview.append(SA.card({ title: 'نظرة على كل الأدوار (النطاق)', flush: true }, h('div.table-wrap', {}, h('table.table.sap-mini', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الدور'), cols.map((c) => h('th', {}, c.label)))), h('tbody', {}, rs.map((r) => h('tr', { class: r.id === roleId ? 'is-selected' : null }, h('td', {}, h('button.sap-linkbtn', { type: 'button', onclick: () => { roleId = r.id; sel.set(r.id); draw(); } }, r.nameAr)), cols.map((c) => h('td', {}, r.matrix[c.id] && r.matrix[c.id].view ? SA.chip(R.scopeLabel(r.scope[c.id] || 'own'), r.scope[c.id] === 'all' ? 'info' : 'neutral') : h('span.sap-dash', {}, '—'))))))))));
      } else {
        overview.append(SA.card({ title: 'من يملك ماذا (الصلاحيات الحساسة)', flush: true }, h('div.table-wrap', {}, h('table.table.sap-mini', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الصلاحية'), rs.map((r) => h('th', {}, r.nameAr.split('/')[0].trim())))), h('tbody', {}, C.sensitive.map((s) => h('tr', {}, h('td', {}, s.label), rs.map((r) => h('td', {}, SA.roleSensitive(r, s.key) ? h('span.sap-yes', { 'aria-label': 'نعم' }, SA.icon('check', 'icon-sm')) : h('span.sap-dash', { 'aria-label': 'لا' }, '—'))))))))));
      }
    }
    const t = SA.tabs({ label: 'نطاق / حساسة', active: tab, tabs: [{ id: 'scope', label: 'نطاق البيانات', icon: 'layers' }, { id: 'sens', label: 'الصلاحيات الحساسة', icon: 'lock' }], onChange: (id) => { tab = id === 'sens' ? 'sens' : 'scope'; draw(); } });
    if (tab !== 'scope') t.setActive('sens');
    sel.input.addEventListener('change', () => { roleId = sel.get(); draw(); });
    root.append(SA.pageHead({ title: 'نطاق البيانات والصلاحيات الحساسة', desc: 'حدّد «إيه اللي يقدر يشوفه الدور» و«مين يقدر يعمل العمليات الحساسة». نفس الشاشة مدمجة كتبويبات في شاشة الأدوار.', tags: [SA.tag('new')], actions: [SA.btn({ label: 'فتح الدور كاملًا', icon: 'key', kind: 'ghost', onClick: () => SA.nav('roles/' + roleId) })] }), h('div.card.sap-compare-pick', {}, h('div.sap-formgrid', {}, sel.el)), t.el, body, overview);
    draw(); unOn = R.onDraft((id) => { if (id === roleId) drawBar(); });
    const un = st.subscribe('roles', draw);
    return () => { un(); if (unOn) unOn(); };
  }
  SA.register({ id: 'scope', group: 'access', title: 'نطاق البيانات والحساسة', icon: 'layers', route: 'scope', perm: 'sa.roles.view', order: 25, desc: 'نطاق (ذاتي/فريق/قسم/الكل) والصلاحيات الحساسة لكل دور', render });
})();
