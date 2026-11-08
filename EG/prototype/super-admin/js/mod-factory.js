/* EG ERP prototype — mod-factory.js  (app mfg — «مسار التصنيع» mfg-exec · «الخلطات الكيميائية» mfg-eng)
   Routes: mfg/flow[?stage=<nodeKey>] · mfg/formulas[/MX-id]
   Data: reads ERP.factory (FX) — stages/stageView/reportStage/scrap/formulas/MIR/FGR (erp-factory.js). Writes only:
     - stage reports via ERP.mfg.ui.report(woId, {stageKey}) when mod-mfg is stage-aware, else own dialog → FX.reportStage (STAGE.REPORTED + SCRAP.LOGGED by FX)
     - formula edit (perm mfg.formulas.edit): formulas[].lines[].pct + version + updatedAt + approvedBy + history[] (additive) → SA.audit('FORMULA.UPDATED') + SA.notify
   Node keys of the plant map: 'MIX' (shared mixers) · 'door:ST-EXT' · 'leaf:ST-xx' · 'frame:ST-xx' · 'door:ST-QP' · 'clad:ST-xx' · 'foam:ST-xx'
   Public: ERP.fct = { openStage(nodeKey), report(woId, key), updateFormula(id, pcts[], reason) } */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP;
  if (!SA || !ERP || !ERP.factory) return;
  const h = SA.h, st = SA.store, FX = ERP.factory, K = ERP.stock, CH = ERP.chart, U = ERP.ui;
  const get = (p) => st.get(p) || [];
  const today = () => ERP.day(0);
  const isToday = (iso) => !!iso && String(iso).slice(0, 10) === today();
  const num = (n, d) => ERP.fmt.num(n, d);
  const pct = (v, d) => ERP.fmt.pct(v, d == null ? 1 : d);
  const me = () => SA.session.userId || 'SYSTEM';
  const stop = (e) => e.stopPropagation();
  const OPEN = ['released', 'in_progress', 'on_hold'];
  const shiftNow = () => { const hr = new Date().getHours(); return hr >= 7 && hr < 15 ? 'A' : hr >= 15 && hr < 23 ? 'B' : 'C'; };

  if (!document.getElementById('i-scissors')) SA.icons.add('scissors', '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>');

  /* ═════════════ styles ═════════════ */
  (function () {
    if (document.querySelector('style[data-mod="factory"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'factory');
    s.textContent = `
.erp-kpis.fct-kpis { grid-template-columns: repeat(auto-fit, minmax(min(100%, 165px), 1fr)); }
@media (max-width: 520px) { .erp-kpis.fct-kpis .erp-kpi { min-height: 0; padding: 11px 12px; } .erp-kpis.fct-kpis .erp-kpi-v { font-size: 1.2rem; } }
.fct-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--color-text-muted); align-items: center; }
.fct-legend > span { display: inline-flex; align-items: center; gap: 6px; }
.fct-attn { display: flex; flex-direction: column; gap: 8px; }
.fct-attn-i { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; line-height: 1.7; padding: 9px 12px; border-radius: 10px; background: var(--color-danger-tint); color: #7a0d11; cursor: pointer; border: 0; text-align: start; font-family: inherit; width: 100%; }
.fct-attn-i.is-warn { background: var(--color-warning-tint); color: #6b3a00; } .fct-attn-i .icon { flex: none; margin-top: 3px; } .fct-attn-i b { font-weight: 700; }
.fct-attn-i:hover { filter: brightness(.97); }
/* map */
.fct-mapwrap { container: fctmap / inline-size; overflow-x: auto; padding-bottom: 4px; }
.fct-map { --fct-line: #8ea3c7; min-width: 980px; display: flex; flex-direction: column; }
.fct-phase { font: 700 12px var(--font-ar); color: var(--eg-navy); display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
.fct-phase i { font-style: normal; font: 700 11px var(--font-en); width: 20px; height: 20px; border-radius: 50%; display: inline-grid; place-items: center; background: var(--eg-navy); color: #fff; }
.fct-phase small { color: var(--color-text-muted); font-weight: 600; font-size: 11.5px; }
.fct-row { display: grid; grid-template-columns: minmax(0, 1fr) 22px minmax(0, 1fr) 22px minmax(0, 1fr) 22px minmax(0, 1fr); align-items: stretch; }
.fct-arr { display: flex; align-items: center; justify-content: center; color: var(--fct-line); min-width: 0; }
.fct-arr svg { width: 20px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.fct-node { position: relative; background: #fff; border: 1px solid var(--color-border); border-top: 3px solid var(--color-border-strong); border-radius: 12px; padding: 9px 10px 10px; display: flex; flex-direction: column; gap: 6px; min-width: 0; text-align: start; font-size: 12px; color: var(--color-text); box-shadow: 0 1px 2px rgba(1, 40, 100, .05); }
.fct-node.is-click { cursor: pointer; transition: box-shadow .15s, transform .15s; }
.fct-node.is-click:hover, .fct-node.is-click:focus-visible { box-shadow: 0 0 0 2px var(--color-focus, #7d9cd1), 0 6px 16px rgba(1, 40, 100, .12); outline: none; }
.fct-node.is-run { border-top-color: var(--eg-navy); } .fct-node.is-ok { border-top-color: var(--color-success); }
.fct-node.is-warn { border-top-color: var(--color-warning); background: linear-gradient(180deg, #fffaf2, #fff 50%); }
.fct-node.is-bad { border-top-color: var(--color-danger); background: linear-gradient(180deg, #fff4f4, #fff 55%); }
.fct-node.is-idle { border-top-color: var(--color-border-strong); }
.fct-node.fct-info { background: var(--color-primary-tint); border-color: #cfdaee; border-top-color: var(--eg-navy); }
.fct-node.fct-info.is-warn { background: linear-gradient(180deg, #fff6e8, #f3f6fc 70%); border-top-color: var(--color-warning); }
.fct-nh { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
.fct-nh b { font-size: 13px; line-height: 1.35; font-weight: 700; color: var(--eg-navy); min-width: 0; overflow-wrap: anywhere; }
.fct-ni { width: 22px; height: 22px; border-radius: 7px; background: var(--color-primary-tint); color: var(--eg-navy); display: grid; place-items: center; flex: none; }
.fct-info .fct-ni { background: #fff; }
.fct-person { display: flex; align-items: center; gap: 4px; color: var(--color-text-muted); font-size: 11.5px; line-height: 1.4; }
.fct-mc { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; min-height: 16px; }
.fct-mc small { color: var(--color-text-muted); font-size: 11px; margin-inline-start: 2px; }
.fct-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; background: #b8bec8; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, .15); flex: none; }
.fct-dot.is-aux { width: 9px; height: 9px; } .fct-dot.is-running { background: var(--color-success); } .fct-dot.is-idle { background: #b8bec8; }
.fct-dot.is-maintenance { background: var(--color-warning); } .fct-dot.is-down { background: var(--color-danger); animation: fct-pulse 1.4s infinite; }
.fct-dot.is-pm { box-shadow: 0 0 0 2px var(--color-warning); }
a.fct-dot:hover { transform: scale(1.25); }
@keyframes fct-pulse { 0%, 100% { box-shadow: 0 0 0 1px rgba(196, 18, 24, .5); } 50% { box-shadow: 0 0 0 5px rgba(196, 18, 24, .15); } }
.fct-nm { display: flex; flex-direction: column; gap: 4px; margin-top: auto; }
.fct-m { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; color: var(--color-text-muted); font-size: 11.5px; min-width: 0; }
.fct-m b { color: var(--color-text); font: 700 13px var(--font-en); white-space: nowrap; } .fct-m b small { font: 600 10.5px var(--font-ar); color: var(--color-text-muted); }
.fct-m.is-wip b { font-size: 17px; color: var(--eg-navy); }
.fct-sc { display: flex; align-items: center; justify-content: space-between; gap: 4px; border-radius: 7px; padding: 3px 6px; font-size: 11px; background: var(--color-bg-alt); color: var(--color-text-muted); flex-wrap: wrap; }
.fct-sc b { font: 700 11.5px var(--font-en); color: var(--color-text); white-space: nowrap; } .fct-sc em { font: 700 11.5px var(--font-en); font-style: normal; white-space: nowrap; }
.fct-sc.is-ok { background: var(--color-success-tint); } .fct-sc.is-ok em { color: var(--color-success); }
.fct-sc.is-warn { background: var(--color-warning-tint); } .fct-sc.is-warn em { color: var(--color-warning); }
.fct-sc.is-bad { background: var(--color-danger-tint); } .fct-sc.is-bad em, .fct-sc.is-bad b { color: var(--color-danger); }
.fct-note { font-size: 11px; line-height: 1.45; color: var(--color-warning); font-weight: 600; display: flex; gap: 4px; align-items: flex-start; }
.fct-note.is-bad { color: var(--color-danger); } .fct-note .icon { flex: none; margin-top: 2px; width: 12px; height: 12px; }
.fct-il { display: flex; flex-direction: column; gap: 5px; }
.fct-ili { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-size: 11.5px; color: var(--color-text-muted); }
.fct-ili b { font: 700 15px var(--font-en); color: var(--eg-navy); white-space: nowrap; } .fct-ili.is-warn b { color: var(--color-warning); } .fct-ili.is-bad b { color: var(--color-danger); } .fct-ili.is-ok b { color: var(--color-success); }
.fct-lk { color: inherit; text-decoration: none; } a.fct-lk:hover b, a.fct-lk:hover { text-decoration: underline; } .fct-lk.is-off { cursor: not-allowed; }
.fct-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.fct-pill { display: inline-flex; align-items: center; gap: 3px; font: 700 10.5px var(--font-en); color: var(--eg-navy); background: #fff; border: 1px solid #cfdaee; border-radius: 999px; padding: 1px 7px; text-decoration: none; white-space: nowrap; }
a.fct-pill:hover { background: var(--eg-navy); color: #fff; }
.fct-pill.is-ar { font: 600 10.5px var(--font-ar); } .fct-pill.is-muted { color: var(--color-text-muted); border-color: var(--color-border); }
.fct-nfoot { border-top: 1px dashed #c4d0e6; padding-top: 6px; font-size: 11.5px; display: flex; flex-wrap: wrap; gap: 4px 8px; }
.fct-nfoot a { color: var(--eg-navy); font-weight: 700; text-decoration: none; } .fct-nfoot a:hover { text-decoration: underline; }
.fct-branch { display: flex; flex-wrap: wrap; gap: 3px; }
/* return connectors */
.fct-ret { position: relative; height: 40px; }
.fct-ret > i { position: absolute; background: var(--fct-line); }
.fct-ret > i:nth-child(1) { inset-inline-end: var(--a); top: 0; height: 50%; width: 2px; }
.fct-ret > i:nth-child(2) { top: calc(50% - 1px); height: 2px; inset-inline-end: var(--a); inset-inline-start: var(--b); }
.fct-ret > i:nth-child(3) { inset-inline-start: var(--b); top: 50%; bottom: 0; width: 2px; }
.fct-ret.has-head > i:nth-child(3) { bottom: 7px; }
.fct-ret.has-head > i:nth-child(3)::after { content: ""; position: absolute; bottom: -7px; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top: 7px solid var(--fct-line); border-bottom: 0; }
.fct-ret > em { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fff; padding: 1px 10px; font: 600 11.5px var(--font-ar); font-style: normal; color: var(--eg-navy); border: 1px solid #cfdaee; border-radius: 999px; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; }
.fct-ret > em .icon { display: none; }
/* lanes (leaf / frame) */
.fct-lanes { display: flex; flex-direction: column; gap: 10px; }
.fct-lane { display: flex; align-items: stretch; min-width: 0; }
.fct-lane > .fct-node { flex: 1 1 0; }
.fct-lane > .fct-arr { flex: 0 0 16px; } .fct-lane > .fct-arr svg { width: 14px; }
.fct-stub { flex: 0 0 20px; position: relative; }
.fct-stub::before, .fct-stub::after { content: ""; position: absolute; background: var(--fct-line); }
.fct-stub.is-in::before { top: calc(50% - 1px); height: 2px; inset-inline-start: 9px; inset-inline-end: 3px; }
.fct-stub.is-out::before { top: calc(50% - 1px); height: 2px; inset-inline-start: 0; inset-inline-end: 9px; }
.fct-stub.is-in::after, .fct-stub.is-out::after { width: 2px; }
.fct-stub.is-in::after { inset-inline-start: 9px; } .fct-stub.is-out::after { inset-inline-end: 9px; }
.fct-lane.is-first > .fct-stub.is-in::after { top: 0; bottom: -5px; } .fct-lane.is-last > .fct-stub.is-in::after { top: -5px; bottom: 50%; }
.fct-lane.is-first > .fct-stub.is-out::after { top: 50%; bottom: -5px; } .fct-lane.is-last > .fct-stub.is-out::after { top: -5px; bottom: 0; }
.fct-stub.is-in > i { position: absolute; top: 50%; inset-inline-end: 0; transform: translateY(-50%); width: 0; height: 0; border-block: 4px solid transparent; border-inline-start: 6px solid var(--fct-line); }
.fct-tag { flex: 0 0 62px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 2px; border-radius: 12px; background: var(--eg-navy); color: #fff; padding: 8px 4px; }
.fct-tag b { font-size: 14px; } .fct-tag small { font-size: 10.5px; opacity: .8; line-height: 1.35; }
.fct-tag.is-frame { background: #345383; }
.fct-fill { flex: 1 1 0; position: relative; display: flex; align-items: center; justify-content: center; min-width: 60px; }
.fct-fill::before { content: ""; position: absolute; inset-inline: 0; top: calc(50% - 1px); border-top: 2px dashed var(--fct-line); }
.fct-fill span { position: relative; background: #fff; padding: 2px 10px; font-size: 11.5px; color: var(--color-text-muted); border-radius: 999px; border: 1px dashed #c4d0e6; text-align: center; }
/* scrap loop */
.fct-loop { display: grid; grid-template-columns: minmax(0, 1fr) 22px minmax(0, 1fr) 22px minmax(0, 1fr) 22px minmax(0, 1fr) 22px minmax(0, 1fr); align-items: stretch; }
.fct-loop .fct-node { border-top-color: var(--color-success); }
.fct-loop .fct-node.is-sale { border-top-color: var(--color-warning); }
.fct-loop-back { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; padding: 8px 12px; border-radius: 10px; border: 2px dashed #9fd0b0; color: var(--color-success); font-size: 12.5px; font-weight: 600; background: #f5fbf7; flex-wrap: wrap; text-align: center; }
.fct-loop-back button { font: inherit; background: none; border: 0; color: var(--eg-navy); text-decoration: underline; cursor: pointer; padding: 0; font-weight: 700; }
.fct-kg { display: flex; flex-direction: column; gap: 3px; }
.fct-kg > div { display: flex; justify-content: space-between; gap: 6px; font-size: 11.5px; color: var(--color-text-muted); }
.fct-kg b { font: 700 12.5px var(--font-en); color: var(--color-text); white-space: nowrap; }
/* compact lanes */
.fct-cl { border: 1px solid var(--color-border); border-radius: 14px; padding: 12px; background: #fbfcfe; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.fct-cl.is-down { border-color: #f0a9ad; background: linear-gradient(180deg, #fff3f3, #fff 60%); }
.fct-cl-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 13px; }
.fct-cl-head b { color: var(--eg-navy); } .fct-cl-down { color: var(--color-danger); font-weight: 600; font-size: 12.5px; display: flex; gap: 6px; align-items: flex-start; line-height: 1.6; flex-basis: 100%; }
.fct-cl-down .icon { flex: none; margin-top: 3px; }
.fct-crow { display: grid; grid-template-columns: 70px 18px minmax(0, 1fr) 18px minmax(0, 1fr) 18px minmax(0, 1fr); align-items: stretch; }
.fct-src { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 3px; text-align: center; font-size: 11px; color: var(--color-text-muted); border: 1px dashed var(--color-border-strong); border-radius: 10px; padding: 6px 4px; background: #fff; }
.fct-src .icon { color: var(--eg-navy); }
.fct-cl .fct-node.is-down-line { opacity: .92; }
.fct-cl-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); }
/* drawer */
.fct-dr { display: flex; flex-direction: column; gap: 16px; }
.fct-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.fct-stat { background: var(--color-bg-alt); border-radius: 12px; padding: 9px 11px; display: flex; flex-direction: column; gap: 2px; }
.fct-stat small { color: var(--color-text-muted); font-size: 11.5px; font-weight: 600; } .fct-stat b { font: 700 1.15rem var(--font-en); color: var(--color-text); }
.fct-stat.is-bad b { color: var(--color-danger); } .fct-stat.is-warn b { color: var(--color-warning); } .fct-stat.is-ok b { color: var(--color-success); }
.fct-h4 { margin: 0 0 8px; font-size: 14px; color: var(--eg-navy); display: flex; align-items: center; gap: 8px; justify-content: space-between; flex-wrap: wrap; }
.fct-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; border: 1px solid var(--color-border); border-radius: 12px; overflow: hidden; }
.fct-list > li { display: flex; gap: 10px; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--color-border); font-size: 13px; flex-wrap: wrap; background: #fff; }
.fct-list > li:last-child { border-bottom: 0; }
.fct-list .fct-grow { flex: 1 1 180px; min-width: 0; display: flex; flex-direction: column; gap: 2px; } .fct-list .fct-grow small { color: var(--color-text-muted); font-size: 12px; line-height: 1.5; }
.fct-list .fct-kgv { font: 700 13px var(--font-en); white-space: nowrap; }
.fct-numin input { font: 700 22px var(--font-en); min-height: 52px; text-align: center; }
.fct-quick { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 12px; } .fct-quick .btn { min-height: 40px; }
.fct-fgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0 12px; }
.fct-avail { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
/* formulas */
.fct-tb { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
.fct-tb .input-wrap { flex: 1 1 260px; min-width: 0; } .fct-tb > .select { flex: 0 1 200px; width: auto; min-width: 0; }
@media (max-width: 520px) { .fct-tb > .select { flex: 1 1 130px; } }
.fct-split { display: grid; gap: 16px; margin-block: 16px; grid-template-columns: minmax(0, 1.75fr) minmax(0, 1fr); align-items: start; }
@media (max-width: 1150px) { .fct-split { grid-template-columns: minmax(0, 1fr); } }
.fct-fgrid-cards { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); }
.fct-fcard { display: flex; flex-direction: column; gap: 10px; text-decoration: none; color: inherit; padding: 14px 16px; min-width: 0; }
a.fct-fcard:hover { box-shadow: var(--shadow-float); }
.fct-fcard-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.fct-fcard-top .chip:last-child { margin-inline-start: auto; }
.fct-code { font: 700 12px var(--font-en); color: #fff; background: var(--eg-navy); border-radius: 7px; padding: 2px 8px; white-space: nowrap; }
.fct-fcard > b { font-size: 14.5px; color: var(--color-text); line-height: 1.45; }
.fct-comp { display: flex; height: 12px; border-radius: 999px; overflow: hidden; background: var(--color-neutral-tint); }
.fct-comp i { display: block; height: 100%; min-width: 2px; } .fct-comp i + i { box-shadow: inset -1px 0 0 rgba(255, 255, 255, .7); }
.fct-comp.is-lg { height: 22px; border-radius: 8px; }
.fct-facts { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .9fr) minmax(0, 1.35fr) minmax(0, .7fr); gap: 6px; }
.fct-facts > div { background: var(--color-bg-alt); border-radius: 9px; padding: 6px 8px; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.fct-facts small { font-size: 10.5px; color: var(--color-text-muted); font-weight: 600; } .fct-facts b { font: 700 12.5px var(--font-en); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fct-uses { font-size: 12.5px; color: var(--color-text-muted); line-height: 1.6; }
.fct-fcard-foot { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--color-text-muted); border-top: 1px solid var(--color-border); padding-top: 8px; flex-wrap: wrap; margin-top: auto; }
.fct-ing { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--color-border); border-radius: 12px; overflow: hidden; margin-top: 12px; }
.fct-ing-row { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.3fr) 70px 100px 96px; gap: 10px; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--color-border); font-size: 13px; background: #fff; }
.fct-ing-row:last-child { border-bottom: 0; } .fct-ing-row.is-head { background: var(--color-bg-alt); font-size: 12px; color: var(--color-text-muted); font-weight: 600; padding-block: 7px; }
.fct-ing-row.is-total { background: var(--color-primary-tint); font-weight: 700; color: var(--eg-navy); }
.fct-ing-n { display: flex; align-items: center; gap: 8px; min-width: 0; } .fct-ing-n > span { min-width: 0; display: flex; flex-direction: column; } .fct-ing-n b { font-size: 13px; line-height: 1.35; } .fct-ing-n small { font: 500 11px var(--font-en); color: var(--color-text-muted); }
.fct-sw { width: 12px; height: 12px; border-radius: 4px; flex: none; }
.fct-ing-bar { display: flex; align-items: center; gap: 8px; min-width: 0; } .fct-ing-bar > span { flex: 1; height: 8px; border-radius: 999px; background: var(--color-neutral-tint); overflow: hidden; } .fct-ing-bar > span i { display: block; height: 100%; border-radius: 999px; }
.fct-ing-bar b { font: 700 13px var(--font-en); min-width: 48px; text-align: end; }
.fct-n { font-family: var(--font-en); text-align: end; white-space: nowrap; } .fct-n small { font-family: var(--font-ar); color: var(--color-text-muted); font-size: 11px; }
.fct-costs { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 12px; }
.fct-models { display: flex; flex-wrap: wrap; gap: 8px; }
.fct-model { display: flex; align-items: center; gap: 8px; border: 1px solid var(--color-border); border-radius: 10px; padding: 6px 10px; background: #fff; font-size: 12.5px; text-decoration: none; color: inherit; }
.fct-model img { width: 34px; height: 30px; object-fit: contain; } .fct-model b { display: block; } .fct-model small { color: var(--color-text-muted); font-size: 11.5px; }
a.fct-model:hover { border-color: var(--eg-navy); }
.fct-hist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.fct-hist li { display: flex; gap: 10px; font-size: 13px; line-height: 1.6; } .fct-hist li > i { width: 9px; height: 9px; border-radius: 50%; background: var(--eg-navy); margin-top: 7px; flex: none; }
.fct-hist small { display: block; color: var(--color-text-muted); font-size: 12px; }
.fct-edit-row { display: grid; grid-template-columns: minmax(0, 1fr) 110px 70px; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--color-border); font-size: 13px; }
.fct-edit-row input { text-align: center; font: 700 15px var(--font-en); min-height: 40px; }
.fct-edit-row .fct-delta { font: 700 12px var(--font-en); text-align: end; color: var(--color-text-muted); } .fct-edit-row .fct-delta.is-up { color: var(--color-success); } .fct-edit-row .fct-delta.is-down { color: var(--color-danger); }
.fct-total { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; padding: 10px 12px; border-radius: 10px; font-weight: 700; background: var(--color-success-tint); color: var(--color-success); }
.fct-total.is-bad { background: var(--color-danger-tint); color: var(--color-danger); } .fct-total b { font: 700 18px var(--font-en); }
.fct-muted { color: var(--color-text-muted); font-size: 12.5px; }
@container fctmap (min-width: 720px) and (max-width: 1060px) {
  .fct-map { min-width: 880px; }
  .fct-tag { flex-basis: 40px; } .fct-tag small { display: none; } .fct-tag b { font-size: 12.5px; }
  .fct-lane > .fct-arr { flex-basis: 12px; } .fct-lane > .fct-arr svg { width: 11px; }
  .fct-lane .fct-node { padding: 8px 7px; } .fct-lane .fct-ni { display: none; } .fct-lane .fct-nh b { font-size: 12px; }
  .fct-lane .fct-m { font-size: 10.5px; } .fct-lane .fct-m.is-wip b { font-size: 15px; } .fct-lane .fct-sc { padding: 2px 4px; }
}
@container fctmap (max-width: 719px) {
  .fct-map { min-width: 0; }
  .fct-row, .fct-loop, .fct-crow { display: flex; flex-direction: column; }
  .fct-arr { height: 18px; } .fct-arr svg { transform: rotate(-90deg); width: 16px; }
  .fct-lane { flex-direction: column; } .fct-lane > .fct-arr { flex: 0 0 18px; }
  .fct-stub, .fct-fill { display: none; }
  .fct-tag { flex: none; flex-direction: row; gap: 8px; padding: 7px 12px; justify-content: flex-start; } .fct-tag small { opacity: .85; }
  .fct-lanes { gap: 14px; }
  .fct-ret { height: auto; display: flex; justify-content: center; padding: 8px 0; } .fct-ret > i { display: none; }
  .fct-ret > em { position: static; transform: none; white-space: normal; text-align: center; } .fct-ret > em .icon { display: inline-block; }
  .fct-node { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 10px; row-gap: 6px; }
  .fct-node > * { grid-column: 1 / -1; }
  .fct-node > .fct-nh { grid-column: 1; } .fct-node > .fct-mc { grid-column: 2; grid-row: 1; justify-content: flex-end; }
  .fct-nm { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .fct-nm > .fct-m { flex-direction: column; align-items: flex-start; gap: 0; background: var(--color-bg-alt); border-radius: 8px; padding: 5px 7px; }
  .fct-nm > .fct-sc { flex-direction: column; align-items: flex-start; gap: 0; }
  .fct-src { flex-direction: row; justify-content: center; }
}
@media (max-width: 760px) { .fct-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } .fct-ing-row { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 6px; } .fct-ing-row > :nth-child(1) { grid-column: 1 / 3; } .fct-ing-row > :nth-child(2) { grid-column: 3; } .fct-ing-row > :nth-child(n+3) { display: block; text-align: start; } .fct-ing-row > :nth-child(n+3)::before { content: attr(data-l); display: block; color: var(--color-text-muted); font: 600 10.5px var(--font-ar); } .fct-ing-bar b { min-width: 0; } .fct-ing-row.is-head { display: none; } .fct-edit-row { grid-template-columns: minmax(0, 1fr) 96px 56px; } }
@media (prefers-reduced-motion: reduce) { .fct-dot.is-down { animation: none; } }`;
    document.head.appendChild(s);
  })();

  /* ═════════════ helpers ═════════════ */
  const SNAME = { 'ST-EXT': 'السحب', 'ST-DECOR': 'الديكور', 'ST-CUT': 'تقطيع وتخريم' };
  const sName = (id) => SNAME[id] || FX.stageName(id);
  const famOf = (itemId, lineId) => { const it = ERP.item(itemId); if (it && ['door', 'clad', 'foam'].indexOf(it.family) >= 0) return it.family; return lineId === 'L-03' ? 'clad' : lineId === 'L-04' ? 'foam' : 'door'; };
  const AUX = ['die', 'calibrator', 'haul-off'];
  const IMG = { door: '../../assets/images/products/doors.png', clad: '../../assets/images/products/cladding.png', foam: '../../assets/images/products/foam.png' };
  const FAM = { door: 'أبواب', clad: 'تجاليد', foam: 'فوم بورد', all: 'عامة (كل الخطوط)' };
  /** does the current user have the screen behind this route? (unknown route → assume yes, the shell guards it anyway) */
  function canRoute(route) {
    const segs = String(route || '').split('?')[0].split('/').filter(Boolean); let best = null;
    (SA.modules || []).forEach((m) => { const s = m._segs || []; if (s.length && s.length <= segs.length && s.every((x, i) => x === segs[i]) && (!best || s.length > best._segs.length)) best = m; });
    return !best || !best.perm || SA.can(best.perm);
  }
  const lk = (route, kids, cls) => (canRoute(route) ? h('a' + (cls || '.fct-lk'), { href: '#/' + route, onclick: stop }, kids) : h('span' + (cls || '.fct-lk') + '.is-off', { title: 'ليست من صلاحياتك' }, kids));
  const doc = (id, label) => { const r = ERP.route(id); return r ? lk(r, label || id, '.erp-doc.num') : h('span.num', {}, id || '—'); };
  const arrow = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 12'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = '<path d="M23 6H2M7 1 2 6l5 5"/>'; return h('span.fct-arr', { 'aria-hidden': 'true' }, s); };
  const MST = { running: 'يعمل', idle: 'جاهز (واقف)', maintenance: 'صيانة', down: 'عطل' };
  const openMwo = (mId) => get('maintenanceOrders').find((m) => m.machineId === mId && ['done', 'cancelled'].indexOf(m.status) < 0) || null;
  const pmLate = (m) => !!(m.nextPMAt && m.nextPMAt < today() && m.status !== 'down');
  const lateDays = (m) => Math.max(0, ERP.daysBetween(m.nextPMAt));
  const dot = (m) => { const tip = m.id + ' — ' + m.name + ' · ' + (MST[m.status] || m.status) + (pmLate(m) ? ' · صيانة وقائية متأخرة ' + lateDays(m) + ' يوم' : '') + (openMwo(m.id) ? ' · ' + openMwo(m.id).id : '');
    const cls = '.fct-dot.is-' + m.status + (AUX.indexOf(m.type) >= 0 ? '.is-aux' : '') + (pmLate(m) ? '.is-pm' : '');
    return canRoute('care/assets/' + m.id) ? h('a' + cls, { href: '#/care/assets/' + m.id, title: tip, 'aria-label': tip, onclick: stop }) : h('span' + cls, { title: tip, 'aria-label': tip }); };

  /* node definitions of the plant map */
  const N = (stageId, title, line, unit, lane, o) => Object.assign({ stageId, title, line, unit, lane }, o || {});
  const NODES = {
    MIX: N('ST-MIX', 'الخلاطة', null, 'كجم', 'كل الخطوط (3 خلاطات مشتركة)', { kg: true, mword: ['خلاطة', 'خلاطتين', 'خلاطات'] }),
    'door:ST-EXT': N('ST-EXT', 'السحب', 'L-01', 'قطعة', 'الأبواب — ضلفة + حلق', { kg: true, mword: ['ماكينة سحب', 'ماكينتين سحب', 'ماكينات سحب'] }),
    'leaf:ST-SAND': N('ST-SAND', 'السنفرة', 'L-02', 'ضلفة', 'الضلفة'), 'leaf:ST-TRIM': N('ST-TRIM', 'الترويس', 'L-02', 'ضلفة', 'الضلفة'),
    'leaf:ST-WOOD': N('ST-WOOD', 'تركيب الخشب', 'L-02', 'ضلفة', 'الضلفة'), 'leaf:ST-EDGE': N('ST-EDGE', 'الشريط', 'L-02', 'ضلفة', 'الضلفة'),
    'leaf:ST-CLEAN': N('ST-CLEAN', 'النضافة + المادة', 'L-02', 'ضلفة', 'الضلفة'), 'leaf:ST-LOCK': N('ST-LOCK', 'فتحة الكالون', 'L-02', 'ضلفة', 'الضلفة'),
    'leaf:ST-LAM': N('ST-LAM', 'اللمينيشن', 'L-02', 'ضلفة', 'الضلفة'), 'leaf:ST-DECOR': N('ST-DECOR', 'الديكور', 'L-02', 'ضلفة', 'الضلفة — للديكور والديكور البارز'),
    'frame:ST-LAM': N('ST-LAM', 'اللمينيشن', 'L-02', 'حلق', 'الحلق'), 'frame:ST-CUT': N('ST-CUT', 'تقطيع وتخريم', 'L-02', 'حلق', 'الحلق'),
    'door:ST-QP': N('ST-QP', 'الجودة والتغليف', 'L-02', 'باب', 'الأبواب — الضلفة + الحلق'),
    'clad:ST-EXT': N('ST-EXT', 'السحب', 'L-03', 'قطعة', 'التجاليد L-03', { kg: true }), 'clad:ST-CLCUT': N('ST-CLCUT', FX.stageName('ST-CLCUT'), 'L-03', 'قطعة', 'التجاليد L-03'), 'clad:ST-QP': N('ST-QP', 'الجودة والتغليف', 'L-03', 'قطعة', 'التجاليد L-03'),
    'foam:ST-EXT': N('ST-EXT', 'السحب', 'L-04', 'لوح', 'الفوم بورد L-04', { kg: true }), 'foam:ST-FBCAL': N('ST-FBCAL', FX.stageName('ST-FBCAL'), 'L-04', 'لوح', 'الفوم بورد L-04'), 'foam:ST-QP': N('ST-QP', 'الجودة والتغليف', 'L-04', 'لوح', 'الفوم بورد L-04')
  };
  function nodeKey(fam, track, stageId) {
    if (stageId === 'ST-MIX') return 'MIX';
    if (fam === 'door') { if (stageId === 'ST-EXT' || stageId === 'ST-QP') return 'door:' + stageId; return (track === 'leaf' || track === 'frame' ? track : stageId === 'ST-CUT' ? 'frame' : 'leaf') + ':' + stageId; }
    return fam + ':' + stageId;
  }
  const machinesOf = (k) => { const d = NODES[k]; if (!d) return []; return FX.machinesOf(d.stageId).filter((m) => !d.line || m.lineId === d.line); };
  const mainCount = (mcs) => mcs.filter((m) => AUX.indexOf(m.type) < 0).length;

  /* ═════════════ live model (one pass over open WOs + today's scrap) ═════════════ */
  /** today's share of a stage's progress: live stage reports (w.reports[].stage) count exactly; progress recorded before them is split
      by the WO's generic (seeded) reports of today vs all, else counted as today when the WO started today / the stage was touched today */
  function todayOf(w, s) {
    const R = w.reports || []; const live = R.filter((r) => r.stage === s.key); const gen = R.filter((r) => !r.stage);
    const lg = live.reduce((a, r) => a + (r.good || 0), 0), ls = live.reduce((a, r) => a + (r.scrap || 0), 0);
    const tg = live.filter((r) => isToday(r.at)).reduce((a, r) => a + (r.good || 0), 0), ts = live.filter((r) => isToday(r.at)).reduce((a, r) => a + (r.scrap || 0), 0);
    let share = 0; const gAll = gen.reduce((a, r) => a + (r.good || 0), 0);
    if (isToday(w.actualStart)) share = 1; else if (gAll > 0) share = gen.filter((r) => isToday(r.at)).reduce((a, r) => a + (r.good || 0), 0) / gAll; else share = isToday(s.lastAt) ? 1 : 0;
    return { good: Math.round(tg + Math.max(0, (s.good || 0) - lg) * share), scrap: Math.round(ts + Math.max(0, (s.scrap || 0) - ls) * share) };
  }
  function buildModel() {
    const t = today(); const A = {}; const famWip = { door: 0, clad: 0, foam: 0 };
    const node = (k) => A[k] || (A[k] = { key: k, wip: 0, wipKg: 0, good: 0, goodKg: 0, procKg: 0, scrapKg: 0, rows: [], logs: [], waiting: [] });
    get('workOrders').forEach((w) => {
      const open = OPEN.indexOf(w.status) >= 0; const touched = (w.stages || []).some((s) => isToday(s.lastAt));
      if (!open && !touched) return;
      const fam = famOf(w.itemId, w.lineId);
      FX.stageView(w).forEach((s) => {
        const a = node(nodeKey(fam, s.track, s.stageId)); const uk = FX.unitKg(w.itemId, s.track);
        if (open) { a.wip += s.avail; a.wipKg += s.avail * uk; famWip[fam] = (famWip[fam] || 0) + s.avail; if (s.avail > 0) a.rows.push({ wo: w, s }); }
        if (isToday(s.lastAt)) { const td = todayOf(w, s); a.good += td.good; a.goodKg += td.good * uk; a.procKg += (td.good + td.scrap) * uk; }
      });
      if (w.status === 'released' && !w.issued) node('MIX').waiting.push(w);
    });
    let scrapKg = 0, scrapN = 0;
    get('scrapLogs').forEach((l) => { if (l.date !== t) return; const a = node(nodeKey(famOf(l.itemId, l.lineId), l.track, l.stageId)); a.scrapKg += l.kg || 0; a.logs.push(l); scrapKg += l.kg || 0; scrapN++; });
    Object.keys(A).forEach((k) => { const a = A[k]; const d = NODES[k]; const std = FX.stdPct(d ? d.stageId : ''); a.std = std; const base = a.procKg + a.scrapKg;
      a.pct = base > 0 && a.procKg > 0 ? a.scrapKg / base : null; a.tone = a.pct == null ? 'none' : a.pct <= std ? 'ok' : a.pct <= std * 1.5 ? 'warn' : 'bad'; });
    const mix = A.MIX || {}; const plantPct = mix.procKg > 0 ? scrapKg / (mix.procKg + scrapKg) : null;
    return { A, famWip, scrapKg, scrapN, plantPct };
  }
  const EMPTY = { wip: 0, wipKg: 0, good: 0, goodKg: 0, procKg: 0, scrapKg: 0, rows: [], logs: [], waiting: [], pct: null, tone: 'none', std: 0 };
  const agg = (M, k) => M.A[k] || Object.assign({}, EMPTY, { std: FX.stdPct((NODES[k] || {}).stageId) });
  function nodeTone(k, a) {
    const mcs = machinesOf(k); const main = mcs.filter((m) => AUX.indexOf(m.type) < 0);
    if (a.tone === 'bad' || (main.length && main.every((m) => m.status === 'down')) || mcs.some((m) => m.status === 'down')) return 'bad';
    if (a.tone === 'warn' || mcs.some((m) => m.status === 'maintenance' || pmLate(m))) return 'warn';
    if (a.wip > 0 || a.good > 0) return a.tone === 'ok' ? 'ok' : 'run';
    return 'idle';
  }

  /* ═════════════ plant map pieces ═════════════ */
  function stageNode(k, M, o) {
    o = o || {}; const d = NODES[k]; const a = agg(M, k); const mcs = machinesOf(k); const tone = nodeTone(k, a); const mc = mainCount(mcs);
    const mw = d.mword || ['ماكينة', 'ماكينتين', 'ماكينات']; const late = mcs.filter(pmLate).sort((x, y) => lateDays(y) - lateDays(x)); const down = mcs.filter((m) => m.status === 'down');
    const wipV = d.kg && k === 'MIX' ? h('b.num', {}, num(a.wipKg), ' ', h('small', {}, 'كجم')) : h('b.num', {}, num(a.wip), ' ', h('small', {}, d.unit));
    const goodV = d.kg ? h('b.num', {}, num(a.goodKg), ' ', h('small', {}, 'كجم')) : h('b.num', {}, num(a.good));
    const sc = h('div.fct-sc.is-' + (a.tone === 'none' ? 'idle' : a.tone), { title: 'هالك اليوم ' + num(a.scrapKg, 1) + ' كجم · المسموح ' + pct(a.std) + ' من الوزن المُشغّل' }, h('span', {}, 'هالك'), h('b.num', {}, num(a.scrapKg, 1) + ' كجم'), h('em.num', {}, a.pct == null ? '—' : pct(a.pct)));
    const open = () => openStage(k);
    return h('div.fct-node.is-click.is-' + tone + (o.cls || ''), { role: 'button', tabindex: '0', 'aria-label': d.title + ' — ' + d.lane + ': بانتظار ' + a.wip + ' · هالك اليوم ' + num(a.scrapKg, 1) + ' كجم', onclick: open, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }, dataset: { node: k } },
      h('div.fct-nh', {}, h('span.fct-ni', {}, SA.icon((FX.stage(d.stageId) || {}).icon || 'factory', 'icon-sm')), h('b', {}, d.title)),
      h('div.fct-mc', {}, mcs.length ? mcs.map(dot) : null, h('small', {}, mcs.length ? (mc === 1 ? '1 ' + mw[0] : mc === 2 ? mw[1] : num(mc) + ' ' + mw[2]) : 'يدوي')),
      o.extra || null,
      down.length ? h('div.fct-note.is-bad', {}, SA.icon('alert', 'icon-sm'), h('span', {}, down.map((m) => m.id).join('، ') + ' عطل')) : late.length ? h('div.fct-note', {}, SA.icon('wrench', 'icon-sm'), h('span', {}, late[0].id + ' صيانة متأخرة ' + lateDays(late[0]) + ' يوم')) : null,
      k === 'MIX' && a.waiting.length ? h('div.fct-note', {}, SA.icon('clock', 'icon-sm'), h('span', {}, a.waiting.length + ' أمر بانتظار صرف الخامات')) : null,
      h('div.fct-nm', {}, h('div.fct-m.is-wip', {}, h('span', {}, 'بانتظار'), wipV), h('div.fct-m', {}, h('span', {}, 'سليم اليوم'), goodV), sc));
  }
  function infoNode(o) {
    return h('div.fct-node.fct-info' + (o.tone ? '.is-' + o.tone : ''), {},
      h('div.fct-nh', {}, h('span.fct-ni', {}, SA.icon(o.icon, 'icon-sm')), h('b', {}, o.title)),
      o.person ? h('small.fct-person', {}, SA.icon('user', 'icon-sm'), o.person) : null,
      h('div.fct-il', {}, o.lines.filter(Boolean).map((l) => h('div.fct-ili' + (l.tone ? '.is-' + l.tone : ''), {}, h('span', {}, l.label), l.href ? lk(l.href, h('b.num', {}, l.value)) : h('b.num', {}, l.value)))),
      o.extra || null, o.foot ? h('div.fct-nfoot', {}, o.foot) : null);
  }
  const ret = (a, b, label, head) => h('div.fct-ret' + (head ? '.has-head' : ''), { style: { '--a': a, '--b': b }, 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), label ? h('em', {}, SA.icon('arrowleft', 'icon-sm'), label) : null);
  const phase = (n, title, sub) => h('div.fct-phase', {}, h('i', {}, String(n)), title, sub ? h('small', {}, '— ' + sub) : null);
  const user = (id) => { const u = SA.userById ? SA.userById(id) : null; return u ? u.name : SA.userName(id); };

  function rawStoreNode() {
    const grn = get('grns').filter((g) => g.status === 'pending_qc'); const mirs = get('issueRequests').filter((m) => m.status === 'pending' || m.status === 'partial');
    const top = mirs.slice().sort((a, b) => (a.priority === 'high' ? -1 : 0) - (b.priority === 'high' ? -1 : 0))[0];
    return infoNode({ icon: 'inbox', title: 'أمين مخزن الخامات', person: user('U-36') + ' · W-02 / W-07', tone: mirs.length ? 'warn' : null,
      lines: [{ label: 'استلام بانتظار فحص الجودة', value: num(grn.length), href: 'scm/grn?status=pending_qc', tone: grn.length ? 'warn' : null }, { label: 'أذون صرف للخلاطة معلقة', value: num(mirs.length), href: 'scm/issues', tone: mirs.length ? 'warn' : 'ok' }],
      extra: top ? h('div.fct-chips', {}, doc(top.id), h('span.fct-muted', {}, '← ' + top.woId)) : null,
      foot: [lk('scm/desk', 'مكتب أمين المخزن', 'a')] });
  }
  function formulasNode() {
    const fs = get('formulas'); const act = fs.filter((f) => f.status === 'active').length; const used = {};
    get('workOrders').filter((w) => OPEN.indexOf(w.status) >= 0).forEach((w) => FX.formulasFor(w.itemId).forEach((f) => { used[f.formulaId] = true; }));
    return infoNode({ icon: 'beaker', title: fs.length + ' خلطة كيميائية', lines: [{ label: 'معتمدة', value: num(act), href: 'mfg/formulas', tone: 'ok' }, { label: 'مطحون مسموح', value: rangeTxt(fs.map((f) => f.regMaxPct || 0)) }],
      extra: h('div', {}, h('small.fct-muted', {}, 'خلطات الأوامر الجارية'), h('div.fct-chips', { style: { marginTop: '3px' } }, Object.keys(used).sort().map((id) => lk('mfg/formulas/' + id, id, '.fct-pill')))),
      foot: [lk('mfg/formulas', 'كل الخلطات', 'a')] });
  }
  const rangeTxt = (arr) => { const v = arr.filter((x) => x > 0); if (!v.length) return '—'; return Math.round(Math.min(...v) * 100) + '–' + Math.round(Math.max(...v) * 100) + '%'; };
  function finalQcNode() {
    const q = get('qcInspections').filter((x) => x.kind === 'final' && x.result === 'pending'); const passT = get('qcInspections').filter((x) => x.kind === 'final' && x.result !== 'pending' && isToday(x.at));
    return infoNode({ icon: 'shield', title: 'الفحص النهائي', tone: q.length ? 'warn' : null, lines: [{ label: 'بانتظار الفحص', value: num(q.length), href: 'mfg/qc', tone: q.length ? 'warn' : 'ok' }, { label: 'اتفحص اليوم', value: num(passT.length) }],
      extra: q.length ? h('div.fct-chips', {}, q.slice(0, 2).map((x) => doc(x.id))) : null });
  }
  function fgStoreNode() {
    const p = get('fgReceipts').filter((r) => r.status === 'pending'); const rt = get('fgReceipts').filter((r) => r.status === 'received' && isToday(r.receivedAt));
    return infoNode({ icon: 'warehouse', title: 'أمين مخزن المنتج التام', person: user('U-37') + ' · W-01', tone: p.length ? 'warn' : null,
      lines: [{ label: 'إنتاج بانتظار الاستلام', value: num(p.length) + (p.length ? ' (' + num(p.reduce((s, r) => s + (r.qty || 0), 0)) + ')' : ''), href: 'scm/fg-receipts', tone: p.length ? 'warn' : 'ok' }, { label: 'اتستلم اليوم', value: num(rt.length) }],
      extra: p.length ? h('div.fct-chips', {}, p.slice(0, 2).map((r) => doc(r.id))) : null, foot: [lk('scm/fg-receipts', 'استلام الإنتاج التام', 'a')] });
  }
  function deliveryNode() {
    const t = today(); const dn = get('deliveries').filter((d) => d.plannedDate === t || isToday(d.dispatchedAt) || isToday(d.deliveredAt));
    const out = dn.filter((d) => d.status === 'dispatched' || d.status === 'in_transit').length, done = dn.filter((d) => d.status === 'delivered').length; const tom = get('deliveries').filter((d) => d.plannedDate === ERP.day(1) && d.status === 'planned').length;
    return infoNode({ icon: 'truck', title: 'التسليم للعملاء', lines: [{ label: 'أذون تسليم اليوم', value: num(dn.length), href: 'scm/deliveries' }, { label: 'خرجت / اتسلمت', value: num(out) + ' / ' + num(done), tone: done ? 'ok' : null }, { label: 'مخطط بكرة', value: num(tom) }],
      foot: [lk('scm/deliveries', 'أذون التسليم', 'a')] });
  }
  function decorExtra() {
    const c = { plain: 0, decor: 0, raised: 0 }; get('workOrders').filter((w) => OPEN.indexOf(w.status) >= 0 && famOf(w.itemId) === 'door').forEach((w) => { c[FX.finishType(w.itemId)]++; });
    return h('div.fct-branch', { title: 'السادة تعدّي على طول للجودة والتغليف — الديكور والديكور البارز على ماكينة الديكور' }, h('span.fct-pill.is-ar.is-muted', {}, FX.FINISH.plain + ' ' + c.plain + ' ← الجودة'), h('span.fct-pill.is-ar', {}, FX.FINISH.decor + ' ' + c.decor), h('span.fct-pill.is-ar', {}, FX.FINISH.raised + ' ' + c.raised));
  }
  function lane(kind, keys, M, cls) {
    const kids = []; keys.forEach((k, i) => { if (i) kids.push(arrow()); kids.push(stageNode(k, M, k === 'leaf:ST-DECOR' ? { extra: decorExtra() } : null)); });
    const tag = h('div.fct-tag' + (kind === 'frame' ? '.is-frame' : ''), {}, h('b', {}, FX.TRACKS[kind]), h('small', {}, keys.length === 2 ? 'مرحلتين' : keys.length + ' مراحل'));
    return h('div.fct-lane' + cls, {}, h('div.fct-stub.is-in', {}, h('i')), tag, arrow(), kids, kind === 'frame' ? h('div.fct-fill', {}, h('span', {}, 'الحلق جاهز ← يتجمع مع الضلفة في الجودة والتغليف')) : null, h('div.fct-stub.is-out'));
  }
  function scrapLoop(M) {
    const W = FX.SCRAP_WH; const reg = K.qty(FX.REG, W); const ops = get('scrapOps'); const last = ops.find((o) => o.kind === 'grind'); const g = ERP.machine('M-502');
    const sales = get('scrapSales'); const pend = sales.filter((s) => s.status === 'pending_approval'); const appr = sales.filter((s) => s.status === 'approved');
    const fs = get('formulas'); const byFam = (f) => rangeTxt(fs.filter((x) => x.family === f).map((x) => x.regMaxPct || 0));
    const items = FX.SCRAP_ITEMS.map((id) => h('div', {}, h('span', {}, (ERP.item(id) || {}).name || id), h('b.num', {}, num(K.qty(id, W)) + ' كجم')));
    const n1 = infoNode({ icon: 'trash', title: 'الهوالك من كل المراحل', lines: [{ label: 'اليوم', value: num(M.scrapKg, 1) + ' كجم', href: 'mfg/scrap', tone: M.plantPct != null && M.plantPct > 0.025 ? 'warn' : null }, { label: 'تسجيلات اليوم', value: num(M.scrapN), href: 'mfg/scrap' }], extra: h('small.fct-muted', {}, 'كل تسجيل: مرحلة + سبب + قطع + وزن') });
    const n2 = infoNode({ icon: 'warehouse', title: 'مخزن الهوالك ' + W, extra: h('div.fct-kg', {}, items), lines: [], foot: [lk('scm/stock?wh=' + W, 'رصيد المخزن', 'a')] });
    const n3 = infoNode({ icon: 'recycle', title: 'الكسارة M-502', extra: h('div.fct-mc', {}, g ? dot(g) : null, h('small', {}, g ? MST[g.status] || g.status : '—')),
      lines: [{ label: 'متاح للطحن', value: num(FX.scrapAvail('IT-SCR-GR')) + ' كجم' }, last ? { label: 'آخر طحن ' + SA.fmt.rel(last.at), value: num(last.kgIn) + '←' + num(last.kgOut), href: 'mfg/scrap?q=' + last.id } : null] });
    const n4 = infoNode({ icon: 'layers', title: 'مطحون (Regrind)', lines: [{ label: 'رصيد ' + W, value: num(reg) + ' كجم', href: 'scm/stock/' + FX.REG, tone: 'ok' }, { label: 'اتطحن 30 يوم', value: num(ops.filter((o) => o.kind === 'grind' && ERP.daysBetween(o.at.slice(0, 10)) <= 30).reduce((s, o) => s + o.kgOut, 0)) + ' كجم' }] });
    const n5 = infoNode({ icon: 'mixer', title: 'يرجع للخلاطة', lines: [{ label: 'الأبواب', value: byFam('door') }, { label: 'التجاليد', value: byFam('clad') }, { label: 'الفوم بورد', value: byFam('foam') }], extra: h('small.fct-muted', {}, 'أقصى نسبة مطحون في الخلطة — ', lk('mfg/formulas', 'الخلطات')) });
    const sale = h('div.fct-node.fct-info.is-sale' + (pend.length ? '.is-warn' : ''), {}, h('div.fct-nh', {}, h('span.fct-ni', {}, SA.icon('coins', 'icon-sm')), h('b', {}, 'بيع الزيادة (بموافقة المدير المالي)')),
      h('div.fct-il', {}, h('div.fct-ili' + (pend.length ? '.is-warn' : ''), {}, h('span', {}, 'بانتظار الاعتماد'), lk('mfg/scrap', h('b.num', {}, num(pend.length)))), h('div.fct-ili', {}, h('span', {}, 'معتمد للتسليم'), lk('mfg/scrap', h('b.num', {}, num(appr.length))))),
      pend.length ? h('div.fct-chips', {}, pend.slice(0, 2).map((s) => doc(s.id)), pend[0].approvalId ? doc(pend[0].approvalId) : null) : null);
    return h('div', {}, h('div.fct-loop', {}, n1, arrow(), n2, arrow(), n3, arrow(), n4, arrow(), n5),
      h('div.erp-grid.erp-grid-2', { style: { marginBlock: '10px 0' } }, h('div.fct-loop-back', {}, SA.icon('recycle', 'icon-sm'), 'المطحون يرجع للخلاطة جوه الخلطة بالنسبة المسموحة — ', h('button', { type: 'button', onclick: () => openStage('MIX') }, 'افتح الخلاطة')), sale));
  }
  function compactLane(fam, lineId, M) {
    const ln = ERP.line(lineId) || { id: lineId, name: lineId, status: 'running' }; const down = ln.status === 'down';
    const mwo = get('maintenanceOrders').find((m) => m.lineId === lineId && m.kind === 'breakdown' && ['done', 'cancelled'].indexOf(m.status) < 0);
    const held = get('workOrders').filter((w) => w.lineId === lineId && w.status === 'on_hold'); const cur = get('workOrders').filter((w) => w.lineId === lineId && ['in_progress', 'released'].indexOf(w.status) >= 0);
    const mins = ln.downSince ? Math.max(0, Math.round((Date.now() - new Date(ln.downSince).getTime()) / 60000)) : 0; const dur = mins < 60 ? mins + ' دقيقة' : Math.floor(mins / 60) + ' س ' + (mins % 60) + ' د';
    const keys = [fam + ':ST-EXT', fam + ':' + (fam === 'clad' ? 'ST-CLCUT' : 'ST-FBCAL'), fam + ':ST-QP'];
    const row = [h('div.fct-src', {}, SA.icon('mixer', 'icon-sm'), h('span', {}, 'من الخلاطة'))]; keys.forEach((k) => { row.push(arrow(), stageNode(k, M, { cls: down ? '.is-down-line' : '' })); });
    return h('div.fct-cl' + (down ? '.is-down' : ''), {},
      h('div.fct-cl-head', {}, lk('mfg/lines/' + lineId, h('span.fct-code', {}, lineId), 'a'), h('b', {}, ln.name), U.status('line', ln.status), cur.map((w) => doc(w.id)), held.map((w) => h('span', {}, doc(w.id), ' ', SA.chip('متوقف', 'danger'))),
        down ? h('div.fct-cl-down', {}, SA.icon('alert', 'icon-sm'), h('span', {}, 'متوقف منذ ' + dur + ' — ' + (ln.downReason || 'عطل'), mwo ? h('span', {}, ' · ', doc(mwo.id), ' ', U.status('mwo', mwo.status)) : null)) : null),
      h('div.fct-crow', {}, row));
  }

  /* ═════════════ screen 1: mfg/flow ═════════════ */
  function flowBuild() {
    const M = buildModel(); const wos = get('workOrders');
    const run = wos.filter((w) => w.status === 'in_progress'), rel = wos.filter((w) => w.status === 'released'), hold = wos.filter((w) => w.status === 'on_hold');
    const packed = ['door', 'clad', 'foam'].map((f) => ({ f, n: agg(M, f + ':ST-QP').good })); const packedTot = packed.reduce((s, x) => s + x.n, 0);
    const wipTot = M.famWip.door + M.famWip.clad + M.famWip.foam;
    const over = Object.keys(NODES).filter((k) => M.A[k] && (M.A[k].tone === 'bad' || M.A[k].tone === 'warn')).sort((a, b) => (M.A[b].pct / M.A[b].std) - (M.A[a].pct / M.A[a].std));
    const stopped = get('machines').filter((m) => m.status === 'down' || m.status === 'maintenance');
    const UN = { door: 'باب', clad: 'قطعة تجاليد', foam: 'لوح' };
    const kpis = fk(U.kpis([
      U.kpi({ label: 'أوامر تحت التشغيل', value: num(run.length), sub: num(rel.length) + ' مُطلق' + (rel.filter((w) => !w.issued).length ? ' (' + rel.filter((w) => !w.issued).length + ' بانتظار الصرف)' : '') + ' · ' + num(hold.length) + ' متوقف', icon: 'clipboard', href: '#/mfg/workorders?status=in_progress', tone: hold.length ? 'warning' : null }),
      U.kpi({ label: 'شغل تحت التشغيل (WIP)', value: num(wipTot), sub: 'أبواب ' + num(M.famWip.door) + ' · تجاليد ' + num(M.famWip.clad) + ' · فوم ' + num(M.famWip.foam) + ' قطعة', icon: 'layers' }),
      U.kpi({ label: 'المُعبأ اليوم (الجودة والتغليف)', value: num(packedTot), sub: packed.filter((x) => x.n).map((x) => num(x.n) + ' ' + UN[x.f]).join(' · ') || 'لا يوجد بعد', icon: 'box', tone: packedTot ? 'success' : null }),
      U.kpi({ label: 'هالك اليوم', value: num(M.scrapKg, 1) + ' كجم', sub: (M.plantPct != null ? pct(M.plantPct) + ' من الخلطة المُشغّلة · ' : '') + M.scrapN + ' تسجيل', icon: 'trash', href: canRoute('mfg/scrap') ? '#/mfg/scrap' : null, tone: M.plantPct != null && M.plantPct > 0.025 ? 'warning' : null }),
      U.kpi({ label: 'محتاج انتباه', value: num(over.length) + ' / ' + num(stopped.length), sub: 'مراحل فوق المسموح / ماكينات واقفة', icon: 'alert', tone: over.some((k) => M.A[k].tone === 'bad') || stopped.some((m) => m.status === 'down') ? 'danger' : over.length || stopped.length ? 'warning' : 'success' })
    ]));
    const attn = [];
    over.slice(0, 3).forEach((k) => { const a = M.A[k]; const d = NODES[k]; const late = machinesOf(k).filter(pmLate);
      attn.push(h('button.fct-attn-i' + (a.tone === 'warn' ? '.is-warn' : ''), { type: 'button', onclick: () => openStage(k) }, SA.icon('alert', 'icon-sm'), h('span', {}, h('b', {}, d.title + ' — ' + d.lane.split(' — ')[0]), ': هالك اليوم ' + num(a.scrapKg, 1) + ' كجم (' + pct(a.pct) + ' — المسموح ' + pct(a.std) + ')' + (late.length ? ' · ' + late[0].id + ' صيانة وقائية متأخرة ' + lateDays(late[0]) + ' يوم' : '') + ' — اضغط للتفاصيل'))); });
    get('lines').filter((l) => l.status === 'down').forEach((ln) => { const m = get('machines').find((x) => x.lineId === ln.id && x.status === 'down');
      attn.push(h('button.fct-attn-i', { type: 'button', onclick: () => SA.nav('mfg/lines/' + ln.id) }, SA.icon('alert', 'icon-sm'), h('span', {}, h('b', {}, ln.name + ' (' + ln.id + ') متوقف'), ' — ' + (ln.downReason || '') + (m ? ' · ' + m.id + ' ' + m.name : '') + (get('workOrders').some((w) => w.lineId === ln.id && w.status === 'on_hold') ? ' · أوامر متوقفة على الخط' : '')))); });

    const map = h('div.fct-map', {},
      phase(1, 'الاستلام والخلط والسحب', 'الخامات بإذن صرف حسب الخلطة'),
      h('div.fct-row', {}, rawStoreNode(), arrow(), formulasNode(), arrow(), stageNode('MIX', M), arrow(), stageNode('door:ST-EXT', M)),
      ret('calc((100% - 66px) / 8)', '9px', 'بروفايل الضلفة + بروفايل الحلق'),
      h('div.fct-lanes', {}, lane('leaf', ['leaf:ST-SAND', 'leaf:ST-TRIM', 'leaf:ST-WOOD', 'leaf:ST-EDGE', 'leaf:ST-CLEAN', 'leaf:ST-LOCK', 'leaf:ST-LAM', 'leaf:ST-DECOR'], M, '.is-first'), lane('frame', ['frame:ST-LAM', 'frame:ST-CUT'], M, '.is-last')),
      ret('9px', 'calc((100% - 66px) / 8)', 'الضلفة + الحلق = باب كامل', true),
      h('div.fct-row', {}, stageNode('door:ST-QP', M), arrow(), finalQcNode(), arrow(), fgStoreNode(), arrow(), deliveryNode()));
    const legend = h('div.fct-legend', { style: { marginTop: '12px' } }, ['running', 'idle', 'maintenance', 'down'].map((s) => h('span', {}, h('i.fct-dot.is-' + s), MST[s])), h('span', {}, h('i.fct-dot.is-running.is-pm'), 'صيانة وقائية متأخرة'),
      h('span', {}, h('span.fct-sc.is-ok', {}, h('em', {}, '%')), 'ضمن المسموح'), h('span', {}, h('span.fct-sc.is-warn', {}, h('em', {}, '%')), 'فوق المسموح'), h('span', {}, h('span.fct-sc.is-bad', {}, h('em', {}, '%')), 'أكتر من 1.5× المسموح'), h('span', {}, 'اضغط على أي مرحلة للأوامر والهوالك'));

    return h('div', {},
      SA.pageHead({ title: 'مسار التصنيع', desc: 'دفتر المصنع كخريطة لحظية: من استلام الخامات والخلطة لحد التسليم للعميل — كل مرحلة بماكيناتها والشغل اللي مستنيها والسليم والهالك النهارده.', tags: [SA.chip('لحظي', 'success'), U.demo('نسب الهالك المسموحة تجريبية')],
        actions: [SA.can('mfg.shopfloor.view') ? SA.btn({ label: 'أرضية المصنع', icon: 'monitor', kind: 'ghost', onClick: () => SA.nav('mfg/shopfloor') }) : null, canRoute('mfg/scrap') ? SA.btn({ label: 'الهوالك', icon: 'recycle', kind: 'ghost', onClick: () => SA.nav('mfg/scrap') }) : null, SA.can('mfg.formulas.view') ? SA.btn({ label: 'الخلطات', icon: 'beaker', kind: 'ghost', onClick: () => SA.nav('mfg/formulas') }) : null] }),
      kpis, attn.length ? h('div.fct-attn', { style: { marginTop: '14px' } }, attn) : null,
      SA.card({ title: 'خريطة المصنع — الأبواب (الضلفة + الحلق)', tags: [h('span.sap-count', {}, num(run.length + rel.length + hold.length) + ' أمر مفتوح')] }, h('div.fct-mapwrap', {}, map), legend),
      SA.card({ title: 'دورة الهوالك — من كل مرحلة للمخزن والكسارة وترجع الخلاطة' }, h('div.fct-mapwrap', {}, h('div.fct-map', {}, scrapLoop(M)))),
      SA.card({ title: 'خطوط التجاليد والفوم بورد' }, h('div.fct-mapwrap', {}, h('div.fct-map', { style: { minWidth: '0' } }, h('div.fct-cl-grid', {}, compactLane('clad', 'L-03', M), compactLane('foam', 'L-04', M))))));
  }
  function flowRender(root, ctx) {
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'التنفيذ' }, { label: 'مسار التصنيع' }]);
    const off = SA.live(root, flowBuild, ['workOrders', 'machines', 'scrapLogs', 'issueRequests', 'fgReceipts', 'qcInspections', 'deliveries', 'stock', 'lines', 'scrapSales', 'scrapOps', 'grns', 'formulas']);
    const want = ctx.params && ctx.params.stage; if (want && NODES[want]) setTimeout(() => openStage(want), 0);
    return off;
  }

  /* ═════════════ stage drawer ═════════════ */
  function openStage(k) {
    const d = NODES[k]; if (!d) return; const stg = FX.stage(d.stageId) || {};
    const body = h('div.fct-dr');
    const dr = SA.drawer({ title: d.title + ' — ' + d.lane, subtitle: stg.desc || '', size: 'lg', body, foot: [canRoute('mfg/scrap') ? h('a.btn.btn-ghost', { href: '#/mfg/scrap?stage=' + d.stageId, onclick: () => dr.close() }, SA.icon('recycle', 'icon-sm'), 'كل هوالك المرحلة') : null, h('button.btn.btn-primary', { type: 'button', onclick: () => dr.close() }, 'تم')].filter(Boolean) });
    const off = SA.live(body, () => stageBody(k), ['workOrders', 'scrapLogs', 'machines', 'maintenanceOrders', 'issueRequests']);
    dr.closed.then(off);
    return dr;
  }
  function stageBody(k) {
    const d = NODES[k]; const M = buildModel(); const a = agg(M, k); const mcs = machinesOf(k); const tone = a.tone === 'none' ? null : a.tone;
    const stats = h('div.fct-stats', {}, stat('بانتظار عند المرحلة', d.kg && k === 'MIX' ? num(a.wipKg) + ' كجم' : num(a.wip) + ' ' + d.unit), stat('سليم اليوم', d.kg ? num(a.goodKg) + ' كجم' : num(a.good) + ' ' + d.unit),
      stat('هالك اليوم', num(a.scrapKg, 1) + ' كجم', tone), stat('النسبة / المسموح', (a.pct == null ? '—' : pct(a.pct)) + ' / ' + pct(a.std), tone));
    const late = mcs.filter(pmLate);
    const warn = a.tone === 'bad' ? SA.alert('danger', h('b', {}, 'الهالك اليوم ' + pct(a.pct) + ' — أكتر من مرة ونص المسموح (' + pct(a.std) + ').'), late.length ? ' ' + late.map((m) => m.id + ' ' + m.name + ': الصيانة الوقائية متأخرة ' + lateDays(m) + ' يوم').join(' · ') + ' — راجع الماكينة والمشغّل.' : ' راجع الماكينة والمشغّل والخامة.')
      : a.tone === 'warn' ? SA.alert('warning', 'الهالك اليوم ' + pct(a.pct) + ' فوق المسموح ' + pct(a.std) + '.' + (late.length ? ' ' + late.map((m) => m.id + ': الصيانة الوقائية متأخرة ' + lateDays(m) + ' يوم').join(' · ') + ' — غالبًا السبب في الماكينة.' : '')) : null;
    const mList = mcs.length ? h('ul.fct-list', {}, mcs.map((m) => { const mw = openMwo(m.id); return h('li', {}, dot(m), h('div.fct-grow', {}, h('span', {}, doc(m.id), ' ', h('b', {}, m.name)), h('small', {}, (AUX.indexOf(m.type) >= 0 ? 'وحدة مساعدة · ' : '') + 'صيانة قادمة ' + ERP.fmt.date(m.nextPMAt) + (m.mtbfH ? ' · MTBF ' + num(m.mtbfH) + ' س' : ''))),
      U.status('machine', m.status), pmLate(m) ? SA.chip('وقائية متأخرة ' + lateDays(m) + ' يوم', 'warning') : null, mw ? h('span', {}, doc(mw.id), ' ', U.status('mwo', mw.status)) : null); })) : h('p.fct-muted', {}, 'محطة يدوية — لا توجد ماكينة مسجلة لهذه المرحلة على الخط.');
    const rows = a.rows.slice().sort((x, y) => (y.wo.priority === 'high') - (x.wo.priority === 'high') || y.s.avail - x.s.avail);
    const woList = rows.length || a.waiting.length ? h('ul.fct-list', {}, rows.map((r) => woRow(r.wo, r.s, d)), a.waiting.map((w) => h('li', {}, h('div.fct-grow', {}, h('span', {}, doc(w.id), ' ', h('b', {}, ERP.itemName(w.itemId))), h('small', {}, 'مُطلق × ' + num(w.qty) + ' — مستني إذن الصرف عند أمين مخزن الخامات ', w.mirId ? doc(w.mirId) : null)), U.status('wo', w.status), w.priority === 'high' ? SA.chip('أولوية عالية', 'warning') : null)))
      : SA.empty({ icon: 'checkcircle', title: 'مفيش شغل مستني عند المرحلة دلوقتي', text: 'أول ما المرحلة اللي قبلها تسجّل سليم، القطع تظهر هنا.' });
    const logs = a.logs.slice().sort((x, y) => (x.at < y.at ? 1 : -1));
    const logList = logs.length ? h('ul.fct-list', {}, logs.map((l) => h('li', {}, h('div.fct-grow', {}, h('span', {}, doc(l.id), ' · ', SA.fmt.time ? SA.fmt.time(l.at) : SA.fmt.rel(l.at), l.woId ? [' · ', doc(l.woId)] : null), h('small', {}, FX.reasonLabel(l.reasonId) + (l.machineId ? ' · ' + l.machineId : '') + ' · وردية ' + (l.shift || '—') + (l.note ? ' · ' + l.note : ''))),
      l.qty ? h('span.fct-muted', {}, num(l.qty) + ' قطعة') : null, h('span.fct-kgv', {}, num(l.kg, 1) + ' كجم'), SA.chip(l.normal ? 'طبيعي' : 'غير طبيعي', l.normal ? 'neutral' : 'warning'))))
      : h('p.fct-muted', {}, 'مفيش هالك متسجل للمرحلة النهارده.');
    const days = Array.from({ length: 21 }, (_, i) => ERP.day(i - 20)); const byDay = {}; get('scrapLogs').forEach((l) => { if (l.date < days[0]) return; if (nodeKey(famOf(l.itemId, l.lineId), l.track, l.stageId) !== k) return; byDay[l.date] = (byDay[l.date] || 0) + (l.kg || 0); });
    const short = (ds) => { const p = ds.split('-'); return Number(p[2]) + '/' + Number(p[1]); };
    const chart = CH.columns({ labels: days.map((x) => short(x).split('/')[0]), series: [{ name: 'هالك (كجم)', values: days.map((x) => Math.round((byDay[x] || 0) * 10) / 10), color: a.tone === 'bad' ? '#b9141b' : ERP.palette[1] }], height: 150, fmt: (v) => num(v) });
    return h('div', { class: 'fct-dr' }, stats, warn,
      h('section', {}, h('h4.fct-h4', {}, 'الماكينات', h('small.fct-muted', {}, mcs.length ? num(mainCount(mcs)) + ' أساسية' + (mcs.length > mainCount(mcs) ? ' + ' + (mcs.length - mainCount(mcs)) + ' مساعدة' : '') : '')), mList),
      h('section', {}, h('h4.fct-h4', {}, 'أوامر التشغيل عند المرحلة', h('span.sap-count', {}, String(rows.length + a.waiting.length))), woList),
      h('section', {}, h('h4.fct-h4', {}, 'هوالك النهارده في المرحلة', h('small.fct-muted', {}, num(a.scrapKg, 1) + ' كجم · المسموح ' + pct(a.std) + ' من الوزن')), logList),
      h('section', {}, h('h4.fct-h4', {}, 'الهالك آخر 21 يوم (كجم)'), chart));
  }
  const fk = (el) => { el.classList.add('fct-kpis'); return el; };
  const stat = (label, value, tone) => h('div.fct-stat' + (tone ? '.is-' + tone : ''), {}, h('small', {}, label), h('b.num', {}, value));
  function woRow(w, s, d) {
    const reason = w.status === 'on_hold' ? 'الأمر متوقف' + (w.holdReason ? ' — ' + w.holdReason : '') : !w.issued ? 'الخامات لسه ما اتصرفتش' : '';
    const so = w.soId ? ERP.find('salesOrders', w.soId) : null;
    return h('li', {}, h('div.fct-grow', {}, h('span', {}, doc(w.id), ' ', h('b', {}, ERP.itemName(w.itemId))),
      h('small', {}, (s.track !== 'main' ? FX.TRACKS[s.track] + ' · ' : '') + 'متاح ' + num(s.avail) + ' من ' + num(s.input) + ' وصلت · اتشغل ' + num(s.processed) + (so ? ' · ' : ''), so ? doc(so.id) : null, so ? ' ' + ERP.customerName(so.customerId) : null)),
      U.status('stage', s.status), w.priority === 'high' ? SA.chip('أولوية عالية', 'warning') : null,
      SA.btn({ label: 'تسجيل', icon: 'activity', size: 'sm', perm: 'mfg.shopfloor.report', reason, onClick: () => report(w.id, s.key) }));
  }

  /* ═════════════ stage report (mod-mfg stage-aware dialog if present, else own) ═════════════ */
  function report(woId, key) {
    const mf = ERP.mfg && ERP.mfg.ui && ERP.mfg.ui.report;
    if (mf && (ERP.mfg.stageAware || /stageKey/.test(String(mf)))) return mf(woId, { stageKey: key });
    return reportDialog(woId, key);
  }
  function reportDialog(woId, key) {
    const wo = ERP.find('workOrders', woId); if (!wo) return; const s = FX.stageView(wo).find((x) => x.key === key); if (!s) return;
    const stg = FX.stage(s.stageId) || {}; const kgF = !!stg.kgFocus; const uk = FX.unitKg(wo.itemId, s.track); const nk = nodeKey(famOf(wo.itemId, wo.lineId), s.track, s.stageId); const mcs = machinesOf(nk).filter((m) => AUX.indexOf(m.type) < 0);
    let shift = shiftNow();
    const fGood = SA.form.field({ name: 'good', label: 'سليم يعدّي للمرحلة اللي بعدها (قطعة)', type: 'number', min: 0, value: '', class: 'fct-numin' });
    const fScrap = SA.form.field({ name: 'scrap', label: 'هالك (قطعة)', type: 'number', min: 0, value: 0, class: 'fct-numin' });
    const fKg = SA.form.field({ name: 'kg', label: 'وزن الهالك (كجم)', type: 'number', min: 0, value: '', placeholder: kgF ? 'مثال: 4.5' : 'تلقائي', hint: kgF ? 'في ' + stg.name + ' الهالك يتسجّل بالوزن (تنظيف/تسخين/خلطة خارج المواصفة).' : 'لو سبته فاضي: القطع × ' + num(uk, 2) + ' كجم.' });
    [fScrap, fKg].forEach((f) => { const i = f.el.querySelector('input'); if (i) i.step = 'any'; });
    const fReason = SA.form.field({ name: 'reason', label: 'سبب الهالك', type: 'select', options: [['', 'اختر السبب…']].concat(FX.reasonsFor(s.stageId).map((r) => [r.id, r.label + (r.normal ? ' — طبيعي' : '')])) });
    const fMc = SA.form.field({ name: 'mc', label: 'الماكينة', type: 'select', options: [['', mcs.length ? 'اختر الماكينة…' : 'محطة يدوية']].concat(mcs.map((m) => [m.id, m.id + ' — ' + m.name + (m.status !== 'running' ? ' (' + (MST[m.status] || m.status) + ')' : '')])), value: (mcs.find((m) => m.status === 'running') || {}).id || '' });
    const fNote = SA.form.field({ name: 'note', label: 'ملاحظة (اختياري)', type: 'text' });
    const quick = h('div.fct-quick', {}, h('button.btn.btn-ghost', { type: 'button', onclick: () => fGood.set(s.avail) }, 'المتاح كله (' + num(s.avail) + ')'), [5, 10].map((n) => h('button.btn.btn-ghost', { type: 'button', onclick: () => fGood.set(Math.min(s.avail, (Number(fGood.get()) || 0) + n)) }, '+' + n)));
    const md = SA.modal({ title: 'تسجيل ' + sName(s.stageId) + (s.track !== 'main' ? ' — ' + FX.TRACKS[s.track] : ''), subtitle: woId + ' · ' + ERP.itemName(wo.itemId), icon: 'activity', size: 'md',
      body: h('div', {}, h('div.fct-avail', {}, SA.chip('متاح عند المرحلة: ' + num(s.avail), 'info'), SA.chip('وصلها ' + num(s.input) + ' · اتشغل ' + num(s.processed), 'neutral'), SA.chip('المسموح هالك ' + pct(stg.stdPct), 'neutral')),
        fGood.el, quick, h('div.fct-fgrid', {}, kgF ? null : fScrap.el, fKg.el), fReason.el, h('div.fct-fgrid', {}, fMc.el, fNote.el),
        h('p.label', { style: { marginTop: '6px' } }, 'الوردية'), SA.segmented([['A', 'وردية A'], ['B', 'وردية B'], ['C', 'وردية C']], shift, (v) => { shift = v; }),
        h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الهالك بيتسجل تلقائيًا في مخزن الهوالك ' + FX.SCRAP_WH + ' بقيد آلي. ' + (s.stageId === 'ST-QP' ? 'السليم هنا = أبواب جاهزة للفحص النهائي.' : '')))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'حفظ التسجيل', icon: 'check', perm: 'mfg.shopfloor.report', onClick: async () => {
        const g = Number(fGood.get()) || 0, sc = kgF ? 0 : Number(fScrap.get()) || 0; const kgv = fKg.get(); const rs = fReason.get();
        if (g < 0 || sc < 0 || (kgv != null && kgv < 0)) return fGood.error('قيم غير صحيحة');
        if (g + sc > s.avail) return fGood.error('أكبر من المتاح عند المرحلة (' + num(s.avail) + ')');
        if (g + sc <= 0 && !(kgv > 0)) return fGood.error('أدخل كمية سليمة أو هالك');
        if ((sc > 0 || kgv > 0) && !rs) return fReason.error('اختر سبب الهالك');
        let r; try { r = await SA.api(() => FX.reportStage(woId, key, { good: g, scrap: sc, scrapKg: kgv == null ? null : kgv, reasonId: rs || null, machineId: fMc.get() || null, shift, note: fNote.get() || '' })); } catch (e) { return SA.fail(e); }
        if (!r || !r.ok) return SA.toast((r && r.reason) || 'تعذر التسجيل', 'error');
        md.close();
        SA.toast('اتسجل ' + num(g) + ' سليم' + (sc ? ' و' + num(sc) + ' هالك' : '') + (r.log ? ' (' + num(r.log.kg, 1) + ' كجم ← ' + FX.SCRAP_WH + ')' : '') + ' — ' + sName(s.stageId), 'success');
        if (r.completed) SA.toast('اكتمل ' + woId + ' — اتحول للفحص النهائي ' + (r.wo.qcId || ''), 'success');
      } })] });
    return md;
  }

  /* ═════════════ screen 2: mfg/formulas ═════════════ */
  const ING = { 'IT-RM-PVC': '#012864', 'IT-RM-WF': '#a85a00', 'IT-RM-CC': '#9aa3ad', 'IT-RM-REG': '#147a3d', 'IT-RM-STB': '#345383', 'IT-RM-LUB': '#c9a227', 'IT-RM-FOAM': '#7d9cd1', 'IT-RM-ACR': '#6a4c93', 'IT-RM-PIG': '#b9141b' };
  const ingColor = (id, i) => ING[id] || ERP.palette[i % ERP.palette.length];
  const shortName = (id) => { const n = ERP.itemName(id); return n.split(' (')[0].split(' — ')[0]; };
  const fCost = (f) => f.lines.reduce((s, l) => s + (l.pct / 100) * f.batchKg * (((ERP.item(l.itemId) || {}).stdCost) || 0), 0);
  const trackTxt = (f) => (f.track === 'main' ? (f.family === 'door' ? 'بروفايل تقوية' : f.family === 'all' ? 'كل الخطوط' : 'مسار واحد') : FX.TRACKS[f.track] || f.track);
  const FAMS = { door: 'أبواب', clad: 'تجاليد', foam: 'فوم', all: 'عامة' };
  const fStatus = (f) => SA.chip(f.status === 'active' ? 'معتمدة' : f.status === 'draft' ? 'مسودة' : f.status, f.status === 'active' ? 'success' : 'neutral');
  const productsOf = (id) => get('items').filter((i) => i.kind === 'fg' && FX.formulasFor(i.id).some((f) => f.formulaId === id)).map((i) => ({ item: i, track: FX.formulasFor(i.id).find((f) => f.formulaId === id).track }));
  const openWosOf = (id) => get('workOrders').filter((w) => ['planned', 'released', 'in_progress', 'on_hold'].indexOf(w.status) >= 0 && FX.formulasFor(w.itemId).some((f) => f.formulaId === id));
  const mirsOf = (id) => get('issueRequests').filter((m) => (m.formulas || []).some((f) => f.formulaId === id));
  const compBar = (f, lg) => h('div.fct-comp' + (lg ? '.is-lg' : ''), { role: 'img', 'aria-label': 'التركيب: ' + f.lines.map((l) => shortName(l.itemId) + ' ' + l.pct + '%').join('، ') }, f.lines.map((l, i) => h('i', { style: { width: l.pct + '%', background: ingColor(l.itemId, i) }, title: shortName(l.itemId) + ' ' + l.pct + '%' })));

  function formulasList(root) {
    let q = '', fam = '', trk = '';
    const head = SA.pageHead({ title: 'الخلطات الكيميائية', desc: 'الـ13 تركيبة اللي أمين مخزن الخامات بيصرف بيها للخلاطة: نسب المكونات، وزن الخلطة، أقصى نسبة مطحون، الكثافة والإصدار المعتمد.', tags: [U.demo('نسب تجريبية — تُستبدل بتركيبات المصنع الفعلية')],
      actions: [SA.can('mfg.flow.view') ? SA.btn({ label: 'مسار التصنيع', icon: 'flow', kind: 'ghost', onClick: () => SA.nav('mfg/flow') }) : null] });
    const kHost = h('div'); const gHost = h('div.fct-fgrid-cards');
    const search = h('input.input', { type: 'search', placeholder: 'بحث بالرمز أو الاسم أو الموديل…', 'aria-label': 'بحث في الخلطات', oninput: SA.debounce((e) => { q = e.target.value.trim().toLowerCase(); draw(); }, 120) });
    const famSel = h('select.select', { 'aria-label': 'العائلة', onchange: (e) => { fam = e.target.value; draw(); } }, h('option', { value: '' }, 'العائلة: الكل'), Object.keys(FAM).map((k) => h('option', { value: k }, FAM[k])));
    const trkSel = h('select.select', { 'aria-label': 'المسار', onchange: (e) => { trk = e.target.value; draw(); } }, h('option', { value: '' }, 'المسار: الكل'), [['leaf', 'ضلفة'], ['frame', 'حلق'], ['main', 'منتج / بروفايل كامل']].map((o) => h('option', { value: o[0] }, o[1])));
    const tb = h('div.fct-tb', {}, h('div.input-wrap.sap-search', {}, SA.icon('search'), search), famSel, trkSel);
    function draw() {
      const all = get('formulas'); const reg = K.qty(FX.REG, FX.SCRAP_WH);
      const usedNow = all.filter((f) => openWosOf(f.id).length).length; const lastUp = all.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
      SA.clear(kHost); kHost.append(fk(U.kpis([
        U.kpi({ label: 'خلطات معتمدة', value: num(all.filter((f) => f.status === 'active').length) + ' / ' + num(all.length), sub: Object.keys(FAM).map((k) => FAM[k].split(' ')[0] + ' ' + all.filter((f) => f.family === k).length).join(' · '), icon: 'beaker' }),
        U.kpi({ label: 'مستخدمة في أوامر مفتوحة', value: num(usedNow), sub: 'من الأوامر المخططة والجارية', icon: 'clipboard', href: canRoute('mfg/workorders') ? '#/mfg/workorders' : null }),
        U.kpi({ label: 'مطحون متاح للخلط', value: num(reg) + ' كجم', sub: 'مخزن ' + FX.SCRAP_WH + ' · مسموح ' + rangeTxt(all.map((f) => f.regMaxPct || 0)), icon: 'recycle', tone: 'success', href: canRoute('scm/stock/' + FX.REG) ? '#/scm/stock/' + FX.REG : null }),
        U.kpi({ label: 'آخر تعديل', value: lastUp ? lastUp.id + ' · v' + lastUp.version : '—', sub: lastUp ? SA.userName(lastUp.approvedBy) + ' · ' + SA.fmt.rel(lastUp.updatedAt) : '', icon: 'history' })])));
      const rows = all.filter((f) => (!fam || f.family === fam) && (!trk || f.track === trk) && (!q || (f.id + ' ' + f.name + ' ' + (f.uses || '') + ' ' + FAM[f.family]).toLowerCase().indexOf(q) >= 0));
      SA.clear(gHost);
      if (!rows.length) { gHost.append(SA.empty({ icon: 'search', title: 'مفيش خلطة مطابقة', text: 'غيّر البحث أو الفلاتر.' })); return; }
      rows.forEach((f) => { const wos = openWosOf(f.id); const mir = mirsOf(f.id)[0];
        gHost.append(h('a.card.fct-fcard', { href: '#/mfg/formulas/' + f.id },
          h('div.fct-fcard-top', {}, h('span.fct-code', {}, f.id), SA.chip(FAMS[f.family] || f.family, 'info'), SA.chip(trackTxt(f), 'neutral'), fStatus(f)),
          h('b', {}, f.name), compBar(f),
          h('div.fct-facts', {}, fact('الخلطة', num(f.batchKg) + ' كجم'), fact('مطحون', pct(f.regMaxPct || 0, 0)), fact('الكثافة', f.density || '—'), fact('الإصدار', 'v' + f.version)),
          h('div.fct-uses', {}, f.uses || '—'),
          h('div.fct-fcard-foot', {}, h('span', {}, wos.length ? 'مستخدمة الآن في ' + wos.length + ' أمر' : 'مفيش أوامر مفتوحة عليها'), h('span', {}, mir ? 'آخر صرف ' + mir.id.replace(/^MIR-\d{4}-/, 'MIR-') : 'حسب الطلب'))));
      });
    }
    root.append(head, kHost, SA.card({}, tb, gHost));
    draw(); const offs = ['formulas', 'workOrders', 'issueRequests', 'stock'].map((p) => st.subscribe(p, draw));
    return () => offs.forEach((f) => f());
  }
  const fact = (l, v) => h('div', {}, h('small', {}, l), h('b.num', {}, v));

  function formulaDetail(id) {
    const f = FX.formula(id); if (!f) return SA.card({}, SA.empty({ icon: 'search', title: 'الخلطة غير موجودة', text: id, action: { label: 'كل الخلطات', icon: 'arrowright', onClick: () => SA.nav('mfg/formulas') } }));
    const cost = fCost(f); const prods = productsOf(id); const wos = openWosOf(id); const mirs = mirsOf(id).slice().sort((a, b) => ((b.requestedAt || '') > (a.requestedAt || '') ? 1 : -1));
    const batchesPossible = f.lines.map((l) => ({ itemId: l.itemId, n: l.pct > 0 ? K.available(l.itemId) / ((l.pct / 100) * f.batchKg) : Infinity })).sort((a, b) => a.n - b.n)[0];
    const ing = h('div.fct-ing', {}, h('div.fct-ing-row.is-head', {}, h('span', {}, 'المكوّن'), h('span', {}, 'النسبة'), h('span.fct-n', {}, 'كجم/خلطة'), h('span.fct-n', {}, 'الرصيد المتاح'), h('span.fct-n', {}, 'تكلفة المكوّن')),
      f.lines.map((l, i) => { const it = ERP.item(l.itemId) || {}; const kg = (l.pct / 100) * f.batchKg; const isReg = l.itemId === FX.REG;
        return h('div.fct-ing-row', {}, h('span.fct-ing-n', {}, h('i.fct-sw', { style: { background: ingColor(l.itemId, i) } }), h('span', { title: it.name || l.itemId }, lk('scm/stock/' + l.itemId, h('b', {}, shortName(l.itemId)), 'a'), h('small', {}, (it.code || l.itemId) + (isReg ? ' · حد أقصى ' + pct(f.regMaxPct || 0, 0) : '')))),
          h('span.fct-ing-bar', {}, h('span', {}, h('i', { style: { width: Math.min(100, l.pct / Math.max(...f.lines.map((x) => x.pct)) * 100) + '%', background: ingColor(l.itemId, i) } })), h('b.num', {}, num(l.pct, 2) + '%')),
          h('span.fct-n', { 'data-l': 'كجم/خلطة' }, num(kg, 2)), h('span.fct-n', { 'data-l': 'الرصيد المتاح' }, num(K.available(l.itemId)), ' ', h('small', {}, 'كجم')), h('span.fct-n', { 'data-l': 'تكلفة المكوّن' }, U.cost(kg * (it.stdCost || 0)))); }),
      h('div.fct-ing-row.is-total', {}, h('span', {}, 'الإجمالي'), h('span', {}, h('b.num', {}, num(f.lines.reduce((s, l) => s + l.pct, 0), 2) + '%')), h('span.fct-n', { 'data-l': 'كجم/خلطة' }, num(f.batchKg)), h('span.fct-n', { 'data-l': 'خلطات ممكنة' }, batchesPossible && isFinite(batchesPossible.n) ? num(Math.floor(batchesPossible.n)) + ' خلطة' : '—'), h('span.fct-n', { 'data-l': 'تكلفة الخلطة' }, U.cost(cost))));
    const legend = CH.legend(f.lines.map((l, i) => ({ label: shortName(l.itemId), color: ingColor(l.itemId, i), value: num(l.pct, 1) + '%' })));
    const costs = h('div.fct-costs', {}, h('div.fct-stat', {}, h('small', {}, 'تكلفة الخلطة (' + num(f.batchKg) + ' كجم)'), h('b', {}, U.cost(cost))), h('div.fct-stat', {}, h('small', {}, 'تكلفة الكيلو'), h('b', {}, U.cost(cost / f.batchKg))),
      h('div.fct-stat', {}, h('small', {}, 'خلطات ممكنة من الرصيد'), h('b.num', {}, batchesPossible && isFinite(batchesPossible.n) ? num(Math.floor(batchesPossible.n)) : '—')), batchesPossible && isFinite(batchesPossible.n) ? h('div.fct-stat', {}, h('small', {}, 'الخامة المحدِّدة'), h('b', { style: { fontSize: '13px', fontFamily: 'var(--font-ar)' } }, shortName(batchesPossible.itemId))) : null);
    // products using it (grouped by model for doors)
    const groups = {}; prods.forEach((p) => { const k = p.item.family === 'door' ? (p.item.attrs.model || p.item.code) : p.item.code; (groups[k] = groups[k] || { k, items: [], track: p.track, fam: p.item.family }).items.push(p.item); });
    const prodCard = SA.card({ title: 'المنتجات اللي بتستخدمها', tags: [h('span.sap-count', {}, String(prods.length))] }, prods.length ? h('div', {}, h('p.fct-muted', { style: { margin: '0 0 10px' } }, prods.length + ' صنف تام' + (prods[0] && prods[0].track !== 'main' ? ' — الخلطة دي لـ«' + FX.TRACKS[prods[0].track] + '» بتاعتهم' : '') + '. الربط تلقائي من نوع التشطيب والمقاس.'),
      h('div.fct-models', {}, Object.values(groups).map((g) => { const it = g.items[0]; const kids = [IMG[g.fam] ? h('img', { src: IMG[g.fam], alt: '' }) : null, h('span', {}, h('b', {}, g.fam === 'door' ? 'موديل ' + g.k : it.name), h('small', {}, g.fam === 'door' ? g.items.length + ' مقاس/لون · ' + (FX.FINISH[FX.finishType(it.id)] || '') : it.code))];
        return canRoute('scm/stock/' + it.id) ? h('a.fct-model', { href: '#/scm/stock/' + it.id, title: g.items.map((x) => x.code).join('، ') }, kids) : h('div.fct-model', {}, kids); })))
      : SA.empty({ icon: 'info', title: 'مفيش صنف مربوط آليًا', text: 'بتُستخدم حسب الطلب: ' + (f.uses || '—') }));
    const mirCard = SA.card({ title: 'أذون الصرف وأوامر التشغيل', tags: [h('span.sap-count', {}, String(mirs.length))] },
      wos.length ? h('div', { style: { marginBottom: '12px' } }, h('h4.fct-h4', {}, 'أوامر مفتوحة على الخلطة'), h('ul.fct-list', {}, wos.map((w) => h('li', {}, h('div.fct-grow', {}, h('span', {}, doc(w.id), ' ', h('b', {}, ERP.itemName(w.itemId))), h('small', {}, num(w.qty) + ' · ' + w.lineId + (w.soId ? ' · ' + w.soId : ''))), U.status('wo', w.status))))) : null,
      mirs.length ? h('ul.fct-list', {}, mirs.slice(0, 8).map((m) => { const fm = m.formulas.find((x) => x.formulaId === id) || {};
        return h('li', {}, h('div.fct-grow', {}, h('span', {}, doc(m.id), ' ← ', doc(m.woId)), h('small', {}, ERP.itemName(m.itemId) + ' × ' + num(m.qtyUnits) + ' · ' + SA.fmt.rel(m.issuedAt || m.requestedAt))), h('span.fct-kgv', {}, num(fm.kg) + ' كجم'), h('span.fct-muted', {}, num(fm.batches) + ' خلطة'), U.status('mir', m.status)); }))
        : h('p.fct-muted', {}, 'لسه مفيش أذون صرف بالخلطة دي.'));
    const hist = (f.history || []).slice().reverse();
    const histCard = SA.card({ title: 'الاعتماد والإصدارات' }, SA.kv([['الإصدار الحالي', h('span', {}, SA.chip('v' + f.version, 'info'), ' ', fStatus(f))], ['اعتمدها', SA.userName(f.approvedBy)], ['آخر تعديل', SA.fmt.dt ? SA.fmt.dt(f.updatedAt) : SA.fmt.rel(f.updatedAt)]]),
      hist.length ? h('ul.fct-hist', { style: { marginTop: '14px' } }, hist.map((x) => h('li', {}, h('i'), h('div', {}, h('b', {}, 'v' + x.version + ' — '), x.changes.map((c) => shortName(c.itemId) + ' ' + c.from + '% ← ' + c.to + '%').join(' · '), x.reason ? h('div', {}, 'السبب: ' + x.reason) : null, h('small', {}, SA.userName(x.by) + ' · ' + SA.fmt.rel(x.at))))))
        : h('p.fct-muted', { style: { marginTop: '12px' } }, 'الإصدار v' + f.version + ' معتمد من ' + SA.userName(f.approvedBy) + ' (' + SA.fmt.rel(f.updatedAt) + '). أي تعديل نسب بيعمل إصدار جديد بسبب مكتوب ويتسجّل في التدقيق.'));
    return h('div', {},
      SA.pageHead({ title: f.id + ' · ' + f.name, desc: (FAM[f.family] || f.family) + ' · ' + trackTxt(f) + ' · ' + (f.uses || ''), back: { label: 'الخلطات الكيميائية', href: '#/mfg/formulas' }, tags: [SA.chip('v' + f.version, 'info'), fStatus(f), U.demo('نسب تجريبية — تُستبدل بتركيبات المصنع الفعلية')],
        actions: [SA.btn({ label: 'تعديل النسب', icon: 'edit', perm: 'mfg.formulas.edit', onClick: () => editFormula(id) })] }),
      h('div.fct-split', {}, SA.card({ title: 'التركيبة لكل خلطة (' + num(f.batchKg) + ' كجم)' }, compBar(f, true), legend, ing),
        SA.card({ title: 'بيانات الخلطة' }, SA.kv([['الرمز', h('span.num', {}, f.id)], ['العائلة', (FAM[f.family] || f.family) + ' · ' + trackTxt(f)], ['وزن الخلطة', num(f.batchKg) + ' كجم'], ['زمن الخلط', num(f.mixMin) + ' دقيقة'], ['إعداد الخلاط', f.mixer || '—'], ['أقصى مطحون', pct(f.regMaxPct || 0, 0) + ' (من مخزن ' + FX.SCRAP_WH + ')'], ['الكثافة', h('span.num', {}, f.density || '—')]]),
          h('h4.fct-h4', { style: { marginTop: '16px' } }, 'التكلفة', U.canCost() ? null : SA.chip('سرية — تحتاج صلاحية التكاليف', 'neutral')), costs)),
      U.grid(2, prodCard, mirCard), histCard);
  }

  /* edit (perm mfg.formulas.edit): % per line, total exactly 100, reason, new version */
  function editFormula(id) {
    const f = FX.formula(id); if (!f) return; if (!SA.can('mfg.formulas.edit')) return SA.toast('ليست من صلاحياتك (mfg.formulas.edit)', 'warn');
    const vals = f.lines.map((l) => l.pct); const inputs = []; const deltas = [];
    const total = h('div.fct-total', {}, h('span', {}, 'إجمالي النسب'), h('b.num', {}, '100%'));
    const sync = () => { const sum = Math.round(vals.reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100; const ok = Math.abs(sum - 100) < 0.005; total.classList.toggle('is-bad', !ok); total.lastChild.textContent = num(sum, 2) + '%' + (ok ? '' : ' (لازم 100% بالظبط — الفرق ' + num(Math.round((100 - sum) * 100) / 100, 2) + ')');
      vals.forEach((v, i) => { const d = Math.round(((Number(v) || 0) - f.lines[i].pct) * 100) / 100; deltas[i].textContent = d ? (d > 0 ? '+' : '') + num(d, 2) : '—'; deltas[i].className = 'fct-delta' + (d > 0 ? ' is-up' : d < 0 ? ' is-down' : ''); }); return ok; };
    const rows = f.lines.map((l, i) => { const inp = h('input.input', { type: 'number', step: '0.1', min: '0', max: '100', value: String(l.pct), dir: 'ltr', 'aria-label': 'نسبة ' + ERP.itemName(l.itemId), oninput: (e) => { vals[i] = e.target.value === '' ? 0 : Number(e.target.value); sync(); } }); inputs.push(inp); const dl = h('span.fct-delta', {}, '—'); deltas.push(dl);
      return h('div.fct-edit-row', {}, h('span.fct-ing-n', {}, h('i.fct-sw', { style: { background: ingColor(l.itemId, i) } }), h('span', {}, h('b', {}, shortName(l.itemId)), h('small', {}, 'الحالي ' + l.pct + '%' + (l.itemId === FX.REG ? ' · حد أقصى ' + pct(f.regMaxPct || 0, 0) : '')))), inp, dl); });
    const err = h('div');
    const md = SA.modal({ title: 'تعديل نسب ' + f.id, subtitle: f.name + ' — الإصدار الحالي v' + f.version, icon: 'beaker', size: 'md',
      body: h('div', {}, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'غيّر النسب المئوية للمكونات. الإجمالي لازم يكون 100% بالظبط. التعديل بيعمل إصدار v' + (f.version + 1) + ' وأمين مخزن الخامات بيصرف بيه من أول إذن جديد.')), rows, total, err),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close() }, 'إلغاء'), SA.btn({ label: 'متابعة', icon: 'check', perm: 'mfg.formulas.edit', onClick: async () => {
        SA.clear(err); if (vals.some((v) => !(Number(v) >= 0) || Number(v) > 100)) { err.append(SA.alert('danger', 'في نسبة غير صحيحة (لازم بين 0 و 100).')); return; }
        if (!sync()) { err.append(SA.alert('danger', 'إجمالي النسب لازم يكون 100% بالظبط.')); return; }
        const regI = f.lines.findIndex((l) => l.itemId === FX.REG); if (regI >= 0 && Number(vals[regI]) > (f.regMaxPct || 0) * 100 + 1e-9) { err.append(SA.alert('danger', 'نسبة المطحون ' + vals[regI] + '% أعلى من الحد الأقصى للخلطة (' + pct(f.regMaxPct || 0, 0) + ').')); return; }
        const changes = f.lines.map((l, i) => ({ itemId: l.itemId, from: l.pct, to: Math.round(Number(vals[i]) * 100) / 100 })).filter((c) => c.from !== c.to);
        if (!changes.length) { err.append(SA.alert('warning', 'مفيش أي تغيير في النسب.')); return; }
        const draft = Object.assign({}, f, { lines: f.lines.map((l, i) => ({ itemId: l.itemId, pct: Math.round(Number(vals[i]) * 100) / 100 })) });
        const c0 = fCost(f) / f.batchKg, c1 = fCost(draft) / f.batchKg; const pend = mirsOf(id).filter((m) => m.status === 'pending' || m.status === 'partial'); const wos = openWosOf(id);
        md.close();
        const r = await SA.confirm({ title: 'اعتماد إصدار جديد v' + (f.version + 1) + ' — ' + f.id, icon: 'beaker', reasonRequired: true, reasonLabel: 'سبب التعديل (مثال: نتيجة تجربة معمل / تغيير مورد)', confirmLabel: 'اعتماد v' + (f.version + 1),
          impact: changes.map((c) => shortName(c.itemId) + ': ' + c.from + '% ← ' + c.to + '% (' + num((c.from / 100) * f.batchKg, 2) + ' ← ' + num((c.to / 100) * f.batchKg, 2) + ' كجم/خلطة)').concat(
            [U.canCost() ? 'تكلفة الكيلو: ' + ERP.fmt.money(c0) + ' ← ' + ERP.fmt.money(c1) : 'أثر التكلفة مخفي (يحتاج صلاحية التكاليف)', wos.length ? 'أوامر مفتوحة على الخلطة: ' + wos.map((w) => w.id).join('، ') : 'لا توجد أوامر مفتوحة على الخلطة', pend.length ? 'إذن صرف معلق ' + pend.map((m) => m.id).join('، ') + ' — أمين المخزن يتبلّغ بالنسب الجديدة' : null, 'يتسجّل FORMULA.UPDATED (قبل/بعد) ويتبلّغ أمين مخزن الخامات والجودة'].filter(Boolean)) });
        if (!r.ok) return;
        try { await SA.api(() => updateFormulaCore(id, draft.lines.map((l) => l.pct), r.reason)); } catch (e) { return SA.fail(e); }
        SA.toast('اتعتمد ' + f.id + ' — إصدار v' + (f.version + 1), 'success');
      } })] });
    sync(); return md;
  }
  function updateFormulaCore(id, pcts, reason) {
    const f = FX.formula(id); if (!f) throw new Error('formula not found');
    const sum = Math.round(pcts.reduce((s, v) => s + v, 0) * 100) / 100; if (Math.abs(sum - 100) > 0.005) throw new Error('total must be 100');
    const changes = f.lines.map((l, i) => ({ itemId: l.itemId, from: l.pct, to: pcts[i] })).filter((c) => c.from !== c.to); const v = (f.version || 1) + 1; const at = ERP.now();
    const txt = (lines) => lines.map((l) => shortName(l.itemId) + ' ' + l.pct + '%').join(' · ');
    const before = { version: f.version, lines: txt(f.lines) };
    st.patch('formulas', id, (x) => { x.lines = x.lines.map((l, i) => Object.assign({}, l, { pct: pcts[i] })); x.version = v; x.updatedAt = at; x.approvedBy = me(); x.history = (x.history || []).concat([{ version: v, at, by: me(), reason: reason || '', changes }]); });
    const f2 = FX.formula(id);
    SA.audit('FORMULA.UPDATED', { target: { type: 'formula', id, label: f.name }, before, after: { version: v, lines: txt(f2.lines) }, reason: reason || '' });
    try { SA.notify({ title: 'تعديل خلطة ' + id + ' — إصدار v' + v, body: f.name + ': ' + changes.map((c) => shortName(c.itemId) + ' ' + c.from + '% ← ' + c.to + '%').join(' · ') + ' — الصرف للخلاطة بالنسب الجديدة.', level: 'info', to: ['R-23', 'R-06', 'R-09', 'R-05'], link: '#/mfg/formulas/' + id }); } catch (e) { /* noop */ }
    return f2;
  }
  function formulasRender(root, ctx) {
    const id = ctx.path && ctx.path[0];
    if (!id) { ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'الهندسة' }, { label: 'الخلطات الكيميائية' }]); return formulasList(root); }
    ctx.setCrumbs([{ label: 'التصنيع والجودة' }, { label: 'الخلطات الكيميائية', href: '#/mfg/formulas' }, { label: id }]);
    if (ctx.params && ctx.params.edit && SA.can('mfg.formulas.edit')) setTimeout(() => editFormula(id), 0);
    return SA.live(root, () => formulaDetail(id), ['formulas', 'issueRequests', 'workOrders', 'stock']);
  }

  /* ═════════════ register ═════════════ */
  SA.register({ id: 'mfg-flow', app: 'mfg', group: 'mfg-exec', title: 'مسار التصنيع', icon: 'flow', route: 'mfg/flow', perm: 'mfg.flow.view', order: 35, desc: 'خريطة المصنع اللحظية من الخامات للعميل', render: flowRender,
    badge() { try { return get('machines').filter((m) => m.stageId && m.status === 'down').length || null; } catch (e) { return null; } } });
  SA.register({ id: 'mfg-formulas', app: 'mfg', group: 'mfg-eng', title: 'الخلطات الكيميائية', icon: 'beaker', route: 'mfg/formulas', perm: 'mfg.formulas.view', order: 55, desc: 'الـ13 تركيبة ونسبها وتكلفتها', render: formulasRender });
  if (SA.search && SA.search.register) SA.search.register({ id: 'mfg-formulas', label: 'الخلطات الكيميائية', perm: 'mfg.formulas.view', query(q) { q = String(q || '').toLowerCase(); if (q.length < 2) return []; return get('formulas').filter((f) => (f.id + ' ' + f.name + ' ' + (f.uses || '')).toLowerCase().indexOf(q) >= 0).slice(0, 6).map((f) => ({ title: f.id + ' — ' + f.name, sub: (FAM[f.family] || '') + ' · v' + f.version, icon: 'beaker', route: 'mfg/formulas/' + f.id })); } });

  ERP.fct = { openStage, report, reportDialog, updateFormula: updateFormulaCore, model: buildModel };
})();
