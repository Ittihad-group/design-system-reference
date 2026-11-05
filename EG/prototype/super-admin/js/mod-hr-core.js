/* EG Super Admin + HR prototype — mod-hr-core.js  (HR agent 1 — HR core)
   HR-27 لوحة HR · HR-01 الخطة والوظائف · HR-02 طلبات التوظيف · HR-03 المرشحون · HR-04 العروض والعقود · HR-30 الامتثال · HR-31 الصلاحيات والسرية · HR-33 الإشعارات
   Routes: hr/dashboard · hr/planning(?tab=) · hr/requisitions(/new|/RQ-id) · hr/candidates(/CD-id) · hr/offers(/new|/OF-id) · hr/compliance(?tab=) · hr/acl(?tab=) · hr/settings(?tab=)
   Public API (SA.hrCore): init(), reconcile(), decide(apId, decision, reason), gate(featureId), legal(key), setting(key), vacancy(positionId), delegatedRoles(userId), renderSupervisorBoard(el)
   Own collections (created idempotently at first render, flag meta.hrCoreV): offers · hrLegal · hrObligations · hrLawChanges · hrPlan · hrDelegations · hrAccessReviews · hrNotifCfg · hrHolidays · hrCoreCfg
   Extra fields on shared collections: positions[]{status,reportsTo,safetyCritical,operational,salaryBand,jd,jdVersion} · requisitions[]{type,urgency,needBy,endDate,replacesEmpId,budgetCheck,approvedAt,hired}
                                       candidates[]{nationalId,phone,expectedSalary,military,relativeOfEmpId,scorecards,practicalTest,history,applications,rejectReason,privacyConsent} */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store, C = SA.catalog;
  const K = (SA.hrCore = SA.hrCore || {});
  const DAY = 864e5;
  const NOPERM = 'ليست من صلاحياتك';
  const me = () => SA.session.user;
  const get = (p) => st.get(p) || [];
  K.get = get;
  K.me = me;
  K.myEmp = () => { const u = me(); return u ? get('employees').find((e) => e.userId === u.id) || null : null; };
  K.canSal = () => SA.canSensitive('hr.salary.view');
  K.ACTIVE = ['active', 'probation', 'leave', 'suspended', 'notice'];
  K.empName = (id) => { const e = st.find('employees', id); return e ? e.name : id || '—'; };
  K.posTitle = (id) => { const p = st.find('positions', id); return p ? p.title : '—'; };
  K.addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY);
  K.ymd = (d) => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  K.daysFrom = (d) => Math.round((new Date(d).getTime() - Date.now()) / DAY);
  K.money = (n) => (n == null ? '—' : SA.fmt.money(n));
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const inDays = (n) => new Date(Date.now() + n * DAY).toISOString();

  /* ───────────────────────── css (own prefix sap-hrc-) ───────────────────────── */
  K.css = function (id, css) { if (document.querySelector('style[data-mod="' + id + '"]')) return; const s = document.createElement('style'); s.setAttribute('data-mod', id); s.textContent = css; document.head.appendChild(s); };
  K.css('mod-hr-core', `
.sap-hrc{display:flex;flex-direction:column;gap:18px}
.sap-hrc-tabs{margin-block:0}
.sap-hrc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px;align-items:stretch}
.sap-hrc-grid.is-3{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
.sap-hrc-w{display:flex;flex-direction:column;gap:10px;min-height:150px}
.sap-hrc-w>header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.sap-hrc-w h3{margin:0;font-size:var(--text-body,15px);font-weight:700;color:var(--eg-navy)}
.sap-hrc-w small.src{color:var(--color-text-muted);font-size:11.5px}
.sap-hrc-big{font:700 32px/1.1 var(--font-en);color:var(--eg-navy);font-variant-numeric:tabular-nums}
.sap-hrc-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--color-border)}
.sap-hrc-row:first-child{border-top:0}
.sap-hrc-row b{font-weight:600}.sap-hrc-row small{color:var(--color-text-muted);display:block}
.sap-hrc-bar{height:8px;border-radius:99px;background:var(--color-bg-alt);overflow:hidden;position:relative;min-width:80px}
.sap-hrc-bar>i{display:block;height:100%;background:var(--eg-navy);border-radius:99px}
.sap-hrc-bar>i.is-over{background:var(--color-accent)}.sap-hrc-bar>i.is-warn{background:var(--color-warning)}
.sap-hrc-denied{display:flex;align-items:center;gap:8px;color:var(--color-text-muted);background:var(--color-bg-alt);border:1px dashed var(--color-border-strong);border-radius:10px;padding:12px;font-size:var(--text-caption)}
.sap-hrc-kanban{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(238px,1fr);gap:12px;overflow-x:auto;padding-bottom:10px;align-items:start}
.sap-hrc-col{background:var(--color-bg-alt);border:1px solid var(--color-border);border-radius:12px;display:flex;flex-direction:column;min-height:220px}
.sap-hrc-col>header{padding:10px 12px;display:flex;justify-content:space-between;align-items:center;font-weight:700;color:var(--eg-navy);border-bottom:1px solid var(--color-border)}
.sap-hrc-col.is-over{outline:2px dashed var(--eg-navy);outline-offset:-4px;background:var(--color-primary-tint)}
.sap-hrc-col .list{padding:8px;display:flex;flex-direction:column;gap:8px;flex:1}
.sap-hrc-card{background:#fff;border:1px solid var(--color-border);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;cursor:pointer;box-shadow:var(--sap-shadow-1);text-align:start}
.sap-hrc-card:hover,.sap-hrc-card:focus-visible{border-color:var(--eg-navy);outline:none}
.sap-hrc-card.is-drag{opacity:.45}
.sap-hrc-card b{color:var(--eg-navy)}.sap-hrc-card small{color:var(--color-text-muted)}
.sap-hrc-tree{list-style:none;margin:0;padding:0}.sap-hrc-tree ul{list-style:none;margin:0;padding:0;padding-inline-start:26px;border-inline-start:2px solid var(--color-border);margin-inline-start:14px}
.sap-hrc-tree li{margin-block:6px}
.sap-hrc-node{display:inline-flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--color-border);border-radius:10px;padding:8px 12px;min-width:220px;box-shadow:var(--sap-shadow-1)}
.sap-hrc-node.is-vacant{border-style:dashed;background:var(--color-warning-tint)}
.sap-hrc-node small{color:var(--color-text-muted);display:block}
.sap-hrc-node button{background:none;border:0;cursor:pointer;color:var(--eg-navy);padding:2px}
.sap-hrc-chain{display:flex;flex-direction:column;gap:0;margin:0;padding:0;list-style:none}
.sap-hrc-chain li{display:flex;gap:12px;align-items:flex-start;padding:10px 0;position:relative}
.sap-hrc-chain li+li{border-top:1px dashed var(--color-border)}
.sap-hrc-dot{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;flex:none;background:var(--color-bg-alt);color:var(--eg-navy);font:700 12px var(--font-en);border:2px solid var(--color-border-strong)}
.sap-hrc-dot.is-done{background:var(--color-success);border-color:var(--color-success);color:#fff}.sap-hrc-dot.is-now{border-color:var(--eg-navy);background:#fff}.sap-hrc-dot.is-bad{background:var(--color-danger);border-color:var(--color-danger);color:#fff}
.sap-hrc-chk{display:flex;flex-direction:column;gap:0;list-style:none;margin:0;padding:0}
.sap-hrc-chk li{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--color-border);flex-wrap:wrap}
.sap-hrc-chk li:first-child{border-top:0}
.sap-hrc-chk .t{display:flex;flex-direction:column;gap:2px;min-width:200px;flex:1}.sap-hrc-chk small{color:var(--color-text-muted)}
.sap-hrc-gauge{display:grid;place-items:center;gap:6px;text-align:center}
.sap-hrc-mx{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}
.sap-hrc-mx th,.sap-hrc-mx td{padding:8px 10px;border-bottom:1px solid var(--color-border);text-align:center;white-space:nowrap}
.sap-hrc-mx th:first-child,.sap-hrc-mx td:first-child{text-align:start;position:sticky;inset-inline-start:0;background:#fff;z-index:1;min-width:190px}
.sap-hrc-mx thead th{position:sticky;top:0;background:#fbfcfe;z-index:2;font-weight:700;color:var(--eg-navy)}
.sap-hrc-mx thead th:first-child{z-index:3}
.sap-hrc-mx td.on{color:var(--eg-navy);font-weight:700}.sap-hrc-mx td.off{color:var(--eg-faint)}
.sap-hrc-mx tr.is-grp td{background:var(--color-bg-alt);font-weight:700;color:var(--eg-navy);text-align:start}
.sap-hrc-dotc{display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline-end:6px;background:var(--color-border-strong)}
.sap-hrc-dotc.ok{background:var(--color-success)}.sap-hrc-dotc.warn{background:var(--color-warning)}.sap-hrc-dotc.bad{background:var(--color-danger)}.sap-hrc-dotc.info{background:var(--color-primary)}
.sap-hrc-tpl{background:#fff;border:1px solid var(--color-border);border-radius:14px;padding:14px;max-width:360px;box-shadow:var(--sap-shadow-1);font-size:14px;line-height:1.7}
.sap-hrc-tpl .h{display:flex;gap:8px;align-items:center;color:var(--color-text-muted);font-size:12px;margin-bottom:6px}
.sap-hrc-sens{display:inline-flex;gap:6px;align-items:center;color:var(--color-text-muted);font-weight:600}
.sap-hrc-split{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:900px){.sap-hrc-split{grid-template-columns:1fr}.sap-hrc-big{font-size:26px}}
.sap-hrc-legend{display:flex;gap:14px;flex-wrap:wrap;color:var(--color-text-muted);font-size:12px}
.sap-hrc-hdr{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.sap-hrc-seg{display:flex;gap:2px;flex-wrap:wrap}
.sap-hrc-spec{display:inline-flex;gap:6px;align-items:center;font-size:12px;color:var(--color-text-muted)}
.sap-hrc-spec a{color:var(--color-primary);font-weight:600}
.sap-hrc-mono{font-family:var(--font-en);direction:ltr;unicode-bidi:isolate;display:inline-block}
.sap-hrc-stars{display:flex;gap:4px}
.sap-hrc-stars button{width:36px;height:36px;border-radius:8px;border:1px solid var(--color-border-strong);background:#fff;cursor:pointer;font:700 14px var(--font-en)}
.sap-hrc-stars button[aria-pressed="true"]{background:var(--eg-navy);color:#fff;border-color:var(--eg-navy)}
.sap-hrc-wrap{overflow:auto;border:1px solid var(--color-border);border-radius:12px;max-height:68vh;background:#fff}
`);

  /* ───────────────────────── catalog additions (guarded) ───────────────────────── */
  [['HR.PLAN.APPROVED', 'اعتماد وقفل خطة القوى العاملة', 'high'], ['HR.PLAN.AMENDED', 'تعديل خطة قوى عاملة مقفلة (Amendment)', 'high'], ['HR.POSITION.CREATED', 'إنشاء وظيفة', 'medium'], ['HR.POSITION.UPDATED', 'تعديل وظيفة', 'medium'],
    ['HR.CANDIDATE.CREATED', 'إضافة مرشح', 'info'], ['HR.CANDIDATE.REJECTED', 'رفض مرشح بسبب', 'medium'], ['HR.CANDIDATE.SCORECARD', 'إرسال تقييم مقابلة', 'info'], ['HR.CANDIDATE.TEST_RECORDED', 'تسجيل نتيجة الاختبار العملي', 'medium'], ['HR.CANDIDATE.TEST_WAIVED', 'إعفاء مرشح من الاختبار العملي', 'high'], ['HR.CANDIDATE.DUPLICATE', 'كشف مرشح مكرّر بالرقم القومي', 'info'],
    ['HR.OFFER.CREATED', 'إعداد عرض وظيفي', 'medium'], ['HR.OFFER.SUBMITTED', 'إرسال عرض للاعتماد', 'medium'], ['HR.OFFER.SENT', 'إرسال العرض للمرشح', 'medium'], ['HR.OFFER.ACCEPTED', 'قبول المرشح للعرض', 'medium'], ['HR.OFFER.DECLINED', 'رفض المرشح للعرض', 'medium'], ['HR.OFFER.CONVERTED', 'تحويل مرشح إلى موظف (ما قبل التعيين)', 'high'], ['HR.MEDICAL.RECORDED', 'تسجيل تصنيف اللياقة الطبية', 'high'],
    ['HR.LEGAL.VERSION_PROPOSED', 'اقتراح إصدار إعداد قانوني', 'high'], ['HR.LEGAL.VERSION_APPROVED', 'اعتماد إصدار إعداد قانوني', 'critical'], ['HR.LEGAL.VERSION_REJECTED', 'رفض إصدار إعداد قانوني', 'medium'], ['HR.OBLIGATION.DONE', 'إغلاق التزام بدليل', 'medium'], ['HR.OBLIGATION.WAIVED', 'إعفاء التزام بسبب', 'high'], ['HR.HOLIDAY.CHANGED', 'تعديل/اعتماد عطلة رسمية', 'medium'],
    ['HR.ACL.DELEGATION_CREATED', 'إنشاء تفويض مؤقت', 'high'], ['HR.ACL.DELEGATION_REVOKED', 'إلغاء تفويض', 'medium'], ['HR.ACL.VIEW_AS', 'معاينة «عرض كدور»', 'medium'], ['HR.ACL.REVIEW_STARTED', 'بدء مراجعة الصلاحيات الربع سنوية', 'medium'], ['HR.ACL.REVIEW_DECIDED', 'قرار مراجعة صلاحية', 'high'], ['HR.NOTIFICATION.TEST', 'إرسال تجربة إشعار', 'info']
  ].forEach((a) => C.addAudit(a[0], a[1], a[2], 'hr'));
  C.approvalTypes.job_offer = C.approvalTypes.job_offer || { label: 'عرض وظيفي', area: 'hr', icon: 'doc' };
  C.approvalTypes.legal_setting = C.approvalTypes.legal_setting || { label: 'إعداد قانوني', area: 'hr', icon: 'shield' };

  /* ───────────────────────── national id helpers (BR-ATS-01/02) ───────────────────────── */
  const GOV = { '01': 'القاهرة', '02': 'الإسكندرية', '03': 'بورسعيد', '04': 'السويس', '11': 'دمياط', '12': 'الدقهلية', '13': 'الشرقية', '14': 'القليوبية', '15': 'كفر الشيخ', '16': 'الغربية', '17': 'المنوفية', '18': 'البحيرة', '19': 'الإسماعيلية', '21': 'الجيزة', '22': 'بني سويف', '23': 'الفيوم', '24': 'المنيا', '25': 'أسيوط', '26': 'سوهاج', '27': 'قنا', '28': 'أسوان', '29': 'الأقصر', '31': 'البحر الأحمر', '32': 'الوادي الجديد', '33': 'مطروح', '34': 'شمال سيناء', '35': 'جنوب سيناء', '88': 'خارج الجمهورية' };
  K.parseNid = function (v) {
    v = String(v || '').replace(/\s/g, '');
    if (!/^\d{14}$/.test(v)) return { ok: false, msg: 'الرقم القومي لازم يكون 14 رقمًا.' };
    if (v[0] !== '2' && v[0] !== '3') return { ok: false, msg: 'أول رقم لازم يكون 2 (مواليد 1900–1999) أو 3 (2000 وما بعد).' };
    const y = (v[0] === '2' ? 1900 : 2000) + +v.slice(1, 3), m = +v.slice(3, 5), d = +v.slice(5, 7); const dt = new Date(y, m - 1, d);
    if (m < 1 || m > 12 || dt.getMonth() !== m - 1 || dt.getDate() !== d) return { ok: false, msg: 'تاريخ الميلاد داخل الرقم غير صحيح.' };
    const g = GOV[v.slice(7, 9)]; if (!g) return { ok: false, msg: 'كود المحافظة غير معروف.' };
    return { ok: true, dob: dt, gov: g, gender: +v[12] % 2 ? 'ذكر' : 'أنثى' };
  };
  K.maskNid = (v) => (v ? '**********' + String(v).slice(-4) : '—');
  K.revealNid = async function (cand) {
    if (!SA.can('hr.pii.reveal')) { SA.toast(NOPERM + ' (hr.pii.reveal)', 'warn'); return null; }
    const r = await SA.confirm({ title: 'كشف الرقم القومي كاملًا', confirmLabel: 'كشف', reasonRequired: true, reasonLabel: 'سبب الكشف', impact: ['الكشف مسجّل باسمك مع السبب (T2).', 'الرقم القومي لا يظهر في أي إشعار أو تصدير.'] });
    if (!r.ok) return null;
    if (!(await SA.stepUp('hr.pii.reveal', { force: true, title: 'إعادة التحقق لكشف بيانات شخصية' }))) return null;
    SA.audit('HR.EMPLOYEE.PII_REVEALED', { target: { type: 'candidate', id: cand.id, label: cand.name }, reason: r.reason, after: { field: 'nationalId' } });
    return cand.nationalId;
  };

  /* ───────────────────────── sensitive money display ───────────────────────── */
  K.salaryNode = function (n, o) { o = o || {}; if (n == null) return h('span.t-muted', {}, '—'); if (K.canSal()) return h('span.num', {}, SA.fmt.money(n)); return h('span.sap-hrc-sens', { title: 'يتطلب hr.salary.view' }, SA.icon('lock', 'icon-sm'), '••• (سري)'); };
  K.logSalaryView = function (target, ctxLabel) { if (!K.canSal()) return; SA.audit('HR.SALARY.VIEWED', { target, reason: ctxLabel || '' }); };

  /* ───────────────────────── page chrome helpers ───────────────────────── */
  K.crumbs = function (ctx, groupId, title) { const g = C.hrGroups.find((x) => x.id === groupId); ctx.setCrumbs([{ label: 'الموارد البشرية' }, { label: g ? g.title : '' }, { label: title }]); };
  K.spec = function (file, anchor, label) { return h('span.sap-hrc-spec', {}, SA.icon('external', 'icon-sm'), h('a', { href: '../../' + file + (anchor ? '#' + anchor : ''), target: '_blank', rel: 'noopener' }, label || 'المواصفة الكاملة ↗')); };
  K.statChips = (rows) => h('div.sap-statrow', {}, rows.map((r) => h('span', {}, h('b.num', {}, r[1]), r[0])));
  K.NAV = (id) => SA.hrNav.find((x) => x.id === id);
  /** Mount helper: permission guard → skeleton (simulated latency, offline → error state) → live build(). */
  K.mount = function (root, ctx, o) {
    K.init();
    const d = SA.guard(o.perm); if (d) { root.append(d); return null; }
    const box = h('div.sap-hrc'); root.append(box); box.append(SA.skeleton({ kind: o.skel || 'table', rows: 5 }));
    let off = null, dead = false;
    SA.delay(o.ms == null ? 140 : o.ms, {}).then(() => { if (dead) return; SA.clear(box); off = SA.live(box, o.build, o.paths || []); },
      (e) => { if (dead) return; SA.clear(box); box.append(SA.errorState({ text: SA.errorText(e), onRetry: () => SA.router.refresh() })); });
    return () => { dead = true; if (off) off(); };
  };
  /** Read-only table helper with sane defaults */
  K.table = (o) => SA.table(Object.assign({ pageSize: 10 }, o));
  K.lockNote = (text) => h('div.sap-hrc-denied', {}, SA.icon('lock', 'icon-sm'), h('span', {}, text || 'يتطلب hr.salary.view — القيمة مخفية لك (T3).'));
  K.tabsState = function (ctx, def) { return ctx.params.tab || def; };
  K.setTab = (route, tab, extra) => SA.nav(route, { query: Object.assign({ tab }, extra || {}), replace: true });

  /* ───────────────────────── approvals: delegation-aware decide + reconcile ───────────────────────── */
  K.delegatedRoles = function (userId) {
    const now = Date.now(); const out = [];
    get('hrDelegations').forEach((d) => { if (d.status === 'active' && d.toUserId === userId && new Date(d.from).getTime() <= now && new Date(d.to).getTime() >= now) { const u = SA.userById(d.fromUserId); if (u) out.push({ roleId: u.roleId, fromUserId: d.fromUserId, id: d.id, types: d.types }); } });
    return out;
  };
  /** Why can't I decide this approval right now? '' = allowed */
  K.cannotDecide = function (ap) {
    const u = me(); if (!u || !ap) return 'غير متاح';
    if (ap.status !== 'pending') return 'الطلب مش بانتظار قرار.';
    const step = ap.chain.find((s) => s.step === ap.currentStep); if (!step) return 'لا توجد خطوة حالية.';
    if (ap.requesterId === u.id) return 'فصل المهام: مقدّم الطلب لا يعتمد طلبه (SOD-08).';
    const d = K.delegatedRoles(u.id).find((x) => x.roleId === step.roleId && (!x.types || !x.types.length || x.types.indexOf(ap.type) >= 0));
    if (d && d.fromUserId === ap.requesterId) return 'فصل المهام: التفويض لا يسمح باعتماد طلب المفوِّض نفسه (SOD-06).';
    const isOwner = !!(SA.session.role && SA.session.role.isProtected);
    if (!(u.roleId === step.roleId || isOwner || d)) return 'الخطوة الحالية («' + step.label + '») ليست دورك.';
    return '';
  };
  K.decide = async function (apId, decision, reason, opts) {
    opts = opts || {}; const ap = st.find('approvals', apId); if (!ap) return false;
    const u = me(); const why = K.cannotDecide(ap);
    if (why) { if (ap.requesterId === u.id) SA.audit('ACCESS.DENIED', { target: { type: 'sod', id: 'SOD-08', label: 'محاولة اعتماد طلب المقدّم نفسه: ' + ap.title }, result: 'denied', reason: why }); SA.toast(why, 'warn', { ms: 6000 }); return false; }
    if (!opts.skipStepUp && !(await SA.stepUp('approval.decide'))) return false;
    const step = ap.chain.find((s) => s.step === ap.currentStep); const viaDeleg = !(u.roleId === step.roleId) && !(SA.session.role && SA.session.role.isProtected);
    try {
      await SA.api(() => {
        st.update('approvals', (list) => {
          const a = list.find((x) => x.id === apId); const s = a.chain.find((x) => x.step === a.currentStep); const now = new Date().toISOString();
          s.status = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'changes_requested'; s.decidedBy = u.id; s.decidedAt = now; s.reason = reason || '';
          if (viaDeleg) s.viaDelegation = true;
          if (decision === 'approved') { const nx = a.chain.find((x) => x.step === a.currentStep + 1); if (nx) { nx.status = 'pending'; a.currentStep += 1; } else a.status = 'approved'; }
          else a.status = decision === 'rejected' ? 'rejected' : 'changes_requested';
          a.updatedAt = now;
        });
      });
    } catch (e) { SA.fail(e); return false; }
    const after = st.find('approvals', apId);
    SA.audit(decision === 'approved' ? 'APPROVAL.APPROVED' : decision === 'rejected' ? 'APPROVAL.REJECTED' : 'APPROVAL.CHANGES_REQUESTED', { target: { type: 'approval', id: ap.id, label: ap.title }, reason: reason || '', before: { status: 'pending', step: step.label }, after: { status: after.status, viaDelegation: viaDeleg || undefined } });
    if (decision === 'approved' && after.status === 'pending') { const nx = after.chain.find((x) => x.step === after.currentStep); SA.notify({ title: 'طلب بانتظار قرارك: ' + ap.title, body: 'اعتُمدت الخطوة السابقة من ' + u.name + '.', level: 'action', to: [nx.roleId, 'R-01'], link: '#/approvals/' + ap.id }); }
    K.reconcile();
    return true;
  };
  /** Apply approval outcomes to the source records this module owns (idempotent; also runs on every approvals change). */
  let reconciling = false;
  K.reconcile = function () {
    if (reconciling || !st.get('approvals')) return; reconciling = true;
    try {
      get('approvals').filter((a) => a.ref && (a.status === 'approved' || a.status === 'rejected' || a.status === 'changes_requested')).forEach((a) => {
        if (a.ref.type === 'hiring_requisition') K._reqOutcome(a);
        else if (a.ref.type === 'job_offer') K._offerOutcome(a);
        else if (a.ref.type === 'legal_setting') K._legalOutcome(a);
      });
    } finally { reconciling = false; }
  };
  st.subscribe('approvals', () => { try { K.reconcile(); } catch (e) { console.error('[hrCore.reconcile]', e); } });

  /* ───────────────────────── approval chain view (shared by requisitions / offers / legal) ───────────────────────── */
  K.chainView = function (ap) {
    if (!ap) return h('p.t-muted', {}, 'لم يُرسل للاعتماد بعد.');
    return h('ol.sap-hrc-chain', {}, ap.chain.map((s) => {
      const cls = s.status === 'approved' ? 'is-done' : s.status === 'rejected' ? 'is-bad' : s.status === 'pending' ? 'is-now' : '';
      const lab = { approved: 'اعتمد', rejected: 'رفض', pending: 'بانتظار القرار', waiting: 'في الانتظار', skipped: 'تخطّى', changes_requested: 'طلب تعديل' }[s.status] || s.status;
      return h('li', {}, h('span.sap-hrc-dot.' + (cls || 'x'), {}, s.status === 'approved' ? SA.icon('check', 'icon-sm') : String(s.step)), h('div', {}, h('b', {}, s.label), h('div.t-muted', {}, lab, s.decidedBy ? ' · ' + SA.userName(s.decidedBy) + ' · ' + SA.fmt.rel(s.decidedAt) : '', s.viaDelegation ? ' (بتفويض)' : ''), s.reason ? h('small.t-muted', {}, '«' + s.reason + '»') : null));
    }));
  };
  /** Decision dialog (approve / reject / return) with SoD + step-up; resolves true when decided. */
  K.decisionDialog = async function (ap, label) {
    const why = K.cannotDecide(ap);
    const reason = SA.form.field({ name: 'r', label: 'السبب / الملاحظة', type: 'textarea', rows: 3, hint: 'إلزامي عند الرفض أو الإعادة للمقدّم.' });
    return new Promise((resolve) => {
      let m; const go = async (dec) => {
        if (dec !== 'approved' && (reason.get() || '').trim().length < 3) { reason.error('اكتب السبب (3 أحرف على الأقل).'); reason.focus(); return; }
        m.setBusy(true); const ok = await K.decide(ap.id, dec, (reason.get() || '').trim()); m.setBusy(false); if (ok) m.close(true);
      };
      const step = ap.chain.find((s) => s.step === ap.currentStep);
      m = SA.modal({ title: 'قرار: ' + (label || ap.title), icon: 'checkcircle', size: 'md',
        body: h('div.sap-confirm', {}, K.chainView(ap), why ? SA.alert('warning', h('b', {}, 'لا يمكنك القرار الآن: '), why) : SA.alert('info', 'الخطوة الحالية: ', h('b', {}, step ? step.label : '—'), '. هيطلب Step-up عند الاعتماد.'), reason.el, h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), 'القرار والسبب بيتسجّلوا في التدقيق وفي صندوق الاعتمادات المشترك.')),
        foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(false) }, 'إغلاق'), SA.btn({ label: 'إعادة للمقدّم', kind: 'ghost', reason: why, onClick: () => go('changes_requested') }), SA.btn({ label: 'رفض', kind: 'danger', reason: why, onClick: () => go('rejected') }), SA.btn({ label: 'اعتماد', kind: 'primary', icon: 'check', reason: why, onClick: () => go('approved') })] });
      m.closed.then((r) => resolve(!!r));
    });
  };
  K.sodBlock = function (ruleId, label, reason) { SA.audit('ACCESS.DENIED', { target: { type: 'sod', id: ruleId, label }, result: 'denied', reason }); SA.toast(reason, 'warn', { ms: 6000 }); };

  /* ───────────────────────── plan metrics (shared by planning / requisitions / dashboard) ───────────────────────── */
  K.filled = (pid) => get('employees').filter((e) => e.positionId === pid && K.ACTIVE.indexOf(e.status) >= 0).length;
  K.reservedOf = (pid) => get('employees').filter((e) => e.positionId === pid && e.status === 'preboarding').length + get('offers').filter((o) => o.positionId === pid && (o.status === 'accepted' || o.status === 'sent' || o.status === 'approved') && !o.convertedEmployeeId).length;
  K.openReq = (pid) => get('requisitions').filter((r) => r.positionId === pid && ['pending_approval', 'approved', 'open'].indexOf(r.status) >= 0).reduce((a, r) => a + Math.max(0, (r.headcount || 0) - (r.hired || 0)), 0);
  K.approvedHc = (pid) => { const p = st.find('positions', pid); return p ? p.headcount || 0 : 0; };
  K.vacancy = (pid) => K.approvedHc(pid) - K.filled(pid) - K.reservedOf(pid);
  K.headcount = () => get('employees').filter((e) => K.ACTIVE.indexOf(e.status) >= 0 && (e.employmentType || 'permanent') === 'permanent').length;
  K.reqStatus = { pending_approval: ['بانتظار الاعتماد', 'warning'], approved: ['معتمد', 'success'], open: ['شاغر مفتوح', 'info'], filled: ['مكتمل', 'success'], rejected: ['مرفوض', 'danger'], returned: ['معاد للمقدّم', 'info'], cancelled: ['ملغى', 'neutral'], draft: ['مسودة', 'neutral'] };
  K.budgetCheck = function (positionId, headcount, newPos) {
    if (newPos) return { result: 'unlisted', label: 'غير مدرج في الخطة', approved: 0, filled: 0, reserved: 0, open: 0, requested: headcount, over: headcount };
    const approved = K.approvedHc(positionId), filled = K.filled(positionId), reserved = K.reservedOf(positionId), open = K.openReq(positionId);
    const total = filled + reserved + open + headcount; const over = total - approved;
    return { result: over > 0 ? 'exceeds' : 'within', label: over > 0 ? 'يتجاوز الميزانية' : 'ضمن الميزانية', approved, filled, reserved, open, requested: headcount, over: Math.max(0, over), total };
  };
  K.budgetChip = (r) => SA.chip(r === 'within' ? 'ضمن الميزانية' : r === 'exceeds' ? 'يتجاوز الميزانية' : 'غير مدرج في الخطة', r === 'within' ? 'success' : r === 'exceeds' ? 'danger' : 'warning');
})();
/* ───────────────────────── part 1 — seed extension (idempotent) + legal registry data + HR-30 الامتثال ───────────────────────── */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store, C = SA.catalog, K = SA.hrCore, get = K.get;
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString();
  K.tick = () => st.set('meta.hrCoreTick', (st.get('meta.hrCoreTick') || 0) + 1);

  /** Generic tabbed screen: head(S) + tabs + panel(tabId, S). Tab kept in the URL query without a full re-render. */
  K.screen = function (root, ctx, o) {
    const S = { tab: ctx.params.tab || o.def, ctx };
    return K.mount(root, ctx, {
      perm: o.perm, skel: o.skel || 'cards', paths: (o.paths || []).concat(['meta.hrCoreTick']),
      build() {
        const tabs = SA.tabs({ tabs: o.tabs(S), active: S.tab, label: o.title, onChange: (id) => { S.tab = id; try { history.replaceState(null, '', '#/' + o.route + '?tab=' + id); } catch (e) { /* noop */ } K.tick(); } });
        return h('div.sap-hrc', {}, o.head(S), tabs.el, h('div', { role: 'tabpanel', id: 'panel-' + S.tab, 'aria-labelledby': 'tab-' + S.tab, class: 'sap-hrc' }, o.panel(S.tab, S)));
      }
    });
  };

  /* ───────────────────────── legal settings registry seed (docs/hr/07 §HR-30 «سجل الإعدادات القانونية») ───────────────────────── */
  const GROUPS = { g1: 'الشركة والقانون العام', g2: 'العقود والتجربة', g3: 'الوقت والحضور', g4: 'الأوفرتايم', g5: 'الإجازات', g6: 'الأجور والعلاوة والحد الأدنى', g7: 'التأمينات الاجتماعية', g8: 'ضريبة كسب العمل', g9: 'صناديق والتزامات أخرى', g10: 'الجزاءات وإنهاء الخدمة' };
  K.legalGroups = GROUPS;
  const CONF = { V: 'نص القانون', O: 'مصدر رسمي', R: 'مصدر ثانوي', U: 'غير متحقق', P: 'قرار شركة' };
  K.legalConf = CONF;
  // [key, group, name, value text, numeric value|null, unit, confidence, legal review (0/1), status 'ref'|'open', table?]
  const SEED = [
    ['thr.work_regulation', 'g1', 'عتبة لائحة تنظيم العمل', '10 عمال (م 137)', 10, 'عامل', 'V', 0], ['thr.social_fund', 'g1', 'عتبة صندوق الخدمات الاجتماعية', '20 عاملاً (م 273)', 20, 'عامل', 'V', 0], ['thr.disability_quota', 'g1', 'عتبة حصة ذوي الإعاقة', '20 عاملاً (قانون 10/2018 م 22)', 20, 'عامل', 'R', 1],
    ['thr.training_fund', 'g1', 'عتبة صندوق التدريب', '30 عاملاً (م 21)', 30, 'عامل', 'V', 0], ['thr.osh_stats', 'g1', 'عتبة إحصائيات الأمراض والإصابات', '30 عاملاً (نصف سنوي)', 30, 'عامل', 'V', 0], ['thr.nurse_doctor', 'g1', 'عتبة ممرضة/طبيب بالمنشأة', '50 عاملاً (م 270)', 50, 'عامل', 'V', 0],
    ['thr.childcare_leave', 'g1', 'عتبة إجازة رعاية الطفل', '50 عاملاً (م 57)', 50, 'عامل', 'V', 0], ['thr.nursery_women', 'g1', 'عتبة الحضانة', '100 عاملة بالموقع (م 60)', 100, 'عاملة', 'V', 0],
    ['law_15_2017_industrial_flag', 'g1', 'هل المصنع «منشأة صناعية» بقانون 15/2017؟', 'نعم (للتأكيد — قرار D1)', null, '', 'U', 1], ['hazardous_work_extra_leave_days', 'g1', 'أيام إجازة إضافية للأعمال الخطرة', '7 أيام (قرار 49/2026 — مصدر ضعيف)', 7, 'يوم', 'U', 1], ['work_regulation_status', 'g1', 'حالة لائحة تنظيم العمل', null, null, '', 'P', 1],
    ['probation_max_days', 'g2', 'أقصى مدة تجربة', '90 يوماً — مرة واحدة مع نفس صاحب العمل (م 90)', 90, 'يوم', 'V', 0], ['contract_types', 'g2', 'أنواع العقد والتحويل التلقائي', 'غير محدد المدة / محدد المدة / مهمة (م 87–88)', null, '', 'V', 0], ['fixed_term_max_before_early_exit', 'g2', 'حد العقد محدد المدة قبل الإنهاء المبكر', '5 سنوات (م 154)', 5, 'سنة', 'V', 0],
    ['notice_period_days', 'g2', 'مدة الإخطار', '90 يوماً للطرفين (م 156)', 90, 'يوم', 'V', 0], ['contract_copies', 'g2', 'عدد نسخ العقد', '4: صاحب العمل · العامل · مكتب التأمينات · الجهة الإدارية (م 89)', 4, 'نسخة', 'V', 0], ['personnel_file_retention_years', 'g2', 'مدة الاحتفاظ بملف الموظف', null, null, 'سنة', 'V', 0], ['required_docs_checklist', 'g2', 'قائمة المستندات المطلوبة حسب نوع الموظف', 'مصري/أجنبي/إناث/ذكور/ذوو إعاقة (HD-01…HD-16)', null, '', 'V', 1],
    ['max_daily_hours', 'g3', 'أقصى ساعات عمل يومية فعلية', '8 ساعات (م 117)', 8, 'ساعة', 'V', 0], ['max_weekly_hours', 'g3', 'أقصى ساعات عمل أسبوعية', '48 ساعة (م 117)', 48, 'ساعة', 'V', 0], ['min_break_minutes_total', 'g3', 'فترات الراحة', '≥ 60 دقيقة · لا أكثر من 5 ساعات متصلة (م 118)', 60, 'دقيقة', 'V', 0], ['hourly_rate_basis', 'g3', 'أساس حساب أجر الساعة', null, null, '', 'U', 1],
    ['ot_caps', 'g3', 'سقف الأوفرتايم (يومي/أسبوعي/شهري/قسم)', null, null, 'ساعة', 'P', 0], ['night_window', 'g3', 'تعريف ساعات الليل', null, null, '', 'U', 1], ['weekly_rest_day', 'g3', 'يوم الراحة الأسبوعية', 'الجمعة افتراضياً — مدفوعة، ≥ 24 ساعة (م 120)', null, '', 'V', 0], ['ramadan_daily_hours_override', 'g3', 'تخفيض ساعات رمضان', null, null, '', 'P', 0],
    ['ot_day_multiplier', 'g4', 'مضاعف أوفرتايم النهار', '1.35 كحد أدنى (م 121)', 1.35, '×', 'V', 1], ['ot_night_multiplier', 'g4', 'مضاعف أوفرتايم الليل', '1.70 كحد أدنى (م 121) — مصادر قديمة تذكر غير ذلك', 1.7, '×', 'V', 1], ['rest_day_work', 'g4', 'العمل في يوم الراحة', 'أجر يوم إضافي + يوم راحة تعويضي (م 121)', null, '', 'V', 1], ['holiday_work', 'g4', 'العمل في العطلة الرسمية', 'أجر اليوم + «مثلي» الأجر — تفسير «مثلي» يحتاج تأكيد (م 129)', null, '', 'U', 1], ['ot_notification_days', 'g4', 'مهلة إخطار الجهة الإدارية بالأوفرتايم', '7 أيام (م 121)', 7, 'يوم', 'V', 0],
    ['annual_leave_table', 'g5', 'جدول الإجازة السنوية', '15 / 21 / 30 / 45 يوماً حسب الخدمة والسن والإعاقة (م 124)', null, 'يوم', 'V', 1], ['casual_leave', 'g5', 'الإجازة العارضة', '7 أيام/سنة بحد أقصى يومين متتاليين (م 128) — مصادر تذكر 6', 7, 'يوم', 'V', 1], ['maternity_leave', 'g5', 'إجازة الوضع', '120 يوماً · ≥ 45 بعد الولادة · حتى 3 مرات (م 54)', 120, 'يوم', 'V', 1], ['sick_scheme_A', 'g5', 'المرضي — مخطط (أ) تأمينات', '75% لمدة 90 يوماً ثم 85%، حد 180 يوماً/سنة (م 131)', null, '', 'V', 1], ['sick_scheme_B', 'g5', 'المرضي — مخطط (ب) المنشآت الصناعية', 'لكل 3 سنوات خدمة: 3 أشهر 100% / 6 أشهر 85% / 3 أشهر 75%', null, '', 'U', 1], ['holiday_calendar', 'g5', 'تقويم العطلات الرسمية (لكل سنة)', null, null, '', 'P', 1],
    ['min_wage_monthly', 'g6', 'الحد الأدنى للأجر (القطاع الخاص)', '7,000 ج.م/شهر من 2025-03-01 — آخر مراجعة مطلع 2027', 7000, 'ج.م/شهر', 'R', 1], ['min_wage_basis', 'g6', 'أساس الحد الأدنى (هل يشمل حصة صاحب العمل؟)', null, null, '', 'U', 1], ['annual_raise_pct', 'g6', 'العلاوة الدورية السنوية', '≥ 3% من الأجر التأميني وبحد أدنى 250 ج.م (م 12)', 3, '%', 'V', 1], ['deduction_cap_loan', 'g6', 'سقف خصم سلف صاحب العمل', '≤ 10% من الأجر بدون فائدة (م 113)', 10, '%', 'V', 1], ['discipline_deduction_cap', 'g6', 'سقف خصم الجزاء', '≤ 5 أيام أجر أساسي للمخالفة وللشهر (م 143، 148)', 5, 'يوم', 'V', 1], ['wage_element_classification', 'g6', 'تصنيف مكونات المرتب (أساسي/متغير/تأميني/ضريبي)', null, null, '', 'P', 1],
    ['ins.employee_rates', 'g7', 'نسب اشتراك العامل', 'معاش 9% + صحة 1% + مكافأة 1% = 11%', 11, '%', 'V', 1], ['ins.employer_rates', 'g7', 'نسب اشتراك صاحب العمل', 'معاش 12% + مرض 3.25% + إصابات 1.5% + بطالة 1% + مكافأة 1% = 18.75%', 18.75, '%', 'V', 1], ['ins.wage_band', 'g7', 'حد أدنى/أقصى للأجر التأميني', '2,700 – 16,700 ج.م من 2026-01-01 · 2027 غير معلن', null, 'ج.م', 'O', 1], ['ins.next_step_up', 'g7', 'الزيادة الدورية +1% في الاشتراكات', null, null, '', 'U', 1], ['ins.forms', 'g7', 'نماذج التأمينات (قائمة قابلة للتعديل)', null, null, '', 'U', 1],
    ['tax.brackets', 'g8', 'شرائح ضريبة كسب العمل (سنوية)', '7 شرائح — الحدود الوسيطة غير مُدخلة', null, '%', 'R', 1], ['tax.personal_exemption', 'g8', 'الإعفاء الشخصي', '20,000 ج.م سنوياً', 20000, 'ج.م/سنة', 'R', 1], ['tax.remittance_day', 'g8', 'يوم توريد الضريبة', 'بحلول يوم 15 من الشهر التالي', 15, 'يوم', 'O', 0], ['martyrs_fund', 'g8', 'صندوق تكريم الشهداء', null, null, '', 'U', 1], ['stamp_duty', 'g8', 'دمغة المرتبات', 'غير مطبّقة على القطاع الخاص (للتأكيد)', null, '', 'U', 1],
    ['training_fund', 'g9', 'صندوق التدريب', '0.25% من الحد الأدنى للأجر التأميني، حد أدنى 10 وأقصى 30 ج.م/عامل/سنة (لـ 30+) (م 21)', null, '', 'V', 1], ['social_fund', 'g9', 'اشتراك الخدمات الاجتماعية', '8–16 ج.م/عامل/سنة (لـ 20+) (م 273)', null, '', 'V', 0], ['disability_quota', 'g9', 'حصة ذوي الإعاقة', '5% لأصحاب 20+ عاملاً — قاعدة التقريب {Open} (قانون 10/2018 م 22)', 5, '%', 'R', 1], ['nursery_rule', 'g9', 'قاعدة الحضانة', '≥ 100 عاملة بالموقع (م 60)', 100, 'عاملة', 'V', 0],
    ['penalty_catalogue', 'g10', 'كتالوج الجزاءات (8 درجات)', 'إنذار · خصم · تأجيل علاوة · حجب نصفها · تأجيل ترقية · خفض أجر · خفض درجة · فصل بحكم (م 139)', null, '', 'V', 1], ['discipline_timers', 'g10', 'مهل الإجراءات التأديبية', 'بدء التحقيق 7 أيام · إنهاؤه 3 أشهر · نافذة الجزاء 30 يوماً', null, '', 'V', 1], ['abandonment_trigger', 'g10', 'حد الانقطاع (اعتبار العامل مستقيلاً)', '10 أيام متصلة أو 20 متقطعة بعد إنذارات (م 166)', 10, 'يوم', 'V', 1], ['compensation_factors', 'g10', 'معاملات التعويض', 'غير مشروع: شهران/سنة · عقد محدد: شهر/سنة · بدل إخطار: 3 أشهر', null, '', 'V', 1], ['service_sla', 'g10', 'مهل الشهادات والمستحقات', 'شهادة الخدمة 15 يوماً · المستحقات 7 أيام (م 175، 108)', 15, 'يوم', 'V', 0]
  ];
  const TAX_ROWS = [{ from: 0, to: 40000, rate: 0 }, { from: null, to: null, rate: 10 }, { from: null, to: null, rate: 15 }, { from: null, to: null, rate: 20 }, { from: null, to: null, rate: 22.5 }, { from: null, to: null, rate: 25 }, { from: 1200000, to: null, rate: 27.5 }];
  const GATES = [
    { id: 'HR-14', name: 'دورة المرتبات (قفل وصرف)', keys: ['ins.employee_rates', 'ins.employer_rates', 'ins.wage_band', 'tax.brackets', 'tax.personal_exemption', 'ot_day_multiplier', 'ot_night_multiplier', 'min_wage_monthly', 'wage_element_classification'], block: 'نعم — حتى يُعتمد ما سبق تُشغَّل الدورة كمسودة تجريبية فقط' },
    { id: 'HR-12', name: 'الأوفرتايم والبدلات', keys: ['ot_day_multiplier', 'ot_night_multiplier', 'hourly_rate_basis', 'night_window', 'ot_caps'], block: 'نعم' },
    { id: 'HR-11', name: 'الإجازات', keys: ['annual_leave_table', 'casual_leave', 'sick_scheme_A', 'holiday_calendar', 'law_15_2017_industrial_flag'], block: 'نعم' },
    { id: 'HR-10', name: 'الحضور', keys: ['night_window', 'ramadan_daily_hours_override', 'holiday_calendar'], block: 'جزئياً (التسجيل يعمل، والتقييم لا)' },
    { id: 'HR-17', name: 'التأمينات والضريبة', keys: ['ins.forms', 'martyrs_fund', 'ins.wage_band'], block: 'نعم' },
    { id: 'HR-20', name: 'الجزاءات', keys: ['penalty_catalogue', 'discipline_timers', 'discipline_deduction_cap', 'work_regulation_status'], block: 'جزئياً' }
  ];
  K.GATES = GATES;
  const OBL = [ // code, title, ref, freq, dueRule, ownerRole, ownerUser, critical, conf, dueDays|null
    ['OB-01', 'نموذج الاحتساب الشهري لضريبة كسب العمل وتوريدها', 'منظومة مصلحة الضرائب (FAQ مارس 2026)', 'شهري', 'يوم {15} من الشهر التالي', 'مسؤول المرتبات ← المالية', 'U-26', 1, 'O', 10], ['OB-02', 'سداد اشتراكات التأمينات الاجتماعية', 'قانون 148/2019 م 121', 'شهري', 'يوم 1 من الشهر التالي', 'المالية', 'U-06', 1, 'V', 26],
    ['OB-03', 'تسجيل مؤمَّن عليه جديد (نموذج 1 + كشف طبي 111)', 'قانون 148 / ملف الموظف م 92', 'حدثي (عند التعيين)', 'المهلة {Open}', 'HR Officer', 'U-25', 0, 'U', null], ['OB-04', 'إنهاء خدمة / خروج من التأمينات (نموذج 6 — غير مؤكد)', 'قانون 148', 'حدثي (عند الخروج)', 'المهلة {Open}', 'HR Officer', 'U-25', 0, 'U', null],
    ['OB-05', 'تحديث حدّي الأجر التأميني (أدنى/أقصى) للسنة الجديدة', 'قانون 148 — إعلان التأمينات', 'سنوي (يناير)', 'ينتظر إعلان نهاية نوفمبر · سريان 1 يناير', 'مسؤول المرتبات', 'U-26', 1, 'O', 20], ['OB-06', 'بيان القوى العاملة للوزارة', 'قانون العمل م 36', 'سنوي (يناير)', 'خلال يناير', 'HR Manager', 'U-08', 0, 'V', 87],
    ['OB-07', 'أربع نسخ من عقد العمل (صاحب العمل · العامل · التأمينات · الجهة الإدارية)', 'م 89', 'حدثي (عند التوقيع)', 'عند التوقيع', 'HR Officer', 'U-25', 0, 'V', null], ['OB-08', 'إخطار الجهة الإدارية بالأوفرتايم', 'م 121', 'حدثي', 'خلال 7 أيام', 'HR Officer', 'U-25', 0, 'V', null],
    ['OB-09', 'إرسال نسخة جدول العمل وتعديلاته للجهة', 'م 122', 'حدثي', 'خلال 7 أيام', 'HR Officer', 'U-25', 0, 'V', null], ['OB-10', 'إحصائيات الأمراض والإصابات (لـ 30+)', 'قسم السلامة بالقانون', 'نصف سنوي (يناير ويوليو)', 'نهاية الفترة {Open}', 'OHS Officer', 'U-28', 0, 'V', 87],
    ['OB-11', 'إخطار فوري بإصابة العمل', 'قانون 148 م 63', 'حدثي', 'فوراً', 'OHS Officer', 'U-28', 1, 'V', null], ['OB-12', 'نموذج 4 مرتبات (ربع سنوي)', 'ETA', 'ربع سنوي', 'الموعد {Open}', 'المالية', 'U-06', 0, 'O', null],
    ['OB-13', 'التسوية السنوية — نموذج 9 تسويات', 'ETA', 'سنوي (يناير)', 'نهاية يناير (مصدر 2021 — للتأكيد)', 'المالية', 'U-06', 0, 'U', 87], ['OB-14', 'اشتراك صندوق التدريب (لـ 30+)', 'م 21', 'سنوي', 'الموعد {Open}', 'المالية', 'U-06', 0, 'V', null],
    ['OB-15', 'اشتراك صندوق الخدمات الاجتماعية (لـ 20+)', 'م 273', 'سنوي', 'الموعد {Open}', 'المالية', 'U-06', 0, 'V', null], ['OB-16', 'العلاوة الدورية السنوية (≥ 3% من الأجر التأميني)', 'م 12', 'متجدّد', 'عند مرور 12 شهراً', 'HR Manager', 'U-08', 0, 'V', 34],
    ['OB-17', 'تأكيد تقويم العطلات الرسمية لسنة 2027', 'قرار وزير العمل 294/2025 + الكتب الدورية', 'سنوي', 'بعد كل إعلان (العيدان بالرؤية)', 'HR Manager', 'U-08', 0, 'P', 40], ['OB-18', 'قيد العامل بمكتب العمل وإعادة الشهادة', 'م 33، 35', 'حدثي', 'قيد خلال 30 يوماً · إعادة الشهادة خلال 45 يوماً', 'HR Officer', 'U-25', 0, 'V', null],
    ['OB-19', 'لائحة تنظيم العمل (لـ 10+)', 'م 137', 'مرة واحدة', 'خلال 60 يوماً من بلوغ العتبة — الحالة {Open}', 'HR Manager', 'U-08', 1, 'V', -3], ['OB-20', 'انتهاء الشهادات والكشوف الطبية والمستندات', 'HR-19 · HR-21 · HR-06', 'متجدّد', '60 / 30 / 7 يوماً قبل الانتهاء', 'HR Officer ← المشرف', 'U-25', 0, 'P', 6],
    ['OB-21', 'شهادة الخدمة والمستحقات عند الإنهاء', 'م 175، 108', 'حدثي', 'الشهادة 15 يوماً · المستحقات 7 أيام', 'HR Officer', 'U-25', 0, 'V', null], ['OB-22', 'حصة ذوي الإعاقة: السجل والإخطار والمراجعة السنوية', 'قانون 10/2018 م 22', 'سنوي', 'المراجعة {Open}', 'HR Manager', 'U-08', 0, 'R', 55],
    ['OB-23', 'سجل الجزاءات المالية وتوجيه حصيلتها', 'م 153', 'متجدّد', 'عند كل جزاء مالي', 'HR Manager', 'U-08', 0, 'V', null], ['OB-24', 'مراجعة الحد الأدنى للأجر (كل 6 أشهر على الأقل)', 'م 103 + المجلس القومي للأجور', 'نصف سنوي', 'مطلع 2027 (مصدر ثانوي)', 'HR Manager', 'U-08', 0, 'R', 57]
  ];
  const HOL = [['رأس السنة الهجرية', 'قرار 294/2025', 'الخميس 2026-06-18'], ['المولد النبوي', 'قرار 294/2025', 'الخميس 2026-08-27 بدل الثلاثاء 08-25'], ['عيد الفطر', 'قرار 294/2025 (يومان)', '2026-03-19 إلى 03-23'], ['عيد الأضحى', 'قرار 294/2025 (3 أيام)', '2026-05-26 إلى 05-31'], ['عيد الميلاد المجيد (7 يناير)', 'قرار 294/2025', 'الأربعاء 2026-01-07'], ['عيد الشرطة (25 يناير)', 'قرار 294/2025', 'الأحد 2026-01-25'], ['شم النسيم', 'قرار 294/2025', 'الاثنين 2026-04-13'], ['تحرير سيناء (25 أبريل)', 'قرار 294/2025', 'السبت 2026-04-25 (للحكومة)'], ['عيد العمال (1 مايو)', 'قرار 294/2025', 'الجمعة 2026-05-01'], ['30 يونيو', 'قرار 294/2025', 'الخميس 2026-07-02 بدل الثلاثاء 06-30'], ['23 يوليو', 'قرار 294/2025', 'الخميس 2026-07-23'], ['عيد القوات المسلحة (6 أكتوبر)', 'قرار 294/2025', 'الخميس 2026-10-08 بدل الثلاثاء 10-06']];
  const LAW = [['LC-2026-001', 'إعلان حدّي الأجر التأميني لسنة 2027', 'التأمينات (متوقع نهاية نوفمبر)', 'awaiting', ['ins.wage_band'], ['HR-14', 'HR-16', 'HR-17']], ['LC-2026-002', 'الزيادة الدورية +1% في اشتراكات التأمينات من 2027-01-01', 'قانون 148 م 19 — تطبيقها غير معلن', 'legal', ['ins.employee_rates', 'ins.employer_rates', 'ins.next_step_up'], ['HR-14', 'HR-17', 'HR-25']], ['LC-2026-003', 'قرار 49/2026: +7 أيام إجازة للأعمال الخطرة (مصدر واحد ضعيف)', 'صحافة — النص لم يُقرأ', 'source', ['hazardous_work_extra_leave_days', 'annual_leave_table'], ['HR-11', 'HR-25']], ['LC-2026-004', 'قرارات 248–252/2026: وحدات ولجان السلامة والصحة المهنية', 'صحافة 2026-10-20', 'source', ['thr.osh_stats', 'thr.nurse_doctor'], ['HR-21', 'HR-30']], ['LC-2026-005', 'مراجعة الحد الأدنى للأجر مطلع 2027', 'المجلس القومي للأجور (صحافة 2026-10-29)', 'awaiting', ['min_wage_monthly', 'min_wage_basis'], ['HR-13', 'HR-14']]];

  /* ───────────────────────── init (idempotent) ───────────────────────── */
  K.init = function () {
    if (!st.get('meta') || st.get('meta.hrCoreV')) return;
    const OPERATIONAL = ['P-07', 'P-08', 'P-09', 'P-10'];
    st.update('positions', (l) => l.forEach((p) => {
      if (p.status) return; const op = OPERATIONAL.indexOf(p.id) >= 0;
      p.status = 'active'; p.operational = op; p.safetyCritical = op; p.reportsTo = p.id === 'P-01' ? null : (p.departmentId === 'D-09' || p.departmentId === 'D-11' || p.departmentId === 'D-12' ? 'P-06' : 'P-01');
      p.salaryBand = { min: Math.round(((p.id.charCodeAt(2) % 7) * 900 + 7500) / 100) * 100, max: Math.round(((p.id.charCodeAt(2) % 7) * 900 + 14500) / 100) * 100, demo: true };
      p.jdVersion = 1; p.jd = 'الوصف الوظيفي (تجريبي): ' + p.title + ' — المهام والمسؤوليات والمؤهلات تُحرَّر من هنا بإصدار جديد عند كل تعديل.'; p.grade = p.grade || null;
    }));
    st.update('requisitions', (l) => l.forEach((r) => {
      if (r.type) return; r.type = 'permanent'; r.urgency = 'normal'; r.needBy = K.ymd(inDays(30)); r.hired = r.hired || 0;
      r.budgetCheck = r.budgetCheck || K.budgetCheck(r.positionId, r.headcount); if (r.status === 'open') { r.approvedAt = ago(60 * 24 * 8); }
    }));
    const NIDS = ['29805121201234', '30001151201876', '29512201200521', '29903051203349', '30104181202115', '29611301200688'];
    st.update('candidates', (l) => {
      l.forEach((c, i) => { if (c.nationalId) return; c.nationalId = NIDS[i % NIDS.length]; c.phone = '+20 100 555 ' + (1000 + i * 37); c.expectedSalary = 9000 + i * 600; c.military = 'أدّى'; c.relativeOfEmpId = null; c.scorecards = []; c.practicalTest = { status: 'pending' }; c.history = [{ ts: c.appliedAt, stage: 'applied', by: 'SYSTEM' }]; c.applications = []; c.privacyConsent = true; });
      const c1 = l.find((x) => x.id === 'CD-001'); if (c1) { c1.scorecards = [{ id: 'SC-1', interviewerId: 'U-27', scores: { technical: 4, safety: 5, attitude: 4 }, rec: 'hire', note: 'خبرة جيدة على الماكينات — مناسب.', submittedAt: ago(60 * 24 * 2) }]; c1.history.push({ ts: ago(60 * 24 * 3), stage: 'screening', by: 'U-25' }, { ts: ago(60 * 24 * 2), stage: 'interview', by: 'U-25' }); }
      const c4 = l.find((x) => x.id === 'CD-004'); if (c4) { c4.history.push({ ts: ago(60 * 24 * 4), stage: 'screening', by: 'U-25' }, { ts: ago(60 * 24 * 3), stage: 'interview', by: 'U-25' }, { ts: ago(60 * 24 * 1), stage: 'test', by: 'U-25' }); c4.practicalTest = { status: 'pending' }; }
      if (!l.find((x) => x.id === 'CD-005')) {
        l.push({ id: 'CD-005', name: 'هاني فتحي', requisitionId: 'RQ-2026-0002', stage: 'offer', source: 'مدرسة فنية', appliedAt: ago(60 * 24 * 12), nationalId: '29907121203457', phone: '+20 100 555 9005', expectedSalary: 11500, military: 'أدّى', relativeOfEmpId: null, privacyConsent: true, applications: [],
          scorecards: [{ id: 'SC-2', interviewerId: 'U-13', scores: { technical: 5, safety: 4, attitude: 5 }, rec: 'hire', note: 'ممتاز في التركيب الميداني.', submittedAt: ago(60 * 24 * 7) }], practicalTest: { status: 'passed', score: 88, by: 'U-13', at: ago(60 * 24 * 6) },
          history: [{ ts: ago(60 * 24 * 12), stage: 'applied', by: 'SYSTEM' }, { ts: ago(60 * 24 * 10), stage: 'screening', by: 'U-25' }, { ts: ago(60 * 24 * 8), stage: 'interview', by: 'U-25' }, { ts: ago(60 * 24 * 6), stage: 'test', by: 'U-25' }, { ts: ago(60 * 24 * 5), stage: 'offer', by: 'U-25' }] });
      }
    });
    if (!get('offers').length && !st.get('offers')) st.set('offers', []);
    if (!st.find('offers', 'OF-2026-0001')) {
      st.insert('offers', { id: 'OF-2026-0001', candidateId: 'CD-005', requisitionId: 'RQ-2026-0002', positionId: 'P-10', departmentId: 'D-12', contractType: 'indefinite', endDate: null, justification: '', startDate: K.ymd(inDays(14)), probationDays: 90, salary: { basic: 10500, allowances: 1800, demo: true }, bandResult: 'within', status: 'accepted', approvalId: null, createdBy: 'U-25', createdAt: ago(60 * 24 * 4), sentAt: ago(60 * 24 * 3), respondedAt: ago(60 * 24 * 2), validUntil: K.ymd(inDays(1)),
        medical: { status: 'pending' }, docs: K.defaultDocs(), contract: { signed: false, art89: {} }, convertedEmployeeId: null, log: [{ ts: ago(60 * 24 * 4), text: 'تم إعداد العرض', by: 'U-25' }, { ts: ago(60 * 24 * 3), text: 'اعتُمد وأُرسل للمرشح', by: 'U-08' }, { ts: ago(60 * 24 * 2), text: 'قبل المرشح العرض', by: 'U-25' }] });
    }
    if (!st.get('hrLegal')) st.set('hrLegal', SEED.map((r) => {
      const open = r[3] == null; const v = open ? [] : [{ no: 1, value: r[3], n: r[4], effectiveFrom: null, status: 'reference', proposedBy: 'SYSTEM', approvedBy: null, approvedAt: null, note: 'لقطة مرجعية من الريسيرش — Pending Confirmation', approvalId: null, rows: r[2].indexOf('شرائح ضريبة') === 0 ? TAX_ROWS : undefined }];
      return { key: r[0], group: r[1], name: r[2], unit: r[5], conf: r[6], legalReview: !!r[7], kind: r[0] === 'tax.brackets' ? 'table' : 'text', versions: v };
    }));
    if (!st.get('hrObligations')) st.set('hrObligations', OBL.map((o) => ({ id: o[0], title: o[1], ref: o[2], freq: o[3], dueRule: o[4], ownerRole: o[5], ownerUserId: o[6], critical: !!o[7], conf: o[8], dueDate: o[9] == null ? null : K.ymd(inDays(o[9])), status: 'open', evidence: [], doneBy: null, checkedBy: null, waivedReason: '', reminders: [] })));
    if (!st.get('hrHolidays')) st.set('hrHolidays', { 2026: HOL.map((x, i) => ({ code: 'H-' + (i + 1), name: x[0], ref: x[1], press: x[2], dateFrom: null, dateTo: null, status: 'unset', enteredBy: null, approvedBy: null })), 2027: [] });
    if (!st.get('hrLawChanges')) st.set('hrLawChanges', LAW.map((x) => ({ id: x[0], title: x[1], source: x[2], status: x[3], settings: x[4], features: x[5], closedReason: '', demo: true })));
    if (!st.get('hrPlan')) st.set('hrPlan', { year: '2026', status: 'draft', version: 1, preparedBy: 'U-25', approvedBy: null, lockedAt: null, history: [{ ts: ago(60 * 24 * 14), text: 'أُعدّت الخطة (مسودة) من ريم عبد الحميد', by: 'U-25' }], disabledCount: null });
    if (!st.get('hrDelegations')) st.set('hrDelegations', [{ id: 'DG-001', fromUserId: 'U-08', toUserId: 'U-25', types: ['hiring_requisition'], from: ago(60 * 24), to: inDays(6), reason: 'إجازة سنوية لمدير الموارد البشرية', status: 'active', createdBy: 'U-08', createdAt: ago(60 * 24) }, { id: 'DG-002', fromUserId: 'U-08', toUserId: 'U-24', types: [], from: ago(60 * 24 * 40), to: ago(60 * 24 * 33), reason: 'مهمة عمل خارجية', status: 'expired', createdBy: 'U-08', createdAt: ago(60 * 24 * 41) }]);
    if (!st.get('hrAccessReviews')) st.set('hrAccessReviews', []);
    if (!st.get('hrNotifCfg')) st.set('hrNotifCfg', {});
    // spec matrix (SUP: hr.dashboard V/t): the seed role R-14 lacks hr.dashboard.view → add silently (role snapshots are taken at login)
    st.update('roles', (l) => { const r = l.find((x) => x.id === 'R-14'); if (r && r.sa && r.sa[0] !== '*' && r.sa.indexOf('hr.dashboard.view') < 0) r.sa.push('hr.dashboard.view'); });
    st.set('meta.hrCoreV', 1);
  };
  SA.on('login', () => { try { K.init(); } catch (e) { console.error(e); } });

  /* ───────────────────────── legal registry accessors ───────────────────────── */
  K.legalList = () => get('hrLegal');
  K.setting = (key) => get('hrLegal').find((s) => s.key === key) || null;
  K.curVersion = (s) => s && (s.versions.filter((v) => v.status === 'approved').sort((a, b) => b.no - a.no)[0] || null);
  K.refVersion = (s) => s && (K.curVersion(s) || s.versions.filter((v) => v.status === 'reference' || v.status === 'pending').sort((a, b) => b.no - a.no)[0] || null);
  /** approved | pending | open */
  K.legalStatus = (s) => (K.curVersion(s) ? 'approved' : s.versions.some((v) => v.status === 'reference' || v.status === 'pending' || v.status === 'draft') ? 'pending' : 'open');
  /** SA.hrCore.legal('probation_max_days') → {n, text, status:'approved|pending|open', effectiveFrom} (n null when Open) */
  K.legal = function (key) { const s = K.setting(key); if (!s) return { n: null, text: null, status: 'open' }; const v = K.refVersion(s); return { n: v ? v.n : null, text: v ? v.value : null, status: K.legalStatus(s), effectiveFrom: v ? v.effectiveFrom : null, review: s.legalReview }; };
  K.gate = function (id) {
    const g = GATES.find((x) => x.id === id); if (!g) return { ready: true, missing: [] };
    const missing = g.keys.filter((k) => { const s = K.setting(k); return !s || K.legalStatus(s) !== 'approved'; });
    return { id, name: g.name, ready: !missing.length, missing, total: g.keys.length, block: g.block };
  };
  K.legalTag = (key) => { const l = K.legal(key); return l.status === 'approved' ? SA.chip('معتمد', 'success') : l.status === 'pending' ? SA.chip('Pending [Law]', 'warning') : SA.chip('غير مُعدّ', 'neutral'); };
  K.legalStatusChip = (s) => { const x = K.legalStatus(s); return SA.chip(x === 'approved' ? 'معتمد' : x === 'pending' ? 'Pending Confirmation' : 'غير مُعدّ {Open}', x === 'approved' ? 'success' : x === 'pending' ? 'warning' : 'neutral'); };
  K.verChip = (v) => { const m = { reference: ['لقطة مرجعية', 'warning'], pending: ['بانتظار الاعتماد', 'info'], approved: ['معتمد', 'success'], superseded: ['مُستبدَل', 'neutral'], rejected: ['مرفوض', 'danger'], draft: ['مسودة', 'neutral'] }[v.status] || [v.status, 'neutral']; return SA.chip(m[0], m[1]); };
  K.validateBrackets = function (rows) {
    const errs = []; rows.forEach((r, i) => { if (r.rate == null || r.rate < 0 || r.rate > 100) errs.push('الشريحة ' + (i + 1) + ': النسبة لازم تكون بين 0 و100.'); if (r.from == null) errs.push('الشريحة ' + (i + 1) + ': الحد الأدنى غير مُدخل.'); if (i < rows.length - 1 && r.to == null) errs.push('الشريحة ' + (i + 1) + ': الحد الأقصى غير مُدخل (آخر شريحة فقط تُترك مفتوحة).'); if (r.from != null && r.to != null && r.from > r.to) errs.push('الشريحة ' + (i + 1) + ': الحد الأدنى أكبر من الأقصى.'); if (i > 0 && rows[i - 1].to != null && r.from != null && rows[i - 1].to !== r.from) errs.push('الشريحتان ' + i + ' و' + (i + 1) + ': غير متصلتين أو متداخلتين.'); });
    if (rows.length && rows[rows.length - 1].to != null) errs.push('آخر شريحة لازم تكون مفتوحة (بدون حد أقصى).');
    return Array.from(new Set(errs));
  };
  K.defaultDocs = function () { // docs/hr/01 §قائمة المستندات المطلوبة (HD-01…): mandatory flag from the suggested default — Pending/Open
    return [['HD-01', 'صورة بطاقة الرقم القومي (وجهان)', true, true], ['HD-02', 'شهادة قيد العامل بمكتب العمل', true, true], ['HD-03', 'رقم التأمين / بيانات التأمين السابقة', false, true], ['HD-04', 'شهادة اللياقة الطبية (ونموذج 111)', true, true], ['HD-05', 'موقف التجنيد (أدّى/معفى/مؤجَّل)', true, true], ['HD-06', 'المؤهل الدراسي', true, true], ['HD-09', 'إثبات محل الإقامة', true, false], ['HD-10', 'صحيفة الحالة الجنائية (فيش وتشبيه)', false, false], ['HD-12', 'صور شخصية (4×6)', true, false], ['HD-13', 'بيانات الحساب البنكي / المحفظة', true, false], ['HD-14', 'خطابات مراجع / شهادات خبرة', false, false]].map((d) => ({ key: d[0], label: d[1], required: d[2], legal: d[3], status: 'missing', waivedBy: null, reason: '' }));
  };

  /* ═════════════════════════ HR-30 · الامتثال ═════════════════════════ */
  const fmtD = (v) => (v ? SA.fmt.date(v) : '—');
  function settingStatusText(s) { return K.legalStatus(s); }

  async function proposeVersion(s) {
    if (!SA.can('hr.compliance.edit')) { SA.toast('ليست من صلاحياتك (hr.compliance.edit)', 'warn'); return; }
    const cur = K.refVersion(s); const isTable = s.kind === 'table';
    const val = SA.form.field({ name: 'value', label: 'القيمة (نص كما سيظهر)', type: 'textarea', rows: 2, required: true, value: cur ? cur.value : '' });
    const num = SA.form.field({ name: 'n', label: 'القيمة الرقمية' + (s.unit ? ' (' + s.unit + ')' : '') + ' — اختياري', type: 'number', value: cur && cur.n != null ? cur.n : '' });
    const eff = SA.form.field({ name: 'eff', label: 'تاريخ السريان (effective_from)', type: 'date', required: true, hint: 'تاريخ في الماضي = أثر رجعي (يحتاج المالية والمالك).' });
    const src = SA.form.field({ name: 'src', label: 'مرجع المصدر الرسمي / تأكيد قانوني موقّع', required: s.conf === 'U', hint: s.conf === 'U' ? 'إلزامي: الإعداد بثقة «غير متحقق» (BR-CMP-04).' : 'اختياري.' });
    const lr = SA.form.field({ name: 'lr', label: 'مرجع المراجعة القانونية الموقّعة', required: s.legalReview, hint: s.legalReview ? 'تتطلب مراجعة قانونية قبل التفعيل (BR-CMP-05).' : 'غير مطلوب لهذا الإعداد.' });
    const note = SA.form.field({ name: 'note', label: 'ملاحظات', type: 'textarea', rows: 2 });
    let rows = isTable ? SA.clone((cur && cur.rows) || []) : null; const rowsBox = h('div'); const rowsErr = h('div.sap-field-error', { role: 'alert', hidden: true });
    function drawRows() {
      SA.clear(rowsBox); if (!isTable) return; const num2 = (v) => (v === '' || v == null ? null : Number(v));
      const trs = rows.map((r, i) => h('tr', {}, h('td.num', {}, i + 1), ['from', 'to', 'rate'].map((k) => h('td', {}, h('input.input.num', { type: 'number', value: r[k] == null ? '' : r[k], 'aria-label': k, style: { width: '120px' }, oninput: (e) => { r[k] = num2(e.target.value); } }))), h('td', {}, SA.btn({ label: 'حذف', icon: 'trash', kind: 'ghost', size: 'sm', iconOnly: true, onClick: () => { rows.splice(i, 1); drawRows(); } }))));
      const thead = h('thead', {}, h('tr', {}, ['#', 'من (ج.م)', 'إلى (ج.م)', 'النسبة %', ''].map((x) => h('th', {}, x))));
      rowsBox.append(h('div.table-wrap', {}, h('table.table', {}, thead, h('tbody', {}, trs))), SA.btn({ label: 'إضافة شريحة', icon: 'plus', kind: 'ghost', size: 'sm', onClick: () => { rows.push({ from: null, to: null, rate: null }); drawRows(); } }), rowsErr);
    }
    drawRows();
    const retroBox = h('div'); eff.input.addEventListener('change', () => { SA.clear(retroBox); const d = eff.get(); if (d && new Date(d) < new Date(K.ymd(new Date()))) { const runs = get('payrollRuns').filter((r) => r.period >= d.slice(0, 7)); retroBox.append(SA.alert('warning', h('b', {}, 'أثر رجعي: '), 'تاريخ السريان في الماضي — يحتاج المالية والمالك، وهيتأثر ' + runs.length + ' دورة مرتبات (' + (runs.map((r) => r.id).join('، ') || '—') + ') و' + K.headcount() + ' موظف. لا يغيّر دورة مُغلقة تلقائيًا؛ لازم خطة إعادة حساب (BR-CMP-06).')); } });
    const grp = SA.form.group([val, num, eff, src, lr, note]);
    const m = SA.modal({ title: 'اقتراح إصدار جديد', subtitle: s.name, icon: 'edit', size: 'lg',
      body: h('div.sap-confirm', {}, SA.alert('info', 'الإصدار الجديد ', h('b', {}, 'لا يُفعَّل'), ' إلا بعد اعتماد شخص مختلف عنك (فصل مهام BR-CMP-03)' + (['g6', 'g7', 'g8'].indexOf(s.group) >= 0 ? ' وبعد المالية (قيم مالية).' : '.')), h('div.sap-formgrid', {}, val.el, num.el, eff.el), isTable ? h('div', {}, h('h4', {}, 'جدول الشرائح'), rowsBox) : null, h('div.sap-formgrid', {}, src.el, lr.el), note.el, retroBox),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(false) }, 'إلغاء'), SA.btn({ label: 'إرسال للاعتماد', kind: 'primary', icon: 'check', onClick: async () => {
        if (!grp.validate()) return;
        if (isTable) { const e = K.validateBrackets(rows); if (e.length) { rowsErr.hidden = false; rowsErr.textContent = e[0] + (e.length > 1 ? ' (+' + (e.length - 1) + ' أخطاء أخرى)' : ''); return; } rowsErr.hidden = true; }
        const g = grp.get(); const retro = new Date(g.eff) < new Date(K.ymd(new Date())); const fin = ['g6', 'g7', 'g8'].indexOf(s.group) >= 0;
        m.setBusy(true);
        try {
          await SA.api(() => {
            const no = Math.max(0, ...s.versions.map((v) => v.no)) + 1; const chain = [{ roleId: 'R-11', label: 'HR Manager (معتمد غير المقترح)' }]; if (fin || retro) chain.push({ roleId: 'R-07', label: 'المالية' }); if (retro) chain.push({ roleId: 'R-01', label: 'المالك (أثر رجعي)' });
            const ap = SA.requestApproval({ type: 'legal_setting', title: 'اعتماد إصدار «' + s.name + '» (v' + no + ') — يسري من ' + SA.fmt.date(g.eff), chain, context: [['الإعداد', s.key], ['القيمة المقترحة', g.value], ['تاريخ السريان', SA.fmt.date(g.eff)], ['المراجعة القانونية', g.lr || (s.legalReview ? 'مطلوبة' : 'غير مطلوبة')], ['ملاحظة', 'المقترح لا يعتمد إصداره (فصل مهام)']], ref: { type: 'legal_setting', id: s.key + '#' + no } });
            st.update('hrLegal', (l) => { const x = l.find((y) => y.key === s.key); x.versions.push({ no, value: g.value, n: g.n, effectiveFrom: g.eff, status: 'pending', proposedBy: K.me().id, approvedBy: null, approvedAt: null, note: g.note, source: g.src, legalReviewRef: g.lr, retro, approvalId: ap.id, rows: isTable ? SA.clone(rows) : undefined }); });
            SA.audit('HR.LEGAL.VERSION_PROPOSED', { target: { type: 'legal_setting', id: s.key, label: s.name }, before: cur ? { value: cur.value, effective_from: cur.effectiveFrom } : null, after: { value: g.value, effective_from: g.eff, version: no, retro: retro || undefined }, reason: g.note });
          });
        } catch (e) { m.setBusy(false); SA.fail(e); return; }
        m.setBusy(false); m.close(true); SA.toast('اتبعت الإصدار للاعتماد — ظاهر في صندوق الاعتمادات المشترك.', 'success');
      } })] });
  }
  K._legalOutcome = function (a) {
    const [key, no] = String(a.ref.id).split('#'); const s = K.setting(key); if (!s) return; const v = s.versions.find((x) => x.no === +no); if (!v || v.status !== 'pending') return;
    const last = a.chain.slice().reverse().find((c) => c.decidedBy) || {};
    st.update('hrLegal', (l) => { const x = l.find((y) => y.key === key); const vv = x.versions.find((q) => q.no === +no);
      if (a.status === 'approved') { x.versions.forEach((q) => { if (q.status === 'approved') q.status = 'superseded'; }); vv.status = 'approved'; vv.approvedBy = last.decidedBy; vv.approvedAt = last.decidedAt; }
      else { vv.status = a.status === 'rejected' ? 'rejected' : 'draft'; vv.rejectionReason = last.reason; } });
    SA.audit(a.status === 'approved' ? 'HR.LEGAL.VERSION_APPROVED' : 'HR.LEGAL.VERSION_REJECTED', { target: { type: 'legal_setting', id: key, label: s.name }, after: { version: +no, status: a.status === 'approved' ? 'approved' : 'rejected', effective_from: v.effectiveFrom }, reason: last.reason || '' });
    SA.notify({ title: (a.status === 'approved' ? 'اعتُمد إعداد قانوني: ' : 'رُفض إصدار إعداد قانوني: ') + s.name, body: 'الإصدار v' + no + (v.effectiveFrom ? ' · يسري من ' + SA.fmt.date(v.effectiveFrom) : ''), level: 'info', toUsers: [v.proposedBy], link: '#/hr/compliance?tab=registry' });
  };

  function settingDrawer(key) {
    const s0 = K.setting(key); if (!s0) return;
    const body = h('div'); let dr;
    const draw = () => {
      const s = K.setting(key); SA.clear(body); const cur = K.refVersion(s); const pend = s.versions.find((v) => v.status === 'pending');
      body.append(
        s.legalReview ? SA.alert('warning', h('b', {}, 'تتطلب مراجعة قانونية'), ' [Law] — لا تفعيل بدون مرجع مراجعة موقّعة (BR-CMP-05).') : null,
        s.conf === 'U' ? SA.alert('warning', 'ثقة المصدر «غير متحقق» — يلزم مصدر رسمي أو تأكيد قانوني قبل الاعتماد.') : null,
        SA.kv([['المفتاح', h('code', {}, s.key)], ['المجموعة', K.legalGroups[s.group]], ['ثقة المصدر', K.legalConf[s.conf] + ' (' + s.conf + ')'], ['الحالة', K.legalStatusChip(s)], ['القيمة الحالية / المرجعية', cur ? h('span', {}, cur.value, cur.effectiveFrom ? '' : h('small.t-muted', {}, '  (لا تاريخ سريان بعد)')) : SA.openValue('غير مُعدّ — يوقف أي حساب يعتمد عليه')], ['يسري من', cur ? fmtD(cur.effectiveFrom) : '—']]),
        h('h4', { style: { marginBlockStart: '14px' } }, 'سجل الإصدارات (لا حذف — استبدال فقط)'),
        s.versions.length ? h('ol.sap-hrc-chain', {}, s.versions.slice().sort((a, b) => b.no - a.no).map((v, i, arr) => { const prev = arr[i + 1];
          return h('li', {}, h('span.sap-hrc-dot', {}, 'v' + v.no), h('div', { style: { flex: 1 } }, h('div', {}, K.verChip(v), ' ', h('b', {}, v.value)), h('small.t-muted', {}, 'سريان: ' + fmtD(v.effectiveFrom) + (v.proposedBy && v.proposedBy !== 'SYSTEM' ? ' · اقترحه ' + SA.userName(v.proposedBy) : '') + (v.approvedBy ? ' · اعتمده ' + SA.userName(v.approvedBy) : '') + (v.retro ? ' · أثر رجعي' : '')), v.note ? h('small.t-muted', {}, v.note) : null, v.rejectionReason ? h('small.t-muted', {}, 'سبب الرفض/الإعادة: ' + v.rejectionReason) : null,
            prev ? h('details', {}, h('summary.t-muted', {}, 'الفروقات عن v' + prev.no), SA.diffTable({ القيمة: prev.value, 'تاريخ السريان': prev.effectiveFrom || '—' }, { القيمة: v.value, 'تاريخ السريان': v.effectiveFrom || '—' })) : null,
            v.status === 'pending' && v.approvalId ? h('div', { style: { marginBlockStart: '6px' } }, SA.btn({ label: 'عرض سلسلة الاعتماد والقرار', kind: 'ghost', size: 'sm', icon: 'checkcircle', onClick: async () => { const ap = st.find('approvals', v.approvalId); if (ap) { await K.decisionDialog(ap, s.name); draw(); } } })) : null)); })) : SA.empty({ icon: 'shield', title: 'لا إصدارات', text: 'الإعداد {Open} — اقترح أول إصدار.' }),
        pend ? SA.alert('info', 'يوجد إصدار بانتظار الاعتماد (v' + pend.no + ') — لا يمكن اقتراح إصدار آخر قبل حسمه.') : null);
      const foot = dr && dr.foot; if (foot) { SA.clear(foot); foot.append(h('button.btn.btn-ghost', { type: 'button', onclick: () => dr.close() }, 'إغلاق'), SA.btn({ label: 'اقتراح إصدار جديد', icon: 'plus', kind: 'primary', perm: 'hr.compliance.edit', reason: pend ? 'يوجد إصدار بانتظار الاعتماد.' : '', onClick: async () => { await proposeVersion(s); draw(); } })); }
    };
    dr = SA.drawer({ title: s0.name, subtitle: s0.key, size: 'lg', body, foot: [h('span')] }); draw();
    const off = st.subscribe('hrLegal', draw); dr.closed.then(off);
  }

  function holidayEdit(year, it) {
    if (!SA.can('hr.compliance.edit')) { SA.toast('ليست من صلاحياتك (hr.compliance.edit)', 'warn'); return; }
    const f1 = SA.form.field({ name: 'a', label: 'من تاريخ', type: 'date', required: true, value: it.dateFrom || '' }); const f2 = SA.form.field({ name: 'b', label: 'إلى تاريخ', type: 'date', required: true, value: it.dateTo || '' });
    const m = SA.modal({ title: 'إدخال تاريخ: ' + it.name, subtitle: it.ref, icon: 'edit', size: 'sm', body: h('div.sap-confirm', {}, SA.alert('info', 'المرجع الصحفي (' + it.press + ') للاسترشاد فقط ولا يُعتمد منه شيء — HR يُدخل التاريخ من الإعلان الرسمي.'), f1.el, f2.el), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'حفظ التاريخ', kind: 'primary', onClick: () => {
      if (!(f1.validate() & f2.validate())) return; if (f2.get() < f1.get()) { f2.error('تاريخ النهاية قبل البداية.'); return; }
      st.update('hrHolidays', (o) => { const x = o[year].find((y) => y.code === it.code); x.dateFrom = f1.get(); x.dateTo = f2.get(); x.status = 'entered'; x.enteredBy = K.me().id; x.approvedBy = null; });
      SA.audit('HR.HOLIDAY.CHANGED', { target: { type: 'holiday', id: it.code, label: it.name }, after: { from: f1.get(), to: f2.get(), status: 'entered' } }); m.close(); SA.toast('تم حفظ التاريخ — بانتظار الاعتماد.', 'success'); } })] });
  }

  function obligationDrawer(id) {
    const body = h('div'); let dr;
    const status = (o) => K.obStatus(o);
    const draw = () => {
      const o = st.find('hrObligations', id) || (get('hrObligations').find((x) => x.id === id)); SA.clear(body);
      const stt = status(o);
      body.append(SA.kv([['الالتزام', h('b', {}, o.title)], ['المرجع القانوني', o.ref + ' [' + K.legalConf[o.conf] + ']'], ['الدورة', o.freq], ['الموعد', o.dueDate ? SA.fmt.date(o.dueDate) + ' (' + (K.daysFrom(o.dueDate) < 0 ? 'متأخر ' + Math.abs(K.daysFrom(o.dueDate)) + ' يوم' : 'بعد ' + K.daysFrom(o.dueDate) + ' يوم') + ')' : o.dueRule], ['قاعدة الموعد', o.dueRule], ['المسؤول', o.ownerRole + ' — ' + SA.userName(o.ownerUserId)], ['حرج؟', o.critical ? SA.chip('حرج — يحتاج مراجعًا ثانيًا', 'danger') : 'لا'], ['الحالة', K.obChip(stt)]]),
        o.evidence.length ? h('div', {}, h('h4', {}, 'الدليل'), h('ul', {}, o.evidence.map((e) => h('li', {}, SA.icon('file', 'icon-sm'), ' ', e.name, h('small.t-muted', {}, ' — ' + SA.userName(e.by) + ' · ' + SA.fmt.rel(e.at)))))) : SA.alert('info', 'لا دليل مرفق بعد — لا يُغلق الالتزام «تم» بدون دليل (BR-CMP-14).'),
        o.waivedReason ? SA.alert('warning', 'معفى: ', o.waivedReason) : null, o.status === 'review' ? SA.alert('info', 'أغلقه ', h('b', {}, SA.userName(o.doneBy)), ' بانتظار مراجع ثانٍ مختلف عنه (التزام حرج).') : null,
        h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'لا ادعاء تكامل مع الجهات الحكومية: النظام يجهّز البيانات ويسجّل الإنجاز يدوياً (BR-CMP-15).')));
      const foot = dr.foot; SA.clear(foot); const done = o.status === 'done' || o.status === 'waived';
      foot.append(h('button.btn.btn-ghost', { type: 'button', onclick: () => dr.close() }, 'إغلاق'),
        SA.btn({ label: 'إعفاء بسبب', kind: 'ghost', perm: 'hr.compliance.edit', reason: done ? 'الالتزام مُغلق.' : '', onClick: () => waiveOb(o) }),
        o.status === 'review' ? SA.btn({ label: 'مراجعة وإغلاق (مراجع ثانٍ)', kind: 'primary', icon: 'check', perm: 'hr.compliance.edit', reason: o.doneBy === K.me().id ? 'فصل مهام: المراجع الثاني غير من أغلقه.' : '', onClick: () => reviewOb(o) }) : SA.btn({ label: 'إغلاق بدليل', kind: 'primary', icon: 'check', perm: 'hr.compliance.edit', reason: done ? 'الالتزام مُغلق.' : '', onClick: () => closeOb(o) }));
    };
    dr = SA.drawer({ title: id, subtitle: 'درج الالتزام: مسؤول · تذكيرات · دليل · إغلاق', size: 'md', body, foot: [h('span')] }); draw();
    const off = st.subscribe('hrObligations', draw); dr.closed.then(off);
  }
  K.obStatus = function (o) { if (o.status === 'done' || o.status === 'waived' || o.status === 'review') return o.status; if (!o.dueDate) return 'event'; const d = K.daysFrom(o.dueDate); return d < 0 ? 'overdue' : d <= 7 ? 'due_soon' : 'upcoming'; };
  K.obChip = (s) => { const m = { done: ['تم', 'success'], waived: ['معفى', 'neutral'], review: ['بانتظار المراجع', 'info'], event: ['حدثي — عند الحدث', 'neutral'], overdue: ['متأخر', 'danger'], due_soon: ['يستحق قريبًا', 'warning'], upcoming: ['قادم', 'info'] }[s]; return SA.chip(m[0], m[1]); };
  function closeOb(o) {
    const ev = SA.form.field({ name: 'e', label: 'اسم ملف الدليل (محاكاة رفع)', required: true, placeholder: 'مثال: إيصال-السداد-2026-11.pdf' }); const nt = SA.form.field({ name: 'n', label: 'ملاحظة', type: 'textarea', rows: 2 });
    const m = SA.modal({ title: 'إغلاق التزام بدليل', subtitle: o.id, icon: 'checkcircle', size: 'sm', body: h('div.sap-confirm', {}, o.critical ? SA.alert('warning', 'التزام حرج: بعد إرفاق الدليل يحتاج مراجعًا ثانيًا مختلفًا عنك.') : null, ev.el, nt.el), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'إغلاق', kind: 'primary', onClick: () => {
      if (!ev.validate()) return; st.update('hrObligations', (l) => { const x = l.find((y) => y.id === o.id); x.evidence.push({ name: ev.get(), at: new Date().toISOString(), by: K.me().id }); x.doneBy = K.me().id; x.status = o.critical ? 'review' : 'done'; });
      if (!o.critical) SA.audit('HR.OBLIGATION.DONE', { target: { type: 'obligation', id: o.id, label: o.title }, after: { status: 'done', evidence: ev.get() }, reason: nt.get() });
      m.close(); SA.toast(o.critical ? 'تم الإرفاق — بانتظار مراجع ثانٍ.' : 'تم إغلاق الالتزام.', 'success'); } })] });
  }
  function reviewOb(o) {
    if (o.doneBy === K.me().id) { K.sodBlock('SOD-NEW', 'مراجعة التزام حرج بنفس من أغلقه', 'فصل مهام: المراجع الثاني غير من أغلق الالتزام.'); return; }
    st.update('hrObligations', (l) => { const x = l.find((y) => y.id === o.id); x.checkedBy = K.me().id; x.status = 'done'; });
    SA.audit('HR.OBLIGATION.DONE', { target: { type: 'obligation', id: o.id, label: o.title }, after: { status: 'done', doneBy: o.doneBy, checkedBy: K.me().id } }); SA.toast('تمت المراجعة وإغلاق الالتزام.', 'success');
  }
  async function waiveOb(o) {
    const r = await SA.confirm({ title: 'إعفاء التزام: ' + o.id, confirmLabel: 'إعفاء', reasonRequired: true, reasonLabel: 'سبب الإعفاء (موثّق)', impact: ['يُغلق الالتزام دون دليل بصفة «معفى».', 'يُسجَّل باسمك وسببك — الإعفاء من HR Manager فقط.'] }); if (!r.ok) return;
    st.update('hrObligations', (l) => { const x = l.find((y) => y.id === o.id); x.status = 'waived'; x.waivedReason = r.reason; });
    SA.audit('HR.OBLIGATION.WAIVED', { target: { type: 'obligation', id: o.id, label: o.title }, reason: r.reason }); SA.toast('تم الإعفاء.', 'success');
  }

  function gauge(pct, target, label) {
    const R = 54, Cc = Math.PI * R, val = Math.max(0, Math.min(1, pct / 100)); const tx = 70 - Math.cos(Math.PI * (target / 100)) * R, ty = 70 - Math.sin(Math.PI * (target / 100)) * R;
    const ok = pct >= target;
    return h('div.sap-hrc-gauge', {}, h('svg', { viewBox: '0 0 140 84', width: '220', role: 'img', 'aria-label': label }, h('path', { d: 'M16 70 A54 54 0 0 1 124 70', fill: 'none', stroke: 'var(--color-border)', 'stroke-width': '12', 'stroke-linecap': 'round' }), h('path', { d: 'M16 70 A54 54 0 0 1 124 70', fill: 'none', stroke: ok ? 'var(--color-success)' : 'var(--color-warning)', 'stroke-width': '12', 'stroke-linecap': 'round', 'stroke-dasharray': (Cc * val).toFixed(1) + ' ' + Cc.toFixed(1) }), h('circle', { cx: tx.toFixed(1), cy: ty.toFixed(1), r: '4', fill: 'var(--eg-navy)' })), h('b.num', { style: { fontSize: '26px' } }, pct.toFixed(1) + '%'), h('small.t-muted', {}, label));
  }

  function render(root, ctx) {
    K.crumbs(ctx, 'hr-set', 'الامتثال والإعدادات القانونية');
    return K.screen(root, ctx, {
      perm: 'hr.compliance.view', route: 'hr/compliance', def: 'overview', title: 'الامتثال', paths: ['hrLegal', 'hrObligations', 'hrHolidays', 'hrLawChanges', 'employees', 'approvals', 'hrPlan'],
      tabs: () => { const od = get('hrObligations').filter((o) => ['overdue', 'due_soon'].indexOf(K.obStatus(o)) >= 0).length; return [{ id: 'overview', label: 'نظرة عامة وبوابات الجاهزية', icon: 'gauge' }, { id: 'registry', label: 'سجل الإعدادات', icon: 'list', badge: get('hrLegal').length }, { id: 'rules', label: 'جداول القواعد', icon: 'layers' }, { id: 'holidays', label: 'العطلات الرسمية', icon: 'clock' }, { id: 'calendar', label: 'تقويم الالتزامات', icon: 'clock', badge: od || null }, { id: 'thresholds', label: 'العتبات وحصة الإعاقة', icon: 'users' }, { id: 'changes', label: 'تغيّرات القانون', icon: 'activity' }]; },
      head: () => SA.pageHead({ title: 'الامتثال والإعدادات القانونية', desc: 'كل رقم قانوني بيانات بتاريخ سريان وحالة اعتماد — لا ثوابت في الكود. كل القيم Pending Confirmation حتى يعتمدها HR والمحاسب القانوني.', tags: [SA.tag('pending', 'Law · Pending'), SA.tag('open', 'Open')], actions: [K.spec('hr-platform.html', 'scr-cmp-01', 'التصميم الكامل ↗')] }),
      panel(tab) { return ({ overview: overviewPanel, registry: registryPanel, rules: rulesPanel, holidays: holidaysPanel, calendar: calendarPanel, thresholds: thresholdsPanel, changes: changesPanel }[tab] || overviewPanel)(); }
    });
  }
  function overviewPanel() {
    const L = get('hrLegal'); const ap = L.filter((s) => K.legalStatus(s) === 'approved').length, pe = L.filter((s) => K.legalStatus(s) === 'pending').length, op = L.filter((s) => K.legalStatus(s) === 'open').length, lr = L.filter((s) => s.legalReview && K.legalStatus(s) !== 'approved').length;
    const obs = get('hrObligations'); const overdue = obs.filter((o) => K.obStatus(o) === 'overdue').length; const lc = get('hrLawChanges').filter((x) => x.status !== 'closed').length;
    return h('div.sap-hrc', {},
      SA.alert('warning', h('b', {}, 'بوابة الجاهزية: '), 'لا قفل ولا اعتماد ولا صرف مرتبات على إعدادات Pending — يُسمح بمسودة تجريبية موسومة فقط (BR-CMP-11).'),
      h('div.sap-grid-cards', {}, SA.kpi('إعدادات معتمدة', ap + ' / ' + L.length, { sub: 'من سجل الإعدادات' }), SA.kpi('Pending Confirmation', pe, { href: SA.href('hr/compliance?tab=registry') }), SA.kpi('غير مُعدّ {Open}', op), SA.kpi('تتطلب مراجعة قانونية', lr), SA.kpi('التزامات متأخرة', overdue, { href: SA.href('hr/compliance?tab=calendar'), accent: overdue > 0 }), SA.kpi('تغيّرات قانون مفتوحة', lc)),
      SA.card({ title: 'بوابات الجاهزية (Readiness gates)', tags: SA.tag('new') }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الفيتشر', 'الاسم', 'الإعدادات المعتمدة', 'الإعدادات الناقصة', 'المنع', 'الحالة'].map((x) => h('th', {}, x)))), h('tbody', {}, K.GATES.map((g) => { const r = K.gate(g.id); return h('tr', {}, h('td', {}, h('b', {}, g.id)), h('td', {}, g.name), h('td', {}, h('span.num', {}, (r.total - r.missing.length) + ' / ' + r.total)), h('td', {}, r.missing.length ? h('div', {}, r.missing.slice(0, 4).map((k) => h('code', { style: { marginInlineEnd: '4px', cursor: 'pointer' }, onclick: () => settingDrawer(k) }, k)), r.missing.length > 4 ? ' +' + (r.missing.length - 4) : '') : SA.chip('—', 'neutral')), h('td', {}, g.block), h('td', {}, r.ready ? SA.chip('جاهزة', 'success') : SA.chip('محجوبة — مسودة تجريبية فقط', 'danger'))); }))))));
  }
  function registryPanel() {
    return SA.card({ flush: true }, K.table({ caption: 'سجل الإعدادات القانونية', rows: () => get('hrLegal'), rowId: 'key', pageSize: 10, search: { placeholder: 'ابحث بالاسم أو المفتاح…', keys: ['name', 'key'] },
      filters: [{ key: 'group', label: 'المجموعة', options: Object.keys(K.legalGroups).map((g) => [g, K.legalGroups[g]]) }, { key: 'st', label: 'الحالة', options: [['approved', 'معتمد'], ['pending', 'Pending'], ['open', 'غير مُعدّ']], test: (r, v) => K.legalStatus(r) === v }, { key: 'lr', label: 'مراجعة قانونية', options: [['1', 'مطلوبة']], test: (r) => r.legalReview }],
      columns: [{ key: 'key', label: 'المفتاح', render: (r) => h('code', {}, r.key) }, { key: 'name', label: 'الإعداد', sort: true, render: (r) => h('div', {}, h('b', {}, r.name), r.legalReview ? h('small.t-muted', {}, ' · تتطلب مراجعة قانونية') : null) }, { key: 'value', label: 'القيمة (لقطة مرجعية)', render: (r) => { const v = K.refVersion(r); return v ? v.value : SA.openValue('غير مُعدّ'); } }, { key: 'eff', label: 'يسري من', render: (r) => { const v = K.refVersion(r); return v && v.effectiveFrom ? SA.fmt.date(v.effectiveFrom) : '—'; } }, { key: 'conf', label: 'الثقة', render: (r) => r.conf + ' · ' + K.legalConf[r.conf] }, { key: 'status', label: 'الحالة', render: (r) => K.legalStatusChip(r), sort: true, value: (r) => K.legalStatus(r) }],
      onRowClick: (r) => settingDrawer(r.key), rowActions: (r) => [{ label: 'فتح التفاصيل والسجل', icon: 'history', onClick: () => settingDrawer(r.key) }, { label: 'اقتراح إصدار', icon: 'edit', disabled: SA.can('hr.compliance.edit') ? false : 'ليست من صلاحياتك', onClick: () => proposeVersion(r) }],
      empty: { icon: 'shield', title: 'لا توجد إعدادات' } }).el);
  }
  function taxTable(tv) {
    const num = (v, last) => (v == null ? (last ? 'مفتوحة' : SA.openValue('غير مُدخل')) : h('span.num', {}, SA.fmt.num(v)));
    const trs = tv.rows.map((r, i) => h('tr', {}, h('td.num', {}, i + 1), h('td', {}, num(r.from)), h('td', {}, num(r.to, i === tv.rows.length - 1)), h('td', {}, h('span.num', {}, r.rate + '%'))));
    const thead = h('thead', {}, h('tr', {}, ['#', 'من (ج.م/سنة)', 'إلى', 'النسبة'].map((x) => h('th', {}, x))));
    return h('div.table-wrap', {}, h('table.table', {}, thead, h('tbody', {}, trs)));
  }
  function rulesPanel() {
    const tax = K.setting('tax.brackets'); const tv = K.refVersion(tax); const errs = tv && tv.rows ? K.validateBrackets(tv.rows) : [];
    const leaveS = K.setting('annual_leave_table'), insE = K.setting('ins.employee_rates'), insR = K.setting('ins.employer_rates');
    return h('div.sap-hrc', {}, SA.alert('info', 'جداول الشرائح تُتحقق قبل الاعتماد: متصلة، بلا تداخل، آخر شريحة مفتوحة، والنسب 0–100 (BR-CMP-09). تعديل أي جدول = إصدار جديد بتاريخ سريان.'),
      SA.card({ title: 'ضريبة كسب العمل — الشرائح السنوية', tags: [K.legalStatusChip(tax), SA.tag('pending', 'R-Secondary')], actions: [SA.btn({ label: 'فتح السجل والإصدارات', kind: 'ghost', size: 'sm', onClick: () => settingDrawer('tax.brackets') })] },
        tv && tv.rows ? taxTable(tv) : SA.empty({ icon: 'layers', title: 'لا جدول' }),
        errs.length ? SA.alert('danger', h('b', {}, 'لا يمكن اعتماد هذا الجدول: '), errs.slice(0, 3).join(' · ') + (errs.length > 3 ? ' …' : '')) : SA.alert('success', 'الجدول صالح.')),
      h('div.sap-grid-2', {}, SA.card({ title: 'الإجازة السنوية', tags: K.legalStatusChip(leaveS) }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الشريحة'), h('th', {}, 'الشرط'))), h('tbody', {}, [['15 يوماً', 'الأساس (أقل من 10 سنوات خدمة)'], ['21 يوماً', 'بعد سنة خدمة — شرط مرجعي'], ['30 يوماً', '10 سنوات خدمة أو سن 50 (م 124)'], ['45 يوماً', 'ذوو الإعاقة/حالات خاصة — للتأكيد']].map((r) => h('tr', {}, h('td', {}, h('b', {}, r[0])), h('td', {}, r[1])))))), h('p.t-muted', {}, 'قيم مرجعية [Law · Pending] — الشرائح تُحسم بمراجعة قانونية.')),
        SA.card({ title: 'نسب التأمينات', tags: [K.legalStatusChip(insE)] }, SA.kv([['العامل', K.refVersion(insE) ? K.refVersion(insE).value : '—'], ['صاحب العمل', K.refVersion(insR) ? K.refVersion(insR).value : '—'], ['حدّا الأجر التأميني', (K.refVersion(K.setting('ins.wage_band')) || {}).value || '—']]), h('p.t-muted', {}, 'حدّا 2027 غير معلنين — إدخال بإصدار مستقل بتاريخ 2027-01-01 (BR-CMP-10).'))));
  }
  function holidaysPanel() {
    const H = st.get('hrHolidays') || {}; const items = H[2026] || [];
    return h('div.sap-hrc', {}, SA.alert('warning', 'التواريخ «غير معتمدة — HR يُدخل». العمود الصحفي للاسترشاد فقط، ولا يُعتمد تاريخ من مصدر صحفي. 2027 غير مُعدّ (BR-CMP-12).'),
      SA.card({ title: 'العطلات الرسمية 2026', flush: true, tags: SA.tag('pending', 'قرار 294/2025 [R-Secondary]') }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['المناسبة', 'المرجع', 'مرجع صحفي (غير معتمد)', 'التاريخ المُدخل', 'الحالة', ''].map((x) => h('th', {}, x)))), h('tbody', {}, items.map((it) => h('tr', {}, h('td', {}, h('b', {}, it.name)), h('td', {}, it.ref), h('td.t-muted', {}, it.press), h('td', {}, it.dateFrom ? h('span.num', {}, it.dateFrom + (it.dateTo !== it.dateFrom ? ' → ' + it.dateTo : '')) : SA.openValue('HR يُدخل')), h('td', {}, SA.chip(it.status === 'approved' ? 'معتمد' : it.status === 'entered' ? 'مُدخل — بانتظار الاعتماد' : 'غير معتمد', it.status === 'approved' ? 'success' : it.status === 'entered' ? 'info' : 'warning')), h('td', {}, h('div.cluster', {}, SA.btn({ label: it.dateFrom ? 'تعديل' : 'إدخال', kind: 'ghost', size: 'sm', perm: 'hr.compliance.edit', onClick: () => holidayEdit(2026, it) }), it.status === 'entered' ? SA.btn({ label: 'اعتماد', kind: 'primary', size: 'sm', perm: 'hr.compliance.edit', reason: it.enteredBy === K.me().id ? 'فصل مهام: المعتمِد غير من أدخل التاريخ.' : '', onClick: () => { st.update('hrHolidays', (o) => { const x = o[2026].find((y) => y.code === it.code); x.status = 'approved'; x.approvedBy = K.me().id; }); SA.audit('HR.HOLIDAY.CHANGED', { target: { type: 'holiday', id: it.code, label: it.name }, after: { status: 'approved', from: it.dateFrom, to: it.dateTo } }); SA.toast('تم اعتماد ' + it.name, 'success'); } }) : null)))))))),
      SA.card({ title: 'العطلات الرسمية 2027' }, SA.empty({ icon: 'clock', title: 'غير مُعدّ', text: 'تُدخل بعد الإعلان الرسمي — التزام OB-17 يذكّر HR Manager بالتأكيد.' })));
  }
  function calendarPanel() {
    const obs = get('hrObligations');
    const t = K.table({ caption: 'تقويم الالتزامات', rows: () => get('hrObligations').slice().sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9')), pageSize: 12, search: { placeholder: 'ابحث في الالتزامات…', keys: ['title', 'id', 'ownerRole'] },
      filters: [{ key: 'st', label: 'الحالة', options: [['overdue', 'متأخر'], ['due_soon', 'يستحق قريبًا'], ['upcoming', 'قادم'], ['event', 'حدثي'], ['review', 'بانتظار المراجع'], ['done', 'تم'], ['waived', 'معفى']], test: (r, v) => K.obStatus(r) === v }, { key: 'crit', label: 'الأهمية', options: [['1', 'حرجة فقط']], test: (r) => r.critical }],
      columns: [{ key: 'id', label: 'الكود', render: (r) => h('b', {}, r.id) }, { key: 'title', label: 'الالتزام', render: (r) => h('div', {}, h('b', {}, r.title), h('small.t-muted', {}, r.ref)) }, { key: 'due', label: 'الموعد', sort: true, value: (r) => r.dueDate || '9', render: (r) => (r.dueDate ? h('span', {}, SA.fmt.date(r.dueDate)) : h('span.t-muted', {}, r.dueRule)) }, { key: 'own', label: 'المسؤول', render: (r) => SA.userName(r.ownerUserId) }, { key: 'crit', label: 'حرج', render: (r) => (r.critical ? SA.chip('حرج', 'danger') : '—') }, { key: 'st', label: 'الحالة', render: (r) => K.obChip(K.obStatus(r)) }],
      onRowClick: (r) => obligationDrawer(r.id), empty: { icon: 'clock', title: 'لا التزامات' } });
    return h('div.sap-hrc', {}, h('div.sap-statrow', {}, h('span', {}, h('b.num', {}, obs.filter((o) => K.obStatus(o) === 'overdue').length), 'متأخرة'), h('span', {}, h('b.num', {}, obs.filter((o) => K.obStatus(o) === 'due_soon').length), 'تستحق خلال 7 أيام'), h('span', {}, h('b.num', {}, obs.filter((o) => K.obStatus(o) === 'done').length), 'مُغلقة بدليل')), SA.card({ flush: true }, t.el), SA.alert('info', 'لا إغلاق «تم» بدون دليل (إلا بإعفاء موثّق)، والالتزامات الحرجة تحتاج مراجعًا ثانيًا (BR-CMP-14).'));
  }
  function thresholdsPanel() {
    const hc = K.headcount(); const THR = ['thr.work_regulation', 'thr.social_fund', 'thr.disability_quota', 'thr.training_fund', 'thr.osh_stats', 'thr.nurse_doctor', 'thr.childcare_leave', 'thr.nursery_women'];
    const plan = st.get('hrPlan') || {}; const dc = plan.disabledCount; const quotaPct = K.legal('disability_quota').n; const thrN = K.legal('thr.disability_quota').n;
    const applicable = thrN != null && hc >= thrN; const needed = quotaPct != null && applicable ? Math.ceil(hc * quotaPct / 100) : null; const pct = dc != null && hc ? dc / hc * 100 : null;
    return h('div.sap-hrc', {}, h('div.sap-grid-2', {},
      SA.card({ title: 'حصة ذوي الإعاقة', tags: [SA.tag('pending', 'قانون 10/2018 [R]')], actions: [SA.btn({ label: 'تسجيل العدد', kind: 'ghost', size: 'sm', perm: 'hr.compliance.edit', onClick: () => setDisabled() })] },
        pct == null ? SA.empty({ icon: 'gauge', title: 'غير قابل للحساب', text: 'عدد العاملين من ذوي الإعاقة غير مسجّل في الملفات — سجّله يدويًا ليحسب النموذج النسبة (يظهر كذلك في مؤشر W-33).' }) : gauge(pct, quotaPct || 5, dc + ' من ' + hc + ' عامل'),
        SA.kv([['إجمالي العاملين (دائمون)', h('span.num', {}, hc), ], ['عتبة الانطباق', thrN != null ? thrN + ' عاملاً' : SA.openValue()], ['الحصة المطلوبة', quotaPct != null ? quotaPct + '%' : SA.openValue()], ['المقاعد المطلوبة', needed != null ? h('span', {}, needed, ' ', SA.demoValue('تقريب لأعلى — القاعدة Open')) : applicable === false ? 'لا تنطبق (أقل من العتبة)' : '—']]),
        h('p.t-muted', {}, 'المقاولون واليومية مستثنون افتراضيًا من العدّ (BR-CMP-13 — قرار Open).')),
      SA.card({ title: 'التزامات صاحب العمل حسب العدد', tags: SA.tag('pending', 'Law · Pending') }, h('p.t-muted', {}, 'العدد الحالي: ', h('b.num', {}, hc), ' عامل دائم'), h('ul.sap-hrc-chk', {}, THR.map((k) => { const l = K.legal(k); const on = l.n != null && hc >= l.n; return h('li', {}, h('span.t', {}, h('b', {}, K.setting(k).name), h('small', {}, l.text || '—')), h('span', {}, on ? SA.chip('منطبق', 'warning') : SA.chip('غير منطبق', 'neutral'))); })))),
      SA.card({ title: 'لائحة تنظيم العمل', tags: [SA.tag('open', 'قرار D10')] }, h('div.sap-statrow', {}, h('span', {}, 'الحالة: ', SA.openValue('غير مُعدّة')), h('span', {}, 'المهلة: 60 يوماً من بلوغ العتبة (م 137) [Law · Pending]')), SA.stepper(['صياغة', 'رأي النقابة', 'اعتماد الجهة', 'إعلان', 'إقرارات العاملين'], 0), h('p.t-muted', {}, 'مرتبطة بالتزام OB-19 (أسبوعي حتى الإغلاق) وببوابة الجزاءات HR-20.')));
  }
  async function setDisabled() {
    const plan = st.get('hrPlan') || {}; const f = SA.form.field({ name: 'n', label: 'عدد العاملين من ذوي الإعاقة المسجّلين', type: 'number', min: 0, required: true, value: plan.disabledCount == null ? '' : plan.disabledCount, hint: 'يُسجَّل بإثبات الإعاقة (HD-15 — T4) خارج هذا العدّ.' });
    const m = SA.modal({ title: 'تسجيل عدد ذوي الإعاقة', icon: 'users', size: 'sm', body: h('div.sap-confirm', {}, f.el), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'حفظ', kind: 'primary', onClick: () => { if (!f.validate()) return; const n = f.get(); if (n < 0 || n > K.headcount()) { f.error('العدد خارج المنطقي (0 – ' + K.headcount() + ').'); return; } st.update('hrPlan', (p) => { p.disabledCount = n; }); SA.audit('SETTINGS.CHANGED', { target: { type: 'compliance', id: 'disabled_headcount', label: 'عدد ذوي الإعاقة' }, after: { count: n }, area: 'hr' }); m.close(); SA.toast('تم تسجيل العدد.', 'success'); } })] });
  }
  function changesPanel() {
    const ST = { awaiting: ['انتظار المصدر', 'warning'], legal: ['مراجعة قانونية', 'info'], source: ['يحتاج مصدرًا/النص', 'warning'], closed: ['مُغلق', 'success'] };
    return SA.card({ title: 'سجل «إيه اللي اتغيّر في القانون»', tags: SA.tag('pending', 'أمثلة DEMO من بنود غير متحقق منها'), flush: true }, K.table({ caption: 'تغيّرات القانون', rows: () => get('hrLawChanges'), pageSize: 8,
      columns: [{ key: 'id', label: 'الكود', render: (r) => h('b', {}, r.id) }, { key: 'title', label: 'العنوان', render: (r) => h('div', {}, h('b', {}, r.title), h('small.t-muted', {}, r.source)) }, { key: 'st', label: 'الحالة', render: (r) => SA.chip(ST[r.status][0], ST[r.status][1]) }, { key: 's', label: 'الإعدادات المتأثرة', render: (r) => h('div', {}, r.settings.map((k) => h('code', { style: { marginInlineEnd: '4px', cursor: 'pointer' }, onclick: (e) => { e.stopPropagation(); settingDrawer(k); } }, k))) }, { key: 'f', label: 'الفيتشرز', render: (r) => r.features.join('، ') }],
      onRowClick: (r) => lawDrawer(r.id), empty: { icon: 'activity', title: 'لا تغيّرات' } }).el);
  }
  function lawDrawer(id) {
    const x = get('hrLawChanges').find((y) => y.id === id); const sel = SA.form.field({ name: 's', label: 'تحديث الحالة', type: 'select', value: x.status, options: [['awaiting', 'انتظار المصدر'], ['source', 'يحتاج مصدرًا/النص'], ['legal', 'مراجعة قانونية'], ['closed', 'إغلاق']] }); const why = SA.form.field({ name: 'w', label: 'سبب الإغلاق (لا أثر / مرتبط بإصدارات)', type: 'textarea', rows: 2, value: x.closedReason });
    const m = SA.drawer({ title: x.id, subtitle: x.title, size: 'md', body: h('div', {}, SA.alert('warning', 'مصدر: ' + x.source + ' — لا يُطبَّق أثره قبل التحقق.'), SA.kv([['الفيتشرز المتأثرة', x.features.join('، ')], ['الإعدادات المتأثرة', x.settings.map((k) => h('code', {}, k + ' '))]]), h('div', { style: { marginBlockStart: '12px' } }, sel.el, why.el)),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إغلاق'), SA.btn({ label: 'حفظ', kind: 'primary', perm: 'hr.compliance.edit', onClick: () => { if (sel.get() === 'closed' && (why.get() || '').trim().length < 3) { why.error('اكتب سبب الإغلاق (لا أثر أو مرجع الإصدارات).'); return; } st.update('hrLawChanges', (l) => { const y = l.find((z) => z.id === id); y.status = sel.get(); y.closedReason = why.get(); }); SA.audit('SETTINGS.CHANGED', { target: { type: 'law_change', id, label: x.title }, after: { status: sel.get() }, reason: why.get(), area: 'hr' }); m.close(); SA.toast('تم الحفظ.', 'success'); } })] });
  }
  SA.register(Object.assign({}, K.NAV('hr-compliance'), { app: 'hr', render, stub: false, badge: () => { try { const n = get('hrObligations').filter((o) => K.obStatus(o) === 'overdue').length; return n || null; } catch (e) { return null; } } }));
})();
/* ───────────────────────── part 2 — HR-01 الخطة والوظائف والهيكل ───────────────────────── */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store, K = SA.hrCore, get = K.get;
  const dept = (id) => SA.deptName(id);
  const planLocked = () => (st.get('hrPlan') || {}).status === 'locked';
  const hrDepts = () => get('departments').filter((d) => d.active);

  /* ───── position create / edit ───── */
  async function positionForm(pos) {
    const isNew = !pos; const p = pos || { id: null, title: '', departmentId: 'D-09', headcount: 1, safetyCritical: false, operational: false, reportsTo: null, status: 'active', jd: '', jdVersion: 0, salaryBand: { min: null, max: null, demo: true } };
    const locked = planLocked();
    const title = SA.form.field({ name: 'title', label: 'المسمى الوظيفي', required: true, value: p.title, rules: [SA.form.rules.min(3)] });
    const d = SA.form.field({ name: 'dep', label: 'القسم', type: 'select', required: true, value: p.departmentId, options: hrDepts().map((x) => [x.id, x.name]) });
    const hc = SA.form.field({ name: 'hc', label: 'العدد المعتمد في الخطة', type: 'number', min: 0, required: true, value: p.headcount, disabled: locked && !isNew, hint: locked && !isNew ? 'الخطة مقفلة — تغيير العدد عبر Amendment (BR-PLN-01).' : (locked ? 'الخطة مقفلة: وظيفة جديدة تبدأ بعدد 0 وتُضاف للخطة بـAmendment.' : '') });
    const rep = SA.form.field({ name: 'rep', label: 'تتبع (reports_to)', type: 'select', value: p.reportsTo || '', options: [['', 'لا أحد (قمة الهيكل)']].concat(get('positions').filter((x) => x.id !== p.id && x.status !== 'closed').map((x) => [x.id, x.title])) });
    const safe = SA.form.field({ name: 'safe', label: 'وظيفة حرجة للسلامة', type: 'switch', value: p.safetyCritical, hint: 'تفرض شهادات إلزامية وكشفًا طبيًا مفصّلًا وتوعية سلامة قبل إسناد ماكينة (BR-PLN-04).' });
    const op = SA.form.field({ name: 'op', label: 'وظيفة تشغيل — اختبار عملي ناجح شرط للعرض', type: 'switch', value: p.operational, hint: 'تُفعّل بوابة الاختبار العملي في مسار المرشحين (BR-ATS-07).' });
    const jd = SA.form.field({ name: 'jd', label: 'الوصف الوظيفي (JD)', type: 'textarea', rows: 3, value: p.jd, hint: 'أي تعديل ينشئ إصدارًا جديدًا ويُطلب من الشاغلين إقرار الاطلاع (BR-PLN-07).' });
    const canS = K.canSal(); const bmin = SA.form.field({ name: 'bmin', label: 'الحد الأدنى لشريحة الأجر (ج.م) — T3', type: 'number', min: 0, value: p.salaryBand && p.salaryBand.min != null ? p.salaryBand.min : '' }); const bmax = SA.form.field({ name: 'bmax', label: 'الحد الأقصى لشريحة الأجر (ج.م) — T3', type: 'number', min: 0, value: p.salaryBand && p.salaryBand.max != null ? p.salaryBand.max : '' });
    const grp = SA.form.group([title, d, hc, rep, safe, op, jd].concat(canS ? [bmin, bmax] : []));
    return new Promise((resolve) => {
      const m = SA.modal({ title: isNew ? 'وظيفة جديدة' : 'تعديل وظيفة: ' + p.title, subtitle: isNew ? 'تُضاف للهيكل ولخطة القوى العاملة' : 'الإصدار الحالي للوصف: v' + (p.jdVersion || 1), icon: 'userplus', size: 'lg',
        body: h('div.sap-confirm', {}, h('div.sap-formgrid', {}, title.el, d.el, hc.el, rep.el), h('div.sap-formgrid', {}, safe.el, op.el), jd.el, canS ? h('div.sap-formgrid', {}, bmin.el, bmax.el) : K.lockNote('شريحة الأجر وتكلفة الميزانية T3: لا تظهر إلا لحامل hr.salary.view — غيره يراها «سري» (BR-PLN-05).'), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الدرجة الوظيفية: ', SA.openValue('غير مُعدّة'), ' — الأقسام الرئيسية مملوكة لـSuper Admin (SA-08) وHR يضيف تحتها (BR-PLN-12).'))),
        foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(false) }, 'إلغاء'), SA.btn({ label: isNew ? 'إنشاء الوظيفة' : 'حفظ التعديل', kind: 'primary', icon: 'check', onClick: async () => {
          if (!grp.validate()) return; const g = grp.get();
          if (g.rep) { let c = g.rep, n = 0; while (c && n++ < 40) { if (c === p.id) { rep.error('دورة تبعية: المنصب لا يتبع منصبًا تابعًا له (BR-PLN-08).'); return; } const x = st.find('positions', c); c = x ? x.reportsTo : null; } }
          if (!isNew && g.hc < K.filled(p.id)) { hc.error('العدد المعتمد أقل من عدد الشاغلين الحاليين (' + K.filled(p.id) + ') — «تجاوز الخطة».'); return; }
          if (canS && g.bmin != null && g.bmax != null && g.bmin > g.bmax) { bmax.error('الحد الأقصى أقل من الأدنى.'); return; }
          const jdChanged = (g.jd || '') !== (p.jd || ''); const after = { title: g.title, departmentId: g.dep, headcount: isNew && locked ? 0 : (locked ? p.headcount : g.hc), safetyCritical: g.safe, operational: g.op, reportsTo: g.rep || null, jdVersion: jdChanged ? (p.jdVersion || 0) + 1 : p.jdVersion };
          m.setBusy(true);
          try {
            await SA.api(() => {
              if (isNew) { const id = st.nextId('positions', 'P', 2); st.insert('positions', Object.assign({ id, grade: null, filled: 0, status: 'active', jd: g.jd, salaryBand: { min: canS ? g.bmin : null, max: canS ? g.bmax : null, demo: true } }, after, { jdVersion: 1 })); SA.audit('HR.POSITION.CREATED', { target: { type: 'position', id, label: g.title }, after: SA.redact(after) }); }
              else { const before = SA.pick(p, ['title', 'departmentId', 'headcount', 'safetyCritical', 'operational', 'reportsTo', 'jdVersion', 'salaryBand']); st.patch('positions', p.id, Object.assign({}, after, { jd: g.jd, salaryBand: canS ? { min: g.bmin, max: g.bmax, demo: true } : p.salaryBand })); SA.audit('HR.POSITION.UPDATED', { target: { type: 'position', id: p.id, label: g.title }, before: SA.redact(before), after: SA.redact(after) }); if (jdChanged) SA.notify({ title: 'تحديث الوصف الوظيفي: ' + g.title, body: 'إصدار جديد v' + after.jdVersion + ' — يُطلب من الشاغلين إقرار الاطلاع.', level: 'info', to: ['R-11', 'R-12'], link: '#/hr/planning?tab=positions' }); }
            });
          } catch (e) { m.setBusy(false); SA.fail(e); return; }
          m.setBusy(false); m.close(true); SA.toast(isNew ? 'تم إنشاء الوظيفة' : 'تم حفظ التعديل', 'success');
        } })] });
      m.closed.then((r) => resolve(!!r));
    });
  }
  async function freezePosition(p) {
    const frozen = p.status === 'frozen';
    if (!frozen && K.filled(p.id) > 0 && false) return;
    const open = K.openReq(p.id);
    const r = await SA.confirm({ title: (frozen ? 'إلغاء تجميد ' : 'تجميد ') + p.title, confirmLabel: frozen ? 'إلغاء التجميد' : 'تجميد الوظيفة', reasonRequired: !frozen, reasonLabel: 'سبب التجميد', impact: frozen ? ['تعود الوظيفة للظهور في طلبات التوظيف.'] : ['لا تظهر الوظيفة في طلبات التوظيف الجديدة (BR-RQN-01).', open ? 'هتوقف تلقائيًا ' + open + ' مقعد من الطلبات المفتوحة (BR-PLN-06).' : 'لا طلبات مفتوحة عليها.', K.filled(p.id) ? 'الشاغلون الحاليون (' + K.filled(p.id) + ') يستمرون — التجميد ليس إغلاقًا.' : ''].filter(Boolean) });
    if (!r.ok) return;
    try { await SA.api(() => { st.patch('positions', p.id, { status: frozen ? 'active' : 'frozen' }); if (!frozen) st.update('requisitions', (l) => l.forEach((q) => { if (q.positionId === p.id && (q.status === 'open' || q.status === 'approved')) { q.status = 'cancelled'; q.cancelReason = 'تجميد الوظيفة'; } })); SA.audit('HR.POSITION.UPDATED', { target: { type: 'position', id: p.id, label: p.title }, before: { status: p.status }, after: { status: frozen ? 'active' : 'frozen' }, reason: r.reason }); }); SA.toast(frozen ? 'تم إلغاء التجميد' : 'تم تجميد الوظيفة', 'success'); } catch (e) { SA.fail(e); }
  }

  /* ───── plan approve / amend ───── */
  async function approvePlan() {
    const plan = st.get('hrPlan'); const me = K.me();
    if (plan.preparedBy === me.id) { K.sodBlock('SOD-08', 'اعتماد خطة أعدّها المقدّم نفسه', 'فصل مهام: من أعدّ الخطة لا يعتمدها — اطلب من HR Manager آخر أو المالك.'); return; }
    const over = get('positions').filter((p) => K.vacancy(p.id) < 0 && K.filled(p.id) > K.approvedHc(p.id));
    const r = await SA.confirm({ title: 'اعتماد خطة القوى العاملة ' + plan.year + ' وقفلها', confirmLabel: 'اعتماد وقفل', impact: ['بعد القفل لا تعديل مباشر في الأعداد؛ التغيير بإصدار Amendment بسبب وإعادة اعتماد (BR-PLN-01).', 'يبدأ فحص الميزانية في طلبات التوظيف على هذه الأعداد المعتمدة.', 'الإصدار الحالي v' + plan.version + '.'], warnings: over.length ? ['يوجد ' + over.length + ' وظيفة متجاوزة للخطة (' + over.map((p) => p.title).join('، ') + ') — تُقفل كما هي مع تنبيه.'] : [] });
    if (!r.ok) return; if (!(await SA.stepUp('policy.change', { title: 'إعادة التحقق لاعتماد الخطة' }))) return;
    try { await SA.api(() => { st.update('hrPlan', (p) => { p.status = 'locked'; p.approvedBy = me.id; p.lockedAt = new Date().toISOString(); p.history.unshift({ ts: p.lockedAt, text: 'اعتمدها ' + me.name + ' وقُفلت (v' + p.version + ')', by: me.id }); }); SA.audit('HR.PLAN.APPROVED', { target: { type: 'hr_plan', id: 'PLAN-' + plan.year, label: 'خطة القوى العاملة ' + plan.year }, before: { status: plan.status }, after: { status: 'locked', version: plan.version } }); }); SA.notify({ title: 'اعتُمدت خطة القوى العاملة ' + plan.year, body: 'قُفلت v' + plan.version + ' — فحص الميزانية يعتمد عليها.', level: 'info', to: ['R-11', 'R-02', 'R-07'], link: '#/hr/planning' }); SA.toast('تم اعتماد الخطة وقفلها', 'success'); } catch (e) { SA.fail(e); }
  }
  async function amendPlan() {
    const plan = st.get('hrPlan'); const me = K.me();
    const r = await SA.confirm({ title: 'فتح Amendment على الخطة', confirmLabel: 'فتح إصدار جديد', reasonRequired: true, reasonLabel: 'سبب التعديل', impact: ['يُنشأ إصدار v' + (plan.version + 1) + ' بحالة مسودة ويُفتح تعديل الأعداد.', 'لازم يُعاد اعتماده من شخص غير مُعِدّه.'] }); if (!r.ok) return;
    st.update('hrPlan', (p) => { p.version += 1; p.status = 'draft'; p.preparedBy = me.id; p.approvedBy = null; p.history.unshift({ ts: new Date().toISOString(), text: 'Amendment v' + p.version + ' — ' + r.reason, by: me.id }); });
    SA.audit('HR.PLAN.AMENDED', { target: { type: 'hr_plan', id: 'PLAN-' + plan.year, label: 'خطة القوى العاملة ' + plan.year }, before: { version: plan.version, status: 'locked' }, after: { version: plan.version + 1, status: 'draft' }, reason: r.reason }); SA.toast('فُتح Amendment — الخطة الآن مسودة.', 'info');
  }

  /* ───── tabs ───── */
  const posState = (p) => (p.status === 'frozen' ? ['مجمّدة', 'neutral'] : K.vacancy(p.id) < 0 ? ['تجاوز الخطة', 'danger'] : K.vacancy(p.id) === 0 ? ['مكتملة', 'success'] : ['شاغر', 'warning']);
  function planPanel(S) {
    const plan = st.get('hrPlan') || {}; const pos = get('positions').filter((p) => p.status !== 'closed');
    const tot = pos.reduce((a, p) => a + p.headcount, 0), fil = pos.reduce((a, p) => a + K.filled(p.id), 0), res = pos.reduce((a, p) => a + K.reservedOf(p.id), 0), op = pos.reduce((a, p) => a + K.openReq(p.id), 0);
    const byDept = {}; pos.forEach((p) => { const d = byDept[p.departmentId] = byDept[p.departmentId] || { id: p.departmentId, hc: 0, fil: 0, res: 0, open: 0 }; d.hc += p.headcount; d.fil += K.filled(p.id); d.res += K.reservedOf(p.id); d.open += K.openReq(p.id); });
    const rows = Object.values(byDept).map((d) => Object.assign(d, { name: dept(d.id), vac: d.hc - d.fil - d.res }));
    const hc = K.headcount();
    return h('div.sap-hrc', {},
      h('div.sap-grid-cards', {}, SA.kpi('العدد المعتمد', tot, { sub: 'خطة ' + plan.year + ' · v' + plan.version }), SA.kpi('الشاغلون الفعليون', fil), SA.kpi('محجوز بعرض/ما قبل التعيين', res), SA.kpi('الشاغر الصافي', Math.max(0, tot - fil - res), { sub: op + ' مقعد في طلبات نشطة' })),
      SA.card({ title: 'خطة القوى العاملة وميزانية العدد', tags: [SA.chip(plan.status === 'locked' ? 'معتمدة ومقفلة' : 'مسودة', plan.status === 'locked' ? 'success' : 'warning'), SA.tag('new', 'HR-01')], actions: [plan.status === 'locked' ? SA.btn({ label: 'فتح Amendment', icon: 'edit', kind: 'ghost', perm: 'hr.planning.edit', onClick: amendPlan }) : SA.btn({ label: 'اعتماد الخطة وقفلها', icon: 'check', kind: 'primary', perm: 'hr.planning.edit', onClick: approvePlan })] },
        plan.status !== 'locked' ? SA.alert('info', 'الخطة مسودة أعدّتها ', h('b', {}, SA.userName(plan.preparedBy)), ' — يعتمدها شخص مختلف (فصل مهام). حتى الاعتماد، فحص الميزانية في الطلبات استرشادي.') : SA.alert('success', 'اعتمدها ', h('b', {}, SA.userName(plan.approvedBy)), ' في ', SA.fmt.dt(plan.lockedAt), ' — التعديل عبر Amendment فقط.'),
        h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['القسم', 'المعتمد', 'الفعلي', 'محجوز', 'في طلبات', 'الشاغر', 'الاستيفاء', 'الحالة'].map((x) => h('th', {}, x)))), h('tbody', {}, rows.map((d) => h('tr', { class: 'is-click', tabindex: 0, onclick: () => { SA.nav('hr/planning', { query: { tab: 'positions', dept: d.id } }); } }, h('td', {}, h('b', {}, d.name)), h('td.num', {}, d.hc), h('td.num', {}, d.fil), h('td.num', {}, d.res), h('td.num', {}, d.open), h('td.num', {}, d.vac), h('td', { style: { minWidth: '120px' } }, h('div.sap-hrc-bar', { title: d.fil + ' من ' + d.hc }, h('i', { class: d.fil > d.hc ? 'is-over' : '', style: { width: Math.min(100, d.hc ? d.fil / d.hc * 100 : 0) + '%' } }))), h('td', {}, d.vac < 0 ? SA.chip('تجاوز الخطة', 'danger') : d.vac === 0 ? SA.chip('مكتمل', 'success') : SA.chip(d.vac + ' شاغر', 'warning')))))))),
      h('div.sap-grid-2', {}, SA.card({ title: 'عتبات العدد كمؤشر امتثال', tags: SA.tag('pending', 'Law · Pending') }, h('p.t-muted', {}, 'العدد الحالي ', h('b.num', {}, hc), ' عامل دائم — تُقرأ العتبات من إعدادات HR-30.'), h('ul.sap-hrc-chk', {}, ['thr.work_regulation', 'thr.social_fund', 'thr.disability_quota', 'thr.training_fund', 'thr.nurse_doctor'].map((k) => { const l = K.legal(k); return h('li', {}, h('span.t', {}, h('b', {}, K.setting(k).name), h('small', {}, l.text)), l.n != null && hc >= l.n ? SA.chip('منطبق', 'warning') : SA.chip('غير منطبق', 'neutral')); })), h('a.sap-linkbtn', { href: SA.href('hr/compliance?tab=thresholds') }, 'فتح لوحة الامتثال')),
        SA.card({ title: 'سجل الخطة' }, h('ol.sap-hrc-chain', {}, (plan.history || []).map((x) => h('li', {}, h('span.sap-hrc-dot', {}, SA.icon('history', 'icon-sm')), h('div', {}, h('b', {}, x.text), h('div.t-muted', {}, SA.fmt.dt(x.ts) + ' · ' + SA.userName(x.by)))))))));
  }
  function positionsPanel(S) {
    const d0 = S.ctx.params.dept || '';
    const t = K.table({ caption: 'الوظائف', rows: () => get('positions'), pageSize: 10, initial: { filters: { departmentId: d0 } }, search: { placeholder: 'ابحث في الوظائف…', keys: ['title', 'id'] },
      filters: [{ key: 'departmentId', label: 'القسم', options: hrDepts().map((x) => [x.id, x.name]) }, { key: 'status', label: 'الحالة', options: [['active', 'نشطة'], ['frozen', 'مجمّدة']] }],
      columns: [{ key: 'title', label: 'الوظيفة', sort: true, render: (p) => h('div', {}, h('b', {}, p.title), h('small.t-muted', {}, p.id + (p.reportsTo ? ' · تتبع ' + K.posTitle(p.reportsTo) : ''))) }, { key: 'dep', label: 'القسم', render: (p) => dept(p.departmentId), value: (p) => dept(p.departmentId), sort: true }, { key: 'hc', label: 'المعتمد', value: (p) => p.headcount, sort: true, render: (p) => h('span.num', {}, p.headcount) }, { key: 'fil', label: 'الفعلي', value: (p) => K.filled(p.id), sort: true, render: (p) => h('span.num', {}, K.filled(p.id)) }, { key: 'vac', label: 'الشاغر', value: (p) => K.vacancy(p.id), sort: true, render: (p) => h('span.num', {}, K.vacancy(p.id)) }, { key: 'flags', label: 'خصائص', render: (p) => h('div.cluster', {}, p.safetyCritical ? SA.chip('حرجة للسلامة', 'danger') : null, p.operational ? SA.chip('تشغيل', 'info') : null, !p.safetyCritical && !p.operational ? '—' : null) }, { key: 'band', label: 'شريحة الأجر (T3)', render: (p) => (K.canSal() ? (p.salaryBand && p.salaryBand.min != null ? h('span.num', {}, SA.fmt.num(p.salaryBand.min) + ' – ' + SA.fmt.num(p.salaryBand.max)) : '—') : h('span.sap-hrc-sens', {}, SA.icon('lock', 'icon-sm'), 'سري')) }, { key: 'status', label: 'الحالة', render: (p) => { const s = posState(p); return SA.chip(s[0], s[1]); } }],
      rowActions: (p) => [{ label: 'تعديل / الوصف الوظيفي', icon: 'edit', disabled: SA.can('hr.planning.edit') ? false : 'ليست من صلاحياتك', onClick: () => positionForm(p) }, { label: 'طلب توظيف', icon: 'userplus', disabled: p.status === 'frozen' ? 'الوظيفة مجمّدة' : SA.can('hr.requisitions.create') ? false : 'ليست من صلاحياتك', onClick: () => SA.nav('hr/requisitions/new', { query: { position: p.id } }) }, { divider: true }, { label: p.status === 'frozen' ? 'إلغاء التجميد' : 'تجميد الوظيفة', icon: 'lock', disabled: SA.can('hr.planning.edit') ? false : 'ليست من صلاحياتك', onClick: () => freezePosition(p) }],
      onRowClick: (p) => positionForm(p), empty: { icon: 'userplus', title: 'لا توجد وظائف', text: 'ابدأ بإضافة وظيفة للهيكل.', action: { label: 'وظيفة جديدة', perm: 'hr.planning.edit', onClick: () => positionForm(null) } } });
    return SA.card({ flush: true }, t.el);
  }
  function orgPanel(S) {
    const mode = S.orgMode || (S.orgMode = 'report'); const emps = get('employees').filter((e) => e.status !== 'terminated');
    const node = (e) => h('div.sap-hrc-node', {}, SA.avatar(e.name), h('div', {}, h('b', {}, e.name), h('small', {}, K.posTitle(e.positionId) + ' · ' + dept(e.departmentId))), e.status === 'probation' ? SA.chip('تجربة', 'info') : e.status === 'preboarding' ? SA.chip('ما قبل التعيين', 'warning') : null);
    function reportTree(parentId) { const kids = emps.filter((e) => (e.managerEmpId || null) === parentId); if (!kids.length) return null; return h('ul', {}, kids.map((e) => { const sub = reportTree(e.id); return h('li', {}, node(e), sub); })); }
    const roots = emps.filter((e) => !e.managerEmpId || !emps.find((x) => x.id === e.managerEmpId));
    function deptTree(parent) { return h('ul', {}, hrDepts().filter((d) => (d.parentId || null) === parent).map((d) => { const ps = get('positions').filter((p) => p.departmentId === d.id && p.status !== 'closed'); const sub = deptTree(d.id); return h('li', {}, h('div.sap-hrc-node', {}, SA.icon('building'), h('div', {}, h('b', {}, d.name), h('small', {}, 'رئيس القسم: ' + SA.userName(d.managerId) + ' · ' + emps.filter((e) => e.departmentId === d.id).length + ' موظف'))), (ps.length || sub) ? h('ul', {}, ps.map((p) => h('li', {}, h('div.sap-hrc-node' + (K.vacancy(p.id) > 0 ? '.is-vacant' : ''), {}, SA.icon('user'), h('div', {}, h('b', {}, p.title), h('small', {}, K.filled(p.id) + ' من ' + p.headcount + (K.vacancy(p.id) > 0 ? ' · ' + K.vacancy(p.id) + ' شاغر' : ''))), p.safetyCritical ? SA.chip('سلامة', 'danger') : null))), sub ? Array.from(sub.childNodes) : null) : null); })); }
    return h('div.sap-hrc', {}, h('div.sap-hrc-hdr', {}, SA.segmented([['report', 'شجرة التبعية (الموظفون)'], ['dept', 'حسب الأقسام والوظائف']], mode, (v) => { S.orgMode = v; K.tick(); }), h('span.t-muted', {}, 'التبعية (reports_to) شجرة بلا دوران (BR-PLN-08). الورديات تُعرض من HR-09.')),
      SA.card({ title: mode === 'report' ? 'الهيكل التنظيمي — حسب المدير المباشر' : 'الهيكل التنظيمي — حسب الأقسام', tags: SA.tag('new', 'SCR-PLN-04') }, h('div', { style: { overflowX: 'auto' } }, h('ul.sap-hrc-tree', {}, mode === 'report' ? roots.map((r) => h('li', {}, node(r), reportTree(r.id))) : Array.from(deptTree(null).childNodes)))));
  }
  function vacanciesPanel() {
    const t = K.table({ caption: 'الشاغر مقابل المشغول', rows: () => get('positions').filter((p) => p.status !== 'closed'), pageSize: 12, search: { placeholder: 'ابحث…', keys: ['title'] }, filters: [{ key: 'st', label: 'الحالة', options: [['vac', 'بها شاغر'], ['over', 'تجاوز الخطة'], ['full', 'مكتملة']], test: (p, v) => (v === 'vac' ? K.vacancy(p.id) > 0 : v === 'over' ? K.vacancy(p.id) < 0 : K.vacancy(p.id) === 0) }],
      columns: [{ key: 'title', label: 'الوظيفة', sort: true, render: (p) => h('div', {}, h('b', {}, p.title), h('small.t-muted', {}, dept(p.departmentId))) }, { key: 'hc', label: 'المعتمد', render: (p) => h('span.num', {}, p.headcount), value: (p) => p.headcount, sort: true }, { key: 'fil', label: 'المشغول', render: (p) => h('span.num', {}, K.filled(p.id)) }, { key: 'res', label: 'محجوز بعرض مقبول', render: (p) => h('span.num', {}, K.reservedOf(p.id)) }, { key: 'op', label: 'في طلبات نشطة', render: (p) => h('span.num', {}, K.openReq(p.id)) }, { key: 'vac', label: 'الشاغر', sort: true, value: (p) => K.vacancy(p.id), render: (p) => h('b.num', {}, K.vacancy(p.id)) }, { key: 'st', label: 'الحالة', render: (p) => { const s = posState(p); return SA.chip(s[0], s[1]); } }],
      rowActions: (p) => [{ label: 'إنشاء طلب توظيف', icon: 'userplus', disabled: K.vacancy(p.id) < 0 ? 'تجاوز الخطة: يمنع طلبات جديدة (BR-PLN-03)' : p.status === 'frozen' ? 'الوظيفة مجمّدة' : SA.can('hr.requisitions.create') ? false : 'ليست من صلاحياتك', onClick: () => SA.nav('hr/requisitions/new', { query: { position: p.id } }) }] });
    return h('div.sap-hrc', {}, SA.alert('info', 'الشاغر = المعتمد − النشطون (يشمل التجربة والإجازة) − المحجوز بعرض مقبول لم يلتحق. الناتج السالب = «تجاوز الخطة» ويمنع طلبات جديدة لنفس الوظيفة (BR-PLN-03).'), SA.card({ flush: true }, t.el));
  }
  function render(root, ctx) {
    K.crumbs(ctx, 'hr-hire', 'الخطة والوظائف');
    return K.screen(root, ctx, { perm: 'hr.planning.view', route: 'hr/planning', def: 'plan', title: 'الخطة', paths: ['positions', 'employees', 'requisitions', 'offers', 'hrPlan', 'departments'],
      tabs: () => [{ id: 'plan', label: 'خطة القوى العاملة', icon: 'target' }, { id: 'positions', label: 'الوظائف', icon: 'userplus', badge: get('positions').length }, { id: 'org', label: 'الهيكل التنظيمي', icon: 'building' }, { id: 'vacancies', label: 'الشاغر مقابل المشغول', icon: 'swap' }],
      head: () => SA.pageHead({ title: 'الخطة والوظائف والهيكل', desc: 'عدد الوظائف المعتمد لكل قسم، والشاغر مقابل المشغول، والهيكل التنظيمي — مصدر فحص الميزانية في طلبات التوظيف.', tags: [SA.tag('new', 'HR-01')], actions: [K.spec('hr-acquire.html', 'scr-pln-01'), SA.btn({ label: 'وظيفة جديدة', icon: 'plus', kind: 'primary', perm: 'hr.planning.edit', onClick: () => positionForm(null) })] }),
      panel(tab, S) { return ({ plan: planPanel, positions: positionsPanel, org: orgPanel, vacancies: vacanciesPanel }[tab] || planPanel)(S); } });
  }
  SA.register(Object.assign({}, K.NAV('hr-planning'), { app: 'hr', render, stub: false }));
  K.positionForm = positionForm;
})();
/* ───────────────────────── part 3 — HR-02 طلبات التوظيف ───────────────────────── */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store, K = SA.hrCore, get = K.get;
  const dept = (id) => SA.deptName(id);
  const TYPES = { permanent: 'دائم (وظيفة معتمدة)', temporary: 'مؤقت / موسمي', replacement: 'إحلال' };
  const URG = { normal: 'عادي', critical: 'حرج تشغيليًا / سلامة' };
  const reqChip = (s) => { const m = K.reqStatus[s] || [s, 'neutral']; return SA.chip(m[0], m[1]); };
  const ap = (r) => (r.approvalId ? st.find('approvals', r.approvalId) : null);
  const stepText = (r) => { const a = ap(r); if (!a) return '—'; if (a.status !== 'pending') return a.status === 'approved' ? 'اكتملت السلسلة' : '—'; const s = a.chain.find((x) => x.step === a.currentStep); return s ? 'بانتظار: ' + s.label : '—'; };
  const myScopeRows = (rows) => { const sc = SA.scopeOf('hr'); if (sc === 'team' || sc === 'own') { const me = K.me(); const mine = get('departments').filter((d) => d.managerId === me.id).map((d) => d.id); return rows.filter((r) => r.requestedBy === me.id || mine.indexOf(r.departmentId) >= 0); } return rows; };

  /* ───── outcome (called by reconcile whenever the linked approval is decided — from my dialog or from the shared inbox) ───── */
  K._reqOutcome = function (a) {
    const r = st.find('requisitions', a.ref.id); if (!r || r.status !== 'pending_approval') return;
    const last = a.chain.slice().reverse().find((c) => c.decidedBy) || {}; const t = K.posTitle(r.positionId) || r.newPositionTitle;
    if (a.status === 'approved') {
      st.patch('requisitions', r.id, { status: 'open', approvedAt: new Date().toISOString() });
      SA.audit('HR.REQUISITION.APPROVED', { target: { type: 'requisition', id: r.id, label: t + ' — ' + dept(r.departmentId) }, before: { status: 'pending_approval' }, after: { status: 'open', headcount: r.headcount, vacancy: 'شاغر مفتوح' }, reason: last.reason || '' });
      SA.notify({ title: 'اعتُمد طلب توظيف: ' + t, body: 'تحوّل إلى شاغر مفتوح — يظهر الآن في لوحة المرشحين (' + r.id + ').', level: 'info', toUsers: [r.requestedBy], to: ['R-12'], link: '#/hr/candidates?req=' + r.id });
    } else if (a.status === 'rejected') {
      st.patch('requisitions', r.id, { status: 'rejected', rejectionReason: last.reason || '' });
      SA.audit('HR.REQUISITION.REJECTED', { target: { type: 'requisition', id: r.id, label: t + ' — ' + dept(r.departmentId) }, before: { status: 'pending_approval' }, after: { status: 'rejected' }, reason: last.reason || '' });
      SA.notify({ title: 'رُفض طلب توظيف: ' + t, body: 'السبب: ' + (last.reason || '—'), level: 'info', toUsers: [r.requestedBy], link: '#/hr/requisitions/' + r.id });
    } else if (a.status === 'changes_requested') {
      st.patch('requisitions', r.id, { status: 'returned', rejectionReason: last.reason || '' });
      SA.audit('HR.REQUISITION.REJECTED', { target: { type: 'requisition', id: r.id, label: t }, before: { status: 'pending_approval' }, after: { status: 'returned' }, reason: 'إعادة للمقدّم: ' + (last.reason || '') });
      SA.notify({ title: 'أُعيد طلب التوظيف للتعديل: ' + t, body: last.reason || '', level: 'action', toUsers: [r.requestedBy], link: '#/hr/requisitions/' + r.id });
    }
  };

  /* ───── wizard ───── */
  function wizard(root, ctx) {
    const pre = ctx.params.position || '';
    const S = { step: 0, d: { positionId: pre, newPos: false, newTitle: '', dept: '', hc: 1, type: 'permanent', replaces: '', end: '', reason: '', urgency: 'normal', needBy: '', over: '' } };
    const box = h('div.sap-hrc'); root.append(box);
    const positions = get('positions').filter((p) => p.status !== 'frozen' && p.status !== 'closed');
    const leavers = get('employees').filter((e) => (e.status === 'terminated' || e.status === 'notice') && !get('requisitions').some((q) => q.replacesEmpId === e.id && ['pending_approval', 'approved', 'open'].indexOf(q.status) >= 0));
    function chainFor(bc) { const c = [{ roleId: 'R-11', label: 'مدير الموارد البشرية (HR)' }]; if (bc.result !== 'within') c.push({ roleId: 'R-07', label: 'المالية (' + (bc.result === 'unlisted' ? 'غير مدرج' : 'يتجاوز الميزانية') + ')' }); if (S.d.newPos || bc.result === 'unlisted' || bc.result === 'exceeds') c.push({ roleId: 'R-02', label: 'المدير العام (وظيفة جديدة / فوق الحد {Open})' }); return c; }
    let f = {};
    function draw() {
      SA.clear(box); const d = S.d;
      box.append(SA.pageHead({ title: 'طلب توظيف جديد', desc: 'ثلاث خطوات: البيانات ← فحص الميزانية ← المراجعة والإرسال للاعتماد.', back: { label: 'طلبات التوظيف', href: SA.href('hr/requisitions') } }), SA.stepper(['بيانات الطلب', 'فحص الميزانية', 'المراجعة والإرسال'], S.step));
      let body;
      if (S.step === 0) {
        f.pos = SA.form.field({ name: 'pos', label: 'الوظيفة', type: 'select', required: true, value: d.newPos ? '__new' : d.positionId, options: [['', 'اختر الوظيفة…']].concat(positions.map((p) => [p.id, p.title + ' — ' + dept(p.departmentId) + (K.vacancy(p.id) < 0 ? ' (تجاوز الخطة)' : K.vacancy(p.id) === 0 ? ' (مكتملة)' : ' (' + K.vacancy(p.id) + ' شاغر)')])).concat([['__new', 'وظيفة جديدة غير مدرجة في الخطة']]), onChange: (v) => { collect(); d.newPos = v === '__new'; d.positionId = d.newPos ? '' : v; const p = st.find('positions', v); if (p) d.dept = p.departmentId; draw(); } });
        f.title = SA.form.field({ name: 'nt', label: 'المسمى المقترح للوظيفة الجديدة', required: true, value: d.newTitle });
        f.dept = SA.form.field({ name: 'dp', label: 'القسم', type: 'select', required: true, value: d.dept, disabled: !d.newPos && !!d.positionId, options: [['', 'اختر القسم…']].concat(get('departments').filter((x) => x.active).map((x) => [x.id, x.name])) });
        f.hc = SA.form.field({ name: 'hc', label: 'العدد المطلوب', type: 'number', min: 1, required: true, value: d.hc, hint: 'التوظيف بالجملة: طلب واحد بعدد متعدد يُغلق جزئيًا مع كل تعيين (BR-RQN-13).' });
        f.type = SA.form.field({ name: 'type', label: 'نوع الطلب', type: 'select', value: d.type, options: Object.keys(TYPES).map((k) => [k, TYPES[k]]), onChange: (v) => { d.type = v; collect(); draw(); } });
        f.rep = SA.form.field({ name: 'rep', label: 'يحلّ محل (موظف مغادر/منقول)', type: 'select', required: true, value: d.replaces, options: [['', 'اختر الموظف المغادر…']].concat(leavers.map((e) => [e.id, e.name + ' — ' + e.empNo])), hint: leavers.length ? 'لا إحلال ثانٍ لنفس المغادر (BR-RQN-02).' : 'لا يوجد موظفون مغادرون متاحون للإحلال.' });
        f.end = SA.form.field({ name: 'end', label: 'تاريخ نهاية العمل المؤقت', type: 'date', required: true, value: d.end, hint: 'يُقترح عقد محدد المدة (HR-04) مع تحذير المواد 87/88/154 [Law · Pending].' });
        f.urg = SA.form.field({ name: 'urg', label: 'الأولوية', type: 'select', value: d.urgency, options: Object.keys(URG).map((k) => [k, URG[k]]), hint: 'الحرج تشغيليًا/سلامة يُنبَّه به HR Manager فورًا (BR-RQN-07).' });
        f.need = SA.form.field({ name: 'need', label: 'تاريخ الاحتياج', type: 'date', required: true, value: d.needBy });
        f.reason = SA.form.field({ name: 'reason', label: 'مبرر الطلب', type: 'textarea', rows: 3, required: true, value: d.reason, rules: [SA.form.rules.min(10)], hint: 'الحد الأدنى للطول {Open} — الحد التجريبي هنا 10 أحرف.' });
        const fields = [f.pos].concat(d.newPos ? [f.title] : [], [f.dept, f.hc, f.type], d.type === 'replacement' ? [f.rep] : [], d.type === 'temporary' ? [f.end] : [], [f.urg, f.need, f.reason]);
        const grp = SA.form.group(fields);
        body = [h('div.sap-formgrid', {}, f.pos.el, d.newPos ? f.title.el : null, f.dept.el, f.hc.el, f.type.el, d.type === 'replacement' ? f.rep.el : null, d.type === 'temporary' ? f.end.el : null, f.urg.el, f.need.el), f.reason.el, d.positionId && K.vacancy(d.positionId) < 0 ? SA.alert('danger', h('b', {}, 'تجاوز الخطة: '), 'الوظيفة بها شاغلون/محجوزون أكثر من المعتمد — لا طلبات جديدة لنفس الوظيفة (BR-PLN-03). عدّل الخطة أولًا.') : null];
        S.next = () => { if (!grp.validate()) return; if (d.positionId && K.vacancy(d.positionId) < 0) { f.pos.error('الوظيفة متجاوزة للخطة — لا طلبات جديدة عليها.'); return; } collect(); if (d.needBy && new Date(d.needBy) < new Date(K.ymd(new Date()))) { f.need.error('تاريخ الاحتياج في الماضي.'); return; } if (d.type === 'temporary' && new Date(d.end) < new Date(d.needBy)) { f.end.error('نهاية العمل المؤقت قبل تاريخ الاحتياج.'); return; } S.step = 1; draw(); };
      } else if (S.step === 1) {
        const bc = K.budgetCheck(d.positionId, d.hc, d.newPos); const p = st.find('positions', d.positionId); const band = p && p.salaryBand;
        f.over = SA.form.field({ name: 'over', label: 'تبرير الطلب غير المدرج / المتجاوز للميزانية', type: 'textarea', rows: 2, required: bc.result !== 'within', value: d.over });
        body = [h('div.sap-grid-2', {}, SA.card({ title: 'نتيجة فحص الميزانية', tags: SA.tag('new', 'SCR-RQN-05') }, h('div', { style: { marginBlockEnd: '10px' } }, K.budgetChip(bc.result)), SA.kv([['المعتمد في الخطة', h('span.num', {}, bc.approved)], ['الشاغلون الفعليون', h('span.num', {}, bc.filled)], ['محجوز بعرض مقبول', h('span.num', {}, bc.reserved)], ['في طلبات نشطة', h('span.num', {}, bc.open)], ['المطلوب الآن', h('span.num', {}, bc.requested)], ['الإجمالي بعد الطلب', h('span.num', {}, d.newPos ? bc.requested : bc.total + ' من ' + bc.approved)]]), bc.result === 'exceeds' ? SA.alert('warning', 'يتجاوز بـ ' + bc.over + ' — هتتضاف المالية والمدير العام لسلسلة الاعتماد (BR-RQN-04/12).') : bc.result === 'unlisted' ? SA.alert('warning', 'وظيفة غير مدرجة في الخطة — تمرّ على المالية والمدير العام (BR-PLN-02).') : SA.alert('success', 'ضمن الميزانية المعتمدة — سلسلة قصيرة.'), h('p.t-muted', {}, 'لقطة الفحص تُخزَّن وقت الإرسال ولا تتغيّر بتغيّر الخطة لاحقًا (BR-RQN-03).')),
          SA.card({ title: 'التقدير المالي للمرتب (T3)' }, K.canSal() ? (band && band.min != null ? SA.kv([['شريحة الوظيفة', h('span.num', {}, SA.fmt.money(band.min) + ' – ' + SA.fmt.money(band.max))], ['تقدير شهري (أدنى → أعلى)', h('span.num', {}, SA.fmt.money(band.min * d.hc) + ' → ' + SA.fmt.money(band.max * d.hc))]]) : h('p.t-muted', {}, 'لا شريحة مُدخلة لهذه الوظيفة (وظيفة جديدة أو لم تُحدَّد).')) : h('div', {}, K.lockNote('المعتمِد/المقدّم بدون hr.salary.view يرى «ضمن/أعلى من الميزانية» ونسبة الفرق فقط (BR-RQN-11).'), h('p.t-muted', { style: { marginBlockStart: '8px' } }, 'الحالة: ', bc.result === 'within' ? 'ضمن الميزانية' : 'أعلى من الميزانية بنسبة ' + (bc.approved ? Math.round(bc.over / bc.approved * 100) + '%' : '—'))))), bc.result !== 'within' ? f.over.el : null];
        S.next = () => { if (bc.result !== 'within' && !f.over.validate()) return; d.over = f.over.get() || ''; S.bc = bc; S.step = 2; draw(); };
      } else {
        const bc = S.bc || K.budgetCheck(d.positionId, d.hc, d.newPos); const chain = chainFor(bc); const title = d.newPos ? d.newTitle : K.posTitle(d.positionId);
        body = [SA.card({ title: 'مراجعة الطلب' }, SA.kv([['الوظيفة', h('b', {}, title)], ['القسم', dept(d.dept)], ['العدد', h('span.num', {}, d.hc)], ['النوع', TYPES[d.type] + (d.type === 'replacement' ? ' — يحلّ محل ' + K.empName(d.replaces) : '') + (d.type === 'temporary' ? ' — حتى ' + SA.fmt.date(d.end) : '')], ['الأولوية', URG[d.urgency]], ['تاريخ الاحتياج', SA.fmt.date(d.needBy)], ['فحص الميزانية', K.budgetChip(bc.result)], ['المبرر', d.reason], d.over ? ['تبرير التجاوز', d.over] : null])),
          SA.card({ title: 'سلسلة الاعتماد المتوقعة' }, h('ol.sap-hrc-chain', {}, chain.map((c, i) => h('li', {}, h('span.sap-hrc-dot', {}, i + 1), h('div', {}, h('b', {}, c.label), h('div.t-muted', {}, SA.roleName(c.roleId)))))), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الحدود الفاصلة لخطوة المدير العام {Open} (قرار D7). المقدّم (' + K.me().name + ') لا يعتمد طلبه حتى بالتفويض (BR-RQN-05).'))), d.urgency === 'critical' ? SA.alert('warning', 'الأولوية «حرج»: سيُنبَّه HR Manager فورًا.') : null];
        S.next = submit; S.chain = chain; S.bc = bc;
      }
      const nextBtn = SA.btn({ label: S.step === 2 ? 'إرسال للاعتماد' : 'التالي', kind: S.step === 2 ? 'accent' : 'primary', icon: S.step === 2 ? 'check' : 'arrowleft', onClick: () => S.next() });
      box.append(SA.card({}, body), h('div.sap-wiz-foot', {}, S.step > 0 ? h('button.btn.btn-ghost', { type: 'button', onclick: () => { if (S.step === 0) return; collect(); S.step--; draw(); } }, 'السابق') : h('a.btn.btn-ghost', { href: SA.href('hr/requisitions') }, 'إلغاء'), nextBtn));
    }
    function collect() { const d = S.d; if (S.step !== 0) return; try { d.positionId = d.newPos ? '' : (f.pos.get() === '__new' ? '' : f.pos.get()); d.newTitle = f.title.get(); d.dept = f.dept.input.disabled ? d.dept : f.dept.get(); d.hc = f.hc.get() || 1; d.type = f.type.get(); d.replaces = f.rep.get(); d.end = f.end.get(); d.urgency = f.urg.get(); d.needBy = f.need.get(); d.reason = f.reason.get(); } catch (e) { /* noop */ } }
    async function submit() {
      const d = S.d, bc = S.bc, chain = S.chain; const title = d.newPos ? d.newTitle : K.posTitle(d.positionId);
      try {
        const rec = await SA.api(() => {
          const id = st.nextId('requisitions', 'RQ-2026', 4);
          const a = SA.requestApproval({ type: 'hiring_requisition', title: 'طلب توظيف: ' + title + ' — ' + dept(d.dept) + ' (' + d.hc + ')', chain, amount: null, context: [['الوظيفة', title], ['القسم', dept(d.dept)], ['العدد', String(d.hc)], ['النوع', TYPES[d.type]], ['فحص الميزانية', bc.label], ['الأولوية', URG[d.urgency]], ['السبب', d.reason]], ref: { type: 'hiring_requisition', id } });
          const r = { id, positionId: d.positionId || null, newPositionTitle: d.newPos ? d.newTitle : null, departmentId: d.dept, headcount: d.hc, reason: d.reason, requestedBy: K.me().id, status: 'pending_approval', createdAt: new Date().toISOString(), approvalId: a.id, type: d.type, urgency: d.urgency, needBy: d.needBy, endDate: d.type === 'temporary' ? d.end : null, replacesEmpId: d.type === 'replacement' ? d.replaces : null, budgetCheck: bc, overJustification: d.over, hired: 0 };
          st.insert('requisitions', r, true);
          SA.audit('HR.REQUISITION.CREATED', { target: { type: 'requisition', id, label: title + ' — ' + dept(d.dept) }, after: { headcount: d.hc, type: d.type, budget: bc.result, urgency: d.urgency } });
          if (d.urgency === 'critical') SA.notify({ title: 'طلب توظيف حرج: ' + title, body: 'الأولوية «حرج تشغيليًا/سلامة» — راجعه الآن.', level: 'urgent', to: ['R-11'], link: '#/hr/requisitions/' + id });
          return r;
        });
        SA.toast('تم إرسال الطلب ' + rec.id + ' للاعتماد', 'success'); SA.nav('hr/requisitions/' + rec.id);
      } catch (e) { SA.fail(e); }
    }
    draw(); return () => { box.remove(); };
  }

  /* ───── detail ───── */
  function detail(root, ctx, id) {
    K.crumbs(ctx, 'hr-hire', 'طلبات التوظيف');
    return K.mount(root, ctx, { perm: 'hr.requisitions.view', skel: 'detail', paths: ['requisitions', 'approvals', 'candidates', 'offers', 'audit'], build() {
      const r = st.find('requisitions', id); if (!r) return SA.card({}, SA.empty({ icon: 'search', title: 'الطلب غير موجود', text: id, action: { label: 'رجوع للقائمة', icon: 'arrowright', onClick: () => SA.nav('hr/requisitions') } }));
      const a = ap(r); const title = r.positionId ? K.posTitle(r.positionId) : r.newPositionTitle; const bc = r.budgetCheck || {}; const cands = get('candidates').filter((c) => c.requisitionId === r.id);
      const why = a ? K.cannotDecide(a) : 'لا يوجد طلب اعتماد.'; const isReq = r.requestedBy === K.me().id;
      const evs = get('audit').filter((e) => e.target && e.target.id === r.id).slice(0, 6);
      return h('div.sap-hrc', {}, SA.pageHead({ title: title + ' — ' + dept(r.departmentId), tags: [reqChip(r.status), SA.tag('new', r.id)], back: { label: 'طلبات التوظيف', href: SA.href('hr/requisitions') }, desc: 'مقدّم الطلب: ' + SA.userName(r.requestedBy) + ' · ' + SA.fmt.dt(r.createdAt),
        actions: [r.status === 'pending_approval' && a ? SA.btn({ label: 'قرار الاعتماد', kind: 'primary', icon: 'checkcircle', reason: SA.can('hr.requisitions.approve') || (K.delegatedRoles(K.me().id).length) ? '' : 'ليست من صلاحياتك (hr.requisitions.approve)', onClick: () => K.decisionDialog(a, title) }) : null, r.status === 'open' ? SA.btn({ label: 'لوحة المرشحين', kind: 'primary', icon: 'users', onClick: () => SA.nav('hr/candidates', { query: { req: r.id } }) }) : null, ['pending_approval', 'returned'].indexOf(r.status) >= 0 ? SA.btn({ label: 'سحب الطلب', kind: 'ghost', icon: 'xcircle', reason: isReq || SA.can('hr.requisitions.approve') ? '' : 'للمقدّم أو معتمِد فقط', onClick: () => cancelReq(r) }) : null] }),
        why && r.status === 'pending_approval' && isReq ? SA.alert('info', h('b', {}, 'فصل المهام: '), 'أنت مقدّم هذا الطلب — لا تعتمده (SOD-08) حتى لو كنت مخوّلًا بالاعتماد.') : null,
        r.status === 'open' ? SA.alert('success', h('b', {}, 'شاغر مفتوح: '), 'الطلب معتمد ويظهر الآن في لوحة المرشحين. مرشحون: ', h('b.num', {}, cands.length), ' · مقاعد تم شغلها: ', h('b.num', {}, r.hired || 0), ' / ', h('b.num', {}, r.headcount)) : null,
        r.status === 'rejected' || r.status === 'returned' ? SA.alert(r.status === 'rejected' ? 'danger' : 'warning', h('b', {}, r.status === 'rejected' ? 'مرفوض: ' : 'أُعيد للمقدّم: '), r.rejectionReason || '—') : null,
        h('div.sap-hrc-split', {}, h('div.sap-hrc', {}, SA.card({ title: 'تفاصيل الطلب' }, SA.kv([['النوع', TYPES[r.type] || '—'], ['العدد', h('span.num', {}, r.headcount)], ['الأولوية', URG[r.urgency] || '—'], ['تاريخ الاحتياج', SA.fmt.date(r.needBy)], r.endDate ? ['نهاية العمل المؤقت', SA.fmt.date(r.endDate)] : null, r.replacesEmpId ? ['يحلّ محل', K.empName(r.replacesEmpId)] : null, ['المبرر', r.reason], r.overJustification ? ['تبرير التجاوز', r.overJustification] : null, ['الخطوة الحالية', stepText(r)]])),
          SA.card({ title: 'فحص الميزانية (لقطة وقت الإرسال)', tags: K.budgetChip(bc.result || 'within') }, SA.kv([['المعتمد', h('span.num', {}, bc.approved != null ? bc.approved : '—')], ['الشاغلون', h('span.num', {}, bc.filled != null ? bc.filled : '—')], ['محجوز', h('span.num', {}, bc.reserved != null ? bc.reserved : '—')], ['في طلبات نشطة', h('span.num', {}, bc.open != null ? bc.open : '—')], ['المطلوب', h('span.num', {}, bc.requested != null ? bc.requested : r.headcount)]]), K.canSal() ? null : K.lockNote('التقدير المالي T3 مخفي (hr.salary.view).')),
          evs.length ? SA.card({ title: 'نشاط الطلب' }, h('ul.sap-hrc-chk', {}, evs.map((e) => h('li', {}, h('span.t', {}, h('b', {}, SA.auditLabel(e.code)), h('small', {}, SA.userName(e.actor.id) + ' · ' + SA.fmt.rel(e.ts) + (e.reason ? ' — ' + e.reason : ''))))))) : null),
        SA.card({ title: 'سلسلة الاعتماد', tags: a ? h('a.sap-linkbtn', { href: SA.href('approvals/' + a.id) }, 'في صندوق الاعتمادات') : null }, K.chainView(a))));
    } });
  }
  async function cancelReq(r) {
    const x = await SA.confirm({ title: 'سحب طلب التوظيف ' + r.id, confirmLabel: 'سحب الطلب', danger: true, reasonRequired: true, reasonLabel: 'سبب السحب', impact: ['يُغلق طلب الاعتماد المرتبط في الصندوق المشترك.', 'تعديل وظيفة/قسم/عدد في طلب = إلغاء وإنشاء جديد (BR-RQN-09).'] }); if (!x.ok) return;
    st.patch('requisitions', r.id, { status: 'cancelled', cancelReason: x.reason }); if (r.approvalId) st.update('approvals', (l) => { const a = l.find((q) => q.id === r.approvalId); if (a && a.status === 'pending') { a.status = 'rejected'; a.updatedAt = new Date().toISOString(); a.chain.forEach((c) => { if (c.status === 'pending') { c.status = 'skipped'; c.reason = 'سُحب الطلب'; } }); } });
    SA.audit('HR.REQUISITION.REJECTED', { target: { type: 'requisition', id: r.id, label: K.posTitle(r.positionId) }, after: { status: 'cancelled' }, reason: 'سحب الطلب: ' + x.reason }); SA.toast('تم سحب الطلب', 'success');
  }

  /* ───── list ───── */
  function list(root, ctx) {
    K.crumbs(ctx, 'hr-hire', 'طلبات التوظيف');
    return K.mount(root, ctx, { perm: 'hr.requisitions.view', paths: ['requisitions', 'approvals', 'candidates', 'positions'], build() {
      const rows = myScopeRows(get('requisitions')); const pend = rows.filter((r) => r.status === 'pending_approval'); const open = rows.filter((r) => r.status === 'open');
      const mine = pend.filter((r) => { const a = ap(r); return a && !K.cannotDecide(a); });
      const t = K.table({ caption: 'طلبات التوظيف', rows: () => myScopeRows(get('requisitions')), pageSize: 10, initial: { filters: { status: ctx.params.status || '' } }, search: { placeholder: 'ابحث بالوظيفة أو رقم الطلب…', keys: [(r) => r.id, (r) => K.posTitle(r.positionId), (r) => r.newPositionTitle || ''] },
        filters: [{ key: 'status', label: 'الحالة', options: Object.keys(K.reqStatus).map((k) => [k, K.reqStatus[k][0]]) }, { key: 'type', label: 'النوع', options: Object.keys(TYPES).map((k) => [k, TYPES[k]]) }, { key: 'departmentId', label: 'القسم', options: get('departments').filter((d) => d.active).map((d) => [d.id, d.name]) }],
        columns: [{ key: 'id', label: 'الرقم', sort: true, render: (r) => h('b', {}, r.id) }, { key: 'pos', label: 'الوظيفة', sort: true, value: (r) => K.posTitle(r.positionId) || r.newPositionTitle, render: (r) => h('div', {}, h('b', {}, K.posTitle(r.positionId) !== '—' ? K.posTitle(r.positionId) : r.newPositionTitle), h('small.t-muted', {}, dept(r.departmentId))) }, { key: 'hc', label: 'العدد', render: (r) => h('span.num', {}, (r.hired || 0) + ' / ' + r.headcount) }, { key: 'type', label: 'النوع', render: (r) => (TYPES[r.type] || '—').split(' ')[0] + (r.urgency === 'critical' ? ' · حرج' : '') }, { key: 'status', label: 'الحالة', render: (r) => reqChip(r.status), sort: true }, { key: 'step', label: 'الخطوة', render: (r) => h('small', {}, stepText(r)) }, { key: 'by', label: 'المقدّم', render: (r) => SA.userName(r.requestedBy) }, { key: 'at', label: 'التاريخ', sort: true, value: (r) => r.createdAt, render: (r) => SA.fmt.date(r.createdAt) }],
        onRowClick: (r) => SA.nav('hr/requisitions/' + r.id), rowActions: (r) => [{ label: 'فتح التفاصيل', icon: 'doc', onClick: () => SA.nav('hr/requisitions/' + r.id) }, { label: 'لوحة المرشحين', icon: 'users', disabled: r.status === 'open' ? false : 'الطلب غير مفتوح', onClick: () => SA.nav('hr/candidates', { query: { req: r.id } }) }],
        empty: { icon: 'userplus', title: 'لا توجد طلبات توظيف', text: 'ابدأ بطلب جديد لوظيفة معتمدة في الخطة.', action: { label: 'طلب توظيف جديد', perm: 'hr.requisitions.create', onClick: () => SA.nav('hr/requisitions/new') } } });
      return h('div.sap-hrc', {}, SA.pageHead({ title: 'طلبات التوظيف', desc: 'من الحاجة إلى شاغر معتمد: فحص الميزانية وسلسلة اعتماد بفصل مهام. الطلب المعتمد يصبح شاغرًا مفتوحًا للمرشحين.', tags: [SA.tag('new', 'HR-02')], actions: [K.spec('hr-acquire.html', 'scr-rqn-01'), SA.btn({ label: 'طلب توظيف جديد', icon: 'plus', kind: 'primary', perm: 'hr.requisitions.create', onClick: () => SA.nav('hr/requisitions/new') })] }),
        h('div.sap-grid-cards', {}, SA.kpi('بانتظار الاعتماد', pend.length, { sub: mine.length ? mine.length + ' تنتظر قرارك' : 'لا شيء بانتظارك' }), SA.kpi('شواغر مفتوحة', open.reduce((a, r) => a + Math.max(0, r.headcount - (r.hired || 0)), 0), { sub: open.length + ' طلب' }), SA.kpi('مرفوضة/معادة', rows.filter((r) => r.status === 'rejected' || r.status === 'returned').length), SA.kpi('مكتملة', rows.filter((r) => r.status === 'filled').length)),
        mine.length ? SA.alert('info', h('b', {}, 'تنتظر قرارك: '), mine.map((r) => h('a', { href: SA.href('hr/requisitions/' + r.id), style: { marginInlineEnd: '10px' } }, r.id))) : null, SA.card({ flush: true }, t.el));
    } });
  }

  function render(root, ctx) {
    const sub = ctx.path[0];
    if (sub === 'new') { K.crumbs(ctx, 'hr-hire', 'طلب توظيف جديد'); K.init(); const d = SA.guard('hr.requisitions.create'); if (d) { root.append(d); return null; } return wizard(root, ctx); }
    if (sub) return detail(root, ctx, sub);
    return list(root, ctx);
  }
  SA.register(Object.assign({}, K.NAV('hr-requisitions'), { app: 'hr', render, stub: false, badge: () => { try { const n = get('requisitions').filter((r) => r.status === 'pending_approval').length; return n || null; } catch (e) { return null; } } }));
})();
/* ───────────────────────── part 4 — HR-03 المرشحون (ATS: pipeline · duplicate detection · scorecards · practical-test gate) ───────────────────────── */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store, K = SA.hrCore, get = K.get;
  const STAGES = [['applied', 'جديد'], ['screening', 'فرز'], ['interview', 'مقابلة'], ['test', 'اختبار عملي'], ['offer', 'عرض'], ['hired', 'تم التعيين']];
  const SN = { applied: 'جديد', screening: 'فرز', interview: 'مقابلة', test: 'اختبار عملي', offer: 'عرض', hired: 'تم التعيين', rejected: 'مرفوض' };
  const SRC = ['بوابة الوظائف', 'ترشيح داخلي', 'Wuzzuf', 'Forasna', 'واتساب', 'مدرسة فنية', 'وكالة', 'مخزون المواهب', 'Walk-in', 'نقل داخلي'];
  const REASONS = ['لا يستوفي المؤهلات/الخبرة المطلوبة', 'لم يجتز الاختبار العملي', 'لم يحضر المقابلة', 'الأجر المتوقع خارج النطاق', 'رفض العرض', 'تم شغل الوظيفة', 'تضارب مصالح / قرابة', 'أخرى (تُوضَّح)'];
  const REC = { hire: 'أوصي بالتعيين', hold: 'أحتفظ بالمرشح', no: 'لا أوصي' };
  const stageChip = (s) => SA.chip(SN[s] || s, s === 'rejected' ? 'danger' : s === 'hired' ? 'success' : s === 'offer' ? 'info' : 'neutral');
  const reqOf = (c) => st.find('requisitions', c.requisitionId);
  const posOf = (c) => { const r = reqOf(c); return r ? st.find('positions', r.positionId) : null; };
  const reqTitle = (c) => { const r = reqOf(c); return r ? (K.posTitle(r.positionId) !== '—' ? K.posTitle(r.positionId) : r.newPositionTitle) + ' (' + r.id + ')' : '—'; };
  const avg = (c) => { const sc = c.scorecards || []; if (!sc.length) return null; const t = sc.reduce((a, s) => a + (s.scores.technical + s.scores.safety + s.scores.attitude) / 3, 0); return t / sc.length; };
  const mySc = (c) => (c.scorecards || []).find((s) => s.interviewerId === K.me().id);
  const needsTest = (c) => { const p = posOf(c); return !!(p && p.operational); };
  const testOk = (c) => !needsTest(c) || (c.practicalTest && (c.practicalTest.status === 'passed' || c.practicalTest.waived));

  /* ───── stage moves (guards) ───── */
  async function moveStage(c, to, o) {
    o = o || {}; if (c.stage === to) return false;
    if (!SA.can('hr.candidates.edit')) { SA.toast('ليست من صلاحياتك (hr.candidates.edit)', 'warn'); return false; }
    if (to === 'hired') { SA.toast('التحويل لموظف يتم من «العروض والعقود» بعد عرض مقبول ولياقة ومستندات وعقد (BR-OFR-18).', 'warn', { ms: 6000 }); return false; }
    if (to === 'rejected') return rejectDialog(c);
    if (c.stage === 'rejected') { SA.toast('المرشح مرفوض — أعد فتحه أولًا بإضافة تقديم جديد.', 'warn'); return false; }
    const r = reqOf(c); if (r && ['open', 'approved'].indexOf(r.status) < 0 && c.stage !== 'rejected') { SA.toast('طلب التوظيف المرتبط ليس شاغرًا مفتوحًا (' + (K.reqStatus[r.status] || [r.status])[0] + ').', 'warn'); return false; }
    const order = STAGES.map((s) => s[0]); const fi = order.indexOf(c.stage), ti = order.indexOf(to);
    if (ti > fi + 1) { SA.toast('انقل المرحلة التالية مباشرة — لا تخطّي مراحل (' + SN[order[fi + 1]] + ' أولًا).', 'warn', { ms: 5500 }); return false; }
    if (to === 'test' && !(c.history || []).some((x) => x.stage === 'interview')) { SA.toast('الحراسة: المقابلة قبل الاختبار العملي (BR-ATS-07).', 'warn'); return false; }
    if (to === 'offer' && !testOk(c)) {
      SA.toast('الحراسة: اختبار عملي ناجح شرط للعرض في وظائف التشغيل (BR-ATS-07). سجّل نتيجة الاختبار أو اطلب إعفاءً.', 'warn', { ms: 6500 });
      if (!o.fromDrawer) openCandidate(c.id, 'test');
      return false;
    }
    try { await SA.api(() => { st.patch('candidates', c.id, (x) => ({ stage: to, history: (x.history || []).concat([{ ts: new Date().toISOString(), stage: to, by: K.me().id }]) })); SA.audit('HR.CANDIDATE.STAGE_CHANGED', { target: { type: 'candidate', id: c.id, label: c.name }, before: { stage: SN[c.stage] }, after: { stage: SN[to], requisition: c.requisitionId } }); }); SA.toast(c.name + ' ← ' + SN[to], 'success', { undo: () => { st.patch('candidates', c.id, (x) => ({ stage: c.stage, history: (x.history || []).slice(0, -1) })); SA.audit('HR.CANDIDATE.STAGE_CHANGED', { target: { type: 'candidate', id: c.id, label: c.name }, before: { stage: SN[to] }, after: { stage: SN[c.stage] }, reason: 'تراجع' }); } }); return true; } catch (e) { SA.fail(e); return false; }
  }
  function rejectDialog(c) {
    return new Promise((resolve) => {
      const rs = SA.form.field({ name: 'r', label: 'سبب الرفض (قائمة معتمدة)', type: 'select', required: true, options: [['', 'اختر السبب…']].concat(REASONS.map((x) => [x, x])) }); const nt = SA.form.field({ name: 'n', label: 'ملاحظة داخلية (لا تُرسل للمرشح)', type: 'textarea', rows: 2, hint: 'لا أسباب تقوم على الجنس أو الدين أو أي خصائص محمية (BR-ATS-08).' });
      const m = SA.modal({ title: 'رفض المرشح: ' + c.name, icon: 'xcircle', danger: true, size: 'sm', body: h('div.sap-confirm', {}, SA.alert('info', 'الرسالة للمرشح محايدة وبدون سبب تفصيلي. السبب يُسجَّل للتحليل (W-14/W-16).'), rs.el, nt.el), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(false) }, 'إلغاء'), SA.btn({ label: 'تأكيد الرفض', kind: 'danger', onClick: async () => {
        if (!rs.validate()) return; if (rs.get().indexOf('أخرى') === 0 && (nt.get() || '').trim().length < 3) { nt.error('وضّح السبب في الملاحظة.'); return; }
        m.setBusy(true); try { await SA.api(() => { st.patch('candidates', c.id, (x) => ({ stage: 'rejected', rejectReason: rs.get(), rejectNote: nt.get(), prevStage: c.stage, history: (x.history || []).concat([{ ts: new Date().toISOString(), stage: 'rejected', by: K.me().id, reason: rs.get() }]) })); SA.audit('HR.CANDIDATE.REJECTED', { target: { type: 'candidate', id: c.id, label: c.name }, before: { stage: SN[c.stage] }, after: { stage: 'مرفوض' }, reason: rs.get() + (nt.get() ? ' — ' + nt.get() : '') }); }); } catch (e) { m.setBusy(false); SA.fail(e); return; }
        m.setBusy(false); m.close(true); SA.toast('تم رفض ' + c.name, 'success', { undo: () => { st.patch('candidates', c.id, (x) => ({ stage: c.stage, rejectReason: '', history: (x.history || []).slice(0, -1) })); } }); } })] });
      m.closed.then((r) => resolve(!!r));
    });
  }

  /* ───── add candidate + duplicate detection (BR-ATS-01/03) ───── */
  function addCandidate(reqId) {
    const opens = get('requisitions').filter((r) => r.status === 'open');
    const name = SA.form.field({ name: 'name', label: 'الاسم الكامل', required: true, rules: [SA.form.rules.min(6)] });
    const nid = SA.form.field({ name: 'nid', label: 'الرقم القومي (14 رقمًا)', required: true, dir: 'ltr', hint: 'مفتاح فريد للمرشح — بنية الرقم تُستخدم لاستخراج الميلاد والمحافظة فقط. التحقق بخانة المراجعة {Open}.' });
    const phone = SA.form.field({ name: 'phone', label: 'الهاتف', type: 'tel', required: true, rules: [SA.form.rules.phone] });
    const src = SA.form.field({ name: 'src', label: 'المصدر', type: 'select', required: true, options: [['', 'اختر المصدر…']].concat(SRC.map((x) => [x, x])) });
    const rq = SA.form.field({ name: 'rq', label: 'الشاغر (طلب توظيف مفتوح)', type: 'select', required: true, value: reqId || '', options: [['', 'اختر الشاغر…']].concat(opens.map((r) => [r.id, (K.posTitle(r.positionId) !== '—' ? K.posTitle(r.positionId) : r.newPositionTitle) + ' — ' + SA.deptName(r.departmentId) + ' (' + r.id + ')'])) });
    const sal = SA.form.field({ name: 'sal', label: 'الراتب المتوقع (ج.م) — T3', type: 'number', min: 0 });
    const mil = SA.form.field({ name: 'mil', label: 'موقف التجنيد (للذكور)', type: 'select', value: 'أدّى', options: [['أدّى', 'أدّى'], ['معفى', 'معفى'], ['مؤجّل', 'مؤجّل'], ['قيد الخدمة', 'قيد الخدمة'], ['لا ينطبق', 'لا ينطبق']] });
    const rel = SA.form.field({ name: 'rel', label: 'قريب لموظف حالي؟', type: 'select', options: [['', 'لا']].concat(get('employees').filter((e) => e.status !== 'terminated').map((e) => [e.id, e.name + ' — ' + e.empNo])), hint: 'لو المقيّم قريبه يُمنع من تقييمه (تضارب مصالح — BR-ATS-15).' });
    const priv = SA.form.field({ name: 'priv', label: 'موافقة المرشح على إشعار الخصوصية (إلزامية)', type: 'checkbox', rules: [(v) => (v ? null : 'الموافقة على الخصوصية إلزامية عند التقديم (BR-ATS-13).')] });
    const dupBox = h('div'); let dup = null;
    nid.input.addEventListener('input', () => {
      SA.clear(dupBox); dup = null; const v = nid.get().replace(/\s/g, ''); if (v.length < 14) return; const p = K.parseNid(v); if (!p.ok) { dupBox.append(SA.alert('warning', p.msg)); return; }
      const ex = get('candidates').find((c) => c.nationalId === v); const emp = get('employees').find((e) => e.nationalIdLast4 === v.slice(-4) && e.status !== 'terminated' && name.get() && e.name.split(' ')[0] === name.get().trim().split(' ')[0]);
      dupBox.append(SA.alert('info', 'من الرقم: ', h('b', {}, p.gender + ' · مواليد ' + p.dob.getFullYear() + ' · محافظة ' + p.gov)));
      if (ex) { dup = ex; dupBox.append(SA.alert('danger', h('b', {}, 'مرشح مكرّر: '), ex.name + ' (' + ex.id + ') — مرحلة «' + SN[ex.stage] + '». لا مرشح جديد بنفس الرقم القومي؛ يُضاف تقديم (Application) على السجل الحالي (BR-ATS-01).')); }
      if (emp) dupBox.append(SA.alert('warning', h('b', {}, 'تنبيه: '), 'تطابق جزئي (آخر 4 أرقام + الاسم الأول) مع موظف حالي ', emp.name + ' (' + emp.empNo + ') — تحقق قبل المتابعة (BR-ATS-03).'));
    });
    const grp = SA.form.group([name, nid, phone, src, rq, priv]);
    const m = SA.modal({ title: 'إضافة مرشح', subtitle: 'كشف التكرار بالرقم القومي يعمل أثناء الكتابة', icon: 'userplus', size: 'lg',
      body: h('div.sap-confirm', {}, h('div.sap-formgrid', {}, name.el, nid.el, phone.el, src.el, rq.el, mil.el), dupBox, h('div.sap-formgrid', {}, K.canSal() ? sal.el : null, rel.el), K.canSal() ? null : K.lockNote('الراتب المتوقع T3 لا يُدخل ولا يظهر لك بدون hr.salary.view.'), priv.el),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'حفظ المرشح', kind: 'primary', icon: 'check', onClick: async () => {
        if (!grp.validate()) return; const v = nid.get().replace(/\s/g, ''); const p = K.parseNid(v); if (!p.ok) { nid.error(p.msg); return; }
        const ex = get('candidates').find((c) => c.nationalId === v);
        if (ex) { SA.audit('HR.CANDIDATE.DUPLICATE', { target: { type: 'candidate', id: ex.id, label: ex.name }, after: { newApplication: rq.get() } }); st.patch('candidates', ex.id, (x) => ({ applications: (x.applications || []).concat([{ requisitionId: rq.get(), appliedAt: new Date().toISOString(), source: src.get() }]), stage: x.stage === 'rejected' ? 'applied' : x.stage, requisitionId: x.stage === 'rejected' ? rq.get() : x.requisitionId, history: (x.history || []).concat([{ ts: new Date().toISOString(), stage: x.stage === 'rejected' ? 'applied' : x.stage, by: K.me().id, note: 'تقديم جديد' }]) })); m.close(); SA.toast('أُضيف تقديم جديد على السجل الحالي ' + ex.id + ' (لا مرشح مكرّر).', 'info', { ms: 6000 }); return; }
        m.setBusy(true);
        try { await SA.api(() => { const id = st.nextId('candidates', 'CD', 3); st.insert('candidates', { id, name: name.get().trim(), requisitionId: rq.get(), stage: 'applied', source: src.get(), appliedAt: new Date().toISOString(), nationalId: v, phone: phone.get(), expectedSalary: K.canSal() ? sal.get() : null, military: mil.get(), relativeOfEmpId: rel.get() || null, privacyConsent: true, scorecards: [], practicalTest: { status: 'pending' }, applications: [], history: [{ ts: new Date().toISOString(), stage: 'applied', by: K.me().id }] }); SA.audit('HR.CANDIDATE.CREATED', { target: { type: 'candidate', id, label: name.get().trim() }, after: { requisition: rq.get(), source: src.get(), nid: K.maskNid(v) } }); }); } catch (e) { m.setBusy(false); SA.fail(e); return; }
        m.setBusy(false); m.close(); SA.toast('تمت إضافة المرشح', 'success'); } })] });
  }

  /* ───── candidate drawer ───── */
  function openCandidate(id, tab0) {
    const c0 = st.find('candidates', id); if (!c0) { SA.toast('المرشح غير موجود', 'warn'); return; }
    let tab = tab0 || 'summary'; const body = h('div'); let dr, tabsApi; let revealed = false;
    if (K.canSal()) K.logSalaryView({ type: 'candidate', id: c0.id, label: c0.name }, 'عرض الراتب المتوقع في بطاقة المرشح');
    const draw = () => {
      const c = st.find('candidates', id); SA.clear(body); const p = posOf(c); const sc = c.scorecards || []; const mine = mySc(c); const a = avg(c);
      const nidShown = revealed ? c.nationalId : K.maskNid(c.nationalId); const np = K.parseNid(c.nationalId);
      if (tab === 'summary') body.append(
        c.stage === 'rejected' ? SA.alert('danger', h('b', {}, 'مرفوض: '), c.rejectReason || '—') : null, c.relativeOfEmpId ? SA.alert('warning', h('b', {}, 'قرابة بموظف: '), K.empName(c.relativeOfEmpId) + ' — لا يقيّمه قريبه ولا يعتمد قراره (تضارب مصالح).') : null,
        SA.kv([['الشاغر', reqTitle(c)], ['المرحلة', stageChip(c.stage)], ['المصدر', c.source], ['الهاتف', h('span.sap-hrc-mono', {}, c.phone)], ['الرقم القومي', h('span', {}, h('span.sap-hrc-mono', {}, nidShown), ' ', revealed ? null : SA.btn({ label: 'إظهار', kind: 'ghost', size: 'sm', icon: 'eye', onClick: async () => { const v = await K.revealNid(c); if (v) { revealed = true; draw(); } } }))], np.ok ? ['من الرقم القومي', np.gender + ' · ' + SA.fmt.date(np.dob) + ' · ' + np.gov] : null, ['موقف التجنيد', c.military || '—'], ['الراتب المتوقع (T3)', K.salaryNode(c.expectedSalary)], ['متوسط التقييم', a == null ? '—' : h('span.num', {}, a.toFixed(1) + ' / 5 (' + sc.length + ' تقييم)')], ['موافقة الخصوصية', c.privacyConsent ? SA.chip('مسجّلة', 'success') : SA.chip('غير مسجّلة', 'danger')], ['تقديمات أخرى', (c.applications || []).length ? (c.applications || []).map((x) => x.requisitionId).join('، ') : '—']]),
        needsTest(c) ? SA.alert(testOk(c) ? 'success' : 'warning', h('b', {}, 'بوابة الاختبار العملي: '), testOk(c) ? 'مجتازة' + (c.practicalTest.waived ? ' (بإعفاء)' : '') + ' — يمكن الانتقال للعرض.' : 'مطلوب اختبار عملي ناجح قبل العرض (وظيفة تشغيل).') : null);
      else if (tab === 'score') {
        const hidden = !mine && sc.length; const rows = mine ? sc : [];
        body.append(SA.alert('info', 'التقييم أعمى (Blind): ما ترى تقييمات الآخرين إلا بعد إرسال تقييمك، وبعد الإرسال لا تعديل إلا بإذن HR Manager (BR-ATS-09).'),
          hidden ? SA.card({}, h('p.t-muted', {}, SA.icon('lock', 'icon-sm'), ' يوجد ' + sc.length + ' تقييم مُرسل — مخفية حتى ترسل تقييمك.')) : null,
          rows.length ? h('div.sap-hrc', {}, rows.map((s) => SA.card({ title: SA.userName(s.interviewerId), tags: [SA.chip(REC[s.rec], s.rec === 'hire' ? 'success' : s.rec === 'no' ? 'danger' : 'warning')] }, SA.kv([['الجانب الفني', h('span.num', {}, s.scores.technical + ' / 5')], ['السلامة والالتزام', h('span.num', {}, s.scores.safety + ' / 5')], ['السلوك والتعاون', h('span.num', {}, s.scores.attitude + ' / 5')], ['ملاحظة', s.note || '—'], ['التاريخ', SA.fmt.dt(s.submittedAt)]])))) : null,
          !mine ? scoreForm(c, draw) : SA.alert('success', 'أرسلتَ تقييمك — لا تعديل إلا بإذن HR Manager.'));
      } else if (tab === 'test') {
        const t = c.practicalTest || { status: 'pending' };
        body.append(!needsTest(c) ? SA.alert('info', 'الاختبار العملي غير مطلوب لهذه الوظيفة (ليست وظيفة تشغيل).') : h('div.sap-hrc', {},
          SA.kv([['الحالة', SA.chip(t.status === 'passed' ? 'ناجح' : t.status === 'failed' ? 'راسب' : t.waived ? 'معفى' : 'لم يُجرَ بعد', t.status === 'passed' || t.waived ? 'success' : t.status === 'failed' ? 'danger' : 'warning')], t.score != null ? ['الدرجة', h('span.num', {}, t.score + ' / 100')] : null, t.by ? ['المسجِّل', SA.userName(t.by) + ' · ' + SA.fmt.rel(t.at)] : null, t.waived ? ['الإعفاء', t.waiveReason + ' — ' + SA.userName(t.waivedBy)] : null]),
          SA.alert('warning', h('b', {}, 'اختبار على ماكينة حية: '), 'إقرار مشاركة موقّع + معدات وقاية + إشراف مباشر. المسؤولية/التأمين أثناء الاختبار {Open} (قانوني).'),
          c.stage === 'rejected' ? null : testForm(c, draw)));
      } else body.append(h('ol.sap-hrc-chain', {}, (c.history || []).slice().reverse().map((x) => h('li', {}, h('span.sap-hrc-dot', {}, SA.icon('history', 'icon-sm')), h('div', {}, h('b', {}, SN[x.stage] || x.stage), h('div.t-muted', {}, SA.fmt.dt(x.ts) + ' · ' + (x.by === 'SYSTEM' ? 'النظام' : SA.userName(x.by)) + (x.note ? ' — ' + x.note : '')), x.reason ? h('small.t-muted', {}, x.reason) : null)))));
      const foot = dr.foot; SA.clear(foot); const order = STAGES.map((s) => s[0]); const idx = order.indexOf(c.stage); const nextS = idx >= 0 && idx < 4 ? order[idx + 1] : null;
      foot.append(h('button.btn.btn-ghost', { type: 'button', onclick: () => dr.close() }, 'إغلاق'),
        c.stage === 'rejected' ? SA.btn({ label: 'إعادة فتح (تقديم جديد)', kind: 'ghost', perm: 'hr.candidates.edit', onClick: () => { st.patch('candidates', id, (x) => ({ stage: 'applied', rejectReason: '', history: (x.history || []).concat([{ ts: new Date().toISOString(), stage: 'applied', by: K.me().id, note: 'إعادة فتح' }]) })); SA.audit('HR.CANDIDATE.STAGE_CHANGED', { target: { type: 'candidate', id, label: c.name }, before: { stage: 'مرفوض' }, after: { stage: 'جديد' }, reason: 'إعادة فتح' }); } }) : [SA.btn({ label: 'رفض', kind: 'danger', icon: 'xcircle', perm: 'hr.candidates.edit', reason: c.stage === 'hired' ? 'تم تعيينه' : '', onClick: () => rejectDialog(c) }), SA.btn({ label: 'نقل إلى…', kind: 'ghost', icon: 'swap', onClick: (e, b) => SA.menu(b, STAGES.filter((s) => s[0] !== 'hired' && s[0] !== c.stage).map((s) => ({ label: s[1], onClick: () => moveStage(st.find('candidates', id), s[0], { fromDrawer: true }) }))) }),
          c.stage === 'offer' ? SA.btn({ label: 'إعداد عرض', kind: 'primary', icon: 'doc', perm: 'hr.offers.create', onClick: () => { dr.close(); SA.nav('hr/offers/new', { query: { candidate: id } }); } }) : nextS ? SA.btn({ label: 'التالي: ' + SN[nextS], kind: 'primary', icon: 'arrowleft', perm: 'hr.candidates.edit', onClick: () => moveStage(st.find('candidates', id), nextS, { fromDrawer: true }) }) : null]);
    };
    tabsApi = SA.tabs({ tabs: [{ id: 'summary', label: 'الملخص' }, { id: 'score', label: 'التقييمات', badge: (c0.scorecards || []).length || null }, { id: 'test', label: 'الاختبار العملي' }, { id: 'hist', label: 'السجل' }], active: tab, onChange: (t) => { tab = t; draw(); } });
    dr = SA.drawer({ title: c0.name, subtitle: c0.id + ' · ' + reqTitle(c0), size: 'lg', tabs: tabsApi.el, body, foot: [h('span')] });
    if (tab0) tabsApi.setActive(tab0); draw(); const off = st.subscribe('candidates', () => { if (st.find('candidates', id)) draw(); }); dr.closed.then(off);
  }
  function scoreForm(c, redraw) {
    const me = K.myEmp(); const conflict = me && c.relativeOfEmpId === me.id;
    if (conflict) { return SA.alert('danger', h('b', {}, 'تضارب مصالح: '), 'المرشح مسجّل كقريب لك — لا تقيّمه (BR-ATS-15).'); }
    const v = { technical: 0, safety: 0, attitude: 0 }; const rec = SA.form.field({ name: 'rec', label: 'التوصية', type: 'select', required: true, options: [['', 'اختر…'], ['hire', REC.hire], ['hold', REC.hold], ['no', REC.no]] }); const note = SA.form.field({ name: 'note', label: 'ملاحظات', type: 'textarea', rows: 2 }); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    const row = (k, label) => { const wrap = h('div.sap-hrc-stars', { role: 'group', 'aria-label': label }); [1, 2, 3, 4, 5].forEach((n) => wrap.append(h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { v[k] = n; SA.$$('button', wrap).forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === n))); } }, n))); return h('div.field', {}, h('span.label', {}, label), wrap); };
    return SA.card({ title: 'تقييمي للمرشح (Scorecard)' }, row('technical', 'الجانب الفني / الخبرة'), row('safety', 'السلامة والالتزام'), row('attitude', 'السلوك والتعاون'), rec.el, note.el, err,
      SA.btn({ label: 'إرسال التقييم', kind: 'primary', icon: 'check', perm: 'hr.candidates.edit', onClick: async () => {
        if (!v.technical || !v.safety || !v.attitude) { err.hidden = false; err.textContent = 'قيّم الجوانب الثلاثة (1–5).'; return; } err.hidden = true; if (!rec.validate()) return;
        await SA.api(() => { st.patch('candidates', c.id, (x) => ({ scorecards: (x.scorecards || []).concat([{ id: SA.uid('SC'), interviewerId: K.me().id, scores: Object.assign({}, v), rec: rec.get(), note: note.get(), submittedAt: new Date().toISOString() }]) })); SA.audit('HR.CANDIDATE.SCORECARD', { target: { type: 'candidate', id: c.id, label: c.name }, after: { recommendation: REC[rec.get()] } }); }); SA.toast('تم إرسال التقييم — ظهرت لك تقييمات الآخرين.', 'success'); redraw(); } }));
  }
  function testForm(c, redraw) {
    const acks = [['إقرار مشاركة موقّع من المرشح'], ['معدات الوقاية الشخصية مُسلَّمة'], ['إشراف مباشر من مشغّل/مشرف مؤهل']]; const checks = acks.map((a) => h('input', { type: 'checkbox' }));
    const score = SA.form.field({ name: 's', label: 'الدرجة (0–100)', type: 'number', min: 0, max: 100 }); const res = SA.form.field({ name: 'r', label: 'النتيجة', type: 'select', options: [['', 'اختر…'], ['passed', 'ناجح'], ['failed', 'راسب']], required: true }); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    return h('div.sap-hrc', {}, SA.card({ title: 'تسجيل نتيجة الاختبار العملي' }, h('div.sap-choices', {}, acks.map((a, i) => h('label.sap-choice', {}, checks[i], h('span', {}, h('b', {}, a[0]))))), h('div.sap-formgrid', {}, res.el, score.el), err,
      SA.btn({ label: 'حفظ النتيجة', kind: 'primary', perm: 'hr.candidates.edit', onClick: async () => {
        if (!checks.every((x) => x.checked)) { err.hidden = false; err.textContent = 'أكّد الإقرار والمعدات والإشراف قبل تسجيل النتيجة (BR-ATS-10).'; return; } err.hidden = true; if (!res.validate()) return; const sc = score.get(); if (sc != null && (sc < 0 || sc > 100)) { score.error('الدرجة بين 0 و100.'); return; }
        await SA.api(() => { st.patch('candidates', c.id, { practicalTest: { status: res.get(), score: sc, by: K.me().id, at: new Date().toISOString(), ack: true } }); SA.audit('HR.CANDIDATE.TEST_RECORDED', { target: { type: 'candidate', id: c.id, label: c.name }, after: { result: res.get() === 'passed' ? 'ناجح' : 'راسب', score: sc } }); }); SA.toast(res.get() === 'passed' ? 'اجتاز الاختبار — يمكن الانتقال للعرض.' : 'راسب — يُنصح بالرفض بسبب «لم يجتز الاختبار العملي».', res.get() === 'passed' ? 'success' : 'warn'); redraw(); } })),
      testOk(c) ? null : SA.card({ title: 'إعفاء استثنائي' }, h('p.t-muted', {}, 'الإعفاء من الاختبار العملي قرار استثنائي لمن يملك اعتماد العروض، بسبب موثّق.'), SA.btn({ label: 'إعفاء من الاختبار', kind: 'ghost', perm: 'hr.offers.approve', onClick: async () => { const r = await SA.confirm({ title: 'إعفاء ' + c.name + ' من الاختبار العملي', confirmLabel: 'إعفاء', danger: true, reasonRequired: true, reasonLabel: 'سبب الإعفاء', impact: ['يتخطى بوابة الاختبار العملي قبل العرض في وظيفة تشغيل.', 'يُسجَّل كحدث عالي الخطورة.'] }); if (!r.ok) return; st.patch('candidates', c.id, (x) => ({ practicalTest: Object.assign({}, x.practicalTest, { waived: true, waiveReason: r.reason, waivedBy: K.me().id }) })); SA.audit('HR.CANDIDATE.TEST_WAIVED', { target: { type: 'candidate', id: c.id, label: c.name }, reason: r.reason }); redraw(); } })));
  }
  K.openCandidate = openCandidate;

  /* ───── board / table ───── */
  function render(root, ctx) {
    K.crumbs(ctx, 'hr-hire', 'المرشحون');
    const S = { view: ctx.params.view || 'board', req: ctx.params.req || '' };
    let opened = false;
    return K.mount(root, ctx, { perm: 'hr.candidates.view', skel: 'cards', paths: ['candidates', 'requisitions', 'positions', 'meta.hrCoreTick'], build() {
      const reqs = get('requisitions').filter((r) => r.status === 'open' || get('candidates').some((c) => c.requisitionId === r.id));
      const all = get('candidates').filter((c) => !S.req || c.requisitionId === S.req); const active = all.filter((c) => c.stage !== 'rejected'); const rej = all.filter((c) => c.stage === 'rejected');
      if (ctx.path[0] && !opened) { opened = true; setTimeout(() => openCandidate(ctx.path[0], ctx.params.tab), 0); }
      const reqSel = h('select.select', { 'aria-label': 'الشاغر', onchange: (e) => { S.req = e.target.value; K.tick(); } }, h('option', { value: '' }, 'كل الشواغر'), reqs.map((r) => h('option', { value: r.id, selected: r.id === S.req }, (K.posTitle(r.positionId) !== '—' ? K.posTitle(r.positionId) : r.newPositionTitle) + ' — ' + r.id)));
      const head = SA.pageHead({ title: 'المرشحون والاستقطاب', desc: 'لوحة المراحل وجدول المرشحين لكل شاغر معتمد. حراسات: مقابلة قبل الاختبار، اختبار عملي ناجح قبل العرض، لا تكرار بنفس الرقم القومي.', tags: [SA.tag('new', 'HR-03')], actions: [K.spec('hr-acquire.html', 'scr-ats-03'), SA.btn({ label: 'إضافة مرشح', icon: 'plus', kind: 'primary', perm: 'hr.candidates.create', onClick: () => addCandidate(S.req) })] });
      const toolbar = h('div.sap-hrc-hdr', {}, h('label.sap-psize', {}, 'الشاغر', reqSel), SA.segmented([['board', 'لوحة المراحل'], ['table', 'جدول']], S.view, (v) => { S.view = v; K.tick(); }), h('span.sap-statrow', {}, STAGES.slice(0, 5).map((s) => h('span', {}, h('b.num', {}, active.filter((c) => c.stage === s[0]).length), s[1]))));
      if (!reqs.length && !get('candidates').length) return h('div.sap-hrc', {}, head, SA.card({}, SA.empty({ icon: 'users', title: 'لا شواغر مفتوحة ولا مرشحين', text: 'يظهر المرشحون بعد اعتماد طلب توظيف.', action: { label: 'طلبات التوظيف', onClick: () => SA.nav('hr/requisitions') } })));
      let content;
      if (S.view === 'table') {
        const t = K.table({ caption: 'المرشحون', rows: () => get('candidates').filter((c) => !S.req || c.requisitionId === S.req), pageSize: 10, search: { placeholder: 'ابحث بالاسم أو الهاتف…', keys: ['name', 'phone', 'id'] }, filters: [{ key: 'stage', label: 'المرحلة', options: Object.keys(SN).map((k) => [k, SN[k]]) }, { key: 'source', label: 'المصدر', options: SRC.map((x) => [x, x]) }],
          columns: [{ key: 'name', label: 'المرشح', sort: true, render: (c) => h('div', {}, h('b', {}, c.name), h('small.t-muted', {}, c.id + ' · ' + c.phone)) }, { key: 'req', label: 'الشاغر', render: (c) => reqTitle(c) }, { key: 'stage', label: 'المرحلة', sort: true, render: (c) => stageChip(c.stage) }, { key: 'source', label: 'المصدر' }, { key: 'sc', label: 'التقييم', sort: true, value: (c) => avg(c) || 0, render: (c) => (avg(c) == null ? '—' : h('span.num', {}, avg(c).toFixed(1))) }, { key: 'test', label: 'الاختبار', render: (c) => (needsTest(c) ? SA.chip(c.practicalTest && c.practicalTest.status === 'passed' ? 'ناجح' : c.practicalTest && c.practicalTest.waived ? 'معفى' : c.practicalTest && c.practicalTest.status === 'failed' ? 'راسب' : 'مطلوب', testOk(c) ? 'success' : c.practicalTest && c.practicalTest.status === 'failed' ? 'danger' : 'warning') : '—') }, { key: 'at', label: 'التقديم', sort: true, value: (c) => c.appliedAt, render: (c) => SA.fmt.date(c.appliedAt) }],
          onRowClick: (c) => openCandidate(c.id), rowActions: (c) => [{ label: 'فتح البطاقة', icon: 'user', onClick: () => openCandidate(c.id) }, { label: 'رفض', icon: 'xcircle', danger: true, disabled: SA.can('hr.candidates.edit') ? false : 'ليست من صلاحياتك', onClick: () => rejectDialog(c) }], empty: { icon: 'users', title: 'لا مرشحين مطابقين', text: 'أضف مرشحًا أو غيّر الفلتر.', action: { label: 'إضافة مرشح', perm: 'hr.candidates.create', onClick: () => addCandidate(S.req) } } });
        content = SA.card({ flush: true }, t.el);
      } else {
        const cols = STAGES.map((s) => {
          const items = active.filter((c) => c.stage === s[0]); const col = h('div.sap-hrc-col', { role: 'list', 'aria-label': s[1], dataset: { stage: s[0] } });
          col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('is-over'); }); col.addEventListener('dragleave', () => col.classList.remove('is-over'));
          col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('is-over'); const id = e.dataTransfer.getData('text/plain'); const c = st.find('candidates', id); if (c) moveStage(c, s[0]); });
          col.append(h('header', {}, s[1], h('span.sap-count', {}, items.length)), h('div.list', {}, items.length ? items.map(card) : h('small.t-muted', { style: { padding: '8px' } }, s[0] === 'hired' ? 'تظهر هنا بعد تحويل العرض لموظف' : 'لا مرشحين')));
          return col;
        });
        content = h('div.sap-hrc', {}, h('div.sap-hrc-kanban', {}, cols), rej.length ? SA.card({ title: 'مرفوضون (' + rej.length + ')' }, h('div.cluster', {}, rej.map((c) => h('button.sap-fchip', { type: 'button', onclick: () => openCandidate(c.id), title: c.rejectReason }, c.name + ' — ' + (c.rejectReason || '').slice(0, 24))))) : null, SA.alert('info', 'اسحب البطاقة بين الأعمدة، أو افتحها واستخدم «نقل إلى…» (متاح بالكيبورد). نتيجة «تم التعيين» لا تُسحب إليها — تأتي من تحويل العرض.'));
      }
      return h('div.sap-hrc', {}, head, toolbar, content);
    } });
    function card(c) {
      const a = avg(c); const b = h('div.sap-hrc-card', { role: 'listitem', tabindex: '0', draggable: 'true', onclick: () => openCandidate(c.id), onkeydown: (e) => { if (e.key === 'Enter') openCandidate(c.id); }, ondragstart: (e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; b.classList.add('is-drag'); }, ondragend: () => b.classList.remove('is-drag') },
        h('b', {}, c.name), h('small', {}, reqTitle(c)), h('div.cluster', {}, h('small', {}, c.source), a != null ? SA.chip('★ ' + a.toFixed(1), 'info') : null, needsTest(c) ? SA.chip(testOk(c) ? 'اختبار ✓' : c.practicalTest && c.practicalTest.status === 'failed' ? 'راسب' : 'اختبار مطلوب', testOk(c) ? 'success' : c.practicalTest && c.practicalTest.status === 'failed' ? 'danger' : 'warning') : null, c.relativeOfEmpId ? SA.chip('قرابة', 'warning') : null));
      return b;
    }
  }
  SA.register(Object.assign({}, K.NAV('hr-candidates'), { app: 'hr', render, stub: false }));
})();
/* ───────────────────────── part 5 — HR-04 العروض والعقود وما قبل التعيين (offer → medical → documents → contract → employee) ───────────────────────── */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store, K = SA.hrCore, get = K.get;
  const CT = { indefinite: 'غير محدد المدة', fixed: 'محدد المدة', task: 'محدد بمهمة' };
  const OS = { draft: ['مسودة', 'neutral'], pending_approval: ['بانتظار الاعتماد', 'warning'], returned: ['معاد للتعديل', 'info'], approved: ['معتمد — لم يُرسل', 'success'], sent: ['أُرسل للمرشح', 'info'], accepted: ['قبله المرشح', 'success'], declined: ['رفضه المرشح', 'danger'], expired: ['منتهي', 'neutral'], converted: ['تحوّل لموظف', 'success'], cancelled: ['ملغى', 'neutral'] };
  const MED = { pending: ['لم يُسجَّل', 'warning'], fit: ['لائق', 'success'], fit_restricted: ['لائق بقيود', 'info'], unfit: ['غير لائق', 'danger'] };
  const offChip = (o) => { const s = effStatus(o); return SA.chip(OS[s][0], OS[s][1]); };
  const effStatus = (o) => (o.status === 'sent' && o.validUntil && new Date(o.validUntil) < new Date(K.ymd(new Date())) ? 'expired' : o.status);
  const candOf = (o) => st.find('candidates', o.candidateId);
  const posOf = (o) => st.find('positions', o.positionId);
  const total = (o) => (o.salary && o.salary.basic != null ? (o.salary.basic || 0) + (o.salary.allowances || 0) : null);
  const bandOf = (o) => { const t = total(o), p = posOf(o); if (t == null || !p || !p.salaryBand || p.salaryBand.min == null) return null; return t < p.salaryBand.min ? 'under' : t > p.salaryBand.max ? 'above' : 'within'; };
  const bandChip = (b) => (b ? SA.chip(b === 'within' ? 'ضمن الشريحة' : b === 'above' ? 'فوق الشريحة' : 'تحت الشريحة', b === 'within' ? 'success' : b === 'above' ? 'danger' : 'warning') : SA.chip('لم يُحدَّد', 'neutral'));
  const bandPct = (o) => { const t = total(o), p = posOf(o); if (t == null || !p || !p.salaryBand) return null; const b = bandOf(o); return b === 'above' ? Math.round((t - p.salaryBand.max) / p.salaryBand.max * 100) : b === 'under' ? Math.round((p.salaryBand.min - t) / p.salaryBand.min * 100) : 0; };
  const art89 = (o) => { const c = candOf(o), p = posOf(o), a = (o.contract && o.contract.art89) || {}, d = (o.docs || []).find((x) => x.key === 'HD-01'); const co = st.get('settings.company') || {};
    return [['تاريخ البدء', !!o.startDate], ['اسم صاحب العمل وعنوانه', !!(co.name || co.legalName || true)], ['اسم العامل', !!c], ['المؤهل', !!a.qualification], ['المهنة', !!p], ['رقم التأمين (أو «قيد التسجيل»)', !!a.insuranceNo], ['محل الإقامة', !!a.residence], ['إثبات الشخصية (HD-01)', !!(d && (d.status === 'received'))], ['طبيعة العمل (الوصف الوظيفي)', !!(p && p.jd)], ['الأجر المتفق عليه', total(o) != null], ['كيفية وموعد الدفع', !!a.payMethod], ['المزايا النقدية والعينية', !!a.benefits]]; };
  K.contractWarnings = function (o) {
    const w = []; const prob = K.legal('probation_max_days'), mw = K.legal('min_wage_monthly'), ft = K.legal('fixed_term_max_before_early_exit'), np = K.legal('notice_period_days');
    const tag = (l) => (l.status === 'approved' ? '' : ' [Law · Pending]');
    if (prob.n != null && o.probationDays > prob.n) w.push({ lvl: 'danger', block: true, text: 'فترة الاختبار ' + o.probationDays + ' يوم تتجاوز الحد الأقصى المُعدّ (' + prob.n + ' يومًا، مرة واحدة مع نفس صاحب العمل — م 90)' + tag(prob) + '. لا تمديد فوق الحد.' });
    else if (prob.n != null) w.push({ lvl: 'info', text: 'فترة الاختبار ' + o.probationDays + ' يوم ضمن الحد (' + prob.n + ') — مرة واحدة فقط، والتنبيه عند اليوم 80' + tag(prob) + '.' });
    const t = total(o); if (mw.n != null && t != null && t < mw.n) w.push({ lvl: 'danger', block: true, text: 'الإجمالي النقدي أقل من الحد الأدنى للأجور المُعدّ (' + SA.fmt.money(mw.n) + '/شهر)' + tag(mw) + ' — هل الحد على الإجمالي أم الأساسي: {Open}.' });
    if (o.contractType === 'fixed') {
      if (!o.endDate) w.push({ lvl: 'danger', block: true, text: 'العقد محدد المدة يتطلب تاريخ نهاية وتبريرًا (م 87/88).' });
      else { const years = (new Date(o.endDate) - new Date(o.startDate)) / (365.25 * 864e5); if (ft.n != null && years > ft.n) w.push({ lvl: 'warning', text: 'مدة العقد ' + years.toFixed(1) + ' سنة تتجاوز ' + ft.n + ' سنوات: للعامل الإنهاء بدون تعويض بإخطار 3 أشهر، ولصاحب العمل التعويض {شهر عن كل سنة} (م 154)' + tag(ft) + '.' }); }
      if (!(o.justification || '').trim()) w.push({ lvl: 'danger', block: true, text: 'تبرير العقد محدد المدة إلزامي (اقتضاء طبيعة العمل).' });
      w.push({ lvl: 'info', text: 'التجديد باتفاق كتابي؛ الاستمرار بعد الانتهاء دون كتابة = عقد غير محدد المدة (م 88)' + tag(ft) + '.' });
    }
    if (o.contractType === 'task') w.push({ lvl: 'info', text: 'عقد المهمة: لو تجاوزت 5 سنوات لا ينصرف العامل قبل الإنجاز (م 155) [Law · Pending].' });
    w.push({ lvl: 'info', text: 'مدة الإخطار ' + (np.n != null ? np.n + ' يومًا للطرفين' : '{Open}') + ' (م 156)' + tag(np) + ' — يجوز الزيادة تعاقديًا لا النقص.' });
    w.push({ lvl: 'info', text: 'العقد بالعربية في 4 نسخ: صاحب العمل · العامل · مكتب التأمينات · الجهة الإدارية (م 89). ممنوع أي نوع مستند «استقالة/تنازل» في ملف التعيين (م 167).' });
    return w;
  };
  K._offerOutcome = function (a) {
    const o = st.find('offers', a.ref.id); if (!o || o.status !== 'pending_approval') return; const last = a.chain.slice().reverse().find((c) => c.decidedBy) || {}; const c = candOf(o);
    if (a.status === 'approved') { st.patch('offers', o.id, (x) => ({ status: 'approved', log: (x.log || []).concat([{ ts: new Date().toISOString(), text: 'اعتُمد العرض', by: last.decidedBy }]) })); SA.audit('HR.OFFER.APPROVED', { target: { type: 'offer', id: o.id, label: (c ? c.name : '') + ' — ' + K.posTitle(o.positionId) }, after: { status: 'approved', band: bandOf(o) === 'within' ? 'ضمن الشريحة' : bandOf(o) === 'above' ? 'فوق الشريحة' : 'تحت الشريحة' }, reason: last.reason || '' }); SA.notify({ title: 'اعتُمد العرض ' + o.id, body: 'جاهز للإرسال للمرشح ' + (c ? c.name : ''), level: 'action', toUsers: [o.createdBy], link: '#/hr/offers/' + o.id }); }
    else { st.patch('offers', o.id, (x) => ({ status: 'returned', returnReason: last.reason || '', log: (x.log || []).concat([{ ts: new Date().toISOString(), text: (a.status === 'rejected' ? 'رُفض' : 'أُعيد للتعديل') + ': ' + (last.reason || ''), by: last.decidedBy }]) })); SA.notify({ title: (a.status === 'rejected' ? 'رُفض العرض ' : 'أُعيد العرض للتعديل ') + o.id, body: last.reason || '', level: 'action', toUsers: [o.createdBy], link: '#/hr/offers/' + o.id }); }
  };

  /* ───── wizard ───── */
  function wizard(root, ctx) {
    K.crumbs(ctx, 'hr-hire', 'عرض جديد');
    const box = h('div.sap-hrc'); root.append(box);
    const elig = get('candidates').filter((c) => c.stage === 'offer' && !get('offers').some((o) => o.candidateId === c.id && ['draft', 'pending_approval', 'returned', 'approved', 'sent', 'accepted'].indexOf(o.status) >= 0));
    const S = { step: 0, d: { cand: ctx.params.candidate || '', ct: 'indefinite', end: '', just: '', start: '', prob: K.legal('probation_max_days').n || 90, basic: null, allow: null } };
    let f = {};
    function draw() {
      SA.clear(box); const d = S.d;
      box.append(SA.pageHead({ title: 'عرض عمل جديد', desc: 'المرشح يصل هنا من مرحلة «عرض» بعد اجتياز الاختبار العملي. الأجر حقل حساس (T3).', back: { label: 'العروض والعقود', href: SA.href('hr/offers') } }), SA.stepper(['المرشح والعقد', 'الأجر والشريحة', 'المراجعة'], S.step));
      let body;
      if (S.step === 0) {
        f.cand = SA.form.field({ name: 'c', label: 'المرشح (مرحلة «عرض»)', type: 'select', required: true, value: d.cand, options: [['', 'اختر المرشح…']].concat(elig.map((c) => [c.id, c.name + ' — ' + (K.posTitle((st.find('requisitions', c.requisitionId) || {}).positionId)) + ' (' + c.id + ')'])) });
        f.ct = SA.form.field({ name: 'ct', label: 'نوع العقد', type: 'select', value: d.ct, options: Object.keys(CT).map((k) => [k, CT[k] + (k === 'indefinite' ? ' (الأصل)' : '')]), onChange: (v) => { collect(); d.ct = v; draw(); } });
        f.start = SA.form.field({ name: 's', label: 'تاريخ المباشرة', type: 'date', required: true, value: d.start });
        f.prob = SA.form.field({ name: 'p', label: 'فترة الاختبار (أيام)', type: 'number', min: 0, required: true, value: d.prob, hint: 'الحد الأقصى من الإعداد القانوني: ' + (K.legal('probation_max_days').n != null ? K.legal('probation_max_days').n + ' يومًا [Law · Pending]' : '{Open}') });
        f.end = SA.form.field({ name: 'e', label: 'تاريخ نهاية العقد', type: 'date', required: true, value: d.end });
        f.just = SA.form.field({ name: 'j', label: 'تبرير العقد محدد المدة', type: 'textarea', rows: 2, required: true, value: d.just });
        const list = [f.cand, f.ct, f.start, f.prob].concat(d.ct === 'fixed' ? [f.end, f.just] : []); const grp = SA.form.group(list);
        const warn = h('div'); const w = K.contractWarnings({ contractType: d.ct, probationDays: d.prob, endDate: d.end, startDate: d.start || K.ymd(new Date()), justification: d.just, salary: null });
        warn.append(SA.card({ title: 'تحذيرات العقد حسب المادة 89 وما حولها', tags: [SA.tag('pending', 'Law · قابلة للتعديل بتاريخ سريان')], actions: [h('a.sap-linkbtn', { href: SA.href('hr/compliance?tab=registry') }, 'تعديل الحدود')] }, h('ul.sap-hrc-chk', {}, w.map((x) => h('li', {}, h('span.t', {}, h('span', {}, SA.chip(x.lvl === 'danger' ? 'يمنع' : x.lvl === 'warning' ? 'تحذير' : 'معلومة', x.lvl === 'danger' ? 'danger' : x.lvl === 'warning' ? 'warning' : 'info'), ' ', x.text)))))));
        body = [h('div.sap-formgrid', {}, f.cand.el, f.ct.el, f.start.el, f.prob.el, d.ct === 'fixed' ? f.end.el : null), d.ct === 'fixed' ? f.just.el : null, elig.length ? null : SA.alert('warning', 'لا يوجد مرشحون في مرحلة «عرض» — انقل مرشحًا (اجتاز الاختبار العملي) إلى «عرض» أولًا.'), warn];
        S.next = () => { if (!grp.validate()) return; collect(); const ws = K.contractWarnings({ contractType: d.ct, probationDays: d.prob, endDate: d.end, startDate: d.start, justification: d.just, salary: null }).filter((x) => x.block); if (ws.length) { SA.toast(ws[0].text, 'error', { ms: 6500 }); return; } if (new Date(d.start) < new Date(K.ymd(new Date()))) { f.start.error('تاريخ المباشرة في الماضي.'); return; } S.step = 1; draw(); };
      } else if (S.step === 1) {
        const c = st.find('candidates', d.cand); const r = c && st.find('requisitions', c.requisitionId); const p = r && st.find('positions', r.positionId);
        f.basic = SA.form.field({ name: 'b', label: 'الأجر الأساسي (ج.م/شهر)', type: 'number', min: 0, required: K.canSal(), value: d.basic == null ? '' : d.basic }); f.allow = SA.form.field({ name: 'a', label: 'البدلات (ج.م/شهر)', type: 'number', min: 0, value: d.allow == null ? '' : d.allow });
        const prev = h('div'); const upd = () => { SA.clear(prev); const o = { salary: { basic: f.basic.get(), allowances: f.allow.get() || 0 }, positionId: p && p.id, probationDays: d.prob, contractType: d.ct, startDate: d.start, endDate: d.end, justification: d.just }; if (o.salary.basic == null) return; const b = bandOf(o); prev.append(h('div.cluster', {}, 'الإجمالي: ', h('b.num', {}, SA.fmt.money(total(o))), bandChip(b), b && b !== 'within' ? h('small.t-muted', {}, 'فرق ' + bandPct(o) + '% عن الشريحة' + (b === 'above' ? ' — يضيف خطوة المدير العام' : '')) : null), K.contractWarnings(o).filter((x) => x.lvl !== 'info').map((x) => SA.alert(x.lvl, x.text))); };
        f.basic.input.addEventListener('input', upd); f.allow.input.addEventListener('input', upd);
        body = K.canSal() ? [SA.card({ title: 'الأجر المعروض (T3)', tags: SA.tag('pending', 'بند 46') }, h('div.sap-formgrid', {}, f.basic.el, f.allow.el), p && p.salaryBand && p.salaryBand.min != null ? h('p.t-muted', {}, 'شريحة الوظيفة الساريّة: ' + SA.fmt.money(p.salaryBand.min) + ' – ' + SA.fmt.money(p.salaryBand.max) + ' (تجريبية)') : h('p.t-muted', {}, 'لا شريحة مُدخلة للوظيفة.'), prev)] : [SA.alert('warning', h('b', {}, 'الأجر سري: '), 'إدخال الأجر يتطلب hr.salary.view (منح صريح — بند 46). تُنشأ مسودة بدون أجر ويُكمل الأجر من يملك الصلاحية (BR-OFR-03).'), SA.card({}, K.lockNote('الأجر المعروض T3 مخفي.'))];
        S.next = () => { if (K.canSal()) { if (!f.basic.validate()) return; d.basic = f.basic.get(); d.allow = f.allow.get() || 0; const ws = K.contractWarnings({ salary: { basic: d.basic, allowances: d.allow }, positionId: p && p.id, probationDays: d.prob, contractType: d.ct, startDate: d.start, endDate: d.end, justification: d.just }).filter((x) => x.block); if (ws.length) { SA.toast(ws[0].text, 'error', { ms: 6500 }); return; } } S.step = 2; draw(); };
        setTimeout(upd, 0);
      } else {
        const c = st.find('candidates', d.cand); const r = st.find('requisitions', c.requisitionId); const p = st.find('positions', r.positionId);
        const o = { salary: d.basic == null ? null : { basic: d.basic, allowances: d.allow }, positionId: p.id }; const b = bandOf(o);
        body = [SA.card({ title: 'مراجعة العرض' }, SA.kv([['المرشح', h('b', {}, c.name)], ['الوظيفة / القسم', p.title + ' — ' + SA.deptName(p.departmentId)], ['نوع العقد', CT[d.ct] + (d.ct === 'fixed' ? ' حتى ' + SA.fmt.date(d.end) : '')], ['تاريخ المباشرة', SA.fmt.date(d.start)], ['فترة الاختبار', d.prob + ' يوم'], ['الأجر', d.basic == null ? SA.chip('لم يُحدَّد — يُكمله من يملك hr.salary.view', 'warning') : K.salaryNode(d.basic + (d.allow || 0))], ['مقارنة الشريحة', bandChip(b)]])),
          SA.card({ title: 'مسار الاعتماد' }, h('ol.sap-hrc-chain', {}, [['المُعِدّ: ' + K.me().name, 'يجهّز العرض (لا يعتمده)'], ['مدير الموارد البشرية (HR Manager)', 'يراجع الشريحة والشروط'], b === 'above' ? ['المدير العام (فوق الشريحة / استثناء)', 'خطوة إضافية'] : null].filter(Boolean).map((x, i) => h('li', {}, h('span.sap-hrc-dot', {}, i + 1), h('div', {}, h('b', {}, x[0]), h('div.t-muted', {}, x[1])))))),
          d.basic == null ? SA.alert('info', 'سيُحفظ العرض كمسودة. الإرسال للاعتماد بعد تحديد الأجر.') : null];
        S.next = save; S.o = o; S.p = p; S.c = c; S.r = r; S.b = b;
      }
      box.append(SA.card({}, body), h('div.sap-wiz-foot', {}, S.step > 0 ? h('button.btn.btn-ghost', { type: 'button', onclick: () => { S.step--; draw(); } }, 'السابق') : h('a.btn.btn-ghost', { href: SA.href('hr/offers') }, 'إلغاء'), SA.btn({ label: S.step === 2 ? (S.d.basic == null ? 'حفظ كمسودة' : 'حفظ وإرسال للاعتماد') : 'التالي', kind: S.step === 2 ? 'accent' : 'primary', onClick: () => S.next() })));
    }
    function collect() { const d = S.d; try { d.cand = f.cand.get(); d.ct = f.ct.get(); d.start = f.start.get(); d.prob = f.prob.get(); d.end = f.end.get(); d.just = f.just.get(); } catch (e) { /* noop */ } }
    async function save() {
      const d = S.d, c = S.c, p = S.p, r = S.r; let rec;
      try { rec = await SA.api(() => { const id = st.nextId('offers', 'OF-2026', 4); const o = { id, candidateId: c.id, requisitionId: r.id, positionId: p.id, departmentId: p.departmentId, contractType: d.ct, endDate: d.ct === 'fixed' ? d.end : null, justification: d.just || '', startDate: d.start, probationDays: d.prob, salary: d.basic == null ? null : { basic: d.basic, allowances: d.allow || 0, demo: true }, status: 'draft', approvalId: null, createdBy: K.me().id, createdAt: new Date().toISOString(), medical: { status: 'pending' }, docs: K.defaultDocs(), contract: { signed: false, art89: {} }, convertedEmployeeId: null, log: [{ ts: new Date().toISOString(), text: 'أُعدّ العرض', by: K.me().id }] }; st.insert('offers', o, true); SA.audit('HR.OFFER.CREATED', { target: { type: 'offer', id, label: c.name + ' — ' + p.title }, after: { contract: CT[d.ct], start: d.start } }); return o; }); } catch (e) { SA.fail(e); return; }
      if (rec.salary) await submit(rec.id, true);
      SA.toast('تم حفظ العرض ' + rec.id, 'success'); SA.nav('hr/offers/' + rec.id);
    }
    draw(); return () => box.remove();
  }
  async function submit(id, silent) {
    const o = st.find('offers', id); const c = candOf(o); if (total(o) == null) { SA.toast('حدّد الأجر أولًا (hr.salary.view).', 'warn'); return false; }
    const ws = K.contractWarnings(o).filter((x) => x.block); if (ws.length) { SA.toast(ws[0].text, 'error', { ms: 6500 }); return false; }
    try { await SA.api(() => { const b = bandOf(o); const chain = [{ roleId: 'R-11', label: 'مدير الموارد البشرية (مراجعة الشريحة)' }]; if (b === 'above') chain.push({ roleId: 'R-02', label: 'المدير العام (فوق الشريحة)' }); const a = SA.requestApproval({ type: 'job_offer', title: 'عرض وظيفي ' + o.id + ' — ' + c.name + ' (' + K.posTitle(o.positionId) + ')', chain, context: [['المرشح', c.name], ['الوظيفة', K.posTitle(o.positionId)], ['مقارنة الشريحة', b === 'within' ? 'ضمن الشريحة' : b === 'above' ? 'فوق الشريحة بنسبة ' + bandPct(o) + '%' : 'تحت الشريحة'], ['نوع العقد', CT[o.contractType]], ['ملاحظة', 'قيمة الأجر مخفية لمن لا يملك hr.salary.view']], ref: { type: 'job_offer', id: o.id } }); st.patch('offers', o.id, (x) => ({ status: 'pending_approval', approvalId: a.id, bandResult: b, log: (x.log || []).concat([{ ts: new Date().toISOString(), text: 'أُرسل للاعتماد', by: K.me().id }]) })); SA.audit('HR.OFFER.SUBMITTED', { target: { type: 'offer', id: o.id, label: c.name }, after: { band: b } }); }); if (!silent) SA.toast('أُرسل العرض للاعتماد', 'success'); return true; } catch (e) { SA.fail(e); return false; }
  }

  /* ───── detail ───── */
  const logged = new Set();
  function convertChecks(o) {
    const docsOk = (o.docs || []).filter((d) => d.required).every((d) => d.status === 'received' || d.status === 'waived'); const c = candOf(o); const dup = c && get('employees').find((e) => e.status !== 'terminated' && e.preboarding && e.preboarding.candidateId === c.id);
    return [['عرض مقبول', o.status === 'accepted'], ['لياقة طبية (لائق / لائق بقيود)', o.medical.status === 'fit' || o.medical.status === 'fit_restricted'], ['المستندات الإلزامية مكتملة أو معفاة', docsOk], ['بيانات العقد (م 89) مكتملة', art89(o).every((x) => x[1])], ['عقد موقّع', !!(o.contract && o.contract.signed)], ['تاريخ مباشرة محدد', !!o.startDate], ['لا تطابق مع موظف نشط', !dup]];
  }
  function detail(root, ctx, id) {
    K.crumbs(ctx, 'hr-hire', 'العروض والعقود');
    return K.mount(root, ctx, { perm: 'hr.offers.view', skel: 'detail', paths: ['offers', 'approvals', 'candidates', 'employees', 'requisitions', 'hrLegal'], build() {
      const o = st.find('offers', id); if (!o) return SA.card({}, SA.empty({ icon: 'search', title: 'العرض غير موجود', text: id, action: { label: 'رجوع', icon: 'arrowright', onClick: () => SA.nav('hr/offers') } }));
      const c = candOf(o), p = posOf(o), a = o.approvalId ? st.find('approvals', o.approvalId) : null; const s = effStatus(o); if (K.canSal() && total(o) != null && !logged.has(o.id)) { logged.add(o.id); K.logSalaryView({ type: 'offer', id: o.id, label: c ? c.name : '' }, 'عرض أجر العرض'); }
      const checks = convertChecks(o); const miss = checks.find((x) => !x[1]); const canMed = SA.can('hr.medical.view'); const warns = K.contractWarnings(o); const a89 = art89(o);
      const actions = [];
      if (s === 'draft' || s === 'returned') actions.push(SA.btn({ label: 'إرسال للاعتماد', kind: 'primary', icon: 'check', perm: 'hr.offers.create', reason: total(o) == null ? 'حدّد الأجر أولًا' : '', onClick: () => submit(o.id) }));
      if (s === 'pending_approval' && a) actions.push(SA.btn({ label: 'قرار الاعتماد', kind: 'primary', icon: 'checkcircle', perm: 'hr.offers.approve', onClick: () => K.decisionDialog(a, 'عرض ' + (c ? c.name : '')) }));
      if (s === 'approved') actions.push(SA.btn({ label: 'إرسال العرض للمرشح', kind: 'primary', icon: 'mail', perm: 'hr.offers.create', onClick: async () => { const r = await SA.confirm({ title: 'إرسال العرض إلى ' + (c ? c.name : ''), confirmLabel: 'إرسال', impact: ['صلاحية العرض ' + 3 + ' أيام (مقترح — {Open}) وبعدها «منتهي».', 'أي تعديل جوهري بعد الاعتماد = إصدار جديد (BR-OFR-05).'] }); if (!r.ok) return; st.patch('offers', o.id, (x) => ({ status: 'sent', sentAt: new Date().toISOString(), validUntil: K.ymd(K.addDays(new Date(), 3)), log: (x.log || []).concat([{ ts: new Date().toISOString(), text: 'أُرسل للمرشح', by: K.me().id }]) })); SA.audit('HR.OFFER.SENT', { target: { type: 'offer', id: o.id, label: c.name } }); SA.toast('تم إرسال العرض (محاكاة — رابط عام للمرشح في الإنتاج)', 'success'); } }));
      if (s === 'sent' || s === 'expired') actions.push(SA.btn({ label: 'تسجيل رد المرشح', kind: 'primary', icon: 'swap', perm: 'hr.offers.create', onClick: () => respond(o) }));
      if (s === 'accepted') actions.push(SA.btn({ label: 'تحويل إلى موظف', kind: 'accent', icon: 'userplus', perm: 'hr.offers.create', reason: miss ? 'غير مكتمل: ' + miss[0] : '', onClick: () => convert(o.id) }));
      if (s === 'converted') actions.push(SA.btn({ label: 'متابعة في التعيين والتجربة', kind: 'primary', icon: 'arrowleft', onClick: () => SA.nav('hr/onboarding', { query: { employee: o.convertedEmployeeId } }) }));
      return h('div.sap-hrc', {}, SA.pageHead({ title: 'عرض ' + o.id + ' — ' + (c ? c.name : ''), tags: [offChip(o), SA.tag('new', 'HR-04')], back: { label: 'العروض والعقود', href: SA.href('hr/offers') }, desc: K.posTitle(o.positionId) + ' — ' + SA.deptName(o.departmentId), actions }),
        o.returnReason ? SA.alert('warning', h('b', {}, 'أُعيد للتعديل: '), o.returnReason) : null, o.medical.status === 'unfit' ? SA.alert('danger', h('b', {}, 'غير لائق طبيًا: '), 'العرض متوقف — لا يمكن التحويل لموظف (BR-OFR-06).') : null,
        s === 'converted' ? SA.alert('success', h('b', {}, 'تحوّل لموظف: '), K.empName(o.convertedEmployeeId) + ' — الحالة «ما قبل التعيين» وسُلّم لمسار التعيين والتجربة.') : null,
        h('div.sap-hrc-split', {}, h('div.sap-hrc', {},
          SA.card({ title: 'ملخص العرض' }, SA.kv([['المرشح', c ? h('a', { href: SA.href('hr/candidates/' + c.id) }, c.name) : '—'], ['نوع العقد', SA.chip(CT[o.contractType], 'info') ], o.endDate ? ['نهاية العقد', SA.fmt.date(o.endDate) + ' — ' + o.justification] : null, ['تاريخ المباشرة', SA.fmt.date(o.startDate)], ['فترة الاختبار', o.probationDays + ' يوم'], ['الأجر المعروض (T3)', h('span.cluster', {}, K.salaryNode(total(o)), K.canSal() ? null : null)], ['مقارنة الشريحة', h('span.cluster', {}, bandChip(bandOf(o)), bandOf(o) && bandOf(o) !== 'within' ? h('small.t-muted', {}, bandPct(o) + '% عن الشريحة') : null)], o.validUntil ? ['صلاحية العرض', SA.fmt.date(o.validUntil)] : null]),
            (s === 'draft' || s === 'returned') ? SA.btn({ label: total(o) == null ? 'تحديد الأجر' : 'تعديل الأجر', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'hr.salary.view', reason: K.canSal() ? '' : 'يتطلب hr.salary.view', onClick: () => editSalary(o) }) : null),
          SA.card({ title: 'تحذيرات العقد (م 89 وما حولها)', tags: SA.tag('pending', 'Law · قابلة للتعديل') }, h('ul.sap-hrc-chk', {}, warns.map((x) => h('li', {}, h('span.t', {}, h('span', {}, SA.chip(x.lvl === 'danger' ? 'يمنع' : x.lvl === 'warning' ? 'تحذير' : 'معلومة', x.lvl === 'danger' ? 'danger' : x.lvl === 'warning' ? 'warning' : 'info'), ' ', x.text)))))),
          SA.card({ title: 'اللياقة الطبية قبل التعيين', tags: [SA.chip(MED[o.medical.status][0], MED[o.medical.status][1]), SA.tag('new', 'T4')] }, canMed ? medForm(o) : h('div', {}, SA.kv([['التصنيف', SA.chip(MED[o.medical.status][0], MED[o.medical.status][1])], ['القيود التشغيلية', o.medical.operationalNote || '—'], ['صاحب السجل', o.medical.by ? 'OHS Officer' : '—']]), K.lockNote('السجل الطبي T4 (OHS + HR Manager فقط) — ترى التصنيف والقيود التشغيلية فقط، ولا تفاصيل طبية في أي إشعار أو تصدير (BR-OFR-07).'))),
          SA.card({ title: 'المستندات المطلوبة', tags: SA.tag('pending', 'قائمة قابلة للتعديل') }, h('ul.sap-hrc-chk', {}, (o.docs || []).map((d) => h('li', {}, h('span.t', {}, h('b', {}, d.label), h('small', {}, d.key + (d.legal ? ' · [Law · Pending] لا يُحذف' : ' · عُرف') + (d.required ? ' · إلزامي' : ' · اختياري') + (d.reason ? ' · إعفاء: ' + d.reason : ''))), h('div.cluster', {}, SA.chip(d.status === 'received' ? 'مستلم' : d.status === 'waived' ? 'معفى' : 'ناقص', d.status === 'received' ? 'success' : d.status === 'waived' ? 'neutral' : d.required ? 'danger' : 'warning'), s === 'accepted' || s === 'sent' ? [d.status === 'received' ? null : SA.btn({ label: 'استلام', kind: 'ghost', size: 'sm', perm: 'hr.offers.create', reason: d.key === 'HD-04' ? 'يتحقق منه OHS من خلال اللياقة الطبية' : '', onClick: () => docSet(o, d.key, 'received') }), d.status === 'missing' && !d.legal ? SA.btn({ label: 'إعفاء', kind: 'ghost', size: 'sm', perm: 'hr.offers.approve', onClick: () => docWaive(o, d) }) : null] : null)))))),
          SA.card({ title: 'العقد وحقول المادة 89', tags: [SA.chip(o.contract.signed ? 'موقّع' : 'غير موقّع', o.contract.signed ? 'success' : 'warning'), SA.tag('pending', 'Law')], actions: [SA.btn({ label: 'بيانات العقد', kind: 'ghost', size: 'sm', icon: 'edit', perm: 'hr.offers.create', onClick: () => contractForm(o) }), SA.btn({ label: 'توقيع العقد (4 نسخ)', kind: 'primary', size: 'sm', perm: 'hr.offers.approve', reason: o.contract.signed ? 'العقد موقّع ومقفل.' : !a89.every((x) => x[1]) ? 'حقول المادة 89 غير مكتملة.' : s !== 'accepted' ? 'العرض لم يُقبل بعد.' : '', onClick: () => signContract(o) })] },
            h('ul.sap-hrc-chk', {}, a89.map((x) => h('li', {}, h('span.t', {}, x[0]), x[1] ? SA.chip('مكتمل', 'success') : SA.chip('ناقص — لا عقد بدون حقل إلزامي', 'danger')))), h('p.t-muted', {}, 'ترتيب التوقيع: HR Manager ← GM ← العامل. الأجر في العقد = الأجر في العرض المعتمد (BR-OFR-17). بعد التوقيع لا تعديل إلا بملحق.'))),
          ), h('div.sap-hrc', {}, SA.card({ title: 'سلسلة الاعتماد', tags: a ? h('a.sap-linkbtn', { href: SA.href('approvals/' + a.id) }, 'الصندوق المشترك') : null }, K.chainView(a)),
            SA.card({ title: 'شروط التحويل لموظف', tags: SA.tag('new', 'BR-OFR-18') }, h('ul.sap-hrc-chk', {}, checks.map((x) => h('li', {}, h('span.t', {}, x[0]), x[1] ? SA.chip('✓', 'success') : SA.chip('غير مكتمل', 'warning')))), h('p.t-muted', {}, 'لا Undo بعد التحويل. قبل المباشرة: «إلغاء ما قبل التعيين».')),
            SA.card({ title: 'سجل العرض' }, h('ol.sap-hrc-chain', {}, (o.log || []).slice().reverse().map((x) => h('li', {}, h('span.sap-hrc-dot', {}, SA.icon('history', 'icon-sm')), h('div', {}, h('b', {}, x.text), h('div.t-muted', {}, SA.fmt.rel(x.ts) + ' · ' + (x.by ? SA.userName(x.by) : '—'))))))));
    } });
  }
  function medForm(o) {
    const cls = SA.form.field({ name: 'c', label: 'التصنيف', type: 'select', required: true, value: o.medical.status === 'pending' ? '' : o.medical.status, options: [['', 'اختر…'], ['fit', 'لائق'], ['fit_restricted', 'لائق بقيود'], ['unfit', 'غير لائق']] }); const op = SA.form.field({ name: 'o', label: 'القيود التشغيلية (تُعرض لـHR والمشرف)', value: o.medical.operationalNote || '' }); const det = SA.form.field({ name: 'd', label: 'التفاصيل الطبية (T4 — OHS وHR Manager فقط)', type: 'textarea', rows: 2, value: o.medical.details || '' });
    return h('div', {}, cls.el, op.el, det.el, SA.btn({ label: 'حفظ التصنيف', kind: 'primary', size: 'sm', perm: 'hr.medical.view', onClick: async () => {
      if (!cls.validate()) return; if (cls.get() === 'fit_restricted' && !(op.get() || '').trim()) { op.error('اكتب القيود التشغيلية للتصنيف «لائق بقيود».'); return; }
      await SA.api(() => { st.patch('offers', o.id, (x) => ({ medical: { status: cls.get(), operationalNote: op.get(), details: det.get(), by: K.me().id, at: new Date().toISOString() }, docs: x.docs.map((d) => (d.key === 'HD-04' ? Object.assign({}, d, { status: cls.get() === 'unfit' ? 'missing' : 'received' }) : d)), log: (x.log || []).concat([{ ts: new Date().toISOString(), text: 'سُجّل تصنيف اللياقة: ' + MED[cls.get()][0], by: K.me().id }]) })); SA.audit('HR.MEDICAL.RECORDED', { target: { type: 'offer', id: o.id, label: (candOf(o) || {}).name }, after: { classification: MED[cls.get()][0] } }); if (cls.get() === 'unfit') SA.notify({ title: 'نتيجة كشف طبي تحتاج مراجعتك', body: 'افتح الملف المحمي لعرضها (' + o.id + ').', level: 'action', to: ['R-11'], link: '#/hr/offers/' + o.id }); }); SA.toast('تم حفظ التصنيف', 'success'); } }));
  }
  async function docSet(o, key, status) { st.patch('offers', o.id, (x) => ({ docs: x.docs.map((d) => (d.key === key ? Object.assign({}, d, { status }) : d)) })); SA.toast('تم تسجيل استلام المستند', 'success'); }
  async function docWaive(o, d) { const r = await SA.confirm({ title: 'إعفاء من مستند: ' + d.label, confirmLabel: 'إعفاء', reasonRequired: true, reasonLabel: 'سبب الإعفاء', impact: ['البند القانوني لا يُعفى — هذا البند عُرف.', 'يُسجَّل باسمك وسببك.'] }); if (!r.ok) return; st.patch('offers', o.id, (x) => ({ docs: x.docs.map((q) => (q.key === d.key ? Object.assign({}, q, { status: 'waived', reason: r.reason, waivedBy: K.me().id }) : q)) })); SA.toast('تم الإعفاء', 'success'); }
  function editSalary(o) {
    const b = SA.form.field({ name: 'b', label: 'الأجر الأساسي (ج.م/شهر)', type: 'number', min: 0, required: true, value: o.salary ? o.salary.basic : '' }); const al = SA.form.field({ name: 'a', label: 'البدلات (ج.م/شهر)', type: 'number', min: 0, value: o.salary ? o.salary.allowances : '' });
    const m = SA.modal({ title: 'الأجر المعروض (T3)', subtitle: o.id, icon: 'coins', size: 'sm', body: h('div.sap-confirm', {}, b.el, al.el, SA.alert('info', 'يُسجَّل اطلاعك على الأجر وتعديله في التدقيق.')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'حفظ', kind: 'primary', onClick: () => { if (!b.validate()) return; const t = (b.get() || 0) + (al.get() || 0); const ws = K.contractWarnings(Object.assign({}, o, { salary: { basic: b.get(), allowances: al.get() || 0 } })).filter((x) => x.block); if (ws.length) { b.error(ws[0].text); return; } st.patch('offers', o.id, { salary: { basic: b.get(), allowances: al.get() || 0, demo: true }, bandResult: null }); SA.audit('HR.SALARY.VIEWED', { target: { type: 'offer', id: o.id, label: (candOf(o) || {}).name }, reason: 'تحديد/تعديل أجر العرض' }); m.close(); SA.toast('تم حفظ الأجر', 'success'); } })] });
  }
  function contractForm(o) {
    const a = o.contract.art89 || {}; const f = { qualification: SA.form.field({ name: 'qualification', label: 'المؤهل', value: a.qualification || '', required: true }), insuranceNo: SA.form.field({ name: 'insuranceNo', label: 'رقم التأمين (أو «قيد التسجيل»)', value: a.insuranceNo || '', required: true }), residence: SA.form.field({ name: 'residence', label: 'محل الإقامة', value: a.residence || '', required: true }), payMethod: SA.form.field({ name: 'payMethod', label: 'كيفية وموعد الدفع', value: a.payMethod || 'شهريًا بتحويل بنكي (م 108)', required: true }), benefits: SA.form.field({ name: 'benefits', label: 'المزايا النقدية والعينية', value: a.benefits || '', required: true, hint: 'اكتب «لا يوجد» إن لم توجد.' }) };
    const g = SA.form.group(Object.values(f)); const m = SA.modal({ title: 'بيانات العقد — حقول المادة 89', subtitle: o.id, icon: 'doc', size: 'md', body: h('div.sap-confirm', {}, SA.alert('info', 'باقي الحقول (البدء، العامل، المهنة، الأجر، طبيعة العمل، إثبات الشخصية) تُسحب تلقائيًا من العرض والمرشح والمستندات.'), h('div.sap-formgrid', {}, Object.values(f).map((x) => x.el))), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'حفظ', kind: 'primary', onClick: () => { if (!g.validate()) return; st.patch('offers', o.id, (x) => ({ contract: Object.assign({}, x.contract, { art89: g.get() }) })); m.close(); SA.toast('تم حفظ بيانات العقد', 'success'); } })] });
  }
  async function signContract(o) {
    const r = await SA.confirm({ title: 'توقيع العقد وقفله', confirmLabel: 'توقيع وقفل', impact: ['يُقفل العقد؛ أي تغيير بعدها = ملحق موقّع من الطرفين (BR-OFR-16).', 'يُوزَّع على 4 نسخ: صاحب العمل · العامل · مكتب التأمينات · الجهة الإدارية (التزام OB-07).'] }); if (!r.ok) return;
    st.patch('offers', o.id, (x) => ({ contract: Object.assign({}, x.contract, { signed: true, signedAt: new Date().toISOString(), signedBy: K.me().id }), log: (x.log || []).concat([{ ts: new Date().toISOString(), text: 'وُقّع العقد (4 نسخ)', by: K.me().id }]) })); SA.toast('تم توقيع العقد', 'success');
  }
  async function respond(o) {
    const c = candOf(o);
    const r = await new Promise((resolve) => { const m = SA.modal({ title: 'رد المرشح على العرض', subtitle: c.name, icon: 'swap', size: 'sm', body: h('p', {}, 'سجّل ردّ المرشح (يأتي في الإنتاج من الرابط العام للعرض).'), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إغلاق'), SA.btn({ label: 'رفض العرض', kind: 'danger', onClick: () => m.close('declined') }), SA.btn({ label: 'قبول العرض', kind: 'primary', onClick: () => m.close('accepted') })] }); m.closed.then(resolve); });
    if (!r) return;
    if (r === 'accepted' && effStatus(o) === 'expired') { SA.toast('العرض منتهي الصلاحية — يلزم إصدار جديد.', 'warn'); return; }
    st.patch('offers', o.id, (x) => ({ status: r, respondedAt: new Date().toISOString(), log: (x.log || []).concat([{ ts: new Date().toISOString(), text: r === 'accepted' ? 'قبل المرشح العرض' : 'رفض المرشح العرض', by: K.me().id }]) }));
    SA.audit(r === 'accepted' ? 'HR.OFFER.ACCEPTED' : 'HR.OFFER.DECLINED', { target: { type: 'offer', id: o.id, label: c.name } });
    if (r === 'declined') { st.patch('candidates', c.id, (x) => ({ stage: 'rejected', rejectReason: 'رفض العرض', history: (x.history || []).concat([{ ts: new Date().toISOString(), stage: 'rejected', by: K.me().id, reason: 'رفض العرض' }]) })); }
    SA.toast(r === 'accepted' ? 'سُجّل قبول العرض — تابع اللياقة والمستندات والعقد.' : 'سُجّل رفض العرض', r === 'accepted' ? 'success' : 'info');
  }
  async function convert(id) {
    const o = st.find('offers', id); const c = candOf(o); const checks = convertChecks(o); const miss = checks.find((x) => !x[1]); if (miss) { SA.toast('غير مكتمل: ' + miss[0], 'warn'); return; }
    const r = await SA.confirm({ title: 'تحويل ' + c.name + ' إلى موظف', confirmLabel: 'تحويل (لا تراجع)', impact: ['يُنشأ ملف موظف بحالة «ما قبل التعيين» ويُسلَّم لمسار التعيين والتجربة (HR-05).', 'الأجر من العرض المعتمد يُنقل كمسودة لـPayroll (BR-OFR-19) — لا يُغيَّر إلا بمسار تغيير مرتب.', 'لا Undo — قبل المباشرة يمكنك «إلغاء ما قبل التعيين».'] }); if (!r.ok) return;
    let emp; try {
      emp = await SA.api(() => {
        const eid = st.nextId('employees', 'E', 4); const n = get('employees').reduce((a, e) => Math.max(a, +String(e.empNo).replace(/\D/g, '') || 0), 0) + 1; const d = st.find('departments', o.departmentId); const mgrUser = d && d.managerId; const mgrEmp = get('employees').find((e) => e.userId === mgrUser);
        const e = { id: eid, empNo: 'EMP-' + String(n).padStart(4, '0'), name: c.name, userId: null, departmentId: o.departmentId, positionId: o.positionId, managerEmpId: mgrEmp ? mgrEmp.id : null, status: 'preboarding', hireDate: o.startDate, endDate: null, shift: 'day', employmentType: o.contractType === 'indefinite' ? 'permanent' : 'contract', phone: c.phone, city: '', nationalIdLast4: String(c.nationalId).slice(-4), bankLast4: '', salary: { basic: o.salary.basic, allowances: o.salary.allowances, demo: true, draft: true, fromOffer: o.id }, relatives: c.relativeOfEmpId ? [c.relativeOfEmpId] : [], preboarding: { offerId: o.id, candidateId: c.id, requisitionId: o.requisitionId, contractType: o.contractType, probationDays: o.probationDays, convertedBy: K.me().id, convertedAt: new Date().toISOString() } };
        st.insert('employees', e);
        st.patch('offers', o.id, (x) => ({ status: 'converted', convertedEmployeeId: eid, log: (x.log || []).concat([{ ts: new Date().toISOString(), text: 'حُوّل إلى موظف ' + e.empNo, by: K.me().id }]) }));
        st.patch('candidates', c.id, (x) => ({ stage: 'hired', history: (x.history || []).concat([{ ts: new Date().toISOString(), stage: 'hired', by: K.me().id }]) }));
        st.patch('requisitions', o.requisitionId, (q) => { const hired = (q.hired || 0) + 1; return { hired, status: hired >= q.headcount ? 'filled' : q.status }; });
        SA.audit('HR.EMPLOYEE.CREATED', { target: { type: 'employee', id: eid, label: c.name }, after: { empNo: e.empNo, status: 'ما قبل التعيين', position: K.posTitle(o.positionId), start: o.startDate } });
        SA.audit('HR.OFFER.CONVERTED', { target: { type: 'offer', id: o.id, label: c.name }, after: { employee: eid, handoff: 'hr-onboarding' } });
        return e;
      });
    } catch (e) { SA.fail(e); return; }
    SA.notify({ title: emp.name + ' يبدأ يوم ' + SA.fmt.date(o.startDate), body: 'جهّز بندك في قائمة التعيين (' + emp.empNo + ').', level: 'action', to: ['R-12', 'R-11', 'R-15', 'R-13'], link: '#/hr/onboarding?employee=' + emp.id });
    SA.toast('تم إنشاء ملف الموظف ' + emp.empNo + ' (ما قبل التعيين)', 'success', { ms: 6000 });
  }

  /* ───── list ───── */
  function list(root, ctx) {
    K.crumbs(ctx, 'hr-hire', 'العروض والعقود');
    return K.mount(root, ctx, { perm: 'hr.offers.view', paths: ['offers', 'candidates', 'approvals', 'hrLegal'], build() {
      const rows = get('offers');
      const t = K.table({ caption: 'العروض والعقود', rows: () => get('offers'), pageSize: 10, search: { placeholder: 'ابحث بالمرشح أو رقم العرض…', keys: [(o) => o.id, (o) => (candOf(o) || {}).name || ''] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(OS).map((k) => [k, OS[k][0]]), test: (o, v) => effStatus(o) === v }, { key: 'contractType', label: 'نوع العقد', options: Object.keys(CT).map((k) => [k, CT[k]]) }],
        columns: [{ key: 'id', label: 'العرض', sort: true, render: (o) => h('b', {}, o.id) }, { key: 'c', label: 'المرشح', render: (o) => h('div', {}, h('b', {}, (candOf(o) || {}).name || '—'), h('small.t-muted', {}, K.posTitle(o.positionId) + ' — ' + SA.deptName(o.departmentId))) }, { key: 'ct', label: 'العقد', render: (o) => CT[o.contractType] }, { key: 'sal', label: 'الأجر (T3)', render: (o) => h('div', {}, K.salaryNode(total(o)), h('div', {}, bandChip(bandOf(o)))) }, { key: 'st', label: 'الحالة', render: (o) => offChip(o) }, { key: 'med', label: 'اللياقة', render: (o) => SA.chip(MED[o.medical.status][0], MED[o.medical.status][1]) }, { key: 'docs', label: 'المستندات', render: (o) => { const req = o.docs.filter((d) => d.required); return h('span.num', {}, req.filter((d) => d.status !== 'missing').length + ' / ' + req.length); } }, { key: 'start', label: 'المباشرة', render: (o) => SA.fmt.date(o.startDate) }],
        onRowClick: (o) => SA.nav('hr/offers/' + o.id), empty: { icon: 'doc', title: 'لا عروض بعد', text: 'يبدأ العرض من مرشح وصل مرحلة «عرض».', action: { label: 'عرض جديد', perm: 'hr.offers.create', onClick: () => SA.nav('hr/offers/new') } } });
      return h('div.sap-hrc', {}, SA.pageHead({ title: 'العروض والعقود', desc: 'من العرض إلى الموظف: اعتماد بحسب الشريحة ← لياقة طبية ← مستندات ← عقد (م 89) ← تحويل إلى ملف موظف بحالة «ما قبل التعيين».', tags: [SA.tag('new', 'HR-04'), SA.tag('pending', 'Law')], actions: [K.spec('hr-acquire.html', 'scr-ofr-01'), SA.btn({ label: 'عرض جديد', icon: 'plus', kind: 'primary', perm: 'hr.offers.create', onClick: () => SA.nav('hr/offers/new') })] }),
        h('div.sap-grid-cards', {}, SA.kpi('بانتظار الاعتماد', rows.filter((o) => o.status === 'pending_approval').length), SA.kpi('أُرسلت للمرشحين', rows.filter((o) => effStatus(o) === 'sent').length), SA.kpi('مقبولة قيد ما قبل التعيين', rows.filter((o) => o.status === 'accepted').length), SA.kpi('تحوّلت لموظفين', rows.filter((o) => o.status === 'converted').length)),
        SA.card({ flush: true }, t.el));
    } });
  }
  function render(root, ctx) {
    const sub = ctx.path[0];
    if (sub === 'new') { K.init(); const d = SA.guard('hr.offers.create'); if (d) { root.append(d); return null; } return wizard(root, ctx); }
    if (sub) return detail(root, ctx, sub);
    return list(root, ctx);
  }
  SA.register(Object.assign({}, K.NAV('hr-offers'), { app: 'hr', render, stub: false, badge: () => { try { const n = get('offers').filter((o) => o.status === 'pending_approval').length; return n || null; } catch (e) { return null; } } }));
})();
/* ───────────────────────── part 6 — HR-27 لوحة HR (حسب الجمهور) ───────────────────────── */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store, K = SA.hrCore, get = K.get;
  const dept = (id) => SA.deptName(id);
  const TYPE_ROUTE = (a) => (a.ref && a.ref.type === 'hiring_requisition' ? SA.href('hr/requisitions/' + a.ref.id) : a.ref && a.ref.type === 'job_offer' ? SA.href('hr/offers/' + a.ref.id) : a.ref && a.ref.type === 'legal_setting' ? SA.href('hr/compliance?tab=registry') : SA.href('approvals/' + a.id));
  K.pendingForMe = () => get('approvals').filter((a) => a.area === 'hr' && a.status === 'pending' && !K.cannotDecide(a));
  K.blockedForMe = () => get('approvals').filter((a) => a.area === 'hr' && a.status === 'pending' && a.requesterId === (K.me() || {}).id);
  const logged = { v: 0 };

  function widget(o, ...kids) {
    return h('section.card.sap-hrc-w', { 'aria-label': o.title }, h('header', {}, h('div', {}, h('h3', {}, o.title), h('small.src', {}, o.src ? 'المصدر: ' + o.src + ' · ' : '', 'آخر تحديث: الآن', o.code ? ' · ' + o.code : '')), o.tag || null), kids, o.href ? h('a.sap-linkbtn', { href: o.href, style: { alignSelf: 'flex-start' } }, o.hrefLabel || 'عرض الكل') : null);
  }
  const emptyW = (text) => h('p.t-muted', { style: { margin: 0 } }, SA.icon('info', 'icon-sm'), ' ', text);
  const bar = (v, max, cls) => h('div.sap-hrc-bar', {}, h('i', { class: cls || '', style: { width: Math.min(100, max ? v / max * 100 : 0) + '%' } }));

  /* ───── inbox (W-39 + SCR-ANL-05) ───── */
  function inbox() {
    const mine = K.pendingForMe(); const waiting = get('approvals').filter((a) => a.area === 'hr' && a.status === 'pending' && a.requesterId === K.me().id);
    const hrTypes = (C0 = SA.catalog.approvalTypes);
    const row = (a, can) => { const t = hrTypes[a.type] || { label: a.type, icon: 'doc' }; const step = a.chain.find((s) => s.step === a.currentStep); const why = K.cannotDecide(a);
      return h('div.sap-hrc-row', {}, h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 } }, h('span.sap-state-ico', {}, SA.icon(t.icon || 'doc')), h('div', { style: { minWidth: 0 } }, h('b', {}, a.title), h('small', {}, t.label + ' · مقدّم الطلب: ' + SA.userName(a.requesterId) + ' · ' + SA.fmt.rel(a.createdAt) + (step ? ' · الخطوة: ' + step.label : '')))),
        h('div.cluster', {}, h('a.btn.btn-ghost.btn-sm', { href: TYPE_ROUTE(a) }, 'فتح'), can ? SA.btn({ label: 'قرار', kind: 'primary', size: 'sm', icon: 'checkcircle', onClick: async () => { await K.decisionDialog(a, a.title); } }) : h('a.btn.btn-ghost.btn-sm', { href: SA.href('approvals/' + a.id), title: 'القرار من صندوق الاعتمادات المشترك' }, 'قرار في الصندوق')));
    };
    return widget({ title: 'طلبات تنتظر قرارك', src: 'صندوق الاعتمادات المشترك', code: 'W-39', tag: SA.chip(mine.length ? mine.length + ' بانتظارك' : 'لا شيء بانتظارك', mine.length ? 'warning' : 'success') },
      mine.length ? mine.map((a) => row(a, OWN.indexOf(a.type) >= 0)) : emptyW('لا شيء بانتظار قرارك الآن.'),
      waiting.length ? h('div', { style: { marginBlockStart: '8px' } }, h('b', {}, 'طلباتي قيد الاعتماد (' + waiting.length + ')'), waiting.map((a) => { const step = a.chain.find((s) => s.step === a.currentStep); return h('div.sap-hrc-row', {}, h('div', {}, h('b', {}, a.title), h('small', {}, 'بانتظار: ' + (step ? step.label : '—') + ' · فصل مهام: لا تعتمد طلبك')), h('a.btn.btn-ghost.btn-sm', { href: TYPE_ROUTE(a) }, 'متابعة')); })) : null,
      SA.can('sa.approvals.view') ? h('a.sap-linkbtn', { href: SA.href('approvals'), style: { alignSelf: 'flex-start' } }, 'افتح صندوق الاعتمادات المشترك') : null);
  }
  let C0 = null; const OWN = ['hiring_requisition', 'job_offer', 'legal_setting'];

  /* ───── manager view widgets ───── */
  function wHeadcount() {
    const emps = get('employees'); const act = emps.filter((e) => K.ACTIVE.indexOf(e.status) >= 0); const perm = act.filter((e) => (e.employmentType || 'permanent') === 'permanent'); const other = act.length - perm.length; const pre = emps.filter((e) => e.status === 'preboarding').length;
    const by = {}; emps.forEach((e) => { by[e.status] = (by[e.status] || 0) + 1; }); const L = { active: 'نشط', probation: 'تجربة', leave: 'إجازة', suspended: 'موقوف', notice: 'فترة إخطار', preboarding: 'ما قبل التعيين', terminated: 'منتهي' };
    return widget({ title: 'عدد العاملين', src: 'HR-06 · HR-34', code: 'W-01', href: SA.href('hr/employees'), hrefLabel: 'دليل الموظفين' }, h('div.sap-hrc-big', {}, perm.length), h('small.t-muted', {}, 'موظف دائم' + (other ? ' + ' + other + ' مقاول/يومية (يُحسبون منفصلًا)' : '') + (pre ? ' · ' + pre + ' ما قبل التعيين' : '')), h('div.cluster', {}, Object.keys(by).filter((k) => k !== 'terminated').map((k) => SA.chip((L[k] || k) + ' ' + by[k], k === 'active' ? 'success' : k === 'preboarding' ? 'warning' : 'neutral'))));
  }
  function wPlan() {
    const pos = get('positions').filter((p) => p.status !== 'closed' && p.headcount > 0); const plan = st.get('hrPlan') || {};
    const byD = {}; pos.forEach((p) => { const d = byD[p.departmentId] = byD[p.departmentId] || { hc: 0, f: 0 }; d.hc += p.headcount; d.f += K.filled(p.id); }); const rows = Object.keys(byD).map((k) => ({ id: k, hc: byD[k].hc, f: byD[k].f })).sort((a, b) => b.f / b.hc - a.f / a.hc).slice(0, 6);
    return widget({ title: 'العدد مقابل الميزانية بالقسم', src: 'HR-01 · HR-06', code: 'W-02', tag: plan.status !== 'locked' ? SA.chip('الخطة مسودة', 'warning') : null, href: SA.href('hr/planning'), hrefLabel: 'خطة القوى العاملة' }, rows.length ? rows.map((r) => h('div.sap-hrc-row', {}, h('span', { style: { minWidth: '110px' } }, h('b', {}, dept(r.id))), h('div', { style: { flex: 1 } }, bar(r.f, r.hc, r.f > r.hc ? 'is-over' : '')), h('span.num', {}, r.f + ' / ' + r.hc))) : emptyW('ميزانية الوظائف غير مُعدّة (HR-01) — لا يُعرض مقارنة.'));
  }
  function wFunnel() {
    const cs = get('candidates').filter((c) => c.stage !== 'rejected'); const open = get('requisitions').filter((r) => r.status === 'open'); const stg = [['applied', 'جديد'], ['screening', 'فرز'], ['interview', 'مقابلة'], ['test', 'اختبار'], ['offer', 'عرض'], ['hired', 'تعيين']]; const mx = Math.max(1, ...stg.map((s) => cs.filter((c) => c.stage === s[0]).length));
    return widget({ title: 'قمع طلبات التوظيف', src: 'HR-02 · HR-03', code: 'W-15', href: SA.href('hr/candidates'), hrefLabel: 'لوحة المرشحين', tag: SA.chip(open.length + ' شاغر مفتوح', 'info') }, cs.length || open.length ? stg.map((s) => { const n = cs.filter((c) => c.stage === s[0]).length; return h('div.sap-hrc-row', {}, h('span', { style: { minWidth: '70px' } }, s[1]), h('div', { style: { flex: 1 } }, bar(n, mx)), h('span.num', {}, n)); }) : emptyW('لا توجد طلبات توظيف مفتوحة.'));
  }
  function wTtf() {
    const filled = get('requisitions').filter((r) => r.status === 'filled' && r.approvedAt); const offers = get('offers'); const sent = offers.filter((o) => ['sent', 'accepted', 'declined', 'expired', 'converted'].indexOf(o.status) >= 0); const acc = offers.filter((o) => ['accepted', 'converted'].indexOf(o.status) >= 0);
    return widget({ title: 'الوقت للتعيين ونسبة قبول العروض', src: 'HR-02 · HR-04', code: 'W-11 · W-14' }, filled.length ? h('div.sap-hrc-big', {}, Math.round(filled.reduce((a, r) => a + (Date.now() - new Date(r.approvedAt)) / 864e5, 0) / filled.length) + ' يوم') : emptyW('لا توجد طلبات توظيف مغلقة بعد — لا متوسط للوقت للتعيين.'), h('div.sap-hrc-row', {}, h('span', {}, 'نسبة قبول العروض'), sent.length ? h('b.num', {}, Math.round(acc.length / sent.length * 100) + '% (' + acc.length + ' من ' + sent.length + ')') : h('span.t-muted', {}, 'لا توجد عروض مرسلة')), h('a.sap-linkbtn', { href: SA.href('hr/offers'), style: { alignSelf: 'flex-start' } }, 'العروض والعقود'));
  }
  function wProbation() {
    const max = K.legal('probation_max_days'); const days = max.n || 90; const list = get('employees').filter((e) => e.status === 'probation').map((e) => ({ e, end: K.addDays(e.hireDate, days) })).filter((x) => K.daysFrom(x.end) <= 14).sort((a, b) => a.end - b.end);
    return widget({ title: 'فترات تجربة تنتهي خلال 14 يوم', src: 'HR-05', code: 'W-36', tag: max.status !== 'approved' ? SA.chip('الحد ' + days + ' يوم [Law · Pending]', 'warning') : null }, list.length ? list.slice(0, 5).map((x) => h('div.sap-hrc-row', {}, h('div', {}, h('b', {}, x.e.name), h('small', {}, K.posTitle(x.e.positionId))), SA.chip(K.daysFrom(x.end) < 0 ? 'تجاوزت بـ ' + Math.abs(K.daysFrom(x.end)) + ' يوم' : 'بعد ' + K.daysFrom(x.end) + ' يوم', K.daysFrom(x.end) < 3 ? 'danger' : 'warning'))) : emptyW('لا يوجد موظفون بتجربة تنتهي خلال 14 يومًا.'));
  }
  function wAttendance(emps) {
    const at = get('attendance').filter((a) => !emps || emps.some((e) => e.id === a.employeeId)); if (!at.length) return widget({ title: 'استثناءات الحضور', src: 'HR-10', code: 'W-37' }, emptyW('مصدر الحضور غير مُعدّ أو لا توجد استثناءات.'));
    const last = at.map((a) => a.date).sort().pop(); const day = at.filter((a) => a.date === last); const ex = day.filter((a) => a.status === 'absent' || a.status === 'late');
    return widget({ title: 'استثناءات الحضور (آخر يوم مسجّل)', src: 'HR-10', code: 'W-37', tag: SA.chip(SA.fmt.date(last), 'neutral'), href: SA.href('hr/attendance'), hrefLabel: 'الحضور والاستثناءات' }, ex.length ? [h('div.cluster', {}, SA.chip(ex.filter((a) => a.status === 'absent').length + ' غياب', 'danger'), SA.chip(ex.filter((a) => a.status === 'late').length + ' تأخير', 'warning')), ex.slice(0, 4).map((a) => h('div.sap-hrc-row', {}, h('span', {}, K.empName(a.employeeId)), SA.chip(a.status === 'absent' ? 'غياب' : 'تأخير ' + (a.in || ''), a.status === 'absent' ? 'danger' : 'warning')))] : emptyW('لا توجد استثناءات في هذا اليوم.'));
  }
  function wCompliance() {
    const obs = get('hrObligations'); const od = obs.filter((o) => K.obStatus(o) === 'overdue'), soon = obs.filter((o) => K.obStatus(o) === 'due_soon'); const blocked = K.GATES.filter((g) => !K.gate(g.id).ready).length;
    return widget({ title: 'الامتثال والالتزامات', src: 'HR-30', code: 'W-33/46', tag: od.length ? SA.chip(od.length + ' متأخر', 'danger') : null, href: SA.href('hr/compliance'), hrefLabel: 'لوحة الامتثال' }, od.concat(soon).slice(0, 3).map((o) => h('div.sap-hrc-row', {}, h('div', {}, h('b', {}, o.id + ' — ' + o.title.slice(0, 48)), h('small', {}, 'المسؤول: ' + SA.userName(o.ownerUserId))), K.obChip(K.obStatus(o)))), !od.length && !soon.length ? emptyW('لا التزامات تستحق خلال 7 أيام.') : null, h('div.sap-hrc-row', {}, h('span', {}, 'بوابات جاهزية محجوبة (إعدادات Pending)'), h('b.num', {}, blocked + ' من ' + K.GATES.length)));
  }
  function wQuota() {
    const plan = st.get('hrPlan') || {}; const hc = K.headcount(); const q = K.legal('disability_quota').n; const dc = plan.disabledCount;
    return widget({ title: 'التزام حصة ذوي الإعاقة', src: 'HR-06 · HR-30', code: 'W-33', href: SA.href('hr/compliance?tab=thresholds'), hrefLabel: 'العتبات والحصة' }, dc == null ? emptyW('غير مسجّل في الملفات — الحصة غير قابلة للحساب.') : h('div', {}, h('div.sap-hrc-big', {}, (hc ? dc / hc * 100 : 0).toFixed(1) + '%'), h('small.t-muted', {}, dc + ' من ' + hc + ' مقابل ' + (q != null ? q + '%' : '{Open}') + ' [Law · Pending]')));
  }
  function wLeaveHr() {
    const pend = get('leaveRequests').filter((r) => r.status === 'pending'); return widget({ title: 'طلبات إجازة معلّقة', src: 'HR-11', code: 'W-37', href: SA.can('hr.leave.view') ? SA.href('hr/leave') : null, hrefLabel: 'الإجازات' }, h('div.sap-hrc-big', {}, pend.length), pend.length ? pend.slice(0, 3).map((r) => h('div.sap-hrc-row', {}, h('span', {}, K.empName(r.employeeId)), h('small.t-muted', {}, SA.fmt.date(r.from) + ' · ' + r.days + ' يوم'))) : emptyW('لا طلبات إجازة معلّقة.'));
  }
  function wSalary() {
    const can = K.canSal();
    if (!can) return widget({ title: 'تكلفة الأجور (مشتقة من الأجور — T3)', src: 'HR-14', code: 'W-20/31', tag: SA.chip('ممنوع', 'danger') }, h('div.sap-hrc-denied', {}, SA.icon('lock', 'icon-sm'), h('span', {}, 'المؤشرات المشتقة من الأجور لا تظهر إلا لحامل hr.salary.view (BR-ANL-02) — لا تُعرض صفرًا ولا نسبة. المدير العام ليس مخوّلًا تلقائيًا (بند 46 Pending).')));
    if (!logged.v) { logged.v = 1; K.logSalaryView({ type: 'dashboard', id: 'hr-dashboard', label: 'لوحة HR — مؤشرات الأجور' }, 'عرض مؤشرات الأجور'); }
    const run = get('payrollRuns')[0]; const act = get('employees').filter((e) => K.ACTIVE.indexOf(e.status) >= 0 && e.salary && e.salary.basic != null); const avgB = act.length ? Math.round(act.reduce((a, e) => a + e.salary.basic, 0) / act.length) : null;
    return widget({ title: 'تكلفة الأجور (مشتقة من الأجور — T3)', src: 'HR-14 · HR-13', code: 'W-20/31', tag: SA.chip('تجريبي', 'info'), href: SA.can('hr.payroll.view') ? SA.href('hr/payroll') : null, hrefLabel: 'دورة المرتبات' }, run ? [h('div.sap-hrc-big', {}, SA.fmt.num(run.gross)), h('small.t-muted', {}, 'إجمالي الأجور (Gross) — ' + run.id + ' · الاستقطاعات/الصافي: ', SA.openValue('Open'))] : emptyW('لا توجد دورة مرتبات.'), h('div.sap-hrc-row', {}, h('span', {}, 'متوسط الأجر الأساسي (' + act.length + ' موظف)'), avgB != null ? h('b.num', {}, SA.fmt.money(avgB)) : '—'), h('small.t-muted', {}, 'كل اطلاع على هذه الأرقام يُسجَّل (HR.SALARY.VIEWED).'));
  }
  function managerBoard() {
    return h('div.sap-hrc', {}, inbox(), h('div.sap-hrc-grid.is-3', {}, wHeadcount(), wPlan(), wFunnel(), wTtf(), wProbation(), wAttendance(null), wLeaveHr(), wCompliance(), wQuota(), wSalary()));
  }

  /* ───── supervisor board (also exposed for the "فريقي" screen) ───── */
  function supervisorBoard(empId) {
    const me = st.find('employees', empId) || K.myEmp(); if (!me) return SA.card({}, SA.empty({ icon: 'users', title: 'لا ملف موظف مرتبط بحسابك', text: 'تظهر لوحة المشرف للموظفين الذين لهم فريق (managerEmpId).' }));
    const team = get('employees').filter((e) => e.managerEmpId === me.id && e.status !== 'terminated'); const ids = team.map((e) => e.id); const leaves = get('leaveRequests').filter((r) => ids.indexOf(r.employeeId) >= 0 && r.status === 'pending'); const myReqs = get('requisitions').filter((r) => r.requestedBy === (me.userId || K.me().id));
    return h('div.sap-hrc', {}, SA.alert('info', h('b', {}, 'لوحة المشرف — نطاق الفريق فقط: '), 'ترى ' + team.length + ' من فريق ' + me.name + '. لا أجور ولا بيانات طبية أو تأديبية (T3/T4).'),
      h('div.sap-hrc-grid.is-3', {},
        widget({ title: 'فريقي اليوم', src: 'HR-06 · HR-09', code: 'W-40' }, h('div.sap-hrc-big', {}, team.length), team.length ? team.slice(0, 6).map((e) => h('div.sap-hrc-row', {}, h('div', {}, h('b', {}, e.name), h('small', {}, K.posTitle(e.positionId))), SA.chip(e.status === 'active' ? 'نشط' : e.status === 'probation' ? 'تجربة' : e.status === 'leave' ? 'إجازة' : e.status, e.status === 'active' ? 'success' : 'neutral'))) : emptyW('لا يوجد أعضاء في فريقك بعد.')),
        wAttendance(team),
        widget({ title: 'إجازات فريقي بانتظار القرار', src: 'HR-11', code: 'W-39', href: SA.can('hr.leave.view') ? SA.href('hr/leave') : null, hrefLabel: 'الإجازات' }, leaves.length ? leaves.map((r) => h('div.sap-hrc-row', {}, h('div', {}, h('b', {}, K.empName(r.employeeId)), h('small', {}, SA.fmt.date(r.from) + ' → ' + SA.fmt.date(r.to) + ' · ' + r.days + ' يوم')), SA.chip('معلّقة', 'warning'))) : emptyW('لا طلبات إجازة معلّقة لفريقك.')),
        widget({ title: 'أوفرتايم الفريق مقابل السقف', src: 'HR-12', code: 'W-42' }, emptyW('سقف الأوفرتايم غير مُعدّ {Open} — لا يُعرض تقدّم بدون سقف.'), SA.openValue('غير مُعدّ')),
        widget({ title: 'طلبات التوظيف التي قدّمتها', src: 'HR-02', code: 'W-15', href: SA.href('hr/requisitions'), hrefLabel: 'طلبات التوظيف' }, myReqs.length ? myReqs.map((r) => h('div.sap-hrc-row', {}, h('div', {}, h('b', {}, K.posTitle(r.positionId) !== '—' ? K.posTitle(r.positionId) : r.newPositionTitle), h('small', {}, r.id + ' · ' + r.headcount + ' مقعد')), SA.chip((K.reqStatus[r.status] || [r.status])[0], (K.reqStatus[r.status] || [0, 'neutral'])[1]))) : emptyW('لم تقدّم طلبات توظيف.'), SA.btn({ label: 'طلب توظيف جديد', kind: 'ghost', size: 'sm', icon: 'plus', perm: 'hr.requisitions.create', onClick: () => SA.nav('hr/requisitions/new') }))));
  }
  K.renderSupervisorBoard = function (el, empId) { K.init(); SA.clear(el); el.appendChild(supervisorBoard(empId)); };

  function render(root, ctx) {
    K.crumbs(ctx, 'hr-dash', 'لوحة HR');
    const isSup = () => SA.session.user.roleId === 'R-14'; const S = { aud: ctx.params.aud || (isSup() ? 'sup' : 'mgr'), sup: ctx.params.emp || '' };
    return K.mount(root, ctx, { perm: 'hr.dashboard.view', skel: 'cards', paths: ['approvals', 'employees', 'positions', 'requisitions', 'candidates', 'offers', 'attendance', 'leaveRequests', 'hrObligations', 'hrLegal', 'hrPlan', 'payrollRuns', 'session', 'meta.hrCoreTick'], build() {
      const u = K.me(); const first = u.name.split(' ')[0]; const leaders = get('employees').filter((e) => get('employees').some((x) => x.managerEmpId === e.id && x.status !== 'terminated') && e.status !== 'terminated');
      const myE = K.myEmp(); if (!S.sup) S.sup = isSup() && myE ? myE.id : (leaders.find((e) => e.userId === 'U-27') || leaders[0] || {}).id;
      const seg = isSup() ? null : SA.segmented([['mgr', 'منظور مدير HR'], ['sup', 'منظور المشرف']], S.aud, (v) => { S.aud = v; K.tick(); });
      const sel = S.aud === 'sup' && !isSup() ? h('label.sap-psize', {}, 'معاينة كمشرف', h('select.select', { 'aria-label': 'المشرف', onchange: (e) => { S.sup = e.target.value; K.tick(); } }, leaders.map((e) => h('option', { value: e.id, selected: e.id === S.sup }, e.name)))) : null;
      return h('div.sap-hrc', {}, SA.pageHead({ title: 'أهلًا ' + first + ' — إيه المطلوب منك النهارده؟', desc: SA.fmt.date(new Date().toISOString()) + ' · لوحة تبدأ بـ«طلبات تنتظر قرارك» ثم مؤشرات مرتبطة بمصادرها وصلاحياتك. لا أرقام وهمية.', tags: [SA.tag('new', 'HR-27')], actions: [K.spec('hr-platform.html', 'scr-anl-01'), SA.btn({ label: 'طلب توظيف جديد', icon: 'plus', kind: 'primary', perm: 'hr.requisitions.create', onClick: () => SA.nav('hr/requisitions/new') })] }),
        seg || sel ? h('div.sap-hrc-hdr', {}, seg, sel) : null, S.aud === 'sup' ? supervisorBoard(S.sup) : managerBoard());
    } });
  }
  SA.register(Object.assign({}, K.NAV('hr-dashboard'), { app: 'hr', render, stub: false, order: 0, badge: () => { try { const n = K.pendingForMe().length; return n || null; } catch (e) { return null; } } }));
})();
/* ───────────────────────── part 7 — HR-31 صلاحيات HR والسرية وفصل المهام ───────────────────────── */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store, C = SA.catalog, R = SA.rbac, K = SA.hrCore, get = K.get;
  const isOwner = () => !!(SA.session.role && SA.session.role.isProtected);
  const hrRoles = () => get('roles').filter((r) => r.status === 'active' && (r.sa[0] === '*' || r.sa.some((k) => k.indexOf('hr.') === 0)));
  const hrSens = () => C.sensitive.filter((s) => s.key.indexOf('hr.') === 0);
  const ACT = { view: 'V', create: 'C', edit: 'E', delete: 'D', approve: 'A', export: 'X', issue: 'I', use: 'U' };
  const SCOPE = { own: 'ذاتي', team: 'الفريق', department: 'القسم', all: 'الكل' };
  const letters = (role, p) => p.actions.filter((a) => SA.roleCan(role, 'hr.' + p.res + '.' + a[0])).map((a) => ACT[a[0]] || a[0]).join('');

  function matrixPanel() {
    const roles = hrRoles(); const groups = C.hrGroups; const perms = C.permsOf('hr');
    const head = h('tr', {}, h('th', {}, 'المورد · المفتاح'), roles.map((r) => h('th', {}, h('div', {}, r.nameEn.split('/')[0].trim()), h('small.t-muted', { style: { display: 'block', fontWeight: 400 } }, r.sa[0] === '*' ? 'كل النطاقات' : 'نطاق: ' + (SCOPE[(r.scope || {}).hr] || '—')))));
    const body = []; groups.forEach((g) => { const ps = perms.filter((p) => p.group === g.id); if (!ps.length) return; body.push(h('tr.is-grp', {}, h('td', { colspan: roles.length + 1 }, g.title))); ps.forEach((p) => body.push(h('tr', {}, h('td', {}, h('b', {}, p.label), h('small.t-muted', { style: { display: 'block' } }, 'hr.' + p.res)), roles.map((r) => { const l = letters(r, p); return h('td', { class: l ? 'on' : 'off', title: l ? 'الإجراءات: ' + l : 'لا وصول' }, l || '—'); })))); });
    return h('div.sap-hrc', {}, SA.alert('info', 'مصفوفة حيّة من أدوار النظام (SA-02): ', h('b', {}, 'V'), ' عرض · ', h('b', {}, 'C'), ' إضافة · ', h('b', {}, 'E'), ' تعديل · ', h('b', {}, 'D'), ' أرشفة · ', h('b', {}, 'A'), ' اعتماد · ', h('b', {}, 'X'), ' تصدير · ', h('b', {}, 'I'), ' إصدار · ', h('b', {}, 'U'), ' استخدام. الأضيق بين الدور والمفتاح يسري (BR-ACL-05).'),
      h('div.sap-hrc-wrap', {}, h('table.sap-hrc-mx', { 'aria-label': 'مصفوفة صلاحيات HR' }, h('thead', {}, head), h('tbody', {}, body))),
      h('div.cluster', {}, SA.can('sa.roles.view') ? roles.slice(0, 8).map((r) => h('a.sap-fchip', { href: SA.href('roles/' + r.id) }, 'تعديل ' + r.nameEn.split('/')[0].trim() + ' ↗')) : h('span.t-muted', {}, 'التعديل من «الأدوار والصلاحيات» (sa.roles.edit) للمالك.')));
  }

  async function toggleSens(role, s) {
    if (!isOwner()) { SA.toast('المنح/السحب للمالك فقط (سبب + Step-up) — BR-ACL / بند 46.', 'warn'); return; }
    if (role.isProtected) { SA.toast('دور Super Admin محمي — لا تعديل.', 'warn'); return; }
    if (role.id === SA.session.user.roleId) { K.sodBlock('SOD-10', 'منح صلاحية حساسة لدور المنفّذ نفسه', 'فصل مهام: لا يمنح أحد نفسه صلاحية حساسة (SOD-10).'); return; }
    const has = SA.roleSensitive(role, s.key);
    const r = await SA.confirm({ title: (has ? 'سحب' : 'منح') + ' «' + s.label + '» ' + (has ? 'من' : 'لـ') + ' دور ' + role.nameAr, danger: !has, confirmLabel: has ? 'سحب الصلاحية' : 'منح الصلاحية', reasonRequired: true, reasonLabel: 'السبب (إلزامي)', impact: [has ? 'مستخدمو الدور (' + R.members(role.id).length + ') يفقدون الاطلاع فورًا بعد إعادة تحميل صلاحياتهم.' : s.warn, 'يُسجَّل ROLE.SENSITIVE_GRANTED بالسبب وStep-up.'], warnings: !has ? [s.warn] : [] });
    if (!r.ok) return; if (!(await SA.stepUp('role.sensitive', { force: true, title: 'إعادة التحقق لتعديل صلاحية حساسة' }))) return;
    try { await SA.api(() => { st.update('roles', (l) => { const x = l.find((q) => q.id === role.id); x.sensitive = has ? x.sensitive.filter((k) => k !== s.key) : x.sensitive.concat([s.key]); }); R.bump(role.id); SA.audit('ROLE.SENSITIVE_GRANTED', { target: { type: 'role', id: role.id, label: role.nameAr }, before: { [s.key]: has }, after: { [s.key]: !has }, reason: r.reason }); }); SA.notify({ title: (has ? 'سُحبت' : 'مُنحت') + ' صلاحية حساسة: ' + s.label, body: 'الدور: ' + role.nameAr + ' — السبب: ' + r.reason, level: 'urgent', to: ['R-01'], link: '#/roles/' + role.id + '?tab=sensitive' }); SA.toast(has ? 'تم سحب الصلاحية' : 'تم منح الصلاحية', 'success'); } catch (e) { SA.fail(e); }
  }
  function sensitivePanel() {
    const roles = hrRoles(); const keys = hrSens();
    return h('div.sap-hrc', {}, SA.alert('warning', h('b', {}, 'الأجور: '), 'HR ومن تمنحه الإدارة صراحةً فقط — المدير العام ليس تلقائيًا (بند 46 Pending). المنح بسبب + Step-up ومن المالك فقط، ولا يمنح أحد نفسه (SOD-10).'),
      h('div.sap-hrc-wrap', {}, h('table.sap-hrc-mx', { 'aria-label': 'الصلاحيات الحساسة × الأدوار' }, h('thead', {}, h('tr', {}, h('th', {}, 'الصلاحية الحساسة'), roles.map((r) => h('th', {}, r.nameEn.split('/')[0].trim())))), h('tbody', {}, keys.map((s) => h('tr', {}, h('td', {}, h('b', {}, s.label), h('small.t-muted', { style: { display: 'block' } }, s.key + ' · ' + (s.desc || '').slice(0, 50))), roles.map((r) => { const has = SA.roleSensitive(r, s.key); return h('td', {}, h('button.sap-linkbtn', { type: 'button', style: { textDecoration: 'none' }, 'aria-label': (has ? 'مفعّل: ' : 'غير مفعّل: ') + r.nameAr + ' — ' + s.label, title: isOwner() ? 'انقر لـ' + (has ? 'سحب' : 'منح') : 'للقراءة — المنح للمالك', onclick: () => toggleSens(r, s) }, has ? h('span', {}, h('i.sap-hrc-dotc.ok'), 'مُنحت') : h('span.t-muted', {}, '—'))); }))))),
      ), h('div.sap-hrc-legend', {}, h('span', {}, h('i.sap-hrc-dotc.ok'), 'مُنحت للدور'), h('span', {}, '— غير ممنوحة'), h('span', {}, isOwner() ? 'انقر خلية لمنح/سحب (سبب + Step-up)' : 'القراءة فقط لك — المنح للمالك')));
  }
  function tiersPanel() {
    const TIER = [['T0 عام', 'الاسم، المسمى، القسم، تليفون العمل', 'مرئي للكل', 'info'], ['T1 داخلي', 'الوردية، حضور الفريق، تواريخ الإجازات (بدون السبب)', 'حسب النطاق (ذاتي/فريق/قسم)', 'info'], ['T2 مقيّد', 'رقم قومي، حساب بنكي، المعالون، عنوان شخصي', 'HR وPayroll — الكشف الكامل hr.pii.reveal ويُسجَّل', 'warning'], ['T3 سري', 'الأجر، البدلات، السلف، الخصومات', 'hr.salary.view — منح صريح', 'danger'], ['T4 سري جدًا', 'الطبي، التأديبي، القضايا، أسباب الإنهاء', 'OHS / HR Manager فقط بمفاتيح منفصلة', 'danger']];
    const field = (label, tier, show, masked, why) => h('tr', {}, h('td', {}, label), h('td', {}, SA.chip(tier, tier === 'T0' || tier === 'T1' ? 'info' : tier === 'T2' ? 'warning' : 'danger')), h('td', {}, show ? h('b', {}, masked ? masked[0] : 'ظاهر') : h('span.sap-hrc-sens', {}, SA.icon('lock', 'icon-sm'), masked ? masked[1] : 'مخفي')), h('td.t-muted', {}, why));
    return h('div.sap-hrc', {}, SA.card({ title: 'طبقات السرية T0–T4', tags: SA.tag('pending', 'Pending بند 5/25/46') }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الطبقة', 'البيانات', 'من يراها'].map((x) => h('th', {}, x)))), h('tbody', {}, TIER.map((t) => h('tr', {}, h('td', {}, SA.chip(t[0], t[3])), h('td', {}, t[1]), h('td', {}, t[2]))))))),
      SA.card({ title: 'ماذا أرى أنا؟ — إخفاء حقلي على سجل موظف تجريبي', tags: SA.tag('new') }, h('p.t-muted', {}, 'الإخفاء افتراضي: آخر 4 أرقام، والكشف = سبب + Step-up + تدقيق (BR-ACL-10). الواجهة تخفي المفاتيح الحساسة بدل تعطيلها عندما يكشف وجودها معلومة (BR-ACL-15).'), h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الحقل', 'الطبقة', 'قيمتك', 'السبب'].map((x) => h('th', {}, x)))), h('tbody', {},
        field('الاسم والمسمى', 'T0', true, ['مصطفى عوض — فني تشغيل'], 'متاح للجميع'), field('الوردية وتواريخ الإجازات', 'T1', SA.can('hr.employees.view') || SA.can('hr.ess.use'), null, 'يتبع النطاق'), field('الرقم القومي', 'T2', true, SA.can('hr.pii.reveal') ? ['يمكنك الكشف (يُسجَّل)', ''] : ['**********8271', '']), field('الراتب الأساسي', 'T3', K.canSal(), K.canSal() ? ['8,500 ج.م (تجريبي)', ''] : [null, '••• (سري)'], 'hr.salary.view'), field('السجل الطبي', 'T4', SA.canSensitive('hr.medical.view'), null, 'hr.medical.view'), field('الجزاءات والتحقيقات', 'T4', SA.canSensitive('hr.discipline.view'), null, 'hr.discipline.view'), field('القضايا', 'T4', SA.canSensitive('hr.legal.view'), null, 'hr.legal.view'))))));
  }
  const SOD = [['SOD-01', 'من ينشئ تغيير مرتب أو سلفة أو حساب بنكي لا يعتمده', 'حظر آلي على نفس المستخدم', 'المرتبات (HR-07/15)'], ['SOD-02', 'تغيير الحساب البنكي: شخص ثانٍ + إشعار للموظف + تأخير {24 ساعة}', 'حظر + مؤقّت', 'الملف (HR-06)'], ['SOD-03', 'من يحسب المخالصة غير من يصرفها', 'حظر آلي', 'المخالصات (HR-25)'], ['SOD-04', 'HR لا يعدّل ملفه أو ملف أقاربه (القرابة حقل بيانات)', 'حظر عند التعديل + إشعار للمراجع', 'الملف (HR-06)'], ['SOD-05', 'مدير النظام لا يرى أجورًا ولا بيانات طبية', 'إخفاء على مستوى الـAPI', 'مفعّل: SA.redact / hr.salary.view'], ['SOD-06', 'التفويض محدد بمدة، مسجّل، ولا يسمح باعتماد الذات', 'حظر + انتهاء تلقائي', 'مفعّل هنا'], ['SOD-07', 'تجهيز المرتبات واعتمادها وإطلاقها بثلاثة أشخاص لكل دورة', 'حظر على مستوى الدورة', 'المرتبات (HR-14)'], ['SOD-08', 'مقدّم أي طلب HR لا يعتمده حتى لو كان مخوّلًا', 'حظر + تحويل للمستوى الأعلى', 'مفعّل هنا: التوظيف · العروض · الإعدادات القانونية'], ['SOD-09', 'المحقّق في المخالفة لا يقرّر الجزاء منفردًا', 'قرار مزدوج مطلوب', 'الجزاءات (HR-20)'], ['SOD-10', 'لا يمنح أحد نفسه صلاحية حساسة', 'حظر + تدقيق', 'مفعّل هنا'], ['SOD-11', 'لا يراجع أحد صلاحياته بنفسه في المراجعة الربع سنوية', 'تعيين مراجع بديل تلقائي', 'مفعّل هنا']];
  function sodPanel() {
    const blocked = get('audit').filter((e) => e.target && e.target.type === 'sod').slice(0, 12);
    return h('div.sap-hrc', {}, SA.card({ title: 'قواعد فصل المهام (SoD)', flush: true, tags: SA.tag('pending', 'README §7.3') }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الكود', 'القاعدة', 'الإجراء', 'التطبيق'].map((x) => h('th', {}, x)))), h('tbody', {}, SOD.map((r) => h('tr', {}, h('td', {}, h('b', {}, r[0])), h('td', {}, r[1]), h('td', {}, r[2]), h('td', {}, r[3].indexOf('مفعّل') === 0 ? SA.chip(r[3], 'success') : SA.chip(r[3], 'info')))))))),
      SA.card({ title: 'سجل الانتهاكات المحجوبة', tags: SA.chip(blocked.length + ' محاولة', blocked.length ? 'warning' : 'neutral') }, blocked.length ? h('ul.sap-hrc-chk', {}, blocked.map((e) => h('li', {}, h('span.t', {}, h('b', {}, e.target.id + ' — ' + e.target.label), h('small', {}, SA.userName(e.actor.id) + ' · ' + SA.fmt.dt(e.ts) + (e.reason ? ' — ' + e.reason : ''))), SA.chip('محجوب', 'danger')))) : SA.empty({ icon: 'shield', title: 'لا محاولات محجوبة', text: 'جرّب اعتماد طلب توظيف قدّمته أنت: يُحجب ويظهر هنا.' })));
  }
  const DEL_TYPES = [['hiring_requisition', 'طلبات التوظيف'], ['job_offer', 'العروض الوظيفية'], ['legal_setting', 'الإعدادات القانونية'], ['leave', 'الإجازات'], ['advance', 'السلف (حساس)'], ['payroll_run', 'كشف المرتبات (حساس)'], ['salary_change', 'تغيير المرتب (حساس)'], ['final_settlement', 'المخالصات (حساس)']];
  const SENSITIVE_T = ['advance', 'payroll_run', 'salary_change', 'final_settlement'];
  const delStatus = (d) => (d.status === 'revoked' ? 'revoked' : new Date(d.to) < new Date() ? 'expired' : new Date(d.from) > new Date() ? 'scheduled' : 'active');
  function delegationForm() {
    const me = K.me(); const toU = SA.form.field({ name: 'to', label: 'المفوَّض إليه', type: 'select', required: true, options: [['', 'اختر…']].concat(get('users').filter((u) => u.status === 'active' && u.id !== me.id).map((u) => [u.id, u.name + ' — ' + SA.roleName(u.roleId)])) });
    const types = SA.form.field({ name: 'types', label: 'نوع الطلبات المفوَّضة', type: 'multi', required: true, options: DEL_TYPES.map((t) => [t[0], t[1], SENSITIVE_T.indexOf(t[0]) >= 0 ? 'لا يفوَّض بدون المالك' : undefined, SENSITIVE_T.indexOf(t[0]) >= 0 && !isOwner() ? 'disabled' : undefined]), hint: 'لا يُفوَّض اعتماد حساس بدون المالك (BR-ACL-09).' });
    const from = SA.form.field({ name: 'from', label: 'من', type: 'date', required: true, value: K.ymd(new Date()) }); const to = SA.form.field({ name: 'dto', label: 'إلى', type: 'date', required: true, value: K.ymd(K.addDays(new Date(), 7)) });
    const why = SA.form.field({ name: 'why', label: 'السبب', type: 'textarea', rows: 2, required: true }); const g = SA.form.group([toU, types, from, to, why]);
    const m = SA.modal({ title: 'تفويض مؤقت بمدة', icon: 'swap', size: 'md', body: h('div.sap-confirm', {}, SA.alert('info', 'التفويض محدد بمدة ومسجّل وينتهي تلقائيًا، ولا يسمح باعتماد الذات: المفوَّض إليه لا يعتمد طلبًا قدّمه المفوِّض (SOD-06). أقصى مدة {Open}.'), h('div.sap-formgrid', {}, toU.el, from.el, to.el), types.el, why.el), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'إنشاء التفويض', kind: 'primary', onClick: async () => {
      if (!g.validate()) return; const v = g.get(); if (v.dto < v.from) { to.error('تاريخ النهاية قبل البداية.'); return; } if (v.dto < K.ymd(new Date())) { to.error('تاريخ النهاية في الماضي.'); return; }
      const rec = { id: st.nextId('hrDelegations', 'DG', 3), fromUserId: me.id, toUserId: v.to, types: v.types, from: new Date(v.from).toISOString(), to: new Date(v.dto + 'T23:59:59').toISOString(), reason: v.why, status: 'active', createdBy: me.id, createdAt: new Date().toISOString() };
      await SA.api(() => { st.insert('hrDelegations', rec, true); SA.audit('HR.ACL.DELEGATION_CREATED', { target: { type: 'delegation', id: rec.id, label: me.name + ' ← ' + SA.userName(v.to) }, after: { types: v.types.join('، '), from: v.from, to: v.dto }, reason: v.why }); }); SA.notify({ title: 'فُوّضت إليك صلاحية اعتماد مؤقتة', body: 'من ' + me.name + ' حتى ' + SA.fmt.date(v.dto) + '.', level: 'action', toUsers: [v.to], link: '#/hr/dashboard' }); m.close(); SA.toast('تم إنشاء التفويض', 'success'); } })] });
  }
  function delegationsPanel() {
    const t = K.table({ caption: 'التفويضات', rows: () => get('hrDelegations'), pageSize: 8,
      columns: [{ key: 'id', label: 'الرقم', render: (d) => h('b', {}, d.id) }, { key: 'f', label: 'من ← إلى', render: (d) => SA.userName(d.fromUserId) + ' ← ' + SA.userName(d.toUserId) }, { key: 't', label: 'النوع', render: (d) => (d.types && d.types.length ? d.types.map((x) => (DEL_TYPES.find((y) => y[0] === x) || [0, x])[1]).join('، ') : 'كل طلبات HR') }, { key: 'p', label: 'المدة', render: (d) => SA.fmt.date(d.from) + ' → ' + SA.fmt.date(d.to) }, { key: 'r', label: 'السبب', render: (d) => d.reason }, { key: 's', label: 'الحالة', render: (d) => { const s = delStatus(d); return SA.chip({ active: 'ساري', expired: 'منتهٍ', revoked: 'مُلغى', scheduled: 'مجدول' }[s], s === 'active' ? 'success' : s === 'scheduled' ? 'info' : 'neutral'); } }],
      rowActions: (d) => [{ label: 'إلغاء التفويض', icon: 'xcircle', danger: true, disabled: delStatus(d) === 'active' || delStatus(d) === 'scheduled' ? (d.fromUserId === K.me().id || isOwner() ? false : 'للمفوِّض أو المالك') : 'غير ساري', onClick: async () => { const r = await SA.confirm({ title: 'إلغاء التفويض ' + d.id, danger: true, confirmLabel: 'إلغاء التفويض', reasonRequired: true }); if (!r.ok) return; st.update('hrDelegations', (l) => { l.find((x) => x.id === d.id).status = 'revoked'; }); SA.audit('HR.ACL.DELEGATION_REVOKED', { target: { type: 'delegation', id: d.id, label: SA.userName(d.fromUserId) + ' ← ' + SA.userName(d.toUserId) }, reason: r.reason }); SA.toast('أُلغي التفويض', 'success'); } }],
      empty: { icon: 'swap', title: 'لا تفويضات', text: 'فوّض اعتماد طلبات لفترة محددة أثناء الإجازة.', action: { label: 'تفويض جديد', perm: 'hr.acl.view', onClick: delegationForm } } });
    return h('div.sap-hrc', {}, h('div.cluster', {}, SA.btn({ label: 'تفويض جديد', icon: 'plus', kind: 'primary', perm: 'hr.acl.view', onClick: delegationForm }), h('span.t-muted', {}, 'التفويض النشط يظهر في «لوحة HR» لدى المفوَّض إليه ويُحترم عند القرار.')), SA.card({ flush: true }, t.el));
  }
  function viewAsPanel(S) {
    const roles = get('roles').filter((r) => r.status === 'active'); S.va = S.va || 'R-14';
    const sel = SA.form.field({ name: 'r', label: 'اعرض كدور', type: 'select', value: S.va, options: roles.map((r) => [r.id, r.nameAr]), onChange: (v) => { S.va = v; S.vaOn = false; K.tick(); } });
    const role = SA.roleById(S.va);
    const out = S.vaOn && role ? h('div.sap-hrc', {}, SA.alert('warning', h('b', {}, 'وضع المعاينة للقراءة فقط: '), 'تقاطع صلاحيتك وصلاحية «' + role.nameAr + '» — لا تنفيذ، بمهلة 15 دقيقة {Open}، ومسجّل (BR-ACL-13).'),
      SA.card({ title: 'ما الذي يراه «' + role.nameAr + '» في HR؟' }, h('ul.sap-hrc-chk', {}, SA.hrNav.map((n) => { const can = SA.roleCan(role, n.perm); const mine = SA.can(n.perm); return h('li', {}, h('span.t', {}, h('b', {}, n.title), h('small', {}, n.perm)), can ? (mine ? SA.chip('يراها', 'success') : SA.chip('يراها (خارج صلاحيتك للمعاينة)', 'warning')) : h('span.t-muted', {}, 'لا يراها')); }))),
      SA.card({ title: 'الحقول الحساسة' }, SA.kv([['الراتب (T3)', SA.roleSensitive(role, 'hr.salary.view') ? (K.canSal() ? '8,500 ج.م (تجريبي)' : '••• (سري عنك)') : '••• (سري عنه)'], ['السجل الطبي (T4)', SA.roleSensitive(role, 'hr.medical.view') ? 'مسموح' : '—'], ['الجزاءات (T4)', SA.roleSensitive(role, 'hr.discipline.view') ? 'مسموح' : '—'], ['كشف الرقم القومي', SA.roleSensitive(role, 'hr.pii.reveal') ? 'مسموح (يُسجَّل)' : '—']]))) : SA.card({}, SA.empty({ icon: 'eye', title: 'اختر دورًا وابدأ المعاينة', text: 'نفس شاشات HR بصلاحيات الدور المختار — بدون تنفيذ أي إجراء.' }));
    return h('div.sap-hrc', {}, h('div.sap-hrc-hdr', {}, sel.el, SA.btn({ label: 'بدء المعاينة', icon: 'eye', kind: 'primary', perm: 'hr.acl.view', onClick: () => { S.vaOn = true; SA.audit('HR.ACL.VIEW_AS', { target: { type: 'role', id: role.id, label: role.nameAr }, after: { mode: 'read-only' } }); K.tick(); } })), out);
  }
  async function startReview() {
    const open = get('hrAccessReviews').find((r) => r.status === 'open'); if (open) { SA.toast('توجد حملة مفتوحة (' + open.id + ') — أغلقها أولًا.', 'warn'); return; }
    const users = get('users').filter((u) => u.status === 'active').filter((u) => { const r = SA.roleById(u.roleId); return r && (r.sa[0] === '*' || (r.sensitive || []).some((k) => k.indexOf('hr.') === 0 || k === '*')); });
    const items = users.map((u) => { const r = SA.roleById(u.roleId); const rev = (u.roleId === 'R-11' || r.isProtected) ? (u.id === 'U-01' ? 'U-02' : 'U-01') : 'U-08'; const reviewer = rev === u.id ? 'U-01' : rev; return { id: SA.uid('RI'), userId: u.id, roleId: u.roleId, keys: r.sensitive[0] === '*' ? ['كل الصلاحيات الحساسة'] : (r.sensitive || []).filter((k) => k.indexOf('hr.') === 0), reviewerId: reviewer, decision: null, decidedAt: null, reason: '' }; });
    const q = 'AR-' + new Date().getFullYear() + '-Q' + (Math.floor(new Date().getMonth() / 3) + 1);
    const r = await SA.confirm({ title: 'بدء المراجعة الربع سنوية ' + q, confirmLabel: 'بدء الحملة', impact: [items.length + ' مستخدم بصلاحيات حساسة HR سيُراجَعون.', 'المراجع ≠ صاحب الصلاحية — تُوجَّه قائمة مدير HR للمالك تلقائيًا (SOD-11).'] }); if (!r.ok) return;
    st.update('hrAccessReviews', (l) => { l.unshift({ id: q, status: 'open', startedBy: K.me().id, startedAt: new Date().toISOString(), items }); }); SA.audit('HR.ACL.REVIEW_STARTED', { target: { type: 'access_review', id: q, label: 'مراجعة الصلاحيات ' + q }, after: { items: items.length } }); SA.toast('بدأت الحملة ' + q, 'success');
  }
  function decideItem(camp, it, dec) {
    if (it.reviewerId !== K.me().id) { SA.toast('المراجع المعيَّن: ' + SA.userName(it.reviewerId), 'warn'); return; }
    if (it.userId === K.me().id) { K.sodBlock('SOD-11', 'مراجعة صلاحياتك بنفسك', 'فصل مهام: لا يراجع أحد صلاحياته بنفسه.'); return; }
    const go = async (reason) => { st.update('hrAccessReviews', (l) => { const c = l.find((x) => x.id === camp.id); const x = c.items.find((q) => q.id === it.id); x.decision = dec; x.decidedAt = new Date().toISOString(); x.reason = reason || ''; if (c.items.every((q) => q.decision)) c.status = 'closed'; }); SA.audit('HR.ACL.REVIEW_DECIDED', { target: { type: 'access_review', id: camp.id, label: SA.userName(it.userId) + ' — ' + SA.roleName(it.roleId) }, after: { decision: dec === 'keep' ? 'إبقاء' : 'سحب مطلوب' }, reason }); if (dec === 'revoke') SA.notify({ title: 'سحب صلاحية مطلوب بعد المراجعة', body: SA.userName(it.userId) + ' — ' + SA.roleName(it.roleId) + ': ' + reason, level: 'action', to: ['R-01'], link: '#/roles/' + it.roleId }); SA.toast(dec === 'keep' ? 'تم الإبقاء' : 'سُجّل طلب السحب وأُبلغ المالك', 'success'); };
    if (dec === 'revoke') SA.confirm({ title: 'طلب سحب صلاحية', confirmLabel: 'تسجيل', danger: true, reasonRequired: true, impact: ['لا يُسحب تلقائيًا: يُنبَّه المالك لتعديل الدور من «الأدوار والصلاحيات».'] }).then((r) => { if (r.ok) go(r.reason); }); else go('');
  }
  function reviewsPanel() {
    const camps = get('hrAccessReviews');
    return h('div.sap-hrc', {}, h('div.cluster', {}, SA.btn({ label: 'بدء حملة مراجعة ربع سنوية', icon: 'play', kind: 'primary', perm: 'hr.acl.view', reason: isOwner() || K.me().roleId === 'R-11' ? '' : 'للمالك أو HR Manager', onClick: startReview }), h('span.t-muted', {}, 'مراجعة إلزامية كل ربع (BR-ACL-12): المراجع ≠ صاحب الصلاحية.')),
      camps.length ? camps.map((c) => SA.card({ title: c.id, tags: [SA.chip(c.status === 'open' ? 'مفتوحة' : 'مغلقة', c.status === 'open' ? 'warning' : 'success'), SA.chip(c.items.filter((i) => i.decision).length + ' / ' + c.items.length, 'info')], flush: true }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['المستخدم', 'الدور', 'الصلاحيات الحساسة', 'المراجع', 'القرار', ''].map((x) => h('th', {}, x)))), h('tbody', {}, c.items.map((it) => h('tr', {}, h('td', {}, SA.userName(it.userId)), h('td', {}, SA.roleName(it.roleId)), h('td', {}, h('small', {}, it.keys.length > 3 ? it.keys.slice(0, 3).join('، ') + ' +' + (it.keys.length - 3) : it.keys.join('، ') || '—')), h('td', {}, SA.userName(it.reviewerId)), h('td', {}, it.decision ? SA.chip(it.decision === 'keep' ? 'إبقاء' : 'سحب مطلوب', it.decision === 'keep' ? 'success' : 'danger') : SA.chip('بانتظار', 'warning')), h('td', {}, it.decision ? null : h('div.cluster', {}, SA.btn({ label: 'إبقاء', kind: 'ghost', size: 'sm', reason: it.reviewerId === K.me().id ? '' : 'المراجع: ' + SA.userName(it.reviewerId), onClick: () => decideItem(c, it, 'keep') }), SA.btn({ label: 'سحب', kind: 'danger', size: 'sm', reason: it.reviewerId === K.me().id ? '' : 'المراجع: ' + SA.userName(it.reviewerId), onClick: () => decideItem(c, it, 'revoke') }))))))))) ) : SA.card({}, SA.empty({ icon: 'checkcircle', title: 'لا حملات مراجعة بعد', text: 'ابدأ أول حملة لمراجعة من يملك صلاحيات حساسة.' })));
  }
  function readLogPanel() {
    const codes = ['HR.SALARY.VIEWED', 'HR.EMPLOYEE.PII_REVEALED', 'HR.EXPORT.SENSITIVE', 'HR.ACL.VIEW_AS']; const t = K.table({ caption: 'سجل القراءة الحساسة', rows: () => get('audit').filter((e) => codes.indexOf(e.code) >= 0), pageSize: 10, filters: [{ key: 'code', label: 'النوع', options: codes.map((c) => [c, SA.auditLabel(c)]) }], search: { placeholder: 'ابحث…', keys: [(e) => e.actor.name, (e) => (e.target ? e.target.label : '')] },
      columns: [{ key: 'ts', label: 'الوقت', sort: true, value: (e) => e.ts, render: (e) => SA.fmt.dt(e.ts) }, { key: 'a', label: 'من', render: (e) => e.actor.name }, { key: 'code', label: 'الحدث', render: (e) => SA.auditLabel(e.code) }, { key: 't', label: 'الهدف', render: (e) => (e.target ? e.target.label : '—') }, { key: 'r', label: 'السبب', render: (e) => e.reason || '—' }], empty: { icon: 'eye', title: 'لا قراءات حساسة مسجّلة', text: 'كل اطلاع على أجر أو كشف بيانات شخصية يظهر هنا (append-only).' } });
    return h('div.sap-hrc', {}, SA.alert('info', 'السجل للقراءة فقط (append-only) — العرض الكامل في «سجل الاطلاع على الحساس» بالإدارة.'), SA.card({ flush: true }, t.el));
  }
  function render(root, ctx) {
    K.crumbs(ctx, 'hr-set', 'صلاحيات HR والسرية');
    return K.screen(root, ctx, { perm: 'hr.acl.view', route: 'hr/acl', def: 'matrix', title: 'الصلاحيات', paths: ['roles', 'users', 'hrDelegations', 'hrAccessReviews', 'audit'],
      tabs: () => [{ id: 'matrix', label: 'المصفوفة', icon: 'grid' }, { id: 'sensitive', label: 'الصلاحيات الحساسة', icon: 'key' }, { id: 'tiers', label: 'طبقات السرية T0–T4', icon: 'layers' }, { id: 'sod', label: 'فصل المهام', icon: 'shield' }, { id: 'deleg', label: 'التفويض', icon: 'swap', badge: get('hrDelegations').filter((d) => delStatus(d) === 'active').length || null }, { id: 'viewas', label: 'عرض كدور', icon: 'eye' }, { id: 'reviews', label: 'مراجعة الصلاحيات', icon: 'checkcircle' }, { id: 'readlog', label: 'سجل القراءة', icon: 'history' }],
      head: () => SA.pageHead({ title: 'صلاحيات HR والسرية وفصل المهام', desc: 'من يرى ماذا في HR: مصفوفة حيّة من أدوار النظام، وطبقات سرية، وقواعد فصل مهام تُطبَّق فعليًا، وتفويض بمدة، ومراجعة ربع سنوية.', tags: [SA.tag('pending', 'بند 5/24/25/46')], actions: [K.spec('hr-platform.html', 'scr-acl-01')] }),
      panel(tab, S) { return ({ matrix: matrixPanel, sensitive: sensitivePanel, tiers: tiersPanel, sod: sodPanel, deleg: delegationsPanel, viewas: viewAsPanel, reviews: reviewsPanel, readlog: readLogPanel }[tab] || matrixPanel)(S); } });
  }
  SA.register(Object.assign({}, K.NAV('hr-acl'), { app: 'hr', render, stub: false }));
})();
/* ───────────────────────── part 8 — HR-33 الإشعارات والتذكيرات (كتالوج N-01…N-52) + مهام Test Lab ───────────────────────── */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store, K = SA.hrCore, get = K.get;
  const RC = { DEPT: ['رئيس القسم', null], HRM: ['HR Manager', 'R-11'], HRO: ['HR Officer', 'R-12'], PAY: ['مسؤول المرتبات', 'R-13'], FIN: ['المالية', 'R-07'], GM: ['المدير العام', 'R-02'], SUP: ['المشرف', 'R-14'], OHS: ['OHS', 'R-15'], EMP: ['الموظف', 'R-16'], SYS: ['مدير النظام / IT', 'R-10'], CAND: ['المرشح', null], COM: ['لجنة المقابلة', null], LEG: ['الشؤون القانونية', null], STO: ['المخزن', null], PROD: ['مدير الإنتاج', 'R-05'] };
  const CH = { IA: 'داخل التطبيق', WA: 'WhatsApp', SMS: 'SMS', EM: 'بريد', KS: 'بانر الكشك' };
  const UR = { U: ['عاجل', 'danger'], A: ['إجراء', 'info'], I: ['معلومة', 'neutral'] };
  // code, group, event, recipients, channels, urgency, template
  const N = [
    ['N-01', 'التخطيط', 'ميزانية العدد الوظيفي تحتاج اعتماداً', 'DEPT HRM FIN GM', 'IA EM', 'A', 'ميزانية العدد الوظيفي لقسم {القسم} بانتظار اعتمادك. افتح الطلب للمراجعة.'], ['N-02', 'التخطيط', 'تقديم طلب توظيف', 'HRM', 'IA WA', 'A', 'طلب توظيف «{الوظيفة}» من {القسم} بانتظار قرارك.'], ['N-03', 'التخطيط', 'اعتماد أو رفض طلب توظيف', 'SUP HRO', 'IA WA', 'I', 'تم {اعتماد/رفض} طلب توظيف «{الوظيفة}». التفاصيل في الطلب.'],
    ['N-04', 'الاستقطاب', 'طلب تقديم جديد / انتهاء الفرز', 'HRO', 'IA', 'I', 'وصل طلب تقديم جديد لوظيفة «{الوظيفة}».'], ['N-05', 'الاستقطاب', 'موعد مقابلة / عدم حضور مرشح', 'COM CAND', 'IA WA SMS', 'A', 'مقابلة «{الوظيفة}» يوم {التاريخ} الساعة {الوقت} في مصنع المصرية الألمانية بجمصة. للتأكيد رد بـ 1.'], ['N-06', 'الاستقطاب', 'العرض: أُرسل / قُبل / رُفض / ينتهي خلال 24 ساعة', 'HRM CAND', 'IA WA', 'A', 'عرض العمل لـ{المرشح} ينتهي خلال 24 ساعة. تابع الرد.'],
    ['N-07', 'الاستقطاب', 'نتيجة الكشف الطبي: غير لائق / لائق بقيود', 'HRM OHS', 'IA', 'A', 'توجد نتيجة كشف طبي تحتاج مراجعتك. افتح الملف المحمي لعرضها.'], ['N-08', 'الاستقطاب', 'العقد جاهز للتوقيع / وُقّع', 'HRO EMP GM', 'IA WA', 'A', 'عقد العمل جاهز للتوقيع. راجع النسخ الأربع وحدّد موعد التوقيع.'], ['N-09', 'التعيين', 'موظف جديد يبدأ بعد 3 أيام', 'HRO STO OHS SUP PAY', 'IA WA', 'A', '{الموظف} يبدأ يوم {التاريخ}. جهّز بندك في قائمة التعيين.'],
    ['N-10', 'التعيين', 'مهمة تعيين متأخرة', 'HRO', 'IA WA', 'A', 'مهمة «{المهمة}» في تعيين {الموظف} متأخرة {n} يوم.'], ['N-11', 'التعيين', 'اشتراك التأمينات معلّق أكثر من 3 أيام', 'HRO PAY', 'IA', 'A', 'تسجيل {الموظف} في التأمينات معلّق منذ أكثر من 3 أيام.'], ['N-12', 'التعيين', 'موظف وصل للخط بدون توجيه سلامة', 'OHS SUP HRM', 'IA WA KS', 'U', 'تنبيه سلامة: {الموظف} على الخط بدون توجيه سلامة. أوقف إسناده فوراً.'],
    ['N-13', 'التعيين', 'مراجعة التجربة بعد 7 أيام', 'SUP HRM', 'IA WA', 'A', 'تقييم تجربة {الموظف} مستحق خلال 7 أيام.'], ['N-14', 'التعيين', 'تنتهي التجربة خلال 7 أيام بدون قرار (اليوم 83)', 'HRM DEPT', 'IA WA', 'U', 'تجربة {الموظف} تنتهي خلال 7 أيام ولا يوجد قرار تثبيت. اتخذ القرار الآن.'], ['N-15', 'الملف والتغييرات', 'تغيير بيانات حساسة (بنك / رقم قومي / أجر)', 'HRM EMP', 'IA WA', 'A', 'تم طلب تغيير بيانات حسابك البنكي. لو مش أنت، كلّم HR فوراً.'],
    ['N-16', 'الوقت', 'نشر / تغيير الجدول', 'EMP SUP', 'WA IA KS', 'A', 'تم نشر جدول الأسبوع {الأسبوع}. وردتك: {الوردية} من {الوقت}. اضغط لتأكيد الاستلام.'], ['N-17', 'الوقت', 'الجدول يخالف قاعدة (راحة / سقف / مشغّل غير مؤهل)', 'SUP PROD', 'IA', 'A', 'الجدول يخالف قاعدة: {القاعدة}. عدّل التشكيل قبل النشر.'], ['N-18', 'الوقت', 'بصمة ناقصة / استثناء للمراجعة', 'SUP', 'IA WA', 'A', 'لديك {n} استثناء حضور بانتظار المراجعة اليوم.'],
    ['N-19', 'الوقت', 'تأخير / غياب بدون إخطار', 'SUP HRM', 'IA WA', 'A', '{الموظف} لم يسجّل حضوراً ولم يُبلغ. تواصل معه الآن.'], ['N-20', 'الوقت', 'طلب إجازة', 'SUP HRM', 'IA WA', 'A', 'طلب إجازة من {الموظف} من {التاريخ} إلى {التاريخ} بانتظار قرارك.'], ['N-21', 'الوقت', 'قرار الإجازة', 'EMP', 'WA IA', 'I', 'تم اعتماد إجازتك من {التاريخ} إلى {التاريخ}. إجازة سعيدة.'],
    ['N-22', 'الوقت', 'طلب أوفرتايم / وصول 90% من السقف / تجاوزه', 'PROD SUP HRM', 'IA WA', 'A', 'طلب أوفرتايم من {الموظف} لـ{n} ساعة بانتظار قرارك.'], ['N-23', 'المرتبات', 'قفل المرتبات غداً / استثناءات لم تُحسم', 'PAY HRM SUP', 'IA EM', 'A', 'قفل مرتبات شهر {الشهر} غداً. يوجد {n} استثناء لم يُحسم.'], ['N-24', 'المرتبات', 'اعتماد المرتبات / مفردة المرتب جاهزة', 'EMP FIN GM', 'WA IA', 'I', 'مفردة مرتبك لشهر {الشهر} جاهزة. افتح التطبيق للاطلاع عليها.'],
    ['N-25', 'المرتبات', 'سلفة: طلب / اعتماد / خصم قسط / سداد', 'DEPT HRM FIN EMP', 'IA WA', 'A', 'طلب سلفة من {الموظف} بانتظار قرارك.'], ['N-26', 'التطوير', 'تقييم الأداء مستحق', 'SUP EMP', 'IA WA', 'A', 'تقييم الأداء لدورة {الدورة} مستحق. افتح النموذج.'], ['N-27', 'التطوير', 'شهادة أو كشف طبي ينتهي بعد 60 / 30 / 7 أيام', 'EMP SUP HRO', 'IA WA', 'I', 'مستند «{المستند}» ينتهي بعد {n} يوم. جدّده قبل الانتهاء.'],
    ['N-28', 'التطوير', 'شهادة منتهية والموظف مجدول على الماكينة', 'SUP PROD OHS', 'IA WA KS', 'U', 'تنبيه: {الموظف} مجدول على {الماكينة} وشهادته منتهية. غيّر الإسناد.'], ['N-29', 'الملف والتغييرات', 'سريان ترقية / نقل / تغيير أجر', 'EMP PAY SUP', 'IA WA', 'I', 'تم تفعيل {التغيير الوظيفي} اعتباراً من {التاريخ}. التفاصيل في ملفك.'], ['N-30', 'الحماية', 'إبلاغ مخالفة — يجب بدء التحقيق خلال 7 أيام', 'HRM', 'IA WA', 'A', 'تم الإبلاغ عن مخالفة. يجب بدء التحقيق قبل {التاريخ}.'],
    ['N-31', 'الحماية', 'جلسة سماع / قرار', 'EMP SUP HRO', 'IA WA', 'A', 'تم تحديد جلسة سماع يوم {التاريخ} الساعة {الوقت} في مبنى الإدارة.'], ['N-32', 'الحماية', 'حادث أو إصابة', 'OHS HRM GM', 'WA IA SMS', 'U', 'بلاغ حادث في {الموقع} الساعة {الوقت}. افتح البلاغ الآن وتواصل مع الموقع.'], ['N-33', 'الحماية', 'إجراء تصحيحي متأخر / بلاغ شبه حادث', 'OHS', 'IA WA', 'A', 'إجراء تصحيحي «{الإجراء}» متأخر {n} يوم.'],
    ['N-34', 'الحماية', 'شهادة مرضية معلّقة / موعد عودة للعمل', 'HRO SUP', 'IA', 'A', 'شهادة مرضية لـ{الموظف} معلّقة. تابع الاستلام أو موعد العودة.'], ['N-35', 'الحماية', 'جلسة محكمة بعد 7 / 2 يوم / قضية جديدة', 'HRM LEG GM', 'IA WA EM', 'A', 'جلسة قضية {الرقم} بعد {n} يوم. راجع الملف.'], ['N-36', 'الاحتفاظ', 'مكافأة / تقدير معتمد', 'EMP SUP', 'WA KS', 'I', 'مبروك! تم اعتماد تقدير لك. شكراً على مجهودك.'],
    ['N-37', 'الاحتفاظ', 'استطلاع نبض مفتوح', 'EMP', 'WA KS', 'I', 'استطلاع قصير من 3 أسئلة مفتوح الآن. رأيك يهمنا.'], ['N-38', 'الاحتفاظ', 'علم خطر الاحتفاظ', 'HRM', 'IA', 'I', 'تم رصد مؤشر خطر على احتفاظ {الموظف}. راجع المؤشر.'], ['N-39', 'الإنهاء', 'استقالة مقدّمة / تصديق مكتب العمل معلّق / رد خلال 10 أيام', 'HRM DEPT GM', 'IA WA', 'A', 'استقالة {الموظف} بانتظار الرد. المتبقي {n} أيام من مهلة العشرة.'],
    ['N-40', 'الإنهاء', 'سحب الاستقالة خلال مهلة 10 أيام', 'HRO DEPT', 'IA WA', 'A', '{الموظف} سحب استقالته. راجع الحالة.'], ['N-41', 'الإنهاء', 'مقابلة ختامية', 'HRO EMP', 'IA', 'I', 'تم تحديد مقابلة ختامية يوم {التاريخ} الساعة {الوقت}.'], ['N-42', 'الإنهاء', 'بند إخلاء طرف معلّق (لكل قسم)', 'DEPT', 'IA WA', 'A', 'بند إخلاء الطرف الخاص بقسمك لـ{الموظف} بانتظار توقيعك.'],
    ['N-43', 'الإنهاء', 'المخالصة جاهزة للاعتماد / مدفوعة', 'HRM FIN EMP', 'IA WA', 'A', 'مخالصة {الموظف} جاهزة للاعتماد.'], ['N-44', 'الإنهاء', 'خروج التأمينات / شهادة الخبرة جاهزة', 'HRO EMP', 'IA WA', 'I', 'شهادة الخبرة جاهزة للاستلام من إدارة الموارد البشرية.'], ['N-45', 'الامتثال', 'علاوة سنوية مستحقة', 'HRM FIN', 'IA EM', 'A', 'يوجد {n} موظف تجاوزوا 12 شهراً بدون علاوة. راجع القائمة.'],
    ['N-46', 'الامتثال', 'حصة ذوي الإعاقة / سجل قانوني خارج الالتزام', 'HRM GM', 'IA EM', 'A', 'مؤشر الامتثال: {البند} خارج الالتزام. راجع لوحة الامتثال.'], ['N-47', 'الامتثال', 'تغيّر حدّي الأجر التأميني في يناير', 'PAY HRM FIN', 'EM IA', 'A', 'حدّا الأجر التأميني لسنة {السنة} يحتاجان إدخالاً واعتماداً قبل أول كشف.'], ['N-48', 'الامتثال', 'تقويم العطلات الرسمية يحتاج تأكيداً', 'HRM', 'IA', 'A', 'تقويم عطلات {السنة} يحتاج إدخال أو تأكيد التواريخ بعد الإعلان.'],
    ['N-49', 'النظام', 'الكشك/الجهاز غير متصل أكثر من 15 دقيقة', 'HRO SYS', 'IA SMS', 'U', 'الجهاز {الجهاز} غير متصل منذ {n} دقيقة. راجع الاتصال والمزامنة.'], ['N-50', 'النظام', 'تصدير جماعي T3/T4 / محاولات دخول فاشلة / تغيير دور', 'SYS GM', 'EM IA', 'U', 'تنبيه أمني: {الحدث} من المستخدم {المستخدم}. افتح سجل الوصول.'], ['N-51', 'الوقت', 'عدد المقاولين اليومي أُرسل / يختلف عن بوابة الدخول', 'PROD HRM', 'IA', 'A', 'عدد عمالة {المقاول} اليوم يختلف عن عدّ البوابة. راجع الكشف.'], ['N-52', 'الملف والتغييرات', 'اقتراح خصم خسارة/تلف عهدة', 'HRO EMP', 'IA WA', 'A', 'تم اقتراح خصم بسبب عهدة «{العهدة}». افتح التفاصيل للرد.']
  ].map((r) => ({ code: r[0], group: r[1], event: r[2], rec: r[3].split(' '), ch: r[4].split(' '), urg: r[5], tpl: r[6] }));
  K.NOTIF = N;
  const SAMPLE = { 'القسم': 'خط الألومنيوم', 'الوظيفة': 'فني تشغيل', 'الموظف': 'مصطفى عوض', 'التاريخ': '12 نوفمبر', 'الوقت': '10:30', 'n': '3', 'المرشح': 'هاني فتحي', 'الشهر': 'نوفمبر', 'المستند': 'شهادة السلامة', 'الماكينة': 'ماكينة القص 2', 'الإجراء': 'تركيب حاجز وقاية', 'الرقم': '1204', 'القاعدة': 'يوم الراحة الأسبوعية', 'الأسبوع': '46', 'الوردية': 'A', 'التغيير الوظيفي': 'الترقية', 'السنة': '2027', 'الجهاز': 'كشك البوابة', 'الحدث': 'تصدير جماعي', 'المستخدم': 'سيد رمضان', 'المهمة': 'تجهيز الزي', 'الدورة': 'الربع الرابع', 'الموقع': 'خط التركيب', 'البند': 'حصة ذوي الإعاقة', 'المقاول': 'مقاول الدهان', 'العهدة': 'جهاز لاسلكي', 'اعتماد/رفض': 'اعتماد' };
  const fill = (t) => String(t).replace(/\{([^}]+)\}/g, (m, k) => (SAMPLE[k] != null ? SAMPLE[k] : m));
  const LINT = /(\d{3,}\s*(ج\.?\s?م|جنيه))|(\d{10,})|(تشخيص|حساب بنكي|رقم قومي|راتب\s*\d|أجر\s*\d)/;
  K.lintTemplate = (t) => { const m = LINT.exec(t); return m ? m[0] : null; };
  const cfg = () => st.get('hrNotifCfg') || {};
  const eff = (n) => Object.assign({ enabled: true, mode: 'proposed' }, n, cfg()[n.code] || {});
  const uNames = (rec) => rec.map((c) => RC[c] ? RC[c][0] : c);
  const lvl = (u) => (u === 'U' ? 'urgent' : u === 'A' ? 'action' : 'info');

  function bubble(e, chan) {
    const body = fill(e.tpl); const bad = K.lintTemplate(e.tpl);
    const head = { IA: 'EG HR · داخل التطبيق', WA: 'WhatsApp · قالب Utility', SMS: 'SMS · مصنع المصرية الألمانية', EM: 'البريد · EG HR', KS: 'بانر الكشك' }[chan];
    return h('div.sap-hrc-tpl', {}, h('div.h', {}, SA.icon(chan === 'WA' || chan === 'SMS' ? 'phone' : chan === 'EM' ? 'mail' : 'bell', 'icon-sm'), head), h('div', {}, body), h('small.t-muted', {}, e.urg === 'U' ? 'عاجل — لا يخضع لساعات الهدوء' : chan === 'KS' ? 'يُعرض على شاشة الكشك للوردية' : 'اضغط لفتح الطلب (deep link)'), bad ? SA.alert('danger', h('b', {}, 'Lint: '), 'النص فيه بيانات حساسة («' + bad + '»). الإشعار يقول «افتح التطبيق» بس.') : null);
  }
  function drawer(code) {
    const base = N.find((x) => x.code === code); let e = eff(base); const can = SA.can('hr.settings.edit'); let chan = e.ch[0] || 'IA'; const body = h('div'); let dr;
    const chans = Object.keys(CH).reduce((a, k) => { a[k] = e.ch.indexOf(k) >= 0; return a; }, {}); const roles = {}; base.rec.forEach((c) => { roles[c] = (e.roles ? e.roles.indexOf(c) >= 0 : true); }); let urg = e.urg; let tpl = e.tpl; let enabled = e.enabled;
    const draw = () => {
      SA.clear(body); const cur = Object.assign({}, base, { tpl, urg });
      const lint = K.lintTemplate(tpl); const cantDisable = base.code === 'N-50' || urg === 'U';
      body.append(SA.alert('warning', h('b', {}, 'مقترح فقط (Draft): '), 'التفعيل لا يُرسل قبل اعتماد التشغيل — بند 18. لا ساعات هدوء ولا مستلمين نهائيين بعد.'),
        SA.kv([['الحدث', h('b', {}, base.event)], ['المجموعة', base.group], ['المستلمون (حسب الدور وقت الحدث)', h('div.cluster', {}, base.rec.map((c) => h('label.check', {}, h('input', { type: 'checkbox', checked: roles[c], disabled: !can, onchange: (x) => { roles[c] = x.target.checked; } }), RC[c] ? RC[c][0] : c)))], ['القنوات', h('div.cluster', {}, Object.keys(CH).map((k) => h('label.check', {}, h('input', { type: 'checkbox', checked: chans[k], disabled: !can, onchange: (x) => { chans[k] = x.target.checked; chan = chans[k] ? k : chan; } }), CH[k], k !== 'IA' ? h('small.t-muted', {}, ' (غير مُعدّة)') : null)))], ['الإلحاح', can ? SA.segmented([['U', 'عاجل'], ['A', 'إجراء'], ['I', 'معلومة']], urg, (v) => { urg = v; draw(); }) : SA.chip(UR[urg][0], UR[urg][1])], ['التفعيل', h('label.switch', {}, h('input', { type: 'checkbox', checked: enabled, disabled: !can || cantDisable, onchange: (x) => { enabled = x.target.checked; } }), h('span'))]]),
        cantDisable ? h('small.t-muted', {}, 'العاجل والأمان (N-50) لا يمكن إيقافهما (BR-NTF-10).') : null,
        h('div', { style: { marginBlockStart: '12px' } }, h('label.field', {}, h('span.label', {}, 'نص القالب (عربي — بلا مبالغ ولا بيانات طبية)'), h('textarea.textarea', { rows: 3, disabled: !can, oninput: (x) => { tpl = x.target.value; prev.replaceChildren(bubble(Object.assign({}, base, { tpl, urg }), chan)); }, value: tpl }))),
        h('h4', {}, 'معاينة القالب'), SA.segmented(Object.keys(CH).filter((k) => base.ch.indexOf(k) >= 0 || chans[k]).map((k) => [k, CH[k]]), chan, (v) => { chan = v; prev.replaceChildren(bubble(cur, chan)); }));
      const prev = h('div', {}, bubble(cur, chan)); body.append(prev, lint ? SA.alert('danger', 'لا يمكن الحفظ: النص يحتوي بيانات حساسة (Lint).') : null);
      const foot = dr.foot; SA.clear(foot); foot.append(h('button.btn.btn-ghost', { type: 'button', onclick: () => dr.close() }, 'إغلاق'), SA.btn({ label: 'إرسال تجربة لي (داخل التطبيق)', kind: 'ghost', icon: 'bell', onClick: () => { SA.notify({ title: '[تجربة] ' + base.code + ' — ' + base.event, body: fill(tpl), level: lvl(urg), toUsers: [K.me().id], link: '#/hr/settings?tab=catalogue' }); SA.audit('HR.NOTIFICATION.TEST', { target: { type: 'notification', id: base.code, label: base.event }, after: { channel: 'IA' } }); SA.toast('وصلك إشعار تجريبي في الجرس.', 'success'); } }),
        SA.btn({ label: 'حفظ القاعدة', kind: 'primary', perm: 'hr.settings.edit', onClick: () => {
          if (K.lintTemplate(tpl)) { SA.toast('Lint: النص فيه بيانات حساسة — الإشعار يقول «افتح التطبيق» بس.', 'error'); return; } if (!tpl.trim()) { SA.toast('نص القالب مطلوب.', 'error'); return; }
          const nc = { ch: Object.keys(CH).filter((k) => chans[k]), urg, tpl, rec: base.rec, roles: base.rec.filter((c) => roles[c]), enabled: cantDisable ? true : enabled }; if (!nc.ch.length) { SA.toast('اختر قناة واحدة على الأقل.', 'error'); return; }
          const before = { channels: e.ch.join('، '), urgency: UR[e.urg][0], enabled: e.enabled, recipients: (e.roles || base.rec).join('، ') }; st.update('hrNotifCfg', (o) => { o[base.code] = nc; });
          SA.audit('NOTIFICATION.RULE_CHANGED', { target: { type: 'notification', id: base.code, label: base.event }, before, after: { channels: nc.ch.join('، '), urgency: UR[urg][0], enabled: nc.enabled, recipients: nc.roles.join('، ') }, area: 'hr' }); dr.close(); SA.toast('حُفظت القاعدة (مقترح — غير مُرسل قبل اعتماد التشغيل).', 'success'); } }));
    };
    dr = SA.drawer({ title: base.code + ' — ' + base.group, subtitle: base.event, size: 'lg', body, foot: [h('span')] }); draw();
  }
  function cataloguePanel(S) {
    const t = K.table({ caption: 'كتالوج الإشعارات', rows: () => N, rowId: 'code', pageSize: 12, search: { placeholder: 'ابحث في الأحداث أو النصوص…', keys: ['code', 'event', 'tpl'] }, filters: [{ key: 'group', label: 'المجموعة', options: Array.from(new Set(N.map((x) => x.group))).map((g) => [g, g]) }, { key: 'urg', label: 'الإلحاح', options: [['U', 'عاجل'], ['A', 'إجراء'], ['I', 'معلومة']], test: (r, v) => eff(r).urg === v }, { key: 'chn', label: 'القناة', options: Object.keys(CH).map((k) => [k, CH[k]]), test: (r, v) => eff(r).ch.indexOf(v) >= 0 }],
      columns: [{ key: 'code', label: 'الكود', render: (r) => h('b', {}, r.code) }, { key: 'event', label: 'الحدث', render: (r) => h('div', {}, h('b', {}, r.event), h('small.t-muted', {}, r.group)) }, { key: 'rec', label: 'المستلمون', render: (r) => uNames(eff(r).roles || r.rec).join('، ') }, { key: 'ch', label: 'القنوات', render: (r) => h('div.cluster', {}, eff(r).ch.map((k) => SA.chip(k, k === 'IA' ? 'info' : 'neutral'))) }, { key: 'urg', label: 'الإلحاح', render: (r) => SA.chip(UR[eff(r).urg][0], UR[eff(r).urg][1]) }, { key: 'tpl', label: 'نص القالب', render: (r) => h('small', {}, (eff(r).tpl || '').slice(0, 56) + '…') }, { key: 'm', label: 'الحالة', render: (r) => (cfg()[r.code] ? SA.chip('مُعدَّل — مقترح', 'warning') : SA.chip('Draft مقترح', 'neutral')) }],
      onRowClick: (r) => drawer(r.code), empty: { icon: 'bell', title: 'لا أحداث مطابقة' } });
    return h('div.sap-hrc', {}, SA.alert('warning', h('b', {}, 'كل التفعيلات «مقترح» '), 'حتى اعتماد التشغيل (بند 18). نص الإشعار لا يحتوي مبلغًا أو تشخيصًا أو رقمًا قوميًا (Template lint إلزامي — BR-NTF-04). القرار والصلاحيات في الـBackend وليس نص الإشعار.'), SA.card({ flush: true }, t.el));
  }
  function rolesPanel() {
    const roles = Object.keys(RC).filter((k) => RC[k][1]);
    const cnt = (c, ch) => N.filter((n) => { const e = eff(n); return (e.roles || n.rec).indexOf(c) >= 0 && (!ch || e.ch.indexOf(ch) >= 0); }).length;
    return h('div.sap-hrc', {}, SA.alert('info', 'عدد الأحداث التي يستلمها كل دور حسب القناة (من الإعدادات الحالية). المستلم يُحدَّد وقت الحدث بنطاق الدور — مثلًا مشرف الوردية المعنية لا كل المشرفين (BR-NTF-11).'),
      h('div.sap-hrc-wrap', {}, h('table.sap-hrc-mx', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الدور'), h('th', {}, 'كل الأحداث'), Object.keys(CH).map((k) => h('th', {}, CH[k])), h('th', {}, 'عاجل'))), h('tbody', {}, roles.map((c) => h('tr', {}, h('td', {}, h('b', {}, RC[c][0]), h('small.t-muted', { style: { display: 'block' } }, SA.roleName(RC[c][1]))), h('td.on', {}, cnt(c)), Object.keys(CH).map((k) => h('td', { class: cnt(c, k) ? 'on' : 'off' }, cnt(c, k) || '—')), h('td', { class: 'on' }, N.filter((n) => eff(n).urg === 'U' && (eff(n).roles || n.rec).indexOf(c) >= 0).length || '—')))))));
  }
  function channelsPanel() {
    return h('div.sap-hrc', {}, SA.alert('warning', 'القنوات غير مُعدّة بعد: ', 'قنوات WhatsApp وSMS والبريد والكشك تحتاج إعداد المزوّد واعتماد قوالب Meta (Utility بالعربية — BR-NTF-07). المرجعي = مركز الإشعارات داخل النظام (BR-NTF-06).'),
      h('div.sap-grid-2', {}, SA.card({ title: 'القنوات' }, h('ul.sap-hrc-chk', {}, [['IA', 'داخل التطبيق (الجرس)', true], ['WA', 'WhatsApp Business', false], ['SMS', 'SMS', false], ['EM', 'البريد الإلكتروني', false], ['KS', 'بانر الكشك', false]].map((c) => h('li', {}, h('span.t', {}, h('b', {}, c[1]), h('small', {}, c[2] ? 'يعمل في النموذج — يظهر في الجرس' : 'غير مُعدّة — اطلب من مدير النظام')), c[2] ? SA.chip('نشطة', 'success') : SA.chip('غير مُعدّة', 'neutral'))))),
        SA.card({ title: 'ساعات الهدوء والتصعيد', tags: SA.tag('open', 'بند 18') }, SA.kv([['ساعات الهدوء', SA.openValue('{Open}')], ['تأخير SMS الاحتياطي للعاجل', SA.openValue('{N دقيقة Open}')], ['تكرار WhatsApp للعاجل', SA.openValue()], ['المعلومة', 'تخضع لساعات الهدوء عند اعتمادها (BR-NTF-09)'], ['العاجل', 'لا يخضع لساعات الهدوء (BR-NTF-08)']]), h('p.t-muted', {}, 'لا ساعات هدوء ولا مستلمين نهائيين قبل اعتماد التشغيل — تبقى {Open} (BR-NTF-03).'))));
  }
  function deliveryPanel() {
    const t = K.table({ caption: 'سجل التسليم', rows: () => get('notifications').slice(0, 60), pageSize: 10, filters: [{ key: 'level', label: 'الإلحاح', options: [['urgent', 'عاجل'], ['action', 'إجراء'], ['info', 'معلومة']] }], search: { placeholder: 'ابحث…', keys: ['title', 'body'] },
      columns: [{ key: 'ts', label: 'الوقت', value: (n) => n.ts, sort: true, render: (n) => SA.fmt.dt(n.ts) }, { key: 'title', label: 'الإشعار', render: (n) => h('div', {}, h('b', {}, n.title), h('small.t-muted', {}, n.body)) }, { key: 'to', label: 'المستلم', render: (n) => (n.to || []).map((r) => SA.roleName(r)).concat((n.toUsers || []).map((u) => SA.userName(u))).join('، ') || 'الكل' }, { key: 'l', label: 'الإلحاح', render: (n) => SA.chip(n.level === 'urgent' ? 'عاجل' : n.level === 'action' ? 'إجراء' : 'معلومة', n.level === 'urgent' ? 'danger' : n.level === 'action' ? 'info' : 'neutral') }, { key: 'c', label: 'القناة', render: () => SA.chip('IA', 'success') }, { key: 'r', label: 'مقروء', render: (n) => SA.chip((n.readBy || []).length ? 'نعم' : 'لا', (n.readBy || []).length ? 'success' : 'warning') }], empty: { icon: 'inbox', title: 'لا إشعارات بعد' } });
    return h('div.sap-hrc', {}, SA.alert('info', 'سجل append-only. أرقام الهواتف في سجل التسليم مقنّعة (BR-NTF-13) — الداخل بالتطبيق فقط في هذا النموذج.'), SA.card({ flush: true }, t.el));
  }
  function render(root, ctx) {
    K.crumbs(ctx, 'hr-set', 'سياسات HR والإشعارات');
    return K.screen(root, ctx, { perm: 'hr.settings.view', route: 'hr/settings', def: 'catalogue', title: 'الإشعارات', paths: ['hrNotifCfg', 'notifications', 'roles'],
      tabs: () => [{ id: 'catalogue', label: 'كتالوج الأحداث', icon: 'bell', badge: N.length }, { id: 'roles', label: 'الأدوار × القنوات', icon: 'users' }, { id: 'channels', label: 'القنوات وساعات الهدوء', icon: 'moon' }, { id: 'delivery', label: 'سجل التسليم', icon: 'inbox' }],
      head: () => SA.pageHead({ title: 'سياسات HR والإشعارات', desc: 'كتالوج الأحداث N-01…N-52: حدث ← مستلمون ← قناة ← إلحاح ← نص عربي. نص بلا مبالغ ولا بيانات حساسة. كل التفعيلات «مقترح» حتى اعتماد التشغيل.', tags: [SA.tag('pending', 'بند 17–18'), SA.tag('open', 'ساعات الهدوء Open')], actions: [K.spec('hr-platform.html', 'scr-ntf-01')] }),
      panel(tab, S) { return ({ catalogue: cataloguePanel, roles: rolesPanel, channels: channelsPanel, delivery: deliveryPanel }[tab] || cataloguePanel)(S); } });
  }
  SA.register(Object.assign({}, K.NAV('hr-settings'), { app: 'hr', render, stub: false }));

  /* ───────────────────────── Test Lab missions ───────────────────────── */
  if (SA.missions && SA.missions.add) {
    SA.missions.add({ id: 'M-HC1', area: 'hr', phase2: true, title: 'HR: من طلب توظيف إلى شاغر مفتوح (سلسلة اعتماد)', persona: 'supervisor', route: 'hr/requisitions/new', est: '6 د', goal: 'كمشرف قدّم طلب توظيف: لاحظ فحص الميزانية وسلسلة الاعتماد. ثم كـHR Manager ثم مدير عام اعتمد الطلب — يتحوّل لشاغر مفتوح يظهر في المرشحين. جرّب اعتماد طلبك أنت: يُحجب (فصل مهام).',
      steps: [{ text: 'افتح طلب توظيف جديد وأكمل الخطوات الثلاث', audit: 'HR.REQUISITION.CREATED' }, { text: 'سجّل كـHR Manager (hr@…) وافتح الطلب واعتمد الخطوة الأولى', audit: 'APPROVAL.APPROVED' }, { text: 'أكمل السلسلة حتى يتحوّل الطلب إلى شاغر مفتوح', audit: 'HR.REQUISITION.APPROVED' }], detect: [{ audit: 'HR.REQUISITION.CREATED' }, { audit: 'HR.REQUISITION.APPROVED' }] });
    SA.missions.add({ id: 'M-HC2', area: 'hr', phase2: true, title: 'HR: مرشح ← اختبار عملي ← عرض ← موظف (ما قبل التعيين)', persona: 'hr', route: 'hr/candidates', est: '8 د', goal: 'كـHR Manager: أضف مرشحًا (جرّب رقمًا قوميًا مكرّرًا)، انقله للمقابلة ثم الاختبار — جرّب القفز للعرض قبل الاختبار (محجوب). ثم افتح العرض المقبول OF-2026-0001: سجّل لياقة طبية (أو كـOHS) واستلم المستندات وبيانات العقد ووقّع، ثم حوّله لموظف.',
      steps: [{ text: 'أضف مرشحًا جديدًا (جرّب تكرار الرقم القومي 30001151201876)', audit: 'HR.CANDIDATE.CREATED' }, { text: 'اعتمد مرشحًا بعد الاختبار العملي وأرسل التقييم', audit: 'HR.CANDIDATE.SCORECARD' }, { text: 'في العرض المقبول: سجّل اللياقة الطبية', audit: 'HR.MEDICAL.RECORDED' }, { text: 'حوّل المرشح إلى موظف', audit: 'HR.OFFER.CONVERTED' }], detect: [{ audit: 'HR.MEDICAL.RECORDED' }, { audit: 'HR.OFFER.CONVERTED' }] });
    SA.missions.add({ id: 'M-HC3', area: 'hr', phase2: true, title: 'HR: اقترح إعدادًا قانونيًا واعتمده بشخص مختلف', persona: 'hr', route: 'hr/compliance?tab=registry', est: '5 د', goal: 'افتح سجل الإعدادات واقترح إصدارًا لـ probation_max_days بتاريخ سريان. لاحظ أنك لا تعتمده (فصل مهام) — سجّل كمدير HR آخر أو المالك لاعتماده. شاهد بوابة الجاهزية تتغيّر.',
      steps: [{ text: 'اقترح إصدارًا جديدًا لإعداد قانوني', audit: 'HR.LEGAL.VERSION_PROPOSED' }, { text: 'اعتمده بمستخدم مختلف (المالك أو جيهان سعد)', audit: 'HR.LEGAL.VERSION_APPROVED' }], detect: [{ audit: 'HR.LEGAL.VERSION_PROPOSED' }, { audit: 'HR.LEGAL.VERSION_APPROVED' }] });
    SA.missions.add({ id: 'M-HC4', area: 'hr', phase2: true, title: 'HR: امتثال وصلاحيات: التزام بدليل + تفويض + مراجعة', persona: 'hr', route: 'hr/compliance?tab=calendar', est: '6 د', goal: 'أغلق التزامًا بدليل (الحرج يحتاج مراجعًا ثانيًا)، ثم أنشئ تفويضًا بمدة، ثم جرّب «عرض كدور».',
      steps: [{ text: 'أغلق التزامًا غير حرج بدليل', audit: 'HR.OBLIGATION.DONE' }, { text: 'أنشئ تفويضًا مؤقتًا', audit: 'HR.ACL.DELEGATION_CREATED' }, { text: 'ابدأ معاينة «عرض كدور»', audit: 'HR.ACL.VIEW_AS' }], detect: [{ audit: 'HR.OBLIGATION.DONE' }, { audit: 'HR.ACL.DELEGATION_CREATED' }] });
    SA.missions.add({ id: 'M-HC5', area: 'hr', phase2: true, title: 'HR: غيّر قاعدة إشعار وجرّب القالب', persona: 'hr', route: 'hr/settings', est: '3 د', goal: 'افتح حدثًا من الكتالوج، غيّر القناة أو الإلحاح، جرّب «إرسال تجربة»، ولاحظ رفض أي نص فيه مبلغ (Lint).',
      steps: [{ text: 'أرسل إشعارًا تجريبيًا لنفسك', audit: 'HR.NOTIFICATION.TEST' }, { text: 'احفظ تعديل قاعدة', audit: 'NOTIFICATION.RULE_CHANGED' }], detect: [{ audit: 'NOTIFICATION.RULE_CHANGED' }] });
  }
})();
