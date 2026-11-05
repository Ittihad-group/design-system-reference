/* EG Super Admin prototype — mod-data.js  (agent C · SA-20 العملاء وقوائم الأسعار · SA-21 الموردون)
   Routes: #/customers (list + drawer) · #/customers/price-lists · #/suppliers
   - نطاق own/team يُطبَّق بـSA.scopeFilter · الرصيد قراءة فقط (مصدره المالية) · الكود فريد ولا يتغير · لا تعطيل بطلبات/أوامر مفتوحة
   - قوائم الأسعار: التعيين/التفعيل/تعديل الأسعار يمر باعتماد (SA.requestApproval → صندوق الاعتمادات المشترك) ويُطبَّق تلقائيًا عند الاعتماد
   - دمج مكررين (Wizard) واستيراد CSV/Excel-paste (تحقق بالسطر ← معاينة ← تنفيذ ← تقرير). */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  const NOPERM = 'ليست من صلاحياتك';
  const MOD = 'dat';
  const clone = (o) => JSON.parse(JSON.stringify(o == null ? null : o));
  function css(text) { if (document.querySelector('style[data-mod="' + MOD + '"]')) return; const s = document.createElement('style'); s.setAttribute('data-mod', MOD); s.textContent = text; document.head.appendChild(s); }
  css(`
.sap-dat-pills{display:flex;gap:8px;flex-wrap:wrap;margin-block-end:12px}
.sap-dat-bal{display:inline-flex;gap:6px;align-items:center}.sap-dat-bal svg{color:var(--color-text-muted)}
.sap-dat-contacts{display:grid;gap:8px}.sap-dat-crow{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:start}
.sap-dat-ro{background:var(--color-bg-alt);border:1px dashed var(--color-border-strong);border-radius:10px;padding:10px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between}
.sap-dat-rep{width:100%;max-height:280px;overflow:auto}.sap-dat-rep tr.is-err td:first-child{box-shadow:inset 3px 0 0 var(--color-danger)}.sap-dat-rep tr.is-warn td:first-child{box-shadow:inset 3px 0 0 var(--color-warning,#b7791f)}
.sap-dat-drop{border:2px dashed var(--color-border-strong);border-radius:14px;padding:18px;text-align:center;background:var(--color-bg-alt);cursor:pointer}.sap-dat-drop:hover,.sap-dat-drop:focus-visible,.sap-dat-drop.is-over{border-color:var(--eg-navy);background:var(--color-primary-tint);outline:none}
.sap-dat-sum{display:flex;gap:10px;flex-wrap:wrap}.sap-dat-sum>span{padding:6px 14px;border-radius:10px;background:var(--color-bg-alt);font-weight:600}
.sap-dat-pick{display:grid;gap:8px;max-height:260px;overflow:auto}.sap-dat-pick label{display:flex;gap:10px;align-items:center;border:1px solid var(--color-border);border-radius:10px;padding:8px 12px;cursor:pointer}.sap-dat-pick label:has(input:checked){border-color:var(--eg-navy);background:var(--color-primary-tint)}
.sap-dat-mrg{width:100%}.sap-dat-mrg td,.sap-dat-mrg th{font-size:var(--text-caption)}
.sap-dat-items{width:100%}.sap-dat-items input{max-width:130px}
.sap-dat-pend{display:inline-flex;gap:6px;align-items:center;font-size:12px;font-weight:700;color:var(--eg-navy);background:var(--color-primary-tint);border-radius:999px;padding:2px 10px}
@media(max-width:640px){.sap-dat-crow{grid-template-columns:1fr}}
`);

  /* ───────────────────────── entity configs ───────────────────────── */
  const E = {
    customers: { coll: 'customers', idp: 'C', idw: 3, prefix: 'CUS', single: 'عميل', plural: 'العملاء', perm: 'sa.customers', audit: 'CUSTOMER', openKey: 'openOrders', openLabel: 'طلبات مفتوحة', route: 'customers', types: [['dealer', 'موزع / تاجر'], ['direct', 'مباشر / تجزئة'], ['contractor', 'مقاول']], scoped: true, icon: 'users' },
    suppliers: { coll: 'suppliers', idp: 'S', idw: 3, prefix: 'SUP', single: 'مورد', plural: 'الموردون', perm: 'sa.suppliers', audit: 'SUPPLIER', openKey: 'openPOs', openLabel: 'أوامر شراء مفتوحة', route: 'suppliers', types: [['raw', 'خامات'], ['accessories', 'إكسسوارات']], scoped: false, icon: 'truck' }
  };
  const typeLabel = (E_, t) => ((E_.types.find((x) => x[0] === t) || [])[1]) || t || '—';
  if (SA.catalog.auditCategories && !SA.catalog.auditCategories.some((c) => c.id === 'data')) SA.catalog.auditCategories.push({ id: 'data', label: 'البيانات الأساسية' });
  [['CREATED', 'إنشاء', 'medium'], ['UPDATED', 'تعديل', 'medium'], ['DISABLED', 'تعطيل', 'high'], ['ENABLED', 'تفعيل', 'medium'], ['MERGED', 'دمج مكررين', 'high'], ['IMPORTED', 'استيراد من ملف', 'high']].forEach((a) => { SA.catalog.addAudit('CUSTOMER.' + a[0], a[1] + ' عميل', a[2], 'data'); SA.catalog.addAudit('SUPPLIER.' + a[0], a[1] + ' مورد', a[2], 'data'); });

  /* ───────────────────────── one-time extensions (price list items + change tracking) ───────────────────────── */
  const SAMPLE_ITEMS = [['DOOR-D134', 'باب D134', 'pcs', 1250], ['CLAD-16x280', 'تجاليد 16×280', 'm²', null], ['FOAM-18', 'فوم 18', 'm²', null], ['ACC-DOOR-KIT', 'طقم إكسسوار باب', 'pcs', 180]];
  function ensure() {
    if (!st.get('meta') || st.get('meta.datSeeded')) return;
    const mult = { 'PL-01': 1.1, 'PL-02': 1, 'PL-03': 0.95, 'PL-04': 1 };
    st.update('priceLists', (l) => l.forEach((p) => { if (!p.items) p.items = SAMPLE_ITEMS.map((i) => ({ sku: i[0], name: i[1], unit: i[2], price: i[3] == null ? null : Math.round(i[3] * (mult[p.id] || 1)) })); }));
    if (!st.get('priceListChanges')) st.set('priceListChanges', []);
    const chg = [];
    const ap8 = st.find('approvals', 'AP-2008'), ap3 = st.find('approvals', 'AP-2003');
    if (ap8 && !ap8.ref) { st.patch('approvals', 'AP-2008', { ref: { type: 'price_list', id: 'PL-04' } }); chg.push({ id: 'PLC-1', approvalId: 'AP-2008', plId: 'PL-04', kind: 'activate', status: 'pending', adds: [], removes: [], prices: null, createdAt: ap8.createdAt, requestedBy: ap8.requesterId }); }
    if (ap3 && !ap3.ref) { st.patch('approvals', 'AP-2003', { ref: { type: 'price_list', id: 'PL-02' } }); chg.push({ id: 'PLC-2', approvalId: 'AP-2003', plId: 'PL-02', kind: 'items', status: 'pending', adds: [], removes: [], prices: { 'CLAD-16x280': 420, 'FOAM-18': 95 }, createdAt: ap3.createdAt, requestedBy: ap3.requesterId }); }
    if (chg.length) st.update('priceListChanges', (l) => { chg.forEach((c) => l.push(c)); });
    st.update('meta', (m) => { m.datSeeded = true; });
  }
  function applyChange(c, decider) {
    const pl = st.find('priceLists', c.plId); if (!pl) return;
    const before = { status: pl.status, assigned: (pl.assignedTo || []).filter((x) => /^C-/.test(x)).length, prices: c.kind === 'items' ? (pl.items || []).filter((i) => c.prices[i.sku] !== undefined).map((i) => i.sku + '=' + (i.price == null ? '—' : i.price)).join(', ') : undefined };
    if (c.kind === 'activate') st.patch('priceLists', pl.id, { status: 'active', updatedAt: new Date().toISOString() });
    else if (c.kind === 'items') st.update('priceLists', (l) => { const p = l.find((x) => x.id === pl.id); (p.items || []).forEach((i) => { if (c.prices[i.sku] !== undefined) i.price = c.prices[i.sku]; }); p.updatedAt = new Date().toISOString(); });
    else if (c.kind === 'assign') {
      st.update('priceLists', (l) => { const set = (id, fn) => { const p = l.find((x) => x.id === id); if (p) fn(p); }; (c.removes || []).forEach((cid) => set(c.plId, (p) => { p.assignedTo = (p.assignedTo || []).filter((x) => x !== cid); })); (c.adds || []).forEach((cid) => { l.forEach((p) => { p.assignedTo = (p.assignedTo || []).filter((x) => x !== cid || p.id === c.plId); }); set(c.plId, (p) => { if ((p.assignedTo || []).indexOf(cid) < 0) p.assignedTo.push(cid); }); }); const p = l.find((x) => x.id === c.plId); if (p) p.updatedAt = new Date().toISOString(); });
      st.update('customers', (l) => l.forEach((x) => { if ((c.adds || []).indexOf(x.id) >= 0) x.priceListId = c.plId; if ((c.removes || []).indexOf(x.id) >= 0 && x.priceListId === c.plId) x.priceListId = null; }));
    }
    const after = { status: (st.find('priceLists', pl.id) || {}).status, assigned: ((st.find('priceLists', pl.id) || {}).assignedTo || []).filter((x) => /^C-/.test(x)).length };
    SA.audit('PRICELIST.CHANGED', { target: { type: 'priceList', id: pl.id, label: pl.name }, before, after: Object.assign(after, c.kind === 'items' ? { prices: Object.keys(c.prices).map((k) => k + '=' + c.prices[k]).join(', ') } : {}), reason: 'تطبيق بعد اعتماد ' + c.approvalId, via: 'system', actor: decider });
  }
  let reconciling = false;
  function reconcile() {
    if (reconciling || !st.get('priceListChanges')) return; reconciling = true;
    try {
      (st.get('priceListChanges') || []).filter((c) => c.status === 'pending').forEach((c) => {
        const ap = st.find('approvals', c.approvalId); if (!ap) return;
        if (ap.status === 'approved') { applyChange(c); st.patch('priceListChanges', c.id, { status: 'applied', appliedAt: new Date().toISOString() }); SA.notify({ title: 'تم تطبيق تغيير قائمة الأسعار', body: (st.find('priceLists', c.plId) || {}).name + ' — بعد اعتماد ' + c.approvalId, level: 'info', toUsers: [c.requestedBy], to: ['R-01'], link: '#/customers/price-lists' }); }
        else if (ap.status === 'rejected') { st.patch('priceListChanges', c.id, { status: 'rejected' }); SA.notify({ title: 'رُفض تغيير قائمة الأسعار', body: ap.id, level: 'info', toUsers: [c.requestedBy], link: '#/customers/price-lists' }); }
      });
    } finally { reconciling = false; }
  }
  setTimeout(() => { ensure(); reconcile(); st.subscribe('approvals', reconcile); }, 0);

  /* ───────────────────────── generic helpers ───────────────────────── */
  function mount(root, build, opts) {
    opts = opts || {}; ensure(); const host = h('div'); root.append(host); let alive = true, off = null;
    function run() {
      if (typeof off === 'function') { off(); off = null; }
      SA.clear(host); host.append(h('div', { style: { paddingBlock: '8px' } }, SA.skeleton({ kind: 'table', rows: 7 })));
      SA.delay(opts.ms || 240, { write: false }).then(() => { if (!alive) return; SA.clear(host); try { off = build(host, run) || null; } catch (e) { console.error(e); SA.clear(host); host.append(SA.errorState({ text: SA.errorText(e), onRetry: run })); } }, (e) => { if (!alive) return; SA.clear(host); host.append(SA.errorState({ text: SA.errorText(e), onRetry: run })); });
    }
    run(); return () => { alive = false; if (typeof off === 'function') off(); };
  }
  const norm = (n) => String(n || '').replace(/\(.*?\)/g, ' ').replace(/(^|\s)(شركة|مؤسسة|معرض|مكتب|مقاولات|م\.|أ\.|مصنع|ورشة|ال)(?=\s|$)/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
  const digits = (s) => String(s || '').replace(/\D/g, '').slice(-9);
  const repName = (id) => (SA.userById(id) ? SA.userById(id).name : '—');
  const plName = (id) => { const p = id && st.find('priceLists', id); return p ? p.name : null; };
  const live = (E_) => (st.get(E_.coll) || []).filter((r) => r.status !== 'merged');
  function visible(E_) { let rows = live(E_); if (E_.scoped) rows = SA.scopeFilter('customers', rows, 'salesRepId'); return rows; }
  const statusChip = (r) => (r.status === 'merged' ? SA.chip('مدموج', 'neutral') : SA.chip(r.status === 'active' ? 'نشط' : 'معطّل', r.status === 'active' ? 'success' : 'neutral'));
  const ro = (label, node) => h('div.sap-dat-ro', {}, h('span', {}, h('b', {}, label)), h('span', {}, node, ' ', SA.icon('lock', 'icon-sm')));
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, ''); const delim = text.split('\n')[0].indexOf('\t') >= 0 ? '\t' : ','; const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === delim) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; } else cur += c; }
    row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row); return rows;
  }
  const HDR = { name: ['name', 'الاسم', 'اسم العميل', 'اسم المورد'], type: ['type', 'النوع'], city: ['city', 'المدينة'], contact_name: ['contact_name', 'contact', 'جهة الاتصال', 'اسم جهة الاتصال'], phone: ['phone', 'الهاتف', 'رقم الهاتف'], rep_email: ['rep_email', 'rep', 'المندوب', 'بريد المندوب'], price_list: ['price_list', 'قائمة الأسعار'], payment_terms: ['payment_terms', 'شروط الدفع'] };
  const TYPEMAP = { dealer: 'dealer', 'موزع': 'dealer', 'تاجر': 'dealer', direct: 'direct', 'مباشر': 'direct', 'تجزئة': 'direct', contractor: 'contractor', 'مقاول': 'contractor', raw: 'raw', 'خامات': 'raw', 'خامة': 'raw', accessories: 'accessories', 'إكسسوارات': 'accessories', 'اكسسوارات': 'accessories' };

  /* ───────────────────────── record drawer (create / view / edit) ───────────────────────── */
  function openRecord(E_, rec, onDone) {
    const isNew = !rec; const canEdit = SA.can(E_.perm + (isNew ? '.create' : '.edit'));
    if (isNew && !canEdit) return SA.toast(NOPERM + ' (' + E_.perm + '.create)', 'warn');
    const r0 = rec ? clone(rec) : { name: '', type: E_.types[0][0], city: '', contacts: [{ name: '', phone: '' }], salesRepId: null, priceListId: null, paymentTerms: null, status: 'active' };
    let active = 'data'; const body = h('div'); const contacts = clone(r0.contacts && r0.contacts.length ? r0.contacts : [{ name: '', phone: '' }]);
    const f = {};
    f.name = SA.form.field({ name: 'name', label: 'الاسم', value: r0.name, required: true, disabled: !canEdit, hint: '' });
    f.type = SA.form.field({ name: 'type', label: 'النوع', type: 'select', value: r0.type, required: true, disabled: !canEdit, options: E_.types });
    if (E_.coll === 'customers') { f.city = SA.form.field({ name: 'city', label: 'المدينة', value: r0.city, required: true, disabled: !canEdit });
      const reps = (st.get('users') || []).filter((u) => u.status === 'active' && (u.departmentId === 'D-02' || u.id === r0.salesRepId));
      f.rep = SA.form.field({ name: 'salesRepId', label: 'مندوب المبيعات المسؤول [New]', type: 'select', value: r0.salesRepId || '', disabled: !canEdit, options: [['', 'بدون مندوب']].concat(reps.map((u) => [u.id, u.name])), hint: 'يحدد نطاق own للمندوب.' });
      f.pl = SA.form.field({ name: 'priceListId', label: 'قائمة الأسعار', type: 'select', value: r0.priceListId || '', disabled: !canEdit || isNew, options: [['', 'بدون قائمة']].concat((st.get('priceLists') || []).map((p) => [p.id, p.name + (p.status === 'draft' ? ' (مسودة)' : '')])), hint: isNew ? 'تُعيَّن بعد الإنشاء.' : 'تغيير القائمة يمر باعتماد (SA-12).' }); }
    else f.terms = SA.form.field({ name: 'paymentTerms', label: 'شروط الدفع [New]', value: r0.paymentTerms || '', disabled: !canEdit, placeholder: 'غير مُعدّ', hint: 'اختياري — قيمة حرة.' });
    f.status = SA.form.field({ name: 'status', label: 'الحالة', type: 'select', value: r0.status, disabled: true, options: [['active', 'نشط'], ['disabled', 'معطّل']], hint: 'التعطيل من إجراءات القائمة (بتأكيد وسبب).' });
    const crows = h('div.sap-dat-contacts');
    function drawContacts() { SA.clear(crows); contacts.forEach((c, i) => { const n = h('input.input', { value: c.name, placeholder: 'الاسم', disabled: !canEdit, 'aria-label': 'اسم جهة الاتصال ' + (i + 1), oninput: (e) => { c.name = e.target.value; } }); const p = h('input.input', { value: c.phone, placeholder: 'الهاتف', dir: 'ltr', disabled: !canEdit, 'aria-label': 'هاتف جهة الاتصال ' + (i + 1), oninput: (e) => { c.phone = e.target.value; p.removeAttribute('aria-invalid'); } }); crows.append(h('div.sap-dat-crow', {}, n, p, canEdit ? SA.btn({ iconOnly: true, icon: 'trash', kind: 'ghost', size: 'sm', label: 'حذف جهة اتصال', onClick: () => { contacts.splice(i, 1); drawContacts(); } }) : null)); }); if (canEdit) crows.append(h('div', {}, SA.btn({ label: 'إضافة جهة اتصال', icon: 'plus', kind: 'ghost', size: 'sm', onClick: () => { contacts.push({ name: '', phone: '' }); drawContacts(); } }))); }
    drawContacts();
    const tabsEl = SA.tabs({ tabs: [{ id: 'data', label: 'البيانات' }].concat(E_.coll === 'customers' && !isNew ? [{ id: 'pl', label: 'قائمة الأسعار' }] : []).concat(!isNew ? [{ id: 'log', label: 'السجل' }] : []), active: 'data', onChange: (id) => { active = id; draw(); } });
    function draw() {
      SA.clear(body);
      if (active === 'data') {
        body.append(h('div.sap-confirm', {}, ro('الكود', isNew ? 'يُولَّد بعد الحفظ' : h('code', {}, r0.code)), h('p.t-caption', {}, 'الكود فريد ولا يتغير (US-' + (E_.coll === 'customers' ? 'CUS' : 'SUP') + '-0' + (E_.coll === 'customers' ? 3 : 1) + ').'), f.name.el, h('div.sap-formgrid', {}, f.type.el, f.city ? f.city.el : f.terms.el), f.rep ? f.rep.el : null, !isNew && f.status ? f.status.el : null,
          h('div', {}, h('b', {}, 'جهات الاتصال'), crows), E_.coll === 'customers' && !isNew ? ro('حالة الائتمان', SA.openValue('غير مُعدّ — بند 41')) : null, !isNew ? ro('الرصيد', h('b.num', {}, SA.fmt.money(r0.balance))) : null, !isNew ? h('p.t-caption', {}, 'قراءة فقط — المصدر: المالية. لا يُعدَّل من هنا (US-' + (E_.coll === 'customers' ? 'CUS-02' : 'SUP-01') + ').') : null, !isNew ? ro(E_.openLabel, h('b.num', {}, r0[E_.openKey] || 0)) : null,
          !canEdit && !isNew ? SA.alert('info', 'عرض فقط — ليس لديك ', h('code', {}, E_.perm + '.edit'), '.') : null));
      } else if (active === 'pl') {
        const pl = st.find('priceLists', r0.priceListId); const pend = (st.get('priceListChanges') || []).find((c) => c.status === 'pending' && ((c.adds || []).indexOf(r0.id) >= 0 || (c.removes || []).indexOf(r0.id) >= 0));
        body.append(h('div.sap-confirm', {}, f.pl.el, pend ? SA.alert('info', 'فيه تغيير قائمة أسعار قيد الاعتماد (', h('a', { href: SA.link.approval(pend.approvalId) }, pend.approvalId), ').') : null, pl ? SA.kv([['القائمة', h('a', { href: SA.href('customers/price-lists') + '?open=' + pl.id }, pl.name)], ['الحالة', SA.chip(pl.status === 'active' ? 'معتمدة' : 'مسودة', pl.status === 'active' ? 'success' : 'warning')], ['عدد الأصناف', h('span.num', {}, pl.itemsCount)], ['آخر تعديل', SA.fmt.dt(pl.updatedAt)]]) : SA.empty({ icon: 'list', title: 'بدون قائمة أسعار', text: 'بدون قائمة: التاجر لا يرى أسعارًا بعد الدخول (بند 31).' }), SA.alert('info', h('b', {}, 'من يملك تعديل القائمة؟ '), SA.openValue('Open — بند 31'), ' — النموذج يمرّر التغيير باعتماد المدير العام.')));
      } else {
        const log = (st.get('audit') || []).filter((a) => a.target && (a.target.id === r0.id || a.target.id === r0.code)).slice(0, 12);
        body.append(log.length ? h('ul.sap-pol-list', { style: { listStyle: 'none', padding: 0, display: 'grid', gap: '8px' } }, log.map((a) => h('li', { style: { border: '1px solid var(--color-border)', borderRadius: '10px', padding: '8px 12px' } }, h('b', {}, SA.auditLabel(a.code)), h('div.t-caption', {}, a.actor.name + ' · ' + SA.fmt.dt(a.ts) + (a.via === 'mobile' ? ' · موبايل' : '')), a.reason ? h('div.t-caption', {}, a.reason) : null))) : SA.empty({ icon: 'history', title: 'لا يوجد سجل', text: 'لم تُسجَّل أحداث لهذا السجل بعد.' }));
      }
    }
    draw();
    const dr = SA.drawer({ title: isNew ? E_.single + ' جديد' : r0.name, subtitle: isNew ? 'الكود يُولَّد تلقائيًا' : r0.code + ' · ' + typeLabel(E_, r0.type), tabs: tabsEl.el, body, size: 'md',
      foot: canEdit ? [h('button.btn.btn-ghost', { type: 'button', onclick: () => dr.close() }, 'إغلاق'), h('button.btn.btn-primary', { type: 'button', id: 'sap-dat-save', onclick: save }, isNew ? 'إنشاء ' + E_.single : 'حفظ التغييرات')] : [h('button.btn.btn-primary', { type: 'button', onclick: () => dr.close() }, 'إغلاق')] });
    async function save() {
      const req = [f.name, f.type].concat(f.city ? [f.city] : []); if (!SA.form.group(req).validate()) { if (active !== 'data') { tabsEl.setActive('data'); active = 'data'; draw(); } return; }
      const bad = contacts.find((c) => c.phone && !/^[+\d][\d\s-]{6,}$/.test(c.phone)); if (bad) { SA.toast('رقم هاتف غير صحيح: ' + bad.phone, 'error'); return; }
      const v = { name: f.name.get().trim(), type: f.type.get(), contacts: contacts.filter((c) => c.name.trim() || c.phone.trim()).map((c) => ({ name: c.name.trim(), phone: c.phone.trim() })) };
      if (f.city) v.city = f.city.get().trim(); if (f.rep) v.salesRepId = f.rep.get() || null; if (f.terms) v.paymentTerms = f.terms.get().trim() || null;
      const dup = live(E_).find((x) => x.id !== r0.id && norm(x.name) && norm(x.name) === norm(v.name)); if (dup) { const rr = await SA.confirm({ title: 'اسم مشابه لسجل موجود', confirmLabel: 'متابعة الحفظ', impact: ['«' + dup.name + '» (' + dup.code + ') بنفس الاسم تقريبًا.', 'لو هو نفس ' + E_.single + ' استخدم «دمج مكررين» بدل إنشاء سجل جديد.'] }); if (!rr.ok) return; }
      dr.setBusy(true); let id, code;
      try {
        await SA.api(() => {
          if (isNew) { id = st.nextId(E_.coll, E_.idp, E_.idw); code = E_.prefix + '-' + id.split('-')[1]; const rec2 = Object.assign({ id, code, status: 'active', balance: 0 }, E_.coll === 'customers' ? { priceListId: null, openOrders: 0 } : { openPOs: 0 }, v); st.insert(E_.coll, rec2); SA.audit(E_.audit + '.CREATED', { target: { type: E_.coll, id, label: v.name }, after: { code, name: v.name, type: v.type } }); return; }
          const before = { name: r0.name, type: r0.type, city: r0.city, salesRepId: r0.salesRepId, paymentTerms: r0.paymentTerms, contacts: (r0.contacts || []).length }; st.patch(E_.coll, r0.id, v);
          SA.audit(E_.audit + '.UPDATED', { target: { type: E_.coll, id: r0.id, label: v.name }, before, after: { name: v.name, type: v.type, city: v.city, salesRepId: v.salesRepId, paymentTerms: v.paymentTerms, contacts: v.contacts.length } });
        });
      } catch (e) { dr.setBusy(false); return SA.fail(e); }
      if (E_.coll === 'customers' && !isNew && (f.pl.get() || null) !== (r0.priceListId || null)) await requestAssign([r0.id], f.pl.get() || null, r0.priceListId);
      dr.close(); SA.toast(isNew ? 'تم إنشاء ' + E_.single + ' — ' + code : 'تم الحفظ', 'success'); if (onDone) onDone();
    }
    f.name.focus();
  }

  /* price-list assignment (approval-gated) */
  async function requestAssign(custIds, newPl, oldPl) {
    const tgt = newPl ? st.find('priceLists', newPl) : null; const src = oldPl ? st.find('priceLists', oldPl) : null;
    const pendingFor = (st.get('priceListChanges') || []).find((c) => c.status === 'pending' && custIds.some((id) => (c.adds || []).indexOf(id) >= 0 || (c.removes || []).indexOf(id) >= 0));
    if (pendingFor) { SA.toast('فيه تغيير قيد الاعتماد لنفس العميل (' + pendingFor.approvalId + ').', 'warn'); return; }
    const liveTarget = (tgt && tgt.status === 'active') || (!tgt && src && src.status === 'active');
    const names = custIds.map((id) => (st.find('customers', id) || {}).name).join('، ');
    const c = { kind: 'assign', plId: tgt ? tgt.id : src.id, adds: tgt ? custIds.slice() : [], removes: tgt ? [] : custIds.slice(), prices: null };
    if (!liveTarget) { try { await SA.api(() => { applyChange(Object.assign({ approvalId: '—' }, c)); }); } catch (e) { return SA.fail(e); } SA.toast('تم تعيين القائمة (مسودة — بدون اعتماد)', 'success'); return; }
    const r = await SA.confirm({ title: 'طلب اعتماد تغيير قائمة الأسعار', confirmLabel: 'إرسال للاعتماد', impact: ['تغيير ' + (src ? '«' + src.name + '»' : 'بدون قائمة') + ' ← ' + (tgt ? '«' + tgt.name + '»' : 'بدون قائمة') + ' للعميل: ' + names, 'يمر باعتماد المدير العام (SA-12) ويُطبَّق تلقائيًا عند الاعتماد.'] }); if (!r.ok) return;
    try { await SA.api(() => { const ap = SA.requestApproval({ type: 'price_list', title: 'تغيير قائمة أسعار: ' + names + ' ← ' + (tgt ? tgt.name : 'بدون قائمة'), chain: [{ roleId: 'R-02', label: 'المدير العام (General Manager)' }], context: [['العملاء', names], ['من', src ? src.name : 'بدون'], ['إلى', tgt ? tgt.name : 'بدون'], ['ملاحظة', 'يُطبَّق تلقائيًا عند الاعتماد']], ref: { type: 'price_list', id: c.plId } }); st.insert('priceListChanges', Object.assign({ id: 'PLC-' + (Date.now() % 100000), approvalId: ap.id, status: 'pending', createdAt: new Date().toISOString(), requestedBy: SA.session.userId }, c)); SA.audit('PRICELIST.CHANGED', { target: { type: 'priceList', id: c.plId, label: (tgt || src).name }, before: { assigned: src ? src.name : null }, after: { requested: tgt ? tgt.name : null, approval: ap.id }, reason: 'طلب اعتماد' }); }); } catch (e) { return SA.fail(e); }
    SA.toast('أُرسل طلب الاعتماد — التطبيق عند الموافقة', 'success');
  }

  /* ───────────────────────── disable / enable ───────────────────────── */
  async function toggleRecord(E_, r) {
    if (!SA.can(E_.perm + '.disable')) return SA.toast(NOPERM + ' (' + E_.perm + '.disable)', 'warn');
    if (r.status === 'active') {
      const n = r[E_.openKey] || 0; if (n > 0) { const m = SA.modal({ title: 'لا يمكن تعطيل «' + r.name + '»', icon: 'alert', danger: true, size: 'sm', body: h('div.sap-confirm', {}, SA.alert('danger', 'عنده ', h('b.num', {}, n), ' ' + E_.openLabel + '. أغلقها أو حوّلها أولًا.')), foot: [h('button.btn.btn-primary', { type: 'button', onclick: () => m.close() }, 'فهمت')] }); return; }
      const rr = await SA.confirm({ title: 'تعطيل «' + r.name + '»', danger: true, confirmLabel: 'تعطيل', reasonRequired: true, impact: ['لن يظهر في الاختيار للحركات الجديدة.', 'لا حذف — يمكن التفعيل لاحقًا.'] }); if (!rr.ok) return;
      try { await SA.api(() => { st.patch(E_.coll, r.id, { status: 'disabled' }); SA.audit(E_.audit + '.DISABLED', { target: { type: E_.coll, id: r.id, label: r.name }, before: { status: 'active' }, after: { status: 'disabled' }, reason: rr.reason }); }); } catch (e) { return SA.fail(e); } SA.toast('تم التعطيل', 'success');
    } else {
      try { await SA.api(() => { st.patch(E_.coll, r.id, { status: 'active' }); SA.audit(E_.audit + '.ENABLED', { target: { type: E_.coll, id: r.id, label: r.name }, before: { status: 'disabled' }, after: { status: 'active' } }); }); } catch (e) { return SA.fail(e); } SA.toast('تم التفعيل', 'success');
    }
  }
  function exportRows(E_, rows) {
    if (!SA.can(E_.perm + '.export')) return SA.toast(NOPERM + ' (' + E_.perm + '.export)', 'warn');
    const head = ['الكود', 'الاسم', 'النوع', 'المدينة', 'الهاتف', 'الحالة'].concat(E_.coll === 'customers' ? ['المندوب', 'قائمة الأسعار'] : ['شروط الدفع']).concat(['الرصيد (قراءة فقط)']);
    const data = [head].concat(rows.map((r) => [r.code, r.name, typeLabel(E_, r.type), r.city || '', (r.contacts && r.contacts[0] && r.contacts[0].phone) || '', r.status].concat(E_.coll === 'customers' ? [repName(r.salesRepId), plName(r.priceListId) || ''] : [r.paymentTerms || '']).concat([r.balance])));
    SA.download(E_.coll + '-' + new Date().toISOString().slice(0, 10) + '.csv', SA.csv(data), 'text/csv'); SA.audit('EXPORT.DATA', { target: { type: E_.coll, id: E_.coll, label: E_.plural }, after: { rows: rows.length, format: 'CSV' } }); SA.toast('تم تصدير ' + rows.length + ' سجل', 'success');
  }

  /* ───────────────────────── merge wizard ───────────────────────── */
  function dupGroups(E_) {
    const rows = live(E_); const groups = []; const used = new Set();
    rows.forEach((a) => { if (used.has(a.id)) return; const g = rows.filter((b) => b.id !== a.id && !used.has(b.id) && ((norm(a.name) && norm(a.name) === norm(b.name)) || (digits(a.contacts && a.contacts[0] && a.contacts[0].phone) && digits(a.contacts && a.contacts[0] && a.contacts[0].phone) === digits(b.contacts && b.contacts[0] && b.contacts[0].phone)))); if (g.length) { used.add(a.id); g.forEach((x) => used.add(x.id)); groups.push([a].concat(g)); } });
    return groups;
  }
  function openMerge(E_) {
    if (!SA.can(E_.perm + '.merge')) return SA.toast(NOPERM + ' (' + E_.perm + '.merge)', 'warn');
    let step = 0; let primary = null; let dups = [];
    const rows = live(E_); const stepHost = h('div'); const stepper = h('div'); const foot = [];
    const groups = dupGroups(E_);
    const prim = SA.form.field({ name: 'p', label: 'السجل الأصلي (يبقى)', type: 'select', value: '', options: [['', 'اختر…']].concat(rows.map((r) => [r.id, r.code + ' — ' + r.name])), required: true, onChange: (v) => { primary = v; dups = dups.filter((d) => d !== v); drawStep(); } });
    function sumFor(ids) { return ids.map((id) => st.find(E_.coll, id)).filter(Boolean); }
    function drawStep() {
      SA.clear(stepper); stepper.append(SA.stepper(['اختيار', 'معاينة الدمج', 'تأكيد'], step)); SA.clear(stepHost); SA.clear(back); SA.clear(next);
      back.textContent = step === 0 ? 'إلغاء' : 'رجوع';
      if (step === 0) {
        stepHost.append(groups.length ? h('div', {}, h('b', {}, 'مكررات محتملة (نفس الاسم أو الهاتف)'), h('div.sap-dat-pick', { style: { marginBlock: '8px' } }, groups.map((g) => h('label', {}, h('input', { type: 'radio', name: 'grp', onchange: () => { primary = g[0].id; dups = g.slice(1).map((x) => x.id); prim.set(primary); drawStep(); } }), h('span', {}, g.map((x) => x.code + ' ' + x.name).join('  ⟷  ')))))) : SA.alert('info', 'لم يُكتشف مكررات تلقائيًا. اختر السجلات يدويًا.'), prim.el,
          primary ? h('div', {}, h('b', {}, 'السجلات المكررة (تُدمج داخل الأصلي)'), h('div.sap-dat-pick', { style: { marginBlock: '8px' } }, rows.filter((r) => r.id !== primary).map((r) => h('label', {}, h('input', { type: 'checkbox', checked: dups.indexOf(r.id) >= 0, onchange: (e) => { if (e.target.checked) dups.push(r.id); else dups = dups.filter((x) => x !== r.id); next.disabled = !dups.length; } }), h('span', {}, r.code + ' — ' + r.name))))) : null);
        next.textContent = 'معاينة'; next.disabled = !primary || !dups.length; next.onclick = () => { if (!primary || !dups.length) return; step = 1; drawStep(); };
      } else if (step === 1) {
        const p = st.find(E_.coll, primary); const ds = sumFor(dups); const all = [p].concat(ds);
        const totalOpen = all.reduce((a, x) => a + (x[E_.openKey] || 0), 0); const totalBal = all.reduce((a, x) => a + (x.balance || 0), 0);
        const phones = new Set(); all.forEach((x) => (x.contacts || []).forEach((c) => phones.add(c.phone || c.name)));
        stepHost.append(SA.alert('warning', h('b', {}, 'الدمج غير قابل للتراجع بسهولة. '), 'السجلات المكررة تُعلَّم «مدموج» ولا تظهر، ويُسجَّل الدمج بالتفصيل.'),
          h('div.table-wrap', {}, h('table.table.sap-dat-mrg', {}, h('thead', {}, h('tr', {}, ['البند', 'قبل (الأصلي)', 'بعد الدمج'].map((t) => h('th', {}, t)))), h('tbody', {},
            h('tr', {}, h('td', {}, 'الأصلي'), h('td', {}, p.code + ' ' + p.name), h('td', {}, 'يبقى كما هو')),
            h('tr', {}, h('td', {}, E_.openLabel), h('td.num', {}, p[E_.openKey] || 0), h('td.num', {}, totalOpen)),
            h('tr', {}, h('td', {}, 'الرصيد (مصدره المالية)'), h('td.num', {}, SA.fmt.money(p.balance)), h('td', {}, h('span.num', {}, SA.fmt.money(totalBal)), SA.demoValue('تجريبي — في الإنتاج تُرحّله المالية'))),
            h('tr', {}, h('td', {}, 'جهات الاتصال'), h('td.num', {}, (p.contacts || []).length), h('td.num', {}, phones.size)),
            E_.coll === 'customers' ? h('tr', {}, h('td', {}, 'قوائم الأسعار وحسابات التجار'), h('td', {}, plName(p.priceListId) || 'بدون'), h('td', {}, 'تُنقل ارتباطات المكررين للأصلي')) : null,
            h('tr', {}, h('td', {}, 'سيُدمج'), h('td', { colspan: 2 }, ds.map((d) => d.code + ' ' + d.name).join('، ')))))));
        next.textContent = 'متابعة للتأكيد'; next.disabled = false; next.onclick = () => { step = 2; drawStep(); };
      } else {
        const why = SA.form.field({ name: 'why', label: 'سبب الدمج', type: 'textarea', rows: 2, required: true });
        stepHost.append(SA.alert('danger', 'سيتم دمج ' + dups.length + ' سجل داخل «' + st.find(E_.coll, primary).name + '» الآن.'), why.el);
        next.textContent = 'تنفيذ الدمج'; next.disabled = false; next.className = 'btn btn-accent';
        next.onclick = async () => {
          if (!why.validate()) return; if (!(await SA.stepUp('policy.change', { force: true, title: 'تأكيد دمج السجلات', text: 'الدمج عملية حساسة لا يُتراجع عنها بسهولة. أدخل كلمة مرورك أو الكود.' }))) return;
          m.setBusy(true); const p = clone(st.find(E_.coll, primary)); const ds = sumFor(dups).map(clone);
          try {
            await SA.api(() => {
              const contacts = []; const seen = new Set(); [p].concat(ds).forEach((x) => (x.contacts || []).forEach((c) => { const k = c.phone || c.name; if (!seen.has(k)) { seen.add(k); contacts.push(c); } }));
              st.update(E_.coll, (l) => { const P = l.find((x) => x.id === primary); P.contacts = contacts; P[E_.openKey] = (P[E_.openKey] || 0) + ds.reduce((a, d) => a + (d[E_.openKey] || 0), 0); P.balance = (P.balance || 0) + ds.reduce((a, d) => a + (d.balance || 0), 0); if (E_.coll === 'customers' && !P.priceListId) { const d1 = ds.find((d) => d.priceListId); if (d1) P.priceListId = d1.priceListId; } if (E_.coll === 'customers' && !P.salesRepId) { const d1 = ds.find((d) => d.salesRepId); if (d1) P.salesRepId = d1.salesRepId; } ds.forEach((d) => { const D = l.find((x) => x.id === d.id); D.status = 'merged'; D.mergedInto = primary; D[E_.openKey] = 0; D.balance = 0; }); });
              if (E_.coll === 'customers') { st.update('priceLists', (l) => l.forEach((pl) => { pl.assignedTo = Array.from(new Set((pl.assignedTo || []).map((x) => (dups.indexOf(x) >= 0 ? primary : x)))); })); st.update('dealers', (l) => l.forEach((dl) => { if (dups.indexOf(dl.customerId) >= 0) dl.customerId = primary; })); }
              SA.audit(E_.audit + '.MERGED', { target: { type: E_.coll, id: primary, label: p.name }, before: { primary: p.code, duplicates: ds.map((d) => d.code + ' ' + d.name), [E_.openKey]: p[E_.openKey], balance: p.balance }, after: { merged: ds.length, [E_.openKey]: (p[E_.openKey] || 0) + ds.reduce((a, d) => a + (d[E_.openKey] || 0), 0), balance: (p.balance || 0) + ds.reduce((a, d) => a + (d.balance || 0), 0) }, reason: why.get() });
            });
          } catch (e) { m.setBusy(false); return SA.fail(e); }
          m.close(); SA.toast('تم دمج ' + dups.length + ' سجل', 'success');
        };
      }
      if (step < 2) next.className = 'btn btn-primary';
    }
    const back = h('button.btn.btn-ghost', { type: 'button', onclick: () => { if (step === 0) m.close(); else { step--; drawStep(); } } });
    const next = h('button.btn.btn-primary', { type: 'button' });
    const m = SA.modal({ title: 'دمج ' + E_.plural + ' مكررين', subtitle: 'Wizard · SCR-' + (E_.coll === 'customers' ? 'CUS' : 'SUP') + '-04', icon: 'swap', size: 'lg', body: h('div.sap-confirm', {}, stepper, stepHost), foot: [back, next] });
    drawStep();
  }

  /* ───────────────────────── import wizard ───────────────────────── */
  const SAMPLE = { customers: 'name,type,city,contact_name,phone,rep_email,price_list\nمعرض الواحة للنوافذ,dealer,بنها,أ. حازم نور,+20 100 300 0001,sales.rep1@eg-demo.test,قائمة تجار الجملة\nشركة الإنشاءات الحديثة,contractor,السويس,م. عصام فهمي,+20 100 300 0002,,قائمة المقاولين\nمعرض النيل للنوافذ,dealer,القاهرة,م. سامي ناجي,+20 100 000 0001,,\n,dealer,طنطا,بدون اسم,+20 100 300 0004,,\nمكتب الهندسة الذكية,agency,الجيزة,أ. دينا,+20 100 300 0005,,\nمقاولات الدلتا,contractor,,أ. رامي,+20 100 300 0006,,\nمعرض المستقبل,dealer,دمياط,أ. ياسر,12ab,,قائمة غير موجودة\n', suppliers: 'name,type,contact_name,phone,payment_terms\nمصنع الزجاج الحديث,raw,أ. وليد,+20 100 400 0001,آجل — شروط تجريبية\nشركة المقابض الذهبية,accessories,أ. هالة,+20 100 400 0002,\nالزجاج المصري,raw,م. سعيد بدر,+20 100 100 0003,\n,raw,بدون اسم,+20 100 400 0004,\nورشة التجميع,unknown,أ. كامل,+20 100 400 0005,\n' };
  function validateRows(E_, text) {
    const raw = parseCSV(text); if (raw.length < 2) return { error: 'الملف فاضي أو بدون صفوف بيانات (لازم صف عناوين ثم بيانات).' };
    const hdr = raw[0].map((x) => x.trim().toLowerCase()); const idx = {}; Object.keys(HDR).forEach((k) => { const i = hdr.findIndex((x) => HDR[k].some((a) => a.toLowerCase() === x)); if (i >= 0) idx[k] = i; });
    const req = E_.coll === 'customers' ? ['name', 'type', 'city'] : ['name', 'type']; const miss = req.filter((k) => idx[k] === undefined); if (miss.length) return { error: 'أعمدة مطلوبة غير موجودة: ' + miss.join('، ') };
    const existing = live(E_); const seen = {}; const out = [];
    raw.slice(1).forEach((r, i) => {
      const g = (k) => (idx[k] === undefined ? '' : String(r[idx[k]] || '').trim()); const row = { line: i + 2, name: g('name'), typeRaw: g('type'), city: g('city'), contact: g('contact_name'), phone: g('phone'), rep: g('rep_email'), pl: g('price_list'), terms: g('payment_terms'), errors: [], warns: [] };
      row.type = TYPEMAP[row.typeRaw] || TYPEMAP[row.typeRaw.toLowerCase()] || null;
      if (!row.name) row.errors.push('الاسم مطلوب'); if (!row.typeRaw) row.errors.push('النوع مطلوب'); else if (!row.type || !E_.types.some((t) => t[0] === row.type)) row.errors.push('نوع غير معروف «' + row.typeRaw + '»');
      if (E_.coll === 'customers' && !row.city) row.errors.push('المدينة مطلوبة');
      if (row.phone && !/^[+\d][\d\s-]{6,}$/.test(row.phone)) row.errors.push('رقم الهاتف غير صحيح');
      if (E_.coll === 'customers') { if (row.rep) { const u = (st.get('users') || []).find((x) => x.email.toLowerCase() === row.rep.toLowerCase() && x.status === 'active'); if (!u) row.warns.push('مندوب غير موجود — يُتجاهل'); else row.repId = u.id; } if (row.pl) { const p = (st.get('priceLists') || []).find((x) => x.name === row.pl || x.id === row.pl); if (!p) row.warns.push('قائمة أسعار غير موجودة — تُتجاهل'); else row.plId = p.id; } }
      const n = norm(row.name); if (n) { const ex = existing.find((x) => norm(x.name) === n); if (ex) row.warns.push('مشابه لـ' + ex.code + ' ' + ex.name + ' (مكرر محتمل)'); if (seen[n]) row.warns.push('مكرر داخل الملف (سطر ' + seen[n] + ')'); else seen[n] = row.line; }
      row.status = row.errors.length ? 'error' : row.warns.length ? 'warn' : 'ok'; out.push(row);
    });
    return { rows: out };
  }
  function openImport(E_) {
    if (!SA.can(E_.perm + '.import')) return SA.toast(NOPERM + ' (' + E_.perm + '.import)', 'warn');
    let step = 0; let res = null; let result = null; let incl = false; let filt = 'all';
    const ta = h('textarea.textarea', { rows: 6, dir: 'ltr', placeholder: 'الصق محتوى CSV/Excel هنا (أول سطر = العناوين)', 'aria-label': 'محتوى الملف', style: { fontFamily: 'var(--font-en)', fontSize: '12px' } });
    const fileIn = h('input', { type: 'file', accept: '.csv,.txt,.tsv', hidden: true, 'aria-label': 'اختيار ملف' }); const msg = h('div.sap-field-error', { role: 'alert', hidden: true });
    fileIn.addEventListener('change', () => { const f = fileIn.files[0]; if (!f) return; if (!/\.(csv|txt|tsv)$/i.test(f.name)) { msg.hidden = false; msg.textContent = 'الملف لازم يكون CSV (احفظ ملف Excel بصيغة CSV).'; return; } const fr = new FileReader(); fr.onload = () => { ta.value = fr.result; msg.hidden = true; }; fr.readAsText(f, 'utf-8'); });
    const drop = h('div.sap-dat-drop', { tabindex: '0', role: 'button', 'aria-label': 'اختيار ملف CSV' }, SA.icon('upload', 'icon-lg'), h('div', {}, h('b', {}, 'اسحب ملف CSV هنا أو اضغط للاختيار')), h('div.t-caption', {}, 'ملف Excel احفظه CSV أو انسخ الخلايا والصقها بالأسفل.'));
    drop.addEventListener('click', () => fileIn.click()); drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); })); ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) { fileIn.files = e.dataTransfer.files; fileIn.dispatchEvent(new Event('change')); } });
    const stepper = h('div'), main = h('div'); const back = h('button.btn.btn-ghost', { type: 'button' }), next = h('button.btn.btn-primary', { type: 'button' });
    function draw() {
      SA.clear(stepper); stepper.append(SA.stepper(['رفع الملف', 'تقرير التحقق', 'التنفيذ والتقرير'], step)); SA.clear(main); next.disabled = false; next.className = 'btn btn-primary'; next.hidden = false;
      back.textContent = step === 0 ? 'إلغاء' : step === 2 ? 'إغلاق' : 'رجوع'; back.onclick = () => { if (step === 0 || step === 2) m.close(); else { step = 0; draw(); } };
      if (step === 0) {
        main.append(drop, fileIn, msg, h('label.label', { style: { marginBlockStart: '12px', display: 'block' } }, 'أو الصق المحتوى'), ta, h('div.cluster', { style: { marginBlockStart: '8px' } }, SA.btn({ label: 'استخدم ملفًا نموذجيًا فيه أخطاء', icon: 'file', kind: 'ghost', size: 'sm', onClick: () => { ta.value = SAMPLE[E_.coll]; } }), SA.btn({ label: 'تنزيل قالب CSV', icon: 'download', kind: 'ghost', size: 'sm', onClick: () => SA.download(E_.coll + '-template.csv', SAMPLE[E_.coll].split('\n')[0] + '\n', 'text/csv') })), h('p.t-caption', {}, 'الأعمدة: ', h('code', {}, SAMPLE[E_.coll].split('\n')[0])));
        next.textContent = 'تحقق من الملف'; next.onclick = () => { const v = validateRows(E_, ta.value); if (v.error) { msg.hidden = false; msg.textContent = v.error; return; } res = v; step = 1; filt = 'all'; draw(); };
      } else if (step === 1) {
        const c = { ok: 0, warn: 0, error: 0 }; res.rows.forEach((r) => { c[r.status]++; });
        const list = res.rows.filter((r) => filt === 'all' || r.status === filt);
        main.append(h('div.sap-dat-sum', {}, h('span', {}, 'الكل ', h('b.num', {}, res.rows.length)), h('span', { style: { color: 'var(--color-success)' } }, 'سليم ', h('b.num', {}, c.ok)), h('span', { style: { color: 'var(--color-warning,#8a5a00)' } }, 'تحذير ', h('b.num', {}, c.warn)), h('span', { style: { color: 'var(--color-danger)' } }, 'خطأ ', h('b.num', {}, c.error))),
          SA.segmented([['all', 'الكل'], ['error', 'أخطاء'], ['warn', 'تحذيرات'], ['ok', 'سليم']], filt, (v) => { filt = v; draw(); }),
          h('div.table-wrap.sap-dat-rep', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['سطر', 'الاسم', 'النوع', E_.coll === 'customers' ? 'المدينة' : 'الهاتف', 'الحالة / الملاحظات'].map((t) => h('th', {}, t)))), h('tbody', {}, list.map((r) => h('tr', { class: r.status === 'error' ? 'is-err' : r.status === 'warn' ? 'is-warn' : '' }, h('td.num', {}, r.line), h('td', {}, r.name || '—'), h('td', {}, r.type ? typeLabel(E_, r.type) : r.typeRaw || '—'), h('td', {}, E_.coll === 'customers' ? r.city || '—' : r.phone || '—'), h('td', {}, r.status === 'ok' ? SA.chip('سليم', 'success') : [r.errors.map((x) => h('div', { style: { color: 'var(--color-danger)' } }, x)), r.warns.map((x) => h('div', { style: { color: 'var(--color-warning,#8a5a00)' } }, x))])))))),
          c.warn ? h('label.check', { style: { marginBlockStart: '10px' } }, h('input', { type: 'checkbox', checked: incl, onchange: (e) => { incl = e.target.checked; draw(); } }), 'استيراد الصفوف ذات التحذير أيضًا (قد ينتج مكررات)') : null);
        const n = c.ok + (incl ? c.warn : 0); next.textContent = 'استيراد ' + n + ' صف'; next.disabled = !n; next.onclick = run;
      } else {
        main.append(SA.alert(result.failed ? 'warning' : 'success', h('b', {}, 'تم استيراد ' + result.created + ' سجل. '), 'تم تخطي ' + result.skipped + ' صف.'), h('div.sap-dat-sum', {}, h('span', {}, 'أُنشئ ', h('b.num', {}, result.created)), h('span', {}, 'تخطّي ', h('b.num', {}, result.skipped))), result.skipped ? h('div', { style: { marginBlockStart: '10px' } }, SA.btn({ label: 'تنزيل تقرير الصفوف المتخطاة', icon: 'download', kind: 'ghost', size: 'sm', onClick: () => SA.download(E_.coll + '-import-report.csv', SA.csv([['سطر', 'الاسم', 'السبب']].concat(result.skippedRows.map((r) => [r.line, r.name, r.errors.concat(r.warns).join(' | ')]))), 'text/csv') })) : null, h('p.t-caption', {}, 'تم تسجيل ' + E_.audit + '.IMPORTED في سجل التدقيق.'));
        next.hidden = true;
      }
    }
    async function run() {
      const take = res.rows.filter((r) => r.status === 'ok' || (incl && r.status === 'warn')); m.setBusy(true);
      try {
        await SA.api(() => {
          take.forEach((r) => { const id = st.nextId(E_.coll, E_.idp, E_.idw); const code = E_.prefix + '-' + id.split('-')[1]; const rec = Object.assign({ id, code, name: r.name, type: r.type, status: 'active', balance: 0, contacts: r.contact || r.phone ? [{ name: r.contact, phone: r.phone }] : [] }, E_.coll === 'customers' ? { city: r.city, salesRepId: r.repId || null, priceListId: null, openOrders: 0 } : { paymentTerms: r.terms || null, openPOs: 0 }); st.insert(E_.coll, rec); if (r.plId) { st.update('priceLists', (l) => { const p = l.find((x) => x.id === r.plId); if (p && (p.assignedTo || []).indexOf(id) < 0) p.assignedTo.push(id); }); st.patch(E_.coll, id, { priceListId: r.plId }); } });
          const skipped = res.rows.filter((r) => take.indexOf(r) < 0); result = { created: take.length, skipped: skipped.length, skippedRows: skipped, failed: skipped.length };
          SA.audit(E_.audit + '.IMPORTED', { target: { type: E_.coll, id: E_.coll, label: E_.plural }, after: { total: res.rows.length, created: take.length, skipped: skipped.length, withWarnings: incl }, reason: 'استيراد ملف' });
        });
      } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.setBusy(false); step = 2; draw();
    }
    const m = SA.modal({ title: 'استيراد ' + E_.plural + ' من Excel/CSV', subtitle: 'Wizard · SCR-' + (E_.coll === 'customers' ? 'CUS' : 'SUP') + '-05', icon: 'upload', size: 'lg', body: h('div.sap-confirm', {}, stepper, main), foot: [back, next] });
    draw();
  }

  /* ───────────────────────── list screens ───────────────────────── */
  function listScreen(E_, root, ctx) {
    const plView = E_.coll === 'customers' && ctx.path[0] === 'price-lists';
    ctx.setCrumbs([{ label: 'البيانات' }, { label: E_.plural, href: plView ? '#/customers' : null }].concat(plView ? [{ label: 'قوائم الأسعار' }] : []));
    return mount(root, (host, retry) => {
      const cc = E_.coll === 'customers';
      const tabs = cc ? SA.tabs({ tabs: [{ id: 'list', label: 'العملاء', icon: 'users' }, { id: 'pl', label: 'قوائم الأسعار', icon: 'list' }], active: plView ? 'pl' : 'list', label: 'أقسام العملاء', onChange: (id) => SA.nav(id === 'pl' ? 'customers/price-lists' : 'customers') }) : null;
      host.append(SA.pageHead({ title: plView ? 'قوائم الأسعار' : E_.plural, desc: plView ? 'التعيين والتفعيل وتعديل الأسعار يمر باعتماد المدير العام ويُطبَّق تلقائيًا. من يملك التعديل في المبيعات Open (بند 31).' : cc ? 'سجلات العملاء والموزعين والمقاولين. الرصيد للعرض فقط ومصدره المالية.' : 'سجلات الموردين (خامات وإكسسوارات). الرصيد للعرض فقط ومصدره المالية.', tags: [SA.tag('approved'), plView ? SA.tag('pending', 'Pending بند 31') : null],
        actions: plView ? [SA.btn({ label: 'قائمة جديدة', icon: 'plus', kind: 'accent', perm: 'sa.customers.edit', onClick: () => newPriceList() })] : [SA.btn({ label: 'استيراد Excel', icon: 'upload', kind: 'ghost', perm: E_.perm + '.import', onClick: () => openImport(E_) }), SA.btn({ label: 'دمج مكررين', icon: 'swap', kind: 'ghost', perm: E_.perm + '.merge', onClick: () => openMerge(E_) }), SA.btn({ label: E_.single + ' جديد', icon: 'plus', kind: 'accent', perm: E_.perm + '.create', onClick: () => openRecord(E_, null) })] }));
      if (tabs) host.append(tabs.el);
      const body = h('div'); host.append(body);
      return plView ? plScreen(body, retry, ctx) : recScreen(E_, body, retry, ctx);
    }, { skel: 'table' });
  }
  function recScreen(E_, body, retry, ctx) {
    const scopeNote = E_.scoped && SA.scopeOf('customers') !== 'all' ? SA.alert('info', h('b', {}, 'نطاق عرضك: ' + ({ own: 'عملاؤك فقط', team: 'عملاؤك وعملاء فريقك', department: 'عملاء قسمك' }[SA.scopeOf('customers')] || '')), ' — تظهر لك السجلات المرتبطة بحسابك (scope=' + SA.scopeOf('customers') + ').') : null;
    const pills = h('div.sap-dat-pills'); let table = null;
    const counts = () => { const rows = visible(E_); return { all: rows.length, active: rows.filter((r) => r.status === 'active').length, disabled: rows.filter((r) => r.status === 'disabled').length, nopl: E_.coll === 'customers' ? rows.filter((r) => !r.priceListId && r.status === 'active').length : 0 }; };
    function drawPills() { SA.clear(pills); const c = counts(); [['', 'الكل', c.all], ['active', 'نشط', c.active], ['disabled', 'معطّل', c.disabled]].concat(E_.coll === 'customers' ? [['nopl', 'بلا قائمة أسعار', c.nopl]] : []).forEach((p) => pills.append(h('button.sap-pill', { type: 'button', onclick: () => { if (!table) return; if (p[0] === 'nopl') { table.setFilter('status', ''); table.setFilter('pl', 'none'); } else { table.setFilter('pl', ''); table.setFilter('status', p[0]); } } }, p[1], h('b.num', {}, p[2])))); }
    table = SA.table({ rowId: 'id', pageSize: 10, selectable: true, caption: 'قائمة ' + E_.plural, rows: () => visible(E_), search: { placeholder: 'ابحث بالاسم أو الكود أو المدينة…', keys: ['name', 'code', 'city'] },
      initial: { filters: { status: (ctx.params && ctx.params.status) || '' } },
      filters: [{ key: 'type', label: 'النوع', options: E_.types }, { key: 'status', label: 'الحالة', options: [['active', 'نشط'], ['disabled', 'معطّل']] }].concat(E_.coll === 'customers' ? [{ key: 'repId', label: 'المندوب', options: (st.get('users') || []).filter((u) => u.departmentId === 'D-02').map((u) => [u.id, u.name]), test: (r, v) => r.salesRepId === v }, { key: 'pl', label: 'قائمة الأسعار', options: [['none', 'بدون قائمة']].concat((st.get('priceLists') || []).map((p) => [p.id, p.name])), test: (r, v) => (v === 'none' ? !r.priceListId : r.priceListId === v) }] : []),
      columns: [{ key: 'name', label: E_.single, sort: true, render: (r) => h('div.sap-usercell', {}, SA.avatar(r.name), h('div', {}, h('b', {}, r.name), h('small', {}, r.code + (r.contacts && r.contacts[0] ? ' · ' + r.contacts[0].name : '')))) }, { key: 'type', label: 'النوع', sort: true, render: (r) => typeLabel(E_, r.type) }]
        .concat(E_.coll === 'customers' ? [{ key: 'city', label: 'المدينة', sort: true }, { key: 'salesRepId', label: 'المندوب', value: (r) => repName(r.salesRepId), render: (r) => (r.salesRepId ? repName(r.salesRepId) : h('span.t-muted', {}, '—')) }, { key: 'priceListId', label: 'قائمة الأسعار', value: (r) => plName(r.priceListId) || '', render: (r) => plName(r.priceListId) || h('span.t-muted', {}, 'غير مربوط') }] : [{ key: 'paymentTerms', label: 'شروط الدفع', render: (r) => r.paymentTerms || SA.openValue('غير مُعدّ') }])
        .concat([{ key: 'balance', label: 'الرصيد (قراءة فقط)', sort: true, render: (r) => h('span.sap-dat-bal', {}, SA.icon('lock', 'icon-sm'), h('span.num', {}, SA.fmt.money(r.balance))) }, { key: 'status', label: 'الحالة', sort: true, render: statusChip }]),
      bulk: [{ label: 'تصدير CSV', icon: 'download', perm: E_.perm + '.export', run: (rows) => exportRows(E_, rows) }].concat(E_.coll === 'customers' ? [{ label: 'تعيين مندوب', icon: 'user', perm: 'sa.customers.edit', run: bulkRep }] : []).concat([{ label: 'تعطيل', icon: 'userx', danger: true, perm: E_.perm + '.disable', run: bulkDisable }]),
      rowActions: (r) => [{ label: 'فتح / تعديل', icon: 'edit', onClick: () => openRecord(E_, r) }, { divider: true }, r.status === 'active' ? { label: 'تعطيل', icon: 'userx', danger: true, onClick: () => toggleRecord(E_, r), disabled: SA.can(E_.perm + '.disable') ? false : NOPERM } : { label: 'تفعيل', icon: 'check', onClick: () => toggleRecord(E_, r), disabled: SA.can(E_.perm + '.disable') ? false : NOPERM }],
      onRowClick: (r) => openRecord(E_, r), toolbar: [SA.btn({ label: 'تصدير القائمة', icon: 'download', kind: 'ghost', perm: E_.perm + '.export', onClick: () => exportRows(E_, table.filteredRows()) })],
      empty: { icon: E_.icon, title: 'لا يوجد ' + (E_.coll === 'customers' ? 'عملاء' : 'موردون') + ' بعد', text: 'أضف أول ' + E_.single + ' أو استورد ملف Excel. الكود يُولَّد تلقائيًا ولا يتغير.', action: { label: E_.single + ' جديد', perm: E_.perm + '.create', onClick: () => openRecord(E_, null) } }, onRetry: retry });
    async function bulkDisable(rows) { const ok = rows.filter((r) => r.status === 'active' && !(r[E_.openKey] > 0)); const skip = rows.length - ok.length; if (!ok.length) return SA.toast('لا يوجد سجل قابل للتعطيل (معطّل بالفعل أو عنده ' + E_.openLabel + ').', 'error', { ms: 6000 }); const rr = await SA.confirm({ title: 'تعطيل ' + ok.length + ' سجل', danger: true, confirmLabel: 'تعطيل الكل', reasonRequired: true, impact: ok.slice(0, 5).map((r) => r.name).concat(ok.length > 5 ? ['… و' + (ok.length - 5)] : []), warnings: skip ? ['تخطّينا ' + skip + ' (معطّل أو عنده ' + E_.openLabel + ').'] : [] }); if (!rr.ok) return; try { await SA.api(() => ok.forEach((r) => { st.patch(E_.coll, r.id, { status: 'disabled' }); SA.audit(E_.audit + '.DISABLED', { target: { type: E_.coll, id: r.id, label: r.name }, before: { status: 'active' }, after: { status: 'disabled' }, reason: rr.reason }); })); } catch (e) { return SA.fail(e); } table.clearSelection(); SA.toast('تم تعطيل ' + ok.length, 'success'); }
    async function bulkRep(rows) { const reps = (st.get('users') || []).filter((u) => u.status === 'active' && u.departmentId === 'D-02'); const sel = SA.form.field({ name: 'r', label: 'المندوب الجديد', type: 'select', required: true, options: [['', 'اختر…']].concat(reps.map((u) => [u.id, u.name])) }); const m = SA.modal({ title: 'تعيين مندوب لـ' + rows.length + ' عميل', icon: 'user', size: 'sm', body: h('div.sap-confirm', {}, sel.el, SA.alert('info', 'يغيّر نطاق own: المندوب السابق لن يرى هؤلاء العملاء.')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => { if (!sel.validate()) return; m.setBusy(true); try { await SA.api(() => rows.forEach((r) => { st.patch('customers', r.id, { salesRepId: sel.get() }); SA.audit('CUSTOMER.UPDATED', { target: { type: 'customers', id: r.id, label: r.name }, before: { salesRepId: r.salesRepId }, after: { salesRepId: sel.get() } }); })); } catch (e) { m.setBusy(false); return SA.fail(e); } m.close(); table.clearSelection(); SA.toast('تم تعيين المندوب', 'success'); } }, 'تعيين')] }); }
    body.append(scopeNote, pills, h('div.card.card-flush.sap-listcard', {}, table.el)); drawPills();
    const off = st.subscribe(E_.coll, () => { drawPills(); table.refresh(); });
    return off;
  }

  /* — price lists — */
  function newPriceList() {
    if (!SA.can('sa.customers.edit')) return SA.toast(NOPERM + ' (sa.customers.edit)', 'warn');
    const name = SA.form.field({ name: 'n', label: 'اسم القائمة', required: true, rules: [(v) => ((st.get('priceLists') || []).some((p) => p.name === String(v).trim()) ? 'الاسم مستخدم' : null)] });
    const m = SA.modal({ title: 'قائمة أسعار جديدة', icon: 'list', size: 'sm', body: h('div.sap-confirm', {}, name.el, SA.alert('info', 'تُنشأ كمسودة. تفعيلها وتعيينها لعملاء يمر باعتماد.')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => { if (!name.validate()) return; m.setBusy(true); const id = st.nextId('priceLists', 'PL', 2); try { await SA.api(() => { st.insert('priceLists', { id, name: name.get().trim(), itemsCount: SAMPLE_ITEMS.length, assignedTo: [], updatedAt: new Date().toISOString(), status: 'draft', items: SAMPLE_ITEMS.map((i) => ({ sku: i[0], name: i[1], unit: i[2], price: null })) }); SA.audit('PRICELIST.CHANGED', { target: { type: 'priceList', id, label: name.get().trim() }, after: { status: 'draft' }, reason: 'إنشاء قائمة' }); }); } catch (e) { m.setBusy(false); return SA.fail(e); } m.close(); SA.toast('تم إنشاء القائمة (مسودة)', 'success'); } }, 'إنشاء')] });
    name.focus();
  }
  function openPriceList(pl) {
    const canEdit = SA.can('sa.customers.edit'); const p0 = clone(pl); let tab = 'a'; const body = h('div');
    const pend = () => (st.get('priceListChanges') || []).filter((c) => c.plId === pl.id && c.status === 'pending');
    const custs = (st.get('customers') || []).filter((c) => c.status !== 'merged' && c.status === 'active'); const assigned = new Set((p0.assignedTo || []).filter((x) => /^C-/.test(x)));
    const nameF = SA.form.field({ name: 'name', label: 'اسم القائمة', value: p0.name, required: true, disabled: !canEdit });
    const statusF = SA.form.field({ name: 'status', label: 'الحالة', type: 'select', value: p0.status, disabled: !canEdit || p0.status === 'active', options: [['draft', 'مسودة'], ['active', 'معتمدة (فعّالة)']], hint: p0.status === 'active' ? 'القائمة الفعّالة لا تُرجَع لمسودة من هنا.' : 'التفعيل يمر باعتماد المدير العام.' });
    const prices = {}; (p0.items || []).forEach((i) => { prices[i.sku] = i.price; });
    const selHost = h('div.sap-dat-pick');
    function drawSel() { SA.clear(selHost); custs.forEach((c) => selHost.append(h('label', {}, h('input', { type: 'checkbox', checked: assigned.has(c.id), disabled: !canEdit, onchange: (e) => { if (e.target.checked) assigned.add(c.id); else assigned.delete(c.id); } }), h('span', {}, c.code + ' — ' + c.name, c.priceListId && c.priceListId !== pl.id ? h('small.t-muted', {}, ' (حاليًا: ' + (plName(c.priceListId) || '') + ')') : null)))); }
    drawSel();
    const tabsEl = SA.tabs({ tabs: [{ id: 'a', label: 'التعيين' }, { id: 'i', label: 'الأصناف والأسعار' }], active: 'a', onChange: (id) => { tab = id; draw(); } });
    function draw() {
      SA.clear(body);
      const pe = pend(); const peNode = pe.length ? SA.alert('info', 'تغييرات قيد الاعتماد: ', pe.map((c) => h('a', { href: SA.link.approval(c.approvalId), style: { marginInlineEnd: '8px' } }, c.approvalId))) : null;
      if (tab === 'a') body.append(h('div.sap-confirm', {}, peNode, nameF.el, statusF.el, h('div', {}, h('b', {}, 'العملاء المعيّنون'), h('p.t-caption', {}, 'تعيين عميل لقائمة فعّالة = طلب اعتماد. العميل له قائمة واحدة فقط.'), selHost), SA.alert('info', h('b', {}, 'من يملك التعديل؟ '), SA.openValue('Open — بند 31'))));
      else body.append(h('div.sap-confirm', {}, peNode, h('div.table-wrap', {}, h('table.table.sap-dat-items', {}, h('thead', {}, h('tr', {}, ['الصنف', 'الوحدة', 'السعر (ج.م)'].map((t) => h('th', {}, t)))), h('tbody', {}, (p0.items || []).map((i) => h('tr', {}, h('td', {}, h('b', {}, i.name), h('div.t-caption', {}, i.sku)), h('td', {}, i.unit), h('td', {}, h('input.input.num', { type: 'number', min: 0, value: prices[i.sku] == null ? '' : prices[i.sku], placeholder: 'لم يُسعَّر', disabled: !canEdit, 'aria-label': 'سعر ' + i.name, oninput: (e) => { prices[i.sku] = e.target.value === '' ? null : Number(e.target.value); } }))))))), h('p.t-caption', {}, 'عرض عيّنة تجريبية من ' + SA.fmt.num(p0.itemsCount) + ' صنف. أسعار تجريبية. إدارة كتالوج الأصناف كاملة: ', h('a', { href: '../../super-admin-data-system.html#scr-cus-03', target: '_blank', rel: 'noopener' }, 'المواصفة الكاملة ↗'))));
    }
    draw();
    const dr = SA.drawer({ title: p0.name, subtitle: pl.id + ' · ' + (p0.status === 'active' ? 'معتمدة' : 'مسودة'), tabs: tabsEl.el, body, size: 'md', foot: canEdit ? [h('button.btn.btn-ghost', { type: 'button', onclick: () => dr.close() }, 'إغلاق'), h('button.btn.btn-primary', { type: 'button', onclick: save }, 'حفظ / إرسال للاعتماد')] : [h('button.btn.btn-primary', { type: 'button', onclick: () => dr.close() }, 'إغلاق')] });
    async function save() {
      if (!nameF.validate()) { if (tab !== 'a') { tab = 'a'; tabsEl.setActive('a'); draw(); } return; }
      const adds = Array.from(assigned).filter((id) => (p0.assignedTo || []).indexOf(id) < 0), removes = (p0.assignedTo || []).filter((x) => /^C-/.test(x) && !assigned.has(x));
      const priceCh = {}; (p0.items || []).forEach((i) => { if ((prices[i.sku] == null ? null : prices[i.sku]) !== (i.price == null ? null : i.price) && prices[i.sku] != null) priceCh[i.sku] = prices[i.sku]; });
      const activate = statusF.get() === 'active' && p0.status !== 'active'; const rename = nameF.get().trim() !== p0.name; const live_ = p0.status === 'active' || activate;
      if (!adds.length && !removes.length && !Object.keys(priceCh).length && !activate && !rename) return SA.toast('لا توجد تغييرات.', 'info');
      if (rename) { try { await SA.api(() => { st.patch('priceLists', pl.id, { name: nameF.get().trim() }); SA.audit('PRICELIST.CHANGED', { target: { type: 'priceList', id: pl.id, label: nameF.get().trim() }, before: { name: p0.name }, after: { name: nameF.get().trim() } }); }); } catch (e) { return SA.fail(e); } }
      const reqs = []; if (activate) reqs.push({ kind: 'activate', adds: [], removes: [], prices: null, note: 'تفعيل القائمة' }); if (adds.length || removes.length) reqs.push({ kind: 'assign', adds, removes, prices: null, note: 'تعيين ' + adds.length + ' / إزالة ' + removes.length + ' عميل' }); if (Object.keys(priceCh).length) reqs.push({ kind: 'items', adds: [], removes: [], prices: priceCh, note: 'تعديل أسعار ' + Object.keys(priceCh).length + ' صنف' });
      if (!reqs.length) { dr.close(); SA.toast('تم الحفظ', 'success'); return; }
      if (!live_) { try { await SA.api(() => reqs.forEach((c) => applyChange(Object.assign({ approvalId: '—', plId: pl.id }, c)))); } catch (e) { return SA.fail(e); } dr.close(); SA.toast('تم الحفظ (قائمة مسودة — بدون اعتماد)', 'success'); return; }
      const r = await SA.confirm({ title: 'إرسال تغييرات القائمة للاعتماد', confirmLabel: 'إرسال للاعتماد', impact: reqs.map((c) => c.note).concat(['اعتماد المدير العام (SA-12) ثم يُطبَّق تلقائيًا ويُسجَّل PRICELIST.CHANGED.']) }); if (!r.ok) return;
      try { await SA.api(() => { reqs.forEach((c) => { const ap = SA.requestApproval({ type: 'price_list', title: 'تعديل قائمة أسعار ' + p0.name + ' — ' + c.note, chain: [{ roleId: 'R-02', label: 'المدير العام (General Manager)' }], context: [['القائمة', p0.name], ['التغيير', c.note], ['ملاحظة', 'يُطبَّق تلقائيًا عند الاعتماد']], ref: { type: 'price_list', id: pl.id } }); st.insert('priceListChanges', { id: 'PLC-' + (Date.now() % 100000) + c.kind[0], approvalId: ap.id, plId: pl.id, kind: c.kind, status: 'pending', adds: c.adds, removes: c.removes, prices: c.prices, createdAt: new Date().toISOString(), requestedBy: SA.session.userId }); SA.audit('PRICELIST.CHANGED', { target: { type: 'priceList', id: pl.id, label: p0.name }, after: { requested: c.note, approval: ap.id }, reason: 'طلب اعتماد' }); }); }); } catch (e) { return SA.fail(e); }
      dr.close(); SA.toast('أُرسل للاعتماد — سيظهر في صندوق الاعتمادات', 'success');
    }
  }
  function plScreen(body, retry, ctx) {
    const table = SA.table({ rowId: 'id', pageSize: 10, caption: 'قوائم الأسعار', rows: () => st.get('priceLists') || [], search: { placeholder: 'ابحث…', keys: ['name', 'id'] },
      columns: [{ key: 'name', label: 'القائمة', sort: true, render: (p) => h('div', {}, h('b', {}, p.name), h('div.t-caption', {}, p.id)) }, { key: 'itemsCount', label: 'الأصناف', sort: true, render: (p) => h('span.num', {}, p.itemsCount) }, { key: 'assigned', label: 'العملاء', value: (p) => (p.assignedTo || []).filter((x) => /^C-/.test(x)).length, sort: true, render: (p) => h('span.num', {}, (p.assignedTo || []).filter((x) => /^C-/.test(x)).length) }, { key: 'updatedAt', label: 'آخر تعديل', sort: (a, b) => new Date(a.updatedAt) - new Date(b.updatedAt), render: (p) => h('span.t-muted', {}, SA.fmt.rel(p.updatedAt)) },
        { key: 'status', label: 'الحالة', render: (p) => h('span', {}, SA.chip(p.status === 'active' ? 'معتمدة' : 'مسودة', p.status === 'active' ? 'success' : 'warning'), (st.get('priceListChanges') || []).some((c) => c.plId === p.id && c.status === 'pending') ? h('span.sap-dat-pend', { style: { marginInlineStart: '6px' } }, 'قيد الاعتماد') : null) }],
      rowActions: (p) => [{ label: 'فتح', icon: 'edit', onClick: () => openPriceList(p) }], onRowClick: (p) => openPriceList(p), empty: { icon: 'list', title: 'لا توجد قوائم أسعار', text: 'أنشئ قائمة جديدة.', action: { label: 'قائمة جديدة', perm: 'sa.customers.edit', onClick: newPriceList } }, onRetry: retry });
    body.append(h('div.card.card-flush.sap-listcard', {}, table.el));
    const offs = ['priceLists', 'priceListChanges', 'customers'].map((p) => st.subscribe(p, () => table.refresh()));
    if (ctx.params && ctx.params.open) { const p = st.find('priceLists', ctx.params.open); if (p) setTimeout(() => openPriceList(p), 60); }
    return () => offs.forEach((f) => f());
  }

  SA.register({ id: 'customers', group: 'data', title: 'العملاء', icon: 'users', route: 'customers', perm: 'sa.customers.view', order: 10, desc: 'العملاء وقوائم الأسعار والدمج والاستيراد', render: (root, ctx) => listScreen(E.customers, root, ctx) });
  SA.register({ id: 'suppliers', group: 'data', title: 'الموردون', icon: 'truck', route: 'suppliers', perm: 'sa.suppliers.view', order: 20, desc: 'الموردون والدمج والاستيراد', render: (root, ctx) => listScreen(E.suppliers, root, ctx) });

  /* ───────────────────────── Test Lab missions ───────────────────────── */
  SA.missions.add({ id: 'M-C9', area: 'org', title: 'استورد عملاء من ملف وراجع تقرير الأخطاء', persona: 'owner', route: 'customers', est: '5 د', goal: 'افتح «استيراد Excel»، استخدم الملف النموذجي (فيه أخطاء)، راجع تقرير التحقق، ثم نفّذ الاستيراد للسليم فقط.',
    steps: [{ text: 'افتح الاستيراد وشغّل التحقق على الملف النموذجي', route: 'customers' }, { text: 'نفّذ الاستيراد', audit: 'CUSTOMER.IMPORTED' }], detect: [{ audit: 'CUSTOMER.IMPORTED' }] });
  SA.missions.add({ id: 'M-C10', area: 'org', title: 'ادمج عميلين مكررين', persona: 'owner', route: 'customers', est: '4 د', goal: 'استورد الملف النموذجي مع التحذيرات لينتج مكرر، ثم افتح «دمج مكررين» وراجع المعاينة ونفّذ الدمج بسبب وStep-up.',
    steps: [{ text: 'استورد مع تضمين التحذيرات', audit: 'CUSTOMER.IMPORTED' }, { text: 'ادمج المكرر في الأصلي', audit: 'CUSTOMER.MERGED' }], detect: [{ audit: 'CUSTOMER.IMPORTED' }, { audit: 'CUSTOMER.MERGED' }] });
  SA.missions.add({ id: 'M-C11', area: 'approvals', title: 'غيّر قائمة أسعار عميل → اعتماد المدير العام → تطبيق تلقائي', persona: 'owner', route: 'customers', est: '6 د', goal: 'من درج عميل غيّر قائمة الأسعار (طلب اعتماد). ادخل كمدير عام من صندوق الاعتمادات واعتمد، ثم ارجع وشوف القائمة اتغيّرت تلقائيًا.',
    steps: [{ text: 'غيّر قائمة أسعار عميل وأرسل للاعتماد', audit: 'PRICELIST.CHANGED' }, { text: 'كمدير عام اعتمد الطلب', audit: 'APPROVAL.APPROVED' }, { text: 'راجع تطبيق التغيير في العميل وقوائم الأسعار', route: 'customers' }], detect: [{ audit: 'PRICELIST.CHANGED' }, { audit: 'APPROVAL.APPROVED' }] });
  SA.missions.add({ id: 'M-C12', area: 'users', title: 'مندوب مبيعات يرى عملاءه فقط', persona: 'rep', route: 'customers', est: '2 د', goal: 'كمندوب (نطاق own) افتح العملاء: تظهر فقط عملاؤك، وأزرار الإنشاء/الاستيراد/الدمج مقفولة.',
    steps: [{ text: 'افتح العملاء وقارن العدد بقائمة المالك', route: 'customers' }], detect: [{ route: 'customers' }] });
})();
