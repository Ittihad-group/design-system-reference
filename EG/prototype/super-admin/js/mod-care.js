/* EG ERP prototype — mod-care.js  (app «الدعم والصيانة» — id 'care'; groups care-dash · care-cs · care-mnt · care-it)
   Screens (ROUTE CONTRACT in erp-core.js):
     care-dashboard   care/dashboard              خدمة ما بعد البيع + صيانة المصنع + IT · «يحتاج انتباهك» · ERP.ui.insights('care')
     care-tickets     care/tickets[/TKT-id]       شكاوى/استفسارات/تركيب/ضمان — SLA، إسناد، دورة الحالة، ملاحظات (مرئية للتاجر)، NCR، زيارة، مطالبة ضمان
     care-warranty    care/warranty               مطالبات الضمان (warrantyClaims) — قرار (care.warranty.approve) ⇒ أمر بيع استبدال (ERP.flow.createOrder + confirmOrder)
     care-visits      care/visits                 زيارات التركيب/المعاينة (visits + careTechs) — أسبوع حسب الفني، إنشاء، إتمام بتقرير
     care-assets      care/assets[/M-id]          سجل الماكينات + كارت الماكينة (تاريخ الصيانة، التوقفات، الخطة الوقائية، القطع)
     care-maintenance care/maintenance[/MWO-id]   أوامر الصيانة — صرف قطع الغيار (W-05)، شراء عاجل، استلام، إتمام ⇒ عودة الخط + استئناف أوامر التشغيل
     care-pm          care/pm                     خطط الصيانة الوقائية (pmPlans) — متأخرة، تقويم 30 يومًا، نسبة الالتزام
     care-spares      care/spares                 قطع الغيار (items kind 'spare' في W-05) — الحد الأدنى، الاستهلاك، إعادة الطلب (ERP.flow.createPRQ)
     care-it          care/it[/ITK-id]            تذاكر الدعم الفني (itTickets) + أصول تقنية المعلومات (itAssets)
   Module collections (ERP.addSeed('care')):
     warrantyClaims[] {id WC-, ticketId, customerId, itemId, qty, reason, status pending|approved|rejected, openedBy, openedAt, decidedBy, decidedAt, decisionNote, replacementSoId}
     visits[]   {id VS-, kind installation|inspection|warranty|service, ticketId, customerId, techId, date, time, durH, address, notes, status scheduled|done|cancelled, report{result, measurements[[k,v]], notes, photos, signedBy, signedAt}}
     careTechs[] {id TEC-, name, role, phone, zone} · pmPlans[] {id PM-, machineId, title, freqDays, freqHours, tasks[], lastDoneAt, nextDueAt, ownerId, estH, active, mwoId, history[{dueAt, doneAt, mwoId}]}
     itAssets[] {id ITA-, kind, name, serial, assigneeId, location, deptId, status in_use|spare|repair|retired, purchased, warrantyUntil}
   Additive fields: tickets[] desc, notes[].public, claimId, assignedAt, closedAt, resolution · maintenanceOrders[] log[], checklist[], spendApprovalId, approvedSpend, poId, grnId, prqIds, rootCause, action, labourCost
                    · items(spare).attrs.fits[] (machine types) · lines[] upSince · machines[] lastFailureAt · workOrders[] resumedAt, lastHoldReason
   Public API (sync, no UI — screens wrap them in SA.api + toast): ERP.care = { createTicket, createMWO, stopLine, issuePart, requestParts, requestSpend, orderParts, receiveParts, releaseQC, setStatus,
     completeMWO, schedulePM, openClaim, decideClaim, scheduleVisit, completeVisit, pmCompliance, mtbf, mttr, slaOf }
   Approval hook: ERP.onApproval('maintenance_spend') → PO for the short spare parts (createPO → submitPO (auto ≤ حد تجريبي) → sendPO), MWO.approvedSpend/poId, urgent notify buyer (R-08). Idempotent. */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP;
  if (!SA || !ERP) return;
  const h = SA.h, st = SA.store, C = SA.catalog;
  const K = ERP.stock, F = ERP.flow, U = ERP.ui, CH = ERP.chart;
  const HOUR = 3600000, DAY = 86400000, SPW = 'W-05';

  /* ═════════════════════════ catalog additions ═════════════════════════ */
  [['TKT.UPDATED', 'تحديث تذكرة عميل', 'info'], ['WARRANTY.OPENED', 'فتح مطالبة ضمان', 'medium'], ['MNT.STATUS_CHANGED', 'تغيير حالة أمر صيانة', 'info'], ['MNT.ASSET_STATUS', 'تغيير حالة ماكينة', 'medium'],
    ['MNT.PARTS_ORDERED', 'شراء قطع غيار معتمد لأمر صيانة', 'medium'], ['MNT.PARTS_RECEIVED', 'استلام قطع غيار لأمر صيانة', 'medium'], ['IT.ASSIGNED', 'إسناد تذكرة دعم فني', 'info'], ['IT.UPDATED', 'تحديث تذكرة دعم فني', 'info'],
    ['VISIT.CANCELLED', 'إلغاء زيارة', 'info'], ['PM.PLAN_UPDATED', 'تعديل خطة صيانة وقائية', 'medium']].forEach((a) => C.addAudit(a[0], a[1], a[2], 'care'));
  C.addAudit('WO.RESUMED', 'استئناف أمر تشغيل بعد عودة الخط', 'medium', 'mfg');
  Object.assign(C.status, {
    care_claim: { pending: ['بانتظار القرار', 'warning'], approved: ['معتمدة — استبدال', 'success'], rejected: ['مرفوضة', 'danger'] },
    care_visit: { scheduled: ['مجدولة', 'info'], done: ['تمت', 'success'], cancelled: ['ملغاة', 'neutral'], late: ['متأخرة', 'danger'] },
    care_pm: { ok: ['في الموعد', 'success'], soon: ['مستحقة خلال 7 أيام', 'warning'], overdue: ['متأخرة', 'danger'], scheduled: ['أمر صيانة مفتوح', 'info'] },
    care_asset: { in_use: ['مستخدم', 'success'], spare: ['احتياطي', 'neutral'], repair: ['في الصيانة', 'warning'], retired: ['مُكهّن', 'neutral'] }
  });

  const KIND = { complaint: ['شكوى', 'danger'], inquiry: ['استفسار', 'info'], installation: ['طلب تركيب', 'neutral'], warranty: ['ضمان', 'warning'] };
  const PRIO = { urgent: ['عاجلة', 'danger'], high: ['عالية', 'warning'], normal: ['عادية', 'neutral'], low: ['منخفضة', 'neutral'] };
  const MKIND = { breakdown: ['عطل', 'danger'], preventive: ['وقائية', 'info'], corrective: ['تصحيحية', 'warning'] };
  const VKIND = { installation: 'تركيب', inspection: 'معاينة', warranty: 'معاينة ضمان', service: 'خدمة/صيانة لدى العميل' };
  const ITCAT = { hardware: 'أجهزة', network: 'شبكة', account: 'حسابات وصلاحيات', software: 'برامج', erp: 'النظام (ERP)' };
  const ITKIND = { laptop: ['لابتوب', 'monitor'], desktop: ['كمبيوتر مكتبي', 'monitor'], printer: ['طابعة', 'file'], scanner: ['ماسح باركود', 'scan'], network: ['شبكة', 'globe'], tablet: ['تابلت أرضية المصنع', 'phone'], server: ['خادم/تخزين', 'server'] };
  const MTYPE = { extruder: 'إكسترودر', die: 'قالب', calibrator: 'معايرة بالتفريغ', 'haul-off': 'سحب وقطع', laminator: 'لامينيشن', cnc: 'CNC', packing: 'تغليف', cutter: 'منشار', calender: 'درافيل سحب', mixer: 'خلاط', granulator: 'كسارة', chiller: 'شيلر', compressor: 'كمبروسر', generator: 'مولد' };
  const DTCAT = { breakdown: ['أعطال', '#b9141b'], setup: ['تجهيز/تغيير قالب', '#345383'], material: ['انتظار خامات', '#a85a00'], utility: ['مرافق (كهرباء/مياه)', '#8a8a8a'], quality: ['جودة', '#c9a227'], pm: ['صيانة وقائية', '#7d9cd1'] };
  const CHANNELS = ['الخط الساخن 15536', 'واتساب', 'بوابة التاجر', 'مندوب المبيعات', 'البريد', 'زيارة', 'الموقع الإلكتروني', 'فيسبوك'];
  const SLA_H = { urgent: 8, high: 24, normal: 48, low: 72 };
  const PORTAL_CH = 'بوابة التاجر';

  /* ═════════════════════════ seed (runs inside SA.seed.build) ═════════════════════════ */
  ERP.addSeed('care', (S, c) => {
    const ago = c.ago, day = c.day, rnd = c.rnd, pick = c.pick, between = c.between;
    const seq = (S.meta.erpSeq = S.meta.erpSeq || {});
    const isoAt = (daysAgo, hour, min) => { const d = new Date(Date.now() - daysAgo * DAY); d.setHours(hour == null ? 10 : hour, min == null ? (daysAgo * 17) % 60 : min, 0, 0); return d.toISOString(); };
    const plusH = (iso, hrs) => new Date(new Date(iso).getTime() + hrs * HOUR).toISOString();
    const items = S.items || [];
    const itm = (id) => items.find((x) => x.id === id) || null;

    /* spare parts → compatible machine types (critical parts for A machines) */
    const FITS = { 'IT-SP-HTR': ['extruder', 'die'], 'IT-SP-BLD': ['cutter', 'haul-off'], 'IT-SP-SEAL': ['calibrator'], 'IT-SP-BRG': ['calender', 'haul-off', 'mixer', 'extruder'], 'IT-SP-THC': ['extruder', 'die', 'laminator'], 'IT-SP-BELT': ['haul-off', 'calender'], 'IT-SP-SCR': ['extruder'] };
    items.forEach((i) => { if (FITS[i.id]) i.attrs = Object.assign({}, i.attrs, { fits: FITS[i.id] }); });

    /* ── tickets: enrich the core seed + 90 days of history (resolution time, CSAT, channels) ── */
    S.tickets = S.tickets || [];
    const DESC = {
      'TKT-2026-0108': 'العميل أبلغ أن طبقة الفويل بدأت تنفصل من الحافة السفلية في 3 أبواب D103 بعد أسبوعين من التركيب في عمارة سكنية بالإسكندرية.',
      'TKT-2026-0109': 'مطلوب فريق تركيب لـ 640 قطعة تجاليد K71 في الفيلا النموذجية بالعلمين — الموقع جاهز من الأحد.',
      'TKT-2026-0110': 'التاجر يسأل عن موعد تسليم الطلب SO-2026-0481 والألوان المتاحة حاليًا من موديل D105.',
      'TKT-2026-0105': 'اختلاف بسيط في درجة اللون بين دفعتين من K71-2 في نفس المشروع.',
      'TKT-2026-0103': 'مفصلة مكسورة في باب D112 خلال سنة الضمان.',
      'TKT-2026-0107': 'الوكيل في عُمان أبلغ عن كسر 14 قطعة تجاليد عند تفريغ الحاوية — نحتاج صور التعبئة لتحديد المسؤولية مع شركة الشحن.'
    };
    S.tickets.forEach((t) => {
      t.notes = t.notes || []; if (!t.desc) t.desc = DESC[t.id] || '';
      if (t.assigneeId && !t.assignedAt) t.assignedAt = plusH(t.openedAt, 0.7);
      if (t.status === 'closed' && !t.closedAt) t.closedAt = plusH(t.resolvedAt || t.openedAt, 20);
      if (t.kind === 'complaint' && !t.qty) t.qty = t.id === 'TKT-2026-0108' ? 3 : t.id === 'TKT-2026-0107' ? 14 : null;
    });
    const t110 = S.tickets.find((t) => t.id === 'TKT-2026-0110'); if (t110) Object.assign(t110, { createdBy: 'U-34', source: 'portal', contact: { name: 'م. سامي ناجي', phone: '+20 100 000 0001' } });
    const t108 = S.tickets.find((t) => t.id === 'TKT-2026-0108'); if (t108) { t108.claimId = 'WC-2026-0014'; t108.notes.push({ at: ago(60 * 22), by: 'U-32', text: 'فُتحت مطالبة ضمان WC-2026-0014 — بانتظار قرار الإدارة', sys: true }); }
    const tk = (id, o) => S.tickets.find((t) => t.id === id) && Object.assign(S.tickets.find((t) => t.id === id), o);
    tk('TKT-2026-0105', { claimId: 'WC-2026-0013', qty: 40, resolution: 'تم الاستبدال من نفس الدفعة' }); tk('TKT-2026-0103', { claimId: 'WC-2026-0012', qty: 1, resolution: 'تم تغيير المفصلة في الموقع' });
    tk('TKT-2026-0109', { visitIds: ['VS-2026-0045'] }); if (t108) t108.visitIds = ['VS-2026-0044'];
    S.tickets.push(
      { id: 'TKT-2026-0106', kind: 'warranty', customerId: 'C-012', soId: null, itemId: 'IT-K71-4', qty: 25, title: 'تقوّس في 25 قطعة تجاليد بعد التركيب الخارجي', desc: 'التاجر أرسل صورًا لتقوّس ألواح K71-4 مركّبة على واجهة معرضة للشمس المباشرة — يطلب الاستبدال بالضمان.', priority: 'high', status: 'assigned', channel: 'واتساب', assigneeId: 'U-32', openedAt: ago(60 * 24 * 3 + 50), assignedAt: ago(60 * 24 * 3), slaHours: 48, warranty: true, claimId: 'WC-2026-0015', visitIds: ['VS-2026-0046'], notes: [{ at: ago(60 * 24 * 2), by: 'U-32', text: 'وصلت 4 صور من التاجر — تم فتح مطالبة ضمان وتحديد معاينة', sys: false }] },
      { id: 'TKT-2026-0104', kind: 'installation', customerId: 'C-013', soId: 'SO-2026-0483', itemId: 'IT-FB-10', qty: 400, title: 'طلب تركيب ألواح فوم للوحدات الطبية — الدور الثاني', desc: 'المستشفى يطلب فريق تركيب بعد وصول الدفعة الأولى من ألواح الفوم 10 مم.', priority: 'normal', status: 'open', channel: 'مندوب المبيعات', assigneeId: null, openedAt: ago(60 * 24 * 4 + 30), slaHours: 72, warranty: false, notes: [] },
      { id: 'TKT-2026-0101', kind: 'complaint', customerId: 'C-001', soId: null, itemId: 'IT-D107-90-C021', qty: 1, title: 'باب D107 وصل بخدش في الحلق — طلب استبدال الحلق', desc: 'من بوابة التاجر: خدش طولي 12 سم في حلق باب أبيض ثلجي من آخر شحنة.', priority: 'normal', status: 'in_progress', channel: PORTAL_CH, source: 'portal', createdBy: 'U-34', contact: { name: 'م. سامي ناجي', phone: '+20 100 000 0001' }, assigneeId: 'U-32', openedAt: ago(60 * 20), assignedAt: ago(60 * 19), slaHours: 48, warranty: false, notes: [{ at: ago(60 * 18), by: 'U-32', text: 'نعتذر عن الخدش — سنرسل حلقًا بديلًا مع أول شحنة للقاهرة.', public: true }] }
    );
    const HK = ['complaint', 'complaint', 'complaint', 'inquiry', 'inquiry', 'installation', 'installation', 'warranty'];
    const HT = { complaint: ['خدش في سطح باب بعد الاستلام', 'اختلاف لون بين الضلفة والحلق', 'تأخر تسليم طلبية', 'كسر في كرتونة التغليف أثناء النقل', 'تموّج بسيط في ألواح فوم 6 مم', 'تجاليد غير مستقيمة في دفعة', 'صوت في المفصلات بعد التركيب'],
      inquiry: ['استفسار عن ألوان C160 المتاحة', 'طلب كتالوج الفوم بورد', 'استفسار عن تركيب التجاليد الخارجية', 'استفسار عن موعد وصول الطلبية', 'طلب عرض سعر لمشروع مدرسة'],
      installation: ['طلب فريق تركيب أبواب — شقة سكنية', 'طلب تركيب تجاليد — مطعم', 'معاينة موقع قبل التركيب', 'طلب تركيب أبواب — مدرسة دولية'], warranty: ['مطالبة ضمان — كالون لا يعمل', 'مطالبة ضمان — مفصلة مرتخية', 'مطالبة ضمان — انتفاخ أسفل الباب'] };
    const HC = ['C-001', 'C-002', 'C-003', 'C-004', 'C-005', 'C-007', 'C-008', 'C-011', 'C-012', 'C-013', 'C-014', 'C-006'];
    const HCH = ['الخط الساخن 15536', 'الخط الساخن 15536', 'واتساب', 'واتساب', PORTAL_CH, PORTAL_CH, 'مندوب المبيعات', 'البريد', 'الموقع الإلكتروني', 'فيسبوك', 'زيارة'];
    const doorIds = items.filter((i) => i.kind === 'fg' && i.family === 'door').map((i) => i.id); const cladIds = items.filter((i) => i.kind === 'fg' && i.family === 'clad').map((i) => i.id); const foamIds = items.filter((i) => i.kind === 'fg' && i.family === 'foam').map((i) => i.id);
    for (let i = 0; i <= 20; i++) {
      const kind = pick(HK); const prio = pick(['normal', 'normal', 'normal', 'high', 'low', 'urgent']); const sla = kind === 'inquiry' ? 24 : SLA_H[prio] + (kind === 'installation' ? 24 : 0);
      const opened = isoAt(between(6, 88), between(9, 16)); const resH = rnd() < 0.82 ? between(3, Math.max(4, sla - 2)) : between(sla + 2, sla + 40);
      const cid = pick(HC); const ch = cid === 'C-001' && rnd() < 0.6 ? PORTAL_CH : pick(HCH);
      const item = kind === 'inquiry' || kind === 'installation' ? null : pick(rnd() < 0.55 ? doorIds : rnd() < 0.7 ? cladIds : foamIds);
      const resolved = plusH(opened, resH); const closed = rnd() < 0.85;
      S.tickets.push({ id: 'TKT-2026-' + String(80 + i).padStart(4, '0'), kind, customerId: cid, soId: null, itemId: item, qty: item ? between(1, 12) : null, title: pick(HT[kind]), desc: '', priority: prio, status: closed ? 'closed' : 'resolved', channel: ch, source: ch === PORTAL_CH ? 'portal' : undefined, assigneeId: 'U-32', openedAt: opened, assignedAt: plusH(opened, 0.5),
        resolvedAt: resolved, closedAt: closed ? plusH(resolved, 18) : null, slaHours: sla, warranty: kind === 'warranty', csat: closed ? pick([5, 5, 4, 4, 4, 5, 3, 4, 2]) : null, resolution: pick(['تم الحل هاتفيًا', 'تم الاستبدال', 'زيارة فني وتم الإصلاح', 'تم إرسال المعلومات المطلوبة', 'تم التركيب وتسليم الموقع']), notes: [] });
    }
    S.tickets.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));

    /* ── warranty claims ── */
    S.warrantyClaims = [
      { id: 'WC-2026-0015', ticketId: 'TKT-2026-0106', customerId: 'C-012', itemId: 'IT-K71-4', qty: 25, reason: 'تقوّس ألواح بعد التركيب الخارجي — يُشتبه في نسبة المثبّت بالدفعة', status: 'pending', openedBy: 'U-32', openedAt: ago(60 * 24 * 2), decidedBy: null, decidedAt: null, decisionNote: '', replacementSoId: null, evidence: 'صور من التاجر (4) + معاينة مجدولة' },
      { id: 'WC-2026-0014', ticketId: 'TKT-2026-0108', customerId: 'C-003', itemId: 'IT-D103-90-C102', qty: 3, reason: 'انفصال طبقة الفويل — عدم مطابقة NCR-2026-043 مفتوح', status: 'pending', openedBy: 'U-32', openedAt: ago(60 * 22), decidedBy: null, decidedAt: null, decisionNote: '', replacementSoId: null, evidence: 'صور العميل + تقرير الخط الساخن' },
      { id: 'WC-2026-0013', ticketId: 'TKT-2026-0105', customerId: 'C-008', itemId: 'IT-K71-2', qty: 40, reason: 'اختلاف درجة اللون بين دفعتين', status: 'approved', openedBy: 'U-32', openedAt: ago(60 * 24 * 7), decidedBy: 'U-03', decidedAt: ago(60 * 24 * 6), decisionNote: 'استبدال من نفس الدفعة — سُلّم مع شحنة الدلتا', replacementSoId: null },
      { id: 'WC-2026-0012', ticketId: 'TKT-2026-0103', customerId: 'C-002', itemId: 'IT-ACC-HINGE', qty: 1, reason: 'مفصلة مكسورة خلال سنة الضمان', status: 'approved', openedBy: 'U-32', openedAt: ago(60 * 24 * 14), decidedBy: 'U-03', decidedAt: ago(60 * 24 * 13), decisionNote: 'تغيير في الموقع', replacementSoId: null },
      { id: 'WC-2026-0011', ticketId: null, customerId: 'C-005', itemId: 'IT-D107-90-C021', qty: 1, reason: 'انتفاخ أسفل الباب', status: 'rejected', openedBy: 'U-32', openedAt: ago(60 * 24 * 22), decidedBy: 'U-03', decidedAt: ago(60 * 24 * 20), decisionNote: 'التركيب في حمام بدون عزل للأرضية — خارج شروط الضمان (تقرير المعاينة)', replacementSoId: null }
    ];
    seq.WC = Math.max(seq.WC || 0, 15);

    /* ── field technicians + visits ── */
    S.careTechs = [
      { id: 'TEC-01', name: 'عادل فوزي', role: 'فني تركيب أبواب', phone: '+20 100 700 0001', zone: 'القاهرة الكبرى' },
      { id: 'TEC-02', name: 'محمود سعيد', role: 'فني تركيب تجاليد', phone: '+20 100 700 0002', zone: 'الساحل والإسكندرية' },
      { id: 'TEC-03', name: 'هاني رجب', role: 'فني تركيب تجاليد وفوم', phone: '+20 100 700 0003', zone: 'الدلتا' },
      { id: 'TEC-04', name: 'م. إبراهيم خليل', role: 'مهندس معاينة وجودة ميدانية', phone: '+20 100 700 0004', zone: 'كل المحافظات' }
    ];
    const V = (n, o) => Object.assign({ id: 'VS-2026-' + String(n).padStart(4, '0'), kind: 'installation', ticketId: null, customerId: null, techId: 'TEC-01', date: day(0), time: '10:00', durH: 3, address: '', notes: '', status: 'scheduled', report: null, createdBy: 'U-32', createdAt: ago(60 * 24 * 2) }, o);
    const rep = (result, meas, notes, signer, daysAgo) => ({ result, measurements: meas, notes, photos: 3, signedBy: signer, signedAt: isoAt(daysAgo, 15) });
    S.visits = [
      V(44, { kind: 'inspection', ticketId: 'TKT-2026-0108', customerId: 'C-003', techId: 'TEC-04', date: day(0), time: '13:00', durH: 2, address: 'الإسكندرية — سموحة، عمارة سكنية', notes: 'معاينة انفصال الفويل + أخذ عينة للمعمل' }),
      V(45, { kind: 'installation', ticketId: 'TKT-2026-0109', customerId: 'C-014', techId: 'TEC-02', date: day(1), time: '09:00', durH: 8, address: 'العلمين الجديدة — الفيلا النموذجية', notes: '640 قطعة K71 + الزوايا والإكسسوارات' }),
      V(46, { kind: 'warranty', ticketId: 'TKT-2026-0106', customerId: 'C-012', techId: 'TEC-03', date: day(2), time: '11:00', durH: 2, address: 'دمياط — واجهة معرض الأمل', notes: 'قياس التقوّس وظروف التركيب (تعرض للشمس)' }),
      V(47, { kind: 'installation', customerId: 'C-007', techId: 'TEC-01', date: day(3), time: '10:00', durH: 6, address: 'المنصورة — موقع مشروع التعمير', notes: 'تركيب 20 باب D103' }),
      V(48, { kind: 'installation', customerId: 'C-001', techId: 'TEC-01', date: day(5), time: '12:00', durH: 4, address: 'القاهرة — صالة عرض معرض النيل', notes: 'تركيب أبواب العرض الجديدة' }),
      V(43, { kind: 'installation', customerId: 'C-011', techId: 'TEC-03', date: day(-1), time: '09:00', durH: 7, address: 'القاهرة الجديدة — مبنى إداري', status: 'done', report: rep('ok', [['مساحة التركيب (م²)', '214'], ['عدد القطع المركبة', '450'], ['استواء الحائط (مم/م)', '2'], ['رطوبة الحائط %', '11']], 'تم التركيب وتسليم الموقع للاستشاري.', 'م. يوسف الشناوي', 1) }),
      V(42, { kind: 'inspection', ticketId: 'TKT-2026-0105', customerId: 'C-008', techId: 'TEC-04', date: day(-6), time: '12:00', durH: 2, address: 'المنصورة — معرض الدلتا', status: 'done', report: rep('ok', [['عدد القطع المختلفة', '40'], ['قراءة ΔE', '2.1'], ['رقم الدفعة', 'LOT-K71-2-B']], 'الاختلاف مؤكد بين دفعتين — يوصى بالاستبدال من نفس الدفعة.', 'أ. وائل شحاتة', 6) }),
      V(41, { kind: 'installation', customerId: 'C-004', techId: 'TEC-01', date: day(-3), time: '10:00', durH: 6, address: 'أسيوط — مشروع سكني', status: 'done', report: rep('followup', [['عدد الأبواب المركبة', '14'], ['عدد الأبواب المتبقية', '2']], 'بابان ينتظران تعديل فتحة الحائط من المقاول.', 'م. عادل يوسف', 3) }),
      V(40, { kind: 'installation', customerId: 'C-002', techId: 'TEC-02', date: day(-9), time: '09:00', durH: 8, address: 'الجيزة — كمبوند سكني', status: 'done', report: rep('ok', [['مساحة التركيب (م²)', '320'], ['عدد القطع المركبة', '672']], 'تم بدون ملاحظات.', 'أ. هشام قاسم', 9) }),
      V(39, { kind: 'service', customerId: 'C-005', techId: 'TEC-01', date: day(-4), time: '14:00', durH: 1, address: 'الجيزة — معرض الصفوة', status: 'cancelled', notes: 'ألغى العميل — سيعيد الحجز' })
    ];
    seq.VS = Math.max(seq.VS || 0, 48);

    /* ── maintenance history (MTTR, PM compliance, spare usage) ── */
    S.maintenanceOrders = S.maintenanceOrders || [];
    const m87 = S.maintenanceOrders.find((m) => m.id === 'MWO-2026-0087');
    if (m87) Object.assign(m87, { spendApprovalId: 'AP-2104', prqIds: ['PRQ-2026-0033'], desc: 'المشغل أبلغ عن انخفاض حرارة المنطقة 3 وتوقف البثق. القياس أكد احتراق حزام التسخين (Heater band). رصيد القطعة في مخزن قطع الغيار صفر.',
      log: [{ at: ago(190), by: 'U-27', text: 'بلاغ عطل من مشرف الخط — توقف البثق', icon: 'alert', tone: 'danger' }, { at: ago(185), by: 'U-13', text: 'إيقاف خط التجاليد L-03 ووضع أمر التشغيل على الانتظار', icon: 'factory', tone: 'danger' }, { at: ago(170), by: 'U-31', text: 'بدء التشخيص — احتراق حزام تسخين المنطقة 3', icon: 'wrench', tone: 'info' }, { at: ago(168), by: 'U-31', text: 'رصيد القطعة صفر — طلب شراء عاجل PRQ-2026-0033 + طلب اعتماد صرف AP-2104', icon: 'cart', tone: 'warning' }] });
    const m86 = S.maintenanceOrders.find((m) => m.id === 'MWO-2026-0086'); if (m86) m86.planId = 'PM-102';
    const m78 = S.maintenanceOrders.find((m) => m.id === 'MWO-2026-0078'); if (m78) m78.planId = 'PM-505';
    const MH = (n, kind, mid, lid, title, dAgo, hrs, dtMin, parts, cost, rootCause) => { const opened = isoAt(dAgo, 9); S.maintenanceOrders.push({ id: 'MWO-2026-' + String(n).padStart(4, '0'), kind, machineId: mid, lineId: lid, title, priority: kind === 'breakdown' ? 'high' : 'normal', status: 'done', reportedBy: kind === 'breakdown' ? 'U-27' : 'U-31', assigneeId: 'U-31', openedAt: opened, startedAt: plusH(opened, 0.3), doneAt: plusH(opened, hrs), downtimeMin: dtMin, parts: parts.map((p) => ({ itemId: p[0], qty: p[1], issued: true, issuedAt: plusH(opened, 0.6) })), cost, rootCause: rootCause || '', plannedAt: kind === 'preventive' ? opened.slice(0, 10) : null }); return opened; };
    MH(84, 'breakdown', 'M-104', 'L-01', 'كسر سكينة منشار القطع', 3, 0.8, 40, [['IT-SP-BLD', 1]], 1700, 'تآكل السكينة — تجاوزت عمرها التشغيلي');
    MH(82, 'breakdown', 'M-503', null, 'تسريب في دائرة مياه الشيلر', 10, 2.5, 0, [['IT-SP-SEAL', 1]], 2300, 'جوان طلمبة تالف');
    MH(81, 'preventive', 'M-101', 'L-01', 'صيانة وقائية شهرية — إكسترودر الأبواب', 24, 4, 0, [['IT-SP-THC', 1]], 900);
    MH(79, 'preventive', 'M-401', 'L-04', 'صيانة وقائية — إكسترودر الفوم', 18, 5, 0, [['IT-SP-BRG', 1]], 1500);
    MH(77, 'breakdown', 'M-403', 'L-04', 'ارتفاع اهتزاز درافيل السحب', 28, 1.8, 95, [['IT-SP-BRG', 2]], 2600, 'رولمان بلي تالف بالجانب الأيسر');
    MH(76, 'preventive', 'M-201', 'L-02', 'صيانة وقائية — ماكينة اللامينيشن', 10, 3, 0, [], 600);
    MH(75, 'breakdown', 'M-301', 'L-03', 'انسداد فتحة التهوية (Vent) بالإكسترودر', 41, 2.6, 150, [], 1200, 'رطوبة زائدة في دقيق الخشب');
    MH(74, 'breakdown', 'M-201', 'L-02', 'عطل حساس حرارة PUR', 47, 1.3, 70, [['IT-SP-THC', 1]], 1100, 'حساس تالف');
    MH(73, 'preventive', 'M-501', null, 'صيانة وقائية — الخلاط الساخن/البارد', 12, 3, 0, [], 500);
    MH(72, 'breakdown', 'M-504', null, 'توقف الكمبروسر — حماية حرارية', 55, 2, 0, [], 2400, 'انسداد فلتر الهواء');
    MH(71, 'preventive', 'M-104', 'L-01', 'صيانة وقائية — وحدة السحب والمنشار', 15, 2, 0, [['IT-SP-BLD', 1]], 1300);
    MH(70, 'breakdown', 'M-303', 'L-03', 'انحراف طول القطع', 63, 0.9, 45, [], 600, 'معايرة الإنكودر');
    S.maintenanceOrders.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));

    /* ── downtime: history for the charts (the live DT-501 stays open) ── */
    S.downtime = S.downtime || [];
    const DTp = (id, lineId, machineId, dAgo, hour, minutes, reason, category, mwoId) => { const start = isoAt(dAgo, hour); S.downtime.push({ id, lineId, machineId, start, end: new Date(new Date(start).getTime() + minutes * 60000).toISOString(), minutes, reason, category, mwoId: mwoId || null }); };
    DTp('DT-502', 'L-04', null, 2, 7, 45, 'تغيير قالب لسُمك 4.5 مم', 'setup');
    DTp('DT-503', 'L-01', 'M-104', 3, 9, 40, 'كسر سكينة المنشار', 'breakdown', 'MWO-2026-0084');
    DTp('DT-504', 'L-02', null, 4, 11, 30, 'انتظار فويل من المخزن', 'material');
    DTp('DT-505', 'L-03', 'M-302', 1, 14, 60, 'تنظيف القالب من الترسبات — عيوب سطح', 'quality');
    DTp('DT-506', 'L-01', null, 5, 13, 50, 'انقطاع مياه التبريد (الشيلر)', 'utility');
    DTp('DT-507', 'L-02', 'M-201', 10, 8, 120, 'صيانة وقائية مجدولة', 'pm', 'MWO-2026-0076');
    DTp('DT-489', 'L-04', 'M-403', 28, 10, 95, 'اهتزاز درافيل السحب', 'breakdown', 'MWO-2026-0077');
    DTp('DT-486', 'L-03', 'M-301', 41, 9, 150, 'انسداد فتحة التهوية', 'breakdown', 'MWO-2026-0075');
    DTp('DT-485', 'L-02', 'M-201', 47, 9, 70, 'عطل حساس حرارة PUR', 'breakdown', 'MWO-2026-0074');
    DTp('DT-484', 'L-03', 'M-303', 63, 9, 45, 'انحراف طول القطع', 'breakdown', 'MWO-2026-0070');
    DTp('DT-483', 'L-03', null, 16, 7, 80, 'تغيير لون K71-2 → K71-4', 'setup');
    DTp('DT-482', 'L-04', null, 21, 15, 35, 'انتظار عامل نفخ', 'material');
    S.downtime.sort((a, b) => (a.start < b.start ? 1 : -1));

    /* ── spare usage history (stock moves W-05; balances stay as seeded) ── */
    S.stockMoves = S.stockMoves || [];
    let mvN = 0; const MVs = (ts, itemId, qty, type, ref, note, by) => S.stockMoves.push({ id: 'MV-C' + (++mvN), ts, itemId, whId: SPW, qty, type, ref, note, by: by || 'U-31', lot: null, balance: null });
    S.maintenanceOrders.forEach((m) => (m.parts || []).forEach((p) => { if (p.issued) MVs(p.issuedAt || m.startedAt || m.openedAt, p.itemId, -p.qty, 'issue', { type: 'mwo', id: m.id }, 'صرف لأمر الصيانة ' + m.id); }));
    MVs(isoAt(35, 11), 'IT-SP-BLD', 6, 'receipt', null, 'توريد — أمر شراء سابق (S-010)', 'U-07'); MVs(isoAt(52, 11), 'IT-SP-BRG', 10, 'receipt', null, 'توريد — أمر شراء سابق (S-010)', 'U-07');
    MVs(isoAt(60, 12), 'IT-SP-THC', 12, 'receipt', null, 'توريد — أمر شراء سابق (S-010)', 'U-07'); MVs(isoAt(75, 12), 'IT-SP-HTR', 4, 'receipt', null, 'توريد — أمر شراء سابق (S-010)', 'U-07');
    MVs(isoAt(66, 10), 'IT-SP-HTR', -2, 'issue', null, 'صرف لإكسترودر الفوم M-401 (قبل تفعيل النظام)'); MVs(isoAt(30, 10), 'IT-SP-HTR', -2, 'issue', null, 'صرف لأحزمة تسخين M-301 (قبل تفعيل النظام)');
    MVs(isoAt(44, 10), 'IT-SP-SEAL', -1, 'issue', null, 'صرف لطلمبة فاكيوم M-103 (قبل تفعيل النظام)');
    S.stockMoves.sort((a, b) => (a.ts < b.ts ? 1 : -1));

    /* ── preventive maintenance plans (one per machine, consistent with machines[].lastPMAt / nextPMAt) ── */
    const TASKS = {
      extruder: ['فحص أحزمة التسخين وقراءة الثرموكبلات', 'قياس تآكل المسمار والبرميل', 'تغيير زيت علبة التروس', 'تنظيف فتحة التهوية (Vent) وخط الفاكيوم', 'شد أطراف الكهرباء ولوحة التحكم'],
      die: ['تنظيف وتلميع القالب', 'فحص مسامير وأحزمة التسخين', 'قياس خلوص الشفاه'], calibrator: ['تنظيف خزان التبريد والفلاتر', 'فحص طلمبة الفاكيوم والجوانات', 'معايرة الحساسات'],
      'haul-off': ['فحص السيور والجنازير', 'تشحيم المحامل', 'فحص سكينة المنشار والإنكودر'], laminator: ['تنظيف درافيل اللصق', 'معايرة حرارة PUR', 'فحص ضغط الدرافيل'],
      cnc: ['تنظيف الحساسات من الغبار', 'تشحيم المحاور', 'فحص المغازل والأدوات'], packing: ['فحص وحدة التغليف والسير', 'تنظيف الحساسات'], cutter: ['تغيير/سن السكينة', 'فحص الحماية والحساسات', 'تشحيم المجاري'],
      calender: ['فحص السيور والمحامل', 'قياس حرارة الدرافيل', 'تشحيم'], mixer: ['فحص الشفرات والجوانات', 'تنظيف الخلاط الساخن', 'فحص المحرك والسيور'], granulator: ['سن السكاكين', 'فحص الغربال'],
      chiller: ['تنظيف المكثف', 'فحص غاز التبريد', 'معالجة المياه'], compressor: ['تغيير فلتر الهواء والزيت', 'تصريف المياه', 'فحص الضغط والصمامات'], generator: ['تشغيل اختباري تحت حمل', 'فحص الزيت والمياه والبطارية', 'تغيير الفلاتر حسب الساعات']
    };
    const dd = (a, b) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / DAY);
    const addD = (d, n) => { const x = new Date(new Date(d + 'T12:00:00').getTime() + n * DAY); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    S.pmPlans = (S.machines || []).map((m) => {
      const span = Math.max(14, dd(m.lastPMAt, m.nextPMAt)); const freq = [30, 45, 60, 90].reduce((b, f) => (Math.abs(f - span) < Math.abs(b - span) ? f : b), 30);
      const history = []; let done = m.lastPMAt;
      for (let k = 0; k < 3; k++) { const late = rnd() < 0.18 ? between(4, 9) : between(0, 2); const due = addD(done, -late); history.push({ dueAt: due, doneAt: done, mwoId: null }); done = addD(due, -freq + between(-1, 1)); }
      const open = S.maintenanceOrders.find((x) => x.kind === 'preventive' && x.machineId === m.id && ['done', 'cancelled'].indexOf(x.status) < 0 && x.planId);
      return { id: 'PM-' + m.id.slice(2), machineId: m.id, title: 'صيانة وقائية — ' + m.name, freqDays: freq, freqHours: m.type === 'extruder' ? 500 : m.type === 'generator' ? 250 : null, tasks: TASKS[m.type] || ['فحص عام وتنظيف', 'تشحيم'], lastDoneAt: m.lastPMAt, nextDueAt: m.nextPMAt, ownerId: 'U-31', estH: m.criticality === 'A' ? 4 : 2, active: true, mwoId: open ? open.id : null, history: history.reverse() };
    });

    /* ── IT helpdesk: enrich + history, IT assets ── */
    S.itTickets = S.itTickets || [];
    S.itTickets.forEach((t) => { t.notes = t.notes || []; if (t.id === 'ITK-2026-0031') t.assetId = 'ITA-014'; });
    const IK = (n, title, req, cat, prio, status, hrsAgo, resH, o) => S.itTickets.push(Object.assign({ id: 'ITK-2026-' + String(n).padStart(4, '0'), title, requesterId: req, category: cat, priority: prio, status, assigneeId: status === 'open' ? null : 'U-09', openedAt: ago(hrsAgo * 60), resolvedAt: resH != null ? ago((hrsAgo - resH) * 60) : null, notes: [] }, o || {}));
    IK(28, 'تابلت خط التجاليد L-03 لا يتصل بالشبكة', 'U-13', 'hardware', 'high', 'open', 2, null, { assetId: 'ITA-019', desc: 'مطلوب لتسجيل الإنتاج فور عودة الخط.' });
    IK(27, 'إعادة تعيين كلمة مرور بوابة التاجر — معرض الأمل', 'U-04', 'account', 'normal', 'resolved', 26, 1);
    IK(26, 'ماسح الباركود في مخزن قطع الغيار لا يقرأ', 'U-31', 'hardware', 'normal', 'in_progress', 7, null, { assetId: 'ITA-017' });
    IK(25, 'طلب صلاحية تقرير أعمار الديون', 'U-06', 'erp', 'low', 'resolved', 50, 3);
    IK(24, 'طابعة المالية تطبع صفحات فارغة', 'U-06', 'hardware', 'normal', 'closed', 120, 5, { assetId: 'ITA-013' });
    IK(23, 'انقطاع الواي فاي في صالة الإنتاج', 'U-27', 'network', 'urgent', 'resolved', 200, 2, { assetId: 'ITA-022' });
    IK(22, 'تثبيت برنامج AutoCAD لمكتب الهندسة', 'U-13', 'software', 'low', 'resolved', 300, 30);
    IK(21, 'البريد لا يستقبل مرفقات كبيرة', 'U-04', 'software', 'normal', 'resolved', 410, 6);
    IK(20, 'لابتوب المندوب بطيء جدًا', 'U-05', 'hardware', 'normal', 'closed', 560, 20, { assetId: 'ITA-005' });
    S.itTickets.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
    const A = (n, kind, name, serial, assigneeId, location, deptId, status, pAgoDays, wDays) => ({ id: 'ITA-' + String(n).padStart(3, '0'), kind, name, serial, assigneeId, location, deptId, status, purchased: day(-pAgoDays), warrantyUntil: day(wDays) });
    S.itAssets = [
      A(1, 'laptop', 'Dell Latitude 5440', 'DL5440-01A7', 'U-01', 'مكتب الإدارة', 'D-01', 'in_use', 300, 795), A(2, 'laptop', 'Dell Latitude 5440', 'DL5440-02B3', 'U-03', 'مكتب الإدارة', 'D-01', 'in_use', 300, 795),
      A(3, 'laptop', 'Lenovo ThinkPad E14', 'LN-E14-3381', 'U-35', 'المالية', 'D-03', 'in_use', 520, 210), A(4, 'laptop', 'Lenovo ThinkPad E14', 'LN-E14-3382', 'U-04', 'المبيعات', 'D-02', 'in_use', 520, 210),
      A(5, 'laptop', 'HP ProBook 450', 'HP450-7731', 'U-05', 'المبيعات — ميداني', 'D-02', 'in_use', 980, -250), A(6, 'laptop', 'HP ProBook 450', 'HP450-7732', 'U-10', 'المبيعات — ميداني', 'D-02', 'in_use', 980, -250),
      A(7, 'laptop', 'HP ProBook 450', 'HP450-7733', 'U-11', 'المبيعات — ميداني', 'D-02', 'repair', 980, -250), A(8, 'desktop', 'HP ProDesk 400 G7', 'HPD-40011', 'U-06', 'المالية', 'D-03', 'in_use', 700, 30),
      A(9, 'desktop', 'HP ProDesk 400 G7', 'HPD-40012', 'U-07', 'مخزن المنتج التام', 'D-04', 'in_use', 700, 30), A(10, 'desktop', 'HP ProDesk 400 G7', 'HPD-40013', 'U-14', 'المشتريات', 'D-06', 'in_use', 700, 30),
      A(11, 'desktop', 'Dell OptiPlex 3000', 'DO3000-551', 'U-32', 'خدمة العملاء', 'D-16', 'in_use', 200, 895), A(12, 'desktop', 'Dell OptiPlex 3000', 'DO3000-552', 'U-31', 'مكتب الصيانة', 'D-12', 'in_use', 200, 895),
      A(13, 'printer', 'HP LaserJet Pro M404', 'HPLJ-M404-88', null, 'المالية', 'D-03', 'in_use', 1100, -400), A(14, 'printer', 'طابعة باركود Zebra ZT230', 'ZB-ZT230-114', null, 'مخزن المنتج التام', 'D-04', 'repair', 640, 90),
      A(15, 'printer', 'طابعة ملصقات Zebra ZD421', 'ZB-ZD421-202', null, 'خط اللامينيشن L-02', 'D-11', 'in_use', 260, 470), A(16, 'scanner', 'Zebra DS2208', 'ZB-DS2208-31', 'U-22', 'مخزن الخامات', 'D-04', 'in_use', 400, 330),
      A(17, 'scanner', 'Zebra DS2208', 'ZB-DS2208-32', 'U-31', 'مخزن قطع الغيار', 'D-12', 'repair', 400, 330), A(18, 'tablet', 'Samsung Galaxy Tab Active3', 'SM-T575-L01', null, 'خط بثق الأبواب L-01', 'D-09', 'in_use', 360, 5),
      A(19, 'tablet', 'Samsung Galaxy Tab Active3', 'SM-T575-L03', null, 'خط التجاليد L-03', 'D-10', 'in_use', 360, 5), A(20, 'tablet', 'Samsung Galaxy Tab Active3', 'SM-T575-L04', null, 'خط الفوم بورد L-04', 'D-18', 'in_use', 360, 5),
      A(21, 'network', 'FortiGate 60F — جدار الحماية', 'FG60F-0091', null, 'غرفة الخوادم', 'D-08', 'in_use', 450, 280), A(22, 'network', 'Ubiquiti U6-Pro — صالة الإنتاج', 'UBQ-U6P-07', null, 'صالة الإنتاج', 'D-08', 'in_use', 450, 280),
      A(23, 'network', 'Cisco CBS350 سويتش 24 منفذ', 'CBS350-24-3', null, 'غرفة الخوادم', 'D-08', 'in_use', 820, -90), A(24, 'server', 'Synology DS920+ — نسخ احتياطي', 'SYN-920-11', null, 'غرفة الخوادم', 'D-08', 'in_use', 610, 120),
      A(25, 'laptop', 'Dell Latitude 3440 (احتياطي)', 'DL3440-09', null, 'مخزن IT', 'D-08', 'spare', 90, 1005)
    ];
  });

  /* ═════════════════════════ helpers ═════════════════════════ */
  const get = (p) => st.get(p) || [];
  const me = () => SA.session.userId || 'SYSTEM';
  const nowIso = () => new Date().toISOString();
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const ms = (x) => (!x ? 0 : new Date(String(x).length === 10 ? x + 'T12:00:00' : x).getTime());
  const today = () => ERP.day(0);
  const addDays = (d, n) => ymd(new Date(ms(d) + n * DAY));
  const daysTo = (d) => Math.round((ms(d) - ms(today())) / DAY);
  const minsSince = (x) => Math.max(0, (Date.now() - ms(x)) / 60000);
  const dur = (min) => { min = Math.max(0, Math.round(min || 0)); const d = Math.floor(min / 1440), hh = Math.floor((min % 1440) / 60), mm = min % 60; return (d ? [d + ' يوم', hh ? hh + ' س' : ''] : hh ? [hh + ' س', mm ? mm + ' د' : ''] : [mm + ' د']).filter(Boolean).join(' '); };
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const chip = (map, k) => { const m = map[k]; return SA.chip(m ? m[0] : k || '—', m ? m[1] : 'neutral'); };
  const uname = (id) => (id ? SA.userName(id) : '—');
  const canRoute = (r) => { const m = SA.router.parse('#/' + r).module; return !!(m && SA.canOpen(m)); };
  const hrefIf = (r) => (canRoute(String(r).split('?')[0]) ? '#/' + r : null);
  const rlink = (route, label) => (hrefIf(route) ? h('a.erp-doc', { href: '#/' + route }, label) : h('span.num', {}, label));
  const doc = (id) => (id ? U.docLink(id) : '—');
  const mach = (id) => ERP.machine(id);
  const mName = (id) => { const m = mach(id); return m ? m.id + ' — ' + m.name : id || '—'; };
  const lName = (id) => { const l = id ? ERP.line(id) : null; return l ? l.name : '—'; };
  const techName = (id) => { const t = get('careTechs').find((x) => x.id === id); return t ? t.name : id || '—'; };
  const M_OPEN = (m) => ['done', 'cancelled'].indexOf(m.status) < 0;
  const T_OPEN = (t) => ['resolved', 'closed'].indexOf(t.status) < 0;
  const tOpened = (t) => t.openedAt || t.createdAt || nowIso();
  const isPortal = (t) => t.channel === PORTAL_CH || t.source === 'portal';
  const spareAvail = (itemId) => K.available(itemId, SPW);
  const spares = () => get('items').filter((i) => i.kind === 'spare');
  const logE = (text, icon, tone) => ({ at: nowIso(), by: me(), text, icon: icon || 'info', tone: tone || 'info' });
  const pushLog = (id, text, icon, tone) => st.patch('maintenanceOrders', id, (m) => { m.log = (m.log || []).concat([logE(text, icon, tone)]); });
  const tNote = (text, o) => Object.assign({ at: nowIso(), by: me(), text }, o || {});
  /** run a mutation through the simulated server (try/catch → SA.fail) and toast on success */
  const act = async (fn, ok) => { try { const r = await SA.api(fn); if (ok) SA.toast(typeof ok === 'function' ? ok(r) : ok, 'success'); return r === undefined ? true : r; } catch (e) { SA.fail(e); return undefined; } };
  const dtMinutes = (d) => (d.end ? d.minutes || Math.round((ms(d.end) - ms(d.start)) / 60000) : Math.round(minsSince(d.start)));

  function slaOf(t) {
    const o = ms(tOpened(t)); const due = o + (t.slaHours || 48) * HOUR; const closed = !T_OPEN(t);
    const end = closed ? ms(t.resolvedAt || t.closedAt) || Date.now() : Date.now();
    const paused = t.status === 'waiting_customer'; const leftH = (due - end) / HOUR;
    return { due, leftH, breached: !paused && leftH < 0, paused, closed, risk: !closed && !paused && leftH >= 0 && leftH < 6, pct: Math.max(0, Math.min(1, (end - o) / (due - o || 1))) };
  }
  /** tickets the user may see: support scope 'all' → all; sales people with own/team scope → their customers only */
  function visibleTickets() {
    const all = get('tickets');
    if (SA.scopeOf('support') === 'all') return all;
    const sc = SA.scopeOf('sales');
    if ((sc === 'own' || sc === 'team') && SA.can('crm.customers.view')) { const ok = new Set(SA.scopeFilter('sales', all.map((t) => ({ id: t.id, repId: (ERP.customer(t.customerId) || {}).salesRepId })), 'repId').map((x) => x.id)); return all.filter((t) => ok.has(t.id)); }
    return all;
  }
  const roleUsers = (perm) => get('users').filter((u) => { const r = SA.roleById(u.roleId); return u.status === 'active' && r && !r.isProtected && SA.roleCan(r, perm); });
  const assignees = (perm) => { const l = roleUsers(perm).map((u) => [u.id, u.name + ' — ' + SA.roleName(u.roleId)]); const u = SA.session.user; if (u && !l.some((x) => x[0] === u.id)) l.push([u.id, u.name + ' (أنا)']); return l; };

  /* ═════════════════════════ domain API (ERP.care) ═════════════════════════ */
  const CA = (ERP.care = {});
  CA.slaOf = slaOf;
  const STATUS_TXT = { assigned: 'تم إسناد التذكرة', in_progress: 'بدأت المعالجة', waiting_customer: 'بانتظار رد/بيانات من العميل', resolved: 'تم الحل', closed: 'أُغلقت التذكرة', open: 'أُعيد فتح التذكرة' };
  const tTarget = (t) => ({ type: 'ticket', id: t.id, label: ERP.customerName(t.customerId) + ' — ' + (t.title || '') });

  CA.createTicket = function (o) {
    const at = nowIso(); const prio = o.priority || 'normal'; const kind = o.kind || 'complaint';
    const t = { id: ERP.no('TKT'), kind, customerId: o.customerId, soId: o.soId || null, itemId: o.itemId || null, qty: o.qty ? Number(o.qty) : null, title: o.title, desc: o.desc || '', priority: prio, status: o.assigneeId ? 'assigned' : 'open',
      channel: o.channel || CHANNELS[0], assigneeId: o.assigneeId || null, assignedAt: o.assigneeId ? at : null, openedAt: at, slaHours: Number(o.slaHours) || SLA_H[prio] + (kind === 'installation' ? 24 : 0), warranty: !!o.warranty || kind === 'warranty', ncrId: null, notes: [], createdBy: me() };
    if (t.channel === PORTAL_CH) t.source = 'portal';
    st.insert('tickets', t, true);
    SA.audit('TKT.OPENED', { target: tTarget(t), after: { kind, priority: prio, channel: t.channel } });
    if (t.assigneeId) SA.audit('TKT.ASSIGNED', { target: tTarget(t), after: { assignee: uname(t.assigneeId) } });
    SA.notify(t.assigneeId && t.assigneeId !== me() ? { title: 'تذكرة مُسندة إليك: ' + t.id, body: t.title, level: 'action', toUsers: [t.assigneeId], link: '#/care/tickets/' + t.id }
      : { title: 'تذكرة عميل جديدة: ' + t.id, body: ERP.customerName(t.customerId) + ' — ' + t.title, level: prio === 'urgent' || prio === 'high' ? 'action' : 'info', to: ['R-19'], link: '#/care/tickets/' + t.id });
    if (kind === 'complaint' && (prio === 'high' || prio === 'urgent')) SA.notify({ title: 'شكوى عالية الأولوية: ' + t.id, body: t.title, level: 'action', to: ['R-09'], link: '#/care/tickets/' + t.id });
    return t;
  };
  /** status flow open→assigned→in_progress→waiting_customer→resolved→closed (o: {assigneeId, resolution, csat, csatNote, note, public}) */
  CA.ticketStatus = function (id, status, o) {
    o = o || {}; const t = ERP.find('tickets', id); if (!t) return null; const prev = t.status; const at = nowIso();
    st.patch('tickets', id, (x) => {
      x.status = status;
      if (o.assigneeId) { x.assigneeId = o.assigneeId; x.assignedAt = at; } else if (status === 'assigned' && !x.assigneeId) { x.assigneeId = me(); x.assignedAt = at; }
      if (status === 'resolved') { x.resolvedAt = at; x.resolution = o.resolution || ''; }
      if (status === 'closed') { x.closedAt = at; if (!x.resolvedAt) x.resolvedAt = at; if (o.csat) x.csat = Number(o.csat); if (o.csatNote) x.csatNote = o.csatNote; }
      if ((status === 'in_progress' || status === 'open') && (prev === 'resolved' || prev === 'closed')) { x.resolvedAt = null; x.closedAt = null; x.reopenedAt = at; }
      const txt = o.note || (o.assigneeId && status === prev ? 'إعادة إسناد إلى ' + uname(o.assigneeId) : STATUS_TXT[status] + (o.assigneeId ? ' — ' + uname(o.assigneeId) : '') + (o.resolution ? ': ' + o.resolution : ''));
      x.notes = (x.notes || []).concat([tNote(txt, { sys: !o.note, public: !!o.public || (isPortal(x) && (status === 'resolved' || status === 'closed')) })]);
    });
    const code = status === 'resolved' ? 'TKT.RESOLVED' : status === 'closed' ? 'TKT.CLOSED' : o.assigneeId || status === 'assigned' ? 'TKT.ASSIGNED' : 'TKT.UPDATED';
    SA.audit(code, { target: tTarget(t), before: { status: prev }, after: Object.assign({ status }, o.csat ? { csat: Number(o.csat) } : {}, o.assigneeId ? { assignee: uname(o.assigneeId) } : {}), reason: o.resolution || o.note || '' });
    if (o.assigneeId && o.assigneeId !== me()) SA.notify({ title: 'تذكرة مُسندة إليك: ' + id, body: t.title, level: 'action', toUsers: [o.assigneeId], link: '#/care/tickets/' + id });
    return ERP.find('tickets', id);
  };
  CA.addNote = function (id, text, isPublic) {
    const t = ERP.find('tickets', id); if (!t) return null;
    st.patch('tickets', id, (x) => { x.notes = (x.notes || []).concat([tNote(text, { public: !!isPublic })]); });
    SA.audit('TKT.UPDATED', { target: tTarget(t), after: { note: String(text).slice(0, 90), visibleToCustomer: !!isPublic } });
    return true;
  };
  CA.openTicketNCR = function (id, o) {
    const t = ERP.find('tickets', id); if (!t || t.ncrId) return null; o = o || {};
    const ncr = F.openNCR({ source: 'customer', refType: 'ticket', refId: id, qcId: null, itemId: o.itemId || t.itemId, qty: Number(o.qty || t.qty || 1), defectCode: o.defectCode || 'D02', severity: o.severity || 'minor', note: o.note || t.title });
    st.patch('tickets', id, (x) => { x.ncrId = ncr.id; x.notes = (x.notes || []).concat([tNote('فُتح عدم مطابقة ' + ncr.id + ' وتم إبلاغ الجودة', { sys: true })]); });
    return ncr;
  };

  /* visits */
  CA.scheduleVisit = function (o) {
    const v = { id: ERP.no('VS'), kind: o.kind || 'installation', ticketId: o.ticketId || null, customerId: o.customerId, techId: o.techId, date: o.date, time: o.time || '10:00', durH: Number(o.durH) || 2, address: o.address || '', notes: o.notes || '', status: 'scheduled', report: null, createdBy: me(), createdAt: nowIso() };
    st.insert('visits', v, true);
    if (v.ticketId) st.patch('tickets', v.ticketId, (x) => { x.visitIds = (x.visitIds || []).concat([v.id]); x.notes = (x.notes || []).concat([tNote('تم تحديد موعد ' + VKIND[v.kind] + ' (' + v.id + ') يوم ' + ERP.fmt.date(v.date) + ' الساعة ' + v.time + ' — الفني: ' + techName(v.techId), { sys: true, public: true })]); if (x.status === 'open') { x.status = 'assigned'; x.assigneeId = x.assigneeId || me(); x.assignedAt = x.assignedAt || nowIso(); } });
    SA.audit('VISIT.SCHEDULED', { target: { type: 'visit', id: v.id, label: ERP.customerName(v.customerId) }, after: { kind: VKIND[v.kind], date: v.date + ' ' + v.time, tech: techName(v.techId), ticket: v.ticketId } });
    SA.notify({ title: 'زيارة مجدولة: ' + VKIND[v.kind] + ' — ' + ERP.customerName(v.customerId), body: ERP.fmt.date(v.date) + ' ' + v.time + ' · ' + techName(v.techId) + (v.address ? ' · ' + v.address : ''), level: 'info', to: ['R-19'], link: '#/care/visits?v=' + v.id });
    return v;
  };
  CA.completeVisit = function (id, r) {
    const v = ERP.find('visits', id); if (!v || v.status !== 'scheduled') return null; r = r || {};
    const rep = { result: r.result || 'ok', measurements: r.measurements || [], notes: r.notes || '', photos: r.photos || 0, signedBy: r.signedBy || null, signedAt: r.signedBy ? nowIso() : null, by: me(), at: nowIso() };
    st.patch('visits', id, { status: 'done', report: rep, doneAt: nowIso() });
    if (v.ticketId) {
      st.patch('tickets', v.ticketId, (x) => { x.notes = (x.notes || []).concat([tNote('تمت ' + VKIND[v.kind] + ' ' + id + (rep.notes ? ': ' + rep.notes : '') + (rep.signedBy ? ' — توقيع العميل: ' + rep.signedBy : ''), { sys: true, public: true })]); });
      const t = ERP.find('tickets', v.ticketId); if (r.resolveTicket && t && T_OPEN(t)) CA.ticketStatus(v.ticketId, 'resolved', { resolution: 'تمت ' + VKIND[v.kind] + ' بنجاح (' + id + ')' });
    }
    SA.audit('VISIT.DONE', { target: { type: 'visit', id, label: ERP.customerName(v.customerId) }, after: { result: rep.result, measurements: rep.measurements.length, signedBy: rep.signedBy || '—' } });
    return ERP.find('visits', id);
  };
  CA.cancelVisit = function (id, reason) {
    const v = ERP.find('visits', id); if (!v || v.status !== 'scheduled') return null;
    st.patch('visits', id, { status: 'cancelled', cancelReason: reason || '', cancelledAt: nowIso() });
    SA.audit('VISIT.CANCELLED', { target: { type: 'visit', id, label: ERP.customerName(v.customerId) }, reason });
    return true;
  };

  /* warranty */
  CA.openClaim = function (o) {
    const c = { id: ERP.no('WC'), ticketId: o.ticketId || null, customerId: o.customerId, itemId: o.itemId, qty: Number(o.qty) || 1, reason: o.reason || '', status: 'pending', openedBy: me(), openedAt: nowIso(), decidedBy: null, decidedAt: null, decisionNote: '', replacementSoId: null, evidence: o.evidence || '' };
    st.insert('warrantyClaims', c, true);
    if (c.ticketId) st.patch('tickets', c.ticketId, (x) => { x.claimId = c.id; x.warranty = true; x.notes = (x.notes || []).concat([tNote('فُتحت مطالبة ضمان ' + c.id + ' — بانتظار قرار الإدارة', { sys: true })]); });
    SA.audit('WARRANTY.OPENED', { target: { type: 'warranty_claim', id: c.id, label: ERP.customerName(c.customerId) }, after: { item: ERP.itemName(c.itemId), qty: c.qty, ticket: c.ticketId } });
    SA.notify({ title: 'مطالبة ضمان بانتظار القرار: ' + c.id, body: ERP.customerName(c.customerId) + ' — ' + ERP.itemName(c.itemId) + ' × ' + c.qty, level: 'action', to: ['R-02', 'R-01'], link: '#/care/warranty?q=' + c.id });
    return c;
  };
  /** approve → replacement sales order at price 0 (ERP.flow.createOrder + confirmOrder: reserves FG stock or plans a WO) */
  CA.decideClaim = function (id, approve, note) {
    const c = ERP.find('warrantyClaims', id); if (!c || c.status !== 'pending') return null; let so = null; let soStatus = null;
    if (approve) { so = F.createOrder({ customerId: c.customerId, lines: [{ itemId: c.itemId, qty: c.qty, price: 0 }], notes: 'استبدال ضمان — ' + c.id + (c.ticketId ? ' / ' + c.ticketId : ''), priority: 'high', promisedDate: ERP.day(7) }); soStatus = F.confirmOrder(so.id); }
    st.patch('warrantyClaims', id, { status: approve ? 'approved' : 'rejected', decidedBy: me(), decidedAt: nowIso(), decisionNote: note || '', replacementSoId: so ? so.id : null });
    if (c.ticketId) st.patch('tickets', c.ticketId, (x) => { x.notes = (x.notes || []).concat([tNote(approve ? 'اعتُمدت مطالبة الضمان ' + id + ' — أمر استبدال ' + so.id + ' (' + (soStatus === 'ready' ? 'من المخزون' : 'قيد التصنيع') + ')' : 'رُفضت مطالبة الضمان ' + id + (note ? ': ' + note : ''), { sys: true, public: true })]); if (approve && (x.status === 'open' || x.status === 'assigned')) x.status = 'in_progress'; });
    SA.audit('WARRANTY.DECIDED', { target: { type: 'warranty_claim', id, label: ERP.customerName(c.customerId) }, before: { status: 'pending' }, after: { status: approve ? 'approved' : 'rejected', replacementOrder: so ? so.id : null, qty: c.qty }, reason: note || '' });
    SA.notify({ title: (approve ? 'اعتُمدت' : 'رُفضت') + ' مطالبة الضمان ' + id, body: ERP.customerName(c.customerId) + ' — ' + ERP.itemName(c.itemId) + ' × ' + c.qty + (so ? ' · أمر الاستبدال ' + so.id : '') + (note ? ' · ' + note : ''), level: approve ? 'action' : 'info', to: ['R-19'], link: c.ticketId ? '#/care/tickets/' + c.ticketId : '#/care/warranty' });
    return { claim: ERP.find('warrantyClaims', id), so: so ? ERP.find('salesOrders', so.id) : null };
  };

  /* plant maintenance */
  CA.nextDT = () => 'DT-' + (Math.max(500, ...get('downtime').map((d) => Number(String(d.id).replace(/\D/g, '')) || 0)) + 1);
  /** line down + downtime record + hold running WOs of that line */
  CA.stopLine = function (lineId, machineId, mwoId, reason) {
    const ln = ERP.line(lineId); if (!ln) return null; const at = nowIso(); const mc = mach(machineId);
    if (ln.status !== 'down') { const prev = ln.status; st.patch('lines', lineId, { status: 'down', downSince: at, downReason: reason }); SA.audit('LINE.STATUS_CHANGED', { target: { type: 'line', id: lineId, label: ln.name }, before: { status: prev }, after: { status: 'down' }, reason }); }
    const dt = { id: CA.nextDT(), lineId, machineId: machineId || null, start: at, end: null, minutes: 0, reason, category: 'breakdown', mwoId: mwoId || null };
    st.insert('downtime', dt, true);
    const held = [];
    get('workOrders').filter((w) => w.lineId === lineId && w.status === 'in_progress').forEach((w) => { st.patch('workOrders', w.id, { status: 'on_hold', holdReason: 'عطل ' + (mc ? mc.id + ' ' + mc.name : reason) + ' — أمر صيانة ' + (mwoId || ''), heldAt: at }); held.push(w.id); SA.audit('WO.HELD', { target: { type: 'work_order', id: w.id, label: ERP.itemName(w.itemId) }, before: { status: 'in_progress' }, after: { status: 'on_hold' }, reason: 'توقف ' + ln.name }); });
    if (mwoId) pushLog(mwoId, 'إيقاف ' + ln.name + ' وتسجيل توقف ' + dt.id + (held.length ? ' — أوامر تشغيل متوقفة: ' + held.join('، ') : ''), 'factory', 'danger');
    SA.notify({ title: ln.name + ' متوقف — ' + (mc ? mc.id : 'عطل'), body: reason + (held.length ? ' · أوامر تشغيل على الانتظار: ' + held.join('، ') : ''), level: 'urgent', to: ['R-05', 'R-01', 'R-18'], link: mwoId ? '#/care/maintenance/' + mwoId : '#/mfg/lines/' + lineId });
    return { downtime: dt, held };
  };
  CA.createMWO = function (o) {
    const mc = mach(o.machineId); const at = nowIso(); const kind = o.kind || 'breakdown';
    const mwo = { id: ERP.no('MWO'), kind, machineId: o.machineId, lineId: mc ? mc.lineId : null, title: o.title, desc: o.desc || '', priority: o.priority || (kind === 'breakdown' ? 'high' : 'normal'), status: kind === 'breakdown' ? 'requested' : 'scheduled', reportedBy: me(), assigneeId: o.assigneeId || 'U-31',
      openedAt: at, startedAt: null, doneAt: null, plannedAt: kind === 'breakdown' ? null : o.plannedAt || today(), downtimeMin: 0, parts: (o.parts || []).filter((p) => p && p.itemId && Number(p.qty) > 0).map((p) => ({ itemId: p.itemId, qty: Number(p.qty), issued: false })), cost: null,
      checklist: o.checklist || null, planId: o.planId || null, log: [logE(kind === 'breakdown' ? 'بلاغ عطل: ' + o.title : 'أمر صيانة ' + MKIND[kind][0] + ' مجدول ' + ERP.fmt.date(o.plannedAt || today()), kind === 'breakdown' ? 'alert' : 'calendar', kind === 'breakdown' ? 'danger' : 'info')] };
    st.insert('maintenanceOrders', mwo, true);
    if (o.audit !== false) SA.audit('MNT.REQUESTED', { target: { type: 'mwo', id: mwo.id, label: mName(mwo.machineId) }, after: { kind: MKIND[kind][0], priority: mwo.priority, title: mwo.title }, severity: kind === 'breakdown' ? 'high' : undefined });
    if (kind === 'breakdown' && mc && mc.status !== 'down') { const prev = mc.status; st.patch('machines', mc.id, { status: 'down', downSince: at }); SA.audit('MNT.ASSET_STATUS', { target: { type: 'machine', id: mc.id, label: mc.name }, before: { status: prev }, after: { status: 'down' }, reason: mwo.id }); }
    if (o.stopLine && mwo.lineId) CA.stopLine(mwo.lineId, mwo.machineId, mwo.id, o.title);
    if (kind === 'breakdown') SA.notify({ title: 'بلاغ عطل: ' + mName(mwo.machineId), body: mwo.title + (o.stopLine && mwo.lineId ? ' — ' + lName(mwo.lineId) + ' متوقف' : ''), level: o.stopLine || mwo.priority === 'urgent' ? 'urgent' : 'action', to: ['R-18'], link: '#/care/maintenance/' + mwo.id });
    return ERP.find('maintenanceOrders', mwo.id);
  };
  CA.setStatus = function (id, status, o) {
    o = o || {}; const m = ERP.find('maintenanceOrders', id); if (!m) return null; const prev = m.status; const first = status === 'in_progress' && !m.startedAt;
    st.patch('maintenanceOrders', id, (x) => { x.status = status; if (status === 'in_progress' && !x.startedAt) x.startedAt = nowIso(); if (status === 'scheduled' && o.date) x.plannedAt = o.date; if (status === 'cancelled') x.cancelReason = o.reason || '';
      x.log = (x.log || []).concat([logE({ scheduled: 'جدولة التنفيذ ' + (o.date ? ERP.fmt.date(o.date) : ''), in_progress: prev === 'waiting_parts' ? 'استئناف التنفيذ' : 'بدء التنفيذ', waiting_parts: 'بانتظار قطع غيار', cancelled: 'إلغاء الأمر: ' + (o.reason || '') }[status] || status, status === 'cancelled' ? 'x' : 'wrench', status === 'waiting_parts' ? 'warning' : 'info')]); });
    const mc = mach(m.machineId); if (status === 'in_progress' && m.kind !== 'breakdown' && mc && (mc.status === 'running' || mc.status === 'idle')) st.patch('machines', mc.id, { status: 'maintenance' });
    SA.audit(first ? 'MNT.STARTED' : 'MNT.STATUS_CHANGED', { target: { type: 'mwo', id, label: mName(m.machineId) }, before: { status: prev }, after: { status }, reason: o.reason || '' });
    return ERP.find('maintenanceOrders', id);
  };
  CA.addPart = function (id, itemId, qty) { st.patch('maintenanceOrders', id, (m) => { m.parts = (m.parts || []).concat([{ itemId, qty: Number(qty), issued: false }]); m.log = (m.log || []).concat([logE('إضافة قطعة غيار: ' + ERP.itemName(itemId) + ' × ' + qty, 'plus', 'info')]); }); SA.audit('MNT.STATUS_CHANGED', { target: { type: 'mwo', id, label: mName((ERP.find('maintenanceOrders', id) || {}).machineId) }, after: { part: ERP.itemName(itemId), qty: Number(qty) } }); return true; };
  CA.removePart = function (id, idx) { st.patch('maintenanceOrders', id, (m) => { const p = m.parts[idx]; if (p && !p.issued) { m.parts.splice(idx, 1); m.log = (m.log || []).concat([logE('حذف قطعة: ' + ERP.itemName(p.itemId), 'trash', 'info')]); } }); return true; };
  CA.shortParts = (m) => (m.parts || []).filter((p) => !p.issued).map((p) => ({ itemId: p.itemId, need: p.qty, avail: spareAvail(p.itemId), short: Math.max(0, p.qty - spareAvail(p.itemId)) })).filter((x) => x.short > 0);
  /** issue a spare part line from W-05 → stock move 'issue' + GL (Dr 5302 maintenance / Cr 1144 spares) + SPARE.ISSUED */
  CA.issuePart = function (id, idx) {
    const m = ERP.find('maintenanceOrders', id); const p = m && m.parts[idx]; if (!p || p.issued) return { ok: false, reason: 'تم الصرف من قبل' };
    const av = spareAvail(p.itemId); if (av < p.qty) return { ok: false, reason: 'الرصيد المتاح في مخزن قطع الغيار ' + av + ' فقط' };
    const it = ERP.item(p.itemId) || {}; const val = Math.round(p.qty * (it.stdCost || 0));
    K.move({ itemId: p.itemId, whId: SPW, qty: -p.qty, type: 'issue', ref: { type: 'mwo', id }, note: 'صرف لأمر الصيانة ' + id + ' — ' + mName(m.machineId) });
    if (val > 0) ERP.gl.post({ memo: 'صرف قطع غيار لأمر الصيانة ' + id + ' — ' + mName(m.machineId), ref: { type: 'mwo', id }, lines: [{ acc: '5302', dr: val }, { acc: '1144', cr: val }] });
    st.patch('maintenanceOrders', id, (x) => { const y = x.parts[idx]; y.issued = true; y.issuedAt = nowIso(); y.issuedBy = me(); y.value = val; x.log = (x.log || []).concat([logE('صرف ' + ERP.itemName(p.itemId) + ' × ' + p.qty + ' من مخزن قطع الغيار', 'box', 'success')]); if (x.status === 'waiting_parts' && x.parts.every((z) => z.issued)) { x.status = 'in_progress'; x.startedAt = x.startedAt || nowIso(); } });
    SA.audit('SPARE.ISSUED', { target: { type: 'item', id: p.itemId, label: it.name }, after: { qty: p.qty, mwo: id, machine: m.machineId, balanceW05: K.qty(p.itemId, SPW) } });
    return { ok: true };
  };
  /** urgent purchase requisitions for the short lines (source 'maintenance') */
  /** suggested purchase quantity per short part line (>= shortage, >= MOQ) — the user can edit it before the request */
  CA.suggestLines = (m) => CA.shortParts(m).map((s) => ({ itemId: s.itemId, qty: Math.max(s.short, (ERP.item(s.itemId) || {}).moq || 1), short: s.short }));
  CA.requestParts = function (id, lines) {
    const m = ERP.find('maintenanceOrders', id); if (!m) return []; const out = [];
    (lines || CA.suggestLines(m)).filter((s) => Number(s.qty) > 0).forEach((s) => { const r = F.createPRQ({ itemId: s.itemId, qty: Number(s.qty), reason: 'عاجل — ' + (m.kind === 'breakdown' ? 'عطل ' : 'صيانة ') + mName(m.machineId) + ' (' + id + ')', source: 'maintenance', neededBy: today() }); out.push(r.id); });
    if (out.length) st.patch('maintenanceOrders', id, (x) => { x.prqIds = (x.prqIds || []).concat(out); if (['requested', 'scheduled', 'in_progress'].indexOf(x.status) >= 0) x.status = 'waiting_parts'; x.log = (x.log || []).concat([logE('طلب شراء عاجل ' + out.join('، '), 'cart', 'warning')]); });
    return out;
  };
  const spendLines = (m) => (m.spendLines && m.spendLines.length ? m.spendLines : CA.shortParts(m).map((s) => ({ itemId: s.itemId, qty: Math.max(s.short, (ERP.item(s.itemId) || {}).moq || 1) })));
  /** maintenance_spend approval (production manager) for the short parts */
  CA.requestSpend = function (id, edited) {
    const m = ERP.find('maintenanceOrders', id); if (!m) return null; const lines = edited ? edited.filter((l) => Number(l.qty) > 0).map((l) => ({ itemId: l.itemId, qty: Number(l.qty) })) : spendLines(m); if (!lines.length) return null;
    const amount = Math.round(lines.reduce((s, l) => s + l.qty * ((ERP.item(l.itemId) || {}).stdCost || 0), 0));
    const ap = SA.requestApproval({ type: 'maintenance_spend', area: 'care', title: 'شراء عاجل: ' + lines.map((l) => ERP.itemName(l.itemId)).join('، ') + ' — ' + mName(m.machineId), amount, chain: [{ roleId: 'R-05', label: 'مدير الإنتاج' }],
      context: [['أمر الصيانة', id], ['الماكينة', mName(m.machineId)], ['القطع', lines.map((l) => ERP.itemName(l.itemId) + ' × ' + l.qty).join('، ')], ['القيمة التقديرية', ERP.fmt.money(amount)], ['المورد', ERP.supplierName((ERP.item(lines[0].itemId) || {}).supplierId)], ['حدود الاعتماد', 'تجريبية — الحدود الفعلية Open']], ref: { type: 'maintenance_spend', id } });
    st.patch('maintenanceOrders', id, (x) => { x.spendApprovalId = ap.id; x.spendDecision = null; x.spendLines = lines; x.log = (x.log || []).concat([logE('طلب اعتماد صرف ' + ap.id + ' من مدير الإنتاج', 'inbox', 'warning')]); });
    return ap;
  };
  /** after approval: PO(s) for the short parts (createPO → submitPO → sendPO) */
  CA.orderParts = function (id, apId) {
    const m = ERP.find('maintenanceOrders', id); if (!m || m.poId) return null; const lines = spendLines(m);
    if (!lines.length) { st.patch('maintenanceOrders', id, { approvedSpend: true, spendApprovalId: apId || m.spendApprovalId || null }); return []; }
    const bySup = {}; lines.forEach((l) => { const s = (ERP.item(l.itemId) || {}).supplierId || 'S-010'; (bySup[s] = bySup[s] || []).push(l); });
    const pos = Object.keys(bySup).map((sid) => {
      const ls = bySup[sid]; const prqIds = get('purchaseRequisitions').filter((r) => (r.status === 'open' || r.status === 'approved') && ls.some((l) => l.itemId === r.itemId) && (r.source === 'maintenance' || (m.prqIds || []).indexOf(r.id) >= 0)).map((r) => r.id);
      const po = F.createPO({ supplierId: sid, lines: ls.map((l) => ({ itemId: l.itemId, qty: l.qty })), prqIds, expectedDate: ERP.day(1), notes: 'شراء عاجل لأمر الصيانة ' + id + (apId ? ' — اعتماد ' + apId : '') + ' (خط متوقف)' });
      if (F.submitPO(po.id) === 'approved') F.sendPO(po.id);
      return ERP.find('purchaseOrders', po.id);
    });
    st.patch('maintenanceOrders', id, (x) => { x.approvedSpend = true; x.spendApprovalId = apId || x.spendApprovalId || null; x.spendDecision = 'approved'; x.poId = pos[0].id; x.poIds = pos.map((p) => p.id); x.prqIds = Array.from(new Set((x.prqIds || []).concat(...pos.map((p) => p.prqIds || []))));
      x.log = (x.log || []).concat([logE('اعتُمد الصرف — أمر شراء ' + pos.map((p) => p.id + ' (' + ((C.status.po[p.status] || [])[0] || p.status) + ')').join('، ') + ' — ' + ERP.supplierName(pos[0].supplierId), 'truck', 'success')]); });
    SA.audit('MNT.PARTS_ORDERED', { target: { type: 'mwo', id, label: mName(m.machineId) }, after: { po: pos.map((p) => p.id).join('، '), approval: apId || null, parts: lines.map((l) => ERP.itemName(l.itemId) + ' × ' + l.qty).join('، ') } });
    SA.notify({ title: 'شراء عاجل: ' + lines.map((l) => ERP.itemName(l.itemId)).join('، '), body: 'اعتمد مدير الإنتاج الصرف (' + (apId || '—') + '). أمر الشراء ' + pos.map((p) => p.id).join('، ') + ' أُرسل للمورد ' + ERP.supplierName(pos[0].supplierId) + ' — تابع التوريد اليوم، ' + lName(m.lineId) + ' متوقف.', level: 'urgent', to: ['R-08'], link: '#/scm/po/' + pos[0].id });
    SA.notify({ title: 'تم اعتماد شراء قطع الغيار — ' + id, body: 'أمر الشراء ' + pos[0].id + ' — استلم القطعة فور وصولها واصرفها للأمر.', level: 'info', to: ['R-18'], link: '#/care/maintenance/' + id });
    return pos;
  };
  const EMERG = 'إفراج طارئ بمعرفة الصيانة — خط متوقف. الفحص التفصيلي لاحقًا (مطلوب من الجودة).';
  /** receive the PO → GRN (pending_qc, W-05) + incoming QC; mode 'emergency' releases the QC as «مقبول بشرط» right away */
  CA.receiveParts = function (id, mode) {
    const m = ERP.find('maintenanceOrders', id); const po = m && ERP.find('purchaseOrders', m.poId);
    if (!po || ['approved', 'sent', 'partially_received'].indexOf(po.status) < 0) return null;
    const grn = F.receivePO(po.id); if (!grn) return null;
    st.patch('maintenanceOrders', id, (x) => { x.grnId = grn.id; x.log = (x.log || []).concat([logE('استلام ' + grn.id + ' من ' + ERP.supplierName(po.supplierId) + ' — بانتظار فحص الاستلام', 'download', 'info')]); });
    SA.audit('MNT.PARTS_RECEIVED', { target: { type: 'mwo', id, label: mName(m.machineId) }, after: { grn: grn.id, po: po.id, mode: mode === 'emergency' ? 'إفراج طارئ' : 'عادي (فحص جودة)' } });
    if (mode === 'emergency') CA.releaseQC(id);
    return ERP.find('grns', grn.id);
  };
  CA.releaseQC = function (id) {
    const m = ERP.find('maintenanceOrders', id); const grn = m && ERP.find('grns', m.grnId); if (!grn) return 0; let n = 0;
    (grn.qcIds || []).forEach((qid) => { const q = ERP.find('qcInspections', qid); if (q && q.result === 'pending') { F.recordQC(qid, { result: 'conditional', acceptedQty: q.qty, note: EMERG }); n++; } });
    if (n) {
      st.patch('maintenanceOrders', id, (x) => { x.emergencyRelease = { at: nowIso(), by: me() }; x.log = (x.log || []).concat([logE('إفراج طارئ: القطعة دخلت مخزن قطع الغيار (مقبول بشرط) — تحقق لاحق من الجودة', 'bolt', 'warning')]); });
      SA.notify({ title: 'تحقق لاحق مطلوب: إفراج طارئ ' + grn.id, body: 'قطعة غيار استُلمت بإفراج طارئ لأمر الصيانة ' + id + ' (خط متوقف). راجع الفحص التفصيلي.', level: 'action', to: ['R-09'], link: '#/mfg/qc/' + (grn.qcIds || [])[0] });
    }
    return n;
  };
  /** complete: machine running · close open downtime · line running · held WOs back in progress · notify production + sales */
  CA.completeMWO = function (id, o) {
    o = o || {}; const m = ERP.find('maintenanceOrders', id); if (!m || !M_OPEN(m)) return null;
    const at = nowIso(); const mc = mach(m.machineId); const ln = m.lineId ? ERP.line(m.lineId) : null;
    const partsCost = (m.parts || []).filter((p) => p.issued).reduce((s, p) => s + (p.value != null ? p.value : p.qty * ((ERP.item(p.itemId) || {}).stdCost || 0)), 0);
    const cost = Math.round(partsCost + (Number(o.labourCost) || 0));
    let dtMin = 0; const closed = [];
    st.update('downtime', (l) => { l.forEach((d) => { if (!d.end && (d.mwoId === id || (!d.mwoId && m.machineId && d.machineId === m.machineId))) { d.end = at; d.minutes = Math.round((ms(at) - ms(d.start)) / 60000); dtMin = Math.max(dtMin, d.minutes); closed.push(d.id); } }); });
    const repairMin = Math.round((ms(at) - ms(m.openedAt)) / 60000);
    st.patch('maintenanceOrders', id, (x) => { x.status = 'done'; x.doneAt = at; x.startedAt = x.startedAt || at; x.rootCause = o.rootCause || x.rootCause || ''; x.action = o.action || ''; x.labourH = o.labourH ? Number(o.labourH) : null; x.labourCost = Number(o.labourCost) || 0; x.cost = cost; x.downtimeMin = Math.max(dtMin, x.downtimeMin || 0);
      if (o.checklist) x.checklist = o.checklist; x.log = (x.log || []).concat([logE('تم إتمام الصيانة' + (x.rootCause ? ' — السبب: ' + x.rootCause : ''), 'checkcircle', 'success')]); });
    if (mc) { const prev = mc.status; st.patch('machines', mc.id, (x) => { x.status = 'running'; x.downSince = null; if (m.kind === 'breakdown') { x.lastFailureAt = m.openedAt; x.mttrH = Math.round((((x.mttrH || 0) * 9 + repairMin / 60) / 10) * 10) / 10; } if (m.kind === 'preventive') x.lastPMAt = today(); });
      if (prev !== 'running') SA.audit('MNT.ASSET_STATUS', { target: { type: 'machine', id: mc.id, label: mc.name }, before: { status: prev }, after: { status: 'running' }, reason: 'إتمام ' + id }); }
    if (m.kind === 'preventive') { const pl = get('pmPlans').find((p) => p.mwoId === id) || (m.planId ? ERP.find('pmPlans', m.planId) : null) || get('pmPlans').find((p) => p.machineId === m.machineId);
      if (pl) { const next = addDays(today(), pl.freqDays || 30); st.patch('pmPlans', pl.id, (p) => { p.history = (p.history || []).concat([{ dueAt: p.nextDueAt, doneAt: today(), mwoId: id }]); p.lastDoneAt = today(); p.nextDueAt = next; p.mwoId = null; }); if (mc) st.patch('machines', mc.id, { lastPMAt: today(), nextPMAt: next }); } }
    let lineRestarted = false; const resumed = [];
    if (ln && ln.status === 'down' && o.restartLine !== false && !get('downtime').some((d) => d.lineId === ln.id && !d.end)) {
      st.patch('lines', ln.id, { status: 'running', downSince: null, downReason: null, upSince: at, lastDownMin: dtMin }); lineRestarted = true;
      SA.audit('LINE.STATUS_CHANGED', { target: { type: 'line', id: ln.id, label: ln.name }, before: { status: 'down' }, after: { status: 'running' }, reason: 'إتمام أمر الصيانة ' + id + ' — توقف ' + dur(dtMin) });
    }
    if (ln && ln.status === 'running' && o.resumeWOs !== false) {
      get('workOrders').filter((w) => w.status === 'on_hold' && w.lineId === ln.id && w.holdReason && !w.ncrId).forEach((w) => {
        st.patch('workOrders', w.id, { status: 'in_progress', resumedAt: at, lastHoldReason: w.holdReason, holdReason: null }); resumed.push(w.id);
        SA.audit('WO.RESUMED', { target: { type: 'work_order', id: w.id, label: ERP.itemName(w.itemId) }, before: { status: 'on_hold' }, after: { status: 'in_progress', line: ln.id }, reason: 'عودة ' + ln.name + ' بعد إتمام ' + id });
      });
      if (resumed.length) st.patch('lines', ln.id, { currentWoId: resumed[0] });
    }
    if (lineRestarted || resumed.length) st.patch('maintenanceOrders', id, (x) => { x.recovery = { lineRestarted, resumed, downtimeMin: dtMin, at }; x.log = (x.log || []).concat([logE((lineRestarted ? 'عاد ' + ln.name + ' للعمل' : '') + (resumed.length ? ' — استئناف ' + resumed.join('، ') : ''), 'play', 'success')]); });
    SA.audit('MNT.COMPLETED', { target: { type: 'mwo', id, label: mName(m.machineId) }, after: { rootCause: o.rootCause || '', downtime: dur(dtMin), cost, lineRestarted, resumedWOs: resumed.join('، ') || '—' } });
    const sos = Array.from(new Set(resumed.map((w) => (ERP.find('workOrders', w) || {}).soId).filter(Boolean)));
    if (lineRestarted || resumed.length) {
      const soTxt = sos.map((s) => s + ' (' + ERP.customerName((ERP.find('salesOrders', s) || {}).customerId) + ')').join('، ');
      SA.notify({ title: 'عاد ' + ln.name + ' للعمل', body: 'تم إصلاح ' + mName(m.machineId) + ' (' + id + ') بعد توقف ' + dur(dtMin) + '.' + (resumed.length ? ' استُؤنف ' + resumed.join('، ') + ' — تابع خطة الإنتاج.' : ''), level: 'action', to: ['R-05', 'R-01', 'R-02'], link: resumed[0] ? '#/' + ERP.route(resumed[0]) : '#/care/maintenance/' + id });
      SA.notify({ title: 'خط الإنتاج عاد — الطلبات المتأثرة تستأنف', body: ln.name + ' يعمل الآن.' + (soTxt ? ' الطلبات: ' + soTxt + '.' : ''), level: 'info', to: ['R-03'], toUsers: sos.map((s) => (ERP.find('salesOrders', s) || {}).repId).filter(Boolean), link: sos[0] ? '#/' + ERP.route(sos[0]) : '#/care/maintenance/' + id });
      const sh = get('shipments').find((x) => (x.soIds || []).some((s) => sos.indexOf(s) >= 0)); if (sh) SA.notify({ title: 'شحنة ' + sh.id + ' لم تعد مهددة', body: 'عاد ' + ln.name + ' — أوامر التشغيل لطلب التصدير تستأنف.', level: 'info', to: ['R-17'], link: '#/scm/shipments/' + sh.id });
    } else SA.notify({ title: 'تم إتمام أمر الصيانة ' + id, body: mName(m.machineId) + ' — ' + (o.rootCause || m.title), level: 'info', to: ['R-05'], link: '#/care/maintenance/' + id });
    return { downtimeMin: dtMin, lineRestarted, resumed, cost, closedDowntime: closed, orders: sos };
  };
  CA.schedulePM = function (planId, date) {
    const pl = ERP.find('pmPlans', planId); if (!pl) return null; const cur = pl.mwoId ? ERP.find('maintenanceOrders', pl.mwoId) : null; if (cur && M_OPEN(cur)) return cur;
    const planned = date || (pl.nextDueAt < today() ? today() : pl.nextDueAt);
    const m = CA.createMWO({ kind: 'preventive', machineId: pl.machineId, title: pl.title, priority: pl.nextDueAt < today() ? 'high' : 'normal', plannedAt: planned, checklist: (pl.tasks || []).map((t) => ({ text: t, done: false })), planId: pl.id, desc: 'من خطة الصيانة الوقائية ' + pl.id + ' (كل ' + pl.freqDays + ' يومًا' + (pl.freqHours ? ' أو ' + pl.freqHours + ' ساعة تشغيل' : '') + ')', audit: false });
    st.patch('pmPlans', pl.id, { mwoId: m.id });
    SA.audit('PM.SCHEDULED', { target: { type: 'pm_plan', id: pl.id, label: mName(pl.machineId) }, after: { mwo: m.id, date: planned, tasks: (pl.tasks || []).length } });
    return m;
  };
  /** edit a preventive maintenance plan (frequency, run-hours trigger, tasks checklist, next due, est. hours, active) -> PM.PLAN_UPDATED */
  CA.updatePlan = function (planId, v) {
    const pl = ERP.find('pmPlans', planId); if (!pl) return null;
    const tasks = (v.tasks || []).map((t) => String(t || '').trim()).filter(Boolean);
    const next = { freqDays: Math.max(1, Math.round(Number(v.freqDays) || pl.freqDays || 30)), freqHours: Number(v.freqHours) > 0 ? Math.round(Number(v.freqHours)) : null, nextDueAt: v.nextDueAt || pl.nextDueAt, estH: Number(v.estH) > 0 ? Number(v.estH) : pl.estH, tasks: tasks.length ? tasks : pl.tasks || [], active: v.active !== false };
    const keys = ['freqDays', 'freqHours', 'nextDueAt', 'estH', 'active']; const before = {}, after = {};
    keys.forEach((k) => { if (String(pl[k] == null ? '' : pl[k]) !== String(next[k] == null ? '' : next[k])) { before[k] = pl[k] == null ? null : pl[k]; after[k] = next[k]; } });
    if ((pl.tasks || []).join('|') !== next.tasks.join('|')) { before.tasks = (pl.tasks || []).length + ' مهام'; after.tasks = next.tasks.length + ' مهام'; }
    if (!Object.keys(after).length) return { unchanged: true };
    st.patch('pmPlans', planId, Object.assign({}, next, { updatedAt: nowIso(), updatedBy: me() }));
    if (after.nextDueAt) st.patch('machines', pl.machineId, { nextPMAt: next.nextDueAt });
    // keep an open (not yet started) preventive order in sync with the new checklist / date
    const o = pl.mwoId ? ERP.find('maintenanceOrders', pl.mwoId) : null;
    if (o && M_OPEN(o) && o.status === 'scheduled' && !(o.checklist || []).some((c) => c.done)) st.patch('maintenanceOrders', o.id, (x) => { if (after.tasks) x.checklist = next.tasks.map((t) => ({ text: t, done: false })); if (after.nextDueAt) x.plannedAt = next.nextDueAt; x.log = (x.log || []).concat([logE('تحديث من خطة الصيانة الوقائية ' + planId, 'edit', 'info')]); });
    SA.audit('PM.PLAN_UPDATED', { target: { type: 'pm_plan', id: planId, label: mName(pl.machineId) }, before, after, reason: v.reason || '' });
    return ERP.find('pmPlans', planId);
  };
  CA.setMachineStatus = function (id, status, reason) {
    const mc = mach(id); if (!mc || mc.status === status) return null; const prev = mc.status;
    st.patch('machines', id, { status, downSince: status === 'down' ? nowIso() : null });
    SA.audit('MNT.ASSET_STATUS', { target: { type: 'machine', id, label: mc.name }, before: { status: prev }, after: { status }, reason: reason || '' });
    return true;
  };

  /* KPIs */
  CA.mtbf = () => avg(get('machines').map((m) => m.mtbfH).filter((x) => x != null));
  CA.mttr = () => avg(get('machines').map((m) => m.mttrH).filter((x) => x != null));
  CA.mttrActual = (days) => { const from = Date.now() - (days || 90) * DAY; return avg(get('maintenanceOrders').filter((m) => m.kind === 'breakdown' && m.status === 'done' && m.doneAt && ms(m.doneAt) >= from).map((m) => (ms(m.doneAt) - ms(m.openedAt)) / HOUR)); };
  CA.pmState = (p) => { const d = daysTo(p.nextDueAt); if (d < 0) return 'overdue'; const m = p.mwoId ? ERP.find('maintenanceOrders', p.mwoId) : null; if (m && M_OPEN(m)) return 'scheduled'; return d <= 7 ? 'soon' : 'ok'; };
  /** PM compliance over the last n days: done ≤ 3 days after due / all due (overdue plans count as missed) */
  CA.pmCompliance = function (days) {
    const from = ERP.day(-(days || 90)), t = today(); let due = 0, ok = 0;
    get('pmPlans').filter((p) => p.active !== false).forEach((p) => { (p.history || []).forEach((x) => { if (x.dueAt >= from && x.dueAt <= t) { due++; if (x.doneAt && ms(x.doneAt) - ms(x.dueAt) <= 3 * DAY) ok++; } }); if (p.nextDueAt < t) due++; });
    return due ? ok / due : null;
  };
  CA.pmOverdue = () => get('pmPlans').filter((p) => p.active !== false && p.nextDueAt < today());

  /* ═════════════════════════ approval hook: maintenance_spend (idempotent) ═════════════════════════ */
  ERP.onApproval('maintenance_spend', (a) => {
    const m = ERP.find('maintenanceOrders', a.ref && a.ref.id); if (!m) return;
    if (m.spendApprovalId && m.spendApprovalId !== a.id) return;
    if (a.status === 'approved') {
      if (m.approvedSpend || m.poId) return;
      const pos = CA.orderParts(m.id, a.id);
      if (pos && pos.length && SA.toast) SA.toast('اعتُمد الصرف — أمر الشراء ' + pos[0].id + ' (' + ((C.status.po[pos[0].status] || [])[0] || '') + ') — ' + ERP.supplierName(pos[0].supplierId), 'success', { ms: 6000 });
    } else if (a.status === 'rejected') {
      if (m.spendDecision === 'rejected') return; const why = ((a.chain || []).find((s) => s.status === 'rejected') || {}).reason || '';
      st.patch('maintenanceOrders', m.id, (x) => { x.spendDecision = 'rejected'; x.spendApprovalId = a.id; x.log = (x.log || []).concat([logE('رُفض طلب الصرف ' + a.id + (why ? ': ' + why : ''), 'xcircle', 'danger')]); });
      SA.notify({ title: 'رُفض اعتماد الصرف — ' + m.id, body: mName(m.machineId) + (why ? ' — ' + why : ''), level: 'urgent', to: ['R-18'], link: '#/care/maintenance/' + m.id });
    } else if (a.status === 'changes_requested') {
      if (m.spendDecision === 'changes') return;
      st.patch('maintenanceOrders', m.id, (x) => { x.spendDecision = 'changes'; x.spendApprovalId = a.id; x.log = (x.log || []).concat([logE('مطلوب تعديل على طلب الصرف ' + a.id, 'edit', 'warning')]); });
      SA.notify({ title: 'مطلوب تعديل على طلب الصرف — ' + m.id, body: ((a.changesNote || {}).note) || '', level: 'action', to: ['R-18'], link: '#/approvals/' + a.id });
    }
  });

  /* ═════════════════════════ styles ═════════════════════════ */
  (function () {
    if (document.querySelector('style[data-mod="care"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'care');
    s.textContent = `
.care-sec { margin-top: 22px; } .care-sec-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 10px; flex-wrap: wrap; }
.care-sec-head h2 { margin: 0; font-size: var(--text-h3); color: var(--eg-navy); display: flex; align-items: center; gap: 10px; } .care-sec-head small { color: var(--color-text-muted); font-size: 12.5px; }
.care-ico { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: var(--color-primary-tint); color: var(--eg-navy); flex: none; }
.care-ico.is-danger { background: var(--color-danger-tint); color: var(--color-danger); } .care-ico.is-warning { background: var(--color-warning-tint); color: var(--color-warning); } .care-ico.is-success { background: var(--color-success-tint); color: var(--color-success); }
.care-live { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 14px; background: linear-gradient(135deg, #fff3f3, #fff 70%); border: 1px solid #f1bfc1; margin: 4px 0 14px; flex-wrap: wrap; }
.care-live.is-ok { background: linear-gradient(135deg, #eef9f2, #fff 70%); border-color: #bfe3cc; }
.care-pulse { width: 14px; height: 14px; border-radius: 50%; background: var(--color-danger); flex: none; animation: care-pulse 1.6s infinite; }
.care-live.is-ok .care-pulse { background: var(--color-success); animation: none; }
@keyframes care-pulse { 0% { box-shadow: 0 0 0 0 rgba(196,18,24,.45); } 70% { box-shadow: 0 0 0 12px rgba(196,18,24,0); } 100% { box-shadow: 0 0 0 0 rgba(196,18,24,0); } }
.care-live-body { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 2px; } .care-live-body b { font-size: 1.02rem; } .care-live-body small { color: var(--color-text-muted); font-size: 12.5px; line-height: 1.6; }
.care-timer { font: 700 1.35rem var(--font-en); color: var(--color-danger); direction: ltr; unicode-bidi: isolate; white-space: nowrap; } .care-live.is-ok .care-timer { color: var(--color-success); }
.care-attn { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.care-attn a, .care-attn > li > div { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 12px; background: #fff; text-decoration: none; color: inherit; }
.care-attn a:hover { border-color: var(--eg-navy-soft); background: var(--color-primary-tint); } .care-attn b { display: block; font-size: var(--text-dense); font-weight: 600; line-height: 1.45; } .care-attn small { display: block; color: var(--color-text-muted); font-size: 12px; } .care-attn .care-grow { flex: 1; min-width: 0; }
.care-cell { display: flex; flex-direction: column; line-height: 1.4; min-width: 0; max-width: 360px; } .care-cell b { font-weight: 600; font-size: var(--text-dense); } .care-cell small { color: var(--color-text-muted); font-size: 12px; } .care-cell .erp-doc { font-size: var(--text-dense); }
.care-sla { display: flex; flex-direction: column; gap: 1px; line-height: 1.3; white-space: nowrap; } .care-sla b { font-size: 12.5px; } .care-sla small { font-size: 11.5px; color: var(--color-text-muted); }
.care-sla.is-bad b { color: var(--color-danger); } .care-sla.is-warn b { color: var(--color-warning); } .care-sla.is-ok b { color: var(--color-success); } .care-sla.is-pause b { color: var(--color-text-muted); }
.care-portal { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; color: var(--eg-navy); background: var(--color-primary-tint); border: 1px solid var(--eg-navy-tint); padding: 1px 8px; border-radius: 999px; white-space: nowrap; vertical-align: middle; } .care-portal .icon { width: 12px; height: 12px; }
.care-full { grid-column: 1 / -1; }
.care-notes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.care-note { display: flex; gap: 10px; align-items: flex-start; } .care-note-b { flex: 1; min-width: 0; background: var(--color-bg-alt); border-radius: 10px; padding: 8px 12px; font-size: var(--text-dense); line-height: 1.7; }
.care-note-b.is-public { background: var(--color-primary-tint); border: 1px solid var(--eg-navy-tint); } .care-note-b.is-sys { background: #fff; border: 1px dashed var(--color-border-strong); color: var(--color-text-muted); }
.care-note-b small { display: flex; gap: 8px; flex-wrap: wrap; color: var(--color-text-muted); font-size: 11.5px; margin-bottom: 2px; }
.care-tl { list-style: none; margin: 0; padding: 0; } .care-tl li { position: relative; display: flex; gap: 10px; padding-bottom: 14px; } .care-tl li:not(:last-child)::before { content: ""; position: absolute; inset-block: 24px 0; inset-inline-start: 11px; width: 2px; background: var(--color-border); }
.care-tl-dot { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: #fff; border: 2px solid var(--color-border-strong); color: var(--color-text-muted); flex: none; } .care-tl-dot .icon { width: 12px; height: 12px; }
.care-tl li.is-danger .care-tl-dot { border-color: var(--color-danger); color: var(--color-danger); background: var(--color-danger-tint); } .care-tl li.is-success .care-tl-dot { border-color: var(--color-success); color: #fff; background: var(--color-success); }
.care-tl li.is-warning .care-tl-dot { border-color: var(--color-warning); color: var(--color-warning); background: var(--color-warning-tint); } .care-tl li.is-info .care-tl-dot { border-color: var(--eg-navy); color: var(--eg-navy); background: var(--color-primary-tint); }
.care-tl b { display: block; font-size: var(--text-dense); font-weight: 600; line-height: 1.5; } .care-tl small { color: var(--color-text-muted); font-size: 12px; }
.care-week { display: grid; grid-template-columns: 160px repeat(7, minmax(118px, 1fr)); border: 1px solid var(--color-border); border-radius: 12px; overflow-x: auto; background: #fff; }
.care-week > div { border-bottom: 1px solid var(--color-border); border-inline-start: 1px solid var(--color-border); padding: 8px; min-height: 70px; font-size: 12.5px; }
.care-week .is-head { background: var(--color-bg-alt); font-weight: 700; min-height: 0; text-align: center; line-height: 1.4; } .care-week .is-head small { display: block; font: 600 11.5px var(--font-en); color: var(--color-text-muted); }
.care-week .is-today { background: var(--color-primary-tint); } .care-week .is-off { background: repeating-linear-gradient(135deg, #fafafa, #fafafa 6px, #f3f3f3 6px, #f3f3f3 12px); }
.care-week .is-tech { background: var(--color-bg-alt); display: flex; flex-direction: column; justify-content: center; gap: 2px; } .care-week .is-tech b { font-size: var(--text-dense); } .care-week .is-tech small { color: var(--color-text-muted); font-size: 11.5px; }
.care-vchip { display: block; width: 100%; text-align: start; border: 0; border-inline-start: 3px solid var(--eg-navy); background: var(--color-primary-tint); border-radius: 6px; padding: 5px 7px; margin-bottom: 5px; cursor: pointer; font: inherit; font-size: 12px; line-height: 1.4; color: var(--color-text); }
.care-vchip:hover { filter: brightness(.97); } .care-vchip b { font: 700 11.5px var(--font-en); display: block; } .care-vchip.is-done { border-color: var(--color-success); background: var(--color-success-tint); } .care-vchip.is-cancelled { border-color: var(--color-border-strong); background: var(--color-neutral-tint); text-decoration: line-through; color: var(--color-text-muted); } .care-vchip.is-late { border-color: var(--color-danger); background: var(--color-danger-tint); }
.care-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; } .care-cal-h { text-align: center; font-weight: 700; font-size: 12px; color: var(--color-text-muted); padding: 2px 0; }
.care-cal-d { border: 1px solid var(--color-border); border-radius: 10px; padding: 6px; min-height: 84px; background: #fff; font-size: 12px; min-width: 0; } .care-cal-d.is-today { border-color: var(--eg-navy); box-shadow: inset 0 0 0 1px var(--eg-navy); } .care-cal-d.is-off { background: var(--color-bg-alt); } .care-cal-d.is-blank { border: 0; background: transparent; }
.care-cal-d time { font: 700 12px var(--font-en); color: var(--color-text-muted); display: block; margin-bottom: 4px; }
.care-pmchip { display: block; border-radius: 6px; padding: 2px 6px; margin-bottom: 3px; background: var(--color-primary-tint); color: var(--eg-navy); font-weight: 600; text-decoration: none; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.care-pmchip.is-overdue { background: var(--color-danger-tint); color: var(--color-danger); } .care-pmchip.is-scheduled { background: var(--color-success-tint); color: var(--color-success); }
.care-check { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; } .care-check li { display: flex; gap: 8px; align-items: center; font-size: var(--text-dense); } .care-check li.is-done span { text-decoration: line-through; color: var(--color-text-muted); }
.care-photos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; } .care-photo { border: 2px dashed var(--color-border-strong); border-radius: 10px; min-height: 84px; display: grid; place-items: center; gap: 4px; color: var(--color-text-muted); font-size: 12px; text-align: center; background: var(--color-bg-alt); cursor: pointer; padding: 6px; }
.care-photo.is-on { border-style: solid; border-color: var(--color-success); background: var(--color-success-tint); color: var(--color-success); font-weight: 700; }
.care-sign { border: 2px dashed var(--color-border-strong); border-radius: 10px; min-height: 92px; display: grid; place-items: center; color: var(--color-text-muted); background: #fff; font-size: 12.5px; text-align: center; padding: 8px; }
.care-sign.is-on { border-style: solid; border-color: var(--eg-navy); color: var(--eg-navy); font: italic 700 1.5rem Georgia, 'Times New Roman', serif; }
.care-stars { display: inline-flex; gap: 6px; } .care-star { width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--color-border-strong); background: #fff; font: 700 16px var(--font-en); cursor: pointer; color: var(--color-text); }
.care-star[aria-pressed="true"] { background: var(--eg-navy); color: #fff; border-color: var(--eg-navy); }
.care-meas { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: 8px 10px; align-items: center; font-size: var(--text-dense); }
.care-recover { border-radius: 14px; padding: 16px; background: linear-gradient(135deg, #eaf7ef, #fff 75%); border: 1px solid #bfe3cc; display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 14px; }
.care-recover h3 { margin: 0 0 4px; color: var(--color-success); font-size: 1.05rem; } .care-recover p { margin: 0; color: var(--color-text); font-size: var(--text-dense); line-height: 1.8; }
.care-down { border-radius: 14px; padding: 14px 16px; background: linear-gradient(135deg, #fff1f1, #fff 75%); border: 1px solid #f1bfc1; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.care-down b { font-size: 1rem; } .care-down p { margin: 2px 0 0; font-size: 12.5px; color: var(--color-text-muted); line-height: 1.7; }
.care-chain-acts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--color-border); }
.care-muted { color: var(--color-text-muted); font-size: 12.5px; } .care-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.care-pmnext.is-overdue { color: var(--color-danger); font-weight: 700; display: inline-flex; align-items: center; gap: 4px; } .care-pmnext.is-soon { color: var(--color-warning); font-weight: 600; }
.care-crit { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; font: 700 12px var(--font-en); background: var(--color-neutral-tint); color: var(--color-text); } .care-crit.is-A { background: var(--color-danger-tint); color: var(--color-danger); } .care-crit.is-B { background: var(--color-warning-tint); color: var(--color-warning); }
.care-tasks { display: grid; gap: 6px; } .care-task { display: flex; gap: 6px; align-items: center; } .care-task .input { flex: 1; min-width: 0; }
.care-task-n { width: 24px; height: 24px; border-radius: 7px; display: grid; place-items: center; background: var(--color-primary-tint); color: var(--eg-navy); font: 700 12px var(--font-en); flex: none; }
.care-qty0 { color: var(--color-danger); font-weight: 700; } .care-qtylow { color: var(--color-warning); font-weight: 700; }
.care-opts { display: grid; gap: 10px; } .care-opt { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border: 1px solid var(--color-border); border-radius: 12px; cursor: pointer; background: #fff; text-align: start; font: inherit; color: inherit; width: 100%; }
.care-opt:hover { border-color: var(--eg-navy-soft); background: var(--color-primary-tint); } .care-opt b { display: block; } .care-opt small { display: block; color: var(--color-text-muted); font-size: 12.5px; line-height: 1.6; margin-top: 2px; } .care-opt.is-warn { border-color: #f2d6ad; background: #fffaf2; }
@media (max-width: 760px) { .care-week { grid-template-columns: 120px repeat(7, minmax(108px, 1fr)); } .care-meas { grid-template-columns: 1fr; } .care-cal { grid-template-columns: repeat(2, minmax(0, 1fr)); } .care-cal-h { display: none; } }
@media (prefers-reduced-motion: reduce) { .care-pulse { animation: none; } }`;
    document.head.appendChild(s);
  })();

  /* ═════════════════════════ UI helpers ═════════════════════════ */
  const FM = SA.form;
  const fld = (o) => FM.field(o);
  /** generic form modal → resolves with onSubmit's truthy result (null when cancelled) */
  function formModal(o) {
    return new Promise((resolve) => {
      const fields = (o.fields || []).filter(Boolean); const grp = FM.group(fields);
      const save = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
        if (!grp.validate()) return; const v = grp.get(); if (o.collect) Object.assign(v, o.collect());
        if (o.check) { const err = o.check(v); if (err) { SA.toast(err, 'warn'); return; } }
        m.setBusy(true); let r = null; try { r = await o.onSubmit(v, m); } finally { m.setBusy(false); } if (r) m.close(r);
      } }, SA.icon(o.submitIcon || 'check', 'icon-sm'), o.submitLabel || 'حفظ');
      const m = SA.modal({ title: o.title, subtitle: o.subtitle, icon: o.icon, size: o.size || 'md', body: h('div.care-form', {}, o.intro || null, fields.length ? h('div.sap-formgrid', {}, fields.map((f) => f.el)) : null, o.extra || null, h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), o.note || 'هيتسجّل في سجل التدقيق باسمك مع الوقت.')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), save] });
      m.closed.then((r) => resolve(r || null));
    });
  }
  const custOptions = (ph) => [['', ph || 'اختر العميل…']].concat(get('customers').filter((c) => c.status !== 'disabled').map((c) => [c.id, c.name + (c.city ? ' — ' + c.city : '')]));
  const itemOptions = (kinds, ph) => [['', ph || '— بدون —']].concat(get('items').filter((i) => kinds.indexOf(i.kind) >= 0).map((i) => [i.id, i.code + ' — ' + i.name]));
  const portalBadge = () => h('span.care-portal', { title: 'وصلت من بوابة التاجر — الردود المعلّمة «مرئية للتاجر» تظهر له في البوابة' }, SA.icon('globe', 'icon-sm'), 'بوابة التاجر');
  const channelCell = (t) => (isPortal(t) ? portalBadge() : h('span', {}, t.channel || '—'));
  function slaCell(t) {
    const s = slaOf(t);
    if (s.closed) return h('div.care-sla' + (s.breached ? '.is-bad' : '.is-ok'), {}, h('b', {}, s.breached ? 'حُلّت بعد الموعد' : 'ضمن SLA'), h('small', {}, 'خلال ' + dur((ms(t.resolvedAt || t.closedAt) - ms(tOpened(t))) / 60000)));
    if (s.paused) return h('div.care-sla.is-pause', {}, h('b', {}, 'العداد متوقف'), h('small', {}, 'بانتظار العميل'));
    if (s.breached) return h('div.care-sla.is-bad', {}, h('b', {}, 'متجاوزة ' + dur(-s.leftH * 60)), h('small', {}, 'SLA ' + (t.slaHours || 48) + ' س'));
    return h('div.care-sla' + (s.risk ? '.is-warn' : '.is-ok'), {}, h('b', {}, 'متبقٍ ' + dur(s.leftH * 60)), h('small', {}, 'SLA ' + (t.slaHours || 48) + ' س'));
  }
  function timeline(list) {
    if (!list.length) return SA.empty({ icon: 'history', title: 'لا توجد أحداث بعد' });
    return h('ol.care-tl', {}, list.map((e) => h('li.is-' + (e.tone || 'info'), {}, h('span.care-tl-dot', {}, SA.icon(e.icon || 'info')), h('div', {}, h('b', {}, e.text), h('small', {}, SA.fmt.dt(e.at) + (e.by ? ' · ' + uname(e.by) : ''))))));
  }
  const secHead = (icon, title, sub, tone, extra) => h('div.care-sec-head', {}, h('h2', {}, h('span.care-ico' + (tone ? '.is-' + tone : ''), {}, SA.icon(icon, 'icon-sm')), title, sub ? h('small', {}, sub) : null), extra || null);
  const tickTimers = (root) => SA.$$('[data-care-since]', root).forEach((el) => { el.textContent = dur(minsSince(el.getAttribute('data-care-since'))); });
  const LSHORT = { 'L-01': 'بثق الأبواب', 'L-02': 'لامينيشن', 'L-03': 'التجاليد', 'L-04': 'الفوم بورد' };
  const critical = (i) => ((i.attrs && i.attrs.fits) || []).some((t) => get('machines').some((m) => m.type === t && m.criticality === 'A'));
  const weekStart = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 1) % 7) + (off || 0) * 7); return ymd(d); };
  const DAYN = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dayName = (d) => DAYN[new Date(ms(d)).getDay()];
  const isFri = (d) => new Date(ms(d)).getDay() === 5;
  const nextWorkDay = () => { let d = addDays(today(), 1); if (isFri(d)) d = addDays(d, 1); return d; };

  function tStats() {
    const all = visibleTickets(); const from = Date.now() - 90 * DAY;
    const open = all.filter(T_OPEN); const breached = open.filter((t) => slaOf(t).breached);
    const done = all.filter((t) => !T_OPEN(t) && t.resolvedAt && ms(t.resolvedAt) >= from);
    const resH = avg(done.map((t) => (ms(t.resolvedAt) - ms(tOpened(t))) / HOUR));
    const rated = all.filter((t) => t.csat && ms(t.closedAt || t.resolvedAt) >= from);
    return { all, open, breached, done, resH, csat: avg(rated.map((t) => t.csat)), rated, slaOk: done.length ? done.filter((t) => !slaOf(t).breached).length / done.length : null,
      urgent: open.filter((t) => t.priority === 'urgent' || t.priority === 'high').length, portal: open.filter(isPortal).length, unassigned: open.filter((t) => !t.assigneeId).length };
  }

  /* ═════════════════════════ shared modals ═════════════════════════ */
  function ticketModal(o) {
    o = o || {};
    const fSO = fld({ name: 'soId', label: 'أمر البيع (اختياري)', type: 'select', options: [['', '— بدون —']] });
    const fillSO = (cid) => { const sel = fSO.input; SA.clear(sel); [['', '— بدون —']].concat(get('salesOrders').filter((s) => s.customerId === cid).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 25).map((s) => [s.id, s.id + ' — ' + ERP.fmt.date(s.createdAt) + ' — ' + ((C.status.so[s.status] || [])[0] || s.status)])).forEach((op) => sel.appendChild(h('option', { value: op[0] }, op[1]))); };
    const fC = fld({ name: 'customerId', label: 'العميل', type: 'select', required: true, value: o.customerId || '', options: custOptions(), onChange: fillSO });
    if (o.customerId) fillSO(o.customerId);
    return formModal({ title: 'تذكرة عميل جديدة', subtitle: 'شكوى أو استفسار أو طلب تركيب أو ضمان', icon: 'headset', size: 'lg', submitLabel: 'فتح التذكرة', fields: [fC,
      fld({ name: 'kind', label: 'النوع', type: 'select', value: o.kind || 'complaint', options: Object.keys(KIND).map((k) => [k, KIND[k][0]]) }),
      fld({ name: 'priority', label: 'الأولوية', type: 'select', value: 'normal', options: Object.keys(PRIO).map((k) => [k, PRIO[k][0] + ' — SLA ' + SLA_H[k] + ' ساعة']) }),
      fld({ name: 'channel', label: 'القناة', type: 'select', value: o.channel || CHANNELS[0], options: CHANNELS.map((c) => [c, c]) }),
      fld({ name: 'title', label: 'عنوان مختصر', required: true, class: 'care-full', placeholder: 'مثال: انفصال الفويل في 3 أبواب بعد التركيب', rules: [FM.rules.min(5)] }),
      fld({ name: 'desc', label: 'التفاصيل', type: 'textarea', class: 'care-full', rows: 3 }), fSO,
      fld({ name: 'itemId', label: 'الصنف (اختياري)', type: 'select', options: itemOptions(['fg', 'acc']) }),
      fld({ name: 'qty', label: 'الكمية المتأثرة', type: 'number', min: 1 }),
      fld({ name: 'assigneeId', label: 'إسناد إلى', type: 'select', options: [['', '— لاحقًا —']].concat(assignees('care.tickets.edit')) }),
      fld({ name: 'warranty', label: 'المنتج تحت الضمان', type: 'checkbox' })],
    onSubmit: (v) => act(() => CA.createTicket(v), (t) => 'تم فتح التذكرة ' + t.id).then((t) => { if (t && t.id) SA.nav('care/tickets/' + t.id); return t; }) });
  }
  function visitModal(o) {
    o = o || {}; const t = o.ticketId ? ERP.find('tickets', o.ticketId) : null; const cid = o.customerId || (t && t.customerId) || '';
    const kind = o.kind || (t ? (t.kind === 'installation' ? 'installation' : t.kind === 'warranty' ? 'warranty' : 'inspection') : 'installation');
    const fTk = fld({ name: 'ticketId', label: 'التذكرة المرتبطة', type: 'select', value: t ? t.id : '', disabled: !!t, options: [['', '— بدون —']] });
    const fillTk = (c) => { if (t) { SA.clear(fTk.input); fTk.input.appendChild(h('option', { value: t.id }, t.id + ' — ' + t.title)); return; } SA.clear(fTk.input); [['', '— بدون —']].concat(get('tickets').filter((x) => x.customerId === c && T_OPEN(x)).map((x) => [x.id, x.id + ' — ' + x.title])).forEach((op) => fTk.input.appendChild(h('option', { value: op[0] }, op[1]))); };
    const fAddr = fld({ name: 'address', label: 'العنوان', class: 'care-full', value: o.address || ((ERP.customer(cid) || {}).city || '') });
    const fC = fld({ name: 'customerId', label: 'العميل', type: 'select', required: true, value: cid, disabled: !!t, options: custOptions(), onChange: (v) => { fillTk(v); fAddr.set((ERP.customer(v) || {}).city || ''); } });
    fillTk(cid); if (t) fTk.set(t.id);
    const techs = get('careTechs');
    return formModal({ title: 'جدولة زيارة', subtitle: t ? t.id + ' — ' + ERP.customerName(t.customerId) : 'تركيب أو معاينة لدى العميل', icon: 'calendar', size: 'lg', submitLabel: 'جدولة الزيارة', fields: [
      fld({ name: 'kind', label: 'نوع الزيارة', type: 'select', value: kind, options: Object.keys(VKIND).map((k) => [k, VKIND[k]]) }), fC, fTk,
      fld({ name: 'techId', label: 'الفني', type: 'select', required: true, value: o.techId || (kind === 'inspection' || kind === 'warranty' ? 'TEC-04' : (techs[0] || {}).id), options: techs.map((x) => [x.id, x.name + ' — ' + x.role]) }),
      fld({ name: 'date', label: 'التاريخ', type: 'date', required: true, value: o.date || nextWorkDay() }),
      fld({ name: 'time', label: 'الموعد', type: 'select', value: o.time || '10:00', options: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'].map((x) => [x, x]) }),
      fld({ name: 'durH', label: 'المدة المتوقعة (ساعة)', type: 'number', value: kind === 'installation' ? 6 : 2, min: 1 }), fAddr,
      fld({ name: 'notes', label: 'ملاحظات للفني', type: 'textarea', class: 'care-full', rows: 2 })],
    check: (v) => { if (v.date < today()) return 'التاريخ في الماضي'; if (isFri(v.date)) return 'يوم الجمعة إجازة — اختر يومًا آخر'; const clash = get('visits').find((x) => x.status === 'scheduled' && x.techId === v.techId && x.date === v.date && x.time === v.time); return clash ? 'الفني لديه زيارة في نفس الموعد (' + clash.id + ')' : null; },
    onSubmit: (v) => act(() => CA.scheduleVisit(v), (x) => 'تمت جدولة ' + VKIND[x.kind] + ' ' + x.id + ' — ' + techName(x.techId)) });
  }
  function claimModal(o) {
    o = o || {}; const t = o.ticketId ? ERP.find('tickets', o.ticketId) : null;
    const fTk = t ? null : fld({ name: 'ticketId', label: 'التذكرة (اختياري)', type: 'select', options: [['', '— بدون —']].concat(get('tickets').filter((x) => T_OPEN(x) && !x.claimId).map((x) => [x.id, x.id + ' — ' + ERP.customerName(x.customerId) + ' — ' + x.title])), onChange: (v) => { const x = ERP.find('tickets', v); if (x) { fC.set(x.customerId); if (x.itemId) fI.set(x.itemId); if (x.qty) fQ.set(x.qty); fR.set(x.title); } } });
    const fC = fld({ name: 'customerId', label: 'العميل', type: 'select', required: true, value: t ? t.customerId : '', disabled: !!t, options: custOptions() });
    const fI = fld({ name: 'itemId', label: 'الصنف', type: 'select', required: true, value: t ? t.itemId || '' : '', options: itemOptions(['fg', 'acc'], 'اختر الصنف…') });
    const fQ = fld({ name: 'qty', label: 'الكمية المطلوب استبدالها', type: 'number', required: true, value: (t && t.qty) || 1, min: 1 });
    const fR = fld({ name: 'reason', label: 'سبب المطالبة', type: 'textarea', class: 'care-full', required: true, rows: 2, value: t ? t.title : '' });
    return formModal({ title: 'فتح مطالبة ضمان', subtitle: t ? t.id + ' — ' + ERP.customerName(t.customerId) : null, icon: 'shield', submitLabel: 'فتح المطالبة', fields: [fTk, fC, fI, fQ, fR, fld({ name: 'evidence', label: 'الأدلة المرفقة', class: 'care-full', placeholder: 'صور، تقرير معاينة، فاتورة…' })],
      intro: SA.alert('info', 'القرار من الإدارة (صلاحية care.warranty.approve). عند الاعتماد يُنشأ أمر بيع استبدال بسعر صفر ويُحجز من المخزون أو يُخطط للتصنيع.'),
      onSubmit: (v) => act(() => CA.openClaim(Object.assign(v, { ticketId: t ? t.id : v.ticketId || null })), (c) => 'فُتحت مطالبة الضمان ' + c.id + ' وأُرسلت للقرار') });
  }
  function ncrModal(t) {
    return formModal({ title: 'فتح عدم مطابقة من شكوى عميل', subtitle: t.id + ' — ' + t.title, icon: 'alert', submitLabel: 'فتح NCR وإبلاغ الجودة', fields: [
      fld({ name: 'itemId', label: 'الصنف', type: 'select', required: true, value: t.itemId || '', options: itemOptions(['fg', 'acc'], 'اختر الصنف…') }),
      fld({ name: 'qty', label: 'الكمية', type: 'number', required: true, value: t.qty || 1, min: 1 }),
      fld({ name: 'defectCode', label: 'نوع العيب', type: 'select', value: 'D02', options: ERP.defectCodes.map((d) => [d.code, d.code + ' — ' + d.label]) }),
      fld({ name: 'severity', label: 'الخطورة', type: 'select', value: t.priority === 'high' || t.priority === 'urgent' ? 'major' : 'minor', options: [['minor', 'بسيطة'], ['major', 'جسيمة'], ['critical', 'حرجة']] }),
      fld({ name: 'note', label: 'وصف', type: 'textarea', class: 'care-full', rows: 2, value: t.desc || t.title })],
    onSubmit: (v) => act(() => CA.openTicketNCR(t.id, v), (n) => 'تم فتح عدم المطابقة ' + n.id + ' وإبلاغ الجودة') });
  }
  function mwoModal(o) {
    o = o || {}; const mcs = get('machines').slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    const fStop = fld({ name: 'stopLine', label: 'إيقاف الخط وتسجيل بداية توقف (الماكينة تؤثر على الإنتاج)', type: 'checkbox', value: o.kind !== 'preventive' && !!(mach(o.machineId) || {}).lineId });
    const fM = fld({ name: 'machineId', label: 'الماكينة', type: 'select', required: true, value: o.machineId || '', options: [['', 'اختر الماكينة…']].concat(mcs.map((m) => [m.id, m.id + ' — ' + m.name + (m.lineId ? ' (' + (LSHORT[m.lineId] || m.lineId) + ')' : ' (مرافق)')])), onChange: (v) => { const m = mach(v); fStop.set(fK.get() === 'breakdown' && !!(m && m.lineId && m.criticality === 'A')); } });
    const fK = fld({ name: 'kind', label: 'النوع', type: 'select', value: o.kind || 'breakdown', options: Object.keys(MKIND).map((k) => [k, MKIND[k][0]]), onChange: (v) => { if (v !== 'breakdown') fStop.set(false); } });
    const sp = spares();
    return formModal({ title: o.kind === 'preventive' ? 'أمر صيانة جديد' : 'بلاغ عطل / أمر صيانة', icon: 'wrench', size: 'lg', submitLabel: 'إنشاء الأمر', fields: [fK, fM,
      fld({ name: 'priority', label: 'الأولوية', type: 'select', value: o.kind === 'preventive' ? 'normal' : 'high', options: Object.keys(PRIO).map((k) => [k, PRIO[k][0]]) }),
      fld({ name: 'assigneeId', label: 'المسؤول', type: 'select', value: 'U-31', options: assignees('care.maintenance.edit') }),
      fld({ name: 'title', label: 'وصف مختصر للعطل/العمل', required: true, class: 'care-full', placeholder: 'مثال: ارتفاع حرارة البرميل — المنطقة 2', rules: [FM.rules.min(5)] }),
      fld({ name: 'desc', label: 'التفاصيل', type: 'textarea', class: 'care-full', rows: 2 }),
      fld({ name: 'plannedAt', label: 'تاريخ التنفيذ (للوقائية)', type: 'date', value: today() }),
      fld({ name: 'partId', label: 'قطعة غيار مطلوبة (اختياري)', type: 'select', options: [['', '— بدون —']].concat(sp.map((i) => [i.id, i.name + ' — الرصيد ' + K.qty(i.id, SPW)])) }),
      fld({ name: 'partQty', label: 'الكمية', type: 'number', value: 1, min: 1 }), h('div.care-full', {}, fStop.el)].map((f) => (f instanceof Node ? { el: f, validate: () => true, focus() {} } : f)),
    collect: () => ({ stopLine: fStop.get() }),
    onSubmit: (v) => act(() => CA.createMWO({ kind: v.kind, machineId: v.machineId, priority: v.priority, assigneeId: v.assigneeId, title: v.title, desc: v.desc, plannedAt: v.plannedAt, stopLine: v.kind === 'breakdown' && v.stopLine, parts: v.partId ? [{ itemId: v.partId, qty: v.partQty || 1 }] : [] }), (m) => 'تم إنشاء ' + m.id + (v.kind === 'breakdown' && v.stopLine ? ' وإيقاف ' + lName(m.lineId) : '')).then((m) => { if (m && m.id) SA.nav('care/maintenance/' + m.id); return m; }) });
  }
  function itModal(o) {
    o = o || {};
    return formModal({ title: 'تذكرة دعم فني جديدة', icon: 'monitor', submitLabel: 'فتح التذكرة', fields: [
      fld({ name: 'title', label: 'المشكلة باختصار', required: true, class: 'care-full', rules: [FM.rules.min(5)], placeholder: 'مثال: الطابعة في المالية لا تطبع' }),
      fld({ name: 'category', label: 'التصنيف', type: 'select', value: 'hardware', options: Object.keys(ITCAT).map((k) => [k, ITCAT[k]]) }),
      fld({ name: 'priority', label: 'الأولوية', type: 'select', value: 'normal', options: Object.keys(PRIO).map((k) => [k, PRIO[k][0]]) }),
      fld({ name: 'requesterId', label: 'مقدّم الطلب', type: 'select', value: me(), options: get('users').filter((u) => u.status === 'active' && !u.external).map((u) => [u.id, u.name]) }),
      fld({ name: 'assetId', label: 'الجهاز (اختياري)', type: 'select', value: o.assetId || '', options: [['', '— بدون —']].concat(get('itAssets').map((a) => [a.id, a.id + ' — ' + a.name + (a.assigneeId ? ' (' + uname(a.assigneeId) + ')' : ' — ' + a.location)])) }),
      fld({ name: 'desc', label: 'التفاصيل', type: 'textarea', class: 'care-full', rows: 3 })],
    onSubmit: (v) => act(() => CA.createIT(v), (t) => 'تم فتح ' + t.id).then((t) => { if (t && t.id) SA.nav('care/it/' + t.id); return t; }) });
  }
  CA.createIT = function (o) {
    const t = { id: ERP.no('ITK'), title: o.title, desc: o.desc || '', requesterId: o.requesterId || me(), category: o.category || 'hardware', priority: o.priority || 'normal', status: 'open', assigneeId: null, assetId: o.assetId || null, openedAt: nowIso(), resolvedAt: null, notes: [] };
    st.insert('itTickets', t, true);
    SA.audit('IT.OPENED', { target: { type: 'it_ticket', id: t.id, label: t.title }, after: { category: ITCAT[t.category], priority: t.priority, requester: uname(t.requesterId) } });
    SA.notify({ title: 'تذكرة دعم فني: ' + t.id, body: t.title + ' — ' + uname(t.requesterId), level: t.priority === 'urgent' || t.priority === 'high' ? 'action' : 'info', to: ['R-10'], link: '#/care/it/' + t.id });
    return t;
  };
  CA.itStatus = function (id, status, o) {
    o = o || {}; const t = ERP.find('itTickets', id); if (!t) return null; const prev = t.status; const at = nowIso();
    st.patch('itTickets', id, (x) => { x.status = status; if (o.assigneeId) { x.assigneeId = o.assigneeId; x.assignedAt = at; } if (status === 'resolved') { x.resolvedAt = at; x.resolution = o.resolution || ''; } if (status === 'closed') x.closedAt = at; if (status === 'in_progress' && prev === 'resolved') x.resolvedAt = null;
      x.notes = (x.notes || []).concat([tNote(o.note || (o.assigneeId ? 'إسناد إلى ' + uname(o.assigneeId) : STATUS_TXT[status] || status) + (o.resolution ? ': ' + o.resolution : ''), { sys: !o.note })]); });
    const code = status === 'resolved' ? 'IT.RESOLVED' : o.assigneeId ? 'IT.ASSIGNED' : 'IT.UPDATED';
    SA.audit(code, { target: { type: 'it_ticket', id, label: t.title }, before: { status: prev }, after: Object.assign({ status }, o.assigneeId ? { assignee: uname(o.assigneeId) } : {}), reason: o.resolution || '' });
    if (status === 'resolved' && t.requesterId && t.requesterId !== me()) SA.notify({ title: 'تم حل تذكرتك ' + id, body: t.title + (o.resolution ? ' — ' + o.resolution : ''), level: 'info', toUsers: [t.requesterId], link: '#/care/it/' + id });
    if (o.assigneeId && o.assigneeId !== me()) SA.notify({ title: 'تذكرة IT مُسندة إليك: ' + id, body: t.title, level: 'action', toUsers: [o.assigneeId], link: '#/care/it/' + id });
    return ERP.find('itTickets', id);
  };

  /* ═════════════════════════ 1. DASHBOARD ═════════════════════════ */
  function liveBanner() {
    const down = get('lines').filter((l) => l.status === 'down');
    if (down.length) return h('div', {}, down.map((ln) => {
      const dt = get('downtime').find((d) => d.lineId === ln.id && !d.end); const since = (dt && dt.start) || ln.downSince || nowIso();
      const mwo = get('maintenanceOrders').find((m) => M_OPEN(m) && (dt && dt.mwoId ? m.id === dt.mwoId : m.lineId === ln.id && m.kind === 'breakdown'));
      const wos = get('workOrders').filter((w) => w.lineId === ln.id && w.status === 'on_hold' && w.holdReason); const sos = Array.from(new Set(wos.map((w) => w.soId).filter(Boolean)));
      return h('div.care-live', { role: 'status' }, h('span.care-pulse'),
        h('div.care-live-body', {}, h('b', {}, ln.name + ' متوقف — ' + (dt && dt.machineId ? mName(dt.machineId) : ln.downReason || 'عطل')),
          h('small', {}, [ln.downReason || (dt && dt.reason) || '', mwo ? mwo.id + ' «' + ((C.status.mwo[mwo.status] || [])[0] || mwo.status) + '»' : '', wos.length ? 'أوامر تشغيل متوقفة: ' + wos.map((w) => w.id).join('، ') : '', sos.length ? 'طلبات متأثرة: ' + sos.map((s) => s + ' (' + ERP.customerName((ERP.find('salesOrders', s) || {}).customerId) + ')').join('، ') : ''].filter(Boolean).join(' · '))),
        h('div', { style: { textAlign: 'center' } }, h('span.care-timer', { 'data-care-since': since }, dur(minsSince(since))), h('small.care-muted', { style: { display: 'block' } }, 'مدة التوقف')),
        mwo && canRoute('care/maintenance') ? SA.btn({ label: 'افتح أمر الصيانة', icon: 'wrench', kind: 'primary', onClick: () => SA.nav('care/maintenance/' + mwo.id) }) : null);
    }));
    const up = get('lines').filter((l) => l.upSince && Date.now() - ms(l.upSince) < 12 * HOUR).sort((a, b) => (a.upSince < b.upSince ? 1 : -1))[0];
    if (up) return h('div.care-live.is-ok', { role: 'status' }, h('span.care-pulse'), h('div.care-live-body', {}, h('b', {}, 'كل خطوط الإنتاج تعمل — عاد ' + up.name + ' ' + SA.fmt.rel(up.upSince)), h('small', {}, 'بعد توقف ' + dur(up.lastDownMin || 0) + (up.currentWoId ? ' · يعمل الآن على ' + up.currentWoId : ''))), up.currentWoId ? U.docLink(up.currentWoId) : null);
    return h('div.care-live.is-ok', { role: 'status' }, h('span.care-pulse'), h('div.care-live-body', {}, h('b', {}, 'كل خطوط الإنتاج تعمل'), h('small', {}, get('lines').map((l) => l.name).join(' · '))));
  }
  function afterSales() {
    const s = tStats(); const claims = get('warrantyClaims').filter((c) => c.status === 'pending');
    const w0 = weekStart(0), w1 = addDays(w0, 6); const inst = get('visits').filter((v) => v.kind === 'installation' && v.status !== 'cancelled' && v.date >= w0 && v.date <= w1);
    const trend = [3, 2, 1, 0].map((k) => { const a = new Date(); const from = new Date(a.getFullYear(), a.getMonth() - k, 1).getTime(), to = new Date(a.getFullYear(), a.getMonth() - k + 1, 1).getTime(); return avg(s.all.filter((t) => t.resolvedAt && ms(t.resolvedAt) >= from && ms(t.resolvedAt) < to).map((t) => (ms(t.resolvedAt) - ms(tOpened(t))) / HOUR)) || 0; });
    const recent = s.all.filter((t) => ms(tOpened(t)) >= Date.now() - 90 * DAY || T_OPEN(t));
    const byKind = Object.keys(KIND).map((k, i) => ({ label: KIND[k][0], value: recent.filter((t) => t.kind === k).length, color: ['#b9141b', '#345383', '#012864', '#a85a00'][i] }));
    const chMap = {}; recent.forEach((t) => { const c = isPortal(t) ? PORTAL_CH : t.channel || 'أخرى'; chMap[c] = (chMap[c] || 0) + 1; });
    const byCh = Object.keys(chMap).map((k) => ({ label: k, value: chMap[k], color: k === PORTAL_CH ? '#012864' : '#7d9cd1', href: hrefIf('care/tickets?channel=' + encodeURIComponent(k)) })).sort((a, b) => b.value - a.value);
    return h('section.care-sec', {}, secHead('headset', 'خدمة ما بعد البيع', 'الشكاوى والضمان والتركيب — آخر 90 يومًا'),
      U.kpis([
        U.kpi({ label: 'تذاكر مفتوحة', value: s.open.length, icon: 'headset', sub: 'عالية/عاجلة ' + s.urgent + ' · من البوابة ' + s.portal, href: hrefIf('care/tickets?status=active'), tone: s.urgent ? 'warning' : null }),
        U.kpi({ label: 'تجاوز SLA (مفتوحة)', value: s.breached.length, icon: 'clock', tone: s.breached.length ? 'danger' : 'success', sub: s.slaOk != null ? 'الالتزام 90 يومًا ' + Math.round(s.slaOk * 100) + '%' : '', href: hrefIf('care/tickets?sla=breached') }),
        U.kpi({ label: 'متوسط زمن الحل', value: s.resH != null ? ERP.fmt.num(s.resH, 1) + ' س' : '—', icon: 'activity', sub: s.done.length + ' تذكرة محلولة', trend }),
        U.kpi({ label: 'رضا العملاء CSAT', value: s.csat != null ? ERP.fmt.num(s.csat, 1) + ' / 5' : '—', icon: 'star', sub: s.rated.length + ' تقييم', tone: s.csat >= 4.2 ? 'success' : s.csat ? 'warning' : null }),
        U.kpi({ label: 'مطالبات ضمان معلقة', value: claims.length, icon: 'shield', href: hrefIf('care/warranty'), tone: claims.length ? 'warning' : null, sub: claims.length ? 'أقدمها ' + SA.fmt.rel(claims.map((c) => c.openedAt).sort()[0]) : 'لا يوجد' }),
        U.kpi({ label: 'زيارات تركيب هذا الأسبوع', value: inst.length, icon: 'map', href: hrefIf('care/visits'), sub: inst.filter((v) => v.status === 'done').length + ' تمت · ' + inst.filter((v) => v.status === 'scheduled').length + ' مجدولة' })
      ]),
      U.grid(2, SA.card({ title: 'التذاكر حسب النوع' }, CH.donut(byKind, { center: recent.length, sub: 'تذكرة' })), SA.card({ title: 'التذاكر حسب القناة' }, byCh.length ? CH.bars(byCh) : SA.empty({ title: 'لا توجد تذاكر' }))));
  }
  function downtimeChart(mode) {
    const d0 = new Date(); const from = mode === 'month' ? new Date(d0.getFullYear(), d0.getMonth(), 1).getTime() : Date.now() - 30 * DAY;
    const dts = get('downtime').filter((d) => ms(d.start) >= from); if (!dts.length) return SA.empty({ icon: 'chart', title: 'لا توجد توقفات مسجلة في هذه الفترة' });
    const lines = get('lines'); const cats = Object.keys(DTCAT).filter((c) => dts.some((d) => d.category === c));
    const tot = Math.round(dts.reduce((s, d) => s + dtMinutes(d), 0) / 6) / 10;
    return h('div', {}, CH.columns({ labels: lines.map((l) => LSHORT[l.id] || l.code), series: cats.map((c) => ({ name: DTCAT[c][0], color: DTCAT[c][1], values: lines.map((l) => Math.round(dts.filter((d) => d.lineId === l.id && d.category === c).reduce((s, d) => s + dtMinutes(d), 0) / 6) / 10) })), stacked: true, height: 220, legend: true, fmt: (v) => ERP.fmt.num(v, 1) + ' س', title: 'ساعات التوقف' }),
      h('p.care-muted', {}, 'إجمالي ' + ERP.fmt.num(tot, 1) + ' ساعة · ' + dts.length + ' توقف' + (dts.some((d) => !d.end) ? ' · يشمل توقفًا جاريًا الآن' : '')));
  }
  function plant(getMode, setMode) {
    const mcs = get('machines'); const down = mcs.filter((m) => m.status === 'down'); const open = get('maintenanceOrders').filter(M_OPEN);
    const pmc = CA.pmCompliance(90); const mtbf = CA.mtbf(), mttr = CA.mttr(), mttrA = CA.mttrActual(90);
    const d30 = get('downtime').filter((d) => ms(d.start) >= Date.now() - 30 * DAY); const dtH = d30.reduce((s, d) => s + dtMinutes(d), 0) / 60; const brkH = d30.filter((d) => d.category === 'breakdown').reduce((s, d) => s + dtMinutes(d), 0) / 60;
    const low = spares().filter((i) => i.reorderPoint != null && K.qty(i.id, SPW) <= i.reorderPoint);
    const body = h('div', {}, downtimeChart(getMode()));
    const seg = SA.segmented([['30', 'آخر 30 يومًا'], ['month', 'هذا الشهر']], getMode(), (v) => { setMode(v); SA.clear(body); body.append(downtimeChart(v)); });
    const sts = ['requested', 'scheduled', 'in_progress', 'waiting_parts']; const kinds = Object.keys(MKIND).filter((k) => open.some((m) => m.kind === k));
    const d90 = get('downtime').filter((d) => ms(d.start) >= Date.now() - 90 * DAY && d.machineId); const byM = {}; d90.forEach((d) => { byM[d.machineId] = (byM[d.machineId] || 0) + dtMinutes(d); });
    const topM = Object.keys(byM).sort((a, b) => byM[b] - byM[a]).slice(0, 6).map((id) => ({ label: id + ' — ' + ((mach(id) || {}).name || ''), value: Math.round(byM[id] / 6) / 10, color: (mach(id) || {}).status === 'down' ? '#b9141b' : '#345383', href: hrefIf('care/assets/' + id) }));
    return h('section.care-sec', {}, secHead('wrench', 'صيانة المصنع', 'الماكينات والأعطال والصيانة الوقائية وقطع الغيار', down.length ? 'danger' : null),
      U.kpis([
        U.kpi({ label: 'ماكينات متوقفة (عطل)', value: down.length, icon: 'alert', tone: down.length ? 'danger' : 'success', sub: down.length ? down.map((m) => m.id).join('، ') : 'كل الماكينات تعمل', href: hrefIf('care/assets?status=down') }),
        U.kpi({ label: 'أوامر صيانة مفتوحة', value: open.length, icon: 'wrench', sub: 'أعطال ' + open.filter((m) => m.kind === 'breakdown').length + ' · بانتظار قطع ' + open.filter((m) => m.status === 'waiting_parts').length, href: hrefIf('care/maintenance'), tone: open.some((m) => m.status === 'waiting_parts') ? 'warning' : null }),
        U.kpi({ label: 'الالتزام بالصيانة الوقائية', value: pmc != null ? Math.round(pmc * 100) + '%' : '—', icon: 'calendar', sub: 'آخر 90 يومًا · متأخرة ' + CA.pmOverdue().length, href: hrefIf('care/pm'), tone: pmc >= 0.85 ? 'success' : pmc >= 0.7 ? 'warning' : 'danger' }),
        U.kpi({ label: 'MTBF (متوسط بين الأعطال)', value: mtbf != null ? ERP.fmt.num(mtbf, 0) + ' س' : '—', icon: 'activity', sub: 'متوسط ' + mcs.length + ' ماكينة', href: hrefIf('care/assets') }),
        U.kpi({ label: 'MTTR (متوسط الإصلاح)', value: mttr != null ? ERP.fmt.num(mttr, 1) + ' س' : '—', icon: 'clock', sub: mttrA != null ? 'فعلي آخر 90 يومًا ' + ERP.fmt.num(mttrA, 1) + ' س' : '' }),
        U.kpi({ label: 'ساعات التوقف (30 يومًا)', value: ERP.fmt.num(dtH, 1), icon: 'factory', sub: 'منها أعطال ' + ERP.fmt.num(brkH, 1) + ' س', tone: brkH > 8 ? 'warning' : null }),
        U.kpi({ label: 'قطع غيار عند/تحت الحد', value: low.length, icon: 'box', sub: low.filter((i) => K.qty(i.id, SPW) <= 0).length + ' رصيدها صفر', tone: low.some((i) => K.qty(i.id, SPW) <= 0) ? 'danger' : low.length ? 'warning' : 'success', href: hrefIf('care/spares') })
      ]),
      U.grid(3, SA.card({ title: 'ساعات التوقف حسب الخط والسبب', actions: [seg] }, body),
        SA.card({ title: 'رصيد أوامر الصيانة المفتوحة' }, open.length ? CH.columns({ labels: sts.map((x) => C.status.mwo[x][0]), series: kinds.map((k) => ({ name: MKIND[k][0], color: k === 'breakdown' ? '#b9141b' : k === 'preventive' ? '#345383' : '#a85a00', values: sts.map((x) => open.filter((m) => m.status === x && m.kind === k).length) })), stacked: true, height: 220, legend: true, fmt: (v) => ERP.fmt.num(v) }) : SA.empty({ icon: 'checkcircle', title: 'لا توجد أوامر مفتوحة' })),
        SA.card({ title: 'أكثر الماكينات توقفًا — 90 يومًا (ساعة)' }, topM.length ? CH.bars(topM, { fmt: (v) => ERP.fmt.num(v, 1) }) : SA.empty({ title: 'لا توجد توقفات' }))));
  }
  function itSec() {
    const it = get('itTickets'); const open = it.filter(T_OPEN); const done = it.filter((t) => !T_OPEN(t) && t.resolvedAt && ms(t.resolvedAt) >= Date.now() - 90 * DAY); const resH = avg(done.map((t) => (ms(t.resolvedAt) - ms(t.openedAt)) / HOUR));
    const assets = get('itAssets').filter((a) => a.status !== 'retired'); const exp = assets.filter((a) => daysTo(a.warrantyUntil) >= 0 && daysTo(a.warrantyUntil) <= 60);
    return h('section.care-sec', {}, secHead('monitor', 'الدعم الفني IT', 'التذاكر والأجهزة'),
      U.kpis([
        U.kpi({ label: 'تذاكر IT مفتوحة', value: open.length, icon: 'monitor', sub: 'غير مُسندة ' + open.filter((t) => !t.assigneeId).length + ' · عالية ' + open.filter((t) => t.priority === 'high' || t.priority === 'urgent').length, href: hrefIf('care/it'), tone: open.some((t) => t.priority === 'urgent' || t.priority === 'high') ? 'warning' : null }),
        U.kpi({ label: 'متوسط زمن الحل IT', value: resH != null ? ERP.fmt.num(resH, 1) + ' س' : '—', icon: 'clock', sub: done.length + ' تذكرة · 90 يومًا' }),
        U.kpi({ label: 'أجهزة في الصيانة', value: assets.filter((a) => a.status === 'repair').length, icon: 'wrench', href: hrefIf('care/it?tab=assets') }),
        U.kpi({ label: 'ضمان ينتهي خلال 60 يومًا', value: exp.length, icon: 'shield', sub: 'منتهي الضمان ' + assets.filter((a) => daysTo(a.warrantyUntil) < 0).length, tone: exp.length ? 'warning' : null, href: hrefIf('care/it?tab=assets') })
      ]));
  }
  function attention() {
    const out = []; const add = (tone, icon, title, sub, href) => out.push({ tone, icon, title, sub, href });
    if (SA.can('care.maintenance.view')) {
      get('lines').filter((l) => l.status === 'down').forEach((ln) => { const dt = get('downtime').find((d) => d.lineId === ln.id && !d.end); const m = get('maintenanceOrders').find((x) => M_OPEN(x) && dt && x.id === dt.mwoId); add('danger', 'factory', ln.name + ' متوقف منذ ' + dur(minsSince((dt && dt.start) || ln.downSince)), m ? m.id + ' — ' + ((C.status.mwo[m.status] || [])[0] || '') : ln.downReason, m ? '#/care/maintenance/' + m.id : null); });
      get('approvals').filter((a) => a.type === 'maintenance_spend' && (a.status === 'pending' || a.status === 'delegated')).forEach((a) => { const stp = (a.chain || []).find((c) => c.status === 'pending') || {}; add('warning', 'inbox', 'اعتماد صرف صيانة بانتظار ' + (stp.label || 'القرار') + ' — ' + a.id, a.title, canRoute('approvals') && SA.approvals && SA.approvals.visible(a) ? '#/approvals/' + a.id : '#/care/maintenance/' + a.ref.id); });
      get('maintenanceOrders').filter((m) => m.status === 'waiting_parts' && !get('lines').some((l) => l.status === 'down' && l.id === m.lineId)).forEach((m) => add('warning', 'box', m.id + ' بانتظار قطع غيار', mName(m.machineId), '#/care/maintenance/' + m.id));
      const od = CA.pmOverdue(); if (od.length) add('warning', 'calendar', od.length + ' صيانة وقائية متأخرة', od.slice(0, 3).map((p) => p.machineId).join('، ') + (od.length > 3 ? '…' : ''), hrefIf('care/pm'));
    }
    if (SA.can('care.spares.view')) { const z = spares().filter((i) => K.qty(i.id, SPW) <= 0 && critical(i)); if (z.length) add('danger', 'box', z.length + ' قطعة غيار حرجة رصيدها صفر', z.map((i) => i.name).join('، '), '#/care/spares'); }
    if (SA.can('care.tickets.view')) {
      const s = tStats(); s.breached.sort((a, b) => slaOf(a).leftH - slaOf(b).leftH).slice(0, 3).forEach((t) => add('danger', 'clock', 'تجاوز SLA: ' + t.id + ' — ' + ERP.customerName(t.customerId), t.title + ' · متأخرة ' + dur(-slaOf(t).leftH * 60), '#/care/tickets/' + t.id));
      const un = s.open.filter((t) => !t.assigneeId && minsSince(tOpened(t)) > 60); if (un.length) add('warning', 'userplus', un.length + ' تذكرة بدون إسناد', un.slice(0, 2).map((t) => t.id).join('، '), '#/care/tickets?assignee=none');
      const pt = s.open.filter((t) => isPortal(t) && t.status === 'open'); if (pt.length) add('info', 'globe', pt.length + ' طلب جديد من بوابة التاجر', pt.map((t) => ERP.customerName(t.customerId)).join('، '), '#/care/tickets?channel=' + encodeURIComponent(PORTAL_CH));
    }
    if (SA.can('care.warranty.view')) { const c = get('warrantyClaims').filter((x) => x.status === 'pending'); if (c.length) add('warning', 'shield', c.length + ' مطالبة ضمان بانتظار القرار', c.map((x) => x.id).join('، '), '#/care/warranty'); }
    if (SA.can('care.visits.view')) { const v = get('visits').filter((x) => x.status === 'scheduled' && x.date === today()); if (v.length) add('info', 'map', v.length + ' زيارة اليوم', v.map((x) => techName(x.techId) + ' → ' + ERP.customerName(x.customerId)).join(' · '), '#/care/visits'); const late = get('visits').filter((x) => x.status === 'scheduled' && x.date < today()); if (late.length) add('danger', 'map', late.length + ' زيارة فات موعدها بدون تقرير', late.map((x) => x.id).join('، '), '#/care/visits'); }
    if (SA.can('care.it.view')) get('itTickets').filter((t) => T_OPEN(t) && (t.priority === 'urgent' || t.priority === 'high')).forEach((t) => add('warning', 'monitor', 'IT: ' + t.title, t.id + ' · ' + uname(t.requesterId), '#/care/it/' + t.id));
    return out;
  }
  function attentionCard() {
    const list = attention();
    return SA.card({ title: 'يحتاج انتباهك', tags: list.length ? h('span.sap-count', {}, list.length) : null }, list.length ? h('ul.care-attn', {}, list.slice(0, 9).map((x) => { const inner = [h('span.care-ico.is-' + x.tone, {}, SA.icon(x.icon, 'icon-sm')), h('span.care-grow', {}, h('b', {}, x.title), x.sub ? h('small', {}, x.sub) : null), x.href ? SA.icon('chevron', 'icon-sm icon-flip') : null]; return h('li', {}, x.href ? h('a', { href: x.href }, inner) : h('div', {}, inner)); })) : SA.empty({ icon: 'checkcircle', title: 'لا يوجد ما يحتاج انتباهك الآن', text: 'كل التذاكر ضمن الـSLA والخطوط تعمل.' }));
  }
  function localInsights() {
    const out = [];
    if (SA.can('care.maintenance.view') || SA.can('care.assets.view')) {
      const cnt = {}; get('maintenanceOrders').filter((m) => m.kind === 'breakdown' && ms(m.openedAt) >= Date.now() - 60 * DAY).forEach((m) => { cnt[m.machineId] = (cnt[m.machineId] || 0) + 1; });
      const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]; const mc = top && mach(top);
      if (mc && cnt[top] >= 2) out.push({ tone: 'danger', title: mc.id + ' تعطّل ' + cnt[top] + ' مرات خلال 60 يومًا', text: 'ماكينة حرجة (' + mc.criticality + ') على ' + lName(mc.lineId) + '. يُنصح برفع الحد الأدنى لأحزمة التسخين ومراجعة رطوبة دقيق الخشب (سبب انسداد فتحة التهوية سابقًا) وتقديم الصيانة الوقائية المتأخرة.', actions: canRoute('care/assets') ? [{ label: 'كارت الماكينة', route: 'care/assets/' + mc.id }] : [] });
      const z = spares().filter((i) => K.qty(i.id, SPW) <= 0 && critical(i)); if (z.length) out.push({ tone: 'warning', title: z.length + ' قطعة غيار حرجة بدون رصيد', text: z.map((i) => i.name).join('، ') + ' — تخدم ماكينات حرجة. توقف ساعة على خط التجاليد يعادل تقريبًا ' + ERP.fmt.num(Math.round(900 * 3 / 24)) + ' قطعة إنتاج.', actions: canRoute('care/spares') ? [{ label: 'قطع الغيار', route: 'care/spares' }] : [] });
    }
    if (SA.can('care.tickets.view')) { const n = visibleTickets().filter((t) => /لون/.test(t.title || '') && ms(tOpened(t)) >= Date.now() - 45 * DAY).length; if (n >= 1) out.push({ tone: 'info', title: 'شكاوى اختلاف اللون مرتبطة بعدم مطابقة مفتوح', text: n + ' تذكرة عن اختلاف لون خلال 45 يومًا — نفس نمط NCR-2026-041 (ΔE على K71-3) والإجراء التصحيحي CAPA-2026-012 جارٍ.', actions: [{ label: 'عرض التذاكر', route: 'care/tickets?q=' + encodeURIComponent('لون') }] }); }
    return out.slice(0, 3);
  }
  function aiBlock() {
    let cards = []; try { cards = U.insights('care', 3) || []; } catch (e) { cards = []; }
    if (!cards.length) cards = localInsights().map((x) => U.aiCard(x));
    return SA.card({ title: 'رؤى ذكية', tags: U.demo('تحليل تجريبي') }, cards.length ? h('div', { style: { display: 'grid', gap: '10px' } }, cards) : SA.empty({ icon: 'sparkle', title: 'لا توجد رؤى حاليًا' }));
  }
  function renderDashboard(root, ctx) {
    ctx.setCrumbs([{ label: 'نظرة عامة' }, { label: 'لوحة الدعم والصيانة' }]);
    let mode = '30';
    const build = () => {
      const canT = SA.can('care.tickets.view'), canM = SA.can('care.maintenance.view') || SA.can('care.assets.view'), canI = SA.can('care.it.view');
      const acts = [SA.can('care.tickets.create') ? SA.btn({ label: 'تذكرة عميل', icon: 'plus', kind: 'ghost', onClick: () => ticketModal({}) }) : null, SA.can('care.maintenance.create') ? SA.btn({ label: 'بلاغ عطل', icon: 'alert', kind: 'ghost', onClick: () => mwoModal({ kind: 'breakdown' }) }) : null, SA.can('care.it.create') ? SA.btn({ label: 'تذكرة IT', icon: 'monitor', kind: 'ghost', onClick: () => itModal({}) }) : null].filter(Boolean);
      return h('div', {}, SA.pageHead({ title: 'لوحة الدعم والصيانة', desc: 'خدمة ما بعد البيع والضمان والتركيب · صيانة الماكينات والأعطال وقطع الغيار · الدعم الفني — كل الأرقام لحظية من نفس البيانات.', actions: acts }),
        canM ? liveBanner() : null, canT ? afterSales() : null, canM ? plant(() => mode, (v) => { mode = v; }) : null, canI ? itSec() : null,
        h('div.care-sec', {}, U.grid(2, attentionCard(), aiBlock())));
    };
    const off = SA.live(root, build, ['tickets', 'maintenanceOrders', 'machines', 'lines', 'downtime', 'itTickets', 'itAssets', 'warrantyClaims', 'visits', 'pmPlans', 'stock', 'approvals']);
    const tick = setInterval(() => tickTimers(root), 15000);
    return () => { off(); clearInterval(tick); };
  }

  /* ═════════════════════════ 2. TICKETS ═════════════════════════ */
  function renderTickets(root, ctx) {
    if (ctx.path[0]) return renderTicket(root, ctx, ctx.path[0]);
    ctx.setCrumbs([{ label: 'خدمة ما بعد البيع' }, { label: 'شكاوى وطلبات العملاء' }]);
    const p = ctx.params || {}; const stat = h('div.sap-statrow', { style: { margin: '0 0 12px' } });
    const custIds = Array.from(new Set(visibleTickets().map((t) => t.customerId)));
    const tbl = SA.table({
      caption: 'تذاكر العملاء', rows: () => visibleTickets(), pageSize: 10,
      search: { placeholder: 'ابحث برقم التذكرة أو العنوان أو العميل…', keys: (r, q) => [r.id, r.title, r.desc, ERP.customerName(r.customerId), r.channel].some((x) => String(x || '').toLowerCase().indexOf(q) >= 0) },
      filters: [
        { key: 'status', label: 'الحالة', options: [['active', 'كل المفتوحة']].concat(Object.keys(C.status.ticket).map((k) => [k, C.status.ticket[k][0]])), test: (r, v) => (v === 'active' ? T_OPEN(r) : r.status === v) },
        { key: 'kind', label: 'النوع', options: Object.keys(KIND).map((k) => [k, KIND[k][0]]) },
        { key: 'priority', label: 'الأولوية', options: Object.keys(PRIO).map((k) => [k, PRIO[k][0]]) },
        { key: 'channel', label: 'القناة', options: CHANNELS.map((c) => [c, c]), test: (r, v) => (v === PORTAL_CH ? isPortal(r) : r.channel === v) },
        { key: 'customer', label: 'العميل', options: custIds.map((c) => [c, ERP.customerName(c)]), test: (r, v) => r.customerId === v },
        { key: 'sla', label: 'SLA', options: [['breached', 'متجاوزة'], ['risk', 'تقترب (< 6 ساعات)'], ['ok', 'ضمن الموعد']], test: (r, v) => { const s = slaOf(r); return v === 'breached' ? s.breached && !s.closed : v === 'risk' ? s.risk : !s.breached; } },
        { key: 'assignee', label: 'الإسناد', options: [['none', 'غير مُسندة'], ['me', 'المُسندة إليّ']], test: (r, v) => (v === 'none' ? !r.assigneeId && T_OPEN(r) : r.assigneeId === me()) },
        { key: 'warranty', label: 'الضمان', options: [['yes', 'تحت الضمان'], ['no', 'بدون ضمان']], test: (r, v) => (v === 'yes' ? !!r.warranty : !r.warranty) }
      ],
      initial: { q: p.q || '', filters: { status: p.status || (p.sla || p.channel || p.q ? '' : 'active'), sla: p.sla || '', channel: p.channel || '', kind: p.kind || '', assignee: p.assignee || '' }, sort: { key: 'sla', dir: 'asc' } },
      columns: [
        { key: 'id', label: 'التذكرة', sort: true, render: (r) => h('div.care-cell', {}, h('a.erp-doc', { href: '#/care/tickets/' + r.id }, r.id), h('small', {}, SA.fmt.rel(tOpened(r)))) },
        { key: 'title', label: 'الموضوع والعميل', sort: (a, b) => ERP.customerName(a.customerId).localeCompare(ERP.customerName(b.customerId), 'ar'), render: (r) => h('div.care-cell', {}, h('b', {}, r.title), h('small', {}, ERP.customerName(r.customerId), isPortal(r) ? [' ', portalBadge()] : null)) },
        { key: 'kind', label: 'النوع', sort: true, render: (r) => chip(KIND, r.kind) },
        { key: 'priority', label: 'الأولوية', sort: (a, b) => Object.keys(PRIO).indexOf(a.priority) - Object.keys(PRIO).indexOf(b.priority), render: (r) => chip(PRIO, r.priority) },
        { key: 'status', label: 'الحالة', sort: true, render: (r) => U.status('ticket', r.status) },
        { key: 'sla', label: 'SLA', sort: true, value: (r) => (T_OPEN(r) ? (slaOf(r).paused ? 1e6 : slaOf(r).leftH) : 1e9 - ms(r.resolvedAt || r.closedAt) / 1e6), render: slaCell },
        { key: 'assigneeId', label: 'المسؤول', render: (r) => (r.assigneeId ? h('span', {}, uname(r.assigneeId)) : SA.chip('غير مُسندة', 'warning')) },
        { key: 'channel', label: 'القناة', render: channelCell }
      ],
      rowActions: (r) => [{ label: 'فتح التذكرة', icon: 'external', onClick: () => SA.nav('care/tickets/' + r.id) },
        { label: 'إسنادها لي', icon: 'userplus', hidden: !T_OPEN(r) || r.assigneeId === me(), disabled: SA.can('care.tickets.edit') ? false : 'ليست من صلاحياتك', onClick: () => act(() => CA.ticketStatus(r.id, r.status === 'open' ? 'assigned' : r.status, { assigneeId: me() }), 'أُسندت التذكرة ' + r.id + ' إليك') },
        { label: 'جدولة زيارة', icon: 'calendar', hidden: !T_OPEN(r), disabled: SA.can('care.visits.create') ? false : 'ليست من صلاحياتك', onClick: () => visitModal({ ticketId: r.id }) }],
      onRowClick: (r) => SA.nav('care/tickets/' + r.id),
      empty: { icon: 'headset', title: 'لا توجد تذاكر', text: 'كل طلبات العملاء تظهر هنا — من الخط الساخن وواتساب وبوابة التاجر والمندوبين.', action: SA.can('care.tickets.create') ? { label: 'تذكرة جديدة', onClick: () => ticketModal({}) } : null }
    });
    const drawStat = () => { const s = tStats(); SA.clear(stat); const pill = (n, label, k, v) => h('span', { role: 'button', tabindex: '0', style: { cursor: 'pointer' }, onclick: () => tbl.setFilter(k, v) }, h('b.num', {}, n), label);
      stat.append(pill(s.open.length, 'مفتوحة', 'status', 'active'), pill(s.breached.length, 'متجاوزة SLA', 'sla', 'breached'), pill(s.unassigned, 'غير مُسندة', 'assignee', 'none'), pill(s.portal, 'من بوابة التاجر', 'channel', PORTAL_CH), pill(s.open.filter((t) => t.status === 'waiting_customer').length, 'بانتظار العميل', 'status', 'waiting_customer')); };
    drawStat();
    root.append(SA.pageHead({ title: 'شكاوى وطلبات العملاء', desc: 'تذاكر ما بعد البيع بكل القنوات — بما فيها «بوابة التاجر». الـSLA يُحسب لحظيًا ويتوقف أثناء انتظار العميل.', actions: [SA.btn({ label: 'تذكرة جديدة', icon: 'plus', perm: 'care.tickets.create', onClick: () => ticketModal({}) })] }), stat, tbl.el);
    const offs = ['tickets', 'customers'].map((x) => st.subscribe(x, () => { drawStat(); tbl.refresh(); }));
    return () => offs.forEach((f) => f());
  }
  function assignModal(t) {
    return formModal({ title: 'إسناد التذكرة ' + t.id, icon: 'userplus', submitLabel: 'إسناد', fields: [fld({ name: 'assigneeId', label: 'المسؤول', type: 'select', required: true, value: t.assigneeId || '', options: [['', 'اختر…']].concat(assignees('care.tickets.edit')) })],
      onSubmit: (v) => act(() => CA.ticketStatus(t.id, t.status === 'open' ? 'assigned' : t.status, { assigneeId: v.assigneeId }), 'أُسندت التذكرة إلى ' + uname(v.assigneeId)) });
  }
  function resolveModal(t) {
    return formModal({ title: 'حل التذكرة ' + t.id, icon: 'checkcircle', submitLabel: 'تسجيل الحل', fields: [fld({ name: 'resolution', label: 'ما الذي تم؟', type: 'textarea', required: true, rows: 3, class: 'care-full', rules: [FM.rules.min(5)], placeholder: 'مثال: تم استبدال 3 ضلف من نفس اللون وتركيبها بمعرفة الفني' }),
      fld({ name: 'public', label: 'إظهار الرد للتاجر في البوابة', type: 'checkbox', value: isPortal(t), class: 'care-full' })],
    onSubmit: (v) => act(() => CA.ticketStatus(t.id, 'resolved', { resolution: v.resolution, public: v.public }), 'تم حل التذكرة — في انتظار تقييم العميل للإغلاق') });
  }
  function waitModal(t) {
    return formModal({ title: 'بانتظار العميل', icon: 'clock', submitLabel: 'إيقاف العداد', intro: SA.alert('info', 'يتوقف عداد الـSLA حتى يرد العميل.'), fields: [fld({ name: 'note', label: 'ماذا ننتظر من العميل؟', type: 'textarea', required: true, rows: 2, class: 'care-full' })],
      onSubmit: (v) => act(() => CA.ticketStatus(t.id, 'waiting_customer', { note: 'بانتظار العميل: ' + v.note, public: isPortal(t) }), 'تم إيقاف العداد بانتظار العميل') });
  }
  function closeModal(t) {
    let csat = 0; const stars = h('div.care-stars', { role: 'group', 'aria-label': 'تقييم العميل من 1 إلى 5' });
    const draw = () => { SA.clear(stars); [1, 2, 3, 4, 5].forEach((n) => stars.appendChild(h('button.care-star', { type: 'button', 'aria-pressed': String(n <= csat), 'aria-label': n + ' من 5', onclick: () => { csat = n; draw(); } }, String(n)))); }; draw();
    return formModal({ title: 'إغلاق التذكرة ' + t.id, icon: 'star', submitLabel: 'إغلاق', extra: h('div', { style: { marginTop: '12px' } }, h('span.label', {}, 'تقييم العميل (CSAT)', h('span.req', {}, '*')), stars, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), 'اسأل العميل: «من 1 إلى 5 ما مدى رضاك عن حل المشكلة؟»')),
      fields: [fld({ name: 'csatNote', label: 'تعليق العميل (اختياري)', type: 'textarea', rows: 2, class: 'care-full' })], collect: () => ({ csat }), check: (v) => (!v.csat ? 'اختر تقييم العميل من 1 إلى 5' : null),
      onSubmit: (v) => act(() => CA.ticketStatus(t.id, 'closed', { csat: v.csat, csatNote: v.csatNote }), 'أُغلقت التذكرة — تقييم ' + csat + '/5') });
  }
  function ticketFlowBtns(t) {
    const b = []; const P = 'care.tickets.edit'; const go = (s, msg) => act(() => CA.ticketStatus(t.id, s), msg);
    if (t.status === 'open') b.push(SA.btn({ label: 'إسناد', icon: 'userplus', perm: P, onClick: () => assignModal(t) }));
    if (t.status === 'assigned') b.push(SA.btn({ label: 'إعادة إسناد', icon: 'swap', kind: 'ghost', perm: P, onClick: () => assignModal(t) }), SA.btn({ label: 'بدء المعالجة', icon: 'play', perm: P, onClick: () => go('in_progress', 'بدأت المعالجة') }));
    if (t.status === 'in_progress') b.push(SA.btn({ label: 'بانتظار العميل', icon: 'clock', kind: 'ghost', perm: P, onClick: () => waitModal(t) }), SA.btn({ label: 'تم الحل', icon: 'checkcircle', perm: P, onClick: () => resolveModal(t) }));
    if (t.status === 'waiting_customer') b.push(SA.btn({ label: 'استئناف', icon: 'play', kind: 'ghost', perm: P, onClick: () => go('in_progress', 'استُؤنفت المعالجة') }), SA.btn({ label: 'تم الحل', icon: 'checkcircle', perm: P, onClick: () => resolveModal(t) }));
    if (t.status === 'resolved') b.push(SA.btn({ label: 'إعادة فتح', icon: 'refresh', kind: 'ghost', perm: P, onClick: () => go('in_progress', 'أُعيد فتح التذكرة') }), SA.btn({ label: 'إغلاق مع تقييم العميل', icon: 'star', perm: 'care.tickets.close', onClick: () => closeModal(t) }));
    if (t.status === 'closed') b.push(SA.btn({ label: 'إعادة فتح', icon: 'refresh', kind: 'ghost', perm: P, onClick: () => go('in_progress', 'أُعيد فتح التذكرة') }));
    return b;
  }
  function renderTicket(root, ctx, id) {
    ctx.setCrumbs([{ label: 'خدمة ما بعد البيع', href: '#/care/tickets' }, { label: 'شكاوى وطلبات العملاء', href: '#/care/tickets' }, { label: id }]);
    const FLOW = ['open', 'assigned', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
    const off = SA.live(root, () => {
      const t = ERP.find('tickets', id);
      if (!t || !visibleTickets().some((x) => x.id === id)) return h('div', {}, SA.pageHead({ title: 'التذكرة غير موجودة', back: { href: '#/care/tickets', label: 'كل التذاكر' } }), SA.empty({ icon: 'search', title: 'لم نجد التذكرة ' + id, text: 'ربما الرقم غير صحيح أو التذكرة ليست ضمن نطاقك.' }));
      const s = slaOf(t); const c = ERP.customer(t.customerId) || {}; const contact = t.contact || (c.contacts || [])[0] || {}; const canE = SA.can('care.tickets.edit');
      const visits = get('visits').filter((v) => v.ticketId === id || (t.visitIds || []).indexOf(v.id) >= 0); const claim = t.claimId ? ERP.find('warrantyClaims', t.claimId) : null; const ncr = t.ncrId ? ERP.find('ncrs', t.ncrId) : null;
      const head = SA.pageHead({ title: t.title, back: { href: '#/care/tickets', label: 'كل التذاكر' }, tags: [h('span.num.care-muted', {}, t.id), U.status('ticket', t.status), chip(KIND, t.kind), chip(PRIO, t.priority), isPortal(t) ? portalBadge() : null], actions: ticketFlowBtns(t) });
      const idx = FLOW.indexOf(t.status);
      const slaBox = h('div', {}, s.closed ? h('div', {}, h('div.care-row', {}, h('b.care-big.num', { style: { color: s.breached ? 'var(--color-danger)' : 'var(--color-success)' } }, dur((ms(t.resolvedAt || t.closedAt) - ms(tOpened(t))) / 60000)), h('span.care-muted', {}, s.breached ? 'زمن الحل — بعد موعد الـSLA' : 'زمن الحل — ضمن الـSLA')))
        : s.paused ? h('div.care-row', {}, h('b.care-big', { style: { color: 'var(--color-text-muted)' } }, 'متوقف'), h('span.care-muted', {}, 'العداد متوقف أثناء انتظار العميل'))
          : h('div.care-row', {}, h('b.care-big.num', { style: { color: s.breached ? 'var(--color-danger)' : s.risk ? 'var(--color-warning)' : 'var(--color-success)' } }, (s.breached ? '−' : '') + dur(Math.abs(s.leftH) * 60)), h('span.care-muted', {}, s.breached ? 'تجاوزت موعد الـSLA' : 'متبقٍ حتى موعد الـSLA')),
        h('div', { style: { margin: '10px 0' } }, CH.meter(s.pct, { label: 'استهلاك وقت الـSLA (' + (t.slaHours || 48) + ' ساعة)', tone: s.breached ? 'danger' : s.risk ? 'warning' : 'success' })),
        h('p.care-muted', {}, 'الموعد النهائي: ' + SA.fmt.dt(new Date(s.due).toISOString())));
      const info = SA.kv([['العميل', U.docLink(t.customerId, ERP.customerName(t.customerId))], ['جهة الاتصال', h('span', {}, contact.name || '—', contact.phone ? [' · ', h('span.num', { dir: 'ltr' }, contact.phone)] : null)],
        ['القناة', channelCell(t)], ['الصنف', t.itemId ? U.itemCell(t.itemId) : '—'], ['الكمية المتأثرة', t.qty ? ERP.fmt.num(t.qty) : '—'], ['أمر البيع', doc(t.soId)], ['المسؤول', t.assigneeId ? uname(t.assigneeId) : SA.chip('غير مُسندة', 'warning')],
        ['فُتحت', SA.fmt.dt(tOpened(t)) + ' · ' + SA.fmt.rel(tOpened(t))], ['الضمان', t.warranty ? SA.chip('تحت الضمان', 'warning') : 'لا'], t.resolution ? ['الحل', t.resolution] : null, t.csat ? ['تقييم العميل', h('span', {}, h('b.num', {}, t.csat + ' / 5'), t.csatNote ? ' — ' + t.csatNote : '')] : null]);
      const notes = (t.notes || []).slice().sort((a, b) => (a.at < b.at ? -1 : 1));
      const nText = fld({ name: 'note', label: 'إضافة متابعة', type: 'textarea', rows: 2, placeholder: 'اكتب ما تم مع العميل…' }); const nPub = fld({ name: 'pub', label: 'مرئية للتاجر/العميل في البوابة', type: 'checkbox', value: isPortal(t) });
      const addNote = canE ? h('div', { style: { marginTop: '12px' } }, nText.el, h('div.care-row', { style: { justifyContent: 'space-between' } }, nPub.el, SA.btn({ label: 'إضافة', icon: 'plus', size: 'sm', onClick: () => { const v = String(nText.get() || '').trim(); if (v.length < 2) { nText.error('اكتب المتابعة'); return; } act(() => CA.addNote(id, v, nPub.get()), 'تمت إضافة المتابعة'); } }))) : null;
      const noteList = notes.length ? h('ul.care-notes', {}, notes.map((n) => h('li.care-note', {}, SA.avatar(uname(n.by)), h('div.care-note-b' + (n.public ? '.is-public' : n.sys ? '.is-sys' : ''), {}, h('small', {}, h('b', {}, uname(n.by)), h('span', {}, SA.fmt.dt(n.at)), n.public ? h('span.care-portal', {}, SA.icon('eye', 'icon-sm'), 'مرئية للعميل') : null), n.text)))) : h('p.care-muted', {}, 'لا توجد متابعات بعد.');
      const canC = t.kind === 'complaint' || t.kind === 'warranty';
      const related = SA.card({ title: 'الإجراءات المرتبطة' },
        h('div.sap-sub', {}, 'عدم المطابقة (الجودة)'), ncr ? h('div.care-row', {}, U.docLink(ncr.id), U.status('ncr', ncr.status), h('span.care-muted', {}, (ERP.defectCodes.find((d) => d.code === ncr.defectCode) || {}).label || '')) : canC ? h('div.care-row', {}, h('span.care-muted', {}, 'لم يُفتح عدم مطابقة لهذه الشكوى.'), SA.btn({ label: 'فتح NCR', icon: 'alert', kind: 'ghost', size: 'sm', perm: 'care.tickets.edit', onClick: () => ncrModal(t) })) : h('p.care-muted', {}, 'لا ينطبق على هذا النوع.'),
        h('div.sap-sub', {}, 'الزيارات'), visits.length ? h('ul.care-attn', {}, visits.map((v) => h('li', {}, h('a', { href: '#/care/visits?v=' + v.id }, h('span.care-ico', {}, SA.icon('map', 'icon-sm')), h('span.care-grow', {}, h('b', {}, VKIND[v.kind] + ' — ' + ERP.fmt.date(v.date) + ' ' + v.time), h('small', {}, techName(v.techId) + ' · ' + v.id)), U.status('care_visit', v.status === 'scheduled' && v.date < today() ? 'late' : v.status))))) : h('p.care-muted', {}, 'لا توجد زيارات.'),
        T_OPEN(t) ? h('div', { style: { marginTop: '8px' } }, SA.btn({ label: 'جدولة زيارة', icon: 'calendar', kind: 'ghost', size: 'sm', perm: 'care.visits.create', onClick: () => visitModal({ ticketId: id }) })) : null,
        h('div.sap-sub', {}, 'الضمان'), claim ? h('div.care-row', {}, rlink('care/warranty?q=' + claim.id, claim.id), U.status('care_claim', claim.status), claim.replacementSoId ? ['أمر الاستبدال: ', U.docLink(claim.replacementSoId)] : null) : canC && T_OPEN(t) ? h('div.care-row', {}, h('span.care-muted', {}, 'لا توجد مطالبة ضمان.'), SA.btn({ label: 'فتح مطالبة ضمان', icon: 'shield', kind: 'ghost', size: 'sm', perm: 'care.tickets.edit', onClick: () => claimModal({ ticketId: id }) })) : h('p.care-muted', {}, '—'));
      const so = t.soId ? ERP.find('salesOrders', t.soId) : null;
      return h('div', {}, head,
        isPortal(t) ? SA.alert('info', h('b', {}, 'تذكرة من بوابة التاجر'), ' — أرسلها ' + (t.createdBy ? uname(t.createdBy) : ERP.customerName(t.customerId)) + '. المتابعات المعلّمة «مرئية للعميل» تظهر للتاجر في صفحة «الدعم والشكاوى» بالبوابة.') : null,
        h('div.card', { style: { padding: '14px 16px', marginBottom: '14px' } }, SA.stepper(['جديدة', 'مُسندة', 'قيد المعالجة', 'بانتظار العميل', 'تم الحل', 'مغلقة'], idx < 0 ? 0 : idx)),
        U.grid(2, SA.card({ title: 'بيانات التذكرة' }, t.desc ? h('p', { style: { marginTop: 0, lineHeight: 1.8 } }, t.desc) : null, info), h('div', { style: { display: 'grid', gap: '16px', alignContent: 'start', minWidth: 0 } }, SA.card({ title: 'الـSLA' }, slaBox), related)),
        U.grid(2, SA.card({ title: 'المتابعة والملاحظات', tags: h('span.sap-count', {}, notes.length) }, noteList, addNote), so ? SA.card({ title: 'دورة أمر البيع ' + so.id }, U.chain(so.id)) : SA.card({ title: 'سجل التذكرة' }, timeline(get('audit').filter((a) => a.target && a.target.id === id).slice(0, 8).map((a) => ({ at: a.ts, by: a.actor && a.actor.id, text: SA.auditLabel(a.code) + (a.after && a.after.status ? ' → ' + ((C.status.ticket[a.after.status] || [])[0] || a.after.status) : ''), icon: 'history', tone: 'info' }))))));
    }, ['tickets', 'visits', 'warrantyClaims', 'ncrs', 'salesOrders']);
    return off;
  }

  /* cross-module link: a document link only when the target screen exists and is permitted, else plain text */
  const dl = (id, label) => { if (!id) return '—'; const r = ERP.route(id); return r && hrefIf(r) ? U.docLink(id, label) : h('span.num', {}, label || id); };
  const miniTable = (heads, rows, empty) => (rows.length ? h('div.table-wrap', {}, h('table.table.sap-mini', {}, h('thead', {}, h('tr', {}, heads.map((x) => h('th', {}, x)))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c == null || c === '' ? '—' : c)))))))
    : SA.empty({ icon: 'inbox', title: empty || 'لا توجد سجلات' }));
  const notFound = (title, back, label) => h('div', {}, SA.pageHead({ title, back: { href: back, label } }), SA.empty({ icon: 'search', title: 'لم نجد السجل المطلوب', text: 'ربما الرقم غير صحيح.' }));

  /* ═════════════════════════ 3. WARRANTY ═════════════════════════ */
  function renderWarranty(root, ctx) {
    ctx.setCrumbs([{ label: 'خدمة ما بعد البيع' }, { label: 'مطالبات الضمان' }]);
    const p = ctx.params || {}; const kp = h('div');
    async function decide(c, ok) {
      const it = ERP.item(c.itemId) || {}; const av = K.available(c.itemId, K.FG);
      const r = await SA.confirm({ title: (ok ? 'اعتماد' : 'رفض') + ' مطالبة الضمان ' + c.id, icon: ok ? 'checkcircle' : 'xcircle', danger: !ok, confirmLabel: ok ? 'اعتماد وإنشاء أمر الاستبدال' : 'رفض المطالبة', text: ERP.customerName(c.customerId) + ' — ' + (it.name || c.itemId) + ' × ' + c.qty + ' — ' + c.reason,
        impact: ok ? ['يُنشأ أمر بيع استبدال بسعر صفر للعميل ويُؤكَّد فورًا (نفس دورة المبيعات).', av >= c.qty ? 'المتاح في مخزن المنتج التام ' + ERP.fmt.num(av) + ' — سيُحجز ويصبح الأمر «جاهز للتسليم».' : 'المتاح ' + ERP.fmt.num(av) + ' فقط — سيُنشأ أمر تشغيل للباقي.', 'تُسجَّل متابعة على التذكرة وتظهر للعميل/التاجر.'] : ['تُغلق المطالبة «مرفوضة» ويصل السبب لخدمة العملاء والعميل.'],
        reason: true, reasonRequired: !ok, reasonLabel: ok ? 'ملاحظة القرار (اختياري)' : 'سبب الرفض' });
      if (!r.ok) return;
      await act(() => CA.decideClaim(c.id, ok, r.reason), (res) => (ok ? 'اعتُمدت المطالبة — أمر الاستبدال ' + (res && res.so ? res.so.id + ' (' + ((C.status.so[res.so.status] || [])[0] || '') + ')' : '') : 'رُفضت المطالبة'));
    }
    const decideCell = (c) => {
      if (c.status !== 'pending') return c.decidedBy ? h('div.care-cell', {}, h('b', {}, uname(c.decidedBy)), h('small', {}, ERP.fmt.date(c.decidedAt) + (c.decisionNote ? ' — ' + c.decisionNote : ''))) : '—';
      const sod = c.openedBy === me() ? 'فصل المهام: لا يمكنك البتّ في مطالبة فتحتها بنفسك' : '';
      return h('div.care-row', {}, SA.btn({ label: 'اعتماد', icon: 'check', size: 'sm', perm: 'care.warranty.approve', reason: sod, onClick: () => decide(c, true) }), SA.btn({ label: 'رفض', icon: 'x', size: 'sm', kind: 'ghost', perm: 'care.warranty.approve', reason: sod, onClick: () => decide(c, false) }));
    };
    const costOf = (c) => c.qty * ((ERP.item(c.itemId) || {}).stdCost || 0);
    const tbl = SA.table({ caption: 'مطالبات الضمان', rows: () => get('warrantyClaims'), pageSize: 10,
      search: { placeholder: 'ابحث برقم المطالبة أو العميل أو الصنف…', keys: (r, q) => [r.id, r.ticketId, ERP.customerName(r.customerId), ERP.itemName(r.itemId), r.reason].some((x) => String(x || '').toLowerCase().indexOf(q) >= 0) },
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(C.status.care_claim).map((k) => [k, C.status.care_claim[k][0]]) }, { key: 'customerId', label: 'العميل', options: Array.from(new Set(get('warrantyClaims').map((c) => c.customerId))).map((c) => [c, ERP.customerName(c)]) }],
      initial: { q: p.q || '', filters: { status: p.status || '' }, sort: { key: 'openedAt', dir: 'desc' } },
      columns: [
        { key: 'id', label: 'المطالبة', sort: true, render: (r) => h('div.care-cell', {}, h('b.num', {}, r.id), h('small', {}, r.ticketId ? 'من ' : '', r.ticketId ? h('a.erp-doc', { href: '#/care/tickets/' + r.ticketId }, r.ticketId) : 'بدون تذكرة')) },
        { key: 'customerId', label: 'العميل', sort: (a, b) => ERP.customerName(a.customerId).localeCompare(ERP.customerName(b.customerId), 'ar'), render: (r) => h('div.care-cell', {}, h('b', {}, ERP.customerName(r.customerId)), h('small', {}, r.reason)) },
        { key: 'itemId', label: 'الصنف × الكمية', render: (r) => h('div.care-row', {}, U.itemCell(r.itemId), h('b.num', {}, '× ' + r.qty)) },
        { key: 'cost', label: 'تكلفة الاستبدال', sort: (a, b) => costOf(a) - costOf(b), render: (r) => U.cost(costOf(r)) },
        { key: 'status', label: 'الحالة', sort: true, render: (r) => U.status('care_claim', r.status) },
        { key: 'openedAt', label: 'فُتحت', sort: true, render: (r) => h('div.care-cell', {}, h('span', {}, SA.fmt.rel(r.openedAt)), h('small', {}, uname(r.openedBy))) },
        { key: 'replacementSoId', label: 'أمر الاستبدال', render: (r) => (r.replacementSoId ? h('div.care-cell', {}, dl(r.replacementSoId), h('small', {}, ((C.status.so[(ERP.find('salesOrders', r.replacementSoId) || {}).status] || [])[0]) || '')) : '—') },
        { key: 'decision', label: 'القرار', render: decideCell }
      ],
      empty: { icon: 'shield', title: 'لا توجد مطالبات ضمان', text: 'تُفتح المطالبة من تذكرة الشكوى أو من هنا.' } });
    const drawK = () => { const all = get('warrantyClaims'); const from = Date.now() - 90 * DAY; const dec = all.filter((c) => c.decidedAt && ms(c.decidedAt) >= from); const ap = dec.filter((c) => c.status === 'approved'); const pend = all.filter((c) => c.status === 'pending');
      SA.clear(kp); kp.append(U.kpis([U.kpi({ label: 'بانتظار القرار', value: pend.length, icon: 'shield', tone: pend.length ? 'warning' : 'success', sub: pend.length ? 'أقدمها ' + SA.fmt.rel(pend.map((c) => c.openedAt).sort()[0]) : '' }),
        U.kpi({ label: 'معتمدة (90 يومًا)', value: ap.length, icon: 'checkcircle', sub: dec.length ? 'نسبة الاعتماد ' + Math.round((ap.length / dec.length) * 100) + '%' : '' }), U.kpi({ label: 'مرفوضة (90 يومًا)', value: dec.length - ap.length, icon: 'xcircle' }),
        U.kpi({ label: 'تكلفة الاستبدال (90 يومًا)', value: U.canCost() ? ERP.fmt.short(ap.reduce((s, c) => s + costOf(c), 0)) : U.cost(0), icon: 'coins', sub: 'بسعر التكلفة المعياري' }),
        U.kpi({ label: 'متوسط زمن القرار', value: dec.length ? dur(avg(dec.map((c) => (ms(c.decidedAt) - ms(c.openedAt)) / 60000))) : '—', icon: 'clock' })])); };
    drawK();
    root.append(SA.pageHead({ title: 'مطالبات الضمان', desc: 'خدمة العملاء تفتح المطالبة، والإدارة تقرر (care.warranty.approve) — الاعتماد يُنشئ أمر بيع استبدال بسعر صفر عبر دورة المبيعات نفسها.', actions: [SA.btn({ label: 'مطالبة جديدة', icon: 'plus', perm: 'care.tickets.edit', onClick: () => claimModal({}) })] }),
      SA.can('care.warranty.approve') ? null : SA.alert('info', 'القرار على المطالبات للإدارة (صلاحية care.warranty.approve). يمكنك متابعة الحالة وإضافة الأدلة من التذكرة.'), kp, tbl.el);
    const offs = ['warrantyClaims', 'salesOrders'].map((x) => st.subscribe(x, () => { drawK(); tbl.refresh(); }));
    return () => offs.forEach((f) => f());
  }

  /* ═════════════════════════ 4. VISITS ═════════════════════════ */
  const vState = (v) => (v.status === 'scheduled' && v.date < today() ? 'late' : v.status);
  const MEAS = { installation: ['مساحة التركيب (م²)', 'عدد القطع/الأبواب المركبة', 'استواء الحائط (مم/م)', 'رطوبة الحائط %'], inspection: ['عدد الوحدات المعيبة', 'القياس (ΔE / مم)', 'رقم الدفعة (Lot)', 'ظروف التركيب'], warranty: ['عدد الوحدات المعيبة', 'مقدار العيب/التقوّس (مم)', 'تعرض للشمس/الرطوبة', 'رقم الدفعة (Lot)'], service: ['العمل المنفذ', 'القطع المستبدلة'] };
  const RESULT = { ok: ['تم بنجاح', 'success'], followup: ['يحتاج متابعة', 'warning'], failed: ['لم تتم', 'danger'] };
  function completeVisitModal(v) {
    const c = ERP.customer(v.customerId) || {}; const inputs = (MEAS[v.kind] || MEAS.service).map((k) => [k, h('input.input', { type: 'text', 'aria-label': k })]);
    let photos = 0; const ph = h('div.care-photos', {}, [1, 2, 3].map((n) => { const lab = h('span', {}, 'التقاط صورة ' + n); const b = h('button.care-photo', { type: 'button', onclick: () => { const on = b.classList.toggle('is-on'); photos += on ? 1 : -1; lab.textContent = on ? 'صورة ' + n + ' مرفقة' : 'التقاط صورة ' + n; } }, SA.icon('upload'), lab); return b; }));
    const sName = h('input.input', { type: 'text', placeholder: 'اسم العميل/المستلم', value: ((c.contacts || [])[0] || {}).name || '', 'aria-label': 'اسم الموقّع' }); const sBox = h('div.care-sign', {}, 'منطقة توقيع العميل على التابلت'); let signed = false;
    const sBtn = SA.btn({ label: 'توقيع العميل', icon: 'edit', kind: 'ghost', size: 'sm', onClick: () => { if (!sName.value.trim()) { SA.toast('اكتب اسم العميل أولًا', 'warn'); return; } signed = !signed; sBox.classList.toggle('is-on', signed); sBox.textContent = signed ? sName.value.trim() : 'منطقة توقيع العميل على التابلت'; } });
    return formModal({ title: 'إتمام ' + VKIND[v.kind] + ' — ' + v.id, subtitle: ERP.customerName(v.customerId) + ' · ' + techName(v.techId), icon: 'checkcircle', size: 'lg', submitLabel: 'حفظ التقرير وإتمام الزيارة',
      fields: [fld({ name: 'result', label: 'النتيجة', type: 'select', value: 'ok', options: Object.keys(RESULT).map((k) => [k, RESULT[k][0]]) }), v.ticketId ? fld({ name: 'resolveTicket', label: 'حل التذكرة المرتبطة ' + v.ticketId, type: 'checkbox', value: v.kind === 'installation' }) : null, fld({ name: 'notes', label: 'ملاحظات الفني', type: 'textarea', rows: 2, class: 'care-full' })],
      extra: h('div', {}, h('div.sap-sub', {}, 'القياسات'), h('div.care-meas', {}, inputs.map((x) => [h('span', {}, x[0]), x[1]])), h('div.sap-sub', {}, 'الصور ', U.demo('تجريبي — بدون رفع فعلي')), ph, h('div.sap-sub', {}, 'توقيع العميل على الاستلام ', U.demo('تجريبي')), h('div.care-row', { style: { marginBottom: '8px' } }, h('div', { style: { flex: 1 } }, sName), sBtn), sBox),
      collect: () => ({ measurements: inputs.map((x) => [x[0], x[1].value.trim()]).filter((x) => x[1]), photos, signedBy: signed ? sName.value.trim() : null }),
      check: (x) => (x.result === 'ok' && !x.signedBy ? 'اطلب توقيع العميل على الاستلام قبل الإتمام' : null),
      onSubmit: (x) => act(() => CA.completeVisit(v.id, x), 'تم حفظ تقرير الزيارة' + (x.resolveTicket ? ' وحل التذكرة' : '')) });
  }
  function visitDrawer(id) {
    const v = ERP.find('visits', id); if (!v) return; const tc = get('careTechs').find((x) => x.id === v.techId) || {}; const r = v.report;
    const body = h('div', {}, h('div.care-row', { style: { marginBottom: '12px' } }, U.status('care_visit', vState(v)), SA.chip(VKIND[v.kind], 'info'), r ? chip(RESULT, r.result) : null),
      SA.kv([['العميل', U.docLink(v.customerId, ERP.customerName(v.customerId))], ['الموعد', dayName(v.date) + ' ' + ERP.fmt.date(v.date) + ' — ' + v.time + ' (' + v.durH + ' ساعة)'], ['الفني', h('span', {}, tc.name || '—', tc.phone ? [' · ', h('span.num', { dir: 'ltr' }, tc.phone)] : null)], ['العنوان', v.address || '—'], ['التذكرة', v.ticketId ? h('a.erp-doc', { href: '#/care/tickets/' + v.ticketId }, v.ticketId) : '—'], ['ملاحظات', v.notes || '—'], v.cancelReason ? ['سبب الإلغاء', v.cancelReason] : null]),
      r ? h('div', {}, h('div.sap-sub', {}, 'تقرير الزيارة'), r.measurements && r.measurements.length ? SA.kv(r.measurements) : null, r.notes ? h('p', { style: { lineHeight: 1.8 } }, r.notes) : null, h('div.care-row', {}, SA.chip((r.photos || 0) + ' صور', 'neutral'), r.signedBy ? SA.chip('وقّع: ' + r.signedBy, 'success') : SA.chip('بدون توقيع', 'warning'), h('span.care-muted', {}, SA.fmt.dt(r.signedAt || v.doneAt)))) : null);
    const can = SA.can('care.visits.edit'); const foot = v.status === 'scheduled' ? [SA.btn({ label: 'إلغاء الزيارة', icon: 'x', kind: 'ghost', perm: 'care.visits.edit', onClick: async () => { const x = await SA.confirm({ title: 'إلغاء الزيارة ' + v.id, reasonRequired: true, reasonLabel: 'سبب الإلغاء', confirmLabel: 'إلغاء الزيارة' }); if (!x.ok) return; if (await act(() => CA.cancelVisit(v.id, x.reason), 'أُلغيت الزيارة')) d.close(); } }),
      SA.btn({ label: 'إتمام وتقرير', icon: 'checkcircle', perm: 'care.visits.edit', onClick: () => { d.close(); completeVisitModal(ERP.find('visits', v.id)); } })] : [];
    const d = SA.drawer({ title: VKIND[v.kind] + ' — ' + ERP.customerName(v.customerId), subtitle: v.id, body, foot: can || foot.length ? foot : [], size: 'md' });
  }
  function renderVisits(root, ctx) {
    ctx.setCrumbs([{ label: 'خدمة ما بعد البيع' }, { label: 'زيارات التركيب والمعاينة' }]);
    const p = ctx.params || {}; let wk = 0; const kp = h('div'); const grid = h('div');
    function drawGrid() {
      SA.clear(grid); const w0 = weekStart(wk); const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(w0, i)); const vs = get('visits'); const t0 = today();
      const g = h('div.care-week', { role: 'table', 'aria-label': 'جدول الزيارات الأسبوعي حسب الفني' }, h('div.is-head', {}, 'الفني'), days.map((d) => h('div.is-head' + (d === t0 ? '.is-today' : ''), {}, dayName(d), h('small', {}, d.slice(8) + '/' + d.slice(5, 7)))));
      get('careTechs').forEach((tc) => { g.append(h('div.is-tech', {}, h('b', {}, tc.name), h('small', {}, tc.role + ' · ' + tc.zone))); days.forEach((d) => g.append(h('div' + (d === t0 ? '.is-today' : '') + (isFri(d) ? '.is-off' : ''), {}, vs.filter((v) => v.techId === tc.id && v.date === d).sort((a, b) => (a.time < b.time ? -1 : 1)).map((v) => h('button.care-vchip.is-' + vState(v), { type: 'button', title: v.id + ' — ' + (v.notes || ''), onclick: () => visitDrawer(v.id) }, h('b', {}, v.time + ' · ' + v.durH + ' س'), VKIND[v.kind] + ' — ' + ERP.customerName(v.customerId)))))); });
      grid.append(h('div.care-row', { style: { justifyContent: 'space-between', marginBottom: '10px' } }, h('b', {}, 'الأسبوع من ' + ERP.fmt.date(days[0]) + ' إلى ' + ERP.fmt.date(days[6])),
        h('div.care-row', {}, SA.btn({ label: 'الأسبوع السابق', icon: 'arrowright', kind: 'ghost', size: 'sm', onClick: () => { wk--; drawGrid(); } }), SA.btn({ label: 'هذا الأسبوع', kind: 'ghost', size: 'sm', onClick: () => { wk = 0; drawGrid(); } }), SA.btn({ label: 'الأسبوع التالي', icon: 'arrowleft', kind: 'ghost', size: 'sm', onClick: () => { wk++; drawGrid(); } }))), g,
        h('p.care-muted', { style: { marginTop: '8px' } }, 'اضغط على الزيارة لعرض التفاصيل أو إتمامها بتقرير. الجمعة إجازة.'));
    }
    const drawK = () => { const vs = get('visits'); const w0 = weekStart(0), w1 = addDays(w0, 6); const wkV = vs.filter((v) => v.date >= w0 && v.date <= w1 && v.status !== 'cancelled'); const late = vs.filter((v) => vState(v) === 'late');
      SA.clear(kp); kp.append(U.kpis([U.kpi({ label: 'زيارات هذا الأسبوع', value: wkV.length, icon: 'calendar', sub: 'تركيب ' + wkV.filter((v) => v.kind === 'installation').length + ' · معاينة ' + wkV.filter((v) => v.kind !== 'installation').length }), U.kpi({ label: 'تمت هذا الأسبوع', value: wkV.filter((v) => v.status === 'done').length, icon: 'checkcircle' }),
        U.kpi({ label: 'زيارات اليوم', value: vs.filter((v) => v.date === today() && v.status === 'scheduled').length, icon: 'map' }), U.kpi({ label: 'فات موعدها بدون تقرير', value: late.length, icon: 'alert', tone: late.length ? 'danger' : 'success' }),
        U.kpi({ label: 'تقارير بتوقيع العميل', value: vs.filter((v) => v.report && v.report.signedBy).length, icon: 'edit', sub: 'من ' + vs.filter((v) => v.status === 'done').length + ' زيارة تمت' })])); };
    const tbl = SA.table({ caption: 'كل الزيارات', rows: () => get('visits'), pageSize: 10,
      search: { placeholder: 'ابحث برقم الزيارة أو العميل أو العنوان…', keys: (r, q) => [r.id, ERP.customerName(r.customerId), r.address, r.ticketId, techName(r.techId)].some((x) => String(x || '').toLowerCase().indexOf(q) >= 0) },
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(C.status.care_visit).map((k) => [k, C.status.care_visit[k][0]]), test: (r, v) => vState(r) === v }, { key: 'kind', label: 'النوع', options: Object.keys(VKIND).map((k) => [k, VKIND[k]]) }, { key: 'techId', label: 'الفني', options: get('careTechs').map((x) => [x.id, x.name]) }],
      initial: { q: p.v || '', sort: { key: 'date', dir: 'desc' } },
      columns: [{ key: 'id', label: 'الزيارة', sort: true, render: (r) => h('b.num', {}, r.id) }, { key: 'date', label: 'الموعد', sort: (a, b) => (a.date + a.time < b.date + b.time ? -1 : 1), render: (r) => h('div.care-cell', {}, h('b', {}, dayName(r.date) + ' ' + ERP.fmt.date(r.date)), h('small', {}, r.time + ' · ' + r.durH + ' ساعة')) },
        { key: 'kind', label: 'النوع', render: (r) => SA.chip(VKIND[r.kind], r.kind === 'installation' ? 'info' : 'neutral') }, { key: 'customerId', label: 'العميل', render: (r) => h('div.care-cell', {}, h('b', {}, ERP.customerName(r.customerId)), h('small', {}, r.address)) },
        { key: 'techId', label: 'الفني', render: (r) => techName(r.techId) }, { key: 'ticketId', label: 'التذكرة', render: (r) => (r.ticketId ? h('a.erp-doc', { href: '#/care/tickets/' + r.ticketId }, r.ticketId) : '—') },
        { key: 'status', label: 'الحالة', sort: true, render: (r) => U.status('care_visit', vState(r)) }, { key: 'report', label: 'التقرير', render: (r) => (r.report ? h('div.care-row', {}, chip(RESULT, r.report.result), r.report.signedBy ? SA.chip('موقّع', 'success') : null) : '—') }],
      rowActions: (r) => [{ label: 'التفاصيل', icon: 'eye', onClick: () => visitDrawer(r.id) }, { label: 'إتمام وتقرير', icon: 'checkcircle', hidden: r.status !== 'scheduled', disabled: SA.can('care.visits.edit') ? false : 'ليست من صلاحياتك', onClick: () => completeVisitModal(r) }],
      onRowClick: (r) => visitDrawer(r.id), empty: { icon: 'map', title: 'لا توجد زيارات' } });
    drawK(); drawGrid();
    root.append(SA.pageHead({ title: 'زيارات التركيب والمعاينة', desc: 'جدول الفنيين الأسبوعي — التركيب، معاينات الشكاوى والضمان، مع تقرير القياسات والصور وتوقيع العميل.', actions: [SA.btn({ label: 'زيارة جديدة', icon: 'plus', perm: 'care.visits.create', onClick: () => visitModal({}) })] }), kp, SA.card({ title: 'جدول الفنيين' }, grid), h('div', { style: { marginTop: '16px' } }, tbl.el));
    const offs = ['visits'].map((x) => st.subscribe(x, () => { drawK(); drawGrid(); tbl.refresh(); }));
    if (p.v && ERP.find('visits', p.v)) setTimeout(() => visitDrawer(p.v), 60);
    return () => offs.forEach((f) => f());
  }

  /* ═════════════════════════ 5. ASSETS ═════════════════════════ */
  const critCell = (c) => h('span.care-crit.is-' + (c || 'C'), { title: 'درجة الأهمية ' + c }, c || '—');
  const pmNext = (m) => { const d = daysTo(m.nextPMAt); return h('span.care-pmnext' + (d < 0 ? '.is-overdue' : d <= 7 ? '.is-soon' : ''), {}, d < 0 ? SA.icon('alert', 'icon-sm') : null, ERP.fmt.date(m.nextPMAt), h('small', { style: { display: 'block', fontWeight: 400 } }, d < 0 ? 'متأخرة ' + -d + ' يوم' : d === 0 ? 'اليوم' : 'بعد ' + d + ' يوم')); };
  const avail = (m) => (m.mtbfH && m.mttrH != null ? m.mtbfH / (m.mtbfH + m.mttrH) : null);
  function renderAssets(root, ctx) {
    if (ctx.path[0]) return renderMachine(root, ctx, ctx.path[0]);
    ctx.setCrumbs([{ label: 'صيانة المصنع' }, { label: 'سجل الماكينات' }]); const p = ctx.params || {}; const kp = h('div');
    const openOf = (id) => get('maintenanceOrders').filter((x) => x.machineId === id && M_OPEN(x)).length;
    const tbl = SA.table({ caption: 'سجل الماكينات', rows: () => get('machines'), pageSize: 25,
      search: { placeholder: 'ابحث بكود أو اسم الماكينة أو المصنّع…', keys: ['id', 'name', 'maker', 'code'] },
      filters: [{ key: 'lineId', label: 'الخط', options: get('lines').map((l) => [l.id, l.name]).concat([['none', 'مرافق مشتركة']]), test: (r, v) => (v === 'none' ? !r.lineId : r.lineId === v) }, { key: 'criticality', label: 'الأهمية', options: [['A', 'A — حرجة'], ['B', 'B'], ['C', 'C']] },
        { key: 'status', label: 'الحالة', options: Object.keys(C.status.machine).map((k) => [k, C.status.machine[k][0]]) }, { key: 'pm', label: 'الصيانة الوقائية', options: [['overdue', 'متأخرة'], ['soon', 'خلال 7 أيام']], test: (r, v) => (v === 'overdue' ? daysTo(r.nextPMAt) < 0 : daysTo(r.nextPMAt) >= 0 && daysTo(r.nextPMAt) <= 7) },
        { key: 'type', label: 'النوع', options: Object.keys(MTYPE).map((k) => [k, MTYPE[k]]) }],
      initial: { filters: { status: p.status || '', pm: p.pm || '', lineId: p.line || '' }, sort: { key: 'id', dir: 'asc' } },
      columns: [{ key: 'id', label: 'الماكينة', sort: true, render: (r) => h('div.care-cell', {}, h('a.erp-doc', { href: '#/care/assets/' + r.id }, r.id), h('b', {}, r.name)) },
        { key: 'lineId', label: 'الخط', sort: true, render: (r) => (r.lineId ? h('div.care-cell', {}, dl(r.lineId), h('small', {}, lName(r.lineId))) : h('span.care-muted', {}, 'مرافق مشتركة')) },
        { key: 'type', label: 'النوع / المصنّع', render: (r) => h('div.care-cell', {}, h('b', {}, MTYPE[r.type] || r.type), h('small', {}, (r.maker || '—') + ' · ' + (r.year || ''))) },
        { key: 'criticality', label: 'الأهمية', sort: true, render: (r) => critCell(r.criticality) }, { key: 'status', label: 'الحالة', sort: true, render: (r) => U.status('machine', r.status) },
        { key: 'hoursRun', label: 'ساعات التشغيل', sort: true, render: (r) => h('span.num', {}, ERP.fmt.num(r.hoursRun)) },
        { key: 'mtbfH', label: 'MTBF / MTTR', sort: true, render: (r) => h('div.care-cell', {}, h('b.num', {}, ERP.fmt.num(r.mtbfH) + ' س'), h('small.num', {}, 'MTTR ' + ERP.fmt.num(r.mttrH, 1) + ' س · إتاحة ' + (avail(r) != null ? Math.round(avail(r) * 1000) / 10 + '%' : '—'))) },
        { key: 'nextPMAt', label: 'الصيانة الوقائية التالية', sort: true, render: pmNext }, { key: 'open', label: 'أوامر مفتوحة', sort: (a, b) => openOf(a.id) - openOf(b.id), render: (r) => { const n = openOf(r.id); return n ? SA.chip(n + ' مفتوح', 'warning') : h('span.care-muted', {}, '—'); } }],
      onRowClick: (r) => SA.nav('care/assets/' + r.id),
      rowActions: (r) => [{ label: 'كارت الماكينة', icon: 'external', onClick: () => SA.nav('care/assets/' + r.id) }, { label: 'أبلغ عن عطل', icon: 'alert', disabled: SA.can('care.maintenance.create') ? false : 'ليست من صلاحياتك', onClick: () => mwoModal({ kind: 'breakdown', machineId: r.id }) }],
      empty: { icon: 'factory', title: 'لا توجد ماكينات' } });
    const drawK = () => { const mcs = get('machines'); SA.clear(kp); kp.append(U.kpis([U.kpi({ label: 'الماكينات', value: mcs.length, icon: 'factory', sub: 'حرجة (A) ' + mcs.filter((m) => m.criticality === 'A').length }), U.kpi({ label: 'تعمل الآن', value: mcs.filter((m) => m.status === 'running').length, icon: 'play', tone: 'success' }),
      U.kpi({ label: 'عطل', value: mcs.filter((m) => m.status === 'down').length, icon: 'alert', tone: mcs.some((m) => m.status === 'down') ? 'danger' : null, sub: mcs.filter((m) => m.status === 'down').map((m) => m.id).join('، ') }), U.kpi({ label: 'في الصيانة', value: mcs.filter((m) => m.status === 'maintenance').length, icon: 'wrench' }),
      U.kpi({ label: 'صيانة وقائية متأخرة', value: mcs.filter((m) => daysTo(m.nextPMAt) < 0).length, icon: 'calendar', tone: mcs.some((m) => daysTo(m.nextPMAt) < 0) ? 'warning' : 'success' }), U.kpi({ label: 'متوسط MTBF', value: ERP.fmt.num(CA.mtbf()) + ' س', icon: 'activity', sub: 'MTTR ' + ERP.fmt.num(CA.mttr(), 1) + ' س' })])); };
    drawK();
    root.append(SA.pageHead({ title: 'سجل الماكينات والأصول', desc: 'كل ماكينة بخطها ودرجة أهميتها وحالتها وساعات تشغيلها ومؤشرات الاعتمادية وموعد الصيانة الوقائية — المتأخرة بالأحمر.', actions: [SA.btn({ label: 'بلاغ عطل', icon: 'alert', perm: 'care.maintenance.create', onClick: () => mwoModal({ kind: 'breakdown' }) })] }), kp, tbl.el);
    const offs = ['machines', 'maintenanceOrders'].map((x) => st.subscribe(x, () => { drawK(); tbl.refresh(); }));
    return () => offs.forEach((f) => f());
  }
  function machineStatusModal(m) {
    return formModal({ title: 'تغيير حالة ' + m.id, subtitle: m.name, icon: 'settings', submitLabel: 'تغيير الحالة', intro: m.status !== 'down' ? SA.alert('info', 'لعطل يوقف الإنتاج استخدم «أبلغ عن عطل» — يسجّل أمر صيانة وتوقف الخط تلقائيًا.') : null,
      fields: [fld({ name: 'status', label: 'الحالة الجديدة', type: 'select', value: m.status, options: Object.keys(C.status.machine).map((k) => [k, C.status.machine[k][0]]) }), fld({ name: 'reason', label: 'السبب', type: 'textarea', rows: 2, required: true, class: 'care-full' })],
      check: (v) => (v.status === m.status ? 'اختر حالة مختلفة' : null), onSubmit: (v) => act(() => CA.setMachineStatus(m.id, v.status, v.reason), 'تم تغيير حالة ' + m.id) });
  }
  function renderMachine(root, ctx, id) {
    ctx.setCrumbs([{ label: 'صيانة المصنع', href: '#/care/assets' }, { label: 'سجل الماكينات', href: '#/care/assets' }, { label: id }]);
    return SA.live(root, () => {
      const m = mach(id); if (!m) return notFound('الماكينة غير موجودة', '#/care/assets', 'سجل الماكينات');
      const mwos = get('maintenanceOrders').filter((x) => x.machineId === id).sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1)); const dts = get('downtime').filter((d) => d.machineId === id).sort((a, b) => (a.start < b.start ? 1 : -1));
      const plan = get('pmPlans').find((x) => x.machineId === id); const openB = mwos.find((x) => x.kind === 'breakdown' && M_OPEN(x));
      const used = {}; mwos.forEach((x) => (x.parts || []).filter((q) => q.issued).forEach((q) => { used[q.itemId] = (used[q.itemId] || 0) + q.qty; }));
      const compat = spares().filter((i) => ((i.attrs && i.attrs.fits) || []).indexOf(m.type) >= 0);
      const d90 = dts.filter((d) => ms(d.start) >= Date.now() - 90 * DAY).reduce((s, d) => s + dtMinutes(d), 0); const cost12 = mwos.filter((x) => x.cost && ms(x.doneAt || x.openedAt) >= Date.now() - 365 * DAY).reduce((s, x) => s + (x.cost || 0), 0);
      const av = avail(m);
      return h('div', {}, SA.pageHead({ title: m.name, back: { href: '#/care/assets', label: 'سجل الماكينات' }, tags: [h('span.num.care-muted', {}, m.id), U.status('machine', m.status), critCell(m.criticality)], desc: (MTYPE[m.type] || m.type) + ' · ' + (m.lineId ? lName(m.lineId) : 'مرافق مشتركة') + ' · ' + (m.maker || '') + ' ' + (m.year || ''),
        actions: [SA.btn({ label: 'تغيير الحالة', icon: 'settings', kind: 'ghost', perm: 'care.assets.edit', onClick: () => machineStatusModal(m) }), plan ? SA.btn({ label: 'أمر صيانة وقائية', icon: 'calendar', kind: 'ghost', perm: 'care.pm.edit', reason: plan.mwoId && M_OPEN(ERP.find('maintenanceOrders', plan.mwoId) || {}) ? 'يوجد أمر وقائي مفتوح ' + plan.mwoId : '', onClick: () => act(() => CA.schedulePM(plan.id), (x) => 'تم إنشاء ' + x.id) }) : null, SA.btn({ label: 'أبلغ عن عطل', icon: 'alert', perm: 'care.maintenance.create', reason: openB ? 'يوجد بلاغ عطل مفتوح ' + openB.id : '', onClick: () => mwoModal({ kind: 'breakdown', machineId: id }) })] }),
        openB ? h('div.care-down', {}, h('span.care-pulse'), h('div', { style: { flex: 1 } }, h('b', {}, 'الماكينة متوقفة — ' + openB.title), h('p', {}, openB.id + ' «' + ((C.status.mwo[openB.status] || [])[0] || '') + '» · منذ ' + dur(minsSince(openB.openedAt)))), SA.btn({ label: 'افتح أمر الصيانة', icon: 'wrench', onClick: () => SA.nav('care/maintenance/' + openB.id) })) : null,
        U.kpis([U.kpi({ label: 'ساعات التشغيل', value: ERP.fmt.num(m.hoursRun), icon: 'clock' }), U.kpi({ label: 'MTBF', value: ERP.fmt.num(m.mtbfH) + ' س', icon: 'activity', sub: 'متوسط الزمن بين الأعطال' }), U.kpi({ label: 'MTTR', value: ERP.fmt.num(m.mttrH, 1) + ' س', icon: 'wrench', sub: 'متوسط زمن الإصلاح' }),
          U.kpi({ label: 'الإتاحة', value: av != null ? Math.round(av * 1000) / 10 + '%' : '—', icon: 'gauge', tone: av >= 0.99 ? 'success' : 'warning' }), U.kpi({ label: 'توقف 90 يومًا', value: dur(d90), icon: 'factory', sub: dts.length + ' حدث' }), U.kpi({ label: 'تكلفة الصيانة 12 شهرًا', value: U.canCost() ? ERP.fmt.short(cost12) : U.cost(cost12), icon: 'coins', sub: mwos.length + ' أمر صيانة' })]),
        U.grid(2, SA.card({ title: 'بيانات الماكينة' }, SA.kv([['الكود', h('span.num', {}, m.code || m.id)], ['الخط', m.lineId ? dl(m.lineId, m.lineId + ' — ' + lName(m.lineId)) : 'مرافق مشتركة'], ['النوع', MTYPE[m.type] || m.type], ['المصنّع / السنة', (m.maker || '—') + ' · ' + (m.year || '—')], ['درجة الأهمية', h('span', {}, critCell(m.criticality), m.criticality === 'A' ? ' حرجة — توقفها يوقف خطًا' : '')], ['آخر عطل', m.lastFailureAt ? SA.fmt.dt(m.lastFailureAt) : (mwos.find((x) => x.kind === 'breakdown') ? SA.fmt.dt(mwos.find((x) => x.kind === 'breakdown').openedAt) : '—')], ['آخر صيانة وقائية', ERP.fmt.date(m.lastPMAt)], ['الصيانة الوقائية التالية', pmNext(m)]])),
          SA.card({ title: 'خطة الصيانة الوقائية', actions: [rlink('care/pm', 'كل الخطط')] }, plan ? h('div', {}, h('div.care-row', { style: { marginBottom: '10px' } }, U.status('care_pm', CA.pmState(plan)), h('span.care-muted', {}, 'كل ' + plan.freqDays + ' يومًا' + (plan.freqHours ? ' أو ' + plan.freqHours + ' ساعة تشغيل' : '') + ' · ' + plan.estH + ' ساعات عمل'), plan.mwoId ? dl(plan.mwoId) : null), h('ul.care-check', {}, (plan.tasks || []).map((t) => h('li', {}, SA.icon('check', 'icon-sm'), h('span', {}, t)))), h('p.care-muted', {}, 'آخر تنفيذ ' + ERP.fmt.date(plan.lastDoneAt) + ' · المستحق ' + ERP.fmt.date(plan.nextDueAt))) : SA.empty({ icon: 'calendar', title: 'لا توجد خطة وقائية' }))),
        U.grid(2, SA.card({ title: 'تاريخ الصيانة', tags: h('span.sap-count', {}, mwos.length) }, miniTable(['الأمر', 'النوع', 'الوصف', 'الحالة', 'التاريخ', 'التوقف', 'التكلفة'], mwos.slice(0, 12).map((x) => [h('a.erp-doc', { href: '#/care/maintenance/' + x.id }, x.id), chip(MKIND, x.kind), x.title, U.status('mwo', x.status), ERP.fmt.date(x.openedAt), x.downtimeMin ? dur(x.downtimeMin) : '—', x.cost != null ? U.cost(x.cost) : '—']), 'لا توجد أوامر صيانة')),
          SA.card({ title: 'أحداث التوقف', tags: h('span.sap-count', {}, dts.length) }, miniTable(['البداية', 'المدة', 'السبب', 'الفئة'], dts.slice(0, 10).map((d) => [SA.fmt.dt(d.start), d.end ? dur(dtMinutes(d)) : h('b', { style: { color: 'var(--color-danger)' } }, 'جارٍ — ' + dur(dtMinutes(d))), d.reason, (DTCAT[d.category] || [d.category])[0]]), 'لا توجد توقفات مسجلة'))),
        SA.card({ title: 'قطع الغيار' }, h('div.sap-sub', {}, 'المستخدمة في أوامر الصيانة'), miniTable(['القطعة', 'إجمالي المصروف'], Object.keys(used).map((k) => [U.itemCell(k), h('b.num', {}, used[k])]), 'لم تُصرف قطع لهذه الماكينة'),
          h('div.sap-sub', {}, 'قطع متوافقة ورصيدها في مخزن قطع الغيار'), miniTable(['القطعة', 'الرصيد W-05', 'الحد الأدنى', 'الحالة'], compat.map((i) => { const q = K.qty(i.id, SPW); return [U.itemCell(i.id), h('b.num' + (q <= 0 ? '.care-qty0' : q <= i.reorderPoint ? '.care-qtylow' : ''), {}, q), i.reorderPoint, q <= 0 ? SA.chip('رصيد صفر', 'danger') : q <= i.reorderPoint ? SA.chip('عند/تحت الحد', 'warning') : SA.chip('متوفر', 'success')]; }), 'لا توجد قطع متوافقة مسجلة')));
    }, ['machines', 'maintenanceOrders', 'downtime', 'pmPlans', 'stock']);
  }

  /* ═════════════════════════ 6. MAINTENANCE ═════════════════════════ */
  const spendAp = (m) => get('approvals').filter((a) => a.ref && a.ref.type === 'maintenance_spend' && a.ref.id === m.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] || null;
  function renderMaintenance(root, ctx) {
    if (ctx.path[0]) return renderMWO(root, ctx, ctx.path[0]);
    ctx.setCrumbs([{ label: 'صيانة المصنع' }, { label: 'أوامر الصيانة والأعطال' }]); const p = ctx.params || {}; const stat = h('div.sap-statrow', { style: { margin: '0 0 12px' } });
    const ageCell = (r) => (M_OPEN(r) ? h('div.care-sla' + (r.kind === 'breakdown' && minsSince(r.openedAt) > 120 ? '.is-bad' : '.is-warn'), {}, h('b', {}, dur(minsSince(r.openedAt))), h('small', {}, 'مفتوح')) : h('div.care-sla.is-ok', {}, h('b', {}, ERP.fmt.date(r.doneAt)), h('small', {}, r.status === 'done' ? 'خلال ' + dur((ms(r.doneAt) - ms(r.openedAt)) / 60000) : 'ملغى')));
    const tbl = SA.table({ caption: 'أوامر الصيانة', rows: () => get('maintenanceOrders'), pageSize: 10,
      search: { placeholder: 'ابحث برقم الأمر أو الماكينة أو الوصف…', keys: (r, q) => [r.id, r.title, r.machineId, (mach(r.machineId) || {}).name, r.rootCause].some((x) => String(x || '').toLowerCase().indexOf(q) >= 0) },
      filters: [{ key: 'status', label: 'الحالة', options: [['open', 'كل المفتوحة']].concat(Object.keys(C.status.mwo).map((k) => [k, C.status.mwo[k][0]])), test: (r, v) => (v === 'open' ? M_OPEN(r) : r.status === v) },
        { key: 'kind', label: 'النوع', options: Object.keys(MKIND).map((k) => [k, MKIND[k][0]]) }, { key: 'priority', label: 'الأولوية', options: Object.keys(PRIO).map((k) => [k, PRIO[k][0]]) },
        { key: 'lineId', label: 'الخط', options: get('lines').map((l) => [l.id, l.name]).concat([['none', 'مرافق مشتركة']]), test: (r, v) => (v === 'none' ? !r.lineId : r.lineId === v) }, { key: 'machineId', label: 'الماكينة', options: get('machines').map((m) => [m.id, m.id + ' — ' + m.name]) }],
      initial: { q: p.q || '', filters: { status: p.status || (p.q ? '' : 'open'), kind: p.kind || '', machineId: p.machine || '' }, sort: { key: 'openedAt', dir: 'desc' } },
      columns: [{ key: 'id', label: 'الأمر', sort: true, render: (r) => h('div.care-cell', {}, h('a.erp-doc', { href: '#/care/maintenance/' + r.id }, r.id), h('small', {}, SA.fmt.rel(r.openedAt))) },
        { key: 'title', label: 'الوصف والماكينة', render: (r) => h('div.care-cell', {}, h('b', {}, r.title), h('small', {}, mName(r.machineId))) }, { key: 'lineId', label: 'الخط', render: (r) => (r.lineId ? h('span', {}, LSHORT[r.lineId] || r.lineId) : h('span.care-muted', {}, 'مرافق')) },
        { key: 'kind', label: 'النوع', sort: true, render: (r) => chip(MKIND, r.kind) }, { key: 'priority', label: 'الأولوية', sort: (a, b) => Object.keys(PRIO).indexOf(a.priority) - Object.keys(PRIO).indexOf(b.priority), render: (r) => chip(PRIO, r.priority) },
        { key: 'status', label: 'الحالة', sort: true, render: (r) => U.status('mwo', r.status) }, { key: 'openedAt', label: 'العمر', sort: true, render: ageCell },
        { key: 'downtimeMin', label: 'التوقف', sort: true, render: (r) => { const o = get('downtime').find((d) => d.mwoId === r.id && !d.end); return o ? h('b', { style: { color: 'var(--color-danger)' } }, 'جارٍ ' + dur(dtMinutes(o))) : r.downtimeMin ? dur(r.downtimeMin) : '—'; } }, { key: 'assigneeId', label: 'المسؤول', render: (r) => uname(r.assigneeId) }],
      rowActions: (r) => [{ label: 'فتح الأمر', icon: 'external', onClick: () => SA.nav('care/maintenance/' + r.id) }, { label: 'بدء التنفيذ', icon: 'play', hidden: ['requested', 'scheduled'].indexOf(r.status) < 0, disabled: SA.can('care.maintenance.edit') ? false : 'ليست من صلاحياتك', onClick: () => act(() => CA.setStatus(r.id, 'in_progress'), 'بدأ تنفيذ ' + r.id) }],
      onRowClick: (r) => SA.nav('care/maintenance/' + r.id), empty: { icon: 'wrench', title: 'لا توجد أوامر صيانة', action: SA.can('care.maintenance.create') ? { label: 'بلاغ عطل', onClick: () => mwoModal({ kind: 'breakdown' }) } : null } });
    const drawS = () => { const all = get('maintenanceOrders'); const open = all.filter(M_OPEN); SA.clear(stat); const pill = (n, l, k, v) => h('span', { role: 'button', tabindex: '0', style: { cursor: 'pointer' }, onclick: () => tbl.setFilter(k, v) }, h('b.num', {}, n), l);
      stat.append(pill(open.length, 'مفتوحة', 'status', 'open'), pill(open.filter((m) => m.kind === 'breakdown').length, 'أعطال مفتوحة', 'kind', 'breakdown'), pill(open.filter((m) => m.status === 'waiting_parts').length, 'بانتظار قطع غيار', 'status', 'waiting_parts'), pill(open.filter((m) => m.status === 'scheduled').length, 'مجدولة', 'status', 'scheduled'), pill(all.filter((m) => m.status === 'done' && ms(m.doneAt) >= Date.now() - 30 * DAY).length, 'تمت خلال 30 يومًا', 'status', 'done')); };
    drawS();
    root.append(SA.pageHead({ title: 'أوامر الصيانة والأعطال', desc: 'بلاغات الأعطال والصيانة الوقائية والتصحيحية — من البلاغ حتى عودة الماكينة والخط، مع صرف قطع الغيار والتكلفة.', actions: [SA.btn({ label: 'أمر وقائي', icon: 'calendar', kind: 'ghost', perm: 'care.maintenance.create', onClick: () => mwoModal({ kind: 'preventive' }) }), SA.btn({ label: 'بلاغ عطل', icon: 'alert', perm: 'care.maintenance.create', onClick: () => mwoModal({ kind: 'breakdown' }) })] }), stat, tbl.el);
    const offs = ['maintenanceOrders', 'downtime'].map((x) => st.subscribe(x, () => { drawS(); tbl.refresh(); }));
    const tick = setInterval(() => tbl.refresh(), 60000);
    return () => { offs.forEach((f) => f()); clearInterval(tick); };
  }
  function receiveModal(m, po) {
    const lines = po.lines.map((l) => ERP.itemName(l.itemId) + ' × ' + (l.qty - (l.receivedQty || 0))).join('، ');
    const run = (mode) => { md.close(true); act(() => CA.receiveParts(m.id, mode), (g) => (mode === 'emergency' ? 'استُلم ' + g.id + ' وأُفرج عنه فورًا — القطعة في مخزن قطع الغيار W-05' : 'استُلم ' + g.id + ' — بانتظار فحص الاستلام من الجودة')); };
    const md = SA.modal({ title: 'استلام قطع الغيار — ' + po.id, subtitle: ERP.supplierName(po.supplierId) + ' · ' + lines, icon: 'download', size: 'md', body: h('div.care-opts', {},
      h('button.care-opt', { type: 'button', onclick: () => run('normal') }, h('span.care-ico', {}, SA.icon('checkcircle', 'icon-sm')), h('span', {}, h('b', {}, 'استلام عادي — فحص جودة الاستلام'), h('small', {}, 'يُنشأ إذن استلام (GRN) وفحص وارد. تدخل القطعة مخزن قطع الغيار W-05 بعد اعتماد الجودة من شاشة الفحوصات.'))),
      h('button.care-opt.is-warn', { type: 'button', onclick: () => run('emergency') }, h('span.care-ico.is-warning', {}, SA.icon('bolt', 'icon-sm')), h('span', {}, h('b', {}, 'استلام طارئ — إفراج فوري بدون انتظار الفحص'), h('small', {}, 'للأعطال التي توقف الإنتاج فقط. يُسجَّل الفحص «مقبول بشرط»، تدخل القطعة W-05 فورًا (حركة مخزون + فاتورة مورد)، ويُطلب من الجودة تحقق لاحق. يُسجَّل في التدقيق.'))),
      h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), 'هيتسجّل في سجل التدقيق باسمك مع الوقت.')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => md.close(null) }, 'إلغاء')] });
  }
  function completeModal(m) {
    const ln = m.lineId ? ERP.line(m.lineId) : null; const lineDown = ln && ln.status === 'down'; const odt = get('downtime').find((d) => !d.end && (d.mwoId === m.id || (!d.mwoId && d.machineId === m.machineId)));
    const held = ln ? get('workOrders').filter((w) => w.status === 'on_hold' && w.lineId === ln.id && w.holdReason && !w.ncrId) : [];
    const partsCost = (m.parts || []).filter((p) => p.issued).reduce((s, p) => s + (p.value != null ? p.value : p.qty * ((ERP.item(p.itemId) || {}).stdCost || 0)), 0);
    const RC = m.kind === 'preventive' ? ['صيانة وقائية مجدولة — لا توجد ملاحظات', 'صيانة وقائية — تم تغيير قطع متآكلة', 'صيانة وقائية — مطلوب متابعة'] : ['احتراق حزام تسخين', 'ثرموكبل/حساس تالف', 'تآكل أو كسر قطعة ميكانيكية', 'عطل كهربائي/لوحة تحكم', 'انسداد/رطوبة في الخامات', 'خطأ تشغيل', 'أخرى'];
    const impact = ['الماكينة ' + m.machineId + ' → «يعمل».', odt ? 'إغلاق التوقف ' + odt.id + ' (المدة حتى الآن ' + dur(dtMinutes(odt)) + ').' : null, lineDown ? 'تشغيل ' + ln.name + ' (عطل — متوقف ← يعمل).' : null, held.length ? 'استئناف أوامر التشغيل: ' + held.map((w) => w.id + ' — ' + ERP.itemName(w.itemId) + (w.soId ? ' (' + w.soId + ')' : '')).join('، ') + '.' : null, lineDown || held.length ? 'إشعار الإنتاج (R-05) والمبيعات (R-03) بعودة الخط.' : 'إشعار مدير الإنتاج بإتمام الأمر.', m.kind === 'preventive' ? 'تحديث خطة الصيانة الوقائية وموعدها التالي.' : null].filter(Boolean);
    return formModal({ title: 'إتمام أمر الصيانة ' + m.id, subtitle: mName(m.machineId), icon: 'checkcircle', size: 'lg', submitLabel: lineDown ? 'إتمام وتشغيل الخط' : 'إتمام الصيانة', submitIcon: lineDown ? 'play' : 'check',
      intro: h('div.sap-impact', { style: { marginBottom: '12px' } }, h('b', {}, 'ما سيحدث عند الإتمام'), h('ul', {}, impact.map((x) => h('li', {}, x)))),
      fields: [fld({ name: 'rc', label: 'السبب الجذري', type: 'select', value: RC[0], options: RC.map((x) => [x, x]) }), fld({ name: 'rcDetail', label: 'تفاصيل السبب (اختياري)', placeholder: m.id === 'MWO-2026-0087' ? 'مثال: انتهاء عمر الحزام بعد 21,000 ساعة' : '' }),
        fld({ name: 'action', label: 'ما الذي تم؟', type: 'textarea', required: true, rows: 2, class: 'care-full', value: m.kind === 'breakdown' && (m.parts || []).length ? 'تغيير ' + m.parts.map((p) => ERP.itemName(p.itemId) + ' × ' + p.qty).join('، ') + ' واختبار التسخين وتشغيل تجريبي' : '' }),
        fld({ name: 'labourH', label: 'ساعات العمل', type: 'number', value: Math.max(1, Math.round(minsSince(m.startedAt || m.openedAt) / 60)), min: 0 }), U.canCost() ? fld({ name: 'labourCost', label: 'تكلفة العمالة/الخدمة الخارجية (ج.م)', type: 'number', value: 600, min: 0 }) : null,
        m.checklist ? fld({ name: 'allChecks', label: 'تم تنفيذ كل بنود قائمة المهام', type: 'checkbox', value: true, class: 'care-full' }) : null],
      extra: h('p.care-muted', {}, 'تكلفة القطع المصروفة: ', U.cost(partsCost)),
      onSubmit: (v) => act(() => CA.completeMWO(m.id, { rootCause: v.rc + (v.rcDetail ? ' — ' + v.rcDetail : ''), action: v.action, labourH: v.labourH, labourCost: v.labourCost || 0, checklist: m.checklist && v.allChecks ? m.checklist.map((c) => Object.assign({}, c, { done: true })) : null }),
        (r) => (r && r.lineRestarted ? 'عاد ' + ln.name + ' للعمل بعد توقف ' + dur(r.downtimeMin) + (r.resumed.length ? ' — استُؤنف ' + r.resumed.join('، ') : '') : 'تم إتمام أمر الصيانة')) });
  }
  function recoveryChain(m) {
    const ap = spendAp(m); const po = m.poId ? ERP.find('purchaseOrders', m.poId) : null; const grn = m.grnId ? ERP.find('grns', m.grnId) : null;
    const prqs = (m.prqIds || []).map((x) => ERP.find('purchaseRequisitions', x)).filter(Boolean); const parts = m.parts || []; const allIss = parts.length && parts.every((p) => p.issued);
    const ln = m.lineId ? ERP.line(m.lineId) : null; const mine = get('downtime').some((d) => d.mwoId === m.id); const steps = [];
    if (parts.length && (prqs.length || ap || po || CA.shortParts(m).length)) {
      steps.push({ label: 'طلب شراء عاجل', id: prqs[0] && prqs[0].id, tone: prqs.length ? (prqs.every((r) => r.status === 'ordered') ? 'success' : 'warning') : 'neutral', text: prqs.length ? (C.status.prq[prqs[0].status] || [])[0] : 'لم يُطلب', at: prqs[0] && prqs[0].createdAt });
      steps.push({ label: 'اعتماد الصرف', id: ap && ap.id, route: ap ? 'approvals/' + ap.id : null, tone: !ap ? 'neutral' : ap.status === 'approved' ? 'success' : ap.status === 'rejected' ? 'danger' : 'warning', text: ap ? (C.status.approval[ap.status] || [])[0] : 'لا يوجد', at: ap && ap.updatedAt });
      steps.push({ label: 'أمر الشراء', id: po && po.id, tone: !po ? 'neutral' : po.status === 'received' ? 'success' : 'info', text: po ? (C.status.po[po.status] || [])[0] : '—', at: po && (po.sentAt || po.createdAt) });
      steps.push({ label: 'الاستلام والفحص', id: grn && grn.id, tone: !grn ? 'neutral' : grn.status === 'pending_qc' ? 'warning' : grn.status === 'rejected' ? 'danger' : 'success', text: grn ? ((C.status.grn[grn.status] || [])[0] || grn.status) + (m.emergencyRelease ? ' — إفراج طارئ' : '') : '—', at: grn && grn.at });
    }
    if (parts.length) steps.push({ label: 'صرف القطعة', tone: allIss ? 'success' : parts.some((p) => p.issued) ? 'info' : 'neutral', text: allIss ? 'تم الصرف' : 'لم تُصرف', at: (parts.find((p) => p.issuedAt) || {}).issuedAt });
    steps.push({ label: 'الإصلاح', tone: m.status === 'done' ? 'success' : m.status === 'in_progress' ? 'info' : m.status === 'cancelled' ? 'neutral' : 'warning', text: (C.status.mwo[m.status] || [])[0], at: m.doneAt || m.startedAt });
    if (ln && (mine || m.kind === 'breakdown')) steps.push({ label: 'عودة الخط', id: ln.id, tone: ln.status === 'down' ? 'danger' : 'success', text: ln.status === 'down' ? 'متوقف' : 'يعمل', at: ln.status === 'down' ? ln.downSince : ln.upSince });
    return h('ol.erp-chain', { 'aria-label': 'سلسلة الاسترداد' }, steps.map((s) => h('li.erp-chain-step.is-' + s.tone, {}, h('span.erp-chain-dot'), h('div', {}, h('small', {}, s.label), s.id ? (s.route ? rlink(s.route, s.id) : dl(s.id)) : null, h('em', {}, s.text || '—'), h('time', {}, s.at ? SA.fmt.rel(s.at) : '')))));
  }
  function chainActions(m) {
    if (!M_OPEN(m)) return null; const P = 'care.maintenance.edit'; const acts = [];
    const short = CA.shortParts(m); const ap = spendAp(m); const po = m.poId ? ERP.find('purchaseOrders', m.poId) : null; const grn = m.grnId ? ERP.find('grns', m.grnId) : null;
    const openPrq = (m.prqIds || []).some((x) => { const r = ERP.find('purchaseRequisitions', x); return r && r.status !== 'rejected'; }) || get('purchaseRequisitions').some((r) => r.status === 'open' && r.source === 'maintenance' && short.some((s) => s.itemId === r.itemId));
    if (short.length && !po) {
      if (!openPrq) acts.push(SA.btn({ label: 'اطلب شراء عاجل', icon: 'cart', kind: 'ghost', perm: P, onClick: () => partsQtyModal(m, 'prq') }));
      if (!ap || ap.status === 'rejected' || ap.status === 'changes_requested') acts.push(SA.btn({ label: 'طلب اعتماد صرف عاجل', icon: 'inbox', perm: P, onClick: () => partsQtyModal(m, 'spend') }));
    }
    if (ap && (ap.status === 'pending' || ap.status === 'delegated') && !po) {
      const why = SA.approvals ? SA.approvals.why(ap) : 'شاشة الاعتمادات غير متاحة'; const stp = (ap.chain || []).find((c) => c.status === 'pending') || {};
      if (!why) acts.push(SA.btn({ label: 'اعتماد الصرف الآن', icon: 'checkcircle', onClick: () => SA.approvals.decide(ap.id, 'approve') }));
      acts.push(h('span.care-muted', {}, SA.icon('clock', 'icon-sm'), ' ' + ap.id + ' بانتظار ' + (stp.label || 'القرار') + ' — ', U.cost(ap.amount)));
    }
    if (po && ['approved', 'sent', 'partially_received'].indexOf(po.status) >= 0) acts.push(SA.btn({ label: 'استلام القطعة', icon: 'download', perm: P, onClick: () => receiveModal(m, po) }), h('span.care-muted', {}, 'أمر الشراء ', dl(po.id), ' — المتوقع ' + ERP.fmt.date(po.expectedDate)));
    if (grn && grn.status === 'pending_qc') { const q = (grn.qcIds || [])[0]; acts.push(h('span.care-muted', {}, 'بانتظار فحص الاستلام ', q ? dl(q) : ''), SA.btn({ label: 'إفراج طارئ', icon: 'bolt', kind: 'ghost', perm: P, onClick: async () => { const r = await SA.confirm({ title: 'إفراج طارئ قبل فحص الجودة', text: 'الخط متوقف — القطعة تدخل مخزن قطع الغيار فورًا ويُسجَّل الفحص «مقبول بشرط» مع طلب تحقق لاحق من الجودة.', confirmLabel: 'إفراج طارئ', warnings: ['استثناء موثّق — يظهر في تقرير الجودة وسجل التدقيق.'] }); if (r.ok) act(() => CA.releaseQC(m.id), 'أُفرج عن القطعة — متاحة الآن للصرف'); } })); }
    return acts.length ? h('div.care-chain-acts', {}, acts) : null;
  }
  function mwoFlowBtns(m) {
    const P = 'care.maintenance.edit'; const b = []; if (!M_OPEN(m)) return b;
    if (m.status === 'requested') b.push(SA.btn({ label: 'جدولة', icon: 'calendar', kind: 'ghost', perm: P, onClick: () => formModal({ title: 'جدولة ' + m.id, icon: 'calendar', submitLabel: 'جدولة', fields: [fld({ name: 'date', label: 'تاريخ التنفيذ', type: 'date', required: true, value: today() })], onSubmit: (v) => act(() => CA.setStatus(m.id, 'scheduled', { date: v.date }), 'تمت الجدولة') }) }));
    if (m.status === 'requested' || m.status === 'scheduled') b.push(SA.btn({ label: 'بدء التنفيذ', icon: 'play', perm: P, onClick: () => act(() => CA.setStatus(m.id, 'in_progress'), 'بدأ التنفيذ') }));
    if (m.status === 'in_progress') b.push(SA.btn({ label: 'بانتظار قطع غيار', icon: 'box', kind: 'ghost', perm: P, onClick: () => act(() => CA.setStatus(m.id, 'waiting_parts'), 'الأمر بانتظار قطع غيار') }));
    if (m.status === 'waiting_parts') b.push(SA.btn({ label: 'استئناف التنفيذ', icon: 'play', kind: 'ghost', perm: P, onClick: () => act(() => CA.setStatus(m.id, 'in_progress'), 'استُؤنف التنفيذ') }));
    if ((m.status === 'requested' || m.status === 'scheduled') && !get('downtime').some((d) => d.mwoId === m.id && !d.end)) b.push(SA.btn({ label: 'إلغاء', icon: 'x', kind: 'ghost', perm: P, onClick: async () => { const r = await SA.confirm({ title: 'إلغاء ' + m.id, reasonRequired: true, reasonLabel: 'سبب الإلغاء', confirmLabel: 'إلغاء الأمر' }); if (r.ok) act(() => CA.setStatus(m.id, 'cancelled', { reason: r.reason }), 'أُلغي الأمر'); } }));
    const pend = (m.parts || []).some((p) => !p.issued);
    b.push(SA.btn({ label: 'إتمام الصيانة', icon: 'checkcircle', kind: 'accent', perm: 'care.maintenance.close', reason: pend ? 'اصرف قطع الغيار المطلوبة أولًا (أو احذفها من الأمر)' : '', onClick: () => completeModal(m) }));
    return b;
  }
  function partsCard(m) {
    const P = 'care.maintenance.edit'; const open = M_OPEN(m);
    const issue = async (i) => { const r = await act(() => CA.issuePart(m.id, i)); if (r && r.ok) SA.toast('تم صرف القطعة من مخزن قطع الغيار وتحميلها على أمر الصيانة', 'success'); else if (r && r.reason) SA.toast(r.reason, 'warn'); };
    const rows = (m.parts || []).map((p, i) => { const it = ERP.item(p.itemId) || {}; const av = spareAvail(p.itemId);
      return [U.itemCell(p.itemId), h('b.num', {}, p.qty), p.issued ? '—' : h('b.num' + (av <= 0 ? '.care-qty0' : av < p.qty ? '.care-qtylow' : ''), {}, ERP.fmt.num(av)), U.cost(p.value != null ? p.value : p.qty * (it.stdCost || 0)),
        p.issued ? SA.chip('صُرفت ' + SA.fmt.rel(p.issuedAt), 'success') : !open ? '—' : av >= p.qty ? SA.btn({ label: 'صرف من W-05', icon: 'box', size: 'sm', perm: P, onClick: () => issue(i) }) : SA.chip('الرصيد غير كافٍ', 'danger'),
        !p.issued && open ? SA.btn({ iconOnly: true, label: 'حذف القطعة', icon: 'trash', kind: 'ghost', size: 'sm', perm: P, onClick: () => act(() => CA.removePart(m.id, i), 'حُذفت القطعة') }) : null]; });
    let addRow = null;
    if (open && SA.can(P)) { const sp = spares(); const sel = h('select.select', { 'aria-label': 'قطعة غيار' }, sp.map((i) => h('option', { value: i.id }, i.name + ' — رصيد ' + K.qty(i.id, SPW)))); const q = h('input.input.num', { type: 'number', min: 1, value: 1, style: { width: '90px' }, 'aria-label': 'الكمية' });
      addRow = h('div.care-row', { style: { marginTop: '12px' } }, h('div', { style: { flex: 1, minWidth: '200px' } }, sel), q, SA.btn({ label: 'إضافة قطعة', icon: 'plus', kind: 'ghost', size: 'sm', onClick: () => { const n = Number(q.value); if (!(n > 0)) { SA.toast('اكتب الكمية', 'warn'); return; } act(() => CA.addPart(m.id, sel.value, n), 'أُضيفت القطعة للأمر'); } })); }
    return SA.card({ title: 'قطع الغيار المطلوبة', tags: h('span.sap-count', {}, (m.parts || []).length) }, miniTable(['القطعة', 'الكمية', 'متاح W-05', 'التكلفة', 'الصرف', ''], rows, 'لا توجد قطع غيار على هذا الأمر'), addRow);
  }
  function mwoTimeline(m) {
    let l = (m.log || []).slice();
    if (!l.length) { l.push({ at: m.openedAt, by: m.reportedBy, text: m.kind === 'breakdown' ? 'بلاغ عطل: ' + m.title : 'أمر صيانة ' + MKIND[m.kind][0], icon: m.kind === 'breakdown' ? 'alert' : 'calendar', tone: m.kind === 'breakdown' ? 'danger' : 'info' }); if (m.startedAt) l.push({ at: m.startedAt, by: m.assigneeId, text: 'بدء التنفيذ', icon: 'wrench', tone: 'info' }); (m.parts || []).filter((p) => p.issued).forEach((p) => l.push({ at: p.issuedAt || m.startedAt, by: m.assigneeId, text: 'صرف ' + ERP.itemName(p.itemId) + ' × ' + p.qty, icon: 'box', tone: 'success' })); if (m.doneAt) l.push({ at: m.doneAt, by: m.assigneeId, text: 'تم الإتمام' + (m.rootCause ? ' — السبب: ' + m.rootCause : ''), icon: 'checkcircle', tone: 'success' }); }
    return timeline(l.filter((e) => e.at).sort((a, b) => (a.at < b.at ? -1 : 1)));
  }
  function renderMWO(root, ctx, id) {
    ctx.setCrumbs([{ label: 'صيانة المصنع', href: '#/care/maintenance' }, { label: 'أوامر الصيانة', href: '#/care/maintenance' }, { label: id }]);
    const FLOW = ['requested', 'scheduled', 'in_progress', 'waiting_parts', 'done'];
    const off = SA.live(root, () => {
      const m = ERP.find('maintenanceOrders', id); if (!m) return notFound('أمر الصيانة غير موجود', '#/care/maintenance', 'أوامر الصيانة');
      const mc = mach(m.machineId) || {}; const ln = m.lineId ? ERP.line(m.lineId) : null; const odt = get('downtime').find((d) => d.mwoId === id && !d.end); const dts = get('downtime').filter((d) => d.mwoId === id);
      const held = ln ? get('workOrders').filter((w) => w.lineId === ln.id && w.status === 'on_hold' && w.holdReason) : []; const sos = Array.from(new Set(held.map((w) => w.soId).filter(Boolean))); const rec = m.recovery;
      const banner = odt && ln && ln.status === 'down' ? h('div.care-down', { role: 'status' }, h('span.care-pulse'), h('div', { style: { flex: 1, minWidth: '240px' } }, h('b', {}, ln.name + ' متوقف بسبب هذا العطل'), h('p', {}, [held.length ? 'أوامر تشغيل على الانتظار: ' + held.map((w) => w.id + ' (' + ERP.itemName(w.itemId) + ')').join('، ') : '', sos.length ? 'طلبات عملاء متأثرة: ' + sos.map((s) => s + ' — ' + ERP.customerName((ERP.find('salesOrders', s) || {}).customerId)).join('، ') : ''].filter(Boolean).join(' · ') || 'لا توجد أوامر تشغيل متأثرة')),
          h('div', { style: { textAlign: 'center' } }, h('span.care-timer', { 'data-care-since': odt.start }, dur(dtMinutes(odt))), h('small.care-muted', { style: { display: 'block' } }, 'مدة التوقف')))
        : rec && (rec.lineRestarted || (rec.resumed || []).length) ? h('div.care-recover', { role: 'status' }, h('span.care-ico.is-success', {}, SA.icon('checkcircle')), h('div', { style: { flex: 1, minWidth: '240px' } }, h('h3', {}, rec.lineRestarted && ln ? 'عاد ' + ln.name + ' للعمل' : 'تم الإصلاح واستئناف الإنتاج'),
          h('p', {}, 'إجمالي التوقف ' + dur(rec.downtimeMin) + ' · أُغلق ' + SA.fmt.dt(rec.at) + '.', (rec.resumed || []).length ? [' استُؤنفت أوامر التشغيل: ', (rec.resumed || []).map((w, i) => [i ? '، ' : '', dl(w)])] : null, ' · تم إبلاغ الإنتاج والمبيعات.')), ln ? h('div.care-row', {}, U.status('line', ln.status), (rec.resumed || [])[0] ? U.status('wo', (ERP.find('workOrders', rec.resumed[0]) || {}).status) : null) : null) : null;
      const idx = m.status === 'cancelled' ? 0 : FLOW.indexOf(m.status);
      const showChain = (m.parts || []).length || m.kind === 'breakdown';
      const info = SA.kv([['الماكينة', h('span', {}, h('a.erp-doc', { href: '#/care/assets/' + m.machineId }, m.machineId), ' — ' + (mc.name || ''), ' ', critCell(mc.criticality))], ['الخط', ln ? h('span', {}, dl(ln.id), ' — ' + ln.name + ' ', U.status('line', ln.status)) : 'مرافق مشتركة'], ['النوع / الأولوية', h('span.care-row', {}, chip(MKIND, m.kind), chip(PRIO, m.priority))],
        ['بلّغ عنه', uname(m.reportedBy) + ' · ' + SA.fmt.dt(m.openedAt)], ['المسؤول', uname(m.assigneeId)], m.plannedAt ? ['موعد التنفيذ', ERP.fmt.date(m.plannedAt)] : null, m.startedAt ? ['بدأ', SA.fmt.dt(m.startedAt)] : null, m.doneAt ? ['انتهى', SA.fmt.dt(m.doneAt) + ' (خلال ' + dur((ms(m.doneAt) - ms(m.openedAt)) / 60000) + ')'] : null,
        ['التوقف', odt ? h('b', { style: { color: 'var(--color-danger)' } }, 'جارٍ — ', h('span', { 'data-care-since': odt.start }, dur(dtMinutes(odt)))) : m.downtimeMin ? dur(m.downtimeMin) : '—'], m.rootCause ? ['السبب الجذري', m.rootCause] : null, m.action ? ['ما تم', m.action] : null, ['التكلفة', m.cost != null ? U.cost(m.cost) : '—'], m.planId ? ['خطة وقائية', rlink('care/pm', m.planId)] : null]);
      const checklist = m.checklist && m.checklist.length ? SA.card({ title: 'قائمة مهام الصيانة الوقائية', tags: h('span.sap-count', {}, m.checklist.filter((c) => c.done).length + '/' + m.checklist.length) }, h('ul.care-check', {}, m.checklist.map((c, i) => h('li' + (c.done ? '.is-done' : ''), {}, h('input', { type: 'checkbox', checked: !!c.done, disabled: !M_OPEN(m) || !SA.can('care.maintenance.edit'), 'aria-label': c.text, onchange: (e) => { const v = e.target.checked; act(() => { st.patch('maintenanceOrders', id, (x) => { x.checklist[i].done = v; }); return true; }); } }), h('span', {}, c.text))))) : null;
      return h('div', {}, SA.pageHead({ title: m.title, back: { href: '#/care/maintenance', label: 'أوامر الصيانة' }, tags: [h('span.num.care-muted', {}, m.id), U.status('mwo', m.status), chip(MKIND, m.kind), chip(PRIO, m.priority)], desc: mName(m.machineId) + (ln ? ' · ' + ln.name : ''), actions: mwoFlowBtns(m) }),
        banner, h('div.card', { style: { padding: '14px 16px', marginBottom: '14px' } }, m.status === 'cancelled' ? SA.alert('info', 'أُلغي الأمر' + (m.cancelReason ? ': ' + m.cancelReason : '')) : SA.stepper(['بلاغ', 'مجدول', 'قيد التنفيذ', 'بانتظار قطع غيار', 'تم'], idx < 0 ? 0 : m.status === 'done' ? 5 : idx)),
        showChain ? SA.card({ title: 'سلسلة الاسترداد — من البلاغ حتى عودة الخط' }, recoveryChain(m), chainActions(m)) : null,
        U.grid(2, SA.card({ title: 'تفاصيل الأمر' }, m.desc ? h('p', { style: { marginTop: 0, lineHeight: 1.8 } }, m.desc) : null, info), h('div', { style: { display: 'grid', gap: '16px', alignContent: 'start', minWidth: 0 } }, partsCard(m), checklist)),
        U.grid(2, SA.card({ title: 'السجل الزمني' }, mwoTimeline(m)), h('div', { style: { display: 'grid', gap: '16px', alignContent: 'start', minWidth: 0 } },
          SA.card({ title: 'التوقفات المرتبطة' }, miniTable(['التوقف', 'البداية', 'المدة', 'السبب'], dts.map((d) => [h('span.num', {}, d.id), SA.fmt.dt(d.start), d.end ? dur(dtMinutes(d)) : h('b', { style: { color: 'var(--color-danger)' } }, 'جارٍ'), d.reason]), 'لا يوجد توقف مسجل لهذا الأمر')),
          ln ? SA.card({ title: 'أوامر التشغيل على ' + ln.name }, miniTable(['أمر التشغيل', 'الصنف', 'أمر البيع', 'الحالة'], get('workOrders').filter((w) => w.lineId === ln.id && (w.status === 'on_hold' || w.status === 'in_progress' || (w.resumedAt && ms(w.resumedAt) >= ms(m.openedAt)))).map((w) => [dl(w.id), ERP.itemName(w.itemId), w.soId ? h('span', {}, dl(w.soId), ' ', h('small.care-muted', {}, ERP.customerName((ERP.find('salesOrders', w.soId) || {}).customerId))) : '—', U.status('wo', w.status)]), 'لا توجد أوامر تشغيل نشطة على الخط')) : null)));
    }, ['maintenanceOrders', 'approvals', 'purchaseOrders', 'purchaseRequisitions', 'grns', 'qcInspections', 'stock', 'lines', 'machines', 'workOrders', 'downtime']);
    const tick = setInterval(() => tickTimers(root), 15000);
    return () => { off(); clearInterval(tick); };
  }

  /* ═════════════════════════ 7. PREVENTIVE MAINTENANCE ═════════════════════════ */
  function pmEditModal(p) {
    const tasks = (p.tasks || []).slice(); const list = h('div.care-tasks');
    const draw = () => { SA.clear(list); tasks.forEach((t, i) => list.append(h('div.care-task', {}, h('span.care-task-n.num', {}, String(i + 1)), h('input.input', { value: t, 'aria-label': 'المهمة ' + (i + 1), placeholder: 'وصف المهمة', oninput: (e) => { tasks[i] = e.target.value; } }),
      h('button.btn.btn-ghost.btn-sm.btn-icon', { type: 'button', 'aria-label': 'تحريك لأعلى', disabled: i === 0, onclick: () => { tasks.splice(i - 1, 0, tasks.splice(i, 1)[0]); draw(); } }, SA.icon('chevup', 'icon-sm')),
      h('button.btn.btn-ghost.btn-sm.btn-icon', { type: 'button', 'aria-label': 'حذف المهمة', onclick: () => { tasks.splice(i, 1); draw(); } }, SA.icon('trash', 'icon-sm')))));
      list.append(h('div', {}, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { tasks.push(''); draw(); const ins = list.querySelectorAll('input'); if (ins.length) ins[ins.length - 1].focus(); } }, SA.icon('plus', 'icon-sm'), 'إضافة مهمة'))); };
    draw();
    const o = p.mwoId ? ERP.find('maintenanceOrders', p.mwoId) : null; const openO = o && M_OPEN(o) ? o : null;
    return formModal({ title: 'تعديل خطة الصيانة الوقائية', subtitle: p.id + ' · ' + mName(p.machineId), icon: 'edit', size: 'lg', submitLabel: 'حفظ الخطة',
      fields: [fld({ name: 'freqDays', label: 'التكرار (كل كم يوم)', type: 'number', required: true, value: p.freqDays, min: 1 }), fld({ name: 'freqHours', label: 'أو كل (ساعة تشغيل) — اختياري', type: 'number', value: p.freqHours || '', min: 0 }),
        fld({ name: 'nextDueAt', label: 'الموعد المستحق التالي', type: 'date', required: true, value: p.nextDueAt }), fld({ name: 'estH', label: 'المدة التقديرية (ساعة)', type: 'number', value: p.estH || '', min: 0 }),
        fld({ name: 'active', label: 'الخطة نشطة', type: 'switch', value: p.active !== false }), fld({ name: 'reason', label: 'سبب التعديل (اختياري)', placeholder: 'مثال: توصية المورد بعد فحص البرميل' })],
      extra: h('div', { style: { marginTop: '6px' } }, h('div.sap-sub', {}, 'قائمة المهام (Checklist)'), list,
        openO ? h('p.care-muted', { style: { marginTop: '10px', display: 'flex', gap: '6px', alignItems: 'flex-start' } }, SA.icon('info', 'icon-sm'), h('span', {}, 'يوجد أمر صيانة مفتوح ' + openO.id + (openO.status === 'scheduled' ? ' — سيُحدَّث بقائمة المهام والموعد الجديد.' : ' — قيد التنفيذ، التعديل يسري على الأمر القادم.'))) : null),
      collect: () => ({ tasks: tasks.slice() }),
      check: (v) => (!v.tasks.some((t) => String(t).trim()) ? 'أضف مهمة واحدة على الأقل' : null),
      onSubmit: (v) => act(() => CA.updatePlan(p.id, v), (r) => (r && r.unchanged ? 'لا توجد تغييرات' : 'تم حفظ خطة ' + mName(p.machineId) + ' — المستحق ' + ERP.fmt.date(v.nextDueAt))) });
  }
  /** edit the quantities before a spare-part purchase request / spend approval is raised from an MWO */
  function partsQtyModal(m, mode) {
    const base = mode === 'spend' && m.spendLines && m.spendLines.length ? m.spendLines.map((l) => Object.assign({ short: (CA.shortParts(m).find((s) => s.itemId === l.itemId) || {}).short || 0 }, l)) : CA.suggestLines(m);
    const lines = base.map((l) => Object.assign({}, l)); const tot = h('b.num');
    const calc = () => { const v = lines.reduce((s, l) => s + (Number(l.qty) || 0) * ((ERP.item(l.itemId) || {}).stdCost || 0), 0); SA.clear(tot); tot.append(U.cost(Math.round(v))); };
    const rows = lines.map((l) => { const it = ERP.item(l.itemId) || {}; return [U.itemCell(l.itemId), h('span.num', {}, ERP.fmt.num(spareAvail(l.itemId))), h('b.num', { style: { color: 'var(--color-danger)' } }, ERP.fmt.num(l.short)), h('span.num', {}, ERP.fmt.num(it.moq || 1)),
      h('input.input.num', { type: 'number', min: 0, value: l.qty, name: 'qty-' + l.itemId, style: { width: '96px' }, 'aria-label': 'الكمية المطلوبة — ' + (it.name || l.itemId), oninput: (e) => { l.qty = Number(e.target.value) || 0; calc(); } })]; });
    calc();
    const spend = mode === 'spend';
    return formModal({ title: spend ? 'طلب اعتماد صرف عاجل — ' + m.id : 'طلب شراء عاجل — ' + m.id, subtitle: mName(m.machineId), icon: spend ? 'inbox' : 'cart', size: 'lg', submitLabel: spend ? 'إرسال لمدير الإنتاج' : 'إنشاء طلب الشراء', submitIcon: spend ? 'send' : 'cart',
      intro: SA.alert('info', spend ? 'راجع الكميات قبل الإرسال — القيمة التقديرية تُحسب منها، وبعد الاعتماد يصدر أمر الشراء بنفس الكميات.' : 'الكمية المقترحة = النقص (أو الحد الأدنى للطلب). عدّلها لو تحتاج احتياطي إضافي.'),
      extra: h('div', {}, miniTable(['القطعة', 'متاح W-05', 'النقص', 'الحد الأدنى للطلب', 'الكمية المطلوبة'], rows), h('p', { style: { marginTop: '10px' } }, 'القيمة التقديرية: ', tot)),
      check: () => (!lines.some((l) => Number(l.qty) > 0) ? 'أدخل كمية لقطعة واحدة على الأقل' : lines.some((l) => Number(l.qty) > 0 && Number(l.qty) < l.short) ? 'الكمية أقل من النقص المطلوب لإصلاح العطل' : null),
      onSubmit: () => (spend ? act(() => CA.requestSpend(m.id, lines), (a) => 'أُرسل طلب الاعتماد ' + a.id + ' لمدير الإنتاج') : act(() => CA.requestParts(m.id, lines), (ids) => 'طلب شراء عاجل ' + (ids || []).join('، ') + ' — تم إبلاغ المشتريات')) });
  }
  function renderPM(root, ctx) {
    ctx.setCrumbs([{ label: 'صيانة المصنع' }, { label: 'الصيانة الوقائية' }]);
    return SA.live(root, () => {
      const plans = get('pmPlans').filter((p) => p.active !== false); const inactive = get('pmPlans').filter((p) => p.active === false); const pmc = CA.pmCompliance(90); const od = plans.filter((p) => CA.pmState(p) === 'overdue').sort((a, b) => (a.nextDueAt < b.nextDueAt ? -1 : 1));
      const soon = plans.filter((p) => CA.pmState(p) === 'soon'); const openPM = get('maintenanceOrders').filter((m) => m.kind === 'preventive' && M_OPEN(m));
      const openOf = (p) => { const m = p.mwoId ? ERP.find('maintenanceOrders', p.mwoId) : null; return m && M_OPEN(m) ? m : null; };
      const schedBtn = (p, small) => { const o = openOf(p); return o ? dl(o.id) : SA.btn({ label: 'أنشئ أمر صيانة وقائية', icon: 'plus', size: small ? 'sm' : null, kind: small ? 'ghost' : 'primary', perm: 'care.pm.edit', onClick: () => act(() => CA.schedulePM(p.id), (m) => 'تم إنشاء ' + m.id + ' — ' + mName(p.machineId)) }); };
      // calendar: 5 weeks from this Saturday
      const w0 = weekStart(0); const days = Array.from({ length: 35 }, (_, i) => addDays(w0, i)); const t0 = today();
      const onDay = (d) => { const out = []; plans.forEach((p) => { const o = openOf(p); const due = o && o.plannedAt ? o.plannedAt : p.nextDueAt; const late = due < t0; if ((late && d === t0) || (!late && due === d)) out.push(h('a.care-pmchip' + (late ? '.is-overdue' : o ? '.is-scheduled' : ''), { href: o ? '#/care/maintenance/' + o.id : '#/care/assets/' + p.machineId, title: p.title + (late ? ' — متأخرة منذ ' + ERP.fmt.date(due) : '') }, p.machineId + ' ' + (MTYPE[(mach(p.machineId) || {}).type] || ''))); }); return out; };
      const cal = h('div.care-cal', {}, [6, 0, 1, 2, 3, 4, 5].map((i) => h('div.care-cal-h', {}, DAYN[i])), days.map((d) => h('div.care-cal-d' + (d === t0 ? '.is-today' : '') + (d < t0 || isFri(d) ? '.is-off' : ''), {}, h('time', {}, d.slice(8) + '/' + d.slice(5, 7)), d >= t0 ? onDay(d) : null)));
      return h('div', {}, SA.pageHead({ title: 'الصيانة الوقائية', desc: 'خطة لكل ماكينة (كل X يوم أو ساعة تشغيل) بقائمة مهام — المتأخرة أولًا، وتقويم الشهر القادم، ونسبة الالتزام.', actions: [od.length ? SA.btn({ label: 'جدولة كل المتأخرة (' + od.filter((p) => !openOf(p)).length + ')', icon: 'calendar', perm: 'care.pm.edit', reason: od.filter((p) => !openOf(p)).length ? '' : 'كل المتأخرة لها أوامر مفتوحة', onClick: () => act(() => od.filter((p) => !openOf(p)).map((p) => CA.schedulePM(p.id)), (l) => 'تم إنشاء ' + l.length + ' أمر صيانة وقائية') }) : null] }),
        U.kpis([U.kpi({ label: 'نسبة الالتزام (90 يومًا)', value: pmc != null ? Math.round(pmc * 100) + '%' : '—', icon: 'gauge', tone: pmc >= 0.85 ? 'success' : pmc >= 0.7 ? 'warning' : 'danger', sub: 'المنفّذ خلال 3 أيام من الموعد' }), U.kpi({ label: 'متأخرة', value: od.length, icon: 'alert', tone: od.length ? 'danger' : 'success' }),
          U.kpi({ label: 'مستحقة خلال 7 أيام', value: soon.length, icon: 'calendar', tone: soon.length ? 'warning' : null }), U.kpi({ label: 'أوامر وقائية مفتوحة', value: openPM.length, icon: 'wrench', href: hrefIf('care/maintenance?kind=preventive') }), U.kpi({ label: 'خطط نشطة', value: plans.length, icon: 'list' })]),
        U.grid(2, SA.card({ title: 'الالتزام بالصيانة الوقائية' }, h('div', { style: { display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' } }, CH.gauge(pmc || 0, { label: 'آخر 90 يومًا', good: 0.85, warn: 0.7 }), h('div', { style: { flex: 1, minWidth: '200px', display: 'grid', gap: '10px' } }, get('lines').map((l) => { const ps = plans.filter((p) => (mach(p.machineId) || {}).lineId === l.id); const ok = ps.filter((p) => CA.pmState(p) !== 'overdue').length; return CH.meter(ps.length ? ok / ps.length : 1, { label: l.name, text: ok + '/' + ps.length + ' في الموعد' }); })))),
          SA.card({ title: 'المتأخرة', tags: h('span.sap-count', {}, od.length) }, od.length ? h('ul.care-attn', {}, od.map((p) => h('li', {}, h('div', {}, h('span.care-ico.is-danger', {}, SA.icon('calendar', 'icon-sm')), h('span.care-grow', {}, h('b', {}, mName(p.machineId)), h('small', {}, 'مستحقة ' + ERP.fmt.date(p.nextDueAt) + ' — متأخرة ' + -daysTo(p.nextDueAt) + ' يوم · ' + (p.tasks || []).length + ' مهام')), schedBtn(p, true))))) : SA.empty({ icon: 'checkcircle', title: 'لا توجد صيانة وقائية متأخرة' }))),
        SA.card({ title: 'تقويم الصيانة الوقائية — الأسابيع الخمسة القادمة', actions: [h('span.care-row', {}, h('span.care-pmchip.is-overdue', {}, 'متأخرة'), h('span.care-pmchip.is-scheduled', {}, 'لها أمر صيانة'), h('span.care-pmchip', {}, 'مستحقة'))] }, cal),
        h('div', { style: { marginTop: '16px' } }, SA.card({ title: 'كل الخطط', tags: inactive.length ? [SA.chip(inactive.length + ' موقوفة', 'neutral')] : null }, miniTable(['الماكينة', 'الأهمية', 'التكرار', 'المهام', 'آخر تنفيذ', 'المستحق', 'الحالة', 'أمر الصيانة', ''], plans.concat(inactive).slice().sort((a, b) => (a.nextDueAt < b.nextDueAt ? -1 : 1)).map((p) => { const mc = mach(p.machineId) || {}; const off = p.active === false; return [h('div.care-cell', {}, h('a.erp-doc', { href: '#/care/assets/' + p.machineId }, p.machineId), h('small', {}, mc.name)), critCell(mc.criticality), 'كل ' + p.freqDays + ' يوم' + (p.freqHours ? ' / ' + p.freqHours + ' س' : ''),
          h('span.care-muted', { title: (p.tasks || []).join(' · ') }, (p.tasks || []).length + ' مهام'), ERP.fmt.date(p.lastDoneAt), off ? '—' : pmNext({ nextPMAt: p.nextDueAt }), off ? SA.chip('موقوفة', 'neutral') : U.status('care_pm', CA.pmState(p)), off ? '—' : schedBtn(p, true),
          SA.btn({ label: 'تعديل', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'care.pm.edit', onClick: () => pmEditModal(p) })]; })))));
    }, ['pmPlans', 'maintenanceOrders', 'machines']);
  }

  /* ═════════════════════════ 8. SPARES ═════════════════════════ */
  const used90 = (itemId) => get('stockMoves').filter((v) => v.itemId === itemId && v.whId === SPW && v.type === 'issue' && ms(v.ts) >= Date.now() - 90 * DAY).reduce((s, v) => s - v.qty, 0);
  const spState = (i) => { const q = K.qty(i.id, SPW); return q <= 0 ? 'zero' : q <= (i.reorderPoint || 0) ? 'low' : 'ok'; };
  const SPST = { zero: ['رصيد صفر', 'danger'], low: ['عند/تحت الحد الأدنى', 'warning'], ok: ['متوفر', 'success'] };
  const fitsMachines = (i) => get('machines').filter((m) => ((i.attrs && i.attrs.fits) || []).indexOf(m.type) >= 0);
  function reorderModal(i) {
    const q = K.qty(i.id, SPW), oo = K.onOrder(i.id); const sug = Math.max(i.moq || 1, (i.reorderPoint || 0) * 2 - q - oo, 1);
    return formModal({ title: 'إعادة طلب ' + i.name, subtitle: 'الرصيد ' + q + ' · الحد الأدنى ' + (i.reorderPoint || 0) + ' · وارد ' + oo, icon: 'cart', submitLabel: 'إنشاء طلب شراء', fields: [fld({ name: 'qty', label: 'الكمية', type: 'number', required: true, value: sug, min: 1 }), fld({ name: 'reason', label: 'السبب', class: 'care-full', value: q <= 0 ? 'رصيد صفر — قطعة حرجة' : 'إعادة طلب — تحت الحد الأدنى' })],
      intro: oo ? SA.alert('info', 'يوجد ' + oo + ' وحدة في أوامر شراء مفتوحة.') : null, onSubmit: (v) => act(() => F.createPRQ({ itemId: i.id, qty: v.qty, reason: v.reason + ' (قطع غيار)', source: 'maintenance', neededBy: ERP.day(i.leadDays || 10) }), (r) => 'طلب شراء ' + r.id + ' — تم إبلاغ المشتريات') });
  }
  function spareDrawer(id) {
    const i = ERP.item(id); if (!i) return; const q = K.qty(id, SPW); const mv = get('stockMoves').filter((v) => v.itemId === id && v.whId === SPW).slice(0, 15); const prq = get('purchaseRequisitions').filter((r) => r.itemId === id && r.status !== 'rejected').slice(0, 5); const pos = get('purchaseOrders').filter((p) => p.lines.some((l) => l.itemId === id) && ['draft', 'rejected', 'cancelled'].indexOf(p.status) < 0).slice(0, 5);
    SA.drawer({ title: i.name, subtitle: i.code + ' · مخزن قطع الغيار W-05', size: 'lg', body: h('div', {}, h('div.care-row', { style: { marginBottom: '12px' } }, chip(SPST, spState(i)), critical(i) ? SA.chip('قطعة حرجة لماكينات A', 'danger') : null),
      SA.kv([['الرصيد W-05', h('b.num', {}, q)], ['الحد الأدنى (نقطة إعادة الطلب)', i.reorderPoint], ['الوارد في أوامر شراء', K.onOrder(id)], ['المستهلك 90 يومًا', used90(id)], ['المورد', ERP.supplierName(i.supplierId)], ['زمن التوريد', (i.leadDays || '—') + ' يوم'], ['تكلفة الوحدة', U.cost(i.stdCost)], ['قيمة الرصيد', U.cost(q * (i.stdCost || 0))], ['تخدم الماكينات', fitsMachines(i).map((m) => m.id).join('، ') || '—']]),
      h('div.sap-sub', {}, 'طلبات وأوامر الشراء'), miniTable(['المستند', 'الكمية', 'الحالة', 'التاريخ'], prq.map((r) => [dl(r.id), r.qty, U.status('prq', r.status), SA.fmt.rel(r.createdAt)]).concat(pos.map((p) => [dl(p.id), (p.lines.find((l) => l.itemId === id) || {}).qty, U.status('po', p.status), SA.fmt.rel(p.createdAt)])), 'لا توجد طلبات شراء مفتوحة'),
      h('div.sap-sub', {}, 'حركة القطعة'), miniTable(['التاريخ', 'الحركة', 'الكمية', 'المرجع', 'ملاحظة'], mv.map((v) => [SA.fmt.dt(v.ts), v.type === 'issue' ? 'صرف' : v.type === 'receipt' ? 'استلام' : v.type, h('b.num', { style: { color: v.qty < 0 ? 'var(--color-danger)' : 'var(--color-success)' } }, (v.qty > 0 ? '+' : '') + v.qty), v.ref && v.ref.id ? (v.ref.type === 'mwo' ? h('a.erp-doc', { href: '#/care/maintenance/' + v.ref.id }, v.ref.id) : dl(v.ref.id)) : '—', v.note]), 'لا توجد حركات')),
    foot: [SA.btn({ label: 'إعادة طلب', icon: 'cart', perm: 'care.spares.edit', onClick: () => reorderModal(i) })] });
  }
  function renderSpares(root, ctx) {
    ctx.setCrumbs([{ label: 'صيانة المصنع' }, { label: 'قطع الغيار' }]); const kp = h('div');
    const tbl = SA.table({ caption: 'قطع الغيار', rows: () => spares(), pageSize: 25, search: { placeholder: 'ابحث باسم أو كود القطعة…', keys: ['name', 'code'] },
      filters: [{ key: 'state', label: 'الرصيد', options: Object.keys(SPST).map((k) => [k, SPST[k][0]]), test: (r, v) => spState(r) === v }, { key: 'crit', label: 'الأهمية', options: [['yes', 'حرجة لماكينات A']], test: (r) => critical(r) }],
      initial: { sort: { key: 'qty', dir: 'asc' } },
      columns: [{ key: 'name', label: 'القطعة', sort: true, render: (r) => U.itemCell(r.id) }, { key: 'qty', label: 'الرصيد W-05', sort: true, value: (r) => K.qty(r.id, SPW), render: (r) => { const q = K.qty(r.id, SPW); return h('b.num' + (q <= 0 ? '.care-qty0' : q <= r.reorderPoint ? '.care-qtylow' : ''), {}, q); } },
        { key: 'reorderPoint', label: 'الحد الأدنى', sort: true, render: (r) => h('span.num', {}, r.reorderPoint) }, { key: 'onOrder', label: 'وارد', value: (r) => K.onOrder(r.id), sort: true, render: (r) => { const n = K.onOrder(r.id); return n ? SA.chip(n + ' في الطريق', 'info') : '—'; } },
        { key: 'state', label: 'الحالة', render: (r) => chip(SPST, spState(r)) }, { key: 'fits', label: 'تخدم', render: (r) => { const ms_ = fitsMachines(r); return h('div.care-cell', {}, h('b', {}, ms_.slice(0, 4).map((m) => m.id).join('، ') + (ms_.length > 4 ? '…' : '')), critical(r) ? h('small', { style: { color: 'var(--color-danger)' } }, 'حرجة — ماكينات A') : null); } },
        { key: 'used', label: 'استهلاك 90 يومًا', sort: true, value: (r) => used90(r.id), render: (r) => h('span.num', {}, used90(r.id)) }, { key: 'stdCost', label: 'تكلفة الوحدة', sort: true, render: (r) => U.cost(r.stdCost) }, { key: 'value', label: 'قيمة الرصيد', value: (r) => K.qty(r.id, SPW) * (r.stdCost || 0), render: (r) => U.cost(K.qty(r.id, SPW) * (r.stdCost || 0)) }],
      rowActions: (r) => [{ label: 'التفاصيل والحركة', icon: 'eye', onClick: () => spareDrawer(r.id) }, { label: 'إعادة طلب', icon: 'cart', disabled: SA.can('care.spares.edit') ? false : 'ليست من صلاحياتك', onClick: () => reorderModal(r) }],
      onRowClick: (r) => spareDrawer(r.id), empty: { icon: 'box', title: 'لا توجد قطع غيار معرّفة' } });
    const drawK = () => { const l = spares(); const val = l.reduce((s, i) => s + K.qty(i.id, SPW) * (i.stdCost || 0), 0); SA.clear(kp); kp.append(U.kpis([U.kpi({ label: 'أصناف قطع الغيار', value: l.length, icon: 'box' }), U.kpi({ label: 'رصيد صفر', value: l.filter((i) => spState(i) === 'zero').length, icon: 'alert', tone: l.some((i) => spState(i) === 'zero') ? 'danger' : 'success', sub: 'حرجة ' + l.filter((i) => spState(i) === 'zero' && critical(i)).length }),
      U.kpi({ label: 'عند/تحت الحد الأدنى', value: l.filter((i) => spState(i) === 'low').length, icon: 'activity', tone: l.some((i) => spState(i) === 'low') ? 'warning' : null }), U.kpi({ label: 'طلبات شراء مفتوحة', value: get('purchaseRequisitions').filter((r) => r.status === 'open' && (ERP.item(r.itemId) || {}).kind === 'spare').length, icon: 'cart' }),
      U.kpi({ label: 'قيمة مخزون قطع الغيار', value: U.canCost() ? ERP.fmt.short(val) : U.cost(val), icon: 'coins' })])); };
    drawK();
    root.append(SA.pageHead({ title: 'قطع الغيار', desc: 'أرصدة مخزن قطع الغيار (W-05) مقابل الحد الأدنى، الاستهلاك من أوامر الصيانة، والقطع الحرجة للماكينات من الدرجة A — إعادة الطلب تُنشئ طلب شراء للمشتريات.' }), kp, tbl.el);
    const offs = ['stock', 'stockMoves', 'purchaseRequisitions', 'purchaseOrders'].map((x) => st.subscribe(x, () => { drawK(); tbl.refresh(); }));
    return () => offs.forEach((f) => f());
  }

  /* ═════════════════════════ 9. IT HELPDESK ═════════════════════════ */
  function itResolveModal(t) { return formModal({ title: 'حل التذكرة ' + t.id, icon: 'checkcircle', submitLabel: 'تسجيل الحل', fields: [fld({ name: 'resolution', label: 'الحل', type: 'textarea', required: true, rows: 3, class: 'care-full', rules: [FM.rules.min(4)] })], onSubmit: (v) => act(() => CA.itStatus(t.id, 'resolved', { resolution: v.resolution }), 'تم حل التذكرة وإبلاغ مقدّم الطلب') }); }
  function itAssignModal(t) { return formModal({ title: 'إسناد ' + t.id, icon: 'userplus', submitLabel: 'إسناد', fields: [fld({ name: 'assigneeId', label: 'فني الدعم', type: 'select', required: true, value: t.assigneeId || 'U-09', options: assignees('care.it.edit') })], onSubmit: (v) => act(() => CA.itStatus(t.id, t.status === 'open' ? 'assigned' : t.status, { assigneeId: v.assigneeId }), 'أُسندت إلى ' + uname(v.assigneeId)) }); }
  function itBtns(t) {
    const P = 'care.it.edit'; const b = []; const go = (s, msg) => act(() => CA.itStatus(t.id, s), msg);
    if (t.status === 'open') b.push(SA.btn({ label: 'إسناد', icon: 'userplus', kind: 'ghost', perm: P, onClick: () => itAssignModal(t) }), SA.btn({ label: 'إسناد لـ ' + uname('U-09'), icon: 'user', perm: P, onClick: () => act(() => CA.itStatus(t.id, 'assigned', { assigneeId: 'U-09' }), 'أُسندت إلى ' + uname('U-09')) }));
    if (t.status === 'assigned') b.push(SA.btn({ label: 'بدء العمل', icon: 'play', perm: P, onClick: () => go('in_progress', 'بدأ العمل على التذكرة') }));
    if (t.status === 'in_progress' || t.status === 'assigned' || t.status === 'waiting_customer') b.push(SA.btn({ label: 'تم الحل', icon: 'checkcircle', perm: P, onClick: () => itResolveModal(t) }));
    if (t.status === 'resolved') b.push(SA.btn({ label: 'إعادة فتح', icon: 'refresh', kind: 'ghost', perm: P, onClick: () => go('in_progress', 'أُعيد فتح التذكرة') }), SA.btn({ label: 'إغلاق', icon: 'check', perm: P, onClick: () => go('closed', 'أُغلقت التذكرة') }));
    return b;
  }
  const assetCell = (a) => (a ? h('div.care-cell', {}, h('b', {}, a.name), h('small', {}, a.id + ' · ' + a.serial)) : '—');
  const warrCell = (a) => { const d = daysTo(a.warrantyUntil); return h('div.care-sla' + (d < 0 ? '.is-bad' : d <= 60 ? '.is-warn' : '.is-ok'), {}, h('b', {}, ERP.fmt.date(a.warrantyUntil)), h('small', {}, d < 0 ? 'منتهي منذ ' + -d + ' يوم' : 'متبقٍ ' + d + ' يوم')); };
  function renderIT(root, ctx) {
    if (ctx.path[0]) return renderITTicket(root, ctx, ctx.path[0]);
    ctx.setCrumbs([{ label: 'الدعم الفني IT' }, { label: ctx.params.tab === 'assets' ? 'أصول تقنية المعلومات' : 'تذاكر الدعم الفني' }]);
    const tab = ctx.params.tab === 'assets' ? 'assets' : 'tickets'; const host = h('div'); let offs = [];
    const tabs = SA.tabs({ tabs: [{ id: 'tickets', label: 'التذاكر', icon: 'inbox', badge: get('itTickets').filter(T_OPEN).length }, { id: 'assets', label: 'أصول تقنية المعلومات', icon: 'monitor', badge: get('itAssets').length }], active: tab, onChange: (id) => SA.nav('care/it' + (id === 'assets' ? '?tab=assets' : ''), { replace: true }) });
    if (tab === 'tickets') {
      const tbl = SA.table({ caption: 'تذاكر الدعم الفني', rows: () => get('itTickets'), pageSize: 10, search: { placeholder: 'ابحث برقم التذكرة أو المشكلة أو مقدّم الطلب…', keys: (r, q) => [r.id, r.title, uname(r.requesterId), r.desc].some((x) => String(x || '').toLowerCase().indexOf(q) >= 0) },
        filters: [{ key: 'status', label: 'الحالة', options: [['active', 'كل المفتوحة']].concat(Object.keys(C.status.ticket).filter((k) => k !== 'waiting_customer').map((k) => [k, C.status.ticket[k][0]])), test: (r, v) => (v === 'active' ? T_OPEN(r) : r.status === v) }, { key: 'category', label: 'التصنيف', options: Object.keys(ITCAT).map((k) => [k, ITCAT[k]]) }, { key: 'priority', label: 'الأولوية', options: Object.keys(PRIO).map((k) => [k, PRIO[k][0]]) }, { key: 'assignee', label: 'الإسناد', options: [['none', 'غير مُسندة'], ['me', 'المُسندة إليّ']], test: (r, v) => (v === 'none' ? !r.assigneeId : r.assigneeId === me()) }],
        initial: { filters: { status: ctx.params.status || 'active' }, sort: { key: 'openedAt', dir: 'desc' } },
        columns: [{ key: 'id', label: 'التذكرة', sort: true, render: (r) => h('div.care-cell', {}, h('a.erp-doc', { href: '#/care/it/' + r.id }, r.id), h('small', {}, SA.fmt.rel(r.openedAt))) }, { key: 'title', label: 'المشكلة', render: (r) => h('div.care-cell', {}, h('b', {}, r.title), h('small', {}, uname(r.requesterId) + ' · ' + SA.deptName((SA.userById(r.requesterId) || {}).departmentId))) },
          { key: 'category', label: 'التصنيف', sort: true, render: (r) => SA.chip(ITCAT[r.category] || r.category, 'neutral') }, { key: 'priority', label: 'الأولوية', sort: (a, b) => Object.keys(PRIO).indexOf(a.priority) - Object.keys(PRIO).indexOf(b.priority), render: (r) => chip(PRIO, r.priority) },
          { key: 'status', label: 'الحالة', sort: true, render: (r) => U.status('ticket', r.status) }, { key: 'assigneeId', label: 'الفني', render: (r) => (r.assigneeId ? uname(r.assigneeId) : SA.chip('غير مُسندة', 'warning')) }, { key: 'openedAt', label: 'المدة', sort: true, render: (r) => (T_OPEN(r) ? h('span', {}, 'مفتوحة ' + dur(minsSince(r.openedAt))) : h('span.care-muted', {}, 'حُلت خلال ' + dur((ms(r.resolvedAt || r.closedAt) - ms(r.openedAt)) / 60000))) }],
        rowActions: (r) => [{ label: 'فتح', icon: 'external', onClick: () => SA.nav('care/it/' + r.id) }, { label: 'إسناد لـ ' + uname('U-09'), icon: 'user', hidden: !T_OPEN(r) || r.assigneeId === 'U-09', disabled: SA.can('care.it.edit') ? false : 'ليست من صلاحياتك', onClick: () => act(() => CA.itStatus(r.id, r.status === 'open' ? 'assigned' : r.status, { assigneeId: 'U-09' }), 'أُسندت التذكرة') }],
        onRowClick: (r) => SA.nav('care/it/' + r.id), empty: { icon: 'monitor', title: 'لا توجد تذاكر دعم فني' } });
      host.append(tbl.el); offs = [st.subscribe('itTickets', () => { tbl.refresh(); tabs.setBadge('tickets', get('itTickets').filter(T_OPEN).length); })];
    } else {
      const tbl = SA.table({ caption: 'أصول تقنية المعلومات', rows: () => get('itAssets'), pageSize: 25, search: { placeholder: 'ابحث بالجهاز أو السيريال أو المستخدم…', keys: (r, q) => [r.id, r.name, r.serial, uname(r.assigneeId), r.location].some((x) => String(x || '').toLowerCase().indexOf(q) >= 0) },
        filters: [{ key: 'kind', label: 'النوع', options: Object.keys(ITKIND).map((k) => [k, ITKIND[k][0]]) }, { key: 'status', label: 'الحالة', options: Object.keys(C.status.care_asset).map((k) => [k, C.status.care_asset[k][0]]) }, { key: 'warranty', label: 'الضمان', options: [['expired', 'منتهي'], ['soon', 'ينتهي خلال 60 يومًا'], ['ok', 'ساري']], test: (r, v) => { const d = daysTo(r.warrantyUntil); return v === 'expired' ? d < 0 : v === 'soon' ? d >= 0 && d <= 60 : d > 60; } }],
        initial: { sort: { key: 'id', dir: 'asc' } },
        columns: [{ key: 'id', label: 'الأصل', sort: true, render: (r) => h('span.erp-item', {}, h('span.erp-item-ico', {}, SA.icon((ITKIND[r.kind] || [])[1] || 'monitor', 'icon-sm')), h('span', {}, h('b', {}, r.name), h('small.num', {}, r.id + ' · ' + r.serial))) }, { key: 'kind', label: 'النوع', sort: true, render: (r) => (ITKIND[r.kind] || [r.kind])[0] },
          { key: 'assigneeId', label: 'المستخدم / الموقع', render: (r) => h('div.care-cell', {}, h('b', {}, r.assigneeId ? uname(r.assigneeId) : r.location), h('small', {}, r.assigneeId ? r.location : SA.deptName(r.deptId))) }, { key: 'status', label: 'الحالة', sort: true, render: (r) => U.status('care_asset', r.status) },
          { key: 'purchased', label: 'الشراء', sort: true, render: (r) => ERP.fmt.date(r.purchased) }, { key: 'warrantyUntil', label: 'الضمان', sort: true, render: warrCell }, { key: 'tk', label: 'تذاكر مفتوحة', render: (r) => { const n = get('itTickets').filter((t) => t.assetId === r.id && T_OPEN(t)).length; return n ? SA.chip(n, 'warning') : '—'; } }],
        rowActions: (r) => [{ label: 'فتح تذكرة لهذا الجهاز', icon: 'plus', disabled: SA.can('care.it.create') ? false : 'ليست من صلاحياتك', onClick: () => itModal({ assetId: r.id }) }].concat(Object.keys(C.status.care_asset).filter((k) => k !== r.status).map((k) => ({ label: 'تغيير الحالة: ' + C.status.care_asset[k][0], icon: 'swap', disabled: SA.can('care.it.edit') ? false : 'ليست من صلاحياتك', onClick: () => act(() => { st.patch('itAssets', r.id, { status: k }); SA.audit('IT.UPDATED', { target: { type: 'it_asset', id: r.id, label: r.name }, before: { status: r.status }, after: { status: k } }); return true; }, 'تم تحديث حالة ' + r.id) }))),
        empty: { icon: 'monitor', title: 'لا توجد أصول' } });
      host.append(tbl.el); offs = [st.subscribe('itAssets', () => tbl.refresh())];
    }
    const open = get('itTickets').filter(T_OPEN);
    root.append(SA.pageHead({ title: 'الدعم الفني IT', desc: 'تذاكر الدعم الداخلية (أجهزة، شبكة، حسابات وصلاحيات، النظام) وسجل أجهزة الشركة بالمستخدم والضمان — بما فيها تابلتات أرضية المصنع.', actions: [SA.btn({ label: 'تذكرة جديدة', icon: 'plus', perm: 'care.it.create', onClick: () => itModal({}) })] }),
      h('div.sap-statrow', { style: { margin: '0 0 12px' } }, h('span', {}, h('b.num', {}, open.length), 'مفتوحة'), h('span', {}, h('b.num', {}, open.filter((t) => !t.assigneeId).length), 'غير مُسندة'), h('span', {}, h('b.num', {}, open.filter((t) => t.priority === 'high' || t.priority === 'urgent').length), 'عالية/عاجلة'), h('span', {}, h('b.num', {}, get('itAssets').filter((a) => a.status === 'repair').length), 'أجهزة في الصيانة')),
      tabs.el, h('div', { style: { marginTop: '12px' } }, host));
    return () => offs.forEach((f) => f());
  }
  function renderITTicket(root, ctx, id) {
    ctx.setCrumbs([{ label: 'الدعم الفني IT', href: '#/care/it' }, { label: 'تذاكر الدعم الفني', href: '#/care/it' }, { label: id }]);
    return SA.live(root, () => {
      const t = ERP.find('itTickets', id); if (!t) return notFound('التذكرة غير موجودة', '#/care/it', 'تذاكر الدعم الفني'); const a = t.assetId ? ERP.find('itAssets', t.assetId) : null; const u = SA.userById(t.requesterId) || {};
      const nT = fld({ name: 'n', label: 'إضافة ملاحظة', type: 'textarea', rows: 2 });
      return h('div', {}, SA.pageHead({ title: t.title, back: { href: '#/care/it', label: 'تذاكر الدعم الفني' }, tags: [h('span.num.care-muted', {}, t.id), U.status('ticket', t.status), chip(PRIO, t.priority), SA.chip(ITCAT[t.category] || t.category, 'neutral')], actions: itBtns(t) }),
        U.grid(2, SA.card({ title: 'بيانات التذكرة' }, t.desc ? h('p', { style: { marginTop: 0, lineHeight: 1.8 } }, t.desc) : null, SA.kv([['مقدّم الطلب', uname(t.requesterId) + (u.jobTitle ? ' — ' + u.jobTitle : '')], ['القسم', SA.deptName(u.departmentId)], ['التصنيف', ITCAT[t.category] || t.category], ['الفني', t.assigneeId ? uname(t.assigneeId) : SA.chip('غير مُسندة', 'warning')], ['فُتحت', SA.fmt.dt(t.openedAt) + ' · ' + SA.fmt.rel(t.openedAt)], t.resolvedAt ? ['حُلت', SA.fmt.dt(t.resolvedAt) + ' (خلال ' + dur((ms(t.resolvedAt) - ms(t.openedAt)) / 60000) + ')'] : null, t.resolution ? ['الحل', t.resolution] : null])),
          SA.card({ title: 'الجهاز المرتبط' }, a ? h('div', {}, SA.kv([['الجهاز', assetCell(a)], ['النوع', (ITKIND[a.kind] || [a.kind])[0]], ['المستخدم / الموقع', (a.assigneeId ? uname(a.assigneeId) + ' · ' : '') + a.location], ['الحالة', U.status('care_asset', a.status)], ['الضمان', warrCell(a)]]), daysTo(a.warrantyUntil) >= 0 ? SA.alert('info', 'الجهاز تحت الضمان — يمكن طلب الإصلاح من المورد.') : SA.alert('warning', 'الضمان منتهي — الإصلاح على حساب الشركة.')) : SA.empty({ icon: 'monitor', title: 'لا يوجد جهاز مرتبط' }))),
        SA.card({ title: 'المتابعة' }, (t.notes || []).length ? h('ul.care-notes', {}, (t.notes || []).map((n) => h('li.care-note', {}, SA.avatar(uname(n.by)), h('div.care-note-b' + (n.sys ? '.is-sys' : ''), {}, h('small', {}, h('b', {}, uname(n.by)), h('span', {}, SA.fmt.dt(n.at))), n.text)))) : h('p.care-muted', {}, 'لا توجد ملاحظات.'),
          SA.can('care.it.edit') ? h('div', { style: { marginTop: '12px' } }, nT.el, SA.btn({ label: 'إضافة', icon: 'plus', size: 'sm', onClick: () => { const v = String(nT.get() || '').trim(); if (v.length < 2) { nT.error('اكتب الملاحظة'); return; } act(() => { st.patch('itTickets', id, (x) => { x.notes = (x.notes || []).concat([tNote(v)]); }); SA.audit('IT.UPDATED', { target: { type: 'it_ticket', id, label: t.title }, after: { note: v.slice(0, 80) } }); return true; }, 'أُضيفت الملاحظة'); } })) : null));
    }, ['itTickets', 'itAssets']);
  }

  /* ═════════════════════════ registration · search · missions ═════════════════════════ */
  const REG = (o) => SA.register(Object.assign({ app: 'care' }, o));
  REG({ id: 'care-dashboard', group: 'care-dash', title: 'لوحة الدعم والصيانة', icon: 'gauge', route: 'care/dashboard', perm: 'care.dashboard.view', order: 1, desc: 'ما بعد البيع + صيانة المصنع + IT', render: renderDashboard });
  REG({ id: 'care-tickets', group: 'care-cs', title: 'شكاوى وطلبات العملاء', icon: 'headset', route: 'care/tickets', perm: 'care.tickets.view', order: 10, desc: 'تذاكر العملاء والتجار والـSLA', badge: () => { const n = visibleTickets().filter(T_OPEN).length; return n || null; }, render: renderTickets });
  REG({ id: 'care-warranty', group: 'care-cs', title: 'مطالبات الضمان', icon: 'shield', route: 'care/warranty', perm: 'care.warranty.view', order: 11, desc: 'قرار الضمان وأمر الاستبدال', render: renderWarranty });
  REG({ id: 'care-visits', group: 'care-cs', title: 'زيارات التركيب والمعاينة', icon: 'map', route: 'care/visits', perm: 'care.visits.view', order: 12, desc: 'جدول الفنيين والتقارير', render: renderVisits });
  REG({ id: 'care-assets', group: 'care-mnt', title: 'سجل الماكينات', icon: 'factory', route: 'care/assets', perm: 'care.assets.view', order: 20, desc: 'الماكينات والاعتمادية', render: renderAssets });
  REG({ id: 'care-maintenance', group: 'care-mnt', title: 'أوامر الصيانة والأعطال', icon: 'wrench', route: 'care/maintenance', perm: 'care.maintenance.view', order: 21, desc: 'الأعطال وقطع الغيار وعودة الخط', badge: () => { const n = get('maintenanceOrders').filter((m) => m.kind === 'breakdown' && M_OPEN(m)).length; return n || null; }, render: renderMaintenance });
  REG({ id: 'care-pm', group: 'care-mnt', title: 'الصيانة الوقائية', icon: 'calendar', route: 'care/pm', perm: 'care.pm.view', order: 22, desc: 'الخطط والتقويم والالتزام', render: renderPM });
  REG({ id: 'care-spares', group: 'care-mnt', title: 'قطع الغيار', icon: 'box', route: 'care/spares', perm: 'care.spares.view', order: 23, desc: 'أرصدة W-05 وإعادة الطلب', render: renderSpares });
  REG({ id: 'care-it', group: 'care-it', title: 'الدعم الفني IT', icon: 'monitor', route: 'care/it', perm: 'care.it.view', order: 30, desc: 'تذاكر IT وأصول الأجهزة', badge: () => { const n = get('itTickets').filter((t) => T_OPEN(t) && !t.assigneeId).length; return n || null; }, render: renderIT });

  if (SA.search && SA.search.register) SA.search.register({ id: 'care', label: 'الدعم والصيانة', query: (q) => {
    if (!q) return []; const has = (s) => String(s || '').toLowerCase().indexOf(q) >= 0; const out = [];
    if (SA.can('care.tickets.view')) visibleTickets().filter((t) => has(t.id) || has(t.title) || has(ERP.customerName(t.customerId))).slice(0, 4).forEach((t) => out.push({ title: t.id + ' — ' + t.title, sub: ERP.customerName(t.customerId) + ' · ' + ((C.status.ticket[t.status] || [])[0] || ''), icon: 'headset', route: 'care/tickets/' + t.id }));
    if (SA.can('care.maintenance.view')) get('maintenanceOrders').filter((m) => has(m.id) || has(m.title) || has(m.machineId)).slice(0, 3).forEach((m) => out.push({ title: m.id + ' — ' + m.title, sub: mName(m.machineId) + ' · ' + ((C.status.mwo[m.status] || [])[0] || ''), icon: 'wrench', route: 'care/maintenance/' + m.id }));
    if (SA.can('care.assets.view')) get('machines').filter((m) => has(m.id) || has(m.name)).slice(0, 3).forEach((m) => out.push({ title: m.id + ' — ' + m.name, sub: lName(m.lineId) + ' · ' + ((C.status.machine[m.status] || [])[0] || ''), icon: 'factory', route: 'care/assets/' + m.id }));
    if (SA.can('care.it.view')) get('itTickets').filter((t) => has(t.id) || has(t.title)).slice(0, 3).forEach((t) => out.push({ title: t.id + ' — ' + t.title, sub: uname(t.requesterId), icon: 'monitor', route: 'care/it/' + t.id }));
    return out;
  } });
  if (SA.missions && SA.missions.add) {
    if (SA.missions.areas && !SA.missions.areas.care) SA.missions.areas.care = 'الدعم والصيانة';
    SA.missions.add({ id: 'M-CARE1', area: 'care', title: 'أعد خط التجاليد للعمل — من الاعتماد حتى استئناف طلب عُمان', persona: 'owner', route: 'care/maintenance/MWO-2026-0087', est: '4 د', goal: 'L-03 متوقف بسبب حزام تسخين M-301 ورصيد القطعة صفر. اعتمد الصرف (AP-2104) فيُصدر أمر شراء تلقائيًا، استلم القطعة (طارئ)، اصرفها للأمر، ثم أتمم الصيانة: يعود الخط ويُستأنف أمر تشغيل التصدير ويُبلَّغ الإنتاج والمبيعات.',
      steps: [{ text: 'اعتمد طلب الصرف AP-2104 من صفحة أمر الصيانة', audit: 'MNT.PARTS_ORDERED' }, { text: 'استلم القطعة (استلام طارئ) واصرفها من W-05', audit: 'SPARE.ISSUED' }, { text: 'أتمم الصيانة وشاهد عودة الخط', audit: 'MNT.COMPLETED' }], detect: [{ audit: 'MNT.PARTS_ORDERED' }, { audit: 'SPARE.ISSUED' }, { audit: 'MNT.COMPLETED' }] });
    SA.missions.add({ id: 'M-CARE2', area: 'care', title: 'اعتمد مطالبة ضمان وشاهد أمر الاستبدال', persona: 'gm', route: 'care/warranty', est: '2 د', goal: 'كمدير عام اعتمد مطالبة ضمان معلقة — يُنشأ أمر بيع استبدال بسعر صفر ويُحجز من المخزون، وتظهر المتابعة على تذكرة العميل.', steps: [{ text: 'افتح مطالبات الضمان واعتمد WC-2026-0015', audit: 'WARRANTY.DECIDED' }], detect: [{ audit: 'WARRANTY.DECIDED' }] });
  }
})();
