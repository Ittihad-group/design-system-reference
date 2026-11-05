/* EG Super Admin prototype — mod-approvals.js  (SA-16 صندوق الاعتمادات المشترك: Super Admin + HR)
   Routes: #/approvals · #/approvals/AP-xxxx (side panel) · #/hr/approvals (same inbox inside the HR space, area tab pre-set to HR)
   Query: ?area=sa|hr · ?view=mine|open|done|requested · ?type=payroll_run …

   PUBLIC API  SA.approvals = { pendingForMe(), count(), why(ap), decide(id, 'approve'|'reject'|'changes'|'delegate'), resubmit(id), open(id), visible(ap), source(ap), FIN_TYPES }
     (count() is the number shown on the nav badge and on the mobile app icon — mod-mobile can read it.)

   WHAT A DECISION WRITES (so HR screens built by other agents see it) — the decision updates the approval record AND the SOURCE record found by approval.ref {type,id}:
   ── payroll_run     → payrollRuns[id].status: step 1 approved → 'hr_review' · step 2 → 'finance_approved' · last step → 'gm_approved'. Reject → 'prepared' + returnedReason/returnedAt/returnedBy.
                        Audit: HR.PAYROLL.APPROVED (every approved step) / HR.PAYROLL.REJECTED. 'released' stays the payroll module's own action (hr.payroll.release).
   ── salary_change   → salaryChanges[id].status 'approved'|'rejected' + approvedAt/approvedBy/effectiveFrom(YYYY-MM-DD today) (only after the LAST step).
                        On approval ALSO: employees[empId].salary.basic = toBasic and employees[empId].salaryHistory.unshift({id,at,from,to,approvalId,by,reason}).
                        Audit: HR.SALARY.CHANGE_APPROVED / HR.SALARY.CHANGE_REJECTED.
   ── final_settlement→ settlements[id].status 'approved' (last step) · reject → 'draft' + returnedReason. Payment ('paid') is the exit module's action. Audit HR.SETTLEMENT.APPROVED / HR.SETTLEMENT.REJECTED.
   ── hiring_requisition (ref.type 'requisition' also accepted) → requisitions[id].status 'approved' (last step) | 'rejected' + approvedAt/approvedBy/rejectedReason. Audit HR.REQUISITION.APPROVED / REJECTED.
   ── advance (ref.type 'loan' also accepted) → loans[id].status 'approved' | 'rejected' + approvedAt/approvedBy. Audit HR.ADVANCE.APPROVED / HR.ADVANCE.REJECTED.
   ── leave (ref.type 'leave_request' also accepted) → leaveRequests[id].status 'approved'|'rejected' + decidedBy/decidedAt/decisionReason. (Balances are NOT touched here — the leave module owns them.) Audit HR.LEAVE.APPROVED / REJECTED.
   ── dealer_override → dealerRequests[DR-id] flipped by SA.dealersApi (mod-security) → DEALER.OVERRIDDEN.
   Every kind also writes APPROVAL.APPROVED | REJECTED | CHANGES_REQUESTED | DELEGATED (area = approval.area), notifies the requester (and the next step's role), and 'changes' sets
   approvals[id].status='changes_requested' + changesNote, and source[id].changesRequested={note,by,at} (source status itself is left unchanged). SoD: requesterId === me ⇒ blocked. */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  const me = () => SA.session.user;
  const T = SA.catalog.approvalTypes;
  ['HR.PAYROLL.REJECTED|رفض كشف المرتبات|medium', 'HR.SALARY.CHANGE_REJECTED|رفض تغيير مرتب|medium', 'HR.ADVANCE.REJECTED|رفض سلفة|medium', 'HR.SETTLEMENT.REJECTED|رفض مخالصة نهائية|medium'].forEach((s) => { const a = s.split('|'); SA.catalog.addAudit(a[0], a[1], a[2], 'hr'); });
  SA.catalog.addAudit('APPROVAL.RESUBMITTED', 'إعادة إرسال طلب بعد التعديل', 'info', 'approval');

  /* ── styles ── */
  (function () {
    if (document.querySelector('style[data-mod="approvals"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'approvals');
    s.textContent = `
.sapi-type { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--text-dense); }
.sapi-type-ico { width: 30px; height: 30px; border-radius: 9px; background: var(--color-primary-tint); color: var(--eg-navy); display: grid; place-items: center; flex: none; }
.sapi-type-ico.is-hr { background: var(--color-info-tint); color: var(--color-info); }
.sapi-title { display: flex; flex-direction: column; min-width: 220px; max-width: 420px; line-height: 1.35; }
.sapi-title b { font-weight: 600; font-size: var(--text-dense); } .sapi-title small { color: var(--color-text-muted); font-size: 12px; }
.sapi-chain { display: inline-flex; align-items: center; gap: 4px; } .sapi-chain-txt { font-size: 12px; color: var(--color-text-muted); margin-inline-start: 6px; }
.sapi-dot { width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--color-border-strong); background: #fff; display: inline-block; }
.sapi-dot.is-approved { background: var(--color-success); border-color: var(--color-success); } .sapi-dot.is-pending { border-color: var(--color-warning); background: var(--color-warning-tint); box-shadow: 0 0 0 3px var(--color-warning-tint); }
.sapi-dot.is-rejected { background: var(--color-danger); border-color: var(--color-danger); } .sapi-dot.is-skipped { background: var(--color-neutral-tint); }
.sapi-mine { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; color: var(--eg-navy); background: var(--color-primary-tint); border-radius: 6px; padding: 1px 7px; margin-inline-start: 6px; }
.sapi-chain-v { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sapi-chain-v li { position: relative; display: flex; gap: 12px; padding-bottom: 16px; }
.sapi-chain-v li:not(:last-child)::before { content: ""; position: absolute; inset-block: 26px 0; inset-inline-start: 12px; width: 2px; background: var(--color-border); }
.sapi-chain-v li.is-approved:not(:last-child)::before { background: var(--color-success); }
.sapi-node { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; flex: none; background: #fff; border: 2px solid var(--color-border-strong); color: var(--color-text-muted); font: 700 12px var(--font-en); }
.sapi-chain-v .is-approved .sapi-node { background: var(--color-success); border-color: var(--color-success); color: #fff; } .sapi-chain-v .is-pending .sapi-node { border-color: var(--color-warning); background: var(--color-warning-tint); color: var(--color-warning); }
.sapi-chain-v .is-rejected .sapi-node { background: var(--color-danger); border-color: var(--color-danger); color: #fff; } .sapi-chain-v .is-skipped .sapi-node { opacity: .5; }
.sapi-chain-v b { display: block; font-size: var(--text-dense); } .sapi-chain-v small { display: block; color: var(--color-text-muted); font-size: 12px; margin-top: 2px; }
.sapi-chain-v .sapi-why { background: var(--color-bg-alt); border-radius: 8px; padding: 6px 10px; margin-top: 6px; font-size: 12.5px; color: var(--color-text); }
.sapi-red { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-muted); font-size: 12.5px; background: var(--color-neutral-tint); border-radius: 6px; padding: 2px 8px; }
.sapi-panel-head { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; } .sapi-panel-head h3 { margin: 0; font-size: var(--text-h3); line-height: 1.45; }
.sapi-panel-sec { margin-top: 18px; } .sapi-panel-sec > h4 { margin: 0 0 8px; font-size: var(--text-dense); color: var(--eg-navy); display: flex; align-items: center; gap: 6px; }
.sapi-foot { display: flex; gap: 8px; flex-wrap: wrap; width: 100%; } .sapi-foot .sapi-grow { flex: 1; }
.sapi-dlg-sum { background: var(--color-bg-alt); border-radius: 10px; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; } .sapi-dlg-sum small { color: var(--color-text-muted); }
.sapi-list-note { font-size: 12.5px; color: var(--color-text-muted); display: flex; align-items: center; gap: 6px; }
@media (max-width: 700px) { .sapi-title { min-width: 0; } }`;
    document.head.appendChild(s);
  })();

  /* ── rules ── */
  const FIN_TYPES = ['payment_voucher', 'payroll_run', 'salary_change', 'final_settlement', 'advance', 'large_order', 'dealer_override'];
  const TYPE_KEYS = { payroll_run: ['hr.payroll.approve', 'hr.payroll.release'], salary_change: ['hr.salary.change.approve'], final_settlement: ['hr.final_settlement.approve', 'hr.final_settlement.pay'], hiring_requisition: ['hr.requisitions.approve'], advance: ['hr.loans.approve'], leave: ['hr.leave.approve'] };
  const ACCESS_KEYS = ['sa.approvals.view', 'hr.payroll.approve', 'hr.payroll.release', 'hr.payroll.prepare', 'hr.requisitions.approve', 'hr.requisitions.create', 'hr.leave.approve', 'hr.loans.approve', 'hr.loans.create', 'hr.salary.change.approve', 'hr.salary.change.request', 'hr.final_settlement.approve', 'hr.final_settlement.pay'];
  const SRC = { payroll_run: ['payrollRuns', 'hr/payroll', 'كشف مرتبات'], salary_change: ['salaryChanges', 'hr/changes', 'تغيير مرتب'], final_settlement: ['settlements', 'hr/settlement', 'مخالصة نهائية'], hiring_requisition: ['requisitions', 'hr/requisitions', 'طلب توظيف'], requisition: ['requisitions', 'hr/requisitions', 'طلب توظيف'], advance: ['loans', 'hr/loans', 'سلفة'], loan: ['loans', 'hr/loans', 'سلفة'], leave: ['leaveRequests', 'hr/leave', 'طلب إجازة'], leave_request: ['leaveRequests', 'hr/leave', 'طلب إجازة'] };
  const NORM = { requisition: 'hiring_requisition', loan: 'advance', leave_request: 'leave' };
  const RUN_ST = { prepared: 'مجهّز', hr_review: 'قيد مراجعة HR', finance_approved: 'اعتمدته المالية', gm_approved: 'اعتمده المدير العام', released: 'مُطلَق' };
  const isOpen = (a) => a.status === 'pending' || a.status === 'delegated';
  const curStep = (a) => a.chain.find((s) => s.step === a.currentStep) || a.chain.find((s) => s.status === 'pending') || a.chain[0];
  const isSuper = () => { const r = SA.session.role; return !!(r && r.isProtected); };
  const typePerm = (ap) => SA.can('sa.approvals.approve') || (TYPE_KEYS[ap.type] || []).some((k) => SA.can(k));
  function source(ap) {
    const key = (ap.ref && ap.ref.type) || ap.type; const d = SRC[key] || SRC[ap.type]; if (!d || !ap.ref || !ap.ref.id) return null;
    const norm = NORM[key] || key; const rec = st.find(d[0], ap.ref.id);
    return { kind: NORM[ap.type] || ap.type, norm, coll: d[0], route: d[1], label: d[2], rec };
  }
  function visible(ap) {
    const u = me(); if (!u) return false;
    if (ap.requesterId === u.id || ap.delegatedTo === u.id || isSuper() || ap.chain.some((c) => c.roleId === u.roleId)) return true;
    return ap.area === 'hr' ? (TYPE_KEYS[ap.type] || []).some((k) => SA.can(k)) : SA.can('sa.approvals.view');
  }
  /** '' when I may decide the current step, else the reason (shown on the locked button). */
  function why(ap) {
    const u = me(); if (!u) return 'غير مسجّل';
    if (!isOpen(ap)) return ap.status === 'changes_requested' ? 'بانتظار تعديل مقدّم الطلب' : 'الطلب مُغلق';
    if (ap.requesterId === u.id) return 'لا يمكنك اعتماد طلبك أنت — فصل المهام';
    const s = curStep(ap);
    if (ap.delegatedTo) { if (ap.delegatedTo !== u.id && !isSuper()) return 'مُفوَّض إلى ' + SA.userName(ap.delegatedTo); }
    else if (s.roleId !== u.roleId && !isSuper()) return 'الدور المطلوب في هذه الخطوة: ' + s.label;
    if (!typePerm(ap)) return 'ليست من صلاحياتك' + ((TYPE_KEYS[ap.type] || [])[0] ? ' (' + TYPE_KEYS[ap.type][0] + ')' : ' (sa.approvals.approve)');
    return '';
  }
  const mineList = () => (st.get('approvals') || []).filter((a) => isOpen(a) && visible(a) && !why(a));
  const lockedVal = (key) => h('span.sapi-red', {}, SA.icon('lock', 'icon-sm'), '••• (سري — ' + key + ')');
  function logRead(type, id, label) { // T3 read (salary amounts shown) → HR.SALARY.VIEWED, throttled to once / 10 min per target
    const u = me(); if (!u || !SA.canSensitive('hr.salary.view')) return;
    const dup = (st.get('audit') || []).some((e) => e.code === 'HR.SALARY.VIEWED' && e.actor.id === u.id && e.target && e.target.id === id && Date.now() - new Date(e.ts).getTime() < 600000);
    if (!dup) SA.audit('HR.SALARY.VIEWED', { target: { type, id, label }, reason: 'مراجعة طلب اعتماد' });
  }

  /* ── source-record effects ── */
  const mapLabel = (m) => m;
  function effectText(ap, kind, final) {
    const s = source(ap); if (!s || !s.rec) return null;
    if (kind === 'reject') return 'سيُحدَّث السجل المصدر ' + s.rec.id + ': يرجع للمُعِدّ لإعادة العمل عليه.';
    if (kind !== 'approve') return null;
    const idx = ap.chain.indexOf(curStep(ap));
    if (s.kind === 'payroll_run') return 'حالة الكشف ' + s.rec.id + ' ستصبح «' + RUN_ST[final ? 'gm_approved' : idx === 0 ? 'hr_review' : 'finance_approved'] + '».';
    if (!final) return null;
    return { salary_change: 'سيُطبَّق الأجر الجديد على ملف الموظف ويظهر في تاريخ الأجر ومدخلات المرتبات.', final_settlement: 'ستصبح المخالصة «معتمدة» (الصرف خطوة منفصلة بصلاحية الصرف).', hiring_requisition: 'سيصبح طلب التوظيف «معتمدًا» ويظهر للمرشحين.', advance: 'ستصبح السلفة «معتمدة».', leave: 'ستصبح الإجازة «معتمدة» وتظهر في الحضور وتقويم الفريق.' }[s.kind] || null;
  }
  function syncSource(ap, kind, ctx) {
    const s = source(ap); if (!s || !s.rec) return null;
    const rec = s.rec, now = ctx.now, by = ctx.by, reason = ctx.reason, final = ctx.final, idx = ctx.idx;
    const set = (p) => st.patch(s.coll, rec.id, p); const tgt = { type: s.norm, id: rec.id, label: s.label + ' ' + rec.id };
    const aud = (code, b, a) => SA.audit(code, { target: tgt, before: b, after: a, reason, area: 'hr' });
    if (kind === 'changes') { set({ changesRequested: { note: reason, by, at: now } }); return null; }
    if (kind === 'delegate') return null;
    const ok = kind === 'approve';
    switch (s.kind) {
      case 'payroll_run':
        if (ok) { const ns = final ? 'gm_approved' : idx === 0 ? 'hr_review' : 'finance_approved'; set({ status: ns, lastApprovedBy: by, lastApprovedAt: now }); aud('HR.PAYROLL.APPROVED', { status: rec.status }, { status: ns }); }
        else { set({ status: 'prepared', returnedReason: reason, returnedAt: now, returnedBy: by }); aud('HR.PAYROLL.REJECTED', { status: rec.status }, { status: 'prepared' }); }
        break;
      case 'salary_change':
        if (!ok) { set({ status: 'rejected', rejectedReason: reason, decidedAt: now, decidedBy: by }); aud('HR.SALARY.CHANGE_REJECTED', { status: rec.status }, { status: 'rejected' }); }
        else if (final) {
          set({ status: 'approved', approvedAt: now, approvedBy: by, effectiveFrom: now.slice(0, 10) });
          const emp = st.find('employees', rec.employeeId);
          if (emp) st.update('employees', (l) => { const e = l.find((x) => x.id === emp.id); e.salary = Object.assign({}, e.salary, { basic: rec.toBasic }); e.salaryHistory = e.salaryHistory || []; e.salaryHistory.unshift({ id: rec.id, at: now, from: rec.fromBasic, to: rec.toBasic, approvalId: ap.id, by, reason: ap.title }); });
          aud('HR.SALARY.CHANGE_APPROVED', { salary: { basic: rec.fromBasic } }, { salary: { basic: rec.toBasic } });
        }
        break;
      case 'final_settlement':
        if (!ok) { set({ status: 'draft', returnedReason: reason, returnedAt: now }); aud('HR.SETTLEMENT.REJECTED', { status: rec.status }, { status: 'draft' }); }
        else if (final) { set({ status: 'approved', approvedAt: now, approvedBy: by }); aud('HR.SETTLEMENT.APPROVED', { status: rec.status }, { status: 'approved' }); }
        break;
      case 'hiring_requisition':
        if (!ok) { set({ status: 'rejected', rejectedReason: reason, decidedAt: now, decidedBy: by }); aud('HR.REQUISITION.REJECTED', { status: rec.status }, { status: 'rejected' }); }
        else if (final) { set({ status: 'approved', approvedAt: now, approvedBy: by }); aud('HR.REQUISITION.APPROVED', { status: rec.status }, { status: 'approved', headcount: rec.headcount }); }
        break;
      case 'advance':
        if (!ok) { set({ status: 'rejected', rejectedReason: reason, decidedAt: now, decidedBy: by }); aud('HR.ADVANCE.REJECTED', { status: rec.status }, { status: 'rejected' }); }
        else if (final) { set({ status: 'approved', approvedAt: now, approvedBy: by }); aud('HR.ADVANCE.APPROVED', { status: rec.status }, { status: 'approved', amount: rec.amount }); }
        break;
      case 'leave':
        if (!ok) { set({ status: 'rejected', decidedBy: by, decidedAt: now, decisionReason: reason }); aud('HR.LEAVE.REJECTED', { status: rec.status }, { status: 'rejected' }); }
        else if (final) { set({ status: 'approved', decidedBy: by, decidedAt: now, decisionReason: reason }); aud('HR.LEAVE.APPROVED', { status: rec.status }, { status: 'approved', days: rec.days }); }
        break;
      default: break;
    }
    return null;
  }
  function dealerRefOf(ap) { if (ap.ref && ap.ref.id && /^DR-/.test(ap.ref.id)) return ap.ref.id; const c = (ap.context || []).find((x) => /^DR-\d+/.test(String(x[1]))); return c ? String(c[1]).match(/DR-\d+/)[0] : null; }

  /* ── applying a decision ── */
  function apply(id, kind, o) {
    const ap0 = st.find('approvals', id); const step0 = curStep(ap0); const idx = ap0.chain.indexOf(step0); const u = me(); const now = new Date().toISOString();
    const last = idx === ap0.chain.length - 1; const before = { status: ap0.status, step: step0.step + '/' + ap0.chain.length, stepRole: step0.label };
    let nextStep = null;
    st.update('approvals', (list) => {
      const a = list.find((x) => x.id === id); const s = a.chain[idx]; a.updatedAt = now;
      if (kind === 'approve') {
        s.status = 'approved'; s.decidedBy = u.id; s.decidedAt = now; s.reason = o.reason || ''; if (s.roleId !== u.roleId) s.actedFor = s.label; delete a.delegatedTo;
        if (!last) { nextStep = a.chain[idx + 1]; nextStep.status = 'pending'; a.currentStep = nextStep.step; a.status = 'pending'; } else a.status = 'approved';
      } else if (kind === 'reject') {
        s.status = 'rejected'; s.decidedBy = u.id; s.decidedAt = now; s.reason = o.reason; a.chain.forEach((x, i) => { if (i > idx && x.status !== 'approved') x.status = 'skipped'; }); a.status = 'rejected'; delete a.delegatedTo;
      } else if (kind === 'changes') { a.status = 'changes_requested'; a.changesNote = { by: u.id, at: now, note: o.reason, step: s.step }; delete a.delegatedTo; }
      else if (kind === 'delegate') { a.status = 'delegated'; a.delegatedTo = o.delegateTo; a.delegations = (a.delegations || []).concat([{ from: u.id, to: o.delegateTo, at: now, reason: o.reason }]); }
    });
    const ap = st.find('approvals', id); const final = kind !== 'changes' && kind !== 'delegate' && (kind === 'reject' || last);
    const code = { approve: 'APPROVAL.APPROVED', reject: 'APPROVAL.REJECTED', changes: 'APPROVAL.CHANGES_REQUESTED', delegate: 'APPROVAL.DELEGATED' }[kind];
    SA.audit(code, { area: ap.area, target: { type: 'approval', id: ap.id, label: ap.title }, reason: o.reason, before, after: { status: ap.status, step: ap.currentStep + '/' + ap.chain.length, decidedBy: u.name, via: o.via || 'web', delegatedTo: o.delegateTo ? SA.userName(o.delegateTo) : undefined }, via: o.via || 'web' });
    let override = null;
    if (ap.type === 'dealer_override' && kind === 'approve' && last && SA.dealersApi) { const dr = dealerRefOf(ap); if (dr) override = SA.dealersApi.applyOverride(dr, 'approved', { reason: o.reason || ap.title, viaApproval: ap.id }); }
    syncSource(ap, kind, { now, by: u.id, reason: o.reason || '', final: kind === 'approve' && last, idx });
    /* notifications */
    const label = (T[ap.type] || {}).label || ap.type; const link = '#/approvals/' + ap.id;
    const rn = { approve: last ? ['تم اعتماد طلبك: ' + label, 'info'] : ['تقدّم طلبك خطوة: ' + label, 'info'], reject: ['تم رفض طلبك: ' + label, 'urgent'], changes: ['مطلوب تعديل على طلبك: ' + label, 'action'], delegate: ['تم تفويض طلبك: ' + label, 'info'] }[kind];
    if (ap.requesterId && ap.requesterId !== u.id) SA.notify({ title: rn[0], body: ap.title + (o.reason ? ' — ' + o.reason : ''), level: rn[1], toUsers: [ap.requesterId], link });
    if (nextStep) SA.notify({ title: 'طلب اعتماد بانتظارك: ' + label, body: ap.title, level: 'action', to: [nextStep.roleId, 'R-01'], link });
    if (kind === 'delegate') SA.notify({ title: 'فُوِّض لك طلب اعتماد: ' + label, body: ap.title + (o.reason ? ' — ' + o.reason : ''), level: 'action', toUsers: [o.delegateTo], link });
    SA.track('approval.decided', { kind, id });
    return { ap, override };
  }

  /* ── dialog ── */
  const DLG = {
    approve: { title: 'اعتماد الطلب', confirm: 'اعتماد', icon: 'checkcircle', need: false, label: 'سبب/ملاحظة الاعتماد' },
    reject: { title: 'رفض الطلب', confirm: 'رفض الطلب', icon: 'xcircle', need: true, danger: true, label: 'سبب الرفض (يصل لمقدّم الطلب)' },
    changes: { title: 'طلب تعديل', confirm: 'إرجاع لمقدّم الطلب', icon: 'edit', need: true, label: 'ما المطلوب تعديله؟' },
    delegate: { title: 'تفويض الطلب', confirm: 'تفويض', icon: 'swap', need: true, label: 'سبب التفويض' }
  };
  function eligibleDelegates(ap) {
    const u = me();
    return (st.get('users') || []).filter((x) => x.status === 'active' && x.id !== u.id && x.id !== ap.requesterId && SA.roleById(x.roleId) && (SA.roleCan(SA.roleById(x.roleId), 'sa.approvals.approve') || (TYPE_KEYS[ap.type] || []).some((k) => SA.roleCan(SA.roleById(x.roleId), k)))).map((x) => [x.id, x.name + ' — ' + SA.roleName(x.roleId)]);
  }
  function dialog(ap, kind) {
    const d = DLG[kind]; const s = curStep(ap); const idx = ap.chain.indexOf(s); const last = idx === ap.chain.length - 1; const next = ap.chain[idx + 1];
    return new Promise((resolve) => {
      const reason = SA.form.field({ name: 'reason', label: d.label, type: 'textarea', required: d.need, rows: 3, placeholder: d.need ? 'اكتب السبب (3 أحرف على الأقل)…' : 'اختياري — يُنصح بكتابة سبب القرار', rules: d.need ? [(v) => (String(v || '').trim().length < 3 ? 'السبب مطلوب — 3 أحرف على الأقل' : null)] : [] });
      const opts = kind === 'delegate' ? eligibleDelegates(ap) : [];
      const dsel = kind === 'delegate' ? SA.form.field({ name: 'to', label: 'فوِّض إلى', type: 'select', required: true, options: [['', 'اختر شخصًا يملك صلاحية الاعتماد…']].concat(opts), hint: opts.length ? 'يظهر فقط من يملك صلاحية الاعتماد ولا يكون مقدّم الطلب.' : null }) : null;
      const eff = effectText(ap, kind, last);
      const impact = [];
      if (kind === 'approve') { impact.push(last ? 'هذه الخطوة الأخيرة — يكتمل اعتماد الطلب.' : 'ينتقل الطلب إلى: ' + next.label + '.'); if (eff) impact.push(eff); if (FIN_TYPES.indexOf(ap.type) >= 0) impact.push('طلب مالي/حساس: سيُطلب منك إعادة التحقق (Step-up).'); }
      if (kind === 'reject') { impact.push('يُغلق الطلب وتُلغى الخطوات اللاحقة.'); impact.push('يصل السبب لمقدّم الطلب: ' + SA.userName(ap.requesterId) + '.'); if (eff) impact.push(eff); }
      if (kind === 'changes') impact.push('يرجع الطلب إلى ' + SA.userName(ap.requesterId) + ' مع ملاحظتك، ويعيد إرساله بعد التعديل من البداية.');
      if (kind === 'delegate') impact.push('يُسند القرار لشخص آخر، ولا يمكنك البتّ فيه بعد ذلك (إلا Super Admin).');
      const btn = h('button.btn.' + (d.danger ? 'btn-accent' : 'btn-primary'), { type: 'button', onclick: () => { const ok = reason.validate() && (!dsel || dsel.validate()); if (!ok) return; m.close({ ok: true, reason: reason.get().trim(), delegateTo: dsel ? dsel.get() : null }); } }, d.confirm);
      const m = SA.modal({
        title: d.title, icon: d.icon, danger: !!d.danger, size: 'md',
        body: h('div.sap-confirm', {}, h('div.sapi-dlg-sum', {}, h('b', {}, ap.title), h('small', {}, (T[ap.type] || {}).label + ' · ' + ap.id + ' · الخطوة ' + s.step + ' من ' + ap.chain.length + ' — ' + s.label)),
          ap.requesterDisabled ? SA.alert('warning', 'مقدّم الطلب معطّل حاليًا — لن يصله إشعار.') : null,
          impact.length ? h('div.sap-impact', {}, h('b', {}, 'الأثر'), h('ul', {}, impact.map((t) => h('li', {}, t)))) : null, dsel ? dsel.el : null, reason.el,
          h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), 'القرار يتسجّل في سجل التدقيق باسمك ' + (kind === 'approve' && s.roleId !== me().roleId ? '(بالنيابة عن «' + s.label + '») ' : '') + 'مع الوقت والسبب.')),
        foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close({ ok: false }) }, 'إلغاء'), btn]
      });
      m.closed.then((r) => resolve(r || { ok: false }));
    });
  }

  /* ── public decide() ── */
  async function decide(id, kind, via) {
    let ap = st.find('approvals', id); if (!ap) { SA.toast('الطلب غير موجود', 'error'); return false; }
    const w = why(ap); if (w) { SA.toast(w, 'warn', { ms: 5500 }); return false; }
    const sig0 = JSON.stringify([ap.status, ap.currentStep, ap.updatedAt]);
    const r = await dialog(ap, kind); if (!r.ok) return false;
    if (kind === 'approve' && FIN_TYPES.indexOf(ap.type) >= 0 && !(await SA.stepUp(ap.type === 'dealer_override' ? 'dealer.override' : 'approval.decide', { text: 'اعتماد «' + ((T[ap.type] || {}).label || ap.title) + '» عملية مالية/حساسة. أعد التحقق للمتابعة.' }))) return false;
    ap = st.find('approvals', id);
    if (!ap || JSON.stringify([ap.status, ap.currentStep, ap.updatedAt]) !== sig0 || why(ap)) { SA.toast('تغيّر الطلب أثناء مراجعتك فلم يُنفَّذ القرار. راجعه من جديد.', 'error', { ms: 6500 }); return false; }
    const wasLast = ap.chain.indexOf(curStep(ap)) === ap.chain.length - 1;
    try { await SA.api(() => apply(id, kind, { reason: r.reason, delegateTo: r.delegateTo, via })); } catch (e) { SA.fail(e); return false; }
    const msg = { approve: wasLast ? 'تم اعتماد الطلب' : 'تم اعتماد الخطوة وانتقل الطلب للخطوة التالية', reject: 'تم رفض الطلب وإبلاغ مقدّمه', changes: 'تم إرجاع الطلب لمقدّمه للتعديل', delegate: 'تم تفويض الطلب' }[kind];
    SA.toast(msg, 'success'); return true;
  }
  async function resubmit(id) {
    const ap = st.find('approvals', id); const u = me(); if (!ap || ap.status !== 'changes_requested' || ap.requesterId !== u.id) { SA.toast('لا يمكنك إعادة إرسال هذا الطلب', 'warn'); return false; }
    const r = await SA.confirm({ title: 'إعادة إرسال الطلب', confirmLabel: 'إعادة الإرسال', reason: true, reasonLabel: 'ما الذي عدّلته؟', impact: ['يبدأ الطلب سلسلة الاعتماد من الخطوة الأولى.'] }); if (!r.ok) return false;
    try { await SA.api(() => { st.update('approvals', (l) => { const a = l.find((x) => x.id === id); a.status = 'pending'; a.currentStep = 1; a.chain.forEach((c, i) => { c.status = i === 0 ? 'pending' : 'waiting'; c.decidedBy = null; c.decidedAt = null; c.reason = ''; }); delete a.changesNote; a.updatedAt = new Date().toISOString(); }); const s = source(ap); if (s && s.rec) st.patch(s.coll, s.rec.id, { changesRequested: null }); SA.audit('APPROVAL.RESUBMITTED', { area: ap.area, target: { type: 'approval', id, label: ap.title }, reason: r.reason }); SA.notify({ title: 'أُعيد إرسال طلب اعتماد', body: ap.title, level: 'action', to: [ap.chain[0].roleId, 'R-01'], link: '#/approvals/' + id }); }); } catch (e) { SA.fail(e); return false; }
    SA.toast('أُعيد إرسال الطلب', 'success'); return true;
  }
  SA.approvals = { pendingForMe: mineList, count: () => mineList().length, why, decide, resubmit, open: (id) => SA.nav('approvals/' + id), visible, source, FIN_TYPES, typeKeys: TYPE_KEYS };

  /* ── view helpers ── */
  const typeIcon = (a) => h('span.sapi-type-ico' + (a.area === 'hr' ? '.is-hr' : ''), {}, SA.icon((T[a.type] || {}).icon || 'inbox', 'icon-sm'));
  const typeLabel = (a) => (T[a.type] || {}).label || a.type;
  const areaChip = (a) => SA.chip(a.area === 'hr' ? 'الموارد البشرية' : 'Super Admin', a.area === 'hr' ? 'info' : 'neutral');
  function chainMini(a) {
    const s = curStep(a);
    return h('span.sapi-chain', { title: a.chain.map((c) => c.label + ' — ' + ({ approved: 'اعتمد', pending: 'الدور عليه', waiting: 'بانتظار', rejected: 'رفض', skipped: 'مُلغاة' }[c.status] || c.status)).join('\n') }, a.chain.map((c) => h('i.sapi-dot.is-' + c.status)), h('span.sapi-chain-txt', {}, isOpen(a) || a.status === 'changes_requested' ? 'خطوة ' + s.step + '/' + a.chain.length : a.status === 'approved' ? 'اكتملت' : 'أُغلقت'));
  }
  const ageCell = (a) => h('span.t-muted', { title: SA.fmt.dt(a.createdAt) + ' — SLA غير مُعدّ (Open)' }, SA.fmt.rel(a.createdAt));
  const impactCell = (a) => (a.amount != null ? h('b.num', {}, SA.fmt.money(a.amount)) : a.discountPct != null ? h('b.num', {}, a.discountPct + '% خصم') : h('span.sap-dash', {}, '—'));
  const reqCell = (a) => { const u = SA.userById(a.requesterId); return u ? h('span', {}, u.name, a.requesterDisabled ? h('small.t-muted', {}, ' (معطّل)') : null) : '—'; };

  /* ── side panel ── */
  function sourceRows(ap) {
    const s = source(ap); const rows = []; if (!s || !s.rec) return rows; const r = s.rec; const canSal = SA.canSensitive('hr.salary.view');
    const emp = r.employeeId ? st.find('employees', r.employeeId) : null;
    if (s.kind === 'payroll_run') { rows.push(['الكشف', r.id + ' (تجريبي)'], ['الفترة', r.period], ['الحالة الحالية', RUN_ST[r.status] || r.status], ['عدد الموظفين', r.employees], ['إجمالي المستحقات (T3)', canSal ? SA.fmt.money(r.gross) : lockedVal('hr.salary.view')], ['الاستقطاعات (تأمينات/ضريبة)', SA.openValue('Open — قانوني')], ['الصافي', SA.openValue('Open')], ['جهّزه', SA.userName(r.preparedBy)]); }
    if (s.kind === 'salary_change') { rows.push(['الموظف', emp ? emp.name + ' (' + emp.empNo + ')' : r.employeeId], ['الأجر الأساسي الحالي (T3)', canSal ? SA.fmt.money(r.fromBasic) : lockedVal('hr.salary.view')], ['الأجر المقترح (T3)', canSal ? SA.fmt.money(r.toBasic) : lockedVal('hr.salary.view')], ['نسبة التغيير', canSal ? '+' + Math.round((r.toBasic - r.fromBasic) / r.fromBasic * 1000) / 10 + '%' : lockedVal('hr.salary.view')], ['طلبه', SA.userName(r.requestedBy)], ['حالة السجل', r.status]); }
    if (s.kind === 'final_settlement') rows.push(['الموظف', emp ? emp.name + ' (' + emp.empNo + ')' : r.employeeId], ['حالة المخالصة', r.status], ['حسبها', SA.userName(r.calculatedBy)], ['قيمة المخالصة', SA.openValue('Open — القانون')]);
    if (s.kind === 'hiring_requisition') { const pos = st.find('positions', r.positionId); rows.push(['الوظيفة', pos ? pos.title : r.positionId], ['القسم', SA.deptName(r.departmentId)], ['العدد المطلوب', r.headcount], ['السبب', r.reason], ['طلبه', SA.userName(r.requestedBy)], ['حالة السجل', r.status]); }
    if (s.kind === 'advance') rows.push(['الموظف', emp ? emp.name + ' (' + emp.empNo + ')' : r.employeeId], ['المبلغ (تجريبي)', SA.fmt.money(r.amount)], ['القسط الشهري / الحد', SA.openValue('Open')], ['حالة السجل', r.status]);
    if (s.kind === 'leave') { const bal = (st.get('leaveBalances') || []).find((b) => b.employeeId === r.employeeId && b.type === r.type); rows.push(['الموظف', emp ? emp.name + ' (' + emp.empNo + ')' : r.employeeId], ['النوع', { annual: 'اعتيادية', sick: 'مرضية', casual: 'عارضة' }[r.type] || r.type], ['الفترة', SA.fmt.date(r.from) + ' ← ' + SA.fmt.date(r.to)], ['عدد الأيام', r.days], ['الرصيد (تجريبي)', bal ? bal.balanceDays + ' يوم' : '—'], ['السبب', r.reason]); }
    return rows;
  }
  function openPanel(id, base, onClosed) {
    let leaving = false; let ack = null; let baseline = null;
    const sig = (a) => JSON.stringify([a.status, a.currentStep, a.updatedAt, a.amount, a.discountPct, a.context, a.chain.map((c) => c.status), a.delegatedTo]);
    const body = h('div.sap-drawer-inner'); const foot = h('div.sapi-foot');
    const d = SA.drawer({ title: 'طلب اعتماد', subtitle: id, size: 'lg', body, foot: [foot], onClose: () => { unsub(); if (!leaving) onClosed(); } });
    function stateOf(a) { return a ? sig(a) : ''; }
    function draw() {
      SA.clear(body); SA.clear(foot); const ap = st.find('approvals', id);
      if (!ap || !visible(ap)) { body.appendChild(SA.empty({ icon: 'inbox', title: ap ? 'هذا الطلب خارج صلاحياتك' : 'الطلب غير موجود', text: ap ? 'لا يظهر لك هذا الطلب.' : 'ممكن الرابط قديم.' })); foot.appendChild(h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close() }, 'إغلاق')); return; }
      if (baseline == null) baseline = sig(ap);
      d.setTitle(typeLabel(ap), ap.id + ' · ' + (ap.area === 'hr' ? 'الموارد البشرية' : 'Super Admin'));
      const changed = sig(ap) !== baseline && ack !== sig(ap);
      const w = why(ap); const lock = changed ? 'تغيّر الطلب منذ فتحته — راجع التغيير أولًا' : w;
      const s = curStep(ap); const u = me();
      body.append(h('div.sapi-panel-head', {}, h('div.cluster', {}, SA.statusChip('approval', ap.status), areaChip(ap), FIN_TYPES.indexOf(ap.type) >= 0 ? SA.chip('مالي/حساس — Step-up', 'warning') : null, !w && isOpen(ap) ? h('span.sapi-mine', {}, SA.icon('bolt', 'icon-sm'), 'الدور عليك') : null), h('h3', {}, ap.title)));
      if (changed) body.append(SA.alert('warning', h('b', {}, 'تغيّر هذا الطلب منذ فتحته. '), 'الحالة الآن: ', SA.catalog.status.approval[ap.status] ? SA.catalog.status.approval[ap.status][0] : ap.status, ' · الخطوة ', ap.currentStep, '/', ap.chain.length, '. راجع التفاصيل ثم أكّد أنك اطلعت على التغيير قبل أي قرار. ', h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { ack = sig(ap); baseline = sig(ap); draw(); } }, SA.icon('check', 'icon-sm'), 'راجعت التغيير')));
      if (ap.requesterId === u.id && isOpen(ap)) body.append(SA.alert('info', h('b', {}, 'هذا طلبك. '), 'لا يمكنك اعتماده بنفسك — فصل المهام. ينتظر القرار من: ', s.label, '.'));
      else if (w && isOpen(ap) && !changed) body.append(SA.alert('info', w));
      if (ap.requesterDisabled) body.append(SA.alert('warning', 'مقدّم الطلب معطّل حاليًا — لن يصله إشعار بالقرار.'));
      if (ap.status === 'changes_requested' && ap.changesNote) body.append(SA.alert('info', h('b', {}, 'مطلوب تعديل: '), ap.changesNote.note, ' — ', SA.userName(ap.changesNote.by), ' · ', SA.fmt.rel(ap.changesNote.at)));
      if (ap.delegatedTo) body.append(SA.alert('info', 'مُفوَّض إلى ', h('b', {}, SA.userName(ap.delegatedTo)), '.'));
      const requester = SA.userById(ap.requesterId);
      body.append(h('div.sapi-panel-sec', {}, h('h4', {}, SA.icon('doc', 'icon-sm'), 'ملخص الطلب'), SA.kv([['النوع', typeLabel(ap)], ['مقدّم الطلب', requester ? requester.name + ' — ' + SA.roleName(requester.roleId) : '—'], ['القسم', requester ? SA.deptName(requester.departmentId) : '—'], ['أُنشئ', SA.fmt.dt(ap.createdAt) + ' (' + SA.fmt.rel(ap.createdAt) + ')'], ['SLA', SA.openValue('غير مُعدّ')], ap.amount != null ? ['المبلغ', SA.fmt.money(ap.amount)] : null, ap.discountPct != null ? ['نسبة الخصم', ap.discountPct + '%'] : null])));
      const ctxRows = (ap.context || []).filter((r) => !/الأجور سرية|ملاحظة/.test(r[0]) || true);
      if (ctxRows.length) body.append(h('div.sapi-panel-sec', {}, h('h4', {}, SA.icon('list', 'icon-sm'), 'السياق'), SA.kv(ctxRows.map((r) => [r[0], r[1]]))));
      const srows = sourceRows(ap); const src = source(ap);
      if (srows.length) {
        if (src.kind === 'salary_change' || src.kind === 'payroll_run') logRead(src.norm, src.rec.id, src.label + ' ' + src.rec.id);
        const lnk = SA.modules.find((x) => x.route === src.route) || null;
        body.append(h('div.sapi-panel-sec', {}, h('div.sap-section-head', {}, h('h4', {}, SA.icon('link', 'icon-sm'), 'السجل المصدر (' + src.label + ')'), lnk && SA.canOpen(lnk) ? h('a.sap-linkbtn', { href: '#/' + src.route }, 'فتحه في ' + lnk.title + ' ↗') : null), SA.kv(srows)));
      }
      if (ap.type === 'dealer_override') { const dr = dealerRefOf(ap); if (dr && SA.can('sa.dealers.view')) body.append(h('div.sapi-panel-sec', {}, h('a.sap-linkbtn', { href: SA.link.dealer(dr) }, 'فتح طلب التاجر ' + dr + ' ↗'))); }
      body.append(h('div.sapi-panel-sec', {}, h('h4', {}, SA.icon('layers', 'icon-sm'), 'سلسلة الاعتماد'), h('ol.sapi-chain-v', {}, ap.chain.map((c) => h('li.is-' + c.status, {}, h('span.sapi-node', {}, c.status === 'approved' ? SA.icon('check', 'icon-sm') : c.status === 'rejected' ? SA.icon('x', 'icon-sm') : String(c.step)), h('div', {}, h('b', {}, c.label), h('small', {}, { approved: 'اعتمد', pending: 'الدور عليه الآن', waiting: 'بانتظار الخطوة السابقة', rejected: 'رفض', skipped: 'أُلغيت' }[c.status] + (c.decidedBy ? ' · ' + SA.userName(c.decidedBy) + ' · ' + SA.fmt.rel(c.decidedAt) : '') + (c.actedFor ? ' (بالنيابة عن الدور)' : '')), c.reason ? h('div.sapi-why', {}, '«' + c.reason + '»') : null))))));
      const ev = (st.get('audit') || []).filter((e) => e.target && e.target.id === ap.id).slice(0, 6);
      body.append(h('div.sapi-panel-sec', {}, h('div.sap-section-head', {}, h('h4', {}, SA.icon('history', 'icon-sm'), 'سجل الطلب (' + ev.length + ')'), SA.can('sa.audit.view') ? h('a.sap-linkbtn', { href: SA.link.audit('target=' + ap.id) }, 'فتح في سجل التدقيق ↗') : null), ev.length ? h('div.audit.sap-audit-mini', {}, ev.map((e) => h('div.audit-item', {}, h('span.audit-ico', {}, SA.icon('history')), h('div', {}, h('b', {}, SA.auditLabel(e.code)), h('small', {}, e.actor.name + (e.reason ? ' · ' + e.reason : ''))), h('time', {}, SA.fmt.rel(e.ts))))) : h('p.t-muted', {}, 'لا توجد أحداث بعد على هذا الطلب.')));
      /* footer */
      if (ap.status === 'changes_requested' && ap.requesterId === u.id) foot.append(h('button.btn.btn-primary.sapi-grow', { type: 'button', onclick: () => resubmit(id) }, SA.icon('refresh', 'icon-sm'), 'إعادة إرسال بعد التعديل'));
      foot.append(SA.btn({ label: 'اعتماد', icon: 'check', kind: 'primary', class: 'sapi-grow', reason: lock, onClick: () => decide(id, 'approve') }), SA.btn({ label: 'رفض', icon: 'x', kind: 'danger', reason: lock, onClick: () => decide(id, 'reject') }), SA.btn({ label: 'طلب تعديل', icon: 'edit', kind: 'ghost', reason: lock, onClick: () => decide(id, 'changes') }), SA.btn({ label: 'تفويض', icon: 'swap', kind: 'ghost', reason: lock || (SA.can('sa.approvals.delegate') || isSuper() ? '' : 'ليست من صلاحياتك (sa.approvals.delegate)'), onClick: () => decide(id, 'delegate') }));
    }
    const unsub = (function () { const offs = ['approvals', 'users', 'payrollRuns', 'salaryChanges', 'requisitions', 'loans', 'leaveRequests', 'settlements'].map((p) => st.subscribe(p, () => { if (document.body.contains(d.el)) draw(); })); return () => offs.forEach((f) => f()); })();
    draw();
    return { close() { leaving = true; d.close(); } };
  }

  /* ── inbox screen ── */
  function render(root, ctx, defArea) {
    const q = ctx.params; const openId = ctx.path[0] || null; const base = ctx.module.route; let panel = null; let leaving = false;
    ctx.setCrumbs([{ label: defArea === 'hr' ? 'لوحة HR' : 'الرقابة' }, { label: 'صندوق الاعتمادات', href: openId ? '#/' + base : null }].concat(openId ? [{ label: openId }] : []));
    let area = q.area || defArea || ''; let view = q.view || (SA.approvals.count() ? 'mine' : 'open'); let state = 'loading'; let table = null;
    const head = h('div'); const bar = h('div.sap-pillbar'); const host = h('div'); root.append(head, host);
    const all = () => (st.get('approvals') || []).filter(visible).map((a) => Object.assign({}, a, { _mine: isOpen(a) && !why(a), _own: a.requesterId === me().id }));
    const inView = (a) => (view === 'mine' ? a._mine : view === 'open' ? isOpen(a) || a.status === 'changes_requested' : view === 'done' ? a.status === 'approved' || a.status === 'rejected' : view === 'requested' ? a._own : true);
    const inArea = (a) => !area || a.area === area;
    const rows = () => all().filter((a) => inArea(a) && inView(a));
    function cnt(v) { const prev = view; view = v; const n = all().filter((a) => inArea(a) && inView(a)).length; view = prev; return n; }
    function areaCnt(ar) { return all().filter((a) => (!ar || a.area === ar) && isOpen(a)).length; }
    let tabs = null;
    function sortFor() { const s = table && table.getState(); if (s) s.sort = view === 'done' ? { key: 'createdAt', dir: 'desc' } : { key: 'createdAt', dir: 'asc' }; }
    function build() {
      SA.clear(head); SA.clear(host);
      const mineN = SA.approvals.count();
      head.append(SA.pageHead({ title: 'صندوق الاعتمادات', desc: 'مكان واحد لكل ما ينتظر قرارًا — اعتمادات Super Admin والموارد البشرية. كل قرار يُسجَّل بسبب، ولا يعتمد أحد طلبه بنفسه.', tags: [SA.tag('approved', 'المفهوم Approved'), SA.tag('pending', 'السلسلة Pending')], actions: [h('span.sapi-list-note', {}, SA.icon('bolt', 'icon-sm'), mineN ? mineN + ' تنتظر قرارك الآن (نفس الرقم على أيقونة الموبايل)' : 'لا شيء ينتظر قرارك الآن')] }));
      tabs = SA.tabs({ label: 'مساحة الاعتماد', tabs: [{ id: '', label: 'الكل', badge: areaCnt('') }, { id: 'sa', label: 'Super Admin', badge: areaCnt('sa') }, { id: 'hr', label: 'الموارد البشرية', badge: areaCnt('hr') }], active: area, onChange: (id) => { area = id; sortFor(); refreshAll(); } });
      host.append(h('div.sap-statrow.sap-pills', {}, [['mine', 'تنتظر قراري'], ['open', 'كل المعلّقة'], ['done', 'تم البتّ فيها'], ['requested', 'طلباتي'], ['all', 'الكل']].map((p) => h('button.sap-pill', { type: 'button', 'aria-pressed': String(view === p[0]), style: view === p[0] ? { background: 'var(--eg-navy)', color: '#fff', borderColor: 'var(--eg-navy)' } : null, dataset: { view: p[0] }, onclick: () => { view = p[0]; sortFor(); build(); } }, p[1], h('b.num', {}, cnt(p[0]))))));
      host.append(tabs.el);
      table = SA.table({
        rowId: 'id', pageSize: 10, state, caption: 'صندوق الاعتمادات', initial: { q: q.q || '', filters: { type: q.type || '', requesterId: '', status: '' }, sort: view === 'done' ? { key: 'createdAt', dir: 'desc' } : { key: 'createdAt', dir: 'asc' } },
        rows, search: { placeholder: 'ابحث بعنوان الطلب أو رقمه أو مقدّمه…', keys: [(r) => r.title, (r) => r.id, (r) => SA.userName(r.requesterId)] },
        filters: [{ key: 'type', label: 'النوع', options: Object.keys(T).map((k) => [k, T[k].label]) }, { key: 'status', label: 'الحالة', options: Object.keys(SA.catalog.status.approval).map((k) => [k, SA.catalog.status.approval[k][0]]) }, { key: 'requesterId', label: 'مقدّم الطلب', options: Array.from(new Set(all().map((a) => a.requesterId))).map((id) => [id, SA.userName(id)]) }],
        columns: [
          { key: 'type', label: 'النوع', sort: true, value: (a) => typeLabel(a), render: (a) => h('span.sapi-type', {}, typeIcon(a), h('span', {}, typeLabel(a), h('br'), h('small.t-muted', {}, a.area === 'hr' ? 'HR' : 'SA'))) },
          { key: 'title', label: 'الطلب', sort: true, render: (a) => h('span.sapi-title', {}, h('b', {}, a.title, a._mine ? h('span.sapi-mine', {}, 'عليك') : null), h('small.num', {}, a.id)) },
          { key: 'requesterId', label: 'مقدّم الطلب', sort: true, value: (a) => SA.userName(a.requesterId), render: reqCell },
          { key: 'amount', label: 'المبلغ / الأثر', sort: (a, b) => (a.amount || 0) - (b.amount || 0), render: impactCell },
          { key: 'createdAt', label: 'العمر', sort: (a, b) => new Date(a.createdAt) - new Date(b.createdAt), render: ageCell },
          { key: 'chain', label: 'تقدّم السلسلة', render: chainMini },
          { key: 'status', label: 'الحالة', sort: true, render: (a) => SA.statusChip('approval', a.status) }
        ],
        rowActions: (a) => { const w = why(a); return [{ label: 'فتح التفاصيل', icon: 'eye', onClick: () => SA.nav(base + '/' + a.id) }, { divider: true }, { label: 'اعتماد…', icon: 'check', disabled: w, onClick: () => decide(a.id, 'approve') }, { label: 'رفض…', icon: 'x', danger: true, disabled: w, onClick: () => decide(a.id, 'reject') }, { label: 'طلب تعديل…', icon: 'edit', disabled: w, onClick: () => decide(a.id, 'changes') }, { label: 'تفويض…', icon: 'swap', disabled: w, onClick: () => decide(a.id, 'delegate') }]; },
        onRowClick: (a) => SA.nav(base + '/' + a.id),
        empty: { icon: 'inbox', title: view === 'mine' ? 'لا شيء ينتظر قرارك' : 'لا توجد طلبات هنا', text: view === 'mine' ? 'كل ما كان بانتظارك تم البتّ فيه. جرّب «كل المعلّقة» لترى ما ينتظر غيرك.' : 'غيّر الفلاتر أو التبويب.' },
        onRetry: load
      });
      host.append(h('div.card.card-flush.sap-listcard', {}, table.el));
    }
    function refreshAll() { if (state !== 'ready') return; const a = SA.$('.sapi-list-note', head); const n = SA.approvals.count(); if (a) a.lastChild.textContent = n ? n + ' تنتظر قرارك الآن (نفس الرقم على أيقونة الموبايل)' : 'لا شيء ينتظر قرارك الآن'; if (tabs) { ['', 'sa', 'hr'].forEach((id) => tabs.setBadge(id, areaCnt(id))); tabs.setActive(area); } SA.$$('.sap-pill', host).forEach((b) => { const v = b.dataset.view; b.lastChild.textContent = cnt(v); }); if (table) table.refresh(); }
    function load() { state = 'loading'; build(); SA.delay(260, { write: false }).then(() => { state = 'ready'; build(); }, () => { state = 'error'; build(); if (table) table.setState('error'); }); }
    load();
    const unsub = st.subscribe('approvals', () => { if (state === 'ready') refreshAll(); });
    if (openId) { if (!st.find('approvals', openId)) { SA.toast('الطلب غير موجود', 'error'); history.replaceState(null, '', '#/' + base); } else panel = openPanel(openId, base, () => { if (!leaving) SA.nav(base, { replace: true }); }); }
    return () => { leaving = true; unsub(); if (panel) panel.close(); };
  }

  /* ── registration (visible to anyone who can see/decide/request an approval; nav entry only for the matching space) ── */
  const canAccess = () => SA.canAny(ACCESS_KEYS) || mineList().length > 0 || (st.get('approvals') || []).some((a) => me() && a.requesterId === me().id);
  const def = (o) => { const d = Object.assign({ order: 5, icon: 'inbox', badge() { const n = SA.approvals.count(); return n || null; } }, o); Object.defineProperty(d, 'perm', { get() { return canAccess() ? null : 'sa.approvals.view'; }, set() {}, enumerable: true, configurable: true }); return d; };
  const sa = def({ id: 'approvals', group: 'oversight', title: 'صندوق الاعتمادات', route: 'approvals', order: 10, desc: 'كل ما ينتظر قرارًا: SA + HR', render: (root, ctx) => render(root, ctx, '') });
  Object.defineProperty(sa, 'nav', { get() { return SA.can('sa.approvals.view') || isSuper(); }, set() {}, enumerable: true, configurable: true });
  SA.register(sa);
  const hr = def({ id: 'hr-approvals', app: 'hr', group: 'hr-dash', title: 'صندوق الاعتمادات', route: 'hr/approvals', order: 5, desc: 'اعتمادات HR (نفس الصندوق المشترك)', render: (root, ctx) => render(root, ctx, 'hr') });
  Object.defineProperty(hr, 'nav', { get() { return SA.canAny(ACCESS_KEYS.filter((k) => k.indexOf('hr.') === 0)) && SA.appEnabled('hr'); }, set() {}, enumerable: true, configurable: true });
  SA.register(hr);
  SA.search.register({ id: 'approvals', label: 'الاعتمادات', query: (q) => (q ? (st.get('approvals') || []).filter((a) => visible(a) && (a.title.toLowerCase().indexOf(q) >= 0 || a.id.toLowerCase().indexOf(q) >= 0)).map((a) => ({ title: a.title, sub: a.id + ' · ' + typeLabel(a), icon: 'inbox', route: 'approvals/' + a.id })) : []) });

  /* ── missions ── */
  SA.missions.add({ id: 'M-B1', area: 'approvals', title: 'HR: اعتمد تغيير مرتب وشاهد أثره على ملف الموظف', persona: 'hr', route: 'approvals/AP-2011', est: '5 د', goal: 'AP-2011 جهّزه مسؤول المرتبات. كـHR Manager اعتمده (Step-up)، ثم كمدير عام أكمل السلسلة؛ بعدها سجل تغيير المرتب والأجر الجديد يظهران في ملف الموظف.', steps: [{ text: 'افتح الطلب AP-2011 وراجع سلسلته ولاحظ الأجور المحجوبة لغير المخوّل', route: 'approvals' }, { text: 'اعتمد خطوة HR', audit: 'APPROVAL.APPROVED' }, { text: 'بدّل لـGM واعتمد الخطوة الأخيرة', audit: 'HR.SALARY.CHANGE_APPROVED' }], detect: [{ audit: 'APPROVAL.APPROVED' }, { audit: 'HR.SALARY.CHANGE_APPROVED' }] });
  SA.missions.add({ id: 'M-B2', area: 'approvals', title: 'فصل المهام: لا يعتمد مُعِدّ الكشف كشفه', persona: 'payroll', route: 'approvals', est: '2 د', goal: 'كمسؤول مرتبات افتح AP-2009 (أنت من جهّزه): أزرار القرار مقفولة بسبب فصل المهام. ثم اطلب من HR اعتماده.', steps: [{ text: 'افتح AP-2009 وجرّب الاعتماد (مقفول)', route: 'approvals' }], detect: [{ route: 'approvals' }] });
  SA.missions.add({ id: 'M-B3', area: 'approvals', title: 'ارفض طلب توظيف بسبب ثم أعد إرساله بعد التعديل', persona: 'hr', route: 'approvals/AP-2013', est: '4 د', goal: 'اطلب تعديلًا على طلب التوظيف AP-2013، ثم بدّل لمشرف الخط وأعد إرساله.', steps: [{ text: 'كـHR Manager اطلب تعديلًا بسبب', audit: 'APPROVAL.CHANGES_REQUESTED' }, { text: 'كمشرف (supervisor) أعد الإرسال', audit: 'APPROVAL.RESUBMITTED' }], detect: [{ audit: 'APPROVAL.CHANGES_REQUESTED' }, { audit: 'APPROVAL.RESUBMITTED' }] });
})();
