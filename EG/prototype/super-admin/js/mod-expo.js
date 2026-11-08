/* EG ERP prototype — mod-expo.js  (app expo «المعارض والفعاليات» · group expo-main)
   Screens: expo-events expo/events[/EV-id?tab=overview|budget|samples|leads|followup|roi] · expo-calendar expo/calendar · expo-capture expo/capture[?ev=EV-id] · expo-roi expo/roi
   Data: events[] (shared) · leads[] (shared, eventId) · activities[] (shared) · eventExpenses[] (module-private, seeded here via ERP.addSeed('expo')).
   Seed hook (additive): eventExpenses for every event (sums = events[].spent) + more booth leads/activities for the 3 past exhibitions (ids continue the LD sequence).
   Actions: create event → budget approval (SA.requestApproval type event_budget, chain GM) · ERP.onApproval('event_budget') → approvalStatus approved/rejected + status planned→preparing (EVENT.BUDGET_APPROVED)
   · add expense (EVENT.EXPENSE_ADDED) · send samples FG W-01 → showroom W-04 via ERP.stock.transfer (STOCK.TRANSFERRED) · booth lead capture → leads[] (EVENT.LEAD_CAPTURED + LEAD.CREATED, notify R-03 + owner)
   · follow-up reminders (EVENT.FOLLOWUP_REMINDED) · start/finish event (EVENT.UPDATED).
   ROI here is revenue based (won value vs event cost) — not a profit figure. Sample cost only via ERP.ui.cost. */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP;
  if (!SA || !ERP || !ERP.flow) return;
  const h = SA.h, st = SA.store, fmt = ERP.fmt, U = ERP.ui, get = ERP.get;
  const CS = SA.catalog.status;

  /* ───────────── catalog additions ───────────── */
  [['EVENT.BUDGET_REJECTED', 'رفض ميزانية معرض', 'medium'], ['EVENT.EXPENSE_ADDED', 'تسجيل مصروف معرض', 'medium'], ['EVENT.FOLLOWUP_REMINDED', 'تذكير بمتابعة زوار معرض', 'info']].forEach((a) => SA.catalog.addAudit(a[0], a[1], a[2], 'expo'));
  if (!CS.expense) CS.expense = { paid: ['مدفوع', 'success'], committed: ['التزام — لم يُصرف', 'warning'] };
  if (!CS.evbudget) CS.evbudget = { pending: ['الميزانية بانتظار الاعتماد', 'warning'], approved: ['ميزانية معتمدة', 'success'], rejected: ['ميزانية مرفوضة', 'danger'], changes_requested: ['مطلوب تعديل الميزانية', 'warning'] };
  if (SA.missions && SA.missions.areas && !SA.missions.areas.expo) SA.missions.areas.expo = 'المعارض';

  const CATS = [['booth', 'إيجار مساحة الجناح'], ['design', 'تصميم وتنفيذ الجناح'], ['printing', 'مطبوعات وكتالوجات ورول أب'], ['samples', 'عينات ونقلها'], ['travel', 'سفر وإقامة الفريق'], ['hospitality', 'ضيافة وهدايا الزوار'], ['other', 'مصروفات أخرى']];
  const catLabel = (k) => (CATS.find((c) => c[0] === k) || [k, k])[1];
  const KIND = { exhibition: 'معرض', factory_visit: 'زيارة مصنع', conference: 'مؤتمر/ندوة' };
  const INTEREST = [['door', 'أبواب'], ['clad', 'تجاليد'], ['foam', 'فوم بورد']];
  const intLabel = (k) => (INTEREST.find((x) => x[0] === k) || [k, k || '—'])[1];
  const BUDGETS = [['b0', 'أقل من 100 ألف', 60000, 5], ['b1', '100 – 500 ألف', 250000, 15], ['b2', '500 ألف – 1 مليون', 700000, 25], ['b3', 'أكثر من 1 مليون', 1300000, 35]];
  const PROB = { new: 0.1, contacted: 0.2, qualified: 0.4, proposal: 0.55, negotiation: 0.75, won: 1, lost: 0 };
  const REPS = ['U-05', 'U-10', 'U-11'];
  const p2 = (n) => String(n).padStart(2, '0');
  const dstr = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const addDays = (s, n) => { const x = new Date(String(s).slice(0, 10) + 'T12:00:00'); x.setDate(x.getDate() + n); return dstr(x); };

  /* ───────────── seed (expenses + more booth leads) ───────────── */
  ERP.addSeed('expo', (S, c) => {
    if (!Array.isArray(S.events)) return;
    const today = dstr(new Date()); const iso = (d, hh) => { const x = new Date(d + 'T12:00:00'); x.setHours(hh == null ? 11 : hh, c.between(0, 59), 0, 0); return x.toISOString(); };
    const SPLIT = { 'EV-2026-07': [0.34, 0.3, 0.09, 0.07, 0.08, 0.12], 'EV-2026-08': [0.3, 0.32, 0.12, 0.1, 0.04, 0.12], 'EV-2026-09': [0.26, 0.22, 0.06, 0.12, 0.26, 0.08] };
    const VEND = { design: 'ستوديو بوث للتصميم والتنفيذ', printing: 'مطبعة الدلتا الحديثة', samples: 'نقل داخلي — أسطول المصنع', travel: 'وكالة سفر (تجريبي)', hospitality: 'مورد ضيافة (تجريبي)' };
    const OFF = { booth: -40, design: -10, printing: -7, samples: -2, travel: -1, hospitality: 0 };
    let n = 1000; const ex = [];
    S.events.forEach((ev) => {
      const sp = SPLIT[ev.id];
      if (sp) { let left = ev.spent || 0; CATS.slice(0, 6).forEach((k, i) => { const amt = i === 5 ? left : Math.round(((ev.spent || 0) * sp[i]) / 100) * 100; left -= amt; const dt = addDays(i === 5 ? ev.to : ev.from, OFF[k[0]]); ex.push({ id: 'EX-' + ++n, eventId: ev.id, category: k[0], description: k[1], vendor: k[0] === 'booth' ? 'إدارة ' + (ev.venue || 'المعرض') : VEND[k[0]], amount: amt, date: dt > today ? today : dt, status: 'paid', method: k[0] === 'hospitality' ? 'cash' : 'transfer', by: 'U-33', createdAt: iso(dt > today ? today : dt, 10) }); }); }
      else if ((ev.spent || 0) > 0) { const dt = addDays(ev.from, -45) > today ? today : addDays(ev.from, -45); ex.push({ id: 'EX-' + ++n, eventId: ev.id, category: 'booth', description: 'حجز مساحة الجناح (دفعة مقدمة)', vendor: 'إدارة ' + (ev.venue || 'المعرض'), amount: ev.spent, date: dt, status: 'paid', method: 'transfer', by: 'U-33', createdAt: iso(dt, 10) }); }
    });
    S.eventExpenses = ex;
    if (!Array.isArray(S.leads)) return;
    /* more booth leads for the past exhibitions (deterministic) */
    const yr = new Date().getFullYear(); let ldN = Math.max((S.meta && S.meta.erpSeq && S.meta.erpSeq.LD) || 0, ...S.leads.map((l) => +((/-(\d+)$/.exec(l.id) || [0, 0])[1])));
    const FN = ['م. أحمد', 'أ. محمود', 'م. هشام', 'أ. سامح', 'م. رشا', 'أ. نهى', 'م. كريم', 'أ. عادل', 'م. ياسمين', 'أ. حازم', 'م. شادي', 'أ. إيمان', 'م. باسم', 'أ. تامر', 'م. دينا', 'أ. وائل', 'م. علاء', 'أ. منة', 'م. حسن', 'أ. رامي', 'م. مصطفى', 'أ. هبة'];
    const LN = ['عبد العزيز', 'الشامي', 'فوزي', 'النجار', 'الحسيني', 'سليم', 'عثمان', 'البحيري', 'زكي', 'المصري', 'حمدان', 'الدسوقي', 'رشوان', 'الجندي', 'بدر', 'حافظ', 'قاسم', 'يونس', 'شكري', 'عطية'];
    const CO = [['شركة ', ' للتشطيبات'], ['مكتب ', ' للتصميم الداخلي'], ['معرض ', ' للأبواب'], ['مقاولات ', ''], ['', ' للديكور'], ['', ' للتطوير العقاري'], ['فندق ', ''], ['مستشفى ', ' التخصصي'], ['مدارس ', ' الدولية']];
    const CN = ['النور', 'الفتح', 'الأمانة', 'المستقبل', 'الهدى', 'الريادة', 'الصفا', 'الماسة', 'الواحة', 'النخيل', 'الجوهرة', 'الأندلس', 'الرواد', 'البيان', 'السلام', 'الأهرام'];
    const OF = ['م. سالم', 'أ. خالد', 'م. يوسف', 'أ. ناصر', 'م. أحمد', 'أ. سعيد', 'م. هلال', 'أ. علي', 'م. فهد', 'أ. ماجد', 'م. حمد', 'أ. بدر'];
    const OL = ['الرواحي', 'الهنائي', 'البلوشي', 'الحارثي', 'العامري', 'المعمري', 'الكندي', 'السيابي', 'الغافري', 'الشكيلي', 'البوسعيدي', 'الريامي'];
    const OC = [['مؤسسة ', ' للمقاولات'], ['', ' للديكور والتشطيبات'], ['شركة ', ' للتجارة'], ['', ' للتطوير العقاري']];
    const CITY = { 'EV-2026-07': ['القاهرة', 'القاهرة الجديدة', 'الشيخ زايد', '6 أكتوبر', 'الجيزة', 'العاصمة الإدارية', 'الشروق', 'بنها'], 'EV-2026-08': ['جمصة', 'المنصورة', 'دمياط', 'طلخا', 'كفر الشيخ', 'المحلة الكبرى', 'شربين'], 'EV-2026-09': ['مسقط', 'صحار', 'صلالة', 'نزوى', 'صور', 'البريمي'] };
    const PLAN = [['EV-2026-07', 26, ['U-10', 'U-05'], [520000, 380000, 290000]], ['EV-2026-08', 12, ['U-05'], [145000]], ['EV-2026-09', 17, ['U-11'], [690000]]];
    const STG = [['new', 0.3], ['contacted', 0.25], ['qualified', 0.17], ['proposal', 0.1], ['negotiation', 0.07], ['lost', 0.11]];
    const stage = () => { let r = c.rnd(); for (const s of STG) { r -= s[1]; if (r <= 0) return s[0]; } return 'new'; };
    const VAL = { door: [80, 600], clad: [60, 900], foam: [40, 300] };
    const NOTES = ['مهتم بعينات ألوان C132 وC160', 'طلب زيارة للمصنع في جمصة', 'أرسلنا الكتالوج وقائمة الأسعار على واتساب', 'يقارن بعرض منافس — يطلب خصم كميات', 'ينتظر موافقة الاستشاري على المواصفات', 'طلب عرض سعر مبدئي'];
    const NEXT = ['مكالمة متابعة', 'إرسال عرض سعر', 'زيارة موقع', 'إرسال عينات', 'دعوة لزيارة المصنع'];
    const daysAgo = (d) => Math.round((new Date(today + 'T12:00:00') - new Date(d + 'T12:00:00')) / 86400000);
    let actN = 0;
    PLAN.forEach((p) => {
      const ev = S.events.find((e) => e.id === p[0]); if (!ev) return; const om = ev.id === 'EV-2026-09';
      const dTo = daysAgo(ev.to), dFrom = daysAgo(ev.from); if (dTo < 1) return;
      for (let i = 0; i < p[1]; i++) {
        const stg = i < p[3].length ? 'won' : stage(); const interest = om ? (c.rnd() < 0.7 ? 'clad' : 'door') : c.pick(['door', 'clad', 'foam']);
        const value = stg === 'won' ? p[3][i] : Math.round(c.between(VAL[interest][0], VAL[interest][1]) / 5) * 5000;
        const cday = addDays(today, -c.between(dTo, dFrom)); const createdAt = iso(cday, c.between(11, 19));
        let name, company;
        if (om) { const ln = c.pick(OL); name = c.pick(OF) + ' ' + ln; const co = c.pick(OC); company = co[0] + ln + co[1]; }
        else { name = c.pick(FN) + ' ' + c.pick(LN); const co = c.pick(CO); company = co[0] + c.pick(CN) + co[1]; }
        const id = 'LD-' + yr + '-' + String(++ldN).padStart(4, '0'); const owner = c.pick(p[2]);
        let updatedAt = createdAt;
        if (stg !== 'new') {
          const stale = !om && stg !== 'won' && c.rnd() < 0.4; const last = stale ? c.between(8, Math.max(8, dTo - 1)) : c.between(0, Math.max(0, Math.min(6, dTo - 1)));
          const cnt = stg === 'contacted' || stg === 'lost' ? 1 : c.between(1, 3);
          for (let k = 0; k < cnt; k++) { const ago = Math.min(dTo - 1, last + k * c.between(1, 4)); const at = new Date(Date.now() - (ago * 1440 + c.between(60, 600)) * 60000).toISOString(); if (at > updatedAt) updatedAt = k === 0 ? at : updatedAt; S.activities = S.activities || []; S.activities.push({ id: 'ACT-X' + ++actN, kind: c.pick(['call', 'whatsapp', 'visit', 'meeting']), leadId: id, customerId: null, ownerId: owner, at, note: c.pick(NOTES), done: true }); }
        }
        S.leads.push({ id, name, company, city: c.pick(CITY[ev.id]), interest, interests: [interest], stage: stg, value, ownerId: owner, eventId: ev.id, source: 'معرض', phone: om ? '+968 9' + c.between(1000000, 9999999) : '+20 1' + c.pick(['0', '1', '2', '5']) + c.between(10000000, 99999999), createdAt, updatedAt,
          nextAction: stg === 'won' || stg === 'lost' ? null : c.pick(NEXT), nextAt: addDays(today, c.between(-2, 6)), probability: PROB[stg], score: stg === 'won' ? c.between(80, 96) : stg === 'lost' ? c.between(25, 50) : c.between(38, 90), lostReason: stg === 'lost' ? c.pick(['السعر', 'اختار منافس', 'تأجيل المشروع', 'لا يوجد رد']) : null, consent: true, capturedBy: 'U-33' });
      }
    });
    if (S.meta && S.meta.erpSeq) S.meta.erpSeq.LD = Math.max(S.meta.erpSeq.LD || 0, ldN);
  });

  /* ───────────── budget approval reconcile (idempotent) ───────────── */
  ERP.onApproval('event_budget', (a) => {
    const ev = a.ref && ERP.find('events', a.ref.id); if (!ev) return;
    if (ev.approvalId && ev.approvalId !== a.id) return;
    const cur = ev.approvalStatus || 'pending'; if (['pending', 'changes_requested'].indexOf(cur) < 0) return;
    const tgt = { type: 'event', id: ev.id, label: ev.name };
    if (a.status === 'approved') {
      const ns = ev.status === 'planned' ? 'preparing' : ev.status;
      st.patch('events', ev.id, { approvalStatus: 'approved', approvalId: a.id, budgetApprovedAt: new Date().toISOString(), status: ns });
      SA.audit('EVENT.BUDGET_APPROVED', { target: tgt, before: { approvalStatus: cur, status: ev.status }, after: { approvalStatus: 'approved', status: ns, budget: ev.budget } });
      SA.notify({ title: 'تم اعتماد ميزانية ' + ev.name, body: fmt.money(ev.budget) + ' — ابدأ التجهيز (الحجز، التصميم، العينات).', level: 'info', to: ['R-20'], toUsers: a.requesterId ? [a.requesterId] : [], link: '#/expo/events/' + ev.id });
    } else if (a.status === 'rejected') {
      st.patch('events', ev.id, { approvalStatus: 'rejected', approvalId: a.id });
      SA.audit('EVENT.BUDGET_REJECTED', { target: tgt, before: { approvalStatus: cur }, after: { approvalStatus: 'rejected' } });
      SA.notify({ title: 'رُفضت ميزانية ' + ev.name, body: 'راجع الطلب ' + a.id + ' وعدّل الميزانية.', level: 'action', to: ['R-20'], toUsers: a.requesterId ? [a.requesterId] : [], link: '#/expo/events/' + ev.id });
    } else if (a.status === 'changes_requested' && cur !== 'changes_requested') {
      st.patch('events', ev.id, { approvalStatus: 'changes_requested' });
    } else if (a.status === 'pending' && cur === 'changes_requested') st.patch('events', ev.id, { approvalStatus: 'pending' });
  });

  /* ───────────── styles ───────────── */
  (function css() {
    if (document.querySelector('style[data-mod="expo"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'expo');
    s.textContent = `
.xpo-muted { color: var(--color-text-muted); font-size: 12.5px; }
.xpo-nolink { font-weight: 600; }
.xpo-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; } .xpo-sp { justify-content: space-between; }
.xpo-cell { display: flex; flex-direction: column; line-height: 1.35; min-width: 0; } .xpo-cell small { color: var(--color-text-muted); font-size: 11.5px; }
.xpo-bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin: 4px 0 14px; }
.xpo-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 14px; }
.xpo-card { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--color-border); border-radius: 14px; background: #fff; color: inherit; text-decoration: none; transition: box-shadow .15s, border-color .15s; }
.xpo-card:hover { box-shadow: var(--shadow-float); border-color: var(--eg-navy-tint); }
.xpo-card.is-live { border-color: var(--color-success); box-shadow: 0 0 0 3px var(--color-success-tint); }
.xpo-card.is-past { background: linear-gradient(180deg, #fbfcfd, #fff); }
.xpo-card-top { display: flex; gap: 12px; align-items: flex-start; }
.xpo-date { width: 56px; flex: none; border-radius: 12px; background: var(--eg-navy); color: #fff; text-align: center; padding: 6px 0; display: flex; flex-direction: column; line-height: 1.15; }
.xpo-date b { font: 700 22px var(--font-en); } .xpo-date small { font-size: 11px; opacity: .9; }
.xpo-card.is-past .xpo-date { background: var(--color-neutral-tint); color: var(--color-text); }
.xpo-card-title { min-width: 0; display: flex; flex-direction: column; gap: 3px; } .xpo-card-title b { font-size: 15px; line-height: 1.4; } .xpo-card-title small { color: var(--color-text-muted); font-size: 12px; }
.xpo-chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.xpo-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px dashed var(--color-border); padding-top: 10px; font-size: 12.5px; color: var(--color-text-muted); flex-wrap: wrap; }
.xpo-card-foot b { color: var(--color-text); }
.xpo-fstat { display: flex; flex-direction: column; gap: 1px; line-height: 1.3; } .xpo-fstat small { font-size: 11.5px; color: var(--color-text-muted); } .xpo-fstat b { font-size: 14px; }
.xpo-avatars { padding-inline-start: 8px; }
.xpo-avatars { display: inline-flex; } .xpo-avatars .avatar { width: 28px; height: 28px; font-size: 11px; border: 2px solid #fff; margin-inline-start: -8px; }
.xpo-attn { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.xpo-attn li { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--color-border); font-size: var(--text-dense); }
.xpo-attn li:last-child { border-bottom: 0; } .xpo-attn .xpo-ico { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; flex: none; background: var(--color-warning-tint); color: var(--color-warning); }
.xpo-attn .xpo-ico.is-info { background: var(--color-primary-tint); color: var(--eg-navy); } .xpo-attn .xpo-ico.is-danger { background: var(--color-danger-tint); color: var(--color-danger); }
.xpo-attn span.xpo-grow { flex: 1; min-width: 0; }
.xpo-team { display: flex; flex-direction: column; gap: 10px; }
.xpo-tabs { margin: 6px 0 16px; }
.xpo-ai { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px; margin-bottom: 16px; }
/* calendar */
.xpo-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border: 1px solid var(--color-border); border-radius: 12px; overflow: hidden; background: #fff; }
.xpo-cal-h { background: var(--color-bg-alt); font-size: 12px; font-weight: 700; color: var(--color-text-muted); text-align: center; padding: 8px 4px; border-bottom: 1px solid var(--color-border); }
.xpo-day { min-height: 104px; border-inline-start: 1px solid var(--color-border); border-top: 1px solid var(--color-border); padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.xpo-day:nth-child(7n + 1) { border-inline-start: 0; }
.xpo-day.is-out { background: #fafbfc; } .xpo-day.is-out .xpo-dn { opacity: .45; }
.xpo-day.is-today { background: var(--color-primary-tint); } .xpo-day.is-today .xpo-dn { background: var(--eg-navy); color: #fff; }
.xpo-dn { font: 700 12px var(--font-en); width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; }
.xpo-ev { display: block; font-size: 11.5px; font-weight: 600; line-height: 1.35; padding: 3px 6px; border-radius: 6px; text-decoration: none; color: #fff; background: var(--eg-navy); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.xpo-ev.is-done { background: #8a8a8a; } .xpo-ev.is-visit { background: #147a3d; } .xpo-ev.is-pending { background: #a85a00; } .xpo-ev.is-live { background: #b9141b; }
.xpo-year { position: relative; border: 1px solid var(--color-border); border-radius: 12px; background: #fff; padding: 8px 12px 12px; overflow: hidden; }
.xpo-year-h { display: grid; grid-template-columns: repeat(12, 1fr); font-size: 11.5px; color: var(--color-text-muted); font-weight: 600; text-align: center; border-bottom: 1px solid var(--color-border); padding-bottom: 6px; margin-bottom: 8px; }
.xpo-year-h span { border-inline-start: 1px dashed var(--color-border); } .xpo-year-h span:first-child { border-inline-start: 0; }
.xpo-yrow { position: relative; height: 34px; margin-bottom: 6px; }
.xpo-ybar { position: absolute; top: 3px; height: 28px; border-radius: 7px; background: var(--eg-navy); color: #fff; font-size: 11.5px; font-weight: 600; display: flex; align-items: center; padding-inline: 8px; white-space: nowrap; overflow: visible; text-decoration: none; min-width: 10px; }
.xpo-ybar span { position: absolute; inset-inline-start: calc(100% + 6px); color: var(--color-text); background: rgba(255, 255, 255, .92); padding: 1px 4px; border-radius: 4px; z-index: 2; }
.xpo-ybar.is-done { background: #9aa3ad; } .xpo-ybar.is-visit { background: #147a3d; } .xpo-ybar.is-pending { background: #a85a00; } .xpo-ybar.is-live { background: #b9141b; }
.xpo-ybar.is-flip span { inset-inline-start: auto; inset-inline-end: calc(100% + 6px); }
.xpo-now { position: absolute; top: 30px; bottom: 6px; width: 2px; background: var(--color-accent); z-index: 1; }
.xpo-now::after { content: "اليوم"; position: absolute; top: -2px; inset-inline-start: 4px; font-size: 10.5px; color: var(--color-accent); font-weight: 700; }
.xpo-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--color-text-muted); } .xpo-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-inline-end: 5px; vertical-align: middle; }
/* capture (tablet mode) */
.xpo-tablet { max-width: 1180px; margin: 0 auto; }
.xpo-tablet:fullscreen { background: var(--color-bg-alt); padding: 24px; overflow: auto; }
.xpo-cap { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(280px, 1fr); gap: 18px; align-items: start; }
.xpo-form { background: #fff; border: 1px solid var(--color-border); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.xpo-form .input, .xpo-form .select, .xpo-form .textarea { font-size: 18px; min-height: 56px; border-radius: 12px; }
.xpo-form .textarea { min-height: 84px; }
.xpo-form .label { font-size: 14px; }
.xpo-g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.xpo-evsel { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--eg-navy); color: #fff; }
.xpo-evsel .select { background: rgba(255, 255, 255, .12); color: #fff; border-color: rgba(255, 255, 255, .35); font-size: 16px; min-height: 48px; flex: 1; }
.xpo-evsel .select option { color: #000; }
.xpo-evnote { display: flex; gap: 6px; align-items: flex-start; margin: 8px 2px 0; font-size: 13px; color: var(--color-text-muted); line-height: 1.6; } .xpo-evnote svg { flex: none; margin-top: 3px; }
.xpo-chipset { display: flex; flex-wrap: wrap; gap: 10px; }
.xpo-chip { min-height: 52px; padding-inline: 20px; border-radius: 999px; border: 2px solid var(--color-border-strong); background: #fff; font: 600 16px var(--font-ar); color: var(--color-text); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
.xpo-chip[aria-pressed="true"] { background: var(--eg-navy); border-color: var(--eg-navy); color: #fff; }
.xpo-chip kbd { font: 700 11px var(--font-en); background: rgba(0, 0, 0, .08); border-radius: 5px; padding: 1px 5px; }
.xpo-chip[aria-pressed="true"] kbd { background: rgba(255, 255, 255, .2); }
.xpo-consent { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--color-bg-alt); font-size: 15px; cursor: pointer; }
.xpo-consent input { width: 24px; height: 24px; flex: none; margin-top: 2px; }
.xpo-actions { display: flex; gap: 10px; flex-wrap: wrap; } .xpo-actions .btn { min-height: 56px; font-size: 17px; padding-inline: 24px; } .xpo-actions .xpo-grow { flex: 1; }
.xpo-scan { position: relative; height: 150px; border-radius: 14px; overflow: hidden; background: linear-gradient(135deg, #f4f7fb, #e8eef6); border: 2px dashed var(--eg-navy-soft); display: grid; place-items: center; }
.xpo-bcard { width: 250px; height: 120px; border-radius: 10px; background: #fff; box-shadow: 0 6px 18px rgba(1, 40, 100, .15); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.xpo-bcard i { display: block; height: 8px; border-radius: 4px; background: #dbe3ee; } .xpo-bcard i:nth-child(1) { width: 60%; background: var(--eg-navy-tint); height: 12px; } .xpo-bcard i:nth-child(2) { width: 45%; } .xpo-bcard i:nth-child(3) { width: 75%; } .xpo-bcard i:nth-child(4) { width: 35%; }
.xpo-scanline { position: absolute; inset-inline: 0; height: 3px; background: linear-gradient(90deg, transparent, #b9141b, transparent); box-shadow: 0 0 12px #b9141b; top: 0; animation: xpo-scan 1.2s ease-in-out infinite; }
@keyframes xpo-scan { 0% { top: 6%; } 50% { top: 90%; } 100% { top: 6%; } }
.xpo-filled { animation: xpo-fill 1.4s ease-out; } @keyframes xpo-fill { 0% { background: #fff6d6; } 100% { background: #fff; } }
.xpo-side { display: flex; flex-direction: column; gap: 14px; }
.xpo-counter { background: var(--eg-navy); color: #fff; border-radius: 18px; padding: 18px; display: flex; flex-direction: column; gap: 4px; }
.xpo-counter b { font: 700 46px var(--font-en); line-height: 1; } .xpo-counter small { opacity: .85; }
.xpo-last { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.xpo-last li { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--color-border); font-size: 13px; } .xpo-last li:last-child { border-bottom: 0; }
.xpo-flash { border-radius: 14px; padding: 14px 16px; background: var(--color-success-tint); border: 1px solid #bfe3cc; display: flex; gap: 12px; align-items: center; animation: xpo-pop .35s ease-out; }
.xpo-flash .icon { color: var(--color-success); width: 28px; height: 28px; } @keyframes xpo-pop { 0% { transform: scale(.97); opacity: .3; } 100% { transform: none; opacity: 1; } }
.xpo-kbd { font-size: 12.5px; color: var(--color-text-muted); display: flex; gap: 12px; flex-wrap: wrap; } .xpo-kbd kbd { font: 700 11px var(--font-en); border: 1px solid var(--color-border-strong); border-bottom-width: 2px; border-radius: 5px; padding: 1px 6px; background: #fff; margin-inline-end: 4px; }
.xpo-score { font: 700 13px var(--font-en); border-radius: 8px; padding: 2px 8px; background: var(--color-primary-tint); color: var(--eg-navy); }
.xpo-score.is-hot { background: var(--color-danger-tint); color: var(--color-danger); } .xpo-score.is-warm { background: var(--color-warning-tint); color: var(--color-warning); }
.xpo-best { border: 2px solid var(--color-success) !important; }
.xpo-tag-best { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; color: #fff; background: var(--color-success); border-radius: 6px; padding: 1px 8px; }
@media (max-width: 900px) { .xpo-cap { grid-template-columns: 1fr; } .xpo-g2 { grid-template-columns: 1fr; } .xpo-day { min-height: 70px; } }
@media (prefers-reduced-motion: reduce) { .xpo-scanline { animation: none; top: 50%; } .xpo-filled, .xpo-flash { animation: none; } }`;
    document.head.appendChild(s);
  })();

  /* ───────────── helpers ───────────── */
  const today = () => ERP.day(0);
  const nowIso = () => new Date().toISOString();
  const me = () => SA.session.userId || 'SYSTEM';
  const localDay = (iso) => (iso ? dstr(new Date(iso)) : '');
  const canRoute = (route) => { try { const p = SA.router.parse('#/' + route); return !!(p.module && SA.canOpen(p.module)); } catch (e) { return false; } };
  function L(id, label) { if (!id) return h('span', {}, '—'); const r = ERP.route(id); if (r && canRoute(r)) return U.docLink(id, label); return h('span.num.xpo-nolink', { title: r ? 'لا تملك صلاحية فتح هذا المستند (أو الشاشة غير متاحة)' : '' }, label || id); }
  function liveView(root, build, paths) { let off = SA.live(root, build, paths); return { refresh() { off(); off = SA.live(root, build, paths); }, cleanup() { off(); } }; }
  const events = () => get('events');
  const expenses = () => st.get('eventExpenses') || [];
  const ensureExpenses = () => { if (!Array.isArray(st.get('eventExpenses'))) st.set('eventExpenses', []); };
  const leadsOf = (evId) => get('leads').filter((l) => l.eventId === evId);
  const expOf = (evId) => expenses().filter((x) => x.eventId === evId);
  const QUAL = ['qualified', 'proposal', 'negotiation', 'won'];
  const OPEN_ST = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
  function evStatus(ev) {
    if (ev.status === 'cancelled') return 'cancelled'; const td = today();
    if (ev.status === 'done') return 'done';
    if (td > ev.to && ['planned', 'preparing', 'live'].indexOf(ev.status) >= 0) return 'done';
    if (ev.status === 'live' || (td >= ev.from && td <= ev.to && ['planned', 'preparing'].indexOf(ev.status) >= 0)) return 'live';
    return ev.status;
  }
  function stats(ev) {
    const Ls = leadsOf(ev.id); const won = Ls.filter((l) => l.stage === 'won'); const open = Ls.filter((l) => OPEN_ST.indexOf(l.stage) >= 0);
    const cost = ev.spent || 0; const wonV = sum(won, (l) => l.value || 0); const pipe = sum(open, (l) => l.value || 0); const wpipe = sum(open, (l) => (l.value || 0) * (l.probability != null ? l.probability : PROB[l.stage] || 0));
    return { leads: Ls.length, qualified: Ls.filter((l) => QUAL.indexOf(l.stage) >= 0).length, won: won.length, wonV, pipe, wpipe, cost, cpl: Ls.length ? cost / Ls.length : null, roi: cost && Ls.length ? (wonV - cost) / cost : null, budgetUse: ev.budget ? cost / ev.budget : 0, target: ev.leadsTarget || 0, list: Ls };
  }
  const lastActivity = (lead) => { const acts = get('activities').filter((a) => a.leadId === lead.id).map((a) => a.at).sort(); return acts.length ? acts[acts.length - 1] : null; };
  const staleOf = (evId) => leadsOf(evId).filter((l) => OPEN_ST.indexOf(l.stage) >= 0).map((l) => { const la = lastActivity(l); const ref = la || l.createdAt; return { lead: l, last: la, days: Math.floor((Date.now() - new Date(ref).getTime()) / 86400000) }; }).filter((x) => x.days >= 7).sort((a, b) => b.days - a.days);
  const dateRange = (ev) => (ev.from === ev.to ? fmt.date(ev.from) : fmt.date(ev.from) + ' ← ' + fmt.date(ev.to));
  const countdown = (ev) => { const n = ERP.daysBetween(today(), ev.from); return n > 10 ? 'بعد ' + n + ' يومًا' : n > 2 ? 'بعد ' + n + ' أيام' : n === 2 ? 'بعد يومين' : n === 1 ? 'غدًا' : n === 0 ? 'يبدأ اليوم' : null; };
  const pctTxt = (v) => (v == null ? '—' : Math.round(v * 100) + '%');
  const scoreChip = (n) => h('span.xpo-score' + (n >= 75 ? '.is-hot' : n >= 55 ? '.is-warm' : ''), { title: 'تقييم العميل المحتمل' }, String(n || 0));
  const lockedR = (perm) => (SA.can(perm) ? '' : 'ليست من صلاحياتك (' + perm + ')');

  /* ───────────── actions ───────────── */
  function eventModal(ev) {
    const isNew = !ev; ev = ev || { name: '', kind: 'exhibition', city: '', venue: '', from: ERP.day(30), to: ERP.day(33), budget: null, booth: '', leadsTarget: 30, teamIds: [me()].filter((x) => x !== 'SYSTEM'), notes: '' };
    const pool = (get('users') || []).filter((u) => u.status === 'active' && ['R-20', 'R-04', 'R-03', 'R-05'].indexOf(u.roleId) >= 0 || ['U-33', 'U-05', 'U-10', 'U-11', 'U-13'].indexOf(u.id) >= 0);
    const fName = SA.form.field({ name: 'name', label: 'اسم المعرض/الفعالية', required: true, value: ev.name, placeholder: 'مثال: معرض القاهرة الدولي للبناء' });
    const fKind = SA.form.field({ name: 'kind', label: 'النوع', type: 'select', value: ev.kind, options: Object.keys(KIND).map((k) => [k, KIND[k]]) });
    const fCity = SA.form.field({ name: 'city', label: 'المدينة', required: true, value: ev.city });
    const fVenue = SA.form.field({ name: 'venue', label: 'المكان', value: ev.venue });
    const fFrom = SA.form.field({ name: 'from', label: 'من', type: 'date', required: true, value: ev.from });
    const fTo = SA.form.field({ name: 'to', label: 'إلى', type: 'date', required: true, value: ev.to });
    const fBudget = SA.form.field({ name: 'budget', label: 'الميزانية المطلوبة (ج.م)', type: 'number', required: true, value: ev.budget, min: 0, hint: isNew ? 'تُرسل للمدير العام للاعتماد' : 'زيادة الميزانية تحتاج اعتمادًا جديدًا' });
    const fBooth = SA.form.field({ name: 'booth', label: 'الجناح', value: ev.booth || '', placeholder: 'مثال: جناح 24 م² — صالة 1' });
    const fTarget = SA.form.field({ name: 'leadsTarget', label: 'المستهدف من العملاء المحتملين', type: 'number', value: ev.leadsTarget, min: 0 });
    const fTeam = SA.form.field({ name: 'teamIds', label: 'الفريق', type: 'multi', value: ev.teamIds || [], options: pool.map((u) => [u.id, u.name, SA.roleName(u.roleId)]) });
    const fNotes = SA.form.field({ name: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2, value: ev.notes || '' });
    const m = SA.modal({ title: isNew ? 'معرض/فعالية جديدة' : 'تعديل ' + ev.name, icon: 'calendar', size: 'lg', body: h('div', {}, fName.el, h('div.sap-formgrid', {}, fKind.el, fCity.el, fVenue.el, fFrom.el, fTo.el, fBudget.el, fBooth.el, fTarget.el), fTeam.el, fNotes.el),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: save }, SA.icon('check', 'icon-sm'), isNew ? 'إنشاء وإرسال الميزانية للاعتماد' : 'حفظ')] });
    async function save() {
      const g = SA.form.group([fName, fCity, fFrom, fTo, fBudget]); if (!g.validate()) return;
      if (fTo.get() < fFrom.get()) { fTo.error('تاريخ النهاية قبل البداية'); return; }
      if (!(fBudget.get() > 0)) { fBudget.error('أدخل ميزانية صحيحة'); return; }
      const v = { name: fName.get().trim(), kind: fKind.get(), city: fCity.get().trim(), venue: fVenue.get().trim(), from: fFrom.get(), to: fTo.get(), budget: Math.round(fBudget.get()), booth: fBooth.get().trim() || null, leadsTarget: Math.max(0, Math.round(fTarget.get() || 0)), teamIds: fTeam.get(), notes: fNotes.get().trim() };
      m.setBusy(true); let id = ev.id;
      try {
        await SA.api(() => {
          const ctxRows = (b) => [['المعرض', v.name], ['المكان', v.city + (v.venue ? ' — ' + v.venue : '')], ['التاريخ', fmt.date(v.from) + ' ← ' + fmt.date(v.to)], ['الميزانية', fmt.money(b)], ['المستهدف', v.leadsTarget + ' عميل محتمل'], ['الفريق', v.teamIds.map(SA.userName).join('، ') || '—']];
          if (isNew) {
            id = ERP.no('EV', 2); while (ERP.find('events', id)) id = ERP.no('EV', 2);
            st.insert('events', Object.assign({ id, status: 'planned', spent: 0, samples: [], approvalStatus: 'pending', approvalId: null, createdAt: nowIso(), createdBy: me() }, v));
            const ap = SA.requestApproval({ type: 'event_budget', area: 'expo', title: 'ميزانية ' + v.name, amount: v.budget, chain: [{ roleId: 'R-02', label: 'المدير العام' }], context: ctxRows(v.budget), ref: { type: 'event_budget', id } });
            st.patch('events', id, { approvalId: ap.id });
            SA.audit('EVENT.CREATED', { target: { type: 'event', id, label: v.name }, after: { budget: v.budget, from: v.from, to: v.to, approval: ap.id } });
          } else {
            const before = { name: ev.name, city: ev.city, from: ev.from, to: ev.to, budget: ev.budget, leadsTarget: ev.leadsTarget, booth: ev.booth };
            const more = v.budget > (ev.budget || 0) && ev.approvalStatus !== 'pending';
            st.patch('events', ev.id, v);
            if (more) { const ap = SA.requestApproval({ type: 'event_budget', area: 'expo', title: 'زيادة ميزانية ' + v.name + ' (من ' + fmt.short(ev.budget) + ')', amount: v.budget, chain: [{ roleId: 'R-02', label: 'المدير العام' }], context: ctxRows(v.budget).concat([['الميزانية السابقة', fmt.money(ev.budget)]]), ref: { type: 'event_budget', id: ev.id } }); st.patch('events', ev.id, { approvalStatus: 'pending', approvalId: ap.id }); }
            SA.audit('EVENT.UPDATED', { target: { type: 'event', id: ev.id, label: v.name }, before, after: { name: v.name, city: v.city, from: v.from, to: v.to, budget: v.budget, leadsTarget: v.leadsTarget, booth: v.booth } });
          }
        });
      } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(); SA.toast(isNew ? 'تم إنشاء ' + id + ' وإرسال الميزانية للمدير العام' : 'تم حفظ التعديلات', 'success'); if (isNew) SA.nav('expo/events/' + id);
    }
  }
  function expenseModal(ev) {
    const fCat = SA.form.field({ name: 'category', label: 'البند', type: 'select', value: 'printing', options: CATS.map((c) => [c[0], c[1]]) });
    const fDesc = SA.form.field({ name: 'description', label: 'البيان', required: true, placeholder: 'مثال: طباعة 2,000 كتالوج + 4 رول أب' });
    const fVendor = SA.form.field({ name: 'vendor', label: 'المورد/الجهة', placeholder: 'اسم المورد' });
    const fAmt = SA.form.field({ name: 'amount', label: 'المبلغ (ج.م)', type: 'number', required: true, min: 1 });
    const fDate = SA.form.field({ name: 'date', label: 'التاريخ', type: 'date', required: true, value: today() });
    const fSt = SA.form.field({ name: 'status', label: 'الحالة', type: 'select', value: 'committed', options: [['committed', 'التزام — يُصرف عبر المالية'], ['paid', 'مدفوع']] });
    const fMethod = SA.form.field({ name: 'method', label: 'طريقة الدفع', type: 'select', value: 'transfer', options: [['transfer', 'تحويل بنكي'], ['cash', 'نقدي'], ['cheque', 'شيك']] });
    const left = (ev.budget || 0) - (ev.spent || 0); const info = h('div');
    const upd = () => { SA.clear(info); const a = Number(fAmt.get()) || 0; const after = (ev.spent || 0) + a; info.appendChild(ERP.chart.meter(Math.min(1, ev.budget ? after / ev.budget : 0), { label: 'الميزانية بعد التسجيل', tone: after > ev.budget ? 'danger' : after > ev.budget * 0.9 ? 'warning' : 'primary', text: fmt.money(after) + ' / ' + fmt.money(ev.budget) })); if (after > ev.budget) info.appendChild(SA.alert('warning', 'المصروف سيتجاوز الميزانية المعتمدة بـ ' + fmt.money(after - ev.budget) + ' — سيُخطر المدير العام.')); };
    fAmt.input.addEventListener('input', upd);
    const m = SA.modal({ title: 'تسجيل مصروف — ' + ev.name, icon: 'coins', size: 'md', body: h('div', {}, h('div.sap-formgrid', {}, fCat.el, fAmt.el, fDate.el, fSt.el), fDesc.el, h('div.sap-formgrid', {}, fVendor.el, fMethod.el), info, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'المتبقي من الميزانية: ', h('b.num', {}, fmt.money(left)), ' · الصرف الفعلي يتم بسند صرف من المالية (فصل المهام).'))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: save }, SA.icon('check', 'icon-sm'), 'تسجيل المصروف')] });
    upd();
    async function save() {
      const g = SA.form.group([fDesc, fAmt, fDate]); if (!g.validate()) return; const amt = Math.round(Number(fAmt.get())); if (!(amt > 0)) { fAmt.error('أدخل مبلغًا صحيحًا'); return; }
      const over = (ev.spent || 0) + amt > (ev.budget || 0);
      m.setBusy(true); let rec = null;
      try {
        await SA.api(() => {
          ensureExpenses(); const n = expenses().reduce((mx, x) => Math.max(mx, +String(x.id).replace(/\D/g, '') || 0), 1000) + 1;
          rec = { id: 'EX-' + n, eventId: ev.id, category: fCat.get(), description: fDesc.get().trim(), vendor: fVendor.get().trim() || '—', amount: amt, date: fDate.get(), status: fSt.get(), method: fMethod.get(), by: me(), createdAt: nowIso() };
          st.insert('eventExpenses', rec, true); st.patch('events', ev.id, (e) => { e.spent = (e.spent || 0) + amt; });
          SA.audit('EVENT.EXPENSE_ADDED', { target: { type: 'event', id: ev.id, label: ev.name }, after: { expense: rec.id, category: catLabel(rec.category), amount: amt, status: rec.status, spent: (ev.spent || 0) + amt } });
          if (over) SA.notify({ title: 'تجاوز ميزانية معرض: ' + ev.name, body: 'المصروف ' + fmt.money((ev.spent || 0) + amt) + ' من ميزانية ' + fmt.money(ev.budget), level: 'action', to: ['R-02', 'R-01'], link: '#/expo/events/' + ev.id + '?tab=budget' });
          if (rec.status === 'committed') SA.notify({ title: 'التزام مصروف معرض للصرف: ' + fmt.money(amt), body: ev.name + ' — ' + rec.description, level: 'info', to: ['R-07'], link: '#/expo/events/' + ev.id + '?tab=budget' });
        });
      } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(); SA.toast('تم تسجيل ' + rec.id + ' — ' + fmt.money(amt), over ? 'warn' : 'success');
    }
  }
  function samplesModal(ev) {
    const fg = get('items').filter((i) => i.kind === 'fg');
    const fItem = SA.form.field({ name: 'itemId', label: 'الصنف', type: 'select', options: fg.map((i) => [i.id, i.name + ' — متاح ' + fmt.num(ERP.stock.available(i.id, 'W-01'))]), onChange: () => upd() });
    const fQty = SA.form.field({ name: 'qty', label: 'الكمية', type: 'number', required: true, value: 1, min: 1 });
    const info = h('div'); const upd = () => { SA.clear(info); const id = fItem.get(); const av = ERP.stock.available(id, 'W-01'); info.appendChild(SA.kv([['متاح في مخزن المنتج التام (W-01)', fmt.num(av)], ['رصيد صالة العرض (W-04)', fmt.num(ERP.stock.qty(id, 'W-04'))], ['قيمة القطعة (سعر القائمة)', U.money((ERP.item(id) || {}).price)], ['تكلفة القطعة', U.cost((ERP.item(id) || {}).stdCost)]])); };
    const m = SA.modal({ title: 'إرسال عينات — ' + ev.name, icon: 'box', size: 'md', body: h('div', {}, fItem.el, fQty.el, info, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'تحويل مخزني من مخزن المنتج التام W-01 إلى صالة العرض W-04 (مخزن العينات والمعارض) — يظهر في حركات المخزون.'))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: save }, SA.icon('swap', 'icon-sm'), 'تحويل العينات')] });
    upd();
    async function save() {
      if (!fQty.validate()) return; const itemId = fItem.get(); const q = Math.round(Number(fQty.get())); const av = ERP.stock.available(itemId, 'W-01');
      if (!(q > 0)) { fQty.error('أدخل كمية صحيحة'); return; } if (q > av) { fQty.error('المتاح ' + fmt.num(av) + ' فقط (غير المحجوز)'); return; }
      m.setBusy(true);
      try {
        await SA.api(() => {
          ERP.stock.transfer(itemId, ERP.stock.FG, 'W-04', q, { type: 'event', id: ev.id }, 'عينات معرض — ' + ev.name);
          st.patch('events', ev.id, (e) => { e.samples = (e.samples || []).slice(); const x = e.samples.find((s) => s.itemId === itemId); if (x) x.qty += q; else e.samples.push({ itemId, qty: q }); e.samplesLog = (e.samplesLog || []).concat([{ at: nowIso(), itemId, qty: q, by: me() }]); });
          SA.audit('STOCK.TRANSFERRED', { target: { type: 'event', id: ev.id, label: ev.name }, after: { item: ERP.itemName(itemId), qty: q, from: 'W-01', to: 'W-04' } });
        });
      } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(); SA.toast('تم تحويل ' + q + ' × ' + ERP.itemName(itemId) + ' إلى صالة العرض', 'success');
    }
  }
  async function remind(ev, rows) {
    if (!rows.length) return;
    try {
      await SA.api(() => {
        const by = {}; rows.forEach((x) => { (by[x.lead.ownerId] = by[x.lead.ownerId] || []).push(x.lead); });
        Object.keys(by).forEach((uid) => SA.notify({ title: 'متابعة مطلوبة: ' + by[uid].length + ' عميل محتمل من ' + ev.name, body: by[uid].slice(0, 3).map((l) => l.name + ' (' + l.company + ')').join('، ') + (by[uid].length > 3 ? '…' : '') + ' — بدون تواصل منذ أكثر من 7 أيام.', level: 'action', toUsers: [uid], link: '#/crm/leads' }));
        SA.audit('EVENT.FOLLOWUP_REMINDED', { target: { type: 'event', id: ev.id, label: ev.name }, after: { leads: rows.length, owners: Object.keys(by).map(SA.userName).join('، ') } });
      });
    } catch (e) { return SA.fail(e); }
    SA.toast('تم تذكير المندوبين بـ ' + rows.length + ' عميل محتمل', 'success');
  }
  async function setStatus(ev, ns) {
    const r = await SA.confirm({ title: ns === 'live' ? 'بدء ' + ev.name : 'إنهاء ' + ev.name, text: ns === 'live' ? 'تتحول الفعالية إلى «جارٍ الآن» وتصبح الافتراضية في شاشة تسجيل الزوار.' : 'تتحول الفعالية إلى «انتهى» ويبدأ قياس العائد والمتابعة.', confirmLabel: 'تأكيد' });
    if (!r.ok) return;
    try { await SA.api(() => { st.patch('events', ev.id, { status: ns }); SA.audit('EVENT.UPDATED', { target: { type: 'event', id: ev.id, label: ev.name }, before: { status: ev.status }, after: { status: ns } }); }); } catch (e) { return SA.fail(e); }
    SA.toast(ns === 'live' ? 'بدأ ' + ev.name : 'انتهى ' + ev.name, 'success');
  }

  /* ───────────── fallback insights (when mod-ai has none) ───────────── */
  function insights() {
    let list = []; try { list = U.insights('expo', 3) || []; } catch (e) { list = []; }
    if (list.length) return list;
    const done = events().filter((e) => evStatus(e) === 'done').map((e) => ({ e, s: stats(e) })).filter((x) => x.s.roi != null);
    const best = done.slice().sort((a, b) => b.s.roi - a.s.roi)[0]; const worst = done.slice().sort((a, b) => a.s.roi - b.s.roi)[0];
    const stale = events().reduce((n, e) => n + staleOf(e.id).length, 0); const staleEv = events().map((e) => ({ e, n: staleOf(e.id).length })).sort((a, b) => b.n - a.n)[0];
    const pend = events().find((e) => e.approvalStatus === 'pending' && e.approvalId);
    const out = [];
    if (best) out.push(U.aiCard({ tone: 'success', title: 'أعلى عائد: ' + best.e.name, text: 'العائد ' + pctTxt(best.s.roi) + ' بتكلفة ' + fmt.short(best.s.cpl) + ' لكل عميل محتمل' + (worst && worst !== best ? ' — مقابل ' + pctTxt(worst.s.roi) + ' في ' + worst.e.name + '. كرّر نفس حجم الجناح والفريق.' : '.'), actions: [{ label: 'فتح العائد', route: 'expo/events/' + best.e.id + '?tab=roi' }] }));
    if (stale && staleEv) out.push(U.aiCard({ tone: 'warning', title: stale + ' عميل محتمل من المعارض بلا متابعة منذ أكثر من 7 أيام', text: 'أكثرهم من ' + staleEv.e.name + ' (' + staleEv.n + '). العملاء المحتملون يبردون بعد أسبوع — ذكّر المندوبين الآن.', actions: [{ label: 'قائمة المتابعة', route: 'expo/events/' + staleEv.e.id + '?tab=followup' }] }));
    if (pend) out.push(U.aiCard({ tone: 'info', title: 'ميزانية ' + pend.name + ' بانتظار الاعتماد', text: 'المعرض ' + (countdown(pend) || '') + ' — تأخير الاعتماد يؤخر حجز التصميم والطباعة.', actions: canRoute('approvals/' + pend.approvalId) ? [{ label: 'فتح الطلب ' + pend.approvalId, route: 'approvals/' + pend.approvalId }] : [] }));
    return out;
  }

  /* ───────────── 1. expo-events ───────────── */
  function evCard(ev) {
    const s = stats(ev); const es = evStatus(ev); const d = new Date(ev.from + 'T12:00:00'); const past = es === 'done'; const cd = countdown(ev);
    return h('a.xpo-card' + (es === 'live' ? '.is-live' : '') + (past ? '.is-past' : ''), { href: '#/expo/events/' + ev.id },
      h('div.xpo-card-top', {}, h('div.xpo-date', {}, h('b', {}, String(d.getDate())), h('small', {}, ERP.months[d.getMonth()])), h('div.xpo-card-title', {}, h('b', {}, ev.name), h('small', {}, (ev.city || '') + (ev.venue ? ' · ' + ev.venue : '')), h('small', {}, dateRange(ev)))),
      h('div.xpo-chips', {}, U.status('event', es), SA.chip(KIND[ev.kind] || ev.kind, 'neutral'), ev.approvalStatus && ev.approvalStatus !== 'approved' ? U.status('evbudget', ev.approvalStatus) : null, cd && !past ? SA.chip(cd, 'info') : null),
      ERP.chart.meter(Math.min(1, s.budgetUse), { label: 'المصروف من الميزانية', tone: s.budgetUse > 1 ? 'danger' : s.budgetUse > 0.92 ? 'warning' : 'primary', text: fmt.short(s.cost) + ' / ' + fmt.short(ev.budget) }),
      ERP.chart.meter(s.target ? Math.min(1, s.leads / s.target) : 0, { label: 'العملاء المحتملون', tone: s.target && s.leads / s.target >= 0.8 ? 'success' : past ? 'warning' : 'primary', text: s.leads + ' / ' + s.target }),
      h('div.xpo-card-foot', {}, h('span.xpo-fstat', {}, h('small', {}, 'مكسوب'), h('b.num', {}, fmt.short(s.wonV))), h('span.xpo-fstat', {}, h('small', {}, 'فرص مفتوحة'), h('b.num', {}, fmt.short(s.pipe))), h('span.xpo-avatars', { title: (ev.teamIds || []).map(SA.userName).join('، ') }, (ev.teamIds || []).slice(0, 4).map((id) => SA.avatar(SA.userName(id))))));
  }
  function renderEvents(root, ctx) {
    if (ctx.path[0]) return renderEvent(root, ctx, ctx.path[0]);
    ctx.setCrumbs([{ label: 'المعارض والفعاليات' }, { label: 'كل الفعاليات' }]);
    let filter = ['upcoming', 'live', 'done'].indexOf(ctx.params.f) >= 0 ? ctx.params.f : 'all'; let mode = ctx.params.view === 'table' ? 'table' : 'cards'; let q = ''; let tState = null;
    const match = (ev) => { const es = evStatus(ev); if (filter === 'upcoming' && ['planned', 'preparing'].indexOf(es) < 0) return false; if (filter === 'live' && es !== 'live') return false; if (filter === 'done' && es !== 'done') return false; return !q || (ev.name + ' ' + ev.city + ' ' + (ev.venue || '') + ' ' + ev.id).toLowerCase().indexOf(q.toLowerCase()) >= 0; };
    let listHost = null;
    const drawList = () => {
      if (!listHost) return; SA.clear(listHost);
      const list = events().filter(match).sort((a, b) => { const r = (e) => ({ live: 0, preparing: 1, planned: 1, done: 2, cancelled: 3 })[evStatus(e)]; return r(a) - r(b) || (r(a) === 2 ? b.from.localeCompare(a.from) : a.from.localeCompare(b.from)); });
      if (mode === 'cards') { listHost.appendChild(list.length ? h('div.xpo-cards', {}, list.map(evCard)) : SA.empty({ icon: 'calendar', title: 'لا توجد فعاليات مطابقة', text: 'غيّر الفلتر أو أنشئ معرضًا جديدًا.', action: { label: 'معرض جديد', perm: 'expo.events.create', onClick: () => eventModal(null) } })); return; }
      const t = SA.table({ caption: 'الفعاليات', rows: list, initial: tState || undefined, onChange: (s) => { tState = s; }, pageSize: 10, onRowClick: (ev) => SA.nav('expo/events/' + ev.id),
        columns: [
          { key: 'name', label: 'الفعالية', sort: true, render: (ev) => h('span.xpo-cell', {}, h('a.erp-doc', { href: '#/expo/events/' + ev.id }, ev.name), h('small', {}, ev.id + ' · ' + (KIND[ev.kind] || ''))) },
          { key: 'from', label: 'التاريخ', sort: true, render: (ev) => h('span.xpo-cell', {}, h('b', {}, fmt.date(ev.from)), h('small', {}, countdown(ev) || (ev.from !== ev.to ? 'حتى ' + fmt.date(ev.to) : ''))) },
          { key: 'city', label: 'المدينة', sort: true },
          { key: 'status', label: 'الحالة', sort: true, value: (ev) => evStatus(ev), render: (ev) => U.status('event', evStatus(ev)) },
          { key: 'budget', label: 'الميزانية / المصروف', sort: true, render: (ev) => h('span.xpo-cell', {}, h('b.num', {}, fmt.short(ev.budget)), h('small.num', {}, 'مصروف ' + fmt.short(ev.spent))) },
          { key: 'leads', label: 'العملاء المحتملون', sort: true, value: (ev) => leadsOf(ev.id).length, render: (ev) => h('span.num', {}, leadsOf(ev.id).length + ' / ' + (ev.leadsTarget || 0)) },
          { key: 'won', label: 'المكسوب', sort: true, value: (ev) => stats(ev).wonV, render: (ev) => h('span.num', {}, fmt.short(stats(ev).wonV)) },
          { key: 'approval', label: 'الميزانية', render: (ev) => U.status('evbudget', ev.approvalStatus || 'approved') }
        ], empty: { icon: 'calendar', title: 'لا توجد فعاليات' } });
      listHost.appendChild(SA.card({ flush: true }, t.el));
    };
    const build = () => {
      const yr = String(new Date().getFullYear()); const all = events(); const thisYear = all.filter((e) => e.from.slice(0, 4) === yr);
      const S = thisYear.map(stats); const next = all.filter((e) => ['planned', 'preparing'].indexOf(evStatus(e)) >= 0).sort((a, b) => a.from.localeCompare(b.from))[0];
      const pendAp = all.filter((e) => e.approvalStatus === 'pending'); const staleN = all.reduce((n, e) => n + staleOf(e.id).length, 0);
      const attn = [];
      pendAp.forEach((e) => attn.push(h('li', {}, h('span.xpo-ico', {}, SA.icon('clock', 'icon-sm')), h('span.xpo-grow', {}, h('b', {}, 'ميزانية ' + e.name + ' بانتظار الاعتماد'), h('div.xpo-muted', {}, fmt.money(e.budget) + ' · ', e.approvalId ? L(e.approvalId) : '')), SA.btn({ label: 'فتح', kind: 'ghost', size: 'sm', onClick: () => SA.nav('expo/events/' + e.id) }))));
      all.filter((e) => ['planned', 'preparing'].indexOf(evStatus(e)) >= 0 && ERP.daysBetween(today(), e.from) <= 21 && e.kind === 'exhibition').forEach((e) => { const sent = (e.samplesLog || []).length; if (!sent) attn.push(h('li', {}, h('span.xpo-ico.is-info', {}, SA.icon('box', 'icon-sm')), h('span.xpo-grow', {}, h('b', {}, e.name + ' ' + (countdown(e) || '')), h('div.xpo-muted', {}, 'لم تُرسل العينات لصالة العرض بعد (' + (e.samples || []).length + ' صنف مخطط)')), SA.btn({ label: 'العينات', kind: 'ghost', size: 'sm', onClick: () => SA.nav('expo/events/' + e.id + '?tab=samples') }))); });
      all.map((e) => ({ e, n: staleOf(e.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 2).forEach((x) => attn.push(h('li', {}, h('span.xpo-ico.is-danger', {}, SA.icon('alert', 'icon-sm')), h('span.xpo-grow', {}, h('b', {}, x.n + ' عميل محتمل بلا متابعة — ' + x.e.name), h('div.xpo-muted', {}, 'آخر تواصل منذ أكثر من 7 أيام')), SA.btn({ label: 'المتابعة', kind: 'ghost', size: 'sm', onClick: () => SA.nav('expo/events/' + x.e.id + '?tab=followup') }))));
      const segF = SA.segmented([['all', 'الكل'], ['upcoming', 'القادمة'], ['live', 'الجارية'], ['done', 'المنتهية']], filter, (v) => { filter = v; drawList(); });
      const segV = SA.segmented([['cards', 'بطاقات'], ['table', 'جدول']], mode, (v) => { mode = v; drawList(); });
      const search = h('div.input-wrap.sap-search', {}, SA.icon('search'), h('input.input', { type: 'search', placeholder: 'بحث بالاسم أو المدينة…', 'aria-label': 'بحث في الفعاليات', value: q, oninput: SA.debounce((e) => { q = e.target.value; drawList(); }, 120) }));
      listHost = h('div');
      const out = h('div', {},
        SA.pageHead({ title: 'المعارض والفعاليات', desc: 'الميزانية والمصروف والعينات والزوار والعائد لكل معرض — مربوطة بالمبيعات (CRM) والمخزون والاعتمادات.', actions: [SA.btn({ label: 'تسجيل زوار الجناح', icon: 'scan', kind: 'ghost', perm: 'expo.leads.capture', onClick: () => SA.nav('expo/capture') }), SA.btn({ label: 'معرض جديد', icon: 'plus', perm: 'expo.events.create', onClick: () => eventModal(null) })] }),
        U.kpis([
          U.kpi({ label: 'فعاليات ' + yr, value: fmt.num(thisYear.length), sub: thisYear.filter((e) => evStatus(e) === 'done').length + ' انتهت · ' + thisYear.filter((e) => ['planned', 'preparing', 'live'].indexOf(evStatus(e)) >= 0).length + ' قادمة', icon: 'calendar' }),
          U.kpi({ label: 'المصروف من الميزانيات', value: fmt.short(sum(thisYear, (e) => e.spent || 0)), sub: 'من ' + fmt.short(sum(thisYear, (e) => e.budget || 0)) + ' معتمد/مطلوب', icon: 'coins' }),
          U.kpi({ label: 'عملاء محتملون من المعارض', value: fmt.num(sum(S, (s) => s.leads)), sub: sum(S, (s) => s.qualified) + ' مؤهل · ' + staleN + ' بلا متابعة', icon: 'users', tone: staleN ? 'warning' : null }),
          U.kpi({ label: 'صفقات مكسوبة', value: fmt.short(sum(S, (s) => s.wonV)), sub: 'فرص مفتوحة ' + fmt.short(sum(S, (s) => s.pipe)), icon: 'trend', tone: 'success', href: '#/expo/roi' }),
          next ? U.kpi({ label: 'الفعالية القادمة', value: countdown(next) || fmt.date(next.from), sub: next.name, icon: 'clock', href: '#/expo/events/' + next.id }) : null
        ]),
        attn.length ? SA.card({ title: 'يحتاج انتباهك', tags: h('span.sap-count', {}, attn.length) }, h('ul.xpo-attn', {}, attn)) : null,
        h('div.xpo-bar', {}, h('div.xpo-row', {}, segF, search), segV),
        listHost);
      drawList();
      return out;
    };
    return SA.live(root, build, ['events', 'leads', 'eventExpenses', 'approvals', 'activities']);
  }

  /* event detail */
  function renderEvent(root, ctx, id) {
    let tab = ['overview', 'budget', 'samples', 'leads', 'followup', 'roi'].indexOf(ctx.params.tab) >= 0 ? ctx.params.tab : 'overview'; let leadTable = null;
    try { ERP.reconcile && ERP.reconcile(); } catch (e) { /* noop */ }
    const build = () => {
      const ev = ERP.find('events', id);
      if (!ev) { ctx.setCrumbs([{ label: 'المعارض والفعاليات', href: '#/expo/events' }, { label: id }]); return h('div', {}, SA.pageHead({ title: 'الفعالية غير موجودة', back: { label: 'المعارض', href: '#/expo/events' } }), SA.empty({ icon: 'search', title: 'لم نجد ' + id, action: { label: 'كل الفعاليات', icon: 'list', onClick: () => SA.nav('expo/events') } })); }
      ctx.setCrumbs([{ label: 'المعارض والفعاليات', href: '#/expo/events' }, { label: ev.name }]);
      const s = stats(ev); const es = evStatus(ev); const stale = staleOf(ev.id);
      const actions = [];
      if (es === 'live' || (['planned', 'preparing'].indexOf(es) >= 0 && ERP.daysBetween(today(), ev.from) <= 1)) actions.push(SA.btn({ label: 'تسجيل زوار الجناح', icon: 'scan', perm: 'expo.leads.capture', onClick: () => SA.nav('expo/capture?ev=' + ev.id) }));
      else actions.push(SA.btn({ label: 'تسجيل زوار', icon: 'scan', kind: 'ghost', perm: 'expo.leads.capture', onClick: () => SA.nav('expo/capture?ev=' + ev.id) }));
      if (['planned', 'preparing'].indexOf(es) >= 0) actions.push(SA.btn({ label: 'بدء المعرض', icon: 'play', kind: 'ghost', perm: 'expo.events.edit', reason: ev.approvalStatus !== 'approved' ? 'الميزانية لم تُعتمد بعد' : '', onClick: () => setStatus(ev, 'live') }));
      if (es === 'live') actions.push(SA.btn({ label: 'إنهاء المعرض', icon: 'checkcircle', kind: 'ghost', perm: 'expo.events.edit', onClick: () => setStatus(ev, 'done') }));
      actions.push(SA.btn({ label: 'تعديل', icon: 'edit', kind: 'ghost', perm: 'expo.events.edit', onClick: () => eventModal(ev) }));
      const tabs = SA.tabs({ label: 'أقسام الفعالية', active: tab, onChange: (t) => { tab = t; history.replaceState(null, '', '#/expo/events/' + id + '?tab=' + t); view.refresh(); }, tabs: [
        { id: 'overview', label: 'نظرة عامة', icon: 'grid' }, { id: 'budget', label: 'الميزانية والمصروف', icon: 'coins', badge: expOf(ev.id).length }, { id: 'samples', label: 'العينات', icon: 'box', badge: (ev.samples || []).length || null },
        { id: 'leads', label: 'العملاء المحتملون', icon: 'users', badge: s.leads }, { id: 'followup', label: 'المتابعة', icon: 'clock', badge: stale.length || null }, { id: 'roi', label: 'العائد', icon: 'trend' }] });
      const body = tab === 'budget' ? tabBudget(ev) : tab === 'samples' ? tabSamples(ev) : tab === 'leads' ? tabLeads(ev, s) : tab === 'followup' ? tabFollow(ev, stale) : tab === 'roi' ? tabRoi(ev, s) : tabOverview(ev, s, stale);
      return h('div', {},
        SA.pageHead({ title: ev.name, back: { label: 'المعارض والفعاليات', href: '#/expo/events' }, tags: [U.status('event', es), SA.chip(KIND[ev.kind] || ev.kind, 'neutral'), U.status('evbudget', ev.approvalStatus || 'approved')], desc: (ev.city || '') + (ev.venue ? ' · ' + ev.venue : '') + ' · ' + dateRange(ev) + (countdown(ev) && es !== 'done' ? ' · ' + countdown(ev) : ''), actions }),
        ev.approvalStatus === 'pending' ? SA.alert('warning', h('b', {}, 'الميزانية بانتظار اعتماد المدير العام. '), fmt.money(ev.budget) + ' — طلب الاعتماد ', ev.approvalId ? L(ev.approvalId) : '—', '. بعد الاعتماد تتحول الفعالية إلى «قيد التجهيز» تلقائيًا.') : ev.approvalStatus === 'rejected' ? SA.alert('danger', h('b', {}, 'رُفضت الميزانية. '), 'عدّل الميزانية وأعد الإرسال من «تعديل».') : null,
        h('div.xpo-tabs', {}, tabs.el), body);
    };
    const view = liveView(root, build, ['events', 'leads', 'eventExpenses', 'activities', 'approvals', 'stock']);
    return () => { view.cleanup(); leadTable = null; };
  }
  function tabOverview(ev, s, stale) {
    const team = (ev.teamIds || []).map((id) => SA.userById(id)).filter(Boolean);
    return h('div', {},
      U.kpis([
        U.kpi({ label: 'الميزانية', value: fmt.short(ev.budget), sub: (CS.evbudget[ev.approvalStatus || 'approved'] || [''])[0], icon: 'coins' }),
        U.kpi({ label: 'المصروف', value: fmt.short(ev.spent), sub: pctTxt(s.budgetUse) + ' من الميزانية', icon: 'receipt', tone: s.budgetUse > 1 ? 'danger' : s.budgetUse > 0.92 ? 'warning' : null }),
        U.kpi({ label: 'العملاء المحتملون', value: s.leads + ' / ' + s.target, sub: s.qualified + ' مؤهل · ' + stale.length + ' بلا متابعة', icon: 'users', tone: stale.length ? 'warning' : null }),
        U.kpi({ label: 'فرص مفتوحة', value: fmt.short(s.pipe), sub: 'مرجّحة ' + fmt.short(s.wpipe), icon: 'target' }),
        U.kpi({ label: 'صفقات مكسوبة', value: fmt.short(s.wonV), sub: s.won + ' صفقة · عائد ' + pctTxt(s.roi), icon: 'trend', tone: s.wonV ? 'success' : null })
      ]),
      U.grid(2,
        SA.card({ title: 'بيانات الفعالية' }, SA.kv([['النوع', KIND[ev.kind] || ev.kind], ['المكان', (ev.venue || '—') + ' — ' + (ev.city || '')], ['التاريخ', dateRange(ev)], ['الجناح', ev.booth || '—'], ['المستهدف', (ev.leadsTarget || 0) + ' عميل محتمل'], ['الميزانية', h('span', {}, fmt.money(ev.budget), ' ', U.status('evbudget', ev.approvalStatus || 'approved'), ev.approvalId ? [' ', L(ev.approvalId)] : null)], ['ملاحظات', ev.notes || '—']])),
        SA.card({ title: 'فريق الجناح', tags: h('span.sap-count', {}, team.length) }, team.length ? h('div.xpo-team', {}, team.map((u) => h('div.xpo-row.xpo-sp', {}, SA.userCell(u, { sub: SA.roleName(u.roleId) + (u.jobTitle ? ' · ' + u.jobTitle : '') }), h('span.xpo-muted', {}, s.list.filter((l) => l.ownerId === u.id).length + ' عميل محتمل')))) : SA.empty({ icon: 'users', title: 'لم يُحدد فريق' }))),
      U.grid(2,
        SA.card({ title: 'العينات المخططة/المرسلة', actions: [SA.btn({ label: 'التفاصيل', kind: 'ghost', size: 'sm', onClick: () => SA.nav('expo/events/' + ev.id + '?tab=samples') })] }, (ev.samples || []).length ? h('ul.xpo-attn', {}, ev.samples.map((x) => h('li', {}, U.itemCell(x.itemId), h('span.xpo-grow'), h('b.num', {}, '× ' + x.qty)))) : SA.empty({ icon: 'box', title: 'لا توجد عينات', text: 'زيارات المصنع لا تحتاج عينات عادةً.' })),
        SA.card({ title: 'آخر العملاء المحتملين', actions: [SA.btn({ label: 'الكل', kind: 'ghost', size: 'sm', onClick: () => SA.nav('expo/events/' + ev.id + '?tab=leads') })] }, s.list.length ? h('ul.xpo-attn', {}, s.list.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5).map((l) => h('li', {}, SA.avatar(l.name), h('span.xpo-grow.xpo-cell', {}, h('b', {}, l.name), h('small', {}, l.company + ' · ' + (l.city || ''))), U.status('lead', l.stage), L(l.id)))) : SA.empty({ icon: 'users', title: 'لا يوجد زوار مسجلون بعد', action: { label: 'تسجيل زوار', icon: 'scan', perm: 'expo.leads.capture', onClick: () => SA.nav('expo/capture?ev=' + ev.id) } }))));
  }
  function tabBudget(ev) {
    const xs = expOf(ev.id).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const paid = sum(xs.filter((x) => x.status === 'paid'), (x) => x.amount); const comm = sum(xs.filter((x) => x.status === 'committed'), (x) => x.amount);
    const byCat = CATS.map((c, i) => ({ label: c[1], value: sum(xs.filter((x) => x.category === c[0]), (x) => x.amount), color: ERP.palette[i] })).filter((x) => x.value > 0);
    const use = ev.budget ? (ev.spent || 0) / ev.budget : 0;
    const t = SA.table({ caption: 'مصروفات الفعالية', rows: xs, pageSize: 10,
      columns: [
        { key: 'date', label: 'التاريخ', sort: true, render: (x) => fmt.date(x.date) },
        { key: 'category', label: 'البند', sort: true, value: (x) => catLabel(x.category), render: (x) => h('span.xpo-cell', {}, h('b', {}, catLabel(x.category)), h('small', {}, x.id)) },
        { key: 'description', label: 'البيان' },
        { key: 'vendor', label: 'المورد' },
        { key: 'amount', label: 'المبلغ', sort: true, render: (x) => U.money(x.amount) },
        { key: 'status', label: 'الحالة', sort: true, render: (x) => U.status('expense', x.status) }
      ], search: { placeholder: 'بحث في المصروفات…', keys: ['description', 'vendor', 'id', (x) => catLabel(x.category)] }, filters: [{ key: 'category', label: 'البند', options: CATS.map((c) => [c[0], c[1]]) }, { key: 'status', label: 'الحالة', options: [['paid', 'مدفوع'], ['committed', 'التزام']] }],
      empty: { icon: 'coins', title: 'لا توجد مصروفات بعد', action: { label: 'تسجيل مصروف', perm: 'expo.events.edit', onClick: () => expenseModal(ev) } } });
    return h('div', {},
      U.kpis([
        U.kpi({ label: 'الميزانية', value: fmt.money(ev.budget), sub: (CS.evbudget[ev.approvalStatus || 'approved'] || [''])[0], icon: 'coins' }),
        U.kpi({ label: 'المصروف', value: fmt.money(ev.spent), sub: pctTxt(use) + ' من الميزانية', icon: 'receipt', tone: use > 1 ? 'danger' : use > 0.92 ? 'warning' : null }),
        U.kpi({ label: 'مدفوع فعليًا', value: fmt.money(paid), sub: xs.filter((x) => x.status === 'paid').length + ' حركة', icon: 'checkcircle' }),
        U.kpi({ label: 'التزامات لم تُصرف', value: fmt.money(comm), sub: 'بانتظار سندات صرف', icon: 'clock', tone: comm ? 'warning' : null }),
        U.kpi({ label: 'المتبقي', value: fmt.money((ev.budget || 0) - (ev.spent || 0)), sub: 'من الميزانية', icon: 'gauge', tone: (ev.budget || 0) < (ev.spent || 0) ? 'danger' : 'success' })
      ]),
      U.grid(2,
        SA.card({ title: 'استهلاك الميزانية' }, ERP.chart.meter(Math.min(1, use), { label: 'المصروف / الميزانية', tone: use > 1 ? 'danger' : use > 0.92 ? 'warning' : 'primary', text: fmt.money(ev.spent) + ' / ' + fmt.money(ev.budget) }), h('div', { style: { height: '14px' } }), byCat.length ? ERP.chart.bars(byCat.map((x) => ({ label: x.label, value: x.value, color: x.color })), { fmt: fmt.short }) : SA.empty({ icon: 'coins', title: 'لا توجد مصروفات' })),
        SA.card({ title: 'التوزيع حسب البند' }, byCat.length ? ERP.chart.donut(byCat, { center: fmt.short(ev.spent).replace(' ج.م', ''), sub: 'ج.م مصروف', fmt: fmt.short }) : SA.empty({ icon: 'pie', title: 'لا توجد بيانات' }))),
      SA.card({ title: 'سجل المصروفات', flush: true, actions: [SA.btn({ label: 'تسجيل مصروف', icon: 'plus', perm: 'expo.events.edit', onClick: () => expenseModal(ev) })] }, t.el));
  }
  function tabSamples(ev) {
    const rows = (ev.samples || []).map((x) => { const it = ERP.item(x.itemId) || {}; return { x, it, value: (it.price || 0) * x.qty, cost: (it.stdCost || 0) * x.qty }; });
    const moves = (get('stockMoves') || []).filter((m) => m.ref && m.ref.type === 'event' && m.ref.id === ev.id && m.qty > 0);
    return h('div', {},
      SA.card({ title: 'العينات', tags: U.demo('القيمة بسعر القائمة'), actions: [SA.btn({ label: 'أرسل عينات لصالة العرض', icon: 'swap', perm: 'expo.events.edit', reason: evStatus(ev) === 'done' ? 'الفعالية انتهت' : '', onClick: () => samplesModal(ev) })] },
        rows.length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الصنف', 'الكمية', 'القيمة (سعر القائمة)', 'التكلفة', 'متاح W-01', 'رصيد صالة العرض W-04'].map((t) => h('th', {}, t)))),
          h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, U.itemCell(r.x.itemId)), h('td.num', {}, fmt.num(r.x.qty)), h('td', {}, U.money(r.value)), h('td', {}, U.cost(r.cost)), h('td.num', {}, fmt.num(ERP.stock.available(r.x.itemId, 'W-01'))), h('td.num', {}, fmt.num(ERP.stock.qty(r.x.itemId, 'W-04'))))))))
          : SA.empty({ icon: 'box', title: 'لا توجد عينات مخططة', text: 'أرسل عينات من مخزن المنتج التام إلى صالة العرض.', action: { label: 'أرسل عينات', perm: 'expo.events.edit', onClick: () => samplesModal(ev) } })),
      h('div', { style: { height: '16px' } }),
      SA.card({ title: 'حركات تحويل العينات' }, moves.length ? h('ul.xpo-attn', {}, moves.map((m) => h('li', {}, h('span.xpo-ico.is-info', {}, SA.icon('swap', 'icon-sm')), h('span.xpo-grow.xpo-cell', {}, h('b', {}, ERP.itemName(m.itemId) + ' × ' + m.qty), h('small', {}, 'W-01 ← W-04 · ' + SA.fmt.dt(m.ts) + ' · ' + SA.userName(m.by)))))) : h('p.xpo-muted', {}, 'لم تُسجل تحويلات عينات من النظام لهذه الفعالية بعد (العينات المخططة أعلاه من الخطة).')));
  }
  function tabLeads(ev, s) {
    const Ls = s.list; const stages = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won'];
    const funnel = stages.map((k, i) => ({ label: CS.lead[k][0], value: Ls.filter((l) => stages.indexOf(l.stage) >= i).length, sub: i === stages.length - 1 ? fmt.short(s.wonV) : null }));
    const owners = Array.from(new Set(Ls.map((l) => l.ownerId))).map((id) => ({ label: SA.userName(id), value: Ls.filter((l) => l.ownerId === id).length, sub: fmt.short(sum(Ls.filter((l) => l.ownerId === id && l.stage === 'won'), (l) => l.value || 0)) + ' مكسوب' })).sort((a, b) => b.value - a.value);
    const ints = INTEREST.map((x, i) => ({ label: x[1], value: Ls.filter((l) => (l.interests || [l.interest]).indexOf(x[0]) >= 0).length, color: ERP.palette[i] })).filter((x) => x.value);
    const t = SA.table({ caption: 'العملاء المحتملون', rows: Ls, pageSize: 10, initial: { sort: { key: 'createdAt', dir: 'desc' } }, onRowClick: (l) => { const r = ERP.route(l.id); if (canRoute(r)) SA.nav(r); },
      columns: [
        { key: 'name', label: 'العميل المحتمل', sort: true, render: (l) => h('span.xpo-cell', {}, h('b', {}, l.name), h('small', {}, l.company)) },
        { key: 'city', label: 'المدينة', sort: true },
        { key: 'interest', label: 'الاهتمام', render: (l) => (l.interests || [l.interest]).map(intLabel).join('، ') },
        { key: 'stage', label: 'المرحلة', sort: true, value: (l) => stages.indexOf(l.stage), render: (l) => U.status('lead', l.stage) },
        { key: 'value', label: 'القيمة المتوقعة', sort: true, render: (l) => U.money(l.value) },
        { key: 'score', label: 'التقييم', sort: true, render: (l) => scoreChip(l.score) },
        { key: 'ownerId', label: 'المندوب', sort: true, value: (l) => SA.userName(l.ownerId), render: (l) => SA.userName(l.ownerId) },
        { key: 'createdAt', label: 'التسجيل', sort: true, render: (l) => SA.fmt.date(l.createdAt) },
        { key: 'id', label: 'في CRM', render: (l) => L(l.id) }
      ], search: { placeholder: 'بحث بالاسم أو الشركة أو المدينة…', keys: ['name', 'company', 'city', 'id', 'phone'] },
      filters: [{ key: 'stage', label: 'المرحلة', options: Object.keys(CS.lead).map((k) => [k, CS.lead[k][0]]) }, { key: 'ownerId', label: 'المندوب', options: Array.from(new Set(Ls.map((l) => l.ownerId))).map((id) => [id, SA.userName(id)]) }, { key: 'interest', label: 'الاهتمام', options: INTEREST.map((x) => [x[0], x[1]]), test: (l, v) => (l.interests || [l.interest]).indexOf(v) >= 0 }],
      empty: { icon: 'users', title: 'لم يُسجل زوار لهذه الفعالية', action: { label: 'تسجيل زوار', icon: 'scan', perm: 'expo.leads.capture', onClick: () => SA.nav('expo/capture?ev=' + ev.id) } } });
    return h('div', {},
      U.grid(3,
        SA.card({ title: 'مسار التحويل' }, Ls.length ? ERP.chart.funnel(funnel) : SA.empty({ icon: 'target', title: 'لا توجد بيانات' })),
        SA.card({ title: 'حسب المندوب' }, owners.length ? ERP.chart.bars(owners) : SA.empty({ icon: 'users', title: 'لا توجد بيانات' })),
        SA.card({ title: 'حسب الاهتمام' }, ints.length ? ERP.chart.donut(ints, { center: String(Ls.length), sub: 'عميل محتمل' }) : SA.empty({ icon: 'pie', title: 'لا توجد بيانات' }))),
      SA.card({ title: 'العملاء المحتملون من الفعالية', flush: true, actions: [SA.btn({ label: 'تسجيل زائر', icon: 'scan', kind: 'ghost', perm: 'expo.leads.capture', onClick: () => SA.nav('expo/capture?ev=' + ev.id) })] }, t.el));
  }
  function tabFollow(ev, stale) {
    if (!stale.length) return SA.card({ title: 'المتابعة' }, SA.empty({ icon: 'checkcircle', title: 'كل العملاء المحتملين تمت متابعتهم خلال آخر 7 أيام', text: 'رائع — لا يوجد عميل محتمل مفتوح بلا تواصل.' }));
    return SA.card({ title: 'بلا تواصل منذ 7 أيام أو أكثر', tags: h('span.sap-count', {}, stale.length), actions: [SA.btn({ label: 'تذكير كل المندوبين', icon: 'bell', perm: 'expo.events.edit', onClick: () => remind(ev, stale) })] },
      h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['العميل المحتمل', 'المرحلة', 'القيمة', 'المندوب', 'آخر تواصل', 'الإجراء التالي', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, stale.map((x) => h('tr', {}, h('td', {}, h('span.xpo-cell', {}, h('b', {}, x.lead.name), h('small', {}, x.lead.company + ' · ', L(x.lead.id)))), h('td', {}, U.status('lead', x.lead.stage)), h('td', {}, U.money(x.lead.value)), h('td', {}, SA.userName(x.lead.ownerId)),
          h('td', {}, h('span.xpo-cell', {}, h('b', { style: { color: x.days >= 14 ? 'var(--color-danger)' : 'var(--color-warning)' } }, 'منذ ' + x.days + ' يوم'), h('small', {}, x.last ? SA.fmt.date(x.last) : 'لم يتم التواصل أبدًا'))), h('td', {}, x.lead.nextAction || '—'),
          h('td', {}, SA.btn({ label: 'تذكير', icon: 'bell', kind: 'ghost', size: 'sm', perm: 'expo.events.edit', onClick: () => remind(ev, [x]) }))))))),
      h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'التذكير يصل للمندوب في الجرس مع رابط CRM ويُسجَّل في التدقيق. آخر تواصل = آخر مكالمة/زيارة/واتساب مسجلة في CRM.')));
  }
  function roiRows() {
    return events().filter((e) => leadsOf(e.id).length || evStatus(e) === 'done').map((e) => Object.assign({ ev: e, id: e.id }, stats(e)));
  }
  function tabRoi(ev, s) {
    const rows = roiRows().filter((r) => r.cpl != null); const avgCpl = rows.length ? sum(rows, (r) => r.cpl) / rows.length : null;
    return h('div', {},
      U.kpis([
        U.kpi({ label: 'تكلفة الفعالية', value: fmt.short(s.cost), sub: 'المصروف حتى الآن', icon: 'coins' }),
        U.kpi({ label: 'تكلفة العميل المحتمل', value: s.cpl == null ? '—' : fmt.short(s.cpl), sub: avgCpl ? 'متوسط المعارض ' + fmt.short(avgCpl) : '', icon: 'users', tone: s.cpl != null && avgCpl && s.cpl > avgCpl * 1.2 ? 'warning' : null }),
        U.kpi({ label: 'نسبة التأهيل', value: s.leads ? pctTxt(s.qualified / s.leads) : '—', sub: s.qualified + ' من ' + s.leads, icon: 'target' }),
        U.kpi({ label: 'فرص مفتوحة', value: fmt.short(s.pipe), sub: 'مرجّحة ' + fmt.short(s.wpipe), icon: 'layers' }),
        U.kpi({ label: 'العائد (ROI)', value: pctTxt(s.roi), sub: 'مكسوب ' + fmt.short(s.wonV) + ' مقابل التكلفة', icon: 'trend', tone: s.roi == null ? null : s.roi >= 0 ? 'success' : 'danger' })
      ]),
      U.grid(2,
        SA.card({ title: 'تكلفة العميل المحتمل مقارنة بالمعارض الأخرى' }, rows.length ? ERP.chart.bars(rows.map((r) => ({ label: r.ev.name, value: Math.round(r.cpl), color: r.id === ev.id ? ERP.palette[3] : ERP.palette[1] })), { fmt: fmt.short }) : SA.empty({ icon: 'chart', title: 'لا توجد بيانات كافية' })),
        SA.card({ title: 'التكلفة مقابل العائد' }, ERP.chart.columns({ labels: ['التكلفة', 'فرص مفتوحة (مرجّحة)', 'صفقات مكسوبة'], series: [{ name: ev.name, values: [s.cost, Math.round(s.wpipe), s.wonV] }], height: 200 }), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'العائد = (قيمة الصفقات المكسوبة − تكلفة الفعالية) ÷ التكلفة. مبني على الإيراد وليس الربح.')))),
      h('div', { style: { textAlign: 'end' } }, SA.btn({ label: 'مقارنة كل المعارض', icon: 'compare', kind: 'ghost', onClick: () => SA.nav('expo/roi') })));
  }

  /* ───────────── 2. expo-calendar ───────────── */
  function renderCalendar(root, ctx) {
    ctx.setCrumbs([{ label: 'المعارض والفعاليات' }, { label: 'تقويم المعارض' }]);
    let ym = /^\d{4}-\d{2}$/.test(ctx.params.m || '') ? ctx.params.m : today().slice(0, 7);
    const DOW = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
    const cls = (ev) => { const es = evStatus(ev); return es === 'live' ? '.is-live' : es === 'done' ? '.is-done' : ev.approvalStatus === 'pending' ? '.is-pending' : ev.kind === 'factory_visit' ? '.is-visit' : ''; };
    const build = () => {
      const a = ym.split('-').map(Number); const first = new Date(a[0], a[1] - 1, 1); const off = (first.getDay() + 1) % 7; const start = new Date(a[0], a[1] - 1, 1 - off); const td = today();
      const cells = []; for (let i = 0; i < 42; i++) { const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i); const ds = dstr(d); const evs = events().filter((e) => ds >= e.from && ds <= e.to);
        cells.push(h('div.xpo-day' + (d.getMonth() !== a[1] - 1 ? '.is-out' : '') + (ds === td ? '.is-today' : ''), {}, h('span.xpo-dn', {}, String(d.getDate())), evs.map((e) => h('a.xpo-ev' + cls(e), { href: '#/expo/events/' + e.id, title: e.name + ' — ' + (e.city || '') }, (ds === e.from || d.getDay() === 6 ? '' : '… ') + e.name)))); }
      const go = (k) => { const d = new Date(a[0], a[1] - 1 + k, 1); ym = d.getFullYear() + '-' + p2(d.getMonth() + 1); history.replaceState(null, '', '#/expo/calendar?m=' + ym); view.refresh(); };
      const yr = a[0]; const y0 = new Date(yr, 0, 1).getTime(), y1 = new Date(yr + 1, 0, 1).getTime(); const pos = (s) => Math.max(0, Math.min(100, ((new Date(s + 'T12:00:00').getTime() - y0) / (y1 - y0)) * 100));
      const yEvents = events().filter((e) => e.from.slice(0, 4) === String(yr) || e.to.slice(0, 4) === String(yr)).sort((x, y) => x.from.localeCompare(y.from));
      const monthEvents = events().filter((e) => e.from.slice(0, 7) <= ym && e.to.slice(0, 7) >= ym);
      return h('div', {},
        SA.pageHead({ title: 'تقويم المعارض والفعاليات', desc: 'الشهر والسنة في نظرة واحدة — اضغط على أي فعالية لفتحها.', actions: [SA.btn({ label: 'معرض جديد', icon: 'plus', perm: 'expo.events.create', onClick: () => eventModal(null) })] }),
        SA.card({ title: ERP.months[a[1] - 1] + ' ' + a[0], tags: h('span.sap-count', {}, monthEvents.length), actions: [SA.btn({ label: 'الشهر السابق', icon: 'chevron', kind: 'ghost', size: 'sm', iconOnly: true, onClick: () => go(-1) }), SA.btn({ label: 'اليوم', kind: 'ghost', size: 'sm', onClick: () => { ym = td.slice(0, 7); history.replaceState(null, '', '#/expo/calendar'); view.refresh(); } }), SA.btn({ label: 'الشهر التالي', icon: 'arrowleft', kind: 'ghost', size: 'sm', iconOnly: true, onClick: () => go(1) })] },
          h('div.xpo-cal', { role: 'grid', 'aria-label': 'تقويم ' + ERP.months[a[1] - 1] }, DOW.map((d) => h('div.xpo-cal-h', {}, d)), cells),
          h('div.xpo-legend', { style: { marginTop: '10px' } }, [['#012864', 'معرض قادم'], ['#147a3d', 'زيارة مصنع'], ['#a85a00', 'ميزانية بانتظار الاعتماد'], ['#b9141b', 'جارٍ الآن'], ['#8a8a8a', 'انتهى']].map((x) => h('span', {}, h('i', { style: { background: x[0] } }), x[1])))),
        h('div', { style: { height: '16px' } }),
        SA.card({ title: 'الخط الزمني لعام ' + yr, tags: h('span.sap-count', {}, yEvents.length) },
          h('div.xpo-year', {}, h('div.xpo-year-h', {}, ERP.months.map((m) => h('span', {}, m))),
            String(yr) === td.slice(0, 4) ? h('div.xpo-now', { style: { insetInlineStart: 'calc(12px + (100% - 24px) * ' + (pos(td) / 100).toFixed(4) + ')' } }) : null,
            yEvents.length ? yEvents.map((e) => { const p0 = pos(e.from), p1 = pos(e.to); const flip = p0 > 62; return h('div.xpo-yrow', {}, h('a.xpo-ybar' + cls(e) + (flip ? '.is-flip' : ''), { href: '#/expo/events/' + e.id, title: e.name + ' · ' + dateRange(e), style: { insetInlineStart: p0 + '%', width: 'max(10px, ' + (p1 - p0) + '%)' } }, h('span', {}, e.name + ' · ' + (e.city || '')))); }) : SA.empty({ icon: 'calendar', title: 'لا توجد فعاليات هذا العام' }))));
    };
    const view = liveView(root, build, ['events']);
    return view.cleanup;
  }

  /* ───────────── 3. expo-capture (tablet mode) ───────────── */
  const CARDS = [
    { name: 'م. أحمد فكري', company: 'فكري للمقاولات والتشطيبات', phone: '+20 100 245 7781', city: 'القاهرة الجديدة', interests: ['door', 'clad'], budget: 'b2', notes: 'مشروع 24 فيلا — أبواب داخلية 90 و100 سم + تجاليد واجهات' },
    { name: 'أ. سارة المليجي', company: 'ستوديو المليجي للتصميم الداخلي', phone: '+20 122 610 4402', city: 'الشيخ زايد', interests: ['foam', 'clad'], budget: 'b1', notes: 'تصميم كافيهات — مهتمة بألوان C160 وC198' },
    { name: 'م. خالد الرواحي', company: 'الرواحي للمقاولات — مسقط', phone: '+968 9 412 7730', city: 'مسقط', interests: ['clad'], budget: 'b3', notes: 'وكيل محتمل — يطلب عرض سعر حاوية تجاليد' },
    { name: 'د. منى الشرقاوي', company: 'مستشفى السلام التخصصي', phone: '+20 109 880 3321', city: 'المنصورة', interests: ['foam', 'door'], budget: 'b2', notes: 'وحدات طبية — أبواب مقاومة للرطوبة وألواح فوم 10 مم' },
    { name: 'أ. حسام القاضي', company: 'معرض القاضي للأبواب', phone: '+20 111 905 6620', city: 'طنطا', interests: ['door'], budget: 'b1', notes: 'تاجر — يريد قائمة أسعار التجار وشروط الحساب' }
  ];
  let cardIdx = 0;
  function defaultEvent() {
    const td = today(); const all = events().filter((e) => e.status !== 'cancelled');
    // live now → the nearest approved event starting within 7 days (booth team preparing) → the most recent one that ended → anything
    return all.find((e) => evStatus(e) === 'live') || all.filter((e) => e.from >= td && ERP.daysBetween(td, e.from) <= 7 && (e.approvalStatus || 'approved') === 'approved').sort((a, b) => a.from.localeCompare(b.from))[0]
      || all.filter((e) => e.from <= td).sort((a, b) => b.to.localeCompare(a.to))[0] || all.slice().sort((a, b) => a.from.localeCompare(b.from))[0] || null;
  }
  function nextOwner() { const n = Number(st.get('meta.expoRR') || 0); st.set('meta.expoRR', n + 1); return REPS[n % REPS.length]; }
  function renderCapture(root, ctx) {
    ctx.setCrumbs([{ label: 'المعارض والفعاليات' }, { label: 'تسجيل زوار الجناح' }]);
    const ev0 = (ctx.params.ev && ERP.find('events', ctx.params.ev)) || defaultEvent();
    let evId = ev0 ? ev0.id : ''; let interests = []; let budget = ''; let lastSaved = null; let scanning = false;
    const evOpts = events().slice().sort((a, b) => { const r = (e) => ({ live: 0, preparing: 1, planned: 1, done: 2, cancelled: 3 })[evStatus(e)]; return r(a) - r(b) || b.from.localeCompare(a.from); }).map((e) => [e.id, e.name + ' — ' + (CS.event[evStatus(e)] || [''])[0]]);
    const evNote = h('div');
    const drawNote = () => { SA.clear(evNote); const ev = ERP.find('events', evId); if (!ev) return; const es = evStatus(ev);
      if (es === 'done') evNote.append(h('p.xpo-evnote', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الفعالية انتهت ' + fmt.date(ev.to) + ' — التسجيل هنا لإدخال كروت الزوار التي جُمعت في الجناح ولم تُسجَّل بعد.')));
      else if (es !== 'live') evNote.append(h('p.xpo-evnote', {}, SA.icon('clock', 'icon-sm'), h('span', {}, 'الفعالية تبدأ ' + fmt.date(ev.from) + (countdown(ev) ? ' (' + countdown(ev) + ')' : '') + ' — يمكن تسجيل الزوار المدعوين مسبقًا.'))); };
    const evSel = h('select.select', { 'aria-label': 'الفعالية الحالية', onchange: (e) => { evId = e.target.value; drawNote(); drawSide(); } }, evOpts.map((o) => h('option', { value: o[0] }, o[1]))); evSel.value = evId; drawNote();
    const fName = SA.form.field({ name: 'name', label: 'اسم الزائر', required: true, placeholder: 'الاسم بالكامل' });
    const fCompany = SA.form.field({ name: 'company', label: 'الشركة/الجهة', placeholder: 'اسم الشركة أو المكتب' });
    const fPhone = SA.form.field({ name: 'phone', label: 'الموبايل', type: 'tel', required: true, placeholder: '+20 1xx xxx xxxx', rules: [SA.form.rules.phone] });
    const fCity = SA.form.field({ name: 'city', label: 'المدينة', placeholder: 'المدينة' });
    const fNotes = SA.form.field({ name: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2, placeholder: 'المشروع، المقاسات، الألوان، الموعد المتوقع…' });
    fCity.input.setAttribute('list', 'xpo-cities');
    const cities = h('datalist#xpo-cities', {}, ['القاهرة', 'القاهرة الجديدة', 'الشيخ زايد', '6 أكتوبر', 'الجيزة', 'الإسكندرية', 'المنصورة', 'دمياط', 'طنطا', 'الزقازيق', 'جمصة', 'العاصمة الإدارية', 'مسقط', 'صحار', 'صلالة'].map((c) => h('option', { value: c })));
    const consent = h('input', { type: 'checkbox', id: 'xpo-consent' }); const consentErr = h('div.sap-field-error', { hidden: true, role: 'alert' }, 'موافقة الزائر مطلوبة قبل الحفظ');
    const chipBtns = {}; const chips = h('div.xpo-chipset', { role: 'group', 'aria-label': 'الاهتمام' }, INTEREST.map((x, i) => { const b = h('button.xpo-chip', { type: 'button', 'aria-pressed': 'false', onclick: () => toggleInt(x[0]) }, x[1], h('kbd', {}, 'Alt+' + (i + 1))); chipBtns[x[0]] = b; return b; }));
    const budBtns = {}; const buds = h('div.xpo-chipset', { role: 'radiogroup', 'aria-label': 'الميزانية التقديرية' }, BUDGETS.map((x) => { const b = h('button.xpo-chip', { type: 'button', role: 'radio', 'aria-pressed': 'false', 'aria-checked': 'false', onclick: () => setBud(budget === x[0] ? '' : x[0]) }, x[1]); budBtns[x[0]] = b; return b; }));
    const intErr = h('div.sap-field-error', { hidden: true, role: 'alert' }, 'اختر اهتمامًا واحدًا على الأقل');
    function toggleInt(k) { const i = interests.indexOf(k); if (i >= 0) interests.splice(i, 1); else interests.push(k); Object.keys(chipBtns).forEach((x) => chipBtns[x].setAttribute('aria-pressed', String(interests.indexOf(x) >= 0))); intErr.hidden = true; }
    function setBud(k) { budget = k; Object.keys(budBtns).forEach((x) => { budBtns[x].setAttribute('aria-pressed', String(x === k)); budBtns[x].setAttribute('aria-checked', String(x === k)); }); }
    const scanBox = h('div'); const flashBox = h('div', { 'aria-live': 'polite' });
    const fields = [fName, fCompany, fPhone, fCity];
    function reset() { fields.concat([fNotes]).forEach((f) => { f.set(''); f.error(null); }); interests = []; toggleInt('__none'); interests = []; Object.keys(chipBtns).forEach((x) => chipBtns[x].setAttribute('aria-pressed', 'false')); setBud(''); consent.checked = false; consentErr.hidden = true; intErr.hidden = true; fName.focus(); }
    function scan() {
      if (scanning) return; scanning = true; SA.clear(scanBox);
      scanBox.appendChild(h('div.xpo-scan', { role: 'status', 'aria-label': 'جاري مسح كارت الزيارة' }, h('div.xpo-bcard', {}, h('i'), h('i'), h('i'), h('i')), h('div.xpo-scanline')));
      setTimeout(() => {
        scanning = false; SA.clear(scanBox); const c = CARDS[cardIdx++ % CARDS.length];
        fName.set(c.name); fCompany.set(c.company); fPhone.set(c.phone); fCity.set(c.city); fNotes.set(c.notes); interests = c.interests.slice(); Object.keys(chipBtns).forEach((x) => chipBtns[x].setAttribute('aria-pressed', String(interests.indexOf(x) >= 0))); setBud(c.budget);
        fields.concat([fNotes]).forEach((f) => { f.error(null); const el = f.input; el.classList.remove('xpo-filled'); void el.offsetWidth; el.classList.add('xpo-filled'); });
        SA.toast('تمت قراءة الكارت — راجع البيانات واطلب موافقة الزائر', 'info'); consent.focus();
      }, 1300);
    }
    async function save() {
      if (!evId) { SA.toast('اختر الفعالية أولًا', 'warn'); return; }
      if (!SA.can('expo.leads.capture')) { SA.toast('ليست من صلاحياتك (expo.leads.capture)', 'warn'); return; }
      const ok = SA.form.group(fields).validate(); if (!interests.length) intErr.hidden = false; if (!consent.checked) consentErr.hidden = false;
      if (!ok || !interests.length || !consent.checked) { if (ok && !interests.length) chipBtns.door.focus(); else if (ok) consent.focus(); return; }
      const ev = ERP.find('events', evId); const b = BUDGETS.find((x) => x[0] === budget);
      const score = Math.min(98, 22 + interests.length * 8 + (b ? b[3] : 0) + (fCompany.get().trim() ? 8 : 0) + 7 + (fNotes.get().trim().length > 10 ? 6 : 0));
      let lead = null; const btn = saveBtn; btn.disabled = true;
      try {
        await SA.api(() => {
          let id = ERP.no('LD'); let guard = 0; while (ERP.find('leads', id) && guard++ < 50) id = ERP.no('LD');
          const owner = nextOwner(); const now = nowIso();
          lead = { id, name: fName.get().trim(), company: fCompany.get().trim() || '—', city: fCity.get().trim(), interest: interests[0], interests: interests.slice(), stage: 'new', value: b ? b[2] : 100000, ownerId: owner, eventId: evId, source: 'معرض', phone: fPhone.get().trim(), createdAt: now, updatedAt: now, nextAction: 'مكالمة متابعة خلال 48 ساعة', nextAt: ERP.day(2), probability: PROB.new, score, lostReason: null, budgetRange: b ? b[1] : null, notes: fNotes.get().trim(), consent: true, consentAt: now, capturedBy: me() };
          st.insert('leads', lead, true);
          SA.audit('EVENT.LEAD_CAPTURED', { target: { type: 'event', id: evId, label: ev ? ev.name : evId }, after: { lead: id, name: lead.name, company: lead.company, score } });
          SA.audit('LEAD.CREATED', { target: { type: 'lead', id, label: lead.name + ' — ' + lead.company }, after: { source: 'معرض', event: evId, owner: SA.userName(owner), interest: interests.map(intLabel).join('، '), value: lead.value, score } });
          SA.notify({ title: 'عميل محتمل جديد من ' + (ev ? ev.name : 'المعرض'), body: lead.name + ' — ' + lead.company + ' · ' + interests.map(intLabel).join('، ') + ' · أُسند إلى ' + SA.userName(owner) + ' (تقييم ' + score + ')', level: 'action', to: ['R-03'], toUsers: [owner], link: '#/crm/leads/' + id });
        });
      } catch (e) { btn.disabled = false; return SA.fail(e); }
      btn.disabled = false; lastSaved = lead;
      SA.clear(flashBox); flashBox.appendChild(h('div.xpo-flash', {}, SA.icon('checkcircle'), h('div', {}, h('b', {}, 'تم تسجيل ' + lead.name + ' — ' + lead.id), h('div.xpo-muted', {}, 'أُسند إلى ' + SA.userName(lead.ownerId) + ' · تقييم ', scoreChip(lead.score), ' · ', L(lead.id, 'فتح في CRM')))));
      SA.toast('تم تسجيل الزائر ' + lead.id, 'success'); reset(); drawSide();
    }
    const saveBtn = h('button.btn.btn-primary.xpo-grow', { type: 'button', onclick: save }, SA.icon('check'), 'حفظ الزائر');
    const form = h('div.xpo-form', {
      onkeydown: (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); return; }
        if (e.altKey && ['1', '2', '3'].indexOf(e.key) >= 0) { e.preventDefault(); toggleInt(INTEREST[+e.key - 1][0]); return; }
        if (e.altKey && (e.key === 's' || e.key === 'S' || e.key === 'س')) { e.preventDefault(); scan(); return; }
        if (e.key === 'Escape' && !SA.layers.count) { e.preventDefault(); reset(); return; }
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); const ins = fields.map((f) => f.input); const i = ins.indexOf(e.target); if (i >= 0 && i < ins.length - 1) ins[i + 1].focus(); else chipBtns.door.focus(); }
      } },
      h('div', {}, h('div.xpo-evsel', {}, SA.icon('calendar'), evSel), evNote),
      h('div.xpo-row.xpo-sp', {}, h('b', {}, 'بيانات الزائر'), SA.btn({ label: 'امسح كارت الزيارة', icon: 'scan', kind: 'ghost', onClick: scan })),
      scanBox,
      h('div.xpo-g2', {}, fName.el, fCompany.el, fPhone.el, fCity.el), cities,
      h('div.field', {}, h('span.label', {}, 'الاهتمام', h('span.req', {}, '*')), chips, intErr),
      h('div.field', {}, h('span.label', {}, 'الميزانية التقديرية'), buds),
      fNotes.el,
      h('label.xpo-consent', { for: 'xpo-consent' }, consent, h('span', {}, 'وافق الزائر على تسجيل بياناته والتواصل معه من فريق المبيعات بخصوص منتجات المصرية الألمانية.')), consentErr,
      h('div.xpo-actions', {}, saveBtn, h('button.btn.btn-ghost', { type: 'button', onclick: reset }, SA.icon('x'), 'مسح')),
      h('div.xpo-kbd', {}, h('span', {}, h('kbd', {}, 'Enter'), 'الحقل التالي'), h('span', {}, h('kbd', {}, 'Ctrl+Enter'), 'حفظ'), h('span', {}, h('kbd', {}, 'Alt+1..3'), 'الاهتمام'), h('span', {}, h('kbd', {}, 'Alt+S'), 'مسح الكارت'), h('span', {}, h('kbd', {}, 'Esc'), 'تفريغ')));
    const side = h('div.xpo-side');
    function drawSide() {
      SA.clear(side); const ev = ERP.find('events', evId); const td = today();
      const mine = get('leads').filter((l) => l.eventId === evId); const todays = mine.filter((l) => localDay(l.createdAt) === td);
      const allToday = get('leads').filter((l) => l.source === 'معرض' && localDay(l.createdAt) === td).length;
      const recent = mine.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
      side.append(
        h('div.xpo-counter', {}, h('small', {}, 'زوار اليوم في الجناح'), h('b', {}, String(todays.length)), h('small', {}, (ev ? ev.name : '—') + ' · إجمالي الفعالية ' + mine.length + (ev && ev.leadsTarget ? ' / ' + ev.leadsTarget : '') + (allToday !== todays.length ? ' · كل المعارض اليوم ' + allToday : ''))),
        ev && ev.leadsTarget ? SA.card({}, ERP.chart.meter(Math.min(1, mine.length / ev.leadsTarget), { label: 'التقدم نحو المستهدف', tone: mine.length >= ev.leadsTarget ? 'success' : 'primary', text: mine.length + ' / ' + ev.leadsTarget })) : null,
        flashBox,
        SA.card({ title: 'آخر المسجلين' }, recent.length ? h('ul.xpo-last', {}, recent.map((l) => h('li', {}, SA.avatar(l.name), h('span.xpo-cell', { style: { flex: '1' } }, h('b', {}, l.name), h('small', {}, l.company + ' · ' + SA.fmt.rel(l.createdAt) + ' · ' + SA.userName(l.ownerId))), scoreChip(l.score), L(l.id, 'CRM')))) : SA.empty({ icon: 'users', title: 'لا يوجد زوار مسجلون بعد', text: 'ابدأ بأول زائر — أو اضغط «امسح كارت الزيارة».' })),
        h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'التوزيع على المندوبين بالتناوب (' + REPS.map(SA.userName).join(' ← ') + ') ويصل إشعار لمدير المبيعات. البيانات تُحفظ مباشرة في CRM.')));
    }
    const wrap = h('div.xpo-tablet', {},
      SA.pageHead({ title: 'تسجيل زوار الجناح', desc: 'وضع التابلت: إدخال سريع بلمسات كبيرة — كل زائر يصبح عميلًا محتملًا في CRM فورًا ويُسند لمندوب.', actions: [SA.btn({ label: 'ملء الشاشة', icon: 'monitor', kind: 'ghost', onClick: () => { try { if (document.fullscreenElement) document.exitFullscreen(); else wrap.requestFullscreen(); } catch (e) { SA.toast('ملء الشاشة غير متاح في هذا المتصفح', 'info'); } } })] }),
      ev0 ? null : SA.alert('warning', 'لا توجد فعاليات — أنشئ معرضًا أولًا.'),
      h('div.xpo-cap', {}, form, side));
    SA.clear(root); root.appendChild(wrap); drawSide();
    const offs = ['leads', 'events'].map((p) => st.subscribe(p, () => { if (document.contains(side)) drawSide(); }));
    setTimeout(() => { try { fName.focus(); } catch (e) { /* noop */ } }, 60);
    return () => { offs.forEach((f) => f()); if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* noop */ } } };
  }

  /* ───────────── 4. expo-roi ───────────── */
  function renderRoi(root, ctx) {
    ctx.setCrumbs([{ label: 'المعارض والفعاليات' }, { label: 'العائد من المعارض' }]);
    const build = () => {
      const rows = roiRows(); const done = rows.filter((r) => r.roi != null); const best = done.slice().sort((a, b) => b.roi - a.roi)[0];
      const tc = sum(rows, (r) => r.cost), tl = sum(rows, (r) => r.leads), tw = sum(rows, (r) => r.wonV), tp = sum(rows, (r) => r.pipe), tq = sum(rows, (r) => r.qualified);
      const t = SA.table({ caption: 'مقارنة العائد', rows, pageSize: 10, initial: { sort: { key: 'roi', dir: 'desc' } }, onRowClick: (r) => SA.nav('expo/events/' + r.id + '?tab=roi'),
        columns: [
          { key: 'name', label: 'الفعالية', sort: true, value: (r) => r.ev.name, render: (r) => h('span.xpo-cell', {}, h('b', {}, r.ev.name, best && r.id === best.id ? [' ', h('span.xpo-tag-best', {}, SA.icon('star', 'icon-sm'), 'الأفضل')] : null), h('small', {}, dateRange(r.ev) + ' · ' + (r.ev.city || ''))) },
          { key: 'cost', label: 'التكلفة', sort: true, render: (r) => U.money(r.cost) },
          { key: 'leads', label: 'العملاء المحتملون', sort: true, render: (r) => h('span.num', {}, r.leads + ' / ' + r.target) },
          { key: 'qualified', label: 'مؤهل', sort: true, render: (r) => h('span.num', {}, r.qualified + (r.leads ? ' (' + pctTxt(r.qualified / r.leads) + ')' : '')) },
          { key: 'pipe', label: 'فرص مفتوحة', sort: true, render: (r) => U.money(r.pipe) },
          { key: 'wonV', label: 'صفقات مكسوبة', sort: true, render: (r) => h('span.xpo-cell', {}, U.money(r.wonV), h('small', {}, r.won + ' صفقة')) },
          { key: 'cpl', label: 'تكلفة العميل المحتمل', sort: true, render: (r) => (r.cpl == null ? '—' : U.money(r.cpl)) },
          { key: 'roi', label: 'العائد (ROI)', sort: true, render: (r) => (r.roi == null ? SA.chip('لم يبدأ', 'neutral') : SA.chip(pctTxt(r.roi), r.roi >= 0.5 ? 'success' : r.roi >= 0 ? 'warning' : 'danger')) }
        ], search: { placeholder: 'بحث باسم الفعالية…', keys: [(r) => r.ev.name, (r) => r.ev.city] }, empty: { icon: 'trend', title: 'لا توجد فعاليات منتهية بعد' } });
      const ai = insights();
      return h('div', {},
        SA.pageHead({ title: 'العائد من المعارض', desc: 'أين يعطي كل جنيه في المعارض أكبر عائد؟ مقارنة التكلفة والعملاء المحتملين والصفقات المكسوبة لكل فعالية.', actions: [SA.btn({ label: 'كل الفعاليات', icon: 'calendar', kind: 'ghost', onClick: () => SA.nav('expo/events') })] }),
        U.kpis([
          U.kpi({ label: 'إجمالي تكلفة المعارض', value: fmt.short(tc), sub: rows.length + ' فعالية', icon: 'coins' }),
          U.kpi({ label: 'العملاء المحتملون', value: fmt.num(tl), sub: tq + ' مؤهل (' + (tl ? pctTxt(tq / tl) : '—') + ')', icon: 'users' }),
          U.kpi({ label: 'متوسط تكلفة العميل المحتمل', value: tl ? fmt.short(tc / tl) : '—', sub: 'التكلفة ÷ عدد الزوار المسجلين', icon: 'target' }),
          U.kpi({ label: 'صفقات مكسوبة', value: fmt.short(tw), sub: 'فرص مفتوحة ' + fmt.short(tp), icon: 'trend', tone: 'success' }),
          U.kpi({ label: 'العائد الإجمالي', value: tc ? pctTxt((tw - tc) / tc) : '—', sub: best ? 'الأفضل: ' + best.ev.name : '', icon: 'award', tone: tc && tw >= tc ? 'success' : 'warning' })
        ]),
        ai.length ? h('div.xpo-ai', {}, ai) : null,
        U.grid(2,
          SA.card({ title: 'العائد % لكل فعالية' }, done.length ? ERP.chart.bars(done.slice().sort((a, b) => b.roi - a.roi).map((r) => ({ label: r.ev.name, sub: 'تكلفة ' + fmt.short(r.cost).replace(' ج.م', '') + ' · مكسوب ' + fmt.short(r.wonV).replace(' ج.م', ''), value: Math.max(0, Math.round(r.roi * 100)), color: best && r.id === best.id ? 'var(--color-success)' : r.roi < 0 ? 'var(--color-danger)' : ERP.palette[0], href: '#/expo/events/' + r.id + '?tab=roi' })), { fmt: (v) => v + '%' }) : SA.empty({ icon: 'chart', title: 'لا توجد بيانات' })),
          SA.card({ title: 'التكلفة مقابل الصفقات والفرص' }, rows.length ? ERP.chart.columns({ labels: rows.map((r) => r.ev.name.split('—')[0].split(' ').slice(0, 3).join(' ')), series: [{ name: 'التكلفة', values: rows.map((r) => r.cost), color: ERP.palette[5] }, { name: 'صفقات مكسوبة', values: rows.map((r) => r.wonV), color: ERP.palette[4] }, { name: 'فرص مفتوحة (مرجّحة)', values: rows.map((r) => Math.round(r.wpipe)), color: ERP.palette[2] }], height: 230 }) : SA.empty({ icon: 'chart', title: 'لا توجد بيانات' }))),
        SA.card({ title: 'تكلفة العميل المحتمل' }, rows.filter((r) => r.cpl != null).length ? ERP.chart.bars(rows.filter((r) => r.cpl != null).sort((a, b) => a.cpl - b.cpl).map((r) => ({ label: r.ev.name, value: Math.round(r.cpl), color: ERP.palette[1] })), { fmt: fmt.short }) : SA.empty({ icon: 'chart', title: 'لا توجد بيانات' })),
        h('div', { style: { height: '16px' } }),
        SA.card({ title: 'جدول المقارنة', flush: true }, t.el),
        h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'العائد = (الصفقات المكسوبة − تكلفة الفعالية) ÷ التكلفة — على أساس الإيراد وليس الربح. الفرص المرجّحة = القيمة × احتمال الفوز للمرحلة.')));
    };
    return SA.live(root, build, ['events', 'leads', 'eventExpenses', 'activities']);
  }

  /* ───────────── registration ───────────── */
  const reg = (o) => SA.register(Object.assign({ app: 'expo', group: 'expo-main', moduleKey: 'expo' }, o));
  reg({ id: 'expo-events', title: 'المعارض والفعاليات', icon: 'award', route: 'expo/events', perm: 'expo.events.view', order: 10, desc: 'الميزانية والعينات والزوار والعائد',
    badge() { try { const n = events().filter((e) => evStatus(e) === 'live').length; return n || null; } catch (e) { return null; } }, render: renderEvents });
  reg({ id: 'expo-calendar', title: 'تقويم المعارض', icon: 'calendar', route: 'expo/calendar', perm: 'expo.calendar.view', order: 20, desc: 'الشهر والسنة', render: renderCalendar });
  reg({ id: 'expo-capture', title: 'تسجيل زوار الجناح', icon: 'scan', route: 'expo/capture', perm: 'expo.leads.capture', order: 30, desc: 'وضع التابلت — عميل محتمل في CRM فورًا', render: renderCapture });
  reg({ id: 'expo-roi', title: 'العائد من المعارض', icon: 'trend', route: 'expo/roi', perm: 'expo.roi.view', order: 40, desc: 'التكلفة والعملاء والصفقات لكل معرض', render: renderRoi });

  SA.search.register({ id: 'expo', label: 'المعارض', perm: 'expo.events.view', query: (q) => (q ? events().filter((e) => (e.name + ' ' + e.city + ' ' + e.id).toLowerCase().indexOf(q) >= 0).slice(0, 5).map((e) => ({ title: e.name, sub: e.id + ' · ' + fmt.date(e.from) + ' · ' + (CS.event[evStatus(e)] || [''])[0], icon: 'calendar', route: 'expo/events/' + e.id })) : []) });

  if (SA.missions) {
    SA.missions.add({ id: 'M-X1', area: 'expo', title: 'سجّل زائرًا في الجناح وشاهده في CRM', persona: 'marketing', route: 'expo/capture', est: '2 د', goal: 'في وضع التابلت اضغط «امسح كارت الزيارة»، خذ موافقة الزائر واحفظ — يظهر عميلًا محتملًا جديدًا في CRM مُسندًا لمندوب ويصل إشعار لمدير المبيعات.',
      steps: [{ text: 'افتح «تسجيل زوار الجناح» وامسح الكارت', route: 'expo-capture' }, { text: 'احفظ الزائر بعد الموافقة', audit: 'EVENT.LEAD_CAPTURED' }], detect: [{ audit: 'EVENT.LEAD_CAPTURED' }, { audit: 'LEAD.CREATED' }] });
    SA.missions.add({ id: 'M-X2', area: 'expo', title: 'اعتمد ميزانية معرض ديكور مصر', persona: 'gm', route: 'approvals/AP-2103', est: '2 د', goal: 'كمدير عام اعتمد طلب AP-2103 — تتحول ميزانية المعرض إلى «معتمدة» في شاشة المعارض تلقائيًا.',
      steps: [{ text: 'افتح الطلب AP-2103 واعتمده', audit: 'APPROVAL.APPROVED' }, { text: 'افتح المعرض وتأكد من حالة الميزانية', audit: 'EVENT.BUDGET_APPROVED' }], detect: [{ audit: 'EVENT.BUDGET_APPROVED' }] });
  }
})();
