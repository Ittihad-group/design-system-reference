/* EG ERP prototype — erp-factory.js  (SHARED FOUNDATION — lead-owned; module agents READ, never edit)
   Loads AFTER seed-erp.js and BEFORE every mod-*.js (see index.html).

   The REAL factory flow (from the plant notebook — المصرية الألمانية، جمصة):
     الخامات ← «أمين مخزن الخامات» يستلم (GRN + فحص استلام) ← «إذن صرف للخلاطة» حسب الخلطة (13 خلطة كيميائية)
     ← الخلاطة (3 خلاطات) ← السحب/البثق (3 ماكينات)
        الضلفة: ← السنفرة ← الترويس ← تركيب الخشب ← الشريط ← النضافة + المادة ← فتحة الكالون ← اللمينيشن ← (سادة / ديكور / ديكور بارز)
        الحلق : ← اللمينيشن ← تقطيع وتخريم
     ← الجودة والتغليف ← الفحص النهائي ← «أمين مخزن المنتج التام» يستلم ← يسلّم للعملاء (إذن تسليم)
   الهوالك: تُسجّل عند المرحلة اللي طلعت منها (سبب + قطع + وزن كجم) ← مخزن الهوالك والمطحون W-07 ← تُطحن (الكسارة M-502) وترجع الخلاطة
            كمطحون (Regrind) جوه الخلطة، والزيادة تُباع بموافقة المدير المالي. كل حركة لها قيد آلي.

   ── DATA (all in SA.store) ──
   formulas[]       {id:'MX-01', name, family, track:'leaf|frame|main', batchKg, mixMin, mixer, regMaxPct, density, version, status, approvedBy, updatedAt, uses, lines:[{itemId, pct}]}
   workOrders[].stages[] {key:'leaf:ST-SAND', track, stageId, lineId, seq, good, scrap (قطع), scrapKg, startedAt, lastAt, machineId}
   workOrders[] extra: mirId, scrapKg, shortfall
   issueRequests[]  {id:'MIR-…', woId, itemId, lot, lines:[{itemId, qty, issuedQty, dest:stageId, whId}], formulas:[{track, formulaId, kg, batches}], compoundKg, regKg,
                     status:'pending|partial|issued|cancelled', requestedBy, requestedAt, issuedBy, issuedAt, value, priority, soId}
   fgReceipts[]     {id:'FGR-…', woId, qcId, itemId, qty, lot, soId, status:'pending|received', createdAt, receivedAt, receivedBy, receivedQty, note}
   scrapLogs[]      newest first {id:'SCR-…', at, date, woId, itemId, stageId, track, lineId, machineId, shift, qty (قطع), kg, reasonId, scrapItemId, normal, cost, recoverable, by, note}
   scrapOps[]       newest first {id:'RG-…', kind:'grind', at, kgIn, kgOut, machineId, by, note}
   scrapSales[]     newest first {id:'SS-…', at, buyer, lines:[{itemId, kg, price}], total, bookValue, status:'pending_approval|approved|sold|rejected', approvalId, by, soldAt, soldBy}

   ── API: ERP.factory (FX) ──
   STAGES/stage(id) · TRACKS · FINISH · finishType(itemId) · routeOf(itemId) · initStages(wo) · stageView(woOrId) → stages + {name, input, avail, processed, status}
   isComplete(wo) · reportStage(woId, key, {good, scrap, scrapKg, reasonId, machineId, shift, note}) → {ok, reason?, wo, log, completed}
   REASONS · reasonsFor(stageId) · reason(id) · stdPct(stageId) · unitKg(itemId, track) · compoundKg(itemId) · compoundCostKg(itemId)
   logScrap(o) · grind(kgIn, {note}) · requestScrapSale({lines:[{itemId, kg, price}], buyer, note}) · deliverScrapSale(id) · scrapAvail(itemId) · scrapStats({days, from, to})
   formulasFor(itemId) → [{track, formulaId}] · createMIR(woId, {force}) · issueMIR(mirId, {lines:[{itemId, qty}]}) · createFGR(o) · receiveFG(fgrId, {qty, note})
   wipAt(stageId) → pieces waiting at a stage (all open WOs) · machinesOf(stageId) · SCRAP_WH='W-07' · REG='IT-RM-REG' · SCRAP_ITEMS
   ROUTES for the new screens (owned by the module agents): mfg-flow mfg/flow · mfg-formulas mfg/formulas[/MX-id] · mfg-scrap mfg/scrap
     scm-desk scm/desk · scm-issues scm/issues[/MIR-id] · scm-fgreceipts scm/fg-receipts
*/
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP, C = SA.catalog;
  if (!ERP || !ERP.flow) return;
  const st = SA.store, F = ERP.flow, K = ERP.stock, GL = ERP.gl;
  const get = (p) => st.get(p) || [];
  const me = () => SA.session.userId || 'SYSTEM';
  const audit = (code, o) => { try { SA.audit(code, o); } catch (e) { console.error(e); } };
  const notify = (o) => { try { SA.notify(o); } catch (e) { /* noop */ } };
  const r2 = (n) => Math.round(n * 100) / 100;
  const FX = (ERP.factory = {});

  /* ═════════════ 1. CATALOG ═════════════ */
  const A = { v: ['view', 'عرض'], c: ['create', 'إنشاء'], e: ['edit', 'تعديل'], a: ['approve', 'اعتماد'] };
  const acts = (s) => s.split(',').map((k) => (A[k] ? A[k] : k.split(':')));
  const ep = (app, res, label, group, actions) => ({ app, res, label, group, actions: acts(actions), tag: 'new' });
  C.perms.push(
    ep('mfg', 'flow', 'مسار التصنيع والمراحل (لحظي)', 'mfg-exec', 'v'),
    ep('mfg', 'scrap', 'الهوالك وإعادة التدوير', 'mfg-exec', 'v,c,recycle:طحن وإعادة تدوير,sell:طلب بيع هوالك'),
    ep('mfg', 'formulas', 'الخلطات الكيميائية (13 تركيبة)', 'mfg-eng', 'v,e'),
    ep('scm', 'desk', 'مكتب أمين المخزن', 'scm-dash', 'v'),
    ep('scm', 'issues', 'أذون صرف الخامات للإنتاج', 'scm-inv', 'v,c,issue:صرف من المخزن'),
    ep('scm', 'fgreceipts', 'استلام الإنتاج التام', 'scm-inv', 'v,receive:استلام في المخزن')
  );
  C.rebuildPermKeys();
  C.approvalTypes.scrap_sale = { label: 'بيع هوالك', area: 'mfg', icon: 'coins' };
  [['STAGE.REPORTED', 'تسجيل إنتاج مرحلة', 'info', 'mfg'], ['SCRAP.LOGGED', 'تسجيل هالك', 'info', 'mfg'], ['SCRAP.GROUND', 'طحن هوالك (إعادة تدوير)', 'medium', 'mfg'],
    ['SCRAP.SALE_REQUESTED', 'طلب بيع هوالك', 'medium', 'mfg'], ['SCRAP.SOLD', 'تسليم هوالك مباعة', 'high', 'mfg'], ['FORMULA.UPDATED', 'تعديل خلطة كيميائية', 'high', 'mfg'],
    ['MIR.CREATED', 'طلب صرف خامات للإنتاج', 'info', 'scm'], ['MIR.ISSUED', 'صرف خامات من المخزن للإنتاج', 'medium', 'scm'], ['FG.RECEIVED', 'استلام إنتاج تام في المخزن', 'medium', 'scm']
  ].forEach((a) => C.addAudit(a[0], a[1], a[2], a[3]));
  const S = (o) => o;
  Object.assign(C.status, {
    mir: S({ pending: ['بانتظار الصرف', 'warning'], partial: ['صرف جزئي', 'info'], issued: ['تم الصرف', 'success'], cancelled: ['ملغى', 'neutral'] }),
    fgr: S({ pending: ['بانتظار استلام المخزن', 'warning'], received: ['تم الاستلام', 'success'] }),
    stage: S({ waiting: ['لم يصلها شغل', 'neutral'], ready: ['جاهز للتشغيل', 'info'], active: ['جاري', 'info'], done: ['انتهت', 'success'] }),
    scrapsale: S({ pending_approval: ['بانتظار اعتماد المالية', 'warning'], approved: ['معتمد — جاهز للتسليم', 'info'], sold: ['تم البيع والتسليم', 'success'], rejected: ['مرفوض', 'danger'] })
  });
  C.status.wo.released = ['مُطلق للتشغيل', 'info'];
  if (C.auditByCode && C.auditByCode['WO.RELEASED']) C.auditByCode['WO.RELEASED'].label = 'إطلاق أمر تشغيل وطلب صرف الخامات';
  Object.assign(C.personas, {
    whin: { label: 'أمين مخزن الخامات', desc: 'يستلم الخامات من الموردين ويصرفها للخلاطة · الهوالك والمطحون', icon: 'inbox', area: 'scm' },
    whout: { label: 'أمين مخزن المنتج التام', desc: 'يستلم الإنتاج التام بعد الجودة ويسلّم البضاعة للعملاء', icon: 'truck', area: 'scm' }
  });
  ERP.families.scrap = 'هوالك وإعادة تدوير';
  SA.icons.addMany({
    recycle: '<path d="M7 19H4.5a1.5 1.5 0 0 1-1.3-2.25L5.5 13"/><path d="M11 19h8.5a1.5 1.5 0 0 0 1.3-2.25L18.5 13"/><path d="M14 16l-3 3 3 3"/><path d="M8.5 7.5 10.7 3.8a1.5 1.5 0 0 1 2.6 0L16 8.5"/><path d="M13 8.5h3V5.5"/><path d="M5.5 13 3 11.5M5.5 13l1.5-2.5"/>',
    flow: '<rect x="3" y="4" width="6" height="5" rx="1.5"/><rect x="15" y="4" width="6" height="5" rx="1.5"/><rect x="9" y="15" width="6" height="5" rx="1.5"/><path d="M9 6.5h6M6 9v3.5h12V9M12 12.5V15"/>',
    scale: '<path d="M12 3v17M7 20h10M5 7h14"/><path d="M5 7 2.5 13a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/>',
    mixer: '<path d="M6 3h12l-1.5 9h-9z"/><path d="M12 12v4M8 21h8M10 16h4l1 5H9z"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>'
  });
  /** local calendar date 'YYYY-MM-DD' of an ISO time (scrap dates compare with ERP.day which is local) */
  FX.localDate = (iso) => { const d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ═════════════ 2. STAGES / ROUTES ═════════════ */
  FX.SCRAP_WH = 'W-07'; FX.REG = 'IT-RM-REG';
  FX.SCRAP_ITEMS = ['IT-SCR-GR', 'IT-SCR-DUST', 'IT-SCR-FILM'];
  /* [id, name, short, std kg%, cost share (of the finished unit), default scrap item, kg-focused (mixer/extruder), icon] */
  const STG = [
    ['ST-MIX', 'الخلاطة', 'خلط', 0.003, 0.3, 'IT-SCR-GR', true, 'mixer', 'وزن مكونات الخلطة حسب التركيبة ثم خلط ساخن/بارد — 3 خلاطات'],
    ['ST-EXT', 'السحب', 'سحب', 0.015, 0.42, 'IT-SCR-GR', true, 'factory', 'بثق بروفايل الضلفة والحلق من الخلطة — 3 ماكينات سحب'],
    ['ST-SAND', 'السنفرة', 'سنفرة', 0.006, 0.52, 'IT-SCR-DUST', false, 'layers', 'تجهيز سطح الضلفة'],
    ['ST-TRIM', 'الترويس', 'ترويس', 0.015, 0.58, 'IT-SCR-GR', false, 'scissors', 'ضبط أطوال وأطراف الضلفة'],
    ['ST-WOOD', 'تركيب الخشب', 'تركيب خشب', 0.003, 0.66, 'IT-SCR-GR', false, 'box', 'تركيب خشب التقوية لأماكن المفصلات والكالون'],
    ['ST-EDGE', 'الشريط', 'شريط', 0.004, 0.72, 'IT-SCR-GR', false, 'minus', 'لصق شريط الحرف'],
    ['ST-CLEAN', 'النضافة + المادة', 'نضافة', 0.002, 0.76, 'IT-SCR-GR', false, 'sparkle', 'تنضيف السطح ودهان المادة قبل اللمينيشن'],
    ['ST-LOCK', 'فتحة الكالون', 'كالون', 0.004, 0.8, 'IT-SCR-GR', false, 'key', 'تفريز فتحة الكالون'],
    ['ST-LAM', 'اللمينيشن', 'لمينيشن', 0.008, 0.92, 'IT-SCR-GR', false, 'layers', 'تلبيس فويل الديكور — للضلفة والحلق'],
    ['ST-DECOR', 'الديكور', 'ديكور', 0.008, 0.96, 'IT-SCR-GR', false, 'sparkle', 'للموديلات الديكور والديكور البارز فقط — السادة تعدّي على طول'],
    ['ST-CUT', 'تقطيع وتخريم', 'تقطيع وتخريم', 0.015, 0.9, 'IT-SCR-GR', false, 'scissors', 'تقطيع الحلق للمقاس وتخريم المفصلات'],
    ['ST-CLCUT', 'تبريد وقطع وتحزيم', 'قطع', 0.012, 0.9, 'IT-SCR-GR', false, 'scissors', 'خط التجاليد'],
    ['ST-FBCAL', 'درفلة وتبريد وقطع', 'درفلة', 0.015, 0.9, 'IT-SCR-GR', false, 'layers', 'خط الفوم بورد'],
    ['ST-QP', 'الجودة والتغليف', 'جودة وتغليف', 0.003, 1, 'IT-SCR-GR', false, 'checkcircle', 'فحص كل قطعة وتغليفها قبل الفحص النهائي والتسليم للمخزن']
  ];
  FX.STAGES = {}; STG.forEach((s, i) => { FX.STAGES[s[0]] = { id: s[0], name: s[1], short: s[2], stdPct: s[3], costShare: s[4], scrapItemId: s[5], kgFocus: s[6], icon: s[7], desc: s[8], order: i }; });
  FX.stage = (id) => FX.STAGES[id] || null;
  FX.stageName = (id) => (FX.STAGES[id] || {}).name || id || '—';
  FX.stdPct = (id) => (FX.STAGES[id] || {}).stdPct || 0;
  FX.TRACKS = { leaf: 'الضلفة', frame: 'الحلق', main: 'المنتج' };
  FX.FINISH = { plain: 'سادة', decor: 'ديكور', raised: 'ديكور بارز' };
  FX.finishType = (itemId) => { const it = ERP.item(itemId); return (it && it.attrs && it.attrs.finishType) || 'plain'; };
  const LEAF = ['ST-MIX', 'ST-EXT', 'ST-SAND', 'ST-TRIM', 'ST-WOOD', 'ST-EDGE', 'ST-CLEAN', 'ST-LOCK', 'ST-LAM'];
  const FRAME = ['ST-MIX', 'ST-EXT', 'ST-LAM', 'ST-CUT'];
  const famLine = { door: 'L-02', clad: 'L-03', foam: 'L-04' };
  const lineFor = (sid, fam) => (sid === 'ST-MIX' ? 'L-01' : fam === 'door' ? (sid === 'ST-EXT' ? 'L-01' : 'L-02') : famLine[fam] || 'L-02');
  /** route steps for a product → [{key, track, stageId, lineId}] (door = two tracks that meet at ST-QP) */
  FX.routeOf = function (itemId) {
    const it = ERP.item(itemId); const fam = it && it.family; const step = (track, sid) => ({ key: track + ':' + sid, track, stageId: sid, lineId: lineFor(sid, fam) });
    if (fam === 'door') return LEAF.concat(FX.finishType(itemId) === 'plain' ? [] : ['ST-DECOR']).map((s) => step('leaf', s)).concat(FRAME.map((s) => step('frame', s)), [step('main', 'ST-QP')]);
    if (fam === 'clad') return ['ST-MIX', 'ST-EXT', 'ST-CLCUT', 'ST-QP'].map((s) => step('main', s));
    if (fam === 'foam') return ['ST-MIX', 'ST-EXT', 'ST-FBCAL', 'ST-QP'].map((s) => step('main', s));
    return [];
  };
  FX.initStages = (wo) => FX.routeOf(wo.itemId).map((s, i) => Object.assign(s, { seq: (i + 1) * 10, good: 0, scrap: 0, scrapKg: 0, startedAt: null, lastAt: null, machineId: null }));
  const COMPOUND = ['IT-RM-PVC', 'IT-RM-WF', 'IT-RM-CC', 'IT-RM-STB', 'IT-RM-LUB', 'IT-RM-FOAM', 'IT-RM-ACR', 'IT-RM-PIG', 'IT-RM-REG'];
  FX.isCompound = (itemId) => COMPOUND.indexOf(itemId) >= 0;
  /** compound (خلطة) kg per finished unit, from the BOM */
  FX.compoundKg = (itemId) => r2(ERP.materialsFor(itemId, 1).filter((m) => FX.isCompound(m.itemId)).reduce((s, m) => s + m.qty, 0)) || 1;
  FX.compoundCostKg = (itemId) => { const ms = ERP.materialsFor(itemId || 'IT-D101-90-C132', 1).filter((m) => FX.isCompound(m.itemId)); const kg = ms.reduce((s, m) => s + m.qty, 0) || 1; return r2(ms.reduce((s, m) => s + m.qty * ((ERP.item(m.itemId) || {}).stdCost || 0), 0) / kg); };
  FX.trackShare = (track) => (track === 'leaf' ? 0.72 : track === 'frame' ? 0.28 : 1);
  FX.unitKg = (itemId, track) => r2(FX.compoundKg(itemId) * FX.trackShare(track));

  /** stages with computed flow: input (received from the previous stage of the same track), processed, avail (waiting here), status */
  FX.stageView = function (woOrId) {
    const wo = typeof woOrId === 'string' ? ERP.find('workOrders', woOrId) : woOrId; if (!wo) return [];
    const list = (wo.stages && wo.stages.length ? wo.stages : FX.initStages(Object.assign({}, wo))).map((s) => Object.assign({}, s));
    const issued = !!wo.issued || ['in_progress', 'qc_pending', 'completed', 'closed'].indexOf(wo.status) >= 0;
    const byTrack = {}; list.forEach((s) => { (byTrack[s.track] = byTrack[s.track] || []).push(s); });
    list.forEach((s) => {
      const tl = byTrack[s.track]; const i = tl.indexOf(s); const prev = i > 0 ? tl[i - 1] : null; s.processed = (s.good || 0) + (s.scrap || 0);
      if (prev) { s.input = prev.good || 0; s.prevKey = prev.key; }
      else if (s.track === 'main' && (byTrack.leaf || byTrack.frame)) { const L = byTrack.leaf ? byTrack.leaf[byTrack.leaf.length - 1] : null, Fr = byTrack.frame ? byTrack.frame[byTrack.frame.length - 1] : null; s.input = Math.min(L ? L.good || 0 : Infinity, Fr ? Fr.good || 0 : Infinity); s.merge = true; }
      else s.input = Math.max(issued ? wo.qty : 0, s.processed);
    });
    // second pass: status needs upstream status
    const done = {}; list.forEach((s) => {
      const tl = byTrack[s.track]; const i = tl.indexOf(s); const prev = i > 0 ? tl[i - 1] : null;
      const upDone = prev ? done[prev.key] : s.merge ? ['leaf', 'frame'].every((t) => !byTrack[t] || done[byTrack[t][byTrack[t].length - 1].key]) : issued;
      s.avail = Math.max(0, s.input - s.processed); s.name = FX.stageName(s.stageId); s.std = FX.stdPct(s.stageId);
      s.status = s.processed > 0 ? (upDone && s.avail === 0 ? 'done' : 'active') : s.avail > 0 ? 'ready' : upDone && s.input === 0 && ['completed', 'closed', 'qc_pending'].indexOf(wo.status) >= 0 ? 'done' : 'waiting';
      done[s.key] = s.status === 'done';
    });
    return list;
  };
  FX.isComplete = (wo) => { const v = FX.stageView(wo); return v.length > 0 && v.every((s) => s.status === 'done'); };

  /** operator / supervisor reports a stage: good passes to the next stage, scrap (pieces) leaves the flow, scrapKg = weight (default pieces × unit kg) */
  FX.reportStage = function (woId, key, o) {
    o = o || {}; const wo = ERP.find('workOrders', woId); if (!wo) return { ok: false, reason: 'أمر التشغيل غير موجود' };
    if (['released', 'in_progress'].indexOf(wo.status) < 0) return { ok: false, reason: 'الأمر ليس قيد التشغيل' };
    if (!wo.issued) return { ok: false, reason: 'لم تُصرف الخامات بعد — إذن الصرف عند أمين مخزن الخامات' };
    const view = FX.stageView(wo); const s = view.find((x) => x.key === key); if (!s) return { ok: false, reason: 'مرحلة غير موجودة' };
    const good = Math.max(0, Number(o.good) || 0), scrap = Math.max(0, Number(o.scrap) || 0);
    const kg = o.scrapKg != null && o.scrapKg !== '' ? Math.max(0, Number(o.scrapKg) || 0) : r2(scrap * FX.unitKg(wo.itemId, s.track));
    if (good + scrap > s.avail + 1e-9) return { ok: false, reason: 'الكمية أكبر من المتاح عند المرحلة (' + s.avail + ')' };
    if (good + scrap <= 0 && kg <= 0) return { ok: false, reason: 'أدخل كمية سليمة أو هالك' };
    if ((scrap > 0 || kg > 0) && !o.reasonId) return { ok: false, reason: 'اختر سبب الهالك' };
    const isFinal = s.stageId === 'ST-QP'; const now = ERP.now(); const shift = o.shift || shiftNow();
    st.patch('workOrders', woId, (w) => {
      if (!w.stages || !w.stages.length) w.stages = FX.initStages(Object.assign({}, w));
      const x = w.stages.find((y) => y.key === key); x.good = (x.good || 0) + good; x.scrap = (x.scrap || 0) + scrap; x.scrapKg = r2((x.scrapKg || 0) + kg); x.startedAt = x.startedAt || now; x.lastAt = now; if (o.machineId) x.machineId = o.machineId;
      w.scrapKg = r2((w.scrapKg || 0) + kg); w.shift = shift;
      if (!isFinal) { w.qtyScrap = (w.qtyScrap || 0) + scrap; w.reports = w.reports || []; w.reports.unshift({ at: now, by: me(), good, scrap, kg, stage: key, shift }); }
      if (w.status === 'released') w.status = 'in_progress'; if (!w.actualStart) w.actualStart = now;
    });
    if (isFinal && (good > 0 || scrap > 0)) { F.reportWO(woId, good, scrap); st.patch('workOrders', woId, (w) => { if (w.reports && w.reports[0]) Object.assign(w.reports[0], { stage: key, kg, shift }); }); }
    let log = null;
    if (scrap > 0 || kg > 0) log = FX.logScrap({ woId, itemId: wo.itemId, stageId: s.stageId, track: s.track, lineId: s.lineId, machineId: o.machineId || null, shift, qty: scrap, kg, reasonId: o.reasonId, note: o.note || '' });
    audit('STAGE.REPORTED', { target: { type: 'work_order', id: woId, label: ERP.itemName(wo.itemId) }, after: { stage: s.name + (s.track !== 'main' ? ' — ' + FX.TRACKS[s.track] : ''), good, scrap, kg } });
    let w2 = ERP.find('workOrders', woId); let completed = false;
    if (!w2.qcId && w2.status !== 'qc_pending' && (w2.qtyDone || 0) > 0 && FX.isComplete(w2)) { completeShort(w2); w2 = ERP.find('workOrders', woId); }
    completed = w2.status === 'qc_pending';
    return { ok: true, wo: w2, log, completed, final: isFinal };
  };
  /** all stages finished but scrap left fewer units than ordered → close production with a shortfall and send to final QC */
  function completeShort(w) {
    const short = Math.max(0, w.qty - (w.qtyDone || 0));
    const v = FX.stageView(w); const lastOf = (t) => v.filter((x) => x.track === t).pop(); const lf = lastOf('leaf'), fr = lastOf('frame'), qp = v.find((x) => x.stageId === 'ST-QP');
    const spareFrames = lf && fr && qp ? Math.max(0, (fr.good || 0) - (qp.input || 0)) : 0; // frames made beyond the leaves → kept as spare parts (counted, not lost)
    const qc = F.createQC({ kind: 'final', refType: 'work_order', refId: w.id, itemId: w.itemId, qty: w.qtyDone, lot: w.lot });
    st.patch('workOrders', w.id, { status: 'qc_pending', qcId: qc.id, actualEnd: ERP.now(), shortfall: short, spareFrames });
    const ln = ERP.line(w.lineId); if (ln && ln.currentWoId === w.id) st.patch('lines', w.lineId, { currentWoId: null });
    notify({ title: 'فحص نهائي مطلوب: ' + w.id, body: ERP.itemName(w.itemId) + ' — ' + w.qtyDone + ' وحدة بانتظار الجودة' + (short ? ' (عجز ' + short + ' بسبب الهوالك)' : '') + '.', level: 'action', to: ['R-09'], link: '#/mfg/qc/' + qc.id });
    if (short) notify({ title: 'عجز ' + short + ' وحدة في ' + w.id, body: 'الهوالك خلّت الكمية أقل من المطلوب' + (w.soId ? ' لأمر البيع ' + w.soId : '') + ' — اعمل أمر تشغيل تكميلي.', level: 'action', to: ['R-05'], link: '#/mfg/workorders/' + w.id });
  }
  function shiftNow() { const hr = new Date().getHours(); return hr >= 7 && hr < 15 ? 'A' : hr >= 15 && hr < 23 ? 'B' : 'C'; }

  /** pieces waiting at a stage across all open work orders */
  FX.wipAt = (stageId) => get('workOrders').filter((w) => ['released', 'in_progress', 'on_hold'].indexOf(w.status) >= 0).reduce((s, w) => s + FX.stageView(w).filter((x) => x.stageId === stageId).reduce((a, x) => a + x.avail, 0), 0);
  FX.machinesOf = (stageId, lineId) => get('machines').filter((m) => m.stageId === stageId && (!lineId || m.lineId === lineId || (stageId === 'ST-MIX' && m.lineId === 'L-01')));

  /* ═════════════ 3. SCRAP (الهوالك) ═════════════ */
  const RS = [
    ['R01', 'بداية تشغيل / تسخين (Start-up)', ['ST-EXT', 'ST-CLCUT', 'ST-FBCAL'], null, true], ['R02', 'تنظيف / تغيير لون (Purge)', ['ST-MIX', 'ST-EXT'], null, true],
    ['R03', 'خلطة خارج المواصفة', ['ST-MIX'], null, false], ['R04', 'فقاعات / مسامية', ['ST-EXT', 'ST-LAM', 'ST-FBCAL'], null, false], ['R05', 'انحناء / عدم استقامة', ['ST-EXT', 'ST-CLCUT'], null, false],
    ['R06', 'تراب سنفرة (طبيعي)', ['ST-SAND'], 'IT-SCR-DUST', true], ['R07', 'سنفرة زائدة / خدوش', ['ST-SAND', 'ST-QP'], null, false],
    ['R08', 'قصاصات أطراف (طبيعي)', ['ST-TRIM', 'ST-CUT', 'ST-CLCUT', 'ST-FBCAL'], null, true], ['R09', 'قص خارج المقاس', ['ST-TRIM', 'ST-CUT', 'ST-CLCUT', 'ST-FBCAL'], null, false],
    ['R10', 'كسر / شرخ', ['ST-EXT', 'ST-WOOD', 'ST-LOCK', 'ST-DECOR', 'ST-QP'], null, false], ['R11', 'شريط منفصل / هالك شريط', ['ST-EDGE'], 'IT-SCR-FILM', false],
    ['R12', 'تلوث سطح', ['ST-CLEAN', 'ST-LAM'], null, false], ['R13', 'فتحة كالون في غير مكانها', ['ST-LOCK'], null, false], ['R14', 'انفصال فويل', ['ST-LAM', 'ST-QP'], null, false],
    ['R15', 'هالك فويل (أطراف رول — طبيعي)', ['ST-LAM'], 'IT-SCR-FILM', true], ['R16', 'اختلاف لون', ['ST-EXT', 'ST-LAM', 'ST-QP'], null, false], ['R17', 'خطأ حفر / تصميم ديكور', ['ST-DECOR'], null, false],
    ['R18', 'تخريم خاطئ', ['ST-CUT'], null, false], ['R19', 'عطل ماكينة مفاجئ', null, null, false], ['R20', 'رفض في فحص الجودة والتغليف', ['ST-QP'], null, false]
  ];
  FX.REASONS = RS.map((r) => ({ id: r[0], label: r[1], stages: r[2], scrapItemId: r[3], normal: r[4] }));
  FX.reason = (id) => FX.REASONS.find((r) => r.id === id) || null;
  FX.reasonLabel = (id) => (FX.reason(id) || {}).label || id || '—';
  FX.reasonsFor = (stageId) => FX.REASONS.filter((r) => !r.stages || r.stages.indexOf(stageId) >= 0);
  FX.scrapAvail = (itemId) => Math.max(0, K.qty(itemId, FX.SCRAP_WH) - get('scrapSales').filter((s) => s.status === 'pending_approval' || s.status === 'approved').reduce((a, s) => a + s.lines.filter((l) => l.itemId === itemId).reduce((b, l) => b + l.kg, 0), 0));
  /** one scrap record → stock into W-07 (by kg) + GL: Dr 1145 recoverable + Dr 5204 loss / Cr 1142 WIP */
  FX.logScrap = function (o) {
    const s = FX.stage(o.stageId) || {}; const rs = FX.reason(o.reasonId) || {}; const it = ERP.item(o.itemId) || {};
    const scrapItemId = rs.scrapItemId || s.scrapItemId || 'IT-SCR-GR'; const sItem = ERP.item(scrapItemId) || {};
    const kg = r2(Number(o.kg) || 0), qty = Number(o.qty) || 0;
    const cost = Math.round(qty > 0 ? qty * (it.stdCost || 0) * FX.trackShare(o.track) * (s.costShare || 1) : kg * FX.compoundCostKg(o.itemId));
    const recoverable = Math.min(cost, Math.round(kg * (sItem.stdCost || 0)));
    const at = o.at || ERP.now();
    const rec = { id: ERP.no('SCR', 5), at, date: FX.localDate(at), woId: o.woId || null, itemId: o.itemId || null, stageId: o.stageId, track: o.track || 'main', lineId: o.lineId || null, machineId: o.machineId || null, shift: o.shift || shiftNow(),
      qty, kg, reasonId: o.reasonId || null, scrapItemId, normal: !!rs.normal, cost, recoverable, by: me(), note: o.note || '' };
    st.insert('scrapLogs', rec, true);
    if (kg > 0) K.move({ itemId: scrapItemId, whId: FX.SCRAP_WH, qty: kg, type: 'scrap', ref: { type: 'scrap', id: rec.id }, note: 'هالك ' + (s.name || '') + ' — ' + (rs.label || '') + (o.woId ? ' (' + o.woId + ')' : '') });
    if (cost > 0) GL.post({ memo: 'هالك ' + (s.name || '') + (o.woId ? ' — ' + o.woId : '') + ' (' + ERP.fmt.num(kg, 1) + ' كجم)', ref: { type: 'scrap', id: rec.id }, lines: [{ acc: '1145', dr: recoverable }, { acc: '5204', dr: cost - recoverable }, { acc: '1142', cr: cost }] });
    audit('SCRAP.LOGGED', { target: { type: 'scrap', id: rec.id, label: (s.name || '') + ' — ' + ERP.itemName(o.itemId) }, after: { qty, kg, reason: rs.label || '', cost } });
    checkAlert(o.stageId);
    return rec;
  };
  /** today's scrap rate at a stage vs its standard → one alert per stage per day to the production manager */
  function checkAlert(stageId) {
    const t = ERP.day(0); const logs = get('scrapLogs').filter((l) => l.stageId === stageId && l.date === t); const kg = logs.reduce((s, l) => s + l.kg, 0);
    const procKg = get('workOrders').reduce((s, w) => s + (w.stages || []).filter((x) => x.stageId === stageId && x.lastAt && x.lastAt.slice(0, 10) === t).reduce((a, x) => a + ((x.good || 0) + (x.scrap || 0)) * FX.unitKg(w.itemId, x.track), 0), 0);
    if (procKg < 200) return; const rate = kg / (procKg + kg); const std = FX.stdPct(stageId); if (rate <= std * 1.5) return;
    const flag = 'meta.scrapAlert.' + stageId; if (st.get(flag) === t) return; st.set(flag, t);
    notify({ title: 'هالك ' + FX.stageName(stageId) + ' أعلى من المسموح', body: 'اليوم ' + ERP.fmt.pct(rate, 1) + ' مقابل مسموح ' + ERP.fmt.pct(std, 1) + ' — راجع الماكينة والمشغّل.', level: 'urgent', to: ['R-05', 'R-01'], link: '#/mfg/scrap' });
  }
  /** grinder M-502: grindable scrap → regrind (3% loss) back to the mixer. GL Dr 1141 + Dr 5204 (loss) / Cr 1145 */
  FX.grind = function (kgIn, o) {
    o = o || {}; kgIn = r2(Number(kgIn) || 0); const avail = FX.scrapAvail('IT-SCR-GR');
    if (kgIn <= 0) return { ok: false, reason: 'أدخل الوزن بالكيلو' }; if (kgIn > avail + 1e-9) return { ok: false, reason: 'المتاح للطحن ' + ERP.fmt.num(avail, 1) + ' كجم فقط' };
    const out = r2(kgIn * 0.97); const id = ERP.no('RG'); const vIn = Math.round(kgIn * ((ERP.item('IT-SCR-GR') || {}).stdCost || 0)), vOut = Math.round(out * ((ERP.item(FX.REG) || {}).stdCost || 0));
    K.move({ itemId: 'IT-SCR-GR', whId: FX.SCRAP_WH, qty: -kgIn, type: 'issue', ref: { type: 'regrind', id }, note: 'طحن بالكسارة M-502' });
    K.move({ itemId: FX.REG, whId: FX.SCRAP_WH, qty: out, type: 'production', ref: { type: 'regrind', id }, note: 'مطحون ناتج من الطحن — يرجع للخلاطة' });
    GL.post({ memo: 'طحن هوالك ' + id + ' (' + ERP.fmt.num(kgIn, 1) + ' كجم)', ref: { type: 'regrind', id }, lines: [{ acc: '1141', dr: vOut }, { acc: '5204', dr: Math.max(0, vIn - vOut) }, { acc: '1145', cr: vIn }, { acc: '5204', cr: Math.max(0, vOut - vIn) }] });
    const rec = { id, kind: 'grind', at: ERP.now(), kgIn, kgOut: out, machineId: 'M-502', by: me(), note: o.note || '' };
    st.insert('scrapOps', rec, true);
    audit('SCRAP.GROUND', { target: { type: 'regrind', id, label: 'طحن هوالك' }, after: { kgIn, kgOut: out } });
    return { ok: true, rec };
  };
  /** scrap sale request → approval by the finance manager (R-22). Stock leaves only on delivery after approval. */
  FX.requestScrapSale = function (o) {
    const lines = (o.lines || []).map((l) => ({ itemId: l.itemId, kg: r2(Number(l.kg) || 0), price: Number(l.price) || 0 })).filter((l) => l.kg > 0);
    if (!lines.length) return { ok: false, reason: 'أدخل الكميات' }; if (!o.buyer) return { ok: false, reason: 'اكتب اسم المشتري' };
    const over = lines.find((l) => l.kg > FX.scrapAvail(l.itemId) + 1e-9); if (over) return { ok: false, reason: 'رصيد ' + ERP.itemName(over.itemId) + ' المتاح ' + ERP.fmt.num(FX.scrapAvail(over.itemId), 1) + ' كجم' };
    const total = Math.round(lines.reduce((s, l) => s + l.kg * l.price, 0)); const book = Math.round(lines.reduce((s, l) => s + l.kg * ((ERP.item(l.itemId) || {}).stdCost || 0), 0));
    const sale = { id: ERP.no('SS'), at: ERP.now(), buyer: o.buyer, phone: o.phone || '', lines, total, bookValue: book, status: 'pending_approval', approvalId: null, by: me(), note: o.note || '', soldAt: null, soldBy: null };
    st.insert('scrapSales', sale, true);
    const ap = SA.requestApproval({ type: 'scrap_sale', area: 'mfg', title: 'بيع هوالك ' + sale.id + ' — ' + sale.buyer, amount: total, chain: [{ roleId: 'R-22', label: 'المدير المالي' }],
      context: [['المشتري', sale.buyer], ['الكميات', lines.map((l) => ERP.itemName(l.itemId) + ' ' + ERP.fmt.num(l.kg) + ' كجم × ' + l.price + ' ج.م').join(' · ')], ['قيمة البيع', ERP.fmt.money(total)], ['القيمة الدفترية', ERP.fmt.money(book)], ['ملاحظة', 'الهوالك القابلة للطحن ترجع الخلاطة أولًا — البيع للزيادة فقط']], ref: { type: 'scrap_sale', id: sale.id } });
    st.patch('scrapSales', sale.id, { approvalId: ap.id });
    audit('SCRAP.SALE_REQUESTED', { target: { type: 'scrap_sale', id: sale.id, label: sale.buyer }, after: { total, kg: lines.reduce((s, l) => s + l.kg, 0) } });
    return { ok: true, sale: ERP.find('scrapSales', sale.id) };
  };
  ERP.onApproval('scrap_sale', (a) => {
    const s = ERP.find('scrapSales', a.ref.id); if (!s || s.approvalId !== a.id || s.status !== 'pending_approval') return;
    if (a.status === 'approved') { st.patch('scrapSales', s.id, { status: 'approved', approvedAt: ERP.now() }); notify({ title: 'تم اعتماد بيع الهوالك ' + s.id, body: s.buyer + ' — سلّم الكمية بعد الوزن وحصّل ' + ERP.fmt.money(s.total) + '.', level: 'action', to: ['R-23', 'R-06'], link: '#/mfg/scrap' }); }
    else if (a.status === 'rejected') st.patch('scrapSales', s.id, { status: 'rejected' });
  });
  /** hand the approved scrap to the buyer: stock out of W-07 + GL Dr 1101 / Cr 1145 book / Cr 4201 gain */
  FX.deliverScrapSale = function (id) {
    const s = ERP.find('scrapSales', id); if (!s || s.status !== 'approved') return { ok: false, reason: 'البيع غير معتمد' };
    const short = s.lines.find((l) => l.kg > K.qty(l.itemId, FX.SCRAP_WH) + 1e-9); if (short) return { ok: false, reason: 'رصيد ' + ERP.itemName(short.itemId) + ' لا يكفي' };
    s.lines.forEach((l) => K.move({ itemId: l.itemId, whId: FX.SCRAP_WH, qty: -l.kg, type: 'delivery', ref: { type: 'scrap_sale', id }, note: 'بيع هوالك — ' + s.buyer }));
    const gain = s.total - s.bookValue;
    GL.post({ memo: 'بيع هوالك ' + id + ' — ' + s.buyer, ref: { type: 'scrap_sale', id }, lines: [{ acc: '1101', dr: s.total }, { acc: '4201', dr: Math.max(0, -gain) }, { acc: '1145', cr: s.bookValue }, { acc: '4201', cr: Math.max(0, gain) }] });
    st.patch('scrapSales', id, { status: 'sold', soldAt: ERP.now(), soldBy: me() });
    audit('SCRAP.SOLD', { target: { type: 'scrap_sale', id, label: s.buyer }, after: { total: s.total } });
    return { ok: true };
  };
  /** aggregates for dashboards: {from, to} 'YYYY-MM-DD' or {days} → {kg, qty, cost, recoverable, byStage:{id:{kg, qty, cost, n}}, byReason, byLine, byDay:{date:kg}, byMachine, abnormalKg} */
  FX.scrapStats = function (o) {
    o = o || {}; const to = o.to || ERP.day(0); const from = o.from || ERP.day(-((o.days || 30) - 1));
    const out = { kg: 0, qty: 0, cost: 0, recoverable: 0, abnormalKg: 0, byStage: {}, byReason: {}, byLine: {}, byDay: {}, byMachine: {}, n: 0 };
    const add = (m, k, l) => { if (!k) return; const x = (m[k] = m[k] || { kg: 0, qty: 0, cost: 0, n: 0 }); x.kg += l.kg; x.qty += l.qty; x.cost += l.cost; x.n++; };
    get('scrapLogs').forEach((l) => { if (l.date < from || l.date > to) return; out.n++; out.kg += l.kg; out.qty += l.qty; out.cost += l.cost; out.recoverable += l.recoverable; if (!l.normal) out.abnormalKg += l.kg;
      add(out.byStage, l.stageId, l); add(out.byReason, l.reasonId, l); add(out.byLine, l.lineId, l); add(out.byMachine, l.machineId, l); out.byDay[l.date] = (out.byDay[l.date] || 0) + l.kg; });
    out.kg = r2(out.kg); return out;
  };

  /* ═════════════ 4. FORMULAS + MATERIAL ISSUE (إذن صرف للخلاطة) ═════════════ */
  FX.formula = (id) => ERP.find('formulas', id);
  FX.formulasFor = function (itemId) {
    const it = ERP.item(itemId) || {}; const a = it.attrs || {};
    if (it.family === 'door') { const f = FX.finishType(itemId); return [{ track: 'leaf', formulaId: f === 'raised' ? 'MX-03' : f === 'decor' ? 'MX-02' : 'MX-01' }, { track: 'frame', formulaId: (a.width || 90) >= 110 ? 'MX-05' : 'MX-04' }]; }
    if (it.family === 'clad') return [{ track: 'main', formulaId: 'MX-06' }];
    if (it.family === 'foam') { const t = a.thickness || 10; return [{ track: 'main', formulaId: t <= 6 ? 'MX-08' : t <= 12 ? 'MX-09' : 'MX-10' }]; }
    return [];
  };
  const DEST = { 'IT-RM-FILM': 'ST-LAM', 'IT-RM-GLUE': 'ST-LAM', 'IT-RM-WOOD': 'ST-WOOD', 'IT-RM-EDGE': 'ST-EDGE', 'IT-RM-MAT': 'ST-CLEAN' };
  FX.destOf = (itemId) => { if (FX.isCompound(itemId)) return 'ST-MIX'; if (DEST[itemId]) return DEST[itemId]; return 'ST-QP'; };
  /** material issue request for a released WO (lines from the BOM; part of the virgin PVC is replaced by regrind from W-07 up to the formula's max %) */
  FX.createMIR = function (woId, o) {
    o = o || {}; const wo = ERP.find('workOrders', woId); if (!wo) return null;
    const mats = F.woMaterials(woId); const compoundKg = r2(mats.filter((m) => FX.isCompound(m.itemId)).reduce((s, m) => s + m.need, 0));
    const fms = FX.formulasFor(wo.itemId).map((f) => { const fm = FX.formula(f.formulaId) || {}; const kg = r2(compoundKg * FX.trackShare(f.track)); return { track: f.track, formulaId: f.formulaId, kg, batches: Math.max(1, Math.ceil(kg / (fm.batchKg || 250))), regMaxPct: fm.regMaxPct || 0 }; });
    const regCap = fms.reduce((s, f) => s + f.kg * f.regMaxPct, 0); const pvc = mats.find((m) => m.itemId === 'IT-RM-PVC');
    const regKg = Math.floor(Math.min(regCap, K.available(FX.REG, FX.SCRAP_WH), pvc ? pvc.need * 0.25 : 0));
    const lines = mats.map((m) => ({ itemId: m.itemId, qty: r2(o.force ? Math.min(m.need, m.avail) : m.need), issuedQty: 0, dest: FX.destOf(m.itemId), whId: K.defaultWh(m.itemId) }));
    if (regKg > 0) { const p = lines.find((l) => l.itemId === 'IT-RM-PVC'); if (p) p.qty = r2(Math.max(0, p.qty - regKg)); lines.push({ itemId: FX.REG, qty: regKg, issuedQty: 0, dest: 'ST-MIX', whId: FX.SCRAP_WH }); }
    const so = wo.soId ? ERP.find('salesOrders', wo.soId) : null;
    const mir = { id: ERP.no('MIR'), woId, itemId: wo.itemId, qtyUnits: wo.qty, lot: wo.lot, lines: lines.filter((l) => l.qty > 0), formulas: fms, compoundKg, regKg, status: 'pending', priority: wo.priority || 'normal', soId: wo.soId || null,
      requestedBy: me(), requestedAt: ERP.now(), issuedBy: null, issuedAt: null, value: 0, note: so && so.export ? 'تصدير — أولوية' : '' };
    st.insert('issueRequests', mir, true);
    audit('MIR.CREATED', { target: { type: 'mir', id: mir.id, label: ERP.itemName(wo.itemId) }, after: { wo: woId, lines: mir.lines.length, compoundKg } });
    notify({ title: 'إذن صرف جديد للخلاطة: ' + mir.id, body: woId + ' — ' + ERP.itemName(wo.itemId) + ' × ' + wo.qty + ' · ' + fms.map((f) => f.formulaId + ' (' + f.batches + ' خلطة)').join(' + '), level: 'action', to: ['R-23', 'R-06'], link: '#/scm/issues/' + mir.id });
    return mir;
  };
  /** storekeeper issues (all remaining, or o.lines [{itemId, qty}]) → stock out of RM/W-07, GL Dr 1142 / Cr 1141, WO.issued */
  FX.issueMIR = function (mirId, o) {
    o = o || {}; const mir = ERP.find('issueRequests', mirId); if (!mir || ['pending', 'partial'].indexOf(mir.status) < 0) return { ok: false, reason: 'الإذن ليس بانتظار الصرف' };
    let val = 0; const short = []; const want = {}; (o.lines || []).forEach((l) => { want[l.itemId] = Number(l.qty) || 0; });
    const lines = mir.lines.map((l) => {
      const rem = r2(l.qty - (l.issuedQty || 0)); let q = o.lines ? Math.min(rem, want[l.itemId] || 0) : rem; const av = K.available(l.itemId, l.whId);
      if (q > av) { short.push({ itemId: l.itemId, need: q, avail: av }); q = av; } q = r2(Math.max(0, q)); if (q <= 0) return l;
      K.move({ itemId: l.itemId, whId: l.whId, qty: -q, type: 'issue', ref: { type: 'mir', id: mirId }, note: 'إذن صرف ' + mirId + ' ← ' + FX.stageName(l.dest) + ' (' + mir.woId + ')', lot: mir.lot });
      val += q * ((ERP.item(l.itemId) || {}).stdCost || 0); return Object.assign({}, l, { issuedQty: r2((l.issuedQty || 0) + q) });
    });
    if (val <= 0) return { ok: false, reason: 'لا يوجد رصيد للصرف', short };
    const all = lines.every((l) => l.issuedQty >= l.qty - 0.01); const status = all ? 'issued' : 'partial';
    st.patch('issueRequests', mirId, (m) => { const now = ERP.now(); m.lines = lines; m.status = status; m.issuedBy = m.issuedBy || me(); m.issuedAt = m.issuedAt || now; m.lastIssuedAt = now; m.value = Math.round((m.value || 0) + val); m.issues = (m.issues || []).concat([{ at: now, by: me(), value: Math.round(val), status }]); });
    GL.post({ memo: 'صرف خامات للإنتاج ' + mirId + ' — ' + mir.woId, ref: { type: 'mir', id: mirId }, lines: [{ acc: '1142', dr: val }, { acc: '1141', cr: val }] });
    const mixOk = lines.filter((l) => l.dest === 'ST-MIX').some((l) => l.issuedQty > 0);
    st.patch('workOrders', mir.woId, (w) => { if (mixOk) w.issued = true; w.issuedValue = Math.round((w.issuedValue || 0) + val); w.issuedAt = w.issuedAt || ERP.now(); if (!w.stages || !w.stages.length) w.stages = FX.initStages(Object.assign({}, w)); });
    audit('MIR.ISSUED', { target: { type: 'mir', id: mirId, label: ERP.itemName(mir.itemId) }, after: { status, value: Math.round(val), wo: mir.woId } });
    notify({ title: 'الخامات اتصرفت للخلاطة — ' + mir.woId, body: mirId + (status === 'partial' ? ' (صرف جزئي — فيه نقص)' : '') + ' · ابدأ التشغيل.', level: 'action', to: ['R-05', 'R-14'], link: '#/mfg/workorders/' + mir.woId });
    return { ok: true, status, value: Math.round(val), short };
  };

  /* ═════════════ 5. FINISHED GOODS RECEIPT (أمين مخزن المنتج التام) ═════════════ */
  FX.createFGR = function (o) {
    const wo = ERP.find('workOrders', o.woId) || {};
    const r = { id: ERP.no('FGR'), woId: o.woId, qcId: o.qcId || null, itemId: o.itemId, qty: o.qty, lot: o.lot || wo.lot || null, soId: wo.soId || null, status: 'pending', createdAt: ERP.now(), createdBy: me(), receivedAt: null, receivedBy: null, receivedQty: null, note: '' };
    st.insert('fgReceipts', r, true);
    notify({ title: 'إنتاج تام جاهز للاستلام: ' + r.id, body: ERP.itemName(r.itemId) + ' × ' + r.qty + ' — بعد الفحص النهائي ' + (o.qcId || '') + (r.soId ? ' · لأمر البيع ' + r.soId : ''), level: 'action', to: ['R-24', 'R-06'], link: '#/scm/fg-receipts' });
    return r;
  };
  /** storekeeper counts and receives → stock into FG (W-01) + GL Dr 1143 / Cr 1142 + re-reserve the sales order */
  FX.receiveFG = function (id, o) {
    o = o || {}; const r = ERP.find('fgReceipts', id); if (!r || r.status !== 'pending') return { ok: false, reason: 'الإذن ليس بانتظار الاستلام' };
    const q = o.qty != null && o.qty !== '' ? Math.min(r.qty, Math.max(0, Number(o.qty) || 0)) : r.qty; if (q <= 0) return { ok: false, reason: 'أدخل الكمية المستلمة' };
    if (q < r.qty && !o.note) return { ok: false, reason: 'اكتب سبب فرق الاستلام' };
    const cost = (ERP.item(r.itemId) || {}).stdCost || 0;
    K.move({ itemId: r.itemId, whId: K.FG, qty: q, type: 'production', ref: { type: 'fgr', id }, note: 'استلام إنتاج تام ' + id + ' من ' + r.woId, lot: r.lot });
    GL.post({ memo: 'استلام إنتاج تام ' + id + ' — ' + r.woId, ref: { type: 'fgr', id }, lines: [{ acc: '1143', dr: q * cost }, { acc: '1142', cr: q * cost }] });
    st.patch('fgReceipts', id, { status: 'received', receivedAt: ERP.now(), receivedBy: me(), receivedQty: q, note: o.note || '' });
    if (q < r.qty) st.patch('workOrders', r.woId, (w) => { w.receiptShort = (w.receiptShort || 0) + (r.qty - q); });
    audit('FG.RECEIVED', { target: { type: 'fgr', id, label: ERP.itemName(r.itemId) }, after: { qty: q, wo: r.woId } });
    if (r.soId) F.refreshOrder(r.soId);
    return { ok: true, qty: q, so: r.soId ? ERP.find('salesOrders', r.soId) : null };
  };

  /* default warehouses: scrap + regrind live in W-07 */
  const baseWh = K.defaultWh;
  K.defaultWh = (item) => { const it = typeof item === 'string' ? ERP.item(item) : item; if (it && (it.kind === 'scrap' || it.id === FX.REG)) return FX.SCRAP_WH; return baseWh(item); };

  /* ═════════════ 6. SEED ═════════════ */
  ERP.addSeed('factory', function (S, c) {
    const { ago, day, rnd, between, pick } = c; const yr = new Date().getFullYear(); const seq = (S.meta.erpSeq = S.meta.erpSeq || {});
    const nx = (P, pad) => { seq[P] = (seq[P] || 0) + 1; return P + '-' + yr + '-' + String(seq[P]).padStart(pad || 4, '0'); };
    const dAgo = (d, hr) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(hr || 10, between(0, 59), 0, 0); return x.toISOString(); };
    const items = S.items; const item = (id) => items.find((i) => i.id === id);
    const R = (n) => Math.round(n * 100) / 100;

    /* lines + machines (names from the plant) */
    const L1 = S.lines.find((l) => l.id === 'L-01'), L2 = S.lines.find((l) => l.id === 'L-02');
    Object.assign(L1, { name: 'الخلط والسحب — الأبواب', code: 'MIX-EXT', desc: '3 خلاطات + 3 ماكينات سحب' });
    Object.assign(L2, { name: 'تشغيل وتشطيب الأبواب', code: 'FIN-DR', desc: 'سنفرة ← ترويس ← خشب ← شريط ← نضافة ← كالون ← لمينيشن ← ديكور ← جودة وتغليف' });
    const mc = (id) => S.machines.find((m) => m.id === id);
    const ren = (id, name, stageId, o) => { const m = mc(id); if (m) Object.assign(m, { name, stageId: stageId || null }, o || {}); };
    ren('M-501', 'خلاطة 1 — ساخن/بارد 500/1000 لتر', 'ST-MIX', { lineId: 'L-01' }); ren('M-101', 'ماكينة سحب 1 — إكسترودر مزدوج 80/156', 'ST-EXT'); ren('M-102', 'قالب بروفايل الضلفة 45 مم (ملحق ماكينة سحب 1)', null, { partOf: 'M-101' });
    ren('M-103', 'طاولة معايرة بالتفريغ (ملحق ماكينة سحب 1)', null, { partOf: 'M-101' }); ren('M-104', 'وحدة شد ومنشار (ملحق ماكينة سحب 1)', null, { partOf: 'M-101' }); ren('M-201', 'ماكينة اللمينيشن PUR', 'ST-LAM'); ren('M-202', 'ماكينة فتحة الكالون (CNC)', 'ST-LOCK');
    ren('M-203', 'محطة الجودة والتغليف', 'ST-QP'); ren('M-301', 'إكسترودر التجاليد 65/132', 'ST-EXT'); ren('M-302', 'قالب تجاليد K71 (ملحق الإكسترودر)', null, { partOf: 'M-301' }); ren('M-303', 'منشار قطع آلي — تجاليد', 'ST-CLCUT');
    ren('M-401', 'إكسترودر فوم 92/188', 'ST-EXT'); ren('M-402', 'قالب T-Die عرض 1300 مم (ملحق الإكسترودر)', null, { partOf: 'M-401' }); ren('M-403', 'ماكينة سحب ثلاثية الدرافيل', 'ST-FBCAL'); ren('M-404', 'منشار عرضي — فوم', 'ST-FBCAL');
    ren('M-502', 'كسارة/طاحونة الهوالك (إعادة التدوير)', 'ST-REG');
    const MC = (id, name, lineId, type, stageId, status, crit, hours, lastPM, nextPM, mtbf, mttr) => S.machines.push({ id, code: 'MC-' + id.slice(2), name, lineId, type, stageId, maker: 'مورّد آسيوي', year: 2020 + (Number(id.slice(2)) % 5), status, criticality: crit, hoursRun: hours, lastPMAt: day(-lastPM), nextPMAt: day(nextPM), mtbfH: mtbf, mttrH: mttr });
    MC('M-506', 'خلاطة 2 — ساخن/بارد 500/1000 لتر', 'L-01', 'mixer', 'ST-MIX', 'running', 'A', 16400, 9, 21, 540, 2); MC('M-507', 'خلاطة 3 — ساخن/بارد 300/600 لتر', 'L-01', 'mixer', 'ST-MIX', 'idle', 'B', 9100, 25, 5, 600, 2);
    MC('M-105', 'ماكينة سحب 2 — إكسترودر مزدوج 80/156', 'L-01', 'extruder', 'ST-EXT', 'running', 'A', 15800, 19, 11, 430, 3); MC('M-106', 'ماكينة سحب 3 — إكسترودر مزدوج 65/132', 'L-01', 'extruder', 'ST-EXT', 'running', 'A', 12200, 33, -1, 400, 3.4);
    MC('M-204', 'ماكينة السنفرة', 'L-02', 'sander', 'ST-SAND', 'running', 'B', 10400, 14, 16, 700, 1.2); MC('M-205', 'ماكينة الترويس (منشار مزدوج)', 'L-02', 'trimmer', 'ST-TRIM', 'running', 'B', 11900, 46, -6, 380, 1);
    MC('M-206', 'محطة تركيب الخشب', 'L-02', 'assembly', 'ST-WOOD', 'running', 'C', 8800, 20, 10, 900, 0.8); MC('M-207', 'ماكينة الشريط (Edge banding)', 'L-02', 'edgebander', 'ST-EDGE', 'running', 'B', 9900, 12, 18, 620, 1.5);
    MC('M-208', 'محطة النضافة + المادة', 'L-02', 'cleaning', 'ST-CLEAN', 'running', 'C', 7600, 30, 0, 1000, 0.5); MC('M-210', 'ماكينة الديكور (CNC حفر + بارز)', 'L-02', 'cnc', 'ST-DECOR', 'running', 'B', 8200, 17, 13, 560, 2.2);
    MC('M-209', 'ماكينة تقطيع وتخريم الحلق', 'L-02', 'cutter', 'ST-CUT', 'running', 'B', 10100, 22, 8, 480, 1);

    /* warehouses + accounts */
    S.warehouses.push({ id: 'W-07', code: 'WH-SCR', name: 'مخزن الهوالك والمطحون', type: 'SCR', managerId: 'U-36', active: true, hasStock: true });
    const w1 = S.warehouses.find((w) => w.id === 'W-01'); if (w1) w1.managerId = 'U-37'; const w2 = S.warehouses.find((w) => w.id === 'W-02'); if (w2) w2.managerId = 'U-36';
    const w5 = S.warehouses.find((w) => w.id === 'W-05'); if (w5) w5.managerId = 'U-36';
    const accIdx = (code) => S.accounts.findIndex((a) => a.code === code);
    S.accounts.splice(accIdx('1144') + 1, 0, { code: '1145', name: 'مخزون هوالك ومطحون', type: 'asset', parent: '11', level: 3 });
    S.accounts.splice(accIdx('5303') + 1, 0, { code: '5204', name: 'فاقد وهوالك التشغيل', type: 'expense', parent: '52', level: 3 });

    /* items: new raw materials + regrind + scrap kinds; door finish type per model */
    const FIN = { D101: 'plain', D103: 'plain', D110: 'plain', D104: 'decor', D107: 'decor', D108: 'decor', D114: 'decor', D105: 'raised', D112: 'raised', D115: 'raised' };
    items.forEach((it) => { if (it.family === 'door') it.attrs.finishType = FIN[it.attrs.model] || 'plain'; });
    const RMI = (id, name, uom, cost, rop, sup, moq, o) => items.push(Object.assign({ id: 'IT-' + id, code: id, name, kind: 'rm', family: 'rm', attrs: {}, uom, price: null, stdCost: cost, reorderPoint: rop, moq, leadDays: 7, supplierId: sup }, o || {}));
    RMI('RM-WOOD', 'خشب تقوية داخلي (أماكن المفصلات والكالون)', 'm', 22, 900, 'S-003', 1500); RMI('RM-EDGE', 'شريط حرف PVC للضلفة', 'm', 4.5, 3000, 'S-008', 5000);
    RMI('RM-MAT', 'المادة — تحضير السطح قبل اللمينيشن', 'kg', 95, 40, 'S-004', 60);
    RMI('RM-REG', 'مطحون إعادة تدوير (من هوالك المصنع)', 'kg', 22, null, null, null, { attrs: { recycled: true }, leadDays: 0 });
    const SCI = (id, name, cost, sale) => items.push({ id: 'IT-' + id, code: id, name, kind: 'scrap', family: 'scrap', attrs: { salePrice: sale }, uom: 'kg', price: null, stdCost: cost, reorderPoint: null, moq: null, leadDays: 0, supplierId: null });
    SCI('SCR-GR', 'هوالك WPC/PVC قابلة للطحن', 22, 24); SCI('SCR-DUST', 'تراب سنفرة ونشارة', 4, 5); SCI('SCR-FILM', 'هوالك فويل وشريط ولاصق', 2, 3);
    const bd = S.boms.find((b) => b.id === 'BOM-DOOR');
    bd.lines.push({ itemId: 'IT-RM-WOOD', qty: 1.6, scrapPct: 0.03 }, { itemId: 'IT-RM-EDGE', qty: 6.4, scrapPct: 0.04 }, { itemId: 'IT-RM-MAT', qty: 0.06, scrapPct: 0 }); bd.version = 4;
    bd.routing = [['الخلاطة (حسب الخلطة)', 'L-01', 0.8], ['السحب (البثق) — ضلفة + حلق', 'L-01', 3.6], ['السنفرة', 'L-02', 0.6], ['الترويس', 'L-02', 0.5], ['تركيب الخشب', 'L-02', 1.2], ['الشريط', 'L-02', 0.9], ['النضافة + المادة', 'L-02', 0.5], ['فتحة الكالون', 'L-02', 0.7],
      ['اللمينيشن — ضلفة + حلق', 'L-02', 3], ['الديكور (للديكور والديكور البارز)', 'L-02', 1.2], ['تقطيع وتخريم الحلق', 'L-02', 0.8], ['الجودة والتغليف', 'L-02', 1.5]].map((r, i) => ({ seq: (i + 1) * 10, op: r[0], lineId: r[1], minPerUnit: r[2] }));
    const stk = S.stock; const SB = (itemId, whId, qty) => { const r = stk.find((x) => x.itemId === itemId && x.whId === whId); if (r) r.qty = qty; else stk.push({ id: 'SB-' + itemId + '-' + whId, itemId, whId, qty, reserved: 0 }); };
    SB('IT-RM-WOOD', 'W-02', 2600); SB('IT-RM-EDGE', 'W-02', 9200); SB('IT-RM-MAT', 'W-02', 85); SB('IT-RM-REG', 'W-07', 920); SB('IT-SCR-GR', 'W-07', 1850); SB('IT-SCR-DUST', 'W-07', 640); SB('IT-SCR-FILM', 'W-07', 310);

    /* 13 chemical formulas (demo ratios — replaced by the plant's real recipes) */
    const FM = (id, name, family, track, batchKg, regMaxPct, density, uses, mix) => ({ id, code: id, name, family, track, batchKg, mixMin: 12, mixer: 'ساخن حتى 120°م ثم تبريد 45°م', regMaxPct, density, version: between(2, 5), status: 'active', approvedBy: 'U-13', updatedAt: ago(60 * 24 * between(10, 120)), uses,
      lines: Object.keys(mix).map((k) => ({ itemId: 'IT-RM-' + k, pct: mix[k] })) });
    S.formulas = [
      FM('MX-01', 'خلطة ضلفة باب — سادة', 'door', 'leaf', 250, 0.08, '0.75–0.80', 'ضلفة D101 · D103 · D110', { PVC: 47.6, WF: 18, CC: 21, REG: 8, STB: 2.1, LUB: 0.8, FOAM: 0.3, ACR: 1.8, PIG: 0.4 }),
      FM('MX-02', 'خلطة ضلفة باب — ديكور', 'door', 'leaf', 250, 0.08, '0.78–0.82', 'ضلفة D104 · D107 · D108 · D114 (سطح أصلب للحفر)', { PVC: 49.6, WF: 17, CC: 20, REG: 8, STB: 2.1, LUB: 0.8, FOAM: 0.3, ACR: 1.8, PIG: 0.4 }),
      FM('MX-03', 'خلطة ضلفة باب — ديكور بارز', 'door', 'leaf', 250, 0.08, '0.80–0.85', 'ضلفة D105 · D112 · D115', { PVC: 51.6, WF: 15, CC: 20, REG: 8, STB: 2.1, LUB: 0.8, FOAM: 0.3, ACR: 1.8, PIG: 0.4 }),
      FM('MX-04', 'خلطة حلق الباب (80–100)', 'door', 'frame', 250, 0.1, '0.85–0.90', 'حلوق الأبواب حتى عرض 100', { PVC: 44.4, WF: 22, CC: 20, REG: 10, STB: 1.8, LUB: 0.9, FOAM: 0.2, ACR: 0.4, PIG: 0.3 }),
      FM('MX-05', 'خلطة حلق الباب — عريض (110)', 'door', 'frame', 250, 0.1, '0.88–0.92', 'حلوق عرض 110', { PVC: 46.4, WF: 21, CC: 19, REG: 10, STB: 1.8, LUB: 0.9, FOAM: 0.2, ACR: 0.4, PIG: 0.3 }),
      FM('MX-06', 'خلطة تجاليد K71 — داخلي', 'clad', 'main', 300, 0.03, '1.25–1.35', 'تجاليد K71-1 … K71-5', { PVC: 46.7, WF: 32, CC: 15, REG: 3, STB: 1.6, LUB: 0.9, PIG: 0.8 }),
      FM('MX-07', 'خلطة تجاليد — خارجي مقاوم UV', 'clad', 'main', 300, 0.02, '1.28–1.38', 'تجاليد واجهات (حسب الطلب)', { PVC: 49.2, WF: 30, CC: 14, REG: 2, STB: 2.2, LUB: 0.9, PIG: 1.7 }),
      FM('MX-08', 'خلطة فوم بورد — كثافة 0.50', 'foam', 'main', 300, 0.04, '0.48–0.52', 'ألواح 4.5 و 6 مم', { PVC: 63.5, CC: 26, REG: 4, STB: 2.5, LUB: 1.2, FOAM: 1, ACR: 1.8 }),
      FM('MX-09', 'خلطة فوم بورد — كثافة 0.55', 'foam', 'main', 300, 0.04, '0.53–0.57', 'ألواح 8 – 12 مم', { PVC: 62.9, CC: 27, REG: 4, STB: 2.5, LUB: 1.1, FOAM: 0.8, ACR: 1.7 }),
      FM('MX-10', 'خلطة فوم بورد — كثافة 0.60', 'foam', 'main', 300, 0.03, '0.58–0.62', 'ألواح 14 – 17 مم', { PVC: 61.6, CC: 29, REG: 3, STB: 2.4, LUB: 1.1, FOAM: 0.6, ACR: 2.3 }),
      FM('MX-11', 'خلطة بروفايل تقوية داخلي', 'door', 'main', 200, 0, '1.35–1.40', 'بروفايلات تقوية الحلوق الكبيرة', { PVC: 70.2, CC: 22, STB: 2.6, LUB: 1, ACR: 3.5, PIG: 0.7 }),
      FM('MX-12', 'خلطة مطحون عالي النسبة (حلوق اقتصادية)', 'door', 'frame', 250, 0.3, '0.90–0.95', 'حلوق داخلية اقتصادية — تستهلك المطحون الزايد', { PVC: 32.8, WF: 18, CC: 16, REG: 30, STB: 1.8, LUB: 0.9, ACR: 0.3, PIG: 0.2 }),
      FM('MX-13', 'خلطة تنظيف الإكسترودر (Purge)', 'all', 'main', 100, 0, '—', 'عند تغيير اللون أو إيقاف الماكينة', { PVC: 40, CC: 55, LUB: 2, STB: 3 })
    ];

    /* roles + the two storekeepers */
    const role = (id) => S.roles.find((r) => r.id === id);
    const addKeys = (id, list) => { const r = role(id); if (!r || r.sa[0] === '*') return; list.forEach((k) => { if (r.sa.indexOf(k) < 0) r.sa.push(k); }); };
    const M = (map) => { const m = {}; SA.catalog.resources.forEach((r) => { m[r.id] = SA.rbac.row(map[r.id] || ''); }); return m; };
    const mk = (id, nameAr, nameEn, desc, sa, matrix) => S.roles.push({ id, nameAr, nameEn, description: desc, isSystem: true, isProtected: false, isNew: true, tag: 'new', status: 'active', version: 1, homeApp: 'scm', matrix: M(matrix), scope: { inventory: 'department' }, sensitive: [], sa, createdAt: ago(60 * 24 * 20), updatedAt: ago(60 * 24 * 2) });
    mk('R-23', 'أمين مخزن الخامات', 'Raw Materials Storekeeper', 'يستلم الخامات والمستلزمات وقطع الغيار من الموردين، يصرف الخامات للخلاطة بإذن صرف، ويدير مخزن الهوالك والمطحون (طحن + طلب بيع).',
      ['scm.desk.view', 'scm.grn.view', 'scm.grn.create', 'scm.stock.view', 'scm.moves.view', 'scm.issues.view', 'scm.issues.issue', 'scm.transfers.view', 'scm.transfers.create', 'scm.counts.view', 'scm.counts.create', 'scm.requisitions.view', 'scm.requisitions.create', 'scm.po.view',
        'mfg.workorders.view', 'mfg.flow.view', 'mfg.formulas.view', 'mfg.scrap.view', 'mfg.scrap.recycle', 'mfg.scrap.sell', 'care.spares.view'], { inventory: 'vce', purchasing: 'v', manufacturing: 'v' });
    mk('R-24', 'أمين مخزن المنتج التام', 'Finished Goods Storekeeper', 'يستلم الإنتاج التام بعد الفحص النهائي ويعدّه، ويجهّز ويسلّم البضاعة للعملاء بإذن التسليم.',
      ['scm.desk.view', 'scm.fgreceipts.view', 'scm.fgreceipts.receive', 'scm.stock.view', 'scm.moves.view', 'scm.deliveries.view', 'scm.deliveries.create', 'scm.deliveries.dispatch', 'scm.dispatch.view', 'scm.transfers.view', 'scm.transfers.create', 'scm.counts.view', 'scm.counts.create', 'crm.orders.view', 'mfg.workorders.view', 'mfg.flow.view'], { inventory: 'vce', logistics: 'vc', sales: 'v' });
    addKeys('R-06', ['scm.desk.view', 'scm.issues.view', 'scm.issues.create', 'scm.issues.issue', 'scm.fgreceipts.view', 'scm.fgreceipts.receive', 'mfg.scrap.view', 'mfg.scrap.recycle', 'mfg.scrap.sell', 'mfg.formulas.view']);
    addKeys('R-05', ['mfg.flow.view', 'mfg.formulas.view', 'mfg.formulas.edit', 'mfg.scrap.view', 'mfg.scrap.create', 'scm.issues.view', 'scm.issues.create', 'scm.fgreceipts.view']);
    addKeys('R-14', ['mfg.flow.view', 'mfg.shopfloor.view', 'mfg.shopfloor.report', 'mfg.workorders.view', 'mfg.scrap.view', 'mfg.scrap.create']);
    addKeys('R-09', ['mfg.flow.view', 'mfg.scrap.view', 'mfg.formulas.view']); addKeys('R-02', ['mfg.flow.view', 'mfg.scrap.view', 'mfg.formulas.view', 'scm.issues.view', 'scm.fgreceipts.view']);
    addKeys('R-22', ['mfg.scrap.view']); addKeys('R-07', ['mfg.scrap.view', 'scm.issues.view', 'scm.fgreceipts.view']); addKeys('R-18', ['mfg.flow.view']); addKeys('R-17', ['scm.fgreceipts.view']);
    const U = (id, name, login, roleId, o) => Object.assign({ id, name, email: login + '@eg-demo.test', phone: '+20 100 300 ' + id.slice(2).padStart(4, '0'), roleId, departmentId: 'D-04', managerId: 'U-07', warehouseIds: [], status: 'active', mfa: false, locale: 'ar', jobTitle: '', lastLogin: ago(between(20, 300)), createdAt: ago(60 * 24 * 90), createdBy: 'U-01', persona: null, failed: 0 }, o);
    S.users.push(U('U-36', 'حسام عبد العزيز', 'stores-in', 'R-23', { persona: 'whin', warehouseIds: ['W-02', 'W-05', 'W-07'], jobTitle: 'أمين مخزن الخامات والمستلزمات' }),
      U('U-37', 'رامي فتحي', 'stores-out', 'R-24', { persona: 'whout', warehouseIds: ['W-01', 'W-04'], jobTitle: 'أمين مخزن المنتج التام والتسليم' }));
    S.creds['U-36'] = 'Demo@1234'; S.creds['U-37'] = 'Demo@1234';

    /* work orders: stages consistent with status; one released WO waiting for the mixer issue */
    const route = (w) => FX.routeOf.call(null, w.itemId);
    const lookItem = ERP.item; ERP.item = (id) => item(id) || null; // seed runs before the store exists
    const lookFind = ERP.find; ERP.find = (coll, id) => (S[coll] || []).find((x) => x.id === id) || null;
    try {
      const stagesFor = (w, spec) => {
        const r = route(w); const last = {}; r.forEach((s, i) => { s.seq = (i + 1) * 10; s.good = 0; s.scrap = 0; s.scrapKg = 0; s.startedAt = null; s.lastAt = null; s.machineId = null; last[s.track] = s; });
        if (spec) Object.keys(spec).forEach((k) => { const s = r.find((x) => x.key === k); if (s) { s.good = spec[k][0]; s.scrap = spec[k][1] || 0; s.scrapKg = spec[k][2] != null ? spec[k][2] : R(s.scrap * FX.unitKg(w.itemId, s.track)); s.startedAt = w.actualStart || ago(600); s.lastAt = ago(between(10, 200)); } });
        return r;
      };
      /** completed: back-compute from the finished quantity with a little scrap at a couple of stages */
      const doneStages = (w) => {
        const r = route(w); r.forEach((s, i) => { s.seq = (i + 1) * 10; s.scrap = 0; s.scrapKg = 0; s.startedAt = w.actualStart; s.lastAt = w.actualEnd; s.machineId = null; });
        const sc = w.qtyScrap || 0; const pick2 = r.filter((s) => ['ST-TRIM', 'ST-LAM', 'ST-CLCUT', 'ST-FBCAL', 'ST-CUT'].indexOf(s.stageId) >= 0); if (pick2.length && sc) { const a = pick2[0]; a.scrap = Math.ceil(sc * 0.6); if (pick2[1]) pick2[1].scrap = sc - a.scrap; else a.scrap = sc; }
        const qp = r.find((s) => s.stageId === 'ST-QP'); qp.good = w.qtyDone;
        ['leaf', 'frame', 'main'].forEach((t) => { const tl = r.filter((s) => s.track === t && s.stageId !== 'ST-QP' || (t === 'main' && s.track === 'main')); let carry = t === 'main' ? null : qp.good + qp.scrap;
          for (let i = tl.length - 1; i >= 0; i--) { const s = tl[i]; if (s.stageId === 'ST-QP') { carry = s.good + s.scrap; continue; } s.good = carry; carry = s.good + s.scrap; } });
        r.forEach((s) => { s.scrapKg = R(s.scrap * FX.unitKg(w.itemId, s.track) + (s.stageId === 'ST-EXT' ? s.good * FX.unitKg(w.itemId, s.track) * 0.012 : 0)); }); return r;
      };
      const W = (id) => S.workOrders.find((w) => w.id === id);
      S.workOrders.forEach((w) => { if (w.status === 'completed' || w.status === 'closed' || w.status === 'qc_pending') w.stages = doneStages(w); else w.stages = stagesFor(w); w.scrapKg = R(w.stages.reduce((s, x) => s + (x.scrapKg || 0), 0)); });
      const so480 = S.salesOrders.find((s) => (s.woIds || []).length === 3) || {};
      const [wClad, wDoor, wNext] = (so480.woIds || []).map(W);
      if (wDoor) { wDoor.stages = stagesFor(wDoor, { 'leaf:ST-MIX': [46, 0, 1.5], 'leaf:ST-EXT': [46, 0, 9], 'leaf:ST-SAND': [46, 0, 1.4], 'leaf:ST-TRIM': [45, 1], 'leaf:ST-WOOD': [45], 'leaf:ST-EDGE': [43], 'leaf:ST-CLEAN': [41], 'leaf:ST-LOCK': [38], 'leaf:ST-LAM': [34],
        'frame:ST-MIX': [46, 0, 0.5], 'frame:ST-EXT': [46, 0, 3], 'frame:ST-LAM': [40], 'frame:ST-CUT': [36, 0, 2.6], 'main:ST-QP': [28] }); wDoor.scrapKg = R(wDoor.stages.reduce((s, x) => s + x.scrapKg, 0)); wDoor.stages.find((s) => s.key === 'leaf:ST-TRIM').machineId = 'M-205'; }
      if (wClad) { wClad.stages = stagesFor(wClad, { 'main:ST-MIX': [1800, 0, 6], 'main:ST-EXT': [1160, 14, 58], 'main:ST-CLCUT': [1134, 12], 'main:ST-QP': [1120] }); wClad.scrapKg = R(wClad.stages.reduce((s, x) => s + x.scrapKg, 0)); }
      if (wNext) { wNext.status = 'released'; wNext.issued = false; wNext.releasedAt = ago(35); wNext.releasedBy = 'U-13'; wNext.stages = stagesFor(wNext); }

      /* material issue requests: history (issued) + the pending one for the export door order */
      S.issueRequests = [];
      const regFor = (w) => FX.formulasFor(w.itemId).reduce((s, f) => s + FX.compoundKg(w.itemId) * w.qty * FX.trackShare(f.track) * (((S.formulas.find((x) => x.id === f.formulaId) || {}).regMaxPct) || 0), 0);
      const mir = (w, status, at, by) => {
        const mats = ERP.materialsFor(w.itemId, w.qty); const ck = R(mats.filter((m) => FX.isCompound(m.itemId)).reduce((s, m) => s + m.qty, 0)); const reg = Math.floor(Math.min(regFor(w), ck * 0.2));
        const lines = mats.map((m) => ({ itemId: m.itemId, qty: R(m.itemId === 'IT-RM-PVC' ? m.qty - reg : m.qty), issuedQty: 0, dest: FX.destOf(m.itemId), whId: K.defaultWh(item(m.itemId)) })).concat(reg > 0 ? [{ itemId: FX.REG, qty: reg, issuedQty: 0, dest: 'ST-MIX', whId: 'W-07' }] : []);
        if (status === 'issued') lines.forEach((l) => { l.issuedQty = l.qty; });
        const fms = FX.formulasFor(w.itemId).map((f) => { const fm = S.formulas.find((x) => x.id === f.formulaId) || {}; const kg = R(ck * FX.trackShare(f.track)); return { track: f.track, formulaId: f.formulaId, kg, batches: Math.max(1, Math.ceil(kg / (fm.batchKg || 250))), regMaxPct: fm.regMaxPct || 0 }; });
        const r = { id: nx('MIR'), woId: w.id, itemId: w.itemId, qtyUnits: w.qty, lot: w.lot, lines, formulas: fms, compoundKg: ck, regKg: reg, status, priority: w.priority || 'normal', soId: w.soId || null, requestedBy: 'U-13', requestedAt: at, issuedBy: status === 'issued' ? by : null, issuedAt: status === 'issued' ? at : null,
          value: status === 'issued' ? Math.round(lines.reduce((s, l) => s + l.qty * ((item(l.itemId) || {}).stdCost || 0), 0)) : 0, note: '' };
        S.issueRequests.unshift(r); w.mirId = r.id; return r;
      };
      S.workOrders.filter((w) => w.issued).sort((a, b) => (a.actualStart || '') < (b.actualStart || '') ? -1 : 1).forEach((w) => mir(w, 'issued', w.actualStart || ago(60 * 24), pick(['U-36', 'U-36', 'U-07'])));
      if (wNext) { const m = mir(wNext, 'pending', ago(35), null); m.note = 'تصدير عُمان — أولوية'; }

      /* finished-goods receipts: received history + one pending (doors finished today) */
      S.fgReceipts = [];
      S.workOrders.filter((w) => (w.status === 'completed' || w.status === 'closed') && w.actualEnd && Date.now() - new Date(w.actualEnd).getTime() < 14 * 86400000).forEach((w) => {
        const q = S.qcInspections.find((x) => x.id === w.qcId); const acc = q ? q.acceptedQty : w.qtyDone;
        S.fgReceipts.unshift({ id: nx('FGR'), woId: w.id, qcId: w.qcId, itemId: w.itemId, qty: acc, lot: w.lot, soId: w.soId, status: 'received', createdAt: w.actualEnd, createdBy: 'U-15', receivedAt: new Date(new Date(w.actualEnd).getTime() + 50 * 60000).toISOString(), receivedBy: 'U-37', receivedQty: acc, note: '' });
      });
      const woN = Math.max(...S.workOrders.map((w) => Number(w.id.split('-')[2]) || 0)) + 1; seq.WO = Math.max(seq.WO || 0, woN);
      const wid = 'WO-' + yr + '-' + String(woN).padStart(4, '0');
      const wF = { id: wid, itemId: 'IT-D104-90-C173', qty: 36, qtyDone: 36, qtyScrap: 1, lineId: 'L-02', soId: null, status: 'completed', priority: 'normal', plannedStart: day(-2), plannedEnd: day(0), dueDate: null, actualStart: dAgo(2, 7), actualEnd: ago(95), shift: 'A', issued: true, qcId: null, createdAt: dAgo(4), createdBy: 'U-13', lot: 'LOT-' + wid.slice(3), reports: [], completedAt: ago(40), notes: 'إنتاج للمخزون (حد طلب)' };
      wF.stages = doneStages(wF); wF.scrapKg = R(wF.stages.reduce((s, x) => s + x.scrapKg, 0)); S.workOrders.push(wF); mir(wF, 'issued', dAgo(2, 7), 'U-36');
      seq.QC = (seq.QC || 0) + 1; const qcId = 'QC-' + yr + '-' + String(seq.QC).padStart(4, '0');
      const fam = 'door'; S.qcInspections.push({ id: qcId, kind: 'final', refType: 'work_order', refId: wid, itemId: wF.itemId, qty: 36, sample: 7, lot: wF.lot, result: 'pass', params: (ERP.qcParams[fam]).map((p) => ({ name: p[0], spec: p[1], value: 'ضمن المواصفة', ok: true })), defects: [], acceptedQty: 36, rejectedQty: 0, inspectorId: 'U-15', at: ago(40), createdAt: ago(95), note: '', ncrId: null });
      wF.qcId = qcId;
      const fgP = { id: nx('FGR'), woId: wid, qcId, itemId: wF.itemId, qty: 36, lot: wF.lot, soId: null, status: 'pending', createdAt: ago(40), createdBy: 'U-15', receivedAt: null, receivedBy: null, receivedQty: null, note: '' }; S.fgReceipts.unshift(fgP);

      /* scrap history: one record per stage per day (30 days) — LAM spike 20–14 days ago (film batch), TRIM rising last 9 days (M-205 blade wear) */
      S.scrapLogs = []; S.scrapOps = []; S.scrapSales = [];
      const doorItem = 'IT-D101-90-C132'; const ck = FX.compoundKg(doorItem); const cKg = FX.compoundCostKg(doorItem);
      const PLAN = [['ST-MIX', 'main', 'L-01', 'M-501', 'door'], ['ST-EXT', 'leaf', 'L-01', 'M-101', 'door'], ['ST-EXT', 'frame', 'L-01', 'M-105', 'door'], ['ST-SAND', 'leaf', 'L-02', 'M-204', 'door'], ['ST-TRIM', 'leaf', 'L-02', 'M-205', 'door'], ['ST-WOOD', 'leaf', 'L-02', 'M-206', 'door'],
        ['ST-EDGE', 'leaf', 'L-02', 'M-207', 'door'], ['ST-CLEAN', 'leaf', 'L-02', 'M-208', 'door'], ['ST-LOCK', 'leaf', 'L-02', 'M-202', 'door'], ['ST-LAM', 'leaf', 'L-02', 'M-201', 'door'], ['ST-DECOR', 'leaf', 'L-02', 'M-210', 'door'], ['ST-CUT', 'frame', 'L-02', 'M-209', 'door'], ['ST-QP', 'main', 'L-02', 'M-203', 'door'],
        ['ST-EXT', 'main', 'L-03', 'M-301', 'clad'], ['ST-CLCUT', 'main', 'L-03', 'M-303', 'clad'], ['ST-EXT', 'main', 'L-04', 'M-401', 'foam'], ['ST-FBCAL', 'main', 'L-04', 'M-404', 'foam']];
      const famKg = { door: 210 * ck, clad: 2300 * 3.3, foam: 380 * 16 }; const famItem = { door: doorItem, clad: 'IT-K71-1', foam: 'IT-FB-10' };
      const pickReason = (sid) => { const rs = FX.REASONS.filter((r) => r.stages && r.stages.indexOf(sid) >= 0); const nor = rs.filter((r) => r.normal); return rnd() < 0.72 && nor.length ? pick(nor) : pick(rs.filter((r) => !r.normal).length ? rs.filter((r) => !r.normal) : rs); };
      let scrN = 0;
      for (let d = 30; d >= 1; d--) PLAN.forEach((p) => {
        const [sid, track, line, mcId, f] = p; if (f === 'clad' && d <= 1) return; if (sid === 'ST-DECOR' && rnd() < 0.3) return; if ((sid === 'ST-WOOD' || sid === 'ST-EDGE' || sid === 'ST-LOCK' || sid === 'ST-CLEAN') && rnd() < 0.45) return;
        const s = FX.STAGES[sid]; let factor = 0.65 + rnd() * 0.7; if (sid === 'ST-LAM' && d >= 14 && d <= 20) factor *= 2.6; if (sid === 'ST-TRIM' && d <= 9) factor *= 1.7 + (9 - d) * 0.06;
        const procKg = famKg[f] * (f === 'door' ? FX.trackShare(track) : 1) * (sid === 'ST-MIX' ? 1 / FX.trackShare('leaf') * 0.72 : 1);
        const kg = R(procKg * s.stdPct * factor); if (kg < 0.5) return; const rs = pickReason(sid); const uKg = f === 'door' ? ck * FX.trackShare(track) : f === 'clad' ? 3.3 : 16;
        const qty = s.kgFocus || rs.normal ? 0 : Math.max(0, Math.round(kg / uKg)); const sItem = item(rs.scrapItemId || s.scrapItemId) || {};
        const cost = Math.round(qty > 0 ? qty * (item(famItem[f]).stdCost || 0) * (f === 'door' ? FX.trackShare(track) : 1) * s.costShare : kg * cKg);
        const at = dAgo(d, between(8, 21)); scrN++;
        S.scrapLogs.push({ id: 'SCR-' + yr + '-' + String(scrN).padStart(5, '0'), at, date: FX.localDate(at), woId: null, itemId: famItem[f], stageId: sid, track, lineId: line, machineId: mcId, shift: pick(['A', 'B', f === 'door' ? 'A' : 'C']), qty, kg, reasonId: rs.id, scrapItemId: rs.scrapItemId || s.scrapItemId, normal: rs.normal, cost, recoverable: Math.min(cost, Math.round(kg * (sItem.stdCost || 0))), by: pick(['U-27', 'U-29', 'U-13']), note: '' });
      });
      // today: from the running export doors + the clad order before the breakdown
      if (wDoor) [['leaf:ST-EXT', 'ST-EXT', 'leaf', 'L-01', 'M-101', 0, 9, 'R01', 260], ['leaf:ST-TRIM', 'ST-TRIM', 'leaf', 'L-02', 'M-205', 1, R(1 * FX.unitKg(wDoor.itemId, 'leaf')) + 6.5, 'R09', 150], ['frame:ST-CUT', 'ST-CUT', 'frame', 'L-02', 'M-209', 0, 2.6, 'R08', 120], ['leaf:ST-SAND', 'ST-SAND', 'leaf', 'L-02', 'M-204', 0, 1.4, 'R06', 200], ['leaf:ST-MIX', 'ST-MIX', 'leaf', 'L-01', 'M-506', 0, 1.5, 'R02', 300]].forEach((x) => {
        const s = FX.STAGES[x[1]]; const rs = FX.reason(x[7]); const at = ago(x[8]); scrN++; const it = item(wDoor.itemId); const cost = Math.round(x[5] > 0 ? x[5] * it.stdCost * FX.trackShare(x[2]) * s.costShare : x[6] * cKg);
        S.scrapLogs.push({ id: 'SCR-' + yr + '-' + String(scrN).padStart(5, '0'), at, date: FX.localDate(at), woId: wDoor.id, itemId: wDoor.itemId, stageId: x[1], track: x[2], lineId: x[3], machineId: x[4], shift: 'A', qty: x[5], kg: x[6], reasonId: x[7], scrapItemId: rs.scrapItemId || s.scrapItemId, normal: rs.normal, cost, recoverable: Math.min(cost, Math.round(x[6] * ((item(rs.scrapItemId || s.scrapItemId) || {}).stdCost || 0))), by: 'U-27', note: x[7] === 'R09' ? 'سكينة الترويس محتاجة تغيير' : '' });
      });
      S.scrapLogs.sort((a, b) => (a.at < b.at ? 1 : -1)); seq.SCR = scrN;
      for (let d = 29; d >= 1; d -= 2) { const kgIn = round10(between(900, 1300)); S.scrapOps.unshift({ id: nx('RG'), kind: 'grind', at: dAgo(d, 14), kgIn, kgOut: R(kgIn * 0.97), machineId: 'M-502', by: 'U-36', note: '' }); }
      S.scrapSales.unshift({ id: nx('SS'), at: dAgo(18, 11), buyer: 'مصنع النيل للبلاستيك المعاد — المنصورة', phone: '', lines: [{ itemId: 'IT-SCR-FILM', kg: 420, price: 3 }, { itemId: 'IT-SCR-DUST', kg: 780, price: 5 }], total: 5160, bookValue: 3960, status: 'sold', approvalId: null, by: 'U-36', note: '', soldAt: dAgo(17, 10), soldBy: 'U-36' });
      S.scrapSales.unshift({ id: nx('SS'), at: dAgo(6, 12), buyer: 'ورشة الحسيني لإعادة التدوير — طلخا', phone: '', lines: [{ itemId: 'IT-SCR-GR', kg: 1200, price: 24 }], total: 28800, bookValue: 26400, status: 'sold', approvalId: null, by: 'U-36', note: 'زيادة عن احتياج الخلاطة', soldAt: dAgo(5, 10), soldBy: 'U-36' });
      const apN = Math.max(...S.approvals.map((a) => Number(String(a.id).split('-')[1]) || 0)) + 1; const apId = 'AP-' + apN;
      const ssP = { id: nx('SS'), at: ago(150), buyer: 'مصنع النيل للبلاستيك المعاد — المنصورة', phone: '', lines: [{ itemId: 'IT-SCR-DUST', kg: 450, price: 5 }, { itemId: 'IT-SCR-FILM', kg: 260, price: 3 }], total: 3030, bookValue: 2320, status: 'pending_approval', approvalId: apId, by: 'U-36', note: '', soldAt: null, soldBy: null };
      S.scrapSales.unshift(ssP);
      S.approvals.unshift({ id: apId, type: 'scrap_sale', area: 'mfg', title: 'بيع هوالك ' + ssP.id + ' — ' + ssP.buyer, requesterId: 'U-36', amount: 3030, discountPct: null, currency: 'EGP', status: 'pending', chain: [{ step: 1, roleId: 'R-22', label: 'المدير المالي', status: 'pending', decidedBy: null, decidedAt: null, reason: '' }], currentStep: 1, createdAt: ago(150), updatedAt: ago(150),
        context: [['المشتري', ssP.buyer], ['الكميات', 'تراب سنفرة 450 كجم × 5 ج.م · هوالك فويل 260 كجم × 3 ج.م'], ['قيمة البيع', ERP.fmt.money(3030)], ['القيمة الدفترية', ERP.fmt.money(2320)], ['ملاحظة', 'الهوالك القابلة للطحن ترجع الخلاطة أولًا — البيع للزيادة فقط']], ref: { type: 'scrap_sale', id: ssP.id } });

      /* GL: scrap of the last 30 days, grinding and the two sales (monthly summaries) */
      const sum = (f) => S.scrapLogs.reduce((s, l) => s + f(l), 0);
      const jeN = () => { seq.JE = (seq.JE || 0) + 1; return 'JE-' + yr + '-' + String(seq.JE).padStart(4, '0'); };
      const JE = (date, memo, lines) => S.journal.push({ id: jeN(), date, memo, ref: null, lines: lines.filter((l) => (l.dr || 0) + (l.cr || 0) > 0).map((l) => ({ acc: l.acc, dr: Math.round(l.dr || 0), cr: Math.round(l.cr || 0) })), by: 'SYSTEM', auto: true, status: 'posted', total: Math.round(lines.reduce((s, l) => s + (l.dr || 0), 0)) });
      const cost = sum((l) => l.cost), rec = sum((l) => l.recoverable);
      JE(day(-1), 'إجمالي هوالك التشغيل — آخر 30 يوم (ملخص)', [{ acc: '1145', dr: rec }, { acc: '5204', dr: cost - rec }, { acc: '1142', cr: cost }]);
      const gIn = S.scrapOps.reduce((s, o) => s + o.kgIn, 0), gOut = S.scrapOps.reduce((s, o) => s + o.kgOut, 0);
      // grinding summary sized so the scrap-stock account ends at the value of what is physically in W-07
      const soldBook = S.scrapSales.filter((s) => s.status === 'sold').reduce((s, x) => s + x.bookValue, 0);
      const w7val = ['IT-SCR-GR', 'IT-SCR-DUST', 'IT-SCR-FILM'].reduce((s, id) => s + ((stk.find((r) => r.itemId === id && r.whId === 'W-07') || {}).qty || 0) * ((item(id) || {}).stdCost || 0), 0);
      const gCr = Math.max(0, rec - soldBook - w7val);
      JE(day(-2), 'طحن هوالك وإعادتها للخلاطة كمطحون — ' + ERP.fmt.num(gIn) + ' كجم (ملخص)', [{ acc: '1141', dr: gCr * 0.97 }, { acc: '5204', dr: gCr * 0.03 }, { acc: '1145', cr: gCr }]);
      S.scrapSales.filter((s) => s.status === 'sold').forEach((s) => JE(s.soldAt.slice(0, 10), 'بيع هوالك ' + s.id + ' — ' + s.buyer, [{ acc: '1101', dr: s.total }, { acc: '1145', cr: s.bookValue }, { acc: '4201', cr: s.total - s.bookValue }]));
      S.journal.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

      /* notifications for the new personas */
      const N = (mins, title, body, level, to, link) => S.notifications.push({ id: 'N-F' + S.notifications.length, ts: ago(mins), title, body, level, to, toUsers: [], link, readBy: [] });
      const pend = S.issueRequests.find((m) => m.status === 'pending');
      if (pend) N(35, 'إذن صرف جديد للخلاطة: ' + pend.id, pend.woId + ' — ' + (item(pend.itemId) || {}).name + ' × ' + pend.qtyUnits + ' (تصدير عُمان — أولوية)', 'action', ['R-23', 'R-06'], '#/scm/issues/' + pend.id);
      N(40, 'إنتاج تام جاهز للاستلام: ' + fgP.id, (item(fgP.itemId) || {}).name + ' × 36 — عدّى الفحص النهائي ' + qcId, 'action', ['R-24', 'R-06'], '#/scm/fg-receipts');
      N(150, 'طلب بيع هوالك بانتظار اعتمادك', ssP.id + ' — ' + ssP.buyer + ' · ' + ERP.fmt.money(3030), 'action', ['R-22'], '#/approvals/' + apId);
      N(130, 'هالك الترويس أعلى من المسموح 9 أيام متتالية', 'ماكينة الترويس M-205 — غالبًا السكينة محتاجة تغيير (الصيانة الوقائية متأخرة 6 أيام).', 'urgent', ['R-05', 'R-01', 'R-18'], '#/mfg/scrap');
      S.notifications.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    } finally { ERP.item = lookItem; ERP.find = lookFind; }
    function round10(n) { return Math.round(n / 10) * 10; }
  });
})();
