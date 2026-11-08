/* EG ERP prototype — mod-fin.js  (المساحة: المالية والحسابات — app `fin`)
   Screens (ids / routes / groups / perms = ROUTE CONTRACT in erp-core.js):
     fin-dashboard fin/dashboard · fin-invoices fin/invoices[/INV-id] (?so=SO-… ?tab=ready ?q= ?status= ?c=) · fin-receipts fin/receipts (?q=) · fin-cheques fin/cheques (?q=)
     fin-aging fin/aging (?c=C-id → كشف حساب) · fin-bills fin/bills (?q=) · fin-vouchers fin/vouchers[/PV-id] (?q=) · fin-banks fin/banks (?acc=1111)
     fin-journal fin/journal[/JE-id] (?acc= ?q=) · fin-coa fin/coa · fin-costing fin/costing · fin-budgets fin/budgets · fin-statements fin/statements (?p=mtd|lm|qtd|ytd|l12 ?tab=is|bs|cf)
   Business actions: ERP.flow.invoiceOrder / receivePayment / chequeStatus / createVoucher / executeVoucher · ERP.gl.post (manual JE, bank transfer) + SA.audit('GL.POSTED').
   Module data: S.budgets[] {id, year, acc, months:[12], updatedAt, updatedBy} (ERP.addSeed 'fin-budgets') · customers[].reviewNotes[] {at, by, text, chequeId} (additive — بند 41: review only, never an automatic stop).
   Public helpers (other modules may call): ERP.fin = { openReceipt({customerId, invoiceId, amount}), openVoucher({kind, supplierId, billIds, expenseAcc}), issueInvoice(soId),
     readyToInvoice(), arByCustomer(), cashPosition(to), soaRows(customerId, from, to), costOf(itemId) } */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP;
  if (!SA || !ERP || !ERP.flow || !ERP.gl) return;
  const h = SA.h, st = SA.store, F = ERP.flow, GL = ERP.gl, U = ERP.ui, CH = ERP.chart, fm = ERP.fmt;
  const get = (p) => st.get(p) || [];
  const me = () => SA.session.userId || 'SYSTEM';
  const today = () => ERP.day(0);
  const who = (id) => (!id || id === 'SYSTEM' ? 'النظام' : SA.userName(id));
  const sum = (list, fn) => list.reduce((s, x) => s + (fn ? fn(x) : x), 0);

  SA.catalog.addAudit('COA.ACCOUNT_CREATED', 'إضافة حساب لدليل الحسابات', 'high', 'fin');
  SA.catalog.addAudit('CUSTOMER.REVIEW_NOTED', 'ملاحظة مراجعة على حساب عميل (تنبيه بلا إيقاف)', 'medium', 'fin');
  const audit = (code, o) => SA.audit(code, Object.assign({ area: 'fin' }, o || {}));

  /* ═════════════════════════ styles (prefix fin-) ═════════════════════════ */
  (function () {
    if (document.querySelector('style[data-mod="fin"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'fin');
    s.textContent = `
.fin-page { display: flex; flex-direction: column; }
.fin-r { text-align: end; white-space: nowrap; }
.fin-muted { color: var(--color-text-muted); font-size: 12px; font-weight: 500; }
.fin-stack { display: flex; flex-direction: column; gap: 1px; line-height: 1.35; } .fin-stack b { font-weight: 600; font-size: var(--text-dense); } .fin-stack small { color: var(--color-text-muted); font-size: 11.5px; }
.fin-inline { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.fin-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: space-between; }
.fin-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 0 0 12px; }
.fin-toolbar .input-wrap, .fin-toolbar .select { max-width: 320px; }
.fin-attn { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.fin-attn a { display: grid; grid-template-columns: 34px 1fr auto; gap: 10px; align-items: center; padding: 9px 12px; border: 1px solid var(--color-border); border-radius: 10px; text-decoration: none; color: inherit; background: #fff; }
.fin-attn a:hover { border-color: var(--eg-navy); }
.fin-attn-ico { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; background: var(--color-primary-tint); color: var(--eg-navy); }
.fin-attn .is-danger .fin-attn-ico { background: var(--color-danger-tint); color: var(--color-danger); } .fin-attn .is-warning .fin-attn-ico { background: var(--color-warning-tint); color: var(--color-warning); }
.fin-attn b { display: block; font-size: var(--text-dense); font-weight: 600; } .fin-attn small { color: var(--color-text-muted); font-size: 12px; }
.fin-locked-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 26px 16px; text-align: center; color: var(--color-text-muted); background: var(--color-bg-alt); border-radius: 12px; border: 1px dashed var(--color-border-strong); }
.fin-locked-card b { color: var(--color-text); } .fin-locked-card code { font-size: 11.5px; }
.fin-pl { width: 100%; border-collapse: collapse; font-size: var(--text-dense); }
.fin-pl td, .fin-pl th { padding: 8px 10px; border-bottom: 1px solid var(--color-border); }
.fin-pl th { text-align: start; color: var(--color-text-muted); font-weight: 600; font-size: 12px; background: var(--color-bg-alt); } .fin-pl th.fin-r { text-align: end; }
.fin-pl tr.is-head td { font-weight: 700; color: var(--eg-navy); padding-top: 14px; border-bottom: 2px solid var(--eg-navy-tint); }
.fin-pl tr.is-line td:first-child { padding-inline-start: 24px; }
.fin-pl tr.is-total td { font-weight: 700; background: var(--color-bg-alt); }
.fin-pl tr.is-grand td { font-weight: 800; border-top: 2px solid var(--eg-navy); background: var(--color-primary-tint); color: var(--eg-navy); }
.fin-pl tr.is-pct td { color: var(--color-text-muted); font-size: 12.5px; }
.fin-pl tr.is-note td { color: var(--color-text-muted); font-size: 12.5px; }
.fin-pl tr.is-click { cursor: pointer; } .fin-pl tr.is-click:hover td { background: var(--color-bg-alt); }
.fin-a4 { background: #fff; width: 100%; max-width: 840px; margin: 0 auto; padding: 34px 40px; border: 1px solid var(--color-border); border-radius: 6px; box-shadow: var(--shadow-card); color: #1b1f2a; font-size: 13px; line-height: 1.65; }
.fin-a4-head { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; border-bottom: 3px solid var(--eg-navy); padding-bottom: 14px; }
.fin-a4-brand { display: flex; gap: 14px; align-items: flex-start; } .fin-a4-brand img { height: 48px; width: auto; }
.fin-a4-co b { display: block; font-size: 15px; color: var(--eg-navy); } .fin-a4-co small { display: block; color: #555; font-size: 12px; }
.fin-a4-title { text-align: end; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; } .fin-a4-title h2 { margin: 0; font-size: 22px; color: var(--eg-navy); } .fin-a4-title small { color: #666; }
.fin-a4-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 16px 0; }
.fin-a4-box { border: 1px solid #d9dee8; border-radius: 8px; padding: 10px 12px; } .fin-a4-box h4 { margin: 0 0 6px; font-size: 12px; color: #666; font-weight: 600; }
.fin-a4-box dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; } .fin-a4-box dt { color: #666; } .fin-a4-box dd { margin: 0; font-weight: 600; }
.fin-a4-lines { width: 100%; border-collapse: collapse; margin-top: 6px; } .fin-a4-lines th { background: var(--eg-navy); color: #fff; padding: 8px; font-size: 12px; text-align: start; font-weight: 600; }
.fin-a4-lines td { padding: 7px 8px; border-bottom: 1px solid #e3e7ef; vertical-align: top; } .fin-a4-lines .fin-r { text-align: end; } .fin-a4-lines tr.is-sum td { font-weight: 700; background: #f6f8fb; }
.fin-a4-tot { display: flex; justify-content: space-between; gap: 20px; margin-top: 14px; align-items: flex-start; }
.fin-a4-tot table { min-width: 310px; border-collapse: collapse; } .fin-a4-tot td { padding: 6px 10px; border-bottom: 1px solid #e3e7ef; } .fin-a4-tot td:last-child { text-align: end; white-space: nowrap; }
.fin-a4-tot tr.is-grand td { background: var(--eg-navy); color: #fff; font-weight: 700; font-size: 14px; }
.fin-a4-words { flex: 1; background: #f6f8fb; border-radius: 8px; padding: 10px 12px; font-size: 12.5px; }
.fin-a4-foot { margin-top: 22px; padding-top: 12px; border-top: 1px dashed #c8cfdc; font-size: 11.5px; color: #555; display: flex; flex-direction: column; gap: 4px; }
.fin-a4-warn { display: flex; align-items: center; gap: 6px; font-weight: 700; color: var(--color-danger); font-size: 12.5px; }
.fin-a4-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 28px; } .fin-a4-sign div { border-top: 1px solid #9aa3b5; padding-top: 6px; text-align: center; color: #555; font-size: 12px; }
.fin-doc-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 16px; align-items: start; margin-top: 4px; } .fin-doc-wrap > * { min-width: 0; }
.fin-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
@media (max-width: 1150px) { .fin-doc-wrap { grid-template-columns: minmax(0, 1fr); } }
.fin-page .erp-kpi-v { white-space: nowrap; } .fin-page .erp-kpi.is-primary .erp-spark path { stroke: rgba(255, 255, 255, .85); }
.fin-chain-card { margin-top: 16px; }
@media (min-width: 1280px) { .fin-kpis-7 { grid-template-columns: repeat(4, minmax(0, 1fr)); } .fin-kpis-7 > :first-child { grid-row: span 2; justify-content: space-between; } .fin-kpis-7 > :first-child .erp-kpi-mid { flex-direction: column; align-items: stretch; gap: 10px; } .fin-kpis-7 > :first-child .erp-spark { width: 100%; height: 56px; } .fin-kpis-7 > :first-child .erp-kpi-v { font-size: 1.9rem; } }
@media (max-width: 760px) {
  .fin-page .sap-pagehead-row .sap-actions .btn { flex: 1 1 auto; white-space: nowrap; }
  .fin-a4 { padding: 18px 14px; font-size: 12px; }
  .fin-a4-head { flex-direction: column; gap: 12px; } .fin-a4-brand { flex-direction: column; gap: 8px; } .fin-a4-brand img { height: 38px; }
  .fin-a4-title { text-align: start; align-items: flex-start; } .fin-a4-title h2 { font-size: 19px; }
  .fin-a4-meta { grid-template-columns: 1fr; } .fin-a4-tot { flex-direction: column; } .fin-a4-tot table { min-width: 0; width: 100%; }
  .fin-a4-lines th, .fin-a4-lines td { padding: 6px 4px; font-size: 11.5px; } .fin-a4-sign { gap: 8px; }
}
.fin-sod { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.fin-sod li { border: 1px solid var(--color-border); border-radius: 12px; padding: 12px 14px; background: #fff; display: flex; flex-direction: column; gap: 6px; }
.fin-sod li.is-done { border-color: #bfe3cc; background: linear-gradient(135deg, #f3fbf6, #fff); } .fin-sod li.is-now { border-color: #f2d6ad; background: linear-gradient(135deg, #fffaf2, #fff); } .fin-sod li.is-bad { border-color: #f5c2c4; background: linear-gradient(135deg, #fff5f5, #fff); }
.fin-sod-top { display: flex; align-items: center; gap: 8px; } .fin-sod-n { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font: 700 12px var(--font-en); background: var(--color-neutral-tint); color: var(--color-text-muted); flex: none; }
.fin-sod .is-done .fin-sod-n { background: var(--color-success); color: #fff; } .fin-sod .is-now .fin-sod-n { background: var(--color-warning); color: #fff; } .fin-sod .is-bad .fin-sod-n { background: var(--color-danger); color: #fff; }
.fin-sod small { color: var(--color-text-muted); font-size: 12px; } .fin-sod code { font-size: 11px; color: var(--color-text-muted); }
.fin-you { display: inline-flex; font-size: 11px; font-weight: 700; color: var(--eg-navy); background: var(--color-primary-tint); border-radius: 6px; padding: 0 6px; }
@media (max-width: 820px) { .fin-sod { grid-template-columns: 1fr; } }
.fin-chain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.fin-chain li { display: flex; gap: 10px; align-items: flex-start; } .fin-chain li > i { width: 12px; height: 12px; border-radius: 50%; margin-top: 5px; flex: none; border: 2px solid var(--color-border-strong); background: #fff; }
.fin-chain li.is-approved > i { background: var(--color-success); border-color: var(--color-success); } .fin-chain li.is-pending > i { border-color: var(--color-warning); background: var(--color-warning-tint); } .fin-chain li.is-rejected > i { background: var(--color-danger); border-color: var(--color-danger); }
.fin-chain b { display: block; font-size: var(--text-dense); } .fin-chain small { display: block; color: var(--color-text-muted); font-size: 12px; }
.fin-banks { display: grid; grid-template-columns: repeat(auto-fill, minmax(235px, 1fr)); gap: 12px; margin-bottom: 16px; }
.fin-bank { text-align: start; border: 1px solid var(--color-border); border-radius: 14px; background: #fff; padding: 14px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; font: inherit; color: inherit; min-height: 44px; }
.fin-bank:hover { box-shadow: var(--shadow-float); } .fin-bank[aria-pressed="true"] { border-color: var(--eg-navy); box-shadow: 0 0 0 2px var(--eg-navy-tint); }
.fin-bank-top { display: flex; align-items: center; gap: 10px; } .fin-bank-ico { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--color-primary-tint); color: var(--eg-navy); flex: none; }
.fin-bank.is-treasury .fin-bank-ico { background: var(--color-warning-tint); color: var(--color-warning); }
.fin-bank-v { font-size: 1.3rem; font-weight: 700; } .fin-bank small { color: var(--color-text-muted); font-size: 12px; }
.fin-bank-io { display: flex; justify-content: space-between; font-size: 12px; gap: 8px; } .fin-in { color: var(--color-success); font-weight: 600; } .fin-out { color: var(--color-danger); font-weight: 600; }
.fin-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.fin-cal-day { border: 1px solid var(--color-border); border-radius: 10px; padding: 7px; min-height: 86px; background: #fff; display: flex; flex-direction: column; gap: 4px; font-size: 12px; min-width: 0; }
.fin-cal-day.is-today { border-color: var(--eg-navy); box-shadow: inset 0 0 0 1px var(--eg-navy); } .fin-cal-day.is-empty { background: var(--color-bg-alt); }
.fin-cal-day header { display: flex; justify-content: space-between; color: var(--color-text-muted); font-weight: 600; gap: 4px; }
.fin-cal-chq { display: block; border-radius: 6px; padding: 2px 6px; background: var(--color-primary-tint); color: var(--eg-navy); text-decoration: none; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fin-cal-chq.is-warning { background: var(--color-warning-tint); color: #7a4a00; } .fin-cal-chq.is-danger { background: var(--color-danger-tint); color: var(--color-danger); }
@media (max-width: 900px) { .fin-cal { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.fin-tree { width: 100%; border-collapse: collapse; font-size: var(--text-dense); }
.fin-tree td, .fin-tree th { padding: 8px 10px; border-bottom: 1px solid var(--color-border); } .fin-tree th { text-align: start; font-size: 12px; color: var(--color-text-muted); background: var(--color-bg-alt); }
.fin-tree tr.is-l1 td { background: var(--color-primary-tint); font-weight: 800; color: var(--eg-navy); } .fin-tree tr.is-l2 td { font-weight: 700; background: #fafbfd; }
.fin-tree tr.is-l2 td:first-child { padding-inline-start: 28px; } .fin-tree tr.is-l3 td:first-child { padding-inline-start: 54px; }
.fin-tree tr.is-l3 { cursor: pointer; } .fin-tree tr.is-l3:hover td { background: var(--color-bg-alt); }
.fin-tree-tg { border: 0; background: transparent; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font: inherit; color: inherit; padding: 0; }
.fin-je { width: 100%; border-collapse: collapse; } .fin-je th { font-size: 12px; color: var(--color-text-muted); text-align: start; padding: 6px; font-weight: 600; } .fin-je td { padding: 4px 6px; vertical-align: middle; }
.fin-je select, .fin-je input { width: 100%; } .fin-je td:nth-child(2), .fin-je td:nth-child(3) { width: 150px; } .fin-je td:last-child { width: 48px; }
.fin-je tfoot td { font-weight: 700; padding-top: 10px; border-top: 2px solid var(--color-border); }
.fin-bal { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 12.5px; } .fin-bal.is-ok { color: var(--color-success); } .fin-bal.is-bad { color: var(--color-danger); }
.fin-costs { display: grid; grid-template-columns: repeat(auto-fill, minmax(275px, 1fr)); gap: 12px; }
.fin-cost { border: 1px solid var(--color-border); border-radius: 14px; background: #fff; padding: 14px; display: flex; flex-direction: column; gap: 9px; cursor: pointer; text-align: start; font: inherit; color: inherit; }
.fin-cost:hover { box-shadow: var(--shadow-float); border-color: var(--eg-navy-tint); }
.fin-cost dl { margin: 0; display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; font-size: 12.5px; } .fin-cost dt { color: var(--color-text-muted); } .fin-cost dd { margin: 0; text-align: end; } .fin-cost dd.is-strong, .fin-cost dt.is-strong { font-weight: 700; color: var(--color-text); }
.fin-sbar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--color-neutral-tint); } .fin-sbar i { display: block; height: 100%; }
.fin-var { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 6px; font: 700 11.5px var(--font-en); direction: ltr; unicode-bidi: isolate; }
.fin-var.is-good { color: var(--color-success); background: var(--color-success-tint); } .fin-var.is-bad { color: var(--color-danger); background: var(--color-danger-tint); } .fin-var.is-warn { color: #7a4a00; background: var(--color-warning-tint); } .fin-var.is-neutral { color: var(--color-text-muted); background: var(--color-neutral-tint); }
.fin-form { display: flex; flex-direction: column; gap: 12px; } .fin-form .field { margin: 0; }
.fin-form-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } @media (max-width: 640px) { .fin-form-2 { grid-template-columns: 1fr; } }
.fin-preview { background: var(--color-bg-alt); border-radius: 10px; padding: 10px 12px; font-size: 12.5px; display: flex; flex-direction: column; gap: 3px; } .fin-preview b { color: var(--eg-navy); }
.fin-checks { display: flex; flex-direction: column; gap: 2px; max-height: 230px; overflow: auto; border: 1px solid var(--color-border); border-radius: 10px; padding: 6px; }
.fin-checks label { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 7px 8px; border-radius: 8px; cursor: pointer; font-size: var(--text-dense); } .fin-checks label:hover { background: var(--color-bg-alt); }
.fin-checks label.is-off { opacity: .55; cursor: not-allowed; }
.fin-months { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; } @media (max-width: 640px) { .fin-months { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.fin-callout { display: flex; align-items: center; gap: 12px; justify-content: space-between; flex-wrap: wrap; padding: 12px 14px; border-radius: 12px; background: var(--color-primary-tint); border: 1px solid var(--eg-navy-tint); margin-bottom: 12px; }
.fin-callout b { color: var(--eg-navy); }
.fin-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; } .fin-timeline li { display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; } .fin-timeline li > i { width: 9px; height: 9px; border-radius: 50%; margin-top: 6px; background: var(--eg-navy); flex: none; }
.fin-mini { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; } .fin-mini li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--color-border); font-size: var(--text-dense); align-items: center; } .fin-mini li:last-child { border-bottom: 0; }
.fin-totals { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 10px 14px; background: var(--color-bg-alt); border-radius: 10px; margin-top: 10px; font-size: 12.5px; } .fin-totals span { display: inline-flex; gap: 6px; align-items: baseline; } .fin-totals b { font-size: 13px; }
.fin-seg { margin-bottom: 12px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.fin-hlrow { box-shadow: inset 3px 0 0 var(--color-warning); }
#fin-print-root { display: none; }
@media print {
  body.fin-printing > *:not(#fin-print-root) { display: none !important; }
  body.fin-printing #fin-print-root { display: block !important; }
  body.fin-printing .fin-a4 { box-shadow: none !important; border: 0 !important; max-width: none !important; margin: 0 !important; padding: 12mm 14mm !important; }
  body.fin-printing * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;
    document.head.appendChild(s);
  })();

  /* ═════════════════════════ dates / periods ═════════════════════════ */
  const p2 = (n) => String(n).padStart(2, '0');
  const ds = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const mStart = (off) => { const d = new Date(); return ds(new Date(d.getFullYear(), d.getMonth() + (off || 0), 1)); };
  const mEnd = (off) => { const d = new Date(); return ds(new Date(d.getFullYear(), d.getMonth() + (off || 0) + 1, 0)); };
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ds(d); };
  /** same day-of-month shifted by `months` (clamped to month end) and `years` */
  const shiftDate = (s, months, years) => { const x = new Date(s + 'T12:00:00'); const n = new Date(x.getFullYear() + (years || 0), x.getMonth() + (months || 0), 1); const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate(); return ds(new Date(n.getFullYear(), n.getMonth(), Math.min(x.getDate(), last))); };
  const keyRange = (key) => { const p = String(key).split('-'); return { from: key + '-01', to: ds(new Date(+p[0], +p[1], 0)) }; };
  const shortMonth = (key) => ERP.months[Number(String(key).split('-')[1]) - 1];
  const ddmm = (s) => { const p = s.split('-'); return Number(p[2]) + '/' + Number(p[1]); };
  const PERIODS = [['mtd', 'هذا الشهر'], ['lm', 'الشهر الماضي'], ['qtd', 'الربع الحالي'], ['ytd', 'منذ بداية السنة'], ['l12', 'آخر 12 شهرًا']];
  function period(id) {
    const d = new Date(); const y = d.getFullYear(), m = d.getMonth(); const t = today();
    if (id === 'lm') return { id, label: 'الشهر الماضي — ' + ERP.monthLabel(mStart(-1).slice(0, 7)), from: mStart(-1), to: mEnd(-1), cmp: { from: mStart(-2), to: mEnd(-2), label: ERP.monthLabel(mStart(-2).slice(0, 7)) } };
    if (id === 'qtd') { const qs = ds(new Date(y, m - (m % 3), 1)); return { id, label: 'الربع الحالي حتى اليوم', from: qs, to: t, cmp: { from: shiftDate(qs, -3), to: shiftDate(t, -3), label: 'الربع السابق (نفس المدة)' } }; }
    if (id === 'ytd') return { id, label: 'منذ بداية ' + y, from: y + '-01-01', to: t, cmp: { from: (y - 1) + '-01-01', to: shiftDate(t, 0, -1), label: 'نفس الفترة ' + (y - 1) } };
    if (id === 'l12') return { id, label: 'آخر 12 شهرًا', from: mStart(-11), to: t, cmp: { from: mStart(-23), to: mEnd(-12), label: 'الـ12 شهرًا السابقة' } };
    return { id: 'mtd', label: 'هذا الشهر حتى اليوم', from: mStart(0), to: t, cmp: { from: mStart(-1), to: shiftDate(t, -1), label: 'نفس الفترة من الشهر الماضي' } };
  }

  /* ═════════════════════════ general ledger aggregation ═════════════════════════ */
  function types() { const m = {}; get('accounts').forEach((a) => { m[a.code] = a.type; }); return m; }
  /** one pass over the journal → {acc: {dr, cr}} for [from, to] (inclusive, 'YYYY-MM-DD'; null = open) */
  function glMap(from, to) {
    const m = {};
    get('journal').forEach((je) => { if ((from && je.date < from) || (to && je.date > to)) return; je.lines.forEach((l) => { const x = m[l.acc] || (m[l.acc] = { dr: 0, cr: 0 }); x.dr += l.dr || 0; x.cr += l.cr || 0; }); });
    return m;
  }
  const debitNature = (t) => !t || t === 'asset' || t === 'expense';
  function nat(map, code, T) { const x = map[code]; if (!x) return 0; return debitNature((T || types())[code]) ? x.dr - x.cr : x.cr - x.dr; }
  function childMap() { const m = {}; get('accounts').forEach((a) => { if (a.parent) (m[a.parent] = m[a.parent] || []).push(a.code); }); Object.keys(m).forEach((k) => m[k].sort()); return m; }
  /** posting (leaf) accounts under `code` following the parent chain (5301 sits under 52 — prefixes are not reliable) */
  function leaves(code, CM) { CM = CM || childMap(); const out = []; const walk = (c) => { const k = CM[c]; if (!k || !k.length) out.push(c); else k.forEach(walk); }; walk(code); return out; }
  function under(map, code, T, CM) { T = T || types(); return leaves(code, CM).reduce((s, c) => s + nat(map, c, T), 0); }
  function typeSum(map, type, T) { T = T || types(); const CM = childMap(); return get('accounts').filter((a) => a.type === type && !(CM[a.code] || []).length).reduce((s, a) => s + nat(map, a.code, T), 0); }
  const leafAccounts = (filter) => { const CM = childMap(); return get('accounts').filter((a) => !(CM[a.code] || []).length && a.level >= 3 && (!filter || filter(a))).sort((a, b) => (a.code < b.code ? -1 : 1)); };
  const TYPE_LABEL = { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات وتكاليف' };
  const TYPE_TONE = { asset: 'info', liability: 'warning', equity: 'neutral', revenue: 'success', expense: 'danger' };

  /* cash (banks & treasuries mapped to GL) */
  const cashAccs = () => get('banks').map((b) => b.acc);
  const bankOf = (acc) => get('banks').find((b) => b.acc === acc) || null;
  const accLabel = (code) => { const b = bankOf(code); return (b ? b.name : GL.accName(code)) + ' (' + code + ')'; };
  function cashPosition(to) { const m = glMap(null, to || null); const T = types(); return cashAccs().reduce((s, a) => s + nat(m, a, T), 0); }
  /** cash in/out over a range (internal transfers between cash accounts excluded) */
  function cashIO(from, to) {
    const cash = new Set(cashAccs()); let inn = 0, out = 0;
    get('journal').forEach((je) => { if (je.date < from || je.date > to) return; const cl = je.lines.filter((l) => cash.has(l.acc)); if (!cl.length || cl.length === je.lines.length) return; cl.forEach((l) => { inn += l.dr; out += l.cr; }); });
    return { inn, out };
  }
  /** direct-method cash flow by counterpart category: each non-cash line's (cr − dr) is its cash contribution */
  const CF_CAT = (acc) => {
    if (acc === '1131' || acc === '1121') return 'cust'; if (acc === '2101' || acc === '2102') return 'sup'; if (acc === '2121' || acc === '2131' || acc === '1151') return 'pay';
    if (acc === '2111' || acc === '1161') return 'tax'; if (acc === '6203' || acc.slice(0, 2) === '22' || acc[0] === '3') return 'fin';
    if (acc.slice(0, 2) === '12' && acc !== '1209') return 'inv'; if (acc[0] === '5' || acc[0] === '6' || acc === '1209' || acc.slice(0, 3) === '114') return 'opex'; return 'other';
  };
  function cashCats(from, to) {
    const cash = new Set(cashAccs()); const c = { cust: 0, sup: 0, pay: 0, tax: 0, opex: 0, other: 0, inv: 0, fin: 0 };
    get('journal').forEach((je) => { if (je.date < from || je.date > to) return; if (!je.lines.some((l) => cash.has(l.acc))) return; je.lines.forEach((l) => { if (!cash.has(l.acc)) c[CF_CAT(l.acc)] += (l.cr || 0) - (l.dr || 0); }); });
    return c;
  }

  /* ═════════════════════════ receivables / payables ═════════════════════════ */
  const invOpen = (i) => (i.status === 'cancelled' || i.status === 'draft' ? 0 : Math.max(0, Math.round(i.total - (i.paid || 0))));
  const invSt = (i) => F.invoiceStatus(i);
  const pastDue = (due) => Math.max(0, ERP.daysBetween(due));
  const BK = [['cur', 'لم يستحق بعد', '#147a3d'], ['b30', '1–30 يومًا', '#345383'], ['b60', '31–60 يومًا', '#c9a227'], ['b90', '61–90 يومًا', '#a85a00'], ['b90p', 'أكثر من 90 يومًا', '#b9141b']];
  const bucketOf = (due) => { const d = ERP.daysBetween(due); return d <= 0 ? 'cur' : d <= 30 ? 'b30' : d <= 60 ? 'b60' : d <= 90 ? 'b90' : 'b90p'; };
  function arByCustomer() {
    const m = {};
    get('invoices').forEach((i) => {
      const o = invOpen(i); if (o < 1) return;
      const r = m[i.customerId] || (m[i.customerId] = { id: i.customerId, cur: 0, b30: 0, b60: 0, b90: 0, b90p: 0, total: 0, overdue: 0, count: 0, maxDays: 0 });
      const b = bucketOf(i.dueDate); r[b] += o; r.total += o; r.count++; if (b !== 'cur') { r.overdue += o; r.maxDays = Math.max(r.maxDays, pastDue(i.dueDate)); }
    });
    return Object.keys(m).map((k) => { const r = m[k]; const c = ERP.customer(k) || {}; r.name = c.name || k; r.segment = c.segment || c.type || ''; r.limit = c.creditLimit || 0; r.terms = c.termsDays; r.review = !!(c.reviewNotes && c.reviewNotes.length); r.over = r.limit > 0 && r.total > r.limit; return r; }).sort((a, b) => b.total - a.total);
  }
  function arTotals(rows) { const t = { cur: 0, b30: 0, b60: 0, b90: 0, b90p: 0, total: 0, overdue: 0 }; (rows || arByCustomer()).forEach((r) => { BK.forEach((b) => { t[b[0]] += r[b[0]]; }); t.total += r.total; t.overdue += r.overdue; }); return t; }
  const uninvoiced = (so) => so.lines.map((l) => ({ itemId: l.itemId, qty: (l.deliveredQty || 0) - (l.invoicedQty || 0), price: l.price })).filter((l) => l.qty > 0);
  const readyToInvoice = () => get('salesOrders').filter((so) => ['cancelled', 'rejected', 'closed', 'draft', 'pending_review', 'pending_approval'].indexOf(so.status) < 0 && uninvoiced(so).length > 0);
  const readyValue = (so) => F.totals({ lines: uninvoiced(so), discountPct: so.discountPct });

  const billOpen = (b) => Math.max(0, Math.round(b.total - (b.paid || 0)));
  const billSt = (b) => (billOpen(b) < 1 ? 'paid' : b.dueDate < today() ? 'overdue' : b.paid > 0 ? 'partial' : 'open');
  const activeVouchers = () => get('vouchers').filter((v) => v.status === 'pending_approval' || v.status === 'approved');
  /** amount of a bill already covered by vouchers waiting for approval / execution */
  function pendingOnBills() {
    const m = {};
    activeVouchers().forEach((v) => { let left = v.amount; (v.billIds || []).forEach((id) => { const b = ERP.find('bills', id); if (!b) return; const p = Math.min(left, Math.max(0, billOpen(b) - (m[id] || 0))); m[id] = (m[id] || 0) + p; left -= p; }); });
    return m;
  }
  const billVoucher = (b) => activeVouchers().find((v) => (v.billIds || []).indexOf(b.id) >= 0) || null;

  /* ═════════════════════════ small UI helpers ═════════════════════════ */
  const M = (n) => U.money(n);
  const SH = (n) => fm.short(n);
  const pct = (n, d) => (n == null || !isFinite(n) ? '—' : (n * 100).toFixed(d == null ? 0 : d) + '%');
  const METHOD = { cash: 'نقدي', transfer: 'تحويل بنكي', cheque: 'شيك', card: 'بطاقة / نقاط بيع' };
  const METHOD_DESC = { cash: 'إلى الخزينة', transfer: 'إلى حساب بنكي', cheque: 'أوراق قبض حتى التحصيل', card: 'تسوية على حساب بنكي' };
  const methodsEnabled = () => { const pm = st.get('settings.finance.paymentMethods') || { cash: true, transfer: true, cheque: true }; const l = Object.keys(METHOD).filter((k) => pm[k]); return l.length ? l : ['transfer']; };
  const bankOpts = (kind) => get('banks').filter((b) => !kind || b.kind === kind).map((b) => [b.acc, b.name + ' (' + b.acc + ')']);
  const canCost = () => U.canCost();
  const canProfit = () => U.canProfit();
  const lockChip = (key) => h('span.erp-locked', { title: 'بيانات سرية — تحتاج صلاحية ' + key }, SA.icon('lock', 'icon-sm'), 'سري');
  const profitVal = (n, render) => (canProfit() ? (render ? render(n) : M(n)) : lockChip('data.profit.view'));
  const lockedCard = (key, title, text) => h('div.fin-locked-card', {}, SA.icon('lock', 'icon-lg'), h('b', {}, title), h('small', {}, text || 'تظهر لمن يملك الصلاحية الحساسة فقط — تُمنح من «الأدوار».'), h('code', {}, key));
  /** variance chip; inverse=true when "higher is worse" (expenses) */
  const varChip = (v, inverse) => {
    if (v == null || !isFinite(v)) return h('span.fin-var.is-neutral', {}, '—');
    const good = inverse ? v <= 0 : v >= 0; const tone = Math.abs(v) < 0.02 ? 'neutral' : good ? 'good' : Math.abs(v) > 0.1 ? 'bad' : 'warn';
    return h('span.fin-var.is-' + tone, {}, (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%');
  };
  const dueCell = (due, open) => { const d = ERP.daysBetween(due); return h('div.fin-stack', {}, h('span', {}, fm.date(due)), open ? (d > 0 ? h('small', { style: { color: 'var(--color-danger)' } }, 'متأخر ' + d + ' يوم') : d === 0 ? h('small', {}, 'يستحق اليوم') : h('small', {}, 'بعد ' + -d + ' يوم')) : null); };
  const custCell = (id) => { const c = ERP.customer(id); return h('div.fin-stack', {}, h('b', {}, c ? c.name : id), h('small.num', {}, c ? c.code || id : '')); };
  const supCell = (id) => { const c = ERP.supplier(id); return h('div.fin-stack', {}, h('b', {}, c ? c.name : id || '—'), c ? h('small', {}, (c.category || '') + (c.termsDays ? ' · ' + c.termsDays + ' يوم' : '')) : null); };
  const kpiRow = (list) => U.kpis(list.map((k) => (k ? U.kpi(k) : null)));
  const linkBtn = (label, route) => h('a.sap-linkbtn', { href: '#/' + route }, label);
  /** SA.table keeping its UI state across live re-renders */
  const table = (state, key, o) => SA.table(Object.assign({}, o, { initial: state[key] || o.initial, onChange: (s) => { state[key] = s; } }));
  const segmented = (items, active, cb) => SA.segmented(items, active, cb);
  /** SA.live + local UI re-render (period switches etc.): build(redraw) */
  const liveLocal = (root, build, paths) => SA.live(root, () => { const wrap = h('div'); const redraw = () => { SA.clear(wrap); wrap.appendChild(build(redraw)); }; redraw(); return wrap; }, paths);
  const sectionTitle = (t, extra) => U.sub(t, extra);
  const periodMatch = (date, v) => { if (!v) return true; if (v === 'm0') return date >= mStart(0); if (v === 'm1') return date >= mStart(-1) && date <= mEnd(-1); if (v === 'q') return date >= addDays(today(), -90); if (v === 'older') return date < addDays(today(), -90); return true; };
  const PERIOD_FILTER = [['m0', 'هذا الشهر'], ['m1', 'الشهر الماضي'], ['q', 'آخر 90 يومًا'], ['older', 'أقدم من 90 يومًا']];
  const jeOf = (refId) => get('journal').find((j) => j.ref && j.ref.id === refId) || null;

  /* Arabic amount in words (invoices / vouchers) */
  function words(n) {
    n = Math.floor(Math.abs(n)); if (!n) return 'صفر';
    const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
    const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    const hund = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
    const lt1000 = (x, construct) => { const hN = Math.floor(x / 100), r = x % 100; const parts = []; if (hN) parts.push(hN === 2 && !r && construct ? 'مائتا' : hund[hN]); if (r) { if (r < 20) parts.push(ones[r]); else { const o = r % 10, t = Math.floor(r / 10); parts.push(o ? ones[o] + ' و' + tens[t] : tens[t]); } } return parts.join(' و'); };
    const scales = [[1e9, 'مليار', 'ملياران', 'مليارات'], [1e6, 'مليون', 'مليونان', 'ملايين'], [1e3, 'ألف', 'ألفان', 'آلاف']];
    const parts = []; let rest = n;
    scales.forEach((sc) => { const q = Math.floor(rest / sc[0]); rest %= sc[0]; if (!q) return; if (q === 1) parts.push(sc[1]); else if (q === 2) parts.push(sc[2]); else if (q <= 10) parts.push(lt1000(q) + ' ' + sc[3]); else parts.push(lt1000(q, true) + ' ' + sc[1]); });
    if (rest) parts.push(lt1000(rest));
    return parts.join(' و');
  }
  const amountWords = (n) => 'فقط ' + words(Math.round(n)) + ' جنيه مصري لا غير';

  /** print one A4 node only (clone into #fin-print-root) — a plain print/PDF is never an official e-document */
  function printNode(node, title) {
    const old = document.getElementById('fin-print-root'); if (old) old.remove();
    const root = h('div#fin-print-root', {}, node.cloneNode(true)); document.body.appendChild(root); document.body.classList.add('fin-printing');
    const prevTitle = document.title; if (title) document.title = title;
    let done = false; const end = () => { if (done) return; done = true; document.body.classList.remove('fin-printing'); root.remove(); document.title = prevTitle; window.removeEventListener('afterprint', end); };
    window.addEventListener('afterprint', end);
    setTimeout(() => { try { window.print(); } catch (e) { /* noop */ } setTimeout(end, 400); }, 30);
  }
  function companyBlock() {
    const c = st.get('settings.company') || {};
    const v = (val, label) => (val ? h('span', {}, val) : SA.openValue(label || 'غير مُعدّ'));
    return h('div.fin-a4-co', {}, h('b', {}, c.nameAr || '—'), c.nameEn ? h('small', {}, c.nameEn) : null,
      h('small', {}, 'العنوان: ', v(c.address, 'العنوان الرسمي غير مُعدّ')),
      h('small', {}, 'الرقم الضريبي: ', v(c.taxId)), h('small', {}, 'السجل التجاري: ', v(c.commercialReg)),
      h('small.num', {}, [c.phone, c.email, c.website].filter(Boolean).join(' · ')));
  }
  const a4Head = (title, en, no, extra) => h('header.fin-a4-head', {}, h('div.fin-a4-brand', {}, h('img', { src: '../../assets/images/logo/wordmark-color.png', alt: 'المصرية الألمانية' }), companyBlock()), h('div.fin-a4-title', {}, h('h2', {}, title), h('small', {}, en), h('b.num', {}, no), extra || null));
  const dl = (rows) => h('dl', {}, rows.filter(Boolean).map((r) => [h('dt', {}, r[0]), h('dd', {}, r[1] == null || r[1] === '' ? '—' : r[1])]));

  /* ═════════════════════════ shared actions (modals) ═════════════════════════ */
  /** سند قبض — customer → open invoices → amount → method (settings.finance.paymentMethods) → account → cheque fields → ERP.flow.receivePayment */
  function openReceipt(o) {
    o = o || {};
    if (!SA.can('fin.receipts.create')) { SA.toast('ليست من صلاحياتك (fin.receipts.create)', 'warn'); return Promise.resolve(null); }
    const inv0 = o.invoiceId ? ERP.find('invoices', o.invoiceId) : null;
    const methods = methodsEnabled();
    const s = { customerId: o.customerId || (inv0 && inv0.customerId) || '', invoiceId: o.invoiceId || '', amount: o.amount || null, method: methods.indexOf('transfer') >= 0 ? 'transfer' : methods[0], account: '', no: '', bank: '', due: addDays(today(), 30), note: '' };
    const openInvs = () => get('invoices').filter((i) => i.customerId === s.customerId && invOpen(i) > 0).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    const accOpts = () => (s.method === 'cash' ? bankOpts('treasury') : bankOpts('bank'));
    const setAmount = () => { const inv = s.invoiceId ? ERP.find('invoices', s.invoiceId) : null; if (inv) s.amount = invOpen(inv); };
    const setAccount = () => { const ao = accOpts(); if (!ao.some((a) => a[0] === s.account)) s.account = ao[0] ? ao[0][0] : ''; };
    if (s.customerId && !s.invoiceId) { const f = openInvs()[0]; if (f) s.invoiceId = f.id; }
    if (!o.amount) setAmount(); setAccount();
    const custs = get('customers').filter((c) => c.status !== 'disabled').slice().sort((a, b) => (b.balance || 0) - (a.balance || 0));
    const body = h('div.fin-form'); let fCust, fAmount, fNo, fBank, fDue, fNote;
    function draw() {
      SA.clear(body);
      fCust = SA.form.field({ name: 'customerId', label: 'العميل', type: 'select', required: true, value: s.customerId, options: [['', 'اختر العميل…']].concat(custs.map((c) => [c.id, c.name + ' — رصيد ' + fm.money(c.balance || 0)])), onChange: (v) => { s.customerId = v; s.invoiceId = ''; const f = openInvs()[0]; if (f) s.invoiceId = f.id; setAmount(); draw(); } });
      const invs = s.customerId ? openInvs() : [];
      const fInv = SA.form.field({ name: 'invoiceId', label: 'التخصيص على فاتورة', type: 'select', value: s.invoiceId, disabled: !s.customerId, options: [['', 'دفعة تحت الحساب (بدون تخصيص)']].concat(invs.map((i) => [i.id, i.id + ' — متبقي ' + fm.money(invOpen(i)) + ' — استحقاق ' + fm.date(i.dueDate) + (invSt(i) === 'overdue' ? ' (متأخرة)' : '')])), onChange: (v) => { s.invoiceId = v; setAmount(); draw(); } });
      fAmount = SA.form.field({ name: 'amount', label: 'المبلغ (ج.م)', type: 'number', required: true, value: s.amount, min: 1, onInput: (v) => { s.amount = v === '' ? null : Number(v); },
        rules: [(v) => (!(v > 0) ? 'أدخل مبلغًا أكبر من صفر' : null), (v) => { const inv = s.invoiceId && ERP.find('invoices', s.invoiceId); return inv && v > invOpen(inv) + 0.5 ? 'المبلغ أكبر من المتبقي على الفاتورة (' + fm.money(invOpen(inv)) + ') — سجّل الزيادة كدفعة تحت الحساب' : null; }] });
      const fMethod = SA.form.field({ name: 'method', label: 'طريقة الدفع', type: 'radio', value: s.method, options: methods.map((m) => [m, METHOD[m], METHOD_DESC[m]]), onChange: (v) => { s.method = v || s.method; setAccount(); draw(); } });
      const parts = [h('div.fin-form-2', {}, fCust.el, fInv.el), fAmount.el, fMethod.el];
      if (s.method === 'cheque') {
        fNo = SA.form.field({ name: 'no', label: 'رقم الشيك', required: true, value: s.no, dir: 'ltr', onInput: (v) => { s.no = v; } });
        fBank = SA.form.field({ name: 'bank', label: 'البنك المسحوب عليه', required: true, value: s.bank, placeholder: 'مثال: البنك الأهلي', onInput: (v) => { s.bank = v; } });
        fDue = SA.form.field({ name: 'due', label: 'تاريخ الاستحقاق', type: 'date', required: true, value: s.due, onInput: (v) => { s.due = v; }, onChange: (v) => { s.due = v; } });
        parts.push(h('div.fin-form-2', {}, fNo.el, fBank.el), fDue.el, SA.alert('info', 'الشيك يُسجَّل على «أوراق القبض» (1121) بحالة مستلم — دورته: مستلم ← تحت التحصيل ← محصّل / مرتد / ملغى (بند 39).'));
      } else {
        const fAcc = SA.form.field({ name: 'account', label: s.method === 'cash' ? 'الخزينة' : 'الحساب البنكي', type: 'select', value: s.account, options: accOpts(), onChange: (v) => { s.account = v; draw(); } });
        parts.push(fAcc.el);
      }
      fNote = SA.form.field({ name: 'note', label: 'ملاحظة', type: 'textarea', rows: 2, value: s.note, onInput: (v) => { s.note = v; } });
      const c = ERP.customer(s.customerId);
      parts.push(fNote.el, h('div.fin-preview', {}, h('span', {}, h('b', {}, 'القيد التلقائي: '), 'مدين ', s.method === 'cheque' ? 'أوراق القبض (1121)' : s.account ? accLabel(s.account) : '—', ' / دائن العملاء (1131)'),
        c ? h('span', {}, 'رصيد العميل الحالي ', h('b.num', {}, fm.money(c.balance || 0)), c.creditLimit ? ' · حد الائتمان ' + fm.money(c.creditLimit) : '') : null));
      if (c && c.reviewNotes && c.reviewNotes.length) parts.push(SA.alert('warning', 'الحساب تحت المراجعة: ' + c.reviewNotes[0].text + ' (تنبيه فقط — بدون إيقاف تلقائي، بند 41)'));
      body.append(parts);
    }
    draw();
    const save = h('button.btn.btn-primary', { type: 'button' }, SA.icon('check', 'icon-sm'), 'تسجيل السند');
    const m = SA.modal({ title: 'سند قبض جديد', subtitle: 'تحصيل من عميل — يُرحَّل القيد تلقائيًا ويُحدَّث رصيد العميل والفاتورة', icon: 'coins', size: 'md', body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), save] });
    save.addEventListener('click', async () => {
      const fields = [fCust, fAmount].concat(s.method === 'cheque' ? [fNo, fBank, fDue] : []);
      if (!SA.form.group(fields).validate()) return;
      if (s.method !== 'cheque' && !s.account) { SA.toast('اختر الحساب المستلم', 'warn'); return; }
      m.setBusy(true); let rv = null;
      try { rv = await SA.api(() => F.receivePayment({ customerId: s.customerId, invoiceId: s.invoiceId || null, amount: fAmount.get(), method: s.method, account: s.method === 'cheque' ? null : s.account, cheque: s.method === 'cheque' ? { no: String(fNo.get()).trim(), bank: String(fBank.get()).trim(), dueDate: fDue.get() } : null, note: String(fNote.get() || '').trim() })); } catch (e) { m.setBusy(false); SA.fail(e); return; }
      m.setBusy(false);
      if (!rv) { SA.toast('تعذّر تسجيل السند — راجع المبلغ', 'error'); return; }
      SA.toast('تم تسجيل سند القبض ' + rv.id + ' — ' + fm.money(rv.amount) + (rv.chequeId ? ' (شيك ' + rv.chequeId + ')' : ''), 'success');
      m.close(rv);
    });
    return m.closed;
  }

  /** إصدار فاتورة من أمر بيع مُسلَّم (ERP.flow.invoiceOrder) — customer over limit → warning only (بند 41) */
  async function issueInvoice(soId) {
    if (!SA.can('fin.invoices.create')) { SA.toast('ليست من صلاحياتك (fin.invoices.create)', 'warn'); return null; }
    const so = ERP.find('salesOrders', soId); if (!so) { SA.toast('أمر البيع غير موجود', 'error'); return null; }
    const lines = uninvoiced(so); if (!lines.length) { SA.toast('لا توجد كميات مسلّمة غير مفوترة على ' + soId, 'warn'); return null; }
    const t = F.totals({ lines, discountPct: so.discountPct }); const c = ERP.customer(so.customerId) || {};
    const warnings = [];
    if (c.creditLimit && (c.balance || 0) + t.total > c.creditLimit) warnings.push('رصيد العميل بعد الفاتورة (' + fm.money((c.balance || 0) + t.total) + ') يتجاوز حد الائتمان (' + fm.money(c.creditLimit) + ') — تنبيه ومراجعة فقط، بدون إيقاف تلقائي (بند 41).');
    if (ERP.taxIsDemo()) warnings.push('نسبة ضريبة القيمة المضافة غير مُعدّة في سياسة المالية (Open) — تُستخدم 14% كقيمة تجريبية ومُعلَّمة على الفاتورة.');
    const extra = h('table.fin-pl', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الصنف'), h('th.fin-r', {}, 'الكمية'), h('th.fin-r', {}, 'القيمة'))),
      h('tbody', {}, lines.map((l) => h('tr', {}, h('td', {}, ERP.itemName(l.itemId)), h('td.fin-r', {}, fm.qty(l.qty, (ERP.item(l.itemId) || {}).uom)), h('td.fin-r', {}, M(l.qty * l.price))))),
      h('tfoot', {}, h('tr.is-total', {}, h('td', {}, 'الإجمالي شامل الضريبة'), h('td'), h('td.fin-r', {}, M(t.total)))));
    const r = await SA.confirm({ title: 'إصدار فاتورة لأمر البيع ' + soId, text: ERP.customerName(so.customerId) + ' — الكميات المسلّمة وغير المفوترة فقط.', icon: 'receipt', confirmLabel: 'أصدر الفاتورة', extra,
      impact: ['قيد تلقائي: مدين العملاء (1131) ' + fm.money(t.total) + ' / دائن المبيعات ' + fm.money(t.net) + ' / دائن ضريبة القيمة المضافة (2111) ' + fm.money(t.tax), 'رصيد العميل يزيد بقيمة الفاتورة ويُحسب الاستحقاق بعد ' + (c.termsDays || 30) + ' يوم', 'حالة أمر البيع تتحدث (مُفوتر عند اكتمال الفوترة)'], warnings });
    if (!r.ok) return null;
    let inv = null;
    try { inv = await SA.api(() => F.invoiceOrder(soId)); } catch (e) { SA.fail(e); return null; }
    if (!inv) { SA.toast('لم تصدر الفاتورة — لا توجد كميات مسلّمة غير مفوترة', 'warn'); return null; }
    try { SA.notify({ title: 'فاتورة جديدة ' + inv.id, body: ERP.customerName(inv.customerId) + ' — ' + fm.money(inv.total) + ' · استحقاق ' + fm.date(inv.dueDate), level: 'info', to: ['R-03'], toUsers: so.repId ? [so.repId] : [], link: '#/fin/invoices/' + inv.id }); } catch (e) { /* noop */ }
    SA.toast('تم إصدار الفاتورة ' + inv.id + ' — ' + fm.money(inv.total), 'success');
    return inv;
  }

  /** سند صرف — supplier bills (2101) or direct expense (expense account) → ERP.flow.createVoucher (sensitive finance.voucher.create) */
  function openVoucher(o) {
    o = o || {};
    if (!SA.can('finance.voucher.create')) { SA.toast('إنشاء سند الصرف صلاحية حساسة منفصلة (finance.voucher.create) — ليست ضمن دورك.', 'warn'); return Promise.resolve(null); }
    const pend = pendingOnBills();
    const avail = (b) => Math.max(0, billOpen(b) - (pend[b.id] || 0));
    const s = { kind: o.kind || (o.expenseAcc ? 'expense' : 'supplier'), supplierId: o.supplierId || '', billIds: (o.billIds || []).slice(), amount: o.amount || null, method: 'transfer', account: '1111', expenseAcc: o.expenseAcc || '', payee: o.payee || '', memo: o.memo || '' };
    const supBills = () => get('bills').filter((b) => b.supplierId === s.supplierId && billOpen(b) > 0).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    const autoAmount = () => { if (s.kind !== 'supplier' || !s.billIds.length) return; s.amount = s.billIds.reduce((t, id) => { const b = ERP.find('bills', id); return t + (b ? avail(b) : 0); }, 0); };
    const accOpts = () => (s.method === 'cash' ? bankOpts('treasury') : bankOpts('bank'));
    const setAccount = () => { const ao = accOpts(); if (!ao.some((a) => a[0] === s.account)) s.account = ao[0] ? ao[0][0] : ''; };
    autoAmount(); setAccount();
    const expAccs = leafAccounts((a) => a.type === 'expense' && a.code !== '5101' && a.code !== '5303');
    const sups = get('suppliers').filter((x) => x.status !== 'disabled').slice().sort((a, b) => (b.balance || 0) - (a.balance || 0));
    const body = h('div.fin-form'); let fAmount, fPayee, fExp, fSup, fMemo;
    const chainTxt = () => ((s.amount || 0) > F.limits.poGm ? 'المدير المالي ← المدير العام' : 'المدير المالي');
    function draw() {
      SA.clear(body);
      const fKind = SA.form.field({ name: 'kind', label: 'نوع السند', type: 'radio', value: s.kind, options: [['supplier', 'سداد مورد', 'فواتير مورد مستحقة — مدين الموردين (2101)'], ['expense', 'مصروف مباشر', 'مدين حساب مصروف من دليل الحسابات']], onChange: (v) => { s.kind = v || s.kind; draw(); } });
      const parts = [fKind.el];
      if (s.kind === 'supplier') {
        fSup = SA.form.field({ name: 'supplierId', label: 'المورد', type: 'select', required: true, value: s.supplierId, options: [['', 'اختر المورد…']].concat(sups.map((x) => [x.id, x.name + ' — مستحق ' + fm.money(x.balance || 0)])), onChange: (v) => { s.supplierId = v; s.billIds = supBills().filter((b) => avail(b) > 0).slice(0, 1).map((b) => b.id); autoAmount(); draw(); } });
        parts.push(fSup.el);
        if (s.supplierId) {
          const bills = supBills();
          parts.push(h('div.field', {}, h('span.label', {}, 'الفواتير المسددة بهذا السند'), bills.length ? h('div.fin-checks', {}, bills.map((b) => { const a = avail(b); const on = s.billIds.indexOf(b.id) >= 0; const v = billVoucher(b);
            return h('label' + (a < 1 ? '.is-off' : ''), {}, h('input', { type: 'checkbox', checked: on, disabled: a < 1 && !on, onchange: (e) => { if (e.target.checked) s.billIds.push(b.id); else s.billIds = s.billIds.filter((x) => x !== b.id); autoAmount(); draw(); } }),
              h('span.fin-stack', {}, h('b.num', {}, b.id), h('small', {}, 'استحقاق ' + fm.date(b.dueDate) + (b.dueDate < today() ? ' · متأخرة' : '') + (v ? ' · مغطاة جزئيًا في ' + v.id : ''))), h('b.num', {}, fm.money(a))); })) : h('p.fin-muted', {}, 'لا توجد فواتير مستحقة لهذا المورد — يمكن إنشاء دفعة تحت الحساب.')));
        }
      } else {
        fExp = SA.form.field({ name: 'expenseAcc', label: 'حساب المصروف', type: 'select', required: true, value: s.expenseAcc, options: [['', 'اختر الحساب…']].concat(expAccs.map((a) => [a.code, a.code + ' — ' + a.name])), onChange: (v) => { s.expenseAcc = v; } });
        fPayee = SA.form.field({ name: 'payee', label: 'المستفيد', required: true, value: s.payee, placeholder: 'اسم الجهة أو الشخص', onInput: (v) => { s.payee = v; } });
        parts.push(h('div.fin-form-2', {}, fExp.el, fPayee.el));
      }
      fAmount = SA.form.field({ name: 'amount', label: 'المبلغ (ج.م)', type: 'number', required: true, value: s.amount, min: 1, onInput: (v) => { s.amount = v === '' ? null : Number(v); }, rules: [(v) => (!(v > 0) ? 'أدخل مبلغًا أكبر من صفر' : null)] });
      const fMethod = SA.form.field({ name: 'method', label: 'طريقة الصرف', type: 'select', value: s.method, options: [['transfer', 'تحويل بنكي'], ['cheque', 'شيك صادر'], ['cash', 'نقدي من الخزينة']], onChange: (v) => { s.method = v; setAccount(); draw(); } });
      const fAcc = SA.form.field({ name: 'account', label: 'يُصرف من', type: 'select', value: s.account, options: accOpts(), onChange: (v) => { s.account = v; } });
      fMemo = SA.form.field({ name: 'memo', label: 'البيان', type: 'textarea', rows: 2, value: s.memo, onInput: (v) => { s.memo = v; } });
      parts.push(h('div.fin-form-2', {}, fAmount.el, fMethod.el), fAcc.el, fMemo.el,
        SA.alert('info', h('b', {}, 'فصل المهام (بند 42): '), 'الإنشاء ثم الاعتماد ثم التنفيذ ثلاث صلاحيات منفصلة. أنت المنشئ — لن تستطيع اعتماد هذا السند أو تنفيذه. ', h('br'), 'سلسلة الاعتماد: ' + chainTxt() + ' (حدود تجريبية — القيم الفعلية Open).'));
      body.append(parts);
    }
    draw();
    const save = h('button.btn.btn-primary', { type: 'button' }, SA.icon('send', 'icon-sm'), 'إنشاء وإرسال للاعتماد');
    const m = SA.modal({ title: 'سند صرف جديد', subtitle: 'يُنشأ بحالة «بانتظار الاعتماد» ويظهر في صندوق الاعتمادات', icon: 'send', size: 'md', body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), save] });
    save.addEventListener('click', async () => {
      const fields = [fAmount].concat(s.kind === 'supplier' ? [fSup] : [fExp, fPayee]);
      if (!SA.form.group(fields).validate()) return;
      if (!s.account) { SA.toast('اختر حساب الصرف', 'warn'); return; }
      const amt = Number(fAmount.get());
      if (s.kind === 'supplier' && s.billIds.length) { const cap = s.billIds.reduce((t, id) => { const b = ERP.find('bills', id); return t + (b ? avail(b) : 0); }, 0); if (amt > cap + 0.5) { fAmount.error('المبلغ أكبر من المتبقي على الفواتير المحددة (' + fm.money(cap) + ')'); return; } }
      m.setBusy(true); let pv = null;
      try {
        pv = await SA.api(() => F.createVoucher(s.kind === 'supplier'
          ? { supplierId: s.supplierId, billIds: s.billIds.slice(), amount: amt, method: s.method, account: s.account, memo: String(s.memo || '').trim() || 'سداد فواتير مورد' }
          : { supplierId: null, payee: String(s.payee).trim(), expenseAcc: s.expenseAcc, amount: amt, method: s.method, account: s.account, memo: String(s.memo || '').trim() || GL.accName(s.expenseAcc) }));
      } catch (e) { m.setBusy(false); SA.fail(e); return; }
      m.setBusy(false);
      if (!pv) { SA.toast('تعذّر إنشاء السند', 'error'); return; }
      SA.toast('تم إنشاء سند الصرف ' + pv.id + ' وإرساله للاعتماد (' + pv.approvalId + ')', 'success');
      m.close(pv); SA.nav('fin/vouchers/' + pv.id);
    });
    return m.closed;
  }

  /** execute an approved voucher — SoD (creator / approver can't execute) + confirm + step-up('voucher.execute') */
  function sodReason(pv) {
    if (pv.status === 'executed') return 'تم تنفيذ السند ' + (pv.executedAt ? SA.fmt.rel(pv.executedAt) : '');
    if (pv.status === 'rejected') return 'السند مرفوض — لا يُنفَّذ';
    if (pv.status !== 'approved') return 'السند لم يُعتمد بعد — التنفيذ بعد الاعتماد فقط';
    if (pv.createdBy === me()) return 'فصل المهام: أنت من أنشأ هذا السند — التنفيذ لشخص آخر';
    if (pv.approvedBy && pv.approvedBy === me()) return 'فصل المهام: أنت من اعتمد هذا السند — التنفيذ لشخص آخر';
    return null;
  }
  async function executeVoucher(pvId) {
    const pv = ERP.find('vouchers', pvId); if (!pv) return;
    if (!SA.can('finance.voucher.execute')) { SA.toast('تنفيذ الصرف صلاحية حساسة منفصلة (finance.voucher.execute)', 'warn'); return; }
    const why = sodReason(pv); if (why) { SA.toast(why, 'warn'); return; }
    const bal = nat(glMap(null, null), pv.account);
    const warnings = bal < pv.amount ? ['رصيد ' + accLabel(pv.account) + ' الحالي ' + fm.money(bal) + ' أقل من مبلغ السند.'] : [];
    const r = await SA.confirm({ title: 'تنفيذ سند الصرف ' + pv.id, danger: true, icon: 'send', confirmLabel: 'تنفيذ الصرف', text: pv.payee + ' — ' + fm.money(pv.amount) + ' (' + (pv.method === 'cheque' ? 'شيك صادر' : pv.method === 'cash' ? 'نقدي' : 'تحويل بنكي') + ')',
      impact: ['قيد تلقائي: مدين ' + (pv.supplierId ? 'الموردين (2101)' : GL.accName(pv.expenseAcc || '6201') + ' (' + (pv.expenseAcc || '6201') + ')') + ' / دائن ' + accLabel(pv.account), pv.billIds && pv.billIds.length ? 'تتحدث حالة ' + pv.billIds.length + ' فاتورة مورد (مدفوعة/جزئي) ورصيد المورد' : 'لا توجد فواتير مرتبطة', 'العملية حرجة وتُسجَّل في التدقيق باسمك (PV.EXECUTED)'], warnings });
    if (!r.ok) return;
    const ok = await SA.stepUp('voucher.execute', { text: 'تنفيذ صرف ' + fm.money(pv.amount) + ' من ' + accLabel(pv.account) + ' — أدخل كلمة المرور أو كود التحقق للمتابعة.' });
    if (!ok) return;
    let res = null;
    try { res = await SA.api(() => F.executeVoucher(pvId)); } catch (e) { SA.fail(e); return; }
    if (!res) { SA.toast('تعذّر التنفيذ — تحقق من حالة السند', 'error'); return; }
    SA.toast('تم تنفيذ سند الصرف ' + pvId + ' — ' + fm.money(pv.amount), 'success');
  }

  /** cheque lifecycle buttons → ERP.flow.chequeStatus (بند 39). Bounce: alert + customer review only (بند 41 — no automatic stop). */
  function addReviewNote(customerId, text, chequeId) {
    st.patch('customers', customerId, (c) => { const notes = (c.reviewNotes || []).slice(); notes.unshift({ at: ERP.now(), by: me(), text, chequeId: chequeId || null }); return { reviewNotes: notes, reviewSince: c.reviewSince || ERP.now() }; });
    audit('CUSTOMER.REVIEW_NOTED', { target: { type: 'customer', id: customerId, label: ERP.customerName(customerId) }, reason: text, after: { review: true, autoStop: false } });
  }
  async function reviewNote(customerId, chequeId) {
    if (!SA.can('fin.cheques.edit')) { SA.toast('ليست من صلاحياتك (fin.cheques.edit)', 'warn'); return; }
    const r = await SA.confirm({ title: 'ملاحظة مراجعة — ' + ERP.customerName(customerId), icon: 'note', reasonRequired: true, reasonLabel: 'الملاحظة', confirmLabel: 'حفظ الملاحظة', text: 'تُسجَّل على حساب العميل وتصل لمدير المبيعات. لا يتم إيقاف العميل تلقائيًا (بند 41) — القرار بعد المراجعة.' });
    if (!r.ok) return;
    try { await SA.api(() => { addReviewNote(customerId, r.reason, chequeId); SA.notify({ title: 'مراجعة حساب عميل: ' + ERP.customerName(customerId), body: r.reason, level: 'action', to: ['R-03', 'R-22'], link: '#/fin/aging?c=' + customerId }); }); } catch (e) { SA.fail(e); return; }
    SA.toast('تم تسجيل ملاحظة المراجعة', 'success');
  }
  async function chequeAction(id, to) {
    const ch = ERP.find('cheques', id); if (!ch) return;
    if (!SA.can('fin.cheques.edit')) { SA.toast('ليست من صلاحياتك (fin.cheques.edit)', 'warn'); return; }
    const label = ERP.customerName(ch.customerId) + ' — ' + fm.money(ch.amount) + ' — شيك رقم ' + ch.no + ' (' + ch.bank + ')';
    if (to === 'under_collection') {
      const r = await SA.confirm({ title: 'إيداع الشيك للتحصيل', icon: 'upload', text: label, confirmLabel: 'إيداع للتحصيل', impact: ['الحالة: مستلم ← تحت التحصيل', 'لا قيد محاسبي حتى التحصيل الفعلي'] }); if (!r.ok) return;
      try { await SA.api(() => F.chequeStatus(id, 'under_collection')); } catch (e) { SA.fail(e); return; }
      SA.toast('الشيك ' + ch.no + ' تحت التحصيل', 'success'); return;
    }
    if (to === 'collected') {
      const banks = bankOpts('bank'); let acc = ch.bankAcc || (banks[0] && banks[0][0]);
      const fAcc = SA.form.field({ name: 'acc', label: 'البنك الذي حُصّل فيه الشيك', type: 'select', value: acc, options: banks, onChange: (v) => { acc = v; } });
      const okBtn = h('button.btn.btn-primary', { type: 'button' }, SA.icon('check', 'icon-sm'), 'تأكيد التحصيل');
      const m = SA.modal({ title: 'تحصيل الشيك ' + ch.no, subtitle: label, icon: 'checkcircle', size: 'sm', body: h('div.fin-form', {}, fAcc.el, h('div.fin-preview', {}, h('span', {}, h('b', {}, 'القيد: '), 'مدين البنك المختار / دائن أوراق القبض (1121) — ', h('b.num', {}, fm.money(ch.amount))))), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), okBtn] });
      okBtn.addEventListener('click', async () => { m.setBusy(true); try { await SA.api(() => F.chequeStatus(id, 'collected', acc)); } catch (e) { m.setBusy(false); SA.fail(e); return; } m.setBusy(false); m.close(true); SA.toast('تم تحصيل الشيك ' + ch.no + ' في ' + accLabel(acc), 'success'); });
      return;
    }
    if (to === 'bounced') {
      const r = await SA.confirm({ title: 'تسجيل ارتداد الشيك ' + ch.no, danger: true, icon: 'alert', text: label, reasonRequired: true, reasonLabel: 'سبب الارتداد (من إشعار البنك)', confirmLabel: 'تسجيل الارتداد',
        impact: ['قيد عكسي: مدين العملاء (1131) / دائن أوراق القبض (1121)', 'رصيد العميل يزيد ويُعاد فتح الفاتورة المرتبطة', 'تنبيه عاجل للمالية والمبيعات + ملاحظة مراجعة على حساب العميل'], warnings: ['لا يوجد إيقاف تلقائي للعميل (بند 41) — الحساب يتحول للمراجعة فقط.'] });
      if (!r.ok) return;
      try { await SA.api(() => { F.chequeStatus(id, 'bounced'); addReviewNote(ch.customerId, 'شيك مرتد رقم ' + ch.no + ' (' + fm.money(ch.amount) + '): ' + r.reason, id); }); } catch (e) { SA.fail(e); return; }
      SA.toast('تم تسجيل ارتداد الشيك ' + ch.no + ' — الحساب للمراجعة', 'warn'); return;
    }
    if (to === 'cancelled') {
      const r = await SA.confirm({ title: 'إلغاء الشيك ' + ch.no, danger: true, icon: 'x', text: label, reasonRequired: true, reasonLabel: 'سبب الإلغاء (استبدال/إعادة للعميل…)', confirmLabel: 'إلغاء الشيك', impact: ['الحالة: ← ملغى', 'يُعكس أثر سند القبض: مدين العملاء / دائن أوراق القبض، ويُعاد فتح الفاتورة'] });
      if (!r.ok) return;
      try {
        await SA.api(() => {
          const before = get('journal').filter((j) => j.ref && j.ref.id === id).length;
          F.chequeStatus(id, 'cancelled');
          /* ERP.flow.chequeStatus('cancelled') posts nothing today → reverse the receipt here (reported to the lead; skipped automatically once the flow does it) */
          if (get('journal').filter((j) => j.ref && j.ref.id === id).length === before) {
            GL.post({ memo: 'إلغاء شيك ' + ch.no + ' — عكس سند القبض', ref: { type: 'cheque', id }, lines: [{ acc: '1131', dr: ch.amount }, { acc: '1121', cr: ch.amount }] });
            st.patch('customers', ch.customerId, (x) => ({ balance: (x.balance || 0) + ch.amount }));
            const rv = ERP.find('receipts', ch.receiptId); if (rv && rv.invoiceId) st.patch('invoices', rv.invoiceId, (inv) => { const paid = Math.max(0, (inv.paid || 0) - ch.amount); const n = Object.assign({}, inv, { paid }); return { paid, status: F.invoiceStatus(n) }; });
            st.patch('cheques', id, { reversed: true, cancelReason: r.reason });
          }
        });
      } catch (e) { SA.fail(e); return; }
      SA.toast('تم إلغاء الشيك ' + ch.no, 'success');
    }
  }
  const chequeNext = (c) => ({ received: [['under_collection', 'إيداع للتحصيل', 'upload']], under_collection: [['collected', 'تحصيل', 'checkcircle'], ['bounced', 'ارتداد', 'alert']], bounced: [] }[c.status] || []);

  /* ═════════════════════════ 1. لوحة المالية ═════════════════════════ */
  /** 30-day cash forecast (demo assumptions, tagged in the UI) */
  function forecast(N) {
    N = N || 30; const t0 = today(); const start = cashPosition();
    const inn = new Array(N + 1).fill(0), out = new Array(N + 1).fill(0);
    get('invoices').forEach((i) => { const o = invOpen(i); if (o < 1) return; const k = ERP.daysBetween(t0, i.dueDate); if (k < 0) { for (let d = 1; d <= 14; d++) inn[d] += (o * 0.6) / 14; } else if (k <= N) inn[Math.max(1, k)] += o * 0.9; });
    get('cheques').forEach((c) => { if (c.status !== 'received' && c.status !== 'under_collection') return; const k = Math.max(1, ERP.daysBetween(t0, c.dueDate) + 1); if (k <= N) inn[k] += c.amount; });
    const pend = pendingOnBills();
    activeVouchers().forEach((v) => { out[v.status === 'approved' ? 1 : 3] += v.amount; });
    get('bills').forEach((b) => { const o = billOpen(b) - (pend[b.id] || 0); if (o < 1) return; const k = ERP.daysBetween(t0, b.dueDate); if (k < 0) out[2] += o; else if (k <= N) out[Math.max(1, k)] += o; });
    let run = 0; for (let k = -3; k <= -1; k++) { const c = cashCats(mStart(k), mEnd(k)); run += -(c.opex + c.pay + c.tax); } run = Math.max(0, run / 3);
    for (let d = 1; d <= N; d++) out[d] += run / 30;
    let bal = start, ci = 0, co = 0, min = start, minD = 0; const B = [], CI = [], CO = [], L = [];
    for (let d = 0; d <= N; d++) { ci += inn[d]; co += out[d]; bal += inn[d] - out[d]; B.push(Math.round(bal)); CI.push(Math.round(ci)); CO.push(Math.round(co)); L.push(d === 0 ? 'اليوم' : ddmm(addDays(t0, d))); if (bal < min) { min = bal; minD = d; } }
    return { start, labels: L, bal: B, cin: CI, cout: CO, min: Math.round(min), minLabel: minD === 0 ? 'اليوم' : fm.date(addDays(t0, minD)), run, end: Math.round(bal) };
  }
  function plSnapshot(T) {
    if (!canProfit()) return lockedCard('data.profit.view', 'قائمة الدخل المختصرة سرية', 'الأرباح والهوامش تظهر لمن يملك صلاحية الأرباح فقط (المالك · المدير العام · المدير المالي).');
    const y = new Date().getFullYear();
    const cols = [['الشهر الحالي', mStart(0), today()], ['منذ بداية ' + y, y + '-01-01', today()]].map((c) => { const mp = glMap(c[1], c[2]); const rev = typeSum(mp, 'revenue', T); const cogs = under(mp, '5', T); const opex = under(mp, '6', T); return { rev, cogs, gp: rev - cogs, opex, np: rev - cogs - opex }; });
    const row = (label, key, cls, pctOf) => h('tr' + (cls ? '.' + cls : ''), {}, h('td', {}, label), cols.map((c) => h('td.fin-r', {}, M(c[key]), pctOf ? h('small.fin-muted', {}, ' ' + pct(c.rev ? c[key] / c.rev : null, 1)) : null)));
    return h('div', {}, h('table.fin-pl', {}, h('thead', {}, h('tr', {}, h('th', {}, 'البند'), h('th.fin-r', {}, 'الشهر الحالي'), h('th.fin-r', {}, 'منذ بداية السنة'))),
      h('tbody', {}, row('الإيرادات', 'rev'), row('تكاليف الإنتاج والمبيعات', 'cogs'), row('مجمل الربح', 'gp', 'is-total', true), row('المصروفات التشغيلية والتمويلية', 'opex'), row('صافي الربح قبل الضرائب', 'np', 'is-grand', true))),
      h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'من الأستاذ العام مباشرة. ضريبة الدخل والإقفال: Open. ', linkBtn('القوائم المالية الكاملة', 'fin/statements'))));
  }
  function attentionItems() {
    const items = [];
    get('cheques').filter((c) => c.status === 'bounced').forEach((c) => items.push({ tone: 'danger', icon: 'alert', title: 'شيك مرتد ' + c.no + ' — ' + ERP.customerName(c.customerId), sub: fm.money(c.amount) + ' · مراجعة الحساب (بند 41 — بلا إيقاف تلقائي)', href: '#/fin/cheques?q=' + c.id }));
    const old = get('invoices').filter((i) => invOpen(i) > 0 && pastDue(i.dueDate) > 60);
    if (old.length) { const top = old.slice().sort((a, b) => invOpen(b) - invOpen(a))[0]; items.push({ tone: 'danger', icon: 'clock', title: old.length + ' فاتورة متأخرة أكثر من 60 يومًا', sub: fm.money(sum(old, invOpen)) + ' · أكبرها ' + top.id + ' — ' + ERP.customerName(top.customerId), href: '#/fin/aging' }); }
    get('vouchers').filter((v) => v.status === 'approved').forEach((v) => items.push({ tone: 'warning', icon: 'send', title: 'سند صرف معتمد بانتظار التنفيذ ' + v.id, sub: v.payee + ' · ' + fm.money(v.amount), href: '#/fin/vouchers/' + v.id }));
    readyToInvoice().forEach((so) => items.push({ tone: 'warning', icon: 'receipt', title: 'أمر بيع مُسلَّم غير مُفوتر ' + so.id, sub: ERP.customerName(so.customerId) + ' · ' + fm.money(readyValue(so).total), href: '#/fin/invoices?so=' + so.id }));
    const overB = get('bills').filter((b) => billOpen(b) > 0 && b.dueDate < today());
    if (overB.length) items.push({ tone: 'warning', icon: 'truck', title: overB.length + ' فاتورة مورد متأخرة السداد', sub: fm.money(sum(overB, billOpen)), href: '#/fin/bills' });
    arByCustomer().filter((r) => r.over).slice(0, 3).forEach((r) => items.push({ tone: 'info', icon: 'users', title: 'تجاوز حد الائتمان — ' + r.name, sub: 'مستحق ' + fm.money(r.total) + ' من حد ' + fm.money(r.limit) + ' · مراجعة فقط', href: '#/fin/aging?c=' + r.id }));
    return items;
  }
  const attnList = (items, max) => (items.length ? h('ul.fin-attn', {}, items.slice(0, max || 8).map((it) => h('li.is-' + it.tone, {}, h('a', { href: it.href }, h('span.fin-attn-ico', {}, SA.icon(it.icon, 'icon-sm')), h('span', {}, h('b', {}, it.title), h('small', {}, it.sub)), SA.icon('chevron', 'icon-sm icon-flip'))))) : SA.empty({ icon: 'checkcircle', title: 'لا يوجد ما يحتاج انتباهك', text: 'كل المستندات في حالتها الطبيعية.' }));
  function localInsights() {
    const out = []; const ar = arByCustomer();
    const slow = ar.filter((r) => r.b60 + r.b90 + r.b90p > 0).sort((a, b) => (b.b60 + b.b90 + b.b90p) - (a.b60 + a.b90 + a.b90p))[0];
    if (slow) out.push({ tone: 'warning', title: 'تأخر سداد متكرر: ' + slow.name, text: 'عليه ' + SH(slow.b60 + slow.b90 + slow.b90p) + ' متأخرة أكثر من 30 يومًا. المقترح: مكالمة تحصيل ومراجعة شروط الدفع — بدون إيقاف تلقائي (بند 41).', actions: [{ label: 'كشف الحساب', route: 'fin/aging?c=' + slow.id }] });
    const fc = forecast(30);
    out.push(fc.min < fc.start * 0.5 ? { tone: 'danger', title: 'انخفاض متوقع في السيولة', text: 'أقل رصيد متوقع خلال 30 يومًا ' + SH(fc.min) + ' (' + fc.minLabel + '). راجع مواعيد سداد الموردين وسرّع التحصيل.', actions: [{ label: 'فواتير الموردين', route: 'fin/bills' }] }
      : { tone: 'success', title: 'السيولة تغطي التزامات 30 يومًا', text: 'أقل رصيد متوقع ' + SH(fc.min) + ' والرصيد المتوقع بعد 30 يومًا ' + SH(fc.end) + ' (تقدير تجريبي).', actions: [{ label: 'البنوك والخزائن', route: 'fin/banks' }] });
    const ready = readyToInvoice();
    if (ready.length) out.push({ tone: 'info', title: ready.length + ' أمر بيع مُسلَّم بانتظار الفاتورة', text: 'الفوترة فور التسليم تبدأ عدّاد الاستحقاق وتُظهر الإيراد في الدفاتر.', actions: [{ label: 'جاهز للفوترة', route: 'fin/invoices?tab=ready' }] });
    return out.slice(0, 3);
  }
  function dashboard(root) {
    return SA.live(root, () => {
      const T = types(); const all = glMap(null, null); const bal = (acc) => nat(all, acc, T);
      const banks = get('banks'); const cash = sum(banks, (b) => bal(b.acc)); const bankCash = sum(banks.filter((b) => b.kind === 'bank'), (b) => bal(b.acc));
      const k6 = ERP.monthKeys(6); const cashTrend = k6.map((k) => cashPosition(keyRange(k).to));
      const arRows = arByCustomer(); const ar = arTotals(arRows);
      const overdueInv = get('invoices').filter((i) => invOpen(i) > 0 && bucketOf(i.dueDate) !== 'cur');
      const t7 = addDays(today(), 7);
      const ap7 = get('bills').filter((b) => billOpen(b) > 0 && b.dueDate <= t7); const apOver = ap7.filter((b) => b.dueDate < today());
      const rc = get('receipts'); const rsum = (from, to) => sum(rc.filter((r) => r.date >= from && r.date <= to), (r) => r.amount);
      const mtd = rsum(mStart(0), today()), lmSame = rsum(mStart(-1), shiftDate(today(), -1)), lmFull = rsum(mStart(-1), mEnd(-1));
      const colTrend = k6.map((k) => { const r = keyRange(k); return rsum(r.from, r.to); });
      const chq = get('cheques'); const wk = chq.filter((c) => (c.status === 'received' || c.status === 'under_collection') && c.dueDate >= today() && c.dueDate <= t7); const bounced = chq.filter((c) => c.status === 'bounced');
      const pvs = get('vouchers'); const pvPend = pvs.filter((v) => v.status === 'pending_approval'), pvAppr = pvs.filter((v) => v.status === 'approved');
      const vat = bal('2111');
      const head = SA.pageHead({ title: 'لوحة المالية', desc: 'السيولة والتحصيل والمدفوعات والضريبة من نفس الدفاتر — كل رقم يفتح المستند الذي وراءه.', tags: [U.demo('أرقام النموذج تجريبية')],
        actions: [SA.btn({ label: 'جاهز للفوترة', icon: 'receipt', kind: 'ghost', perm: 'fin.invoices.view', onClick: () => SA.nav('fin/invoices?tab=ready') }), SA.btn({ label: 'سند قبض', icon: 'plus', kind: 'primary', perm: 'fin.receipts.create', onClick: () => openReceipt({}) })] });
      const kpis = kpiRow([
        { label: 'السيولة النقدية (بنوك + خزائن)', value: SH(cash), sub: 'بنوك ' + SH(bankCash) + ' · خزائن ' + SH(cash - bankCash), href: '#/fin/banks', icon: 'building', trend: cashTrend, tone: 'primary' },
        { label: 'مستحقات العملاء', value: SH(ar.total), sub: 'متأخر ' + SH(ar.overdue) + ' · ' + overdueInv.length + ' فاتورة', href: '#/fin/aging', icon: 'users', tone: ar.overdue > ar.total * 0.35 ? 'warning' : null },
        { label: 'مستحق للموردين خلال 7 أيام', value: SH(sum(ap7, billOpen)), sub: ap7.length + ' فاتورة' + (apOver.length ? ' · منها ' + apOver.length + ' متأخرة' : ''), href: '#/fin/bills', icon: 'truck', tone: apOver.length ? 'warning' : null },
        { label: 'تحصيلات الشهر حتى اليوم', value: SH(mtd), delta: lmSame ? (mtd - lmSame) / lmSame : null, sub: 'نفس الفترة الشهر الماضي ' + SH(lmSame) + ' · الشهر الماضي كاملًا ' + SH(lmFull), href: '#/fin/receipts', icon: 'coins', trend: colTrend },
        { label: 'شيكات تستحق هذا الأسبوع', value: String(wk.length), sub: SH(sum(wk, (c) => c.amount)) + (bounced.length ? ' · ' + bounced.length + ' شيك مرتد' : ''), href: '#/fin/cheques', icon: 'calendar', tone: bounced.length ? 'danger' : null },
        { label: 'سندات الصرف المفتوحة', value: String(pvPend.length + pvAppr.length), sub: pvPend.length + ' بانتظار الاعتماد · ' + pvAppr.length + ' بانتظار التنفيذ', href: '#/fin/vouchers', icon: 'send', tone: pvAppr.length ? 'warning' : null },
        { label: 'ضريبة القيمة المضافة المستحقة (2111)', value: SH(vat), sub: ERP.taxIsDemo() ? U.demo('نسبة 14% تجريبية — Open') : 'النسبة ' + pct(ERP.taxRate()), href: SA.can('fin.journal.view') ? '#/fin/journal?acc=2111' : null, icon: 'receipt' }
      ]);
      kpis.classList.add('fin-kpis-7');
      const k12 = ERP.monthKeys(12); const m12 = k12.map((k) => { const r = keyRange(k); const mp = glMap(r.from, r.to); return { k, rev: typeSum(mp, 'revenue', T), exp: typeSum(mp, 'expense', T), io: cashIO(r.from, r.to) }; });
      const revExp = CH.columns({ labels: m12.map((x) => shortMonth(x.k)), series: [{ name: 'الإيرادات', values: m12.map((x) => x.rev), color: ERP.palette[0] }, { name: 'التكاليف والمصروفات', values: m12.map((x) => x.exp), color: ERP.palette[3] }], height: 230, title: 'الإيرادات مقابل المصروفات' });
      const io6 = m12.slice(6);
      const cashChart = CH.columns({ labels: io6.map((x) => shortMonth(x.k)), series: [{ name: 'مقبوضات', values: io6.map((x) => x.io.inn), color: '#147a3d' }, { name: 'مدفوعات', values: io6.map((x) => x.io.out), color: '#b9141b' }], height: 230, title: 'التدفق النقدي' });
      const donut = ar.total ? CH.donut(BK.map((b) => ({ label: b[1], value: ar[b[0]], color: b[2] })), { center: SH(ar.total).replace(' ج.م', ''), sub: 'ج.م مستحقات', fmt: SH, title: 'أعمار الديون' }) : SA.empty({ icon: 'checkcircle', title: 'لا توجد مستحقات مفتوحة' });
      const top = arRows.slice(0, 6);
      const debtors = top.length ? CH.bars(top.map((r) => ({ label: r.name, sub: r.overdue ? 'متأخر ' + SH(r.overdue) : 'غير متأخر', value: r.total, href: '#/fin/aging?c=' + r.id, color: r.overdue > r.total * 0.5 ? '#b9141b' : ERP.palette[0] })), { fmt: SH }) : SA.empty({ icon: 'users', title: 'لا توجد مستحقات' });
      const fc = forecast(30);
      const fcChart = CH.line({ labels: fc.labels, series: [{ name: 'الرصيد النقدي المتوقع', values: fc.bal, color: ERP.palette[0] }, { name: 'تحصيلات متوقعة (تراكمي)', values: fc.cin, color: '#147a3d', dashed: true }, { name: 'مدفوعات متوقعة (تراكمي)', values: fc.cout, color: '#b9141b', dashed: true }], height: 230, area: true, min: Math.min(0, fc.min, ...fc.cin), title: 'توقع السيولة' });
      const fcNote = h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'افتراضات تجريبية: تحصيل 90% من الفواتير في موعدها و60% من المتأخر خلال أسبوعين، الشيكات في تاريخ استحقاقها، فواتير الموردين وسندات الصرف المفتوحة، ومصروفات تشغيل وأجور وضرائب ثابتة ' + SH(fc.run) + ' شهريًا (متوسط آخر 3 أشهر). أقل رصيد متوقع: ', h('b.num', {}, SH(fc.min)), ' (' + fc.minLabel + ').'));
      let ins = U.insights('fin', 3); if (!ins.length) ins = localInsights().map(U.aiCard);
      return h('div.fin-page', {}, head, kpis,
        U.grid(2, SA.card({ title: 'الإيرادات مقابل التكاليف والمصروفات — 12 شهرًا' }, revExp), SA.card({ title: 'التدفق النقدي الفعلي — 6 أشهر', actions: [linkBtn('البنوك والخزائن', 'fin/banks')] }, cashChart)),
        U.grid(3, SA.card({ title: 'أعمار ديون العملاء', actions: [linkBtn('التفاصيل', 'fin/aging')] }, donut), SA.card({ title: 'أكبر المدينين' }, debtors), SA.card({ title: 'يحتاج انتباهك' }, attnList(attentionItems(), 6))),
        U.grid(2, SA.card({ title: 'توقع السيولة — 30 يومًا', tags: U.demo('تقدير') }, fcChart, fcNote), SA.card({ title: 'قائمة الدخل المختصرة', tags: canProfit() ? null : SA.chip('سري', 'neutral') }, plSnapshot(T))),
        ins.length ? SA.card({ title: 'رؤى ذكية للمالية', tags: U.demo('AI') }, h('div.erp-grid.erp-grid-3', { style: { margin: 0 } }, ins)) : null);
    }, ['invoices', 'receipts', 'cheques', 'bills', 'vouchers', 'journal', 'salesOrders', 'customers']);
  }

  /* ═════════════════════════ 2. فواتير البيع ═════════════════════════ */
  const issueAndOpen = async (soId) => { const inv = await issueInvoice(soId); if (inv) SA.nav('fin/invoices/' + inv.id); };
  function invoicesScreen(root, ctx) {
    if (ctx.path[0]) return invoiceDetail(root, ctx, ctx.path[0]);
    const so = ctx.params.so || '';
    const S0 = { tab: so || ctx.params.tab === 'ready' ? 'ready' : 'all', list: { q: ctx.params.q || '', filters: Object.assign({}, ctx.params.status ? { status: ctx.params.status } : {}, ctx.params.c ? { customer: ctx.params.c } : {}), sort: { key: 'issueDate', dir: 'desc' } }, ready: { sort: { key: 'value', dir: 'desc' } } };
    return SA.live(root, () => {
      const invs = get('invoices'); const ready = readyToInvoice();
      const m0 = invs.filter((i) => i.issueDate >= mStart(0)); const open = invs.filter((i) => invOpen(i) > 0); const over = open.filter((i) => invSt(i) === 'overdue');
      const head = SA.pageHead({ title: 'فواتير البيع', desc: 'تُصدر من الكميات المسلّمة فعليًا. النسخة المطبوعة/PDF من النظام ليست فاتورة إلكترونية معتمدة.', tags: [SA.tag('open', 'الفاتورة الإلكترونية: Open')],
        actions: [SA.btn({ label: 'سند قبض', icon: 'coins', kind: 'primary', perm: 'fin.receipts.create', onClick: () => openReceipt({}) })] });
      const kpis = kpiRow([
        { label: 'صدر هذا الشهر', value: SH(sum(m0, (i) => i.total)), sub: m0.length + ' فاتورة', icon: 'receipt' },
        { label: 'مستحقات مفتوحة', value: SH(sum(open, invOpen)), sub: open.length + ' فاتورة', icon: 'coins', href: SA.can('fin.aging.view') ? '#/fin/aging' : null },
        { label: 'متأخرة السداد', value: SH(sum(over, invOpen)), sub: over.length + ' فاتورة', icon: 'clock', tone: over.length ? 'danger' : null },
        { label: 'جاهز للفوترة', value: String(ready.length), sub: SH(sum(ready, (x) => readyValue(x).total)) + ' شامل الضريبة', icon: 'truck', tone: ready.length ? 'warning' : null }
      ]);
      const custOpts = Array.from(new Set(invs.map((i) => i.customerId))).map((id) => [id, ERP.customerName(id)]).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
      const listPanel = () => table(S0, 'list', {
        caption: 'فواتير البيع',
        columns: [
          { key: 'id', label: 'رقم الفاتورة', sort: true, render: (i) => U.docLink(i.id) },
          { key: 'customer', label: 'العميل', sort: true, value: (i) => ERP.customerName(i.customerId), render: (i) => custCell(i.customerId) },
          { key: 'soId', label: 'أمر البيع', render: (i) => (i.soId ? U.docLink(i.soId) : '—') },
          { key: 'issueDate', label: 'الإصدار', sort: true, render: (i) => fm.date(i.issueDate) },
          { key: 'dueDate', label: 'الاستحقاق', sort: true, render: (i) => dueCell(i.dueDate, invOpen(i) > 0) },
          { key: 'total', label: 'الإجمالي', sort: true, class: 'fin-r', render: (i) => M(i.total) },
          { key: 'paid', label: 'المحصّل', sort: true, class: 'fin-r', value: (i) => i.paid || 0, render: (i) => M(i.paid || 0) },
          { key: 'open', label: 'المتبقي', sort: true, class: 'fin-r', value: invOpen, render: (i) => (invOpen(i) ? h('b', {}, M(invOpen(i))) : h('span.fin-muted', {}, '—')) },
          { key: 'status', label: 'الحالة', sort: true, value: invSt, render: (i) => U.status('inv', invSt(i)) }
        ],
        rows: () => get('invoices'),
        search: { placeholder: 'بحث برقم الفاتورة أو العميل أو أمر البيع…', keys: ['id', 'soId', (i) => ERP.customerName(i.customerId)] },
        filters: [{ key: 'status', label: 'الحالة', options: [['issued', 'صادرة'], ['partial', 'مدفوعة جزئيًا'], ['overdue', 'متأخرة'], ['paid', 'مدفوعة'], ['cancelled', 'ملغاة']], test: (i, v) => invSt(i) === v },
          { key: 'customer', label: 'العميل', options: custOpts, test: (i, v) => i.customerId === v }, { key: 'period', label: 'تاريخ الإصدار', options: PERIOD_FILTER, test: (i, v) => periodMatch(i.issueDate, v) }],
        rowActions: (i) => [{ label: 'فتح الفاتورة', icon: 'eye', onClick: () => SA.nav('fin/invoices/' + i.id) },
          { label: 'تسجيل تحصيل', icon: 'coins', disabled: !SA.can('fin.receipts.create') ? 'ليست من صلاحياتك' : invOpen(i) < 1 ? 'الفاتورة مسددة' : false, onClick: () => openReceipt({ customerId: i.customerId, invoiceId: i.id }) },
          { label: 'كشف حساب العميل', icon: 'doc', hidden: !SA.can('fin.aging.view'), onClick: () => SA.nav('fin/aging?c=' + i.customerId) }],
        onRowClick: (i) => SA.nav('fin/invoices/' + i.id),
        empty: { icon: 'receipt', title: 'لا توجد فواتير', text: 'الفواتير تُصدر من «جاهز للفوترة» بعد تأكيد التسليم.' }
      }).el;
      const readyPanel = () => {
        const wrap = h('div');
        if (so) {
          const x = ERP.find('salesOrders', so);
          if (x && ready.some((r) => r.id === so)) { const t = readyValue(x); wrap.appendChild(h('div.fin-callout', {}, h('div.fin-stack', {}, h('b', {}, 'أمر البيع ' + so + ' جاهز للفوترة'), h('small', {}, ERP.customerName(x.customerId) + ' — ' + uninvoiced(x).length + ' بند مسلّم غير مفوتر · ' + fm.money(t.total) + ' شامل الضريبة')), SA.btn({ label: 'أصدر الفاتورة', icon: 'receipt', kind: 'primary', perm: 'fin.invoices.create', onClick: () => issueAndOpen(so) }))); }
          else if (x) wrap.appendChild(SA.alert('info', 'أمر البيع ' + so + ' لا يحتوي على كميات مسلّمة غير مفوترة', (x.invoiceIds || []).length ? h('span', {}, ' — فواتيره: ', x.invoiceIds.map((id, k) => [k ? '، ' : '', U.docLink(id)])) : '.'));
          else wrap.appendChild(SA.alert('warning', 'أمر البيع ' + so + ' غير موجود.'));
        }
        wrap.appendChild(table(S0, 'ready', {
          caption: 'أوامر جاهزة للفوترة',
          columns: [
            { key: 'id', label: 'أمر البيع', sort: true, render: (x) => h('div.fin-stack', {}, U.docLink(x.id), x.id === so ? h('small', { style: { color: 'var(--color-warning)', fontWeight: 700 } }, 'المحدد') : null) },
            { key: 'customer', label: 'العميل', sort: true, value: (x) => ERP.customerName(x.customerId), render: (x) => custCell(x.customerId) },
            { key: 'status', label: 'حالة الأمر', render: (x) => U.status('so', x.status) },
            { key: 'dns', label: 'أذون التسليم', render: (x) => { const dns = (x.dnIds || []).map((id) => ERP.find('deliveries', id)).filter((d) => d && d.status === 'delivered'); return dns.length ? h('div.fin-stack', {}, dns.map((d) => h('span', {}, U.docLink(d.id), ' ', h('small', {}, fm.date((d.deliveredAt || '').slice(0, 10)))))) : '—'; } },
            { key: 'lines', label: 'مسلّم غير مفوتر', render: (x) => { const l = uninvoiced(x); return h('div.fin-stack', {}, l.slice(0, 2).map((y) => h('small', {}, ERP.itemName(y.itemId) + ' × ' + fm.num(y.qty))), l.length > 2 ? h('small', {}, '+' + (l.length - 2) + ' بند') : null); } },
            { key: 'value', label: 'القيمة شامل الضريبة', sort: true, class: 'fin-r', value: (x) => readyValue(x).total, render: (x) => M(readyValue(x).total) },
            { key: 'act', label: '', render: (x) => SA.btn({ label: 'أصدر الفاتورة', icon: 'receipt', size: 'sm', kind: x.id === so ? 'primary' : 'ghost', perm: 'fin.invoices.create', onClick: () => issueAndOpen(x.id) }) }
          ],
          rows: readyToInvoice,
          search: { placeholder: 'بحث برقم الأمر أو العميل…', keys: ['id', (x) => ERP.customerName(x.customerId)] },
          empty: { icon: 'checkcircle', title: 'لا توجد أوامر بانتظار الفوترة', text: 'كل الكميات المسلّمة مفوترة. الأوامر تظهر هنا تلقائيًا بعد تأكيد التسليم.' }
        }).el);
        wrap.appendChild(h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'تُفوتر الكميات المسلّمة فقط (أذون تسليم مؤكدة). الضريبة ' + (ERP.taxIsDemo() ? '14% تجريبية — النسبة الفعلية إعداد في سياسة المالية (Open).' : pct(ERP.taxRate()) + ' من سياسة المالية.'))));
        return wrap;
      };
      const panel = h('div');
      const drawPanel = () => { SA.clear(panel); panel.appendChild(S0.tab === 'ready' ? readyPanel() : listPanel()); };
      const tabs = SA.tabs({ tabs: [{ id: 'all', label: 'كل الفواتير', icon: 'list', badge: invs.length }, { id: 'ready', label: 'جاهز للفوترة', icon: 'truck', badge: ready.length }], active: S0.tab, onChange: (t) => { S0.tab = t; drawPanel(); } });
      drawPanel();
      return h('div.fin-page', {}, head, kpis, SA.card({ flush: false }, tabs.el, h('div', { style: { marginTop: '12px' } }, panel)));
    }, ['invoices', 'salesOrders', 'receipts', 'customers', 'deliveries']);
  }
  function invoiceSheet(inv) {
    const c = ERP.customer(inv.customerId) || {};
    const gross = inv.lines.reduce((s, l) => s + l.qty * l.price, 0); const disc = Math.max(0, Math.round(gross - inv.net)); const rate = inv.net ? inv.tax / inv.net : ERP.taxRate();
    const demo = inv.taxDemo || ERP.taxIsDemo();
    return h('article.fin-a4', { 'aria-label': 'فاتورة ' + inv.id },
      a4Head('فاتورة بيع', 'Sales Invoice', inv.id, U.status('inv', invSt(inv))),
      h('div.fin-a4-meta', {},
        h('div.fin-a4-box', {}, h('h4', {}, 'العميل'), dl([['الاسم', c.name || inv.customerId], ['الكود', h('span.num', {}, c.code || inv.customerId)], ['المدينة', c.city || '—'], ['الهاتف', h('span.num', {}, ((c.contacts || [])[0] || {}).phone || '—')], ['الرقم الضريبي', c.taxId || SA.openValue('غير مسجّل')]])),
        h('div.fin-a4-box', {}, h('h4', {}, 'بيانات الفاتورة'), dl([['تاريخ الإصدار', fm.date(inv.issueDate)], ['تاريخ الاستحقاق', fm.date(inv.dueDate)], ['شروط الدفع', (c.termsDays != null ? c.termsDays + ' يوم' : '—')], ['أمر البيع', inv.soId ? U.docLink(inv.soId) : '—'], ['أذون التسليم', (inv.dnIds || []).length ? h('span', {}, inv.dnIds.map((d, k) => [k ? '، ' : '', U.docLink(d)])) : '—'], ['العملة', 'جنيه مصري (EGP)']]))),
      h('table.fin-a4-lines', {}, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'الصنف'), h('th.fin-r', {}, 'الكمية'), h('th.fin-r', {}, 'سعر الوحدة'), h('th.fin-r', {}, 'الإجمالي'))),
        h('tbody', {}, inv.lines.map((l, k) => { const it = ERP.item(l.itemId) || {}; return h('tr', {}, h('td.num', {}, k + 1), h('td', {}, U.itemCell(l.itemId)), h('td.fin-r', {}, fm.qty(l.qty, it.uom)), h('td.fin-r', {}, M(l.price)), h('td.fin-r', {}, M(l.qty * l.price))); }))),
      h('div.fin-a4-tot', {}, h('div.fin-a4-words', {}, h('b', {}, 'المبلغ بالحروف: '), amountWords(inv.total)),
        h('table', {}, h('tbody', {},
          h('tr', {}, h('td', {}, 'الإجمالي قبل الخصم'), h('td', {}, M(gross))),
          inv.discountPct ? h('tr', {}, h('td', {}, 'الخصم (' + inv.discountPct + '%)'), h('td', {}, '− ', M(disc))) : null,
          h('tr', {}, h('td', {}, 'الصافي قبل الضريبة'), h('td', {}, M(inv.net))),
          h('tr', {}, h('td', {}, 'ضريبة القيمة المضافة (' + pct(rate) + ') ', demo ? U.demo('تجريبي') : null), h('td', {}, M(inv.tax))),
          h('tr.is-grand', {}, h('td', {}, 'الإجمالي المستحق'), h('td', {}, M(inv.total))),
          h('tr', {}, h('td', {}, 'المحصّل'), h('td', {}, M(inv.paid || 0))),
          h('tr', {}, h('td', {}, h('b', {}, 'المتبقي')), h('td', {}, h('b', {}, M(invOpen(inv)))))))),
      h('footer.fin-a4-foot', {}, h('span.fin-a4-warn', {}, SA.icon('alert', 'icon-sm'), 'هذه ليست فاتورة إلكترونية معتمدة'),
        h('span', {}, 'نسخة مطبوعة من النظام للاستخدام الداخلي ومرافقة البضاعة. إصدار الفاتورة الإلكترونية والربط مع منظومة مصلحة الضرائب: Open — التنفيذ مؤجل.'),
        demo ? h('span', {}, 'نسبة ضريبة القيمة المضافة وطريقة عرضها إعداد في سياسة المالية (Open) — المعروض 14% قيمة تجريبية.') : null,
        h('span', {}, 'أصدرها: ' + who(inv.createdBy) + ' · طُبعت من نظام المصرية الألمانية (نموذج تجريبي)'),
        h('div.fin-a4-sign', {}, h('div', {}, 'المحاسب'), h('div', {}, 'المراجعة'), h('div', {}, 'توقيع واستلام العميل'))));
  }
  function invoiceDetail(root, ctx, id) {
    ctx.setCrumbs([{ label: 'المبيعات والتحصيل' }, { label: 'فواتير البيع', href: '#/fin/invoices' }, { label: id }]);
    return SA.live(root, () => {
      const inv = ERP.find('invoices', id);
      if (!inv) return h('div', {}, SA.pageHead({ title: 'فاتورة غير موجودة', back: { label: 'فواتير البيع', href: '#/fin/invoices' } }), SA.empty({ icon: 'receipt', title: 'الفاتورة غير موجودة', text: id }));
      const status = invSt(inv); const open = invOpen(inv); const c = ERP.customer(inv.customerId) || {};
      const sheet = invoiceSheet(inv);
      const recs = get('receipts').filter((r) => r.invoiceId === inv.id).sort((a, b) => (a.date < b.date ? -1 : 1));
      const head = SA.pageHead({ title: 'فاتورة ' + inv.id, desc: ERP.customerName(inv.customerId) + ' · صدرت ' + fm.date(inv.issueDate) + ' · تستحق ' + fm.date(inv.dueDate), tags: [U.status('inv', status)], back: { label: 'فواتير البيع', href: '#/fin/invoices' },
        actions: [SA.btn({ label: 'طباعة / PDF', icon: 'download', kind: 'ghost', onClick: () => printNode(sheet, 'فاتورة ' + inv.id) }), SA.can('fin.aging.view') ? SA.btn({ label: 'كشف حساب العميل', icon: 'doc', kind: 'ghost', onClick: () => SA.nav('fin/aging?c=' + inv.customerId) }) : null,
          SA.btn({ label: 'تسجيل تحصيل', icon: 'coins', kind: 'primary', perm: 'fin.receipts.create', reason: SA.can('fin.receipts.create') ? (status === 'cancelled' ? 'الفاتورة ملغاة' : open < 1 ? 'الفاتورة مسددة بالكامل' : null) : null, onClick: () => openReceipt({ customerId: inv.customerId, invoiceId: inv.id }) })] });
      const payCard = SA.card({ title: 'التحصيلات', tags: SA.chip(recs.length, 'neutral') },
        CH.meter(inv.total ? (inv.paid || 0) / inv.total : 0, { label: 'نسبة التحصيل', text: pct(inv.total ? (inv.paid || 0) / inv.total : 0), tone: open < 1 ? 'success' : status === 'overdue' ? 'danger' : 'primary' }),
        recs.length ? h('ul.fin-mini', { style: { marginTop: '8px' } }, recs.map((r) => { const ch = r.chequeId ? ERP.find('cheques', r.chequeId) : null; return h('li', {}, h('div.fin-stack', {}, h('a.erp-doc', { href: '#/fin/receipts?q=' + r.id }, r.id), h('small', {}, fm.date(r.date) + ' · ' + (METHOD[r.method] || r.method) + (ch ? ' ' + ch.no : ''))), h('div.fin-stack', { style: { alignItems: 'flex-end' } }, M(r.amount), ch ? U.status('cheque', ch.status) : null)); })) : h('p.fin-muted', { style: { marginTop: '8px' } }, 'لا توجد تحصيلات بعد.'),
        h('div.fin-totals', {}, h('span', {}, 'المحصّل ', h('b.num', {}, fm.money(inv.paid || 0))), h('span', {}, 'المتبقي ', h('b.num', {}, fm.money(open)))));
      const je = jeOf(inv.id);
      const glCard = SA.card({ title: 'القيد المحاسبي' }, je ? h('div', {}, h('p', { style: { margin: '0 0 6px' } }, U.docLink(je.id), ' ', h('small.fin-muted', {}, fm.date(je.date))), h('ul.fin-mini', {}, je.lines.map((l) => h('li', {}, h('span', {}, h('span.num', {}, l.acc), ' ', GL.accName(l.acc)), h('b.num', {}, l.dr ? 'مدين ' + fm.num(l.dr) : 'دائن ' + fm.num(l.cr)))))) : h('p.fin-muted', { style: { margin: 0 } }, 'مُرحّلة ضمن قيد المبيعات المجمّع الشهري (بيانات تاريخية للنموذج).'));
      const custCard = SA.card({ title: 'العميل' }, SA.kv([['العميل', c.name || inv.customerId], ['الرصيد الحالي', M(c.balance || 0)], ['حد الائتمان', c.creditLimit ? M(c.creditLimit) : h('span.fin-muted', {}, 'نقدي / بدون حد')], ['شروط الدفع', c.termsDays != null ? c.termsDays + ' يوم' : '—'],
        (c.reviewNotes || []).length ? ['المراجعة', h('span', {}, SA.chip('تحت المراجعة', 'warning'), h('small.fin-muted', {}, ' بلا إيقاف تلقائي (بند 41)'))] : null]));
      return h('div.fin-page', {}, head,
        h('div.fin-doc-wrap', {}, h('div', {}, sheet), h('div.fin-side', {}, payCard, custCard, glCard)),
        inv.soId ? SA.card({ title: 'دورة المستند — ' + inv.soId, class: 'fin-chain-card' }, U.chain(inv.soId)) : null);
    }, ['invoices', 'receipts', 'cheques', 'customers', 'journal']);
  }

  /* ═════════════════════════ 3. سندات القبض ═════════════════════════ */
  function receiptDrawer(id) {
    const rv = ERP.find('receipts', id); if (!rv) return;
    const ch = rv.chequeId ? ERP.find('cheques', rv.chequeId) : null; const je = jeOf(rv.id); const inv = rv.invoiceId ? ERP.find('invoices', rv.invoiceId) : null;
    let d = null;
    const go = (r) => () => { if (d) d.close(); SA.nav(r); };
    const body = h('div.fin-form', {},
      SA.kv([['رقم السند', h('b.num', {}, rv.id)], ['التاريخ', fm.date(rv.date)], ['العميل', (rv.payer || ERP.customerName(rv.customerId))], ['المبلغ', M(rv.amount)], ['بالحروف', amountWords(rv.amount)], ['التخصيص', inv ? U.docLink(inv.id) : rv.source && rv.source.type === 'scrap_sale' ? h('span', {}, 'بيع هوالك ', U.docLink(rv.source.id)) : 'دفعة تحت الحساب'], ['طريقة الدفع', METHOD[rv.method] || rv.method],
        ['الحساب المدين', accLabel(rv.account)], ['القيد', je ? U.docLink(je.id) : h('span.fin-muted', {}, 'ضمن قيد التحصيلات المجمّع الشهري (بيانات تاريخية)')], ['سجّله', who(rv.by)], rv.note ? ['ملاحظة', rv.note] : null]),
      ch ? h('div', {}, sectionTitle('الشيك ' + ch.id, U.status('cheque', ch.status)), SA.kv([['رقم الشيك', h('span.num', {}, ch.no)], ['البنك المسحوب عليه', ch.bank], ['الاستحقاق', fm.date(ch.dueDate)], ch.bankAcc ? ['حُصّل في', accLabel(ch.bankAcc)] : null]),
        h('ul.fin-timeline', { style: { marginTop: '10px' } }, (ch.history || []).map((x) => h('li', {}, h('i'), h('span', {}, U.status('cheque', x.status), ' ', SA.fmt.dt(x.at), ' — ', who(x.by)))))) : null);
    d = SA.drawer({ title: 'سند قبض ' + rv.id, subtitle: (rv.payer || ERP.customerName(rv.customerId)) + ' · ' + fm.money(rv.amount), body,
      foot: [inv ? SA.btn({ label: 'فتح الفاتورة', kind: 'ghost', icon: 'receipt', onClick: go('fin/invoices/' + inv.id) }) : null, ch ? SA.btn({ label: 'سجل الشيكات', kind: 'ghost', icon: 'doc', onClick: go('fin/cheques?q=' + ch.id) }) : null, SA.can('fin.aging.view') ? SA.btn({ label: 'كشف حساب العميل', kind: 'ghost', icon: 'users', onClick: go('fin/aging?c=' + rv.customerId) }) : null] });
  }
  function receiptsScreen(root, ctx) {
    const S0 = { list: { q: ctx.params.q || '', sort: { key: 'date', dir: 'desc' } } };
    return SA.live(root, () => {
      const rc = get('receipts'); const m0 = rc.filter((r) => r.date >= mStart(0));
      const inHand = get('cheques').filter((c) => c.status === 'received' || c.status === 'under_collection');
      const unapplied = rc.filter((r) => !r.invoiceId);
      const head = SA.pageHead({ title: 'سندات القبض', desc: 'كل تحصيل يُرحّل قيده تلقائيًا ويحدّث الفاتورة ورصيد العميل. الشيكات تدخل أوراق القبض حتى تحصيلها.', actions: [SA.btn({ label: 'سند قبض جديد', icon: 'plus', kind: 'primary', perm: 'fin.receipts.create', onClick: () => openReceipt({}) })] });
      const kpis = kpiRow([
        { label: 'تحصيلات الشهر', value: SH(sum(m0, (r) => r.amount)), sub: m0.length + ' سند', icon: 'coins', tone: 'success' },
        { label: 'متوسط السند (الشهر)', value: SH(m0.length ? sum(m0, (r) => r.amount) / m0.length : 0), sub: 'نقدي ' + m0.filter((r) => r.method === 'cash').length + ' · تحويل ' + m0.filter((r) => r.method === 'transfer').length + ' · شيك ' + m0.filter((r) => r.method === 'cheque').length, icon: 'activity' },
        { label: 'شيكات في الحافظة وتحت التحصيل', value: SH(sum(inHand, (c) => c.amount)), sub: inHand.length + ' شيك', icon: 'doc', href: '#/fin/cheques' },
        { label: 'دفعات تحت الحساب', value: SH(sum(unapplied, (r) => r.amount)), sub: unapplied.length + ' سند غير مخصص لفاتورة', icon: 'inbox' }
      ]);
      const k6 = ERP.monthKeys(6); const meths = methodsEnabled(); const colors = { cash: '#c9a227', transfer: ERP.palette[0], cheque: '#7d9cd1', card: '#147a3d' };
      const chart = CH.columns({ labels: k6.map(shortMonth), stacked: true, height: 200, series: meths.map((m) => ({ name: METHOD[m], color: colors[m], values: k6.map((k) => { const r = keyRange(k); return sum(rc.filter((x) => x.method === m && x.date >= r.from && x.date <= r.to), (x) => x.amount); }) })), legend: true, title: 'التحصيلات حسب الطريقة' });
      const accOpts = get('banks').map((b) => [b.acc, b.name]).concat([['1121', 'أوراق القبض (شيكات)']]);
      const t = table(S0, 'list', {
        caption: 'سندات القبض',
        columns: [
          { key: 'id', label: 'السند', sort: true, render: (r) => h('b.num', {}, r.id) },
          { key: 'date', label: 'التاريخ', sort: true, render: (r) => fm.date(r.date) },
          { key: 'customer', label: 'العميل', sort: true, value: (r) => r.payer || ERP.customerName(r.customerId), render: (r) => (r.payer ? h('div.fin-stack', {}, h('b', {}, r.payer), h('small', {}, r.source && r.source.type === 'scrap_sale' ? 'بيع هوالك ' + r.source.id : 'إيراد متنوع')) : custCell(r.customerId)) },
          { key: 'invoiceId', label: 'الفاتورة', render: (r) => (r.invoiceId ? U.docLink(r.invoiceId) : SA.chip('تحت الحساب', 'neutral')) },
          { key: 'method', label: 'الطريقة', sort: true, render: (r) => { const ch = r.chequeId ? ERP.find('cheques', r.chequeId) : null; return h('div.fin-stack', {}, h('span', {}, METHOD[r.method] || r.method), ch ? h('span', {}, U.status('cheque', ch.status)) : null); } },
          { key: 'account', label: 'الحساب', render: (r) => h('small', {}, accLabel(r.account)) },
          { key: 'amount', label: 'المبلغ', sort: true, class: 'fin-r', render: (r) => M(r.amount) },
          { key: 'by', label: 'سجّله', render: (r) => h('small', {}, who(r.by)) }
        ],
        rows: () => get('receipts'),
        search: { placeholder: 'بحث برقم السند أو العميل أو الفاتورة أو رقم الشيك…', keys: ['id', 'invoiceId', 'chequeId', (r) => r.payer || ERP.customerName(r.customerId), (r) => { const c = r.chequeId && ERP.find('cheques', r.chequeId); return c ? c.no : ''; }] },
        filters: [{ key: 'method', label: 'الطريقة', options: Object.keys(METHOD).map((k) => [k, METHOD[k]]) }, { key: 'period', label: 'الفترة', options: PERIOD_FILTER, test: (r, v) => periodMatch(r.date, v) }, { key: 'account', label: 'الحساب', options: accOpts }, { key: 'applied', label: 'التخصيص', options: [['inv', 'على فاتورة'], ['onacc', 'تحت الحساب']], test: (r, v) => (v === 'inv' ? !!r.invoiceId : !r.invoiceId) }],
        rowActions: (r) => [{ label: 'التفاصيل', icon: 'eye', onClick: () => receiptDrawer(r.id) }, r.invoiceId ? { label: 'فتح الفاتورة', icon: 'receipt', onClick: () => SA.nav('fin/invoices/' + r.invoiceId) } : null, r.chequeId ? { label: 'الشيك في السجل', icon: 'doc', onClick: () => SA.nav('fin/cheques?q=' + r.chequeId) } : null].filter(Boolean),
        onRowClick: (r) => receiptDrawer(r.id),
        empty: { icon: 'coins', title: 'لا توجد سندات قبض', text: 'سجّل أول تحصيل من زر «سند قبض جديد».' }
      });
      return h('div.fin-page', {}, head, kpis, U.grid(2, SA.card({ title: 'التحصيلات حسب الطريقة — 6 أشهر' }, chart), SA.card({ title: 'آخر التحصيلات' }, h('ul.fin-mini', {}, rc.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6).map((r) => h('li', {}, h('div.fin-stack', {}, h('b', {}, ERP.customerName(r.customerId)), h('small', {}, r.id + ' · ' + fm.date(r.date) + ' · ' + (METHOD[r.method] || r.method))), M(r.amount)))))), SA.card({ flush: false }, t.el));
    }, ['receipts', 'cheques', 'invoices']);
  }

  /* ═════════════════════════ 4. الشيكات ═════════════════════════ */
  const DOW = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function chequesScreen(root, ctx) {
    const S0 = { list: { q: ctx.params.q || '', sort: { key: 'dueDate', dir: 'asc' }, filters: ctx.params.q ? {} : { status: ctx.params.status || 'open' } } };
    return SA.live(root, () => {
      const chq = get('cheques'); const t = today(); const t7 = addDays(t, 7);
      const isOpen = (c) => c.status === 'received' || c.status === 'under_collection';
      const recv = chq.filter((c) => c.status === 'received'), coll = chq.filter((c) => c.status === 'under_collection'), bounced = chq.filter((c) => c.status === 'bounced');
      const wk = chq.filter((c) => isOpen(c) && c.dueDate >= t && c.dueDate <= t7); const late = chq.filter((c) => isOpen(c) && c.dueDate < t);
      const head = SA.pageHead({ title: 'سجل الشيكات', desc: 'دورة الشيك (بند 39): مستلم ← تحت التحصيل ← محصّل / مرتد / ملغى. الارتداد ينبّه المالية والمبيعات للمراجعة — بدون إيقاف تلقائي للعميل (بند 41).', tags: [SA.tag('approved', 'بند 39 · بند 41')] });
      const kpis = kpiRow([
        { label: 'في الحافظة (مستلم)', value: SH(sum(recv, (c) => c.amount)), sub: recv.length + ' شيك', icon: 'inbox' },
        { label: 'تحت التحصيل', value: SH(sum(coll, (c) => c.amount)), sub: coll.length + ' شيك في البنوك', icon: 'upload', tone: 'warning' },
        { label: 'تستحق خلال 7 أيام', value: SH(sum(wk, (c) => c.amount)), sub: wk.length + ' شيك' + (late.length ? ' · ' + late.length + ' تجاوزت الاستحقاق' : ''), icon: 'calendar', tone: late.length ? 'warning' : null },
        { label: 'مرتدة', value: String(bounced.length), sub: SH(sum(bounced, (c) => c.amount)) + ' · للمراجعة', icon: 'alert', tone: bounced.length ? 'danger' : 'success' }
      ]);
      const days = []; for (let d = 0; d < 14; d++) days.push(addDays(t, d));
      const cal = h('div.fin-cal', {}, days.map((d) => { const list = chq.filter((c) => isOpen(c) && c.dueDate === d); const dt = new Date(d + 'T12:00:00');
        return h('div.fin-cal-day' + (d === t ? '.is-today' : '') + (!list.length ? '.is-empty' : ''), {}, h('header', {}, h('span', {}, DOW[dt.getDay()]), h('span.num', {}, ddmm(d))),
          list.slice(0, 3).map((c) => h('a.fin-cal-chq' + (c.status === 'under_collection' ? '.is-warning' : ''), { href: '#/fin/cheques?q=' + c.id, title: ERP.customerName(c.customerId) + ' — ' + fm.money(c.amount) + ' — ' + SA.catalog.status.cheque[c.status][0] }, h('span.num', {}, SH(c.amount)))),
          list.length > 3 ? h('small', {}, '+' + (list.length - 3) + ' شيك') : null, list.length ? h('small.fin-muted', {}, 'إجمالي ' + SH(sum(list, (c) => c.amount))) : null); }));
      const lateBox = late.length ? SA.alert('warning', h('b', {}, late.length + ' شيك تجاوز تاريخ الاستحقاق ولم يُحصّل: '), late.slice(0, 5).map((c, k) => [k ? '، ' : '', h('a.erp-doc', { href: '#/fin/cheques?q=' + c.id }, c.no), ' (' + ERP.customerName(c.customerId) + ')'])) : null;
      const bouncedCard = bounced.length ? SA.card({ title: 'شيكات مرتدة — مراجعة العملاء', tags: SA.chip(String(bounced.length), 'danger') },
        SA.alert('danger', 'التنبيه وصل للمالية والمبيعات. لا يوجد إيقاف تلقائي للعميل (بند 41) — يتحول الحساب للمراجعة ويُتخذ القرار بعد التواصل.'),
        h('ul.fin-mini', {}, bounced.map((c) => { const cu = ERP.customer(c.customerId) || {}; const n = (cu.reviewNotes || []).length;
          return h('li', {}, h('div.fin-stack', {}, h('b', {}, ERP.customerName(c.customerId)), h('small', {}, 'شيك ' + c.no + ' — ' + c.bank + ' · استحقاق ' + fm.date(c.dueDate) + (n ? ' · ' + n + ' ملاحظة مراجعة' : ' · لا توجد ملاحظة مراجعة بعد'))),
            h('div.fin-inline', {}, M(c.amount), SA.btn({ label: 'ملاحظة مراجعة', size: 'sm', kind: 'ghost', icon: 'note', perm: 'fin.cheques.edit', onClick: () => reviewNote(c.customerId, c.id) }), SA.can('fin.aging.view') ? SA.btn({ label: 'كشف الحساب', size: 'sm', kind: 'ghost', icon: 'doc', onClick: () => SA.nav('fin/aging?c=' + c.customerId) }) : null)); }))) : null;
      const tbl = table(S0, 'list', {
        caption: 'سجل الشيكات',
        columns: [
          { key: 'id', label: 'المرجع', sort: true, render: (c) => h('div.fin-stack', {}, h('b.num', {}, c.id), c.receiptId ? h('a.erp-doc', { href: '#/fin/receipts?q=' + c.receiptId, style: { fontSize: '11.5px' } }, c.receiptId) : null) },
          { key: 'no', label: 'رقم الشيك / البنك', sort: true, render: (c) => h('div.fin-stack', {}, h('b.num', {}, c.no), h('small', {}, c.bank)) },
          { key: 'customer', label: 'العميل', sort: true, value: (c) => ERP.customerName(c.customerId), render: (c) => { const cu = ERP.customer(c.customerId) || {}; return h('div.fin-stack', {}, h('b', {}, ERP.customerName(c.customerId)), c.status === 'bounced' || (cu.reviewNotes || []).length ? h('span', {}, SA.chip('مراجعة الحساب — بلا إيقاف', 'warning')) : h('small.num', {}, cu.code || '')); } },
          { key: 'amount', label: 'المبلغ', sort: true, class: 'fin-r', render: (c) => (c.status === 'bounced' ? h('b', { style: { color: 'var(--color-danger)' } }, M(c.amount)) : M(c.amount)) },
          { key: 'dueDate', label: 'الاستحقاق', sort: true, render: (c) => dueCell(c.dueDate, isOpen(c)) },
          { key: 'status', label: 'الحالة', sort: true, render: (c) => U.status('cheque', c.status) },
          { key: 'next', label: 'الإجراء التالي', render: (c) => { const nx = chequeNext(c); if (c.status === 'bounced') return SA.btn({ label: 'ملاحظة مراجعة', icon: 'note', size: 'sm', kind: 'ghost', perm: 'fin.cheques.edit', onClick: () => reviewNote(c.customerId, c.id) }); return nx.length ? h('div.fin-inline', {}, nx.map((x) => SA.btn({ label: x[1], icon: x[2], size: 'sm', kind: x[0] === 'bounced' ? 'danger' : 'ghost', perm: 'fin.cheques.edit', onClick: () => chequeAction(c.id, x[0]) }))) : h('small.fin-muted', {}, (c.history || []).length ? SA.fmt.rel(c.history[c.history.length - 1].at) : '—'); } }
        ],
        rows: () => get('cheques'),
        search: { placeholder: 'بحث برقم الشيك أو المرجع أو العميل أو البنك…', keys: ['id', 'no', 'bank', 'receiptId', (c) => ERP.customerName(c.customerId)] },
        filters: [{ key: 'status', label: 'الحالة', options: [['open', 'مستلم + تحت التحصيل'], ['received', 'مستلم'], ['under_collection', 'تحت التحصيل'], ['collected', 'محصّل'], ['bounced', 'مرتد'], ['cancelled', 'ملغى']], test: (c, v) => (v === 'open' ? isOpen(c) : c.status === v) },
          { key: 'due', label: 'الاستحقاق', options: [['late', 'تجاوز الاستحقاق'], ['week', 'خلال 7 أيام'], ['month', 'خلال 30 يومًا'], ['later', 'بعد 30 يومًا']], test: (c, v) => (v === 'late' ? c.dueDate < t : v === 'week' ? c.dueDate >= t && c.dueDate <= t7 : v === 'month' ? c.dueDate >= t && c.dueDate <= addDays(t, 30) : c.dueDate > addDays(t, 30)) }],
        rowActions: (c) => {
          const can = SA.can('fin.cheques.edit') ? false : 'ليست من صلاحياتك';
          const acts = chequeNext(c).map((x) => ({ label: x[1], icon: x[2], danger: x[0] === 'bounced', disabled: can, onClick: () => chequeAction(c.id, x[0]) }));
          if (c.status === 'received') acts.push({ label: 'إلغاء الشيك', icon: 'x', danger: true, disabled: can, onClick: () => chequeAction(c.id, 'cancelled') });
          if (c.status === 'bounced') acts.push({ label: 'ملاحظة مراجعة للعميل', icon: 'note', disabled: can, onClick: () => reviewNote(c.customerId, c.id) });
          acts.push({ divider: true }, { label: 'سند القبض', icon: 'coins', hidden: !c.receiptId, onClick: () => SA.nav('fin/receipts?q=' + c.receiptId) }, { label: 'كشف حساب العميل', icon: 'doc', hidden: !SA.can('fin.aging.view'), onClick: () => SA.nav('fin/aging?c=' + c.customerId) });
          return acts;
        },
        empty: { icon: 'doc', title: 'لا توجد شيكات', text: 'الشيكات تُسجَّل من سند القبض بطريقة «شيك».' }
      });
      return h('div.fin-page', {}, head, kpis, bouncedCard, SA.card({ title: 'استحقاقات الأسبوعين القادمين', tags: h('small.fin-muted', {}, 'الشيكات المستلمة وتحت التحصيل') }, lateBox, cal), SA.card({ flush: false }, tbl.el));
    }, ['cheques', 'customers', 'receipts']);
  }

  /* ═════════════════════════ 5. أعمار الديون + كشف الحساب ═════════════════════════ */
  const SEG = { dealer: 'تاجر', contractor: 'مقاول', direct: 'مباشر', export: 'تصدير', project: 'مشروع' };
  function agingScreen(root, ctx) {
    if (ctx.params.c) return soaScreen(root, ctx, ctx.params.c);
    const S0 = { list: { sort: { key: 'total', dir: 'desc' } } };
    return SA.live(root, () => {
      const rows = arByCustomer(); const t = arTotals(rows);
      const head = SA.pageHead({ title: 'أعمار ديون العملاء', desc: 'المستحقات المفتوحة حسب أيام التأخير عن تاريخ الاستحقاق. اضغط على العميل لكشف الحساب.', tags: [SA.tag('approved', 'بند 41')] });
      const kpis = kpiRow([{ label: 'إجمالي المستحقات', value: SH(t.total), sub: rows.length + ' عميل', icon: 'coins', tone: 'primary' }].concat(BK.map((b) => ({ label: b[1], value: SH(t[b[0]]), sub: pct(t.total ? t[b[0]] / t.total : 0) + ' من الإجمالي', tone: b[0] === 'b90p' && t.b90p ? 'danger' : b[0] === 'b90' && t.b90 ? 'warning' : null }))));
      const donut = t.total ? CH.donut(BK.map((b) => ({ label: b[1], value: t[b[0]], color: b[2] })), { center: SH(t.total).replace(' ج.م', ''), sub: 'ج.م', fmt: SH, title: 'توزيع الأعمار' }) : SA.empty({ icon: 'checkcircle', title: 'لا توجد مستحقات' });
      const worst = rows.filter((r) => r.overdue > 0).sort((a, b) => b.overdue - a.overdue).slice(0, 7);
      const bars = worst.length ? CH.bars(worst.map((r) => ({ label: r.name, sub: 'أقدم تأخير ' + r.maxDays + ' يوم', value: r.overdue, href: '#/fin/aging?c=' + r.id, color: r.maxDays > 60 ? '#b9141b' : '#a85a00' })), { fmt: SH }) : SA.empty({ icon: 'checkcircle', title: 'لا يوجد عملاء متأخرون' });
      const cell = (k) => (r) => (r[k] ? h('span', { style: k === 'b90p' || k === 'b90' ? { color: 'var(--color-danger)', fontWeight: 600 } : null }, M(r[k])) : h('span.fin-muted', {}, '—'));
      const tbl = table(S0, 'list', {
        caption: 'أعمار الديون حسب العميل',
        columns: [
          { key: 'name', label: 'العميل', sort: true, render: (r) => h('div.fin-stack', {}, h('b', {}, r.name), h('small', {}, (SEG[r.segment] || r.segment || '') + ' · ' + r.count + ' فاتورة مفتوحة')) },
          { key: 'limit', label: 'حد الائتمان', sort: true, class: 'fin-r', render: (r) => (r.limit ? h('div.fin-stack', {}, M(r.limit), h('small', {}, 'استخدام ' + pct(r.total / r.limit))) : h('span.fin-muted', {}, 'نقدي')) }]
          .concat(BK.map((b) => ({ key: b[0], label: b[1], sort: true, class: 'fin-r', render: cell(b[0]) })))
          .concat([{ key: 'total', label: 'الإجمالي', sort: true, class: 'fin-r', render: (r) => h('b', {}, M(r.total)) },
            { key: 'state', label: 'الحالة', value: (r) => (r.over ? 2 : r.maxDays > 90 ? 3 : r.overdue ? 1 : 0), sort: true, render: (r) => h('div.fin-inline', {}, r.maxDays > 90 ? SA.chip('متأخر +90', 'danger') : r.overdue ? SA.chip('متأخر', 'warning') : SA.chip('منتظم', 'success'), r.over ? SA.chip('تجاوز الحد', 'warning') : null, r.review ? SA.chip('تحت المراجعة', 'info') : null) }]),
        rows: arByCustomer,
        search: { placeholder: 'بحث باسم العميل…', keys: ['name', 'id'] },
        filters: [{ key: 'segment', label: 'الشريحة', options: Object.keys(SEG).map((k) => [k, SEG[k]]) }, { key: 'flag', label: 'الحالة', options: [['overdue', 'عليه متأخرات'], ['p60', 'متأخر أكثر من 60 يومًا'], ['over', 'تجاوز حد الائتمان'], ['review', 'تحت المراجعة'], ['ok', 'منتظم']], test: (r, v) => (v === 'overdue' ? r.overdue > 0 : v === 'p60' ? r.maxDays > 60 : v === 'over' ? r.over : v === 'review' ? r.review : r.overdue === 0) }],
        onRowClick: (r) => SA.nav('fin/aging?c=' + r.id),
        rowActions: (r) => [{ label: 'كشف الحساب', icon: 'doc', onClick: () => SA.nav('fin/aging?c=' + r.id) }, { label: 'فواتير العميل', icon: 'receipt', hidden: !SA.can('fin.invoices.view'), onClick: () => SA.nav('fin/invoices?c=' + r.id) }, { label: 'تسجيل تحصيل', icon: 'coins', disabled: SA.can('fin.receipts.create') ? false : 'ليست من صلاحياتك', onClick: () => openReceipt({ customerId: r.id }) }],
        empty: { icon: 'checkcircle', title: 'لا توجد مستحقات مفتوحة', text: 'كل الفواتير مسددة.' }
      });
      const totals = h('div.fin-totals', {}, h('b', {}, 'الإجماليات:'), BK.map((b) => h('span', {}, b[1], ' ', h('b.num', {}, fm.money(t[b[0]])))), h('span', {}, 'الإجمالي ', h('b.num', {}, fm.money(t.total))));
      return h('div.fin-page', {}, head, SA.alert('info', h('b', {}, 'بند 41: '), 'التأخير يولّد تنبيهًا ومراجعة من المالية والمبيعات فقط — لا يوجد إيقاف تلقائي للعميل أو لطلباته.'), kpis,
        U.grid(2, SA.card({ title: 'توزيع المستحقات حسب العمر' }, donut), SA.card({ title: 'أكثر العملاء تأخرًا (المتأخر فقط)' }, bars)), SA.card({ flush: false }, tbl.el, totals));
    }, ['invoices', 'receipts', 'customers', 'cheques']);
  }
  function soaEvents(cid) {
    const ev = [];
    get('invoices').filter((i) => i.customerId === cid && i.status !== 'cancelled' && i.status !== 'draft').forEach((i) => ev.push({ date: i.issueDate, doc: i.id, desc: 'فاتورة بيع' + (i.soId ? ' — أمر ' + i.soId : ''), dr: i.total, cr: 0 }));
    get('receipts').filter((r) => r.customerId === cid).forEach((r) => { const ch = r.chequeId ? ERP.find('cheques', r.chequeId) : null; ev.push({ date: r.date, doc: r.id, desc: 'سند قبض — ' + (METHOD[r.method] || r.method) + (ch ? ' رقم ' + ch.no : '') + (r.invoiceId ? ' (' + r.invoiceId + ')' : ' (تحت الحساب)'), dr: 0, cr: r.amount }); });
    get('cheques').filter((c) => c.customerId === cid && (c.status === 'bounced' || c.reversed)).forEach((c) => { const st0 = c.status === 'bounced' ? 'bounced' : 'cancelled'; const hh = (c.history || []).find((x) => x.status === st0); ev.push({ date: hh ? ds(new Date(hh.at)) : c.dueDate, doc: c.id, desc: (c.status === 'bounced' ? 'شيك مرتد رقم ' : 'إلغاء شيك رقم ') + c.no + ' — ' + c.bank, dr: c.amount, cr: 0 }); });
    return ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.dr && !b.dr ? -1 : !a.dr && b.dr ? 1 : 0));
  }
  function soaRows(cid, from, to) {
    const ev = soaEvents(cid); let opening = 0; ev.forEach((e) => { if (e.date < from) opening += e.dr - e.cr; });
    let bal = opening; const rows = []; ev.filter((e) => e.date >= from && e.date <= to).forEach((e) => { bal += e.dr - e.cr; rows.push(Object.assign({}, e, { bal })); });
    return { opening, rows, closing: bal, dr: sum(rows, (r) => r.dr), cr: sum(rows, (r) => r.cr) };
  }
  function soaSheet(c, from, to) {
    const s = soaRows(c.id, from, to); const inv = get('invoices').filter((i) => i.customerId === c.id && invOpen(i) > 0); const ag = {}; BK.forEach((b) => { ag[b[0]] = 0; }); inv.forEach((i) => { ag[bucketOf(i.dueDate)] += invOpen(i); });
    const money = (n) => h('span.num', {}, fm.num(Math.round(n)));
    return h('article.fin-a4', { 'aria-label': 'كشف حساب ' + c.name },
      a4Head('كشف حساب عميل', 'Statement of Account', c.code || c.id, h('small', {}, 'من ' + fm.date(from) + ' إلى ' + fm.date(to))),
      h('div.fin-a4-meta', {},
        h('div.fin-a4-box', {}, h('h4', {}, 'العميل'), dl([['الاسم', c.name], ['الكود', h('span.num', {}, c.code || c.id)], ['المدينة', c.city || '—'], ['حد الائتمان', c.creditLimit ? fm.money(c.creditLimit) : 'نقدي'], ['شروط الدفع', c.termsDays != null ? c.termsDays + ' يوم' : '—']])),
        h('div.fin-a4-box', {}, h('h4', {}, 'ملخص الفترة'), dl([['الرصيد الافتتاحي', fm.money(s.opening)], ['إجمالي المدين', fm.money(s.dr)], ['إجمالي الدائن', fm.money(s.cr)], ['الرصيد الختامي', h('b', {}, fm.money(s.closing))], ['منها متأخر', fm.money(sum(inv.filter((i) => bucketOf(i.dueDate) !== 'cur'), invOpen))]]))),
      h('table.fin-a4-lines', {}, h('thead', {}, h('tr', {}, h('th', {}, 'التاريخ'), h('th', {}, 'المستند'), h('th', {}, 'البيان'), h('th.fin-r', {}, 'مدين'), h('th.fin-r', {}, 'دائن'), h('th.fin-r', {}, 'الرصيد'))),
        h('tbody', {}, h('tr.is-sum', {}, h('td', {}, fm.date(from)), h('td', {}, '—'), h('td', {}, 'رصيد افتتاحي'), h('td'), h('td'), h('td.fin-r', {}, money(s.opening))),
          s.rows.length ? s.rows.map((r) => h('tr', {}, h('td', {}, fm.date(r.date)), h('td', {}, U.docLink(r.doc)), h('td', {}, r.desc), h('td.fin-r', {}, r.dr ? money(r.dr) : ''), h('td.fin-r', {}, r.cr ? money(r.cr) : ''), h('td.fin-r', {}, money(r.bal)))) : h('tr', {}, h('td', { colspan: 6, style: { textAlign: 'center', color: '#666' } }, 'لا توجد حركات في الفترة')),
          h('tr.is-sum', {}, h('td', {}, fm.date(to)), h('td', {}, '—'), h('td', {}, 'الإجمالي والرصيد الختامي'), h('td.fin-r', {}, money(s.dr)), h('td.fin-r', {}, money(s.cr)), h('td.fin-r', {}, money(s.closing))))),
      h('div.fin-a4-tot', {}, h('div.fin-a4-words', {}, h('b', {}, 'الرصيد الختامي بالحروف: '), (s.closing < 0 ? 'دائن ' : '') + amountWords(Math.abs(s.closing))),
        h('table', {}, h('tbody', {}, BK.map((b) => h('tr', {}, h('td', {}, b[1]), h('td', {}, fm.money(ag[b[0]])))), h('tr.is-grand', {}, h('td', {}, 'الفواتير المفتوحة'), h('td', {}, fm.money(sum(inv, invOpen))))))),
      h('footer.fin-a4-foot', {}, h('span', {}, 'كشف حساب صادر من النظام للمراجعة والمطابقة. نرجو مراجعة الحركات وإبلاغ قسم الحسابات بأي ملاحظات.'), h('span', {}, 'المبالغ بالجنيه المصري (EGP) وشاملة ضريبة القيمة المضافة كما وردت بالفواتير.'),
        h('div.fin-a4-sign', {}, h('div', {}, 'المحاسب'), h('div', {}, 'المدير المالي'), h('div', {}, 'اعتماد العميل'))));
  }
  function soaScreen(root, ctx, cid) {
    const c0 = ERP.customer(cid);
    ctx.setCrumbs([{ label: 'المبيعات والتحصيل' }, { label: 'أعمار الديون', href: '#/fin/aging' }, { label: 'كشف حساب' + (c0 ? ' — ' + c0.name : '') }]);
    const S0 = { from: ctx.params.from || mStart(-5), to: today() };
    return SA.live(root, () => {
      const c = ERP.customer(cid);
      if (!c) return h('div', {}, SA.pageHead({ title: 'عميل غير موجود', back: { label: 'أعمار الديون', href: '#/fin/aging' } }), SA.empty({ icon: 'users', title: 'العميل غير موجود', text: cid }));
      const box = h('div'); let sheet = null;
      const drawSheet = () => { SA.clear(box); sheet = soaSheet(c, S0.from, S0.to); box.appendChild(sheet); };
      const fromIn = h('input.input', { type: 'date', value: S0.from, max: today(), 'aria-label': 'من تاريخ', onchange: (e) => { if (e.target.value) { S0.from = e.target.value; drawSheet(); } } });
      const toIn = h('input.input', { type: 'date', value: S0.to, max: today(), 'aria-label': 'إلى تاريخ', onchange: (e) => { if (e.target.value) { S0.to = e.target.value; drawSheet(); } } });
      const quick = segmented([['m3', '3 أشهر'], ['m6', '6 أشهر'], ['m12', '12 شهرًا']], S0.from === mStart(-2) ? 'm3' : S0.from === mStart(-11) ? 'm12' : 'm6', (v) => { S0.from = v === 'm3' ? mStart(-2) : v === 'm12' ? mStart(-11) : mStart(-5); S0.to = today(); fromIn.value = S0.from; toIn.value = S0.to; drawSheet(); });
      drawSheet();
      const r = arByCustomer().find((x) => x.id === cid) || { total: 0, overdue: 0, maxDays: 0 };
      const head = SA.pageHead({ title: 'كشف حساب — ' + c.name, desc: (SEG[c.segment] || c.type || '') + ' · ' + (c.city || '') + ' · المندوب: ' + who(c.salesRepId), back: { label: 'أعمار الديون', href: '#/fin/aging' },
        tags: [(c.reviewNotes || []).length ? SA.chip('تحت المراجعة — بلا إيقاف', 'warning') : null, r.over ? SA.chip('تجاوز حد الائتمان', 'warning') : null].filter(Boolean),
        actions: [SA.btn({ label: 'طباعة / PDF', icon: 'download', kind: 'ghost', onClick: () => printNode(sheet, 'كشف حساب ' + c.name) }), SA.btn({ label: 'ملاحظة مراجعة', icon: 'note', kind: 'ghost', perm: 'fin.cheques.edit', onClick: () => reviewNote(cid, null) }), SA.btn({ label: 'تسجيل تحصيل', icon: 'coins', kind: 'primary', perm: 'fin.receipts.create', onClick: () => openReceipt({ customerId: cid }) })] });
      const kpis = kpiRow([{ label: 'الرصيد المستحق', value: SH(c.balance || 0), sub: 'فواتير مفتوحة ' + SH(r.total), icon: 'coins', tone: 'primary' }, { label: 'المتأخر', value: SH(r.overdue), sub: r.maxDays ? 'أقدم تأخير ' + r.maxDays + ' يوم' : 'لا يوجد تأخير', icon: 'clock', tone: r.maxDays > 60 ? 'danger' : r.overdue ? 'warning' : 'success' },
        { label: 'حد الائتمان', value: c.creditLimit ? SH(c.creditLimit) : 'نقدي', sub: c.creditLimit ? 'الاستخدام ' + pct((c.balance || 0) / c.creditLimit) : 'بدون حد آجل', icon: 'shield', tone: r.over ? 'warning' : null }, { label: 'شروط الدفع', value: c.termsDays != null ? c.termsDays + ' يوم' : '—', sub: c.tier ? 'تصنيف ' + c.tier : '', icon: 'calendar' }]);
      const notes = (c.reviewNotes || []);
      const notesCard = SA.card({ title: 'ملاحظات المراجعة', tags: SA.chip(String(notes.length), notes.length ? 'warning' : 'neutral') }, notes.length ? h('ul.fin-timeline', {}, notes.map((n) => h('li', {}, h('i'), h('div.fin-stack', {}, h('b', {}, n.text), h('small', {}, SA.fmt.dt(n.at) + ' — ' + who(n.by) + (n.chequeId ? ' · ' + n.chequeId : '')))))) : h('p.fin-muted', { style: { margin: 0 } }, 'لا توجد ملاحظات. الملاحظة تنبيه للمراجعة فقط — لا توقف العميل (بند 41).'));
      return h('div.fin-page', {}, head, kpis, h('div.fin-toolbar', {}, quick, h('label.fin-inline', {}, h('span.fin-muted', {}, 'من'), fromIn), h('label.fin-inline', {}, h('span.fin-muted', {}, 'إلى'), toIn)),
        h('div.fin-doc-wrap', {}, box, h('div.fin-side', {}, notesCard, SA.card({ title: 'روابط' }, h('ul.fin-mini', {}, h('li', {}, linkBtn('فواتير العميل', 'fin/invoices?c=' + cid)), h('li', {}, linkBtn('ملف العميل 360°', 'crm/customers/' + cid)), h('li', {}, linkBtn('سندات القبض', 'fin/receipts?q=' + encodeURIComponent(c.name))))))));
    }, ['invoices', 'receipts', 'cheques', 'customers']);
  }

  /* ═════════════════════════ 6. فواتير الموردين ═════════════════════════ */
  function billsScreen(root, ctx) {
    const S0 = { list: { q: ctx.params.q || '', sort: { key: 'dueDate', dir: 'asc' }, filters: ctx.params.q ? {} : { status: 'unpaid' } } };
    return SA.live(root, () => {
      const bills = get('bills'); const open = bills.filter((b) => billOpen(b) > 0); const t = today();
      const over = open.filter((b) => b.dueDate < t), d7 = open.filter((b) => b.dueDate >= t && b.dueDate <= addDays(t, 7)), d30 = open.filter((b) => b.dueDate >= t && b.dueDate <= addDays(t, 30));
      const pend = pendingOnBills(); const covered = sum(Object.keys(pend), (k) => pend[k]);
      const head = SA.pageHead({ title: 'فواتير الموردين', desc: 'مستحقات الموردين من الاستلام المقبول بعد فحص الجودة. حدّد فواتير مورد ثم أنشئ سند صرف يمر بالاعتماد ثم التنفيذ (ثلاث صلاحيات منفصلة).',
        actions: [SA.btn({ label: 'سند صرف جديد', icon: 'send', kind: 'primary', perm: 'finance.voucher.create', onClick: () => openVoucher({}) })] });
      const kpis = kpiRow([
        { label: 'إجمالي المستحق للموردين', value: SH(sum(open, billOpen)), sub: open.length + ' فاتورة مفتوحة', icon: 'truck', tone: 'primary' },
        { label: 'متأخرة السداد', value: SH(sum(over, billOpen)), sub: over.length + ' فاتورة', icon: 'clock', tone: over.length ? 'danger' : 'success' },
        { label: 'تستحق خلال 7 أيام', value: SH(sum(d7, billOpen)), sub: d7.length + ' فاتورة', icon: 'calendar', tone: d7.length ? 'warning' : null },
        { label: 'تستحق خلال 30 يومًا', value: SH(sum(d30, billOpen)), sub: d30.length + ' فاتورة', icon: 'calendar' },
        { label: 'مغطاة بسندات صرف مفتوحة', value: SH(covered), sub: activeVouchers().length + ' سند بانتظار الاعتماد/التنفيذ', icon: 'send', href: '#/fin/vouchers' }
      ]);
      const ag = {}; BK.forEach((b) => { ag[b[0]] = 0; }); open.forEach((b) => { ag[bucketOf(b.dueDate)] += billOpen(b); });
      const apAging = CH.bars(BK.map((b) => ({ label: b[0] === 'cur' ? 'لم يستحق بعد' : 'متأخر ' + b[1], value: ag[b[0]], color: b[2] })), { fmt: SH });
      const bySup = {}; open.forEach((b) => { bySup[b.supplierId] = (bySup[b.supplierId] || 0) + billOpen(b); });
      const supBars = Object.keys(bySup).length ? CH.bars(Object.keys(bySup).sort((a, b) => bySup[b] - bySup[a]).slice(0, 6).map((id) => ({ label: ERP.supplierName(id), value: bySup[id], sub: (ERP.supplier(id) || {}).category || '' })), { fmt: SH }) : SA.empty({ icon: 'checkcircle', title: 'لا توجد مستحقات' });
      const supOpts = Array.from(new Set(bills.map((b) => b.supplierId))).map((id) => [id, ERP.supplierName(id)]);
      const tbl = table(S0, 'list', {
        caption: 'فواتير الموردين', selectable: true,
        columns: [
          { key: 'id', label: 'الفاتورة', sort: true, render: (b) => h('div.fin-stack', {}, h('b.num', {}, b.id), b.note ? h('small', {}, b.note) : null) },
          { key: 'supplier', label: 'المورد', sort: true, value: (b) => ERP.supplierName(b.supplierId), render: (b) => supCell(b.supplierId) },
          { key: 'poId', label: 'أمر الشراء / الاستلام', render: (b) => h('div.fin-stack', {}, b.poId ? U.docLink(b.poId) : h('small.fin-muted', {}, 'بدون أمر شراء'), b.grnId ? U.docLink(b.grnId) : null) },
          { key: 'issueDate', label: 'التاريخ', sort: true, render: (b) => fm.date(b.issueDate) },
          { key: 'dueDate', label: 'الاستحقاق', sort: true, render: (b) => dueCell(b.dueDate, billOpen(b) > 0) },
          { key: 'total', label: 'الإجمالي', sort: true, class: 'fin-r', render: (b) => h('div.fin-stack', { style: { alignItems: 'flex-end' } }, M(b.total), b.tax ? h('small', {}, 'ض.ق.م ' + fm.num(b.tax)) : h('small', {}, 'بدون ضريبة مدخلات')) },
          { key: 'open', label: 'المتبقي', sort: true, class: 'fin-r', value: billOpen, render: (b) => (billOpen(b) ? h('b', {}, M(billOpen(b))) : h('span.fin-muted', {}, '—')) },
          { key: 'status', label: 'الحالة', sort: true, value: billSt, render: (b) => U.status('bill', billSt(b)) },
          { key: 'pv', label: 'سند الصرف', render: (b) => { const v = billVoucher(b); return v ? h('div.fin-stack', {}, U.docLink(v.id), h('small', {}, SA.catalog.status.pv[v.status][0])) : '—'; } }
        ],
        rows: () => get('bills'),
        search: { placeholder: 'بحث برقم الفاتورة أو المورد أو أمر الشراء…', keys: ['id', 'poId', 'grnId', (b) => ERP.supplierName(b.supplierId)] },
        filters: [{ key: 'status', label: 'الحالة', options: [['unpaid', 'غير مسددة'], ['open', 'مستحقة'], ['partial', 'مدفوعة جزئيًا'], ['overdue', 'متأخرة'], ['paid', 'مدفوعة']], test: (b, v) => (v === 'unpaid' ? billOpen(b) > 0 : billSt(b) === v) },
          { key: 'supplier', label: 'المورد', options: supOpts, test: (b, v) => b.supplierId === v }, { key: 'due', label: 'الاستحقاق', options: [['late', 'متأخرة'], ['d7', 'خلال 7 أيام'], ['d30', 'خلال 30 يومًا']], test: (b, v) => billOpen(b) > 0 && (v === 'late' ? b.dueDate < t : v === 'd7' ? b.dueDate >= t && b.dueDate <= addDays(t, 7) : b.dueDate >= t && b.dueDate <= addDays(t, 30)) }],
        bulk: [{ label: 'إنشاء سند صرف للمحدد', icon: 'send', perm: 'finance.voucher.create', run: (rows) => {
          const sel = rows.filter((b) => billOpen(b) > 0); if (!sel.length) { SA.toast('الفواتير المحددة مسددة بالفعل', 'warn'); return; }
          if (new Set(sel.map((b) => b.supplierId)).size > 1) { SA.toast('السند لمورد واحد — حدّد فواتير مورد واحد فقط', 'warn'); return; }
          const avail = sel.filter((b) => billOpen(b) - (pend[b.id] || 0) > 0); if (!avail.length) { SA.toast('الفواتير المحددة مغطاة بسندات صرف مفتوحة', 'warn'); return; }
          openVoucher({ kind: 'supplier', supplierId: sel[0].supplierId, billIds: avail.map((b) => b.id) });
        } }],
        rowActions: (b) => [{ label: 'سند صرف لهذه الفاتورة', icon: 'send', disabled: !SA.can('finance.voucher.create') ? 'صلاحية حساسة: finance.voucher.create' : billOpen(b) < 1 ? 'مسددة' : billOpen(b) - (pend[b.id] || 0) < 1 ? 'مغطاة بسند مفتوح' : false, onClick: () => openVoucher({ kind: 'supplier', supplierId: b.supplierId, billIds: [b.id] }) },
          { label: 'أمر الشراء', icon: 'cart', hidden: !b.poId, onClick: () => SA.nav(ERP.route(b.poId)) }, { label: 'إذن الاستلام', icon: 'box', hidden: !b.grnId, onClick: () => SA.nav(ERP.route(b.grnId)) }],
        empty: { icon: 'truck', title: 'لا توجد فواتير موردين', text: 'تُسجَّل تلقائيًا بعد قبول الاستلام من الجودة.' }
      });
      return h('div.fin-page', {}, head, kpis, U.grid(2, SA.card({ title: 'أعمار مستحقات الموردين' }, apAging), SA.card({ title: 'أكبر المستحقات حسب المورد' }, supBars)),
        SA.card({ flush: false }, tbl.el, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'حدّد فواتير مورد واحد ثم «إنشاء سند صرف للمحدد». السند يُرسل للاعتماد (المدير المالي، والمدير العام فوق الحد التجريبي) ولا يُنفَّذ إلا بصلاحية التنفيذ المنفصلة.'))));
    }, ['bills', 'vouchers', 'suppliers']);
  }

  /* ═════════════════════════ 7. سندات الصرف (فصل المهام) ═════════════════════════ */
  const SOD_KEYS = [['finance.voucher.create', 'إنشاء'], ['finance.voucher.approve', 'اعتماد'], ['finance.voucher.execute', 'تنفيذ']];
  const pvKind = (v) => (v.supplierId ? 'سداد مورد' : 'مصروف: ' + GL.accName(v.expenseAcc || '6201'));
  const pvApprovedBy = (pv) => { if (pv.approvedBy) return pv.approvedBy; const ap = pv.approvalId ? ERP.find('approvals', pv.approvalId) : null; if (ap && ap.status === 'approved') { const d = ap.chain.filter((c) => c.decidedBy); return d.length ? d[d.length - 1].decidedBy : null; } return null; };
  function vouchersScreen(root, ctx) {
    if (ctx.path[0]) return voucherDetail(root, ctx, ctx.path[0]);
    const S0 = { list: { q: ctx.params.q || '', sort: { key: 'createdAt', dir: 'desc' }, filters: ctx.params.status ? { status: ctx.params.status } : {} } };
    return SA.live(root, () => {
      const pvs = get('vouchers'); const pend = pvs.filter((v) => v.status === 'pending_approval'), appr = pvs.filter((v) => v.status === 'approved'), ex = pvs.filter((v) => v.status === 'executed' && (v.executedAt || '') >= mStart(0)), rej = pvs.filter((v) => v.status === 'rejected');
      const head = SA.pageHead({ title: 'سندات الصرف', desc: 'الإنشاء ← الاعتماد ← التنفيذ: ثلاث صلاحيات حساسة منفصلة، ولا يعتمد أحد طلبه ولا ينفّذ ما أنشأه أو اعتمده (بند 42).', tags: [SA.tag('approved', 'بند 42')],
        actions: [SA.btn({ label: 'سند صرف جديد', icon: 'plus', kind: 'primary', perm: 'finance.voucher.create', onClick: () => openVoucher({}) })] });
      const kpis = kpiRow([
        { label: 'بانتظار الاعتماد', value: String(pend.length), sub: SH(sum(pend, (v) => v.amount)), icon: 'inbox', tone: pend.length ? 'warning' : null, href: SA.can('sa.approvals.view') ? '#/approvals' : null },
        { label: 'معتمدة بانتظار التنفيذ', value: String(appr.length), sub: SH(sum(appr, (v) => v.amount)), icon: 'send', tone: appr.length ? 'warning' : null },
        { label: 'نُفّذت هذا الشهر', value: SH(sum(ex, (v) => v.amount)), sub: ex.length + ' سند', icon: 'checkcircle', tone: 'success' },
        { label: 'مرفوضة', value: String(rej.length), sub: SH(sum(rej, (v) => v.amount)), icon: 'xcircle' }
      ]);
      const mine = h('div.fin-inline', {}, h('span.fin-muted', {}, 'صلاحياتك: '), SOD_KEYS.map((k) => SA.chip([SA.icon(SA.can(k[0]) ? 'check' : 'x', 'icon-sm'), ' ' + k[1]], SA.can(k[0]) ? 'success' : 'neutral')));
      const sod = SA.card({ title: 'فصل المهام في سندات الصرف', tags: mine }, h('ol.fin-sod', {},
        h('li.is-done', {}, h('div.fin-sod-top', {}, h('span.fin-sod-n', {}, '1'), h('b', {}, 'الإنشاء')), h('small', {}, 'المحاسب يجهّز السند من فواتير المورد أو كمصروف مباشر.'), h('code', {}, 'finance.voucher.create')),
        h('li.is-now', {}, h('div.fin-sod-top', {}, h('span.fin-sod-n', {}, '2'), h('b', {}, 'الاعتماد')), h('small', {}, 'المدير المالي (والمدير العام فوق الحد التجريبي) من صندوق الاعتمادات — المنشئ لا يعتمد طلبه.'), h('code', {}, 'finance.voucher.approve')),
        h('li', {}, h('div.fin-sod-top', {}, h('span.fin-sod-n', {}, '3'), h('b', {}, 'التنفيذ (الصرف)')), h('small', {}, 'بعد الاعتماد فقط، بشخص غير المنشئ والمعتمد + إعادة تحقق (Step-up).'), h('code', {}, 'finance.voucher.execute'))));
      const tbl = table(S0, 'list', {
        caption: 'سندات الصرف',
        columns: [
          { key: 'id', label: 'السند', sort: true, render: (v) => U.docLink(v.id) },
          { key: 'payee', label: 'المستفيد', sort: true, render: (v) => h('div.fin-stack', {}, h('b', {}, v.payee), h('small', {}, pvKind(v) + (v.billIds && v.billIds.length ? ' · ' + v.billIds.length + ' فاتورة' : ''))) },
          { key: 'amount', label: 'المبلغ', sort: true, class: 'fin-r', render: (v) => M(v.amount) },
          { key: 'account', label: 'يُصرف من', render: (v) => h('div.fin-stack', {}, h('small', {}, accLabel(v.account)), h('small', {}, v.method === 'cheque' ? 'شيك صادر' : v.method === 'cash' ? 'نقدي' : 'تحويل')) },
          { key: 'createdBy', label: 'أنشأه', render: (v) => h('div.fin-stack', {}, h('span', {}, who(v.createdBy), v.createdBy === me() ? h('span.fin-you', {}, ' أنت') : null), h('small', {}, SA.fmt.rel(v.createdAt))) },
          { key: 'approval', label: 'الاعتماد', render: (v) => { const a = pvApprovedBy(v); return h('div.fin-stack', {}, v.approvalId ? U.docLink(v.approvalId) : h('small.fin-muted', {}, 'سجل تاريخي'), a ? h('small', {}, who(a)) : null); } },
          { key: 'executedBy', label: 'نفّذه', render: (v) => (v.executedBy ? h('div.fin-stack', {}, h('span', {}, who(v.executedBy)), h('small', {}, SA.fmt.rel(v.executedAt))) : '—') },
          { key: 'status', label: 'الحالة', sort: true, render: (v) => U.status('pv', v.status) },
          { key: 'createdAt', label: 'التاريخ', sort: true, render: (v) => fm.date((v.createdAt || '').slice(0, 10)) }
        ],
        rows: () => get('vouchers'),
        search: { placeholder: 'بحث برقم السند أو المستفيد…', keys: ['id', 'payee', 'approvalId', 'memo'] },
        filters: [{ key: 'status', label: 'الحالة', options: [['pending_approval', 'بانتظار الاعتماد'], ['approved', 'معتمد — بانتظار التنفيذ'], ['executed', 'مُنفّذ'], ['rejected', 'مرفوض']] }, { key: 'kind', label: 'النوع', options: [['supplier', 'سداد مورد'], ['expense', 'مصروف مباشر']], test: (v, x) => (x === 'supplier' ? !!v.supplierId : !v.supplierId) }],
        rowActions: (v) => { const why = sodReason(v); return [{ label: 'فتح السند', icon: 'eye', onClick: () => SA.nav('fin/vouchers/' + v.id) }, { label: 'تنفيذ الصرف', icon: 'send', disabled: !SA.can('finance.voucher.execute') ? 'صلاحية حساسة: finance.voucher.execute' : why || false, onClick: () => executeVoucher(v.id) }, { label: 'طلب الاعتماد', icon: 'inbox', hidden: !v.approvalId || !SA.can('sa.approvals.view'), onClick: () => SA.nav('approvals/' + v.approvalId) }]; },
        onRowClick: (v) => SA.nav('fin/vouchers/' + v.id),
        empty: { icon: 'send', title: 'لا توجد سندات صرف', text: 'أنشئ سندًا من فواتير الموردين أو كمصروف مباشر.' }
      });
      return h('div.fin-page', {}, head, kpis, sod, SA.card({ flush: false }, tbl.el));
    }, ['vouchers', 'approvals', 'bills']);
  }
  function voucherSheet(pv, approvedBy) {
    const sig = (label, id, at) => h('div', {}, h('b', { style: { display: 'block', color: '#1b1f2a' } }, id ? who(id) : '—'), label, at ? h('small', { style: { display: 'block' } }, SA.fmt.dt(at)) : null);
    return h('article.fin-a4', { 'aria-label': 'سند صرف ' + pv.id }, a4Head('سند صرف', 'Payment Voucher', pv.id, U.status('pv', pv.status)),
      h('div.fin-a4-meta', {}, h('div.fin-a4-box', {}, h('h4', {}, 'المستفيد'), dl([['الاسم', pv.payee], ['النوع', pvKind(pv)], ['البيان', pv.memo || '—']])),
        h('div.fin-a4-box', {}, h('h4', {}, 'الصرف'), dl([['المبلغ', h('b', {}, fm.money(pv.amount))], ['الطريقة', pv.method === 'cheque' ? 'شيك صادر' : pv.method === 'cash' ? 'نقدي' : 'تحويل بنكي'], ['من حساب', accLabel(pv.account)], ['تاريخ الإنشاء', fm.date((pv.createdAt || '').slice(0, 10))]]))),
      h('div.fin-a4-words', {}, h('b', {}, 'المبلغ بالحروف: '), amountWords(pv.amount)),
      (pv.billIds || []).length ? h('table.fin-a4-lines', { style: { marginTop: '12px' } }, h('thead', {}, h('tr', {}, h('th', {}, 'فاتورة المورد'), h('th', {}, 'الاستحقاق'), h('th.fin-r', {}, 'الإجمالي'))), h('tbody', {}, pv.billIds.map((id) => { const b = ERP.find('bills', id) || {}; return h('tr', {}, h('td.num', {}, id), h('td', {}, fm.date(b.dueDate)), h('td.fin-r', {}, fm.money(b.total))); }))) : null,
      h('footer.fin-a4-foot', {}, h('span', {}, 'فصل المهام (بند 42): الإنشاء والاعتماد والتنفيذ بثلاثة أشخاص مختلفين.'), h('div.fin-a4-sign', {}, sig('أنشأه', pv.createdBy, pv.createdAt), sig('اعتمده', approvedBy, pv.approvedAt), sig('نفّذه', pv.executedBy, pv.executedAt))));
  }
  function voucherDetail(root, ctx, id) {
    ctx.setCrumbs([{ label: 'المشتريات والمدفوعات' }, { label: 'سندات الصرف', href: '#/fin/vouchers' }, { label: id }]);
    return SA.live(root, () => {
      const pv = ERP.find('vouchers', id);
      if (!pv) return h('div', {}, SA.pageHead({ title: 'سند غير موجود', back: { label: 'سندات الصرف', href: '#/fin/vouchers' } }), SA.empty({ icon: 'send', title: 'سند الصرف غير موجود', text: id }));
      const ap = pv.approvalId ? ERP.find('approvals', pv.approvalId) : null; const approvedBy = pvApprovedBy(pv);
      const why = sodReason(pv); const canEx = SA.can('finance.voucher.execute');
      const sheet = voucherSheet(pv, approvedBy);
      const head = SA.pageHead({ title: 'سند صرف ' + pv.id, desc: pv.payee + ' · ' + fm.money(pv.amount) + ' · ' + pvKind(pv), tags: [U.status('pv', pv.status)], back: { label: 'سندات الصرف', href: '#/fin/vouchers' },
        actions: [SA.btn({ label: 'طباعة', icon: 'download', kind: 'ghost', onClick: () => printNode(sheet, 'سند صرف ' + pv.id) }),
          ap && pv.status === 'pending_approval' && SA.can('sa.approvals.view') ? SA.btn({ label: 'فتح طلب الاعتماد', icon: 'inbox', kind: 'primary', onClick: () => SA.nav('approvals/' + ap.id) }) : null,
          pv.status !== 'rejected' ? SA.btn({ label: 'تنفيذ الصرف', icon: 'send', kind: 'accent', perm: 'finance.voucher.execute', reason: canEx ? why : null, onClick: () => executeVoucher(pv.id) }) : null] });
      const curApStep = ap ? (ap.chain.find((c) => c.status === 'pending') || null) : null;
      const step = (n, title, key, uid, at, state, note) => h('li.is-' + state, {}, h('div.fin-sod-top', {}, h('span.fin-sod-n', {}, state === 'done' ? SA.icon('check', 'icon-sm') : String(n)), h('b', {}, title)),
        uid ? h('span', {}, h('b', {}, who(uid)), uid === me() ? h('span.fin-you', {}, ' أنت') : null, h('small', { style: { display: 'block' } }, SA.roleName((SA.userById(uid) || {}).roleId) + (at ? ' · ' + SA.fmt.dt(at) : ''))) : h('small', {}, note || 'لم يتم بعد'),
        uid && note ? h('small', {}, note) : null, h('code', {}, key));
      const ids = [pv.createdBy, approvedBy, pv.executedBy].filter(Boolean); const clash = new Set(ids).size < ids.length;
      const sod = SA.card({ title: 'فصل المهام — ثلاث خطوات بثلاثة أشخاص' }, h('ol.fin-sod', {},
        step(1, 'الإنشاء', 'finance.voucher.create', pv.createdBy, pv.createdAt, 'done'),
        step(2, 'الاعتماد', 'finance.voucher.approve', approvedBy, pv.approvedAt || (ap && ap.status === 'approved' ? ap.updatedAt : null), pv.status === 'rejected' ? 'bad' : pv.status === 'approved' || pv.status === 'executed' ? 'done' : 'now', pv.status === 'pending_approval' ? 'بانتظار: ' + (curApStep ? curApStep.label : 'الاعتماد') : pv.status === 'rejected' ? 'مرفوض' : null),
        step(3, 'التنفيذ (الصرف)', 'finance.voucher.execute', pv.executedBy, pv.executedAt, pv.status === 'executed' ? 'done' : pv.status === 'approved' ? 'now' : 'wait', pv.status === 'approved' ? (canEx ? why || 'جاهز للتنفيذ — يتطلب إعادة تحقق (Step-up)' : 'يتطلب صلاحية التنفيذ المنفصلة') : 'بعد الاعتماد')),
        clash ? SA.alert('warning', h('b', {}, 'تنبيه رقابي: '), 'نفس المستخدم ظهر في أكثر من خطوة على هذا السند (سجل تاريخي قبل تطبيق القاعدة في النظام). لا يمكن تكرار ذلك الآن — زر التنفيذ مقفول بقاعدة فصل المهام.') : null,
        pv.status === 'approved' && canEx && why ? SA.alert('info', h('b', {}, 'لماذا الزر مقفول؟ '), why) : null);
      const chainCard = SA.card({ title: 'سلسلة الاعتماد', actions: ap && SA.can('sa.approvals.view') ? [linkBtn('فتح ' + ap.id, 'approvals/' + ap.id)] : null },
        ap ? h('ul.fin-chain', {}, h('li.is-approved', {}, h('i'), h('div', {}, h('b', {}, 'طلب الاعتماد — ' + who(ap.requesterId)), h('small', {}, SA.fmt.dt(ap.createdAt)))),
          ap.chain.map((c) => h('li.is-' + c.status, {}, h('i'), h('div', {}, h('b', {}, c.label), h('small', {}, (SA.catalog.status.approval && SA.catalog.status.approval[c.status] ? SA.catalog.status.approval[c.status][0] : c.status) + (c.decidedBy ? ' — ' + who(c.decidedBy) : '') + (c.decidedAt ? ' · ' + SA.fmt.dt(c.decidedAt) : '')), c.reason ? h('small', {}, '«' + c.reason + '»') : null))))
          : h('p.fin-muted', { style: { margin: 0 } }, 'لا يوجد طلب اعتماد مرتبط (سجل تاريخي).'));
      const bills = (pv.billIds || []).map((b) => ERP.find('bills', b)).filter(Boolean);
      const billsCard = SA.card({ title: 'الفواتير المرتبطة', tags: SA.chip(String(bills.length), 'neutral') }, bills.length ? h('ul.fin-mini', {}, bills.map((b) => h('li', {}, h('div.fin-stack', {}, h('a.erp-doc', { href: '#/fin/bills?q=' + b.id }, b.id), h('small', {}, 'استحقاق ' + fm.date(b.dueDate) + ' · متبقي ' + fm.money(billOpen(b)))), U.status('bill', billSt(b))))) : h('p.fin-muted', { style: { margin: 0 } }, pv.supplierId ? 'دفعة تحت الحساب للمورد.' : 'مصروف مباشر — بدون فواتير.'));
      const je = jeOf(pv.id);
      const glCard = SA.card({ title: 'القيد المحاسبي' }, je ? h('div', {}, h('p', { style: { margin: '0 0 6px' } }, U.docLink(je.id), ' ', h('small.fin-muted', {}, fm.date(je.date))), h('ul.fin-mini', {}, je.lines.map((l) => h('li', {}, h('span', {}, h('span.num', {}, l.acc), ' ', GL.accName(l.acc)), h('b.num', {}, l.dr ? 'مدين ' + fm.num(l.dr) : 'دائن ' + fm.num(l.cr)))))) : h('p.fin-muted', { style: { margin: 0 } }, pv.status === 'executed' ? 'سجل تاريخي — القيد ضمن قيد السداد المجمّع.' : 'يُرحّل تلقائيًا عند التنفيذ: مدين ' + (pv.supplierId ? 'الموردين (2101)' : GL.accName(pv.expenseAcc || '6201')) + ' / دائن ' + accLabel(pv.account) + '.'));
      return h('div.fin-page', {}, head, sod, h('div.fin-doc-wrap', {}, sheet, h('div.fin-side', {}, chainCard, billsCard, glCard)));
    }, ['vouchers', 'approvals', 'bills', 'journal']);
  }

  /* ═════════════════════════ 8. البنوك والخزائن ═════════════════════════ */
  function accLines(acc) {
    const debit = debitNature(types()[acc]); const rows = [];
    get('journal').forEach((je) => je.lines.forEach((l, i) => { if (l.acc === acc) rows.push({ id: je.id + ':' + i, je, date: je.date, memo: je.memo, ref: je.ref, dr: l.dr || 0, cr: l.cr || 0 }); }));
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.je.id < b.je.id ? -1 : 1));
    let bal = 0; rows.forEach((r) => { bal += debit ? r.dr - r.cr : r.cr - r.dr; r.bal = Math.round(bal); });
    return rows;
  }
  function openTransfer(from) {
    if (!SA.can('fin.banks.edit')) { SA.toast('ليست من صلاحياتك (fin.banks.edit)', 'warn'); return; }
    const all = glMap(null, null); const banks = get('banks'); const opts = banks.map((b) => [b.acc, b.name + ' — رصيد ' + fm.money(nat(all, b.acc))]);
    const fFrom = SA.form.field({ name: 'from', label: 'من حساب', type: 'select', value: from || banks[0].acc, options: opts });
    const fTo = SA.form.field({ name: 'to', label: 'إلى حساب', type: 'select', value: (banks.find((b) => b.acc !== (from || banks[0].acc)) || {}).acc, options: opts });
    const fAmt = SA.form.field({ name: 'amount', label: 'المبلغ (ج.م)', type: 'number', required: true, min: 1, rules: [(v) => (!(v > 0) ? 'أدخل مبلغًا أكبر من صفر' : null), (v) => (v > nat(glMap(null, null), fFrom.get()) ? 'المبلغ أكبر من رصيد الحساب المحوَّل منه' : null)] });
    const fDate = SA.form.field({ name: 'date', label: 'التاريخ', type: 'date', value: today(), required: true });
    const fMemo = SA.form.field({ name: 'memo', label: 'البيان', placeholder: 'مثال: تغذية خزينة المصنع لصرف الأجور' });
    const save = h('button.btn.btn-primary', { type: 'button' }, SA.icon('swap', 'icon-sm'), 'ترحيل التحويل');
    const m = SA.modal({ title: 'تحويل بين البنوك والخزائن', subtitle: 'يُرحَّل كقيد يومية: مدين الحساب المحوَّل إليه / دائن المحوَّل منه', icon: 'swap', size: 'md', body: h('div.fin-form', {}, h('div.fin-form-2', {}, fFrom.el, fTo.el), h('div.fin-form-2', {}, fAmt.el, fDate.el), fMemo.el), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), save] });
    save.addEventListener('click', async () => {
      if (!SA.form.group([fAmt, fDate]).validate()) return;
      const a = fFrom.get(), b = fTo.get(), amt = Number(fAmt.get()); if (a === b) { fTo.error('اختر حسابًا مختلفًا'); return; }
      m.setBusy(true); let je = null;
      try { je = await SA.api(() => { const ref = ERP.no('TRF'); const x = GL.post({ date: fDate.get() || today(), memo: 'تحويل ' + ref + ': ' + (bankOf(a) || {}).name + ' ← إلى ' + (bankOf(b) || {}).name + (fMemo.get() ? ' — ' + String(fMemo.get()).trim() : ''), ref: { type: 'bank_transfer', id: ref }, lines: [{ acc: b, dr: amt }, { acc: a, cr: amt }] }); audit('GL.POSTED', { target: { type: 'journal', id: x.id, label: 'تحويل بين حسابات' }, after: { from: a, to: b, amount: amt, ref } }); return x; }); } catch (e) { m.setBusy(false); SA.fail(e); return; }
      m.setBusy(false); m.close(je); SA.toast('تم ترحيل التحويل ' + je.id + ' — ' + fm.money(amt), 'success');
    });
  }
  function banksScreen(root, ctx) {
    const S0 = { acc: ctx.params.acc || ((get('banks')[0] || {}).acc), list: { sort: { key: 'date', dir: 'desc' } } };
    return SA.live(root, () => {
      const T = types(); const all = glMap(null, null); const banks = get('banks'); const t = today(); const m0 = mStart(0);
      const cards = banks.map((b) => { const lines = accLines(b.acc); const io = lines.filter((r) => r.date >= m0); const spark = []; for (let d = 29; d >= 0; d--) { const day = addDays(t, -d); let v = 0; for (let i = lines.length - 1; i >= 0; i--) if (lines[i].date <= day) { v = lines[i].bal; break; } spark.push(v); } return { b, bal: nat(all, b.acc, T), inn: sum(io, (r) => r.dr), out: sum(io, (r) => r.cr), spark, lines }; });
      const total = sum(cards, (c) => c.bal); const bankT = sum(cards.filter((c) => c.b.kind === 'bank'), (c) => c.bal);
      const chq = get('cheques').filter((c) => c.status === 'received' || c.status === 'under_collection');
      const io = cashIO(m0, t);
      const head = SA.pageHead({ title: 'البنوك والخزائن', desc: 'كل حساب بنكي أو خزينة مرتبط بحساب في دليل الحسابات — الرصيد من الأستاذ العام مباشرة.', actions: [SA.btn({ label: 'تحويل بين الحسابات', icon: 'swap', kind: 'primary', perm: 'fin.banks.edit', onClick: () => openTransfer(S0.acc) })] });
      const kpis = kpiRow([
        { label: 'إجمالي النقدية', value: SH(total), sub: banks.length + ' حساب', icon: 'coins', tone: 'primary' },
        { label: 'البنوك', value: SH(bankT), sub: banks.filter((b) => b.kind === 'bank').length + ' بنوك', icon: 'building' },
        { label: 'الخزائن', value: SH(total - bankT), sub: banks.filter((b) => b.kind === 'treasury').length + ' خزائن', icon: 'box' },
        { label: 'مقبوضات / مدفوعات الشهر', value: SH(io.inn - io.out), sub: 'داخل ' + SH(io.inn) + ' · خارج ' + SH(io.out), icon: 'activity', tone: io.inn - io.out < 0 ? 'warning' : 'success' },
        { label: 'شيكات لم تُحصّل بعد', value: SH(sum(chq, (c) => c.amount)), sub: chq.length + ' شيك (خارج رصيد البنوك)', icon: 'doc', href: '#/fin/cheques' }
      ]);
      const grid = h('div.fin-banks', {});
      const mov = h('div');
      const drawCards = () => { SA.clear(grid); cards.forEach((c) => grid.appendChild(h('button.fin-bank' + (c.b.kind === 'treasury' ? '.is-treasury' : ''), { type: 'button', 'aria-pressed': String(c.b.acc === S0.acc), onclick: () => { S0.acc = c.b.acc; S0.list = { sort: { key: 'date', dir: 'desc' } }; drawCards(); drawMov(); } },
        h('div.fin-bank-top', {}, h('span.fin-bank-ico', {}, SA.icon(c.b.kind === 'bank' ? 'building' : 'box', 'icon-sm')), h('div.fin-stack', {}, h('b', {}, c.b.name), h('small.num', {}, c.b.acc + (c.b.iban ? ' · ' + c.b.iban : '')))),
        h('div.fin-row', {}, h('b.fin-bank-v.num', {}, fm.money(c.bal)), CH.spark(c.spark, { w: 90, h: 26, color: c.bal < 0 ? 'var(--color-danger)' : undefined })),
        h('div.fin-bank-io', {}, h('span.fin-in', {}, '+ ' + SH(c.inn)), h('span.fin-out', {}, '− ' + SH(c.out)), h('small', {}, 'هذا الشهر'))))); };
      const drawMov = () => {
        SA.clear(mov); const c = cards.find((x) => x.b.acc === S0.acc) || cards[0]; if (!c) { mov.appendChild(SA.empty({ icon: 'building', title: 'لا توجد حسابات' })); return; }
        const tb = table(S0, 'list', {
          caption: 'حركات ' + c.b.name,
          columns: [
            { key: 'date', label: 'التاريخ', sort: true, render: (r) => fm.date(r.date) },
            { key: 'je', label: 'القيد', render: (r) => U.docLink(r.je.id) },
            { key: 'memo', label: 'البيان', render: (r) => h('div.fin-stack', {}, h('span', {}, r.memo), r.ref && r.ref.id && ERP.route(r.ref.id) ? h('small', {}, U.docLink(r.ref.id)) : null) },
            { key: 'dr', label: 'وارد', sort: true, class: 'fin-r', render: (r) => (r.dr ? h('span.fin-in', {}, fm.money(r.dr)) : '') },
            { key: 'cr', label: 'صادر', sort: true, class: 'fin-r', render: (r) => (r.cr ? h('span.fin-out', {}, fm.money(r.cr)) : '') },
            { key: 'bal', label: 'الرصيد بعد الحركة', class: 'fin-r', render: (r) => M(r.bal) }
          ],
          rows: c.lines,
          search: { placeholder: 'بحث في البيان أو رقم القيد أو المرجع…', keys: ['memo', (r) => r.je.id, (r) => (r.ref && r.ref.id) || ''] },
          filters: [{ key: 'dir', label: 'الاتجاه', options: [['in', 'وارد'], ['out', 'صادر']], test: (r, v) => (v === 'in' ? r.dr > 0 : r.cr > 0) }, { key: 'period', label: 'الفترة', options: PERIOD_FILTER, test: (r, v) => periodMatch(r.date, v) }],
          onRowClick: SA.can('fin.journal.view') ? (r) => SA.nav('fin/journal/' + r.je.id) : null,
          empty: { icon: 'activity', title: 'لا توجد حركات على هذا الحساب' }
        });
        mov.appendChild(SA.card({ title: 'حركات ' + c.b.name + ' (' + c.b.acc + ')', actions: [SA.btn({ label: 'تحويل من هذا الحساب', icon: 'swap', kind: 'ghost', size: 'sm', perm: 'fin.banks.edit', onClick: () => openTransfer(c.b.acc) })] }, tb.el));
      };
      drawCards(); drawMov();
      return h('div.fin-page', {}, head, kpis, grid, mov);
    }, ['journal', 'banks', 'cheques']);
  }

  /* ═════════════════════════ 9. القيود اليومية ═════════════════════════ */
  function openManualJE(prefill) {
    if (!SA.can('fin.journal.post')) { SA.toast('ليست من صلاحياتك (fin.journal.post)', 'warn'); return Promise.resolve(null); }
    const accs = leafAccounts(); const rows = prefill && prefill.lines ? prefill.lines.map((l) => ({ acc: l.acc, dr: l.dr || null, cr: l.cr || null })) : [{ acc: '', dr: null, cr: null }, { acc: '', dr: null, cr: null }];
    const fDate = SA.form.field({ name: 'date', label: 'تاريخ القيد', type: 'date', value: today(), required: true, onChange: () => drawWarn(), onInput: () => drawWarn() });
    const fMemo = SA.form.field({ name: 'memo', label: 'البيان', required: true, value: (prefill && prefill.memo) || '', placeholder: 'مثال: تسوية مصروفات صيانة الشهر' });
    const fRef = SA.form.field({ name: 'ref', label: 'مرجع (اختياري)', value: (prefill && prefill.ref) || '', dir: 'ltr', placeholder: 'INV-… / PV-… / رقم مستند خارجي' });
    const warn = h('div'); const drawWarn = () => { SA.clear(warn); const d = fDate.get(); if (d && d < mStart(0)) warn.appendChild(SA.alert('warning', 'القيد على فترة سابقة (' + ERP.monthLabel(d.slice(0, 7)) + ') — سياسة إقفال الفترات Open؛ سيظهر في قوائم تلك الفترة.')); if (d && d > today()) warn.appendChild(SA.alert('warning', 'تاريخ مستقبلي — تأكد من التاريخ.')); };
    const tbody = h('tbody'); const tfoot = h('tfoot');
    const save = h('button.btn.btn-primary', { type: 'button' }, SA.icon('check', 'icon-sm'), 'ترحيل القيد');
    const accSelect = (r) => { const sel = h('select.select', { 'aria-label': 'الحساب', onchange: (e) => { r.acc = e.target.value; recalc(); } }, h('option', { value: '' }, 'اختر الحساب…'), ['asset', 'liability', 'equity', 'revenue', 'expense'].map((t) => h('optgroup', { label: TYPE_LABEL[t] }, accs.filter((a) => a.type === t).map((a) => h('option', { value: a.code }, a.code + ' — ' + a.name))))); sel.value = r.acc; return sel; };
    const numIn = (r, k) => h('input.input.num', { type: 'number', min: '0', step: '0.01', value: r[k] == null ? '' : r[k], 'aria-label': k === 'dr' ? 'مدين' : 'دائن', placeholder: '0',
      oninput: (e) => { r[k] = e.target.value === '' ? null : Number(e.target.value); if (r[k] > 0) { const o = k === 'dr' ? 'cr' : 'dr'; r[o] = null; const other = e.target.closest('tr').querySelector('input[aria-label="' + (o === 'dr' ? 'مدين' : 'دائن') + '"]'); if (other) other.value = ''; } recalc(); } });
    function drawRows() { SA.clear(tbody); rows.forEach((r, i) => tbody.appendChild(h('tr', {}, h('td', {}, accSelect(r)), h('td', {}, numIn(r, 'dr')), h('td', {}, numIn(r, 'cr')), h('td', {}, rows.length > 2 ? h('button.btn.btn-ghost.btn-sm.btn-icon', { type: 'button', 'aria-label': 'حذف السطر', title: 'حذف السطر', onclick: () => { rows.splice(i, 1); drawRows(); recalc(); } }, SA.icon('trash', 'icon-sm')) : null)))); }
    const valid = () => { const used = rows.filter((r) => r.acc && ((r.dr || 0) > 0 || (r.cr || 0) > 0)); const dr = sum(used, (r) => r.dr || 0), cr = sum(used, (r) => r.cr || 0); const half = rows.some((r) => (!r.acc && ((r.dr || 0) > 0 || (r.cr || 0) > 0))); return { used, dr, cr, ok: used.length >= 2 && dr > 0 && Math.abs(dr - cr) < 0.01 && !half && used.some((r) => r.dr > 0) && used.some((r) => r.cr > 0), half }; };
    function recalc() { const v = valid(); SA.clear(tfoot); tfoot.appendChild(h('tr', {}, h('td', {}, h('span.fin-bal.' + (v.ok ? 'is-ok' : 'is-bad'), {}, SA.icon(v.ok ? 'checkcircle' : 'alert', 'icon-sm'), v.ok ? 'القيد متوازن' : v.half ? 'سطر بمبلغ بدون حساب' : Math.abs(v.dr - v.cr) >= 0.01 ? 'غير متوازن — الفرق ' + fm.num(Math.abs(v.dr - v.cr), 2) : 'أدخل سطرين على الأقل (مدين ودائن)')), h('td.num', {}, fm.num(v.dr, 2)), h('td.num', {}, fm.num(v.cr, 2)), h('td'))); save.disabled = !v.ok; }
    drawRows(); recalc(); drawWarn();
    const body = h('div.fin-form', {}, h('div.fin-form-2', {}, fDate.el, fRef.el), fMemo.el, warn,
      h('div.table-wrap', {}, h('table.fin-je', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الحساب (المستوى الثالث)'), h('th', {}, 'مدين'), h('th', {}, 'دائن'), h('th', {}, ''))), tbody, tfoot)),
      h('div', {}, SA.btn({ label: 'إضافة سطر', icon: 'plus', kind: 'ghost', size: 'sm', onClick: () => { rows.push({ acc: '', dr: null, cr: null }); drawRows(); recalc(); } })),
      h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), 'القيد اليدوي يُرحّل باسمك ويُسجَّل في التدقيق (GL.POSTED). التعديل بعد الترحيل بقيد عكسي فقط.'));
    const m = SA.modal({ title: 'قيد يومية يدوي', subtitle: 'المدين = الدائن قبل الترحيل', icon: 'list', size: 'lg', body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), save] });
    save.addEventListener('click', async () => {
      if (!SA.form.group([fDate, fMemo]).validate()) return; const v = valid(); if (!v.ok) { SA.toast('القيد غير متوازن', 'warn'); return; }
      m.setBusy(true); let je = null; const refTxt = String(fRef.get() || '').trim();
      try { je = await SA.api(() => { const x = GL.post({ date: fDate.get(), memo: String(fMemo.get()).trim(), ref: refTxt ? { type: 'manual', id: refTxt } : null, lines: v.used.map((r) => ({ acc: r.acc, dr: r.dr || 0, cr: r.cr || 0 })), auto: false }); audit('GL.POSTED', { target: { type: 'journal', id: x.id, label: x.memo }, after: { total: x.total, lines: x.lines.length, manual: true, date: x.date } }); return x; }); } catch (e) { m.setBusy(false); SA.fail(e); return; }
      m.setBusy(false); m.close(je); SA.toast('تم ترحيل القيد ' + je.id + ' — ' + fm.money(je.total), 'success'); SA.nav('fin/journal/' + je.id);
    });
    return m.closed;
  }
  function journalScreen(root, ctx) {
    if (ctx.path[0]) return journalDetail(root, ctx, ctx.path[0]);
    const S0 = { tab: ctx.params.tab === 'tb' ? 'tb' : 'list', list: { q: ctx.params.q || '', filters: ctx.params.acc ? { acc: ctx.params.acc } : {}, sort: { key: 'date', dir: 'desc' } } };
    return SA.live(root, () => {
      const js = get('journal'); const m0 = js.filter((j) => j.date >= mStart(0)); const manual = js.filter((j) => !j.auto);
      let dr = 0, cr = 0; js.forEach((j) => j.lines.forEach((l) => { dr += l.dr || 0; cr += l.cr || 0; })); const diff = Math.round(dr - cr);
      const head = SA.pageHead({ title: 'القيود اليومية', desc: 'كل مستند (فاتورة، تحصيل، شيك، صرف، صرف خامات، تسليم) يُرحّل قيده تلقائيًا. القيود اليدوية للتسويات فقط.', actions: [SA.btn({ label: 'قيد يدوي جديد', icon: 'plus', kind: 'primary', perm: 'fin.journal.post', onClick: () => openManualJE() })] });
      const kpis = kpiRow([
        { label: 'قيود هذا الشهر', value: String(m0.length), sub: SH(sum(m0, (j) => j.total || 0)) + ' إجمالي مدين', icon: 'list' },
        { label: 'قيود يدوية', value: String(manual.length), sub: manual.filter((j) => j.date >= mStart(0)).length + ' هذا الشهر', icon: 'edit' },
        { label: 'آلية من المستندات', value: String(js.length - manual.length), sub: pct(js.length ? (js.length - manual.length) / js.length : 0) + ' من القيود', icon: 'bolt', tone: 'success' },
        { label: 'ميزان المراجعة', value: Math.abs(diff) < 50 ? 'متوازن' : 'فرق ' + fm.num(diff), sub: 'مدين ' + SH(dr) + ' = دائن ' + SH(cr) + (diff ? ' (فرق تقريب ' + fm.num(diff) + ')' : ''), icon: 'checkcircle', tone: Math.abs(diff) < 50 ? 'success' : 'danger' }
      ]);
      const accOpts = leafAccounts().map((a) => [a.code, a.code + ' — ' + a.name]);
      const listPanel = () => table(S0, 'list', {
        caption: 'القيود اليومية',
        columns: [
          { key: 'id', label: 'القيد', sort: true, render: (j) => U.docLink(j.id) },
          { key: 'date', label: 'التاريخ', sort: true, render: (j) => fm.date(j.date) },
          { key: 'memo', label: 'البيان', render: (j) => h('div.fin-stack', {}, h('span', {}, j.memo), h('small', {}, j.lines.length + ' أسطر · ' + Array.from(new Set(j.lines.map((l) => l.acc))).slice(0, 4).join('، '))) },
          { key: 'ref', label: 'المرجع', render: (j) => (j.ref && j.ref.id ? (ERP.route(j.ref.id) ? U.docLink(j.ref.id) : h('span.num', {}, j.ref.id)) : '—') },
          { key: 'auto', label: 'النوع', sort: true, value: (j) => (j.auto ? 1 : 0), render: (j) => (j.auto ? SA.chip('آلي', 'info') : SA.chip('يدوي', 'warning')) },
          { key: 'total', label: 'الإجمالي', sort: true, class: 'fin-r', render: (j) => M(j.total) },
          { key: 'by', label: 'بواسطة', render: (j) => h('small', {}, who(j.by)) }
        ],
        rows: () => get('journal'),
        search: { placeholder: 'بحث برقم القيد أو البيان أو المرجع…', keys: ['id', 'memo', (j) => (j.ref && j.ref.id) || ''] },
        filters: [{ key: 'type', label: 'النوع', options: [['auto', 'آلي'], ['manual', 'يدوي']], test: (j, v) => (v === 'auto' ? !!j.auto : !j.auto) }, { key: 'month', label: 'الشهر', options: ERP.monthKeys(12).reverse().map((k) => [k, ERP.monthLabel(k)]), test: (j, v) => j.date.slice(0, 7) === v }, { key: 'acc', label: 'الحساب', options: accOpts, test: (j, v) => j.lines.some((l) => l.acc === v) }],
        onRowClick: (j) => SA.nav('fin/journal/' + j.id),
        empty: { icon: 'list', title: 'لا توجد قيود', text: '' }
      }).el;
      const tbPanel = () => {
        const T = types(); const mp = glMap(null, null); const rows = leafAccounts().filter((a) => mp[a.code]).map((a) => ({ a, dr: mp[a.code].dr, cr: mp[a.code].cr, bal: nat(mp, a.code, T) }));
        const tdr = sum(rows, (r) => r.dr), tcr = sum(rows, (r) => r.cr);
        return h('div', {}, h('div.table-wrap', {}, h('table.fin-pl', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الحساب'), h('th', {}, 'النوع'), h('th.fin-r', {}, 'إجمالي المدين'), h('th.fin-r', {}, 'إجمالي الدائن'), h('th.fin-r', {}, 'الرصيد (بالطبيعة)'))),
          h('tbody', {}, rows.map((r) => h('tr.is-click', { onclick: () => { S0.tab = 'list'; S0.list = { filters: { acc: r.a.code }, sort: { key: 'date', dir: 'desc' } }; tabs.setActive('list'); drawPanel(); } }, h('td', {}, h('span.num', {}, r.a.code), ' — ', r.a.name), h('td', {}, SA.chip(TYPE_LABEL[r.a.type], TYPE_TONE[r.a.type])), h('td.fin-r', {}, M(r.dr)), h('td.fin-r', {}, M(r.cr)), h('td.fin-r', {}, M(r.bal))))),
          h('tfoot', {}, h('tr.is-grand', {}, h('td', {}, 'الإجمالي'), h('td', {}, h('span.fin-bal.' + (Math.abs(tdr - tcr) < 50 ? 'is-ok' : 'is-bad'), {}, Math.abs(tdr - tcr) < 50 ? 'متوازن' : 'غير متوازن')), h('td.fin-r', {}, M(tdr)), h('td.fin-r', {}, M(tcr)), h('td'))))),
          h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'ميزان المراجعة بالمجاميع لكل الفترات المسجلة. فروق صغيرة جدًا = تقريب القيود التاريخية المجمّعة للنموذج. اضغط حسابًا لعرض قيوده.')));
      };
      const panel = h('div'); const drawPanel = () => { SA.clear(panel); panel.appendChild(S0.tab === 'tb' ? tbPanel() : listPanel()); };
      const tabs = SA.tabs({ tabs: [{ id: 'list', label: 'القيود', icon: 'list', badge: js.length }, { id: 'tb', label: 'ميزان المراجعة', icon: 'compare' }], active: S0.tab, onChange: (t) => { S0.tab = t; drawPanel(); } });
      drawPanel();
      return h('div.fin-page', {}, head, kpis, SA.card({}, tabs.el, h('div', { style: { marginTop: '12px' } }, panel)));
    }, ['journal', 'accounts']);
  }
  function journalDetail(root, ctx, id) {
    ctx.setCrumbs([{ label: 'الحسابات العامة' }, { label: 'القيود اليومية', href: '#/fin/journal' }, { label: id }]);
    return SA.live(root, () => {
      const je = ERP.find('journal', id);
      if (!je) return h('div', {}, SA.pageHead({ title: 'قيد غير موجود', back: { label: 'القيود اليومية', href: '#/fin/journal' } }), SA.empty({ icon: 'list', title: 'القيد غير موجود', text: id }));
      const dr = sum(je.lines, (l) => l.dr || 0), cr = sum(je.lines, (l) => l.cr || 0); const ok = Math.abs(dr - cr) < 1;
      const reversed = get('journal').find((j) => j.ref && j.ref.type === 'reversal' && j.ref.id === je.id);
      const reverse = async () => {
        const r = await SA.confirm({ title: 'قيد عكسي للقيد ' + je.id, icon: 'swap', text: je.memo, reasonRequired: true, reasonLabel: 'سبب العكس', confirmLabel: 'ترحيل القيد العكسي', impact: ['قيد جديد بنفس الأسطر معكوسة (المدين دائن والعكس) بتاريخ اليوم', 'القيد الأصلي يبقى كما هو — لا حذف ولا تعديل'] }); if (!r.ok) return;
        let x = null; try { x = await SA.api(() => { const n = GL.post({ memo: 'عكس القيد ' + je.id + ' — ' + r.reason, ref: { type: 'reversal', id: je.id }, lines: je.lines.map((l) => ({ acc: l.acc, dr: l.cr, cr: l.dr })), auto: false }); audit('GL.POSTED', { target: { type: 'journal', id: n.id, label: n.memo }, reason: r.reason, after: { reverses: je.id, total: n.total } }); return n; }); } catch (e) { SA.fail(e); return; }
        SA.toast('تم ترحيل القيد العكسي ' + x.id, 'success'); SA.nav('fin/journal/' + x.id);
      };
      const head = SA.pageHead({ title: 'قيد يومية ' + je.id, desc: je.memo, tags: [je.auto ? SA.chip('آلي من مستند', 'info') : SA.chip('يدوي', 'warning'), SA.chip('مُرحّل', 'success')], back: { label: 'القيود اليومية', href: '#/fin/journal' },
        actions: [!je.auto ? SA.btn({ label: 'قيد عكسي', icon: 'swap', kind: 'ghost', perm: 'fin.journal.post', reason: reversed ? 'تم عكسه بالقيد ' + reversed.id : null, onClick: reverse }) : null, SA.btn({ label: 'قيد يدوي جديد', icon: 'plus', kind: 'primary', perm: 'fin.journal.post', onClick: () => openManualJE() })] });
      const related = je.ref && je.ref.id ? get('journal').filter((j) => j.id !== je.id && j.ref && (j.ref.id === je.ref.id || j.ref.id === je.id)) : get('journal').filter((j) => j.ref && j.ref.id === je.id);
      const lines = h('div.table-wrap', {}, h('table.fin-pl', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الحساب'), h('th', {}, 'النوع'), h('th.fin-r', {}, 'مدين'), h('th.fin-r', {}, 'دائن'))),
        h('tbody', {}, je.lines.map((l) => { const a = GL.acc(l.acc) || {}; return h('tr.is-click', { onclick: () => SA.nav('fin/journal?acc=' + l.acc) }, h('td', {}, h('b.num', {}, l.acc), ' — ', a.name || l.acc), h('td', {}, a.type ? SA.chip(TYPE_LABEL[a.type], TYPE_TONE[a.type]) : '—'), h('td.fin-r', {}, l.dr ? M(l.dr) : ''), h('td.fin-r', {}, l.cr ? M(l.cr) : '')); })),
        h('tfoot', {}, h('tr.is-grand', {}, h('td', {}, 'الإجمالي'), h('td', {}, h('span.fin-bal.' + (ok ? 'is-ok' : 'is-bad'), {}, SA.icon(ok ? 'checkcircle' : 'alert', 'icon-sm'), ok ? 'متوازن' : 'غير متوازن')), h('td.fin-r', {}, M(dr)), h('td.fin-r', {}, M(cr))))));
      return h('div.fin-page', {}, head, h('div.fin-doc-wrap', {}, SA.card({ title: 'أسطر القيد' }, lines),
        h('div.fin-side', {}, SA.card({ title: 'بيانات القيد' }, SA.kv([['رقم القيد', h('b.num', {}, je.id)], ['التاريخ', fm.date(je.date)], ['البيان', je.memo], ['المرجع', je.ref && je.ref.id ? (ERP.route(je.ref.id) ? U.docLink(je.ref.id) : h('span.num', {}, je.ref.id)) : '—'], ['النوع', je.auto ? 'آلي (من مستند)' : 'يدوي'], ['بواسطة', who(je.by)], ['الحالة', 'مُرحّل'], reversed ? ['عُكس بالقيد', U.docLink(reversed.id)] : null])),
          SA.card({ title: 'قيود مرتبطة', tags: SA.chip(String(related.length), 'neutral') }, related.length ? h('ul.fin-mini', {}, related.slice(0, 8).map((j) => h('li', {}, h('div.fin-stack', {}, U.docLink(j.id), h('small', {}, j.memo)), M(j.total)))) : h('p.fin-muted', { style: { margin: 0 } }, 'لا توجد قيود أخرى على نفس المرجع.')))));
    }, ['journal']);
  }

  /* ═════════════════════════ 10. دليل الحسابات ═════════════════════════ */
  function openAddAccount(parent) {
    if (!SA.can('fin.coa.edit')) { SA.toast('ليست من صلاحياتك (fin.coa.edit)', 'warn'); return; }
    const lvl2 = get('accounts').filter((a) => a.level === 2).sort((a, b) => (a.code < b.code ? -1 : 1));
    const s = { parent: parent || (lvl2[0] || {}).code };
    const suggest = () => { const CM = childMap(); const kids = (CM[s.parent] || []).map(Number).filter((n) => !isNaN(n)); let n = kids.length ? Math.max(...kids) + 1 : Number(s.parent + '01'); while (GL.acc(String(n))) n++; return String(n); };
    const fType = h('div.fin-preview'); const drawType = () => { SA.clear(fType); const p = GL.acc(s.parent) || {}; fType.append(h('span', {}, 'النوع (موروث من الحساب الأب): ', h('b', {}, TYPE_LABEL[p.type] || '—'), ' · المستوى: ', h('b', {}, '3 (حساب ترحيل)'))); };
    const fCode = SA.form.field({ name: 'code', label: 'كود الحساب', required: true, value: suggest(), dir: 'ltr', rules: [(v) => (!/^\d{4}$/.test(String(v || '')) ? 'الكود 4 أرقام' : null), (v) => (GL.acc(String(v)) ? 'الكود مستخدم بالفعل' : null), (v) => (String(v)[0] !== String(s.parent)[0] ? 'الكود يجب أن يبدأ برقم مجموعة الحساب الأب (' + String(s.parent)[0] + ')' : null)] });
    const fParent = SA.form.field({ name: 'parent', label: 'الحساب الأب (المستوى الثاني)', type: 'select', value: s.parent, options: lvl2.map((a) => [a.code, a.code + ' — ' + a.name]), onChange: (v) => { s.parent = v; fCode.set(suggest()); drawType(); } });
    const fName = SA.form.field({ name: 'name', label: 'اسم الحساب', required: true, placeholder: 'مثال: مصروفات تدريب العاملين' });
    drawType();
    const save = h('button.btn.btn-primary', { type: 'button' }, SA.icon('plus', 'icon-sm'), 'إضافة الحساب');
    const m = SA.modal({ title: 'إضافة حساب لدليل الحسابات', subtitle: 'حسابات الترحيل في المستوى الثالث فقط', icon: 'layers', size: 'md', body: h('div.fin-form', {}, fParent.el, h('div.fin-form-2', {}, fCode.el, fName.el), fType, h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), 'الإضافة تُسجَّل في التدقيق (COA.ACCOUNT_CREATED). لا حذف للحسابات بعد الترحيل عليها — تعطيل فقط.')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), save] });
    save.addEventListener('click', async () => {
      if (!SA.form.group([fCode, fName]).validate()) return; const p = GL.acc(s.parent); const rec = { code: String(fCode.get()), name: String(fName.get()).trim(), type: p.type, parent: s.parent, level: 3, createdAt: ERP.now(), createdBy: me() };
      m.setBusy(true);
      try { await SA.api(() => { st.update('accounts', (l) => { l.push(rec); l.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)); }); audit('COA.ACCOUNT_CREATED', { target: { type: 'account', id: rec.code, label: rec.name }, after: { code: rec.code, name: rec.name, parent: rec.parent, type: rec.type } }); }); } catch (e) { m.setBusy(false); SA.fail(e); return; }
      m.setBusy(false); m.close(rec); SA.toast('تمت إضافة الحساب ' + rec.code + ' — ' + rec.name, 'success');
    });
  }
  function coaScreen(root) {
    const S0 = { collapsed: {}, q: '', type: '' };
    return SA.live(root, () => {
      const T = types(); const all = glMap(null, null); const mm = glMap(mStart(0), today()); const CM = childMap(); const accs = get('accounts');
      const bal = (code, map) => under(map, code, T, CM);
      const head = SA.pageHead({ title: 'دليل الحسابات', desc: 'ثلاثة مستويات: المجموعة ← الحساب الرئيسي ← حساب الترحيل. الأرصدة بالطبيعة المحاسبية من الأستاذ العام.', actions: [SA.btn({ label: 'إضافة حساب', icon: 'plus', kind: 'primary', perm: 'fin.coa.edit', onClick: () => openAddAccount() })] });
      const kpis = kpiRow(['asset', 'liability', 'equity', 'revenue', 'expense'].map((t) => { const l1 = accs.find((a) => a.level === 1 && a.type === t); return { label: TYPE_LABEL[t], value: l1 ? SH(bal(l1.code, all)) : '—', sub: leafAccounts((a) => a.type === t).length + ' حساب ترحيل', icon: t === 'asset' ? 'building' : t === 'liability' ? 'truck' : t === 'equity' ? 'shield' : t === 'revenue' ? 'trend' : 'activity' }; }));
      const tbody = h('tbody');
      const drawTree = () => {
        SA.clear(tbody); const q = S0.q.trim().toLowerCase();
        const match = (a) => (!q || a.code.indexOf(q) === 0 || a.name.toLowerCase().indexOf(q) >= 0) && (!S0.type || a.type === S0.type);
        const visibleLeaf = (code) => leaves(code, CM).some((c) => { const a = GL.acc(c); return a && match(a); }) || (GL.acc(code) && match(GL.acc(code)));
        const row = (a) => {
          const kids = CM[a.code] || []; const isLeaf = !kids.length; const open = !S0.collapsed[a.code] || !!q;
          const tr = h('tr.is-l' + Math.min(3, a.level || 3), isLeaf ? { onclick: SA.can('fin.journal.view') ? () => SA.nav('fin/journal?acc=' + a.code) : null, title: SA.can('fin.journal.view') ? 'عرض قيود الحساب' : null } : {},
            h('td', {}, isLeaf ? h('span', {}, h('span.num', {}, a.code), ' — ', a.name, a.createdBy ? h('small.fin-muted', {}, ' (جديد)') : null) : h('button.fin-tree-tg', { type: 'button', 'aria-expanded': String(open), onclick: () => { S0.collapsed[a.code] = open; drawTree(); } }, SA.icon(open ? 'chevdown' : 'chevron', 'icon-sm' + (open ? '' : ' icon-flip')), h('span.num', {}, a.code), ' — ', a.name)),
            h('td', {}, SA.chip(TYPE_LABEL[a.type], TYPE_TONE[a.type])), h('td.num', {}, 'م' + (a.level || 3)),
            h('td.fin-r', {}, M(bal(a.code, mm))), h('td.fin-r', {}, isLeaf ? M(bal(a.code, all)) : h('b', {}, M(bal(a.code, all)))),
            h('td', {}, !isLeaf && a.level === 2 ? SA.btn({ label: 'حساب فرعي', icon: 'plus', size: 'sm', kind: 'ghost', perm: 'fin.coa.edit', onClick: () => openAddAccount(a.code) }) : null));
          tbody.appendChild(tr);
          if (!isLeaf && open) kids.map((c) => GL.acc(c)).filter(Boolean).forEach((k) => { if (visibleLeaf(k.code)) row(k); });
        };
        accs.filter((a) => !a.parent).forEach((a) => { if (visibleLeaf(a.code)) row(a); });
        if (!tbody.children.length) tbody.appendChild(h('tr', {}, h('td', { colspan: 6 }, SA.empty({ icon: 'search', title: 'لا توجد حسابات مطابقة', text: 'جرّب كودًا أو اسمًا آخر.' }))));
      };
      const search = h('input.input', { type: 'search', placeholder: 'بحث بالكود أو الاسم…', 'aria-label': 'بحث في دليل الحسابات', value: S0.q, oninput: SA.debounce((e) => { S0.q = e.target.value; drawTree(); }, 120) });
      const typeSel = h('select.select', { 'aria-label': 'النوع', value: S0.type, onchange: (e) => { S0.type = e.target.value; drawTree(); } }, h('option', { value: '' }, 'النوع: الكل'), Object.keys(TYPE_LABEL).map((t) => h('option', { value: t }, TYPE_LABEL[t])));
      drawTree();
      return h('div.fin-page', {}, head, kpis, SA.card({ title: 'شجرة الحسابات', actions: [SA.btn({ label: 'طي الكل', icon: 'chevup', kind: 'ghost', size: 'sm', onClick: () => { accs.filter((a) => (CM[a.code] || []).length && a.level === 2).forEach((a) => { S0.collapsed[a.code] = true; }); drawTree(); } }), SA.btn({ label: 'فرد الكل', icon: 'chevdown', kind: 'ghost', size: 'sm', onClick: () => { S0.collapsed = {}; drawTree(); } })] },
        h('div.fin-toolbar', {}, h('div.input-wrap.sap-search', {}, SA.icon('search'), search), typeSel),
        h('div.table-wrap', {}, h('table.fin-tree', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الحساب'), h('th', {}, 'النوع'), h('th', {}, 'المستوى'), h('th.fin-r', {}, 'حركة الشهر'), h('th.fin-r', {}, 'الرصيد'), h('th', {}, ''))), tbody)),
        h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الرصيد بالطبيعة: مدين للأصول والمصروفات، دائن للخصوم والملكية والإيرادات. مجمع الإهلاك (1209) يظهر بالسالب تحت الأصول الثابتة. اضغط حساب ترحيل لعرض قيوده.'))));
    }, ['accounts', 'journal']);
  }

  /* ═════════════════════════ 11. تكاليف المنتجات ═════════════════════════ */
  /** demo conversion rates (EGP per routing minute) — real rates come from cost centres (Open) */
  const RATES = { 'L-01': { labour: 9, overhead: 8, energy: 6 }, 'L-02': { labour: 10, overhead: 7, energy: 3 }, 'L-03': { labour: 8, overhead: 9, energy: 7 }, 'L-04': { labour: 8, overhead: 9, energy: 8 } };
  const dealerFactor = () => { const pl = ERP.find('priceLists', 'PL-02'); return pl && pl.factor != null ? pl.factor : 0.86; };
  function costOf(itemId) {
    const it = ERP.item(itemId); if (!it) return null;
    const mats = ERP.materialsFor(itemId, 100).map((m) => { const mi = ERP.item(m.itemId) || {}; const q = m.qty / 100; return { itemId: m.itemId, qty: q, uom: m.uom, unit: mi.stdCost || 0, amount: q * (mi.stdCost || 0) }; });
    const route = ERP.routingFor(itemId).map((r) => { const rt = RATES[r.lineId] || RATES['L-02']; return { op: r.op, lineId: r.lineId, min: r.minPerUnit, labour: r.minPerUnit * rt.labour, overhead: r.minPerUnit * rt.overhead, energy: r.minPerUnit * rt.energy, amount: r.minPerUnit * (rt.labour + rt.overhead + rt.energy) }; });
    const material = sum(mats, (m) => m.amount), labour = sum(route, (r) => r.labour), overhead = sum(route, (r) => r.overhead), energy = sum(route, (r) => r.energy); const conv = labour + overhead + energy; const full = material + conv;
    const list = it.price || 0; const dealer = Math.round(list * dealerFactor());
    return { it, mats, route, material, labour, overhead, energy, conv, full, std: it.stdCost || 0, list, dealer, mList: list ? (list - full) / list : null, mDealer: dealer ? (dealer - full) / dealer : null, variance: it.stdCost ? (full - it.stdCost) / it.stdCost : null, minutes: sum(route, (r) => r.min) };
  }
  const COST_COL = { material: ERP.palette[0], labour: '#7d9cd1', overhead: '#c9a227', energy: '#a85a00' };
  const marginTxt = (v) => h('b', { style: { color: v < 0 ? 'var(--color-danger)' : v < 0.15 ? 'var(--color-warning)' : 'var(--color-success)' } }, pct(v, 1));
  function costDrawer(itemId) {
    const c = costOf(itemId); if (!c) return;
    const body = h('div.fin-form', {},
      SA.kv([['الصنف', U.itemCell(itemId)], ['التكلفة الكاملة', h('b', {}, M(c.full))], ['التكلفة المعيارية (في الحسابات)', h('span', {}, M(c.std), ' ', varChip(c.variance, true))], ['سعر القائمة', M(c.list)], ['سعر التاجر', M(c.dealer)], ['هامش القائمة', profitVal(c.mList, marginTxt)], ['هامش التاجر', profitVal(c.mDealer, marginTxt)]]),
      sectionTitle('المواد الخام (BOM × التكلفة المعيارية للخامة)', h('b.num', {}, fm.money(c.material))),
      h('div.table-wrap', {}, h('table.fin-pl', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الخامة'), h('th.fin-r', {}, 'الكمية/وحدة'), h('th.fin-r', {}, 'سعر الخامة'), h('th.fin-r', {}, 'القيمة'), h('th.fin-r', {}, '%'))),
        h('tbody', {}, c.mats.map((m) => h('tr', {}, h('td', {}, ERP.itemName(m.itemId)), h('td.fin-r', {}, fm.qty(m.qty, m.uom)), h('td.fin-r', {}, fm.num(m.unit, 2)), h('td.fin-r', {}, fm.num(m.amount, 1)), h('td.fin-r', {}, pct(c.full ? m.amount / c.full : 0, 1))))))),
      sectionTitle('التحويل (مسار التصنيع × معدلات الدقيقة)', h('span.fin-inline', {}, U.demo('معدلات تجريبية'), h('b.num', {}, fm.money(c.conv)))),
      h('div.table-wrap', {}, h('table.fin-pl', {}, h('thead', {}, h('tr', {}, h('th', {}, 'العملية'), h('th', {}, 'الخط'), h('th.fin-r', {}, 'دقيقة'), h('th.fin-r', {}, 'عمالة'), h('th.fin-r', {}, 'مصاريف'), h('th.fin-r', {}, 'طاقة'), h('th.fin-r', {}, 'القيمة'))),
        h('tbody', {}, c.route.map((r) => h('tr', {}, h('td', {}, r.op), h('td.num', {}, r.lineId), h('td.fin-r', {}, fm.num(r.min, 2)), h('td.fin-r', {}, fm.num(r.labour, 1)), h('td.fin-r', {}, fm.num(r.overhead, 1)), h('td.fin-r', {}, fm.num(r.energy, 1)), h('td.fin-r', {}, fm.num(r.amount, 1))))))),
      SA.alert('info', 'معدلات العمالة والمصاريف والطاقة لكل دقيقة قيم تجريبية لكل خط (Open) — تُستبدل بمعدلات مراكز التكلفة الفعلية. فرق كبير بين التكلفة المحسوبة والمعيارية = مراجعة BOM أو التكلفة المعيارية مع المصنع.'));
    SA.drawer({ title: 'تكلفة ' + c.it.name, subtitle: c.it.code + ' · ' + (ERP.families[c.it.family] || ''), body, size: 'lg' });
  }
  /** الهوالك في التكلفة (mod-scrap / ERP.factory): 5204 فاقد وهوالك التشغيل + 4201 إيرادات بيع خردة — آخر 30 يوم من الأستاذ العام */
  function scrapKpi() {
    const from = ERP.day(-29), to = today(); const loss = GL.balance('5204', from, to), rev = GL.balance('4201', from, to);
    let route = null; try { const m = SA.router.parse('#/mfg/scrap').module; if (m && SA.canOpen(m)) route = 'mfg/scrap'; } catch (e) { /* noop */ }
    return { label: 'فاقد وهوالك التشغيل (5204) — 30 يوم', value: SH(loss), sub: 'بعد المسترد لمخزون الهوالك 1145 · إيراد بيع خردة (4201) ' + SH(rev), icon: 'recycle', tone: loss > 0 ? 'warning' : null, href: route ? '#/' + route : null };
  }
  function costingScreen(root) {
    const S0 = { fam: 'all', q: '' };
    return SA.live(root, () => {
      const head = SA.pageHead({ title: 'تكاليف المنتجات', desc: 'تكلفة كل منتج تام = مواد خام من التركيبة (BOM) + تحويل (عمالة ومصاريف وطاقة حسب دقائق المسار) — مقارنة بالتكلفة المعيارية وأسعار البيع.', tags: [U.demo('معدلات التحويل تجريبية')] });
      if (!canCost()) return h('div.fin-page', {}, head, SA.card({}, lockedCard('data.cost.view', 'أرقام التكاليف سرية', 'التكاليف الداخلية تظهر لمن يملك صلاحية التكاليف فقط (بند 25). الشاشة متاحة لك لكن الأرقام محجوبة.')));
      const fg = get('items').filter((i) => i.kind === 'fg' && i.bomId); const costs = fg.map((i) => costOf(i.id)).filter(Boolean);
      const fams = ['door', 'clad', 'foam'];
      const avg = (list, k) => (list.length ? sum(list, (c) => c[k]) / list.length : 0);
      const famStats = fams.map((f) => { const l = costs.filter((c) => c.it.family === f); return { f, l, mList: avg(l, 'mList'), mDealer: avg(l, 'mDealer'), mat: avg(l, 'material'), lab: avg(l, 'labour'), ovh: avg(l, 'overhead'), en: avg(l, 'energy'), full: avg(l, 'full'), varc: avg(l, 'variance') }; });
      const kpis = kpiRow(famStats.map((s) => ({ label: ERP.families[s.f], value: SH(s.full) + ' / وحدة', sub: canProfit() ? 'هامش القائمة ' + pct(s.mList, 1) + ' · التاجر ' + pct(s.mDealer, 1) : 'متوسط التكلفة الكاملة · الهوامش سرية', icon: s.f === 'door' ? 'box' : s.f === 'clad' ? 'layers' : 'grid', tone: canProfit() && s.mDealer < 0.1 ? 'danger' : null })).concat([{ label: 'فرق عن التكلفة المعيارية', value: pct(avg(costs, 'variance'), 1), sub: costs.filter((c) => Math.abs(c.variance) > 0.15).length + ' صنف بفرق أكبر من 15% — مراجعة', icon: 'compare', tone: 'warning' }, scrapKpi()]));
      const struct = CH.columns({ labels: famStats.map((s) => ERP.families[s.f]), stacked: true, height: 210, fmt: (v) => Math.round(v) + '%', legend: true, series: [['material', 'مواد خام'], ['lab', 'عمالة'], ['ovh', 'مصاريف صناعية'], ['en', 'طاقة']].map((k) => ({ name: k[1], color: COST_COL[k[0] === 'lab' ? 'labour' : k[0] === 'ovh' ? 'overhead' : k[0] === 'en' ? 'energy' : 'material'], values: famStats.map((s) => (s.full ? ((k[0] === 'material' ? s.mat : s[k[0]]) / s.full) * 100 : 0)) })), title: 'هيكل التكلفة' });
      const marg = canProfit() ? h('div', {}, CH.bars(famStats.reduce((a, s) => a.concat([{ label: ERP.families[s.f], sub: 'سعر القائمة', value: Math.max(0, s.mList * 100), color: ERP.palette[0] }, { label: ERP.families[s.f], sub: 'سعر التاجر', value: Math.max(0, s.mDealer * 100), color: s.mDealer < 0.1 ? '#b9141b' : '#7d9cd1' }]), []), { fmt: (v) => v.toFixed(1) + '%', max: 100 }),
        famStats.some((s) => s.mDealer < 0) ? SA.alert('danger', 'هامش سالب بسعر التاجر في: ' + famStats.filter((s) => s.mDealer < 0).map((s) => ERP.families[s.f]).join('، ') + ' — راجع قائمة أسعار التجار أو التركيبة.') : null) : lockedCard('data.profit.view', 'الهوامش سرية', 'هوامش الربح تظهر لمن يملك صلاحية الأرباح (data.profit.view).');
      const grid = h('div.fin-costs');
      const drawGrid = () => {
        SA.clear(grid); const q = S0.q.trim().toLowerCase();
        const list = costs.filter((c) => (S0.fam === 'all' || c.it.family === S0.fam) && (!q || c.it.name.toLowerCase().indexOf(q) >= 0 || c.it.code.toLowerCase().indexOf(q) >= 0));
        if (!list.length) { grid.appendChild(SA.empty({ icon: 'search', title: 'لا توجد أصناف مطابقة' })); return; }
        list.forEach((c) => { const w = (v) => (c.full ? ((v / c.full) * 100).toFixed(1) + '%' : '0');
          grid.appendChild(h('div.fin-cost', { role: 'button', tabindex: '0', 'aria-label': 'تفاصيل تكلفة ' + c.it.name, onclick: () => costDrawer(c.it.id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); costDrawer(c.it.id); } } },
            U.itemCell(c.it.id),
            h('div.fin-sbar', { title: 'مواد ' + w(c.material) + ' · عمالة ' + w(c.labour) + ' · مصاريف ' + w(c.overhead) + ' · طاقة ' + w(c.energy) }, h('i', { style: { width: w(c.material), background: COST_COL.material } }), h('i', { style: { width: w(c.labour), background: COST_COL.labour } }), h('i', { style: { width: w(c.overhead), background: COST_COL.overhead } }), h('i', { style: { width: w(c.energy), background: COST_COL.energy } })),
            h('dl', {}, h('dt', {}, 'مواد خام (BOM)'), h('dd.num', {}, fm.money(c.material)), h('dt', {}, 'تحويل (' + fm.num(c.minutes, 1) + ' دقيقة)'), h('dd.num', {}, fm.money(c.conv)),
              h('dt.is-strong', {}, 'التكلفة الكاملة'), h('dd.is-strong.num', {}, fm.money(c.full)), h('dt', {}, 'التكلفة المعيارية'), h('dd', {}, h('span.num', {}, fm.money(c.std)), ' ', varChip(c.variance, true)),
              h('dt', {}, 'سعر القائمة / التاجر'), h('dd.num', {}, fm.num(c.list) + ' / ' + fm.num(c.dealer)),
              h('dt', {}, 'هامش القائمة'), h('dd', {}, profitVal(c.mList, marginTxt)), h('dt', {}, 'هامش التاجر'), h('dd', {}, profitVal(c.mDealer, marginTxt))))); });
      };
      const search = h('input.input', { type: 'search', placeholder: 'بحث بالصنف أو الكود…', 'aria-label': 'بحث في الأصناف', value: S0.q, oninput: SA.debounce((e) => { S0.q = e.target.value; drawGrid(); }, 120) });
      drawGrid();
      const ratesTbl = h('table.fin-pl', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الخط'), h('th.fin-r', {}, 'عمالة'), h('th.fin-r', {}, 'مصاريف'), h('th.fin-r', {}, 'طاقة'), h('th.fin-r', {}, 'الإجمالي/دقيقة'))), h('tbody', {}, Object.keys(RATES).map((k) => { const r = RATES[k]; const ln = ERP.line(k) || {}; return h('tr', {}, h('td', {}, h('span.num', {}, k), ' ', h('small.fin-muted', {}, ln.name || '')), h('td.fin-r', {}, fm.num(r.labour)), h('td.fin-r', {}, fm.num(r.overhead)), h('td.fin-r', {}, fm.num(r.energy)), h('td.fin-r', {}, h('b', {}, fm.num(r.labour + r.overhead + r.energy) + ' ج.م'))); })));
      return h('div.fin-page', {}, head, kpis,
        U.grid(3, SA.card({ title: 'هيكل التكلفة حسب العائلة (%)' }, struct), SA.card({ title: 'هامش الربح حسب العائلة', tags: canProfit() ? null : SA.chip('سري', 'neutral') }, marg), SA.card({ title: 'معدلات التحويل لكل دقيقة', tags: U.demo('Open') }, ratesTbl)),
        SA.card({ title: 'بطاقات تكلفة المنتجات التامة', tags: SA.chip(String(costs.length) + ' صنف', 'neutral') }, h('div.fin-seg', {}, segmented([['all', 'الكل']].concat(fams.map((f) => [f, ERP.families[f]])), S0.fam, (v) => { S0.fam = v; drawGrid(); }), h('div.input-wrap.sap-search', { style: { maxWidth: '300px' } }, SA.icon('search'), search)), grid));
    }, ['items', 'boms', 'priceLists']);
  }

  /* ═════════════════════════ 12. الموازنات ═════════════════════════ */
  ERP.addSeed('fin-budgets', (S, ctx) => {
    const y = new Date().getFullYear(); const cur = new Date().getMonth();
    const keys = []; for (let i = 11; i >= 1; i--) { const d = new Date(y, cur - i, 1); keys.push(d.getFullYear() + '-' + p2(d.getMonth() + 1)); }
    const tot = {}; (S.journal || []).forEach((je) => { if (keys.indexOf(je.date.slice(0, 7)) < 0) return; je.lines.forEach((l) => { tot[l.acc] = (tot[l.acc] || 0) + (l.dr || 0) - (l.cr || 0); }); });
    const FACT = { 4101: 1.06, 4102: 1.08, 4103: 1.12, 5101: 1.04, 5301: 0.96, 5302: 0.85, 5303: 1, 6101: 1.05, 6102: 0.7, 6103: 1.02, 6201: 1.12, 6202: 1, 6203: 1 };
    const SEAS = [0.9, 0.92, 1.05, 1.1, 1.05, 0.92, 0.86, 0.92, 1.06, 1.12, 1.15, 0.95];
    S.budgets = [];
    (S.accounts || []).filter((a) => a.level === 3 && (a.type === 'expense' || a.type === 'revenue')).forEach((a) => {
      const f = FACT[a.code]; if (!f) return; const avg = Math.abs(tot[a.code] || 0) / keys.length; if (avg < 1) return; const seasonal = a.type === 'revenue' || a.code === '5101';
      S.budgets.push({ id: 'BG-' + y + '-' + a.code, year: y, acc: a.code, months: SEAS.map((s) => Math.round((avg * f * (seasonal ? s : 1)) / 1000) * 1000), updatedAt: ctx.ago(60 * 24 * 45), updatedBy: 'U-35', approved: true, note: 'موازنة ' + y + ' (تجريبية)' });
    });
  });
  function budgetRange(acc, from, to) {
    let s = 0;
    get('budgets').filter((b) => b.acc === acc).forEach((b) => (b.months || []).forEach((v, i) => { const ms = ds(new Date(b.year, i, 1)), me2 = ds(new Date(b.year, i + 1, 0)); const a = from > ms ? from : ms, z = to < me2 ? to : me2; if (a > z) return; const dim = new Date(b.year, i + 1, 0).getDate(); s += (v * (ERP.daysBetween(a, z) + 1)) / dim; }));
    return Math.round(s);
  }
  function openBudgetEdit(acc) {
    if (!SA.can('fin.budgets.edit')) { SA.toast('ليست من صلاحياتك (fin.budgets.edit)', 'warn'); return; }
    const y = new Date().getFullYear(); const rec = get('budgets').find((b) => b.acc === acc && b.year === y); const vals = rec ? rec.months.slice() : new Array(12).fill(0); const before = sum(vals);
    const inputs = vals.map((v, i) => h('label.field', {}, h('span.label', {}, ERP.months[i]), h('input.input.num', { type: 'number', min: '0', step: '1000', value: v, 'aria-label': 'موازنة ' + ERP.months[i], oninput: (e) => { vals[i] = Number(e.target.value) || 0; drawTot(); } })));
    const tot = h('div.fin-preview'); const drawTot = () => { SA.clear(tot); const n = sum(vals); tot.append(h('span', {}, 'الإجمالي السنوي: ', h('b.num', {}, fm.money(n)), ' · قبل التعديل ', h('span.num', {}, fm.money(before)), ' ', varChip(before ? (n - before) / before : null, GL.acc(acc) && GL.acc(acc).type === 'expense'))); };
    const annual = h('input.input.num', { type: 'number', min: '0', step: '1000', placeholder: 'إجمالي سنوي', 'aria-label': 'إجمالي سنوي للتوزيع' });
    const spread = SA.btn({ label: 'توزيع متساوٍ على 12 شهرًا', icon: 'grid', kind: 'ghost', size: 'sm', onClick: () => { const a = Number(annual.value); if (!(a > 0)) { SA.toast('أدخل الإجمالي السنوي أولًا', 'warn'); return; } const m = Math.round(a / 12 / 100) * 100; vals.forEach((_, i) => { vals[i] = i === 11 ? Math.round(a - m * 11) : m; inputs[i].querySelector('input').value = vals[i]; }); drawTot(); } });
    const reasonEl = h('textarea.textarea', { rows: 2, placeholder: 'سبب التعديل (يُحفظ في التدقيق)…', 'aria-label': 'سبب التعديل' });
    drawTot();
    const save = h('button.btn.btn-primary', { type: 'button' }, SA.icon('check', 'icon-sm'), 'حفظ الموازنة');
    const m = SA.modal({ title: 'تعديل موازنة ' + acc + ' — ' + GL.accName(acc), subtitle: 'السنة المالية ' + y + ' (بداية السنة المالية: إعداد Open — المعروض سنة ميلادية)', icon: 'target', size: 'lg',
      body: h('div.fin-form', {}, h('div.fin-inline', {}, annual, spread), h('div.fin-months', {}, inputs), tot, h('label.field', {}, h('span.label', {}, 'سبب التعديل', h('span.req', {}, '*')), reasonEl), h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), 'يُسجَّل التعديل في التدقيق (BUDGET.CHANGED) بالقيمة قبل وبعد.')),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), save] });
    save.addEventListener('click', async () => {
      const reason = reasonEl.value.trim(); if (reason.length < 3) { SA.toast('اكتب سبب التعديل', 'warn'); reasonEl.focus(); return; }
      m.setBusy(true);
      try { await SA.api(() => { st.update('budgets', (l) => { let r = l.find((b) => b.acc === acc && b.year === y); if (!r) { r = { id: 'BG-' + y + '-' + acc, year: y, acc, months: [] }; l.push(r); } r.months = vals.slice(); r.updatedAt = ERP.now(); r.updatedBy = me(); }); audit('BUDGET.CHANGED', { target: { type: 'budget', id: 'BG-' + y + '-' + acc, label: GL.accName(acc) }, before: { annual: before }, after: { annual: sum(vals) }, reason }); if (me() !== 'U-35') SA.notify({ title: 'تعديل موازنة: ' + GL.accName(acc), body: fm.money(before) + ' ← ' + fm.money(sum(vals)) + ' — ' + reason, level: 'info', to: ['R-22'], link: '#/fin/budgets' }); }); } catch (e) { m.setBusy(false); SA.fail(e); return; }
      m.setBusy(false); m.close(true); SA.toast('تم حفظ موازنة ' + GL.accName(acc), 'success');
    });
  }
  function budgetsScreen(root) {
    const S0 = { p: 'ytd', list: { sort: { key: 'vpct', dir: 'desc' }, filters: { type: 'expense' } } };
    return liveLocal(root, (redraw) => {
      const y = new Date().getFullYear(); const t = today(); const T = types();
      const R = { mtd: [mStart(0), t, 'هذا الشهر حتى اليوم'], lm: [mStart(-1), mEnd(-1), 'الشهر الماضي'], ytd: [y + '-01-01', t, 'منذ بداية ' + y], fy: [y + '-01-01', y + '-12-31', 'السنة كاملة (الفعلي حتى اليوم)'] }[S0.p];
      const mp = glMap(R[0], S0.p === 'fy' ? t : R[1]);
      const accRows = () => leafAccounts((a) => a.type === 'expense' || a.type === 'revenue').map((a) => { const budget = budgetRange(a.code, R[0], R[1]); const actual = nat(mp, a.code, T); const variance = actual - budget; const rec = get('budgets').find((b) => b.acc === a.code && b.year === y); return { id: a.code, a, type: a.type, budget, actual, variance, vpct: budget ? variance / budget : null, rec }; }).filter((r) => r.budget || r.actual);
      const rows = accRows(); const ex = rows.filter((r) => r.type === 'expense'), rv = rows.filter((r) => r.type === 'revenue');
      const exB = sum(ex, (r) => r.budget), exA = sum(ex, (r) => r.actual), rvB = sum(rv, (r) => r.budget), rvA = sum(rv, (r) => r.actual);
      const overs = ex.filter((r) => r.budget && r.variance > 0).sort((a, b) => b.variance - a.variance);
      const head = SA.pageHead({ title: 'الموازنات', desc: 'الموازنة السنوية لكل حساب إيراد ومصروف مقابل الفعلي من الأستاذ العام. الانحراف بالأحمر = غير مواتٍ.', tags: [U.demo('موازنة ' + y + ' تجريبية')] });
      const kpis = kpiRow([
        { label: 'الإيرادات: الفعلي / الموازنة', value: pct(rvB ? rvA / rvB : null, 1), sub: SH(rvA) + ' من ' + SH(rvB), icon: 'trend', tone: rvB && rvA < rvB * 0.95 ? 'warning' : 'success' },
        { label: 'التكاليف والمصروفات: الفعلي / الموازنة', value: pct(exB ? exA / exB : null, 1), sub: SH(exA) + ' من ' + SH(exB), icon: 'activity', tone: exB && exA > exB * 1.03 ? 'danger' : 'success' },
        { label: 'حسابات تجاوزت الموازنة', value: String(overs.length), sub: overs.length ? 'أكبرها: ' + overs[0].a.name : 'لا يوجد تجاوز', icon: 'alert', tone: overs.length ? 'warning' : 'success' },
        { label: 'أكبر تجاوز', value: overs.length ? SH(overs[0].variance) : '—', sub: overs.length ? pct(overs[0].vpct, 1) + ' فوق الموازنة' : '', icon: 'target', tone: overs.length && overs[0].vpct > 0.1 ? 'danger' : null }
      ]);
      const mk = ERP.months.map((_, i) => y + '-' + p2(i + 1)); const curK = t.slice(0, 7);
      const expLeaves = leafAccounts((a) => a.type === 'expense');
      const trend = CH.line({ labels: ERP.months.map((x) => x), series: [{ name: 'موازنة التكاليف والمصروفات', values: mk.map((k) => { const r = keyRange(k); return sum(expLeaves, (a) => budgetRange(a.code, r.from, r.to)); }), color: '#8a8a8a', dashed: true }, { name: 'الفعلي', values: mk.map((k) => { if (k > curK) return null; const r = keyRange(k); const m2 = glMap(r.from, r.to); return sum(expLeaves, (a) => nat(m2, a.code, T)); }), color: ERP.palette[3] }], height: 220, title: 'الموازنة مقابل الفعلي شهريًا' });
      const varBars = ex.filter((r) => r.budget).sort((a, b) => b.vpct - a.vpct).slice(0, 8);
      const vchart = varBars.length ? CH.bars(varBars.map((r) => ({ label: r.a.name, sub: SH(r.actual) + ' من ' + SH(r.budget), value: Math.max(0, (r.actual / r.budget) * 100), color: r.vpct > 0.1 ? '#b9141b' : r.vpct > 0 ? '#a85a00' : '#147a3d' })), { fmt: (v) => v.toFixed(0) + '%', max: Math.max(120, ...varBars.map((r) => (r.actual / r.budget) * 100)) }) : SA.empty({ icon: 'target', title: 'لا توجد موازنات' });
      const tbl = table(S0, 'list', {
        caption: 'الموازنة مقابل الفعلي',
        columns: [
          { key: 'acc', label: 'الحساب', sort: true, value: (r) => r.a.code, render: (r) => h('div.fin-stack', {}, h('b', {}, r.a.name), h('small.num', {}, r.a.code)) },
          { key: 'type', label: 'النوع', render: (r) => SA.chip(TYPE_LABEL[r.type], TYPE_TONE[r.type]) },
          { key: 'budget', label: 'الموازنة', sort: true, class: 'fin-r', render: (r) => (r.budget ? M(r.budget) : h('span.fin-muted', {}, 'بدون موازنة')) },
          { key: 'actual', label: 'الفعلي', sort: true, class: 'fin-r', render: (r) => M(r.actual) },
          { key: 'variance', label: 'الانحراف', sort: true, class: 'fin-r', render: (r) => h('span', { style: { color: (r.type === 'expense' ? r.variance > 0 : r.variance < 0) && Math.abs(r.vpct || 0) > 0.02 ? 'var(--color-danger)' : 'var(--color-success)' } }, (r.variance > 0 ? '+' : '') + fm.money(r.variance)) },
          { key: 'vpct', label: 'الانحراف %', sort: true, render: (r) => varChip(r.vpct, r.type === 'expense') },
          { key: 'use', label: 'الاستهلاك', render: (r) => (r.budget ? CH.meter(r.actual / r.budget, { tone: r.type === 'expense' ? (r.actual > r.budget ? 'danger' : r.actual > r.budget * 0.9 ? 'warning' : 'success') : r.actual >= r.budget ? 'success' : 'warning' }) : '—') },
          { key: 'upd', label: 'آخر تعديل', render: (r) => (r.rec ? h('small', {}, who(r.rec.updatedBy) + ' · ' + SA.fmt.rel(r.rec.updatedAt)) : '—') }
        ],
        rows: accRows,
        search: { placeholder: 'بحث بالحساب…', keys: [(r) => r.a.code, (r) => r.a.name] },
        filters: [{ key: 'type', label: 'النوع', options: [['expense', 'التكاليف والمصروفات'], ['revenue', 'الإيرادات']] }, { key: 'flag', label: 'الانحراف', options: [['bad', 'غير مواتٍ'], ['good', 'مواتٍ'], ['nobud', 'بدون موازنة']], test: (r, v) => (v === 'nobud' ? !r.budget : v === 'bad' ? (r.type === 'expense' ? r.variance > 0 : r.variance < 0) && !!r.budget : (r.type === 'expense' ? r.variance <= 0 : r.variance >= 0) && !!r.budget) }],
        rowActions: (r) => [{ label: 'تعديل الموازنة', icon: 'edit', disabled: SA.can('fin.budgets.edit') ? false : 'ليست من صلاحياتك (fin.budgets.edit)', onClick: () => openBudgetEdit(r.a.code) }, { label: 'قيود الحساب', icon: 'list', hidden: !SA.can('fin.journal.view'), onClick: () => SA.nav('fin/journal?acc=' + r.a.code) }],
        empty: { icon: 'target', title: 'لا توجد بيانات', text: 'أضف موازنة لحساب من «تعديل الموازنة».' }
      });
      return h('div.fin-page', {}, head, h('div.fin-seg', {}, segmented([['mtd', 'هذا الشهر'], ['lm', 'الشهر الماضي'], ['ytd', 'منذ بداية السنة'], ['fy', 'السنة كاملة']], S0.p, (v) => { S0.p = v; redraw(); }), h('small.fin-muted', {}, R[2] + ' · الموازنة الشهرية تُوزَّع على أيام الشهر')), kpis,
        U.grid(2, SA.card({ title: 'التكاليف والمصروفات: الموازنة مقابل الفعلي — ' + y }, trend), SA.card({ title: 'نسبة الاستهلاك حسب الحساب (' + R[2] + ')' }, vchart)), SA.card({ flush: false }, tbl.el));
    }, ['budgets', 'journal', 'accounts']);
  }

  /* ═════════════════════════ 13. القوائم المالية ═════════════════════════ */
  function statementRows(tab, P, cmpMode) {
    const T = types(); const CM = childMap(); const accs = get('accounts');
    const useBudget = cmpMode === 'budget' && tab === 'is';
    const cur = glMap(P.from, P.to); const prv = glMap(P.cmp.from, P.cmp.to);
    const vC = (code) => nat(cur, code, T); const vP = useBudget ? (code) => budgetRange(code, P.from, P.to) : (code) => nat(prv, code, T);
    const rows = [];
    if (tab === 'is') {
      const section = (title, l1) => {
        rows.push({ label: title, kind: 'head' }); let tc = 0, tp = 0;
        accs.filter((a) => a.parent === l1).forEach((g) => { leaves(g.code, CM).forEach((code) => { const c = vC(code), p = vP(code); if (!c && !p) return; rows.push({ label: code + ' — ' + GL.accName(code), kind: 'line', vals: [c, p], code, inverse: l1 !== '4' }); tc += c; tp += p; }); });
        rows.push({ label: 'إجمالي ' + title, kind: 'total', vals: [tc, tp], inverse: l1 !== '4' }); return [tc, tp];
      };
      const rev = section('الإيرادات', '4'); const cos = section('تكاليف الإنتاج والمبيعات', '5');
      const gp = [rev[0] - cos[0], rev[1] - cos[1]];
      rows.push({ label: 'مجمل الربح', kind: 'grand', vals: gp, profit: true }, { label: 'هامش مجمل الربح', kind: 'pct', vals: [rev[0] ? gp[0] / rev[0] : null, rev[1] ? gp[1] / rev[1] : null], profit: true });
      const opx = section('المصروفات التشغيلية والتمويلية', '6');
      const np = [gp[0] - opx[0], gp[1] - opx[1]];
      rows.push({ label: 'صافي الربح قبل الضرائب', kind: 'grand', vals: np, profit: true }, { label: 'هامش صافي الربح', kind: 'pct', vals: [rev[0] ? np[0] / rev[0] : null, rev[1] ? np[1] / rev[1] : null], profit: true }, { label: 'ضريبة الدخل', kind: 'note', note: 'Open — تُحدَّد مع المستشار الضريبي' });
    } else if (tab === 'bs') {
      const A = glMap(null, P.to), B = glMap(null, P.cmp.to);
      const vA = (code) => nat(A, code, T), vB = (code) => nat(B, code, T);
      const block = (title, l1) => { rows.push({ label: title, kind: 'head' }); let ta = 0, tb = 0; accs.filter((a) => a.parent === l1).forEach((g) => { let ga = 0, gb = 0; const ls = leaves(g.code, CM).map((code) => { const a = vA(code), b = vB(code); ga += a; gb += b; return { label: code + ' — ' + GL.accName(code), kind: 'line', vals: [a, b], code }; }).filter((r) => r.vals[0] || r.vals[1]); if (!ls.length) return; rows.push({ label: g.name, kind: 'sub' }); ls.forEach((r) => rows.push(r)); rows.push({ label: 'إجمالي ' + g.name, kind: 'total', vals: [ga, gb] }); ta += ga; tb += gb; }); return [ta, tb]; };
      const as = block('الأصول', '1'); rows.push({ label: 'إجمالي الأصول', kind: 'grand', vals: as });
      const li = block('الخصوم', '2'); rows.push({ label: 'إجمالي الخصوم', kind: 'grand', vals: li });
      rows.push({ label: 'حقوق الملكية', kind: 'head' }); let ea = 0, eb = 0;
      leaves('3', CM).forEach((code) => { const a = vA(code), b = vB(code); ea += a; eb += b; rows.push({ label: code + ' — ' + GL.accName(code), kind: 'line', vals: [a, b], code }); });
      const earn = [typeSum(A, 'revenue', T) - typeSum(A, 'expense', T), typeSum(B, 'revenue', T) - typeSum(B, 'expense', T)];
      rows.push({ label: 'صافي ربح الفترات غير المُقفلة', kind: 'line', vals: earn, profit: true });
      const eq = [ea + earn[0], eb + earn[1]]; rows.push({ label: 'إجمالي حقوق الملكية', kind: 'total', vals: eq, profit: true });
      const le = [li[0] + eq[0], li[1] + eq[1]]; rows.push({ label: 'إجمالي الخصوم وحقوق الملكية', kind: 'grand', vals: le });
      rows.push({ label: 'فرق الميزان (الأصول − الخصوم وحقوق الملكية)', kind: 'check', vals: [as[0] - le[0], as[1] - le[1]] });
    } else {
      const open = [cashPosition(addDays(P.from, -1)), cashPosition(addDays(P.cmp.from, -1))];
      const cc = [cashCats(P.from, P.to), cashCats(P.cmp.from, P.cmp.to)]; const v = (k) => [cc[0][k], cc[1][k]];
      rows.push({ label: 'رصيد النقدية أول الفترة', kind: 'total', vals: open }, { label: 'الأنشطة التشغيلية', kind: 'head' });
      [['cust', 'متحصلات من العملاء (نقدًا وتحويلًا وتحصيل شيكات)'], ['sup', 'مدفوعات للموردين'], ['pay', 'أجور ومستحقات العاملين'], ['opex', 'مصروفات تشغيل وإدارية'], ['tax', 'ضرائب (ضريبة القيمة المضافة)'], ['other', 'أخرى']].forEach((x) => { const r = v(x[0]); if (r[0] || r[1]) rows.push({ label: x[1], kind: 'line', vals: r }); });
      const op = [cc[0].cust + cc[0].sup + cc[0].pay + cc[0].opex + cc[0].tax + cc[0].other, cc[1].cust + cc[1].sup + cc[1].pay + cc[1].opex + cc[1].tax + cc[1].other];
      rows.push({ label: 'صافي التدفق من الأنشطة التشغيلية', kind: 'total', vals: op }, { label: 'الأنشطة الاستثمارية', kind: 'head' }, { label: 'شراء/بيع أصول ثابتة', kind: 'line', vals: v('inv') }, { label: 'الأنشطة التمويلية', kind: 'head' }, { label: 'قروض ورأس مال وأعباء تمويل', kind: 'line', vals: v('fin') });
      const net = [op[0] + cc[0].inv + cc[0].fin, op[1] + cc[1].inv + cc[1].fin];
      rows.push({ label: 'صافي التغير في النقدية', kind: 'grand', vals: net }, { label: 'رصيد النقدية آخر الفترة', kind: 'grand', vals: [open[0] + net[0], open[1] + net[1]] }, { label: 'التحويلات بين البنوك والخزائن مستبعدة (لا تغيّر إجمالي النقدية)', kind: 'note', note: '' });
    }
    return rows;
  }
  function statementsScreen(root, ctx) {
    const S0 = { p: PERIODS.some((x) => x[0] === ctx.params.p) ? ctx.params.p : 'ytd', tab: ['is', 'bs', 'cf'].indexOf(ctx.params.tab) >= 0 ? ctx.params.tab : 'is', cmp: null };
    const TABS = { is: 'قائمة الدخل', bs: 'المركز المالي', cf: 'التدفقات النقدية' };
    return SA.live(root, () => {
      const box = h('div');
      const canExport = SA.can('fin.statements.export') && SA.canSensitive('finance.reports.export');
      const exportReason = !SA.can('fin.statements.export') ? 'ليست من صلاحياتك (fin.statements.export)' : !SA.canSensitive('finance.reports.export') ? 'تصدير التقارير المالية صلاحية حساسة منفصلة (finance.reports.export)' : null;
      let current = null;
      const draw = () => {
        SA.clear(box); const P = period(S0.p); const cmpMode = S0.cmp || (S0.p === 'ytd' || S0.p === 'l12' ? 'budget' : 'prev'); const useBudget = cmpMode === 'budget' && S0.tab === 'is';
        const rows = statementRows(S0.tab, P, cmpMode); const cmpLabel = useBudget ? 'الموازنة' : S0.tab === 'bs' ? 'في ' + fm.date(P.cmp.to) : P.cmp.label;
        const curLabel = S0.tab === 'bs' ? 'في ' + fm.date(P.to) : P.label;
        const hasPrev = get('journal').some((j) => j.date >= P.cmp.from && j.date <= P.cmp.to);
        current = { rows, curLabel, cmpLabel, P };
        const cell = (r, i) => { if (r.kind === 'head' || r.kind === 'sub' || r.kind === 'note') return ''; if (r.profit && !canProfit()) return lockChip('data.profit.view'); const v = r.vals[i]; if (r.kind === 'pct') return pct(v, 1); if (r.kind === 'check') return h('span.fin-bal.' + (Math.abs(v) < 100 ? 'is-ok' : 'is-bad'), {}, Math.abs(v) < 100 ? 'متوازن' : fm.money(v)); return M(v); };
        const chg = (r) => { if (!r.vals || r.kind === 'pct' || r.kind === 'check' || (r.profit && !canProfit())) return ''; const a = r.vals[0], b = r.vals[1]; if (!b) return ''; return varChip((a - b) / Math.abs(b), r.inverse); };
        box.append(
          !hasPrev && !useBudget && S0.tab !== 'bs' ? SA.alert('info', 'لا توجد بيانات مسجلة لفترة المقارنة (' + P.cmp.label + ') في النموذج — سجل الدفاتر يبدأ قبل 12 شهرًا. اختر «المقارنة بالموازنة» لقائمة الدخل.') : null,
          h('div.table-wrap', {}, h('table.fin-pl', { 'aria-label': TABS[S0.tab] }, h('thead', {}, h('tr', {}, h('th', {}, 'البند'), h('th.fin-r', {}, curLabel), h('th.fin-r', {}, cmpLabel), h('th.fin-r', {}, 'التغير'))),
            h('tbody', {}, rows.map((r) => h('tr.is-' + (r.kind === 'sub' ? 'head' : r.kind === 'check' ? 'note' : r.kind) + (r.code && SA.can('fin.journal.view') ? '.is-click' : ''), r.code && SA.can('fin.journal.view') ? { onclick: () => SA.nav('fin/journal?acc=' + r.code), title: 'قيود الحساب' } : {},
              h('td', { style: r.kind === 'sub' ? { color: 'var(--color-text)', fontWeight: 700, borderBottomWidth: '1px' } : null }, r.label, r.kind === 'note' && r.note ? h('span', {}, ' ', SA.openValue(r.note)) : null), h('td.fin-r', {}, cell(r, 0)), h('td.fin-r', {}, cell(r, 1)), h('td.fin-r', {}, chg(r))))))),
          h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, S0.tab === 'is' ? 'من الأستاذ العام للفترة ' + fm.date(P.from) + ' — ' + fm.date(P.to) + '. ' + (canProfit() ? '' : 'بنود الأرباح محجوبة — تحتاج صلاحية data.profit.view. ') + 'الإقفال وضريبة الدخل: Open.' : S0.tab === 'bs' ? 'الأرصدة التراكمية حتى نهاية الفترة. أرباح الفترات غير المُقفلة تظهر ضمن حقوق الملكية حتى إقفال السنة (Open).' : 'الطريقة المباشرة من حركة حسابات البنوك والخزائن، مصنفة حسب الحساب المقابل في القيد.')));
      };
      const head = SA.pageHead({ title: 'القوائم المالية', desc: 'قائمة الدخل والمركز المالي والتدفقات النقدية من الأستاذ العام مباشرة — لفترة تختارها مع عمود مقارنة.', tags: [U.demo('بيانات تجريبية')],
        actions: [SA.btn({ label: 'تصدير CSV', icon: 'download', kind: 'ghost', reason: canExport ? null : exportReason, onClick: async () => {
          if (!current) return; const csv = SA.csv([['البند', current.curLabel, current.cmpLabel]].concat(current.rows.filter((r) => r.vals).map((r) => [r.label].concat(r.vals.map((v) => (r.profit && !canProfit() ? 'سري' : r.kind === 'pct' ? pct(v, 1) : Math.round(v || 0)))))));
          try { await SA.api(() => { audit('EXPORT.REPORT', { target: { type: 'report', id: 'fin.statements.' + S0.tab, label: TABS[S0.tab] + ' — ' + current.P.label }, after: { rows: current.rows.length, period: current.P.from + '…' + current.P.to, format: 'CSV', profitHidden: !canProfit() } }); }, { ms: 150 }); } catch (e) { SA.fail(e); return; }
          SA.download('EG-' + S0.tab + '-' + current.P.from + '_' + current.P.to + '.csv', csv, 'text/csv'); SA.toast('تم تصدير ' + TABS[S0.tab] + (canProfit() ? '' : ' (بنود الأرباح «سري»)'), 'success'); } })] });
      const tabs = SA.tabs({ tabs: [{ id: 'is', label: TABS.is, icon: 'trend' }, { id: 'bs', label: TABS.bs, icon: 'layers' }, { id: 'cf', label: TABS.cf, icon: 'activity' }], active: S0.tab, onChange: (t) => { S0.tab = t; draw(); } });
      const per = segmented(PERIODS, S0.p, (v) => { S0.p = v; S0.cmp = null; cmpSeg.replaceWith((cmpSeg = mkCmp())); draw(); });
      const mkCmp = () => segmented([['prev', 'المقارنة بالفترة السابقة'], ['budget', 'المقارنة بالموازنة']], S0.cmp || (S0.p === 'ytd' || S0.p === 'l12' ? 'budget' : 'prev'), (v) => { S0.cmp = v; draw(); });
      let cmpSeg = mkCmp();
      draw();
      return h('div.fin-page', {}, head, SA.card({}, tabs.el, h('div.fin-seg', { style: { marginTop: '12px' } }, per, cmpSeg), box));
    }, ['journal', 'accounts', 'budgets']);
  }

  /* ═════════════════════════ registration ═════════════════════════ */
  const REG = (id, group, title, icon, route, perm, order, render, extra) => SA.register(Object.assign({ id, app: 'fin', group, title, icon, route, perm, order, moduleKey: 'finance', render }, extra || {}));
  REG('fin-dashboard', 'fin-dash', 'لوحة المالية', 'dashboard', 'fin/dashboard', 'fin.dashboard.view', 1, (root) => dashboard(root), { desc: 'السيولة والتحصيل والمدفوعات والضريبة' });
  REG('fin-invoices', 'fin-ar', 'فواتير البيع', 'receipt', 'fin/invoices', 'fin.invoices.view', 10, invoicesScreen, { desc: 'الفواتير وجاهز للفوترة', badge() { const n = readyToInvoice().length; return n || null; } });
  REG('fin-receipts', 'fin-ar', 'سندات القبض', 'coins', 'fin/receipts', 'fin.receipts.view', 11, receiptsScreen, { desc: 'التحصيلات' });
  REG('fin-cheques', 'fin-ar', 'الشيكات', 'doc', 'fin/cheques', 'fin.cheques.view', 12, chequesScreen, { desc: 'سجل الشيكات ودورة التحصيل', badge() { const n = get('cheques').filter((c) => c.status === 'bounced').length; return n || null; } });
  REG('fin-aging', 'fin-ar', 'أعمار الديون', 'clock', 'fin/aging', 'fin.aging.view', 13, agingScreen, { desc: 'أعمار الديون وكشوف الحساب' });
  REG('fin-bills', 'fin-ap', 'فواتير الموردين', 'inbox', 'fin/bills', 'fin.bills.view', 20, billsScreen, { desc: 'مستحقات الموردين' });
  REG('fin-vouchers', 'fin-ap', 'سندات الصرف', 'send', 'fin/vouchers', 'fin.vouchers.view', 21, vouchersScreen, { desc: 'إنشاء / اعتماد / تنفيذ', badge() { const n = get('vouchers').filter((v) => v.status === 'approved').length; return n || null; } });
  REG('fin-banks', 'fin-cash', 'البنوك والخزائن', 'building', 'fin/banks', 'fin.banks.view', 30, banksScreen, { desc: 'الأرصدة والحركات والتحويلات' });
  REG('fin-journal', 'fin-gl', 'القيود اليومية', 'list', 'fin/journal', 'fin.journal.view', 40, journalScreen, { desc: 'القيود وميزان المراجعة' });
  REG('fin-coa', 'fin-gl', 'دليل الحسابات', 'layers', 'fin/coa', 'fin.coa.view', 41, (root) => coaScreen(root), { desc: 'شجرة الحسابات' });
  REG('fin-costing', 'fin-cost', 'تكاليف المنتجات', 'pie', 'fin/costing', 'fin.costing.view', 50, (root) => costingScreen(root), { desc: 'تكلفة المنتج والهوامش' });
  REG('fin-budgets', 'fin-cost', 'الموازنات', 'target', 'fin/budgets', 'fin.budgets.view', 51, (root) => budgetsScreen(root), { desc: 'الموازنة مقابل الفعلي' });
  REG('fin-statements', 'fin-rep', 'القوائم المالية', 'chart', 'fin/statements', 'fin.statements.view', 60, statementsScreen, { desc: 'الدخل والمركز المالي والتدفقات' });

  if (SA.search && SA.search.register) {
    const has = (s, q) => String(s || '').toLowerCase().indexOf(String(q).toLowerCase()) >= 0;
    SA.search.register({ id: 'fin-docs', label: 'المستندات المالية', perm: 'fin.invoices.view', query: (q) => (q && q.length >= 3 ? [].concat(
      get('invoices').filter((i) => has(i.id, q)).slice(0, 4).map((i) => ({ title: 'فاتورة ' + i.id, sub: ERP.customerName(i.customerId) + ' · ' + fm.money(i.total), icon: 'receipt', route: 'fin/invoices/' + i.id })),
      SA.can('fin.vouchers.view') ? get('vouchers').filter((v) => has(v.id, q) || has(v.payee, q)).slice(0, 3).map((v) => ({ title: 'سند صرف ' + v.id, sub: v.payee + ' · ' + fm.money(v.amount), icon: 'send', route: 'fin/vouchers/' + v.id })) : [],
      SA.can('fin.journal.view') ? get('journal').filter((j) => has(j.id, q)).slice(0, 3).map((j) => ({ title: 'قيد ' + j.id, sub: j.memo, icon: 'list', route: 'fin/journal/' + j.id })) : []) : []) });
  }

  ERP.fin = { openReceipt, openVoucher, issueInvoice, readyToInvoice, arByCustomer, cashPosition, soaRows, costOf, forecast, executeVoucher };
})();
