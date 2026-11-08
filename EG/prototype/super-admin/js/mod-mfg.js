/* EG ERP prototype — mod-mfg.js  (app mfg «التصنيع والجودة» — groups mfg-dash · mfg-plan · mfg-exec · mfg-eng)
   Routes: mfg/dashboard · mfg/planning · mfg/mrp · mfg/workorders[/WO-id] · mfg/shopfloor · mfg/bom[/BOM-id] · mfg/lines[/L-id]
   Business actions go through ERP.flow (createWO · releaseWO · startWO · reportWO · woMaterials · mrp · createPRQ).
   Own actions (store + SA.audit + SA.notify): hold/resume WO (WO.HELD / WO.RESUMED), reschedule (WO.RESCHEDULED), breakdown report from the shop floor
   (maintenanceOrders + downtime + line down: MNT.REQUESTED + LINE.STATUS_CHANGED), line status (LINE.STATUS_CHANGED), BOM line edit (BOM.UPDATED), MRP run (MRP.RUN).
   Module-private data: mfgShiftLog[] {id, at, lineId, woId, good, scrap, shift, src:'counter'|'report'} — line counters (demo) · mfgMrp {at, by, rows} — last MRP run.
   Public helpers for other modules: ERP.mfg = { outToday, currentWO, shortages, openCreateWO, reportBreakdown, setLineStatus, holdWO, resumeWO, reschedule, runMRP, updateBomLine } */
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
  const MIN = 60000;

  SA.catalog.addAudit('WO.RESCHEDULED', 'إعادة جدولة أمر تشغيل', 'info', 'mfg');
  SA.catalog.addAudit('WO.RESUMED', 'استئناف أمر تشغيل', 'info', 'mfg');

  /* ── module seed: line counters for today (demo PLC counters, hourly) ── */
  ERP.addSeed('mfg-shiftlog', function (S, c) {
    S.mfgShiftLog = []; S.mfgMrp = null;
    const now = new Date(); const mid = new Date(now); mid.setHours(0, 0, 0, 0); const minsToday = Math.floor((now - mid) / MIN); let n = 0;
    (S.lines || []).forEach((ln) => {
      const three = (ln.shifts || []).length >= 3;
      for (let m = 40; m <= minsToday; m += 60) {
        const at = new Date(now.getTime() - m * MIN); const hr = at.getHours();
        if (!three && (hr < 7 || hr >= 23)) continue;
        if (ln.status === 'down' && ln.downSince && at.getTime() > new Date(ln.downSince).getTime()) continue;
        const good = Math.round((ln.capacityPerShift / 8) * (0.8 + c.rnd() * 0.14));
        S.mfgShiftLog.push({ id: 'SL-' + (++n), at: at.toISOString(), lineId: ln.id, woId: ln.currentWoId || null, good, scrap: Math.round(good * (0.012 + c.rnd() * 0.02)), shift: hr >= 7 && hr < 15 ? 'A' : hr >= 15 && hr < 23 ? 'B' : 'C', src: 'counter' });
      }
    });
  });

  /* ── styles ── */
  (function () {
    if (document.querySelector('style[data-mod="mfg"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'mfg');
    s.textContent = `
.mfg-lines { display: grid; gap: 14px; grid-template-columns: 1fr; margin-block: 16px; }
@media (min-width: 700px) { .mfg-lines { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1380px) { .mfg-lines { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.mfg-lc { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-top: 4px solid var(--color-success); min-width: 0; }
.mfg-lc.is-down { border-top-color: var(--color-danger); background: linear-gradient(180deg, #fff5f5, #fff 55%); }
.mfg-lc.is-setup { border-top-color: var(--color-warning); } .mfg-lc.is-idle { border-top-color: var(--color-border-strong); }
.mfg-lc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.mfg-lc-head > div { min-width: 0; } .mfg-lc-head > .chip, .mfg-lc-head > span:last-child { flex: none; }
.mfg-lc-head b { font-size: var(--text-dense); } .mfg-lc-head small { display: block; color: var(--color-text-muted); font-size: 12px; margin-top: 2px; }
.mfg-code { font: 700 11.5px var(--font-en); color: var(--eg-navy); background: var(--color-primary-tint); border-radius: 6px; padding: 1px 7px; white-space: nowrap; }
.mfg-lc-mid { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; align-items: center; }
.mfg-lc-mid .erp-gauge-wrap svg { width: 96px; height: auto; }
.mfg-lc-out { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.mfg-lc-out small { color: var(--color-text-muted); font-size: 12px; font-weight: 600; }
.mfg-lc-out > b { font: 700 1.35rem var(--font-en); color: var(--color-text); line-height: 1.1; } .mfg-lc-out > b span { font-size: 12.5px; color: var(--color-text-muted); font-weight: 600; }
.mfg-lc-wo { font-size: 12.5px; display: flex; flex-direction: column; gap: 6px; min-width: 0; background: var(--color-bg-alt); border-radius: 10px; padding: 9px 10px; }
.mfg-lc-wo > .mfg-lc-wo-top { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.mfg-lc-wo .chip { white-space: normal; }
.mfg-lc-wo .erp-item { min-width: 0; } .mfg-lc-wo .erp-item b { font-size: 12.5px; }
.mfg-apq { display: flex; gap: 10px; font: 600 11.5px var(--font-en); color: var(--color-text-muted); flex-wrap: wrap; }
.mfg-down-note { font-size: 12.5px; color: var(--color-danger); display: flex; gap: 6px; align-items: flex-start; font-weight: 600; line-height: 1.6; }
.mfg-down-note svg { flex: none; margin-top: 3px; }
.mfg-lc-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12.5px; border-top: 1px solid var(--color-border); padding-top: 8px; margin-top: auto; flex-wrap: wrap; }
.mfg-muted { color: var(--color-text-muted); font-size: 12.5px; }
.mfg-attn { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.mfg-attn li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.mfg-attn li:last-child { border-bottom: 0; }
.mfg-attn-ico { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex: none; background: var(--color-warning-tint); color: var(--color-warning); }
.mfg-attn-ico.is-danger { background: var(--color-danger-tint); color: var(--color-danger); } .mfg-attn-ico.is-info { background: var(--color-primary-tint); color: var(--eg-navy); } .mfg-attn-ico.is-success { background: var(--color-success-tint); color: var(--color-success); }
.mfg-attn-b { flex: 1; min-width: 0; font-size: var(--text-dense); } .mfg-attn-b > b { display: block; } .mfg-attn-b small { color: var(--color-text-muted); font-size: 12.5px; line-height: 1.65; display: block; }
.mfg-attn-b .erp-doc { font-size: 12.5px; }
.mfg-chart-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.mfg-qcell { display: flex; flex-direction: column; gap: 4px; min-width: 110px; }
.mfg-qcell .erp-meter-t { height: 6px; }
.mfg-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.mfg-mini { width: 100%; min-width: 440px; } .mfg-mini td, .mfg-mini th { font-size: 13px; }
.mfg-mini .is-short td { background: #fff7f7; }
.mfg-kpi-row { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-block: 12px; }
.mfg-stat { background: var(--color-bg-alt); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.mfg-stat small { color: var(--color-text-muted); font-size: 12px; font-weight: 600; } .mfg-stat b { font: 700 1.25rem var(--font-en); color: var(--color-text); }
.mfg-stat.is-danger b { color: var(--color-danger); } .mfg-stat.is-success b { color: var(--color-success); } .mfg-stat.is-warning b { color: var(--color-warning); }
/* planning board */
.mfg-gantt { --days: 10; border: 1px solid var(--color-border); border-radius: 12px; overflow: hidden; background: #fff; }
.mfg-g-scroll { overflow-x: auto; }
.mfg-g-inner { min-width: 860px; }
.mfg-g-row { display: grid; grid-template-columns: 178px 1fr; border-bottom: 1px solid var(--color-border); }
.mfg-g-row:last-child { border-bottom: 0; }
.mfg-g-lab { padding: 10px 12px; border-inline-end: 1px solid var(--color-border); background: var(--color-bg-alt); display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; }
.mfg-g-lab a { font-weight: 700; color: var(--eg-navy); text-decoration: none; } .mfg-g-lab a:hover { text-decoration: underline; }
.mfg-g-days { display: grid; grid-template-columns: repeat(var(--days), 1fr); }
.mfg-g-day { text-align: center; padding: 6px 2px; font-size: 11.5px; color: var(--color-text-muted); border-inline-start: 1px solid var(--color-border); }
.mfg-g-day b { display: block; color: var(--color-text); font: 600 12px var(--font-en); }
.mfg-g-day.is-today { background: var(--color-primary-tint); color: var(--eg-navy); } .mfg-g-day.is-past { background: #fafafa; }
.mfg-g-track { position: relative; }
.mfg-g-bg { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(var(--days), 1fr); pointer-events: none; }
.mfg-g-bg span { border-inline-start: 1px solid var(--color-border); } .mfg-g-bg span.is-today { background: rgba(1, 40, 100, .045); } .mfg-g-bg span.is-down { background: repeating-linear-gradient(45deg, #fdecec, #fdecec 6px, #fff 6px, #fff 12px); }
.mfg-bar { position: absolute; height: 30px; border-radius: 7px; padding: 0 8px; font-size: 11.5px; line-height: 1.2; display: flex; flex-direction: column; justify-content: center; overflow: hidden; white-space: nowrap; cursor: pointer; border: 1px solid transparent; text-align: start; font-family: inherit; }
.mfg-bar b { font: 700 11px var(--font-en); } .mfg-bar span { overflow: hidden; text-overflow: ellipsis; }
.mfg-bar:hover, .mfg-bar:focus-visible { box-shadow: 0 0 0 2px var(--color-focus); z-index: 2; }
.mfg-bar.is-planned { background: #eef2f9; border: 1px dashed #7d9cd1; color: var(--eg-navy); }
.mfg-bar.is-released { background: #dbe5f5; border-color: #9fb6dd; color: var(--eg-navy); }
.mfg-bar.is-in_progress { background: var(--eg-navy); color: #fff; }
.mfg-bar.is-on_hold { background: var(--color-danger-tint); border-color: #f0a9ad; color: var(--color-danger); }
.mfg-bar.is-qc_pending { background: var(--color-warning-tint); border-color: #f0cf9a; color: var(--color-warning); }
.mfg-bar.is-completed, .mfg-bar.is-closed { background: var(--color-success-tint); border-color: #b9e0c8; color: var(--color-success); }
.mfg-bar.is-high { border-inline-start: 4px solid var(--color-accent); }
.mfg-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--color-text-muted); margin-top: 10px; }
.mfg-legend i { display: inline-block; width: 14px; height: 10px; border-radius: 3px; margin-inline-end: 5px; vertical-align: middle; }
.mfg-heat { width: 100%; border-collapse: separate; border-spacing: 3px; font-size: 12px; }
.mfg-heat th { font-weight: 600; color: var(--color-text-muted); padding: 4px; text-align: center; font-size: 11.5px; } .mfg-heat th:first-child { text-align: start; }
.mfg-heat td { text-align: center; border-radius: 6px; padding: 7px 2px; font: 600 12px var(--font-en); background: #f4f6f9; color: var(--color-text-muted); }
.mfg-heat td.l0 { background: #f4f6f9; } .mfg-heat td.l1 { background: #e3f4ea; color: var(--color-success); } .mfg-heat td.l2 { background: #c6e8d3; color: #0f5e2f; }
.mfg-heat td.l3 { background: #fdf0dc; color: var(--color-warning); } .mfg-heat td.l4 { background: #f9c9cb; color: var(--color-danger); } .mfg-heat td.is-down { background: var(--color-danger); color: #fff; font-family: inherit; }
.mfg-heat td.mfg-heat-lab { background: transparent; text-align: start; font: 600 12.5px var(--font-ar); color: var(--color-text); white-space: nowrap; }
/* shop floor kiosk */
.mfg-kiosk-top { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between; background: var(--eg-navy-deep); color: #fff; border-radius: 16px; padding: 14px 18px; margin-block: 12px 16px; }
.mfg-kiosk-top h2 { margin: 0; font-size: 1.15rem; } .mfg-kiosk-top p { margin: 2px 0 0; opacity: .78; font-size: 13px; }
.mfg-clock { font: 700 30px var(--font-en); letter-spacing: .5px; }
.mfg-kiosk-top .segmented { background: rgba(255, 255, 255, .12); padding: 4px; }
.mfg-kiosk-top .segmented button { color: #fff; min-height: 48px; padding-inline: 20px; font-size: 15px; }
.mfg-kiosk-top .segmented button[aria-pressed="true"] { color: var(--eg-navy); background: #fff; }
.mfg-tiles { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 430px), 1fr)); }
.mfg-tile { border-radius: 18px; background: #fff; border: 1px solid var(--color-border); overflow: hidden; display: flex; flex-direction: column; box-shadow: var(--shadow-card); }
.mfg-tile-band { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 14px 18px; color: #fff; background: var(--color-success); }
.mfg-tile.is-down .mfg-tile-band { background: var(--color-danger); } .mfg-tile.is-setup .mfg-tile-band { background: var(--color-warning); } .mfg-tile.is-idle .mfg-tile-band { background: #4a4a4a; }
.mfg-tile-band b { font-size: 19px; display: block; } .mfg-tile-band small { opacity: .85; font-size: 13px; }
.mfg-tile-state { font-weight: 700; font-size: 15px; background: rgba(255, 255, 255, .18); border-radius: 999px; padding: 5px 14px; white-space: nowrap; }
.mfg-tile-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; flex: 1; }
.mfg-tile-wo { display: flex; justify-content: space-between; gap: 10px; align-items: center; font-size: 15px; }
.mfg-tile-wo .erp-item b { font-size: 15px; }
.mfg-big { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.mfg-big > div { background: var(--color-bg-alt); border-radius: 14px; padding: 12px 8px; text-align: center; }
.mfg-big b { display: block; font: 700 32px var(--font-en); color: var(--color-text); line-height: 1.15; }
.mfg-big small { font-size: 13px; color: var(--color-text-muted); font-weight: 600; }
.mfg-big .is-scrap b { color: var(--color-danger); }
.mfg-tile-down { background: var(--color-danger-tint); color: var(--color-danger); border-radius: 14px; padding: 12px 14px; font-weight: 600; line-height: 1.7; }
.mfg-tile-down b.mfg-elapsed { font: 700 26px var(--font-en); display: block; }
.mfg-tile-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 18px 18px; }
.mfg-tile-acts .btn { min-height: 60px; font-size: 17px; justify-content: center; border-radius: 14px; }
.mfg-quick { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.mfg-quick button { min-height: 44px; min-width: 64px; }
.mfg-numin input { font: 700 26px var(--font-en); min-height: 56px; text-align: center; }
.mfg-seg-lg .segmented button { min-height: 48px; padding-inline: 22px; font-size: 15px; }
/* WO / BOM / line detail */
.mfg-head { display: grid; grid-template-columns: 128px 1fr; gap: 16px; align-items: start; }
.mfg-img { width: 128px; height: 104px; object-fit: contain; background: var(--color-bg-alt); border-radius: 12px; padding: 6px; }
.mfg-thumb { width: 52px; height: 44px; object-fit: contain; border-radius: 9px; background: var(--color-bg-alt); padding: 3px; flex: none; }
.mfg-scale { display: flex; gap: 12px; align-items: flex-start; background: var(--color-bg-alt); border-radius: 12px; padding: 12px 14px; font-size: 13.5px; line-height: 1.8; }
.mfg-scale .mfg-scale-ico { width: 34px; height: 34px; border-radius: 10px; background: #fff; display: grid; place-items: center; color: var(--eg-navy); flex: none; }
.mfg-gauges { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; align-items: end; }
.mfg-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.mfg-timeline li { display: flex; gap: 10px; font-size: 13px; } .mfg-timeline li > i { width: 9px; height: 9px; border-radius: 50%; background: var(--eg-navy); margin-top: 6px; flex: none; }
.mfg-timeline small { display: block; color: var(--color-text-muted); font-size: 12px; }
.mfg-roll { display: flex; flex-direction: column; gap: 8px; }
.mfg-roll-row { display: flex; justify-content: space-between; gap: 10px; font-size: 13.5px; padding: 6px 0; border-bottom: 1px dashed var(--color-border); }
.mfg-roll-row.is-total { border-bottom: 0; font-weight: 700; font-size: 15px; color: var(--eg-navy); }
.mfg-locked-box { display: flex; gap: 10px; align-items: center; background: var(--color-neutral-tint); border-radius: 12px; padding: 14px; color: var(--color-text-muted); font-size: 13.5px; }
.mfg-wo-prev { margin-top: 6px; background: var(--color-bg-alt); border-radius: 12px; padding: 10px 12px; font-size: 13px; display: flex; flex-direction: column; gap: 6px; }
.mfg-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0 14px; }
.mfg-mrp-late { color: var(--color-danger); font-weight: 700; }
.mfg-details { border: 1px solid var(--color-border); border-radius: 12px; margin-bottom: 8px; background: #fff; }
.mfg-details > summary { list-style: none; cursor: pointer; padding: 10px 14px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13.5px; }
.mfg-details > summary::-webkit-details-marker { display: none; }
.mfg-details[open] > summary { border-bottom: 1px solid var(--color-border); }
.mfg-details > div { padding: 10px 14px; }
.mfg-grow { flex: 1; }
@media (max-width: 760px) { .mfg-head { grid-template-columns: 1fr; } .mfg-big b { font-size: 26px; } }`;
    document.head.appendChild(s);
  })();

  /* ═════════════════════════ constants + helpers ═════════════════════════ */
  const LINE_COLOR = { 'L-01': '#012864', 'L-02': '#7d9cd1', 'L-03': '#a85a00', 'L-04': '#147a3d' };
  const IMG = { door: '../../assets/images/products/doors.png', clad: '../../assets/images/products/cladding.png', foam: '../../assets/images/products/foam.png' };
  const WO_ORDER = { on_hold: 0, in_progress: 1, released: 2, planned: 3, qc_pending: 4, completed: 5, closed: 6 };
  const OPEN = ['planned', 'released', 'in_progress', 'on_hold', 'qc_pending'];
  const PRI = { normal: ['عادية', 'neutral'], high: ['أولوية عالية', 'warning'], urgent: ['عاجلة', 'danger'] };
  const DT_CAT = { breakdown: 'أعطال ماكينات', setup: 'تجهيز وتغيير قوالب', material: 'انتظار خامات', utility: 'مرافق وكهرباء', quality: 'توقف جودة', pm: 'صيانة وقائية مخططة', other: 'أخرى' };
  const SHIFTS = [['A', 'وردية A'], ['B', 'وردية B'], ['C', 'وردية C']];
  const SHIFT_HOURS = { A: '7ص – 3م', B: '3م – 11م', C: '11م – 7ص' };
  const CONV = { labour: 6, overhead: 9 }; // demo conversion rates ج.م / standard minute

  const ts = (iso) => (iso ? new Date(iso).getTime() : 0);
  const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const fmtD = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n); return fmtD(d); };
  const dayIdx = (from, ds) => Math.round((new Date(ds + 'T12:00:00') - new Date(from + 'T12:00:00')) / 86400000);
  const shiftAt = (iso) => { const hr = new Date(iso).getHours(); return hr >= 7 && hr < 15 ? 'A' : hr >= 15 && hr < 23 ? 'B' : 'C'; };
  const shiftNow = () => { const hr = new Date().getHours(); return hr >= 7 && hr < 15 ? 'A' : hr >= 15 && hr < 23 ? 'B' : 'C'; };
  const minsSince = (iso) => Math.max(0, Math.round((Date.now() - ts(iso)) / MIN));
  const durTxt = (m) => (m < 60 ? m + ' دقيقة' : Math.floor(m / 60) + ' س' + (m % 60 ? ' ' + (m % 60) + ' د' : ''));
  const item = (id) => ERP.item(id) || {};
  const famOf = (itemId) => item(itemId).family;
  const uomOf = (itemId) => ERP.uom[item(itemId).uom] || item(itemId).uom || '';
  const qtyU = (n, itemId) => num(n, 2) + ' ' + uomOf(itemId);
  const isOpen = (w) => OPEN.indexOf(w.status) >= 0;
  const remaining = (w) => Math.max(0, w.qty - (w.qtyDone || 0));
  const isLate = (w) => isOpen(w) && w.status !== 'qc_pending' && !!((w.dueDate && w.dueDate < today()) || (w.plannedEnd && w.plannedEnd < today()));
  const atRisk = (w) => { if (!isOpen(w) || isLate(w) || w.status === 'qc_pending') return false; const ln = ERP.line(w.lineId); return w.status === 'on_hold' || !!(ln && ln.status === 'down'); };
  const capPerShift = (lineId, itemId) => { const ln = ERP.line(lineId); const it = ERP.item(itemId); if (!ln) return 100; return ln.capacityPerShift * (it && it.family === 'foam' ? 10 / ((it.attrs && it.attrs.thickness) || 10) : 1); };
  const capPerDay = (lineId, itemId) => capPerShift(lineId, itemId) * (((ERP.line(lineId) || {}).shifts) || ['A']).length;
  const priChip = (p) => { const m = PRI[p] || PRI.normal; return SA.chip(m[0], m[1]); };
  const oeeOf = (ln) => { const o = ln.oee || {}; return (o.a || 0) * (o.p || 0) * (o.q || 0); };
  const openMwo = (lineId) => get('maintenanceOrders').filter((m) => m.lineId === lineId && ['done', 'cancelled'].indexOf(m.status) < 0);
  const breakdownMwo = (lineId) => openMwo(lineId).filter((m) => m.kind === 'breakdown').sort((a, b) => ts(b.openedAt) - ts(a.openedAt))[0] || null;
  const lineLink = (id) => { const l = ERP.line(id); return l ? h('a.erp-doc', { href: '#/mfg/lines/' + id }, l.id + ' · ' + l.name) : h('span', {}, '—'); };
  const mwoLink = (id) => h('a.erp-doc', { href: '#/care/maintenance/' + id }, id);
  const assetLink = (id) => h('a.erp-doc', { href: '#/care/assets/' + id }, id);
  const soCustomer = (soId) => { const so = soId ? ERP.find('salesOrders', soId) : null; return so ? ERP.customerName(so.customerId) : ''; };
  const imgOf = (itemId) => IMG[famOf(itemId)] || null;
  const shortDate = (ds) => { const p = String(ds || '').split('-'); return p.length === 3 ? Number(p[2]) + '/' + Number(p[1]) : ds; };
  const WEEKDAY = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const wday = (ds) => WEEKDAY[new Date(ds + 'T12:00:00').getDay()];
  function safeNotify(o) { try { SA.notify(o); } catch (e) { /* noop */ } }
  function ensure(coll) { if (!Array.isArray(st.get(coll))) st.set(coll, []); }
  const miniTable = (cols, rows) => h('div.table-wrap', {}, h('table.table.mfg-mini', {}, h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.cls || null }, c.label || c)))), h('tbody', {}, rows)));
  const td = (v, cls) => h('td', { class: cls === 'num' ? 'mfg-n' : cls || null }, v == null || v === '' ? '—' : cls === 'num' && typeof v === 'string' ? h('span.num', {}, v) : v);
  const stat = (label, value, tone) => h('div.mfg-stat' + (tone ? '.is-' + tone : ''), {}, h('small', {}, label), h('b.num', {}, value));
  const attnItem = (o) => h('li', {}, h('span.mfg-attn-ico.is-' + (o.tone || 'warning'), {}, SA.icon(o.icon || 'alert', 'icon-sm')), h('div.mfg-attn-b', {}, h('b', {}, o.title), o.sub ? h('small', {}, o.sub) : null), o.href ? h('a.btn.btn-ghost.btn-sm', { href: o.href }, o.cta || 'فتح') : null);

  /** today's output from the line counters (demo) + production reported from this module */
  function outToday(lineId) {
    const t0 = dayStart(); let good = 0, scrap = 0, last = null;
    get('mfgShiftLog').forEach((x) => { if (x.lineId === lineId && ts(x.at) >= t0) { good += x.good || 0; scrap += x.scrap || 0; if (!last || ts(x.at) > ts(last)) last = x.at; } });
    return { good, scrap, last };
  }
  const planToday = (ln) => ln.capacityPerShift * (ln.shifts || ['A']).length;
  function dayFraction(ln) { const d = new Date(); const hr = d.getHours() + d.getMinutes() / 60; if ((ln.shifts || []).length >= 3) return Math.max(0.02, Math.min(1, hr / 24)); return Math.max(0, Math.min(1, (hr - 7) / 16)); }
  function currentWO(ln) {
    let w = ln.currentWoId ? ERP.find('workOrders', ln.currentWoId) : null;
    if (w && ['in_progress', 'on_hold', 'released'].indexOf(w.status) < 0) w = null;
    if (!w) w = get('workOrders').filter((x) => x.lineId === ln.id && ['in_progress', 'on_hold', 'released'].indexOf(x.status) >= 0).sort((a, b) => WO_ORDER[a.status] - WO_ORDER[b.status])[0] || null;
    return w;
  }
  /** L-01 has no own work orders: it extrudes the door profiles for the WOs assembled on L-02 */
  function feedsFor(ln) {
    if (get('workOrders').some((x) => x.lineId === ln.id && isOpen(x))) return null;
    return get('workOrders').filter((x) => famOf(x.itemId) === ln.family && x.lineId !== ln.id && ['in_progress', 'released'].indexOf(x.status) >= 0).sort((a, b) => WO_ORDER[a.status] - WO_ORDER[b.status])[0] || null;
  }
  function nextWOs(lineId) { return get('workOrders').filter((w) => w.lineId === lineId && ['planned', 'released'].indexOf(w.status) >= 0).sort((a, b) => (a.plannedStart < b.plannedStart ? -1 : 1)); }
  /** cumulative material shortages of all planned WOs vs available stock → [{itemId, need, avail, short, wos[]}] */
  function shortages() {
    const need = {}; const wos = {};
    get('workOrders').filter((w) => w.status === 'planned').forEach((w) => ERP.materialsFor(w.itemId, remaining(w)).forEach((m) => { need[m.itemId] = (need[m.itemId] || 0) + m.qty; (wos[m.itemId] = wos[m.itemId] || []).push(w.id); }));
    return Object.keys(need).map((id) => { const avail = K.available(id, K.defaultWh(id)); return { itemId: id, need: Math.round(need[id] * 100) / 100, avail, short: Math.max(0, Math.round((need[id] - avail) * 100) / 100), wos: wos[id] }; }).filter((x) => x.short > 0);
  }
  function rollup(itemId, qty) {
    const mats = ERP.materialsFor(itemId, qty || 1).map((m) => Object.assign({}, m, { cost: m.qty * (item(m.itemId).stdCost || 0) }));
    const matCost = mats.reduce((s, m) => s + m.cost, 0); const mins = ERP.routingFor(itemId).reduce((s, r) => s + r.minPerUnit, 0) * (qty || 1);
    const labour = mins * CONV.labour, overhead = mins * CONV.overhead;
    return { mats, matCost, mins, labour, overhead, total: matCost + labour + overhead, std: (item(itemId).stdCost || 0) * (qty || 1) };
  }

  /* ═════════════════════════ actions (core = no UI · ui = confirm/modal + toast) ═════════════════════════ */
  function holdCore(woId, reason) {
    const wo = ERP.find('workOrders', woId); if (!wo || ['in_progress', 'released', 'planned'].indexOf(wo.status) < 0) return null;
    st.patch('workOrders', woId, { status: 'on_hold', holdReason: reason, heldAt: ERP.now(), heldBy: me(), statusBeforeHold: wo.status });
    SA.audit('WO.HELD', { target: { type: 'work_order', id: woId, label: ERP.itemName(wo.itemId) }, before: { status: wo.status }, after: { status: 'on_hold' }, reason });
    if (wo.soId) safeNotify({ title: 'إيقاف أمر التشغيل ' + woId, body: wo.soId + ' — ' + soCustomer(wo.soId) + ': ' + reason, level: 'info', to: ['R-03', 'R-17'], link: '#/mfg/workorders/' + woId });
    return ERP.find('workOrders', woId);
  }
  function resumeCore(woId, note) {
    const wo = ERP.find('workOrders', woId); if (!wo || wo.status !== 'on_hold') return null; const ln = ERP.line(wo.lineId);
    if (ln && ln.status === 'down') return { blocked: 'line_down' };
    const to = !wo.issued ? 'planned' : (wo.qtyDone || 0) > 0 || wo.actualStart ? 'in_progress' : 'released';
    st.patch('workOrders', woId, { status: to, lastHoldReason: wo.holdReason || null, holdReason: null, resumedAt: ERP.now(), resumedBy: me() });
    if (to === 'in_progress' && ln) st.patch('lines', ln.id, { currentWoId: woId, status: ln.status === 'idle' || ln.status === 'setup' ? 'running' : ln.status });
    SA.audit('WO.RESUMED', { target: { type: 'work_order', id: woId, label: ERP.itemName(wo.itemId) }, before: { status: 'on_hold' }, after: { status: to }, reason: note || '' });
    return ERP.find('workOrders', woId);
  }
  function rescheduleCore(woId, days, lineId) {
    const wo = ERP.find('workOrders', woId); if (!wo) return null;
    const before = { plannedStart: wo.plannedStart, plannedEnd: wo.plannedEnd, line: wo.lineId };
    const after = { plannedStart: addDays(wo.plannedStart || today(), days || 0), plannedEnd: addDays(wo.plannedEnd || wo.plannedStart || today(), days || 0), line: lineId || wo.lineId };
    st.patch('workOrders', woId, { plannedStart: after.plannedStart, plannedEnd: after.plannedEnd, lineId: after.line });
    if (lineId && lineId !== before.line) { const old = ERP.line(before.line); if (old && old.currentWoId === woId) st.patch('lines', old.id, { currentWoId: null }); }
    SA.audit('WO.RESCHEDULED', { target: { type: 'work_order', id: woId, label: ERP.itemName(wo.itemId) }, before, after });
    return ERP.find('workOrders', woId);
  }
  function closeDowntime(lineId) {
    st.update('downtime', (l) => { (l || []).forEach((d) => { if (d.lineId === lineId && !d.end) { d.end = ERP.now(); d.minutes = minsSince(d.start); } }); });
  }
  function openDowntime(o) {
    ensure('downtime');
    const n = get('downtime').reduce((m, d) => Math.max(m, Number(String(d.id).replace(/\D/g, '')) || 0), 500) + 1;
    const rec = { id: 'DT-' + n, lineId: o.lineId, machineId: o.machineId || null, start: ERP.now(), end: null, minutes: 0, reason: o.reason || '', category: o.category || 'breakdown', mwoId: o.mwoId || null };
    st.insert('downtime', rec, true); return rec;
  }
  /** line status change (running|idle|setup|down) — opens/closes downtime records, audits LINE.STATUS_CHANGED */
  function setLineStatusCore(lineId, status, reason, o) {
    o = o || {}; const ln = ERP.line(lineId); if (!ln || ln.status === status) return null; const prev = ln.status;
    const p = { status };
    if (prev === 'down' || prev === 'setup') { closeDowntime(lineId); p.downSince = null; p.downReason = null; if (prev === 'down') st.update('machines', (l) => { l.forEach((m) => { if (m.lineId === lineId && m.status === 'down') m.status = 'running'; }); }); }
    if (status === 'down' || status === 'setup') { p.downSince = ERP.now(); p.downReason = reason || ''; if (!o.noDowntime) openDowntime({ lineId, machineId: o.machineId, reason: reason || (status === 'setup' ? 'تجهيز/تغيير قالب' : 'توقف'), category: o.category || (status === 'setup' ? 'setup' : 'breakdown'), mwoId: o.mwoId }); }
    st.patch('lines', lineId, p);
    SA.audit('LINE.STATUS_CHANGED', { target: { type: 'line', id: lineId, label: ln.name }, before: { status: prev }, after: { status }, reason: reason || '' });
    if (status === 'down' && !o.silent) safeNotify({ title: 'توقف خط: ' + ln.name, body: reason || 'تم تحويل الخط لحالة عطل', level: 'urgent', to: ['R-05', 'R-18', 'R-01'], link: '#/mfg/lines/' + lineId });
    if (prev === 'down' && status === 'running') safeNotify({ title: ln.name + ' عاد للعمل', body: 'استأنف أوامر التشغيل المتوقفة على الخط.', level: 'info', to: ['R-05', 'R-03', 'R-17'], link: '#/mfg/workorders?status=on_hold&line=' + lineId });
    return ERP.find('lines', lineId);
  }
  /** shop-floor breakdown report → maintenance order (same shape as the seed) + line down + downtime + optional hold of the running WO */
  function reportBreakdownCore(o) {
    const ln = ERP.line(o.lineId); if (!ln) return null; const mc = ERP.machine(o.machineId); ensure('maintenanceOrders');
    const id = ERP.no('MWO');
    const mwo = { id, kind: 'breakdown', machineId: o.machineId || null, lineId: o.lineId, title: o.title, priority: 'urgent', status: 'requested', reportedBy: me(), assigneeId: null, openedAt: ERP.now(), startedAt: null, doneAt: null, downtimeMin: 0, parts: [], cost: null, notes: o.note || '' };
    st.insert('maintenanceOrders', mwo, true);
    SA.audit('MNT.REQUESTED', { target: { type: 'mwo', id, label: mc ? mc.name + ' ' + mc.id : ln.name }, after: { line: o.lineId, machine: o.machineId || null, priority: 'urgent' }, reason: o.title });
    if (mc) st.patch('machines', mc.id, { status: 'down' });
    const held = [];
    if (o.holdWo !== false) get('workOrders').filter((w) => w.lineId === o.lineId && w.status === 'in_progress').forEach((w) => { holdCore(w.id, 'عطل ' + (mc ? mc.id + ' ' + mc.name : ln.name) + ' — أمر صيانة ' + id); held.push(w.id); });
    if (ln.status !== 'down') setLineStatusCore(o.lineId, 'down', o.title, { machineId: o.machineId, mwoId: id, category: 'breakdown', silent: true });
    else openDowntime({ lineId: o.lineId, machineId: o.machineId, reason: o.title, category: 'breakdown', mwoId: id });
    safeNotify({ title: 'بلاغ عطل عاجل: ' + ln.name, body: (mc ? mc.id + ' ' + mc.name + ' — ' : '') + o.title + (held.length ? ' · أوامر متوقفة: ' + held.join('، ') : ''), level: 'urgent', to: ['R-18', 'R-05'], link: '#/care/maintenance/' + id });
    return { mwo, held };
  }
  function runMRPCore() {
    const rows = F.mrp(); st.set('mfgMrp', { at: ERP.now(), by: me(), rows });
    SA.audit('MRP.RUN', { target: { type: 'mrp', id: 'MRP-' + today(), label: 'تخطيط احتياجات المواد' }, after: { suggestions: rows.length, woDriven: rows.filter((r) => r.need > 0).length } });
    return rows;
  }
  function updateBomLineCore(bomId, idx, qty, scrapPct, reason) {
    const b = ERP.find('boms', bomId); if (!b || !b.lines[idx]) return null; const l = b.lines[idx];
    const before = { item: l.itemId, qty: l.qty, scrapPct: l.scrapPct, version: b.version };
    st.patch('boms', bomId, (x) => { x.lines[idx].qty = qty; x.lines[idx].scrapPct = scrapPct; x.version = (x.version || 1) + 1; x.updatedAt = ERP.now(); x.approvedBy = me(); x.history = (x.history || []).concat([{ at: ERP.now(), by: me(), itemId: l.itemId, from: before.qty, to: qty, fromScrap: before.scrapPct, toScrap: scrapPct, version: x.version, reason: reason || '' }]); });
    const after = { item: l.itemId, qty, scrapPct, version: before.version + 1 };
    SA.audit('BOM.UPDATED', { target: { type: 'bom', id: bomId, label: b.name }, before, after, reason: reason || '' });
    safeNotify({ title: 'تعديل تركيبة: ' + b.name, body: ERP.itemName(l.itemId) + ' ' + before.qty + ' ← ' + qty + ' (إصدار ' + after.version + '). راجع التكلفة المعيارية.', level: 'info', to: ['R-22', 'R-05'], link: '#/mfg/bom/' + bomId });
    return ERP.find('boms', bomId);
  }
  function logReport(wo, good, scrap, shift) {
    ensure('mfgShiftLog');
    st.insert('mfgShiftLog', { id: 'SL-R' + Date.now().toString(36), at: ERP.now(), lineId: wo.lineId, woId: wo.id, good, scrap, shift, src: 'report' }, true);
    st.patch('workOrders', wo.id, (w) => { if (w.reports && w.reports[0]) w.reports[0].shift = shift; w.shift = shift; });
  }

  /* ── UI wrappers ── */
  async function uiHold(woId) {
    const wo = ERP.find('workOrders', woId); if (!wo) return;
    const r = await SA.confirm({ title: 'إيقاف أمر التشغيل ' + woId, icon: 'alert', danger: false, reasonRequired: true, reasonLabel: 'سبب الإيقاف', reasonPlaceholder: 'مثال: انتظار خامات / عطل / طلب العميل…', confirmLabel: 'إيقاف الأمر',
      impact: ['الحالة: ' + ((SA.catalog.status.wo[wo.status] || [])[0] || wo.status) + ' ← متوقف', wo.soId ? 'إشعار للمبيعات واللوجستيات (' + wo.soId + ')' : 'أمر للمخزون — بدون إشعار للعميل', 'يُسجّل WO.HELD في سجل التدقيق'] });
    if (!r.ok) return;
    try { await SA.api(() => holdCore(woId, r.reason)); } catch (e) { return SA.fail(e); }
    SA.toast('تم إيقاف ' + woId, 'success');
  }
  async function uiResume(woId) {
    const wo = ERP.find('workOrders', woId); if (!wo) return; const ln = ERP.line(wo.lineId);
    if (ln && ln.status === 'down') { SA.toast('الخط ' + ln.name + ' متوقف — أصلح العطل وغيّر حالة الخط أولًا.', 'warn'); return; }
    const r = await SA.confirm({ title: 'استئناف ' + woId, icon: 'play', reason: true, reasonLabel: 'ملاحظة', confirmLabel: 'استئناف التشغيل', impact: ['سبب الإيقاف السابق: ' + (wo.holdReason || '—'), 'الأمر يعود للتشغيل على ' + (ln ? ln.name : wo.lineId)] });
    if (!r.ok) return;
    try { await SA.api(() => resumeCore(woId, r.reason)); } catch (e) { return SA.fail(e); }
    SA.toast('تم استئناف ' + woId, 'success');
  }
  function lockReason(perm) { return SA.can(perm) ? '' : 'ليست من صلاحياتك (' + perm + ')'; }
  async function uiRelease(woId) {
    const wo = ERP.find('workOrders', woId); if (!wo) return;
    const mats = F.woMaterials(woId); const short = mats.filter((m) => m.short > 0);
    if (short.length) return openShortages(woId, short);
    const r = await SA.confirm({ title: 'إطلاق ' + woId + ' وصرف الخامات', icon: 'play', confirmLabel: 'إطلاق وصرف الخامات',
      impact: ['صرف ' + mats.length + ' خامة من مخزن الخامات/الإكسسوارات على أمر التشغيل (اللوط ' + wo.lot + ')', 'قيد آلي: من ح/ مخزون تحت التشغيل 1142 إلى ح/ مخزون خامات 1141', 'الحالة: مخطط ← مُطلق (صُرفت الخامات)'] });
    if (!r.ok) return;
    let res; try { res = await SA.api(() => F.releaseWO(woId)); } catch (e) { return SA.fail(e); }
    if (res && res.ok) { const w = ERP.find('workOrders', woId); SA.toast('تم إطلاق ' + woId + ' وصرف الخامات' + (U.canCost() && w.issuedValue ? ' — قيمة الصرف ' + ERP.fmt.money(w.issuedValue) : ''), 'success'); }
    else if (res && res.shortages) openShortages(woId, res.shortages);
    else SA.toast('لا يمكن إطلاق الأمر في حالته الحالية.', 'warn');
  }
  function openShortages(woId, short) {
    const rows = short.map((m) => h('tr.is-short', {}, td(U.itemCell(m.itemId)), td(qtyU(m.need, m.itemId), 'num'), td(qtyU(m.avail, m.itemId), 'num'), td(h('b.num', { style: { color: 'var(--color-danger)' } }, qtyU(m.short, m.itemId)))));
    const md = SA.modal({ title: 'نقص خامات — ' + woId, icon: 'alert', danger: true, size: 'lg',
      body: h('div', {}, SA.alert('warning', 'الرصيد المتاح لا يكفي لإطلاق الأمر بالكامل. اختر: إنشاء طلبات شراء للنقص (الأمر يبقى مخططًا) أو إطلاق جزئي بالمتاح الآن.'), miniTable(['الخامة', 'المطلوب', 'المتاح', 'النقص'], rows)),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'),
        SA.btn({ label: 'إطلاق جزئي بالمتاح', icon: 'play', kind: 'ghost', perm: 'mfg.workorders.release', onClick: async () => {
          const r = await SA.confirm({ title: 'إطلاق جزئي ' + woId, danger: true, confirmLabel: 'إطلاق جزئي', impact: ['يُصرف المتاح فقط من كل خامة', short.length + ' خامة ناقصة — قد يتوقف التشغيل لاحقًا', 'يُسجّل WO.RELEASED'] });
          if (!r.ok) return; try { await SA.api(() => F.releaseWO(woId, { force: true })); } catch (e) { return SA.fail(e); }
          md.close(); SA.toast('تم الإطلاق الجزئي لـ ' + woId, 'success'); } }),
        SA.btn({ label: 'أنشئ طلبات شراء', icon: 'cart', kind: 'primary', perm: 'scm.requisitions.create', onClick: async () => {
          const n0 = get('purchaseRequisitions').length; try { await SA.api(() => F.releaseWO(woId, { raisePR: true })); } catch (e) { return SA.fail(e); }
          const n = get('purchaseRequisitions').length - n0; md.close(); SA.toast('تم إنشاء ' + n + ' طلب شراء لقسم المشتريات — الأمر يبقى مخططًا حتى وصول الخامات.', 'success'); } })] });
  }
  function shiftSeg(cur, onChange) { return h('div.mfg-seg-lg', {}, SA.segmented(SHIFTS.map((s) => [s[0], s[1] + ' · ' + SHIFT_HOURS[s[0]]]), cur, onChange)); }
  function uiStart(woId) {
    const wo = ERP.find('workOrders', woId); if (!wo) return; const ln = ERP.line(wo.lineId); let shift = shiftNow();
    if (ln && ln.status === 'down') { SA.toast('الخط ' + ln.name + ' متوقف — لا يمكن بدء التشغيل.', 'warn'); return; }
    const other = ln && ln.currentWoId && ln.currentWoId !== woId ? ERP.find('workOrders', ln.currentWoId) : null;
    const md = SA.modal({ title: 'بدء تشغيل ' + woId, icon: 'play', size: 'md',
      body: h('div', {}, SA.kv([['المنتج', U.itemCell(wo.itemId)], ['الخط', ln ? ln.name : wo.lineId], ['الكمية', qtyU(wo.qty, wo.itemId)]]), h('p.label', { style: { marginTop: '14px' } }, 'الوردية'), shiftSeg(shift, (v) => { shift = v; }),
        other && other.status === 'in_progress' ? SA.alert('warning', 'الأمر ' + other.id + ' قيد التشغيل حاليًا على نفس الخط — سيصبح ' + woId + ' هو الأمر الحالي للخط.') : null),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'بدء التشغيل', icon: 'play', perm: 'mfg.workorders.edit', onClick: async () => {
        try { await SA.api(() => F.startWO(woId, shift)); } catch (e) { return SA.fail(e); } md.close(); SA.toast('بدأ تشغيل ' + woId + ' — ' + SHIFTS.find((s) => s[0] === shift)[1], 'success'); } })] });
  }
  /** report production (good/scrap). When the WO reaches its quantity ERP.flow moves it to qc_pending + creates the final QC — shown in a follow-up dialog. */
  function uiReport(woId, o) {
    o = o || {}; const wo = ERP.find('workOrders', woId); if (!wo) return; const rem = remaining(wo); let shift = o.shift || shiftNow();
    const fGood = SA.form.field({ name: 'good', label: 'الكمية السليمة (' + uomOf(wo.itemId) + ')', type: 'number', value: '', required: true, min: 0, class: 'mfg-numin' });
    const fScrap = SA.form.field({ name: 'scrap', label: 'الهالك', type: 'number', value: 0, min: 0, class: 'mfg-numin' });
    const quick = h('div.mfg-quick', {}, [10, 50, 100].map((n) => h('button.btn.btn-ghost', { type: 'button', onclick: () => fGood.set((Number(fGood.get()) || 0) + n) }, '+' + n)), rem > 0 ? h('button.btn.btn-ghost', { type: 'button', onclick: () => fGood.set(rem) }, 'المتبقي كله (' + num(rem) + ')') : null);
    const md = SA.modal({ title: 'تسجيل إنتاج — ' + woId, subtitle: ERP.itemName(wo.itemId), icon: 'activity', size: 'md',
      body: h('div', {}, h('div.mfg-kpi-row', {}, stat('الكمية', num(wo.qty)), stat('المنجز', num(wo.qtyDone || 0)), stat('المتبقي', num(rem), rem ? 'warning' : 'success')),
        h('div.mfg-form-grid', {}, h('div', {}, fGood.el, quick), fScrap.el), h('p.label', { style: { marginTop: '10px' } }, 'الوردية'), shiftSeg(shift, (v) => { shift = v; }),
        h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'عند اكتمال الكمية ينتقل الأمر تلقائيًا لـ«بانتظار الجودة» ويُفتح فحص نهائي للمفتش.'))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'حفظ الإنتاج', icon: 'check', perm: 'mfg.shopfloor.report', onClick: async () => {
        const g = Number(fGood.get()) || 0, s = Number(fScrap.get()) || 0;
        if (g < 0 || s < 0) return fGood.error('قيم غير صحيحة');
        if (g + s <= 0) return fGood.error('أدخل كمية سليمة أو هالك');
        if (g > Math.max(rem, 1) * 1.2) return fGood.error('الكمية أكبر من المتبقي (' + num(rem) + ') بأكثر من 20%');
        let w2; try { w2 = await SA.api(() => { const r = F.reportWO(woId, g, s); logReport(wo, g, s, shift); return ERP.find('workOrders', woId); }); } catch (e) { return SA.fail(e); }
        md.close();
        if (w2 && w2.status === 'qc_pending') {
          SA.toast('اكتمل ' + woId + ' — انتقل تلقائيًا للجودة (' + w2.qcId + ')', 'success');
          const d = SA.modal({ title: 'اكتمل أمر التشغيل ' + woId, icon: 'checkcircle', size: 'sm', body: h('div.sap-confirm', {}, h('p', {}, 'تم تسجيل ' + num(w2.qtyDone) + ' ' + uomOf(w2.itemId) + ' — الأمر الآن ', U.status('wo', 'qc_pending'), '.'), h('ul', {}, h('li', {}, 'تم إنشاء فحص نهائي ', U.docLink(w2.qcId), ' وإشعار مسؤول الجودة.'), w2.soId ? h('li', {}, 'بعد اعتماد الفحص تدخل الكمية مخزن المنتج التام ويُحجز لأمر البيع ', U.docLink(w2.soId), '.') : null)),
            foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close() }, 'تم'), SA.can('mfg.qc.view') ? SA.btn({ label: 'فتح فحص الجودة', icon: 'checkcircle', onClick: () => { d.close(); SA.nav('mfg/qc/' + w2.qcId); } }) : null] });
        } else SA.toast('تم تسجيل ' + num(g) + ' سليم' + (s ? ' و' + num(s) + ' هالك' : '') + ' على ' + woId, 'success');
        if (o.onDone) o.onDone(w2);
      } })] });
  }
  /** create work order modal (shared: dashboard, list, MPS suggestion) */
  function openCreateWO(pre) {
    pre = pre || {};
    const fg = get('items').filter((i) => i.kind === 'fg' && i.bomId).sort((a, b) => (a.family + a.code < b.family + b.code ? -1 : 1));
    const openSO = get('salesOrders').filter((s) => ['confirmed', 'in_production', 'partially_delivered'].indexOf(s.status) >= 0);
    const fItem = SA.form.field({ name: 'itemId', label: 'المنتج', type: 'select', required: true, value: pre.itemId || '', options: [['', 'اختر المنتج…']].concat(fg.map((i) => [i.id, ERP.families[i.family].split(' ')[0] + ' — ' + i.name])), onChange: () => { syncLine(); preview(); } });
    const fQty = SA.form.field({ name: 'qty', label: 'الكمية', type: 'number', required: true, value: pre.qty || '', min: 1, onInput: () => preview() });
    const fLine = SA.form.field({ name: 'lineId', label: 'خط الإنتاج', type: 'select', value: pre.lineId || '', options: get('lines').map((l) => [l.id, l.id + ' · ' + l.name + (l.status === 'down' ? ' (متوقف)' : '')]), onChange: () => preview() });
    const fStart = SA.form.field({ name: 'plannedStart', label: 'بداية مخططة', type: 'date', required: true, value: pre.plannedStart || ERP.day(1) });
    const fDue = SA.form.field({ name: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date', value: pre.dueDate || '' });
    const fPri = SA.form.field({ name: 'priority', label: 'الأولوية', type: 'select', value: pre.priority || 'normal', options: [['normal', 'عادية'], ['high', 'أولوية عالية']] });
    const fSo = SA.form.field({ name: 'soId', label: 'أمر البيع (اختياري)', type: 'select', value: pre.soId || '', options: [['', '— إنتاج للمخزون —']].concat(openSO.map((s) => [s.id, s.id + ' — ' + ERP.customerName(s.customerId)])), onChange: (v) => { const so = v && ERP.find('salesOrders', v); if (so && !fDue.get()) fDue.set(so.promisedDate); } });
    const prev = h('div.mfg-wo-prev');
    function syncLine() { const id = fItem.get(); if (id) fLine.set(F.lineFor(id)); }
    function preview() {
      SA.clear(prev); const id = fItem.get(), q = Number(fQty.get()) || 0; if (!id || q <= 0) { prev.append(h('span.mfg-muted', {}, 'اختر المنتج والكمية لعرض فحص الخامات والطاقة.')); return; }
      const mats = ERP.materialsFor(id, q).map((m) => Object.assign(m, { avail: K.available(m.itemId, K.defaultWh(m.itemId)) })); const sh = mats.filter((m) => m.qty > m.avail);
      const lid = fLine.get() || F.lineFor(id); const shifts = Math.ceil(q / capPerShift(lid, id)); const ln = ERP.line(lid);
      prev.append(h('div', {}, SA.icon(sh.length ? 'alert' : 'checkcircle', 'icon-sm'), ' ', sh.length ? h('b', { style: { color: 'var(--color-danger)' } }, 'نقص في ' + sh.length + ' خامة: ' + sh.slice(0, 3).map((m) => ERP.itemName(m.itemId)).join('، ')) : h('b', { style: { color: 'var(--color-success)' } }, 'كل الخامات (' + mats.length + ') متاحة بالمخزون')),
        h('div', {}, SA.icon('clock', 'icon-sm'), ' يحتاج ', h('b.num', {}, String(shifts)), ' وردية على ' + (ln ? ln.name : lid) + (ln && ln.status === 'down' ? ' — الخط متوقف حاليًا' : '')),
        ln && famOf(id) !== ln.family ? h('div', { style: { color: 'var(--color-danger)' } }, SA.icon('alert', 'icon-sm'), ' الخط المختار لا يناسب عائلة المنتج') : null,
        h('div', {}, SA.icon('coins', 'icon-sm'), ' التكلفة المعيارية: ', U.cost((item(id).stdCost || 0) * q)));
    }
    if (pre.itemId && !pre.lineId) syncLine();
    preview();
    const md = SA.modal({ title: 'أمر تشغيل جديد', icon: 'plus', size: 'lg',
      body: h('div', {}, h('div.mfg-form-grid', {}, fItem.el, fQty.el, fLine.el, fPri.el, fStart.el, fDue.el, fSo.el), prev),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'إنشاء أمر التشغيل', icon: 'check', perm: 'mfg.workorders.create', onClick: async () => {
        const g = SA.form.group([fItem, fQty, fStart]); if (!g.validate()) return; const v = Object.assign(g.get(), { lineId: fLine.get(), dueDate: fDue.get(), priority: fPri.get(), soId: fSo.get() });
        if (!(Number(v.qty) > 0)) return fQty.error('أدخل كمية أكبر من صفر');
        const ln = ERP.line(v.lineId); if (ln && famOf(v.itemId) !== ln.family) return fLine.error('الخط لا يناسب عائلة المنتج (' + ERP.families[famOf(v.itemId)] + ')');
        let wo; try { wo = await SA.api(() => { const w = F.createWO({ itemId: v.itemId, qty: Number(v.qty), lineId: v.lineId || null, plannedStart: v.plannedStart, dueDate: v.dueDate || null, priority: v.priority, soId: v.soId || null }); if (v.soId) st.patch('salesOrders', v.soId, (s) => { s.woIds = (s.woIds || []).concat([w.id]); if (s.status === 'confirmed') s.status = 'in_production'; }); return w; }); } catch (e) { return SA.fail(e); }
        md.close(); SA.toast('تم إنشاء ' + wo.id + ' — ' + ERP.itemName(wo.itemId), 'success'); if (pre.onDone) pre.onDone(wo); else SA.nav('mfg/workorders/' + wo.id);
      } })] });
  }

  /* ═════════════════════════ 1. mfg-dashboard ═════════════════════════ */
  let outMode = 'qty';
  function dashBuild() {
    const lines = get('lines'); const wos = get('workOrders'); const pd = get('prodDaily');
    const outs = lines.map((ln) => outToday(ln.id)); const goodToday = outs.reduce((s, o) => s + o.good, 0); const planTodayAll = lines.reduce((s, ln) => s + planToday(ln), 0);
    const sumPd = (from, to, f) => pd.filter((r) => r.date >= ERP.day(from) && r.date <= ERP.day(to)).reduce((s, r) => s + f(r), 0);
    const week = sumPd(-6, -1, (r) => r.good) + goodToday; const prevWeek = sumPd(-13, -7, (r) => r.good);
    const sc7 = sumPd(-7, -1, (r) => r.scrap) / Math.max(1, sumPd(-7, -1, (r) => r.good + r.scrap)); const scPrev = sumPd(-14, -8, (r) => r.scrap) / Math.max(1, sumPd(-14, -8, (r) => r.good + r.scrap));
    const plantOee = lines.length ? lines.reduce((s, ln) => s + oeeOf(ln), 0) / lines.length : 0;
    const late = wos.filter(isLate), risk = wos.filter(atRisk), qcp = wos.filter((w) => w.status === 'qc_pending');
    const mk = today().slice(0, 7); const dtMonth = pd.filter((r) => r.date.slice(0, 7) === mk).reduce((s, r) => s + (r.downtimeMin || 0), 0) + get('downtime').filter((d) => !d.end).reduce((s, d) => s + minsSince(d.start), 0);
    const shorts = shortages();
    const days14 = Array.from({ length: 14 }, (_, i) => ERP.day(i - 14));
    const dayTot = days14.map((d) => pd.filter((r) => r.date === d).reduce((s, r) => s + r.good, 0));
    const down = lines.filter((l) => l.status === 'down');

    const head = SA.pageHead({ title: 'لوحة التصنيع', desc: 'حالة الخطوط الأربعة الآن، الإنتاج مقابل الخطة، الهالك والتوقفات — ومن يحتاج قرارك.', tags: [U.demo('عدّادات الخطوط تجريبية')],
      actions: [SA.can('mfg.shopfloor.view') ? SA.btn({ label: 'أرضية المصنع', icon: 'monitor', kind: 'ghost', onClick: () => SA.nav('mfg/shopfloor') }) : null, SA.btn({ label: 'أمر تشغيل جديد', icon: 'plus', perm: 'mfg.workorders.create', onClick: () => openCreateWO() })] });

    const banners = down.map((ln) => { const m = breakdownMwo(ln.id); const held = wos.filter((w) => w.lineId === ln.id && w.status === 'on_hold'); const sos = Array.from(new Set(held.map((w) => w.soId).filter(Boolean)));
      return SA.alert('danger', h('b', {}, ln.name + ' (' + ln.id + ') متوقف منذ ' + durTxt(minsSince(ln.downSince)) + ' — ' + (ln.downReason || 'عطل')), h('div', { style: { marginTop: '4px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' } },
        m ? h('span', {}, 'أمر الصيانة ', mwoLink(m.id), ' ', U.status('mwo', m.status)) : null, held.length ? h('span', {}, 'أوامر متوقفة: ', held.map((w) => U.docLink(w.id))) : null, sos.length ? h('span', {}, 'أوامر بيع متأثرة: ', sos.map((s) => h('span', {}, U.docLink(s), ' ', h('small.mfg-muted', {}, soCustomer(s) + ' ')))) : null)); });

    const kpis = U.kpis([
      U.kpi({ label: 'إنتاج اليوم (كل الخطوط)', value: num(goodToday), sub: 'خطة اليوم ' + num(planTodayAll) + ' وحدة', icon: 'activity', href: '#/mfg/shopfloor' }),
      U.kpi({ label: 'إنتاج آخر 7 أيام', value: num(week), delta: prevWeek ? (week - prevWeek) / prevWeek : null, sub: 'مقابل الأسبوع السابق', trend: dayTot, icon: 'chart' }),
      U.kpi({ label: 'OEE المصنع', value: pct(plantOee), sub: 'متوسط الخطوط · المستهدف 75%', icon: 'gauge', tone: plantOee < 0.65 ? 'danger' : plantOee < 0.75 ? 'warning' : 'success', href: '#/mfg/lines' }),
      U.kpi({ label: 'نسبة الهالك (7 أيام)', value: pct(sc7, 1), delta: scPrev ? (sc7 - scPrev) / scPrev : null, inverse: true, sub: 'المستهدف ≤ 2.5%', icon: 'trash', tone: sc7 > 0.03 ? 'warning' : null }),
      U.kpi({ label: 'أوامر متأخرة / معرضة', value: num(late.length) + ' / ' + num(risk.length), sub: risk.length ? 'متوقفة أو على خط معطل' : 'لا توجد مخاطر', icon: 'clock', tone: late.length ? 'danger' : risk.length ? 'warning' : null, href: '#/mfg/workorders?status=on_hold' }),
      U.kpi({ label: 'بانتظار الجودة', value: num(qcp.length), sub: qcp.length ? qcp.map((w) => w.id).slice(0, 2).join('، ') : 'لا يوجد', icon: 'checkcircle', tone: qcp.length ? 'warning' : null, href: '#/mfg/workorders?status=qc_pending' }),
      U.kpi({ label: 'ساعات التوقف هذا الشهر', value: num(dtMonth / 60, 1), sub: 'من سجل الخطوط + التوقف الجاري', icon: 'alert', tone: down.length ? 'danger' : null }),
      U.kpi({ label: 'نقص خامات لأوامر مخططة', value: num(shorts.length), sub: shorts.length ? shorts.slice(0, 2).map((x) => ERP.itemName(x.itemId)).join('، ') : 'كل الخامات متاحة', icon: 'layers', tone: shorts.length ? 'warning' : 'success', href: '#/mfg/mrp' })
    ]);

    const lineCards = h('div.mfg-lines', {}, lines.map((ln, i) => lineCard(ln, outs[i])));

    // charts
    const outHost = h('div');
    const drawOut = () => { SA.clear(outHost);
      if (outMode === 'qty') outHost.append(CH.columns({ labels: days14.map(shortDate), stacked: true, height: 230, fmt: (v) => num(v), series: lines.map((ln) => ({ name: ln.id + ' ' + ln.name.replace('خط ', ''), color: LINE_COLOR[ln.id], values: days14.map((d) => (pd.find((r) => r.date === d && r.lineId === ln.id) || {}).good || 0) })) }));
      else outHost.append(CH.line({ labels: days14.map(shortDate), height: 230, fmt: (v) => Math.round(v) + '%', series: lines.map((ln) => ({ name: ln.id, color: LINE_COLOR[ln.id], values: days14.map((d) => { const r = pd.find((x) => x.date === d && x.lineId === ln.id); return r ? Math.round((r.good / r.planned) * 100) : null; }) })) }));
    }; drawOut();
    const outCard = SA.card({ title: 'الإنتاج آخر 14 يومًا حسب الخط', actions: [SA.segmented([['qty', 'الكمية'], ['plan', '% من الخطة']], outMode, (v) => { outMode = v; drawOut(); })] }, outHost, h('p.mfg-muted', {}, 'الكمية بوحدة كل خط (باب / قطعة تجاليد / لوح). مصدر البيانات: سجل الإنتاج اليومي.'));
    const scrapCard = SA.card({ title: 'اتجاه نسبة الهالك' }, CH.line({ labels: days14.map(shortDate), height: 210, area: true, fmt: (v) => (v == null ? '—' : v.toFixed(1) + '%'), series: [{ name: 'هالك المصنع', values: days14.map((d) => { const r = pd.filter((x) => x.date === d); const g = r.reduce((s, x) => s + x.good + x.scrap, 0); return g ? Math.round((r.reduce((s, x) => s + x.scrap, 0) / g) * 1000) / 10 : null; }) }, { name: 'المستهدف 2.5%', dashed: true, color: '#b9141b', values: days14.map(() => 2.5) }] }));
    const cats = {}; get('downtime').forEach((d) => { const m = d.end ? d.minutes || 0 : minsSince(d.start); const c = cats[d.category] || (cats[d.category] = { min: 0, n: 0, reasons: {} }); c.min += m; c.n++; c.reasons[d.reason] = (c.reasons[d.reason] || 0) + m; });
    const catRows = Object.keys(cats).map((k) => ({ k, min: cats[k].min, n: cats[k].n, top: Object.keys(cats[k].reasons).sort((a, b) => cats[k].reasons[b] - cats[k].reasons[a])[0] })).sort((a, b) => b.min - a.min); const totDt = catRows.reduce((s, r) => s + r.min, 0) || 1; let cum = 0;
    const paretoCard = SA.card({ title: 'باريتو التوقفات حسب السبب' }, catRows.length ? CH.bars(catRows.map((r) => { cum += r.min; return { label: DT_CAT[r.k] || r.k, sub: r.n + ' حالة · ' + r.top + ' · تراكمي ' + Math.round((cum / totDt) * 100) + '%', value: r.min / 60, color: r.k === 'breakdown' ? 'var(--color-danger)' : ERP.palette[1] }; }), { fmt: (v) => num(v, 1) + ' س' }) : SA.empty({ icon: 'checkcircle', title: 'لا توقفات مسجلة' }), h('p.mfg-muted', { style: { marginTop: '8px' } }, 'من سجل التوقفات (آخر 30 يومًا) — التوقف الجاري محسوب حتى الآن.'));
    const stCount = {}; wos.filter((w) => w.status !== 'closed').forEach((w) => { stCount[w.status] = (stCount[w.status] || 0) + 1; });
    const SC = { planned: '#8a8a8a', released: '#7d9cd1', in_progress: '#012864', on_hold: '#b9141b', qc_pending: '#c9a227', completed: '#147a3d' };
    const donutCard = SA.card({ title: 'حالة أوامر التشغيل' }, CH.donut(Object.keys(SC).filter((k) => stCount[k]).map((k) => ({ label: SA.catalog.status.wo[k][0], value: stCount[k], color: SC[k] })), { center: num(wos.filter(isOpen).length), sub: 'أمر مفتوح' }));

    // needs attention
    const att = [];
    down.forEach((ln) => { const m = breakdownMwo(ln.id); att.push({ tone: 'danger', icon: 'alert', title: ln.name + ' متوقف — ' + (ln.downReason || ''), sub: 'منذ ' + durTxt(minsSince(ln.downSince)) + (m ? ' · ' + m.id + ' (' + SA.catalog.status.mwo[m.status][0] + ')' : ''), href: m ? '#/care/maintenance/' + m.id : '#/mfg/lines/' + ln.id, cta: m ? 'أمر الصيانة' : 'الخط' }); });
    wos.filter((w) => w.status === 'on_hold').forEach((w) => att.push({ tone: 'danger', icon: 'clipboard', title: w.id + ' متوقف — ' + ERP.itemName(w.itemId), sub: (w.holdReason || '') + (w.soId ? ' · ' + w.soId + ' ' + soCustomer(w.soId) + ' · تسليم ' + ERP.fmt.date(w.dueDate) : ''), href: '#/mfg/workorders/' + w.id }));
    late.forEach((w) => att.push({ tone: 'warning', icon: 'clock', title: w.id + ' متأخر عن ' + (w.dueDate && w.dueDate < today() ? 'تاريخ الاستحقاق ' + ERP.fmt.date(w.dueDate) : 'نهاية الخطة ' + ERP.fmt.date(w.plannedEnd)), sub: ERP.itemName(w.itemId) + ' · ' + num(w.qtyDone || 0) + '/' + num(w.qty), href: '#/mfg/workorders/' + w.id }));
    qcp.forEach((w) => att.push({ tone: 'info', icon: 'checkcircle', title: w.id + ' بانتظار الفحص النهائي', sub: num(w.qtyDone) + ' ' + uomOf(w.itemId) + ' — ' + ERP.itemName(w.itemId) + (w.soId ? ' · ' + soCustomer(w.soId) : ''), href: w.qcId && SA.can('mfg.qc.view') ? '#/mfg/qc/' + w.qcId : '#/mfg/workorders/' + w.id, cta: 'الفحص' }));
    shorts.forEach((x) => att.push({ tone: 'warning', icon: 'layers', title: 'نقص ' + ERP.itemName(x.itemId) + ': ' + qtyU(x.short, x.itemId), sub: 'مطلوب لـ ' + x.wos.length + ' أمر مخطط · المتاح ' + qtyU(x.avail, x.itemId), href: '#/mfg/mrp', cta: 'MRP' }));
    get('machines').filter((m) => m.nextPMAt && m.nextPMAt < today() && m.status !== 'down').slice(0, 3).forEach((m) => att.push({ tone: 'warning', icon: 'wrench', title: 'صيانة وقائية متأخرة: ' + m.id + ' ' + m.name, sub: 'كانت مستحقة ' + ERP.fmt.date(m.nextPMAt) + (m.lineId ? ' · ' + m.lineId : ''), href: '#/care/assets/' + m.id, cta: 'الماكينة' }));
    const ins = U.insights('mfg');
    const attnCard = SA.card({ title: 'يحتاج انتباهك', tags: [h('span.sap-count', {}, String(att.length))] }, att.length ? h('ul.mfg-attn', {}, att.slice(0, 9).map(attnItem)) : SA.empty({ icon: 'checkcircle', title: 'كل الخطوط تعمل حسب الخطة' }));
    const aiCard = SA.card({ title: 'توصيات ذكية' }, ins.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, ins) : h('p.mfg-muted', {}, 'التوصيات الذكية للتصنيع تظهر هنا عند تفعيل المساعد الذكي.'));

    return h('div', {}, head, banners, kpis, lineCards, U.grid(2, outCard, scrapCard), U.grid(2, paretoCard, donutCard), U.grid(2, attnCard, aiCard));
  }
  function lineCard(ln, o) {
    const w = currentWO(ln); const feed = !w ? feedsFor(ln) : null; const plan = planToday(ln); const exp = Math.round(plan * dayFraction(ln)); const m = ln.status === 'down' ? breakdownMwo(ln.id) : null; const oe = ln.oee || {};
    const woBlock = w ? h('div.mfg-lc-wo', {}, h('div.mfg-lc-wo-top', {}, U.docLink(w.id), U.status('wo', w.status)), U.itemCell(w.itemId), CH.meter((w.qtyDone || 0) / w.qty, { label: 'تقدم الأمر', text: num(w.qtyDone || 0) + ' / ' + num(w.qty) }), w.soId ? h('small.mfg-muted', {}, 'لـ ', U.docLink(w.soId), ' ' + soCustomer(w.soId)) : null)
      : feed ? h('div.mfg-lc-wo', {}, h('small.mfg-muted', {}, 'يبثق بروفايلات الأبواب لـ'), h('div.mfg-lc-wo-top', {}, U.docLink(feed.id), h('span', {}, 'على ' + feed.lineId)), U.itemCell(feed.itemId)) : h('div.mfg-lc-wo', {}, h('span.mfg-muted', {}, 'لا يوجد أمر جارٍ'), nextWOs(ln.id)[0] ? h('small', {}, 'التالي: ', U.docLink(nextWOs(ln.id)[0].id)) : null);
    return h('div.card.mfg-lc.is-' + ln.status, {},
      h('div.mfg-lc-head', {}, h('div', {}, h('span.mfg-code', {}, ln.id), ' ', h('b', {}, ln.name), h('small', {}, ERP.families[ln.family] + ' · ' + (ln.shifts || []).length + ' ورديات · ' + num(ln.capacityPerShift) + ' ' + (ERP.uom[ln.uom] || '') + '/وردية')), U.status('line', ln.status)),
      ln.status === 'down' ? h('div.mfg-down-note', {}, SA.icon('alert', 'icon-sm'), h('span', {}, 'متوقف منذ ' + durTxt(minsSince(ln.downSince)) + ' — ' + (ln.downReason || 'عطل'), m ? h('span', {}, ' · ', mwoLink(m.id)) : null)) : null,
      h('div.mfg-lc-mid', {}, CH.gauge(oeeOf(ln), { label: 'OEE', size: 112, good: 0.75, warn: 0.6 }),
        h('div.mfg-lc-out', {}, h('small', {}, 'إنتاج اليوم'), h('b.num', {}, num(o.good), ' ', h('span', {}, '/ ' + num(exp) + ' متوقع')),
          CH.meter(exp ? o.good / exp : ln.status === 'down' ? 0 : 1, { tone: ln.status === 'down' ? 'danger' : undefined }),
          h('div.mfg-apq.num', {}, h('span', {}, 'A ' + pct(oe.a)), h('span', {}, 'P ' + pct(oe.p)), h('span', {}, 'Q ' + pct(oe.q))))),
      woBlock,
      h('div.mfg-lc-foot', {}, h('span.mfg-muted', {}, 'خطة اليوم ' + num(plan) + ' · هالك ' + num(o.scrap)), h('a.erp-doc', { href: '#/mfg/lines/' + ln.id }, 'تفاصيل الخط')));
  }
  function dashRender(root, ctx) {
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'لوحة التصنيع' }]);
    return SA.live(root, dashBuild, ['lines', 'workOrders', 'downtime', 'maintenanceOrders', 'mfgShiftLog', 'machines']);
  }

  /* ═════════════════════════ 2. mfg-planning ═════════════════════════ */
  const DAYS = 10, FROM = -2; let mpsPipe = false;
  function woDrawer(woId) {
    const wo = ERP.find('workOrders', woId); if (!wo) return; const canEdit = SA.can('mfg.planning.edit'); const movable = ['planned', 'released', 'on_hold'].indexOf(wo.status) >= 0;
    const alt = get('lines').filter((l) => l.family === famOf(wo.itemId));
    const fLine = SA.form.field({ name: 'lineId', label: 'الخط', type: 'select', value: wo.lineId, options: alt.map((l) => [l.id, l.id + ' · ' + l.name + (l.status === 'down' ? ' (متوقف)' : '')]), disabled: !canEdit || wo.status !== 'planned' && wo.status !== 'released' || alt.length < 2 });
    const move = async (d) => { try { await SA.api(() => rescheduleCore(woId, d, null)); } catch (e) { return SA.fail(e); } dr.close(); SA.toast(woId + (d > 0 ? ' تأخر يومًا' : ' تقدّم يومًا') + ' — يبدأ ' + ERP.fmt.date(ERP.find('workOrders', woId).plannedStart), 'success'); };
    const dr = SA.drawer({ title: wo.id, subtitle: ERP.itemName(wo.itemId), size: 'md',
      body: h('div', {}, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' } }, U.status('wo', wo.status), priChip(wo.priority), isLate(wo) ? SA.chip('متأخر', 'danger') : null),
        SA.kv([['المنتج', U.itemCell(wo.itemId)], ['الكمية', num(wo.qtyDone || 0) + ' / ' + qtyU(wo.qty, wo.itemId)], ['الخط', lineLink(wo.lineId)], ['الفترة المخططة', ERP.fmt.date(wo.plannedStart) + ' ← ' + ERP.fmt.date(wo.plannedEnd)], ['الاستحقاق', ERP.fmt.date(wo.dueDate)], ['أمر البيع', wo.soId ? h('span', {}, U.docLink(wo.soId), ' ' + soCustomer(wo.soId)) : 'إنتاج للمخزون'], wo.holdReason ? ['سبب الإيقاف', wo.holdReason] : null]),
        h('h4', { style: { margin: '18px 0 8px' } }, 'إعادة الجدولة'),
        !movable ? h('p.mfg-muted', {}, 'لا يمكن نقل أمر في حالة «' + SA.catalog.status.wo[wo.status][0] + '».') : h('div', {},
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, SA.btn({ label: 'تقديم يوم', icon: 'arrowright', kind: 'ghost', perm: 'mfg.planning.edit', onClick: () => move(-1) }), SA.btn({ label: 'تأخير يوم', icon: 'arrowleft', kind: 'ghost', perm: 'mfg.planning.edit', onClick: () => move(1) })),
          alt.length > 1 ? h('div', { style: { marginTop: '12px' } }, fLine.el, SA.btn({ label: 'نقل للخط المختار', icon: 'swap', kind: 'ghost', size: 'sm', perm: 'mfg.planning.edit', reason: wo.status !== 'planned' && wo.status !== 'released' ? 'تغيير الخط متاح للأوامر المخططة/المُطلقة فقط' : '', onClick: async () => { const l = fLine.get(); if (l === wo.lineId) return SA.toast('اختر خطًا مختلفًا', 'warn'); try { await SA.api(() => rescheduleCore(woId, 0, l)); } catch (e) { return SA.fail(e); } dr.close(); SA.toast(woId + ' انتقل إلى ' + l, 'success'); } })) : h('p.mfg-muted', { style: { marginTop: '8px' } }, 'لا يوجد خط بديل لنفس عائلة المنتج (' + ERP.families[famOf(wo.itemId)] + ').'))),
      foot: [h('a.btn.btn-ghost', { href: '#/mfg/workorders/' + wo.id, onclick: () => dr.close() }, 'فتح أمر التشغيل')] });
  }
  function loadMatrix(days) {
    const lines = get('lines'); const L = {}; lines.forEach((l) => { L[l.id] = days.map(() => 0); });
    get('workOrders').filter((w) => ['planned', 'released', 'in_progress', 'on_hold'].indexOf(w.status) >= 0).forEach((w) => {
      const ps = w.plannedStart || today(), pe = w.plannedEnd || ps; const span = Math.max(1, dayIdx(ps, pe) + 1); const rem = w.status === 'planned' || w.status === 'released' ? w.qty : remaining(w);
      const ln = ERP.line(w.lineId); const perDay = rem / span;
      days.forEach((d, i) => { if (d < ps || d > pe) return; if (L[w.lineId]) L[w.lineId][i] += perDay / capPerDay(w.lineId, w.itemId);
        if (ln && ln.family === 'door') lines.filter((x) => x.family === 'door' && x.id !== w.lineId && !get('workOrders').some((y) => y.lineId === x.id && isOpen(y))).forEach((up) => { L[up.id][i] += perDay / capPerDay(up.id, w.itemId); }); });
    });
    return L;
  }
  function mpsRows() {
    const firm = ['confirmed', 'in_production', 'partially_delivered'], pipe = ['pending_approval', 'pending_review', 'draft'];
    const map = {};
    get('salesOrders').forEach((so) => { const isF = firm.indexOf(so.status) >= 0, isP = pipe.indexOf(so.status) >= 0; if (!isF && !isP) return;
      so.lines.forEach((l) => { const it = ERP.item(l.itemId); if (!it || it.kind !== 'fg') return; const r = map[l.itemId] || (map[l.itemId] = { itemId: l.itemId, family: it.family, firm: 0, pipe: 0, sos: [], due: null });
        const un = Math.max(0, l.qty - (l.reservedQty || 0)); if (isF) { r.firm += un; if (un > 0) { r.sos.push(so.id); if (!r.due || so.promisedDate < r.due) r.due = so.promisedDate; } } else r.pipe += l.qty; }); });
    return Object.values(map).map((r) => { r.avail = K.available(r.itemId, K.FG); r.wo = get('workOrders').filter((w) => w.itemId === r.itemId && ['planned', 'released', 'in_progress', 'on_hold', 'qc_pending'].indexOf(w.status) >= 0).reduce((s, w) => s + w.qty, 0); r.net = Math.max(0, Math.round(r.firm + (mpsPipe ? r.pipe : 0) - r.avail - r.wo)); return r; }).filter((r) => r.firm > 0 || r.pipe > 0).sort((a, b) => b.net - a.net || b.firm - a.firm);
  }
  function planningBuild(rerender) {
    const days = Array.from({ length: DAYS }, (_, i) => ERP.day(FROM + i)); const t = today(); const lines = get('lines'); const start = days[0];
    const wos = get('workOrders').filter((w) => w.status !== 'closed' && w.plannedStart && w.plannedEnd && w.plannedEnd >= days[0] && w.plannedStart <= days[DAYS - 1]);
    const head = h('div.mfg-g-row', {}, h('div.mfg-g-lab', {}, h('b', {}, 'الخط / اليوم')), h('div.mfg-g-days', {}, days.map((d) => h('div.mfg-g-day' + (d === t ? '.is-today' : d < t ? '.is-past' : ''), {}, h('b', {}, shortDate(d)), d === t ? 'اليوم' : wday(d)))));
    const rows = lines.map((ln) => {
      const mine = wos.filter((w) => w.lineId === ln.id).sort((a, b) => (a.plannedStart < b.plannedStart ? -1 : 1)); const lanes = []; const placed = mine.map((w) => { const si = Math.max(0, dayIdx(start, w.plannedStart)), ei = Math.min(DAYS - 1, dayIdx(start, w.plannedEnd)); let lane = lanes.findIndex((end) => end < si); if (lane < 0) { lane = lanes.length; lanes.push(ei); } else lanes[lane] = ei; return { w, si, ei, lane }; });
      const hgt = Math.max(1, lanes.length) * 36 + 10;
      const feed = !mine.length && ln.family === 'door' ? wos.filter((w) => famOf(w.itemId) === 'door' && w.lineId !== ln.id) : [];
      return h('div.mfg-g-row', {}, h('div.mfg-g-lab', {}, h('a', { href: '#/mfg/lines/' + ln.id }, ln.id + ' · ' + ln.name), h('span', {}, U.status('line', ln.status)), h('small.mfg-muted', {}, num(capPerDay(ln.id)) + ' ' + (ERP.uom[ln.uom] || '') + '/يوم')),
        h('div.mfg-g-track', { style: { height: hgt + 'px' } }, h('div.mfg-g-bg', {}, days.map((d) => h('span', { class: [d === t ? 'is-today' : '', ln.status === 'down' && d === t ? 'is-down' : ''] }))),
          placed.map((p) => h('button.mfg-bar.is-' + p.w.status + (p.w.priority === 'high' ? '.is-high' : ''), { type: 'button', title: p.w.id + ' — ' + ERP.itemName(p.w.itemId) + ' — ' + num(p.w.qty) + (p.w.soId ? ' — ' + p.w.soId + ' ' + soCustomer(p.w.soId) : '') + ' — ' + SA.catalog.status.wo[p.w.status][0], onclick: () => woDrawer(p.w.id), style: { insetInlineStart: 'calc(' + (p.si * 100) / DAYS + '% + 3px)', width: 'calc(' + ((p.ei - p.si + 1) * 100) / DAYS + '% - 6px)', top: 6 + p.lane * 36 + 'px' } }, h('b', {}, p.w.id.replace(/^WO-\d{4}-/, 'WO-') + ' · ' + num(p.w.qty)), h('span', {}, item(p.w.itemId).code + (p.w.soId ? ' · ' + p.w.soId.replace(/^SO-\d{4}-/, 'SO-') : '')))),
          !mine.length ? h('div', { style: { position: 'absolute', insetInlineStart: '12px', top: '12px', fontSize: '12.5px', color: 'var(--color-text-muted)' } }, feed.length ? 'بثق بروفايلات لأوامر الأبواب على L-02 (' + feed.length + ' أمر) — الحمل محسوب في الجدول بالأسفل' : 'لا أوامر في الفترة') : null));
    });
    const board = h('div.mfg-gantt', { style: { '--days': DAYS } }, h('div.mfg-g-scroll', {}, h('div.mfg-g-inner', {}, head, rows)));
    const legend = h('div.mfg-legend', {}, ['planned', 'released', 'in_progress', 'on_hold', 'qc_pending', 'completed'].map((k) => h('span', {}, h('i.mfg-bar.is-' + k, { style: { position: 'static', height: '10px', width: '14px', padding: 0, display: 'inline-block' } }), SA.catalog.status.wo[k][0])), h('span', {}, h('i', { style: { background: 'var(--color-accent)', width: '4px' } }), 'أولوية عالية'), h('span', {}, 'اضغط على الأمر لإعادة الجدولة'));
    const M = loadMatrix(days);
    const heat = h('div.table-wrap', {}, h('table.mfg-heat', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الخط'), days.map((d) => h('th', {}, shortDate(d))))), h('tbody', {}, lines.map((ln) => h('tr', {}, h('td.mfg-heat-lab', {}, ln.id + ' · ' + ln.name.replace('خط ', '')), days.map((d, i) => { const v = M[ln.id][i]; if (ln.status === 'down' && d === t) return h('td.is-down', { title: 'الخط متوقف' }, 'متوقف'); const c = v <= 0.01 ? 'l0' : v < 0.6 ? 'l1' : v < 0.9 ? 'l2' : v <= 1.0 ? 'l3' : 'l4'; return h('td.' + c, { title: Math.round(v * 100) + '% من طاقة اليوم' }, v <= 0.01 ? '—' : Math.round(v * 100) + '%'); }))))));
    const over = []; lines.forEach((ln) => days.forEach((d, i) => { if (M[ln.id][i] > 1.0) over.push(ln.id + ' ' + shortDate(d)); }));
    // MPS
    const mps = mpsRows(); const fam = {}; mps.forEach((r) => { const f = fam[r.family] || (fam[r.family] = { firm: 0, avail: 0, wo: 0, pipe: 0, net: 0 }); f.firm += r.firm; f.avail += r.avail; f.wo += r.wo; f.pipe += r.pipe; f.net += r.net; });
    const famCards = h('div.mfg-kpi-row', {}, Object.keys(fam).map((k) => h('div.mfg-stat' + (fam[k].net > 0 ? '.is-danger' : '.is-success'), {}, h('small', {}, ERP.families[k]), h('b.num', {}, fam[k].net > 0 ? 'نقص ' + num(fam[k].net) : 'مغطى'), h('small', {}, 'طلب مؤكد غير محجوز ' + num(fam[k].firm) + ' · مخزون متاح ' + num(fam[k].avail) + ' · أوامر تشغيل ' + num(fam[k].wo) + (fam[k].pipe ? ' · تحت الاعتماد ' + num(fam[k].pipe) : '')))));
    const mpsTable = SA.table({ rows: mps, rowId: 'itemId', pageSize: 8, search: { placeholder: 'بحث بالصنف…', keys: [(r) => ERP.itemName(r.itemId), (r) => item(r.itemId).code] }, filters: [{ key: 'family', label: 'العائلة', options: [['door', 'أبواب'], ['clad', 'تجاليد'], ['foam', 'فوم بورد']] }, { key: 'net', label: 'التغطية', options: [['short', 'يحتاج أمر تشغيل'], ['ok', 'مغطى']], test: (r, v) => (v === 'short' ? r.net > 0 : r.net <= 0) }],
      columns: [{ key: 'item', label: 'الصنف', render: (r) => U.itemCell(r.itemId) }, { key: 'firm', label: 'طلب مؤكد غير محجوز', sort: true, class: 'mfg-n', render: (r) => num(r.firm) }, { key: 'pipe', label: 'تحت الاعتماد', class: 'mfg-n', render: (r) => (r.pipe ? num(r.pipe) : '—') },
        { key: 'avail', label: 'متاح بالمخزون', class: 'mfg-n', render: (r) => num(r.avail) }, { key: 'wo', label: 'أوامر تشغيل مفتوحة', class: 'mfg-n', render: (r) => num(r.wo) }, { key: 'net', label: 'صافي النقص', sort: true, class: 'mfg-n', render: (r) => (r.net > 0 ? h('b', { style: { color: 'var(--color-danger)' } }, num(r.net)) : SA.chip('مغطى', 'success')) },
        { key: 'sos', label: 'أوامر البيع', render: (r) => (r.sos.length ? h('span', {}, r.sos.slice(0, 2).map((s) => [U.docLink(s), ' '])) : '—') }, { key: 'due', label: 'أقرب تسليم', render: (r) => ERP.fmt.date(r.due) },
        { key: 'act', label: '', render: (r) => (r.net > 0 ? SA.btn({ label: 'أنشئ أمر تشغيل', icon: 'plus', size: 'sm', kind: 'ghost', perm: 'mfg.workorders.create', onClick: () => openCreateWO({ itemId: r.itemId, qty: r.net, soId: r.sos[0] || '', dueDate: r.due || '', priority: 'high', onDone: (wo) => SA.toast('أُضيف ' + wo.id + ' للخطة', 'success') }) }) : null) }],
      empty: { icon: 'checkcircle', title: 'لا يوجد طلب مفتوح غير مغطى' } });
    return h('div', {}, SA.pageHead({ title: 'خطة الإنتاج والطاقة', desc: 'جدول ' + DAYS + ' أيام لكل خط، حمل الطاقة اليومي، وخطة الإنتاج الرئيسية (MPS) من أوامر البيع المفتوحة.', tags: [SA.tag('pending', 'قواعد الطاقة تجريبية')], actions: [SA.btn({ label: 'أمر تشغيل جديد', icon: 'plus', perm: 'mfg.workorders.create', onClick: () => openCreateWO({ onDone: (wo) => SA.toast('أُضيف ' + wo.id + ' للخطة', 'success') }) })] }),
      SA.card({ title: 'لوحة الجدولة' }, board, legend),
      SA.card({ title: 'حمل الطاقة اليومي (% من طاقة الخط)', tags: over.length ? [SA.chip(over.length + ' يوم فوق الطاقة', 'danger')] : null }, heat, h('p.mfg-muted', { style: { marginTop: '8px' } }, 'الحمل = الكمية المتبقية موزعة على أيام الأمر ÷ (طاقة الوردية × عدد الورديات) — الفوم بورد مُعدّل بالسُمك، وخط بثق الأبواب L-01 محمّل من أوامر الأبواب على L-02. ', U.demo('معادلة تجريبية'))),
      SA.card({ title: 'خطة الإنتاج الرئيسية (MPS) — الطلب مقابل المتاح', actions: [SA.segmented([['firm', 'الطلبات المؤكدة'], ['all', '+ الطلبات تحت الاعتماد']], mpsPipe ? 'all' : 'firm', (v) => { mpsPipe = v === 'all'; if (rerender) rerender(); })] }, famCards, mpsTable.el, h('p.mfg-muted', { style: { marginTop: '8px' } }, mpsPipe ? 'يشمل الطلبات تحت الاعتماد/المراجعة (مثل أوامر بانتظار الخصم أو قيمة الطلب) — اقتراح مبكر قبل التأكيد.' : 'صافي النقص = الطلب المؤكد غير المحجوز − المتاح بمخزن المنتج التام − أوامر التشغيل المفتوحة.')));
  }
  function planningRender(root, ctx) {
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'التخطيط' }, { label: 'خطة الإنتاج' }]);
    const run = () => { const sx = root.scrollTop, wy = window.scrollY; SA.clear(root); root.appendChild(planningBuild(run)); if (sx) root.scrollTop = sx; if (wy) window.scrollTo(0, wy); };
    run(); const offs = ['workOrders', 'lines', 'salesOrders', 'stock'].map((p) => st.subscribe(p, run)); return () => offs.forEach((f) => f());
  }

  /* ═════════════════════════ 3. mfg-mrp ═════════════════════════ */
  function mrpRender(root, ctx) {
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'التخطيط' }, { label: 'MRP' }]);
    const headHost = h('div'), tblHost = h('div'), woHost = h('div'); root.append(headHost, tblHost, woHost);
    const openPRQ = (itemId) => get('purchaseRequisitions').filter((r) => r.itemId === itemId && ['open', 'approved'].indexOf(r.status) >= 0);
    const needDate = (itemId) => { const ds = get('workOrders').filter((w) => w.status === 'planned' && ERP.materialsFor(w.itemId, 1).some((m) => m.itemId === itemId)).map((w) => w.plannedStart).sort(); return ds[0] || null; };
    const enrich = (r) => { const it = item(r.itemId); const sup = ERP.supplier(r.supplierId) || {}; const lead = it.leadDays || sup.importLeadDays || 7; const nd = needDate(r.itemId); const latest = nd ? addDays(nd, -lead) : today(); const prq = openPRQ(r.itemId); return Object.assign({}, r, { id: r.itemId, lead, needBy: nd, latest, late: latest < today(), prq, value: r.suggestQty * (it.stdCost || 0) }); };
    let tbl = null;
    function drawHead() {
      SA.clear(headHost); const snap = st.get('mfgMrp');
      headHost.append(SA.pageHead({ title: 'تخطيط احتياجات المواد (MRP)', desc: 'احتياج أوامر التشغيل المخططة + حدود الطلب مقابل الرصيد المتاح والكميات تحت الطلب — ثم طلبات شراء بضغطة.', tags: [U.demo('حدود الطلب والمهل تجريبية')],
        actions: [SA.btn({ label: 'تشغيل MRP', icon: 'refresh', perm: 'mfg.mrp.run', onClick: async () => { let rows; try { rows = await SA.api(() => runMRPCore()); } catch (e) { return SA.fail(e); } SA.toast('تم تشغيل MRP — ' + rows.length + ' اقتراح شراء', 'success'); } })] }),
        snap ? SA.alert('info', 'آخر تشغيل ', h('b', {}, SA.fmt.rel(snap.at)), ' بواسطة ' + SA.userName(snap.by) + ' — ' + snap.rows.length + ' اقتراح. الأرصدة والطلبات القائمة محدّثة لحظيًا.') : SA.alert('warning', 'لم يُشغَّل MRP في هذه الجلسة — المعروض معاينة لحظية. اضغط «تشغيل MRP» لتسجيل التشغيل واعتماد الاقتراحات.'));
    }
    function rows() { const snap = st.get('mfgMrp'); return (snap ? snap.rows : F.mrp()).map(enrich); }
    function drawTable() {
      SA.clear(tblHost);
      tbl = SA.table({ rows, pageSize: 10, selectable: true, initial: { sort: { key: 'latest', dir: 'asc' } }, search: { placeholder: 'بحث بالخامة أو المورد…', keys: [(r) => ERP.itemName(r.itemId), (r) => item(r.itemId).code, (r) => ERP.supplierName(r.supplierId)] },
        filters: [{ key: 'reason', label: 'السبب', options: [['wo', 'احتياج أوامر تشغيل'], ['rop', 'تحت حد الطلب']], test: (r, v) => (v === 'wo' ? r.need > 0 : r.need <= 0) }, { key: 'prqf', label: 'طلب شراء', options: [['none', 'بدون طلب قائم'], ['has', 'له طلب قائم']], test: (r, v) => (v === 'has' ? r.prq.length > 0 : !r.prq.length) }, { key: 'kind', label: 'النوع', options: [['rm', 'خامات'], ['pkg', 'تغليف'], ['acc', 'إكسسوارات']], test: (r, v) => item(r.itemId).kind === v }],
        columns: [{ key: 'item', label: 'الخامة', render: (r) => U.itemCell(r.itemId) }, { key: 'reason', label: 'السبب', render: (r) => SA.chip(r.reason, r.need > 0 ? 'info' : 'warning') },
          { key: 'need', label: 'احتياج الأوامر', class: 'mfg-n', sort: true, render: (r) => (r.need ? qtyU(r.need, r.itemId) : '—') }, { key: 'onHand', label: 'المتاح', class: 'mfg-n', render: (r) => qtyU(r.onHand, r.itemId) }, { key: 'onOrder', label: 'تحت الطلب', class: 'mfg-n', render: (r) => (r.onOrder ? qtyU(r.onOrder, r.itemId) : '—') },
          { key: 'short', label: 'النقص (حتى حد الطلب)', class: 'mfg-n', sort: true, render: (r) => h('b', { style: { color: 'var(--color-danger)' } }, qtyU(r.short, r.itemId)) }, { key: 'suggestQty', label: 'الكمية المقترحة', class: 'mfg-n', sort: true, render: (r) => h('b', {}, qtyU(r.suggestQty, r.itemId)) },
          { key: 'sup', label: 'المورد المفضل', render: (r) => h('span', {}, ERP.supplierName(r.supplierId), h('small.mfg-muted', { style: { display: 'block' } }, 'مهلة ' + r.lead + ' يوم')) },
          { key: 'latest', label: 'آخر موعد للطلب', sort: true, value: (r) => r.latest, render: (r) => h('span', { class: r.late ? 'mfg-mrp-late' : '' }, ERP.fmt.date(r.latest), r.late ? h('small', { style: { display: 'block' } }, 'متأخر — اطلب فورًا') : r.needBy ? h('small.mfg-muted', { style: { display: 'block' } }, 'مطلوب ' + ERP.fmt.date(r.needBy)) : null) },
          { key: 'value', label: 'القيمة', class: 'mfg-n', render: (r) => U.cost(r.value) },
          { key: 'prq', label: 'طلب قائم', render: (r) => (r.prq.length ? h('span', {}, r.prq.map((p) => [U.docLink(p.id), ' '])) : '—') }],
        bulk: [{ label: 'أنشئ طلبات شراء', icon: 'cart', perm: 'scm.requisitions.create', run: async (sel, api) => {
          const fresh = sel.filter((r) => !r.prq.length); const dup = sel.length - fresh.length;
          const r = await SA.confirm({ title: 'إنشاء ' + fresh.length + ' طلب شراء', icon: 'cart', confirmLabel: 'إنشاء الطلبات', impact: fresh.map((x) => ERP.itemName(x.itemId) + ' — ' + qtyU(x.suggestQty, x.itemId) + ' من ' + ERP.supplierName(x.supplierId)), warnings: dup ? [dup + ' صنف له طلب شراء قائم — سيتم تخطيه.'] : [] });
          if (!r.ok || !fresh.length) return; let made = [];
          try { made = await SA.api(() => fresh.map((x) => F.createPRQ({ itemId: x.itemId, qty: x.suggestQty, reason: 'MRP — ' + x.reason + (x.needBy ? ' (مطلوب ' + x.needBy + ')' : ''), source: 'mrp', neededBy: x.needBy || ERP.day(x.lead) }))); } catch (e) { return SA.fail(e); }
          api.clearSelection(); SA.toast('تم إنشاء ' + made.length + ' طلب شراء: ' + made.map((p) => p.id).join('، '), 'success'); } }],
        empty: { icon: 'checkcircle', title: 'لا يوجد نقص', text: 'كل الخامات فوق حد الطلب بعد احتياج الأوامر المخططة.' } });
      tblHost.append(SA.card({ title: 'اقتراحات الشراء', flush: false }, tbl.el));
    }
    function drawWo() {
      SA.clear(woHost); const list = get('workOrders').filter((w) => ['planned', 'released', 'in_progress', 'on_hold'].indexOf(w.status) >= 0).sort((a, b) => (a.plannedStart < b.plannedStart ? -1 : 1));
      woHost.append(SA.card({ title: 'احتياجات المواد لكل أمر تشغيل مفتوح' }, list.length ? list.map((w) => { const mats = F.woMaterials(w.id); const sh = mats.filter((m) => m.short > 0);
        return h('details.mfg-details', {}, h('summary', {}, U.docLink(w.id), U.status('wo', w.status), h('span.mfg-grow', {}, ERP.itemName(w.itemId) + ' · ' + qtyU(remaining(w), w.itemId) + ' متبقي'), h('small.mfg-muted', {}, w.lineId + ' · ' + ERP.fmt.date(w.plannedStart)), w.issued ? SA.chip('صُرفت الخامات', 'info') : sh.length ? SA.chip('نقص ' + sh.length + ' خامة', 'danger') : SA.chip('الخامات متاحة', 'success')),
          h('div', {}, w.issued ? h('p.mfg-muted', {}, 'تم صرف خامات الأمر عند الإطلاق' + (U.canCost() && w.issuedValue ? ' بقيمة ' + ERP.fmt.money(w.issuedValue) : '') + ' — الجدول يوضح احتياج الكمية المتبقية للمعلومية.') : null,
            miniTable(['الخامة', 'المطلوب', 'المتاح', 'الحالة'], mats.map((m) => h('tr' + (m.short > 0 && !w.issued ? '.is-short' : ''), {}, td(U.itemCell(m.itemId)), td(qtyU(m.need, m.itemId), 'num'), td(qtyU(m.avail, m.itemId), 'num'), td(m.short > 0 ? SA.chip('نقص ' + qtyU(m.short, m.itemId), 'danger') : SA.chip('متاح', 'success')))))));
      }) : SA.empty({ icon: 'clipboard', title: 'لا توجد أوامر مفتوحة' })));
    }
    drawHead(); drawTable(); drawWo();
    const offs = [st.subscribe('mfgMrp', () => { drawHead(); drawTable(); }), st.subscribe('purchaseRequisitions', () => tbl && tbl.refresh()), st.subscribe('stock', () => { tbl && tbl.refresh(); drawWo(); }), st.subscribe('workOrders', drawWo)];
    return () => offs.forEach((f) => f());
  }

  /* ═════════════════════════ 4. mfg-workorders ═════════════════════════ */
  function woActions(w) {
    return [{ label: 'فتح أمر التشغيل', icon: 'eye', onClick: () => SA.nav('mfg/workorders/' + w.id) },
      w.status === 'planned' ? { label: 'إطلاق وصرف الخامات', icon: 'play', disabled: lockReason('mfg.workorders.release') || false, onClick: () => uiRelease(w.id) } : null,
      w.status === 'released' ? { label: 'بدء التشغيل', icon: 'play', disabled: lockReason('mfg.workorders.edit') || false, onClick: () => uiStart(w.id) } : null,
      ['released', 'in_progress'].indexOf(w.status) >= 0 ? { label: 'تسجيل إنتاج', icon: 'activity', disabled: lockReason('mfg.shopfloor.report') || false, onClick: () => uiReport(w.id) } : null,
      ['in_progress', 'released', 'planned'].indexOf(w.status) >= 0 ? { label: 'إيقاف الأمر', icon: 'alert', disabled: lockReason('mfg.workorders.edit') || false, onClick: () => uiHold(w.id) } : null,
      w.status === 'on_hold' ? { label: 'استئناف', icon: 'play', disabled: lockReason('mfg.workorders.edit') || false, onClick: () => uiResume(w.id) } : null,
      w.qcId ? { label: 'فحص الجودة ' + w.qcId, icon: 'checkcircle', disabled: SA.can('mfg.qc.view') ? false : 'ليست من صلاحياتك (mfg.qc.view)', onClick: () => SA.nav('mfg/qc/' + w.qcId) } : null].filter(Boolean);
  }
  function woListRender(root, ctx) {
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'أوامر التشغيل' }]);
    const q = ctx.params || {}; const statsHost = h('div');
    const soOpts = () => Array.from(new Set(get('workOrders').map((w) => w.soId).filter(Boolean))).sort().reverse().map((s) => [s, s + ' — ' + soCustomer(s)]);
    const tbl = SA.table({ rows: () => get('workOrders'), pageSize: 10, initial: { q: q.q || '', filters: { status: q.status || '', line: q.line || '', priority: q.priority || '', so: q.so || '' }, sort: { key: 'status', dir: 'asc' } },
      search: { placeholder: 'بحث برقم الأمر أو المنتج أو أمر البيع أو اللوط…', keys: ['id', 'soId', 'lot', (r) => ERP.itemName(r.itemId), (r) => item(r.itemId).code, (r) => soCustomer(r.soId)] },
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(SA.catalog.status.wo).map((k) => [k, SA.catalog.status.wo[k][0]]).concat([['late', 'متأخر']]), test: (r, v) => (v === 'late' ? isLate(r) : r.status === v) },
        { key: 'line', label: 'الخط', options: get('lines').map((l) => [l.id, l.id + ' · ' + l.name]), test: (r, v) => r.lineId === v },
        { key: 'priority', label: 'الأولوية', options: [['normal', 'عادية'], ['high', 'أولوية عالية']], test: (r, v) => (r.priority || 'normal') === v },
        { key: 'so', label: 'أمر البيع', options: [['none', 'إنتاج للمخزون']].concat(soOpts()), test: (r, v) => (v === 'none' ? !r.soId : r.soId === v) }],
      columns: [{ key: 'id', label: 'الأمر', sort: true, render: (r) => h('span', {}, U.docLink(r.id), h('small.mfg-muted', { style: { display: 'block' } }, r.lot || '')) },
        { key: 'item', label: 'المنتج', sort: true, value: (r) => ERP.itemName(r.itemId), render: (r) => U.itemCell(r.itemId) },
        { key: 'qty', label: 'التقدم', sort: true, value: (r) => (r.qtyDone || 0) / r.qty, render: (r) => h('div.mfg-qcell', {}, h('span.num', {}, num(r.qtyDone || 0) + ' / ' + num(r.qty) + ' ' + uomOf(r.itemId)), CH.meter((r.qtyDone || 0) / r.qty, { tone: r.status === 'on_hold' ? 'danger' : 'primary' })) },
        { key: 'lineId', label: 'الخط', sort: true, render: (r) => h('span.mfg-code', {}, r.lineId) },
        { key: 'soId', label: 'أمر البيع', sort: true, render: (r) => (r.soId ? h('span', {}, U.docLink(r.soId), h('small.mfg-muted', { style: { display: 'block' } }, soCustomer(r.soId))) : h('span.mfg-muted', {}, 'للمخزون')) },
        { key: 'status', label: 'الحالة', sort: true, value: (r) => WO_ORDER[r.status], render: (r) => h('span', { style: { display: 'inline-flex', gap: '4px', flexWrap: 'wrap' } }, U.status('wo', r.status), isLate(r) ? SA.chip('متأخر', 'danger') : atRisk(r) ? SA.chip('معرض للتأخير', 'warning') : null) },
        { key: 'priority', label: 'الأولوية', sort: true, render: (r) => priChip(r.priority) },
        { key: 'plannedStart', label: 'الخطة', sort: true, render: (r) => h('span.num', {}, shortDate(r.plannedStart) + ' ← ' + shortDate(r.plannedEnd)) },
        { key: 'dueDate', label: 'الاستحقاق', sort: true, render: (r) => ERP.fmt.date(r.dueDate) }],
      rowActions: woActions, onRowClick: (r) => SA.nav('mfg/workorders/' + r.id),
      empty: { icon: 'clipboard', title: 'لا توجد أوامر تشغيل', text: 'أنشئ أمرًا جديدًا أو أكّد أمر بيع ليُنشئ أوامره تلقائيًا.', action: { label: 'أمر تشغيل جديد', perm: 'mfg.workorders.create', onClick: () => openCreateWO() } } });
    function drawStats() { SA.clear(statsHost); const w = get('workOrders'); const c = (f) => w.filter(f).length;
      statsHost.append(h('div.mfg-kpi-row', {}, stat('مفتوحة', num(c(isOpen))), stat('قيد التشغيل', num(c((x) => x.status === 'in_progress')), 'success'), stat('متوقفة', num(c((x) => x.status === 'on_hold')), c((x) => x.status === 'on_hold') ? 'danger' : null), stat('بانتظار الجودة', num(c((x) => x.status === 'qc_pending')), 'warning'), stat('متأخرة', num(c(isLate)), c(isLate) ? 'danger' : null), stat('مكتملة (30 يوم)', num(c((x) => ['completed', 'closed'].indexOf(x.status) >= 0 && ts(x.actualEnd || x.completedAt) > Date.now() - 30 * 86400000))))); }
    drawStats();
    root.append(SA.pageHead({ title: 'أوامر التشغيل', desc: 'من أمر البيع إلى الإطلاق وصرف الخامات، التشغيل، تسجيل الإنتاج ثم الفحص النهائي.', actions: [SA.btn({ label: 'أمر تشغيل جديد', icon: 'plus', perm: 'mfg.workorders.create', onClick: () => openCreateWO() })] }), statsHost, tbl.el);
    const offs = [st.subscribe('workOrders', () => { tbl.refresh(); drawStats(); }), st.subscribe('lines', () => tbl.refresh())];
    return () => offs.forEach((f) => f());
  }
  function woDetailBuild(id) {
    const wo = ERP.find('workOrders', id);
    if (!wo) return SA.card({}, SA.empty({ icon: 'search', title: 'أمر التشغيل غير موجود', text: id, action: { label: 'كل أوامر التشغيل', icon: 'arrowright', onClick: () => SA.nav('mfg/workorders') } }));
    const it = item(wo.itemId); const ln = ERP.line(wo.lineId); const so = wo.soId ? ERP.find('salesOrders', wo.soId) : null; const qc = wo.qcId ? ERP.find('qcInspections', wo.qcId) : null;
    const mats = F.woMaterials(wo.id); const short = mats.filter((m) => m.short > 0); const lineDown = ln && ln.status === 'down';
    const acts = [];
    if (wo.status === 'planned') acts.push(SA.btn({ label: 'إطلاق وصرف الخامات', icon: 'play', perm: 'mfg.workorders.release', onClick: () => uiRelease(wo.id) }));
    if (wo.status === 'released') acts.push(SA.btn({ label: 'بدء التشغيل', icon: 'play', perm: 'mfg.workorders.edit', reason: lineDown ? 'الخط متوقف — لا يمكن البدء' : '', onClick: () => uiStart(wo.id) }));
    if (['released', 'in_progress'].indexOf(wo.status) >= 0) acts.push(SA.btn({ label: 'تسجيل إنتاج', icon: 'activity', kind: wo.status === 'in_progress' ? 'primary' : 'ghost', perm: 'mfg.shopfloor.report', reason: lineDown ? 'الخط متوقف' : '', onClick: () => uiReport(wo.id) }));
    if (['planned', 'released', 'in_progress'].indexOf(wo.status) >= 0) acts.push(SA.btn({ label: 'إيقاف', icon: 'alert', kind: 'danger', perm: 'mfg.workorders.edit', onClick: () => uiHold(wo.id) }));
    if (wo.status === 'on_hold') acts.push(SA.btn({ label: 'استئناف التشغيل', icon: 'play', perm: 'mfg.workorders.edit', reason: lineDown ? 'الخط ' + ln.id + ' متوقف — أصلح العطل أولًا' : '', onClick: () => uiResume(wo.id) }));
    if (wo.status === 'qc_pending' && wo.qcId) acts.push(SA.btn({ label: 'فتح فحص الجودة', icon: 'checkcircle', perm: 'mfg.qc.view', onClick: () => SA.nav('mfg/qc/' + wo.qcId) }));
    const mwo = wo.holdReason || lineDown ? (breakdownMwo(wo.lineId) || ERP.find('maintenanceOrders', 'MWO-2026-0087')) : null;
    const holdBox = wo.status === 'on_hold' ? SA.alert('danger', h('b', {}, 'الأمر متوقف: ' + (wo.holdReason || '—')), h('div', { style: { marginTop: '4px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' } },
      wo.heldAt ? h('span', {}, 'منذ ' + SA.fmt.rel(wo.heldAt) + (wo.heldBy ? ' — ' + SA.userName(wo.heldBy) : '')) : null, mwo && (wo.holdReason || '').indexOf('صيانة') >= 0 || mwo && lineDown ? h('span', {}, 'أمر الصيانة ', mwoLink(mwo.id), ' ', U.status('mwo', mwo.status), mwo.parts && mwo.parts.length ? ' · قطع: ' + mwo.parts.map((p) => ERP.itemName(p.itemId) + ' ×' + p.qty).join('، ') : '') : null,
      lineDown ? h('span', {}, 'الخط ', lineLink(ln.id), ' ', U.status('line', 'down')) : null, so ? h('span', {}, 'تسليم ', U.docLink(so.id), ' في ' + ERP.fmt.date(so.promisedDate)) : null)) : null;
    const prog = (wo.qtyDone || 0) / wo.qty; const scrapRate = (wo.qtyScrap || 0) / Math.max(1, (wo.qtyDone || 0) + (wo.qtyScrap || 0));
    const headCard = SA.card({}, h('div.mfg-head', {}, imgOf(wo.itemId) ? h('img.mfg-img', { src: imgOf(wo.itemId), alt: ERP.families[it.family] || '' }) : h('div.mfg-img'),
      h('div', {}, U.itemCell(wo.itemId), h('div.mfg-kpi-row', {}, stat('الكمية', qtyU(wo.qty, wo.itemId)), stat('المنجز', num(wo.qtyDone || 0), prog >= 1 ? 'success' : null), stat('الهالك', num(wo.qtyScrap || 0) + ' (' + pct(scrapRate, 1) + ')', scrapRate > 0.03 ? 'danger' : null), stat('المتبقي', num(remaining(wo)), remaining(wo) ? 'warning' : 'success')),
        CH.meter(prog, { label: 'تقدم الأمر', text: pct(prog), tone: wo.status === 'on_hold' ? 'danger' : prog >= 1 ? 'success' : 'primary' }))),
      h('div', { style: { marginTop: '14px' } }, SA.kv([['الخط', lineLink(wo.lineId)], ['أمر البيع', so ? h('span', {}, U.docLink(so.id), ' — ' + ERP.customerName(so.customerId), so.export ? ' ' : null, so.export ? SA.chip('تصدير', 'info') : null) : 'إنتاج للمخزون'], ['اللوط', h('span.num', {}, wo.lot || '—')],
        ['الفترة المخططة', ERP.fmt.date(wo.plannedStart) + ' ← ' + ERP.fmt.date(wo.plannedEnd)], ['تاريخ الاستحقاق', h('span', {}, ERP.fmt.date(wo.dueDate), isLate(wo) ? ' ' : null, isLate(wo) ? SA.chip('متأخر', 'danger') : null)], ['الوردية', wo.shift ? SHIFTS.find((s) => s[0] === wo.shift)[1] : '—'],
        ['بدء فعلي', wo.actualStart ? SA.fmt.dt(wo.actualStart) : '—'], ['انتهاء فعلي', wo.actualEnd ? SA.fmt.dt(wo.actualEnd) : '—'], ['أُنشئ', SA.fmt.dt(wo.createdAt) + ' — ' + SA.userName(wo.createdBy)], wo.releasedAt ? ['أُطلق', SA.fmt.dt(wo.releasedAt) + ' — ' + SA.userName(wo.releasedBy)] : null])));
    const matCard = SA.card({ title: 'فحص الخامات', tags: [wo.issued ? SA.chip('تم الصرف', 'info') : short.length ? SA.chip('نقص ' + short.length, 'danger') : SA.chip('متاحة', 'success')] },
      wo.issued ? h('p.mfg-muted', {}, 'صُرفت الخامات عند الإطلاق' + (wo.releasedAt ? ' (' + SA.fmt.rel(wo.releasedAt) + ')' : '') + '. الجدول للكمية المتبقية:', ' ', U.canCost() && wo.issuedValue ? h('b', {}, 'قيمة الصرف ' + ERP.fmt.money(wo.issuedValue)) : null) : null,
      mats.length ? miniTable(['الخامة', 'المطلوب', 'المتاح', 'الحالة'], mats.map((m) => h('tr' + (m.short > 0 && !wo.issued ? '.is-short' : ''), {}, td(U.itemCell(m.itemId)), td(qtyU(m.need, m.itemId), 'num'), td(qtyU(m.avail, m.itemId), 'num'), td(m.short > 0 ? SA.chip('نقص ' + qtyU(m.short, m.itemId), 'danger') : SA.chip('متاح', 'success'))))) : SA.empty({ icon: 'layers', title: 'لا توجد كمية متبقية' }),
      !wo.issued && short.length ? h('div', { style: { marginTop: '10px' } }, SA.btn({ label: 'أنشئ طلبات شراء للنقص', icon: 'cart', kind: 'ghost', perm: 'scm.requisitions.create', onClick: () => openShortages(wo.id, short) })) : null);
    const reps = wo.reports || [];
    const repCard = SA.card({ title: 'سجل تسجيل الإنتاج', tags: [h('span.sap-count', {}, String(reps.length))] }, reps.length ? miniTable(['الوقت', 'بواسطة', 'الوردية', 'سليم', 'هالك'], reps.map((r) => h('tr', {}, td(SA.fmt.dt(r.at)), td(SA.userName(r.by)), td(r.shift ? 'وردية ' + r.shift : r.at ? 'وردية ' + shiftAt(r.at) : '—'), td(num(r.good), 'num'), td(r.scrap ? h('span', { style: { color: 'var(--color-danger)' } }, num(r.scrap)) : '0', 'num')))) : SA.empty({ icon: 'activity', title: 'لم يُسجَّل إنتاج بعد' }));
    const qcCard = SA.card({ title: 'الجودة' }, qc ? h('div', {}, SA.kv([['الفحص النهائي', h('span', {}, SA.can('mfg.qc.view') ? U.docLink(qc.id) : qc.id, ' ', U.status('qc', qc.result))], ['العينة', num(qc.sample)], qc.result !== 'pending' ? ['المقبول / المرفوض', num(qc.acceptedQty) + ' / ' + num(qc.rejectedQty)] : ['ينتظر منذ', SA.fmt.rel(qc.createdAt)], qc.inspectorId ? ['المفتش', SA.userName(qc.inspectorId)] : null, wo.ncrId || qc.ncrId ? ['عدم مطابقة', U.docLink(wo.ncrId || qc.ncrId)] : null])) : h('p.mfg-muted', {}, 'يُنشأ الفحص النهائي تلقائيًا عند اكتمال الكمية.'));
    let costCard;
    if (!U.canCost()) costCard = SA.card({ title: 'التكلفة المعيارية للأمر' }, h('div.mfg-locked-box', {}, SA.icon('lock'), h('span', {}, 'التكاليف الداخلية سرية — تحتاج صلاحية data.cost.view.')));
    else { const r = rollup(wo.itemId, wo.qty); costCard = SA.card({ title: 'التكلفة المعيارية للأمر', tags: [U.demo('معدلات التحويل تجريبية')] }, h('div.mfg-roll', {},
      h('div.mfg-roll-row', {}, h('span', {}, 'التكلفة المعيارية المعتمدة (' + num(wo.qty) + ' × ' + ERP.fmt.money(it.stdCost) + ')'), U.cost(r.std)),
      h('div.mfg-roll-row', {}, h('span', {}, 'خامات حسب BOM'), U.cost(r.matCost)), h('div.mfg-roll-row', {}, h('span', {}, 'عمالة مباشرة (' + num(r.mins) + ' دقيقة معيارية)'), U.cost(r.labour)), h('div.mfg-roll-row', {}, h('span', {}, 'أعباء صناعية'), U.cost(r.overhead)),
      h('div.mfg-roll-row.is-total', {}, h('span', {}, 'تكلفة محسوبة من التركيبة'), U.cost(r.total)), wo.qtyScrap ? h('div.mfg-roll-row', {}, h('span', {}, 'تكلفة الهالك حتى الآن (' + num(wo.qtyScrap) + ')'), U.cost(wo.qtyScrap * (it.stdCost || 0))) : null,
      h('p.mfg-muted', {}, 'الفرق بين المعتمد والمحسوب يُراجَع في دورة تحديث التكاليف المعيارية (المالية › تكاليف المنتجات).'))); }
    const trail = get('audit').filter((a) => a.target && a.target.id === wo.id).map((a) => ({ ts: a.ts, label: (SA.catalog.auditByCode[a.code] || {}).label || a.code, note: a.reason || '', who: a.actor ? a.actor.name : '' }));
    // history recorded on the document itself (seeded records have no audit rows) — shown when the audit has no row of the same moment
    const docEv = [[wo.createdAt, 'إنشاء أمر التشغيل', wo.createdBy], [wo.releasedAt, 'إطلاق وصرف الخامات', wo.releasedBy], [wo.actualStart, 'بدء التشغيل على ' + wo.lineId, null], [wo.heldAt, 'إيقاف الأمر', wo.heldBy, wo.holdReason], [wo.resumedAt, 'استئناف التشغيل', wo.resumedBy], [wo.actualEnd, 'اكتمال الكمية', null]]
      .concat((wo.reports || []).map((r) => [r.at, 'تسجيل إنتاج ' + num(r.good) + (r.scrap ? ' + هالك ' + num(r.scrap) : ''), r.by]))
      .filter((e) => e[0] && !trail.some((t) => Math.abs(ts(t.ts) - ts(e[0])) < 2000)).map((e) => ({ ts: e[0], label: e[1], who: e[2] ? SA.userName(e[2]) : '', note: e[3] || '' }));
    const events = trail.concat(docEv).sort((a, b) => ts(b.ts) - ts(a.ts)).slice(0, 12);
    const trailCard = SA.card({ title: 'سجل الأحداث' }, events.length ? h('ul.mfg-timeline', {}, events.map((a) => h('li', {}, h('i'), h('div', {}, h('b', {}, a.label), a.note ? ' — ' + a.note : '', h('small', {}, (a.who ? a.who + ' · ' : '') + SA.fmt.rel(a.ts)))))) : h('p.mfg-muted', {}, 'لا أحداث مسجلة بعد.'));
    return h('div', {}, SA.pageHead({ title: wo.id, desc: ERP.itemName(wo.itemId) + ' — ' + (ln ? ln.name : wo.lineId), back: { label: 'أوامر التشغيل', href: '#/mfg/workorders' }, tags: [U.status('wo', wo.status), priChip(wo.priority)], actions: acts }),
      holdBox, so ? SA.card({ title: 'دورة أمر البيع ' + so.id }, U.chain(so.id)) : null,
      U.grid(2, h('div.mfg-col', {}, headCard, matCard), h('div.mfg-col', {}, qcCard, costCard, repCard, trailCard)));
  }
  function woRender(root, ctx) {
    const id = ctx.path && ctx.path[0];
    if (!id) return woListRender(root, ctx);
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'أوامر التشغيل', href: '#/mfg/workorders' }, { label: id }]);
    return SA.live(root, () => woDetailBuild(id), ['workOrders', 'qcInspections', 'lines', 'stock', 'maintenanceOrders']);
  }

  /* ═════════════════════════ 5. mfg-shopfloor ═════════════════════════ */
  let sfShift = null;
  function uiBreakdown(lineId) {
    const ln = ERP.line(lineId); if (!ln) return; const mcs = get('machines').filter((m) => m.lineId === lineId);
    const running = get('workOrders').filter((w) => w.lineId === lineId && w.status === 'in_progress');
    const fM = SA.form.field({ name: 'machineId', label: 'الماكينة', type: 'select', required: true, options: [['', 'اختر الماكينة…']].concat(mcs.map((m) => [m.id, m.id + ' — ' + m.name])) });
    const fT = SA.form.field({ name: 'title', label: 'وصف العطل', type: 'select', required: true, options: [['', 'اختر نوع العطل…'], ['توقف مفاجئ للماكينة', 'توقف مفاجئ للماكينة'], ['ارتفاع/انخفاض حرارة البرميل', 'ارتفاع/انخفاض حرارة البرميل'], ['عطل كهربائي', 'عطل كهربائي'], ['تسريب زيت/هواء', 'تسريب زيت/هواء'], ['صوت غير طبيعي/اهتزاز', 'صوت غير طبيعي/اهتزاز'], ['عطل في وحدة السحب/القطع', 'عطل في وحدة السحب/القطع'], ['أخرى', 'أخرى']] });
    const fN = SA.form.field({ name: 'note', label: 'تفاصيل إضافية (اختياري)', type: 'textarea', rows: 2 });
    const fHold = SA.form.field({ name: 'hold', label: 'إيقاف أمر التشغيل الجاري تلقائيًا', type: 'switch', value: true, hint: running.length ? running.map((w) => w.id).join('، ') : 'لا يوجد أمر قيد التشغيل' });
    const md = SA.modal({ title: 'بلاغ عطل — ' + ln.name, icon: 'alert', danger: true, size: 'md',
      body: h('div', {}, SA.alert('danger', 'سيتم تحويل الخط لحالة «عطل — متوقف»، فتح أمر صيانة عاجل، وإشعار مدير الصيانة ومدير الإنتاج فورًا.'), fM.el, fT.el, fN.el, running.length ? fHold.el : null),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), h('button.btn.btn-accent.btn-lg', { type: 'button', onclick: async () => {
        if (!SA.form.group([fM, fT]).validate()) return; const title = fT.get() === 'أخرى' ? (fN.get() || 'عطل') : fT.get() + ' — ' + ((ERP.machine(fM.get()) || {}).name || '');
        let r; try { r = await SA.api(() => reportBreakdownCore({ lineId, machineId: fM.get(), title, note: fN.get(), holdWo: running.length ? fHold.get() : false })); } catch (e) { return SA.fail(e); }
        md.close(); SA.toast('تم البلاغ ' + r.mwo.id + ' — الصيانة والإنتاج تم إشعارهم' + (r.held.length ? '، وتم إيقاف ' + r.held.join('، ') : ''), 'success'); } }, SA.icon('alert'), 'إرسال البلاغ')] });
  }
  function shopBuild() {
    if (!sfShift) sfShift = shiftNow();
    const lines = get('lines'); const canRep = SA.can('mfg.shopfloor.report'); const canBd = SA.can('mfg.shopfloor.report') || SA.can('care.maintenance.create');
    const clock = h('span.mfg-clock.num', { 'data-mfg-clock': '1' }, SA.fmt.time(new Date().toISOString()));
    const top = h('div.mfg-kiosk-top', {}, h('div', {}, h('h2', {}, 'أرضية المصنع — جمصة'), h('p', {}, SA.fmt.date(new Date().toISOString()) + ' · ' + (SA.session.user ? SA.session.user.name : ''))), clock,
      h('div', {}, SA.segmented(SHIFTS.map((s) => [s[0], s[1]]), sfShift, (v) => { sfShift = v; SA.toast('الوردية المختارة: ' + v + ' (' + SHIFT_HOURS[v] + ')', 'info'); })));
    const tiles = h('div.mfg-tiles', {}, lines.map((ln) => {
      const w = currentWO(ln); const feed = !w ? feedsFor(ln) : null; const o = outToday(ln.id); const tgt = Math.round(capPerShift(ln.id, w ? w.itemId : null)); const mwo = ln.status === 'down' ? breakdownMwo(ln.id) : null;
      const shiftOut = get('mfgShiftLog').filter((x) => x.lineId === ln.id && x.shift === sfShift && ts(x.at) >= dayStart()).reduce((s, x) => s + (x.good || 0), 0);
      const body = [];
      if (ln.status === 'down') body.push(h('div.mfg-tile-down', {}, h('b.mfg-elapsed.num', { 'data-mfg-since': ln.downSince || '' }, durTxt(minsSince(ln.downSince))), h('div', {}, ln.downReason || 'عطل'), mwo ? h('div', {}, 'أمر الصيانة ', mwoLink(mwo.id), ' — ', SA.catalog.status.mwo[mwo.status][0]) : null));
      body.push(w ? h('div.mfg-tile-wo', {}, U.itemCell(w.itemId), h('span', {}, U.docLink(w.id), ' ', U.status('wo', w.status))) : feed ? h('div.mfg-tile-wo', {}, h('span', {}, 'يبثق بروفايلات لـ ', U.docLink(feed.id)), U.itemCell(feed.itemId)) : h('div.mfg-tile-wo', {}, h('span.mfg-muted', {}, 'لا يوجد أمر على الخط')));
      body.push(h('div.mfg-big', {}, h('div', {}, h('b', {}, num(shiftOut)), h('small', {}, 'منتج الوردية ' + sfShift)), h('div', {}, h('b', {}, num(tgt)), h('small', {}, 'المستهدف/وردية')), h('div.is-scrap', {}, h('b', {}, num(o.scrap)), h('small', {}, 'هالك اليوم'))));
      if (w) body.push(CH.meter((w.qtyDone || 0) / w.qty, { label: 'تقدم ' + w.id, text: num(w.qtyDone || 0) + ' / ' + num(w.qty), tone: w.status === 'on_hold' ? 'danger' : 'primary' }));
      body.push(h('div.mfg-muted', {}, 'إجمالي اليوم ' + num(o.good) + ' ' + (ERP.uom[ln.uom] || '') + (o.last ? ' · آخر قراءة ' + SA.fmt.rel(o.last) : '')));
      const repBtn = w && ['released', 'in_progress'].indexOf(w.status) >= 0 ? SA.btn({ label: 'سجّل إنتاج', icon: 'activity', size: 'lg', perm: 'mfg.shopfloor.report', reason: ln.status === 'down' ? 'الخط متوقف' : '', onClick: () => uiReport(w.id, { shift: sfShift }) })
        : w && w.status === 'on_hold' ? SA.btn({ label: 'الأمر متوقف', icon: 'lock', size: 'lg', kind: 'ghost', reason: w.holdReason || 'متوقف', onClick: () => {} })
          : SA.btn({ label: 'سجّل إنتاج', icon: 'activity', size: 'lg', kind: 'ghost', reason: canRep ? 'لا يوجد أمر تشغيل جارٍ على الخط' : '', perm: 'mfg.shopfloor.report', onClick: () => {} });
      const startBtn = w && w.status === 'released' ? SA.btn({ label: 'ابدأ التشغيل', icon: 'play', size: 'lg', kind: 'ghost', perm: 'mfg.workorders.edit', reason: ln.status === 'down' ? 'الخط متوقف' : '', onClick: () => uiStart(w.id) }) : null;
      const bdBtn = ln.status === 'down' ? SA.btn({ label: 'الخط في الصيانة', icon: 'wrench', size: 'lg', kind: 'ghost', onClick: () => SA.nav(mwo ? 'care/maintenance/' + mwo.id : 'mfg/lines/' + ln.id) })
        : SA.btn({ label: 'بلّغ عن عطل', icon: 'alert', size: 'lg', kind: 'danger', reason: canBd ? '' : 'ليست من صلاحياتك (mfg.shopfloor.report)', onClick: () => uiBreakdown(ln.id) });
      return h('section.mfg-tile.is-' + ln.status, { 'aria-label': ln.name }, h('div.mfg-tile-band', {}, h('div', {}, h('b', {}, ln.id + ' · ' + ln.name), h('small', {}, ERP.families[ln.family])), h('span.mfg-tile-state', {}, SA.catalog.status.line[ln.status][0])), h('div.mfg-tile-body', {}, body), h('div.mfg-tile-acts', {}, startBtn || repBtn, bdBtn));
    }));
    return h('div', {}, SA.pageHead({ title: 'أرضية المصنع (لحظي)', desc: 'شاشة المشغلين: أزرار كبيرة للتسجيل والبلاغ — تصلح للتابلت عند الخط.', tags: [U.demo('عدّادات تجريبية')] }), top, tiles);
  }
  function shopRender(root, ctx) {
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'التنفيذ' }, { label: 'أرضية المصنع' }]);
    const off = SA.live(root, shopBuild, ['lines', 'workOrders', 'mfgShiftLog', 'maintenanceOrders']);
    const tick = setInterval(() => { const c = root.querySelector('[data-mfg-clock]'); if (c) c.textContent = SA.fmt.time(new Date().toISOString()); root.querySelectorAll('[data-mfg-since]').forEach((e) => { if (e.dataset.mfgSince) e.textContent = durTxt(minsSince(e.dataset.mfgSince)); }); }, 20000);
    return () => { off(); clearInterval(tick); };
  }

  /* ═════════════════════════ 6. mfg-bom ═════════════════════════ */
  const SCALE_TXT = {
    width: (b) => 'الكميات محسوبة لباب بعرض 90 سم. لعرض آخر تُضرب الخامات (عدا الإكسسوارات والتغليف) في «العرض ÷ 90» — مثال: باب 100 سم = ×1.11، باب 80 سم = ×0.89. الكالون والمفصلات والكرتونة ثابتة لكل باب.',
    thickness: (b) => 'الكميات لكل 1 مم من سُمك اللوح (122×244 سم). لوح 10 مم = ×10، لوح 17 مم = ×17. دقائق التشغيل تُضرب أيضًا في «السُمك ÷ 10».',
    none: (b) => 'كميات ثابتة لكل قطعة تجاليد (17×280 سم = 0.476 م²) — لا تغيير بالمقاس.'
  };
  function bomList(root) {
    const boms = get('boms');
    const tbl = SA.table({ rows: () => get('boms'), pageSize: 10, search: { placeholder: 'بحث بالتركيبة…', keys: ['id', 'name'] }, filters: [{ key: 'family', label: 'العائلة', options: [['door', 'أبواب'], ['clad', 'تجاليد'], ['foam', 'فوم بورد']] }],
      columns: [{ key: 'name', label: 'التركيبة', sort: true, render: (b) => h('span.erp-item', {}, IMG[b.family] ? h('img.mfg-thumb', { src: IMG[b.family], alt: '' }) : null, h('span', {}, h('b', {}, b.name), h('small.num', {}, b.id))) },
        { key: 'family', label: 'العائلة', render: (b) => ERP.families[b.family] }, { key: 'version', label: 'الإصدار', sort: true, render: (b) => SA.chip('v' + b.version, 'info') }, { key: 'status', label: 'الحالة', render: (b) => SA.chip(b.status === 'active' ? 'معتمدة' : b.status, b.status === 'active' ? 'success' : 'neutral') },
        { key: 'scale', label: 'قاعدة التحجيم', render: (b) => (b.scale === 'width' ? 'بالعرض (÷90)' : b.scale === 'thickness' ? 'بالسُمك (لكل مم)' : 'ثابتة') }, { key: 'lines', label: 'خامات', class: 'mfg-n', render: (b) => String(b.lines.length) }, { key: 'routing', label: 'عمليات', class: 'mfg-n', render: (b) => String(b.routing.length) },
        { key: 'skus', label: 'أصناف', class: 'mfg-n', render: (b) => String(get('items').filter((i) => i.bomId === b.id).length) }, { key: 'approvedBy', label: 'اعتمدها', render: (b) => SA.userName(b.approvedBy) }, { key: 'updatedAt', label: 'آخر تعديل', sort: true, render: (b) => SA.fmt.rel(b.updatedAt) }],
      onRowClick: (b) => SA.nav('mfg/bom/' + b.id), empty: { icon: 'list', title: 'لا توجد تركيبات' } });
    root.append(SA.pageHead({ title: 'مكونات المنتج (BOM) والتركيبات', desc: boms.length + ' تركيبة معتمدة تغطي ' + get('items').filter((i) => i.bomId).length + ' صنف — الخامات، نسب الهالك، مسار التشغيل والتكلفة.' }), tbl.el);
    const off = st.subscribe('boms', () => tbl.refresh()); return off;
  }
  let bomSku = {};
  function uiBomEdit(bomId, idx) {
    const b = ERP.find('boms', bomId); if (!b) return; const l = b.lines[idx];
    const fQ = SA.form.field({ name: 'qty', label: 'الكمية لكل وحدة أساس (' + uomOf(l.itemId) + ')', type: 'number', value: l.qty, required: true });
    const fS = SA.form.field({ name: 'scrap', label: 'نسبة الهالك %', type: 'number', value: Math.round((l.scrapPct || 0) * 1000) / 10 });
    const md = SA.modal({ title: 'تعديل بند في ' + b.name, subtitle: ERP.itemName(l.itemId), icon: 'edit', size: 'sm', body: h('div', {}, fQ.el, fS.el, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'التعديل ينشئ إصدارًا جديدًا (v' + (b.version + 1) + ') ويؤثر على احتياج الخامات للأوامر المخططة.'))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'متابعة', icon: 'check', perm: 'mfg.bom.edit', onClick: async () => {
        const q = Number(fQ.get()), sp = Math.max(0, Number(fS.get()) || 0) / 100; if (!(q > 0)) return fQ.error('أدخل كمية أكبر من صفر');
        if (q === l.qty && sp === (l.scrapPct || 0)) return fQ.error('لا يوجد تغيير');
        const skus = get('items').filter((i) => i.bomId === bomId); const planned = get('workOrders').filter((w) => w.status === 'planned' && item(w.itemId).bomId === bomId);
        const oldNeed = planned.reduce((s, w) => s + ERP.materialsFor(w.itemId, w.qty).filter((m) => m.itemId === l.itemId).reduce((a, m) => a + m.qty, 0), 0); const ratio = (q * (1 + sp)) / (l.qty * (1 + (l.scrapPct || 0)));
        md.close();
        const r = await SA.confirm({ title: 'اعتماد تعديل التركيبة', icon: 'edit', reasonRequired: true, reasonLabel: 'سبب التعديل', confirmLabel: 'اعتماد الإصدار v' + (b.version + 1),
          impact: [ERP.itemName(l.itemId) + ': ' + l.qty + ' ← ' + q + ' ' + uomOf(l.itemId) + ' · الهالك ' + Math.round((l.scrapPct || 0) * 100) + '% ← ' + Math.round(sp * 100) + '%', 'يؤثر على ' + skus.length + ' صنف تام يستخدم هذه التركيبة', planned.length ? 'احتياج ' + planned.length + ' أمر مخطط من هذه الخامة: ' + qtyU(oldNeed, l.itemId) + ' ← ' + qtyU(oldNeed * ratio, l.itemId) : 'لا توجد أوامر مخططة متأثرة', 'إشعار المالية لمراجعة التكلفة المعيارية · يُسجَّل BOM.UPDATED (قبل/بعد)'] });
        if (!r.ok) return; try { await SA.api(() => updateBomLineCore(bomId, idx, q, sp, r.reason)); } catch (e) { return SA.fail(e); }
        SA.toast('تم اعتماد ' + b.name + ' — إصدار v' + (b.version + 1), 'success'); } })] });
  }
  function bomDetailBuild(id) {
    const b = ERP.find('boms', id); if (!b) return SA.card({}, SA.empty({ icon: 'search', title: 'التركيبة غير موجودة', text: id, action: { label: 'كل التركيبات', icon: 'arrowright', onClick: () => SA.nav('mfg/bom') } }));
    const skus = get('items').filter((i) => i.bomId === id); const canC = U.canCost();
    const lineRows = b.lines.map((l, i) => { const it = item(l.itemId); const eff = l.qty * (1 + (l.scrapPct || 0)); const fixed = it.kind === 'acc' || it.kind === 'pkg';
      return h('tr', {}, td(U.itemCell(l.itemId)), td(num(l.qty, 3), 'num'), td(uomOf(l.itemId)), td(l.scrapPct ? pct(l.scrapPct, 1) : '—', 'num'), td(num(eff, 3), 'num'), td(fixed ? SA.chip('ثابت', 'neutral') : SA.chip(b.scale === 'width' ? '× العرض/90' : b.scale === 'thickness' ? '× السُمك' : 'ثابت', b.scale ? 'info' : 'neutral')), td(U.cost(it.stdCost), 'num'), td(U.cost(eff * (it.stdCost || 0)), 'num'),
        td(SA.btn({ label: 'تعديل', icon: 'edit', size: 'sm', kind: 'ghost', iconOnly: true, perm: 'mfg.bom.edit', onClick: () => uiBomEdit(id, i) }))); });
    const baseCost = b.lines.reduce((s, l) => s + l.qty * (1 + (l.scrapPct || 0)) * (item(l.itemId).stdCost || 0), 0);
    const routRows = b.routing.map((r) => h('tr', {}, td(h('span.num', {}, String(r.seq))), td(r.op), td(lineLink(r.lineId)), td(num(r.minPerUnit, 2) + ' دقيقة', 'num')));
    let sel = bomSku[id] && skus.some((s) => s.id === bomSku[id]) ? bomSku[id] : (skus[0] || {}).id; const rollHost = h('div');
    function drawRoll() {
      SA.clear(rollHost); if (!sel) return;
      if (!canC) { rollHost.append(h('div.mfg-locked-box', {}, SA.icon('lock'), h('span', {}, 'تجميع التكلفة سري — يحتاج صلاحية data.cost.view.'))); return; }
      const r = rollup(sel, 1); const it = item(sel);
      rollHost.append(CH.bars([{ label: 'خامات', value: r.matCost, color: ERP.palette[0] }, { label: 'عمالة مباشرة', value: r.labour, color: ERP.palette[2] }, { label: 'أعباء صناعية', value: r.overhead, color: ERP.palette[3] }], { fmt: (v) => ERP.fmt.money(v) }),
        h('div.mfg-roll', { style: { marginTop: '12px' } }, h('div.mfg-roll-row', {}, h('span', {}, 'زمن التشغيل المعياري'), h('b.num', {}, num(r.mins, 2) + ' دقيقة')), h('div.mfg-roll-row.is-total', {}, h('span', {}, 'التكلفة المحسوبة للوحدة'), U.cost(r.total)), h('div.mfg-roll-row', {}, h('span', {}, 'التكلفة المعيارية المعتمدة'), U.cost(it.stdCost)),
          U.canProfit() ? h('div.mfg-roll-row', {}, h('span', {}, 'سعر القائمة / هامش على المعتمد'), h('b.num', {}, ERP.fmt.money(it.price) + ' · ' + pct(it.price ? (it.price - it.stdCost) / it.price : 0))) : null),
        miniTable(['الخامة', 'الكمية للوحدة', 'التكلفة'], r.mats.map((m) => h('tr', {}, td(ERP.itemName(m.itemId)), td(qtyU(m.qty, m.itemId), 'num'), td(U.cost(m.cost), 'num')))));
    }
    drawRoll();
    const skuSel = SA.form.field({ name: 'sku', label: 'الصنف', type: 'select', value: sel, options: skus.map((s) => [s.id, s.name]), onChange: (v) => { bomSku[id] = v; sel = v; drawRoll(); } });
    const hist = (b.history || []).slice().reverse();
    return h('div', {}, SA.pageHead({ title: b.name, desc: ERP.families[b.family] + ' · ' + b.lines.length + ' خامة · ' + b.routing.length + ' عمليات · ' + skus.length + ' صنف', back: { label: 'التركيبات', href: '#/mfg/bom' }, tags: [SA.chip('v' + b.version, 'info'), SA.chip(b.status === 'active' ? 'معتمدة' : b.status, 'success')] }),
      U.grid(2, SA.card({ title: 'بيانات التركيبة' }, h('div.mfg-head', {}, IMG[b.family] ? h('img.mfg-img', { src: IMG[b.family], alt: '' }) : h('div.mfg-img'), SA.kv([['الرمز', h('span.num', {}, b.id)], ['الإصدار', 'v' + b.version], ['اعتمدها', SA.userName(b.approvedBy)], ['آخر تعديل', SA.fmt.dt(b.updatedAt)], ['تكلفة خامات وحدة الأساس', U.cost(baseCost)]])),
        h('div.mfg-scale', { style: { marginTop: '14px' } }, h('span.mfg-scale-ico', {}, SA.icon('compare')), h('div', {}, h('b', {}, 'قاعدة التحجيم: ' + (b.scale === 'width' ? 'حسب عرض الباب' : b.scale === 'thickness' ? 'حسب سُمك اللوح' : 'ثابتة')), h('div', {}, SCALE_TXT[b.scale || 'none'](b))))),
      SA.card({ title: 'مسار التشغيل (Routing)' }, miniTable(['م', 'العملية', 'الخط', 'دقيقة/وحدة'], routRows), h('p.mfg-muted', { style: { marginTop: '8px' } }, 'الإجمالي ' + num(b.routing.reduce((s, r) => s + r.minPerUnit, 0), 2) + ' دقيقة معيارية لوحدة الأساس.'))),
      SA.card({ title: 'بنود الخامات', tags: [canC ? null : SA.chip('التكاليف مخفية', 'neutral')] }, miniTable(['الخامة', 'الكمية', 'الوحدة', 'هالك', 'فعلي', 'التحجيم', 'تكلفة الوحدة', 'التكلفة الممتدة', ''], lineRows)),
      U.grid(2, SA.card({ title: 'تجميع التكلفة لكل صنف', tags: [U.demo('معدلات العمالة والأعباء تجريبية')] }, skuSel.el, rollHost),
        SA.card({ title: 'سجل الإصدارات' }, hist.length ? h('ul.mfg-timeline', {}, hist.map((x) => h('li', {}, h('i'), h('div', {}, h('b', {}, 'v' + x.version + ' — ' + ERP.itemName(x.itemId) + ': ' + x.from + ' ← ' + x.to), x.reason ? ' — ' + x.reason : '', h('small', {}, SA.userName(x.by) + ' · ' + SA.fmt.rel(x.at)))))) : h('p.mfg-muted', {}, 'الإصدار الحالي v' + b.version + ' معتمد من ' + SA.userName(b.approvedBy) + ' (' + SA.fmt.rel(b.updatedAt) + '). التعديلات الجديدة تظهر هنا.'))));
  }
  function bomRender(root, ctx) {
    const id = ctx.path && ctx.path[0];
    if (!id) { ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'الهندسة' }, { label: 'التركيبات' }]); return bomList(root); }
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'التركيبات', href: '#/mfg/bom' }, { label: id }]);
    return SA.live(root, () => bomDetailBuild(id), ['boms']);
  }

  /* ═════════════════════════ 7. mfg-lines ═════════════════════════ */
  function uiLineStatus(lineId) {
    const ln = ERP.line(lineId); if (!ln) return; const m = breakdownMwo(lineId);
    const fS = SA.form.field({ name: 'status', label: 'الحالة الجديدة', type: 'radio', value: '', options: Object.keys(SA.catalog.status.line).filter((k) => k !== ln.status).map((k) => [k, SA.catalog.status.line[k][0]]) });
    const fR = SA.form.field({ name: 'reason', label: 'السبب', type: 'textarea', rows: 2, required: true });
    const md = SA.modal({ title: 'تغيير حالة ' + ln.name, subtitle: 'الحالة الحالية: ' + SA.catalog.status.line[ln.status][0], icon: 'factory', size: 'md', body: h('div', {}, fS.el, fR.el, ln.status === 'down' && m && m.status !== 'done' ? SA.alert('warning', 'أمر الصيانة ' + m.id + ' ما زال «' + SA.catalog.status.mwo[m.status][0] + '». تأكد من إصلاح العطل قبل إعادة التشغيل.') : null),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'تأكيد التغيير', icon: 'check', perm: 'mfg.lines.edit', onClick: async () => {
        const s = fS.get(); if (!s) return fS.error('اختر الحالة'); if (!fR.validate()) return;
        let r; try { r = await SA.api(() => setLineStatusCore(lineId, s, fR.get())); } catch (e) { return SA.fail(e); }
        md.close(); const held = get('workOrders').filter((w) => w.lineId === lineId && w.status === 'on_hold');
        SA.toast(ln.name + ': ' + SA.catalog.status.line[s][0] + (s === 'running' && held.length ? ' — استأنف ' + held.map((w) => w.id).join('، ') : ''), 'success'); } })] });
  }
  function linesList(root) {
    const host = h('div'); root.append(SA.pageHead({ title: 'خطوط الإنتاج والطاقات', desc: 'الخطوط الأربعة، ماكيناتها، OEE والطاقة لكل وردية.' }), host);
    const draw = () => { SA.clear(host); const lines = get('lines');
      host.append(h('div.mfg-lines', {}, lines.map((ln) => lineCard(ln, outToday(ln.id)))),
        SA.card({ title: 'ملخص الطاقات', flush: false }, miniTable(['الخط', 'العائلة', 'الحالة', 'الطاقة/وردية', 'الورديات', 'الطاقة/يوم', 'الماكينات', 'OEE', 'المشرف'], lines.map((ln) => { const mc = get('machines').filter((m) => m.lineId === ln.id);
          return h('tr', {}, td(lineLink(ln.id)), td(ERP.families[ln.family]), td(U.status('line', ln.status)), td(num(ln.capacityPerShift) + ' ' + (ERP.uom[ln.uom] || ''), 'num'), td((ln.shifts || []).join(' · ')), td(num(planToday(ln)), 'num'), td(h('span', {}, num(mc.length), mc.some((m) => m.status === 'down') ? ' ' : null, mc.some((m) => m.status === 'down') ? SA.chip(mc.filter((m) => m.status === 'down').length + ' معطلة', 'danger') : null)), td(pct(oeeOf(ln)), 'num'), td(SA.userName(ln.supervisorId))); })))); };
    draw(); const offs = ['lines', 'machines', 'workOrders', 'mfgShiftLog'].map((p) => st.subscribe(p, draw)); return () => offs.forEach((f) => f());
  }
  function lineDetailBuild(id) {
    const ln = ERP.line(id); if (!ln) return SA.card({}, SA.empty({ icon: 'search', title: 'الخط غير موجود', text: id, action: { label: 'كل الخطوط', icon: 'arrowright', onClick: () => SA.nav('mfg/lines') } }));
    const oe = ln.oee || {}; const mcs = get('machines').filter((m) => m.lineId === id); const pd = get('prodDaily').filter((r) => r.lineId === id).sort((a, b) => (a.date < b.date ? -1 : 1)); const dts = get('downtime').filter((d) => d.lineId === id).sort((a, b) => ts(b.start) - ts(a.start));
    const m = breakdownMwo(id); const o = outToday(id); const cur = currentWO(ln); const next = nextWOs(id).filter((w) => !cur || w.id !== cur.id);
    const crit = { A: ['A — حرجة', 'danger'], B: ['B — مهمة', 'warning'], C: ['C — عادية', 'neutral'] };
    const pdOee = pd.map((r) => { const shifts = (ln.shifts || []).length * 480; const a = Math.max(0, 1 - (r.downtimeMin || 0) / shifts); const q = r.good / Math.max(1, r.good + r.scrap); const p = Math.min(1, (r.good + r.scrap) / Math.max(1, r.planned * a)); return Math.round(a * p * q * 100); });
    const sum30 = pd.reduce((s, r) => ({ good: s.good + r.good, plan: s.plan + r.planned, scrap: s.scrap + r.scrap, down: s.down + (r.downtimeMin || 0) }), { good: 0, plan: 0, scrap: 0, down: 0 });
    return h('div', {}, SA.pageHead({ title: ln.id + ' · ' + ln.name, desc: ERP.families[ln.family] + ' · ' + (ln.shifts || []).length + ' ورديات (' + (ln.shifts || []).join('، ') + ') · ' + num(ln.capacityPerShift) + ' ' + (ERP.uom[ln.uom] || '') + '/وردية · المشرف ' + SA.userName(ln.supervisorId), back: { label: 'الخطوط', href: '#/mfg/lines' }, tags: [U.status('line', ln.status)],
      actions: [SA.can('mfg.shopfloor.view') ? SA.btn({ label: 'أرضية المصنع', icon: 'monitor', kind: 'ghost', onClick: () => SA.nav('mfg/shopfloor') }) : null, SA.btn({ label: 'تغيير حالة الخط', icon: 'swap', perm: 'mfg.lines.edit', onClick: () => uiLineStatus(id) })] }),
      ln.status === 'down' ? SA.alert('danger', h('b', {}, 'الخط متوقف منذ ' + durTxt(minsSince(ln.downSince)) + ' — ' + (ln.downReason || '')), m ? h('div', { style: { marginTop: '4px' } }, 'أمر الصيانة ', mwoLink(m.id), ' ', U.status('mwo', m.status), ' — ', m.title, m.parts && m.parts.length ? ' · قطع مطلوبة: ' + m.parts.map((p) => ERP.itemName(p.itemId) + ' ×' + p.qty + ' (رصيد ' + num(K.qty(p.itemId, K.SPARES)) + ')').join('، ') : '') : null) : null,
      U.grid(2, SA.card({ title: 'OEE الحالي (التوافر × الأداء × الجودة)' }, h('div.mfg-gauges', {}, CH.gauge(oe.a, { label: 'التوافر A', size: 130, good: 0.9, warn: 0.75 }), CH.gauge(oe.p, { label: 'الأداء P', size: 130, good: 0.9, warn: 0.75 }), CH.gauge(oe.q, { label: 'الجودة Q', size: 130, good: 0.97, warn: 0.93 }), CH.gauge(oeeOf(ln), { label: 'OEE', size: 150, good: 0.75, warn: 0.6 }))),
        SA.card({ title: 'اليوم وآخر 30 يومًا' }, h('div.mfg-kpi-row', {}, stat('إنتاج اليوم', num(o.good)), stat('هالك اليوم', num(o.scrap), o.scrap ? 'warning' : null), stat('إنتاج 30 يوم', num(sum30.good)), stat('تحقيق الخطة', pct(sum30.good / Math.max(1, sum30.plan)), sum30.good / Math.max(1, sum30.plan) < 0.8 ? 'warning' : 'success'), stat('الهالك', pct(sum30.scrap / Math.max(1, sum30.good + sum30.scrap), 1)), stat('ساعات توقف', num(sum30.down / 60, 1), sum30.down > 600 ? 'danger' : null)))),
      SA.card({ title: 'الإنتاج مقابل الخطة — آخر 30 يومًا' }, CH.line({ labels: pd.map((r) => shortDate(r.date)), height: 230, fmt: (v) => num(v), area: true, series: [{ name: 'سليم', values: pd.map((r) => r.good), color: LINE_COLOR[id] || ERP.palette[0] }, { name: 'الخطة', values: pd.map((r) => r.planned), dashed: true, color: '#8a8a8a' }, { name: 'هالك', values: pd.map((r) => r.scrap), color: '#b9141b' }] }),
        h('div', { style: { marginTop: '10px' } }, h('small.mfg-muted', {}, 'OEE اليومي المحسوب من السجل: '), CH.spark(pdOee.length > 1 ? pdOee : [0, 0], { w: 220, h: 32 }), h('small.mfg-muted', {}, ' أحدث ' + (pdOee[pdOee.length - 1] || 0) + '%'))),
      U.grid(2, SA.card({ title: 'الأمر الحالي والتالي' }, cur || next.length ? miniTable(['الأمر', 'المنتج', 'التقدم', 'الحالة', 'البداية'], [cur].concat(next.slice(0, 5)).filter(Boolean).map((w) => h('tr', {}, td(U.docLink(w.id)), td(U.itemCell(w.itemId)), td(num(w.qtyDone || 0) + '/' + num(w.qty), 'num'), td(U.status('wo', w.status)), td(ERP.fmt.date(w.plannedStart))))) : (feedsFor(ln) ? h('p.mfg-muted', {}, 'الخط يبثق بروفايلات الأبواب لأمر ', U.docLink(feedsFor(ln).id), ' على L-02.') : SA.empty({ icon: 'clipboard', title: 'لا أوامر على الخط' }))),
        SA.card({ title: 'سجل التوقفات', tags: [h('span.sap-count', {}, String(dts.length))] }, dts.length ? miniTable(['البداية', 'المدة', 'السبب', 'التصنيف', 'الصيانة'], dts.map((d) => h('tr', {}, td(SA.fmt.dt(d.start)), td(d.end ? durTxt(d.minutes || 0) : h('b', { style: { color: 'var(--color-danger)' } }, 'جارٍ — ' + durTxt(minsSince(d.start))), 'num'), td(d.reason), td(DT_CAT[d.category] || d.category), td(d.mwoId ? mwoLink(d.mwoId) : '—')))) : SA.empty({ icon: 'checkcircle', title: 'لا توقفات مسجلة' }))),
      SA.card({ title: 'ماكينات الخط', tags: [h('span.sap-count', {}, String(mcs.length))] }, mcs.length ? miniTable(['الماكينة', 'النوع', 'الحالة', 'الأهمية', 'ساعات التشغيل', 'MTBF / MTTR', 'آخر صيانة', 'الصيانة القادمة'], mcs.map((mc) => h('tr', {}, td(h('span', {}, assetLink(mc.id), h('small', { style: { display: 'block' } }, mc.name))), td(mc.type), td(U.status('machine', mc.status)), td(SA.chip((crit[mc.criticality] || [mc.criticality])[0], (crit[mc.criticality] || [0, 'neutral'])[1])), td(num(mc.hoursRun), 'num'), td(num(mc.mtbfH) + ' س / ' + num(mc.mttrH, 1) + ' س', 'num'), td(ERP.fmt.date(mc.lastPMAt)), td(h('span', {}, ERP.fmt.date(mc.nextPMAt), mc.nextPMAt < today() ? ' ' : null, mc.nextPMAt < today() ? SA.chip('متأخرة', 'danger') : null))))) : SA.empty({ icon: 'wrench', title: 'لا ماكينات مسجلة' })),
      openMwo(id).length ? SA.card({ title: 'أوامر الصيانة المفتوحة على الخط' }, miniTable(['الأمر', 'النوع', 'العنوان', 'الحالة', 'منذ'], openMwo(id).map((x) => h('tr', {}, td(mwoLink(x.id)), td(x.kind === 'breakdown' ? 'عطل' : 'وقائية'), td(x.title), td(U.status('mwo', x.status)), td(SA.fmt.rel(x.openedAt)))))) : null);
  }
  function linesRender(root, ctx) {
    const id = ctx.path && ctx.path[0];
    if (!id) { ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'الهندسة' }, { label: 'الخطوط' }]); return linesList(root); }
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'الخطوط', href: '#/mfg/lines' }, { label: id }]);
    return SA.live(root, () => lineDetailBuild(id), ['lines', 'machines', 'downtime', 'workOrders', 'maintenanceOrders', 'mfgShiftLog']);
  }

  /* ═════════════════════════ register ═════════════════════════ */
  const R = (o) => SA.register(Object.assign({ app: 'mfg' }, o));
  R({ id: 'mfg-dashboard', group: 'mfg-dash', title: 'لوحة التصنيع', icon: 'dashboard', route: 'mfg/dashboard', perm: 'mfg.dashboard.view', order: 1, desc: 'حالة الخطوط والإنتاج والتوقفات', render: dashRender, badge() { const n = get('lines').filter((l) => l.status === 'down').length; return n || null; } });
  R({ id: 'mfg-planning', group: 'mfg-plan', title: 'خطة الإنتاج والطاقة', icon: 'calendar', route: 'mfg/planning', perm: 'mfg.planning.view', order: 10, desc: 'لوحة الجدولة وحمل الطاقة وMPS', render: planningRender });
  R({ id: 'mfg-mrp', group: 'mfg-plan', title: 'تخطيط المواد (MRP)', icon: 'layers', route: 'mfg/mrp', perm: 'mfg.mrp.view', order: 20, desc: 'احتياجات المواد واقتراحات الشراء', render: mrpRender, badge() { try { return shortages().length || null; } catch (e) { return null; } } });
  R({ id: 'mfg-workorders', group: 'mfg-exec', title: 'أوامر التشغيل', icon: 'clipboard', route: 'mfg/workorders', perm: 'mfg.workorders.view', order: 30, desc: 'إطلاق وتشغيل وتسجيل إنتاج', render: woRender, badge() { const n = get('workOrders').filter((w) => w.status === 'on_hold').length; return n || null; } });
  R({ id: 'mfg-shopfloor', group: 'mfg-exec', title: 'أرضية المصنع', icon: 'monitor', route: 'mfg/shopfloor', perm: 'mfg.shopfloor.view', order: 40, desc: 'شاشة المشغلين اللحظية', render: shopRender });
  R({ id: 'mfg-bom', group: 'mfg-eng', title: 'مكونات المنتج (BOM)', icon: 'list', route: 'mfg/bom', perm: 'mfg.bom.view', order: 50, desc: 'التركيبات والمسارات والتكلفة', render: bomRender });
  R({ id: 'mfg-lines', group: 'mfg-eng', title: 'خطوط الإنتاج', icon: 'factory', route: 'mfg/lines', perm: 'mfg.lines.view', order: 60, desc: 'الخطوط والماكينات وOEE', render: linesRender });

  /* search provider */
  if (SA.search && SA.search.register) SA.search.register({ id: 'mfg-wo', label: 'أوامر التشغيل', perm: 'mfg.workorders.view', query(q) { q = String(q || '').toLowerCase(); if (q.length < 2) return []; return get('workOrders').filter((w) => (w.id + ' ' + ERP.itemName(w.itemId) + ' ' + (w.soId || '') + ' ' + (w.lot || '')).toLowerCase().indexOf(q) >= 0).slice(0, 6).map((w) => ({ title: w.id + ' — ' + ERP.itemName(w.itemId), sub: (SA.catalog.status.wo[w.status] || [w.status])[0] + ' · ' + w.lineId + (w.soId ? ' · ' + w.soId : ''), icon: 'clipboard', route: 'mfg/workorders/' + w.id })); } });

  ERP.mfg = { outToday, currentWO, shortages, rollup, openCreateWO, reportBreakdown: reportBreakdownCore, setLineStatus: setLineStatusCore, holdWO: holdCore, resumeWO: resumeCore, reschedule: rescheduleCore, runMRP: runMRPCore, updateBomLine: updateBomLineCore, ui: { report: uiReport, release: uiRelease, start: uiStart, hold: uiHold, resume: uiResume, breakdown: uiBreakdown, lineStatus: uiLineStatus } };
})();
