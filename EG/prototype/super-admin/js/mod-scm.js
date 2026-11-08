/* EG ERP prototype — mod-scm.js  (المشتريات والمخازن — app 'scm', nav groups scm-dash · scm-buy · scm-inv)
   Routes (erp-core ROUTE CONTRACT):
     scm/dashboard · scm/requisitions[?q=PRQ-id&status=] · scm/rfq[/RFQ-id][?new=1&prq=&item=] · scm/po[/PS-id][?status=open|…&supplier=&late=1&new=1] · scm/suppliers[/S-id]
     scm/grn[/GRN-id] · scm/stock[/IT-id][?kind=&wh=&below=1&q=] · scm/moves[?type=&wh=&item=] · scm/transfers[?tab=quarantine&q=ST-id] · scm/counts[/CNT-id]
   (scm-log — deliveries/dispatch/shipments/fleet — is mod-logistics.js.)
   Private collections (ERP.addSeed 'scm'): rfqs[] (RFQ-) · transfers[] (ST-) · counts[] (CNT-) · supHistory[] (12-month supplier delivery history used by the scorecards).
   Additive seed on shared data: stockMoves history (45 days, consistent with current balances) · late PO from S-005 partially received + its GRN pending incoming QC
   · suppliers S-011 (local décor-film alternative) and S-012 (China, prospect) used by the film RFQ.
   Business actions: ERP.flow.createPRQ / createPO / submitPO / sendPO / receivePO · ERP.stock.move / transfer.
   New audit codes (area scm): PRQ.REJECTED · PO.UPDATED · PO.CANCELLED · RFQ.CREATED · RFQ.QUOTED · RFQ.AWARDED · SUPPLIER.RATED · COUNT.CREATED · COUNT.SUBMITTED.
   Cost rule: anything derived from std costs (stock value, variance value, consumption value) only via ERP.ui.cost / data.cost.view.
   Purchase prices (PO/RFQ/bills) are shown to purchasing & finance (scm.po.create | scm.po.approve | fin.bills.view | data.cost.view) and hidden from warehouse staff. */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP; if (!SA || !ERP) return;
  const h = SA.h, st = SA.store, C = SA.catalog, K = ERP.stock, F = ERP.flow, U = ERP.ui, fmt = ERP.fmt, CH = ERP.chart;
  const DAY = 86400000;

  /* ═════════════ catalog additions ═════════════ */
  [['PRQ.REJECTED', 'رفض طلب شراء', 'medium'], ['PO.UPDATED', 'تعديل أمر شراء (مسودة)', 'info'], ['PO.CANCELLED', 'إلغاء أمر شراء', 'medium'], ['RFQ.CREATED', 'طلب عروض أسعار من الموردين', 'info'],
    ['RFQ.QUOTED', 'تسجيل عرض سعر مورد', 'info'], ['RFQ.AWARDED', 'ترسية عرض سعر وإنشاء أمر شراء', 'medium'], ['SUPPLIER.RATED', 'تعديل تقييم مورد', 'medium'], ['COUNT.CREATED', 'بدء جلسة جرد', 'info'],
    ['COUNT.SUBMITTED', 'إنهاء العد وإرسال الجرد للمراجعة', 'info']].forEach((a) => C.addAudit(a[0], a[1], a[2], 'scm'));
  if (!C.status.rfq) C.status.rfq = { draft: ['مسودة', 'neutral'], sent: ['بانتظار عروض الموردين', 'info'], evaluating: ['قيد المقارنة', 'warning'], awarded: ['تمت الترسية', 'success'], cancelled: ['ملغى', 'neutral'] };
  if (!C.status.stcount) C.status.stcount = { counting: ['جاري العد', 'info'], review: ['بانتظار المراجعة والترحيل', 'warning'], posted: ['مُرحّل', 'success'], cancelled: ['ملغى', 'neutral'] };

  /* ═════════════ styles ═════════════ */
  (function () {
    if (document.querySelector('style[data-mod="scm"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'scm');
    s.textContent = `
.pinv-sup { display: flex; flex-direction: column; line-height: 1.35; min-width: 0; } .pinv-sup b { font-weight: 600; font-size: var(--text-dense); } .pinv-sup small { color: var(--color-text-muted); font-size: 11.5px; }
.pinv-pos { color: var(--color-success); font-weight: 700; } .pinv-neg { color: var(--color-danger); font-weight: 700; } .pinv-muted { color: var(--color-text-muted); font-size: 12px; }
.pinv-cell { display: flex; flex-direction: column; gap: 2px; line-height: 1.35; } .pinv-cell small { color: var(--color-text-muted); font-size: 11.5px; }
tr:has(.pinv-hl) > td { background: var(--color-warning-tint) !important; }
.pinv-hl { display: inline-flex; align-items: center; gap: 4px; font: 700 10.5px var(--font-ar); color: var(--color-warning); }
.pinv-attn { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.pinv-attn li { display: flex; gap: 12px; align-items: flex-start; padding: 11px 0; border-bottom: 1px solid var(--color-border); } .pinv-attn li:last-child { border-bottom: 0; }
.pinv-attn-ico { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; flex: none; background: var(--color-primary-tint); color: var(--eg-navy); }
.pinv-attn-ico.is-danger { background: var(--color-danger-tint); color: var(--color-danger); } .pinv-attn-ico.is-warning { background: var(--color-warning-tint); color: var(--color-warning); } .pinv-attn-ico.is-success { background: var(--color-success-tint); color: var(--color-success); }
.pinv-attn-b { flex: 1; min-width: 0; } .pinv-attn-b b { display: block; font-size: var(--text-dense); } .pinv-attn-b p { margin: 2px 0 0; color: var(--color-text-muted); font-size: 12.5px; line-height: 1.65; }
.pinv-attn-a { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.pinv-tl { list-style: none; margin: 0; padding: 4px 0; display: flex; overflow-x: auto; }
.pinv-tl li { flex: 1 0 104px; position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 3px; font-size: 12px; }
.pinv-tl li::before { content: ""; position: absolute; top: 10px; inset-inline-start: 50%; width: 100%; height: 2px; background: var(--color-border); } .pinv-tl li:last-child::before { display: none; }
.pinv-tl li.is-done::before { background: var(--color-success); }
.pinv-tl i { width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 3px solid var(--color-border-strong); position: relative; z-index: 1; }
.pinv-tl .is-done i { background: var(--color-success); border-color: var(--color-success); } .pinv-tl .is-now i { border-color: var(--color-warning); background: var(--color-warning-tint); } .pinv-tl .is-bad i { background: var(--color-danger); border-color: var(--color-danger); }
.pinv-tl b { font-weight: 600; } .pinv-tl small { color: var(--color-text-muted); font-size: 11px; }
.pinv-stars { display: inline-flex; align-items: center; gap: 1px; color: #c9a227; vertical-align: middle; white-space: nowrap; } .pinv-stars svg { width: 14px; height: 14px; } .pinv-stars svg.is-on { fill: currentColor; } .pinv-stars svg.is-half { opacity: .5; } .pinv-stars svg.is-off { color: var(--color-border-strong); } .pinv-stars b { margin-inline-start: 5px; color: var(--color-text); font-size: 12px; }
.pinv-cmp th, .pinv-cmp td { white-space: nowrap; vertical-align: middle; } .pinv-cmp tr.pinv-best > td { background: var(--color-success-tint); }
.pinv-tag { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 6px; background: var(--color-primary-tint); color: var(--eg-navy); margin-inline-start: 4px; }
.pinv-tag.is-success { background: var(--color-success-tint); color: var(--color-success); } .pinv-tag.is-warning { background: var(--color-warning-tint); color: var(--color-warning); } .pinv-tag.is-danger { background: var(--color-danger-tint); color: var(--color-danger); }
.pinv-qin { width: 112px; min-height: 36px; padding: 4px 8px; text-align: start; }
.pinv-lines { display: flex; flex-direction: column; gap: 8px; }
.pinv-line { display: grid; grid-template-columns: minmax(200px, 1fr) 104px 112px 120px 40px; gap: 8px; align-items: end; padding: 8px; border: 1px solid var(--color-border); border-radius: 10px; background: #fff; }
.pinv-line .label { font-size: 11.5px; } .pinv-line .field { margin: 0; } .pinv-line-tot { min-height: 40px; display: flex; align-items: center; font-weight: 700; }
.pinv-sum { display: flex; justify-content: flex-end; gap: 18px; flex-wrap: wrap; font-size: var(--text-dense); padding: 10px 12px; background: var(--color-bg-alt); border-radius: 10px; } .pinv-sum span { color: var(--color-text-muted); } .pinv-sum b { margin-inline-start: 6px; color: var(--color-text); }
.pinv-group { border: 1px solid var(--color-border); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px; background: var(--color-bg-alt); }
.pinv-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 8px 12px; background: var(--color-bg-alt); border-radius: 10px; padding: 10px 12px; font-size: 12.5px; }
.pinv-info span { color: var(--color-text-muted); display: block; font-size: 11.5px; } .pinv-info b { font-weight: 700; }
.pinv-stack { display: flex; flex-direction: column; gap: 12px; } .pinv-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.pinv-row2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; } .pinv-row2 .field { margin: 0; }
.pinv-split { display: grid; grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); gap: 16px; align-items: start; margin-block: 16px; } @media (max-width: 1050px) { .pinv-split { grid-template-columns: 1fr; } }
.pinv-chk { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow: auto; border: 1px solid var(--color-border); border-radius: 10px; padding: 6px 10px; background: #fff; }
.pinv-chk label { display: flex; gap: 8px; align-items: center; font-size: var(--text-dense); min-height: 36px; cursor: pointer; } .pinv-chk small { color: var(--color-text-muted); }
.pinv-score { font: 700 17px var(--font-en); } .pinv-score.is-success { color: var(--color-success); } .pinv-score.is-warning { color: var(--color-warning); } .pinv-score.is-danger { color: var(--color-danger); }
.pinv-meter { min-width: 120px; } tr.pinv-var > td { background: var(--color-danger-tint); }
.pinv-tablepad { padding: 0; } .pinv-tbl { width: 100%; } .pinv-tbl td, .pinv-tbl th { vertical-align: middle; }
.pinv-foot { display: flex; gap: 8px; flex-wrap: wrap; width: 100%; align-items: center; } .pinv-grow { flex: 1; }
.pinv-flow { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; } .pinv-flow .icon { color: var(--color-text-muted); }
.pinv-a4 { background: #fff; color: #161b26; max-width: 794px; margin: 0 auto; padding: 30px 34px; border: 1px solid var(--color-border); box-shadow: var(--shadow-float); font-size: 12.5px; line-height: 1.6; }
.pinv-a4-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid var(--eg-navy); padding-bottom: 12px; margin-bottom: 14px; }
.pinv-a4-head img { height: 40px; width: auto; display: block; margin-bottom: 6px; } .pinv-a4-co b { font-size: 14px; color: var(--eg-navy); display: block; } .pinv-a4-co small { display: block; color: #555; font-size: 11px; }
.pinv-a4-title { text-align: end; display: flex; flex-direction: column; gap: 2px; } .pinv-a4-title h2 { margin: 0; color: var(--eg-navy); font-size: 20px; } .pinv-a4-title b { font: 700 15px var(--font-en); }
.pinv-a4-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .pinv-a4-box { border: 1px solid #cfd6e4; border-radius: 8px; padding: 8px 12px; } .pinv-a4-box small { color: #667; display: block; } .pinv-a4-box b { display: block; }
.pinv-a4 table { width: 100%; border-collapse: collapse; margin-top: 12px; } .pinv-a4 th, .pinv-a4 td { border: 1px solid #cfd6e4; padding: 6px 8px; text-align: start; } .pinv-a4 th { background: #eef2f9; font-weight: 700; }
.pinv-a4-tot { margin-top: 8px; margin-inline-start: auto; width: 290px; } .pinv-a4-tot div { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #d5dbe7; } .pinv-a4-tot div:last-child { border-bottom: 0; font-weight: 700; font-size: 14px; color: var(--eg-navy); }
.pinv-a4-terms { margin-top: 14px; font-size: 11.5px; } .pinv-a4-terms ol { margin: 4px 0 0; padding-inline-start: 18px; }
.pinv-a4-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 40px; text-align: center; font-size: 11.5px; } .pinv-a4-sign div { border-top: 1px solid #888; padding-top: 6px; }
.pinv-a4-foot { margin: 18px 0 0; font-size: 10.5px; color: #888; text-align: center; }
.pinv-print-root { display: none; }
@media print { body.pinv-printing > *:not(.pinv-print-root) { display: none !important; } body.pinv-printing .pinv-print-root { display: block !important; } .pinv-print-root .pinv-a4 { border: 0; box-shadow: none; max-width: none; padding: 0; } @page { size: A4; margin: 14mm; } }
@media (max-width: 760px) { .pinv-line { grid-template-columns: 1fr 1fr; } .pinv-line > :first-child { grid-column: 1 / -1; } .pinv-a4-grid { grid-template-columns: 1fr; } }`;
    document.head.appendChild(s);
  })();

  /* ═════════════ helpers ═════════════ */
  const me = () => SA.session.userId;
  const today = () => ERP.day(0);
  const col = (k) => ERP.get(k);
  const ensure = (k) => { if (!Array.isArray(st.get(k))) st.set(k, []); };
  const item = (id) => ERP.item(id);
  const sup = (id) => ERP.supplier(id);
  const uomOf = (id) => (item(id) || {}).uom;
  const qty = (n, u) => fmt.qty(n == null ? null : Math.round(n * 100) / 100, u);
  const num = (n, d) => fmt.num(n, d);
  const r2 = (n) => Math.round(n * 100) / 100;
  const canCost = () => U.canCost();
  const canPrice = () => canCost() || SA.canAny(['scm.po.create', 'scm.po.approve', 'fin.bills.view']);
  const lockTag = (title) => h('span.erp-locked', { title: title || 'أسعار الشراء لفريق المشتريات والمالية فقط' }, SA.icon('lock', 'icon-sm'), 'سري');
  const price = (n) => (canPrice() ? U.money(n) : lockTag());
  const priceTxt = (n) => (canPrice() ? fmt.money(n) : 'سري');
  const isImport = (s) => !!(s && s.country && s.country !== 'مصر');
  const whName = (id) => ERP.whName(id);
  const W = { FG: 'W-01', RM: 'W-02', WIP: 'W-03', SHOW: 'W-04', SP: 'W-05', QRT: 'W-06' };
  const whList = () => col('warehouses').filter((w) => w.active !== false && w.hasStock !== false);
  const PURCH = ['rm', 'pkg', 'acc', 'spare'];
  const buyItems = () => col('items').filter((i) => PURCH.indexOf(i.kind) >= 0);
  const KIND_L = { fg: 'منتج تام', rm: 'مواد خام', pkg: 'تغليف', acc: 'إكسسوارات', spare: 'قطع غيار' };
  const SRC = { mrp: ['MRP', 'info'], reorder: ['حد الطلب', 'warning'], maintenance: ['صيانة', 'danger'], manual: ['يدوي', 'neutral'], rfq: ['طلب عروض', 'info'] };
  const MOVE_T = { receipt: ['استلام', 'success'], issue: ['صرف للإنتاج', 'info'], production: ['إنتاج تام', 'success'], delivery: ['تسليم لعميل', 'info'], transfer: ['تحويل', 'neutral'], adjust: ['تسوية', 'warning'], scrap: ['حجر/هالك', 'danger'], return: ['مرتجع', 'danger'], opening: ['رصيد أول المدة', 'neutral'] };
  const TR_KIND = { showroom: 'عينات صالة العرض', rebalance: 'إعادة توزيع', quarantine: 'نقل للحجر', quarantine_release: 'إفراج من الحجر', expo: 'عينات معرض' };
  const moveChip = (t) => { const m = MOVE_T[t] || [t, 'neutral']; return SA.chip(m[0], m[1]); };
  const tag = (text, tone) => h('span.pinv-tag' + (tone ? '.is-' + tone : ''), {}, text);
  const fld = (label, input, hint) => h('label.field', {}, h('span.label', {}, label), input, hint ? h('div.help', {}, hint) : null);
  const numIn = (v, o) => h('input.input.num.pinv-qin', Object.assign({ type: 'number', step: 'any', min: 0, dir: 'ltr', value: v == null ? '' : v }, o || {}));
  const linkBtn = (label, route, icon) => h('a.btn.btn-ghost.btn-sm', { href: '#/' + route }, icon ? SA.icon(icon, 'icon-sm') : null, label);
  const page = (ctx, crumbs) => ctx.setCrumbs([{ label: 'الإمداد', href: '#/scm/dashboard' }].concat(crumbs));
  const dropQuery = (route) => { try { history.replaceState(null, '', '#/' + route); } catch (e) { /* noop */ } };
  const poOpen = (p) => ['approved', 'sent', 'partially_received', 'pending_approval'].indexOf(p.status) >= 0;
  const poLate = (p) => ['approved', 'sent', 'partially_received'].indexOf(p.status) >= 0 && p.expectedDate < today();
  const poNet = (p) => F.totals(p).net;
  const poOutstanding = (p) => p.lines.reduce((s, l) => s + Math.max(0, l.qty - (l.receivedQty || 0)) * l.price, 0);
  const poRecvPct = (p) => { const q = p.lines.reduce((s, l) => s + l.qty, 0); const r = p.lines.reduce((s, l) => s + Math.min(l.qty, l.receivedQty || 0), 0); return q ? r / q : 0; };
  const leadOf = (sid, itemId) => { const s = sup(sid); const it = item(itemId); return (s && s.importLeadDays) || (it && it.leadDays) || 7; };
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  const byDesc = (k) => (a, b) => (a[k] < b[k] ? 1 : a[k] > b[k] ? -1 : 0);

  /** remember table state per screen across live re-renders */
  const memo = {};
  const keep = (key) => { memo[key] = memo[key] || { filters: {} }; return { initial: memo[key], onChange: (s) => { memo[key] = s; } }; };
  const preset = (key, filters, q) => { const m = (memo[key] = memo[key] || { filters: {} }); m.filters = Object.assign({}, m.filters || {}, filters); if (q != null) m.q = q; m.page = 1; };

  function refLink(ref) {
    if (!ref || !ref.id) return h('span.pinv-muted', {}, '—');
    const id = ref.id;
    if (ref.type === 'transfer' || /^ST-/.test(id)) return h('a.erp-doc.num', { href: '#/scm/transfers?q=' + encodeURIComponent(id) }, id);
    if (ref.type === 'count' || /^CNT-/.test(id)) return h('a.erp-doc.num', { href: '#/scm/counts/' + encodeURIComponent(id) }, id);
    if (/^RFQ-/.test(id)) return h('a.erp-doc.num', { href: '#/scm/rfq/' + encodeURIComponent(id) }, id);
    if (/^S-\d/.test(id)) return h('a.erp-doc.num', { href: '#/scm/suppliers/' + encodeURIComponent(id) }, id);
    return U.docLink(id);
  }
  const link = (id, label) => (id ? (/^(ST|CNT|RFQ)-|^S-\d/.test(id) ? refLink({ id }) : U.docLink(id, label)) : h('span.pinv-muted', {}, '—'));

  function supCell(id) {
    const s = sup(id); if (!s) return h('span', {}, id || '—');
    return h('a.pinv-sup', { href: '#/scm/suppliers/' + s.id, style: { textDecoration: 'none', color: 'inherit' } }, h('b', {}, s.name), h('small', {}, (s.category || s.code || '') + ' · ' + (isImport(s) ? 'استيراد — ' + s.country : 'محلي')));
  }
  function stars(r) {
    r = Number(r) || 0; const out = h('span.pinv-stars', { title: r.toFixed(1) + ' من 5', 'aria-label': 'التقييم ' + r.toFixed(1) + ' من 5' });
    for (let i = 1; i <= 5; i++) out.appendChild(SA.icon('star', r >= i - 0.25 ? 'is-on' : r >= i - 0.75 ? 'is-on is-half' : 'is-off'));
    out.appendChild(h('b.num', {}, r.toFixed(1))); return out;
  }
  /** horizontal bars with a custom value text: [{label, sub, value, text, color, href}] */
  function hbars(rows, maxV) {
    const max = maxV || Math.max(1, ...rows.map((r) => r.value));
    return h('div.erp-hbars', {}, rows.map((d) => h(d.href ? 'a.erp-hbar' : 'div.erp-hbar', d.href ? { href: d.href } : {}, h('span.erp-hbar-l', {}, d.label, d.sub ? h('small', {}, d.sub) : null),
      h('span.erp-hbar-t', {}, h('i', { style: { width: Math.max(1.5, (d.value / max) * 100) + '%', background: d.color || ERP.palette[0] } })), h('b.erp-hbar-v.num', {}, d.text))));
  }
  function attnList(list) {
    if (!list.length) return SA.empty({ icon: 'checkcircle', title: 'لا يوجد ما يحتاج تدخلك الآن', text: 'الأرصدة فوق حد الطلب ولا توجد مستندات متأخرة.' });
    return h('ul.pinv-attn', {}, list.map((a) => h('li', {}, h('span.pinv-attn-ico.is-' + (a.tone || 'info'), {}, SA.icon(a.icon || 'alert', 'icon-sm')),
      h('div.pinv-attn-b', {}, h('b', {}, a.title), a.text ? h('p', {}, a.text) : null, a.actions && a.actions.length ? h('div.pinv-attn-a', {}, a.actions) : null))));
  }
  function infoBox(pairs) { return h('div.pinv-info', {}, pairs.filter(Boolean).map((p) => h('div', {}, h('span', {}, p[0]), h('b', {}, p[1] == null || p[1] === '' ? '—' : p[1])))); }
  /** native select with optgroups by item kind */
  function itemSelect(list, value, onChange, o) {
    o = o || {}; const groups = {}; list.forEach((i) => { (groups[i.kind] = groups[i.kind] || []).push(i); });
    const sel = h('select.select', { 'aria-label': o.label || 'الصنف', onchange: (e) => onChange && onChange(e.target.value) }, o.placeholder ? h('option', { value: '' }, o.placeholder) : null,
      ['rm', 'pkg', 'acc', 'spare', 'fg'].filter((k) => groups[k]).map((k) => h('optgroup', { label: KIND_L[k] }, groups[k].map((i) => h('option', { value: i.id }, i.code + ' — ' + i.name)))));
    sel.value = value || ''; return sel;
  }
  const selectOf = (opts, value, onChange, label) => { const s = h('select.select', { 'aria-label': label || '', onchange: (e) => onChange && onChange(e.target.value) }, opts.map((o) => h('option', { value: o[0] }, o[1]))); s.value = value == null ? '' : value; return s; };

  /* consumption (issues + deliveries) — demo days-of-cover */
  let useCache = { key: '', map: {} };
  function usage(days) {
    const moves = col('stockMoves'); const key = moves.length + ':' + ((moves[0] && moves[0].id) || '') + ':' + days;
    if (useCache.key === key) return useCache.map;
    const from = Date.now() - days * DAY; const m = {};
    moves.forEach((mv) => { if ((mv.type === 'issue' || mv.type === 'delivery') && mv.qty < 0 && new Date(mv.ts).getTime() >= from) m[mv.itemId] = (m[mv.itemId] || 0) - mv.qty; });
    useCache = { key, map: m }; return m;
  }
  const dailyUse = (itemId) => (usage(30)[itemId] || 0) / 30;
  const coverDays = (itemId) => { const d = dailyUse(itemId); return d > 0 ? K.available(itemId) / d : null; };
  function coverCell(itemId) {
    const c = coverDays(itemId); const it = item(itemId); if (c == null) return h('span.pinv-muted', { title: 'لا استهلاك خلال 30 يوم' }, '—');
    const lead = (it && it.leadDays) || 7; const tone = c < lead ? 'danger' : c < lead * 1.6 ? 'warning' : null;
    return h('span.pinv-cell', {}, h('b.num' + (tone === 'danger' ? '.pinv-neg' : ''), {}, (c > 365 ? '+365' : Math.round(c)) + ' يوم'), tone ? h('small', {}, 'التوريد ' + lead + ' يوم') : null);
  }
  /** last purchase price from this supplier (PO → history → RFQ quote → std cost) */
  function lastPrice(sid, itemId) {
    const pos = col('purchaseOrders').filter((p) => p.supplierId === sid && p.status !== 'cancelled').slice().sort(byDesc('createdAt'));
    for (const p of pos) { const l = p.lines.find((x) => x.itemId === itemId); if (l) return l.price; }
    const hs = col('supHistory').filter((x) => x.supplierId === sid && x.itemId === itemId).slice().sort(byDesc('received')); if (hs[0]) return hs[0].price;
    for (const r of col('rfqs')) { if (r.itemId !== itemId) continue; const q = (r.quotes || []).find((x) => x.supplierId === sid); if (q) return q.price; }
    const it = item(itemId); return it ? it.stdCost || 0 : 0;
  }
  function itemsOfSupplier(sid) {
    const ids = new Set(); col('items').forEach((i) => { if (i.supplierId === sid) ids.add(i.id); });
    col('purchaseOrders').forEach((p) => { if (p.supplierId === sid) p.lines.forEach((l) => ids.add(l.itemId)); });
    col('supHistory').forEach((x) => { if (x.supplierId === sid) ids.add(x.itemId); });
    col('rfqs').forEach((r) => { if ((r.invited || []).indexOf(sid) >= 0) ids.add(r.itemId); });
    return col('items').filter((i) => ids.has(i.id));
  }
  const openPrqFor = (itemId) => col('purchaseRequisitions').find((r) => r.itemId === itemId && (r.status === 'open' || r.status === 'approved')) || null;
  const qcOfGrnLine = (grn, itemId) => col('qcInspections').find((q) => q.refType === 'grn' && q.refId === grn.id && q.itemId === itemId) || null;
  const ncrOfGrnLine = (grn, itemId, qc) => col('ncrs').find((n) => (qc && n.qcId === qc.id) || (n.refType === 'grn' && n.refId === grn.id && n.itemId === itemId)) || null;

  function printNode(node) {
    const old = document.querySelector('.pinv-print-root'); if (old) old.remove();
    const root = h('div.pinv-print-root', {}, node.cloneNode(true)); document.body.appendChild(root); document.body.classList.add('pinv-printing');
    let done = false; const fin = () => { if (done) return; done = true; document.body.classList.remove('pinv-printing'); root.remove(); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    try { window.print(); } catch (e) { /* noop */ } setTimeout(fin, 800);
  }

  /* ═════════════ seed (module-private collections + additive history) ═════════════ */
  ERP.addSeed('scm', (S, ctx) => {
    const now = Date.now(); const yr = new Date().getFullYear(); const p2 = (n) => String(n).padStart(2, '0');
    const iso = (t) => new Date(t).toISOString();
    const ds = (t) => { const d = new Date(t); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
    const no = (p, n) => p + '-' + yr + '-' + String(n).padStart(4, '0');
    const rnd = ctx.rnd, between = ctx.between;
    const seq = (S.meta.erpSeq = S.meta.erpSeq || {});
    const items = {}; (S.items || []).forEach((i) => { items[i.id] = i; });
    const defWh = (it) => (!it ? 'W-01' : it.kind === 'fg' || it.kind === 'acc' ? 'W-01' : it.kind === 'spare' ? 'W-05' : 'W-02');
    const T = (x) => new Date(x).getTime();
    S.suppliers = S.suppliers || []; S.purchaseOrders = S.purchaseOrders || []; S.grns = S.grns || []; S.qcInspections = S.qcInspections || []; S.stock = S.stock || [];

    /* 1. RFQ alternatives for the imported décor film */
    if (!S.suppliers.some((s) => s.id === 'S-011')) S.suppliers.push({ id: 'S-011', code: 'SUP-011', name: 'الحديثة لأفلام الديكور — العاشر من رمضان', type: 'raw', contacts: [{ name: 'م. شريف الدالي', phone: '+20 100 100 0011' }], paymentTerms: null, termsDays: 30, status: 'active', balance: 0, openPOs: 0, rating: 3.6, category: 'فويل لامينيشن (بديل محلي)', country: 'مصر', tag: 'new' });
    if (!S.suppliers.some((s) => s.id === 'S-012')) S.suppliers.push({ id: 'S-012', code: 'SUP-012', name: 'Guangzhou Decor Film Co. — الصين', type: 'raw', contacts: [{ name: 'Ms. Lily Chen', phone: '+86 20 0000 0012' }], paymentTerms: null, termsDays: 0, status: 'active', balance: 0, openPOs: 0, rating: 3.2, category: 'فويل لامينيشن (مورد محتمل)', country: 'الصين', importLeadDays: 50, prospect: true });

    /* 2. a LATE PO (S-005 gaskets) partially received today → GRN waiting incoming QC */
    const poN = Math.max(seq.PS || 0, 52) + 1; seq.PS = poN; const lateId = no('PS', poN);
    S.purchaseOrders.push({ id: lateId, supplierId: 'S-005', lines: [{ itemId: 'IT-ACC-GSKT', qty: 3000, price: 5.8, receivedQty: 1800 }], status: 'partially_received', buyerId: 'U-14', createdAt: iso(now - 12 * DAY), expectedDate: ERP.day(-4), approvalId: null, prqIds: [], currency: 'EGP', notes: 'تأخر المورد 4 أيام عن الموعد — استلام جزئي اليوم', approvedAt: iso(now - 12 * DAY + 3600e3), sentAt: iso(now - 11.8 * DAY) });
    const grnN = Math.max(seq.GRN || 0, 72) + 1; seq.GRN = grnN; const grnId = no('GRN', grnN);
    const qcN = (seq.QC || 330) + 1; seq.QC = qcN; const qcId = no('QC', qcN);
    S.qcInspections.unshift({ id: qcId, kind: 'incoming', refType: 'grn', refId: grnId, itemId: 'IT-ACC-GSKT', qty: 1800, sample: 32, lot: grnId, result: 'pending', params: (ERP.qcParams.rm || []).map((p) => ({ name: p[0], spec: p[1], value: '', ok: null })), defects: [], acceptedQty: null, rejectedQty: null, inspectorId: null, at: null, createdAt: iso(now - 95 * 60e3), note: '', ncrId: null });
    S.grns.unshift({ id: grnId, poId: lateId, supplierId: 'S-005', whId: 'W-01', lines: [{ itemId: 'IT-ACC-GSKT', qty: 1800, price: 5.8, acceptedQty: null, rejectedQty: null }], status: 'pending_qc', receivedBy: 'U-07', at: iso(now - 100 * 60e3), qcIds: [qcId], supplierDn: 'DN-WF-2291', note: 'استلام جزئي — المتبقي 1,200 م' });
    S.suppliers.forEach((s) => { if (s.id === 'S-005') s.openPOs = (s.openPOs || 0) + 1; });
    if (Array.isArray(S.notifications)) S.notifications.unshift({ id: 'N-SCM1', ts: iso(now - 95 * 60e3), title: 'فحص استلام مطلوب: ' + grnId, body: 'ورشة الفواصل والمقابض — جوان مطاطي 1,800 م بانتظار الجودة.', level: 'action', to: ['R-09'], toUsers: [], link: '#/mfg/qc/' + qcId, readBy: [] });

    /* 3. RFQs (S.rfqs) */
    const acrPO = S.purchaseOrders.find((p) => p.supplierId === 'S-004' && p.lines.some((l) => l.itemId === 'IT-RM-ACR'));
    S.rfqs = [
      { id: no('RFQ', 12), itemId: 'IT-RM-PIG', qty: 300, prqId: null, status: 'sent', createdAt: iso(now - 26 * 3600e3), createdBy: 'U-14', dueDate: ERP.day(2), invited: ['S-009', 'S-004'],
        quotes: [{ supplierId: 'S-009', price: 158, freightPct: 0, leadDays: 6, termsDays: 45, validUntil: ERP.day(14), sample: 'pending', note: 'نفس التركيبة — مع شهادة COA لكل دفعة', receivedAt: iso(now - 5 * 3600e3) }], awards: [],
        note: 'مقارنة بديل بعد اختلاف درجة لون دفعة الصبغة (NCR-2026-041 / CAPA-2026-012)' },
      { id: no('RFQ', 11), itemId: 'IT-RM-FILM', qty: 6000, prqId: 'PRQ-2026-0031', status: 'evaluating', createdAt: iso(now - 6 * DAY), createdBy: 'U-14', dueDate: ERP.day(-1), invited: ['S-008', 'S-011', 'S-012'],
        quotes: [
          { supplierId: 'S-008', price: 38.5, freightPct: 16, leadDays: 35, termsDays: 60, validUntil: ERP.day(20), sample: 'approved', note: 'المورد الحالي — مطابق لألوان الكتالوج (11 لون). السعر FOB + شحن وجمارك تقديرية.', receivedAt: iso(now - 4 * DAY) },
          { supplierId: 'S-011', price: 41, freightPct: 2, leadDays: 10, termsDays: 30, validUntil: ERP.day(10), sample: 'conditional', note: 'بديل محلي — عينة C132/C160 مقبولة بشرط (ΔE 1.3). طاقة 3,000 م أسبوعيًا.', receivedAt: iso(now - 3 * DAY) },
          { supplierId: 'S-012', price: 28.5, freightPct: 27, leadDays: 50, termsDays: 0, validUntil: ERP.day(30), sample: 'pending', note: 'اعتماد مستندي (LC) مقدّم — حد أدنى 10,000 م. العينات لم تصل.', receivedAt: iso(now - 2 * DAY) }],
        awards: [], note: 'الرصيد تحت حد الطلب — مدة الاستيراد المعتادة 35 يوم.' },
      { id: no('RFQ', 10), itemId: 'IT-RM-ACR', qty: 500, prqId: null, status: acrPO ? 'awarded' : 'evaluating', createdAt: iso(now - 4 * DAY), createdBy: 'U-14', dueDate: ERP.day(-2), invited: ['S-004', 'S-009'],
        quotes: [{ supplierId: 'S-004', price: 138, freightPct: 0, leadDays: 4, termsDays: 60, validUntil: ERP.day(12), sample: 'approved', note: 'المورد الحالي — نفس الدرجة المعتمدة', receivedAt: iso(now - 3.5 * DAY) },
          { supplierId: 'S-009', price: 131, freightPct: 1, leadDays: 12, termsDays: 45, validUntil: ERP.day(12), sample: 'pending', note: 'منتج جديد لديهم — بدون سجل استخدام في الخط', receivedAt: iso(now - 3 * DAY) }],
        awards: acrPO ? [{ supplierId: 'S-004', qty: 500, poId: acrPO.id, at: acrPO.createdAt, by: 'U-14' }] : [], awardedAt: acrPO ? acrPO.createdAt : null, note: 'منظم الفوم تحت حد الطلب' }
    ];
    seq.RFQ = 12;

    /* 4. supplier delivery history (12 months) → scorecards & price trends */
    const PROF = {
      'S-001': [11, 0.91, 0, [['IT-RM-PVC', 43.5, 48, 18000, 26000]]], 'S-002': [9, 0.78, 0.12, [['IT-ACC-LOCK', 298, 315, 200, 400], ['IT-ACC-HINGE', 130, 138, 200, 400]]],
      'S-003': [10, 0.8, 0.3, [['IT-RM-WF', 8.1, 8.8, 5000, 7000]]], 'S-004': [12, 0.95, 0.05, [['IT-RM-STB', 88, 94, 800, 1200], ['IT-RM-ACR', 129, 138, 400, 600], ['IT-RM-LUB', 64, 69, 400, 600], ['IT-RM-GLUE', 196, 210, 250, 350], ['IT-RM-FOAM', 112, 120, 150, 250]]],
      'S-005': [8, 0.5, 0.25, [['IT-ACC-GSKT', 5.1, 5.8, 1500, 3000]]], 'S-006': [10, 0.9, 0.05, [['IT-PKG-CTN', 41, 44, 500, 800], ['IT-PKG-STR', 352, 375, 40, 60], ['IT-PKG-PAL', 238, 260, 80, 120]]],
      'S-007': [9, 0.94, 0, [['IT-RM-CC', 2.85, 3.1, 10000, 14000]]], 'S-008': [5, 0.6, 0.05, [['IT-RM-FILM', 32.5, 38.15, 9000, 12000]], true],
      'S-009': [9, 0.88, 0.15, [['IT-RM-PIG', 149, 158, 250, 350]]], 'S-010': [10, 0.85, 0, [['IT-SP-BLD', 1100, 1200, 4, 10], ['IT-SP-SEAL', 600, 650, 4, 8], ['IT-SP-BRG', 850, 900, 4, 10], ['IT-SP-THC', 420, 450, 6, 12], ['IT-SP-BELT', 2450, 2600, 1, 3], ['IT-SP-HTR', 3550, 3800, 2, 4]]],
      'S-011': [2, 1, 0.5, [['IT-RM-FILM', 40.5, 41, 300, 500]]]
    };
    const spread = (cnt, n, off) => { const s = new Set(); for (let k = 0; k < cnt; k++) s.add(Math.min(n - 1, Math.floor(((k + off) * n) / cnt))); return s; };
    const hist = []; let hn = 0, pref = 20;
    Object.keys(PROF).forEach((sid) => {
      const p = PROF[sid]; const n = p[0]; const lateSet = spread(Math.round(n * (1 - p[1])), n, 0.5); const rejSet = spread(Math.round(n * p[2]), n, 0.2); const span = sid === 'S-011' ? 75 : 345;
      for (let i = 0; i < n; i++) {
        const back = Math.round(span - (i * (span - 16)) / Math.max(1, n - 1)); const it = p[3][i % p[3].length]; const f = n > 1 ? i / (n - 1) : 1;
        const promisedT = now - back * DAY; const late = lateSet.has(i); const delay = late ? (p[4] ? between(6, 15) : between(2, 7)) : -between(0, 2);
        const recT = Math.min(now - 3 * DAY, promisedT + delay * DAY);
        const q0 = between(it[3], it[4]); const q = q0 >= 1000 ? Math.round(q0 / 100) * 100 : q0 >= 100 ? Math.round(q0 / 10) * 10 : q0;
        const rej = rejSet.has(i) ? Math.max(1, Math.round(q * between(4, 14) / 100)) : 0;
        const pr = Math.round((it[1] + (it[2] - it[1]) * f) * (1 + (rnd() - 0.5) * 0.025) * 100) / 100;
        pref++; hist.push({ id: 'HD-' + String(++hn).padStart(3, '0'), supplierId: sid, itemId: it[0], poRef: 'PS-' + (new Date(promisedT).getFullYear()) + '-H' + String(pref).padStart(3, '0'), promised: ds(promisedT), received: ds(recT), qty: q, accepted: q - rej, rejected: rej, price: pr });
      }
    });
    S.supHistory = hist;

    /* 5. stock movement history — 45 days, balances consistent with today's S.stock */
    const WINDOW = 45; const from = now - WINDOW * DAY; const raw = [];
    const push = (t, itemId, whId, q, type, ref, note, by, lot) => { if (!q || !items[itemId] || t < from || t > now) return; raw.push({ t, itemId, whId, qty: Math.round(q * 100) / 100, type, ref: ref || null, note: note || '', by: by || 'U-07', lot: lot || null }); };
    const bomOf = (it) => (it && it.bomId ? (S.boms || []).find((b) => b.id === it.bomId) : null);
    const mats = (itemId, q) => { const it = items[itemId]; const b = bomOf(it); if (!b) return []; const fct = b.scale === 'width' ? (it.attrs.width || 90) / 90 : b.scale === 'thickness' ? (it.attrs.thickness || 10) : 1; return b.lines.map((l) => { const m = items[l.itemId]; const fixed = m && (m.kind === 'acc' || m.kind === 'pkg'); return { itemId: l.itemId, qty: Math.round(l.qty * (fixed ? 1 : fct) * q * (1 + (l.scrapPct || 0)) * 100) / 100 }; }); };
    (S.workOrders || []).forEach((w) => {
      if (!w.issued) return; const tI = w.actualStart ? T(w.actualStart) - 2 * 3600e3 : w.status === 'released' ? now - 3 * 3600e3 : null; if (!tI) return;
      mats(w.itemId, w.qty).forEach((m) => push(tI, m.itemId, defWh(items[m.itemId]), -m.qty, 'issue', { type: 'work_order', id: w.id }, 'صرف خامات لأمر تشغيل', rnd() < 0.5 ? 'U-07' : 'U-22', w.lot));
      if ((w.status === 'completed' || w.status === 'closed') && w.actualEnd) { const qc = (S.qcInspections || []).find((q) => q.id === w.qcId); const acc = qc && qc.acceptedQty != null ? qc.acceptedQty : w.qtyDone; push(T(w.actualEnd) + 2 * 3600e3, w.itemId, 'W-01', acc, 'production', { type: 'work_order', id: w.id }, 'استلام إنتاج تام بعد فحص الجودة', 'U-07', w.lot); }
    });
    (S.deliveries || []).forEach((d) => { if (!d.dispatchedAt || ['dispatched', 'in_transit', 'delivered'].indexOf(d.status) < 0) return; (d.lines || []).forEach((l) => push(T(d.dispatchedAt), l.itemId, 'W-01', -l.qty, 'delivery', { type: 'dn', id: d.id }, 'خروج بإذن تسليم', 'U-07')); });
    S.grns.forEach((g) => {
      if (g.status === 'pending_qc') return; const sname = (S.suppliers.find((x) => x.id === g.supplierId) || {}).name || '';
      g.lines.forEach((l) => { const qc = (S.qcInspections || []).find((q) => q.refType === 'grn' && q.refId === g.id && q.itemId === l.itemId);
        if (l.acceptedQty) push(T(g.at) + 3 * 3600e3, l.itemId, g.whId || defWh(items[l.itemId]), l.acceptedQty, 'receipt', { type: 'grn', id: g.id }, 'استلام بعد فحص الجودة — ' + sname, 'U-07', g.id);
        if (l.rejectedQty) push(T(g.at) + 3 * 3600e3, l.itemId, 'W-06', l.rejectedQty, 'return', qc ? { type: 'qc', id: qc.id } : null, 'مرفوض في فحص الاستلام — بانتظار الإرجاع للمورد', 'U-15', g.id); });
    });
    (S.maintenanceOrders || []).forEach((mw) => (mw.parts || []).forEach((p) => { if (p.issued) push(T(mw.startedAt || mw.openedAt) + 600e3, p.itemId, 'W-05', -p.qty, 'issue', { type: 'mwo', id: mw.id }, 'صرف قطعة غيار لأمر صيانة', 'U-31'); }));
    const qFail = (S.qcInspections || []).find((q) => q.itemId === 'IT-K71-3' && q.rejectedQty === 85);
    if (qFail && qFail.at) push(T(qFail.at) + 3600e3, 'IT-K71-3', 'W-06', 85, 'scrap', { type: 'qc', id: qFail.id }, 'حجر جودة — اختلاف لون (NCR-2026-041)', 'U-15', qFail.lot);
    /* transfers (S.transfers) */
    const transfers = []; const w4 = S.stock.filter((r) => r.whId === 'W-04' && r.qty > 0);
    const tShow = now - 26 * DAY + 3 * 3600e3, tQ = now - 15 * DAY + 5 * 3600e3, tRel = now - 10 * DAY + 2 * 3600e3;
    if (w4.length) {
      const id = no('ST', 10); transfers.push({ id, fromWh: 'W-01', toWh: 'W-04', kind: 'showroom', lines: w4.map((r) => ({ itemId: r.itemId, qty: r.qty })), by: 'U-22', at: iso(tShow), note: 'تجديد عينات صالة العرض بالموديلات الأكثر طلبًا', status: 'done' });
      w4.forEach((r) => { push(tShow, r.itemId, 'W-01', -r.qty, 'transfer', { type: 'transfer', id }, 'تحويل لصالة العرض', 'U-22'); push(tShow, r.itemId, 'W-04', r.qty, 'transfer', { type: 'transfer', id }, 'تحويل لصالة العرض', 'U-22'); });
    }
    const idQ = no('ST', 11), idR = no('ST', 12);
    transfers.push({ id: idQ, fromWh: 'W-01', toWh: 'W-06', kind: 'quarantine', lines: [{ itemId: 'IT-K71-1', qty: 40 }], by: 'U-07', at: iso(tQ), note: 'حجر مؤقت — تلف تغليف أثناء التحميل (لحين إعادة الفحص)', status: 'done' });
    transfers.push({ id: idR, fromWh: 'W-06', toWh: 'W-01', kind: 'quarantine_release', lines: [{ itemId: 'IT-K71-1', qty: 40 }], by: 'U-07', at: iso(tRel), note: 'إفراج بعد إعادة الفحص والتغليف — مطابق', status: 'done' });
    push(tQ, 'IT-K71-1', 'W-01', -40, 'transfer', { type: 'transfer', id: idQ }, 'نقل للحجر', 'U-07'); push(tQ, 'IT-K71-1', 'W-06', 40, 'transfer', { type: 'transfer', id: idQ }, 'نقل للحجر', 'U-07');
    push(tRel, 'IT-K71-1', 'W-06', -40, 'transfer', { type: 'transfer', id: idR }, 'إفراج من الحجر', 'U-07'); push(tRel, 'IT-K71-1', 'W-01', 40, 'transfer', { type: 'transfer', id: idR }, 'إفراج من الحجر', 'U-07');
    S.transfers = transfers.reverse(); seq.ST = Math.max(seq.ST || 0, 12);
    /* posted count adjustments (CNT-…-0007) */
    const cnt7 = no('CNT', 7), cnt8 = no('CNT', 8); const tCount = now - 12 * DAY + 4 * 3600e3;
    const VAR = [['IT-RM-PVC', -35], ['IT-RM-CC', 20], ['IT-RM-STB', -4]];
    VAR.forEach((v) => push(tCount, v[0], 'W-02', v[1], 'adjust', { type: 'count', id: cnt7 }, 'تسوية فروق جرد دوري', 'U-07'));
    /* balances: walk newest → oldest from today's quantity; fill gaps with aggregated consumption so no balance goes negative */
    const curQty = (itemId, whId) => { const r = S.stock.find((x) => x.itemId === itemId && x.whId === whId); return r ? r.qty : 0; };
    const series = {}; raw.forEach((m) => { const k = m.itemId + '|' + m.whId; (series[k] = series[k] || []).push(m); });
    const out = [];
    Object.keys(series).forEach((k) => {
      const list = series[k].sort((a, b) => b.t - a.t); const parts = k.split('|'); const it = items[parts[0]];
      let bal = curQty(parts[0], parts[1]); let newer = now;
      list.forEach((m) => {
        if (bal - m.qty < -0.001) {
          const D = Math.ceil((m.qty - bal) * 1.08 + (it.kind === 'fg' ? 2 : it.kind === 'spare' ? 1 : 10));
          const fill = it.kind === 'fg' ? ['delivery', 'تسليمات متفرقة (مجمّعة)'] : it.kind === 'spare' ? ['issue', 'صرف صيانة (مجمّع)'] : ['issue', 'صرف للإنتاج (مجمّع)'];
          out.push({ t: m.t + Math.max(60e3, (newer - m.t) / 2), itemId: parts[0], whId: parts[1], qty: -D, type: fill[0], ref: null, note: fill[1], by: 'U-22', lot: null, balance: r2(bal) });
          bal += D;
        }
        m.balance = r2(bal); out.push(m); bal = r2(bal - m.qty); newer = m.t;
      });
      if (bal > 0.001) out.push({ t: from - 60e3, itemId: parts[0], whId: parts[1], qty: bal, type: 'opening', ref: null, note: 'رصيد أول المدة', by: 'SYSTEM', lot: null, balance: bal });
    });
    S.stock.forEach((r) => { if (r.qty > 0 && !series[r.itemId + '|' + r.whId]) out.push({ t: from - 60e3, itemId: r.itemId, whId: r.whId, qty: r.qty, type: 'opening', ref: null, note: 'رصيد أول المدة', by: 'SYSTEM', lot: null, balance: r.qty }); });
    out.sort((a, b) => b.t - a.t);
    const mine = out.map((m, i) => ({ id: 'MV-S' + String(out.length - i).padStart(4, '0'), ts: iso(m.t), itemId: m.itemId, whId: m.whId, qty: m.qty, type: m.type, ref: m.ref, note: m.note, by: m.by, lot: m.lot, balance: m.balance }));
    S.stockMoves = mine.concat(S.stockMoves || []).sort((a, b) => (a.ts < b.ts ? 1 : -1));
    /* counts (S.counts) */
    const balAt = (itemId, whId, t) => { const ms = out.filter((m) => m.itemId === itemId && m.whId === whId); const m = ms.find((x) => x.t <= t); if (m) return m.balance; const o = ms[ms.length - 1]; return o ? r2(o.balance - o.qty) : curQty(itemId, whId); };
    const lines7 = S.stock.filter((r) => r.whId === 'W-02').map((r) => { const adj = out.find((m) => m.type === 'adjust' && m.itemId === r.itemId && m.whId === 'W-02' && m.ref && m.ref.id === cnt7); if (adj) return { itemId: r.itemId, systemQty: r2(adj.balance - adj.qty), countedQty: adj.balance, note: adj.qty < 0 ? 'عجز — فرق وزن أكياس مفتوحة' : 'زيادة — شكارة غير مسجلة من الاستلام السابق' }; const b = balAt(r.itemId, 'W-02', tCount - 60e3); return { itemId: r.itemId, systemQty: b, countedQty: b, note: '' }; });
    const doors = S.stock.filter((r) => r.whId === 'W-01' && items[r.itemId] && items[r.itemId].family === 'door').sort((a, b) => (a.itemId < b.itemId ? -1 : 1)).slice(0, 8);
    S.counts = [
      { id: cnt8, whId: 'W-01', scope: 'cycle', scopeLabel: 'جرد دوري — الأبواب (عينة 8 أصناف)', status: 'counting', blind: true, createdAt: iso(now - 150 * 60e3), createdBy: 'U-22', lines: doors.map((r, i) => ({ itemId: r.itemId, systemQty: r.qty, countedQty: i < 5 ? (i === 2 ? r.qty - 1 : r.qty) : null, note: i === 2 ? 'نقص باب — جاري البحث في منطقة التحميل' : '' })) },
      { id: cnt7, whId: 'W-02', scope: 'full', scopeLabel: 'جرد كامل — مخزن المواد الخام', status: 'posted', blind: true, createdAt: iso(tCount - 7 * 3600e3), createdBy: 'U-07', submittedAt: iso(tCount - 3600e3), postedAt: iso(tCount), postedBy: 'U-01', postReason: 'فروق ضمن حدود الوزن المسموحة', lines: lines7 }
    ];
    seq.CNT = 8;
  });

  /* ═════════════ shared calculations ═════════════ */
  /** supplier scorecard: history (supHistory) + live GRNs vs PO expected dates + incoming QC results */
  function scorecard(sid) {
    const s = sup(sid) || {};
    const hist = col('supHistory').filter((x) => x.supplierId === sid).map((x) => Object.assign({ src: 'hist' }, x));
    const live = col('grns').filter((g) => g.supplierId === sid).map((g) => {
      const po = ERP.find('purchaseOrders', g.poId); const pending = g.lines.some((l) => l.acceptedQty == null);
      return { src: 'grn', id: g.id, poRef: g.poId, itemId: (g.lines[0] || {}).itemId, promised: po ? po.expectedDate : null, received: String(g.at).slice(0, 10), qty: sum(g.lines, (l) => l.qty), accepted: sum(g.lines, (l) => l.acceptedQty || 0), rejected: sum(g.lines, (l) => l.rejectedQty || 0), pending, price: (g.lines[0] || {}).price };
    });
    const all = hist.concat(live).sort(byDesc('received'));
    const timed = all.filter((d) => d.promised && d.received);
    const lateL = timed.filter((d) => d.received > d.promised);
    const onTime = timed.length ? 1 - lateL.length / timed.length : null;
    const qd = all.filter((d) => !d.pending); const tq = sum(qd, (d) => d.accepted + d.rejected);
    const quality = tq ? sum(qd, (d) => d.accepted) / tq : null;
    const avgDelay = lateL.length ? sum(lateL, (d) => ERP.daysBetween(d.promised, d.received)) / lateL.length : 0;
    const pos = col('purchaseOrders').filter((p) => p.supplierId === sid);
    const open = pos.filter(poOpen); const late = pos.filter(poLate);
    const cnt = {}; all.forEach((d) => { if (d.itemId) cnt[d.itemId] = (cnt[d.itemId] || 0) + 1; });
    const main = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
    const ncrs = col('ncrs').filter((n) => n.source === 'supplier' && (() => { const g = n.refType === 'grn' ? ERP.find('grns', n.refId) : null; return g && g.supplierId === sid; })());
    const score = Math.round(100 * (0.4 * (onTime == null ? 0.8 : onTime) + 0.4 * (quality == null ? 0.95 : quality) + 0.2 * ((s.rating || 3) / 5)));
    return { s, all, onTime, quality, avgDelay, deliveries: timed.length, open, late, openVal: sum(open, poOutstanding), main, ncrs, score };
  }
  /** monthly average purchase price of an item from one supplier (or all) over the last n months */
  function priceTrend(itemId, sid, n) {
    const keys = ERP.monthKeys(n || 12); const acc = {}; keys.forEach((k) => { acc[k] = [0, 0]; });
    const add = (date, p, q) => { const k = String(date).slice(0, 7); if (acc[k]) { acc[k][0] += p * (q || 1); acc[k][1] += q || 1; } };
    col('supHistory').forEach((x) => { if (x.itemId === itemId && (!sid || x.supplierId === sid)) add(x.received, x.price, x.qty); });
    col('purchaseOrders').forEach((p) => { if ((!sid || p.supplierId === sid) && p.status !== 'cancelled') p.lines.forEach((l) => { if (l.itemId === itemId) add(p.createdAt, l.price, l.qty); }); });
    let last = null; const vals = keys.map((k) => { if (acc[k][1]) last = Math.round((acc[k][0] / acc[k][1]) * 100) / 100; return acc[k][1] ? last : null; });
    return { keys, vals };
  }
  const scoreTone = (v) => (v >= 85 ? 'success' : v >= 70 ? 'warning' : 'danger');
  const pctTone = (v) => (v == null ? 'neutral' : v >= 0.9 ? 'success' : v >= 0.75 ? 'warning' : 'danger');
  const meter = (v, label) => (v == null ? h('span.pinv-muted', {}, 'لا توجد بيانات') : h('div.pinv-meter', {}, CH.meter(v, { label: label || '', tone: pctTone(v) === 'neutral' ? 'primary' : pctTone(v) })));

  /** RFQ quote scoring — landed cost, lead time (weighted up when stock cover < lead), rating, payment terms */
  const landed = (q) => q.price * (1 + (q.freightPct || 0) / 100);
  function scoreQuotes(rfq) {
    const qs = (rfq.quotes || []).filter((q) => q.price != null); if (!qs.length) return { list: [], best: null, urgent: false };
    const it = item(rfq.itemId) || {}; const cov = coverDays(rfq.itemId); const urgent = cov != null && cov < (it.leadDays || 7);
    const minL = Math.min(...qs.map(landed)), minLead = Math.min(...qs.map((q) => q.leadDays || 1));
    const w = urgent ? [0.35, 0.4, 0.2, 0.05] : [0.5, 0.25, 0.2, 0.05];
    const list = qs.map((q) => { const s = sup(q.supplierId) || {}; const sc = w[0] * (minL / landed(q)) + w[1] * (minLead / Math.max(1, q.leadDays || 1)) + w[2] * ((s.rating || 3) / 5) + w[3] * Math.min(1, (q.termsDays || 0) / 60); return Object.assign({}, q, { landed: landed(q), total: landed(q) * rfq.qty, score: Math.round(sc * 100) }); });
    list.sort((a, b) => b.score - a.score);
    return { list, best: list[0], urgent, cover: cov, cheapest: list.slice().sort((a, b) => a.landed - b.landed)[0], fastest: list.slice().sort((a, b) => a.leadDays - b.leadDays)[0] };
  }
  const awardedQty = (rfq) => sum(rfq.awards || [], (a) => a.qty);

  /* ═════════════ shared actions / modals ═════════════ */
  const noPerm = (p) => { SA.toast('ليست من صلاحياتك (' + p + ')', 'warn'); };
  function showErr(el, msg) { el.hidden = !msg; el.textContent = msg || ''; }

  /** new purchase requisition (manual / from stock card / dashboard) */
  function newPRQ(o) {
    o = o || {}; if (!SA.can('scm.requisitions.create')) return noPerm('scm.requisitions.create');
    const list = buyItems(); let itemId = o.itemId && item(o.itemId) ? o.itemId : (list[0] || {}).id; let first = true;
    const qtyIn = h('input.input.num', { type: 'number', min: 0, step: 'any', dir: 'ltr' });
    const needIn = h('input.input', { type: 'date', dir: 'ltr' });
    const reasonIn = h('textarea.textarea', { rows: 2, placeholder: 'مثال: تحت حد الطلب / احتياج أمر تشغيل / عطل ماكينة' }, o.reason || '');
    const info = h('div'); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    const sel = itemSelect(list, itemId, (v) => { itemId = v; refresh(); });
    function refresh() {
      const it = item(itemId); if (!it) return; const avail = K.available(itemId); const oo = K.onOrder(itemId); const d = dailyUse(itemId); const ex = openPrqFor(itemId);
      const sugg = Math.max(it.moq || 1, Math.ceil((it.reorderPoint || 0) * 2 - avail - oo));
      qtyIn.value = first && o.qty ? o.qty : sugg; first = false; needIn.value = ERP.day(Math.min(30, Math.max(3, Math.round((it.leadDays || 7) * 0.6))));
      SA.clear(info); info.append(infoBox([['المتاح الآن', qty(avail, it.uom)], ['حد الطلب', qty(it.reorderPoint, it.uom)], ['على أوامر شراء', qty(oo, it.uom)], ['استهلاك يومي (30 يوم)', d ? qty(d, it.uom) : '—'], ['مدة التوريد', (it.leadDays || 7) + ' يوم'], ['المورد المفضل', ERP.supplierName(it.supplierId)]]),
        ex ? SA.alert('warning', 'يوجد طلب مفتوح لنفس الصنف: ', link(ex.id), ' (' + qty(ex.qty, it.uom) + ')') : null);
    }
    const save = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      const q = Number(qtyIn.value); if (!(q > 0)) return showErr(err, 'اكتب كمية أكبر من صفر.'); if (!itemId) return showErr(err, 'اختر الصنف.');
      const reason = reasonIn.value.trim() || 'طلب يدوي'; let r = null; m.setBusy(true);
      try { await SA.api(() => { r = F.createPRQ({ itemId, qty: q, reason, source: o.source || 'manual', neededBy: needIn.value || ERP.day(7), woId: o.woId || null }); }); } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(r); SA.toast('تم إنشاء طلب الشراء ' + r.id + ' وإبلاغ المشتريات', 'success'); if (!o.stay) SA.nav('scm/requisitions?q=' + r.id);
    } }, SA.icon('check', 'icon-sm'), 'إنشاء الطلب');
    const m = SA.modal({ title: 'طلب شراء داخلي جديد', subtitle: 'يصل لفريق المشتريات للاعتماد والتحويل لأمر شراء', icon: 'clipboard', size: 'md',
      body: h('div.pinv-stack', {}, fld('الصنف', sel), info, h('div.pinv-row2', {}, fld('الكمية المطلوبة', qtyIn), fld('مطلوب قبل', needIn)), fld('السبب', reasonIn), err),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), save] });
    refresh(); return m;
  }

  /** create / edit a purchase order (items limited to what the supplier sells) */
  function poForm(o) {
    o = o || {}; const editing = o.po || null;
    if (!SA.can('scm.po.create')) return noPerm('scm.po.create');
    const sups = col('suppliers').filter((s) => s.status !== 'inactive' && s.status !== 'disabled');
    let sid = editing ? editing.supplierId : o.supplierId || (sups[0] || {}).id; let dateTouched = !!editing;
    let lines = editing ? editing.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price })) : (o.lines || []).map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price != null ? l.price : lastPrice(sid, l.itemId) }));
    const supSel = selectOf(sups.map((s) => [s.id, s.name + (isImport(s) ? ' — استيراد' : '')]), sid, (v) => { sid = v; lines = []; addLine(); draw(); }, 'المورد');
    if (editing) supSel.disabled = true;
    const supInfo = h('div'); const linesBox = h('div.pinv-lines'); const sumBox = h('div.pinv-sum'); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    const dateIn = h('input.input', { type: 'date', dir: 'ltr', oninput: () => { dateTouched = true; } });
    const notesIn = h('textarea.textarea', { rows: 2, placeholder: 'ملاحظات للمورد (اختياري)' }, (editing && editing.notes) || o.notes || '');
    const avail = () => { const l = itemsOfSupplier(sid); return l.length ? l : buyItems(); };
    function addLine(itemId) { const list = avail(); const iid = itemId || (list.find((i) => !lines.some((x) => x.itemId === i.id)) || list[0] || {}).id; if (!iid) return; const it = item(iid); lines.push({ itemId: iid, qty: (it && it.moq) || 1, price: lastPrice(sid, iid) }); }
    function totals() { const t = F.totals({ lines: lines.filter((l) => l.qty > 0) }); return t; }
    function drawSum() { const t = totals(); SA.clear(sumBox); sumBox.append(h('div', {}, h('span', {}, 'الإجمالي قبل الضريبة'), h('b.num', {}, fmt.money(t.net))), h('div', {}, h('span', {}, 'ضريبة ' + Math.round(ERP.taxRate() * 100) + '%'), h('b.num', {}, fmt.money(t.tax)), ERP.taxIsDemo() ? U.demo('نسبة تجريبية') : null), h('div', {}, h('span', {}, 'الإجمالي'), h('b.num', {}, fmt.money(t.total))),
      t.net > F.limits.poAuto ? tag('يحتاج اعتماد المدير المالي' + (t.net > F.limits.poGm ? ' والمدير العام' : ''), 'warning') : tag('اعتماد تلقائي (أقل من ' + fmt.short(F.limits.poAuto) + ' — حد تجريبي)', 'success')); }
    function draw() {
      const s = sup(sid) || {}; const list = avail(); const fallback = !itemsOfSupplier(sid).length;
      SA.clear(supInfo); supInfo.append(infoBox([['النوع', isImport(s) ? 'استيراد — ' + s.country : 'مورد محلي'], ['التخصص', s.category || '—'], ['شروط الدفع', s.termsDays != null ? s.termsDays + ' يوم' : '—'], ['مدة التوريد', (s.importLeadDays || '') ? s.importLeadDays + ' يوم (استيراد)' : 'حسب الصنف'], ['التقييم', stars(s.rating)], ['أوامر مفتوحة', num(col('purchaseOrders').filter((p) => p.supplierId === sid && poOpen(p)).length)]]),
        fallback ? SA.alert('info', 'لا توجد أصناف مسجلة لهذا المورد — تظهر كل الأصناف القابلة للشراء.') : null);
      SA.clear(linesBox);
      lines.forEach((l, i) => {
        const it = item(l.itemId) || {}; const tot = h('b.num.pinv-line-tot', {}, fmt.money(l.qty * l.price));
        const q = h('input.input.num', { type: 'number', min: 0, step: 'any', dir: 'ltr', value: l.qty, 'aria-label': 'الكمية', oninput: (e) => { l.qty = Number(e.target.value) || 0; tot.textContent = fmt.money(l.qty * l.price); drawSum(); } });
        const p = h('input.input.num', { type: 'number', min: 0, step: 'any', dir: 'ltr', value: l.price, 'aria-label': 'سعر الوحدة', oninput: (e) => { l.price = Number(e.target.value) || 0; tot.textContent = fmt.money(l.qty * l.price); drawSum(); } });
        linesBox.appendChild(h('div.pinv-line', {}, fld('الصنف', itemSelect(list, l.itemId, (v) => { l.itemId = v; l.price = lastPrice(sid, v); l.qty = (item(v) || {}).moq || l.qty; draw(); })),
          fld('الكمية (' + (ERP.uom[it.uom] || it.uom || '') + ')', q), fld('سعر الوحدة', p), h('div.field', {}, h('span.label', {}, 'الإجمالي'), tot),
          h('button.btn.btn-ghost.btn-icon', { type: 'button', 'aria-label': 'حذف البند', title: 'حذف البند', disabled: lines.length < 2, onclick: () => { lines.splice(i, 1); draw(); } }, SA.icon('trash', 'icon-sm'))));
      });
      if (!dateTouched) dateIn.value = ERP.day(Math.max(3, ...lines.map((l) => leadOf(sid, l.itemId))));
      drawSum();
    }
    if (!lines.length) addLine(); if (editing) dateIn.value = editing.expectedDate;
    const collect = () => {
      const ls = lines.filter((l) => l.qty > 0); if (!ls.length) return showErr(err, 'أضف بندًا واحدًا على الأقل بكمية أكبر من صفر.'), null;
      if (new Set(ls.map((l) => l.itemId)).size !== ls.length) return showErr(err, 'يوجد صنف مكرر — اجمع الكمية في بند واحد.'), null;
      if (ls.some((l) => !(l.price >= 0))) return showErr(err, 'سعر غير صحيح.'), null;
      showErr(err, ''); return ls.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price }));
    };
    const doSave = async (submit) => {
      const ls = collect(); if (!ls) return; let po = null, res = null; m.setBusy(true);
      try {
        await SA.api(() => {
          if (editing) {
            const before = { total: F.totals(editing).total, lines: editing.lines.length };
            po = st.patch('purchaseOrders', editing.id, { lines: ls.map((l) => Object.assign({ receivedQty: 0 }, l)), expectedDate: dateIn.value || editing.expectedDate, notes: notesIn.value.trim(), updatedAt: ERP.now() });
            SA.audit('PO.UPDATED', { area: 'scm', target: { type: 'po', id: editing.id, label: ERP.supplierName(editing.supplierId) }, before, after: { total: F.totals(po).total, lines: ls.length } });
          } else {
            po = F.createPO({ supplierId: sid, lines: ls, expectedDate: dateIn.value || ERP.day(7), notes: notesIn.value.trim(), prqIds: o.prqIds || [] });
            if (submit) res = F.submitPO(po.id);
          }
        });
      } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(po);
      const p2 = ERP.find('purchaseOrders', po.id);
      SA.toast(editing ? 'تم حفظ التعديلات على ' + po.id : res === 'approved' ? 'تم إنشاء ' + po.id + ' واعتماده تلقائيًا (أقل من الحد التجريبي)' : res === 'pending_approval' ? 'تم إرسال ' + po.id + ' للاعتماد — ' + (p2 && p2.approvalId) : 'تم حفظ ' + po.id + ' كمسودة', 'success');
      SA.nav('scm/po/' + po.id);
    };
    const foot = editing ? [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: () => doSave(false) }, SA.icon('check', 'icon-sm'), 'حفظ التعديلات')]
      : [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), h('button.btn.btn-ghost', { type: 'button', onclick: () => doSave(false) }, 'حفظ كمسودة'), h('button.btn.btn-primary', { type: 'button', onclick: () => doSave(true) }, SA.icon('send', 'icon-sm'), 'حفظ وإرسال للاعتماد')];
    const m = SA.modal({ title: editing ? 'تعديل أمر الشراء ' + editing.id : 'أمر شراء جديد', subtitle: o.prqIds && o.prqIds.length ? 'من طلبات الشراء: ' + o.prqIds.join('، ') : 'الأصناف المعروضة هي ما يورّده المورد المختار', icon: 'cart', size: 'lg',
      body: h('div.pinv-stack', {}, fld('المورد', supSel), supInfo, h('div', {}, h('div.erp-sub', {}, h('h3', {}, 'البنود'), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { addLine(); draw(); } }, SA.icon('plus', 'icon-sm'), 'إضافة بند')), linesBox), sumBox,
        h('div.pinv-row2', {}, fld('تاريخ التوريد المطلوب', dateIn, 'افتراضيًا: أطول مدة توريد بين البنود'), fld('ملاحظات', notesIn)), err), foot });
    draw(); return m;
  }

  /** receive goods against a PO → ERP.flow.receivePO → GRN (pending incoming QC) */
  function receiveModal(poId) {
    const po = ERP.find('purchaseOrders', poId); if (!po) return;
    if (!SA.can('scm.grn.create')) return noPerm('scm.grn.create');
    const rows = po.lines.map((l) => ({ itemId: l.itemId, ordered: l.qty, rec: l.receivedQty || 0, out: r2(Math.max(0, l.qty - (l.receivedQty || 0))) })).filter((r) => r.out > 0);
    if (!rows.length) return SA.toast('كل البنود مستلمة بالكامل.', 'info');
    const inputs = rows.map((r) => numIn(r.out, { max: r.out, 'aria-label': 'الكمية المستلمة — ' + ERP.itemName(r.itemId) }));
    const dnIn = h('input.input', { type: 'text', placeholder: 'مثال: DN-55210', dir: 'ltr' }); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    const tbl = h('div.table-wrap', {}, h('table.table.pinv-tbl', {}, h('thead', {}, h('tr', {}, ['الصنف', 'المطلوب', 'مستلم سابقًا', 'المتبقي', 'المستلم الآن', 'المخزن'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r, i) => h('tr', {}, h('td', {}, U.itemCell(r.itemId)), h('td.num', {}, qty(r.ordered, uomOf(r.itemId))), h('td.num', {}, qty(r.rec, uomOf(r.itemId))), h('td.num', {}, h('b', {}, qty(r.out, uomOf(r.itemId)))), h('td', {}, inputs[i]), h('td', {}, whName(K.defaultWh(r.itemId))))))));
    const save = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      const lines = rows.map((r, i) => ({ itemId: r.itemId, qty: Number(inputs[i].value) || 0 }));
      if (lines.some((l, i) => l.qty < 0 || l.qty > rows[i].out + 0.001)) return showErr(err, 'الكمية لا يمكن أن تتجاوز المتبقي على أمر الشراء.');
      if (!lines.some((l) => l.qty > 0)) return showErr(err, 'اكتب كمية مستلمة لبند واحد على الأقل.');
      let grn = null; m.setBusy(true);
      try { await SA.api(() => { grn = F.receivePO(poId, lines.filter((l) => l.qty > 0)); if (grn && dnIn.value.trim()) st.patch('grns', grn.id, { supplierDn: dnIn.value.trim() }); }); } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(grn); SA.toast('تم الاستلام ' + grn.id + ' — أُرسل فحص الاستلام للجودة', 'success'); SA.nav('scm/grn/' + grn.id);
    } }, SA.icon('inbox', 'icon-sm'), 'تسجيل الاستلام');
    const m = SA.modal({ title: 'استلام بضاعة — ' + po.id, subtitle: ERP.supplierName(po.supplierId), icon: 'inbox', size: 'lg',
      body: h('div.pinv-stack', {}, SA.alert('info', 'البضاعة تدخل «فحص استلام» أولًا ولا تُضاف للرصيد إلا بعد قرار الجودة؛ عند القبول تُسجّل فاتورة المورد تلقائيًا.'), tbl, fld('رقم إذن تسليم المورد (اختياري)', dnIn), err),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), save] });
    return m;
  }

  /** A4 purchase order (company header from settings.company) */
  function poSheet(po) {
    const co = st.get('settings.company') || {}; const s = sup(po.supplierId) || {}; const t = F.totals(po); const sp = canPrice();
    const ap = po.approvalId ? ERP.find('approvals', po.approvalId) : null; const approver = ap ? (ap.chain.filter((c) => c.decidedBy).map((c) => SA.userName(c.decidedBy)).join(' / ') || '—') : po.approvedAt ? 'اعتماد تلقائي (أقل من الحد)' : '—';
    const c0 = (s.contacts || [])[0];
    return h('div.pinv-a4', { dir: 'rtl' },
      h('div.pinv-a4-head', {}, h('div.pinv-a4-co', {}, h('img', { src: '../../assets/images/logo/wordmark-color.png', alt: co.nameAr || '' }), h('b', {}, co.nameAr || ''), co.nameEn ? h('small', {}, co.nameEn) : null,
        h('small', {}, [co.address, co.phone ? 'هاتف ' + co.phone : null, co.email].filter(Boolean).join(' · ')), h('small', {}, 'الرقم الضريبي: ' + (co.taxId || 'Open (بند 11)') + ' · السجل التجاري: ' + (co.commercialReg || 'Open'))),
        h('div.pinv-a4-title', {}, h('h2', {}, 'أمر شراء'), h('small', {}, 'Purchase Order'), h('b', {}, po.id), h('small', {}, 'التاريخ: ' + fmt.date(po.createdAt)), h('small', {}, 'الحالة: ' + ((C.status.po[po.status] || [po.status])[0])))),
      h('div.pinv-a4-grid', {}, h('div.pinv-a4-box', {}, h('small', {}, 'المورد'), h('b', {}, s.name || po.supplierId), h('div', {}, (s.code || '') + (s.country ? ' · ' + s.country : '')), c0 ? h('div', {}, c0.name + ' — ', h('span.num', {}, c0.phone || '')) : null),
        h('div.pinv-a4-box', {}, h('small', {}, 'شروط التوريد'), h('div', {}, 'تاريخ التوريد المطلوب: ', h('b.num', { style: { display: 'inline' } }, fmt.date(po.expectedDate))), h('div', {}, 'مكان التسليم: المصنع — جمصة (' + whName(K.defaultWh((po.lines[0] || {}).itemId)) + ')'), h('div', {}, 'شروط الدفع: ' + (s.termsDays != null ? s.termsDays + ' يوم' : 'Open') + ' · العملة: ج.م'))),
      h('table', {}, h('thead', {}, h('tr', {}, ['م', 'الكود', 'الصنف', 'الوحدة', 'الكمية', 'سعر الوحدة', 'الإجمالي'].map((x) => h('th', {}, x)))),
        h('tbody', {}, po.lines.map((l, i) => { const it = item(l.itemId) || {}; return h('tr', {}, h('td.num', {}, i + 1), h('td.num', {}, it.code || l.itemId), h('td', {}, it.name || l.itemId), h('td', {}, ERP.uom[it.uom] || it.uom || ''), h('td.num', {}, num(l.qty, 2)), h('td.num', {}, priceTxt(l.price)), h('td.num', {}, priceTxt(l.qty * l.price))); }))),
      sp ? h('div.pinv-a4-tot', {}, h('div', {}, h('span', {}, 'الإجمالي قبل الضريبة'), h('b.num', {}, fmt.money(t.net))), h('div', {}, h('span', {}, 'ضريبة القيمة المضافة ' + Math.round(ERP.taxRate() * 100) + '%' + (ERP.taxIsDemo() ? ' (تجريبي)' : '')), h('b.num', {}, fmt.money(t.tax))), h('div', {}, h('span', {}, 'الإجمالي'), h('b.num', {}, fmt.money(t.total))))
        : h('p', {}, 'القيم المالية مخفية حسب صلاحياتك.'),
      po.notes ? h('p', {}, h('b', {}, 'ملاحظات: '), po.notes) : null,
      h('div.pinv-a4-terms', {}, h('b', {}, 'الشروط العامة'), h('ol', {}, ['تُرفق شهادة مطابقة (COA) مع كل دفعة خامات.', 'البضاعة تخضع لفحص الاستلام بالمصنع، والمرفوض يُرتجع على حساب المورد.', 'يُذكر رقم أمر الشراء على إذن التسليم والفاتورة الضريبية.', 'أي تأخير عن تاريخ التوريد يُبلّغ كتابيًا قبلها بـ 48 ساعة.'].map((x) => h('li', {}, x)))),
      h('div.pinv-a4-sign', {}, h('div', {}, 'إعداد: ' + SA.userName(po.buyerId)), h('div', {}, 'اعتماد: ' + approver), h('div', {}, 'توقيع وختم المورد')),
      h('p.pinv-a4-foot', {}, 'مستند من نموذج تجريبي للنظام — البيانات الرسمية للشركة (الرقم الضريبي/السجل) Open ولا يوجد ربط بمنظومة الفاتورة الإلكترونية.'));
  }
  function poPreview(po) {
    const sheet = poSheet(po);
    const m = SA.modal({ title: 'معاينة أمر الشراء ' + po.id, subtitle: 'تنسيق A4 للطباعة أو الإرسال للمورد', icon: 'doc', size: 'xl', body: h('div', { style: { background: 'var(--color-bg-alt)', padding: '14px', borderRadius: '12px' } }, sheet),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إغلاق'), h('button.btn.btn-primary', { type: 'button', onclick: () => printNode(sheet) }, SA.icon('doc', 'icon-sm'), 'طباعة')] });
  }

  /** stock transfer between warehouses (ERP.stock.transfer + STOCK.TRANSFERRED) */
  function transferModal(o) {
    o = o || {}; if (!SA.can('scm.transfers.create')) return noPerm('scm.transfers.create');
    const whs = whList(); let from = o.from || W.FG; let to = o.to || (from === W.QRT ? K.defaultWh(o.itemId) : from === W.FG ? W.SHOW : W.FG);
    let lines = o.itemId ? [{ itemId: o.itemId, qty: o.qty || 1 }] : [];
    const kindAuto = () => (from === W.QRT ? 'quarantine_release' : to === W.QRT ? 'quarantine' : to === W.SHOW ? 'showroom' : 'rebalance');
    let kind = o.kind || kindAuto();
    const fromSel = selectOf(whs.map((w) => [w.id, w.name]), from, (v) => { from = v; if (to === from) to = whs.find((w) => w.id !== from).id; toSel.value = to; kind = kindAuto(); kindSel.value = kind; lines = []; draw(); }, 'من مخزن');
    const toSel = selectOf(whs.map((w) => [w.id, w.name]), to, (v) => { to = v; kind = kindAuto(); kindSel.value = kind; draw(); }, 'إلى مخزن');
    const kindSel = selectOf(Object.keys(TR_KIND).map((k) => [k, TR_KIND[k]]), kind, (v) => { kind = v; }, 'نوع التحويل');
    const noteIn = h('textarea.textarea', { rows: 2, placeholder: 'السبب / ملاحظة (مطلوب للإفراج من الحجر)' }, o.note || '');
    const box = h('div.pinv-lines'); const warn = h('div'); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    const availItems = () => col('stock').filter((r) => r.whId === from && K.available(r.itemId, from) > 0).map((r) => item(r.itemId)).filter(Boolean);
    function draw() {
      SA.clear(box); const list = availItems();
      if (!list.length) box.appendChild(SA.empty({ icon: 'box', title: 'لا يوجد رصيد متاح في ' + whName(from) }));
      if (!lines.length && list.length) lines.push({ itemId: list[0].id, qty: 1 });
      lines = lines.filter((l) => list.some((i) => i.id === l.itemId));
      lines.forEach((l, i) => {
        const av = K.available(l.itemId, from);
        box.appendChild(h('div.pinv-line', { style: { gridTemplateColumns: 'minmax(200px,1fr) 120px 150px 40px' } }, fld('الصنف', itemSelect(list, l.itemId, (v) => { l.itemId = v; l.qty = Math.min(l.qty, K.available(v, from)); draw(); })),
          fld('الكمية', numIn(l.qty, { max: av, oninput: (e) => { l.qty = Number(e.target.value) || 0; } })), h('div.field', {}, h('span.label', {}, 'المتاح في المصدر'), h('b.num.pinv-line-tot', {}, qty(av, uomOf(l.itemId)))),
          h('button.btn.btn-ghost.btn-icon', { type: 'button', 'aria-label': 'حذف', disabled: lines.length < 2, onclick: () => { lines.splice(i, 1); draw(); } }, SA.icon('trash', 'icon-sm'))));
      });
      SA.clear(warn);
      if (from === W.QRT) warn.appendChild(SA.alert('warning', 'الإفراج من منطقة الحجر يتطلب قرار جودة (NCR) — اكتب رقم القرار أو السبب.'));
      if (to === W.QRT) warn.appendChild(SA.alert('info', 'التحويل للحجر يخرج الكمية من الرصيد المتاح للبيع/الإنتاج حتى قرار الجودة.'));
    }
    const save = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      if (from === to) return showErr(err, 'اختر مخزنين مختلفين.');
      const ls = lines.filter((l) => l.qty > 0); if (!ls.length) return showErr(err, 'أضف صنفًا بكمية أكبر من صفر.');
      const bad = ls.find((l) => l.qty > K.available(l.itemId, from) + 0.001); if (bad) return showErr(err, 'الكمية أكبر من المتاح لـ ' + ERP.itemName(bad.itemId) + '.');
      const note = noteIn.value.trim(); if (from === W.QRT && note.length < 3) return showErr(err, 'اكتب سبب/قرار الإفراج من الحجر.');
      let id = null; m.setBusy(true);
      try { await SA.api(() => { ensure('transfers'); id = ERP.no('ST'); ls.forEach((l) => K.transfer(l.itemId, from, to, l.qty, { type: 'transfer', id }, note || TR_KIND[kind]));
        st.insert('transfers', { id, fromWh: from, toWh: to, kind, lines: ls.map((l) => ({ itemId: l.itemId, qty: l.qty })), by: me(), at: ERP.now(), note, status: 'done' }, true);
        SA.audit('STOCK.TRANSFERRED', { area: 'scm', target: { type: 'transfer', id, label: whName(from) + ' ← ' + whName(to) }, after: { from, to, lines: ls.length, items: ls.map((l) => ERP.itemName(l.itemId) + ' × ' + l.qty).join('، ') }, reason: note || TR_KIND[kind] }); }); } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(id); SA.toast('تم التحويل ' + id + ' من ' + whName(from) + ' إلى ' + whName(to), 'success'); if (o.after) o.after(id);
    } }, SA.icon('swap', 'icon-sm'), 'تنفيذ التحويل');
    const m = SA.modal({ title: 'تحويل بين المخازن', subtitle: 'إذن تحويل مخزني (ST) — يُسجّل حركتين: خروج من المصدر ودخول للوجهة', icon: 'swap', size: 'lg',
      body: h('div.pinv-stack', {}, h('div.pinv-row2', {}, fld('من مخزن', fromSel), fld('إلى مخزن', toSel), fld('نوع التحويل', kindSel)), warn, h('div', {}, h('div.erp-sub', {}, h('h3', {}, 'الأصناف'), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { const l = availItems().find((i) => !lines.some((x) => x.itemId === i.id)); if (l) { lines.push({ itemId: l.id, qty: 1 }); draw(); } } }, SA.icon('plus', 'icon-sm'), 'إضافة صنف')), box), fld('السبب / ملاحظة', noteIn), err),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), save] });
    draw(); return m;
  }

  /** stock adjustment (ERP.stock.move type 'adjust' + STOCK.ADJUSTED, reason required, step-up) */
  function adjustModal(o) {
    o = o || {}; if (!SA.can('scm.stock.adjust')) return noPerm('scm.stock.adjust');
    const all = col('items'); let itemId = o.itemId || (all[0] || {}).id; let whId = o.whId || K.defaultWh(itemId);
    const cur = () => { const r = K.row(itemId, whId); return r ? r.qty : 0; };
    const newIn = numIn(cur(), { style: { width: '100%' } }); const info = h('div'); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    const whSel = selectOf(whList().map((w) => [w.id, w.name]), whId, (v) => { whId = v; newIn.value = cur(); draw(); }, 'المخزن');
    const sel = itemSelect(all, itemId, (v) => { itemId = v; whId = K.defaultWh(v); whSel.value = whId; newIn.value = cur(); draw(); });
    newIn.addEventListener('input', () => draw());
    function draw() { const it = item(itemId) || {}; const c = cur(); const n = Number(newIn.value); const d = isNaN(n) ? 0 : r2(n - c); SA.clear(info); info.append(infoBox([['الرصيد الدفتري', qty(c, it.uom)], ['محجوز', qty((K.row(itemId, whId) || {}).reserved || 0, it.uom)], ['الفرق', h('span.' + (d < 0 ? 'pinv-neg' : d > 0 ? 'pinv-pos' : 'pinv-muted'), {}, (d > 0 ? '+' : '') + qty(d, it.uom))], ['قيمة الفرق', U.cost(d * (it.stdCost || 0))]])); }
    const go = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      const it = item(itemId) || {}; const c = cur(); const n = Number(newIn.value); if (isNaN(n) || n < 0) return showErr(err, 'اكتب الرصيد الفعلي (صفر أو أكثر).'); const d = r2(n - c); if (!d) return showErr(err, 'لا يوجد فرق للتسوية.');
      const r = K.row(itemId, whId); if (r && n < (r.reserved || 0)) return showErr(err, 'الرصيد الجديد أقل من الكمية المحجوزة لأوامر البيع (' + r.reserved + ').');
      const cf = await SA.confirm({ title: 'تأكيد تسوية مخزون', danger: d < 0, icon: 'alert', impact: [it.name + ' — ' + whName(whId), 'من ' + qty(c, it.uom) + ' إلى ' + qty(n, it.uom) + ' (' + (d > 0 ? '+' : '') + num(d, 2) + ')', canCost() ? 'أثر القيمة: ' + fmt.money(d * (it.stdCost || 0)) : 'أثر القيمة: سري'], reasonRequired: true, reasonLabel: 'سبب التسوية', reasonPlaceholder: 'مثال: تلف أثناء التداول / فرق عد / خطأ إدخال سابق', confirmLabel: 'تنفيذ التسوية' });
      if (!cf.ok) return; if (!(await SA.stepUp('stock.adjust', { text: 'تسوية المخزون عملية حساسة. أدخل كلمة المرور أو كود التحقق.' }))) return;
      m.setBusy(true);
      try { await SA.api(() => { K.move({ itemId, whId, qty: d, type: 'adjust', ref: null, note: 'تسوية: ' + cf.reason });
        SA.audit('STOCK.ADJUSTED', { area: 'scm', target: { type: 'item', id: itemId, label: it.name + ' — ' + whName(whId) }, before: { qty: c }, after: { qty: n, delta: d }, reason: cf.reason });
        if (Math.abs(d * (it.stdCost || 0)) > 10000) SA.notify({ title: 'تسوية مخزون كبيرة: ' + it.code, body: whName(whId) + ' — فرق ' + num(d, 2) + ' ' + (ERP.uom[it.uom] || '') + '. السبب: ' + cf.reason, level: 'info', to: ['R-01', 'R-22'], link: '#/scm/stock/' + itemId }); }); } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(true); SA.toast('تمت التسوية — ' + it.code + ' (' + (d > 0 ? '+' : '') + num(d, 2) + ')', 'success');
    } }, SA.icon('edit', 'icon-sm'), 'متابعة');
    const m = SA.modal({ title: 'تسوية رصيد مخزون', subtitle: 'تُسجَّل كحركة «تسوية» في كارت الصنف وسجل التدقيق (يتطلب سببًا وإعادة تحقق)', icon: 'edit', size: 'md',
      body: h('div.pinv-stack', {}, fld('الصنف', sel), fld('المخزن', whSel), info, fld('الرصيد الفعلي بعد التسوية', newIn), err), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), go] });
    draw(); return m;
  }

  /* ═════════════ 1. dashboard (scm/dashboard) ═════════════ */
  const lowItems = () => col('items').filter((i) => i.reorderPoint > 0 && K.qty(i.id) <= i.reorderPoint);
  function purchasesByMonth(keys) {
    const m = {}; keys.forEach((k) => { m[k] = 0; });
    col('journal').forEach((je) => { const k = String(je.date || '').slice(0, 7); if (!(k in m)) return; if (!((je.ref && je.ref.type === 'bill') || /^مشتريات/.test(je.memo || ''))) return; je.lines.forEach((l) => { if ((l.acc === '1141' || l.acc === '1144') && l.dr) m[k] += l.dr; }); });
    return keys.map((k) => Math.round(m[k]));
  }
  function receiptsByMonth(keys) { const m = {}; keys.forEach((k) => { m[k] = 0; }); col('supHistory').forEach((x) => { const k = String(x.received).slice(0, 7); if (k in m) m[k]++; }); col('grns').forEach((g) => { const k = String(g.at).slice(0, 7); if (k in m) m[k]++; }); return keys.map((k) => m[k]); }
  function localInsights() {
    const out = [];
    const risk = buyItems().map((i) => ({ i, c: coverDays(i.id) })).filter((x) => x.c != null && x.c < (x.i.leadDays || 7)).sort((a, b) => a.c / (a.i.leadDays || 7) - b.c / (b.i.leadDays || 7));
    if (risk[0]) {
      const x = risk[0]; const rfq = col('rfqs').find((r) => r.itemId === x.i.id && r.status !== 'awarded' && r.status !== 'cancelled'); const prq = openPrqFor(x.i.id);
      out.push({ tone: 'danger', title: '«' + x.i.name + '» يكفي ' + Math.round(x.c) + ' يوم فقط ومدة توريده ' + (x.i.leadDays || 7) + ' يوم', text: 'المتاح ' + qty(K.available(x.i.id), x.i.uom) + ' والاستهلاك ≈ ' + qty(dailyUse(x.i.id), x.i.uom) + ' يوميًا. ' + (rfq ? 'عروض الأسعار جاهزة: الأنسب توريد عاجل من مورد محلي لتغطية الفجوة ثم الاستيراد للباقي.' : 'يُنصح بإصدار أمر شراء الآن لتفادي توقف الخط.'),
        actions: [rfq ? { label: 'مقارنة العروض ' + rfq.id, route: 'scm/rfq/' + rfq.id } : prq ? { label: 'طلب الشراء ' + prq.id, route: 'scm/requisitions?q=' + prq.id } : { label: 'كارت الصنف', route: 'scm/stock/' + x.i.id }] });
    }
    const sc = col('suppliers').map((s) => scorecard(s.id)).filter((c) => c.onTime != null && (c.open.length || c.late.length)).sort((a, b) => a.onTime - b.onTime)[0];
    if (sc && sc.onTime < 0.8) out.push({ tone: 'warning', title: 'المورد «' + sc.s.name + '» ملتزم بالمواعيد ' + Math.round(sc.onTime * 100) + '% فقط', text: 'متوسط التأخير ' + Math.round(sc.avgDelay) + ' أيام' + (sc.late.length ? '، وعليه ' + sc.late.length + ' أمر شراء متأخر الآن' : '') + '. اطلب عروض أسعار من مورد بديل أو أضف هامش أمان لمدة التوريد.', actions: [{ label: 'بطاقة المورد', route: 'scm/suppliers/' + sc.s.id }] });
    const use = usage(30); const slow = col('items').filter((i) => i.kind === 'fg' && K.qty(i.id, W.FG) > 0 && !use[i.id]);
    if (slow.length) out.push({ tone: 'info', title: slow.length + ' صنف منتج تام بدون حركة بيع خلال 30 يوم', text: 'مثل ' + slow.slice(0, 2).map((i) => i.code).join(' و') + '. فكّر في عرض تصريف للتجار أو عينات لصالة العرض.', actions: [{ label: 'أرصدة المنتج التام', route: 'scm/stock?kind=fg' }] });
    return out.slice(0, 3).map((x) => U.aiCard(x));
  }
  function attention() {
    const out = []; const seen = new Set();
    col('maintenanceOrders').filter((mw) => mw.status === 'waiting_parts').forEach((mw) => (mw.parts || []).forEach((p) => {
      if (K.qty(p.itemId) >= p.qty) return; seen.add(p.itemId); const prq = openPrqFor(p.itemId); const ap = col('approvals').find((a) => a.ref && a.ref.id === mw.id && a.status === 'pending'); const ln = ERP.line(mw.lineId);
      out.push({ tone: 'danger', icon: 'wrench', title: 'قطعة غيار رصيدها ' + num(K.qty(p.itemId)) + ': ' + ERP.itemName(p.itemId), text: 'أمر الصيانة ' + mw.id + ' متوقف بانتظارها' + (ln ? ' — ' + ln.name + (ln.status === 'down' ? ' متوقف الآن' : '') : '') + '.',
        actions: [link(mw.id), prq ? link(prq.id) : SA.btn({ label: 'طلب شراء عاجل', size: 'sm', kind: 'ghost', icon: 'clipboard', perm: 'scm.requisitions.create', onClick: () => newPRQ({ itemId: p.itemId, qty: p.qty, reason: 'عطل ' + mw.machineId + ' — ' + mw.id, source: 'maintenance' }) }), ap ? link(ap.id) : null] });
    }));
    const risk = buyItems().filter((i) => !seen.has(i.id)).map((i) => { const c = coverDays(i.id); const low = i.reorderPoint > 0 && K.qty(i.id) <= i.reorderPoint; const r = c != null && c < (i.leadDays || 7); return { i, c, low, r }; }).filter((x) => x.low || x.r)
      .sort((a, b) => (a.c == null ? 9 : a.c / (a.i.leadDays || 7)) - (b.c == null ? 9 : b.c / (b.i.leadDays || 7))).slice(0, 5);
    risk.forEach((x) => { const prq = openPrqFor(x.i.id); const oo = K.onOrder(x.i.id);
      out.push({ tone: x.r ? 'danger' : 'warning', icon: x.r ? 'alert' : 'box', title: (x.r ? 'خطر نفاد: ' : 'تحت حد الطلب: ') + x.i.name, text: 'المتاح ' + qty(K.available(x.i.id), x.i.uom) + ' · حد الطلب ' + qty(x.i.reorderPoint, x.i.uom) + (x.c != null ? ' · يكفي ≈ ' + Math.round(x.c) + ' يوم مقابل توريد ' + (x.i.leadDays || 7) + ' يوم' : '') + (oo ? ' · على أوامر شراء ' + qty(oo, x.i.uom) : ' · لا يوجد أمر شراء مفتوح') + (x.i.leadDays >= 30 ? ' (استيراد)' : ''),
        actions: [prq ? link(prq.id) : SA.btn({ label: 'طلب شراء', size: 'sm', kind: 'ghost', icon: 'clipboard', perm: 'scm.requisitions.create', onClick: () => newPRQ({ itemId: x.i.id, reason: 'تحت حد الطلب', source: 'reorder' }) }), linkBtn('كارت الصنف', 'scm/stock/' + x.i.id, 'box')] }); });
    col('purchaseOrders').filter(poLate).forEach((p) => out.push({ tone: 'warning', icon: 'clock', title: 'أمر شراء متأخر: ' + p.id, text: ERP.supplierName(p.supplierId) + ' — كان موعده ' + fmt.date(p.expectedDate) + ' (متأخر ' + ERP.daysBetween(p.expectedDate) + ' يوم) · مستلم ' + Math.round(poRecvPct(p) * 100) + '%', actions: [link(p.id)] }));
    col('purchaseOrders').filter((p) => p.status === 'pending_approval').forEach((p) => out.push({ tone: 'info', icon: 'inbox', title: 'أمر شراء بانتظار الاعتماد: ' + p.id, text: ERP.supplierName(p.supplierId) + (canPrice() ? ' — ' + fmt.money(poNet(p)) : '') + ' · ' + SA.fmt.rel(p.createdAt), actions: [link(p.id), p.approvalId ? link(p.approvalId) : null] }));
    col('grns').filter((g) => g.status === 'pending_qc').forEach((g) => out.push({ tone: 'warning', icon: 'beaker', title: 'استلام بانتظار فحص الجودة: ' + g.id, text: ERP.supplierName(g.supplierId) + ' — ' + g.lines.map((l) => ERP.itemName(l.itemId) + ' ' + qty(l.qty, uomOf(l.itemId))).join('، ') + ' · ' + SA.fmt.rel(g.at), actions: [link(g.id)].concat((g.qcIds || []).map((q) => link(q))) }));
    col('stock').filter((r) => r.whId === W.QRT && r.qty > 0).forEach((r) => { const n = col('ncrs').find((x) => x.itemId === r.itemId && x.status !== 'closed');
      out.push({ tone: 'info', icon: 'shield', title: 'رصيد في منطقة الحجر: ' + ERP.itemName(r.itemId), text: qty(r.qty, uomOf(r.itemId)) + (n ? ' — ' + n.id + ' (' + (C.status.ncr[n.status] || [n.status])[0] + (n.disposition ? '، القرار: ' + n.disposition : '') + ')' : ''), actions: [linkBtn('منطقة الحجر', 'scm/transfers?tab=quarantine', 'shield'), n ? link(n.id) : null] }); });
    const openPrq = col('purchaseRequisitions').filter((r) => r.status === 'open');
    if (openPrq.length) out.push({ tone: 'info', icon: 'clipboard', title: openPrq.length + ' طلب شراء داخلي بانتظار الاعتماد', text: openPrq.slice(0, 3).map((r) => ERP.itemName(r.itemId)).join('، '), actions: [linkBtn('طلبات الشراء', 'scm/requisitions?status=open', 'clipboard')] });
    col('counts').filter((c) => c.status === 'review').forEach((c) => out.push({ tone: 'info', icon: 'list', title: 'جرد بانتظار الترحيل: ' + c.id, text: whName(c.whId) + ' — ' + c.lines.filter((l) => l.countedQty != null && l.countedQty !== l.systemQty).length + ' فرق', actions: [link(c.id)] }));
    const rank = { danger: 0, warning: 1, info: 2 };
    return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 10);
  }
  function renderDashboard(root, ctx) {
    page(ctx, [{ label: 'لوحة الإمداد' }]);
    return SA.live(root, () => {
      const pos = col('purchaseOrders'); const val = K.value(); const low = lowItems(); const open = pos.filter(poOpen); const late = pos.filter(poLate); const pend = col('grns').filter((g) => g.status === 'pending_qc');
      const dToday = col('deliveries').filter((d) => d.plannedDate === today() && ['planned', 'loading'].indexOf(d.status) >= 0);
      const use = usage(30); let outVal = 0; Object.keys(use).forEach((id) => { const it = item(id); if (it) outVal += use[id] * (it.stdCost || 0); });
      const invVal = val - K.value(W.QRT); const turn = invVal ? (outVal * 365 / 30) / invVal : null; const dCov = outVal ? invVal / (outVal / 30) : null;
      const kpis = U.kpis([
        U.kpi({ label: 'قيمة المخزون (تكلفة معيارية)', value: canCost() ? fmt.short(val) : U.cost(val), sub: canCost() ? 'خامات ' + fmt.short(K.value(W.RM)) + ' · تام ' + fmt.short(K.value(W.FG)) : col('stock').filter((r) => r.qty > 0).length + ' رصيد صنف×مخزن', icon: 'coins', href: '#/scm/stock' }),
        U.kpi({ label: 'أصناف تحت حد الطلب', value: num(low.length), sub: low.slice(0, 3).map((i) => i.code).join('، ') || 'لا يوجد', tone: low.length ? 'danger' : 'success', icon: 'alert', href: '#/scm/stock?below=1' }),
        U.kpi({ label: 'أوامر شراء مفتوحة', value: num(open.length), sub: canPrice() ? 'متبقي للتوريد ' + fmt.short(sum(open, poOutstanding)) : pos.filter((p) => p.status === 'pending_approval').length + ' بانتظار الاعتماد', icon: 'cart', href: '#/scm/po?status=open' }),
        U.kpi({ label: 'أوامر شراء متأخرة', value: num(late.length), sub: late.length ? late.map((p) => ERP.supplierName(p.supplierId)).slice(0, 1).join('') : 'كل التوريدات في موعدها', tone: late.length ? 'warning' : 'success', icon: 'clock', href: '#/scm/po?late=1' }),
        U.kpi({ label: 'استلامات بانتظار الجودة', value: num(pend.length), sub: pend.length ? pend.map((g) => g.id).join('، ') : 'لا يوجد', tone: pend.length ? 'warning' : null, icon: 'inbox', href: '#/scm/grn?status=pending_qc' }),
        U.kpi({ label: 'تسليمات مخططة اليوم', value: num(dToday.length), sub: dToday.length ? dToday.map((d) => ERP.customerName(d.customerId)).slice(0, 1).join('') : 'لا يوجد تحميل اليوم', icon: 'truck', href: SA.can('scm.deliveries.view') ? '#/scm/deliveries' : null }),
        U.kpi({ label: 'دوران المخزون (سنوي)', value: turn ? turn.toFixed(1) + '×' : '—', sub: [dCov ? 'تغطية ≈ ' + Math.round(dCov) + ' يوم ' : '', U.demo('تقدير')], icon: 'refresh' })
      ]);
      const whRows = whList().map((w) => ({ w, val: K.value(w.id), skus: col('stock').filter((r) => r.whId === w.id && r.qty > 0).length }));
      const donut = canCost() ? CH.donut(whRows.filter((x) => x.val > 0).map((x) => ({ label: x.w.name, value: Math.round(x.val) })), { center: fmt.short(val).replace(' ج.م', ''), sub: 'ج.م', fmt: fmt.short, title: 'قيمة المخزون حسب المخزن' })
        : CH.donut(whRows.filter((x) => x.skus > 0).map((x) => ({ label: x.w.name, value: x.skus })), { center: num(sum(whRows, (x) => x.skus)), sub: 'رصيد', title: 'الأصناف بالرصيد حسب المخزن' });
      const keys = ERP.monthKeys(6); const lbl = keys.map(ERP.monthLabel);
      const purch = canPrice() ? SA.card({ title: 'المشتريات — آخر 6 شهور', tags: U.demo('من القيود المرحّلة') }, CH.columns({ labels: lbl, series: [{ name: 'مشتريات خامات وتغليف وقطع غيار', values: purchasesByMonth(keys) }], title: 'المشتريات الشهرية' }))
        : SA.card({ title: 'عدد الاستلامات — آخر 6 شهور', tags: lockTag('القيم المالية لفريق المشتريات والمالية') }, CH.columns({ labels: lbl, series: [{ name: 'استلامات', values: receiptsByMonth(keys) }], fmt: (v) => num(Math.round(v)), title: 'عدد الاستلامات' }));
      const scs = col('suppliers').map((s) => scorecard(s.id)).filter((c) => c.onTime != null).sort((a, b) => b.onTime - a.onTime);
      const onTime = hbars(scs.map((c) => ({ label: c.s.name, sub: c.deliveries + ' توريد · ' + (isImport(c.s) ? 'استيراد' : 'محلي'), value: c.onTime * 100, text: Math.round(c.onTime * 100) + '%', color: c.onTime >= 0.9 ? 'var(--color-success)' : c.onTime >= 0.75 ? 'var(--color-warning)' : 'var(--color-danger)', href: '#/scm/suppliers/' + c.s.id })), 100);
      const top = Object.keys(use).map((id) => ({ it: item(id), q: use[id] })).filter((x) => x.it && x.it.kind !== 'fg').map((x) => Object.assign(x, { v: x.q * (x.it.stdCost || 0), rel: x.q / Math.max(1, x.it.reorderPoint || 1) }))
        .sort((a, b) => (canCost() ? b.v - a.v : b.rel - a.rel)).slice(0, 7);
      const topEl = top.length ? hbars(top.map((x, i) => ({ label: x.it.name, sub: canCost() ? qty(x.q, x.it.uom) + ' خلال 30 يوم' : 'نسبة لحد الطلب', value: canCost() ? x.v : x.rel, text: canCost() ? fmt.short(x.v) : qty(x.q, x.it.uom), color: ERP.palette[i % 4], href: '#/scm/stock/' + x.it.id }))) : SA.empty({ icon: 'activity', title: 'لا توجد حركات صرف خلال 30 يوم' });
      const ai = U.insights('scm'); const cards = ai.length ? ai : localInsights();
      return h('div', {},
        SA.pageHead({ title: 'لوحة المشتريات والمخازن', desc: 'الأرصدة وحدود الطلب، أوامر الشراء ومواعيد التوريد، الاستلام وفحص الجودة — لحظيًا من نفس البيانات.', tags: [SA.tag('new', 'ERP')],
          actions: [SA.btn({ label: 'طلب شراء', icon: 'clipboard', kind: 'ghost', perm: 'scm.requisitions.create', onClick: () => newPRQ() }), SA.btn({ label: 'أمر شراء جديد', icon: 'plus', perm: 'scm.po.create', onClick: () => poForm() })] }),
        kpis,
        U.grid(2, SA.card({ title: canCost() ? 'قيمة المخزون حسب المخزن' : 'الأصناف بالرصيد حسب المخزن', tags: canCost() ? null : lockTag('القيمة سرية — تحتاج data.cost.view') }, donut), purch),
        U.grid(2, SA.card({ title: 'التزام الموردين بالمواعيد', tags: U.demo('سجل 12 شهر') }, onTime), SA.card({ title: 'أعلى الخامات استهلاكًا — 30 يوم' }, topEl)),
        h('div.pinv-split', {}, SA.card({ title: 'يحتاج انتباهك', actions: [linkBtn('كل الأرصدة', 'scm/stock', 'box')] }, attnList(attention())),
          SA.card({ title: 'توصيات ذكية', tags: U.demo('تجريبي') }, cards.length ? h('div.pinv-stack', {}, cards) : SA.empty({ icon: 'sparkle', title: 'لا توجد توصيات الآن' }))));
    }, ['stock', 'stockMoves', 'purchaseOrders', 'purchaseRequisitions', 'grns', 'deliveries', 'approvals', 'suppliers', 'rfqs', 'counts']);
  }

  /* ═════════════ 2. purchase requisitions (scm/requisitions) ═════════════ */
  function prqSourceCell(r) {
    const s = SRC[r.source] || [r.source, 'neutral'];
    const mw = r.source === 'maintenance' ? col('maintenanceOrders').find((m) => (m.parts || []).some((p) => p.itemId === r.itemId) && ['done', 'cancelled'].indexOf(m.status) < 0) : null;
    return h('span.pinv-cell', {}, SA.chip(s[0], s[1]), r.woId ? link(r.woId) : mw ? link(mw.id) : null);
  }
  const canApprovePRQ = (r) => (!SA.can('scm.requisitions.approve') ? 'ليست من صلاحياتك (scm.requisitions.approve)' : r.requestedBy === me() ? 'لا يمكنك اعتماد طلب أنشأته (فصل المهام)' : '');
  async function approvePRQ(ids) {
    if (!SA.can('scm.requisitions.approve')) return noPerm('scm.requisitions.approve');
    const all = ids.map((id) => ERP.find('purchaseRequisitions', id)).filter((r) => r && r.status === 'open'); const ok = all.filter((r) => !canApprovePRQ(r)); const own = all.filter((r) => canApprovePRQ(r));
    if (!ok.length) return SA.toast(own.length ? 'لا يمكنك اعتماد طلب أنشأته (فصل المهام).' : 'لا توجد طلبات مفتوحة في التحديد.', 'warn');
    const c = await SA.confirm({ title: 'اعتماد ' + ok.length + ' طلب شراء', impact: ok.map((r) => r.id + ' — ' + ERP.itemName(r.itemId) + ' · ' + qty(r.qty, uomOf(r.itemId))), warnings: own.length ? ['تم استبعاد ' + own.length + ' طلب أنشأته أنت (فصل المهام).'] : [], confirmLabel: 'اعتماد' });
    if (!c.ok) return;
    try { await SA.api(() => ok.forEach((r) => { st.patch('purchaseRequisitions', r.id, { status: 'approved', approvedBy: me(), approvedAt: ERP.now() });
      SA.audit('PRQ.APPROVED', { area: 'scm', target: { type: 'prq', id: r.id, label: ERP.itemName(r.itemId) }, before: { status: 'open' }, after: { status: 'approved', qty: r.qty } });
      if (r.requestedBy && r.requestedBy !== me()) SA.notify({ title: 'تم اعتماد طلب الشراء ' + r.id, body: ERP.itemName(r.itemId) + ' — جاري إصدار أمر الشراء.', level: 'info', toUsers: [r.requestedBy], link: '#/scm/requisitions?q=' + r.id }); })); } catch (e) { return SA.fail(e); }
    SA.toast('تم اعتماد ' + ok.length + ' طلب شراء', 'success');
  }
  async function rejectPRQ(id) {
    if (!SA.can('scm.requisitions.approve')) return noPerm('scm.requisitions.approve');
    const r = ERP.find('purchaseRequisitions', id); if (!r || ['open', 'approved'].indexOf(r.status) < 0) return;
    const c = await SA.confirm({ title: 'رفض طلب الشراء ' + id, danger: true, impact: [ERP.itemName(r.itemId) + ' — ' + qty(r.qty, uomOf(r.itemId)), 'سيتم إبلاغ مقدم الطلب: ' + SA.userName(r.requestedBy)], reasonRequired: true, reasonLabel: 'سبب الرفض', confirmLabel: 'رفض الطلب' });
    if (!c.ok) return;
    try { await SA.api(() => { st.patch('purchaseRequisitions', id, { status: 'rejected', rejectedReason: c.reason, rejectedBy: me(), rejectedAt: ERP.now() });
      SA.audit('PRQ.REJECTED', { area: 'scm', target: { type: 'prq', id, label: ERP.itemName(r.itemId) }, before: { status: r.status }, after: { status: 'rejected' }, reason: c.reason });
      if (r.requestedBy !== me()) SA.notify({ title: 'تم رفض طلب الشراء ' + id, body: ERP.itemName(r.itemId) + ' — ' + c.reason, level: 'info', toUsers: [r.requestedBy], link: '#/scm/requisitions?q=' + id }); }); } catch (e) { return SA.fail(e); }
    SA.toast('تم رفض ' + id, 'success');
  }
  /** selected PRQs → one draft PO per preferred supplier (ERP.flow.createPO with prqIds) */
  function convertPRQ(ids) {
    if (!SA.can('scm.po.create')) return noPerm('scm.po.create');
    const all = ids.map((id) => ERP.find('purchaseRequisitions', id)).filter(Boolean);
    const ok = all.filter((r) => r.status === 'approved' || (r.status === 'open' && !canApprovePRQ(r))); const skipped = all.filter((r) => ok.indexOf(r) < 0);
    if (!ok.length) return SA.toast('الطلبات المحددة غير قابلة للتحويل — يجب أن تكون معتمدة (أو تملك صلاحية اعتمادها ولم تنشئها أنت).', 'warn');
    const sups = col('suppliers').filter((s) => s.status === 'active'); const groups = {};
    ok.forEach((r) => { const sid = (item(r.itemId) || {}).supplierId || (sups[0] || {}).id; const g = (groups[sid] = groups[sid] || { sid, lines: [], prqIds: [] }); const ex = g.lines.find((l) => l.itemId === r.itemId); if (ex) ex.qty += r.qty; else g.lines.push({ itemId: r.itemId, qty: r.qty }); g.prqIds.push(r.id); });
    const gl = Object.keys(groups).map((k) => groups[k]); const body = h('div.pinv-stack');
    if (skipped.length) body.appendChild(SA.alert('warning', 'تم استبعاد ' + skipped.length + ' طلب (غير معتمد أو مرفوض أو صدر له أمر شراء أو أنشأته أنت): ' + skipped.map((r) => r.id).join('، ')));
    gl.forEach((g) => {
      g.lines.forEach((l) => { l.price = lastPrice(g.sid, l.itemId); }); g.date = ERP.day(Math.max(3, ...g.lines.map((l) => leadOf(g.sid, l.itemId))));
      const priceIns = []; const dateIn = h('input.input', { type: 'date', dir: 'ltr', value: g.date, oninput: (e) => { g.date = e.target.value; } });
      const supSel = selectOf(sups.map((s) => [s.id, s.name]), g.sid, (v) => { g.sid = v; g.lines.forEach((l, i) => { l.price = lastPrice(v, l.itemId); priceIns[i].value = l.price; }); }, 'المورد');
      const rows = g.lines.map((l) => { const pi = numIn(l.price, { oninput: (e) => { l.price = Number(e.target.value) || 0; } }); priceIns.push(pi); return h('tr', {}, h('td', {}, U.itemCell(l.itemId)), h('td', {}, numIn(l.qty, { oninput: (e) => { l.qty = Number(e.target.value) || 0; } })), h('td', {}, pi)); });
      body.appendChild(h('div.pinv-group', {}, h('div.pinv-row2', {}, fld('المورد (المفضل للصنف)', supSel), fld('تاريخ التوريد المطلوب', dateIn)),
        h('div.table-wrap', {}, h('table.table.pinv-tbl', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الصنف'), h('th', {}, 'الكمية'), h('th', {}, 'سعر الوحدة'))), h('tbody', {}, rows))), h('small.pinv-muted', {}, 'من الطلبات: ' + g.prqIds.join('، '))));
    });
    body.appendChild(h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'تُنشأ أوامر الشراء كمسودات — راجعها ثم «إرسال للاعتماد». أي طلب غير معتمد في التحديد يُعتمد ضمنيًا باسمك.')));
    const go = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      const created = []; m.setBusy(true);
      try { await SA.api(() => {
        ok.filter((r) => r.status === 'open').forEach((r) => { st.patch('purchaseRequisitions', r.id, { status: 'approved', approvedBy: me(), approvedAt: ERP.now() }); SA.audit('PRQ.APPROVED', { area: 'scm', target: { type: 'prq', id: r.id, label: ERP.itemName(r.itemId) }, reason: 'اعتماد عند التحويل لأمر شراء' }); });
        gl.forEach((g) => { const ls = g.lines.filter((l) => l.qty > 0); if (!ls.length) return; const po = F.createPO({ supplierId: g.sid, lines: ls.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price })), prqIds: g.prqIds, expectedDate: g.date, notes: 'من طلبات الشراء ' + g.prqIds.join('، ') }); created.push(po.id); });
      }); } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(created); SA.toast('تم إنشاء ' + created.length + ' أمر شراء (مسودة): ' + created.join('، '), 'success'); if (created[0]) SA.nav('scm/po/' + created[0]);
    } }, SA.icon('cart', 'icon-sm'), 'إنشاء ' + gl.length + ' أمر شراء');
    const m = SA.modal({ title: 'تحويل ' + ok.length + ' طلب لأمر شراء', subtitle: 'مجمّعة حسب المورد المفضل لكل صنف', icon: 'cart', size: 'lg', body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), go] });
  }
  function prqActions(r) {
    const live = r.status === 'open' || r.status === 'approved';
    return [{ label: 'التفاصيل', icon: 'eye', onClick: () => openPRQ(r.id) },
      r.status === 'open' ? { label: 'اعتماد', icon: 'check', disabled: canApprovePRQ(r) || false, onClick: () => approvePRQ([r.id]) } : null,
      live ? { label: 'حوّل لأمر شراء', icon: 'cart', disabled: SA.can('scm.po.create') ? false : 'ليست من صلاحياتك (scm.po.create)', onClick: () => convertPRQ([r.id]) } : null,
      live ? { label: 'طلب عروض أسعار (RFQ)', icon: 'compare', disabled: SA.can('scm.rfq.create') ? false : 'ليست من صلاحياتك (scm.rfq.create)', onClick: () => SA.nav('scm/rfq', { query: { new: 1, prq: r.id } }) } : null,
      r.poId ? { label: 'فتح أمر الشراء ' + r.poId, icon: 'external', onClick: () => SA.nav('scm/po/' + r.poId) } : null,
      { label: 'كارت الصنف', icon: 'box', onClick: () => SA.nav('scm/stock/' + r.itemId) },
      live ? { divider: true } : null,
      live ? { label: 'رفض', icon: 'x', danger: true, disabled: SA.can('scm.requisitions.approve') ? false : 'ليست من صلاحياتك', onClick: () => rejectPRQ(r.id) } : null].filter(Boolean);
  }
  function prqSnapshot(r) {
    const it = item(r.itemId) || {}; const c = coverDays(r.itemId);
    return infoBox([['المتاح الآن', qty(K.available(r.itemId), it.uom)], ['حد الطلب', qty(it.reorderPoint, it.uom)], ['على أوامر شراء', qty(K.onOrder(r.itemId), it.uom)], ['يكفي', c == null ? '—' : Math.round(c) + ' يوم'], ['مدة التوريد', (it.leadDays || 7) + ' يوم'], ['المورد المفضل', ERP.supplierName(it.supplierId)]]);
  }
  function openPRQ(id) {
    const r = ERP.find('purchaseRequisitions', id); if (!r) return SA.toast('الطلب غير موجود', 'warn');
    const it = item(r.itemId) || {}; const po = r.poId ? ERP.find('purchaseOrders', r.poId) : null; const grns = po ? col('grns').filter((g) => g.poId === po.id) : []; const live = r.status === 'open' || r.status === 'approved';
    const d = SA.drawer({ title: 'طلب شراء ' + r.id, subtitle: it.name, size: 'md',
      body: h('div.pinv-stack', {}, h('div.pinv-row', {}, U.status('prq', r.status), prqSourceCell(r)), U.itemCell(r.itemId),
        SA.kv([['الكمية', qty(r.qty, it.uom)], ['السبب', r.reason || '—'], ['طلب بواسطة', SA.userName(r.requestedBy)], ['تاريخ الطلب', SA.fmt.dt(r.createdAt)], ['مطلوب قبل', h('span', {}, fmt.date(r.neededBy), r.neededBy < today() && live ? tag('متأخر', 'danger') : null)],
          r.approvedBy ? ['اعتمد بواسطة', SA.userName(r.approvedBy) + ' · ' + SA.fmt.rel(r.approvedAt)] : null, r.rejectedReason ? ['سبب الرفض', r.rejectedReason] : null,
          po ? ['أمر الشراء', h('span.pinv-row', {}, link(po.id), U.status('po', po.status))] : null, grns.length ? ['الاستلام', h('span.pinv-row', {}, grns.map((g) => link(g.id)))] : null]),
        U.sub('موقف الصنف الآن'), prqSnapshot(r)),
      foot: h('div.pinv-foot', {}, live && r.status === 'open' ? SA.btn({ label: 'اعتماد', icon: 'check', reason: canApprovePRQ(r), onClick: () => { d.close(); approvePRQ([r.id]); } }) : null,
        live ? SA.btn({ label: 'حوّل لأمر شراء', icon: 'cart', kind: r.status === 'open' ? 'ghost' : 'primary', perm: 'scm.po.create', onClick: () => { d.close(); convertPRQ([r.id]); } }) : null,
        live ? SA.btn({ label: 'رفض', icon: 'x', kind: 'ghost', perm: 'scm.requisitions.approve', onClick: () => { d.close(); rejectPRQ(r.id); } }) : null, h('span.pinv-grow'), linkBtn('كارت الصنف', 'scm/stock/' + r.itemId, 'box')) });
    return d;
  }
  function mrpModal() {
    if (!SA.can('scm.requisitions.create')) return noPerm('scm.requisitions.create');
    const sug = F.mrp(); const chosen = new Set(sug.filter((s) => !openPrqFor(s.itemId)).map((s) => s.itemId));
    const body = sug.length ? h('div.table-wrap', {}, h('table.table.pinv-tbl', {}, h('thead', {}, h('tr', {}, ['', 'الصنف', 'احتياج أوامر التشغيل', 'المتاح', 'على أوامر شراء', 'العجز', 'الكمية المقترحة', 'السبب'].map((x) => h('th', {}, x)))),
      h('tbody', {}, sug.map((s) => { const ex = openPrqFor(s.itemId); const u = uomOf(s.itemId); return h('tr', {}, h('td', {}, ex ? link(ex.id) : h('label.perm-cb', {}, h('input', { type: 'checkbox', checked: chosen.has(s.itemId), 'aria-label': 'اختيار', onchange: (e) => { if (e.target.checked) chosen.add(s.itemId); else chosen.delete(s.itemId); } }), h('span'))),
        h('td', {}, U.itemCell(s.itemId)), h('td.num', {}, qty(s.need, u)), h('td.num', {}, qty(s.onHand, u)), h('td.num', {}, qty(s.onOrder, u)), h('td.num.pinv-neg', {}, qty(s.short, u)), h('td.num', {}, h('b', {}, qty(s.suggestQty, u))), h('td', {}, s.reason)); }))))
      : SA.empty({ icon: 'checkcircle', title: 'لا توجد اقتراحات — الأرصدة تغطي أوامر التشغيل وحدود الطلب' });
    const go = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      const pick = sug.filter((s) => chosen.has(s.itemId) && !openPrqFor(s.itemId)); if (!pick.length) return SA.toast('اختر صنفًا واحدًا على الأقل.', 'warn'); const made = []; m.setBusy(true);
      try { await SA.api(() => pick.forEach((s) => made.push(F.createPRQ({ itemId: s.itemId, qty: s.suggestQty, reason: s.reason + ' (اقتراح MRP)', source: 'mrp' }).id))); } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(made); SA.toast('تم إنشاء ' + made.length + ' طلب شراء من اقتراحات MRP', 'success');
    } }, SA.icon('check', 'icon-sm'), 'إنشاء طلبات للمحدد');
    const m = SA.modal({ title: 'اقتراحات MRP للشراء', subtitle: 'احتياج أوامر التشغيل المخططة + حدود الطلب مقابل المتاح وأوامر الشراء المفتوحة', icon: 'layers', size: 'xl', body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إغلاق'), sug.length ? go : null] });
  }
  function renderPRQ(root, ctx) {
    page(ctx, [{ label: 'المشتريات' }, { label: 'طلبات الشراء الداخلية' }]);
    const focus = ctx.params.q && /^PRQ-/.test(ctx.params.q) ? ctx.params.q : null;
    if (ctx.params.status) preset('prq', { status: ctx.params.status });
    return SA.live(root, () => {
      const all = col('purchaseRequisitions'); const list = all.slice().sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : a.createdAt < b.createdAt ? 1 : -1));
      const fr = focus ? ERP.find('purchaseRequisitions', focus) : null; const k = keep('prq'); const m0 = new Date(); const monthKey = m0.getFullYear() + '-' + String(m0.getMonth() + 1).padStart(2, '0');
      const urgent = all.filter((r) => (r.status === 'open' || r.status === 'approved') && r.neededBy <= ERP.day(2));
      const supOpts = col('suppliers').filter((s) => col('items').some((i) => i.supplierId === s.id)).map((s) => [s.id, s.name]);
      const t = SA.table({
        caption: 'طلبات الشراء الداخلية',
        columns: [
          { key: 'id', label: 'الطلب', sort: true, render: (r) => h('span.pinv-cell', {}, h('b.num', {}, r.id), r.id === focus ? h('span.pinv-hl', {}, SA.icon('target', 'icon-sm'), 'المطلوب') : h('small', {}, SA.fmt.rel(r.createdAt))) },
          { key: 'item', label: 'الصنف', sort: true, value: (r) => ERP.itemName(r.itemId), render: (r) => U.itemCell(r.itemId) },
          { key: 'qty', label: 'الكمية', sort: true, class: 'num', render: (r) => qty(r.qty, uomOf(r.itemId)) },
          { key: 'source', label: 'المصدر', render: prqSourceCell },
          { key: 'reason', label: 'السبب', render: (r) => h('span', { title: r.reason, style: { display: 'inline-block', maxWidth: '230px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, r.reason || '—') },
          { key: 'requestedBy', label: 'بواسطة', sort: true, value: (r) => SA.userName(r.requestedBy) },
          { key: 'neededBy', label: 'مطلوب قبل', sort: true, render: (r) => h('span.pinv-cell', {}, fmt.date(r.neededBy), r.neededBy < today() && ['open', 'approved'].indexOf(r.status) >= 0 ? tag('متأخر', 'danger') : null) },
          { key: 'status', label: 'الحالة', sort: true, render: (r) => h('span.pinv-cell', {}, U.status('prq', r.status), r.poId ? link(r.poId) : null) }],
        rows: list, rowActions: prqActions, onRowClick: (r) => openPRQ(r.id), selectable: true, pageSize: 10, initial: k.initial, onChange: k.onChange,
        search: { placeholder: 'بحث برقم الطلب أو الصنف أو السبب…', keys: ['id', 'reason', (r) => ERP.itemName(r.itemId), (r) => (item(r.itemId) || {}).code] },
        filters: [{ key: 'status', label: 'الحالة', options: Object.keys(C.status.prq).map((x) => [x, C.status.prq[x][0]]) }, { key: 'source', label: 'المصدر', options: ['mrp', 'reorder', 'maintenance', 'manual'].map((x) => [x, SRC[x][0]]) }, { key: 'sup', label: 'المورد المفضل', options: supOpts, test: (r, v) => (item(r.itemId) || {}).supplierId === v }],
        bulk: [{ label: 'اعتماد', icon: 'check', perm: 'scm.requisitions.approve', run: (rows) => approvePRQ(rows.map((r) => r.id)) }, { label: 'حوّل لأمر شراء', icon: 'cart', perm: 'scm.po.create', run: (rows) => convertPRQ(rows.map((r) => r.id)) }],
        empty: { icon: 'clipboard', title: 'لا توجد طلبات شراء', text: 'الطلبات تأتي من MRP وحدود الطلب والصيانة أو يدويًا.', action: { label: 'طلب شراء جديد', perm: 'scm.requisitions.create', onClick: () => newPRQ() } } });
      return h('div', {},
        SA.pageHead({ title: 'طلبات الشراء الداخلية', desc: 'من MRP وحدود الطلب وأعطال الصيانة والطلبات اليدوية — اعتمد ثم حوّل المحدد لأوامر شراء مجمّعة حسب المورد.',
          actions: [SA.btn({ label: 'اقتراحات MRP', icon: 'layers', kind: 'ghost', perm: 'scm.requisitions.create', onClick: mrpModal }), SA.btn({ label: 'طلب شراء جديد', icon: 'plus', perm: 'scm.requisitions.create', onClick: () => newPRQ() })] }),
        U.kpis([U.kpi({ label: 'بانتظار الاعتماد', value: num(all.filter((r) => r.status === 'open').length), icon: 'inbox', tone: all.some((r) => r.status === 'open') ? 'warning' : null }),
          U.kpi({ label: 'معتمدة بانتظار أمر شراء', value: num(all.filter((r) => r.status === 'approved').length), icon: 'check' }),
          U.kpi({ label: 'عاجلة (خلال يومين)', value: num(urgent.length), sub: urgent.slice(0, 2).map((r) => ERP.itemName(r.itemId)).join('، '), icon: 'clock', tone: urgent.length ? 'danger' : null }),
          U.kpi({ label: 'صدر لها أوامر شراء هذا الشهر', value: num(all.filter((r) => r.status === 'ordered' && String((ERP.find('purchaseOrders', r.poId) || r).createdAt).slice(0, 7) === monthKey).length), icon: 'cart' })]),
        fr ? SA.card({ title: 'طلب الشراء ' + fr.id, tags: U.status('prq', fr.status), actions: [SA.btn({ label: 'فتح التفاصيل', icon: 'eye', kind: 'ghost', size: 'sm', onClick: () => openPRQ(fr.id) }), linkBtn('عرض كل الطلبات', 'scm/requisitions', 'list')] },
          h('div.pinv-row', {}, U.itemCell(fr.itemId), h('b.num', {}, qty(fr.qty, uomOf(fr.itemId))), prqSourceCell(fr), h('span.pinv-muted', {}, fr.reason)), prqSnapshot(fr)) : null,
        h('div', { style: { marginTop: '16px' } }, SA.card({ flush: true }, t.el)));
    }, ['purchaseRequisitions', 'purchaseOrders', 'stock']);
  }

  /* ═════════════ 3. RFQ — supplier quotations (scm/rfq[/RFQ-id]) ═════════════ */
  const SAMPLE = { approved: ['العينة معتمدة', 'success'], conditional: ['مقبولة بشرط', 'warning'], pending: ['بانتظار العينة', 'neutral'], rejected: ['العينة مرفوضة', 'danger'], none: ['بدون عينة', 'neutral'] };
  const supName = (id) => ERP.supplierName(id);
  function newRFQ(o) {
    o = o || {}; if (!SA.can('scm.rfq.create')) return noPerm('scm.rfq.create');
    const prq = o.prqId ? ERP.find('purchaseRequisitions', o.prqId) : null; let itemId = (prq && prq.itemId) || o.itemId || (buyItems()[0] || {}).id; let chosen = new Set();
    const qtyIn = h('input.input.num', { type: 'number', min: 0, step: 'any', dir: 'ltr' }); const dueIn = h('input.input', { type: 'date', dir: 'ltr', value: ERP.day(3) });
    const noteIn = h('textarea.textarea', { rows: 2, placeholder: 'شروط خاصة: عينة، شهادة COA، تسليم على دفعات…' }, prq ? 'لطلب الشراء ' + prq.id + ' — ' + prq.reason : '');
    const supBox = h('div.pinv-chk', { role: 'group', 'aria-label': 'الموردون المدعوون' }); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    const sel = itemSelect(buyItems(), itemId, (v) => { itemId = v; draw(true); });
    function draw(reset) {
      const it = item(itemId) || {}; if (reset || !qtyIn.value) qtyIn.value = prq && prq.itemId === itemId ? prq.qty : it.moq || 1;
      const sups = col('suppliers').filter((s) => s.status === 'active'); const rel = sups.filter((s) => itemsOfSupplier(s.id).some((i) => i.id === itemId) || s.id === it.supplierId);
      chosen = new Set(rel.slice(0, 3).map((s) => s.id)); SA.clear(supBox);
      rel.concat(sups.filter((s) => rel.indexOf(s) < 0)).forEach((s) => supBox.appendChild(h('label', {}, h('input', { type: 'checkbox', checked: chosen.has(s.id), onchange: (e) => { if (e.target.checked) chosen.add(s.id); else chosen.delete(s.id); } }),
        h('span', {}, h('b', {}, s.name), ' ', h('small', {}, (rel.indexOf(s) >= 0 ? 'يورّد هذا الصنف · ' : '') + (isImport(s) ? 'استيراد — ' + s.country : 'محلي') + ' · تقييم ' + (s.rating || 0).toFixed(1)), s.id === it.supplierId ? tag('المورد الحالي') : null))));
    }
    const save = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      const q = Number(qtyIn.value); if (!(q > 0)) return showErr(err, 'اكتب الكمية المطلوبة.'); if (chosen.size < 2) return showErr(err, 'اختر موردين اثنين على الأقل للمقارنة.');
      let id = null; m.setBusy(true);
      try { await SA.api(() => { ensure('rfqs'); id = ERP.no('RFQ'); st.insert('rfqs', { id, itemId, qty: q, prqId: prq && prq.itemId === itemId ? prq.id : null, status: 'sent', createdAt: ERP.now(), createdBy: me(), dueDate: dueIn.value || ERP.day(3), invited: Array.from(chosen), quotes: [], awards: [], note: noteIn.value.trim() }, true);
        SA.audit('RFQ.CREATED', { area: 'scm', target: { type: 'rfq', id, label: ERP.itemName(itemId) }, after: { qty: q, suppliers: chosen.size } }); }); } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(id); SA.toast('تم إرسال طلب عروض الأسعار ' + id + ' إلى ' + chosen.size + ' موردين (محاكاة بريد)', 'success'); SA.nav('scm/rfq/' + id);
    } }, SA.icon('send', 'icon-sm'), 'إرسال للموردين');
    const m = SA.modal({ title: 'طلب عروض أسعار جديد (RFQ)', subtitle: prq ? 'من طلب الشراء ' + prq.id : 'اطلب عروضًا من 2–3 موردين وقارن التكلفة الواصلة ومدة التوريد', icon: 'compare', size: 'md',
      body: h('div.pinv-stack', {}, fld('الصنف', sel), h('div.pinv-row2', {}, fld('الكمية', qtyIn), fld('آخر موعد لاستلام العروض', dueIn)), h('div.field', {}, h('span.label', {}, 'الموردون المدعوون'), supBox), fld('ملاحظات للموردين', noteIn), err),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), save] });
    draw(true); return m;
  }
  function simQuote(r, sid) {
    const s = sup(sid) || {}; const base = lastPrice(sid, r.itemId); const hs = (sid + r.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0); const imp = isImport(s); const it = item(r.itemId) || {};
    return { supplierId: sid, price: r2(base * (0.94 + (hs % 13) / 100)), freightPct: imp ? 15 + (hs % 8) : hs % 3, leadDays: imp ? s.importLeadDays || 35 : Math.max(2, (it.leadDays || 7) + (hs % 5) - 2), termsDays: s.termsDays != null ? s.termsDays : 30, validUntil: ERP.day(14), sample: hs % 3 === 0 ? 'pending' : 'approved', note: 'عرض مُستلم بالبريد (محاكاة)', receivedAt: ERP.now() };
  }
  function quoteModal(rfqId, sid) {
    if (!SA.can('scm.rfq.create')) return noPerm('scm.rfq.create');
    const r = ERP.find('rfqs', rfqId); if (!r) return; const pending = r.invited.filter((s) => !r.quotes.some((q) => q.supplierId === s)); if (!pending.length) return SA.toast('كل الموردين المدعوين أرسلوا عروضهم.', 'info');
    let s0 = sid && pending.indexOf(sid) >= 0 ? sid : pending[0]; const ins = {}; const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    const box = h('div.pinv-row2'); const sampleSel = selectOf(Object.keys(SAMPLE).map((k) => [k, SAMPLE[k][0]]), 'pending', null, 'العينة'); const noteIn = h('input.input', { type: 'text', placeholder: 'ملاحظات العرض' });
    function fill() { const d = simQuote(r, s0); SA.clear(box); [['price', 'سعر الوحدة (ج.م)'], ['freightPct', 'شحن وجمارك وتأمين %'], ['leadDays', 'مدة التوريد (يوم)'], ['termsDays', 'أجل السداد (يوم)']].forEach((f) => { ins[f[0]] = h('input.input.num', { type: 'number', min: 0, step: 'any', dir: 'ltr', value: d[f[0]] }); box.appendChild(fld(f[1], ins[f[0]])); }); }
    const supSel = selectOf(pending.map((s) => [s, supName(s)]), s0, (v) => { s0 = v; fill(); }, 'المورد');
    const save = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      const q = { supplierId: s0, price: Number(ins.price.value), freightPct: Number(ins.freightPct.value) || 0, leadDays: Number(ins.leadDays.value) || 1, termsDays: Number(ins.termsDays.value) || 0, validUntil: ERP.day(14), sample: sampleSel.value, note: noteIn.value.trim(), receivedAt: ERP.now() };
      if (!(q.price > 0)) return showErr(err, 'اكتب سعر الوحدة.'); m.setBusy(true);
      try { await SA.api(() => { st.patch('rfqs', rfqId, (x) => { x.quotes = (x.quotes || []).concat([q]); if (x.status === 'sent' && x.invited.every((s) => x.quotes.some((y) => y.supplierId === s))) x.status = 'evaluating'; });
        SA.audit('RFQ.QUOTED', { area: 'scm', target: { type: 'rfq', id: rfqId, label: supName(s0) }, after: { price: q.price, leadDays: q.leadDays } }); }); } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(q); SA.toast('تم تسجيل عرض ' + supName(s0), 'success');
    } }, SA.icon('check', 'icon-sm'), 'تسجيل العرض');
    const m = SA.modal({ title: 'تسجيل عرض سعر — ' + r.id, subtitle: ERP.itemName(r.itemId) + ' · ' + qty(r.qty, uomOf(r.itemId)), icon: 'receipt', size: 'md', body: h('div.pinv-stack', {}, fld('المورد', supSel), box, h('div.pinv-row2', {}, fld('حالة العينة', sampleSel), fld('ملاحظات', noteIn)), err), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), save] });
    fill(); return m;
  }
  async function simulateQuotes(rfqId) {
    if (!SA.can('scm.rfq.create')) return noPerm('scm.rfq.create');
    const r = ERP.find('rfqs', rfqId); if (!r) return; const pending = r.invited.filter((s) => !r.quotes.some((q) => q.supplierId === s)); if (!pending.length) return;
    try { await SA.api(() => { st.patch('rfqs', rfqId, (x) => { x.quotes = (x.quotes || []).concat(pending.map((sid) => simQuote(x, sid))); if (x.status === 'sent') x.status = 'evaluating'; }); pending.forEach((sid) => SA.audit('RFQ.QUOTED', { area: 'scm', target: { type: 'rfq', id: rfqId, label: supName(sid) }, reason: 'محاكاة استلام العرض' })); }); } catch (e) { return SA.fail(e); }
    SA.toast('وصلت ' + pending.length + ' عروض (محاكاة) — جاهزة للمقارنة', 'success');
  }
  function awardModal(rfqId, sid, qtyHint) {
    if (!SA.can('scm.po.create')) return noPerm('scm.po.create');
    const r = ERP.find('rfqs', rfqId); const q = r && r.quotes.find((x) => x.supplierId === sid); if (!q) return; const left = r2(Math.max(0, r.qty - awardedQty(r))); if (!(left > 0)) return SA.toast('تمت ترسية الكمية كاملة.', 'info');
    const u = uomOf(r.itemId); const qIn = numIn(Math.min(left, qtyHint || left), { max: left, style: { width: '100%' } }); const dIn = h('input.input', { type: 'date', dir: 'ltr', value: ERP.day(q.leadDays || 7) }); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    const go = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      const n = Number(qIn.value); if (!(n > 0) || n > left + 0.001) return showErr(err, 'الكمية بين 1 و' + num(left) + '.'); let po = null; m.setBusy(true);
      try { await SA.api(() => { const prq = r.prqId ? ERP.find('purchaseRequisitions', r.prqId) : null; const attach = prq && ['open', 'approved'].indexOf(prq.status) >= 0;
        po = F.createPO({ supplierId: sid, lines: [{ itemId: r.itemId, qty: n, price: q.price }], prqIds: attach ? [prq.id] : [], expectedDate: dIn.value || ERP.day(q.leadDays || 7), notes: 'ترسية ' + r.id + (q.freightPct ? ' — شحن وجمارك تقديرية ' + q.freightPct + '%' : '') });
        st.patch('rfqs', rfqId, (x) => { x.awards = (x.awards || []).concat([{ supplierId: sid, qty: n, poId: po.id, at: ERP.now(), by: me() }]); if (awardedQty(x) >= x.qty - 0.001) { x.status = 'awarded'; x.awardedAt = ERP.now(); } else x.status = 'evaluating'; });
        SA.audit('RFQ.AWARDED', { area: 'scm', target: { type: 'rfq', id: rfqId, label: supName(sid) }, after: { qty: n, price: q.price, po: po.id } }); }); } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(po); SA.toast('تمت الترسية على ' + supName(sid) + ' — أمر الشراء ' + po.id + ' (مسودة)', 'success'); SA.nav('scm/po/' + po.id);
    } }, SA.icon('award', 'icon-sm'), 'ترسية وإنشاء أمر شراء');
    const m = SA.modal({ title: 'ترسية على ' + supName(sid), subtitle: r.id + ' — ' + ERP.itemName(r.itemId), icon: 'award', size: 'md',
      body: h('div.pinv-stack', {}, infoBox([['سعر الوحدة', priceTxt(q.price)], ['التكلفة الواصلة/وحدة', priceTxt(landed(q))], ['مدة التوريد', q.leadDays + ' يوم'], ['أجل السداد', q.termsDays + ' يوم'], ['المتبقي بدون ترسية', qty(left, u)]]),
        h('div.pinv-row2', {}, fld('الكمية المرساة', qIn, 'يمكن تقسيم الترسية على أكثر من مورد'), fld('تاريخ التوريد', dIn)), err), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), go] });
  }
  function rfqAdvice(r, sc) {
    if (!sc.best || r.status === 'awarded') return null; const it = item(r.itemId) || {}; const u = ERP.uom[it.uom] || ''; const b = sc.best; const d = dailyUse(r.itemId); const cov = sc.cover;
    const imp = sc.list.filter((q) => isImport(sup(q.supplierId)) && q.sample !== 'pending').sort((a, c) => c.score - a.score)[0]; const left = r.qty - awardedQty(r);
    let title, text, act = null;
    if (sc.urgent && imp && imp.supplierId !== b.supplierId && d > 0) {
      const gap = Math.max(7, Math.round(imp.leadDays - (cov || 0) + 7)); const bridge = Math.min(left, Math.ceil((d * gap) / 100) * 100);
      if (bridge < left * 0.85) {
        title = 'قسّم الترسية: ' + num(bridge) + ' ' + u + ' عاجل من «' + supName(b.supplierId) + '» والباقي ' + num(left - bridge) + ' ' + u + ' من «' + supName(imp.supplierId) + '»';
        text = 'الرصيد يكفي ≈ ' + Math.round(cov) + ' يوم بينما الاستيراد يحتاج ' + imp.leadDays + ' يوم. الكمية العاجلة تغطي ' + gap + ' يوم (حتى وصول الشحنة + 7 أيام أمان)، والاستيراد يحافظ على مطابقة ألوان الكتالوج المعتمدة' + (canPrice() ? '. التكلفة الواصلة المجمّعة ≈ ' + fmt.short(bridge * b.landed + (left - bridge) * imp.landed) + '.' : '.');
        act = { label: 'ترسية ' + num(bridge) + ' على ' + supName(b.supplierId), onClick: () => awardModal(r.id, b.supplierId, bridge) };
      }
    }
    if (!title) {
      const ch = sc.cheapest; title = 'أفضل قيمة: «' + supName(b.supplierId) + '» (الدرجة ' + b.score + ' من 100)';
      text = 'التكلفة الواصلة ' + priceTxt(b.landed) + ' للوحدة، توريد خلال ' + b.leadDays + ' يوم، تقييم المورد ' + ((sup(b.supplierId) || {}).rating || 0).toFixed(1) + '.' + (ch && ch.supplierId !== b.supplierId ? ' الأرخص «' + supName(ch.supplierId) + '» لكن ' + (ch.leadDays > b.leadDays ? 'مدة توريده ' + ch.leadDays + ' يوم' : 'تقييمه أقل') + (ch.sample === 'pending' ? ' والعينة لم تُعتمد بعد' : '') + '.' : '') + (sc.urgent ? ' الأولوية للسرعة لأن الرصيد أقل من مدة التوريد.' : '');
      act = { label: 'ترسية على ' + supName(b.supplierId), onClick: () => awardModal(r.id, b.supplierId) };
    }
    return U.aiCard({ tone: sc.urgent ? 'warning' : 'info', title, text, actions: SA.can('scm.po.create') && left > 0 ? [act] : [] });
  }
  function renderRFQDetail(root, ctx, id) {
    page(ctx, [{ label: 'المشتريات' }, { label: 'طلبات عروض الأسعار', href: '#/scm/rfq' }, { label: id }]);
    return SA.live(root, () => {
      const r = ERP.find('rfqs', id); const back = { label: 'طلبات عروض الأسعار', href: '#/scm/rfq' };
      if (!r) return h('div', {}, SA.pageHead({ title: 'طلب عروض الأسعار ' + id, back }), SA.card({}, SA.empty({ icon: 'search', title: 'الطلب غير موجود' })));
      const it = item(r.itemId) || {}; const u = it.uom; const sc = scoreQuotes(r); const pending = r.invited.filter((s) => !r.quotes.some((q) => q.supplierId === s)); const left = r.qty - awardedQty(r);
      const canAward = SA.can('scm.po.create') && left > 0 && r.status !== 'cancelled';
      const head = ['المورد', 'سعر الوحدة', 'شحن وجمارك', 'التكلفة الواصلة/وحدة', 'الإجمالي الواصل', 'مدة التوريد', 'التقييم', 'أجل السداد', 'العينة', 'الدرجة', ''];
      const rows = sc.list.map((q) => { const best = sc.best && q.supplierId === sc.best.supplierId; const aw = (r.awards || []).filter((a) => a.supplierId === q.supplierId);
        return h('tr', { class: best ? 'pinv-best' : '' }, h('td', {}, supCell(q.supplierId), best ? tag('أفضل قيمة', 'success') : null, aw.length ? tag('مُرسى ' + num(sum(aw, (a) => a.qty)), 'success') : null),
          h('td.num', {}, price(q.price)), h('td.num', {}, (q.freightPct || 0) + '%'), h('td.num', {}, h('b', {}, price(q.landed)), sc.cheapest && sc.cheapest.supplierId === q.supplierId ? tag('الأرخص') : null),
          h('td.num', {}, price(q.total)), h('td.num', {}, q.leadDays + ' يوم', sc.fastest && sc.fastest.supplierId === q.supplierId ? tag('الأسرع') : null, h('div.pinv-muted', {}, 'وصول ' + fmt.date(ERP.day(q.leadDays)))),
          h('td', {}, stars((sup(q.supplierId) || {}).rating)), h('td.num', {}, q.termsDays ? q.termsDays + ' يوم' : 'مقدّم/LC'), h('td', {}, SA.chip((SAMPLE[q.sample] || SAMPLE.none)[0], (SAMPLE[q.sample] || SAMPLE.none)[1])),
          h('td', {}, h('b.pinv-score.is-' + scoreTone(q.score), {}, q.score)), h('td', {}, canAward ? SA.btn({ label: 'ترسية', icon: 'award', size: 'sm', kind: best ? 'primary' : 'ghost', onClick: () => awardModal(r.id, q.supplierId) }) : null)); })
        .concat(pending.map((sid) => h('tr', {}, h('td', {}, supCell(sid)), h('td', { colspan: 9 }, h('span.pinv-muted', {}, 'بانتظار العرض — آخر موعد ' + fmt.date(r.dueDate))), h('td', {}, SA.btn({ label: 'تسجيل العرض', icon: 'plus', size: 'sm', kind: 'ghost', perm: 'scm.rfq.create', onClick: () => quoteModal(r.id, sid) })))));
      const cmp = h('div.table-wrap', {}, h('table.table.pinv-cmp', { 'aria-label': 'مقارنة العروض' }, h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))), h('tbody', {}, rows)));
      const adv = rfqAdvice(r, sc);
      return h('div', {},
        SA.pageHead({ title: 'طلب عروض أسعار ' + r.id, desc: it.name + ' — ' + qty(r.qty, u) + (r.note ? ' · ' + r.note : ''), tags: [U.status('rfq', r.status)], back,
          actions: [pending.length ? SA.btn({ label: 'محاكاة وصول العروض', icon: 'refresh', kind: 'ghost', perm: 'scm.rfq.create', onClick: () => simulateQuotes(r.id) }) : null, pending.length ? SA.btn({ label: 'تسجيل عرض', icon: 'plus', perm: 'scm.rfq.create', onClick: () => quoteModal(r.id) }) : null, linkBtn('كارت الصنف', 'scm/stock/' + r.itemId, 'box')] }),
        h('div.pinv-split', {},
          h('div.pinv-stack', {}, SA.card({ title: 'مقارنة العروض', tags: [U.demo('الشحن والجمارك تقديرية'), sc.urgent ? tag('الأولوية للسرعة', 'warning') : null], flush: true }, sc.list.length || pending.length ? cmp : SA.empty({ icon: 'inbox', title: 'لم تصل عروض بعد' })),
            (r.awards || []).length ? SA.card({ title: 'الترسية' }, h('div.table-wrap', {}, h('table.table.pinv-tbl', {}, h('thead', {}, h('tr', {}, ['المورد', 'الكمية', 'أمر الشراء', 'الحالة', 'التاريخ'].map((x) => h('th', {}, x)))),
              h('tbody', {}, r.awards.map((a) => { const po = ERP.find('purchaseOrders', a.poId); return h('tr', {}, h('td', {}, supName(a.supplierId)), h('td.num', {}, qty(a.qty, u)), h('td', {}, link(a.poId)), h('td', {}, po ? U.status('po', po.status) : '—'), h('td', {}, fmt.date(a.at))); }))))) : null),
          h('div.pinv-stack', {}, adv, SA.card({ title: 'ملخص الطلب' }, SA.kv([['الصنف', U.itemCell(r.itemId)], ['الكمية', qty(r.qty, u)], ['المتبقي بدون ترسية', qty(left, u)], ['طلب الشراء', r.prqId ? link(r.prqId) : '—'], ['يكفي الرصيد', sc.cover != null ? Math.round(sc.cover) + ' يوم' : '—'], ['مدة التوريد المعتادة', (it.leadDays || 7) + ' يوم'],
            ['الموردون المدعوون', r.invited.length + ' (وصل ' + r.quotes.length + ')'], ['آخر موعد للعروض', fmt.date(r.dueDate)], ['أنشأه', SA.userName(r.createdBy) + ' · ' + SA.fmt.rel(r.createdAt)]])),
            h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الدرجة = التكلفة الواصلة ' + (sc.urgent ? '35%' : '50%') + ' + مدة التوريد ' + (sc.urgent ? '40%' : '25%') + ' + تقييم المورد 20% + أجل السداد 5%. الأوزان تجريبية وقابلة للضبط.')))));
    }, ['rfqs', 'purchaseOrders', 'suppliers', 'stockMoves']);
  }
  function renderRFQ(root, ctx) {
    const id = ctx.path[0]; if (id) return renderRFQDetail(root, ctx, id);
    page(ctx, [{ label: 'المشتريات' }, { label: 'طلبات عروض الأسعار' }]);
    if (ctx.params.new) setTimeout(() => { dropQuery('scm/rfq'); newRFQ({ prqId: ctx.params.prq, itemId: ctx.params.item }); }, 0);
    return SA.live(root, () => {
      const list = col('rfqs').slice().sort(byDesc('createdAt')); const k = keep('rfq');
      let saved = 0; list.forEach((r) => (r.awards || []).forEach((a) => { const qs = r.quotes.filter((q) => q.price != null); const q = qs.find((x) => x.supplierId === a.supplierId); if (q && qs.length > 1) saved += (Math.max(...qs.map(landed)) - landed(q)) * a.qty; }));
      const t = SA.table({ caption: 'طلبات عروض الأسعار',
        columns: [{ key: 'id', label: 'الطلب', sort: true, render: (r) => h('span.pinv-cell', {}, h('b.num', {}, r.id), h('small', {}, SA.fmt.rel(r.createdAt))) },
          { key: 'item', label: 'الصنف', sort: true, value: (r) => ERP.itemName(r.itemId), render: (r) => U.itemCell(r.itemId) }, { key: 'qty', label: 'الكمية', class: 'num', render: (r) => qty(r.qty, uomOf(r.itemId)) },
          { key: 'inv', label: 'الموردون', render: (r) => h('span.pinv-cell', {}, h('b', {}, r.quotes.length + ' / ' + r.invited.length + ' عروض'), h('small', {}, r.invited.map(supName).map((n) => n.split(' — ')[0]).join('، '))) },
          { key: 'best', label: 'أفضل تكلفة واصلة', render: (r) => { const sc = scoreQuotes(r); return sc.best ? h('span.pinv-cell', {}, price(sc.best.landed), h('small', {}, supName(sc.best.supplierId).split(' — ')[0])) : h('span.pinv-muted', {}, '—'); } },
          { key: 'dueDate', label: 'آخر موعد', sort: true, render: (r) => h('span', {}, fmt.date(r.dueDate), r.status === 'sent' && r.dueDate < today() ? tag('فات الموعد', 'danger') : null) },
          { key: 'status', label: 'الحالة', sort: true, render: (r) => h('span.pinv-cell', {}, U.status('rfq', r.status), (r.awards || []).map((a) => link(a.poId))) }],
        rows: list, onRowClick: (r) => SA.nav('scm/rfq/' + r.id), initial: k.initial, onChange: k.onChange, pageSize: 10,
        rowActions: (r) => [{ label: 'فتح المقارنة', icon: 'compare', onClick: () => SA.nav('scm/rfq/' + r.id) }, r.prqId ? { label: 'طلب الشراء ' + r.prqId, icon: 'clipboard', onClick: () => SA.nav('scm/requisitions?q=' + r.prqId) } : null].filter(Boolean),
        search: { placeholder: 'بحث برقم الطلب أو الصنف أو المورد…', keys: ['id', (r) => ERP.itemName(r.itemId), (r) => r.invited.map(supName).join(' ')] },
        filters: [{ key: 'status', label: 'الحالة', options: Object.keys(C.status.rfq).map((x) => [x, C.status.rfq[x][0]]) }],
        empty: { icon: 'compare', title: 'لا توجد طلبات عروض أسعار', action: { label: 'طلب عروض أسعار', perm: 'scm.rfq.create', onClick: () => newRFQ() } } });
      return h('div', {}, SA.pageHead({ title: 'طلبات عروض الأسعار (RFQ)', desc: 'اطلب عروضًا من 2–3 موردين، قارن التكلفة الواصلة ومدة التوريد والتقييم، ثم رسِّ وأنشئ أمر الشراء مباشرة.', actions: [SA.btn({ label: 'طلب عروض أسعار', icon: 'plus', perm: 'scm.rfq.create', onClick: () => newRFQ() })] }),
        U.kpis([U.kpi({ label: 'بانتظار عروض الموردين', value: num(list.filter((r) => r.status === 'sent').length), icon: 'send' }), U.kpi({ label: 'قيد المقارنة', value: num(list.filter((r) => r.status === 'evaluating').length), icon: 'compare', tone: list.some((r) => r.status === 'evaluating') ? 'warning' : null }),
          U.kpi({ label: 'تمت الترسية', value: num(list.filter((r) => r.status === 'awarded').length), icon: 'award' }), U.kpi({ label: 'التوفير مقابل أعلى عرض', value: canPrice() ? fmt.short(saved) : lockTag(), sub: [U.demo('تقديري')], icon: 'trend', tone: 'success' })]),
        h('div', { style: { marginTop: '16px' } }, SA.card({ flush: true }, t.el)));
    }, ['rfqs', 'purchaseOrders']);
  }

  /* ═════════════ 4. purchase orders (scm/po[/PS-id]) ═════════════ */
  async function submitPOAct(id) {
    if (!SA.can('scm.po.create')) return noPerm('scm.po.create');
    const po = ERP.find('purchaseOrders', id); if (!po || po.status !== 'draft') return; const t = F.totals(po);
    const c = await SA.confirm({ title: 'إرسال ' + id + ' للاعتماد', impact: [supName(po.supplierId), 'القيمة قبل الضريبة: ' + fmt.money(t.net), t.net <= F.limits.poAuto ? 'أقل من حد الاعتماد التلقائي (' + fmt.money(F.limits.poAuto) + ' — تجريبي) ← يُعتمد فورًا' : 'يحتاج اعتماد ' + (t.net > F.limits.poGm ? 'المدير المالي ثم المدير العام' : 'المدير المالي') + ' (حدود تجريبية — Open بند 33)'], confirmLabel: 'إرسال' });
    if (!c.ok) return; let res = null;
    try { await SA.api(() => { res = F.submitPO(id); }); } catch (e) { return SA.fail(e); }
    const p2 = ERP.find('purchaseOrders', id); SA.toast(res === 'approved' ? 'تم اعتماد ' + id + ' تلقائيًا — أرسله للمورد' : 'تم إرسال ' + id + ' للاعتماد (' + (p2 && p2.approvalId) + ')', 'success');
  }
  async function sendPOAct(id) {
    if (!SA.can('scm.po.create')) return noPerm('scm.po.create');
    const po = ERP.find('purchaseOrders', id); if (!po || po.status !== 'approved') return; const s = sup(po.supplierId) || {};
    const c = await SA.confirm({ title: 'إرسال ' + id + ' للمورد', impact: [s.name, 'نسخة A4 بالبريد إلى ' + ((s.contacts || [])[0] || {}).name + ' (محاكاة — لا يوجد إرسال فعلي)', 'تاريخ التوريد المطلوب: ' + fmt.date(po.expectedDate)], confirmLabel: 'إرسال للمورد' });
    if (!c.ok) return;
    try { await SA.api(() => F.sendPO(id)); } catch (e) { return SA.fail(e); }
    SA.toast('تم إرسال ' + id + ' إلى ' + s.name, 'success');
  }
  async function cancelPOAct(id) {
    if (!SA.can('scm.po.create')) return noPerm('scm.po.create');
    const po = ERP.find('purchaseOrders', id); if (!po || ['draft', 'pending_approval', 'approved', 'sent'].indexOf(po.status) < 0 || po.lines.some((l) => l.receivedQty > 0)) return SA.toast('لا يمكن إلغاء أمر شراء بعد بدء الاستلام.', 'warn');
    const c = await SA.confirm({ title: 'إلغاء أمر الشراء ' + id, danger: true, impact: [supName(po.supplierId), (po.prqIds || []).length ? 'طلبات الشراء المرتبطة ترجع «معتمد» لإصدار أمر بديل: ' + po.prqIds.join('، ') : null].filter(Boolean), warnings: po.status === 'sent' ? ['الأمر أُرسل للمورد — أبلغه بالإلغاء كتابيًا.'] : [], reasonRequired: true, reasonLabel: 'سبب الإلغاء', confirmLabel: 'إلغاء الأمر' });
    if (!c.ok) return;
    try { await SA.api(() => { st.patch('purchaseOrders', id, { status: 'cancelled', cancelReason: c.reason, cancelledAt: ERP.now(), cancelledBy: me() }); (po.prqIds || []).forEach((p) => st.patch('purchaseRequisitions', p, { status: 'approved', poId: null }));
      SA.audit('PO.CANCELLED', { area: 'scm', target: { type: 'po', id, label: supName(po.supplierId) }, before: { status: po.status }, after: { status: 'cancelled' }, reason: c.reason }); }); } catch (e) { return SA.fail(e); }
    SA.toast('تم إلغاء ' + id, 'success');
  }
  function poActions(p) {
    const can = SA.can('scm.po.create');
    return [{ label: 'فتح أمر الشراء', icon: 'eye', onClick: () => SA.nav('scm/po/' + p.id) }, { label: 'معاينة A4 للطباعة', icon: 'doc', onClick: () => poPreview(p) },
      p.status === 'draft' ? { label: 'إرسال للاعتماد', icon: 'send', disabled: can ? false : 'ليست من صلاحياتك', onClick: () => submitPOAct(p.id) } : null,
      p.status === 'approved' ? { label: 'إرسال للمورد', icon: 'mail', disabled: can ? false : 'ليست من صلاحياتك', onClick: () => sendPOAct(p.id) } : null,
      p.status === 'sent' || p.status === 'partially_received' ? { label: 'استلام بضاعة', icon: 'inbox', disabled: SA.can('scm.grn.create') ? false : 'ليست من صلاحياتك (scm.grn.create)', onClick: () => receiveModal(p.id) } : null,
      p.approvalId ? { label: 'طلب الاعتماد ' + p.approvalId, icon: 'external', onClick: () => SA.nav('approvals/' + p.approvalId) } : null].filter(Boolean);
  }
  function poItemsCell(p) { const first = p.lines[0]; return h('span.pinv-cell', {}, h('b', {}, first ? ERP.itemName(first.itemId) : '—'), h('small', {}, p.lines.length > 1 ? '+' + (p.lines.length - 1) + ' بنود أخرى' : first ? qty(first.qty, uomOf(first.itemId)) : '')); }
  function poTimeline(po, ap, grns) {
    const bad = po.status === 'rejected' || po.status === 'cancelled'; const S0 = ['approved', 'sent', 'partially_received', 'received', 'closed'];
    const steps = [['إنشاء', po.createdAt, true], ['إرسال للاعتماد', ap ? ap.createdAt : po.approvedAt, po.status !== 'draft'], ['الاعتماد', po.approvedAt || (ap && ap.status === 'approved' ? ap.updatedAt : null), S0.indexOf(po.status) >= 0],
      ['إرسال للمورد', po.sentAt, ['sent', 'partially_received', 'received', 'closed'].indexOf(po.status) >= 0], ['الاستلام', grns.length ? grns[0].at : null, ['received', 'closed'].indexOf(po.status) >= 0]];
    const cur = steps.findIndex((s) => !s[2]);
    return h('ol.pinv-tl', { 'aria-label': 'مراحل أمر الشراء' }, steps.map((s, i) => h('li', { class: s[2] ? 'is-done' : i === cur ? (bad ? 'is-bad' : 'is-now') : '' }, h('i'), h('b', {}, s[0]),
      h('small', {}, s[2] && s[1] ? SA.fmt.dt(s[1]) : i === cur ? (bad ? (C.status.po[po.status] || [po.status])[0] : po.status === 'partially_received' && i === 4 ? 'استلام جزئي ' + Math.round(poRecvPct(po) * 100) + '%' : po.status === 'pending_approval' && i === 2 ? 'بانتظار ' + (((ap || {}).chain || []).find((c) => c.status === 'pending') || {}).label : 'التالي') : ''))));
  }
  const AP_ST = { pending: ['بانتظار القرار', 'warning'], waiting: ['في الانتظار', 'neutral'], approved: ['معتمد', 'success'], rejected: ['مرفوض', 'danger'], skipped: ['تم التخطي', 'neutral'] };
  function renderPODetail(root, ctx, id) {
    page(ctx, [{ label: 'المشتريات' }, { label: 'أوامر الشراء', href: '#/scm/po' }, { label: id }]);
    if (ctx.params.receive) setTimeout(() => { dropQuery('scm/po/' + id); receiveModal(id); }, 0);
    return SA.live(root, () => {
      const po = ERP.find('purchaseOrders', id); const back = { label: 'أوامر الشراء', href: '#/scm/po' };
      if (!po) return h('div', {}, SA.pageHead({ title: 'أمر الشراء ' + id, back }), SA.card({}, SA.empty({ icon: 'search', title: 'أمر الشراء غير موجود', text: 'تأكد من الرقم أو ارجع للقائمة.' })));
      const s = sup(po.supplierId) || {}; const t = F.totals(po); const grns = col('grns').filter((g) => g.poId === id).sort(byDesc('at')); const ap = po.approvalId ? ERP.find('approvals', po.approvalId) : null;
      const bills = col('bills').filter((b) => b.poId === id); const prqs = (po.prqIds || []).map((x) => ERP.find('purchaseRequisitions', x)).filter(Boolean); const rfq = col('rfqs').find((r) => (r.awards || []).some((a) => a.poId === id));
      const qcs = []; grns.forEach((g) => (g.qcIds || []).forEach((q) => { const x = ERP.find('qcInspections', q); if (x) qcs.push(x); })); const ncrs = col('ncrs').filter((n) => grns.some((g) => n.refId === g.id));
      const late = poLate(po); const cancellable = ['draft', 'pending_approval', 'approved', 'sent'].indexOf(po.status) >= 0 && !po.lines.some((l) => l.receivedQty > 0);
      const actions = [SA.btn({ label: 'معاينة A4', icon: 'doc', kind: 'ghost', onClick: () => poPreview(po) }),
        cancellable ? SA.btn({ label: 'إلغاء', icon: 'x', kind: 'ghost', perm: 'scm.po.create', onClick: () => cancelPOAct(id) }) : null,
        po.status === 'draft' ? SA.btn({ label: 'تعديل', icon: 'edit', kind: 'ghost', perm: 'scm.po.create', onClick: () => poForm({ po }) }) : null,
        po.status === 'draft' ? SA.btn({ label: 'إرسال للاعتماد', icon: 'send', perm: 'scm.po.create', onClick: () => submitPOAct(id) }) : null,
        po.status === 'pending_approval' && ap ? linkBtn('طلب الاعتماد ' + ap.id, 'approvals/' + ap.id, 'inbox') : null,
        po.status === 'approved' ? SA.btn({ label: 'إرسال للمورد', icon: 'mail', perm: 'scm.po.create', onClick: () => sendPOAct(id) }) : null,
        po.status === 'sent' || po.status === 'partially_received' ? SA.btn({ label: 'استلام بضاعة', icon: 'inbox', perm: 'scm.grn.create', onClick: () => receiveModal(id) }) : null];
      const lines = h('div.table-wrap', {}, h('table.table.pinv-tbl', {}, h('thead', {}, h('tr', {}, ['الصنف', 'المطلوب', 'المستلم', 'نسبة الاستلام', 'سعر الوحدة', 'الإجمالي'].map((x) => h('th', {}, x)))),
        h('tbody', {}, po.lines.map((l) => { const u = uomOf(l.itemId); const pct = l.qty ? Math.min(1, (l.receivedQty || 0) / l.qty) : 0; return h('tr', {}, h('td', {}, U.itemCell(l.itemId)), h('td.num', {}, qty(l.qty, u)), h('td.num', {}, qty(l.receivedQty || 0, u)), h('td', { style: { minWidth: '140px' } }, CH.meter(pct, { label: ' ', tone: pct >= 1 ? 'success' : pct > 0 ? 'warning' : 'primary' })), h('td.num', {}, price(l.price)), h('td.num', {}, price(l.qty * l.price))); }))));
      const totals = h('div.pinv-sum', {}, h('div', {}, h('span', {}, 'قبل الضريبة'), h('b.num', {}, priceTxt(t.net))), h('div', {}, h('span', {}, 'ضريبة ' + Math.round(ERP.taxRate() * 100) + '%'), h('b.num', {}, priceTxt(t.tax)), ERP.taxIsDemo() ? U.demo('نسبة تجريبية') : null), h('div', {}, h('span', {}, 'الإجمالي'), h('b.num', {}, priceTxt(t.total))), canPrice() && poOpen(po) ? h('div', {}, h('span', {}, 'المتبقي للتوريد'), h('b.num', {}, fmt.money(poOutstanding(po)))) : null);
      const docs = [].concat(prqs.map((r) => ['طلب شراء', link(r.id), U.status('prq', r.status)]), rfq ? [['طلب عروض أسعار', link(rfq.id), U.status('rfq', rfq.status)]] : [], ap ? [['طلب اعتماد', link(ap.id), SA.statusChip('approval', ap.status)]] : [],
        grns.map((g) => ['استلام', link(g.id), U.status('grn', g.status)]), qcs.map((q) => ['فحص استلام', link(q.id), U.status('qc', q.result)]), ncrs.map((n) => ['عدم مطابقة', link(n.id), U.status('ncr', n.status)]), bills.map((b) => ['فاتورة مورد', link(b.id), U.status('bill', b.status)]));
      return h('div', {},
        SA.pageHead({ title: 'أمر شراء ' + po.id, desc: s.name + ' · أنشأه ' + SA.userName(po.buyerId) + ' ' + SA.fmt.rel(po.createdAt), tags: [U.status('po', po.status), late ? tag('متأخر ' + ERP.daysBetween(po.expectedDate) + ' يوم', 'danger') : null], back, actions }),
        SA.card({}, poTimeline(po, ap, grns)),
        h('div.pinv-split', {},
          h('div.pinv-stack', {}, SA.card({ title: 'البنود', tags: canPrice() ? null : lockTag(), flush: true }, lines, h('div', { style: { padding: '12px 16px' } }, totals)),
            po.notes || po.cancelReason ? SA.card({ title: 'ملاحظات' }, po.notes ? h('p', { style: { margin: 0 } }, po.notes) : null, po.cancelReason ? SA.alert('danger', 'سبب الإلغاء: ' + po.cancelReason) : null) : null,
            grns.length ? SA.card({ title: 'الاستلامات', flush: true }, h('div.table-wrap', {}, h('table.table.pinv-tbl', {}, h('thead', {}, h('tr', {}, ['الإذن', 'التاريخ', 'الكميات', 'فحص الجودة', 'الحالة'].map((x) => h('th', {}, x)))),
              h('tbody', {}, grns.map((g) => h('tr', {}, h('td', {}, link(g.id)), h('td', {}, SA.fmt.dt(g.at)), h('td', {}, g.lines.map((l) => h('div', {}, ERP.itemName(l.itemId) + ': ', h('b.num', {}, qty(l.qty, uomOf(l.itemId)))))), h('td', {}, (g.qcIds || []).map((q) => { const x = ERP.find('qcInspections', q); return h('div.pinv-row', {}, link(q), x ? U.status('qc', x.result) : null); })), h('td', {}, U.status('grn', g.status)))))))) : null),
          h('div.pinv-stack', {},
            SA.card({ title: 'المورد', actions: [linkBtn('بطاقة الأداء', 'scm/suppliers/' + s.id, 'award')] }, SA.kv([['الاسم', s.name], ['النوع', isImport(s) ? 'استيراد — ' + s.country : 'محلي'], ['التقييم', stars(s.rating)], ['شروط الدفع', s.termsDays != null ? s.termsDays + ' يوم' : '—'], ['التواصل', (s.contacts || [])[0] ? h('span', {}, s.contacts[0].name + ' · ', h('span.num', {}, s.contacts[0].phone)) : '—'], ['تاريخ التوريد المطلوب', h('span', {}, fmt.date(po.expectedDate), late ? tag('متأخر', 'danger') : null)]])),
            ap ? SA.card({ title: 'سلسلة الاعتماد', actions: [linkBtn('فتح', 'approvals/' + ap.id, 'external')] }, h('div.pinv-stack', {}, ap.chain.map((c) => h('div.pinv-row', {}, h('b', {}, c.step + '. ' + c.label), SA.chip((AP_ST[c.status] || [c.status])[0], (AP_ST[c.status] || [0, 'neutral'])[1]), c.decidedBy ? h('small.pinv-muted', {}, SA.userName(c.decidedBy) + ' · ' + SA.fmt.rel(c.decidedAt)) : null)), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), 'حدود الاعتماد تجريبية: تلقائي حتى ' + fmt.money(F.limits.poAuto) + ' · المدير العام فوق ' + fmt.money(F.limits.poGm) + '.'))) : null,
            SA.card({ title: 'المستندات المرتبطة' }, docs.length ? h('div.pinv-stack', {}, docs.map((d) => h('div.pinv-row', {}, h('span.pinv-muted', { style: { minWidth: '96px' } }, d[0]), d[1], d[2]))) : h('p.pinv-muted', {}, 'لا توجد مستندات مرتبطة بعد.')))));
    }, ['purchaseOrders', 'grns', 'approvals', 'qcInspections', 'bills', 'purchaseRequisitions', 'ncrs']);
  }
  function renderPO(root, ctx) {
    const id = ctx.path[0]; if (id && id !== 'new') return renderPODetail(root, ctx, id);
    page(ctx, [{ label: 'المشتريات' }, { label: 'أوامر الشراء' }]);
    const p = ctx.params; if (p.status || p.supplier || p.late) preset('po', { status: p.status || '', supplier: p.supplier || '', late: p.late ? '1' : '' });
    if (id === 'new' || p.new) setTimeout(() => { dropQuery('scm/po'); poForm({ supplierId: p.supplier }); }, 0);
    return SA.live(root, () => {
      const pos = col('purchaseOrders').slice().sort(byDesc('createdAt')); const k = keep('po'); const mk = today().slice(0, 7);
      const t = SA.table({ caption: 'أوامر الشراء',
        columns: [{ key: 'id', label: 'أمر الشراء', sort: true, render: (r) => h('span.pinv-cell', {}, h('b.num', {}, r.id), h('small', {}, SA.fmt.rel(r.createdAt))) },
          { key: 'supplier', label: 'المورد', sort: true, value: (r) => supName(r.supplierId), render: (r) => supCell(r.supplierId) }, { key: 'items', label: 'الأصناف', render: poItemsCell },
          { key: 'net', label: 'القيمة (قبل الضريبة)', sort: true, value: (r) => poNet(r), class: 'num', render: (r) => price(poNet(r)) },
          { key: 'expectedDate', label: 'موعد التوريد', sort: true, render: (r) => h('span.pinv-cell', {}, fmt.date(r.expectedDate), poLate(r) ? tag('متأخر ' + ERP.daysBetween(r.expectedDate) + ' يوم', 'danger') : null) },
          { key: 'recv', label: 'الاستلام', sort: true, value: poRecvPct, render: (r) => h('div', { style: { minWidth: '110px' } }, CH.meter(poRecvPct(r), { label: ' ', tone: poRecvPct(r) >= 1 ? 'success' : poRecvPct(r) > 0 ? 'warning' : 'primary' })) },
          { key: 'status', label: 'الحالة', sort: true, render: (r) => h('span.pinv-cell', {}, U.status('po', r.status), r.status === 'pending_approval' && r.approvalId ? link(r.approvalId) : null) },
          { key: 'buyer', label: 'المشتري', value: (r) => SA.userName(r.buyerId) }],
        rows: pos, rowActions: poActions, onRowClick: (r) => SA.nav('scm/po/' + r.id), initial: k.initial, onChange: k.onChange, pageSize: 10,
        search: { placeholder: 'بحث برقم الأمر أو المورد أو الصنف…', keys: ['id', (r) => supName(r.supplierId), (r) => r.lines.map((l) => ERP.itemName(l.itemId)).join(' ')] },
        filters: [{ key: 'status', label: 'الحالة', options: [['open', 'مفتوح (كل المراحل)']].concat(Object.keys(C.status.po).map((x) => [x, C.status.po[x][0]])), test: (r, v) => (v === 'open' ? poOpen(r) : r.status === v) },
          { key: 'supplier', label: 'المورد', options: col('suppliers').filter((s) => pos.some((x) => x.supplierId === s.id)).map((s) => [s.id, s.name]), test: (r, v) => r.supplierId === v },
          { key: 'late', label: 'التأخير', options: [['1', 'المتأخر فقط']], test: (r) => poLate(r) }],
        empty: { icon: 'cart', title: 'لا توجد أوامر شراء', action: { label: 'أمر شراء جديد', perm: 'scm.po.create', onClick: () => poForm() } } });
      const open = pos.filter(poOpen);
      return h('div', {}, SA.pageHead({ title: 'أوامر الشراء', desc: 'من المسودة للاعتماد (حسب الحدود) ثم الإرسال للمورد والاستلام الجزئي/الكلي وفحص الجودة وفاتورة المورد.', actions: [SA.btn({ label: 'أمر شراء جديد', icon: 'plus', perm: 'scm.po.create', onClick: () => poForm() })] }),
        U.kpis([U.kpi({ label: 'أوامر مفتوحة', value: num(open.length), sub: canPrice() ? 'متبقي ' + fmt.short(sum(open, poOutstanding)) : null, icon: 'cart' }), U.kpi({ label: 'بانتظار الاعتماد', value: num(pos.filter((x) => x.status === 'pending_approval').length), icon: 'inbox', tone: pos.some((x) => x.status === 'pending_approval') ? 'warning' : null }),
          U.kpi({ label: 'متأخرة عن موعد التوريد', value: num(pos.filter(poLate).length), icon: 'clock', tone: pos.some(poLate) ? 'danger' : 'success' }), U.kpi({ label: 'مسودات', value: num(pos.filter((x) => x.status === 'draft').length), icon: 'edit' }),
          U.kpi({ label: 'استلامات هذا الشهر', value: num(col('grns').filter((g) => String(g.at).slice(0, 7) === mk).length), icon: 'inbox' })]),
        h('div', { style: { marginTop: '16px' } }, SA.card({ flush: true }, t.el)));
    }, ['purchaseOrders', 'grns', 'approvals']);
  }

  /* ═════════════ 5. supplier scorecards (scm/suppliers[/S-id]) ═════════════ */
  function ratingModal(sid) {
    if (!SA.can('scm.suppliers.edit')) return noPerm('scm.suppliers.edit');
    const s = sup(sid); if (!s) return; const sc = scorecard(sid); let v = Number(s.rating) || 3; const old = v;
    const prev = h('div.pinv-row'); const noteIn = h('textarea.textarea', { rows: 2, placeholder: 'سبب التعديل (مثال: تأخير متكرر في التوريد / تحسن الجودة)' }); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    const draw = () => { SA.clear(prev); prev.append(stars(v), h('span.pinv-muted', {}, 'المقترح من الأداء الفعلي: ' + (sc.score / 20).toFixed(1) + ' (الدرجة ' + sc.score + ')')); };
    const range = h('input', { type: 'range', min: 1, max: 5, step: 0.1, value: v, 'aria-label': 'التقييم من 1 إلى 5', style: { width: '100%' }, oninput: (e) => { v = Number(e.target.value); draw(); } });
    const go = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      const note = noteIn.value.trim(); if (note.length < 3) return showErr(err, 'اكتب سبب تعديل التقييم.'); m.setBusy(true);
      try { await SA.api(() => { st.patch('suppliers', sid, { rating: Math.round(v * 10) / 10, ratingNote: note, ratedAt: ERP.now(), ratedBy: me() }); SA.audit('SUPPLIER.RATED', { area: 'scm', target: { type: 'supplier', id: sid, label: s.name }, before: { rating: old }, after: { rating: Math.round(v * 10) / 10 }, reason: note }); }); } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(true); SA.toast('تم تحديث تقييم ' + s.name, 'success');
    } }, SA.icon('check', 'icon-sm'), 'حفظ التقييم');
    const m = SA.modal({ title: 'تقييم المورد', subtitle: s.name, icon: 'star', size: 'sm', body: h('div.pinv-stack', {}, prev, range, infoBox([['الالتزام بالمواعيد', sc.onTime == null ? '—' : Math.round(sc.onTime * 100) + '%'], ['قبول الجودة', sc.quality == null ? '—' : Math.round(sc.quality * 1000) / 10 + '%'], ['متوسط التأخير', Math.round(sc.avgDelay) + ' يوم']]), fld('السبب', noteIn), err),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), go] });
    draw();
  }
  function trendCell(sc) {
    const iid = sc.main[0]; if (!iid) return h('span.pinv-muted', {}, '—'); const tr = priceTrend(iid, sc.s.id, 12); const v = tr.vals.filter((x) => x != null); if (v.length < 2) return h('span.pinv-muted', {}, ERP.itemName(iid));
    const ch = (v[v.length - 1] - v[0]) / v[0];
    return h('span.pinv-row', { title: ERP.itemName(iid) + ' — متوسط سعر الشراء الشهري' }, CH.spark(v, { color: ch > 0.03 ? 'var(--color-danger)' : 'var(--eg-navy)' }), h('small.num.' + (ch > 0.03 ? 'pinv-neg' : 'pinv-muted'), {}, (ch >= 0 ? '+' : '') + Math.round(ch * 100) + '%'));
  }
  function renderSupplierDetail(root, ctx, sid) {
    page(ctx, [{ label: 'المشتريات' }, { label: 'تقييم الموردين', href: '#/scm/suppliers' }, { label: (sup(sid) || {}).name || sid }]);
    return SA.live(root, () => {
      const s = sup(sid); const back = { label: 'تقييم الموردين', href: '#/scm/suppliers' };
      if (!s) return h('div', {}, SA.pageHead({ title: 'المورد ' + sid, back }), SA.card({}, SA.empty({ icon: 'search', title: 'المورد غير موجود' })));
      const sc = scorecard(sid); const pos = col('purchaseOrders').filter((p) => p.supplierId === sid).sort(byDesc('createdAt'));
      const charts = sc.main.slice(0, 2).map((iid) => { const tr = priceTrend(iid, sid, 12); return SA.card({ title: 'اتجاه سعر الشراء — ' + ERP.itemName(iid) }, tr.vals.some((x) => x != null) ? CH.line({ labels: tr.keys.map(ERP.monthLabel), series: [{ name: 'متوسط السعر', values: tr.vals }], area: true, height: 190, fmt: (n) => fmt.num(n, 1), title: 'اتجاه السعر' }) : SA.empty({ icon: 'trend', title: 'لا توجد بيانات أسعار' })); });
      const hist = sc.all.slice(0, 15);
      const histTbl = hist.length ? h('div.table-wrap', {}, h('table.table.pinv-tbl', {}, h('thead', {}, h('tr', {}, ['المستند', 'الصنف', 'الموعد', 'الاستلام', 'التأخير', 'الكمية', 'المقبول', 'سعر الوحدة'].map((x) => h('th', {}, x)))),
        h('tbody', {}, hist.map((d) => { const late = d.promised && d.received > d.promised; const u = uomOf(d.itemId); return h('tr', {}, h('td', {}, d.src === 'grn' ? link(d.id) : h('span.num.pinv-muted', { title: 'سجل تاريخي قبل تشغيل النظام' }, d.poRef)), h('td', {}, ERP.itemName(d.itemId)), h('td', {}, fmt.date(d.promised)), h('td', {}, fmt.date(d.received)),
          h('td', {}, late ? tag(ERP.daysBetween(d.promised, d.received) + ' يوم', 'danger') : tag('في الموعد', 'success')), h('td.num', {}, qty(d.qty, u)), h('td', {}, d.pending ? tag('بانتظار الجودة', 'warning') : d.rejected ? h('span.pinv-neg.num', {}, qty(d.accepted, u) + ' (مرفوض ' + num(d.rejected) + ')') : h('span.num', {}, qty(d.accepted, u))), h('td.num', {}, price(d.price))); })))) : SA.empty({ icon: 'inbox', title: 'لا يوجد سجل توريدات' });
      return h('div', {},
        SA.pageHead({ title: s.name, desc: (s.category || '') + ' · ' + (isImport(s) ? 'استيراد — ' + s.country + (s.importLeadDays ? ' (مدة الاستيراد ' + s.importLeadDays + ' يوم)' : '') : 'مورد محلي') + ' · ' + s.code, tags: [h('b.pinv-score.is-' + scoreTone(sc.score), { title: 'درجة الأداء' }, sc.score), s.prospect ? tag('مورد محتمل', 'warning') : null], back,
          actions: [SA.can('sa.suppliers.view') ? linkBtn('البيانات الأساسية', 'suppliers?q=' + encodeURIComponent(s.code), 'external') : null, SA.btn({ label: 'تعديل التقييم', icon: 'star', kind: 'ghost', perm: 'scm.suppliers.edit', onClick: () => ratingModal(sid) }), SA.btn({ label: 'أمر شراء جديد', icon: 'plus', perm: 'scm.po.create', onClick: () => poForm({ supplierId: sid }) })] }),
        U.kpis([U.kpi({ label: 'درجة الأداء', value: String(sc.score), sub: 'مواعيد 40% · جودة 40% · تقييم 20%', icon: 'award', tone: scoreTone(sc.score) }),
          U.kpi({ label: 'الالتزام بالمواعيد', value: sc.onTime == null ? '—' : Math.round(sc.onTime * 100) + '%', sub: sc.deliveries + ' توريد · متوسط التأخير ' + Math.round(sc.avgDelay) + ' يوم', icon: 'clock', tone: pctTone(sc.onTime) === 'neutral' ? null : pctTone(sc.onTime) }),
          U.kpi({ label: 'قبول الجودة (فحص الاستلام)', value: sc.quality == null ? '—' : Math.round(sc.quality * 1000) / 10 + '%', sub: sc.ncrs.length ? sc.ncrs.length + ' عدم مطابقة' : 'بدون عدم مطابقة', icon: 'checkcircle', tone: pctTone(sc.quality) === 'neutral' ? null : pctTone(sc.quality) }),
          U.kpi({ label: 'التقييم', value: (Number(s.rating) || 0).toFixed(1) + ' / 5', sub: s.ratedAt ? 'عُدّل ' + SA.fmt.rel(s.ratedAt) : 'تقييم المشتريات', icon: 'star' }),
          U.kpi({ label: 'أوامر مفتوحة', value: num(sc.open.length), sub: (sc.late.length ? sc.late.length + ' متأخر · ' : '') + (canPrice() ? fmt.short(sc.openVal) : ''), icon: 'cart', tone: sc.late.length ? 'warning' : null, href: '#/scm/po?supplier=' + sid }),
          U.kpi({ label: 'الرصيد المستحق للمورد', value: canPrice() ? fmt.short(s.balance || 0) : lockTag(), sub: 'أجل السداد ' + (s.termsDays != null ? s.termsDays + ' يوم' : '—'), icon: 'coins' })]),
        charts.length ? U.grid(2, ...charts) : null,
        h('div.pinv-split', {}, SA.card({ title: 'سجل التوريدات والجودة', tags: U.demo('يشمل سجلًا تاريخيًا 12 شهر'), flush: true }, histTbl),
          h('div.pinv-stack', {}, SA.card({ title: 'أوامر الشراء' }, pos.length ? h('div.pinv-stack', {}, pos.slice(0, 8).map((p) => h('div.pinv-row', {}, link(p.id), U.status('po', p.status), h('span.pinv-muted', {}, fmt.date(p.expectedDate)), poLate(p) ? tag('متأخر', 'danger') : null, h('span.pinv-grow'), price(poNet(p))))) : h('p.pinv-muted', {}, 'لا توجد أوامر شراء.')),
            SA.card({ title: 'عدم المطابقة (من فحص الاستلام)' }, sc.ncrs.length ? h('div.pinv-stack', {}, sc.ncrs.map((n) => h('div.pinv-row', {}, link(n.id), U.status('ncr', n.status), h('span.pinv-muted', {}, ERP.itemName(n.itemId) + ' — ' + n.rootCause)))) : h('p.pinv-muted', {}, 'لا توجد حالات عدم مطابقة.')),
            SA.card({ title: 'التواصل والشروط' }, SA.kv([['جهة الاتصال', (s.contacts || [])[0] ? s.contacts[0].name : '—'], ['الهاتف', (s.contacts || [])[0] ? h('span.num', {}, s.contacts[0].phone) : '—'], ['أجل السداد', s.termsDays != null ? s.termsDays + ' يوم' : '—'], ['الأصناف', itemsOfSupplier(sid).map((i) => i.code).join('، ') || '—'], s.ratingNote ? ['ملاحظة التقييم', s.ratingNote] : null])))));
    }, ['suppliers', 'purchaseOrders', 'grns', 'supHistory', 'ncrs']);
  }
  function renderSuppliers(root, ctx) {
    const sid = ctx.path[0]; if (sid) return renderSupplierDetail(root, ctx, sid);
    page(ctx, [{ label: 'المشتريات' }, { label: 'تقييم الموردين' }]);
    return SA.live(root, () => {
      const cards = col('suppliers').map((s) => scorecard(s.id)); const k = keep('sup'); if (!k.initial.sort) k.initial.sort = { key: 'score', dir: 'desc' };
      const rated = cards.filter((c) => c.onTime != null); const avgOn = rated.length ? sum(rated, (c) => c.onTime) / rated.length : null; const qd = cards.filter((c) => c.quality != null); const avgQ = qd.length ? sum(qd, (c) => c.quality) / qd.length : null;
      const t = SA.table({ caption: 'تقييم الموردين', rowId: 'sid',
        columns: [{ key: 'name', label: 'المورد', sort: true, value: (c) => c.s.name, render: (c) => h('span.pinv-row', {}, supCell(c.s.id), c.s.prospect ? tag('محتمل', 'warning') : null) },
          { key: 'score', label: 'الدرجة', sort: true, value: (c) => c.score, render: (c) => h('b.pinv-score.is-' + scoreTone(c.score), {}, c.score) },
          { key: 'onTime', label: 'الالتزام بالمواعيد', sort: true, value: (c) => (c.onTime == null ? -1 : c.onTime), render: (c) => meter(c.onTime) },
          { key: 'quality', label: 'قبول الجودة', sort: true, value: (c) => (c.quality == null ? -1 : c.quality), render: (c) => meter(c.quality) },
          { key: 'rating', label: 'التقييم', sort: true, value: (c) => c.s.rating || 0, render: (c) => stars(c.s.rating) },
          { key: 'open', label: 'أوامر مفتوحة', sort: true, value: (c) => c.open.length, render: (c) => h('span.pinv-cell', {}, h('b.num', {}, c.open.length), c.late.length ? tag(c.late.length + ' متأخر', 'danger') : null) },
          { key: 'balance', label: 'الرصيد المستحق', sort: true, value: (c) => c.s.balance || 0, class: 'num', render: (c) => price(c.s.balance || 0) },
          { key: 'terms', label: 'أجل السداد', value: (c) => c.s.termsDays, render: (c) => (c.s.termsDays != null ? c.s.termsDays + ' يوم' : '—') },
          { key: 'trend', label: 'سعر الصنف الرئيسي', render: trendCell }],
        rows: cards.map((c) => Object.assign(c, { sid: c.s.id })), onRowClick: (c) => SA.nav('scm/suppliers/' + c.s.id), initial: k.initial, onChange: k.onChange, pageSize: 25,
        rowActions: (c) => [{ label: 'بطاقة الأداء', icon: 'award', onClick: () => SA.nav('scm/suppliers/' + c.s.id) }, { label: 'تعديل التقييم', icon: 'star', disabled: SA.can('scm.suppliers.edit') ? false : 'ليست من صلاحياتك', onClick: () => ratingModal(c.s.id) }, { label: 'أمر شراء جديد', icon: 'plus', disabled: SA.can('scm.po.create') ? false : 'ليست من صلاحياتك', onClick: () => poForm({ supplierId: c.s.id }) }, SA.can('sa.suppliers.view') ? { label: 'البيانات الأساسية', icon: 'external', onClick: () => SA.nav('suppliers?q=' + encodeURIComponent(c.s.code)) } : null].filter(Boolean),
        search: { placeholder: 'بحث باسم المورد أو التخصص…', keys: [(c) => c.s.name, (c) => c.s.code, (c) => c.s.category] },
        filters: [{ key: 'origin', label: 'المنشأ', options: [['local', 'محلي'], ['import', 'استيراد']], test: (c, v) => (v === 'import' ? isImport(c.s) : !isImport(c.s)) }, { key: 'perf', label: 'الأداء', options: [['good', 'ممتاز (85+)'], ['mid', 'متوسط'], ['bad', 'ضعيف (أقل من 70)']], test: (c, v) => (v === 'good' ? c.score >= 85 : v === 'bad' ? c.score < 70 : c.score >= 70 && c.score < 85) }],
        empty: { icon: 'award', title: 'لا يوجد موردون' } });
      return h('div', {}, SA.pageHead({ title: 'تقييم أداء الموردين', desc: 'الالتزام بالمواعيد (أوامر الشراء مقابل تواريخ الاستلام) وقبول الجودة من فحص الاستلام واتجاه الأسعار — البيانات الأساسية للموردين في شاشة «الموردون».', tags: [U.demo('يشمل سجلًا تاريخيًا')],
        actions: [SA.can('sa.suppliers.view') ? linkBtn('البيانات الأساسية للموردين', 'suppliers', 'external') : null] }),
        U.kpis([U.kpi({ label: 'موردون نشطون', value: num(cards.filter((c) => c.s.status === 'active').length), sub: cards.filter((c) => isImport(c.s)).length + ' استيراد', icon: 'truck' }), U.kpi({ label: 'متوسط الالتزام بالمواعيد', value: avgOn == null ? '—' : Math.round(avgOn * 100) + '%', icon: 'clock', tone: pctTone(avgOn) === 'neutral' ? null : pctTone(avgOn) }),
          U.kpi({ label: 'متوسط قبول الجودة', value: avgQ == null ? '—' : Math.round(avgQ * 1000) / 10 + '%', icon: 'checkcircle' }), U.kpi({ label: 'موردون أداؤهم ضعيف', value: num(cards.filter((c) => c.score < 70).length), sub: cards.filter((c) => c.score < 70).map((c) => c.s.name.split(' — ')[0]).slice(0, 2).join('، '), icon: 'alert', tone: cards.some((c) => c.score < 70) ? 'danger' : 'success' })]),
        h('div', { style: { marginTop: '16px' } }, SA.card({ flush: true }, t.el)));
    }, ['suppliers', 'purchaseOrders', 'grns', 'supHistory']);
  }

  /* ═════════════ 6. goods receipts (scm/grn[/GRN-id]) ═════════════ */
  function pickPOToReceive() {
    if (!SA.can('scm.grn.create')) return noPerm('scm.grn.create');
    const pos = col('purchaseOrders').filter((p) => p.status === 'sent' || p.status === 'partially_received'); if (!pos.length) return SA.toast('لا توجد أوامر شراء مُرسلة بانتظار الاستلام.', 'info');
    const m = SA.modal({ title: 'استلام على أمر شراء', subtitle: 'اختر أمر الشراء الذي وصلت بضاعته', icon: 'inbox', size: 'md', body: h('div.pinv-stack', {}, pos.map((p) => h('button.btn.btn-ghost', { type: 'button', style: { justifyContent: 'space-between', width: '100%' }, onclick: () => { m.close(p.id); receiveModal(p.id); } },
      h('span.pinv-cell', { style: { textAlign: 'start' } }, h('b.num', {}, p.id), h('small', {}, supName(p.supplierId) + ' — ' + p.lines.map((l) => ERP.itemName(l.itemId)).join('، '))), h('span.pinv-row', {}, poLate(p) ? tag('متأخر', 'danger') : null, U.status('po', p.status))))), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إغلاق')] });
  }
  function grnQcCell(g) { return h('span.pinv-cell', {}, g.lines.map((l) => { const q = qcOfGrnLine(g, l.itemId); return q ? h('span.pinv-row', {}, link(q.id), U.status('qc', q.result)) : null; })); }
  function renderGRNDetail(root, ctx, id) {
    page(ctx, [{ label: 'المخازن' }, { label: 'استلام البضاعة', href: '#/scm/grn' }, { label: id }]);
    return SA.live(root, () => {
      const g = ERP.find('grns', id); const back = { label: 'استلام البضاعة', href: '#/scm/grn' };
      if (!g) return h('div', {}, SA.pageHead({ title: 'إذن الاستلام ' + id, back }), SA.card({}, SA.empty({ icon: 'search', title: 'إذن الاستلام غير موجود' })));
      const po = ERP.find('purchaseOrders', g.poId); const bills = col('bills').filter((b) => b.grnId === id); const pend = g.status === 'pending_qc';
      const qcs = g.lines.map((l) => qcOfGrnLine(g, l.itemId)); const firstPending = qcs.find((q) => q && q.result === 'pending'); const anyAcc = g.lines.some((l) => l.acceptedQty > 0);
      const steps = [['استلام', true, SA.fmt.dt(g.at)], ['فحص الجودة', !pend, pend ? 'بانتظار الجودة' : (C.status.grn[g.status] || [g.status])[0]], ['دخول المخزون', anyAcc, anyAcc ? whName(g.whId) : pend ? 'بعد القبول' : 'لا يوجد'], ['فاتورة المورد', bills.length > 0, bills.length ? bills.map((b) => b.id).join('، ') : 'تلقائي بعد القبول']];
      const cur = steps.findIndex((s) => !s[1]);
      const tbl = h('div.table-wrap', {}, h('table.table.pinv-tbl', {}, h('thead', {}, h('tr', {}, ['الصنف', 'المستلم', 'المقبول', 'المرفوض', 'سعر الوحدة', 'فحص الجودة', 'عدم المطابقة'].map((x) => h('th', {}, x)))),
        h('tbody', {}, g.lines.map((l, i) => { const u = uomOf(l.itemId); const q = qcs[i]; const n = ncrOfGrnLine(g, l.itemId, q); return h('tr', {}, h('td', {}, U.itemCell(l.itemId)), h('td.num', {}, qty(l.qty, u)), h('td.num', {}, l.acceptedQty == null ? '—' : h('b.pinv-pos', {}, qty(l.acceptedQty, u))), h('td.num', {}, l.rejectedQty ? h('b.pinv-neg', {}, qty(l.rejectedQty, u)) : l.acceptedQty == null ? '—' : '0'),
          h('td.num', {}, price(l.price)), h('td', {}, q ? h('span.pinv-row', {}, link(q.id), U.status('qc', q.result)) : '—'), h('td', {}, n ? h('span.pinv-row', {}, link(n.id), U.status('ncr', n.status)) : '—')); }))));
      return h('div', {},
        SA.pageHead({ title: 'إذن استلام ' + g.id, desc: supName(g.supplierId) + ' · ' + whName(g.whId) + ' · استلمه ' + SA.userName(g.receivedBy) + ' ' + SA.fmt.rel(g.at), tags: [U.status('grn', g.status)], back,
          actions: [po ? linkBtn('أمر الشراء ' + po.id, 'scm/po/' + po.id, 'cart') : null, firstPending ? linkBtn('فتح فحص الجودة', 'mfg/qc/' + firstPending.id, 'beaker') : null] }),
        SA.card({}, h('ol.pinv-tl', { 'aria-label': 'مراحل الاستلام' }, steps.map((s, i) => h('li', { class: s[1] ? 'is-done' : i === cur ? 'is-now' : '' }, h('i'), h('b', {}, s[0]), h('small', {}, s[2]))))),
        pend ? SA.alert('warning', 'البضاعة في منطقة الاستلام بانتظار قرار الجودة — عند القبول تدخل ' + whName(g.whId) + ' تلقائيًا ويُسجّل فاتورة المورد، والمرفوض يذهب لمنطقة الحجر للإرجاع.') : null,
        h('div.pinv-split', {}, SA.card({ title: 'البنود ونتيجة فحص الاستلام', flush: true, tags: canPrice() ? null : lockTag() }, tbl),
          h('div.pinv-stack', {}, SA.card({ title: 'بيانات الاستلام' }, SA.kv([['أمر الشراء', po ? h('span.pinv-row', {}, link(po.id), U.status('po', po.status)) : g.poId], ['المورد', supCell(g.supplierId)], ['المخزن', whName(g.whId)], ['إذن تسليم المورد', g.supplierDn ? h('span.num', {}, g.supplierDn) : '—'], ['استلمه', SA.userName(g.receivedBy)], ['التاريخ', SA.fmt.dt(g.at)], g.note ? ['ملاحظة', g.note] : null])),
            SA.card({ title: 'فاتورة المورد' }, bills.length ? h('div.pinv-stack', {}, bills.map((b) => h('div.pinv-row', {}, link(b.id), U.status('bill', b.status), h('span.pinv-grow'), price(b.total)))) : h('p.pinv-muted', {}, pend ? 'تُسجّل تلقائيًا بعد قبول الجودة (مطابقة ثلاثية: أمر شراء ↔ استلام ↔ فاتورة).' : 'لا توجد فاتورة.')))));
    }, ['grns', 'qcInspections', 'bills', 'ncrs', 'purchaseOrders']);
  }
  function renderGRN(root, ctx) {
    const id = ctx.path[0]; if (id) return renderGRNDetail(root, ctx, id);
    page(ctx, [{ label: 'المخازن' }, { label: 'استلام البضاعة' }]); if (ctx.params.status) preset('grn', { status: ctx.params.status });
    return SA.live(root, () => {
      const list = col('grns').slice().sort(byDesc('at')); const k = keep('grn'); const mk = today().slice(0, 7);
      const t = SA.table({ caption: 'أذون الاستلام',
        columns: [{ key: 'id', label: 'الإذن', sort: true, render: (g) => h('span.pinv-cell', {}, h('b.num', {}, g.id), h('small', {}, SA.fmt.rel(g.at))) }, { key: 'poId', label: 'أمر الشراء', render: (g) => link(g.poId) },
          { key: 'supplier', label: 'المورد', sort: true, value: (g) => supName(g.supplierId), render: (g) => supCell(g.supplierId) },
          { key: 'items', label: 'الأصناف', render: (g) => h('span.pinv-cell', {}, g.lines.map((l) => h('span', {}, ERP.itemName(l.itemId) + ' — ', h('b.num', {}, qty(l.qty, uomOf(l.itemId)))))) },
          { key: 'whId', label: 'المخزن', sort: true, value: (g) => whName(g.whId) }, { key: 'at', label: 'التاريخ', sort: true, render: (g) => h('span.pinv-cell', {}, SA.fmt.dt(g.at), h('small', {}, SA.userName(g.receivedBy))) },
          { key: 'qc', label: 'فحص الاستلام', render: grnQcCell }, { key: 'status', label: 'الحالة', sort: true, render: (g) => U.status('grn', g.status) },
          { key: 'bill', label: 'الفاتورة', render: (g) => { const b = col('bills').filter((x) => x.grnId === g.id); return b.length ? h('span.pinv-cell', {}, b.map((x) => link(x.id))) : h('span.pinv-muted', {}, '—'); } }],
        rows: list, onRowClick: (g) => SA.nav('scm/grn/' + g.id), initial: k.initial, onChange: k.onChange, pageSize: 10,
        search: { placeholder: 'بحث برقم الإذن أو أمر الشراء أو المورد…', keys: ['id', 'poId', (g) => supName(g.supplierId), (g) => g.lines.map((l) => ERP.itemName(l.itemId)).join(' ')] },
        filters: [{ key: 'status', label: 'الحالة', options: Object.keys(C.status.grn).map((x) => [x, C.status.grn[x][0]]) }, { key: 'supplier', label: 'المورد', options: col('suppliers').filter((s) => list.some((g) => g.supplierId === s.id)).map((s) => [s.id, s.name]), test: (g, v) => g.supplierId === v }, { key: 'whId', label: 'المخزن', options: whList().map((w) => [w.id, w.name]) }],
        empty: { icon: 'inbox', title: 'لا توجد أذون استلام', text: 'الاستلام يتم من أمر الشراء المُرسل للمورد.' } });
      const thisM = list.filter((g) => String(g.at).slice(0, 7) === mk);
      return h('div', {}, SA.pageHead({ title: 'استلام البضاعة (GRN)', desc: 'كل استلام يمر بفحص استلام من الجودة قبل دخول المخزون، والمقبول يولّد فاتورة المورد تلقائيًا.', actions: [SA.btn({ label: 'استلام على أمر شراء', icon: 'inbox', perm: 'scm.grn.create', onClick: pickPOToReceive })] }),
        U.kpis([U.kpi({ label: 'بانتظار فحص الجودة', value: num(list.filter((g) => g.status === 'pending_qc').length), icon: 'beaker', tone: list.some((g) => g.status === 'pending_qc') ? 'warning' : null }), U.kpi({ label: 'استلامات هذا الشهر', value: num(thisM.length), sub: canPrice() ? fmt.short(sum(thisM, (g) => sum(g.lines, (l) => l.qty * l.price))) : null, icon: 'inbox' }),
          U.kpi({ label: 'مقبول جزئيًا / مرفوض', value: num(list.filter((g) => g.status === 'partially_accepted' || g.status === 'rejected').length), icon: 'alert', tone: 'danger' }), U.kpi({ label: 'أوامر بانتظار الاستلام', value: num(col('purchaseOrders').filter((p) => p.status === 'sent' || p.status === 'partially_received').length), icon: 'truck', href: '#/scm/po?status=sent' })]),
        h('div', { style: { marginTop: '16px' } }, SA.card({ flush: true }, t.el)));
    }, ['grns', 'qcInspections', 'bills', 'purchaseOrders']);
  }

  /* ═════════════ 7. stock balances + stock card (scm/stock[/IT-id]) ═════════════ */
  function stockStatus(r) {
    const it = item(r.itemId) || {};
    if (r.whId === W.QRT) return SA.chip('منطقة حجر', 'danger');
    const defRow = !r.whId || r.whId === K.defaultWh(it);
    if (defRow && it.reorderPoint > 0 && K.qty(it.id) <= it.reorderPoint) return SA.chip(K.qty(it.id) <= 0 ? 'نفد' : 'تحت حد الطلب', 'danger');
    if (r.qty > 0 && r.reserved >= r.qty) return SA.chip('محجوز بالكامل', 'warning');
    return r.qty > 0 ? SA.chip('متاح', 'success') : SA.chip('صفر', 'neutral');
  }
  function stockRows(view) {
    if (view === 'item') return col('items').map((it) => ({ id: it.id, itemId: it.id, whId: '', qty: K.qty(it.id), reserved: K.reserved(it.id), avail: K.available(it.id), qrt: K.qty(it.id, W.QRT), whs: col('stock').filter((r) => r.itemId === it.id && r.qty > 0).length }));
    return col('stock').map((r) => ({ id: r.id, itemId: r.itemId, whId: r.whId, qty: r.qty, reserved: r.reserved || 0, avail: Math.max(0, r.qty - (r.reserved || 0)) }));
  }
  function exportStock(rows, view) {
    if (!SA.can('scm.stock.export')) return noPerm('scm.stock.export');
    const cc = canCost(); const head = ['الكود', 'الصنف', 'النوع', view === 'item' ? 'عدد المخازن' : 'المخزن', 'الرصيد', 'محجوز', 'المتاح', 'الوحدة', 'حد الطلب'].concat(cc ? ['التكلفة المعيارية', 'القيمة'] : []);
    const data = rows.map((r) => { const it = item(r.itemId) || {}; return [it.code, it.name, KIND_L[it.kind] || it.kind, view === 'item' ? r.whs : whName(r.whId), r.qty, r.reserved, r.avail, ERP.uom[it.uom] || it.uom, it.reorderPoint == null ? '' : it.reorderPoint].concat(cc ? [it.stdCost || 0, Math.round(r.qty * (it.stdCost || 0))] : []); });
    SA.download('stock-balances-' + today() + '.csv', SA.csv([head].concat(data)), 'text/csv');
    SA.audit('EXPORT.DATA', { area: 'scm', target: { type: 'report', id: 'stock-balances', label: 'أرصدة المخزون' }, after: { rows: data.length, withCost: cc } });
    SA.toast('تم تصدير ' + data.length + ' صف' + (cc ? '' : ' (بدون أعمدة التكلفة — حسب صلاحياتك)'), 'success');
  }
  function renderStockCard(root, ctx, itemId) {
    const it0 = item(itemId); page(ctx, [{ label: 'المخازن' }, { label: 'أرصدة المخزون', href: '#/scm/stock' }, { label: it0 ? it0.code : itemId }]);
    return SA.live(root, () => {
      const it = item(itemId); const back = { label: 'أرصدة المخزون', href: '#/scm/stock' };
      if (!it) return h('div', {}, SA.pageHead({ title: 'كارت الصنف', back }), SA.card({}, SA.empty({ icon: 'search', title: 'الصنف غير موجود: ' + itemId })));
      const u = it.uom; const rows = col('stock').filter((r) => r.itemId === itemId); const moves = col('stockMoves').filter((m) => m.itemId === itemId);
      const onHand = K.qty(itemId), res = K.reserved(itemId), av = K.available(itemId), oo = K.onOrder(itemId), qrt = K.qty(itemId, W.QRT); const cov = coverDays(itemId); const isFg = it.kind === 'fg'; const buy = PURCH.indexOf(it.kind) >= 0;
      const low = it.reorderPoint > 0 && onHand <= it.reorderPoint; const fin = it.attrs && it.attrs.color ? ERP.finish(it.attrs.color) : null;
      /* balance chart: end-of-day total (excl. quarantine) for 30 days */
      const days = 30; const labels = []; const vals = []; const endOf = (i) => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime() - i * DAY; };
      for (let i = days - 1; i >= 0; i--) { const tEnd = i === 0 ? Date.now() : endOf(i); let b = onHand; moves.forEach((m) => { if (m.whId !== W.QRT && new Date(m.ts).getTime() > tEnd) b -= m.qty; }); const d = new Date(tEnd); labels.push(d.getDate() + '/' + (d.getMonth() + 1)); vals.push(Math.max(0, r2(b))); }
      const series = [{ name: 'الرصيد', values: vals }]; if (it.reorderPoint > 0) series.push({ name: 'حد الطلب', values: vals.map(() => it.reorderPoint), dashed: true, color: 'var(--color-danger)' });
      const pos = col('purchaseOrders').filter((p) => poOpen(p) && p.lines.some((l) => l.itemId === itemId && l.qty > (l.receivedQty || 0)));
      const wos = col('workOrders').filter((w) => ['planned', 'released', 'in_progress', 'on_hold', 'qc_pending'].indexOf(w.status) >= 0);
      const consuming = isFg ? [] : wos.map((w) => { const mm = ERP.materialsFor(w.itemId, Math.max(0, w.qty - (w.qtyDone || 0))).find((x) => x.itemId === itemId); return mm && mm.qty > 0 ? { w, need: mm.qty } : null; }).filter(Boolean);
      const producing = isFg ? wos.filter((w) => w.itemId === itemId) : [];
      const reservations = isFg ? col('salesOrders').map((so) => ({ so, l: so.lines.find((l) => l.itemId === itemId) })).filter((x) => x.l && (x.l.reservedQty || 0) - (x.l.deliveredQty || 0) > 0 && ['cancelled', 'rejected', 'closed'].indexOf(x.so.status) < 0) : [];
      const prqs = col('purchaseRequisitions').filter((r) => r.itemId === itemId && ['open', 'approved'].indexOf(r.status) >= 0);
      const k = keep('card-' + itemId);
      const ledger = SA.table({ caption: 'حركات الصنف', columns: [{ key: 'ts', label: 'التاريخ', sort: true, render: (m) => SA.fmt.dt(m.ts) }, { key: 'type', label: 'النوع', render: (m) => moveChip(m.type) }, { key: 'whId', label: 'المخزن', value: (m) => whName(m.whId) },
        { key: 'qty', label: 'الكمية', sort: true, class: 'num', render: (m) => h('b.num.' + (m.qty < 0 ? 'pinv-neg' : 'pinv-pos'), {}, (m.qty > 0 ? '+' : '') + num(m.qty, 2)) }, { key: 'balance', label: 'الرصيد بعد الحركة', class: 'num', render: (m) => (m.balance == null ? '—' : num(m.balance, 2)) },
        { key: 'ref', label: 'المستند', render: (m) => refLink(m.ref) }, { key: 'note', label: 'البيان', render: (m) => h('span.pinv-cell', {}, m.note || '—', m.lot ? h('small.num', {}, m.lot) : null) }, { key: 'by', label: 'بواسطة', value: (m) => (m.by === 'SYSTEM' ? 'النظام' : SA.userName(m.by)) }],
        rows: moves, pageSize: 10, initial: k.initial, onChange: k.onChange, filters: [{ key: 'whId', label: 'المخزن', options: rows.map((r) => [r.whId, whName(r.whId)]) }, { key: 'type', label: 'النوع', options: Object.keys(MOVE_T).map((x) => [x, MOVE_T[x][0]]) }],
        empty: { icon: 'activity', title: 'لا توجد حركات لهذا الصنف' } });
      const mini = (title, list, rowFn, empty) => SA.card({ title }, list.length ? h('div.pinv-stack', {}, list.map(rowFn)) : h('p.pinv-muted', { style: { margin: 0 } }, empty));
      const exportMoves = () => { if (!SA.can('scm.stock.export')) return noPerm('scm.stock.export'); SA.download('stock-card-' + it.code + '.csv', SA.csv([['التاريخ', 'النوع', 'المخزن', 'الكمية', 'الرصيد بعد', 'المستند', 'البيان']].concat(moves.map((m) => [SA.fmt.iso(m.ts), (MOVE_T[m.type] || [m.type])[0], whName(m.whId), m.qty, m.balance, m.ref ? m.ref.id : '', m.note]))), 'text/csv'); SA.audit('EXPORT.DATA', { area: 'scm', target: { type: 'item', id: itemId, label: 'كارت صنف ' + it.code }, after: { rows: moves.length } }); SA.toast('تم تصدير حركات ' + it.code, 'success'); };
      return h('div', {},
        SA.pageHead({ title: it.name, desc: it.code + ' · ' + (KIND_L[it.kind] || it.kind) + ' · ' + (ERP.families[it.family] || it.family) + (fin ? ' · ' + fin.code + ' ' + fin.name : ''), tags: [fin ? U.swatch(fin.code) : null, low ? SA.chip(onHand <= 0 ? 'نفد' : 'تحت حد الطلب', 'danger') : null, qrt ? SA.chip('في الحجر ' + num(qrt), 'warning') : null], back,
          actions: [SA.btn({ label: 'تصدير الحركات', icon: 'download', kind: 'ghost', perm: 'scm.stock.export', onClick: exportMoves }), SA.btn({ label: 'تسوية', icon: 'edit', kind: 'ghost', perm: 'scm.stock.adjust', onClick: () => adjustModal({ itemId }) }), SA.btn({ label: 'تحويل', icon: 'swap', kind: 'ghost', perm: 'scm.transfers.create', onClick: () => transferModal({ itemId, from: K.defaultWh(it) }) }),
            buy ? SA.btn({ label: 'طلب شراء', icon: 'clipboard', perm: 'scm.requisitions.create', onClick: () => newPRQ({ itemId, reason: low ? 'تحت حد الطلب' : 'إعادة طلب من كارت الصنف', source: low ? 'reorder' : 'manual' }) }) : SA.can('mfg.planning.view') ? linkBtn('خطة الإنتاج', 'mfg/planning', 'factory') : null] }),
        U.kpis([U.kpi({ label: 'الرصيد (بدون الحجر)', value: qty(onHand, u), sub: rows.filter((r) => r.qty > 0 && r.whId !== W.QRT).length + ' مخزن', icon: 'box', tone: low ? 'danger' : null }), U.kpi({ label: 'محجوز لأوامر البيع', value: qty(res, u), icon: 'lock' }), U.kpi({ label: 'المتاح', value: qty(av, u), icon: 'checkcircle' }),
          buy ? U.kpi({ label: 'على أوامر شراء', value: qty(oo, u), sub: pos.length + ' أمر', icon: 'cart' }) : U.kpi({ label: 'تحت التشغيل', value: qty(sum(producing, (w) => Math.max(0, w.qty - (w.qtyDone || 0))), u), sub: producing.length + ' أمر تشغيل', icon: 'factory' }),
          U.kpi({ label: 'حد الطلب', value: it.reorderPoint != null ? qty(it.reorderPoint, u) : '—', sub: 'الحد الأدنى للطلب ' + (it.moq != null ? num(it.moq) : '—'), icon: 'target' }),
          U.kpi({ label: 'أيام التغطية', value: cov == null ? '—' : (cov > 365 ? '+365' : Math.round(cov)) + ' يوم', sub: ['استهلاك ' + (dailyUse(itemId) ? qty(dailyUse(itemId), u) + '/يوم' : '—') + ' · توريد ' + (it.leadDays || '—') + ' يوم ', U.demo('تقدير')], icon: 'clock', tone: cov != null && cov < (it.leadDays || 7) ? 'danger' : null }),
          U.kpi({ label: 'قيمة الرصيد', value: canCost() ? fmt.short(onHand * (it.stdCost || 0)) : U.cost(0), sub: canCost() ? 'تكلفة معيارية ' + fmt.money(it.stdCost) : null, icon: 'coins' })]),
        h('div.pinv-split', {},
          h('div.pinv-stack', {}, SA.card({ title: 'حركة الرصيد — آخر 30 يوم' }, CH.line({ labels, series, area: true, height: 200, fmt: (n) => num(Math.round(n)), title: 'الرصيد اليومي' })), SA.card({ title: 'كارت الصنف — سجل الحركات', flush: true }, ledger.el)),
          h('div.pinv-stack', {},
            SA.card({ title: 'بيانات الصنف' }, SA.kv([['الكود', h('span.num', {}, it.code)], ['النوع', KIND_L[it.kind] || it.kind], ['الوحدة', ERP.uom[u] || u], fin ? ['اللون', h('span.pinv-row', {}, U.swatch(fin.code), fin.code + ' — ' + fin.name)] : null, it.attrs && (it.attrs.width || it.attrs.thickness || it.attrs.size) ? ['المقاس', it.attrs.width ? it.attrs.width + '×' + it.attrs.height + ' سم' : it.attrs.thickness ? it.attrs.thickness + ' مم — ' + (it.attrs.size || '') : it.attrs.size] : null,
              it.price != null ? ['سعر البيع (القائمة)', U.money(it.price)] : null, ['التكلفة المعيارية', U.cost(it.stdCost)], it.supplierId ? ['المورد المفضل', supCell(it.supplierId)] : null, ['مدة التوريد', it.leadDays != null ? it.leadDays + ' يوم' : '—'], it.bomId ? ['مكونات المنتج', link(it.bomId)] : null])),
            SA.card({ title: 'الرصيد حسب المخزن', flush: true }, h('div.table-wrap', {}, h('table.table.pinv-tbl', {}, h('thead', {}, h('tr', {}, ['المخزن', 'الرصيد', 'محجوز', 'المتاح', 'القيمة', ''].map((x) => h('th', {}, x)))),
              h('tbody', {}, rows.length ? rows.map((r) => h('tr', {}, h('td', {}, whName(r.whId), r.whId === W.QRT ? tag('حجر', 'danger') : null), h('td.num', {}, num(r.qty, 2)), h('td.num', {}, num(r.reserved || 0, 2)), h('td.num', {}, num(Math.max(0, r.qty - (r.reserved || 0)), 2)), h('td.num', {}, U.cost(r.qty * (it.stdCost || 0))),
                h('td', {}, r.qty > (r.reserved || 0) && SA.can('scm.transfers.create') ? h('button.btn.btn-ghost.btn-icon.btn-sm', { type: 'button', title: 'تحويل من هذا المخزن', 'aria-label': 'تحويل من ' + whName(r.whId), onclick: () => transferModal({ itemId, from: r.whId }) }, SA.icon('swap', 'icon-sm')) : null))) : h('tr', {}, h('td', { colspan: 6 }, 'لا يوجد رصيد')))))),
            buy ? mini('أوامر شراء واردة', pos, (p) => { const l = p.lines.find((x) => x.itemId === itemId); return h('div.pinv-row', {}, link(p.id), h('span.pinv-muted', {}, supName(p.supplierId).split(' — ')[0]), h('b.num', {}, qty(l.qty - (l.receivedQty || 0), u)), h('span.pinv-muted', {}, fmt.date(p.expectedDate)), poLate(p) ? tag('متأخر', 'danger') : U.status('po', p.status)); }, 'لا توجد أوامر شراء مفتوحة.') : null,
            !isFg ? mini('أوامر تشغيل تستهلكه', consuming, (x) => h('div.pinv-row', {}, link(x.w.id), h('span.pinv-muted', {}, ERP.itemName(x.w.itemId)), h('b.num', {}, qty(x.need, u)), x.w.issued ? tag('تم الصرف', 'success') : tag('احتياج قادم', 'warning'), U.status('wo', x.w.status)), 'لا توجد أوامر تشغيل مفتوحة تستهلك هذا الصنف.') : null,
            isFg ? mini('أوامر تشغيل تنتجه', producing, (w) => h('div.pinv-row', {}, link(w.id), h('b.num', {}, qty(w.qty - (w.qtyDone || 0), u)), h('span.pinv-muted', {}, (ERP.line(w.lineId) || {}).code || w.lineId), U.status('wo', w.status)), 'لا توجد أوامر تشغيل مفتوحة.') : null,
            isFg ? mini('محجوز لأوامر البيع', reservations, (x) => h('div.pinv-row', {}, link(x.so.id), h('span.pinv-muted', {}, ERP.customerName(x.so.customerId).split(' — ')[0]), h('b.num', {}, qty(x.l.reservedQty - (x.l.deliveredQty || 0), u)), U.status('so', x.so.status)), 'لا توجد حجوزات.') : null,
            buy ? mini('طلبات شراء مفتوحة', prqs, (r) => h('div.pinv-row', {}, link(r.id), h('b.num', {}, qty(r.qty, u)), U.status('prq', r.status)), 'لا توجد طلبات شراء مفتوحة.') : null)));
    }, ['stock', 'stockMoves', 'purchaseOrders', 'workOrders', 'salesOrders', 'purchaseRequisitions', 'items']);
  }
  function renderStock(root, ctx) {
    const id = ctx.path[0]; if (id) return renderStockCard(root, ctx, id);
    page(ctx, [{ label: 'المخازن' }, { label: 'أرصدة المخزون' }]);
    const p = ctx.params; if (p.kind || p.wh || p.below || p.family || p.q) preset('stock', { kind: p.kind || '', whId: p.wh || '', below: p.below ? '1' : '', family: p.family || '' }, p.q || '');
    memo.stockView = memo.stockView || 'wh'; let off = null;
    const build = () => {
      const view = memo.stockView; const rows = stockRows(view); const k = keep('stock'); const cc = canCost();
      const low = lowItems(); const zero = col('items').filter((i) => i.reorderPoint > 0 && K.qty(i.id) <= 0); const qrt = col('stock').filter((r) => r.whId === W.QRT && r.qty > 0);
      const isDef = (r) => !r.whId || r.whId === K.defaultWh(r.itemId);
      const columns = [{ key: 'item', label: 'الصنف', sort: true, value: (r) => (item(r.itemId) || {}).name, render: (r) => U.itemCell(r.itemId) },
        view === 'item' ? { key: 'whs', label: 'المخازن', sort: true, class: 'num', render: (r) => h('span.pinv-cell', {}, num(r.whs), r.qrt ? tag('حجر ' + num(r.qrt), 'danger') : null) } : { key: 'whId', label: 'المخزن', sort: true, value: (r) => whName(r.whId) },
        { key: 'qty', label: 'الرصيد', sort: true, class: 'num', render: (r) => h('b.num', {}, qty(r.qty, uomOf(r.itemId))) }, { key: 'reserved', label: 'محجوز', sort: true, class: 'num', render: (r) => (r.reserved ? num(r.reserved, 2) : '—') },
        { key: 'avail', label: 'المتاح', sort: true, class: 'num', render: (r) => num(r.avail, 2) }, { key: 'rp', label: 'حد الطلب', sort: true, class: 'num', value: (r) => (isDef(r) ? (item(r.itemId) || {}).reorderPoint : null), render: (r) => (isDef(r) && (item(r.itemId) || {}).reorderPoint != null ? num(item(r.itemId).reorderPoint) : '—') },
        { key: 'cover', label: 'أيام التغطية', sort: true, value: (r) => (isDef(r) ? coverDays(r.itemId) : null), render: (r) => (isDef(r) && r.whId !== W.QRT ? coverCell(r.itemId) : '—') },
        { key: 'value', label: 'القيمة', sort: cc, class: 'num', value: (r) => (cc ? r.qty * ((item(r.itemId) || {}).stdCost || 0) : 0), render: (r) => U.cost(r.qty * ((item(r.itemId) || {}).stdCost || 0)) },
        { key: 'st', label: 'الحالة', render: stockStatus }];
      const t = SA.table({ caption: 'أرصدة المخزون', columns, rows, pageSize: 25, initial: k.initial, onChange: k.onChange, onRowClick: (r) => SA.nav('scm/stock/' + r.itemId),
        rowActions: (r) => [{ label: 'كارت الصنف', icon: 'box', onClick: () => SA.nav('scm/stock/' + r.itemId) }, { label: 'تسوية', icon: 'edit', disabled: SA.can('scm.stock.adjust') ? false : 'ليست من صلاحياتك (scm.stock.adjust)', onClick: () => adjustModal({ itemId: r.itemId, whId: r.whId || undefined }) },
          { label: 'تحويل', icon: 'swap', disabled: SA.can('scm.transfers.create') ? false : 'ليست من صلاحياتك (scm.transfers.create)', onClick: () => transferModal({ itemId: r.itemId, from: r.whId || K.defaultWh(r.itemId) }) },
          PURCH.indexOf((item(r.itemId) || {}).kind) >= 0 ? { label: 'طلب شراء', icon: 'clipboard', disabled: SA.can('scm.requisitions.create') ? false : 'ليست من صلاحياتك', onClick: () => newPRQ({ itemId: r.itemId, reason: 'تحت حد الطلب', source: 'reorder' }) } : null].filter(Boolean),
        search: { placeholder: 'بحث بالكود أو اسم الصنف أو اللون…', keys: [(r) => (item(r.itemId) || {}).code, (r) => (item(r.itemId) || {}).name, (r) => { const f = ERP.finish(((item(r.itemId) || {}).attrs || {}).color); return f ? f.name : ''; }] },
        filters: [{ key: 'kind', label: 'النوع', options: Object.keys(KIND_L).map((x) => [x, KIND_L[x]]), test: (r, v) => (item(r.itemId) || {}).kind === v },
          { key: 'family', label: 'العائلة', options: Object.keys(ERP.families).map((x) => [x, ERP.families[x]]), test: (r, v) => (item(r.itemId) || {}).family === v },
          { key: 'whId', label: 'المخزن', options: whList().map((w) => [w.id, w.name]), test: (r, v) => (view === 'item' ? K.qty(r.itemId, v) > 0 : r.whId === v) },
          { key: 'below', label: 'حد الطلب', options: [['1', 'تحت حد الطلب فقط']], test: (r) => { const it = item(r.itemId) || {}; return isDef(r) && it.reorderPoint > 0 && K.qty(it.id) <= it.reorderPoint; } }],
        toolbar: [SA.segmented([['wh', 'صنف × مخزن'], ['item', 'إجمالي الصنف']], view, (v) => { memo.stockView = v; if (off) off(); off = SA.live(root, build, PATHS); }),
          SA.btn({ label: 'CSV', icon: 'download', kind: 'ghost', size: 'sm', perm: 'scm.stock.export', onClick: () => exportStock(t.filteredRows(), view) })],
        empty: { icon: 'box', title: 'لا توجد أرصدة' } });
      return h('div', {}, SA.pageHead({ title: 'أرصدة المخزون', desc: 'الرصيد والمحجوز والمتاح لكل صنف في كل مخزن، مع حد الطلب وأيام التغطية — اضغط على الصنف لفتح كارت الصنف.',
        actions: [SA.btn({ label: 'تسوية مخزون', icon: 'edit', kind: 'ghost', perm: 'scm.stock.adjust', onClick: () => adjustModal() }), SA.btn({ label: 'تحويل بين المخازن', icon: 'swap', perm: 'scm.transfers.create', onClick: () => transferModal() })] }),
        U.kpis([U.kpi({ label: 'أصناف بالرصيد', value: num(col('items').filter((i) => K.qty(i.id) > 0).length), sub: 'من ' + col('items').length + ' صنف', icon: 'box' }), U.kpi({ label: 'قيمة المخزون', value: cc ? fmt.short(K.value()) : U.cost(0), icon: 'coins' }),
          U.kpi({ label: 'تحت حد الطلب', value: num(low.length), sub: low.slice(0, 2).map((i) => i.code).join('، '), icon: 'alert', tone: low.length ? 'danger' : 'success', href: '#/scm/stock?below=1' }), U.kpi({ label: 'رصيد صفر', value: num(zero.length), sub: zero.map((i) => i.code).slice(0, 2).join('، '), icon: 'xcircle', tone: zero.length ? 'danger' : null }),
          U.kpi({ label: 'منطقة الحجر', value: num(qrt.length) + ' صنف', sub: qrt.map((r) => (item(r.itemId) || {}).code).join('، '), icon: 'shield', tone: qrt.length ? 'warning' : null, href: '#/scm/transfers?tab=quarantine' })]),
        h('div', { style: { marginTop: '16px' } }, SA.card({ flush: true }, t.el)));
    };
    const PATHS = ['stock', 'stockMoves', 'items', 'purchaseOrders'];
    off = SA.live(root, build, PATHS); return () => { if (off) off(); };
  }

  /* ═════════════ 8. stock movements (scm/moves) ═════════════ */
  function renderMoves(root, ctx) {
    page(ctx, [{ label: 'المخازن' }, { label: 'حركات المخزون' }]);
    const p = ctx.params; if (p.type || p.wh || p.item) preset('moves', { type: p.type || '', whId: p.wh || '' }, p.item ? (item(p.item) || {}).code || p.item : null);
    return SA.live(root, () => {
      const moves = col('stockMoves'); const k = keep('moves'); const now = Date.now(); const since = (d) => (m) => now - new Date(m.ts).getTime() <= d * DAY;
      const t = SA.table({ caption: 'حركات المخزون',
        columns: [{ key: 'ts', label: 'التاريخ', sort: true, render: (m) => h('span.pinv-cell', {}, SA.fmt.dt(m.ts), h('small', {}, SA.fmt.rel(m.ts))) }, { key: 'type', label: 'النوع', sort: true, render: (m) => moveChip(m.type) },
          { key: 'item', label: 'الصنف', sort: true, value: (m) => ERP.itemName(m.itemId), render: (m) => U.itemCell(m.itemId) }, { key: 'whId', label: 'المخزن', sort: true, value: (m) => whName(m.whId) },
          { key: 'qty', label: 'الكمية', sort: true, class: 'num', render: (m) => h('b.num.' + (m.qty < 0 ? 'pinv-neg' : 'pinv-pos'), {}, (m.qty > 0 ? '+' : '') + qty(m.qty, uomOf(m.itemId))) }, { key: 'balance', label: 'الرصيد بعد', class: 'num', render: (m) => (m.balance == null ? '—' : num(m.balance, 2)) },
          { key: 'ref', label: 'المستند', render: (m) => refLink(m.ref) }, { key: 'note', label: 'البيان', render: (m) => h('span', { title: m.note }, m.note || '—') }, { key: 'by', label: 'بواسطة', value: (m) => (m.by === 'SYSTEM' ? 'النظام' : SA.userName(m.by)) }],
        rows: moves, pageSize: 25, initial: k.initial, onChange: k.onChange, onRowClick: (m) => SA.nav('scm/stock/' + m.itemId),
        search: { placeholder: 'بحث بالصنف أو رقم المستند أو البيان…', keys: [(m) => ERP.itemName(m.itemId), (m) => (item(m.itemId) || {}).code, (m) => (m.ref ? m.ref.id : ''), 'note'] },
        filters: [{ key: 'type', label: 'نوع الحركة', options: Object.keys(MOVE_T).map((x) => [x, MOVE_T[x][0]]) }, { key: 'whId', label: 'المخزن', options: whList().map((w) => [w.id, w.name]) },
          { key: 'period', label: 'الفترة', options: [['1', 'اليوم'], ['7', 'آخر 7 أيام'], ['30', 'آخر 30 يوم']], test: (m, v) => since(Number(v))(m) }, { key: 'kind', label: 'نوع الصنف', options: Object.keys(KIND_L).map((x) => [x, KIND_L[x]]), test: (m, v) => (item(m.itemId) || {}).kind === v }],
        toolbar: [SA.btn({ label: 'CSV', icon: 'download', kind: 'ghost', size: 'sm', perm: 'scm.stock.export', onClick: () => { const rows = t.filteredRows(); SA.download('stock-moves-' + today() + '.csv', SA.csv([['التاريخ', 'النوع', 'الكود', 'الصنف', 'المخزن', 'الكمية', 'الرصيد بعد', 'المستند', 'البيان']].concat(rows.map((m) => [SA.fmt.iso(m.ts), (MOVE_T[m.type] || [m.type])[0], (item(m.itemId) || {}).code, ERP.itemName(m.itemId), whName(m.whId), m.qty, m.balance, m.ref ? m.ref.id : '', m.note]))), 'text/csv'); SA.audit('EXPORT.DATA', { area: 'scm', target: { type: 'report', id: 'stock-moves', label: 'حركات المخزون' }, after: { rows: rows.length } }); SA.toast('تم تصدير ' + rows.length + ' حركة', 'success'); } })],
        empty: { icon: 'activity', title: 'لا توجد حركات' } });
      const d7 = moves.filter(since(7)); const adj30 = moves.filter((m) => m.type === 'adjust' && since(30)(m));
      return h('div', {}, SA.pageHead({ title: 'حركات المخزون', desc: 'كل حركة مخزنية مربوطة بمستندها: استلام، صرف لأمر تشغيل، إنتاج تام، تسليم، تحويل، تسوية، حجر أو مرتجع.' }),
        U.kpis([U.kpi({ label: 'حركات اليوم', value: num(moves.filter(since(1)).length), icon: 'activity' }), U.kpi({ label: 'استلامات وإنتاج (7 أيام)', value: num(d7.filter((m) => m.type === 'receipt' || m.type === 'production').length), icon: 'inbox' }),
          U.kpi({ label: 'صرف وتسليم (7 أيام)', value: num(d7.filter((m) => m.type === 'issue' || m.type === 'delivery').length), icon: 'truck' }), U.kpi({ label: 'تسويات (30 يوم)', value: num(adj30.length), sub: canCost() ? 'صافي ' + fmt.money(sum(adj30, (m) => m.qty * ((item(m.itemId) || {}).stdCost || 0))) : null, icon: 'edit', tone: adj30.length ? 'warning' : null })]),
        h('div', { style: { marginTop: '16px' } }, SA.card({ flush: true }, t.el)));
    }, ['stockMoves']);
  }

  /* ═════════════ 9. transfers + quarantine (scm/transfers) ═════════════ */
  async function qrtDispose(itemId, mode) {
    if (!SA.can('scm.stock.adjust')) return noPerm('scm.stock.adjust');
    const r = K.row(itemId, W.QRT); if (!r || r.qty <= 0) return; const it = item(itemId) || {}; const n = col('ncrs').find((x) => x.itemId === itemId && x.status !== 'closed');
    const c = await SA.confirm({ title: (mode === 'return' ? 'إرجاع للمورد — ' : 'تخريد — ') + it.code, danger: true, impact: [it.name + ' — ' + qty(r.qty, it.uom) + ' من منطقة الحجر', canCost() ? 'القيمة المعيارية: ' + fmt.money(r.qty * (it.stdCost || 0)) : null, n ? 'عدم المطابقة ' + n.id + ' — القرار: ' + (n.disposition || 'لم يُتخذ بعد') : null].filter(Boolean),
      warnings: n && !n.disposition ? ['لم يصدر قرار الجودة على ' + n.id + ' بعد — الأفضل انتظار القرار.'] : [], reasonRequired: true, reasonLabel: mode === 'return' ? 'رقم إذن الإرجاع / ملاحظة' : 'سبب التخريد', confirmLabel: mode === 'return' ? 'تسجيل الإرجاع' : 'تخريد' });
    if (!c.ok) return; if (!(await SA.stepUp('stock.adjust'))) return;
    try { await SA.api(() => { K.move({ itemId, whId: W.QRT, qty: -r.qty, type: mode === 'return' ? 'return' : 'scrap', ref: n ? { type: 'ncr', id: n.id } : null, note: (mode === 'return' ? 'إرجاع للمورد — ' : 'تخريد — ') + c.reason });
      SA.audit(mode === 'return' ? 'STOCK.MOVED' : 'STOCK.ADJUSTED', { area: 'scm', target: { type: 'item', id: itemId, label: it.name + ' — منطقة الحجر' }, before: { qty: r.qty }, after: { qty: 0, action: mode === 'return' ? 'إرجاع للمورد' : 'تخريد' }, reason: c.reason }); }); } catch (e) { return SA.fail(e); }
    SA.toast(mode === 'return' ? 'تم تسجيل إرجاع ' + it.code + ' للمورد' : 'تم تخريد ' + it.code, 'success');
  }
  function openTransfer(id) {
    const tr = col('transfers').find((x) => x.id === id); if (!tr) return;
    const mv = col('stockMoves').filter((m) => m.ref && m.ref.id === id);
    SA.drawer({ title: 'إذن تحويل ' + tr.id, subtitle: whName(tr.fromWh) + ' ← ' + whName(tr.toWh), size: 'md', body: h('div.pinv-stack', {}, SA.kv([['من', whName(tr.fromWh)], ['إلى', whName(tr.toWh)], ['النوع', TR_KIND[tr.kind] || tr.kind], ['بواسطة', SA.userName(tr.by)], ['التاريخ', SA.fmt.dt(tr.at)], ['ملاحظة', tr.note || '—']]),
      U.sub('الأصناف'), h('div.pinv-stack', {}, tr.lines.map((l) => h('div.pinv-row', {}, U.itemCell(l.itemId), h('span.pinv-grow'), h('b.num', {}, qty(l.qty, uomOf(l.itemId)))))),
      U.sub('الحركات المسجلة'), h('div.pinv-stack', {}, mv.length ? mv.map((m) => h('div.pinv-row', {}, moveChip(m.type), h('span', {}, whName(m.whId)), h('b.num.' + (m.qty < 0 ? 'pinv-neg' : 'pinv-pos'), {}, (m.qty > 0 ? '+' : '') + num(m.qty, 2)), h('span.pinv-muted', {}, 'رصيد ' + num(m.balance, 2)))) : h('p.pinv-muted', {}, '—'))) });
  }
  function renderTransfers(root, ctx) {
    page(ctx, [{ label: 'المخازن' }, { label: 'التحويلات بين المخازن' }]);
    let tab = ctx.params.tab === 'quarantine' ? 'quarantine' : 'log'; if (ctx.params.q) preset('tr', {}, ctx.params.q);
    let off = null; const PATHS = ['transfers', 'stock', 'ncrs', 'stockMoves'];
    const build = () => {
      const list = col('transfers').slice().sort(byDesc('at')); const qrt = col('stock').filter((r) => r.whId === W.QRT && r.qty > 0); const k = keep('tr');
      const tabs = SA.tabs({ tabs: [{ id: 'log', label: 'سجل التحويلات', icon: 'swap', badge: list.length }, { id: 'quarantine', label: 'منطقة الحجر', icon: 'shield', badge: qrt.length || null }], active: tab, onChange: (v) => { tab = v; if (off) off(); off = SA.live(root, build, PATHS); } });
      let body;
      if (tab === 'log') {
        body = SA.table({ caption: 'أذون التحويل',
          columns: [{ key: 'id', label: 'الإذن', sort: true, render: (x) => h('b.num', {}, x.id) }, { key: 'at', label: 'التاريخ', sort: true, render: (x) => h('span.pinv-cell', {}, SA.fmt.dt(x.at), h('small', {}, SA.fmt.rel(x.at))) },
            { key: 'route', label: 'من ← إلى', render: (x) => h('span.pinv-flow', {}, whName(x.fromWh), SA.icon('arrowleft', 'icon-sm'), h('b', {}, whName(x.toWh))) }, { key: 'kind', label: 'النوع', render: (x) => SA.chip(TR_KIND[x.kind] || x.kind, x.kind === 'quarantine' ? 'danger' : x.kind === 'quarantine_release' ? 'success' : 'info') },
            { key: 'lines', label: 'الأصناف', render: (x) => h('span.pinv-cell', {}, x.lines.slice(0, 3).map((l) => h('span', {}, ERP.itemName(l.itemId) + ' × ', h('b.num', {}, num(l.qty)))), x.lines.length > 3 ? h('small', {}, '+' + (x.lines.length - 3) + ' أصناف') : null) },
            { key: 'by', label: 'بواسطة', value: (x) => SA.userName(x.by) }, { key: 'note', label: 'ملاحظة', render: (x) => x.note || '—' }],
          rows: list, onRowClick: (x) => openTransfer(x.id), initial: k.initial, onChange: k.onChange, pageSize: 10,
          search: { placeholder: 'بحث برقم الإذن أو الصنف…', keys: ['id', 'note', (x) => x.lines.map((l) => ERP.itemName(l.itemId) + ' ' + (item(l.itemId) || {}).code).join(' ')] },
          filters: [{ key: 'kind', label: 'النوع', options: Object.keys(TR_KIND).map((x) => [x, TR_KIND[x]]) }, { key: 'wh', label: 'المخزن', options: whList().map((w) => [w.id, w.name]), test: (x, v) => x.fromWh === v || x.toWh === v }],
          empty: { icon: 'swap', title: 'لا توجد تحويلات', action: { label: 'تحويل جديد', perm: 'scm.transfers.create', onClick: () => transferModal() } } }).el;
      } else {
        body = qrt.length ? h('div.table-wrap', {}, h('table.table.pinv-tbl', {}, h('thead', {}, h('tr', {}, ['الصنف', 'الكمية', 'القيمة', 'منذ', 'المصدر', 'عدم المطابقة', 'الإجراء'].map((x) => h('th', {}, x)))),
          h('tbody', {}, qrt.map((r) => { const it = item(r.itemId) || {}; const last = col('stockMoves').find((m) => m.itemId === r.itemId && m.whId === W.QRT && m.qty > 0); const n = col('ncrs').find((x) => x.itemId === r.itemId && x.status !== 'closed');
            return h('tr', {}, h('td', {}, U.itemCell(r.itemId)), h('td.num', {}, h('b', {}, qty(r.qty, it.uom))), h('td.num', {}, U.cost(r.qty * (it.stdCost || 0))), h('td', {}, last ? SA.fmt.rel(last.ts) : '—'), h('td', {}, last ? h('span.pinv-cell', {}, h('span', {}, last.note), refLink(last.ref)) : '—'),
              h('td', {}, n ? h('span.pinv-cell', {}, h('span.pinv-row', {}, link(n.id), U.status('ncr', n.status)), h('small', {}, n.disposition ? 'القرار: ' + n.disposition : 'بانتظار قرار الجودة')) : h('span.pinv-muted', {}, 'لا يوجد')),
              h('td', {}, h('div.pinv-row', {}, SA.btn({ label: 'إفراج', icon: 'unlock', size: 'sm', kind: 'ghost', perm: 'scm.transfers.create', onClick: () => transferModal({ from: W.QRT, to: K.defaultWh(it), itemId: r.itemId, qty: r.qty, kind: 'quarantine_release' }) }),
                n && n.source === 'supplier' ? SA.btn({ label: 'إرجاع للمورد', icon: 'truck', size: 'sm', kind: 'ghost', perm: 'scm.stock.adjust', onClick: () => qrtDispose(r.itemId, 'return') }) : null, SA.btn({ label: 'تخريد', icon: 'trash', size: 'sm', kind: 'ghost', perm: 'scm.stock.adjust', onClick: () => qrtDispose(r.itemId, 'scrap') })))); }))))
          : SA.empty({ icon: 'checkcircle', title: 'منطقة الحجر فارغة', text: 'لا توجد كميات بانتظار قرار الجودة.' });
        body = h('div', {}, h('p.sap-hint', { style: { padding: '12px 16px 0' } }, SA.icon('info', 'icon-sm'), h('span', {}, 'منطقة الحجر (W-06) خارج الرصيد المتاح. الإفراج يحتاج قرار جودة، والإرجاع/التخريد يحتاج صلاحية التسوية وإعادة تحقق.')), body);
      }
      return h('div', {}, SA.pageHead({ title: 'التحويلات بين المخازن', desc: 'نقل عينات لصالة العرض، إعادة توزيع، نقل للحجر والإفراج منه — كل تحويل حركتين في كارت الصنف وسجل تدقيق.',
        actions: [SA.btn({ label: 'إلى صالة العرض', icon: 'star', kind: 'ghost', perm: 'scm.transfers.create', onClick: () => transferModal({ from: W.FG, to: W.SHOW, kind: 'showroom' }) }), SA.btn({ label: 'تحويل جديد', icon: 'swap', perm: 'scm.transfers.create', onClick: () => transferModal() })] }),
        U.kpis([U.kpi({ label: 'تحويلات هذا الشهر', value: num(list.filter((x) => String(x.at).slice(0, 7) === today().slice(0, 7)).length), icon: 'swap' }), U.kpi({ label: 'أصناف في الحجر', value: num(qrt.length), sub: qrt.map((r) => (item(r.itemId) || {}).code).join('، '), icon: 'shield', tone: qrt.length ? 'warning' : 'success' }),
          U.kpi({ label: 'قيمة الحجر', value: canCost() ? fmt.short(K.value(W.QRT)) : U.cost(0), icon: 'coins' }), U.kpi({ label: 'عينات صالة العرض', value: num(sum(col('stock').filter((r) => r.whId === W.SHOW), (r) => r.qty)) + ' قطعة', sub: whName(W.SHOW), icon: 'star' })]),
        h('div', { style: { marginTop: '16px' } }, SA.card({ flush: true }, tabs.el, body)));
    };
    off = SA.live(root, build, PATHS); return () => { if (off) off(); };
  }

  /* ═════════════ 10. stock counts (scm/counts[/CNT-id]) ═════════════ */
  const cntVar = (l) => (l.countedQty == null ? null : r2(l.countedQty - l.systemQty));
  const cntStats = (c) => { const counted = c.lines.filter((l) => l.countedQty != null); const vars = counted.filter((l) => cntVar(l)); return { total: c.lines.length, counted: counted.length, vars, value: sum(vars, (l) => cntVar(l) * ((item(l.itemId) || {}).stdCost || 0)) }; };
  const drafts = {};
  function newCount() {
    if (!SA.can('scm.counts.create')) return noPerm('scm.counts.create');
    const whs = whList().filter((w) => w.id !== W.QRT && w.id !== W.WIP); let wh = W.FG; let scope = 'all'; let blind = true;
    const scopeBox = h('div'); const prev = h('div'); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    const rowsOf = () => col('stock').filter((r) => r.whId === wh).filter((r) => { const it = item(r.itemId) || {}; return scope === 'all' ? true : scope === 'low' ? it.reorderPoint > 0 && K.qty(it.id) <= it.reorderPoint : scope.indexOf('family:') === 0 ? it.family === scope.slice(7) : true; });
    function draw() {
      const fams = Array.from(new Set(col('stock').filter((r) => r.whId === wh).map((r) => (item(r.itemId) || {}).family).filter(Boolean)));
      const opts = [['all', 'كل الأصناف بالمخزن (جرد كامل)']].concat(fams.length > 1 ? fams.map((f) => ['family:' + f, 'جرد دوري — ' + (ERP.families[f] || f)]) : [], [['low', 'الأصناف تحت حد الطلب فقط']]);
      if (!opts.some((o) => o[0] === scope)) scope = 'all';
      SA.clear(scopeBox); scopeBox.appendChild(fld('نطاق الجرد', selectOf(opts, scope, (v) => { scope = v; drawPrev(); }, 'نطاق الجرد'))); drawPrev();
    }
    const drawPrev = () => { SA.clear(prev); const n = rowsOf().length; prev.appendChild(infoBox([['عدد الأصناف', num(n)], ['لقطة الرصيد', 'تُسجّل لحظة البدء'], ['طريقة العد', blind ? 'جرد أعمى (بدون إظهار الرصيد للعدّاد)' : 'العد مع إظهار الرصيد']])); };
    const whSel = selectOf(whs.map((w) => [w.id, w.name]), wh, (v) => { wh = v; draw(); }, 'المخزن');
    const blindIn = h('input', { type: 'checkbox', checked: true, onchange: (e) => { blind = e.target.checked; drawPrev(); } });
    const go = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      const rows = rowsOf(); if (!rows.length) return showErr(err, 'لا توجد أصناف في هذا النطاق.'); let id = null; m.setBusy(true);
      const label = scope === 'all' ? 'جرد كامل — ' + whName(wh) : scope === 'low' ? 'جرد الأصناف تحت حد الطلب — ' + whName(wh) : 'جرد دوري — ' + (ERP.families[scope.slice(7)] || '') + ' — ' + whName(wh);
      try { await SA.api(() => { ensure('counts'); id = ERP.no('CNT'); st.insert('counts', { id, whId: wh, scope: scope === 'all' ? 'full' : 'cycle', scopeLabel: label, status: 'counting', blind, createdAt: ERP.now(), createdBy: me(), lines: rows.map((r) => ({ itemId: r.itemId, systemQty: r.qty, countedQty: null, note: '' })) }, true);
        SA.audit('COUNT.CREATED', { area: 'scm', target: { type: 'count', id, label }, after: { lines: rows.length, blind } }); }); } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(id); SA.toast('بدأت جلسة الجرد ' + id + ' (' + rows.length + ' صنف)', 'success'); SA.nav('scm/counts/' + id);
    } }, SA.icon('list', 'icon-sm'), 'بدء الجرد');
    const m = SA.modal({ title: 'جلسة جرد جديدة', subtitle: 'تُسجّل لقطة من الرصيد الدفتري الآن ثم يُدخل العدّاد الكميات الفعلية', icon: 'list', size: 'md', body: h('div.pinv-stack', {}, fld('المخزن', whSel), scopeBox, h('label.check', {}, blindIn, 'جرد أعمى — إخفاء الرصيد الدفتري عن العدّاد'), prev, err), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), go] });
    draw();
  }
  function renderCountDetail(root, ctx, id) {
    page(ctx, [{ label: 'المخازن' }, { label: 'الجرد', href: '#/scm/counts' }, { label: id }]);
    return SA.live(root, () => {
      const c = col('counts').find((x) => x.id === id); const back = { label: 'جلسات الجرد', href: '#/scm/counts' };
      if (!c) return h('div', {}, SA.pageHead({ title: 'جلسة الجرد ' + id, back }), SA.card({}, SA.empty({ icon: 'search', title: 'جلسة الجرد غير موجودة' })));
      const draft = (drafts[id] = drafts[id] || {}); const editable = c.status === 'counting' && SA.can('scm.counts.create'); const showSys = !c.blind || c.status !== 'counting' || SA.can('scm.counts.approve'); const cc = canCost();
      const val = (l) => (draft[l.itemId] !== undefined && draft[l.itemId] !== '' ? Number(draft[l.itemId]) : l.countedQty);
      const persist = (extra) => st.patch('counts', id, (x) => { x.lines.forEach((l) => { const d = draft[l.itemId]; if (d !== undefined && d !== '' && !isNaN(Number(d))) l.countedQty = Number(d); }); x.updatedAt = ERP.now(); if (extra) Object.assign(x, extra); });
      const save = async () => { try { await SA.api(() => persist()); } catch (e) { return SA.fail(e); } Object.keys(draft).forEach((k2) => delete draft[k2]); SA.toast('تم حفظ العد', 'success'); };
      const demoFill = () => { c.lines.forEach((l, i) => { if (val(l) == null) { const hs = (l.itemId + id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0); draft[l.itemId] = String(hs % 7 === 0 ? Math.max(0, l.systemQty - 1 - (hs % 3)) : l.systemQty); } }); persist(); Object.keys(draft).forEach((k2) => delete draft[k2]); SA.toast('تم ملء الكميات المتبقية (محاكاة عدّاد)', 'info'); };
      const submit = async () => {
        const missing = c.lines.filter((l) => val(l) == null); if (missing.length) return SA.toast('باقي ' + missing.length + ' صنف بدون عد.', 'warn');
        const cf = await SA.confirm({ title: 'إنهاء العد — ' + id, impact: ['تُقفل الكميات وتُرسل الجلسة للمراجعة والترحيل', 'الترحيل يحتاج صلاحية اعتماد الجرد (scm.counts.approve)'], confirmLabel: 'إنهاء وإرسال' }); if (!cf.ok) return;
        try { await SA.api(() => { persist({ status: 'review', submittedAt: ERP.now(), submittedBy: me() }); const s2 = cntStats(col('counts').find((x) => x.id === id)); SA.audit('COUNT.SUBMITTED', { area: 'scm', target: { type: 'count', id, label: c.scopeLabel }, after: { lines: s2.total, variances: s2.vars.length } });
          SA.notify({ title: 'جرد بانتظار الترحيل: ' + id, body: whName(c.whId) + ' — ' + s2.vars.length + ' فرق.', level: 'action', to: ['R-01'], link: '#/scm/counts/' + id }); }); } catch (e) { return SA.fail(e); }
        Object.keys(draft).forEach((k2) => delete draft[k2]); SA.toast('تم إرسال ' + id + ' للمراجعة', 'success');
      };
      const post = async () => {
        if (!SA.can('scm.counts.approve')) return noPerm('scm.counts.approve'); const s = cntStats(c);
        const big = s.vars.filter((l) => l.systemQty && Math.abs(cntVar(l) / l.systemQty) > 0.05);
        const cf = await SA.confirm({ title: 'ترحيل تسويات الجرد ' + id, impact: s.vars.length ? s.vars.slice(0, 8).map((l) => ERP.itemName(l.itemId) + ': ' + (cntVar(l) > 0 ? '+' : '') + num(cntVar(l), 2) + ' ' + (ERP.uom[uomOf(l.itemId)] || '')).concat(['صافي القيمة: ' + (cc ? fmt.money(s.value) : 'سري')]) : ['لا توجد فروق — تُقفل الجلسة بدون تسويات'],
          warnings: (big.length ? ['فروق أكبر من 5% في ' + big.length + ' صنف — راجع قبل الترحيل.'] : []).concat(c.createdBy === me() ? ['أنت من بدأ جلسة الجرد — يُفضّل فصل المهام (مراجع مختلف).'] : []), reasonRequired: true, reasonLabel: 'ملاحظة الاعتماد', confirmLabel: 'ترحيل التسويات' });
        if (!cf.ok) return; if (s.vars.length && !(await SA.stepUp('stock.adjust', { text: 'ترحيل الجرد يعدّل الأرصدة. أدخل كلمة المرور أو كود التحقق.' }))) return;
        try { await SA.api(() => { s.vars.forEach((l) => K.move({ itemId: l.itemId, whId: c.whId, qty: cntVar(l), type: 'adjust', ref: { type: 'count', id }, note: 'تسوية جرد ' + id + (l.note ? ' — ' + l.note : '') }));
          st.patch('counts', id, { status: 'posted', postedAt: ERP.now(), postedBy: me(), postReason: cf.reason });
          SA.audit('COUNT.POSTED', { area: 'scm', target: { type: 'count', id, label: c.scopeLabel }, after: { adjustments: s.vars.length, value: cc ? Math.round(s.value) : '••• (سري)' }, reason: cf.reason }); }); } catch (e) { return SA.fail(e); }
        SA.toast('تم ترحيل ' + s.vars.length + ' تسوية من الجرد ' + id, 'success');
      };
      const reopen = async () => { if (!SA.can('scm.counts.approve')) return noPerm('scm.counts.approve'); try { await SA.api(() => st.patch('counts', id, { status: 'counting' })); } catch (e) { return SA.fail(e); } SA.toast('أُعيدت الجلسة للعد', 'info'); };
      const s = cntStats(c);
      const rows = c.lines.map((l) => { const it = item(l.itemId) || {}; const v0 = cntVar({ countedQty: val(l), systemQty: l.systemQty }); const varCell = h('td.num'); const valCell = h('td.num');
        const setVar = (cq) => { SA.clear(varCell); SA.clear(valCell); const v = cq == null || cq === '' || isNaN(Number(cq)) ? null : r2(Number(cq) - l.systemQty); if (v == null) { varCell.textContent = '—'; valCell.textContent = '—'; return; } varCell.appendChild(showSys ? h('b.' + (v < 0 ? 'pinv-neg' : v > 0 ? 'pinv-pos' : 'pinv-muted'), {}, (v > 0 ? '+' : '') + num(v, 2)) : h('span.pinv-muted', {}, 'بعد المراجعة')); valCell.appendChild(showSys ? U.cost(v * (it.stdCost || 0)) : h('span.pinv-muted', {}, '—')); };
        setVar(val(l));
        const input = editable ? numIn(val(l), { 'aria-label': 'الكمية المعدودة — ' + it.name, oninput: (e) => { draft[l.itemId] = e.target.value; setVar(e.target.value); } }) : h('b.num', {}, val(l) == null ? '—' : num(val(l), 2));
        return h('tr', { class: showSys && v0 ? 'pinv-var' : '' }, h('td', {}, U.itemCell(l.itemId)), h('td.num', {}, showSys ? num(l.systemQty, 2) : h('span.pinv-muted', { title: 'جرد أعمى' }, 'مخفي')), h('td', {}, input), varCell, valCell, h('td', {}, l.note || ''));
      });
      const tbl = h('div.table-wrap', {}, h('table.table.pinv-tbl', {}, h('thead', {}, h('tr', {}, ['الصنف', 'الرصيد الدفتري', 'المعدود', 'الفرق', 'قيمة الفرق', 'ملاحظة'].map((x) => h('th', {}, x)))), h('tbody', {}, rows)));
      const actions = c.status === 'counting' ? [SA.btn({ label: 'تعبئة تجريبية', icon: 'sparkle', kind: 'ghost', perm: 'scm.counts.create', onClick: demoFill }), SA.btn({ label: 'حفظ العد', icon: 'check', kind: 'ghost', perm: 'scm.counts.create', onClick: save }), SA.btn({ label: 'إنهاء العد وإرسال للمراجعة', icon: 'send', perm: 'scm.counts.create', onClick: submit })]
        : c.status === 'review' ? [SA.btn({ label: 'إعادة للعد', icon: 'refresh', kind: 'ghost', perm: 'scm.counts.approve', onClick: reopen }), SA.btn({ label: 'ترحيل التسويات', icon: 'check', perm: 'scm.counts.approve', onClick: post })] : [linkBtn('حركات التسوية', 'scm/moves?type=adjust&wh=' + c.whId, 'activity')];
      return h('div', {}, SA.pageHead({ title: 'جلسة جرد ' + c.id, desc: c.scopeLabel + ' · بدأها ' + SA.userName(c.createdBy) + ' ' + SA.fmt.rel(c.createdAt), tags: [U.status('stcount', c.status), c.blind ? tag('جرد أعمى') : null], back, actions }),
        U.kpis([U.kpi({ label: 'تم عده', value: s.counted + ' / ' + s.total, sub: CH.meter(s.total ? s.counted / s.total : 0, { tone: 'primary' }), icon: 'list' }), U.kpi({ label: 'أصناف بها فروق', value: showSys ? num(s.vars.length) : '—', icon: 'alert', tone: showSys && s.vars.length ? 'warning' : null }),
          U.kpi({ label: 'صافي قيمة الفروق', value: showSys ? U.cost(s.value) : '—', icon: 'coins' }), c.status === 'posted' ? U.kpi({ label: 'رُحّل بواسطة', value: SA.userName(c.postedBy), sub: SA.fmt.dt(c.postedAt) + (c.postReason ? ' — ' + c.postReason : ''), icon: 'checkcircle', tone: 'success' }) : U.kpi({ label: 'المخزن', value: whName(c.whId), icon: 'warehouse' })]),
        !showSys ? SA.alert('info', 'جرد أعمى: الرصيد الدفتري والفروق تظهر للمراجع بعد إنهاء العد.') : null,
        h('div', { style: { marginTop: '16px' } }, SA.card({ title: 'بنود الجرد', flush: true }, tbl)));
    }, ['counts']);
  }
  function renderCounts(root, ctx) {
    const id = ctx.path[0]; if (id) return renderCountDetail(root, ctx, id);
    page(ctx, [{ label: 'المخازن' }, { label: 'الجرد' }]);
    return SA.live(root, () => {
      const list = col('counts').slice().sort(byDesc('createdAt')); const k = keep('counts'); const cc = canCost();
      const t = SA.table({ caption: 'جلسات الجرد',
        columns: [{ key: 'id', label: 'الجلسة', sort: true, render: (c) => h('b.num', {}, c.id) }, { key: 'whId', label: 'المخزن', sort: true, value: (c) => whName(c.whId) }, { key: 'scopeLabel', label: 'النطاق', render: (c) => h('span.pinv-cell', {}, c.scopeLabel, c.blind ? h('small', {}, 'جرد أعمى') : null) },
          { key: 'createdAt', label: 'البدء', sort: true, render: (c) => h('span.pinv-cell', {}, SA.fmt.dt(c.createdAt), h('small', {}, SA.userName(c.createdBy))) },
          { key: 'progress', label: 'التقدم', render: (c) => { const s = cntStats(c); return h('div', { style: { minWidth: '120px' } }, CH.meter(s.total ? s.counted / s.total : 0, { label: s.counted + '/' + s.total, tone: s.counted === s.total ? 'success' : 'primary' })); } },
          { key: 'vars', label: 'الفروق', render: (c) => { const s = cntStats(c); return c.blind && c.status === 'counting' && !SA.can('scm.counts.approve') ? h('span.pinv-muted', {}, 'بعد المراجعة') : h('span.pinv-cell', {}, h('b.num', {}, s.vars.length + ' صنف'), h('small', {}, cc ? fmt.money(s.value) : '')); } },
          { key: 'status', label: 'الحالة', sort: true, render: (c) => U.status('stcount', c.status) }],
        rows: list, onRowClick: (c) => SA.nav('scm/counts/' + c.id), initial: k.initial, onChange: k.onChange, pageSize: 10,
        search: { placeholder: 'بحث برقم الجلسة أو المخزن…', keys: ['id', 'scopeLabel', (c) => whName(c.whId)] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(C.status.stcount).map((x) => [x, C.status.stcount[x][0]]) }, { key: 'whId', label: 'المخزن', options: whList().map((w) => [w.id, w.name]) }],
        empty: { icon: 'list', title: 'لا توجد جلسات جرد', action: { label: 'جلسة جرد جديدة', perm: 'scm.counts.create', onClick: newCount } } });
      const posted = list.filter((c) => c.status === 'posted'); const lastP = posted[0];
      return h('div', {}, SA.pageHead({ title: 'الجرد', desc: 'جلسات جرد كاملة أو دورية بلقطة رصيد، عد أعمى، ثم مراجعة وترحيل الفروق كتسويات (صلاحية منفصلة + إعادة تحقق).', actions: [SA.btn({ label: 'جلسة جرد جديدة', icon: 'plus', perm: 'scm.counts.create', onClick: newCount })] }),
        U.kpis([U.kpi({ label: 'جاري العد', value: num(list.filter((c) => c.status === 'counting').length), icon: 'list', tone: list.some((c) => c.status === 'counting') ? 'warning' : null }), U.kpi({ label: 'بانتظار الترحيل', value: num(list.filter((c) => c.status === 'review').length), icon: 'inbox' }),
          U.kpi({ label: 'آخر جرد مُرحّل', value: lastP ? whName(lastP.whId) : '—', sub: lastP ? SA.fmt.rel(lastP.postedAt) + ' · ' + cntStats(lastP).vars.length + ' فرق' : '', icon: 'checkcircle' }), U.kpi({ label: 'صافي فروق الجرد المُرحّلة', value: cc ? fmt.money(sum(posted, (c) => cntStats(c).value)) : U.cost(0), icon: 'coins' })]),
        h('div', { style: { marginTop: '16px' } }, SA.card({ flush: true }, t.el)));
    }, ['counts']);
  }

  /* ═════════════ registration (ids / routes / groups / perms from erp-core ROUTE CONTRACT) ═════════════ */
  const openPrqN = () => { const n = col('purchaseRequisitions').filter((r) => r.status === 'open').length; return n || null; };
  const pendQcN = () => { const n = col('grns').filter((g) => g.status === 'pending_qc').length; return n || null; };
  [['scm-dashboard', 'scm-dash', 'لوحة الإمداد', 'dashboard', 'scm/dashboard', 'scm.dashboard.view', 1, renderDashboard, 'inventory', null, 'مؤشرات المخزون والمشتريات والتوريد'],
    ['scm-requisitions', 'scm-buy', 'طلبات الشراء الداخلية', 'clipboard', 'scm/requisitions', 'scm.requisitions.view', 10, renderPRQ, 'purchasing', openPrqN, 'طلبات الشراء من MRP وحدود الطلب والصيانة'],
    ['scm-rfq', 'scm-buy', 'طلبات عروض الأسعار', 'compare', 'scm/rfq', 'scm.rfq.view', 11, renderRFQ, 'purchasing', null, 'مقارنة عروض الموردين والترسية'],
    ['scm-po', 'scm-buy', 'أوامر الشراء', 'cart', 'scm/po', 'scm.po.view', 12, renderPO, 'purchasing', null, 'أوامر الشراء والاعتماد والاستلام'],
    ['scm-suppliers', 'scm-buy', 'تقييم الموردين', 'award', 'scm/suppliers', 'scm.suppliers.view', 13, renderSuppliers, 'purchasing', null, 'الالتزام بالمواعيد والجودة والأسعار'],
    ['scm-grn', 'scm-inv', 'استلام البضاعة', 'inbox', 'scm/grn', 'scm.grn.view', 20, renderGRN, 'inventory', pendQcN, 'أذون الاستلام وفحص الجودة'],
    ['scm-stock', 'scm-inv', 'أرصدة المخزون', 'box', 'scm/stock', 'scm.stock.view', 21, renderStock, 'inventory', null, 'الأرصدة وكارت الصنف'],
    ['scm-moves', 'scm-inv', 'حركات المخزون', 'activity', 'scm/moves', 'scm.moves.view', 22, renderMoves, 'inventory', null, 'كل الحركات المخزنية بمستنداتها'],
    ['scm-transfers', 'scm-inv', 'التحويلات بين المخازن', 'swap', 'scm/transfers', 'scm.transfers.view', 23, renderTransfers, 'inventory', null, 'التحويلات ومنطقة الحجر'],
    ['scm-counts', 'scm-inv', 'الجرد', 'list', 'scm/counts', 'scm.counts.view', 24, renderCounts, 'inventory', null, 'جلسات الجرد وترحيل الفروق']
  ].forEach((r) => SA.register({ id: r[0], app: 'scm', group: r[1], title: r[2], icon: r[3], route: r[4], perm: r[5], order: r[6], render: r[7], moduleKey: r[8], badge: r[9] || undefined, desc: r[10] }));

  if (SA.search && SA.search.register) {
    SA.search.register({ id: 'scm-items', label: 'الأصناف والمخزون', perm: 'scm.stock.view', query: (q) => (q ? col('items').filter((i) => (i.name + ' ' + i.code).toLowerCase().indexOf(q) >= 0).slice(0, 6).map((i) => ({ title: i.name, sub: i.code + ' · متاح ' + qty(K.available(i.id), i.uom), icon: 'box', route: 'scm/stock/' + i.id })) : []) });
    SA.search.register({ id: 'scm-po', label: 'أوامر الشراء', perm: 'scm.po.view', query: (q) => (q ? col('purchaseOrders').filter((p) => (p.id + ' ' + supName(p.supplierId)).toLowerCase().indexOf(q) >= 0).slice(0, 5).map((p) => ({ title: 'أمر شراء ' + p.id, sub: supName(p.supplierId) + ' · ' + (C.status.po[p.status] || [p.status])[0], icon: 'cart', route: 'scm/po/' + p.id })) : []) });
  }
  /* public helpers for other modules (e.g. mod-exec/mod-ai) */
  ERP.scm = { scorecard, coverDays, dailyUse, usage, newPRQ, poForm, receiveModal, transferModal, adjustModal, lowItems };
})();
