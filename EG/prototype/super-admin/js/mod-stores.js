/* EG ERP prototype — mod-stores.js  (أمناء المخازن — app 'scm' · CSS prefix sto- · moduleKey inventory)
   Screens (routes from erp-factory.js):
     scm-desk        scm/desk[?desk=in|out]            مكتب أمين المخزن — يتشكّل حسب المستخدم:
                       أمين مخزن الخامات (whin · W-02/W-05/W-07) ← الوارد والصرف للخلاطة · أمين مخزن المنتج التام (whout · W-01/W-04) ← الاستلام من الجودة والتسليم
                       المالك / مدير المخازن ← الاتنين كتبويبين.
     scm-issues      scm/issues[/MIR-id][?status=&q=]  أذون صرف الخامات للإنتاج (إذن صرف للخلاطة حسب الخلطة) + مستند «إذن صرف» للطباعة
     scm-fgreceipts  scm/fg-receipts[/FGR-id][?q=FGR-id]  استلام الإنتاج التام بعد الفحص النهائي (عدّ + فرق بسبب) ← يوضح أثره على أمر البيع
   Business actions (foundation only): ERP.factory.issueMIR · ERP.factory.receiveFG · ERP.flow.receivePO (عبر ERP.scm.receiveModal) · ERP.flow.createDelivery · ERP.flow.dispatch.
   Own mutation: إذن تسليم مخطط ← «قيد التحميل» (نفس ما يعمله mod-logistics، تدقيق DN.LOADING).
   Money: storekeepers see quantities only — every value goes through ERP.ui.cost (data.cost.view). */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP;
  if (!SA || !ERP || !ERP.flow || !ERP.factory) return;
  const h = SA.h, st = SA.store, C = SA.catalog, K = ERP.stock, F = ERP.flow, U = ERP.ui, FX = ERP.factory, fmt = ERP.fmt;

  /* ═════════════ styles ═════════════ */
  (function css() {
    if (document.querySelector('style[data-mod="stores"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'stores');
    s.textContent = `
.sto-muted { color: var(--color-text-muted); font-size: 12.5px; } .sto-nolink { font-weight: 600; } .sto-grow { flex: 1; }
.sto-tabs { margin-bottom: 14px; overflow-x: auto; } .sto-tabs .tab { min-height: 48px; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.sto-hero { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; justify-content: space-between; padding: 18px 22px; border-radius: 16px; background: linear-gradient(135deg, var(--eg-navy) 0%, #24508f 100%); color: #fff; margin-bottom: 16px; }
.sto-hero h1 { margin: 2px 0 0; font-size: 1.45rem; color: #fff; line-height: 1.35; } .sto-hero p { margin: 4px 0 0; opacity: .88; font-size: 13px; line-height: 1.7; max-width: 620px; }
.sto-hero-k { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .02em; background: rgba(255,255,255,.16); padding: 2px 10px; border-radius: 999px; }
.sto-hero-r { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; } .sto-hero-d { font-size: 13px; opacity: .9; }
.sto-whs { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; } .sto-whchip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 11px; border-radius: 999px; background: rgba(255,255,255,.14); font-size: 12px; text-decoration: none; color: #fff; }
.sto-acts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 12px; margin-bottom: 16px; }
.sto-act { position: relative; display: flex; align-items: center; gap: 12px; min-height: 88px; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--color-border); background: #fff; text-align: start; cursor: pointer; text-decoration: none; color: inherit; font: inherit; box-shadow: 0 1px 2px rgba(1,40,100,.05); transition: border-color .15s, box-shadow .15s, transform .15s; }
.sto-act:hover { border-color: var(--eg-navy); box-shadow: 0 6px 18px rgba(1,40,100,.10); transform: translateY(-1px); } .sto-act:focus-visible { outline: 3px solid var(--color-primary-tint); outline-offset: 2px; }
.sto-act-ico { width: 50px; height: 50px; border-radius: 13px; display: grid; place-items: center; background: var(--color-primary-tint); color: var(--eg-navy); flex: none; } .sto-act-ico .icon { width: 26px; height: 26px; }
.sto-act-t { min-width: 0; } .sto-act-t b { display: block; font-size: 15.5px; line-height: 1.35; } .sto-act-t small { display: block; color: var(--color-text-muted); font-size: 12px; line-height: 1.5; margin-top: 2px; }
.sto-act-n { margin-inline-start: auto; min-width: 36px; height: 36px; border-radius: 999px; background: var(--eg-navy); color: #fff; font: 700 16px var(--font-en); display: grid; place-items: center; padding: 0 9px; flex: none; }
.sto-act-n.is-zero { background: var(--color-success-tint); color: var(--color-success); }
.sto-act.is-hot { border-color: #f0c98e; background: linear-gradient(135deg, #fff8ec, #fff); } .sto-act.is-hot .sto-act-ico { background: var(--color-warning-tint); color: var(--color-warning); }
.sto-act.is-locked { opacity: .6; cursor: not-allowed; }
.erp-kpis.sto-kpis { grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); margin-bottom: 16px; }
.sto-split { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(300px, 1fr); gap: 16px; align-items: start; } .sto-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; } .sto-col > * { min-width: 0; }
.sto-q { display: flex; flex-direction: column; gap: 12px; }
.sto-qi { border: 1px solid var(--color-border); border-radius: 14px; padding: 14px 16px; background: #fff; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.sto-qi.is-hot { border-inline-start: 4px solid var(--color-warning); } .sto-qi.is-danger { border-inline-start: 4px solid var(--color-danger); } .sto-qi.is-ok { border-inline-start: 4px solid var(--color-success); }
.sto-qi-h { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; } .sto-qi-h .erp-doc { font-weight: 700; font-size: 14px; }
.sto-qi-t { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; } .sto-qi-t > :first-child { min-width: 0; flex: 1 1 220px; }
.sto-big-w { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; } .sto-big-w small { color: var(--color-text-muted); font-size: 12px; }
.sto-big { font: 700 28px/1 var(--font-en); color: var(--eg-navy); }
.sto-meta { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12.5px; color: var(--color-text-muted); align-items: center; } .sto-meta b { color: var(--color-text); font-weight: 600; } .sto-meta .icon { display: inline-block; vertical-align: middle; }
.sto-qi-a { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .sto-qi-a .btn-lg { min-width: 150px; justify-content: center; }
.sto-fchips { display: flex; flex-wrap: wrap; gap: 6px; } .sto-fchip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 9px; background: var(--color-bg-alt); border: 1px solid var(--color-border); font-size: 12.5px; }
.sto-fchip.is-reg { background: var(--color-success-tint); border-color: #b9e3c8; color: var(--color-success); } .sto-fchip .icon { color: var(--eg-navy); } .sto-fchip.is-reg .icon { color: var(--color-success); }
.sto-warn, .sto-ok { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; padding: 8px 10px; border-radius: 10px; line-height: 1.6; }
.sto-warn { background: var(--color-danger-tint); color: var(--color-danger); } .sto-ok { background: var(--color-success-tint); color: var(--color-success); } .sto-warn .icon, .sto-ok .icon { flex: none; margin-top: 3px; }
.sto-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 7px; background: var(--color-bg-alt); color: var(--color-text); white-space: nowrap; }
.sto-tag.is-navy { background: var(--eg-navy); color: #fff; } .sto-tag.is-success { background: var(--color-success-tint); color: var(--color-success); } .sto-tag.is-warning { background: var(--color-warning-tint); color: var(--color-warning); }
.sto-tag.is-danger { background: var(--color-danger-tint); color: var(--color-danger); } .sto-tag.is-info { background: var(--color-primary-tint); color: var(--eg-navy); }
.sto-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sto-li { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid var(--color-border); min-width: 0; } .sto-li:last-child { border-bottom: 0; } .sto-li:first-child { padding-top: 0; }
.sto-li-ico { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: none; background: var(--color-primary-tint); color: var(--eg-navy); }
.sto-li-ico.is-danger { background: var(--color-danger-tint); color: var(--color-danger); } .sto-li-ico.is-warning { background: var(--color-warning-tint); color: var(--color-warning); } .sto-li-ico.is-success { background: var(--color-success-tint); color: var(--color-success); }
.sto-li-b { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; } .sto-li-b > b { font-size: var(--text-dense); } .sto-li-b small { color: var(--color-text-muted); font-size: 12px; line-height: 1.55; }
.sto-li-h { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sto-li-t { font-weight: 700; font-size: var(--text-dense); color: var(--eg-navy); text-decoration: none; line-height: 1.5; overflow-wrap: anywhere; } a.sto-li-t:hover { text-decoration: underline; } .sto-li-a { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; flex: none; }
.sto-bal { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.sto-bal > a, .sto-bal > div { display: flex; flex-direction: column; gap: 2px; border-radius: 12px; padding: 10px 12px; background: var(--color-bg-alt); text-decoration: none; color: inherit; border: 1px solid transparent; min-width: 0; }
.sto-bal > a:hover { border-color: var(--color-border-strong); } .sto-bal b { font: 700 20px var(--font-en); color: var(--eg-navy); } .sto-bal small { color: var(--color-text-muted); font-size: 11.5px; line-height: 1.45; } .sto-bal span { font-size: 12.5px; font-weight: 600; }
.sto-bal .is-reg { background: var(--color-success-tint); border-color: #b9e3c8; } .sto-bal .is-reg b { color: var(--color-success); }
.sto-mini { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; } .sto-mini li { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; } .sto-mini li > span:first-child { color: var(--color-text-muted); }
.sto-note { margin: 10px 0 0; font-size: 12px; color: var(--color-text-muted); line-height: 1.7; }
.sto-moves { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sto-moves li { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--color-border); font-size: 12.5px; min-width: 0; } .sto-moves li:last-child { border-bottom: 0; }
.sto-moves li > div { flex: 1; min-width: 0; } .sto-moves b { display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .sto-moves small { color: var(--color-text-muted); font-size: 11.5px; }
.sto-mv-q { min-width: 64px; font: 700 13px var(--font-en); text-align: center; padding: 3px 6px; border-radius: 8px; } .sto-mv-q.is-in { background: var(--color-success-tint); color: var(--color-success); } .sto-mv-q.is-out { background: var(--color-primary-tint); color: var(--eg-navy); }
.sto-dnl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; } .sto-dnl li { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; }
.sto-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr)); gap: 10px 14px; background: var(--color-bg-alt); border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; font-size: 13px; }
.sto-info > div { min-width: 0; } .sto-info span.sto-k { color: var(--color-text-muted); display: block; font-size: 11.5px; margin-bottom: 2px; } .sto-info b { font-weight: 700; }
.sto-stage { border: 1px solid var(--color-border); border-radius: 14px; overflow: hidden; margin-bottom: 12px; background: #fff; } .sto-stage:last-child { margin-bottom: 0; }
.sto-stage-h { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--color-bg-alt); border-bottom: 1px solid var(--color-border); flex-wrap: wrap; } .sto-stage-h b { display: block; font-size: 14px; } .sto-stage-h small { color: var(--color-text-muted); font-size: 12px; }
.sto-stage-n { width: 30px; height: 30px; border-radius: 9px; background: var(--eg-navy); color: #fff; display: grid; place-items: center; font: 700 13px var(--font-en); flex: none; }
.sto-stage .table-wrap { border: 0; border-radius: 0; } .table.sto-tbl { min-width: 600px; } .sto-tbl td, .sto-tbl th { vertical-align: middle; }
@media (min-width: 601px) { .table.sto-stbl { table-layout: fixed; } .sto-stbl th:first-child { width: 36%; } .sto-stbl th:last-child { width: 110px; } }
tr.sto-row-short > td { background: var(--color-danger-tint) !important; } tr.sto-row-reg > td { background: var(--color-success-tint) !important; }
.sto-regnote { display: flex; align-items: center; gap: 4px; color: var(--color-success); font-weight: 700; font-size: 11.5px; margin-top: 4px; }
.sto-cell { display: flex; flex-direction: column; line-height: 1.35; } .sto-cell small { color: var(--color-text-muted); font-size: 11.5px; }
.sto-fm { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px; }
.sto-fm-c { border: 1px solid var(--color-border); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.sto-fm-h { display: flex; gap: 10px; align-items: flex-start; } .sto-fm-h > div { flex: 1; min-width: 0; } .sto-fm-h b { display: block; font-size: 13.5px; } .sto-fm-h small { color: var(--color-text-muted); font-size: 12px; line-height: 1.5; }
.sto-fm-ico { width: 38px; height: 38px; border-radius: 10px; background: var(--color-primary-tint); color: var(--eg-navy); display: grid; place-items: center; flex: none; } .sto-fm-kg { font: 700 17px var(--font-en); color: var(--eg-navy); white-space: nowrap; }
.sto-mix { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--color-bg-alt); } .sto-mix i { display: block; height: 100%; }
.sto-mixl { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); gap: 4px 12px; font-size: 12px; }
.sto-mixl li { display: flex; align-items: center; gap: 6px; min-width: 0; } .sto-mixl li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .sto-mixl li i { width: 10px; height: 10px; border-radius: 3px; flex: none; } .sto-mixl li b { font: 600 12px var(--font-en); white-space: nowrap; }
.sto-mixl li.is-reg { color: var(--color-success); font-weight: 700; }
.sto-reg { display: flex; gap: 14px; align-items: center; padding: 14px 16px; border-radius: 14px; border: 1px solid #b9e3c8; background: linear-gradient(135deg, #eefaf2, #fff); margin-bottom: 16px; flex-wrap: wrap; }
.sto-reg-ico { width: 48px; height: 48px; border-radius: 50%; background: var(--color-success); color: #fff; display: grid; place-items: center; flex: none; } .sto-reg-ico .icon { width: 26px; height: 26px; }
.sto-reg > div { flex: 1 1 260px; min-width: 0; } .sto-reg b { display: block; color: var(--color-success); font-size: 15px; } .sto-reg p { margin: 3px 0 0; font-size: 12.5px; line-height: 1.7; }
.sto-reg-v { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; } .sto-reg-v strong { font: 700 24px var(--font-en); color: var(--color-success); } .sto-reg-v small { font-size: 12px; color: var(--color-text-muted); }
.sto-tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sto-tl li { display: flex; gap: 12px; position: relative; padding-bottom: 14px; } .sto-tl li:last-child { padding-bottom: 0; }
.sto-tl li::before { content: ""; position: absolute; inset-inline-start: 7px; top: 18px; bottom: 0; width: 2px; background: var(--color-border); } .sto-tl li:last-child::before { display: none; }
.sto-tl i { width: 16px; height: 16px; border-radius: 50%; background: var(--eg-navy); border: 3px solid var(--color-primary-tint); flex: none; margin-top: 3px; box-sizing: border-box; } .sto-tl li.is-ok i { background: var(--color-success); border-color: var(--color-success-tint); }
.sto-tl b { display: block; font-size: 13px; } .sto-tl small { display: block; color: var(--color-text-muted); font-size: 12px; }
.sto-stack { display: flex; flex-direction: column; gap: 14px; }
.sto-recv-h { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 12px 14px; border-radius: 12px; background: var(--color-bg-alt); }
.sto-count { display: flex; align-items: center; gap: 10px; } .sto-count .btn { width: 56px; height: 56px; min-height: 56px; border-radius: 14px; font: 700 26px var(--font-en); padding: 0; justify-content: center; }
.sto-count input { width: 140px; height: 56px; text-align: center; font: 700 26px var(--font-en); }
.sto-done { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 6px 0 2px; } .sto-done-ico { width: 68px; height: 68px; border-radius: 50%; background: var(--color-success-tint); color: var(--color-success); display: grid; place-items: center; } .sto-done-ico .icon { width: 34px; height: 34px; }
.sto-done h3 { margin: 0; font-size: 17px; } .sto-done p { margin: 0; color: var(--color-text-muted); font-size: 13px; line-height: 1.7; }
.sto-dhead { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 12px 14px; border-radius: 12px; background: var(--color-bg-alt); margin-bottom: 14px; }
.sto-dsec { margin-top: 16px; } .sto-dsec > h3 { margin: 0 0 8px; font-size: 13.5px; color: var(--eg-navy); }
.sto-ptbl td .input { width: 110px; min-height: 40px; }
.sto-qbtns { display: flex; gap: 8px; flex-wrap: wrap; }
.sto-a4 { background: #fff; color: #161b26; max-width: 794px; margin: 0 auto; padding: 28px 32px; border: 1px solid var(--color-border); box-shadow: var(--shadow-float); font-size: 12.5px; line-height: 1.6; }
.sto-a4-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid var(--eg-navy); padding-bottom: 12px; margin-bottom: 14px; }
.sto-a4-head img { height: 38px; width: auto; display: block; margin-bottom: 6px; } .sto-a4-co b { font-size: 14px; color: var(--eg-navy); display: block; } .sto-a4-co small { display: block; color: #555; font-size: 11px; }
.sto-a4-title { text-align: end; display: flex; flex-direction: column; gap: 2px; } .sto-a4-title h2 { margin: 0; color: var(--eg-navy); font-size: 19px; } .sto-a4-title b { font: 700 15px var(--font-en); }
.sto-a4-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .sto-a4-box { border: 1px solid #cfd6e4; border-radius: 8px; padding: 7px 11px; } .sto-a4-box small { color: #667; display: block; } .sto-a4-box b { display: block; }
.sto-a4 table { width: 100%; border-collapse: collapse; margin-top: 12px; } .sto-a4 th, .sto-a4 td { border: 1px solid #cfd6e4; padding: 5px 8px; text-align: start; } .sto-a4 th { background: #eef2f9; font-weight: 700; }
.sto-a4 tr.sto-a4-g td { background: #f5f7fb; font-weight: 700; color: var(--eg-navy); } .sto-a4 tr.sto-a4-reg td { background: #eefaf2; }
.sto-a4-note { margin: 10px 0 0; font-size: 11.5px; } .sto-a4-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 40px; text-align: center; font-size: 11.5px; } .sto-a4-sign div { border-top: 1px solid #888; padding-top: 6px; }
.sto-a4-foot { margin: 18px 0 0; font-size: 10.5px; color: #888; text-align: center; }
.sto-print-root { display: none; }
@media print { body.sto-printing > *:not(.sto-print-root) { display: none !important; } body.sto-printing .sto-print-root { display: block !important; } .sto-print-root .sto-a4 { border: 0; box-shadow: none; max-width: none; padding: 0; } @page { size: A4; margin: 14mm; } }
@media (max-width: 1100px) { .sto-split { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) {
  .sto-hero { padding: 14px 16px; } .sto-hero h1 { font-size: 1.2rem; } .sto-hero-r { align-items: flex-start; } .sto-whs { justify-content: flex-start; }
  .sto-acts { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .sto-act { flex-direction: column; align-items: flex-start; min-height: 116px; padding: 12px; gap: 8px; } .sto-act-n { position: absolute; top: 10px; inset-inline-end: 10px; min-width: 30px; height: 30px; font-size: 14px; } .sto-act-ico { width: 42px; height: 42px; } .sto-act-t b { font-size: 14px; }
  .erp-kpis.sto-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .sto-kpis .erp-kpi { padding: 12px; } .sto-kpis .erp-kpi-v { font-size: 1.2rem; }
  .sto-kpis .erp-kpi-bot small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sto-qi { padding: 12px; } .sto-qi-a > .btn, .sto-qi-a > a.btn { flex: 1 1 100%; min-width: 0; } .sto-big { font-size: 24px; }
  .sto-li { flex-wrap: wrap; } .sto-li-a { width: 100%; padding-inline-start: 46px; } .sto-li-a > .btn, .sto-li-a > a.btn { flex: 1 1 auto; justify-content: center; }
  .sto-a4 { padding: 16px; } .sto-a4-grid { grid-template-columns: 1fr; } .sto-reg-v { align-items: flex-start; }
  .sto-count input { width: 110px; }
  .sto-page .sap-pagehead .sap-actions { width: 100%; display: flex; flex-wrap: wrap; gap: 8px; } .sto-page .sap-pagehead .sap-actions > * { flex: 1 1 140px; justify-content: center; white-space: nowrap; }
  .sto-stage .table-wrap, .sto-ptbl-w { overflow: visible; } .table.sto-tbl { min-width: 0; } .table.sto-tbl thead { display: none; }
  .table.sto-tbl, .table.sto-tbl tbody, .table.sto-tbl tr, .table.sto-tbl td { display: block; width: 100%; }
  .table.sto-tbl tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; padding: 10px 12px; border-bottom: 1px solid var(--color-border); }
  .table.sto-tbl td { padding: 0; border: 0; min-width: 0; } .table.sto-tbl td:first-child { grid-column: 1 / -1; }
  .table.sto-tbl td[data-label]::before { content: attr(data-label); display: block; font: 600 11px var(--font-ar); color: var(--color-text-muted); margin-bottom: 2px; }
  .sto-ptbl td .input { width: 100%; }
}`;
    document.head.appendChild(s);
  })();

  /* ═════════════ helpers ═════════════ */
  const get = (p) => st.get(p) || [];
  const today = () => ERP.day(0);
  const p2 = (n) => String(n).padStart(2, '0');
  const localDay = (iso) => { if (!iso) return ''; const d = new Date(iso); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const item = (id) => ERP.item(id);
  const uomOf = (id) => (item(id) || {}).uom;
  const uomL = (id) => ERP.uom[uomOf(id)] || uomOf(id) || '';
  const num = (n, d) => fmt.num(n == null ? null : r2(n), d == null ? 2 : d);
  const qtyI = (n, id) => fmt.qty(n == null ? null : r2(n), uomOf(id));
  const whName = (id) => ERP.whName(id);
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
  const uniq = (a) => Array.from(new Set(a));
  const canCost = () => U.canCost();
  const userName = (id) => (id ? SA.userName(id) : '—');
  const FG = K.FG, W7 = FX.SCRAP_WH;
  const IN_WH = ['W-02', 'W-05', 'W-07'], OUT_WH = ['W-01', 'W-04'];
  const noPerm = (p) => { SA.toast('ليست من صلاحياتك (' + p + ')', 'warn'); return null; };
  const daysTxt = (n) => (n === 1 ? 'يوم' : n === 2 ? 'يومين' : n <= 10 ? n + ' أيام' : n + ' يوم');
  const dDiff = (d) => ERP.daysBetween(today(), String(d).slice(0, 10));
  const dayLabel = (d) => { if (!d) return '—'; const n = dDiff(d); return n === 0 ? 'اليوم' : n === 1 ? 'غدًا' : n === -1 ? 'أمس' : n < 0 ? 'متأخر ' + daysTxt(-n) : n < 8 ? 'بعد ' + daysTxt(n) : fmt.date(d); };
  const dayTone = (d) => { const n = dDiff(d); return n < 0 ? 'danger' : n <= 1 ? 'warning' : 'info'; };
  const tag = (text, tone, icon) => h('span.sto-tag' + (tone ? '.is-' + tone : ''), {}, icon ? SA.icon(icon, 'icon-sm') : null, text);
  const exportTag = () => tag('تصدير', 'navy', 'ship');
  /** perm-aware cross-module link: a real link only when the target screen exists and the persona may open it */
  const canRoute = (route) => { try { const p = SA.router.parse('#/' + route); return !!(p.module && SA.canOpen(p.module) && SA.appEnabled(p.module.app)); } catch (e) { return false; } };
  function L(id, label) {
    if (!id) return h('span.sto-muted', {}, '—'); const r = ERP.route(id);
    if (r && canRoute(r)) return U.docLink(id, label);
    return h('span.num.sto-nolink', { title: r ? 'لا تملك صلاحية فتح هذا المستند' : '' }, label || id);
  }
  /** item name (Arabic text, wraps) linking to its stock card when allowed */
  const itemLink = (i) => (canRoute('scm/stock/' + i.id) ? h('a.sto-li-t', { href: '#/scm/stock/' + encodeURIComponent(i.id) }, i.name) : h('b.sto-li-t', {}, i.name));
  const go = (label, route, icon, kind, size) => (canRoute(route) ? h('a.btn.btn-' + (kind || 'ghost') + (size === 'lg' ? '.btn-lg' : '.btn-sm'), { href: '#/' + route }, icon ? SA.icon(icon, 'icon-sm') : null, label) : null);
  const showErr = (el, msg) => { el.textContent = msg; el.hidden = false; };
  const memo = {};
  const keep = (key) => { memo[key] = memo[key] || { filters: {} }; return { initial: memo[key], onChange: (s) => { memo[key] = s; } }; };
  const MOVE_L = { receipt: 'استلام', issue: 'صرف للإنتاج', production: 'إنتاج تام', delivery: 'تسليم لعميل', transfer: 'تحويل', adjust: 'تسوية', scrap: 'هالك / حجر', return: 'مرتجع', opening: 'رصيد أول' };

  /* MIR (إذن صرف) */
  const MIR_OPEN = ['pending', 'partial'];
  const soOf = (id) => (id ? ERP.find('salesOrders', id) : null);
  const woOf = (id) => (id ? ERP.find('workOrders', id) : null);
  const isExport = (m) => { const so = soOf(m.soId); return !!(so && so.export); };
  const prio = (m) => (isExport(m) ? 0 : m.priority === 'high' ? 1 : 2);
  const openMirs = () => get('issueRequests').filter((m) => MIR_OPEN.indexOf(m.status) >= 0).sort((a, b) => prio(a) - prio(b) || String(a.requestedAt || '').localeCompare(String(b.requestedAt || '')));
  const remOf = (l) => r2(Math.max(0, l.qty - (l.issuedQty || 0)));
  const availOf = (l) => K.available(l.itemId, l.whId);
  const shortOf = (l) => r2(Math.max(0, remOf(l) - availOf(l)));
  const mirShort = (m) => m.lines.filter((l) => remOf(l) > 0 && shortOf(l) > 0);
  const plannedValue = (m) => sum(m.lines, (l) => l.qty * ((item(l.itemId) || {}).stdCost || 0));
  const regSaving = (m) => Math.max(0, (m.regKg || 0) * (((item('IT-RM-PVC') || {}).stdCost || 0) - ((item(FX.REG) || {}).stdCost || 0)));
  const prioTags = (m) => [isExport(m) ? exportTag() : null, m.priority === 'high' ? tag('أولوية عالية', 'warning', 'bolt') : null];
  const DEST_ORDER = ['ST-MIX', 'ST-WOOD', 'ST-EDGE', 'ST-CLEAN', 'ST-LAM', 'ST-QP'];
  const destRank = (s) => { const i = DEST_ORDER.indexOf(s); return i >= 0 ? i : 50 + ((FX.stage(s) || {}).order || 0); };
  const DEST_HINT = { 'ST-MIX': 'خامات الخلطة — تتوزن حسب التركيبة وتطلع على الخلاطة', 'ST-WOOD': 'خشب التقوية لأماكن المفصلات والكالون', 'ST-EDGE': 'شريط حرف الضلفة', 'ST-CLEAN': 'المادة — تحضير السطح قبل اللمينيشن', 'ST-LAM': 'فويل الديكور واللاصق للضلفة والحلق', 'ST-QP': 'الإكسسوارات ومواد التغليف' };
  function groupLines(m) {
    const g = {}; m.lines.forEach((l) => { const d = l.dest || FX.destOf(l.itemId); (g[d] = g[d] || []).push(l); });
    return Object.keys(g).sort((a, b) => destRank(a) - destRank(b)).map((d) => ({ stageId: d, name: FX.stageName(d), lines: g[d] }));
  }
  const MIXC = { 'IT-RM-PVC': '#012864', 'IT-RM-WF': '#a0703c', 'IT-RM-CC': '#9aa3b2', 'IT-RM-REG': '#147a3d', 'IT-RM-STB': '#7d9cd1', 'IT-RM-LUB': '#c9a227', 'IT-RM-FOAM': '#345383', 'IT-RM-ACR': '#5a4a8a', 'IT-RM-PIG': '#8a5a35' };

  /* FGR (إذن استلام إنتاج تام) */
  const openFgrs = () => get('fgReceipts').filter((r) => r.status === 'pending').sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const qcOf = (id) => (id ? ERP.find('qcInspections', id) : null);

  /** which desk(s) this user works: raw-materials (in) / finished goods (out) / both (owner, warehouse manager) */
  function desks() {
    const u = SA.session.user || {}; const w = u.warehouseIds || [];
    let inb = u.persona === 'whin' || u.roleId === 'R-23' || w.indexOf('W-02') >= 0 || w.indexOf('W-07') >= 0;
    let out = u.persona === 'whout' || u.roleId === 'R-24' || w.indexOf('W-01') >= 0;
    if (!inb && !out) { inb = true; out = true; }
    if (inb && !SA.canAny(['scm.issues.view', 'scm.grn.view'])) inb = false;
    if (out && !SA.canAny(['scm.fgreceipts.view', 'scm.deliveries.view'])) out = false;
    return { inb, out };
  }

  function printNode(node) {
    const old = document.querySelector('.sto-print-root'); if (old) old.remove();
    const root = h('div.sto-print-root', {}, node.cloneNode(true)); document.body.appendChild(root); document.body.classList.add('sto-printing');
    let done = false; const fin = () => { if (done) return; done = true; document.body.classList.remove('sto-printing'); root.remove(); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    try { window.print(); } catch (e) { /* noop */ } setTimeout(fin, 900);
  }

  /* ═════════════ actions ═════════════ */
  /** issue everything remaining on a MIR (what is short is issued as available → partial) */
  async function issueAll(id) {
    if (!SA.can('scm.issues.issue')) return noPerm('scm.issues.issue');
    const m = ERP.find('issueRequests', id); if (!m || MIR_OPEN.indexOf(m.status) < 0) return SA.toast('الإذن ده مش بانتظار الصرف', 'info');
    const rem = m.lines.filter((l) => remOf(l) > 0); const short = mirShort(m); const whs = uniq(rem.map((l) => l.whId));
    const regL = rem.find((l) => l.itemId === FX.REG);
    const val = sum(rem, (l) => Math.min(remOf(l), availOf(l)) * ((item(l.itemId) || {}).stdCost || 0));
    const r = await SA.confirm({ title: 'صرف إذن ' + id, icon: 'clipboard', text: m.woId + ' — ' + ERP.itemName(m.itemId) + ' × ' + fmt.num(m.qtyUnits) + ' ' + uomL(m.itemId),
      impact: [h('span', {}, 'خروج ' + rem.length + ' صنف من ' + whs.map(whName).join(' و') + ' إلى ' + groupLines({ lines: rem }).map((g) => g.name).join(' · ')),
        regL ? h('span', {}, 'منها ' + num(remOf(regL), 0) + ' كجم مطحون من هوالك المصنع بدل PVC جديد') : null,
        h('span', {}, 'قيد آلي: مدين إنتاج تحت التشغيل 1142 / دائن مخزون الخامات 1141 — ', U.cost(val)),
        h('span', {}, 'أمر التشغيل ' + m.woId + ' يتعلّم «اتصرفت الخامات» ويوصل إشعار لمدير الإنتاج ومشرف الخلاطة')].filter(Boolean),
      warnings: short.length ? ['نقص في ' + short.length + ' صنف (' + short.map((l) => ERP.itemName(l.itemId)).join('، ') + ') — هيتصرف المتاح بس والإذن يفضل «صرف جزئي».'] : [],
      confirmLabel: short.length ? 'اصرف المتاح' : 'تأكيد الصرف' });
    if (!r.ok) return null;
    let res = null;
    try { await SA.api(() => { res = FX.issueMIR(id); }); } catch (e) { return SA.fail(e); }
    if (!res || !res.ok) return SA.toast((res && res.reason) || 'تعذّر الصرف', 'error');
    SA.toast(res.status === 'issued' ? 'تم صرف ' + id + ' بالكامل — ' + m.woId + ' جاهز للتشغيل على الخلاطة' : 'صرف جزئي ' + id + ' — فيه نقص في ' + (res.short || []).length + ' صنف', res.status === 'issued' ? 'success' : 'warn', { ms: 6000 });
    return res;
  }

  /** partial issue: storekeeper sets each line (default = what is available) */
  function partialModal(id) {
    if (!SA.can('scm.issues.issue')) return noPerm('scm.issues.issue');
    const m = ERP.find('issueRequests', id); if (!m || MIR_OPEN.indexOf(m.status) < 0) return SA.toast('الإذن ده مش بانتظار الصرف', 'info');
    const rows = groupLines({ lines: m.lines.filter((l) => remOf(l) > 0) }).reduce((a, g) => a.concat(g.lines.map((l) => ({ l, g, rem: remOf(l), av: availOf(l) }))), []);
    const inputs = rows.map((x) => h('input.input.num', { type: 'number', min: 0, step: 'any', dir: 'ltr', max: r2(Math.min(x.rem, x.av)), value: r2(Math.min(x.rem, x.av)), 'aria-label': 'كمية الصرف — ' + ERP.itemName(x.l.itemId) }));
    const err = h('div.sap-field-error', { role: 'alert', hidden: true }); const hint = h('div');
    const fill = (fn) => { rows.forEach((x, i) => { inputs[i].value = r2(fn(x)); }); upd(); };
    function upd() { SA.clear(hint); const mixOk = rows.some((x, i) => x.l.dest === 'ST-MIX' && (Number(inputs[i].value) || 0) > 0); if (!mixOk) hint.appendChild(SA.alert('warning', 'مفيش ولا خامة من خامات الخلاطة في الصرف ده — الخلاطة مش هتقدر تبدأ إلا لما يتصرف جزء من خاماتها.')); }
    inputs.forEach((x) => x.addEventListener('input', upd));
    const tbl = h('div.table-wrap.sto-ptbl-w', {}, h('table.table.sto-tbl.sto-ptbl', {}, h('thead', {}, h('tr', {}, ['الصنف', 'المحطة', 'الباقي', 'المتاح', 'يتصرف الآن'].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((x, i) => h('tr' + (x.l.itemId === FX.REG ? '.sto-row-reg' : x.av < x.rem ? '.sto-row-short' : ''), {}, h('td', {}, U.itemCell(x.l.itemId)), h('td', { 'data-label': 'المحطة' }, x.g.name), h('td.num', { 'data-label': 'الباقي' }, qtyI(x.rem, x.l.itemId)),
        h('td', { 'data-label': 'المتاح' }, h('span.sto-cell', {}, h('b.num', {}, qtyI(x.av, x.l.itemId)), h('small', {}, whName(x.l.whId)))), h('td', { 'data-label': 'يتصرف الآن' }, inputs[i]))))));
    const save = h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: async () => {
      const lines = rows.map((x, i) => ({ itemId: x.l.itemId, qty: r2(Number(inputs[i].value) || 0), rem: x.rem }));
      if (lines.some((l) => l.qty < 0 || l.qty > l.rem + 0.001)) return showErr(err, 'الكمية مينفعش تزيد عن الباقي على الإذن.');
      const pick = lines.filter((l) => l.qty > 0); if (!pick.length) return showErr(err, 'اكتب كمية لصنف واحد على الأقل.');
      let res = null; mo.setBusy(true);
      try { await SA.api(() => { res = FX.issueMIR(id, { lines: pick.map((l) => ({ itemId: l.itemId, qty: l.qty })) }); }); } catch (e) { mo.setBusy(false); return SA.fail(e); }
      mo.setBusy(false); if (!res || !res.ok) return showErr(err, (res && res.reason) || 'تعذّر الصرف');
      mo.close(res); SA.toast((res.status === 'issued' ? 'اكتمل صرف ' : 'تم صرف جزئي على ') + id + ' — ' + pick.length + ' صنف', 'success');
    } }, SA.icon('check', 'icon-sm'), 'صرف الكميات دي');
    const mo = SA.modal({ title: 'صرف جزئي — ' + id, subtitle: m.woId + ' · ' + ERP.itemName(m.itemId), icon: 'edit', size: 'lg',
      body: h('div.sto-stack', {}, h('div.sto-qbtns', {}, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => fill((x) => Math.min(x.rem, x.av)) }, 'كل المتاح'), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => fill((x) => (x.l.dest === 'ST-MIX' ? Math.min(x.rem, x.av) : 0)) }, SA.icon('mixer', 'icon-sm'), 'خامات الخلاطة بس'), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => fill(() => 0) }, 'تصفير')),
        tbl, hint, SA.alert('info', 'الباقي يفضل على الإذن «صرف جزئي» لحد ما يتصرف — وكل صرف بيتسجل بقيده وحركته.'), err),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => mo.close(null) }, 'إلغاء'), save] });
    upd(); return mo;
  }

  function printPreview(id) {
    const m = ERP.find('issueRequests', id); if (!m) return;
    const sheet = mirSheet(m);
    const mo = SA.modal({ title: 'إذن صرف ' + id, subtitle: 'تنسيق A4 — يتوقّع من أمين المخزن ومشرف الخلاطة', icon: 'doc', size: 'xl', body: h('div', { style: { background: 'var(--color-bg-alt)', padding: '14px', borderRadius: '12px' } }, sheet),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => mo.close(null) }, 'إغلاق'), h('button.btn.btn-primary', { type: 'button', onclick: () => printNode(sheet) }, SA.icon('doc', 'icon-sm'), 'طباعة / حفظ PDF')] });
  }
  function mirSheet(m) {
    const co = st.get('settings.company') || {}; const so = soOf(m.soId); let n = 0; const rows = [];
    groupLines(m).forEach((g) => {
      rows.push(h('tr.sto-a4-g', {}, h('td', { colspan: 7 }, g.name + ' — ' + (DEST_HINT[g.stageId] || ''))));
      g.lines.forEach((l) => { const it = item(l.itemId) || {}; n++; rows.push(h('tr' + (l.itemId === FX.REG ? '.sto-a4-reg' : ''), {}, h('td.num', {}, n), h('td.num', {}, it.code || l.itemId), h('td', {}, (it.name || l.itemId) + (l.itemId === FX.REG ? ' — مطحون بدل PVC جديد' : '')), h('td', {}, ERP.uom[it.uom] || it.uom || ''), h('td.num', {}, num(l.qty)), h('td.num', {}, l.issuedQty ? num(l.issuedQty) : ''), h('td', {}, whName(l.whId)))); });
    });
    const box = (k, v) => h('div.sto-a4-box', {}, h('small', {}, k), h('b', {}, v));
    return h('div.sto-a4', { dir: 'rtl' },
      h('div.sto-a4-head', {}, h('div.sto-a4-co', {}, h('img', { src: '../../assets/images/logo/wordmark-color.png', alt: co.nameAr || '' }), h('b', {}, co.nameAr || ''), co.address ? h('small', {}, co.address) : null),
        h('div.sto-a4-title', {}, h('h2', {}, 'إذن صرف خامات للخلاطة'), h('small', {}, 'Material Issue Voucher'), h('b', {}, m.id), h('small', {}, 'التاريخ: ' + fmt.date(m.issuedAt || m.requestedAt)), h('small', {}, 'الحالة: ' + ((C.status.mir[m.status] || [m.status])[0])))),
      h('div.sto-a4-grid', {}, box('أمر التشغيل والمنتج', m.woId + ' — ' + ERP.itemName(m.itemId)), box('الكمية واللوط', fmt.num(m.qtyUnits) + ' ' + uomL(m.itemId) + ' · ' + (m.lot || '—')),
        box('أمر البيع', so ? so.id + ' — ' + ERP.customerName(so.customerId) + (so.export ? ' (تصدير)' : '') : 'إنتاج للمخزون'), box('الخلطات', (m.formulas || []).map((f) => f.formulaId + ' ' + (FX.TRACKS[f.track] || '') + ': ' + fmt.num(f.kg, 1) + ' كجم / ' + f.batches + ' خلطة').join(' · ') || '—')),
      h('table', {}, h('thead', {}, h('tr', {}, ['م', 'الكود', 'الصنف', 'الوحدة', 'المطلوب', 'المنصرف', 'من مخزن'].map((x) => h('th', {}, x)))), h('tbody', {}, rows)),
      m.regKg ? h('p.sto-a4-note', {}, 'المطحون: ' + fmt.num(m.regKg) + ' كجم من مخزن الهوالك والمطحون (W-07) يدخل الخلطة بدل نفس الوزن من PVC جديد — في حدود النسبة المعتمدة لكل خلطة.') : null,
      h('div.sto-a4-sign', {}, h('div', {}, 'أمين مخزن الخامات' + (m.issuedBy ? ': ' + userName(m.issuedBy) : '')), h('div', {}, 'المستلم — مشرف الخلاطة'), h('div', {}, 'مدير الإنتاج')),
      h('p.sto-a4-foot', {}, 'مستند من نموذج تجريبي للنظام — بدون قيم مالية. الكميات من مكونات المنتج (BOM) والخلطة المعتمدة (أرقام الخلطات تجريبية لحد ما المصنع يعتمد تركيباته).'));
  }

  /** count & receive finished goods (FX.receiveFG) — then shows what happened to the sales order */
  function receiveFgModal(id) {
    if (!SA.can('scm.fgreceipts.receive')) return noPerm('scm.fgreceipts.receive');
    const r = ERP.find('fgReceipts', id); if (!r || r.status !== 'pending') return SA.toast('الإذن ده اتسلم قبل كده', 'info');
    const it = item(r.itemId) || {}; const so = soOf(r.soId); const u = uomL(r.itemId);
    const inp = h('input.input.num', { type: 'number', min: 0, max: r.qty, step: 1, value: r.qty, dir: 'ltr', inputmode: 'numeric', 'aria-label': 'العدد الفعلي المستلم' });
    const step = (d) => { inp.value = Math.max(0, Math.min(r.qty, Math.round(Number(inp.value) || 0) + d)); upd(); };
    const note = h('textarea.textarea', { rows: 2, placeholder: 'مثال: باب مخدوش أثناء النقل من التغليف — رجع للجودة', 'aria-label': 'ملاحظة / سبب الفرق' });
    const diffBox = h('div'); const impact = h('div'); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    inp.addEventListener('input', upd);
    function upd() {
      const q = Math.round(Number(inp.value) || 0); SA.clear(diffBox); SA.clear(impact);
      if (q < r.qty) diffBox.appendChild(SA.alert('warning', h('b', {}, 'فرق ' + fmt.num(r.qty - q) + ' ' + u + '. '), 'اكتب السبب — الفرق هيتسجل على أمر التشغيل ' + r.woId + ' ويتبلّغ للإنتاج والجودة.'));
      if (q > r.qty) diffBox.appendChild(SA.alert('danger', 'العدد أكبر من اللي حوّلته الجودة (' + fmt.num(r.qty) + ') — راجع مسؤول الجودة قبل الاستلام.'));
      impact.appendChild(h('div.sap-impact', {}, h('b', {}, 'الأثر'), h('ul', {},
        h('li', {}, 'دخول ' + fmt.num(Math.min(q, r.qty)) + ' ' + u + ' إلى ' + whName(FG) + ' — الرصيد يبقى ' + fmt.num(K.qty(r.itemId, FG) + Math.min(q, r.qty))),
        h('li', {}, 'قيد آلي: مدين مخزون إنتاج تام 1143 / دائن إنتاج تحت التشغيل 1142 — ', U.cost(Math.min(q, r.qty) * (it.stdCost || 0))),
        so ? h('li', {}, 'حجز الكمية تلقائيًا لأمر البيع ', L(so.id), ' — ' + ERP.customerName(so.customerId)) : h('li', {}, 'إنتاج للمخزون — يبقى متاح للبيع والحجز'))));
    }
    const save = h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: goSave }, SA.icon('checkcircle', 'icon-sm'), 'تأكيد الاستلام');
    const mo = SA.modal({ title: 'استلام إنتاج تام — ' + r.id, subtitle: 'من «الجودة والتغليف» بعد الفحص النهائي ' + (r.qcId || ''), icon: 'checkcircle', size: 'md', focus: inp,
      body: h('div.sto-stack', {},
        h('div.sto-recv-h', {}, U.itemCell(r.itemId), h('div.sto-big-w', {}, h('small', {}, 'المحوّل من الجودة'), h('b.sto-big.num', {}, fmt.num(r.qty)), h('small', {}, u))),
        h('div.sto-meta', {}, h('span', {}, 'أمر التشغيل ', L(r.woId)), r.lot ? h('span', {}, 'اللوط ', h('b.num', {}, r.lot)) : null, so ? h('span', {}, 'لأمر البيع ', L(so.id)) : h('span', {}, 'إنتاج للمخزون')),
        h('div.field', {}, h('span.label', {}, 'العدد الفعلي اللي استلمته'), h('div.sto-count', {}, h('button.btn.btn-ghost', { type: 'button', 'aria-label': 'ناقص واحد', onclick: () => step(-1) }, '−'), inp, h('button.btn.btn-ghost', { type: 'button', 'aria-label': 'زيادة واحد', onclick: () => step(1) }, '+'))),
        diffBox, h('label.field', {}, h('span.label', {}, 'ملاحظة / سبب الفرق'), note), impact, err),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => mo.close(null) }, 'إلغاء'), save] });
    upd();
    async function goSave() {
      const q = Math.round(Number(inp.value) || 0); err.hidden = true;
      if (!(q > 0)) return showErr(err, 'اكتب العدد المستلم.');
      if (q > r.qty) return showErr(err, 'العدد أكبر من المحوّل من الجودة (' + fmt.num(r.qty) + ').');
      if (q < r.qty && note.value.trim().length < 3) { note.focus(); return showErr(err, 'اكتب سبب فرق العدّ.'); }
      let res = null; mo.setBusy(true);
      try {
        await SA.api(() => {
          res = FX.receiveFG(id, { qty: q, note: note.value.trim() });
          if (res && res.ok && q < r.qty) SA.notify({ title: 'فرق عدّ عند استلام ' + id, body: ERP.itemName(r.itemId) + ' — اتسلم ' + q + ' من ' + r.qty + ' · ' + note.value.trim(), level: 'action', to: ['R-05', 'R-09', 'R-06'], link: '#/scm/fg-receipts?q=' + id });
        });
      } catch (e) { mo.setBusy(false); return SA.fail(e); }
      mo.setBusy(false);
      if (!res || !res.ok) return showErr(err, (res && res.reason) || 'تعذّر الاستلام');
      const so2 = res.so; SA.toast('تم استلام ' + fmt.num(res.qty) + ' ' + u + ' في ' + whName(FG) + (so2 && so2.status === 'ready' ? ' — ' + so2.id + ' جاهز للتسليم' : ''), 'success', { ms: 6000 });
      SA.clear(mo.body); mo.body.appendChild(doneView(ERP.find('fgReceipts', id), so2));
      SA.clear(mo.foot); mo.foot.append(h('button.btn.btn-ghost', { type: 'button', onclick: () => mo.close(res) }, 'إغلاق'),
        so2 && so2.status === 'ready' && !so2.export && SA.can('scm.deliveries.create') ? h('button.btn.btn-primary', { type: 'button', onclick: () => { mo.close(res); createDn(so2.id); } }, SA.icon('plus', 'icon-sm'), 'جهّز إذن التسليم') : so2 && so2.status === 'ready' ? go('جهّز إذن التسليم', 'scm/deliveries?so=' + encodeURIComponent(so2.id), 'truck', 'primary') : null);
    }
    return mo;
  }
  function doneView(r, so) {
    return h('div.sto-stack', {}, h('div.sto-done', {}, h('span.sto-done-ico', {}, SA.icon('checkcircle')), h('h3', {}, 'تم الاستلام في ' + whName(FG)),
      h('p', {}, fmt.num(r.receivedQty) + ' ' + uomL(r.itemId) + ' — ' + ERP.itemName(r.itemId) + ' · الرصيد الآن ' + fmt.num(K.qty(r.itemId, FG)) + ' (المتاح ' + fmt.num(K.available(r.itemId, FG)) + ')')), soOutcome(so));
  }
  /** the sales-order result after a receipt (ready → «جاهز للتسليم — جهّز إذن التسليم») */
  function soOutcome(so) {
    if (!so) return SA.alert('info', h('b', {}, 'إنتاج للمخزون. '), 'الكمية دخلت ' + whName(FG) + ' ومتاحة للبيع والحجز لأي طلب جديد.');
    if (so.status === 'ready') return SA.alert('success', h('b', {}, 'جاهز للتسليم — جهّز إذن التسليم. '), 'كل بنود ', L(so.id), ' (' + ERP.customerName(so.customerId) + ') محجوزة في المخزن وتم إخطار الشحن. ', canRoute('scm/deliveries') ? h('a.sap-linkbtn', { href: '#/scm/deliveries?so=' + encodeURIComponent(so.id) }, 'افتح أذون التسليم للطلب') : null);
    if (['in_production', 'confirmed'].indexOf(so.status) >= 0) { const rem = so.lines.filter((l) => (l.reservedQty || 0) < l.qty); return SA.alert('info', h('b', {}, 'اتحجز للطلب. '), L(so.id), ' — ', rem.length ? 'باقي ' + rem.length + ' بند لسه في التصنيع: ' + rem.map((l) => ERP.itemName(l.itemId) + ' (' + fmt.num(l.qty - (l.reservedQty || 0)) + ')').join('، ') : 'كل البنود محجوزة.'); }
    return SA.alert('info', 'حالة أمر البيع ', L(so.id), ': ', U.status('so', so.status));
  }

  /** delivery note for a ready (non-export) order — ERP.flow.createDelivery; the logistics manager assigns the vehicle */
  function createDn(soId) {
    if (!SA.can('scm.deliveries.create')) return noPerm('scm.deliveries.create');
    const so = soOf(soId); if (!so) return null;
    const rem = (ERP.logistics && ERP.logistics.remainingOf ? ERP.logistics.remainingOf(so) : so.lines.map((l) => ({ itemId: l.itemId, qty: Math.max(0, (l.reservedQty || 0) - (l.deliveredQty || 0) - F.pendingDnQty(so.id, l.itemId)) }))).filter((x) => x.qty > 0);
    if (!rem.length) return SA.toast('مفيش كميات محجوزة متاحة للتسليم في ' + soId, 'warn');
    let when = so.promisedDate && so.promisedDate <= today() ? 'today' : 'tomorrow';
    const c = ERP.customer(so.customerId) || {};
    const seg = SA.segmented([['today', 'اليوم ' + fmt.date(today())], ['tomorrow', 'غدًا ' + fmt.date(ERP.day(1))]], when, (v) => { when = v; });
    const save = h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: async () => {
      let dn = null; mo.setBusy(true);
      try {
        await SA.api(() => {
          dn = F.createDelivery(soId, { plannedDate: when === 'today' ? today() : ERP.day(1) });
          if (dn) SA.notify({ title: 'إذن تسليم للتجهيز: ' + dn.id, body: ERP.customerName(so.customerId) + ' — ' + fmt.date(dn.plannedDate) + ' · أسند مركبة وسائق', level: 'action', to: ['R-17', 'R-06'], link: '#/scm/deliveries/' + dn.id });
        });
      } catch (e) { mo.setBusy(false); return SA.fail(e); }
      mo.close(dn); if (!dn) return SA.toast('تعذّر إنشاء الإذن — راجع الكميات', 'error');
      SA.toast('تم إنشاء ' + dn.id + ' — بانتظار إسناد مركبة من الشحن', 'success');
    } }, SA.icon('check', 'icon-sm'), 'إنشاء إذن التسليم');
    const mo = SA.modal({ title: 'إذن تسليم — ' + soId, subtitle: (c.name || '') + (c.city ? ' · ' + c.city : ''), icon: 'truck', size: 'md',
      body: h('div.sto-stack', {}, h('ul.sto-dnl', {}, rem.map((x) => h('li', {}, U.itemCell(x.itemId), h('b.num', {}, qtyI(x.qty, x.itemId))))),
        h('div.field', {}, h('span.label', {}, 'موعد التسليم'), seg, h('div.help', {}, 'موعد العميل: ' + (so.promisedDate ? fmt.date(so.promisedDate) + ' (' + dayLabel(so.promisedDate) + ')' : '—'))),
        SA.alert('info', 'البضاعة ما بتخرجش من المخزن عند الإنشاء — بتخرج عند «الخروج من المصنع» بعد ما الشحن يسند المركبة.')),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => mo.close(null) }, 'إلغاء'), save] });
    return mo;
  }
  async function startLoading(id) {
    if (!SA.can('scm.deliveries.dispatch')) return noPerm('scm.deliveries.dispatch');
    const dn = ERP.find('deliveries', id); if (!dn || dn.status !== 'planned') return null;
    const v = dn.vehicleId ? st.find('vehicles', dn.vehicleId) : null;
    try { await SA.api(() => { st.patch('deliveries', id, { status: 'loading', loadingAt: ERP.now() }); SA.audit('DN.LOADING', { target: { type: 'dn', id, label: ERP.customerName(dn.customerId) }, before: { status: 'planned' }, after: { status: 'loading', vehicle: v ? v.plate : null } }); }); } catch (e) { return SA.fail(e); }
    SA.toast('بدأ تحميل ' + id + (v ? ' على ' + v.plate : ''), 'success'); return true;
  }
  async function dispatchDn(id) {
    if (!SA.can('scm.deliveries.dispatch')) return noPerm('scm.deliveries.dispatch');
    const dn = ERP.find('deliveries', id); if (!dn || ['planned', 'loading'].indexOf(dn.status) < 0) return null;
    const v = dn.vehicleId ? st.find('vehicles', dn.vehicleId) : null;
    if (!v) return SA.toast('لازم مدير الشحن يسند مركبة للإذن الأول', 'warn');
    if (v.status === 'maintenance') return SA.toast('المركبة ' + v.plate + ' في الصيانة — اطلب من الشحن مركبة تانية', 'warn');
    const short = dn.lines.filter((l) => K.qty(l.itemId, FG) < l.qty); if (short.length) return SA.toast('رصيد ' + whName(FG) + ' لا يغطي ' + short.map((l) => ERP.itemName(l.itemId)).join('، '), 'error');
    const cogs = sum(dn.lines, (l) => l.qty * ((item(l.itemId) || {}).stdCost || 0));
    const r = await SA.confirm({ title: 'خروج من المصنع — ' + id, icon: 'truck', text: ERP.customerName(dn.customerId) + ' · ' + v.plate + ' — ' + (dn.driver || v.driver || ''),
      impact: ['صرف ' + dn.lines.length + ' بند من ' + whName(FG) + ' وفك الحجز عن ' + dn.soId, h('span', {}, 'قيد تكلفة البضاعة المباعة آليًا (5101 / 1143) — ', U.cost(cogs)), 'إشعار خدمة العملاء والمندوب بخروج الشحنة'], confirmLabel: 'تأكيد الخروج' });
    if (!r.ok) return null;
    let x = null;
    try { await SA.api(() => { x = F.dispatch(id, { vehicleId: v.id, driver: dn.driver || v.driver }); if (x) { const so = soOf(dn.soId); SA.notify({ title: 'خرجت شحنة ' + id + ' من المصنع', body: ERP.customerName(dn.customerId) + ' — ' + v.plate, level: 'info', to: ['R-19'], toUsers: so && so.repId ? [so.repId] : [], link: '#/scm/deliveries/' + id }); } }); } catch (e) { return SA.fail(e); }
    if (!x) return SA.toast('حالة الإذن اتغيرت — حدّث الصفحة', 'warn');
    SA.toast(id + ' خرج من المصنع على ' + v.plate + ' — تم صرف المخزون', 'success'); return x;
  }
  function receivePO(poId) { if (ERP.scm && ERP.scm.receiveModal) return ERP.scm.receiveModal(poId); SA.nav('scm/po/' + poId + '?receive=1'); return null; }
  const duePOs = () => get('purchaseOrders').filter((p) => p.status === 'sent' || p.status === 'partially_received').sort((a, b) => String(a.expectedDate || '').localeCompare(String(b.expectedDate || '')));
  function poPicker() {
    if (!SA.can('scm.grn.create')) return noPerm('scm.grn.create');
    const pos = duePOs(); if (!pos.length) return SA.toast('مفيش أوامر شراء مستنية توريد', 'info');
    const mo = SA.modal({ title: 'استلام من مورد', subtitle: 'اختار أمر الشراء اللي وصلت بضاعته', icon: 'inbox', size: 'md',
      body: h('ul.sto-list', {}, pos.map((p) => h('li.sto-li', {}, h('span.sto-li-ico.is-' + dayTone(p.expectedDate), {}, SA.icon('truck', 'icon-sm')),
        h('div.sto-li-b', {}, h('div.sto-li-h', {}, h('b.num', {}, p.id), tag(dayLabel(p.expectedDate), dayTone(p.expectedDate))), h('b', {}, ERP.supplierName(p.supplierId)), h('small', {}, p.lines.map((l) => ERP.itemName(l.itemId) + ' ' + qtyI(Math.max(0, l.qty - (l.receivedQty || 0)), l.itemId)).join(' · '))),
        h('div.sto-li-a', {}, h('button.btn.btn-primary', { type: 'button', onclick: () => { mo.close(p.id); receivePO(p.id); } }, SA.icon('inbox', 'icon-sm'), 'استلام'))))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => mo.close(null) }, 'إغلاق')] });
    return mo;
  }

  /* ═════════════ shared bits ═════════════ */
  function tile(o) {
    const locked = o.perm && !SA.can(o.perm);
    const inner = [h('span.sto-act-ico', {}, SA.icon(locked ? 'lock' : o.icon)), h('span.sto-act-t', {}, h('b', {}, o.label), o.sub ? h('small', {}, o.sub) : null), o.n != null ? h('span.sto-act-n' + (o.n ? '' : '.is-zero'), { 'aria-label': o.n + ' مطلوب' }, o.n) : null];
    const cls = 'sto-act' + (o.hot ? '.is-hot' : '') + (locked ? '.is-locked' : '');
    if (o.href && !locked) return h('a.' + cls, { href: o.href }, inner);
    return h('button.' + cls, { type: 'button', title: locked ? 'ليست من صلاحياتك (' + o.perm + ')' : null, 'aria-disabled': locked ? 'true' : null, onclick: () => { if (locked) return noPerm(o.perm); if (o.onClick) o.onClick(); return null; } }, inner);
  }
  function hero(kind) {
    const u = SA.session.user || {}; const hr = new Date().getHours();
    const first = String(u.name || '').split(' ').filter((p) => p && !/^[مد]\.$/.test(p))[0] || '';
    const shift = hr >= 7 && hr < 15 ? 'الوردية A' : hr >= 15 && hr < 23 ? 'الوردية B' : 'الوردية C';
    return h('div.sto-hero', {},
      h('div', {}, h('span.sto-hero-k', {}, kind === 'in' ? 'مكتب أمين مخزن الخامات' : 'مكتب أمين مخزن المنتج التام'), h('h1', {}, (hr < 12 ? 'صباح الخير' : 'مساء الخير') + (first ? ' يا ' + first : '')),
        h('p', {}, kind === 'in' ? 'تستلم الخامات والمستلزمات من الموردين، وتصرفها للخلاطة بإذن صرف حسب الخلطة، وتتابع الهوالك والمطحون.' : 'تستلم الإنتاج التام بعد الفحص النهائي وتعدّه، وتجهّز أذون التسليم وتخرّج البضاعة للعملاء.')),
      h('div.sto-hero-r', {}, h('span.sto-hero-d', {}, SA.fmt.date(new Date().toISOString()) + ' · ' + shift), h('div.sto-whs', {}, (kind === 'in' ? IN_WH : OUT_WH).map((w) => h('span.sto-whchip', {}, SA.icon('warehouse', 'icon-sm'), whName(w))))));
  }
  const kpis = (list) => { const el = U.kpis(list); el.classList.add('sto-kpis'); return el; };
  const more = (n, shown, route, label) => (n > shown && canRoute(route) ? h('a.sap-linkbtn', { href: '#/' + route, style: { display: 'inline-block', marginTop: '10px' } }, (label || 'عرض الكل') + ' (' + n + ') ←') : null);
  function movesCard(whs) {
    const mv = get('stockMoves').filter((m) => whs.indexOf(m.whId) >= 0).slice(0, 7);
    return SA.card({ title: 'آخر الحركات في مخازنك', actions: [go('كل الحركات', 'scm/moves', 'activity')].filter(Boolean) },
      mv.length ? h('ul.sto-moves', {}, mv.map((m) => h('li', {}, h('span.sto-mv-q.' + (m.qty < 0 ? 'is-out' : 'is-in'), { dir: 'ltr' }, (m.qty > 0 ? '+' : '') + fmt.num(r2(m.qty), 1)),
        h('div', {}, h('b', {}, ERP.itemName(m.itemId)), h('small', {}, (MOVE_L[m.type] || m.type) + ' · ' + whName(m.whId) + ' · ' + SA.fmt.rel(m.ts))), m.ref && m.ref.id ? L(m.ref.id) : null)))
        : SA.empty({ icon: 'activity', title: 'لا توجد حركات بعد' }));
  }

  /* ═════════════ 1. scm-desk ═════════════ */
  function mirCard(m) {
    const so = soOf(m.soId); const short = mirShort(m); const rem = m.lines.filter((l) => remOf(l) > 0); const hot = isExport(m) || m.priority === 'high'; const gs = groupLines(m);
    return h('article.sto-qi' + (short.length ? '.is-danger' : hot ? '.is-hot' : ''), {},
      h('div.sto-qi-h', {}, L(m.id), U.status('mir', m.status), prioTags(m), h('span.sto-grow'), h('small.sto-muted', {}, 'وصل ' + SA.fmt.rel(m.requestedAt))),
      h('div.sto-qi-t', {}, U.itemCell(m.itemId), h('div.sto-big-w', {}, h('b.sto-big.num', {}, fmt.num(m.qtyUnits)), h('small', {}, uomL(m.itemId)))),
      h('div.sto-meta', {}, h('span', {}, 'أمر التشغيل ', L(m.woId)), so ? h('span', {}, 'أمر البيع ', L(so.id), ' — ', ERP.customerName(so.customerId)) : h('span', {}, 'إنتاج للمخزون'), m.lot ? h('span', {}, 'اللوط ', h('b.num', {}, m.lot)) : null, h('span', {}, 'الخلطة ', h('b.num', {}, fmt.num(m.compoundKg, 1) + ' كجم'))),
      h('div.sto-fchips', {}, (m.formulas || []).map((f) => h('span.sto-fchip', {}, SA.icon('mixer', 'icon-sm'), L(f.formulaId), ' ' + (FX.TRACKS[f.track] || '') + ' · ', h('b.num', {}, fmt.num(f.kg, 0) + ' كجم'), ' · ', h('span.num', {}, f.batches + ' خلطة'))),
        m.regKg ? h('span.sto-fchip.is-reg', {}, SA.icon('recycle', 'icon-sm'), 'مطحون بدل PVC جديد ', h('b.num', {}, fmt.num(m.regKg) + ' كجم')) : null),
      short.length ? h('div.sto-warn', {}, SA.icon('alert', 'icon-sm'), h('span', {}, 'نقص في ' + short.length + ' صنف: ' + short.slice(0, 3).map((l) => ERP.itemName(l.itemId) + ' (' + qtyI(shortOf(l), l.itemId) + ')').join('، ') + ' — هيتصرف المتاح بس.'))
        : h('div.sto-ok', {}, SA.icon('checkcircle', 'icon-sm'), h('span', {}, m.status === 'partial' ? 'الباقي ' + rem.length + ' صنف — متاح في المخزن' : 'كل الأصناف متاحة — ' + rem.length + ' صنف لـ ' + gs.length + ' محطات: ' + gs.map((g) => g.name).join(' · '))),
      h('div.sto-qi-a', {}, SA.btn({ label: m.status === 'partial' ? 'صرف الباقي' : 'صرف الكل', icon: 'check', size: 'lg', perm: 'scm.issues.issue', onClick: () => issueAll(m.id) }),
        SA.btn({ label: 'صرف جزئي', icon: 'edit', kind: 'ghost', size: 'lg', perm: 'scm.issues.issue', onClick: () => partialModal(m.id) }),
        h('a.btn.btn-ghost.btn-lg', { href: '#/scm/issues/' + encodeURIComponent(m.id) }, SA.icon('eye', 'icon-sm'), 'تفاصيل الإذن')));
  }
  function poCard(pos) {
    const list = pos.slice(0, 5);
    return SA.card({ title: 'توريدات منتظرة من الموردين', tags: h('span.sap-count', {}, pos.length), actions: [go('أوامر الشراء', 'scm/po', 'cart')].filter(Boolean) },
      list.length ? h('ul.sto-list', {}, list.map((p) => { const tone = dayTone(p.expectedDate); const qt = sum(p.lines, (l) => l.qty); const rc = sum(p.lines, (l) => Math.min(l.qty, l.receivedQty || 0));
        return h('li.sto-li', {}, h('span.sto-li-ico.is-' + tone, {}, SA.icon('truck', 'icon-sm')),
          h('div.sto-li-b', {}, h('div.sto-li-h', {}, L(p.id), tag(dayLabel(p.expectedDate), tone), p.status === 'partially_received' ? tag('استلام جزئي ' + Math.round((qt ? rc / qt : 0) * 100) + '%', 'warning') : null), h('b', {}, ERP.supplierName(p.supplierId)),
            h('small', {}, p.lines.map((l) => ERP.itemName(l.itemId) + ' — باقي ' + qtyI(Math.max(0, l.qty - (l.receivedQty || 0)), l.itemId)).join(' · '))),
          h('div.sto-li-a', {}, SA.btn({ label: 'استلام', icon: 'inbox', perm: 'scm.grn.create', onClick: () => receivePO(p.id) }))); }))
        : SA.empty({ icon: 'truck', title: 'مفيش توريدات منتظرة', text: 'أوامر الشراء المرسلة للموردين هتظهر هنا بموعد وصولها.' }),
      more(pos.length, list.length, 'scm/po'));
  }
  function grnCard(grns) {
    return SA.card({ title: 'بانتظار فحص الاستلام (الجودة)', tags: h('span.sap-count', {}, grns.length), actions: [go('أذون الاستلام', 'scm/grn', 'inbox')].filter(Boolean) },
      grns.length ? h('ul.sto-list', {}, grns.slice(0, 5).map((g) => h('li.sto-li', {}, h('span.sto-li-ico.is-warning', {}, SA.icon('clock', 'icon-sm')),
        h('div.sto-li-b', {}, h('div.sto-li-h', {}, L(g.id), U.status('grn', g.status), h('small', {}, 'اتسلم ' + SA.fmt.rel(g.at))), h('b', {}, ERP.supplierName(g.supplierId)),
          h('small', {}, g.lines.map((l) => ERP.itemName(l.itemId) + ' ' + qtyI(l.qty, l.itemId)).join(' · ') + ' · ' + whName(g.whId)))))) : SA.empty({ icon: 'checkcircle', title: 'مفيش بضاعة مستنية الجودة' }),
      h('p.sto-note', {}, 'البضاعة الواردة ما بتدخلش الرصيد إلا بعد قرار فحص الاستلام — المقبول يدخل المخزن وتتسجل فاتورة المورد، والمرفوض يروح منطقة الحجر ويرجع للمورد.'));
  }
  function lowCard() {
    const low = K.low().filter((i) => ['rm', 'pkg', 'spare'].indexOf(i.kind) >= 0 && (i.reorderPoint || 0) > 0).sort((a, b) => K.qty(a.id) / (a.reorderPoint || 1) - K.qty(b.id) / (b.reorderPoint || 1));
    return SA.card({ title: 'خامات عند / تحت حد الطلب', tags: h('span.sap-count', {}, low.length), actions: [go('الأرصدة', 'scm/stock?below=1', 'box')].filter(Boolean) },
      low.length ? h('ul.sto-list', {}, low.slice(0, 6).map((i) => { const q = K.qty(i.id); const rop = i.reorderPoint || 0; const oo = K.onOrder(i.id); const prq = get('purchaseRequisitions').find((r) => r.itemId === i.id && ['open', 'approved', 'ordered'].indexOf(r.status) >= 0);
        return h('li.sto-li', {}, h('span.sto-li-ico.is-' + (q <= rop * 0.5 ? 'danger' : 'warning'), {}, SA.icon('alert', 'icon-sm')),
          h('div.sto-li-b', {}, itemLink(i), ERP.chart.meter(rop ? Math.min(1, q / rop) : 0, { label: 'الرصيد ' + qtyI(q, i.id) + ' من حد ' + fmt.num(rop), tone: q <= rop * 0.5 ? 'danger' : 'warning', text: Math.round((rop ? q / rop : 0) * 100) + '%' }),
            h('small', {}, oo > 0 ? 'جاي على أوامر شراء: ' + qtyI(oo, i.id) : 'مفيش أمر شراء مفتوح')),
          h('div.sto-li-a', {}, prq ? L(prq.id) : SA.btn({ label: 'طلب شراء', icon: 'plus', kind: 'ghost', size: 'sm', perm: 'scm.requisitions.create', onClick: () => (ERP.scm && ERP.scm.newPRQ ? ERP.scm.newPRQ({ itemId: i.id, reason: 'تحت حد الطلب — من مكتب أمين المخزن' }) : SA.nav('scm/requisitions')) }))); }))
        : SA.empty({ icon: 'checkcircle', title: 'كل الخامات فوق حد الطلب' }));
  }
  function scrapCard() {
    const reg = K.qty(FX.REG, W7), gr = K.qty('IT-SCR-GR', W7), dust = K.qty('IT-SCR-DUST', W7), film = K.qty('IT-SCR-FILM', W7);
    const lastG = get('scrapOps').find((o) => o.kind === 'grind'); const sales = get('scrapSales').filter((s) => s.status === 'pending_approval' || s.status === 'approved');
    const regPend = sum(openMirs(), (m) => sum(m.lines.filter((l) => l.itemId === FX.REG), (l) => remOf(l)));
    const sr = canRoute('mfg/scrap');
    const bal = (label, v, itemId, cls, sub) => h((sr ? 'a' : 'div') + '.' + (cls || 'sto-b'), sr ? { href: '#/mfg/scrap' } : {}, h('span', {}, label), h('b.num', {}, fmt.num(r2(v), 0) + ' كجم'), sub ? h('small', {}, sub) : null);
    return SA.card({ title: 'مخزن الهوالك والمطحون', tags: tag('W-07', 'info'), actions: [go('الهوالك وإعادة التدوير', 'mfg/scrap', 'recycle')].filter(Boolean) },
      h('div.sto-bal', {}, bal('مطحون جاهز للخلاطة', reg, FX.REG, 'is-reg', regPend ? 'مطلوب لأذون الصرف: ' + fmt.num(r2(regPend), 0) + ' كجم' : 'يرجع الخلاطة جوه الخلطة'), bal('هوالك قابلة للطحن', gr, 'IT-SCR-GR', null, 'للكسارة M-502'), bal('تراب سنفرة ونشارة', dust, 'IT-SCR-DUST', null, 'للبيع'), bal('هوالك فويل وشريط', film, 'IT-SCR-FILM', null, 'للبيع')),
      h('ul.sto-mini', {}, h('li', {}, h('span', {}, 'آخر طحن'), h('b', {}, lastG ? SA.fmt.rel(lastG.at) + ' — ' + fmt.num(lastG.kgIn) + ' ← ' + fmt.num(lastG.kgOut, 0) + ' كجم مطحون' : '—')),
        h('li', {}, h('span', {}, 'هوالك اتسجلت النهارده'), h('b.num', {}, fmt.num(FX.scrapStats({ days: 1 }).kg, 1) + ' كجم')),
        sales.length ? h('li', {}, h('span', {}, 'بيع هوالك'), h('span', {}, sales.map((s, i) => [i ? ' · ' : '', L(s.id), ' ', U.status('scrapsale', s.status)]))) : null),
      h('p.sto-note', {}, 'المطحون بيرجع الخلاطة جوه الخلطة بالنسبة المعتمدة لكل تركيبة — والزيادة بس هي اللي تتباع بموافقة المدير المالي.'));
  }
  function inboundDesk() {
    const mirs = openMirs(); const pos = duePOs(); const grns = get('grns').filter((g) => g.status === 'pending_qc').sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const td = today(); const issuedToday = get('issueRequests').filter((m) => m.issuedAt && localDay(m.issuedAt) === td);
    const late = pos.filter((p) => dDiff(p.expectedDate) < 0).length, soon = pos.filter((p) => dDiff(p.expectedDate) >= 0 && dDiff(p.expectedDate) <= 1).length;
    const low = K.low().filter((i) => ['rm', 'pkg', 'spare'].indexOf(i.kind) >= 0 && (i.reorderPoint || 0) > 0);
    const reg = K.qty(FX.REG, W7); const hot = mirs.some((m) => isExport(m) || m.priority === 'high');
    return h('div', {}, hero('in'),
      h('div.sto-acts', {},
        tile({ icon: 'mixer', label: 'صرف للخلاطة', sub: mirs.length ? (hot ? 'فيه إذن تصدير / عاجل' : 'أذون صرف مستنياك') : 'مفيش أذون مستنية', n: mirs.length, hot, onClick: () => SA.nav(mirs.length ? 'scm/issues/' + mirs[0].id : 'scm/issues') }),
        tile({ icon: 'inbox', label: 'استلام من مورد', sub: soon + late ? (late ? late + ' متأخر · ' : '') + soon + ' اليوم/غدًا' : 'سجّل وصول بضاعة على أمر شراء', n: pos.length, perm: 'scm.grn.create', onClick: poPicker }),
        tile({ icon: 'swap', label: 'تحويل بين المخازن', sub: 'خامات · قطع غيار · حجر', perm: 'scm.transfers.create', onClick: () => (ERP.scm && ERP.scm.transferModal ? ERP.scm.transferModal({ from: 'W-02' }) : SA.nav('scm/transfers')) }),
        tile({ icon: 'recycle', label: 'الهوالك والمطحون', sub: fmt.num(r2(reg), 0) + ' كجم مطحون جاهز للخلاطة', href: canRoute('mfg/scrap') ? '#/mfg/scrap' : null, onClick: () => { const c = document.querySelector('.sto-scrap'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } })),
      kpis([
        U.kpi({ label: 'اتصرف النهارده', value: fmt.num(issuedToday.length), sub: issuedToday.length ? fmt.num(sum(issuedToday, (m) => m.compoundKg || 0), 0) + ' كجم خلطة للخلاطة' : 'لسه مفيش صرف النهارده', icon: 'clipboard', href: '#/scm/issues?status=issued' }),
        U.kpi({ label: 'توريدات اليوم وبكرة', value: fmt.num(soon), sub: late ? late + ' توريد متأخر عن موعده' : 'مفيش متأخر', icon: 'truck', tone: late ? 'danger' : null, href: canRoute('scm/po') ? (late ? '#/scm/po?late=1' : '#/scm/po') : null }),
        U.kpi({ label: 'بانتظار فحص الجودة', value: fmt.num(grns.length), sub: 'أذون استلام قبل قرار الجودة', icon: 'clock', tone: grns.length ? 'warning' : null, href: canRoute('scm/grn') ? '#/scm/grn' : null }),
        U.kpi({ label: 'خامات تحت حد الطلب', value: fmt.num(low.length), sub: low.slice(0, 2).map((i) => i.name.split(' ').slice(0, 2).join(' ')).join('، ') || 'كله تمام', icon: 'alert', tone: low.length ? 'danger' : 'success', href: canRoute('scm/stock') ? '#/scm/stock?below=1' : null }),
        U.kpi({ label: 'مطحون جاهز للخلاطة', value: fmt.num(r2(reg), 0) + ' كجم', sub: 'هوالك للطحن ' + fmt.num(r2(K.qty('IT-SCR-GR', W7)), 0) + ' كجم', icon: 'recycle', tone: 'success', href: canRoute('mfg/scrap') ? '#/mfg/scrap' : null })]),
      h('div.sto-split', {},
        h('div.sto-col', {},
          SA.card({ title: 'أذون صرف للخلاطة', tags: h('span.sap-count', {}, mirs.length), actions: [go('كل أذون الصرف', 'scm/issues', 'list')].filter(Boolean) },
            mirs.length ? h('div.sto-q', {}, mirs.slice(0, 4).map(mirCard)) : SA.empty({ icon: 'checkcircle', title: 'مفيش أذون صرف مستنياك', text: 'لما الإنتاج يطلق أمر تشغيل هيوصلك إذن صرف هنا فورًا — بالخلطة والكميات لكل محطة.' }), more(mirs.length, 4, 'scm/issues')),
          poCard(pos), grnCard(grns)),
        h('div.sto-col', {}, lowCard(), h('div.sto-scrap', {}, scrapCard()), movesCard(IN_WH))));
  }

  function fgrCard(r) {
    const so = soOf(r.soId); const qc = qcOf(r.qcId);
    return h('article.sto-qi' + (so ? '.is-hot' : ''), {},
      h('div.sto-qi-h', {}, L(r.id), U.status('fgr', r.status), so && so.export ? exportTag() : null, h('span.sto-grow'), h('small.sto-muted', {}, 'وصل من الجودة ' + SA.fmt.rel(r.createdAt))),
      h('div.sto-qi-t', {}, U.itemCell(r.itemId), h('div.sto-big-w', {}, h('b.sto-big.num', {}, fmt.num(r.qty)), h('small', {}, uomL(r.itemId)))),
      h('div.sto-meta', {}, h('span', {}, 'أمر التشغيل ', L(r.woId)), h('span', {}, 'الفحص النهائي ', L(r.qcId), qc ? [' ', U.status('qc', qc.result)] : null), r.lot ? h('span', {}, 'اللوط ', h('b.num', {}, r.lot)) : null,
        so ? h('span', {}, 'لأمر البيع ', L(so.id), ' — ', ERP.customerName(so.customerId)) : h('span', {}, h('b', {}, 'إنتاج للمخزون'))),
      h('div.sto-qi-a', {}, SA.btn({ label: 'استلام وعدّ', icon: 'checkcircle', size: 'lg', perm: 'scm.fgreceipts.receive', onClick: () => receiveFgModal(r.id) }), SA.btn({ label: 'التفاصيل', icon: 'eye', kind: 'ghost', size: 'lg', onClick: () => openFgr(r.id) })));
  }
  function dnCard(d) {
    const v = d.vehicleId ? st.find('vehicles', d.vehicleId) : null; const short = d.lines.filter((l) => K.qty(l.itemId, FG) < l.qty); const tone = dDiff(d.plannedDate) < 0 ? 'danger' : dDiff(d.plannedDate) === 0 ? 'warning' : 'info';
    const acts = [];
    if (d.status === 'planned') acts.push(SA.btn({ label: 'بدء التحميل', icon: 'box', kind: 'ghost', size: 'lg', perm: 'scm.deliveries.dispatch', onClick: () => startLoading(d.id) }));
    if (v && !short.length) acts.push(SA.btn({ label: 'خروج من المصنع', icon: 'truck', size: 'lg', perm: 'scm.deliveries.dispatch', onClick: () => dispatchDn(d.id) }));
    acts.push(h('a.btn.btn-ghost.btn-lg', { href: '#/scm/deliveries/' + encodeURIComponent(d.id) }, SA.icon('eye', 'icon-sm'), 'فتح الإذن'));
    return h('article.sto-qi' + (short.length ? '.is-danger' : tone === 'danger' ? '.is-hot' : ''), {},
      h('div.sto-qi-h', {}, L(d.id), U.status('dn', d.status), tag(dayLabel(d.plannedDate), tone), d.shipmentId ? tag(d.shipmentId, 'navy', 'ship') : null, h('span.sto-grow'), L(d.soId)),
      h('div.sto-qi-t', {}, h('div', {}, h('b', {}, ERP.customerName(d.customerId)), h('div.sto-muted', {}, d.address || '')), h('div.sto-big-w', {}, h('b.sto-big.num', {}, fmt.num(sum(d.lines, (l) => l.qty))), h('small', {}, d.lines.length + ' بند'))),
      h('ul.sto-dnl', {}, d.lines.map((l) => h('li', {}, U.itemCell(l.itemId), h('span', {}, h('b.num', {}, qtyI(l.qty, l.itemId)), K.qty(l.itemId, FG) < l.qty ? [' ', tag('رصيد ' + FG + ': ' + fmt.num(K.qty(l.itemId, FG)), 'danger')] : null)))),
      h('div.sto-meta', {}, v ? h('span', {}, SA.icon('truck', 'icon-sm'), ' ', h('b', {}, v.plate), ' — ' + (d.driver || v.driver || '')) : tag('بانتظار إسناد مركبة من الشحن', 'warning', 'clock')),
      h('div.sto-qi-a', {}, acts));
  }
  function readyCard(list, partialN) {
    return SA.card({ title: 'أوامر جاهزة للتسليم (بدون إذن)', tags: h('span.sap-count', {}, list.length), actions: [go('أذون التسليم', 'scm/deliveries', 'box')].filter(Boolean) },
      list.length ? h('ul.sto-list', {}, list.slice(0, 5).map((x) => { const so = x.so; const c = ERP.customer(so.customerId) || {}; const late = so.promisedDate && so.promisedDate < today();
        return h('li.sto-li', {}, h('span.sto-li-ico.is-' + (late ? 'danger' : 'success'), {}, SA.icon('box', 'icon-sm')),
          h('div.sto-li-b', {}, h('div.sto-li-h', {}, L(so.id), U.status('so', so.status), so.export ? exportTag() : null, tag('موعد العميل: ' + dayLabel(so.promisedDate), late ? 'danger' : 'info')), h('b', {}, (c.name || so.customerId) + (c.city ? ' · ' + c.city : '')),
            h('small', {}, x.lines.map((l) => ERP.itemName(l.itemId) + ' × ' + fmt.num(l.qty)).join(' · '))),
          h('div.sto-li-a', {}, so.export ? go('إذن تسليم للحاوية', 'scm/deliveries?so=' + encodeURIComponent(so.id), 'ship', 'ghost') : SA.btn({ label: 'جهّز إذن التسليم', icon: 'plus', perm: 'scm.deliveries.create', onClick: () => createDn(so.id) }))); }))
        : SA.empty({ icon: 'checkcircle', title: 'مفيش بضاعة جاهزة من غير إذن', text: 'لما تستلم إنتاج تام لأمر بيع وبنوده تكتمل، هيظهر هنا تلقائيًا.' }),
      partialN ? h('p.sto-note', {}, partialN + ' أمر بيع عليه حجز جزئي وباقيه لسه في التصنيع — بيتسلّم لما يكمل.') : null);
  }
  function fgAlertCard() {
    const low = K.low().filter((i) => i.kind === 'fg' && (i.reorderPoint || 0) > 0);
    const qrt = get('stock').filter((r) => r.whId === K.QRT && r.qty > 0 && (item(r.itemId) || {}).kind === 'fg');
    const rows = low.map((i) => ({ i, kind: 'low' })).concat(qrt.map((r) => ({ i: item(r.itemId), kind: 'qrt', q: r.qty })));
    return SA.card({ title: 'تنبيهات مخزن المنتج التام', tags: h('span.sap-count', {}, rows.length), actions: [go('الأرصدة', 'scm/stock?kind=fg', 'box')].filter(Boolean) },
      rows.length ? h('ul.sto-list', {}, rows.slice(0, 6).map((x) => { const i = x.i; const q = K.qty(i.id, FG); const res = K.reserved(i.id, FG); const wo = get('workOrders').find((w) => w.itemId === i.id && ['planned', 'released', 'in_progress', 'qc_pending'].indexOf(w.status) >= 0);
        return h('li.sto-li', {}, h('span.sto-li-ico.is-' + (x.kind === 'qrt' ? 'warning' : 'danger'), {}, SA.icon(x.kind === 'qrt' ? 'shield' : 'alert', 'icon-sm')),
          h('div.sto-li-b', {}, itemLink(i), x.kind === 'qrt' ? h('small', {}, fmt.num(x.q) + ' ' + uomL(i.id) + ' في منطقة الحجر بانتظار قرار الجودة') : h('small', {}, 'الرصيد ' + fmt.num(q) + ' (محجوز ' + fmt.num(res) + ') — حد الطلب ' + fmt.num(i.reorderPoint)),
            wo ? h('small', {}, 'جاري إنتاجه: ', L(wo.id), ' ', U.status('wo', wo.status)) : x.kind === 'low' ? h('small', {}, 'مفيش أمر تشغيل مفتوح — بلّغ التخطيط') : null)); }))
        : SA.empty({ icon: 'checkcircle', title: 'مفيش تنبيهات', text: 'كل الأصناف التامة فوق حد الطلب.' }));
  }
  function transitCard(list) {
    return SA.card({ title: 'في الطريق للعملاء', tags: h('span.sap-count', {}, list.length) },
      list.length ? h('ul.sto-list', {}, list.slice(0, 5).map((d) => { const v = d.vehicleId ? st.find('vehicles', d.vehicleId) : null;
        return h('li.sto-li', {}, h('span.sto-li-ico', {}, SA.icon('truck', 'icon-sm')), h('div.sto-li-b', {}, h('div.sto-li-h', {}, L(d.id), U.status('dn', d.status)), h('b', {}, ERP.customerName(d.customerId)), h('small', {}, (v ? v.plate + ' · ' : '') + 'خرج ' + SA.fmt.rel(d.dispatchedAt)))); }))
        : SA.empty({ icon: 'truck', title: 'مفيش شحنات في الطريق' }));
  }
  function outboundDesk() {
    const fgrs = openFgrs(); const td = today(); const recToday = get('fgReceipts').filter((r) => r.status === 'received' && localDay(r.receivedAt) === td);
    const dns = get('deliveries'); const open = dns.filter((d) => ['planned', 'loading'].indexOf(d.status) >= 0).sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)));
    const due = open.filter((d) => dDiff(d.plannedDate) <= 1); const moving = dns.filter((d) => ['dispatched', 'in_transit'].indexOf(d.status) >= 0);
    const q = ERP.logistics && ERP.logistics.readyQueue ? ERP.logistics.readyQueue() : [];
    const ready = q.filter((x) => ['ready', 'partially_delivered', 'confirmed'].indexOf(x.so.status) >= 0); const partialN = q.length - ready.length;
    const lowFg = K.low().filter((i) => i.kind === 'fg' && (i.reorderPoint || 0) > 0);
    const qrtN = get('stock').filter((r) => r.whId === K.QRT && r.qty > 0 && (item(r.itemId) || {}).kind === 'fg').length;
    return h('div', {}, hero('out'),
      h('div.sto-acts', {},
        tile({ icon: 'checkcircle', label: 'استلام من الجودة', sub: fgrs.length ? fmt.num(sum(fgrs, (r) => r.qty)) + ' وحدة مستنية العدّ' : 'مفيش إنتاج مستني', n: fgrs.length, hot: fgrs.some((r) => r.soId), perm: 'scm.fgreceipts.receive', onClick: () => (fgrs.length === 1 ? receiveFgModal(fgrs[0].id) : SA.nav('scm/fg-receipts')) }),
        tile({ icon: 'truck', label: 'تحميل وخروج', sub: due.length ? 'أذون تسليم اليوم وبكرة' : 'مفيش أذون للتحميل', n: due.length, perm: 'scm.deliveries.dispatch', onClick: () => { const c = document.querySelector('.sto-dns'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }),
        tile({ icon: 'box', label: 'جهّز إذن تسليم', sub: ready.length ? 'أوامر جاهزة من غير إذن' : 'مفيش أوامر جاهزة', n: ready.length, perm: 'scm.deliveries.create', onClick: () => { const nonExp = ready.filter((x) => !x.so.export); if (ready.length === 1 && nonExp.length === 1) createDn(nonExp[0].so.id); else { const c = document.querySelector('.sto-ready'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } }),
        tile({ icon: 'star', label: 'تحويل لصالة العرض', sub: 'عينات من المنتج التام', perm: 'scm.transfers.create', onClick: () => (ERP.scm && ERP.scm.transferModal ? ERP.scm.transferModal({ from: 'W-01', to: 'W-04', kind: 'showroom' }) : SA.nav('scm/transfers')) })),
      kpis([
        U.kpi({ label: 'اتسلم من الجودة النهارده', value: fmt.num(recToday.length), sub: recToday.length ? fmt.num(sum(recToday, (r) => r.receivedQty || 0)) + ' وحدة دخلت ' + FG : 'لسه مفيش استلام', icon: 'checkcircle', href: '#/scm/fg-receipts' }),
        U.kpi({ label: 'أذون تسليم اليوم وبكرة', value: fmt.num(due.length), sub: open.length - due.length > 0 ? (open.length - due.length) + ' إذن بعد كده' : 'مخطط للتحميل', icon: 'clipboard', tone: due.some((d) => dDiff(d.plannedDate) < 0) ? 'danger' : null, href: canRoute('scm/deliveries') ? '#/scm/deliveries' : null }),
        U.kpi({ label: 'في الطريق للعملاء', value: fmt.num(moving.length), sub: 'خرجت من المصنع', icon: 'truck', href: canRoute('scm/deliveries') ? '#/scm/deliveries?status=dispatched' : null }),
        U.kpi({ label: 'أصناف تامة تحت حد الطلب', value: fmt.num(lowFg.length), sub: lowFg.slice(0, 1).map((i) => i.name).join('') || 'كله تمام', icon: 'alert', tone: lowFg.length ? 'warning' : 'success', href: canRoute('scm/stock') ? '#/scm/stock?kind=fg&below=1' : null }),
        U.kpi({ label: 'منتج تام في الحجر', value: fmt.num(qrtN), sub: 'بانتظار قرار الجودة', icon: 'shield', tone: qrtN ? 'warning' : null, href: canRoute('scm/transfers') ? '#/scm/transfers?tab=quarantine' : null })]),
      h('div.sto-split', {},
        h('div.sto-col', {},
          SA.card({ title: 'استلام الإنتاج التام من الجودة', tags: h('span.sap-count', {}, fgrs.length), actions: [go('كل أذون الاستلام', 'scm/fg-receipts', 'list')].filter(Boolean) },
            fgrs.length ? h('div.sto-q', {}, fgrs.slice(0, 4).map(fgrCard)) : SA.empty({ icon: 'checkcircle', title: 'مفيش إنتاج مستني الاستلام', text: 'أول ما الفحص النهائي يعدّي على أمر تشغيل، هيوصلك إذن استلام هنا بالعدد واللوط.' }), more(fgrs.length, 4, 'scm/fg-receipts')),
          h('div.sto-dns', {}, SA.card({ title: 'أذون تسليم للتحميل والخروج', tags: h('span.sap-count', {}, open.length), actions: [go('تخطيط الرحلات', 'scm/dispatch', 'route')].filter(Boolean) },
            open.length ? h('div.sto-q', {}, open.slice(0, 4).map(dnCard)) : SA.empty({ icon: 'truck', title: 'مفيش أذون تسليم مفتوحة' }), more(open.length, 4, 'scm/deliveries'))),
          h('div.sto-ready', {}, readyCard(ready, partialN))),
        h('div.sto-col', {}, fgAlertCard(), transitCard(moving), movesCard(OUT_WH))));
  }

  function renderDesk(root, ctx) {
    ctx.setCrumbs([{ label: 'المخازن' }, { label: 'مكتب أمين المخزن' }]);
    const ds = desks();
    if (!ds.inb && !ds.out) { root.appendChild(SA.empty({ icon: 'inbox', title: 'مفيش مخزن مسند لحسابك', text: 'اطلب من مدير المخازن يحدد مخازنك (الخامات أو المنتج التام).' })); return undefined; }
    const ok = (k) => (k === 'in' ? ds.inb : ds.out);
    let sel = ctx.params.desk === 'out' || ctx.params.desk === 'in' ? ctx.params.desk : memo.desk; if (!sel || !ok(sel)) sel = ds.inb ? 'in' : 'out';
    const PATHS = ['issueRequests', 'fgReceipts', 'purchaseOrders', 'grns', 'stock', 'deliveries', 'salesOrders', 'scrapSales', 'scrapOps', 'vehicles', 'purchaseRequisitions'];
    const build = () => {
      const tabs = ds.inb && ds.out ? SA.tabs({ label: 'المكتب', tabs: [{ id: 'in', label: 'مخزن الخامات — الوارد والصرف', icon: 'inbox', badge: openMirs().length || null }, { id: 'out', label: 'مخزن المنتج التام — الاستلام والتسليم', icon: 'truck', badge: openFgrs().length || null }], active: sel,
        onChange: (id) => { sel = id; memo.desk = id; try { history.replaceState(null, '', '#/scm/desk?desk=' + id); } catch (e) { /* noop */ } rerun(); } }) : null;
      return h('div.sto-desk', {}, tabs ? h('div.sto-tabs', {}, tabs.el) : null, sel === 'in' ? inboundDesk() : outboundDesk());
    };
    let off = SA.live(root, build, PATHS);
    function rerun() { off(); off = SA.live(root, build, PATHS); }
    return () => off();
  }

  /* ═════════════ 2. scm-issues ═════════════ */
  function renderIssues(root, ctx) {
    if (ctx.path[0]) return renderMir(root, ctx, ctx.path[0]);
    ctx.setCrumbs([{ label: 'المخازن' }, { label: 'أذون صرف الخامات للإنتاج' }]);
    const k = keep('issues');
    if (ctx.params.status) k.initial.filters = Object.assign({}, k.initial.filters, { status: ctx.params.status });
    if (ctx.params.q) k.initial.q = ctx.params.q;
    const ordered = () => get('issueRequests').slice().sort((a, b) => {
      const oa = MIR_OPEN.indexOf(a.status) >= 0 ? 0 : 1, ob = MIR_OPEN.indexOf(b.status) >= 0 ? 0 : 1; if (oa !== ob) return oa - ob;
      if (!oa) return prio(a) - prio(b) || String(a.requestedAt || '').localeCompare(String(b.requestedAt || ''));
      return String(b.issuedAt || b.requestedAt || '').localeCompare(String(a.issuedAt || a.requestedAt || ''));
    });
    const build = () => {
      const all = get('issueRequests'); const open = openMirs(); const td = today();
      const issuedToday = all.filter((m) => m.issuedAt && localDay(m.issuedAt) === td);
      const d30 = all.filter((m) => m.status === 'issued' && m.issuedAt && ERP.daysBetween(localDay(m.issuedAt), td) <= 30);
      const reg30 = sum(d30, (m) => m.regKg || 0); const save30 = sum(d30, regSaving); const shortN = open.filter((m) => mirShort(m).length).length;
      const cols = [
        { key: 'id', label: 'الإذن', sort: true, render: (m) => h('span.sto-cell', {}, h('a.erp-doc.num', { href: '#/scm/issues/' + encodeURIComponent(m.id) }, m.id), h('small', {}, SA.fmt.rel(m.requestedAt))) },
        { key: 'item', label: 'المنتج', sort: true, value: (m) => ERP.itemName(m.itemId), render: (m) => h('span.sto-cell', {}, U.itemCell(m.itemId), h('small', {}, fmt.num(m.qtyUnits) + ' ' + uomL(m.itemId) + (m.lot ? ' · ' + m.lot : ''))) },
        { key: 'woId', label: 'أمر التشغيل', sort: true, render: (m) => { const so = soOf(m.soId); return h('span.sto-cell', {}, L(m.woId), so ? h('small', {}, so.id + ' · ' + ERP.customerName(so.customerId)) : h('small', {}, 'للمخزون')); } },
        { key: 'formulas', label: 'الخلطات', render: (m) => h('span.sto-cell', {}, h('span', {}, (m.formulas || []).map((f, i) => [i ? ' + ' : '', L(f.formulaId)])), h('small', {}, fmt.num(m.compoundKg, 0) + ' كجم' + (m.regKg ? ' · مطحون ' + fmt.num(m.regKg) : ''))) },
        { key: 'lines', label: 'الأصناف', sort: true, value: (m) => m.lines.length, render: (m) => { const sh = MIR_OPEN.indexOf(m.status) >= 0 ? mirShort(m).length : 0; return h('span.sto-cell', {}, h('b.num', {}, m.lines.length + ' صنف'), sh ? h('small', {}, tag('نقص ' + sh, 'danger')) : h('small', {}, groupLines(m).length + ' محطات')); } },
        { key: 'status', label: 'الحالة', sort: true, value: (m) => (MIR_OPEN.indexOf(m.status) >= 0 ? '0' : '1') + m.status, render: (m) => h('span.sto-cell', {}, U.status('mir', m.status), h('span', {}, prioTags(m))) },
        { key: 'issuedAt', label: 'الصرف', sort: true, render: (m) => (m.issuedAt ? h('span.sto-cell', {}, h('b', {}, fmt.date(m.issuedAt)), h('small', {}, userName(m.issuedBy))) : h('span.sto-muted', {}, '—')) }
      ];
      if (canCost()) cols.push({ key: 'value', label: 'قيمة الصرف', sort: true, value: (m) => m.value || 0, render: (m) => (m.value ? U.money(m.value) : h('span.sto-muted', {}, '—')) });
      const table = SA.table({ caption: 'أذون صرف الخامات', columns: cols, rows: ordered,
        search: { placeholder: 'بحث برقم الإذن أو أمر التشغيل أو المنتج أو العميل أو اللوط…', keys: ['id', 'woId', 'soId', 'lot', (m) => ERP.itemName(m.itemId), (m) => (soOf(m.soId) ? ERP.customerName(soOf(m.soId).customerId) : '')] },
        filters: [{ key: 'status', label: 'الحالة', options: Object.keys(C.status.mir).map((x) => [x, C.status.mir[x][0]]) },
          { key: 'family', label: 'المنتج', options: [['door', 'أبواب'], ['clad', 'تجاليد'], ['foam', 'فوم بورد']], test: (m, v) => (item(m.itemId) || {}).family === v },
          { key: 'prio', label: 'الأولوية', options: [['export', 'تصدير'], ['high', 'أولوية عالية'], ['normal', 'عادي']], test: (m, v) => (v === 'export' ? isExport(m) : v === 'high' ? m.priority === 'high' : !isExport(m) && m.priority !== 'high') }],
        initial: k.initial, onChange: k.onChange, pageSize: 12, onRowClick: (m) => SA.nav('scm/issues/' + m.id),
        rowActions: (m) => [{ label: 'فتح الإذن', icon: 'eye', onClick: () => SA.nav('scm/issues/' + m.id) }, { label: 'طباعة إذن الصرف', icon: 'doc', onClick: () => printPreview(m.id) },
          MIR_OPEN.indexOf(m.status) >= 0 ? { label: 'صرف الكل', icon: 'check', disabled: SA.can('scm.issues.issue') ? false : 'ليست من صلاحياتك (scm.issues.issue)', onClick: () => issueAll(m.id) } : null].filter(Boolean),
        empty: { icon: 'clipboard', title: 'لا توجد أذون صرف', text: 'إذن الصرف بيتعمل تلقائيًا لما الإنتاج يطلق أمر تشغيل.' } });
      return h('div.sto-page', {},
        SA.pageHead({ title: 'أذون صرف الخامات للإنتاج', desc: 'كل أمر تشغيل بيتطلق بيعمل «إذن صرف للخلاطة» حسب الخلطة الكيميائية ومكونات المنتج — أمين مخزن الخامات بيصرفه، والمخزون والقيد بيتحركوا وقت الصرف بس.', actions: [go('مكتب أمين المخزن', 'scm/desk', 'inbox', 'ghost', 'lg')].filter(Boolean) }),
        kpis([
          U.kpi({ label: 'بانتظار الصرف', value: fmt.num(open.length), sub: open.filter((m) => isExport(m) || m.priority === 'high').length + ' تصدير / عاجل', icon: 'inbox', tone: open.length ? 'warning' : 'success', href: '#/scm/issues?status=pending' }),
          U.kpi({ label: 'أذون عليها نقص', value: fmt.num(shortN), sub: shortN ? 'يتصرف المتاح والباقي جزئي' : 'كل الأصناف متاحة', icon: 'alert', tone: shortN ? 'danger' : null }),
          U.kpi({ label: 'اتصرف النهارده', value: fmt.num(issuedToday.length), sub: fmt.num(sum(issuedToday, (m) => m.compoundKg || 0), 0) + ' كجم خلطة', icon: 'clipboard', href: '#/scm/issues?status=issued' }),
          U.kpi({ label: 'مطحون رجع الخلاطة (30 يوم)', value: fmt.num(reg30, 0) + ' كجم', sub: canCost() ? 'توفير ' + fmt.money(save30) + ' مقابل PVC جديد' : 'بدل خامة PVC جديدة', icon: 'recycle', tone: 'success', href: canRoute('mfg/scrap') ? '#/mfg/scrap' : null })]),
        SA.card({ flush: true }, table.el));
    };
    return SA.live(root, build, ['issueRequests', 'stock', 'workOrders']);
  }

  function renderMir(root, ctx, id) {
    ctx.setCrumbs([{ label: 'المخازن' }, { label: 'أذون صرف الخامات', href: '#/scm/issues' }, { label: id }]);
    const build = () => {
      const m = ERP.find('issueRequests', id);
      if (!m) return h('div', {}, SA.pageHead({ title: 'إذن الصرف غير موجود', back: { label: 'أذون الصرف', href: '#/scm/issues' } }), SA.empty({ icon: 'search', title: 'لم نجد ' + id, text: 'ربما الرقم غير صحيح أو تمت إعادة البيانات التجريبية.', action: { label: 'كل الأذون', icon: 'list', onClick: () => SA.nav('scm/issues') } }));
      const wo = woOf(m.woId) || {}; const so = soOf(m.soId); const isOpen = MIR_OPEN.indexOf(m.status) >= 0; const short = isOpen ? mirShort(m) : []; const groups = groupLines(m); const ln = wo.lineId ? ERP.line(wo.lineId) : null;
      const actions = [];
      if (isOpen) actions.push(SA.btn({ label: m.status === 'partial' ? 'صرف الباقي' : 'صرف الكل', icon: 'check', size: 'lg', perm: 'scm.issues.issue', onClick: () => issueAll(m.id) }), SA.btn({ label: 'صرف جزئي', icon: 'edit', kind: 'ghost', size: 'lg', perm: 'scm.issues.issue', onClick: () => partialModal(m.id) }));
      actions.push(SA.btn({ label: 'طباعة إذن الصرف', icon: 'doc', kind: 'ghost', size: isOpen ? null : 'lg', onClick: () => printPreview(m.id) }));
      const banner = !isOpen ? SA.alert('success', h('b', {}, 'اتصرفت الخامات. '), 'أمر التشغيل ', L(m.woId), ' ', U.status('wo', wo.status), wo.issued ? ' — الخلاطة تقدر تبدأ، والإنتاج اتبلّغ.' : '')
        : short.length ? SA.alert('danger', h('b', {}, 'نقص في ' + short.length + ' صنف. '), short.map((l) => ERP.itemName(l.itemId) + ' (ناقص ' + qtyI(shortOf(l), l.itemId) + ')').join('، ') + ' — «صرف الكل» هيصرف المتاح والإذن يفضل «صرف جزئي» لحد ما الباقي يوصل.', SA.can('scm.requisitions.create') && ERP.scm && ERP.scm.newPRQ ? h('button.sap-linkbtn', { type: 'button', onclick: () => ERP.scm.newPRQ({ itemId: short[0].itemId, reason: 'نقص لإذن الصرف ' + m.id }) }, ' اعمل طلب شراء') : null)
          : SA.alert('info', h('b', {}, m.status === 'partial' ? 'صرف جزئي — ' : 'كل الأصناف متاحة. '), 'جهّز الكميات لكل محطة واضغط «' + (m.status === 'partial' ? 'صرف الباقي' : 'صرف الكل') + '» — الخامات بتخرج من المخزن والقيد بيتسجل والإنتاج بيتبلّغ إن الخلاطة تبدأ.');
      const info = h('div.sto-info', {},
        [['أمر التشغيل', h('span', {}, L(m.woId), ' ', wo.status ? U.status('wo', wo.status) : null)], ['المنتج', U.itemCell(m.itemId)], ['الكمية', h('b.num', {}, fmt.num(m.qtyUnits) + ' ' + uomL(m.itemId))], ['اللوط', h('b.num', {}, m.lot || '—')],
          ['أمر البيع', so ? h('span', {}, L(so.id), ' — ' + ERP.customerName(so.customerId) + ' ', so.export ? exportTag() : null) : 'إنتاج للمخزون'], ['خط الإنتاج', ln ? h('span', {}, L(ln.id, ln.name)) : '—'],
          ['طلب الصرف', h('span', {}, userName(m.requestedBy) + ' · ', h('span.num', {}, SA.fmt.dt(m.requestedAt)))], ['الصرف', m.issuedAt ? h('span', {}, userName(m.issuedBy) + ' · ', h('span.num', {}, SA.fmt.dt(m.issuedAt))) : 'لسه'],
          ['وزن الخلطة', h('b.num', {}, fmt.num(m.compoundKg, 1) + ' كجم')], [isOpen ? 'قيمة الخامات (مخططة)' : 'قيمة الصرف', U.cost(isOpen ? plannedValue(m) : m.value || plannedValue(m))]]
          .map((p) => h('div', {}, h('span.sto-k', {}, p[0]), p[1])));
      const maxPct = uniq((m.formulas || []).map((f) => Math.round((f.regMaxPct || 0) * 100) + '%')).join(' / ');
      const regBox = m.regKg ? h('div.sto-reg', {}, h('span.sto-reg-ico', {}, SA.icon('recycle')),
        h('div', {}, h('b', {}, 'مطحون من هوالك المصنع بدل خامة جديدة'), h('p', {}, fmt.num(m.regKg) + ' كجم مطحون من ' + whName(W7) + ' بيدخل الخلطة مكان نفس الوزن من PVC جديد — في حدود ' + (maxPct || '—') + ' من وزن الخلطة حسب التركيبة المعتمدة.')),
        h('div.sto-reg-v', {}, h('strong.num', {}, fmt.num(m.regKg) + ' كجم'), h('small', {}, 'التوفير مقابل PVC جديد: ', U.cost(regSaving(m))), U.demo('حسب التكلفة المعيارية'))) : null;
      const fms = (m.formulas || []).map((f) => { const fm = FX.formula(f.formulaId) || {}; const lines = (fm.lines || []).slice().sort((a, b) => b.pct - a.pct);
        return h('div.sto-fm-c', {}, h('div.sto-fm-h', {}, h('span.sto-fm-ico', {}, SA.icon('mixer')), h('div', {}, h('b', {}, L(f.formulaId), ' — ' + (fm.name || '')), h('small', {}, (FX.TRACKS[f.track] || '') + ' · ' + f.batches + ' خلطة × ' + (fm.batchKg || 250) + ' كجم · خلط ' + (fm.mixMin || 12) + ' دقيقة · مطحون حتى ' + Math.round((f.regMaxPct || 0) * 100) + '%')), h('b.sto-fm-kg.num', {}, fmt.num(f.kg, 0) + ' كجم')),
          lines.length ? h('div.sto-mix', { role: 'img', 'aria-label': 'تركيبة ' + f.formulaId }, lines.map((l) => h('i', { style: { width: l.pct + '%', background: MIXC[l.itemId] || '#8a8a8a' }, title: ERP.itemName(l.itemId) + ' ' + l.pct + '%' }))) : null,
          lines.length ? h('ul.sto-mixl', {}, lines.map((l) => h('li' + (l.itemId === FX.REG ? '.is-reg' : ''), {}, h('i', { style: { background: MIXC[l.itemId] || '#8a8a8a' } }), h('span', { title: ERP.itemName(l.itemId) }, ERP.itemName(l.itemId)), h('b', {}, l.pct + '% · ' + fmt.num((f.kg * l.pct) / 100, 1) + ' كجم')))) : h('small.sto-muted', {}, 'تفاصيل الخلطة غير متاحة')); });
      const lineRow = (l) => { const rem = remOf(l), av = availOf(l), sh = isOpen ? shortOf(l) : 0; const reg = l.itemId === FX.REG;
        return h('tr' + (reg ? '.sto-row-reg' : sh > 0 ? '.sto-row-short' : ''), {}, h('td', {}, U.itemCell(l.itemId), reg ? h('small.sto-regnote', {}, SA.icon('recycle', 'icon-sm'), 'مطحون من هوالك المصنع بدل خامة جديدة') : null),
          h('td.num', { 'data-label': 'المطلوب' }, qtyI(l.qty, l.itemId)), h('td.num', { 'data-label': 'المنصرف' }, l.issuedQty ? qtyI(l.issuedQty, l.itemId) : '—'), h('td.num', { 'data-label': 'الباقي' }, rem > 0 ? h('b', {}, qtyI(rem, l.itemId)) : '—'),
          h('td', { 'data-label': 'المتاح في المخزن' }, h('span.sto-cell', {}, h('b.num', {}, qtyI(av, l.itemId)), h('small', {}, whName(l.whId)))),
          h('td', { 'data-label': 'الحالة' }, rem <= 0 ? SA.chip('تم الصرف', 'success') : sh > 0 ? SA.chip('نقص ' + fmt.num(sh), 'danger') : SA.chip('متاح', 'info'))); };
      const stages = groups.map((g, gi) => { const kg = g.lines.filter((l) => uomOf(l.itemId) === 'kg').reduce((s, l) => s + l.qty, 0);
        return h('section.sto-stage', {}, h('div.sto-stage-h', {}, h('span.sto-stage-n', {}, gi + 1), h('div', {}, h('b', {}, g.name), h('small', {}, DEST_HINT[g.stageId] || '')), h('span.sto-grow'), kg && g.stageId === 'ST-MIX' ? tag(fmt.num(kg, 0) + ' كجم', 'info') : null, tag(g.lines.length + ' صنف')),
          h('div.table-wrap', {}, h('table.table.sto-tbl.sto-stbl', {}, h('thead', {}, h('tr', {}, ['الصنف', 'المطلوب', 'المنصرف', 'الباقي', 'المتاح في المخزن', 'الحالة'].map((t) => h('th', {}, t)))), h('tbody', {}, g.lines.map(lineRow))))); });
      const ev = [{ at: m.requestedAt, t: 'طلب صرف عند إطلاق أمر التشغيل', s: userName(m.requestedBy) }];
      get('audit').filter((a) => a.code === 'MIR.ISSUED' && a.target && a.target.id === m.id).forEach((a) => ev.push({ at: a.ts, t: a.after && a.after.status === 'partial' ? 'صرف جزئي' : 'تم الصرف', s: (a.actor || {}).name || '', ok: true }));
      if (ev.length === 1 && m.issuedAt) ev.push({ at: m.issuedAt, t: 'تم الصرف', s: userName(m.issuedBy), ok: true });
      if (wo.actualStart && m.issuedAt && wo.actualStart >= m.issuedAt) ev.push({ at: wo.actualStart, t: 'بدأ التشغيل على الخلاطة', s: wo.id, ok: true });
      ev.sort((a, b) => String(a.at).localeCompare(String(b.at)));
      const mv = get('stockMoves').filter((x) => x.ref && (x.ref.id === m.id || (x.ref.type === 'work_order' && x.ref.id === m.woId && x.type === 'issue')));
      return h('div.sto-page', {},
        SA.pageHead({ title: 'إذن صرف للخلاطة ' + m.id, back: { label: 'أذون الصرف', href: '#/scm/issues' }, tags: [U.status('mir', m.status)].concat(prioTags(m)), desc: ERP.itemName(m.itemId) + ' × ' + fmt.num(m.qtyUnits) + ' ' + uomL(m.itemId) + ' — ' + m.lines.length + ' صنف لـ ' + groups.length + ' محطات', actions }),
        banner, h('div', { style: { height: '12px' } }), info, regBox,
        SA.card({ title: 'الخلطات الكيميائية', tags: h('span.sap-count', {}, (m.formulas || []).length), actions: [U.demo('نسب تجريبية لحد اعتماد تركيبات المصنع')] }, h('div.sto-fm', {}, fms.length ? fms : SA.empty({ icon: 'mixer', title: 'بدون خلطة' }))),
        h('div', { style: { height: '16px' } }),
        SA.card({ title: 'الأصناف حسب المحطة اللي هتستلمها', tags: h('span.sap-count', {}, m.lines.length) }, stages),
        h('div', { style: { height: '16px' } }),
        U.grid(2,
          SA.card({ title: 'سجل الإذن' }, h('ol.sto-tl', {}, ev.map((x) => h('li' + (x.ok ? '.is-ok' : ''), {}, h('i'), h('div', {}, h('b', {}, x.t), h('small.num', {}, SA.fmt.dt(x.at)), x.s ? h('small', {}, x.s) : null))))),
          SA.card({ title: 'حركات المخزون', tags: h('span.sap-count', {}, mv.length) }, mv.length ? h('ul.sto-moves', {}, mv.slice(0, 12).map((x) => h('li', {}, h('span.sto-mv-q.is-out', { dir: 'ltr' }, fmt.num(r2(x.qty), 1)), h('div', {}, h('b', {}, ERP.itemName(x.itemId)), h('small', {}, whName(x.whId) + ' · ' + SA.fmt.rel(x.ts) + (x.by ? ' · ' + userName(x.by) : '')))))) : SA.empty({ icon: 'activity', title: 'لسه مفيش حركات', text: 'الخامات بتخرج من المخزن وقت الصرف بس.' }))));
    };
    return SA.live(root, build, ['issueRequests', 'stock', 'workOrders']);
  }

  /* ═════════════ 3. scm-fgreceipts ═════════════ */
  function openFgr(id) {
    const r0 = ERP.find('fgReceipts', id); if (!r0) return SA.toast('لم نجد ' + id, 'warn');
    const body = h('div'); const footHost = h('div.sto-qbtns', { style: { width: '100%' } });
    const d = SA.drawer({ title: 'إذن استلام إنتاج تام ' + id, subtitle: ERP.itemName(r0.itemId), size: 'md', body, foot: [footHost] });
    const build = () => {
      const r = ERP.find('fgReceipts', id); if (!r) return SA.empty({ icon: 'search', title: 'الإذن غير موجود' });
      const wo = woOf(r.woId) || {}; const so = soOf(r.soId); const qc = qcOf(r.qcId); const diff = r.status === 'received' && r.receivedQty != null && r.receivedQty < r.qty;
      SA.clear(footHost); footHost.append(r.status === 'pending' ? SA.btn({ label: 'استلام وعدّ', icon: 'checkcircle', size: 'lg', perm: 'scm.fgreceipts.receive', onClick: () => receiveFgModal(id) }) : null, h('span.sto-grow'), h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close(null) }, 'إغلاق'));
      return h('div', {},
        h('div.sto-dhead', {}, U.itemCell(r.itemId), h('div.sto-big-w', {}, h('b.sto-big.num', {}, fmt.num(r.status === 'received' && r.receivedQty != null ? r.receivedQty : r.qty)), h('small', {}, uomL(r.itemId))), U.status('fgr', r.status)),
        SA.kv([['أمر التشغيل', h('span', {}, L(r.woId), ' ', wo.status ? U.status('wo', wo.status) : null)],
          ['شهادة الفحص النهائي', qc ? h('span', {}, L(qc.id), ' ', U.status('qc', qc.result), h('small.sto-muted', {}, ' · ' + userName(qc.inspectorId) + (qc.at ? ' · ' + SA.fmt.dt(qc.at) : '') + ' · عينة ' + (qc.sample || '—') + ' من ' + fmt.num(qc.qty))) : L(r.qcId)],
          ['أمر البيع', so ? h('span', {}, L(so.id), ' — ' + ERP.customerName(so.customerId) + ' ', U.status('so', so.status), so.export ? [' ', exportTag()] : null) : 'إنتاج للمخزون'],
          ['اللوط', h('b.num', {}, r.lot || '—')], ['الكمية المحوّلة', fmt.num(r.qty) + ' ' + uomL(r.itemId)], ['وصل من الجودة', userName(r.createdBy) + ' · ' + SA.fmt.dt(r.createdAt)],
          ['رصيد ' + whName(FG), h('span.num', {}, fmt.num(K.qty(r.itemId, FG)) + ' · محجوز ' + fmt.num(K.reserved(r.itemId, FG)) + ' · متاح ' + fmt.num(K.available(r.itemId, FG)))]]),
        r.status === 'received' ? h('div.sto-dsec', {}, h('h3', {}, 'الاستلام في المخزن'), SA.kv([['استلم', userName(r.receivedBy)], ['الوقت', SA.fmt.dt(r.receivedAt)], ['العدد المستلم', h('span', {}, fmt.num(r.receivedQty) + ' ' + uomL(r.itemId), diff ? [' ', tag('فرق ' + fmt.num(r.qty - r.receivedQty), 'danger')] : [' ', tag('مطابق', 'success')])], r.note ? ['ملاحظة', r.note] : null]),
          h('div', { style: { marginTop: '12px' } }, soOutcome(so))) : h('div.sto-dsec', {}, SA.alert('warning', h('b', {}, 'بانتظار العدّ والاستلام. '), 'الكمية لسه محسوبة «تحت التشغيل» ومش داخلة رصيد ' + whName(FG) + ' — ' + (so ? 'وأمر البيع ' + so.id + ' مش هيتحجزله غير بعد الاستلام.' : 'ومش متاحة للبيع غير بعد الاستلام.'))),
        so ? h('div.sto-dsec', {}, h('h3', {}, 'دورة المستند — ' + so.id), U.chain(so.id)) : null);
    };
    const off = SA.live(body, build, ['fgReceipts', 'salesOrders', 'stock', 'deliveries']);
    d.closed.then(() => off());
    return d;
  }
  function renderFgr(root, ctx) {
    const pid = ctx.path[0] || (/^FGR-/.test(ctx.params.q || '') ? ctx.params.q : null);
    ctx.setCrumbs([{ label: 'المخازن' }, { label: 'استلام الإنتاج التام', href: pid ? '#/scm/fg-receipts' : null }].concat(pid ? [{ label: pid }] : []));
    const k = keep('fgr'); if (ctx.params.q) k.initial.q = ctx.params.q; else if (/^FGR-/.test(k.initial.q || '')) k.initial.q = '';
    if (ctx.params.status) k.initial.filters = Object.assign({}, k.initial.filters, { status: ctx.params.status });
    const ordered = () => get('fgReceipts').slice().sort((a, b) => { const oa = a.status === 'pending' ? 0 : 1, ob = b.status === 'pending' ? 0 : 1; if (oa !== ob) return oa - ob; return oa ? String(b.receivedAt || b.createdAt || '').localeCompare(String(a.receivedAt || a.createdAt || '')) : String(a.createdAt || '').localeCompare(String(b.createdAt || '')); });
    const build = () => {
      const all = get('fgReceipts'); const pend = openFgrs(); const td = today();
      const recToday = all.filter((r) => r.status === 'received' && localDay(r.receivedAt) === td); const rec7 = all.filter((r) => r.status === 'received' && r.receivedAt && ERP.daysBetween(localDay(r.receivedAt), td) <= 6);
      const diffs = all.filter((r) => r.status === 'received' && r.receivedQty != null && r.receivedQty < r.qty);
      const table = SA.table({ caption: 'أذون استلام الإنتاج التام',
        columns: [
          { key: 'id', label: 'الإذن', sort: true, render: (r) => h('span.sto-cell', {}, h('b.num', {}, r.id), h('small', {}, SA.fmt.rel(r.createdAt))) },
          { key: 'item', label: 'المنتج', sort: true, value: (r) => ERP.itemName(r.itemId), render: (r) => U.itemCell(r.itemId) },
          { key: 'qty', label: 'الكمية', sort: true, render: (r) => h('span.sto-cell', {}, h('b.num', {}, fmt.num(r.qty) + ' ' + uomL(r.itemId)), r.status === 'received' && r.receivedQty != null && r.receivedQty < r.qty ? h('small', {}, tag('اتسلم ' + fmt.num(r.receivedQty), 'danger')) : null) },
          { key: 'woId', label: 'أمر التشغيل', sort: true, render: (r) => h('span.sto-cell', {}, L(r.woId), r.lot ? h('small.num', {}, r.lot) : null) },
          { key: 'qcId', label: 'الفحص النهائي', render: (r) => { const qc = qcOf(r.qcId); return h('span.sto-cell', {}, L(r.qcId), qc ? h('small', {}, U.status('qc', qc.result)) : null); } },
          { key: 'soId', label: 'أمر البيع', sort: true, value: (r) => r.soId || '', render: (r) => { const so = soOf(r.soId); return so ? h('span.sto-cell', {}, L(so.id), h('small', {}, ERP.customerName(so.customerId))) : h('span.sto-muted', {}, 'للمخزون'); } },
          { key: 'status', label: 'الحالة', sort: true, render: (r) => U.status('fgr', r.status) },
          { key: 'receivedAt', label: 'الاستلام', sort: true, render: (r) => (r.receivedAt ? h('span.sto-cell', {}, h('b', {}, fmt.date(r.receivedAt)), h('small', {}, userName(r.receivedBy))) : h('span.sto-muted', {}, '—')) }],
        rows: ordered,
        search: { placeholder: 'بحث برقم الإذن أو أمر التشغيل أو المنتج أو اللوط أو أمر البيع…', keys: ['id', 'woId', 'qcId', 'soId', 'lot', (r) => ERP.itemName(r.itemId)] },
        filters: [{ key: 'status', label: 'الحالة', options: Object.keys(C.status.fgr).map((x) => [x, C.status.fgr[x][0]]) }, { key: 'family', label: 'المنتج', options: [['door', 'أبواب'], ['clad', 'تجاليد'], ['foam', 'فوم بورد']], test: (r, v) => (item(r.itemId) || {}).family === v },
          { key: 'dest', label: 'الوجهة', options: [['so', 'لأمر بيع'], ['stock', 'للمخزون']], test: (r, v) => (v === 'so' ? !!r.soId : !r.soId) }],
        initial: k.initial, onChange: k.onChange, pageSize: 12, onRowClick: (r) => openFgr(r.id),
        rowActions: (r) => [{ label: 'التفاصيل', icon: 'eye', onClick: () => openFgr(r.id) }, r.status === 'pending' ? { label: 'استلام وعدّ', icon: 'checkcircle', disabled: SA.can('scm.fgreceipts.receive') ? false : 'ليست من صلاحياتك (scm.fgreceipts.receive)', onClick: () => receiveFgModal(r.id) } : null].filter(Boolean),
        empty: { icon: 'checkcircle', title: 'لا توجد أذون استلام', text: 'إذن الاستلام بيتعمل تلقائيًا لما الفحص النهائي يعدّي.' } });
      return h('div.sto-page', {},
        SA.pageHead({ title: 'استلام الإنتاج التام', desc: 'بعد ما الفحص النهائي يعدّي، الجودة والتغليف بيحوّلوا الإنتاج بإذن استلام — أمين مخزن المنتج التام بيعدّه ويستلمه في ' + whName(FG) + '، ووقتها بس يدخل الرصيد ويتحجز لأمر البيع.',
          actions: [pend.length ? SA.btn({ label: pend.length === 1 ? 'استلام ' + pend[0].id : 'استلام أقدم إذن', icon: 'checkcircle', size: 'lg', perm: 'scm.fgreceipts.receive', onClick: () => receiveFgModal(pend[0].id) }) : null, go('مكتب أمين المخزن', 'scm/desk?desk=out', 'inbox', 'ghost', 'lg')].filter(Boolean) }),
        kpis([
          U.kpi({ label: 'بانتظار الاستلام', value: fmt.num(pend.length), sub: fmt.num(sum(pend, (r) => r.qty)) + ' وحدة من الجودة', icon: 'inbox', tone: pend.length ? 'warning' : 'success', href: '#/scm/fg-receipts?status=pending' }),
          U.kpi({ label: 'اتسلم النهارده', value: fmt.num(recToday.length), sub: fmt.num(sum(recToday, (r) => r.receivedQty || 0)) + ' وحدة', icon: 'checkcircle', href: '#/scm/fg-receipts?status=received' }),
          U.kpi({ label: 'آخر 7 أيام', value: fmt.num(rec7.length) + ' إذن', sub: fmt.num(sum(rec7, (r) => r.receivedQty || 0)) + ' وحدة دخلت المخزن', icon: 'warehouse' }),
          U.kpi({ label: 'فروق عدّ', value: fmt.num(diffs.length), sub: diffs.length ? fmt.num(sum(diffs, (r) => r.qty - r.receivedQty)) + ' وحدة أقل من المحوّل' : 'كل الاستلامات مطابقة', icon: 'alert', tone: diffs.length ? 'danger' : 'success' })]),
        SA.card({ flush: true }, table.el));
    };
    const off = SA.live(root, build, ['fgReceipts', 'salesOrders', 'qcInspections']);
    if (pid && ERP.find('fgReceipts', pid)) setTimeout(() => { if (SA.route && SA.route.module && SA.route.module.id === 'scm-fgreceipts') openFgr(pid); }, 60);
    return off;
  }

  /* ═════════════ registration (ids / routes / groups / perms from erp-factory.js) ═════════════ */
  const deskBadge = () => { if (!SA.session.user) return null; const d = desks(); const n = (d.inb ? openMirs().length : 0) + (d.out ? openFgrs().length : 0); return n || null; };
  SA.register({ id: 'scm-desk', app: 'scm', group: 'scm-dash', title: 'مكتب أمين المخزن', icon: 'inbox', route: 'scm/desk', perm: 'scm.desk.view', order: 2, moduleKey: 'inventory', desc: 'مهام أمين المخزن اليوم: صرف للخلاطة · استلام · تسليم', badge: deskBadge, render: renderDesk });
  SA.register({ id: 'scm-fgreceipts', app: 'scm', group: 'scm-inv', title: 'استلام الإنتاج التام', icon: 'checkcircle', route: 'scm/fg-receipts', perm: 'scm.fgreceipts.view', order: 18, moduleKey: 'inventory', desc: 'العدّ والاستلام من الجودة إلى مخزن المنتج التام', badge: () => openFgrs().length || null, render: renderFgr });
  SA.register({ id: 'scm-issues', app: 'scm', group: 'scm-inv', title: 'أذون صرف الخامات للإنتاج', icon: 'clipboard', route: 'scm/issues', perm: 'scm.issues.view', order: 19, moduleKey: 'inventory', desc: 'إذن صرف للخلاطة حسب الخلطة — لكل أمر تشغيل', badge: () => openMirs().length || null, render: renderIssues });

  if (SA.search && SA.search.register) {
    SA.search.register({ id: 'scm-mir', label: 'أذون صرف الخامات', perm: 'scm.issues.view', query: (q) => (q ? get('issueRequests').filter((m) => (m.id + ' ' + m.woId + ' ' + ERP.itemName(m.itemId)).toLowerCase().indexOf(q) >= 0).slice(0, 5).map((m) => ({ title: 'إذن صرف ' + m.id, sub: m.woId + ' · ' + (C.status.mir[m.status] || [m.status])[0], icon: 'clipboard', route: 'scm/issues/' + m.id })) : []) });
    SA.search.register({ id: 'scm-fgr', label: 'استلام الإنتاج التام', perm: 'scm.fgreceipts.view', query: (q) => (q ? get('fgReceipts').filter((r) => (r.id + ' ' + r.woId + ' ' + ERP.itemName(r.itemId)).toLowerCase().indexOf(q) >= 0).slice(0, 5).map((r) => ({ title: 'إذن استلام ' + r.id, sub: ERP.itemName(r.itemId) + ' × ' + r.qty + ' · ' + (C.status.fgr[r.status] || [r.status])[0], icon: 'checkcircle', route: 'scm/fg-receipts?q=' + r.id })) : []) });
  }
  /* public helpers (other modules may open these actions) */
  ERP.stores = { issueAll, partialModal, printPreview, receiveFgModal, openFgr, createDn, desks };
})();
