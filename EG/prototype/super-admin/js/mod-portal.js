/* EG ERP prototype — mod-portal.js  (بوابة التاجر — Dealer portal · app 'portal' · group 'portal-main')
   Screens (registered in tab order — the dealer shell builds its tabs from them):
     portal-catalog   portal/catalog[?q=&family=]   portal.catalog.view    الكتالوج بأسعار التاجر فقط + اختيار المقاس/اللون (SKUs موجودة فقط) + «أضف للطلب»
     portal-order     portal/order[?done=SO-id]     portal.orders.create   سلة الطلب + الفاتورة المبدئية الحية + الهاتف/وقت الاتصال → ERP.flow.createOrder + submitOrder → pending_review (بنود 27/48)
     portal-orders    portal/orders[/SO-id]         portal.orders.view     طلباتي + تتبع المراحل (تم الإرسال → تأكيد هاتفي → تصنيع → جاهز → في الطريق → تم التسليم → مُفوتر) + أذون التسليم + الفواتير + «أعد الطلب»
     portal-invoices  portal/invoices[/INV-id]      portal.invoices.view   فواتيري (مدفوع/متبقي/استحقاق) + عرض قابل للطباعة
     portal-statement portal/statement              portal.statement.view  كشف حساب برصيد جارٍ + استخدام حد الائتمان + أعمار الديون + الشيكات
     portal-support   portal/support[?so=|?inv=]    portal.support.create  شكوى/استفسار → tickets[] (نفس شكل الـseed) + PORTAL.SUPPORT_REQUEST + إشعار R-19
   Data rules: every screen is filtered by ERP.portalCustomerId() (dealer → user.customerId; owner preview → C-001 with a «معاينة» banner).
   Prices = ERP.flow.priceFor(customer, item) only · no internal costs · no other customers · links stay inside portal/* (never internal routes).
   Cart = sessionStorage per user + customer ('eg.portal.cart.<userId>.<customerId>'), SA.emit('portal.cart') on change.
   Additive fields: salesOrders[].proformaNo / delivery / requestedDate · tickets[].description / attachments / openedBy. */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP;
  if (!SA || !ERP || !ERP.flow) return;
  const h = SA.h, st = SA.store;

  /* ───────────────────────── styles ───────────────────────── */
  (function () {
    if (document.querySelector('style[data-mod="portal"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'portal');
    s.textContent = `
.ptl-wrap { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.ptl-preview { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 14px; border-radius: 12px; background: var(--color-primary-tint); color: var(--eg-navy); border: 1px dashed #b9c8e3; font-size: 13px; }
.ptl-preview small { color: var(--color-text-muted); } .ptl-preview .sap-linkbtn { margin-inline-start: auto; }
.ptl-muted { color: var(--color-text-muted); }
/* hero */
.ptl-hero { position: relative; overflow: hidden; border-radius: 22px; background: linear-gradient(135deg, var(--eg-navy) 0%, var(--eg-navy-deep) 100%); color: #fff; padding: 28px; display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 24px; align-items: center; }
.ptl-hero::after { content: ""; position: absolute; inset-block-start: -80px; inset-inline-end: -60px; width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,.10), transparent 70%); pointer-events: none; }
.ptl-hero h1 { color: #fff; margin: 6px 0 0; font-size: clamp(1.3rem, 3.4vw, 1.95rem); line-height: 1.35; }
.ptl-hero p { color: #c9d6ee; margin: 8px 0 0; max-width: 62ch; line-height: 1.8; }
.ptl-eyebrow { font-size: 12px; font-weight: 700; color: #ffb3b6; }
.ptl-hero-sw { margin-top: 16px; max-width: 520px; } .ptl-hero-sw .input { background: #fff; min-height: 48px; border-color: transparent; }
.ptl-hero-acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.ptl-glass { background: rgba(255,255,255,.12); color: #fff; border: 1px solid rgba(255,255,255,.3); text-decoration: none; }
.ptl-glass:hover { background: rgba(255,255,255,.2); color: #fff; }
.ptl-hero-stats { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
.ptl-hstat { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); border-radius: 12px; padding: 8px 14px; display: flex; flex-direction: column; min-width: 118px; }
.ptl-hstat small { color: #c9d6ee; font-size: 11.5px; } .ptl-hstat b { font: 700 1.1rem var(--font-en); color: #fff; }
.ptl-hero-art { position: relative; justify-self: end; width: 100%; max-width: 380px; }
.ptl-hero-art > img { width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: #fff; border-radius: var(--radius-brand); padding: 12px; display: block; }
.ptl-hero-thumbs { position: absolute; inset-block-end: -10px; inset-inline-start: -14px; display: flex; gap: 8px; }
.ptl-hero-thumbs img { width: 74px; height: 58px; object-fit: contain; background: #fff; border-radius: 12px; padding: 4px; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
/* family chips + filters */
.ptl-fams { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 4px; scrollbar-width: none; } .ptl-fams::-webkit-scrollbar { display: none; }
.ptl-fam { flex: none; display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px 6px 10px; min-height: 44px; border-radius: 999px; border: 1.5px solid var(--color-border-strong); background: #fff; color: var(--color-text); font: 600 var(--text-dense) var(--font-ar); cursor: pointer; }
.ptl-fam img { width: 30px; height: 24px; object-fit: contain; } .ptl-fam .icon { width: 18px; height: 18px; color: var(--eg-navy); }
.ptl-fam[aria-pressed="true"] { background: var(--eg-navy); color: #fff; border-color: var(--eg-navy); } .ptl-fam[aria-pressed="true"] .icon { color: #fff; }
.ptl-fam[aria-pressed="true"] img { background: #fff; border-radius: 6px; }
.ptl-n { font: 700 11px var(--font-en); background: var(--color-neutral-tint); color: var(--color-text-muted); border-radius: 999px; padding: 1px 7px; }
.ptl-fam[aria-pressed="true"] .ptl-n { background: rgba(255,255,255,.18); color: #fff; }
.ptl-filters { display: flex; gap: 10px 16px; align-items: center; flex-wrap: wrap; background: #fff; border: 1px solid var(--color-border); border-radius: 14px; padding: 10px 14px; }
.ptl-filters .select { min-height: 40px; width: auto; min-width: 140px; }
.ptl-filters > * { min-width: 0; max-width: 100%; }
.ptl-fl { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: var(--color-text-muted); font-weight: 600; }
.ptl-swatches { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; min-width: 0; }
.ptl-sw { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #fff; padding: 0; cursor: pointer; background: var(--c); box-shadow: 0 0 0 1px var(--color-border-strong); }
.ptl-sw[aria-pressed="true"] { box-shadow: 0 0 0 2.5px var(--eg-navy); }
.ptl-count { margin-inline-start: auto; font-size: 12.5px; color: var(--color-text-muted); font-weight: 600; }
/* product grid */
.ptl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 258px), 1fr)); gap: 16px; }
.ptl-span { grid-column: 1 / -1; }
.ptl-card .cat-img { position: relative; border: 0; width: 100%; cursor: pointer; font: inherit; color: inherit; aspect-ratio: 16 / 11; overflow: hidden; }
.ptl-card .cat-img > img, .ptl-card .cat-img > .ptl-accimg { position: absolute; inset: 12px; width: calc(100% - 24px); height: calc(100% - 24px); max-height: none; object-fit: contain; transition: transform .25s ease; }
.ptl-card:hover .cat-img > img { transform: scale(1.04); }
.ptl-card .cat-img { background: #fff; border-bottom: 1px solid var(--color-border); }
.ptl-imgtag { position: absolute; inset-block-end: 10px; inset-inline-start: 10px; display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,.94); border: 1px solid var(--color-border); border-radius: 999px; padding: 3px 10px 3px 6px; font: 700 12px var(--font-en); color: var(--eg-navy); box-shadow: 0 2px 8px rgba(2,26,67,.08); }
.ptl-imgtag .erp-swatch { width: 14px; height: 14px; border-radius: 50%; }
.ptl-more { margin: 8px 0 0; font-size: 12.5px; color: var(--color-text-muted); display: flex; gap: 6px; align-items: flex-start; }
.ptl-card .cat-img:focus-visible { outline: 3px solid var(--eg-navy); outline-offset: -3px; }
.ptl-av-pos { position: absolute; inset-block-start: 10px; inset-inline-start: 10px; }
.ptl-mine { position: absolute; inset-block-start: 10px; inset-inline-end: 10px; display: inline-flex; align-items: center; gap: 4px; background: var(--eg-navy); color: #fff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; }
.ptl-accimg { width: 100%; height: 100%; min-height: 120px; display: grid; place-items: center; align-content: center; gap: 6px; border-radius: 14px; background: linear-gradient(135deg, var(--eg-navy-tint), #fff); color: var(--eg-navy); }
.ptl-accimg .icon { width: 58px; height: 58px; } .ptl-accimg b { font: 700 12px var(--font-en); }
.ptl-model { font: 700 12px var(--font-en); color: var(--eg-navy); background: var(--color-primary-tint); border-radius: 6px; padding: 2px 8px; }
.ptl-desc { margin: 0; font-size: 13px; color: var(--color-text-muted); line-height: 1.7; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ptl-specline { font-size: 12px; color: var(--color-text-muted); }
.ptl-colors { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; } .ptl-colors small { color: var(--color-text-muted); font-size: 12px; margin-inline-start: 4px; }
.ptl-opts { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; } .ptl-opts small { color: var(--color-text-muted); font-size: 12px; margin-inline-end: 2px; }
.ptl-opt { font: 600 11.5px var(--font-en); border: 1px solid var(--color-border-strong); border-radius: 6px; padding: 1px 7px; color: var(--color-text); background: #fff; }
.ptl-price { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.ptl-price small { font-size: 12px; color: var(--color-text-muted); font-weight: 600; } .ptl-price b { font: 700 1.35rem var(--font-en); color: var(--eg-navy); } .ptl-cur { font-size: 12px; color: var(--color-text-muted); }
.ptl-card-foot { margin-top: auto; padding-top: 8px; display: flex; gap: 8px; } .ptl-grow { flex: 1; min-height: 44px; }
/* picker */
.ptl-pick-head { display: flex; gap: 14px; align-items: flex-start; }
.ptl-pick-img { width: 112px; height: 86px; flex: none; border-radius: 12px; background: var(--eg-bg-soft); display: grid; place-items: center; overflow: hidden; padding: 4px; }
.ptl-pick-img img { max-width: 100%; max-height: 100%; object-fit: contain; } .ptl-pick-img .ptl-accimg { min-height: 0; } .ptl-pick-img .ptl-accimg .icon { width: 36px; height: 36px; }
.ptl-pick-head b { display: block; font-size: var(--text-h3); } .ptl-pick-head small { color: var(--color-text-muted); } .ptl-pick-head p { margin: 4px 0 0; font-size: 13px; color: var(--color-text-muted); line-height: 1.7; }
.ptl-specs { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 14px 0 0; padding: 10px 14px; background: var(--eg-bg-soft); border-radius: 12px; font-size: 13px; }
.ptl-specs dt { color: var(--color-text-muted); } .ptl-specs dd { margin: 0; font-weight: 600; }
.ptl-subh { margin: 16px 0 8px; font-size: var(--text-dense); font-weight: 700; color: var(--eg-navy); }
.ptl-vlist { display: flex; flex-direction: column; gap: 8px; max-height: 42vh; overflow: auto; padding: 2px; }
.ptl-v { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 12px; min-height: 58px; border: 1.5px solid var(--color-border-strong); border-radius: 12px; background: #fff; cursor: pointer; text-align: start; font: inherit; color: inherit; }
.ptl-v[aria-checked="true"] { border-color: var(--eg-navy); background: var(--color-primary-tint); box-shadow: 0 0 0 1px var(--eg-navy); }
.ptl-v .erp-swatch { width: 26px; height: 26px; border-radius: 8px; }
.ptl-v b { display: block; font-size: var(--text-dense); } .ptl-v small { display: block; color: var(--color-text-muted); font-size: 12px; margin-block: 2px; }
.ptl-vp { text-align: end; } .ptl-vp b { font: 700 var(--text-body) var(--font-en); color: var(--eg-navy); } .ptl-vp small { font-size: 11px; }
.ptl-qtyrow { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--color-border); }
.ptl-qtyrow .label { display: block; margin-bottom: 6px; }
.ptl-qin { width: 70px; height: 40px; border: 0; text-align: center; font: 700 var(--text-body) var(--font-en); background: transparent; -moz-appearance: textfield; }
.ptl-qin::-webkit-outer-spin-button, .ptl-qin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.ptl-linetot { text-align: end; display: flex; flex-direction: column; } .ptl-linetot small { color: var(--color-text-muted); font-size: 12px; } .ptl-linetot b { font: 700 1.25rem var(--font-en); color: var(--eg-navy); }
/* order page */
.ptl-steps { max-width: 760px; }
.ptl-order { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 18px; align-items: start; }
.ptl-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.ptl-sticky { position: sticky; top: 88px; }
.ptl-pflabel { font-size: 12.5px; font-weight: 700; color: var(--eg-navy); display: flex; align-items: center; gap: 6px; }
.ptl-line { display: grid; grid-template-columns: 58px minmax(0, 1fr) auto auto auto; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--color-border); }
.ptl-line:last-child { border-bottom: 0; }
.ptl-thumb { width: 58px; height: 46px; border-radius: 9px; background: var(--eg-bg-soft); display: grid; place-items: center; overflow: hidden; }
.ptl-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; } .ptl-thumb .ptl-accimg { min-height: 0; border-radius: 9px; } .ptl-thumb .ptl-accimg .icon { width: 22px; height: 22px; } .ptl-thumb .ptl-accimg b { display: none; }
.ptl-line-main { min-width: 0; display: flex; flex-direction: column; gap: 3px; } .ptl-line-main b { font-size: var(--text-dense); }
.ptl-line-main small { color: var(--color-text-muted); font-size: 12px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.ptl-lqty button { width: 36px; height: 36px; } .ptl-lqty .ptl-qin { width: 58px; height: 36px; }
.ptl-ltot { font: 700 var(--text-dense) var(--font-en); min-width: 92px; text-align: end; }
.ptl-quick { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; } .ptl-quick .field { flex: 1 1 220px; margin: 0; } .ptl-quick .ptl-qn { flex: 0 0 110px; }
.ptl-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 0 14px; }
.ptl-pf { gap: 14px; padding: 20px; }
.ptl-pf-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; padding-bottom: 12px; border-bottom: 2px solid var(--eg-navy); }
.ptl-pf-head img { height: 34px; width: auto; }
.ptl-pf-title { text-align: end; display: flex; flex-direction: column; gap: 2px; } .ptl-pf-title b { color: var(--eg-navy); font-size: 1.05rem; } .ptl-pf-title .num { font: 700 13px var(--font-en); } .ptl-pf-title small { color: var(--color-text-muted); font-size: 11.5px; }
.ptl-pf-to { background: var(--eg-bg-soft); border-radius: 10px; padding: 10px 12px; display: grid; gap: 2px; font-size: 13px; } .ptl-pf-to small { color: var(--color-text-muted); font-size: 11.5px; }
.ptl-pftbl { min-width: 0; font-size: 13px; } .ptl-pftbl td small { display: block; color: var(--color-text-muted); font-size: 11px; } .ptl-pftbl td b { font-weight: 600; }
.ptl-pf-empty { margin: 0; padding: 18px; text-align: center; color: var(--color-text-muted); border: 1px dashed var(--color-border-strong); border-radius: 10px; }
.ptl-pf-note { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; line-height: 1.7; color: #7a4a00; background: var(--color-warning-tint); border-radius: 8px; padding: 8px 10px; }
.ptl-pf .totals { width: 100%; } .ptl-pf .totals b, .ptl-sum b { white-space: nowrap; } .ptl-pf .totals .erp-demo { font-size: 10.5px; }
.ptl-pftbl td, .ptl-pftbl th { vertical-align: top; } .ptl-tbl { min-width: 0; } .ptl-tbl .col-num { white-space: nowrap; } .ptl-pftbl .col-num { white-space: nowrap; }
.ptl-credit { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border: 1px solid var(--color-border); border-radius: 14px; background: #fff; }
.ptl-credit-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ptl-credit-row div { display: flex; flex-direction: column; } .ptl-credit-row small { font-size: 11.5px; color: var(--color-text-muted); } .ptl-credit-row b { font: 700 var(--text-dense) var(--font-en); }
.ptl-send { width: 100%; min-height: 52px; justify-content: center; }
.ptl-fine { margin: 0; display: flex; gap: 6px; align-items: flex-start; font-size: 12px; color: var(--color-text-muted); line-height: 1.7; }
/* success */
.ptl-done { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 32px 18px; text-align: center; background: #fff; border: 1px solid var(--color-border); border-radius: 22px; }
.ptl-done h1 { margin: 0; color: var(--eg-navy-deep); font-size: clamp(1.3rem, 3.2vw, 1.8rem); }
.ptl-done-ico { width: 76px; height: 76px; border-radius: 50%; display: grid; place-items: center; background: var(--color-success-tint); color: var(--color-success); }
.ptl-done-ico .icon { width: 38px; height: 38px; }
.ptl-done-meta { margin: 0; color: var(--color-text-muted); display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.ptl-next { width: min(100%, 560px); text-align: start; background: var(--eg-bg-soft); border-radius: 16px; padding: 16px 18px; }
.ptl-next h2 { margin: 0 0 12px; font-size: var(--text-h3); color: var(--eg-navy); }
.ptl-acts { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
/* tracker */
.ptl-track { list-style: none; margin: 0; padding: 6px 0 2px; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.ptl-track li { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 0 4px; }
.ptl-track li:not(:last-child)::before { content: ""; position: absolute; top: 15px; inset-inline-start: 50%; width: 100%; height: 3px; background: var(--color-border); }
.ptl-track li.is-done:not(:last-child)::before { background: var(--eg-navy); }
.ptl-dot { position: relative; z-index: 1; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: #fff; border: 3px solid var(--color-border-strong); color: var(--color-text-muted); flex: none; }
.ptl-track .is-done .ptl-dot { background: var(--eg-navy); border-color: var(--eg-navy); color: #fff; }
.ptl-track .is-now .ptl-dot { border-color: var(--color-accent); color: var(--color-accent); box-shadow: 0 0 0 5px var(--color-accent-tint); }
.ptl-track .is-stop .ptl-dot { border-color: var(--color-danger); background: var(--color-danger-tint); color: var(--color-danger); }
.ptl-track li > div { display: flex; flex-direction: column; gap: 2px; font-size: 12px; line-height: 1.45; }
.ptl-track b { font-size: 12.5px; } .ptl-track .is-todo b { color: var(--color-text-muted); font-weight: 600; } .ptl-track .is-now b { color: var(--color-accent); }
.ptl-track small { color: var(--color-text-muted); } .ptl-track time { color: var(--color-text-muted); font-size: 11px; }
.ptl-mini { display: inline-flex; gap: 3px; } .ptl-mini i { width: 12px; height: 5px; border-radius: 3px; background: var(--color-border); }
.ptl-mini i.is-done { background: var(--eg-navy); } .ptl-mini i.is-now { background: var(--color-accent); } .ptl-mini i.is-stop { background: var(--color-danger); }
.ptl-cell { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; } .ptl-cell small { color: var(--color-text-muted); font-size: 12px; }
.ptl-detail { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.ptl-sum { display: flex; flex-direction: column; gap: 0; margin-inline-start: auto; width: min(100%, 320px); border: 1px solid var(--color-border); border-radius: 12px; overflow: hidden; font-size: var(--text-dense); }
.ptl-sum div { display: flex; justify-content: space-between; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--color-border); } .ptl-sum div:last-child { border-bottom: 0; }
.ptl-sum .is-grand { background: var(--eg-navy); color: #fff; font-weight: 700; }
.ptl-calllog { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.ptl-calllog li { display: flex; gap: 8px; align-items: center; } .ptl-calllog time { color: var(--color-text-muted); font-size: 12px; margin-inline-start: auto; }
/* documents */
.ptl-doc { padding: 28px; gap: 18px; font-size: 13.5px; }
.ptl-doc-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-bottom: 14px; border-bottom: 2px solid var(--eg-navy); }
.ptl-doc-head img { height: 40px; width: auto; } .ptl-doc-co { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; color: var(--color-text-muted); margin-top: 6px; } .ptl-doc-co b { color: var(--color-text); font-size: 13.5px; }
.ptl-doc-title { text-align: end; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; } .ptl-doc-title h2 { margin: 0; color: var(--eg-navy); font-size: 1.35rem; }
.ptl-doc-parties { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 12px; }
.ptl-doc-parties > div { background: var(--eg-bg-soft); border-radius: 12px; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; } .ptl-doc-parties small { color: var(--color-text-muted); font-size: 11.5px; }
.ptl-doc-foot { font-size: 12px; color: var(--color-text-muted); border-top: 1px dashed var(--color-border-strong); padding-top: 10px; line-height: 1.8; }
.ptl-stmt-top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr); gap: 16px; }
.ptl-meterbig .erp-meter-t { height: 14px; }
.ptl-util { display: flex; align-items: baseline; gap: 8px; } .ptl-util b { font: 700 2rem var(--font-en); color: var(--eg-navy); }
/* support */
.ptl-support { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.ptl-kinds { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 8px; }
.ptl-kind { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px; min-height: 92px; border: 1.5px solid var(--color-border-strong); border-radius: 14px; background: #fff; cursor: pointer; text-align: start; font: inherit; color: inherit; }
.ptl-kind .icon { color: var(--eg-navy); } .ptl-kind b { font-size: var(--text-dense); } .ptl-kind small { color: var(--color-text-muted); font-size: 12px; line-height: 1.5; }
.ptl-kind[aria-checked="true"] { border-color: var(--eg-navy); background: var(--color-primary-tint); box-shadow: 0 0 0 1px var(--eg-navy); }
.ptl-drop { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px; border: 1.5px dashed var(--color-border-strong); border-radius: 14px; background: var(--eg-bg-soft); cursor: pointer; font: inherit; color: var(--eg-navy); }
.ptl-drop small { color: var(--color-text-muted); font-size: 12px; }
.ptl-files { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 13px; } .ptl-files li { display: flex; align-items: center; gap: 6px; }
.ptl-tips { margin: 0; padding-inline-start: 1.2em; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--color-text-muted); line-height: 1.7; }
.ptl-sla { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .ptl-sla div { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px dashed var(--color-border); }
/* footer */
.ptl-foot { display: flex; flex-wrap: wrap; gap: 14px 24px; align-items: center; justify-content: space-between; padding: 18px 20px; border-radius: 18px; background: var(--eg-navy-deep); color: #c9d6ee; font-size: 13px; margin-top: 6px; }
.ptl-foot b { color: #fff; } .ptl-foot-who { display: flex; flex-direction: column; gap: 2px; }
.ptl-foot-links { display: flex; flex-wrap: wrap; gap: 8px 10px; }
.ptl-foot a { color: #fff; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,.08); min-height: 40px; }
.ptl-foot a:hover { background: rgba(255,255,255,.16); }
@media (max-width: 1100px) { .ptl-stmt-top { grid-template-columns: 1fr 1fr; } .ptl-stmt-top > :last-child { grid-column: 1 / -1; } }
.ptl-wrap .select, .ptl-wrap .input, .ptl-wrap .textarea { max-width: 100%; } .ptl-quick .field, .ptl-2 > * { min-width: 0; }
@media (max-width: 980px) { .ptl-order, .ptl-detail, .ptl-support { grid-template-columns: minmax(0, 1fr); } .ptl-sticky { position: static; } }
@media (max-width: 760px) {
  .ptl-hero { grid-template-columns: minmax(0, 1fr); padding: 20px 16px; border-radius: 18px; } .ptl-hero-art { display: none; }
  .ptl-hero-acts .btn { flex: 1 1 auto; justify-content: center; }
  .ptl-hstat { min-width: 0; flex: 1 1 90px; }
  .ptl-track { grid-template-columns: 1fr; } .ptl-track li { flex-direction: row; align-items: flex-start; text-align: start; gap: 12px; padding: 0 0 14px; }
  .ptl-track li:not(:last-child)::before { top: 32px; inset-inline-start: 14.5px; width: 3px; height: calc(100% - 32px); }
  .ptl-line { grid-template-columns: 50px minmax(0, 1fr) auto; } .ptl-line .ptl-lqty { grid-column: 2; } .ptl-line .ptl-ltot { grid-column: 3; grid-row: 2; }
  .ptl-line .ptl-rm { grid-column: 3; grid-row: 1; justify-self: end; }
  .ptl-stmt-top { grid-template-columns: 1fr; } .ptl-doc { padding: 16px; } .ptl-doc-title { align-items: flex-start; text-align: start; }
  .ptl-filters .select { flex: 1 1 140px; }
  /* dealer shell (portal app only): tabs become one scrollable row under the brand bar on phones */
  .sap-portal-tabs { order: 3; flex: 1 1 100%; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; } .sap-portal-tabs::-webkit-scrollbar { display: none; }
  .sap-portal-tab { flex: none; } .sap-portal-top .sap-top-actions { margin-inline-start: auto; }
}
@media (max-width: 600px) {
  /* phone catalog: compact 2-column grid so the dealer sees more products per screen */
  .ptl-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .ptl-card .cat-img { aspect-ratio: 1 / 1; } .ptl-card .cat-img > img { inset: 6px; width: calc(100% - 12px); height: calc(100% - 12px); }
  .ptl-card .cat-body { padding: 10px; gap: 5px; } .ptl-card h3 { font-size: 13.5px; line-height: 1.45; }
  .ptl-card .ptl-desc, .ptl-card .ptl-specline, .ptl-card .ptl-opts, .ptl-card .ptl-colors small, .ptl-card .ptl-mine, .ptl-card .cat-meta .chip { display: none; }
  .ptl-imgtag { inset-block-end: 6px; inset-inline-start: 6px; padding: 2px 7px; font-size: 11px; } .ptl-av-pos { inset-block-start: 6px; inset-inline-start: 6px; } .ptl-av-pos .chip { font-size: 11px; padding: 1px 7px; }
  .ptl-price { gap: 4px; margin-top: 2px; } .ptl-price b { font-size: 1.1rem; } .ptl-cur { font-size: 11px; }
  .ptl-card-foot .btn { min-height: 40px; padding-inline: 8px; font-size: 13px; }
  .ptl-fams { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; } .ptl-fams::-webkit-scrollbar { display: none; } .ptl-fam { flex: none; }
}
@media (max-width: 760px) {
  .ptl-mbar:not([hidden]) { position: sticky; bottom: 0; z-index: 5; margin-top: 12px; padding: 10px 14px; background: #fff; border: 1px solid var(--color-border); border-radius: 14px; box-shadow: 0 -6px 18px rgba(1,40,100,.08); display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .ptl-mbar > div { display: flex; flex-direction: column; } .ptl-mbar small { font-size: 11.5px; color: var(--color-text-muted); } .ptl-mbar b { font: 700 1.1rem var(--font-en); color: var(--eg-navy); }
  .ptl-mbar .btn { min-height: 44px; }
}
@media (min-width: 761px) { .ptl-mbar { display: none; } }
@media print {
  body * { visibility: hidden !important; }
  .ptl-printable, .ptl-printable * { visibility: visible !important; }
  .ptl-printable { position: absolute; inset-block-start: 0; inset-inline-start: 0; width: 100%; border: 0; box-shadow: none; }
}`;
    document.head.appendChild(s);
  })();

  /* ───────────────────────── constants + helpers ───────────────────────── */
  const IMG = '../../assets/images/products/';
  const LOGO = '../../assets/images/logo/wordmark-color.png';
  const FAM = [['door', 'أبواب WPC & PVC'], ['clad', 'تجاليد WPC'], ['foam', 'فوم بورد'], ['acc', 'إكسسوارات']];
  const FAM_LABEL = { door: 'أبواب WPC & PVC', clad: 'تجاليد WPC', foam: 'فوم بورد', acc: 'إكسسوارات' };
  const FAM_IMG = { door: 'doors.png', clad: 'cladding.png', foam: 'foam.png' };
  const ACC_META = { 'IT-ACC-LOCK': ['key', 'طقم كالون وأكرة أصلي مناسب لضلفة 4.5 سم.'], 'IT-ACC-HINGE': ['link', 'طقم 3 مفصلات ستانلس للأبواب — مقاوم للصدأ.'], 'IT-ACC-GSKT': ['layers', 'جوان مطاطي لعزل الحلق ضد الصوت والأتربة — يُباع بالمتر.'] };
  const STEP = { door: 1, clad: 10, foam: 5, acc: 1 };
  const DEF_QTY = { door: 10, clad: 100, foam: 20, acc: 10 };
  const SRC_LABEL = { portal: 'من بوابة التاجر', rep: 'عن طريق ممثل المبيعات', expo: 'من المعرض', phone: 'بالهاتف' };
  const METHOD = { cash: 'نقدي', transfer: 'تحويل بنكي', cheque: 'شيك', card: 'بطاقة' };
  const KIND = { complaint: 'شكوى', inquiry: 'استفسار', installation: 'طلب تركيب / معاينة', warranty: 'مطالبة ضمان' };
  const KIND_ICON = { complaint: 'alert', inquiry: 'chat', installation: 'wrench', warranty: 'shield' };
  const KIND_HINT = { complaint: 'عيب أو مشكلة في منتج استلمته', inquiry: 'سؤال عن طلب أو منتج أو سعر', installation: 'فريق تركيب أو معاينة موقع', warranty: 'استبدال أو إصلاح ضمن الضمان' };
  const SLA = { complaint: 48, inquiry: 24, installation: 72, warranty: 72 };
  const CALL_TIMES = ['صباحًا (9 ص – 12 م)', 'ظهرًا (12 م – 3 م)', 'مساءً (3 م – 5 م)'];
  const DELIVERY = { pickup: 'استلام من المصنع — جمصة', ship: 'شحن إلى عنواني' };
  const SIZE_SPECS = ['العروض', 'السماكات', 'الأكواد'];
  const OPEN_SO = ['draft', 'pending_review', 'pending_approval', 'confirmed', 'in_production', 'ready', 'partially_delivered'];
  const CALL_RES = { confirmed: ['تم الاتصال وتأكيد الطلب', 'checkcircle'], no_answer: ['محاولة اتصال — لم يتم الرد', 'phone'], changes: ['تم الاتصال — تعديلات على الطلب', 'edit'], cancelled: ['أُلغي الطلب بعد الاتصال', 'xcircle'] };

  const cid = () => ERP.portalCustomerId();
  const cust = () => ERP.customer(cid()) || { id: cid(), name: cid(), contacts: [] };
  const isPreview = () => !SA.isPortal();
  const money = (n) => ERP.fmt.money(n);
  const num = (n) => ERP.fmt.num(n);
  const priceOf = (itemId) => ERP.flow.priceFor(cid(), itemId);
  const uniq = (a) => Array.from(new Set(a));
  const has = (s, q) => String(s == null ? '' : s).toLowerCase().indexOf(q) >= 0;
  const unitOf = (it) => (it ? ERP.uom[it.uom] || it.uom || '' : '');
  const myOrders = () => ERP.get('salesOrders').filter((o) => o.customerId === cid());
  const myInvoices = () => ERP.get('invoices').filter((i) => i.customerId === cid() && i.status !== 'draft' && i.status !== 'cancelled');
  const myTickets = () => ERP.get('tickets').filter((t) => t.customerId === cid());
  const invStatus = (i) => ERP.flow.invoiceStatus(i);
  const remaining = (i) => Math.max(0, Math.round((i.total || 0) - (i.paid || 0)));
  const colorName = (code) => { const f = ERP.finish(code); return f ? f.code + ' — ' + f.name : code || ''; };
  const nItems = (n) => (n === 1 ? 'بند واحد' : n === 2 ? 'بندان' : n + ' بنود');
  const nKinds = (n) => (n === 1 ? 'صنف واحد' : n === 2 ? 'صنفان' : n + ' أصناف');
  const dateOf = (x) => String(x || '').slice(0, 10);
  const greetName = () => { const u = SA.session.user; const c = cust(); const n = SA.isPortal() && u ? u.name : (c.contacts && c.contacts[0] && c.contacts[0].name) || c.name; const p = String(n || '').trim().split(/\s+/); return p[0] && p[0].length <= 3 && p[1] ? p[0] + ' ' + p[1] : p[0] || ''; };
  /** links that stay INSIDE the portal (the dealer can never open internal routes) */
  const plink = (id, label) => { const p = String(id || ''); const r = p.indexOf('SO-') === 0 ? 'portal/orders/' : p.indexOf('INV-') === 0 ? 'portal/invoices/' : ''; return r ? h('a.erp-doc.num', { href: '#/' + r + encodeURIComponent(p) }, label || p) : h('span.num', {}, label || p || '—'); };
  function notifyDealer(o) { const ids = (st.get('users') || []).filter((u) => u.customerId === cid() && u.status === 'active').map((u) => u.id); if (ids.length) SA.notify(Object.assign({ level: 'info', to: [], toUsers: ids }, o)); }
  function tbl(cols, rows, caption) {
    return h('div.table-wrap', {}, h('table.table.sap-table.ptl-tbl', { 'aria-label': caption || null }, h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c[1] || null }, c[0])))),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((v, i) => h('td', { class: cols[i][1] || null, 'data-label': cols[i][0] }, v == null || v === '' ? '—' : v)))))));
  }
  const sumRow = (label, v, cls) => h('div' + (cls || ''), {}, h('span', {}, label), h('b.num', {}, v instanceof Node ? v : money(v)));

  /* ───────────────────────── catalog model (S.products + their SKUs in S.items; accessories are standalone SKUs) ───────────────────────── */
  function products() {
    const items = ERP.get('items').filter((i) => (i.kind === 'fg' || i.kind === 'acc') && i.price != null);
    const out = ERP.get('products').filter((p) => p.active !== false).map((p) => ({ id: p.id, family: p.family, name: p.name, model: p.model, desc: p.desc || '', specs: p.specs || [], skus: items.filter((i) => i.productId === p.id) })).filter((p) => p.skus.length);
    items.filter((i) => i.kind === 'acc' && !i.productId).forEach((i) => { const m = ACC_META[i.id] || ['box', 'إكسسوار أصلي متوافق مع أبواب المصرية الألمانية.']; out.push({ id: 'PRD-' + i.code, family: 'acc', name: i.name, model: i.code, desc: m[1], specs: [['وحدة البيع', unitOf(i)], ['التوافق', 'أبواب WPC & PVC — كل الموديلات']], skus: [i], icon: m[0] }); });
    return out;
  }
  const productOf = (itemId) => products().find((p) => p.skus.some((s) => s.id === itemId)) || null;
  /** availability badge from ERP.stock.available — never the exact quantity */
  const AV = { ok: ['متاح', 'success', 'متوفر — التسليم بعد مكالمة التأكيد'], low: ['كمية محدودة', 'warning', 'الكمية المتاحة محدودة — ممثل المبيعات يتأكد من التوفر'], mto: ['حسب الطلب', 'info', 'يُصنَّع بعد تأكيد الطلب — المدة يحددها ممثل المبيعات'] };
  const availOf = (it) => { const q = ERP.stock.available(it.id, ERP.stock.FG); if (!(q > 0)) return 'mto'; return q < Math.max(1, it.reorderPoint || 0) ? 'low' : 'ok'; };
  const bestAvail = (skus) => { const a = skus.map(availOf); return a.indexOf('ok') >= 0 ? 'ok' : a.indexOf('low') >= 0 ? 'low' : 'mto'; };
  const availChip = (k) => { const a = AV[k] || AV.mto; return h('span.chip.chip-' + a[1], { title: a[2] }, a[0]); };
  function imgOf(p) {
    if (FAM_IMG[p.family]) return h('img', { src: IMG + FAM_IMG[p.family], alt: p.name, loading: 'lazy' });
    return h('span.ptl-accimg', { 'aria-hidden': 'true' }, SA.icon(p.icon || 'box'), h('b', {}, p.model));
  }
  function skuLabel(it) {
    const a = it.attrs || {};
    if (it.family === 'door') return 'عرض ' + a.width + ' × ارتفاع ' + a.height + ' سم';
    if (it.family === 'clad') return 'كود ' + it.code + ' · ' + (a.size || '') + ' سم';
    if (it.family === 'foam') return 'سُمك ' + a.thickness + ' مم · ' + (a.size || '') + ' سم';
    return it.name;
  }
  const orderedItems = () => { const s = new Set(); myOrders().forEach((o) => o.lines.forEach((l) => s.add(l.itemId))); return s; };

  /* ───────────────────────── cart (sessionStorage per user + customer) ───────────────────────── */
  const MEM = {};
  const cartKey = () => 'eg.portal.cart.' + (SA.session.userId || 'guest') + '.' + cid();
  const Cart = {
    get() {
      let v; const k = cartKey();
      try { const raw = window.sessionStorage.getItem(k); v = raw ? JSON.parse(raw) : MEM[k]; } catch (e) { v = MEM[k]; }
      return Array.isArray(v) ? v.filter((l) => l && ERP.item(l.itemId) && l.qty > 0).map((l) => ({ itemId: l.itemId, qty: Math.round(Number(l.qty)) })) : [];
    },
    set(lines) { const k = cartKey(); MEM[k] = lines; try { window.sessionStorage.setItem(k, JSON.stringify(lines)); } catch (e) { /* memory fallback */ } SA.emit('portal.cart', lines); },
    add(itemId, qty) { const l = Cart.get(); const x = l.find((y) => y.itemId === itemId); if (x) x.qty += qty; else l.push({ itemId, qty }); Cart.set(l); },
    setQty(itemId, qty) { const l = Cart.get(); const x = l.find((y) => y.itemId === itemId); if (!x) return; x.qty = Math.max(1, Math.round(Number(qty) || 1)); Cart.set(l); },
    remove(itemId) { Cart.set(Cart.get().filter((y) => y.itemId !== itemId)); },
    clear() { Cart.set([]); },
    count() { return Cart.get().length; },
    priced() { return Cart.get().map((l) => ({ itemId: l.itemId, qty: l.qty, price: priceOf(l.itemId) })); }
  };
  ERP.portalCart = Cart;

  /* ───────────────────────── page chrome: preview banner + contact footer ───────────────────────── */
  function previewBar() {
    if (!isPreview()) return null;
    const c = cust(); const r = SA.session.role; const home = r && r.homeApp && r.homeApp !== 'portal' && SA.appsFor().some((a) => a.id === r.homeApp) ? r.homeApp : ((SA.appsFor().find((a) => a.id !== 'portal') || {}).id || 'sa');
    return h('div.ptl-preview', { role: 'note' }, SA.icon('eye', 'icon-sm'), h('span', {}, 'معاينة كأنك التاجر: ', h('b', {}, c.name || cid())), h('small', {}, 'هذا بالضبط ما يراه التاجر: أسعاره وطلباته وفواتيره فقط — بدون تكاليف داخلية أو بيانات عملاء آخرين.'),
      h('button.sap-linkbtn', { type: 'button', onclick: () => SA.setApp(home) }, 'خروج من المعاينة'));
  }
  function footer() {
    const c = cust(); const rep = c.salesRepId ? SA.userById(c.salesRepId) : null;
    return h('footer.ptl-foot', {},
      h('div.ptl-foot-who', {}, h('b', {}, 'تواصل معنا'), h('span', {}, 'المصرية الألمانية — جمصة، الدقهلية · من 9 ص إلى 5 م'), rep ? h('span', {}, 'ممثل المبيعات لحسابك: ', h('b', {}, rep.name)) : null),
      h('div.ptl-foot-links', {},
        h('a', { href: 'tel:15536' }, SA.icon('phone', 'icon-sm'), 'الخط الساخن ', h('b.num', {}, '15536')),
        h('a', { href: 'https://wa.me/201555515536', target: '_blank', rel: 'noopener' }, SA.icon('chat', 'icon-sm'), 'واتساب ', h('b.num', { dir: 'ltr' }, '+201555515536')),
        h('a', { href: 'mailto:contact@egerman-upvc.com' }, SA.icon('mail', 'icon-sm'), h('span', { dir: 'ltr' }, 'contact@egerman-upvc.com'))));
  }
  const page = (...kids) => h('div.ptl-wrap', {}, previewBar(), kids, footer());
  const notFound = (title, route, label) => SA.card({}, SA.empty({ icon: 'search', title, text: 'ممكن الرقم يكون غلط، أو المستند مش تابع لحسابك.', action: { label, icon: 'arrowright', onClick: () => SA.nav(route) } }));

  /* ───────────────────────── proforma (live) + credit info ───────────────────────── */
  function nextPf() { const seq = st.get('meta.erpSeq') || {}; return 'PF-' + new Date().getFullYear() + '-' + String((seq.SO || 0) + 1).padStart(4, '0'); }
  function pfSheet(o) {
    const c = cust(); const pl = ERP.find('priceLists', c.priceListId); const lines = o.lines || []; const t = ERP.flow.totals({ lines, discountPct: o.discountPct || 0 }); const rate = ERP.taxRate();
    return h('div.inv-sheet.ptl-pf' + (o.printable ? '.ptl-printable' : ''), {},
      h('div.ptl-pf-head', {}, h('img', { src: LOGO, alt: 'المصرية الألمانية' }), h('div.ptl-pf-title', {}, h('b', {}, 'فاتورة مبدئية (Proforma)'), h('span.num', {}, o.no), o.preview ? h('small', {}, 'رقم مبدئي — يُثبَّت عند الإرسال') : null, h('small', {}, ERP.fmt.date(o.date)))),
      h('div.ptl-pf-to', {}, h('small', {}, 'مقدمة إلى'), h('b', {}, c.name), h('span', {}, [c.code, c.city].filter(Boolean).join(' · ')), pl ? h('small', {}, 'حسب قائمة أسعارك: ' + pl.name) : null),
      lines.length ? h('div.table-wrap', {}, h('table.table.ptl-pftbl', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الصنف'), h('th.col-num', {}, 'الكمية'), h('th.col-num', {}, 'السعر'), h('th.col-num', {}, 'الإجمالي'))),
        h('tbody', {}, lines.map((l) => { const it = ERP.item(l.itemId) || {}; return h('tr', {}, h('td', {}, h('b', {}, it.name || l.itemId), h('small', {}, it.code || '')), h('td.col-num', {}, h('span.num', {}, num(l.qty))), h('td.col-num', {}, h('span.num', {}, num(l.price))), h('td.col-num', {}, h('b.num', {}, num(l.qty * l.price)))); }))))
        : h('p.ptl-pf-empty', {}, 'أضف منتجات وهتظهر هنا بأسعارك.'),
      h('div.totals', {}, sumRow('الإجمالي قبل الضريبة', t.gross), t.discount ? sumRow('الخصم (' + o.discountPct + '%)', -t.discount) : null,
        h('div', {}, h('span', {}, 'ضريبة القيمة المضافة ' + Math.round(rate * 100) + '% ', ERP.taxIsDemo() ? ERP.ui.demo('تجريبية') : null), h('b.num', {}, money(t.tax))), sumRow('الإجمالي', t.total, '.grand')),
      h('div.ptl-pf-note', {}, SA.icon('info', 'icon-sm'), h('span', {}, h('b', {}, 'فاتورة مبدئية — ليست فاتورة ضريبية. '), 'الأسعار والتوفر وموعد التسليم بيتأكدوا في مكالمة ممثل المبيعات.')));
  }
  function openPf(so) {
    const sheet = pfSheet({ no: so.proformaNo || 'PF-' + so.id.slice(3), date: so.submittedAt || so.createdAt, lines: so.lines, discountPct: so.discountPct, printable: true });
    const m = SA.modal({ title: 'الفاتورة المبدئية — ' + so.id, subtitle: 'بأسعارك وقت الطلب · ليست فاتورة ضريبية', icon: 'doc', size: 'lg', body: sheet, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إغلاق'), SA.btn({ label: 'طباعة / حفظ PDF', icon: 'download', kind: 'primary', onClick: () => window.print() })] });
  }
  function creditBox(orderTotal) {
    const c = cust(); const bal = Math.round(c.balance || 0); const lim = c.creditLimit || 0;
    if (!lim) return SA.alert('info', 'التعامل على حسابك نقدي أو بدفعة مقدمة — ممثل المبيعات هيتفق معاك على طريقة الدفع في مكالمة التأكيد.');
    const avail = Math.max(0, lim - bal); const after = bal + (orderTotal || 0); const util = after / lim;
    return h('div.ptl-credit', {}, h('div.ptl-credit-row', {}, h('div', {}, h('small', {}, 'رصيدك الحالي'), h('b.num', {}, money(bal))), h('div', {}, h('small', {}, 'الحد الائتماني'), h('b.num', {}, money(lim))), h('div', {}, h('small', {}, 'المتاح الآن'), h('b.num', {}, money(avail)))),
      ERP.chart.meter(Math.min(1, util), { label: orderTotal ? 'استخدام الحد بعد هذا الطلب' : 'استخدام الحد الائتماني', text: Math.round(util * 100) + '%', tone: util > 1 ? 'danger' : util > 0.8 ? 'warning' : 'primary' }),
      after > lim ? SA.alert('info', 'قيمة الطلب أعلى من الرصيد المتاح بـ ' + money(after - lim) + '. مفيش مشكلة — ممثل المبيعات هيتفق معاك على دفعة مقدمة أو شيكات أثناء مكالمة التأكيد.') : h('small.ptl-muted', {}, orderTotal ? 'الطلب في حدود رصيدك الائتماني المتاح.' : 'رصيدك في حدود الحد الائتماني.'),
      h('div', {}, ERP.ui.demo('حدود الائتمان قيم تجريبية')));
  }

  /* ───────────────────────── order tracker (dealer-friendly steps from SO + WOs + deliveries + invoices) ───────────────────────── */
  const TRACK = [['sent', 'تم الإرسال', 'send'], ['call', 'تأكيد هاتفي', 'phone'], ['prod', 'قيد التصنيع', 'factory'], ['ready', 'جاهز', 'box'], ['transit', 'في الطريق', 'truck'], ['delivered', 'تم التسليم', 'checkcircle'], ['invoiced', 'مُفوتر', 'receipt']];
  function trackOf(so) {
    const dns = (so.dnIds || []).map((id) => ERP.find('deliveries', id)).filter(Boolean);
    const wos = (so.woIds || []).map((id) => ERP.find('workOrders', id)).filter(Boolean);
    const invs = (so.invoiceIds || []).map((id) => ERP.find('invoices', id)).filter(Boolean);
    const moving = dns.filter((d) => ['dispatched', 'in_transit'].indexOf(d.status) >= 0); const got = dns.filter((d) => d.status === 'delivered');
    const s = so.status; let cur = 7; let stop = null;
    if (s === 'rejected' || s === 'cancelled') { cur = 1; stop = s; } else if (s === 'draft') cur = 0;
    else if (s === 'pending_review' || s === 'pending_approval') cur = 1;
    else if (s === 'confirmed' || s === 'in_production') cur = moving.length ? 4 : 2;
    else if (s === 'ready') cur = moving.length ? 4 : 3;
    else if (s === 'partially_delivered') cur = moving.length ? 4 : 5;
    else if (s === 'delivered') cur = 5;
    const log = (so.call && so.call.log) || []; const last = log[0];
    const pct = wos.length ? wos.reduce((a, w) => a + Math.min(1, (w.qtyDone || 0) / (w.qty || 1)), 0) / wos.length : null;
    const portal = so.source === 'portal';
    const info = {
      sent: { at: so.submittedAt || so.createdAt, sub: SRC_LABEL[so.source] || '' },
      call: { label: portal ? 'تأكيد هاتفي' : 'تأكيد المبيعات', at: so.confirmedAt, sub: stop ? (stop === 'rejected' ? 'لم يتم قبول الطلب' : 'أُلغي الطلب') : cur === 1 ? (s === 'pending_approval' ? 'قيد المراجعة النهائية في المبيعات' : last && last.result === 'no_answer' ? 'حاولنا الاتصال بك — هنعاود الاتصال' : 'سيتصل بك ممثل المبيعات لتأكيد الطلب') : (portal ? 'اتصلنا بك وتأكد الطلب' : '') },
      prod: { label: wos.length || cur <= 2 ? 'قيد التصنيع' : 'التجهيز', at: wos.length ? (wos.map((w) => w.actualStart).filter(Boolean).sort()[0] || null) : null, sub: cur === 2 ? (pct != null ? 'نسبة الإنجاز ' + Math.round(pct * 100) + '%' : 'قيد التجهيز من المخزن') : cur > 2 && !wos.length ? 'من المخزون الجاهز' : '' },
      ready: { at: so.readyAt || null, sub: cur === 3 ? 'جاهز — بيتجهز للتحميل' : '' },
      transit: { at: (moving[0] || got[0] || {}).dispatchedAt || null, sub: cur === 4 ? 'خرجت الشحنة من المصنع' : '' },
      delivered: { at: got.length ? got.map((d) => d.deliveredAt).filter(Boolean).sort().pop() : null, sub: cur === 5 ? (s === 'partially_delivered' ? 'تم تسليم جزء من الطلب' : 'تم الاستلام') : '' },
      invoiced: { at: invs[0] ? invs[0].issueDate : null, sub: cur >= 7 && invs.length ? (s === 'closed' ? 'مُفوتر ومُسدَّد' : 'صدرت الفاتورة') : '' }
    };
    const steps = TRACK.map((t, i) => { const x = info[t[0]]; return { key: t[0], label: x.label || t[1], icon: t[2], at: i <= cur || cur >= 7 ? x.at : null, sub: x.sub, state: stop && i === 1 ? 'stop' : i < cur ? 'done' : i === cur ? 'now' : 'todo' }; });
    const nowStep = steps[Math.min(cur, 6)];
    const nowText = stop ? (stop === 'rejected' ? 'مرفوض' : 'ملغى') : cur >= 7 ? (s === 'closed' ? 'مكتمل ومُسدَّد' : 'مكتمل — صدرت الفاتورة') : nowStep.label + (nowStep.sub ? ' — ' + nowStep.sub : '');
    return { cur, stop, steps, dns, wos, invs, pct, nowText };
  }
  const trackerEl = (t) => h('ol.ptl-track', { 'aria-label': 'مراحل الطلب' }, t.steps.map((s) => h('li.is-' + s.state, { 'aria-current': s.state === 'now' ? 'step' : null },
    h('span.ptl-dot', {}, SA.icon(s.state === 'done' ? 'check' : s.state === 'stop' ? 'x' : s.icon, 'icon-sm')), h('div', {}, h('b', {}, s.label), s.sub ? h('small', {}, s.sub) : null, s.at ? h('time', {}, ERP.fmt.date(s.at)) : null))));
  const miniTrack = (t) => h('span.ptl-mini', { 'aria-hidden': 'true' }, t.steps.map((s) => h('i.is-' + s.state)));
  function reorder(so) {
    if (!SA.can('portal.orders.create')) { SA.toast('إنشاء الطلبات ليست من صلاحياتك', 'warn'); return; }
    const lines = Cart.get(); let n = 0;
    so.lines.forEach((l) => { const it = ERP.item(l.itemId); if (!it || it.price == null) return; const x = lines.find((y) => y.itemId === l.itemId); if (x) x.qty += l.qty; else lines.push({ itemId: l.itemId, qty: l.qty }); n++; });
    Cart.set(lines);
    SA.toast('نسخنا ' + nItems(n) + ' من ' + so.id + ' لطلبك الجديد بأسعارك الحالية — راجع الكميات وأرسل.', 'success');
    SA.nav('portal/order');
  }

  /* ───────────────────────── variant picker (only existing SKUs of the product) ───────────────────────── */
  function openPicker(p, preId) {
    if (!SA.can('portal.orders.create')) { SA.toast('إضافة الطلبات ليست من صلاحياتك', 'warn'); return; }
    let sel = preId || (p.skus.find((s) => availOf(s) !== 'mto') || p.skus[0]).id; const step = STEP[p.family] || 1; let qty = DEF_QTY[p.family] || 1;
    const totalEl = h('b.num'); const areaEl = h('small');
    const qIn = h('input.ptl-qin.num', { type: 'number', min: 1, step, value: qty, inputmode: 'numeric', 'aria-label': 'الكمية', oninput: (e) => { const v = Number(e.target.value); if (v > 0) { qty = Math.round(v); upd(); } }, onchange: (e) => setQty(Number(e.target.value)) });
    const setQty = (v) => { qty = Math.max(1, Math.round(v || 1)); qIn.value = qty; upd(); };
    const list = h('div.ptl-vlist', { role: 'radiogroup', 'aria-label': 'اختر المقاس واللون' }, p.skus.map((s) => { const a = s.attrs || {};
      return h('button.ptl-v', { type: 'button', role: 'radio', 'aria-checked': String(s.id === sel), dataset: { id: s.id }, onclick: () => { sel = s.id; upd(); } },
        a.color ? ERP.ui.swatch(a.color) : h('span.erp-item-ico', {}, SA.icon(p.icon || 'box', 'icon-sm')),
        h('span', {}, h('b', {}, skuLabel(s)), h('small', {}, [a.color ? colorName(a.color) : '', s.code].filter(Boolean).join(' · ')), availChip(availOf(s))),
        h('span.ptl-vp', {}, h('b.num', {}, num(priceOf(s.id))), h('small', {}, 'ج.م / ' + unitOf(s)))); }));
    function upd() { const it = ERP.item(sel); totalEl.textContent = money(priceOf(sel) * qty); areaEl.textContent = it && it.areaM2 ? '≈ ' + ERP.fmt.num(it.areaM2 * qty, 1) + ' م² تغطية' : ''; SA.$$('.ptl-v', list).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === sel))); }
    const body = h('div.ptl-pick', {},
      h('div.ptl-pick-head', {}, h('div.ptl-pick-img', {}, imgOf(p)), h('div', {}, h('b', {}, p.name), h('small', {}, FAM_LABEL[p.family] + ' · ' + p.model), p.desc ? h('p', {}, p.desc) : null)),
      p.specs.length ? h('dl.ptl-specs', {}, p.specs.filter((x) => SIZE_SPECS.indexOf(x[0]) < 0).slice(0, 5).map((x) => [h('dt', {}, x[0]), h('dd', {}, x[1])])) : null,
      h('div.ptl-subh', {}, 'المتاح من هذا المنتج (' + p.skus.length + ')'), list,
      p.family !== 'acc' ? h('p.ptl-more', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'مقاسات وألوان تانية من الـ11 تشطيب ممكن تتصنّع بالطلب الخاص — اكتبها في ملاحظات الطلب أو اسأل ممثل المبيعات.')) : null,
      h('div.ptl-qtyrow', {}, h('div', {}, h('span.label', {}, 'الكمية (' + unitOf(p.skus[0]) + ')'), h('div.qty', {}, h('button', { type: 'button', 'aria-label': 'نقص الكمية', onclick: () => setQty(qty - step) }, SA.icon('minus', 'icon-sm')), qIn, h('button', { type: 'button', 'aria-label': 'زيادة الكمية', onclick: () => setQty(qty + step) }, SA.icon('plus', 'icon-sm')))),
        h('div.ptl-linetot', {}, h('small', {}, 'إجمالي البند بسعرك (قبل الضريبة)'), totalEl, areaEl)));
    const m = SA.modal({ title: 'أضف للطلب', subtitle: 'الأسعار المعروضة هي أسعارك أنت (غير شاملة الضريبة)', icon: 'cart', size: 'md', body,
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), h('a.btn.btn-ghost', { href: '#/portal/order', onclick: () => m.close(null) }, 'عرض طلبي'),
        SA.btn({ label: 'أضف للطلب', icon: 'plus', kind: 'primary', perm: 'portal.orders.create', attrs: { 'data-act': 'add-to-cart' }, onClick: () => { Cart.add(sel, qty); m.close(true); SA.toast('أضيف لطلبك: ' + ERP.itemName(sel) + ' × ' + num(qty), 'success'); } })] });
    upd();
    return m;
  }

  /* ═════════════════════════ 1. CATALOG ═════════════════════════ */
  SA.register({ id: 'portal-catalog', app: 'portal', group: 'portal-main', title: 'الكتالوج', icon: 'grid', route: 'portal/catalog', perm: 'portal.catalog.view', order: 1, desc: 'الكتالوج بأسعارك أنت — اختر المقاس واللون وأضف لطلبك',
    render(root, ctx) {
      ctx.setCrumbs([{ label: 'بوابة التاجر' }, { label: 'الكتالوج وأسعاري' }]);
      const f = { fam: FAM_LABEL[ctx.params.family] ? ctx.params.family : 'all', q: ctx.params.q || '', model: '', color: '', sort: 'default' };
      let cartHost = null, cartStat = null;
      const refreshCart = () => { if (!cartHost) return; const n = Cart.count(); SA.clear(cartHost); cartHost.appendChild(SA.btn({ label: n ? 'أكمل طلبك (' + nItems(n) + ')' : 'أنشئ طلبك', icon: 'cart', kind: 'accent', size: 'lg', onClick: () => SA.nav('portal/order') })); if (cartStat) cartStat.textContent = String(n); };
      function build() {
        const c = cust(); const pl = ERP.find('priceLists', c.priceListId); const all = products(); const mine = orderedItems();
        const openN = myOrders().filter((o) => OPEN_SO.indexOf(o.status) >= 0).length;
        const search = h('input.input', { type: 'search', value: f.q, placeholder: 'ابحث بالموديل أو المنتج أو كود اللون… مثال: D105 أو C132', 'aria-label': 'بحث في الكتالوج', oninput: SA.debounce((e) => { f.q = e.target.value; drawGrid(); }, 140) });
        cartHost = h('span'); cartStat = h('b.num', {}, '0');
        const hstat = (label, v) => h('div.ptl-hstat', {}, h('small', {}, label), v instanceof Node ? v : h('b.num', {}, String(v)));
        const hero = h('section.ptl-hero', { 'aria-label': 'الكتالوج' },
          h('div', {}, h('span.ptl-eyebrow', {}, 'كتالوج المصرية الألمانية · ' + (pl ? pl.name : 'قائمة أسعارك')),
            h('h1', {}, 'أهلًا ' + greetName() + '، أسعارك جاهزة'),
            h('p', {}, c.name + ' — كل سعر هنا هو سعرك أنت حسب قائمتك، والفاتورة المبدئية بتتكوّن قدامك وأنت بتطلب.'),
            h('div.input-wrap.ptl-hero-sw', {}, SA.icon('search'), search),
            h('div.ptl-hero-acts', {}, cartHost, h('a.btn.btn-lg.ptl-glass', { href: '#/portal/orders' }, SA.icon('list', 'icon-sm'), 'طلباتي')),
            h('div.ptl-hero-stats', {}, hstat('منتجات في الكتالوج', all.length), hstat('بنود في طلبك الحالي', cartStat), hstat('طلبات مفتوحة', openN))),
          h('div.ptl-hero-art', {}, h('img', { src: IMG + 'doors.png', alt: 'أبواب WPC & PVC من مصنع جمصة' }), h('div.ptl-hero-thumbs', {}, h('img', { src: IMG + 'cladding.png', alt: 'تجاليد WPC' }), h('img', { src: IMG + 'foam.png', alt: 'ألواح فوم بورد' }))));
        refreshCart();
        const famBar = h('div.ptl-fams', { role: 'group', 'aria-label': 'عائلات المنتجات' });
        const modelSel = h('select.select', { 'aria-label': 'الموديل', onchange: (e) => { f.model = e.target.value; drawGrid(); } });
        const sortSel = h('select.select', { 'aria-label': 'الترتيب', onchange: (e) => { f.sort = e.target.value; drawGrid(); } }, [['default', 'الترتيب: المقترح'], ['price_asc', 'السعر: الأقل أولًا'], ['price_desc', 'السعر: الأعلى أولًا'], ['avail', 'المتاح أولًا']].map((o) => h('option', { value: o[0] }, o[1])));
        sortSel.value = f.sort;
        const sw = h('div.ptl-swatches', { role: 'group', 'aria-label': 'اللون' });
        const countEl = h('span.ptl-count', { 'aria-live': 'polite' });
        const clearBtn = h('button.sap-linkbtn', { type: 'button', onclick: () => { f.fam = 'all'; f.q = ''; f.model = ''; f.color = ''; search.value = ''; drawFams(); drawModels(); drawSw(); drawGrid(); } }, 'مسح الفلاتر');
        const grid = h('div.ptl-grid', { 'aria-label': 'المنتجات' });
        function drawFams() { SA.clear(famBar); [['all', 'كل المنتجات']].concat(FAM).forEach((x) => { const n = x[0] === 'all' ? all.length : all.filter((p) => p.family === x[0]).length; famBar.appendChild(h('button.ptl-fam', { type: 'button', 'aria-pressed': String(f.fam === x[0]), onclick: () => { f.fam = x[0]; f.model = ''; drawFams(); drawModels(); drawGrid(); } }, FAM_IMG[x[0]] ? h('img', { src: IMG + FAM_IMG[x[0]], alt: '' }) : SA.icon(x[0] === 'acc' ? 'key' : 'grid'), x[1], h('span.ptl-n', {}, n))); }); }
        function drawModels() { SA.clear(modelSel); const ms = uniq(all.filter((p) => f.fam === 'all' || p.family === f.fam).map((p) => p.model)); modelSel.appendChild(h('option', { value: '' }, 'كل الموديلات')); ms.forEach((m) => modelSel.appendChild(h('option', { value: m }, m))); modelSel.value = ms.indexOf(f.model) >= 0 ? f.model : ''; }
        function drawSw() { SA.clear(sw); ERP.finishes.forEach((x) => sw.appendChild(h('button.ptl-sw', { type: 'button', style: { '--c': x.hex }, title: x.code + ' — ' + x.name, 'aria-label': 'لون ' + x.code + ' ' + x.name, 'aria-pressed': String(f.color === x.code), onclick: () => { f.color = f.color === x.code ? '' : x.code; drawSw(); drawGrid(); } }))); }
        const matchQ = (p, q) => !q || has(p.name, q) || has(p.model, q) || has(FAM_LABEL[p.family], q) || p.skus.some((s) => has(s.code, q) || has(s.name, q) || has(colorName(s.attrs && s.attrs.color), q));
        function drawGrid() {
          const q = f.q.trim().toLowerCase();
          const list = all.filter((p) => (f.fam === 'all' || p.family === f.fam) && (!f.model || p.model === f.model) && (!f.color || p.skus.some((s) => s.attrs && s.attrs.color === f.color)) && matchQ(p, q));
          const minP = (p) => Math.min.apply(null, p.skus.map((s) => priceOf(s.id))); const rank = { ok: 0, low: 1, mto: 2 };
          if (f.sort === 'price_asc') list.sort((a, b) => minP(a) - minP(b)); else if (f.sort === 'price_desc') list.sort((a, b) => minP(b) - minP(a)); else if (f.sort === 'avail') list.sort((a, b) => rank[bestAvail(a.skus)] - rank[bestAvail(b.skus)]);
          SA.clear(grid); countEl.textContent = list.length + ' منتج' + (f.color ? ' بلون ' + f.color : '');
          clearBtn.hidden = f.fam === 'all' && !f.q && !f.model && !f.color;
          const elsewhere = !list.length && q && (f.fam !== 'all' || f.model || f.color) ? all.filter((p) => matchQ(p, q)).length : 0;
          if (!list.length) grid.appendChild(h('div.ptl-span', {}, SA.card({}, elsewhere
            ? SA.empty({ icon: 'search', title: 'مفيش نتائج بالفلاتر الحالية', text: 'لقينا ' + elsewhere + ' منتج يطابق «' + f.q.trim() + '» في كل الكتالوج.', action: { label: 'ابحث في كل المنتجات', icon: 'search', onClick: () => { const keep = f.q; clearBtn.click(); f.q = keep; search.value = keep; drawGrid(); } } })
            : SA.empty({ icon: 'search', title: 'مفيش منتجات مطابقة', text: 'جرّب كلمة تانية أو لون تاني، أو امسح الفلاتر.', action: { label: 'مسح الفلاتر', icon: 'x', onClick: () => clearBtn.click() } }))));
          else list.forEach((p) => grid.appendChild(card(p, mine)));
        }
        drawFams(); drawModels(); drawSw(); drawGrid();
        return page(hero, famBar,
          h('div.ptl-filters', {}, h('label.ptl-fl', {}, 'الموديل', modelSel), h('div.ptl-fl', {}, 'اللون', sw), h('label.ptl-fl', {}, sortSel), clearBtn, countEl),
          grid,
          SA.alert('info', h('span', {}, 'الأسعار المعروضة هي أسعارك أنت فقط وغير شاملة ضريبة القيمة المضافة. التوفر تقديري ويتأكد في مكالمة ممثل المبيعات. ', ERP.ui.demo('أسعار ومخزون تجريبية'))));
      }
      const off = SA.on('portal.cart', refreshCart);
      const stop = SA.live(root, build, ['products', 'items', 'stock', 'priceLists']);
      return () => { off(); stop(); };
    } });

  function card(p, mine) {
    const prices = p.skus.map((s) => priceOf(s.id)); const min = Math.min.apply(null, prices), max = Math.max.apply(null, prices);
    const colors = uniq(p.skus.map((s) => s.attrs && s.attrs.color).filter(Boolean));
    const opts = p.family === 'door' ? uniq(p.skus.map((s) => s.attrs.width)).sort((a, b) => a - b).map((w) => w + ' سم') : p.family === 'foam' ? p.skus.map((s) => s.attrs.thickness + ' مم') : p.family === 'clad' ? p.skus.map((s) => s.code) : [];
    const optLabel = p.family === 'door' ? 'العروض' : p.family === 'foam' ? 'السماكات' : 'الأكواد';
    const specs = p.specs.filter((x) => SIZE_SPECS.indexOf(x[0]) < 0 && x[0] !== 'الضمان').slice(0, 2).map((x) => x[0] + ' ' + x[1]).join(' · ');
    const open = () => openPicker(p);
    return h('article.cat-card.ptl-card', { dataset: { product: p.id } },
      h('button.cat-img', { type: 'button', 'aria-label': 'تفاصيل ' + p.name, onclick: open }, imgOf(p), FAM_IMG[p.family] ? h('span.ptl-imgtag', { 'aria-hidden': 'true' }, colors.slice(0, 4).map((x) => ERP.ui.swatch(x)), p.model) : null, h('span.ptl-av-pos', {}, availChip(bestAvail(p.skus))), p.skus.some((s) => mine.has(s.id)) ? h('span.ptl-mine', {}, SA.icon('history', 'icon-sm'), 'طلبته قبل كده') : null),
      h('div.cat-body', {},
        h('div.cat-meta', {}, h('span.chip.chip-plain', {}, FAM_LABEL[p.family]), h('span.ptl-model', {}, p.model)),
        h('h3', {}, p.name), p.desc ? h('p.ptl-desc', {}, p.desc) : null, specs ? h('div.ptl-specline', {}, specs) : null,
        colors.length ? h('div.ptl-colors', { 'aria-label': 'الألوان المتاحة' }, colors.map((x) => ERP.ui.swatch(x)), h('small', {}, colors.length === 1 ? colorName(colors[0]) : colors.length + ' ألوان متاحة')) : null,
        opts.length ? h('div.ptl-opts', {}, h('small', {}, optLabel + ':'), opts.map((o) => h('span.ptl-opt', {}, o))) : null,
        h('div.ptl-price', {}, h('small', {}, 'سعرك'), min !== max ? h('small', {}, 'من') : null, h('b.num', {}, num(min)), h('span.ptl-cur', {}, 'ج.م / ' + unitOf(p.skus[0]))),
        h('div.ptl-card-foot', {}, SA.btn({ label: 'أضف للطلب', icon: 'plus', kind: 'primary', perm: 'portal.orders.create', class: 'ptl-grow', attrs: { 'data-act': 'pick' }, onClick: open }))));
  }

  /* ═════════════════════════ 2. NEW ORDER (cart + live proforma + submit) ═════════════════════════ */
  SA.register({ id: 'portal-order', app: 'portal', group: 'portal-main', title: 'طلب جديد', icon: 'cart', route: 'portal/order', perm: 'portal.orders.create', order: 2, desc: 'سلة الطلب والفاتورة المبدئية الحية',
    badge() { const n = Cart.count(); return n || null; },
    render(root, ctx) {
      if (ctx.params.done) return renderDone(root, ctx, ctx.params.done);
      ctx.setCrumbs([{ label: 'بوابة التاجر' }, { label: 'طلب جديد' }]);
      const c = cust(); const contact = (c.contacts && c.contacts[0]) || {};
      const fv = { phone: contact.phone || (SA.session.user || {}).phone || '', time: CALL_TIMES[1], delivery: 'pickup', date: '', notes: '' };
      const linesHost = h('div', {}); const pfHost = h('div.ptl-col', {}); const mbar = h('div.ptl-mbar', { role: 'region', 'aria-label': 'ملخص الطلب' }); const stepsEl = h('ol.order-steps.ptl-steps', { 'aria-label': 'خطوات الطلب' });
      const phoneF = SA.form.field({ name: 'phone', label: 'رقم الهاتف اللي هنتصل عليه لتأكيد الطلب', type: 'tel', value: fv.phone, required: true, rules: [SA.form.rules.phone], onInput: (v) => { fv.phone = v; } });
      const timeF = SA.form.field({ name: 'time', label: 'أنسب وقت للاتصال', type: 'select', value: fv.time, options: CALL_TIMES.map((t) => [t, t]), onChange: (v) => { fv.time = v; } });
      const delF = SA.form.field({ name: 'delivery', label: 'طريقة الاستلام', type: 'select', value: fv.delivery, options: [['pickup', DELIVERY.pickup], ['ship', DELIVERY.ship + (c.city ? ' (' + c.city + ')' : '')]], onChange: (v) => { fv.delivery = v; } });
      const dateF = SA.form.field({ name: 'date', label: 'موعد التسليم المرغوب (اختياري)', type: 'date', min: ERP.day(2), hint: 'الموعد النهائي بيتحدد في مكالمة التأكيد حسب التوفر والتصنيع.', onInput: (v) => { fv.date = v; } });
      const notesF = SA.form.field({ name: 'notes', label: 'ملاحظات للمبيعات (اختياري)', type: 'textarea', rows: 3, placeholder: 'مثال: محتاج الأبواب قبل يوم الخميس، أو تفاصيل الموقع والتحميل…', onInput: (v) => { fv.notes = v; } });
      /* quick add (fast re-ordering by code without leaving the page) */
      const allSkus = products().reduce((a, p) => a.concat(p.skus.map((s) => [s.id, s.name + ' — ' + num(priceOf(s.id)) + ' ج.م'])), []);
      let qItem = '', qQty = 1;
      const qSel = SA.form.field({ name: 'quick', label: 'إضافة سريعة بالكود', type: 'select', options: [['', '— اختر صنفًا —']].concat(allSkus), onChange: (v) => { qItem = v; const it = ERP.item(v); if (it) { qQty = DEF_QTY[it.family] || 1; qN.set(qQty); } } });
      const qN = SA.form.field({ name: 'qn', label: 'الكمية', type: 'number', value: 1, min: 1, class: 'ptl-qn', onInput: (v) => { qQty = Number(v) || 1; } });
      const quick = SA.card({ title: 'أضف صنفًا تعرفه' }, h('div.ptl-quick', {}, qSel.el, qN.el, SA.btn({ label: 'أضف', icon: 'plus', kind: 'ghost', onClick: () => { if (!qItem) { SA.toast('اختر الصنف الأول', 'warn'); return; } Cart.add(qItem, Math.max(1, Math.round(qQty))); SA.toast('أضيف لطلبك: ' + ERP.itemName(qItem), 'success'); } })), h('small.ptl-muted', {}, 'أو تصفح ', h('a', { href: '#/portal/catalog' }, 'الكتالوج'), ' لاختيار المقاس واللون بالصور.'));

      function drawSteps() { const n = Cart.count(); SA.clear(stepsEl); [['المنتجات والكميات', n ? 'is-done' : 'is-now'], ['بيانات التأكيد', n ? 'is-now' : ''], ['الإرسال للمبيعات', ''], ['مكالمة التأكيد', '']].forEach((s) => stepsEl.appendChild(h('li', { class: s[1] || null }, s[0]))); }
      function drawLines() {
        const lines = Cart.get(); SA.clear(linesHost);
        if (!lines.length) { linesHost.appendChild(SA.empty({ icon: 'cart', title: 'طلبك لسه فاضي', text: 'ابدأ من الكتالوج: اختار المقاس واللون، والسعر اللي هتشوفه هو سعرك أنت.', action: { label: 'تصفح الكتالوج', icon: 'grid', onClick: () => SA.nav('portal/catalog') } })); return; }
        lines.forEach((l) => {
          const it = ERP.item(l.itemId); const p = productOf(l.itemId) || { family: it.family, name: it.name, model: it.code }; const pr = priceOf(l.itemId); const step = STEP[it.family] || 1; const a = it.attrs || {};
          linesHost.appendChild(h('div.ptl-line', { dataset: { item: it.id } },
            h('span.ptl-thumb', {}, imgOf(p)),
            h('div.ptl-line-main', {}, h('b', {}, it.name), h('small', {}, a.color ? ERP.ui.swatch(a.color) : null, a.color ? colorName(a.color) + ' ·' : null, h('span.num', {}, it.code)), h('small', {}, 'سعرك ', h('b.num', {}, num(pr)), ' ج.م / ' + unitOf(it), availChip(availOf(it)))),
            h('div.qty.ptl-lqty', {}, h('button', { type: 'button', 'aria-label': 'نقص كمية ' + it.name, dataset: { fk: 'm-' + it.id }, onclick: () => Cart.setQty(it.id, l.qty - step) }, SA.icon('minus', 'icon-sm')),
              h('input.ptl-qin.num', { type: 'number', min: 1, step, value: l.qty, inputmode: 'numeric', 'aria-label': 'كمية ' + it.name, dataset: { fk: 'q-' + it.id }, onchange: (e) => Cart.setQty(it.id, Number(e.target.value)) }),
              h('button', { type: 'button', 'aria-label': 'زيادة كمية ' + it.name, dataset: { fk: 'p-' + it.id }, onclick: () => Cart.setQty(it.id, l.qty + step) }, SA.icon('plus', 'icon-sm'))),
            h('b.ptl-ltot.num', {}, money(pr * l.qty)),
            h('button.sap-iconbtn.ptl-rm', { type: 'button', 'aria-label': 'حذف ' + it.name, title: 'حذف من الطلب', onclick: () => { Cart.remove(it.id); SA.toast('اتشال من طلبك: ' + it.name, 'info', { undo: () => Cart.add(it.id, l.qty) }); } }, SA.icon('trash', 'icon-sm'))));
        });
      }
      let lastTotal = null;
      function drawPf() {
        const lines = Cart.priced(); const t = ERP.flow.totals({ lines }); SA.clear(pfHost);
        const sheet = pfSheet({ no: nextPf(), preview: true, date: ERP.now(), lines });
        if (lastTotal != null && lastTotal !== t.total) { const tt = sheet.querySelector('.totals'); if (tt) tt.classList.add('flash'); }
        lastTotal = t.total;
        SA.clear(mbar); mbar.hidden = !lines.length; if (lines.length) mbar.append(h('div', {}, h('small', {}, nItems(lines.length) + ' · شامل الضريبة'), h('b.num', {}, money(t.total))), SA.btn({ label: 'أرسل الطلب', icon: 'send', kind: 'primary', perm: 'portal.orders.create', onClick: () => submit() }));
        pfHost.append(h('div.ptl-pflabel', {}, SA.icon('doc', 'icon-sm'), 'فاتورتك المبدئية بتتكوّن قدامك'), sheet, creditBox(t.total),
          SA.btn({ label: 'أرسل الطلب للمبيعات', icon: 'send', kind: 'accent', size: 'lg', perm: 'portal.orders.create', reason: lines.length ? '' : 'أضف منتجًا واحدًا على الأقل', class: 'ptl-send', attrs: { 'data-act': 'submit-order' }, onClick: () => submit() }),
          h('p.ptl-fine', {}, SA.icon('shield', 'icon-sm'), h('span', {}, 'بعد الإرسال يوصل طلبك للمبيعات بحالة «قيد مراجعة المبيعات». مفيش تأكيد تلقائي — ممثل المبيعات بيتصل بيك يأكد الأصناف والسعر وموعد التسليم.')));
      }
      function redraw() { const ae = document.activeElement; const fk = ae && ae.dataset ? ae.dataset.fk : null; drawSteps(); drawLines(); drawPf(); if (fk) { const e = root.querySelector('[data-fk="' + fk + '"]'); if (e) e.focus(); } }
      async function submit() {
        const lines = Cart.priced(); if (!lines.length) return; const t = ERP.flow.totals({ lines });
        if (!phoneF.validate()) { phoneF.focus(); SA.toast('اكتب رقم هاتف صحيح عشان ممثل المبيعات يقدر يتصل بيك', 'warn'); return; }
        const phone = String(fv.phone).trim();
        const r = await SA.confirm({ title: 'إرسال الطلب للمبيعات؟', icon: 'send', confirmLabel: 'أرسل الطلب', note: 'الطلب بيتسجّل في النظام باسمك مع الوقت.',
          text: 'طلبك هيوصل لفريق المبيعات للمراجعة. ممثل المبيعات هيتصل بيك لتأكيده قبل أي تجهيز.',
          impact: [nItems(lines.length) + ' — الإجمالي ' + money(t.total) + ' شامل الضريبة (نسبة تجريبية)', 'الحالة بعد الإرسال: قيد مراجعة المبيعات (لا تأكيد تلقائي)', 'مكالمة التأكيد على ' + phone + ' — ' + fv.time] });
        if (!r || !r.ok) return;
        let so = null;
        try {
          await SA.api(() => {
            const notes = [String(fv.notes || '').trim(), 'الاستلام: ' + (DELIVERY[fv.delivery] || ''), fv.date ? 'موعد التسليم المرغوب: ' + ERP.fmt.date(fv.date) : ''].filter(Boolean).join(' · ');
            so = ERP.flow.createOrder({ customerId: cid(), source: 'portal', lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty })), notes, call: { phone, preferredTime: fv.time, log: [] } });
            st.patch('salesOrders', so.id, { proformaNo: 'PF-' + so.id.slice(3), delivery: fv.delivery, requestedDate: fv.date || null });
            ERP.flow.submitOrder(so.id);
            notifyDealer({ title: 'تم استلام طلبك ' + so.id, body: 'سيتصل بك ممثل المبيعات لتأكيد الطلب على ' + phone + ' (' + fv.time + ').', link: '#/portal/orders/' + so.id });
          });
        } catch (e) { return SA.fail(e); }
        Cart.clear();
        SA.toast('تم إرسال طلبك ' + so.id + ' — سيتصل بك ممثل المبيعات لتأكيده', 'success');
        SA.nav('portal/order', { query: { done: so.id } });
      }
      drawSteps(); drawLines(); drawPf();
      root.appendChild(page(
        SA.pageHead({ title: 'طلب جديد', desc: 'عدّل الكميات وشوف فاتورتك المبدئية بتتحدث لحظيًا بأسعارك. الطلب يوصل للمبيعات وممثل المبيعات بيتصل بيك يأكده — مفيش تأكيد تلقائي.', actions: [h('a.btn.btn-ghost', { href: '#/portal/catalog' }, SA.icon('grid', 'icon-sm'), 'أضف من الكتالوج')] }),
        stepsEl,
        h('div.ptl-order', {},
          h('div.ptl-col', {}, SA.card({ title: 'بنود طلبك', flush: true }, linesHost), quick,
            SA.card({ title: 'بيانات التأكيد' }, phoneF.el, h('div.ptl-2', {}, timeF.el, delF.el), dateF.el, notesF.el,
              h('div.call-note', {}, SA.icon('phone'), h('div', {}, h('b', {}, 'سيتصل بك ممثل المبيعات لتأكيد الطلب.'), h('br'), 'بنراجع معاك الأصناف والكميات وموعد التسليم وطريقة الدفع — وطلبك ما بيتأكدش قبل المكالمة.')))),
          h('aside.ptl-sticky', { 'aria-label': 'الفاتورة المبدئية' }, pfHost)), mbar));
      const off = SA.on('portal.cart', redraw);
      const offS = st.subscribe('stock', () => { drawLines(); });
      return () => { off(); offS(); };
    } });

  function renderDone(root, ctx, soId) {
    ctx.setCrumbs([{ label: 'بوابة التاجر' }, { label: 'طلب جديد', href: '#/portal/order' }, { label: 'تم الإرسال' }]);
    return SA.live(root, () => {
      const so = ERP.find('salesOrders', soId);
      if (!so || so.customerId !== cid()) return page(notFound('الطلب غير موجود', 'portal/orders', 'طلباتي'));
      const t = ERP.flow.totals(so); const c = cust(); const rep = (so.repId && SA.userById(so.repId)) || (c.salesRepId && SA.userById(c.salesRepId)); const call = so.call || {}; const tr = trackOf(so);
      const n = tr.stop ? 1 : tr.cur <= 1 ? 1 : tr.cur <= 3 ? 2 : tr.cur <= 4 ? 3 : 4;
      const next = [['أُرسل طلبك للمبيعات', 'حالته دلوقتي: ' + ((SA.catalog.status.so[so.status] || [so.status])[0]), so.submittedAt], ['مكالمة التأكيد من ممثل المبيعات', 'بنراجع الأصناف والكميات وموعد التسليم وطريقة الدفع'], ['تأكيد الطلب وحجز البضاعة أو جدولة التصنيع', 'هتلاقي كل مرحلة في «طلباتي»'], ['التجهيز والتحميل والشحن', 'موعد التسليم المتوقع يظهر بعد التأكيد'], ['التسليم والفاتورة', 'فاتورة البيع تظهر في «فواتيري» وكشف حسابك']];
      return page(h('section.ptl-done', { 'aria-live': 'polite' },
        h('span.ptl-done-ico', {}, SA.icon('check')),
        h('h1', {}, 'تم إرسال طلبك بنجاح'),
        h('p.ptl-done-meta', {}, h('span', {}, 'رقم الطلب ', h('b.num', {}, so.id)), h('span', {}, '· الفاتورة المبدئية ', h('b.num', {}, so.proformaNo || 'PF-' + so.id.slice(3))), h('span', {}, '· ' + nItems(so.lines.length)), h('span', {}, '· ', h('b.num', {}, money(t.total)))),
        ERP.ui.status('so', so.status),
        h('div.call-note.is-big', {}, SA.icon('phone', 'icon-lg'), h('div', {}, h('strong', {}, 'سيتصل بك ممثل المبيعات لتأكيد الطلب'), h('br'),
          'على ', h('b.num', { dir: 'ltr' }, call.phone || '—'), call.preferredTime ? ' · ' + call.preferredTime : '', rep ? [' · ممثل المبيعات: ', h('b', {}, rep.name)] : null, h('br'),
          h('small', {}, 'طلبك ما بيتأكدش تلقائيًا قبل المكالمة دي. للاستعجال: الخط الساخن ', h('b.num', {}, '15536'), '.'))),
        h('div.ptl-next', {}, h('h2', {}, 'إيه اللي هيحصل بعد كده؟'), h('ul.timeline', {}, next.map((x, i) => h('li', { class: i < n ? 'is-done' : i === n ? 'is-now' : null }, h('div', {}, x[0], h('small', {}, x[1])), h('time', {}, x[2] ? SA.fmt.time(x[2]) : '—'))))),
        h('div.ptl-acts', {}, SA.btn({ label: 'تابع طلبك', icon: 'list', kind: 'primary', onClick: () => SA.nav('portal/orders/' + so.id) }), SA.btn({ label: 'طباعة الفاتورة المبدئية', icon: 'doc', kind: 'ghost', onClick: () => openPf(so) }), SA.btn({ label: 'العودة للكتالوج', icon: 'grid', kind: 'ghost', onClick: () => SA.nav('portal/catalog') }))));
    }, ['salesOrders']);
  }

  /* ═════════════════════════ 3. MY ORDERS + detail ═════════════════════════ */
  SA.register({ id: 'portal-orders', app: 'portal', group: 'portal-main', title: 'طلباتي', icon: 'list', route: 'portal/orders', perm: 'portal.orders.view', order: 3, desc: 'طلباتي ومراحلها',
    badge() { const n = myOrders().filter((o) => o.status === 'pending_review').length; return n || null; },
    render(root, ctx) {
      const id = ctx.path[0];
      if (id) { ctx.setCrumbs([{ label: 'بوابة التاجر' }, { label: 'طلباتي', href: '#/portal/orders' }, { label: id }]); return SA.live(root, () => orderDetail(id), ['salesOrders', 'deliveries', 'invoices', 'workOrders']); }
      ctx.setCrumbs([{ label: 'بوابة التاجر' }, { label: 'طلباتي' }]);
      return SA.live(root, () => ordersList(ctx), ['salesOrders', 'deliveries', 'invoices']);
    } });

  function ordersList(ctx) {
    const rows = myOrders().map((so) => ({ id: so.id, so, t: trackOf(so), tot: ERP.flow.totals(so).total }));
    const open = rows.filter((r) => OPEN_SO.indexOf(r.so.status) >= 0);
    const pend = rows.filter((r) => r.so.status === 'pending_review' || r.so.status === 'pending_approval'); const calls = pend.filter((r) => r.so.status === 'pending_review');
    const making = rows.filter((r) => ['confirmed', 'in_production', 'ready', 'partially_delivered'].indexOf(r.so.status) >= 0);
    const yearAgo = ERP.day(-365); const spend = rows.filter((r) => ['cancelled', 'rejected', 'draft'].indexOf(r.so.status) < 0 && dateOf(r.so.createdAt) >= yearAgo).reduce((a, r) => a + r.tot, 0);
    const stageOf = (r) => (r.t.stop ? 'stopped' : r.t.cur <= 1 ? 'call' : r.t.cur <= 3 ? 'making' : r.t.cur <= 5 && OPEN_SO.indexOf(r.so.status) >= 0 ? 'moving' : 'done');
    const summary = (so) => { const f = so.lines[0]; const it = f && ERP.item(f.itemId); return h('span.ptl-cell', {}, h('b', {}, it ? it.name : '—'), h('small', {}, so.lines.length > 1 ? '+ ' + (so.lines.length === 2 ? 'صنف آخر' : (so.lines.length - 1) + ' أصناف أخرى') : f ? ERP.fmt.qty(f.qty, it && it.uom) : '')); };
    const table = SA.table({
      caption: 'طلباتي', rows, pageSize: 10,
      search: { placeholder: 'ابحث برقم الطلب أو المنتج أو الكود…', keys: (r, q) => has(r.id, q) || r.so.lines.some((l) => { const it = ERP.item(l.itemId) || {}; return has(it.name, q) || has(it.code, q); }) },
      filters: [{ key: 'stage', label: 'المرحلة', options: [['open', 'مفتوحة'], ['call', 'بانتظار التأكيد'], ['making', 'تصنيع/تجهيز'], ['moving', 'في الطريق / تسليم جزئي'], ['done', 'مكتملة'], ['stopped', 'ملغاة/مرفوضة']], test: (r, v) => (v === 'open' ? OPEN_SO.indexOf(r.so.status) >= 0 : stageOf(r) === v) },
        { key: 'src', label: 'المصدر', options: [['portal', 'من البوابة'], ['rep', 'عن طريق ممثل المبيعات']], test: (r, v) => (v === 'portal' ? r.so.source === 'portal' : r.so.source !== 'portal') }],
      initial: { sort: { key: 'date', dir: 'desc' }, filters: ctx.params.stage ? { stage: ctx.params.stage } : {} },
      columns: [
        { key: 'id', label: 'رقم الطلب', sort: true, render: (r) => h('span.ptl-cell', {}, plink(r.id), h('small', {}, SRC_LABEL[r.so.source] || '')) },
        { key: 'date', label: 'التاريخ', sort: true, value: (r) => r.so.createdAt, render: (r) => ERP.fmt.date(r.so.createdAt) },
        { key: 'items', label: 'البنود', render: (r) => summary(r.so) },
        { key: 'total', label: 'القيمة', sort: true, class: 'col-num', value: (r) => r.tot, render: (r) => ERP.ui.money(r.tot) },
        { key: 'status', label: 'الحالة', render: (r) => ERP.ui.status('so', r.so.status) },
        { key: 'stage', label: 'أين طلبك الآن', render: (r) => h('span.ptl-cell', {}, miniTrack(r.t), h('small', {}, r.t.nowText)) },
        { key: 'act', label: 'إعادة', render: (r) => SA.btn({ label: 'أعد الطلب', title: 'أعد الطلب', icon: 'refresh', kind: 'ghost', size: 'sm', iconOnly: true, perm: 'portal.orders.create', onClick: () => reorder(r.so) }) }
      ],
      rowActions: (r) => [{ label: 'تفاصيل الطلب', icon: 'eye', onClick: () => SA.nav('portal/orders/' + r.id) }, { label: 'أعد الطلب', icon: 'refresh', disabled: SA.can('portal.orders.create') ? false : 'ليست من صلاحياتك', onClick: () => reorder(r.so) }, { label: 'الفاتورة المبدئية', icon: 'doc', onClick: () => openPf(r.so) }, { label: 'تواصل بخصوص الطلب', icon: 'headset', hidden: !SA.can('portal.support.create'), onClick: () => SA.nav('portal/support?so=' + r.id) }],
      onRowClick: (r) => SA.nav('portal/orders/' + r.id),
      empty: { icon: 'list', title: 'لسه ما عندكش طلبات', text: 'ابدأ أول طلب من الكتالوج — هتشوف أسعارك والفاتورة المبدئية لحظيًا.', action: { label: 'تصفح الكتالوج', icon: 'grid', onClick: () => SA.nav('portal/catalog') } }
    });
    return page(
      SA.pageHead({ title: 'طلباتي', desc: 'كل طلباتك ومرحلة كل طلب لحظيًا — من الإرسال ومكالمة التأكيد للتصنيع والتسليم والفاتورة.', actions: [SA.btn({ label: 'طلب جديد', icon: 'plus', kind: 'accent', perm: 'portal.orders.create', onClick: () => SA.nav('portal/order') })] }),
      ERP.ui.kpis([
        ERP.ui.kpi({ label: 'طلبات مفتوحة', value: num(open.length), icon: 'list', sub: 'لم تكتمل بعد' }),
        ERP.ui.kpi({ label: 'بانتظار تأكيد المبيعات', value: num(pend.length), icon: 'phone', tone: pend.length ? 'warning' : null, sub: calls.length ? calls.length + ' بانتظار مكالمة التأكيد' : 'قيد المراجعة' }),
        ERP.ui.kpi({ label: 'قيد التصنيع والتجهيز', value: num(making.length), icon: 'factory', sub: 'تتابعها من «أين طلبك الآن»' }),
        ERP.ui.kpi({ label: 'مشترياتك آخر 12 شهر', value: ERP.fmt.short(spend), icon: 'trend', sub: 'شامل الضريبة (تجريبية)' })]),
      calls.length ? h('div.call-note', {}, SA.icon('phone'), h('div', {}, h('b', {}, calls.length === 1 ? 'عندك طلب بانتظار مكالمة التأكيد: ' : 'عندك ' + calls.length + ' طلبات بانتظار مكالمة التأكيد: '), calls.slice(0, 3).map((r, i) => [i ? '، ' : '', plink(r.id)]), h('br'), 'ممثل المبيعات هيتصل بيك على الرقم اللي كتبته في الطلب.')) : null,
      table.el);
  }

  function orderDetail(id) {
    const so = ERP.find('salesOrders', id);
    if (!so || so.customerId !== cid()) return page(notFound('الطلب غير موجود', 'portal/orders', 'طلباتي'));
    const t = trackOf(so); const tot = ERP.flow.totals(so); const c = cust(); const rep = (so.repId && SA.userById(so.repId)) || (c.salesRepId && SA.userById(c.salesRepId)); const call = so.call || {};
    const confirmed = ['draft', 'pending_review', 'pending_approval', 'rejected', 'cancelled'].indexOf(so.status) < 0;
    let note = null;
    if (t.stop) note = SA.alert('warning', 'الطلب ' + (t.stop === 'rejected' ? 'لم يتم قبوله' : 'أُلغي') + '. تواصل مع ممثل المبيعات أو الخط الساخن 15536 للتفاصيل.');
    else if (so.status === 'pending_review') note = h('div.call-note', {}, SA.icon('phone'), h('div', {}, h('b', {}, 'سيتصل بك ممثل المبيعات لتأكيد الطلب'), ' على ', h('b.num', { dir: 'ltr' }, call.phone || '—'), call.preferredTime ? ' — ' + call.preferredTime : '', '. طلبك ما بيتأكدش تلقائيًا.'));
    else if (so.status === 'pending_approval') note = SA.alert('info', 'طلبك في المراجعة النهائية لدى المبيعات. هنبلغك أول ما يتأكد.');
    else if (t.cur === 2) note = h('div', {}, t.pct != null ? ERP.chart.meter(t.pct, { label: 'نسبة إنجاز التصنيع لطلبك', tone: 'primary' }) : SA.alert('info', 'طلبك بيتجهز من المخزن.'), h('small.ptl-muted', {}, 'موعد التسليم المتوقع: ', h('b', {}, ERP.fmt.date(so.promisedDate))));
    else if (t.cur === 3) note = SA.alert('success', 'طلبك جاهز وبيتجهز للتحميل. موعد التسليم المتوقع: ' + ERP.fmt.date(so.promisedDate) + '.');
    else if (t.cur === 4) note = SA.alert('info', 'الشحنة في الطريق إليك.');
    else if (t.cur >= 5) note = SA.alert('success', so.status === 'closed' ? 'الطلب اكتمل: تم التسليم والفوترة والسداد. شكرًا لثقتك.' : so.status === 'partially_delivered' ? 'تم تسليم جزء من الطلب، والباقي في الطريق.' : 'تم تسليم طلبك.');
    const linesCard = SA.card({ title: 'بنود الطلب', flush: true },
      tbl([['الصنف'], ['الكمية', 'col-num'], ['تم تسليمه', 'col-num'], ['سعر الوحدة', 'col-num'], ['الإجمالي', 'col-num']], so.lines.map((l) => { const it = ERP.item(l.itemId) || {}; return [ERP.ui.itemCell(l.itemId), h('span.num', {}, ERP.fmt.qty(l.qty, it.uom)), h('span.num', {}, ERP.fmt.qty(l.deliveredQty || 0, it.uom)), h('span.num', {}, money(l.price)), h('b.num', {}, money(l.qty * l.price))]; }), 'بنود الطلب'),
      h('div', { style: { padding: '12px 16px' } }, h('div.ptl-sum', {}, sumRow('الإجمالي قبل الضريبة', tot.gross), tot.discount ? sumRow('الخصم (' + so.discountPct + '%)', -tot.discount) : null, h('div', {}, h('span', {}, 'الضريبة ', ERP.taxIsDemo() ? ERP.ui.demo('تجريبية') : null), h('b.num', {}, money(tot.tax))), h('div.is-grand', {}, h('span', {}, 'الإجمالي'), h('b.num', {}, money(tot.total))))));
    const log = (call.log || []).filter((x) => CALL_RES[x.result]);
    const infoCard = SA.card({ title: 'بيانات الطلب' }, SA.kv([
      ['رقم الطلب', h('span.num', {}, so.id)], ['تاريخ الطلب', SA.fmt.dt(so.submittedAt || so.createdAt)], ['المصدر', SRC_LABEL[so.source] || '—'], rep ? ['ممثل المبيعات', rep.name] : null,
      call.phone ? ['هاتف التأكيد', h('span.num', { dir: 'ltr' }, call.phone)] : null, call.preferredTime ? ['أنسب وقت للاتصال', call.preferredTime] : null,
      ['موعد التسليم المتوقع', confirmed ? ERP.fmt.date(so.promisedDate) : 'يتحدد في مكالمة التأكيد'], so.discountPct ? ['الخصم', h('span.num', {}, so.discountPct + '%')] : null,
      so.source === 'portal' && so.notes ? ['ملاحظاتك', so.notes] : null, so.source === 'portal' ? ['الفاتورة المبدئية', h('span.num', {}, so.proformaNo || 'PF-' + so.id.slice(3))] : null]),
      log.length ? h('div', {}, h('div.ptl-subh', {}, 'مكالمات المبيعات'), h('ul.ptl-calllog', {}, log.map((x) => h('li', {}, SA.icon(CALL_RES[x.result][1], 'icon-sm'), h('span', {}, CALL_RES[x.result][0]), h('time', {}, SA.fmt.dt(x.at)))))) : null);
    const dnCard = SA.card({ title: 'أذون التسليم' }, t.dns.length ? tbl([['الإذن'], ['الحالة'], ['موعد التسليم'], ['خروج / استلام']], t.dns.map((d) => [h('span.ptl-cell', {}, h('span.num', {}, d.id), h('small', {}, nKinds(d.lines.length))), ERP.ui.status('dn', d.status), ERP.fmt.date(d.plannedDate), d.deliveredAt ? h('span.ptl-cell', {}, 'استُلم ' + ERP.fmt.date(d.deliveredAt), d.pod && d.pod.receivedBy ? h('small', {}, 'بواسطة: ' + d.pod.receivedBy) : null) : d.dispatchedAt ? h('span.ptl-cell', {}, 'خرج ' + SA.fmt.dt(d.dispatchedAt), h('small', {}, 'في الطريق إليك')) : '—']), 'أذون التسليم')
      : SA.empty({ icon: 'truck', title: 'لا توجد أذون تسليم بعد', text: confirmed ? 'إذن التسليم بيتعمل لما الطلب يجهز.' : 'بعد تأكيد الطلب وتجهيزه هيظهر هنا موعد التسليم.' }));
    const invCard = SA.card({ title: 'الفواتير' }, t.invs.length ? tbl([['الفاتورة'], ['التاريخ'], ['المتبقي', 'col-num'], ['الحالة']], t.invs.map((i) => [h('span.ptl-cell', {}, plink(i.id), h('small', {}, 'الإجمالي ' + money(i.total))), ERP.fmt.date(i.issueDate), h('b.num', {}, money(remaining(i))), ERP.ui.status('inv', invStatus(i))]), 'فواتير الطلب')
      : SA.empty({ icon: 'receipt', title: 'لم تصدر فاتورة بعد', text: 'فاتورة البيع بتصدر بعد التسليم وتظهر هنا وفي «فواتيري».' }));
    return page(
      SA.pageHead({ title: 'طلب ' + so.id, tags: [ERP.ui.status('so', so.status)], back: { label: 'طلباتي', href: '#/portal/orders' }, desc: ERP.fmt.date(so.createdAt) + ' · ' + (SRC_LABEL[so.source] || '') + ' · ' + nItems(so.lines.length) + ' · ' + money(tot.total),
        actions: [SA.btn({ label: 'الفاتورة المبدئية', icon: 'doc', kind: 'ghost', onClick: () => openPf(so) }), SA.btn({ label: 'تواصل بخصوص الطلب', icon: 'headset', kind: 'ghost', perm: 'portal.support.create', onClick: () => SA.nav('portal/support?so=' + so.id) }), SA.btn({ label: 'أعد الطلب', icon: 'refresh', kind: 'primary', perm: 'portal.orders.create', onClick: () => reorder(so) })] }),
      SA.card({ title: 'أين طلبك الآن' }, trackerEl(t), note),
      h('div.ptl-detail', {}, linesCard, infoCard),
      h('div.erp-grid.erp-grid-2', { style: { marginBlock: 0 } }, dnCard, invCard));
  }

  /* ═════════════════════════ 4. MY INVOICES + printable view ═════════════════════════ */
  SA.register({ id: 'portal-invoices', app: 'portal', group: 'portal-main', title: 'فواتيري', icon: 'receipt', route: 'portal/invoices', perm: 'portal.invoices.view', order: 4, desc: 'فواتيري والمدفوع والمتبقي',
    badge() { const n = myInvoices().filter((i) => invStatus(i) === 'overdue').length; return n || null; },
    render(root, ctx) {
      const id = ctx.path[0];
      if (id) { ctx.setCrumbs([{ label: 'بوابة التاجر' }, { label: 'فواتيري', href: '#/portal/invoices' }, { label: id }]); return SA.live(root, () => invoiceDoc(id), ['invoices', 'receipts', 'cheques']); }
      ctx.setCrumbs([{ label: 'بوابة التاجر' }, { label: 'فواتيري' }]);
      return SA.live(root, () => invoicesList(ctx), ['invoices', 'receipts']);
    } });

  function invoicesList(ctx) {
    const rows = myInvoices().map((i) => ({ id: i.id, inv: i, s: invStatus(i), rem: remaining(i) }));
    const due = rows.reduce((a, r) => a + r.rem, 0); const over = rows.filter((r) => r.s === 'overdue' && r.rem > 0); const overAmt = over.reduce((a, r) => a + r.rem, 0);
    const paid12 = ERP.get('receipts').filter((r) => r.customerId === cid() && r.date >= ERP.day(-365)).reduce((a, r) => a + r.amount, 0);
    const nextDue = rows.filter((r) => r.rem > 0 && r.s !== 'overdue').sort((a, b) => String(a.inv.dueDate).localeCompare(String(b.inv.dueDate)))[0];
    const table = SA.table({
      caption: 'فواتيري', rows, pageSize: 10,
      search: { placeholder: 'ابحث برقم الفاتورة أو الطلب…', keys: ['id', (r) => r.inv.soId] },
      filters: [{ key: 'st', label: 'الحالة', options: [['open', 'عليها مبالغ'], ['overdue', 'متأخرة'], ['partial', 'مدفوعة جزئيًا'], ['issued', 'صادرة'], ['paid', 'مدفوعة']], test: (r, v) => (v === 'open' ? r.rem > 0 : r.s === v) }],
      initial: { sort: { key: 'date', dir: 'desc' }, filters: ctx.params.status ? { st: ctx.params.status } : {} },
      columns: [
        { key: 'id', label: 'رقم الفاتورة', sort: true, render: (r) => plink(r.id) },
        { key: 'date', label: 'تاريخ الإصدار', sort: true, value: (r) => r.inv.issueDate, render: (r) => ERP.fmt.date(r.inv.issueDate) },
        { key: 'due', label: 'الاستحقاق', sort: true, value: (r) => r.inv.dueDate, render: (r) => { const d = ERP.daysBetween(r.inv.dueDate); return h('span.ptl-cell', {}, ERP.fmt.date(r.inv.dueDate), r.rem > 0 && d > 0 ? h('small', { style: { color: 'var(--color-danger)' } }, 'متأخرة ' + d + ' يوم') : r.rem > 0 ? h('small', {}, d === 0 ? 'تستحق اليوم' : 'باقي ' + -d + ' يوم') : null); } },
        { key: 'so', label: 'الطلب', render: (r) => (r.inv.soId ? plink(r.inv.soId) : '—') },
        { key: 'total', label: 'الإجمالي', sort: true, class: 'col-num', value: (r) => r.inv.total, render: (r) => ERP.ui.money(r.inv.total) },
        { key: 'paid', label: 'المدفوع', class: 'col-num', value: (r) => r.inv.paid, render: (r) => ERP.ui.money(r.inv.paid || 0) },
        { key: 'rem', label: 'المتبقي', sort: true, class: 'col-num', value: (r) => r.rem, render: (r) => h('b.num', {}, money(r.rem)) },
        { key: 'status', label: 'الحالة', render: (r) => ERP.ui.status('inv', r.s) }
      ],
      rowActions: (r) => [{ label: 'عرض / طباعة', icon: 'doc', onClick: () => SA.nav('portal/invoices/' + r.id) }, r.inv.soId ? { label: 'الطلب ' + r.inv.soId, icon: 'list', onClick: () => SA.nav('portal/orders/' + r.inv.soId) } : null, { label: 'استفسار عن الفاتورة', icon: 'headset', hidden: !SA.can('portal.support.create'), onClick: () => SA.nav('portal/support?inv=' + r.id) }].filter(Boolean),
      onRowClick: (r) => SA.nav('portal/invoices/' + r.id),
      empty: { icon: 'receipt', title: 'لا توجد فواتير بعد', text: 'فواتير البيع بتظهر هنا بعد تسليم طلباتك.' }
    });
    return page(
      SA.pageHead({ title: 'فواتيري', desc: 'فواتير البيع الصادرة لحسابك: المدفوع والمتبقي وتاريخ الاستحقاق.', tags: [ERP.ui.demo('ضريبة 14% تجريبية')], actions: [h('a.btn.btn-ghost', { href: '#/portal/statement' }, SA.icon('coins', 'icon-sm'), 'كشف الحساب')] }),
      ERP.ui.kpis([
        ERP.ui.kpi({ label: 'المستحق عليك', value: ERP.fmt.short(due), icon: 'coins', sub: rows.filter((r) => r.rem > 0).length + ' فواتير عليها مبالغ' }),
        ERP.ui.kpi({ label: 'متأخر السداد', value: ERP.fmt.short(overAmt), icon: 'alert', tone: over.length ? 'danger' : null, sub: over.length ? over.length + ' فواتير بعد تاريخ الاستحقاق' : 'لا يوجد متأخرات' }),
        ERP.ui.kpi({ label: 'أقرب استحقاق', value: nextDue ? ERP.fmt.date(nextDue.inv.dueDate) : '—', icon: 'calendar', sub: nextDue ? nextDue.id + ' · ' + money(nextDue.rem) : 'لا يوجد' }),
        ERP.ui.kpi({ label: 'مدفوعاتك آخر 12 شهر', value: ERP.fmt.short(paid12), icon: 'checkcircle', tone: 'success' })]),
      over.length ? SA.alert('warning', 'عندك ' + over.length + ' فواتير بعد تاريخ استحقاقها بإجمالي ' + money(overAmt) + '. لو تم السداد بالفعل تجاهل الرسالة — أو تواصل مع الحسابات على الخط الساخن 15536.') : null,
      table.el);
  }

  function invoiceDoc(id) {
    const inv = ERP.find('invoices', id);
    if (!inv || inv.customerId !== cid() || inv.status === 'draft') return page(notFound('الفاتورة غير موجودة', 'portal/invoices', 'فواتيري'));
    const s = invStatus(inv); const co = st.get('settings.company') || {}; const c = cust(); const rem = remaining(inv);
    const gross = inv.lines.reduce((a, l) => a + l.qty * l.price, 0); const disc = Math.round(gross * (inv.discountPct || 0) / 100);
    const rvs = ERP.get('receipts').filter((r) => r.invoiceId === inv.id && r.customerId === cid());
    const sheet = h('div.inv-sheet.ptl-doc.ptl-printable', {},
      h('div.ptl-doc-head', {}, h('div', {}, h('img', { src: LOGO, alt: 'المصرية الألمانية' }), h('div.ptl-doc-co', {}, h('b', {}, co.nameAr || ''), co.address ? h('span', {}, co.address) : null, h('span', {}, [co.phone ? 'الخط الساخن ' + co.phone : '', co.email || ''].filter(Boolean).join(' · ')))),
        h('div.ptl-doc-title', {}, h('h2', {}, 'فاتورة بيع'), h('b.num', {}, inv.id), h('span', {}, 'تاريخ الإصدار: ', ERP.fmt.date(inv.issueDate)), h('span', {}, 'تاريخ الاستحقاق: ', ERP.fmt.date(inv.dueDate)), ERP.ui.status('inv', s))),
      h('div.ptl-doc-parties', {}, h('div', {}, h('small', {}, 'العميل'), h('b', {}, c.name), h('span', {}, [c.code, c.city].filter(Boolean).join(' · '))), h('div', {}, h('small', {}, 'المرجع'), h('span', {}, 'أمر البيع: ', inv.soId ? h('b.num', {}, inv.soId) : '—'), (inv.dnIds || []).length ? h('span', {}, 'إذن التسليم: ', h('span.num', {}, inv.dnIds.join('، '))) : null)),
      h('div.table-wrap', {}, h('table.table.ptl-pftbl', {}, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'الصنف'), h('th.col-num', {}, 'الكمية'), h('th.col-num', {}, 'سعر الوحدة'), h('th.col-num', {}, 'الإجمالي'))),
        h('tbody', {}, inv.lines.map((l, i) => { const it = ERP.item(l.itemId) || {}; return h('tr', {}, h('td', {}, h('span.num', {}, i + 1)), h('td', {}, h('b', {}, it.name || l.itemId), h('small', {}, it.code || '')), h('td.col-num', {}, h('span.num', {}, ERP.fmt.qty(l.qty, it.uom))), h('td.col-num', {}, h('span.num', {}, num(l.price))), h('td.col-num', {}, h('b.num', {}, num(l.qty * l.price)))); })))),
      h('div.ptl-sum', {}, sumRow('الإجمالي', Math.round(gross)), disc ? sumRow('الخصم (' + inv.discountPct + '%)', -disc) : null, sumRow('الصافي', inv.net), h('div', {}, h('span', {}, 'ضريبة القيمة المضافة ', inv.taxDemo !== false && ERP.taxIsDemo() ? ERP.ui.demo('14% تجريبية') : null), h('b.num', {}, money(inv.tax))), sumRow('إجمالي الفاتورة', inv.total), sumRow('المدفوع', inv.paid || 0), h('div.is-grand', {}, h('span', {}, 'المتبقي'), h('b.num', {}, money(rem)))),
      rvs.length ? h('div', {}, h('div.ptl-subh', {}, 'المدفوعات على الفاتورة'), tbl([['السند'], ['التاريخ'], ['الطريقة'], ['المبلغ', 'col-num']], rvs.map((r) => { const ch = r.chequeId ? ERP.find('cheques', r.chequeId) : null; return [h('span.num', {}, r.id), ERP.fmt.date(r.date), h('span.ptl-cell', {}, METHOD[r.method] || r.method, ch ? h('small', {}, 'شيك ' + ch.no + ' · ', ERP.ui.status('cheque', ch.status)) : null), h('b.num', {}, money(r.amount))]; }), 'المدفوعات')) : null,
      h('div.ptl-doc-foot', {}, 'نسبة ضريبة القيمة المضافة في النموذج قيمة تجريبية غير معتمدة. هذا المستند للاطلاع ولا يُعد فاتورة إلكترونية معتمدة. للاستفسار: الخط الساخن 15536 · contact@egerman-upvc.com'));
    return page(
      SA.pageHead({ title: 'فاتورة ' + inv.id, tags: [ERP.ui.status('inv', s)], back: { label: 'فواتيري', href: '#/portal/invoices' }, desc: 'إجمالي ' + money(inv.total) + ' · المتبقي ' + money(rem),
        actions: [SA.btn({ label: 'طباعة / حفظ PDF', icon: 'download', kind: 'ghost', onClick: () => window.print() }), inv.soId ? h('a.btn.btn-ghost', { href: '#/portal/orders/' + encodeURIComponent(inv.soId) }, SA.icon('list', 'icon-sm'), 'الطلب ' + inv.soId) : null, SA.btn({ label: 'استفسار عن الفاتورة', icon: 'headset', kind: 'ghost', perm: 'portal.support.create', onClick: () => SA.nav('portal/support?inv=' + inv.id) })] }),
      sheet);
  }

  /* ═════════════════════════ 5. ACCOUNT STATEMENT ═════════════════════════ */
  function ledger() {
    const id = cid(); const rows = [];
    myInvoices().forEach((i) => rows.push({ id: 'L-' + i.id, date: i.issueDate, doc: i.id, kind: 'inv', desc: 'فاتورة بيع' + (i.soId ? ' — طلب ' + i.soId : ''), debit: i.total, credit: 0 }));
    ERP.get('receipts').filter((r) => r.customerId === id).forEach((r) => { const ch = r.chequeId ? ERP.find('cheques', r.chequeId) : null; rows.push({ id: 'L-' + r.id, date: r.date, doc: r.id, kind: 'rv', desc: 'سداد ' + (METHOD[r.method] || '') + (ch ? ' رقم ' + ch.no : '') + (r.invoiceId ? ' — فاتورة ' + r.invoiceId : ''), debit: 0, credit: r.amount }); });
    ERP.get('cheques').filter((c) => c.customerId === id && c.status === 'bounced').forEach((c) => { const hb = (c.history || []).filter((x) => x.status === 'bounced').pop(); rows.push({ id: 'L-B-' + c.id, date: hb ? dateOf(hb.at) : c.dueDate, doc: c.id, kind: 'bounce', desc: 'شيك مرتد رقم ' + c.no + ' (' + c.bank + ')', debit: c.amount, credit: 0 }); });
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.debit ? -1 : 1));
    let bal = 0; rows.forEach((r) => { bal += r.debit - r.credit; r.balance = Math.round(bal); });
    return rows;
  }
  function aging() {
    const b = [['لم يستحق بعد', 0, 'var(--eg-navy)'], ['متأخر 1–30 يوم', 0, '#c9a227'], ['متأخر 31–60 يوم', 0, '#a85a00'], ['متأخر 61–90 يوم', 0, '#b9141b'], ['أكثر من 90 يوم', 0, '#7b1e22']];
    myInvoices().forEach((i) => { const r = remaining(i); if (r <= 0) return; const d = ERP.daysBetween(i.dueDate); b[d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4][1] += r; });
    return b;
  }
  SA.register({ id: 'portal-statement', app: 'portal', group: 'portal-main', title: 'كشف الحساب', icon: 'coins', route: 'portal/statement', perm: 'portal.statement.view', order: 5, desc: 'كشف حسابي والحد الائتماني والشيكات',
    render(root, ctx) {
      ctx.setCrumbs([{ label: 'بوابة التاجر' }, { label: 'كشف الحساب' }]);
      const f = { period: ['3', '6', '12', 'all'].indexOf(ctx.params.period) >= 0 ? ctx.params.period : '12' };
      const redraw = () => { SA.clear(root); root.appendChild(statement(f, redraw)); };
      return SA.live(root, () => statement(f, redraw), ['invoices', 'receipts', 'cheques', 'customers']);
    } });
  function statement(f, redraw) {
    const c = cust(); const all = ledger(); const lim = c.creditLimit || 0; const bal = all.length ? all[all.length - 1].balance : 0;
    const cutoff = f.period === 'all' ? null : ERP.day(-Math.round(Number(f.period) * 30.4));
    const before = cutoff ? all.filter((r) => r.date < cutoff) : []; const opening = before.length ? before[before.length - 1].balance : 0;
    const inPeriod = cutoff ? all.filter((r) => r.date >= cutoff) : all.slice();
    const rows = inPeriod.slice().reverse(); if (cutoff) rows.push({ id: 'L-OPEN', date: cutoff, doc: '', kind: 'open', desc: 'رصيد أول المدة', debit: 0, credit: 0, balance: opening });
    const chqs = ERP.get('cheques').filter((x) => x.customerId === cid()).slice().sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate)));
    const pendingChq = chqs.filter((x) => x.status === 'received' || x.status === 'under_collection'); const bounced = chqs.filter((x) => x.status === 'bounced');
    const util = lim ? bal / lim : 0; const ag = aging(); const overdue = ag.slice(1).reduce((a, x) => a + x[1], 0);
    const keys = ERP.monthKeys(12); const trend = keys.map((k) => { const end = k + '-31'; let v = 0; all.forEach((r) => { if (r.date <= end) v = r.balance; }); return v; });
    const periodSeg = SA.segmented([['3', '3 شهور'], ['6', '6 شهور'], ['12', '12 شهر'], ['all', 'الكل']], f.period, (v) => { f.period = v; redraw(); });
    const csv = () => { SA.download('كشف-حساب-' + (c.code || cid()) + '.csv', SA.csv([['التاريخ', 'المستند', 'البيان', 'مدين', 'دائن', 'الرصيد']].concat(all.map((r) => [r.date, r.doc, r.desc, r.debit || '', r.credit || '', r.balance])))); SA.toast('تم تنزيل كشف الحساب (CSV)', 'success'); };
    const table = SA.table({
      caption: 'كشف الحساب', rows, pageSize: 12,
      search: { placeholder: 'ابحث برقم المستند أو البيان…', keys: ['doc', 'desc'] },
      filters: [{ key: 'kind', label: 'الحركة', options: [['inv', 'فواتير'], ['rv', 'مدفوعات'], ['bounce', 'شيكات مرتدة']], test: (r, v) => r.kind === v || r.kind === 'open' }],
      toolbar: [periodSeg, SA.btn({ label: 'تنزيل CSV', icon: 'download', kind: 'ghost', size: 'sm', onClick: csv })],
      columns: [
        { key: 'date', label: 'التاريخ', render: (r) => ERP.fmt.date(r.date) },
        { key: 'doc', label: 'المستند', render: (r) => (r.kind === 'open' ? '—' : r.kind === 'inv' ? plink(r.doc) : h('span.num', {}, r.doc)) },
        { key: 'desc', label: 'البيان', render: (r) => (r.kind === 'open' ? h('b', {}, r.desc) : r.kind === 'bounce' ? h('span', { style: { color: 'var(--color-danger)' } }, r.desc) : r.desc) },
        { key: 'debit', label: 'مدين (عليك)', class: 'col-num', render: (r) => (r.debit ? ERP.ui.money(r.debit) : '—') },
        { key: 'credit', label: 'دائن (لك)', class: 'col-num', render: (r) => (r.credit ? ERP.ui.money(r.credit) : '—') },
        { key: 'balance', label: 'الرصيد', class: 'col-num', render: (r) => h('b.num', {}, money(r.balance)) }
      ],
      empty: { icon: 'coins', title: 'لا توجد حركات في الفترة دي', text: 'جرّب فترة أطول.' }
    });
    return page(
      SA.pageHead({ title: 'كشف الحساب', desc: c.name + ' · ' + (c.code || '') + ' — رصيد جارٍ لكل الفواتير والمدفوعات والشيكات على حسابك.', actions: [h('a.btn.btn-ghost', { href: '#/portal/invoices' }, SA.icon('receipt', 'icon-sm'), 'فواتيري')] }),
      ERP.ui.kpis([
        ERP.ui.kpi({ label: 'الرصيد المستحق عليك', value: ERP.fmt.short(bal), icon: 'coins', tone: 'primary', sub: 'حتى ' + ERP.fmt.date(ERP.day(0)) }),
        ERP.ui.kpi({ label: 'المتأخر عن الاستحقاق', value: ERP.fmt.short(overdue), icon: 'alert', tone: overdue ? 'danger' : null, sub: overdue ? 'راجع «أعمار المستحقات»' : 'لا يوجد متأخرات' }),
        ERP.ui.kpi({ label: 'المتاح من الحد الائتماني', value: lim ? ERP.fmt.short(Math.max(0, lim - bal)) : '—', icon: 'gauge', sub: lim ? 'من ' + ERP.fmt.short(lim) : 'تعامل نقدي' }),
        ERP.ui.kpi({ label: 'شيكات تحت التحصيل', value: ERP.fmt.short(pendingChq.reduce((a, x) => a + x.amount, 0)), icon: 'receipt', sub: pendingChq.length + ' شيكات' })]),
      h('div.ptl-stmt-top', {},
        SA.card({ title: 'استخدام الحد الائتماني', tags: [ERP.ui.demo('حد تجريبي')] }, lim ? [h('div.ptl-util', {}, h('b.num', {}, Math.round(util * 100) + '%'), h('span.ptl-muted', {}, 'من ' + money(lim))), h('div.ptl-meterbig', {}, ERP.chart.meter(Math.min(1, util), { tone: util > 1 ? 'danger' : util > 0.8 ? 'warning' : 'primary' })), h('small.ptl-muted', {}, util > 1 ? 'الرصيد أعلى من الحد — ممثل المبيعات هيتفق معاك على ترتيب السداد قبل الطلبات الجديدة.' : util > 0.8 ? 'قربت من الحد الائتماني — السداد بيفتح مساحة لطلباتك الجاية.' : 'رصيدك في حدود آمنة من الحد الائتماني.')] : SA.alert('info', 'حسابك على التعامل النقدي.')),
        SA.card({ title: 'أعمار المستحقات' }, overdue + ag[0][1] > 0 ? ERP.chart.bars(ag.map((x) => ({ label: x[0], value: x[1], color: x[2] })), { fmt: ERP.fmt.short }) : SA.empty({ icon: 'checkcircle', title: 'لا توجد مستحقات مفتوحة', text: 'كل فواتيرك مسددة.' })),
        SA.card({ title: 'رصيدك خلال 12 شهر' }, ERP.chart.line({ labels: keys.map(ERP.monthLabel), series: [{ name: 'الرصيد آخر الشهر', values: trend }], height: 180, area: true }))),
      bounced.length ? SA.alert('warning', 'يوجد ' + bounced.length + ' شيك مرتد على حسابك بإجمالي ' + money(bounced.reduce((a, x) => a + x.amount, 0)) + ' — برجاء التواصل مع الحسابات لتسويته.') : null,
      SA.card({ title: 'الحركات', flush: true }, h('div', { style: { padding: '0 0 4px' } }, table.el)),
      SA.card({ title: 'شيكاتك' }, chqs.length ? tbl([['رقم الشيك'], ['البنك'], ['المبلغ', 'col-num'], ['تاريخ الاستحقاق'], ['الحالة']], chqs.slice(0, 12).map((x) => [h('span.num', {}, x.no), x.bank, h('b.num', {}, money(x.amount)), ERP.fmt.date(x.dueDate), ERP.ui.status('cheque', x.status)]), 'الشيكات') : SA.empty({ icon: 'receipt', title: 'لا توجد شيكات', text: 'الشيكات اللي بتسلمها للحسابات بتظهر هنا بحالتها.' })));
  }

  /* ═════════════════════════ 6. SUPPORT (complaint / inquiry → tickets[]) ═════════════════════════ */
  SA.register({ id: 'portal-support', app: 'portal', group: 'portal-main', title: 'الدعم والشكاوى', icon: 'headset', route: 'portal/support', perm: 'portal.support.create', order: 6, desc: 'شكوى أو استفسار أو طلب تركيب',
    badge() { const n = myTickets().filter((t) => ['resolved', 'closed'].indexOf(t.status) < 0).length; return n || null; },
    render(root, ctx) {
      ctx.setCrumbs([{ label: 'بوابة التاجر' }, { label: 'الدعم والشكاوى' }]);
      const inv = ctx.params.inv && ERP.find('invoices', ctx.params.inv); const okInv = inv && inv.customerId === cid();
      const so0 = ctx.params.so && ERP.find('salesOrders', ctx.params.so); const okSo = so0 && so0.customerId === cid();
      const s = { kind: okInv ? 'inquiry' : 'complaint', soId: okSo ? so0.id : okInv && inv.soId ? inv.soId : '', itemId: '', title: okInv ? 'استفسار عن الفاتورة ' + inv.id : '', desc: '', priority: 'normal', files: [], last: null };
      const redraw = () => { SA.clear(root); root.appendChild(support(s, redraw)); };
      return SA.live(root, () => support(s, redraw), ['tickets']);
    } });
  function support(s, redraw) {
    const orders = myOrders().slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 40);
    const so = s.soId ? ERP.find('salesOrders', s.soId) : null;
    const itemOpts = (so ? so.lines.map((l) => l.itemId) : products().reduce((a, p) => a.concat(p.skus.map((x) => x.id)), [])).map((id) => [id, ERP.itemName(id)]);
    const kinds = h('div.ptl-kinds', { role: 'radiogroup', 'aria-label': 'نوع الطلب' }, Object.keys(KIND).map((k) => h('button.ptl-kind', { type: 'button', role: 'radio', 'aria-checked': String(s.kind === k), onclick: () => { s.kind = k; redraw(); } }, SA.icon(KIND_ICON[k]), h('b', {}, KIND[k]), h('small', {}, KIND_HINT[k]))));
    const soF = SA.form.field({ name: 'so', label: 'الطلب المرتبط (اختياري)', type: 'select', value: s.soId, options: [['', '— بدون طلب محدد —']].concat(orders.map((o) => [o.id, o.id + ' · ' + ERP.fmt.date(o.createdAt) + ' · ' + ((SA.catalog.status.so[o.status] || [o.status])[0])])), onChange: (v) => { s.soId = v; s.itemId = ''; redraw(); } });
    const itF = SA.form.field({ name: 'item', label: 'المنتج (اختياري)', type: 'select', value: s.itemId, options: [['', so ? '— كل بنود الطلب —' : '— اختر المنتج —']].concat(itemOpts), onChange: (v) => { s.itemId = v; } });
    const tiF = SA.form.field({ name: 'title', label: 'الموضوع', required: true, value: s.title, placeholder: s.kind === 'complaint' ? 'مثال: خدش في سطح 2 باب بعد الاستلام' : 'اكتب موضوع طلبك باختصار', rules: [SA.form.rules.min(5)], onInput: (v) => { s.title = v; } });
    const deF = SA.form.field({ name: 'desc', label: 'التفاصيل', type: 'textarea', rows: 4, required: true, value: s.desc, placeholder: 'اوصف المشكلة أو السؤال: الكمية المتأثرة، مكان التركيب، أي أرقام لوت مكتوبة على الكرتونة…', rules: [SA.form.rules.min(10)], onInput: (v) => { s.desc = v; } });
    const prF = SA.form.field({ name: 'priority', label: 'الأولوية', type: 'select', value: s.priority, options: [['normal', 'عادي'], ['high', 'عاجل — يؤثر على تركيب أو عميل']], onChange: (v) => { s.priority = v; } });
    const g = SA.form.group([tiF, deF]);
    async function send() {
      if (!g.validate()) { SA.toast('اكتب الموضوع والتفاصيل عشان فريق خدمة العملاء يقدر يساعدك', 'warn'); return; }
      let tk = null;
      try {
        await SA.api(() => {
          const kind = s.kind; const itemId = s.itemId || null;
          tk = { id: ERP.no('TKT'), kind, customerId: cid(), soId: s.soId || null, itemId, title: String(s.title).trim(), priority: s.priority === 'high' ? 'high' : kind === 'inquiry' ? 'low' : 'normal', status: 'open', channel: 'بوابة التاجر', assigneeId: null, openedAt: ERP.now(), slaHours: SLA[kind] || 48, warranty: kind === 'warranty' || (kind === 'complaint' && !!itemId), notes: [], description: String(s.desc).trim(), attachments: s.files.slice(), openedBy: SA.session.userId || null };
          st.insert('tickets', tk, true);
          SA.audit('PORTAL.SUPPORT_REQUEST', { target: { type: 'ticket', id: tk.id, label: ERP.customerName(cid()) }, after: { kind, soId: tk.soId, itemId, priority: tk.priority }, via: 'web' });
          SA.notify({ title: KIND[kind] + ' جديدة من بوابة التاجر: ' + tk.id, body: ERP.customerName(cid()) + ' — ' + tk.title, level: 'action', to: ['R-19'], link: '#/care/tickets/' + tk.id });
          notifyDealer({ title: 'تم استلام طلب الدعم ' + tk.id, body: 'فريق خدمة العملاء هيتواصل معاك خلال ' + tk.slaHours + ' ساعة (هدف تجريبي).', link: '#/portal/support' });
        });
      } catch (e) { return SA.fail(e); }
      Object.assign(s, { kind: 'complaint', soId: '', itemId: '', title: '', desc: '', priority: 'normal', files: [], last: tk.id });
      SA.toast('تم إرسال ' + KIND[tk.kind] + ' ' + tk.id + ' لخدمة العملاء', 'success');
      redraw();
    }
    const files = s.files.length ? h('ul.ptl-files', {}, s.files.map((x, i) => h('li', {}, SA.icon('file', 'icon-sm'), h('span.num', {}, x), h('button.sap-linkbtn', { type: 'button', onclick: () => { s.files.splice(i, 1); redraw(); } }, 'إزالة')))) : null;
    const form = SA.card({ title: 'طلب دعم جديد' }, kinds, h('div.ptl-2', {}, soF.el, itF.el), tiF.el, deF.el, prF.el,
      h('div', {}, h('button.ptl-drop', { type: 'button', onclick: () => { s.files.push('صورة-' + (s.files.length + 1) + '.jpg'); redraw(); } }, SA.icon('upload'), h('b', {}, 'إرفاق صور للمشكلة'), h('small', {}, 'تجريبي — النموذج لا يرفع ملفات فعلية')), files),
      h('div', {}, SA.btn({ label: 'أرسل لخدمة العملاء', icon: 'send', kind: 'accent', size: 'lg', perm: 'portal.support.create', attrs: { 'data-act': 'submit-ticket' }, onClick: send })));
    const side = SA.card({ title: 'هنرد عليك إمتى؟', tags: [ERP.ui.demo('أهداف تجريبية')] },
      h('div.ptl-sla', {}, Object.keys(KIND).map((k) => h('div', {}, h('span', {}, KIND[k]), h('b.num', {}, 'خلال ' + SLA[k] + ' ساعة')))),
      h('div.ptl-subh', {}, 'عشان نحل أسرع'), h('ul.ptl-tips', {}, h('li', {}, 'اختار الطلب المرتبط عشان نعرف اللوت وتاريخ التسليم.'), h('li', {}, 'صوّر العيب من قريب ومن بعيد، وصورة لملصق الكرتونة.'), h('li', {}, 'للحالات العاجلة جدًا: الخط الساخن 15536.')));
    const rows = myTickets().slice().sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt))).map((t) => ({ id: t.id, t }));
    const table = SA.table({
      caption: 'طلبات الدعم', rows, pageSize: 8,
      search: { placeholder: 'ابحث برقم التذكرة أو الموضوع…', keys: ['id', (r) => r.t.title, (r) => r.t.soId] },
      filters: [{ key: 'st', label: 'الحالة', options: [['open', 'مفتوحة'], ['done', 'تم الحل/مغلقة']], test: (r, v) => (v === 'done' ? ['resolved', 'closed'].indexOf(r.t.status) >= 0 : ['resolved', 'closed'].indexOf(r.t.status) < 0) }],
      columns: [
        { key: 'id', label: 'رقم التذكرة', render: (r) => h('b.num', {}, r.id) },
        { key: 'title', label: 'الموضوع', render: (r) => h('span.ptl-cell', {}, h('b', {}, r.t.title), h('small', {}, KIND[r.t.kind] || r.t.kind)) },
        { key: 'so', label: 'الطلب', render: (r) => (r.t.soId ? plink(r.t.soId) : '—') },
        { key: 'pr', label: 'الأولوية', render: (r) => (r.t.priority === 'high' ? SA.chip('عاجل', 'warning') : r.t.priority === 'low' ? SA.chip('منخفضة', 'neutral') : SA.chip('عادي', 'info')) },
        { key: 'status', label: 'الحالة', render: (r) => ERP.ui.status('ticket', r.t.status) },
        { key: 'opened', label: 'تاريخ الفتح', render: (r) => SA.fmt.rel(r.t.openedAt) }
      ],
      onRowClick: (r) => openTicket(r.t),
      empty: { icon: 'headset', title: 'لا توجد طلبات دعم', text: 'لو عندك أي مشكلة أو سؤال ابعته من النموذج اللي فوق.' }
    });
    return page(
      SA.pageHead({ title: 'الدعم والشكاوى', desc: 'ابعت شكوى أو استفسار أو طلب تركيب — بيوصل لفريق خدمة العملاء مباشرة وتتابع حالته من هنا.' }),
      s.last ? SA.alert('success', h('span', {}, 'تم استلام طلبك ', h('b.num', {}, s.last), ' — فريق خدمة العملاء هيتواصل معاك قريبًا وهتلاقي حالته في القائمة تحت.')) : null,
      h('div.ptl-support', {}, form, side),
      SA.card({ title: 'طلباتك السابقة', flush: true }, table.el));
  }
  function openTicket(t) {
    const steps = [['تم الاستلام', t.openedAt, true], ['قيد المعالجة', null, ['assigned', 'in_progress', 'waiting_customer', 'resolved', 'closed'].indexOf(t.status) >= 0], ['تم الحل', t.resolvedAt, ['resolved', 'closed'].indexOf(t.status) >= 0]];
    const nowI = steps.findIndex((x) => !x[2]);
    SA.drawer({ title: t.id, subtitle: t.title, size: 'md', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('div', {}, ERP.ui.status('ticket', t.status)),
      SA.kv([['النوع', KIND[t.kind] || t.kind], ['الموضوع', t.title], t.description ? ['التفاصيل', t.description] : null, ['الطلب', t.soId ? plink(t.soId) : '—'], ['المنتج', t.itemId ? ERP.ui.itemCell(t.itemId) : '—'], ['القناة', t.channel || '—'], ['تاريخ الفتح', SA.fmt.dt(t.openedAt)], ['الاستجابة المستهدفة', h('span', {}, 'خلال ' + (t.slaHours || 48) + ' ساعة ', ERP.ui.demo('تجريبي'))], t.attachments && t.attachments.length ? ['المرفقات', t.attachments.join('، ')] : null, t.status === 'waiting_customer' ? ['مطلوب منك', 'فريق خدمة العملاء بانتظار رد أو صور منك'] : null]),
      h('ul.timeline', {}, steps.map((x, i) => h('li', { class: x[2] ? 'is-done' : i === nowI ? 'is-now' : null }, h('div', {}, x[0]), h('time', {}, x[1] ? SA.fmt.rel(x[1]) : '—'))))) });
  }

  /* ───────────────────────── global search + Test Lab missions ───────────────────────── */
  if (SA.search && SA.search.register) SA.search.register({ id: 'portal-catalog', label: 'كتالوج البوابة', perm: 'portal.catalog.view', query: (q) => (q ? products().filter((p) => has(p.name, q) || has(p.model, q) || p.skus.some((s) => has(s.code, q))).map((p) => ({ title: p.name, sub: FAM_LABEL[p.family] + ' · سعر التاجر من ' + money(Math.min.apply(null, p.skus.map((s) => priceOf(s.id)))), icon: 'grid', route: 'portal/catalog?q=' + encodeURIComponent(p.model) })) : []) });
  if (SA.missions && SA.missions.add) {
    SA.missions.add({ id: 'M-P1', area: 'dealers', title: 'كتاجر: اطلب من البوابة وشاهد الفاتورة المبدئية تتكوّن', persona: 'dealer', route: 'portal/catalog', est: '3 د', goal: 'ادخل كتاجر (معرض النيل): أضف منتجين من الكتالوج بأسعارك، راجع الفاتورة المبدئية وأكّد رقم الهاتف ثم أرسل. الطلب يدخل المبيعات «قيد المراجعة» بدون تأكيد تلقائي (بند 48).',
      steps: [{ text: 'افتح الكتالوج واختر مقاس ولون باب', route: 'portal-catalog' }, { text: 'راجع الفاتورة المبدئية في «طلب جديد»', route: 'portal-order' }, { text: 'أرسل الطلب للمبيعات', audit: 'PORTAL.ORDER_SUBMITTED' }], detect: [{ audit: 'PORTAL.ORDER_SUBMITTED' }] });
    SA.missions.add({ id: 'M-P2', area: 'dealers', title: 'كتاجر: ابعت شكوى من البوابة لخدمة العملاء', persona: 'dealer', route: 'portal/support', est: '2 د', goal: 'من «الدعم والشكاوى» اختار طلبًا سابقًا ومنتجًا واكتب المشكلة. التذكرة تظهر لخدمة العملاء فورًا.',
      steps: [{ text: 'افتح الدعم والشكاوى', route: 'portal-support' }, { text: 'أرسل الشكوى', audit: 'PORTAL.SUPPORT_REQUEST' }], detect: [{ audit: 'PORTAL.SUPPORT_REQUEST' }] });
  }
})();
