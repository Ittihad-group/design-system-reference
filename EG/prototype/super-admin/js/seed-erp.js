/* EG ERP prototype — seed-erp.js  (owned by the lead). Wraps SA.seed.build: base Super Admin + HR state → + ERP master & transactional data → + module seed hooks (ERP.addSeed).
   Everything is DEMO data for the owner presentation: realistic WPC/PVC plant assumptions (lines, BOMs, prices, costs) — to be confirmed with the factory.

   ERP COLLECTIONS (shapes are documented in erp-core.js next to each flow function):
   items[]            { id:'IT-D101-90-C132', code, name, kind:'fg|rm|pkg|acc|spare', family:'door|clad|foam|acc|rm|pkg|spare', productId, attrs:{model,width,height,color,thickness,size}, uom, price (list, EGP), stdCost, reorderPoint, moq, leadDays, supplierId, bomId, weightKg, areaM2 }
   products[]         { id:'PRD-D101', family, name, model, sizes:[], colors:[], image, desc, specs:[[k,v]], active }       (catalog templates for portal/website)
   boms[] · lines[] · machines[] · stock[] · stockMoves[] · accounts[] · journal[] · banks[]
   salesOrders[] · quotations[] · leads[] · activities[] · workOrders[] · qcInspections[] · ncrs[] · purchaseRequisitions[] · purchaseOrders[] · grns[] · bills[] · vouchers[]
   deliveries[] · shipments[] · vehicles[] · invoices[] · receipts[] · cheques[] · tickets[] · maintenanceOrders[] · downtime[] · events[] · prodDaily[] · targets[]
*/
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP;
  const base = SA.seed.build;
  const MIN = 60000, DAY = 86400000;
  const ago = (min) => new Date(Date.now() - min * MIN).toISOString();
  const dAgo = (days, hour) => { const d = new Date(Date.now() - days * DAY); d.setHours(hour == null ? 10 : hour, Math.floor((days * 37) % 60), 0, 0); return d.toISOString(); };
  const day = (off) => ERP.day(off);
  /* deterministic RNG so every reset gives the same demo */
  let seedN = 20261106; const rnd = () => { seedN |= 0; seedN = (seedN + 0x6d2b79f5) | 0; let t = Math.imul(seedN ^ (seedN >>> 15), 1 | seedN); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const round = (n, s) => Math.round(n / (s || 1)) * (s || 1);

  function buildErp(S) {
    seedN = 20261106;
    const seq = {}; const no = (p, n, pad) => { seq[p] = Math.max(seq[p] || 0, n); return p + '-' + new Date().getFullYear() + '-' + String(n).padStart(pad || 4, '0'); };
    const nextNo = (p, pad) => no(p, (seq[p] || 0) + 1, pad);

    /* ── fix base data to the real business (WPC/PVC, not aluminium/glass) ── */
    S.settings.company.nameAr = 'المصرية الألمانية لتصنيع منتجات WPC & PVC';
    S.settings.company.nameEn = 'Egyptian-German for WPC & PVC Products';
    S.settings.company.address = 'الدقهلية، جمصة، المنطقة الصناعية — المرحلة الثالثة';
    S.settings.company.phone = '15536'; S.settings.company.email = 'contact@egerman-upvc.com'; S.settings.company.website = 'https://egerman-upvc.com';
    const dep = (id, name, managerId, parentId) => { const d = S.departments.find((x) => x.id === id); if (d) { d.name = name; if (managerId) d.managerId = managerId; } else S.departments.push({ id, name, managerId: managerId || null, parentId: parentId || null, active: true }); };
    dep('D-05', 'الإنتاج'); dep('D-09', 'خط بثق الأبواب'); dep('D-10', 'خط التجاليد WPC'); dep('D-11', 'اللامينيشن والتجميع'); dep('D-12', 'الصيانة', 'U-31');
    dep('D-14', 'الجودة', 'U-15', null); dep('D-15', 'الشحن واللوجستيات', 'U-30', null); dep('D-16', 'خدمة العملاء', 'U-32', null); dep('D-17', 'التسويق والمعارض', 'U-33', null); dep('D-18', 'خط الفوم بورد', 'U-13', 'D-05');
    (S.positions || []).forEach((p) => { if (p.title === 'فني دهان') p.title = 'فني لامينيشن'; });
    const ren = (id, name, extra) => { const x = S.suppliers.find((s) => s.id === id); if (x) Object.assign(x, { name }, extra || {}); };
    ren('S-001', 'الشركة المصرية للبتروكيماويات — راتنج PVC', { type: 'raw', termsDays: 30, rating: 4.6, category: 'راتنج PVC', country: 'مصر' });
    ren('S-002', 'شركة الإكسسوارات الحديثة', { termsDays: 45, rating: 4.1, category: 'كوالين ومفصلات', country: 'مصر' });
    ren('S-003', 'مطاحن الدلتا لدقيق الخشب', { type: 'raw', termsDays: 30, rating: 3.8, category: 'دقيق خشب', country: 'مصر' });
    ren('S-004', 'المتحدة للإضافات الكيماوية', { type: 'raw', termsDays: 60, rating: 4.3, category: 'مثبتات وإضافات', country: 'مصر' });
    ren('S-005', 'ورشة الفواصل والمقابض', { termsDays: 30, rating: 2.9, category: 'إكسسوارات', country: 'مصر' });
    ren('S-006', 'شركة العبوات والتغليف', { termsDays: 30, rating: 4.0, category: 'تغليف', country: 'مصر' });
    S.suppliers.push(
      { id: 'S-007', code: 'SUP-007', name: 'كربونات سيناء للتعدين', type: 'raw', contacts: [{ name: 'م. حاتم سليم', phone: '+20 100 100 0007' }], paymentTerms: null, termsDays: 30, status: 'active', balance: 0, openPOs: 0, rating: 4.4, category: 'كربونات كالسيوم', country: 'مصر' },
      { id: 'S-008', code: 'SUP-008', name: 'ديكور فويل — مستورد (ألمانيا)', type: 'raw', contacts: [{ name: 'Mr. Klaus Weber', phone: '+49 30 0000 0008' }], paymentTerms: null, termsDays: 60, status: 'active', balance: 0, openPOs: 0, rating: 4.7, category: 'فويل لامينيشن', country: 'ألمانيا', importLeadDays: 35 },
      { id: 'S-009', code: 'SUP-009', name: 'ألوان الشرق للماستر باتش', type: 'raw', contacts: [{ name: 'أ. شيرين فهمي', phone: '+20 100 100 0009' }], paymentTerms: null, termsDays: 45, status: 'active', balance: 0, openPOs: 0, rating: 4.2, category: 'ماستر باتش', country: 'مصر' },
      { id: 'S-010', code: 'SUP-010', name: 'الهندسية لقطع غيار الماكينات', type: 'spares', contacts: [{ name: 'م. رامي عزمي', phone: '+20 100 100 0010' }], paymentTerms: null, termsDays: 30, status: 'active', balance: 0, openPOs: 0, rating: 3.9, category: 'قطع غيار', country: 'مصر' }
    );
    S.suppliers.forEach((s) => { s.balance = 0; s.openPOs = 0; });
    // customers: business-correct names + CRM fields
    const cx = (id, o) => { const c = S.customers.find((x) => x.id === id); if (c) Object.assign(c, o); };
    cx('C-001', { name: 'معرض النيل للأبواب والديكور', segment: 'dealer', region: 'القاهرة الكبرى', creditLimit: 900000, termsDays: 30, tier: 'A', since: '2019' });
    cx('C-002', { segment: 'contractor', region: 'القاهرة الكبرى', creditLimit: 900000, termsDays: 45, tier: 'A', since: '2021' });
    cx('C-003', { segment: 'dealer', region: 'الإسكندرية', creditLimit: 250000, termsDays: 30, tier: 'B', since: '2020' });
    cx('C-004', { segment: 'contractor', region: 'الصعيد', creditLimit: 350000, termsDays: 45, tier: 'B', since: '2022' });
    cx('C-005', { segment: 'dealer', region: 'القاهرة الكبرى', creditLimit: 200000, termsDays: 30, tier: 'B', since: '2023' });
    cx('C-006', { segment: 'direct', region: 'القاهرة الكبرى', creditLimit: 0, termsDays: 0, tier: 'C', since: '2025' });
    cx('C-007', { segment: 'contractor', region: 'الدلتا', creditLimit: 300000, termsDays: 45, tier: 'B', since: '2021' });
    cx('C-008', { segment: 'dealer', region: 'الدلتا', creditLimit: 220000, termsDays: 30, tier: 'B', since: '2018' });
    cx('C-009', { name: 'العدس للتجارة — سلطنة عُمان (وكيل)', city: 'مسقط', segment: 'export', region: 'الخليج', country: 'OM', export: true, creditLimit: 1500000, termsDays: 60, tier: 'A', since: '2024' });
    cx('C-010', { segment: 'direct', region: 'القاهرة الكبرى', creditLimit: 0, termsDays: 0, tier: 'C', since: '2023' });
    S.customers.push(
      { id: 'C-011', code: 'CUS-011', name: 'المعمار الحديث للمقاولات', type: 'contractor', city: 'القاهرة الجديدة', contacts: [{ name: 'م. يوسف الشناوي', phone: '+20 100 000 0011' }], salesRepId: 'U-10', priceListId: 'PL-03', status: 'active', balance: 0, openOrders: 0, segment: 'contractor', region: 'القاهرة الكبرى', creditLimit: 700000, termsDays: 45, tier: 'A', since: '2024' },
      { id: 'C-012', code: 'CUS-012', name: 'معرض الأمل — دمياط', type: 'dealer', city: 'دمياط', contacts: [{ name: 'أ. رضا الأمل', phone: '+20 100 000 0012' }], salesRepId: 'U-11', priceListId: 'PL-02', status: 'active', balance: 0, openOrders: 0, segment: 'dealer', region: 'الدلتا', creditLimit: 180000, termsDays: 30, tier: 'B', since: '2022' },
      { id: 'C-013', code: 'CUS-013', name: 'مستشفى المنصورة الدولي (مشروع وحدات طبية)', type: 'direct', city: 'المنصورة', contacts: [{ name: 'م. هالة البدري', phone: '+20 100 000 0013' }], salesRepId: 'U-05', priceListId: 'PL-03', status: 'active', balance: 0, openOrders: 0, segment: 'project', region: 'الدلتا', creditLimit: 500000, termsDays: 60, tier: 'A', since: '2026' },
      { id: 'C-014', code: 'CUS-014', name: 'مجموعة الريادة للتطوير العقاري', type: 'contractor', city: 'العلمين الجديدة', contacts: [{ name: 'م. كريم عبد السلام', phone: '+20 100 000 0014' }], salesRepId: 'U-10', priceListId: 'PL-03', status: 'active', balance: 0, openOrders: 0, segment: 'contractor', region: 'الساحل', creditLimit: 1200000, termsDays: 60, tier: 'A', since: '2025' }
    );
    S.customers.forEach((c) => { c.balance = 0; });
    S.priceLists.forEach((p) => { p.factor = p.id === 'PL-01' ? 1 : p.id === 'PL-02' ? 0.86 : p.id === 'PL-03' ? 0.9 : 0.84; p.demo = true; });
    S.warehouses.forEach((w) => { if (w.id === 'W-04') { w.name = 'صالة عرض المصنع — جمصة'; w.active = true; w.hasStock = true; } });
    S.warehouses.push({ id: 'W-05', code: 'WH-SP', name: 'مخزن قطع الغيار', type: 'SP', managerId: 'U-31', active: true, hasStock: true }, { id: 'W-06', code: 'WH-QRT', name: 'منطقة الحجر (عدم مطابقة)', type: 'QRT', managerId: 'U-15', active: true, hasStock: true });
    S.modules.forEach((m) => { if (m.key === 'quality') { m.enabled = true; m.phase = 'v1'; m.note = 'مفعّل في الديمو — قرار الإدخال في v1 Pending (بند 34)'; } if (m.key === 'hr') m.note = 'مفعّل'; });
    S.modules.push(
      { key: 'exec', nameAr: 'لوحة القيادة والذكاء الاصطناعي', enabled: true, locked: false, phase: 'v1', note: 'جديد' }, { key: 'crm', nameAr: 'CRM', enabled: true, locked: false, phase: 'v1', note: 'جديد' },
      { key: 'logistics', nameAr: 'التسليم والشحن', enabled: true, locked: false, phase: 'v1', note: 'جديد' }, { key: 'care', nameAr: 'الدعم والصيانة', enabled: true, locked: false, phase: 'v1', note: 'جديد' },
      { key: 'expo', nameAr: 'المعارض والفعاليات', enabled: true, locked: false, phase: 'v1', note: 'جديد' }, { key: 'portal', nameAr: 'بوابة التاجر', enabled: true, locked: false, phase: 'v1', note: 'Approved (بند 26)' }
    );
    // numbering for the new documents
    const num = (type, labelAr, prefix) => ({ type, labelAr, prefix, format: 'PREFIX-YYYY-NNNN', pad: 4, includeYear: true, yearlyReset: true, last: 0, issued: 0, locked: false, source: 'ERP (جديد)', tag: 'new' });
    [['QC', 'فحص جودة', 'QC'], ['NCR', 'عدم مطابقة', 'NCR'], ['GRN', 'إذن استلام', 'GRN'], ['PRQ', 'طلب شراء داخلي', 'PRQ'], ['SH', 'شحنة', 'SH'], ['BILL', 'فاتورة مورد', 'BILL'], ['JE', 'قيد يومية', 'JE'], ['TKT', 'تذكرة عميل', 'TKT'], ['MWO', 'أمر صيانة', 'MWO'], ['EV', 'معرض/فعالية', 'EV'], ['LD', 'عميل محتمل', 'LD'], ['CHQ', 'شيك', 'CHQ']].forEach((n) => { if (!S.settings.numbering.some((x) => x.prefix === n[2])) S.settings.numbering.push(num(n[0], n[1], n[2])); });

    /* ── roles & users for the new personas ── */
    const R = SA.rbac; const keys = (app, list) => list.map((k) => app + '.' + k);
    const all = (app) => SA.catalog.erpKeys(app);
    const M = (map) => { const m = {}; SA.catalog.resources.forEach((r) => { m[r.id] = R.row(map[r.id] || ''); }); return m; };
    const role = (id) => S.roles.find((r) => r.id === id);
    const addKeys = (id, list) => { const r = role(id); if (!r || r.sa[0] === '*') return; list.forEach((k) => { if (r.sa.indexOf(k) < 0) r.sa.push(k); }); };
    role('R-01').homeApp = 'exec'; role('R-01').matrix = M(Object.fromEntries(SA.catalog.resources.map((r) => [r.id, 'vcedax'])));
    const gmKeys = all('exec').concat(keys('crm', ['dashboard.view', 'leads.view', 'pipeline.view', 'quotes.view', 'quotes.approve', 'orders.view', 'customers.view', 'targets.view', 'reports.view', 'reports.export']), keys('mfg', ['dashboard.view', 'planning.view', 'workorders.view', 'shopfloor.view', 'lines.view', 'quality.view', 'qc.view', 'ncr.view', 'ncr.approve', 'capa.view', 'certs.view']),
      keys('scm', ['dashboard.view', 'po.view', 'po.approve', 'requisitions.view', 'stock.view', 'moves.view', 'deliveries.view', 'shipments.view', 'suppliers.view']), keys('fin', ['dashboard.view', 'invoices.view', 'receipts.view', 'aging.view', 'bills.view', 'vouchers.view', 'banks.view', 'statements.view', 'statements.export', 'costing.view', 'budgets.view', 'cheques.view']),
      keys('care', ['dashboard.view', 'tickets.view', 'maintenance.view', 'assets.view', 'warranty.view', 'warranty.approve']), keys('expo', ['events.view', 'events.approve', 'calendar.view', 'roi.view']));
    addKeys('R-02', gmKeys); role('R-02').homeApp = 'exec';
    role('R-02').matrix = M({ sales: 'vax', customers: 'vx', products: 'v', inventory: 'vx', manufacturing: 'vax', purchasing: 'vax', finance: 'vax', hr: 'v', quality: 'vax', logistics: 'v', maintenance: 'v', support: 'v', events: 'va' });
    addKeys('R-03', all('crm').concat(keys('expo', ['events.view', 'calendar.view', 'roi.view', 'leads.capture']), keys('scm', ['stock.view', 'deliveries.view']), keys('care', ['tickets.view']), ['exec.ai.use'])); role('R-03').homeApp = 'crm';
    addKeys('R-04', keys('crm', ['dashboard.view', 'leads.view', 'leads.create', 'leads.edit', 'pipeline.view', 'activities.view', 'activities.create', 'quotes.view', 'quotes.create', 'quotes.edit', 'orders.view', 'orders.create', 'orders.edit', 'dealer_orders.view', 'dealer_orders.review', 'customers.view', 'targets.view']).concat(['scm.stock.view', 'expo.leads.capture', 'exec.ai.use'])); role('R-04').homeApp = 'crm';
    addKeys('R-05', all('mfg').concat(keys('scm', ['stock.view', 'moves.view', 'requisitions.view', 'requisitions.create', 'po.view']), keys('care', ['dashboard.view', 'maintenance.view', 'maintenance.create', 'assets.view', 'pm.view']), keys('crm', ['orders.view']), ['exec.ai.use', 'exec.insights.view', 'sa.approvals.view', 'sa.approvals.approve'])); role('R-05').homeApp = 'mfg'; role('R-05').sensitive = ['data.cost.view'];
    addKeys('R-06', keys('scm', ['dashboard.view', 'stock.view', 'stock.adjust', 'stock.export', 'moves.view', 'grn.view', 'grn.create', 'transfers.view', 'transfers.create', 'counts.view', 'counts.create', 'deliveries.view', 'deliveries.create', 'deliveries.dispatch', 'dispatch.view', 'requisitions.view', 'requisitions.create', 'po.view']).concat(['mfg.workorders.view', 'care.spares.view'])); role('R-06').homeApp = 'scm';
    addKeys('R-07', all('fin').filter((k) => k !== 'fin.coa.edit').concat(keys('crm', ['orders.view', 'customers.view']), keys('scm', ['po.view', 'grn.view', 'deliveries.view']))); role('R-07').homeApp = 'fin';
    addKeys('R-08', keys('scm', ['dashboard.view', 'requisitions.view', 'requisitions.create', 'requisitions.approve', 'rfq.view', 'rfq.create', 'po.view', 'po.create', 'suppliers.view', 'suppliers.edit', 'grn.view', 'stock.view', 'moves.view']).concat(['mfg.mrp.view', 'care.spares.view', 'exec.ai.use'])); role('R-08').homeApp = 'scm';
    Object.assign(role('R-09'), { description: 'الفحوص وعدم المطابقة والإجراءات التصحيحية والشهادات. موديول الجودة مفعّل في الديمو (بند 34 Pending).', homeApp: 'mfg', matrix: M({ quality: 'vcea', manufacturing: 'v', inventory: 'v', purchasing: 'v' }) });
    addKeys('R-09', keys('mfg', ['dashboard.view', 'quality.view', 'qc.view', 'qc.inspect', 'ncr.view', 'ncr.create', 'ncr.approve', 'capa.view', 'capa.edit', 'certs.view', 'certs.edit', 'workorders.view', 'bom.view', 'lines.view']).concat(['scm.grn.view', 'scm.stock.view', 'care.tickets.view', 'exec.ai.use']));
    addKeys('R-10', keys('care', ['dashboard.view', 'it.view', 'it.create', 'it.edit']));
    const mk = (id, nameAr, desc, homeApp, sa, sensitive, matrix, scope) => S.roles.push({ id, nameAr, nameEn: nameAr, description: desc, isSystem: true, isProtected: false, isNew: true, tag: 'new', status: 'active', version: 1, homeApp, matrix: M(matrix || {}), scope: scope || {}, sensitive: sensitive || [], sa, createdAt: ago(60 * 24 * 30), updatedAt: ago(60 * 24 * 3) });
    mk('R-17', 'Logistics Manager', 'أذون التسليم وتخطيط الرحلات والأسطول والتصدير.', 'scm', keys('scm', ['dashboard.view', 'deliveries.view', 'deliveries.create', 'deliveries.dispatch', 'dispatch.view', 'dispatch.edit', 'shipments.view', 'shipments.create', 'shipments.edit', 'fleet.view', 'fleet.edit', 'stock.view']).concat(['crm.orders.view', 'care.tickets.view', 'exec.ai.use']), [], { logistics: 'vcex', inventory: 'v', sales: 'v' }, { logistics: 'all' });
    mk('R-18', 'Maintenance Manager', 'الأعطال والصيانة الوقائية وقطع الغيار وسجل الماكينات.', 'care', keys('care', ['dashboard.view', 'assets.view', 'assets.edit', 'maintenance.view', 'maintenance.create', 'maintenance.edit', 'maintenance.close', 'pm.view', 'pm.edit', 'spares.view', 'spares.edit']).concat(['mfg.lines.view', 'mfg.shopfloor.view', 'mfg.dashboard.view', 'scm.requisitions.view', 'scm.requisitions.create', 'scm.stock.view', 'exec.ai.use']), ['data.cost.view'], { maintenance: 'vcedx', manufacturing: 'v' });
    mk('R-19', 'Customer Service', 'شكاوى العملاء والتجار ومطالبات الضمان وزيارات التركيب.', 'care', keys('care', ['dashboard.view', 'tickets.view', 'tickets.create', 'tickets.edit', 'tickets.close', 'warranty.view', 'visits.view', 'visits.create', 'visits.edit']).concat(['crm.customers.view', 'crm.orders.view', 'scm.deliveries.view', 'mfg.qc.view', 'exec.ai.use']), [], { support: 'vcex', sales: 'v', customers: 'v' }, { support: 'all' });
    mk('R-20', 'Marketing & Events', 'المعارض والفعاليات وتسجيل زوار الجناح وتحويلهم للمبيعات.', 'expo', all('expo').concat(keys('crm', ['dashboard.view', 'leads.view', 'leads.create', 'leads.edit', 'pipeline.view', 'reports.view']), ['exec.ai.use']), [], { events: 'vcea', sales: 'v' });
    mk('R-21', 'تاجر معتمد (بوابة)', 'حساب خارجي منفصل عن RBAC الداخلي (بند 34): يرى أسعاره وطلباته وفواتيره فقط.', 'portal', all('portal'), [], {});
    mk('R-22', 'Finance Manager', 'المدير المالي: يعتمد سندات الصرف وأوامر الشراء ويرى التكاليف والأرباح.', 'fin', all('fin').concat(keys('scm', ['po.view', 'dashboard.view']), keys('crm', ['orders.view', 'customers.view', 'reports.view']), ['exec.dashboard.view', 'exec.insights.view', 'exec.ai.use', 'exec.reports.view', 'sa.approvals.view', 'sa.approvals.approve', 'sa.policies.finance.view', 'sa.policies.finance.edit']), ['data.cost.view', 'data.profit.view', 'finance.voucher.approve', 'finance.reports.export'], { finance: 'vceax', purchasing: 'va', sales: 'v' }, { finance: 'all' });
    role('R-07').sensitive = Array.from(new Set((role('R-07').sensitive || []).concat(['finance.voucher.create', 'finance.voucher.execute'])));

    const U = (id, name, login, roleId, dept, mgr, o) => Object.assign({ id, name, email: login + '@eg-demo.test', phone: '+20 100 300 ' + id.slice(2).padStart(4, '0'), roleId, departmentId: dept, managerId: mgr, warehouseIds: [], status: 'active', mfa: false, locale: 'ar', jobTitle: '', lastLogin: ago(between(30, 600)), createdAt: ago(60 * 24 * 60), createdBy: 'U-01', persona: null, failed: 0 }, o);
    const usr = (id) => S.users.find((u) => u.id === id);
    if (usr('U-13')) Object.assign(usr('U-13'), { persona: 'prod', departmentId: 'D-05' });
    if (usr('U-14')) usr('U-14').persona = 'buyer';
    if (usr('U-15')) Object.assign(usr('U-15'), { persona: 'qc', departmentId: 'D-14', jobTitle: 'مسؤول الجودة' });
    if (usr('U-27')) usr('U-27').jobTitle = 'مشرف خط بثق الأبواب';
    S.users.push(
      U('U-30', 'محمد الشربيني', 'logistics', 'R-17', 'D-15', 'U-03', { persona: 'logistics', jobTitle: 'مدير الشحن واللوجستيات' }),
      U('U-31', 'م. أحمد البنا', 'maintenance', 'R-18', 'D-12', 'U-13', { persona: 'maint', jobTitle: 'مدير الصيانة' }),
      U('U-32', 'سارة حمدي', 'care', 'R-19', 'D-16', 'U-04', { persona: 'cs', jobTitle: 'مسؤولة خدمة العملاء' }),
      U('U-33', 'ندى عصام', 'marketing', 'R-20', 'D-17', 'U-03', { persona: 'marketing', jobTitle: 'مديرة التسويق والمعارض' }),
      U('U-34', 'م. سامي ناجي', 'dealer', 'R-21', null, null, { persona: 'dealer', jobTitle: 'معرض النيل للأبواب والديكور', customerId: 'C-001', external: true }),
      U('U-35', 'أ. إيهاب منصور', 'cfo', 'R-22', 'D-03', 'U-03', { persona: 'cfo', mfa: true, jobTitle: 'المدير المالي' })
    );
    S.users.forEach((u) => { if (!S.creds[u.id]) S.creds[u.id] = 'Demo@1234'; });

    /* ── items ── */
    const items = []; const products = [];
    const DOOR_PRICE = { 80: 7100, 90: 7600, 100: 8150, 110: 8700 };
    const DOORS = [['D101', [[90, 'C132'], [100, 'C132'], [80, 'C021']]], ['D103', [[90, 'C102'], [100, 'C182']]], ['D104', [[90, 'C173']]], ['D105', [[100, 'C3003']]], ['D107', [[90, 'C021'], [100, 'C160']]], ['D108', [[90, 'C115']]], ['D110', [[90, 'C102']]], ['D112', [[100, 'C198']]], ['D114', [[90, 'C132']]], ['D115', [[100, 'C115'], [110, 'C091']]]];
    const ALLC = ERP.finishes.map((f) => f.code);
    DOORS.forEach((d) => {
      products.push({ id: 'PRD-' + d[0], family: 'door', model: d[0], name: 'باب WPC & PVC موديل ' + d[0], sizes: [80, 90, 100, 110], colors: ALLC, priceFrom: DOOR_PRICE[80], desc: 'ضلفة قطعة واحدة بدون حشوات · سُمك 4.5 سم · طبقة لون UPVC · مقاوم للماء والحشرات ولا يحتاج دهان.', specs: [['الارتفاع', '215 سم'], ['العروض', '80 / 90 / 100 / 110 سم'], ['سُمك الضلفة', '4.5 سم'], ['الطبقة', 'UPVC ملون'], ['الضمان', 'تجريبي — يُحدد من المبيعات']], active: true });
      d[1].forEach((v) => { const w = v[0], c = v[1]; const price = DOOR_PRICE[w]; items.push({ id: 'IT-' + d[0] + '-' + w + '-' + c, code: d[0] + '-' + w + '-' + c, name: 'باب ' + d[0] + ' — ' + w + '×215 — ' + c, kind: 'fg', family: 'door', productId: 'PRD-' + d[0], attrs: { model: d[0], width: w, height: 215, color: c }, uom: 'pcs', price, stdCost: round(price * 0.61, 10), reorderPoint: 20, moq: 10, leadDays: 3, bomId: 'BOM-DOOR', weightKg: 28 + (w - 80) * 0.25 }); });
    });
    products.push({ id: 'PRD-K71', family: 'clad', model: 'K71', name: 'تجاليد WPC بديل الخشب K71', sizes: ['17×280 سم'], colors: ['K71-1', 'K71-2', 'K71-3', 'K71-4', 'K71-5'], priceFrom: 250, desc: 'تجاليد حوائط وأسقف بديل الخشب — عزل حراري وصوتي، سهلة التركيب.', specs: [['المقاس', '17 × 280 سم'], ['المساحة', '0.476 م² للقطعة'], ['الأكواد', 'K71-1 … K71-5']], active: true });
    const CLAD_C = [['K71-1', 'C132'], ['K71-2', 'C160'], ['K71-3', 'C198'], ['K71-4', 'C102'], ['K71-5', 'C021']];
    CLAD_C.forEach((k) => items.push({ id: 'IT-' + k[0], code: k[0], name: 'تجاليد WPC ' + k[0] + ' — 17×280', kind: 'fg', family: 'clad', productId: 'PRD-K71', attrs: { model: 'K71', color: k[1], size: '17×280' }, uom: 'pcs', price: 250, stdCost: 148, reorderPoint: 600, moq: 200, leadDays: 2, bomId: 'BOM-CLAD', weightKg: 3.3, areaM2: 0.476 }));
    products.push({ id: 'PRD-FOAM', family: 'foam', model: 'FB', name: 'ألواح PVC فوم بورد', sizes: ['122×244 سم'], colors: ['أبيض'], priceFrom: 620, desc: 'ألواح خفيفة ومتينة — الديكور والإعلان والأثاث والوحدات الطبية والمطابخ.', specs: [['المقاس', '122 × 244 سم'], ['السماكات', '4.5 / 6 / 8 / 10 / 12 / 14 / 17 مم'], ['الاستخدامات', 'ديكور · إعلانات · أثاث · وحدات طبية']], active: true });
    [[4.5, 620], [6, 800], [8, 1050], [10, 1300], [12, 1550], [17, 2150]].forEach((t) => items.push({ id: 'IT-FB-' + String(t[0]).replace('.', '_'), code: 'FB-' + t[0], name: 'لوح فوم بورد PVC ' + t[0] + ' مم — 122×244', kind: 'fg', family: 'foam', productId: 'PRD-FOAM', attrs: { thickness: t[0], size: '122×244', color: 'C021' }, uom: 'sheet', price: t[1], stdCost: round(t[1] * 0.64, 5), reorderPoint: 80, moq: 50, leadDays: 2, bomId: 'BOM-FOAM', weightKg: round(t[0] * 1.64, 0.1) }));
    const RM = [['RM-PVC', 'راتنج PVC K67 (SG-5)', 'kg', 48, 15000, 'S-001', 25000], ['RM-WF', 'دقيق خشب 80 مش', 'kg', 9, 6000, 'S-003', 5000], ['RM-CC', 'كربونات كالسيوم مطحونة', 'kg', 3.2, 8000, 'S-007', 10000],
      ['RM-STB', 'مثبّت Ca-Zn', 'kg', 95, 800, 'S-004', 1000], ['RM-LUB', 'شمع PE (مزلّق)', 'kg', 70, 400, 'S-004', 500], ['RM-FOAM', 'عامل نفخ AC', 'kg', 120, 150, 'S-004', 200], ['RM-ACR', 'منظم فوم ACR', 'kg', 140, 600, 'S-004', 500],
      ['RM-PIG', 'ماستر باتش ألوان', 'kg', 160, 300, 'S-009', 300], ['RM-FILM', 'فويل ديكور UPVC للامينيشن', 'm', 38, 3500, 'S-008', 6000], ['RM-GLUE', 'لاصق PUR للامينيشن', 'kg', 210, 250, 'S-004', 300]];
    RM.forEach((r) => items.push({ id: 'IT-' + r[0], code: r[0], name: r[1], kind: 'rm', family: 'rm', attrs: {}, uom: r[2], price: null, stdCost: r[3], reorderPoint: r[4], moq: r[6], leadDays: r[5] === 'S-008' ? 35 : 7, supplierId: r[5] }));
    [['PKG-CTN', 'كرتونة باب مطبوعة', 'pcs', 45, 300, 'S-006', 500], ['PKG-STR', 'ستريتش فيلم', 'roll', 380, 40, 'S-006', 50], ['PKG-PAL', 'باليتة خشب', 'pcs', 260, 60, 'S-006', 100]].forEach((r) => items.push({ id: 'IT-' + r[0], code: r[0], name: r[1], kind: 'pkg', family: 'pkg', attrs: {}, uom: r[2], price: null, stdCost: r[3], reorderPoint: r[4], moq: r[6], leadDays: 5, supplierId: r[5] }));
    [['ACC-LOCK', 'كالون وأكرة باب (طقم)', 'set', 320, 480, 150, 'S-002'], ['ACC-HINGE', 'طقم مفصلات ستانلس (3)', 'set', 140, 220, 150, 'S-002'], ['ACC-GSKT', 'جوان مطاطي للحلق (م)', 'm', 6, 12, 1500, 'S-005']].forEach((r) => items.push({ id: 'IT-' + r[0], code: r[0], name: r[1], kind: 'acc', family: 'acc', attrs: {}, uom: r[2], price: r[4], stdCost: r[3], reorderPoint: r[5], moq: r[5], leadDays: 7, supplierId: r[6] }));
    [['SP-HTR', 'حزام تسخين للإكسترودر (Heater band)', 3800, 4], ['SP-BLD', 'سكينة منشار قطع', 1200, 6], ['SP-SEAL', 'جوان طلمبة فاكيوم', 650, 8], ['SP-BRG', 'رولمان بلي 6310', 900, 10], ['SP-THC', 'ثرموكبل نوع J', 450, 12], ['SP-BELT', 'سير ناقل وحدة السحب', 2600, 3], ['SP-SCR', 'طقم مسمار وبرميل إكسترودر 65/132', 285000, 0]].forEach((r) => items.push({ id: 'IT-' + r[0], code: r[0], name: r[1], kind: 'spare', family: 'spare', attrs: {}, uom: 'pcs', price: null, stdCost: r[2], reorderPoint: r[3], moq: Math.max(1, r[3]), leadDays: 10, supplierId: 'S-010' }));
    S.items = items; S.products = products;

    S.boms = [
      { id: 'BOM-DOOR', family: 'door', name: 'تركيبة باب WPC & PVC (أساس 90 سم)', version: 3, status: 'active', scale: 'width', updatedAt: ago(60 * 24 * 40), approvedBy: 'U-13',
        lines: [['IT-RM-PVC', 9.5, 0.03], ['IT-RM-WF', 3.2, 0.03], ['IT-RM-CC', 4.0, 0.02], ['IT-RM-STB', 0.38, 0], ['IT-RM-LUB', 0.15, 0], ['IT-RM-FOAM', 0.06, 0], ['IT-RM-ACR', 0.42, 0], ['IT-RM-PIG', 0.12, 0], ['IT-RM-FILM', 4.8, 0.05], ['IT-RM-GLUE', 0.32, 0.02], ['IT-ACC-LOCK', 1, 0], ['IT-ACC-HINGE', 1, 0], ['IT-ACC-GSKT', 5.5, 0], ['IT-PKG-CTN', 1, 0], ['IT-PKG-STR', 0.04, 0]].map((l) => ({ itemId: l[0], qty: l[1], scrapPct: l[2] })),
        routing: [{ seq: 10, op: 'خلط الخامات (ساخن/بارد)', lineId: 'L-01', minPerUnit: 1.5 }, { seq: 20, op: 'بثق بروفايل الضلفة والحلق', lineId: 'L-01', minPerUnit: 4.5 }, { seq: 30, op: 'لامينيشن فويل UPVC', lineId: 'L-02', minPerUnit: 5 }, { seq: 40, op: 'تفريز وتجميع وتركيب الإكسسوارات', lineId: 'L-02', minPerUnit: 3.5 }, { seq: 50, op: 'فحص نهائي وتغليف', lineId: 'L-02', minPerUnit: 1.5 }] },
      { id: 'BOM-CLAD', family: 'clad', name: 'تركيبة تجاليد WPC K71', version: 2, status: 'active', scale: null, updatedAt: ago(60 * 24 * 75), approvedBy: 'U-13',
        lines: [['IT-RM-PVC', 1.55, 0.02], ['IT-RM-WF', 1.05, 0.02], ['IT-RM-CC', 0.55, 0.02], ['IT-RM-STB', 0.05, 0], ['IT-RM-LUB', 0.03, 0], ['IT-RM-PIG', 0.03, 0], ['IT-PKG-STR', 0.005, 0]].map((l) => ({ itemId: l[0], qty: l[1], scrapPct: l[2] })),
        routing: [{ seq: 10, op: 'خلط', lineId: 'L-03', minPerUnit: 0.2 }, { seq: 20, op: 'بثق وتبريد ومعايرة', lineId: 'L-03', minPerUnit: 0.8 }, { seq: 30, op: 'قطع وتحزيم', lineId: 'L-03', minPerUnit: 0.2 }] },
      { id: 'BOM-FOAM', family: 'foam', name: 'تركيبة لوح فوم بورد (لكل 1 مم سُمك)', version: 4, status: 'active', scale: 'thickness', updatedAt: ago(60 * 24 * 20), approvedBy: 'U-13',
        lines: [['IT-RM-PVC', 1.05, 0.02], ['IT-RM-CC', 0.45, 0.02], ['IT-RM-FOAM', 0.012, 0], ['IT-RM-ACR', 0.06, 0], ['IT-RM-STB', 0.04, 0], ['IT-RM-LUB', 0.02, 0]].map((l) => ({ itemId: l[0], qty: l[1], scrapPct: l[2] })),
        routing: [{ seq: 10, op: 'خلط', lineId: 'L-04', minPerUnit: 0.6 }, { seq: 20, op: 'بثق T-Die ونفخ', lineId: 'L-04', minPerUnit: 2.2 }, { seq: 30, op: 'درفلة وتبريد وقطع', lineId: 'L-04', minPerUnit: 0.9 }] }
    ];

    S.lines = [
      { id: 'L-01', code: 'EXT-DR', name: 'خط بثق بروفايل الأبواب', family: 'door', deptId: 'D-09', capacityPerShift: 140, uom: 'door', status: 'running', currentWoId: null, supervisorId: 'U-27', oee: { a: 0.91, p: 0.88, q: 0.97 }, shifts: ['A', 'B'], speed: 'م/دقيقة 1.6' },
      { id: 'L-02', code: 'LAM-DR', name: 'خط اللامينيشن وتجميع الأبواب', family: 'door', deptId: 'D-11', capacityPerShift: 110, uom: 'door', status: 'running', currentWoId: null, supervisorId: 'U-27', oee: { a: 0.94, p: 0.83, q: 0.96 }, shifts: ['A', 'B'] },
      { id: 'L-03', code: 'EXT-CL', name: 'خط بثق التجاليد WPC', family: 'clad', deptId: 'D-10', capacityPerShift: 900, uom: 'pcs', status: 'down', currentWoId: null, supervisorId: 'U-13', oee: { a: 0.62, p: 0.9, q: 0.95 }, shifts: ['A', 'B', 'C'], downSince: ago(190), downReason: 'عطل حزام تسخين المنطقة 3 بالإكسترودر' },
      { id: 'L-04', code: 'EXT-FB', name: 'خط ألواح الفوم بورد', family: 'foam', deptId: 'D-18', capacityPerShift: 160, uom: 'sheet', status: 'running', currentWoId: null, supervisorId: 'U-13', oee: { a: 0.89, p: 0.86, q: 0.93 }, shifts: ['A', 'B', 'C'] }
    ];
    const MC = (id, name, lineId, type, status, crit, hours, lastPM, nextPM, mtbf, mttr, maker) => ({ id, code: 'MC-' + id.slice(2), name, lineId, type, maker: maker || 'مورّد آسيوي', year: 2019 + (Number(id.slice(2)) % 6), status, criticality: crit, hoursRun: hours, lastPMAt: day(-lastPM), nextPMAt: day(nextPM), mtbfH: mtbf, mttrH: mttr });
    S.machines = [
      MC('M-101', 'إكسترودر مخروطي مزدوج 80/156', 'L-01', 'extruder', 'running', 'A', 18420, 24, 6, 410, 3.2, 'تقنية ألمانية — تجميع آسيوي'), MC('M-102', 'قالب بروفايل الضلفة 45 مم', 'L-01', 'die', 'running', 'A', 9200, 40, -2, 650, 5),
      MC('M-103', 'طاولة معايرة بالتفريغ', 'L-01', 'calibrator', 'running', 'B', 17100, 30, 12, 520, 1.5), MC('M-104', 'وحدة سحب ومنشار قطع', 'L-01', 'haul-off', 'running', 'B', 16900, 15, 15, 380, 1.2),
      MC('M-201', 'ماكينة لامينيشن PUR', 'L-02', 'laminator', 'running', 'A', 12300, 10, 20, 460, 2.5, 'إيطاليا'), MC('M-202', 'ماكينة تفريز وتجميع CNC', 'L-02', 'cnc', 'running', 'B', 11800, 35, 3, 700, 2), MC('M-203', 'محطة تغليف', 'L-02', 'packing', 'idle', 'C', 6400, 60, 30, 900, 0.8),
      MC('M-301', 'إكسترودر مخروطي 65/132', 'L-03', 'extruder', 'down', 'A', 21050, 55, -9, 290, 4.1), MC('M-302', 'قالب تجاليد K71', 'L-03', 'die', 'idle', 'A', 8800, 50, 8, 600, 4), MC('M-303', 'منشار قطع آلي', 'L-03', 'cutter', 'idle', 'B', 15400, 20, 10, 450, 1),
      MC('M-401', 'إكسترودر فوم 92/188', 'L-04', 'extruder', 'running', 'A', 14700, 18, 12, 480, 3.5), MC('M-402', 'قالب T-Die عرض 1300 مم', 'L-04', 'die', 'running', 'A', 7300, 45, 15, 720, 6), MC('M-403', 'ماكينة سحب ثلاثية الدرافيل', 'L-04', 'calender', 'maintenance', 'B', 13900, 1, 29, 510, 2), MC('M-404', 'منشار عرضي', 'L-04', 'cutter', 'running', 'B', 13100, 25, 5, 430, 1),
      MC('M-501', 'خلاط ساخن/بارد 500/1000 لتر', null, 'mixer', 'running', 'A', 19800, 12, 18, 520, 2.2), MC('M-502', 'كسارة إعادة التدوير', null, 'granulator', 'running', 'C', 8800, 70, -5, 800, 1.5),
      MC('M-503', 'شيلر مياه التبريد', null, 'chiller', 'running', 'A', 22000, 33, 4, 900, 3), MC('M-504', 'كمبروسر هواء', null, 'compressor', 'running', 'B', 23100, 41, 2, 1100, 2), MC('M-505', 'مولد كهرباء احتياطي 500 KVA', null, 'generator', 'idle', 'A', 2100, 90, -12, 2000, 4)
    ];

    /* ── stock balances (opening) ── */
    const stock = []; const SB = (itemId, whId, qty, reserved) => stock.push({ id: 'SB-' + itemId + '-' + whId, itemId, whId, qty, reserved: reserved || 0 });
    items.forEach((it) => {
      if (it.kind === 'fg') { const q = it.family === 'door' ? between(12, 70) : it.family === 'clad' ? between(400, 2400) : between(60, 260); SB(it.id, 'W-01', q); if (it.family === 'door' && rnd() > 0.6) SB(it.id, 'W-04', between(1, 3)); }
      else if (it.kind === 'spare') SB(it.id, 'W-05', it.id === 'IT-SP-HTR' ? 0 : it.id === 'IT-SP-SCR' ? 0 : between(it.reorderPoint, it.reorderPoint * 3));
      else SB(it.id, it.kind === 'acc' ? 'W-01' : 'W-02', round(it.reorderPoint * (0.7 + rnd() * 2.2), it.uom === 'kg' ? 10 : 1));
    });
    const setQ = (itemId, wh, q) => { const r = stock.find((x) => x.itemId === itemId && x.whId === wh); if (r) r.qty = q; else SB(itemId, wh, q); };
    setQ('IT-RM-FILM', 'W-02', 2100); setQ('IT-RM-PVC', 'W-02', 21800); setQ('IT-RM-ACR', 'W-02', 380); setQ('IT-ACC-LOCK', 'W-01', 210); setQ('IT-K71-2', 'W-01', 640); setQ('IT-D101-90-C132', 'W-01', 34); setQ('IT-D105-100-C3003', 'W-01', 6); setQ('IT-FB-10', 'W-01', 140);
    SB('IT-K71-3', 'W-06', 85); SB('IT-RM-WF', 'W-06', 1200);
    S.stock = stock; S.stockMoves = [];
    // a little movement history for stock cards
    const MV = (dAgoN, itemId, whId, qty, type, ref, note) => S.stockMoves.push({ id: 'MV-H' + S.stockMoves.length, ts: dAgo(dAgoN, between(8, 17)), itemId, whId, qty, type, ref, note, by: pick(['U-07', 'U-22', 'U-13']), lot: null, balance: null });

    /* ── chart of accounts ── */
    const ACC = [['1', 'الأصول', 'asset', null, 1], ['11', 'الأصول المتداولة', 'asset', '1', 2], ['1101', 'الخزينة الرئيسية — المصنع', 'asset', '11', 3], ['1102', 'خزينة المبيعات', 'asset', '11', 3], ['1111', 'البنك الأهلي المصري — جاري', 'asset', '11', 3], ['1112', 'بنك مصر — جاري', 'asset', '11', 3], ['1113', 'البنك التجاري الدولي — جاري', 'asset', '11', 3],
      ['1121', 'أوراق قبض (شيكات تحت التحصيل)', 'asset', '11', 3], ['1131', 'العملاء', 'asset', '11', 3], ['1141', 'مخزون مواد خام وتغليف', 'asset', '11', 3], ['1142', 'مخزون تحت التشغيل', 'asset', '11', 3], ['1143', 'مخزون إنتاج تام', 'asset', '11', 3], ['1144', 'مخزون قطع غيار', 'asset', '11', 3], ['1151', 'سلف العاملين', 'asset', '11', 3], ['1161', 'ضريبة القيمة المضافة — مدخلات', 'asset', '11', 3],
      ['12', 'الأصول الثابتة', 'asset', '1', 2], ['1201', 'الآلات وخطوط الإنتاج', 'asset', '12', 3], ['1202', 'المباني والإنشاءات', 'asset', '12', 3], ['1203', 'وسائل النقل', 'asset', '12', 3], ['1209', 'مجمع الإهلاك', 'asset', '12', 3],
      ['2', 'الخصوم', 'liability', null, 1], ['21', 'الخصوم المتداولة', 'liability', '2', 2], ['2101', 'الموردون', 'liability', '21', 3], ['2102', 'أوراق دفع', 'liability', '21', 3], ['2111', 'ضريبة القيمة المضافة — مخرجات', 'liability', '21', 3], ['2121', 'مستحقات الأجور', 'liability', '21', 3], ['2131', 'التأمينات الاجتماعية', 'liability', '21', 3],
      ['22', 'الخصوم طويلة الأجل', 'liability', '2', 2], ['2201', 'قرض تمويل خط الفوم بورد', 'liability', '22', 3],
      ['3', 'حقوق الملكية', 'equity', null, 1], ['31', 'رأس المال والاحتياطيات', 'equity', '3', 2], ['3101', 'رأس المال', 'equity', '31', 3], ['3201', 'الأرباح المحتجزة', 'equity', '31', 3],
      ['4', 'الإيرادات', 'revenue', null, 1], ['41', 'إيرادات المبيعات', 'revenue', '4', 2], ['4101', 'مبيعات الأبواب', 'revenue', '41', 3], ['4102', 'مبيعات التجاليد', 'revenue', '41', 3], ['4103', 'مبيعات الفوم بورد', 'revenue', '41', 3], ['4104', 'مبيعات الإكسسوارات', 'revenue', '41', 3], ['42', 'إيرادات أخرى', 'revenue', '4', 2], ['4201', 'إيرادات بيع خردة وإعادة تدوير', 'revenue', '42', 3],
      ['5', 'تكاليف الإنتاج والمبيعات', 'expense', null, 1], ['51', 'تكلفة المبيعات', 'expense', '5', 2], ['5101', 'تكلفة البضاعة المباعة', 'expense', '51', 3], ['52', 'تكاليف صناعية غير مباشرة', 'expense', '5', 2], ['5201', 'الأجور المباشرة', 'expense', '52', 3], ['5301', 'الكهرباء والطاقة', 'expense', '52', 3], ['5302', 'الصيانة وقطع الغيار', 'expense', '52', 3], ['5303', 'إهلاك الآلات', 'expense', '52', 3],
      ['6', 'المصروفات', 'expense', null, 1], ['61', 'مصروفات البيع والتسويق', 'expense', '6', 2], ['6101', 'عمولات ومصروفات بيعية', 'expense', '61', 3], ['6102', 'مصروفات المعارض والتسويق', 'expense', '61', 3], ['6103', 'الشحن والنقل', 'expense', '61', 3], ['62', 'المصروفات الإدارية', 'expense', '6', 2], ['6201', 'مصروفات إدارية عامة', 'expense', '62', 3], ['6202', 'الرواتب الإدارية', 'expense', '62', 3], ['6203', 'فوائد وأعباء تمويل', 'expense', '62', 3]];
    S.accounts = ACC.map((a) => ({ code: a[0], name: a[1], type: a[2], parent: a[3], level: a[4] }));
    S.banks = [{ id: 'BK-1', acc: '1111', name: 'البنك الأهلي المصري', kind: 'bank', iban: 'EG•• •••• 4411', currency: 'EGP' }, { id: 'BK-2', acc: '1112', name: 'بنك مصر', kind: 'bank', iban: 'EG•• •••• 7720', currency: 'EGP' }, { id: 'BK-3', acc: '1113', name: 'البنك التجاري الدولي CIB', kind: 'bank', iban: 'EG•• •••• 0935', currency: 'EGP' }, { id: 'TR-1', acc: '1101', name: 'الخزينة الرئيسية — المصنع', kind: 'treasury', currency: 'EGP' }, { id: 'TR-2', acc: '1102', name: 'خزينة المبيعات', kind: 'treasury', currency: 'EGP' }];
    S.journal = [];
    const JE = (date, memo, lines, ref) => { const id = nextNo('JE'); S.journal.unshift({ id, date, memo, ref: ref || null, lines: lines.filter((l) => (l.dr || 0) + (l.cr || 0) > 0).map((l) => ({ acc: l.acc, dr: Math.round(l.dr || 0), cr: Math.round(l.cr || 0) })), by: 'SYSTEM', auto: true, status: 'posted', total: Math.round(lines.reduce((s, l) => s + (l.dr || 0), 0)) }); };

    /* ── historical sales (12 months) → orders + invoices + receipts (monthly GL summaries) ── */
    const custW = [['C-002', 9], ['C-009', 10], ['C-001', 8], ['C-011', 7], ['C-014', 6], ['C-007', 5], ['C-004', 5], ['C-003', 4], ['C-005', 4], ['C-008', 4], ['C-012', 3], ['C-013', 2], ['C-006', 1]];
    const wsum = custW.reduce((s, c) => s + c[1], 0); const pickCust = () => { let r = rnd() * wsum; for (const c of custW) { r -= c[1]; if (r <= 0) return c[0]; } return 'C-001'; };
    const fg = items.filter((i) => i.kind === 'fg'); const doorsI = fg.filter((i) => i.family === 'door'), cladI = fg.filter((i) => i.family === 'clad'), foamI = fg.filter((i) => i.family === 'foam');
    const custObj = (id) => S.customers.find((c) => c.id === id);
    const priceFor = (cid, it) => { const c = custObj(cid); const pl = S.priceLists.find((p) => p.id === (c && c.priceListId)); return Math.round(it.price * (pl ? pl.factor : 1)); };
    const mkLines = (cid, scale) => { const L = []; const c = custObj(cid); const seg = c.segment;
      if (rnd() < 0.8) { const n = between(1, 3); for (let i = 0; i < n; i++) { const it = pick(doorsI); L.push({ itemId: it.id, qty: Math.round(between(8, 40) * scale), price: priceFor(cid, it) }); } }
      if (rnd() < (seg === 'export' || seg === 'contractor' ? 0.85 : 0.55)) { const it = pick(cladI); L.push({ itemId: it.id, qty: round(between(300, 1800) * scale, 10), price: priceFor(cid, it) }); }
      if (rnd() < (seg === 'project' ? 1 : 0.3)) { const it = pick(foamI); L.push({ itemId: it.id, qty: round(between(40, 220) * scale, 5), price: priceFor(cid, it) }); }
      if (!L.length) { const it = pick(doorsI); L.push({ itemId: it.id, qty: 12, price: priceFor(cid, it) }); }
      return L; };
    const tax = 0.14; const tot = (lines, disc) => { const g = lines.reduce((s, l) => s + l.qty * l.price, 0); const net = Math.round(g * (1 - (disc || 0) / 100)); const t = Math.round(net * tax); return { net, tax: t, total: net + t }; };
    S.salesOrders = []; S.invoices = []; S.receipts = []; S.cheques = []; S.deliveries = [];
    let soN = 300, invN = 160, rvN = 200, dnN = 80, chN = 40;
    const reps = { 'C-001': 'U-05', 'C-002': 'U-10', 'C-003': 'U-11', 'C-004': 'U-05', 'C-005': 'U-10', 'C-006': 'U-05', 'C-007': 'U-11', 'C-008': 'U-10', 'C-009': 'U-11', 'C-010': 'U-05', 'C-011': 'U-10', 'C-012': 'U-11', 'C-013': 'U-05', 'C-014': 'U-10' };
    const monthly = []; // for GL summaries
    const seasonal = [0.92, 0.95, 1.08, 1.12, 1.05, 0.9, 0.86, 0.94, 1.06, 1.15, 1.18, 0.4]; // 11 full months + current (partial)
    for (let mi = 11; mi >= 0; mi--) {
      const m0 = new Date(); m0.setDate(1); m0.setMonth(m0.getMonth() - mi); const daysIn = mi === 0 ? Math.max(1, new Date().getDate() - 1) : new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate();
      const target = (2300000 + (11 - mi) * 95000) * (mi === 0 ? Math.max(0.05, (daysIn / 30) * 1.1) : seasonal[11 - mi]); let acc = 0; const mm = { key: m0.getFullYear() + '-' + String(m0.getMonth() + 1).padStart(2, '0'), sales: 0, tax: 0, rev: { '4101': 0, '4102': 0, '4103': 0 }, cogs: 0, collected: 0 };
      while (acc < target) {
        const cid = pickCust(); const dd = between(1, daysIn); const date = new Date(m0.getFullYear(), m0.getMonth(), dd, between(9, 16), between(0, 59)); if (date > new Date(Date.now() - DAY * 2)) break;
        const lines = mkLines(cid, custObj(cid).segment === 'export' ? 2.2 : custObj(cid).tier === 'A' ? 1.3 : 0.8); const disc = pick([0, 0, 0, 2, 3, 5]); const t = tot(lines, disc);
        const soId = no('SO', ++soN); const invId = no('INV', ++invN); const iso = date.toISOString(); const dateS = iso.slice(0, 10);
        const c = custObj(cid); const due = new Date(date.getTime() + (c.termsDays || 0) * DAY).toISOString().slice(0, 10);
        const ageDays = (Date.now() - date.getTime()) / DAY; let paidPct = ageDays > 75 ? 1 : ageDays > 45 ? (rnd() < 0.8 ? 1 : 0.5) : ageDays > 20 ? (rnd() < 0.45 ? 1 : rnd() < 0.5 ? 0.4 : 0) : rnd() < 0.2 ? 1 : 0;
        if (cid === 'C-004' && ageDays > 40 && ageDays < 120) paidPct = 0.3; // a slow payer for aging
        const paid = Math.round(t.total * paidPct);
        let dnIds = [];
        if (ageDays < 70) { const dnId = no('DN', ++dnN); dnIds = [dnId]; const planned = new Date(date.getTime() + 4 * DAY); const delivered = new Date(planned.getTime() + (rnd() < 0.86 ? -between(0, 1) : between(1, 3)) * DAY);
          S.deliveries.push({ id: dnId, soId, customerId: cid, lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty })), status: 'delivered', plannedDate: planned.toISOString().slice(0, 10), vehicleId: pick(['VH-01', 'VH-02', 'VH-03', 'VH-04']), driver: null, shipmentId: null, dispatchedAt: new Date(delivered.getTime() - 0.4 * DAY).toISOString(), deliveredAt: delivered.toISOString(), pod: { receivedBy: (c.contacts[0] || {}).name || 'المستلم', at: delivered.toISOString(), note: '' }, onTime: delivered <= new Date(planned.getTime() + DAY * 0.5), address: c.city, createdAt: iso }); }
        S.salesOrders.push({ id: soId, customerId: cid, source: c.segment === 'dealer' && rnd() < 0.35 ? 'portal' : 'rep', repId: reps[cid] || 'U-05', createdBy: reps[cid] || 'U-05', lines: lines.map((l) => Object.assign({}, l, { reservedQty: l.qty, deliveredQty: l.qty, invoicedQty: l.qty })), discountPct: disc, status: paidPct >= 1 ? 'closed' : 'invoiced', createdAt: iso, promisedDate: new Date(date.getTime() + 5 * DAY).toISOString().slice(0, 10), approvalId: null, woIds: [], dnIds, invoiceIds: [invId], notes: '', call: null, export: !!c.export, priority: 'normal', confirmedAt: iso });
        const inv = { id: invId, customerId: cid, soId, dnIds, lines, discountPct: disc, net: t.net, tax: t.tax, total: t.total, paid, status: 'issued', issueDate: dateS, dueDate: due, taxDemo: true, createdBy: 'U-06' };
        inv.status = paid >= t.total ? 'paid' : due < day(0) ? 'overdue' : paid > 0 ? 'partial' : 'issued'; S.invoices.push(inv);
        if (paid > 0) { const method = c.segment === 'export' ? 'transfer' : pick(['transfer', 'transfer', 'cheque', 'cheque', 'cash']); const pdate = new Date(Math.min(Date.now() - DAY, date.getTime() + between(10, 50) * DAY)); const rvId = no('RV', ++rvN); let chequeId = null;
          if (method === 'cheque') { chequeId = no('CHQ', ++chN); const chDue = new Date(pdate.getTime() + between(5, 45) * DAY); const stt = chDue < new Date() ? (rnd() < 0.94 ? 'collected' : 'bounced') : rnd() < 0.5 ? 'under_collection' : 'received'; S.cheques.push({ id: chequeId, no: String(between(100000, 999999)), bank: pick(['البنك الأهلي', 'بنك مصر', 'CIB', 'بنك القاهرة', 'QNB']), amount: paid, dueDate: chDue.toISOString().slice(0, 10), status: stt, customerId: cid, receiptId: rvId, history: [{ at: pdate.toISOString(), status: 'received', by: 'U-06' }] }); }
          S.receipts.push({ id: rvId, customerId: cid, invoiceId: invId, amount: paid, method, account: method === 'cheque' ? '1121' : method === 'cash' ? '1102' : pick(['1111', '1112', '1113']), chequeId, date: pdate.toISOString().slice(0, 10), by: 'U-06', note: '' }); mm.collected += paid; }
        const c2 = lines.reduce((s, l) => { const it = items.find((x) => x.id === l.itemId); return s + l.qty * it.stdCost; }, 0);
        lines.forEach((l) => { const it = items.find((x) => x.id === l.itemId); const a = it.family === 'door' ? '4101' : it.family === 'clad' ? '4102' : '4103'; mm.rev[a] += l.qty * l.price * (1 - disc / 100); });
        mm.sales += t.total; mm.tax += t.tax; mm.cogs += c2; acc += t.net;
      }
      monthly.push(mm);
    }
    // bounced cheque → invoice back to unpaid portion
    S.cheques.filter((c) => c.status === 'bounced').forEach((c) => { const rv = S.receipts.find((r) => r.id === c.receiptId); const inv = rv && S.invoices.find((i) => i.id === rv.invoiceId); if (inv) { inv.paid = Math.max(0, inv.paid - c.amount); inv.status = inv.dueDate < day(0) ? 'overdue' : 'issued'; } });

    /* ── opening + monthly GL summaries (expenses, purchases, payroll …) ── */
    const months = monthly.map((m) => m.key); const firstDay = months[0] + '-01';
    JE(firstDay, 'قيد افتتاحي (أرصدة تجريبية)', [{ acc: '1111', dr: 6800000 }, { acc: '1112', dr: 2400000 }, { acc: '1113', dr: 1350000 }, { acc: '1101', dr: 320000 }, { acc: '1141', dr: 3900000 }, { acc: '1143', dr: 2650000 }, { acc: '1144', dr: 420000 }, { acc: '1201', dr: 48500000 }, { acc: '1202', dr: 21000000 }, { acc: '1203', dr: 3600000 }, { acc: '1209', cr: 17800000 }, { acc: '2101', cr: 2900000 }, { acc: '2201', cr: 12000000 }, { acc: '3101', cr: 40000000 }, { acc: '3201', cr: 18240000 }]);
    monthly.forEach((m, i) => {
      const d = m.key + '-' + (i === monthly.length - 1 ? String(Math.max(1, new Date().getDate() - 1)).padStart(2, '0') : '28'); const f = i === monthly.length - 1 ? 0.2 : 1;
      JE(d, 'ترحيل مبيعات ' + ERP.monthLabel(m.key) + ' (مجمّع)', [{ acc: '1131', dr: m.sales }, { acc: '4101', cr: m.rev['4101'] }, { acc: '4102', cr: m.rev['4102'] }, { acc: '4103', cr: m.rev['4103'] }, { acc: '2111', cr: m.tax }]);
      JE(d, 'تكلفة المبيعات ' + ERP.monthLabel(m.key) + ' (مجمّع)', [{ acc: '5101', dr: m.cogs }, { acc: '1143', cr: m.cogs }]);
      if (m.collected) JE(d, 'تحصيلات ' + ERP.monthLabel(m.key) + ' (مجمّع)', [{ acc: '1111', dr: m.collected }, { acc: '1131', cr: m.collected }]);
      const prod = m.cogs * 1.02; JE(d, 'إنتاج تام ' + ERP.monthLabel(m.key) + ' (مجمّع)', [{ acc: '1143', dr: prod }, { acc: '1141', cr: prod * 0.78 }, { acc: '5201', cr: 0 }, { acc: '1142', cr: prod * 0.22 }]);
      JE(d, 'عمالة وتكاليف صناعية محمّلة ' + ERP.monthLabel(m.key), [{ acc: '1142', dr: prod * 0.22 }, { acc: '2121', cr: prod * 0.22 }]);
      const purch = m.cogs * 0.8; JE(d, 'مشتريات خامات ' + ERP.monthLabel(m.key) + ' (مجمّع)', [{ acc: '1141', dr: purch }, { acc: '1161', dr: purch * tax }, { acc: '2101', cr: purch * (1 + tax) }]);
      JE(d, 'سداد موردين ' + ERP.monthLabel(m.key) + ' (مجمّع)', [{ acc: '2101', dr: purch * (1 + tax) * (i === monthly.length - 1 ? 0.3 : 0.93) }, { acc: '1111', cr: purch * (1 + tax) * (i === monthly.length - 1 ? 0.3 : 0.93) }]);
      const exh = [3, 7, 10].indexOf(i) >= 0 ? 220000 : 40000; const mnt = i === monthly.length - 2 ? 120000 : 60000;
      JE(d, 'مصروفات تشغيل وإدارية ' + ERP.monthLabel(m.key), [{ acc: '5301', dr: 180000 * f }, { acc: '5302', dr: mnt * f }, { acc: '5303', dr: 95000 * f }, { acc: '6101', dr: m.sales * 0.012 * f }, { acc: '6102', dr: exh * f }, { acc: '6103', dr: 55000 * f }, { acc: '6201', dr: 45000 * f }, { acc: '6202', dr: 150000 * f }, { acc: '6203', dr: 70000 * f }, { acc: '2121', dr: m.cogs * 1.02 * 0.22 * f }, { acc: '1209', cr: 95000 * f }, { acc: '1111', cr: (180000 + mnt + m.sales * 0.012 + exh + 55000 + 45000 + 150000 + 70000) * f + m.cogs * 1.02 * 0.22 * f }]);
      if (i < monthly.length - 1) { const vin = purch * tax; JE(d, 'سداد ضريبة القيمة المضافة ' + ERP.monthLabel(m.key) + ' (تجريبي)', [{ acc: '2111', dr: m.tax }, { acc: '1161', cr: Math.min(vin, m.tax) }, { acc: '1111', cr: Math.max(0, m.tax - vin) }, { acc: '2111', cr: 0 }]); }
    });
    S.kpiMonthly = monthly.map((m) => ({ key: m.key, sales: Math.round(m.sales), net: Math.round(m.sales - m.tax), cogs: Math.round(m.cogs), collected: Math.round(m.collected) }));

    /* ── current pipeline (the live demo story) ── */
    const L = (itemId, qty, price) => { const it = items.find((x) => x.id === itemId); return { itemId, qty, price: price != null ? price : it.price, reservedQty: 0, deliveredQty: 0, invoicedQty: 0 }; };
    const LC = (cid, itemId, qty) => L(itemId, qty, priceFor(cid, items.find((x) => x.id === itemId)));
    const SO = (n, cid, o) => { const id = no('SO', n); const so = Object.assign({ id, customerId: cid, source: 'rep', repId: reps[cid] || 'U-05', createdBy: reps[cid] || 'U-05', lines: [], discountPct: 0, status: 'draft', createdAt: ago(60 * 24 * 2), promisedDate: day(14), approvalId: null, woIds: [], dnIds: [], invoiceIds: [], notes: '', call: null, export: !!custObj(cid).export, priority: 'normal' }, o); S.salesOrders.push(so); return so; };
    // the two orders Basel's approvals already talk about
    SO(412, 'C-001', { repId: 'U-05', createdBy: 'U-05', lines: [LC('C-001', 'IT-D101-90-C132', 6), LC('C-001', 'IT-D107-90-C021', 4), LC('C-001', 'IT-D114-90-C132', 4), LC('C-001', 'IT-ACC-LOCK', 14)], discountPct: 8, status: 'pending_approval', approvalId: 'AP-2001', createdAt: ago(200), notes: 'عميل قديم وبيطلب بكميات متكررة' });
    SO(418, 'C-002', { repId: 'U-10', createdBy: 'U-10', lines: [LC('C-002', 'IT-K71-1', 900), LC('C-002', 'IT-K71-4', 500), LC('C-002', 'IT-D103-100-C182', 60), LC('C-002', 'IT-D112-100-C198', 40)], discountPct: 0, status: 'pending_approval', approvalId: 'AP-2002', createdAt: ago(60 * 27), promisedDate: day(30), priority: 'high', notes: 'دفعة مقدمة + شيكات' });
    // golden thread: Oman export order in production
    const so480 = SO(480, 'C-009', { repId: 'U-11', lines: [LC('C-009', 'IT-K71-2', 2400), LC('C-009', 'IT-D101-100-C132', 80), LC('C-009', 'IT-D115-110-C091', 40)], status: 'in_production', createdAt: ago(60 * 24 * 6), confirmedAt: ago(60 * 24 * 5), promisedDate: day(9), priority: 'high', notes: 'شحنة تصدير — حاوية 40 قدم إلى ميناء صحار' });
    const so481 = SO(481, 'C-001', { source: 'portal', repId: 'U-05', createdBy: 'U-34', lines: [LC('C-001', 'IT-D105-100-C3003', 10), LC('C-001', 'IT-D108-90-C115', 12), LC('C-001', 'IT-FB-10', 60)], status: 'pending_review', createdAt: ago(95), submittedAt: ago(95), call: { phone: '+20 100 000 0001', preferredTime: 'من 12 إلى 3 ظهرًا', log: [] }, notes: 'طلب من بوابة التاجر' });
    const so482 = SO(482, 'C-014', { repId: 'U-10', lines: [LC('C-014', 'IT-K71-5', 3000), LC('C-014', 'IT-D107-100-C160', 120)], discountPct: 9, status: 'draft', createdAt: ago(60 * 3), promisedDate: day(25), notes: 'مشروع فيلات العلمين — المرحلة الأولى' });
    const so483 = SO(483, 'C-013', { repId: 'U-05', lines: [LC('C-013', 'IT-FB-10', 400), LC('C-013', 'IT-FB-17', 120)], status: 'in_production', createdAt: ago(60 * 24 * 3), confirmedAt: ago(60 * 24 * 3), promisedDate: day(6), notes: 'وحدات طبية — مواصفة سطح أملس بدون خطوط' });
    const so484 = SO(484, 'C-005', { repId: 'U-10', lines: [LC('C-005', 'IT-D101-90-C132', 12), LC('C-005', 'IT-D110-90-C102', 8)], status: 'ready', createdAt: ago(60 * 24 * 4), confirmedAt: ago(60 * 24 * 4), promisedDate: day(1) });
    const so485 = SO(485, 'C-007', { repId: 'U-11', lines: [LC('C-007', 'IT-K71-1', 800), LC('C-007', 'IT-D103-90-C102', 20)], status: 'partially_delivered', createdAt: ago(60 * 24 * 9), confirmedAt: ago(60 * 24 * 9), promisedDate: day(-1) });
    const so486 = SO(486, 'C-004', { repId: 'U-05', lines: [LC('C-004', 'IT-K71-3', 600), LC('C-004', 'IT-D104-90-C173', 16)], status: 'delivered', createdAt: ago(60 * 24 * 8), confirmedAt: ago(60 * 24 * 8), promisedDate: day(-2) });
    const so487 = SO(487, 'C-008', { repId: 'U-10', lines: [LC('C-008', 'IT-D101-80-C021', 10), LC('C-008', 'IT-K71-2', 300)], status: 'confirmed', createdAt: ago(60 * 20), confirmedAt: ago(60 * 19), promisedDate: day(5) });
    const so488 = SO(488, 'C-011', { repId: 'U-10', lines: [LC('C-011', 'IT-K71-1', 1200), LC('C-011', 'IT-K71-3', 900)], status: 'in_production', createdAt: ago(60 * 24 * 2), confirmedAt: ago(60 * 24 * 2), promisedDate: day(8), notes: 'متوقف على خط التجاليد (عطل)' });
    SO(489, 'C-012', { repId: 'U-11', lines: [LC('C-012', 'IT-D114-90-C132', 8), LC('C-012', 'IT-D101-90-C132', 6)], status: 'draft', createdAt: ago(40) });
    // reservations & fulfilment state for the live orders
    const res = (so, i, q) => { so.lines[i].reservedQty = q; const r = stock.find((x) => x.itemId === so.lines[i].itemId && x.whId === 'W-01'); if (r) { r.qty = Math.max(r.qty, q + (r.reserved || 0)); r.reserved = (r.reserved || 0) + q; } };
    res(so480, 0, 640); res(so480, 2, 0); res(so480, 1, 34);
    res(so483, 0, 140);
    res(so484, 0, 12); res(so484, 1, 8);
    res(so487, 0, 10); res(so487, 1, 300);
    so485.lines[0].reservedQty = 800; so485.lines[0].deliveredQty = 500; so485.lines[1].reservedQty = 20; so485.lines[1].deliveredQty = 20; { const r = stock.find((x) => x.itemId === 'IT-K71-1' && x.whId === 'W-01'); if (r) { r.qty = Math.max(r.qty, 300); r.reserved = (r.reserved || 0) + 300; } }
    so486.lines.forEach((l) => { l.reservedQty = l.qty; l.deliveredQty = l.qty; });

    /* work orders */
    S.workOrders = []; let woN = 50;
    const WO = (itemId, qty, lineId, o) => { const id = no('WO', ++woN); const w = Object.assign({ id, itemId, qty, qtyDone: 0, qtyScrap: 0, lineId, soId: null, status: 'planned', priority: 'normal', plannedStart: day(1), plannedEnd: day(2), dueDate: null, actualStart: null, actualEnd: null, shift: null, issued: false, qcId: null, createdAt: ago(60 * 24 * 2), createdBy: 'U-13', lot: 'LOT-' + id.slice(3), reports: [] }, o); S.workOrders.push(w); return w; };
    // history (completed)
    for (let i = 0; i < 16; i++) { const fam = pick(['door', 'door', 'clad', 'foam']); const it = pick(fam === 'door' ? doorsI : fam === 'clad' ? cladI : foamI); const q = fam === 'door' ? between(60, 180) : fam === 'clad' ? round(between(1500, 4000), 100) : round(between(150, 400), 10); const dd = between(4, 26);
      WO(it.id, q, fam === 'door' ? 'L-02' : fam === 'clad' ? 'L-03' : 'L-04', { qtyDone: q, qtyScrap: Math.round(q * (0.01 + rnd() * 0.03)), status: dd > 10 ? 'closed' : 'completed', plannedStart: day(-dd - 2), plannedEnd: day(-dd), actualStart: dAgo(dd + 2, 7), actualEnd: dAgo(dd, 15), issued: true, createdAt: dAgo(dd + 4), shift: pick(['A', 'B']) }); }
    const w1 = WO('IT-K71-2', 1800, 'L-03', { soId: so480.id, status: 'on_hold', priority: 'high', qtyDone: 1120, qtyScrap: 26, plannedStart: day(-2), plannedEnd: day(1), dueDate: so480.promisedDate, actualStart: dAgo(2, 7), issued: true, shift: 'B', holdReason: 'عطل الإكسترودر M-301 — أمر صيانة MWO مفتوح', reports: [{ at: ago(60 * 30), by: 'U-27', good: 620, scrap: 14 }, { at: ago(60 * 6), by: 'U-27', good: 500, scrap: 12 }] });
    const w2 = WO('IT-D101-100-C132', 46, 'L-02', { soId: so480.id, status: 'in_progress', priority: 'high', qtyDone: 28, qtyScrap: 1, plannedStart: day(-1), plannedEnd: day(1), dueDate: so480.promisedDate, actualStart: dAgo(1, 7), issued: true, shift: 'A', reports: [{ at: ago(60 * 3), by: 'U-27', good: 28, scrap: 1 }] });
    const w3 = WO('IT-D115-110-C091', 40, 'L-02', { soId: so480.id, status: 'planned', priority: 'high', plannedStart: day(1), plannedEnd: day(2), dueDate: so480.promisedDate });
    const w4 = WO('IT-FB-10', 260, 'L-04', { soId: so483.id, status: 'qc_pending', qtyDone: 262, qtyScrap: 9, plannedStart: day(-2), plannedEnd: day(0), dueDate: so483.promisedDate, actualStart: dAgo(2, 7), actualEnd: ago(80), issued: true, shift: 'C' });
    const w5 = WO('IT-FB-17', 120, 'L-04', { soId: so483.id, status: 'released', plannedStart: day(0), plannedEnd: day(1), dueDate: so483.promisedDate, issued: true });
    const w6 = WO('IT-K71-1', 1200, 'L-03', { soId: so488.id, status: 'planned', plannedStart: day(1), plannedEnd: day(2), dueDate: so488.promisedDate });
    const w7 = WO('IT-K71-3', 900, 'L-03', { soId: so488.id, status: 'planned', plannedStart: day(2), plannedEnd: day(3), dueDate: so488.promisedDate });
    WO('IT-D107-90-C021', 120, 'L-02', { status: 'planned', plannedStart: day(3), plannedEnd: day(4), notes: 'إنتاج للمخزون (حد طلب)' });
    WO('IT-FB-6', 300, 'L-04', { status: 'planned', plannedStart: day(2), plannedEnd: day(3) });
    so480.woIds = [w1.id, w2.id, w3.id]; so483.woIds = [w4.id, w5.id]; so488.woIds = [w6.id, w7.id];
    S.lines.find((l) => l.id === 'L-02').currentWoId = w2.id; S.lines.find((l) => l.id === 'L-04').currentWoId = w5.id; S.lines.find((l) => l.id === 'L-01').currentWoId = null;
    S.lines.find((l) => l.id === 'L-03').currentWoId = w1.id;
    // daily production (last 30 days) per line for charts/OEE
    S.prodDaily = [];
    for (let d = 30; d >= 1; d--) S.lines.forEach((ln) => { const cap = ln.capacityPerShift * ln.shifts.length; const down = ln.id === 'L-03' && d <= 1 ? 190 : rnd() < 0.12 ? between(30, 160) : between(0, 25); const util = Math.max(0.3, 0.92 - down / 960 - rnd() * 0.12); const good = Math.round(cap * util * 0.97); S.prodDaily.push({ date: day(-d), lineId: ln.id, planned: cap, good, scrap: Math.round(good * (0.015 + rnd() * 0.025)), downtimeMin: down, energyKwh: Math.round(cap * (ln.family === 'door' ? 6.5 : ln.family === 'clad' ? 0.9 : 3.2) * util) }); });

    /* QC + NCR + CAPA */
    S.qcInspections = []; S.ncrs = []; S.capas = []; let qcN = 300;
    const QC = (o) => { const id = no('QC', ++qcN); const it = items.find((x) => x.id === o.itemId); const fam = it.kind === 'fg' ? it.family : 'rm'; const q = Object.assign({ id, kind: 'final', refType: 'work_order', refId: null, itemId: o.itemId, qty: 0, sample: 13, lot: null, result: 'pass', params: (ERP.qcParams[fam] || ERP.qcParams.rm).map((p) => ({ name: p[0], spec: p[1], value: 'ضمن المواصفة', ok: true })), defects: [], acceptedQty: null, rejectedQty: 0, inspectorId: 'U-15', at: ago(60 * 24 * 3), createdAt: ago(60 * 24 * 3), note: '', ncrId: null }, o); if (q.acceptedQty == null) q.acceptedQty = q.result === 'fail' ? 0 : q.qty - (q.rejectedQty || 0); S.qcInspections.push(q); return q; };
    S.workOrders.filter((w) => w.status === 'completed' || w.status === 'closed').forEach((w) => { const q = QC({ refId: w.id, itemId: w.itemId, qty: w.qtyDone, lot: w.lot, at: w.actualEnd, createdAt: w.actualEnd, result: rnd() < 0.9 ? 'pass' : 'conditional', rejectedQty: Math.round(w.qtyDone * 0.004) }); w.qcId = q.id; });
    const q4 = QC({ refId: w4.id, itemId: w4.itemId, qty: w4.qtyDone, lot: w4.lot, result: 'pending', inspectorId: null, at: null, createdAt: ago(80), acceptedQty: null }); q4.params.forEach((p) => { p.value = ''; p.ok = null; }); w4.qcId = q4.id;
    // a failed batch → NCR → CAPA (story for quality)
    const qFail = QC({ kind: 'final', refId: S.workOrders[3].id, itemId: 'IT-K71-3', qty: 1200, lot: 'LOT-K71-3-H', result: 'conditional', rejectedQty: 85, acceptedQty: 1115, at: ago(60 * 24 * 4), defects: [{ code: 'D03', label: 'اختلاف لون', qty: 61 }, { code: 'D05', label: 'انحناء/عدم استقامة', qty: 24 }], note: 'اختلاف درجة اللون عن العينة المعتمدة في جزء من الدفعة' });
    qFail.params.find((p) => p.name.indexOf('اللون') >= 0).value = 'ΔE 2.3'; qFail.params.find((p) => p.name.indexOf('اللون') >= 0).ok = false;
    S.ncrs.push({ id: no('NCR', 41, 3), source: 'production', refType: 'work_order', refId: S.workOrders[3].id, qcId: qFail.id, itemId: 'IT-K71-3', qty: 85, defectCode: 'D03', severity: 'major', status: 'investigating', disposition: null, rootCause: 'تذبذب نسبة الماستر باتش — يُشتبه في دفعة الصبغة من المورد', capaId: 'CAPA-2026-012', openedAt: ago(60 * 24 * 4), openedBy: 'U-15', closedAt: null });
    qFail.ncrId = S.ncrs[0].id;
    S.ncrs.push({ id: no('NCR', 42, 3), source: 'supplier', refType: 'grn', refId: 'GRN-2026-0071', qcId: null, itemId: 'IT-RM-WF', qty: 1200, defectCode: 'D08', severity: 'major', status: 'dispositioned', disposition: 'return_to_supplier', rootCause: 'رطوبة دقيق الخشب 1.8% (المسموح ≤ 0.5%)', capaId: null, openedAt: ago(60 * 24 * 9), openedBy: 'U-15', closedAt: null });
    S.ncrs.push({ id: no('NCR', 43, 3), source: 'customer', refType: 'ticket', refId: 'TKT-2026-0108', qcId: null, itemId: 'IT-D103-90-C102', qty: 3, defectCode: 'D02', severity: 'minor', status: 'open', disposition: null, rootCause: '', capaId: null, openedAt: ago(60 * 26), openedBy: 'U-32', closedAt: null });
    S.ncrs.push({ id: no('NCR', 40, 3), source: 'production', refType: 'work_order', refId: S.workOrders[1].id, qcId: null, itemId: 'IT-FB-6', qty: 22, defectCode: 'D01', severity: 'minor', status: 'closed', disposition: 'scrap', rootCause: 'درجة حرارة القالب منخفضة في بداية الوردية', capaId: 'CAPA-2026-011', openedAt: ago(60 * 24 * 18), openedBy: 'U-15', closedAt: ago(60 * 24 * 12) });
    S.capas = [
      { id: 'CAPA-2026-012', title: 'ضبط جرعة الماستر باتش على خط التجاليد', ncrIds: [S.ncrs[0].id], ownerId: 'U-15', status: 'in_progress', rootCause: 'تذبذب في وحدة التلقيم الجانبية + اختلاف دفعة الصبغة', actions: [{ text: 'معايرة وحدة التلقيم الوزني', done: true }, { text: 'فحص COA لكل دفعة صبغة قبل الاستخدام', done: false }, { text: 'إضافة قياس ΔE كل ساعة في أول الوردية', done: false }], dueDate: day(6), openedAt: ago(60 * 24 * 4) },
      { id: 'CAPA-2026-011', title: 'تسخين مسبق للقالب قبل بداية وردية الفوم', ncrIds: [S.ncrs[3].id], ownerId: 'U-13', status: 'closed', rootCause: 'بدء التشغيل قبل الوصول لحرارة التشغيل', actions: [{ text: 'قائمة فحص بداية الوردية', done: true }, { text: 'تدريب المشغلين', done: true }], dueDate: day(-10), openedAt: ago(60 * 24 * 18), closedAt: ago(60 * 24 * 12), effective: true }
    ];
    S.certs = [
      { id: 'CRT-1', name: 'ISO 9001:2015 — نظام إدارة الجودة', body: 'جهة مانحة (تجريبي)', issued: '2024-03-12', expires: '2027-03-11', status: 'valid', nextAudit: day(48) },
      { id: 'CRT-2', name: 'ISO 14001:2015 — نظام الإدارة البيئية', body: 'جهة مانحة (تجريبي)', issued: '2024-05-20', expires: '2027-05-19', status: 'valid', nextAudit: day(112) },
      { id: 'CRT-3', name: 'علامة الجودة «صنع في مصر»', body: 'هيئة التنمية الصناعية (تجريبي)', issued: '2025-01-15', expires: '2026-12-31', status: 'expiring', nextAudit: day(25) }
    ];

    /* purchasing */
    S.purchaseRequisitions = []; S.purchaseOrders = []; S.grns = []; S.bills = []; S.vouchers = [];
    const PRQ = (n, itemId, qty, o) => S.purchaseRequisitions.push(Object.assign({ id: no('PRQ', n), itemId, qty, reason: '', source: 'mrp', woId: null, status: 'open', requestedBy: 'U-13', createdAt: ago(60 * 20), poId: null, neededBy: day(7) }, o));
    PRQ(31, 'IT-RM-FILM', 6000, { reason: 'احتياج أوامر تشغيل الأبواب + حد الطلب (استيراد 35 يوم)', source: 'mrp' });
    PRQ(32, 'IT-RM-ACR', 500, { reason: 'تحت حد الطلب', source: 'reorder', requestedBy: 'U-07' });
    PRQ(33, 'IT-SP-HTR', 4, { reason: 'عطل M-301 — رصيد قطع الغيار صفر', source: 'maintenance', requestedBy: 'U-31', createdAt: ago(170), neededBy: day(0) });
    PRQ(30, 'IT-RM-PVC', 25000, { reason: 'احتياج أكتوبر', status: 'ordered', poId: 'PS-2026-0046', createdAt: ago(60 * 24 * 12) });
    let poN = 44;
    const PO = (sid, lines, o) => { const id = no('PS', ++poN); const p = Object.assign({ id, supplierId: sid, lines: lines.map((l) => ({ itemId: l[0], qty: l[1], price: l[2], receivedQty: l[3] || 0 })), status: 'draft', buyerId: 'U-14', createdAt: ago(60 * 24 * 3), expectedDate: day(5), approvalId: null, prqIds: [], currency: 'EGP', notes: '' }, o); S.purchaseOrders.push(p); return p; };
    PO('S-001', [['IT-RM-PVC', 25000, 47.5, 25000]], { status: 'received', createdAt: ago(60 * 24 * 11), expectedDate: day(-6), approvedAt: ago(60 * 24 * 11) });
    PO('S-001', [['IT-RM-PVC', 20000, 48, 0]], { status: 'sent', createdAt: ago(60 * 24 * 2), expectedDate: day(3), approvedAt: ago(60 * 24 * 2), sentAt: ago(60 * 24 * 2) });
    PO('S-007', [['IT-RM-CC', 12000, 3.1, 12000]], { status: 'received', createdAt: ago(60 * 24 * 15), expectedDate: day(-10) });
    const poWF = PO('S-003', [['IT-RM-WF', 6000, 8.8, 6000]], { status: 'received', createdAt: ago(60 * 24 * 10), expectedDate: day(-8), notes: 'جزء مرفوض لارتفاع الرطوبة (NCR)' });
    PO('S-004', [['IT-RM-STB', 1000, 94, 0], ['IT-RM-LUB', 500, 69, 0], ['IT-RM-ACR', 500, 138, 0]], { status: 'approved', createdAt: ago(60 * 24 * 1), expectedDate: day(4) });
    PO('S-002', [['IT-ACC-LOCK', 300, 315, 0], ['IT-ACC-HINGE', 300, 138, 0]], { status: 'pending_approval', createdAt: ago(60 * 7), expectedDate: day(6), approvalId: 'AP-2101' });
    PO('S-009', [['IT-RM-PIG', 300, 158, 0]], { status: 'draft', createdAt: ago(60 * 2), expectedDate: day(5) });
    PO('S-006', [['IT-PKG-CTN', 600, 44, 600], ['IT-PKG-STR', 50, 375, 50]], { status: 'received', createdAt: ago(60 * 24 * 7), expectedDate: day(-3) });
    S.purchaseRequisitions.find((r) => r.id.endsWith('0030')).poId = S.purchaseOrders[0].id;
    let grnN = 68; const GRN = (po, lines, o) => { const id = no('GRN', ++grnN); const g = Object.assign({ id, poId: po.id, supplierId: po.supplierId, whId: 'W-02', lines: lines.map((l) => ({ itemId: l[0], qty: l[1], price: l[2], acceptedQty: l[3], rejectedQty: l[1] - l[3] })), status: 'accepted', receivedBy: 'U-07', at: ago(60 * 24 * 6), qcIds: [] }, o); S.grns.push(g); return g; };
    const g1 = GRN(S.purchaseOrders[0], [['IT-RM-PVC', 25000, 47.5, 25000]], { at: ago(60 * 24 * 6) });
    const g2 = GRN(S.purchaseOrders[2], [['IT-RM-CC', 12000, 3.1, 12000]], { at: ago(60 * 24 * 10) });
    const g3 = GRN(poWF, [['IT-RM-WF', 6000, 8.8, 4800]], { at: ago(60 * 24 * 9), status: 'partially_accepted' }); g3.id = 'GRN-2026-0071';
    const g4 = GRN(S.purchaseOrders[7], [['IT-PKG-CTN', 600, 44, 600], ['IT-PKG-STR', 50, 375, 50]], { at: ago(60 * 24 * 3), whId: 'W-02' });
    [g1, g2, g3, g4].forEach((g) => g.lines.forEach((l) => { const q = QC({ kind: 'incoming', refType: 'grn', refId: g.id, itemId: l.itemId, qty: l.qty, lot: g.id, at: g.at, createdAt: g.at, result: l.rejectedQty ? 'conditional' : 'pass', rejectedQty: l.rejectedQty, acceptedQty: l.acceptedQty }); g.qcIds.push(q.id); }));
    let billN = 90; const BILL = (g, paidPct, o) => { const net = Math.round(g.lines.reduce((s, l) => s + l.acceptedQty * l.price, 0)); const t = Math.round(net * tax); const sup = S.suppliers.find((x) => x.id === g.supplierId); const b = Object.assign({ id: no('BILL', ++billN), supplierId: g.supplierId, poId: g.poId, grnId: g.id, net, tax: t, total: net + t, paid: Math.round((net + t) * paidPct), status: paidPct >= 1 ? 'paid' : paidPct > 0 ? 'partial' : 'open', issueDate: g.at.slice(0, 10), dueDate: new Date(new Date(g.at).getTime() + (sup.termsDays || 30) * DAY).toISOString().slice(0, 10), lines: g.lines.map((l) => ({ itemId: l.itemId, qty: l.acceptedQty, price: l.price })) }, o); if (b.status !== 'paid' && b.dueDate < day(0)) b.status = 'overdue'; S.bills.push(b); sup.balance += b.total - b.paid; return b; };
    const b1 = BILL(g1, 0); BILL(g2, 1); BILL(g3, 0.5); BILL(g4, 0);
    S.bills.push({ id: no('BILL', ++billN), supplierId: 'S-008', poId: null, grnId: null, net: 412000, tax: 0, total: 412000, paid: 0, status: 'open', issueDate: day(-20), dueDate: day(40), lines: [{ itemId: 'IT-RM-FILM', qty: 10800, price: 38.15 }], note: 'استيراد — جمارك وضريبة على البيان الجمركي' });
    S.suppliers.find((x) => x.id === 'S-008').balance += 412000;
    S.suppliers.forEach((s) => { s.openPOs = S.purchaseOrders.filter((p) => p.supplierId === s.id && ['approved', 'sent', 'partially_received', 'pending_approval'].indexOf(p.status) >= 0).length; });
    S.vouchers = [
      { id: 'PV-2026-0119', supplierId: 'S-002', payee: 'شركة الإكسسوارات الحديثة', billIds: [], amount: 38000, method: 'transfer', account: '1111', status: 'pending_approval', createdBy: 'U-06', createdAt: ago(60 * 5), approvalId: 'AP-2004', memo: 'دفعة تحت الحساب' },
      { id: 'PV-2026-0118', supplierId: 'S-001', payee: 'الشركة المصرية للبتروكيماويات — راتنج PVC', billIds: [], amount: 86400, method: 'transfer', account: '1111', status: 'approved', createdBy: 'U-14', createdAt: ago(60 * 90), approvalId: 'AP-2010', approvedBy: 'U-03', approvedAt: ago(5000), memo: 'مشتريات خامات' },
      { id: 'PV-2026-0120', supplierId: 'S-001', payee: 'الشركة المصرية للبتروكيماويات — راتنج PVC', billIds: [b1.id], amount: Math.round(b1.total / 2), method: 'transfer', account: '1112', status: 'pending_approval', createdBy: 'U-06', createdAt: ago(60 * 3), approvalId: 'AP-2102', memo: 'نصف قيمة فاتورة الراتنج' },
      { id: 'PV-2026-0117', supplierId: 'S-007', payee: 'كربونات سيناء للتعدين', billIds: [], amount: 42400, method: 'cheque', account: '1113', status: 'executed', createdBy: 'U-06', createdAt: ago(60 * 24 * 9), approvalId: null, approvedBy: 'U-35', executedBy: 'U-16', executedAt: ago(60 * 24 * 8), memo: 'سداد فاتورة' }
    ];
    seq.PV = 120;

    /* deliveries / shipments / fleet (live) */
    S.vehicles = [
      { id: 'VH-01', plate: 'ن ق ص 4521', type: 'نقل ثقيل 12 طن', capacityKg: 12000, driver: 'عبد الله سليمان', phone: '+20 100 500 0001', status: 'on_trip', lastService: day(-21) },
      { id: 'VH-02', plate: 'ط د م 7734', type: 'نقل متوسط 6 طن', capacityKg: 6000, driver: 'محمود فرج', phone: '+20 100 500 0002', status: 'available', lastService: day(-9) },
      { id: 'VH-03', plate: 'س ع و 1190', type: 'ربع نقل 1.5 طن', capacityKg: 1500, driver: 'رامي جمال', phone: '+20 100 500 0003', status: 'available', lastService: day(-40) },
      { id: 'VH-04', plate: 'متعاقد — شركة النقل السريع', type: 'نقل خارجي (تعاقد)', capacityKg: 20000, driver: 'حسب الرحلة', phone: '+20 100 500 0004', status: 'available', contracted: true }
    ];
    const DN = (n, so, lines, o) => { const id = no('DN', n); const c = custObj(so.customerId); const d = Object.assign({ id, soId: so.id, customerId: so.customerId, lines, status: 'planned', plannedDate: day(1), vehicleId: null, driver: null, shipmentId: null, dispatchedAt: null, deliveredAt: null, pod: null, address: c.city, createdAt: ago(60 * 5), createdBy: 'U-30' }, o); S.deliveries.push(d); so.dnIds.push(id); return d; };
    DN(dnN + 1, so485, [{ itemId: 'IT-K71-1', qty: 500 }, { itemId: 'IT-D103-90-C102', qty: 20 }], { status: 'delivered', plannedDate: day(-3), vehicleId: 'VH-01', dispatchedAt: ago(60 * 24 * 3.4), deliveredAt: ago(60 * 24 * 3), pod: { receivedBy: 'أ. نبيل عزت', at: ago(60 * 24 * 3), note: 'تسليم موقع المشروع' }, onTime: true });
    DN(dnN + 2, so486, [{ itemId: 'IT-K71-3', qty: 600 }, { itemId: 'IT-D104-90-C173', qty: 16 }], { status: 'delivered', plannedDate: day(-2), vehicleId: 'VH-04', dispatchedAt: ago(60 * 24 * 3), deliveredAt: ago(60 * 24 * 1.5), pod: { receivedBy: 'م. عادل يوسف', at: ago(60 * 24 * 1.5), note: '' }, onTime: true });
    DN(dnN + 3, so485, [{ itemId: 'IT-K71-1', qty: 300 }], { status: 'dispatched', plannedDate: day(0), vehicleId: 'VH-01', driver: 'عبد الله سليمان', dispatchedAt: ago(150) });
    DN(dnN + 4, so484, [{ itemId: 'IT-D101-90-C132', qty: 12 }, { itemId: 'IT-D110-90-C102', qty: 8 }], { status: 'planned', plannedDate: day(1), vehicleId: 'VH-02' });
    seq.DN = dnN + 4;
    { const r = stock.find((x) => x.itemId === 'IT-K71-1' && x.whId === 'W-01'); if (r) { r.reserved = Math.max(0, r.reserved - 300); r.qty = Math.max(0, r.qty - 300); } }
    S.shipments = [
      { id: 'SH-2026-014', kind: 'export', soIds: [so480.id], customerId: 'C-009', destination: 'ميناء صحار — سلطنة عُمان', port: 'ميناء دمياط', container: '1 × 40HC', forwarder: 'وكيل شحن (تجريبي)', etd: day(10), eta: day(17), status: 'booked', incoterm: 'CIF', docs: [{ name: 'فاتورة تجارية', ok: false }, { name: 'قائمة تعبئة (Packing List)', ok: false }, { name: 'شهادة منشأ', ok: false }, { name: 'بوليصة شحن (B/L)', ok: false }, { name: 'شهادة مطابقة/فحص', ok: true }], createdAt: ago(60 * 24 * 4), progress: 35 },
      { id: 'SH-2026-013', kind: 'export', soIds: [], customerId: 'C-009', destination: 'ميناء صحار — سلطنة عُمان', port: 'ميناء دمياط', container: '1 × 40HC', forwarder: 'وكيل شحن (تجريبي)', etd: day(-28), eta: day(-21), status: 'delivered', incoterm: 'CIF', docs: [{ name: 'فاتورة تجارية', ok: true }, { name: 'قائمة تعبئة (Packing List)', ok: true }, { name: 'شهادة منشأ', ok: true }, { name: 'بوليصة شحن (B/L)', ok: true }, { name: 'شهادة مطابقة/فحص', ok: true }], createdAt: ago(60 * 24 * 35), progress: 100 },
      { id: 'SH-2026-015', kind: 'local', soIds: [so485.id], customerId: 'C-007', destination: 'المنصورة — موقع مشروع التعمير', vehicleId: 'VH-01', dnIds: ['DN-2026-' + String(dnN + 3).padStart(4, '0')], etd: day(0), eta: day(0), status: 'in_transit', createdAt: ago(160), progress: 60, gps: { lat: 31.21, lng: 31.42, updatedAt: ago(9) } }
    ];

    /* invoices for live orders */
    const INV = (so, lines, o) => { const t = tot(lines, so.discountPct); const id = no('INV', ++invN); const c = custObj(so.customerId); const i = Object.assign({ id, customerId: so.customerId, soId: so.id, dnIds: so.dnIds.slice(), lines, discountPct: so.discountPct, net: t.net, tax: t.tax, total: t.total, paid: 0, status: 'issued', issueDate: day(-2), dueDate: day((c.termsDays || 30) - 2), taxDemo: true, createdBy: 'U-06' }, o); S.invoices.push(i); so.invoiceIds.push(id); lines.forEach((l) => { const x = so.lines.find((y) => y.itemId === l.itemId); if (x) x.invoicedQty += l.qty; }); return i; };
    INV(so485, [{ itemId: 'IT-K71-1', qty: 500, price: so485.lines[0].price }, { itemId: 'IT-D103-90-C102', qty: 20, price: so485.lines[1].price }], { issueDate: day(-3), paid: 0 });
    seq.INV = invN;

    /* customer balances from open invoices */
    S.customers.forEach((c) => { c.balance = S.invoices.filter((i) => i.customerId === c.id).reduce((s, i) => s + Math.max(0, i.total - i.paid), 0); c.openOrders = S.salesOrders.filter((o) => o.customerId === c.id && ['closed', 'cancelled', 'rejected', 'invoiced'].indexOf(o.status) < 0).length; });

    /* leads + activities + quotations + targets (CRM may add more via ERP.addSeed) */
    const SRC = ['معرض', 'الموقع الإلكتروني', 'واتساب', 'فيسبوك', 'إحالة من تاجر', 'زيارة ميدانية', 'الخط الساخن 15536'];
    const LEADS = [['م. وليد حسنين', 'شركة البيت الذكي للتشطيبات', 'القاهرة', 'clad', 'qualified', 380000, 'U-10', 'EV-2026-07'], ['أ. ممدوح السيد', 'معرض الريان للأبواب', 'طنطا', 'door', 'proposal', 220000, 'U-11', null], ['م. نرمين عاطف', 'مكتب نرمين للتصميم الداخلي', 'الشيخ زايد', 'foam', 'contacted', 95000, 'U-05', 'EV-2026-07'],
      ['أ. جمال عبد الرازق', 'مقاولات الرحاب', 'القاهرة الجديدة', 'clad', 'negotiation', 640000, 'U-10', null], ['د. شريف منير', 'مستشفى الشفاء التخصصي', 'الزقازيق', 'foam', 'proposal', 310000, 'U-05', null], ['أ. فادي حنا', 'الحنا للديكور', 'أسيوط', 'door', 'new', 120000, 'U-05', 'EV-2026-08'],
      ['م. أسامة الليثي', 'تطوير مصر العقارية (مشروع)', 'العاصمة الإدارية', 'door', 'qualified', 1450000, 'U-10', 'EV-2026-07'], ['أ. عمرو بدوي', 'معرض الأصدقاء', 'بنها', 'door', 'won', 160000, 'U-11', null], ['Mr. Ahmed Al-Balushi', 'Al-Balushi Trading — مسقط', 'مسقط', 'clad', 'negotiation', 920000, 'U-11', 'EV-2026-09'],
      ['أ. مها رشدي', 'ستوديو مها للأثاث', 'الإسكندرية', 'foam', 'lost', 70000, 'U-11', null], ['م. طارق عيسى', 'مدارس النخبة الدولية (توسعات)', '6 أكتوبر', 'door', 'contacted', 540000, 'U-10', 'EV-2026-07'], ['أ. هاني صبري', 'صبري للمقاولات', 'المنيا', 'clad', 'new', 210000, 'U-05', 'EV-2026-08'],
      ['Eng. Saleh Al-Harthy', 'Harthy Build — صلالة', 'صلالة', 'door', 'qualified', 480000, 'U-11', 'EV-2026-09'], ['أ. رنا كمال', 'كافيهات «بن وزعتر» (فروع)', 'القاهرة', 'clad', 'proposal', 185000, 'U-10', null], ['م. إبراهيم قنديل', 'فندق الشاطئ — رأس سدر', 'رأس سدر', 'door', 'won', 610000, 'U-10', null],
      ['أ. سعيد حجازي', 'الحجازي للأخشاب', 'دمياط', 'clad', 'contacted', 140000, 'U-11', 'EV-2026-08'], ['م. منى جاد', 'جاد للعمارة', 'المنصورة', 'foam', 'new', 60000, 'U-05', 'EV-2026-08'], ['أ. خالد الصاوي', 'مؤسسة الصاوي', 'بورسعيد', 'door', 'lost', 90000, 'U-11', null]];
    S.leads = LEADS.map((l, i) => ({ id: no('LD', 200 + i), name: l[0], company: l[1], city: l[2], interest: l[3], stage: l[4], value: l[5], ownerId: l[6], eventId: l[7], source: l[7] ? 'معرض' : pick(SRC), phone: '+20 10' + between(10000000, 99999999), createdAt: ago(60 * 24 * between(2, 70)), updatedAt: ago(60 * between(2, 200)), nextAction: ['won', 'lost'].indexOf(l[4]) >= 0 ? null : pick(['مكالمة متابعة', 'إرسال عرض سعر', 'زيارة موقع', 'إرسال عينات', 'اجتماع مع الاستشاري']), nextAt: day(between(0, 6)), probability: { new: 0.1, contacted: 0.2, qualified: 0.4, proposal: 0.55, negotiation: 0.75, won: 1, lost: 0 }[l[4]], score: between(35, 95), lostReason: l[4] === 'lost' ? pick(['السعر', 'اختار منافس', 'تأجيل المشروع']) : null }));
    S.activities = [];
    S.leads.slice(0, 14).forEach((ld, i) => { S.activities.push({ id: 'ACT-' + (500 + i), kind: pick(['call', 'visit', 'meeting', 'whatsapp']), leadId: ld.id, customerId: null, ownerId: ld.ownerId, at: ago(60 * between(3, 24 * 12)), note: pick(['مهتم بعينات ألوان C132 وC160', 'طلب زيارة للمصنع في جمصة', 'يقارن بعرض منافس — السعر أعلى 6%', 'وافق مبدئيًا ويحتاج موافقة الاستشاري', 'أرسلنا الكتالوج على واتساب']), done: true }); });
    ['C-002', 'C-009', 'C-001', 'C-014', 'C-004'].forEach((cid, i) => S.activities.push({ id: 'ACT-' + (600 + i), kind: pick(['call', 'visit']), leadId: null, customerId: cid, ownerId: reps[cid], at: ago(60 * between(5, 24 * 6)), note: pick(['متابعة تحصيل', 'متابعة تسليم الطلب', 'عرض موديلات جديدة D115', 'تجديد قائمة الأسعار']), done: true }));
    S.quotations = [
      { id: 'QT-2026-0061', customerId: null, leadId: S.leads[1].id, prospect: 'معرض الريان للأبواب', repId: 'U-11', lines: [L('IT-D101-90-C132', 20, 6536), L('IT-D107-90-C021', 10, 6536)], discountPct: 3, status: 'sent', validUntil: day(10), createdAt: ago(60 * 24 * 3) },
      { id: 'QT-2026-0062', customerId: null, leadId: S.leads[3].id, prospect: 'مقاولات الرحاب', repId: 'U-10', lines: [L('IT-K71-1', 1800, 225), L('IT-K71-4', 900, 225)], discountPct: 6, status: 'pending_approval', validUntil: day(14), createdAt: ago(60 * 26) },
      { id: 'QT-2026-0063', customerId: null, leadId: S.leads[4].id, prospect: 'مستشفى الشفاء التخصصي', repId: 'U-05', lines: [L('IT-FB-10', 300, 1170), L('IT-FB-17', 80, 1935)], discountPct: 0, status: 'sent', validUntil: day(7), createdAt: ago(60 * 24 * 5) },
      { id: 'QT-2026-0060', customerId: 'C-011', leadId: null, prospect: null, repId: 'U-10', lines: [L('IT-K71-1', 1200, 225), L('IT-K71-3', 900, 225)], discountPct: 0, status: 'accepted', validUntil: day(-5), createdAt: ago(60 * 24 * 9), soId: so488.id },
      { id: 'QT-2026-0059', customerId: 'C-003', leadId: null, prospect: null, repId: 'U-11', lines: [L('IT-D112-100-C198', 15, 7009)], discountPct: 4, status: 'expired', validUntil: day(-12), createdAt: ago(60 * 24 * 30) }
    ];
    seq.QT = 63;
    const tgtMonth = ERP.monthKeys(1)[0];
    S.targets = ['U-05', 'U-10', 'U-11'].map((rid) => ({ id: 'TG-' + rid, repId: rid, period: tgtMonth, target: rid === 'U-10' ? 1400000 : rid === 'U-11' ? 1200000 : 900000, quarterTarget: rid === 'U-10' ? 4200000 : rid === 'U-11' ? 3600000 : 2700000 }));

    /* after-sales tickets · maintenance · downtime · IT (care may add more) */
    S.tickets = [
      { id: 'TKT-2026-0108', kind: 'complaint', customerId: 'C-003', soId: null, itemId: 'IT-D103-90-C102', title: 'انفصال طبقة الفويل في 3 أبواب بعد التركيب', priority: 'high', status: 'in_progress', channel: 'الخط الساخن 15536', assigneeId: 'U-32', openedAt: ago(60 * 26), slaHours: 48, warranty: true, ncrId: 'NCR-2026-043', notes: [{ at: ago(60 * 20), by: 'U-32', text: 'تم طلب صور وتحديد موعد معاينة' }] },
      { id: 'TKT-2026-0109', kind: 'installation', customerId: 'C-014', soId: null, itemId: null, title: 'طلب فريق تركيب تجاليد — فيلا نموذجية العلمين', priority: 'normal', status: 'assigned', channel: 'مندوب المبيعات', assigneeId: 'U-32', openedAt: ago(60 * 30), slaHours: 72, warranty: false, notes: [] },
      { id: 'TKT-2026-0110', kind: 'inquiry', customerId: 'C-001', soId: so481.id, itemId: null, title: 'استفسار عن موعد التسليم وألوان متاحة D105', priority: 'low', status: 'open', channel: 'بوابة التاجر', assigneeId: null, openedAt: ago(70), slaHours: 24, warranty: false, notes: [] },
      { id: 'TKT-2026-0105', kind: 'complaint', customerId: 'C-008', soId: null, itemId: 'IT-K71-2', title: 'اختلاف درجة لون بين دفعتين تجاليد', priority: 'normal', status: 'resolved', channel: 'واتساب', assigneeId: 'U-32', openedAt: ago(60 * 24 * 8), resolvedAt: ago(60 * 24 * 5), slaHours: 48, warranty: true, csat: 4, notes: [{ at: ago(60 * 24 * 5), by: 'U-32', text: 'تم الاستبدال من نفس الدفعة' }] },
      { id: 'TKT-2026-0103', kind: 'warranty', customerId: 'C-002', soId: null, itemId: 'IT-D112-100-C198', title: 'مطالبة ضمان — مفصلة مكسورة', priority: 'normal', status: 'closed', channel: 'زيارة', assigneeId: 'U-32', openedAt: ago(60 * 24 * 15), resolvedAt: ago(60 * 24 * 12), slaHours: 72, warranty: true, csat: 5, notes: [] },
      { id: 'TKT-2026-0107', kind: 'complaint', customerId: 'C-009', soId: null, itemId: 'IT-K71-2', title: 'كسر في 14 قطعة تجاليد أثناء الشحن البحري', priority: 'high', status: 'waiting_customer', channel: 'البريد', assigneeId: 'U-32', openedAt: ago(60 * 24 * 4), slaHours: 48, warranty: false, notes: [{ at: ago(60 * 24 * 3), by: 'U-32', text: 'بانتظار صور التعبئة من الوكيل لتحديد المسؤولية' }] }
    ];
    S.maintenanceOrders = [
      { id: 'MWO-2026-0087', kind: 'breakdown', machineId: 'M-301', lineId: 'L-03', title: 'عطل حزام تسخين المنطقة 3 — إكسترودر التجاليد', priority: 'urgent', status: 'waiting_parts', reportedBy: 'U-27', assigneeId: 'U-31', openedAt: ago(190), startedAt: ago(170), doneAt: null, downtimeMin: 190, parts: [{ itemId: 'IT-SP-HTR', qty: 2, issued: false }], cost: null, notes: 'رصيد قطعة الغيار صفر — طلب شراء عاجل PRQ' },
      { id: 'MWO-2026-0086', kind: 'preventive', machineId: 'M-102', lineId: 'L-01', title: 'صيانة وقائية — تنظيف وتلميع قالب الضلفة', priority: 'high', status: 'scheduled', reportedBy: 'U-31', assigneeId: 'U-31', openedAt: ago(60 * 24 * 2), plannedAt: day(0), doneAt: null, downtimeMin: 0, parts: [], cost: null },
      { id: 'MWO-2026-0085', kind: 'preventive', machineId: 'M-403', lineId: 'L-04', title: 'تغيير سير ومحامل ماكينة السحب', priority: 'normal', status: 'in_progress', reportedBy: 'U-31', assigneeId: 'U-31', openedAt: ago(60 * 26), startedAt: ago(60 * 2), doneAt: null, downtimeMin: 0, parts: [{ itemId: 'IT-SP-BELT', qty: 1, issued: true }, { itemId: 'IT-SP-BRG', qty: 2, issued: true }], cost: 4400 },
      { id: 'MWO-2026-0083', kind: 'breakdown', machineId: 'M-202', lineId: 'L-02', title: 'توقف حساس الـCNC', priority: 'high', status: 'done', reportedBy: 'U-27', assigneeId: 'U-31', openedAt: ago(60 * 24 * 6), startedAt: ago(60 * 24 * 6 - 20), doneAt: ago(60 * 24 * 6 - 140), downtimeMin: 140, parts: [], cost: 1800, rootCause: 'تراكم غبار على الحساس' },
      { id: 'MWO-2026-0080', kind: 'breakdown', machineId: 'M-301', lineId: 'L-03', title: 'ارتفاع حرارة البرميل', priority: 'high', status: 'done', reportedBy: 'U-13', assigneeId: 'U-31', openedAt: ago(60 * 24 * 19), startedAt: ago(60 * 24 * 19 - 15), doneAt: ago(60 * 24 * 19 - 260), downtimeMin: 260, parts: [{ itemId: 'IT-SP-THC', qty: 1, issued: true }], cost: 3200, rootCause: 'ثرموكبل تالف' },
      { id: 'MWO-2026-0078', kind: 'preventive', machineId: 'M-505', lineId: null, title: 'تشغيل اختباري للمولد الاحتياطي (متأخر)', priority: 'normal', status: 'scheduled', reportedBy: 'U-31', assigneeId: 'U-31', openedAt: ago(60 * 24 * 14), plannedAt: day(-12), doneAt: null, downtimeMin: 0, parts: [], cost: null }
    ];
    S.downtime = [
      { id: 'DT-501', lineId: 'L-03', machineId: 'M-301', start: ago(190), end: null, minutes: 190, reason: 'عطل كهربائي — حزام تسخين', category: 'breakdown', mwoId: 'MWO-2026-0087' },
      { id: 'DT-498', lineId: 'L-02', machineId: 'M-202', start: ago(60 * 24 * 6), end: ago(60 * 24 * 6 - 140), minutes: 140, reason: 'حساس CNC', category: 'breakdown', mwoId: 'MWO-2026-0083' },
      { id: 'DT-497', lineId: 'L-04', machineId: null, start: ago(60 * 24 * 7), end: ago(60 * 24 * 7 - 55), minutes: 55, reason: 'تغيير قالب لسُمك 17 مم', category: 'setup', mwoId: null },
      { id: 'DT-495', lineId: 'L-01', machineId: null, start: ago(60 * 24 * 9), end: ago(60 * 24 * 9 - 35), minutes: 35, reason: 'انتظار خامات (فويل)', category: 'material', mwoId: null },
      { id: 'DT-490', lineId: 'L-03', machineId: 'M-301', start: ago(60 * 24 * 19), end: ago(60 * 24 * 19 - 260), minutes: 260, reason: 'ارتفاع حرارة البرميل', category: 'breakdown', mwoId: 'MWO-2026-0080' },
      { id: 'DT-488', lineId: 'L-01', machineId: null, start: ago(60 * 24 * 12), end: ago(60 * 24 * 12 - 90), minutes: 90, reason: 'انقطاع كهرباء عام — تشغيل المولد', category: 'utility', mwoId: null }
    ];
    S.itTickets = [
      { id: 'ITK-2026-0031', title: 'طابعة الباركود في المخزن لا تطبع', requesterId: 'U-22', category: 'hardware', priority: 'normal', status: 'in_progress', assigneeId: 'U-09', openedAt: ago(60 * 5) },
      { id: 'ITK-2026-0030', title: 'تفعيل حساب EG-Mobile لمندوب جديد', requesterId: 'U-04', category: 'account', priority: 'low', status: 'open', assigneeId: null, openedAt: ago(60 * 9) },
      { id: 'ITK-2026-0029', title: 'بطء الإنترنت في مكتب المبيعات', requesterId: 'U-10', category: 'network', priority: 'normal', status: 'resolved', assigneeId: 'U-09', openedAt: ago(60 * 30), resolvedAt: ago(60 * 26) }
    ];

    /* exhibitions & events (expo may enrich via ERP.addSeed) */
    S.events = [
      { id: 'EV-2026-07', name: 'معرض The Big 5 Construct Egypt', kind: 'exhibition', city: 'القاهرة', venue: 'مركز مصر للمعارض الدولية', from: day(-47), to: day(-44), status: 'done', budget: 420000, spent: 398500, booth: 'جناح 36 م² — صالة 2', teamIds: ['U-33', 'U-10', 'U-05'], leadsTarget: 60, samples: [{ itemId: 'IT-D101-90-C132', qty: 2 }, { itemId: 'IT-D107-100-C160', qty: 1 }, { itemId: 'IT-K71-2', qty: 40 }, { itemId: 'IT-FB-10', qty: 6 }], approvalStatus: 'approved', notes: 'أكبر معرض بناء في مصر' },
      { id: 'EV-2026-08', name: 'معرض منتجات مصانع المنطقة الصناعية بجمصة', kind: 'exhibition', city: 'جمصة', venue: 'قاعة المؤتمرات — مدينة جمصة', from: day(-18), to: day(-17), status: 'done', budget: 85000, spent: 71200, booth: 'جناح 18 م²', teamIds: ['U-33', 'U-05'], leadsTarget: 25, samples: [{ itemId: 'IT-D104-90-C173', qty: 1 }, { itemId: 'IT-K71-1', qty: 20 }], approvalStatus: 'approved', notes: 'من أخبار الشركة' },
      { id: 'EV-2026-09', name: 'معرض البناء والتشييد — مسقط (مع الوكيل العدس)', kind: 'exhibition', city: 'مسقط — سلطنة عُمان', venue: 'مركز عُمان للمؤتمرات والمعارض', from: day(-9), to: day(-6), status: 'done', budget: 610000, spent: 574000, booth: 'جناح مشترك مع الوكيل 48 م²', teamIds: ['U-33', 'U-11'], leadsTarget: 35, samples: [{ itemId: 'IT-K71-2', qty: 60 }, { itemId: 'IT-D115-110-C091', qty: 2 }], approvalStatus: 'approved', notes: 'تصدير — الخليج' },
      { id: 'EV-2026-10', name: 'معرض ديكور مصر — Le Marché', kind: 'exhibition', city: 'القاهرة', venue: 'مركز المنارة الدولي', from: day(19), to: day(23), status: 'preparing', budget: 350000, spent: 120000, booth: 'جناح 30 م² (محجوز)', teamIds: ['U-33', 'U-10'], leadsTarget: 50, samples: [{ itemId: 'IT-D105-100-C3003', qty: 1 }, { itemId: 'IT-FB-6', qty: 10 }], approvalStatus: 'pending', approvalId: 'AP-2103', notes: 'التركيز على التصميم الداخلي والفوم بورد' },
      { id: 'EV-2026-11', name: 'زيارة وفد مقاولين من الصعيد للمصنع', kind: 'factory_visit', city: 'جمصة', venue: 'مصنع المصرية الألمانية', from: day(5), to: day(5), status: 'planned', budget: 25000, spent: 0, booth: null, teamIds: ['U-33', 'U-05', 'U-13'], leadsTarget: 12, samples: [], approvalStatus: 'approved', notes: 'جولة على خطوط الإنتاج + غداء' }
    ];

    /* approvals that point at ERP records (new) + link Basel's two sales approvals to their orders */
    const ap1 = S.approvals.find((a) => a.id === 'AP-2001'); if (ap1) { ap1.type = 'sales_order'; ap1.area = 'crm'; ap1.ref = { type: 'sales_order', id: 'SO-2026-0412' }; ap1.title = 'خصم 8% على أمر بيع SO-2026-0412 — معرض النيل للأبواب والديكور'; ap1.context = [['العميل', 'معرض النيل للأبواب والديكور'], ['قيمة الطلب', ERP.fmt.money(tot(S.salesOrders.find((s) => s.id === 'SO-2026-0412').lines, 8).total)], ['الخصم المطلوب', '8%'], ['البنود', '14 بابًا + 14 طقم كالون'], ['ملاحظة المندوب', 'عميل قديم وبيطلب بكميات متكررة']]; ap1.amount = tot(S.salesOrders.find((s) => s.id === 'SO-2026-0412').lines, 8).total; }
    const ap2 = S.approvals.find((a) => a.id === 'AP-2002'); if (ap2) { ap2.type = 'sales_order'; ap2.area = 'crm'; ap2.ref = { type: 'sales_order', id: 'SO-2026-0418' }; const t418 = tot(S.salesOrders.find((s) => s.id === 'SO-2026-0418').lines, 0); ap2.amount = t418.total; ap2.context = [['العميل', 'شركة الأفق للمقاولات'], ['قيمة الطلب', ERP.fmt.money(t418.total)], ['البنود', '1,400 تجاليد + 100 باب'], ['شروط الدفع', 'دفعة مقدمة + شيكات'], ['تاريخ التسليم المطلوب', '30 يومًا']]; }
    const ap4 = S.approvals.find((a) => a.id === 'AP-2004'); if (ap4) { ap4.type = 'voucher'; ap4.area = 'fin'; ap4.ref = { type: 'voucher', id: 'PV-2026-0119' }; ap4.chain = [{ step: 1, roleId: 'R-22', label: 'المدير المالي', status: 'pending', decidedBy: null, decidedAt: null, reason: '' }]; }
    const ap10 = S.approvals.find((a) => a.id === 'AP-2010'); if (ap10) { ap10.type = 'voucher'; ap10.area = 'fin'; ap10.ref = { type: 'voucher', id: 'PV-2026-0118' }; ap10.context = [['المورد', 'الشركة المصرية للبتروكيماويات — راتنج PVC'], ['المبلغ', '86,400 ج.م']]; }
    const ap13 = S.approvals.find((a) => a.id === 'AP-2013'); if (ap13) { ap13.title = 'طلب توظيف: فني تشغيل — خط بثق الأبواب'; ap13.context = ap13.context.map((c) => (c[0] === 'القسم' ? ['القسم', 'خط بثق الأبواب'] : c)); }
    const mkAp = (id, type, area, title, requesterId, amount, chain, mins, context, ref) => ({ id, type, area, title, requesterId, amount, discountPct: null, currency: 'EGP', status: 'pending', chain: chain.map((c, i) => ({ step: i + 1, roleId: c[0], label: c[1], status: i === 0 ? 'pending' : 'waiting', decidedBy: null, decidedAt: null, reason: '' })), currentStep: 1, createdAt: ago(mins), updatedAt: ago(mins), context, ref });
    const po6 = S.purchaseOrders.find((p) => p.approvalId === 'AP-2101'); const tpo6 = tot(po6.lines, 0);
    S.approvals.unshift(
      mkAp('AP-2101', 'purchase_order', 'scm', 'أمر شراء ' + po6.id + ' — شركة الإكسسوارات الحديثة', 'U-14', tpo6.total, [['R-22', 'المدير المالي'], ['R-02', 'المدير العام']], 60 * 7, [['المورد', 'شركة الإكسسوارات الحديثة'], ['القيمة', ERP.fmt.money(tpo6.total)], ['البنود', 'كوالين + مفصلات (300 طقم لكل منهما)'], ['السبب', 'رصيد الكوالين يغطي أقل من أسبوعين إنتاج']], { type: 'purchase_order', id: po6.id }),
      mkAp('AP-2102', 'voucher', 'fin', 'سند صرف PV-2026-0120 — الشركة المصرية للبتروكيماويات', 'U-06', Math.round(b1.total / 2), [['R-22', 'المدير المالي']], 60 * 3, [['المستفيد', 'الشركة المصرية للبتروكيماويات — راتنج PVC'], ['المبلغ', ERP.fmt.money(Math.round(b1.total / 2))], ['الإنشاء', 'نهى إبراهيم'], ['التنفيذ', 'بعد الاعتماد — صلاحية منفصلة']], { type: 'voucher', id: 'PV-2026-0120' }),
      mkAp('AP-2103', 'event_budget', 'expo', 'ميزانية معرض ديكور مصر — Le Marché', 'U-33', 350000, [['R-02', 'المدير العام']], 60 * 20, [['المعرض', 'ديكور مصر — Le Marché'], ['الميزانية', '350,000 ج.م'], ['المصروف حتى الآن', '120,000 ج.م (حجز الجناح)'], ['المستهدف', '50 عميل محتمل']], { type: 'event_budget', id: 'EV-2026-10' }),
      mkAp('AP-2104', 'maintenance_spend', 'care', 'شراء عاجل: حزام تسخين للإكسترودر M-301 (خط التجاليد متوقف)', 'U-31', 15200, [['R-05', 'مدير الإنتاج']], 150, [['الماكينة', 'M-301 — إكسترودر التجاليد'], ['التوقف', 'منذ 3 ساعات — أوامر تصدير متأثرة'], ['القيمة', '15,200 ج.م (4 قطع)'], ['المورد', 'الهندسية لقطع غيار الماكينات']], { type: 'maintenance_spend', id: 'MWO-2026-0087' })
    );

    /* audit + notifications for the live story */
    const AU = (mins, code, actorId, target, o) => { const u = S.users.find((x) => x.id === actorId); S.audit.push(Object.assign({ id: 'AU-E' + S.audit.length, ts: ago(mins), actor: { id: actorId, name: u ? u.name : actorId, roleId: u ? u.roleId : null }, code, target, before: null, after: null, reason: '', severity: (SA.catalog.auditByCode[code] || {}).severity || 'info', result: 'success', ip: '192.0.2.40', device: 'Chrome · Windows', via: 'web', count: 1, area: SA.catalog.auditAreaOf(code) || 'sa', stepUp: false }, o)); };
    AU(190, 'MNT.REQUESTED', 'U-27', { type: 'mwo', id: 'MWO-2026-0087', label: 'إكسترودر التجاليد M-301' }, { severity: 'high' });
    AU(185, 'LINE.STATUS_CHANGED', 'U-13', { type: 'line', id: 'L-03', label: 'خط بثق التجاليد' }, { before: { status: 'running' }, after: { status: 'down' } });
    AU(170, 'PRQ.CREATED', 'U-31', { type: 'prq', id: 'PRQ-2026-0033', label: 'حزام تسخين' });
    AU(95, 'PORTAL.ORDER_SUBMITTED', 'U-34', { type: 'sales_order', id: 'SO-2026-0481', label: 'معرض النيل للأبواب والديكور' });
    AU(80, 'WO.REPORTED', 'U-27', { type: 'work_order', id: w4.id, label: 'فوم بورد 10 مم' }, { after: { good: 262, scrap: 9 } });
    AU(60 * 24 * 4, 'NCR.OPENED', 'U-15', { type: 'ncr', id: 'NCR-2026-041', label: 'تجاليد K71-3' });
    AU(150, 'DN.DISPATCHED', 'U-30', { type: 'dn', id: 'DN-2026-' + String(dnN + 3).padStart(4, '0'), label: 'شركة التعمير' });
    S.audit.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    const N = (mins, title, body, level, to, link) => S.notifications.push({ id: 'N-E' + S.notifications.length, ts: ago(mins), title, body, level, to, toUsers: [], link, readBy: [] });
    N(185, 'خط التجاليد متوقف — عطل M-301', 'حزام تسخين المنطقة 3. رصيد قطعة الغيار صفر. أوامر تصدير عُمان متأثرة.', 'urgent', ['R-01', 'R-02', 'R-05', 'R-18'], '#/care/maintenance/MWO-2026-0087');
    N(150, 'اعتماد شراء عاجل لقطعة غيار', 'حزام تسخين M-301 — 15,200 ج.م بانتظار مدير الإنتاج.', 'action', ['R-05', 'R-01'], '#/approvals/AP-2104');
    N(95, 'طلب جديد من بوابة التاجر: SO-2026-0481', 'معرض النيل للأبواب والديكور — اتصل بالتاجر لتأكيد الطلب.', 'action', ['R-03', 'R-04'], '#/crm/dealer-orders');
    N(80, 'فحص نهائي مطلوب: فوم بورد 10 مم', '262 لوح بانتظار الجودة — طلب مستشفى المنصورة.', 'action', ['R-09'], '#/mfg/qc/' + q4.id);
    N(60 * 7, 'أمر شراء بانتظار الاعتماد', po6.id + ' — كوالين ومفصلات ' + ERP.fmt.money(tpo6.total), 'action', ['R-22', 'R-01'], '#/approvals/AP-2101');
    N(60 * 20, 'ميزانية معرض ديكور مصر بانتظارك', '350,000 ج.م — المستهدف 50 عميل محتمل.', 'action', ['R-02', 'R-01'], '#/approvals/AP-2103');
    N(60 * 26, 'شكوى عميل عالية الأولوية', 'انفصال فويل في 3 أبواب — مؤسسة السلام.', 'action', ['R-19', 'R-09'], '#/care/tickets/TKT-2026-0108');
    N(60 * 4, 'شهادة «صنع في مصر» تنتهي خلال أقل من شهرين', 'جهّز ملف التجديد ومراجعة الجهة المانحة.', 'info', ['R-09', 'R-01'], '#/mfg/certs');
    S.notifications.sort((a, b) => (a.ts < b.ts ? 1 : -1));

    /* sequences so ERP.no() continues after the seed */
    ['SO', 'INV', 'RV', 'DN', 'WO', 'QC', 'NCR', 'PRQ', 'PS', 'GRN', 'BILL', 'JE', 'CHQ', 'LD', 'QT'].forEach((p) => { seq[p] = Math.max(seq[p] || 0, 0); });
    seq.SO = Math.max(seq.SO, 489); seq.TKT = 110; seq.MWO = 87; seq.EV = 11; seq.SH = 15; seq.ITK = 31; seq.NCR = Math.max(seq.NCR || 0, 43);
    S.meta.erpSeq = seq;
    S.meta.erpSeededAt = new Date().toISOString();
  }

  SA.seed.build = function () {
    const S = base();
    try { buildErp(S); } catch (e) { console.error('[seed-erp] core ERP seed failed', e); }
    (ERP.seedHooks || []).forEach((hk) => { try { hk.fn(S, { ago, day, rnd, pick, between }); } catch (e) { console.error('[seed-erp] hook failed: ' + hk.name, e); } });
    return S;
  };
})();
