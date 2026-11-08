/* EG ERP prototype — erp-core.js  (SHARED FOUNDATION for the ERP workspaces — owned by the lead; module agents READ, never edit)
   Loads AFTER core.js + ui.js and BEFORE seed.js / seed-erp.js / mod-*.js (see index.html).

   What it adds on top of the Super Admin + HR prototype (docs/super-admin/prototype-guide.md — same SA.* API):
   1. Catalog: 8 new apps (المساحات) + nav groups + permission keys `<app>.<res>.<action>` + approval types + audit codes + statuses + personas.
   2. window.ERP helpers: lookups, numbering, stock ledger, general ledger, the cross-module business FLOW (order → WO → QC → stock → delivery → invoice → receipt,
      PO → GRN → incoming QC → stock → bill → voucher), approval reconcile hooks, seed hooks, charts and shared UI bits.
   ROUTE CONTRACT (module ids/routes every agent must use — ERP.route(docId) links to them):
     exec : exec-dashboard exec/dashboard · exec-ai exec/ai · exec-insights exec/insights · exec-reports exec/reports
     crm  : crm-dashboard crm/dashboard · crm-leads crm/leads[/LD-id] · crm-pipeline crm/pipeline · crm-activities crm/activities · crm-quotes crm/quotes[/QT-id|/new]
            crm-orders crm/orders[/SO-id|/new] · crm-dealer-orders crm/dealer-orders · crm-customers crm/customers[/C-id] · crm-targets crm/targets · crm-reports crm/reports
     mfg  : mfg-dashboard mfg/dashboard · mfg-planning mfg/planning · mfg-mrp mfg/mrp · mfg-workorders mfg/workorders[/WO-id] · mfg-shopfloor mfg/shopfloor · mfg-bom mfg/bom[/BOM-id]
            mfg-lines mfg/lines[/L-id] · mfg-quality mfg/quality · mfg-qc mfg/qc[/QC-id] · mfg-ncr mfg/ncr[/NCR-id] · mfg-capa mfg/capa · mfg-certs mfg/certs
     scm  : scm-dashboard scm/dashboard · scm-requisitions scm/requisitions · scm-rfq scm/rfq · scm-po scm/po[/PS-id] · scm-suppliers scm/suppliers · scm-grn scm/grn[/GRN-id]
            scm-stock scm/stock[/IT-id] · scm-moves scm/moves · scm-transfers scm/transfers · scm-counts scm/counts
            scm-deliveries scm/deliveries[/DN-id] · scm-dispatch scm/dispatch · scm-shipments scm/shipments[/SH-id] · scm-fleet scm/fleet
     fin  : fin-dashboard fin/dashboard · fin-invoices fin/invoices[/INV-id] · fin-receipts fin/receipts · fin-cheques fin/cheques · fin-aging fin/aging · fin-bills fin/bills
            fin-vouchers fin/vouchers[/PV-id] · fin-banks fin/banks · fin-journal fin/journal[/JE-id] · fin-coa fin/coa · fin-costing fin/costing · fin-budgets fin/budgets · fin-statements fin/statements
     care : care-dashboard care/dashboard · care-tickets care/tickets[/TKT-id] · care-warranty care/warranty · care-visits care/visits · care-assets care/assets[/M-id]
            care-maintenance care/maintenance[/MWO-id] · care-pm care/pm · care-spares care/spares · care-it care/it[/ITK-id]
     expo : expo-events expo/events[/EV-id] · expo-calendar expo/calendar · expo-capture expo/capture · expo-roi expo/roi
     portal: portal-catalog portal/catalog · portal-order portal/order · portal-orders portal/orders[/SO-id] · portal-invoices portal/invoices · portal-statement portal/statement · portal-support portal/support
*/
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, C = SA.catalog;
  const ERP = (window.ERP = {});

  /* ═════════════════════════ 1. CATALOG ═════════════════════════ */
  const APPS = [
    { id: 'exec', title: 'لوحة القيادة', icon: 'gauge', short: 'القيادة', home: 'exec-dashboard', moduleKey: 'exec' },
    { id: 'crm', title: 'المبيعات وCRM', icon: 'cart', short: 'المبيعات', home: 'crm-dashboard', moduleKey: 'sales' },
    { id: 'mfg', title: 'التصنيع والجودة', icon: 'factory', short: 'التصنيع', home: 'mfg-dashboard', moduleKey: 'manufacturing' },
    { id: 'scm', title: 'المشتريات والمخازن والشحن', icon: 'warehouse', short: 'الإمداد', home: 'scm-dashboard', moduleKey: 'inventory' },
    { id: 'fin', title: 'المالية والحسابات', icon: 'coins', short: 'المالية', home: 'fin-dashboard', moduleKey: 'finance' },
    { id: 'care', title: 'الدعم والصيانة', icon: 'wrench', short: 'الصيانة', home: 'care-dashboard', moduleKey: 'care' },
    { id: 'expo', title: 'المعارض والفعاليات', icon: 'calendar', short: 'المعارض', home: 'expo-events', moduleKey: 'expo' }
  ];
  C.apps.splice(0, 0, ...APPS);
  C.apps.push({ id: 'portal', title: 'بوابة التاجر', icon: 'globe', short: 'بوابة التاجر', home: 'portal-catalog', moduleKey: 'portal' });

  const G = (list) => list.map((g, i) => ({ id: g[0], title: g[1], order: i + 1 }));
  Object.assign(C.appGroups, {
    exec: G([['exec-main', 'لوحة القيادة'], ['exec-ai', 'الذكاء الاصطناعي'], ['exec-rep', 'التقارير']]),
    crm: G([['crm-dash', 'نظرة عامة'], ['crm-pipe', 'العملاء المحتملون والفرص'], ['crm-sales', 'عروض الأسعار والطلبات'], ['crm-cust', 'العملاء والتجار'], ['crm-perf', 'الأهداف والتقارير']]),
    mfg: G([['mfg-dash', 'نظرة عامة'], ['mfg-plan', 'التخطيط'], ['mfg-exec', 'التنفيذ'], ['mfg-eng', 'الهندسة والخطوط'], ['mfg-qa', 'الجودة']]),
    scm: G([['scm-dash', 'نظرة عامة'], ['scm-buy', 'المشتريات'], ['scm-inv', 'المخازن'], ['scm-log', 'التسليم والشحن']]),
    fin: G([['fin-dash', 'نظرة عامة'], ['fin-ar', 'المبيعات والتحصيل'], ['fin-ap', 'المشتريات والمدفوعات'], ['fin-cash', 'البنوك والخزائن'], ['fin-gl', 'الحسابات العامة'], ['fin-cost', 'التكاليف والموازنات'], ['fin-rep', 'القوائم المالية']]),
    care: G([['care-dash', 'نظرة عامة'], ['care-cs', 'خدمة ما بعد البيع'], ['care-mnt', 'صيانة المصنع'], ['care-it', 'الدعم الفني IT']]),
    expo: G([['expo-main', 'المعارض والفعاليات']]),
    portal: G([['portal-main', 'البوابة']])
  });

  const A = { v: ['view', 'عرض'], c: ['create', 'إنشاء'], e: ['edit', 'تعديل'], a: ['approve', 'اعتماد'], x: ['export', 'تصدير'], u: ['use', 'استخدام'] };
  const acts = (s) => s.split(',').map((k) => (A[k] ? A[k] : k.split(':')));
  const ep = (app, res, label, group, actions) => ({ app, res, label, group, actions: acts(actions), tag: 'new' });
  C.perms.push(
    ep('exec', 'dashboard', 'لوحة القيادة التنفيذية', 'exec-main', 'v'), ep('exec', 'ai', 'المساعد الذكي (اسأل نظامك)', 'exec-ai', 'u'), ep('exec', 'insights', 'التنبؤات والتنبيهات الذكية', 'exec-ai', 'v'), ep('exec', 'reports', 'تقارير الإدارة', 'exec-rep', 'v,x'),
    ep('crm', 'dashboard', 'لوحة المبيعات', 'crm-dash', 'v'), ep('crm', 'leads', 'العملاء المحتملون', 'crm-pipe', 'v,c,e'), ep('crm', 'pipeline', 'مسار الفرص', 'crm-pipe', 'v'), ep('crm', 'activities', 'المكالمات والزيارات', 'crm-pipe', 'v,c'),
    ep('crm', 'quotes', 'عروض الأسعار', 'crm-sales', 'v,c,e,a'), ep('crm', 'orders', 'أوامر البيع', 'crm-sales', 'v,c,e,confirm:تأكيد'), ep('crm', 'dealer_orders', 'طلبات التجار (البوابة)', 'crm-sales', 'v,review:مراجعة واتصال'),
    ep('crm', 'customers', 'العملاء والتجار (360°)', 'crm-cust', 'v,e'), ep('crm', 'targets', 'أهداف المبيعات', 'crm-perf', 'v,e'), ep('crm', 'reports', 'تقارير المبيعات', 'crm-perf', 'v,x'),
    ep('mfg', 'dashboard', 'لوحة التصنيع', 'mfg-dash', 'v'), ep('mfg', 'planning', 'خطة الإنتاج والطاقة', 'mfg-plan', 'v,e'), ep('mfg', 'mrp', 'تخطيط احتياجات المواد (MRP)', 'mfg-plan', 'v,run:تشغيل'),
    ep('mfg', 'workorders', 'أوامر التشغيل', 'mfg-exec', 'v,c,e,release:إطلاق'), ep('mfg', 'shopfloor', 'أرضية المصنع (لحظي)', 'mfg-exec', 'v,report:تسجيل إنتاج'),
    ep('mfg', 'bom', 'مكونات المنتج (BOM) والتركيبات', 'mfg-eng', 'v,e'), ep('mfg', 'lines', 'خطوط الإنتاج والطاقات', 'mfg-eng', 'v,e'),
    ep('mfg', 'quality', 'لوحة الجودة', 'mfg-qa', 'v'), ep('mfg', 'qc', 'فحوصات الجودة', 'mfg-qa', 'v,inspect:تسجيل فحص'), ep('mfg', 'ncr', 'عدم المطابقة (NCR)', 'mfg-qa', 'v,c,a'), ep('mfg', 'capa', 'الإجراءات التصحيحية (CAPA)', 'mfg-qa', 'v,e'), ep('mfg', 'certs', 'الشهادات والمعايير (ISO)', 'mfg-qa', 'v,e'),
    ep('scm', 'dashboard', 'لوحة الإمداد', 'scm-dash', 'v'), ep('scm', 'requisitions', 'طلبات الشراء الداخلية', 'scm-buy', 'v,c,a'), ep('scm', 'rfq', 'طلبات عروض الأسعار من الموردين', 'scm-buy', 'v,c'), ep('scm', 'po', 'أوامر الشراء', 'scm-buy', 'v,c,a'), ep('scm', 'suppliers', 'تقييم الموردين', 'scm-buy', 'v,e'),
    ep('scm', 'grn', 'استلام البضاعة (GRN)', 'scm-inv', 'v,c'), ep('scm', 'stock', 'أرصدة المخزون وكارت الصنف', 'scm-inv', 'v,adjust:تسوية,x'), ep('scm', 'moves', 'حركات المخزون', 'scm-inv', 'v'), ep('scm', 'transfers', 'التحويلات بين المخازن', 'scm-inv', 'v,c'), ep('scm', 'counts', 'الجرد', 'scm-inv', 'v,c,a'),
    ep('scm', 'deliveries', 'أذون التسليم', 'scm-log', 'v,c,dispatch:إخراج وتسليم'), ep('scm', 'dispatch', 'تخطيط التحميل والرحلات', 'scm-log', 'v,e'), ep('scm', 'shipments', 'الشحنات والتصدير', 'scm-log', 'v,c,e'), ep('scm', 'fleet', 'الأسطول والسائقين', 'scm-log', 'v,e'),
    ep('fin', 'dashboard', 'لوحة المالية', 'fin-dash', 'v'), ep('fin', 'invoices', 'فواتير البيع', 'fin-ar', 'v,c,e'), ep('fin', 'receipts', 'سندات القبض', 'fin-ar', 'v,c'), ep('fin', 'cheques', 'الشيكات', 'fin-ar', 'v,e'), ep('fin', 'aging', 'أعمار الديون', 'fin-ar', 'v'),
    ep('fin', 'bills', 'فواتير الموردين', 'fin-ap', 'v,c'), ep('fin', 'vouchers', 'سندات الصرف', 'fin-ap', 'v'), ep('fin', 'banks', 'البنوك والخزائن', 'fin-cash', 'v,e'),
    ep('fin', 'journal', 'القيود اليومية', 'fin-gl', 'v,post:ترحيل قيد'), ep('fin', 'coa', 'دليل الحسابات', 'fin-gl', 'v,e'), ep('fin', 'costing', 'تكاليف المنتجات', 'fin-cost', 'v'), ep('fin', 'budgets', 'الموازنات', 'fin-cost', 'v,e'), ep('fin', 'statements', 'القوائم المالية', 'fin-rep', 'v,x'),
    ep('care', 'dashboard', 'لوحة الدعم والصيانة', 'care-dash', 'v'), ep('care', 'tickets', 'شكاوى وطلبات العملاء', 'care-cs', 'v,c,e,close:إغلاق'), ep('care', 'warranty', 'مطالبات الضمان', 'care-cs', 'v,a'), ep('care', 'visits', 'زيارات التركيب والمعاينة', 'care-cs', 'v,c,e'),
    ep('care', 'assets', 'سجل الماكينات والأصول', 'care-mnt', 'v,e'), ep('care', 'maintenance', 'أوامر الصيانة والأعطال', 'care-mnt', 'v,c,e,close:إغلاق'), ep('care', 'pm', 'الصيانة الوقائية', 'care-mnt', 'v,e'), ep('care', 'spares', 'قطع الغيار', 'care-mnt', 'v,e'),
    ep('care', 'it', 'تذاكر الدعم الفني IT', 'care-it', 'v,c,e'),
    ep('expo', 'events', 'المعارض والفعاليات', 'expo-main', 'v,c,e,a'), ep('expo', 'calendar', 'تقويم المعارض', 'expo-main', 'v'), ep('expo', 'leads', 'تسجيل زوار الجناح', 'expo-main', 'capture:تسجيل'), ep('expo', 'roi', 'العائد من المعارض', 'expo-main', 'v'),
    ep('portal', 'catalog', 'الكتالوج وأسعاري', 'portal-main', 'v'), ep('portal', 'orders', 'طلباتي', 'portal-main', 'v,c'), ep('portal', 'invoices', 'فواتيري', 'portal-main', 'v'), ep('portal', 'statement', 'كشف الحساب', 'portal-main', 'v'), ep('portal', 'support', 'الدعم والشكاوى', 'portal-main', 'c')
  );
  C.rebuildPermKeys();
  C.erpKeys = (app) => C.permKeys.filter((k) => k.indexOf(app + '.') === 0);

  /* business resources in the role matrix (docs only — gating uses keys). Quality is unlocked for the demo (بند 34 still Pending). */
  C.resources.forEach((r) => { if (r.id === 'quality') { delete r.locked; r.sub = 'الفحوص وعدم المطابقة (مفعّل في الديمو — بند 34 Pending)'; } });
  C.resources.push(
    { id: 'logistics', label: 'التسليم والشحن', sub: 'أذون التسليم والشحنات', group: 'التصنيع والمشتريات', moduleKey: 'logistics', scoped: true },
    { id: 'maintenance', label: 'الصيانة', sub: 'الماكينات وأوامر الصيانة', group: 'الجودة', moduleKey: 'care', scoped: false },
    { id: 'support', label: 'خدمة العملاء', sub: 'الشكاوى والضمان', group: 'المبيعات والعملاء', moduleKey: 'care', scoped: true },
    { id: 'events', label: 'المعارض', sub: 'المعارض والفعاليات', group: 'المبيعات والعملاء', moduleKey: 'expo', scoped: false }
  );

  Object.assign(C.approvalTypes, {
    sales_order: { label: 'أمر بيع (خصم/قيمة)', area: 'crm', icon: 'cart' }, quotation: { label: 'عرض سعر بخصم', area: 'crm', icon: 'receipt' },
    purchase_order: { label: 'أمر شراء', area: 'scm', icon: 'truck' }, stock_adjustment: { label: 'تسوية مخزون', area: 'scm', icon: 'box' },
    ncr_disposition: { label: 'قرار عدم مطابقة', area: 'mfg', icon: 'alert' }, maintenance_spend: { label: 'صرف صيانة', area: 'care', icon: 'wrench' },
    warranty_claim: { label: 'مطالبة ضمان', area: 'care', icon: 'shield' }, event_budget: { label: 'ميزانية معرض', area: 'expo', icon: 'calendar' },
    credit_note: { label: 'إشعار دائن', area: 'fin', icon: 'receipt' }, voucher: { label: 'سند صرف', area: 'fin', icon: 'coins' }
  });

  const AUD = {
    crm: [['LEAD.CREATED', 'عميل محتمل جديد', 'info'], ['LEAD.STAGE_CHANGED', 'تغيير مرحلة فرصة', 'info'], ['LEAD.CONVERTED', 'تحويل عميل محتمل لعميل', 'medium'], ['LEAD.LOST', 'خسارة فرصة', 'info'],
      ['QUOTE.CREATED', 'إنشاء عرض سعر', 'info'], ['QUOTE.SENT', 'إرسال عرض سعر', 'info'], ['QUOTE.ACCEPTED', 'قبول عرض سعر', 'medium'], ['SO.CREATED', 'إنشاء أمر بيع', 'info'], ['SO.SUBMITTED', 'إرسال أمر بيع للمراجعة', 'info'],
      ['SO.CONFIRMED', 'تأكيد أمر بيع', 'high'], ['SO.REJECTED', 'رفض أمر بيع', 'medium'], ['SO.CANCELLED', 'إلغاء أمر بيع', 'high'], ['SO.CALL_LOGGED', 'تسجيل مكالمة تأكيد مع التاجر', 'info'], ['CUSTOMER.CREDIT_CHANGED', 'تغيير حد ائتمان عميل', 'high']],
    mfg: [['WO.CREATED', 'إنشاء أمر تشغيل', 'info'], ['WO.RELEASED', 'إطلاق أمر تشغيل وصرف خامات', 'medium'], ['WO.STARTED', 'بدء التشغيل', 'info'], ['WO.REPORTED', 'تسجيل إنتاج', 'info'], ['WO.COMPLETED', 'اكتمال أمر تشغيل', 'medium'], ['WO.HELD', 'إيقاف أمر تشغيل', 'medium'],
      ['BOM.UPDATED', 'تعديل مكونات منتج', 'high'], ['MRP.RUN', 'تشغيل MRP', 'info'], ['QC.RECORDED', 'تسجيل فحص جودة', 'info'], ['QC.PASSED', 'نتيجة فحص: مطابق', 'medium'], ['QC.FAILED', 'نتيجة فحص: غير مطابق', 'high'],
      ['NCR.OPENED', 'فتح عدم مطابقة', 'high'], ['NCR.DISPOSITIONED', 'قرار عدم مطابقة', 'high'], ['NCR.CLOSED', 'إغلاق عدم مطابقة', 'medium'], ['CAPA.OPENED', 'فتح إجراء تصحيحي', 'medium'], ['CAPA.CLOSED', 'إغلاق إجراء تصحيحي', 'medium'], ['LINE.STATUS_CHANGED', 'تغيير حالة خط إنتاج', 'medium']],
    scm: [['PRQ.CREATED', 'طلب شراء داخلي', 'info'], ['PRQ.APPROVED', 'اعتماد طلب شراء', 'medium'], ['PO.CREATED', 'إنشاء أمر شراء', 'info'], ['PO.SUBMITTED', 'إرسال أمر شراء للاعتماد', 'info'], ['PO.APPROVED', 'اعتماد أمر شراء', 'high'], ['PO.SENT', 'إرسال أمر شراء للمورد', 'info'],
      ['GRN.RECEIVED', 'استلام بضاعة', 'medium'], ['STOCK.MOVED', 'حركة مخزون', 'info'], ['STOCK.ADJUSTED', 'تسوية مخزون', 'high'], ['STOCK.TRANSFERRED', 'تحويل بين مخازن', 'medium'], ['COUNT.POSTED', 'ترحيل جرد', 'high'],
      ['DN.CREATED', 'إنشاء إذن تسليم', 'info'], ['DN.DISPATCHED', 'خروج شحنة من المصنع', 'medium'], ['DN.DELIVERED', 'تأكيد تسليم للعميل', 'medium'], ['SHIP.CREATED', 'إنشاء شحنة', 'info'], ['SHIP.UPDATED', 'تحديث حالة شحنة', 'info']],
    fin: [['INV.ISSUED', 'إصدار فاتورة بيع', 'high'], ['INV.CANCELLED', 'إلغاء فاتورة', 'critical'], ['RV.POSTED', 'سند قبض', 'high'], ['CHQ.STATUS_CHANGED', 'تغيير حالة شيك', 'medium'], ['BILL.RECORDED', 'تسجيل فاتورة مورد', 'medium'],
      ['PV.CREATED', 'إنشاء سند صرف', 'high'], ['PV.APPROVED', 'اعتماد سند صرف', 'high'], ['PV.EXECUTED', 'تنفيذ سند صرف', 'critical'], ['GL.POSTED', 'ترحيل قيد يومية', 'medium'], ['BUDGET.CHANGED', 'تعديل موازنة', 'high'], ['FIN.PERIOD_CLOSED', 'إقفال فترة مالية', 'critical']],
    care: [['TKT.OPENED', 'فتح شكوى/طلب عميل', 'info'], ['TKT.ASSIGNED', 'إسناد تذكرة', 'info'], ['TKT.RESOLVED', 'حل تذكرة', 'info'], ['TKT.CLOSED', 'إغلاق تذكرة', 'info'], ['WARRANTY.DECIDED', 'قرار مطالبة ضمان', 'high'],
      ['VISIT.SCHEDULED', 'جدولة زيارة', 'info'], ['VISIT.DONE', 'إتمام زيارة', 'info'], ['MNT.REQUESTED', 'بلاغ عطل/طلب صيانة', 'medium'], ['MNT.STARTED', 'بدء صيانة', 'info'], ['MNT.COMPLETED', 'إتمام صيانة', 'medium'], ['PM.SCHEDULED', 'جدولة صيانة وقائية', 'info'],
      ['SPARE.ISSUED', 'صرف قطعة غيار', 'medium'], ['IT.OPENED', 'تذكرة دعم فني', 'info'], ['IT.RESOLVED', 'حل تذكرة دعم فني', 'info']],
    expo: [['EVENT.CREATED', 'إنشاء معرض/فعالية', 'info'], ['EVENT.UPDATED', 'تعديل معرض', 'info'], ['EVENT.BUDGET_APPROVED', 'اعتماد ميزانية معرض', 'high'], ['EVENT.LEAD_CAPTURED', 'تسجيل زائر من الجناح', 'info']],
    exec: [['AI.QUERY', 'سؤال للمساعد الذكي', 'info'], ['AI.INSIGHT_ACTION', 'تنفيذ إجراء من توصية ذكية', 'medium']],
    portal: [['PORTAL.ORDER_SUBMITTED', 'طلب من بوابة التاجر', 'medium'], ['PORTAL.SUPPORT_REQUEST', 'شكوى من بوابة التاجر', 'info']]
  };
  const AUD_LABEL = { crm: 'المبيعات وCRM', mfg: 'التصنيع والجودة', scm: 'الإمداد والمخازن', fin: 'المالية', care: 'الدعم والصيانة', expo: 'المعارض', exec: 'الذكاء الاصطناعي', portal: 'بوابة التاجر' };
  const AREA_OF = {};
  Object.keys(AUD).forEach((cat) => {
    C.auditCategories.push({ id: cat, label: AUD_LABEL[cat] });
    AUD[cat].forEach((e) => { C.addAudit(e[0], e[1], e[2], cat); AREA_OF[e[0].split('.')[0]] = cat; });
  });
  C.auditAreaOf = (code) => AREA_OF[String(code).split('.')[0]] || null;

  const S = (o) => { const r = {}; Object.keys(o).forEach((k) => { r[k] = o[k]; }); return r; };
  Object.assign(C.status, {
    so: S({ draft: ['مسودة', 'neutral'], pending_review: ['قيد مراجعة المبيعات', 'warning'], pending_approval: ['بانتظار الاعتماد', 'warning'], confirmed: ['مؤكد', 'info'], in_production: ['قيد التصنيع', 'info'], ready: ['جاهز للتسليم', 'success'], partially_delivered: ['تسليم جزئي', 'info'], delivered: ['تم التسليم', 'success'], invoiced: ['مُفوتر', 'success'], closed: ['مغلق', 'neutral'], rejected: ['مرفوض', 'danger'], cancelled: ['ملغى', 'neutral'] }),
    quote: S({ draft: ['مسودة', 'neutral'], pending_approval: ['بانتظار اعتماد الخصم', 'warning'], sent: ['مُرسل للعميل', 'info'], accepted: ['مقبول', 'success'], rejected: ['مرفوض', 'danger'], expired: ['منتهي الصلاحية', 'neutral'] }),
    lead: S({ new: ['جديد', 'info'], contacted: ['تم التواصل', 'info'], qualified: ['مؤهل', 'warning'], proposal: ['عرض سعر', 'warning'], negotiation: ['تفاوض', 'warning'], won: ['مكسوب', 'success'], lost: ['خاسر', 'danger'] }),
    wo: S({ planned: ['مخطط', 'neutral'], released: ['مُطلق (صُرفت الخامات)', 'info'], in_progress: ['قيد التشغيل', 'info'], qc_pending: ['بانتظار الجودة', 'warning'], completed: ['مكتمل', 'success'], closed: ['مغلق', 'neutral'], on_hold: ['متوقف', 'danger'] }),
    qc: S({ pending: ['بانتظار الفحص', 'warning'], pass: ['مطابق', 'success'], conditional: ['مقبول بشرط', 'warning'], fail: ['غير مطابق', 'danger'] }),
    ncr: S({ open: ['مفتوح', 'danger'], investigating: ['قيد التحقيق', 'warning'], dispositioned: ['تم القرار', 'info'], closed: ['مغلق', 'success'] }),
    capa: S({ open: ['مفتوح', 'warning'], in_progress: ['قيد التنفيذ', 'info'], verifying: ['التحقق من الفعالية', 'info'], closed: ['مغلق', 'success'] }),
    prq: S({ open: ['مفتوح', 'warning'], approved: ['معتمد', 'info'], ordered: ['صدر أمر شراء', 'success'], rejected: ['مرفوض', 'danger'] }),
    po: S({ draft: ['مسودة', 'neutral'], pending_approval: ['بانتظار الاعتماد', 'warning'], approved: ['معتمد', 'info'], sent: ['أُرسل للمورد', 'info'], partially_received: ['استلام جزئي', 'warning'], received: ['تم الاستلام', 'success'], closed: ['مغلق', 'neutral'], rejected: ['مرفوض', 'danger'], cancelled: ['ملغى', 'neutral'] }),
    grn: S({ pending_qc: ['بانتظار فحص الجودة', 'warning'], accepted: ['مقبول', 'success'], partially_accepted: ['مقبول جزئيًا', 'warning'], rejected: ['مرفوض', 'danger'] }),
    dn: S({ planned: ['مخطط', 'neutral'], loading: ['قيد التحميل', 'info'], dispatched: ['خرج من المصنع', 'info'], in_transit: ['في الطريق', 'info'], delivered: ['تم التسليم', 'success'], returned: ['مرتجع', 'danger'] }),
    ship: S({ planning: ['قيد التخطيط', 'neutral'], booked: ['تم الحجز', 'info'], loading: ['قيد التحميل', 'info'], in_transit: ['في الطريق', 'info'], arrived: ['وصلت الميناء', 'info'], cleared: ['تم التخليص', 'success'], delivered: ['تم التسليم', 'success'] }),
    inv: S({ draft: ['مسودة', 'neutral'], issued: ['صادرة', 'info'], partial: ['مدفوعة جزئيًا', 'warning'], paid: ['مدفوعة', 'success'], overdue: ['متأخرة', 'danger'], cancelled: ['ملغاة', 'neutral'] }),
    bill: S({ open: ['مستحقة', 'warning'], partial: ['مدفوعة جزئيًا', 'warning'], paid: ['مدفوعة', 'success'], overdue: ['متأخرة', 'danger'] }),
    pv: S({ draft: ['مسودة', 'neutral'], pending_approval: ['بانتظار الاعتماد', 'warning'], approved: ['معتمد — بانتظار التنفيذ', 'info'], executed: ['مُنفّذ', 'success'], rejected: ['مرفوض', 'danger'] }),
    cheque: S({ received: ['مستلم', 'info'], under_collection: ['تحت التحصيل', 'warning'], collected: ['محصّل', 'success'], bounced: ['مرتد', 'danger'], cancelled: ['ملغى', 'neutral'] }),
    ticket: S({ open: ['مفتوحة', 'danger'], assigned: ['مُسندة', 'info'], in_progress: ['قيد المعالجة', 'info'], waiting_customer: ['بانتظار العميل', 'warning'], resolved: ['تم الحل', 'success'], closed: ['مغلقة', 'neutral'] }),
    mwo: S({ requested: ['بلاغ جديد', 'danger'], scheduled: ['مجدول', 'info'], in_progress: ['قيد التنفيذ', 'info'], waiting_parts: ['بانتظار قطع غيار', 'warning'], done: ['تم', 'success'], cancelled: ['ملغى', 'neutral'] }),
    line: S({ running: ['يعمل', 'success'], idle: ['بدون تشغيل', 'neutral'], setup: ['تجهيز/تغيير قالب', 'warning'], down: ['عطل — متوقف', 'danger'] }),
    machine: S({ running: ['يعمل', 'success'], idle: ['جاهز', 'neutral'], maintenance: ['صيانة', 'warning'], down: ['عطل', 'danger'] }),
    event: S({ planned: ['مخطط', 'neutral'], preparing: ['قيد التجهيز', 'info'], live: ['جارٍ الآن', 'success'], done: ['انتهى', 'neutral'], cancelled: ['ملغى', 'neutral'] })
  });

  Object.assign(C.personas, {
    prod: { label: 'Production Manager', desc: 'التخطيط وأوامر التشغيل وأرضية المصنع', icon: 'factory', area: 'mfg' },
    qc: { label: 'Quality Control', desc: 'الفحوص وعدم المطابقة والإجراءات التصحيحية', icon: 'checkcircle', area: 'mfg' },
    buyer: { label: 'Purchasing Officer', desc: 'طلبات وأوامر الشراء والموردين', icon: 'truck', area: 'scm' },
    logistics: { label: 'Logistics Manager', desc: 'أذون التسليم والرحلات والتصدير', icon: 'truck', area: 'scm' },
    cfo: { label: 'Finance Manager', desc: 'يعتمد سندات الصرف ويرى التكاليف والأرباح', icon: 'coins', area: 'fin' },
    maint: { label: 'Maintenance Manager', desc: 'الأعطال والصيانة الوقائية وقطع الغيار', icon: 'wrench', area: 'care' },
    cs: { label: 'Customer Service', desc: 'الشكاوى والضمان وزيارات التركيب', icon: 'headset', area: 'care' },
    marketing: { label: 'Marketing & Events', desc: 'المعارض وتسجيل الزوار والعائد', icon: 'calendar', area: 'expo' },
    dealer: { label: 'تاجر (بوابة التاجر)', desc: 'حساب خارجي: الكتالوج بأسعاره، الطلبات، الفواتير', icon: 'globe', area: 'portal', portal: true }
  });
  C.stepUp.push(['po.approve', 'اعتماد أمر شراء'], ['stock.adjust', 'تسوية مخزون'], ['invoice.cancel', 'إلغاء فاتورة']);

  /* extra icons (24px, stroke) */
  SA.icons.addMany({
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    chart: '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7"/><rect x="10.5" y="6" width="3" height="12"/><rect x="16" y="9" width="3" height="9"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.4A9 9 0 0 1 20.6 9H15z"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    headset: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    ship: '<path d="M3 16l2 5h14l2-5z"/><path d="M5 16V9h14v7M9 9V5h6v4"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V5M9 13v1M15 13v1M9 17h6"/><circle cx="12" cy="4" r="1"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    beaker: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/><path d="M7.5 15h9"/>'
  });

  /* ═════════════════════════ 2. HELPERS ═════════════════════════ */
  const st = SA.store;
  const get = (p) => st.get(p) || [];
  ERP.get = get;
  ERP.find = (coll, id) => (id ? st.find(coll, id) : null);
  ERP.now = () => new Date().toISOString();
  /** 'YYYY-MM-DD' for today + offset days (negative = past) */
  ERP.day = (offset) => { const d = new Date(Date.now() + (offset || 0) * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  ERP.daysBetween = (a, b) => Math.round((new Date(b || ERP.day(0)).getTime() - new Date(a).getTime()) / 86400000);
  ERP.months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  /** last n month keys 'YYYY-MM' oldest → newest (current month last) */
  ERP.monthKeys = (n) => { const out = []; const d = new Date(); for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0')); } return out; };
  ERP.monthLabel = (key) => { const p = String(key).split('-'); return ERP.months[Number(p[1]) - 1] + (p[0] ? ' ' + p[0].slice(2) : ''); };
  ERP.uom = { pcs: 'قطعة', door: 'باب', sheet: 'لوح', kg: 'كجم', m: 'متر', m2: 'م²', roll: 'رول', set: 'طقم', ton: 'طن' };
  ERP.fmt = {
    money: (n) => SA.fmt.money(n == null ? null : Math.round(n)),
    num: (n, d) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d })),
    qty: (n, u) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + (ERP.uom[u] || u || '')),
    pct: (n, d) => (n == null ? '—' : (Number(n) * 100).toFixed(d == null ? 0 : d) + '%'),
    /** compact money: 1.25 م ج.م / 340 ألف ج.م */
    short: (n) => { if (n == null) return '—'; const a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + ' م ج.م'; if (a >= 1e3) return Math.round(n / 1e3) + ' ألف ج.م'; return Math.round(n) + ' ج.م'; },
    date: (d) => (d ? SA.fmt.date(d.length === 10 ? d + 'T12:00:00' : d) : '—')
  };

  /* lookups */
  ERP.item = (id) => ERP.find('items', id);
  ERP.itemName = (id) => { const i = ERP.item(id); return i ? i.name : id || '—'; };
  ERP.customer = (id) => ERP.find('customers', id);
  ERP.customerName = (id) => { const c = ERP.customer(id); return c ? c.name : id || '—'; };
  ERP.supplier = (id) => ERP.find('suppliers', id);
  ERP.supplierName = (id) => { const c = ERP.supplier(id); return c ? c.name : id || '—'; };
  ERP.line = (id) => ERP.find('lines', id);
  ERP.machine = (id) => ERP.find('machines', id);
  ERP.wh = (id) => ERP.find('warehouses', id);
  ERP.whName = (id) => { const w = ERP.wh(id); return w ? w.name : id || '—'; };
  ERP.finish = (code) => (ERP.finishes.find((f) => f.code === code) || null);
  /** 11 catalogue finishes (codes from the official catalogue; Arabic names/hex are demo approximations for swatches) */
  ERP.finishes = [['C132', 'جوز داكن', '#5b3a29'], ['C160', 'بلوط فاتح', '#b08a5a'], ['C021', 'أبيض ثلجي', '#f1efe9'], ['C198', 'رمادي فحمي', '#4a4a4c'], ['C182', 'ماهوجني', '#6e2f22'], ['C115', 'زان طبيعي', '#c49a6c'],
    ['C091', 'كريمي', '#e6d9bd'], ['C173', 'ونجي', '#3b2a20'], ['C102', 'ساج', '#8a5a35'], ['C3003', 'أحمر نبيتي', '#7b1e22'], ['C8001', 'بني سادة', '#6b4a2f']].map((f) => ({ code: f[0], name: f[1], hex: f[2] }));
  ERP.families = { door: 'أبواب WPC & PVC', clad: 'تجاليد WPC', foam: 'ألواح PVC فوم بورد', acc: 'إكسسوارات', rm: 'مواد خام', pkg: 'تغليف', spare: 'قطع غيار' };

  /** Document id → route + label (cross-module links). */
  const DOC = [['MIR-', 'scm/issues/', 'إذن صرف خامات'], ['FGR-', 'scm/fg-receipts?q=', 'استلام إنتاج تام'], ['SCR-', 'mfg/scrap?q=', 'تسجيل هالك'], ['SS-', 'mfg/scrap?q=', 'بيع هوالك'], ['RG-', 'mfg/scrap?q=', 'طحن هوالك'], ['MX-', 'mfg/formulas/', 'خلطة'], ['SO-', 'crm/orders/', 'أمر بيع'], ['QT-', 'crm/quotes/', 'عرض سعر'], ['LD-', 'crm/leads/', 'عميل محتمل'], ['WO-', 'mfg/workorders/', 'أمر تشغيل'], ['QC-', 'mfg/qc/', 'فحص جودة'], ['NCR-', 'mfg/ncr/', 'عدم مطابقة'], ['BOM-', 'mfg/bom/', 'مكونات منتج'],
    ['PRQ-', 'scm/requisitions?q=', 'طلب شراء'], ['PS-', 'scm/po/', 'أمر شراء'], ['GRN-', 'scm/grn/', 'استلام'], ['DN-', 'scm/deliveries/', 'إذن تسليم'], ['SH-', 'scm/shipments/', 'شحنة'], ['IT-', 'scm/stock/', 'صنف'],
    ['INV-', 'fin/invoices/', 'فاتورة'], ['RV-', 'fin/receipts?q=', 'سند قبض'], ['PV-', 'fin/vouchers/', 'سند صرف'], ['BILL-', 'fin/bills?q=', 'فاتورة مورد'], ['JE-', 'fin/journal/', 'قيد'], ['CHQ-', 'fin/cheques?q=', 'شيك'],
    ['TKT-', 'care/tickets/', 'تذكرة'], ['MWO-', 'care/maintenance/', 'أمر صيانة'], ['ITK-', 'care/it/', 'تذكرة IT'], ['M-', 'care/assets/', 'ماكينة'], ['EV-', 'expo/events/', 'معرض'], ['L-', 'mfg/lines/', 'خط إنتاج'], ['C-', 'crm/customers/', 'عميل'], ['AP-', 'approvals/', 'طلب اعتماد']];
  ERP.docType = (id) => { const d = DOC.find((x) => String(id || '').indexOf(x[0]) === 0); return d ? d[2] : ''; };
  ERP.route = (id) => { const d = DOC.find((x) => String(id || '').indexOf(x[0]) === 0); return d ? d[1] + encodeURIComponent(id) : ''; };

  /** numbering: ERP.no('SO') → 'SO-2026-0489' (sequence per prefix, never reused; mirrors settings.numbering issued/last when the prefix exists there) */
  ERP.no = function (prefix, pad) {
    const seq = Object.assign({}, st.get('meta.erpSeq') || {}); const n = (seq[prefix] || 0) + 1; seq[prefix] = n; st.set('meta.erpSeq', seq);
    st.update('settings.numbering', (l) => { if (!Array.isArray(l)) return; const r = l.find((x) => x.prefix === prefix); if (r) { r.issued = (r.issued || 0) + 1; r.last = n; r.locked = true; } });
    return prefix + '-' + new Date().getFullYear() + '-' + String(n).padStart(pad || 4, '0');
  };

  /* ── stock ledger: stock[] = balances {id, itemId, whId, qty, reserved} · stockMoves[] newest first {id, ts, itemId, whId, qty(+/-), type, ref:{type,id}, note, by, lot, balance} ── */
  const K = (ERP.stock = {});
  K.FG = 'W-01'; K.RM = 'W-02'; K.WIP = 'W-03'; K.SPARES = 'W-05'; K.QRT = 'W-06';
  K.row = (itemId, whId) => get('stock').find((r) => r.itemId === itemId && r.whId === whId) || null;
  K.qty = (itemId, whId) => get('stock').filter((r) => r.itemId === itemId && (!whId || r.whId === whId) && (whId || r.whId !== K.QRT)).reduce((s, r) => s + r.qty, 0);
  K.reserved = (itemId, whId) => get('stock').filter((r) => r.itemId === itemId && (!whId || r.whId === whId)).reduce((s, r) => s + (r.reserved || 0), 0);
  K.available = (itemId, whId) => Math.max(0, K.qty(itemId, whId) - K.reserved(itemId, whId));
  K.defaultWh = (item) => { item = typeof item === 'string' ? ERP.item(item) : item; if (!item) return K.FG; return item.kind === 'fg' || item.kind === 'acc' ? K.FG : item.kind === 'spare' ? K.SPARES : K.RM; };
  /** move({itemId, whId, qty: +in / -out, type:'receipt|issue|production|delivery|transfer|adjust|scrap|return|opening', ref:{type,id}, note, lot}) → move record */
  K.move = function (o) {
    const by = SA.session.userId || 'SYSTEM'; let bal = 0;
    st.update('stock', (l) => { let r = l.find((x) => x.itemId === o.itemId && x.whId === o.whId); if (!r) { r = { id: 'SB-' + o.itemId + '-' + o.whId, itemId: o.itemId, whId: o.whId, qty: 0, reserved: 0 }; l.push(r); } r.qty = Math.round((r.qty + o.qty) * 1000) / 1000; bal = r.qty; });
    const mv = { id: 'MV-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: ERP.now(), itemId: o.itemId, whId: o.whId, qty: o.qty, type: o.type || 'adjust', ref: o.ref || null, note: o.note || '', by, lot: o.lot || null, balance: bal };
    st.update('stockMoves', (l) => { l.unshift(mv); if (l.length > 1500) l.length = 1500; });
    return mv;
  };
  K.transfer = function (itemId, fromWh, toWh, qty, ref, note) { K.move({ itemId, whId: fromWh, qty: -qty, type: 'transfer', ref, note }); return K.move({ itemId, whId: toWh, qty, type: 'transfer', ref, note }); };
  K.reserve = function (itemId, qty, whId) { whId = whId || K.FG; st.update('stock', (l) => { const r = l.find((x) => x.itemId === itemId && x.whId === whId); if (r) r.reserved = Math.max(0, Math.min(r.qty, (r.reserved || 0) + qty)); }); };
  K.unreserve = function (itemId, qty, whId) { K.reserve(itemId, -qty, whId); };
  K.value = (whId) => get('stock').filter((r) => !whId || r.whId === whId).reduce((s, r) => { const it = ERP.item(r.itemId); return s + r.qty * ((it && it.stdCost) || 0); }, 0);
  /** items at/below reorder point (total on hand excl. quarantine) */
  K.low = () => get('items').filter((i) => i.reorderPoint != null && K.qty(i.id) <= i.reorderPoint);
  K.onOrder = (itemId) => get('purchaseOrders').filter((p) => ['approved', 'sent', 'partially_received', 'pending_approval'].indexOf(p.status) >= 0).reduce((s, p) => s + p.lines.filter((l) => l.itemId === itemId).reduce((a, l) => a + Math.max(0, l.qty - (l.receivedQty || 0)), 0), 0);

  /* ── BOM: boms[] {id, family, name, scale:'width'|'thickness'|null, base, lines:[{itemId, qty, scrapPct}], routing:[{seq, op, lineId, minPerUnit}]} ── */
  ERP.bomOf = (itemId) => { const it = ERP.item(itemId); if (!it || !it.bomId) return null; return ERP.find('boms', it.bomId); };
  /** concrete material need for qty units of itemId → [{itemId, qty, uom}] (scaled by width/90 for doors, thickness for foam) */
  ERP.materialsFor = function (itemId, qty) {
    const it = ERP.item(itemId); const b = ERP.bomOf(itemId); if (!it || !b) return [];
    const f = b.scale === 'width' ? (it.attrs.width || 90) / 90 : b.scale === 'thickness' ? (it.attrs.thickness || 10) : 1;
    return b.lines.map((l) => { const m = ERP.item(l.itemId); const fixed = m && (m.kind === 'acc' || m.kind === 'pkg'); return { itemId: l.itemId, qty: Math.round(l.qty * (fixed ? 1 : f) * qty * (1 + (l.scrapPct || 0)) * 100) / 100, uom: m ? m.uom : '' }; });
  };
  /** standard minutes per unit on each line from the routing */
  ERP.routingFor = (itemId) => { const b = ERP.bomOf(itemId); const it = ERP.item(itemId); if (!b) return []; const f = b.scale === 'thickness' ? (it.attrs.thickness || 10) / 10 : 1; return b.routing.map((r) => Object.assign({}, r, { minPerUnit: r.minPerUnit * f })); };

  /* ── General ledger: accounts[] {code, name, type:'asset|liability|equity|revenue|expense', parent, level} · journal[] newest first {id, date, memo, ref, lines:[{acc, dr, cr}], by, auto, status} ── */
  const GL = (ERP.gl = {});
  GL.acc = (code) => get('accounts').find((a) => a.code === code) || null;
  GL.accName = (code) => { const a = GL.acc(code); return a ? a.name : code; };
  GL.post = function (o) {
    const lines = o.lines.filter((l) => (l.dr || 0) + (l.cr || 0) > 0).map((l) => ({ acc: l.acc, dr: Math.round((l.dr || 0) * 100) / 100, cr: Math.round((l.cr || 0) * 100) / 100 }));
    const dr = lines.reduce((s, l) => s + l.dr, 0), cr = lines.reduce((s, l) => s + l.cr, 0);
    if (Math.abs(dr - cr) > 0.05) { console.warn('[ERP.gl.post] unbalanced', o, dr, cr); }
    const je = { id: ERP.no('JE'), date: o.date || ERP.day(0), memo: o.memo, ref: o.ref || null, lines, by: SA.session.userId || 'SYSTEM', auto: o.auto !== false, status: 'posted', total: dr };
    st.update('journal', (l) => { l.unshift(je); });
    return je;
  };
  /** natural balance (asset/expense: dr-cr · others: cr-dr) optionally filtered by date range 'YYYY-MM-DD' */
  GL.balance = function (code, from, to) {
    const a = GL.acc(code); const debitNature = !a || a.type === 'asset' || a.type === 'expense'; let s = 0;
    const set = new Set(GL.leafs(code)); get('journal').forEach((je) => { if ((from && je.date < from) || (to && je.date > to)) return; je.lines.forEach((l) => { if (set.has(l.acc)) s += debitNature ? l.dr - l.cr : l.cr - l.dr; }); });
    return Math.round(s);
  };
  /** leaf account codes under a code (itself if it has no children) — follows the parent chain, not the code prefix */
  GL.leafs = (code) => { const all = get('accounts'); const out = []; const walk = (c) => { const kids = all.filter((a) => a.parent === c); if (!kids.length) out.push(c); kids.forEach((k) => walk(k.code)); }; walk(code); return out; };
  GL.typeTotal = (type, from, to) => get('accounts').filter((a) => a.type === type && a.level === 2).reduce((s, a) => s + GL.balance(a.code, from, to), 0);
  GL.revenueAcc = (item) => { item = typeof item === 'string' ? ERP.item(item) : item; const f = item && item.family; return f === 'door' ? '4101' : f === 'clad' ? '4102' : f === 'foam' ? '4103' : '4104'; };
  /** VAT rate: settings.finance.taxRate is {Open} (بند 38) → demo 14% flagged by ERP.taxIsDemo() */
  ERP.taxRate = () => { const r = st.get('settings.finance.taxRate'); return r == null ? 0.14 : r; };
  ERP.taxIsDemo = () => st.get('settings.finance.taxRate') == null;

  /* ── approval reconcile registry: ERP.onApproval(refType, fn(approval)) — fn MUST be idempotent (check the source status) ── */
  const handlers = {};
  ERP.onApproval = (refType, fn) => { (handlers[refType] = handlers[refType] || []).push(fn); };
  let busy = false;
  function reconcile() {
    if (busy || !st.get('approvals')) return; busy = true;
    try { get('approvals').forEach((a) => { if (!a.ref || !handlers[a.ref.type] || ['approved', 'rejected', 'changes_requested'].indexOf(a.status) < 0) return; handlers[a.ref.type].forEach((fn) => { try { fn(a); } catch (e) { console.error('[ERP.onApproval]', a.ref.type, e); } }); }); } finally { busy = false; }
  }
  st.subscribe('approvals', reconcile);
  ERP.reconcile = reconcile;

  /* ── seed hooks: module agents add their own collections → ERP.addSeed('care', (state, ctx) => { state.tickets = [...] }) (runs inside SA.seed.build, see seed-erp.js) ── */
  ERP.seedHooks = [];
  ERP.addSeed = (name, fn) => { ERP.seedHooks.push({ name, fn }); };

  /* ═════════════════════════ 3. BUSINESS FLOW ═════════════════════════ */
  const F = (ERP.flow = {});
  const patch = (coll, id, fn) => st.patch(coll, id, fn);
  const me = () => SA.session.userId || 'SYSTEM';
  const notify = (o) => { try { SA.notify(o); } catch (e) { /* noop */ } };
  const audit = (code, o) => { try { SA.audit(code, o); } catch (e) { console.error(e); } };
  /** demo approval limits — the real values are {Open} (بند 33) and live in settings.approvalRules */
  F.limits = { discountPct: 5, gmDiscountPct: 10, orderValue: 300000, poAuto: 50000, poGm: 250000, demo: true };

  /** totals for any doc with lines [{qty, price}] + discountPct → {gross, discount, net, tax, total} */
  F.totals = function (doc) {
    const gross = (doc.lines || []).reduce((s, l) => s + l.qty * l.price, 0); const discount = gross * ((doc.discountPct || 0) / 100); const net = gross - discount;
    const tax = net * (doc.taxRate == null ? ERP.taxRate() : doc.taxRate); return { gross: Math.round(gross), discount: Math.round(discount), net: Math.round(net), tax: Math.round(tax), total: Math.round(net + tax) };
  };
  /** customer's price for an item (price list multiplier; dealer/contractor discount bands are demo values) */
  F.priceFor = function (customerId, itemId) {
    const it = ERP.item(itemId); if (!it) return 0; const c = ERP.customer(customerId); const pl = c ? ERP.find('priceLists', c.priceListId) : null;
    const k = pl && pl.factor != null ? pl.factor : 1; return Math.round((it.price || 0) * k);
  };

  /* sales orders: salesOrders[] {id, customerId, source:'rep|portal|expo|phone', repId, lines:[{itemId, qty, price, reservedQty, deliveredQty, invoicedQty}], discountPct, status, createdAt, promisedDate,
     approvalId, woIds[], dnIds[], invoiceIds[], notes, call:{preferredTime, phone, log:[{at, by, result, note}]}, export:bool, priority:'normal|high' } */
  F.createOrder = function (o) {
    const so = { id: ERP.no('SO'), customerId: o.customerId, source: o.source || 'rep', repId: o.repId || (ERP.customer(o.customerId) || {}).salesRepId || me(), createdBy: me(),
      lines: o.lines.map((l) => ({ itemId: l.itemId, qty: Number(l.qty), price: l.price != null ? Number(l.price) : F.priceFor(o.customerId, l.itemId), reservedQty: 0, deliveredQty: 0, invoicedQty: 0 })),
      discountPct: Number(o.discountPct || 0), status: 'draft', createdAt: ERP.now(), promisedDate: o.promisedDate || ERP.day(21), approvalId: null, woIds: [], dnIds: [], invoiceIds: [], notes: o.notes || '',
      call: o.call || null, export: !!(ERP.customer(o.customerId) || {}).export, priority: o.priority || 'normal', quoteId: o.quoteId || null, leadId: o.leadId || null };
    st.insert('salesOrders', so, true);
    audit('SO.CREATED', { target: { type: 'sales_order', id: so.id, label: ERP.customerName(so.customerId) }, after: { total: F.totals(so).total, source: so.source } });
    return so;
  };
  /** submit: portal orders → pending_review (sales calls the dealer, Approved بند 48); otherwise approval when discount/value exceed the demo limits, else confirm. */
  F.submitOrder = function (soId, o) {
    o = o || {}; const so = ERP.find('salesOrders', soId); if (!so) return null; const t = F.totals(so);
    if (so.source === 'portal' && !o.reviewed) {
      patch('salesOrders', soId, { status: 'pending_review', submittedAt: ERP.now() });
      audit('PORTAL.ORDER_SUBMITTED', { target: { type: 'sales_order', id: soId, label: ERP.customerName(so.customerId) }, after: { total: t.total }, via: 'web' });
      notify({ title: 'طلب جديد من بوابة التاجر: ' + soId, body: ERP.customerName(so.customerId) + ' — ' + ERP.fmt.money(t.total) + '. اتصل بالتاجر لتأكيد الطلب.', level: 'action', to: ['R-03', 'R-04'], link: '#/crm/dealer-orders' });
      return 'pending_review';
    }
    const needGm = so.discountPct > F.limits.gmDiscountPct || t.net > F.limits.orderValue; const needMgr = needGm || so.discountPct > F.limits.discountPct;
    if (needMgr) {
      const ap = SA.requestApproval({ type: 'sales_order', area: 'crm', title: 'أمر بيع ' + soId + ' — ' + ERP.customerName(so.customerId) + (so.discountPct ? ' (خصم ' + so.discountPct + '%)' : ''), amount: t.total, discountPct: so.discountPct || null,
        chain: needGm ? [{ roleId: 'R-03', label: 'مدير المبيعات' }, { roleId: 'R-02', label: 'المدير العام' }] : [{ roleId: 'R-03', label: 'مدير المبيعات' }],
        context: [['العميل', ERP.customerName(so.customerId)], ['قيمة الطلب', ERP.fmt.money(t.total)], ['الخصم', (so.discountPct || 0) + '%'], ['البنود', so.lines.length + ' صنف'], ['حدود الاعتماد', 'قيم تجريبية — الحدود الفعلية Open (بند 33)']], ref: { type: 'sales_order', id: soId } });
      patch('salesOrders', soId, { status: 'pending_approval', approvalId: ap.id, submittedAt: ERP.now() });
      audit('SO.SUBMITTED', { target: { type: 'sales_order', id: soId, label: ERP.customerName(so.customerId) }, after: { approval: ap.id } });
      return 'pending_approval';
    }
    F.confirmOrder(soId); return 'confirmed';
  };
  /** dealer call log (بند 49 details are Open) → {result:'confirmed|no_answer|changes|cancelled', note} ; 'confirmed' continues to submitOrder(reviewed) */
  F.logCall = function (soId, result, note) {
    patch('salesOrders', soId, (so) => { so.call = so.call || {}; so.call.log = so.call.log || []; so.call.log.unshift({ at: ERP.now(), by: me(), result, note: note || '' }); });
    audit('SO.CALL_LOGGED', { target: { type: 'sales_order', id: soId, label: ERP.customerName((ERP.find('salesOrders', soId) || {}).customerId) }, after: { result }, reason: note || '' });
    if (result === 'confirmed') return F.submitOrder(soId, { reviewed: true });
    if (result === 'cancelled') { patch('salesOrders', soId, { status: 'cancelled' }); return 'cancelled'; }
    return 'pending_review';
  };
  /** confirm: reserve finished goods; create planned work orders for any shortage → status in_production | ready */
  F.confirmOrder = function (soId) {
    const so = ERP.find('salesOrders', soId); if (!so) return null; const woIds = so.woIds.slice();
    so.lines.forEach((l, i) => {
      const it = ERP.item(l.itemId); const need = l.qty - (l.reservedQty || 0); if (need <= 0) return;
      const avail = K.available(l.itemId, K.FG); const take = Math.min(avail, need);
      if (take > 0) { K.reserve(l.itemId, take, K.FG); patch('salesOrders', soId, (s) => { s.lines[i].reservedQty = (s.lines[i].reservedQty || 0) + take; }); }
      if (need - take > 0 && it && it.bomId) { const wo = F.createWO({ itemId: l.itemId, qty: need - take, soId, priority: so.priority, dueDate: so.promisedDate }); woIds.push(wo.id); }
    });
    const status = woIds.length > so.woIds.length || woIds.some((w) => { const x = ERP.find('workOrders', w); return x && ['completed', 'closed'].indexOf(x.status) < 0; }) ? 'in_production' : 'ready';
    patch('salesOrders', soId, { status, woIds, confirmedAt: ERP.now(), confirmedBy: me() });
    audit('SO.CONFIRMED', { target: { type: 'sales_order', id: soId, label: ERP.customerName(so.customerId) }, after: { status, workOrders: woIds.length } });
    if (status === 'in_production') notify({ title: 'أوامر تشغيل جديدة من ' + soId, body: (woIds.length - so.woIds.length) + ' أمر تشغيل مخطط — ' + ERP.customerName(so.customerId), level: 'action', to: ['R-05'], link: '#/mfg/workorders' });
    else notify({ title: soId + ' جاهز للتسليم', body: 'البضاعة محجوزة في مخزن المنتج التام — جهّز إذن التسليم.', level: 'action', to: ['R-17', 'R-06'], link: '#/scm/deliveries' });
    return status;
  };
  /** re-check reservations after production → may move the order to 'ready' */
  F.refreshOrder = function (soId) {
    const so = ERP.find('salesOrders', soId); if (!so || ['confirmed', 'in_production'].indexOf(so.status) < 0) return;
    so.lines.forEach((l, i) => { const need = l.qty - (l.reservedQty || 0) - 0; if (need <= 0) return; const take = Math.min(K.available(l.itemId, K.FG), need); if (take > 0) { K.reserve(l.itemId, take, K.FG); patch('salesOrders', soId, (s) => { s.lines[i].reservedQty += take; }); } });
    const s2 = ERP.find('salesOrders', soId); if (s2.lines.every((l) => (l.reservedQty || 0) >= l.qty)) {
      patch('salesOrders', soId, { status: 'ready', readyAt: ERP.now() });
      notify({ title: soId + ' جاهز للتسليم', body: ERP.customerName(so.customerId) + ' — كل البنود محجوزة.', level: 'action', to: ['R-17', 'R-06', 'R-04'], link: '#/scm/deliveries' });
    }
  };
  F.cancelOrder = function (soId, reason) {
    const so = ERP.find('salesOrders', soId); if (!so) return;
    so.lines.forEach((l) => { if (l.reservedQty) K.unreserve(l.itemId, l.reservedQty - (l.deliveredQty || 0), K.FG); });
    patch('salesOrders', soId, (s) => { s.status = 'cancelled'; s.cancelReason = reason || ''; s.lines.forEach((l) => { l.reservedQty = l.deliveredQty || 0; }); });
    audit('SO.CANCELLED', { target: { type: 'sales_order', id: soId, label: ERP.customerName(so.customerId) }, reason });
  };
  ERP.onApproval('sales_order', (a) => {
    const so = ERP.find('salesOrders', a.ref.id); if (!so || so.approvalId !== a.id || so.status !== 'pending_approval') return;
    if (a.status === 'approved') F.confirmOrder(so.id);
    else if (a.status === 'rejected') { patch('salesOrders', so.id, { status: 'rejected', rejectedReason: (a.chain.find((c) => c.status === 'rejected') || {}).reason || '' }); audit('SO.REJECTED', { target: { type: 'sales_order', id: so.id, label: ERP.customerName(so.customerId) } }); }
    else if (a.status === 'changes_requested') patch('salesOrders', so.id, { status: 'draft', changesNote: a.changesNote || '' });
  });

  /* work orders: workOrders[] {id, itemId, qty, qtyDone, qtyScrap, lineId, soId, status, priority, plannedStart, plannedEnd, dueDate, actualStart, actualEnd, shift, issued:bool, qcId, createdAt, createdBy, lot} */
  F.lineFor = (itemId) => { const it = ERP.item(itemId); const f = it && it.family; return f === 'door' ? 'L-02' : f === 'clad' ? 'L-03' : f === 'foam' ? 'L-04' : 'L-01'; };
  F.createWO = function (o) {
    const lineId = o.lineId || F.lineFor(o.itemId); const ln = ERP.line(lineId); const it = ERP.item(o.itemId);
    const perShift = ln ? ln.capacityPerShift * (it && it.family === 'foam' ? 10 / (it.attrs.thickness || 10) : 1) : 100; const shifts = Math.max(1, Math.ceil(o.qty / perShift));
    const start = o.plannedStart || ERP.day(1);
    const wo = { id: ERP.no('WO'), itemId: o.itemId, qty: Number(o.qty), qtyDone: 0, qtyScrap: 0, lineId, soId: o.soId || null, status: 'planned', priority: o.priority || 'normal', plannedStart: start,
      plannedEnd: ERP.day(Math.round((new Date(start).getTime() - Date.now()) / 86400000) + Math.ceil(shifts / 2)), dueDate: o.dueDate || null, actualStart: null, actualEnd: null, shift: null, issued: false, qcId: null, createdAt: ERP.now(), createdBy: me(), lot: null };
    wo.lot = 'LOT-' + wo.id.slice(3);
    st.insert('workOrders', wo, true);
    audit('WO.CREATED', { target: { type: 'work_order', id: wo.id, label: ERP.itemName(wo.itemId) }, after: { qty: wo.qty, line: lineId, so: wo.soId } });
    return wo;
  };
  /** material check vs raw-material store → [{itemId, need, avail, short}] */
  F.woMaterials = function (woId) { const wo = ERP.find('workOrders', woId); if (!wo) return []; return ERP.materialsFor(wo.itemId, wo.qty - (wo.qtyDone || 0)).map((m) => { const avail = K.available(m.itemId, K.defaultWh(m.itemId)); return { itemId: m.itemId, need: m.qty, uom: m.uom, avail, short: Math.max(0, Math.round((m.qty - avail) * 100) / 100) }; }); };
  /** release: the WO goes to the floor and a material issue request (إذن صرف — ERP.factory.createMIR) goes to the raw-materials storekeeper, who issues to the mixer
      (stock + GL Dr 1142 / Cr 1141 happen on issue, see erp-factory.js). If short and !o.force → {ok:false, shortages}; with o.raisePR the shortages become purchase requisitions. */
  F.releaseWO = function (woId, o) {
    o = o || {}; const wo = ERP.find('workOrders', woId); if (!wo || wo.status !== 'planned') return { ok: false, reason: 'status' };
    const mats = F.woMaterials(woId); const short = mats.filter((m) => m.short > 0);
    if (short.length && !o.force) { if (o.raisePR) short.forEach((m) => F.createPRQ({ itemId: m.itemId, qty: Math.ceil(m.short * 1.1), reason: 'نقص خامات لأمر التشغيل ' + woId, source: 'mrp', woId })); return { ok: false, shortages: short }; }
    const FXm = ERP.factory; const mir = FXm ? FXm.createMIR(woId, { force: !!o.force }) : null;
    patch('workOrders', woId, (w) => { w.status = 'released'; w.issued = false; w.releasedAt = ERP.now(); w.releasedBy = me(); w.mirId = mir ? mir.id : null; if (FXm && (!w.stages || !w.stages.length)) w.stages = FXm.initStages(Object.assign({}, w)); });
    audit('WO.RELEASED', { target: { type: 'work_order', id: woId, label: ERP.itemName(wo.itemId) }, after: { materials: mats.length, mir: mir ? mir.id : null } });
    return { ok: true, shortages: short, mirId: mir ? mir.id : null };
  };
  F.startWO = function (woId, shift) {
    const wo = ERP.find('workOrders', woId); if (!wo) return { ok: false, reason: 'not_found' }; if (!wo.issued) return { ok: false, reason: 'not_issued' }; patch('workOrders', woId, { status: 'in_progress', actualStart: wo.actualStart || ERP.now(), shift: shift || wo.shift || 'A' });
    patch('lines', wo.lineId, { currentWoId: woId, status: 'running' });
    audit('WO.STARTED', { target: { type: 'work_order', id: woId, label: ERP.itemName(wo.itemId) }, after: { line: wo.lineId } });
  };
  /** report production (good, scrap). When done → qc_pending + final inspection QC record. */
  F.reportWO = function (woId, good, scrap) {
    const wo = ERP.find('workOrders', woId); if (!wo) return null; good = Number(good) || 0; scrap = Number(scrap) || 0;
    patch('workOrders', woId, (w) => { w.qtyDone = (w.qtyDone || 0) + good; w.qtyScrap = (w.qtyScrap || 0) + scrap; w.reports = w.reports || []; w.reports.unshift({ at: ERP.now(), by: me(), good, scrap }); if (w.status === 'released' || w.status === 'planned') w.status = 'in_progress'; if (!w.actualStart) w.actualStart = ERP.now(); });
    audit('WO.REPORTED', { target: { type: 'work_order', id: woId, label: ERP.itemName(wo.itemId) }, after: { good, scrap } });
    const w2 = ERP.find('workOrders', woId);
    if (w2.qtyDone >= w2.qty && !w2.qcId) {
      const qc = F.createQC({ kind: 'final', refType: 'work_order', refId: woId, itemId: w2.itemId, qty: w2.qtyDone, lot: w2.lot });
      patch('workOrders', woId, { status: 'qc_pending', qcId: qc.id, actualEnd: ERP.now() });
      const ln = ERP.line(w2.lineId); if (ln && ln.currentWoId === woId) patch('lines', w2.lineId, { currentWoId: null });
      notify({ title: 'فحص نهائي مطلوب: ' + woId, body: ERP.itemName(w2.itemId) + ' — ' + w2.qtyDone + ' وحدة بانتظار الجودة.', level: 'action', to: ['R-09'], link: '#/mfg/qc/' + qc.id });
    }
    return ERP.find('workOrders', woId);
  };
  /* QC: qcInspections[] {id, kind:'incoming|inprocess|final', refType:'work_order|grn', refId, itemId, qty, sample, lot, result:'pending|pass|conditional|fail', params:[{name, spec, value, ok}], defects:[{code, label, qty}], acceptedQty, rejectedQty, inspectorId, at, note, ncrId} */
  ERP.qcParams = {
    door: [['سُمك الضلفة', '45 ± 1 مم'], ['استواء السطح', '≤ 1 مم/م'], ['التصاق الفويل (Peel)', '≥ 4 نيوتن/مم'], ['مطابقة اللون (ΔE)', '≤ 1.5'], ['مقاسات الحلق', '± 2 مم'], ['اختبار الغلق والمفصلات', 'سليم']],
    clad: [['الطول', '2800 ± 5 مم'], ['العرض', '170 ± 1 مم'], ['الكثافة', '1.25–1.35 جم/سم³'], ['امتصاص الماء 24 ساعة', '≤ 1%'], ['اللون (ΔE)', '≤ 1.5'], ['الاستقامة', '≤ 2 مم/م']],
    foam: [['السُمك', 'اسمي ± 0.2 مم'], ['الكثافة', '0.50–0.60 جم/سم³'], ['استواء اللوح', '≤ 2 مم'], ['مقاومة الشد', '≥ 12 ميجا باسكال'], ['نعومة السطح', 'بدون فقاعات/خطوط']],
    rm: [['مطابقة شهادة المورد (COA)', 'مطابقة'], ['الرطوبة', '≤ 0.5%'], ['حجم الحبيبات/المش', 'حسب المواصفة'], ['سلامة العبوات', 'سليمة']]
  };
  ERP.defectCodes = [['D01', 'فقاعات/مسامية'], ['D02', 'انفصال الفويل'], ['D03', 'اختلاف لون'], ['D04', 'خدوش سطحية'], ['D05', 'انحناء/عدم استقامة'], ['D06', 'خارج المقاس'], ['D07', 'كسر/شرخ'], ['D08', 'رطوبة زائدة (خامة)'], ['D09', 'تلوث/شوائب']].map((d) => ({ code: d[0], label: d[1] }));
  F.createQC = function (o) {
    const it = ERP.item(o.itemId); const fam = it ? (it.kind === 'fg' ? it.family : 'rm') : 'rm';
    const qc = { id: ERP.no('QC'), kind: o.kind, refType: o.refType, refId: o.refId, itemId: o.itemId, qty: o.qty, sample: Math.max(3, Math.min(32, Math.ceil(Math.sqrt(o.qty || 1)) + 1)), lot: o.lot || null, result: 'pending',
      params: (ERP.qcParams[fam] || ERP.qcParams.rm).map((p) => ({ name: p[0], spec: p[1], value: '', ok: null })), defects: [], acceptedQty: null, rejectedQty: null, inspectorId: null, at: null, createdAt: ERP.now(), note: '', ncrId: null };
    st.insert('qcInspections', qc, true); return qc;
  };
  /** record a QC decision → moves stock, completes WO / GRN, opens NCR on fail. o = {result, params, defects, acceptedQty, note} */
  F.recordQC = function (qcId, o) {
    const qc = ERP.find('qcInspections', qcId); if (!qc || qc.result !== 'pending') return null; o = o || {};
    const result = o.result; const accepted = result === 'fail' ? 0 : (o.acceptedQty != null ? Number(o.acceptedQty) : qc.qty); const rejected = Math.max(0, qc.qty - accepted);
    patch('qcInspections', qcId, { result, params: o.params || qc.params, defects: o.defects || [], acceptedQty: accepted, rejectedQty: rejected, inspectorId: me(), at: ERP.now(), note: o.note || '' });
    audit(result === 'fail' ? 'QC.FAILED' : 'QC.PASSED', { target: { type: 'qc', id: qcId, label: ERP.itemName(qc.itemId) }, after: { result, accepted, rejected } });
    let ncr = null; if (rejected > 0) ncr = F.openNCR({ source: qc.kind === 'incoming' ? 'supplier' : 'production', refType: qc.refType, refId: qc.refId, qcId, itemId: qc.itemId, qty: rejected, defectCode: ((o.defects || [])[0] || {}).code || 'D01', severity: result === 'fail' ? 'major' : 'minor' });
    if (ncr) patch('qcInspections', qcId, { ncrId: ncr.id });
    if (qc.refType === 'work_order') {
      const wo = ERP.find('workOrders', qc.refId); const it = ERP.item(qc.itemId); const cost = (it && it.stdCost) || 0;
      // accepted goods wait for the finished-goods storekeeper (ERP.factory.receiveFG moves them into W-01 + GL Dr 1143 / Cr 1142 + re-reserves the order)
      if (accepted > 0) { if (ERP.factory) ERP.factory.createFGR({ woId: qc.refId, qcId, itemId: qc.itemId, qty: accepted, lot: qc.lot }); else { K.move({ itemId: qc.itemId, whId: K.FG, qty: accepted, type: 'production', ref: { type: 'work_order', id: qc.refId }, note: 'استلام إنتاج تام بعد فحص الجودة', lot: qc.lot }); GL.post({ memo: 'إنتاج تام من ' + qc.refId, ref: { type: 'work_order', id: qc.refId }, lines: [{ acc: '1143', dr: accepted * cost }, { acc: '1142', cr: accepted * cost }] }); } }
      if (rejected > 0) K.move({ itemId: qc.itemId, whId: K.QRT, qty: rejected, type: 'scrap', ref: { type: 'qc', id: qcId }, note: 'حجر جودة — عدم مطابقة', lot: qc.lot });
      patch('workOrders', qc.refId, { status: result === 'fail' ? 'on_hold' : 'completed', completedAt: ERP.now(), ncrId: ncr ? ncr.id : null });
      if (result !== 'fail') audit('WO.COMPLETED', { target: { type: 'work_order', id: qc.refId, label: ERP.itemName(qc.itemId) }, after: { accepted } });
      if (wo && wo.soId) F.refreshOrder(wo.soId);
    } else if (qc.refType === 'grn') {
      const grn = ERP.find('grns', qc.refId); if (grn) {
        const line = grn.lines.find((l) => l.itemId === qc.itemId) || grn.lines[0];
        if (accepted > 0) K.move({ itemId: qc.itemId, whId: grn.whId || K.defaultWh(qc.itemId), qty: accepted, type: 'receipt', ref: { type: 'grn', id: grn.id }, note: 'استلام بعد فحص الجودة', lot: qc.lot });
        if (rejected > 0) K.move({ itemId: qc.itemId, whId: K.QRT, qty: rejected, type: 'return', ref: { type: 'qc', id: qcId }, note: 'مرفوض — مرتجع للمورد', lot: qc.lot });
        patch('grns', grn.id, (g) => { const l = g.lines.find((x) => x.itemId === qc.itemId) || g.lines[0]; l.acceptedQty = accepted; l.rejectedQty = rejected; const all = g.lines.every((x) => x.acceptedQty != null); if (all) g.status = g.lines.every((x) => !x.rejectedQty) ? 'accepted' : g.lines.every((x) => !x.acceptedQty) ? 'rejected' : 'partially_accepted'; });
        if (accepted > 0 && line) F.recordBill(grn.id, qc.itemId, accepted, line.price);
      }
    }
    return ERP.find('qcInspections', qcId);
  };
  /* NCR: ncrs[] {id, source:'production|supplier|customer', refType, refId, qcId, itemId, qty, defectCode, severity:'minor|major|critical', status, disposition:'rework|scrap|use_as_is|return_to_supplier'|null, rootCause, capaId, openedAt, openedBy, closedAt} */
  F.openNCR = function (o) {
    const ncr = Object.assign({ id: ERP.no('NCR', 3), status: 'open', disposition: null, rootCause: '', capaId: null, openedAt: ERP.now(), openedBy: me(), closedAt: null }, o);
    st.insert('ncrs', ncr, true);
    audit('NCR.OPENED', { target: { type: 'ncr', id: ncr.id, label: ERP.itemName(ncr.itemId) }, after: { qty: ncr.qty, source: ncr.source } });
    notify({ title: 'عدم مطابقة جديد: ' + ncr.id, body: ERP.itemName(ncr.itemId) + ' — ' + ncr.qty + ' وحدة.', level: ncr.severity === 'major' ? 'urgent' : 'action', to: ['R-09', 'R-05'], link: '#/mfg/ncr/' + ncr.id });
    return ncr;
  };

  /* purchasing: purchaseRequisitions[] {id, itemId, qty, reason, source:'mrp|reorder|manual|maintenance', woId, status, requestedBy, createdAt, poId}
     purchaseOrders[] {id, supplierId, lines:[{itemId, qty, price, receivedQty}], status, buyerId, createdAt, expectedDate, approvalId, prqIds, currency:'EGP', taxRate}
     grns[] {id, poId, supplierId, whId, lines:[{itemId, qty, price, acceptedQty, rejectedQty}], status, receivedBy, at, qcIds}
     bills[] {id, supplierId, poId, grnId, net, tax, total, paid, status, issueDate, dueDate}  */
  F.createPRQ = function (o) {
    const r = { id: ERP.no('PRQ'), itemId: o.itemId, qty: Number(o.qty), reason: o.reason || '', source: o.source || 'manual', woId: o.woId || null, status: 'open', requestedBy: me(), createdAt: ERP.now(), poId: null, neededBy: o.neededBy || ERP.day(10) };
    st.insert('purchaseRequisitions', r, true); audit('PRQ.CREATED', { target: { type: 'prq', id: r.id, label: ERP.itemName(r.itemId) }, after: { qty: r.qty, source: r.source } });
    notify({ title: 'طلب شراء جديد: ' + ERP.itemName(r.itemId), body: r.qty + ' ' + (ERP.uom[(ERP.item(r.itemId) || {}).uom] || '') + ' — ' + r.reason, level: 'action', to: ['R-08'], link: '#/scm/requisitions' });
    return r;
  };
  F.createPO = function (o) {
    const po = { id: ERP.no('PS'), supplierId: o.supplierId, lines: o.lines.map((l) => ({ itemId: l.itemId, qty: Number(l.qty), price: Number(l.price != null ? l.price : (ERP.item(l.itemId) || {}).stdCost || 0), receivedQty: 0 })), status: 'draft', buyerId: me(), createdAt: ERP.now(), expectedDate: o.expectedDate || ERP.day(7), approvalId: null, prqIds: o.prqIds || [], currency: 'EGP', notes: o.notes || '' };
    st.insert('purchaseOrders', po, true);
    (po.prqIds || []).forEach((id) => patch('purchaseRequisitions', id, { status: 'ordered', poId: po.id }));
    audit('PO.CREATED', { target: { type: 'po', id: po.id, label: ERP.supplierName(po.supplierId) }, after: { total: F.totals(po).total } });
    return po;
  };
  F.submitPO = function (poId) {
    const po = ERP.find('purchaseOrders', poId); if (!po) return null; const t = F.totals(po);
    if (t.net <= F.limits.poAuto) { patch('purchaseOrders', poId, { status: 'approved', approvedAt: ERP.now() }); audit('PO.APPROVED', { target: { type: 'po', id: poId, label: ERP.supplierName(po.supplierId) }, reason: 'أقل من حد الاعتماد التلقائي (تجريبي)' }); return 'approved'; }
    const chain = t.net > F.limits.poGm ? [{ roleId: 'R-22', label: 'المدير المالي' }, { roleId: 'R-02', label: 'المدير العام' }] : [{ roleId: 'R-22', label: 'المدير المالي' }];
    const ap = SA.requestApproval({ type: 'purchase_order', area: 'scm', title: 'أمر شراء ' + poId + ' — ' + ERP.supplierName(po.supplierId), amount: t.total, chain, context: [['المورد', ERP.supplierName(po.supplierId)], ['القيمة', ERP.fmt.money(t.total)], ['البنود', po.lines.map((l) => ERP.itemName(l.itemId)).join('، ')], ['حدود الاعتماد', 'تجريبية — Open']], ref: { type: 'purchase_order', id: poId } });
    patch('purchaseOrders', poId, { status: 'pending_approval', approvalId: ap.id }); audit('PO.SUBMITTED', { target: { type: 'po', id: poId, label: ERP.supplierName(po.supplierId) }, after: { approval: ap.id } });
    return 'pending_approval';
  };
  ERP.onApproval('purchase_order', (a) => {
    const po = ERP.find('purchaseOrders', a.ref.id); if (!po || po.approvalId !== a.id || po.status !== 'pending_approval') return;
    if (a.status === 'approved') { patch('purchaseOrders', po.id, { status: 'approved', approvedAt: ERP.now() }); audit('PO.APPROVED', { target: { type: 'po', id: po.id, label: ERP.supplierName(po.supplierId) } }); notify({ title: 'تم اعتماد ' + po.id, body: 'أرسله للمورد ' + ERP.supplierName(po.supplierId), level: 'info', to: ['R-08'], link: '#/scm/po/' + po.id }); }
    else if (a.status === 'rejected') patch('purchaseOrders', po.id, { status: 'rejected' });
    else if (a.status === 'changes_requested') patch('purchaseOrders', po.id, { status: 'draft' });
  });
  F.sendPO = (poId) => { patch('purchaseOrders', poId, { status: 'sent', sentAt: ERP.now() }); audit('PO.SENT', { target: { type: 'po', id: poId, label: ERP.supplierName((ERP.find('purchaseOrders', poId) || {}).supplierId) } }); };
  /** receive goods → GRN (pending_qc) + one incoming QC per line. lines:[{itemId, qty}] (default: everything outstanding) */
  F.receivePO = function (poId, lines) {
    const po = ERP.find('purchaseOrders', poId); if (!po) return null;
    lines = (lines || po.lines.map((l) => ({ itemId: l.itemId, qty: l.qty - (l.receivedQty || 0) }))).filter((l) => l.qty > 0);
    const grn = { id: ERP.no('GRN'), poId, supplierId: po.supplierId, whId: K.RM, lines: lines.map((l) => ({ itemId: l.itemId, qty: Number(l.qty), price: (po.lines.find((x) => x.itemId === l.itemId) || {}).price || 0, acceptedQty: null, rejectedQty: null })), status: 'pending_qc', receivedBy: me(), at: ERP.now(), qcIds: [] };
    grn.whId = K.defaultWh(lines[0] && lines[0].itemId);
    grn.qcIds = grn.lines.map((l) => F.createQC({ kind: 'incoming', refType: 'grn', refId: grn.id, itemId: l.itemId, qty: l.qty, lot: grn.id }).id);
    st.insert('grns', grn, true);
    patch('purchaseOrders', poId, (p) => { lines.forEach((l) => { const x = p.lines.find((y) => y.itemId === l.itemId); if (x) x.receivedQty = (x.receivedQty || 0) + Number(l.qty); }); p.status = p.lines.every((x) => x.receivedQty >= x.qty) ? 'received' : 'partially_received'; });
    audit('GRN.RECEIVED', { target: { type: 'grn', id: grn.id, label: ERP.supplierName(po.supplierId) }, after: { po: poId, lines: grn.lines.length } });
    notify({ title: 'فحص استلام مطلوب: ' + grn.id, body: ERP.supplierName(po.supplierId) + ' — ' + grn.lines.length + ' صنف بانتظار الجودة.', level: 'action', to: ['R-09'], link: '#/mfg/qc' });
    return grn;
  };
  F.recordBill = function (grnId, itemId, qty, price) {
    const grn = ERP.find('grns', grnId); if (!grn) return null; const net = Math.round(qty * price); const tax = Math.round(net * ERP.taxRate()); const sup = ERP.supplier(grn.supplierId) || {};
    const b = { id: ERP.no('BILL'), supplierId: grn.supplierId, poId: grn.poId, grnId, net, tax, total: net + tax, paid: 0, status: 'open', issueDate: ERP.day(0), dueDate: ERP.day(sup.termsDays || 30), lines: [{ itemId, qty, price }] };
    st.insert('bills', b, true);
    GL.post({ memo: 'فاتورة مورد ' + b.id + ' — ' + ERP.supplierName(grn.supplierId), ref: { type: 'bill', id: b.id }, lines: [{ acc: K.defaultWh(itemId) === K.SPARES ? '1144' : '1141', dr: net }, { acc: '1161', dr: tax }, { acc: '2101', cr: net + tax }] });
    st.patch('suppliers', grn.supplierId, (s) => { s.balance = (s.balance || 0) + net + tax; });
    audit('BILL.RECORDED', { target: { type: 'bill', id: b.id, label: ERP.supplierName(grn.supplierId) }, after: { total: b.total } });
    return b;
  };
  /** MRP: open WOs (planned) material need + reorder points vs on hand + on order → suggestions [{itemId, need, onHand, onOrder, short, suggestQty, supplierId, reason}] */
  F.mrp = function () {
    const need = {}; get('workOrders').filter((w) => w.status === 'planned').forEach((w) => ERP.materialsFor(w.itemId, w.qty).forEach((m) => { need[m.itemId] = (need[m.itemId] || 0) + m.qty; }));
    const out = []; get('items').filter((i) => i.kind === 'rm' || i.kind === 'pkg' || i.kind === 'acc').forEach((i) => {
      const n = need[i.id] || 0; const onHand = K.available(i.id, K.defaultWh(i)); const onOrder = K.onOrder(i.id); const proj = onHand + onOrder - n;
      if (proj < (i.reorderPoint || 0)) { const short = Math.round(((i.reorderPoint || 0) - proj) * 100) / 100; out.push({ itemId: i.id, need: Math.round(n * 100) / 100, onHand, onOrder, short, suggestQty: Math.ceil(Math.max(short, i.moq || 0)), supplierId: i.supplierId || null, reason: n > 0 ? 'احتياج أوامر تشغيل' : 'تحت حد الطلب' }); }
    });
    return out.sort((a, b) => b.short * ((ERP.item(b.itemId) || {}).stdCost || 1) - a.short * ((ERP.item(a.itemId) || {}).stdCost || 1));
  };

  /* deliveries: deliveries[] {id, soId, customerId, lines:[{itemId, qty}], status, plannedDate, vehicleId, driver, shipmentId, dispatchedAt, deliveredAt, pod:{receivedBy, note, at}, address, onTime} */
  F.createDelivery = function (soId, o) {
    o = o || {}; const so = ERP.find('salesOrders', soId); if (!so) return null; const c = ERP.customer(so.customerId) || {};
    const lines = (o.lines || so.lines.map((l) => ({ itemId: l.itemId, qty: Math.max(0, (l.reservedQty || 0) - (l.deliveredQty || 0) - F.pendingDnQty(soId, l.itemId)) }))).filter((l) => l.qty > 0);
    if (!lines.length) return null;
    const dn = { id: ERP.no('DN'), soId, customerId: so.customerId, lines, status: 'planned', plannedDate: o.plannedDate || ERP.day(1), vehicleId: o.vehicleId || null, driver: o.driver || null, shipmentId: o.shipmentId || null, dispatchedAt: null, deliveredAt: null, pod: null, address: c.city || '', createdAt: ERP.now(), createdBy: me() };
    st.insert('deliveries', dn, true); patch('salesOrders', soId, (s) => { s.dnIds = (s.dnIds || []).concat(dn.id); });
    audit('DN.CREATED', { target: { type: 'dn', id: dn.id, label: ERP.customerName(so.customerId) }, after: { so: soId, lines: lines.length } });
    return dn;
  };
  F.pendingDnQty = (soId, itemId) => get('deliveries').filter((d) => d.soId === soId && ['planned', 'loading', 'dispatched', 'in_transit'].indexOf(d.status) >= 0).reduce((s, d) => s + d.lines.filter((l) => l.itemId === itemId).reduce((a, l) => a + l.qty, 0), 0);
  /** dispatch: stock out of FG + release reservation + COGS (Dr 5101 / Cr 1143) */
  F.dispatch = function (dnId, o) {
    o = o || {}; const dn = ERP.find('deliveries', dnId); if (!dn || ['planned', 'loading'].indexOf(dn.status) < 0) return null; let cogs = 0;
    dn.lines.forEach((l) => { K.move({ itemId: l.itemId, whId: K.FG, qty: -l.qty, type: 'delivery', ref: { type: 'dn', id: dnId }, note: 'خروج بإذن تسليم' }); K.unreserve(l.itemId, l.qty, K.FG); cogs += l.qty * ((ERP.item(l.itemId) || {}).stdCost || 0); });
    patch('deliveries', dnId, { status: 'dispatched', dispatchedAt: ERP.now(), vehicleId: o.vehicleId || dn.vehicleId, driver: o.driver || dn.driver });
    if (cogs > 0) GL.post({ memo: 'تكلفة البضاعة المسلّمة ' + dnId, ref: { type: 'dn', id: dnId }, lines: [{ acc: '5101', dr: cogs }, { acc: '1143', cr: cogs }] });
    audit('DN.DISPATCHED', { target: { type: 'dn', id: dnId, label: ERP.customerName(dn.customerId) }, after: { vehicle: o.vehicleId || dn.vehicleId } });
    return ERP.find('deliveries', dnId);
  };
  F.deliver = function (dnId, pod) {
    const dn = ERP.find('deliveries', dnId); if (!dn || ['dispatched', 'in_transit'].indexOf(dn.status) < 0) return null;
    patch('deliveries', dnId, { status: 'delivered', deliveredAt: ERP.now(), pod: Object.assign({ at: ERP.now() }, pod || {}), onTime: ERP.day(0) <= dn.plannedDate });
    patch('salesOrders', dn.soId, (s) => { dn.lines.forEach((l) => { const x = s.lines.find((y) => y.itemId === l.itemId); if (x) x.deliveredQty = (x.deliveredQty || 0) + l.qty; }); s.status = s.lines.every((x) => (x.deliveredQty || 0) >= x.qty) ? 'delivered' : 'partially_delivered'; });
    audit('DN.DELIVERED', { target: { type: 'dn', id: dnId, label: ERP.customerName(dn.customerId) }, after: pod || null });
    notify({ title: 'تم التسليم: ' + dnId, body: ERP.customerName(dn.customerId) + ' — جاهز للفوترة (' + dn.soId + ').', level: 'action', to: ['R-07'], link: '#/fin/invoices?so=' + dn.soId });
    return ERP.find('deliveries', dnId);
  };

  /* invoices[] {id, customerId, soId, dnIds, lines:[{itemId, qty, price}], discountPct, net, tax, total, paid, status, issueDate, dueDate, taxDemo:true}
     receipts[] {id, customerId, invoiceId, amount, method:'cash|transfer|cheque|card', account, chequeId, date, by}
     cheques[] {id, no, bank, amount, dueDate, status, customerId, receiptId, history:[{at, status, by}]} */
  F.invoiceOrder = function (soId) {
    const so = ERP.find('salesOrders', soId); if (!so) return null; const c = ERP.customer(so.customerId) || {};
    const lines = so.lines.map((l) => ({ itemId: l.itemId, qty: (l.deliveredQty || 0) - (l.invoicedQty || 0), price: l.price })).filter((l) => l.qty > 0); if (!lines.length) return null;
    const t = F.totals({ lines, discountPct: so.discountPct });
    const inv = { id: ERP.no('INV'), customerId: so.customerId, soId, dnIds: (so.dnIds || []).slice(), lines, discountPct: so.discountPct || 0, net: t.net, tax: t.tax, total: t.total, paid: 0, status: 'issued', issueDate: ERP.day(0), dueDate: ERP.day(c.termsDays || 30), taxDemo: ERP.taxIsDemo(), createdBy: me() };
    st.insert('invoices', inv, true);
    const rev = {}; lines.forEach((l) => { const acc = GL.revenueAcc(l.itemId); rev[acc] = (rev[acc] || 0) + l.qty * l.price * (1 - (so.discountPct || 0) / 100); });
    GL.post({ memo: 'فاتورة بيع ' + inv.id + ' — ' + ERP.customerName(so.customerId), ref: { type: 'invoice', id: inv.id }, lines: [{ acc: '1131', dr: t.total }].concat(Object.keys(rev).map((a) => ({ acc: a, cr: rev[a] }))).concat([{ acc: '2111', cr: t.tax }]) });
    patch('salesOrders', soId, (s) => { lines.forEach((l) => { const x = s.lines.find((y) => y.itemId === l.itemId); if (x) x.invoicedQty = (x.invoicedQty || 0) + l.qty; }); s.invoiceIds = (s.invoiceIds || []).concat(inv.id); if (s.lines.every((x) => (x.invoicedQty || 0) >= x.qty)) s.status = 'invoiced'; });
    st.patch('customers', so.customerId, (x) => { x.balance = (x.balance || 0) + t.total; });
    audit('INV.ISSUED', { target: { type: 'invoice', id: inv.id, label: ERP.customerName(so.customerId) }, after: { total: t.total, taxDemo: inv.taxDemo } });
    return inv;
  };
  F.invoiceStatus = (inv) => (inv.status === 'cancelled' || inv.status === 'draft' ? inv.status : inv.paid >= inv.total - 0.5 ? 'paid' : inv.dueDate < ERP.day(0) ? 'overdue' : inv.paid > 0 ? 'partial' : 'issued');
  /** receivePayment({customerId, invoiceId, amount, method, account('1101'|'1111'…), cheque:{no, bank, dueDate}}) */
  F.receivePayment = function (o) {
    const amount = Math.round(Number(o.amount)); if (!(amount > 0)) return null; let chequeId = null;
    if (o.method === 'cheque') { chequeId = ERP.no('CHQ'); st.insert('cheques', { id: chequeId, no: (o.cheque && o.cheque.no) || '—', bank: (o.cheque && o.cheque.bank) || '—', amount, dueDate: (o.cheque && o.cheque.dueDate) || ERP.day(30), status: 'received', customerId: o.customerId, receiptId: null, history: [{ at: ERP.now(), status: 'received', by: me() }] }, true); }
    const rv = { id: ERP.no('RV'), customerId: o.customerId, invoiceId: o.invoiceId || null, amount, method: o.method || 'transfer', account: o.method === 'cheque' ? '1121' : o.account || (o.method === 'cash' ? '1101' : '1111'), chequeId, date: ERP.day(0), by: me(), note: o.note || '' };
    st.insert('receipts', rv, true); if (chequeId) patch('cheques', chequeId, { receiptId: rv.id });
    GL.post({ memo: 'سند قبض ' + rv.id + ' — ' + ERP.customerName(o.customerId), ref: { type: 'receipt', id: rv.id }, lines: [{ acc: rv.account, dr: amount }, { acc: '1131', cr: amount }] });
    if (o.invoiceId) patch('invoices', o.invoiceId, (inv) => { inv.paid = Math.min(inv.total, (inv.paid || 0) + amount); inv.status = F.invoiceStatus(inv); });
    st.patch('customers', o.customerId, (x) => { x.balance = Math.max(0, (x.balance || 0) - amount); });
    const inv = o.invoiceId ? ERP.find('invoices', o.invoiceId) : null; if (inv && inv.status === 'paid' && inv.soId) { const so = ERP.find('salesOrders', inv.soId); if (so && so.status === 'invoiced' && so.invoiceIds.every((id) => (ERP.find('invoices', id) || {}).status === 'paid')) patch('salesOrders', so.id, { status: 'closed' }); }
    audit('RV.POSTED', { target: { type: 'receipt', id: rv.id, label: ERP.customerName(o.customerId) }, after: { amount, method: rv.method, invoice: o.invoiceId || null } });
    return rv;
  };
  /** cheque lifecycle (بند 39): received → under_collection → collected | bounced | cancelled */
  F.chequeStatus = function (chequeId, status, bankAcc) {
    const ch = ERP.find('cheques', chequeId); if (!ch) return null; const prev = ch.status;
    patch('cheques', chequeId, (c) => { c.status = status; c.history = (c.history || []).concat([{ at: ERP.now(), status, by: me() }]); if (bankAcc) c.bankAcc = bankAcc; });
    if (status === 'collected') GL.post({ memo: 'تحصيل شيك ' + ch.no, ref: { type: 'cheque', id: chequeId }, lines: [{ acc: bankAcc || '1111', dr: ch.amount }, { acc: '1121', cr: ch.amount }] });
    if (status === 'bounced') {
      GL.post({ memo: 'شيك مرتد ' + ch.no, ref: { type: 'cheque', id: chequeId }, lines: [{ acc: '1131', dr: ch.amount }, { acc: '1121', cr: ch.amount }] });
      st.patch('customers', ch.customerId, (x) => { x.balance = (x.balance || 0) + ch.amount; });
      const rv = ERP.find('receipts', ch.receiptId); if (rv && rv.invoiceId) patch('invoices', rv.invoiceId, (inv) => { inv.paid = Math.max(0, inv.paid - ch.amount); inv.status = F.invoiceStatus(inv); });
      notify({ title: 'شيك مرتد: ' + ch.no, body: ERP.customerName(ch.customerId) + ' — ' + ERP.fmt.money(ch.amount) + '. الحالة تتحول لمراجعة المبيعات/المالية (بند 41 — بلا إيقاف تلقائي).', level: 'urgent', to: ['R-07', 'R-22', 'R-03'], link: '#/fin/cheques' });
    }
    audit('CHQ.STATUS_CHANGED', { target: { type: 'cheque', id: chequeId, label: ch.no }, before: { status: prev }, after: { status } });
    return ERP.find('cheques', chequeId);
  };
  /* vouchers[] {id, supplierId|null, payee, billIds, amount, method, account, status, createdBy, approvalId, approvedBy, executedBy, executedAt, memo, expenseAcc} — create / approve / execute are 3 SEPARATE sensitive keys (بند 42) */
  F.createVoucher = function (o) {
    const pv = { id: ERP.no('PV'), supplierId: o.supplierId || null, payee: o.payee || ERP.supplierName(o.supplierId), billIds: o.billIds || [], amount: Math.round(Number(o.amount)), method: o.method || 'transfer', account: o.account || '1111', status: 'pending_approval', createdBy: me(), createdAt: ERP.now(), approvalId: null, memo: o.memo || '', expenseAcc: o.expenseAcc || null };
    const ap = SA.requestApproval({ type: 'voucher', area: 'fin', title: 'سند صرف ' + pv.id + ' — ' + pv.payee, amount: pv.amount, chain: pv.amount > F.limits.poGm ? [{ roleId: 'R-22', label: 'المدير المالي' }, { roleId: 'R-02', label: 'المدير العام' }] : [{ roleId: 'R-22', label: 'المدير المالي' }], context: [['المستفيد', pv.payee], ['المبلغ', ERP.fmt.money(pv.amount)], ['الإنشاء', SA.userName(me())], ['التنفيذ', 'بعد الاعتماد — صلاحية منفصلة (finance.voucher.execute)']], ref: { type: 'voucher', id: pv.id } });
    pv.approvalId = ap.id; st.insert('vouchers', pv, true);
    audit('PV.CREATED', { target: { type: 'voucher', id: pv.id, label: pv.payee }, after: { amount: pv.amount } });
    return pv;
  };
  ERP.onApproval('voucher', (a) => {
    const pv = ERP.find('vouchers', a.ref.id); if (!pv || pv.approvalId !== a.id || pv.status !== 'pending_approval') return;
    if (a.status === 'approved') { patch('vouchers', pv.id, { status: 'approved', approvedAt: ERP.now(), approvedBy: (a.chain[a.chain.length - 1] || {}).decidedBy || null }); audit('PV.APPROVED', { target: { type: 'voucher', id: pv.id, label: pv.payee } }); notify({ title: 'سند ' + pv.id + ' معتمد', body: 'جاهز للتنفيذ بصلاحية التنفيذ.', level: 'action', to: ['R-07'], link: '#/fin/vouchers/' + pv.id }); }
    else if (a.status === 'rejected') patch('vouchers', pv.id, { status: 'rejected' });
  });
  F.executeVoucher = function (pvId) {
    const pv = ERP.find('vouchers', pvId); if (!pv || pv.status !== 'approved') return null;
    GL.post({ memo: 'تنفيذ سند صرف ' + pvId + ' — ' + pv.payee, ref: { type: 'voucher', id: pvId }, lines: [{ acc: pv.supplierId ? '2101' : pv.expenseAcc || '6201', dr: pv.amount }, { acc: pv.account, cr: pv.amount }] });
    let left = pv.amount; (pv.billIds || []).forEach((bid) => patch('bills', bid, (b) => { const pay = Math.min(left, b.total - b.paid); b.paid += pay; left -= pay; b.status = b.paid >= b.total ? 'paid' : 'partial'; }));
    if (pv.supplierId) st.patch('suppliers', pv.supplierId, (s) => { s.balance = Math.max(0, (s.balance || 0) - pv.amount); });
    patch('vouchers', pvId, { status: 'executed', executedBy: me(), executedAt: ERP.now() });
    audit('PV.EXECUTED', { target: { type: 'voucher', id: pvId, label: pv.payee }, after: { amount: pv.amount } });
    return ERP.find('vouchers', pvId);
  };

  /** the full document chain of a sales order (for timelines): [{kind, id, label, status, statusKind, at}] */
  F.chainOf = function (soId) {
    const so = ERP.find('salesOrders', soId); if (!so) return [];
    const out = [{ kind: 'so', id: so.id, label: 'أمر البيع', status: so.status, at: so.createdAt }];
    if (so.approvalId) { const ap = ERP.find('approvals', so.approvalId); if (ap) out.push({ kind: 'approval', id: ap.id, label: 'الاعتماد', status: ap.status, at: ap.updatedAt }); }
    (so.woIds || []).forEach((id) => { const w = ERP.find('workOrders', id); if (w) { out.push({ kind: 'wo', id, label: 'أمر تشغيل', status: w.status, at: w.createdAt }); if (w.qcId) { const q = ERP.find('qcInspections', w.qcId); if (q) out.push({ kind: 'qc', id: q.id, label: 'فحص الجودة', status: q.result, at: q.at || q.createdAt }); } } });
    (so.dnIds || []).forEach((id) => { const d = ERP.find('deliveries', id); if (d) out.push({ kind: 'dn', id, label: 'إذن تسليم', status: d.status, at: d.deliveredAt || d.dispatchedAt || d.createdAt }); });
    (so.invoiceIds || []).forEach((id) => { const i = ERP.find('invoices', id); if (i) { out.push({ kind: 'inv', id, label: 'فاتورة', status: i.status, at: i.issueDate }); get('receipts').filter((r) => r.invoiceId === id).forEach((r) => out.push({ kind: 'rv', id: r.id, label: 'تحصيل', status: 'posted', at: r.date })); } });
    return out;
  };

  /* ═════════════════════════ 4. CHARTS (SVG/HTML, brand palette, LTR plot area) ═════════════════════════ */
  ERP.palette = ['#012864', '#345383', '#7d9cd1', '#a85a00', '#147a3d', '#8a8a8a', '#b9141b', '#c9a227'];
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, kids) => { const e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k])); (kids || []).forEach((k) => k && e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k)); return e; };
  const CH = (ERP.chart = {});
  /** columns({labels:[], series:[{name, values:[], color}], height, fmt, stacked}) — vertical columns (time series). */
  CH.columns = function (o) {
    const W = 640, H = o.height || 220, pad = { t: 14, r: 10, b: 28, l: 46 }; const n = o.labels.length; const ser = o.series;
    const max = Math.max(1, ...o.labels.map((_, i) => (o.stacked ? ser.reduce((a, x) => a + (x.values[i] || 0), 0) : Math.max(...ser.map((x) => x.values[i] || 0))))) * 1.1;
    const ih = H - pad.t - pad.b, iw = W - pad.l - pad.r, gw = iw / n, bw = o.stacked ? gw * 0.6 : (gw * 0.7) / ser.length; const fmt = o.fmt || ERP.fmt.short;
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'erp-svg', role: 'img', 'aria-label': o.title || 'رسم بياني' });
    for (let g = 0; g <= 4; g++) { const y = pad.t + ih - (ih * g) / 4; svg.appendChild(s('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'erp-grid' })); svg.appendChild(s('text', { x: pad.l - 6, y: y + 4, class: 'erp-axis', 'text-anchor': 'end' }, [fmt((max * g) / 4).replace(' ج.م', '')])); }
    o.labels.forEach((lab, i) => {
      let acc = 0; ser.forEach((x, j) => { const v = x.values[i] || 0; const bh = (v / max) * ih; const xx = pad.l + gw * i + (o.stacked ? gw * 0.2 : gw * 0.15 + bw * j); const yy = pad.t + ih - bh - (o.stacked ? (acc / max) * ih : 0); acc += v;
        const r = s('rect', { x: xx, y: yy, width: Math.max(1, bw - 2), height: Math.max(0, bh), rx: 3, fill: x.color || ERP.palette[j], class: 'erp-bar' }); r.appendChild(s('title', {}, [x.name + ' · ' + lab + ': ' + fmt(v)])); svg.appendChild(r); });
      svg.appendChild(s('text', { x: pad.l + gw * i + gw / 2, y: H - 8, class: 'erp-axis', 'text-anchor': 'middle' }, [lab]));
    });
    return h('div.erp-chart', {}, svg, ser.length > 1 || o.legend ? CH.legend(ser.map((x, j) => ({ label: x.name, color: x.color || ERP.palette[j] }))) : null);
  };
  /** line({labels, series:[{name, values, color, dashed}], height, fmt, area}) */
  CH.line = function (o) {
    const W = 640, H = o.height || 220, pad = { t: 14, r: 12, b: 28, l: 46 }; const n = o.labels.length; const fmt = o.fmt || ERP.fmt.short;
    const vals = [].concat(...o.series.map((x) => x.values.filter((v) => v != null))); const max = Math.max(1, ...vals) * 1.1; const min = o.min != null ? o.min : 0;
    const ih = H - pad.t - pad.b, iw = W - pad.l - pad.r; const X = (i) => pad.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1)); const Y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'erp-svg', role: 'img', 'aria-label': o.title || 'رسم بياني' });
    for (let g = 0; g <= 4; g++) { const v = min + ((max - min) * g) / 4; svg.appendChild(s('line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: 'erp-grid' })); svg.appendChild(s('text', { x: pad.l - 6, y: Y(v) + 4, class: 'erp-axis', 'text-anchor': 'end' }, [fmt(v).replace(' ج.م', '')])); }
    o.labels.forEach((lab, i) => { if (n > 14 && i % Math.ceil(n / 10)) return; svg.appendChild(s('text', { x: X(i), y: H - 8, class: 'erp-axis', 'text-anchor': 'middle' }, [lab])); });
    o.series.forEach((x, j) => {
      const col = x.color || ERP.palette[j]; const pts = x.values.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean); if (!pts.length) return;
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      if (o.area && j === 0) svg.appendChild(s('path', { d: d + ' L' + pts[pts.length - 1][0] + ' ' + (pad.t + ih) + ' L' + pts[0][0] + ' ' + (pad.t + ih) + ' Z', fill: col, opacity: '0.08' }));
      svg.appendChild(s('path', { d, fill: 'none', stroke: col, 'stroke-width': 2.4, 'stroke-dasharray': x.dashed ? '6 5' : '', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      pts.forEach((p, i) => { const c = s('circle', { cx: p[0], cy: p[1], r: 3, fill: '#fff', stroke: col, 'stroke-width': 2 }); c.appendChild(s('title', {}, [x.name + ' · ' + o.labels[i] + ': ' + fmt(x.values[i])])); svg.appendChild(c); });
    });
    return h('div.erp-chart', {}, svg, o.series.length > 1 ? CH.legend(o.series.map((x, j) => ({ label: x.name, color: x.color || ERP.palette[j], dashed: x.dashed }))) : null);
  };
  /** donut([{label, value, color}], {size, center, sub, fmt}) */
  CH.donut = function (data, o) {
    o = o || {}; const size = o.size || 170, r = size / 2 - 12, cx = size / 2, cy = size / 2; const tot = data.reduce((a, d) => a + d.value, 0) || 1; let a0 = -Math.PI / 2;
    const svg = s('svg', { viewBox: '0 0 ' + size + ' ' + size, class: 'erp-svg erp-donut', width: size, height: size, role: 'img', 'aria-label': o.title || 'توزيع' });
    svg.appendChild(s('circle', { cx, cy, r, fill: 'none', stroke: 'var(--color-neutral-tint)', 'stroke-width': 18 }));
    data.forEach((d, i) => { const a1 = a0 + (d.value / tot) * Math.PI * 2; if (d.value > 0) { const large = a1 - a0 > Math.PI ? 1 : 0; const p = s('path', { d: 'M' + (cx + r * Math.cos(a0)) + ' ' + (cy + r * Math.sin(a0)) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + (cx + r * Math.cos(a1 - 0.0001)) + ' ' + (cy + r * Math.sin(a1 - 0.0001)), fill: 'none', stroke: d.color || ERP.palette[i], 'stroke-width': 18 }); p.appendChild(s('title', {}, [d.label + ': ' + (o.fmt ? o.fmt(d.value) : ERP.fmt.num(d.value)) + ' (' + Math.round((d.value / tot) * 100) + '%)'])); svg.appendChild(p); } a0 = a1; });
    if (o.center != null) { svg.appendChild(s('text', { x: cx, y: cy + 2, 'text-anchor': 'middle', class: 'erp-donut-v' }, [String(o.center)])); if (o.sub) svg.appendChild(s('text', { x: cx, y: cy + 20, 'text-anchor': 'middle', class: 'erp-donut-s' }, [o.sub])); }
    return h('div.erp-donut-wrap', {}, svg, CH.legend(data.map((d, i) => ({ label: d.label, color: d.color || ERP.palette[i], value: o.fmt ? o.fmt(d.value) : ERP.fmt.num(d.value), pct: Math.round((d.value / tot) * 100) + '%' }))));
  };
  CH.legend = (items) => h('ul.erp-legend', {}, items.map((it) => h('li', {}, h('i', { style: { background: it.dashed ? 'transparent' : it.color, borderColor: it.color } }), h('span', {}, it.label), it.value ? h('b.num', {}, it.value) : null, it.pct ? h('small.num', {}, it.pct) : null)));
  /** horizontal bars (HTML, RTL-friendly): bars([{label, value, sub, color, href}], {fmt, max}) */
  CH.bars = function (data, o) {
    o = o || {}; const max = o.max || Math.max(1, ...data.map((d) => d.value)); const fmt = o.fmt || ERP.fmt.num;
    return h('div.erp-hbars', {}, data.map((d, i) => h(d.href ? 'a.erp-hbar' : 'div.erp-hbar', d.href ? { href: d.href } : {}, h('span.erp-hbar-l', {}, d.label, d.sub ? h('small', {}, d.sub) : null), h('span.erp-hbar-t', {}, h('i', { style: { width: Math.max(1.5, (d.value / max) * 100) + '%', background: d.color || (o.color || ERP.palette[0]) } })), h('b.erp-hbar-v.num', {}, fmt(d.value)))));
  };
  /** spark(values, {w, h, color}) — tiny trend line */
  CH.spark = function (values, o) {
    o = o || {}; const W = o.w || 96, H = o.h || 28; const max = Math.max(...values), min = Math.min(...values); const X = (i) => (W * i) / Math.max(1, values.length - 1); const Y = (v) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6);
    return s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'erp-spark', 'aria-hidden': 'true' }, [s('path', { d: values.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' '), fill: 'none', stroke: o.color || ERP.palette[0], 'stroke-width': 2, 'stroke-linecap': 'round' })]);
  };
  /** gauge(0..1, {label, size, tone:'auto|success|warning|danger', target}) — semicircle (OEE, utilisation) */
  CH.gauge = function (v, o) {
    o = o || {}; const size = o.size || 150, r = size / 2 - 12, cx = size / 2, cy = size / 2 + 4; v = Math.max(0, Math.min(1, v || 0));
    const tone = o.tone && o.tone !== 'auto' ? o.tone : v >= (o.good || 0.85) ? 'success' : v >= (o.warn || 0.65) ? 'warning' : 'danger';
    const col = { success: 'var(--color-success)', warning: 'var(--color-warning)', danger: 'var(--color-danger)', primary: 'var(--eg-navy)' }[tone];
    const arc = (a) => [cx - r * Math.cos(a * Math.PI), cy - r * Math.sin(a * Math.PI)];
    const p0 = arc(0), p1 = arc(v), pe = arc(1);
    const svg = s('svg', { viewBox: '0 0 ' + size + ' ' + (size / 2 + 22), width: size, class: 'erp-svg erp-gauge', role: 'img', 'aria-label': (o.label || '') + ' ' + Math.round(v * 100) + '%' }, [
      s('path', { d: 'M' + p0[0] + ' ' + p0[1] + ' A' + r + ' ' + r + ' 0 0 1 ' + pe[0] + ' ' + pe[1], fill: 'none', stroke: 'var(--color-neutral-tint)', 'stroke-width': 14, 'stroke-linecap': 'round' }),
      v > 0 ? s('path', { d: 'M' + p0[0] + ' ' + p0[1] + ' A' + r + ' ' + r + ' 0 0 1 ' + p1[0] + ' ' + p1[1], fill: 'none', stroke: col, 'stroke-width': 14, 'stroke-linecap': 'round' }) : null,
      s('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', class: 'erp-gauge-v' }, [Math.round(v * 100) + '%'])
    ]);
    return h('div.erp-gauge-wrap', {}, svg, o.label ? h('span.erp-gauge-l', {}, o.label) : null);
  };
  /** meter(0..1, {label, tone, text}) — slim progress bar */
  CH.meter = function (v, o) { o = o || {}; v = Math.max(0, Math.min(1, v || 0)); const tone = o.tone || (v >= 0.85 ? 'success' : v >= 0.6 ? 'warning' : 'danger'); return h('div.erp-meter.is-' + tone, { role: 'meter', 'aria-valuenow': Math.round(v * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': o.label || '' }, o.label ? h('span.erp-meter-l', {}, o.label, h('b.num', {}, o.text || Math.round(v * 100) + '%')) : null, h('span.erp-meter-t', {}, h('i', { style: { width: v * 100 + '%' } }))); };
  /** funnel([{label, value, sub}]) */
  CH.funnel = function (stages, o) { o = o || {}; const max = Math.max(1, ...stages.map((x) => x.value)); return h('div.erp-funnel', {}, stages.map((x, i) => h('div.erp-funnel-row', {}, h('span.erp-funnel-l', {}, x.label), h('span.erp-funnel-t', {}, h('i', { style: { width: Math.max(8, (x.value / max) * 100) + '%', background: ERP.palette[Math.min(i, 3)] } }, h('b.num', {}, o.fmt ? o.fmt(x.value) : ERP.fmt.num(x.value)))), x.sub ? h('small.erp-funnel-s', {}, x.sub) : null))); };

  /* ═════════════════════════ 5. SHARED UI ═════════════════════════ */
  const U = (ERP.ui = {});
  U.status = (kind, status) => SA.statusChip(kind, status);
  U.docLink = (id, label) => { const r = ERP.route(id); return r ? h('a.erp-doc.num', { href: '#/' + r }, label || id) : h('span.num', {}, id || '—'); };
  U.swatch = (code) => { const f = ERP.finish(code); return h('span.erp-swatch', { title: f ? f.code + ' — ' + f.name : code, style: { background: f ? f.hex : '#ddd' } }); };
  U.itemCell = (itemId) => { const it = ERP.item(itemId); if (!it) return h('span', {}, itemId || '—'); return h('span.erp-item', {}, it.attrs && it.attrs.color ? U.swatch(it.attrs.color) : h('span.erp-item-ico', {}, SA.icon(it.kind === 'fg' ? 'box' : it.kind === 'spare' ? 'wrench' : 'layers', 'icon-sm')), h('span', {}, h('b', {}, it.name), h('small.num', {}, it.code))); };
  U.money = (n) => h('span.num.erp-money', {}, ERP.fmt.money(n));
  /** internal cost / margin — hidden unless data.cost.view (بند 25 Approved) */
  U.cost = (n, key) => (SA.canSensitive(key || 'data.cost.view') ? U.money(n) : h('span.erp-locked', { title: 'بيانات سرية — تحتاج صلاحية ' + (key || 'data.cost.view') }, SA.icon('lock', 'icon-sm'), 'سري'));
  U.canCost = () => SA.canSensitive('data.cost.view');
  U.canProfit = () => SA.canSensitive('data.profit.view');
  U.demo = (text) => h('span.erp-demo', { title: 'بيانات تجريبية للعرض — تحتاج اعتماد التشغيل' }, SA.icon('info', 'icon-sm'), text || 'بيانات تجريبية');
  U.kpis = (list) => h('div.sap-grid-cards.erp-kpis', {}, list.filter(Boolean));
  /** KPI card with optional trend: kpi({label, value, sub, href, trend:[], delta:+0.12, tone, icon}) */
  U.kpi = function (o) {
    const d = o.delta; const dTone = d == null ? '' : (o.inverse ? -d : d) >= 0 ? 'is-up' : 'is-down';
    return h((o.href ? 'a' : 'div') + '.card.erp-kpi' + (o.tone ? '.is-' + o.tone : ''), o.href ? { href: o.href } : {},
      h('div.erp-kpi-top', {}, o.icon ? h('span.erp-kpi-ico', {}, SA.icon(o.icon, 'icon-sm')) : null, h('span.erp-kpi-l', {}, o.label)),
      h('div.erp-kpi-mid', {}, h('b.erp-kpi-v.num', {}, o.value), o.trend && o.trend.length > 1 ? CH.spark(o.trend, { color: o.tone === 'danger' ? 'var(--color-danger)' : undefined }) : null),
      h('div.erp-kpi-bot', {}, d != null ? h('span.erp-delta.' + dTone, {}, (d >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(d * 100)) + '%') : null, o.sub ? h('small', {}, o.sub) : null));
  };
  /** AI insight card (used by every dashboard; content may come from ERP.ai.insights(area) when mod-ai is loaded) */
  U.aiCard = function (o) {
    return h('div.erp-ai-card.is-' + (o.tone || 'info'), {}, h('span.erp-ai-badge', {}, SA.icon('sparkle', 'icon-sm'), 'AI'), h('div.erp-ai-body', {}, h('b', {}, o.title), o.text ? h('p', {}, o.text) : null,
      o.actions && o.actions.length ? h('div.erp-ai-acts', {}, o.actions.map((a) => h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: a.onClick || (() => SA.nav(a.route)) }, a.label))) : null));
  };
  U.insights = (area, max) => { const list = ERP.ai && ERP.ai.insights ? ERP.ai.insights(area) : []; return list.slice(0, max || 3).map((x) => U.aiCard(x)); };
  /** horizontal document chain for a sales order: SO → اعتماد → WO → QC → DN → INV → RV */
  U.chain = function (soId) {
    const items = F.chainOf(soId); const KIND = { so: 'so', approval: 'approval', wo: 'wo', qc: 'qc', dn: 'dn', inv: 'inv' };
    return h('ol.erp-chain', { 'aria-label': 'دورة المستند' }, items.map((x) => { const sk = KIND[x.kind]; const m = sk ? (SA.catalog.status[sk] || {})[x.status] : null; const tone = x.kind === 'rv' ? 'success' : m ? m[1] : 'neutral';
      return h('li.erp-chain-step.is-' + tone, {}, h('span.erp-chain-dot'), h('div', {}, h('small', {}, x.label), U.docLink(x.id), h('em', {}, x.kind === 'rv' ? 'مُرحّل' : m ? m[0] : x.status), h('time', {}, x.at ? SA.fmt.rel(x.at) : ''))); }));
  };
  /** section header used inside cards */
  U.sub = (title, extra) => h('div.erp-sub', {}, h('h3', {}, title), extra || null);
  /** two/three column responsive grid */
  U.grid = (cols, ...kids) => h('div.erp-grid.erp-grid-' + cols, {}, kids);
  /** current dealer customer for the portal (dealer user.customerId, else a demo dealer for owner preview) */
  ERP.portalCustomerId = () => { const u = SA.session.user; return (u && u.customerId) || 'C-001'; };
})();
