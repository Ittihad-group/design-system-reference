/* EG ERP prototype — mod-scrap.js  (app mfg «الهوالك وإعادة التدوير» — group mfg-exec) — غرفة التحكم في الهالك
   Route: mfg/scrap [?q=SCR-…|SS-…|RG-…] [&tab=log|grind|sales] [&p=7|30] [&stage=ST-…] [&machine=M-…] [&reason=R..] [&line=L-..] [&shift=A|B|C] [&normal=1|0]
   الدورة: المرحلة (تقارير المراحل / تسجيل يدوي) ← مخزن الهوالك والمطحون W-07 (بالوزن) ← الكسارة M-502 ← مطحون يرجع الخلاطة جوه الخلطات
           ← الزيادة تتباع بموافقة المدير المالي ← كل خطوة بقيد آلي (1145 / 5204 / 4201). كل الحركات من ERP.factory (FX) — ولا حركة مخزون/قيد هنا مباشرة.
   Actions: FX.logScrap (mfg.scrap.create) · FX.grind (mfg.scrap.recycle) · FX.requestScrapSale + FX.deliverScrapSale (mfg.scrap.sell) · اعتماد البيع عبر SA.approvals.decide
            · طلب صيانة تصحيحية للماكينة اللي هالكها فوق المسموح عبر ERP.care.createMWO (care.maintenance.create) — بإشعار للصيانة.
   ESTIMATES (demo, labelled): الكمية الداخلة لكل مرحلة = إنتاج السحب اليومي (prodDaily: L-01 أبواب · L-03 تجاليد · L-04 فوم + عدّادات اليوم) × وزن خلطة الوحدة
            (FX.compoundKg لصنف ممثل لكل عائلة) × نصيب المسار (الضلفة/الحلق من FX.routeOf). المسموح = الداخل × FX.stdPct. «أعلى من المسموح» = أكثر من 110% (سماحية 10% تجريبية).
            الإنتاج (لنسبة الهالك من الإنتاج) = إنتاج L-02 / L-03 / L-04 × وزن الخلطة.
   Public: ERP.scrap = { analysis(days), todayOver(), openLog(pre), openGrind(), openSale(), deliver(id), open(id), TOL } — used by mod-ai (insight + intent) and mod-exec (attention item). */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP;
  if (!SA || !ERP || !ERP.factory) return;
  const h = SA.h, st = SA.store, FX = ERP.factory, K = ERP.stock, GL = ERP.gl, U = ERP.ui, CH = ERP.chart, fm = ERP.fmt;
  const get = (p) => st.get(p) || [];
  const num = (n, d) => fm.num(n, d);
  const TOL = 1.1;
  const PATHS = ['scrapLogs', 'scrapOps', 'scrapSales', 'stock', 'approvals', 'issueRequests', 'machines', 'maintenanceOrders'];

  SA.icons.addMany({ scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>' });

  /* ═════════════ styles ═════════════ */
  (function () {
    if (document.querySelector('style[data-mod="scrap"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'scrap');
    s.textContent = `
.scr-page { min-width: 0; }
@media (min-width: 900px) { .sap-grid-cards.erp-kpis.scr-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1700px) { .sap-grid-cards.erp-kpis.scr-kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.scr-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; } .scr-col > .card { margin: 0; }
.scr-muted { color: var(--color-text-muted); font-size: 12.5px; line-height: 1.7; }
.scr-note { color: var(--color-text-muted); font-size: 12px; line-height: 1.7; margin: 10px 0 0; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.scr-stack { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .scr-stack small { color: var(--color-text-muted); font-size: 12px; }
.scr-r { text-align: end; white-space: nowrap; }
.scr-id { font: 600 12px var(--font-en); color: var(--color-text-muted); white-space: nowrap; }
.scr-today { margin-block: 12px; }
/* cycle strip */
.scr-flow { display: grid; gap: 16px; grid-template-columns: 1fr; margin-block: 14px 16px; }
@media (min-width: 700px) { .scr-flow { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1240px) { .scr-flow { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.scr-step { position: relative; background: #fff; border: 1px solid var(--color-border); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; min-width: 0; text-decoration: none; color: inherit; box-shadow: var(--shadow-card); }
a.scr-step:hover, a.scr-step:focus-visible, .scr-split a:hover { border-color: var(--eg-navy); }
.scr-step::after { content: ''; position: absolute; width: 0; height: 0; border: 7px solid transparent; z-index: 1; }
@media (min-width: 700px) { .scr-step::after { inset-inline-end: -16px; top: 50%; margin-top: -7px; border-inline-start-color: var(--eg-navy); } .scr-step:nth-child(3n)::after { display: none; } }
@media (min-width: 1240px) { .scr-step:nth-child(3n)::after { display: block; } }
@media (max-width: 699px) { .scr-step::after { bottom: -16px; inset-inline-start: 50%; margin-inline-start: -7px; border-top-color: var(--eg-navy); } }
.scr-step:last-child::after { display: none !important; }
.scr-step-h { display: flex; gap: 8px; align-items: center; }
.scr-step-ico { width: 30px; height: 30px; border-radius: 9px; background: var(--color-primary-tint); color: var(--eg-navy); display: grid; place-items: center; flex: none; }
.scr-step-h b { font-size: 13px; line-height: 1.35; } .scr-step-n { font: 700 11px var(--font-en); color: var(--color-text-muted); }
.scr-step-v { font: 700 1.25rem var(--font-en); color: var(--color-text); line-height: 1.15; }
.scr-step small { color: var(--color-text-muted); font-size: 12px; line-height: 1.55; }
.scr-split { display: flex; flex-direction: column; gap: 8px; }
.scr-split a { display: flex; flex-direction: column; gap: 2px; text-decoration: none; color: inherit; border: 1px dashed var(--color-border-strong); border-radius: 10px; padding: 6px 9px; }
.scr-split a b { font-size: 12.5px; } .scr-split a span { font: 700 1rem var(--font-en); }
.scr-gl { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.scr-gl div { display: flex; justify-content: space-between; gap: 6px; align-items: baseline; } .scr-gl span { color: var(--color-text-muted); } .scr-gl .num { font-weight: 700; color: var(--color-text); white-space: nowrap; }
/* stage chart: actual ÷ allowed */
.scr-stg { display: flex; flex-direction: column; gap: 2px; }
.scr-stg-row { display: grid; grid-template-columns: minmax(118px, 160px) minmax(0, 1fr) 92px; gap: 10px; align-items: center; padding: 6px 6px; border-radius: 9px; text-decoration: none; color: inherit; }
.scr-stg-row:hover, .scr-stg-row:focus-visible { background: var(--color-bg-alt); }
.scr-stg-l { display: flex; flex-direction: column; min-width: 0; } .scr-stg-l b { font-size: 13px; } .scr-stg-l small { font-size: 11.5px; color: var(--color-text-muted); }
.scr-stg-t { position: relative; height: 16px; border-radius: 6px; background: var(--color-neutral-tint, #eef0f3); overflow: hidden; }
.scr-stg-t i { position: absolute; top: 0; bottom: 0; display: block; }
.scr-stg-f { inset-inline-start: 0; border-radius: 6px; background: #147a3d; }
.scr-stg-row.is-edge .scr-stg-f { background: #a85a00; } .scr-stg-row.is-over .scr-stg-f { background: #b9141b; } .scr-stg-row.is-none .scr-stg-f { background: #8a8a8a; }
.scr-stg-tol { background: repeating-linear-gradient(45deg, rgba(168, 90, 0, .18), rgba(168, 90, 0, .18) 3px, transparent 3px, transparent 6px); }
.scr-stg-mk { width: 2px; background: var(--color-text); opacity: .75; z-index: 2; }
.scr-stg-v { display: flex; flex-direction: column; align-items: flex-end; } .scr-stg-v b { font: 700 14px var(--font-en); } .scr-stg-v small { font-size: 11px; color: var(--color-text-muted); white-space: nowrap; }
.scr-stg-row.is-over .scr-stg-v b { color: var(--color-danger); } .scr-stg-row.is-edge .scr-stg-v b { color: var(--color-warning); }
.scr-stg-row.is-over { background: #fff6f6; }
.scr-stg-axis { display: grid; grid-template-columns: minmax(118px, 160px) minmax(0, 1fr) 92px; gap: 10px; padding: 0 6px 4px; font: 600 11px var(--font-en); color: var(--color-text-muted); }
.scr-stg-axis span { position: relative; height: 14px; } .scr-stg-axis em { position: absolute; font-style: normal; transform: translateX(50%); }
@media (max-width: 640px) { .scr-stg-row, .scr-stg-axis { grid-template-columns: minmax(0, 1fr) auto; } .scr-stg-t { grid-column: 1 / -1; grid-row: 2; } .scr-stg-axis > span:first-child, .scr-stg-axis > span:last-child { display: none; } .scr-stg-axis > span { grid-column: 1 / -1; } }
.scr-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--color-text-muted); margin-top: 8px; }
.scr-legend i { display: inline-block; width: 14px; height: 10px; border-radius: 3px; margin-inline-end: 5px; vertical-align: middle; }
/* attention */
.scr-attn { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.scr-attn li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; }
.scr-attn li:last-child { border-bottom: 0; }
.scr-attn-ico { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; flex: none; background: var(--color-warning-tint); color: var(--color-warning); }
.scr-attn-ico.is-danger { background: var(--color-danger-tint); color: var(--color-danger); } .scr-attn-ico.is-info { background: var(--color-primary-tint); color: var(--eg-navy); } .scr-attn-ico.is-success { background: var(--color-success-tint); color: var(--color-success); }
.scr-attn-b { flex: 1; min-width: 200px; font-size: var(--text-dense); } .scr-attn-b > b { display: block; line-height: 1.5; } .scr-attn-b small { color: var(--color-text-muted); font-size: 12.5px; line-height: 1.7; display: block; }
.scr-attn-acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.scr-attn-acts .erp-doc { font-size: 12.5px; }
.scr-ai { display: flex; flex-direction: column; gap: 10px; }
/* tabs + panels */
.scr-tabs-card .tabs { margin-bottom: 12px; overflow-x: auto; }
.scr-tabs-card .sap-filterbar { min-width: 0; max-width: 100%; } .scr-tabs-card .sap-filter-sel { min-width: 0; max-width: 100%; }
@media (max-width: 640px) { .scr-tabs-card .sap-filterbar { width: 100%; } .scr-tabs-card .sap-filter-sel { flex: 1 1 calc(50% - 8px); width: calc(50% - 8px); } .scr-tabs-card .sap-search { min-width: 0; flex-basis: 100%; } }
.scr-stats { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); margin-bottom: 14px; }
.scr-stat { background: var(--color-bg-alt); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.scr-stat small { color: var(--color-text-muted); font-size: 12px; font-weight: 600; } .scr-stat b { font: 700 1.2rem var(--font-en); color: var(--color-text); }
.scr-stat em { font-style: normal; font-size: 12px; color: var(--color-text-muted); line-height: 1.5; }
.scr-stat.is-danger b { color: var(--color-danger); } .scr-stat.is-warning b { color: var(--color-warning); } .scr-stat.is-success b { color: var(--color-success); }
.scr-bigbar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; align-items: center; }
.scr-bigbar .btn { min-height: 52px; font-size: 16px; padding-inline: 22px; border-radius: 12px; }
.scr-sum { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: var(--color-text-muted); margin: 0 0 8px; } .scr-sum b { color: var(--color-text); }
.scr-sub { margin: 18px 0 8px; font-size: 14px; }
.scr-mini { width: 100%; } .scr-mini td, .scr-mini th { font-size: 13px; }
/* forms */
.scr-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0 14px; }
.scr-numin input { font: 700 26px var(--font-en); min-height: 56px; text-align: center; }
.scr-quick { display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 12px; } .scr-quick button { min-height: 44px; min-width: 64px; }
.scr-prev { background: var(--color-bg-alt); border-radius: 12px; padding: 10px 12px; font-size: 13px; display: flex; flex-direction: column; gap: 6px; line-height: 1.7; margin-top: 4px; }
.scr-prev .chip { align-self: flex-start; }
.scr-seg .segmented button { min-height: 46px; padding-inline: 18px; font-size: 15px; }
.scr-lines { display: flex; flex-direction: column; gap: 10px; margin: 6px 0 12px; }
.scr-line { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(90px, 1fr) minmax(80px, .8fr) minmax(90px, .9fr); gap: 10px; align-items: end; background: var(--color-bg-alt); border-radius: 12px; padding: 10px 12px; }
.scr-line .field { margin: 0; } .scr-line-n b { display: block; font-size: 13.5px; } .scr-line-n small { color: var(--color-text-muted); font-size: 12px; }
.scr-line-t { font: 700 15px var(--font-en); text-align: end; padding-bottom: 10px; white-space: nowrap; }
@media (max-width: 640px) { .scr-line { grid-template-columns: 1fr 1fr; } .scr-line-n { grid-column: 1 / -1; } .scr-line-t { grid-column: 1 / -1; text-align: start; padding: 0; } }
.scr-flowmini { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12.5px; margin: 8px 0 4px; }
.scr-flowmini span { background: var(--color-bg-alt); border-radius: 8px; padding: 4px 9px; } .scr-flowmini svg { color: var(--color-text-muted); }
`;
    document.head.appendChild(s);
  })();

  /* ═════════════ helpers ═════════════ */
  const perTxt = (p) => (p === 1 ? 'النهارده' : p <= 10 ? 'آخر ' + p + ' أيام' : 'آخر ' + p + ' يوم');
  const kgTxt = (kg) => num(kg, Math.abs(kg) < 100 ? 1 : 0) + ' كجم';
  const wt = (kg) => (Math.abs(kg) >= 1000 ? num(kg / 1000, 1) + ' طن' : kgTxt(kg));
  const pctT = (v, d) => (v == null || !isFinite(v) ? '—' : fm.pct(v, d == null ? 1 : d));
  const idxT = (r) => (r == null || !isFinite(r) ? '—' : Math.round(r * 100) + '%');
  const stName = (id) => FX.stageName(id).replace(/\s*\([^)]*\)/g, '');
  const lvl = (r) => (r == null || !isFinite(r) ? 'none' : r > TOL ? 'over' : r > 1 ? 'edge' : 'ok');
  const LV = { over: ['أعلى من المسموح', 'danger'], edge: ['على الحد', 'warning'], ok: ['ضمن المسموح', 'success'], none: ['بدون إنتاج', 'neutral'] };
  const LVCOL = { over: '#b9141b', edge: '#a85a00', ok: '#147a3d', none: '#8a8a8a' };
  const lvChip = (r) => { const m = LV[lvl(r)]; return SA.chip(m[0], m[1]); };
  const normChip = (n) => (n ? SA.chip('طبيعي (متوقع)', 'info') : SA.chip('غير طبيعي', 'danger'));
  const shortDate = (ds) => { const p = String(ds || '').split('-'); return p.length === 3 ? Number(p[2]) + '/' + Number(p[1]) : ds; };
  const famOf = (itemId) => { const it = ERP.item(itemId); return it && (it.family === 'clad' || it.family === 'foam') ? it.family : 'door'; };
  const userName = (id) => (id ? SA.userName(id) : '—');
  const canCost = () => U.canCost();
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
  const inRange = (iso, from, to) => { const d = String(iso || '').slice(0, 10); return !!d && d >= from && d <= to; };
  const openable = (route) => { try { const m = SA.router.parse('#/' + route).module; return !!(m && SA.canOpen(m) && (!SA.appEnabled || SA.appEnabled(m.app))); } catch (e) { return false; } };
  const lnk = (id, label) => { const r = ERP.route(id); return r && openable(r) ? U.docLink(id, label) : h('span.num', {}, label || id || '—'); };
  const routeLink = (route, label) => (openable(route) ? h('a.erp-doc', { href: '#/' + route }, label) : null);
  const mName = (id) => { const m = ERP.machine(id); return m ? m.name : id || '—'; };
  const itemShort = (id) => { const it = ERP.item(id); return it ? it.name : id || '—'; };
  const SHIFTS = { A: 'وردية A · من 7 ص لـ 3 م', B: 'وردية B · من 3 م لـ 11 م', C: 'وردية C · من 11 م لـ 7 ص' };
  const shiftNow = () => { const hr = new Date().getHours(); return hr >= 7 && hr < 15 ? 'A' : hr >= 15 && hr < 23 ? 'B' : 'C'; };
  const stat = (label, value, sub, tone) => h('div.scr-stat' + (tone ? '.is-' + tone : ''), {}, h('small', {}, label), h('b.num', {}, value), sub ? h('em', {}, sub) : null);
  function safeNotify(o) { try { SA.notify(o); } catch (e) { /* noop */ } }

  /* ═════════════ analysis (shared with mod-ai / mod-exec) ═════════════ */
  const FAMS = ['door', 'clad', 'foam'];
  const THR_LINE = { door: 'L-01', clad: 'L-03', foam: 'L-04' }; // what enters the stages = extrusion output
  const OUT_LINE = { door: 'L-02', clad: 'L-03', foam: 'L-04' }; // finished output
  const PREF = { door: 'IT-D101-90-C132', clad: 'IT-K71-1', foam: 'IT-FB-10' };
  let baseC = null;
  function base() {
    const items = get('items'); if (baseC && baseC.items === items && baseC.n === items.length) return baseC;
    const fg = (f) => items.filter((i) => i.family === f && i.kind === 'fg' && i.bomId);
    const R = {}, CK = {}, SH = {};
    FAMS.forEach((f) => { const l = fg(f); R[f] = l.find((i) => i.id === PREF[f]) || l[0] || null; CK[f] = R[f] ? FX.compoundKg(R[f].id) : 0; SH[f] = {}; });
    const decor = fg('door').find((i) => FX.finishType(i.id) !== 'plain') || R.door;
    FAMS.forEach((f) => { const it = f === 'door' ? decor : R[f]; if (it) FX.routeOf(it.id).forEach((s) => { SH[f][s.stageId] = (SH[f][s.stageId] || 0) + FX.trackShare(s.track); }); });
    baseC = { items, n: items.length, R, CK, SH }; return baseC;
  }
  function unitsIdx() {
    const m = {}; get('prodDaily').forEach((r) => { const d = (m[r.date] = m[r.date] || {}); d[r.lineId] = (d[r.lineId] || 0) + (r.good || 0); });
    const t = ERP.day(0);
    if (!m[t]) { const t0 = new Date(); t0.setHours(0, 0, 0, 0); const td = {}; get('mfgShiftLog').forEach((x) => { if (new Date(x.at).getTime() >= t0.getTime()) td[x.lineId] = (td[x.lineId] || 0) + (x.good || 0); }); m[t] = td; }
    return m;
  }
  const famThrDay = (b, UI, sid, f, d) => ((UI[d] || {})[THR_LINE[f]] || 0) * b.CK[f] * (b.SH[f][sid] || 0);
  const thrDay = (b, UI, sid, d) => FAMS.reduce((a, f) => a + famThrDay(b, UI, sid, f, d), 0);
  const outDay = (b, UI, d) => FAMS.reduce((a, f) => a + ((UI[d] || {})[OUT_LINE[f]] || 0) * b.CK[f], 0);
  const daysBack = (n) => { const out = []; for (let i = n - 1; i >= 0; i--) out.push(ERP.day(-i)); return out; };

  /** stages whose scrap TODAY (from the work-order stage reports) is above standard + tolerance — same basis as the foundation alert */
  function todayOver() {
    const t = ERP.day(0); const kg = {}, mc = {};
    get('scrapLogs').forEach((l) => { if (l.date !== t) return; kg[l.stageId] = (kg[l.stageId] || 0) + l.kg; if (l.machineId) { const k = l.stageId; mc[k] = mc[k] || {}; mc[k][l.machineId] = (mc[k][l.machineId] || 0) + l.kg; } });
    const ids = Object.keys(kg); if (!ids.length) return [];
    const memo = {}; const uk = (itemId, track) => { const k = itemId + '|' + track; if (memo[k] == null) memo[k] = FX.unitKg(itemId, track); return memo[k]; };
    const wos = get('workOrders');
    return ids.map((sid) => {
      const proc = wos.reduce((s, w) => s + (w.stages || []).filter((x) => x.stageId === sid && x.lastAt && x.lastAt.slice(0, 10) === t).reduce((a, x) => a + ((x.good || 0) + (x.scrap || 0)) * uk(w.itemId, x.track), 0), 0);
      if (proc < 200) return null; const rate = kg[sid] / (proc + kg[sid]); const std = FX.stdPct(sid); if (!std || rate <= std * TOL) return null;
      const m = mc[sid] ? Object.keys(mc[sid]).sort((a, c) => mc[sid][c] - mc[sid][a])[0] : null;
      return { stageId: sid, kg: kg[sid], proc, rate, std, ratio: rate / std, machineId: m };
    }).filter(Boolean);
  }

  function analysis(p) {
    p = Math.max(1, Math.min(90, Number(p) || 30));
    const b = base(), UI = unitsIdx(); const T = ERP.day(0);
    const dates = daysBack(p); const from = dates[0], to = T; const d7 = daysBack(7);
    const all = get('scrapLogs'); const logs = all.filter((l) => l.date >= from && l.date <= to);
    const stats = FX.scrapStats({ from, to });
    const dk = {}; const lim = ERP.day(-32); all.forEach((l) => { if (l.date < lim) return; const k = l.date + '|' + l.stageId; dk[k] = (dk[k] || 0) + l.kg; });
    const dayRatio = (sid, d) => { const al = thrDay(b, UI, sid, d) * FX.stdPct(sid); return al > 0 ? (dk[d + '|' + sid] || 0) / al : null; };
    const stages = Object.keys(FX.STAGES).map((sid) => {
      const s = FX.STAGES[sid]; const x = stats.byStage[sid] || { kg: 0, cost: 0, n: 0, qty: 0 };
      const thr = sum(dates, (d) => thrDay(b, UI, sid, d)); const allowed = thr * s.stdPct; const ratio = allowed > 0 ? x.kg / allowed : null;
      const thr7 = sum(d7, (d) => thrDay(b, UI, sid, d)); const kg7 = sum(d7, (d) => dk[d + '|' + sid] || 0); const ratio7 = thr7 * s.stdPct > 0 ? kg7 / (thr7 * s.stdPct) : null;
      let streak = 0; const streakDays = []; for (let d = 1; d <= 30; d++) { const r = dayRatio(sid, ERP.day(-d)); if (r != null && r > TOL) { streak++; streakDays.push({ d, r, kg: dk[ERP.day(-d) + '|' + sid] || 0, al: thrDay(b, UI, sid, ERP.day(-d)) * s.stdPct }); } else break; }
      let spike = null;
      for (let end = streak + 2; end <= 24; end++) {
        const win = []; for (let d = end; d < end + 7; d++) win.push({ d, r: dayRatio(sid, ERP.day(-d)) });
        if (win.some((w) => w.r == null)) continue; const avg = sum(win, (w) => w.r) / 7;
        if (avg >= 1.4 && (!spike || avg > spike.avg)) { const hi = win.filter((w) => w.r > TOL); spike = { avg, fromD: Math.max.apply(null, hi.map((w) => w.d)), toD: Math.min.apply(null, hi.map((w) => w.d)) }; }
      }
      const excessStreak = sum(streakDays, (z) => Math.max(0, z.kg - z.al));
      return { stageId: sid, name: stName(sid), std: s.stdPct, kg: x.kg, n: x.n, qty: x.qty, cost: x.cost, thr, allowed, ratio, rate: thr > 0 ? x.kg / thr : null, level: lvl(ratio), excessKg: Math.max(0, x.kg - allowed), ratio7, kg7, streak, excessStreak, spike, order: s.order };
    }).filter((x) => x.thr > 0 || x.kg > 0);
    /* machines: allowed = the stage-family allowance shared by the machines of that family in proportion to their scrap (→ same index as the stage-family) */
    const sf = {}, mm = {};
    logs.forEach((l) => { const k = l.stageId + '|' + famOf(l.itemId); sf[k] = (sf[k] || 0) + l.kg; if (!l.machineId) return; const m = (mm[l.machineId] = mm[l.machineId] || { id: l.machineId, kg: 0, n: 0, cost: 0, parts: {}, stages: {} }); m.kg += l.kg; m.n++; m.cost += l.cost || 0; m.parts[k] = (m.parts[k] || 0) + l.kg; m.stages[l.stageId] = (m.stages[l.stageId] || 0) + l.kg; });
    const machines = Object.keys(mm).map((id) => {
      const m = mm[id]; let al = 0; Object.keys(m.parts).forEach((k) => { const sp = k.split('|'); const P = sum(dates, (d) => famThrDay(b, UI, sp[0], sp[1], d)); if (sf[k] > 0) al += P * FX.stdPct(sp[0]) * (m.parts[k] / sf[k]); });
      const sid = Object.keys(m.stages).sort((a, c) => m.stages[c] - m.stages[a])[0]; const mc = ERP.machine(id) || {};
      return Object.assign(m, { allowed: al, ratio: al > 0 ? m.kg / al : null, stageId: sid, name: mc.name || id, mc });
    }).sort((a, c) => (c.ratio || 0) - (a.ratio || 0));
    const shifts = { A: 0, B: 0, C: 0 }, lines = {}; logs.forEach((l) => { shifts[l.shift] = (shifts[l.shift] || 0) + l.kg; if (l.lineId) lines[l.lineId] = (lines[l.lineId] || 0) + l.kg; });
    const reasons = Object.keys(stats.byReason).map((id) => { const r = FX.reason(id) || {}; const x = stats.byReason[id]; return { id, label: FX.reasonLabel(id), normal: !!r.normal, kg: x.kg, n: x.n, cost: x.cost }; }).sort((a, c) => c.kg - a.kg);
    const tm = {}; logs.forEach((l) => { const x = (tm[l.date] = tm[l.date] || { normal: 0, abnormal: 0 }); if (l.normal) x.normal += l.kg; else x.abnormal += l.kg; });
    const trend = dates.map((d) => ({ d, normal: (tm[d] || {}).normal || 0, abnormal: (tm[d] || {}).abnormal || 0 }));
    const outKg = sum(dates, (d) => outDay(b, UI, d));
    const regOf = (m) => sum((m.lines || []).filter((l) => l.itemId === FX.REG), (l) => l.issuedQty || 0);
    const mirsAll = get('issueRequests').filter((m) => m.issuedAt && regOf(m) > 0);
    const mirs = mirsAll.filter((m) => inRange(m.issuedAt, from, to)).map((m) => ({ m, kg: regOf(m) }));
    const reg30 = sum(mirsAll.filter((m) => inRange(m.issuedAt, ERP.day(-29), T)), regOf);
    const ops = get('scrapOps').filter((o) => inRange(o.at, from, to));
    const sales = get('scrapSales'); const sold = sales.filter((s) => s.status === 'sold' && inRange(s.soldAt || s.at, from, to));
    const stock = FX.SCRAP_ITEMS.concat([FX.REG]).map((id) => { const it = ERP.item(id) || {}; const q = K.qty(id, FX.SCRAP_WH); return { id, it, qty: q, avail: id === FX.REG ? K.available(id, FX.SCRAP_WH) : FX.scrapAvail(id), value: q * (it.stdCost || 0) }; });
    const batches = get('scrapOps').slice(0, 8).map((o) => o.kgIn).sort((a, c) => a - c); const batch = batches.length ? batches[Math.floor(batches.length / 2)] : 1000;
    return { p, from, to, dates, logs, stats, stages, machines, shifts, lines, reasons, trend, outKg, pctOut: outKg > 0 ? stats.kg / outKg : null,
      mirs, regKg: sum(mirs, (x) => x.kg), reg30, weekNeed: (reg30 / 30) * 7, ops, groundIn: sum(ops, (o) => o.kgIn), groundOut: sum(ops, (o) => o.kgOut),
      sold, revenue: sum(sold, (s) => s.total), gain: sum(sold, (s) => s.total - (s.bookValue || 0)), soldKg: sum(sold, (s) => sum(s.lines, (l) => l.kg)),
      pending: sales.filter((s) => s.status === 'pending_approval'), approved: sales.filter((s) => s.status === 'approved'), stock, batch, today: todayOver(), base: b };
  }
  const stockOf = (a, id) => a.stock.find((x) => x.id === id) || { qty: 0, avail: 0, value: 0, it: {} };

  /* ═════════════ attention + AI ═════════════ */
  const openMwo = (mid) => get('maintenanceOrders').find((m) => m.machineId === mid && ['done', 'cancelled'].indexOf(m.status) < 0) || null;
  const pmPlan = (mid) => get('pmPlans').find((x) => x.machineId === mid) || null;
  const pmLate = (mc) => (mc && mc.nextPMAt && mc.nextPMAt < ERP.day(0) ? ERP.daysBetween(mc.nextPMAt) : 0);
  const apOf = (s) => (s && s.approvalId ? ERP.find('approvals', s.approvalId) : null);
  const canDecide = (ap) => !!(ap && SA.approvals && SA.approvals.why && (ap.status === 'pending' || ap.status === 'delegated') && !SA.approvals.why(ap));
  const footTicket = () => get('tickets').find((t) => /فويل|لمينيشن|اللمينيشن/.test(t.title || '') && ['closed'].indexOf(t.status) < 0) || get('tickets').find((t) => /فويل/.test(t.title || '')) || null;
  const topMachineOf = (a, sid) => a.machines.filter((m) => m.stageId === sid).sort((x, y) => y.kg - x.kg)[0] || null;

  function attention(a) {
    const out = [];
    a.stages.filter((s) => s.streak >= 3).sort((x, y) => y.streak - x.streak).forEach((s) => {
      const m = topMachineOf(a, s.stageId); const mc = m ? m.mc : null; const late = pmLate(mc); const tod = a.today.find((x) => x.stageId === s.stageId); const mwo = m ? openMwo(m.id) : null;
      out.push({ tone: 'danger', icon: 'scissors', title: 'هالك ' + s.name + ' أعلى من المسموح ' + s.streak + ' أيام متتالية' + (m ? ' — ' + m.id : ''),
        sub: (m ? m.name + ' · ' : '') + 'آخر 7 أيام ' + idxT(s.ratio7) + ' من المسموح' + (tod ? ' · والنهارده ' + pctT(tod.rate) + ' مقابل ' + pctT(tod.std) : '') + (late ? ' · الصيانة الوقائية متأخرة ' + late + ' يوم' : '') + ' · زيادة ≈ ' + kgTxt(s.excessStreak) + ' عن المسموح',
        links: [m ? lnk(m.id, 'الماكينة ' + m.id) : null, late ? routeLink('care/pm', 'الصيانة الوقائية') : null, mwo ? lnk(mwo.id) : null, h('a.erp-doc', { href: '#/mfg/scrap?tab=log&stage=' + s.stageId }, 'سجلات المرحلة')],
        btn: m && !mwo && ERP.care && ERP.care.createMWO ? SA.btn({ label: 'اطلب صيانة للماكينة', icon: 'wrench', kind: 'ghost', size: 'sm', perm: 'care.maintenance.create', onClick: () => requestMaint(m.id, s) }) : null });
    });
    a.today.filter((t) => !a.stages.some((s) => s.stageId === t.stageId && s.streak >= 3)).forEach((t) => out.push({ tone: 'danger', icon: 'alert', title: 'النهارده: هالك ' + stName(t.stageId) + ' ' + pctT(t.rate) + ' مقابل ' + pctT(t.std) + ' مسموح', sub: kgTxt(t.kg) + ' من ' + kgTxt(t.proc) + ' اتشغلت' + (t.machineId ? ' · ' + t.machineId + ' ' + mName(t.machineId) : '') + ' — راجع الماكينة والمشغّل.', links: [h('a.erp-doc', { href: '#/mfg/scrap?tab=log&stage=' + t.stageId }, 'سجلات المرحلة')] }));
    a.stages.filter((s) => s.spike).forEach((s) => {
      const tk = s.stageId === 'ST-LAM' ? footTicket() : null;
      out.push({ tone: 'warning', icon: 'layers', title: 'ارتفاع مؤقت في هالك ' + s.name + ' من ' + s.spike.fromD + ' إلى ' + s.spike.toD + ' يوم فاتوا', sub: 'متوسط ' + idxT(s.spike.avg) + ' من المسموح في الفترة دي ثم رجع طبيعي' + (tk ? ' — نفس فترة إنتاج أبواب الشكوى ' + tk.id + ' «' + tk.title + '»' + (tk.ncrId ? ' (' + tk.ncrId + ')' : '') + '. راجع لوط الفويل/اللاصق المستلم وقتها.' : '.'),
        links: [tk ? lnk(tk.id, 'الشكوى ' + tk.id) : null, tk && tk.ncrId ? lnk(tk.ncrId) : null, h('a.erp-doc', { href: '#/mfg/scrap?tab=log&stage=' + s.stageId }, 'سجلات المرحلة')] });
    });
    a.pending.forEach((s) => { const ap = apOf(s); const hrs = Math.round((Date.now() - new Date(s.at).getTime()) / 3600000);
      out.push({ tone: hrs >= 24 ? 'warning' : 'info', icon: 'coins', title: 'طلب بيع ' + s.id + ' بانتظار اعتماد المدير المالي', sub: s.buyer + ' · ' + kgTxt(sum(s.lines, (l) => l.kg)) + ' · ' + fm.money(s.total) + ' · ' + SA.fmt.rel(s.at),
        links: [ap ? lnk(ap.id, 'طلب الاعتماد ' + ap.id) : null, h('a.erp-doc', { href: '#/mfg/scrap?q=' + s.id }, 'تفاصيل البيع')],
        btn: canDecide(ap) ? SA.btn({ label: 'اعتماد البيع', icon: 'check', kind: 'primary', size: 'sm', onClick: () => SA.approvals.decide(ap.id, 'approve') }) : null }); });
    a.approved.forEach((s) => out.push({ tone: 'info', icon: 'truck', title: 'بيع ' + s.id + ' معتمد — سلّم للمشتري بعد الوزن', sub: s.buyer + ' · ' + kgTxt(sum(s.lines, (l) => l.kg)) + ' · تحصيل ' + fm.money(s.total), links: [h('a.erp-doc', { href: '#/mfg/scrap?q=' + s.id }, 'تفاصيل البيع')],
      btn: SA.btn({ label: 'تسليم للمشتري', icon: 'truck', kind: 'ghost', size: 'sm', perm: 'mfg.scrap.sell', onClick: () => deliver(s.id) }) }));
    const gr = stockOf(a, 'IT-SCR-GR'), reg = stockOf(a, FX.REG); const regDays = a.weekNeed > 0 ? reg.qty / (a.weekNeed / 7) : null;
    if (gr.avail >= a.batch || (regDays != null && regDays < 5 && gr.avail >= 200)) out.push({ tone: 'info', icon: 'recycle', title: 'رصيد الهوالك القابلة للطحن ' + kgTxt(gr.avail) + ' — شغّل الكسارة', sub: 'دفعة الطحن المعتادة ≈ ' + kgTxt(a.batch) + ' · المطحون الجاهز ' + kgTxt(reg.qty) + (regDays != null ? ' يكفي الخلاطة ≈ ' + Math.round(regDays) + ' يوم' : '') + ' · الطحن الأول وبعده البيع للزيادة بس.',
      links: [h('a.erp-doc', { href: '#/mfg/scrap?tab=grind' }, 'سجل الطحن')], btn: SA.btn({ label: 'طحن دفعة', icon: 'recycle', kind: 'ghost', size: 'sm', perm: 'mfg.scrap.recycle', onClick: () => openGrind() }) });
    return out;
  }
  function aiCards(a) {
    const out = [];
    const over = a.stages.filter((s) => s.streak >= 3).sort((x, y) => y.streak - x.streak)[0];
    if (over) { const m = topMachineOf(a, over.stageId); const late = m ? pmLate(m.mc) : 0; const ck = FX.compoundCostKg();
      const since = ERP.day(-over.streak); const rk = {}; get('scrapLogs').forEach((l) => { if (l.stageId === over.stageId && l.date >= since && !l.normal) rk[l.reasonId] = (rk[l.reasonId] || 0) + l.kg; });
      const topR = Object.keys(rk).sort((x, y) => rk[y] - rk[x])[0]; const cut = ['ST-TRIM', 'ST-CUT', 'ST-CLCUT'].indexOf(over.stageId) >= 0;
      out.push({ tone: 'danger', title: 'السبب الأرجح: ' + (m ? m.id + ' ' + m.name : over.name), text: 'هالك ' + over.name + ' بيزيد من ' + over.streak + ' أيام (آخر 7 أيام ' + idxT(over.ratio7) + ' من المسموح)' + (m ? ' وأغلبه على ' + m.id : '') + (topR ? '، وأكتر سبب غير طبيعي «' + FX.reasonLabel(topR) + '»' : '') + (late ? '، والصيانة الوقائية للماكينة متأخرة ' + late + ' يوم' : '') + '. الزيادة التدريجية يوم بعد يوم بتشير ' + (cut ? 'لتآكل السكينة/المنشار' : 'لمشكلة في الماكينة أو الضبط') + '. التوصية: ' + (cut ? 'تغيير/سن السكينة' : 'فحص الماكينة') + (late ? ' وتنفيذ الوقائية المتأخرة' : '') + ' — الزيادة عن المسموح ≈ ' + kgTxt(over.excessStreak) + (canCost() ? ' (≈ ' + fm.short(over.excessStreak * ck) + ')' : '') + '.',
        actions: [m && openable('care/assets/' + m.id) ? { label: 'الماكينة ' + m.id, route: 'care/assets/' + m.id } : null, openable('care/pm') ? { label: 'الصيانة الوقائية', route: 'care/pm' } : null].filter(Boolean) }); }
    const sp = a.stages.find((s) => s.spike && s.stageId === 'ST-LAM') || a.stages.find((s) => s.spike);
    if (sp) { const tk = sp.stageId === 'ST-LAM' ? footTicket() : null;
      out.push({ tone: 'warning', title: 'ربط بين هالك ' + sp.name + ' وشكوى عميل', text: 'هالك ' + sp.name + ' اتضاعف (' + idxT(sp.spike.avg) + ' من المسموح) من ' + sp.spike.fromD + ' لـ ' + sp.spike.toD + ' يوم فاتوا' + (tk ? '، وشكوى ' + tk.id + ' «' + tk.title + '» على أبواب اتصنعت في نفس الفترة' : '') + '. غالبًا دفعة فويل/لاصق. التوصية: حجز وفحص باقي اللوط، وإضافة اختبار شد الفويل في فحص الاستلام.',
        actions: [tk && openable('care/tickets/' + tk.id) ? { label: 'الشكوى ' + tk.id, route: 'care/tickets/' + tk.id } : null, tk && tk.ncrId && openable('mfg/ncr/' + tk.ncrId) ? { label: tk.ncrId, route: 'mfg/ncr/' + tk.ncrId } : null].filter(Boolean) }); }
    const reg = stockOf(a, FX.REG); const pvc = ERP.item('IT-RM-PVC') || {}; const regIt = ERP.item(FX.REG) || {};
    if (a.regKg > 0 || reg.qty > 0) out.push({ tone: 'success', title: 'المطحون بيوفر خامات بكر', text: 'رجع للخلاطة ' + kgTxt(a.regKg) + ' مطحون في ' + perTxt(a.p) + ' بدل PVC بكر' + (canCost() && pvc.stdCost ? ' — توفير ≈ ' + fm.short(a.regKg * Math.max(0, (pvc.stdCost || 0) - (regIt.stdCost || 0))) + ' فرق سعر' : '') + '. الخلطات بتسمح بمطحون لحد 8–10% للأبواب و30% في خلطة الحلوق الاقتصادية MX-12 — اطحن الأول وبيع الزيادة بس.',
      actions: openable('mfg/formulas') ? [{ label: 'الخلطات', route: 'mfg/formulas' }] : [] });
    return out;
  }
  async function requestMaint(mid, s) {
    const mc = ERP.machine(mid); if (!mc || !ERP.care) return;
    const r = await SA.confirm({ title: 'طلب صيانة تصحيحية — ' + mid, icon: 'wrench', confirmLabel: 'إرسال للصيانة', reason: true, reasonLabel: 'ملاحظة للصيانة',
      impact: ['أمر صيانة تصحيحية بأولوية عالية على ' + mc.name, 'السبب: هالك ' + s.name + ' أعلى من المسموح ' + s.streak + ' أيام (آخر 7 أيام ' + idxT(s.ratio7) + ')', 'إشعار لمدير الصيانة — ويُسجّل MNT.REQUESTED'] });
    if (!r.ok) return;
    let m; try { m = await SA.api(() => { const x = ERP.care.createMWO({ kind: 'corrective', machineId: mid, title: 'هالك ' + s.name + ' أعلى من المسموح — فحص/تغيير السكينة', desc: 'من شاشة الهوالك: ' + s.streak + ' أيام متتالية فوق المسموح. ' + (r.reason || ''), priority: 'high', plannedAt: ERP.day(0) }); safeNotify({ title: 'صيانة مطلوبة: ' + mid + ' ' + mc.name, body: 'هالك ' + s.name + ' أعلى من المسموح ' + s.streak + ' أيام — ' + x.id, level: 'action', to: ['R-18'], link: '#/care/maintenance/' + x.id }); return x; }); } catch (e) { return SA.fail(e); }
    SA.toast('اتبعت أمر الصيانة ' + m.id + ' لقسم الصيانة', 'success');
  }

  /* ═════════════ charts ═════════════ */
  function stageChart(a) {
    const rows = a.stages.slice().sort((x, y) => x.order - y.order);
    const maxR = Math.max.apply(null, rows.map((r) => r.ratio || 0).concat([1]));
    const scale = Math.max(1.6, Math.min(3, maxR * 1.08)); const pos = (v) => Math.min(100, (v / scale) * 100);
    const ticks = [0, 0.5, 1, 1.5, 2, 2.5, 3].filter((t) => t <= scale);
    return h('div.scr-stg', {},
      h('div.scr-stg-axis', { 'aria-hidden': 'true' }, h('span'), h('span', {}, ticks.map((t) => h('em', { style: { insetInlineStart: pos(t) + '%', transform: t === 0 ? 'none' : pos(t) >= 92 ? 'translateX(100%)' : 'translateX(50%)' } }, Math.round(t * 100) + '%'))), h('span')),
      rows.map((r) => h('a.scr-stg-row.is-' + r.level, { href: '#/mfg/scrap?tab=log&stage=' + r.stageId, title: r.name + ': ' + kgTxt(r.kg) + ' فعلي مقابل ' + kgTxt(r.allowed) + ' مسموح (تقديري)', 'aria-label': r.name + ' ' + idxT(r.ratio) + ' من المسموح' },
        h('span.scr-stg-l', {}, h('b', {}, r.name), h('small', {}, kgTxt(r.kg) + ' · مسموح ' + pctT(r.std))),
        h('span.scr-stg-t', {}, h('i.scr-stg-tol', { style: { insetInlineStart: pos(1) + '%', width: (pos(TOL) - pos(1)) + '%' } }), h('i.scr-stg-f', { style: { width: Math.max(r.kg > 0 ? 1.5 : 0, pos(r.ratio || 0)) + '%' } }), h('i.scr-stg-mk', { style: { insetInlineStart: pos(1) + '%' } })),
        h('span.scr-stg-v', {}, h('b.num', {}, idxT(r.ratio)), h('small', {}, 'فعلي ' + pctT(r.rate, 2))))),
      h('div.scr-legend', {}, h('span', {}, h('i', { style: { background: '#147a3d' } }), 'ضمن المسموح'), h('span', {}, h('i', { style: { background: '#a85a00' } }), 'على الحد (حتى +10%)'), h('span', {}, h('i', { style: { background: '#b9141b' } }), 'أعلى من المسموح'), h('span', {}, h('i', { style: { background: 'var(--color-text)', width: '2px' } }), 'الخط = 100% من المسموح')));
  }
  function trendChart(a) {
    const lab = a.trend.map((x) => (a.p > 10 ? String(Number(x.d.slice(8))) : shortDate(x.d)));
    return CH.columns({ labels: lab, stacked: true, height: 220, fmt: (v) => num(v), title: 'الهالك اليومي بالكيلو', series: [{ name: 'طبيعي (متوقع: قصاصات/تراب/بداية تشغيل)', color: '#7d9cd1', values: a.trend.map((x) => Math.round(x.normal)) }, { name: 'غير طبيعي', color: '#b9141b', values: a.trend.map((x) => Math.round(x.abnormal)) }] });
  }
  function paretoChart(a) {
    if (!a.reasons.length) return SA.empty({ icon: 'checkcircle', title: 'لا يوجد هالك في الفترة' });
    let cum = 0; const tot = a.stats.kg || 1;
    return CH.bars(a.reasons.slice(0, 8).map((r) => { cum += r.kg; return { label: r.label, sub: (r.normal ? 'طبيعي' : 'غير طبيعي') + ' · ' + r.n + ' تسجيل · تراكمي ' + Math.round((cum / tot) * 100) + '%', value: r.kg, color: r.normal ? '#7d9cd1' : '#b9141b', href: '#/mfg/scrap?tab=log&reason=' + r.id }; }), { fmt: (v) => kgTxt(v) });
  }
  function machineChart(a) {
    const list = a.machines.filter((m) => m.ratio != null).slice(0, 8); if (!list.length) return SA.empty({ icon: 'factory', title: 'لا توجد بيانات ماكينات' });
    return CH.bars(list.map((m) => ({ label: m.id + ' · ' + stName(m.stageId), sub: kgTxt(m.kg) + ' · ' + m.name, value: m.ratio * 100, color: LVCOL[lvl(m.ratio)], href: '#/mfg/scrap?tab=log&machine=' + m.id })), { fmt: (v) => Math.round(v) + '%', max: Math.max(150, list[0].ratio * 105) });
  }
  function shiftChart(a) {
    const tot = a.stats.kg || 1; const L = get('lines');
    return h('div', {}, h('p.scr-muted', { style: { margin: '0 0 6px' } }, 'حسب الوردية'),
      CH.bars(['A', 'B', 'C'].map((k, i) => ({ label: SHIFTS[k], sub: Math.round(((a.shifts[k] || 0) / tot) * 100) + '% من الهالك', value: a.shifts[k] || 0, color: ERP.palette[i], href: '#/mfg/scrap?tab=log&shift=' + k })), { fmt: (v) => kgTxt(v) }),
      h('p.scr-muted', { style: { margin: '12px 0 6px' } }, 'حسب الخط'),
      CH.bars(L.filter((l) => a.lines[l.id]).map((l) => ({ label: l.id + ' · ' + l.name, value: a.lines[l.id] || 0, color: '#345383', href: '#/mfg/scrap?tab=log&line=' + l.id })), { fmt: (v) => kgTxt(v) }));
  }

  /* ═════════════ cycle strip «دورة الهالك» ═════════════ */
  function flowStrip(a) {
    const gr = stockOf(a, 'IT-SCR-GR'), du = stockOf(a, 'IT-SCR-DUST'), fi = stockOf(a, 'IT-SCR-FILM'), reg = stockOf(a, FX.REG);
    const regPcts = get('formulas').map((f) => ((f.lines || []).find((l) => l.itemId === FX.REG) || {}).pct || 0).filter((x) => x > 0);
    const rp = regPcts.length ? Math.min.apply(null, regPcts) + '–' + Math.max.apply(null, regPcts) + '%' : '';
    const step = (n, ico, t, v, sub, href) => h(href ? 'a.scr-step' : 'div.scr-step', href ? { href } : {}, h('div.scr-step-h', {}, h('span.scr-step-ico', {}, SA.icon(ico, 'icon-sm')), h('div', {}, h('span.scr-step-n', {}, n), h('b', {}, ' ' + t))), v != null ? h('span.scr-step-v.num', {}, v) : null, sub ? h('small', {}, sub) : null);
    const glRow = (code, label, v) => h('div', {}, h('span', {}, code + ' ' + label), canCost() ? h('span.num', {}, fm.short(v)) : U.cost(v));
    return h('div', {}, U.sub('دورة الهالك — من المرحلة لحد القيد', U.demo(perTxt(a.p))),
      h('div.scr-flow', { role: 'list', 'aria-label': 'دورة الهالك' },
        step('1', 'factory', 'المرحلة', wt(a.stats.kg), num(a.stats.n) + ' تسجيل من المشغلين والمشرفين: السبب + القطع + الوزن', '#/mfg/scrap?tab=log'),
        step('2', 'warehouse', 'مخزن الهوالك والمطحون W-07', wt(gr.qty + du.qty + fi.qty), 'بالوزن عند أمين مخزن الخامات · قابلة للطحن ' + kgTxt(gr.qty) + ' · تراب ' + kgTxt(du.qty) + ' · فويل ' + kgTxt(fi.qty), '#/mfg/scrap?tab=grind'),
        step('3', 'recycle', 'الكسارة M-502', wt(a.groundIn), a.ops.length + ' دفعة طحن · فاقد الطحن ≈ 3%', '#/mfg/scrap?tab=grind'),
        step('4', 'layers', 'مطحون (Regrind)', kgTxt(reg.qty), 'رصيد جاهز للخلاطة في W-07', '#/mfg/scrap?tab=grind'),
        h('div.scr-step', {}, h('div.scr-step-h', {}, h('span.scr-step-ico', {}, SA.icon('mixer', 'icon-sm')), h('div', {}, h('span.scr-step-n', {}, '5'), h('b', {}, ' الخلاطة / بيع الزيادة'))),
          h('div.scr-split', {}, h('a', { href: '#/mfg/scrap?tab=grind' }, h('b', {}, 'رجع الخلاطة'), h('span.num', {}, kgTxt(a.regKg)), h('small', {}, 'جوه الخلطات' + (rp ? ' (' + rp + ' مطحون)' : ''))),
            h('a', { href: '#/mfg/scrap?tab=sales' }, h('b', {}, 'بيع الزيادة'), h('span.num', {}, fm.short(a.revenue)), h('small', {}, 'بموافقة المدير المالي' + (a.pending.length ? ' · ' + a.pending.length + ' بانتظار' : ''))))),
        h('div.scr-step', {}, h('div.scr-step-h', {}, h('span.scr-step-ico', {}, SA.icon('receipt', 'icon-sm')), h('div', {}, h('span.scr-step-n', {}, '6'), h('b', {}, ' القيود الآلية'))),
          h('div.scr-gl', {}, glRow('1145', 'مخزون هوالك ومطحون', GL.balance('1145')), glRow('5204', 'فاقد وهوالك التشغيل', GL.balance('5204', a.from, a.to)), glRow('4201', 'إيرادات بيع خردة', GL.balance('4201', a.from, a.to))),
          openable('fin/journal') ? h('a.erp-doc', { href: '#/fin/journal?acc=5204', style: { fontSize: '12px' } }, 'القيود في دفتر اليومية') : h('small', {}, 'كل حركة بقيد آلي'))));
  }

  /* ═════════════ page ═════════════ */
  const S0 = { p: 30, tab: 'log', log: { q: '', filters: {}, sort: { key: 'at', dir: 'desc' }, page: 1 }, grind: { q: '', sort: { key: 'at', dir: 'desc' } }, sales: { q: '', sort: { key: 'at', dir: 'desc' } } };
  const TABS = { log: 1, grind: 1, sales: 1 };
  function build(redraw) {
    const a = analysis(S0.p);
    const worst = a.stages.slice().sort((x, y) => (y.ratio || 0) - (x.ratio || 0))[0];
    const head = SA.pageHead({ title: 'الهوالك وإعادة التدوير', desc: 'كل كيلو هالك: من المرحلة اللي طلع منها ← مخزن الهوالك W-07 ← الكسارة ← يرجع الخلاطة مطحون، والزيادة تتباع بموافقة المدير المالي — وكل خطوة بقيدها.',
      tags: [U.demo('المسموح ومعدل الإنتاج بالكيلو تقديري')],
      actions: [SA.segmented([['7', 'آخر 7 أيام'], ['30', 'آخر 30 يوم']], String(S0.p), (v) => { S0.p = Number(v); redraw(); }),
        SA.btn({ label: 'تسجيل هالك', icon: 'plus', perm: 'mfg.scrap.create', onClick: () => openLog() }),
        SA.btn({ label: 'طحن دفعة', icon: 'recycle', kind: 'ghost', perm: 'mfg.scrap.recycle', onClick: () => openGrind() }),
        SA.btn({ label: 'طلب بيع', icon: 'coins', kind: 'ghost', perm: 'mfg.scrap.sell', onClick: () => openSale() })] });
    const banners = a.today.map((t) => SA.alert('danger', h('b', {}, 'النهارده: هالك ' + stName(t.stageId) + ' ' + pctT(t.rate) + ' مقابل ' + pctT(t.std) + ' مسموح (' + idxT(t.ratio) + ')'), ' — ', kgTxt(t.kg) + ' من ' + kgTxt(t.proc) + ' اتشغلت', t.machineId ? h('span', {}, ' على ', lnk(t.machineId), ' ' + mName(t.machineId)) : null));
    const gr = stockOf(a, 'IT-SCR-GR'), du = stockOf(a, 'IT-SCR-DUST'), fi = stockOf(a, 'IT-SCR-FILM'), reg = stockOf(a, FX.REG);
    const kpis = U.kpis([
      U.kpi({ label: 'الهالك — ' + perTxt(a.p), value: wt(a.stats.kg), icon: 'scale', trend: a.trend.map((x) => x.normal + x.abnormal), sub: (a.pctOut != null ? pctT(a.pctOut) + ' من الإنتاج (تقديري) · ' : '') + 'غير طبيعي ' + pctT(a.stats.kg ? a.stats.abnormalKg / a.stats.kg : null, 0), tone: worst && worst.level === 'over' ? 'warning' : null, href: '#/mfg/scrap?tab=log' }),
      U.kpi({ label: 'تكلفة الهالك', value: U.cost(a.stats.cost), icon: 'coins', sub: canCost() ? 'صافي الخسارة 5204: ' + fm.short(a.stats.cost - a.stats.recoverable) : 'التكاليف لمن يملك الصلاحية فقط', href: '#/mfg/scrap?tab=log' }),
      U.kpi({ label: 'القيمة المستردة', value: U.cost(a.stats.recoverable), icon: 'refresh', sub: canCost() ? pctT(a.stats.cost ? a.stats.recoverable / a.stats.cost : null, 0) + ' من التكلفة رجعت مخزون هوالك (1145)' : 'قيمة الهالك اللي رجع مخزن W-07', tone: 'success', href: '#/mfg/scrap?tab=grind' }),
      U.kpi({ label: 'مطحون رجع الخلاطة', value: kgTxt(a.regKg), icon: 'recycle', sub: a.mirs.length + ' إذن صرف · رصيد المطحون ' + kgTxt(reg.qty), href: '#/mfg/scrap?tab=grind' }),
      U.kpi({ label: 'رصيد مخزن الهوالك W-07', value: wt(gr.qty + du.qty + fi.qty), icon: 'warehouse', sub: 'للطحن ' + kgTxt(gr.qty) + ' · تراب ' + kgTxt(du.qty) + ' · فويل ' + kgTxt(fi.qty), href: '#/mfg/scrap?tab=grind' }),
      U.kpi({ label: 'إيراد بيع الهوالك', value: fm.short(a.revenue), icon: 'cart', sub: a.sold.length + ' بيع · ' + kgTxt(a.soldKg) + (a.pending.length ? ' · ' + a.pending.length + ' بانتظار الاعتماد' : ''), tone: a.pending.length ? 'warning' : null, href: '#/mfg/scrap?tab=sales' })
    ]);
    const att = attention(a); const ai = aiCards(a);
    const attnCard = SA.card({ title: 'يحتاج انتباهك', tags: [h('span.sap-count', {}, String(att.length))] }, att.length ? h('ul.scr-attn', {}, att.map((o) => h('li', {}, h('span.scr-attn-ico.is-' + o.tone, {}, SA.icon(o.icon, 'icon-sm')), h('div.scr-attn-b', {}, h('b', {}, o.title), o.sub ? h('small', {}, o.sub) : null, h('div.scr-attn-acts', {}, (o.links || []).filter(Boolean).map((x) => [x, ' ']), o.btn || null))))) : SA.empty({ icon: 'checkcircle', title: 'كل المراحل ضمن المسموح', text: 'مفيش بيع معلّق ولا رصيد طحن متراكم.' }));
    const aiCard = SA.card({ title: 'تحليل ذكي للهالك', tags: U.demo('محاكاة AI') }, ai.length ? h('div.scr-ai', {}, ai.map((x) => U.aiCard(x))) : h('p.scr-muted', {}, 'مفيش ملاحظات — الهالك في حدوده.'));
    const stageCard = SA.card({ title: 'الهالك حسب المرحلة — الفعلي مقابل المسموح' }, stageChart(a), h('p.scr-note', {}, SA.icon('info', 'icon-sm'), 'المسموح = الكمية الداخلة للمرحلة (تقديري: إنتاج السحب اليومي × وزن خلطة الوحدة × نصيب الضلفة/الحلق) × النسبة المعيارية للمرحلة. المنطقة المظللة سماحية 10%.', U.demo('النسب المعيارية تجريبية')));
    const trendCard = SA.card({ title: 'اتجاه الهالك اليومي (كجم)' }, trendChart(a), h('p.scr-note', {}, 'غير الطبيعي = أي سبب غير القصاصات والتراب وبداية التشغيل — ده اللي بيتحاسب عليه.'));
    const paretoCard = SA.card({ title: 'باريتو أسباب الهالك' }, paretoChart(a));
    const machCard = SA.card({ title: 'حسب الماكينة — % من المسموح' }, machineChart(a), h('p.scr-note', {}, 'اضغط على الماكينة لعرض سجلاتها.'));
    const shiftCard = SA.card({ title: 'حسب الوردية والخط' }, shiftChart(a));
    const tabsCard = tabsBlock(a);
    kpis.classList.add('scr-kpis');
    return h('div.scr-page', {}, head, banners.length ? h('div.scr-today', {}, banners) : null, kpis, flowStrip(a), U.grid(2, attnCard, aiCard), U.grid(2, stageCard, h('div.scr-col', {}, trendCard, machCard)), U.grid(2, paretoCard, shiftCard), tabsCard);
  }

  /* ═════════════ tabs ═════════════ */
  function tabsBlock(a) {
    const host = h('div.scr-panel');
    const draw = () => { SA.clear(host); host.append(S0.tab === 'grind' ? grindPanel(a) : S0.tab === 'sales' ? salesPanel(a) : logPanel(a)); };
    const tabs = SA.tabs({ label: 'سجلات الهوالك', active: S0.tab, tabs: [{ id: 'log', label: 'سجل الهوالك', icon: 'list', badge: a.logs.length }, { id: 'grind', label: 'الطحن', icon: 'recycle', badge: a.ops.length }, { id: 'sales', label: 'بيع الهوالك', icon: 'coins', badge: a.pending.length + a.approved.length || null }], onChange: (id) => { S0.tab = id; draw(); } });
    draw();
    return h('section.card.sap-card.scr-tabs-card', { id: 'scr-tabs' }, h('div.sap-card-body', {}, tabs.el, host));
  }
  function logPanel(a) {
    const all = get('scrapLogs'); let tbl = null;
    const rowsFn = () => { const q = tbl ? tbl.getState().q : S0.log.q; return q ? all : a.logs; };
    const present = (k) => Array.from(new Set(all.map((l) => l[k]).filter(Boolean)));
    const sumHost = h('p.scr-sum');
    const drawSum = () => { SA.clear(sumHost); const rows = tbl ? tbl.filteredRows() : []; sumHost.append(h('span', {}, h('b.num', {}, num(rows.length)), ' تسجيل'), h('span', {}, 'الوزن ', h('b.num', {}, kgTxt(sum(rows, (r) => r.kg)))), h('span', {}, 'غير طبيعي ', h('b.num', {}, kgTxt(sum(rows.filter((r) => !r.normal), (r) => r.kg)))), canCost() ? h('span', {}, 'التكلفة ', h('b.num', {}, fm.money(sum(rows, (r) => r.cost)))) : null, h('span', {}, tbl && tbl.getState().q ? 'البحث في كل السجلات' : 'الفترة: ' + perTxt(a.p))); };
    const cols = [
      { key: 'at', label: 'التاريخ', sort: true, value: (r) => r.at, render: (r) => h('div.scr-stack', {}, h('b.num', {}, shortDate(r.date)), h('small.num', {}, SA.fmt.time(r.at) + ' · ' + r.shift)) },
      { key: 'id', label: 'الرقم', sort: true, render: (r) => h('span.scr-id', {}, r.id) },
      { key: 'stage', label: 'المرحلة', sort: true, value: (r) => (FX.STAGES[r.stageId] || {}).order, render: (r) => h('div.scr-stack', {}, h('b', {}, stName(r.stageId)), r.track && r.track !== 'main' ? h('small', {}, FX.TRACKS[r.track]) : null) },
      { key: 'machine', label: 'الماكينة', sort: true, value: (r) => r.machineId || '', render: (r) => (r.machineId ? lnk(r.machineId) : '—') },
      { key: 'wo', label: 'أمر التشغيل', render: (r) => (r.woId ? lnk(r.woId) : SA.chip('خارج أمر', 'neutral')) },
      { key: 'item', label: 'المنتج', render: (r) => h('span', { style: { fontSize: '12.5px' } }, itemShort(r.itemId)) },
      { key: 'reason', label: 'السبب', render: (r) => h('div.scr-stack', {}, h('span', { style: { fontSize: '12.5px' } }, FX.reasonLabel(r.reasonId)), normChip(r.normal)) },
      { key: 'qty', label: 'قطع', sort: true, class: 'scr-r', render: (r) => (r.qty ? h('span.num', {}, num(r.qty)) : '—') },
      { key: 'kg', label: 'الوزن', sort: true, class: 'scr-r', render: (r) => h('b.num', {}, kgTxt(r.kg)) },
      { key: 'cost', label: 'التكلفة', sort: canCost(), class: 'scr-r', render: (r) => U.cost(r.cost) },
      { key: 'by', label: 'بواسطة', render: (r) => h('span', { style: { fontSize: '12.5px' } }, userName(r.by)) }
    ];
    tbl = SA.table({ caption: 'سجل الهوالك', columns: cols, rows: rowsFn, pageSize: 10,
      search: { placeholder: 'بحث: رقم، أمر تشغيل، ماكينة، سبب، منتج…', keys: (r, q) => [r.id, r.woId, r.machineId, stName(r.stageId), FX.reasonLabel(r.reasonId), itemShort(r.itemId), r.note, userName(r.by)].some((v) => String(v || '').toLowerCase().indexOf(q) >= 0) },
      filters: [
        { key: 'stage', label: 'المرحلة', options: present('stageId').sort((x, y) => (FX.STAGES[x] || {}).order - (FX.STAGES[y] || {}).order).map((s) => [s, stName(s)]), test: (r, v) => r.stageId === v },
        { key: 'line', label: 'الخط', options: get('lines').map((l) => [l.id, l.id + ' · ' + l.name]), test: (r, v) => r.lineId === v },
        { key: 'machine', label: 'الماكينة', options: present('machineId').sort().map((m) => [m, m + ' · ' + mName(m)]), test: (r, v) => r.machineId === v },
        { key: 'reason', label: 'السبب', options: FX.REASONS.map((r) => [r.id, r.label]), test: (r, v) => r.reasonId === v },
        { key: 'normal', label: 'النوع', options: [['1', 'طبيعي (متوقع)'], ['0', 'غير طبيعي']], test: (r, v) => (v === '1') === !!r.normal },
        { key: 'shift', label: 'الوردية', options: [['A', 'وردية A'], ['B', 'وردية B'], ['C', 'وردية C']], test: (r, v) => r.shift === v }
      ],
      initial: { q: S0.log.q, filters: S0.log.filters, sort: S0.log.sort, page: S0.log.page },
      onChange: (s) => { Object.assign(S0.log, s); drawSum(); },
      onRowClick: (r) => logDrawer(r.id),
      empty: { icon: 'checkcircle', title: 'لا يوجد هالك مسجل في الفترة', text: 'التسجيل بيتم من تقارير المراحل أو «تسجيل هالك» هنا.' } });
    drawSum();
    const csv = () => { const rows = tbl.filteredRows(); const head = ['الرقم', 'التاريخ', 'الوردية', 'المرحلة', 'المسار', 'الخط', 'الماكينة', 'أمر التشغيل', 'المنتج', 'السبب', 'النوع', 'قطع', 'كجم'].concat(canCost() ? ['التكلفة', 'المستردة'] : []).concat(['بواسطة']);
      SA.download('scrap-log-' + ERP.day(0) + '.csv', '﻿' + SA.csv([head].concat(rows.map((r) => [r.id, r.date, r.shift, stName(r.stageId), FX.TRACKS[r.track] || '', r.lineId || '', r.machineId || '', r.woId || '', itemShort(r.itemId), FX.reasonLabel(r.reasonId), r.normal ? 'طبيعي' : 'غير طبيعي', r.qty, r.kg].concat(canCost() ? [r.cost, r.recoverable] : []).concat([userName(r.by)])))), 'text/csv'); };
    return h('div', {}, h('div.scr-bigbar', {}, SA.btn({ label: 'تسجيل هالك خارج أمر تشغيل', icon: 'plus', kind: 'primary', perm: 'mfg.scrap.create', onClick: () => openLog() }), SA.btn({ label: 'تصدير CSV', icon: 'download', kind: 'ghost', onClick: csv }), h('span.scr-muted', {}, 'هالك المراحل بيتسجل تلقائي من تقارير المراحل — التسجيل اليدوي للتنظيف وتغيير اللون والتجارب.')), sumHost, tbl.el);
  }
  function grindPanel(a) {
    const gr = stockOf(a, 'IT-SCR-GR'), reg = stockOf(a, FX.REG); const regDays = a.weekNeed > 0 ? reg.qty / (a.weekNeed / 7) : null;
    const stats = h('div.scr-stats', {},
      stat('هوالك قابلة للطحن (متاح)', kgTxt(gr.avail), 'في W-07 بعد حجز طلبات البيع', gr.avail >= a.batch ? 'warning' : null),
      stat('مطحون جاهز للخلاطة', kgTxt(reg.qty), regDays != null ? 'يكفي ≈ ' + Math.round(regDays) + ' يوم بمعدل الصرف الحالي' : '', regDays != null && regDays < 5 ? 'danger' : 'success'),
      stat('اتطحن في الفترة', kgTxt(a.groundIn), 'ناتج ' + kgTxt(a.groundOut) + ' · فاقد ' + kgTxt(a.groundIn - a.groundOut)),
      stat('رجع الخلاطة في الفترة', kgTxt(a.regKg), a.mirs.length + ' إذن صرف · احتياج ≈ ' + kgTxt(a.weekNeed) + '/أسبوع'));
    let tbl = null;
    tbl = SA.table({ caption: 'دفعات الطحن', rows: () => get('scrapOps'), pageSize: 10,
      columns: [
        { key: 'id', label: 'الرقم', sort: true, render: (o) => h('span.scr-id', {}, o.id) },
        { key: 'at', label: 'التاريخ', sort: true, render: (o) => h('span.num', {}, SA.fmt.dt(o.at)) },
        { key: 'kgIn', label: 'هوالك داخلة', sort: true, class: 'scr-r', render: (o) => h('span.num', {}, kgTxt(o.kgIn)) },
        { key: 'kgOut', label: 'مطحون ناتج', sort: true, class: 'scr-r', render: (o) => h('b.num', {}, kgTxt(o.kgOut)) },
        { key: 'loss', label: 'فاقد الطحن', class: 'scr-r', value: (o) => o.kgIn - o.kgOut, render: (o) => h('span.num', {}, kgTxt(o.kgIn - o.kgOut) + ' (' + pctT((o.kgIn - o.kgOut) / (o.kgIn || 1)) + ')') },
        { key: 'val', label: 'القيمة', class: 'scr-r', render: (o) => U.cost(o.kgIn * ((ERP.item('IT-SCR-GR') || {}).stdCost || 0)) },
        { key: 'm', label: 'الماكينة', render: (o) => lnk(o.machineId || 'M-502') },
        { key: 'by', label: 'بواسطة', render: (o) => userName(o.by) }
      ],
      search: { placeholder: 'بحث برقم الدفعة أو ملاحظة…', keys: ['id', 'note', (o) => userName(o.by)] }, initial: { q: S0.grind.q, sort: S0.grind.sort }, onChange: (s) => Object.assign(S0.grind, s),
      onRowClick: (o) => grindDrawer(o.id), empty: { icon: 'recycle', title: 'لا توجد دفعات طحن', action: { label: 'طحن دفعة', icon: 'recycle', perm: 'mfg.scrap.recycle', onClick: () => openGrind() } } });
    const fms = get('formulas').map((f) => ({ f, pct: ((f.lines || []).find((l) => l.itemId === FX.REG) || {}).pct || 0 })).filter((x) => x.pct > 0).sort((x, y) => y.pct - x.pct);
    const fTbl = h('div.table-wrap', {}, h('table.table.scr-mini', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الخلطة'), h('th', {}, 'الاستخدام'), h('th.scr-r', {}, 'مطحون في التركيبة'), h('th.scr-r', {}, 'الحد الأقصى'))),
      h('tbody', {}, fms.map((x) => h('tr', {}, h('td', {}, lnk(x.f.id), ' ', h('small.scr-muted', {}, x.f.name)), h('td', { style: { fontSize: '12.5px' } }, x.f.uses || ''), h('td.scr-r', {}, h('b.num', {}, x.pct + '%')), h('td.scr-r', {}, h('span.num', {}, pctT(x.f.regMaxPct, 0))))))));
    const mTbl = a.mirs.length ? h('div.table-wrap', {}, h('table.table.scr-mini', {}, h('thead', {}, h('tr', {}, h('th', {}, 'إذن الصرف'), h('th', {}, 'أمر التشغيل'), h('th', {}, 'التاريخ'), h('th.scr-r', {}, 'مطحون اتصرف للخلاطة'))),
      h('tbody', {}, a.mirs.slice().sort((x, y) => (x.m.issuedAt < y.m.issuedAt ? 1 : -1)).slice(0, 8).map((x) => h('tr', {}, h('td', {}, lnk(x.m.id)), h('td', {}, lnk(x.m.woId)), h('td.num', {}, ERP.fmt.date(x.m.issuedAt)), h('td.scr-r', {}, h('b.num', {}, kgTxt(x.kg)))))))) : h('p.scr-muted', {}, 'مفيش مطحون اتصرف للخلاطة في الفترة.');
    return h('div', {}, stats, h('div.scr-bigbar', {}, SA.btn({ label: 'طحن دفعة على الكسارة M-502', icon: 'recycle', kind: 'primary', perm: 'mfg.scrap.recycle', onClick: () => openGrind() }), h('span.scr-muted', {}, 'الطحن بيحوّل الهوالك القابلة للطحن لمطحون يرجع الخلاطة (فاقد ≈ 3%) — قيد آلي من 1145 إلى 1141.')), tbl.el,
      U.grid(2, h('div', {}, h('h4.scr-sub', {}, 'المطحون جوه الخلطات'), fTbl), h('div', {}, h('h4.scr-sub', {}, 'رجع الخلاطة — آخر أذون الصرف'), mTbl)));
  }
  function salesPanel(a) {
    const sales = get('scrapSales');
    const stats = h('div.scr-stats', {},
      stat('بانتظار اعتماد المالية', num(a.pending.length), a.pending.length ? fm.money(sum(a.pending, (s) => s.total)) : 'لا يوجد', a.pending.length ? 'warning' : null),
      stat('معتمد — جاهز للتسليم', num(a.approved.length), a.approved.length ? kgTxt(sum(a.approved, (s) => sum(s.lines, (l) => l.kg))) : 'لا يوجد', a.approved.length ? 'warning' : null),
      stat('اتباع في الفترة', fm.short(a.revenue), kgTxt(a.soldKg) + ' · ' + a.sold.length + ' عملية'),
      stat('ربح فوق القيمة الدفترية (4201)', canCost() ? fm.short(a.gain) : 'سري', canCost() ? 'القيمة الدفترية ' + fm.short(a.revenue - a.gain) : 'لمن يملك صلاحية التكاليف', canCost() ? 'success' : null));
    let tbl = null;
    tbl = SA.table({ caption: 'بيع الهوالك', rows: () => sales, pageSize: 10,
      columns: [
        { key: 'id', label: 'الرقم', sort: true, render: (s) => h('span.scr-id', {}, s.id) },
        { key: 'at', label: 'التاريخ', sort: true, render: (s) => h('span.num', {}, ERP.fmt.date(s.at)) },
        { key: 'buyer', label: 'المشتري', sort: true, render: (s) => h('b', { style: { fontSize: '13px' } }, s.buyer) },
        { key: 'lines', label: 'الأصناف', render: (s) => h('div.scr-stack', {}, s.lines.map((l) => h('small', {}, itemShort(l.itemId) + ' · ' + kgTxt(l.kg) + ' × ' + l.price + ' ج.م'))) },
        { key: 'kg', label: 'الكمية', class: 'scr-r', value: (s) => sum(s.lines, (l) => l.kg), sort: true, render: (s) => h('span.num', {}, kgTxt(sum(s.lines, (l) => l.kg))) },
        { key: 'total', label: 'قيمة البيع', sort: true, class: 'scr-r', render: (s) => U.money(s.total) },
        { key: 'book', label: 'القيمة الدفترية', class: 'scr-r', render: (s) => U.cost(s.bookValue) },
        { key: 'status', label: 'الحالة', sort: true, render: (s) => U.status('scrapsale', s.status) },
        { key: 'ap', label: 'الاعتماد', render: (s) => (s.approvalId ? lnk(s.approvalId) : h('span.scr-muted', {}, 'سجل سابق')) },
        { key: 'act', label: '', render: (s) => { const ap = apOf(s); return s.status === 'approved' ? SA.btn({ label: 'تسليم للمشتري', icon: 'truck', kind: 'primary', size: 'sm', perm: 'mfg.scrap.sell', onClick: () => deliver(s.id) }) : s.status === 'pending_approval' && canDecide(ap) ? SA.btn({ label: 'اعتماد', icon: 'check', kind: 'ghost', size: 'sm', onClick: () => SA.approvals.decide(ap.id, 'approve') }) : null; } }
      ],
      search: { placeholder: 'بحث بالرقم أو المشتري…', keys: ['id', 'buyer', 'approvalId', 'note'] },
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(SA.catalog.status.scrapsale || {}).map((k) => [k, SA.catalog.status.scrapsale[k][0]]), test: (s, v) => s.status === v }],
      initial: { q: S0.sales.q, sort: S0.sales.sort }, onChange: (s) => Object.assign(S0.sales, s), onRowClick: (s) => saleDrawer(s.id),
      empty: { icon: 'coins', title: 'لا توجد عمليات بيع', action: { label: 'طلب بيع', icon: 'plus', perm: 'mfg.scrap.sell', onClick: () => openSale() } } });
    return h('div', {}, stats, h('div.scr-bigbar', {}, SA.btn({ label: 'طلب بيع هوالك', icon: 'coins', kind: 'primary', perm: 'mfg.scrap.sell', onClick: () => openSale() }), h('span.scr-muted', {}, 'البيع للزيادة بس بعد احتياج الخلاطة — الطلب بيروح للمدير المالي، والمخزون مش بيخرج إلا بعد الاعتماد والتسليم بالوزن.')), tbl.el);
  }

  /* ═════════════ drawers ═════════════ */
  const jeOf = (id) => get('journal').find((j) => j.ref && j.ref.id === id) || null;
  const movesOf = (id) => get('stockMoves').filter((m) => m.ref && m.ref.id === id);
  const jeLink = (id, fallbackMemo) => { const je = jeOf(id) || (fallbackMemo ? get('journal').find((j) => fallbackMemo.test(j.memo || '')) : null); return je ? h('span', {}, lnk(je.id), jeOf(id) ? '' : h('small.scr-muted', {}, ' (قيد ملخص)')) : h('span.scr-muted', {}, '—'); };
  function logDrawer(id) {
    const r = ERP.find('scrapLogs', id); if (!r) { SA.toast('السجل ' + id + ' غير موجود', 'warn'); return; }
    const wo = r.woId ? ERP.find('workOrders', r.woId) : null; const mc = r.machineId ? ERP.machine(r.machineId) : null; const si = ERP.item(r.scrapItemId) || {};
    const mv = movesOf(r.id)[0]; const same = wo ? get('scrapLogs').filter((x) => x.woId === r.woId && x.id !== r.id).slice(0, 6) : [];
    const body = h('div', {},
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' } }, SA.chip(stName(r.stageId), 'info'), normChip(r.normal), r.woId ? null : SA.chip('خارج أمر تشغيل', 'neutral')),
      SA.kv([['التاريخ والوقت', h('span.num', {}, SA.fmt.dt(r.at))], ['المرحلة', FX.stageName(r.stageId) + (r.track && r.track !== 'main' ? ' — ' + FX.TRACKS[r.track] : '')], ['الخط', r.lineId ? lnk(r.lineId, r.lineId + ' · ' + ((ERP.line(r.lineId) || {}).name || '')) : '—'],
        ['الماكينة', mc ? h('span', {}, lnk(mc.id), ' ' + mc.name + ' ', U.status('machine', mc.status)) : '—'], ['الوردية', SHIFTS[r.shift] || r.shift], ['أمر التشغيل', wo ? h('span', {}, lnk(wo.id), ' ', U.status('wo', wo.status)) : 'بدون — تسجيل يدوي'],
        ['المنتج', r.itemId ? U.itemCell(r.itemId) : '—'], ['السبب', FX.reasonLabel(r.reasonId)], ['القطع', r.qty ? num(r.qty) + ' قطعة' : '—'], ['الوزن', h('b.num', {}, kgTxt(r.kg))],
        ['صنف المخزن', h('span', {}, si.name || r.scrapItemId, ' ', h('small.scr-muted', {}, '→ ' + ERP.whName(FX.SCRAP_WH)))], ['المسموح للمرحلة', pctT(FX.stdPct(r.stageId))], ['بواسطة', userName(r.by)], r.note ? ['ملاحظة', r.note] : null]),
      h('h4.scr-sub', {}, 'التكلفة والقيد'),
      SA.kv([['تكلفة الهالك', U.cost(r.cost)], ['القيمة المستردة (1145)', U.cost(r.recoverable)], ['صافي الخسارة (5204)', U.cost(r.cost - r.recoverable)], ['القيد', jeLink(r.id, /إجمالي هوالك التشغيل/)], ['حركة المخزون', mv ? h('span.num', {}, (mv.qty > 0 ? '+' : '') + kgTxt(mv.qty) + ' ← ' + mv.whId + ' · رصيد ' + kgTxt(mv.balance)) : h('span.scr-muted', {}, 'ضمن الرصيد الافتتاحي لمخزن الهوالك')]]),
      h('div.scr-flowmini', {}, h('span', {}, stName(r.stageId)), SA.icon('arrowleft', 'icon-sm'), h('span', {}, 'W-07 · ' + (si.name || '')), SA.icon('arrowleft', 'icon-sm'), h('span', {}, r.scrapItemId === 'IT-SCR-GR' ? 'الكسارة ← الخلاطة' : 'بيع (بموافقة المالية)')),
      same.length ? h('div', {}, h('h4.scr-sub', {}, 'هالك تاني على نفس أمر التشغيل'), h('ul.scr-attn', {}, same.map((x) => h('li', {}, h('div.scr-attn-b', {}, h('b', {}, stName(x.stageId) + ' · ' + kgTxt(x.kg)), h('small', {}, x.id + ' · ' + FX.reasonLabel(x.reasonId) + ' · ' + SA.fmt.rel(x.at))), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { dr.close(); logDrawer(x.id); } }, 'فتح'))))) : null);
    const dr = SA.drawer({ title: r.id, subtitle: 'هالك ' + stName(r.stageId) + ' — ' + kgTxt(r.kg), size: 'md', body,
      foot: [wo && openable('mfg/workorders/' + wo.id) ? h('a.btn.btn-ghost', { href: '#/mfg/workorders/' + wo.id, onclick: () => dr.close() }, 'أمر التشغيل') : null, mc && openable('care/assets/' + mc.id) ? h('a.btn.btn-ghost', { href: '#/care/assets/' + mc.id, onclick: () => dr.close() }, 'الماكينة') : null, h('button.btn.btn-primary', { type: 'button', onclick: () => dr.close() }, 'إغلاق')].filter(Boolean) });
  }
  function grindDrawer(id) {
    const o = ERP.find('scrapOps', id); if (!o) { SA.toast('الدفعة ' + id + ' غير موجودة', 'warn'); return; }
    const vIn = o.kgIn * ((ERP.item('IT-SCR-GR') || {}).stdCost || 0), vOut = o.kgOut * ((ERP.item(FX.REG) || {}).stdCost || 0);
    const body = h('div', {}, SA.kv([['التاريخ', h('span.num', {}, SA.fmt.dt(o.at))], ['الماكينة', h('span', {}, lnk(o.machineId || 'M-502'), ' ' + mName(o.machineId || 'M-502'))], ['هوالك داخلة', h('b.num', {}, kgTxt(o.kgIn))], ['مطحون ناتج', h('b.num', {}, kgTxt(o.kgOut))], ['فاقد الطحن', kgTxt(o.kgIn - o.kgOut) + ' (' + pctT((o.kgIn - o.kgOut) / (o.kgIn || 1)) + ')'], ['بواسطة', userName(o.by)], o.note ? ['ملاحظة', o.note] : null]),
      h('h4.scr-sub', {}, 'القيد'), SA.kv([['من ح/ مخزون خامات 1141 (مطحون)', U.cost(vOut)], ['من ح/ فاقد وهوالك 5204 (فاقد الطحن)', U.cost(Math.max(0, vIn - vOut))], ['إلى ح/ مخزون هوالك ومطحون 1145', U.cost(vIn)], ['رقم القيد', jeLink(o.id, /طحن هوالك/)]]),
      h('div.scr-flowmini', {}, h('span', {}, 'W-07 هوالك قابلة للطحن'), SA.icon('arrowleft', 'icon-sm'), h('span', {}, 'الكسارة'), SA.icon('arrowleft', 'icon-sm'), h('span', {}, 'W-07 مطحون'), SA.icon('arrowleft', 'icon-sm'), h('span', {}, 'إذن صرف ← الخلاطة')));
    const dr = SA.drawer({ title: o.id, subtitle: 'دفعة طحن — ' + kgTxt(o.kgIn), size: 'md', body, foot: [h('button.btn.btn-primary', { type: 'button', onclick: () => dr.close() }, 'إغلاق')] });
  }
  function saleDrawer(id) {
    const s = ERP.find('scrapSales', id); if (!s) { SA.toast('البيع ' + id + ' غير موجود', 'warn'); return; }
    const ap = apOf(s); const kg = sum(s.lines, (l) => l.kg);
    const steps = ['طلب البيع', 'اعتماد المدير المالي', 'الوزن والتسليم', 'القيد'];
    const cur = s.status === 'pending_approval' ? 1 : s.status === 'approved' ? 2 : s.status === 'sold' ? 4 : 1;
    const body = h('div', {}, h('div', { style: { marginBottom: '12px' } }, U.status('scrapsale', s.status)), s.status === 'rejected' ? SA.alert('danger', 'الطلب اترفض من المدير المالي' + (ap && ap.chain && ap.chain[0] && ap.chain[0].reason ? ': ' + ap.chain[0].reason : '') + '.') : SA.stepper(steps, cur),
      SA.kv([['المشتري', h('b', {}, s.buyer)], s.phone ? ['الهاتف', h('span.num', { dir: 'ltr' }, s.phone)] : null, ['التاريخ', h('span.num', {}, SA.fmt.dt(s.at))], ['مقدّم الطلب', userName(s.by)], ['الاعتماد', ap ? h('span', {}, lnk(ap.id), ' ', SA.statusChip('approval', ap.status)) : 'سجل سابق (قبل النظام)'], s.soldAt ? ['التسليم', h('span.num', {}, SA.fmt.dt(s.soldAt) + ' · ' + userName(s.soldBy))] : null, s.note ? ['ملاحظة', s.note] : null]),
      h('div.table-wrap', { style: { marginTop: '12px' } }, h('table.table.scr-mini', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الصنف'), h('th.scr-r', {}, 'الكمية × السعر'), h('th.scr-r', {}, 'الإجمالي'))),
        h('tbody', {}, s.lines.map((l) => h('tr', {}, h('td', {}, itemShort(l.itemId)), h('td.scr-r.num', {}, kgTxt(l.kg) + ' × ' + l.price), h('td.scr-r', {}, U.money(l.kg * l.price))))),
        h('tfoot', {}, h('tr', {}, h('td', {}, h('b', {}, 'الإجمالي')), h('td.scr-r', {}, h('b.num', {}, kgTxt(kg))), h('td.scr-r', {}, h('b', {}, U.money(s.total))))))),
      h('h4.scr-sub', {}, 'القيد عند التسليم'), SA.kv([['من ح/ النقدية 1101', U.money(s.total)], ['إلى ح/ مخزون هوالك 1145 (القيمة الدفترية)', U.cost(s.bookValue)], ['إلى ح/ إيرادات بيع خردة 4201 (الفرق)', U.cost(s.total - s.bookValue)], ['رقم القيد', s.status === 'sold' ? jeLink(s.id, new RegExp(s.id)) : h('span.scr-muted', {}, 'بعد التسليم')]]));
    const foot = [];
    if (s.status === 'pending_approval' && canDecide(ap)) foot.push(SA.btn({ label: 'رفض', icon: 'x', kind: 'ghost', onClick: async () => { const ok = await SA.approvals.decide(ap.id, 'reject'); if (ok) dr.close(); } }), SA.btn({ label: 'اعتماد البيع', icon: 'check', kind: 'primary', onClick: async () => { const ok = await SA.approvals.decide(ap.id, 'approve'); if (ok) dr.close(); } }));
    else if (s.status === 'pending_approval' && ap && openable('approvals/' + ap.id)) foot.push(h('a.btn.btn-ghost', { href: '#/approvals/' + ap.id, onclick: () => dr.close() }, 'فتح طلب الاعتماد'));
    if (s.status === 'approved') foot.push(SA.btn({ label: 'تسليم للمشتري', icon: 'truck', kind: 'primary', perm: 'mfg.scrap.sell', onClick: async () => { dr.close(); deliver(s.id); } }));
    foot.push(h('button.btn.btn-ghost', { type: 'button', onclick: () => dr.close() }, 'إغلاق'));
    const dr = SA.drawer({ title: s.id, subtitle: 'بيع هوالك — ' + s.buyer, size: 'md', body, foot });
  }
  function openRecord(id) { if (/^SCR-/.test(id)) logDrawer(id); else if (/^SS-/.test(id)) saleDrawer(id); else if (/^RG-/.test(id)) grindDrawer(id); }

  /* ═════════════ actions ═════════════ */
  function openLog(pre) {
    pre = pre || {};
    if (!SA.can('mfg.scrap.create')) { SA.toast('ليست من صلاحياتك (mfg.scrap.create)', 'warn'); return; }
    const b = base(); let stage = pre.stageId || 'ST-EXT'; let shift = shiftNow();
    const openWOs = get('workOrders').filter((w) => ['released', 'in_progress', 'on_hold'].indexOf(w.status) >= 0 && w.issued);
    const fStage = SA.form.field({ name: 'stage', label: 'المرحلة', type: 'select', value: stage, required: true, options: Object.keys(FX.STAGES).map((id) => [id, FX.stageName(id)]), onChange: (v) => { stage = v; sync(); } });
    const fWo = SA.form.field({ name: 'wo', label: 'أمر التشغيل (اختياري)', type: 'select', value: pre.woId || '', options: [['', 'بدون — تنظيف / تغيير لون / تجارب']].concat(openWOs.map((w) => [w.id, w.id + ' — ' + ERP.itemName(w.itemId)])), onChange: () => sync() });
    const fFam = SA.form.field({ name: 'fam', label: 'العائلة', type: 'select', value: 'door', options: FAMS.map((f) => [f, ERP.families[f]]), onChange: () => sync() });
    const fTrack = SA.form.field({ name: 'track', label: 'المسار', type: 'select', value: 'leaf', options: [['leaf', FX.TRACKS.leaf], ['frame', FX.TRACKS.frame], ['main', FX.TRACKS.main]], onChange: () => preview() });
    const fMach = SA.form.field({ name: 'machine', label: 'الماكينة', type: 'select', options: [['', '—']], onChange: () => preview() });
    const fReason = SA.form.field({ name: 'reason', label: 'السبب', type: 'select', required: true, options: [['', 'اختر السبب…']], onChange: () => preview() });
    const fKg = SA.form.field({ name: 'kg', label: 'الوزن (كجم)', type: 'number', min: 0, required: true, class: 'scr-numin', onInput: () => preview() });
    const fQty = SA.form.field({ name: 'qty', label: 'عدد القطع (لو قطع كاملة)', type: 'number', min: 0, value: 0, onInput: () => preview() });
    const fNote = SA.form.field({ name: 'note', label: 'ملاحظة', type: 'textarea', rows: 2, placeholder: 'مثال: تغيير لون من جوز داكن لأبيض ثلجي…' });
    const quick = h('div.scr-quick', {}, [1, 5, 10, 25].map((n) => h('button.btn.btn-ghost', { type: 'button', onclick: () => { fKg.set(Math.round(((Number(fKg.get()) || 0) + n) * 10) / 10); preview(); } }, '+' + n + ' كجم')));
    const prev = h('div.scr-prev');
    const itemNow = () => { const w = fWo.get() ? ERP.find('workOrders', fWo.get()) : null; return w ? w.itemId : (b.R[fFam.get()] || {}).id; };
    const fill = (f, opts, keep) => { const sel = f.input; const cur = keep ? sel.value : ''; SA.clear(sel); opts.forEach((o) => sel.appendChild(h('option', { value: o[0] }, o[1]))); if (opts.some((o) => o[0] === cur)) sel.value = cur; };
    function sync() {
      const w = fWo.get() ? ERP.find('workOrders', fWo.get()) : null; fFam.el.hidden = !!w; const itemId = itemNow(); const route = FX.routeOf(itemId).filter((s) => s.stageId === stage);
      const tracks = Array.from(new Set(route.map((s) => s.track))); fill(fTrack, (tracks.length ? tracks : ['main']).map((t) => [t, FX.TRACKS[t]]), true); fTrack.el.hidden = tracks.length <= 1;
      const all = FX.machinesOf(stage); const ln = route[0] ? route[0].lineId : null; const ms = ln && all.some((m) => m.lineId === ln) ? all.filter((m) => m.lineId === ln) : all; fill(fMach, [['', ms.length ? 'اختر الماكينة…' : '—']].concat(ms.map((m) => [m.id, m.id + ' · ' + m.name])), true); if (ms.length === 1) fMach.set(ms[0].id);
      fill(fReason, [['', 'اختر السبب…']].concat(FX.reasonsFor(stage).map((r) => [r.id, r.label + (r.normal ? ' — طبيعي' : '')])), true);
      preview();
    }
    function preview() {
      SA.clear(prev); const itemId = itemNow(); const rs = FX.reason(fReason.get()); const s = FX.stage(stage) || {}; const kg = Number(fKg.get()) || 0, qty = Number(fQty.get()) || 0;
      const inRoute = FX.routeOf(itemId).some((x) => x.stageId === stage); const si = ERP.item((rs && rs.scrapItemId) || s.scrapItemId || 'IT-SCR-GR') || {};
      const it = ERP.item(itemId) || {}; const cost = Math.round(qty > 0 ? qty * (it.stdCost || 0) * FX.trackShare(fTrack.get()) * (s.costShare || 1) : kg * FX.compoundCostKg(itemId));
      prev.append(rs ? normChip(rs.normal) : SA.chip('اختر السبب', 'neutral'), h('span', {}, 'يدخل ', h('b', {}, ERP.whName(FX.SCRAP_WH)), ' كـ «' + (si.name || '') + '» بالوزن ' + kgTxt(kg)),
        h('span', {}, 'التكلفة التقديرية: ', U.cost(cost), ' · المسموح للمرحلة ' + pctT(s.stdPct)),
        !inRoute ? SA.alert('warning', 'المرحلة دي مش في مسار ' + (ERP.families[famOf(itemId)] || 'المنتج') + ' — راجع المرحلة أو أمر التشغيل.') : null,
        h('small.scr-muted', {}, 'قيد آلي: من ح/ مخزون هوالك 1145 (المسترد) + ح/ فاقد وهوالك 5204 (الخسارة) إلى ح/ إنتاج تحت التشغيل 1142.'));
    }
    sync(); if (pre.reasonId) fReason.set(pre.reasonId); preview();
    const md = SA.modal({ title: 'تسجيل هالك', subtitle: 'هالك خارج تقارير المراحل — تنظيف، تغيير لون، تجارب', icon: 'scale', size: 'lg',
      body: h('div', {}, h('div.scr-form', {}, fStage.el, fWo.el, fFam.el, fTrack.el, fMach.el, fReason.el), h('div.scr-form', {}, h('div', {}, fKg.el, quick), fQty.el), h('p.label', {}, 'الوردية'), h('div.scr-seg', {}, SA.segmented(['A', 'B', 'C'].map((k) => [k, SHIFTS[k]]), shift, (v) => { shift = v; })), fNote.el, prev),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'تسجيل الهالك', icon: 'check', perm: 'mfg.scrap.create', onClick: async () => {
        if (!SA.form.group([fStage, fReason, fKg]).validate()) return; const kg = Number(fKg.get()) || 0; if (kg <= 0) return fKg.error('أدخل الوزن بالكيلو');
        const w = fWo.get() ? ERP.find('workOrders', fWo.get()) : null; const itemId = itemNow(); const step = FX.routeOf(itemId).find((x) => x.stageId === stage && x.track === fTrack.get()) || FX.routeOf(itemId).find((x) => x.stageId === stage);
        if (!step) return fStage.error('المرحلة دي مش في مسار المنتج');
        const mc = fMach.get() ? ERP.machine(fMach.get()) : null;
        let rec; try { rec = await SA.api(() => FX.logScrap({ woId: w ? w.id : null, itemId, stageId: stage, track: step.track, lineId: step.lineId || (mc && mc.lineId) || null, machineId: fMach.get() || null, shift, qty: Number(fQty.get()) || 0, kg, reasonId: fReason.get(), note: fNote.get() })); } catch (e) { return SA.fail(e); }
        md.close(); SA.toast('اتسجل ' + rec.id + ' — ' + kgTxt(kg) + ' دخلت ' + ERP.whName(FX.SCRAP_WH), 'success');
      } })] });
  }
  function openGrind() {
    if (!SA.can('mfg.scrap.recycle')) { SA.toast('ليست من صلاحياتك (mfg.scrap.recycle)', 'warn'); return; }
    const avail = FX.scrapAvail('IT-SCR-GR'); if (avail <= 0) { SA.toast('مفيش هوالك قابلة للطحن في ' + ERP.whName(FX.SCRAP_WH), 'warn'); return; }
    const grC = (ERP.item('IT-SCR-GR') || {}).stdCost || 0, regC = (ERP.item(FX.REG) || {}).stdCost || 0;
    const fKg = SA.form.field({ name: 'kg', label: 'الوزن الداخل للكسارة (كجم)', type: 'number', min: 0, max: avail, required: true, class: 'scr-numin', hint: 'المتاح للطحن ' + kgTxt(avail) + ' (بعد حجز طلبات البيع)', onInput: () => preview() });
    const fNote = SA.form.field({ name: 'note', label: 'ملاحظة', type: 'textarea', rows: 2, placeholder: 'مثال: هوالك سحب + ترويس — لون غامق' });
    const quick = h('div.scr-quick', {}, [100, 250, 500].map((n) => h('button.btn.btn-ghost', { type: 'button', onclick: () => { fKg.set(Math.min(avail, (Number(fKg.get()) || 0) + n)); preview(); } }, '+' + n)), h('button.btn.btn-ghost', { type: 'button', onclick: () => { fKg.set(Math.floor(avail)); preview(); } }, 'كل المتاح (' + num(Math.floor(avail)) + ')'));
    const prev = h('div.scr-prev');
    function preview() { SA.clear(prev); const kg = Number(fKg.get()) || 0; const out = Math.round(kg * 0.97 * 100) / 100;
      prev.append(h('span', {}, 'الناتج المتوقع ≈ ', h('b.num', {}, kgTxt(out)), ' مطحون (97%) · فاقد ≈ ' + kgTxt(kg - out)), h('span', {}, 'يخرج من «هوالك قابلة للطحن» ويدخل «مطحون إعادة تدوير» في نفس المخزن W-07 — جاهز لإذن الصرف للخلاطة.'),
        h('span', {}, 'القيد: من ح/ مخزون خامات 1141 ', U.cost(out * regC), ' + ح/ فاقد 5204 ', U.cost(Math.max(0, kg * grC - out * regC)), ' إلى ح/ مخزون هوالك 1145 ', U.cost(kg * grC))); }
    preview();
    const md = SA.modal({ title: 'طحن دفعة — الكسارة M-502', subtitle: mName('M-502'), icon: 'recycle', size: 'md',
      body: h('div', {}, fKg.el, quick, fNote.el, prev),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'تأكيد الطحن', icon: 'check', perm: 'mfg.scrap.recycle', onClick: async () => {
        if (!fKg.validate()) return; const kg = Number(fKg.get()) || 0; if (kg <= 0) return fKg.error('أدخل الوزن بالكيلو'); if (kg > avail + 1e-9) return fKg.error('المتاح ' + kgTxt(avail) + ' فقط');
        let res; try { res = await SA.api(() => FX.grind(kg, { note: fNote.get() })); } catch (e) { return SA.fail(e); }
        if (!res || !res.ok) return fKg.error((res && res.reason) || 'تعذّر الطحن');
        md.close(); SA.toast('اتطحن ' + kgTxt(res.rec.kgIn) + ' ← ' + kgTxt(res.rec.kgOut) + ' مطحون (' + res.rec.id + ')', 'success');
      } })] });
  }
  function openSale() {
    if (!SA.can('mfg.scrap.sell')) { SA.toast('ليست من صلاحياتك (mfg.scrap.sell)', 'warn'); return; }
    const a = analysis(30); const grNeed = a.weekNeed / 0.97;
    const fBuyer = SA.form.field({ name: 'buyer', label: 'المشتري', required: true, placeholder: 'اسم المصنع / الورشة' });
    const fPhone = SA.form.field({ name: 'phone', label: 'الهاتف', type: 'tel', placeholder: '+20 …' });
    const fNote = SA.form.field({ name: 'note', label: 'ملاحظة', type: 'textarea', rows: 2 });
    const rows = FX.SCRAP_ITEMS.map((id) => { const it = ERP.item(id) || {}; const avail = FX.scrapAvail(id);
      const kg = SA.form.field({ name: 'kg-' + id, label: 'الكمية (كجم)', type: 'number', min: 0, max: avail, value: '', onInput: () => calc() });
      const price = SA.form.field({ name: 'p-' + id, label: 'السعر/كجم', type: 'number', min: 0, value: (it.attrs || {}).salePrice || 0, onInput: () => calc() });
      const tot = h('span.scr-line-t.num', {}, '—');
      return { id, it, avail, kg, price, tot, el: h('div.scr-line', {}, h('div.scr-line-n', {}, h('b', {}, it.name || id), h('small', {}, 'متاح ' + kgTxt(avail) + (id === 'IT-SCR-GR' ? ' · احتياج الخلاطة ≈ ' + kgTxt(grNeed) + '/أسبوع' : ''))), kg.el, price.el, tot) }; });
    const sumEl = h('div.scr-prev');
    function calc() {
      let total = 0, book = 0; rows.forEach((r) => { const k = Number(r.kg.get()) || 0, p = Number(r.price.get()) || 0; total += k * p; book += k * (r.it.stdCost || 0); r.tot.textContent = k ? fm.money(k * p) : '—'; });
      SA.clear(sumEl); const g = rows[0]; const gk = Number(g.kg.get()) || 0;
      sumEl.append(h('span', {}, 'قيمة البيع: ', h('b.num', {}, fm.money(total)), ' · القيمة الدفترية: ', U.cost(book), canCost() ? h('span', {}, ' · الفرق (4201): ', h('b.num', {}, fm.money(total - book))) : null),
        gk > 0 && g.avail - gk < grNeed ? SA.alert('warning', 'الكمية دي هتنزّل رصيد الهوالك القابلة للطحن عن احتياج الخلاطة لأسبوع (≈ ' + kgTxt(grNeed) + '). البيع للزيادة بس.') : null,
        h('small.scr-muted', {}, 'الطلب بيروح للمدير المالي للاعتماد — والمخزون مش بيخرج إلا بعد الاعتماد والتسليم بالوزن.'));
    }
    calc();
    const md = SA.modal({ title: 'طلب بيع هوالك', subtitle: 'الزيادة عن احتياج الخلاطة — بموافقة المدير المالي', icon: 'coins', size: 'lg',
      body: h('div', {}, h('div.scr-form', {}, fBuyer.el, fPhone.el), h('div.scr-lines', {}, rows.map((r) => r.el)), fNote.el, sumEl),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'إرسال للاعتماد', icon: 'send', perm: 'mfg.scrap.sell', onClick: async () => {
        if (!fBuyer.validate()) return; let bad = false;
        const lines = rows.map((r) => { const k = Number(r.kg.get()) || 0; if (k > r.avail + 1e-9) { r.kg.error('المتاح ' + kgTxt(r.avail)); bad = true; } return { itemId: r.id, kg: k, price: Number(r.price.get()) || 0 }; }).filter((l) => l.kg > 0);
        if (bad) return; if (!lines.length) { rows[0].kg.error('أدخل كمية لصنف واحد على الأقل'); return; }
        let res; try { res = await SA.api(() => FX.requestScrapSale({ buyer: fBuyer.get().trim(), phone: fPhone.get(), lines, note: fNote.get() })); } catch (e) { return SA.fail(e); }
        if (!res || !res.ok) { SA.toast((res && res.reason) || 'تعذّر إنشاء الطلب', 'warn'); return; }
        md.close(); SA.toast('اتبعت طلب البيع ' + res.sale.id + ' للمدير المالي (' + res.sale.approvalId + ')', 'success');
      } })] });
  }
  async function deliver(id) {
    const s = ERP.find('scrapSales', id); if (!s) return;
    if (s.status !== 'approved') { SA.toast('البيع مش معتمد — مستني اعتماد المدير المالي', 'warn'); return; }
    if (!SA.can('mfg.scrap.sell')) { SA.toast('ليست من صلاحياتك (mfg.scrap.sell)', 'warn'); return; }
    const r = await SA.confirm({ title: 'تسليم الهوالك للمشتري — ' + id, icon: 'truck', confirmLabel: 'تم الوزن والتسليم',
      text: s.buyer + ' — ' + kgTxt(sum(s.lines, (l) => l.kg)),
      impact: s.lines.map((l) => 'خروج ' + kgTxt(l.kg) + ' ' + itemShort(l.itemId) + ' من ' + ERP.whName(FX.SCRAP_WH)).concat(['تحصيل ' + fm.money(s.total) + ' نقدًا', 'قيد آلي: من ح/ النقدية 1101 إلى ح/ مخزون هوالك 1145' + (canCost() ? ' (' + fm.money(s.bookValue) + ')' : '') + ' + ح/ إيرادات بيع خردة 4201' + (canCost() ? ' (' + fm.money(s.total - s.bookValue) + ')' : ''), 'يُسجّل SCRAP.SOLD في التدقيق']) });
    if (!r.ok) return;
    let res; try { res = await SA.api(() => { const x = FX.deliverScrapSale(id); if (x && x.ok) safeNotify({ title: 'اتسلّمت هوالك ' + id, body: s.buyer + ' — اتحصل ' + fm.money(s.total) + ' (قيد 1101 / 4201).', level: 'info', to: ['R-22', 'R-07'], link: '#/mfg/scrap?q=' + id }); return x; }); } catch (e) { return SA.fail(e); }
    if (!res || !res.ok) { SA.toast((res && res.reason) || 'تعذّر التسليم', 'warn'); return; }
    SA.toast('اتسلّم ' + id + ' للمشتري — اتحصل ' + fm.money(s.total), 'success');
  }

  /* ═════════════ registration ═════════════ */
  function liveLocal(root, buildFn, paths) {
    let t = 0; const sc = () => document.scrollingElement || document.documentElement;
    const run = () => { const y = sc().scrollTop, ry = root.scrollTop; SA.clear(root); const n = buildFn(run); if (n) root.appendChild(n); if (y) sc().scrollTop = y; if (ry) root.scrollTop = ry; };
    run(); const offs = paths.map((p) => st.subscribe(p, () => { if (t) return; t = setTimeout(() => { t = 0; run(); }, 30); }));
    return () => { clearTimeout(t); offs.forEach((f) => f()); };
  }
  function render(root, ctx) {
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'التنفيذ' }, { label: 'الهوالك وإعادة التدوير' }]);
    const q = ctx.params || {}; let openId = null; let focus = false;
    if (q.p && Number(q.p) > 0) S0.p = Number(q.p) === 7 ? 7 : 30;
    if (q.tab && TABS[q.tab]) { S0.tab = q.tab; focus = true; }
    const F = {}; ['stage', 'line', 'machine', 'reason', 'normal', 'shift'].forEach((k) => { if (q[k]) F[k] = String(q[k]); });
    S0.log.filters = F; S0.log.q = ''; S0.log.page = 1; S0.grind.q = ''; S0.sales.q = '';
    if (Object.keys(F).length) { S0.tab = 'log'; focus = true; }
    if (q.q) { const id = String(q.q).trim(); focus = true; if (/^SS-/.test(id)) { S0.tab = 'sales'; S0.sales.q = id; openId = id; } else if (/^RG-/.test(id)) { S0.tab = 'grind'; S0.grind.q = id; openId = id; } else { S0.tab = 'log'; S0.log.q = id; S0.log.filters = {}; if (/^SCR-/.test(id)) openId = id; } }
    const off = liveLocal(root, build, PATHS);
    if (focus) setTimeout(() => { const el = root.querySelector('#scr-tabs'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); }, 60);
    if (openId) setTimeout(() => openRecord(openId), 90);
    return off;
  }
  SA.register({ id: 'mfg-scrap', app: 'mfg', group: 'mfg-exec', title: 'الهوالك وإعادة التدوير', icon: 'recycle', route: 'mfg/scrap', perm: 'mfg.scrap.view', order: 45, desc: 'الهالك حسب المرحلة، الطحن والمطحون، بيع الزيادة',
    badge() { try { return (get('scrapSales').filter((s) => s.status === 'pending_approval').length + todayOver().length) || null; } catch (e) { return null; } },
    render });
  ERP.scrap = { analysis, todayOver, openLog, openGrind, openSale, deliver, open: openRecord, TOL };
})();
