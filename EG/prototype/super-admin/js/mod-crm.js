/* EG ERP prototype — mod-crm.js  (المبيعات وCRM — app 'crm'; owned by the CRM agent)
   Screens (ids / routes / perms exactly as erp-core.js ROUTE CONTRACT):
     crm-dashboard crm/dashboard · crm-leads crm/leads[/LD-id] · crm-pipeline crm/pipeline · crm-activities crm/activities
     crm-quotes crm/quotes[/new|/QT-id] · crm-orders crm/orders[/new|/SO-id] · crm-dealer-orders crm/dealer-orders
     crm-customers crm/customers[/C-id] · crm-targets crm/targets · crm-reports crm/reports
   Business actions go through ERP.flow.* (createOrder · submitOrder · confirmOrder · cancelOrder · logCall · createDelivery).
   CRM-owned records (leads, activities, quotations, customer credit/contacts, targets) → SA.store + SA.audit (+ SA.notify).
   Approvals owned here: ERP.onApproval('quotation') — a quote discount above ERP.flow.limits.discountPct → SA.requestApproval(type 'quotation',
     chain R-03 [+ R-02 above gmDiscountPct]); approved → quote 'sent', rejected → 'rejected', changes → 'draft'.
   Scope: rows are filtered by the role scope on 'sales' (SA.scopeFilter: own = the rep's records, team = manager + reports). Roles without a sales scope
     (finance, production, logistics …) are back-office viewers and see all. Costs only via ERP.ui.cost (data.cost.view), margins via data.profit.view.
   Seed hook 'crm': planned activities (today's agenda), approval AP-2131 for QT-2026-0062, a 2nd portal order waiting for the dealer call (with a "no answer" log).
   Public helpers for other modules: ERP.crm = { scopeMode, inScope, myOrders, myCustomers, myLeads, convertLead, callDealer, showOutcome } */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP;
  if (!SA || !ERP || !ERP.flow) return;
  const h = SA.h, st = SA.store, F = ERP.flow, U = ERP.ui, CH = ERP.chart, fm = ERP.fmt;

  /* ═════════════════════════ catalog additions ═════════════════════════ */
  [['QUOTE.UPDATED', 'تعديل عرض سعر', 'info'], ['QUOTE.REJECTED', 'رفض عرض سعر', 'info'], ['QUOTE.DISCOUNT_REQUESTED', 'طلب اعتماد خصم على عرض سعر', 'info'], ['QUOTE.RENEWED', 'تجديد صلاحية عرض سعر', 'info'],
    ['CUSTOMER.CREATED', 'إنشاء عميل', 'medium'], ['CUSTOMER.UPDATED', 'تعديل بيانات عميل', 'medium'], ['TARGET.CHANGED', 'تعديل أهداف المبيعات', 'medium'], ['ACTIVITY.LOGGED', 'تسجيل نشاط مبيعات', 'info'], ['ACTIVITY.DONE', 'إتمام نشاط مبيعات', 'info']]
    .forEach((a) => SA.catalog.addAudit(a[0], a[1], a[2], 'crm'));

  /* ═════════════════════════ styles ═════════════════════════ */
  (function () {
    if (document.querySelector('style[data-mod="crm"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'crm');
    s.textContent = `
.crm-page { display: flex; flex-direction: column; gap: 16px; }
.crm-page > .erp-grid { margin-block: 0; }
.crm-scope { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--eg-navy); background: var(--color-primary-tint); border-radius: 999px; padding: 2px 10px; vertical-align: middle; }
.crm-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.crm-between { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.crm-cell { display: flex; flex-direction: column; line-height: 1.35; min-width: 0; } .crm-cell b { font-weight: 600; font-size: var(--text-dense); } .crm-cell small { color: var(--color-text-muted); font-size: 12px; }
.crm-muted { color: var(--color-text-muted); font-size: 12.5px; }
.crm-late { color: var(--color-danger); font-weight: 700; }
.crm-neg { color: var(--color-danger); }
.crm-rep { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-dense); white-space: nowrap; } .crm-rep .avatar { width: 24px; height: 24px; font-size: 10px; }
.crm-score { display: inline-grid; place-items: center; min-width: 34px; height: 24px; padding-inline: 6px; border-radius: 8px; font: 700 12px var(--font-en); }
.crm-score.is-hot { background: var(--color-danger-tint); color: var(--color-danger); } .crm-score.is-warm { background: var(--color-warning-tint); color: var(--color-warning); } .crm-score.is-cold { background: var(--color-neutral-tint); color: var(--color-text-muted); }
.crm-fam { display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: 6px; background: var(--color-primary-tint); color: var(--eg-navy); white-space: nowrap; }
.crm-fam.is-clad { background: #f4ecdf; color: #7a4f1d; } .crm-fam.is-foam { background: #e8f2ef; color: #1f6b5a; } .crm-fam.is-acc { background: var(--color-neutral-tint); color: var(--color-text-muted); }
.crm-tier { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; font: 800 12px var(--font-en); background: var(--color-neutral-tint); color: var(--color-text-muted); }
.crm-tier.is-a { background: var(--eg-navy); color: #fff; } .crm-tier.is-b { background: var(--color-primary-tint); color: var(--eg-navy); }
.crm-src { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; white-space: nowrap; }
.crm-flag { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; color: var(--color-info); background: var(--color-info-tint); border-radius: 6px; padding: 1px 7px; white-space: nowrap; }
.crm-sla { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; border-radius: 999px; padding: 2px 9px; white-space: nowrap; }
.crm-sla.is-success { background: var(--color-success-tint); color: var(--color-success); } .crm-sla.is-warning { background: var(--color-warning-tint); color: var(--color-warning); } .crm-sla.is-danger { background: var(--color-danger-tint); color: var(--color-danger); }
.crm-prog { display: flex; flex-direction: column; gap: 3px; min-width: 92px; } .crm-prog small { font-size: 11.5px; color: var(--color-text-muted); }
.crm-todo { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.crm-todo li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 2px; border-bottom: 1px solid var(--color-border); }
.crm-todo li:last-child { border-bottom: 0; }
.crm-todo-ico { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; flex: none; background: var(--color-primary-tint); color: var(--eg-navy); }
.crm-todo-ico.is-danger { background: var(--color-danger-tint); color: var(--color-danger); } .crm-todo-ico.is-warning { background: var(--color-warning-tint); color: var(--color-warning); } .crm-todo-ico.is-success { background: var(--color-success-tint); color: var(--color-success); }
.crm-todo-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; } .crm-todo-body b { font-size: var(--text-dense); font-weight: 600; } .crm-todo-body small { color: var(--color-text-muted); font-size: 12px; }
.crm-todo a.crm-todo-cta { flex: none; align-self: center; font-size: 12.5px; font-weight: 700; color: var(--eg-navy); text-decoration: none; padding: 6px 10px; border-radius: 8px; background: var(--color-bg-alt); white-space: nowrap; }
.crm-todo a.crm-todo-cta:hover { background: var(--color-primary-tint); }
.crm-ai { display: flex; flex-direction: column; gap: 10px; }
.crm-board { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(232px, 1fr); gap: 12px; overflow-x: auto; padding-bottom: 10px; align-items: start; }
.crm-col { background: var(--color-bg-alt); border-radius: 14px; padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 240px; border: 2px dashed transparent; transition: border-color .15s, background .15s; }
.crm-col.is-over { border-color: var(--eg-navy); background: var(--color-primary-tint); }
.crm-col.is-won { background: var(--color-success-tint); } .crm-col.is-lost { background: #f6f1f1; }
.crm-col-head { display: flex; flex-direction: column; gap: 2px; padding: 2px 4px 6px; border-bottom: 1px solid var(--color-border); }
.crm-col-head b { font-size: var(--text-dense); color: var(--eg-navy); display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.crm-col-head small { color: var(--color-text-muted); font-size: 11.5px; }
.crm-card { background: #fff; border: 1px solid var(--color-border); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--shadow-card); }
.crm-card[draggable="true"] { cursor: grab; } .crm-card.is-dragging { opacity: .45; }
.crm-card a.crm-card-t { font-weight: 700; font-size: var(--text-dense); color: var(--color-text); text-decoration: none; line-height: 1.35; } .crm-card a.crm-card-t:hover { color: var(--eg-navy); text-decoration: underline; }
.crm-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; color: var(--color-text-muted); flex-wrap: wrap; }
.crm-card-moves { display: flex; gap: 4px; justify-content: space-between; border-top: 1px solid var(--color-border); padding-top: 6px; }
.crm-mv { min-height: 30px; min-width: 30px; padding: 2px 8px; border-radius: 8px; border: 1px solid var(--color-border); background: #fff; color: var(--eg-navy); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font: 600 12px var(--font-body); }
.crm-mv:hover:not([disabled]) { background: var(--color-primary-tint); } .crm-mv[disabled] { opacity: .35; cursor: default; }
.crm-col-empty { font-size: 12px; color: var(--color-text-muted); text-align: center; padding: 18px 6px; border: 1px dashed var(--color-border-strong); border-radius: 10px; }
.crm-ltable td { vertical-align: middle; } .crm-ltable input.input { min-height: 38px; padding-block: 4px; }
.crm-num { width: 110px; text-align: end; direction: ltr; }
.crm-hint { display: block; font-size: 11.5px; color: var(--color-text-muted); margin-top: 3px; } .crm-hint.is-warn { color: var(--color-warning); font-weight: 600; }
.crm-totals { display: grid; grid-template-columns: 1fr auto; gap: 7px 18px; font-size: var(--text-dense); align-items: center; }
.crm-totals > span { color: var(--color-text-muted); display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; } .crm-totals > b { text-align: end; font-weight: 600; }
.crm-totals .is-total { font-weight: 800; font-size: 1.08rem; color: var(--eg-navy); border-top: 1px solid var(--color-border); padding-top: 9px; }
.crm-builder { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
.crm-sticky { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 14px; }
@media (max-width: 1100px) { .crm-builder { grid-template-columns: 1fr; } .crm-sticky { position: static; } }
.crm-fgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 2px 16px; }
.crm-fgrid .crm-wide { grid-column: 1 / -1; }
.crm-form { display: flex; flex-direction: column; gap: 10px; }
.crm-pick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; max-height: 54vh; overflow: auto; padding: 2px; }
.crm-pick { text-align: start; display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--color-border); border-radius: 12px; background: #fff; cursor: pointer; font: inherit; color: inherit; }
.crm-pick:hover:not([disabled]) { border-color: var(--eg-navy-soft, var(--eg-navy)); }
.crm-pick[aria-pressed="true"] { border-color: var(--eg-navy); box-shadow: 0 0 0 2px var(--eg-navy-tint); background: var(--color-primary-tint); }
.crm-pick[disabled] { opacity: .5; cursor: default; }
.crm-pick-meta { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; color: var(--color-text-muted); }
.crm-famhead { grid-column: 1 / -1; font-weight: 700; color: var(--eg-navy); margin-top: 8px; display: flex; align-items: center; gap: 10px; }
.crm-famhead img { width: 42px; height: 32px; object-fit: cover; border-radius: 6px; border: 1px solid var(--color-border); }
.crm-famhead small { color: var(--color-text-muted); font-weight: 500; }
.crm-predict { background: var(--color-bg-alt); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.crm-predict ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.crm-predict li { display: flex; gap: 6px; align-items: flex-start; line-height: 1.55; } .crm-predict li .icon { flex: none; margin-top: 3px; color: var(--eg-navy); }
.crm-predict li.is-warn .icon { color: var(--color-warning); } .crm-predict small { color: var(--color-text-muted); }
.crm-credit { display: flex; flex-direction: column; gap: 6px; } .crm-credit small { color: var(--color-text-muted); font-size: 12px; }
.crm-queue { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 500px), 1fr)); gap: 16px; }
.crm-qcard { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border-inline-start: 4px solid var(--color-warning); }
.crm-qcard.is-danger { border-inline-start-color: var(--color-danger); }
.crm-qhead { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; } .crm-qhead h3 { margin: 6px 0 2px; font-size: 1.05rem; } .crm-qhead small { color: var(--color-text-muted); }
.crm-qtotal { text-align: end; display: flex; flex-direction: column; } .crm-qtotal small { color: var(--color-text-muted); font-size: 12px; } .crm-qtotal b { font-size: 1.25rem; color: var(--eg-navy); }
.crm-qcontact { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 13px; background: var(--color-bg-alt); border-radius: 10px; padding: 8px 12px; align-items: center; }
.crm-qcontact span, .crm-qcontact a { display: inline-flex; align-items: center; gap: 6px; }
.crm-phone { font-weight: 700; color: var(--eg-navy); text-decoration: none; } .crm-phone:hover { text-decoration: underline; }
.crm-mini { width: 100%; border-collapse: collapse; font-size: 13px; } .crm-mini td, .crm-mini th { padding: 6px 4px; border-bottom: 1px solid var(--color-border); text-align: start; } .crm-mini th { color: var(--color-text-muted); font-weight: 600; font-size: 12px; } .crm-mini td.num, .crm-mini th.num { text-align: end; }
.crm-calllog { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.crm-calllog li { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: center; font-size: 13px; } .crm-calllog li small { grid-column: 2; color: var(--color-text-muted); font-size: 11.5px; }
.crm-hero { display: flex; gap: 14px; align-items: center; }
.crm-hero-ico { width: 54px; height: 54px; border-radius: 16px; background: var(--eg-navy); color: #fff; display: grid; place-items: center; font: 700 19px var(--font-ar); flex: none; }
.crm-aging { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.crm-aging div { background: var(--color-bg-alt); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; } .crm-aging small { color: var(--color-text-muted); font-size: 11.5px; } .crm-aging b { font-size: 13px; }
.crm-aging .is-warning { background: var(--color-warning-tint); } .crm-aging .is-danger { background: var(--color-danger-tint); } .crm-aging .is-danger b { color: var(--color-danger); }
@media (max-width: 700px) { .crm-aging { grid-template-columns: repeat(2, 1fr); } }
.crm-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.crm-timeline li { position: relative; display: flex; gap: 10px; padding-bottom: 14px; }
.crm-timeline li:not(:last-child)::before { content: ""; position: absolute; inset-block: 32px 0; inset-inline-start: 15px; width: 2px; background: var(--color-border); }
.crm-tl-ico { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; flex: none; background: var(--color-primary-tint); color: var(--eg-navy); position: relative; z-index: 1; }
.crm-tl-ico.is-plan { background: #fff; border: 2px dashed var(--color-border-strong); color: var(--color-text-muted); } .crm-tl-ico.is-late { background: var(--color-danger-tint); color: var(--color-danger); }
.crm-tl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; font-size: 13px; } .crm-tl-body small { color: var(--color-text-muted); font-size: 12px; }
.crm-agenda { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.crm-agenda li { display: grid; grid-template-columns: 62px 34px minmax(0, 1fr) auto; gap: 10px; align-items: center; background: #fff; border: 1px solid var(--color-border); border-radius: 12px; padding: 10px 12px; }
.crm-agenda li.is-late { border-inline-start: 4px solid var(--color-danger); } .crm-agenda li.is-done { opacity: .62; } .crm-agenda li.is-due { border-inline-start: 4px solid var(--color-warning); }
.crm-agenda time { font: 700 13px var(--font-en); color: var(--eg-navy); text-align: center; } .crm-agenda time small { display: block; font: 500 10.5px var(--font-ar); color: var(--color-text-muted); }
.crm-week { display: grid; grid-template-columns: repeat(7, minmax(128px, 1fr)); gap: 8px; overflow-x: auto; }
.crm-day { background: var(--color-bg-alt); border-radius: 12px; padding: 8px; min-height: 170px; display: flex; flex-direction: column; gap: 6px; }
.crm-day.is-today { outline: 2px solid var(--eg-navy); background: #fff; } .crm-day.is-off { background: #f3f3f1; }
.crm-day-h { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: var(--eg-navy); } .crm-day-h small { color: var(--color-text-muted); font: 600 11.5px var(--font-en); }
.crm-ev { font-size: 12px; background: #fff; border: 1px solid var(--color-border); border-inline-start: 3px solid var(--eg-navy); border-radius: 8px; padding: 5px 7px; display: flex; flex-direction: column; gap: 1px; text-decoration: none; color: inherit; }
.crm-ev b { font-weight: 600; } .crm-ev small { color: var(--color-text-muted); } .crm-ev.is-done { opacity: .6; border-inline-start-color: var(--color-success); } .crm-ev.is-late { border-inline-start-color: var(--color-danger); }
.crm-lb { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.crm-lb li { display: grid; grid-template-columns: 34px minmax(0, 1fr) minmax(150px, 38%); gap: 12px; align-items: center; }
.crm-rank { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font: 800 13px var(--font-en); background: var(--color-neutral-tint); color: var(--color-text-muted); }
.crm-rank.is-1 { background: #c9a227; color: #fff; } .crm-rank.is-2 { background: #9aa3ad; color: #fff; } .crm-rank.is-3 { background: #a8703c; color: #fff; }
.crm-impact { border: 1px solid #f5c2c4; background: linear-gradient(135deg, #fff5f5, #fff); border-radius: 14px; padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; }
.crm-impact p { margin: 0; line-height: 1.7; }
.crm-impact-head { display: flex; align-items: center; gap: 8px; color: var(--color-danger); } .crm-impact-head b { font-size: var(--text-dense); }
.crm-ship { display: flex; flex-direction: column; gap: 10px; }
.crm-docs { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 6px; }
.crm-docs li { display: flex; align-items: center; gap: 6px; font-size: 12.5px; } .crm-docs li.is-ok .icon { color: var(--color-success); } .crm-docs li:not(.is-ok) .icon { color: var(--color-text-muted); }
.crm-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.crm-steps li { display: flex; gap: 10px; align-items: center; font-size: 13px; } .crm-steps li small { color: var(--color-text-muted); }
.crm-step-n { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font: 700 12px var(--font-en); background: #fff; border: 2px solid var(--color-border-strong); color: var(--color-text-muted); flex: none; }
.crm-step-n.is-approved { background: var(--color-success); border-color: var(--color-success); color: #fff; } .crm-step-n.is-pending { border-color: var(--color-warning); background: var(--color-warning-tint); color: var(--color-warning); } .crm-step-n.is-rejected { background: var(--color-danger); border-color: var(--color-danger); color: #fff; }
.crm-out { display: flex; flex-direction: column; gap: 16px; }
.crm-outlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.crm-outlist > li { display: flex; gap: 10px; align-items: flex-start; } .crm-outlist > li > div { display: flex; flex-direction: column; gap: 2px; } .crm-outlist small { color: var(--color-text-muted); font-size: 12.5px; }
.crm-out-ico { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex: none; background: var(--color-primary-tint); color: var(--eg-navy); }
.crm-out-success .crm-out-ico { background: var(--color-success-tint); color: var(--color-success); } .crm-out-warning .crm-out-ico { background: var(--color-warning-tint); color: var(--color-warning); } .crm-out-danger .crm-out-ico { background: var(--color-danger-tint); color: var(--color-danger); }
.crm-out-wos { flex-direction: column !important; gap: 6px !important; padding-inline-start: 40px; } .crm-out-wos > div { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; }
.crm-hist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13px; } .crm-hist li { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px dashed var(--color-border); padding-bottom: 6px; } .crm-hist small { color: var(--color-text-muted); white-space: nowrap; }
.crm-a4-wrap { background: var(--color-bg-alt); padding: 18px; border-radius: 12px; }
.crm-a4 { background: #fff; color: #1b1b1b; width: 100%; max-width: 794px; margin: 0 auto; padding: 34px 40px; box-shadow: 0 1px 0 var(--color-border), var(--shadow-card); font-size: 13px; display: flex; flex-direction: column; gap: 18px; }
.crm-a4-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #012864; padding-bottom: 14px; gap: 16px; }
.crm-a4-co { display: flex; gap: 12px; align-items: flex-start; } .crm-a4-co img { height: 46px; width: auto; } .crm-a4-co div { display: flex; flex-direction: column; gap: 1px; } .crm-a4-co b { font-size: 15px; color: #012864; } .crm-a4-co small { color: #555; font-size: 11.5px; }
.crm-a4-title { text-align: end; display: flex; flex-direction: column; gap: 2px; } .crm-a4-title h2 { margin: 0; color: #b9141b; font-size: 22px; } .crm-a4-title span { font: 700 14px var(--font-en); color: #012864; } .crm-a4-title small { color: #555; }
.crm-a4-to { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .crm-a4-to > div { background: #f6f7f9; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; } .crm-a4-to small { color: #666; font-size: 11.5px; } .crm-a4-to b { color: #111; }
.crm-a4-table { width: 100%; border-collapse: collapse; } .crm-a4-table th { background: #012864; color: #fff; font-weight: 600; font-size: 12px; padding: 7px 8px; text-align: start; } .crm-a4-table td { border-bottom: 1px solid #e3e5ea; padding: 7px 8px; vertical-align: middle; } .crm-a4-table td small { display: block; color: #777; font-size: 11px; } .crm-a4-table .num { text-align: end; }
.crm-a4-sum { display: flex; justify-content: flex-end; } .crm-a4-sum .crm-totals { min-width: 300px; }
.crm-a4-terms ol { margin: 6px 0 0; padding-inline-start: 18px; display: flex; flex-direction: column; gap: 3px; color: #333; font-size: 12px; }
.crm-a4-foot { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 10px; } .crm-a4-foot div { display: flex; flex-direction: column; gap: 22px; } .crm-a4-foot small { color: #666; } .crm-a4-sign { border-bottom: 1px solid #999; height: 1px; }
.crm-a4-note { font-size: 10.5px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 8px; }
.crm-dim { width: 100%; } .crm-dim td.num, .crm-dim th.num { text-align: end; }
.crm-split-2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; } @media (max-width: 900px) { .crm-split-2 { grid-template-columns: 1fr; } }
.crm-kv-tight .sap-kv dt, .crm-kv-tight .sap-kv dd { padding: 8px 12px; }
.crm-pill-row { display: flex; gap: 6px; flex-wrap: wrap; }
.crm-tabhost { padding-top: 12px; }
.crm-viewbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.crm-locknote { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--color-text-muted); background: var(--color-neutral-tint); border-radius: 8px; padding: 4px 10px; }
`;
    document.head.appendChild(s);
  })();

  /* ═════════════════════════ constants & helpers ═════════════════════════ */
  const get = (p) => st.get(p) || [];
  const today = () => ERP.day(0);
  const nowIso = () => new Date().toISOString();
  const me = () => SA.session.user;
  const meId = () => SA.session.userId;
  const money = (n) => fm.money(n);
  const short = (n) => fm.short(n);
  const sum = (arr, fn) => arr.reduce((s, x) => s + (Number(fn ? fn(x) : x) || 0), 0);
  const ratio = (a, b) => (b ? a / b : 0);
  const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
  const uniq = (a) => Array.from(new Set(a.filter(Boolean)));
  const stLabel = (kind, s) => (((SA.catalog.status[kind] || {})[s]) || [s])[0];
  const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
  const OPEN_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];
  const PROB = { new: 0.1, contacted: 0.2, qualified: 0.4, proposal: 0.55, negotiation: 0.75, won: 1, lost: 0 };
  const stageLabel = (s) => stLabel('lead', s);
  const OPEN_SO = ['pending_review', 'pending_approval', 'confirmed', 'in_production', 'ready', 'partially_delivered'];
  const DONE_SO = ['delivered', 'invoiced', 'closed', 'cancelled', 'rejected'];
  const BOOKED_SO = ['confirmed', 'in_production', 'ready', 'partially_delivered', 'delivered', 'invoiced', 'closed'];
  const FAM = { door: 'أبواب', clad: 'تجاليد', foam: 'فوم بورد', acc: 'إكسسوارات' };
  const FAM_IMG = { door: 'doors', clad: 'cladding', foam: 'foam' };
  const SEG = { dealer: 'تاجر', contractor: 'مقاول', direct: 'عميل مباشر', project: 'مشروع', export: 'تصدير' };
  const REGIONS = ['القاهرة الكبرى', 'الإسكندرية', 'الدلتا', 'القناة وسيناء', 'الصعيد', 'الساحل', 'الخليج'];
  const SOURCES = ['معرض', 'الموقع الإلكتروني', 'واتساب', 'فيسبوك', 'إحالة من تاجر', 'زيارة ميدانية', 'الخط الساخن 15536'];
  const SRC = { rep: ['مندوب', 'user'], portal: ['بوابة التاجر', 'globe'], expo: ['معرض', 'calendar'], phone: ['هاتف', 'phone'] };
  const ACT = { call: ['مكالمة', 'phone'], visit: ['زيارة', 'pin'], meeting: ['اجتماع', 'users'], whatsapp: ['واتساب', 'chat'] };
  const CALL = { confirmed: ['تم التأكيد', 'success'], no_answer: ['لم يرد', 'warning'], changes: ['طلب تعديلات', 'info'], cancelled: ['ألغى الطلب', 'danger'] };
  const LOST_REASONS = ['السعر', 'اختار منافس', 'تأجيل المشروع', 'لا توجد ميزانية', 'لم يعد مهتمًا', 'أخرى'];
  const PL_BY_SEG = { dealer: 'PL-02', contractor: 'PL-03', project: 'PL-03', direct: 'PL-01', export: 'PL-02' };
  const WEEK = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  const monthShort = (k) => ERP.months[Number(String(k).slice(5, 7)) - 1] || k;
  const curMonth = () => ERP.monthKeys(1)[0];

  /* ── scope (reps: own · managers: team · back-office roles without a sales scope: all) ── */
  function scopeMode() { const s = SA.session.snapshot; if (!s) return 'own'; if (s.sa === '*') return 'all'; const sc = s.scope || {}; return sc.sales || sc.customers || 'all'; }
  function repSet() {
    const m = scopeMode(); if (m === 'all') return null; const u = me(); if (!u) return new Set();
    if (m === 'own') return new Set([u.id]);
    return new Set(get('users').filter((x) => (m === 'team' ? x.id === u.id || x.managerId === u.id : x.departmentId === u.departmentId)).map((x) => x.id));
  }
  function scoped(rows, field) {
    const m = scopeMode(); if (m === 'all') return rows; const s = SA.session.snapshot;
    if (s && s.scope && s.scope.sales) return SA.scopeFilter('sales', rows, field); // the platform rule (own/team/department)
    const set = repSet(); return rows.filter((r) => set.has(r[field]));
  }
  const inScope = (repId) => { const s = repSet(); return !s || s.has(repId); };
  const myOrders = () => scoped(get('salesOrders'), 'repId');
  const myCustomers = () => scoped(get('customers'), 'salesRepId');
  const myLeads = () => scoped(get('leads'), 'ownerId');
  const myQuotes = () => scoped(get('quotations'), 'repId');
  const myActs = () => scoped(get('activities'), 'ownerId');
  const myTargets = () => get('targets').filter((t) => inScope(t.repId));
  function soRepMap() { const m = {}; get('salesOrders').forEach((s) => { m[s.id] = s.repId; }); return m; }
  function invRepOf(inv, map) { return (map && map[inv.soId]) || (ERP.customer(inv.customerId) || {}).salesRepId || null; }
  function myInvoices() { const set = repSet(); const map = soRepMap(); const l = get('invoices').filter((i) => i.status !== 'cancelled'); return set ? l.filter((i) => set.has(invRepOf(i, map))) : l; }
  function myReceipts() { const set = repSet(); const l = get('receipts'); return set ? l.filter((r) => set.has((ERP.customer(r.customerId) || {}).salesRepId)) : l; }
  function salesReps() { return get('users').filter((u) => (u.roleId === 'R-04' || u.roleId === 'R-03') && u.status === 'active' && inScope(u.id)); }
  function scopeTag() {
    const m = scopeMode(); if (m === 'all') return null;
    return h('span.crm-scope', { title: 'البيانات المعروضة مفلترة حسب نطاق دورك (SA.scopeFilter)' }, SA.icon('eye', 'icon-sm'), m === 'own' ? 'نطاقك: سجلاتك وعملاؤك فقط' : m === 'team' ? 'نطاقك: فريقك' : 'نطاقك: قسمك');
  }

  /* ── record helpers ── */
  const custName = (id) => ERP.customerName(id);
  const leadName = (l) => (l ? l.company || l.name : '—');
  const isLate = (so) => !!so.promisedDate && so.promisedDate < today() && DONE_SO.indexOf(so.status) < 0 && so.status !== 'draft';
  const openOrdersOf = (cid) => get('salesOrders').filter((o) => o.customerId === cid && OPEN_SO.indexOf(o.status) >= 0);
  const qStatus = (q) => (q.status === 'sent' && q.validUntil && q.validUntil < today() ? 'expired' : q.status);
  const leadProb = (l) => (l.probability != null ? l.probability : PROB[l.stage] || 0);
  const weightedOf = (ls) => sum(ls.filter((l) => OPEN_STAGES.indexOf(l.stage) >= 0), (l) => (l.value || 0) * leadProb(l));
  const bookedAt = (so) => String(so.confirmedAt || so.createdAt || '');
  function needsApproval(so) { const t = F.totals(so); const L = F.limits; if ((so.discountPct || 0) > L.gmDiscountPct) return 'خصم ' + so.discountPct + '% أعلى من ' + L.gmDiscountPct + '%'; if (t.net > L.orderValue) return 'قيمة ' + short(t.net) + ' أعلى من ' + short(L.orderValue); if ((so.discountPct || 0) > L.discountPct) return 'خصم ' + so.discountPct + '% أعلى من حد المندوب ' + L.discountPct + '%'; return ''; }
  function approvalChainFor(so) { const t = F.totals(so); const L = F.limits; const gm = (so.discountPct || 0) > L.gmDiscountPct || t.net > L.orderValue; return gm ? 'مدير المبيعات ← المدير العام' : 'مدير المبيعات'; }
  const deliverable = (so) => sum(so.lines, (l) => Math.max(0, (l.reservedQty || 0) - (l.deliveredQty || 0) - F.pendingDnQty(so.id, l.itemId)));
  const invoiceable = (so) => so.lines.some((l) => (l.deliveredQty || 0) > (l.invoicedQty || 0));
  const lineOf = (id) => ERP.line(id) || {};
  const defaultQty = (it) => (!it ? 1 : it.family === 'door' ? 10 : it.family === 'clad' ? 200 : it.family === 'foam' ? 50 : 10);
  const plFactor = (plId) => { const p = ERP.find('priceLists', plId); return p && p.factor != null ? p.factor : 1; };
  const watch = (paths, fn) => { const offs = paths.map((p) => st.subscribe(p, fn)); return () => offs.forEach((f) => f()); };

  /* ── small UI pieces ── */
  const cell = (main, sub) => h('span.crm-cell', {}, h('b', {}, main), sub ? h('small', {}, sub) : null);
  const custLink = (id, label) => (id ? h('a.erp-doc', { href: '#/crm/customers/' + id }, label || custName(id)) : h('span', {}, '—'));
  const leadLink = (l) => (l ? h('a.erp-doc', { href: '#/crm/leads/' + l.id }, leadName(l)) : h('span', {}, '—'));
  const repCell = (id) => (id ? h('span.crm-rep', {}, SA.avatar(SA.userName(id)), h('span', {}, SA.userName(id))) : '—');
  const famChip = (f) => h('span.crm-fam.is-' + (f || 'acc'), {}, FAM[f] || f || '—');
  const segChip = (s) => SA.chip(SEG[s] || s || '—', s === 'export' ? 'info' : 'neutral');
  const tierChip = (t) => h('span.crm-tier.is-' + String(t || 'C').toLowerCase(), { title: 'فئة العميل ' + (t || 'C') }, t || 'C');
  const exportFlag = () => h('span.crm-flag', {}, SA.icon('ship', 'icon-sm'), 'تصدير');
  const srcChip = (s) => { const x = SRC[s] || [s || '—', 'tag']; return h('span.crm-src', {}, SA.icon(x[1], 'icon-sm'), x[0]); };
  function scoreBadge(n) { const t = n >= 75 ? 'hot' : n >= 50 ? 'warm' : 'cold'; return h('span.crm-score.is-' + t, { title: 'تقييم تجريبي للعميل المحتمل: ' + (t === 'hot' ? 'ساخن' : t === 'warm' ? 'دافئ' : 'بارد') }, n == null ? '—' : String(n)); }
  function slaChip(iso) { const hrs = (Date.now() - new Date(iso).getTime()) / 3600000; const tone = hrs < 2 ? 'success' : hrs < 24 ? 'warning' : 'danger'; return h('span.crm-sla.is-' + tone, { title: 'زمن الانتظار منذ الإرسال — هدف SLA تجريبي (بند 49 Open)' }, SA.icon('clock', 'icon-sm'), SA.fmt.rel(iso)); }
  const prog = (v, of) => { const r = of ? (v || 0) / of : 0; return h('div.crm-prog', {}, h('small.num', {}, fm.num(v || 0) + ' / ' + fm.num(of)), CH.meter(r, { tone: r >= 1 ? 'success' : 'primary' })); };
  function head(o) { const tags = [].concat(o.tags || []).filter(Boolean); const sc = o.noScope ? null : scopeTag(); if (sc) tags.push(sc); return SA.pageHead({ title: o.title, desc: o.desc, tags: tags.length ? tags : null, actions: (o.actions || []).filter(Boolean), back: o.back }); }
  const listCard = (t) => h('div.card.card-flush.sap-listcard', {}, t.el);
  function notFound(label, back) { return SA.empty({ icon: 'search', title: label + ' غير موجود', text: 'ربما تم حذفه أو الرابط غير صحيح.', action: { label: 'رجوع للقائمة', icon: 'arrowright', onClick: () => SA.nav(back) } }); }
  function outOfScope(id) {
    SA.audit('ACCESS.DENIED', { target: { type: 'record', id, label: id }, result: 'denied', reason: 'سجل خارج نطاق المستخدم (scope)', area: 'crm' });
    return SA.denied({ title: 'هذا السجل خارج نطاقك', text: 'السجل ' + id + ' يخص مندوبًا آخر. دورك يعرض سجلاتك وعملاءك فقط — تم تسجيل المحاولة.', perm: 'scope: ' + scopeMode() });
  }
  function totalsBox(doc) {
    const t = F.totals(doc);
    return h('div.crm-totals', {},
      h('span', {}, 'الإجمالي قبل الخصم'), h('b.num', {}, money(t.gross)),
      doc.discountPct ? [h('span', {}, 'الخصم (' + doc.discountPct + '%)'), h('b.num.crm-neg', {}, '− ' + money(t.discount))] : null,
      h('span', {}, 'الصافي'), h('b.num', {}, money(t.net)),
      h('span', {}, 'ضريبة القيمة المضافة ' + Math.round(ERP.taxRate() * 100) + '%', ERP.taxIsDemo() ? U.demo('نسبة تجريبية') : null), h('b.num', {}, money(t.tax)),
      h('span.is-total', {}, 'الإجمالي'), h('b.num.is-total', {}, money(t.total)));
  }
  function stepChain(ap) {
    if (!ap) return null; const T = { approved: 'is-approved', pending: 'is-pending', rejected: 'is-rejected' };
    return h('ol.crm-steps', {}, ap.chain.map((c) => h('li', {}, h('span.crm-step-n.' + (T[c.status] || 'is-wait'), {}, c.status === 'approved' ? SA.icon('check', 'icon-sm') : c.status === 'rejected' ? SA.icon('x', 'icon-sm') : String(c.step)),
      h('div.crm-cell', {}, h('b', {}, c.label), h('small', {}, c.status === 'approved' ? 'اعتمد ' + SA.userName(c.decidedBy) + ' · ' + SA.fmt.rel(c.decidedAt) + (c.reason ? ' — ' + c.reason : '') : c.status === 'rejected' ? 'رفض ' + SA.userName(c.decidedBy) + (c.reason ? ' — ' + c.reason : '') : c.status === 'pending' ? 'بانتظار القرار الآن' : c.status === 'skipped' ? 'تم تخطيها' : 'بانتظار الخطوة السابقة')))));
  }
  function decideButtons(ap) {
    if (!ap || !SA.approvals || ['pending', 'delegated'].indexOf(ap.status) < 0) return [];
    const why = SA.approvals.why(ap);
    if (why) return [h('a.btn.btn-ghost.btn-sm', { href: '#/approvals/' + ap.id, title: why }, SA.icon('inbox', 'icon-sm'), 'فتح ' + ap.id)];
    return [SA.btn({ label: 'اعتماد', icon: 'checkcircle', kind: 'primary', size: 'sm', onClick: () => SA.approvals.decide(ap.id, 'approve') }), SA.btn({ label: 'رفض', icon: 'xcircle', kind: 'ghost', size: 'sm', onClick: () => SA.approvals.decide(ap.id, 'reject') })];
  }

  /** generic modal form: fields = SA.form.field apis; onSubmit(values, modal) → value to resolve with (false keeps it open). Errors → SA.fail. */
  function formModal(o) {
    return new Promise((resolve) => {
      const fields = o.fields.filter(Boolean); const grp = SA.form.group(fields);
      const btn = h('button.btn.btn-' + (o.danger ? 'accent' : 'primary'), { type: 'button', onclick: () => go() }, SA.icon(o.okIcon || 'check', 'icon-sm'), o.confirmLabel || 'حفظ');
      const body = h('div.crm-form', {}, o.top || null, o.grid ? h('div.crm-fgrid', {}, fields.map((f) => f.el)) : fields.map((f) => f.el), o.extra || null, o.note === false ? null : h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), o.note || 'الإجراء يتسجّل في سجل التدقيق باسمك مع الوقت.'));
      const m = SA.modal({ title: o.title, subtitle: o.subtitle, icon: o.icon || 'edit', size: o.size || 'md', danger: !!o.danger, body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), btn] });
      async function go() {
        if (!grp.validate()) return; const v = grp.get();
        if (o.validate) { const err = o.validate(v); if (err) { SA.toast(err, 'warn'); return; } }
        m.setBusy(true); let r;
        try { r = await o.onSubmit(v, m); } catch (e) { m.setBusy(false); SA.fail(e); return; }
        m.setBusy(false); if (r !== false) m.close(r === undefined ? true : r);
      }
      m.closed.then((r) => resolve(r == null ? null : r));
    });
  }

  /* ═════════════════════════ seed hook (module-private demo data) ═════════════════════════ */
  ERP.addSeed('crm', function (S, c) {
    if (!S.salesOrders || !S.leads || !S.activities) return;
    const at = (off, hh, mm) => { const d = new Date(); d.setDate(d.getDate() + off); d.setHours(hh, mm || 0, 0, 0); return d.toISOString(); };
    const lead = (frag) => S.leads.find((l) => String(l.company || '').indexOf(frag) >= 0 || String(l.name || '').indexOf(frag) >= 0) || null;
    let n = 700; const A = (o) => S.activities.push(Object.assign({ id: 'ACT-' + n++, kind: 'call', leadId: null, customerId: null, soId: null, ownerId: 'U-05', at: at(0, 12), note: '', done: false, planned: true, createdAt: c.ago(60 * 20) }, o));
    const LA = (frag, o) => { const l = lead(frag); if (l) A(Object.assign({ leadId: l.id, ownerId: l.ownerId }, o)); };
    A({ kind: 'call', customerId: 'C-001', soId: 'SO-2026-0481', ownerId: 'U-05', at: at(0, 12, 30), note: 'مكالمة تأكيد طلب البوابة SO-2026-0481 — التاجر يفضّل الاتصال من 12 إلى 3 ظهرًا' });
    LA('الشفاء', { kind: 'visit', at: at(0, 15), note: 'زيارة إدارة المشروعات بالمستشفى — عرض عينات فوم 10 و17 مم ومتابعة QT-2026-0063' });
    LA('الحنا', { kind: 'call', at: at(-1, 11), note: 'متابعة بعد معرض جمصة — طلب كتالوج الأبواب وأسعار الجملة' });
    A({ kind: 'call', customerId: 'C-004', ownerId: 'U-05', at: at(-1, 16), note: 'متابعة تحصيل فاتورة متأخرة — مقاولات الصعيد' });
    A({ kind: 'call', customerId: 'C-013', ownerId: 'U-05', at: at(0, 9, 30), done: true, planned: false, note: 'أكد المستشفى موعد استلام ألواح الفوم بعد فحص الجودة النهائي' });
    LA('الرحاب', { kind: 'meeting', at: at(0, 11), note: 'اجتماع تفاوض على عرض QT-2026-0062 (خصم 6%) مع استشاري المشروع' });
    LA('البيت الذكي', { kind: 'whatsapp', at: at(0, 17), note: 'إرسال كتالوج ألوان التجاليد K71 وصور مشاريع سابقة' });
    A({ kind: 'visit', customerId: 'C-014', ownerId: 'U-10', at: at(1, 10), note: 'زيارة موقع فيلات العلمين — قياسات المرحلة الأولى (SO-2026-0482)' });
    LA('Al-Balushi', { kind: 'call', at: at(0, 13), note: 'مكالمة مع مسقط — شروط الشحن CIF وموعد الحاوية القادمة' });
    LA('Harthy', { kind: 'call', at: at(1, 12), note: 'متابعة عينات الأبواب المرسلة مع شحنة SH-2026-014' });
    LA('النخبة', { kind: 'visit', at: at(2, 10), note: 'زيارة إدارة التوسعات — عرض أبواب الفصول (موديل D107)' });
    /* quotation QT-2026-0062 (6% > 5% rep limit) is pending_approval in the core seed → give it its approval record in the shared inbox */
    const q62 = (S.quotations || []).find((q) => q.id === 'QT-2026-0062');
    if (q62 && q62.status === 'pending_approval' && !q62.approvalId && S.approvals && !S.approvals.some((a) => a.id === 'AP-2131')) {
      const g = q62.lines.reduce((s, l) => s + l.qty * l.price, 0); const net = Math.round(g * (1 - (q62.discountPct || 0) / 100)); const total = Math.round(net * 1.14);
      q62.approvalId = 'AP-2131'; q62.submittedAt = c.ago(60 * 26);
      S.approvals.unshift({ id: 'AP-2131', type: 'quotation', area: 'crm', title: 'خصم ' + q62.discountPct + '% على عرض السعر QT-2026-0062 — ' + (q62.prospect || ''), requesterId: q62.repId, amount: total, discountPct: q62.discountPct, currency: 'EGP', status: 'pending',
        chain: [{ step: 1, roleId: 'R-03', label: 'مدير المبيعات', status: 'pending', decidedBy: null, decidedAt: null, reason: '' }], currentStep: 1, createdAt: c.ago(60 * 26), updatedAt: c.ago(60 * 26),
        context: [['العميل المحتمل', q62.prospect || ''], ['قيمة العرض', ERP.fmt.money(total)], ['الخصم المطلوب', q62.discountPct + '%'], ['حد خصم المندوب', F.limits.discountPct + '% (تجريبي — بند 33 Open)'], ['البنود', '2,700 قطعة تجاليد K71 (K71-1 / K71-4)'], ['ملاحظة المندوبة', 'منافس قدّم سعرًا أقل 5% — العميل يطلب 6% لإغلاق الصفقة']], ref: { type: 'quotation', id: 'QT-2026-0062' } });
      if (S.notifications) { S.notifications.push({ id: 'N-C1', ts: c.ago(60 * 26), title: 'طلب اعتماد خصم على عرض سعر', body: 'QT-2026-0062 — مقاولات الرحاب (خصم 6%).', level: 'action', to: ['R-03', 'R-01'], toUsers: [], link: '#/crm/quotes/QT-2026-0062', readBy: [] }); S.notifications.sort((a, b) => (a.ts < b.ts ? 1 : -1)); }
    }
    /* a 2nd dealer-portal order waiting for the confirmation call (one unanswered attempt → SLA breached) */
    const seq = S.meta && S.meta.erpSeq; const c5 = (S.customers || []).find((x) => x.id === 'C-005');
    if (seq && c5 && S.items && !S.salesOrders.some((o) => o.customerId === 'C-005' && o.source === 'portal' && o.status === 'pending_review')) {
      const nn = Math.max(seq.SO || 0, 489) + 1; seq.SO = nn; const id = 'SO-' + new Date().getFullYear() + '-' + String(nn).padStart(4, '0');
      const pl = (S.priceLists || []).find((p) => p.id === c5.priceListId); const f = pl && pl.factor != null ? pl.factor : 1;
      const LN = (itemId, qty) => { const it = S.items.find((i) => i.id === itemId); return it ? { itemId, qty, price: Math.round(it.price * f), reservedQty: 0, deliveredQty: 0, invoicedQty: 0 } : null; };
      const lines = [LN('IT-D107-90-C021', 8), LN('IT-D101-90-C132', 6), LN('IT-K71-4', 200)].filter(Boolean);
      const rep = c5.salesRepId || 'U-10'; const contact = (c5.contacts || [])[0] || {};
      S.salesOrders.push({ id, customerId: 'C-005', source: 'portal', repId: rep, createdBy: null, lines, discountPct: 0, status: 'pending_review', createdAt: c.ago(60 * 26), submittedAt: c.ago(60 * 26), promisedDate: c.day(12), approvalId: null, woIds: [], dnIds: [], invoiceIds: [], notes: 'طلب من بوابة التاجر — تجديد مخزون صالة العرض', call: { phone: contact.phone || '', preferredTime: 'بعد 5 مساءً', log: [{ at: c.ago(60 * 20), by: rep, result: 'no_answer', note: 'الهاتف مغلق — إعادة المحاولة بعد 5 مساءً حسب الموعد المفضّل' }] }, export: false, priority: 'normal' });
      c5.openOrders = (c5.openOrders || 0) + 1;
      if (S.audit) {
        const u = (uid) => (S.users || []).find((x) => x.id === uid) || {};
        const AU = (mins, code, actor, target, o) => S.audit.push(Object.assign({ id: 'AU-C' + S.audit.length, ts: c.ago(mins), actor, code, target, before: null, after: null, reason: '', severity: (SA.catalog.auditByCode[code] || {}).severity || 'info', result: 'success', ip: '192.0.2.41', device: 'Chrome · Windows', via: 'web', count: 1, area: SA.catalog.auditAreaOf(code) || 'crm', stepUp: false }, o));
        AU(60 * 26, 'PORTAL.ORDER_SUBMITTED', { id: 'PORTAL', name: 'بوابة التاجر — ' + c5.name, roleId: 'R-21' }, { type: 'sales_order', id, label: c5.name });
        AU(60 * 20, 'SO.CALL_LOGGED', { id: rep, name: u(rep).name || rep, roleId: u(rep).roleId || 'R-04' }, { type: 'sales_order', id, label: c5.name }, { after: { result: 'no_answer' }, reason: 'الهاتف مغلق' });
        S.audit.sort((a, b) => (a.ts < b.ts ? 1 : -1));
      }
    }
  });

  /* ═════════════════════════ approvals owned by CRM: quotation discounts ═════════════════════════ */
  ERP.onApproval('quotation', (a) => {
    const q = ERP.find('quotations', a.ref.id); if (!q || q.approvalId !== a.id || q.status !== 'pending_approval') return;
    const label = q.prospect || custName(q.customerId);
    if (a.status === 'approved') {
      st.patch('quotations', q.id, { status: 'sent', sentAt: nowIso(), approvedAt: nowIso() });
      SA.audit('QUOTE.SENT', { target: { type: 'quotation', id: q.id, label }, after: { status: 'sent', approval: a.id, discountPct: q.discountPct }, reason: 'بعد اعتماد الخصم' });
      advanceLead(q.leadId, 'proposal');
      if (q.repId) SA.notify({ title: 'تم اعتماد خصم عرض السعر ' + q.id, body: label + ' — العرض أصبح «مُرسل للعميل».', level: 'info', toUsers: [q.repId], link: '#/crm/quotes/' + q.id });
    } else if (a.status === 'rejected') {
      const why = (a.chain.find((x) => x.status === 'rejected') || {}).reason || '';
      st.patch('quotations', q.id, { status: 'rejected', rejectedReason: why, rejectedAt: nowIso(), rejectedBy: 'approval' });
      SA.audit('QUOTE.REJECTED', { target: { type: 'quotation', id: q.id, label }, after: { status: 'rejected', approval: a.id }, reason: why });
      if (q.repId) SA.notify({ title: 'رُفض خصم عرض السعر ' + q.id, body: label + (why ? ' — ' + why : ''), level: 'action', toUsers: [q.repId], link: '#/crm/quotes/' + q.id });
    } else if (a.status === 'changes_requested') {
      st.patch('quotations', q.id, { status: 'draft', changesNote: (a.changesNote && a.changesNote.note) || '' });
    }
  });

  /* ═════════════════════════ shared business actions ═════════════════════════ */
  function setStage(id, s, reason) {
    const l = ERP.find('leads', id); if (!l || l.stage === s) return; const before = { stage: l.stage, probability: leadProb(l) };
    st.patch('leads', id, (x) => { x.stage = s; x.probability = PROB[s]; x.updatedAt = nowIso(); if (s === 'won') { x.wonAt = nowIso(); x.nextAction = null; } if (s === 'lost') { x.lostReason = reason || x.lostReason || ''; x.lostAt = nowIso(); x.nextAction = null; } });
    SA.audit(s === 'lost' ? 'LEAD.LOST' : 'LEAD.STAGE_CHANGED', { target: { type: 'lead', id, label: leadName(l) }, before, after: { stage: s, probability: PROB[s] }, reason: reason || '' });
  }
  function advanceLead(leadId, s) { const l = leadId ? ERP.find('leads', leadId) : null; if (!l || OPEN_STAGES.indexOf(l.stage) < 0) return; if (STAGES.indexOf(l.stage) >= STAGES.indexOf(s)) return; setStage(l.id, s, ''); }
  async function changeStage(l, s) {
    if (!SA.can('crm.leads.edit')) { SA.toast('ليست من صلاحياتك (crm.leads.edit)', 'warn'); return false; }
    l = ERP.find('leads', l.id) || l; if (s === l.stage) return false;
    if (s === 'lost') return lostModal(l);
    if (s === 'won') { const r = await SA.confirm({ title: 'تسجيل الفرصة كمكسوبة', text: leadName(l) + ' — ' + money(l.value), impact: ['المرحلة تتحول إلى «مكسوب» والاحتمال 100%.', l.customerId ? 'العميل مسجّل بالفعل: ' + custName(l.customerId) : 'يُنصح بتحويله لعميل لإنشاء أمر البيع.'], confirmLabel: 'تأكيد' }); if (!r.ok) return false; }
    try { await SA.api(() => setStage(l.id, s)); } catch (e) { SA.fail(e); return false; }
    SA.toast('تم نقل «' + leadName(l) + '» إلى «' + stageLabel(s) + '»', 'success'); return true;
  }
  async function lostModal(l) {
    if (!SA.can('crm.leads.edit')) { SA.toast('ليست من صلاحياتك (crm.leads.edit)', 'warn'); return false; }
    const fR = SA.form.field({ name: 'reason', label: 'سبب الخسارة', type: 'select', required: true, options: [['', 'اختر السبب…']].concat(LOST_REASONS.map((x) => [x, x])) });
    const fN = SA.form.field({ name: 'note', label: 'تفاصيل (اختياري)', type: 'textarea', rows: 2, placeholder: 'مثلاً: المنافس قدّم سعرًا أقل 8% مع توريد أسرع' });
    const r = await formModal({ title: 'تسجيل خسارة الفرصة', subtitle: leadName(l) + ' — ' + money(l.value), icon: 'xcircle', danger: true, confirmLabel: 'تسجيل الخسارة', okIcon: 'xcircle', fields: [fR, fN], onSubmit: async (v) => { await SA.api(() => setStage(l.id, 'lost', v.reason + (v.note ? ' — ' + v.note.trim() : ''))); return true; } });
    if (r) SA.toast('تم تسجيل خسارة الفرصة وسببها', 'success'); return !!r;
  }
  function createCustomerFromLead(leadId, v) {
    const l = ERP.find('leads', leadId); const cid = st.nextId('customers', 'C', 3); const seg = v.segment;
    const rec = { id: cid, code: 'CUS-' + cid.slice(2), name: String(v.name || leadName(l)).trim(), type: seg === 'contractor' ? 'contractor' : seg === 'dealer' || seg === 'export' ? 'dealer' : 'direct', city: v.city || l.city || '', contacts: [{ name: v.contact || l.name, phone: v.phone || l.phone || '' }],
      salesRepId: v.repId || l.ownerId || meId(), priceListId: v.priceListId || PL_BY_SEG[seg] || 'PL-01', status: 'active', balance: 0, openOrders: 0, segment: seg, region: v.region || '', creditLimit: Math.max(0, Number(v.creditLimit) || 0), termsDays: Number(v.termsDays) || 0, tier: 'C', since: String(new Date().getFullYear()), leadId, export: seg === 'export', createdAt: nowIso(), createdBy: meId() };
    st.insert('customers', rec);
    const before = { stage: l.stage }; const ix = OPEN_STAGES.indexOf(l.stage); const ns = ix >= 0 && ix < 3 ? 'proposal' : l.stage;
    st.patch('leads', leadId, { customerId: cid, convertedAt: nowIso(), stage: ns, probability: PROB[ns], updatedAt: nowIso() });
    SA.audit('CUSTOMER.CREATED', { target: { type: 'customer', id: cid, label: rec.name }, after: { segment: seg, priceList: rec.priceListId, rep: SA.userName(rec.salesRepId), creditLimit: rec.creditLimit, fromLead: leadId }, area: 'crm' });
    SA.audit('LEAD.CONVERTED', { target: { type: 'lead', id: leadId, label: leadName(l) }, before, after: { customer: cid, stage: ns } });
    return cid;
  }
  /** convert a lead → new customer (C-0xx / CUS-0xx) and optionally open a new quotation for it. Resolves with the customer id or null. */
  async function convertLead(l, o) {
    o = o || {}; l = ERP.find('leads', l.id || l) || l;
    if (!SA.can('crm.leads.edit')) { SA.toast('ليست من صلاحياتك (crm.leads.edit)', 'warn'); return null; }
    if (l.customerId) { if (o.openQuote) SA.nav('crm/quotes/new', { query: { customer: l.customerId, lead: l.id } }); return l.customerId; }
    const segDefault = l.interest === 'foam' ? 'project' : l.interest === 'clad' ? 'contractor' : 'dealer';
    const regionGuess = /مسقط|صلالة|عُمان/.test(l.city + l.company) ? 'الخليج' : /إسكندرية|الإسكندرية/.test(l.city) ? 'الإسكندرية' : /أسيوط|المنيا|سوهاج|قنا/.test(l.city) ? 'الصعيد' : /طنطا|المنصورة|دمياط|الزقازيق|بنها/.test(l.city) ? 'الدلتا' : /بورسعيد|السويس|الإسماعيلية|رأس سدر/.test(l.city) ? 'القناة وسيناء' : 'القاهرة الكبرى';
    const reps = salesReps(); const own = scopeMode() === 'own';
    const fPl = SA.form.field({ name: 'priceListId', label: 'قائمة الأسعار', type: 'select', value: PL_BY_SEG[segDefault], options: get('priceLists').filter((p) => p.status !== 'archived').map((p) => [p.id, p.name + (p.factor != null ? ' (×' + p.factor + ')' : '')]) });
    const fields = [
      SA.form.field({ name: 'name', label: 'اسم العميل / الشركة', value: l.company || l.name, required: true, class: 'crm-wide' }),
      SA.form.field({ name: 'segment', label: 'الشريحة', type: 'select', value: segDefault, options: Object.keys(SEG).map((k) => [k, SEG[k]]), onChange: (v) => fPl.set(PL_BY_SEG[v] || 'PL-01') }),
      SA.form.field({ name: 'region', label: 'المنطقة', type: 'select', value: regionGuess, options: REGIONS.map((x) => [x, x]) }),
      SA.form.field({ name: 'city', label: 'المدينة', value: l.city || '' }),
      SA.form.field({ name: 'contact', label: 'جهة الاتصال', value: l.name || '' }),
      SA.form.field({ name: 'phone', label: 'الهاتف', type: 'tel', value: l.phone || '', rules: [SA.form.rules.phone] }),
      SA.form.field({ name: 'repId', label: 'المندوب المسؤول', type: 'select', value: l.ownerId || meId(), disabled: own, options: (own ? [me()] : reps).filter(Boolean).map((u) => [u.id, u.name]) }),
      fPl,
      SA.form.field({ name: 'creditLimit', label: 'حد الائتمان المبدئي (ج.م)', type: 'number', value: 0, min: 0, hint: 'تجريبي — 0 = نقدي. التعديل لاحقًا بصلاحية crm.customers.edit' }),
      SA.form.field({ name: 'termsDays', label: 'شروط السداد', type: 'select', value: '0', options: [['0', 'نقدي / مقدم'], ['30', '30 يومًا'], ['45', '45 يومًا'], ['60', '60 يومًا']] })
    ];
    const cid = await formModal({ title: 'تحويل العميل المحتمل إلى عميل', subtitle: l.id + ' — ' + leadName(l), icon: 'userplus', size: 'lg', grid: true, fields, okIcon: 'userplus', confirmLabel: o.openQuote ? 'إنشاء العميل وفتح عرض سعر' : 'إنشاء العميل',
      top: SA.alert('info', 'سيُنشأ عميل جديد بكود CUS-0xx مرتبط بهذا العميل المحتمل، ويُسجّل LEAD.CONVERTED في التدقيق.'),
      onSubmit: async (v) => { if (own) v.repId = meId(); let id; await SA.api(() => { id = createCustomerFromLead(l.id, v); }); return id; } });
    if (!cid) return null;
    SA.toast('تم إنشاء العميل ' + cid + ' (' + (ERP.customer(cid) || {}).code + ')', 'success');
    if (o.openQuote) SA.nav('crm/quotes/new', { query: { customer: cid, lead: l.id } });
    return cid;
  }
  function nextActId() { let max = 0; get('activities').forEach((a) => { const m = /^ACT-(\d+)$/.exec(a.id || ''); if (m) max = Math.max(max, +m[1]); }); return 'ACT-' + (max + 1); }
  async function logActivity(o) {
    o = o || {};
    if (!SA.can('crm.activities.create')) { SA.toast('ليست من صلاحياتك (crm.activities.create)', 'warn'); return null; }
    const leads = myLeads().filter((l) => OPEN_STAGES.indexOf(l.stage) >= 0 || l.id === o.leadId); const custs = myCustomers();
    const d = new Date(); const hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const fKind = SA.form.field({ name: 'kind', label: 'نوع النشاط', type: 'radio', value: o.kind || 'call', options: Object.keys(ACT).map((k) => [k, ACT[k][0]]), class: 'crm-wide' });
    const fRel = SA.form.field({ name: 'rel', label: 'مرتبط بـ', type: 'select', required: true, value: o.leadId ? 'L:' + o.leadId : o.customerId ? 'C:' + o.customerId : '', class: 'crm-wide', options: [['', 'اختر عميلًا أو عميلًا محتملًا…']].concat(leads.map((l) => ['L:' + l.id, 'عميل محتمل — ' + leadName(l)]), custs.map((c) => ['C:' + c.id, 'عميل — ' + c.name])) });
    const fMode = SA.form.field({ name: 'mode', label: 'الحالة', type: 'radio', value: o.planned ? 'plan' : 'done', options: [['done', 'تم', 'تسجيل نشاط حدث بالفعل'], ['plan', 'مجدول', 'موعد قادم يظهر في أجندة اليوم']], class: 'crm-wide' });
    const fDate = SA.form.field({ name: 'date', label: 'التاريخ', type: 'date', value: o.date || today(), required: true });
    const fTime = SA.form.field({ name: 'time', label: 'الوقت', type: 'time', value: o.time || hhmm });
    const fNote = SA.form.field({ name: 'note', label: 'الملاحظات / النتيجة', type: 'textarea', rows: 3, required: true, value: o.note || '', class: 'crm-wide', placeholder: 'مثال: مهتم بعينات ألوان C132 وC160 ويطلب زيارة للمصنع' });
    const lead0 = o.leadId ? ERP.find('leads', o.leadId) : null;
    const fAdv = lead0 && lead0.stage === 'new' ? SA.form.field({ name: 'advance', label: 'انقل المرحلة إلى «تم التواصل»', type: 'checkbox', value: true, class: 'crm-wide' }) : null;
    const res = await formModal({ title: 'تسجيل نشاط مبيعات', icon: 'phone', size: 'md', grid: true, fields: [fKind, fRel, fMode, fDate, fTime, fNote, fAdv], confirmLabel: 'حفظ النشاط',
      onSubmit: async (v) => {
        const rel = String(v.rel); const leadId = rel.indexOf('L:') === 0 ? rel.slice(2) : null; const customerId = rel.indexOf('C:') === 0 ? rel.slice(2) : null;
        const iso = new Date(v.date + 'T' + (v.time || '12:00') + ':00').toISOString(); const done = v.mode !== 'plan'; let id;
        await SA.api(() => {
          id = nextActId();
          st.insert('activities', { id, kind: v.kind || 'call', leadId, customerId, soId: o.soId || null, ownerId: meId(), at: iso, note: String(v.note).trim(), done, planned: !done, doneAt: done ? nowIso() : null, createdAt: nowIso() }, true);
          SA.audit('ACTIVITY.LOGGED', { target: { type: 'activity', id, label: (ACT[v.kind] || ['نشاط'])[0] + ' — ' + (leadId ? leadName(ERP.find('leads', leadId)) : custName(customerId)) }, after: { kind: v.kind, done, at: iso }, area: 'crm' });
          if (leadId) { st.patch('leads', leadId, { updatedAt: nowIso() }); if (v.advance && done) setStage(leadId, 'contacted', 'تم أول تواصل'); }
        });
        return id;
      } });
    if (res) SA.toast('تم حفظ النشاط', 'success');
    return res;
  }
  async function markDone(a) {
    if (!SA.can('crm.activities.create')) { SA.toast('ليست من صلاحياتك (crm.activities.create)', 'warn'); return; }
    const fOut = SA.form.field({ name: 'outcome', label: 'نتيجة النشاط', type: 'textarea', rows: 3, required: true, placeholder: 'ماذا حدث؟ وما الخطوة التالية؟' });
    const r = await formModal({ title: 'إتمام النشاط', subtitle: (ACT[a.kind] || ['نشاط'])[0] + ' — ' + a.note, icon: 'checkcircle', fields: [fOut], confirmLabel: 'تم',
      onSubmit: async (v) => { await SA.api(() => { st.patch('activities', a.id, { done: true, planned: false, doneAt: nowIso(), outcome: String(v.outcome).trim() }); SA.audit('ACTIVITY.DONE', { target: { type: 'activity', id: a.id, label: a.note }, after: { outcome: String(v.outcome).trim() }, area: 'crm' }); if (a.leadId) st.patch('leads', a.leadId, { updatedAt: nowIso() }); }); return true; } });
    if (r) SA.toast('تم تسجيل إتمام النشاط', 'success');
  }

  /* ── item picker (grouped by family, colour swatches) ── */
  function pickItems(o) {
    o = o || {};
    return new Promise((resolve) => {
      const sel = new Set(); const pre = new Set(o.selected || []); let fam = 'all'; let q = '';
      const grid = h('div.crm-pick-grid', { role: 'list' }); const count = h('b.num', {}, '0');
      function draw() {
        SA.clear(grid);
        const list = get('items').filter((i) => (i.kind === 'fg' || i.kind === 'acc') && (fam === 'all' || i.family === fam) && (!q || (i.name + ' ' + i.code).toLowerCase().indexOf(q) >= 0));
        ['door', 'clad', 'foam', 'acc'].forEach((f) => {
          const its = list.filter((i) => i.family === f); if (!its.length) return;
          grid.append(h('div.crm-famhead', {}, FAM_IMG[f] ? h('img', { src: '../../assets/images/products/' + FAM_IMG[f] + '.png', alt: '' }) : h('span.erp-item-ico', {}, SA.icon('layers', 'icon-sm')), h('span', {}, ERP.families[f]), h('small', {}, its.length + ' صنف')));
          its.forEach((i) => {
            const avail = ERP.stock.available(i.id, ERP.stock.FG); const had = pre.has(i.id);
            grid.append(h('button.crm-pick', { type: 'button', role: 'listitem', 'aria-pressed': String(sel.has(i.id)), disabled: had, onclick: (e) => { if (sel.has(i.id)) sel.delete(i.id); else sel.add(i.id); e.currentTarget.setAttribute('aria-pressed', String(sel.has(i.id))); count.textContent = String(sel.size); } },
              U.itemCell(i.id), h('span.crm-pick-meta', {}, h('span', {}, 'سعر القائمة ', h('b.num', {}, money(i.price))), h('span', {}, had ? 'مضاف بالفعل' : 'متاح ' + fm.num(avail)))));
          });
        });
        if (!grid.children.length) grid.append(SA.empty({ icon: 'search', title: 'لا أصناف مطابقة', text: 'جرّب كود الموديل (D101) أو كود اللون (C132).' }));
      }
      const search = h('input.input', { type: 'search', placeholder: 'ابحث بالموديل أو اللون أو الكود…', 'aria-label': 'بحث الأصناف', oninput: SA.debounce((e) => { q = e.target.value.trim().toLowerCase(); draw(); }, 120) });
      const seg = SA.segmented([['all', 'الكل'], ['door', 'أبواب'], ['clad', 'تجاليد'], ['foam', 'فوم بورد'], ['acc', 'إكسسوارات']], 'all', (v) => { fam = v; draw(); });
      const m = SA.modal({ title: 'اختيار الأصناف', subtitle: 'الأسعار هنا أسعار القائمة — سعر العميل يُحسب حسب قائمة أسعاره', icon: 'box', size: 'lg', focus: search,
        body: h('div', {}, h('div.crm-row', { style: { marginBottom: '12px' } }, h('div.input-wrap.sap-search', { style: { flex: '1', minWidth: '220px' } }, SA.icon('search'), search), seg), grid),
        foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', 'data-crm': 'pick-add', onclick: () => m.close(Array.from(sel)) }, SA.icon('plus', 'icon-sm'), 'إضافة ', count, ' صنف')] });
      draw(); m.closed.then((r) => resolve(Array.isArray(r) && r.length ? r : null));
    });
  }
  /* ── editable lines (quote builder + new order) ── */
  function lineEditor(o) {
    const lines = (o.lines || []).map((l) => ({ itemId: l.itemId, qty: Number(l.qty) || 0, price: l.price != null ? Number(l.price) : null, edited: l.price != null }));
    lines.forEach((l) => { if (l.price == null) l.price = o.priceOf(l.itemId); });
    const body = h('tbody'); const changed = () => { if (o.onChange) o.onChange(); };
    function row(l, i) {
      const it = ERP.item(l.itemId) || {}; const list = o.priceOf(l.itemId);
      const tot = h('b.num', {}, money(l.qty * l.price)); const sHint = h('small.crm-hint'); const pHint = h('small.crm-hint');
      const stockHint = () => { const av = ERP.stock.available(l.itemId, ERP.stock.FG); sHint.className = 'crm-hint' + (av < l.qty ? ' is-warn' : ''); sHint.textContent = av >= l.qty ? 'متاح ' + fm.num(av) + ' في المخزون التام' : 'متاح ' + fm.num(av) + ' — يُصنَّع ' + fm.num(l.qty - av); };
      const priceHint = () => { const d = list ? (list - l.price) / list : 0; pHint.className = 'crm-hint' + (d > 0.001 ? ' is-warn' : ''); pHint.textContent = Math.abs(d) < 0.001 ? 'حسب قائمة الأسعار' : d > 0 ? 'أقل من القائمة ' + fm.pct(d, 1) : 'أعلى من القائمة'; };
      const qty = h('input.input.crm-num', { type: 'number', min: '1', step: '1', value: l.qty, 'aria-label': 'الكمية — ' + (it.name || l.itemId), oninput: (e) => { l.qty = Math.max(0, Number(e.target.value) || 0); tot.textContent = money(l.qty * l.price); stockHint(); changed(); } });
      const price = h('input.input.crm-num', { type: 'number', min: '0', step: '1', value: l.price, disabled: o.lockPrice, 'aria-label': 'سعر الوحدة — ' + (it.name || l.itemId), oninput: (e) => { l.price = Math.max(0, Number(e.target.value) || 0); l.edited = true; tot.textContent = money(l.qty * l.price); priceHint(); changed(); } });
      stockHint(); priceHint();
      return h('tr', {}, h('td', {}, U.itemCell(l.itemId)), h('td', {}, qty, h('small.crm-hint', {}, ERP.uom[it.uom] || ''), sHint), h('td', {}, price, pHint), h('td.num', {}, tot),
        h('td', {}, SA.btn({ label: 'حذف البند', icon: 'trash', kind: 'ghost', size: 'sm', iconOnly: true, onClick: () => { lines.splice(i, 1); draw(); changed(); } })));
    }
    function draw() { SA.clear(body); if (!lines.length) body.append(h('tr', {}, h('td', { colspan: 5 }, SA.empty({ icon: 'box', title: 'لا توجد بنود بعد', text: 'أضف أصنافًا من الكتالوج — الأبواب والتجاليد والفوم بورد بألوانها.' })))); else lines.forEach((l, i) => body.append(row(l, i))); }
    const add = SA.btn({ label: 'إضافة أصناف', icon: 'plus', kind: 'ghost', attrs: { 'data-crm': 'add-items' }, onClick: async () => { const ids = await pickItems({ selected: lines.map((l) => l.itemId) }); if (!ids) return; ids.forEach((id) => { if (lines.some((l) => l.itemId === id)) return; lines.push({ itemId: id, qty: defaultQty(ERP.item(id)), price: o.priceOf(id), edited: false }); }); draw(); changed(); } });
    const el = h('div.crm-lines', {}, h('div.table-wrap', {}, h('table.table.crm-ltable', {}, h('thead', {}, h('tr', {}, ['الصنف', 'الكمية', 'سعر الوحدة', 'الإجمالي', h('span.sap-sr', {}, 'حذف')].map((x) => h('th', {}, x)))), body)), h('div.crm-row', { style: { marginTop: '10px' } }, add));
    draw();
    return { el, get: () => lines.filter((l) => l.qty > 0).map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price })), reprice() { lines.forEach((l) => { if (!l.edited) l.price = o.priceOf(l.itemId); }); draw(); changed(); }, add(itemId, qty) { if (!lines.some((l) => l.itemId === itemId)) lines.push({ itemId, qty: qty || defaultQty(ERP.item(itemId)), price: o.priceOf(itemId), edited: false }); draw(); changed(); } };
  }
  /** what will happen on submit (approval / auto-confirm / reservations / work orders) */
  function predictBox(d, title) {
    if (!d.lines.length) return null; const t = F.totals(d); const need = needsApproval(d); const rows = [];
    rows.push(need ? h('li.is-warn', {}, SA.icon('inbox', 'icon-sm'), h('span', {}, 'يحتاج اعتماد: ', h('b', {}, approvalChainFor(d)), ' — ', need)) : h('li', {}, SA.icon('checkcircle', 'icon-sm'), h('span', {}, 'ضمن حدود المندوب — يتأكد تلقائيًا ويُحجز المخزون')));
    d.lines.forEach((l) => {
      const av = ERP.stock.available(l.itemId, ERP.stock.FG); const take = Math.min(av, l.qty); const it = ERP.item(l.itemId) || {}; const ln = lineOf(F.lineFor(l.itemId));
      rows.push(h('li' + (take < l.qty && ln.status === 'down' ? '.is-warn' : ''), {}, SA.icon(take >= l.qty ? 'box' : 'factory', 'icon-sm'), h('span', {}, h('b', {}, it.code || l.itemId), ': ', take >= l.qty ? 'متاح بالكامل — يُحجز ' + fm.num(l.qty) : (take > 0 ? 'يُحجز ' + fm.num(take) + ' ويُصنَّع ' : 'يُصنَّع ') + fm.num(l.qty - take) + ' (أمر تشغيل على ' + (ln.code || F.lineFor(l.itemId)) + ')' + (ln.status === 'down' ? ' — الخط متوقف حاليًا' : ''))));
    });
    return h('div.crm-predict', {}, h('b', {}, title || 'ماذا سيحدث عند الإرسال؟'), h('ul', {}, rows), h('small', {}, 'الإجمالي ' + money(t.total) + ' · حدود الاعتماد تجريبية — القيم الفعلية Open (بند 33)'));
  }
  /** credit check (demo): customer.balance + order total > creditLimit → warning (no automatic block — بند 41) */
  function creditBox(cid, add) {
    const c = cid ? ERP.customer(cid) : null; if (!c) return null; const lim = c.creditLimit || 0; const bal = c.balance || 0;
    if (!lim) return SA.alert('info', h('b', {}, 'عميل نقدي / بدون حد ائتمان: '), 'يُحصَّل مقدمًا أو عند التسليم حسب سياسة المالية.');
    const used = bal + (add || 0); const v = used / lim; const openV = sum(openOrdersOf(c.id), (o) => F.totals(o).total);
    return h('div.crm-credit', {}, CH.meter(v, { label: 'حد الائتمان (تجريبي)', text: fm.pct(v), tone: v > 1 ? 'danger' : v > 0.8 ? 'warning' : 'success' }),
      h('small', {}, 'الرصيد المستحق ' + money(bal) + (add ? ' + هذا الطلب ' + money(add) : '') + ' من حد ' + money(lim) + ' · طلبات مفتوحة أخرى ' + money(openV)),
      v > 1 ? SA.alert('warning', h('b', {}, 'تجاوز حد الائتمان: '), 'الطلب يُسجَّل لكن يُنصح بمراجعة المالية قبل التنفيذ (تنبيه تجريبي — بلا إيقاف تلقائي، بند 41).') : null);
  }
  /** "what happened" after submit / call confirmation / quote acceptance */
  function outcomeView(soId, result) {
    const so = ERP.find('salesOrders', soId); if (!so) return h('div'); const t = F.totals(so); const items = [];
    const li = (icon, tone, main, sub) => h('li.crm-out-' + tone, {}, h('span.crm-out-ico', {}, SA.icon(icon, 'icon-sm')), h('div', {}, h('b', {}, main), sub ? h('small', {}, sub) : null));
    items.push(li('cart', 'info', 'أمر البيع ' + so.id + ' — ' + money(t.total), so.lines.length + ' صنف · ' + custName(so.customerId) + ' · الحالة: ' + stLabel('so', so.status)));
    if (so.status === 'pending_approval') { const ap = ERP.find('approvals', so.approvalId); items.push(li('inbox', 'warning', 'أُرسل للاعتماد ' + (ap ? ap.id : ''), ap ? 'السلسلة: ' + ap.chain.map((c) => c.label).join(' ← ') + ' — وصل إشعار للمعتمد الأول. بعد الاعتماد يتأكد الطلب تلقائيًا.' : '')); }
    else if (so.status === 'pending_review') items.push(li('phone', 'warning', 'بانتظار مكالمة تأكيد التاجر', 'الطلب يبقى في قائمة طلبات التجار (بند 48).'));
    else if (so.status === 'cancelled') items.push(li('xcircle', 'danger', 'تم إلغاء الطلب', so.cancelReason || ''));
    else if (['confirmed', 'in_production', 'ready'].indexOf(so.status) >= 0) {
      items.push(li('checkcircle', 'success', 'تم تأكيد الطلب', 'تأكيد ' + SA.fmt.rel(so.confirmedAt) + ' بواسطة ' + SA.userName(so.confirmedBy)));
      const res = so.lines.filter((l) => l.reservedQty > 0); if (res.length) items.push(li('box', 'success', 'حجز من مخزون المنتج التام (W-01)', res.map((l) => (ERP.item(l.itemId) || {}).code + ': ' + fm.num(l.reservedQty) + ' من ' + fm.num(l.qty)).join(' · ')));
      const wos = (so.woIds || []).map((w) => ERP.find('workOrders', w)).filter(Boolean);
      if (wos.length) { items.push(li('factory', 'info', wos.length + ' أمر تشغيل للكميات غير المتاحة', 'تم إشعار مدير الإنتاج — تظهر في التصنيع وMRP فورًا.')); items.push(h('li.crm-out-wos', {}, wos.map((w) => h('div', {}, U.docLink(w.id), h('span', {}, ERP.itemName(w.itemId) + ' — '), h('b.num', {}, fm.num(w.qty)), h('span', {}, ' على ' + (lineOf(w.lineId).code || w.lineId)), U.status('wo', w.status), lineOf(w.lineId).status === 'down' ? SA.chip('الخط متوقف حاليًا', 'danger') : null)))); }
      else items.push(li('truck', 'success', 'كل البنود متاحة — جاهز لإذن التسليم', 'تم إشعار المخازن والشحن.'));
    } else if (so.status === 'rejected') items.push(li('xcircle', 'danger', 'مرفوض', so.rejectedReason || ''));
    return h('div.crm-out', {}, h('ul.crm-outlist', {}, items), h('div', {}, U.sub('دورة المستند'), U.chain(soId)));
  }
  function showOutcome(soId, result, title) {
    const so = ERP.find('salesOrders', soId); if (!so) return null;
    const m = SA.modal({ title: title || 'نتيجة الإرسال', subtitle: soId + ' — ' + custName(so.customerId), icon: so.status === 'pending_approval' ? 'inbox' : so.status === 'cancelled' ? 'xcircle' : 'checkcircle', size: 'lg', body: outcomeView(soId, result),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إغلاق'), h('button.btn.btn-primary', { type: 'button', 'data-crm': 'open-so', onclick: () => { m.close(null); SA.nav('crm/orders/' + soId); } }, SA.icon('eye', 'icon-sm'), 'فتح أمر البيع')] });
    return m;
  }
  function notifyDealer(soId, result) {
    const so = ERP.find('salesOrders', soId); if (!so) return; const ids = get('users').filter((u) => u.customerId === so.customerId && u.status === 'active').map((u) => u.id); if (!ids.length) return;
    const txt = { confirmed: 'تم تأكيد طلبك بعد المكالمة وبدأ التنفيذ.', no_answer: 'حاولنا الاتصال بك لتأكيد الطلب — سنعاود الاتصال في الوقت المفضل.', changes: 'سجّلنا التعديلات المطلوبة على طلبك.', cancelled: 'تم إلغاء طلبك بناءً على المكالمة.' }[result];
    SA.notify({ title: 'طلبك ' + soId, body: txt, level: 'info', toUsers: ids, link: '#/portal/orders/' + soId });
  }
  /** «سجّل نتيجة المكالمة» → ERP.flow.logCall(soId, 'confirmed'|'no_answer'|'changes'|'cancelled', note) */
  async function callModal(soId) {
    const so = ERP.find('salesOrders', soId); if (!so) return null;
    if (!SA.can('crm.dealer_orders.review')) { SA.toast('ليست من صلاحياتك (crm.dealer_orders.review)', 'warn'); return null; }
    if (so.status !== 'pending_review') { SA.toast('الطلب ليس بانتظار مكالمة التأكيد (الحالة: ' + stLabel('so', so.status) + ')', 'warn'); return null; }
    const t = F.totals(so); const c = ERP.customer(so.customerId) || {}; const phone = (so.call && so.call.phone) || ((c.contacts || [])[0] || {}).phone || '';
    const fRes = SA.form.field({ name: 'result', label: 'نتيجة المكالمة', type: 'radio', required: true, options: [['confirmed', 'تم التأكيد', 'التاجر أكّد الطلب — يكمل التنفيذ: اعتماد أو حجز مخزون وأوامر تشغيل'], ['no_answer', 'لم يرد', 'يبقى الطلب في قائمة الانتظار لإعادة الاتصال'], ['changes', 'طلب تعديلات', 'سجّل المطلوب — يبقى الطلب قيد المراجعة لحين التعديل'], ['cancelled', 'ألغى الطلب', 'يُلغى الطلب ويُبلَّغ التاجر']] });
    const fNote = SA.form.field({ name: 'note', label: 'ملاحظات المكالمة', type: 'textarea', rows: 3, placeholder: 'مثال: أكّد الكميات وطلب التسليم صباحًا', rules: [(v) => (['changes', 'cancelled'].indexOf(fRes.get()) >= 0 && String(v || '').trim().length < 3 ? 'اكتب التفاصيل (3 أحرف على الأقل)' : null)] });
    const r = await formModal({ title: 'نتيجة مكالمة التأكيد — ' + so.id, subtitle: c.name + ' · ' + money(t.total), icon: 'phone', size: 'md', fields: [fRes, fNote], confirmLabel: 'حفظ النتيجة',
      top: h('div.crm-qcontact', {}, h('a.crm-phone', { href: 'tel:' + phone.replace(/\s/g, '') }, SA.icon('phone', 'icon-sm'), h('span.num', { dir: 'ltr' }, phone || '—')), h('span', {}, SA.icon('clock', 'icon-sm'), 'الوقت المفضل: ', h('b', {}, (so.call && so.call.preferredTime) || 'غير محدد'))),
      extra: predictBox(so, 'عند اختيار «تم التأكيد»:'),
      onSubmit: async (v) => { let res; await SA.api(() => { res = F.logCall(soId, v.result, String(v.note || '').trim()); notifyDealer(soId, v.result); }); return { res, result: v.result }; } });
    if (!r) return null;
    if (r.result === 'confirmed') showOutcome(soId, r.res, 'تم تأكيد طلب التاجر بعد المكالمة');
    else SA.toast({ no_answer: 'تم تسجيل «لم يرد» — الطلب يبقى في قائمة الانتظار', changes: 'تم تسجيل طلب التعديلات — الطلب ما زال قيد المراجعة', cancelled: 'تم إلغاء الطلب بناءً على المكالمة' }[r.result], r.result === 'cancelled' ? 'warn' : 'success');
    return r;
  }

  /* ═════════════════════════ 1. DASHBOARD ═════════════════════════ */
  function dashTodo() {
    const out = []; const os = myOrders(); const t0 = today();
    os.filter((o) => o.source === 'portal' && o.status === 'pending_review').forEach((o) => out.push({ tone: (Date.now() - new Date(o.submittedAt || o.createdAt)) / 3600000 >= 24 ? 'danger' : 'warning', icon: 'phone', title: 'اتصل بالتاجر: ' + custName(o.customerId), sub: o.id + ' · ' + money(F.totals(o).total) + ' · وصل ' + SA.fmt.rel(o.submittedAt || o.createdAt), href: '#/crm/dealer-orders', cta: 'سجّل المكالمة' }));
    os.filter((o) => (o.woIds || []).some((w) => (ERP.find('workOrders', w) || {}).status === 'on_hold') && OPEN_SO.indexOf(o.status) >= 0).forEach((o) => out.push({ tone: 'danger', icon: 'factory', title: 'طلب متأثر بتوقف الإنتاج: ' + o.id, sub: custName(o.customerId) + ' · موعد التسليم ' + fm.date(o.promisedDate), href: '#/crm/orders/' + o.id, cta: 'التفاصيل' }));
    os.filter((o) => o.status === 'pending_approval').forEach((o) => out.push({ tone: 'warning', icon: 'inbox', title: 'بانتظار الاعتماد: ' + o.id, sub: custName(o.customerId) + ' · ' + money(F.totals(o).total) + (o.discountPct ? ' · خصم ' + o.discountPct + '%' : ''), href: '#/crm/orders/' + o.id, cta: 'متابعة' }));
    os.filter(isLate).forEach((o) => out.push({ tone: 'danger', icon: 'clock', title: 'متأخر عن موعد التسليم: ' + o.id, sub: custName(o.customerId) + ' · كان ' + fm.date(o.promisedDate), href: '#/crm/orders/' + o.id, cta: 'افتح' }));
    myQuotes().filter((q) => q.status === 'pending_approval').forEach((q) => out.push({ tone: 'warning', icon: 'receipt', title: 'خصم عرض سعر بانتظار الاعتماد: ' + q.id, sub: (q.prospect || custName(q.customerId)) + ' · خصم ' + q.discountPct + '%', href: '#/crm/quotes/' + q.id, cta: 'افتح' }));
    myQuotes().filter((q) => q.status === 'sent' && q.validUntil && ERP.daysBetween(t0, q.validUntil) <= 3).forEach((q) => out.push({ tone: q.validUntil < t0 ? 'danger' : 'warning', icon: 'receipt', title: (q.validUntil < t0 ? 'انتهت صلاحية العرض: ' : 'عرض سعر ينتهي قريبًا: ') + q.id, sub: (q.prospect || custName(q.customerId)) + ' · صالح حتى ' + fm.date(q.validUntil), href: '#/crm/quotes/' + q.id, cta: 'تابع' }));
    myLeads().filter((l) => OPEN_STAGES.indexOf(l.stage) >= 0 && l.nextAt && l.nextAt <= t0).forEach((l) => out.push({ tone: l.nextAt < t0 ? 'danger' : 'info', icon: 'userplus', title: (l.nextAction || 'متابعة') + ': ' + leadName(l), sub: (l.nextAt < t0 ? 'متأخرة منذ ' + fm.date(l.nextAt) : 'مستحقة اليوم') + ' · ' + money(l.value) + ' · ' + SA.userName(l.ownerId), href: '#/crm/leads/' + l.id, cta: 'افتح' }));
    const rank = { danger: 0, warning: 1, info: 2 }; return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
  }
  function todoList(items, max) {
    if (!items.length) return SA.empty({ icon: 'checkcircle', title: 'لا شيء ينتظرك الآن', text: 'كل الطلبات والعروض والمتابعات في نطاقك تحت السيطرة.' });
    return h('ul.crm-todo', {}, items.slice(0, max || 9).map((x) => h('li', {}, h('span.crm-todo-ico.is-' + x.tone, {}, SA.icon(x.icon, 'icon-sm')), h('div.crm-todo-body', {}, h('b', {}, x.title), h('small', {}, x.sub)), x.href ? h('a.crm-todo-cta', { href: x.href }, x.cta || 'افتح') : null)));
  }
  function localInsights() {
    const out = []; const os = myOrders();
    const held = os.find((o) => OPEN_SO.indexOf(o.status) >= 0 && (o.woIds || []).some((w) => (ERP.find('workOrders', w) || {}).status === 'on_hold'));
    if (held) { const sh = get('shipments').find((s) => (s.soIds || []).indexOf(held.id) >= 0); out.push({ tone: 'danger', title: held.id + ' معرّض للتأخير — ' + custName(held.customerId), text: 'أمر تشغيل متوقف بسبب عطل خط ' + (lineOf((ERP.find('workOrders', held.woIds.find((w) => (ERP.find('workOrders', w) || {}).status === 'on_hold')) || {}).lineId).code || '') + '. موعد التسليم ' + fm.date(held.promisedDate) + (sh ? ' والشحنة ' + sh.id + ' تغادر ' + fm.date(sh.etd) : '') + '. بلّغ العميل مبكرًا وتابع قطعة الغيار.', actions: [{ label: 'افتح الطلب', route: 'crm/orders/' + held.id }] }); }
    const hot = myLeads().filter((l) => OPEN_STAGES.indexOf(l.stage) >= 0 && (l.score || 0) >= 75).sort((a, b) => b.value * leadProb(b) - a.value * leadProb(a))[0];
    if (hot) out.push({ tone: 'success', title: 'فرصة ساخنة: ' + leadName(hot), text: 'تقييم ' + hot.score + ' · ' + stageLabel(hot.stage) + ' · ' + money(hot.value) + '. الخطوة المقترحة: ' + (hot.nextAction || 'مكالمة متابعة') + ' قبل ' + fm.date(hot.nextAt) + '.', actions: [{ label: 'افتح الفرصة', route: 'crm/leads/' + hot.id }] });
    const dealer = os.filter((o) => o.source === 'portal' && o.status === 'pending_review'); if (dealer.length) out.push({ tone: 'warning', title: dealer.length + ' طلب من بوابة التجار بانتظار مكالمة', text: 'إجمالي ' + money(sum(dealer, (o) => F.totals(o).total)) + '. التأكيد السريع يحجز المخزون قبل الطلبات الأخرى.', actions: [{ label: 'طلبات التجار', route: 'crm/dealer-orders' }] });
    return out.slice(0, 3);
  }
  function renderDashboard(root, ctx) {
    ctx.setCrumbs([{ label: 'نظرة عامة' }, { label: 'لوحة المبيعات' }]);
    return SA.live(root, () => {
      const mk = ERP.monthKeys(12); const cur = mk[11], prev = mk[10]; const dom = new Date().getDate(); const dim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
      const invs = myInvoices(); const netBy = {}; invs.forEach((i) => { const k = String(i.issueDate || '').slice(0, 7); netBy[k] = (netBy[k] || 0) + (i.net || 0); });
      const colBy = {}; myReceipts().forEach((r) => { const k = String(r.date || '').slice(0, 7); colBy[k] = (colBy[k] || 0) + (r.amount || 0); });
      const mtd = netBy[cur] || 0; const prevSame = sum(invs.filter((i) => String(i.issueDate).slice(0, 7) === prev && Number(String(i.issueDate).slice(8, 10)) <= dom), (i) => i.net);
      const os = myOrders(); const booked = sum(os.filter((o) => BOOKED_SO.indexOf(o.status) >= 0 && bookedAt(o).slice(0, 7) === cur), (o) => F.totals(o).net);
      const tg = myTargets(); const target = sum(tg, (t) => t.target); const ach = ratio(mtd, target); const pace = dom / dim;
      const ls = myLeads(); const open = ls.filter((l) => OPEN_STAGES.indexOf(l.stage) >= 0); const weighted = weightedOf(ls);
      const won = ls.filter((l) => l.stage === 'won').length, lost = ls.filter((l) => l.stage === 'lost').length;
      const openO = os.filter((o) => OPEN_SO.indexOf(o.status) >= 0); const late = openO.filter(isLate);
      const qs = myQuotes(); const pendQ = qs.filter((q) => ['sent', 'pending_approval'].indexOf(qStatus(q)) >= 0);
      const dealer = os.filter((o) => o.source === 'portal' && o.status === 'pending_review');
      const kp = U.kpis([
        U.kpi({ label: 'مبيعات الشهر (مفوتر، صافي)', value: short(mtd), icon: 'coins', tone: target && ach >= pace * 0.9 ? 'success' : target ? 'warning' : '', trend: mk.slice(5).map((k) => netBy[k] || 0), delta: prevSame ? (mtd - prevSame) / prevSame : null, sub: (target ? 'الهدف ' + short(target) + ' · ' + fm.pct(ach) : 'لا يوجد هدف') + ' · محجوز بأوامر مؤكدة ' + short(booked), href: '#/crm/targets' }),
        U.kpi({ label: 'قيمة الفرص المرجّحة', value: short(weighted), icon: 'target', sub: open.length + ' فرصة مفتوحة · إجمالي ' + short(sum(open, (l) => l.value)), href: '#/crm/pipeline' }),
        U.kpi({ label: 'معدل الفوز', value: won + lost ? fm.pct(won / (won + lost)) : '—', icon: 'award', sub: 'مكسوب ' + won + ' · خاسر ' + lost, href: '#/crm/leads?stage=won' }),
        U.kpi({ label: 'أوامر مفتوحة', value: short(sum(openO, (o) => F.totals(o).total)), icon: 'cart', tone: late.length ? 'danger' : '', sub: openO.length + ' أمر' + (late.length ? ' · ' + late.length + ' متأخر' : ' · لا متأخرات'), href: '#/crm/orders' }),
        U.kpi({ label: 'عروض أسعار معلّقة', value: String(pendQ.length), icon: 'receipt', sub: short(sum(pendQ, (q) => F.totals(q).total)) + (pendQ.some((q) => q.status === 'pending_approval') ? ' · منها بانتظار اعتماد خصم' : ''), href: '#/crm/quotes' }),
        U.kpi({ label: 'طلبات تجار بانتظار الاتصال', value: String(dealer.length), icon: 'phone', tone: dealer.length ? 'warning' : 'success', sub: dealer.length ? 'أقدمها ' + SA.fmt.rel(dealer.map((o) => o.submittedAt || o.createdAt).sort()[0]) : 'لا يوجد', href: '#/crm/dealer-orders' })
      ]);
      const trend = SA.card({ title: 'اتجاه المبيعات — آخر 12 شهرًا', actions: [h('span.crm-muted', {}, 'صافي الفواتير مقابل التحصيلات')] }, CH.line({ labels: mk.map(monthShort), series: [{ name: 'صافي المبيعات (مفوتر)', values: mk.map((k) => netBy[k] || 0) }, { name: 'التحصيلات', values: mk.map((k) => colBy[k] || 0), dashed: true, color: ERP.palette[3] }], area: true, height: 230, title: 'المبيعات الشهرية' }));
      const funnel = SA.card({ title: 'مسار الفرص', actions: [h('a.sap-linkbtn', { href: '#/crm/pipeline' }, 'لوحة المسار')] }, CH.funnel(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won'].map((s) => { const l = ls.filter((x) => x.stage === s); return { label: stageLabel(s), value: sum(l, (x) => x.value), sub: l.length + ' فرصة' + (s !== 'won' ? ' · مرجّح ' + short(sum(l, (x) => (x.value || 0) * leadProb(x))) : '') }; }), { fmt: short }));
      const repsCard = SA.card({ title: scopeMode() === 'own' ? 'أدائي مقابل الهدف' : 'المندوبون مقابل الهدف (الشهر)', actions: [h('a.sap-linkbtn', { href: '#/crm/targets' }, 'الأهداف')] },
        tg.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, tg.map((t) => { const map = soRepMap(); const a = sum(invs.filter((i) => invRepOf(i, map) === t.repId && String(i.issueDate).slice(0, 7) === cur), (i) => i.net); const b = sum(os.filter((o) => o.repId === t.repId && BOOKED_SO.indexOf(o.status) >= 0 && bookedAt(o).slice(0, 7) === cur), (o) => F.totals(o).net); return h('div', {}, CH.meter(ratio(a, t.target), { label: SA.userName(t.repId), text: short(a) + ' / ' + short(t.target), tone: ratio(a, t.target) >= pace * 0.9 ? 'success' : 'warning' }), h('small.crm-muted', {}, 'محجوز بأوامر مؤكدة ' + short(b) + ' · الوتيرة المتوقعة ' + fm.pct(pace))); })) : SA.empty({ icon: 'target', title: 'لا توجد أهداف', text: 'حدد أهداف المندوبين من شاشة الأهداف.' }));
      const from90 = ERP.day(-90); const fam = {}; const byItem = {};
      invs.filter((i) => i.issueDate >= from90).forEach((i) => (i.lines || []).forEach((l) => { const it = ERP.item(l.itemId) || {}; const v = l.qty * l.price * (1 - (i.discountPct || 0) / 100); fam[it.family || 'acc'] = (fam[it.family || 'acc'] || 0) + v; byItem[l.itemId] = (byItem[l.itemId] || 0) + v; }));
      const famCard = SA.card({ title: 'المبيعات حسب العائلة (90 يومًا)' }, Object.keys(fam).length ? CH.donut(Object.keys(fam).map((k, i) => ({ label: FAM[k] || k, value: Math.round(fam[k]), color: ERP.palette[i] })), { fmt: short, center: short(sum(Object.values(fam))).replace(' ج.م', ''), sub: 'ج.م' }) : SA.empty({ icon: 'pie', title: 'لا مبيعات في الفترة' }));
      const top = Object.keys(byItem).map((k) => ({ id: k, v: byItem[k] })).sort((a, b) => b.v - a.v).slice(0, 6);
      const topCard = SA.card({ title: 'الأصناف الأعلى مبيعًا (90 يومًا)', actions: SA.can('crm.reports.view') ? [h('a.sap-linkbtn', { href: '#/crm/reports' }, 'التقارير')] : null }, top.length ? CH.bars(top.map((x, i) => { const it = ERP.item(x.id) || {}; return { label: it.name || x.id, sub: it.code, value: Math.round(x.v), color: ERP.palette[i % 3] }; }), { fmt: short }) : SA.empty({ icon: 'chart', title: 'لا مبيعات' }));
      const todo = dashTodo();
      const ins = U.insights('crm', 3); const aiList = ins.length ? ins : localInsights().map((x) => U.aiCard(x));
      return h('div.crm-page', {},
        head({ title: 'لوحة المبيعات', desc: 'المبيعات والفرص والطلبات في لمحة — كل رقم يتحدّث لحظيًا مع حركة الطلبات والفواتير.', actions: [SA.btn({ label: 'أمر بيع جديد', icon: 'plus', kind: 'primary', perm: 'crm.orders.create', onClick: () => SA.nav('crm/orders/new') }), SA.btn({ label: 'عرض سعر', icon: 'receipt', kind: 'ghost', perm: 'crm.quotes.create', onClick: () => SA.nav('crm/quotes/new') })] }),
        kp, U.grid(2, trend, funnel), U.grid(3, repsCard, famCard, topCard),
        U.grid(2, SA.card({ title: 'يحتاج إجراء', actions: [h('span.sap-count', {}, String(todo.length))] }, todoList(todo, 9)), SA.card({ title: 'توصيات ذكية', tags: ins.length ? null : U.demo('توصيات تجريبية من القواعد') }, aiList.length ? h('div.crm-ai', {}, aiList) : SA.empty({ icon: 'sparkle', title: 'لا توصيات الآن' }))));
    }, ['salesOrders', 'invoices', 'leads', 'quotations', 'targets', 'workOrders', 'receipts']);
  }

  /* ═════════════════════════ 2. LEADS ═════════════════════════ */
  function demoScore(v) { let s = 38; const val = Number(v.value) || 0; s += val >= 800000 ? 22 : val >= 300000 ? 14 : val >= 100000 ? 8 : 3; s += v.eventId || /إحالة/.test(v.source || '') ? 12 : /الموقع|الخط/.test(v.source || '') ? 8 : 4; s += v.interest === 'clad' ? 4 : v.interest === 'door' ? 3 : 2; return Math.max(30, Math.min(92, s)); }
  async function createLead(pre) {
    pre = pre || {}; if (!SA.can('crm.leads.create')) { SA.toast('ليست من صلاحياتك (crm.leads.create)', 'warn'); return null; }
    const reps = salesReps(); const own = scopeMode() === 'own';
    const fields = [
      SA.form.field({ name: 'name', label: 'اسم جهة الاتصال', required: true, value: pre.name || '' }),
      SA.form.field({ name: 'company', label: 'الشركة / الجهة', required: true, value: pre.company || '' }),
      SA.form.field({ name: 'phone', label: 'الهاتف', type: 'tel', required: true, rules: [SA.form.rules.phone], value: pre.phone || '' }),
      SA.form.field({ name: 'city', label: 'المدينة', value: pre.city || '' }),
      SA.form.field({ name: 'interest', label: 'الاهتمام', type: 'select', required: true, value: pre.interest || 'door', options: [['door', 'أبواب WPC & PVC'], ['clad', 'تجاليد WPC'], ['foam', 'ألواح فوم بورد']] }),
      SA.form.field({ name: 'value', label: 'القيمة المتوقعة (ج.م)', type: 'number', min: 0, value: pre.value || '' }),
      SA.form.field({ name: 'source', label: 'المصدر', type: 'select', value: pre.source || 'الموقع الإلكتروني', options: SOURCES.map((x) => [x, x]) }),
      SA.form.field({ name: 'eventId', label: 'المعرض (إن وجد)', type: 'select', value: pre.eventId || '', options: [['', '— بدون —']].concat(get('events').map((e) => [e.id, e.name])) }),
      SA.form.field({ name: 'ownerId', label: 'المسؤول', type: 'select', value: meId(), disabled: own, options: (own || !reps.length ? [me()] : reps).filter(Boolean).map((u) => [u.id, u.name]) }),
      SA.form.field({ name: 'nextAction', label: 'الخطوة التالية', type: 'select', value: 'مكالمة متابعة', options: ['مكالمة متابعة', 'إرسال عرض سعر', 'زيارة موقع', 'إرسال عينات', 'اجتماع مع الاستشاري'].map((x) => [x, x]) }),
      SA.form.field({ name: 'nextAt', label: 'موعد الخطوة التالية', type: 'date', value: ERP.day(1) }),
      SA.form.field({ name: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2, class: 'crm-wide' })
    ];
    const id = await formModal({ title: 'عميل محتمل جديد', icon: 'userplus', size: 'lg', grid: true, fields, okIcon: 'userplus', confirmLabel: 'إضافة',
      onSubmit: async (v) => {
        let lid; await SA.api(() => {
          lid = ERP.no('LD'); const ownerId = own ? meId() : v.ownerId || meId();
          const rec = { id: lid, name: v.name.trim(), company: v.company.trim(), city: v.city || '', interest: v.interest, stage: 'new', value: Number(v.value) || 0, ownerId, eventId: v.eventId || null, source: v.eventId ? 'معرض' : v.source, phone: v.phone, createdAt: nowIso(), updatedAt: nowIso(), nextAction: v.nextAction, nextAt: v.nextAt || ERP.day(1), probability: PROB.new, score: demoScore(v), lostReason: null, notes: v.notes || '', createdBy: meId() };
          st.insert('leads', rec, true);
          SA.audit('LEAD.CREATED', { target: { type: 'lead', id: lid, label: rec.company }, after: { value: rec.value, interest: rec.interest, source: rec.source, owner: SA.userName(ownerId) } });
          if (ownerId !== meId()) SA.notify({ title: 'عميل محتمل جديد مسند إليك', body: rec.company + ' — ' + money(rec.value), level: 'action', toUsers: [ownerId], link: '#/crm/leads/' + lid });
        }); return lid;
      } });
    if (id) { SA.toast('تمت إضافة العميل المحتمل ' + id, 'success'); SA.nav('crm/leads/' + id); }
    return id;
  }
  function renderLeads(root, ctx) {
    if (ctx.path[0]) return leadDetail(root, ctx, ctx.path[0]);
    ctx.setCrumbs([{ label: 'العملاء المحتملون والفرص' }, { label: 'العملاء المحتملون' }]);
    const kpiBox = h('div');
    const drawK = () => { SA.clear(kpiBox); const ls = myLeads(); const open = ls.filter((l) => OPEN_STAGES.indexOf(l.stage) >= 0); const t0 = today();
      kpiBox.append(U.kpis([U.kpi({ label: 'فرص مفتوحة', value: String(open.length), icon: 'userplus', sub: 'إجمالي ' + short(sum(open, (l) => l.value)) }), U.kpi({ label: 'القيمة المرجّحة', value: short(weightedOf(ls)), icon: 'target', sub: 'القيمة × الاحتمال' }), U.kpi({ label: 'فرص ساخنة', value: String(open.filter((l) => (l.score || 0) >= 75).length), icon: 'bolt', tone: 'success', sub: 'تقييم 75 فأكثر' }), U.kpi({ label: 'متابعات مستحقة', value: String(open.filter((l) => l.nextAt && l.nextAt <= t0).length), icon: 'clock', tone: open.some((l) => l.nextAt && l.nextAt < t0) ? 'danger' : '', sub: 'اليوم أو متأخرة' }), U.kpi({ label: 'من المعارض', value: String(ls.filter((l) => l.eventId).length), icon: 'calendar', sub: 'مكسوب ' + ls.filter((l) => l.eventId && l.stage === 'won').length })])); };
    const owners = uniq(myLeads().map((l) => l.ownerId)).map((id) => [id, SA.userName(id)]);
    const t = SA.table({
      caption: 'العملاء المحتملون', pageSize: 10, rows: () => myLeads(),
      columns: [
        { key: 'company', label: 'العميل المحتمل', sort: true, render: (l) => h('span.crm-cell', {}, h('b', {}, leadName(l)), h('small', {}, l.name + (l.city ? ' · ' + l.city : '') + (l.customerId ? ' · عميل ' + l.customerId : ''))) },
        { key: 'interest', label: 'الاهتمام', render: (l) => famChip(l.interest) },
        { key: 'stage', label: 'المرحلة', sort: (a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage), render: (l) => U.status('lead', l.stage) },
        { key: 'value', label: 'القيمة المتوقعة', sort: true, class: 'num', render: (l) => money(l.value) },
        { key: 'probability', label: 'الاحتمال', sort: (a, b) => leadProb(a) - leadProb(b), class: 'num', render: (l) => fm.pct(leadProb(l)) },
        { key: 'score', label: 'التقييم', sort: true, render: (l) => scoreBadge(l.score) },
        { key: 'source', label: 'المصدر', render: (l) => h('span.crm-cell', {}, h('b', {}, l.source || '—'), l.eventId ? h('small', {}, (ERP.find('events', l.eventId) || {}).name || l.eventId) : null) },
        { key: 'ownerId', label: 'المسؤول', render: (l) => repCell(l.ownerId) },
        { key: 'nextAt', label: 'الخطوة التالية', sort: true, render: (l) => (OPEN_STAGES.indexOf(l.stage) < 0 || !l.nextAt ? '—' : h('span.crm-cell', {}, h('b', { class: l.nextAt < today() ? 'crm-late' : null }, l.nextAction || 'متابعة'), h('small', {}, l.nextAt === today() ? 'اليوم' : fm.date(l.nextAt)))) }
      ],
      search: { placeholder: 'ابحث بالاسم أو الشركة أو الهاتف أو الكود…', keys: ['name', 'company', 'phone', 'city', 'id'] },
      filters: [{ key: 'stage', label: 'المرحلة', options: STAGES.map((s) => [s, stageLabel(s)]) }, { key: 'source', label: 'المصدر', options: SOURCES.map((s) => [s, s]) }, { key: 'interest', label: 'الاهتمام', options: [['door', 'أبواب'], ['clad', 'تجاليد'], ['foam', 'فوم بورد']] },
        owners.length > 1 ? { key: 'ownerId', label: 'المسؤول', options: owners } : null, { key: 'eventId', label: 'المعرض', options: get('events').map((e) => [e.id, e.name]) }].filter(Boolean),
      initial: { q: ctx.params.q || '', sort: { key: 'score', dir: 'desc' }, filters: { stage: ctx.params.stage || '', eventId: ctx.params.event || '' } },
      onRowClick: (l) => SA.nav('crm/leads/' + l.id),
      rowActions: (l) => [{ label: 'فتح', icon: 'eye', onClick: () => SA.nav('crm/leads/' + l.id) }, { label: 'تسجيل نشاط', icon: 'phone', onClick: () => logActivity({ leadId: l.id }) }, { label: 'تحويل لعميل + عرض سعر', icon: 'userplus', hidden: !!l.customerId || OPEN_STAGES.indexOf(l.stage) < 0, disabled: SA.can('crm.leads.edit') ? false : 'ليست من صلاحياتك', onClick: () => convertLead(l, { openQuote: true }) }],
      empty: { icon: 'userplus', title: 'لا يوجد عملاء محتملون', text: 'أضف أول عميل محتمل أو سجّل زوار المعارض.', action: { label: 'عميل محتمل جديد', perm: 'crm.leads.create', onClick: () => createLead() } }
    });
    root.append(h('div.crm-page', {}, head({ title: 'العملاء المحتملون', desc: 'من المعارض والموقع والواتساب والإحالات — قيّم، تابع، وحوّل إلى عميل وعرض سعر في خطوة واحدة.', actions: [SA.btn({ label: 'لوحة المسار', icon: 'layers', kind: 'ghost', perm: 'crm.pipeline.view', onClick: () => SA.nav('crm/pipeline') }), SA.btn({ label: 'عميل محتمل جديد', icon: 'userplus', kind: 'primary', perm: 'crm.leads.create', onClick: () => createLead() })] }), kpiBox, listCard(t)));
    drawK();
    return watch(['leads', 'activities'], () => { drawK(); t.refresh(); });
  }
  function scoreFactors(l) {
    const acts = get('activities').filter((a) => a.leadId === l.id && a.done);
    return [['حجم الفرصة', Math.min(1, (l.value || 0) / 1000000)], ['تقدّم المرحلة', PROB[l.stage] || 0], ['التفاعل (الأنشطة)', Math.min(1, acts.length / 4)], ['جودة المصدر', l.eventId || /إحالة/.test(l.source || '') ? 0.9 : /الموقع|الخط/.test(l.source || '') ? 0.6 : 0.45], ['حداثة التواصل', clamp01(1 - ERP.daysBetween(String(l.updatedAt || l.createdAt || nowIso()).slice(0, 10)) / 30)]];
  }
  function actTimeline(list, o) {
    o = o || {}; if (!list.length) return SA.empty({ icon: 'phone', title: 'لا أنشطة مسجلة', text: o.empty || 'سجّل أول مكالمة أو زيارة.' });
    const t0 = today();
    return h('ol.crm-timeline', {}, list.slice().sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, o.max || 12).map((a) => { const late = !a.done && String(a.at).slice(0, 10) < t0; const k = ACT[a.kind] || ['نشاط', 'note'];
      return h('li', {}, h('span.crm-tl-ico' + (late ? '.is-late' : !a.done ? '.is-plan' : ''), {}, SA.icon(k[1], 'icon-sm')), h('div.crm-tl-body', {}, h('div.crm-between', {}, h('b', {}, k[0] + (o.subject ? ' — ' + o.subject(a) : '')), a.done ? SA.chip('تم', 'success') : late ? SA.chip('متأخر', 'danger') : SA.chip('مجدول', 'info')), h('span', {}, a.note), a.outcome ? h('small', {}, 'النتيجة: ' + a.outcome) : null, h('small', {}, SA.userName(a.ownerId) + ' · ' + SA.fmt.dt(a.at)),
        !a.done && SA.can('crm.activities.create') && inScope(a.ownerId) ? h('div', {}, SA.btn({ label: 'تم', icon: 'check', kind: 'ghost', size: 'sm', onClick: () => markDone(a) })) : null)); }));
  }
  function leadDetail(root, ctx, id) {
    return SA.live(root, () => {
      const l = ERP.find('leads', id);
      ctx.setCrumbs([{ label: 'العملاء المحتملون والفرص' }, { label: 'العملاء المحتملون', href: '#/crm/leads' }, { label: l ? leadName(l) : id }]);
      if (!l) return notFound('العميل المحتمل ' + id, 'crm/leads');
      if (!inScope(l.ownerId)) return outOfScope(id);
      const open = OPEN_STAGES.indexOf(l.stage) >= 0; const ev = l.eventId ? ERP.find('events', l.eventId) : null;
      const acts = get('activities').filter((a) => a.leadId === l.id); const quotes = get('quotations').filter((q) => q.leadId === l.id);
      const actions = [];
      actions.push(SA.btn({ label: 'تسجيل نشاط', icon: 'phone', kind: 'ghost', perm: 'crm.activities.create', onClick: () => logActivity({ leadId: l.id }) }));
      if (open) actions.push(SA.btn({ label: 'تغيير المرحلة', icon: 'swap', kind: 'ghost', perm: 'crm.leads.edit', onClick: (e, b) => SA.menu(b, STAGES.filter((s) => s !== l.stage).map((s) => ({ label: stageLabel(s), icon: s === 'won' ? 'award' : s === 'lost' ? 'xcircle' : 'arrowleft', danger: s === 'lost', onClick: () => changeStage(l, s) }))) }));
      if (open) actions.push(SA.btn({ label: 'تسجيل خسارة', icon: 'xcircle', kind: 'ghost', perm: 'crm.leads.edit', onClick: () => lostModal(l) }));
      if (l.stage === 'lost') actions.push(SA.btn({ label: 'إعادة فتح الفرصة', icon: 'refresh', kind: 'ghost', perm: 'crm.leads.edit', onClick: () => changeStage(l, 'contacted') }));
      if (!l.customerId && l.stage !== 'lost') actions.push(SA.btn({ label: 'تحويل لعميل + عرض سعر', icon: 'userplus', kind: 'accent', perm: 'crm.leads.edit', attrs: { 'data-crm': 'convert' }, onClick: () => convertLead(l, { openQuote: true }) }));
      else if (l.customerId) actions.push(SA.btn({ label: 'عرض سعر جديد', icon: 'receipt', kind: 'primary', perm: 'crm.quotes.create', onClick: () => SA.nav('crm/quotes/new', { query: { customer: l.customerId, lead: l.id } }) }));
      const flow = OPEN_STAGES.concat(['won']); const idx = l.stage === 'lost' ? -1 : flow.indexOf(l.stage);
      const info = SA.card({ title: 'بيانات العميل المحتمل' }, h('div.crm-kv-tight', {}, SA.kv([['الكود', h('code', {}, l.id)], ['جهة الاتصال', l.name], ['الشركة', l.company], ['الهاتف', h('a.crm-phone', { href: 'tel:' + String(l.phone || '').replace(/\s/g, '') }, h('span.num', { dir: 'ltr' }, l.phone || '—'))], ['المدينة', l.city], ['الاهتمام', famChip(l.interest)], ['القيمة المتوقعة', h('b.num', {}, money(l.value))], ['الاحتمال', fm.pct(leadProb(l)) + ' · مرجّح ' + money((l.value || 0) * leadProb(l))], ['المصدر', l.source], ['المسؤول', repCell(l.ownerId)], ['الخطوة التالية', open ? (l.nextAction || '—') + (l.nextAt ? ' · ' + fm.date(l.nextAt) : '') : '—'], ['أُضيف', SA.fmt.dt(l.createdAt)], ['آخر تحديث', SA.fmt.rel(l.updatedAt)], l.notes ? ['ملاحظات', l.notes] : null])));
      const sf = scoreFactors(l);
      const score = SA.card({ title: 'تقييم العميل المحتمل', tags: U.demo('تقييم تجريبي') }, h('div.crm-row', {}, h('span.crm-score.is-' + (l.score >= 75 ? 'hot' : l.score >= 50 ? 'warm' : 'cold'), { style: { minWidth: '64px', height: '48px', fontSize: '22px', borderRadius: '14px' } }, String(l.score || '—')), h('div.crm-cell', {}, h('b', {}, l.score >= 75 ? 'ساخن — أولوية متابعة' : l.score >= 50 ? 'دافئ — يحتاج رعاية' : 'بارد — متابعة دورية'), h('small', {}, 'يُحسب من حجم الفرصة والمرحلة والتفاعل والمصدر وحداثة التواصل'))), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, sf.map((f) => CH.meter(f[1], { label: f[0], tone: 'primary', text: Math.round(f[1] * 100) + '%' }))));
      const actsCard = SA.card({ title: 'الأنشطة', actions: [SA.btn({ label: 'نشاط', icon: 'plus', kind: 'ghost', size: 'sm', perm: 'crm.activities.create', onClick: () => logActivity({ leadId: l.id }) }), SA.btn({ label: 'جدولة', icon: 'calendar', kind: 'ghost', size: 'sm', perm: 'crm.activities.create', onClick: () => logActivity({ leadId: l.id, planned: true, date: ERP.day(1) }) })] }, actTimeline(acts));
      const qCard = SA.card({ title: 'عروض الأسعار', actions: [SA.btn({ label: 'عرض سعر', icon: 'plus', kind: 'ghost', size: 'sm', perm: 'crm.quotes.create', onClick: () => SA.nav('crm/quotes/new', { query: l.customerId ? { customer: l.customerId, lead: l.id } : { lead: l.id } }) })] },
        quotes.length ? h('ul.crm-todo', {}, quotes.map((q) => h('li', {}, h('span.crm-todo-ico', {}, SA.icon('receipt', 'icon-sm')), h('div.crm-todo-body', {}, h('b', {}, U.docLink(q.id), ' ', U.status('quote', qStatus(q))), h('small', {}, money(F.totals(q).total) + (q.discountPct ? ' · خصم ' + q.discountPct + '%' : '') + ' · صالح حتى ' + fm.date(q.validUntil)))))) : SA.empty({ icon: 'receipt', title: 'لا توجد عروض أسعار بعد' }));
      const evCard = ev ? SA.card({ title: 'من المعرض' }, h('div.crm-row', {}, h('span.crm-todo-ico', {}, SA.icon('calendar', 'icon-sm')), h('div.crm-cell', {}, h('b', {}, U.docLink(ev.id, ev.name)), h('small', {}, ev.city + ' · ' + fm.date(ev.from) + (ev.booth ? ' · ' + ev.booth : ''))), U.status('event', ev.status))) : null;
      return h('div.crm-page', {},
        head({ title: leadName(l), desc: l.name + (l.city ? ' · ' + l.city : '') + ' · ' + money(l.value), tags: [U.status('lead', l.stage), scoreBadge(l.score), ev ? h('span.crm-flag', {}, SA.icon('calendar', 'icon-sm'), 'معرض') : null], back: { label: 'العملاء المحتملون', href: '#/crm/leads' }, actions }),
        l.customerId ? SA.alert('success', h('b', {}, 'تم التحويل لعميل: '), custLink(l.customerId), ' — ', SA.fmt.rel(l.convertedAt || l.updatedAt)) : null,
        l.stage === 'lost' ? SA.alert('danger', h('b', {}, 'فرصة خاسرة — السبب: '), l.lostReason || 'غير محدد') : null,
        idx >= 0 ? SA.card({}, SA.stepper(flow.map(stageLabel), idx)) : null,
        U.grid(2, info, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, score, evCard)), U.grid(2, actsCard, qCard));
    }, ['leads', 'activities', 'quotations', 'customers']);
  }

  /* ═════════════════════════ 3. PIPELINE (kanban, HTML5 DnD + accessible move buttons) ═════════════════════════ */
  function renderPipeline(root, ctx) {
    ctx.setCrumbs([{ label: 'العملاء المحتملون والفرص' }, { label: 'مسار الفرص' }]);
    let rep = ctx.params.rep || ''; let fam = ''; const canEdit = SA.can('crm.leads.edit');
    const boardHost = h('div');
    const reps = uniq(myLeads().map((l) => l.ownerId));
    const filters = h('div.crm-row', {},
      reps.length > 1 ? h('select.select', { 'aria-label': 'المندوب', onchange: (e) => { rep = e.target.value; draw(); } }, h('option', { value: '' }, 'كل المندوبين'), reps.map((r) => h('option', { value: r, selected: r === rep }, SA.userName(r)))) : null,
      SA.segmented([['', 'كل المنتجات'], ['door', 'أبواب'], ['clad', 'تجاليد'], ['foam', 'فوم بورد']], '', (v) => { fam = v; draw(); }),
      h('span.crm-muted', {}, canEdit ? 'اسحب البطاقة لعمود آخر، أو استخدم أزرار النقل ← →' : 'عرض فقط — تغيير المرحلة يحتاج crm.leads.edit'));
    async function move(id, stage) { const l = ERP.find('leads', id); if (!l || l.stage === stage) return; await changeStage(l, stage); }
    function card(l, si) {
      const prevS = STAGES[si - 1], nextS = STAGES[si + 1]; const isOpen = OPEN_STAGES.indexOf(l.stage) >= 0;
      const el = h('article.crm-card', { draggable: canEdit && l.stage !== 'won' ? 'true' : 'false', dataset: { id: l.id }, 'aria-label': leadName(l) + ' — ' + stageLabel(l.stage),
        ondragstart: (e) => { e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('is-dragging'); }, ondragend: () => el.classList.remove('is-dragging') },
        h('div.crm-between', {}, h('a.crm-card-t', { href: '#/crm/leads/' + l.id }, leadName(l)), scoreBadge(l.score)),
        h('div.crm-card-meta', {}, h('span', {}, l.name), famChip(l.interest)),
        h('div.crm-card-meta', {}, h('b.num', { style: { color: 'var(--color-text)' } }, short(l.value)), h('span', {}, 'مرجّح ' + short((l.value || 0) * leadProb(l)))),
        h('div.crm-card-meta', {}, repCell(l.ownerId), isOpen && l.nextAt ? h('span', { class: l.nextAt < today() ? 'crm-late' : null }, SA.icon('clock', 'icon-sm'), ' ' + (l.nextAt === today() ? 'اليوم' : fm.date(l.nextAt))) : l.stage === 'lost' ? h('small', {}, l.lostReason || '') : null),
        canEdit && l.stage !== 'won' ? h('div.crm-card-moves', {},
          h('button.crm-mv', { type: 'button', disabled: !prevS || l.stage === 'lost', 'aria-label': prevS ? 'نقل إلى «' + stageLabel(prevS) + '»' : 'لا مرحلة سابقة', title: prevS ? 'إلى ' + stageLabel(prevS) : '', onclick: () => move(l.id, prevS) }, SA.icon('arrowright', 'icon-sm'), prevS ? stageLabel(prevS) : ''),
          h('button.crm-mv', { type: 'button', 'aria-label': 'كل المراحل', 'aria-haspopup': 'menu', onclick: (e) => SA.menu(e.currentTarget, STAGES.filter((s) => s !== l.stage).map((s) => ({ label: 'إلى «' + stageLabel(s) + '»', danger: s === 'lost', onClick: () => move(l.id, s) }))) }, SA.icon('dots', 'icon-sm')),
          h('button.crm-mv', { type: 'button', disabled: !nextS || l.stage === 'lost' || nextS === 'lost', 'aria-label': nextS && nextS !== 'lost' ? 'نقل إلى «' + stageLabel(nextS) + '»' : 'لا مرحلة تالية', title: nextS ? 'إلى ' + stageLabel(nextS) : '', 'data-crm': 'move-next', onclick: () => move(l.id, nextS) }, nextS && nextS !== 'lost' ? stageLabel(nextS) : '', SA.icon('arrowleft', 'icon-sm'))) : null);
      return el;
    }
    function draw() {
      SA.clear(boardHost);
      const ls = myLeads().filter((l) => (!rep || l.ownerId === rep) && (!fam || l.interest === fam));
      const open = ls.filter((l) => OPEN_STAGES.indexOf(l.stage) >= 0);
      boardHost.append(U.kpis([U.kpi({ label: 'إجمالي المسار المفتوح', value: short(sum(open, (l) => l.value)), icon: 'layers', sub: open.length + ' فرصة' }), U.kpi({ label: 'القيمة المرجّحة', value: short(weightedOf(ls)), icon: 'target', sub: 'متوسط الاحتمال ' + fm.pct(ratio(weightedOf(ls), sum(open, (l) => l.value))) }), U.kpi({ label: 'مكسوب', value: short(sum(ls.filter((l) => l.stage === 'won'), (l) => l.value)), icon: 'award', tone: 'success', sub: ls.filter((l) => l.stage === 'won').length + ' فرصة' }), U.kpi({ label: 'خاسر', value: String(ls.filter((l) => l.stage === 'lost').length), icon: 'xcircle', sub: 'أكثر سبب: ' + (topReason(ls) || '—') })]));
      const board = h('div.crm-board', { role: 'list', 'aria-label': 'لوحة مسار الفرص' });
      STAGES.forEach((s, si) => {
        const items = ls.filter((l) => l.stage === s).sort((a, b) => (b.score || 0) - (a.score || 0));
        const col = h('section.crm-col' + (s === 'won' ? '.is-won' : s === 'lost' ? '.is-lost' : ''), { role: 'listitem', 'aria-label': stageLabel(s), dataset: { stage: s },
          ondragover: (e) => { if (!canEdit) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('is-over'); }, ondragleave: (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('is-over'); },
          ondrop: (e) => { e.preventDefault(); col.classList.remove('is-over'); const id = e.dataTransfer.getData('text/plain'); if (id) move(id, s); } },
          h('header.crm-col-head', {}, h('b', {}, h('span', {}, stageLabel(s)), h('span.sap-count', {}, String(items.length))), h('small.num', {}, short(sum(items, (l) => l.value)) + (OPEN_STAGES.indexOf(s) >= 0 ? ' · مرجّح ' + short(sum(items, (l) => (l.value || 0) * leadProb(l))) : '')), h('small', {}, 'احتمال ' + fm.pct(PROB[s]))),
          items.length ? items.map((l) => card(l, si)) : h('div.crm-col-empty', {}, canEdit ? 'أفلت بطاقة هنا' : 'لا فرص'));
        board.append(col);
      });
      boardHost.append(SA.card({ flush: false }, board));
    }
    function topReason(ls) { const m = {}; ls.filter((l) => l.stage === 'lost' && l.lostReason).forEach((l) => { const k = String(l.lostReason).split(' — ')[0]; m[k] = (m[k] || 0) + 1; }); const k = Object.keys(m).sort((a, b) => m[b] - m[a])[0]; return k || null; }
    root.append(h('div.crm-page', {}, head({ title: 'مسار الفرص', desc: 'من «جديد» إلى «مكسوب»: إجماليات كل مرحلة والقيمة المرجّحة بالاحتمال — اسحب وأفلت لتحديث المرحلة.', actions: [SA.btn({ label: 'عميل محتمل جديد', icon: 'userplus', kind: 'primary', perm: 'crm.leads.create', onClick: () => createLead() })] }), filters, boardHost));
    draw();
    return watch(['leads'], draw);
  }

  /* ═════════════════════════ 4. ACTIVITIES (agenda + list / week calendar) ═════════════════════════ */
  function actSubject(a) { if (a.leadId) { const l = ERP.find('leads', a.leadId); return { label: l ? leadName(l) : a.leadId, href: '#/crm/leads/' + a.leadId, kind: 'محتمل' }; } if (a.customerId) return { label: custName(a.customerId), href: '#/crm/customers/' + a.customerId, kind: 'عميل' }; return { label: '—', href: null, kind: '' }; }
  function renderActivities(root, ctx) {
    ctx.setCrumbs([{ label: 'العملاء المحتملون والفرص' }, { label: 'المكالمات والزيارات' }]);
    let view = ctx.params.view === 'week' ? 'week' : 'list'; let weekOff = 0;
    const agendaHost = h('div'); const viewHost = h('div'); const kpiHost = h('div');
    const owners = uniq(myActs().map((a) => a.ownerId)).map((id) => [id, SA.userName(id)]);
    const stOf = (a) => (a.done ? 'done' : String(a.at).slice(0, 10) < today() ? 'late' : 'planned');
    const t = SA.table({
      caption: 'الأنشطة', pageSize: 10, rows: () => myActs(),
      columns: [
        { key: 'kind', label: 'النوع', render: (a) => h('span.crm-src', {}, SA.icon((ACT[a.kind] || ['', 'note'])[1], 'icon-sm'), (ACT[a.kind] || ['نشاط'])[0]) },
        { key: 'subject', label: 'مع', value: (a) => actSubject(a).label, sort: true, render: (a) => { const s = actSubject(a); return h('span.crm-cell', {}, s.href ? h('a.erp-doc', { href: s.href }, s.label) : s.label, h('small', {}, s.kind + (a.soId ? ' · ' + a.soId : ''))); } },
        { key: 'note', label: 'الملاحظة', render: (a) => h('span.crm-cell', { style: { maxWidth: '360px' } }, h('span', {}, a.note), a.outcome ? h('small', {}, 'النتيجة: ' + a.outcome) : null) },
        { key: 'ownerId', label: 'المسؤول', render: (a) => repCell(a.ownerId) },
        { key: 'at', label: 'الموعد', sort: true, render: (a) => h('span.crm-cell', {}, h('b', { class: stOf(a) === 'late' ? 'crm-late' : null }, SA.fmt.dt(a.at)), h('small', {}, SA.fmt.rel(a.at).replace('لم يسجّل دخولًا بعد', ''))) },
        { key: 'status', label: 'الحالة', value: stOf, render: (a) => { const s = stOf(a); return SA.chip(s === 'done' ? 'تم' : s === 'late' ? 'متأخر' : 'مجدول', s === 'done' ? 'success' : s === 'late' ? 'danger' : 'info'); } }
      ],
      search: { placeholder: 'ابحث في الملاحظات أو الجهة…', keys: (a, q) => (a.note + ' ' + actSubject(a).label + ' ' + (a.outcome || '')).toLowerCase().indexOf(q) >= 0 },
      filters: [owners.length > 1 ? { key: 'ownerId', label: 'المسؤول', options: owners } : null, { key: 'kind', label: 'النوع', options: Object.keys(ACT).map((k) => [k, ACT[k][0]]) }, { key: 'status', label: 'الحالة', options: [['planned', 'مجدول'], ['late', 'متأخر'], ['done', 'تم']], test: (a, v) => stOf(a) === v }].filter(Boolean),
      initial: { sort: { key: 'at', dir: 'desc' }, filters: { status: ctx.params.status || '' } },
      rowActions: (a) => [{ label: 'تم — سجّل النتيجة', icon: 'check', hidden: a.done, disabled: SA.can('crm.activities.create') ? false : 'ليست من صلاحياتك', onClick: () => markDone(a) }, { label: 'فتح الجهة', icon: 'eye', hidden: !actSubject(a).href, onClick: () => { location.hash = actSubject(a).href; } }],
      empty: { icon: 'phone', title: 'لا أنشطة', text: 'سجّل مكالمة أو زيارة.', action: { label: 'نشاط جديد', perm: 'crm.activities.create', onClick: () => logActivity() } }
    });
    function drawAgenda() {
      SA.clear(agendaHost); SA.clear(kpiHost); const t0 = today(); const acts = myActs();
      const todays = acts.filter((a) => String(a.at).slice(0, 10) === t0); const overdue = acts.filter((a) => !a.done && String(a.at).slice(0, 10) < t0);
      const leadsDue = myLeads().filter((l) => OPEN_STAGES.indexOf(l.stage) >= 0 && l.nextAt && l.nextAt <= t0 && !acts.some((a) => a.leadId === l.id && !a.done));
      kpiHost.append(U.kpis([U.kpi({ label: 'مواعيد اليوم', value: String(todays.length), icon: 'calendar', sub: todays.filter((a) => a.done).length + ' تم' }), U.kpi({ label: 'متأخرة', value: String(overdue.length), icon: 'clock', tone: overdue.length ? 'danger' : 'success', sub: 'مجدولة ولم تتم' }), U.kpi({ label: 'متابعات فرص مستحقة', value: String(leadsDue.length), icon: 'userplus', tone: leadsDue.length ? 'warning' : '', sub: 'بدون موعد مسجّل' }), U.kpi({ label: 'أنشطة آخر 7 أيام', value: String(acts.filter((a) => a.done && String(a.at).slice(0, 10) >= ERP.day(-7)).length), icon: 'activity', sub: 'مكالمات وزيارات واجتماعات' })]));
      const rows = overdue.concat(todays).sort((a, b) => (a.at < b.at ? -1 : 1));
      const item = (a) => { const s = actSubject(a); const late = !a.done && String(a.at).slice(0, 10) < t0; const k = ACT[a.kind] || ['نشاط', 'note'];
        return h('li' + (a.done ? '.is-done' : late ? '.is-late' : ''), {}, h('time', {}, SA.fmt.time(a.at), h('small', {}, late ? fm.date(String(a.at).slice(0, 10)) : a.done ? 'تم' : 'اليوم')), h('span.crm-todo-ico' + (late ? '.is-danger' : a.done ? '.is-success' : ''), {}, SA.icon(k[1], 'icon-sm')),
          h('div.crm-cell', {}, h('b', {}, k[0] + ' — ', s.href ? h('a.erp-doc', { href: s.href }, s.label) : s.label), h('small', {}, a.note + (scopeMode() !== 'own' ? ' · ' + SA.userName(a.ownerId) : ''))),
          !a.done && inScope(a.ownerId) ? SA.btn({ label: 'تم', icon: 'check', kind: 'ghost', size: 'sm', perm: 'crm.activities.create', onClick: () => markDone(a) }) : h('span'));
      };
      const due = (l) => h('li.is-due', {}, h('time', {}, '—', h('small', {}, l.nextAt < t0 ? 'متأخرة' : 'اليوم')), h('span.crm-todo-ico.is-warning', {}, SA.icon('userplus', 'icon-sm')), h('div.crm-cell', {}, h('b', {}, (l.nextAction || 'متابعة') + ' — ', h('a.erp-doc', { href: '#/crm/leads/' + l.id }, leadName(l))), h('small', {}, 'خطوة مستحقة على الفرصة · ' + money(l.value))), SA.btn({ label: 'سجّل', icon: 'phone', kind: 'ghost', size: 'sm', perm: 'crm.activities.create', onClick: () => logActivity({ leadId: l.id }) }));
      agendaHost.append(SA.card({ title: 'أجندة اليوم — ' + fm.date(t0), actions: [SA.btn({ label: 'جدولة موعد', icon: 'calendar', kind: 'ghost', size: 'sm', perm: 'crm.activities.create', onClick: () => logActivity({ planned: true }) })] },
        rows.length || leadsDue.length ? h('ul.crm-agenda', {}, rows.map(item), leadsDue.map(due)) : SA.empty({ icon: 'calendar', title: 'لا مواعيد اليوم', text: 'جدول مكالمة أو زيارة لعملائك.' })));
    }
    function drawWeek() {
      const base = new Date(); base.setHours(12, 0, 0, 0); const start = new Date(base.getTime() - ((base.getDay() + 1) % 7) * 86400000 + weekOff * 7 * 86400000);
      const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start.getTime() + i * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
      const acts = myActs(); const t0 = today();
      return h('div', {}, h('div.crm-viewbar', { style: { marginBottom: '10px' } }, h('b', {}, 'الأسبوع: ' + fm.date(days[0]) + ' — ' + fm.date(days[6])), h('div.crm-row', {}, SA.btn({ label: 'السابق', icon: 'arrowright', kind: 'ghost', size: 'sm', onClick: () => { weekOff--; drawView(); } }), SA.btn({ label: 'هذا الأسبوع', kind: 'ghost', size: 'sm', onClick: () => { weekOff = 0; drawView(); } }), SA.btn({ label: 'التالي', icon: 'arrowleft', kind: 'ghost', size: 'sm', onClick: () => { weekOff++; drawView(); } }))),
        h('div.crm-week', {}, days.map((d, i) => { const list = acts.filter((a) => String(a.at).slice(0, 10) === d).sort((a, b) => (a.at < b.at ? -1 : 1));
          return h('div.crm-day' + (d === t0 ? '.is-today' : '') + (i === 6 ? '.is-off' : ''), {}, h('div.crm-day-h', {}, h('span', {}, WEEK[i]), h('small', {}, d.slice(8) + '/' + d.slice(5, 7))), list.length ? list.map((a) => { const s = actSubject(a); return h(s.href ? 'a.crm-ev' : 'div.crm-ev', Object.assign({ class: a.done ? 'is-done' : d < t0 ? 'is-late' : null }, s.href ? { href: s.href } : {}), h('b', {}, SA.fmt.time(a.at) + ' · ' + (ACT[a.kind] || ['نشاط'])[0]), h('small', {}, s.label)); }) : h('small.crm-muted', {}, '—')); })));
    }
    function drawView() { SA.clear(viewHost); viewHost.append(view === 'week' ? SA.card({ title: 'التقويم الأسبوعي' }, drawWeek()) : listCard(t)); }
    root.append(h('div.crm-page', {}, head({ title: 'المكالمات والزيارات', desc: 'أجندة اليوم والمتأخرات ومتابعات الفرص المستحقة — وسجل كامل لكل تواصل مع العملاء.', actions: [SA.btn({ label: 'نشاط جديد', icon: 'plus', kind: 'primary', perm: 'crm.activities.create', onClick: () => logActivity() })] }),
      kpiHost, agendaHost, h('div.crm-viewbar', {}, h('h2.sap-card-title', { style: { margin: 0 } }, 'كل الأنشطة'), SA.segmented([['list', 'قائمة'], ['week', 'أسبوع']], view, (v) => { view = v; drawView(); })), viewHost));
    drawAgenda(); drawView();
    return watch(['activities', 'leads'], () => { drawAgenda(); if (view === 'week') drawView(); else t.refresh(); });
  }

  /* ═════════════════════════ 5. QUOTATIONS ═════════════════════════ */
  function sendQuoteNow(id) {
    const q = ERP.find('quotations', id); const t = F.totals(q); const L = F.limits; const label = q.prospect || custName(q.customerId);
    if ((q.discountPct || 0) > L.discountPct) {
      const chain = [{ roleId: 'R-03', label: 'مدير المبيعات' }]; if (q.discountPct > L.gmDiscountPct) chain.push({ roleId: 'R-02', label: 'المدير العام' });
      const ap = SA.requestApproval({ type: 'quotation', area: 'crm', title: 'خصم ' + q.discountPct + '% على عرض السعر ' + id + ' — ' + label, amount: t.total, discountPct: q.discountPct, chain,
        context: [['العميل', label], ['قيمة العرض', money(t.total)], ['الخصم المطلوب', q.discountPct + '%'], ['حد خصم المندوب', L.discountPct + '% (تجريبي — بند 33 Open)'], ['البنود', q.lines.length + ' صنف'], ['صلاحية العرض', fm.date(q.validUntil)]], ref: { type: 'quotation', id } });
      st.patch('quotations', id, { status: 'pending_approval', approvalId: ap.id, submittedAt: nowIso() });
      SA.audit('QUOTE.DISCOUNT_REQUESTED', { target: { type: 'quotation', id, label }, after: { discountPct: q.discountPct, approval: ap.id, total: t.total } });
      return 'pending_approval';
    }
    st.patch('quotations', id, { status: 'sent', sentAt: nowIso() });
    SA.audit('QUOTE.SENT', { target: { type: 'quotation', id, label }, after: { total: t.total, discountPct: q.discountPct || 0 } });
    advanceLead(q.leadId, 'proposal');
    return 'sent';
  }
  async function sendQuote(q) {
    if (!SA.can('crm.quotes.edit')) { SA.toast('ليست من صلاحياتك (crm.quotes.edit)', 'warn'); return; }
    const over = (q.discountPct || 0) > F.limits.discountPct;
    const r = await SA.confirm({ title: over ? 'إرسال الخصم للاعتماد' : 'إرسال العرض للعميل', text: q.id + ' — ' + (q.prospect || custName(q.customerId)) + ' · ' + money(F.totals(q).total), impact: over ? ['الخصم ' + q.discountPct + '% أعلى من حد المندوب ' + F.limits.discountPct + '% (تجريبي).', 'يُرسل طلب اعتماد لـ' + (q.discountPct > F.limits.gmDiscountPct ? 'مدير المبيعات ثم المدير العام' : 'مدير المبيعات') + ' في صندوق الاعتمادات.', 'بعد الاعتماد يصبح العرض «مُرسل للعميل» تلقائيًا.'] : ['حالة العرض تصبح «مُرسل للعميل».', q.leadId ? 'مرحلة الفرصة تتقدم إلى «عرض سعر».' : 'يمكنك طباعة العرض بصيغة A4.'], confirmLabel: over ? 'إرسال للاعتماد' : 'إرسال' });
    if (!r.ok) return; let res;
    try { await SA.api(() => { res = sendQuoteNow(q.id); }); } catch (e) { return SA.fail(e); }
    SA.toast(res === 'pending_approval' ? 'أُرسل الخصم لاعتماد مدير المبيعات' : 'تم إرسال العرض للعميل', 'success');
  }
  async function acceptQuote(q) {
    if (!SA.can('crm.orders.create')) { SA.toast('ليست من صلاحياتك (crm.orders.create)', 'warn'); return; }
    if (!q.customerId) {
      const l = q.leadId ? ERP.find('leads', q.leadId) : null;
      if (!l) { SA.toast('العرض غير مرتبط بعميل — اربطه بعميل أولًا', 'warn'); return; }
      const cid = l.customerId || (await convertLead(l, { openQuote: false })); if (!cid) return;
      try { await SA.api(() => st.patch('quotations', q.id, { customerId: cid }), { ms: 50 }); } catch (e) { return SA.fail(e); }
      q = ERP.find('quotations', q.id);
    }
    const d = { customerId: q.customerId, lines: q.lines, discountPct: q.discountPct || 0 };
    const r = await SA.confirm({ title: 'قبول العرض وتحويله لأمر بيع', text: q.id + ' — ' + custName(q.customerId) + ' · ' + money(F.totals(q).total), impact: ['يُنشأ أمر بيع بنفس البنود والأسعار والخصم (' + (q.discountPct || 0) + '%).', 'يُرسل الأمر فورًا: اعتماد إن تجاوز الحدود، أو تأكيد وحجز مخزون وأوامر تشغيل.', q.leadId ? 'الفرصة المرتبطة تصبح «مكسوب».' : null].filter(Boolean), extra: predictBox(d), confirmLabel: 'قبول وإنشاء أمر البيع' });
    if (!r.ok) return; let so, res;
    try { await SA.api(() => {
      st.patch('quotations', q.id, { status: 'accepted', acceptedAt: nowIso() });
      SA.audit('QUOTE.ACCEPTED', { target: { type: 'quotation', id: q.id, label: custName(q.customerId) }, after: { total: F.totals(q).total } });
      so = F.createOrder({ customerId: q.customerId, lines: q.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price })), discountPct: q.discountPct || 0, quoteId: q.id, leadId: q.leadId || null, repId: q.repId, notes: 'من عرض السعر ' + q.id, source: 'rep' });
      st.patch('quotations', q.id, { soId: so.id });
      res = F.submitOrder(so.id);
      if (q.leadId) { const l = ERP.find('leads', q.leadId); if (l && l.stage !== 'won') setStage(l.id, 'won', 'قبول العرض ' + q.id); }
    }); } catch (e) { return SA.fail(e); }
    showOutcome(so.id, res, 'تم قبول العرض وإنشاء أمر البيع');
  }
  async function rejectQuote(q) {
    const r = await SA.confirm({ title: 'رفض العميل للعرض', text: q.id + ' — ' + (q.prospect || custName(q.customerId)), reasonRequired: true, reasonLabel: 'سبب الرفض', confirmLabel: 'تسجيل الرفض', danger: true });
    if (!r.ok) return;
    try { await SA.api(() => { st.patch('quotations', q.id, { status: 'rejected', rejectedReason: r.reason, rejectedAt: nowIso(), rejectedBy: 'customer' }); SA.audit('QUOTE.REJECTED', { target: { type: 'quotation', id: q.id, label: q.prospect || custName(q.customerId) }, reason: r.reason, after: { status: 'rejected' } }); }); } catch (e) { return SA.fail(e); }
    SA.toast('تم تسجيل رفض العرض', 'success');
  }
  async function renewQuote(q) {
    const r = await SA.confirm({ title: 'تجديد صلاحية العرض', text: q.id + ' — صالح حتى ' + fm.date(ERP.day(14)), impact: ['تصبح الحالة «مُرسل للعميل» بصلاحية 14 يومًا جديدة.', 'الأسعار تبقى كما هي — راجعها إن تغيّرت قائمة الأسعار.'], confirmLabel: 'تجديد' });
    if (!r.ok) return;
    try { await SA.api(() => { st.patch('quotations', q.id, { status: 'sent', validUntil: ERP.day(14), sentAt: nowIso() }); SA.audit('QUOTE.RENEWED', { target: { type: 'quotation', id: q.id, label: q.prospect || custName(q.customerId) }, after: { validUntil: ERP.day(14) } }); }); } catch (e) { return SA.fail(e); }
    SA.toast('تم تجديد صلاحية العرض', 'success');
  }
  function quoteMarginBox(q) {
    const t = F.totals(q); const cost = sum(q.lines, (l) => l.qty * ((ERP.item(l.itemId) || {}).stdCost || 0)); const m = t.net - cost;
    return h('div.crm-totals', {}, h('span', {}, 'التكلفة القياسية'), h('b', {}, U.cost(cost)), h('span', {}, 'الهامش المتوقع'), h('b', {}, U.cost(m, 'data.profit.view')), U.canProfit() ? [h('span', {}, 'نسبة الهامش'), h('b.num', {}, fm.pct(ratio(m, t.net), 1))] : null);
  }
  function printQuote(q) {
    const co = st.get('settings.company') || {}; const cust = q.customerId ? ERP.customer(q.customerId) : null; const lead = q.leadId ? ERP.find('leads', q.leadId) : null; const rep = SA.userById(q.repId) || {};
    const logo = new URL('../../assets/images/logo/wordmark-color.png', location.href).href;
    const page = h('div.crm-a4', { dir: 'rtl' },
      h('header.crm-a4-head', {}, h('div.crm-a4-co', {}, h('img', { src: logo, alt: co.nameAr || 'الشعار' }), h('div', {}, h('b', {}, co.nameAr || ''), h('small', {}, co.nameEn || ''), h('small', {}, co.address || ''), h('small.num', {}, 'هاتف ' + (co.phone || '') + ' · ' + (co.email || '') + ' · ' + String(co.website || '').replace(/^https?:\/\//, '')))),
        h('div.crm-a4-title', {}, h('h2', {}, 'عرض سعر'), h('span', {}, q.id), h('small', {}, 'التاريخ: ' + fm.date(q.createdAt)), h('small', {}, 'صالح حتى: ' + fm.date(q.validUntil)))),
      h('section.crm-a4-to', {}, h('div', {}, h('small', {}, 'السادة'), h('b', {}, q.prospect || custName(q.customerId)), h('small', {}, cust ? (cust.city || '') + ' · ' + (cust.code || '') : lead ? (lead.name || '') + ' · ' + (lead.city || '') : ''), h('small.num', { dir: 'ltr' }, (cust && cust.contacts && cust.contacts[0] && cust.contacts[0].phone) || (lead && lead.phone) || '')),
        h('div', {}, h('small', {}, 'مسؤول المبيعات'), h('b', {}, rep.name || '—'), h('small.num', { dir: 'ltr' }, rep.phone || ''), h('small', {}, rep.email || ''))),
      h('table.crm-a4-table', {}, h('thead', {}, h('tr', {}, ['م', 'الصنف', 'اللون', 'الكمية', 'سعر الوحدة', 'الإجمالي'].map((x, i) => h('th', { class: i >= 3 ? 'num' : null }, x)))),
        h('tbody', {}, q.lines.map((l, i) => { const it = ERP.item(l.itemId) || {}; const f = it.attrs && it.attrs.color ? ERP.finish(it.attrs.color) : null;
          return h('tr', {}, h('td.num', {}, String(i + 1)), h('td', {}, h('b', {}, it.name || l.itemId), h('small', {}, it.code || '')), h('td', {}, f ? h('span.crm-row', {}, U.swatch(f.code), f.code + ' ' + f.name) : '—'), h('td.num', {}, fm.qty(l.qty, it.uom)), h('td.num', {}, money(l.price)), h('td.num', {}, money(l.qty * l.price))); }))),
      h('div.crm-a4-sum', {}, totalsBox(q)),
      h('section.crm-a4-terms', {}, h('b', {}, 'الشروط والأحكام'), h('ol', {}, ['الأسعار بالجنيه المصري، والضريبة بالنسبة الموضحة (نسبة تجريبية حتى اعتماد الإعداد المالي).', 'صلاحية العرض حتى ' + fm.date(q.validUntil) + '.', 'مدة التوريد تُحدد عند تأكيد الطلب حسب المخزون والطاقة الإنتاجية.', 'شروط السداد: ' + (cust && cust.termsDays ? cust.termsDays + ' يومًا من تاريخ الفاتورة' : 'دفعة مقدمة عند التأكيد') + ' — حسب الاتفاق.', 'الألوان حسب كتالوج الشركة الرسمي، وقد تختلف درجة اللون قليلًا بين الدفعات.'].map((x) => h('li', {}, x))), q.notes ? h('p', { style: { margin: '8px 0 0' } }, 'ملاحظات: ' + q.notes) : null),
      h('footer.crm-a4-foot', {}, h('div', {}, h('small', {}, 'توقيع مسؤول المبيعات'), h('span.crm-a4-sign')), h('div', {}, h('small', {}, 'اعتماد العميل (الاسم والتوقيع والختم)'), h('span.crm-a4-sign'))),
      h('div.crm-a4-note', {}, 'مستند صادر من نموذج تجريبي — لا يمثل فاتورة ضريبية ولا يتصل بمنظومة الفاتورة الإلكترونية.'));
    const m = SA.modal({ title: 'معاينة الطباعة — ' + q.id, subtitle: 'مقاس A4', icon: 'doc', size: 'xl', body: h('div.crm-a4-wrap', {}, page), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إغلاق'), h('button.btn.btn-primary', { type: 'button', onclick: () => printNode(page, 'عرض سعر ' + q.id) }, SA.icon('download', 'icon-sm'), 'طباعة / حفظ PDF')] });
  }
  function printNode(node, title) {
    const w = window.open('', '_blank'); if (!w) { SA.toast('المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة', 'warn'); return; }
    const css = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => '<link rel="stylesheet" href="' + l.href + '">').join('') + '<style>' + ((document.querySelector('style[data-mod="crm"]') || {}).textContent || '') + ' body{background:#fff;margin:0;padding:0} .crm-a4{box-shadow:none;max-width:none;padding:0} @page{size:A4;margin:14mm}</style>';
    w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + SA.esc(title) + '</title>' + css + '</head><body>' + node.outerHTML + '</body></html>');
    w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch (e) { /* noop */ } }, 450);
  }
  function renderQuotes(root, ctx) {
    const p0 = ctx.path[0]; if (p0 === 'new') return quoteBuilder(root, ctx); if (p0) return quoteDetail(root, ctx, p0);
    ctx.setCrumbs([{ label: 'عروض الأسعار والطلبات' }, { label: 'عروض الأسعار' }]);
    const kpiBox = h('div');
    const drawK = () => { SA.clear(kpiBox); const qs = myQuotes(); const open = qs.filter((q) => ['sent', 'pending_approval', 'draft'].indexOf(qStatus(q)) >= 0); const closed = qs.filter((q) => ['accepted', 'rejected', 'expired'].indexOf(qStatus(q)) >= 0); const acc = qs.filter((q) => q.status === 'accepted');
      kpiBox.append(U.kpis([U.kpi({ label: 'عروض مفتوحة', value: String(open.length), icon: 'receipt', sub: short(sum(open, (q) => F.totals(q).total)) }), U.kpi({ label: 'بانتظار اعتماد خصم', value: String(qs.filter((q) => q.status === 'pending_approval').length), icon: 'inbox', tone: qs.some((q) => q.status === 'pending_approval') ? 'warning' : '', sub: 'حد المندوب ' + F.limits.discountPct + '% (تجريبي)' }), U.kpi({ label: 'معدل التحويل', value: closed.length ? fm.pct(acc.length / closed.length) : '—', icon: 'award', sub: acc.length + ' مقبول من ' + closed.length + ' مغلق' }), U.kpi({ label: 'تنتهي خلال 3 أيام', value: String(qs.filter((q) => q.status === 'sent' && q.validUntil >= today() && ERP.daysBetween(today(), q.validUntil) <= 3).length), icon: 'clock', sub: 'تابعها قبل الانتهاء' })])); };
    const reps = uniq(myQuotes().map((q) => q.repId)).map((id) => [id, SA.userName(id)]);
    const t = SA.table({
      caption: 'عروض الأسعار', pageSize: 10, rows: () => myQuotes(),
      columns: [
        { key: 'id', label: 'العرض', sort: true, render: (q) => h('span.crm-cell', {}, U.docLink(q.id), h('small', {}, SA.fmt.rel(q.createdAt))) },
        { key: 'who', label: 'العميل', value: (q) => q.prospect || custName(q.customerId), sort: true, render: (q) => h('span.crm-cell', {}, q.customerId ? custLink(q.customerId) : h('b', {}, q.prospect || '—'), h('small', {}, q.customerId ? 'عميل' : 'عميل محتمل' + (q.leadId ? ' · ' + q.leadId : ''))) },
        { key: 'repId', label: 'المندوب', render: (q) => repCell(q.repId) },
        { key: 'total', label: 'الإجمالي', class: 'num', value: (q) => F.totals(q).total, sort: true, render: (q) => money(F.totals(q).total) },
        { key: 'discountPct', label: 'الخصم', sort: true, render: (q) => (q.discountPct ? SA.chip(q.discountPct + '%', q.discountPct > F.limits.discountPct ? 'warning' : 'neutral') : '—') },
        { key: 'status', label: 'الحالة', value: qStatus, render: (q) => U.status('quote', qStatus(q)) },
        { key: 'validUntil', label: 'صالح حتى', sort: true, render: (q) => { const exp = q.status === 'sent' && q.validUntil && ERP.daysBetween(today(), q.validUntil) <= 3; return h('span', { class: exp ? 'crm-late' : null }, fm.date(q.validUntil)); } }
      ],
      search: { placeholder: 'ابحث برقم العرض أو العميل…', keys: (q, s) => (q.id + ' ' + (q.prospect || '') + ' ' + custName(q.customerId)).toLowerCase().indexOf(s) >= 0 },
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(SA.catalog.status.quote).map((k) => [k, stLabel('quote', k)]), test: (q, v) => qStatus(q) === v }, reps.length > 1 ? { key: 'repId', label: 'المندوب', options: reps } : null].filter(Boolean),
      initial: { sort: { key: 'id', dir: 'desc' }, filters: { status: ctx.params.status || '' } },
      onRowClick: (q) => SA.nav('crm/quotes/' + q.id),
      empty: { icon: 'receipt', title: 'لا توجد عروض أسعار', action: { label: 'عرض سعر جديد', perm: 'crm.quotes.create', onClick: () => SA.nav('crm/quotes/new') } }
    });
    root.append(h('div.crm-page', {}, head({ title: 'عروض الأسعار', desc: 'عروض بأسعار قائمة العميل وألوان الكتالوج، مع اعتماد الخصم الأعلى من حد المندوب وتحويل العرض المقبول لأمر بيع.', actions: [SA.btn({ label: 'عرض سعر جديد', icon: 'plus', kind: 'primary', perm: 'crm.quotes.create', onClick: () => SA.nav('crm/quotes/new') })] }), kpiBox, listCard(t)));
    drawK();
    return watch(['quotations', 'approvals'], () => { drawK(); t.refresh(); });
  }
  function quoteBuilder(root, ctx) {
    const editId = ctx.params.edit; const q0 = editId ? ERP.find('quotations', editId) : null;
    ctx.setCrumbs([{ label: 'عروض الأسعار والطلبات' }, { label: 'عروض الأسعار', href: '#/crm/quotes' }, { label: q0 ? 'تعديل ' + q0.id : 'عرض سعر جديد' }]);
    if (!SA.can(q0 ? 'crm.quotes.edit' : 'crm.quotes.create')) { root.append(SA.denied({ perm: q0 ? 'crm.quotes.edit' : 'crm.quotes.create' })); return null; }
    if (editId && (!q0 || q0.status !== 'draft' || !inScope(q0.repId))) { root.append(SA.empty({ icon: 'lock', title: 'لا يمكن تعديل هذا العرض', text: 'التعديل متاح للمسودات داخل نطاقك فقط.', action: { label: 'رجوع', icon: 'arrowright', onClick: () => SA.nav('crm/quotes' + (editId ? '/' + editId : '')) } })); return null; }
    const custs = myCustomers().filter((c) => c.status !== 'disabled'); const leads = myLeads().filter((l) => OPEN_STAGES.indexOf(l.stage) >= 0 && !l.customerId);
    const pLead = ctx.params.lead ? ERP.find('leads', ctx.params.lead) : null;
    let mode = q0 ? (q0.customerId ? 'customer' : 'lead') : ctx.params.customer ? 'customer' : pLead ? 'lead' : 'customer';
    let cid = q0 ? q0.customerId || '' : (ctx.params.customer && custs.some((c) => c.id === ctx.params.customer) ? ctx.params.customer : '');
    let leadId = q0 ? q0.leadId || '' : pLead ? pLead.id : ''; let pl = (q0 && q0.priceListId) || 'PL-01';
    const priceOf = (itemId) => { const it = ERP.item(itemId) || {}; return mode === 'customer' && cid ? F.priceFor(cid, itemId) : Math.round((it.price || 0) * plFactor(pl)); };
    const custBox = h('div'); const leadBox = h('div'); const summary = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    const fCust = SA.form.field({ name: 'customerId', label: 'العميل', type: 'select', required: true, value: cid, options: [['', 'اختر العميل…']].concat(custs.map((c) => [c.id, c.name + ' — ' + c.code])), onChange: (v) => { cid = v; ed.reprice(); drawInfo(); } });
    const fLead = SA.form.field({ name: 'leadId', label: 'العميل المحتمل', type: 'select', required: true, value: leadId, options: [['', 'اختر العميل المحتمل…']].concat(leads.concat(pLead && leads.indexOf(pLead) < 0 ? [pLead] : []).map((l) => [l.id, leadName(l) + ' — ' + l.id])), onChange: (v) => { leadId = v; drawInfo(); } });
    const fPl = SA.form.field({ name: 'pl', label: 'قائمة الأسعار', type: 'select', value: pl, options: get('priceLists').map((p) => [p.id, p.name + (p.factor != null ? ' (×' + p.factor + ')' : '')]), onChange: (v) => { pl = v; ed.reprice(); } });
    const fValid = SA.form.field({ name: 'validUntil', label: 'صالح حتى', type: 'date', required: true, value: (q0 && q0.validUntil) || ERP.day(14) });
    const fDisc = SA.form.field({ name: 'discountPct', label: 'خصم إضافي %', type: 'number', min: 0, max: 30, value: q0 ? q0.discountPct || 0 : 0, onInput: () => refresh() });
    const fNotes = SA.form.field({ name: 'notes', label: 'ملاحظات تظهر في العرض', type: 'textarea', rows: 2, value: (q0 && q0.notes) || '' });
    const ed = lineEditor({ lines: q0 ? q0.lines : [], priceOf, onChange: () => refresh() });
    function drawInfo() {
      SA.clear(custBox); SA.clear(leadBox);
      if (mode === 'customer') { const c = cid ? ERP.customer(cid) : null; custBox.append(fCust.el, c ? h('div.crm-row', {}, segChip(c.segment), tierChip(c.tier), h('span.crm-muted', {}, 'قائمة الأسعار: ' + ((ERP.find('priceLists', c.priceListId) || {}).name || '—') + ' · المندوب ' + SA.userName(c.salesRepId)), c.export ? exportFlag() : null) : null); }
      else { const l = leadId ? ERP.find('leads', leadId) : null; leadBox.append(h('div.crm-fgrid', {}, fLead.el, fPl.el), l ? h('div.crm-row', {}, U.status('lead', l.stage), famChip(l.interest), h('span.crm-muted', {}, l.name + ' · ' + (l.city || '') + ' · ' + money(l.value))) : null, SA.alert('info', 'عرض لعميل محتمل: عند قبول العرض يُطلب تحويله لعميل قبل إنشاء أمر البيع.')); }
    }
    function draft() { return { customerId: mode === 'customer' ? cid : null, lines: ed.get(), discountPct: Number(fDisc.get()) || 0 }; }
    function refresh() {
      SA.clear(summary); const d = draft(); const over = d.discountPct > F.limits.discountPct;
      summary.append(SA.card({ title: 'الإجماليات' }, totalsBox(d), over ? SA.alert('warning', h('b', {}, 'يحتاج اعتماد: '), 'الخصم ' + d.discountPct + '% أعلى من حد المندوب ' + F.limits.discountPct + '% — يُرسل لـ' + (d.discountPct > F.limits.gmDiscountPct ? 'مدير المبيعات ثم المدير العام' : 'مدير المبيعات') + ' عند الإرسال. ', U.demo('حدود تجريبية')) : null, d.lines.length ? quoteMarginBox(d) : null),
        SA.card({ title: 'الصلاحية والإرسال' }, fValid.el, fDisc.el, h('div.crm-row', {}, SA.btn({ label: 'حفظ كمسودة', icon: 'check', kind: 'ghost', onClick: () => save(false) }), SA.btn({ label: over ? 'حفظ وإرسال للاعتماد' : 'حفظ وإرسال للعميل', icon: 'send', kind: 'accent', attrs: { 'data-crm': 'save-send' }, onClick: () => save(true) }))));
    }
    async function save(send) {
      const lines = ed.get(); if (mode === 'customer' && !cid) { fCust.validate(); SA.toast('اختر العميل', 'warn'); return; } if (mode === 'lead' && !leadId) { fLead.validate(); SA.toast('اختر العميل المحتمل', 'warn'); return; }
      if (!lines.length) { SA.toast('أضف صنفًا واحدًا على الأقل بكمية أكبر من صفر', 'warn'); return; }
      const disc = Number(fDisc.get()) || 0; if (disc < 0 || disc > 30) { fDisc.error('الخصم بين 0 و30%'); return; }
      if (!fValid.validate()) return; if (fValid.get() < today()) { fValid.error('تاريخ الصلاحية في الماضي'); return; }
      const lead = leadId ? ERP.find('leads', leadId) : null; const cust = mode === 'customer' && cid ? ERP.customer(cid) : null; let id;
      try { await SA.api(() => {
        const base = { customerId: cust ? cust.id : null, leadId: cust ? leadId || cust.leadId || null : leadId || null, prospect: cust ? null : leadName(lead), priceListId: cust ? cust.priceListId : pl, lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price })), discountPct: disc, validUntil: fValid.get(), notes: String(fNotes.get() || '').trim(), repId: cust ? cust.salesRepId : (lead && lead.ownerId) || meId() };
        if (q0) { st.patch('quotations', q0.id, Object.assign(base, { updatedAt: nowIso(), changesNote: null })); id = q0.id; SA.audit('QUOTE.UPDATED', { target: { type: 'quotation', id, label: base.prospect || custName(base.customerId) }, after: { total: F.totals(base).total, discountPct: disc } }); }
        else { id = ERP.no('QT'); st.insert('quotations', Object.assign({ id, status: 'draft', createdAt: nowIso(), createdBy: meId() }, base), true); SA.audit('QUOTE.CREATED', { target: { type: 'quotation', id, label: base.prospect || custName(base.customerId) }, after: { total: F.totals(base).total, discountPct: disc, lines: lines.length } }); }
        if (send) sendQuoteNow(id);
      }); } catch (e) { return SA.fail(e); }
      const q = ERP.find('quotations', id);
      SA.toast(send ? (q.status === 'pending_approval' ? 'تم الحفظ — أُرسل الخصم لاعتماد مدير المبيعات' : 'تم حفظ العرض وإرساله للعميل') : 'تم حفظ عرض السعر كمسودة', 'success');
      SA.nav('crm/quotes/' + id);
    }
    const modeSeg = SA.segmented([['customer', 'عميل مسجّل'], ['lead', 'عميل محتمل']], mode, (v) => { mode = v; ed.reprice(); drawInfo(); refresh(); custBox.hidden = mode !== 'customer'; leadBox.hidden = mode !== 'lead'; });
    custBox.hidden = mode !== 'customer'; leadBox.hidden = mode !== 'lead';
    root.append(h('div.crm-page', {}, head({ title: q0 ? 'تعديل عرض السعر ' + q0.id : 'عرض سعر جديد', desc: 'اختر العميل والأصناف بألوانها — السعر يُحسب من قائمة أسعار العميل ويمكن تعديله، والإجماليات تتحدّث لحظيًا.', back: { label: 'عروض الأسعار', href: '#/crm/quotes' + (q0 ? '/' + q0.id : '') } }),
      q0 && q0.changesNote ? SA.alert('warning', h('b', {}, 'مطلوب تعديل من المعتمد: '), q0.changesNote) : null,
      h('div.crm-builder', {}, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, SA.card({ title: 'العميل', actions: [modeSeg] }, custBox, leadBox), SA.card({ title: 'البنود' }, ed.el), SA.card({ title: 'ملاحظات' }, fNotes.el)), h('aside.crm-sticky', {}, summary))));
    drawInfo(); refresh();
    return null;
  }
  function quoteDetail(root, ctx, id) {
    return SA.live(root, () => {
      const q = ERP.find('quotations', id);
      ctx.setCrumbs([{ label: 'عروض الأسعار والطلبات' }, { label: 'عروض الأسعار', href: '#/crm/quotes' }, { label: id }]);
      if (!q) return notFound('عرض السعر ' + id, 'crm/quotes');
      if (!inScope(q.repId)) return outOfScope(id);
      const s = qStatus(q); const t = F.totals(q); const ap = q.approvalId ? ERP.find('approvals', q.approvalId) : null; const lead = q.leadId ? ERP.find('leads', q.leadId) : null; const so = q.soId ? ERP.find('salesOrders', q.soId) : null;
      const acts = [];
      acts.push(SA.btn({ label: 'معاينة وطباعة A4', icon: 'doc', kind: 'ghost', onClick: () => printQuote(q) }));
      if (s === 'draft') { acts.push(SA.btn({ label: 'تعديل', icon: 'edit', kind: 'ghost', perm: 'crm.quotes.edit', onClick: () => SA.nav('crm/quotes/new', { query: { edit: q.id } }) })); acts.push(SA.btn({ label: (q.discountPct || 0) > F.limits.discountPct ? 'إرسال للاعتماد' : 'إرسال للعميل', icon: 'send', kind: 'accent', perm: 'crm.quotes.edit', onClick: () => sendQuote(q) })); }
      if (s === 'sent') { acts.push(SA.btn({ label: 'رفض العميل', icon: 'xcircle', kind: 'ghost', perm: 'crm.quotes.edit', onClick: () => rejectQuote(q) })); acts.push(SA.btn({ label: 'قبول وتحويل لأمر بيع', icon: 'checkcircle', kind: 'accent', perm: 'crm.orders.create', attrs: { 'data-crm': 'accept' }, onClick: () => acceptQuote(q) })); }
      if (s === 'expired') acts.push(SA.btn({ label: 'تجديد الصلاحية', icon: 'refresh', kind: 'primary', perm: 'crm.quotes.edit', onClick: () => renewQuote(q) }));
      if (s === 'pending_approval' && ap) decideButtons(ap).forEach((b) => acts.push(b));
      const days = q.validUntil ? ERP.daysBetween(today(), q.validUntil) : null;
      const linesCard = SA.card({ title: 'البنود (' + q.lines.length + ')' }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الصنف'), h('th.num', {}, 'الكمية'), h('th.num', {}, 'سعر الوحدة'), h('th.num', {}, 'الإجمالي'), h('th', {}, 'المتاح الآن'))),
        h('tbody', {}, q.lines.map((l) => { const it = ERP.item(l.itemId) || {}; const av = ERP.stock.available(l.itemId, ERP.stock.FG); return h('tr', {}, h('td', {}, U.itemCell(l.itemId)), h('td.num', {}, fm.qty(l.qty, it.uom)), h('td.num', {}, money(l.price)), h('td.num', {}, h('b', {}, money(l.qty * l.price))), h('td', {}, av >= l.qty ? SA.chip('متاح ' + fm.num(av), 'success') : SA.chip('متاح ' + fm.num(av) + ' — يُصنَّع الباقي', 'warning'))); })))), h('div', { style: { maxWidth: '420px', marginInlineStart: 'auto', width: '100%' } }, totalsBox(q)));
      const info = SA.card({ title: 'بيانات العرض' }, h('div.crm-kv-tight', {}, SA.kv([['العميل', q.customerId ? custLink(q.customerId) : h('b', {}, q.prospect || '—')], lead ? ['العميل المحتمل', h('span.crm-row', {}, leadLink(lead), U.status('lead', lead.stage))] : null, ['المندوب', repCell(q.repId)], ['قائمة الأسعار', (ERP.find('priceLists', q.priceListId || (ERP.customer(q.customerId) || {}).priceListId) || {}).name || '—'], ['الخصم', (q.discountPct || 0) + '%' + ((q.discountPct || 0) > F.limits.discountPct ? ' (أعلى من حد المندوب)' : '')], ['أُنشئ', SA.fmt.dt(q.createdAt)], q.sentAt ? ['أُرسل', SA.fmt.dt(q.sentAt)] : null, ['صالح حتى', h('span', { class: days != null && days <= 3 && s === 'sent' ? 'crm-late' : null }, fm.date(q.validUntil) + (s === 'sent' && days != null ? (days >= 0 ? ' (متبقي ' + days + ' يوم)' : '') : ''))], ap ? ['طلب الاعتماد', h('span.crm-row', {}, U.docLink(ap.id), SA.statusChip('approval', ap.status))] : null, so ? ['أمر البيع', h('span.crm-row', {}, U.docLink(so.id), U.status('so', so.status))] : null, q.notes ? ['ملاحظات', q.notes] : null])));
      const margin = SA.card({ title: 'الربحية الداخلية', tags: U.canCost() ? null : h('span.crm-locknote', {}, SA.icon('lock', 'icon-sm'), 'تظهر فقط بصلاحية data.cost.view') }, quoteMarginBox(q));
      return h('div.crm-page', {},
        head({ title: 'عرض سعر ' + q.id, desc: (q.prospect || custName(q.customerId)) + ' · ' + money(t.total) + ' · ' + SA.userName(q.repId), tags: [U.status('quote', s), q.discountPct ? SA.chip('خصم ' + q.discountPct + '%', q.discountPct > F.limits.discountPct ? 'warning' : 'neutral') : null], back: { label: 'عروض الأسعار', href: '#/crm/quotes' }, actions: acts }),
        s === 'pending_approval' ? SA.card({ title: 'اعتماد الخصم', tags: U.demo('حدود تجريبية — بند 33') }, h('p.crm-muted', { style: { margin: 0 } }, 'الخصم ' + q.discountPct + '% أعلى من حد المندوب ' + F.limits.discountPct + '%. بعد الاعتماد يتحول العرض تلقائيًا إلى «مُرسل للعميل».'), stepChain(ap)) : null,
        s === 'rejected' ? SA.alert('danger', h('b', {}, q.rejectedBy === 'approval' ? 'رُفض الخصم من المعتمد: ' : 'رفض العميل العرض: '), q.rejectedReason || '—') : null,
        s === 'accepted' && so ? SA.alert('success', h('b', {}, 'تم قبول العرض وتحويله لأمر بيع: '), U.docLink(so.id), ' — ', stLabel('so', so.status)) : null,
        s === 'sent' && days != null && days <= 3 ? SA.alert('warning', 'العرض ينتهي ' + (days === 0 ? 'اليوم' : 'خلال ' + days + ' يوم') + ' — تابع مع العميل أو جدّد الصلاحية.') : null,
        s === 'expired' ? SA.alert('warning', 'انتهت صلاحية العرض في ' + fm.date(q.validUntil) + '.') : null,
        q.changesNote && s === 'draft' ? SA.alert('warning', h('b', {}, 'مطلوب تعديل: '), q.changesNote) : null,
        so ? SA.card({ title: 'دورة المستند' }, U.chain(so.id)) : null,
        h('div.crm-builder', {}, linesCard, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, info, margin)));
    }, ['quotations', 'approvals', 'salesOrders', 'leads']);
  }

  /* ═════════════════════════ 6. SALES ORDERS ═════════════════════════ */
  async function submitSO(id) {
    const so = ERP.find('salesOrders', id); if (!so) return; const need = needsApproval(so);
    const r = await SA.confirm({ title: need ? 'إرسال أمر البيع للاعتماد' : 'إرسال وتأكيد أمر البيع', text: so.id + ' — ' + custName(so.customerId) + ' · ' + money(F.totals(so).total), extra: predictBox(so), confirmLabel: need ? 'إرسال للاعتماد' : 'إرسال' });
    if (!r.ok) return; let res;
    try { await SA.api(() => { res = F.submitOrder(id); }); } catch (e) { return SA.fail(e); }
    showOutcome(id, res, need ? 'أُرسل أمر البيع للاعتماد' : 'تم تأكيد أمر البيع');
  }
  async function confirmSO(id) {
    if (!SA.can('crm.orders.confirm') || !SA.canSensitive('sales.order.confirm')) { SA.toast('يحتاج صلاحية crm.orders.confirm + الصلاحية الحساسة sales.order.confirm', 'warn'); return; }
    const so = ERP.find('salesOrders', id); if (!so) return;
    const r = await SA.confirm({ title: 'تأكيد أمر البيع مباشرة', text: so.id + ' — ' + custName(so.customerId) + ' · ' + money(F.totals(so).total), impact: ['يُحجز المتاح من مخزون المنتج التام.', 'تُنشأ أوامر تشغيل مخططة للكميات غير المتاحة ويُبلَّغ مدير الإنتاج.', 'يتسجّل SO.CONFIRMED باسمك (صلاحية حساسة: تأكيد الطلب).'], extra: predictBox(so, 'المتوقع:'), confirmLabel: 'تأكيد الطلب' });
    if (!r.ok) return; let res;
    try { await SA.api(() => { res = F.confirmOrder(id); }); } catch (e) { return SA.fail(e); }
    showOutcome(id, res, 'تم تأكيد أمر البيع');
  }
  async function cancelSO(id) {
    const so = ERP.find('salesOrders', id); if (!so) return; const wos = (so.woIds || []).length;
    const r = await SA.confirm({ title: 'إلغاء أمر البيع ' + so.id, text: custName(so.customerId) + ' · ' + money(F.totals(so).total), danger: true, reasonRequired: true, reasonLabel: 'سبب الإلغاء', confirmLabel: 'إلغاء الطلب', impact: ['تُفك حجوزات المخزون المرتبطة بالطلب.', wos ? wos + ' أمر تشغيل مرتبط لا يُلغى تلقائيًا — يُبلَّغ مدير الإنتاج لمراجعته.' : 'لا توجد أوامر تشغيل مرتبطة.', 'الإلغاء نهائي ويتسجّل SO.CANCELLED.'] });
    if (!r.ok) return;
    try { await SA.api(() => { F.cancelOrder(id, r.reason); if (wos) SA.notify({ title: 'إلغاء أمر بيع مرتبط بأوامر تشغيل: ' + id, body: custName(so.customerId) + ' — راجع أوامر التشغيل (' + so.woIds.join('، ') + ').', level: 'action', to: ['R-05'], link: '#/mfg/workorders' }); }); } catch (e) { return SA.fail(e); }
    SA.toast('تم إلغاء أمر البيع ' + id, 'success');
  }
  async function makeDN(id) {
    const so = ERP.find('salesOrders', id); if (!so) return;
    const lines = so.lines.map((l) => ({ itemId: l.itemId, qty: Math.max(0, (l.reservedQty || 0) - (l.deliveredQty || 0) - F.pendingDnQty(id, l.itemId)) })).filter((l) => l.qty > 0);
    const r = await SA.confirm({ title: 'إنشاء إذن تسليم', text: so.id + ' — ' + custName(so.customerId), impact: lines.map((l) => (ERP.item(l.itemId) || {}).name + ': ' + fm.num(l.qty)).concat(['الكميات من المحجوز في مخزون المنتج التام — الإخراج الفعلي من شاشة أذون التسليم.']), confirmLabel: 'إنشاء الإذن' });
    if (!r.ok) return; let dn;
    try { await SA.api(() => { dn = F.createDelivery(id); if (dn) SA.notify({ title: 'إذن تسليم جديد: ' + dn.id, body: custName(so.customerId) + ' — ' + dn.lines.length + ' صنف · مخطط ' + fm.date(dn.plannedDate), level: 'action', to: ['R-17', 'R-06'], link: '#/scm/deliveries/' + dn.id }); }); } catch (e) { return SA.fail(e); }
    if (dn) SA.toast('تم إنشاء إذن التسليم ' + dn.id, 'success'); else SA.toast('لا توجد كميات محجوزة جاهزة للتسليم', 'warn');
  }
  function renderOrders(root, ctx) {
    const p0 = ctx.path[0]; if (p0 === 'new') return orderForm(root, ctx); if (p0) return orderDetail(root, ctx, p0);
    ctx.setCrumbs([{ label: 'عروض الأسعار والطلبات' }, { label: 'أوامر البيع' }]);
    const kpiBox = h('div');
    const drawK = () => { SA.clear(kpiBox); const os = myOrders(); const open = os.filter((o) => OPEN_SO.indexOf(o.status) >= 0); const late = open.filter(isLate);
      kpiBox.append(U.kpis([U.kpi({ label: 'أوامر مفتوحة', value: short(sum(open, (o) => F.totals(o).total)), icon: 'cart', sub: open.length + ' أمر' }), U.kpi({ label: 'بانتظار الاعتماد', value: String(os.filter((o) => o.status === 'pending_approval').length), icon: 'inbox', tone: os.some((o) => o.status === 'pending_approval') ? 'warning' : '', href: '#/crm/orders?status=pending_approval', sub: 'خصم أو قيمة فوق الحد' }), U.kpi({ label: 'قيد التصنيع', value: String(os.filter((o) => o.status === 'in_production').length), icon: 'factory', href: '#/crm/orders?status=in_production', sub: 'مرتبطة بأوامر تشغيل' }), U.kpi({ label: 'متأخرة', value: String(late.length), icon: 'clock', tone: late.length ? 'danger' : 'success', href: '#/crm/orders?late=1', sub: 'تجاوزت موعد التسليم' }), U.kpi({ label: 'طلبات البوابة', value: String(os.filter((o) => o.source === 'portal' && o.status === 'pending_review').length), icon: 'globe', href: '#/crm/dealer-orders', sub: 'بانتظار مكالمة التأكيد' })])); };
    const reps = uniq(myOrders().map((o) => o.repId)).map((id) => [id, SA.userName(id)]);
    const t = SA.table({
      caption: 'أوامر البيع', pageSize: 10, rows: () => myOrders(),
      columns: [
        { key: 'id', label: 'الأمر', sort: true, render: (o) => h('span.crm-cell', {}, U.docLink(o.id), h('small', {}, SA.fmt.rel(o.createdAt))) },
        { key: 'customer', label: 'العميل', value: (o) => custName(o.customerId), sort: true, render: (o) => { const c = ERP.customer(o.customerId) || {}; return h('span.crm-cell', {}, custLink(o.customerId), h('small', {}, h('span', {}, (SEG[c.segment] || '') + (c.city ? ' · ' + c.city : '')), o.export ? [' ', exportFlag()] : null)); } },
        { key: 'source', label: 'المصدر', render: (o) => srcChip(o.source) },
        { key: 'repId', label: 'المندوب', render: (o) => repCell(o.repId) },
        { key: 'total', label: 'الإجمالي', class: 'num', sort: true, value: (o) => F.totals(o).total, render: (o) => h('span.crm-cell', {}, h('b.num', {}, money(F.totals(o).total)), o.discountPct ? h('small', {}, 'خصم ' + o.discountPct + '%') : null) },
        { key: 'status', label: 'الحالة', sort: (a, b) => OPEN_SO.concat(DONE_SO).indexOf(a.status) - OPEN_SO.concat(DONE_SO).indexOf(b.status), render: (o) => h('span.crm-row', {}, U.status('so', o.status), o.priority === 'high' ? SA.chip('أولوية', 'danger') : null) },
        { key: 'promisedDate', label: 'موعد التسليم', sort: true, render: (o) => (isLate(o) ? h('span.crm-cell', {}, h('b.crm-late', {}, fm.date(o.promisedDate)), h('small.crm-late', {}, 'متأخر ' + ERP.daysBetween(o.promisedDate) + ' يوم')) : fm.date(o.promisedDate)) }
      ],
      search: { placeholder: 'ابحث برقم الأمر أو العميل…', keys: (o, q) => (o.id + ' ' + custName(o.customerId)).toLowerCase().indexOf(q) >= 0 },
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(SA.catalog.status.so).map((k) => [k, stLabel('so', k)]) }, { key: 'source', label: 'المصدر', options: Object.keys(SRC).map((k) => [k, SRC[k][0]]) }, reps.length > 1 ? { key: 'repId', label: 'المندوب', options: reps } : null,
        { key: 'late', label: 'التأخير', options: [['1', 'متأخر فقط'], ['open', 'مفتوح فقط']], test: (o, v) => (v === '1' ? isLate(o) : OPEN_SO.indexOf(o.status) >= 0) }].filter(Boolean),
      initial: { q: ctx.params.q || '', sort: { key: 'id', dir: 'desc' }, filters: { status: ctx.params.status || '', source: ctx.params.source || '', late: ctx.params.late || '' } },
      onRowClick: (o) => SA.nav('crm/orders/' + o.id),
      rowActions: (o) => [{ label: 'فتح', icon: 'eye', onClick: () => SA.nav('crm/orders/' + o.id) }, { label: 'سجّل نتيجة المكالمة', icon: 'phone', hidden: o.status !== 'pending_review', disabled: SA.can('crm.dealer_orders.review') ? false : 'ليست من صلاحياتك', onClick: () => callModal(o.id) }, { label: 'العميل 360°', icon: 'users', onClick: () => SA.nav('crm/customers/' + o.customerId) }],
      empty: { icon: 'cart', title: 'لا توجد أوامر بيع', action: { label: 'أمر بيع جديد', perm: 'crm.orders.create', onClick: () => SA.nav('crm/orders/new') } }
    });
    root.append(h('div.crm-page', {}, head({ title: 'أوامر البيع', desc: 'كل الطلبات من المندوبين وبوابة التجار والمعارض — الحالة وموعد التسليم ودورة المستند حتى التحصيل.', actions: [SA.btn({ label: 'أمر بيع جديد', icon: 'plus', kind: 'primary', perm: 'crm.orders.create', onClick: () => SA.nav('crm/orders/new') })] }), kpiBox, listCard(t)));
    drawK();
    return watch(['salesOrders', 'approvals'], () => { drawK(); t.refresh(); });
  }
  function orderForm(root, ctx) {
    ctx.setCrumbs([{ label: 'عروض الأسعار والطلبات' }, { label: 'أوامر البيع', href: '#/crm/orders' }, { label: 'أمر بيع جديد' }]);
    if (!SA.can('crm.orders.create')) { root.append(SA.denied({ perm: 'crm.orders.create' })); return null; }
    const custs = myCustomers().filter((c) => c.status !== 'disabled'); let cid = ctx.params.customer && custs.some((c) => c.id === ctx.params.customer) ? ctx.params.customer : '';
    const side = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }); const custInfo = h('div');
    const fCust = SA.form.field({ name: 'customerId', label: 'العميل', type: 'select', required: true, value: cid, options: [['', 'اختر العميل…']].concat(custs.map((c) => [c.id, c.name + ' — ' + c.code])), onChange: (v) => { cid = v; ed.reprice(); drawCust(); } });
    const fDisc = SA.form.field({ name: 'discountPct', label: 'خصم %', type: 'number', min: 0, max: 30, value: 0, onInput: () => refresh() });
    const fProm = SA.form.field({ name: 'promisedDate', label: 'موعد التسليم المتفق', type: 'date', required: true, value: ERP.day(21) });
    const fPrio = SA.form.field({ name: 'priority', label: 'الأولوية', type: 'select', value: 'normal', options: [['normal', 'عادية'], ['high', 'عالية']] });
    const fNotes = SA.form.field({ name: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 });
    const ed = lineEditor({ priceOf: (itemId) => (cid ? F.priceFor(cid, itemId) : (ERP.item(itemId) || {}).price || 0), onChange: () => refresh() });
    function drawCust() { SA.clear(custInfo); const c = cid ? ERP.customer(cid) : null; if (c) custInfo.append(h('div.crm-row', {}, segChip(c.segment), tierChip(c.tier), c.export ? exportFlag() : null, h('span.crm-muted', {}, 'قائمة الأسعار: ' + ((ERP.find('priceLists', c.priceListId) || {}).name || '—') + ' · السداد ' + (c.termsDays ? c.termsDays + ' يوم' : 'نقدي') + ' · المندوب ' + SA.userName(c.salesRepId)))); refresh(); }
    function draft() { return { customerId: cid, lines: ed.get(), discountPct: Number(fDisc.get()) || 0 }; }
    function refresh() { SA.clear(side); const d = draft(); const t = F.totals(d);
      side.append(SA.card({ title: 'الإجماليات' }, totalsBox(d)), cid ? SA.card({ title: 'فحص الائتمان', tags: U.demo('تجريبي') }, creditBox(cid, t.total)) : null, d.lines.length ? SA.card({ title: 'التوقع' }, predictBox(d)) : null,
        SA.card({}, h('div.crm-row', {}, SA.btn({ label: 'حفظ كمسودة', icon: 'check', kind: 'ghost', onClick: () => submit(false) }), SA.btn({ label: 'إرسال الطلب', icon: 'send', kind: 'accent', attrs: { 'data-crm': 'so-send' }, onClick: () => submit(true) })))); }
    async function submit(send) {
      if (!fCust.validate()) { SA.toast('اختر العميل', 'warn'); return; } const d = draft(); if (!d.lines.length) { SA.toast('أضف صنفًا واحدًا على الأقل', 'warn'); return; }
      if (d.discountPct < 0 || d.discountPct > 30) { fDisc.error('الخصم بين 0 و30%'); return; } if (!fProm.validate()) return;
      let so, res;
      try { await SA.api(() => { so = F.createOrder({ customerId: cid, lines: d.lines, discountPct: d.discountPct, promisedDate: fProm.get(), priority: fPrio.get(), notes: String(fNotes.get() || '').trim(), source: 'rep' }); if (send) res = F.submitOrder(so.id); }); } catch (e) { return SA.fail(e); }
      SA.nav('crm/orders/' + so.id);
      if (send) showOutcome(so.id, res, res === 'pending_approval' ? 'أُرسل أمر البيع للاعتماد' : 'تم إرسال وتأكيد أمر البيع'); else SA.toast('تم حفظ أمر البيع ' + so.id + ' كمسودة', 'success');
    }
    root.append(h('div.crm-page', {}, head({ title: 'أمر بيع جديد', desc: 'بنود بأسعار قائمة العميل، فحص الائتمان، وتوقع ما سيحدث (اعتماد، حجز، أوامر تشغيل) قبل الإرسال.', back: { label: 'أوامر البيع', href: '#/crm/orders' } }),
      h('div.crm-builder', {}, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, SA.card({ title: 'العميل والتسليم' }, h('div.crm-fgrid', {}, h('div.crm-wide', {}, fCust.el), fProm.el, fPrio.el, fDisc.el), custInfo), SA.card({ title: 'البنود' }, ed.el), SA.card({ title: 'ملاحظات' }, fNotes.el)), h('aside.crm-sticky', {}, side))));
    drawCust();
    return null;
  }
  function impactBlocks(so, wos) {
    return wos.filter((w) => w.status === 'on_hold').map((w) => {
      const ln = lineOf(w.lineId); const down = ln.status === 'down';
      const mwo = get('maintenanceOrders').find((m) => m.lineId === w.lineId && ['done', 'cancelled'].indexOf(m.status) < 0 && m.kind === 'breakdown');
      const apx = mwo ? get('approvals').find((a) => a.ref && a.ref.id === mwo.id) : null;
      const prq = mwo ? get('purchaseRequisitions').find((r) => r.source === 'maintenance' && (mwo.parts || []).some((p) => p.itemId === r.itemId)) : null;
      const left = Math.max(0, w.qty - (w.qtyDone || 0)); const cap = ln.capacityPerShift || 0; const shifts = cap ? Math.ceil(left / cap) : null;
      const ship = get('shipments').find((s) => (s.soIds || []).indexOf(so.id) >= 0);
      return h('div.crm-impact', { role: 'alert' }, h('div.crm-impact-head', {}, SA.icon('alert'), h('b', {}, 'إنتاج متوقف يؤثر على هذا الطلب'), U.status('wo', w.status)),
        h('p', {}, U.docLink(w.id), ' — ', ERP.itemName(w.itemId), ': تم ', h('b.num', {}, fm.num(w.qtyDone)), ' من ', h('b.num', {}, fm.num(w.qty)), ' · المتبقي ', h('b.num', {}, fm.num(left)), shifts ? ' (≈ ' + shifts + ' وردية بعد عودة الخط)' : ''),
        w.holdReason ? h('p', {}, h('b', {}, 'سبب الإيقاف: '), w.holdReason) : null,
        down ? h('p', {}, h('b', {}, 'الخط: '), U.docLink(ln.id, ln.code + ' — ' + ln.name), ' متوقف ', SA.fmt.rel(ln.downSince), ln.downReason ? ' · ' + ln.downReason : '') : null,
        h('div.crm-row', {}, mwo ? h('span.crm-row', {}, 'أمر الصيانة ', U.docLink(mwo.id), U.status('mwo', mwo.status)) : null, apx ? h('span.crm-row', {}, 'اعتماد قطعة الغيار ', U.docLink(apx.id), SA.statusChip('approval', apx.status)) : null, prq ? h('span.crm-row', {}, 'طلب الشراء ', U.docLink(prq.id), U.status('prq', prq.status)) : null),
        h('p.crm-muted', {}, 'موعد التسليم المتفق ' + fm.date(so.promisedDate) + (ship ? ' · الشحنة ' + ship.id + ' تغادر ' + fm.date(ship.etd) : '') + ' — يُنصح بإبلاغ العميل بالموقف ومتابعة وصول قطعة الغيار.'));
    });
  }
  function soLinesTable(so) {
    const canP = U.canProfit();
    return h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الصنف'), h('th.num', {}, 'الكمية'), h('th.num', {}, 'السعر'), h('th.num', {}, 'الإجمالي'), h('th', {}, 'محجوز'), h('th', {}, 'مُسلَّم'), h('th', {}, 'مُفوتر'), h('th', {}, 'التكلفة / الهامش'))),
      h('tbody', {}, so.lines.map((l) => { const it = ERP.item(l.itemId) || {}; const lt = l.qty * l.price; const net = lt * (1 - (so.discountPct || 0) / 100); const cost = (it.stdCost || 0) * l.qty;
        return h('tr', {}, h('td', {}, U.itemCell(l.itemId)), h('td.num', {}, fm.qty(l.qty, it.uom)), h('td.num', {}, money(l.price)), h('td.num', {}, h('b', {}, money(lt))), h('td', {}, prog(l.reservedQty, l.qty)), h('td', {}, prog(l.deliveredQty, l.qty)), h('td', {}, prog(l.invoicedQty, l.qty)),
          h('td', {}, h('span.crm-cell', {}, U.cost(cost), h('small', {}, 'هامش ', U.cost(net - cost, 'data.profit.view'), canP && net ? ' (' + fm.pct((net - cost) / net) + ')' : '')))); }))));
  }
  function orderDetail(root, ctx, id) {
    return SA.live(root, () => {
      const so = ERP.find('salesOrders', id);
      ctx.setCrumbs([{ label: 'عروض الأسعار والطلبات' }, { label: 'أوامر البيع', href: '#/crm/orders' }, { label: id }]);
      if (!so) return notFound('أمر البيع ' + id, 'crm/orders');
      if (!inScope(so.repId)) return outOfScope(id);
      const c = ERP.customer(so.customerId) || {}; const t = F.totals(so); const ap = so.approvalId ? ERP.find('approvals', so.approvalId) : null;
      const wos = (so.woIds || []).map((w) => ERP.find('workOrders', w)).filter(Boolean); const dns = (so.dnIds || []).map((d) => ERP.find('deliveries', d)).filter(Boolean);
      const invs = (so.invoiceIds || []).map((i) => ERP.find('invoices', i)).filter(Boolean); const ships = get('shipments').filter((s) => (s.soIds || []).indexOf(so.id) >= 0);
      const quote = so.quoteId ? ERP.find('quotations', so.quoteId) : null;
      let accent = false; const kind = () => { if (accent) return 'primary'; accent = true; return 'accent'; }; const acts = [];
      if (so.status === 'pending_review' && so.source === 'portal') acts.push(SA.btn({ label: 'سجّل نتيجة المكالمة', icon: 'phone', kind: kind(), perm: 'crm.dealer_orders.review', onClick: () => callModal(so.id) }));
      if (so.status === 'draft') {
        const need = needsApproval(so);
        acts.push(SA.btn({ label: need ? 'إرسال للاعتماد' : 'إرسال وتأكيد', icon: 'send', kind: kind(), perm: 'crm.orders.edit', onClick: () => submitSO(so.id) }));
        if (SA.can('crm.orders.confirm')) acts.push(SA.btn({ label: 'تأكيد مباشر', icon: 'checkcircle', kind: 'primary', reason: !SA.canSensitive('sales.order.confirm') ? 'تحتاج الصلاحية الحساسة: تأكيد الطلب (sales.order.confirm)' : need ? 'الطلب يتجاوز حدود الاعتماد (' + need + ') — أرسله للاعتماد' : '', onClick: () => confirmSO(so.id) }));
      }
      if (so.status === 'pending_approval' && ap) decideButtons(ap).forEach((b) => acts.push(b));
      if (SA.can('scm.deliveries.create') && ['confirmed', 'in_production', 'ready', 'partially_delivered'].indexOf(so.status) >= 0 && deliverable(so) > 0) acts.push(SA.btn({ label: 'إنشاء إذن تسليم', icon: 'truck', kind: kind(), onClick: () => makeDN(so.id) }));
      if (invoiceable(so) && SA.can('fin.invoices.view')) acts.push(SA.btn({ label: 'الفوترة', icon: 'receipt', kind: 'ghost', onClick: () => SA.nav('fin/invoices', { query: { so: so.id } }) }));
      if (['draft', 'pending_review', 'pending_approval', 'confirmed', 'in_production', 'ready', 'rejected'].indexOf(so.status) >= 0) acts.push(SA.btn({ label: 'إلغاء', icon: 'xcircle', kind: 'ghost', perm: 'crm.orders.edit', onClick: () => cancelSO(so.id) }));
      const over = c.creditLimit && (c.balance || 0) + t.total > c.creditLimit && DONE_SO.indexOf(so.status) < 0;
      const alerts = [
        so.status === 'pending_review' ? SA.alert('warning', h('b', {}, 'طلب من بوابة التاجر بانتظار مكالمة التأكيد (بند 48): '), 'وصل ' + SA.fmt.rel(so.submittedAt || so.createdAt) + ' — اتصل بالتاجر على ', h('span.num', { dir: 'ltr' }, (so.call && so.call.phone) || ''), so.call && so.call.preferredTime ? ' (' + so.call.preferredTime + ')' : '') : null,
        isLate(so) ? SA.alert('danger', h('b', {}, 'متأخر عن موعد التسليم: '), 'كان ' + fm.date(so.promisedDate) + ' — متأخر ' + ERP.daysBetween(so.promisedDate) + ' يوم.') : null,
        so.status === 'rejected' ? SA.alert('danger', h('b', {}, 'رفض المعتمد الطلب: '), so.rejectedReason || '—') : null,
        so.status === 'cancelled' ? SA.alert('danger', h('b', {}, 'تم الإلغاء: '), so.cancelReason || '—') : null,
        so.status === 'draft' && so.changesNote ? SA.alert('warning', h('b', {}, 'مطلوب تعديل من المعتمد: '), typeof so.changesNote === 'object' ? so.changesNote.note || '' : so.changesNote) : null,
        over ? SA.alert('warning', h('b', {}, 'فحص الائتمان (تجريبي): '), 'رصيد العميل ' + money(c.balance || 0) + ' + هذا الطلب ' + money(t.total) + ' يتجاوز الحد ' + money(c.creditLimit) + ' — بلا إيقاف تلقائي (بند 41).') : null
      ].concat(impactBlocks(so, wos)).filter(Boolean);
      const linesCard = SA.card({ title: 'البنود', tags: U.canCost() ? null : h('span.crm-locknote', {}, SA.icon('lock', 'icon-sm'), 'التكلفة والهامش سرية — data.cost.view') }, soLinesTable(so), h('div', { style: { maxWidth: '420px', marginInlineStart: 'auto', width: '100%' } }, totalsBox(so)));
      const custCard = SA.card({ title: 'العميل', actions: [h('a.sap-linkbtn', { href: '#/crm/customers/' + c.id }, 'العميل 360°')] }, h('div.crm-hero', {}, h('span.crm-hero-ico', {}, SA.fmt.initials(c.name || '?')), h('div.crm-cell', {}, h('b', {}, custLink(c.id)), h('small', {}, (c.code || '') + ' · ' + (SEG[c.segment] || '') + ' · ' + (c.city || '') + (c.region ? ' · ' + c.region : '')), h('span.crm-row', {}, tierChip(c.tier), c.export ? exportFlag() : null))),
        h('div.crm-kv-tight', {}, SA.kv([['المندوب', repCell(so.repId)], ['قائمة الأسعار', (ERP.find('priceLists', c.priceListId) || {}).name || '—'], ['شروط السداد', c.termsDays ? c.termsDays + ' يومًا' : 'نقدي'], ['المصدر', srcChip(so.source)], quote ? ['عرض السعر', U.docLink(quote.id)] : null, so.leadId ? ['الفرصة', U.docLink(so.leadId)] : null])), creditBox(c.id, 0));
      const apCard = ap ? SA.card({ title: 'سلسلة الاعتماد', actions: [U.docLink(ap.id), SA.statusChip('approval', ap.status)] }, stepChain(ap), h('div.crm-row', {}, decideButtons(ap))) : null;
      const callCard = so.call ? SA.card({ title: 'مكالمات التأكيد مع التاجر' }, h('div.crm-qcontact', {}, h('a.crm-phone', { href: 'tel:' + String(so.call.phone || '').replace(/\s/g, '') }, SA.icon('phone', 'icon-sm'), h('span.num', { dir: 'ltr' }, so.call.phone || '—')), h('span', {}, SA.icon('clock', 'icon-sm'), 'المفضل: ', h('b', {}, so.call.preferredTime || '—'))), (so.call.log || []).length ? callLog(so.call.log) : h('p.crm-muted', { style: { margin: 0 } }, 'لم تُسجّل مكالمات بعد.')) : null;
      const woCard = SA.card({ title: 'أوامر التشغيل (' + wos.length + ')' }, wos.length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['أمر التشغيل', 'الصنف', 'الخط', 'الإنجاز', 'الحالة', 'نهاية مخططة'].map((x) => h('th', {}, x)))),
        h('tbody', {}, wos.map((w) => { const ln = lineOf(w.lineId); const risk = w.plannedEnd && so.promisedDate && w.plannedEnd > so.promisedDate; return h('tr', {}, h('td', {}, U.docLink(w.id)), h('td', {}, U.itemCell(w.itemId)), h('td', {}, h('span.crm-cell', {}, U.docLink(ln.id || w.lineId, ln.code || w.lineId), ln.status && ln.status !== 'running' ? U.status('line', ln.status) : null)), h('td', {}, prog(w.qtyDone, w.qty)), h('td', {}, U.status('wo', w.status)), h('td', {}, h('span', { class: risk ? 'crm-late' : null }, fm.date(w.plannedEnd)))); })))) : h('p.crm-muted', { style: { margin: 0 } }, ['draft', 'pending_review', 'pending_approval'].indexOf(so.status) >= 0 ? 'تُنشأ أوامر التشغيل تلقائيًا عند التأكيد للكميات غير المتاحة.' : 'لا توجد — كل الكميات من المخزون.'));
      const docsCard = SA.card({ title: 'التسليم والفوترة' },
        dns.length ? h('div', {}, U.sub('أذون التسليم'), h('ul.crm-todo', {}, dns.map((d) => h('li', {}, h('span.crm-todo-ico', {}, SA.icon('truck', 'icon-sm')), h('div.crm-todo-body', {}, h('b', {}, U.docLink(d.id), ' ', U.status('dn', d.status)), h('small', {}, d.lines.map((l) => (ERP.item(l.itemId) || {}).code + ' × ' + fm.num(l.qty)).join(' · ') + ' · مخطط ' + fm.date(d.plannedDate))))))) : h('p.crm-muted', { style: { margin: 0 } }, 'لا أذون تسليم بعد.'),
        invs.length ? h('div', {}, U.sub('الفواتير'), h('ul.crm-todo', {}, invs.map((i) => h('li', {}, h('span.crm-todo-ico', {}, SA.icon('receipt', 'icon-sm')), h('div.crm-todo-body', {}, h('b', {}, U.docLink(i.id), ' ', U.status('inv', F.invoiceStatus(i))), h('small', {}, money(i.total) + ' · مدفوع ' + money(i.paid) + ' · استحقاق ' + fm.date(i.dueDate) + (i.taxDemo ? ' · ضريبة تجريبية' : ''))))))) : null);
      const shipCard = ships.length ? SA.card({ title: 'الشحن' + (so.export ? ' والتصدير' : '') }, ships.map((s) => h('div.crm-ship', {}, h('div.crm-between', {}, h('span.crm-row', {}, SA.icon('ship', 'icon-sm'), U.docLink(s.id), U.status('ship', s.status)), h('small.crm-muted', {}, s.incoterm ? s.incoterm + ' · ' : '', s.container || '')),
        h('div.crm-kv-tight', {}, SA.kv([['الوجهة', s.destination], s.port ? ['ميناء الشحن', s.port] : null, ['المغادرة (ETD)', fm.date(s.etd)], ['الوصول (ETA)', fm.date(s.eta)], s.forwarder ? ['وكيل الشحن', s.forwarder] : null])), CH.meter((s.progress || 0) / 100, { label: 'تقدم الشحنة', tone: 'primary' }),
        s.docs ? h('ul.crm-docs', {}, s.docs.map((d) => h('li' + (d.ok ? '.is-ok' : ''), {}, SA.icon(d.ok ? 'checkcircle' : 'clock', 'icon-sm'), d.name))) : null))) : null;
      const hist = get('audit').filter((e) => e.target && e.target.id === so.id).slice(0, 10);
      const histCard = SA.card({ title: 'سجل الطلب' }, hist.length ? h('ul.crm-hist', {}, hist.map((e) => h('li', {}, h('span', {}, h('b', {}, SA.auditLabel(e.code)), ' — ', e.actor.name, e.reason ? ' · ' + e.reason : ''), h('small', {}, SA.fmt.dt(e.ts))))) : h('p.crm-muted', { style: { margin: 0 } }, 'لا أحداث.'));
      return h('div.crm-page', {},
        head({ title: 'أمر البيع ' + so.id, desc: custName(so.customerId) + ' · ' + money(t.total) + ' · ' + SA.userName(so.repId) + ' · أُنشئ ' + SA.fmt.rel(so.createdAt) + ' · التسليم ' + fm.date(so.promisedDate), tags: [U.status('so', so.status), so.priority === 'high' ? SA.chip('أولوية عالية', 'danger') : null, so.export ? exportFlag() : null, so.discountPct ? SA.chip('خصم ' + so.discountPct + '%', so.discountPct > F.limits.discountPct ? 'warning' : 'neutral') : null], back: { label: 'أوامر البيع', href: '#/crm/orders' }, actions: acts }),
        alerts.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, alerts) : null,
        SA.card({ title: 'دورة المستند', actions: [h('span.crm-muted', {}, 'أمر البيع ← الاعتماد ← التشغيل ← الجودة ← التسليم ← الفاتورة ← التحصيل')] }, U.chain(so.id)),
        h('div.crm-builder', {}, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, linesCard, woCard, U.grid(2, docsCard, histCard)), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, custCard, apCard, callCard, shipCard, so.notes ? SA.card({ title: 'ملاحظات' }, h('p', { style: { margin: 0 } }, so.notes)) : null)));
    }, ['salesOrders', 'workOrders', 'deliveries', 'invoices', 'approvals', 'shipments', 'lines', 'maintenanceOrders', 'customers']);
  }
  function callLog(log) { return h('ol.crm-calllog', {}, log.map((e) => { const r = CALL[e.result] || [e.result, 'neutral']; return h('li', {}, SA.chip(r[0], r[1]), h('span', {}, e.note || '—'), h('small', {}, SA.userName(e.by) + ' · ' + SA.fmt.dt(e.at))); })); }

  /* ═════════════════════════ 7. DEALER ORDERS (portal queue → confirmation call) ═════════════════════════ */
  function dealerCard(so) {
    const c = ERP.customer(so.customerId) || {}; const t = F.totals(so); const call = so.call || {}; const log = call.log || []; const contact = (c.contacts || [])[0] || {}; const phone = call.phone || contact.phone || '';
    const hrs = (Date.now() - new Date(so.submittedAt || so.createdAt).getTime()) / 3600000; const over = c.creditLimit ? (c.balance || 0) + t.total > c.creditLimit : false;
    return h('article.card.crm-qcard' + (hrs >= 24 ? '.is-danger' : ''), { dataset: { so: so.id } },
      h('header.crm-qhead', {}, h('div', {}, h('div.crm-row', {}, U.docLink(so.id), slaChip(so.submittedAt || so.createdAt), log.length ? SA.chip(log.length + ' محاولة اتصال', 'warning') : SA.chip('لم يُتصل بعد', 'info')), h('h3', {}, custLink(c.id, c.name)), h('small', {}, (c.city || '') + ' · ' + (SEG[c.segment] || '') + ' · المندوب ' + SA.userName(so.repId))),
        h('div.crm-qtotal', {}, h('small', {}, 'الفاتورة المبدئية'), h('b.num', {}, money(t.total)), h('small', {}, so.lines.length + ' صنف'))),
      h('div.crm-qcontact', {}, h('a.crm-phone', { href: 'tel:' + phone.replace(/\s/g, '') }, SA.icon('phone', 'icon-sm'), h('span.num', { dir: 'ltr' }, phone || '—')), h('span', {}, SA.icon('user', 'icon-sm'), contact.name || '—'), h('span', {}, SA.icon('clock', 'icon-sm'), 'الوقت المفضل: ', h('b', {}, call.preferredTime || 'غير محدد'))),
      h('table.crm-mini', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الصنف'), h('th.num', {}, 'الكمية'), h('th.num', {}, 'السعر'), h('th.num', {}, 'الإجمالي'))), h('tbody', {}, so.lines.map((l) => { const it = ERP.item(l.itemId) || {}; return h('tr', {}, h('td', {}, U.itemCell(l.itemId)), h('td.num', {}, fm.qty(l.qty, it.uom)), h('td.num', {}, money(l.price)), h('td.num', {}, money(l.qty * l.price))); }))),
      h('div.crm-between', {}, h('span.crm-muted', {}, 'الصافي ' + money(t.net) + ' · الضريبة ' + money(t.tax) + ' ', ERP.taxIsDemo() ? U.demo('14% تجريبية') : null), over ? SA.chip('يتجاوز حد الائتمان (تجريبي)', 'warning') : SA.chip('ضمن حد الائتمان', 'success')),
      log.length ? h('div', {}, U.sub('سجل المكالمات'), callLog(log)) : null,
      h('div.crm-row', {}, SA.btn({ label: 'سجّل نتيجة المكالمة', icon: 'phone', kind: 'primary', perm: 'crm.dealer_orders.review', attrs: { 'data-crm': 'call', 'data-so': so.id }, onClick: () => callModal(so.id) }), h('a.btn.btn-ghost', { href: '#/crm/orders/' + so.id }, SA.icon('eye', 'icon-sm'), 'تفاصيل الطلب')));
  }
  function renderDealerOrders(root, ctx) {
    ctx.setCrumbs([{ label: 'عروض الأسعار والطلبات' }, { label: 'طلبات التجار (البوابة)' }]);
    let tab = ctx.params.tab === 'done' ? 'done' : 'queue';
    return SA.live(root, () => {
      const portal = myOrders().filter((o) => o.source === 'portal'); const queue = portal.filter((o) => o.status === 'pending_review').sort((a, b) => ((a.submittedAt || a.createdAt) < (b.submittedAt || b.createdAt) ? -1 : 1));
      const handled = portal.filter((o) => o.call && (o.call.log || []).length && o.status !== 'pending_review').sort((a, b) => (a.call.log[0].at < b.call.log[0].at ? 1 : -1));
      const week = ERP.day(-7); const confirmedWeek = handled.filter((o) => o.call.log.some((e) => e.result === 'confirmed' && String(e.at).slice(0, 10) >= week));
      const oldest = queue[0]; const resp = handled.map((o) => { const conf = o.call.log.slice().reverse().find((e) => e.result === 'confirmed' || e.result === 'cancelled'); return conf ? (new Date(conf.at) - new Date(o.submittedAt || o.createdAt)) / 3600000 : null; }).filter((x) => x != null && x >= 0);
      const kp = U.kpis([U.kpi({ label: 'بانتظار مكالمة التأكيد', value: String(queue.length), icon: 'phone', tone: queue.length ? 'warning' : 'success', sub: short(sum(queue, (o) => F.totals(o).total)) }), U.kpi({ label: 'أقدم طلب منتظر', value: oldest ? SA.fmt.rel(oldest.submittedAt || oldest.createdAt).replace('منذ ', '') : '—', icon: 'clock', tone: oldest && (Date.now() - new Date(oldest.submittedAt || oldest.createdAt)) / 3600000 >= 24 ? 'danger' : '', sub: 'هدف الاستجابة: ساعتان (تجريبي — بند 49 Open)' }), U.kpi({ label: 'تم تأكيدها (7 أيام)', value: String(confirmedWeek.length), icon: 'checkcircle', tone: 'success', sub: short(sum(confirmedWeek, (o) => F.totals(o).total)) }), U.kpi({ label: 'متوسط زمن التأكيد', value: resp.length ? (sum(resp) / resp.length).toFixed(1) + ' س' : '—', icon: 'activity', sub: resp.length ? 'من الإرسال حتى قرار المكالمة' : 'لا بيانات بعد' })]);
      const seg = SA.segmented([['queue', 'بانتظار الاتصال (' + queue.length + ')'], ['done', 'تمت معالجتها (' + handled.length + ')']], tab, (v) => { tab = v; SA.nav('crm/dealer-orders', { replace: true, query: v === 'done' ? { tab: 'done' } : null }); });
      const body = tab === 'queue'
        ? (queue.length ? h('div.crm-queue', {}, queue.map(dealerCard)) : SA.card({}, SA.empty({ icon: 'checkcircle', title: 'لا طلبات بانتظار الاتصال', text: 'كل طلبات بوابة التجار في نطاقك تمت مراجعتها.' })))
        : SA.card({ flush: true }, handled.length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الطلب', 'التاجر', 'آخر نتيجة', 'بواسطة', 'الوقت', 'الحالة الناتجة', 'الإجمالي'].map((x) => h('th', {}, x)))),
          h('tbody', {}, handled.map((o) => { const e = o.call.log[0]; const r = CALL[e.result] || [e.result, 'neutral']; return h('tr', {}, h('td', {}, U.docLink(o.id)), h('td', {}, custLink(o.customerId)), h('td', {}, SA.chip(r[0], r[1]), e.note ? h('small.crm-hint', {}, e.note) : null), h('td', {}, SA.userName(e.by)), h('td', {}, SA.fmt.dt(e.at)), h('td', {}, U.status('so', o.status), (o.woIds || []).length ? h('small.crm-hint', {}, o.woIds.length + ' أمر تشغيل') : null), h('td.num', {}, money(F.totals(o).total))); })))) : SA.empty({ icon: 'history', title: 'لا مكالمات مسجلة بعد' }));
      return h('div.crm-page', {}, head({ title: 'طلبات التجار (البوابة)', desc: 'كل طلب من بوابة التاجر يحتاج مكالمة تأكيد من المبيعات قبل التنفيذ. سجّل النتيجة ويكمل النظام: اعتماد، حجز مخزون، أو أوامر تشغيل.', tags: [SA.tag('approved', 'بند 48'), SA.tag('open', 'SLA بند 49')] }), kp, h('div.crm-viewbar', {}, seg, h('span.crm-muted', {}, 'الأقدم أولًا · المكالمة تُسجَّل SO.CALL_LOGGED')), body);
    }, ['salesOrders', 'customers']);
  }

  /* ═════════════════════════ 8. CUSTOMERS + 360° ═════════════════════════ */
  function renderCustomers(root, ctx) {
    if (ctx.path[0]) return customer360(root, ctx, ctx.path[0]);
    ctx.setCrumbs([{ label: 'العملاء والتجار' }, { label: 'العملاء (360°)' }]);
    const kpiBox = h('div');
    const lastOrder = (cid) => { const l = get('salesOrders').filter((o) => o.customerId === cid).map((o) => o.createdAt).sort(); return l[l.length - 1] || null; };
    const util = (c) => (c.creditLimit ? (c.balance || 0) / c.creditLimit : null);
    const drawK = () => { SA.clear(kpiBox); const cs = myCustomers(); kpiBox.append(U.kpis([U.kpi({ label: 'العملاء', value: String(cs.length), icon: 'users', sub: cs.filter((c) => c.segment === 'dealer').length + ' تاجر · ' + cs.filter((c) => c.segment === 'contractor').length + ' مقاول' }), U.kpi({ label: 'الذمم المستحقة', value: short(sum(cs, (c) => c.balance)), icon: 'coins', sub: 'أرصدة مفتوحة من الفواتير' }), U.kpi({ label: 'فوق 80% من الائتمان', value: String(cs.filter((c) => util(c) != null && util(c) > 0.8).length), icon: 'alert', tone: cs.some((c) => util(c) > 1) ? 'danger' : '', sub: cs.filter((c) => util(c) > 1).length + ' تجاوز الحد' }), U.kpi({ label: 'عملاء التصدير', value: String(cs.filter((c) => c.export).length), icon: 'ship', sub: 'الخليج' })])); };
    const reps = uniq(myCustomers().map((c) => c.salesRepId)).map((id) => [id, SA.userName(id)]);
    const t = SA.table({
      caption: 'العملاء', pageSize: 10, rows: () => myCustomers(),
      columns: [
        { key: 'name', label: 'العميل', sort: true, render: (c) => h('span.crm-cell', {}, h('span.crm-row', {}, custLink(c.id), c.export ? exportFlag() : null), h('small', {}, (c.code || '') + ' · ' + (c.city || ''))) },
        { key: 'segment', label: 'الشريحة', render: (c) => segChip(c.segment) },
        { key: 'region', label: 'المنطقة', sort: true },
        { key: 'tier', label: 'الفئة', sort: true, render: (c) => tierChip(c.tier) },
        { key: 'salesRepId', label: 'المندوب', render: (c) => repCell(c.salesRepId) },
        { key: 'balance', label: 'الرصيد', class: 'num', sort: true, render: (c) => money(c.balance || 0) },
        { key: 'util', label: 'استخدام الائتمان', value: (c) => util(c) == null ? -1 : util(c), sort: true, render: (c) => (c.creditLimit ? h('div', { style: { minWidth: '130px' } }, CH.meter(util(c), { label: fm.short(c.creditLimit), text: fm.pct(util(c)), tone: util(c) > 1 ? 'danger' : util(c) > 0.8 ? 'warning' : 'success' })) : h('span.crm-muted', {}, 'نقدي')) },
        { key: 'open', label: 'طلبات مفتوحة', class: 'num', value: (c) => openOrdersOf(c.id).length, sort: true },
        { key: 'last', label: 'آخر طلب', value: (c) => lastOrder(c.id) || '', sort: true, render: (c) => { const l = lastOrder(c.id); return l ? SA.fmt.rel(l) : '—'; } }
      ],
      search: { placeholder: 'ابحث بالاسم أو الكود أو المدينة…', keys: ['name', 'code', 'city', 'region'] },
      filters: [{ key: 'segment', label: 'الشريحة', options: Object.keys(SEG).map((k) => [k, SEG[k]]) }, { key: 'region', label: 'المنطقة', options: REGIONS.map((x) => [x, x]) }, { key: 'tier', label: 'الفئة', options: [['A', 'A'], ['B', 'B'], ['C', 'C']] }, reps.length > 1 ? { key: 'salesRepId', label: 'المندوب', options: reps } : null, { key: 'credit', label: 'الائتمان', options: [['over', 'متجاوز الحد'], ['high', 'فوق 80%']], test: (c, v) => (v === 'over' ? util(c) > 1 : util(c) > 0.8) }].filter(Boolean),
      initial: { q: ctx.params.q || '', sort: { key: 'balance', dir: 'desc' }, filters: { segment: ctx.params.segment || '' } },
      onRowClick: (c) => SA.nav('crm/customers/' + c.id),
      empty: { icon: 'users', title: 'لا يوجد عملاء في نطاقك', text: 'العملاء الجدد يُنشؤون بتحويل العملاء المحتملين.' }
    });
    root.append(h('div.crm-page', {}, head({ title: 'العملاء والتجار', desc: 'كل عميل بنظرة 360°: المبيعات والذمم وأعمار الديون والشيكات والطلبات والشكاوى والأنشطة — من نفس البيانات التي تراها المالية وخدمة العملاء.' }), kpiBox, listCard(t)));
    drawK();
    return watch(['customers', 'salesOrders', 'invoices'], () => { drawK(); t.refresh(); });
  }
  async function editCredit(c) {
    if (!SA.can('crm.customers.edit')) { SA.toast('ليست من صلاحياتك (crm.customers.edit)', 'warn'); return; }
    const fL = SA.form.field({ name: 'limit', label: 'حد الائتمان الجديد (ج.م)', type: 'number', min: 0, required: true, value: c.creditLimit || 0, hint: 'الحالي ' + money(c.creditLimit || 0) + ' · الرصيد ' + money(c.balance || 0) });
    const fT = SA.form.field({ name: 'terms', label: 'شروط السداد', type: 'select', value: String(c.termsDays || 0), options: [['0', 'نقدي / مقدم'], ['30', '30 يومًا'], ['45', '45 يومًا'], ['60', '60 يومًا'], ['90', '90 يومًا']] });
    const fR = SA.form.field({ name: 'reason', label: 'سبب التعديل', type: 'textarea', rows: 2, required: true, rules: [(v) => (String(v || '').trim().length < 3 ? 'السبب مطلوب (3 أحرف على الأقل)' : null)] });
    const r = await formModal({ title: 'تعديل حد الائتمان', subtitle: c.name + ' — ' + c.code, icon: 'coins', fields: [fL, fT, fR], confirmLabel: 'حفظ التعديل', top: SA.alert('warning', 'تعديل حساس يُسجَّل CUSTOMER.CREDIT_CHANGED بالقيمة قبل/بعد، ويُبلَّغ المالية. القيم تجريبية — سياسة الائتمان الفعلية Open.'),
      validate: (v) => (Number(v.limit) < 0 ? 'الحد لا يكون سالبًا' : Number(v.limit) === (c.creditLimit || 0) && Number(v.terms) === (c.termsDays || 0) ? 'لم يتغير شيء' : null),
      onSubmit: async (v) => { await SA.api(() => { const before = { creditLimit: c.creditLimit || 0, termsDays: c.termsDays || 0 }; const after = { creditLimit: Math.round(Number(v.limit)), termsDays: Number(v.terms) }; st.patch('customers', c.id, after); SA.audit('CUSTOMER.CREDIT_CHANGED', { target: { type: 'customer', id: c.id, label: c.name }, before, after, reason: String(v.reason).trim() }); SA.notify({ title: 'تعديل حد ائتمان: ' + c.name, body: money(before.creditLimit) + ' ← ' + money(after.creditLimit) + ' — ' + String(v.reason).trim(), level: 'info', to: ['R-07', 'R-22'], link: '#/crm/customers/' + c.id }); }); return true; } });
    if (r) SA.toast('تم تعديل حد الائتمان وتسجيله في التدقيق', 'success');
  }
  async function addContact(c) {
    if (!SA.can('crm.customers.edit')) { SA.toast('ليست من صلاحياتك (crm.customers.edit)', 'warn'); return; }
    const fN = SA.form.field({ name: 'name', label: 'الاسم', required: true }); const fP = SA.form.field({ name: 'phone', label: 'الهاتف', type: 'tel', required: true, rules: [SA.form.rules.phone] }); const fRl = SA.form.field({ name: 'role', label: 'الصفة', placeholder: 'مثال: مدير المشتريات' });
    const r = await formModal({ title: 'إضافة جهة اتصال', subtitle: c.name, icon: 'userplus', fields: [fN, fP, fRl], confirmLabel: 'إضافة', onSubmit: async (v) => { await SA.api(() => { st.patch('customers', c.id, (x) => { x.contacts = (x.contacts || []).concat([{ name: v.name.trim(), phone: v.phone, role: v.role || '' }]); }); SA.audit('CUSTOMER.UPDATED', { target: { type: 'customer', id: c.id, label: c.name }, after: { contact: v.name.trim() }, area: 'crm' }); }); return true; } });
    if (r) SA.toast('تمت إضافة جهة الاتصال', 'success');
  }
  function miniTable(headers, rows, empty) { if (!rows.length) return SA.empty({ icon: 'inbox', title: empty || 'لا توجد بيانات' }); return h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, headers.map((x) => h('th', { class: /^(القيمة|الإجمالي|المبلغ|مدفوع|المتبقي)$/.test(x) ? 'num' : null }, x)))), h('tbody', {}, rows))); }
  function customer360(root, ctx, id) {
    let tab = ctx.params.tab || 'orders';
    return SA.live(root, () => {
      const c = ERP.customer(id);
      ctx.setCrumbs([{ label: 'العملاء والتجار' }, { label: 'العملاء', href: '#/crm/customers' }, { label: c ? c.name : id }]);
      if (!c) return notFound('العميل ' + id, 'crm/customers');
      if (!inScope(c.salesRepId)) return outOfScope(id);
      const invs = get('invoices').filter((i) => i.customerId === id && i.status !== 'cancelled'); const orders = get('salesOrders').filter((o) => o.customerId === id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const rcpts = get('receipts').filter((r) => r.customerId === id).sort((a, b) => (a.date < b.date ? 1 : -1)); const chqs = get('cheques').filter((x) => x.customerId === id); const tks = get('tickets').filter((x) => x.customerId === id);
      const acts = get('activities').filter((a) => a.customerId === id); const ships = get('shipments').filter((s) => s.customerId === id);
      const mk = ERP.monthKeys(12); const by = {}; invs.forEach((i) => { const k = String(i.issueDate).slice(0, 7); by[k] = (by[k] || 0) + (i.net || 0); });
      const life = sum(invs, (i) => i.net); const last12 = sum(mk, (k) => by[k] || 0); const t0 = today();
      const paidDays = []; rcpts.forEach((r) => { const inv = invs.find((i) => i.id === r.invoiceId); if (inv) paidDays.push([ERP.daysBetween(inv.issueDate, r.date), r.amount]); }); const avgDays = paidDays.length ? Math.round(sum(paidDays, (x) => x[0] * x[1]) / sum(paidDays, (x) => x[1])) : null;
      const openInv = invs.filter((i) => i.total - (i.paid || 0) > 0.5); const B = [['غير مستحق', 0, 0], ['1–30 يوم', 0, 0], ['31–60 يوم', 0, 0], ['61–90 يوم', 0, 0], ['+90 يوم', 0, 0]];
      openInv.forEach((i) => { const d = ERP.daysBetween(i.dueDate, t0); const k = d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4; B[k][1] += i.total - (i.paid || 0); B[k][2]++; });
      const overdue = sum(B.slice(1), (b) => b[1]); const util = c.creditLimit ? (c.balance || 0) / c.creditLimit : null; const openO = orders.filter((o) => OPEN_SO.indexOf(o.status) >= 0);
      const pl = ERP.find('priceLists', c.priceListId) || {};
      const kp = U.kpis([U.kpi({ label: 'إجمالي المبيعات (مدى التعامل)', value: short(life), icon: 'coins', sub: invs.length + ' فاتورة · عميل منذ ' + (c.since || '—') }), U.kpi({ label: 'مبيعات آخر 12 شهرًا', value: short(last12), icon: 'trend', trend: mk.map((k) => by[k] || 0) }), U.kpi({ label: 'متوسط أيام السداد', value: avgDays == null ? '—' : avgDays + ' يوم', icon: 'clock', tone: avgDays != null && c.termsDays && avgDays > c.termsDays ? 'warning' : '', sub: 'الشروط ' + (c.termsDays ? c.termsDays + ' يوم' : 'نقدي') }), U.kpi({ label: 'الذمم المفتوحة', value: short(c.balance || 0), icon: 'receipt', tone: overdue > 0 ? 'danger' : '', sub: overdue > 0 ? 'متأخر ' + short(overdue) : 'لا متأخرات' }), U.kpi({ label: 'استخدام الائتمان', value: util == null ? 'نقدي' : fm.pct(util), icon: 'gauge', tone: util > 1 ? 'danger' : util > 0.8 ? 'warning' : '', sub: c.creditLimit ? 'الحد ' + short(c.creditLimit) : 'بدون حد' }), U.kpi({ label: 'طلبات مفتوحة', value: String(openO.length), icon: 'cart', sub: short(sum(openO, (o) => F.totals(o).total)) })]);
      const chart = SA.card({ title: 'المبيعات الشهرية — آخر 12 شهرًا (صافي الفواتير)' }, CH.columns({ labels: mk.map(monthShort), series: [{ name: 'صافي المبيعات', values: mk.map((k) => Math.round(by[k] || 0)) }], height: 210, title: 'مبيعات العميل' }));
      const arCard = SA.card({ title: 'الذمم وأعمار الديون', actions: c.creditLimit != null ? [SA.btn({ label: 'تعديل حد الائتمان', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'crm.customers.edit', onClick: () => editCredit(c) })] : null },
        h('div.crm-aging', {}, B.map((b, i) => h('div', { class: i >= 3 && b[1] > 0 ? 'is-danger' : i >= 1 && b[1] > 0 ? 'is-warning' : null }, h('small', {}, b[0]), h('b.num', {}, short(b[1])), h('small', {}, b[2] + ' فاتورة')))),
        c.creditLimit ? CH.meter(util, { label: 'الرصيد ' + money(c.balance || 0) + ' من حد ' + money(c.creditLimit), text: fm.pct(util), tone: util > 1 ? 'danger' : util > 0.8 ? 'warning' : 'success' }) : SA.alert('info', 'عميل نقدي — لا حد ائتمان.'),
        h('div.crm-row', {}, SA.chip(chqs.filter((x) => ['received', 'under_collection'].indexOf(x.status) >= 0).length + ' شيك تحت التحصيل', 'info'), chqs.some((x) => x.status === 'bounced') ? SA.chip(chqs.filter((x) => x.status === 'bounced').length + ' شيك مرتد', 'danger') : null, h('span.crm-muted', {}, 'شروط السداد: ' + (c.termsDays ? c.termsDays + ' يومًا' : 'نقدي'))));
      const exportCard = c.export ? SA.card({ title: 'عميل تصدير', tags: exportFlag() }, h('div.crm-kv-tight', {}, SA.kv([['الدولة', c.country === 'OM' ? 'سلطنة عُمان' : c.country || '—'], ['المنطقة', c.region], ['الشحنات', String(ships.length)], ['آخر شحنة', ships[0] ? h('span.crm-row', {}, U.docLink(ships[0].id), U.status('ship', ships[0].status)) : '—']])),
        ships.length ? h('ul.crm-todo', {}, ships.map((s) => h('li', {}, h('span.crm-todo-ico', {}, SA.icon('ship', 'icon-sm')), h('div.crm-todo-body', {}, h('b', {}, U.docLink(s.id), ' ', U.status('ship', s.status)), h('small', {}, s.destination + ' · ' + (s.incoterm || '') + ' · ' + (s.container || '') + ' · ETD ' + fm.date(s.etd)))))) : null) : null;
      const tabs = SA.tabs({ tabs: [{ id: 'orders', label: 'الطلبات', badge: orders.length }, { id: 'invoices', label: 'الفواتير', badge: invs.length }, { id: 'receipts', label: 'التحصيلات والشيكات', badge: rcpts.length }, { id: 'tickets', label: 'الشكاوى', badge: tks.length }, { id: 'acts', label: 'الأنشطة', badge: acts.length }, { id: 'contacts', label: 'جهات الاتصال', badge: (c.contacts || []).length }, { id: 'prices', label: 'قائمة الأسعار' }], active: tab, onChange: (v) => { tab = v; drawTab(); } });
      const tabHost = h('div.crm-tabhost');
      function drawTab() {
        SA.clear(tabHost); let n;
        if (tab === 'orders') n = miniTable(['الأمر', 'التاريخ', 'المصدر', 'الإجمالي', 'الحالة', 'التسليم'], orders.slice(0, 25).map((o) => h('tr', {}, h('td', {}, U.docLink(o.id)), h('td', {}, fm.date(o.createdAt)), h('td', {}, srcChip(o.source)), h('td.num', {}, money(F.totals(o).total)), h('td', {}, U.status('so', o.status)), h('td', { class: isLate(o) ? 'crm-late' : null }, fm.date(o.promisedDate)))), 'لا طلبات');
        else if (tab === 'invoices') n = miniTable(['الفاتورة', 'التاريخ', 'الاستحقاق', 'الإجمالي', 'مدفوع', 'المتبقي', 'الحالة'], invs.slice().sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1)).slice(0, 30).map((i) => h('tr', {}, h('td', {}, U.docLink(i.id)), h('td', {}, fm.date(i.issueDate)), h('td', {}, fm.date(i.dueDate)), h('td.num', {}, money(i.total)), h('td.num', {}, money(i.paid)), h('td.num', {}, money(i.total - (i.paid || 0))), h('td', {}, U.status('inv', F.invoiceStatus(i))))), 'لا فواتير');
        else if (tab === 'receipts') n = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, miniTable(['السند', 'التاريخ', 'الطريقة', 'الفاتورة', 'المبلغ'], rcpts.slice(0, 25).map((r) => h('tr', {}, h('td', {}, U.docLink(r.id)), h('td', {}, fm.date(r.date)), h('td', {}, { cash: 'نقدي', transfer: 'تحويل', cheque: 'شيك', card: 'بطاقة' }[r.method] || r.method), h('td', {}, r.invoiceId ? U.docLink(r.invoiceId) : '—'), h('td.num', {}, money(r.amount)))), 'لا تحصيلات'), chqs.length ? h('div', {}, U.sub('الشيكات'), miniTable(['الشيك', 'رقم', 'البنك', 'الاستحقاق', 'المبلغ', 'الحالة'], chqs.map((x) => h('tr', {}, h('td', {}, U.docLink(x.id)), h('td.num', {}, x.no), h('td', {}, x.bank), h('td', {}, fm.date(x.dueDate)), h('td.num', {}, money(x.amount)), h('td', {}, U.status('cheque', x.status)))))) : null);
        else if (tab === 'tickets') n = miniTable(['التذكرة', 'الموضوع', 'النوع', 'الأولوية', 'الحالة', 'فُتحت'], tks.map((x) => h('tr', {}, h('td', {}, U.docLink(x.id)), h('td', {}, x.title), h('td', {}, { complaint: 'شكوى', installation: 'تركيب', inquiry: 'استفسار', warranty: 'ضمان' }[x.kind] || x.kind), h('td', {}, SA.chip(x.priority === 'high' ? 'عالية' : x.priority === 'low' ? 'منخفضة' : 'عادية', x.priority === 'high' ? 'danger' : 'neutral')), h('td', {}, U.status('ticket', x.status)), h('td', {}, SA.fmt.rel(x.openedAt)))), 'لا شكاوى أو طلبات');
        else if (tab === 'acts') n = h('div', {}, h('div.crm-row', { style: { marginBottom: '10px' } }, SA.btn({ label: 'تسجيل نشاط', icon: 'phone', kind: 'ghost', size: 'sm', perm: 'crm.activities.create', onClick: () => logActivity({ customerId: c.id }) })), actTimeline(acts));
        else if (tab === 'contacts') n = h('div', {}, h('div.crm-row', { style: { marginBottom: '10px' } }, SA.btn({ label: 'إضافة جهة اتصال', icon: 'userplus', kind: 'ghost', size: 'sm', perm: 'crm.customers.edit', onClick: () => addContact(c) })), miniTable(['الاسم', 'الصفة', 'الهاتف'], (c.contacts || []).map((x) => h('tr', {}, h('td', {}, h('b', {}, x.name)), h('td', {}, x.role || '—'), h('td', {}, h('a.crm-phone', { href: 'tel:' + String(x.phone || '').replace(/\s/g, '') }, h('span.num', { dir: 'ltr' }, x.phone || '—'))))), 'لا جهات اتصال'));
        else n = h('div', {}, h('p.crm-muted', { style: { marginTop: 0 } }, h('b', {}, pl.name || '—'), ' · معامل ×' + (pl.factor != null ? pl.factor : 1) + ' على سعر القائمة ', pl.demo ? U.demo('معاملات تجريبية') : null), miniTable(['الصنف', 'سعر القائمة', 'سعر العميل', 'الفرق'], get('items').filter((i) => i.kind === 'fg').map((i) => { const p = F.priceFor(c.id, i.id); return h('tr', {}, h('td', {}, U.itemCell(i.id)), h('td.num', {}, money(i.price)), h('td.num', {}, h('b', {}, money(p))), h('td.num', {}, i.price ? fm.pct((i.price - p) / i.price) : '—')); })));
        tabHost.append(n);
      }
      drawTab();
      return h('div.crm-page', {},
        head({ title: c.name, desc: (c.code || '') + ' · ' + (c.city || '') + (c.region ? ' · ' + c.region : '') + ' · المندوب ' + SA.userName(c.salesRepId) + ' · قائمة ' + (pl.name || '—'), tags: [segChip(c.segment), tierChip(c.tier), c.export ? exportFlag() : null, c.status === 'disabled' ? SA.chip('معطّل', 'danger') : null], back: { label: 'العملاء', href: '#/crm/customers' },
          actions: [SA.btn({ label: 'تسجيل نشاط', icon: 'phone', kind: 'ghost', perm: 'crm.activities.create', onClick: () => logActivity({ customerId: c.id }) }), SA.btn({ label: 'عرض سعر', icon: 'receipt', kind: 'ghost', perm: 'crm.quotes.create', onClick: () => SA.nav('crm/quotes/new', { query: { customer: c.id } }) }), SA.btn({ label: 'أمر بيع جديد', icon: 'plus', kind: 'primary', perm: 'crm.orders.create', onClick: () => SA.nav('crm/orders/new', { query: { customer: c.id } }) })] }),
        kp, exportCard, U.grid(2, chart, arCard), SA.card({ flush: false }, tabs.el, tabHost));
    }, ['customers', 'salesOrders', 'invoices', 'receipts', 'cheques', 'tickets', 'activities', 'shipments']);
  }

  /* ═════════════════════════ 9. TARGETS ═════════════════════════ */
  function renderTargets(root, ctx) {
    ctx.setCrumbs([{ label: 'الأهداف والتقارير' }, { label: 'أهداف المبيعات' }]);
    return SA.live(root, () => {
      const cur = curMonth(); const now = new Date(); const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); const qKey = qStart.getFullYear() + '-' + String(qStart.getMonth() + 1).padStart(2, '0');
      const dom = now.getDate(); const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); const pace = dom / dim; const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0); const qPace = clamp01((now - qStart) / (qEnd - qStart + 86400000));
      const map = soRepMap(); const invs = myInvoices(); const os = myOrders(); const tg = myTargets(); const mk6 = ERP.monthKeys(6);
      const rows = tg.map((t) => { const mine = invs.filter((i) => invRepOf(i, map) === t.repId); const mtd = sum(mine.filter((i) => String(i.issueDate).slice(0, 7) === cur), (i) => i.net); const qtd = sum(mine.filter((i) => String(i.issueDate).slice(0, 7) >= qKey), (i) => i.net); const booked = sum(os.filter((o) => o.repId === t.repId && BOOKED_SO.indexOf(o.status) >= 0 && bookedAt(o).slice(0, 7) === cur), (o) => F.totals(o).net); const pipe = weightedOf(get('leads').filter((l) => l.ownerId === t.repId)); return { t, mtd, qtd, booked, pipe, ach: ratio(mtd, t.target), qach: ratio(qtd, t.quarterTarget), hist: mk6.map((k) => sum(mine.filter((i) => String(i.issueDate).slice(0, 7) === k), (i) => i.net)) }; }).sort((a, b) => b.qach - a.qach);
      const totT = sum(rows, (r) => r.t.target), totM = sum(rows, (r) => r.mtd), totQ = sum(rows, (r) => r.t.quarterTarget), totQd = sum(rows, (r) => r.qtd);
      const kp = U.kpis([U.kpi({ label: 'هدف الشهر', value: short(totT), icon: 'target', sub: 'مفوتر ' + short(totM) + ' · ' + fm.pct(ratio(totM, totT)) }), U.kpi({ label: 'هدف الربع', value: short(totQ), icon: 'calendar', sub: 'مفوتر ' + short(totQd) + ' · ' + fm.pct(ratio(totQd, totQ)), tone: ratio(totQd, totQ) >= qPace * 0.9 ? 'success' : 'warning' }), U.kpi({ label: 'محجوز بأوامر مؤكدة (الشهر)', value: short(sum(rows, (r) => r.booked)), icon: 'cart', sub: 'سيُفوتر عند التسليم' }), U.kpi({ label: 'الوتيرة المتوقعة', value: fm.pct(pace), icon: 'clock', sub: 'من الشهر · الربع ' + fm.pct(qPace) })]);
      const lb = SA.card({ title: scopeMode() === 'own' ? 'أدائي' : 'لوحة المتصدرين — إنجاز الربع', tags: U.demo('الأهداف تجريبية') },
        rows.length ? h('ol.crm-lb', {}, rows.map((r, i) => h('li', {}, h('span.crm-rank.is-' + (i + 1), {}, String(i + 1)), h('div.crm-cell', {}, h('span.crm-rep', {}, SA.avatar(SA.userName(r.t.repId)), h('b', {}, SA.userName(r.t.repId))), h('small', {}, 'الشهر ' + short(r.mtd) + ' / ' + short(r.t.target) + ' · محجوز ' + short(r.booked) + ' · فرص مرجّحة ' + short(r.pipe))),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, CH.meter(r.qach, { label: 'الربع', text: fm.pct(r.qach), tone: r.qach >= qPace * 0.9 ? 'success' : r.qach >= qPace * 0.6 ? 'warning' : 'danger' }), CH.meter(r.ach, { label: 'الشهر', text: fm.pct(r.ach), tone: r.ach >= pace * 0.9 ? 'success' : 'warning' }))))) : SA.empty({ icon: 'target', title: 'لا أهداف في نطاقك' }));
      const tbl = SA.card({ flush: true, title: 'التفاصيل', actions: [SA.btn({ label: 'تعديل الأهداف', icon: 'edit', kind: 'primary', size: 'sm', perm: 'crm.targets.edit', onClick: () => editTargets(rows.map((r) => r.t)) })] }, miniTable(['المندوب', 'هدف الشهر', 'مفوتر (الشهر)', 'الإنجاز', 'هدف الربع', 'مفوتر (الربع)', 'إنجاز الربع', 'محجوز (الشهر)'], rows.map((r) => h('tr', {}, h('td', {}, repCell(r.t.repId)), h('td.num', {}, money(r.t.target)), h('td.num', {}, money(r.mtd)), h('td', {}, h('div', { style: { minWidth: '120px' } }, CH.meter(r.ach, { text: fm.pct(r.ach), label: ' ', tone: r.ach >= pace * 0.9 ? 'success' : 'warning' }))), h('td.num', {}, money(r.t.quarterTarget)), h('td.num', {}, money(r.qtd)), h('td', {}, h('div', { style: { minWidth: '120px' } }, CH.meter(r.qach, { text: fm.pct(r.qach), label: ' ', tone: r.qach >= qPace * 0.9 ? 'success' : 'warning' }))), h('td.num', {}, money(r.booked)))), 'لا أهداف'));
      const hist = SA.card({ title: 'المبيعات المفوترة — آخر 6 أشهر' }, rows.length ? CH.columns({ labels: mk6.map(monthShort), series: rows.map((r, i) => ({ name: SA.userName(r.t.repId), values: r.hist, color: ERP.palette[i] })), height: 220, legend: true, title: 'مبيعات المندوبين' }) : SA.empty({ icon: 'chart', title: 'لا بيانات' }));
      return h('div.crm-page', {}, head({ title: 'أهداف المبيعات', desc: 'الفعلي = صافي الفواتير لطلبات المندوب (عبر أوامر البيع)، مع المحجوز بأوامر مؤكدة والقيمة المرجّحة للفرص كمؤشر لما هو قادم.' }), kp, U.grid(2, lb, hist), tbl);
    }, ['targets', 'invoices', 'salesOrders', 'leads']);
  }
  async function editTargets(list) {
    if (!SA.can('crm.targets.edit')) { SA.toast('ليست من صلاحياتك (crm.targets.edit)', 'warn'); return; }
    const fields = []; list.forEach((t) => { fields.push(SA.form.field({ name: 'm|' + t.id, label: SA.userName(t.repId) + ' — هدف الشهر', type: 'number', min: 0, required: true, value: t.target })); fields.push(SA.form.field({ name: 'q|' + t.id, label: SA.userName(t.repId) + ' — هدف الربع', type: 'number', min: 0, required: true, value: t.quarterTarget })); });
    const fR = SA.form.field({ name: 'reason', label: 'سبب التعديل', type: 'textarea', rows: 2, class: 'crm-wide' });
    const r = await formModal({ title: 'تعديل أهداف المبيعات', subtitle: 'شهر ' + ERP.monthLabel(curMonth()), icon: 'target', size: 'lg', grid: true, fields: fields.concat([fR]), confirmLabel: 'حفظ الأهداف',
      validate: (v) => (Object.keys(v).some((k) => k !== 'reason' && !(Number(v[k]) >= 0)) ? 'قيم الأهداف يجب أن تكون أرقامًا موجبة' : null),
      onSubmit: async (v) => { await SA.api(() => { const before = {}, after = {}; st.update('targets', (l) => { l.forEach((t) => { if (v['m|' + t.id] == null) return; const nm = Math.round(Number(v['m|' + t.id])), nq = Math.round(Number(v['q|' + t.id])); if (nm !== t.target || nq !== t.quarterTarget) { before[SA.userName(t.repId)] = { month: t.target, quarter: t.quarterTarget }; after[SA.userName(t.repId)] = { month: nm, quarter: nq }; t.target = nm; t.quarterTarget = nq; t.updatedAt = nowIso(); t.updatedBy = meId(); } }); }); if (Object.keys(after).length) SA.audit('TARGET.CHANGED', { target: { type: 'targets', id: 'TG-' + curMonth(), label: 'أهداف ' + ERP.monthLabel(curMonth()) }, before, after, reason: String(v.reason || '').trim(), area: 'crm' }); }); return true; } });
    if (r) SA.toast('تم حفظ الأهداف', 'success');
  }

  /* ═════════════════════════ 10. REPORTS ═════════════════════════ */
  function salesLines(fromDay) {
    const map = soRepMap(); const out = [];
    myInvoices().filter((i) => !fromDay || i.issueDate >= fromDay).forEach((i) => { const c = ERP.customer(i.customerId) || {}; const d = 1 - (i.discountPct || 0) / 100; (i.lines || []).forEach((l) => { const it = ERP.item(l.itemId) || {}; out.push({ soId: i.soId, customerId: i.customerId, region: c.region || '—', segment: c.segment || '—', repId: invRepOf(i, map), itemId: l.itemId, family: it.family || 'acc', qty: l.qty, rev: l.qty * l.price * d, cost: l.qty * (it.stdCost || 0), month: String(i.issueDate).slice(0, 7) }); }); });
    return out;
  }
  function groupBy(rows, keyFn) { const m = {}; rows.forEach((r) => { const k = keyFn(r); const g = (m[k] = m[k] || { key: k, rev: 0, qty: 0, cost: 0, so: new Set(), cu: new Set() }); g.rev += r.rev; g.qty += r.qty; g.cost += r.cost; g.so.add(r.soId); g.cu.add(r.customerId); }); return Object.keys(m).map((k) => { const g = m[k]; return { key: k, rev: g.rev, qty: g.qty, cost: g.cost, orders: g.so.size, customers: g.cu.size }; }).sort((a, b) => b.rev - a.rev); }
  function renderReports(root, ctx) {
    ctx.setCrumbs([{ label: 'الأهداف والتقارير' }, { label: 'تقارير المبيعات' }]);
    let period = ctx.params.period || '90'; const host = h('div');
    const PER = [['30', 'آخر 30 يومًا'], ['90', 'آخر 90 يومًا'], ['365', 'آخر 12 شهرًا']];
    const DIMS = { family: ['العائلة', (r) => r.family, (k) => FAM[k] || k], region: ['المنطقة', (r) => r.region, (k) => k], segment: ['الشريحة', (r) => r.segment, (k) => SEG[k] || k], rep: ['المندوب', (r) => r.repId || '—', (k) => SA.userName(k)] };
    function dimTable(groups, label, total) {
      const canP = U.canProfit();
      return h('div.table-wrap', {}, h('table.table.crm-dim', {}, h('thead', {}, h('tr', {}, h('th', {}, label), h('th.num', {}, 'الإيراد الصافي'), h('th.num', {}, 'الحصة'), h('th.num', {}, 'الطلبات'), h('th.num', {}, 'العملاء'), canP ? h('th.num', {}, 'هامش إجمالي') : null)),
        h('tbody', {}, groups.map((g) => h('tr', {}, h('td', {}, h('b', {}, g.label)), h('td.num', {}, money(g.rev)), h('td.num', {}, fm.pct(ratio(g.rev, total), 1)), h('td.num', {}, fm.num(g.orders)), h('td.num', {}, fm.num(g.customers)), canP ? h('td.num', {}, U.cost(g.rev - g.cost, 'data.profit.view'), ' (' + fm.pct(ratio(g.rev - g.cost, g.rev)) + ')') : null)))));
    }
    function compute() {
      const from = ERP.day(-Number(period)); const rows = salesLines(from); const total = sum(rows, (r) => r.rev);
      const dims = {}; Object.keys(DIMS).forEach((k) => { dims[k] = groupBy(rows, DIMS[k][1]).map((g) => Object.assign(g, { label: DIMS[k][2](g.key) })); });
      const items = groupBy(rows, (r) => r.itemId).map((g) => Object.assign(g, { label: ERP.itemName(g.key) }));
      return { rows, total, dims, items };
    }
    function draw() {
      SA.clear(host); const D = compute(); const canP = U.canProfit();
      const mk = ERP.monthKeys(12); const all = salesLines(ERP.day(-400)); const byM = {}; const byMF = {}; all.forEach((r) => { byM[r.month] = (byM[r.month] || 0) + r.rev; const k = r.month + '|' + r.family; byMF[k] = (byMF[k] || 0) + r.rev; });
      const curK = mk[11], prevK = mk[10]; const fams = ['door', 'clad', 'foam'];
      const famCmp = CH.columns({ labels: fams.map((f) => FAM[f]), series: [{ name: ERP.monthLabel(prevK), values: fams.map((f) => Math.round(byMF[prevK + '|' + f] || 0)), color: ERP.palette[2] }, { name: ERP.monthLabel(curK) + ' (حتى اليوم)', values: fams.map((f) => Math.round(byMF[curK + '|' + f] || 0)), color: ERP.palette[0] }], height: 200, legend: true, title: 'مقارنة شهرية' });
      const momRows = mk.slice(-6).map((k, i, arr) => { const v = byM[k] || 0; const p = i ? byM[arr[i - 1]] || 0 : byM[mk[mk.length - 7]] || 0; return h('tr', {}, h('td', {}, ERP.monthLabel(k)), h('td.num', {}, money(v)), h('td.num', {}, p ? h('span', { class: v < p ? 'crm-neg' : null }, (v >= p ? '▲ ' : '▼ ') + fm.pct(Math.abs(v - p) / p)) : '—')); });
      const sold = new Set(D.items.map((g) => g.key)); const zero = get('items').filter((i) => i.kind === 'fg' && !sold.has(i.id));
      const kp = U.kpis([U.kpi({ label: 'الإيراد الصافي', value: short(D.total), icon: 'coins', sub: PER.find((p) => p[0] === period)[1] }), U.kpi({ label: 'عدد الطلبات المفوترة', value: fm.num(new Set(D.rows.map((r) => r.soId)).size), icon: 'cart', sub: 'متوسط الطلب ' + short(ratio(D.total, new Set(D.rows.map((r) => r.soId)).size)) }), U.kpi({ label: 'العملاء النشطون', value: fm.num(new Set(D.rows.map((r) => r.customerId)).size), icon: 'users', sub: 'لهم فواتير في الفترة' }), canP ? U.kpi({ label: 'الهامش الإجمالي', value: short(D.total - sum(D.rows, (r) => r.cost)), icon: 'trend', sub: fm.pct(ratio(D.total - sum(D.rows, (r) => r.cost), D.total)) + ' — بالتكلفة القياسية' }) : U.kpi({ label: 'الهامش الإجمالي', value: 'سري', icon: 'lock', sub: 'يحتاج data.profit.view' })]);
      host.append(kp,
        U.grid(2, SA.card({ title: 'حسب العائلة' }, D.dims.family.length ? CH.donut(D.dims.family.map((g, i) => ({ label: g.label, value: Math.round(g.rev), color: ERP.palette[i] })), { fmt: short, center: short(D.total).replace(' ج.م', ''), sub: 'ج.م' }) : null, dimTable(D.dims.family, 'العائلة', D.total)),
          SA.card({ title: 'حسب المنطقة' }, CH.bars(D.dims.region.map((g, i) => ({ label: g.label, sub: g.customers + ' عميل', value: Math.round(g.rev), color: ERP.palette[i % 4] })), { fmt: short }), dimTable(D.dims.region, 'المنطقة', D.total))),
        U.grid(2, SA.card({ title: 'حسب الشريحة' }, CH.bars(D.dims.segment.map((g, i) => ({ label: g.label, value: Math.round(g.rev), color: ERP.palette[(i + 1) % 4] })), { fmt: short }), dimTable(D.dims.segment, 'الشريحة', D.total)),
          SA.card({ title: 'حسب المندوب' }, CH.bars(D.dims.rep.map((g, i) => ({ label: g.label, sub: g.orders + ' طلب', value: Math.round(g.rev), color: ERP.palette[i % 3] })), { fmt: short }), dimTable(D.dims.rep, 'المندوب', D.total))),
        U.grid(2, SA.card({ title: 'مقارنة الشهر: ' + ERP.monthLabel(curK) + ' مقابل ' + ERP.monthLabel(prevK) }, famCmp), SA.card({ title: 'التغير الشهري — آخر 6 أشهر' }, h('div.table-wrap', {}, h('table.table.crm-dim', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الشهر'), h('th.num', {}, 'الإيراد الصافي'), h('th.num', {}, 'مقابل السابق'))), h('tbody', {}, momRows))))),
        U.grid(2, SA.card({ title: 'الأعلى مبيعًا' }, D.items.length ? CH.bars(D.items.slice(0, 8).map((g, i) => ({ label: g.label, sub: fm.num(g.qty) + ' وحدة', value: Math.round(g.rev), color: ERP.palette[i % 3] })), { fmt: short }) : SA.empty({ icon: 'chart', title: 'لا مبيعات' })),
          SA.card({ title: 'الأقل مبيعًا وبدون حركة' }, D.items.length ? miniTable(['الصنف', 'الإيراد', 'الكمية'], D.items.slice(-5).reverse().map((g) => h('tr', {}, h('td', {}, U.itemCell(g.key)), h('td.num', {}, money(g.rev)), h('td.num', {}, fm.num(g.qty))))) : null, zero.length ? h('div', {}, U.sub('بدون مبيعات في الفترة (' + zero.length + ')'), h('div.crm-pill-row', {}, zero.slice(0, 14).map((i) => h('span.crm-row', { style: { fontSize: '12.5px' } }, i.attrs && i.attrs.color ? U.swatch(i.attrs.color) : null, i.code)))) : null)));
      return D;
    }
    async function exportCsv() {
      if (!SA.can('crm.reports.export')) { SA.toast('ليست من صلاحياتك (crm.reports.export)', 'warn'); return; }
      const D = compute(); const lines = [['البعد', 'البند', 'الإيراد الصافي (ج.م)', 'الحصة %', 'الكمية', 'الطلبات', 'العملاء']];
      Object.keys(DIMS).forEach((k) => D.dims[k].forEach((g) => lines.push([DIMS[k][0], g.label, Math.round(g.rev), (ratio(g.rev, D.total) * 100).toFixed(1), '', g.orders, g.customers])));
      D.items.forEach((g) => lines.push(['الصنف', g.label, Math.round(g.rev), (ratio(g.rev, D.total) * 100).toFixed(1), g.qty, g.orders, g.customers]));
      const r = await SA.confirm({ title: 'تصدير تقرير المبيعات (CSV)', text: PER.find((p) => p[0] === period)[1] + ' · ' + (lines.length - 1) + ' صف', impact: ['الملف يحتوي بيانات مبيعات داخلية في نطاقك' + (scopeMode() !== 'all' ? ' (مفلترة حسب نطاقك)' : '') + '.', 'لا يتضمن تكاليف أو هوامش.', 'يتسجّل EXPORT.REPORT في التدقيق.'], confirmLabel: 'تصدير' });
      if (!r.ok) return;
      try { await SA.api(() => { SA.download('crm-sales-report-' + period + 'd-' + today() + '.csv', SA.csv(lines), 'text/csv'); SA.audit('EXPORT.REPORT', { target: { type: 'report', id: 'crm-sales-' + period, label: 'تقرير تحليل المبيعات — ' + PER.find((p) => p[0] === period)[1] }, after: { rows: lines.length - 1, scope: scopeMode() }, area: 'crm' }); }); } catch (e) { return SA.fail(e); }
      SA.toast('تم تصدير التقرير', 'success');
    }
    root.append(h('div.crm-page', {}, head({ title: 'تقارير المبيعات', desc: 'تحليل الإيراد الصافي حسب العائلة والمنطقة والشريحة والمندوب، مقارنة الشهور، والأصناف الأعلى والأقل مبيعًا.', actions: [SA.btn({ label: 'تصدير CSV', icon: 'download', kind: 'primary', perm: 'crm.reports.export', attrs: { 'data-crm': 'export' }, onClick: exportCsv })] }),
      h('div.crm-viewbar', {}, SA.segmented(PER, period, (v) => { period = v; draw(); }), h('span.crm-muted', {}, 'المصدر: فواتير البيع (صافي بعد الخصم، بدون ضريبة)')), host));
    draw();
    return watch(['invoices'], draw);
  }

  /* ═════════════════════════ registration ═════════════════════════ */
  const badgeDealer = () => { if (!SA.session.user) return null; const n = myOrders().filter((o) => o.source === 'portal' && o.status === 'pending_review').length; return n || null; };
  const badgeOrders = () => { if (!SA.session.user) return null; const n = myOrders().filter((o) => o.status === 'pending_approval').length; return n || null; };
  const R = (o) => SA.register(Object.assign({ app: 'crm' }, o));
  R({ id: 'crm-dashboard', group: 'crm-dash', title: 'لوحة المبيعات', icon: 'dashboard', route: 'crm/dashboard', perm: 'crm.dashboard.view', order: 1, desc: 'المبيعات والفرص والطلبات في لمحة', render: renderDashboard });
  R({ id: 'crm-leads', group: 'crm-pipe', title: 'العملاء المحتملون', icon: 'userplus', route: 'crm/leads', perm: 'crm.leads.view', order: 10, desc: 'العملاء المحتملون من المعارض والموقع', render: renderLeads });
  R({ id: 'crm-pipeline', group: 'crm-pipe', title: 'مسار الفرص', icon: 'layers', route: 'crm/pipeline', perm: 'crm.pipeline.view', order: 11, desc: 'لوحة كانبان للفرص', render: renderPipeline });
  R({ id: 'crm-activities', group: 'crm-pipe', title: 'المكالمات والزيارات', icon: 'calendar', route: 'crm/activities', perm: 'crm.activities.view', order: 12, desc: 'أجندة اليوم والأنشطة', render: renderActivities });
  R({ id: 'crm-quotes', group: 'crm-sales', title: 'عروض الأسعار', icon: 'receipt', route: 'crm/quotes', perm: 'crm.quotes.view', order: 20, desc: 'عروض الأسعار واعتماد الخصم', render: renderQuotes });
  R({ id: 'crm-orders', group: 'crm-sales', title: 'أوامر البيع', icon: 'cart', route: 'crm/orders', perm: 'crm.orders.view', order: 21, desc: 'أوامر البيع ودورة المستند', badge: badgeOrders, render: renderOrders });
  R({ id: 'crm-dealer-orders', group: 'crm-sales', title: 'طلبات التجار', icon: 'phone', route: 'crm/dealer-orders', perm: 'crm.dealer_orders.view', order: 22, desc: 'طلبات بوابة التاجر ومكالمات التأكيد', badge: badgeDealer, render: renderDealerOrders });
  R({ id: 'crm-customers', group: 'crm-cust', title: 'العملاء (360°)', icon: 'users', route: 'crm/customers', perm: 'crm.customers.view', order: 30, desc: 'ملف العميل الكامل', render: renderCustomers });
  R({ id: 'crm-targets', group: 'crm-perf', title: 'أهداف المبيعات', icon: 'target', route: 'crm/targets', perm: 'crm.targets.view', order: 40, desc: 'الأهداف ولوحة المتصدرين', render: renderTargets });
  R({ id: 'crm-reports', group: 'crm-perf', title: 'تقارير المبيعات', icon: 'chart', route: 'crm/reports', perm: 'crm.reports.view', order: 41, desc: 'تحليل المبيعات والتصدير', render: renderReports });

  /* global search (Ctrl+K) */
  if (SA.search && SA.search.register) {
    const has = (s, q) => String(s || '').toLowerCase().indexOf(q) >= 0;
    SA.search.register({ id: 'crm-orders', label: 'أوامر البيع', perm: 'crm.orders.view', query: (q) => (q ? myOrders().filter((o) => has(o.id, q) || has(custName(o.customerId), q)).slice(0, 6).map((o) => ({ title: o.id + ' — ' + custName(o.customerId), sub: stLabel('so', o.status) + ' · ' + money(F.totals(o).total), icon: 'cart', route: 'crm/orders/' + o.id })) : []) });
    SA.search.register({ id: 'crm-leads', label: 'العملاء المحتملون', perm: 'crm.leads.view', query: (q) => (q ? myLeads().filter((l) => has(l.company, q) || has(l.name, q) || has(l.id, q)).slice(0, 6).map((l) => ({ title: leadName(l), sub: l.name + ' · ' + stageLabel(l.stage) + ' · ' + money(l.value), icon: 'userplus', route: 'crm/leads/' + l.id })) : []) });
    SA.search.register({ id: 'crm-quotes', label: 'عروض الأسعار', perm: 'crm.quotes.view', query: (q) => (q ? myQuotes().filter((x) => has(x.id, q) || has(x.prospect || custName(x.customerId), q)).slice(0, 6).map((x) => ({ title: x.id + ' — ' + (x.prospect || custName(x.customerId)), sub: stLabel('quote', qStatus(x)) + ' · ' + money(F.totals(x).total), icon: 'receipt', route: 'crm/quotes/' + x.id })) : []) });
    SA.search.register({ id: 'crm-customers', label: 'العملاء (CRM)', perm: 'crm.customers.view', query: (q) => (q ? myCustomers().filter((c) => has(c.name, q) || has(c.code, q)).slice(0, 6).map((c) => ({ title: c.name, sub: c.code + ' · ' + (SEG[c.segment] || '') + ' · 360°', icon: 'users', route: 'crm/customers/' + c.id })) : []) });
  }

  /* Test Lab missions */
  if (SA.missions && SA.missions.add) {
    if (SA.missions.areas && !SA.missions.areas.crm) SA.missions.areas.crm = 'المبيعات وCRM';
    SA.missions.add({ id: 'M-C1', area: 'crm', title: 'اتصل بتاجر البوابة وأكّد طلبه', persona: 'salesmgr', route: 'crm/dealer-orders', est: '2 د', goal: 'طلب معرض النيل SO-2026-0481 وصل من بوابة التاجر. سجّل نتيجة مكالمة التأكيد وشاهد الطلب يتحول إلى حجز مخزون وأوامر تشغيل فورًا.', steps: [{ text: 'افتح «طلبات التجار»', route: 'crm-dealer-orders' }, { text: 'سجّل نتيجة المكالمة «تم التأكيد»', audit: 'SO.CALL_LOGGED' }, { text: 'راجع ما حدث: الحجز وأوامر التشغيل', audit: 'SO.CONFIRMED' }], detect: [{ audit: 'SO.CALL_LOGGED' }, { audit: 'SO.CONFIRMED' }] });
    SA.missions.add({ id: 'M-C2', area: 'crm', title: 'عرض سعر بخصم أعلى من حدك', persona: 'rep', route: 'crm/quotes/new', est: '3 د', goal: 'كمندوب، أنشئ عرض سعر لعميلك بخصم 8% (الحد 5% تجريبي). سيذهب الخصم لاعتماد مدير المبيعات في الصندوق المشترك.', steps: [{ text: 'اختر العميل والأصناف بألوانها', route: 'crm-quotes' }, { text: 'خصم 8% ثم «حفظ وإرسال للاعتماد»', audit: 'QUOTE.DISCOUNT_REQUESTED' }], detect: [{ audit: 'QUOTE.CREATED' }, { audit: 'QUOTE.DISCOUNT_REQUESTED' }] });
    SA.missions.add({ id: 'M-C3', area: 'crm', title: 'حوّل زائر معرض إلى عميل وعرض سعر', persona: 'salesmgr', route: 'crm/leads?event=EV-2026-07', est: '3 د', goal: 'افتح عميلًا محتملًا من معرض The Big 5، حوّله لعميل (CUS-0xx) وافتح له عرض سعر مباشرة.', steps: [{ text: 'افتح العميل المحتمل', route: 'crm-leads' }, { text: '«تحويل لعميل + عرض سعر»', audit: 'LEAD.CONVERTED' }, { text: 'احفظ العرض', audit: 'QUOTE.CREATED' }], detect: [{ audit: 'LEAD.CONVERTED' }, { audit: 'QUOTE.CREATED' }] });
  }

  ERP.crm = { scopeMode, inScope, myOrders, myCustomers, myLeads, convertLead, callDealer: callModal, showOutcome, logActivity, createLead };
})();
