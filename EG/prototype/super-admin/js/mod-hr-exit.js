/* EG HR prototype — mod-hr-exit.js  (HR-23 الاستقالات والإنهاء · HR-24 إخلاء الطرف · HR-25 المخالصات النهائية · HR-26 الأرشيف)
   Routes : #/hr/termination(/EXT-…)  ·  #/hr/clearance(/CLR-…)  ·  #/hr/settlement(/FS-…)  ·  #/hr/archive(/alumni-id)
   Specs  : docs/hr/06-separation.md · visual targets hr-exit.html (#hr-23 … #hr-26)

   COLLECTIONS added to the store by this module (guarded, idempotent — flag meta.hrExitSeeded):
     exitCases[]      { id:'EXT-2026-0001', employeeId, type:RSG|END|EMP|RET|DTH|ABD|PRB|MUT|ILL, status:draft|submitted|pending_approval|accepted|notice|closing|closed|withdrawn|cancelled|employer_path, … }
     clearances[]     { id:'CLR-2026-0001', caseId, employeeId, status:open|partial|cleared|cleared_waived, items[], signoffs[], handover[] }
     exitInterviews[] { id, caseId|null, employeeId|null, status, answers{…} }          (individual answers = T4)
     alumniFlags[]    { employeeId, eligibility, reasonCode, note, blacklist{…}, legalHold, talentConsent }
     alumniArchive[]  historical leavers (DEMO) that are not in employees[]
     rehireRequests[] · settlements[] (extended with lines/gross/deductions/net/ack…) · settings.hrExit · settings.hrArchive
   PUBLIC API (for other HR modules — payroll, custody, loans, ESS):
     SA.hrExit.employeeState(empId) → { status:'active|notice|terminated', lastWorkingDay, payUntil, caseId, payrollBlocked }
         payroll MUST stop paying wages after payUntil (= last working day) and must not include 'terminated' employees.
     SA.hrExit.openCase(empId) → the open exit case or null
     SA.hrExit.clearanceBlockers(empId) → { custody:[{label,ref}], loans:[{id,outstanding}] }
   SA.hrUtil (shared with mod-hr-docs.js): tafqit(n), money(n), ymd(d), addMonths(ymd,n), addDays(ymd,n), diffDays(a,b), nextNumber(prefix).
   New approval types: exit_acceptance · exit_waiver · blacklist_entry.   New permission keys: none (uses hr.termination.* / hr.clearance.* / hr.settlement.* / hr.archive.* + sensitive keys).
   T4 data (exit reasons, interview answers, blacklist reasons) is gated by hr.discipline.view in the prototype (docs: hr.exit.reason.view). */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;

  /* ───────────────────────── dates / numbers ───────────────────────── */
  const p2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => { d = d || new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : null; };
  const addDays = (s, n) => { const d = parse(s) || new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const addMonths = (s, n) => { const d = parse(s) || new Date(); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return ymd(d); };
  const diffDays = (a, b) => Math.round(((parse(b) || new Date()) - (parse(a) || new Date())) / 86400000);
  const today = () => ymd();
  const r2 = (n) => Math.round((Number(n) + 1e-9) * 100) / 100;
  const nf = (n, d) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d });
  const money = (n) => nf(n) + ' ج.م';
  const num = (t) => h('span.num', {}, t);
  const dnum = (s) => (s ? h('span.num', {}, s) : h('span.sap-dash', {}, '—'));
  const dayCount = (s) => { const d = diffDays(today(), s); return d === 0 ? 'اليوم' : d > 0 ? 'بعد ' + d + ' يوم' : 'منذ ' + (-d) + ' يوم'; };

  /* ───────────────────────── tafqit (المبلغ كتابةً — BR-DOC-10) ───────────────────────── */
  const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const HUND = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  function w999(n) {
    const out = []; const hh = Math.floor(n / 100), r = n % 100;
    if (hh) out.push(HUND[hh]);
    if (r) { if (r < 20) out.push(ONES[r]); else { const t = Math.floor(r / 10), o = r % 10; out.push(o ? ONES[o] + ' و' + TENS[t] : TENS[t]); } }
    return out.join(' و');
  }
  function unit(n, one, two, few, many) { // n = count, returns phrase with the counted noun
    if (n === 1) return one; if (n === 2) return two;
    const r = n % 100; const words = w999(n);
    if (r >= 3 && r <= 10) return words + ' ' + few;
    return words + ' ' + many;
  }
  function tafqit(amount) {
    const v = r2(Math.abs(amount)); let pounds = Math.floor(v + 1e-9); const piasters = Math.round((v - pounds) * 100);
    if (pounds === 0 && piasters === 0) return 'صفر جنيه';
    const parts = [];
    if (pounds > 0) {
      const mil = Math.floor(pounds / 1e6), th = Math.floor((pounds % 1e6) / 1000), rest = pounds % 1000; const seg = [];
      if (mil) seg.push(unit(mil, 'مليون', 'مليونان', 'ملايين', 'مليوناً'));
      if (th) seg.push(th === 100 ? 'مائة ألف' : th === 200 ? 'مائتا ألف' : unit(th, 'ألف', 'ألفان', 'آلاف', 'ألفاً'));
      if (rest) seg.push(w999(rest));
      const text = seg.join(' و'); const lastTwo = pounds % 100;
      parts.push(pounds === 1 ? 'جنيه واحد' : pounds === 2 ? 'جنيهان' : text + (lastTwo === 0 ? ' جنيه' : lastTwo >= 3 && lastTwo <= 10 ? ' جنيهات' : ' جنيهاً'));
    }
    if (piasters > 0) parts.push(piasters === 1 ? 'قرش واحد' : piasters === 2 ? 'قرشان' : w999(piasters) + (piasters >= 3 && piasters <= 10 ? ' قروش' : ' قرشاً'));
    return parts.join(' و');
  }

  /* ───────────────────────── numbering (settings.numbering) ───────────────────────── */
  const NEW_PREFIXES = [['CNF', 'خطاب تثبيت'], ['RSG', 'قبول استقالة'], ['ATT', 'كشف حضور شهري'], ['ACK', 'إقرار لائحة'], ['CUH', 'إيصال عهدة'], ['EXT', 'حالة إنهاء خدمة']];
  function ensurePrefixes() {
    const list = st.get('settings.numbering') || [];
    NEW_PREFIXES.forEach((p) => { if (!list.some((n) => n.prefix === p[0] || n.type === p[0])) st.update('settings.numbering', (l) => { l.push({ type: p[0], labelAr: p[1], prefix: p[0], format: 'PREFIX-YYYY-NNNN', pad: 4, includeYear: true, yearlyReset: true, last: 0, issued: 0, locked: false, source: 'HR 06/08 [New]', tag: 'new' }); }); });
  }
  /** Atomic sequential number for a prefix, e.g. nextNumber('FS') → 'FS-2026-0002'. Never re-used. */
  function nextNumber(prefix) {
    ensurePrefixes(); let out = null; const y = new Date().getFullYear();
    st.update('settings.numbering', (l) => {
      let n = l.find((x) => x.prefix === prefix || x.type === prefix);
      if (!n) { n = { type: prefix, labelAr: prefix, prefix, format: 'PREFIX-YYYY-NNNN', pad: 4, includeYear: true, yearlyReset: true, last: 0, issued: 0, locked: false, source: 'HR [New]', tag: 'new' }; l.push(n); }
      if (n.yearlyReset && n.year && n.year !== y) n.last = 0;
      n.year = y; n.last = (n.last || 0) + 1; n.issued = (n.issued || 0) + 1; n.locked = true;
      out = n.prefix + '-' + y + '-' + String(n.last).padStart(n.pad || 4, '0');
    });
    return out;
  }
  SA.hrUtil = Object.assign(SA.hrUtil || {}, { tafqit, money, ymd, parse, addMonths, addDays, diffDays, nextNumber, r2, nf });

  /* ───────────────────────── catalog extensions ───────────────────────── */
  [['HR.EXIT.CREATED', 'إنشاء حالة إنهاء خدمة', 'high'], ['HR.EXIT.RESIGNATION_SUBMITTED', 'تسجيل خطاب استقالة مع الإقرار', 'high'], ['HR.EXIT.RATIFICATION_RECORDED', 'تسجيل نتيجة تصديق الاستقالة', 'high'], ['HR.EXIT.EMPLOYER_REPLY_RECORDED', 'قرار صاحب العمل أو قبول ضمني', 'high'],
    ['HR.EXIT.ACCEPTED', 'اعتماد قبول الإنهاء', 'high'], ['HR.EXIT.WITHDRAWN', 'سحب الاستقالة (العدول)', 'high'], ['HR.EXIT.NOTICE_STARTED', 'بدء فترة الإخطار', 'high'], ['HR.EXIT.LAST_DAY_SET', 'تثبيت آخر يوم عمل', 'high'],
    ['HR.EXIT.RETENTION_LOGGED', 'جلسة احتفاظ بالموظف', 'medium'], ['HR.EXIT.BLOCK_TRIGGERED', 'حاجز إنهاء فُعّل', 'high'], ['HR.EXIT.BLOCK_WAIVED', 'تنازل عن حاجز إنهاء', 'critical'], ['HR.EXIT.WAIVER_REQUESTED', 'طلب تنازل عن حاجز', 'high'],
    ['HR.EXIT.EMPLOYER_PATH_STARTED', 'بدء مسار إنهاء صاحب العمل', 'high'], ['HR.EXIT.COURT_TASK_CREATED', 'مهمة رفع دعوى عمالية', 'high'], ['HR.EXIT.STATUS_CHANGED', 'تغيير الحالة الوظيفية بسبب الإنهاء', 'high'], ['HR.EXIT.CANCELLED', 'إلغاء حالة إنهاء بسبب', 'high'],
    ['HR.EXIT.SETTINGS_CHANGED', 'تعديل إعدادات الإنهاء والإخطار', 'high'], ['HR.EXIT.TYPE_RECORDED', 'تسجيل نوع إنهاء خاص (تجربة/عقد/تقاعد/وفاة…)', 'high'],
    ['HR.CLEARANCE.CREATED', 'إنشاء نموذج إخلاء طرف', 'high'], ['HR.CLEARANCE.ITEM_UPDATED', 'تحديث بند إخلاء طرف', 'medium'], ['HR.CLEARANCE.ITEM_CHARGE_PROPOSED', 'اقتراح خصم عهدة', 'high'], ['HR.CLEARANCE.SIGNED', 'توقيع قسم على إخلاء الطرف', 'high'],
    ['HR.CLEARANCE.SIGN_REVOKED', 'تراجع عن توقيع قسم', 'high'], ['HR.CLEARANCE.CLOSED', 'قفل إخلاء الطرف', 'high'], ['HR.CLEARANCE.PRINTED', 'طباعة نموذج إخلاء الطرف', 'medium'], ['HR.CLEARANCE.ESCALATED', 'تصعيد عائق إخلاء', 'medium'],
    ['HR.HANDOVER.COMPLETED', 'اكتمال تسليم المعرفة', 'medium'], ['HR.INTERVIEW.SCHEDULED', 'جدولة مقابلة ختامية', 'medium'], ['HR.INTERVIEW.DECLINED', 'اعتذار عن المقابلة الختامية', 'medium'], ['HR.INTERVIEW.DONE', 'إتمام مقابلة ختامية', 'medium'],
    ['HR.INTERVIEW.VIEWED', 'قراءة إجابات مقابلة فردية (T4)', 'high'], ['HR.INTERVIEW.STATS_VIEWED', 'اطلاع على إحصاءات المقابلات المجمّعة', 'info'],
    ['HR.SETTLEMENT.CREATED', 'إنشاء مسودة مخالصة', 'high'], ['HR.SETTLEMENT.LINE_OVERRIDDEN', 'تجاوز يدوي لسطر مخالصة', 'high'], ['HR.SETTLEMENT.SUBMITTED', 'إرسال المخالصة للاعتماد', 'high'], ['HR.SETTLEMENT.REJECTED', 'رفض المخالصة', 'high'],
    ['HR.SETTLEMENT.ACKNOWLEDGED', 'إقرار استلام المخالصة', 'high'], ['HR.SETTLEMENT.RULE_CHANGED', 'تعديل قاعدة مخالصة', 'high'], ['HR.CERT.ISSUED', 'إصدار شهادة', 'high'],
    ['HR.ALUMNI.CREATED', 'إنشاء سجل خريج', 'high'], ['HR.ALUMNI.REHIRE_FLAG_SET', 'تغيير أهلية إعادة التعيين', 'high'], ['HR.ALUMNI.TALENT_CONSENT', 'موافقة خريج على التواصل', 'medium'], ['HR.ALUMNI.EXPORTED', 'تصدير دليل الخريجين', 'medium'],
    ['HR.BLACKLIST.PROPOSED', 'اقتراح قائمة سوداء', 'high'], ['HR.BLACKLIST.APPROVED', 'اعتماد قائمة سوداء', 'critical'], ['HR.BLACKLIST.REMOVED', 'رفع من القائمة السوداء', 'high'], ['HR.REHIRE.STARTED', 'بدء إعادة تعيين خريج', 'high'],
    ['HR.ARCHIVE.POLICY_CHANGED', 'تعديل سياسة الأرشفة', 'high'], ['HR.ARCHIVE.ANONYMISE_RUN', 'تنفيذ إخفاء هوية', 'critical'], ['HR.RETENTION.HOLD_SET', 'تعيين حجز قانوني', 'high'], ['HR.RETENTION.HOLD_RELEASED', 'رفع حجز قانوني', 'high']
  ].forEach((a) => SA.catalog.addAudit(a[0], a[1], a[2], 'hr'));
  Object.assign(SA.catalog.approvalTypes, {
    exit_acceptance: { label: 'قبول استقالة / إنهاء خدمة', area: 'hr', icon: 'logout' },
    exit_waiver: { label: 'تنازل عن حاجز إنهاء', area: 'hr', icon: 'shield' },
    blacklist_entry: { label: 'إدراج في القائمة السوداء', area: 'hr', icon: 'alert' }
  });

  /* ───────────────────────── labels ───────────────────────── */
  const TYPES = { RSG: ['استقالة', 'الموظف', 'info'], END: ['انتهاء عقد محدد المدة', 'النظام', 'neutral'], EMP: ['إنهاء من صاحب العمل (مسار المحكمة م.148)', 'صاحب العمل', 'danger'], RET: ['تقاعد', 'الموظف / صاحب العمل', 'neutral'], DTH: ['وفاة', 'HR بشهادة وفاة', 'neutral'], ABD: ['غياب معتبر استقالة (م.166)', 'النظام يقترح · HR يقرر', 'warning'], PRB: ['إنهاء في فترة التجربة', 'صاحب العمل / الموظف', 'warning'], MUT: ['إنهاء بالتراضي', 'الطرفان', 'neutral'], ILL: ['انتهاء لعدم اللياقة الصحية', 'صاحب العمل', 'danger'] };
  const EMPLOYER_TYPES = ['EMP', 'END', 'PRB', 'ILL'];
  const STATUS = { draft: ['مسودة', 'neutral'], submitted: ['مُقدَّمة — بانتظار التصديق والرد', 'warning'], pending_approval: ['بانتظار الاعتماد', 'warning'], accepted: ['مقبولة', 'info'], notice: ['فترة إخطار', 'info'], closing: ['آخر يوم عمل — إخلاء ومخالصة', 'warning'], closed: ['مغلقة', 'success'], withdrawn: ['سُحبت', 'neutral'], cancelled: ['ملغاة', 'neutral'], employer_path: ['مسار صاحب العمل (م.148)', 'danger'] };
  const OPEN_STATES = ['draft', 'submitted', 'pending_approval', 'accepted', 'notice', 'closing', 'employer_path'];
  const REASONS = [['better_offer', 'فرصة عمل أفضل', 'VOL'], ['pay', 'الأجر والمزايا', 'VOL'], ['growth', 'فرص التطور والترقي', 'VOL'], ['mgmt', 'علاقة العمل مع الإدارة المباشرة', 'VOL'], ['conditions', 'ظروف وبيئة العمل', 'VOL'], ['relocation', 'الانتقال/السفر', 'VOL'], ['personal', 'ظروف شخصية أو عائلية', 'VOL'], ['study', 'دراسة', 'VOL'], ['contract_end', 'انتهاء العقد', 'INV'], ['employer', 'قرار صاحب العمل', 'INV'], ['other', 'أخرى (مع نص)', 'OTH']];
  const reasonLabel = (c) => (REASONS.find((r) => r[0] === c) || [0, c || '—'])[1];
  const EMP_STATUS = { active: ['نشط', 'success'], probation: ['تجربة', 'info'], leave: ['في إجازة', 'info'], suspended: ['موقوف', 'danger'], notice: ['فترة إخطار', 'warning'], terminated: ['منتهي', 'neutral'] };
  const SETT_STATUS = { draft: ['مسودة', 'neutral'], calculated: ['محسوبة', 'info'], in_review: ['قيد المراجعة والاعتماد', 'warning'], approved: ['معتمدة — بانتظار الصرف', 'info'], paid: ['مصروفة', 'success'], acknowledged: ['مُقرّ بالاستلام', 'success'] };

  /* ───────────────────────── store helpers ───────────────────────── */
  const emp = (id) => st.find('employees', id);
  const empName = (id) => { const e = emp(id); return e ? e.name : id || '—'; };
  const dept = (id) => SA.deptName(id);
  const meUser = () => SA.session.user;
  const myEmp = () => { const u = meUser(); return u ? (st.get('employees') || []).find((e) => e.userId === u.id) || null : null; };
  const isConflict = (empId) => { const m = myEmp(); if (!m) return false; if (m.id === empId) return true; const e = emp(empId); return !!(e && ((e.relatives || []).indexOf(m.id) >= 0 || (m.relatives || []).indexOf(empId) >= 0)); };
  const canSal = () => SA.canSensitive('hr.salary.view');
  const canT4 = () => SA.canSensitive('hr.discipline.view');
  const isGM = () => { const u = meUser(); return !!u && (u.roleId === 'R-02' || u.roleId === 'R-01'); };
  const monthly = (e) => (e && e.salary ? (+e.salary.basic || 0) + (+e.salary.allowances || 0) : 0);
  const settings = () => st.get('settings.hrExit') || {};
  const P = () => settings().params || {};
  const caseOf = (id) => st.find('exitCases', id);
  const openCaseOf = (empId) => (st.get('exitCases') || []).find((c) => c.employeeId === empId && OPEN_STATES.indexOf(c.status) >= 0) || null;
  const clearanceOf = (c) => (st.get('clearances') || []).find((x) => x.caseId === c.id) || null;
  const settlementOf = (c) => (st.get('settlements') || []).find((x) => x.caseId === c.id || (!x.caseId && x.employeeId === c.employeeId)) || null;
  const roleLabel = (id) => SA.roleName(id);
  const uname = (id) => (id ? SA.userName(id) : '—');
  function log(caseId, text, code) { st.update('exitCases', (l) => { const c = l.find((x) => x.id === caseId); if (c) { (c.timeline = c.timeline || []).unshift({ ts: new Date().toISOString(), by: meUser() ? meUser().id : 'SYSTEM', text, code: code || null }); } }); }
  function patchCase(id, patch) { return st.patch('exitCases', id, patch); }
  const gate = (perm) => SA.can(perm) ? '' : 'ليست من صلاحياتك (' + perm + ')';
  const sensReason = (k) => SA.canSensitive(k) ? '' : 'ليست من صلاحياتك (' + k + ')';
  const chip = (t, k) => SA.chip(t, k);
  const statusChip = (map, k) => { const m = map[k] || [k, 'neutral']; return chip(m[0], m[1]); };
  const tier = (t) => h('span.sap-x-tier.is-' + t.toLowerCase(), {}, t === 'T4' ? 'T4 · سري جدًا' : t === 'T3' ? 'T3 · سري' : t === 'T2' ? 'T2 · مقيّد' : 'T1 · داخلي');
  const lockedCell = (reason) => h('span.sap-x-lock', { title: reason }, SA.icon('lock', 'icon-sm'), 'مقيّد');

  /** DEMO law/open reminder line used on screens */
  const legalNote = (txt) => h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, txt));

  /* ───────────────────────── css ───────────────────────── */
  function css() {
    if (document.querySelector('style[data-mod="hr-exit"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'hr-exit');
    s.textContent = `
.sap-drawer.sap-size-xl{width:min(100%,880px)}
.sap-x-calc td:nth-child(3){min-width:150px}
.sap-x-tier{display:inline-flex;align-items:center;gap:6px;font:700 11px var(--font-body);padding:2px 9px;border-radius:999px;background:var(--color-neutral-tint);color:var(--color-neutral)}
.sap-x-tier.is-t3{background:var(--color-warning-tint);color:var(--color-warning)}.sap-x-tier.is-t4{background:var(--color-danger-tint);color:var(--color-danger)}
.sap-x-lock{display:inline-flex;align-items:center;gap:6px;color:var(--eg-muted);font-size:var(--text-caption)}
.sap-x-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-block-end:14px}
.sap-x-sub{display:block;color:var(--eg-muted);font-size:var(--text-caption);margin-block-start:2px}
.sap-x-steps{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.sap-x-steps li{display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:start;padding:10px 12px;border:1px solid var(--sap-hair);border-radius:10px;background:#fff}
.sap-x-steps li.is-done{background:var(--color-success-tint);border-color:transparent}.sap-x-steps li.is-bad{background:var(--color-danger-tint);border-color:transparent}.sap-x-steps li.is-warn{background:var(--color-warning-tint);border-color:transparent}
.sap-x-dot{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--eg-navy-tint,#e6ecf7);color:var(--eg-navy);font:700 12px var(--font-en)}
.is-done>.sap-x-dot{background:var(--color-success);color:#fff}.is-bad>.sap-x-dot{background:var(--color-danger);color:#fff}.is-warn>.sap-x-dot{background:var(--color-warning);color:#fff}
.sap-x-clock{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.sap-x-clock>div{border:1px solid var(--sap-hair);border-radius:12px;padding:12px;background:#fff}
.sap-x-clock b{display:block;font:700 22px var(--font-en);color:var(--eg-navy)}.sap-x-clock small{color:var(--eg-muted)}
.sap-x-clock>div.is-late b{color:var(--color-danger)}
.sap-x-dept{border:1px solid var(--sap-hair);border-radius:12px;background:#fff;margin-block-end:12px;overflow:hidden}
.sap-x-dept>header{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--eg-bg-soft,#f6f8fb);border-block-end:1px solid var(--sap-hair)}
.sap-x-dept>header b{flex:1}
.sap-x-item{display:grid;grid-template-columns:1fr auto;gap:8px 12px;padding:10px 14px;border-block-end:1px solid var(--sap-hair);align-items:center}
.sap-x-item:last-child{border-block-end:0}.sap-x-item small{color:var(--eg-muted);display:block}
.sap-x-calc{width:100%;border-collapse:collapse}.sap-x-calc th{text-align:start;font-size:var(--text-caption);color:var(--eg-muted);padding:8px;border-block-end:1px solid var(--sap-hair);background:var(--eg-bg-soft,#f6f8fb)}
.sap-x-calc td{padding:9px 8px;border-block-end:1px solid var(--sap-hair);vertical-align:top}.sap-x-calc tr.is-total td{font-weight:700;background:var(--eg-bg-soft,#f6f8fb)}.sap-x-calc tr.is-net td{background:var(--eg-navy);color:#fff;font-weight:700}
.sap-x-calc tr.is-off td{color:var(--eg-muted)}
.sap-x-calc td.e,.sap-x-calc th.e{text-align:end}
.sap-x-bar{display:flex;align-items:center;gap:8px}.sap-x-bar i{display:block;height:8px;border-radius:99px;background:var(--eg-navy);min-width:2px}.sap-x-bar i.is-mask{background:repeating-linear-gradient(45deg,#d8dde8,#d8dde8 4px,#eef1f6 4px,#eef1f6 8px)}
.sap-x-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:900px){.sap-x-grid2{grid-template-columns:1fr}}
.sap-x-rate{display:inline-flex;gap:4px}.sap-x-rate button{width:36px;height:36px;border:1px solid var(--color-border-strong);background:#fff;border-radius:8px;font:700 14px var(--font-en);cursor:pointer}.sap-x-rate button[aria-pressed="true"]{background:var(--eg-navy);color:#fff;border-color:var(--eg-navy)}
.sap-x-people{display:flex;align-items:center;gap:10px}
.sap-x-note{border-inline-start:3px solid var(--color-warning);background:var(--color-warning-tint);padding:8px 12px;border-radius:8px;font-size:var(--text-caption)}
.sap-x-tl{list-style:none;margin:0;padding:0;display:grid;gap:10px}.sap-x-tl li{display:grid;grid-template-columns:auto 1fr;gap:10px;padding-block-end:10px;border-block-end:1px dashed var(--sap-hair)}.sap-x-tl time{color:var(--eg-muted);font:12px var(--font-en);direction:ltr}
.sap-x-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.sap-x-stat{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
`; document.head.appendChild(s);
  }

  /* ───────────────────────── init / seeds (store is ready only after app.js) ───────────────────────── */
  const DEFAULT_RULES = [
    ['R01', 'أجر الأيام حتى آخر يوم', 'م.108', 'Pending', 'المقسوم {30}', true, false], ['R02', 'بدل الإجازة السنوية النقدي', 'م.125', 'Pending', 'الأساس والمقسوم {Open}', true, true],
    ['R03', 'بدل مهلة الإخطار', 'م.164', 'Pending', 'مدة الإخطار × الأجر', true, false], ['R04', 'تعويض إنهاء غير مشروع / مبكر', 'م.165 · م.154', 'Open', 'بقرار Legal — يدوي', false, true],
    ['R05', 'مكافأة نهاية الخدمة التعاقدية', '{Open}', 'Open', '{Open}', false, true], ['R06', 'مكافأة بعد 60 بلا معاش', 'م.172', 'Pending', '½ شهر/سنة (5 الأولى) ثم شهر/سنة', false, true],
    ['R07', 'بدل جنازة', 'م.169', 'Pending', 'شهرا أجر · حد أدنى {1,000}', true, false], ['R08', 'سقف خصم السلفة', 'م.113', 'Pending', '10% — السياسة {Open}', true, true],
    ['R09', 'سقف خصم التلف', 'م.151', 'Pending', '5 أيام/شهر · شهران إجمالي', true, false], ['R10', 'خصم دائنين/نفقة', 'م.114', 'Pending', '25% / 50% بحكم', false, false],
    ['R11', 'استرداد تكلفة التدريب', 'م.95', 'Open', '{Open}', false, true], ['R12', 'حصة التأمينات (موظف)', 'قانون 148', 'Pending', '11% · 2,700–16,700', true, false],
    ['R13', 'ضريبة كسب العمل', 'HR-17', 'Pending', 'الطريقة التراكمية — من HR-17', false, true], ['R14', 'مهلة صرف المستحقات', 'م.108(4)', 'Pending', '7 أيام · البداية {Open}', true, true],
    ['R15', 'مهلة شهادة الخبرة', 'م.175', 'Pending', '15 يومًا من الطلب', true, false], ['R16', 'الاحتفاظ بالملف', 'م.92', 'Pending', '≥ {5 سنوات} · المدة {Open}', true, false]
  ].map((r) => ({ code: r[0], label: r[1], source: r[2], status: r[3], value: r[4], effectiveFrom: r[3] === 'Open' ? null : (r[0] === 'R12' ? '2026-01-01' : '2025-09-01'), active: r[5], legalReview: r[6] }));
  const REQ_CLEAR = [
    ['store', 'المخزن', 'R-06', [['custody', 'تسليم عهدة الأدوات والمفاتيح', 'custody'], ['ppe', 'تسليم الزي ومهمات الوقاية PPE', 'custody']]],
    ['it', 'تقنية المعلومات', 'R-10', [['acct', 'تعطيل حساب النظام والبريد (آخر يوم عمل)', 'manual'], ['badge', 'تعطيل بصمة الحضور وبطاقة الدخول', 'manual']]],
    ['fin', 'المالية', 'R-07', [['loans', 'السلف والقروض المفتوحة (قراءة فقط من HR-15)', 'loan'], ['petty', 'عهد نقدية / سلف مصروفات', 'manual']]],
    ['ohs', 'السلامة والصحة المهنية', 'R-15', [['ppe2', 'استرداد معدات السلامة الخاصة', 'manual']]],
    ['sec', 'الأمن', 'R-01', [['gate', 'بطاقة الدخول ومفاتيح المصنع', 'manual']]],
    ['sup', 'المشرف المباشر', 'R-14', [['handover', 'تسليم المعرفة والمهام الجارية', 'manual']]],
    ['hr', 'الموارد البشرية', 'R-11', [['docs', 'ردّ أوراق الموظف وشهاداته الأصلية (م.175 — لا يُعطَّل)', 'manual', true], ['file', 'استكمال ملف الإنهاء وتحديث الحالة', 'manual']]]
  ];
  let inited = false;
  function ensureInit() {
    if (inited || !st.get('meta')) return; inited = true; ensurePrefixes();
    if (!st.get('meta.hrExitSeeded')) seed();
    st.set('meta.hrExitSeeded', true); wireReconcile(); reconcile();
  }
  function seed() {
    const D = (n) => addDays(today(), n); const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
    if (!st.get('settings.hrExit')) st.set('settings.hrExit', {
      replyWindowDays: 10, withdrawWindowDays: 10, noticeMonths: null, letterToleranceDays: null, gmGrade: null, gmStepEnabled: false, jobSearchHours: null, probationMaxMonths: 3, retirementAge: 60,
      abandonment: { enabled: false, consecutive: 10, intermittent: 20, warnConsecutive: 5, warnIntermittent: 10 }, minCell: 3, gmNetThreshold: null,
      params: { dayDivisor: 30, loanCapPct: 10, loanPolicy: 'cap', insurancePct: 11, insuranceMin: 2700, insuranceMax: 16700, damageCapDays: 5, damageCapMonths: 2, funeralMonths: 2, funeralMin: 1000, duesDays: 7, certDays: 15, retentionYears: 5 },
      rules: DEFAULT_RULES
    });
    if (!st.get('settings.hrArchive')) st.set('settings.hrArchive', { minRetentionYears: 5, retentionYears: null, anonymiseAfterYears: null, blacklistReviewMonths: null, minCell: 3, status: 'Pending', source: 'م.92 — المدة {Open}' });
    // a certified sick leave (employer-side termination block demo) + one active loan for the notice-period employee
    st.update('leaveRequests', (l) => { if (!l.some((x) => x.id === 'LV-2026-0900')) l.push({ id: 'LV-2026-0900', employeeId: 'E-1031', type: 'sick', from: D(-2), to: D(5), days: 8, status: 'approved', approverEmpId: 'E-1014', reason: 'إجازة مرضية بشهادة طبية (تجريبي)', createdAt: ago(60 * 50) }); });
    st.update('loans', (l) => { if (!l.some((x) => x.id === 'LN-2026-0090')) l.push({ id: 'LN-2026-0090', employeeId: 'E-1022', kind: 'loan', amount: 6000, remaining: 4200, monthly: null, status: 'active', requestedAt: ago(60 * 24 * 150), approvalId: null }); });
    const mk = (o) => Object.assign({ createdBy: 'U-25', createdAt: ago(60 * 24 * 3), reasonCode: null, reasonText: '', letterDate: null, submittedOn: null, attested: null, ratification: { status: 'pending', ref: '', date: null }, replyDueOn: null, acceptedOn: null, acceptedBy: null, approvalId: null, withdrawalDeadline: null, withdrawnOn: null, noticeStart: null, noticeMonths: null, pausedDays: 0, lastWorkingDay: null, noticePaidInLieu: false, tasks: [], blocks: [], timeline: [], clearanceId: null, settlementId: null, closedAt: null, extra: {}, demo: true }, o);
    const cases = [
      mk({ id: 'EXT-2026-0001', employeeId: 'E-1016', type: 'RSG', status: 'closed', reasonCode: 'relocation', reasonText: 'انتقال لفرع آخر (تجريبي)', letterDate: D(-65), submittedOn: D(-65), attested: { at: ago(60 * 24 * 65), method: 'IN_PERSON' }, ratification: { status: 'ratified', ref: 'RAT-DEMO-17', date: D(-64) }, replyDueOn: D(-55), acceptedOn: D(-58), acceptedBy: 'U-08', withdrawalDeadline: D(-48), noticeStart: D(-50), noticeMonths: 1, lastWorkingDay: D(-20), closedAt: ago(60 * 24 * 20), clearanceId: 'CLR-2026-0001', settlementId: 'FS-2026-0001', createdAt: ago(60 * 24 * 65),
        blocks: [{ rule: 'settlement', state: 'waived', waivedBy: 'U-03', reason: 'تنازل مسجّل: الموظف انتقل وبيانات حسابه البنكي قيد التحديث، والمخالصة تُستكمل بالاعتماد والصرف بشكل منفصل (تجريبي).', at: ago(60 * 24 * 20) }],
        tasks: [{ id: 'T1', title: 'تصديق الاستقالة من الجهة المختصة', status: 'done', dueOn: D(-60), doneAt: ago(60 * 24 * 64) }], timeline: [{ ts: ago(60 * 24 * 20), by: 'U-08', text: 'إغلاق الحالة وتحويل الموظف إلى «منتهي» بعد تنازل المدير العام عن حاجز المخالصة', code: 'HR.EXIT.STATUS_CHANGED' }, { ts: ago(60 * 24 * 50), by: 'U-08', text: 'بدء فترة الإخطار (شهر واحد) — آخر يوم عمل ' + D(-20), code: 'HR.EXIT.NOTICE_STARTED' }, { ts: ago(60 * 24 * 58), by: 'U-08', text: 'اعتماد قبول الاستقالة', code: 'HR.EXIT.ACCEPTED' }, { ts: ago(60 * 24 * 65), by: 'U-25', text: 'تسجيل خطاب الاستقالة مع إقرار الموظف', code: 'HR.EXIT.RESIGNATION_SUBMITTED' }] }),
      mk({ id: 'EXT-2026-0002', employeeId: 'E-1022', type: 'RSG', status: 'notice', reasonCode: 'better_offer', reasonText: 'عرض من شركة أخرى (تجريبي)', letterDate: D(-14), submittedOn: D(-14), attested: { at: ago(60 * 24 * 14), method: 'OTP' }, ratification: { status: 'ratified', ref: 'RAT-DEMO-22', date: D(-13) }, replyDueOn: D(-4), acceptedOn: D(-9), acceptedBy: 'U-08', withdrawalDeadline: D(1), noticeStart: D(-9), noticeMonths: 1, lastWorkingDay: addDays(addMonths(D(-9), 1), -1), clearanceId: 'CLR-2026-0002', settlementId: 'FS-2026-0003', createdAt: ago(60 * 24 * 14),
        tasks: [{ id: 'T1', title: 'تصديق الاستقالة من الجهة المختصة', status: 'done', dueOn: D(-10), doneAt: ago(60 * 24 * 13) }], timeline: [{ ts: ago(60 * 24 * 9), by: 'U-08', text: 'بدء فترة الإخطار — شهر واحد (مدة متفق عليها بالعقد التجريبي)', code: 'HR.EXIT.NOTICE_STARTED' }, { ts: ago(60 * 24 * 9), by: 'U-08', text: 'اعتماد قبول الاستقالة', code: 'HR.EXIT.ACCEPTED' }, { ts: ago(60 * 24 * 14), by: 'U-25', text: 'تسجيل خطاب الاستقالة مع إقرار الموظف', code: 'HR.EXIT.RESIGNATION_SUBMITTED' }] }),
      mk({ id: 'EXT-2026-0003', employeeId: 'E-1028', type: 'RSG', status: 'submitted', reasonCode: 'pay', reasonText: 'الأجر (تجريبي)', letterDate: D(-6), submittedOn: D(-6), attested: { at: ago(60 * 24 * 6), method: 'IN_PERSON' }, replyDueOn: D(4), createdAt: ago(60 * 24 * 6),
        tasks: [{ id: 'T1', title: 'تصديق الاستقالة من الجهة المختصة', status: 'pending', dueOn: D(3), doneAt: null }], timeline: [{ ts: ago(60 * 24 * 6), by: 'U-25', text: 'تسجيل خطاب الاستقالة مع إقرار الموظف — بدأت مهلة الرد (10 أيام)', code: 'HR.EXIT.RESIGNATION_SUBMITTED' }] }),
      mk({ id: 'EXT-2026-0004', employeeId: 'E-1031', type: 'PRB', status: 'draft', reasonCode: 'employer', reasonText: 'عدم اجتياز التجربة (تجريبي)', createdAt: ago(60 * 24), extra: { probationStart: null }, timeline: [{ ts: ago(60 * 24), by: 'U-25', text: 'إنشاء حالة إنهاء في فترة التجربة', code: 'HR.EXIT.CREATED' }] })
    ];
    st.set('exitCases', cases);
    st.update('employees', (l) => { const e = l.find((x) => x.id === 'E-1022'); if (e) { e.status = 'notice'; e.endDate = cases[1].lastWorkingDay; } });
    // clearances
    const items = (spec, signedDepts, empId) => { const out = []; REQ_CLEAR.forEach((d) => d[3].forEach((it) => out.push({ id: d[0] + '-' + it[0], dept: d[0], label: it[1], ownerRole: d[2], status: signedDepts.indexOf(d[0]) >= 0 ? 'cleared' : 'open', source: it[2] === 'custody' ? 'manual' : it[2], sourceRef: null, note: '', due: null, chargeAmount: 0, locked: !!it[3], evidence: '' }))); return out; };
    const all = REQ_CLEAR.map((d) => d[0]);
    const sg = (d, by, daysAgo) => ({ dept: d, by, at: ago(60 * 24 * daysAgo), decision: 'cleared', hash: 'h' + Math.abs((d + by).split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7)).toString(16), proxy: false, reason: '' });
    st.set('clearances', [
      { id: 'CLR-2026-0001', caseId: 'EXT-2026-0001', employeeId: 'E-1016', status: 'cleared', createdAt: ago(60 * 24 * 50), items: items(null, all, 'E-1016'), signoffs: [sg('store', 'U-07', 22), sg('it', 'U-09', 21), sg('fin', 'U-06', 21), sg('ohs', 'U-28', 21), sg('sec', 'U-01', 21), sg('sup', 'U-27', 21), sg('hr', 'U-08', 20)], handover: [], demo: true },
      { id: 'CLR-2026-0002', caseId: 'EXT-2026-0002', employeeId: 'E-1022', status: 'partial', createdAt: ago(60 * 24 * 9), items: items(null, ['store', 'ohs'], 'E-1022'), signoffs: [sg('store', 'U-07', 2), sg('ohs', 'U-28', 1)], handover: [{ id: 'HV-1', task: 'تسليم جدول صيانة خط بثق الأبواب', receiverName: 'هاني عادل', confirmed: true, supSigned: false }, { id: 'HV-2', task: 'ملف أوامر التشغيل الجارية', receiverName: 'وائل مسعود', confirmed: false, supSigned: false }], demo: true }
    ]);
    // settlements: normalise the core seed + a draft for the notice-period employee
    st.update('settlements', (l) => {
      l.forEach((s) => { if (s.id === 'FS-2026-0001') { s.caseId = 'EXT-2026-0001'; s.scenario = 'RSG'; s.status = 'in_review'; s.projected = false; s.calcVersion = 1; } });
      if (!l.some((s) => s.id === 'FS-2026-0003')) l.push({ id: 'FS-2026-0003', employeeId: 'E-1022', caseId: 'EXT-2026-0002', scenario: 'RSG', status: 'draft', calculatedBy: null, approvalId: null, createdAt: ago(60 * 24 * 9), projected: true, calcVersion: 0, manual: {}, overrides: {} });
    });
    st.update('settlements', (l) => { const s = l.find((x) => x.id === 'FS-2026-0001'); if (s && !s.lines) { const calc = calcSettlement(emp('E-1016'), caseOf('EXT-2026-0001'), s, true); Object.assign(s, calc, { calculatedAt: ago(60 * 30), duesDueBy: addDays(D(-20), 7) }); } });
    // interviews (done: Karim + historical anonymous demo answers)
    const iv = (id, empId, reason, r, ret, cmt, d) => ({ id, caseId: empId === 'E-1016' ? 'EXT-2026-0001' : null, employeeId: empId, interviewerId: 'U-25', status: 'done', consentAt: ago(60 * 24 * d), doneAt: ago(60 * 24 * d), demo: true, answers: { reason, rating: r, wouldReturn: ret, comment: cmt } });
    st.set('exitInterviews', [iv('XI-001', 'E-1016', 'relocation', { mgmt: 4, pay: 3, conditions: 4, growth: 3 }, true, 'انتقال لفرع آخر — تجربة جيدة (تجريبي).', 22), iv('XI-H01', null, 'pay', { mgmt: 3, pay: 2, conditions: 3, growth: 2 }, false, '', 120), iv('XI-H02', null, 'better_offer', { mgmt: 4, pay: 3, conditions: 3, growth: 2 }, true, '', 110), iv('XI-H03', null, 'pay', { mgmt: 4, pay: 2, conditions: 4, growth: 3 }, true, '', 95), iv('XI-H04', null, 'growth', { mgmt: 3, pay: 3, conditions: 3, growth: 1 }, false, '', 80), iv('XI-H05', null, 'personal', { mgmt: 5, pay: 4, conditions: 4, growth: 4 }, true, '', 66), iv('XI-H06', null, 'pay', { mgmt: 2, pay: 2, conditions: 3, growth: 3 }, false, '', 50), iv('XI-H07', null, 'conditions', { mgmt: 3, pay: 3, conditions: 2, growth: 3 }, false, '', 41), { id: 'XI-002', caseId: 'EXT-2026-0002', employeeId: 'E-1022', interviewerId: null, status: 'scheduled', scheduledAt: addDays(today(), 12), consentAt: null, answers: null, demo: true }]);
    // alumni
    st.set('alumniFlags', [{ employeeId: 'E-1016', eligibility: 'eligible', reasonCode: 'resigned_good', note: 'استقالة عادية وأداء جيد (تجريبي)', setBy: 'U-08', setAt: ago(60 * 24 * 19), blacklist: { status: 'none' }, legalHold: false, talentConsent: true }]);
    const AH = [['AL-H01', 'إيهاب نصر الدين', 'فني تشغيل', 'D-09', 1020, 400, 'RSG', 'eligible', 'none'], ['AL-H02', 'سعيد فتحي المراكبي', 'أمين مخزن', 'D-04', 1500, 250, 'RSG', 'conditional', 'none'], ['AL-H03', 'مجدي عبد الواحد', 'فني تركيب', 'D-12', 800, 160, 'EMP', 'ineligible', 'approved'], ['AL-H04', 'رضوى حسني', 'محاسبة', 'D-03', 1900, 500, 'END', 'eligible', 'none'], ['AL-H05', 'ياسين فؤاد', 'فني لامينيشن', 'D-11', 700, 300, 'PRB', 'ineligible', 'none']];
    st.set('alumniArchive', AH.map((a) => ({ id: a[0], name: a[1], lastPosition: a[2], departmentId: a[3], hiredOn: D(-a[4]), exitedOn: D(-a[5]), exitType: a[6], eligibility: a[7], reasonCode: a[7] === 'ineligible' ? (a[0] === 'AL-H03' ? 'integrity' : 'probation_fail') : 'resigned_good', note: a[7] === 'ineligible' ? 'سبب موثّق من الكتالوج (تجريبي)' : '', blacklist: a[8] === 'approved' ? { status: 'approved', reasonCode: 'document_forgery', evidenceRef: 'محضر تحقيق DEMO-77', proposedBy: 'U-08', approvedBy: 'U-03', reviewOn: addDays(today(), 160) } : { status: 'none' }, legalHold: false, talentConsent: a[7] === 'eligible', demo: true })));
    st.set('rehireRequests', []);
  }
  /** clearance items for a (new) case — manual templates + live sources are merged at render time */
  function newClearanceItems() { const out = []; REQ_CLEAR.forEach((d) => d[3].forEach((it) => out.push({ id: d[0] + '-' + it[0], dept: d[0], label: it[1], ownerRole: d[2], status: 'open', source: it[2] === 'custody' ? 'manual' : it[2], sourceRef: null, note: '', due: null, chargeAmount: 0, locked: !!it[3], evidence: '' }))); return out; }

  /* ───────────────────────── blocks (BR-TRM-06/09/11) ───────────────────────── */
  const sickLeaveOn = (empId, date) => (st.get('leaveRequests') || []).find((l) => l.employeeId === empId && l.type === 'sick' && l.status === 'approved' && l.from <= date && l.to >= date) || null;
  const approvedLeaveDays = (empId, from, to) => { let n = 0; (st.get('leaveRequests') || []).forEach((l) => { if (l.employeeId === empId && l.status === 'approved') { const a = l.from > from ? l.from : from, b = l.to < to ? l.to : to; if (a <= b) n += diffDays(a, b) + 1; } }); return n; };
  function computeBlocks(c) {
    const out = []; const employer = EMPLOYER_TYPES.indexOf(c.type) >= 0; const stored = (r) => (c.blocks || []).find((b) => b.rule === r) || null;
    const mk = (rule, label, law, triggered, detail, waivable) => { const sb = stored(rule); const state = !triggered ? 'ok' : sb && sb.state === 'waived' ? 'waived' : sb && sb.state === 'waiver_requested' ? 'waiver_requested' : 'triggered'; out.push({ rule, label, law, state, detail, waivable, stored: sb }); };
    if (employer) { const lv = sickLeaveOn(c.employeeId, today()); mk('sick_leave', 'لا إنهاء من صاحب العمل أثناء إجازة مرضية مثبتة', 'م.54–55 · م.162 · BR-TRM-09 — بلا زر تجاوز', !!lv, lv ? 'إجازة مرضية ' + lv.id + ' من ' + lv.from + ' إلى ' + lv.to : 'لا توجد إجازة مرضية سارية الآن', false); }
    if (c.type === 'RSG') mk('ratification', 'الاستقالة كتابية ومُصدَّقة — لا إغلاق بدون حالة تصديق مسجّلة', 'م.167 · BR-TRM-02', (c.ratification || {}).status === 'pending' || (c.ratification || {}).status === 'on_hold', 'حالة التصديق: ' + ({ pending: 'لم تُسجَّل', ratified: 'مُصدَّقة', on_hold: 'معلّقة', not_required: 'غير مطلوبة بتقدير قانوني' }[(c.ratification || {}).status] || '—'), false);
    if (c.type === 'EMP') mk('court', 'لا «منتهي» إلا بحكم أو تسوية مسجّلة (م.148 — لا زر فصل)', 'BR-TRM-10', !(c.extra && c.extra.ruling), (c.extra && c.extra.ruling) ? 'مرجع الحكم/التسوية: ' + c.extra.ruling : 'لم يُسجَّل حكم أو تسوية', false);
    const cl = clearanceOf(c); mk('clearance', 'لا «منتهي» قبل قفل إخلاء الطرف إلا بتنازل المدير العام بسبب', 'BR-TRM-11 · BR-CLR-11', !cl || ['cleared', 'cleared_waived'].indexOf(cl.status) < 0, cl ? 'حالة الإخلاء: ' + ({ open: 'مفتوح', partial: 'مخلّى جزئيًا', cleared: 'مخلّى', cleared_waived: 'مخلّى بتنازل' }[cl.status]) : 'لم يُنشأ نموذج إخلاء بعد', true);
    const s = settlementOf(c); mk('settlement', 'لا «منتهي» قبل صرف المخالصة إلا بتنازل المدير العام بسبب', 'BR-TRM-11 · BR-FNL-03', !s || ['paid', 'acknowledged'].indexOf(s.status) < 0, s ? 'حالة المخالصة: ' + SETT_STATUS[s.status][0] : 'لا توجد مخالصة', true);
    return out;
  }
  const blocking = (bl) => bl.filter((b) => b.state === 'triggered' || b.state === 'waiver_requested');

  /* ───────────────────────── settlement engine (HR-25 — all rules are Pending/Open settings) ───────────────────────── */
  const ruleOn = (code) => { const r = (settings().rules || []).find((x) => x.code === code); return !!(r && r.active); };
  const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function loansOf(empId) { return (st.get('loans') || []).filter((l) => l.employeeId === empId && ['active', 'approved'].indexOf(l.status) >= 0).map((l) => ({ id: l.id, kind: l.kind, outstanding: l.remaining != null ? +l.remaining : +l.amount || 0, amount: +l.amount || 0 })); }
  function calcSettlement(e, c, s) {
    const p = P(); const m = monthly(e); const basic = e && e.salary ? +e.salary.basic || 0 : 0; const div = p.dayDivisor || 30; const lastDay = (c && c.lastWorkingDay) || (e && e.endDate) || today();
    const daily = m / div; const man = (s && s.manual) || {}; const ov = (s && s.overrides) || {}; const L = [];
    const add = (code, kind, label, basis, source, status, amount, o) => { const base = r2(amount); const line = Object.assign({ code, kind, label, basis, source, status, amount: base, insurable: false, taxable: false, on: true }, o || {}); if (ov[code]) { line.original = base; line.amount = r2(ov[code].amount); line.overridden = true; line.overrideReason = ov[code].reason; } L.push(line); };
    const ld = parse(lastDay) || new Date(); const dom = Math.min(ld.getDate(), div);
    add('A1', 'E', 'أجر شهر ' + MONTHS_AR[ld.getMonth()] + ' (' + dom + '/' + div + ')', nf(m) + ' × ' + dom + ' ÷ ' + div, 'م.108', 'Pending', m * dom / div, { insurable: true, taxable: true });
    add('A2', 'E', 'حافز إنتاج / متغير معتمد', man.A2 ? 'مُدخل يدويًا' : 'لا حوافز معتمدة (HR-14 / HR-22)', 'BR-FNL-10', man.A2 ? 'Approved' : 'لا ينطبق', man.A2 || 0, { taxable: true });
    const lb = (st.get('leaveBalances') || []).find((x) => x.employeeId === (e && e.id) && x.type === 'annual'); const lDays = lb ? +lb.balanceDays || 0 : 0;
    add('A3', 'E', 'بدل رصيد الإجازة السنوية', lb ? lDays + ' يوم × ' + nf(daily) : 'لا رصيد مسجّل في HR-11', 'م.125', 'Pending', ruleOn('R02') ? lDays * daily : 0, { on: ruleOn('R02'), note: 'أساس السعر والمقسوم {Open} — مراجعة قانونية' });
    const lieu = !!(c && c.noticePaidInLieu && ruleOn('R03')); add('A4', 'E', 'بدل مهلة الإخطار', lieu ? (c.noticeMonths || 0) + ' × ' + nf(m) : 'مُستوفاة / لا ينطبق', 'م.164', 'Pending', lieu ? (c.noticeMonths || 0) * m : 0, { on: ruleOn('R03') });
    const eosOn = ruleOn('R04') || ruleOn('R05'); add('A5', 'E', 'تعويض / مكافأة نهاية الخدمة', eosOn ? (man.A5 && man.A5.ref ? 'مرجع القرار: ' + man.A5.ref : 'قاعدة مُفعّلة — أدخل المبلغ بقرار Legal') : 'قاعدة مغلقة (R04/R05) — مصادر متعارضة', eosOn ? 'م.165 / {Open}' : 'R04 · R05', eosOn ? 'Pending' : 'Open', eosOn && man.A5 ? man.A5.amount || 0 : 0, { on: eosOn });
    if (c && c.type === 'DTH') add('A6', 'E', 'بدل جنازة', 'max(' + (p.funeralMonths || 2) + ' × ' + nf(m) + ' ; ' + nf(p.funeralMin || 1000) + ')', 'م.169', 'Pending', ruleOn('R07') ? Math.max((p.funeralMonths || 2) * m, p.funeralMin || 1000) : 0, { on: ruleOn('R07') });
    const gross = r2(L.filter((x) => x.kind === 'E').reduce((a, x) => a + x.amount, 0));
    const insBase = Math.min(Math.max(basic, p.insuranceMin || 0), p.insuranceMax || 1e9);
    add('D1', 'D', 'تأمينات اجتماعية — حصة الموظف', (p.insurancePct || 11) + '% × ' + nf(insBase), 'قانون 148', 'Pending', ruleOn('R12') ? insBase * (p.insurancePct || 11) / 100 : 0, { on: ruleOn('R12'), note: 'الأجر الخاضع = الأساسي (تجريبي — D4 Open)' });
    add('D2', 'D', 'ضريبة كسب العمل', ruleOn('R13') ? 'من محرك HR-17' : 'غير مُعدّة — تُحسب من HR-17 (طريقة تراكمية)', 'HR-17', 'Open', man.D2 || 0, { on: ruleOn('R13') || !!man.D2 });
    const ln = loansOf(e && e.id); const out = ln.reduce((a, x) => a + x.outstanding, 0); const cap = (p.loanCapPct || 10) / 100 * m; const d3 = ruleOn('R08') ? (p.loanPolicy === 'full' ? out : Math.min(out, cap)) : 0;
    add('D3', 'D', 'استرداد سلفة / قرض', out ? 'min(' + nf(out) + ' ; ' + (p.loanCapPct || 10) + '% × ' + nf(m) + ' = ' + nf(cap) + ')' : 'لا أرصدة مفتوحة', 'م.113', 'Pending', d3, { on: ruleOn('R08'), note: 'سياسة الاسترداد {Open} — المحافظ: بحد م.113 والباقي مطالبة' });
    const cl = c ? clearanceOf(c) : null; const chg = cl ? cl.items.filter((x) => x.status === 'charge').reduce((a, x) => a + (+x.chargeAmount || 0), 0) : 0;
    add('D4', 'D', 'عهدة مفقودة / تالفة', chg ? 'مجموع بنود الإخلاء (بحد م.151)' : 'لا خصومات عهدة', 'م.151', 'Pending', ruleOn('R09') ? chg : 0, { on: ruleOn('R09') });
    const ded = r2(L.filter((x) => x.kind === 'D').reduce((a, x) => a + x.amount, 0)); const diff = r2(gross - ded);
    return { lines: L, gross, deductions: ded, net: Math.max(0, diff), receivable: r2(Math.max(0, out - d3) + Math.max(0, -diff)), outstandingLoans: out, rulesetId: 'RS-' + (settings().rulesVersion || 1), rulesetEffectiveFrom: '2025-09-01', lastWorkingDay: lastDay, projected: lastDay > today() };
  }

  /* ───────────────────────── approvals reconcile (owner-module duty: update the source record on decision) ───────────────────────── */
  const deciderOf = (ap) => { const s = (ap.chain || []).filter((x) => x.status === 'approved' || x.status === 'rejected').pop(); return s ? s.decidedBy : null; };
  const actorOf = (uid) => { const u = SA.userById(uid); return u ? { id: u.id, name: u.name, roleId: u.roleId } : undefined; };
  let reconciling = false;
  function reconcile() {
    if (reconciling) return; reconciling = true;
    try {
      const aps = st.get('approvals') || []; const by = (id) => aps.find((a) => a.id === id);
      (st.get('exitCases') || []).slice().forEach((c) => {
        if (c.status === 'pending_approval' && c.approvalId) {
          const ap = by(c.approvalId);
          if (ap && ap.status === 'approved') {
            const dec = deciderOf(ap); const cur = settings();
            patchCase(c.id, { status: 'accepted', acceptedOn: today(), acceptedBy: dec, withdrawalDeadline: c.type === 'RSG' ? addDays(today(), cur.withdrawWindowDays || 10) : null });
            log(c.id, 'اعتماد قبول الإنهاء بواسطة ' + uname(dec), 'HR.EXIT.ACCEPTED');
            SA.audit('HR.EXIT.ACCEPTED', { actor: actorOf(dec), target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) + ' — ' + TYPES[c.type][0] }, after: { status: 'accepted' } });
            SA.notify({ title: 'اعتُمد قبول الإنهاء: ' + empName(c.employeeId), body: 'ابدأ فترة الإخطار من ملف الحالة ' + c.id + '.', level: 'action', to: ['R-11', 'R-12'], link: '#/hr/termination/' + c.id });
          } else if (ap && (ap.status === 'rejected' || ap.status === 'changes_requested')) {
            patchCase(c.id, { status: c.type === 'RSG' ? 'submitted' : 'draft', approvalId: null }); log(c.id, 'لم يُعتمد القبول (' + (ap.status === 'rejected' ? 'رُفض' : 'طُلب تعديل') + ') — الحالة عادت للمراجعة', null);
            SA.notify({ title: 'قرار على قبول الإنهاء: ' + empName(c.employeeId), body: 'الطلب ' + ap.id + ' لم يُعتمد.', level: 'info', to: ['R-11', 'R-12'], link: '#/hr/termination/' + c.id });
          }
        }
        (c.blocks || []).forEach((b) => {
          if (b.state !== 'waiver_requested' || !b.approvalId) return; const ap = by(b.approvalId); if (!ap) return;
          if (ap.status === 'approved') { const dec = deciderOf(ap); st.update('exitCases', (l) => { const cc = l.find((x) => x.id === c.id); const bb = cc.blocks.find((x) => x.rule === b.rule); bb.state = 'waived'; bb.waivedBy = dec; bb.at = new Date().toISOString(); }); log(c.id, 'تنازل المدير العام عن حاجز «' + b.rule + '» — السبب: ' + b.reason, 'HR.EXIT.BLOCK_WAIVED'); SA.audit('HR.EXIT.BLOCK_WAIVED', { actor: actorOf(dec), target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, reason: b.reason, after: { rule: b.rule, state: 'waived' } }); SA.notify({ title: 'تم التنازل عن حاجز إنهاء', body: empName(c.employeeId) + ' — ' + b.rule, level: 'info', to: ['R-11'], link: '#/hr/termination/' + c.id }); }
          else if (ap.status === 'rejected' || ap.status === 'changes_requested') { st.update('exitCases', (l) => { const cc = l.find((x) => x.id === c.id); cc.blocks = cc.blocks.filter((x) => x.rule !== b.rule); }); log(c.id, 'رُفض طلب التنازل عن حاجز «' + b.rule + '»', null); }
        });
      });
      (st.get('settlements') || []).slice().forEach((s) => {
        if (s.status !== 'in_review' || !s.approvalId) return; const ap = by(s.approvalId); if (!ap) return;
        if (ap.status === 'approved') {
          const decs = (ap.chain || []).filter((x) => x.status === 'approved').map((x) => x.decidedBy).filter(Boolean);
          st.patch('settlements', s.id, { status: 'approved', approvedBy: decs, approvedAt: new Date().toISOString() });
          const dup = (st.get('audit') || []).some((a) => a.code === 'HR.SETTLEMENT.APPROVED' && a.target && a.target.id === s.id && new Date(a.ts) > new Date(ap.createdAt || 0));
          if (!dup) SA.audit('HR.SETTLEMENT.APPROVED', { actor: actorOf(decs[decs.length - 1]), target: { type: 'settlement', id: s.id, label: 'مخالصة ' + empName(s.employeeId) }, after: { status: 'approved' } });
          SA.notify({ title: 'مخالصة جاهزة للصرف: ' + s.id, body: empName(s.employeeId) + ' — اعتُمدت وتنتظر الصرف بسند صرف من المالية.', level: 'action', to: ['R-07'], link: '#/hr/settlement/' + s.id });
        } else if (ap.status === 'rejected' || ap.status === 'changes_requested') {
          st.patch('settlements', s.id, { status: 'calculated', approvalId: null, returnedNote: 'أُعيدت من الاعتماد (' + ap.id + ') — أعد الحساب' });
          SA.audit('HR.SETTLEMENT.REJECTED', { actor: actorOf(deciderOf(ap)), target: { type: 'settlement', id: s.id, label: 'مخالصة ' + empName(s.employeeId) }, after: { status: 'calculated' } });
          SA.notify({ title: 'المخالصة ' + s.id + ' أُعيدت', body: 'لم تُعتمد — راجع الملاحظات وأعد الحساب.', level: 'action', to: ['R-11', 'R-12'], link: '#/hr/settlement/' + s.id });
        }
      });
      ((st.get('alumniFlags') || []).concat(st.get('alumniArchive') || [])).slice().forEach((a) => {
        const b = a.blacklist; if (!b || b.status !== 'proposed' || !b.approvalId) return; const ap = by(b.approvalId); if (!ap) return;
        const key = a.employeeId ? 'alumniFlags' : 'alumniArchive'; const match = (x) => (a.employeeId ? x.employeeId === a.employeeId : x.id === a.id);
        if (ap.status === 'approved') { const dec = deciderOf(ap); st.update(key, (l) => { const x = l.find(match); x.blacklist.status = 'approved'; x.blacklist.approvedBy = dec; }); SA.audit('HR.BLACKLIST.APPROVED', { actor: actorOf(dec), target: { type: 'alumni', id: a.employeeId || a.id, label: a.name || empName(a.employeeId) }, after: { status: 'approved' } }); }
        else if (ap.status === 'rejected' || ap.status === 'changes_requested') st.update(key, (l) => { const x = l.find(match); x.blacklist = { status: 'none' }; });
      });
    } finally { reconciling = false; }
  }
  let wired = false;
  function wireReconcile() { if (wired) return; wired = true; st.subscribe('approvals', () => reconcile()); }

  /* ───────────────────────── public API ───────────────────────── */
  SA.hrExit = {
    employeeState(empId) { ensureInit(); const e = emp(empId); if (!e) return null; const c = (st.get('exitCases') || []).find((x) => x.employeeId === empId && ['notice', 'closing', 'closed'].indexOf(x.status) >= 0); return { status: e.status === 'terminated' ? 'terminated' : e.status === 'notice' ? 'notice' : 'active', lastWorkingDay: c ? c.lastWorkingDay : e.endDate || null, payUntil: c ? c.lastWorkingDay : e.endDate || null, caseId: c ? c.id : null, payrollBlocked: e.status === 'terminated' }; },
    openCase(empId) { ensureInit(); return openCaseOf(empId); },
    clearanceBlockers(empId) { ensureInit(); return { custody: custodyOf(empId).filter((x) => x.open).map((x) => ({ label: x.label, ref: x.id })), loans: loansOf(empId) }; },
    nextNumber
  };

  /* ───────────────────────── custody discovery (HR-08 collection name is owned by another agent) ───────────────────────── */
  function custodyOf(empId) {
    const keys = ['custody', 'custodyItems', 'custodyIssues', 'custodyAssignments', 'custodyRecords']; const out = [];
    keys.forEach((k) => { const arr = st.get(k); if (Array.isArray(arr)) arr.forEach((x) => { if (x && x.employeeId === empId) { const stt = String(x.status || ''); out.push({ id: x.id, label: x.item || x.itemName || x.name || x.title || x.label || x.description || x.id, open: !/return|closed|cleared|written|مسلّم|مُسلّم|مغلق/i.test(stt), status: stt, qty: x.qty || x.quantity || null }); } }); });
    return out;
  }

  /* ───────────────────────── shared UI helpers ───────────────────────── */
  function liveDrawer(o) {
    let tab = o.tab || (o.tabs && o.tabs[0].id); let d = null; const offs = [];
    const tabsEl = o.tabs ? SA.tabs({ tabs: o.tabs, active: tab, onChange: (id) => { tab = id; paint(true); } }) : null;
    function paint(keepTop) {
      if (!d) return; if (o.gone && o.gone()) { d.close(); return; }
      const top = keepTop ? 0 : d.body.scrollTop; d.setTitle(o.title(), o.subtitle ? o.subtitle() : ''); SA.clear(d.body); d.body.append(o.body(tab)); if (d.foot) { SA.clear(d.foot); d.foot.append(o.foot ? o.foot(tab) : null); } d.body.scrollTop = top;
    }
    d = SA.drawer({ title: o.title(), subtitle: o.subtitle ? o.subtitle() : '', tabs: tabsEl ? tabsEl.el : null, body: h('div'), foot: [h('span')], size: o.size || 'lg', onClose: (r) => { offs.forEach((f) => f()); if (o.onClose) o.onClose(r); } });
    (o.paths || []).forEach((p) => offs.push(st.subscribe(p, () => paint(false)))); paint(true); d.setTab = (id) => { tab = id; if (tabsEl) tabsEl.setActive(id); paint(true); }; return d;
  }
  function modalForm(o) { // o: {title, subtitle, icon, size, fields:[SA.form.field], intro:Node, extra:Node, submitLabel, danger, onSubmit(values)→Promise<bool|void>}
    const grp = SA.form.group(o.fields.filter(Boolean)); let m;
    const submit = h('button.btn.' + (o.danger ? 'btn-accent' : 'btn-primary'), { type: 'button', onclick: async () => {
      if (!grp.validate()) return; if (o.validate) { const err = o.validate(grp.get()); if (err) { SA.toast(err, 'error'); return; } }
      m.setBusy(true); let ok = true; try { ok = await o.onSubmit(grp.get()); } catch (e) { SA.fail(e); ok = false; } m.setBusy(false); if (ok !== false) m.close(true);
    } }, o.submitLabel || 'حفظ');
    m = SA.modal({ title: o.title, subtitle: o.subtitle, icon: o.icon || 'edit', size: o.size || 'md', danger: o.danger, body: h('div.sap-confirm', {}, o.intro || null, o.fields.filter(Boolean).map((f) => f.el), o.extra || null, h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), o.note || 'هيتسجّل في سجل التدقيق باسمك مع الوقت.')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(false) }, 'إلغاء'), submit] });
    return m;
  }
  const empOpt = (list) => [['', 'اختر موظفًا…']].concat(list.map((e) => [e.id, e.name + ' — ' + e.empNo + ' — ' + dept(e.departmentId)]));
  const pageDeny = (root, perm) => { const d = SA.guard(perm); if (d) { root.append(d); return true; } return false; };
  const simulateState = (root, build) => { // loading → ready (honours SA.sim.error)
    const host = h('div'); root.append(host); host.append(SA.skeleton({ kind: 'table', rows: 6 }));
    let dead = false, cleanup = null;
    const go = () => { SA.clear(host); host.append(SA.skeleton({ kind: 'table', rows: 6 })); SA.delay(260, { write: false }).then(() => { if (dead) return; SA.clear(host); cleanup = build(host); }, (e) => { if (dead) return; SA.clear(host); host.append(SA.errorState({ text: SA.errorText(e), onRetry: go })); }); };
    go(); return () => { dead = true; if (typeof cleanup === 'function') cleanup(); };
  };
  const specLink = (anchor, label) => h('a.sap-linkbtn', { href: '../../hr-exit.html#' + anchor, target: '_blank', rel: 'noopener' }, (label || 'المواصفة الكاملة') + ' ↗');
  const confirmDo = async (o, fn) => { const r = await SA.confirm(o); if (!r.ok) return false; if (o.stepUp && !(await SA.stepUp(o.stepUp, { force: true }))) return false; try { await SA.api(() => fn(r)); return true; } catch (e) { SA.fail(e); return false; } };

  const reg = (def) => { const old = SA.moduleById(def.id); if (old) { def.order = old.order; def.group = old.group; def.icon = def.icon || old.icon; } return SA.register(def); };

  /* ═════════════════════════ HR-23 الاستقالات والإنهاء ═════════════════════════ */
  const caseRows = () => (st.get('exitCases') || []).filter((c) => !c.voided).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const lockOf = (c, perm) => gate(perm || 'hr.termination.create') || (isConflict(c.employeeId) ? 'تضارب مصالح: لا تعالج حالتك أو حالة قريبك (BR-TRM-12)' : '');
  const alertsOf = (c) => {
    const a = []; if (OPEN_STATES.indexOf(c.status) < 0) return a;
    if (c.status === 'submitted' && c.replyDueOn) { const d = diffDays(today(), c.replyDueOn); a.push(d < 0 ? ['مهلة الرد انتهت — قبول ضمني', 'danger'] : d <= 2 ? ['مهلة الرد بعد ' + d + ' يوم', 'warning'] : ['مهلة الرد بعد ' + d + ' يوم', 'neutral']); }
    if (c.status === 'notice' && c.lastWorkingDay) { const d = diffDays(today(), c.lastWorkingDay); if (d <= 7) a.push([d < 0 ? 'تجاوز آخر يوم عمل' : 'آخر يوم عمل بعد ' + d + ' يوم', d < 0 ? 'danger' : 'warning']); }
    const bl = computeBlocks(c).filter((b) => b.state === 'triggered' && (b.rule === 'sick_leave')); if (bl.length) a.push(['حاجز: إجازة مرضية', 'danger']);
    return a;
  };

  function renderTermination(root, ctx) {
    ensureInit(); css();
    if (pageDeny(root, 'hr.termination.view')) return;
    const openId = ctx.path[0] && ctx.path[0] !== 'new' ? ctx.path[0] : null;
    ctx.setCrumbs([{ label: 'الإنهاء' }, { label: 'الاستقالات والإنهاء', href: openId ? '#/hr/termination' : null }].concat(openId ? [{ label: openId }] : []));
    let tab = ctx.params.tab || 'cases'; const head = h('div'); const host = h('div'); root.append(head, host); let drawer = null; let leaving = false;
    const tabsC = SA.tabs({ tabs: [{ id: 'cases', label: 'الحالات', icon: 'list' }, { id: 'blocks', label: 'الحواجز والمتابعة', icon: 'shield' }, { id: 'settings', label: 'الإعدادات والمُهل', icon: 'settings' }], active: tab, onChange: (t) => { tab = t; paintBody(); } });
    function paintHead() {
      SA.clear(head); const open = caseRows().filter((c) => OPEN_STATES.indexOf(c.status) >= 0);
      head.append(SA.pageHead({ title: 'الاستقالات والإنهاء', desc: 'مسار خروج واحد لكل أنواع إنهاء الخدمة: خطاب مكتوب بلا استقالة موقّعة مسبقًا، تصديق ومُهل قانونية، فترة إخطار، حواجز آلية، ثم إخلاء ومخالصة.', tags: [SA.tag('pending', 'Law · Pending'), SA.tag('new')], actions: [specLink('hr-23'), SA.btn({ label: 'بدء حالة إنهاء', icon: 'plus', kind: 'accent', perm: 'hr.termination.create', onClick: () => wizard() })] }),
        h('div.sap-x-kpis', {}, SA.kpi('حالات مفتوحة', open.length, { sub: 'من أصل ' + caseRows().length }), SA.kpi('بانتظار التصديق/الرد', open.filter((c) => c.status === 'submitted').length, { sub: 'مهلة الرد ' + (settings().replyWindowDays || '—') + ' أيام [Law]' }), SA.kpi('في فترة الإخطار', open.filter((c) => c.status === 'notice').length), SA.kpi('حواجز مفعّلة', open.filter((c) => computeBlocks(c).some((b) => b.state === 'triggered' && !b.waivable)).length, { accent: true, sub: 'إجازة مرضية · تصديق · حكم' })), tabsC.el);
    }
    function paintBody() { SA.clear(host); tabsC.setActive(tab); host.append(tab === 'cases' ? casesTab() : tab === 'blocks' ? blocksTab() : settingsTab()); }
    function casesTab() {
      const tbl = SA.table({ rowId: 'id', pageSize: 8, caption: 'حالات الإنهاء', rows: caseRows, search: { placeholder: 'ابحث باسم الموظف أو رقم الحالة…', keys: [(c) => empName(c.employeeId), 'id', (c) => (emp(c.employeeId) || {}).empNo] },
        filters: [{ key: 'status', label: 'المرحلة', options: Object.keys(STATUS).map((k) => [k, STATUS[k][0]]) }, { key: 'type', label: 'النوع', options: Object.keys(TYPES).map((k) => [k, TYPES[k][0]]) }],
        initial: { filters: { status: ctx.params.status || '' } },
        columns: [{ key: 'id', label: 'الحالة', sort: true, render: (c) => h('div', {}, h('b.num', {}, c.id), h('span.sap-x-sub', {}, 'أُنشئت ' + SA.fmt.rel(c.createdAt))) },
          { key: 'employeeId', label: 'الموظف', sort: true, value: (c) => empName(c.employeeId), render: (c) => h('div', {}, h('b', {}, empName(c.employeeId)), h('span.sap-x-sub', {}, ((emp(c.employeeId) || {}).empNo || '') + ' · ' + dept((emp(c.employeeId) || {}).departmentId))) },
          { key: 'type', label: 'النوع', sort: true, value: (c) => TYPES[c.type][0], render: (c) => chip(TYPES[c.type][0].replace(/ \(.*/, ''), TYPES[c.type][2]) },
          { key: 'status', label: 'المرحلة', sort: true, render: (c) => statusChip(STATUS, c.status) },
          { key: 'lastWorkingDay', label: 'آخر يوم عمل', sort: true, render: (c) => c.lastWorkingDay ? h('div', {}, dnum(c.lastWorkingDay), h('span.sap-x-sub', {}, OPEN_STATES.indexOf(c.status) >= 0 ? dayCount(c.lastWorkingDay) : '')) : h('span.sap-dash', {}, c.noticeMonths == null && c.status !== 'draft' ? 'يُحدَّد عند بدء الإخطار' : '—') },
          { key: 'alerts', label: 'تنبيهات', render: (c) => h('div.sap-x-stat', {}, alertsOf(c).map((a) => chip(a[0], a[1]))) }],
        rowActions: (c) => [{ label: 'فتح الملف', icon: 'external', onClick: () => SA.nav('hr/termination/' + c.id) }, { label: 'إخلاء الطرف', icon: 'check', hidden: !c.clearanceId, onClick: () => SA.nav('hr/clearance/' + c.clearanceId) }, { label: 'المخالصة', icon: 'receipt', hidden: !c.settlementId, onClick: () => SA.nav('hr/settlement/' + c.settlementId) }],
        onRowClick: (c) => SA.nav('hr/termination/' + c.id),
        empty: { icon: 'logout', title: 'لا توجد حالات إنهاء', text: 'ابدأ حالة جديدة من الزر أعلاه — لن تحتاج لحفظ مواعيد قانونية في الذاكرة.', action: { label: 'بدء حالة إنهاء', perm: 'hr.termination.create', onClick: () => wizard() } } });
      return h('div.card.card-flush.sap-listcard', {}, tbl.el);
    }
    function blocksTab() {
      const open = caseRows().filter((c) => OPEN_STATES.indexOf(c.status) >= 0); const ab = settings().abandonment || {};
      const rows = []; open.forEach((c) => computeBlocks(c).filter((b) => b.state !== 'ok').forEach((b) => rows.push({ c, b })));
      return h('div', {}, SA.card({ title: 'حواجز الإنهاء — قواعد على الخادم وليست أزرارًا', tags: [SA.tag('pending', 'Law')] },
        h('ul.sap-x-steps', {}, [['لا إنهاء من صاحب العمل أثناء إجازة مرضية مثبتة أو وضع — بلا زر تجاوز (م.54-55 · BR-TRM-09)', 'bad'], ['الاستقالة كتابية ومصدّقة: لا إغلاق بدون حالة تصديق مسجّلة (م.167 · BR-TRM-02)', ''], ['لا «منتهي» قبل قفل إخلاء الطرف وصرف المخالصة إلا بتنازل المدير العام بسبب مكتوب وStep-up (BR-TRM-11)', 'warn'], ['لا زر «فصل»: إنهاء صاحب العمل يمر بمسار م.148 — تحقيق ثم فحص قانوني ثم المدير العام ثم مهمة دعوى (BR-TRM-10)', '']].map((r, i) => h('li', { class: r[1] ? 'is-' + r[1] : '' }, h('span.sap-x-dot', {}, i + 1), h('span', {}, r[0]), h('span', {}, SA.icon('lock', 'icon-sm')))))),
        SA.card({ title: 'الحواجز المفعّلة الآن على الحالات المفتوحة', flush: true }, rows.length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الحالة', 'الموظف', 'الحاجز', 'التفاصيل', 'الوضع'].map((x) => h('th', {}, x)))), h('tbody', {}, rows.map((r) => h('tr', { onclick: () => SA.nav('hr/termination/' + r.c.id), style: { cursor: 'pointer' } }, h('td', {}, h('b.num', {}, r.c.id)), h('td', {}, empName(r.c.employeeId)), h('td', {}, r.b.label, h('span.sap-x-sub', {}, r.b.law)), h('td', {}, r.b.detail), h('td', {}, r.b.state === 'waived' ? chip('مُتنازَل عنه', 'success') : r.b.state === 'waiver_requested' ? chip('تنازل بانتظار GM', 'warning') : chip(r.b.waivable ? 'محظور — قابل للتنازل' : 'محظور', 'danger'))))))) : SA.empty({ icon: 'checkcircle', title: 'لا حواجز مفعّلة', text: 'كل الحالات المفتوحة قادرة على التقدم.' })),
        SA.card({ title: 'متابعة الغياب المعتبر استقالة (م.166)', tags: [SA.tag('pending'), SA.tag('open', 'الإعداد مغلق افتراضيًا')] }, ab.enabled ? abandonTable() : h('div', {}, SA.alert('info', 'الإعداد مغلق حتى يعتمده HR Manager — لا تحويل تلقائي أبدًا. الحدود {' + ab.warnConsecutive + '/' + ab.warnIntermittent + '} إنذار و{' + ab.consecutive + ' متصلة / ' + ab.intermittent + ' متقطعة} فتح حالة للمراجعة — كلها Pending.'), SA.btn({ label: 'تفعيل المتابعة (يتطلب اعتماد HR)', icon: 'play', kind: 'ghost', perm: 'hr.termination.approve', onClick: toggleAbandon })), specLink('trm-10', 'تصميم SCR-TRM-10')));
    }
    function abandonTable() {
      const att = st.get('attendance') || []; const by = {}; att.forEach((a) => { (by[a.employeeId] = by[a.employeeId] || []).push(a); });
      const rows = Object.keys(by).map((id) => { const l = by[id].slice().sort((a, b) => b.date.localeCompare(a.date)); let run = 0; for (const x of l) { if (x.status === 'absent') run++; else break; } return { id, run, total: l.filter((x) => x.status === 'absent').length }; }).filter((r) => r.total > 0);
      return h('div', {}, h('p.t-muted', {}, 'عيّنة الحضور (5 أيام) — الأعداد للتوضيح؛ حدود الفتح تُقارن بسجل 12 شهرًا في الإنتاج.'), rows.length ? h('ul.sap-x-steps', {}, rows.map((r) => h('li', {}, h('span.sap-x-dot', {}, r.total), h('span', {}, h('b', {}, empName(r.id)), h('span.sap-x-sub', {}, 'متصلة ' + r.run + ' · إجمالي ' + r.total + ' — الإنذار الكتابي يُسجَّل يدويًا')), SA.btn({ label: 'فتح حالة مراجعة', kind: 'ghost', size: 'sm', perm: 'hr.termination.create', onClick: () => wizard(r.id, 'ABD') })))) : SA.empty({ icon: 'checkcircle', title: 'لا غياب متصل في العيّنة' }));
    }
    async function toggleAbandon() {
      const ok = await confirmDo({ title: 'تفعيل متابعة الغياب المعتبر استقالة', text: 'المتابعة تقترح فقط — القرار لـHR Manager ولا تحويل تلقائي لحالة إنهاء.', warnings: ['القيم الحالية Pending [Law] وتحتاج مراجعة قانونية قبل الاعتماد.'], reasonRequired: true, stepUp: 'policy.change', confirmLabel: 'تفعيل' }, (r) => { st.update('settings.hrExit', (s) => { s.abandonment.enabled = true; }); SA.audit('HR.EXIT.SETTINGS_CHANGED', { target: { type: 'setting', id: 'abandonment', label: 'متابعة الغياب المعتبر استقالة' }, before: { enabled: false }, after: { enabled: true }, reason: r.reason }); });
      if (ok) SA.toast('تم تفعيل المتابعة', 'success'); paintBody();
    }
    function settingsTab() {
      const s = settings(); const canEdit = SA.can('hr.termination.approve');
      const rowsDef = [['replyWindowDays', 'مهلة رد صاحب العمل / قبول ضمني', 'أيام', 'م.167 [Law]', 'Pending', 10], ['withdrawWindowDays', 'مهلة العدول بعد إبلاغ القبول', 'أيام', 'م.167 [Law]', 'Pending', 10], ['noticeMonths', 'مدة الإخطار الافتراضية', 'أشهر', 'م.156/157 — المراجعة القانونية تقترح 3 لغير محدد المدة', 'Open', null], ['letterToleranceDays', 'تسامح تاريخ الخطاب (ضد الاستقالة المسبقة)', 'أيام', 'م.167 · BR-TRM-01', 'Open', null], ['gmGrade', 'درجة الموظف التي تستلزم اعتماد GM', 'درجة', 'D7 — حدود الاعتماد', 'Open', null], ['jobSearchHours', 'وقت بحث الموظف عن عمل خلال الإخطار', 'ساعات/أسبوع', 'م.159 [Law]', 'Open', null], ['probationMaxMonths', 'حد التجربة (مرة واحدة)', 'أشهر', 'م.? [Law]', 'Pending', 3], ['retirementAge', 'سن التقاعد (حد أدنى)', 'سنة', 'م.171 [Law]', 'Pending', 60]];
      return h('div', {}, SA.alert('info', 'كل قيمة قانونية إعداد بمصدر وحالة — ما لم يُقرَّر يظهر «غير مُعدّ». الحواجز الإلزامية (إجازة مرضية · تصديق · قفل الإخلاء) لا تُعطَّل من هنا.'),
        SA.card({ title: 'الساعات القانونية وحدود الاعتماد', flush: true, tags: [SA.tag('pending')] }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الإعداد', 'القيمة', 'المصدر', 'الحالة', ''].map((x) => h('th', {}, x)))), h('tbody', {}, rowsDef.map((r) => { const v = s[r[0]]; return h('tr', {}, h('td', {}, h('b', {}, r[1]), h('span.sap-x-sub', {}, r[2])), h('td', {}, v == null ? SA.openValue() : h('span', {}, num(v), ' ', r[2])), h('td', {}, r[3]), h('td', {}, chip(v == null ? 'Open' : r[4], v == null ? 'warning' : 'info')), h('td', {}, SA.btn({ label: 'تعديل', kind: 'ghost', size: 'sm', reason: canEdit ? '' : 'يتطلب hr.termination.approve', onClick: () => editSetting(r) }))); }))))),
        SA.card({ title: 'سلسلة الاعتماد' }, SA.kv([['قبول الاستقالة', 'HR Manager (المنشئ لا يعتمد حالته)'], ['خطوة المدير العام', h('span', {}, s.gmStepEnabled ? 'مفعّلة' : 'غير مفعّلة', ' ', SA.tag('open', 'الدرجة {Open}'))], ['التنازل عن حاجز', 'المدير العام فقط + سبب + Step-up + لا تنازل ذاتي']])));
    }
    async function editSetting(r) {
      const f = SA.form.field({ name: 'v', label: r[1] + ' (' + r[2] + ')', type: 'number', value: settings()[r[0]] == null ? '' : settings()[r[0]], hint: 'اتركه فارغًا ليعود «غير مُعدّ (Open)».' });
      const reason = SA.form.field({ name: 'reason', label: 'سبب التعديل', type: 'textarea', required: true, rules: [SA.form.rules.min(5)] });
      modalForm({ title: 'تعديل: ' + r[1], icon: 'settings', size: 'sm', fields: [f, reason], submitLabel: 'حفظ بعد التحقق', onSubmit: async (v) => {
        if (!(await SA.stepUp('policy.change', { force: true }))) return false; const nv = v.v === '' || v.v == null ? null : +v.v; if (nv != null && (nv < 0 || !isFinite(nv))) { SA.toast('قيمة غير صحيحة', 'error'); return false; }
        await SA.api(() => { st.update('settings.hrExit', (s) => { s[r[0]] = nv; }); SA.audit('HR.EXIT.SETTINGS_CHANGED', { target: { type: 'setting', id: r[0], label: r[1] }, before: { value: r[5] === undefined ? null : settings()[r[0]] }, after: { value: nv }, reason: v.reason }); }); SA.toast('تم حفظ الإعداد', 'success'); paintBody(); } });
    }
    paintHead(); paintBody();
    const unsubs = [st.subscribe('exitCases', () => { paintHead(); if (!leaving) paintBody(); }), st.subscribe('settings.hrExit', () => { paintHead(); })];
    if (openId) { const c = caseOf(openId); if (!c) { root.prepend(SA.alert('warning', 'الحالة ' + openId + ' غير موجودة.')); } else drawer = openCase(openId, ctx.params.tab, () => { if (!leaving && SA.route && SA.route.module && SA.route.module.id === 'hr-termination') { leaving = true; SA.nav('hr/termination', { replace: true }); } }); }
    return () => { leaving = true; unsubs.forEach((f) => f()); if (drawer) drawer.close(null); };
  }

  /* ── case drawer ── */
  function openCase(id, tab0, onClose) {
    const c0 = () => caseOf(id);
    return liveDrawer({ size: 'lg', tab: tab0 || 'summary', paths: ['exitCases', 'clearances', 'settlements', 'employees', 'leaveRequests', 'approvals'], gone: () => !c0(),
      tabs: [{ id: 'summary', label: 'الملخص' }, { id: 'notice', label: 'الإخطار والمُهل' }, { id: 'approvals', label: 'الاعتمادات والمهام' }, { id: 'blocks', label: 'الحواجز' }, { id: 'log', label: 'السجل' }],
      title: () => { const c = c0(); return c ? empName(c.employeeId) + ' — ' + TYPES[c.type][0].replace(/ \(.*/, '') : id; }, subtitle: () => { const c = c0(); return c ? c.id + ' · ' + STATUS[c.status][0] : ''; }, onClose,
      body: (t) => { const c = c0(); return t === 'summary' ? caseSummary(c) : t === 'notice' ? caseNotice(c) : t === 'approvals' ? caseApprovals(c) : t === 'blocks' ? caseBlocks(c) : caseLog(c); }, foot: () => caseFoot(c0()) });
  }
  function nextStep(c) {
    const lk = lockOf(c); const btn = (label, fn, o) => SA.btn(Object.assign({ label, kind: 'primary', reason: lk, onClick: fn }, o || {}));
    const box = (title, text, act, kind) => h('div.sap-x-note', { style: kind === 'ok' ? { borderColor: 'var(--color-success)', background: 'var(--color-success-tint)' } : null }, h('b', {}, title), h('p', { style: { margin: '4px 0 8px' } }, text), act);
    if (c.status === 'draft') return c.type === 'RSG' ? box('الخطوة التالية: تسجيل خطاب الاستقالة', 'الاستقالة تُقبل مكتوبة فقط وبإقرار الموظف — لا استقالة موقّعة مسبقًا (م.167).', btn('تسجيل الخطاب', () => letterDialog(c)))
      : c.type === 'EMP' ? box('الخطوة التالية: بدء مسار صاحب العمل', 'لا زر «فصل». المسار: السبب المشروع ← التحقيق ← فحص الحواجز ← الفحص القانوني ← المدير العام ← مهمة رفع دعوى.', btn('بدء المسار (م.148)', () => startEmployerPath(c)))
      : box('الخطوة التالية: تقديم للاعتماد', 'يُرسَل طلب «' + TYPES[c.type][0] + '» إلى صندوق الاعتمادات المشترك — HR Manager يعتمد (المنشئ لا يعتمد حالته).', btn('إرسال للاعتماد', () => requestAcceptance(c)));
    if (c.status === 'submitted') { const late = c.replyDueOn && diffDays(today(), c.replyDueOn) < 0; return box(late ? 'انتهت مهلة الرد — تُعتبر الاستقالة مقبولة ضمنيًا' : 'بانتظار التصديق وقرار صاحب العمل', late ? 'سجّل القبول الضمني ثم ابدأ فترة الإخطار.' : 'الموظف يواصل العمل حتى القرار. مهلة الرد تنتهي ' + c.replyDueOn + ' (' + dayCount(c.replyDueOn) + ').', h('div.sap-x-row', {}, btn('قبول الاستقالة (طلب اعتماد)', () => requestAcceptance(c)), late ? btn('تسجيل القبول الضمني', () => implicitAccept(c), { kind: 'ghost' }) : null)); }
    if (c.status === 'pending_approval') return box('بانتظار قرار الاعتماد', 'الطلب ' + c.approvalId + ' في صندوق الاعتمادات المشترك.', h('a.btn.btn-ghost', { href: SA.link.approval(c.approvalId) }, 'فتح الطلب'));
    if (c.status === 'accepted') return box('الخطوة التالية: بدء فترة الإخطار', 'يحسب النظام آخر يوم عمل بالشهور الميلادية ويحوّل الموظف إلى «فترة إخطار» وينشئ نموذج الإخلاء والمخالصة التقديرية.', btn('بدء فترة الإخطار', () => noticeDialog(c)));
    if (c.status === 'notice' || c.status === 'closing') { const bl = blocking(computeBlocks(c)); return bl.length ? box('جاهزية الإغلاق: ' + bl.length + ' حاجز', 'لا يتحول الموظف إلى «منتهي» قبل: ' + bl.map((b) => b.label.split(' — ')[0]).join(' · '), h('div.sap-x-row', {}, btn('إغلاق الحالة', () => closeCase(c)), c.clearanceId ? h('a.btn.btn-ghost', { href: SA.href('hr/clearance/' + c.clearanceId) }, 'إخلاء الطرف') : null)) : box('جاهزة للإغلاق', 'كل الحواجز مُستوفاة أو مُتنازَل عنها بسبب مسجّل.', btn('إغلاق الحالة وتحويل الموظف إلى «منتهي»', () => closeCase(c)), 'ok'); }
    if (c.status === 'employer_path') return box('مسار صاحب العمل جارٍ', 'أكمل الخطوات بالترتيب. الحالة لا تتحول إلى «منتهي» إلا بحكم أو تسوية مسجّلة.', null);
    if (c.status === 'closed') return box('الحالة مغلقة', 'الموظف الآن «منتهي» — سجل الخريج متاح في الأرشيف.', h('a.btn.btn-ghost', { href: SA.href('hr/archive') }, 'فتح الأرشيف'), 'ok');
    return box(STATUS[c.status][0], 'لا إجراءات متاحة.', null);
  }
  function caseSummary(c) {
    const e = emp(c.employeeId) || {}; const t4 = canT4();
    return h('div.sap-x-grid', {}, isConflict(c.employeeId) ? SA.alert('danger', 'تضارب مصالح: هذه حالتك أو حالة أحد أقاربك — الإجراءات معطّلة (BR-TRM-12).') : null, nextStep(c), h('div', { style: { height: '12px' } }),
      SA.card({ title: 'بيانات الحالة' }, SA.kv([['الموظف', h('span', {}, empName(c.employeeId), ' ', statusChip(EMP_STATUS, e.status || 'active'))], ['القسم / الرقم الوظيفي', dept(e.departmentId) + ' · ' + (e.empNo || '')], ['تاريخ التعيين', dnum(e.hireDate)], ['النوع', TYPES[c.type][0] + ' — المبادر: ' + TYPES[c.type][1]], ['المرحلة', statusChip(STATUS, c.status)],
        ['سبب الإنهاء', t4 ? (reasonLabel(c.reasonCode) + (c.reasonText ? ' — ' + c.reasonText : '')) : lockedCell('T4 — يتطلب hr.discipline.view')],
        c.type === 'RSG' ? ['خطاب الاستقالة', c.letterDate ? h('span', {}, dnum(c.letterDate), ' · إقرار الموظف: ' + (c.attested ? (c.attested.method === 'OTP' ? 'OTP' : 'حضوري') : '—')) : 'لم يُسجَّل بعد'] : null,
        c.type === 'RSG' ? ['التصديق', ({ pending: 'لم يُسجَّل (مهمة مفتوحة)', ratified: 'مُصدَّقة — مرجع ' + ((c.ratification || {}).ref || ''), on_hold: 'معلّقة', not_required: 'غير مطلوبة بتقدير قانوني' })[(c.ratification || {}).status]] : null,
        c.replyDueOn ? ['مهلة رد صاحب العمل', h('span', {}, dnum(c.replyDueOn), ' (' + dayCount(c.replyDueOn) + ')')] : null, c.acceptedOn ? ['القبول', h('span', {}, dnum(c.acceptedOn), ' — ' + uname(c.acceptedBy))] : null,
        c.lastWorkingDay ? ['آخر يوم عمل', h('span', {}, dnum(c.lastWorkingDay), ' (' + dayCount(c.lastWorkingDay) + ')')] : ['آخر يوم عمل', h('span.t-muted', {}, 'يُحدَّد عند بدء الإخطار')],
        c.type === 'DTH' && c.extra ? ['شهادة الوفاة / المستفيد', (c.extra.deathCert || '—') + ' · ' + (c.extra.beneficiary || '—')] : null, c.type === 'RET' && c.extra ? ['العمر عند التقاعد', c.extra.age || '—'] : null, c.type === 'END' && c.extra ? ['نهاية العقد', dnum(c.extra.contractEnd)] : null, c.type === 'MUT' && c.extra ? ['مرجع الاتفاق المكتوب', c.extra.agreementRef || '—'] : null])),
      SA.card({ title: 'مستندات وروابط' }, h('div.sap-x-row', {}, c.clearanceId ? h('a.btn.btn-ghost', { href: SA.href('hr/clearance/' + c.clearanceId) }, SA.icon('check', 'icon-sm'), 'إخلاء الطرف ' + c.clearanceId) : null, c.settlementId ? h('a.btn.btn-ghost', { href: SA.href('hr/settlement/' + c.settlementId) }, SA.icon('receipt', 'icon-sm'), 'المخالصة ' + c.settlementId) : null, SA.btn({ label: 'قبول استقالة — مستند RSG', icon: 'doc', kind: 'ghost', perm: 'hr.documents.issue', reason: c.type === 'RSG' && c.acceptedOn ? '' : 'متاح بعد قبول الاستقالة', onClick: () => issueRsg(c) }))));
  }
  function issueRsg(c) { if (!SA.hrDocs || !SA.hrDocs.issue) { SA.toast('وحدة المستندات غير محمّلة', 'warn'); return; } const r = SA.hrDocs.issue({ type: 'resignation_accept', employeeId: c.employeeId, fields: { acceptedOn: c.acceptedOn, lastWorkingDay: c.lastWorkingDay || '', letterDate: c.letterDate }, purpose: 'قبول الاستقالة ' + c.id, refs: { caseId: c.id }, approved: true, approvedBy: c.acceptedBy }); if (r) { log(c.id, 'إصدار مستند قبول الاستقالة ' + r.number, 'HR.DOC.ISSUED'); SA.toast('صدر المستند ' + r.number + ' — ظهر في سجل الإصدار', 'success'); } }
  function caseNotice(c) {
    const cur = settings(); const e = emp(c.employeeId) || {};
    const clocks = [];
    if (c.type === 'RSG') { clocks.push(['مهلة الرد', c.replyDueOn, cur.replyWindowDays]); if (c.withdrawalDeadline) clocks.push(['مهلة العدول', c.withdrawalDeadline, cur.withdrawWindowDays]); }
    if (c.lastWorkingDay) clocks.push(['آخر يوم عمل', c.lastWorkingDay, c.noticeMonths]);
    return h('div', {}, SA.alert('info', 'كل المدد إعدادات {Pending/Open} بتاريخ سريان — لا يُحتسب إلا ما يُسجَّل بإقرار قانوني. المهلة لا تسري أثناء الإجازات وتتوقف أثناء المرضية (BR-TRM-06).'),
      clocks.length ? h('div.sap-x-clock', {}, clocks.map((k) => { const d = k[1] ? diffDays(today(), k[1]) : null; return h('div', { class: d != null && d < 0 ? 'is-late' : '' }, h('small', {}, k[0]), h('b', {}, d == null ? '—' : d < 0 ? 'منذ ' + (-d) : d), h('small', {}, (k[1] || '—') + (d == null ? '' : d < 0 ? ' يوم' : ' يوم متبقٍ'))); })) : SA.empty({ icon: 'clock', title: 'لا مُهل مفتوحة بعد', text: 'تبدأ المُهل بعد تسجيل خطاب الاستقالة أو بدء فترة الإخطار.' }),
      c.noticeStart ? SA.card({ title: 'فترة الإخطار' }, SA.kv([['بداية الإخطار', dnum(c.noticeStart)], ['المدة', c.noticeMonths + ' شهر (ميلادي)'], ['أيام التوقف (إجازات/مرضي)', c.pausedDays || 0], ['آخر يوم عمل', dnum(c.lastWorkingDay)], ['بدل الإخطار بدلاً من الخدمة (م.164)', c.noticePaidInLieu ? 'نعم — يدخل المخالصة (A4)' : 'لا'], ['الأجر حتى آخر يوم', 'محسوب في المخالصة (الأجر يستمر حتى ' + c.lastWorkingDay + ')'], ['حالة الموظف في الدليل', statusChip(EMP_STATUS, e.status || 'active')]])) : null,
      legalNote('المدة والطريقة {Open}: ' + (cur.noticeMonths == null ? 'الإعداد الافتراضي غير مُعدّ — تُدخل المدة المتفق عليها بالعقد لكل حالة ويراجعها قانوني.' : 'الافتراضي ' + cur.noticeMonths + ' شهر.') + ' التأثير على المرتبات: الأجر يُحسب حتى آخر يوم عمل فقط ولا يدخل «منتهي» كشف المرتبات.'));
  }
  function caseApprovals(c) {
    const ap = c.approvalId ? (st.get('approvals') || []).find((a) => a.id === c.approvalId) : null;
    return h('div', {}, SA.card({ title: 'اعتماد القبول' }, ap ? h('div', {}, SA.stepper(ap.chain.map((s) => s.label), Math.max(0, ap.chain.findIndex((s) => s.status === 'pending'))), SA.kv([['الطلب', h('a', { href: SA.link.approval(ap.id) }, ap.id)], ['الحالة', SA.statusChip('approval', ap.status)], ['الطالب', uname(ap.requesterId)]])) : h('p.t-muted', {}, 'لم يُرسل للاعتماد بعد. HR Manager لكل الاستقالات؛ خطوة GM بحسب الدرجة {Open}.')),
      SA.card({ title: 'المهام' }, (c.tasks || []).length ? h('ul.sap-x-steps', {}, c.tasks.map((t) => h('li', { class: t.status === 'done' ? 'is-done' : '' }, h('span.sap-x-dot', {}, t.status === 'done' ? '✓' : '·'), h('span', {}, h('b', {}, t.title), h('span.sap-x-sub', {}, 'الاستحقاق ' + (t.dueOn || '—') + (t.status === 'done' ? ' · أُنجزت' : ' · مفتوحة')))))) : h('p.t-muted', {}, 'لا مهام.'), c.type === 'RSG' && c.status !== 'draft' && ((c.ratification || {}).status === 'pending' || (c.ratification || {}).status === 'on_hold') ? SA.btn({ label: 'تسجيل نتيجة التصديق', icon: 'check', kind: 'ghost', reason: lockOf(c), onClick: () => ratifyDialog(c) }) : null),
      c.type === 'EMP' ? employerPathCard(c) : null, c.type === 'ABD' || c.type === 'ILL' ? legalNote('هذا النوع يمر بمراجعة قانونية قبل الاعتماد (م.166 / م.173) — إعدادات Pending.') : null);
  }
  function caseBlocks(c) {
    const bl = computeBlocks(c); const gm = isGM();
    return h('div', {}, SA.alert('info', 'الحواجز تُقيَّم على الخادم عند كل انتقال. الحاجز الأحمر الأخير (الإخلاء والمخالصة) يتجاوزه المدير العام فقط بسبب مكتوب وStep-up، ولا يتنازل عن حالته بنفسه.'),
      h('ul.sap-x-steps', {}, bl.map((b) => h('li', { class: b.state === 'ok' ? 'is-done' : b.state === 'waived' ? 'is-warn' : 'is-bad' }, h('span.sap-x-dot', {}, b.state === 'ok' ? '✓' : b.state === 'waived' ? '!' : '×'), h('span', {}, h('b', {}, b.label), h('span.sap-x-sub', {}, b.law + ' — ' + b.detail), b.stored && b.stored.reason ? h('span.sap-x-sub', {}, 'سبب التنازل: ' + b.stored.reason + (b.stored.waivedBy ? ' — ' + uname(b.stored.waivedBy) : '')) : null),
        b.state === 'triggered' && b.waivable ? SA.btn({ label: gm ? 'تنازل (GM)' : 'طلب تنازل من GM', kind: 'ghost', size: 'sm', reason: lockOf(c, 'hr.termination.view') || (isConflict(c.employeeId) ? 'تضارب مصالح' : ''), onClick: () => waiverDialog(c, b) }) : chip(b.state === 'ok' ? 'سليم' : b.state === 'waived' ? 'مُتنازَل' : b.state === 'waiver_requested' ? 'بانتظار GM' : 'محظور', b.state === 'ok' ? 'success' : b.state === 'waived' ? 'warning' : 'danger')))));
  }
  const caseLog = (c) => (c.timeline || []).length ? h('ol.sap-x-tl', {}, c.timeline.map((x) => h('li', {}, h('time', {}, SA.fmt.iso(x.ts)), h('div', {}, h('b', {}, uname(x.by)), ' — ', x.text, x.code ? h('span.sap-x-sub', {}, x.code) : null)))) : SA.empty({ icon: 'history', title: 'لا أحداث بعد' });
  function caseFoot(c) {
    if (!c) return [];
    const lk = lockOf(c); const out = [];
    if (c.type === 'RSG' && ['accepted', 'notice'].indexOf(c.status) >= 0 && c.withdrawalDeadline && today() <= c.withdrawalDeadline) out.push(SA.btn({ label: 'سحب الاستقالة (العدول)', icon: 'undo', kind: 'ghost', reason: lk, onClick: () => withdrawDialog(c) }));
    if (['draft', 'submitted', 'accepted', 'pending_approval'].indexOf(c.status) >= 0) out.push(SA.btn({ label: 'إلغاء الحالة', icon: 'xcircle', kind: 'ghost', reason: lk, onClick: () => cancelDialog(c) }));
    if (c.status === 'notice' || c.status === 'accepted' || c.status === 'submitted') out.push(SA.btn({ label: 'جلسة احتفاظ (سرية)', icon: 'users', kind: 'ghost', reason: lk || (canT4() ? '' : 'T4 — يتطلب hr.discipline.view'), onClick: () => retentionDialog(c) }));
    return out;
  }

  /* ── wizard (SCR-TRM-03) ── */
  const mustCheck = (msg) => (v) => (v ? null : msg || 'هذا الإقرار مطلوب');
  function wizard(preEmp, preType) {
    if (!SA.can('hr.termination.create')) { SA.toast(gate('hr.termination.create'), 'warn'); return; }
    const S = { step: preType ? 1 : 0, type: preType || 'RSG', empId: preEmp || '', reasonCode: '', reasonText: '', extra: {} };
    const steps = ['اختر النوع', 'بيانات الحالة', 'فحص الحواجز', 'المراجعة']; let m = null; let flds = {};
    const eligible = () => (st.get('employees') || []).filter((e) => e.status !== 'terminated' && !openCaseOf(e.id));
    function s0() {
      const f = SA.form.field({ name: 'type', type: 'radio', label: 'نوع الإنهاء', value: S.type, options: Object.keys(TYPES).map((k) => [k, TYPES[k][0], 'المبادر: ' + TYPES[k][1] + (k === 'EMP' ? ' — لا زر «فصل»' : '')]), onChange: (v) => { S.type = v; } }); flds = { type: f };
      return h('div', {}, f.el, S.type === 'EMP' ? SA.alert('warning', 'الإنهاء من صاحب العمل يمر بمسار المحكمة العمالية (م.148). لا يتحول الموظف إلى «منتهي» إلا بحكم أو تسوية مسجّلة.') : null);
    }
    function s1() {
      const emps = eligible(); const f = {};
      f.emp = SA.form.field({ name: 'emp', type: 'select', label: 'الموظف', required: true, value: S.empId, options: [['', 'اختر موظفًا…']].concat(emps.map((e) => [e.id, e.name + ' — ' + e.empNo + ' — ' + dept(e.departmentId), isConflict(e.id) ? 'disabled' : undefined])), hint: 'لا تظهر حالة جديدة لموظف له حالة مفتوحة. الأقارب وملفك الشخصي معطّلة (تضارب مصالح).', onChange: (v) => { S.empId = v; } });
      f.reason = SA.form.field({ name: 'reason', type: 'select', label: 'السبب الرئيسي (كتالوج موحّد — T4)', required: true, value: S.reasonCode, options: [['', 'اختر…']].concat(REASONS.map((r) => [r[0], r[1]])) , onChange: (v) => { S.reasonCode = v; } });
      f.text = SA.form.field({ name: 'text', type: 'textarea', label: 'ملاحظة السبب (اختياري — T4)', value: S.reasonText, rows: 2, hint: 'ممنوع بناء القرار على سبب محمي (نشاط نقابي، شكوى، حمل، زواج، دين…).', onInput: (v) => { S.reasonText = v; } });
      const x = S.extra;
      if (S.type === 'END') f.contractEnd = SA.form.field({ name: 'contractEnd', type: 'date', label: 'تاريخ نهاية العقد', required: true, value: x.contractEnd || '', onChange: (v) => { x.contractEnd = v; } });
      if (S.type === 'RET') f.age = SA.form.field({ name: 'age', type: 'number', label: 'العمر عند التقاعد', required: true, value: x.age == null ? '' : x.age, hint: 'سن التقاعد لا يقل عن ' + (settings().retirementAge || 60) + ' [Law · Pending]', onInput: (v) => { x.age = v === '' ? null : +v; } });
      if (S.type === 'DTH') { f.cert = SA.form.field({ name: 'cert', label: 'مرجع شهادة الوفاة', required: true, value: x.deathCert || '', onInput: (v) => { x.deathCert = v; } }); f.ben = SA.form.field({ name: 'ben', label: 'المستفيد/المفوّض المسجّل', required: true, value: x.beneficiary || '', hint: 'الصرف لورثة أو مفوّض مسجّل فقط (م.169).', onInput: (v) => { x.beneficiary = v; } }); }
      if (S.type === 'MUT') f.agree = SA.form.field({ name: 'agree', label: 'مرجع الاتفاق المكتوب', required: true, value: x.agreementRef || '', hint: 'لا يُستخدم للتحايل على م.148 — مراجعة قانونية.', onInput: (v) => { x.agreementRef = v; } });
      if (S.type === 'ABD') f.warn = SA.form.field({ name: 'warn', type: 'number', label: 'عدد الإنذارات الكتابية المسجّلة', required: true, value: x.warnings == null ? '' : x.warnings, hint: 'الحد: إنذاران مسجّلان قبل فتح حالة (م.166 — Pending).', onInput: (v) => { x.warnings = v === '' ? null : +v; } });
      if (S.type === 'ILL') f.ill = SA.form.field({ name: 'ill', type: 'checkbox', label: 'استُنفدت الإجازة المرضية والسنوية (م.173)', value: !!x.exhausted, rules: [mustCheck('أكّد استنفاد الإجازات')], onChange: (v) => { x.exhausted = v; } });
      flds = f; return h('div', {}, Object.keys(f).map((k) => f[k].el), S.type === 'RSG' ? SA.alert('info', 'بعد إنشاء الحالة تُسجَّل الاستقالة المكتوبة بإقرار الموظف — لا تبدأ المُهل قبل ذلك.') : null);
    }
    const draftCase = () => ({ employeeId: S.empId, type: S.type, status: 'draft', ratification: { status: 'pending' }, blocks: [], extra: S.extra });
    function s2() {
      const e = emp(S.empId); const bl = computeBlocks(draftCase()).filter((b) => ['sick_leave', 'court', 'ratification'].indexOf(b.rule) >= 0 || b.rule === 'sick_leave'); const hard = bl.filter((b) => b.state === 'triggered' && b.rule === 'sick_leave');
      const warn = []; if (S.type === 'PRB' && e && e.status !== 'probation') warn.push('الموظف ليس في فترة تجربة'); if (S.type === 'PRB' && e && addMonths(e.hireDate, settings().probationMaxMonths || 3) < today()) warn.push('تاريخ التعيين خارج حد التجربة {' + (settings().probationMaxMonths || 3) + ' أشهر} — يحتاج تأكيدًا قانونيًا');
      return h('div', {}, h('p', {}, 'فحص قواعد الخادم قبل إنشاء الحالة لـ', h('b', {}, empName(S.empId)), ':'), h('ul.sap-x-steps', {}, bl.concat([{ rule: 'ok', label: 'تضارب المصالح (HR لا يعالج قريبه أو نفسه)', law: 'BR-TRM-12', state: isConflict(S.empId) ? 'triggered' : 'ok', detail: isConflict(S.empId) ? 'هذا الموظف أنت أو من أقاربك' : 'لا تضارب' }, { rule: 'open', label: 'لا حالة مفتوحة لنفس الموظف', law: 'BR-TRM-17', state: openCaseOf(S.empId) ? 'triggered' : 'ok', detail: 'حالة واحدة مفتوحة لكل موظف' }]).map((b) => h('li', { class: b.state === 'ok' ? 'is-done' : 'is-bad' }, h('span.sap-x-dot', {}, b.state === 'ok' ? '✓' : '×'), h('span', {}, h('b', {}, b.label), h('span.sap-x-sub', {}, b.law + ' — ' + b.detail)), chip(b.state === 'ok' ? 'سليم' : 'محظور', b.state === 'ok' ? 'success' : 'danger')))), warn.map((w) => SA.alert('warning', w)), hard.length ? SA.alert('danger', 'محظور على الخادم: لا يمكن بدء إنهاء من صاحب العمل أثناء إجازة مرضية مثبتة — بلا تجاوز. أعد المحاولة بعد انتهاء الإجازة.') : null);
    }
    const blockedNow = () => computeBlocks(draftCase()).some((b) => b.state === 'triggered' && b.rule === 'sick_leave') || isConflict(S.empId) || !!openCaseOf(S.empId);
    function s3() { const e = emp(S.empId) || {}; return h('div', {}, SA.kv([['النوع', TYPES[S.type][0]], ['الموظف', empName(S.empId) + ' — ' + dept(e.departmentId)], ['السبب', canT4() ? reasonLabel(S.reasonCode) : 'محفوظ (T4)'], ['المبادر', TYPES[S.type][1]]]), h('div.sap-impact', {}, h('b', {}, 'ما سيحدث'), h('ul', {}, [h('li', {}, 'تُنشأ حالة برقم EXT-… ولا تُحذف لاحقًا (الإلغاء بسبب فقط).'), S.type === 'RSG' ? h('li', {}, 'تسجّل الخطاب بإقرار الموظف ← تبدأ مهلة الرد ' + (settings().replyWindowDays || '{Open}') + ' أيام ومهمة التصديق.') : h('li', {}, 'تُرسل للاعتماد في الصندوق المشترك ثم تبدأ فترة الإخطار.'), h('li', {}, 'حالة الموظف «نشط» حتى بدء فترة الإخطار — ولا يدخل كشف المرتبات «منتهي» قبل الإغلاق.')])), legalNote('كل المدد والحدود إعدادات Pending/Open — راجع «الإعدادات والمُهل».')); }
    function paint() {
      SA.clear(m.body); SA.clear(m.foot);
      m.body.append(SA.stepper(steps, S.step), S.step === 0 ? s0() : S.step === 1 ? s1() : S.step === 2 ? s2() : s3());
      m.foot.append(h('button.btn.btn-ghost', { type: 'button', onclick: () => (S.step === 0 ? m.close(false) : (S.step--, paint())) }, S.step === 0 ? 'إلغاء' : 'السابق'), S.step < 3 ? h('button.btn.btn-primary', { type: 'button', disabled: S.step === 2 && blockedNow(), onclick: next }, 'التالي') : h('button.btn.btn-accent', { type: 'button', onclick: create }, 'إنشاء الحالة'));
    }
    function next() {
      if (S.step === 1) { const ok = SA.form.group(Object.keys(flds).map((k) => flds[k])).validate(); if (!ok) return; if (S.type === 'RET' && S.extra.age < (settings().retirementAge || 60)) { flds.age.error('سن التقاعد لا يقل عن ' + (settings().retirementAge || 60) + ' (م.171)'); flds.age.focus(); return; } if (S.type === 'ABD' && S.extra.warnings < 2) { flds.warn.error('يلزم إنذاران مسجّلان على الأقل قبل فتح الحالة'); flds.warn.focus(); return; } if (S.type === 'PRB' && (emp(S.empId) || {}).status !== 'probation') { flds.emp.error('الموظف ليس في فترة تجربة'); return; } if (isConflict(S.empId)) { flds.emp.error('تضارب مصالح'); return; } }
      S.step++; paint();
    }
    async function create() {
      m.setBusy(true);
      try {
        const rec = await SA.api(() => {
          const id = nextNumber('EXT'); const c = { id, employeeId: S.empId, type: S.type, status: 'draft', createdBy: meUser().id, createdAt: new Date().toISOString(), reasonCode: S.reasonCode, reasonText: S.reasonText, letterDate: null, submittedOn: null, attested: null, ratification: { status: S.type === 'RSG' ? 'pending' : 'not_required', ref: '', date: null }, replyDueOn: null, acceptedOn: null, acceptedBy: null, approvalId: null, withdrawalDeadline: null, withdrawnOn: null, noticeStart: null, noticeMonths: null, pausedDays: 0, lastWorkingDay: null, noticePaidInLieu: false, tasks: [], blocks: [], timeline: [{ ts: new Date().toISOString(), by: meUser().id, text: 'إنشاء حالة ' + TYPES[S.type][0], code: 'HR.EXIT.CREATED' }], clearanceId: null, settlementId: null, closedAt: null, extra: S.extra };
          st.insert('exitCases', c, true); SA.audit('HR.EXIT.CREATED', { target: { type: 'exit_case', id, label: empName(S.empId) + ' — ' + TYPES[S.type][0] }, after: { type: S.type, status: 'draft' }, reason: S.type === 'RSG' ? '' : reasonLabel(S.reasonCode) }); return c;
        });
        m.close(true); SA.toast('أُنشئت الحالة ' + rec.id, 'success'); SA.nav('hr/termination/' + rec.id);
      } catch (e) { m.setBusy(false); SA.fail(e); }
    }
    m = SA.modal({ title: 'بدء حالة إنهاء خدمة', subtitle: 'SCR-TRM-03 — معالج من 4 خطوات', icon: 'logout', size: 'lg', body: h('div'), foot: [h('span')] }); paint();
  }

  /* ── letter / ratification / acceptance ── */
  function letterDialog(c) {
    const e = emp(c.employeeId) || {}; const tol = settings().letterToleranceDays;
    const f = { letter: SA.form.field({ name: 'letter', type: 'date', label: 'تاريخ خطاب الاستقالة', required: true, value: c.letterDate || today(), hint: 'يجب أن يكون بتاريخ التقديم — لا خطاب أقدم من المسموح ولا أقدم من تاريخ التعيين (' + (e.hireDate || '') + ').' }),
      sub: SA.form.field({ name: 'sub', type: 'date', label: 'تاريخ تقديم الخطاب فعليًا', required: true, value: c.submittedOn || today() }),
      method: SA.form.field({ name: 'method', type: 'radio', label: 'طريقة إقرار الموظف', value: 'IN_PERSON', options: [['IN_PERSON', 'حضوري — بصمة/توقيع أمام HR'], ['OTP', 'OTP على جوال الموظف (' + e.phone + ')']] }),
      file: SA.form.field({ name: 'file', label: 'مرفق الخطاب (اسم الملف الممسوح)', value: 'resignation-letter.pdf', required: true }),
      att: SA.form.field({ name: 'att', type: 'checkbox', label: 'أقرّ الموظف بأن الخطاب كُتب بإرادته الكاملة في تاريخه وأنه لم يُوقّع مسبقًا أو على بياض (م.89/167)', value: false, rules: [mustCheck('الإقرار إلزامي لتسجيل الاستقالة')] }) };
    const reasonF = SA.form.field({ name: 'reason', type: 'select', label: 'السبب الرئيسي', value: c.reasonCode || '', options: [['', 'اختر…']].concat(REASONS.map((r) => [r[0], r[1]])), required: true });
    modalForm({ title: 'تسجيل خطاب الاستقالة', subtitle: 'SCR-TRM-04 — ' + empName(c.employeeId), icon: 'doc', size: 'md', fields: [f.letter, f.sub, f.method, f.file, reasonF, f.att], submitLabel: 'تسجيل الاستقالة', danger: true,
      validate: (v) => { if (v.letter > today()) { f.letter.error('تاريخ الخطاب في المستقبل'); return 'تاريخ الخطاب في المستقبل'; } if (v.letter < (e.hireDate || '')) { f.letter.error('الخطاب أقدم من تاريخ التعيين — يُرفض (استقالة موقّعة مسبقًا).'); return 'الخطاب أقدم من تاريخ التعيين'; } const gap = diffDays(v.letter, v.sub); if (gap > (tol || 0)) { f.letter.error('تاريخ الخطاب أقدم من المسموح (' + gap + ' يوم) — ممنوع قبول استقالة موقّعة مسبقًا (م.167).' + (tol == null ? ' التسامح {Open}: يُطبَّق صفر حتى يُعتمد.' : '')); return 'خطاب أقدم من تاريخ التقديم'; } if (v.sub > today()) { f.sub.error('تاريخ التقديم في المستقبل'); return 'تاريخ التقديم في المستقبل'; } return null; },
      onSubmit: async (v) => { await SA.api(() => {
        const due = addDays(v.sub, settings().replyWindowDays || 10);
        patchCase(c.id, { status: 'submitted', letterDate: v.letter, submittedOn: v.sub, reasonCode: v.reason, attested: { at: new Date().toISOString(), method: v.method }, letterFile: v.file, replyDueOn: due, tasks: (c.tasks || []).concat([{ id: 'T' + ((c.tasks || []).length + 1), title: 'تصديق الاستقالة من الجهة المختصة', status: 'pending', dueOn: due, doneAt: null }]) });
        log(c.id, 'تسجيل خطاب الاستقالة بإقرار الموظف (' + (v.method === 'OTP' ? 'OTP' : 'حضوري') + ') — بدأت مهلة الرد حتى ' + due, 'HR.EXIT.RESIGNATION_SUBMITTED');
        SA.audit('HR.EXIT.RESIGNATION_SUBMITTED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, after: { letterDate: v.letter, submittedOn: v.sub, attested: v.method, replyDueOn: due } });
        SA.notify({ title: 'استقالة مُقدَّمة: ' + empName(c.employeeId), body: 'مهلة الرد حتى ' + due + ' — مهمة التصديق مفتوحة.', level: 'action', to: ['R-11', 'R-14', 'R-02'], link: '#/hr/termination/' + c.id });
      }); SA.toast('سُجّلت الاستقالة — بدأت مهلة الرد ' + (settings().replyWindowDays || 10) + ' أيام', 'success'); } });
  }
  function ratifyDialog(c) {
    const f = { status: SA.form.field({ name: 'status', type: 'radio', label: 'نتيجة التصديق', value: 'ratified', options: [['ratified', 'مُصدَّقة من الجهة المختصة'], ['on_hold', 'معلّقة'], ['not_required', 'غير مطلوبة بتقدير قانوني مكتوب']] }), ref: SA.form.field({ name: 'ref', label: 'مرجع التصديق', hint: 'إجراء التصديق الفعلي [Pending] — تأكيد مع المستشار القانوني.' }), date: SA.form.field({ name: 'date', type: 'date', label: 'تاريخ التصديق', value: today() }), file: SA.form.field({ name: 'file', label: 'المرفق (إيصال/ختم)', value: '' }) };
    modalForm({ title: 'تسجيل نتيجة التصديق', icon: 'check', size: 'sm', fields: Object.keys(f).map((k) => f[k]), validate: (v) => (v.status === 'ratified' && !v.ref.trim() ? (f.ref.error('المرجع مطلوب عند التصديق'), 'مرجع التصديق مطلوب') : null),
      onSubmit: async (v) => { await SA.api(() => { patchCase(c.id, { ratification: { status: v.status, ref: v.ref, date: v.date }, tasks: (c.tasks || []).map((t) => (/تصديق/.test(t.title) && v.status !== 'on_hold' ? Object.assign({}, t, { status: 'done', doneAt: new Date().toISOString() }) : t)) }); log(c.id, 'تسجيل التصديق: ' + v.status + (v.ref ? ' — ' + v.ref : ''), 'HR.EXIT.RATIFICATION_RECORDED'); SA.audit('HR.EXIT.RATIFICATION_RECORDED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, after: { status: v.status, ref: v.ref } }); }); SA.toast('سُجّل التصديق', 'success'); } });
  }
  async function requestAcceptance(c) {
    const lk = lockOf(c); if (lk) { SA.toast(lk, 'warn'); return; }
    if (EMPLOYER_TYPES.indexOf(c.type) >= 0 && sickLeaveOn(c.employeeId, today())) { SA.audit('HR.EXIT.BLOCK_TRIGGERED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, reason: 'إجازة مرضية مثبتة', result: 'denied' }); SA.toast('محظور: لا إنهاء من صاحب العمل أثناء إجازة مرضية مثبتة (م.54 — بلا تجاوز).', 'error', { ms: 6500 }); return; }
    const chain = ['R-11'].concat(settings().gmStepEnabled ? ['R-02'] : []);
    const ok = await confirmDo({ title: 'إرسال للاعتماد', text: 'سيصل الطلب لصندوق الاعتمادات المشترك. أنت (المنشئ) لا تعتمد حالتك.', impact: ['السلسلة: ' + chain.map(roleLabel).join(' ← '), 'بعد الاعتماد تبدأ فترة الإخطار من ملف الحالة.'], confirmLabel: 'إرسال' }, () => {
      const ap = SA.requestApproval({ type: 'exit_acceptance', area: 'hr', title: 'قبول ' + TYPES[c.type][0].replace(/ \(.*/, '') + ' — ' + empName(c.employeeId), chain, context: [['الموظف', empName(c.employeeId) + ' (' + (emp(c.employeeId) || {}).empNo + ')'], ['النوع', TYPES[c.type][0]], ['مرجع الحالة', c.id], ['ملاحظة', 'المنشئ لا يعتمد حالته']], ref: { type: 'exit_case', id: c.id } });
      patchCase(c.id, { status: 'pending_approval', approvalId: ap.id }); log(c.id, 'إرسال للاعتماد (' + ap.id + ')', 'HR.EXIT.EMPLOYER_REPLY_RECORDED'); SA.audit('HR.EXIT.EMPLOYER_REPLY_RECORDED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, after: { approval: ap.id, status: 'pending_approval' } });
    });
    if (ok) SA.toast('أُرسل للاعتماد — متابعة من صندوق الاعتمادات', 'success');
  }
  async function implicitAccept(c) {
    const ok = await confirmDo({ title: 'تسجيل القبول الضمني', text: 'انتهت مهلة الرد دون قرار — تُعتبر الاستقالة مقبولة ضمنيًا (م.167).', confirmLabel: 'تسجيل القبول الضمني', reasonRequired: false }, () => { patchCase(c.id, { status: 'accepted', acceptedOn: today(), acceptedBy: meUser().id, withdrawalDeadline: addDays(today(), settings().withdrawWindowDays || 10) }); log(c.id, 'قبول ضمني بعد انتهاء مهلة الرد', 'HR.EXIT.EMPLOYER_REPLY_RECORDED'); SA.audit('HR.EXIT.EMPLOYER_REPLY_RECORDED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, after: { implicit: true } }); });
    if (ok) SA.toast('سُجّل القبول الضمني', 'success');
  }

  /* ── notice calculator + start (SCR-TRM-06) ── */
  function noticeDialog(c) {
    const cur = settings(); const e = emp(c.employeeId) || {}; const employer = EMPLOYER_TYPES.indexOf(c.type) >= 0; const noMonths = c.type === 'DTH' || c.type === 'RET';
    const f = { start: SA.form.field({ name: 'start', type: 'date', label: 'بداية الإخطار', required: true, value: c.acceptedOn || today(), onChange: calc }), months: SA.form.field({ name: 'months', type: 'number', label: 'مدة الإخطار (أشهر ميلادية)', required: true, value: cur.noticeMonths == null ? (noMonths ? 0 : '') : cur.noticeMonths, hint: cur.noticeMonths == null ? 'الإعداد الافتراضي {Open}: أدخل المدة المتفق عليها بالعقد (تجريبي) — تراجعها الإدارة القانونية.' : 'من الإعدادات.', onInput: calc }),
      paused: SA.form.field({ name: 'paused', type: 'number', label: 'أيام توقف المهلة (إجازات/مرضي)', value: 0, hint: 'تُحسب آليًا من الإجازات المعتمدة ويمكن تعديلها.', onInput: calc }), lieu: employer ? SA.form.field({ name: 'lieu', type: 'checkbox', label: 'دفع بدل الإخطار بدلاً من الخدمة (م.164) — يدخل المخالصة', value: false }) : null };
    const out = h('div.sap-x-clock', {}); const auto = () => { const s = f.start.get(), mo = +f.months.get() || 0; if (!s) return 0; const end = addDays(addMonths(s, mo), -1); return approvedLeaveDays(c.employeeId, s, end); };
    function calc() { const s = f.start.get(); const mo = +f.months.get() || 0; const p = +f.paused.get() || 0; if (!s) return; const last = addDays(addMonths(s, mo), -1 + p); SA.clear(out); out.append(h('div', {}, h('small', {}, 'آخر يوم عمل'), h('b', {}, last), h('small', {}, 'بعد ' + diffDays(today(), last) + ' يوم')), h('div', {}, h('small', {}, 'أيام التوقف'), h('b', {}, p), h('small', {}, 'مدرجة في الحساب')), h('div', {}, h('small', {}, 'الأجر حتى'), h('b', {}, last), h('small', {}, 'ثم لا أجر ولا «نشط»'))); }
    const m = modalForm({ title: 'بدء فترة الإخطار', subtitle: 'SCR-TRM-06 — حاسبة آخر يوم عمل · ' + empName(c.employeeId), icon: 'clock', size: 'md', fields: [f.start, f.months, f.paused, f.lieu], extra: h('div', {}, out, legalNote('الحساب بالشهور الميلادية: آخر يوم = بداية الإخطار + المدة − يوم + أيام التوقف. القيم DEMO والإعدادات الفعلية {Open}.')), submitLabel: 'بدء الإخطار وتثبيت آخر يوم', validate: (v) => (v.months == null || v.months < 0 ? 'مدة الإخطار غير صحيحة' : null),
      onSubmit: async (v) => { await SA.api(() => {
        const last = addDays(addMonths(v.start, +v.months), -1 + (+v.paused || 0));
        patchCase(c.id, { status: 'notice', noticeStart: v.start, noticeMonths: +v.months, pausedDays: +v.paused || 0, lastWorkingDay: last, noticePaidInLieu: !!v.lieu });
        st.patch('employees', c.employeeId, { status: 'notice', endDate: last });
        ensureClearance(c.id); ensureSettlement(c.id);
        log(c.id, 'بدء فترة الإخطار (' + v.months + ' شهر) — آخر يوم عمل ' + last + ' — حالة الموظف «فترة إخطار»', 'HR.EXIT.NOTICE_STARTED');
        SA.audit('HR.EXIT.NOTICE_STARTED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, after: { noticeStart: v.start, months: +v.months, paused: +v.paused || 0 } });
        SA.audit('HR.EXIT.LAST_DAY_SET', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, after: { lastWorkingDay: last } });
        SA.audit('HR.EXIT.STATUS_CHANGED', { target: { type: 'employee', id: c.employeeId, label: empName(c.employeeId) }, before: { status: e.status }, after: { status: 'notice', endDate: last } });
        SA.notify({ title: 'بدأت فترة الإخطار: ' + empName(c.employeeId), body: 'آخر يوم عمل ' + last + ' — نموذج الإخلاء والمخالصة التقديرية أُنشئا.', level: 'info', to: ['R-11', 'R-12', 'R-13', 'R-14'], link: '#/hr/termination/' + c.id });
        SA.emit('employees');
      }); SA.toast('بدأ الإخطار — آخر يوم عمل ثُبّت', 'success'); } });
    calc(); const p0 = auto(); if (p0) { f.paused.set(p0); calc(); }
  }
  function ensureClearance(caseId) {
    const c = caseOf(caseId); if (clearanceOf(c)) return clearanceOf(c).id; const id = nextNumber('CLR');
    st.insert('clearances', { id, caseId, employeeId: c.employeeId, status: 'open', createdAt: new Date().toISOString(), items: newClearanceItems(), signoffs: [], handover: [], demo: false });
    patchCase(caseId, { clearanceId: id }); SA.audit('HR.CLEARANCE.CREATED', { target: { type: 'clearance', id, label: 'إخلاء طرف — ' + empName(c.employeeId) }, after: { status: 'open' } }); return id;
  }
  function ensureSettlement(caseId) {
    const c = caseOf(caseId); const ex = settlementOf(c); if (ex) { patchCase(caseId, { settlementId: ex.id }); return ex.id; } const id = nextNumber('FS');
    st.insert('settlements', { id, employeeId: c.employeeId, caseId, scenario: c.type, status: 'draft', calculatedBy: null, approvalId: null, createdAt: new Date().toISOString(), projected: true, calcVersion: 0, manual: {}, overrides: {} });
    patchCase(caseId, { settlementId: id }); SA.audit('HR.SETTLEMENT.CREATED', { target: { type: 'settlement', id, label: 'مخالصة ' + empName(c.employeeId) }, after: { status: 'draft', projected: true } }); return id;
  }

  /* ── withdraw / cancel / retention / waiver / close ── */
  function withdrawDialog(c) {
    const f = SA.form.field({ name: 'note', type: 'textarea', label: 'ملاحظة (خطاب الموظف بالعدول)', required: true, rules: [SA.form.rules.min(5)] });
    modalForm({ title: 'سحب الاستقالة (العدول)', subtitle: 'SCR-TRM-12 — المهلة حتى ' + c.withdrawalDeadline, icon: 'undo', size: 'sm', fields: [f], intro: SA.alert('warning', 'يعيد الموظف إلى «نشط» ويُبطل نموذج الإخلاء والمخالصة المبدئية. بعد المهلة لا سحب إلا بقرار صاحب العمل المسجّل.'), submitLabel: 'تأكيد السحب', danger: true,
      onSubmit: async (v) => { await SA.api(() => { patchCase(c.id, { status: 'withdrawn', withdrawnOn: today() }); if (c.clearanceId) st.patch('clearances', c.clearanceId, { voided: true }); if (c.settlementId) st.patch('settlements', c.settlementId, { voided: true }); st.patch('employees', c.employeeId, { status: 'active', endDate: null }); log(c.id, 'سحب الاستقالة (عدول): ' + v.note, 'HR.EXIT.WITHDRAWN'); SA.audit('HR.EXIT.WITHDRAWN', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, reason: v.note, after: { status: 'withdrawn' } }); SA.audit('HR.EXIT.STATUS_CHANGED', { target: { type: 'employee', id: c.employeeId, label: empName(c.employeeId) }, after: { status: 'active' } }); SA.notify({ title: 'سُحبت الاستقالة: ' + empName(c.employeeId), body: 'تم العدول خلال المهلة.', level: 'action', to: ['R-11', 'R-14'], link: '#/hr/termination/' + c.id }); SA.emit('employees'); }); SA.toast('سُحبت الاستقالة وعاد الموظف «نشط»', 'success'); } });
  }
  function cancelDialog(c) {
    const f = SA.form.field({ name: 'reason', type: 'textarea', label: 'سبب الإلغاء', required: true, rules: [SA.form.rules.min(5)] });
    modalForm({ title: 'إلغاء حالة الإنهاء', icon: 'xcircle', size: 'sm', fields: [f], intro: SA.alert('warning', 'لا تُحذف الحالة ولا يُعاد استخدام رقمها (BR-TRM-17).'), submitLabel: 'إلغاء الحالة', danger: true,
      onSubmit: async (v) => { await SA.api(() => { patchCase(c.id, { status: 'cancelled' }); log(c.id, 'إلغاء الحالة: ' + v.reason, 'HR.EXIT.CANCELLED'); SA.audit('HR.EXIT.CANCELLED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, reason: v.reason, after: { status: 'cancelled' } }); }); SA.toast('أُلغيت الحالة', 'success'); } });
  }
  function retentionDialog(c) {
    const f = { offers: SA.form.field({ name: 'offers', type: 'multi', label: 'عروض ممكنة (تتحول لطلبات منفصلة وليست التزامًا)', options: [['pay', 'مراجعة الأجر (طلب تغيير مرتب منفصل)'], ['shift', 'تغيير الوردية'], ['transfer', 'نقل داخلي'], ['train', 'مسار تدريب']] }), outcome: SA.form.field({ name: 'outcome', type: 'radio', label: 'النتيجة', value: 'THINKING', options: [['STAY', 'قرر البقاء'], ['LEAVE', 'مُصرّ على المغادرة'], ['THINKING', 'يفكّر']] }), note: SA.form.field({ name: 'note', type: 'textarea', label: 'ملخص الجلسة (سري T4)', required: true }) };
    modalForm({ title: 'جلسة الاحتفاظ بالموظف', subtitle: 'SCR-TRM-07 — سرّية T4', icon: 'users', size: 'md', fields: Object.keys(f).map((k) => f[k]), intro: SA.alert('info', 'لا توقف المُهل القانونية. العروض لا تعني التزامًا قبل اعتمادها كطلبات منفصلة.'), submitLabel: 'تسجيل الجلسة',
      onSubmit: async (v) => { await SA.api(() => { log(c.id, 'جلسة احتفاظ — النتيجة: ' + ({ STAY: 'بقاء', LEAVE: 'مغادرة', THINKING: 'يفكّر' })[v.outcome], 'HR.EXIT.RETENTION_LOGGED'); SA.audit('HR.EXIT.RETENTION_LOGGED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, after: { outcome: v.outcome, offers: v.offers } }); }); SA.toast('سُجّلت جلسة الاحتفاظ', 'success'); } });
  }
  async function waiverDialog(c, b) {
    const direct = isGM(); if (isConflict(c.employeeId)) { SA.toast('تضارب مصالح', 'warn'); return; }
    const f = SA.form.field({ name: 'reason', type: 'textarea', label: 'سبب التنازل (مكتوب)', required: true, rules: [(v) => ((v || '').trim().length >= 15 ? null : 'اكتب سببًا كافيًا (15 حرفًا على الأقل) — الحد الفعلي {Open}')] });
    modalForm({ title: direct ? 'التنازل عن الحاجز (المدير العام)' : 'طلب تنازل من المدير العام', subtitle: b.label, icon: 'shield', size: 'md', danger: true, fields: [f], intro: SA.alert('warning', direct ? 'التنازل يفتح انتقال الموظف إلى «منتهي» قبل قفل الإخلاء/المخالصة. البنود المفتوحة تتحول إلى مهام متأخرة.' : 'الطلب يصل لصندوق اعتمادات المدير العام (N-S5). لا تنازل ذاتي.'), submitLabel: direct ? 'تنازل بعد التحقق' : 'إرسال الطلب',
      onSubmit: async (v) => {
        if (direct && !(await SA.stepUp('policy.change', { force: true }))) return false;
        await SA.api(() => {
          if (direct) { st.update('exitCases', (l) => { const cc = l.find((x) => x.id === c.id); cc.blocks = (cc.blocks || []).filter((x) => x.rule !== b.rule).concat([{ rule: b.rule, state: 'waived', waivedBy: meUser().id, reason: v.reason, at: new Date().toISOString() }]); }); log(c.id, 'تنازل عن حاجز «' + b.rule + '» — ' + v.reason, 'HR.EXIT.BLOCK_WAIVED'); SA.audit('HR.EXIT.BLOCK_WAIVED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, reason: v.reason, after: { rule: b.rule }, stepUp: true }); SA.notify({ title: 'تنازل مدير عام عن حاجز إنهاء', body: empName(c.employeeId) + ' — ' + b.label.split(' — ')[0], level: 'info', to: ['R-11'], link: '#/hr/termination/' + c.id }); }
          else { const ap = SA.requestApproval({ type: 'exit_waiver', area: 'hr', title: 'تنازل عن حاجز إنهاء — ' + empName(c.employeeId), chain: ['R-02'], context: [['الحالة', c.id], ['الحاجز', b.label], ['السبب المكتوب', v.reason]], ref: { type: 'exit_case', id: c.id } }); st.update('exitCases', (l) => { const cc = l.find((x) => x.id === c.id); cc.blocks = (cc.blocks || []).filter((x) => x.rule !== b.rule).concat([{ rule: b.rule, state: 'waiver_requested', reason: v.reason, approvalId: ap.id, requestedBy: meUser().id }]); }); log(c.id, 'طلب تنازل عن حاجز «' + b.rule + '» (' + ap.id + ')', 'HR.EXIT.WAIVER_REQUESTED'); SA.audit('HR.EXIT.WAIVER_REQUESTED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, reason: v.reason, after: { rule: b.rule, approval: ap.id } }); }
        }); SA.toast(direct ? 'تم التنازل وسُجّل السبب' : 'أُرسل طلب التنازل للمدير العام', 'success'); } });
  }
  async function closeCase(c) {
    const lk = lockOf(c); if (lk) { SA.toast(lk, 'warn'); return; }
    const bl = computeBlocks(c); const bad = blocking(bl);
    if (bad.length) { bad.forEach((b) => SA.audit('HR.EXIT.BLOCK_TRIGGERED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, reason: b.label, result: 'denied', after: { rule: b.rule } })); SA.toast('محظور: ' + bad.map((b) => b.label.split(' — ')[0]).join(' · '), 'error', { ms: 7000 }); SA.nav('hr/termination/' + c.id, { query: { tab: 'blocks' } }); return; }
    const e = emp(c.employeeId) || {}; const u = e.userId ? SA.userById(e.userId) : null;
    const ok = await confirmDo({ title: 'إغلاق الحالة وتحويل الموظف إلى «منتهي»', danger: true, impact: ['حالة الموظف في الدليل: «منتهي» وتاريخ الانتهاء ' + (c.lastWorkingDay || today()), 'لا يدخل كشف المرتبات التالي', 'يُنشأ سجل خريج في الأرشيف', u && u.status === 'active' ? 'حساب النظام المرتبط سيُعرض للتعطيل' : 'لا حساب نظام نشط'], warnings: bl.some((b) => b.state === 'waived') ? ['أُغلقت بتنازل مدير عام مسجّل — تظهر المهام المتأخرة في الإخلاء/المخالصة.'] : [], confirmLabel: 'إغلاق الحالة', stepUp: 'policy.change' }, () => {
      patchCase(c.id, { status: 'closed', closedAt: new Date().toISOString() }); st.patch('employees', c.employeeId, { status: 'terminated', endDate: c.lastWorkingDay || today() });
      st.update('alumniFlags', (l) => { if (!l.some((x) => x.employeeId === c.employeeId)) l.push({ employeeId: c.employeeId, eligibility: 'pending_review', reasonCode: null, note: '', setBy: null, setAt: null, blacklist: { status: 'none' }, legalHold: false, talentConsent: false }); });
      log(c.id, 'إغلاق الحالة — الموظف «منتهي»', 'HR.EXIT.STATUS_CHANGED'); SA.audit('HR.EXIT.STATUS_CHANGED', { target: { type: 'employee', id: c.employeeId, label: empName(c.employeeId) }, before: { status: e.status }, after: { status: 'terminated', endDate: c.lastWorkingDay || today() } }); SA.audit('HR.ALUMNI.CREATED', { target: { type: 'alumni', id: c.employeeId, label: empName(c.employeeId) }, after: { eligibility: 'pending_review' } });
      SA.notify({ title: 'أُغلقت حالة الإنهاء: ' + empName(c.employeeId), body: 'الموظف الآن «منتهي» — راجع حساب النظام والأرشيف.', level: 'info', to: ['R-11', 'R-13', 'R-10'], link: '#/hr/archive' }); SA.emit('employees');
    });
    if (!ok) return; SA.toast('أُغلقت الحالة — الموظف منتهي', 'success');
    if (u && u.status === 'active' && SA.users && SA.users.disable && SA.can('sa.users.disable')) { const r = await SA.confirm({ title: 'تعطيل حساب النظام المرتبط؟', text: 'مستخدم ' + u.name + ' ما زال نشطًا (BR-CLR-07).', confirmLabel: 'تعطيل الآن', cancelLabel: 'لاحقًا' }); if (r.ok) SA.users.disable(u.id); }
  }

  /* ── employer path (م.148) ── */
  const PATH = [['cause', 'تحديد السبب المشروع من أسباب م.148'], ['investigation', 'التحقيق وجلسة السماع ومحضر'], ['blocks', 'فحص الحواجز (مرضي · وضع · إصابة عمل)'], ['legal', 'الفحص القانوني'], ['gm', 'اعتماد المدير العام'], ['court', 'مهمة رفع دعوى عمالية ومتابعتها']];
  function startEmployerPath(c) {
    if (sickLeaveOn(c.employeeId, today())) { SA.toast('محظور: إجازة مرضية مثبتة — لا مسار إنهاء من صاحب العمل (بلا تجاوز).', 'error', { ms: 6500 }); return; }
    confirmDo({ title: 'بدء مسار إنهاء صاحب العمل', text: 'لا زر «فصل». الحالة لا تتحول لـ«منتهي» إلا بحكم أو تسوية مسجّلة.', confirmLabel: 'بدء المسار' }, () => { patchCase(c.id, { status: 'employer_path', extra: Object.assign({}, c.extra, { path: PATH.map((p) => ({ id: p[0], done: false })) }) }); log(c.id, 'بدء مسار م.148', 'HR.EXIT.EMPLOYER_PATH_STARTED'); SA.audit('HR.EXIT.EMPLOYER_PATH_STARTED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) } }); }).then((ok) => ok && SA.toast('بدأ المسار', 'success'));
  }
  function employerPathCard(c) {
    const path = (c.extra && c.extra.path) || []; if (!path.length) return SA.card({ title: 'مسار صاحب العمل (م.148)' }, h('p.t-muted', {}, 'لم يبدأ بعد.'));
    const idx = path.findIndex((p) => !p.done);
    return SA.card({ title: 'مسار صاحب العمل (م.148) — SCR-TRM-09' }, h('ul.sap-x-steps', {}, PATH.map((p, i) => { const done = path[i] && path[i].done; return h('li', { class: done ? 'is-done' : '' }, h('span.sap-x-dot', {}, done ? '✓' : i + 1), h('span', {}, h('b', {}, p[1]), p[0] === 'gm' ? h('span.sap-x-sub', {}, 'يكتمل بواسطة المدير العام فقط') : null), i === idx ? SA.btn({ label: p[0] === 'court' ? 'إنشاء مهمة الدعوى' : 'تأكيد الإنجاز', kind: 'ghost', size: 'sm', reason: lockOf(c, 'hr.termination.approve') || (p[0] === 'gm' && !isGM() ? 'للمدير العام فقط' : ''), onClick: () => pathStep(c, p, i) }) : h('span')); })),
      path.every((p) => p.done) ? h('div', {}, SA.kv([['مرجع الحكم/التسوية', (c.extra && c.extra.ruling) || 'لم يُسجَّل']]), SA.btn({ label: 'تسجيل الحكم/التسوية', icon: 'doc', kind: 'ghost', reason: lockOf(c, 'hr.termination.approve'), onClick: () => rulingDialog(c) })) : null);
  }
  function pathStep(c, p, i) { confirmDo({ title: p[1], confirmLabel: 'تأكيد', reasonRequired: p[0] === 'legal' || p[0] === 'gm', reasonLabel: 'ملاحظة/مرجع' }, () => { st.update('exitCases', (l) => { const cc = l.find((x) => x.id === c.id); cc.extra.path[i].done = true; }); log(c.id, 'خطوة المسار: ' + p[1], p[0] === 'court' ? 'HR.EXIT.COURT_TASK_CREATED' : null); if (p[0] === 'court') SA.audit('HR.EXIT.COURT_TASK_CREATED', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) } }); }).then((ok) => ok && SA.toast('تم تسجيل الخطوة', 'success')); }
  function rulingDialog(c) { const f = SA.form.field({ name: 'ref', label: 'مرجع الحكم أو محضر التسوية', required: true }); modalForm({ title: 'تسجيل الحكم / التسوية', icon: 'doc', size: 'sm', fields: [f], onSubmit: async (v) => { await SA.api(() => { st.update('exitCases', (l) => { const cc = l.find((x) => x.id === c.id); cc.extra.ruling = v.ref; cc.status = 'notice'; cc.noticeMonths = 0; cc.lastWorkingDay = today(); }); log(c.id, 'تسجيل حكم/تسوية: ' + v.ref, 'HR.EXIT.LAST_DAY_SET'); SA.audit('HR.EXIT.LAST_DAY_SET', { target: { type: 'exit_case', id: c.id, label: empName(c.employeeId) }, after: { ruling: v.ref } }); ensureClearance(c.id); ensureSettlement(c.id); }); SA.toast('سُجّل — انتقلت الحالة إلى الإخلاء والمخالصة', 'success'); } }); }

  reg({ id: 'hr-termination', app: 'hr', group: 'hr-exit', title: 'الاستقالات والإنهاء', icon: 'logout', route: 'hr/termination', perm: 'hr.termination.view', order: 70, desc: 'الاستقالة وإنهاء الخدمة', badge: () => { ensureInit(); const n = (st.get('exitCases') || []).filter((c) => c.status === 'submitted' || c.status === 'pending_approval').length; return n || null; }, render: (root, ctx) => simulateState(root, (host) => renderTermination(host, ctx)) });

  /* ═════════════════════════ HR-24 إخلاء الطرف + المقابلة الختامية ═════════════════════════ */
  const DEPTS = REQ_CLEAR.map((d) => ({ id: d[0], name: d[1], role: d[2] }));
  const deptOf = (id) => DEPTS.find((d) => d.id === id) || { id, name: id, role: 'R-01' };
  const ITEM_ST = { open: ['مفتوح', 'warning'], cleared: ['مخلّى', 'success'], charge: ['مخلّى بخصم', 'info'], blocked: ['محظور', 'danger'], na: ['لا ينطبق', 'neutral'] };
  const CL_ST = { open: ['مفتوح', 'warning'], partial: ['مخلّى جزئيًا', 'info'], cleared: ['مخلّى', 'success'], cleared_waived: ['مخلّى بتنازل المدير العام', 'warning'] };
  const hash32 = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return ('00000000' + (x >>> 0).toString(16)).slice(-8); };
  const clRows = () => (st.get('clearances') || []).filter((x) => !x.voided);
  const clById = (id) => st.find('clearances', id);
  const signedDepts = (cl) => (cl.signoffs || []).filter((s) => !s.revoked).map((s) => s.dept);
  const waivedClear = (cl) => { const c = caseOf(cl.caseId); return !!(c && (c.blocks || []).some((b) => b.rule === 'clearance' && b.state === 'waived')); };
  const clStatusOf = (cl) => { const sd = signedDepts(cl); if (DEPTS.every((d) => sd.indexOf(d.id) >= 0)) return 'cleared'; if (waivedClear(cl)) return 'cleared_waived'; return sd.length ? 'partial' : 'open'; };
  /** merge live sources (custody from HR-08, loans from HR-15) into the stored clearance items — never deletes (BR-CLR-01) */
  function syncSources(cl) {
    if (!cl || cl.voided) return false; const cus = custodyOf(cl.employeeId); const ln = loansOf(cl.employeeId);
    const addItems = cus.filter((cu) => !cl.items.some((i) => i.sourceRef === cu.id));
    const closeIds = cl.items.filter((i) => { if (i.source !== 'custody' || !i.sourceRef || i.status !== 'open') return false; const cu = cus.find((c2) => c2.id === i.sourceRef); return cu && !cu.open; }).map((i) => i.id);
    const li = cl.items.find((i) => i.source === 'loan'); let want = null;
    if (li) { want = ln.length ? (li.status === 'charge' || li.status === 'na' ? li.status : 'blocked') : (li.status === 'blocked' ? 'cleared' : li.status); }
    const refStr = ln.map((q) => q.id).join(',');
    const dirty = addItems.length || closeIds.length || (li && (want !== li.status || (li.sourceRef || '') !== refStr));
    if (!dirty) return false; // never write (and notify) when nothing changed — avoids repaint loops
    st.update('clearances', (l) => { const x = l.find((y) => y.id === cl.id); if (!x) return;
      addItems.forEach((cu) => x.items.push({ id: 'cus-' + cu.id, dept: 'store', label: 'عهدة: ' + cu.label + (cu.qty ? ' × ' + cu.qty : ''), ownerRole: 'R-06', status: cu.open ? 'open' : 'cleared', source: 'custody', sourceRef: cu.id, note: '', due: null, chargeAmount: 0, locked: true, evidence: '' }));
      x.items.forEach((i) => { if (closeIds.indexOf(i.id) >= 0) { i.status = 'cleared'; i.note = 'أُعيدت في HR-08'; } });
      const l2 = x.items.find((i) => i.source === 'loan'); if (l2) { l2.status = want; l2.sourceRef = refStr; } });
    return true;
  }
  function syncStatus(clId) { const cl = clById(clId); if (!cl) return; const ns = clStatusOf(cl); if (ns !== cl.status) { st.patch('clearances', clId, { status: ns }); if (ns === 'cleared' || ns === 'cleared_waived') { SA.audit('HR.CLEARANCE.CLOSED', { target: { type: 'clearance', id: clId, label: 'إخلاء طرف — ' + empName(cl.employeeId) }, after: { status: ns } }); SA.notify({ title: 'اكتمل إخلاء الطرف: ' + empName(cl.employeeId), body: 'المخالصة جاهزة للحساب والاعتماد.', level: 'action', to: ['R-11', 'R-13'], link: '#/hr/settlement' }); } } }
  const deptItems = (cl, d) => cl.items.filter((i) => i.dept === d);
  const itemClosed = (i) => ['cleared', 'charge', 'na'].indexOf(i.status) >= 0;
  const overdueOf = (cl) => { const out = []; if (OPEN_STATES.indexOf((caseOf(cl.caseId) || {}).status) < 0 && cl.status !== 'cleared_waived') return out; cl.items.forEach((i) => { if (!itemClosed(i)) out.push(i); }); return out; };

  function renderClearance(root, ctx) {
    ensureInit(); css(); if (pageDeny(root, 'hr.clearance.view')) return;
    const openId = ctx.path[0] || null; ctx.setCrumbs([{ label: 'الإنهاء' }, { label: 'إخلاء الطرف', href: openId ? '#/hr/clearance' : null }].concat(openId ? [{ label: openId }] : []));
    let tab = ctx.params.tab || 'board'; const head = h('div'); const host = h('div'); root.append(head, host); let drawer = null; let leaving = false;
    clRows().forEach(syncSources);
    const tabsC = SA.tabs({ tabs: [{ id: 'board', label: 'لوحة الإخلاء', icon: 'check' }, { id: 'interviews', label: 'المقابلات الختامية', icon: 'users' }, { id: 'stats', label: 'إحصاءات مجمّعة (سرّية)', icon: 'gauge' }], active: tab, onChange: (t) => { tab = t; paint(); } });
    function paintHead() { SA.clear(head); const rows = clRows(); head.append(SA.pageHead({ title: 'إخلاء الطرف والمقابلة الختامية', desc: 'نموذج يُنشأ تلقائيًا عند بدء الإخطار: بند لكل قسم بمالك وحالة، العهدة من HR-08 والسلف من HR-15 تظهر كعوائق، ولا «منتهي» قبل توقيع كل الأقسام أو تنازل المدير العام.', tags: [SA.tag('new')], actions: [specLink('hr-24')] }),
      h('div.sap-x-kpis', {}, SA.kpi('نماذج مفتوحة', rows.filter((r) => r.status !== 'cleared' && r.status !== 'cleared_waived').length), SA.kpi('أقسام بانتظار توقيع', rows.reduce((a, r) => a + (OPEN_STATES.indexOf((caseOf(r.caseId) || {}).status) >= 0 ? DEPTS.length - signedDepts(r).length : 0), 0)), SA.kpi('عوائق عهدة وسلف', rows.reduce((a, r) => a + r.items.filter((i) => i.status === 'blocked' || (i.source === 'custody' && i.status === 'open')).length, 0), { accent: true }), SA.kpi('مقابلات مجدولة', (st.get('exitInterviews') || []).filter((x) => x.status === 'scheduled').length)), tabsC.el); }
    function paint() { SA.clear(host); tabsC.setActive(tab); host.append(tab === 'board' ? board() : tab === 'interviews' ? interviewsTab() : statsTab()); }
    function board() {
      const tbl = SA.table({ rowId: 'id', pageSize: 8, caption: 'نماذج إخلاء الطرف', rows: clRows, search: { placeholder: 'ابحث باسم الموظف أو رقم النموذج…', keys: [(r) => empName(r.employeeId), 'id'] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(CL_ST).map((k) => [k, CL_ST[k][0]]) }],
        columns: [{ key: 'id', label: 'النموذج', sort: true, render: (r) => h('div', {}, h('b.num', {}, r.id), h('span.sap-x-sub', {}, 'حالة الإنهاء ' + r.caseId)) }, { key: 'employeeId', label: 'الموظف', sort: true, value: (r) => empName(r.employeeId), render: (r) => h('div', {}, h('b', {}, empName(r.employeeId)), h('span.sap-x-sub', {}, 'آخر يوم ' + ((caseOf(r.caseId) || {}).lastWorkingDay || '—'))) },
          { key: 'status', label: 'الحالة', sort: true, render: (r) => chip(CL_ST[clStatusOf(r)][0], CL_ST[clStatusOf(r)][1]) },
          { key: 'depts', label: 'الأقسام (' + DEPTS.length + ')', render: (r) => { const sd = signedDepts(r); return h('div.sap-x-stat', {}, DEPTS.map((d) => { const open = deptItems(r, d.id).some((i) => i.status === 'blocked'); return h('span', { title: d.name, class: 'chip ' + (sd.indexOf(d.id) >= 0 ? 'chip-success' : open ? 'chip-danger' : '') }, (sd.indexOf(d.id) >= 0 ? '✓ ' : open ? '× ' : '· ') + d.name.split(' ')[0]); })); } },
          { key: 'blockers', label: 'عوائق', render: (r) => { const n = r.items.filter((i) => i.status === 'blocked').length + r.items.filter((i) => i.source === 'custody' && i.status === 'open').length; return n ? chip(n + ' عائق', 'danger') : h('span.sap-dash', {}, '—'); } }],
        onRowClick: (r) => SA.nav('hr/clearance/' + r.id), rowActions: (r) => [{ label: 'فتح النموذج', icon: 'external', onClick: () => SA.nav('hr/clearance/' + r.id) }, { label: 'ملف الإنهاء', icon: 'logout', onClick: () => SA.nav('hr/termination/' + r.caseId) }],
        empty: { icon: 'check', title: 'لا نماذج إخلاء', text: 'تُنشأ تلقائيًا عند بدء فترة الإخطار من «الاستقالات والإنهاء».' } });
      const owners = {}; clRows().forEach((r) => { if (OPEN_STATES.indexOf((caseOf(r.caseId) || {}).status) < 0) return; r.items.filter((i) => !itemClosed(i)).forEach((i) => { (owners[i.ownerRole] = owners[i.ownerRole] || []).push({ r, i }); }); });
      return h('div', {}, h('div.card.card-flush.sap-listcard', {}, tbl.el), SA.card({ title: 'العوائق والبنود المعلّقة حسب المسؤول' }, Object.keys(owners).length ? h('div', {}, Object.keys(owners).map((role) => h('div', { style: { marginBlockEnd: '10px' } }, h('b', {}, roleLabel(role)), h('ul.sap-x-steps', { style: { marginBlockStart: '6px' } }, owners[role].slice(0, 6).map((o) => h('li', { class: o.i.status === 'blocked' ? 'is-bad' : '' }, h('span.sap-x-dot', {}, o.i.status === 'blocked' ? '×' : '·'), h('span', {}, h('b', {}, o.i.label), h('span.sap-x-sub', {}, empName(o.r.employeeId) + ' — ' + o.r.id)), SA.btn({ label: 'فتح', kind: 'ghost', size: 'sm', onClick: () => SA.nav('hr/clearance/' + o.r.id) }))))))) : SA.empty({ icon: 'checkcircle', title: 'لا بنود معلّقة' })));
    }
    /* interviews */
    function interviewsTab() {
      const rows = (st.get('exitInterviews') || []).filter((x) => x.employeeId); const can = SA.can('hr.clearance.edit');
      const tbl = SA.table({ rowId: 'id', pageSize: 8, rows: () => rows, columns: [{ key: 'id', label: 'المقابلة', render: (x) => h('b.num', {}, x.id) }, { key: 'employeeId', label: 'الموظف', value: (x) => empName(x.employeeId), render: (x) => empName(x.employeeId) }, { key: 'status', label: 'الحالة', render: (x) => chip({ scheduled: 'مجدولة', done: 'تمت', declined: 'اعتذر' }[x.status], x.status === 'done' ? 'success' : x.status === 'declined' ? 'neutral' : 'info') }, { key: 'when', label: 'الموعد', render: (x) => dnum(x.scheduledAt || (x.doneAt ? x.doneAt.slice(0, 10) : null)) }, { key: 'who', label: 'المُقابِل', render: (x) => uname(x.interviewerId) }],
        rowActions: (x) => [{ label: 'إجراء المقابلة', icon: 'play', hidden: x.status !== 'scheduled', disabled: can ? '' : 'يتطلب hr.clearance.edit', onClick: () => conductInterview(x) }, { label: 'تسجيل اعتذار', icon: 'xcircle', hidden: x.status !== 'scheduled', onClick: () => declineInterview(x) }, { label: 'إجابات فردية (T4)', icon: 'lock', hidden: x.status !== 'done', disabled: canT4() ? '' : 'T4 — يتطلب hr.discipline.view', onClick: () => viewIndividual(x) }],
        toolbar: [SA.btn({ label: 'جدولة مقابلة', icon: 'plus', kind: 'ghost', perm: 'hr.clearance.edit', onClick: scheduleInterview })], empty: { icon: 'users', title: 'لا مقابلات', text: 'تُجدول في أسبوع الإخطار الأخير.' } });
      return h('div', {}, SA.alert('info', 'المقابلة يجريها HR Officer وليس المدير المباشر، واختيارية للموظف وله حق الاعتذار. الإجابات الفردية T4 لا يراها المدير المباشر ولا رئيس القسم ولا GM افتراضيًا (BR-CLR-09).'), h('div.card.card-flush.sap-listcard', {}, tbl.el));
    }
    function scheduleInterview() {
      const emps = (st.get('exitCases') || []).filter((c) => ['notice', 'accepted'].indexOf(c.status) >= 0 && !(st.get('exitInterviews') || []).some((x) => x.caseId === c.id)).map((c) => [c.id, empName(c.employeeId) + ' — ' + c.id]);
      if (!emps.length) { SA.toast('لا حالات في فترة الإخطار بدون مقابلة', 'info'); return; }
      const f = { c: SA.form.field({ name: 'c', type: 'select', label: 'الحالة', required: true, options: [['', 'اختر…']].concat(emps) }), d: SA.form.field({ name: 'd', type: 'date', label: 'موعد المقابلة (أسبوع الإخطار الأخير)', required: true, value: addDays(today(), 7) }) };
      modalForm({ title: 'جدولة مقابلة ختامية', icon: 'users', size: 'sm', fields: [f.c, f.d], submitLabel: 'جدولة', onSubmit: async (v) => { await SA.api(() => { const c = caseOf(v.c); const id = SA.store.nextId('exitInterviews', 'XI', 3); st.insert('exitInterviews', { id, caseId: c.id, employeeId: c.employeeId, interviewerId: null, status: 'scheduled', scheduledAt: v.d, consentAt: null, answers: null }); SA.audit('HR.INTERVIEW.SCHEDULED', { target: { type: 'interview', id, label: empName(c.employeeId) }, after: { scheduledAt: v.d } }); SA.notify({ title: 'مقابلة ختامية مجدولة', body: empName(c.employeeId) + ' — ' + v.d, level: 'info', to: ['R-12', 'R-11'], link: '#/hr/clearance?tab=interviews' }); }); SA.toast('تمت الجدولة', 'success'); paint(); } });
    }
    async function declineInterview(x) { const ok = await confirmDo({ title: 'تسجيل اعتذار الموظف عن المقابلة', text: 'للموظف حق الاعتذار — لا يؤثر على حقوقه.', confirmLabel: 'تسجيل' }, () => { st.patch('exitInterviews', x.id, { status: 'declined' }); SA.audit('HR.INTERVIEW.DECLINED', { target: { type: 'interview', id: x.id, label: empName(x.employeeId) } }); }); if (ok) { SA.toast('سُجّل الاعتذار', 'success'); paint(); } }
    function conductInterview(x) {
      const e = emp(x.employeeId) || {}; const mgr = e.managerEmpId ? emp(e.managerEmpId) : null; if (mgr && mgr.userId && mgr.userId === meUser().id) { SA.toast('المقابِل لا يكون المدير المباشر للموظف (BR-CLR-08)', 'error'); return; }
      const R = { mgmt: 3, pay: 3, conditions: 3, growth: 3 }; const rate = (k, label) => { const wrap = h('div.field', {}, h('span.label', {}, label), h('div.sap-x-rate', { role: 'group' }, [1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', 'aria-pressed': String(R[k] === n), onclick: (ev) => { R[k] = n; SA.$$('button', ev.currentTarget.parentNode).forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === n))); } }, n)))); return wrap; };
      const f = { consent: SA.form.field({ name: 'consent', type: 'checkbox', label: 'أُخبر الموظف بسرية الإجابات ووافق على إجراء المقابلة', rules: [mustCheck('موافقة الموظف مطلوبة قبل المقابلة')] }), reason: SA.form.field({ name: 'reason', type: 'select', label: 'السبب الرئيسي للخروج (كتالوج موحّد)', required: true, options: [['', 'اختر…']].concat(REASONS.map((r) => [r[0], r[1]]))}), ret: SA.form.field({ name: 'ret', type: 'radio', label: 'هل يعود للعمل لدينا مستقبلًا؟', value: 'yes', options: [['yes', 'نعم'], ['no', 'لا']] }), cmt: SA.form.field({ name: 'cmt', type: 'textarea', label: 'ملاحظات حرة (T4 — لا تُعرض إلا للمخوّلين)', rows: 3 }) };
      modalForm({ title: 'المقابلة الختامية', subtitle: 'SCR-CLR-06 — ' + empName(x.employeeId), icon: 'users', size: 'lg', fields: [f.consent, f.reason, f.ret, f.cmt], intro: h('div', {}, SA.alert('info', 'التقييمات من 1 (ضعيف) إلى 5 (ممتاز). الأرقام تُجمَّع مع إخفاء الخلايا الصغيرة قبل ظهورها للإدارة.'), h('div.sap-x-grid2', {}, rate('mgmt', 'الإدارة المباشرة'), rate('pay', 'الأجر والمزايا'), rate('conditions', 'بيئة وظروف العمل'), rate('growth', 'التطور والترقي'))), submitLabel: 'حفظ المقابلة',
        onSubmit: async (v) => { await SA.api(() => { st.patch('exitInterviews', x.id, { status: 'done', interviewerId: meUser().id, consentAt: new Date().toISOString(), doneAt: new Date().toISOString(), answers: { reason: v.reason, rating: Object.assign({}, R), wouldReturn: v.ret === 'yes', comment: v.cmt } }); SA.audit('HR.INTERVIEW.DONE', { target: { type: 'interview', id: x.id, label: empName(x.employeeId) } }); }); SA.toast('حُفظت المقابلة (سرّية)', 'success'); paint(); } });
    }
    async function viewIndividual(x) {
      const ok = await confirmDo({ title: 'قراءة إجابات فردية (T4)', text: 'بيانات سرية جدًا — كل قراءة تُسجَّل باسمك.', danger: true, reasonRequired: true, confirmLabel: 'عرض', stepUp: 'policy.change' }, (r) => { SA.audit('HR.INTERVIEW.VIEWED', { target: { type: 'interview', id: x.id, label: empName(x.employeeId) }, reason: r.reason }); });
      if (!ok) return; const a = x.answers || {}; SA.modal({ title: 'إجابات ' + empName(x.employeeId), icon: 'lock', size: 'md', body: h('div', {}, SA.kv([['السبب', reasonLabel(a.reason)], ['الإدارة', (a.rating || {}).mgmt], ['الأجر', (a.rating || {}).pay], ['البيئة', (a.rating || {}).conditions], ['التطور', (a.rating || {}).growth], ['يعود مستقبلًا', a.wouldReturn ? 'نعم' : 'لا'], ['ملاحظات', a.comment || '—']])) });
    }
    /* aggregated stats (SCR-CLR-07) */
    function statsTab() {
      const done = (st.get('exitInterviews') || []).filter((x) => x.status === 'done' && x.answers); const minCell = settings().minCell; const mask = (n) => minCell && n < minCell;
      SA.audit('HR.INTERVIEW.STATS_VIEWED', { target: { type: 'report', id: 'exit-interviews', label: 'ملخص المقابلات الختامية' }, after: { n: done.length } });
      const reasons = {}; done.forEach((x) => { reasons[x.answers.reason] = (reasons[x.answers.reason] || 0) + 1; }); const total = done.length; const keys = Object.keys(reasons).sort((a, b) => reasons[b] - reasons[a]);
      const avg = (k) => { const n = done.length; return n ? done.reduce((a, x) => a + ((x.answers.rating || {})[k] || 0), 0) / n : 0; };
      const ret = done.filter((x) => x.answers.wouldReturn).length;
      return h('div', {}, SA.alert('info', 'إحصاءات مجمّعة فقط. أي خلية أقل من ' + (minCell || '{Open}') + ' إجابات تُخفى (الأشرطة المشطوبة) حمايةً للسرية. حد الإخفاء إعداد ' + (minCell ? '(قيمة تجريبية)' : '{Open}') + '.'),
        h('div.sap-x-kpis', {}, SA.kpi('مقابلات تمت', total), SA.kpi('يعودون مستقبلًا', total && !mask(total) ? Math.round(ret / total * 100) + '%' : '—', { sub: 'من ' + total }), SA.kpi('متوسط رضا الأجر', total && !mask(total) ? nf(avg('pay'), 1) + ' / 5' : '—'), SA.kpi('متوسط الإدارة المباشرة', total && !mask(total) ? nf(avg('mgmt'), 1) + ' / 5' : '—')),
        SA.card({ title: 'أسباب الخروج الرئيسية (مجمّعة)' }, keys.length ? h('div', {}, keys.map((k) => h('div.sap-x-bar', { style: { marginBlockEnd: '8px' } }, h('span', { style: { width: '220px' } }, reasonLabel(k)), mask(reasons[k]) ? h('i.is-mask', { style: { width: '60px' }, title: 'مخفي — أقل من الحد' }) : h('i', { style: { width: (reasons[k] / total * 240) + 'px' } }), h('span.num', {}, mask(reasons[k]) ? 'مخفي (< ' + minCell + ')' : reasons[k] + ' (' + Math.round(reasons[k] / total * 100) + '%)')))) : SA.empty({ icon: 'gauge', title: 'بيانات غير كافية' })),
        h('p.t-muted', {}, 'التحليلات الأوسع (دوران 12 شهرًا · الاستنزاف المبكر) في ', h('a', { href: SA.href('hr/reports/RPT-HR-02') }, 'تقرير العدد والدوران'), '. أرقام DEMO.'));
    }
    paintHead(); paint();
    const unsubs = [st.subscribe('clearances', () => { if (!leaving) { paintHead(); if (tab === 'board') paint(); } }), st.subscribe('exitInterviews', () => { if (!leaving && tab !== 'board') paint(); })];
    if (openId) { if (!clById(openId)) root.prepend(SA.alert('warning', 'النموذج ' + openId + ' غير موجود.')); else drawer = openClearance(openId, () => { if (!leaving && SA.route && SA.route.module && SA.route.module.id === 'hr-clearance') { leaving = true; SA.nav('hr/clearance', { replace: true }); } }); }
    return () => { leaving = true; unsubs.forEach((f) => f()); if (drawer) drawer.close(null); };
  }

  function openClearance(id, onClose) {
    const g = () => clById(id);
    return liveDrawer({ size: 'xl', paths: ['clearances', 'exitCases', 'loans', 'custody', 'employees'], gone: () => !g(), onClose, tabs: [{ id: 'items', label: 'بنود الأقسام' }, { id: 'handover', label: 'تسليم المعرفة' }, { id: 'sign', label: 'التواقيع' }],
      title: () => 'إخلاء طرف — ' + (g() ? empName(g().employeeId) : id), subtitle: () => (g() ? g().id + ' · ' + CL_ST[clStatusOf(g())][0] : ''),
      body: (t) => { const cl = g(); syncSources(cl); return t === 'items' ? clItems(cl) : t === 'handover' ? clHandover(cl) : clSign(cl); },
      foot: () => { const cl = g(); return cl ? [SA.btn({ label: 'نموذج A4 / طباعة', icon: 'print', kind: 'ghost', perm: 'hr.documents.view', onClick: () => printClearance(cl) }), h('a.btn.btn-ghost', { href: SA.href('hr/termination/' + cl.caseId) }, 'ملف الإنهاء')] : []; } });
  }
  const clLock = (cl, perm) => gate(perm || 'hr.clearance.edit') || (isConflict(cl.employeeId) ? 'تضارب مصالح — لا تعالج حالتك أو حالة قريبك' : '');
  function clItems(cl) {
    const sd = signedDepts(cl); const od = overdueOf(cl); const w = waivedClear(cl); const ln = loansOf(cl.employeeId);
    return h('div', {}, w ? SA.alert('warning', 'أُغلق الإخلاء بتنازل المدير العام — البنود المفتوحة (' + od.length + ') تحوّلت إلى مهام متأخرة بمالك وموعد.') : null, ln.length ? SA.alert('danger', 'سلف/قروض مفتوحة (' + ln.map((x) => x.id).join('، ') + '): ' + (canSal() ? 'إجمالي المتبقي ' + money(ln.reduce((a, x) => a + x.outstanding, 0)) : 'المبالغ سرية T3') + ' — قراءة فقط من HR-15، وتُسوّى في المخالصة وفق سياسة الاسترداد {Open}.') : null,
      DEPTS.map((d) => { const its = deptItems(cl, d.id); const signed = sd.indexOf(d.id) >= 0; return h('section.sap-x-dept', {}, h('header', {}, h('b', {}, d.name), h('span.t-muted', {}, 'المسؤول: ' + roleLabel(d.role)), signed ? chip('✓ موقَّع', 'success') : its.every(itemClosed) ? chip('جاهز للتوقيع', 'info') : chip('بنود معلّقة', 'warning'), SA.btn({ label: signed ? 'تراجع عن التوقيع' : 'توقيع القسم', kind: signed ? 'ghost' : 'primary', size: 'sm', reason: clLock(cl) || (signed ? '' : its.every(itemClosed) ? '' : 'أغلق بنود القسم أولًا'), onClick: () => (signed ? revokeSign(cl, d) : signDept(cl, d)) })),
        its.map((i) => h('div.sap-x-item', {}, h('div', {}, h('b', {}, i.label), h('small', {}, (i.source === 'custody' ? 'مصدر: عهدة HR-08' : i.source === 'loan' ? 'مصدر: سلف HR-15 (قراءة فقط)' : 'بند يدوي') + (i.note ? ' — ' + i.note : '') + (i.chargeAmount && canSal() ? ' — خصم ' + money(i.chargeAmount) : i.chargeAmount ? ' — خصم (سري T3)' : '')), od.indexOf(i) >= 0 && w ? h('small', { style: { color: 'var(--color-danger)' } }, 'مهمة متأخرة — المالك ' + roleLabel(i.ownerRole)) : null), h('div.sap-x-row', {}, chip(ITEM_ST[i.status][0], ITEM_ST[i.status][1]), SA.btn({ label: 'معالجة', kind: 'ghost', size: 'sm', reason: clLock(cl) || (signed ? 'القسم موقَّع — تراجع عن التوقيع أولًا' : ''), onClick: () => itemDialog(cl, i) }))))); }));
  }
  function itemDialog(cl, i) {
    const opts = i.source === 'loan' ? [['charge', 'مخلّى بخصم من المخالصة (تُسوّى في D3)'], ['na', 'لا ينطبق — بسبب']] : [['cleared', 'مُسلَّم / منجز'], ['charge', 'تالف — خصم'], ['lost', 'مفقود — خصم'], ['na', 'إعفاء / لا ينطبق (بسبب)']];
    const f = { st: SA.form.field({ name: 'st', type: 'radio', label: 'النتيجة', value: i.status === 'open' || i.status === 'blocked' ? opts[0][0] : i.status, options: opts }), amt: SA.form.field({ name: 'amt', type: 'number', label: 'قيمة الاستبدال المعتمدة (ج.م)', value: i.chargeAmount || '', disabled: !canSal(), hint: canSal() ? 'تمر على سقف م.151: ' + (P().damageCapDays || 5) + ' أيام أجر/شهر وإجمالي ' + (P().damageCapMonths || 2) + ' شهرين. المبالغ T3.' : 'يتطلب hr.salary.view لإدخال مبلغ' }), note: SA.form.field({ name: 'note', type: 'textarea', label: 'ملاحظة / دليل', rows: 2, value: i.note || '' }) };
    modalForm({ title: 'معالجة بند: ' + i.label, subtitle: 'SCR-CLR-04', icon: 'check', size: 'md', fields: [f.st, f.amt, f.note], intro: i.locked ? SA.alert('info', 'بند إلزامي لا يُعطَّل.') : null,
      validate: (v) => { if ((v.st === 'na') && !v.note.trim()) { f.note.error('سبب الإعفاء مطلوب'); return 'سبب الإعفاء مطلوب'; } if ((v.st === 'lost' || (v.st === 'charge' && i.source !== 'loan')) && !(+v.amt > 0)) { f.amt.error('أدخل قيمة الاستبدال'); return 'قيمة الاستبدال مطلوبة'; } return null; },
      onSubmit: async (v) => { await SA.api(() => {
        const e = emp(cl.employeeId); const m = monthly(e); const div = P().dayDivisor || 30; let amt = 0; let capNote = '';
        if ((v.st === 'lost' || (v.st === 'charge' && i.source !== 'loan')) && +v.amt > 0) { const capMonth = (P().damageCapDays || 5) * m / div; const prior = cl.items.filter((x) => x !== i && x.status === 'charge').reduce((a, x) => a + (+x.chargeAmount || 0), 0); const allow = Math.max(0, Math.min(capMonth, (P().damageCapMonths || 2) * m) - prior); amt = r2(Math.min(+v.amt, allow)); if (amt < +v.amt) capNote = 'قُصّ للسقف (م.151): المقترح ' + nf(v.amt) + ' والمسموح ' + nf(amt) + ' — الفائض مطالبة لا تُخصم.'; }
        const final = v.st === 'lost' ? 'charge' : v.st; st.update('clearances', (l) => { const x = l.find((y) => y.id === cl.id); const it = x.items.find((y) => y.id === i.id); it.status = final; it.note = [v.note, capNote].filter(Boolean).join(' — '); it.chargeAmount = amt; });
        SA.audit('HR.CLEARANCE.ITEM_UPDATED', { target: { type: 'clearance', id: cl.id, label: i.label }, before: { status: i.status }, after: { status: final } });
        if (amt > 0) { SA.audit('HR.CLEARANCE.ITEM_CHARGE_PROPOSED', { target: { type: 'clearance', id: cl.id, label: i.label }, after: { charge: canSal() ? amt : '••• (سري)' } }); SA.notify({ title: 'اقتراح خصم عهدة: ' + empName(cl.employeeId), body: 'يدخل المخالصة بعد إشعار الموظف (N-52).', level: 'action', to: ['R-11'], link: '#/hr/clearance/' + cl.id }); }
        if (capNote) SA.toast(capNote, 'warn', { ms: 7000 });
      }); SA.toast('تم تحديث البند', 'success'); } });
  }
  function ownerCan(d) { const u = meUser(); return !!u && (u.roleId === d.role); }
  async function signDept(cl, d) {
    const its = deptItems(cl, d.id); if (!its.every(itemClosed)) { SA.toast('أغلق بنود القسم أولًا', 'warn'); return; }
    if (isConflict(cl.employeeId)) { SA.toast('تضارب مصالح', 'warn'); return; }
    const direct = ownerCan(d) || (meUser() && meUser().roleId === 'R-01'); const charged = its.some((i) => i.status === 'charge');
    const f = SA.form.field({ name: 'reason', type: 'textarea', label: direct ? 'ملاحظة (اختياري)' : 'سبب التوقيع بالنيابة (تفويض مكتوب)', required: !direct, rules: direct ? [] : [SA.form.rules.min(8)] });
    modalForm({ title: 'توقيع قسم ' + d.name, subtitle: 'SCR-CLR-03 — بصمة حالة البنود تُحفظ وقت التوقيع', icon: 'check', size: 'md', fields: [f], intro: h('div', {}, SA.alert(direct ? 'info' : 'warning', direct ? 'ستوقّع بصفتك مسؤول القسم. النتيجة: ' + (charged ? 'مخلّى بخصم' : 'مخلّى') + '.' : 'لست مالك هذا القسم (' + roleLabel(d.role) + '). توقيع بالنيابة يُسجَّل كـ«بالنيابة» وبخطورة أعلى — في الإنتاج يوقّع المالك بنفسه.'), SA.kv(its.map((i) => [i.label, chip(ITEM_ST[i.status][0], ITEM_ST[i.status][1])]))), submitLabel: 'توقيع بعد التحقق',
      onSubmit: async (v) => { if (!(await SA.stepUp('policy.change', { force: true }))) return false; await SA.api(() => {
        const snap = hash32(JSON.stringify(its.map((i) => [i.id, i.status, i.chargeAmount]))); st.update('clearances', (l) => { const x = l.find((y) => y.id === cl.id); x.signoffs = (x.signoffs || []).filter((s) => s.dept !== d.id || !s.revoked).concat([{ dept: d.id, by: meUser().id, at: new Date().toISOString(), decision: charged ? 'charged' : 'cleared', hash: snap, proxy: !direct, reason: v.reason }]); });
        SA.audit('HR.CLEARANCE.SIGNED', { target: { type: 'clearance', id: cl.id, label: d.name + ' — ' + empName(cl.employeeId) }, after: { decision: charged ? 'charged' : 'cleared', hash: snap, proxy: !direct }, reason: v.reason, severity: direct ? undefined : 'high', stepUp: true }); syncStatus(cl.id);
      }); SA.toast('وُقِّع قسم ' + d.name, 'success'); } });
  }
  async function revokeSign(cl, d) {
    if (!(SA.can('hr.clearance.edit') && (SA.canSensitive('hr.final_settlement.approve') || SA.canSensitive('hr.final_settlement.calculate')))) { SA.toast('التراجع عن التوقيع لـHR Manager فقط', 'warn'); return; }
    if (cl.status === 'cleared' && ((settlementOf(caseOf(cl.caseId) || {}) || {}).status === 'paid')) { SA.toast('النموذج مقفول والمخالصة صُرفت', 'warn'); return; }
    const ok = await confirmDo({ title: 'التراجع عن توقيع ' + d.name, danger: true, reasonRequired: true, impact: ['يعود النموذج إلى «مخلّى جزئيًا».', 'يُسجَّل بقيمة قبل/بعد.'], confirmLabel: 'تراجع', stepUp: 'policy.change' }, (r) => { st.update('clearances', (l) => { const x = l.find((y) => y.id === cl.id); x.signoffs = (x.signoffs || []).map((s) => (s.dept === d.id && !s.revoked ? Object.assign({}, s, { revoked: true, revokedBy: meUser().id, revokeReason: r.reason }) : s)); x.status = 'partial'; }); SA.audit('HR.CLEARANCE.SIGN_REVOKED', { target: { type: 'clearance', id: cl.id, label: d.name }, reason: r.reason }); syncStatus(cl.id); });
    if (ok) SA.toast('أُلغي التوقيع', 'success');
  }
  function clSign(cl) {
    const rows = (cl.signoffs || []);
    return h('div', {}, SA.alert('info', 'التوقيع الرقمي يحفظ بصمة (hash) لحالة البنود وقت التوقيع. المُوقِّع لا يوقّع عن غيره ولا عن نفسه؛ والنموذج «مخلّى» شرط لانتقال الموظف إلى «منتهي» (BR-TRM-11).'),
      rows.length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['القسم', 'المُوقِّع', 'الوقت', 'النتيجة', 'البصمة', ''].map((x) => h('th', {}, x)))), h('tbody', {}, rows.map((s) => h('tr', {}, h('td', {}, deptOf(s.dept).name), h('td', {}, uname(s.by), s.proxy ? h('span.sap-x-sub', {}, 'بالنيابة — ' + s.reason) : null), h('td', {}, h('span.num', {}, SA.fmt.iso(s.at))), h('td', {}, chip(s.revoked ? 'أُلغي' : s.decision === 'charged' ? 'مخلّى بخصم' : 'مخلّى', s.revoked ? 'neutral' : 'success')), h('td', {}, h('code', {}, s.hash)), h('td', {}, s.proxy ? chip('بالنيابة', 'warning') : null)))))) : SA.empty({ icon: 'check', title: 'لا تواقيع بعد' }));
  }
  function clHandover(cl) {
    const hv = cl.handover || []; const sup = DEPTS.find((d) => d.id === 'sup');
    return h('div', {}, SA.alert('info', 'تسليم المعرفة لا يكتمل بتوقيع المغادر وحده، بل بتأكيد المستلم وتوقيع المشرف (BR-CLR-12). تحذير مهارات HR-19 عند خروج المشغّل الوحيد.'),
      hv.length ? h('ul.sap-x-steps', {}, hv.map((t) => h('li', { class: t.confirmed && t.supSigned ? 'is-done' : '' }, h('span.sap-x-dot', {}, t.confirmed && t.supSigned ? '✓' : '·'), h('span', {}, h('b', {}, t.task), h('span.sap-x-sub', {}, 'المستلم: ' + t.receiverName + ' — ' + (t.confirmed ? 'أكّد الاستلام' : 'لم يؤكد') + ' — ' + (t.supSigned ? 'وقّع المشرف' : 'بانتظار توقيع المشرف'))), h('span.sap-x-row', {}, !t.confirmed ? SA.btn({ label: 'تأكيد المستلم', kind: 'ghost', size: 'sm', reason: clLock(cl), onClick: () => hvStep(cl, t, 'confirmed') }) : null, t.confirmed && !t.supSigned ? SA.btn({ label: 'توقيع المشرف', kind: 'ghost', size: 'sm', reason: clLock(cl), onClick: () => hvStep(cl, t, 'supSigned') }) : null)))) : SA.empty({ icon: 'users', title: 'لا مهام تسليم' }),
      SA.btn({ label: 'إضافة مهمة تسليم', icon: 'plus', kind: 'ghost', reason: clLock(cl), onClick: () => addHandover(cl) }));
  }
  function addHandover(cl) { const f = { t: SA.form.field({ name: 't', label: 'المهمة', required: true }), r: SA.form.field({ name: 'r', label: 'المستلم (من الفريق)', required: true }) }; modalForm({ title: 'مهمة تسليم معرفة', icon: 'users', size: 'sm', fields: [f.t, f.r], onSubmit: async (v) => { await SA.api(() => { st.update('clearances', (l) => { const x = l.find((y) => y.id === cl.id); x.handover = (x.handover || []).concat([{ id: 'HV-' + ((x.handover || []).length + 1), task: v.t, receiverName: v.r, confirmed: false, supSigned: false }]); }); SA.audit('HR.CLEARANCE.ITEM_UPDATED', { target: { type: 'clearance', id: cl.id, label: 'مهمة تسليم: ' + v.t } }); }); SA.toast('أُضيفت', 'success'); } }); }
  async function hvStep(cl, t, key) { await SA.api(() => { st.update('clearances', (l) => { const x = l.find((y) => y.id === cl.id); x.handover.find((y) => y.id === t.id)[key] = true; const hv = x.handover; if (hv.every((y) => y.confirmed && y.supSigned)) { SA.audit('HR.HANDOVER.COMPLETED', { target: { type: 'clearance', id: cl.id, label: 'تسليم معرفة — ' + empName(cl.employeeId) } }); const it = x.items.find((y) => y.id === 'sup-handover'); if (it && it.status === 'open') { it.status = 'cleared'; it.note = 'اكتمل التسليم'; } } }); }); SA.toast('تم', 'success'); }
  function printClearance(cl) {
    if (!SA.hrDocs || !SA.hrDocs.open) { SA.toast('وحدة المستندات غير محمّلة', 'warn'); return; } const c = caseOf(cl.caseId) || {}; const complete = ['cleared', 'cleared_waived'].indexOf(clStatusOf(cl)) >= 0;
    SA.audit('HR.CLEARANCE.PRINTED', { target: { type: 'clearance', id: cl.id, label: empName(cl.employeeId) }, after: { complete } });
    SA.hrDocs.open({ type: 'clearance', docNo: cl.id, employeeId: cl.employeeId, draft: !complete, purpose: 'إخلاء طرف ' + cl.id, refs: { caseId: cl.caseId }, fields: { lastWorkingDay: c.lastWorkingDay || '', status: CL_ST[clStatusOf(cl)][0], items: cl.items.map((i) => ({ dept: deptOf(i.dept).name, label: i.label, status: ITEM_ST[i.status][0], signed: signedDepts(cl).indexOf(i.dept) >= 0 })) } });
  }
  reg({ id: 'hr-clearance', app: 'hr', group: 'hr-exit', title: 'إخلاء الطرف', icon: 'check', route: 'hr/clearance', perm: 'hr.clearance.view', order: 71, desc: 'الإخلاء', badge: () => { ensureInit(); const n = clRows().filter((r) => ['cleared', 'cleared_waived'].indexOf(clStatusOf(r)) < 0 && OPEN_STATES.indexOf((caseOf(r.caseId) || {}).status) >= 0).length; return n || null; }, render: (root, ctx) => simulateState(root, (host) => renderClearance(host, ctx)) });

  /* ═════════════════════════ HR-25 المخالصات النهائية والشهادات ═════════════════════════ */
  const sRows = () => (st.get('settlements') || []).filter((s) => !s.voided);
  const sById = (id) => st.find('settlements', id);
  const caseForS = (s) => caseOf(s.caseId) || (st.get('exitCases') || []).find((c) => c.employeeId === s.employeeId) || null;
  const duesBy = (s) => { const c = caseForS(s); const last = (c && c.lastWorkingDay) || (emp(s.employeeId) || {}).endDate; return last ? addDays(last, P().duesDays || 7) : null; };
  const clearanceGateOk = (c) => { if (!c) return false; const cl = clearanceOf(c); return !!cl && ['cleared', 'cleared_waived'].indexOf(clStatusOf(cl)) >= 0; };
  const moneyCell = (v) => (canSal() ? h('span.num', {}, nf(v)) : lockedCell('T3 — يتطلب hr.salary.view'));
  const sCalcLock = (s) => sensReason('hr.final_settlement.calculate') || (isConflict(s.employeeId) ? 'تضارب مصالح' : '') || (['draft', 'calculated'].indexOf(s.status) < 0 ? 'بعد الاعتماد تُقفل — التصحيح بمخالصة تكميلية (BR-FNL-17)' : '');

  function renderSettlement(root, ctx) {
    ensureInit(); css(); if (pageDeny(root, 'hr.settlement.view')) return;
    const openId = ctx.path[0] || null; ctx.setCrumbs([{ label: 'الإنهاء' }, { label: 'المخالصات النهائية', href: openId ? '#/hr/settlement' : null }].concat(openId ? [{ label: openId }] : []));
    let tab = ctx.params.tab || 'list'; const head = h('div'); const host = h('div'); root.append(head, host); let drawer = null; let leaving = false;
    const tabsC = SA.tabs({ tabs: [{ id: 'list', label: 'المخالصات', icon: 'receipt' }, { id: 'rules', label: 'قواعد المخالصة', icon: 'settings' }, { id: 'certs', label: 'الشهادات', icon: 'doc' }], active: tab, onChange: (t) => { tab = t; paint(); } });
    function paintHead() { SA.clear(head); const r = sRows(); const cnt = (k) => r.filter((s) => s.status === k).length;
      head.append(SA.pageHead({ title: 'المخالصات النهائية', desc: 'حاسبة مخالصة بقواعد قابلة للتعديل — كل سطر له أساس ومصدر وحالة. من يحسب غير من يعتمد غير من يصرف، والصرف بسند صرف من المالية، ثم إقرار الاستلام.', tags: [SA.tag('pending', 'Law · Pending'), SA.tag('new')], actions: [specLink('hr-25')] }),
        h('div.sap-x-kpis', {}, SA.kpi('مسودات/محسوبة', cnt('draft') + cnt('calculated')), SA.kpi('قيد الاعتماد', cnt('in_review')), SA.kpi('بانتظار الصرف', cnt('approved'), { accent: true }), SA.kpi('مصروفة', cnt('paid') + cnt('acknowledged'))), tabsC.el); }
    function paint() { SA.clear(host); tabsC.setActive(tab); host.append(tab === 'list' ? listTab() : tab === 'rules' ? rulesTab() : certsTab()); }
    function listTab() {
      const tbl = SA.table({ rowId: 'id', pageSize: 8, caption: 'المخالصات', rows: sRows, search: { placeholder: 'ابحث باسم الموظف أو رقم المخالصة…', keys: [(s) => empName(s.employeeId), 'id'] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(SETT_STATUS).map((k) => [k, SETT_STATUS[k][0]]) }],
        columns: [{ key: 'id', label: 'المخالصة', sort: true, render: (s) => h('div', {}, h('b.num', {}, s.id), h('span.sap-x-sub', {}, 'v' + (s.calcVersion || 0) + (s.projected ? ' · تقديرية' : ''))) }, { key: 'employeeId', label: 'الموظف', sort: true, value: (s) => empName(s.employeeId), render: (s) => empName(s.employeeId) }, { key: 'status', label: 'الحالة', sort: true, render: (s) => statusChip(SETT_STATUS, s.status) },
          { key: 'net', label: 'الصافي', render: (s) => (s.lines ? moneyCell(s.net) : h('span.sap-dash', {}, '—')) }, { key: 'dues', label: 'مهلة الصرف (7 أيام)', render: (s) => { const d = duesBy(s); if (!d) return h('span.sap-dash', {}, '—'); const left = diffDays(today(), d); return h('div', {}, dnum(d), h('span.sap-x-sub', {}, ['paid', 'acknowledged'].indexOf(s.status) >= 0 ? 'صُرفت' : left < 0 ? 'متأخرة ' + (-left) + ' يوم' : 'متبقٍ ' + left + ' يوم')); } },
          { key: 'gate', label: 'الإخلاء', render: (s) => { const c = caseForS(s); return clearanceGateOk(c) ? chip('مقفول', 'success') : chip('غير مكتمل', 'warning'); } }],
        onRowClick: (s) => SA.nav('hr/settlement/' + s.id), rowActions: (s) => [{ label: 'فتح المخالصة', icon: 'external', onClick: () => SA.nav('hr/settlement/' + s.id) }], empty: { icon: 'receipt', title: 'لا مخالصات', text: 'تُنشأ مسودة عند بدء فترة الإخطار.' } });
      return h('div.card.card-flush.sap-listcard', {}, tbl.el);
    }
    function rulesTab() {
      const rules = settings().rules || []; const canEdit = SA.canSensitive('hr.final_settlement.approve');
      return h('div', {}, SA.alert('warning', 'تعارض مصادر على «تعويض الإنهاء ومكافأة نهاية الخدمة»: كتالوج الدورة يلمّح لوجودها بينما الأبحاث القانونية تحصرها في م.172 ونظام التأمينات. القاعدتان R04/R05 Pending ومغلقتان افتراضيًا ولا تُحسبان آليًا.'),
        SA.card({ title: 'قواعد المخالصة (rule set)', flush: true, tags: [chip('مفعّلة ' + rules.filter((r) => r.active).length, 'success'), chip('مغلقة ' + rules.filter((r) => !r.active).length, 'neutral')] },
          h('div.table-wrap', {}, h('table.table', {},
            h('thead', {}, h('tr', {}, ['الكود', 'القاعدة', 'المصدر', 'الحالة', 'القيمة', 'سريان', 'مفعّلة', ''].map((x) => h('th', {}, x)))),
            h('tbody', {}, rules.map((r) => h('tr', { style: r.status === 'Open' ? { background: 'var(--color-danger-tint)' } : null },
              h('td', {}, h('b.num', {}, r.code)), h('td', {}, r.label), h('td', {}, r.source), h('td', {}, chip(r.status, r.status === 'Open' ? 'danger' : 'warning')), h('td', {}, r.value),
              h('td', {}, r.effectiveFrom ? dnum(r.effectiveFrom) : SA.openValue()), h('td', {}, r.active ? chip('مفعّلة', 'success') : chip('مغلقة', 'neutral')),
              h('td', {}, SA.btn({ label: r.active ? 'إيقاف' : 'تفعيل', kind: 'ghost', size: 'sm', reason: canEdit ? '' : sensReason('hr.final_settlement.approve'), onClick: () => toggleRule(r) }), r.legalReview ? h('span.sap-x-sub', {}, 'مراجعة قانونية') : null))))))),
        SA.card({ title: 'معاملات الحساب (Pending)' }, SA.kv([['مقسوم اليوم', P().dayDivisor + ' (Open)'], ['سقف قسط السلفة', P().loanCapPct + '% من الأجر — م.113'], ['سياسة استرداد الرصيد', P().loanPolicy === 'full' ? 'كامل الرصيد' : 'بحد م.113 والباقي مطالبة (الافتراضي المحافظ) — {Open}'], ['التأمينات (موظف)', P().insurancePct + '% ضمن حدين ' + nf(P().insuranceMin, 0) + ' – ' + nf(P().insuranceMax, 0)], ['مهلة الصرف', P().duesDays + ' أيام — البداية {Open}'], ['الاحتفاظ بالملف', '≥ ' + P().retentionYears + ' سنوات (م.92) — المدة {Open}']])), specLink('fnl-11', 'تصميم SCR-FNL-11'));
    }
    async function toggleRule(r) {
      const on = !r.active; const conflict = r.code === 'R04' || r.code === 'R05'; const lr = SA.form.field({ name: 'ref', label: 'مرجع المراجعة القانونية الموقّعة', required: conflict && on, hint: conflict ? 'مصادر متعارضة — لا تفعيل بدون مراجعة قانونية.' : '' }); const why = SA.form.field({ name: 'why', type: 'textarea', label: 'السبب', required: true, rules: [SA.form.rules.min(5)] });
      modalForm({ title: (on ? 'تفعيل ' : 'إيقاف ') + r.code + ' — ' + r.label, icon: 'settings', size: 'md', danger: conflict && on, fields: [lr, why], intro: SA.alert(conflict && on ? 'danger' : 'warning', 'تغيير قواعد المخالصة يؤثر على كل المخالصات التي تُحسب بعده. القاعدة تُحتسب من لقطة وقت الحساب.'), submitLabel: 'حفظ بعد التحقق', onSubmit: async (v) => { if (!(await SA.stepUp('policy.change', { force: true }))) return false; await SA.api(() => { st.update('settings.hrExit', (s) => { const x = s.rules.find((y) => y.code === r.code); x.active = on; x.effectiveFrom = x.effectiveFrom || today(); s.rulesVersion = (s.rulesVersion || 1) + 1; }); SA.audit('HR.SETTLEMENT.RULE_CHANGED', { target: { type: 'rule', id: r.code, label: r.label }, before: { active: r.active }, after: { active: on, ref: v.ref }, reason: v.why, stepUp: true }); }); SA.toast('تم تعديل القاعدة', 'success'); paint(); } });
    }
    function certsTab() {
      const docs = (st.get('issuedDocs') || []).filter((d) => d.type === 'experience_cert' || d.type === 'salary_cert');
      return h('div', {}, SA.alert('info', 'الشهادات تُصدر من مركز المستندات وتُسجَّل في سجل الإصدار (رقم CER- بتسلسل واحد). الأجر وسبب الإنهاء بطلب الموظف فقط، وتصدر خلال ' + (P().certDays || 15) + ' يومًا من الطلب (م.175).'),
        SA.card({ title: 'شهادات صادرة' }, docs.length ? h('ul.sap-x-steps', {}, docs.map((d) => h('li', {}, h('span.sap-x-dot', {}, '✓'), h('span', {}, h('b.num', {}, d.number), h('span.sap-x-sub', {}, d.templateName + ' — ' + (d.subjectName || '') + ' — ' + SA.fmt.iso(d.issuedAt))), SA.btn({ label: 'عرض', kind: 'ghost', size: 'sm', onClick: () => SA.hrDocs && SA.hrDocs.view(d.id) })))) : SA.empty({ icon: 'doc', title: 'لا شهادات بعد', text: 'أصدرها من ملف المخالصة (تبويب الشهادات) أو من مركز المستندات.' })), h('a.btn.btn-ghost', { href: SA.href('hr/documents') }, 'سجل الإصدار الكامل'));
    }
    paintHead(); paint();
    const unsubs = [st.subscribe('settlements', () => { if (!leaving) { paintHead(); if (tab === 'list') paint(); } })];
    if (openId) { if (!sById(openId)) root.prepend(SA.alert('warning', 'المخالصة ' + openId + ' غير موجودة.')); else drawer = openSettlement(openId, ctx.params.tab, () => { if (!leaving && SA.route && SA.route.module && SA.route.module.id === 'hr-settlement') { leaving = true; SA.nav('hr/settlement', { replace: true }); } }); }
    return () => { leaving = true; unsubs.forEach((f) => f()); if (drawer) drawer.close(null); };
  }

  function openSettlement(id, tab0, onClose) {
    const g = () => sById(id);
    return liveDrawer({ size: 'xl', tab: tab0 || 'calc', paths: ['settlements', 'exitCases', 'clearances', 'approvals', 'loans', 'issuedDocs'], gone: () => !g(), onClose,
      tabs: [{ id: 'calc', label: 'الحساب' }, { id: 'flow', label: 'الاعتماد والصرف' }, { id: 'stmt', label: 'الكشف والإقرار' }, { id: 'certs', label: 'الشهادات' }],
      title: () => 'مخالصة — ' + (g() ? empName(g().employeeId) : id), subtitle: () => { const s = g(); return s ? s.id + ' · ' + SETT_STATUS[s.status][0] + (s.projected ? ' · تقديرية' : '') : ''; },
      body: (t) => { const s = g(); return t === 'calc' ? sCalc(s) : t === 'flow' ? sFlow(s) : t === 'stmt' ? sStmt(s) : sCerts(s); }, foot: () => [] });
  }
  function sCalc(s) {
    const c = caseForS(s); const e = emp(s.employeeId) || {}; const lk = sCalcLock(s); const salOk = canSal(); const due = duesBy(s);
    const projected = !!(c && c.lastWorkingDay && c.lastWorkingDay > today());
    const lines = s.lines || []; const E = lines.filter((l) => l.kind === 'E'), D = lines.filter((l) => l.kind === 'D');
    const row = (l) => h('tr', { class: l.on === false ? 'is-off' : '' }, h('td', {}, h('b.num', {}, l.code)), h('td', {}, l.label, l.on === false ? h('span.sap-x-sub', {}, 'قاعدة مغلقة') : l.note ? h('span.sap-x-sub', {}, l.note) : null, l.overridden ? h('span.sap-x-sub', {}, 'تجاوز يدوي: ' + l.overrideReason + ' (الأصلي ' + (salOk ? nf(l.original) : '•••') + ')') : null), h('td', {}, h('span.num', {}, l.basis)), h('td', {}, l.source), h('td', {}, chip(l.status, l.status === 'Open' ? 'danger' : l.status === 'Approved' ? 'success' : l.status === 'لا ينطبق' ? 'neutral' : 'warning')), h('td.e', {}, l.kind === 'D' ? '−' : '', moneyCell(l.amount)), h('td', {}, l.on === false ? null : SA.btn({ label: 'مصدر/تجاوز', kind: 'ghost', size: 'sm', reason: lk, onClick: () => overrideDialog(s, l) })));
    return h('div', {}, isConflict(s.employeeId) ? SA.alert('danger', 'تضارب مصالح — لا تتولى مخالصة نفسك أو قريبك.') : null, projected || s.projected ? SA.alert('warning', 'مخالصة تقديرية: آخر يوم عمل ' + (c ? c.lastWorkingDay : '—') + ' لم يأتِ بعد (BR-FNL-03). لا اعتماد ولا صرف قبل آخر يوم وقفل الإخلاء.') : null, s.returnedNote ? SA.alert('info', s.returnedNote) : null,
      SA.card({ title: 'مدخلات الحساب' }, SA.kv([['الموظف', empName(s.employeeId) + ' — ' + e.empNo], ['السيناريو', TYPES[s.scenario || (c && c.type) || 'RSG'][0]], ['آخر يوم عمل', c ? dnum(c.lastWorkingDay) : '—'], ['الأجر الشهري الثابت', moneyCell(monthly(e))], ['مهلة صرف المستحقات', due ? h('span', {}, dnum(due), ' (' + dayCount(due) + ')') : '—'], ['إصدار الحساب', s.calcVersion ? 'v' + s.calcVersion + ' — ' + uname(s.calculatedBy) + ' · ' + SA.fmt.rel(s.calculatedAt) : 'لم يُحسب بعد'], ['لقطة القواعد', s.rulesetId ? s.rulesetId + ' (سريان ' + s.rulesetEffectiveFrom + ')' : '—']])),
      s.lines ? SA.card({ title: 'سطور المخالصة', flush: true, tags: [SA.tag('pending', 'كل القواعد Pending')] }, h('div.table-wrap', {}, h('table.sap-x-calc', {}, h('thead', {}, h('tr', {}, ['الكود', 'البند', 'الأساس', 'المصدر', 'الحالة', 'المبلغ (ج.م)', ''].map((x, i) => h('th', { class: i === 5 ? 'e' : '' }, x)))), h('tbody', {}, E.map(row), h('tr.is-total', {}, h('td', { colspan: 5 }, 'إجمالي المستحقات'), h('td.e', {}, moneyCell(s.gross)), h('td')), D.map(row), h('tr.is-total', {}, h('td', { colspan: 5 }, 'إجمالي الخصومات'), h('td.e', {}, moneyCell(s.deductions)), h('td')), h('tr.is-net', {}, h('td', { colspan: 5 }, 'الصافي المستحق للموظف'), h('td.e', {}, salOk ? nf(s.net) : '•••'), h('td'))))),
        salOk ? h('div', { style: { padding: '12px 16px' } }, h('p', {}, 'المبلغ كتابةً: ', h('b', {}, 'فقط ' + tafqit(s.net) + ' لا غير')), s.receivable > 0 ? h('p.sap-x-note', {}, 'مطالبة متبقية على الموظف (غير مخصومة): ' + money(s.receivable) + ' — تُسجَّل في ذمم الموظفين وفق سياسة الاسترداد {Open}.') : null) : null) : SA.empty({ icon: 'receipt', title: 'لم تُحسب المخالصة بعد', text: 'اضغط «احسب» — الحاسبة تقرأ الأجر والإجازات والسلف والعهدة من الأنظمة المرتبطة.' }),
      h('div.sap-x-row', { style: { marginBlockStart: '12px' } }, SA.btn({ label: s.lines ? 'أعد الحساب' : 'احسب المخالصة', icon: 'refresh', kind: 'primary', reason: lk || (c && c.lastWorkingDay ? '' : 'حدّد آخر يوم عمل أولًا (بدء فترة الإخطار)'), onClick: () => doCalculate(s) })), legalNote('كل سطر Pending/Open ولا يُعتمد قبل مراجعة قانونية. التقريب: نصف لأعلى لأقرب قرش لكل سطر (BR-FNL-24). المبالغ لا تُعرض ولا تُسلَّم لمن لا يملك hr.salary.view (BR-FNL-25).'));
  }
  async function doCalculate(s) {
    const lk = sCalcLock(s); if (lk) { SA.toast(lk, 'warn'); return; } const c = caseForS(s); const e = emp(s.employeeId);
    try { await SA.api(() => {
      const fresh = sById(s.id); const calc = calcSettlement(e, c, fresh); const ver = (fresh.calcVersion || 0) + 1;
      st.update('settlements', (l) => { const x = l.find((y) => y.id === s.id); Object.assign(x, calc, { status: 'calculated', calculatedBy: meUser().id, calculatedAt: new Date().toISOString(), calcVersion: ver, scenario: x.scenario || (c && c.type), duesDueBy: duesBy(x), returnedNote: null }); });
      SA.audit('HR.SETTLEMENT.CALCULATED', { target: { type: 'settlement', id: s.id, label: 'مخالصة ' + empName(s.employeeId) }, before: { version: fresh.calcVersion || 0 }, after: { version: ver, status: 'calculated', projected: calc.projected, net: canSal() ? calc.net : '••• (سري)' } });
    }); SA.toast('تم الحساب (إصدار ' + ((s.calcVersion || 0) + 1) + ')', 'success'); } catch (err) { SA.fail(err); }
  }
  function overrideDialog(s, l) {
    const has = !!(s.overrides && s.overrides[l.code]);
    const f = { amt: SA.form.field({ name: 'amt', type: 'number', label: 'المبلغ البديل (ج.م)', required: true, value: l.amount, disabled: !canSal(), hint: 'التقريب لأقرب قرش.' }), reason: SA.form.field({ name: 'reason', type: 'textarea', label: 'سبب التجاوز (إلزامي)', required: true, rules: [SA.form.rules.min(5)], value: has ? s.overrides[l.code].reason : '' }), file: SA.form.field({ name: 'file', label: 'مستند الدعم (اسم الملف)', required: true, value: has ? s.overrides[l.code].file : '' }) };
    modalForm({ title: 'مصدر السطر والتجاوز اليدوي — ' + l.code, subtitle: 'SCR-FNL-03', icon: 'edit', size: 'md', fields: [f.amt, f.reason, f.file], intro: h('div', {}, SA.kv([['البند', l.label], ['الصيغة', h('span.num', {}, l.basis)], ['المصدر', l.source + ' — ' + l.status], ['قابل للخضوع للتأمين/الضريبة', (l.insurable ? 'تأمينات ' : '') + (l.taxable ? 'ضريبة' : '') || '—']]), SA.alert('warning', 'التجاوز يحتاج سببًا ومستندًا وتحققًا ثانيًا من HR Manager عند الاعتماد، ويُسجَّل قبل/بعد (BR-FNL-16).')), submitLabel: 'تطبيق التجاوز',
      onSubmit: async (v) => { await SA.api(() => { st.update('settlements', (list) => { const x = list.find((y) => y.id === s.id); x.overrides = x.overrides || {}; x.overrides[l.code] = { amount: +v.amt, reason: v.reason, file: v.file, by: meUser().id }; }); const fresh = sById(s.id); const calc = calcSettlement(emp(s.employeeId), caseForS(s), fresh); st.update('settlements', (list) => { Object.assign(list.find((y) => y.id === s.id), calc, { calculatedBy: meUser().id, calculatedAt: new Date().toISOString(), calcVersion: (fresh.calcVersion || 0) + 1, status: 'calculated' }); }); SA.audit('HR.SETTLEMENT.LINE_OVERRIDDEN', { target: { type: 'settlement', id: s.id, label: l.code + ' — ' + l.label }, before: { amount: canSal() ? l.amount : '•••' }, after: { amount: canSal() ? r2(+v.amt) : '•••' }, reason: v.reason }); }); SA.toast('طُبّق التجاوز وأُعيد الحساب', 'success'); } });
  }
  function sFlow(s) {
    const c = caseForS(s); const ap = s.approvalId ? (st.get('approvals') || []).find((a) => a.id === s.approvalId) : null; const gateOk = clearanceGateOk(c); const projected = !!(c && c.lastWorkingDay && c.lastWorkingDay > today());
    const steps = [['الحساب (maker)', s.calculatedBy ? 'done' : 'todo', s.calculatedBy ? uname(s.calculatedBy) : 'hr.final_settlement.calculate'], ['مراجعة HR Manager', ap ? (ap.chain[0].status === 'approved' ? 'done' : ap.chain[0].status === 'rejected' ? 'bad' : 'now') : 'todo', ap && ap.chain[0].decidedBy ? uname(ap.chain[0].decidedBy) : 'المراجع ≠ الحاسب'], ['الاعتماد المالي', ap ? ((ap.chain[1] || {}).status === 'approved' ? 'done' : (ap.chain[1] || {}).status === 'rejected' ? 'bad' : ap.chain[0].status === 'approved' ? 'now' : 'todo') : 'todo', ap && ap.chain[1] && ap.chain[1].decidedBy ? uname(ap.chain[1].decidedBy) : 'المالية'], ['الصرف بسند صرف', s.status === 'paid' || s.status === 'acknowledged' ? 'done' : s.status === 'approved' ? 'now' : 'todo', s.paidBy ? uname(s.paidBy) + ' · ' + s.voucherNo : 'hr.final_settlement.pay — الدافع ≠ الحاسب ≠ المعتمد']];
    const submitLock = sensReason('hr.final_settlement.calculate') || (s.status !== 'calculated' ? (s.status === 'draft' ? 'احسب المخالصة أولًا' : 'أُرسلت بالفعل') : '') || (projected ? 'المخالصة تقديرية — قبل آخر يوم عمل' : '') || (gateOk ? '' : 'لا اعتماد قبل قفل الإخلاء أو تنازل المدير العام (BR-FNL-03)') || (isConflict(s.employeeId) ? 'تضارب مصالح' : '');
    const payLock = sensReason('hr.final_settlement.pay') || (s.status !== 'approved' ? 'تُصرف بعد الاعتماد' : '') || (gateOk ? '' : 'الإخلاء غير مقفول') || (s.calculatedBy === meUser().id ? 'فصل المهام: الحاسب لا يصرف' : '') || ((s.approvedBy || []).indexOf(meUser().id) >= 0 ? 'فصل المهام: المعتمِد لا يصرف' : '') || (isConflict(s.employeeId) ? 'تضارب مصالح' : '');
    return h('div', {}, h('ul.sap-x-steps', {}, steps.map((x, i) => h('li', { class: x[1] === 'done' ? 'is-done' : x[1] === 'bad' ? 'is-bad' : x[1] === 'now' ? 'is-warn' : '' }, h('span.sap-x-dot', {}, x[1] === 'done' ? '✓' : i + 1), h('span', {}, h('b', {}, x[0]), h('span.sap-x-sub', {}, x[2])), chip(x[1] === 'done' ? 'تم' : x[1] === 'now' ? 'الآن' : x[1] === 'bad' ? 'رُفض' : 'لاحقًا', x[1] === 'done' ? 'success' : x[1] === 'now' ? 'warning' : x[1] === 'bad' ? 'danger' : 'neutral')))),
      ap ? SA.kv([['طلب الاعتماد', h('a', { href: SA.link.approval(ap.id) }, ap.id + ' — فتح في الصندوق')], ['حالته', SA.statusChip('approval', ap.status)]]) : null,
      s.status === 'paid' || s.status === 'acknowledged' ? SA.kv([['سند الصرف', s.voucherNo], ['الدافع', uname(s.paidBy)], ['تاريخ الصرف', dnum(s.paidOn)], ['الطريقة', s.payMethod === 'cash' ? 'نقدًا' : 'تحويل بنكي (حساب ••••' + ((emp(s.employeeId) || {}).bankLast4 || '') + ')']]) : null,
      h('div.sap-x-row', { style: { marginBlockStart: '12px' } }, SA.btn({ label: 'إرسال للاعتماد', icon: 'send', kind: 'primary', reason: submitLock, onClick: () => submitSettlement(s) }), SA.btn({ label: 'صرف بسند صرف', icon: 'coins', kind: 'accent', reason: payLock, onClick: () => paySettlement(s) })),
      legalNote('فصل المهام إلزامي: من يحسب ≠ من يعتمد ≠ من يصرف. بعد «معتمدة» لا تعديل إلا بمخالصة تكميلية. «مصروفة» تأتي من حدث سند الصرف وليس بزر يدوي في الإنتاج (BR-FNL-18) — هنا يُنفَّذ الصرف بمحاكاة سند PV-.'));
  }
  async function submitSettlement(s) {
    const lk = sensReason('hr.final_settlement.calculate'); if (lk) { SA.toast(lk, 'warn'); return; } const c = caseForS(s); const chain = ['R-11', 'R-07'].concat(settings().gmNetThreshold != null && s.net >= settings().gmNetThreshold ? ['R-02'] : []);
    const ok = await confirmDo({ title: 'إرسال المخالصة للاعتماد', text: 'تُرسل لصندوق الاعتمادات المشترك. بعد الإرسال تُقفل الأسطر ولا تعدّل إلا بإعادة الحساب بعد الرفض.', impact: ['السلسلة: ' + chain.map(roleLabel).join(' ← '), 'مبلغ الصافي لا يظهر في الصندوق لمن لا يملك hr.salary.view.', 'أنت الحاسب فلا تعتمد ولا تصرف.'], confirmLabel: 'إرسال', stepUp: 'approval.decide' }, () => {
      const ap = SA.requestApproval({ type: 'final_settlement', area: 'hr', title: 'مخالصة نهائية ' + s.id + ' — ' + empName(s.employeeId), chain, amount: null, context: [['الموظف', empName(s.employeeId) + ' (' + (emp(s.employeeId) || {}).empNo + ')'], ['سبب الإنهاء', canT4() ? reasonLabel((c || {}).reasonCode) : 'محفوظ (T4)'], ['آخر يوم عمل', (c || {}).lastWorkingDay || '—'], ['الحاسب', meUser().name], ['ملاحظة', 'من يحسب المخالصة غير من يصرفها']], ref: { type: 'final_settlement', id: s.id } });
      st.patch('settlements', s.id, { status: 'in_review', approvalId: ap.id, submittedBy: meUser().id, submittedAt: new Date().toISOString() }); SA.audit('HR.SETTLEMENT.SUBMITTED', { target: { type: 'settlement', id: s.id, label: 'مخالصة ' + empName(s.employeeId) }, after: { approval: ap.id, status: 'in_review' } });
    }); if (ok) SA.toast('أُرسلت للاعتماد — تابعها من صندوق الاعتمادات', 'success');
  }
  async function paySettlement(s) {
    const e = emp(s.employeeId) || {}; const f = { m: SA.form.field({ name: 'm', type: 'radio', label: 'طريقة الدفع (HR-16)', value: 'bank', options: [['bank', 'تحويل بنكي — حساب ••••' + (e.bankLast4 || '')], ['cash', 'نقدًا']] }), ref: SA.form.field({ name: 'ref', label: 'مرجع التحويل / الإيصال', required: true }) };
    modalForm({ title: 'صرف المخالصة بسند صرف', subtitle: 'SCR-FNL-05 — ' + s.id, icon: 'coins', size: 'md', danger: true, fields: [f.m, f.ref], intro: SA.alert('warning', 'عملية مالية حرجة. سيُحجز رقم سند PV- جديد بنفس الصافي ويُسجَّل باسمك. لا يمكن التراجع.'), submitLabel: 'تأكيد الصرف',
      onSubmit: async (v) => { if (!(await SA.stepUp('voucher.execute', { force: true }))) return false; await SA.api(() => { const pv = nextNumber('PV'); st.patch('settlements', s.id, { status: 'paid', paidBy: meUser().id, paidOn: today(), voucherNo: pv, payMethod: v.m, payRef: v.ref }); SA.audit('HR.SETTLEMENT.PAID', { target: { type: 'settlement', id: s.id, label: 'مخالصة ' + empName(s.employeeId) + ' — ' + pv }, after: { status: 'paid', voucher: pv, net: canSal() ? s.net : '••• (سري)', late: duesBy(s) && today() > duesBy(s) } }); SA.notify({ title: 'صُرفت المخالصة ' + s.id, body: 'سند ' + pv + ' — بانتظار إقرار الاستلام من الموظف.', level: 'info', to: ['R-11', 'R-13'], link: '#/hr/settlement/' + s.id }); }); SA.toast('صُرفت المخالصة بسند ' + (sById(s.id) || {}).voucherNo, 'success'); } });
  }
  function sStmt(s) {
    const salOk = canSal(); const c = caseForS(s); const ok = ['approved', 'paid', 'acknowledged'].indexOf(s.status) >= 0;
    return h('div', {}, SA.card({ title: 'كشف المخالصة النهائية (A4)' }, h('p.t-muted', {}, 'استحقاقات وخصومات بأساسها ومصدرها، الصافي بالأرقام والحروف، المطالبة المتبقية، وإقرار الموظف بنص إبراء Pending، وخمس خانات توقيع.'), h('div.sap-x-row', {}, SA.btn({ label: 'معاينة / طباعة الكشف', icon: 'print', kind: 'primary', reason: !s.lines ? 'احسب المخالصة أولًا' : !salOk ? 'المبالغ سرية — يتطلب hr.salary.view' : '', onClick: () => openStatement(s) }), ok ? null : chip('مسودة — علامة مائية', 'warning'))),
      SA.card({ title: 'إقرار الاستلام' }, s.ack ? SA.kv([['النتيجة', s.ack.type === 'reserve' ? 'استلمت مع التحفظ' : 'استلمت كاملاً'], ['الطريقة', s.ack.method === 'OTP' ? 'OTP' : 'حضوري'], ['الوقت', h('span.num', {}, SA.fmt.iso(s.ack.at))], s.ack.text ? ['نص التحفظ', s.ack.text] : null]) : h('div', {}, SA.alert('warning', 'نص الإبراء [Pending] من المستشار القانوني — لا يُعد إبراءً قبل اعتماده. خيار «مع التحفظ» يسجّل النص ويحوّل لـLegal ولا يوقف الصرف.'), SA.btn({ label: 'تسجيل إقرار الاستلام', icon: 'check', kind: 'primary', reason: s.status !== 'paid' ? (s.status === 'acknowledged' ? '' : 'يُسجَّل بعد الصرف') : sensReason('hr.final_settlement.calculate') || '', onClick: () => ackDialog(s) }))));
  }
  function openStatement(s) {
    if (!SA.hrDocs || !SA.hrDocs.open) { SA.toast('وحدة المستندات غير محمّلة', 'warn'); return; } const c = caseForS(s); const ok = ['approved', 'paid', 'acknowledged'].indexOf(s.status) >= 0;
    SA.hrDocs.open({ type: 'final_settlement', docNo: s.id, employeeId: s.employeeId, draft: !ok, purpose: 'مخالصة نهائية ' + s.id, refs: { caseId: s.caseId, settlementId: s.id }, fields: { lastWorkingDay: (c || {}).lastWorkingDay || '', scenario: TYPES[(c || {}).type || 'RSG'][0], lines: (s.lines || []).filter((l) => l.on !== false || l.amount), gross: s.gross, deductions: s.deductions, net: s.net, receivable: s.receivable, words: 'فقط ' + tafqit(s.net) + ' لا غير', projected: !!s.projected, voucherNo: s.voucherNo || '', calcBy: uname(s.calculatedBy), approvedBy: (s.approvedBy || []).map(uname).join('، '), paidBy: s.paidBy ? uname(s.paidBy) : '', rules: s.rulesetId } });
  }
  function ackDialog(s) {
    const f = { type: SA.form.field({ name: 'type', type: 'radio', label: 'إقرار الموظف', value: 'full', options: [['full', 'استلمت مستحقاتي كاملةً'], ['reserve', 'استلمت مع التحفظ (يُسجَّل النص ويُحال للشؤون القانونية)']] }), text: SA.form.field({ name: 'text', type: 'textarea', label: 'نص التحفظ (عند الاختيار)', rows: 2 }), m: SA.form.field({ name: 'm', type: 'radio', label: 'طريقة التوقيع', value: 'OTP', options: [['OTP', 'OTP على جوال الموظف'], ['IN', 'حضوري']] }), otp: SA.form.field({ name: 'otp', label: 'كود OTP (تجريبي 123456)', hint: 'مطلوب عند اختيار OTP.' }) };
    modalForm({ title: 'إقرار استلام المخالصة', subtitle: 'SCR-FNL-07 — ' + empName(s.employeeId), icon: 'check', size: 'md', fields: Object.keys(f).map((k) => f[k]), intro: SA.alert('warning', 'نص الإبراء [Pending] — لا يُعد إبراءً نهائيًا قبل اعتماد المستشار القانوني.'),
      validate: (v) => { if (v.type === 'reserve' && v.text.trim().length < 5) { f.text.error('اكتب نص التحفظ'); return 'نص التحفظ مطلوب'; } if (v.m === 'OTP' && v.otp.trim() !== '123456') { f.otp.error('كود غير صحيح'); return 'كود OTP غير صحيح'; } return null; },
      onSubmit: async (v) => { await SA.api(() => { st.patch('settlements', s.id, { status: 'acknowledged', ack: { type: v.type, text: v.type === 'reserve' ? v.text : '', method: v.m === 'OTP' ? 'OTP' : 'IN', at: new Date().toISOString(), by: meUser().id } }); SA.audit('HR.SETTLEMENT.ACKNOWLEDGED', { target: { type: 'settlement', id: s.id, label: 'مخالصة ' + empName(s.employeeId) }, after: { type: v.type, method: v.m } }); if (v.type === 'reserve') SA.notify({ title: 'استلام مخالصة مع تحفظ', body: empName(s.employeeId) + ' — أُحيل للشؤون القانونية.', level: 'action', to: ['R-11'], link: '#/hr/settlement/' + s.id }); }); SA.toast('سُجّل إقرار الاستلام', 'success'); } });
  }
  function sCerts(s) {
    const issued = (st.get('issuedDocs') || []).filter((d) => d.employeeId === s.employeeId && (d.type === 'experience_cert' || d.type === 'salary_cert'));
    const lk = SA.can('hr.documents.issue') ? '' : 'ليست من صلاحياتك (hr.documents.issue)';
    return h('div', {}, SA.alert('info', 'شهادة الخبرة مجانية وبصياغة محايدة تتضمن تاريخ البدء والانتهاء ونوع العمل، وتصدر خلال ' + (P().certDays || 15) + ' يومًا من الطلب (م.175). الأجر وسبب الإنهاء بطلب الموظف فقط. شهادة المرتب بغرض وجهة مسجّلين.'),
      h('div.sap-x-grid2', {}, SA.card({ title: 'شهادة خبرة' }, h('p.t-muted', {}, 'DOC-HR-45 · CER-'), SA.btn({ label: 'إعداد وإصدار شهادة خبرة', icon: 'doc', kind: 'primary', reason: lk, onClick: () => certDialog(s, 'experience_cert') })), SA.card({ title: 'شهادة مرتب' }, h('p.t-muted', {}, 'DOC-HR-46 · CER- · ثنائية اللغة'), SA.btn({ label: 'إعداد وإصدار شهادة مرتب', icon: 'doc', kind: 'primary', reason: lk, onClick: () => certDialog(s, 'salary_cert') }))),
      SA.card({ title: 'شهادات صادرة لهذا الموظف' }, issued.length ? h('ul.sap-x-steps', {}, issued.map((d) => h('li', {}, h('span.sap-x-dot', {}, '✓'), h('span', {}, h('b.num', {}, d.number), h('span.sap-x-sub', {}, d.templateName + ' — ' + SA.fmt.iso(d.issuedAt) + ' — ' + (d.status === 'issued' ? 'صادرة' : d.status === 'pending_approval' ? 'بانتظار اعتماد HR Manager' : d.status))), SA.btn({ label: 'عرض', kind: 'ghost', size: 'sm', onClick: () => SA.hrDocs && SA.hrDocs.view(d.id) })))) : SA.empty({ icon: 'doc', title: 'لا شهادات صادرة' })));
  }
  function certDialog(s, type) {
    if (!SA.hrDocs || !SA.hrDocs.issue) { SA.toast('وحدة المستندات غير محمّلة', 'warn'); return; } const exp = type === 'experience_cert'; const e = emp(s.employeeId) || {};
    const f = { purpose: SA.form.field({ name: 'purpose', label: 'الغرض', required: true, value: exp ? 'تقديمها لجهة عمل جديدة' : '' }), addr: SA.form.field({ name: 'addr', label: 'الجهة الموجّه إليها', required: !exp, value: exp ? 'إلى من يهمه الأمر' : '' }), req: SA.form.field({ name: 'req', type: 'date', label: 'تاريخ طلب الموظف (يبدأ منه عدّاد ' + (P().certDays || 15) + ' يومًا)', value: today() }), sal: SA.form.field({ name: 'sal', type: 'checkbox', label: 'إظهار الراتب — بطلب الموظف ' + (canSal() ? '' : '(يتطلب hr.salary.view)'), value: false, disabled: !canSal() }), rsn: exp ? SA.form.field({ name: 'rsn', type: 'checkbox', label: 'إظهار سبب الإنهاء — بطلب الموظف فقط (T4)', value: false, disabled: !canT4() }) : null };
    modalForm({ title: exp ? 'إصدار شهادة خبرة' : 'إصدار شهادة مرتب', subtitle: empName(s.employeeId) + ' — SCR-FNL-0' + (exp ? '8' : '9'), icon: 'doc', size: 'md', fields: [f.purpose, f.addr, f.req, f.sal, f.rsn], submitLabel: 'إعداد الشهادة', intro: SA.alert('info', 'الصياغة محايدة بلا أي حكم سلبي. يظهر الراتب أو السبب فقط بطلب الموظف المسجّل.'),
      onSubmit: async (v) => { const rec = await SA.api(() => SA.hrDocs.issue({ type, employeeId: s.employeeId, purpose: v.purpose, addressee: v.addr, fields: { withSalary: !!v.sal, withReason: !!v.rsn, requestedOn: v.req, from: e.hireDate, to: (caseForS(s) || {}).lastWorkingDay || e.endDate || '', position: (st.find('positions', e.positionId) || {}).title || '' }, refs: { settlementId: s.id } })); if (!rec) return false; SA.audit('HR.CERT.ISSUED', { target: { type: 'document', id: rec.number, label: (exp ? 'شهادة خبرة' : 'شهادة مرتب') + ' — ' + empName(s.employeeId) }, after: { status: rec.status, purpose: v.purpose } }); SA.toast('أُعدّت الشهادة ' + rec.number + (rec.status === 'pending_approval' ? ' — بانتظار اعتماد HR Manager' : ' — صدرت'), 'success'); SA.hrDocs.view(rec.id); } });
  }
  reg({ id: 'hr-settlement', app: 'hr', group: 'hr-exit', title: 'المخالصات النهائية', icon: 'receipt', route: 'hr/settlement', perm: 'hr.settlement.view', order: 72, desc: 'المخالصة', badge: () => { ensureInit(); const n = sRows().filter((s) => s.status === 'approved').length; return n || null; }, render: (root, ctx) => simulateState(root, (host) => renderSettlement(host, ctx)) });

  /* ═════════════════════════ HR-26 الأرشيف وإعادة التعيين (الخريجون) ═════════════════════════ */
  const ELIG = { pending_review: ['قيد المراجعة', 'neutral'], eligible: ['مؤهّل', 'success'], conditional: ['مشروط', 'warning'], ineligible: ['غير مؤهل', 'danger'] };
  const ELIG_REASONS = [['resigned_good', 'استقالة عادية وأداء جيد'], ['contract_end', 'انتهاء عقد محدد المدة'], ['probation_fail', 'عدم اجتياز فترة التجربة'], ['performance', 'أداء متدنٍّ موثّق'], ['attendance', 'انقطاع/غياب موثّق'], ['integrity', 'مخالفة نزاهة موثّقة']];
  const BL_REASONS = [['document_forgery', 'تزوير مستندات (موثّق)'], ['theft', 'سرقة بحكم/محضر موثّق'], ['violence', 'اعتداء موثّق'], ['fraud', 'احتيال مالي موثّق']];
  const PROTECTED = ['نقابي', 'نقابة', 'شكوى', 'تظلم', 'حمل', 'حامل', 'زواج', 'متزوج', 'ديانة', 'دين ', 'سياسي', 'جنس', 'مرض'];
  const protectedHit = (t) => PROTECTED.find((k) => String(t || '').indexOf(k) >= 0);
  function alumniList() {
    const flags = st.get('alumniFlags') || []; const out = [];
    (st.get('employees') || []).filter((e) => e.status === 'terminated').forEach((e) => { const f = flags.find((x) => x.employeeId === e.id) || { eligibility: 'pending_review', blacklist: { status: 'none' }, legalHold: false, talentConsent: false }; const c = (st.get('exitCases') || []).filter((x) => x.employeeId === e.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
      out.push({ key: e.id, kind: 'emp', name: e.name, empId: e.id, lastPosition: (st.find('positions', e.positionId) || {}).title || '—', departmentId: e.departmentId, hiredOn: e.hireDate, exitedOn: e.endDate, exitType: c ? c.type : null, caseId: c ? c.id : null, positionId: e.positionId, eligibility: f.eligibility, reasonCode: f.reasonCode, note: f.note, blacklist: f.blacklist || { status: 'none' }, legalHold: !!f.legalHold, talentConsent: !!f.talentConsent }); });
    (st.get('alumniArchive') || []).forEach((a) => out.push({ key: a.id, kind: 'arch', name: a.anonymised ? 'مُخفى الهوية (' + a.id + ')' : a.name, lastPosition: a.lastPosition, departmentId: a.departmentId, hiredOn: a.hiredOn, exitedOn: a.exitedOn, exitType: a.exitType, caseId: null, eligibility: a.eligibility, reasonCode: a.reasonCode, note: a.note, blacklist: a.blacklist || { status: 'none' }, legalHold: !!a.legalHold, talentConsent: !!a.talentConsent, anonymised: !!a.anonymised }));
    return out.sort((a, b) => String(b.exitedOn || '').localeCompare(String(a.exitedOn || '')));
  }
  const alumnusOf = (key) => alumniList().find((a) => a.key === key) || null;
  function setFlag(a, patch) { if (a.kind === 'arch') st.patch('alumniArchive', a.key, patch); else st.update('alumniFlags', (l) => { let x = l.find((y) => y.employeeId === a.key); if (!x) { x = { employeeId: a.key, eligibility: 'pending_review', blacklist: { status: 'none' }, legalHold: false, talentConsent: false }; l.push(x); } Object.assign(x, patch); }); }
  const BLS = { none: null, proposed: ['اقتراح بانتظار GM', 'warning'], approved: ['قائمة سوداء', 'danger'], under_review: ['تحت المراجعة', 'warning'], removed: ['رُفعت', 'neutral'] };
  const arcLock = (perm) => gate(perm || 'hr.archive.view');

  function renderArchive(root, ctx) {
    ensureInit(); css(); if (pageDeny(root, 'hr.archive.view')) return;
    const openKey = ctx.path[0] && ctx.path[0] !== 'blacklist' ? ctx.path[0] : null; ctx.setCrumbs([{ label: 'الإنهاء' }, { label: 'الأرشيف', href: openKey ? '#/hr/archive' : null }].concat(openKey ? [{ label: openKey }] : []));
    let tab = ctx.path[0] === 'blacklist' ? 'blacklist' : ctx.params.tab || 'dir'; const head = h('div'); const host = h('div'); root.append(head, host); let drawer = null; let leaving = false;
    const tabsC = SA.tabs({ tabs: [{ id: 'dir', label: 'دليل الخريجين', icon: 'users' }, { id: 'blacklist', label: 'القائمة السوداء (T4)', icon: 'alert' }, { id: 'retention', label: 'الاحتفاظ والأرشفة', icon: 'inbox' }, { id: 'analytics', label: 'تحليلات الدوران', icon: 'gauge' }], active: tab, onChange: (t) => { tab = t; paint(); } });
    function paintHead() { const l = alumniList(); SA.clear(head); head.append(SA.pageHead({ title: 'الأرشيف وإعادة التعيين', desc: 'دليل الخريجين (T2 بلا أي حقل مالي أو تأديبي)، أهلية إعادة التعيين بسبب موثّق، القائمة السوداء كقرار استثنائي، وسياسة الاحتفاظ والأرشفة {Open}.', tags: [SA.tag('new'), SA.tag('open', 'الاحتفاظ {Open}')], actions: [specLink('hr-26')] }),
      h('div.sap-x-kpis', {}, SA.kpi('خريجون', l.length), SA.kpi('مؤهلون لإعادة التعيين', l.filter((a) => a.eligibility === 'eligible').length), SA.kpi('قيد المراجعة', l.filter((a) => a.eligibility === 'pending_review').length), SA.kpi('قائمة سوداء', l.filter((a) => a.blacklist.status === 'approved').length, { accent: true })), tabsC.el); }
    function paint() { SA.clear(host); tabsC.setActive(tab); host.append(tab === 'dir' ? dirTab() : tab === 'blacklist' ? blTab() : tab === 'retention' ? retTab() : anaTab()); }
    function dirTab() {
      const t4 = canT4();
      const tbl = SA.table({ rowId: 'key', pageSize: 8, caption: 'دليل الخريجين', rows: alumniList, search: { placeholder: 'ابحث بالاسم أو الوظيفة…', keys: ['name', 'lastPosition'] }, filters: [{ key: 'eligibility', label: 'الأهلية', options: Object.keys(ELIG).map((k) => [k, ELIG[k][0]]) }, { key: 'exitType', label: 'نوع الخروج', options: Object.keys(TYPES).map((k) => [k, TYPES[k][0].replace(/ \(.*/, '')]) }],
        columns: [{ key: 'name', label: 'الخريج', sort: true, render: (a) => h('div', {}, h('b', {}, a.name), h('span.sap-x-sub', {}, a.lastPosition + ' · ' + dept(a.departmentId))) }, { key: 'hiredOn', label: 'التعيين', sort: true, render: (a) => dnum(a.hiredOn) }, { key: 'exitedOn', label: 'الخروج', sort: true, render: (a) => dnum(a.exitedOn) }, { key: 'exitType', label: 'النوع', render: (a) => (a.exitType ? chip(TYPES[a.exitType][0].replace(/ \(.*/, ''), TYPES[a.exitType][2]) : h('span.sap-dash', {}, '—')) },
          { key: 'eligibility', label: 'الأهلية', sort: true, render: (a) => h('span', {}, chip(ELIG[a.eligibility][0], ELIG[a.eligibility][1]), ' ', BLS[a.blacklist.status] ? chip(BLS[a.blacklist.status][0], BLS[a.blacklist.status][1]) : null) }, { key: 'reason', label: 'السبب (T4)', render: (a) => (t4 ? (ELIG_REASONS.find((r) => r[0] === a.reasonCode) || [0, a.reasonCode || '—'])[1] : lockedCell('T4 — hr.discipline.view')) }],
        onRowClick: (a) => SA.nav('hr/archive/' + a.key), rowActions: (a) => [{ label: 'ملف الخريج', icon: 'external', onClick: () => SA.nav('hr/archive/' + a.key) }, { label: 'تعديل الأهلية', icon: 'edit', disabled: t4 ? '' : 'T4 — يتطلب hr.discipline.view', onClick: () => eligDialog(a) }, { label: 'إعادة التعيين', icon: 'userplus', onClick: () => rehireWizard(a) }],
        toolbar: [SA.btn({ label: 'تصدير الدليل (CSV)', icon: 'download', kind: 'ghost', reason: SA.can('hr.employees.export') ? '' : 'يتطلب hr.employees.export', onClick: exportDir })], empty: { icon: 'users', title: 'لا خريجون بعد', text: 'يُنشأ سجل الخريج عند إغلاق حالة إنهاء.' } });
      return h('div.card.card-flush.sap-listcard', {}, tbl.el);
    }
    async function exportDir() { const ok = await confirmDo({ title: 'تصدير دليل الخريجين', text: 'بيانات T2 فقط (بدون مالي أو تأديبي). التصدير مسجّل ويُنبَّه عن التصدير الجماعي.', reasonRequired: true, confirmLabel: 'تصدير' }, (r) => { const rows = [['الاسم', 'آخر وظيفة', 'القسم', 'تاريخ التعيين', 'تاريخ الخروج', 'نوع الخروج', 'الأهلية']].concat(alumniList().filter((a) => !a.anonymised).map((a) => [a.name, a.lastPosition, dept(a.departmentId), a.hiredOn, a.exitedOn, a.exitType ? TYPES[a.exitType][0] : '', ELIG[a.eligibility][0]])); SA.download('alumni-directory.csv', SA.csv(rows), 'text/csv'); SA.audit('HR.ALUMNI.EXPORTED', { target: { type: 'report', id: 'alumni', label: 'دليل الخريجين' }, reason: r.reason, after: { rows: rows.length - 1 } }); }); if (ok) SA.toast('تم التصدير', 'success'); }
    function blTab() {
      const list = alumniList().filter((a) => a.blacklist.status !== 'none' && a.blacklist.status !== 'removed'); if (!canT4()) return SA.denied({ perm: 'hr.discipline.view', title: 'سجل القائمة السوداء T4', text: 'يتطلب صلاحية T4 (hr.discipline.view).', home: false });
      return h('div', {}, SA.alert('warning', 'قرار استثنائي: يقترحه HR Manager ويعتمده المدير العام بسبب موثّق من قائمة معتمدة، ولا يُبنى على استقالة عادية أو سبب محمي (م.165). المراجعة الدورية والاعتراض {Open}.'),
        SA.card({ title: 'السجل', flush: true }, list.length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الخريج', 'الحالة', 'السبب', 'المرجع', 'اقتراح', 'اعتماد', 'مراجعة', ''].map((x) => h('th', {}, x)))), h('tbody', {}, list.map((a) => h('tr', {}, h('td', {}, h('b', {}, a.name)), h('td', {}, chip(BLS[a.blacklist.status][0], BLS[a.blacklist.status][1])), h('td', {}, (BL_REASONS.find((r) => r[0] === a.blacklist.reasonCode) || [0, a.blacklist.reasonCode])[1]), h('td', {}, a.blacklist.evidenceRef), h('td', {}, uname(a.blacklist.proposedBy)), h('td', {}, a.blacklist.approvedBy ? uname(a.blacklist.approvedBy) : '—'), h('td', {}, a.blacklist.reviewOn ? dnum(a.blacklist.reviewOn) : SA.openValue()), h('td', {}, a.blacklist.status === 'approved' ? SA.btn({ label: 'رفع', kind: 'ghost', size: 'sm', reason: isGM() ? '' : 'المدير العام فقط', onClick: () => removeBlacklist(a) }) : null)))))) : SA.empty({ icon: 'checkcircle', title: 'لا إدراجات', text: 'القائمة السوداء فارغة — وهذا هو الأصل.' })));
    }
    function retTab() {
      const ar = st.get('settings.hrArchive') || {}; const l = alumniList(); const due = ar.retentionYears == null ? [] : l.filter((a) => a.kind === 'arch' && !a.anonymised && !a.legalHold && a.exitedOn && addMonths(a.exitedOn, 12 * ar.retentionYears) < today());
      return h('div', {}, SA.alert('info', 'الاحتفاظ بملف الموظف والمخالصة لا يقل عن ' + ar.minRetentionYears + ' سنوات بعد الانتهاء (م.92 [Law · Pending]). المدة الفعلية ' + (ar.retentionYears == null ? '{Open}' : ar.retentionYears + ' سنة') + ' (بند 46). لا إخفاء هوية قبل انتهاء المدة أو أثناء حجز قانوني.'),
        SA.card({ title: 'سياسة الأرشفة', tags: [SA.tag('open')] }, SA.kv([['الحد الأدنى للاحتفاظ', ar.minRetentionYears + ' سنوات [Law · Pending]'], ['مدة الاحتفاظ الفعلية', ar.retentionYears == null ? SA.openValue() : ar.retentionYears + ' سنة'], ['مراجعة القائمة السوداء', ar.blacklistReviewMonths == null ? SA.openValue() : ar.blacklistReviewMonths + ' شهر'], ['حد إخفاء الخلايا الصغيرة', ar.minCell + ' (تجريبي)']]), SA.btn({ label: 'تعديل السياسة (HR Manager + Legal)', icon: 'settings', kind: 'ghost', reason: arcLock('hr.archive.view') || (SA.canSensitive('hr.final_settlement.approve') ? '' : 'يتطلب HR Manager'), onClick: policyDialog })),
        SA.card({ title: 'ملفات الخريجين والحجز القانوني', flush: true }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الخريج', 'الخروج', 'أقل موعد للاحتفاظ', 'الحجز القانوني', ''].map((x) => h('th', {}, x)))), h('tbody', {}, l.map((a) => h('tr', {}, h('td', {}, a.name), h('td', {}, dnum(a.exitedOn)), h('td', {}, a.exitedOn ? dnum(addMonths(a.exitedOn, 12 * (ar.minRetentionYears || 5))) : '—'), h('td', {}, a.legalHold ? chip('حجز قانوني', 'danger') : chip('لا', 'neutral')), h('td', {}, SA.btn({ label: a.legalHold ? 'رفع الحجز' : 'تعيين حجز', kind: 'ghost', size: 'sm', reason: SA.canSensitive('hr.final_settlement.approve') ? '' : 'يتطلب HR Manager', onClick: () => holdDialog(a) })))))))),
        SA.card({ title: 'إخفاء الهوية (لا رجعة فيه)' }, h('p', {}, 'ملفات مستحقة الآن: ', h('b.num', {}, due.length)), SA.btn({ label: 'معاينة وتنفيذ إخفاء الهوية', icon: 'trash', kind: 'danger', reason: ar.retentionYears == null ? 'مدة الاحتفاظ {Open} — لا ملفات مستحقة' : !due.length ? 'لا ملفات مستحقة الآن' : meUser().roleId !== 'R-01' ? 'Super Admin + HR Manager (شخصان)' : '', onClick: () => anonDialog(due) }), legalNote('معاينة + Step-up + اعتماد شخصين؛ يُسجَّل العدد والتاريخ بدون المحتوى المحذوف (BR-ALM-08).')));
    }
    function anaTab() { const l = alumniList(); const e12 = l.filter((a) => a.exitedOn && diffDays(a.exitedOn, today()) <= 365).length; return h('div', {}, h('div.sap-x-kpis', {}, SA.kpi('انفصالات آخر 12 شهرًا', e12, { sub: 'حسب تاريخ الخروج' }), SA.kpi('نسبة المؤهلين', l.length ? Math.round(l.filter((a) => a.eligibility === 'eligible').length / l.length * 100) + '%' : '—')), SA.card({ title: 'التحليلات التفصيلية' }, h('p', {}, 'معدل الدوران (شهري و12 شهرًا) والأقسام والأسباب بتعريف KPI واحد مطابق لـHR-27:'), h('div.sap-x-row', {}, h('a.btn.btn-primary', { href: SA.href('hr/reports/RPT-HR-02') }, 'تقرير العدد والدوران RPT-HR-02'), h('a.btn.btn-ghost', { href: SA.href('hr/clearance?tab=stats') }, 'أسباب الخروج (مجمّعة)'))), legalNote('دوران = الانفصالات ÷ متوسط العدد × 100 (متوسط العدد = (بداية + نهاية) ÷ 2) — للموظفين فقط، والمقاولون منفصلون. لا هدف خارجي مفروض.')); }
    paintHead(); paint();
    const unsubs = [st.subscribe('alumniFlags', () => { if (!leaving) { paintHead(); paint(); } }), st.subscribe('alumniArchive', () => { if (!leaving) { paintHead(); paint(); } }), st.subscribe('employees', () => { if (!leaving) paintHead(); })];
    if (openKey) { if (!alumnusOf(openKey)) root.prepend(SA.alert('warning', 'الخريج ' + openKey + ' غير موجود.')); else drawer = openAlumnus(openKey, () => { if (!leaving && SA.route && SA.route.module && SA.route.module.id === 'hr-archive') { leaving = true; SA.nav('hr/archive', { replace: true }); } }); }
    return () => { leaving = true; unsubs.forEach((f) => f()); if (drawer) drawer.close(null); };
  }
  function openAlumnus(key, onClose) {
    return liveDrawer({ size: 'lg', paths: ['alumniFlags', 'alumniArchive', 'employees', 'exitCases'], gone: () => !alumnusOf(key), onClose, title: () => (alumnusOf(key) || {}).name || key, subtitle: () => { const a = alumnusOf(key); return a ? a.lastPosition + ' · ' + dept(a.departmentId) : ''; },
      body: () => { const a = alumnusOf(key); const t4 = canT4(); return h('div', {}, SA.card({ title: 'ملخص الخروج (T2)' }, SA.kv([['التعيين', dnum(a.hiredOn)], ['الخروج', dnum(a.exitedOn)], ['النوع', a.exitType ? TYPES[a.exitType][0] : '—'], ['ملف الإنهاء', a.caseId ? h('a', { href: SA.href('hr/termination/' + a.caseId) }, a.caseId) : '—']])),
        SA.card({ title: 'أهلية إعادة التعيين', actions: SA.btn({ label: 'تعديل', kind: 'ghost', size: 'sm', reason: t4 ? '' : 'T4 — hr.discipline.view', onClick: () => eligDialog(a) }) }, SA.kv([['الأهلية', chip(ELIG[a.eligibility][0], ELIG[a.eligibility][1])], ['السبب (T4)', t4 ? (ELIG_REASONS.find((r) => r[0] === a.reasonCode) || [0, a.reasonCode || '—'])[1] : lockedCell('T4')], ['ملاحظات (T4)', t4 ? a.note || '—' : lockedCell('T4')]])),
        SA.card({ title: 'القائمة السوداء (T4)', actions: !t4 ? null : a.blacklist.status === 'none' || a.blacklist.status === 'removed' ? SA.btn({ label: 'اقتراح إدراج', kind: 'ghost', size: 'sm', reason: SA.canSensitive('hr.final_settlement.approve') ? '' : 'HR Manager يقترح', onClick: () => proposeBlacklist(a) }) : null }, t4 ? SA.kv([['الحالة', BLS[a.blacklist.status] ? chip(BLS[a.blacklist.status][0], BLS[a.blacklist.status][1]) : 'غير مُدرج'], a.blacklist.reasonCode ? ['السبب', (BL_REASONS.find((r) => r[0] === a.blacklist.reasonCode) || [0, ''])[1]] : null, a.blacklist.evidenceRef ? ['المرجع', a.blacklist.evidenceRef] : null]) : lockedCell('T4')),
        SA.card({ title: 'الاحتفاظ والتواصل' }, SA.kv([['الحجز القانوني', a.legalHold ? chip('حجز قانوني', 'danger') : 'لا'], ['موافقة قائمة المواهب', a.talentConsent ? chip('موافق', 'success') : 'غير مسجّلة — لا تواصل (BR-ALM-12)']]), SA.btn({ label: a.talentConsent ? 'سحب الموافقة' : 'تسجيل موافقة الخريج', kind: 'ghost', size: 'sm', reason: arcLock('hr.archive.view'), onClick: () => talentToggle(a) }))); },
      foot: () => { const a = alumnusOf(key); return a ? [SA.btn({ label: 'إعادة التعيين (Re-onboarding)', icon: 'userplus', kind: 'primary', onClick: () => rehireWizard(a) })] : []; } });
  }
  async function talentToggle(a) { const on = !a.talentConsent; await SA.api(() => { setFlag(a, { talentConsent: on }); SA.audit('HR.ALUMNI.TALENT_CONSENT', { target: { type: 'alumni', id: a.key, label: a.name }, after: { consent: on } }); }); SA.toast(on ? 'سُجّلت الموافقة' : 'سُحبت الموافقة', 'success'); }
  function eligDialog(a) {
    if (!canT4()) { SA.toast('T4 — يتطلب hr.discipline.view', 'warn'); return; }
    const f = { st: SA.form.field({ name: 'st', type: 'radio', label: 'الأهلية', value: a.eligibility === 'pending_review' ? 'eligible' : a.eligibility, options: [['eligible', 'مؤهّل'], ['conditional', 'مشروط'], ['ineligible', 'غير مؤهل (يتطلب سببًا ومرجعًا)']] }), reason: SA.form.field({ name: 'reason', type: 'select', label: 'السبب من الكتالوج المعتمد', required: true, value: a.reasonCode || '', options: [['', 'اختر…']].concat(ELIG_REASONS) }), note: SA.form.field({ name: 'note', type: 'textarea', label: 'ملاحظة / مرجع موثّق (T4)', required: true, rules: [SA.form.rules.min(5)], value: a.note || '' }) };
    modalForm({ title: 'تعديل أهلية إعادة التعيين', subtitle: a.name + ' — SCR-ALM-03', icon: 'edit', size: 'md', fields: [f.st, f.reason, f.note], intro: SA.alert('info', 'فحص آلي: لا يُبنى القرار على سبب محمي (نشاط نقابي، شكوى، حمل، زواج، دين، رأي سياسي) — م.165.'),
      validate: (v) => { const hit = protectedHit(v.note); if (hit) { f.note.error('تحتوي الملاحظة على إشارة لسبب محمي («' + hit.trim() + '») — لا يجوز بناء القرار عليه (م.165). راجع الإدارة القانونية.'); return 'سبب محمي'; } return null; },
      onSubmit: async (v) => { await SA.api(() => { const before = { eligibility: a.eligibility, reason: a.reasonCode }; setFlag(a, { eligibility: v.st, reasonCode: v.reason, note: v.note, setBy: meUser().id, setAt: new Date().toISOString() }); SA.audit('HR.ALUMNI.REHIRE_FLAG_SET', { target: { type: 'alumni', id: a.key, label: a.name }, before, after: { eligibility: v.st, reason: v.reason }, reason: v.note }); }); SA.toast('حُدّثت الأهلية', 'success'); } });
  }
  function proposeBlacklist(a) {
    if (a.exitType === 'RSG') { SA.toast('لا تُبنى القائمة السوداء على استقالة عادية (BR-ALM-03)', 'error', { ms: 6000 }); return; }
    const f = { r: SA.form.field({ name: 'r', type: 'select', label: 'السبب (قائمة معتمدة)', required: true, options: [['', 'اختر…']].concat(BL_REASONS) }), e: SA.form.field({ name: 'e', label: 'مرجع الإثبات (محضر/حكم)', required: true }), d: SA.form.field({ name: 'd', type: 'date', label: 'تاريخ المراجعة الدورية', hint: 'الدورية {Open} — اختياري.' }) };
    modalForm({ title: 'اقتراح إدراج في القائمة السوداء', subtitle: a.name + ' — SCR-ALM-04', icon: 'alert', size: 'md', danger: true, fields: [f.r, f.e, f.d], intro: SA.alert('warning', 'الاقتراح يصل للمدير العام للاعتماد (فصل مهام: المقترِح ≠ المعتمِد). الأثر: يتوقف عرض الخريج في أي توظيف إلا بتجاوز HR Manager + GM مسجّل.'), submitLabel: 'إرسال للاعتماد',
      onSubmit: async (v) => { if (!(await SA.stepUp('policy.change', { force: true }))) return false; await SA.api(() => { const ap = SA.requestApproval({ type: 'blacklist_entry', area: 'hr', title: 'إدراج خريج في القائمة السوداء — ' + (a.kind === 'emp' ? a.name : a.key), chain: ['R-02'], context: [['السبب', (BL_REASONS.find((r) => r[0] === v.r) || [0, ''])[1]], ['المرجع', v.e], ['المقترِح', meUser().name]], ref: { type: 'alumni', id: a.key } }); setFlag(a, { blacklist: { status: 'proposed', reasonCode: v.r, evidenceRef: v.e, proposedBy: meUser().id, reviewOn: v.d || null, approvalId: ap.id } }); SA.audit('HR.BLACKLIST.PROPOSED', { target: { type: 'alumni', id: a.key, label: a.name }, after: { reason: v.r, approval: ap.id } }); }); SA.toast('أُرسل الاقتراح للمدير العام', 'success'); } });
  }
  async function removeBlacklist(a) { const ok = await confirmDo({ title: 'رفع من القائمة السوداء', danger: true, reasonRequired: true, confirmLabel: 'رفع', stepUp: 'policy.change' }, (r) => { setFlag(a, { blacklist: { status: 'removed', reasonCode: a.blacklist.reasonCode } }); SA.audit('HR.BLACKLIST.REMOVED', { target: { type: 'alumni', id: a.key, label: a.name }, reason: r.reason }); }); if (ok) SA.toast('رُفع من القائمة', 'success'); }
  function holdDialog(a) { const set = !a.legalHold; const f = SA.form.field({ name: 'r', type: 'textarea', label: 'السبب (نزاع/قضية)', required: true, rules: [SA.form.rules.min(5)] }); modalForm({ title: set ? 'تعيين حجز قانوني' : 'رفع الحجز القانوني', subtitle: a.name, icon: 'lock', size: 'sm', fields: [f], intro: SA.alert('info', 'الحجز القانوني يمنع الأرشفة وإخفاء الهوية والحذف.'), onSubmit: async (v) => { if (!(await SA.stepUp('policy.change', { force: true }))) return false; await SA.api(() => { setFlag(a, { legalHold: set }); SA.audit(set ? 'HR.RETENTION.HOLD_SET' : 'HR.RETENTION.HOLD_RELEASED', { target: { type: 'alumni', id: a.key, label: a.name }, reason: v.r }); }); SA.toast('تم', 'success'); } }); }
  function policyDialog() {
    const ar = st.get('settings.hrArchive') || {}; const f = { y: SA.form.field({ name: 'y', type: 'number', label: 'مدة الاحتفاظ الفعلية (سنوات)', value: ar.retentionYears == null ? '' : ar.retentionYears, hint: 'لا تقل عن ' + ar.minRetentionYears + ' (م.92). اتركها فارغة = {Open}.' }), m: SA.form.field({ name: 'm', type: 'number', label: 'مراجعة القائمة السوداء (أشهر)', value: ar.blacklistReviewMonths == null ? '' : ar.blacklistReviewMonths }), why: SA.form.field({ name: 'why', type: 'textarea', label: 'سبب/مرجع المراجعة القانونية', required: true, rules: [SA.form.rules.min(5)] }) };
    modalForm({ title: 'تعديل سياسة الأرشفة', icon: 'settings', size: 'md', fields: [f.y, f.m, f.why], validate: (v) => (v.y != null && v.y < ar.minRetentionYears ? (f.y.error('الحد الأدنى ' + ar.minRetentionYears + ' سنوات'), 'أقل من الحد القانوني') : null), onSubmit: async (v) => { if (!(await SA.stepUp('policy.change', { force: true }))) return false; await SA.api(() => { const before = { retentionYears: ar.retentionYears, blacklistReviewMonths: ar.blacklistReviewMonths }; st.update('settings.hrArchive', (s) => { s.retentionYears = v.y; s.blacklistReviewMonths = v.m; }); SA.audit('HR.ARCHIVE.POLICY_CHANGED', { target: { type: 'setting', id: 'hrArchive', label: 'سياسة الأرشفة' }, before, after: { retentionYears: v.y, blacklistReviewMonths: v.m }, reason: v.why }); }); SA.toast('حُفظت السياسة', 'success'); } });
  }
  async function anonDialog(due) { const ok = await confirmDo({ title: 'تنفيذ إخفاء الهوية — ' + due.length + ' ملف', danger: true, reasonRequired: true, impact: ['تُخفى حقول T2–T4 ولا رجعة فيه', 'تبقى الأرقام المجمّعة', 'يُسجَّل العدد والتاريخ بدون المحتوى المحذوف', 'يتطلب اعتماد HR Manager ثانيًا (شخصان)'], confirmLabel: 'تنفيذ', stepUp: 'policy.change' }, () => { due.forEach((a) => st.patch('alumniArchive', a.key, { anonymised: true, name: 'مُخفى الهوية', note: '', reasonCode: null })); SA.audit('HR.ARCHIVE.ANONYMISE_RUN', { target: { type: 'archive', id: 'anon-' + today(), label: 'إخفاء هوية' }, after: { count: due.length } }); SA.notify({ title: 'تنفيذ إخفاء هوية', body: due.length + ' ملف', level: 'urgent', to: ['R-01', 'R-02'], link: '#/audit' }); }); if (ok) SA.toast('نُفّذ إخفاء الهوية', 'success'); }

  /* rehire wizard (SCR-ALM-05) */
  function rehireWizard(a) {
    const S = { step: 0, pos: a.positionId || '', bypass: '' }; let m;
    const bl = a.blacklist.status === 'approved'; const inel = a.eligibility === 'ineligible';
    const steps = ['التحقق', 'مراجعة البيانات', 'الإجراءات الإلزامية', 'الإنشاء']; const posF = SA.form.field({ name: 'pos', type: 'select', label: 'الوظيفة المطلوبة', value: S.pos, options: [['', 'اختر…']].concat((st.get('positions') || []).map((p) => [p.id, p.title + ' — ' + dept(p.departmentId)])), onChange: (v) => { S.pos = v; } });
    function body() {
      if (S.step === 0) return h('div', {}, h('ul.sap-x-steps', {}, [['الأهلية', a.eligibility === 'eligible' ? 'ok' : a.eligibility === 'pending_review' ? 'warn' : 'bad', ELIG[a.eligibility][0]], ['القائمة السوداء', bl ? 'bad' : 'ok', bl ? 'مُدرج — يتوقف العرض إلا بتجاوز HR Manager + GM مسجّل' : 'غير مُدرج'], ['التجربة', 'warn', 'التجربة مرة واحدة مع نفس صاحب العمل [Law]: لا تجربة جديدة إلا بمراجعة قانونية'], ['موافقة التواصل', a.talentConsent ? 'ok' : 'warn', a.talentConsent ? 'موافق' : 'غير مسجّلة — لا تواصل مبادر']].map((r) => h('li', { class: 'is-' + (r[1] === 'ok' ? 'done' : r[1]) }, h('span.sap-x-dot', {}, r[1] === 'ok' ? '✓' : r[1] === 'bad' ? '×' : '!'), h('span', {}, h('b', {}, r[0]), h('span.sap-x-sub', {}, r[2])), h('span')))), bl ? SA.alert('danger', isGM() ? 'أنت مخوّل بالتجاوز المسجّل — اكتب السبب في الخطوة التالية.' : 'متوقف: التجاوز يحتاج المدير العام.') : null, inel ? SA.alert('warning', 'غير مؤهل — راجع سبب الأهلية قبل المتابعة.') : null);
      if (S.step === 1) return h('div', {}, SA.kv([['الاسم', a.name], ['آخر وظيفة', a.lastPosition + ' — ' + dept(a.departmentId)], ['التعيين السابق', dnum(a.hiredOn)], ['الخروج', dnum(a.exitedOn)], ['الرقم القومي', 'مطابقة بالرقم المُجزّأ (hash) — لا يظهر']]), posF.el, bl ? SA.form.field({ name: 'bypass', type: 'textarea', label: 'سبب تجاوز القائمة السوداء (مسجّل)', onInput: (v) => { S.bypass = v; } }).el : null);
      if (S.step === 2) return h('div', {}, SA.alert('info', 'إعادة التعيين تُعيد الإجراءات الإلزامية. استمرارية الخدمة (الإجازات والعلاوة) {Open}.'), h('ul.sap-x-steps', {}, ['كشف طبي', 'عقد جديد (4 نسخ — الجهات المختصة) [Law]', 'توجيه سلامة وصحة مهنية', 'استلام عهدة وزي جديد', 'سياسة الرقم الوظيفي (جديد أم نفسه) {Open}'].map((t, i) => h('li', {}, h('span.sap-x-dot', {}, i + 1), h('span', {}, t), h('span')))));
      return h('div', {}, SA.kv([['الخريج', a.name], ['الوظيفة', ((st.find('positions', S.pos) || {}).title) || '—'], ['المسار', 'طلب توظيف معتمد (HR-02) ثم عرض/عقد (HR-04)']]), legalNote('يُنشأ طلب إعادة تعيين ويظهر في المرشحين إن وُجد طلب توظيف مفتوح لنفس الوظيفة.'));
    }
    function paint() { SA.clear(m.body); SA.clear(m.foot); m.body.append(SA.stepper(steps, S.step), body()); m.foot.append(h('button.btn.btn-ghost', { type: 'button', onclick: () => (S.step === 0 ? m.close(false) : (S.step--, paint())) }, S.step === 0 ? 'إلغاء' : 'السابق'), S.step < 3 ? h('button.btn.btn-primary', { type: 'button', disabled: S.step === 0 && bl && !isGM(), onclick: () => { if (S.step === 1 && (!S.pos || (bl && S.bypass.trim().length < 5))) { SA.toast(!S.pos ? 'اختر الوظيفة' : 'اكتب سبب التجاوز', 'error'); return; } S.step++; paint(); } }, 'التالي') : h('button.btn.btn-accent', { type: 'button', onclick: create }, 'بدء إعادة التعيين')); }
    async function create() {
      if (!SA.can('hr.requisitions.create') && !SA.can('hr.candidates.create')) { SA.toast('ليست من صلاحياتك (hr.candidates.create)', 'warn'); return; } m.setBusy(true);
      try { await SA.api(() => {
        const id = SA.store.nextId('rehireRequests', 'RH', 4).replace('RH-', 'RH-' + new Date().getFullYear() + '-'); const rq = (st.get('requisitions') || []).find((r) => r.positionId === S.pos && ['open', 'approved'].indexOf(r.status) >= 0); let candId = null;
        if (rq) { candId = SA.store.nextId('candidates', 'CD', 3); st.insert('candidates', { id: candId, name: a.name, requisitionId: rq.id, stage: 'screening', source: 'خريج سابق (إعادة تعيين)', appliedAt: new Date().toISOString(), alumniKey: a.key }); }
        st.insert('rehireRequests', { id, alumniKey: a.key, name: a.name, positionId: S.pos, status: rq ? 'candidate_created' : 'awaiting_requisition', requisitionId: rq ? rq.id : null, candidateId: candId, createdBy: meUser().id, createdAt: new Date().toISOString(), bypass: S.bypass || null });
        SA.audit('HR.REHIRE.STARTED', { target: { type: 'alumni', id: a.key, label: a.name }, after: { request: id, candidate: candId, blacklistBypass: bl }, reason: S.bypass || '', severity: bl ? 'critical' : undefined }); SA.notify({ title: 'بدء إعادة تعيين: ' + a.name, body: rq ? 'أُضيف كمرشح في ' + rq.id : 'لا طلب توظيف مفتوح لهذه الوظيفة — افتح طلبًا أولًا.', level: 'action', to: ['R-11', 'R-12'], link: rq ? '#/hr/candidates' : '#/hr/requisitions' });
        SA.toast(rq ? 'أُضيف ' + a.name + ' كمرشح في ' + rq.id : 'سُجّل الطلب — لا طلب توظيف مفتوح، افتح طلبًا من «طلبات التوظيف»', 'success', { ms: 6000 }); }); m.close(true); } catch (e) { m.setBusy(false); SA.fail(e); }
    }
    m = SA.modal({ title: 'إعادة التعيين — ' + a.name, subtitle: 'SCR-ALM-05 — أربع خطوات', icon: 'userplus', size: 'lg', body: h('div'), foot: [h('span')] }); paint();
  }
  reg({ id: 'hr-archive', app: 'hr', group: 'hr-exit', title: 'الأرشيف', icon: 'inbox', route: 'hr/archive', perm: 'hr.archive.view', order: 73, desc: 'الأرشيف', render: (root, ctx) => simulateState(root, (host) => renderArchive(host, ctx)) });

  /* ───────────────────────── Test Lab missions ───────────────────────── */
  if (SA.missions && SA.missions.add) {
    [
      { id: 'M-X1', area: 'hr', title: 'الإنهاء: سجّل استقالة بلا توقيع مسبق وابدأ مسار الاعتماد', persona: 'hr', route: 'hr/termination', est: '5 د', goal: 'ابدأ حالة استقالة لموظف، سجّل الخطاب بإقرار الموظف (جرّب خطابًا أقدم من تاريخ التقديم لتشاهد الرفض)، ثم أرسل القبول للاعتماد.', steps: [{ text: 'ابدأ حالة إنهاء جديدة', audit: 'HR.EXIT.CREATED' }, { text: 'سجّل الخطاب بإقرار الموظف', audit: 'HR.EXIT.RESIGNATION_SUBMITTED' }, { text: 'أرسل القبول للاعتماد', audit: 'HR.EXIT.EMPLOYER_REPLY_RECORDED' }], detect: [{ audit: 'HR.EXIT.CREATED' }, { audit: 'HR.EXIT.RESIGNATION_SUBMITTED' }, { audit: 'HR.EXIT.EMPLOYER_REPLY_RECORDED' }] },
      { id: 'M-X2', area: 'hr', title: 'الإنهاء: حاجز الإجازة المرضية', persona: 'hr', route: 'hr/termination/EXT-2026-0004', est: '2 د', goal: 'الموظف جمال قطب في إجازة مرضية مثبتة — حاول إرسال إنهاء التجربة للاعتماد وشاهد أن الخادم يمنعه بلا تجاوز.', steps: [{ text: 'اضغط «إرسال للاعتماد» على حالة التجربة', audit: 'HR.EXIT.BLOCK_TRIGGERED' }], detect: [{ audit: 'HR.EXIT.BLOCK_TRIGGERED' }] },
      { id: 'M-X3', area: 'hr', title: 'من الإخطار إلى الصرف: إخلاء الطرف ← المخالصة ← الاعتماد ← الصرف ← شهادة الخبرة', persona: 'hr', route: 'hr/clearance/CLR-2026-0002', est: '12 د', goal: 'رحلة تعبر وحدات متعددة بأكثر من شخصية: (1) كـHR أغلق بنود الإخلاء ووقّع الأقسام (بالنيابة أو بالدخول كمالك) ثم احسب المخالصة وأرسلها للاعتماد؛ (2) كمالك/مدير افتح صندوق الاعتمادات واعتمد؛ (3) كمحاسبة اصرف بسند PV-؛ (4) أصدر شهادة الخبرة وتحقق من ظهورها في سجل الإصدار.', steps: [{ text: 'وقّع أقسام الإخلاء', audit: 'HR.CLEARANCE.SIGNED' }, { text: 'احسب المخالصة', audit: 'HR.SETTLEMENT.CALCULATED' }, { text: 'أرسلها للاعتماد', audit: 'HR.SETTLEMENT.SUBMITTED' }, { text: 'اعتمدها من الصندوق', route: 'approvals' }, { text: 'اصرفها بسند صرف', audit: 'HR.SETTLEMENT.PAID' }, { text: 'أصدر شهادة الخبرة', audit: 'HR.DOC.ISSUED' }], detect: [{ audit: 'HR.CLEARANCE.SIGNED' }, { audit: 'HR.SETTLEMENT.CALCULATED' }, { audit: 'HR.SETTLEMENT.SUBMITTED' }, { audit: 'HR.SETTLEMENT.PAID' }, { audit: 'HR.DOC.ISSUED' }] },
      { id: 'M-X4', area: 'hr', title: 'الأرشيف: عدّل أهلية خريج بسبب موثّق', persona: 'hr', route: 'hr/archive', est: '3 د', goal: 'افتح دليل الخريجين، عدّل أهلية خريج (جرّب كتابة سبب محمي مثل «شكوى» لتشاهد الرفض الآلي)، ثم راجع الاحتفاظ {Open}.', steps: [{ text: 'عدّل الأهلية بسبب', audit: 'HR.ALUMNI.REHIRE_FLAG_SET' }], detect: [{ audit: 'HR.ALUMNI.REHIRE_FLAG_SET' }] }
    ].forEach((m) => SA.missions.add(m));
  }

  /* boot: the store is ready only after app.js ran */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(ensureInit, 0)); else setTimeout(ensureInit, 0);
})();
