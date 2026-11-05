/* EG Super Admin prototype — mod-audit.js  (SA-17 سجل التدقيق — للقراءة فقط / append-only)
   Route: #/audit  (query: ?user=U-12 &code=AUTH.LOGIN_FAILED &area=sa|hr &severity=high &result=failure &target=AP-2001 &range=24h|7d|30d|all &q=text)
   Features: filters (area · severity · result · actor · code · source · date range), saved views (stored in store `ui.auditViews`), event drawer with before/after diff
   (wage/cost values are redacted for viewers without the sensitive key — incl. HR salary fields), JSON view, prev/next, export dialog (Step-up → EXPORT.AUDIT).
   Nothing here edits or deletes a log row: there is no such control; the explainer lets you *try* a delete and shows the (simulated) API refusal, logged as ACCESS.DENIED.
   Public API: SA.auditView = { open(entryOrId), redact(entry, obj), targetHref(target), isSensitiveRead(code), SENSITIVE_READS } (used by security center / access log). */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  (function () {
    if (document.querySelector('style[data-mod="audit"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'audit');
    s.textContent = `
.sapa-ro { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border: 1px solid var(--color-border); border-radius: 12px; background: linear-gradient(#fff, #fbfcfe); }
.sapa-ro-ico { width: 38px; height: 38px; border-radius: 10px; background: var(--color-neutral-tint); color: var(--eg-navy); display: grid; place-items: center; flex: none; }
.sapa-ro b { display: block; } .sapa-ro p { margin: 2px 0 0; font-size: var(--text-dense); color: var(--color-text-muted); }
.sapa-ro details { margin-top: 8px; } .sapa-ro summary { cursor: pointer; font-weight: 600; font-size: var(--text-dense); color: var(--eg-navy); min-height: 28px; }
.sapa-ro ul { margin: 6px 0 0; padding-inline-start: 18px; font-size: var(--text-dense); color: var(--color-text); display: grid; gap: 4px; }
.sapa-views { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; } .sapa-views > span { font-size: 12.5px; color: var(--color-text-muted); font-weight: 600; }
.sapa-view { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--color-border-strong); background: #fff; border-radius: 999px; min-height: 34px; padding-inline: 12px; font-size: var(--text-dense); font-weight: 600; cursor: pointer; color: var(--color-text); }
.sapa-view:hover { background: var(--color-primary-tint); border-color: var(--eg-navy-soft); } .sapa-view.is-saved { padding-inline-end: 4px; }
.sapa-view .sapa-x { border: 0; background: none; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; color: var(--color-text-muted); display: grid; place-items: center; } .sapa-view .sapa-x:hover { background: var(--color-neutral-tint); color: var(--color-danger); }
.sapa-code { font: 600 11.5px var(--font-en); color: var(--color-text-muted); direction: ltr; unicode-bidi: embed; display: inline-block; }
.sapa-act { display: flex; flex-direction: column; line-height: 1.35; } .sapa-act b { font-weight: 600; font-size: var(--text-dense); }
.sapa-tgt { display: inline-flex; align-items: center; gap: 4px; font-size: var(--text-dense); } .sapa-tgt a { color: var(--color-primary); text-decoration: none; } .sapa-tgt a:hover { text-decoration: underline; }
.sapa-tag { font-size: 11px; font-weight: 700; border-radius: 6px; padding: 1px 6px; background: var(--color-neutral-tint); color: var(--color-neutral); }
.sapa-tag.is-hr { background: var(--color-info-tint); color: var(--color-info); } .sapa-tag.is-mobile { background: var(--color-primary-tint); color: var(--eg-navy); }
.sapa-range { display: inline-flex; align-items: center; gap: 6px; } .sapa-range input { min-height: 40px; }
.sapa-json { direction: ltr; text-align: left; background: #0f1a2e; color: #d9e4ff; border-radius: 10px; padding: 12px 14px; font: 12px/1.6 ui-monospace, Menlo, monospace; overflow: auto; max-height: 260px; white-space: pre-wrap; margin: 0; }
.sapa-nav { display: flex; gap: 8px; width: 100%; } .sapa-nav .sapa-grow { flex: 1; }
.sapa-diffwrap td { vertical-align: top; } .sapa-diffwrap tr.is-changed td { background: var(--color-warning-tint); } .sapa-diffwrap .sap-diff-before { color: var(--color-danger); text-decoration: line-through; text-decoration-color: rgba(200,0,0,.35); } .sapa-diffwrap .sap-diff-after { color: var(--color-success); font-weight: 600; }
.sapa-cols { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 12px; } @media (max-width: 560px) { .sapa-cols { grid-template-columns: 1fr; } }`;
    document.head.appendChild(s);
  })();

  const SENSITIVE_READS = ['HR.SALARY.VIEWED', 'HR.EMPLOYEE.PII_REVEALED', 'HR.MEDICAL.VIEWED', 'HR.DISCIPLINE.VIEWED', 'HR.LEGAL.VIEWED', 'DATA.COST.VIEWED', 'DATA.PROFIT.VIEWED'];
  SA.catalog.addAudit('HR.MEDICAL.VIEWED', 'اطلاع على سجل طبي (T4)', 'high', 'hr'); SA.catalog.addAudit('HR.DISCIPLINE.VIEWED', 'اطلاع على جزاءات/تحقيقات (T4)', 'high', 'hr'); SA.catalog.addAudit('HR.LEGAL.VIEWED', 'اطلاع على قضايا عمالية (T4)', 'high', 'hr');
  SA.catalog.addAudit('DATA.COST.VIEWED', 'اطلاع على التكاليف الداخلية (T3)', 'medium', 'settings'); SA.catalog.addAudit('DATA.PROFIT.VIEWED', 'اطلاع على أرباح المصنع (T3)', 'medium', 'settings');
  const isSensitiveRead = (c) => SENSITIVE_READS.indexOf(c) >= 0;
  const WAGE_KEYS = /^(basic|allowances?|fromBasic|toBasic|gross|net|deductions?|amount|salary|wage|monthly|total)$/i;
  /** Redact wage/cost values of an audit entry's before/after for viewers without the sensitive key. */
  function redact(entry, obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    const wageEv = /SALARY|PAYROLL|ADVANCE|SETTLEMENT|LOAN/.test(entry.code || '') && entry.area === 'hr'; const canW = SA.canSensitive('hr.salary.view');
    const walk = (o) => { const out = Array.isArray(o) ? [] : {}; Object.keys(o).forEach((k) => { const v = o[k]; if (wageEv && !canW && WAGE_KEYS.test(k) && (typeof v === 'number' || typeof v === 'string')) out[k] = '••• (سري)'; else out[k] = v && typeof v === 'object' ? walk(v) : v; }); return out; };
    return SA.redact(walk(obj));
  }
  const TGT_ROUTE = { user: (id) => 'users/' + id, role: (id) => 'roles/' + id, approval: (id) => 'approvals/' + id, dealer_request: (id) => 'dealers/requests/' + id, session: () => 'sessions', employee: (id) => 'hr/employees?q=' + id, payroll_run: () => 'hr/payroll', leave_request: () => 'hr/leave', requisition: () => 'hr/requisitions', settlement: () => 'hr/settlement', department: () => 'departments', warehouse: () => 'warehouses', module: () => 'modules', numbering: () => 'policies/numbering', policy: () => 'policies/security', price_list: () => 'customers/price-lists' };
  function targetHref(t) {
    if (!t || !TGT_ROUTE[t.type]) return null; const r = TGT_ROUTE[t.type](t.id); const m = SA.router.parse('#/' + r).module;
    return m && SA.canOpen(m) ? '#/' + r : null;
  }
  const catLabel = (c) => SA.auditLabel(c);
  const viaTag = (e) => (e.via === 'mobile' ? h('span.sapa-tag.is-mobile', {}, 'موبايل') : e.via === 'system' ? h('span.sapa-tag', {}, 'النظام') : h('span.sapa-tag', {}, 'ويب'));
  const areaTag = (e) => h('span.sapa-tag' + (e.area === 'hr' ? '.is-hr' : ''), {}, e.area === 'hr' ? 'HR' : 'SA');
  const resChip = (r) => SA.chip({ success: 'نجح', failure: 'فشل', denied: 'مرفوض' }[r] || r, r === 'success' ? 'success' : r === 'failure' ? 'danger' : 'warning');
  const actorName = (e) => (e.actor && e.actor.name) || '—';

  /* ── event drawer ── */
  function open(entryOrId, list) {
    const entry0 = typeof entryOrId === 'string' ? (st.get('audit') || []).find((e) => e.id === entryOrId) : entryOrId; if (!entry0) { SA.toast('الحدث غير موجود', 'error'); return null; }
    let idx = list ? list.findIndex((e) => e.id === entry0.id) : -1; let cur = entry0; let jsonOpen = false;
    const body = h('div.sap-drawer-inner'); const prev = h('button.btn.btn-ghost', { type: 'button', onclick: () => go(-1) }, SA.icon('arrowright', 'icon-sm'), 'الأحدث'); const next = h('button.btn.btn-ghost', { type: 'button', onclick: () => go(1) }, 'الأقدم', SA.icon('arrowleft', 'icon-sm'));
    const d = SA.drawer({ title: 'تفاصيل الحدث', subtitle: entry0.id, size: 'lg', body, foot: [h('div.sapa-nav', {}, list ? prev : null, h('span.sapa-grow'), list ? next : null)], headActions: h('span.chip', {}, SA.icon('lock', 'icon-sm'), 'للقراءة فقط') });
    function go(dir) { const n = idx + dir; if (!list || n < 0 || n >= list.length) return; idx = n; cur = list[n]; draw(); }
    function draw() {
      const e = cur; SA.clear(body); d.setTitle(catLabel(e.code), e.id + ' · ' + SA.fmt.dt(e.ts)); prev.disabled = !list || idx <= 0; next.disabled = !list || idx >= list.length - 1;
      const bef = redact(e, e.before), aft = redact(e, e.after); const href = targetHref(e.target);
      body.append(h('div.cluster', {}, SA.severityChip(e.severity), resChip(e.result), areaTag(e), viaTag(e), e.stepUp ? SA.chip('بعد Step-up', 'info') : null, e.count > 1 ? SA.chip('تكرّر ×' + e.count, 'warning') : null),
        h('div.sapi-panel-sec', { style: { marginTop: '14px' } }, SA.kv([['الإجراء', h('span', {}, catLabel(e.code), ' ', h('span.sapa-code', {}, e.code))], ['المنفّذ', e.actor && e.actor.id && e.actor.id !== 'SYSTEM' && e.actor.id !== 'ANON' && SA.can('sa.users.view') ? h('a', { href: SA.link.user(e.actor.id) }, actorName(e)) : actorName(e)], ['الهدف', e.target ? h('span.sapa-tgt', {}, e.target.label || e.target.id, h('span.sapa-code', {}, '(' + e.target.type + ' · ' + e.target.id + ')'), href ? h('a', { href }, SA.icon('external', 'icon-sm')) : null) : '—'], ['السبب المسجّل', e.reason || '—'], ['الوقت', SA.fmt.dt(e.ts) + ' (' + SA.fmt.rel(e.ts) + ')'], ['IP', h('span.num', { dir: 'ltr' }, e.ip || '—')], ['الجهاز', e.device || '—'], ['المصدر', { web: 'واجهة الويب', mobile: 'تطبيق الموبايل', system: 'النظام' }[e.via] || e.via]])),
        h('div.sapi-panel-sec', {}, h('h4', {}, SA.icon('compare', 'icon-sm'), 'قبل / بعد'), diffNode(e, bef, aft)),
        isSensitiveRead(e.code) ? SA.alert('info', 'هذا حدث اطلاع على بيانات حساسة (T3/T4): المسجّل هو أن المستخدم فتح البيان — لا تُسجَّل القيم نفسها.') : null,
        h('div.sapi-panel-sec', {}, h('div.sap-section-head', {}, h('h4', {}, SA.icon('file', 'icon-sm'), 'JSON'), h('button.sap-linkbtn', { type: 'button', onclick: () => { jsonOpen = !jsonOpen; draw(); } }, jsonOpen ? 'إخفاء' : 'عرض')), jsonOpen ? h('div', {}, h('pre.sapa-json', {}, JSON.stringify(Object.assign({}, e, { before: bef, after: aft }), null, 2)), h('button.btn.btn-ghost.btn-sm', { type: 'button', style: { marginTop: '8px' }, onclick: () => SA.copy(JSON.stringify(Object.assign({}, e, { before: bef, after: aft }), null, 2)).then(() => SA.toast('تم النسخ', 'success')) }, SA.icon('copy', 'icon-sm'), 'نسخ')) : h('p.t-caption.t-muted', {}, 'القيم الحساسة مُخفاة بحسب صلاحياتك.')),
        h('p.sap-audit-note', {}, SA.icon('lock', 'icon-sm'), 'السجل append-only: لا يمكن تعديل هذا الحدث أو حذفه من أي شاشة.'));
    }
    function diffNode(e, bef, aft) {
      const rows = SA.diffRows(bef, aft); if (!rows.length) return h('p.t-muted', {}, 'لا توجد قيم قبل/بعد لهذا الحدث (حدث معلومات فقط).');
      return h('div.table-wrap', {}, h('table.table.sap-diff.sapa-diffwrap', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الحقل'), h('th', {}, 'قبل'), h('th', {}, 'بعد'))), h('tbody', {}, rows.map((r) => h('tr', { class: r.changed ? 'is-changed' : '' }, h('td', {}, h('code', {}, r.key)), h('td.sap-diff-before', {}, r.before == null ? '—' : String(r.before)), h('td.sap-diff-after', {}, r.after == null ? '—' : String(r.after)))))));
    }
    draw(); return d;
  }

  /* ── export dialog ── */
  const COLS = [['id', 'المعرّف'], ['ts', 'الوقت'], ['actor', 'المنفّذ'], ['code', 'كود الحدث'], ['label', 'الإجراء'], ['target', 'الهدف'], ['reason', 'السبب'], ['severity', 'الخطورة'], ['result', 'النتيجة'], ['area', 'المساحة'], ['via', 'المصدر'], ['before', 'قبل'], ['after', 'بعد'], ['ip', 'IP'], ['device', 'الجهاز']];
  function exportDialog(filtered, total) {
    if (!SA.can('sa.audit.export')) { SA.toast('ليست من صلاحياتك (sa.audit.export)', 'warn'); return; }
    const canSens = SA.can('hr.export.sensitive');
    const fmt = SA.form.field({ name: 'fmt', label: 'الصيغة', type: 'select', options: [['csv', 'CSV (يفتح في Excel)'], ['json', 'JSON']], value: 'csv', hint: 'PDF/Excel أصلي: Open — التنفيذ لاحقًا.' });
    const scope = SA.form.field({ name: 'scope', label: 'النطاق', type: 'radio', options: [['filtered', 'نتائج الفلاتر الحالية (' + SA.fmt.num(filtered.length) + ' حدث)'], ['all', 'كل السجل (' + SA.fmt.num(total) + ' حدث)']], value: 'filtered' });
    const cols = SA.form.field({ name: 'cols', label: 'الأعمدة', type: 'multi', options: COLS.map((c) => [c[0], c[1]]), value: ['id', 'ts', 'actor', 'code', 'label', 'target', 'reason', 'severity', 'result', 'area', 'via'] });
    const sensN = (st.get('audit') || []).filter((e) => isSensitiveRead(e.code)).length;
    const m = SA.modal({ title: 'تصدير سجل التدقيق', icon: 'download', size: 'md', subtitle: 'التصدير نفسه يُسجَّل — EXPORT.AUDIT', body: h('div.sap-confirm', {}, h('div.sap-formgrid', {}, fmt.el), scope.el, cols.el,
      SA.alert('info', 'القيم الحساسة (الأجور/التكاليف) تظهر في الملف كما تراها أنت: مُخفاة لو ليست لديك صلاحيتها.'), canSens ? null : SA.alert('warning', 'أحداث الاطلاع على البيانات الحساسة (' + sensN + ' حدث) لن تُضمَّن لأنك لا تملك hr.export.sensitive.'),
      SA.alert('info', 'IP والجهاز: هل يُحفظان أصلًا؟ قرار خصوصية ', SA.openValue('Open'), '. مدة الاحتفاظ بالسجل ', SA.openValue('Open'), '.')),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: go }, SA.icon('download', 'icon-sm'), 'تصدير')] });
    async function go() {
      const c = cols.get(); if (!c.length) { cols.error('اختر عمودًا واحدًا على الأقل'); return; }
      if (!(await SA.stepUp('audit.export', { text: 'تصدير سجل التدقيق عملية حساسة. أعد التحقق للمتابعة.' }))) return;
      let src = scope.get() === 'all' ? (st.get('audit') || []) : filtered; let skipped = 0;
      if (!canSens) { const n = src.length; src = src.filter((e) => !isSensitiveRead(e.code)); skipped = n - src.length; }
      m.setBusy(true);
      try {
        await SA.api(() => {
          const val = { id: (e) => e.id, ts: (e) => SA.fmt.iso(e.ts), actor: (e) => actorName(e), code: (e) => e.code, label: (e) => catLabel(e.code), target: (e) => (e.target ? (e.target.label || '') + ' [' + e.target.type + ':' + e.target.id + ']' : ''), reason: (e) => e.reason, severity: (e) => (SA.catalog.severity[e.severity] || {}).label, result: (e) => ({ success: 'نجح', failure: 'فشل', denied: 'مرفوض' }[e.result]), area: (e) => (e.area === 'hr' ? 'HR' : 'SA'), via: (e) => e.via, before: (e) => (e.before ? JSON.stringify(redact(e, e.before)) : ''), after: (e) => (e.after ? JSON.stringify(redact(e, e.after)) : ''), ip: (e) => e.ip, device: (e) => e.device };
          const stamp = new Date().toISOString().slice(0, 10);
          if (fmt.get() === 'json') SA.download('audit-' + stamp + '.json', JSON.stringify(src.map((e) => { const o = {}; c.forEach((k) => { o[k] = val[k](e); }); return o; }), null, 2), 'application/json');
          else SA.download('audit-' + stamp + '.csv', SA.csv([c.map((k) => COLS.find((x) => x[0] === k)[1])].concat(src.map((e) => c.map((k) => val[k](e))))), 'text/csv');
          SA.audit('EXPORT.AUDIT', { target: { type: 'audit', id: 'AUD-EXP-' + (st.get('meta.auditSeq') || 0), label: 'تصدير سجل التدقيق (' + fmt.get().toUpperCase() + ')' }, after: { rows: src.length, format: fmt.get().toUpperCase(), scope: scope.get(), columns: c.length, excludedSensitive: skipped } });
        });
      } catch (e) { m.setBusy(false); SA.fail(e); return; }
      m.close(); SA.toast('تم تصدير ' + SA.fmt.num(src.length) + ' حدث' + (skipped ? ' (استُبعد ' + skipped + ' حدث حساس)' : ''), 'success');
    }
  }

  /* ── screen ── */
  const RANGES = [['24h', 'آخر 24 ساعة'], ['7d', 'آخر 7 أيام'], ['30d', 'آخر 30 يومًا'], ['custom', 'مدى مخصص…']];
  const BUILTIN = [{ id: 'v-crit', name: 'الأحداث الحرجة', f: { severity: 'critical' } }, { id: 'v-login', name: 'إخفاقات الدخول', f: { code: 'AUTH.LOGIN_FAILED' } }, { id: 'v-hr', name: 'أحداث HR', f: { area: 'hr' } }, { id: 'v-sens', name: 'اطلاع على الأجور', f: { code: 'HR.SALARY.VIEWED' } }, { id: 'v-exp', name: 'التصدير', f: { code: 'EXPORT.AUDIT' } }];
  function render(root, ctx) {
    ctx.setCrumbs([{ label: 'الرقابة' }, { label: 'سجل التدقيق' }]);
    const q = ctx.params; let state = 'loading'; let table = null; let from = '', to = ''; let drawer = null;
    const head = h('div'); const host = h('div'); root.append(head, host);
    const list = () => st.get('audit') || [];
    const rangeTest = (e, v) => { const t = new Date(e.ts).getTime(); if (v === 'custom') return (!from || t >= new Date(from + 'T00:00:00').getTime()) && (!to || t <= new Date(to + 'T23:59:59').getTime()); const ms = { '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 }[v]; return Date.now() - t <= ms; };
    function applyView(v) {
      if (!table) return; const s = table.getState(); ['area', 'severity', 'result', 'actorId', 'code', 'via', 'range'].forEach((k) => { s.filters[k] = ''; });
      Object.keys(v.f || {}).forEach((k) => { s.filters[k] = v.f[k]; });
      s.q = v.q || ''; const inp = SA.$('input[type=search]', table.el); if (inp) inp.value = s.q; s.page = 1; SA.$$('select', table.el).forEach((sel) => { const lab = sel.getAttribute('aria-label'); const fl = filtersDef.find((f) => f.label === lab); if (fl) sel.value = s.filters[fl.key] || ''; }); table.refresh(); syncRange();
    }
    const savedViews = () => st.get('ui.auditViews') || [];
    function saveCurrent() {
      const s = table.getState(); const name = SA.form.field({ name: 'n', label: 'اسم العرض', required: true, placeholder: 'مثال: محاولات الدخول المشبوهة' });
      const m = SA.modal({ title: 'حفظ العرض الحالي', icon: 'star', size: 'sm', body: h('div.sap-confirm', {}, name.el, SA.alert('info', 'يحفظ الفلاتر والبحث الحاليين فقط — لا يحفظ نتائج.')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: () => { if (!name.validate()) return; const f = {}; Object.keys(s.filters).forEach((k) => { if (s.filters[k]) f[k] = s.filters[k]; }); st.update('ui', (u) => { u.auditViews = (u.auditViews || []).concat([{ id: 'sv-' + Date.now(), name: name.get().trim(), f, q: s.q, from, to }]); }); m.close(); SA.toast('تم حفظ العرض', 'success'); drawViews(); } }, 'حفظ')] });
    }
    const viewsBar = h('div.sapa-views');
    function drawViews() {
      SA.clear(viewsBar); viewsBar.append(h('span', {}, 'عروض:'));
      BUILTIN.forEach((v) => viewsBar.append(h('button.sapa-view', { type: 'button', onclick: () => applyView(v) }, v.name)));
      savedViews().forEach((v) => viewsBar.append(h('span.sapa-view.is-saved', { role: 'group' }, h('button', { type: 'button', style: { border: 0, background: 'none', font: 'inherit', cursor: 'pointer', padding: 0 }, onclick: () => { from = v.from || ''; to = v.to || ''; applyView(v); } }, SA.icon('star', 'icon-sm'), ' ', v.name), h('button.sapa-x', { type: 'button', 'aria-label': 'حذف العرض المحفوظ «' + v.name + '»', title: 'حذف العرض المحفوظ (لا يمس السجل)', onclick: () => { st.update('ui', (u) => { u.auditViews = (u.auditViews || []).filter((x) => x.id !== v.id); }); drawViews(); } }, SA.icon('x', 'icon-sm')))));
      viewsBar.append(SA.btn({ label: 'حفظ العرض الحالي', icon: 'plus', kind: 'ghost', size: 'sm', onClick: saveCurrent }));
    }
    const fromIn = h('input.input', { type: 'date', 'aria-label': 'من تاريخ', onchange: (e) => { from = e.target.value; table && table.refresh(); } }); const toIn = h('input.input', { type: 'date', 'aria-label': 'إلى تاريخ', onchange: (e) => { to = e.target.value; table && table.refresh(); } });
    const rangeBox = h('span.sapa-range', { hidden: true }, fromIn, h('span', {}, '←'), toIn);
    function syncRange() { const v = table && table.getState().filters.range; rangeBox.hidden = v !== 'custom'; }
    const filtersDef = [
      { key: 'area', label: 'المساحة', options: [['sa', 'Super Admin'], ['hr', 'الموارد البشرية']] },
      { key: 'severity', label: 'الخطورة', options: Object.keys(SA.catalog.severity).map((k) => [k, SA.catalog.severity[k].label]), test: (e, v) => e.severity === v },
      { key: 'result', label: 'النتيجة', options: [['success', 'نجح'], ['failure', 'فشل'], ['denied', 'مرفوض']] },
      { key: 'actorId', label: 'المنفّذ', options: [], test: (e, v) => e.actor && e.actor.id === v },
      { key: 'code', label: 'الإجراء', options: [], test: (e, v) => e.code === v },
      { key: 'via', label: 'المصدر', options: [['web', 'ويب'], ['mobile', 'موبايل'], ['system', 'النظام']] },
      { key: 'range', label: 'المدى', options: RANGES, test: rangeTest }
    ];
    function build() {
      SA.clear(head); SA.clear(host); const L = list(); const day = L.filter((e) => Date.now() - new Date(e.ts) < 864e5);
      const actors = Array.from(new Map(L.map((e) => [e.actor && e.actor.id, actorName(e)])).entries()).filter((x) => x[0]); const codes = Array.from(new Set(L.map((e) => e.code))).sort();
      filtersDef.find((f) => f.key === 'actorId').options = actors; filtersDef.find((f) => f.key === 'code').options = codes.map((c) => [c, catLabel(c)]);
      head.append(SA.pageHead({ title: 'سجل التدقيق', desc: 'من فعل ماذا ومتى وكان إيه قبل وبعد — بشكل لا يمكن تغييره. يضم أحداث Super Admin والموارد البشرية.', tags: [SA.tag('pending', 'Pending بند 35'), h('span.chip', {}, SA.icon('lock', 'icon-sm'), 'للقراءة فقط')], actions: [SA.btn({ label: 'تصدير…', icon: 'download', kind: 'accent', perm: 'sa.audit.export', onClick: () => exportDialog(table ? table.filteredRows() : L, L.length) })] }),
        h('div.sap-grid-cards', { style: { marginBlock: '16px' } }, SA.kpi('أحداث آخر 24 ساعة', SA.fmt.num(day.length)), SA.kpi('عالية/حرجة (24 س)', SA.fmt.num(day.filter((e) => e.severity === 'high' || e.severity === 'critical').length)), SA.kpi('فشل أو رفض (24 س)', SA.fmt.num(day.filter((e) => e.result !== 'success').length)), SA.kpi('أحداث HR', SA.fmt.num(L.filter((e) => e.area === 'hr').length)), SA.kpi('إجمالي السجل', SA.fmt.num(L.length))),
        h('div.sapa-ro', {}, h('span.sapa-ro-ico', {}, SA.icon('lock')), h('div', {}, h('b', {}, 'سجل للقراءة فقط — لا تعديل ولا حذف'), h('p', {}, 'لا يوجد في هذه الصفحة أي زر لتعديل أو حذف حدث. السجل يُكتب لحظة حدوث العملية ولا يقبل تغييرًا.'), h('details', {}, h('summary', {}, 'لماذا لا يمكن تعديله؟ (UC-AUD-05)'), h('ul', {}, h('li', {}, 'كل شاشة تكتب حدثها مع العملية نفسها بقيم قبل/بعد (UC-AUD-04).'), h('li', {}, 'الواجهة لا تحتوي أي تحكم للتعديل/الحذف، والـAPI يرفض أي محاولة (append-only) ويسجّلها كمحاولة وصول ممنوعة.'), h('li', {}, 'التصدير نفسه يُسجَّل (EXPORT.AUDIT) مع من صدّر وكم صفًا.'), h('li', {}, 'مدة الاحتفاظ ', SA.openValue('Open'), ' — وحفظ IP والجهاز ', SA.openValue('Open'), ' (خصوصية).'), h('li', {}, h('button.sap-linkbtn', { type: 'button', onclick: tryDelete }, 'جرّب محاولة حذف (للتوضيح فقط)'), ' — سيرفضها الخادم (محاكاة) وتُسجَّل.'))))));
      host.append(viewsBar); drawViews();
      table = SA.table({
        rowId: 'id', pageSize: 10, state, caption: 'سجل التدقيق',
        initial: { q: q.q || q.target || '', filters: { area: q.area || '', severity: q.severity || '', result: q.result || '', actorId: q.user || '', code: q.code || '', via: '', range: q.range && q.range !== 'all' ? q.range : '' }, sort: { key: 'ts', dir: 'desc' } },
        rows: list, search: { placeholder: 'ابحث بالإجراء أو المنفّذ أو الهدف أو السبب…', keys: [(e) => catLabel(e.code), (e) => e.code, (e) => actorName(e), (e) => (e.target ? e.target.label + ' ' + e.target.id : ''), (e) => e.reason, (e) => e.id] },
        filters: filtersDef, toolbar: [rangeBox],
        columns: [
          { key: 'ts', label: 'الوقت', sort: (a, b) => new Date(a.ts) - new Date(b.ts), render: (e) => h('span', { title: SA.fmt.dt(e.ts) }, h('b.num', { style: { fontWeight: 600 } }, SA.fmt.time(e.ts)), h('br'), h('small.t-muted', {}, SA.fmt.rel(e.ts))) },
          { key: 'actor', label: 'المنفّذ', sort: true, value: actorName, render: (e) => h('span', {}, actorName(e), e.actor && e.actor.roleId ? h('small.t-muted', {}, h('br'), SA.roleName(e.actor.roleId)) : null) },
          { key: 'code', label: 'الإجراء', sort: true, value: (e) => catLabel(e.code), render: (e) => h('span.sapa-act', {}, h('b', {}, catLabel(e.code), e.count > 1 ? h('span.sapa-tag', { style: { marginInlineStart: '6px' } }, '×' + e.count) : null), h('span.sapa-code', {}, e.code)) },
          { key: 'target', label: 'الهدف', render: (e) => { if (!e.target) return '—'; const href = targetHref(e.target); return h('span.sapa-tgt', {}, href ? h('a', { href }, e.target.label || e.target.id) : (e.target.label || e.target.id)); } },
          { key: 'area', label: 'المساحة', render: (e) => h('span', {}, areaTag(e), ' ', viaTag(e)) },
          { key: 'result', label: 'النتيجة', sort: true, render: (e) => resChip(e.result) },
          { key: 'severity', label: 'الخطورة', sort: (a, b) => ['info', 'medium', 'high', 'critical'].indexOf(a.severity) - ['info', 'medium', 'high', 'critical'].indexOf(b.severity), render: (e) => SA.severityChip(e.severity) }
        ],
        onRowClick: (e) => { drawer = open(e, table.filteredRows()); },
        empty: { icon: 'history', title: 'لا توجد أحداث', text: 'لا توجد أحداث مسجّلة بعد.' }, onRetry: load,
        onChange: (s) => { syncRange(); const qs = []; if (s.q) qs.push('q=' + encodeURIComponent(s.q)); const mp = { area: 'area', severity: 'severity', result: 'result', actorId: 'user', code: 'code', range: 'range' }; Object.keys(mp).forEach((k) => { if (s.filters[k]) qs.push(mp[k] + '=' + encodeURIComponent(s.filters[k])); }); history.replaceState(null, '', '#/audit' + (qs.length ? '?' + qs.join('&') : '')); }
      });
      host.append(h('div.card.card-flush.sap-listcard', {}, table.el)); syncRange();
    }
    async function tryDelete() {
      const r = await SA.confirm({ title: 'محاولة حذف حدث (محاكاة)', icon: 'trash', danger: true, confirmLabel: 'أرسل طلب الحذف للخادم', text: 'هذه تجربة للتوضيح: سنرسل طلب حذف لأحدث حدث، والخادم سيرفضه لأن السجل append-only.', note: 'ستُسجَّل محاولتك كـ«محاولة وصول ممنوعة».' }); if (!r.ok) return;
      const target = list()[0]; try { await SA.delay(300, { write: false }); } catch (e) { SA.fail(e); return; }
      SA.audit('ACCESS.DENIED', { target: { type: 'audit', id: target.id, label: 'محاولة حذف حدث ' + target.id }, result: 'denied', reason: 'DELETE مرفوض — السجل append-only (UC-AUD-05)' });
      SA.toast('رفض الخادم (403): السجل لا يقبل التعديل أو الحذف. سُجّلت المحاولة.', 'error', { ms: 6500 });
    }
    function load() { state = 'loading'; build(); SA.delay(300, { write: false }).then(() => { state = 'ready'; build(); }, () => { state = 'error'; build(); table.setState('error'); }); }
    const den = SA.guard('sa.audit.view'); if (den) { root.appendChild(den); return; }
    if (q.from) from = q.from; if (q.to) to = q.to;
    load();
    const unsub = st.subscribe('audit', () => { if (state === 'ready' && table) { const t = table; t.refresh(); } });
    return () => { unsub(); if (drawer) drawer.close(); };
  }
  SA.auditView = { open, redact, targetHref, isSensitiveRead, SENSITIVE_READS };
  SA.register({ id: 'audit', group: 'oversight', title: 'سجل التدقيق', icon: 'history', route: 'audit', perm: 'sa.audit.view', order: 20, desc: 'من فعل ماذا ومتى — للقراءة فقط', render });
  SA.search.register({ id: 'audit', label: 'سجل التدقيق', perm: 'sa.audit.view', query: (q) => (q ? (st.get('audit') || []).filter((e) => catLabel(e.code).toLowerCase().indexOf(q) >= 0 || e.code.toLowerCase().indexOf(q) >= 0 || (e.target && e.target.label && e.target.label.toLowerCase().indexOf(q) >= 0)).slice(0, 6).map((e) => ({ title: catLabel(e.code), sub: e.id + ' · ' + actorName(e), icon: 'history', route: 'audit?q=' + encodeURIComponent(e.id) })) : []) });
  SA.missions.add({ id: 'M-B4', area: 'audit', title: 'ابحث في السجل واحفظ عرضًا ثم افتح تفاصيل حدث', persona: 'owner', route: 'audit', est: '3 د', goal: 'اختر «أحداث HR» من العروض، افتح حدثًا وراجع الـDiff (الأجور محجوبة لمن لا يملك hr.salary.view)، ثم احفظ العرض باسم.', steps: [{ text: 'افتح سجل التدقيق وطبّق عرض «أحداث HR»', route: 'audit' }, { text: 'افتح حدثًا واقرأ قبل/بعد' }], detect: [{ route: 'audit' }] });
})();
