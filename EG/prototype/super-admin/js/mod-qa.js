/* EG ERP prototype — mod-qa.js  (app mfg · group mfg-qa «الجودة» · moduleKey 'quality' → Super Admin can hide the quality module from SA-09)
   Routes: mfg/quality · mfg/qc[/QC-id] · mfg/ncr[/NCR-id] · mfg/capa[/CAPA-id] · mfg/certs
   Business actions: ERP.flow.recordQC (stock → FG/RM or quarantine, WO completed, SO re-reserved → ready, bill for GRN, NCR on rejection) · ERP.flow.openNCR.
   Own actions (store + SA.audit + SA.notify): NCR root cause (NCR.ROOT_CAUSE) · disposition (NCR.DISPOSITIONED, stock moves out of quarantine W-06; «use as is» on a major NCR → approval
   type ncr_disposition to the GM, reconciled by ERP.onApproval('ncr')) · close (NCR.CLOSED) · CAPA create/update/close (CAPA.OPENED / CAPA.UPDATED / CAPA.CLOSED, ids CAPA-YYYY-nnn in S.capas)
   · certificates edit + audit checklist (CERT.UPDATED).
   Seed (ERP.addSeed 'qa', additive only): defect breakdown for historical inspections that have rejected qty, 5-why for NCR-2026-041, audit checklists on certs.
   Public helpers: ERP.qa = { consequences, disposition, closeNCR, createCAPA, toggleAction, closeCAPA, saveRootCause } */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP;
  if (!SA || !ERP || !ERP.flow) return;
  const h = SA.h, st = SA.store, F = ERP.flow, K = ERP.stock, CH = ERP.chart, U = ERP.ui;
  const get = (p) => st.get(p) || [];
  const me = () => SA.session.userId || 'SYSTEM';
  const today = () => ERP.day(0);
  const num = (n, d) => ERP.fmt.num(n, d);
  const pct = (v, d) => ERP.fmt.pct(v, d);
  const MOD = 'quality';

  SA.catalog.addAudit('NCR.ROOT_CAUSE', 'تحليل السبب الجذري لعدم مطابقة', 'info', 'mfg');
  SA.catalog.addAudit('CAPA.UPDATED', 'تحديث إجراء تصحيحي', 'info', 'mfg');
  SA.catalog.addAudit('CERT.UPDATED', 'تحديث شهادة/معيار جودة', 'medium', 'mfg');

  /* ── module seed (additive) ── */
  ERP.addSeed('qa', function (S, c) {
    const FAM = { door: ['D02', 'D04', 'D06'], clad: ['D05', 'D03', 'D01'], foam: ['D01', 'D07', 'D06'] };
    const lab = (code) => (ERP.defectCodes.find((d) => d.code === code) || {}).label || code;
    (S.qcInspections || []).forEach((q) => {
      if (q.result === 'pending' || !q.rejectedQty || (q.defects && q.defects.length)) return;
      const it = (S.items || []).find((i) => i.id === q.itemId); const fam = it && it.kind === 'fg' ? it.family : null; if (!fam) return;
      const codes = FAM[fam]; const a = codes[Math.floor(c.rnd() * codes.length)]; const b = codes.filter((x) => x !== a)[Math.floor(c.rnd() * 2)];
      const q1 = q.rejectedQty > 2 ? Math.max(1, Math.round(q.rejectedQty * (0.55 + c.rnd() * 0.25))) : q.rejectedQty;
      q.defects = [{ code: a, label: lab(a), qty: q1 }].concat(q.rejectedQty - q1 > 0 ? [{ code: b, label: lab(b), qty: q.rejectedQty - q1 }] : []);
    });
    const n41 = (S.ncrs || []).find((n) => n.id && /NCR-\d{4}-041$/.test(n.id));
    if (n41 && !n41.whys) n41.whys = ['لماذا اختلف لون الدفعة؟ — نسبة الماستر باتش في الخلطة غير ثابتة', 'لماذا النسبة غير ثابتة؟ — تذبذب في وحدة التلقيم الوزني الجانبية', 'لماذا تذبذبت الوحدة؟ — معايرتها متأخرة عن موعدها 3 أسابيع', 'لماذا تأخرت المعايرة؟ — غير مدرجة في خطة الصيانة الوقائية', ''];
    const CL = {
      'CRT-1': [['مراجعة الإدارة السنوية (Management Review)', true], ['تدقيق داخلي لكل الأقسام', true], ['إغلاق ملاحظات التدقيق السابق', true], ['تحديث سجل المخاطر والفرص', false], ['قياس رضا العملاء (CSAT) للربع الأخير', false], ['معايرة أجهزة القياس والفحص', false]],
      'CRT-2': [['تحديث سجل الجوانب والآثار البيئية', true], ['إدارة الخردة وإعادة التدوير (الكسارة)', true], ['قياس الانبعاثات والضوضاء', false], ['اختبار خطة الطوارئ البيئية', false]],
      'CRT-3': [['شهادة نسبة المكون المحلي', true], ['تجهيز ملف التجديد وطلب الزيارة', false], ['شهادات منشأ الخامات الرئيسية', false], ['سداد رسوم التجديد', false]]
    };
    (S.certs || []).forEach((ct) => { if (!ct.checklist) ct.checklist = (CL[ct.id] || [['مراجعة المتطلبات', false], ['تجهيز المستندات', false]]).map((x, i) => ({ id: ct.id + '-' + (i + 1), text: x[0], done: x[1] })); });
  });

  /* ── styles ── */
  (function () {
    if (document.querySelector('style[data-mod="qa"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'qa');
    s.textContent = `
.qa-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.qa-muted { color: var(--color-text-muted); font-size: 12.5px; }
.qa-queue { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); }
.qa-qcard { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-inline-start: 4px solid var(--color-warning); }
.qa-qcard.is-final { border-inline-start-color: var(--eg-navy); }
.qa-qcard-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.qa-qcard .qa-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; color: var(--color-text-muted); }
.qa-qcard .qa-meta b { color: var(--color-text); font-weight: 600; }
.qa-mini { width: 100%; } .qa-mini td, .qa-mini th { font-size: 13px; vertical-align: middle; }
.qa-mini .input, .qa-mini .select { min-height: 38px; }
.qa-okng .segmented button { min-height: 36px; padding-inline: 12px; }
.qa-okng.is-ng .segmented button[aria-pressed="true"] { color: var(--color-danger); }
.qa-okng.is-ok .segmented button[aria-pressed="true"] { color: var(--color-success); }
.qa-row-ng td { background: #fff6f6; }
.qa-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0 14px; }
.qa-def-row { display: grid; grid-template-columns: 1fr 120px auto; gap: 8px; align-items: center; margin-bottom: 8px; }
.qa-cons { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.qa-cons li { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; line-height: 1.7; }
.qa-cons-ico { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; flex: none; background: var(--color-primary-tint); color: var(--eg-navy); }
.qa-cons-ico.is-success { background: var(--color-success-tint); color: var(--color-success); } .qa-cons-ico.is-danger { background: var(--color-danger-tint); color: var(--color-danger); } .qa-cons-ico.is-warning { background: var(--color-warning-tint); color: var(--color-warning); }
.qa-doc { background: #fff; border: 1px solid var(--color-border); border-radius: 14px; padding: 26px 30px; max-width: 920px; margin-inline: auto; box-shadow: var(--shadow-card); }
.qa-doc-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 3px solid var(--eg-navy); padding-bottom: 14px; }
.qa-doc-head img { height: 44px; width: auto; }
.qa-doc-head div { display: flex; flex-direction: column; text-align: end; font-size: 12px; color: var(--color-text-muted); } .qa-doc-head b { color: var(--eg-navy); font-size: 14px; }
.qa-doc-title { text-align: center; margin: 18px 0 2px; color: var(--eg-navy); font-size: 1.35rem; }
.qa-doc-sub { text-align: center; color: var(--color-text-muted); font-size: 12.5px; margin-bottom: 16px; }
.qa-doc-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0; border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; margin-bottom: 16px; }
.qa-doc-meta div { padding: 8px 12px; border-bottom: 1px solid var(--color-border); border-inline-end: 1px solid var(--color-border); font-size: 13px; }
.qa-doc-meta small { display: block; color: var(--color-text-muted); font-size: 11.5px; }
.qa-doc table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 13px; }
.qa-doc th, .qa-doc td { border: 1px solid var(--color-border); padding: 7px 10px; text-align: start; }
.qa-doc th { background: var(--color-bg-alt); font-weight: 700; }
.qa-doc .is-ok { color: var(--color-success); font-weight: 700; } .qa-doc .is-ng { color: var(--color-danger); font-weight: 700; }
.qa-stamp { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; border: 3px solid var(--color-success); color: var(--color-success); border-radius: 12px; padding: 8px 22px; font-weight: 800; font-size: 1.2rem; transform: rotate(-3deg); }
.qa-stamp small { font-size: 12px; font-weight: 600; }
.qa-stamp.is-warning { border-color: var(--color-warning); color: var(--color-warning); } .qa-stamp.is-danger { border-color: var(--color-danger); color: var(--color-danger); }
.qa-doc-foot { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 22px; font-size: 12.5px; }
.qa-doc-foot div { border-top: 1px dashed var(--color-border-strong); padding-top: 8px; text-align: center; color: var(--color-text-muted); }
.qa-doc-foot b { display: block; color: var(--color-text); }
.qa-doc-note { font-size: 11.5px; color: var(--color-text-muted); text-align: center; margin-top: 16px; }
.qa-why { display: grid; grid-template-columns: 34px 1fr; gap: 8px; align-items: center; margin-bottom: 8px; }
.qa-why span { width: 30px; height: 30px; border-radius: 50%; background: var(--color-primary-tint); color: var(--eg-navy); display: grid; place-items: center; font: 700 12px var(--font-en); }
.qa-check { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.qa-check li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--color-bg-alt); font-size: 13.5px; }
.qa-check li.is-done { color: var(--color-text-muted); } .qa-check li.is-done span.qa-check-t { text-decoration: line-through; }
.qa-check button.qa-tick { width: 30px; height: 30px; border-radius: 8px; border: 2px solid var(--color-border-strong); background: #fff; display: grid; place-items: center; cursor: pointer; flex: none; color: #fff; }
.qa-check li.is-done button.qa-tick { background: var(--color-success); border-color: var(--color-success); }
.qa-check button.qa-tick[aria-disabled="true"] { cursor: not-allowed; opacity: .7; }
.qa-check .qa-check-t { flex: 1; } .qa-check small { color: var(--color-text-muted); font-size: 11.5px; }
.qa-certs { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); }
.qa-cert { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-top: 4px solid var(--color-success); }
.qa-cert.is-expiring { border-top-color: var(--color-warning); } .qa-cert.is-expired { border-top-color: var(--color-danger); }
.qa-cert-ico { width: 40px; height: 40px; border-radius: 12px; background: var(--color-primary-tint); color: var(--eg-navy); display: grid; place-items: center; flex: none; }
.qa-cert-head { display: flex; gap: 12px; align-items: flex-start; } .qa-cert-head b { display: block; font-size: 14.5px; } .qa-cert-head small { color: var(--color-text-muted); font-size: 12.5px; }
.qa-count { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.qa-count div { background: var(--color-bg-alt); border-radius: 12px; padding: 8px 10px; text-align: center; } .qa-count b { display: block; font: 700 22px var(--font-en); } .qa-count small { font-size: 12px; color: var(--color-text-muted); font-weight: 600; }
.qa-count .is-warning b { color: var(--color-warning); } .qa-count .is-danger b { color: var(--color-danger); }
.qa-tl { position: relative; padding-top: 22px; }
.qa-tl-axis { position: relative; height: 18px; font: 600 11px var(--font-en); color: var(--color-text-muted); }
.qa-tl-axis span { position: absolute; top: 0; transform: translateX(50%); }
.qa-tl-row { display: grid; grid-template-columns: 200px 1fr; gap: 12px; align-items: center; margin-bottom: 10px; font-size: 12.5px; }
.qa-tl-track { position: relative; height: 26px; background: var(--color-bg-alt); border-radius: 8px; }
.qa-tl-bar { position: absolute; top: 4px; height: 18px; border-radius: 6px; background: var(--color-success); opacity: .85; }
.qa-tl-bar.is-expiring { background: var(--color-warning); } .qa-tl-bar.is-expired { background: var(--color-danger); }
.qa-tl-audit { position: absolute; top: -3px; width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 3px solid var(--eg-navy); transform: translateX(50%); }
.qa-tl-today { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--color-accent); z-index: 1; }
.qa-tl-today::after { content: "اليوم"; position: absolute; top: -18px; transform: translateX(50%); font-size: 11px; color: var(--color-accent); font-weight: 700; white-space: nowrap; }
.qa-stat { background: var(--color-bg-alt); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.qa-stat small { color: var(--color-text-muted); font-size: 12px; font-weight: 600; } .qa-stat b { font: 700 1.2rem var(--font-en); }
.qa-stat.is-danger b { color: var(--color-danger); } .qa-stat.is-success b { color: var(--color-success); } .qa-stat.is-warning b { color: var(--color-warning); }
.qa-stats { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-block: 12px; }
.qa-attn { list-style: none; margin: 0; padding: 0; } .qa-attn li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--color-border); } .qa-attn li:last-child { border-bottom: 0; }
.qa-attn-b { flex: 1; min-width: 0; font-size: var(--text-dense); } .qa-attn-b > b { display: block; } .qa-attn-b small { display: block; color: var(--color-text-muted); font-size: 12.5px; line-height: 1.6; }
.qa-flex { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
@media (max-width: 760px) { .qa-tl-row { grid-template-columns: 1fr; } .qa-doc { padding: 16px; } .qa-doc-foot { grid-template-columns: 1fr; } .qa-def-row { grid-template-columns: 1fr 90px auto; } }
@media print {
  body.qa-printing * { visibility: hidden !important; }
  body.qa-printing .qa-print, body.qa-printing .qa-print * { visibility: visible !important; }
  body.qa-printing .qa-print { position: absolute; inset-block-start: 0; inset-inline: 0; margin: 0; max-width: none; border: 0; box-shadow: none; }
}`;
    document.head.appendChild(s);
  })();

  /* ═════════════════════════ helpers ═════════════════════════ */
  const ts = (iso) => (iso ? new Date(iso).getTime() : 0);
  const item = (id) => ERP.item(id) || {};
  const uomOf = (itemId) => ERP.uom[item(itemId).uom] || item(itemId).uom || '';
  const qtyU = (n, itemId) => num(n, 2) + ' ' + uomOf(itemId);
  const defLabel = (code) => (ERP.defectCodes.find((d) => d.code === code) || {}).label || code;
  const daysTo = (ds) => (ds ? ERP.daysBetween(today(), ds) : null);
  const inDays = (n) => (n == null ? '—' : n === 0 ? 'اليوم' : n > 0 ? 'بعد ' + n + ' يوم' : 'منذ ' + -n + ' يوم');
  const SEV = { minor: ['بسيط', 'warning'], major: ['رئيسي', 'danger'], critical: ['حرج', 'danger'] };
  const SRC = { production: ['إنتاج', 'info'], supplier: ['مورد', 'warning'], customer: ['عميل', 'danger'] };
  const DISP = { rework: 'إعادة تشغيل', scrap: 'إعدام (خردة)', use_as_is: 'قبول كما هو', return_to_supplier: 'مرتجع للمورد' };
  const KIND = { incoming: ['فحص استلام', 'warning'], inprocess: ['فحص أثناء التشغيل', 'info'], final: ['فحص نهائي', 'info'] };
  const sevChip = (s) => SA.chip((SEV[s] || [s])[0], (SEV[s] || [0, 'neutral'])[1]);
  const srcChip = (s) => SA.chip((SRC[s] || [s])[0], (SRC[s] || [0, 'neutral'])[1]);
  const kindChip = (k) => SA.chip((KIND[k] || [k])[0], (KIND[k] || [0, 'neutral'])[1]);
  const capaLink = (id) => h('a.erp-doc', { href: '#/mfg/capa/' + id }, id);
  const refLink = (refType, refId) => (refId ? U.docLink(refId) : h('span', {}, '—'));
  const miniTable = (cols, rows) => h('div.table-wrap', {}, h('table.table.qa-mini', {}, h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c)))), h('tbody', {}, rows)));
  const td = (v, cls) => h('td', { class: cls === 'num' ? 'qa-n' : cls || null }, v == null || v === '' ? '—' : cls === 'num' && typeof v === 'string' ? h('span.num', {}, v) : v);
  const stat = (label, value, tone) => h('div.qa-stat' + (tone ? '.is-' + tone : ''), {}, h('small', {}, label), h('b.num', {}, value));
  const attn = (o) => h('li', {}, h('span.qa-cons-ico.is-' + (o.tone || 'warning'), {}, SA.icon(o.icon || 'alert', 'icon-sm')), h('div.qa-attn-b', {}, h('b', {}, o.title), o.sub ? h('small', {}, o.sub) : null), o.href ? h('a.btn.btn-ghost.btn-sm', { href: o.href }, o.cta || 'فتح') : null);
  function safeNotify(o) { try { SA.notify(o); } catch (e) { /* noop */ } }
  function grnOf(qc) { return qc && qc.refType === 'grn' ? ERP.find('grns', qc.refId) : null; }
  /** ERP.flow.recordQC opens the NCR with qcId but does not write qc.ncrId → resolve both ways */
  function ncrOf(qc) { if (!qc) return null; if (qc.ncrId) return qc.ncrId; const n = get('ncrs').find((x) => x.qcId === qc.id); return n ? n.id : null; }
  function supplierOfQC(qc) { const g = grnOf(qc); return g ? g.supplierId : null; }
  function sourceLine(qc) {
    if (qc.refType === 'work_order') { const wo = ERP.find('workOrders', qc.refId); const so = wo && wo.soId ? ERP.find('salesOrders', wo.soId) : null; return h('span', {}, U.docLink(qc.refId), so ? h('span', {}, ' · ', U.docLink(so.id), ' ' + ERP.customerName(so.customerId)) : null); }
    if (qc.refType === 'grn') { const g = grnOf(qc); return h('span', {}, U.docLink(qc.refId), g ? ' · ' + ERP.supplierName(g.supplierId) : ''); }
    return refLink(qc.refType, qc.refId);
  }
  const certState = (c) => { const d = daysTo(c.expires); return d < 0 ? 'expired' : d <= 90 ? 'expiring' : 'valid'; };
  const CERT_ST = { valid: ['سارية', 'success'], expiring: ['تنتهي قريبًا', 'warning'], expired: ['منتهية', 'danger'] };
  const capaOverdue = (c) => c.status !== 'closed' && c.dueDate && c.dueDate < today();
  const capaProg = (c) => { const a = c.actions || []; return a.length ? a.filter((x) => x.done).length / a.length : 0; };

  /* ═════════════════════════ actions ═════════════════════════ */
  /** what recording a QC did (for a decided QC) or will do (preview) → [{icon, tone, node}] */
  function consequences(qc, preview) {
    const out = []; const it = item(qc.itemId);
    const acc = preview ? preview.accepted : qc.acceptedQty || 0; const rej = preview ? preview.rejected : qc.rejectedQty || 0; const result = preview ? preview.result : qc.result;
    if (qc.refType === 'work_order') {
      const wo = ERP.find('workOrders', qc.refId); const so = wo && wo.soId ? ERP.find('salesOrders', wo.soId) : null;
      if (acc > 0) out.push({ icon: 'warehouse', tone: 'success', node: h('span', {}, (preview ? 'دخول ' : 'تم نقل ') + qtyU(acc, qc.itemId) + ' إلى ' + ERP.whName(K.FG) + ' — اللوط ' + (qc.lot || '—') + (preview ? '' : ' (الرصيد المتاح الآن ' + num(K.available(qc.itemId, K.FG)) + ')')) });
      if (rej > 0) out.push({ icon: 'alert', tone: 'danger', node: h('span', {}, qtyU(rej, qc.itemId) + (preview ? ' إلى ' : ' في ') + ERP.whName(K.QRT) + (preview ? ' + فتح عدم مطابقة (' + (result === 'fail' ? 'رئيسي' : 'بسيط') + ')' : ''), !preview && ncrOf(qc) ? h('span', {}, ' — ', U.docLink(ncrOf(qc))) : null) });
      if (wo) out.push({ icon: 'clipboard', tone: result === 'fail' ? 'danger' : 'success', node: h('span', {}, 'أمر التشغيل ', U.docLink(wo.id), ' ← ', preview ? U.status('wo', result === 'fail' ? 'on_hold' : 'completed') : U.status('wo', wo.status)) });
      if (so) {
        let ready = so.status === 'ready';
        if (preview) ready = so.lines.every((l) => { const need = l.qty - (l.reservedQty || 0); if (need <= 0) return true; const av = K.available(l.itemId, K.FG) + (l.itemId === qc.itemId ? acc : 0); return av >= need; });
        out.push({ icon: 'cart', tone: ready ? 'success' : 'info', node: h('span', {}, 'أمر البيع ', U.docLink(so.id), ' — ' + ERP.customerName(so.customerId) + ' ← ', preview ? (ready ? h('b', { style: { color: 'var(--color-success)' } }, 'سيصبح «جاهز للتسليم» وتُخطر اللوجستيات') : 'يُحجز المقبول ويبقى قيد التصنيع لباقي البنود') : U.status('so', so.status), !preview && so.status === 'ready' ? ' — تم إخطار اللوجستيات والمخزن' : '') });
      }
    } else if (qc.refType === 'grn') {
      const g = grnOf(qc);
      if (acc > 0) out.push({ icon: 'warehouse', tone: 'success', node: h('span', {}, (preview ? 'استلام ' : 'تم استلام ') + qtyU(acc, qc.itemId) + ' في ' + ERP.whName(g ? g.whId : K.defaultWh(qc.itemId))) });
      if (acc > 0) { const bills = g ? get('bills').filter((b) => b.grnId === g.id) : []; out.push({ icon: 'receipt', tone: 'info', node: h('span', {}, preview ? 'تسجيل فاتورة مورد آليًا للكمية المقبولة (حسابات الموردين)' : bills.length ? h('span', {}, 'فاتورة مورد: ', bills.map((b) => [U.docLink(b.id), ' '])) : 'لا توجد فاتورة مرتبطة') }); }
      if (rej > 0) out.push({ icon: 'truck', tone: 'danger', node: h('span', {}, qtyU(rej, qc.itemId) + ' مرفوض — مرتجع للمورد عبر ' + ERP.whName(K.QRT), !preview && ncrOf(qc) ? h('span', {}, ' — ', U.docLink(ncrOf(qc))) : preview ? ' + عدم مطابقة مورد' : '') });
      if (g && !preview) out.push({ icon: 'clipboard', tone: 'info', node: h('span', {}, 'إذن الاستلام ', U.docLink(g.id), ' ← ', U.status('grn', g.status)) });
    }
    if (!it.id) out.push({ icon: 'info', tone: 'warning', node: h('span', {}, 'صنف غير معروف') });
    return out;
  }
  const consList = (list) => h('ul.qa-cons', {}, list.map((c) => h('li', {}, h('span.qa-cons-ico.is-' + (c.tone || 'info'), {}, SA.icon(c.icon, 'icon-sm')), c.node)));

  function nextCapaId() { const y = new Date().getFullYear(); const n = get('capas').reduce((m, c) => { const r = /^CAPA-(\d{4})-(\d+)$/.exec(c.id || ''); return r && Number(r[1]) === y ? Math.max(m, Number(r[2])) : m; }, 0); return 'CAPA-' + y + '-' + String(n + 1).padStart(3, '0'); }
  function createCAPA(o) {
    if (!Array.isArray(st.get('capas'))) st.set('capas', []);
    const c = { id: nextCapaId(), title: o.title, ncrIds: o.ncrId ? [o.ncrId] : [], ownerId: o.ownerId || me(), status: 'open', rootCause: o.rootCause || '', actions: (o.actions || []).filter(Boolean).map((t) => ({ text: t, done: false })), dueDate: o.dueDate || ERP.day(14), openedAt: ERP.now(), openedBy: me() };
    st.insert('capas', c, true);
    if (o.ncrId) st.patch('ncrs', o.ncrId, { capaId: c.id });
    SA.audit('CAPA.OPENED', { target: { type: 'capa', id: c.id, label: c.title }, after: { ncr: o.ncrId || null, owner: c.ownerId, due: c.dueDate, actions: c.actions.length } });
    safeNotify({ title: 'إجراء تصحيحي جديد: ' + c.id, body: c.title + ' — الاستحقاق ' + ERP.fmt.date(c.dueDate), level: 'action', toUsers: [c.ownerId], to: ['R-09'], link: '#/mfg/capa/' + c.id });
    return c;
  }
  function saveRootCause(ncrId, whys, rootCause) {
    const n = ERP.find('ncrs', ncrId); if (!n) return null; const before = { status: n.status, rootCause: n.rootCause };
    st.patch('ncrs', ncrId, { whys, rootCause, status: n.status === 'open' ? 'investigating' : n.status, analysedAt: ERP.now(), analysedBy: me() });
    SA.audit('NCR.ROOT_CAUSE', { target: { type: 'ncr', id: ncrId, label: ERP.itemName(n.itemId) }, before, after: { status: n.status === 'open' ? 'investigating' : n.status, rootCause } });
    return ERP.find('ncrs', ncrId);
  }
  function applyDisposition(ncrId, disp, note) {
    const n = ERP.find('ncrs', ncrId); if (!n || ['dispositioned', 'closed'].indexOf(n.status) >= 0) return null;
    const q = Math.min(n.qty, K.qty(n.itemId, K.QRT)); const ref = { type: 'ncr', id: ncrId };
    if (q > 0) {
      if (disp === 'scrap') K.move({ itemId: n.itemId, whId: K.QRT, qty: -q, type: 'scrap', ref, note: 'إعدام — قرار عدم مطابقة ' + ncrId });
      else if (disp === 'use_as_is') K.transfer(n.itemId, K.QRT, K.defaultWh(n.itemId), q, ref, 'قبول كما هو — ' + ncrId);
      else if (disp === 'rework') K.transfer(n.itemId, K.QRT, K.WIP, q, ref, 'إعادة تشغيل — ' + ncrId);
      else if (disp === 'return_to_supplier') K.move({ itemId: n.itemId, whId: K.QRT, qty: -q, type: 'return', ref, note: 'مرتجع للمورد — ' + ncrId });
    }
    st.patch('ncrs', ncrId, { status: 'dispositioned', disposition: disp, dispositionNote: note || '', dispositionedAt: ERP.now(), dispositionedBy: me(), dispositionQty: q, pendingDisposition: null });
    SA.audit('NCR.DISPOSITIONED', { target: { type: 'ncr', id: ncrId, label: ERP.itemName(n.itemId) }, before: { status: n.status, disposition: null }, after: { status: 'dispositioned', disposition: disp, qtyMoved: q }, reason: note || '' });
    const to = disp === 'rework' ? ['R-05'] : disp === 'return_to_supplier' ? ['R-08', 'R-06'] : ['R-06', 'R-05'];
    safeNotify({ title: 'قرار عدم مطابقة ' + ncrId + ': ' + DISP[disp], body: ERP.itemName(n.itemId) + ' — ' + qtyU(q || n.qty, n.itemId), level: disp === 'rework' || disp === 'return_to_supplier' ? 'action' : 'info', to, link: '#/mfg/ncr/' + ncrId });
    return ERP.find('ncrs', ncrId);
  }
  /** disposition entry point: «use as is» on a major/critical NCR goes to the GM for approval (ncr_disposition) */
  function disposition(ncrId, disp, note) {
    const n = ERP.find('ncrs', ncrId); if (!n) return null;
    if (disp === 'use_as_is' && n.severity !== 'minor') {
      const ap = SA.requestApproval({ type: 'ncr_disposition', area: 'mfg', title: 'قبول كما هو — ' + ncrId + ' (' + ERP.itemName(n.itemId) + ')', amount: null, chain: [{ roleId: 'R-02', label: 'المدير العام' }],
        context: [['الصنف', ERP.itemName(n.itemId)], ['الكمية', qtyU(n.qty, n.itemId)], ['العيب', defLabel(n.defectCode)], ['الخطورة', (SEV[n.severity] || [n.severity])[0]], ['السبب الجذري', n.rootCause || '—'], ['مبرر القرار', note || '—']], ref: { type: 'ncr', id: ncrId } });
      st.patch('ncrs', ncrId, { pendingDisposition: 'use_as_is', pendingNote: note || '', approvalId: ap.id });
      return { pending: ap.id };
    }
    return applyDisposition(ncrId, disp, note);
  }
  ERP.onApproval('ncr', (ap) => {
    const n = ERP.find('ncrs', ap.ref.id); if (!n || n.approvalId !== ap.id || !n.pendingDisposition || ['dispositioned', 'closed'].indexOf(n.status) >= 0) return;
    if (ap.status === 'approved') applyDisposition(n.id, n.pendingDisposition, (n.pendingNote || '') + ' — معتمد ' + ap.id);
    else if (ap.status === 'rejected' || ap.status === 'changes_requested') st.patch('ncrs', n.id, { pendingDisposition: null, approvalId: null, dispositionRejected: ap.id });
  });
  function closeNCR(ncrId, note) {
    const n = ERP.find('ncrs', ncrId); if (!n || n.status !== 'dispositioned') return null;
    st.patch('ncrs', ncrId, { status: 'closed', closedAt: ERP.now(), closedBy: me(), closeNote: note || '' });
    SA.audit('NCR.CLOSED', { target: { type: 'ncr', id: ncrId, label: ERP.itemName(n.itemId) }, before: { status: 'dispositioned' }, after: { status: 'closed' }, reason: note || '' });
    return ERP.find('ncrs', ncrId);
  }
  function toggleAction(capaId, idx) {
    const c = ERP.find('capas', capaId); if (!c || !c.actions[idx] || c.status === 'closed') return null; const was = c.actions[idx].done;
    st.patch('capas', capaId, (x) => { const a = x.actions[idx]; a.done = !was; a.doneAt = a.done ? ERP.now() : null; a.doneBy = a.done ? me() : null; const all = x.actions.every((y) => y.done); if (all && x.actions.length) x.status = 'verifying'; else if (x.actions.some((y) => y.done)) x.status = 'in_progress'; else if (x.status === 'verifying') x.status = 'in_progress'; });
    const c2 = ERP.find('capas', capaId);
    SA.audit('CAPA.UPDATED', { target: { type: 'capa', id: capaId, label: c.title }, before: { action: c.actions[idx].text, done: was, status: c.status }, after: { done: !was, status: c2.status } });
    return c2;
  }
  function addAction(capaId, text) {
    const c = ERP.find('capas', capaId); if (!c || !text) return null;
    st.patch('capas', capaId, (x) => { x.actions = (x.actions || []).concat([{ text, done: false }]); if (x.status === 'verifying') x.status = 'in_progress'; });
    SA.audit('CAPA.UPDATED', { target: { type: 'capa', id: capaId, label: c.title }, after: { addedAction: text } });
    return ERP.find('capas', capaId);
  }
  function closeCAPA(capaId, effective, note) {
    const c = ERP.find('capas', capaId); if (!c || c.status === 'closed') return null;
    if (effective) {
      st.patch('capas', capaId, { status: 'closed', closedAt: ERP.now(), effective: true, verification: { note: note || '', by: me(), at: ERP.now() } });
      SA.audit('CAPA.CLOSED', { target: { type: 'capa', id: capaId, label: c.title }, before: { status: c.status }, after: { status: 'closed', effective: true }, reason: note || '' });
    } else {
      st.patch('capas', capaId, (x) => { x.status = 'in_progress'; x.effective = false; x.verification = { note: note || '', by: me(), at: ERP.now(), failed: true }; x.actions = (x.actions || []).concat([{ text: 'إجراء إضافي بعد فشل التحقق: ' + (note || 'مراجعة السبب الجذري'), done: false }]); });
      SA.audit('CAPA.UPDATED', { target: { type: 'capa', id: capaId, label: c.title }, before: { status: c.status }, after: { status: 'in_progress', effective: false }, reason: note || '' });
    }
    return ERP.find('capas', capaId);
  }
  function updateCert(certId, patch, label) {
    const c = ERP.find('certs', certId); if (!c) return null; const before = {}; Object.keys(patch).forEach((k) => { before[k] = c[k]; });
    st.patch('certs', certId, Object.assign({}, patch, { updatedAt: ERP.now(), updatedBy: me() }));
    SA.audit('CERT.UPDATED', { target: { type: 'cert', id: certId, label: c.name }, before, after: patch, reason: label || '', area: 'mfg' });
    return ERP.find('certs', certId);
  }
  function toggleCheck(certId, idx) {
    const c = ERP.find('certs', certId); if (!c || !c.checklist || !c.checklist[idx]) return null; const was = c.checklist[idx].done;
    st.patch('certs', certId, (x) => { const i = x.checklist[idx]; i.done = !was; i.doneAt = i.done ? ERP.now() : null; i.doneBy = i.done ? me() : null; });
    SA.audit('CERT.UPDATED', { target: { type: 'cert', id: certId, label: c.name }, before: { item: c.checklist[idx].text, done: was }, after: { done: !was }, area: 'mfg' });
    return ERP.find('certs', certId);
  }

  /* ═════════════════════════ 1. mfg-quality (dashboard) ═════════════════════════ */
  function qualityBuild() {
    const qcs = get('qcInspections'); const ncrs = get('ncrs'); const capas = get('capas'); const certs = get('certs'); const pd = get('prodDaily');
    const since = Date.now() - 30 * 86400000; const dec30 = qcs.filter((q) => q.result !== 'pending' && ts(q.at) >= since); const fin30 = dec30.filter((q) => q.kind === 'final'); const inc = qcs.filter((q) => q.kind === 'incoming' && q.result !== 'pending');
    const pd30 = pd.filter((r) => r.date >= ERP.day(-30)); const g30 = pd30.reduce((s, r) => s + r.good, 0), s30 = pd30.reduce((s, r) => s + r.scrap, 0);
    const prodYield = g30 / Math.max(1, g30 + s30); const finAcc = fin30.reduce((s, q) => s + (q.acceptedQty || 0), 0) / Math.max(1, fin30.reduce((s, q) => s + (q.qty || 0), 0)); const fpy = prodYield * (fin30.length ? finAcc : 1);
    const defRate = dec30.reduce((s, q) => s + (q.rejectedQty || 0), 0) / Math.max(1, dec30.reduce((s, q) => s + (q.qty || 0), 0));
    const openN = ncrs.filter((n) => n.status !== 'closed'); const pending = qcs.filter((q) => q.result === 'pending');
    const capaOpen = capas.filter((c) => c.status !== 'closed'); const capaLate = capas.filter(capaOverdue);
    const incAcc = inc.reduce((s, q) => s + (q.acceptedQty || 0), 0) / Math.max(1, inc.reduce((s, q) => s + (q.qty || 0), 0));
    const expiring = certs.filter((c) => certState(c) !== 'valid');
    const copq = openN.reduce((s, n) => s + n.qty * (item(n.itemId).stdCost || 0), 0);
    const head = SA.pageHead({ title: 'لوحة الجودة', desc: 'العائد من أول مرة، العيوب، عدم المطابقة والإجراءات التصحيحية، جودة الموردين والشهادات — من نفس سجلات الفحص.', tags: [SA.tag('pending', 'موديول الجودة — بند 34')],
      actions: [SA.can('mfg.qc.view') ? SA.btn({ label: 'قائمة الفحص', icon: 'checkcircle', kind: pending.length ? 'primary' : 'ghost', onClick: () => SA.nav('mfg/qc') }) : null] });
    const kpis = U.kpis([
      U.kpi({ label: 'العائد من أول مرة FPY (30 يوم)', value: pct(fpy, 1), sub: 'إنتاج سليم ' + pct(prodYield, 1) + ' × قبول نهائي ' + pct(finAcc, 1), icon: 'target', tone: fpy < 0.95 ? 'warning' : 'success' }),
      U.kpi({ label: 'نسبة العيوب في الفحوص', value: pct(defRate, 2), sub: dec30.length + ' فحص خلال 30 يوم', icon: 'beaker', tone: defRate > 0.02 ? 'warning' : null }),
      U.kpi({ label: 'فحوص بانتظار القرار', value: num(pending.length), sub: pending.filter((q) => q.kind === 'final').length + ' نهائي · ' + pending.filter((q) => q.kind === 'incoming').length + ' استلام', icon: 'clock', tone: pending.length ? 'warning' : null, href: '#/mfg/qc' }),
      U.kpi({ label: 'عدم مطابقة مفتوح', value: num(openN.length), sub: openN.filter((n) => n.severity !== 'minor').length + ' رئيسي/حرج', icon: 'alert', tone: openN.some((n) => n.severity !== 'minor') ? 'danger' : null, href: '#/mfg/ncr' }),
      U.kpi({ label: 'إجراءات تصحيحية مفتوحة', value: num(capaOpen.length), sub: capaLate.length ? capaLate.length + ' متأخر' : 'لا تأخير', icon: 'target', tone: capaLate.length ? 'danger' : null, href: '#/mfg/capa' }),
      U.kpi({ label: 'قبول الاستلام من الموردين', value: pct(incAcc, 1), sub: inc.length + ' فحص استلام', icon: 'truck', tone: incAcc < 0.95 ? 'warning' : 'success' }),
      U.kpi({ label: 'تكلفة عدم المطابقة المفتوحة', value: U.canCost() ? ERP.fmt.short(copq) : 'سري', sub: U.canCost() ? 'بالتكلفة المعيارية' : 'تحتاج data.cost.view', icon: 'coins' }),
      U.kpi({ label: 'شهادات تحتاج متابعة', value: num(expiring.length), sub: expiring.length ? expiring.map((c) => c.name.split(' — ')[0]).join('، ') : 'كلها سارية', icon: 'award', tone: expiring.length ? 'warning' : 'success', href: '#/mfg/certs' })
    ]);
    // trend: 6 buckets of 5 days
    const buckets = Array.from({ length: 6 }, (_, i) => ({ from: ERP.day(-30 + i * 5), to: ERP.day(-26 + i * 5) }));
    const trend = buckets.map((b) => { const q = qcs.filter((x) => x.result !== 'pending' && x.at && x.at.slice(0, 10) >= b.from && x.at.slice(0, 10) <= b.to); const t = q.reduce((s, x) => s + (x.qty || 0), 0); const r = pd.filter((x) => x.date >= b.from && x.date <= b.to); const gg = r.reduce((s, x) => s + x.good + x.scrap, 0);
      return { label: Number(b.from.slice(8)) + '/' + Number(b.from.slice(5, 7)), qc: t ? Math.round((q.reduce((s, x) => s + (x.rejectedQty || 0), 0) / t) * 1000) / 10 : null, scrap: gg ? Math.round((r.reduce((s, x) => s + x.scrap, 0) / gg) * 1000) / 10 : null }; });
    const trendCard = SA.card({ title: 'اتجاه العيوب — آخر 30 يومًا (كل 5 أيام)' }, CH.line({ labels: trend.map((t) => t.label), height: 210, fmt: (v) => (v == null ? '—' : v.toFixed(1) + '%'), series: [{ name: 'نسبة المرفوض في الفحوص', values: trend.map((t) => t.qc), color: '#b9141b' }, { name: 'هالك الخطوط', values: trend.map((t) => t.scrap), color: ERP.palette[0] }, { name: 'الحد المستهدف 2.5%', values: trend.map(() => 2.5), dashed: true, color: '#8a8a8a' }] }));
    const par = {}; qcs.filter((q) => q.kind !== 'incoming').forEach((q) => (q.defects || []).forEach((d) => { par[d.code] = (par[d.code] || 0) + (d.qty || 0); })); ncrs.filter((n) => !n.qcId && n.source === 'customer').forEach((n) => { par[n.defectCode] = (par[n.defectCode] || 0) + (n.qty || 0); });
    const parRows = Object.keys(par).map((k) => ({ k, v: par[k] })).sort((a, b) => b.v - a.v); const parTot = parRows.reduce((s, r) => s + r.v, 0) || 1; let cum = 0;
    const paretoCard = SA.card({ title: 'باريتو العيوب حسب الكود' }, parRows.length ? CH.bars(parRows.map((r, i) => { cum += r.v; return { label: r.k + ' · ' + defLabel(r.k), sub: 'تراكمي ' + Math.round((cum / parTot) * 100) + '%', value: r.v, color: i === 0 ? 'var(--color-danger)' : ERP.palette[1] }; }), { fmt: (v) => num(v) + ' وحدة' }) : SA.empty({ icon: 'checkcircle', title: 'لا عيوب مسجلة' }), h('p.qa-muted', { style: { marginTop: '8px' } }, 'عيوب الفحص النهائي وشكاوى العملاء (بالوحدة). عيوب الخامات تظهر في جودة الموردين.'));
    const sevs = ['critical', 'major', 'minor'], srcs = ['production', 'supplier', 'customer'];
    const ncrCard = SA.card({ title: 'عدم المطابقة المفتوح — الخطورة والمصدر' }, miniTable(['المصدر', 'حرج', 'رئيسي', 'بسيط', 'الإجمالي'], srcs.map((s) => { const l = openN.filter((n) => n.source === s); return h('tr', {}, td(srcChip(s)), sevs.map((v) => td(String(l.filter((n) => n.severity === v).length), 'num')), td(h('b.num', {}, String(l.length)))); })),
      h('div', { style: { marginTop: '12px' } }, CH.donut(Object.keys(SA.catalog.status.ncr).filter((k) => k !== 'closed').map((k, i) => ({ label: SA.catalog.status.ncr[k][0], value: openN.filter((n) => n.status === k).length, color: ['#b9141b', '#a85a00', '#345383'][i] })), { size: 140, center: num(openN.length), sub: 'مفتوح' })));
    const bySup = {}; inc.forEach((q) => { const sid = supplierOfQC(q) || q.supplierId; if (!sid) return; const r = bySup[sid] || (bySup[sid] = { qty: 0, acc: 0, n: 0, rej: 0 }); r.qty += q.qty || 0; r.acc += q.acceptedQty || 0; r.n++; r.rej += q.rejectedQty || 0; });
    ncrs.filter((n) => n.source === 'supplier').forEach((n) => { const g = ERP.find('grns', n.refId); if (g && !bySup[g.supplierId]) bySup[g.supplierId] = { qty: g.lines.reduce((s, l) => s + l.qty, 0), acc: g.lines.reduce((s, l) => s + (l.acceptedQty || 0), 0), n: 1, rej: n.qty }; });
    const supCard = SA.card({ title: 'جودة الموردين — نسبة قبول الاستلام' }, Object.keys(bySup).length ? CH.bars(Object.keys(bySup).map((sid) => ({ sid, r: bySup[sid] })).sort((a, b) => a.r.acc / a.r.qty - b.r.acc / b.r.qty).map((x) => { const a = x.r.acc / Math.max(1, x.r.qty); const sp = ERP.supplier(x.sid) || {}; return { label: ERP.supplierName(x.sid), sub: x.r.n + ' فحص · مرفوض ' + num(x.r.rej) + (sp.rating ? ' · تقييم ' + sp.rating : ''), value: a * 100, color: a < 0.95 ? 'var(--color-danger)' : a < 0.99 ? 'var(--color-warning)' : 'var(--color-success)' }; }), { fmt: (v) => (v == null ? '—' : v.toFixed(1) + '%'), max: 100 }) : SA.empty({ icon: 'truck', title: 'لا فحوص استلام' }));
    const capaCard = SA.card({ title: 'الإجراءات التصحيحية' }, CH.donut(Object.keys(SA.catalog.status.capa).map((k, i) => ({ label: SA.catalog.status.capa[k][0], value: capas.filter((c) => c.status === k).length, color: ['#a85a00', '#012864', '#7d9cd1', '#147a3d'][i] })), { size: 140, center: num(capaOpen.length), sub: 'مفتوح' }),
      capaOpen.length ? h('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' } }, capaOpen.slice(0, 4).map((c) => h('div', {}, h('div.qa-flex', {}, capaLink(c.id), h('span', { style: { fontSize: '13px' } }, c.title), capaOverdue(c) ? SA.chip('متأخر', 'danger') : null), CH.meter(capaProg(c), { label: 'الاستحقاق ' + ERP.fmt.date(c.dueDate), text: Math.round(capaProg(c) * 100) + '%' })))) : null);
    const certCard = SA.card({ title: 'الشهادات والتدقيق القادم' }, miniTable(['الشهادة', 'الحالة', 'تنتهي', 'التدقيق القادم'], certs.map((c) => h('tr', {}, td(c.name), td(SA.chip(CERT_ST[certState(c)][0], CERT_ST[certState(c)][1])), td(ERP.fmt.date(c.expires) + ' (' + inDays(daysTo(c.expires)) + ')'), td(inDays(daysTo(c.nextAudit)))))));
    const att = [];
    pending.sort((a, b) => (a.kind === 'final' ? -1 : 1) - (b.kind === 'final' ? -1 : 1)).forEach((q) => { const wo = q.refType === 'work_order' ? ERP.find('workOrders', q.refId) : null; const so = wo && wo.soId ? ERP.find('salesOrders', wo.soId) : null;
      att.push({ tone: so ? 'danger' : 'warning', icon: 'checkcircle', title: (q.kind === 'final' ? 'فحص نهائي ' : 'فحص استلام ') + q.id + ' — ' + ERP.itemName(q.itemId), sub: qtyU(q.qty, q.itemId) + ' · ينتظر ' + SA.fmt.rel(q.createdAt).replace('منذ ', '') + (so ? ' · ' + ERP.customerName(so.customerId) + ' — تسليم ' + ERP.fmt.date(so.promisedDate) : ''), href: '#/mfg/qc/' + q.id, cta: 'افحص الآن' }); });
    openN.filter((n) => n.severity !== 'minor').forEach((n) => att.push({ tone: 'danger', icon: 'alert', title: n.id + ' — ' + defLabel(n.defectCode) + ' (' + ERP.itemName(n.itemId) + ')', sub: SA.catalog.status.ncr[n.status][0] + (n.capaId ? ' · ' + n.capaId : ' · بدون إجراء تصحيحي') + (n.pendingDisposition ? ' · بانتظار اعتماد القرار' : ''), href: '#/mfg/ncr/' + n.id }));
    capas.filter((c) => c.status !== 'closed' && (capaOverdue(c) || daysTo(c.dueDate) <= 7)).forEach((c) => att.push({ tone: capaOverdue(c) ? 'danger' : 'warning', icon: 'target', title: c.id + ' — ' + c.title, sub: 'الاستحقاق ' + ERP.fmt.date(c.dueDate) + ' (' + inDays(daysTo(c.dueDate)) + ') · تم ' + Math.round(capaProg(c) * 100) + '%', href: '#/mfg/capa/' + c.id }));
    expiring.forEach((c) => att.push({ tone: certState(c) === 'expired' ? 'danger' : 'warning', icon: 'award', title: c.name, sub: 'تنتهي ' + ERP.fmt.date(c.expires) + ' (' + inDays(daysTo(c.expires)) + ') · التدقيق ' + inDays(daysTo(c.nextAudit)), href: '#/mfg/certs', cta: 'الشهادات' }));
    const ins = U.insights('mfg');
    return h('div', {}, head, kpis, U.grid(2, trendCard, paretoCard), U.grid(2, ncrCard, supCard), U.grid(2, capaCard, certCard),
      U.grid(2, SA.card({ title: 'يحتاج انتباهك', tags: [h('span.sap-count', {}, String(att.length))] }, att.length ? h('ul.qa-attn', {}, att.slice(0, 8).map(attn)) : SA.empty({ icon: 'checkcircle', title: 'لا يوجد ما ينتظر' })),
        SA.card({ title: 'توصيات ذكية' }, ins.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, ins) : h('p.qa-muted', {}, 'التوصيات الذكية للجودة تظهر هنا عند تفعيل المساعد الذكي.'))));
  }
  function qualityRender(root, ctx) { ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'الجودة' }, { label: 'لوحة الجودة' }]); return SA.live(root, qualityBuild, ['qcInspections', 'ncrs', 'capas', 'certs']); }

  /* ═════════════════════════ 2. mfg-qc ═════════════════════════ */
  let lastRecorded = null;
  function qcList(root, ctx) {
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'الجودة' }, { label: 'فحوصات الجودة' }]);
    let tab = (ctx.params && ctx.params.tab) || 'queue'; const body = h('div'); const tabsHost = h('div');
    const pend = () => get('qcInspections').filter((q) => q.result === 'pending');
    const urgency = (q) => { const wo = q.refType === 'work_order' ? ERP.find('workOrders', q.refId) : null; const so = wo && wo.soId ? ERP.find('salesOrders', wo.soId) : null; return so ? so.promisedDate : '9999'; };
    const hist = SA.table({ rows: () => get('qcInspections').filter((q) => q.result !== 'pending'), pageSize: 10, initial: { sort: { key: 'at', dir: 'desc' }, filters: { kind: (ctx.params && ctx.params.kind) || '', result: (ctx.params && ctx.params.result) || '' } },
      search: { placeholder: 'بحث برقم الفحص أو الصنف أو اللوط أو المصدر…', keys: ['id', 'lot', 'refId', (r) => ERP.itemName(r.itemId)] },
      filters: [{ key: 'kind', label: 'النوع', options: [['final', 'فحص نهائي'], ['incoming', 'فحص استلام']] }, { key: 'result', label: 'النتيجة', options: [['pass', 'مطابق'], ['conditional', 'مقبول بشرط'], ['fail', 'غير مطابق']] }, { key: 'fam', label: 'العائلة', options: [['door', 'أبواب'], ['clad', 'تجاليد'], ['foam', 'فوم بورد'], ['rm', 'خامات']], test: (r, v) => (v === 'rm' ? item(r.itemId).kind !== 'fg' : item(r.itemId).family === v) }],
      columns: [{ key: 'id', label: 'الفحص', sort: true, render: (r) => U.docLink(r.id) }, { key: 'at', label: 'التاريخ', sort: true, render: (r) => SA.fmt.dt(r.at) }, { key: 'kind', label: 'النوع', render: (r) => kindChip(r.kind) },
        { key: 'item', label: 'الصنف', value: (r) => ERP.itemName(r.itemId), sort: true, render: (r) => U.itemCell(r.itemId) }, { key: 'qty', label: 'الكمية', class: 'qa-n', sort: true, render: (r) => qtyU(r.qty, r.itemId) },
        { key: 'acc', label: 'مقبول / مرفوض', class: 'qa-n', render: (r) => h('span', {}, num(r.acceptedQty), ' / ', r.rejectedQty ? h('b', { style: { color: 'var(--color-danger)' } }, num(r.rejectedQty)) : '0') }, { key: 'result', label: 'النتيجة', sort: true, render: (r) => U.status('qc', r.result) },
        { key: 'src', label: 'المصدر', render: (r) => sourceLine(r) }, { key: 'insp', label: 'المفتش', render: (r) => SA.userName(r.inspectorId) }],
      onRowClick: (r) => SA.nav('mfg/qc/' + r.id), empty: { icon: 'checkcircle', title: 'لا يوجد سجل فحوص' } });
    function drawTabs() { SA.clear(tabsHost); tabsHost.append(SA.tabs({ tabs: [{ id: 'queue', label: 'قائمة الانتظار', icon: 'clock', badge: pend().length }, { id: 'history', label: 'سجل الفحوص', icon: 'history' }], active: tab, onChange: (v) => { tab = v; draw(); } }).el); }
    function draw() {
      SA.clear(body);
      if (tab === 'history') { body.append(hist.el); hist.refresh(); return; }
      const list = pend().sort((a, b) => (urgency(a) < urgency(b) ? -1 : urgency(a) > urgency(b) ? 1 : ts(a.createdAt) - ts(b.createdAt)));
      body.append(list.length ? h('div.qa-queue', {}, list.map((q) => { const wo = q.refType === 'work_order' ? ERP.find('workOrders', q.refId) : null; const so = wo && wo.soId ? ERP.find('salesOrders', wo.soId) : null; const g = grnOf(q);
        return h('div.card.qa-qcard' + (q.kind === 'final' ? '.is-final' : ''), {}, h('div.qa-qcard-top', {}, h('span.qa-flex', {}, U.docLink(q.id), kindChip(q.kind)), h('small.qa-muted', {}, 'ينتظر ' + SA.fmt.rel(q.createdAt).replace('منذ ', ''))), U.itemCell(q.itemId),
          h('div.qa-meta', {}, h('span', {}, 'الكمية ', h('b.num', {}, qtyU(q.qty, q.itemId))), h('span', {}, 'العينة ', h('b.num', {}, num(q.sample))), h('span', {}, 'اللوط ', h('b.num', {}, q.lot || '—')), h('span', {}, (ERP.qcParams[item(q.itemId).kind === 'fg' ? item(q.itemId).family : 'rm'] || []).length + ' بنود فحص')),
          h('div.qa-meta', {}, h('span', {}, 'المصدر ', sourceLine(q))), so ? SA.alert(ERP.daysBetween(today(), so.promisedDate) <= 7 ? 'warning' : 'info', 'تسليم ' + ERP.customerName(so.customerId) + ' في ' + ERP.fmt.date(so.promisedDate) + ' — الأمر ينتظر هذا الفحص ليصبح جاهزًا.') : g ? h('small.qa-muted', {}, 'المورد ' + ERP.supplierName(g.supplierId) + ' · لن تدخل الكمية المخزن قبل القرار') : null,
          SA.btn({ label: 'سجّل الفحص', icon: 'checkcircle', perm: 'mfg.qc.inspect', onClick: () => SA.nav('mfg/qc/' + q.id) })); })) : SA.card({}, SA.empty({ icon: 'checkcircle', title: 'لا توجد فحوص بانتظارك', text: 'الفحوص الجديدة تظهر هنا تلقائيًا عند اكتمال أمر تشغيل أو استلام بضاعة من مورد.' })));
    }
    root.append(SA.pageHead({ title: 'فحوصات الجودة', desc: 'فحص الاستلام من الموردين والفحص النهائي لأوامر التشغيل — القرار ينقل المخزون ويُكمل الأمر تلقائيًا.' }), tabsHost, body);
    drawTabs(); draw();
    const off = st.subscribe('qcInspections', () => { drawTabs(); draw(); }); return off;
  }
  function recordForm(qc, host) {
    const params = (qc.params || []).map((p) => ({ name: p.name, spec: p.spec, value: p.value || '', ok: p.ok == null ? null : p.ok }));
    const defects = []; let accTouched = false, resTouched = false; let result = 'pass';
    const fSample = SA.form.field({ name: 'sample', label: 'حجم العينة', type: 'number', value: qc.sample, min: 1 });
    const fAcc = SA.form.field({ name: 'acc', label: 'الكمية المقبولة (' + uomOf(qc.itemId) + ')', type: 'number', value: qc.qty, min: 0, onInput: () => { accTouched = true; } });
    const fNote = SA.form.field({ name: 'note', label: 'ملاحظات المفتش', type: 'textarea', rows: 2 });
    const fRes = SA.form.field({ name: 'result', label: 'قرار الفحص', type: 'radio', value: 'pass', options: [['pass', 'مطابق', 'الكمية المقبولة تدخل المخزن'], ['conditional', 'مقبول بشرط', 'قبول جزئي — المرفوض للحجر + عدم مطابقة بسيط'], ['fail', 'غير مطابق', 'الدفعة كلها للحجر + عدم مطابقة رئيسي']], onChange: (v) => { result = v; resTouched = true; } });
    const pHost = h('div'), dHost = h('div');
    const defTotal = () => defects.reduce((s, d) => s + (Number(d.qty) || 0), 0);
    function auto() {
      if (!accTouched) fAcc.set(Math.max(0, qc.qty - defTotal()));
      if (!resTouched) { result = params.some((p) => p.ok === false) || defTotal() > 0 ? 'conditional' : 'pass'; fRes.set(result); }
    }
    function drawParams() {
      SA.clear(pHost);
      pHost.append(miniTable(['البند', 'المواصفة', 'القيمة المقاسة', 'النتيجة'], params.map((p) => { const seg = h('div.qa-okng' + (p.ok === false ? '.is-ng' : p.ok ? '.is-ok' : ''), {}, SA.segmented([['ok', 'مطابق'], ['ng', 'غير مطابق']], p.ok == null ? null : p.ok ? 'ok' : 'ng', (v) => { p.ok = v === 'ok'; seg.className = 'qa-okng ' + (p.ok ? 'is-ok' : 'is-ng'); seg.closest('tr').classList.toggle('qa-row-ng', !p.ok); auto(); }));
        return h('tr' + (p.ok === false ? '.qa-row-ng' : ''), {}, td(h('b', {}, p.name)), td(h('span.num', {}, p.spec)), td(h('input.input', { value: p.value, placeholder: 'القيمة', 'aria-label': 'قيمة ' + p.name, oninput: (e) => { p.value = e.target.value; } })), td(seg)); })),
      h('div', { style: { marginTop: '8px' } }, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { params.forEach((p) => { p.ok = true; if (!p.value) p.value = 'ضمن المواصفة'; }); drawParams(); auto(); } }, SA.icon('check', 'icon-sm'), 'كل البنود مطابقة')));
    }
    function drawDefects() {
      SA.clear(dHost);
      defects.forEach((d, i) => dHost.append(h('div.qa-def-row', {}, h('select.select', { 'aria-label': 'كود العيب', onchange: (e) => { d.code = e.target.value; } }, ERP.defectCodes.map((c) => h('option', { value: c.code, selected: c.code === d.code }, c.code + ' — ' + c.label))),
        h('input.input', { type: 'number', min: 0, value: d.qty, dir: 'ltr', 'aria-label': 'الكمية المعيبة', oninput: (e) => { d.qty = Number(e.target.value) || 0; auto(); } }), h('button.btn.btn-ghost.btn-sm.btn-icon', { type: 'button', 'aria-label': 'حذف', onclick: () => { defects.splice(i, 1); drawDefects(); auto(); } }, SA.icon('trash', 'icon-sm')))));
      dHost.append(h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { defects.push({ code: item(qc.itemId).kind === 'fg' ? 'D04' : 'D08', qty: 1 }); drawDefects(); auto(); } }, SA.icon('plus', 'icon-sm'), 'إضافة عيب'));
    }
    drawParams(); drawDefects();
    async function save() {
      const missing = params.filter((p) => p.ok == null).length; if (missing) return SA.toast('حدّد نتيجة كل بند فحص (' + missing + ' بدون نتيجة).', 'warn');
      let acc = result === 'fail' ? 0 : Number(fAcc.get()); if (!(acc >= 0) || acc > qc.qty) return fAcc.error('الكمية المقبولة بين 0 و' + num(qc.qty));
      if (result === 'pass' && acc < qc.qty && params.every((p) => p.ok) && !defTotal()) acc = qc.qty;
      const rej = qc.qty - acc; const prev = consequences(qc, { result, accepted: acc, rejected: rej });
      const r = await SA.confirm({ title: 'اعتماد نتيجة الفحص ' + qc.id, icon: result === 'fail' ? 'alert' : 'checkcircle', danger: result === 'fail', confirmLabel: 'اعتماد النتيجة', text: 'القرار: ' + SA.catalog.status.qc[result][0] + ' — مقبول ' + qtyU(acc, qc.itemId) + (rej ? ' · مرفوض ' + qtyU(rej, qc.itemId) : ''), extra: h('div.sap-impact', {}, h('b', {}, 'ما سيحدث تلقائيًا'), consList(prev)) });
      if (!r.ok) return;
      try { await SA.api(() => { lastRecorded = qc.id; st.patch('qcInspections', qc.id, { sample: Number(fSample.get()) || qc.sample }); return F.recordQC(qc.id, { result, acceptedQty: acc, note: fNote.get(), params: params.map((p) => ({ name: p.name, spec: p.spec, value: p.value || (p.ok ? 'ضمن المواصفة' : ''), ok: p.ok })), defects: defects.filter((d) => d.qty > 0).map((d) => ({ code: d.code, label: defLabel(d.code), qty: d.qty })) }); }); } catch (e) { lastRecorded = null; return SA.fail(e); }
      SA.toast('تم تسجيل الفحص ' + qc.id + ' — ' + SA.catalog.status.qc[result][0], 'success');
    }
    host.append(SA.card({ title: 'بنود الفحص حسب المواصفة', tags: [h('span.sap-count', {}, String(params.length))] }, pHost),
      U.grid(2, SA.card({ title: 'العيوب المكتشفة' }, dHost, h('p.qa-muted', { style: { marginTop: '8px' } }, 'كود العيب من كتالوج العيوب — يُستخدم في باريتو العيوب وفي عدم المطابقة.')),
        SA.card({ title: 'القرار' }, h('div.qa-form-grid', {}, fSample.el, fAcc.el), fRes.el, fNote.el, h('div', { style: { marginTop: '12px', display: 'flex', gap: '8px' } }, SA.btn({ label: 'حفظ واعتماد النتيجة', icon: 'check', perm: 'mfg.qc.inspect', onClick: save })))));
  }
  function reportDoc(qc) {
    const co = st.get('settings.company') || {}; const it = item(qc.itemId); const final = qc.kind === 'final';
    const title = qc.result === 'fail' ? 'تقرير عدم مطابقة — فحص ' + (final ? 'نهائي' : 'استلام') : final ? 'شهادة مطابقة وتقرير فحص نهائي (CoC)' : 'تقرير فحص استلام خامات';
    const tone = qc.result === 'pass' ? '' : qc.result === 'conditional' ? '.is-warning' : '.is-danger';
    const wo = qc.refType === 'work_order' ? ERP.find('workOrders', qc.refId) : null; const so = wo && wo.soId ? ERP.find('salesOrders', wo.soId) : null; const g = grnOf(qc);
    const M = (l, v) => h('div', {}, h('small', {}, l), h('b', {}, v == null || v === '' ? '—' : v));
    return h('article.qa-doc.qa-print', {},
      h('header.qa-doc-head', {}, h('img', { src: '../../assets/images/logo/wordmark-color.png', alt: 'المصرية الألمانية' }), h('div', {}, h('b', {}, co.nameAr || ''), h('span', {}, co.address || ''), h('span.num', {}, (co.phone ? 'الخط الساخن ' + co.phone : '') + (co.website ? ' · ' + co.website : '')))),
      h('h2.qa-doc-title', {}, title), h('div.qa-doc-sub.num', {}, qc.id + ' · ' + SA.fmt.dt(qc.at) + ' · نظام إدارة الجودة ISO 9001:2015'),
      h('div.qa-doc-meta', {}, M('الصنف', it.name), M('الكود', it.code), M('الكمية المفحوصة', qtyU(qc.qty, qc.itemId)), M('حجم العينة', num(qc.sample)), M('رقم اللوط', qc.lot), M('نوع الفحص', (KIND[qc.kind] || [qc.kind])[0]),
        M(final ? 'أمر التشغيل' : 'إذن الاستلام', qc.refId), so ? M('العميل / أمر البيع', ERP.customerName(so.customerId) + ' — ' + so.id) : g ? M('المورد', ERP.supplierName(g.supplierId)) : M('المصدر', '—'), M('المفتش', SA.userName(qc.inspectorId))),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'البند'), h('th', {}, 'المواصفة'), h('th', {}, 'القيمة'), h('th', {}, 'النتيجة'))), h('tbody', {}, (qc.params || []).map((p) => h('tr', {}, h('td', {}, p.name), h('td.qa-n', {}, p.spec), h('td', {}, p.value || '—'), h('td', { class: p.ok === false ? 'is-ng' : p.ok ? 'is-ok' : '' }, p.ok === false ? 'غير مطابق' : p.ok ? 'مطابق' : '—'))))),
      (qc.defects || []).length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'كود العيب'), h('th', {}, 'الوصف'), h('th', {}, 'الكمية'))), h('tbody', {}, qc.defects.map((d) => h('tr', {}, h('td.qa-n', {}, d.code), h('td', {}, d.label || defLabel(d.code)), h('td.qa-n', {}, num(d.qty)))))) : null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' } }, h('div', { style: { fontSize: '13px', lineHeight: '1.9' } }, h('div', {}, 'الكمية المقبولة: ', h('b.num', {}, qtyU(qc.acceptedQty, qc.itemId))), h('div', {}, 'الكمية المرفوضة: ', h('b.num', {}, qtyU(qc.rejectedQty, qc.itemId))), qc.note ? h('div', {}, 'ملاحظات: ' + qc.note) : null, ncrOf(qc) ? h('div', {}, 'عدم مطابقة: ' + ncrOf(qc)) : null),
        h('div.qa-stamp' + tone, {}, SA.catalog.status.qc[qc.result][0], h('small', {}, final && qc.result !== 'fail' ? 'مطابق للمواصفة المعتمدة' : 'قسم الجودة'))),
      h('div.qa-doc-foot', {}, h('div', {}, h('b', {}, SA.userName(qc.inspectorId)), 'مفتش الجودة'), h('div', {}, h('b', {}, ' '), 'مدير الجودة'), h('div', {}, h('b', {}, ' '), 'ختم المصنع')),
      h('p.qa-doc-note', {}, 'وثيقة صادرة آليًا من نظام المصرية الألمانية — نموذج تجريبي للعرض.'));
  }
  function doPrint() { document.body.classList.add('qa-printing'); const off = () => { document.body.classList.remove('qa-printing'); window.removeEventListener('afterprint', off); }; window.addEventListener('afterprint', off); try { window.print(); } catch (e) { /* noop */ } setTimeout(off, 1500); }
  function qcDetail(root, ctx, id) {
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'فحوصات الجودة', href: '#/mfg/qc' }, { label: id }]);
    let lastRes = null;
    function draw() {
      SA.clear(root); const qc = ERP.find('qcInspections', id);
      if (!qc) { root.append(SA.card({}, SA.empty({ icon: 'search', title: 'الفحص غير موجود', text: id, action: { label: 'قائمة الفحوص', icon: 'arrowright', onClick: () => SA.nav('mfg/qc') } }))); return; }
      lastRes = qc.result; const it = item(qc.itemId);
      const head = SA.pageHead({ title: qc.id + ' — ' + (KIND[qc.kind] || [qc.kind])[0], desc: it.name + ' · ' + qtyU(qc.qty, qc.itemId), back: { label: 'فحوصات الجودة', href: '#/mfg/qc' }, tags: [U.status('qc', qc.result), kindChip(qc.kind)],
        actions: qc.result !== 'pending' ? [SA.btn({ label: 'طباعة', icon: 'download', kind: 'ghost', onClick: doPrint }), ncrOf(qc) ? SA.btn({ label: 'عدم المطابقة ' + ncrOf(qc), icon: 'alert', kind: 'ghost', onClick: () => SA.nav('mfg/ncr/' + ncrOf(qc)) }) : null] : [] });
      const info = SA.card({ title: 'بيانات الدفعة' }, SA.kv([['الصنف', U.itemCell(qc.itemId)], ['المصدر', sourceLine(qc)], ['اللوط', h('span.num', {}, qc.lot || '—')], ['الكمية', qtyU(qc.qty, qc.itemId)], ['العينة المقترحة', num(qc.sample) + ' (√الكمية + 1)'], ['أُنشئ', SA.fmt.dt(qc.createdAt) + ' — ينتظر ' + SA.fmt.rel(qc.createdAt).replace('منذ ', '')]]));
      if (qc.result === 'pending') {
        root.append(head, SA.can('mfg.qc.inspect') ? null : SA.alert('info', 'عرض فقط — تسجيل الفحص يحتاج صلاحية mfg.qc.inspect.'), info);
        if (SA.can('mfg.qc.inspect')) { const fh = h('div'); root.append(fh); recordForm(qc, fh); }
        else root.append(SA.card({ title: 'بنود الفحص' }, miniTable(['البند', 'المواصفة'], (qc.params || []).map((p) => h('tr', {}, td(p.name), td(p.spec))))));
        return;
      }
      const cons = consequences(qc);
      root.append(head, lastRecorded === qc.id ? SA.alert('success', h('b', {}, 'تم اعتماد الفحص — ما حدث تلقائيًا في النظام:'), h('div', { style: { marginTop: '8px' } }, consList(cons))) : null,
        U.grid(2, info, SA.card({ title: 'أثر القرار على المخزون والطلبات' }, consList(cons))), reportDoc(qc));
    }
    draw();
    const off = st.subscribe('qcInspections', () => { const q = ERP.find('qcInspections', id); if (!q || q.result !== lastRes) draw(); });
    return () => { off(); if (lastRecorded === id) lastRecorded = null; };
  }
  function qcRender(root, ctx) { const id = ctx.path && ctx.path[0]; return id ? qcDetail(root, ctx, id) : qcList(root, ctx); }

  /* ═════════════════════════ 3. mfg-ncr ═════════════════════════ */
  function openNcrModal() {
    const tickets = get('tickets'); const grns = get('grns'); const wos = get('workOrders').filter((w) => w.status !== 'planned');
    const refOpts = (src) => (src === 'customer' ? tickets.map((t) => [t.id, t.id + ' — ' + t.title]) : src === 'supplier' ? grns.map((g) => [g.id, g.id + ' — ' + ERP.supplierName(g.supplierId)]) : wos.map((w) => [w.id, w.id + ' — ' + ERP.itemName(w.itemId)]));
    const fSrc = SA.form.field({ name: 'source', label: 'المصدر', type: 'select', value: 'production', options: [['production', 'إنتاج'], ['supplier', 'مورد (استلام)'], ['customer', 'عميل (شكوى)']], onChange: (v) => { fRef.input.replaceChildren(...[['', 'اختر المرجع…']].concat(refOpts(v)).map((o) => h('option', { value: o[0] }, o[1]))); } });
    const fRef = SA.form.field({ name: 'refId', label: 'المرجع (أمر تشغيل / استلام / تذكرة)', type: 'select', required: true, options: [['', 'اختر المرجع…']].concat(refOpts('production')), onChange: (v) => { const src = fSrc.get(); let itId = ''; if (src === 'production') itId = (ERP.find('workOrders', v) || {}).itemId; else if (src === 'supplier') itId = ((ERP.find('grns', v) || {}).lines || [{}])[0].itemId; else itId = (ERP.find('tickets', v) || {}).itemId; if (itId) fItem.set(itId); } });
    const fItem = SA.form.field({ name: 'itemId', label: 'الصنف', type: 'select', required: true, options: [['', 'اختر الصنف…']].concat(get('items').filter((i) => i.kind !== 'spare').map((i) => [i.id, i.code + ' — ' + i.name])) });
    const fQty = SA.form.field({ name: 'qty', label: 'الكمية غير المطابقة', type: 'number', required: true, min: 1 });
    const fDef = SA.form.field({ name: 'defectCode', label: 'العيب', type: 'select', value: 'D03', options: ERP.defectCodes.map((d) => [d.code, d.code + ' — ' + d.label]) });
    const fSev = SA.form.field({ name: 'severity', label: 'الخطورة', type: 'select', value: 'minor', options: [['minor', 'بسيط'], ['major', 'رئيسي'], ['critical', 'حرج']] });
    const fDesc = SA.form.field({ name: 'desc', label: 'الوصف', type: 'textarea', rows: 2 });
    const md = SA.modal({ title: 'فتح عدم مطابقة (NCR)', icon: 'alert', size: 'lg', body: h('div.qa-form-grid', {}, fSrc.el, fRef.el, fItem.el, fQty.el, fDef.el, fSev.el, h('div', { style: { gridColumn: '1 / -1' } }, fDesc.el)),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'فتح عدم المطابقة', icon: 'check', perm: 'mfg.ncr.create', onClick: async () => {
        if (!SA.form.group([fRef, fItem, fQty]).validate()) return; if (!(Number(fQty.get()) > 0)) return fQty.error('أدخل كمية أكبر من صفر');
        const src = fSrc.get(); const refType = src === 'production' ? 'work_order' : src === 'supplier' ? 'grn' : 'ticket';
        let n; try { n = await SA.api(() => F.openNCR({ source: src, refType, refId: fRef.get(), qcId: null, itemId: fItem.get(), qty: Number(fQty.get()), defectCode: fDef.get(), severity: fSev.get(), description: fDesc.get() })); } catch (e) { return SA.fail(e); }
        md.close(); SA.toast('تم فتح ' + n.id, 'success'); SA.nav('mfg/ncr/' + n.id); } })] });
  }
  function ncrList(root, ctx) {
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'الجودة' }, { label: 'عدم المطابقة' }]); const p = ctx.params || {};
    const tbl = SA.table({ rows: () => get('ncrs'), pageSize: 10, initial: { sort: { key: 'openedAt', dir: 'desc' }, filters: { status: p.status || '', source: p.source || '', severity: p.severity || '' } },
      search: { placeholder: 'بحث برقم NCR أو الصنف أو المرجع…', keys: ['id', 'refId', 'capaId', (r) => ERP.itemName(r.itemId), (r) => defLabel(r.defectCode)] },
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(SA.catalog.status.ncr).map((k) => [k, SA.catalog.status.ncr[k][0]]).concat([['open_all', 'كل المفتوح']]), test: (r, v) => (v === 'open_all' ? r.status !== 'closed' : r.status === v) }, { key: 'source', label: 'المصدر', options: Object.keys(SRC).map((k) => [k, SRC[k][0]]) }, { key: 'severity', label: 'الخطورة', options: Object.keys(SEV).map((k) => [k, SEV[k][0]]) }],
      columns: [{ key: 'id', label: 'NCR', sort: true, render: (r) => U.docLink(r.id) }, { key: 'source', label: 'المصدر', render: (r) => srcChip(r.source) }, { key: 'refId', label: 'المرجع', render: (r) => refLink(r.refType, r.refId) },
        { key: 'item', label: 'الصنف', sort: true, value: (r) => ERP.itemName(r.itemId), render: (r) => U.itemCell(r.itemId) }, { key: 'qty', label: 'الكمية', class: 'qa-n', sort: true, render: (r) => qtyU(r.qty, r.itemId) },
        { key: 'defectCode', label: 'العيب', render: (r) => r.defectCode + ' · ' + defLabel(r.defectCode) }, { key: 'severity', label: 'الخطورة', sort: true, value: (r) => ['critical', 'major', 'minor'].indexOf(r.severity), render: (r) => sevChip(r.severity) },
        { key: 'status', label: 'الحالة', sort: true, value: (r) => Object.keys(SA.catalog.status.ncr).indexOf(r.status), render: (r) => h('span.qa-flex', {}, U.status('ncr', r.status), r.pendingDisposition ? SA.chip('بانتظار اعتماد', 'warning') : null) },
        { key: 'disposition', label: 'القرار', render: (r) => (r.disposition ? DISP[r.disposition] : '—') }, { key: 'capaId', label: 'CAPA', render: (r) => (r.capaId ? capaLink(r.capaId) : '—') }, { key: 'openedAt', label: 'فُتح', sort: true, render: (r) => SA.fmt.rel(r.openedAt) }],
      onRowClick: (r) => SA.nav('mfg/ncr/' + r.id), empty: { icon: 'checkcircle', title: 'لا توجد حالات عدم مطابقة' } });
    const sHost = h('div'); const drawS = () => { SA.clear(sHost); const n = get('ncrs'); const o = n.filter((x) => x.status !== 'closed'); sHost.append(h('div.qa-stats', {}, stat('مفتوح', num(o.length), o.length ? 'danger' : 'success'), stat('رئيسي/حرج مفتوح', num(o.filter((x) => x.severity !== 'minor').length), 'danger'), stat('من الموردين', num(o.filter((x) => x.source === 'supplier').length), 'warning'), stat('من العملاء', num(o.filter((x) => x.source === 'customer').length)), stat('بدون CAPA', num(o.filter((x) => !x.capaId).length), 'warning'), stat('أُغلق (الكل)', num(n.filter((x) => x.status === 'closed').length), 'success'))); };
    drawS();
    root.append(SA.pageHead({ title: 'عدم المطابقة (NCR)', desc: 'من الفحص أو من الموردين أو من شكاوى العملاء — تحليل السبب، القرار، والإجراء التصحيحي.', actions: [SA.btn({ label: 'فتح عدم مطابقة', icon: 'plus', perm: 'mfg.ncr.create', onClick: openNcrModal })] }), sHost, tbl.el);
    const off = st.subscribe('ncrs', () => { tbl.refresh(); drawS(); }); return off;
  }
  function openCapaModal(pre) {
    pre = pre || {}; const n = pre.ncrId ? ERP.find('ncrs', pre.ncrId) : null;
    const owners = get('users').filter((u) => ['R-09', 'R-05', 'R-18', 'R-01', 'R-02'].indexOf(u.roleId) >= 0 && u.status === 'active');
    const fT = SA.form.field({ name: 'title', label: 'عنوان الإجراء', required: true, value: pre.title || (n ? 'معالجة ' + defLabel(n.defectCode) + ' — ' + ERP.itemName(n.itemId) : '') });
    const fNcr = SA.form.field({ name: 'ncrId', label: 'عدم المطابقة المرتبط', type: 'select', value: pre.ncrId || '', options: [['', '— بدون —']].concat(get('ncrs').filter((x) => x.status !== 'closed' && !x.capaId || x.id === pre.ncrId).map((x) => [x.id, x.id + ' — ' + defLabel(x.defectCode)])) });
    const fO = SA.form.field({ name: 'ownerId', label: 'المسؤول', type: 'select', value: me(), options: owners.map((u) => [u.id, u.name + ' — ' + SA.roleName(u.roleId)]) });
    const fD = SA.form.field({ name: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date', required: true, value: ERP.day(14) });
    const fR = SA.form.field({ name: 'rootCause', label: 'السبب الجذري', type: 'textarea', rows: 2, value: n ? n.rootCause || '' : '' });
    const fA = SA.form.field({ name: 'actions', label: 'الإجراءات (سطر لكل إجراء)', type: 'textarea', rows: 4, value: pre.actions || '' });
    const md = SA.modal({ title: 'إجراء تصحيحي جديد (CAPA)', icon: 'target', size: 'lg', body: h('div', {}, h('div.qa-form-grid', {}, fT.el, fNcr.el, fO.el, fD.el), fR.el, fA.el),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'فتح الإجراء التصحيحي', icon: 'check', perm: 'mfg.capa.edit', onClick: async () => {
        if (!SA.form.group([fT, fD]).validate()) return; const acts = String(fA.get() || '').split('\n').map((s) => s.trim()).filter(Boolean); if (!acts.length) return fA.error('أضف إجراءً واحدًا على الأقل');
        let c; try { c = await SA.api(() => createCAPA({ title: fT.get(), ncrId: fNcr.get() || null, ownerId: fO.get(), dueDate: fD.get(), rootCause: fR.get(), actions: acts })); } catch (e) { return SA.fail(e); }
        md.close(); SA.toast('تم فتح ' + c.id, 'success'); if (!pre.stay) SA.nav('mfg/capa/' + c.id); } })] });
  }
  function ncrDetailBuild(id) {
    const n = ERP.find('ncrs', id); if (!n) return SA.card({}, SA.empty({ icon: 'search', title: 'عدم المطابقة غير موجود', text: id, action: { label: 'كل الحالات', icon: 'arrowright', onClick: () => SA.nav('mfg/ncr') } }));
    const capa = n.capaId ? ERP.find('capas', n.capaId) : null; const qc = n.qcId ? ERP.find('qcInspections', n.qcId) : null; const steps = ['open', 'investigating', 'dispositioned', 'closed']; const idx = steps.indexOf(n.status);
    const ap = n.approvalId ? ERP.find('approvals', n.approvalId) : null; const qrt = K.qty(n.itemId, K.QRT);
    const srcInfo = n.source === 'production' ? (() => { const wo = ERP.find('workOrders', n.refId); return [['أمر التشغيل', h('span', {}, U.docLink(n.refId), wo ? ' — ' + wo.lineId + ' · ' + (wo.lot || '') : '')]]; })()
      : n.source === 'supplier' ? (() => { const g = ERP.find('grns', n.refId); return [['إذن الاستلام', U.docLink(n.refId)], ['المورد', g ? ERP.supplierName(g.supplierId) : '—']]; })()
        : (() => { const t = ERP.find('tickets', n.refId); return [['شكوى العميل', U.docLink(n.refId)], ['العميل', t ? ERP.customerName(t.customerId) : '—']]; })();
    const canDo = SA.can('mfg.ncr.approve'); const editable = ['open', 'investigating'].indexOf(n.status) >= 0;
    // 5-why
    const whys = (n.whys || ['', '', '', '', '']).slice(0, 5); while (whys.length < 5) whys.push('');
    const wIn = whys.map((w, i) => h('input.input', { value: w, placeholder: 'لماذا ' + (i + 1) + '؟', 'aria-label': 'لماذا ' + (i + 1), disabled: !editable || !SA.can('mfg.ncr.create') }));
    const rcIn = h('textarea.textarea', { rows: 2, 'aria-label': 'السبب الجذري', disabled: !editable || !SA.can('mfg.ncr.create') }, n.rootCause || '');
    const whyCard = SA.card({ title: 'تحليل السبب الجذري (5 لماذا)' }, wIn.map((x, i) => h('div.qa-why', {}, h('span', {}, String(i + 1)), x)), h('label.field', {}, h('span.label', {}, 'السبب الجذري المعتمد'), rcIn),
      editable ? SA.btn({ label: 'حفظ التحليل', icon: 'check', kind: 'ghost', perm: 'mfg.ncr.create', onClick: async () => { const rc = rcIn.value.trim(); if (rc.length < 3) return SA.toast('اكتب السبب الجذري', 'warn'); try { await SA.api(() => saveRootCause(id, wIn.map((x) => x.value.trim()), rc)); } catch (e) { return SA.fail(e); } SA.toast('تم حفظ تحليل السبب' + (n.status === 'open' ? ' — الحالة: قيد التحقيق' : ''), 'success'); } }) : null);
    // disposition
    let dispCard;
    if (n.disposition) dispCard = SA.card({ title: 'القرار' }, SA.kv([['القرار', h('b', {}, DISP[n.disposition])], ['الكمية المنقولة', n.dispositionQty != null ? qtyU(n.dispositionQty, n.itemId) : '—'], ['بواسطة', n.dispositionedBy ? SA.userName(n.dispositionedBy) + ' · ' + SA.fmt.dt(n.dispositionedAt) : '—'], ['المبرر', n.dispositionNote || '—']]));
    else if (n.pendingDisposition) dispCard = SA.card({ title: 'القرار' }, SA.alert('warning', 'قرار «' + DISP[n.pendingDisposition] + '» على عدم مطابقة ' + (SEV[n.severity] || [''])[0] + ' بانتظار اعتماد المدير العام ', ap ? h('a.erp-doc', { href: '#/approvals/' + ap.id }, ap.id) : '', '.'));
    else {
      const opts = Object.keys(DISP).filter((k) => k !== 'return_to_supplier' || n.source === 'supplier').map((k) => [k, DISP[k], k === 'use_as_is' && n.severity !== 'minor' ? 'يحتاج اعتماد المدير العام' : k === 'rework' ? 'نقل من الحجر لتحت التشغيل' : k === 'scrap' ? 'خصم من الحجر كخردة' : k === 'return_to_supplier' ? 'خصم من الحجر وإخطار المشتريات' : 'إعادة للمخزن']);
      const fD = SA.form.field({ name: 'disp', label: 'القرار', type: 'radio', options: opts }); const fN = SA.form.field({ name: 'note', label: 'المبرر', type: 'textarea', rows: 2, required: true });
      dispCard = SA.card({ title: 'القرار (Disposition)' }, h('p.qa-muted', {}, 'رصيد الحجر لهذا الصنف: ' + qtyU(qrt, n.itemId)), fD.el, fN.el, SA.btn({ label: 'اعتماد القرار', icon: 'check', perm: 'mfg.ncr.approve', onClick: async () => {
        const d = fD.get(); if (!d) return fD.error('اختر القرار'); if (!fN.validate()) return;
        const r = await SA.confirm({ title: 'قرار ' + DISP[d] + ' — ' + id, icon: 'alert', danger: d === 'scrap', confirmLabel: 'اعتماد', impact: [qtyU(Math.min(n.qty, qrt), n.itemId) + ' من منطقة الحجر' + (d === 'scrap' ? ' تُعدم' : d === 'rework' ? ' إلى تحت التشغيل' : d === 'use_as_is' ? ' إلى المخزن' : ' مرتجع للمورد'), d === 'use_as_is' && n.severity !== 'minor' ? 'عدم مطابقة ' + SEV[n.severity][0] + ' ← طلب اعتماد للمدير العام قبل التنفيذ' : 'يُسجّل NCR.DISPOSITIONED'] });
        if (!r.ok) return; let res; try { res = await SA.api(() => disposition(id, d, fN.get())); } catch (e) { return SA.fail(e); }
        SA.toast(res && res.pending ? 'أُرسل للاعتماد ' + res.pending : 'تم اعتماد القرار: ' + DISP[d], 'success'); } }));
    }
    const capaCard = SA.card({ title: 'الإجراء التصحيحي (CAPA)' }, capa ? h('div', {}, h('div.qa-flex', {}, capaLink(capa.id), U.status('capa', capa.status), capaOverdue(capa) ? SA.chip('متأخر', 'danger') : null), h('p', { style: { margin: '8px 0' } }, capa.title), CH.meter(capaProg(capa), { label: (capa.actions || []).filter((a) => a.done).length + ' من ' + (capa.actions || []).length + ' إجراءات · الاستحقاق ' + ERP.fmt.date(capa.dueDate), text: Math.round(capaProg(capa) * 100) + '%' }))
      : h('div', {}, h('p.qa-muted', {}, n.severity === 'minor' ? 'غير إلزامي للحالات البسيطة.' : 'عدم مطابقة ' + (SEV[n.severity] || [''])[0] + ' — يُنصح بفتح إجراء تصحيحي.'), SA.btn({ label: 'إنشاء إجراء تصحيحي', icon: 'plus', kind: 'ghost', perm: 'mfg.capa.edit', reason: n.status === 'closed' ? 'الحالة مغلقة' : '', onClick: () => openCapaModal({ ncrId: id, stay: true }) })));
    const trail = get('audit').filter((a) => a.target && a.target.id === id).slice(0, 10);
    const closeBtn = n.status === 'dispositioned' ? SA.btn({ label: 'إغلاق عدم المطابقة', icon: 'checkcircle', perm: 'mfg.ncr.approve', onClick: async () => { const r = await SA.confirm({ title: 'إغلاق ' + id, icon: 'checkcircle', reason: true, reasonLabel: 'ملاحظة الإغلاق', confirmLabel: 'إغلاق', warnings: capa && capa.status !== 'closed' ? ['الإجراء التصحيحي ' + capa.id + ' ما زال ' + SA.catalog.status.capa[capa.status][0] + ' — سيُتابَع منفصلًا.'] : [], impact: ['الحالة: تم القرار ← مغلق', 'يُسجّل NCR.CLOSED'] }); if (!r.ok) return; try { await SA.api(() => closeNCR(id, r.reason)); } catch (e) { return SA.fail(e); } SA.toast('تم إغلاق ' + id, 'success'); } }) : null;
    return h('div', {}, SA.pageHead({ title: n.id + ' — ' + defLabel(n.defectCode), desc: ERP.itemName(n.itemId) + ' · ' + qtyU(n.qty, n.itemId), back: { label: 'عدم المطابقة', href: '#/mfg/ncr' }, tags: [U.status('ncr', n.status), sevChip(n.severity), srcChip(n.source)], actions: [closeBtn] }),
      SA.card({}, SA.stepper(['مفتوح', 'قيد التحقيق', 'تم القرار', 'مغلق'], n.status === 'closed' ? 4 : idx)),
      U.grid(2, SA.card({ title: 'التفاصيل' }, SA.kv([['الصنف', U.itemCell(n.itemId)], ['الكمية', qtyU(n.qty, n.itemId)], ['العيب', n.defectCode + ' — ' + defLabel(n.defectCode)]].concat(srcInfo, [qc ? ['تقرير الفحص', h('span', {}, U.docLink(qc.id), ' ', U.status('qc', qc.result))] : null, ['فُتح', SA.fmt.dt(n.openedAt) + ' — ' + SA.userName(n.openedBy)], ['رصيد الحجر', qtyU(qrt, n.itemId)], ['تكلفة عدم المطابقة', U.cost(n.qty * (item(n.itemId).stdCost || 0))], n.description ? ['الوصف', n.description] : null, n.closedAt ? ['أُغلق', SA.fmt.dt(n.closedAt)] : null]))), whyCard),
      U.grid(2, dispCard, h('div.qa-col', {}, capaCard, SA.card({ title: 'سجل الأحداث' }, trail.length ? h('ul.qa-cons', {}, trail.map((a) => h('li', {}, h('span.qa-cons-ico', {}, SA.icon('history', 'icon-sm')), h('span', {}, h('b', {}, (SA.catalog.auditByCode[a.code] || {}).label || a.code), a.reason ? ' — ' + a.reason : '', h('small.qa-muted', { style: { display: 'block' } }, (a.actor ? a.actor.name : '') + ' · ' + SA.fmt.rel(a.ts)))))) : h('p.qa-muted', {}, 'لا أحداث بعد.')))));
  }
  function ncrRender(root, ctx) {
    const id = ctx.path && ctx.path[0]; if (!id) return ncrList(root, ctx);
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'عدم المطابقة', href: '#/mfg/ncr' }, { label: id }]);
    return SA.live(root, () => ncrDetailBuild(id), ['ncrs', 'capas', 'approvals']);
  }

  /* ═════════════════════════ 4. mfg-capa ═════════════════════════ */
  function capaList(root, ctx) {
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'الجودة' }, { label: 'الإجراءات التصحيحية' }]);
    const tbl = SA.table({ rows: () => get('capas'), pageSize: 10, initial: { sort: { key: 'dueDate', dir: 'asc' }, filters: { status: (ctx.params && ctx.params.status) || '' } }, search: { placeholder: 'بحث بالرقم أو العنوان…', keys: ['id', 'title', (r) => (r.ncrIds || []).join(' ')] },
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(SA.catalog.status.capa).map((k) => [k, SA.catalog.status.capa[k][0]]).concat([['overdue', 'متأخر']]), test: (r, v) => (v === 'overdue' ? capaOverdue(r) : r.status === v) }, { key: 'ownerId', label: 'المسؤول', options: Array.from(new Set(get('capas').map((c) => c.ownerId))).map((u) => [u, SA.userName(u)]) }],
      columns: [{ key: 'id', label: 'CAPA', sort: true, render: (r) => capaLink(r.id) }, { key: 'title', label: 'العنوان', sort: true }, { key: 'ncr', label: 'عدم المطابقة', render: (r) => ((r.ncrIds || []).length ? h('span', {}, r.ncrIds.map((x) => [U.docLink(x), ' '])) : '—') },
        { key: 'ownerId', label: 'المسؤول', render: (r) => SA.userName(r.ownerId) }, { key: 'prog', label: 'التقدم', sort: true, value: capaProg, render: (r) => h('div', { style: { minWidth: '120px' } }, CH.meter(capaProg(r), { label: (r.actions || []).filter((a) => a.done).length + '/' + (r.actions || []).length, text: Math.round(capaProg(r) * 100) + '%', tone: 'primary' })) },
        { key: 'dueDate', label: 'الاستحقاق', sort: true, render: (r) => h('span', {}, ERP.fmt.date(r.dueDate), capaOverdue(r) ? ' ' : null, capaOverdue(r) ? SA.chip('متأخر', 'danger') : null) }, { key: 'status', label: 'الحالة', sort: true, render: (r) => U.status('capa', r.status) }],
      onRowClick: (r) => SA.nav('mfg/capa/' + r.id), empty: { icon: 'target', title: 'لا توجد إجراءات تصحيحية', action: { label: 'إجراء تصحيحي جديد', perm: 'mfg.capa.edit', onClick: () => openCapaModal() } } });
    root.append(SA.pageHead({ title: 'الإجراءات التصحيحية والوقائية (CAPA)', desc: 'لكل عدم مطابقة رئيسي: سبب جذري، إجراءات بمسؤول وموعد، ثم التحقق من الفعالية قبل الإغلاق.', actions: [SA.btn({ label: 'إجراء تصحيحي جديد', icon: 'plus', perm: 'mfg.capa.edit', onClick: () => openCapaModal() })] }), tbl.el);
    const off = st.subscribe('capas', () => tbl.refresh()); return off;
  }
  function capaDetailBuild(id) {
    const c = ERP.find('capas', id); if (!c) return SA.card({}, SA.empty({ icon: 'search', title: 'الإجراء غير موجود', text: id, action: { label: 'كل الإجراءات', icon: 'arrowright', onClick: () => SA.nav('mfg/capa') } }));
    const can = SA.can('mfg.capa.edit') && c.status !== 'closed'; const acts = c.actions || [];
    const list = h('ul.qa-check', {}, acts.map((a, i) => h('li' + (a.done ? '.is-done' : ''), {}, h('button.qa-tick', { type: 'button', 'aria-label': (a.done ? 'إلغاء إتمام: ' : 'إتمام: ') + a.text, 'aria-pressed': a.done ? 'true' : 'false', 'aria-disabled': can ? null : 'true', onclick: async () => { if (!can) return SA.toast(c.status === 'closed' ? 'الإجراء مغلق' : 'ليست من صلاحياتك (mfg.capa.edit)', 'warn'); try { await SA.api(() => toggleAction(id, i), { ms: 150 }); } catch (e) { return SA.fail(e); } } }, a.done ? SA.icon('check', 'icon-sm') : null),
      h('span.qa-check-t', {}, a.text), a.done && a.doneBy ? h('small', {}, SA.userName(a.doneBy) + ' · ' + SA.fmt.rel(a.doneAt)) : null)));
    const addIn = h('input.input', { placeholder: 'إجراء جديد…', 'aria-label': 'إجراء جديد' });
    const addRow = can ? h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } }, addIn, SA.btn({ label: 'إضافة', icon: 'plus', kind: 'ghost', perm: 'mfg.capa.edit', onClick: async () => { const t = addIn.value.trim(); if (t.length < 3) return SA.toast('اكتب الإجراء', 'warn'); try { await SA.api(() => addAction(id, t), { ms: 150 }); } catch (e) { return SA.fail(e); } } })) : null;
    let verify = null;
    if (c.status === 'verifying' || (c.status !== 'closed' && acts.length && acts.every((a) => a.done))) {
      const fE = SA.form.field({ name: 'eff', label: 'نتيجة التحقق من الفعالية', type: 'radio', options: [['yes', 'فعّال', 'لم يتكرر العيب في فترة المتابعة — إغلاق'], ['no', 'غير فعّال', 'العيب تكرر — إجراء إضافي ويبقى مفتوحًا']] });
      const fN = SA.form.field({ name: 'note', label: 'الدليل (قياسات/فترة المتابعة)', type: 'textarea', rows: 2, required: true });
      verify = SA.card({ title: 'التحقق من الفعالية' }, fE.el, fN.el, SA.btn({ label: 'اعتماد نتيجة التحقق', icon: 'check', perm: 'mfg.capa.edit', onClick: async () => { const e = fE.get(); if (!e) return fE.error('اختر النتيجة'); if (!fN.validate()) return;
        const r = await SA.confirm({ title: e === 'yes' ? 'إغلاق ' + id : 'إعادة فتح ' + id, icon: e === 'yes' ? 'checkcircle' : 'alert', confirmLabel: e === 'yes' ? 'إغلاق الإجراء' : 'تسجيل وإضافة إجراء', impact: e === 'yes' ? ['الحالة ← مغلق (فعّال)', 'يُسجّل CAPA.CLOSED'] : ['الحالة ← قيد التنفيذ', 'إضافة إجراء جديد للمتابعة'] }); if (!r.ok) return;
        try { await SA.api(() => closeCAPA(id, e === 'yes', fN.get())); } catch (er) { return SA.fail(er); } SA.toast(e === 'yes' ? 'تم إغلاق ' + id : id + ' عاد للتنفيذ', 'success'); } }));
    }
    const ncrs = (c.ncrIds || []).map((x) => ERP.find('ncrs', x)).filter(Boolean);
    return h('div', {}, SA.pageHead({ title: c.id + ' — ' + c.title, desc: 'المسؤول ' + SA.userName(c.ownerId) + ' · الاستحقاق ' + ERP.fmt.date(c.dueDate) + ' (' + inDays(daysTo(c.dueDate)) + ')', back: { label: 'الإجراءات التصحيحية', href: '#/mfg/capa' }, tags: [U.status('capa', c.status), capaOverdue(c) ? SA.chip('متأخر', 'danger') : null, c.effective ? SA.chip('فعّال', 'success') : null],
      actions: [c.status === 'open' ? SA.btn({ label: 'بدء التنفيذ', icon: 'play', perm: 'mfg.capa.edit', onClick: async () => { try { await SA.api(() => { st.patch('capas', id, { status: 'in_progress', startedAt: ERP.now() }); SA.audit('CAPA.UPDATED', { target: { type: 'capa', id, label: c.title }, before: { status: 'open' }, after: { status: 'in_progress' } }); }); } catch (e) { return SA.fail(e); } SA.toast(id + ' قيد التنفيذ', 'success'); } }) : null] }),
      SA.card({}, SA.stepper(['مفتوح', 'قيد التنفيذ', 'التحقق من الفعالية', 'مغلق'], c.status === 'closed' ? 4 : ['open', 'in_progress', 'verifying'].indexOf(c.status))),
      U.grid(2, SA.card({ title: 'خطة الإجراءات', tags: [h('span.sap-count', {}, acts.filter((a) => a.done).length + '/' + acts.length)] }, CH.meter(capaProg(c), { label: 'نسبة الإنجاز', text: Math.round(capaProg(c) * 100) + '%' }), h('div', { style: { marginTop: '12px' } }, list), addRow),
        h('div.qa-col', {}, SA.card({ title: 'البيانات' }, SA.kv([['السبب الجذري', c.rootCause || '—'], ['عدم المطابقة', ncrs.length ? h('span', {}, ncrs.map((x) => [U.docLink(x.id), ' ', U.status('ncr', x.status), ' '])) : '—'], ['فُتح', SA.fmt.dt(c.openedAt) + (c.openedBy ? ' — ' + SA.userName(c.openedBy) : '')], c.closedAt ? ['أُغلق', SA.fmt.dt(c.closedAt)] : null, c.verification ? ['التحقق', (c.verification.failed ? 'غير فعّال — ' : 'فعّال — ') + c.verification.note + ' (' + SA.userName(c.verification.by) + ')'] : null])), verify)));
  }
  function capaRender(root, ctx) {
    const id = ctx.path && ctx.path[0]; if (!id) return capaList(root, ctx);
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'الإجراءات التصحيحية', href: '#/mfg/capa' }, { label: id }]);
    return SA.live(root, () => capaDetailBuild(id), ['capas', 'ncrs']);
  }

  /* ═════════════════════════ 5. mfg-certs ═════════════════════════ */
  function uiEditCert(id) {
    const c = ERP.find('certs', id); if (!c) return;
    const fB = SA.form.field({ name: 'body', label: 'الجهة المانحة', value: c.body }); const fI = SA.form.field({ name: 'issued', label: 'تاريخ الإصدار', type: 'date', value: c.issued, required: true });
    const fE = SA.form.field({ name: 'expires', label: 'تاريخ الانتهاء', type: 'date', value: c.expires, required: true }); const fA = SA.form.field({ name: 'nextAudit', label: 'التدقيق القادم', type: 'date', value: c.nextAudit });
    const fN = SA.form.field({ name: 'note', label: 'ملاحظة', type: 'textarea', rows: 2, value: c.note || '' });
    const md = SA.modal({ title: 'تعديل ' + c.name, icon: 'award', size: 'md', body: h('div', {}, fB.el, h('div.qa-form-grid', {}, fI.el, fE.el, fA.el), fN.el, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'بيانات الجهات المانحة في النموذج تجريبية — تُستبدل بالشهادات الفعلية.'))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'حفظ', icon: 'check', perm: 'mfg.certs.edit', onClick: async () => {
        if (!SA.form.group([fI, fE]).validate()) return; if (fE.get() <= fI.get()) return fE.error('تاريخ الانتهاء بعد الإصدار');
        const p = {}; [['body', fB], ['issued', fI], ['expires', fE], ['nextAudit', fA], ['note', fN]].forEach((x) => { const v = x[1].get(); if ((c[x[0]] || '') !== (v || '')) p[x[0]] = v; });
        if (!Object.keys(p).length) return md.close(); p.status = certState(Object.assign({}, c, p));
        try { await SA.api(() => updateCert(id, p, 'تعديل بيانات الشهادة')); } catch (e) { return SA.fail(e); } md.close(); SA.toast('تم تحديث ' + c.name, 'success'); } })] });
  }
  function certsBuild() {
    const certs = get('certs'); const can = SA.can('mfg.certs.edit');
    const dates = certs.reduce((a, c) => a.concat([c.issued, c.expires]), [today()]).filter(Boolean).sort(); const y0 = Number(dates[0].slice(0, 4)), y1 = Number(dates[dates.length - 1].slice(0, 4)) + 1;
    const t0 = new Date(y0 + '-01-01T12:00:00').getTime(), t1 = new Date(y1 + '-01-01T12:00:00').getTime(); const P = (ds) => Math.max(0, Math.min(100, ((new Date(ds + 'T12:00:00').getTime() - t0) / (t1 - t0)) * 100));
    const years = []; for (let y = y0; y <= y1; y++) years.push(y);
    const axis = h('div.qa-tl-row', {}, h('span'), h('div.qa-tl-axis.num', {}, years.map((y) => h('span', { style: { insetInlineStart: P(y + '-01-01') + '%' } }, String(y)))));
    const tlRows = certs.map((c) => { const s = certState(c); return h('div.qa-tl-row', {}, h('b', {}, c.name.split(' — ')[0]), h('div.qa-tl-track', {}, h('div.qa-tl-bar.is-' + s, { title: ERP.fmt.date(c.issued) + ' ← ' + ERP.fmt.date(c.expires), style: { insetInlineStart: P(c.issued) + '%', width: Math.max(1, P(c.expires) - P(c.issued)) + '%' } }), c.nextAudit ? h('span.qa-tl-audit', { title: 'التدقيق القادم ' + ERP.fmt.date(c.nextAudit), style: { insetInlineStart: P(c.nextAudit) + '%' } }) : null, h('span.qa-tl-today', { style: { insetInlineStart: P(today()) + '%' } }))); });
    const tl = SA.card({ title: 'مخطط صلاحية الشهادات' }, h('div.qa-tl', {}, axis, tlRows), h('p.qa-muted', {}, 'الشريط من الإصدار إلى الانتهاء · الدائرة = موعد التدقيق القادم · الخط الأحمر = اليوم.'));
    const cards = h('div.qa-certs', {}, certs.map((c) => { const s = certState(c); const dE = daysTo(c.expires), dA = daysTo(c.nextAudit); const cl = c.checklist || []; const done = cl.filter((x) => x.done).length;
      return h('div.card.qa-cert.is-' + s, {}, h('div.qa-cert-head', {}, h('span.qa-cert-ico', {}, SA.icon('award')), h('div', { style: { flex: '1' } }, h('b', {}, c.name), h('small', {}, c.body + ' · صادرة ' + ERP.fmt.date(c.issued))), SA.chip(CERT_ST[s][0], CERT_ST[s][1])),
        s !== 'valid' ? SA.alert(s === 'expired' ? 'danger' : 'warning', s === 'expired' ? 'الشهادة منتهية منذ ' + -dE + ' يوم.' : 'تنتهي خلال ' + dE + ' يوم — جهّز ملف التجديد.') : null,
        h('div.qa-count', {}, h('div' + (dE <= 90 ? '.is-warning' : ''), {}, h('b.num', {}, String(dE)), h('small', {}, 'يوم على الانتهاء')), h('div' + (dA != null && dA <= 30 ? '.is-warning' : ''), {}, h('b.num', {}, dA == null ? '—' : String(dA)), h('small', {}, 'يوم على التدقيق'))),
        CH.meter(cl.length ? done / cl.length : 0, { label: 'جاهزية التدقيق ' + done + '/' + cl.length, text: cl.length ? Math.round((done / cl.length) * 100) + '%' : '—' }),
        h('ul.qa-check', {}, cl.map((x, i) => h('li' + (x.done ? '.is-done' : ''), {}, h('button.qa-tick', { type: 'button', 'aria-pressed': x.done ? 'true' : 'false', 'aria-label': x.text, 'aria-disabled': can ? null : 'true', onclick: async () => { if (!can) return SA.toast('ليست من صلاحياتك (mfg.certs.edit)', 'warn'); try { await SA.api(() => toggleCheck(c.id, i), { ms: 150 }); } catch (e) { return SA.fail(e); } } }, x.done ? SA.icon('check', 'icon-sm') : null), h('span.qa-check-t', {}, x.text)))),
        h('div.qa-flex', {}, SA.btn({ label: 'تعديل', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'mfg.certs.edit', onClick: () => uiEditCert(c.id) }), c.updatedAt ? h('small.qa-muted', {}, 'آخر تحديث ' + SA.fmt.rel(c.updatedAt) + ' — ' + SA.userName(c.updatedBy)) : null)); }));
    const nextA = certs.filter((c) => c.nextAudit && c.nextAudit >= today()).sort((a, b) => (a.nextAudit < b.nextAudit ? -1 : 1))[0]; const allCl = certs.reduce((a, c) => a.concat(c.checklist || []), []);
    return h('div', {}, SA.pageHead({ title: 'الشهادات والمعايير', desc: 'ISO 9001 · ISO 14001 · «صنع في مصر» — الصلاحية، التدقيق القادم، وقائمة الجاهزية.', tags: [U.demo('الجهات والتواريخ تجريبية')] }),
      h('div.qa-stats', {}, stat('سارية', num(certs.filter((c) => certState(c) === 'valid').length), 'success'), stat('تنتهي خلال 90 يوم', num(certs.filter((c) => certState(c) === 'expiring').length), 'warning'), stat('منتهية', num(certs.filter((c) => certState(c) === 'expired').length), certs.some((c) => certState(c) === 'expired') ? 'danger' : null), stat('أقرب تدقيق', nextA ? inDays(daysTo(nextA.nextAudit)) : '—'), stat('جاهزية التدقيق', allCl.length ? Math.round((allCl.filter((x) => x.done).length / allCl.length) * 100) + '%' : '—')),
      cards, tl);
  }
  function certsRender(root, ctx) { ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'الجودة' }, { label: 'الشهادات' }]); return SA.live(root, certsBuild, ['certs']); }

  /* ═════════════════════════ register ═════════════════════════ */
  const R = (o) => SA.register(Object.assign({ app: 'mfg', group: 'mfg-qa', moduleKey: MOD }, o));
  R({ id: 'mfg-quality', title: 'لوحة الجودة', icon: 'award', route: 'mfg/quality', perm: 'mfg.quality.view', order: 70, desc: 'FPY والعيوب والموردين', render: qualityRender });
  R({ id: 'mfg-qc', title: 'فحوصات الجودة', icon: 'checkcircle', route: 'mfg/qc', perm: 'mfg.qc.view', order: 71, desc: 'فحص الاستلام والفحص النهائي', render: qcRender, badge() { const n = get('qcInspections').filter((q) => q.result === 'pending').length; return n || null; } });
  R({ id: 'mfg-ncr', title: 'عدم المطابقة', icon: 'alert', route: 'mfg/ncr', perm: 'mfg.ncr.view', order: 72, desc: 'NCR — السبب والقرار', render: ncrRender, badge() { const n = get('ncrs').filter((x) => x.status === 'open' || x.status === 'investigating').length; return n || null; } });
  R({ id: 'mfg-capa', title: 'الإجراءات التصحيحية', icon: 'target', route: 'mfg/capa', perm: 'mfg.capa.view', order: 73, desc: 'CAPA والتحقق من الفعالية', render: capaRender, badge() { const n = get('capas').filter(capaOverdue).length; return n || null; } });
  R({ id: 'mfg-certs', title: 'الشهادات والمعايير', icon: 'award', route: 'mfg/certs', perm: 'mfg.certs.view', order: 74, desc: 'ISO والصلاحية والتدقيق', render: certsRender, badge() { const n = get('certs').filter((c) => certState(c) !== 'valid').length; return n || null; } });

  if (SA.search && SA.search.register) SA.search.register({ id: 'mfg-qa', label: 'الجودة', perm: 'mfg.qc.view', query(q) { q = String(q || '').toLowerCase(); if (q.length < 2) return [];
    const a = get('qcInspections').filter((x) => (x.id + ' ' + ERP.itemName(x.itemId) + ' ' + (x.lot || '')).toLowerCase().indexOf(q) >= 0).slice(0, 4).map((x) => ({ title: x.id + ' — ' + ERP.itemName(x.itemId), sub: SA.catalog.status.qc[x.result][0], icon: 'checkcircle', route: 'mfg/qc/' + x.id }));
    const b = get('ncrs').filter((x) => (x.id + ' ' + ERP.itemName(x.itemId) + ' ' + defLabel(x.defectCode)).toLowerCase().indexOf(q) >= 0).slice(0, 4).map((x) => ({ title: x.id + ' — ' + defLabel(x.defectCode), sub: ERP.itemName(x.itemId) + ' · ' + SA.catalog.status.ncr[x.status][0], icon: 'alert', route: 'mfg/ncr/' + x.id }));
    return a.concat(b); } });

  ERP.qa = { consequences, disposition, applyDisposition, closeNCR, createCAPA, toggleAction, addAction, closeCAPA, saveRootCause, updateCert, toggleCheck, nextCapaId };
})();
