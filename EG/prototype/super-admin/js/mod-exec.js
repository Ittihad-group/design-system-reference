/* EG ERP prototype — mod-exec.js  (لوحة القيادة التنفيذية + تقارير الإدارة) — app `exec`
   Screens: exec-dashboard  #/exec/dashboard  (exec.dashboard.view, group exec-main) — the owner's command center (first screen after login)
            exec-reports    #/exec/reports[?r=<id>]  (exec.reports.view, group exec-rep) — management report catalog + live preview + CSV (exec.reports.export → EXPORT.REPORT)
   Also exports ERP.metrics (shared live KPIs used by mod-ai.js): every number is computed from the store at render time (nothing hard-coded),
   scoped for sales personas (own/team customers) and cost/profit gated (data.cost.view / data.profit.view). */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP; if (!SA || !ERP) return;
  const h = SA.h, st = SA.store, F = ERP.flow, K = ERP.stock, GL = ERP.gl, fm = ERP.fmt;
  const get = (p) => st.get(p) || [];

  /* ═════════════ styles ═════════════ */
  (function () {
    if (document.querySelector('style[data-mod="exec"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'exec');
    s.textContent = `
.exec-page { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.exec-hero { position: relative; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 22px; align-items: center; padding: 22px 26px; border-radius: 18px; color: #fff; background: radial-gradient(120% 160% at 100% 0%, #0d3779 0%, var(--eg-navy) 42%, var(--eg-navy-deep) 100%); box-shadow: var(--shadow-float); }
.exec-hero::after { content: ""; position: absolute; inset-inline-end: -50px; inset-block-end: -70px; width: 280px; height: 280px; background: url(../../assets/images/logo/mark.png) center / contain no-repeat; opacity: .07; pointer-events: none; }
.exec-hero > * { position: relative; z-index: 1; }
.exec-hero-date { color: #b9c8e6; font-size: 13px; font-weight: 600; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.exec-live { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,.1); border-radius: 999px; padding: 2px 10px; font-size: 12px; color: #dfe8f8; }
.exec-live i { width: 8px; height: 8px; border-radius: 50%; background: #3ddc84; animation: exec-pulse 2s infinite; }
@keyframes exec-pulse { 0% { box-shadow: 0 0 0 0 rgba(61,220,132,.55); } 70% { box-shadow: 0 0 0 8px rgba(61,220,132,0); } 100% { box-shadow: 0 0 0 0 rgba(61,220,132,0); } }
.exec-hero h1 { margin: 6px 0 2px; font-size: 1.85rem; font-weight: 800; color: #fff; line-height: 1.35; }
.exec-brief { display: flex; gap: 10px; align-items: flex-start; margin: 10px 0 0; padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); font-size: 14.5px; line-height: 1.85; max-width: 1000px; color: #f1f5fd; }
.exec-ai-pill { flex: none; display: inline-flex; gap: 4px; align-items: center; font: 700 11px var(--font-en); background: #fff; color: var(--eg-navy); border-radius: 999px; padding: 3px 9px; margin-top: 4px; }
.exec-brief .erp-demo { margin-inline-start: 6px; vertical-align: middle; }
.exec-hero-acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.exec-hero-acts .btn { background: rgba(255,255,255,.1); color: #fff; border: 1px solid rgba(255,255,255,.3); }
.exec-hero-acts .btn:hover { background: rgba(255,255,255,.2); }
.exec-hero-acts .btn.is-solid { background: #fff; color: var(--eg-navy); border-color: #fff; }
.exec-hero-side { display: grid; grid-template-columns: repeat(3, minmax(96px, auto)); gap: 10px; }
.exec-hstat { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); border-radius: 14px; padding: 10px 14px; text-align: center; text-decoration: none; color: #fff; display: flex; flex-direction: column; gap: 2px; }
a.exec-hstat:hover { background: rgba(255,255,255,.16); }
.exec-hstat b { font: 800 1.55rem var(--font-en); line-height: 1.2; }
.exec-hstat small { color: #c7d3ea; font-size: 12px; }
.exec-hstat.is-bad b { color: #ff9ca0; } .exec-hstat.is-warn b { color: #ffd08a; }
@media (max-width: 1050px) { .exec-hero { grid-template-columns: 1fr; } .exec-hero-side { grid-template-columns: repeat(3, 1fr); } }
.exec-sec { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 -6px; flex-wrap: wrap; }
.exec-sec h2 { margin: 0; font-size: var(--text-h3); color: var(--eg-navy-deep); display: flex; align-items: center; gap: 8px; }
.exec-sec small { color: var(--color-text-muted); font-size: 12.5px; }
.exec-lines { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 14px; }
.exec-line { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--color-border); background: #fff; box-shadow: var(--shadow-card); }
.exec-line.is-down { border-color: #f1b9bc; background: linear-gradient(180deg, #fff4f4, #fff 55%); }
.exec-line.is-down::before { content: ""; position: absolute; inset-block: 10px; inset-inline-start: 0; width: 4px; border-radius: 4px; background: var(--color-danger); }
.exec-line-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.exec-line-head b { display: block; font-size: var(--text-dense); line-height: 1.4; }
.exec-line-head small { color: var(--color-text-muted); font: 600 11.5px var(--font-en); }
.exec-line-mid { display: flex; align-items: center; gap: 12px; }
.exec-line-mid .erp-gauge-wrap { flex: none; width: 112px; }
.exec-line { container-type: inline-size; }
@container (max-width: 330px) { .exec-line-mid { flex-direction: column; align-items: stretch; } .exec-line-mid .erp-gauge-wrap { align-self: center; } }
.erp-kpis.exec-kpis { grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); }
@media (max-width: 600px) { .erp-kpis.exec-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .exec-kpis .erp-kpi { padding: 12px; } .exec-kpis .erp-kpi-mid > :not(.erp-kpi-v) { display: none; } .exec-kpis .erp-kpi-v { font-size: 1.25rem; } .exec-kpis .erp-kpi-bot { min-width: 0; } .exec-kpis .erp-kpi-bot small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; } }
.exec-line-wo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; line-height: 1.5; }
.exec-line-wo small { color: var(--color-text-muted); }
.exec-line-alert { font-size: 12.5px; color: var(--color-danger); background: var(--color-danger-tint); border-radius: 8px; padding: 6px 10px; line-height: 1.6; }
.exec-line-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; color: var(--color-text-muted); border-top: 1px dashed var(--color-border); padding-top: 8px; }
.exec-line-foot a { color: var(--eg-navy); font-weight: 700; text-decoration: none; } .exec-line-foot a:hover { text-decoration: underline; }
.exec-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.exec-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 12px; background: #fff; }
.exec-item.is-danger { border-color: #f1b9bc; background: linear-gradient(90deg, #fff, #fff6f6); }
.exec-item-ico { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: none; background: var(--color-primary-tint); color: var(--eg-navy); }
.exec-item-ico.is-danger { background: var(--color-danger-tint); color: var(--color-danger); } .exec-item-ico.is-warning { background: var(--color-warning-tint); color: var(--color-warning); } .exec-item-ico.is-success { background: var(--color-success-tint); color: var(--color-success); }
.exec-item-body { flex: 1; min-width: 0; } .exec-item-body b { display: block; font-size: var(--text-dense); font-weight: 600; line-height: 1.45; } .exec-item-body small { display: block; color: var(--color-text-muted); font-size: 12px; margin-top: 2px; line-height: 1.5; }
.exec-item > .btn, .exec-item > a.btn { flex: none; }
.exec-ins { display: flex; flex-direction: column; gap: 10px; }
.exec-locked { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 8px; min-height: 230px; padding: 20px; border-radius: 12px; background: repeating-linear-gradient(135deg, var(--color-bg-alt), var(--color-bg-alt) 12px, #fff 12px, #fff 24px); color: var(--color-text-muted); font-size: 13.5px; line-height: 1.7; }
.exec-lock-ico { width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center; background: #fff; border: 1px solid var(--color-border); color: var(--eg-navy); }
.exec-locked b { color: var(--color-text); font-size: var(--text-dense); } .exec-locked code { font-size: 12px; background: #fff; border: 1px solid var(--color-border); border-radius: 6px; padding: 1px 8px; }
.exec-mini { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.exec-mini > div { background: var(--color-bg-alt); border-radius: 12px; padding: 10px 12px; }
.exec-mini small { display: block; color: var(--color-text-muted); font-size: 12px; font-weight: 600; } .exec-mini b { display: block; font: 700 1.15rem var(--font-en); margin-top: 2px; color: var(--color-text); }
.exec-mini em { font-style: normal; font-size: 12px; color: var(--color-success); font-weight: 700; } .exec-mini em.is-down { color: var(--color-danger); }
.exec-group-note { display: flex; gap: 10px; align-items: flex-start; color: var(--color-text-muted); font-size: 13.5px; line-height: 1.85; margin: 0; }
.exec-group { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 12px; }
.exec-co { border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 8px; min-height: 160px; border: 1px solid var(--color-border); background: #fff; }
.exec-co.is-active { border-color: var(--eg-navy); box-shadow: 0 0 0 3px var(--eg-navy-tint); }
.exec-co.is-soon { border: 1.5px dashed var(--color-border-strong); background: var(--color-bg-alt); color: var(--color-text-muted); align-items: center; justify-content: center; text-align: center; font-size: 13px; }
.exec-co.is-soon .exec-co-ico { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; background: #fff; border: 1px solid var(--color-border); color: var(--color-text-muted); }
.exec-co-head { display: flex; align-items: center; gap: 10px; } .exec-co-head img { width: 38px; height: 38px; object-fit: contain; } .exec-co-head b { display: block; font-size: var(--text-dense); } .exec-co-head small { color: var(--color-text-muted); font-size: 12px; }
.exec-co-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: var(--color-text-muted); } .exec-co-stats b { display: block; font: 700 14px var(--font-en); color: var(--color-text); }
.exec-rep { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 1000px) { .exec-rep { grid-template-columns: 1fr; } .exec-cat { position: static !important; } }
.exec-cat { display: flex; flex-direction: column; gap: 4px; position: sticky; top: calc(var(--sap-demobar-h) + var(--topbar-h) + 12px); }
.exec-cat h4 { margin: 12px 6px 2px; font-size: 12px; color: var(--color-text-muted); font-weight: 700; }
.exec-cat-btn { display: flex; align-items: center; gap: 10px; text-align: start; width: 100%; padding: 8px 10px; border-radius: 10px; border: 1px solid transparent; background: none; cursor: pointer; font: inherit; font-size: var(--text-dense); color: var(--color-text); min-height: 46px; }
.exec-cat-btn:hover { background: var(--color-bg-alt); }
.exec-cat-btn[aria-current="true"] { background: var(--color-primary-tint); border-color: var(--eg-navy-tint); color: var(--eg-navy); font-weight: 700; }
.exec-cat-ico { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--color-bg-alt); color: var(--eg-navy); flex: none; }
.exec-cat-btn small { display: block; color: var(--color-text-muted); font-weight: 400; font-size: 11.5px; line-height: 1.4; }
.exec-cat-btn .erp-locked { margin-inline-start: auto; }
.exec-prev { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.exec-prev-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
.exec-tbl { width: 100%; }
.exec-tbl th, .exec-tbl td { white-space: nowrap; }
.exec-tbl td.num, .exec-tbl th.num { text-align: end; font-variant-numeric: tabular-nums; }
.exec-tbl tfoot td { font-weight: 700; background: var(--color-bg-alt); }
.exec-tbl a { color: var(--eg-navy); font-weight: 600; text-decoration: none; } .exec-tbl a:hover { text-decoration: underline; }
.exec-note { font-size: 12.5px; color: var(--color-text-muted); display: flex; gap: 6px; align-items: flex-start; line-height: 1.7; margin: 0; }
`;
    document.head.appendChild(s);
  })();

  /* ═════════════ ERP.metrics — live KPIs shared with mod-ai.js ═════════════ */
  const M = (ERP.metrics = ERP.metrics || {});
  M.today = () => ERP.day(0);
  M.curKey = () => ERP.monthKeys(1)[0];
  M.prevKey = () => ERP.monthKeys(2)[0];
  M.addMonths = (key, n) => { const p = String(key).split('-'); const d = new Date(Number(p[0]), Number(p[1]) - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  M.OPEN_SO = ['pending_review', 'pending_approval', 'confirmed', 'in_production', 'ready', 'partially_delivered'];
  M.DONE_SO = ['delivered', 'invoiced', 'closed', 'cancelled', 'rejected'];
  M.CASH = ['1101', '1102', '1111', '1112', '1113'];
  M.FAM = { door: 'الأبواب', clad: 'التجاليد', foam: 'الفوم بورد', acc: 'الإكسسوارات' };
  M.COUNTRY = { OM: 'عُمان', SA: 'السعودية', AE: 'الإمارات', KW: 'الكويت', QA: 'قطر', BH: 'البحرين', LY: 'ليبيا', SD: 'السودان', IQ: 'العراق', JO: 'الأردن' };
  /** sales scope of the current persona: 'all' unless the role has an explicit non-'all' sales scope (rep = own, sales manager = team). */
  M.salesScope = function () { const s = SA.session.snapshot; if (!s || s.sa === '*') return 'all'; const sc = s.scope && s.scope.sales; return sc && sc !== 'all' ? sc : 'all'; };
  M.scoped = () => M.salesScope() !== 'all';
  /** Set of customer ids the persona may see (null = all). */
  M.custSet = function () { if (!M.scoped()) return null; return new Set(SA.scopeFilter('customers', get('customers'), 'salesRepId').map((c) => c.id)); };
  const inScope = (rows, key) => { const s = M.custSet(); return s ? rows.filter((r) => s.has(r[key || 'customerId'])) : rows; };
  M.custOK = (cid) => { const s = M.custSet(); return !s || s.has(cid); };
  M.customers = () => inScope(get('customers'), 'id');
  M.orders = () => (M.scoped() ? SA.scopeFilter('sales', get('salesOrders'), 'repId') : get('salesOrders'));
  M.invoices = () => inScope(get('invoices').filter((i) => i.status !== 'cancelled' && i.status !== 'draft'));
  M.receipts = () => inScope(get('receipts'));
  M.cheques = () => inScope(get('cheques'));
  M.leads = () => (M.scoped() ? SA.scopeFilter('sales', get('leads'), 'ownerId') : get('leads'));
  M.itemMap = () => { const m = {}; get('items').forEach((i) => { m[i.id] = i; }); return m; };
  M.net = (inv) => (inv.net != null ? inv.net : F.totals(inv).net);
  M.sumNet = (rows) => rows.reduce((s, i) => s + M.net(i), 0);
  M.salesBetween = (from, to) => M.sumNet(M.invoices().filter((i) => i.issueDate >= from && i.issueDate <= to));
  M.sameDayPrev = () => { const t = new Date(); const last = new Date(t.getFullYear(), t.getMonth(), 0).getDate(); return M.prevKey() + '-' + String(Math.min(t.getDate(), last)).padStart(2, '0'); };
  M.salesMTD = () => M.salesBetween(M.curKey() + '-01', M.today());
  M.salesPrevMTD = () => M.salesBetween(M.prevKey() + '-01', M.sameDayPrev());
  M.byMonth = (rows, dateKey, valFn, n) => { const keys = ERP.monthKeys(n); const map = {}; keys.forEach((k) => { map[k] = 0; }); rows.forEach((r) => { const k = String(r[dateKey] || '').slice(0, 7); if (k in map) map[k] += valFn(r) || 0; }); return keys.map((k) => ({ key: k, value: Math.round(map[k]) })); };
  M.salesByMonth = (n) => M.byMonth(M.invoices(), 'issueDate', M.net, n || 12);
  M.collectedBetween = (from, to) => M.receipts().filter((r) => r.date >= from && r.date <= to).reduce((s, r) => s + (r.amount || 0), 0);
  M.collectedByMonth = (n) => M.byMonth(M.receipts(), 'date', (r) => r.amount, n || 12);
  M.delta = (a, b) => (b ? (a - b) / b : null);
  /* cash (GL) */
  M.cash = (to) => M.CASH.reduce((s, c) => s + GL.balance(c, null, to), 0);
  M.cashAccounts = () => M.CASH.map((c) => ({ code: c, name: GL.accName(c), balance: GL.balance(c) }));
  M.cashTrend = (n) => ERP.monthKeys(n).map((k) => M.cash(k + '-31'));
  M.cashFlow = function (n) {
    const keys = ERP.monthKeys(n); const map = {}; keys.forEach((k) => { map[k] = { in: 0, out: 0 }; });
    get('journal').forEach((je) => { const m = map[String(je.date).slice(0, 7)]; if (!m) return; je.lines.forEach((l) => { if (M.CASH.indexOf(l.acc) >= 0) { m.in += l.dr || 0; m.out += l.cr || 0; } }); });
    return keys.map((k) => ({ key: k, in: Math.round(map[k].in), out: Math.round(map[k].out) }));
  };
  /* receivables */
  M.outstanding = (i) => Math.max(0, (i.total || 0) - (i.paid || 0));
  M.arOpen = () => M.invoices().map((i) => Object.assign({}, i, { st: F.invoiceStatus(i), due: M.outstanding(i) })).filter((i) => i.due > 0.5 && ['issued', 'partial', 'overdue'].indexOf(i.st) >= 0);
  M.arOverdue = () => M.arOpen().filter((i) => i.st === 'overdue').map((i) => Object.assign(i, { late: ERP.daysBetween(i.dueDate) })).sort((a, b) => b.due - a.due);
  M.overdueByCustomer = function () {
    const by = {}; M.arOverdue().forEach((i) => { const c = by[i.customerId] || (by[i.customerId] = { customerId: i.customerId, amount: 0, count: 0, maxLate: 0 }); c.amount += i.due; c.count++; c.maxLate = Math.max(c.maxLate, i.late); });
    return Object.keys(by).map((k) => Object.assign(by[k], { name: ERP.customerName(k) })).sort((a, b) => b.amount - a.amount);
  };
  M.aging = function () {
    const B = [['current', 'غير مستحقة بعد'], ['b30', '1–30 يوم'], ['b60', '31–60 يوم'], ['b90', '61–90 يوم'], ['b90p', 'أكثر من 90 يوم']]; const by = {};
    M.arOpen().forEach((i) => { const late = ERP.daysBetween(i.dueDate); const b = late <= 0 ? 'current' : late <= 30 ? 'b30' : late <= 60 ? 'b60' : late <= 90 ? 'b90' : 'b90p'; const c = by[i.customerId] || (by[i.customerId] = { customerId: i.customerId, name: ERP.customerName(i.customerId), current: 0, b30: 0, b60: 0, b90: 0, b90p: 0, total: 0 }); c[b] += i.due; c.total += i.due; });
    return { buckets: B, rows: Object.keys(by).map((k) => by[k]).sort((a, b) => b.total - a.total) };
  };
  /* orders */
  M.soNet = (so) => F.totals(so).net;
  M.openOrders = () => M.orders().filter((o) => M.OPEN_SO.indexOf(o.status) >= 0);
  M.lateOrders = () => M.orders().filter((o) => o.promisedDate && o.promisedDate < M.today() && M.DONE_SO.indexOf(o.status) < 0 && o.status !== 'draft').sort((a, b) => (a.promisedDate < b.promisedDate ? -1 : 1));
  M.repOf = (inv) => { const so = inv.soId ? ERP.find('salesOrders', inv.soId) : null; return (so && so.repId) || (ERP.customer(inv.customerId) || {}).salesRepId || null; };
  /* production */
  M.oee = (ln) => (ln && ln.oee ? ln.oee.a * ln.oee.p * ln.oee.q : 0);
  M.plantOEE = () => { const l = get('lines'); return l.length ? l.reduce((s, x) => s + M.oee(x), 0) / l.length : 0; };
  M.running = () => get('lines').filter((l) => l.status === 'running').length;
  M.prodDates = () => Array.from(new Set(get('prodDaily').map((p) => p.date))).sort();
  M.prodDay = (date) => { const rows = get('prodDaily').filter((p) => p.date === date); return { date, rows, good: rows.reduce((s, r) => s + r.good, 0), planned: rows.reduce((s, r) => s + r.planned, 0), scrap: rows.reduce((s, r) => s + r.scrap, 0), down: rows.reduce((s, r) => s + (r.downtimeMin || 0), 0) }; };
  M.prodLast = () => { const d = M.prodDates(); return d.length ? M.prodDay(d[d.length - 1]) : null; };
  M.uom = (ln) => ({ door: 'باب', pcs: 'قطعة', sheet: 'لوح' }[ln && ln.uom] || 'وحدة');
  /* quality */
  M.fpy = function (days) {
    const from = ERP.day(-(days || 60)); const q = get('qcInspections').filter((x) => x.kind === 'final' && x.result && x.result !== 'pending' && String(x.at || x.createdAt || '').slice(0, 10) >= from);
    const tot = q.reduce((s, x) => s + (x.qty || 0), 0); const pass = q.filter((x) => x.result === 'pass').reduce((s, x) => s + (x.qty || 0), 0);
    return { value: tot ? pass / tot : null, count: q.length, units: tot };
  };
  M.openNcrs = () => get('ncrs').filter((n) => n.status !== 'closed');
  /* approvals waiting for me */
  M.myApprovals = function () {
    try { if (SA.approvals && SA.approvals.pendingForMe) return SA.approvals.pendingForMe(); } catch (e) { /* fall back */ }
    const u = SA.session.user; if (!u) return [];
    return get('approvals').filter((a) => a.status === 'pending' && a.requesterId !== u.id && (a.chain || []).some((c) => c.status === 'pending' && c.roleId === u.roleId));
  };
  /* GL aggregation (P&L) — walks the account tree (ERP.gl.balance prefix-matching misses 53xx under group 52) */
  M.glAgg = function (from, to) { const agg = {}; get('journal').forEach((je) => { if ((from && je.date < from) || (to && je.date > to)) return; je.lines.forEach((l) => { const a = agg[l.acc] || (agg[l.acc] = { dr: 0, cr: 0 }); a.dr += l.dr || 0; a.cr += l.cr || 0; }); }); return agg; };
  const parentOf = {}; const under = (code, group) => { let c = code, guard = 0; while (c && guard++ < 6) { if (c === group) return true; if (!(c in parentOf)) { const a = GL.acc(c); parentOf[c] = a ? a.parent : null; } c = parentOf[c]; } return false; };
  M.groupBal = (agg, group) => get('accounts').filter((a) => a.level === 3 && under(a.code, group)).reduce((s, a) => { const x = agg[a.code]; if (!x) return s; const debit = a.type === 'asset' || a.type === 'expense'; return s + (debit ? x.dr - x.cr : x.cr - x.dr); }, 0);
  M.pnl = function (from, to) {
    const g = M.glAgg(from, to); const rev = M.groupBal(g, '4'), cogs = M.groupBal(g, '51'), ind = M.groupBal(g, '52'), opex = M.groupBal(g, '6');
    const gross = rev - cogs, net = gross - ind - opex; return { rev, cogs, ind, opex, gross, net, gm: rev ? gross / rev : 0, nm: rev ? net / rev : 0 };
  };
  /* forecasting: linear trend + damped seasonal index of the same month last year */
  M.fc = function (series, ahead) {
    const n = series.length; if (n < 3) return null; let sx = 0, sy = 0, sxx = 0, sxy = 0;
    series.forEach((y, x) => { sx += x; sy += y; sxx += x * x; sxy += x * y; });
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1); const a = (sy - b * sx) / n; const trend = (x) => a + b * x;
    const idx = series.map((y, x) => { const t = trend(x); return t > 0 ? y / t : 1; });
    const rmse = Math.sqrt(series.reduce((s, y, x) => s + Math.pow(y - trend(x), 2), 0) / n);
    const out = []; for (let k = 1; k <= ahead; k++) { const x = n - 1 + k; const si = x - 12 >= 0 && x - 12 < n ? 1 + 0.6 * (idx[x - 12] - 1) : 1; const v = Math.max(0, trend(x) * si); const band = rmse * (0.7 + 0.2 * k); out.push({ v, lo: Math.max(0, v - band), hi: v + band }); }
    return { a, b, rmse, out, growth: a ? b / (a + b * (n - 1) / 2) : 0 };
  };
  /** monthly sales value (or units) per family for the last n months (current month last, partial). fam null = all */
  M.familyMonthly = function (fam, n, units) {
    const keys = ERP.monthKeys(n); const map = {}; keys.forEach((k) => { map[k] = 0; }); const IM = M.itemMap();
    M.invoices().forEach((inv) => { const k = String(inv.issueDate).slice(0, 7); if (!(k in map)) return; (inv.lines || []).forEach((l) => { const it = IM[l.itemId]; if (fam && (!it || it.family !== fam)) return; map[k] += units ? l.qty : l.qty * l.price * (1 - (inv.discountPct || 0) / 100); }); });
    return keys.map((k) => Math.round(map[k]));
  };
  /** demand forecast: 11 full months history + current month (partial) → current month estimate + 3 months ahead */
  M.demand = function (fam, units) {
    const all = M.familyMonthly(fam, 12, units); const keys = ERP.monthKeys(12); const hist = all.slice(0, 11); const f = M.fc(hist, 4);
    const fKeys = [keys[11], M.addMonths(keys[11], 1), M.addMonths(keys[11], 2), M.addMonths(keys[11], 3)];
    return { keys, hist, cur: all[11], fKeys, f, next: f ? f.out[1] : null };
  };
  M.capacity = function (fam) {
    const lineId = fam === 'door' ? 'L-02' : fam === 'clad' ? 'L-03' : fam === 'foam' ? 'L-04' : null; const ln = ERP.line(lineId); if (!ln) return null;
    const perMonth = ln.capacityPerShift * (ln.shifts || []).length * 26; return { lineId, line: ln, perMonth, effective: Math.round(perMonth * (M.oee(ln) || 0.75)), uom: M.uom(ln), down: ln.status === 'down' };
  };
  /* smart reorder: usage implied by the approved reorder point (ROP = d × (lead + safety)) or by planned work orders, whichever is higher */
  M.SAFETY_DAYS = 7;
  M.reorderPlan = function (all) {
    const need = {}; get('workOrders').filter((w) => w.status === 'planned').forEach((w) => ERP.materialsFor(w.itemId, w.qty).forEach((m) => { need[m.itemId] = (need[m.itemId] || 0) + m.qty; }));
    const prqs = get('purchaseRequisitions').filter((r) => r.status === 'open' || r.status === 'approved');
    return get('items').filter((i) => ['rm', 'pkg', 'acc', 'spare'].indexOf(i.kind) >= 0 && (i.reorderPoint || 0) > 0).map((i) => {
      const avail = K.available(i.id); const lead = i.leadDays || 7; const n = Math.round(need[i.id] || 0); const onOrder = K.onOrder(i.id);
      const d = Math.max(i.reorderPoint / (lead + M.SAFETY_DAYS), n / 14);
      const cover = d > 0 ? Math.max(0, (avail + onOrder - n) / d) : 999; const onHandCover = d > 0 ? Math.max(0, (avail - n) / d) : 999;
      const orderIn = cover - lead - M.SAFETY_DAYS; const gap = Math.max(0, lead - onHandCover);
      const suggest = Math.max(i.moq || 0, Math.ceil(Math.max(0, d * (lead + 30) - (avail + onOrder - n)) / 10) * 10);
      return { itemId: i.id, item: i, avail, onOrder, need: n, rop: i.reorderPoint, daily: d, cover, onHandCover, lead, orderIn, gap, orderBy: ERP.day(Math.max(0, Math.floor(orderIn))), suggest, status: orderIn <= 0 ? 'now' : orderIn <= 14 ? 'soon' : 'ok', openPrq: prqs.find((r) => r.itemId === i.id) || null, supplierId: i.supplierId || null };
    }).filter((x) => all || x.status !== 'ok' || x.avail <= x.rop).sort((a, b) => a.orderIn - b.orderIn);
  };
  M.payRisk = function () {
    const by = {}; const z = (cid) => by[cid] || (by[cid] = { customerId: cid, open: 0, overdue: 0, maxLate: 0, invoices: 0, overdueInv: 0, bounced: 0, bouncedAmt: 0 });
    M.arOpen().forEach((i) => { const c = z(i.customerId); c.open += i.due; c.invoices++; if (i.st === 'overdue') { c.overdue += i.due; c.overdueInv++; c.maxLate = Math.max(c.maxLate, ERP.daysBetween(i.dueDate)); } });
    const from = ERP.day(-180); M.cheques().filter((ch) => ch.status === 'bounced' && String((ch.history || []).slice(-1)[0] ? ch.history.slice(-1)[0].at : ch.dueDate).slice(0, 10) >= from).forEach((ch) => { const c = z(ch.customerId); c.bounced++; c.bouncedAmt += ch.amount || 0; });
    return Object.keys(by).map((k) => { const c = by[k]; const cu = ERP.customer(k) || {}; const lim = cu.creditLimit || 0; const util = lim ? c.open / lim : c.open > 0 ? 1.2 : 0;
      const score = Math.round(Math.min(100, Math.min(40, (c.maxLate / 90) * 40) + Math.min(25, (c.overdue / Math.max(lim, 100000)) * 25) + (c.bounced ? 20 + 5 * (c.bounced - 1) : 0) + (util > 1 ? 15 : util > 0.8 ? 8 : 0)));
      return Object.assign(c, { name: cu.name || k, limit: lim, util, score, level: score >= 55 ? 'high' : score >= 30 ? 'medium' : 'low', repId: cu.salesRepId || null }); })
      .filter((c) => c.score >= 15 || c.overdue > 0).sort((a, b) => b.score - a.score);
  };
  M.machineRisk = function () {
    const today = M.today(); const ago30 = new Date(Date.now() - 30 * 864e5).toISOString();
    return get('machines').map((m) => { const od = m.nextPMAt && m.nextPMAt < today ? ERP.daysBetween(m.nextPMAt) : 0; const brk = get('maintenanceOrders').filter((o) => o.machineId === m.id && o.kind === 'breakdown' && String(o.openedAt) >= ago30).length;
      const score = Math.min(100, (od > 0 ? 25 + Math.min(20, od * 2) : 0) + (m.status === 'down' ? 30 : m.status === 'maintenance' ? 8 : 0) + (m.mtbfH < 350 ? 15 : m.mtbfH < 450 ? 6 : 0) + brk * 10 + (m.criticality === 'A' ? 10 : m.criticality === 'B' ? 4 : 0));
      const openMwo = get('maintenanceOrders').find((o) => o.machineId === m.id && ['done', 'cancelled'].indexOf(o.status) < 0) || null;
      return { machine: m, overdueDays: od, breakdowns: brk, score, openMwo }; }).sort((a, b) => b.score - a.score);
  };
  M.lineName = (id) => { const l = ERP.line(id); return l ? l.name : id || '—'; };

  /* ═════════════ small UI helpers ═════════════ */
  const openable = (route) => { try { const m = SA.router.parse('#/' + route).module; return !!(m && SA.canOpen(m) && SA.appEnabled(m.app)); } catch (e) { return false; } };
  const hrefIf = (route) => (route && openable(route) ? '#/' + route : null);
  M.openable = openable; M.hrefIf = hrefIf;
  const linkBtn = (label, route, kind) => (openable(route) ? h('a.btn.btn-' + (kind || 'ghost') + '.btn-sm', { href: '#/' + route }, label) : null);
  const sec = (title, icon, extra) => h('div.exec-sec', {}, h('h2', {}, icon ? SA.icon(icon) : null, title), extra || null);
  const WEEK = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const shortName = (n) => { const p = String(n || '').trim().split(/\s+/); if (!p[0]) return ''; if (/^(م|أ|د|ا)\.$/.test(p[0]) && p[1]) return p[0] + ' ' + p[1]; return 'أ. ' + p[0]; };
  const durAr = (mins) => { if (mins < 60) return Math.max(1, Math.round(mins)) + ' دقيقة'; const hh = Math.round(mins / 60); if (hh < 24) return hh === 1 ? 'ساعة' : hh === 2 ? 'ساعتين' : hh <= 10 ? hh + ' ساعات' : hh + ' ساعة'; const d = Math.round(hh / 24); return d === 1 ? 'يوم' : d === 2 ? 'يومين' : d <= 10 ? d + ' أيام' : d + ' يومًا'; };
  M.durAr = durAr; M.shortName = shortName;
  function table(cols, rows, o) {
    o = o || {};
    return h('div.table-wrap', {}, h('table.table.exec-tbl', {}, h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.num ? 'num' : null, scope: 'col' }, c.label)))),
      h('tbody', {}, rows.length ? rows.map((r) => h('tr', {}, r.map((v, i) => h('td', { class: cols[i] && cols[i].num ? 'num' : null }, v)))) : h('tr', {}, h('td', { colspan: cols.length }, SA.empty({ icon: 'inbox', title: o.empty || 'لا توجد بيانات' })))),
      o.foot ? h('tfoot', {}, h('tr', {}, o.foot.map((v, i) => h('td', { class: cols[i] && cols[i].num ? 'num' : null }, v)))) : null));
  }

  /* ═════════════ 1. EXEC DASHBOARD ═════════════ */
  const T = SA.catalog.approvalTypes;
  function hero() {
    const u = SA.session.user || {}; const now = new Date(); const hr = now.getHours();
    const greet = hr < 12 ? 'صباح الخير' : 'مساء الخير';
    const brief = ERP.ai && ERP.ai.brief ? ERP.ai.brief() : 'كل المؤشرات محدثة لحظيًا من بيانات النظام.';
    const lines = get('lines'); const down = lines.filter((l) => l.status === 'down').length; const appr = M.myApprovals().length; const oee = M.plantOEE();
    const stat = (v, label, route, tone) => h((hrefIf(route) ? 'a' : 'div') + '.exec-hstat' + (tone ? '.is-' + tone : ''), hrefIf(route) ? { href: hrefIf(route) } : {}, h('b', {}, v), h('small', {}, label));
    return h('section.exec-hero', { 'aria-label': 'ملخص اليوم' },
      h('div', {},
        h('div.exec-hero-date', {}, h('span', {}, WEEK[now.getDay()] + ' ' + SA.fmt.date(now.toISOString())), h('span', {}, '·'), h('span', {}, (st.get('settings.company') || {}).nameAr || 'المصرية الألمانية'), h('span.exec-live', {}, h('i'), 'بيانات حية')),
        h('h1', {}, greet + ' يا ' + shortName(u.name)),
        h('p.exec-brief', {}, h('span.exec-ai-pill', {}, SA.icon('sparkle', 'icon-sm'), 'AI'), h('span', {}, h('b', {}, 'ملخص اليوم: '), brief, ERP.ui.demo('محاكاة'))),
        h('div.exec-hero-acts', {},
          SA.can('exec.ai.use') ? SA.btn({ label: 'اسأل نظامك', icon: 'bot', kind: 'ghost', class: 'is-solid', onClick: () => SA.nav('exec/ai') }) : null,
          SA.can('exec.insights.view') ? SA.btn({ label: 'التنبؤات الذكية', icon: 'sparkle', kind: 'ghost', onClick: () => SA.nav('exec/insights') }) : null,
          openable('approvals') ? SA.btn({ label: 'صندوق الاعتمادات' + (appr ? ' (' + appr + ')' : ''), icon: 'inbox', kind: 'ghost', onClick: () => SA.nav('approvals') }) : null,
          SA.can('exec.reports.view') ? SA.btn({ label: 'تقارير الإدارة', icon: 'chart', kind: 'ghost', onClick: () => SA.nav('exec/reports') }) : null)),
      h('div.exec-hero-side', {}, stat(M.running() + '/' + lines.length, 'خطوط تعمل', 'mfg/lines', down ? 'bad' : null), stat(Math.round(oee * 100) + '%', 'OEE المصنع', 'mfg/dashboard', oee < 0.65 ? 'warn' : null), stat(String(appr), 'تنتظر قرارك', 'approvals', appr ? 'warn' : null)));
  }
  function kpiRow() {
    const sm = M.salesByMonth(12); const mtd = M.salesMTD(), prev = M.salesPrevMTD();
    const cm = M.collectedByMonth(12); const cMtd = M.collectedBetween(M.curKey() + '-01', M.today()), cPrev = M.collectedBetween(M.prevKey() + '-01', M.sameDayPrev());
    const cash = M.cash(), cashPrev = M.cash(M.prevKey() + '-31'); const od = M.arOverdue(); const odSum = od.reduce((s, i) => s + i.due, 0); const odCust = new Set(od.map((i) => i.customerId)).size;
    const oo = M.openOrders(); const late = M.lateOrders().length; const pl = M.prodLast(); const dates = M.prodDates().slice(-15);
    const prodTrend = dates.map((d) => M.prodDay(d).good); const prev7 = prodTrend.slice(-8, -1); const avg7 = prev7.length ? prev7.reduce((a, b) => a + b, 0) / prev7.length : 0;
    const lines = get('lines'); const down = lines.filter((l) => l.status === 'down'); const fpy = M.fpy(60); const canCost = ERP.ui.canCost();
    const el = ERP.ui.kpis([
      ERP.ui.kpi({ label: 'المبيعات منذ بداية الشهر', value: fm.short(mtd), icon: 'cart', trend: sm.slice(0, 11).map((x) => x.value), delta: M.delta(mtd, prev), sub: 'مقابل نفس الفترة من ' + ERP.monthLabel(M.prevKey()).split(' ')[0], href: hrefIf('crm/reports') || hrefIf('fin/invoices') }),
      ERP.ui.kpi({ label: 'التحصيلات منذ بداية الشهر', value: fm.short(cMtd), icon: 'receipt', trend: cm.slice(0, 11).map((x) => x.value), delta: M.delta(cMtd, cPrev), sub: 'سندات القبض', href: hrefIf('fin/receipts') }),
      ERP.ui.kpi({ label: 'السيولة (بنوك + خزائن)', value: fm.short(cash), icon: 'coins', trend: M.cashTrend(6), delta: M.delta(cash, cashPrev), sub: 'مقابل نهاية الشهر الماضي', href: hrefIf('fin/banks') }),
      ERP.ui.kpi({ label: 'متأخرات العملاء', value: fm.short(odSum), icon: 'alert', tone: odSum > 0 ? 'danger' : null, sub: od.length + ' فاتورة · ' + odCust + ' عميل', href: hrefIf('fin/aging') }),
      ERP.ui.kpi({ label: 'الطلبات المفتوحة', value: fm.short(oo.reduce((s, o) => s + M.soNet(o), 0)), icon: 'clipboard', tone: late ? 'warning' : null, sub: oo.length + ' طلب' + (late ? ' · ' + late + ' متأخر عن موعده' : ''), href: hrefIf('crm/orders') }),
      ERP.ui.kpi({ label: 'إنتاج آخر يوم', value: pl ? fm.num(pl.good) : '—', icon: 'factory', trend: prodTrend.length > 1 ? prodTrend : null, delta: pl && avg7 ? M.delta(pl.good, avg7) : null, sub: pl ? 'وحدة · ' + fm.date(pl.date) + ' · OEE ' + Math.round(M.plantOEE() * 100) + '%' : '', href: hrefIf('mfg/dashboard') }),
      ERP.ui.kpi({ label: 'خطوط الإنتاج العاملة', value: M.running() + ' / ' + lines.length, icon: 'activity', tone: down.length ? 'danger' : 'success', sub: down.length ? down.map((l) => l.id + ' متوقف ' + (l.downSince ? 'منذ ' + durAr((Date.now() - new Date(l.downSince).getTime()) / 60000) : '')).join(' · ') : 'كل الخطوط تعمل', href: hrefIf('mfg/lines') }),
      ERP.ui.kpi({ label: 'قيمة المخزون (بالتكلفة)', value: canCost ? fm.short(K.value()) : h('span.erp-locked', { title: 'تحتاج صلاحية data.cost.view' }, SA.icon('lock', 'icon-sm'), 'سري'), icon: 'warehouse', sub: canCost ? 'كل المخازن · تكلفة معيارية' : 'التكاليف لمن يملك الصلاحية فقط', href: hrefIf('scm/stock') }),
      ERP.ui.kpi({ label: 'جودة من أول مرة (FPY)', value: fpy.value == null ? '—' : fm.pct(fpy.value, 1), icon: 'checkcircle', tone: fpy.value != null && fpy.value < 0.95 ? 'warning' : null, sub: 'آخر 60 يوم · NCR مفتوحة: ' + M.openNcrs().length, href: hrefIf('mfg/quality') })
    ]); el.classList.add('exec-kpis'); return el;
  }
  function lineCard(ln) {
    const wo = ln.currentWoId ? ERP.find('workOrders', ln.currentWoId) : null; const isDown = ln.status === 'down'; const oee = M.oee(ln);
    const prog = wo && wo.qty ? Math.min(1, (wo.qtyDone || 0) / wo.qty) : 0; const mins = ln.downSince ? (Date.now() - new Date(ln.downSince).getTime()) / 60000 : 0;
    const mwo = isDown ? get('maintenanceOrders').find((m) => m.lineId === ln.id && m.kind === 'breakdown' && ['done', 'cancelled'].indexOf(m.status) < 0) : null;
    const so = wo && wo.soId ? ERP.find('salesOrders', wo.soId) : null;
    return h('div.exec-line' + (isDown ? '.is-down' : ''),
      h('div.exec-line-head', {}, h('div', {}, h('b', {}, ln.name), h('small', {}, ln.id + ' · ' + (ln.code || '') + ' · ' + (ln.shifts || []).length + ' ورديات')), ERP.ui.status('line', ln.status)),
      h('div.exec-line-mid', {}, ERP.chart.gauge(oee, { label: 'OEE', size: 112 }),
        h('div.exec-line-wo', {}, wo ? [h('span', {}, 'أمر التشغيل: ', ERP.ui.docLink(wo.id)), h('small', {}, ERP.itemName(wo.itemId)), ERP.chart.meter(prog, { label: 'التقدم', text: fm.num(wo.qtyDone || 0) + ' / ' + fm.num(wo.qty), tone: wo.status === 'on_hold' ? 'danger' : prog >= 0.85 ? 'success' : 'primary' }), so ? h('small', {}, 'لطلب ', ERP.ui.docLink(so.id), so.export ? ' — تصدير' : '') : null] : [h('span', {}, 'لا يوجد أمر تشغيل حالي'), h('small', {}, 'الطاقة: ' + fm.num(ln.capacityPerShift) + ' ' + M.uom(ln) + '/وردية')])),
      isDown ? h('div.exec-line-alert', { role: 'alert' }, SA.icon('alert', 'icon-sm'), ' متوقف منذ ' + durAr(mins) + (ln.downReason ? ' — ' + ln.downReason : ''), mwo ? [' · ', ERP.ui.docLink(mwo.id), ' ', ERP.ui.status('mwo', mwo.status)] : null) : null,
      h('div.exec-line-foot', {}, h('span.num', {}, 'A ' + Math.round((ln.oee || {}).a * 100) + '% · P ' + Math.round((ln.oee || {}).p * 100) + '% · Q ' + Math.round((ln.oee || {}).q * 100) + '%'), openable('mfg/lines/' + ln.id) ? h('a', { href: '#/mfg/lines/' + ln.id }, 'تفاصيل الخط') : null));
  }
  function decisions() {
    const out = []; const today = M.today(); const seen = new Set();
    get('lines').filter((l) => l.status === 'down').forEach((l) => {
      seen.add('#/mfg/lines/' + l.id); get('maintenanceOrders').filter((m) => m.lineId === l.id && ['done', 'cancelled'].indexOf(m.status) < 0).forEach((m) => seen.add('#/care/maintenance/' + m.id));
      out.push({ tone: 'danger', icon: 'factory', title: l.name + ' متوقف — يحتاج متابعة فورية', sub: (l.downReason || '') + (l.downSince ? ' · منذ ' + durAr((Date.now() - new Date(l.downSince).getTime()) / 60000) : ''), route: 'mfg/lines/' + l.id, cta: 'التفاصيل' });
    });
    M.myApprovals().slice(0, 6).forEach((a) => { seen.add('#/approvals/' + a.id); out.push({ tone: 'action', icon: (T[a.type] || {}).icon || 'inbox', title: a.title, sub: ((T[a.type] || {}).label || 'طلب اعتماد') + (a.amount != null ? ' · ' + fm.money(a.amount) : '') + ' · ' + SA.fmt.rel(a.createdAt), route: 'approvals/' + a.id, cta: 'اتخذ القرار', kind: 'primary' }); });
    /* scrap (mod-scrap.js): a production stage above its allowed scrap several days in a row → one decision item (replaces the matching urgent notification) */
    try { const S = ERP.scrap; if (S && S.analysis && openable('mfg/scrap')) { const a = S.analysis(30); const s = a.stages.filter((x) => x.streak >= 3).sort((x, y) => y.streak - x.streak)[0];
      if (s) { const m = a.machines.filter((x) => x.stageId === s.stageId).sort((x, y) => y.kg - x.kg)[0]; seen.add('#/mfg/scrap');
        out.push({ tone: 'warning', icon: 'recycle', title: 'هالك ' + s.name + ' أعلى من المسموح ' + s.streak + ' أيام متتالية' + (m ? ' — ' + m.id : ''), sub: 'آخر 7 أيام ' + Math.round((s.ratio7 || 0) * 100) + '% من المسموح · زيادة ≈ ' + fm.num(Math.round(s.excessStreak)) + ' كجم' + (ERP.ui.canCost() ? ' (≈ ' + fm.short(s.excessStreak * ERP.factory.compoundCostKg()) + ')' : '') + (a.pending.length ? ' · ' + a.pending.length + ' بيع هوالك بانتظار الاعتماد' : ''), route: 'mfg/scrap?stage=' + s.stageId, cta: 'الهوالك' }); } } } catch (e) { console.error('[exec] scrap item', e); }
    (SA.notifications ? SA.notifications.forMe() : []).filter((n) => n.level === 'urgent' && !SA.notifications.isRead(n) && !seen.has(n.link)).slice(0, 2).forEach((n) => out.push({ tone: 'danger', icon: 'bell', title: n.title, sub: n.body + ' · ' + SA.fmt.rel(n.ts), route: String(n.link || '').replace(/^#\//, ''), cta: 'فتح' }));
    M.lateOrders().slice(0, 3).forEach((o) => out.push({ tone: 'warning', icon: 'clock', title: 'طلب متأخر عن موعد التسليم: ' + o.id + ' — ' + ERP.customerName(o.customerId), sub: 'الموعد ' + fm.date(o.promisedDate) + ' (متأخر ' + ERP.daysBetween(o.promisedDate, today) + ' يوم) · ' + ((SA.catalog.status.so[o.status] || [])[0] || o.status), route: ERP.route(o.id), cta: 'الطلب' }));
    M.arOverdue().filter((i) => i.due >= 100000).slice(0, 3).forEach((i) => out.push({ tone: 'warning', icon: 'coins', title: 'فاتورة متأخرة السداد: ' + i.id + ' — ' + ERP.customerName(i.customerId), sub: 'المتبقي ' + fm.money(i.due) + ' · متأخرة ' + i.late + ' يوم', route: ERP.route(i.id), cta: 'الفاتورة' }));
    return out;
  }
  function decisionsCard() {
    const items = decisions();
    const list = items.length ? h('ul.exec-list', {}, items.map((it) => { const can = openable(it.route);
      return h('li.exec-item' + (it.tone === 'danger' ? '.is-danger' : ''), {}, h('span.exec-item-ico.is-' + (it.tone === 'action' ? 'info' : it.tone), {}, SA.icon(it.icon, 'icon-sm')), h('div.exec-item-body', {}, h('b', {}, it.title), h('small', {}, it.sub)),
        can ? h('a.btn.btn-' + (it.kind || 'ghost') + '.btn-sm', { href: '#/' + it.route }, it.cta) : null); })) : SA.empty({ icon: 'checkcircle', title: 'لا شيء ينتظر قرارك الآن', text: 'كل الاعتمادات والتنبيهات العاجلة تمت معالجتها.' });
    return SA.card({ title: 'يحتاج قرارك الآن', tags: items.length ? SA.chip(items.length + ' بند', items.some((i) => i.tone === 'danger') ? 'danger' : 'warning') : null, actions: [linkBtn('كل الاعتمادات', 'approvals')] }, list);
  }
  function insightsCard() {
    const list = ERP.ui.insights('exec', 4);
    return SA.card({ title: 'توصيات المساعد الذكي', tags: ERP.ui.demo('محاكاة AI'), actions: [linkBtn('كل التنبؤات', 'exec/insights')] }, list.length ? h('div.exec-ins', {}, list) : SA.empty({ icon: 'sparkle', title: 'لا توجد توصيات حاليًا', text: 'المساعد بيراجع البيانات باستمرار وهيظهر هنا أي خطر أو فرصة.' }));
  }
  function salesTrendCard() {
    const sm = M.salesByMonth(12); const n = sm.length; const labels = sm.map((x) => ERP.monthLabel(x.key));
    return SA.card({ title: 'المبيعات الشهرية — آخر 12 شهر', tags: h('small.t-muted', {}, 'صافي بدون ضريبة') },
      ERP.chart.columns({ labels, stacked: true, legend: true, height: 230, series: [{ name: 'شهور مكتملة', values: sm.map((x, i) => (i < n - 1 ? x.value : 0)), color: ERP.palette[0] }, { name: 'الشهر الحالي (حتى اليوم)', values: sm.map((x, i) => (i === n - 1 ? x.value : 0)), color: ERP.palette[3] }] }));
  }
  function mixCard() {
    const from = ERP.day(-90); const by = {}; const IM = M.itemMap();
    M.invoices().filter((i) => i.issueDate >= from).forEach((inv) => (inv.lines || []).forEach((l) => { const f = (IM[l.itemId] || {}).family || 'acc'; by[f] = (by[f] || 0) + l.qty * l.price * (1 - (inv.discountPct || 0) / 100); }));
    const data = ['door', 'clad', 'foam', 'acc'].filter((f) => by[f] > 0).map((f, i) => ({ label: M.FAM[f], value: Math.round(by[f]), color: ERP.palette[i] }));
    const tot = data.reduce((s, d) => s + d.value, 0);
    return SA.card({ title: 'مزيج المبيعات حسب العائلة', tags: h('small.t-muted', {}, 'آخر 90 يوم') }, data.length ? ERP.chart.donut(data, { center: fm.short(tot).replace(' ج.م', ''), sub: 'ج.م', fmt: fm.short }) : SA.empty({ title: 'لا توجد مبيعات في الفترة' }));
  }
  function topCustCard() {
    const from = ERP.day(-365); const by = {}; M.invoices().filter((i) => i.issueDate >= from).forEach((i) => { by[i.customerId] = (by[i.customerId] || 0) + M.net(i); });
    const data = Object.keys(by).map((k) => ({ id: k, value: Math.round(by[k]) })).sort((a, b) => b.value - a.value).slice(0, 5).map((x) => { const c = ERP.customer(x.id) || {}; return { label: c.name || x.id, sub: [c.region, c.segment === 'export' ? 'تصدير' : c.segment === 'dealer' ? 'تاجر' : c.segment === 'contractor' ? 'مقاول' : c.segment === 'project' ? 'مشروع' : ''].filter(Boolean).join(' · '), value: x.value, href: hrefIf('crm/customers/' + x.id) }; });
    return SA.card({ title: 'أكبر 5 عملاء', tags: h('small.t-muted', {}, 'آخر 12 شهر — صافي المبيعات') }, data.length ? ERP.chart.bars(data, { fmt: fm.short }) : SA.empty({ title: 'لا توجد بيانات' }));
  }
  function prodCard() {
    const dates = M.prodDates().slice(-14); const lines = get('lines');
    const series = lines.map((ln, i) => ({ name: ln.id + ' ' + (ln.family === 'door' ? (ln.id === 'L-01' ? 'بثق أبواب' : 'تجميع أبواب') : ln.family === 'clad' ? 'تجاليد' : 'فوم بورد'), values: dates.map((d) => { const r = get('prodDaily').find((p) => p.date === d && p.lineId === ln.id); return r ? r.good : 0; }), color: ERP.palette[i] }));
    return SA.card({ title: 'الإنتاج اليومي حسب الخط — آخر 14 يوم', tags: h('small.t-muted', {}, 'وحدات جيدة (باب/قطعة/لوح)') }, dates.length ? ERP.chart.columns({ labels: dates.map((d) => d.slice(8, 10) + '/' + d.slice(5, 7)), series, stacked: true, height: 230, fmt: (v) => fm.num(Math.round(v)) }) : SA.empty({ title: 'لا توجد بيانات إنتاج' }));
  }
  function cashCard() {
    const cf = M.cashFlow(6);
    return SA.card({ title: 'التدفق النقدي — مقبوضات مقابل مدفوعات', tags: h('small.t-muted', {}, 'آخر 6 شهور · حركة البنوك والخزائن') },
      ERP.chart.line({ labels: cf.map((x) => ERP.monthLabel(x.key)), height: 220, series: [{ name: 'مقبوضات', values: cf.map((x) => x.in), color: 'var(--color-success)' }, { name: 'مدفوعات', values: cf.map((x) => x.out), color: 'var(--color-danger)' }] }));
  }
  function profitCard() {
    if (!ERP.ui.canProfit()) return SA.card({ title: 'لقطة الأرباح' }, h('div.exec-locked', {}, h('span.exec-lock-ico', {}, SA.icon('lock')), h('b', {}, 'بيانات الأرباح والهوامش سرية'), h('span', {}, 'تظهر فقط لمن يملك صلاحية الأرباح (المالك · المدير العام · المدير المالي).'), h('code', {}, 'data.profit.view')));
    const y = new Date().getFullYear(); const p = M.pnl(y + '-01-01', M.today()); const keys = ERP.monthKeys(6); const mon = keys.map((k) => M.pnl(k + '-01', k + '-31'));
    const lastFull = mon[mon.length - 2] || mon[0];
    return SA.card({ title: 'لقطة الأرباح — منذ بداية ' + y, tags: ERP.ui.demo('أرقام تجريبية'), actions: [linkBtn('القوائم المالية', 'fin/statements')] },
      h('div.exec-mini', {},
        h('div', {}, h('small', {}, 'الإيرادات'), h('b', {}, fm.short(p.rev))),
        h('div', {}, h('small', {}, 'مجمل الربح'), h('b', {}, fm.short(p.gross)), h('em', {}, 'هامش ' + fm.pct(p.gm, 1))),
        h('div', {}, h('small', {}, 'صافي الربح'), h('b', {}, fm.short(p.net)), h('em' + (p.net < 0 ? '.is-down' : ''), {}, 'هامش ' + fm.pct(p.nm, 1))),
        h('div', {}, h('small', {}, 'هامش ' + ERP.monthLabel(keys[keys.length - 2]).split(' ')[0]), h('b', {}, fm.pct(lastFull.gm, 1)), h('em', {}, 'مجمل'))),
      ERP.chart.columns({ labels: keys.map((k) => ERP.monthLabel(k)), height: 190, series: [{ name: 'مجمل الربح', values: mon.map((x) => Math.max(0, Math.round(x.gross))), color: ERP.palette[0] }, { name: 'صافي الربح', values: mon.map((x) => Math.max(0, Math.round(x.net))), color: ERP.palette[4] }] }),
      h('p.exec-note', {}, SA.icon('info', 'icon-sm'), 'محسوبة لحظيًا من القيود اليومية (الإيرادات − تكلفة المبيعات − التكاليف غير المباشرة − المصروفات). الشهر الحالي جزئي.'));
  }
  function groupCard() {
    const lines = get('lines'); const od = M.arOverdue().reduce((s, i) => s + i.due, 0);
    const soon = (n) => h('div.exec-co.is-soon', {}, h('span.exec-co-ico', {}, SA.icon('building')), h('b', {}, 'شركة شقيقة'), h('span', {}, 'قريبًا — المرحلة القادمة'), SA.chip('غير مربوطة بعد', 'neutral'));
    return SA.card({ title: 'مجموعة الاتحاد — لوحة موحدة للشركات الأربع', tags: SA.tag('pending', 'المرحلة القادمة') },
      h('p.exec-group-note', {}, SA.icon('layers', 'icon-sm'), h('span', {}, 'المنصة مبنية من البداية بحيث تنضم باقي شركات المجموعة على نفس النظام لاحقًا، وصاحب المجموعة يشوف كل الشركات في لوحة واحدة: المبيعات، الإنتاج، السيولة والاعتمادات — مع فصل كامل لبيانات وصلاحيات كل شركة.')),
      h('div.exec-group', {},
        h('div.exec-co.is-active', {}, h('div.exec-co-head', {}, h('img', { src: '../../assets/images/logo/mark.png', alt: '' }), h('div', {}, h('b', {}, 'المصرية الألمانية'), h('small', {}, 'WPC & PVC — جمصة'))), SA.chip('نشطة الآن على النظام', 'success'),
          h('div.exec-co-stats', {}, h('span', {}, 'مبيعات الشهر', h('b', {}, fm.short(M.salesMTD()))), h('span', {}, 'الخطوط العاملة', h('b', {}, M.running() + '/' + lines.length)), h('span', {}, 'السيولة', h('b', {}, fm.short(M.cash()))), h('span', {}, 'متأخرات', h('b', {}, fm.short(od))))),
        soon(1), soon(2), soon(3)));
  }
  function buildDashboard() {
    return h('div.exec-page', {},
      hero(),
      kpiRow(),
      ERP.ui.grid(2, decisionsCard(), insightsCard()),
      sec('حالة المصنع الآن', 'factory', h('small', {}, 'OEE = الإتاحة × الأداء × الجودة — من بيانات الخطوط')),
      h('div.exec-lines', {}, get('lines').map(lineCard)),
      ERP.ui.grid(2, salesTrendCard(), mixCard()),
      ERP.ui.grid(2, prodCard(), cashCard()),
      ERP.ui.grid(2, topCustCard(), profitCard()),
      groupCard());
  }
  SA.register({
    id: 'exec-dashboard', app: 'exec', group: 'exec-main', title: 'لوحة القيادة', icon: 'gauge', route: 'exec/dashboard', perm: 'exec.dashboard.view', order: 1,
    desc: 'مركز قيادة صاحب الشركة: المبيعات والتحصيل والسيولة والمصنع والاعتمادات في شاشة واحدة',
    render(root, ctx) {
      ctx.setCrumbs([{ label: 'لوحة القيادة' }]);
      return SA.live(root, () => { try { return buildDashboard(); } catch (e) { console.error('[exec-dashboard]', e); return SA.errorState({ onRetry: () => SA.router.refresh() }); } },
        ['salesOrders', 'invoices', 'receipts', 'journal', 'lines', 'workOrders', 'approvals', 'notifications', 'prodDaily', 'qcInspections', 'ncrs', 'stock', 'maintenanceOrders', 'cheques', 'machines', 'purchaseRequisitions', 'shipments', 'bills', 'vouchers', 'leads', 'events', 'tickets']);
    }
  });

  /* ═════════════ 2. EXEC REPORTS ═════════════ */
  const PERIODS = [['30', '30 يوم'], ['90', '90 يوم'], ['365', '12 شهر'], ['ytd', 'منذ بداية السنة']];
  const periodFrom = (p) => (p === 'ytd' ? new Date().getFullYear() + '-01-01' : ERP.day(-Number(p || 90)));
  const periodLabel = (p) => (PERIODS.find((x) => x[0] === p) || PERIODS[1])[1];
  const segLabel = { dealer: 'تاجر', contractor: 'مقاول', direct: 'مباشر', export: 'تصدير', project: 'مشروع' };
  /* col: {label, fmt:'money'|'short'|'num'|'pct'|'date'|'text', sens, num} ; row: {cells:[], route?} */
  function fmtCell(v, c) {
    if (c.sens && !SA.canSensitive(c.sens)) return h('span.erp-locked', { title: 'تحتاج صلاحية ' + c.sens }, SA.icon('lock', 'icon-sm'), 'سري');
    if (v == null || v === '') return '—';
    switch (c.fmt) { case 'money': return fm.money(v); case 'short': return fm.short(v); case 'num': return fm.num(v); case 'pct': return fm.pct(v, 1); case 'date': return fm.date(v); default: return String(v); }
  }
  const csvCell = (v, c) => (c.sens && !SA.canSensitive(c.sens) ? 'سري' : v == null ? '' : c.fmt === 'pct' ? (Number(v) * 100).toFixed(1) + '%' : c.fmt === 'date' ? v : typeof v === 'number' ? Math.round(v * 100) / 100 : String(v));
  const REPORTS = [
    { id: 'sales-month', group: 'المبيعات', icon: 'chart', title: 'المبيعات الشهرية', desc: 'صافي المبيعات والضريبة والتحصيل — 12 شهر',
      build() { const sm = M.salesByMonth(12); const cm = M.collectedByMonth(12); const inv = M.invoices();
        const rows = sm.map((x, i) => { const list = inv.filter((v) => String(v.issueDate).slice(0, 7) === x.key); return { cells: [ERP.monthLabel(x.key), list.length, x.value, list.reduce((s, v) => s + (v.tax || 0), 0), list.reduce((s, v) => s + (v.total || 0), 0), cm[i].value] }; });
        return { chart: ERP.chart.columns({ labels: sm.map((x) => ERP.monthLabel(x.key)), height: 220, series: [{ name: 'صافي المبيعات', values: sm.map((x) => x.value) }, { name: 'التحصيل', values: cm.map((x) => x.value), color: ERP.palette[4] }] }),
          cols: [{ label: 'الشهر' }, { label: 'عدد الفواتير', fmt: 'num', num: true }, { label: 'صافي المبيعات', fmt: 'money', num: true }, { label: 'الضريبة (تجريبي 14%)', fmt: 'money', num: true }, { label: 'الإجمالي', fmt: 'money', num: true }, { label: 'التحصيل', fmt: 'money', num: true }], rows,
          total: ['الإجمالي', rows.reduce((s, r) => s + r.cells[1], 0), rows.reduce((s, r) => s + r.cells[2], 0), rows.reduce((s, r) => s + r.cells[3], 0), rows.reduce((s, r) => s + r.cells[4], 0), rows.reduce((s, r) => s + r.cells[5], 0)], note: 'الشهر الحالي جزئي حتى اليوم. الضريبة قيمة تجريبية (بند 38 Open).' }; } },
    { id: 'sales-family', group: 'المبيعات', icon: 'pie', title: 'المبيعات حسب عائلة المنتج', desc: 'أبواب · تجاليد · فوم بورد · إكسسوارات', period: true,
      build(p) { const from = periodFrom(p); const by = {}; const IM = M.itemMap(); M.invoices().filter((i) => i.issueDate >= from).forEach((inv) => (inv.lines || []).forEach((l) => { const f = (IM[l.itemId] || {}).family || 'acc'; const b = by[f] || (by[f] = { qty: 0, value: 0, lines: 0 }); b.qty += l.qty; b.value += l.qty * l.price * (1 - (inv.discountPct || 0) / 100); b.lines++; }));
        const tot = Object.keys(by).reduce((s, k) => s + by[k].value, 0); const fams = ['door', 'clad', 'foam', 'acc'].filter((f) => by[f]);
        return { chart: ERP.chart.donut(fams.map((f, i) => ({ label: M.FAM[f], value: Math.round(by[f].value), color: ERP.palette[i] })), { center: fm.short(tot).replace(' ج.م', ''), sub: 'ج.م', fmt: fm.short }),
          cols: [{ label: 'العائلة' }, { label: 'الكمية المباعة', fmt: 'num', num: true }, { label: 'بنود الفواتير', fmt: 'num', num: true }, { label: 'صافي المبيعات', fmt: 'money', num: true }, { label: 'النسبة', fmt: 'pct', num: true }],
          rows: fams.map((f) => ({ cells: [M.FAM[f], Math.round(by[f].qty), by[f].lines, Math.round(by[f].value), tot ? by[f].value / tot : 0] })), total: ['الإجمالي', null, null, Math.round(tot), 1] }; } },
    { id: 'sales-customer', group: 'المبيعات', icon: 'users', title: 'المبيعات حسب العميل', desc: 'ترتيب العملاء وحصة كل عميل', period: true,
      build(p) { const from = periodFrom(p); const by = {}; M.invoices().filter((i) => i.issueDate >= from).forEach((i) => { const b = by[i.customerId] || (by[i.customerId] = { n: 0, v: 0 }); b.n++; b.v += M.net(i); });
        const tot = Object.keys(by).reduce((s, k) => s + by[k].v, 0); const rows = Object.keys(by).sort((a, b) => by[b].v - by[a].v).map((k) => { const c = ERP.customer(k) || {}; return { route: 'crm/customers/' + k, cells: [c.name || k, segLabel[c.segment] || '—', c.region || '—', SA.userName(c.salesRepId), by[k].n, Math.round(by[k].v), tot ? by[k].v / tot : 0] }; });
        return { chart: ERP.chart.bars(rows.slice(0, 8).map((r) => ({ label: r.cells[0], value: r.cells[5] })), { fmt: fm.short }), cols: [{ label: 'العميل' }, { label: 'الشريحة' }, { label: 'المنطقة' }, { label: 'المندوب' }, { label: 'الفواتير', fmt: 'num', num: true }, { label: 'صافي المبيعات', fmt: 'money', num: true }, { label: 'الحصة', fmt: 'pct', num: true }], rows, total: ['الإجمالي', '', '', '', rows.reduce((s, r) => s + r.cells[4], 0), Math.round(tot), 1] }; } },
    { id: 'sales-region', group: 'المبيعات', icon: 'map', title: 'المبيعات حسب المنطقة', desc: 'القاهرة الكبرى · الدلتا · الصعيد · الخليج …', period: true,
      build(p) { const from = periodFrom(p); const by = {}; M.invoices().filter((i) => i.issueDate >= from).forEach((i) => { const r = (ERP.customer(i.customerId) || {}).region || 'غير محدد'; const b = by[r] || (by[r] = { n: 0, v: 0, c: new Set() }); b.n++; b.v += M.net(i); b.c.add(i.customerId); });
        const tot = Object.keys(by).reduce((s, k) => s + by[k].v, 0); const rows = Object.keys(by).sort((a, b) => by[b].v - by[a].v).map((k) => ({ cells: [k, by[k].c.size, by[k].n, Math.round(by[k].v), tot ? by[k].v / tot : 0] }));
        return { chart: ERP.chart.bars(rows.map((r, i) => ({ label: r.cells[0], value: r.cells[3], color: ERP.palette[i % 5] })), { fmt: fm.short }), cols: [{ label: 'المنطقة' }, { label: 'العملاء', fmt: 'num', num: true }, { label: 'الفواتير', fmt: 'num', num: true }, { label: 'صافي المبيعات', fmt: 'money', num: true }, { label: 'الحصة', fmt: 'pct', num: true }], rows, total: ['الإجمالي', null, rows.reduce((s, r) => s + r.cells[2], 0), Math.round(tot), 1] }; } },
    { id: 'sales-rep', group: 'المبيعات', icon: 'target', title: 'أداء المندوبين مقابل الأهداف', desc: 'الشهر الحالي ومنذ بداية السنة',
      build() { const cur = M.curKey(); const y = new Date().getFullYear() + '-01-01'; const by = {}; const z = (r) => by[r] || (by[r] = { mtd: 0, ytd: 0, cust: new Set(), open: 0 });
        M.invoices().forEach((i) => { const r = M.repOf(i); if (!r) return; const b = z(r); if (i.issueDate >= y) b.ytd += M.net(i); if (String(i.issueDate).slice(0, 7) === cur) b.mtd += M.net(i); b.cust.add(i.customerId); });
        M.openOrders().forEach((o) => { if (o.repId) z(o.repId).open += M.soNet(o); });
        const tg = {}; get('targets').forEach((t) => { if (t.period === cur) tg[t.repId] = t.target; });
        const rows = Object.keys(by).filter((r) => SA.userById(r)).sort((a, b) => by[b].mtd - by[a].mtd).map((r) => ({ cells: [SA.userName(r), by[r].cust.size, Math.round(by[r].mtd), tg[r] || null, tg[r] ? by[r].mtd / tg[r] : null, Math.round(by[r].open), Math.round(by[r].ytd)] }));
        return { chart: ERP.chart.bars(rows.map((r) => ({ label: r.cells[0], sub: r.cells[3] ? 'الهدف ' + fm.short(r.cells[3]) : 'بدون هدف مسجّل', value: r.cells[4] != null ? Math.round(r.cells[4] * 100) : 0 })), { fmt: (v) => v + '%', max: 100 }),
          cols: [{ label: 'المندوب' }, { label: 'العملاء', fmt: 'num', num: true }, { label: 'مبيعات الشهر', fmt: 'money', num: true }, { label: 'هدف الشهر', fmt: 'money', num: true }, { label: 'التحقيق', fmt: 'pct', num: true }, { label: 'طلبات مفتوحة', fmt: 'money', num: true }, { label: 'منذ بداية السنة', fmt: 'money', num: true }], rows, note: 'المبيعات منسوبة لمندوب أمر البيع. الأهداف من شاشة أهداف المبيعات.' }; } },
    { id: 'prod-line', group: 'التصنيع والجودة', icon: 'factory', title: 'الإنتاج وOEE حسب الخط', desc: 'إنتاج جيد · هالك · توقفات · OEE', period: true,
      build(p) { const from = periodFrom(p); const rows = get('lines').map((ln) => { const r = get('prodDaily').filter((x) => x.lineId === ln.id && x.date >= from); const good = r.reduce((s, x) => s + x.good, 0), scrap = r.reduce((s, x) => s + x.scrap, 0), plan = r.reduce((s, x) => s + x.planned, 0), down = r.reduce((s, x) => s + (x.downtimeMin || 0), 0);
          return { route: 'mfg/lines/' + ln.id, cells: [ln.id + ' — ' + ln.name, (SA.catalog.status.line[ln.status] || [ln.status])[0], good, M.uom(ln), plan ? good / plan : null, good + scrap ? scrap / (good + scrap) : 0, Math.round(down / 60), (ln.oee || {}).a, (ln.oee || {}).p, (ln.oee || {}).q, M.oee(ln)] }; });
        return { chart: ERP.chart.columns({ labels: get('lines').map((l) => l.id), height: 200, fmt: (v) => Math.round(v) + '%', series: [{ name: 'OEE', values: get('lines').map((l) => Math.round(M.oee(l) * 100)) }, { name: 'الجودة', values: get('lines').map((l) => Math.round(((l.oee || {}).q || 0) * 100)), color: ERP.palette[4] }] }),
          cols: [{ label: 'الخط' }, { label: 'الحالة' }, { label: 'إنتاج جيد', fmt: 'num', num: true }, { label: 'الوحدة' }, { label: 'تحقيق الخطة', fmt: 'pct', num: true }, { label: 'نسبة الهالك', fmt: 'pct', num: true }, { label: 'توقفات (ساعة)', fmt: 'num', num: true }, { label: 'الإتاحة A', fmt: 'pct', num: true }, { label: 'الأداء P', fmt: 'pct', num: true }, { label: 'الجودة Q', fmt: 'pct', num: true }, { label: 'OEE', fmt: 'pct', num: true }], rows }; } },
    { id: 'quality', group: 'التصنيع والجودة', icon: 'checkcircle', title: 'مؤشرات الجودة', desc: 'FPY · عدم المطابقة · الإجراءات التصحيحية',
      build() { const fams = ['door', 'clad', 'foam']; const IM = M.itemMap(); const from = ERP.day(-60); const q = get('qcInspections').filter((x) => x.result && x.result !== 'pending' && String(x.at || '').slice(0, 10) >= from);
        const rows = fams.map((f) => { const l = q.filter((x) => x.kind === 'final' && (IM[x.itemId] || {}).family === f); const units = l.reduce((s, x) => s + (x.qty || 0), 0); const pass = l.filter((x) => x.result === 'pass').reduce((s, x) => s + (x.qty || 0), 0); const rej = l.reduce((s, x) => s + (x.rejectedQty || 0), 0); const ncr = get('ncrs').filter((n) => (IM[n.itemId] || {}).family === f); return { cells: [M.FAM[f], l.length, units, units ? pass / units : null, rej, ncr.filter((n) => n.status !== 'closed').length, ncr.length] }; });
        const inc = q.filter((x) => x.kind === 'incoming'); rows.push({ cells: ['خامات واردة (فحص استلام)', inc.length, inc.reduce((s, x) => s + (x.qty || 0), 0), null, inc.reduce((s, x) => s + (x.rejectedQty || 0), 0), get('ncrs').filter((n) => n.source === 'supplier' && n.status !== 'closed').length, get('ncrs').filter((n) => n.source === 'supplier').length] });
        const st2 = {}; get('ncrs').forEach((n) => { st2[n.status] = (st2[n.status] || 0) + 1; });
        return { chart: ERP.chart.donut(Object.keys(st2).map((k, i) => ({ label: (SA.catalog.status.ncr[k] || [k])[0], value: st2[k], color: ERP.palette[i] })), { center: get('ncrs').length, sub: 'NCR' }),
          cols: [{ label: 'العائلة / النوع' }, { label: 'عدد الفحوص', fmt: 'num', num: true }, { label: 'الوحدات المفحوصة', fmt: 'num', num: true }, { label: 'FPY', fmt: 'pct', num: true }, { label: 'مرفوض', fmt: 'num', num: true }, { label: 'NCR مفتوحة', fmt: 'num', num: true }, { label: 'NCR إجمالي', fmt: 'num', num: true }], rows,
          note: 'FPY = الوحدات المقبولة من أول فحص نهائي ÷ الوحدات المفحوصة (آخر 60 يوم). CAPA مفتوحة: ' + get('capas').filter((c) => c.status !== 'closed').length + '.' }; } },
    { id: 'maint', group: 'التصنيع والجودة', icon: 'wrench', title: 'توقفات الصيانة', desc: 'ساعات التوقف حسب الخط والسبب · MTBF/MTTR',
      build() { const cat = { breakdown: 'عطل', setup: 'تجهيز/تغيير قالب', material: 'انتظار خامات', utility: 'مرافق/كهرباء' }; const by = {}; get('downtime').forEach((d) => { const k = d.lineId + '|' + d.category; const b = by[k] || (by[k] = { line: d.lineId, cat: d.category, n: 0, min: 0 }); b.n++; b.min += d.minutes || 0; });
        const rows = Object.keys(by).map((k) => by[k]).sort((a, b) => b.min - a.min).map((b) => ({ route: 'mfg/lines/' + b.line, cells: [b.line + ' — ' + M.lineName(b.line), cat[b.cat] || b.cat, b.n, Math.round(b.min / 6) / 10] }));
        const mrows = get('machines').filter((m) => m.criticality === 'A').map((m) => m.id + ' ' + m.name + ': MTBF ' + m.mtbfH + ' س · MTTR ' + m.mttrH + ' س').slice(0, 4);
        return { chart: ERP.chart.bars(get('lines').map((l, i) => ({ label: l.id + ' ' + l.name, value: Math.round(get('downtime').filter((d) => d.lineId === l.id).reduce((s, d) => s + (d.minutes || 0), 0) / 6) / 10, color: ERP.palette[i] })), { fmt: (v) => v + ' س' }),
          cols: [{ label: 'الخط' }, { label: 'سبب التوقف' }, { label: 'عدد المرات', fmt: 'num', num: true }, { label: 'ساعات التوقف', fmt: 'num', num: true }], rows, note: 'ماكينات حرجة: ' + mrows.join(' · ') }; } },
    { id: 'inv-wh', group: 'المخزون والمالية', icon: 'warehouse', title: 'تقييم المخزون حسب المخزن', desc: 'الكميات والقيمة بالتكلفة المعيارية', sens: 'data.cost.view',
      build() { const by = {}; const IM = M.itemMap(); get('stock').forEach((r) => { const b = by[r.whId] || (by[r.whId] = { items: new Set(), qty: 0, value: 0, reserved: 0 }); if (r.qty > 0) b.items.add(r.itemId); b.qty += r.qty; b.reserved += r.reserved || 0; b.value += r.qty * ((IM[r.itemId] || {}).stdCost || 0); });
        const tot = Object.keys(by).reduce((s, k) => s + by[k].value, 0); const rows = Object.keys(by).sort().map((k) => ({ cells: [k + ' — ' + ERP.whName(k), by[k].items.size, Math.round(by[k].qty), Math.round(by[k].reserved), Math.round(by[k].value), tot ? by[k].value / tot : 0] }));
        return { chart: ERP.ui.canCost() ? ERP.chart.bars(rows.map((r, i) => ({ label: r.cells[0], value: r.cells[4], color: ERP.palette[i % 6] })), { fmt: fm.short }) : null,
          cols: [{ label: 'المخزن' }, { label: 'أصناف بها رصيد', fmt: 'num', num: true }, { label: 'إجمالي الكمية', fmt: 'num', num: true }, { label: 'محجوز', fmt: 'num', num: true }, { label: 'القيمة بالتكلفة', fmt: 'money', num: true, sens: 'data.cost.view' }, { label: 'النسبة', fmt: 'pct', num: true, sens: 'data.cost.view' }], rows, total: ['الإجمالي', null, null, null, Math.round(tot), 1], note: 'الكميات بوحدات مختلفة (باب/قطعة/لوح/كجم/متر). القيمة بالتكلفة المعيارية للصنف — سرية لمن لا يملك data.cost.view.' }; } },
    { id: 'ar-aging', group: 'المخزون والمالية', icon: 'clock', title: 'أعمار ديون العملاء', desc: 'المستحق حسب فترات التأخير',
      build() { const a = M.aging(); const keys = ['current', 'b30', 'b60', 'b90', 'b90p']; const sums = keys.map((k) => a.rows.reduce((s, r) => s + r[k], 0));
        return { chart: ERP.chart.columns({ labels: a.buckets.map((b) => b[1]), height: 200, series: [{ name: 'المستحق', values: sums.map(Math.round) }] }),
          cols: [{ label: 'العميل' }].concat(a.buckets.map((b) => ({ label: b[1], fmt: 'money', num: true }))).concat([{ label: 'الإجمالي', fmt: 'money', num: true }]),
          rows: a.rows.map((r) => ({ route: 'crm/customers/' + r.customerId, cells: [r.name].concat(keys.map((k) => Math.round(r[k]))).concat([Math.round(r.total)]) })), total: ['الإجمالي'].concat(sums.map(Math.round)).concat([Math.round(sums.reduce((s, v) => s + v, 0))]), note: 'الأيام محسوبة من تاريخ الاستحقاق (شروط سداد العميل). الشيكات المرتدة أعادت قيمتها للمديونية.' }; } },
    { id: 'pnl', group: 'المخزون والمالية', icon: 'coins', title: 'قائمة الدخل المختصرة', desc: 'آخر 6 شهور — من القيود اليومية', sens: 'data.profit.view',
      build() { const keys = ERP.monthKeys(6); const mon = keys.map((k) => M.pnl(k + '-01', k + '-31')); const ytd = M.pnl(new Date().getFullYear() + '-01-01', M.today());
        const L = [['الإيرادات', 'rev'], ['تكلفة المبيعات', 'cogs'], ['مجمل الربح', 'gross'], ['تكاليف صناعية غير مباشرة', 'ind'], ['مصروفات بيع وإدارية', 'opex'], ['صافي الربح', 'net']];
        const rows = L.map((x) => ({ cells: [x[0]].concat(mon.map((m) => Math.round(m[x[1]]))).concat([Math.round(ytd[x[1]])]) })); rows.push({ cells: ['هامش مجمل الربح'].concat(mon.map((m) => m.gm)).concat([ytd.gm]), pct: true }); rows.push({ cells: ['هامش صافي الربح'].concat(mon.map((m) => m.nm)).concat([ytd.nm]), pct: true });
        return { chart: ERP.chart.columns({ labels: keys.map((k) => ERP.monthLabel(k)), height: 210, series: [{ name: 'الإيرادات', values: mon.map((m) => Math.round(m.rev)) }, { name: 'مجمل الربح', values: mon.map((m) => Math.max(0, Math.round(m.gross))), color: ERP.palette[2] }, { name: 'صافي الربح', values: mon.map((m) => Math.max(0, Math.round(m.net))), color: ERP.palette[4] }] }),
          cols: [{ label: 'البند' }].concat(keys.map((k) => ({ label: ERP.monthLabel(k), fmt: 'money', num: true, sens: 'data.profit.view' }))).concat([{ label: 'منذ بداية السنة', fmt: 'money', num: true, sens: 'data.profit.view' }]), rows, note: 'أرقام تجريبية مرحّلة من الفواتير والقيود المجمّعة. الشهر الحالي جزئي.' }; } }
  ];
  function reportsPage(root, ctx) {
    ctx.setCrumbs([{ label: 'لوحة القيادة', href: openable('exec/dashboard') ? '#/exec/dashboard' : null }, { label: 'تقارير الإدارة' }]);
    let cur = REPORTS.find((r) => r.id === (ctx.params && ctx.params.r)) || REPORTS[0]; let period = (ctx.params && ctx.params.p) || '90'; let q = '';
    const catEl = h('nav.exec-cat', { 'aria-label': 'كتالوج التقارير' }); const prevEl = h('div.exec-prev');
    const search = h('input.input', { type: 'search', placeholder: 'ابحث في التقارير…', 'aria-label': 'ابحث في التقارير', oninput: SA.debounce((e) => { q = e.target.value.trim(); drawCat(); }, 120) });
    const allowed = (r) => !r.sens || SA.canSensitive(r.sens);
    function drawCat() {
      SA.clear(catEl); catEl.appendChild(search); let last = null; const list = REPORTS.filter((r) => !q || (r.title + ' ' + r.desc + ' ' + r.group).indexOf(q) >= 0);
      if (!list.length) catEl.appendChild(SA.empty({ icon: 'search', title: 'لا توجد تقارير مطابقة' }));
      list.forEach((r) => { if (r.group !== last) { catEl.appendChild(h('h4', {}, r.group)); last = r.group; }
        catEl.appendChild(h('button.exec-cat-btn', { type: 'button', 'aria-current': r === cur ? 'true' : 'false', onclick: () => { cur = r; try { history.replaceState(null, '', '#/exec/reports?r=' + r.id); } catch (e) { /* noop */ } drawCat(); drawPrev(); } },
          h('span.exec-cat-ico', {}, SA.icon(r.icon, 'icon-sm')), h('span', {}, r.title, h('small', {}, r.desc)), allowed(r) ? null : h('span.erp-locked', {}, SA.icon('lock', 'icon-sm')))); });
    }
    let res = null;
    function drawPrev() {
      SA.clear(prevEl);
      if (!allowed(cur)) { prevEl.appendChild(SA.card({ title: cur.title }, h('div.exec-locked', {}, h('span.exec-lock-ico', {}, SA.icon('lock')), h('b', {}, 'هذا التقرير يحتوي بيانات سرية'), h('span', {}, cur.sens === 'data.profit.view' ? 'الأرباح والهوامش تظهر فقط للمالك والمدير العام والمدير المالي.' : 'التكاليف وقيم المخزون تظهر فقط لمن يملك صلاحية التكاليف.'), h('code', {}, cur.sens)))); res = null; return; }
      try { res = cur.build(period); } catch (e) { console.error('[exec-reports]', cur.id, e); prevEl.appendChild(SA.errorState({ onRetry: drawPrev })); return; }
      const tools = h('div.exec-prev-tools', {}, cur.period ? SA.segmented(PERIODS, period, (v) => { period = v; drawPrev(); }) : h('span.exec-note', {}, SA.icon('clock', 'icon-sm'), 'محدث لحظيًا — ' + SA.fmt.time(new Date().toISOString())),
        SA.btn({ label: 'تصدير CSV', icon: 'download', kind: 'primary', perm: 'exec.reports.export', onClick: exportCsv }));
      const tbl = table(res.cols, res.rows.map((r) => r.cells.map((v, i) => { const c = r.pct && i > 0 ? Object.assign({}, res.cols[i], { fmt: 'pct' }) : res.cols[i] || {}; const val = fmtCell(v, c); return i === 0 && r.route && openable(r.route) ? h('a', { href: '#/' + r.route }, val) : val; })),
        { foot: res.total ? res.total.map((v, i) => (v == null ? '' : fmtCell(v, res.cols[i] || {}))) : null, empty: 'لا توجد بيانات في هذه الفترة' });
      prevEl.append(SA.card({ title: cur.title, tags: [cur.period ? SA.chip(periodLabel(period), 'info') : null, M.scoped() ? SA.chip('عملاؤك فقط', 'warning') : null], actions: [] }, tools, res.chart || null, tbl, res.note ? h('p.exec-note', {}, SA.icon('info', 'icon-sm'), res.note) : null));
    }
    async function exportCsv() {
      if (!res) return; const rows = [res.cols.map((c) => c.label)].concat(res.rows.map((r) => r.cells.map((v, i) => csvCell(v, r.pct && i > 0 ? { fmt: 'pct' } : res.cols[i] || {})))); if (res.total) rows.push(res.total.map((v, i) => csvCell(v, res.cols[i] || {})));
      try { await SA.api(() => { SA.download('EG-' + cur.id + '-' + M.today() + '.csv', SA.csv(rows), 'text/csv'); SA.audit('EXPORT.REPORT', { target: { type: 'report', id: 'exec.' + cur.id, label: cur.title }, after: { rows: res.rows.length, format: 'CSV', period: cur.period ? periodLabel(period) : null, sensitiveHidden: res.cols.some((c) => c.sens && !SA.canSensitive(c.sens)) } }); }, { read: true }); } catch (e) { return SA.fail(e); }
      SA.toast('تم تصدير «' + cur.title + '» (' + res.rows.length + ' صف) — مسجّل في سجل التدقيق', 'success');
    }
    root.append(SA.pageHead({ title: 'تقارير الإدارة', desc: 'تقارير جاهزة للإدارة العليا محسوبة لحظيًا من بيانات النظام — مع إخفاء التكاليف والأرباح حسب الصلاحيات.', tags: [SA.tag('new')], actions: [openable('exec/dashboard') ? SA.btn({ label: 'لوحة القيادة', icon: 'gauge', kind: 'ghost', onClick: () => SA.nav('exec/dashboard') }) : null] }),
      h('div.exec-rep', {}, catEl, prevEl));
    drawCat(); drawPrev();
    const offs = ['invoices', 'receipts', 'journal', 'stock', 'prodDaily', 'qcInspections', 'ncrs', 'downtime', 'lines', 'targets'].map((p) => st.subscribe(p, SA.debounce(() => { if (document.contains(prevEl)) drawPrev(); }, 200)));
    return () => offs.forEach((f) => f());
  }
  SA.register({ id: 'exec-reports', app: 'exec', group: 'exec-rep', title: 'تقارير الإدارة', icon: 'chart', route: 'exec/reports', perm: 'exec.reports.view', order: 30, desc: 'المبيعات والإنتاج والمخزون والديون والأرباح — معاينة وتصدير', render: reportsPage });
})();
