/* mod-hr-protect.js — HR Phase 2 · «التطوير والحماية» (HR-18 الأداء · HR-19 التدريب · HR-20 الجزاءات · HR-21 السلامة · HR-22 التحفيز)
   يستبدل الـstubs: hr-performance / hr-training / hr-disciplinary / hr-ohs / hr-recognition.
   مواصفة: docs/hr/05-develop-protect.md · تصميم: hr-protect.html.
   مجموعات الـstore المضافة (تُبذر مرة واحدة بعلامة meta.hrProtectSeeded): apprTemplates, apprCycles, appraisals, probationEvals, courses, trainingSessions, skillDefs,
   empSkills, assignOverrides, clawbacks, trainingNeeds, jobRequired, penaltyCatalog, violations, grievances, harassment, dismissals, legalCases, incidents, fitness,
   ppeLog, toolboxTalks, regTasks, ohsMeetings, recognitionTypes, awards, incentiveSchemes, incentiveSheets, suggestions, surveys, surveyParts, surveyAnswers,
   retentionFlags, payrollInputs (مدخلات للمرتبات) + settings.hrProtect.
   مواءمة: `violations` (VIO-) و`incidents` (INC-) مشتركتان مع وحدة «خدماتي/فريقي» (mod-hr-ess.js) — تُكمَل سجلاتها تلقائيًا بـnormalizeAll() (kind/catalogId/discoveredAt/classified/capas…) فتظهر هنا للفرز والتحقيق.
   كذلك: salaryChanges بحالة draft (مصدر performance) · leaveRequests (إجازة مرضية مثبتة certified) · trainingNeeds · payrollInputs {kind: deduction_days|incentive|award}.
   API للوحدات الأخرى: SA.hrProtect.{skillCheck, assignMachine, fitnessStatus, sickLeaveBlock, safetyKpis}. */
(function () {
  'use strict';
  const SA = window.SA;
  if (!SA || !SA.register) return;
  const h = SA.h, st = SA.store;

  /* ───────────────────────── CSS (بادئة sap-hp-) ───────────────────────── */
  (function css() {
    if (document.querySelector('style[data-mod="hr-protect"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'hr-protect');
    s.textContent = `
.sap-hp-view { display: flex; flex-direction: column; gap: 16px; }
.sap-hp-body { display: flex; flex-direction: column; gap: 16px; }
.sap-hp-uc small { direction: rtl !important; text-align: start !important; }
.sap-hp-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.sap-hp-row.is-between { justify-content: space-between; }
.sap-hp-grow { flex: 1 1 auto; }
.sap-hp-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 16px; align-items: start; }
.sap-hp-note { font-size: var(--text-caption); color: var(--color-text-muted); margin: 0; }
.sap-hp-secret { display: inline-flex; align-items: center; gap: 4px; color: var(--color-text-muted); background: var(--color-neutral-tint); border-radius: 6px; padding: 1px 8px; font-size: 12px; }
.sap-hp-t4 { display: flex; gap: 10px; align-items: center; background: #fff4f4; border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent); color: var(--color-danger); border-radius: 12px; padding: 10px 14px; font-size: var(--text-dense); font-weight: 600; }
.sap-hp-t4 small { display: block; font-weight: 500; opacity: .85; }
.sap-hp-link { background: none; border: 0; padding: 0; color: var(--eg-navy); font: inherit; font-weight: 700; cursor: pointer; text-align: start; }
.sap-hp-link:hover { text-decoration: underline; }
.sap-hp-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: currentColor; margin-inline-end: 6px; }
.sap-hp-pills { display: flex; flex-wrap: wrap; gap: 8px; }
.sap-hp-mxwrap { overflow: auto; max-height: 70vh; border: 1px solid var(--color-border); border-radius: 12px; background: #fff; }
.sap-hp-mx { border-collapse: separate; border-spacing: 0; width: 100%; font-size: var(--text-dense); }
.sap-hp-mx th, .sap-hp-mx td { padding: 6px 8px; border-bottom: 1px solid var(--color-border); text-align: center; white-space: nowrap; }
.sap-hp-mx thead th { position: sticky; top: 0; z-index: 2; background: var(--color-bg-alt); font-weight: 700; padding: 10px 8px; }
.sap-hp-mx tbody th { position: sticky; inset-inline-start: 0; z-index: 1; background: #fff; text-align: start; min-width: 190px; border-inline-end: 1px solid var(--color-border); }
.sap-hp-mx thead th:first-child { inset-inline-start: 0; z-index: 3; text-align: start; }
.sap-hp-cb { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; min-width: 96px; min-height: 48px; padding: 5px 8px; border-radius: 10px; border: 1px solid transparent; background: transparent; cursor: pointer; font: inherit; color: inherit; }
.sap-hp-cb b { font: 800 16px var(--font-en); line-height: 1.1; }
.sap-hp-cb small { font-size: 11px; font-weight: 600; }
.sap-hp-cb:hover { box-shadow: 0 0 0 2px var(--eg-navy-soft); }
.sap-hp-cb.is-ok { background: var(--color-success-tint); color: var(--color-success); }
.sap-hp-cb.is-soon { background: var(--color-warning-tint); color: #8a5a00; border-color: color-mix(in srgb, var(--color-warning) 50%, transparent); }
.sap-hp-cb.is-urgent { background: var(--color-danger-tint); color: var(--color-danger); border-color: var(--color-danger); }
.sap-hp-cb.is-exp { background: var(--color-danger-tint); color: var(--color-danger); border: 1px dashed var(--color-danger); }
.sap-hp-cb.is-train { background: var(--color-primary-tint); color: var(--eg-navy); }
.sap-hp-cb.is-none { background: transparent; color: var(--color-text-muted); border: 1px dashed var(--color-border-strong); }
.sap-hp-leg { display: flex; flex-wrap: wrap; gap: 14px; font-size: var(--text-caption); color: var(--color-text-muted); }
.sap-hp-leg i { display: inline-block; width: 12px; height: 12px; border-radius: 4px; margin-inline-end: 6px; vertical-align: -2px; }
.sap-hp-tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sap-hp-tl li { position: relative; padding-inline-start: 28px; padding-block-end: 14px; border-inline-start: 2px solid var(--color-border); margin-inline-start: 8px; }
.sap-hp-tl li:last-child { border-inline-start-color: transparent; padding-block-end: 0; }
.sap-hp-tl li::before { content: ''; position: absolute; inset-inline-start: -8px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 2px solid var(--color-border-strong); }
.sap-hp-tl li.is-done::before { background: var(--color-success); border-color: var(--color-success); }
.sap-hp-tl li.is-now::before { background: #fff; border-color: var(--eg-navy); box-shadow: 0 0 0 4px var(--color-primary-tint); }
.sap-hp-tl li.is-bad::before { background: var(--color-danger); border-color: var(--color-danger); }
.sap-hp-tl b { display: block; font-size: var(--text-dense); }
.sap-hp-tl small { color: var(--color-text-muted); font-size: var(--text-caption); }
.sap-hp-bar { display: flex; align-items: center; gap: 10px; font-size: var(--text-dense); }
.sap-hp-bar > span:first-child { flex: 0 0 120px; color: var(--color-text-muted); }
.sap-hp-bar > div { flex: 1; height: 14px; background: var(--color-bg-alt); border-radius: 999px; overflow: hidden; }
.sap-hp-bar i { display: block; height: 100%; background: var(--eg-navy); border-radius: 999px; min-width: 2px; }
.sap-hp-bar b { flex: 0 0 38px; font: 700 13px var(--font-en); text-align: end; }
.sap-hp-score { display: inline-flex; align-items: baseline; gap: 4px; font: 800 22px var(--font-en); color: var(--eg-navy); }
.sap-hp-score small { font: 600 12px var(--font-body); color: var(--color-text-muted); }
.sap-hp-rate { display: flex; gap: 6px; flex-wrap: wrap; }
.sap-hp-rate button { min-width: 48px; min-height: 48px; border-radius: 12px; border: 1px solid var(--color-border-strong); background: #fff; font: 700 17px var(--font-en); cursor: pointer; color: var(--eg-navy); }
.sap-hp-rate button[aria-pressed="true"] { background: var(--eg-navy); color: #fff; border-color: var(--eg-navy); }
.sap-hp-rate button:disabled { opacity: .5; cursor: not-allowed; }
.sap-hp-crit { border: 1px solid var(--color-border); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; background: #fff; }
.sap-hp-crit-head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
.sap-hp-crit-head b { font-size: var(--text-dense); }
.sap-hp-w { font: 700 12px var(--font-en); background: var(--color-primary-tint); color: var(--eg-navy); border-radius: 999px; padding: 1px 9px; }
.sap-hp-anchor { font-size: var(--text-caption); color: var(--color-text-muted); min-height: 18px; }
.sap-hp-sim { border: 1px solid var(--color-border); border-radius: 14px; padding: 16px; background: var(--color-bg-alt); display: flex; flex-direction: column; gap: 12px; }
.sap-hp-res { border-radius: 12px; padding: 14px 16px; border: 1px solid; display: flex; flex-direction: column; gap: 8px; }
.sap-hp-res.is-ok { background: var(--color-success-tint); border-color: color-mix(in srgb, var(--color-success) 40%, transparent); color: var(--color-success); }
.sap-hp-res.is-bad { background: var(--color-danger-tint); border-color: color-mix(in srgb, var(--color-danger) 40%, transparent); color: var(--color-danger); }
.sap-hp-res.is-warn { background: var(--color-warning-tint); border-color: color-mix(in srgb, var(--color-warning) 50%, transparent); color: #8a5a00; }
.sap-hp-res ul { margin: 0; padding-inline-start: 18px; display: grid; gap: 4px; color: var(--color-text); font-size: var(--text-dense); }
.sap-hp-kpi4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: 14px; }
.sap-hp-formula { font: 500 12.5px var(--font-en); direction: ltr; text-align: start; background: var(--color-bg-alt); border-radius: 8px; padding: 6px 10px; color: var(--color-text-muted); }
.sap-hp-star { color: var(--color-warning); }
.sap-hp-steps { display: grid; gap: 10px; }
.sap-hp-step { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--color-border); border-radius: 12px; background: #fff; }
.sap-hp-step .n { flex: 0 0 28px; height: 28px; border-radius: 50%; background: var(--color-bg-alt); display: grid; place-items: center; font: 700 13px var(--font-en); }
.sap-hp-step.is-done .n { background: var(--color-success); color: #fff; }
.sap-hp-step.is-now { border-color: var(--eg-navy); box-shadow: 0 0 0 3px var(--color-primary-tint); }
.sap-hp-step.is-bad { border-color: var(--color-danger); background: var(--color-danger-tint); }
.sap-hp-step.is-bad .n { background: var(--color-danger); color: #fff; }
.sap-hp-step > div { flex: 1; min-width: 0; }
.sap-hp-step b { display: block; font-size: var(--text-dense); }
.sap-hp-step small { color: var(--color-text-muted); font-size: var(--text-caption); }
.sap-hp-photo { width: 72px; height: 72px; border: 1px dashed var(--color-border-strong); border-radius: 10px; display: grid; place-items: center; color: var(--color-text-muted); font-size: 11px; background: var(--color-bg-alt); text-align: center; padding: 4px; }
.sap-hp-lock { opacity: .75; }
.sap-hp-pick { display: flex; flex-wrap: wrap; gap: 6px; }
.sap-hp-tag { display: inline-flex; align-items: center; gap: 4px; background: var(--color-bg-alt); border: 1px solid var(--color-border); border-radius: 999px; padding: 2px 10px; font-size: 12.5px; }
.sap-hp-sec h3 { margin: 0 0 8px; font-size: var(--text-h3); }
.sap-hp-big { font: 800 28px var(--font-en); color: var(--eg-navy); }
@media (max-width: 700px) { .sap-hp-bar > span:first-child { flex-basis: 84px; } .sap-hp-mx tbody th { min-width: 140px; } }
`;
    document.head.appendChild(s);
  })();

  /* ───────────────────────── مساعدات عامة ───────────────────────── */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const T = () => ymd(new Date());
  const D = (n, base) => { const d = base ? new Date(base + 'T12:00:00') : new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return ymd(d); };
  const dd = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  const AGO = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const fd = (s) => (s ? SA.fmt.date(String(s).length === 10 ? s + 'T12:00:00' : s) : '—');
  const num = (n, d) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 2 : d }));
  const N = (v) => h('span.num', {}, v);
  const emps = () => st.get('employees') || [];
  const emp = (id) => emps().find((e) => e.id === id) || null;
  const en = (id) => (emp(id) || {}).name || id || '—';
  const myEmp = () => emps().find((e) => e.userId === SA.session.userId) || null;
  const posTitle = (id) => ((st.get('positions') || []).find((p) => p.id === id) || {}).title || '—';
  const deptName = (id) => SA.deptName(id);
  const uname = (id) => SA.userName(id);
  const L = (name) => st.get(name) || [];
  const find = (coll, id) => L(coll).find((x) => x.id === id) || null;
  const OPS = ['E-1017', 'E-1020', 'E-1021', 'E-1022', 'E-1023', 'E-1024', 'E-1025', 'E-1026', 'E-1027', 'E-1028', 'E-1029', 'E-1030', 'E-1031'];
  const isHrMgr = () => { const r = SA.session.role; return !!r && (r.id === 'R-11' || r.id === 'R-01'); };
  const NOPERM = (k) => 'ليست من صلاحياتك' + (k ? ' (' + k + ')' : '');
  const seqId = (coll, prefix, width, year) => { let max = 0; const re = new RegExp('^' + prefix + '-' + (year ? year + '-' : '') + '(\\d+)$'); L(coll).forEach((r) => { const m = re.exec(r.id || ''); if (m) max = Math.max(max, +m[1]); }); return prefix + '-' + (year ? year + '-' : '') + String(max + 1).padStart(width || 4, '0'); };
  const Y = () => String(new Date().getFullYear());
  const ago = (iso) => SA.fmt.rel(iso);

  const empCell = (e, sub) => (!e ? '—' : h('div.sap-usercell.sap-hp-uc', {}, SA.avatar(e.name), h('div', {}, h('b', {}, e.name), h('small', {}, sub == null ? posTitle(e.positionId) + ' · ' + deptName(e.departmentId) : sub))));
  const secret = (label) => h('span.sap-hp-secret', { title: 'يتطلب صلاحية حساسة' }, SA.icon('lock', 'icon-sm'), label || 'سري');
  const money = (v) => (SA.can('hr.salary.view') ? h('span.num', {}, SA.fmt.money(v)) : secret('••• سري T3'));
  const stChip = (map, k) => { const m = map[k]; return m ? SA.chip(m[0], m[1]) : SA.chip(k || '—'); };
  const t4Banner = (txt) => h('div.sap-hp-t4', {}, SA.icon('lock'), h('div', {}, 'بيانات سرية جدًا (T4)', h('small', {}, txt || 'كل فتح لملف هنا يُسجَّل في سجل التدقيق. لا تُعرض في الإشعارات أو البحث العام.')));
  const specLink = (anchor, label) => h('a.sap-linkbtn', { href: '../../hr-protect.html#' + anchor, target: '_blank', rel: 'noopener' }, SA.icon('external', 'icon-sm'), label || 'المواصفة الكاملة ↗');
  const openTag = (txt) => SA.openValue(txt);
  const lawTag = (txt) => h('span', {}, txt, ' ', SA.tag('pending', 'Law · Pending'));
  const sec = (title, ...kids) => h('div.sap-hp-sec', {}, h('h3', {}, title), kids);
  const btn = (o) => SA.btn(o);
  const hbtn = (label, onClick, kind) => h('button.btn.btn-' + (kind || 'ghost'), { type: 'button', onclick: onClick }, label);

  /** كتالوج أكواد التدقيق (HR.PRF / TRN / DSC / OHS / RCG) + أنواع الاعتماد الجديدة */
  (function catalogs() {
    const A = SA.catalog.addAudit;
    [['HR.PRF.CYCLE_OPENED', 'فتح دورة تقييم', 'medium'], ['HR.PRF.TEMPLATE_SAVED', 'حفظ/اعتماد نسخة قالب KPI', 'medium'], ['HR.PRF.SUPERVISOR_SUBMITTED', 'إرسال تقييم المشرف', 'info'], ['HR.PRF.SELF_SUBMITTED', 'إرسال تقييم ذاتي', 'info'], ['HR.PRF.CALIBRATED', 'تعديل درجة بالمعايرة', 'high'], ['HR.PRF.FINALIZED', 'الاعتماد النهائي لدورة التقييم', 'high'], ['HR.PRF.ACKNOWLEDGED', 'إقرار الموظف بنتيجة التقييم', 'info'], ['HR.PRF.PROBATION_EVALUATED', 'تقييم فترة التجربة وقراره', 'high'], ['HR.PRF.PROPOSALS_CREATED', 'إنشاء مقترحات HR-07/HR-19 من التقييم', 'medium'],
      ['HR.TRN.COURSE_SAVED', 'إنشاء/تعديل دورة تدريبية', 'medium'], ['HR.TRN.REQUIRED_CHANGED', 'تعديل التدريب الإلزامي لوظيفة', 'high'], ['HR.TRN.SESSION_SCHEDULED', 'جدولة جلسة تدريب', 'info'], ['HR.TRN.ATTENDANCE_RECORDED', 'تسجيل حضور/نتيجة تدريب', 'info'], ['HR.TRN.SESSION_CLOSED', 'إغلاق جلسة وإصدار شهادات', 'medium'], ['HR.TRN.SKILL_CERTIFIED', 'اعتماد مستوى مهارة', 'high'], ['HR.TRN.SKILL_REVOKED', 'سحب شهادة/مستوى مهارة', 'high'], ['HR.TRN.CERT_EXPIRED', 'انتهاء شهادة', 'medium'], ['HR.TRN.ASSIGNMENT_BLOCKED', 'رفض إسناد ماكينة (سبب الحظر)', 'high'], ['HR.TRN.OVERRIDE_REQUESTED', 'طلب تجاوز مشروط للحظر', 'high'], ['HR.TRN.OVERRIDE_DECIDED', 'قرار تجاوز الحظر', 'high'], ['HR.TRN.BLOCKRULE_CHANGED', 'تعديل نمط حظر مهارة', 'critical'], ['HR.TRN.CLAWBACK_SIGNED', 'توقيع/تفعيل اتفاقية استرداد تكلفة', 'high'], ['HR.TRN.CLAWBACK_STATUS_CHANGED', 'تغيّر حالة اتفاقية استرداد', 'high'], ['HR.TRN.NEED_CREATED', 'توليد احتياج تدريب', 'info'],
      ['HR.DSC.NOTE_LOGGED', 'تسجيل ملاحظة إدارية', 'info'], ['HR.DSC.REPORT_SUBMITTED', 'إرسال بلاغ مخالفة', 'medium'], ['HR.DSC.CASE_OPENED', 'فتح ملف تأديبي وتعيين المحقق', 'high'], ['HR.DSC.EMPLOYEE_NOTIFIED', 'إخطار الموظف بالمخالفة', 'high'], ['HR.DSC.HEARING_SCHEDULED', 'تحديد موعد سماع', 'medium'], ['HR.DSC.MINUTES_SAVED', 'حفظ محضر تحقيق', 'high'], ['HR.DSC.SUSPENSION_RECORDED', 'تسجيل إيقاف مؤقت', 'high'], ['HR.DSC.DECISION_ISSUED', 'قرار جزاء', 'critical'], ['HR.DSC.DECISION_DELIVERED', 'تسليم قرار الجزاء', 'high'], ['HR.DSC.GRIEVANCE_FILED', 'تقديم تظلم', 'high'], ['HR.DSC.GRIEVANCE_DECIDED', 'قرار تظلم', 'high'], ['HR.DSC.CATALOG_CHANGED', 'تعديل كتالوج المخالفات والجزاءات', 'critical'], ['HR.DSC.REGULATION_ACTIVATED', 'تفعيل/إيقاف لائحة تنظيم العمل', 'critical'], ['HR.DSC.LIMITS_CHANGED', 'تعديل السقوف القانونية للجزاءات', 'critical'], ['HR.DSC.HARASSMENT_FILED', 'تقديم شكوى تحرش', 'critical'], ['HR.DSC.HARASSMENT_ACCESSED', 'فتح ملف شكوى تحرش', 'critical'], ['HR.DSC.HARASSMENT_UPDATED', 'تحديث معالجة شكوى تحرش', 'high'], ['HR.DSC.DISMISSAL_REQUESTED', 'فتح طلب فصل (ملف قضية)', 'critical'], ['HR.DSC.DISMISSAL_BLOCKED', 'حظر آلي لطلب فصل (إجازة مرضية مثبتة)', 'critical'], ['HR.DSC.DISMISSAL_LEGAL_REVIEWED', 'مراجعة قانونية لطلب فصل', 'critical'], ['HR.DSC.DISMISSAL_APPROVED', 'اعتماد GM لطلب فصل', 'critical'], ['HR.DSC.LEGAL_CASE_OPENED', 'فتح قضية قانونية', 'high'], ['HR.DSC.LEGAL_HEARING_LOGGED', 'تسجيل جلسة قضية', 'medium'], ['HR.DSC.LEGAL_OUTCOME_RECORDED', 'تسجيل نتيجة/حكم قضية', 'high'], ['HR.DSC.FILE_READ', 'قراءة ملف تأديبي T4', 'high'],
      ['HR.OHS.INCIDENT_REPORTED', 'تقديم بلاغ حادث/شبه حادث', 'high'], ['HR.OHS.INCIDENT_CLASSIFIED', 'تصنيف/إعادة تصنيف حادث', 'high'], ['HR.OHS.INVESTIGATION_SAVED', 'حفظ تحقيق حادث', 'medium'], ['HR.OHS.CAPA_CREATED', 'إنشاء إجراء تصحيحي', 'medium'], ['HR.OHS.CAPA_VERIFIED', 'تحقق من فعالية إجراء', 'high'], ['HR.OHS.INCIDENT_CLOSED', 'إغلاق حادث', 'high'], ['HR.OHS.INJURY_CASE_OPENED', 'فتح حالة إصابة عمل', 'high'], ['HR.OHS.INJURY_NOTIFICATION_LOGGED', 'تسجيل إثبات إخطار التأمينات', 'high'], ['HR.OHS.LOST_TIME_UPDATED', 'تحديث أيام فقد الوقت', 'medium'], ['HR.OHS.FITNESS_RECORDED', 'تسجيل نتيجة لياقة طبية', 'high'], ['HR.OHS.MEDICAL_READ', 'قراءة سجل طبي T4', 'critical'], ['HR.OHS.FITNESS_STATUS_READ', 'قراءة حالة اللياقة (بدون تشخيص)', 'info'], ['HR.OHS.PPE_INSPECTED', 'فحص معدات الوقاية', 'info'], ['HR.OHS.TOOLBOX_HELD', 'تسجيل حديث سلامة', 'info'], ['HR.OHS.REGTASK_CREATED', 'إنشاء مهمة إخطار تنظيمي', 'high'], ['HR.OHS.REGTASK_DONE', 'إنجاز مهمة إخطار وإثباتها', 'high'], ['HR.OHS.COMMITTEE_MEETING_SAVED', 'حفظ محضر لجنة السلامة', 'medium'], ['HR.OHS.KPI_BASE_CHANGED', 'تغيير أساس/ساعات مؤشرات السلامة', 'critical'],
      ['HR.RCG.NOMINATED', 'ترشيح تقدير', 'info'], ['HR.RCG.AWARD_APPROVED', 'اعتماد تقدير/جائزة', 'medium'], ['HR.RCG.SCHEME_SAVED', 'حفظ/تعديل خطة حافز', 'high'], ['HR.RCG.SHEET_PREPARED', 'إعداد كشف حافز', 'medium'], ['HR.RCG.SHEET_APPROVED', 'اعتماد كشف حافز', 'high'], ['HR.RCG.SHEET_TRANSFERRED', 'ترحيل كشف الحافز للمرتبات', 'high'], ['HR.RCG.SUGGESTION_SUBMITTED', 'تقديم اقتراح', 'info'], ['HR.RCG.SUGGESTION_DECIDED', 'قرار اقتراح والرد', 'medium'], ['HR.RCG.SURVEY_LAUNCHED', 'إطلاق استطلاع نبض', 'medium'], ['HR.RCG.SURVEY_RESULTS_VIEWED', 'عرض نتائج استطلاع مجمّعة', 'info'], ['HR.RCG.SURVEY_SETTING_CHANGED', 'تغيير الحد الأدنى لحجم مجموعة الاستطلاع', 'high'], ['HR.RCG.RETENTION_FLAGGED', 'إضافة موظف لقائمة مراقبة الترك', 'info'], ['HR.RCG.RETENTION_UPDATED', 'تحديث متابعة خطر الترك', 'info'], ['HR.RCG.RETENTION_RULE_CHANGED', 'تعديل قواعد خطر الترك', 'high']
    ].forEach((a) => A(a[0], a[1], a[2], 'hr'));
    const T = SA.catalog.approvalTypes;
    T.dismissal_request = { label: 'طلب فصل (ملف قضية)', area: 'hr', icon: 'alert' };
    T.incentive_sheet = { label: 'كشف حافز شهري', area: 'hr', icon: 'coins' };
    T.assignment_override = { label: 'تجاوز مؤقت لحظر الإسناد', area: 'hr', icon: 'shield' };
  })();

  /** تنفيذ كتابة عبر الخادم المحاكى مع معالجة الأخطاء */
  async function run(fn) { try { await SA.api(fn); return true; } catch (e) { SA.fail(e); return false; } }
  const aud = (code, tt, id, label, o) => SA.audit(code, Object.assign({ target: { type: tt, id, label } }, o || {}));
  const notify = (title, body, level, to, link, toUsers) => SA.notify({ title, body, level: level || 'info', to: to || [], toUsers: toUsers || [], link: link || '' });

  /** نموذج في نافذة: fields = [تعريف حقل | Node] */
  function formModal(o) {
    return new Promise((resolve) => {
      const apis = []; const by = {};
      const nodes = (o.fields || []).map((f) => { if (!f) return null; if (f.nodeType) return f; const a = SA.form.field(f); apis.push(a); by[f.name] = a; return a.el; });
      const ctl = SA.form.group(apis);
      const sub = h('button.btn.' + (o.danger ? 'btn-accent' : 'btn-primary'), { type: 'button' }, o.submitLabel || 'حفظ');
      const m = SA.modal({ title: o.title, subtitle: o.subtitle, icon: o.icon || 'edit', size: o.size || 'md', danger: o.danger, body: h('div.sap-confirm', {}, o.intro || null, nodes, o.note ? h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), o.note) : null), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(false) }, 'إلغاء'), sub] });
      sub.addEventListener('click', async () => {
        if (!ctl.validate()) return;
        const v = ctl.get();
        const err = o.check ? o.check(v, by) : null;
        if (err) { if (typeof err === 'string') SA.toast(err, 'error'); else { Object.keys(err).forEach((k) => by[k] && by[k].error(err[k])); const f = Object.keys(err)[0]; if (by[f]) by[f].focus(); } return; }
        if (o.step && !(await SA.stepUp(o.step, { force: true, title: o.stepTitle, text: o.stepText }))) return;
        m.setBusy(true);
        try { await SA.api(() => o.onSubmit(v, by)); m.close(true); } catch (e) { m.setBusy(false); SA.fail(e); }
      });
      m.closed.then((r) => resolve(!!r));
      if (o.onOpen) o.onOpen(by, m);
    });
  }
  /** تأكيد + (Step-up اختياري) + تنفيذ */
  async function confirmAct(o) {
    const r = await SA.confirm(o); if (!r.ok) return false;
    if (o.step && !(await SA.stepUp(o.step, { force: true }))) return false;
    if (!(await run(() => o.run(r)))) return false;
    if (o.success) SA.toast(o.success, 'success', o.toastOpts);
    return true;
  }

  /** drawer حيّ: يعيد بناء المحتوى عند تغيّر مسارات الـstore */
  function liveDrawer(o) {
    const body = h('div.sap-drawer-inner'); let foot = null;
    const d = SA.drawer({ title: o.title, subtitle: o.subtitle, size: o.size || 'lg', body, foot: [h('span')] });
    function build() {
      const res = o.build(d);
      if (res === false) { d.close(); return; }
      SA.clear(body); body.append(res.body || res);
      if (d.foot) { SA.clear(d.foot); if (res.foot && (!Array.isArray(res.foot) || res.foot.length)) { d.foot.append(res.foot); d.foot.style.display = ''; } else d.foot.style.display = 'none'; }
      if (res.title) d.setTitle(res.title, res.subtitle);
    }
    build();
    const offs = (o.paths || []).map((p) => st.subscribe(p, build));
    d.closed.then(() => offs.forEach((f) => f()));
    return d;
  }

  /** هيكل شاشة بتبويبات: تحميل → هيكل عظمي → خطأ/ممنوع/فارغ */
  function screen(def) {
    SA.register({
      app: 'hr', id: def.id, group: 'hr-dev', title: def.title, icon: def.icon, route: def.route, perm: def.perm, order: def.order, desc: def.desc, badge: def.badge,
      render(root, ctx) {
        ensureSeed(); normalizeAll(); reconcile();
        ctx.setCrumbs([{ label: 'التطوير والحماية' }, { label: def.title }]);
        const head = h('div'); const tabsHost = h('div'); const view = h('div.sap-hp-view'); root.append(head, tabsHost, view);
        const tabs = def.tabs.filter((t) => !t.when || t.when());
        let active = tabs.find((t) => t.id === ctx.params.tab) ? ctx.params.tab : tabs[0].id; let cleanup = null; let tabCtl = null; let alive = true;
        const api = { go(id) { if (!tabs.find((t) => t.id === id)) return; active = id; tabCtl.setActive(id); draw(); }, tab: () => active, ctx };
        function drawHead() {
          const t = tabs.find((x) => x.id === active);
          SA.clear(head); head.append(SA.pageHead({ title: def.title, desc: def.desc, tags: def.tags ? def.tags() : null, actions: t && t.primary ? [t.primary(api)] : null }));
        }
        function draw() {
          if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
          try { history.replaceState(null, '', '#/' + def.route + '?tab=' + active); } catch (e) { /* noop */ }
          SA.clear(view); drawHead();
          const t = tabs.find((x) => x.id === active);
          const r = t.render(view, api);
          cleanup = typeof r === 'function' ? r : null;
          if (r && r.nodeType) view.append(r);
        }
        function start() {
          SA.clear(view); SA.clear(tabsHost); SA.clear(head);
          head.append(SA.pageHead({ title: def.title, desc: def.desc })); view.append(SA.skeleton({ kind: 'cards', rows: 4 }), SA.skeleton({ rows: 5 }));
          SA.delay(220, { write: false }).then(() => {
            if (!alive) return;
            tabCtl = SA.tabs({ tabs: tabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon, badge: t.badge ? t.badge() : null })), active, label: def.title, onChange: (id) => { active = id; draw(); } });
            tabsHost.append(tabCtl.el); draw();
          }, (e) => { if (!alive) return; SA.clear(view); view.append(SA.errorState({ text: SA.errorText(e), onRetry: start })); });
        }
        const badgeRefresh = () => { if (tabCtl) tabs.forEach((t) => { if (t.badge) tabCtl.setBadge(t.id, t.badge()); }); };
        const offs = (def.watch || []).map((p) => st.subscribe(p, badgeRefresh));
        start();
        return () => { alive = false; offs.forEach((f) => f()); if (cleanup) { try { cleanup(); } catch (e) { /* noop */ } } };
      }
    });
  }
  /** بطاقة جدول موحّدة */
  const tcard = (o) => { const t = SA.table(Object.assign({ pageSize: 8 }, o)); return { el: SA.card({ flush: true }, t.el), t }; };
  const kpiRow = (items) => h('div.sap-grid-cards', {}, items.map((k) => SA.kpi(k[0], k[1], k[2])));
  const empOpts = (fn) => [['', 'اختر الموظف…']].concat(emps().filter((e) => e.status !== 'terminated' && (!fn || fn(e))).map((e) => [e.id, e.name + ' — ' + deptName(e.departmentId)]));
  const checkReq = (min, msg) => (v) => (!v || String(v).trim().length < min ? msg : null);

  /* ───────────────────────── الثوابت والتسميات ───────────────────────── */
  const PEN = { warning: 'إنذار كتابي', deduction: 'خصم من الأجر الأساسي (بالأيام)', defer_raise: 'تأجيل العلاوة', withhold_half_raise: 'حجب نصف العلاوة', defer_promotion: 'تأجيل الترقية', reduce_wage: 'خفض الأجر بقدر علاوة', demote: 'تنزيل درجة' };
  const SEV_VIO = { minor: ['بسيطة', 'neutral'], moderate: ['متوسطة', 'warning'], serious: ['جسيمة', 'danger'] };
  const SEV_INC = { near_miss: ['شبه حادث', 'info'], first_aid: ['إسعاف أولي', 'neutral'], injury_no_lt: ['إصابة بلا فقد وقت', 'warning'], injury_lti: ['إصابة بفقد وقت (LTI)', 'danger'], serious: ['جسيمة', 'danger'], fatal: ['وفاة', 'danger'], disease: ['مرض مهني', 'danger'] };
  const GROUNDS = ['انتحال شخصية أو تقديم مستندات مزوّرة', 'ارتكاب خطأ نشأ عنه ضرر جسيم', 'تكرار مخالفة تعليمات السلامة بعد إنذار كتابي', 'إفشاء أسرار العمل', 'منافسة صاحب العمل', 'الحضور في حالة سُكر أو تحت تأثير مخدر', 'الاعتداء على صاحب العمل أو المدير المسؤول أو أحد الرؤساء'];
  const ANCHORS = ['أقل بكثير من المتوقع', 'أقل من المتوقع', 'يلبي المتوقع', 'يتجاوز المتوقع', 'استثنائي ويُحتذى به'];
  const cfg = (path, dflt) => { const v = st.get('settings.hrProtect.' + path); return v === undefined ? dflt : v; };
  const setCfg = (path, v) => st.set('settings.hrProtect.' + path, v);

  /* ───────────────────────── حسابات مشتركة (API) ───────────────────────── */
  function skillStatus(es) {
    if (!es || es.level <= 0) return { k: es && es.revoked ? 'revoked' : 'none', label: es && es.revoked ? 'مسحوبة' : 'غير مؤهل', lvl: 0, days: null, cls: 'is-none' };
    const days = es.expiresAt ? dd(T(), es.expiresAt) : null;
    if (days !== null && days < 0) return { k: 'expired', label: 'منتهي', lvl: es.level, days, cls: 'is-exp' };
    if (es.level < 3) return { k: 'train', label: es.level === 1 ? 'تحت التدريب' : 'بإشراف', lvl: es.level, days, cls: 'is-train' };
    if (days !== null && days <= 7) return { k: 'urgent', label: 'ينتهي خلال ' + days + ' ي', lvl: es.level, days, cls: 'is-urgent', alert: 'urgent' };
    if (days !== null && days <= 30) return { k: 'soon', label: 'ينتهي خلال ' + days + ' ي', lvl: es.level, days, cls: 'is-soon', alert: 'action' };
    if (days !== null && days <= 60) return { k: 'soon', label: 'ينتهي خلال ' + days + ' ي', lvl: es.level, days, cls: 'is-soon', alert: 'info' };
    return { k: 'ok', label: 'سارية', lvl: es.level, days, cls: 'is-ok' };
  }
  const skillRow = (empId, skillId) => L('empSkills').find((x) => x.employeeId === empId && x.skillId === skillId) || null;
  const FIT_LBL = { fit: 'لائق', fit_restricted: 'لائق بقيود', unfit: 'غير لائق', expired: 'منتهي — يلزم فحص', none: 'غير مسجّل' };
  /** حالة اللياقة المشتقة — بلا تشخيص أبدًا (يصلح للمشرف ومخطّط الورديات) */
  function fitnessStatus(empId) {
    const r = L('fitness').filter((f) => f.employeeId === empId).sort((a, b) => (a.examDate < b.examDate ? 1 : -1))[0];
    if (!r) return { status: 'none', label: FIT_LBL.none, restrictions: '', validUntil: null, days: null };
    const days = dd(T(), r.nextDue);
    if (days < 0) return { status: 'expired', label: FIT_LBL.expired, restrictions: '', validUntil: r.nextDue, days };
    return { status: r.result, label: FIT_LBL[r.result], restrictions: r.restrictions || '', validUntil: r.nextDue, days };
  }
  /** هل الموظف في إجازة مرضية مثبتة الآن؟ (يقرأ leaveRequests) */
  function sickLeaveBlock(empId) {
    const t = T();
    return L('leaveRequests').find((r) => r.employeeId === empId && /sick/.test(r.type || '') && r.status === 'approved' && r.certified !== false && String(r.from).slice(0, 10) <= t && t <= String(r.to).slice(0, 10)) || null;
  }
  const activeOverride = (empId, skillId) => L('assignOverrides').find((o) => o.employeeId === empId && o.skillId === skillId && o.status === 'active' && new Date(o.validUntil).getTime() > Date.now()) || null;
  /** فحص الإسناد على «الخادم»: توجيه السلامة · اللياقة (حالة فقط) · مستوى المهارة · صلاحية الشهادة */
  function skillCheck(empId, skillId, noAlt) {
    const def = find('skillDefs', skillId); const e = emp(empId); const reasons = [];
    if (!def || !e) return { ok: false, mode: 'hard', reasons: [{ code: 'unknown', strict: true, text: 'تعذّر فحص الشهادة — تم المنع احتياطيًا (fail-closed).' }], alternatives: [], override: null, warnings: [] };
    const sf = skillRow(empId, 'SK-SAFE'); const sfs = skillStatus(sf);
    if (skillId !== 'SK-SAFE' && !(sf && sf.level >= 3 && sfs.k !== 'expired')) reasons.push({ code: 'induction', strict: true, text: 'لم يُكمل ' + e.name + ' توجيه السلامة.' });
    const fit = fitnessStatus(empId);
    if (def.type === 'machine' && (fit.status === 'unfit' || fit.status === 'expired')) reasons.push({ code: 'fitness', strict: true, text: fit.status === 'unfit' ? 'حالة اللياقة: غير لائق.' : 'اللياقة الطبية منتهية — يلزم فحص دوري.' });
    if (def.type === 'machine') {
      const es = skillRow(empId, skillId); const ss = skillStatus(es);
      const strict = def.block === 'hard'; const soft = def.block === 'soft';
      if (!es || es.level < def.requiredLevel || ss.k === 'revoked') reasons.push({ code: 'level', strict, soft, warn: def.block === 'warn', text: 'مستوى «' + def.name + '» ' + (es ? es.level : 0) + ' أقل من المطلوب (' + def.requiredLevel + ').' });
      else if (ss.k === 'expired') reasons.push({ code: 'expired', strict, soft, warn: def.block === 'warn', text: 'شهادة «' + def.name + '» منتهية منذ ' + fd(es.expiresAt) + '. جدّد الشهادة أو اختر بديلًا.' });
    }
    const strictR = reasons.filter((r) => r.strict); const softR = reasons.filter((r) => r.soft && !r.strict); const warnR = reasons.filter((r) => r.warn);
    const ov = softR.length && !strictR.length ? activeOverride(empId, skillId) : null;
    const ok = !strictR.length && (!softR.length || !!ov);
    const alternatives = noAlt ? [] : emps().filter((x) => OPS.indexOf(x.id) >= 0 && x.id !== empId && x.status !== 'leave' && skillCheck(x.id, skillId, true).ok).slice(0, 4).map((x) => x.id);
    return { ok, mode: strictR.length ? 'hard' : softR.length ? 'soft' : warnR.length ? 'warn' : null, reasons, warnings: warnR, alternatives, override: ov, needsOverride: !ok && !strictR.length && softR.length > 0 };
  }
  /** إسناد فعلي: يفحص ثم يسجّل الرفض (عالي) ويُخطر — تستدعيه وحدة الورديات HR-09 */
  function assignMachine(empId, skillId, o) {
    o = o || {}; const res = skillCheck(empId, skillId); const def = find('skillDefs', skillId); const e = emp(empId);
    if (!res.ok) {
      aud('HR.TRN.ASSIGNMENT_BLOCKED', 'employee', empId, e ? e.name : empId, { after: { الماكينة: def ? def.name : skillId, الأسباب: res.reasons.map((r) => r.code), الوضع: res.mode }, reason: res.reasons.map((r) => r.text).join(' · '), via: o.via || 'web' });
      notify('إسناد ماكينة مرفوض', 'تعذّر إسناد موظف لماكينة (التفاصيل في شاشة التدريب).', 'urgent', ['R-14', 'R-05', 'R-15'], '#/hr/training?tab=rules');
    }
    return res;
  }
  const attRows = (empId) => L('attendance').filter((a) => a.employeeId === empId);
  const attStats = (empId) => { const r = attRows(empId); const total = r.length; const present = r.filter((a) => a.status === 'present' || a.status === 'late').length; return { total, present, late: r.filter((a) => a.status === 'late').length, absent: r.filter((a) => a.status === 'absent').length, pct: total ? Math.round((present / total) * 100) : null }; };
  /** مؤشرات السلامة LTIFR/TRIR… من الـstore مباشرة (BR-OHS-12) */
  function safetyKpis(months) {
    months = months || cfg('ohs.periodMonths', 12); const since = Date.now() - months * 30.4375 * 86400000;
    const inc = L('incidents').filter((i) => new Date(i.occurredAt).getTime() >= since && i.status !== 'void');
    const isLti = (i) => i.severity === 'injury_lti' || i.severity === 'serious' || i.severity === 'fatal';
    const lti = inc.filter(isLti).length; const recordable = inc.filter((i) => i.recordable).length; const nearMiss = inc.filter((i) => i.severity === 'near_miss').length; const lostDays = inc.reduce((a, i) => a + (isLti(i) ? (i.lostDays || 0) : 0), 0);
    const hours12 = cfg('ohs.hours12m', null); const hours = hours12 == null ? null : Math.round(hours12 * months / 12);
    const base1 = cfg('ohs.ltifrBase', 1000000), base2 = cfg('ohs.trirBase', 200000);
    const ok = hours != null && hours > 0;
    const lastLti = L('incidents').filter(isLti).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))[0];
    return { months, lti, recordable, nearMiss, lostDays, hours, base1, base2, ltifr: ok ? lti * base1 / hours : null, trir: ok ? recordable * base2 / hours : null, severityRate: ok ? lostDays * base1 / hours : null, nearMissRatio: recordable ? nearMiss / recordable : null, daysSinceLti: lastLti ? dd(String(lastLti.occurredAt).slice(0, 10), T()) : null, total: inc.length };
  }


  /* ───────────── مواءمة مع سجلات وحدة «خدماتي/فريقي» (violations / incidents) ─────────────
     وحدة ESS تكتب في نفس المجموعتين بشكل أخف: violations {employeeId, reporterId(empId), type, date, description, status, channel}
     و incidents {type, location, description, employeeId, reporterId, severity:'high|medium', status, channel, createdAt}.
     هذه الدالة (متكررة وآمنة) تُكمل الحقول الناقصة فتصبح السجلات قابلة للفرز والتحقيق هنا. */
  const userOfEmp = (id) => { const e = emp(id); return e && e.userId ? e.userId : id; };
  function normalizeAll() {
    if (!st.get('meta.hrProtectSeeded')) return;
    const needV = L('violations').some((v) => v.kind === undefined || v.discoveredAt === undefined);
    if (needV) st.update('violations', (l) => l.forEach((v) => {
      if (v.kind !== undefined && v.discoveredAt !== undefined) return;
      const cat = L('penaltyCatalog').find((c) => v.type && c.name.indexOf(String(v.type)) >= 0) || L('penaltyCatalog').find((c) => c.id === 'V-99');
      v.kind = v.kind || 'violation'; v.catalogId = v.catalogId || (cat ? cat.id : 'V-99'); v.title = v.title || v.type || 'مخالفة';
      v.reportedBy = v.reportedBy || userOfEmp(v.reporterId); v.discoveredAt = v.discoveredAt || v.date || String(v.createdAt || new Date().toISOString()).slice(0, 10);
      v.reportedAt = v.reportedAt || v.createdAt || new Date().toISOString(); v.status = v.status || 'reported'; v.investigatorId = v.investigatorId || null; v.minutes = v.minutes || null; v.decision = v.decision || null;
      v.log = v.log || [{ at: v.reportedAt, by: v.reportedBy, text: 'بلاغ من المشرف عبر «فريقي»' }];
    }));
    const needI = L('incidents').some((i) => i.classified === undefined);
    if (needI) st.update('incidents', (l) => l.forEach((i) => {
      if (i.classified !== undefined) return;
      const t = ({ injury: 'injury', near_miss: 'near_miss', hazard: 'unsafe', other: 'damage', unsafe: 'unsafe', damage: 'damage' })[i.type] || 'near_miss';
      i.type = t; i.severity = SEV_INC[i.severity] ? i.severity : (t === 'injury' ? 'first_aid' : 'near_miss'); i.classified = false;
      i.occurredAt = i.occurredAt || i.createdAt || new Date().toISOString(); i.reportedAt = i.reportedAt || i.createdAt || i.occurredAt;
      i.personId = i.personId !== undefined ? i.personId : (i.employeeId || null); i.reporterId = userOfEmp(i.reporterId); i.bodyPart = i.bodyPart || ''; i.photos = i.photos != null ? i.photos : (i.photo ? 1 : 0);
      i.recordable = !!i.recordable; i.lostDays = i.lostDays || 0; i.serious = !!i.serious; i.investigation = i.investigation || null; i.capas = i.capas || []; i.injury = i.injury || null; i.status = i.status || 'reported';
    }));
  }
  /** يدمج بذور الوحدة مع ما كتبته وحدات أخرى قبل البذر؛ لو تعارض رقم يُعاد ترقيم السجل الوارد */
  function mergeColl(coll, rows, prefix) {
    const keep = L(coll).filter((x) => x && x.id).map((x) => Object.assign({}, x));
    let max = 0; rows.concat(keep).forEach((r) => { const m = new RegExp('^' + prefix + '-(\\d+)$').exec(r.id); if (m) max = Math.max(max, +m[1]); });
    keep.forEach((x) => { if (rows.some((r) => r.id === x.id)) { max++; x.id = prefix + '-' + String(max).padStart(4, '0'); } });
    st.set(coll, rows.concat(keep));
  }

  /* ───────────────────────── البذر (مرة واحدة) ───────────────────────── */
  function ensureSeed() {
    if (st.get('meta.hrProtectSeeded') || !st.get('employees')) return;
    try { seedAll(); } catch (e) { console.error('[hr-protect] seed failed', e); }
    st.set('meta.hrProtectSeeded', true);
  }
  function seedAll() {
    const now = new Date(); const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const P = (coll, rows) => st.set(coll, rows);
    /* الإعدادات — القيم القانونية Pending [Law] وتأتي من هنا لا من الكود */
    st.update('settings', (s) => {
      s.hrProtect = {
        discipline: { regulationActive: true, regulationLabel: 'لائحة تنظيم العمل — نسخة تجريبية للنموذج (القرار D10 Open)', regulationEffective: D(-30), capPerViolationDays: 5, capPerMonthDays: 5, managerMaxDays: 3, dayBasis: null, investigationStartDays: 7, signingDeadlineDays: 30, grievanceDays: null, suspensionMaxDays: 60 },
        ohs: { hours12m: 350000, hoursSource: 'manual', includeContractors: null, periodMonths: 12, ltifrBase: 1000000, trirBase: 200000, seriousDefinition: null, committeeRequired: null },
        training: { alertDays: [60, 30, 7, 0], minAttendancePct: null, overrideMaxHours: null },
        survey: { minGroupSize: null },
        harassmentHandlers: ['U-08'],
        performance: { windowDays: 14, minServiceDays: null, calibrationMinPct: null, selfGapFlag: null, probationMaxDays: 90 },
        retention: { bradfordThreshold: null, lateRule: 2 }
      };
    });
    /* إجازة مرضية مثبتة لموظف (تغذي حظر الفصل) */
    if (!L('leaveRequests').some((r) => r.employeeId === 'E-1025' && /sick/.test(r.type))) {
      st.insert('leaveRequests', { id: seqId('leaveRequests', 'LV', 4, Y()), employeeId: 'E-1025', type: 'sick', from: D(-2), to: D(5), days: 8, status: 'approved', approverEmpId: 'E-1014', reason: 'إجازة مرضية بتقرير طبي معتمد (تجريبي)', createdAt: AGO(2), certified: true, source: 'hr-protect-demo' });
    }

    /* ── HR-18 ── */
    const crit = (id, title, w, src) => ({ id, title, weight: w, source: src || 'manual', anchors: ANCHORS.slice() });
    P('apprTemplates', [
      { id: 'TPL-01', name: 'مشغّل إنتاج', family: 'مشغّل', version: 2, status: 'approved', selfRating: 'optional', updatedAt: AGO(40), criteria: [crit('K1', 'جودة العمل', 25), crit('K2', 'الالتزام بتعليمات السلامة', 20), crit('K3', 'الإنتاجية', 20), crit('K4', 'الحضور والانضباط', 15, 'attendance'), crit('K5', 'العمل الجماعي', 10), crit('K6', 'الالتزام بالتدريب', 10, 'training')] },
      { id: 'TPL-02', name: 'إداري / مكتبي', family: 'إداري', version: 1, status: 'approved', selfRating: 'optional', updatedAt: AGO(90), criteria: [crit('K1', 'جودة وإتقان المهام', 30), crit('K2', 'الالتزام بالمواعيد', 25), crit('K3', 'التواصل والتعاون', 25), crit('K4', 'الحضور والانضباط', 20, 'attendance')] },
      { id: 'TPL-03', name: 'مبيعات', family: 'مبيعات', version: 1, status: 'draft', selfRating: 'off', updatedAt: AGO(5), criteria: [crit('K1', 'تحقيق المستهدف', 40), crit('K2', 'خدمة العميل', 30), crit('K3', 'الالتزام بالتقارير', 30)] }
    ]);
    P('apprCycles', [{ id: 'AC-2026-H2', name: 'تقييم الأداء — النصف الثاني 2026', scope: 'خط الإنتاج (الألومنيوم · uPVC · الدهان · التركيب)', startsOn: D(-9), endsOn: D(5), status: 'open', templateId: 'TPL-01', selfRating: 'optional', createdBy: 'U-08', createdAt: AGO(9) },
      { id: 'AC-2026-H1', name: 'تقييم الأداء — النصف الأول 2026', scope: 'كل الأقسام', startsOn: D(-200), endsOn: D(-180), status: 'closed', templateId: 'TPL-02', selfRating: 'off', createdBy: 'U-08', createdAt: AGO(200) }]);
    const rate = (scores) => TPL1().criteria.map((c, i) => ({ criterionId: c.id, score: scores[i], comment: scores[i] === 5 || scores[i] === 1 ? 'سبب الدرجة مكتوب (بيانات تجريبية)' : '' }));
    const TPL1 = () => find('apprTemplates', 'TPL-01') || { criteria: [] };
    const apprs = [
      ['E-1017', 'final', [4, 4, 5, 4, 3, 4], 'raise'], ['E-1020', 'supervisor', [4, 3, 4, 5, 4, 3], 'training'], ['E-1021', 'supervisor', [3, 2, 3, 2, 3, 2], 'training'], ['E-1022', 'supervisor', [5, 5, 4, 4, 4, 5], 'promotion'],
      ['E-1023', 'supervisor', [3, 3, 3, 4, 3, 3], 'none'], ['E-1024', 'supervisor', [4, 4, 3, 3, 4, 4], 'raise'], ['E-1026', 'self', null, null], ['E-1027', 'not_started', null, null], ['E-1028', 'not_started', null, null], ['E-1029', 'supervisor', [3, 4, 3, 3, 2, 3], 'none'], ['E-1030', 'not_started', null, null]
    ];
    const tpl = TPL1();
    const wscore = (rs) => (rs && rs.length ? Math.round(rs.reduce((a, r) => a + r.score * (tpl.criteria.find((c) => c.id === r.criterionId) || { weight: 0 }).weight, 0)) / 100 : null);
    P('appraisals', apprs.map((a, i) => { const rs = a[2] ? rate(a[2]) : []; const w = wscore(rs); return { id: 'APR-2026-' + String(i + 1).padStart(4, '0'), cycleId: 'AC-2026-H2', employeeId: a[0], supervisorEmpId: (emp(a[0]) || {}).managerEmpId || 'E-1014', templateId: 'TPL-01', templateVersion: 2, status: a[1], ratings: rs, selfRatings: a[1] === 'self' ? [{ criterionId: 'K1', score: 4, comment: '' }, { criterionId: 'K2', score: 4, comment: '' }, { criterionId: 'K3', score: 3, comment: '' }, { criterionId: 'K4', score: 4, comment: '' }, { criterionId: 'K5', score: 4, comment: '' }, { criterionId: 'K6', score: 3, comment: '' }] : [], weighted: w, final: a[1] === 'final' ? w : null, recommendation: a[3] || null, calibrations: [], onBehalf: false, submittedAt: rs.length ? AGO(2 + i) : null, outcome: null }; }));
    P('probationEvals', [{ id: 'PE-001', employeeId: 'E-1031', startDate: D(-64), checkpoints: [{ day: 30, scores: [4, 3, 4, 3], recommendation: 'confirm', by: 'U-27', at: AGO(34), note: 'تجربة أولية جيدة (بيانات تجريبية)' }], decision: null }]);

    /* ── HR-19 ── */
    P('skillDefs', [
      { id: 'SK-SAFE', name: 'توجيه السلامة (شرط تشغيل لكل الماكينات)', type: 'safety', block: 'hard', requiredLevel: 3, validityMonths: null, critical: true },
      { id: 'SK-CNC', name: 'ماكينة قص CNC — خط الألومنيوم', type: 'machine', block: 'hard', requiredLevel: 3, validityMonths: 24, critical: true },
      { id: 'SK-WELD', name: 'ماكينة لحام ملفات uPVC', type: 'machine', block: 'soft', requiredLevel: 3, validityMonths: 24, critical: false },
      { id: 'SK-PAINT', name: 'فرن الدهان والتشطيب', type: 'machine', block: 'soft', requiredLevel: 3, validityMonths: 12, critical: false },
      { id: 'SK-PRESS', name: 'مكبس التجميع', type: 'machine', block: 'warn', requiredLevel: 2, validityMonths: 36, critical: false },
      { id: 'SK-FORK', name: 'رافعة شوكية', type: 'machine', block: 'hard', requiredLevel: 3, validityMonths: 12, critical: true }
    ]);
    const ES = [['E-1017', 'SK-SAFE', 3, 400, null], ['E-1017', 'SK-CNC', 4, 300, 430], ['E-1017', 'SK-WELD', 3, 250, 480], ['E-1017', 'SK-PAINT', 2, 100, 265], ['E-1017', 'SK-FORK', 3, 200, 165],
      ['E-1020', 'SK-SAFE', 3, 380, null], ['E-1020', 'SK-CNC', 3, 700, 18], ['E-1020', 'SK-PRESS', 3, 300, 790],
      ['E-1021', 'SK-SAFE', 3, 500, null], ['E-1021', 'SK-CNC', 3, 742, -12], ['E-1021', 'SK-WELD', 2, 90, 640],
      ['E-1022', 'SK-SAFE', 3, 450, null], ['E-1022', 'SK-WELD', 3, 725, 5], ['E-1022', 'SK-CNC', 2, 120, 610],
      ['E-1023', 'SK-SAFE', 3, 330, null], ['E-1023', 'SK-PRESS', 3, 200, 895], ['E-1023', 'SK-PAINT', 3, 340, 25],
      ['E-1024', 'SK-SAFE', 3, 600, null], ['E-1024', 'SK-WELD', 4, 600, 130], ['E-1024', 'SK-PRESS', 3, 240, 855],
      ['E-1025', 'SK-SAFE', 3, 280, null], ['E-1025', 'SK-PAINT', 3, 120, 245],
      ['E-1026', 'SK-SAFE', 3, 310, null], ['E-1026', 'SK-PAINT', 3, 65, 300], ['E-1026', 'SK-FORK', 3, 265, 100],
      ['E-1027', 'SK-SAFE', 3, 250, null], ['E-1027', 'SK-PRESS', 3, 150, 945], ['E-1027', 'SK-CNC', 1, 40, null],
      ['E-1028', 'SK-SAFE', 3, 260, null], ['E-1028', 'SK-FORK', 3, 340, 25], ['E-1028', 'SK-PRESS', 2, 100, 995],
      ['E-1029', 'SK-SAFE', 3, 240, null], ['E-1029', 'SK-WELD', 3, 100, 630],
      ['E-1030', 'SK-SAFE', 3, 350, null], ['E-1030', 'SK-PAINT', 3, 405, -40], ['E-1030', 'SK-CNC', 3, 165, 565],
      ['E-1031', 'SK-CNC', 1, 20, null]];
    P('empSkills', ES.map((r, i) => ({ id: 'ES-' + String(i + 1).padStart(3, '0'), employeeId: r[0], skillId: r[1], level: r[2], certifiedBy: 'U-28', issuedAt: D(-r[3]), expiresAt: r[4] == null ? null : D(r[4]), proof: r[2] >= 3 ? 'proof-' + r[0] + '-' + r[1] + '.pdf (تجريبي)' : null, revoked: false })));
    P('assignOverrides', []);
    P('courses', [
      { id: 'C-SAF-01', name: 'توجيه السلامة للعاملين الجدد', category: 'سلامة', hours: 4, issuesCert: true, validityMonths: null, provider: 'internal', safetyCritical: true, needsClawback: false, skillId: 'SK-SAFE', active: true, cost: 0 },
      { id: 'C-FIRE-01', name: 'مكافحة الحريق والإخلاء', category: 'سلامة', hours: 3, issuesCert: true, validityMonths: 12, provider: 'external', safetyCritical: true, needsClawback: false, skillId: null, active: true, cost: 1500 },
      { id: 'C-CNC-01', name: 'تشغيل ماكينة قص CNC', category: 'تشغيل ماكينة', hours: 16, issuesCert: true, validityMonths: 24, provider: 'external', safetyCritical: true, needsClawback: true, skillId: 'SK-CNC', active: true, cost: 6000 },
      { id: 'C-WELD-01', name: 'لحام ملفات uPVC', category: 'تشغيل ماكينة', hours: 12, issuesCert: true, validityMonths: 24, provider: 'internal', safetyCritical: false, needsClawback: false, skillId: 'SK-WELD', active: true, cost: 800 },
      { id: 'C-FORK-01', name: 'قيادة الرافعة الشوكية', category: 'تشغيل ماكينة', hours: 20, issuesCert: true, validityMonths: 12, provider: 'external', safetyCritical: true, needsClawback: true, skillId: 'SK-FORK', active: true, cost: 6000 },
      { id: 'C-DRAW-01', name: 'قراءة الرسومات الفنية', category: 'مهارات مهنية', hours: 8, issuesCert: false, validityMonths: null, provider: 'internal', safetyCritical: false, needsClawback: false, skillId: null, active: true, cost: 0 }
    ]);
    P('trainingSessions', [
      { id: 'TS-2026-001', courseId: 'C-CNC-01', startsAt: D(-60), location: 'قاعة التدريب — المصنع', trainer: 'مدرب خارجي (تجريبي)', seats: 6, estCost: 6000, actualCost: 5400, status: 'closed', participants: [{ employeeId: 'E-1017', present: true, result: 'passed' }, { employeeId: 'E-1030', present: true, result: 'passed' }, { employeeId: 'E-1027', present: true, result: 'failed' }] },
      { id: 'TS-2026-002', courseId: 'C-CNC-01', startsAt: D(6), location: 'قاعة التدريب — المصنع', trainer: 'مدرب مستوى 4: مصطفى عوض', seats: 6, estCost: 4000, actualCost: null, status: 'published', participants: [{ employeeId: 'E-1021', present: null, result: null }, { employeeId: 'E-1020', present: null, result: null }] },
      { id: 'TS-2026-003', courseId: 'C-SAF-01', startsAt: D(2), location: 'مكتب السلامة', trainer: 'عبير الشافعي — مسؤولة السلامة', seats: 10, estCost: 0, actualCost: null, status: 'published', participants: [{ employeeId: 'E-1031', present: null, result: null }] }
    ]);
    P('jobRequired', [
      { id: 'JR-01', positionId: 'P-08', kind: 'skill', refId: 'SK-SAFE', timing: 'before_operate', critical: true }, { id: 'JR-02', positionId: 'P-08', kind: 'course', refId: 'C-FIRE-01', timing: 'recurring', critical: true },
      { id: 'JR-03', positionId: 'P-09', kind: 'skill', refId: 'SK-PAINT', timing: 'before_operate', critical: false }, { id: 'JR-04', positionId: 'P-10', kind: 'course', refId: 'C-DRAW-01', timing: 'within_days', critical: false }
    ]);
    P('clawbacks', [
      { id: 'CB-2026-001', employeeId: 'E-1028', courseId: 'C-FORK-01', cost: 6000, stayMonths: 24, mode: 'pro_rata', signedAt: D(-290), signedFile: 'agreement-E-1028.pdf (تجريبي)', startsOn: D(-270), status: 'active', trainingStart: D(-270) },
      { id: 'CB-2026-002', employeeId: 'E-1017', courseId: 'C-CNC-01', cost: 4500, stayMonths: 12, mode: 'full', signedAt: null, signedFile: null, startsOn: null, status: 'draft', trainingStart: D(6) },
      { id: 'CB-2026-003', employeeId: 'E-1016', courseId: 'C-WELD-01', cost: 3000, stayMonths: 18, mode: 'pro_rata', signedAt: D(-330), signedFile: 'agreement-E-1016.pdf (تجريبي)', startsOn: D(-300), status: 'active', trainingStart: D(-300) }
    ]);
    P('trainingNeeds', [
      { id: 'TN-2026-001', employeeId: 'E-1021', need: 'تجديد شهادة ماكينة CNC (منتهية)', courseId: 'C-CNC-01', source: 'gap', sourceRef: 'مصفوفة المهارات', priority: 'high', status: 'scheduled', sessionId: 'TS-2026-002', createdAt: AGO(12) },
      { id: 'TN-2026-002', employeeId: 'E-1031', need: 'توجيه السلامة قبل التشغيل', courseId: 'C-SAF-01', source: 'gap', sourceRef: 'مصفوفة المهارات', priority: 'high', status: 'scheduled', sessionId: 'TS-2026-003', createdAt: AGO(4) },
      { id: 'TN-2026-003', employeeId: 'E-1028', need: 'مناولة آمنة للأحمال (CAPA حادث)', courseId: null, source: 'capa', sourceRef: 'INC-2026-0006', priority: 'high', status: 'proposed', sessionId: null, createdAt: AGO(5) }
    ]);

    /* ── HR-20 ── */
    const V = (id, name, sev, clause, pens, days, mgr) => ({ id, name, severity: sev, clause, allowed: pens, deductionDays: days, managerCanDecide: mgr, active: true });
    P('penaltyCatalog', [V('V-01', 'التأخر عن بدء الوردية دون إذن', 'minor', 'مادة 12 (تجريبي)', ['warning', 'deduction'], 1, true), V('V-02', 'ترك موقع العمل أثناء الوردية دون إذن', 'minor', 'مادة 13 (تجريبي)', ['warning', 'deduction'], 2, true), V('V-03', 'عدم ارتداء معدات الوقاية الشخصية', 'moderate', 'مادة 18 (تجريبي)', ['warning', 'deduction', 'defer_raise'], 2, true), V('V-04', 'الإهمال في تشغيل الماكينة', 'moderate', 'مادة 19 (تجريبي)', ['warning', 'deduction', 'defer_raise'], 3, true), V('V-05', 'مخالفة تعليمات السلامة المعلنة', 'serious', 'مادة 21 (تجريبي)', ['warning', 'deduction', 'withhold_half_raise', 'defer_promotion'], 4, false), V('V-06', 'الإخلال بسلامة الخامات أو المنتج', 'serious', 'مادة 22 (تجريبي)', ['warning', 'deduction', 'defer_promotion'], 5, false), V('V-07', 'السلوك المسيء أو التشاجر داخل المصنع', 'serious', 'مادة 24 (تجريبي)', ['warning', 'deduction', 'defer_promotion', 'demote'], 5, false), V('V-99', 'أخرى (تُراجَع بواسطة HR)', 'moderate', '—', ['warning', 'deduction'], 1, false)]);
    const mins = (txt) => ({ heldAt: D(-3), attendees: 'المحقق · الموظف · شاهد (تجريبي)', statements: txt, defence: 'أقوال الموظف ودفاعه مدوّنة (بيانات تجريبية).', oralException: false, recommendation: 'إنذار كتابي', savedAt: AGO(3), savedBy: 'U-08' });
    mergeColl('violations', [
      { id: 'VIO-2026-0001', kind: 'violation', employeeId: 'E-1021', catalogId: 'V-03', description: 'لم يرتدِ نظارة الوقاية أثناء تشغيل ماكينة القص (بلاغ تجريبي).', reportedBy: 'U-27', discoveredAt: D(-2), reportedAt: AGO(1.8), status: 'reported', investigatorId: null, notifiedAt: null, hearingAt: null, minutes: null, decision: null, log: [{ at: AGO(1.8), by: 'U-27', text: 'بلاغ من المشرف المباشر' }] },
      { id: 'VIO-2026-0002', kind: 'violation', employeeId: 'E-1023', catalogId: 'V-02', description: 'غادر موقع العمل ساعة ونصف دون استئذان (بلاغ تجريبي).', reportedBy: 'U-27', discoveredAt: D(-9), reportedAt: AGO(8.5), status: 'hearing', investigatorId: 'U-08', notifiedAt: D(-6), notifyMethod: 'hand', hearingAt: D(1), minutes: null, decision: null, log: [{ at: AGO(8.5), by: 'U-27', text: 'بلاغ من المشرف المباشر' }, { at: AGO(7), by: 'U-08', text: 'فتح الملف وتعيين المحقق' }, { at: AGO(6), by: 'U-25', text: 'تسليم الإخطار باليد وتوقيع الاستلام' }] },
      { id: 'VIO-2026-0003', kind: 'violation', employeeId: 'E-1022', catalogId: 'V-01', description: 'تأخر متكرر عن بدء الوردية (بيانات تجريبية).', reportedBy: 'U-27', discoveredAt: D(-20), reportedAt: AGO(19), status: 'delivered', investigatorId: 'U-08', notifiedAt: D(-14), notifyMethod: 'hand', hearingAt: D(-10), minutes: mins('أقوال المخالف وشهادة المشرف.'), decision: { penalty: 'deduction', days: 2, reasons: 'تأخر متكرر ثابت بسجل الحضور وبعد التنبيه الشفهي ولم يقدم عذرًا مقبولًا (تسبيب تجريبي).', decidedBy: 'U-08', decidedAt: monthStart, delivered: true, deliveredAt: monthStart, method: 'hand' }, log: [{ at: AGO(19), by: 'U-27', text: 'بلاغ من المشرف المباشر' }, { at: AGO(5), by: 'U-08', text: 'قرار جزاء: خصم 2 يوم' }] },
      { id: 'VIO-2026-0004', kind: 'violation', employeeId: 'E-1025', catalogId: 'V-05', description: 'تجاوز حدود المنطقة الآمنة أثناء تشغيل ماكينة الدهان للمرة الثانية بعد إنذار كتابي (بيانات تجريبية).', reportedBy: 'U-27', discoveredAt: D(-25), reportedAt: AGO(24), status: 'hearing', investigatorId: 'U-08', notifiedAt: D(-20), notifyMethod: 'hand', hearingAt: D(-15), minutes: mins('وقائع التجاوز المتكرر وإنذار سابق موثّق.'), decision: null, log: [{ at: AGO(24), by: 'U-27', text: 'بلاغ من المشرف المباشر' }, { at: AGO(15), by: 'U-08', text: 'حفظ محضر التحقيق' }] },
      { id: 'VIO-2026-0005', kind: 'note', employeeId: 'E-1020', catalogId: null, description: 'توجيه شفهي بخصوص ترتيب الأدوات في نهاية الوردية (ملاحظة — لا جزاء).', reportedBy: 'U-27', discoveredAt: D(-4), reportedAt: AGO(4), status: 'noted', investigatorId: null, minutes: null, decision: null, log: [{ at: AGO(4), by: 'U-27', text: 'ملاحظة مسجّلة' }] },
      { id: 'VIO-2026-0006', kind: 'violation', employeeId: 'E-1027', catalogId: 'V-07', description: 'مشادة حادة مع زميل أثناء الوردية (بيانات تجريبية).', reportedBy: 'U-27', discoveredAt: D(-18), reportedAt: AGO(17), status: 'hearing', investigatorId: 'U-08', notifiedAt: D(-12), notifyMethod: 'hand', hearingAt: D(-8), minutes: mins('أقوال الطرفين والشهود.'), decision: null, log: [{ at: AGO(17), by: 'U-27', text: 'بلاغ من المشرف المباشر' }, { at: AGO(8), by: 'U-08', text: 'حفظ محضر التحقيق' }] }
    ], 'VIO-2026');
    P('grievances', [{ id: 'GRV-2026-0001', employeeId: 'E-1022', violationId: 'VIO-2026-0003', reason: 'أعترض على الخصم لأن التأخر كان بسبب انقطاع المواصلات (نص تجريبي).', filedAt: AGO(3), dueAt: null, stage: 'under_review', outcome: null, decidedBy: null }]);
    P('harassment', [{ id: 'HAR-2026-0001', followCode: 'HAR-7K3Q-92', complainantId: null, againstId: 'E-1029', description: 'شكوى سرية: تعليقات مسيئة متكررة داخل الوردية (نص تجريبي بلا تفاصيل حقيقية).', receivedAt: AGO(2), status: 'received', handlerNote: '', conflict: false, log: [{ at: AGO(2), text: 'استُلمت الشكوى عبر القناة السرية' }] }]);
    P('dismissals', []);
    P('legalCases', [{ id: 'LGL-2026-0001', court: 'المحكمة العمالية — المنصورة (تجريبي)', caseNo: '123 لسنة 2026 (تجريبي)', subject: 'تعويض عن إنهاء خدمة — موظف سابق', plaintiff: 'كريم زكريا (EMP-0016)', defendant: 'الشركة', claim: 48000, lawyer: 'مكتب محاماة (تجريبي)', status: 'hearing_scheduled', hearings: [{ date: D(-20), result: 'تأجيل للمستندات', note: '' }, { date: D(6), result: null, note: 'جلسة قادمة' }], outcome: null, provision: null, source: 'manual', openedAt: AGO(60) }]);

    /* ── HR-21 ── */
    const INC = [['0001', 'injury', 'injury_no_lt', 90, 'خط التركيب', 'E-1027', 'جرح سطحي بالقطع أثناء التركيب', 0, true, 'closed'], ['0002', 'injury', 'injury_lti', 150, 'مكبس التجميع', 'E-1020', 'رضوض بالإصبع في المكبس', 3, true, 'closed'], ['0003', 'injury', 'injury_no_lt', 200, 'خط الألومنيوم', 'E-1029', 'تهيّج بالعين من غبار القص', 0, true, 'closed'], ['0004', 'injury', 'injury_no_lt', 250, 'الدهان والتشطيب', 'E-1024', 'استنشاق أبخرة — علاج بالمستوصف', 0, true, 'closed'], ['0005', 'injury', 'first_aid', 12, 'خط الألومنيوم', 'E-1021', 'شظية صغيرة — إسعاف أولي وتنظيف', 0, false, 'investigating'], ['0006', 'injury', 'injury_lti', 6, 'منطقة التحميل', 'E-1028', 'سقوط جسم على القدم أثناء التحميل', 4, true, 'capa']];
    const NM = [['خط uPVC', 'انزلاق أداة من الطاولة دون إصابة'], ['خط الألومنيوم', 'كابل مكشوف قرب ماكينة القص'], ['الدهان والتشطيب', 'تسريب بسيط من عبوة مذيب'], ['منطقة التحميل', 'رافعة شوكية بسرعة زائدة'], ['خط التركيب', 'سلّم غير مثبت'], ['خط uPVC', 'حاجز حماية مفكوك'], ['المخزن', 'ارتفاع تخزين غير آمن'], ['خط الألومنيوم', 'تراكم غبار حول الشفط'], ['الدهان والتشطيب', 'سدادة أذن غير متوفرة'], ['منطقة التحميل', 'أرضية زلقة'], ['خط التركيب', 'مخرج طوارئ مسدود جزئيًا'], ['المخزن', 'ملصق تحذير ممسوح']];
    const incs = INC.map((r) => ({ id: 'INC-2026-' + r[0], type: r[1], severity: r[2], occurredAt: AGO(r[3]), reportedAt: AGO(r[3]), location: r[4], description: r[6], reporterId: 'U-27', personId: r[5], bodyPart: 'ملاحظة T4 تجريبية', photos: r[0] === '0006' ? 1 : 0, recordable: r[8], lostDays: r[7], status: r[9], serious: false, investigation: r[9] === 'closed' || r[9] === 'capa' ? { causes: ['سبب جذري موثّق (بيانات تجريبية)'], category: 'طريقة', investigatorId: 'U-28', completedAt: AGO(r[3] - 1) } : null, capas: [], injury: r[1] === 'injury' && r[7] > 0 ? { firstAidAt: AGO(r[3]), facility: 'مستوصف المصنع / مستشفى (تجريبي)', insuranceTaskId: null, returnToWorkAt: r[0] === '0006' ? null : D(-r[3] + r[7] + 1), lostDays: r[7] } : null }));
    NM.forEach((n, i) => incs.push({ id: 'INC-2026-' + String(7 + i).padStart(4, '0'), type: i % 4 === 1 ? 'unsafe' : 'near_miss', severity: 'near_miss', occurredAt: AGO(8 + i * 27), reportedAt: AGO(8 + i * 27), location: n[0], description: n[1], reporterId: i % 2 ? 'U-27' : 'U-28', personId: null, bodyPart: '', photos: i % 3 === 0 ? 1 : 0, recordable: false, lostDays: 0, status: i < 3 ? 'reported' : 'closed', serious: false, investigation: null, capas: [], injury: null }));
    incs.find((x) => x.id === 'INC-2026-0006').capas = [{ id: 'CAPA-01', type: 'corrective', description: 'تركيب حاجز حماية على خط التحميل', ownerId: 'U-13', dueOn: D(10), status: 'in_progress', evidence: null, verifiedAt: null }, { id: 'CAPA-02', type: 'preventive', description: 'تدريب فريق التحميل على المناولة الآمنة', ownerId: 'U-28', dueOn: D(3), status: 'open', evidence: null, verifiedAt: null }];
    incs.find((x) => x.id === 'INC-2026-0005').capas = [{ id: 'CAPA-01', type: 'corrective', description: 'استبدال نظارات الوقاية المخدوشة بالخط', ownerId: 'U-13', dueOn: D(-1), status: 'awaiting_verification', evidence: 'صور التركيب (تجريبي)', verifiedAt: null }];
    incs.find((x) => x.id === 'INC-2026-0006').injury.insuranceTaskId = 'RT-2026-001';
    mergeColl('incidents', incs, 'INC-2026');
    P('regTasks', [{ id: 'RT-2026-001', incidentId: 'INC-2026-0006', title: 'إخطار التأمينات الاجتماعية بإصابة العمل', authority: 'هيئة التأمينات الاجتماعية', basis: 'مادة 63 قانون 148/2019 — Pending', due: null, assignee: 'U-28', status: 'open', proof: null, createdAt: AGO(6), createdBy: 'U-28', doneBy: null }, { id: 'RT-2026-002', incidentId: null, title: 'الإحصاء نصف السنوي للإصابات (يناير/يوليو) — منشأة 30+ عاملًا', authority: 'الجهة المختصة بالسلامة {Open}', basis: 'Pending — قرارات 2026 لم تُقرأ', due: null, assignee: 'U-28', status: 'open', proof: null, createdAt: AGO(30), createdBy: 'U-28', doneBy: null }]);
    const FIT = [['E-1017', 'fit', 200, 165, '', ''], ['E-1020', 'fit', 150, 215, '', ''], ['E-1021', 'fit', 330, 35, '', ''], ['E-1022', 'fit', 400, -35, '', ''], ['E-1023', 'fit', 100, 265, '', ''], ['E-1024', 'fit_restricted', 120, 245, 'لا رفع فوق 15 كجم', 'ملاحظة طبية تجريبية (T4)'], ['E-1025', 'fit', 180, 185, '', ''], ['E-1026', 'unfit', 20, 345, 'غير لائق للمهام الحرجة مؤقتًا', 'ملاحظة طبية تجريبية (T4)'], ['E-1027', 'fit', 250, 115, '', ''], ['E-1028', 'fit', 355, 10, '', ''], ['E-1029', 'fit', 90, 275, '', ''], ['E-1030', 'fit', 140, 225, '', '']];
    P('fitness', FIT.map((r, i) => ({ id: 'FT-' + String(i + 1).padStart(3, '0'), employeeId: r[0], type: 'periodic', result: r[1], restrictions: r[4], medicalNote: r[5] || 'لا ملاحظات (T4 — بيانات تجريبية)', facility: 'جهة طبية معتمدة (تجريبي)', examDate: D(-r[2]), nextDue: D(r[3]), reportFile: 'medical-' + r[0] + '.pdf (T4)' })));
    const PPE = [['E-1017', 'خوذة', 200, 165, 'ok'], ['E-1020', 'قفازات', 40, 20, 'replace'], ['E-1021', 'نظارة وقاية', 120, 60, 'replace'], ['E-1022', 'حذاء أمان', 300, 65, 'ok'], ['E-1023', 'سدادات أذن', 60, 30, 'ok'], ['E-1024', 'كمامة', 30, 15, 'missing'], ['E-1026', 'خوذة', 220, 145, 'ok'], ['E-1027', 'قفازات', 70, -5, 'replace'], ['E-1028', 'حذاء أمان', 330, 35, 'ok'], ['E-1029', 'نظارة وقاية', 80, 100, 'ok']];
    P('ppeLog', PPE.map((r, i) => ({ id: 'PPE-' + String(i + 1).padStart(3, '0'), employeeId: r[0], item: r[1], issuedAt: D(-r[2]), replaceDue: D(r[3]), inspectedAt: D(-(10 + i * 3)), condition: r[4] })));
    P('toolboxTalks', [{ id: 'TBT-001', date: D(-1), shift: 'A', topic: 'السلامة عند تشغيل ماكينة القص', presenterId: 'U-27', attendees: ['E-1017', 'E-1020', 'E-1021', 'E-1030'], duration: 12 }, { id: 'TBT-002', date: D(-8), shift: 'B', topic: 'الإخلاء والتصرف عند الحريق', presenterId: 'U-27', attendees: ['E-1022', 'E-1023', 'E-1024'], duration: 15 }, { id: 'TBT-003', date: D(-15), shift: 'A', topic: 'المناولة الآمنة للأحمال', presenterId: 'U-27', attendees: ['E-1017', 'E-1020', 'E-1030'], duration: 10 }]);
    P('ohsMeetings', [{ id: 'SM-2026-01', heldOn: D(-20), attendees: 'مسؤولة السلامة · مدير الإنتاج · مشرف خط · مندوب العمال (تجريبي)', agenda: ['حادث منطقة التحميل', 'متابعة CAPA المفتوحة'], minutes: 'تمت مراجعة CAPA المفتوحة وتحديد مواعيد جديدة (محضر تجريبي).', decisions: 2 }]);

    /* ── HR-22 ── */
    P('recognitionTypes', [{ id: 'RT-1', name: 'موظف الشهر', criteria: 'التزام بالحضور والسلامة وجودة العمل بتقييم مشرف.', cash: false }, { id: 'RT-2', name: 'التزام الحضور', criteria: 'صفر غياب بدون إذن وصفر تأخير خلال الشهر.', cash: true }, { id: 'RT-3', name: 'صفر حوادث', criteria: 'لا بلاغات إصابة على الفريق خلال الفترة.', cash: false }, { id: 'RT-4', name: 'اقتراح مُنفَّذ', criteria: 'اقتراح قُبل ونُفِّذ بأثر موثّق.', cash: true }]);
    P('awards', [{ id: 'AW-2026-0001', employeeId: 'E-1017', typeId: 'RT-1', nominatedBy: 'U-27', reason: 'التزام كامل بالسلامة وتدريب زملائه على الماكينة الجديدة.', status: 'nominated', createdAt: AGO(3), certNo: null, publish: null }, { id: 'AW-2026-0002', employeeId: 'E-1020', typeId: 'RT-3', nominatedBy: 'U-27', reason: 'خط خالٍ من الإصابات خلال الفترة.', status: 'approved', createdAt: AGO(20), certNo: 'RCG-2026-0001', publish: true, approvedBy: 'U-08' }, { id: 'AW-2026-0003', employeeId: 'E-1029', typeId: 'RT-2', nominatedBy: 'U-27', reason: 'التزام حضور كامل (مكافأة نقدية).', status: 'paid', createdAt: AGO(40), certNo: 'RCG-2026-0002', publish: false, approvedBy: 'U-08' }]);
    P('incentiveSchemes', [{ id: 'IS-01', name: 'حافز الحضور الشهري', kind: 'attendance', mode: 'individual', gate: { maxAbsence: 1, maxLate: 2, demo: true }, pool: null, component: 'حافز حضور (HR-13)', insuranceClass: null, effectiveFrom: D(-45), active: true }, { id: 'IS-02', name: 'حافز الإنتاج الجماعي — خط الألومنيوم', kind: 'production', mode: 'crew', gate: { maxAbsence: 2, maxLate: 3, demo: true }, pool: 12000, poolDemo: true, component: 'حافز إنتاج (HR-13)', insuranceClass: null, effectiveFrom: D(-45), active: true }]);
    const crew = [['E-1017', 24], ['E-1020', 24], ['E-1021', 20], ['E-1030', 22]]; const bad = { 'E-1021': 'لم يستوفِ شرط الحضور' };
    const elig = crew.filter((c) => !bad[c[0]]); const days = elig.reduce((a, c) => a + c[1], 0);
    P('incentiveSheets', [{ id: 'INS-2026-10', schemeId: 'IS-02', period: '2026-10', status: 'pending_approval', preparedBy: 'U-25', createdAt: AGO(1.5), approvalId: null, transferredAt: null, lines: crew.map((c) => ({ employeeId: c[0], days: c[1], eligible: !bad[c[0]], reasonPublic: bad[c[0]] || '', amount: bad[c[0]] ? 0 : Math.round(12000 * c[1] / days * 100) / 100 })) }]);
    P('suggestions', [{ id: 'SG-2026-0001', employeeId: 'E-1020', followCode: null, text: 'نقل خزانة معدات الوقاية قرب مدخل الخط لتقليل التنقل (اقتراح تجريبي).', status: 'submitted', reply: '', createdAt: AGO(2), decidedBy: null }, { id: 'SG-2026-0002', employeeId: null, followCode: 'SG-K8M2', text: 'إضافة تهوية إضافية في منطقة الدهان (اقتراح مجهول تجريبي).', status: 'under_review', reply: '', createdAt: AGO(6), decidedBy: null }, { id: 'SG-2026-0003', employeeId: 'E-1017', followCode: null, text: 'استخدام ألواح تعليق للأدوات بدل الأدراج.', status: 'implemented', reply: 'تم القبول والتنفيذ بالخط 1 — شكرًا لك.', createdAt: AGO(35), decidedBy: 'U-08' }, { id: 'SG-2026-0004', employeeId: 'E-1026', followCode: null, text: 'تغيير مواعيد الوردية B لساعة كاملة.', status: 'rejected', reply: 'غير ممكن حاليًا لارتباطه بمواعيد التسليم؛ نعيد النظر الربع القادم.', createdAt: AGO(28), decidedBy: 'U-08' }]);
    const SQ = [['q1', 'أشعر بالأمان أثناء العمل'], ['q2', 'أحصل على التدريب الذي أحتاجه'], ['q3', 'مشرفي يعاملني باحترام'], ['q4', 'معايير الحوافز عادلة'], ['q5', 'أنصح صديقًا بالعمل هنا']];
    P('surveys', [{ id: 'SV-2026-Q4', title: 'نبض الربع الرابع 2026', questions: SQ.map((q) => ({ id: q[0], text: q[1] })), groups: ['D-09', 'D-10', 'D-11', 'D-12'], minGroupSize: null, opensAt: D(-6), closesAt: D(8), status: 'open', createdBy: 'U-08' }]);
    const counts = { 'D-09': 6, 'D-10': 5, 'D-11': 2, 'D-12': 4 }; const parts = []; const answers = [];
    Object.keys(counts).forEach((g, gi) => { const members = emps().filter((e) => e.departmentId === g && e.status !== 'terminated'); for (let i = 0; i < Math.min(counts[g], members.length); i++) { if (members[i]) parts.push({ surveyId: 'SV-2026-Q4', employeeId: members[i].id, at: AGO(1 + i) }); SQ.forEach((q, qi) => answers.push({ surveyId: 'SV-2026-Q4', groupKey: g, questionId: q[0], value: 2 + ((i * 3 + qi * 2 + gi) % 4) })); } });
    P('surveyParts', parts); P('surveyAnswers', answers);
    P('retentionFlags', [{ id: 'RF-001', employeeId: 'E-1021', rule: 'تأخير متكرر', reason: 'تأخيرات متكررة خلال الفترة الأخيرة (إشارة محادثة فقط).', flaggedAt: AGO(6), status: 'flagged', note: '' }]);
    P('payrollInputs', L('payrollInputs'));
    /* كشف الحافز يحتاج طلب اعتماد في الصندوق المشترك */
    const sh = find('incentiveSheets', 'INS-2026-10');
    if (sh) { const ap = SA.requestApproval({ type: 'incentive_sheet', title: 'كشف حافز ' + sh.id + ' — حافز الإنتاج الجماعي (أكتوبر 2026) · بيانات تجريبية', requesterId: 'U-25', chain: [{ roleId: 'R-11', label: 'مدير الموارد البشرية (HR Manager)' }, { roleId: 'R-07', label: 'المالية (اعتماد المبالغ)' }], context: [['الكشف', sh.id], ['الفترة', 'أكتوبر 2026'], ['المؤهلون', String(sh.lines.filter((l) => l.eligible).length) + ' من ' + sh.lines.length], ['ملاحظة', 'المبالغ T3 (hr.salary.view). من أعدّ الكشف لا يعتمده.']], ref: { type: 'incentive_sheet', id: sh.id } }); st.patch('incentiveSheets', sh.id, { approvalId: ap.id }); }
  }

  /* ═════════════════════════════ HR-18 · الأداء والتقييم ═════════════════════════════ */
  const APPR_ST = { not_started: ['لم يبدأ', 'neutral'], self: ['تقييم ذاتي', 'info'], supervisor: ['تقييم المشرف', 'warning'], calibration: ['معايرة', 'warning'], final: ['نهائي', 'success'], ack: ['مُقرّ', 'success'], excluded: ['مستبعد', 'neutral'] };
  const CYC_ST = { draft: ['مسودة', 'neutral'], open: ['مفتوحة', 'info'], calibrating: ['معايرة', 'warning'], final: ['نهائية', 'success'], closed: ['مُغلقة', 'neutral'] };
  const CYC_FLOW = ['draft', 'open', 'calibrating', 'final', 'closed'];
  const REC = { raise: 'رفع (علاوة)', promotion: 'ترقية', training: 'تدريب', none: 'لا شيء' };
  const tplCrit = (tplId, ver) => { const t = find('apprTemplates', tplId); if (!t) return []; const v = (t.versions || []).find((x) => x.version === ver); return v ? v.criteria : t.criteria; };
  const wscore = (criteria, ratings) => { if (!ratings || !ratings.length) return null; let s = 0; let miss = false; criteria.forEach((c) => { const r = ratings.find((x) => x.criterionId === c.id); if (!r || !r.score) miss = true; else s += c.weight * r.score; }); return miss ? null : Math.round(s) / 100; };
  const scoreOf = (a) => (a.final != null ? a.final : a.weighted);
  const myApprCycles = () => L('apprCycles');

  function autoData(empId) {
    const a = attStats(empId); const es = L('empSkills').filter((x) => x.employeeId === empId && x.level >= 3);
    const valid = es.filter((x) => skillStatus(x).k !== 'expired').length;
    return { attendancePct: a.pct, late: a.late, absent: a.absent, sample: a.total, trainingPct: es.length ? Math.round(valid / es.length * 100) : null, certs: es.length };
  }
  const autoPanel = (empId) => { const d = autoData(empId); return h('div.sap-hp-pills', {}, [['الحضور', d.attendancePct == null ? 'لا بيانات' : d.attendancePct + '%'], ['التأخيرات', d.late], ['الغياب', d.absent], ['شهادات سارية', d.trainingPct == null ? 'لا بيانات' : d.trainingPct + '%']].map((x) => h('span.sap-hp-tag', {}, x[0] + ': ', h('b.num', {}, x[1])))); };

  function ratingWidget(crit, value, onChange, disabled) {
    const anchor = h('div.sap-hp-anchor', { 'aria-live': 'polite' }); const btns = [];
    const set = (n) => { btns.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === n))); anchor.textContent = n ? n + ' — ' + (crit.anchors[n - 1] || '') : 'اختر درجة لعرض وصفها'; };
    [1, 2, 3, 4, 5].forEach((n) => btns.push(h('button', { type: 'button', role: 'radio', 'aria-pressed': 'false', 'aria-label': n + ' — ' + (crit.anchors[n - 1] || ''), title: crit.anchors[n - 1] || '', disabled: !!disabled, onclick: () => { set(n); onChange(n); } }, String(n))));
    set(value || 0);
    return h('div', {}, h('div.sap-hp-rate', { role: 'radiogroup', 'aria-label': crit.title }, btns), anchor);
  }
  /** نموذج درجات لقائمة معايير؛ يرجع {el, get(), validate()} */
  function criteriaForm(criteria, ratings, o) {
    o = o || {}; const state = {}; (ratings || []).forEach((r) => (state[r.criterionId] = { score: r.score, comment: r.comment || '' }));
    const total = h('span.sap-hp-score', {}); const rows = []; const errs = {};
    function recompute() { const r = criteria.map((c) => ({ criterionId: c.id, score: (state[c.id] || {}).score })); const w = wscore(criteria, r); SA.clear(total); total.append(w == null ? h('small', {}, 'أكمل كل المعايير لحساب الدرجة المرجّحة') : [h('span.num', {}, w.toFixed(2)), h('small', {}, 'من 5')]); }
    const el = h('div.sap-hp-steps', {}, criteria.map((c) => {
      state[c.id] = state[c.id] || { score: 0, comment: '' }; const er = h('div.sap-field-error', { role: 'alert', hidden: true }); errs[c.id] = er;
      const ta = h('textarea.textarea', { rows: 2, placeholder: 'سبب الدرجة (إلزامي للدرجتين 1 و5)', disabled: !!o.disabled, 'aria-label': 'تعليق ' + c.title, oninput: (e) => { state[c.id].comment = e.target.value; er.hidden = true; } }, state[c.id].comment);
      const auto = c.source && c.source !== 'manual' ? h('span.chip', {}, c.source === 'attendance' ? 'تلقائي من الحضور' : 'تلقائي من التدريب') : null;
      return h('div.sap-hp-crit', {}, h('div.sap-hp-crit-head', {}, h('b', {}, c.title), h('span', {}, auto, ' ', h('span.sap-hp-w', {}, c.weight + '%'))), ratingWidget(c, state[c.id].score, (n) => { state[c.id].score = n; er.hidden = true; recompute(); }, o.disabled), ta, er);
    }));
    recompute();
    return { el, total, state, get: () => criteria.map((c) => ({ criterionId: c.id, score: state[c.id].score || 0, comment: state[c.id].comment || '' })),
      validate() { let ok = true; criteria.forEach((c) => { const s = state[c.id]; errs[c.id].hidden = true; if (!s.score) { errs[c.id].hidden = false; errs[c.id].textContent = 'اختر درجة لهذا المعيار.'; ok = false; } else if ((s.score === 1 || s.score === 5) && String(s.comment || '').trim().length < 3) { errs[c.id].hidden = false; errs[c.id].textContent = 'اكتب سبب الدرجة عشان يبقى التقييم واضح.'; ok = false; } }); return ok; } };
  }

  /* ── دورات التقييم ── */
  function cycleStats(c) {
    const a = L('appraisals').filter((x) => x.cycleId === c.id); const done = a.filter((x) => ['supervisor', 'calibration', 'final', 'ack'].indexOf(x.status) >= 0).length;
    const scores = a.map(scoreOf).filter((x) => x != null); return { total: a.length, done, pct: a.length ? Math.round(done / a.length * 100) : 0, avg: scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null, list: a };
  }
  function newCycle() {
    const tpls = L('apprTemplates').filter((t) => t.status === 'approved');
    const scope = OPS.filter((id) => { const e = emp(id); return e && e.status !== 'probation' && e.status !== 'terminated'; });
    const noSup = scope.filter((id) => !emp(id).managerEmpId);
    return formModal({
      title: 'دورة تقييم جديدة', subtitle: 'UC-PRF-01 — المستبعدون تلقائيًا: تحت التجربة (نموذج مستقل) ومن لا مشرف له.', icon: 'gauge', size: 'md', submitLabel: 'إطلاق الدورة',
      fields: [{ name: 'name', label: 'اسم الدورة', required: true, value: 'تقييم الأداء — ' + new Date().getFullYear() }, { name: 'templateId', label: 'القالب (معتمد فقط)', type: 'select', required: true, options: [['', 'اختر القالب…']].concat(tpls.map((t) => [t.id, t.name + ' — v' + t.version])), hint: 'قالب مجموع أوزانه ≠ 100% لا يظهر هنا.' }, { name: 'starts', label: 'بداية الدورة', type: 'date', required: true, value: T() }, { name: 'ends', label: 'نهاية الدورة', type: 'date', required: true, value: D(cfg('performance.windowDays', 14)), hint: 'نافذة مقترحة ' + cfg('performance.windowDays', 14) + ' يوم (قابلة للتعديل).' },
        { name: 'self', label: 'تفعيل التقييم الذاتي الاختياري', type: 'switch', value: true, hint: 'لا يظهر للمشرف قبل إرساله لتقييمه (blind).' },
        h('div.sap-impact', {}, h('b', {}, 'نطاق الدورة'), h('ul', {}, h('li', {}, 'سيُولَّد نموذج تقييم لـ' + scope.length + ' موظف بالإنتاج (حالة «لم يبدأ»).'), noSup.length ? h('li', {}, 'تنبيه: ' + noSup.length + ' بلا مشرف — أسند مشرفًا قبل الإطلاق.') : h('li', {}, 'كل المقيَّمين لهم مشرف مباشر.')))],
      check: (v) => { if (noSup.length) return 'الموظف ده ملوش مشرف مباشر. أسند مشرفًا قبل إطلاق الدورة.'; if (v.ends < v.starts) return { ends: 'تاريخ النهاية لازم يكون بعد البداية.' }; const clash = L('apprCycles').find((c) => (c.status === 'open' || c.status === 'calibrating') && !(v.ends < c.startsOn || v.starts > c.endsOn)); return clash ? 'دورة متداخلة (' + clash.name + '): لا تُفتح دورتان لنفس الموظف في نفس الوقت.' : null; },
      onSubmit: (v) => {
        const id = seqId('apprCycles', 'AC', 3, Y()).replace(/-(\d+)$/, (m, n) => '-' + String(+n).padStart(3, '0'));
        st.insert('apprCycles', { id, name: v.name, scope: 'خط الإنتاج', startsOn: v.starts, endsOn: v.ends, status: 'open', templateId: v.templateId, selfRating: v.self ? 'optional' : 'off', createdBy: SA.session.userId, createdAt: new Date().toISOString() }, true);
        const tpl = find('apprTemplates', v.templateId); let k = 0;
        scope.forEach((eid) => { k++; st.insert('appraisals', { id: 'APR-' + Y() + '-' + String(L('appraisals').length + 1).padStart(4, '0'), cycleId: id, employeeId: eid, supervisorEmpId: emp(eid).managerEmpId, templateId: v.templateId, templateVersion: tpl.version, status: 'not_started', ratings: [], selfRatings: [], weighted: null, final: null, recommendation: null, calibrations: [], onBehalf: false, submittedAt: null, outcome: null }); });
        aud('HR.PRF.CYCLE_OPENED', 'appraisal_cycle', id, v.name, { after: { نماذج: k, قالب: tpl.name + ' v' + tpl.version } });
        notify('موعد تقييم الأداء', 'فُتحت دورة تقييم — افتح «فريقي» لتقييم فريقك.', 'action', ['R-14'], '#/hr/performance?tab=team');
        SA.toast('تم إطلاق الدورة وتوليد ' + k + ' نموذج تقييم', 'success');
      }
    });
  }
  async function cycleMove(c, to) {
    const s = cycleStats(c); const labels = { calibrating: 'بدء المعايرة', final: 'الاعتماد النهائي', closed: 'إغلاق الدورة' };
    const pend = s.list.filter((x) => ['not_started', 'self'].indexOf(x.status) >= 0).length;
    const ok = await confirmAct({ title: labels[to] + ' — ' + c.name, danger: to === 'final', confirmLabel: labels[to], reasonRequired: to === 'final' && pend > 0, reasonLabel: 'سبب استبعاد التقييمات غير المكتملة', impact: to === 'calibrating' ? ['التقييمات المُرسلة تُجمَّد على المشرف، وأي تعديل بعدها بمعايرة بسبب مكتوب.'] : to === 'final' ? ['تتحول الدرجات إلى «نهائي» وتُتاح للموظف للاطلاع.', 'غير المكتمل (' + pend + ') يُستبعد من الدورة.', 'تُتاح مقترحات الرفع/الترقية/التدريب — لا تغيّر أي أجر مباشرة (BR-PRF-07).'] : ['لا تُعدَّل الدورة بعد الإغلاق.'], warnings: to === 'calibrating' && s.pct < 100 ? ['اكتمل ' + s.pct + '% من التقييمات فقط. الحد الأدنى للمعايرة {Open} (غير مُعدّ) — يمكنك المتابعة.'] : [],
      run: (r) => {
        st.patch('apprCycles', c.id, { status: to });
        if (to === 'calibrating') st.update('appraisals', (l) => l.forEach((a) => { if (a.cycleId === c.id && a.status === 'supervisor') a.status = 'calibration'; }));
        if (to === 'final') { st.update('appraisals', (l) => l.forEach((a) => { if (a.cycleId !== c.id) return; if (a.status === 'supervisor' || a.status === 'calibration') { a.status = 'final'; a.final = a.final != null ? a.final : a.weighted; } else if (a.status === 'not_started' || a.status === 'self') a.status = 'excluded'; })); aud('HR.PRF.FINALIZED', 'appraisal_cycle', c.id, c.name, { reason: r.reason, after: { معتمَد: s.done, مستبعد: pend } }); notify('نتيجة التقييم جاهزة', 'نتيجة تقييم الأداء متاحة للاطلاع.', 'info', ['R-14', 'R-16'], '#/hr/performance?tab=outcomes'); }
        else if (to === 'calibrating') aud('HR.PRF.CALIBRATED', 'appraisal_cycle', c.id, c.name, { after: { حالة: 'بدء المعايرة' }, severity: 'info' });
      }, success: 'تم: ' + labels[to] });
    return ok;
  }
  function openCycle(id) {
    liveDrawer({ title: 'الدورة', paths: ['apprCycles', 'appraisals'], build() {
      const c = find('apprCycles', id); if (!c) return false; const s = cycleStats(c); const i = CYC_FLOW.indexOf(c.status); const can = SA.can('hr.performance.edit');
      const nxt = c.status === 'open' ? 'calibrating' : c.status === 'calibrating' ? 'final' : c.status === 'final' ? 'closed' : null;
      return { title: c.name, subtitle: c.id, body: h('div.sap-drawer-inner', {}, SA.stepper(['مسودة', 'مفتوحة', 'معايرة', 'نهائية', 'مُغلقة'], Math.max(0, i)),
        kpiRow([['المقيَّمون', N(s.total)], ['اكتمل تقييم المشرف', N(s.done + ' (' + s.pct + '%)')], ['متوسط الدرجة', s.avg == null ? '—' : N(s.avg.toFixed(2))]]),
        SA.kv([['الحالة', stChip(CYC_ST, c.status)], ['الفترة', fd(c.startsOn) + ' → ' + fd(c.endsOn)], ['القالب', ((find('apprTemplates', c.templateId) || {}).name || '—')], ['التقييم الذاتي', c.selfRating === 'optional' ? 'اختياري (blind)' : 'متوقف'], ['النطاق', c.scope]]),
        s.list.length ? sec('نماذج الدورة', h('div.sap-hp-pills', {}, Object.keys(APPR_ST).map((k) => { const n = s.list.filter((x) => x.status === k).length; return n ? h('span.sap-hp-tag', {}, APPR_ST[k][0] + ': ', h('b.num', {}, n)) : null; }))) : null,
        h('p.sap-hp-note', {}, 'الدورة: مسودة ← مفتوحة ← معايرة ← نهائية ← مُغلقة (BR-PRF-10).')),
        foot: nxt ? [btn({ label: nxt === 'calibrating' ? 'بدء المعايرة' : nxt === 'final' ? 'الاعتماد النهائي' : 'إغلاق الدورة', icon: 'check', kind: nxt === 'final' ? 'accent' : 'primary', perm: 'hr.performance.edit', onClick: () => cycleMove(c, nxt) })] : [] };
    } });
  }
  function tabCycles(view, api) {
    return SA.live(view, () => {
      const cs = myApprCycles(); const open = cs.filter((c) => c.status === 'open' || c.status === 'calibrating'); const all = L('appraisals');
      const t = tcard({ caption: 'دورات التقييم', rows: () => myApprCycles(), search: { placeholder: 'ابحث باسم الدورة…', keys: ['name', 'id'] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(CYC_ST).map((k) => [k, CYC_ST[k][0]]) }], onRowClick: (c) => openCycle(c.id),
        columns: [{ key: 'name', label: 'الدورة', sort: true, render: (c) => h('div', {}, h('b', {}, c.name), h('div.sap-hp-note', {}, c.id)) }, { key: 'status', label: 'الحالة', render: (c) => stChip(CYC_ST, c.status) }, { key: 'period', label: 'الفترة', render: (c) => h('span.num', {}, fd(c.startsOn) + ' → ' + fd(c.endsOn)) }, { key: 'progress', label: 'اكتمال التقييم', render: (c) => { const s = cycleStats(c); return h('span', {}, h('b.num', {}, s.done + '/' + s.total), ' ', h('span.sap-hp-note', {}, s.pct + '%')); } }, { key: 'avg', label: 'المتوسط', render: (c) => { const s = cycleStats(c); return s.avg == null ? '—' : h('span.num', {}, s.avg.toFixed(2)); } }],
        empty: { icon: 'gauge', title: 'لا توجد دورات بعد', text: 'افتح دورة لتوليد نماذج التقييم لفريق الإنتاج.', action: { label: 'دورة جديدة', perm: 'hr.performance.edit', onClick: newCycle } } });
      return h('div.sap-hp-view', {}, kpiRow([['دورات نشطة', N(open.length), { accent: open.length > 0 }], ['نماذج لم تكتمل', N(all.filter((a) => ['not_started', 'self'].indexOf(a.status) >= 0).length), { sub: 'بانتظار تقييم المشرف' }], ['قيد المعايرة', N(all.filter((a) => a.status === 'calibration').length)], ['نتائج نهائية', N(all.filter((a) => a.status === 'final' || a.status === 'ack').length)]]), t.el,
        h('p.sap-hp-note', {}, 'التقييم مدخل لقرارات (رفع/ترقية/تدريب/تثبيت) وليس قرارًا بحد ذاته — BR-PRF-07. ', specLink('m-prf-01')));
    }, ['apprCycles', 'appraisals']);
  }

  /* ── قوالب KPI ── */
  function templateEditor(tid) {
    const t0 = tid ? find('apprTemplates', tid) : null; const rows = []; const list = h('div.sap-hp-steps'); const sum = h('div.sap-hp-note');
    const used = t0 && L('apprCycles').some((c) => c.templateId === t0.id && (c.status === 'open' || c.status === 'calibrating'));
    const name = SA.form.field({ name: 'name', label: 'اسم القالب', required: true, value: t0 ? t0.name : '' }); const fam = SA.form.field({ name: 'family', label: 'عائلة الوظيفة', type: 'select', required: true, value: t0 ? t0.family : '', options: [['', 'اختر…'], ['مشغّل', 'مشغّل'], ['فني صيانة', 'فني صيانة'], ['مخازن', 'مخازن'], ['جودة', 'جودة'], ['مبيعات', 'مبيعات'], ['إداري', 'إداري']] });
    const selfF = SA.form.field({ name: 'self', label: 'التقييم الذاتي', type: 'select', value: t0 ? t0.selfRating : 'optional', options: [['optional', 'اختياري'], ['off', 'متوقف']] });
    function totalW() { return rows.reduce((a, r) => a + (+r.w.get() || 0), 0); }
    function upd() { const w = totalW(); SA.clear(sum); sum.append(h('span', { style: { color: w === 100 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700 } }, 'مجموع الأوزان: ' + w + '%'), w === 100 ? ' ✓' : ' — لازم يساوي 100% (الحالي: ' + w + '%).'); }
    function addRow(c) {
      c = c || { id: 'K' + (rows.length + 1), title: '', weight: '', source: 'manual', anchors: ANCHORS.slice() };
      const ti = SA.form.field({ name: 't', label: 'المعيار', required: true, value: c.title }); const w = SA.form.field({ name: 'w', label: 'الوزن %', type: 'number', required: true, value: c.weight, min: 1, max: 100, onInput: upd }); const src = SA.form.field({ name: 's', label: 'مصدر القيمة', type: 'select', value: c.source, options: [['manual', 'يدوي'], ['attendance', 'تلقائي من الحضور'], ['training', 'من التدريب']] });
      const anc = [1, 2, 3, 4, 5].map((n) => SA.form.field({ name: 'a' + n, label: 'وصف الدرجة ' + n, value: c.anchors[n - 1] || '' }));
      const row = { c, ti, w, src, anc, el: null }; const rm = h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { rows.splice(rows.indexOf(row), 1); row.el.remove(); upd(); } }, SA.icon('trash', 'icon-sm'), 'حذف');
      row.el = h('div.sap-hp-crit', {}, h('div.sap-hp-row', {}, h('div.sap-hp-grow', {}, ti.el), h('div', { style: { width: '110px' } }, w.el), h('div', { style: { width: '170px' } }, src.el), rm), h('details', {}, h('summary.sap-hp-link', {}, 'وصف الدرجات 1–5 (إلزامي)'), h('div.sap-hp-cols', {}, anc.map((a) => a.el))));
      rows.push(row); list.append(row.el); upd();
    }
    (t0 ? t0.criteria : [null, null, null, null]).forEach((c) => addRow(c ? { id: c.id, title: c.title, weight: c.weight, source: c.source, anchors: c.anchors } : null)); upd();
    const m = SA.modal({ title: t0 ? 'تعديل قالب: ' + t0.name : 'قالب KPI جديد', subtitle: used ? 'القالب مستخدم في دورة جارية — الحفظ يصدر نسخة جديدة v' + ((t0.version || 1) + 1) + ' ولا يعدّل بأثر رجعي.' : 'UC-PRF-02 — مجموع الأوزان لازم 100% ومقياس 1–5 بوصف لكل درجة.', icon: 'gauge', size: 'xl',
      body: h('div.sap-confirm', {}, h('div.sap-hp-cols', {}, name.el, fam.el, selfF.el), list, h('div.sap-hp-row.is-between', {}, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => addRow() }, SA.icon('plus', 'icon-sm'), 'إضافة معيار'), sum)),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => {
        if (!name.validate() | !fam.validate()) return; let bad = false; rows.forEach((r) => { if (!r.ti.validate() | !r.w.validate()) bad = true; if (r.anc.some((a) => !String(a.get() || '').trim())) { bad = true; r.anc[0].error('كل درجة لها وصف مكتوب'); } }); if (bad) { SA.toast('أكمل بيانات المعايير ووصف كل درجة.', 'error'); return; }
        if (totalW() !== 100) { SA.toast('مجموع أوزان المعايير لازم يساوي 100% (الحالي: ' + totalW() + '%).', 'error'); return; }
        if (!rows.length) { SA.toast('أضف معيارًا واحدًا على الأقل.', 'error'); return; }
        m.setBusy(true);
        try { await SA.api(() => {
          const criteria = rows.map((r, i) => ({ id: 'K' + (i + 1), title: r.ti.get().trim(), weight: +r.w.get(), source: r.src.get(), anchors: r.anc.map((a) => a.get().trim()) }));
          if (t0) { const ver = used ? (t0.version || 1) + 1 : (t0.version || 1); st.patch('apprTemplates', t0.id, (x) => ({ name: name.get().trim(), family: fam.get(), selfRating: selfF.get(), criteria, version: ver, status: 'approved', updatedAt: new Date().toISOString(), versions: (x.versions || [{ version: x.version, criteria: x.criteria }]).concat(used ? [{ version: ver, criteria }] : []) })); aud('HR.PRF.TEMPLATE_SAVED', 'appraisal_template', t0.id, name.get(), { after: { نسخة: 'v' + ver, معايير: criteria.length } }); }
          else { const id = seqId('apprTemplates', 'TPL', 2); st.insert('apprTemplates', { id, name: name.get().trim(), family: fam.get(), version: 1, status: 'approved', selfRating: selfF.get(), updatedAt: new Date().toISOString(), criteria, versions: [{ version: 1, criteria }] }); aud('HR.PRF.TEMPLATE_SAVED', 'appraisal_template', id, name.get(), { after: { نسخة: 'v1', معايير: criteria.length } }); }
        }); m.close(true); SA.toast('تم حفظ القالب', 'success'); } catch (e) { m.setBusy(false); SA.fail(e); }
      } }, 'حفظ وإصدار نسخة')] });
  }
  function tabTemplates(view) {
    return SA.live(view, () => {
      const t = tcard({ caption: 'قوالب KPI', rows: () => L('apprTemplates'), search: { placeholder: 'ابحث باسم القالب أو العائلة…', keys: ['name', 'family'] }, onRowClick: (r) => templateEditor(r.id),
        columns: [{ key: 'name', label: 'القالب', sort: true, render: (r) => h('div', {}, h('b', {}, r.name), h('div.sap-hp-note', {}, 'عائلة: ' + r.family)) }, { key: 'v', label: 'النسخة', render: (r) => h('span.num', {}, 'v' + r.version) }, { key: 'status', label: 'الحالة', render: (r) => stChip({ approved: ['معتمد', 'success'], draft: ['مسودة', 'neutral'] }, r.status) }, { key: 'crit', label: 'المعايير', render: (r) => h('span', {}, h('b.num', {}, r.criteria.length), ' معايير · ', h('span.num', {}, r.criteria.reduce((a, c) => a + c.weight, 0) + '%')) }, { key: 'self', label: 'التقييم الذاتي', render: (r) => (r.selfRating === 'optional' ? 'اختياري' : 'متوقف') }, { key: 'u', label: 'آخر تحديث', render: (r) => fd(r.updatedAt) }],
        rowActions: (r) => [{ label: 'تعديل / نسخة جديدة', icon: 'edit', onClick: () => templateEditor(r.id) }, r.status === 'draft' ? { label: 'اعتماد القالب', icon: 'check', onClick: async () => { if (r.criteria.reduce((a, c) => a + c.weight, 0) !== 100) { SA.toast('مجموع أوزان المعايير لازم يساوي 100% (الحالي: ' + r.criteria.reduce((a, c) => a + c.weight, 0) + '%).', 'error'); return; } if (await confirmAct({ title: 'اعتماد القالب «' + r.name + '»', impact: ['يصبح متاحًا لاختياره في الدورات القادمة.'], run: () => { st.patch('apprTemplates', r.id, { status: 'approved', updatedAt: new Date().toISOString() }); aud('HR.PRF.TEMPLATE_SAVED', 'appraisal_template', r.id, r.name, { after: { حالة: 'معتمد' } }); }, success: 'تم اعتماد القالب' })) { /* done */ } } } : null],
        empty: { icon: 'clipboard', title: 'لا توجد قوالب', text: 'عرّف قالب KPI لكل عائلة وظيفية.', action: { label: 'قالب جديد', perm: 'hr.performance.edit', onClick: () => templateEditor() } } });
      return h('div.sap-hp-view', {}, h('div.sap-hp-row.is-between', {}, h('p.sap-hp-note', {}, 'قالب لكل عائلة وظيفية، مجموع أوزانه 100%، ويُعدَّل بنسخ جديدة بلا أثر رجعي (BR-PRF-01/02). مصدر «الإنتاج» التلقائي {Pending} بانتظار وحدة الإنتاج.'), btn({ label: 'قالب جديد', icon: 'plus', kind: 'ghost', perm: 'hr.performance.edit', onClick: () => templateEditor() })), t.el);
    }, ['apprTemplates']);
  }

  /* ── تقييمات الفريق ── */
  function openAppraisal(id) {
    const a = find('appraisals', id); if (!a) return; const e = emp(a.employeeId); const crit = tplCrit(a.templateId, a.templateVersion); const editable = ['not_started', 'self'].indexOf(a.status) >= 0 && SA.can('hr.performance.edit');
    const me = myEmp(); const isSelf = !!me && me.id === a.employeeId; const onBehalf = !me || me.id !== a.supervisorEmpId;
    const form = criteriaForm(crit, a.ratings, { disabled: !editable || isSelf }); const rec = SA.form.field({ name: 'rec', label: 'التوصية', type: 'select', value: a.recommendation || '', options: [['', 'اختر التوصية…']].concat(Object.keys(REC).map((k) => [k, REC[k]])), disabled: !editable, required: true });
    const selfShow = a.selfRatings && a.selfRatings.length && a.status !== 'self' && a.status !== 'not_started';
    const body = h('div.sap-drawer-inner', {}, h('div.sap-hp-row.is-between', {}, empCell(e), stChip(APPR_ST, a.status)),
      SA.kv([['المشرف المباشر', en(a.supervisorEmpId)], ['القالب', ((find('apprTemplates', a.templateId) || {}).name || '—') + ' v' + a.templateVersion], ['الدورة', (find('apprCycles', a.cycleId) || {}).name || a.cycleId], a.onBehalf ? ['ملاحظة', SA.chip('أُدخل نيابةً عن المشرف (on_behalf)', 'warning')] : null]),
      sec('بيانات تلقائية (قراءة فقط — لا T4)', autoPanel(a.employeeId), h('p.sap-hp-note', {}, 'الحضور والتأخيرات وصلاحية الشهادات فقط. التقييم لا يقرأ بيانات تأديبية أو طبية (BR-PRF-04).')),
      a.selfRatings && a.selfRatings.length ? (selfShow ? sec('التقييم الذاتي للموظف', h('div.sap-hp-pills', {}, crit.map((c) => { const r = a.selfRatings.find((x) => x.criterionId === c.id); return h('span.sap-hp-tag', {}, c.title + ': ', h('b.num', {}, r ? r.score : '—')); }))) : SA.alert('info', 'قدّم الموظف تقييمًا ذاتيًا — يظهر لك بعد إرسال تقييمك (blind).')) : null,
      isSelf ? SA.alert('warning', 'المقيّم لا يقيّم نفسه — لا يمكنك تعبئة هذا النموذج.') : null, onBehalf && editable && !isSelf ? SA.alert('info', 'أنت لست المشرف المباشر: سيُسجَّل التقييم «نيابةً عن المشرف» (on_behalf).') : null,
      sec('معايير التقييم', form.el), h('div.sap-hp-row.is-between', {}, h('b', {}, 'الدرجة المرجّحة'), form.total), rec.el);
    let d = null; const footNodes = [];
    if (editable && !isSelf) {
      const persist = (status) => { const ratings = form.get(); const w = wscore(crit, ratings); st.patch('appraisals', a.id, { ratings: status === 'supervisor' ? ratings : ratings.filter((r) => r.score), weighted: w, recommendation: rec.get() || null, status, onBehalf: onBehalf, submittedAt: status === 'supervisor' ? new Date().toISOString() : a.submittedAt }); };
      if (a.status === 'not_started' && (st.get('apprCycles') || []).find((c) => c.id === a.cycleId && c.selfRating === 'optional')) footNodes.push(hbtn('تسجيل تقييم ذاتي (محاكاة الموظف)', () => selfRate(a.id, d)));
      footNodes.push(hbtn('حفظ مسودة', async () => { if (await run(() => persist(a.status))) { SA.toast('تم حفظ المسودة', 'success'); } }), h('button.btn.btn-primary', { type: 'button', onclick: async () => { const ok1 = form.validate(); const ok2 = rec.validate(); if (!ok1 || !ok2) { SA.toast('أكمل الدرجات والتعليقات المطلوبة والتوصية.', 'error'); return; } if (await run(() => { persist('supervisor'); aud('HR.PRF.SUPERVISOR_SUBMITTED', 'appraisal', a.id, 'تقييم ' + (e ? e.name : ''), { after: { درجة: wscore(crit, form.get()), توصية: REC[rec.get()], نيابةً: onBehalf } }); })) { d.close(); SA.toast('تم إرسال التقييم', 'success'); } } }, SA.icon('check', 'icon-sm'), 'إرسال التقييم'));
    }
    d = SA.drawer({ title: 'تقييم: ' + (e ? e.name : a.employeeId), subtitle: a.id, size: 'lg', body, foot: footNodes.length ? footNodes : null });
  }
  function selfRate(aid, parentDrawer) {
    const a = find('appraisals', aid); const crit = tplCrit(a.templateId, a.templateVersion); const f = criteriaForm(crit.map((c) => Object.assign({}, c)), [], {});
    const m = SA.modal({ title: 'تقييمي لنفسي — محاكاة من «خدماتي»', subtitle: 'اختياري ولا يظهر للمشرف قبل أن يرسل تقييمه. التخطي بلا أثر سلبي.', icon: 'user', size: 'lg', body: h('div.sap-confirm', {}, f.el), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => { if (!f.validate()) return; m.setBusy(true); try { await SA.api(() => { st.patch('appraisals', aid, { selfRatings: f.get(), status: 'self' }); aud('HR.PRF.SELF_SUBMITTED', 'appraisal', aid, 'تقييم ذاتي — ' + en(a.employeeId)); }); m.close(); if (parentDrawer) parentDrawer.close(); SA.toast('تم إرسال التقييم الذاتي', 'success'); } catch (e) { m.setBusy(false); SA.fail(e); } } }, 'إرسال')] });
  }
  function tabTeam(view) {
    let cycleId = (L('apprCycles').find((c) => c.status === 'open' || c.status === 'calibrating') || L('apprCycles')[0] || {}).id;
    return SA.live(view, () => {
      const rowsAll = () => L('appraisals').filter((a) => !cycleId || a.cycleId === cycleId);
      const sel = h('select.select', { 'aria-label': 'الدورة', style: { width: 'auto', minWidth: '240px' }, onchange: (e) => { cycleId = e.target.value; SA.clear(view); view.append(build()); } }, L('apprCycles').map((c) => h('option', { value: c.id, selected: c.id === cycleId }, c.name)));
      function build() {
        const t = tcard({ caption: 'تقييمات الفريق', rows: rowsAll, search: { placeholder: 'ابحث باسم الموظف…', keys: [(a) => en(a.employeeId)] }, onRowClick: (a) => openAppraisal(a.id),
          filters: [{ key: 'status', label: 'الحالة', options: Object.keys(APPR_ST).map((k) => [k, APPR_ST[k][0]]) }, { key: 'dept', label: 'القسم', options: (st.get('departments') || []).filter((d) => ['D-09', 'D-10', 'D-11', 'D-12'].indexOf(d.id) >= 0).map((d) => [d.id, d.name]), test: (a, v) => (emp(a.employeeId) || {}).departmentId === v }],
          columns: [{ key: 'emp', label: 'الموظف', sort: true, value: (a) => en(a.employeeId), render: (a) => empCell(emp(a.employeeId)) }, { key: 'sup', label: 'المشرف', render: (a) => en(a.supervisorEmpId) }, { key: 'status', label: 'الحالة', render: (a) => stChip(APPR_ST, a.status) }, { key: 'score', label: 'الدرجة المرجّحة', sort: true, value: (a) => scoreOf(a), render: (a) => (scoreOf(a) == null ? '—' : h('span.num', {}, scoreOf(a).toFixed(2))) }, { key: 'rec', label: 'التوصية', render: (a) => (a.recommendation ? REC[a.recommendation] : '—') }, { key: 'self', label: 'ذاتي', render: (a) => (a.selfRatings && a.selfRatings.length ? SA.chip('قُدّم', 'info') : '—') }],
          rowActions: (a) => [{ label: ['not_started', 'self'].indexOf(a.status) >= 0 ? 'تقييم الآن' : 'عرض التقييم', icon: 'eye', onClick: () => openAppraisal(a.id) }],
          empty: { icon: 'users', title: 'لا توجد تقييمات في هذه الدورة', text: 'افتح دورة من تبويب «الدورات».' } });
        return h('div.sap-hp-view', {}, h('div.sap-hp-row', {}, h('label.sap-hp-row', {}, h('b', {}, 'الدورة:'), sel)), t.el, h('p.sap-hp-note', {}, 'المشرف يقيّم فريقه فقط ولا يقيّم نفسه. التعليق إلزامي للدرجتين 1 و5. ', specLink('m-prf-03')));
      }
      return build();
    }, ['appraisals', 'apprCycles']);
  }

  /* ── المعايرة ── */
  function calibrateOne(a) {
    const crit = tplCrit(a.templateId, a.templateVersion); const cur = scoreOf(a);
    return formModal({ title: 'معايرة درجة: ' + en(a.employeeId), subtitle: 'الدرجة الحالية ' + (cur == null ? '—' : cur.toFixed(2)) + ' — أي تعديل بسبب مكتوب (10 حروف على الأقل) ويُسجَّل قبل/بعد.', icon: 'gauge', size: 'sm', submitLabel: 'تعديل الدرجة',
      fields: [{ name: 'score', label: 'الدرجة الجديدة (1–5)', type: 'number', required: true, min: 1, max: 5, value: cur, hint: 'مثال: 3.9 — لا ترتيب إجباري (forced ranking).' }, { name: 'reason', label: 'سبب التعديل', type: 'textarea', required: true, rows: 3 }],
      check: (v) => { if (v.score < 1 || v.score > 5) return { score: 'الدرجة بين 1 و5.' }; if (String(v.reason).trim().length < 10) return { reason: 'لازم تكتب سبب تعديل الدرجة (10 حروف على الأقل).' }; const me = myEmp(); if (me && me.id === a.supervisorEmpId) return 'المقيّم لا يعاير تقييمه.'; if (me && me.id === a.employeeId) return 'لا يمكنك معايرة تقييمك أنت.'; return null; },
      onSubmit: (v) => { st.patch('appraisals', a.id, (x) => ({ final: Math.round(v.score * 100) / 100, calibrations: (x.calibrations || []).concat([{ old: cur, new: Math.round(v.score * 100) / 100, reason: v.reason.trim(), by: SA.session.userId, at: new Date().toISOString() }]) })); aud('HR.PRF.CALIBRATED', 'appraisal', a.id, 'معايرة ' + en(a.employeeId), { before: { درجة: cur }, after: { درجة: v.score }, reason: v.reason.trim() }); SA.toast('تمت المعايرة وسُجّل السبب', 'success'); } });
  }
  function tabCalibrate(view) {
    let cycleId = (L('apprCycles').find((c) => c.status === 'open' || c.status === 'calibrating') || L('apprCycles')[0] || {}).id;
    return SA.live(view, () => {
      const c = find('apprCycles', cycleId); const rows = L('appraisals').filter((a) => a.cycleId === cycleId && ['supervisor', 'calibration', 'final'].indexOf(a.status) >= 0);
      const sel = h('select.select', { 'aria-label': 'الدورة', style: { width: 'auto', minWidth: '240px' }, onchange: (e) => { cycleId = e.target.value; SA.clear(view); view.append(build()); } }, L('apprCycles').map((x) => h('option', { value: x.id, selected: x.id === cycleId }, x.name)));
      const sc = rows.map(scoreOf).filter((x) => x != null); const mean = sc.length ? sc.reduce((x, y) => x + y, 0) / sc.length : null;
      const bands = [['≥ 4.5', (x) => x >= 4.5], ['4.0 – 4.49', (x) => x >= 4 && x < 4.5], ['3.0 – 3.99', (x) => x >= 3 && x < 4], ['2.0 – 2.99', (x) => x >= 2 && x < 3], ['< 2.0', (x) => x < 2]];
      const bySup = {}; rows.forEach((a) => { const k = a.supervisorEmpId; (bySup[k] = bySup[k] || []).push(scoreOf(a)); });
      function build() {
        const t = tcard({ caption: 'معايرة التقييمات', rows: () => rows, onRowClick: (a) => openAppraisal(a.id),
          columns: [{ key: 'emp', label: 'الموظف', render: (a) => empCell(emp(a.employeeId)) }, { key: 'sup', label: 'المشرف', render: (a) => en(a.supervisorEmpId) }, { key: 'w', label: 'درجة المشرف', render: (a) => (a.weighted == null ? '—' : h('span.num', {}, a.weighted.toFixed(2))) }, { key: 'f', label: 'بعد المعايرة', render: (a) => { const ch = (a.calibrations || []).length; return h('span', {}, a.final == null ? '—' : h('b.num', {}, a.final.toFixed(2)), ch ? ' ' : '', ch ? SA.chip('عُدِّلت', 'warning') : ''); } }, { key: 'st', label: 'الحالة', render: (a) => stChip(APPR_ST, a.status) }],
          rowActions: (a) => [{ label: 'تعديل الدرجة بسبب', icon: 'edit', disabled: a.status === 'final' ? 'الدورة نهائية — لا تعديل' : (SA.can('hr.performance.edit') ? '' : NOPERM('hr.performance.edit')), onClick: () => calibrateOne(a) }, { label: 'عرض التقييم', icon: 'eye', onClick: () => openAppraisal(a.id) }],
          empty: { icon: 'gauge', title: 'لا توجد تقييمات مُرسلة بعد', text: 'تظهر هنا بعد أن يرسل المشرفون تقييماتهم.' } });
        return h('div.sap-hp-view', {}, h('div.sap-hp-row.is-between', {}, h('label.sap-hp-row', {}, h('b', {}, 'الدورة:'), sel), c ? h('span', {}, 'الحالة: ', stChip(CYC_ST, c.status)) : null),
          h('div.sap-hp-cols', {}, SA.card({ title: 'توزيع الدرجات' }, rows.length ? bands.map((b) => { const n = sc.filter(b[1]).length; return h('div.sap-hp-bar', {}, h('span', {}, b[0]), h('div', {}, h('i', { style: { width: Math.max(2, n / rows.length * 100) + '%' } })), h('b', {}, n)); }) : h('p.sap-hp-note', {}, 'لا بيانات.'), h('p.sap-hp-note', {}, 'متوسط الدورة: ' + (mean == null ? '—' : mean.toFixed(2)) + ' — مجرد مؤشر، لا ترتيب إجباري.')),
            SA.card({ title: 'متوسط كل مشرف (للمقارنة والتمييز)' }, Object.keys(bySup).length ? Object.keys(bySup).map((k) => { const arr = bySup[k].filter((x) => x != null); const av = arr.reduce((x, y) => x + y, 0) / arr.length; const d = mean == null ? 0 : av - mean; return h('div.sap-hp-bar', {}, h('span', {}, en(k)), h('div', {}, h('i', { style: { width: av / 5 * 100 + '%' } })), h('b', {}, av.toFixed(2)), h('small', { style: { color: d > 0 ? 'var(--color-warning)' : d < 0 ? 'var(--color-info,#345383)' : 'inherit', flex: '0 0 74px' } }, (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '') + d.toFixed(2))); }) : h('p.sap-hp-note', {}, 'لا بيانات.'), h('p.sap-hp-note', {}, 'عتبة تمييز التساهل/التشدد {Open} — غير مُعدّة، فالأرقام للمقارنة فقط.'))), t.el, h('p.sap-hp-note', {}, specLink('m-prf-07')));
      }
      return build();
    }, ['appraisals', 'apprCycles']);
  }

  /* ── النتائج والمقترحات ── */
  function createProposals(list) {
    const raises = list.filter((a) => a.recommendation === 'raise' || a.recommendation === 'promotion'); const trains = list.filter((a) => a.recommendation === 'training');
    return confirmAct({ title: 'إنشاء مقترحات من نتائج التقييم', confirmLabel: 'إنشاء المقترحات', impact: [raises.length + ' مقترح رفع/ترقية يُنشأ كمسودة (Draft) في «التغييرات الوظيفية» — يحتاج اعتمادًا ولا يغيّر أي أجر مباشرة.', trains.length + ' احتياج تدريب يدخل «احتياجات التدريب» بحالة Proposed.', 'العلاوة الدورية الدنيا ' + '{Pending [Law]}' + ' مستقلة عن الدرجة ولا تُحجب بها.'], warnings: [raises.length + trains.length === 0 ? 'لا توجد توصيات رفع/ترقية/تدريب ضمن المحدد.' : null].filter(Boolean),
      run: () => {
        raises.forEach((a) => { const id = 'SC-' + Y() + '-' + String((L('salaryChanges').map((x) => +(String(x.id).split('-').pop())).filter((n) => !isNaN(n)).reduce((m, n) => Math.max(m, n), 0)) + 1).padStart(4, '0'); st.insert('salaryChanges', { id, employeeId: a.employeeId, fromBasic: null, toBasic: null, requestedBy: SA.session.userId, status: 'draft', approvalId: null, createdAt: new Date().toISOString(), source: 'performance', kind: a.recommendation, appraisalId: a.id, note: 'مقترح من تقييم الأداء — القيمة يحددها HR في «التغييرات الوظيفية» (غير مُعدّة).' }); st.patch('appraisals', a.id, { outcome: { type: a.recommendation, ref: id } }); });
        trains.forEach((a) => { st.insert('trainingNeeds', { id: seqId('trainingNeeds', 'TN', 4, Y()), employeeId: a.employeeId, need: 'احتياج تدريب من تقييم الأداء', courseId: null, source: 'appraisal', sourceRef: a.id, priority: 'normal', status: 'proposed', sessionId: null, createdAt: new Date().toISOString() }); aud('HR.TRN.NEED_CREATED', 'training_need', a.id, 'احتياج — ' + en(a.employeeId), { after: { مصدر: 'تقييم أداء' } }); st.patch('appraisals', a.id, { outcome: { type: 'training', ref: 'TN' } }); });
        aud('HR.PRF.PROPOSALS_CREATED', 'appraisal_cycle', list[0] ? list[0].cycleId : '-', 'مقترحات من نتائج التقييم', { after: { رفع_وترقية: raises.length, تدريب: trains.length } });
        notify('مقترحات جديدة من التقييم', 'أُنشئت مقترحات رفع/ترقية بانتظار المراجعة في التغييرات الوظيفية.', 'info', ['R-11', 'R-13'], '#/hr/changes');
      }, success: 'تم إنشاء المقترحات' });
  }
  function ackAppraisal(a) {
    return formModal({ title: 'إقرار الموظف بنتيجة التقييم', subtitle: 'الإقرار = اطلاع وليس موافقة (BR-PRF-09). «أعترض» يحوّل لتظلم في الجزاءات والتظلمات.', icon: 'checkcircle', size: 'sm', submitLabel: 'تسجيل',
      fields: [{ name: 'type', label: 'قرار الموظف', type: 'radio', required: true, value: 'ack', options: [['ack', 'اطلعت', 'تسجيل الاطلاع'], ['object', 'أعترض', 'يفتح تظلمًا مربوطًا بالتقييم']] }, { name: 'note', label: 'تعليق (اختياري)', type: 'textarea', rows: 2 }],
      onSubmit: (v) => { st.patch('appraisals', a.id, { status: 'ack', ack: { type: v.type, note: v.note, at: new Date().toISOString() } }); aud('HR.PRF.ACKNOWLEDGED', 'appraisal', a.id, 'إقرار ' + en(a.employeeId), { after: { قرار: v.type === 'ack' ? 'اطلعت' : 'اعتراض' } });
        if (v.type === 'object') { st.insert('grievances', { id: seqId('grievances', 'GRV', 4, Y()), employeeId: a.employeeId, violationId: null, appraisalId: a.id, reason: v.note || 'اعتراض على نتيجة تقييم الأداء.', filedAt: new Date().toISOString(), dueAt: null, stage: 'filed', outcome: null, decidedBy: null }); aud('HR.DSC.GRIEVANCE_FILED', 'grievance', a.id, 'تظلم من تقييم', { after: { مصدر: a.id } }); notify('لديك إشعار جديد', 'تظلم جديد بانتظار الدراسة.', 'action', ['R-11'], '#/hr/disciplinary?tab=grievances'); } SA.toast(v.type === 'ack' ? 'تم تسجيل الإقرار' : 'تم تسجيل الاعتراض وفتح تظلم', 'success'); } });
  }
  function tabOutcomes(view) {
    return SA.live(view, () => {
      const t = tcard({ caption: 'نتائج التقييم', selectable: true, rows: () => L('appraisals').filter((a) => ['final', 'ack'].indexOf(a.status) >= 0), search: { placeholder: 'ابحث باسم الموظف…', keys: [(a) => en(a.employeeId)] },
        bulk: [{ label: 'إنشاء مقترحات HR-07 / HR-19', icon: 'swap', perm: 'hr.performance.edit', run: (rows, api2) => createProposals(rows.filter((r) => !r.outcome)).then((ok) => { if (ok) api2.clearSelection(); }) }],
        columns: [{ key: 'emp', label: 'الموظف', render: (a) => empCell(emp(a.employeeId)) }, { key: 'f', label: 'الدرجة النهائية', sort: true, value: (a) => scoreOf(a), render: (a) => h('b.num', {}, scoreOf(a) == null ? '—' : scoreOf(a).toFixed(2)) }, { key: 'rec', label: 'التوصية', render: (a) => (a.recommendation ? REC[a.recommendation] : '—') }, { key: 'out', label: 'المقترح', render: (a) => (a.outcome ? h('span', {}, SA.chip(a.outcome.type === 'training' ? 'احتياج تدريب' : 'مسودة في التغييرات', 'info'), ' ', a.outcome.type !== 'training' ? h('a', { href: SA.href('hr/changes') }, a.outcome.ref) : '') : '—') }, { key: 'ack', label: 'إقرار الموظف', render: (a) => (a.ack ? SA.chip(a.ack.type === 'ack' ? 'اطلع' : 'اعترض', a.ack.type === 'ack' ? 'success' : 'warning') : SA.chip('لم يُسجَّل', 'neutral')) }],
        rowActions: (a) => [{ label: 'إنشاء مقترح', icon: 'swap', disabled: a.outcome ? 'أُنشئ المقترح بالفعل' : (SA.can('hr.performance.edit') ? '' : NOPERM('hr.performance.edit')), onClick: () => createProposals([a]) }, { label: 'تسجيل إقرار/اعتراض الموظف', icon: 'checkcircle', disabled: a.ack ? 'سُجّل مسبقًا' : '', onClick: () => ackAppraisal(a) }, { label: 'عرض التقييم', icon: 'eye', onClick: () => openAppraisal(a.id) }],
        empty: { icon: 'checkcircle', title: 'لا نتائج نهائية بعد', text: 'تظهر المقترحات بعد «الاعتماد النهائي» للدورة.' } });
      return h('div.sap-hp-view', {}, SA.alert('info', 'المخرجات مقترحات فقط (رفع/ترقية/تدريب) وتمر على الاعتماد — الدرجة لا تغيّر الأجر أو المسمى مباشرة (BR-PRF-07). تأجيل/حجب العلاوة جزاء له مسار HR-20 فقط (BR-PRF-08).'), t.el, h('div.sap-hp-row', {}, h('a.sap-linkbtn', { href: SA.href('hr/changes') }, SA.icon('swap', 'icon-sm'), 'فتح التغييرات الوظيفية'), h('a.sap-linkbtn', { href: SA.href('hr/training?tab=needs') }, SA.icon('star', 'icon-sm'), 'احتياجات التدريب'), specLink('m-prf-09')));
    }, ['appraisals', 'salaryChanges']);
  }

  /* ── تقييم فترة التجربة ── */
  function probationInfo(e) {
    const pe = L('probationEvals').find((p) => p.employeeId === e.id); const start = pe ? pe.startDate : e.hireDate; const elapsed = dd(start, T()); const maxD = cfg('performance.probationMaxDays', 90); return { pe, start, elapsed, left: maxD - elapsed, maxD };
  }
  function probationCheckpoint(e, day) {
    const crit = [{ id: 'P1', title: 'الالتزام بالسلامة', weight: 25, anchors: ANCHORS }, { id: 'P2', title: 'جودة وسرعة التعلّم', weight: 25, anchors: ANCHORS }, { id: 'P3', title: 'الحضور والانضباط', weight: 25, anchors: ANCHORS }, { id: 'P4', title: 'التعاون مع الفريق', weight: 25, anchors: ANCHORS }];
    const f = criteriaForm(crit, [], {}); const rec = SA.form.field({ name: 'rec', label: 'توصية المشرف', type: 'radio', required: true, options: [['confirm', 'تثبيت'], ['not_confirm', 'عدم تثبيت']] }); const note = SA.form.field({ name: 'note', label: 'ملاحظات', type: 'textarea', rows: 2 });
    const m = SA.modal({ title: 'تقييم التجربة — اليوم ' + day + ' · ' + e.name, subtitle: 'نموذج 4 معايير + توصية (UC-PRF-07). لا خيار «تمديد» — التجربة مرة واحدة.', icon: 'gauge', size: 'lg', body: h('div.sap-confirm', {}, f.el, rec.el, note.el), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => { if (!f.validate() | !rec.validate()) return; m.setBusy(true); try { await SA.api(() => { st.update('probationEvals', (l) => { let p = l.find((x) => x.employeeId === e.id); if (!p) { p = { id: seqId('probationEvals', 'PE', 3), employeeId: e.id, startDate: e.hireDate, checkpoints: [], decision: null }; l.push(p); } p.checkpoints = p.checkpoints.filter((c) => c.day !== day).concat([{ day, scores: f.get().map((x) => x.score), recommendation: rec.get(), by: SA.session.userId, at: new Date().toISOString(), note: note.get() }]); }); aud('HR.PRF.PROBATION_EVALUATED', 'probation', e.id, 'تقييم تجربة — ' + e.name, { after: { يوم: day, توصية: rec.get() === 'confirm' ? 'تثبيت' : 'عدم تثبيت' } }); }); m.close(); SA.toast('تم حفظ تقييم اليوم ' + day, 'success'); } catch (er) { m.setBusy(false); SA.fail(er); } } }, 'حفظ التقييم')] });
  }
  function probationDecide(e, pi) {
    const last = pi.pe && pi.pe.checkpoints.slice().sort((a, b) => b.day - a.day)[0];
    return formModal({ title: 'قرار فترة التجربة — ' + e.name, subtitle: 'قرار HR Manager المستند لتقييم مكتوب. لا يوجد خيار تمديد (القانون يسمح بفترة تجربة واحدة).', icon: 'user', size: 'sm', submitLabel: 'تسجيل القرار', step: 'policy.change', stepTitle: 'تأكيد قرار التجربة',
      fields: [last ? SA.alert('info', 'توصية المشرف (اليوم ' + last.day + '): ' + (last.recommendation === 'confirm' ? 'تثبيت' : 'عدم تثبيت')) : SA.alert('warning', 'لا يوجد تقييم مكتوب من المشرف — القرار لازم يستند لتقييم.'), { name: 'dec', label: 'القرار', type: 'radio', required: true, options: [['confirm', 'تثبيت', 'ينفَّذ في HR-05: تتحول الحالة إلى «نشط»'], ['not_confirm', 'عدم تثبيت', 'يبدأ مسار الإنهاء في HR-23']] }, { name: 'why', label: 'سبب القرار', type: 'textarea', required: true, rows: 2 }],
      check: () => (last ? null : 'اطلب من المشرف تقييمًا مكتوبًا قبل القرار.'),
      onSubmit: (v) => { st.update('probationEvals', (l) => { let p = l.find((x) => x.employeeId === e.id); if (!p) { p = { id: seqId('probationEvals', 'PE', 3), employeeId: e.id, startDate: e.hireDate, checkpoints: [], decision: null }; l.push(p); } p.decision = { value: v.dec, why: v.why, by: SA.session.userId, at: new Date().toISOString() }; });
        aud('HR.PRF.PROBATION_EVALUATED', 'probation', e.id, 'قرار التجربة — ' + e.name, { after: { قرار: v.dec === 'confirm' ? 'تثبيت' : 'عدم تثبيت' }, reason: v.why });
        if (v.dec === 'confirm') { st.patch('employees', e.id, { status: 'active' }); aud('HR.EMPLOYEE.UPDATED', 'employee', e.id, e.name, { before: { حالة: 'تجربة' }, after: { حالة: 'نشط' }, reason: 'تثبيت بعد التجربة (تنفيذ HR-05)' }); notify('تثبيت بعد التجربة', e.name + ' أصبح موظفًا مثبتًا.', 'info', ['R-11', 'R-12'], '#/hr/employees'); }
        else notify('قرار عدم تثبيت', 'ابدأ مسار الإنهاء المناسب في «الاستقالات والإنهاء».', 'action', ['R-11'], '#/hr/termination');
        SA.toast(v.dec === 'confirm' ? 'تم التثبيت وتحديث حالة الموظف' : 'سُجّل عدم التثبيت — تابع في الإنهاء', 'success'); } });
  }
  function tabProbation(view) {
    return SA.live(view, () => {
      const list = emps().filter((e) => e.status === 'probation');
      if (!list.length) return h('div.sap-hp-view', {}, SA.card({}, SA.empty({ icon: 'user', title: 'لا موظفين تحت التجربة', text: 'عند وجود موظف بحالة «تجربة» تظهر نقاط اليوم 30/60/80 هنا.' })));
      return h('div.sap-hp-view', {}, SA.alert('info', 'فترة التجربة مرة واحدة وحدها الأقصى ' + cfg('performance.probationMaxDays', 90) + ' يومًا ', lawTag(''), ' — مادة 90. لا تمديد في النظام: الخيار تثبيت أو عدم تثبيت.'),
        h('div.sap-hp-cols', {}, list.map((e) => { const pi = probationInfo(e); const cps = [30, 60, 80].map((d) => { const c = pi.pe && pi.pe.checkpoints.find((x) => x.day === d); const due = pi.elapsed >= d - 3; return { d, c, due }; });
          return SA.card({ title: e.name, tags: e.status === 'probation' ? SA.chip('تحت التجربة', 'info') : null }, h('div.sap-hp-row.is-between', {}, h('div', {}, h('div.sap-hp-big', {}, pi.elapsed), h('div.sap-hp-note', {}, 'يومًا منذ بدء التجربة (' + fd(pi.start) + ')')), h('div', {}, pi.left <= 7 ? SA.chip('عاجل: ' + (pi.left < 0 ? 'تجاوزت الحد' : 'تنتهي خلال ' + pi.left + ' ي') + ' (N-14)', 'danger') : SA.chip('متبقٍ ' + pi.left + ' يوم', 'success'))),
            h('ul.sap-hp-tl', {}, cps.map((x) => h('li', { class: x.c ? 'is-done' : x.due ? 'is-now' : '' }, h('b', {}, 'تقييم اليوم ' + x.d), h('small', {}, x.c ? 'تم · توصية: ' + (x.c.recommendation === 'confirm' ? 'تثبيت' : 'عدم تثبيت') : x.due ? 'مستحق الآن' : 'لم يحن بعد')))),
            h('div.sap-hp-row', {}, cps.filter((x) => x.due && !x.c).slice(0, 1).map((x) => btn({ label: 'تقييم اليوم ' + x.d, icon: 'edit', kind: 'primary', perm: 'hr.performance.edit', onClick: () => probationCheckpoint(e, x.d) })), btn({ label: pi.pe && pi.pe.decision ? 'القرار: ' + (pi.pe.decision.value === 'confirm' ? 'تثبيت' : 'عدم تثبيت') : 'قرار HR Manager', icon: 'check', kind: 'ghost', perm: 'hr.performance.edit', reason: pi.pe && pi.pe.decision ? 'سُجّل القرار' : '', onClick: () => probationDecide(e, pi) })));
        })), h('p.sap-hp-note', {}, specLink('m-prf-08')));
    }, ['employees', 'probationEvals']);
  }

  const perfBadge = () => { const n = L('appraisals').filter((a) => a.status === 'not_started').length; return n || null; };
  screen({ id: 'hr-performance', route: 'hr/performance', perm: 'hr.performance.view', title: 'الأداء والتقييم', icon: 'gauge', order: 41, desc: 'دورات التقييم وقوالب KPI لكل عائلة وظيفية وتقييم المشرف والمعايرة، ومخرجاتها مقترحات تدخل التغييرات الوظيفية والتدريب.', watch: ['appraisals'], badge: perfBadge,
    tags: () => [SA.tag('new', 'HR-18')],
    tabs: [
      { id: 'cycles', label: 'الدورات', icon: 'gauge', render: tabCycles, primary: () => btn({ label: 'دورة جديدة', icon: 'plus', kind: 'accent', perm: 'hr.performance.edit', onClick: newCycle }) },
      { id: 'templates', label: 'قوالب KPI', icon: 'clipboard', render: tabTemplates },
      { id: 'team', label: 'تقييمات الفريق', icon: 'users', render: tabTeam, badge: () => L('appraisals').filter((a) => a.status === 'not_started' || a.status === 'self').length || null },
      { id: 'calibrate', label: 'المعايرة', icon: 'compare', render: tabCalibrate },
      { id: 'outcomes', label: 'النتائج والمقترحات', icon: 'swap', render: tabOutcomes },
      { id: 'probation', label: 'تقييم التجربة', icon: 'user', render: tabProbation }
    ] });

  /* ═════════════════════════════ HR-19 · التدريب ومصفوفة المهارات ═════════════════════════════ */
  const SESS_ST = { published: ['منشورة', 'info'], held: ['منعقدة', 'warning'], closed: ['مُغلقة', 'success'], cancelled: ['ملغاة', 'neutral'], draft: ['مسودة', 'neutral'] };
  const BLOCK_L = { hard: 'صارم', soft: 'مشروط', warn: 'تحذير' }; const BLOCK_C = { hard: 'danger', soft: 'warning', warn: 'info' };
  const NEED_ST = { proposed: ['Proposed', 'info'], accepted: ['مقبول', 'success'], scheduled: ['مجدول', 'success'], closed: ['مُغلق', 'neutral'], rejected: ['مرفوض', 'neutral'] };
  const CB_ST = { draft: ['مسودة', 'neutral'], active: ['سارية', 'success'], fulfilled: ['مستوفاة', 'neutral'], due: ['مستحقة', 'danger'], paid: ['مُسدّدة', 'neutral'], waived: ['مُسقَطة', 'neutral'] };
  const LVL_L = ['غير مؤهل', 'تحت التدريب بمراقبة', 'يعمل بإشراف', 'مستقل (مؤهل)', 'مدرّب / مرجع'];
  const skillName = (id) => (find('skillDefs', id) || {}).name || id;
  const courseName = (id) => (find('courses', id) || {}).name || id || '—';
  const monthsElapsed = (from) => (from ? Math.max(0, Math.floor(dd(from, T()) / 30.4375)) : 0);
  const canCertify = (skillId, empId) => { const r = SA.session.role; if (!r) return false; if (r.id === 'R-15' || r.id === 'R-01') return true; const me = myEmp(); const es = me && skillRow(me.id, skillId); return !!(es && es.level >= 4 && skillStatus(es).k !== 'expired' && me.id !== empId); };
  const trnCost = (v) => (v == null ? '—' : money(v));

  /* ── مصفوفة المهارات ── */
  function certifyModal(empId, skillId) {
    const sk = find('skillDefs', skillId); const e = emp(empId); const cur = skillRow(empId, skillId);
    return formModal({ title: 'اعتماد مستوى مهارة — ' + (e ? e.name : ''), subtitle: sk ? sk.name : '', icon: 'star', size: 'md', submitLabel: 'اعتماد وحفظ',
      fields: [{ name: 'level', label: 'المستوى (0–4)', type: 'select', required: true, value: cur ? String(cur.level) : '', options: [['', 'اختر المستوى…']].concat(LVL_L.map((l, i) => [String(i), i + ' — ' + l])) },
        { name: 'issued', label: 'تاريخ الإصدار', type: 'date', required: true, value: T() }, { name: 'expires', label: 'تاريخ الانتهاء' + (sk && sk.validityMonths ? '' : ' (اختياري)'), type: 'date', value: sk && sk.validityMonths ? D(Math.round(sk.validityMonths * 30.44)) : '', hint: sk && sk.validityMonths ? 'صلاحية مقترحة ' + sk.validityMonths + ' شهرًا (قيمة تجريبية — Open).' : 'مدة الصلاحية {Open} لهذه المهارة.' },
        { name: 'proof', label: 'مرفق الإثبات (محاكاة رفع ملف)', placeholder: 'اسم الملف: نتيجة-الاختبار.pdf', hint: 'مطلوب للمستوى 3 فأعلى: صورة الشهادة أو نتيجة الاختبار.' }],
      check: (v) => { const lv = +v.level; if (myEmp() && myEmp().id === empId) return 'ما ينفعش تعتمد مهارتك بنفسك. لازم مدرب أو مسؤول السلامة.'; if (!canCertify(skillId, empId)) return 'الاعتماد لمدرب مستوى 4 أو مسؤول السلامة (OHS) فقط — hr.skills.certify.'; if (v.expires && v.expires <= v.issued) return { expires: 'تاريخ الانتهاء لازم يكون بعد تاريخ الإصدار.' }; if (lv >= 3 && !String(v.proof || '').trim()) return { proof: 'ارفع صورة الشهادة أو نتيجة الاختبار قبل الحفظ (مطلوبة للمستوى 3 فأعلى).' }; return null; },
      onSubmit: (v) => { const lv = +v.level; st.update('empSkills', (l) => { let r = l.find((x) => x.employeeId === empId && x.skillId === skillId); if (!r) { r = { id: seqId('empSkills', 'ES', 3), employeeId: empId, skillId }; l.push(r); } Object.assign(r, { level: lv, issuedAt: v.issued, expiresAt: v.expires || null, proof: String(v.proof || '').trim() || null, certifiedBy: SA.session.userId, revoked: false, revokedReason: null, alertedLevel: null, expiredLogged: false }); });
        aud('HR.TRN.SKILL_CERTIFIED', 'skill', empId + ':' + skillId, (e ? e.name : '') + ' — ' + (sk ? sk.name : ''), { before: { مستوى: cur ? cur.level : 0 }, after: { مستوى: lv, ينتهي: v.expires || '—' } }); SA.toast('تم اعتماد المستوى وتحديث الخلية', 'success'); } });
  }
  function revokeSkill(empId, skillId) {
    const e = emp(empId); const cur = skillRow(empId, skillId);
    if (!canCertify(skillId, empId)) { SA.toast('السحب لمدرب مستوى 4 أو مسؤول السلامة فقط.', 'warn'); return; }
    return confirmAct({ title: 'سحب الشهادة — ' + (e ? e.name : ''), danger: true, confirmLabel: 'سحب الشهادة', reasonRequired: true, reasonLabel: 'سبب السحب (حادث/ملاحظة)', impact: ['تعود الخلية «غير مؤهل» ويُعاد تقييم قواعد الإسناد فورًا.', 'لن يستطيع الموظف تشغيل «' + skillName(skillId) + '» حتى إعادة اعتماده.'], step: 'policy.change',
      run: (r) => { st.patch('empSkills', cur.id, { level: 0, revoked: true, revokedReason: r.reason }); aud('HR.TRN.SKILL_REVOKED', 'skill', empId + ':' + skillId, (e ? e.name : '') + ' — ' + skillName(skillId), { before: { مستوى: cur.level }, after: { مستوى: 0 }, reason: r.reason }); notify('تحديث شهادة تشغيل', 'سُحبت شهادة تشغيل (التفاصيل في شاشة التدريب).', 'action', ['R-14', 'R-15'], '#/hr/training'); }, success: 'تم سحب الشهادة' });
  }
  function openCell(empId, skillId) {
    liveDrawer({ title: 'بطاقة مهارة', paths: ['empSkills', 'fitness'], build() {
      const e = emp(empId); const sk = find('skillDefs', skillId); if (!e || !sk) return false; const es = skillRow(empId, skillId); const s = skillStatus(es); const chk = skillCheck(empId, skillId);
      return { title: e.name, subtitle: sk.name, body: h('div.sap-drawer-inner', {}, h('div.sap-hp-row.is-between', {}, empCell(e), h('span.sap-hp-cb.' + s.cls, { style: { cursor: 'default' } }, h('b', {}, String(s.lvl)), h('small', {}, s.label))),
        SA.kv([['المستوى', s.lvl + ' — ' + LVL_L[s.lvl]], ['تاريخ الإصدار', es ? fd(es.issuedAt) : '—'], ['تاريخ الانتهاء', es && es.expiresAt ? fd(es.expiresAt) + (s.days != null ? ' (' + (s.days < 0 ? 'منذ ' + (-s.days) : 'بعد ' + s.days) + ' ي)' : '') : 'لا ينتهي / غير مُعدّ'], ['المُعتمِد', es && es.certifiedBy ? (String(es.certifiedBy).indexOf('U-') === 0 ? uname(es.certifiedBy) : es.certifiedBy) : '—'], ['مرفق الإثبات', es && es.proof ? h('span', {}, SA.icon('file', 'icon-sm'), ' ', es.proof) : es && es.level >= 3 ? SA.chip('ناقص — مطلوب', 'danger') : '—'], es && es.revoked ? ['سبب السحب', es.revokedReason || '—'] : null, ['نمط الحظر', SA.chip(BLOCK_L[sk.block], BLOCK_C[sk.block])], ['المستوى المطلوب للتشغيل', h('span', {}, h('b.num', {}, sk.requiredLevel), ' ', SA.tag('open', 'Open'))]]),
        sec('هل يمكن إسناده الآن؟', h('div.sap-hp-res.' + (chk.ok ? 'is-ok' : 'is-bad'), {}, h('b', {}, chk.ok ? 'نعم — مسموح' : chk.mode === 'hard' ? 'مرفوض (حظر صارم)' : 'مرفوض (يحتاج تجاوزًا مشروطًا)'), chk.reasons.length ? h('ul', {}, chk.reasons.map((r) => h('li', {}, r.text))) : null))),
        foot: [btn({ label: 'سحب الشهادة', icon: 'xcircle', kind: 'danger', perm: 'hr.training.edit', reason: !es || es.level <= 0 ? 'لا شهادة للسحب' : !canCertify(skillId, empId) ? 'لمدرب مستوى 4 أو OHS (hr.skills.certify)' : '', onClick: () => revokeSkill(empId, skillId) }), btn({ label: es ? 'تحديث / تجديد المستوى' : 'اعتماد مستوى', icon: 'check', kind: 'primary', perm: 'hr.training.edit', reason: !canCertify(skillId, empId) ? 'لمدرب مستوى 4 أو OHS (hr.skills.certify)' : '', onClick: () => certifyModal(empId, skillId) })] };
    } });
  }
  function coverage() {
    const rows = emps().filter((e) => e.status !== 'terminated' && L('jobRequired').some((j) => j.positionId === e.positionId && j.kind === 'skill')); if (!rows.length) return null;
    const ok = rows.filter((e) => L('jobRequired').filter((j) => j.positionId === e.positionId && j.kind === 'skill').every((j) => { const k = skillStatus(skillRow(e.id, j.refId)).k; return k === 'ok' || k === 'soon' || k === 'urgent'; })).length; return { ok, total: rows.length, pct: Math.round(ok / rows.length * 100) };
  }
  function tabMatrix(view) {
    let q = ''; let dept = '';
    return SA.live(view, () => {
      const sks = L('skillDefs'); const list = () => emps().filter((e) => OPS.indexOf(e.id) >= 0 && (!q || e.name.indexOf(q) >= 0) && (!dept || e.departmentId === dept));
      const certs = L('empSkills').filter((x) => x.level >= 3); const st2 = certs.map((x) => skillStatus(x)); const cv = coverage(); const noSafe = emps().filter((e) => OPS.indexOf(e.id) >= 0 && skillStatus(skillRow(e.id, 'SK-SAFE')).k !== 'ok').length;
      const grid = h('div.sap-hp-mxwrap');
      const cellNode = (e, s) => { const es = skillRow(e.id, s.id); const ss = skillStatus(es); return h('td', {}, h('button.sap-hp-cb.' + ss.cls, { type: 'button', 'aria-label': e.name + ' — ' + s.name + ': مستوى ' + ss.lvl + '، ' + ss.label, onclick: () => openCell(e.id, s.id) }, h('b', {}, String(ss.lvl)), h('small', {}, ss.label))); };
      const draw = () => {
        SA.clear(grid); const rows = list();
        const head = h('thead', {}, h('tr', {}, h('th', {}, 'الموظف'), sks.map((s) => h('th', { title: s.name }, h('div', {}, s.name.length > 22 ? s.name.slice(0, 22) + '…' : s.name), h('div.sap-hp-note', {}, SA.chip(BLOCK_L[s.block], BLOCK_C[s.block]))))));
        const body = h('tbody', {}, rows.map((e) => h('tr', {}, h('th', { scope: 'row' }, empCell(e, deptName(e.departmentId) + (e.status === 'probation' ? ' · تجربة' : e.status === 'leave' ? ' · إجازة' : ''))), sks.map((s) => cellNode(e, s)))));
        grid.append(h('table.sap-hp-mx', { 'aria-label': 'مصفوفة مهارات المشغّلين' }, head, body));
        if (!rows.length) grid.append(SA.empty({ icon: 'search', title: 'لا نتائج', text: 'غيّر البحث أو القسم.' }));
      };
      draw();
      return h('div.sap-hp-view', {}, kpiRow([['تغطية المصفوفة', cv ? N(cv.pct + '%') : '—', { sub: cv ? cv.ok + ' من ' + cv.total + ' مؤهل بكل الإلزامي' : '' }], ['شهادات تنتهي ≤ 60 يومًا', N(st2.filter((x) => x.k === 'soon' || x.k === 'urgent').length), { href: SA.href('hr/training?tab=expiry') }], ['شهادات منتهية', N(st2.filter((x) => x.k === 'expired').length), { accent: st2.some((x) => x.k === 'expired'), href: SA.href('hr/training?tab=expiry') }], ['بدون توجيه السلامة', N(noSafe), { sub: 'يُحظر إسنادهم' }]]),
        h('div.sap-hp-row', {}, h('div.input-wrap.sap-search', { style: { flex: '1 1 240px' } }, SA.icon('search'), h('input.input', { type: 'search', placeholder: 'ابحث باسم المشغّل…', 'aria-label': 'بحث', oninput: SA.debounce((ev) => { q = ev.target.value.trim(); draw(); }, 120) })), h('select.select', { 'aria-label': 'القسم', style: { width: 'auto' }, onchange: (ev) => { dept = ev.target.value; draw(); } }, [h('option', { value: '' }, 'كل أقسام الإنتاج')].concat((st.get('departments') || []).filter((d) => ['D-09', 'D-10', 'D-11', 'D-12'].indexOf(d.id) >= 0).map((d) => h('option', { value: d.id }, d.name))))),
        h('div.sap-hp-leg', {}, [['var(--color-success-tint)', 'سارية'], ['var(--color-warning-tint)', 'ينتهي ≤ 60 يومًا'], ['var(--color-danger-tint)', 'ينتهي ≤ 7 أيام / منتهي'], ['var(--color-primary-tint)', 'تدريب (1–2)'], ['transparent', 'غير مؤهل']].map((x) => h('span', {}, h('i', { style: { background: x[0], border: '1px solid var(--color-border-strong)' } }), x[1])), h('span', {}, 'الرقم = المستوى 0–4، والنص = الحالة (لا لون وحده).')), grid,
        h('p.sap-hp-note', {}, 'اضغط أي خلية لفتح بطاقة المهارة. فحص الحظر يتم على الخادم عند الإسناد (HR-09) وعند بدء الوردية. ', specLink('m-trn-04')));
    }, ['empSkills', 'skillDefs', 'employees']);
  }

  /* ── انتهاء الشهادات ── */
  function expiryRows() {
    return L('empSkills').filter((x) => x.level >= 3 && x.expiresAt).map((x) => ({ id: x.id, es: x, st: skillStatus(x), emp: emp(x.employeeId) })).filter((r) => r.emp && (r.st.k === 'expired' || r.st.k === 'soon' || r.st.k === 'urgent')).sort((a, b) => a.st.days - b.st.days);
  }
  function runExpiryJob() {
    return confirmAct({ title: 'تشغيل فحص الانتهاء اليومي', impact: ['يُحسب المتبقي لكل شهادة ويُرسل التنبيه عند 60/30/7/0 يوم للموظف ومشرفه والتدريب.', 'الشهادة المنتهية تسجَّل (CERT_EXPIRED) ويرتفع التنبيه Urgent (N-28).'], confirmLabel: 'تشغيل الفحص',
      run: () => { const rows = expiryRows(); let ex = 0; let al = 0; rows.forEach((r) => { if (r.st.k === 'expired' && !r.es.expiredLogged) { st.patch('empSkills', r.es.id, { expiredLogged: true }); aud('HR.TRN.CERT_EXPIRED', 'skill', r.es.id, r.emp.name + ' — ' + skillName(r.es.skillId), { after: { انتهت: fd(r.es.expiresAt) } }); ex++; } else if (r.st.alert && r.es.alertedLevel !== r.st.alert) { st.patch('empSkills', r.es.id, { alertedLevel: r.st.alert }); al++; } });
        if (ex) notify('شهادة منتهية على الماكينة', ex + ' شهادة تشغيل منتهية — لا إسناد قبل التجديد.', 'urgent', ['R-14', 'R-05', 'R-15'], '#/hr/training?tab=expiry');
        if (al) notify('شهادات تنتهي قريبًا', al + ' شهادة تنتهي خلال 60 يومًا أو أقل.', 'action', ['R-14', 'R-15', 'R-11'], '#/hr/training?tab=expiry');
        SA.toast(ex || al ? 'تم الفحص: ' + ex + ' منتهية جديدة · ' + al + ' تنبيهات جديدة' : 'لا تنبيهات جديدة اليوم', ex ? 'warn' : 'success'); } });
  }
  function proposeRenewal(r) {
    const crs = L('courses').find((c) => c.skillId === r.es.skillId);
    if (L('trainingNeeds').some((n) => n.employeeId === r.es.employeeId && n.courseId === (crs && crs.id) && ['closed', 'rejected'].indexOf(n.status) < 0)) { SA.toast('يوجد احتياج مفتوح لنفس الشخص والدورة — لا تكرار.', 'info'); return; }
    return run(() => { st.insert('trainingNeeds', { id: seqId('trainingNeeds', 'TN', 4, Y()), employeeId: r.es.employeeId, need: 'تجديد شهادة ' + skillName(r.es.skillId), courseId: crs ? crs.id : null, source: 'gap', sourceRef: 'لوحة انتهاء الشهادات', priority: r.st.k === 'expired' ? 'high' : 'normal', status: 'proposed', sessionId: null, createdAt: new Date().toISOString() }); aud('HR.TRN.NEED_CREATED', 'training_need', r.es.id, 'تجديد — ' + r.emp.name, { after: { مصدر: 'انتهاء شهادة' } }); }).then((ok) => { if (ok) SA.toast('أُضيف احتياج تجديد إلى الخطة', 'success'); });
  }
  function tabExpiry(view) {
    return SA.live(view, () => {
      const rows = expiryRows(); const c = { exp: rows.filter((r) => r.st.k === 'expired').length, u: rows.filter((r) => r.st.k === 'urgent').length, a: rows.filter((r) => r.st.alert === 'action').length, i: rows.filter((r) => r.st.alert === 'info').length };
      const t = tcard({ caption: 'الشهادات المنتهية والقريبة من الانتهاء', rows: () => expiryRows(), onRowClick: (r) => openCell(r.es.employeeId, r.es.skillId), pageSize: 10,
        filters: [{ key: 'lvl', label: 'المستوى', options: [['expired', 'منتهية'], ['urgent', 'عاجل ≤ 7'], ['action', 'إجراء ≤ 30'], ['info', 'معلومة ≤ 60']], test: (r, v) => (v === 'expired' ? r.st.k === 'expired' : r.st.k !== 'expired' && r.st.alert === v) }],
        columns: [{ key: 'emp', label: 'الموظف', render: (r) => empCell(r.emp) }, { key: 'sk', label: 'الماكينة / الشهادة', render: (r) => skillName(r.es.skillId) }, { key: 'exp', label: 'الانتهاء', sort: true, value: (r) => r.st.days, render: (r) => h('span.num', {}, fd(r.es.expiresAt) + ' ', h('span.sap-hp-note', {}, r.st.days < 0 ? '(منذ ' + (-r.st.days) + ' ي)' : '(بعد ' + r.st.days + ' ي)')) }, { key: 'lvl', label: 'مستوى التنبيه', render: (r) => (r.st.k === 'expired' ? SA.chip('منتهية — Urgent', 'danger') : r.st.alert === 'urgent' ? SA.chip('Urgent ≤ 7', 'danger') : r.st.alert === 'action' ? SA.chip('Action ≤ 30', 'warning') : SA.chip('Info ≤ 60', 'info')) }, { key: 'blk', label: 'أثر الحظر', render: (r) => (r.st.k === 'expired' ? SA.chip(BLOCK_L[(find('skillDefs', r.es.skillId) || {}).block] || '—', BLOCK_C[(find('skillDefs', r.es.skillId) || {}).block] || 'neutral') : '—') }],
        rowActions: (r) => [{ label: 'اقتراح جلسة تجديد', icon: 'plus', onClick: () => proposeRenewal(r) }, { label: 'فتح بطاقة المهارة', icon: 'eye', onClick: () => openCell(r.es.employeeId, r.es.skillId) }],
        empty: { icon: 'checkcircle', title: 'لا شهادات تنتهي قريبًا', text: 'كل الشهادات سارية لأكثر من 60 يومًا.' } });
      return h('div.sap-hp-view', {}, kpiRow([['منتهية', N(c.exp), { accent: c.exp > 0, sub: 'لا إسناد قبل التجديد' }], ['عاجل (≤ 7 أيام)', N(c.u)], ['إجراء (≤ 30)', N(c.a)], ['معلومة (≤ 60)', N(c.i)]]), t.el,
        h('div.sap-hp-row', {}, btn({ label: 'تشغيل فحص الانتهاء اليومي', icon: 'refresh', kind: 'ghost', perm: 'hr.training.edit', onClick: runExpiryJob }), h('span.sap-hp-note', {}, 'التنبيه عند ' + cfg('training.alertDays', [60, 30, 7, 0]).join(' / ') + ' يوم (قابل للتعديل). '), specLink('m-trn-06')));
    }, ['empSkills']);
  }

  /* ── قاعدة الحظر والمحاكاة ── */
  function editBlock(sk) {
    return formModal({ title: 'نمط حظر: ' + sk.name, subtitle: 'تغيير حرج: يُسجَّل بخطورة «حرجة» وبسبب مكتوب.', icon: 'shield', size: 'sm', submitLabel: 'حفظ النمط', step: 'policy.change', stepTitle: 'تعديل نمط حظر',
      fields: [{ name: 'block', label: 'نمط الحظر', type: 'radio', required: true, value: sk.block, options: [['hard', 'صارم', 'لا تجاوز: شهادة منتهية / مستوى ناقص ← رفض'], ['soft', 'مشروط', 'تجاوز مؤقت باعتماد Production Manager + OHS'], ['warn', 'تحذير فقط', 'لا يمنع الإسناد']] }, { name: 'lvl', label: 'المستوى المطلوب للتشغيل', type: 'select', value: String(sk.requiredLevel), options: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], hint: 'القيمة المقترحة 3 — {Open}.' }, { name: 'reason', label: 'سبب التعديل', type: 'textarea', required: true, rows: 2 }],
      check: (v) => (sk.type === 'safety' && v.block !== 'hard' ? 'توجيه السلامة صارم دائمًا (BR-TRN-06) — لا يمكن تخفيفه.' : null),
      onSubmit: (v) => { st.patch('skillDefs', sk.id, { block: v.block, requiredLevel: +v.lvl }); aud('HR.TRN.BLOCKRULE_CHANGED', 'skill', sk.id, sk.name, { before: { نمط: BLOCK_L[sk.block], مطلوب: sk.requiredLevel }, after: { نمط: BLOCK_L[v.block], مطلوب: +v.lvl }, reason: v.reason }); SA.toast('تم تحديث نمط الحظر', 'success'); } });
  }
  function requestOverride(empId, skillId, chk) {
    const e = emp(empId); const sk = find('skillDefs', skillId);
    return formModal({ title: 'طلب تجاوز مؤقت لحظر الإسناد', subtitle: e.name + ' — ' + sk.name, icon: 'shield', size: 'sm', submitLabel: 'إرسال للاعتماد',
      intro: SA.alert('warning', 'التجاوز المشروط يحتاج اعتماد اثنين (Production Manager + OHS Officer) ومع مدرب مشرف. لا تجاوز للحظر الصارم.'),
      fields: [{ name: 'reason', label: 'سبب التجاوز', type: 'textarea', required: true, rows: 2 }, { name: 'hours', label: 'المدة بالساعات', type: 'number', required: true, min: 1, hint: 'الحد الأقصى للمدة: ' + (cfg('training.overrideMaxHours', null) == null ? 'غير مُعدّ (Open)' : cfg('training.overrideMaxHours')) }, { name: 'trainer', label: 'المدرب المشرف', required: true, placeholder: 'اسم المدرب / مستوى 4' }],
      check: (v) => { const mx = cfg('training.overrideMaxHours', null); return mx != null && v.hours > mx ? { hours: 'المدة تتجاوز الحد المسموح (' + mx + ' ساعة).' } : null; },
      onSubmit: (v) => { const id = seqId('assignOverrides', 'OV', 3, Y()); const ap = SA.requestApproval({ type: 'assignment_override', title: 'تجاوز مؤقت لحظر الإسناد — ' + e.name + ' · ' + sk.name, chain: [{ roleId: 'R-05', label: 'مدير الإنتاج (Production Manager)' }, { roleId: 'R-15', label: 'مسؤول السلامة (OHS Officer)' }], context: [['الموظف', e.name], ['الماكينة', sk.name], ['المدة', v.hours + ' ساعة'], ['المدرب المشرف', v.trainer], ['سبب الحظر', chk.reasons.map((r) => r.text).join(' · ')], ['السبب', v.reason]], ref: { type: 'assignment_override', id } });
        st.insert('assignOverrides', { id, employeeId: empId, skillId, reason: v.reason, hours: v.hours, trainer: v.trainer, requestedBy: SA.session.userId, status: 'pending', approvalId: ap.id, requestedAt: new Date().toISOString(), validUntil: null });
        aud('HR.TRN.OVERRIDE_REQUESTED', 'override', id, e.name + ' — ' + sk.name, { after: { ساعات: v.hours, مدرب: v.trainer }, reason: v.reason }); SA.toast('أُرسل طلب التجاوز إلى صندوق الاعتمادات', 'success'); } });
  }
  function tabRules(view) {
    let simEmp = ''; let simSk = ''; let result = null;
    return SA.live(view, () => {
      const out = h('div'); const showResult = () => { SA.clear(out); if (!result) return; const r = result.res; const e = emp(result.emp); const sk = find('skillDefs', result.sk);
        out.append(h('div.sap-hp-res.' + (r.ok ? (r.warnings.length ? 'is-warn' : 'is-ok') : 'is-bad'), { role: 'status' }, h('b', {}, r.ok ? (r.override ? 'مسموح بتجاوز مؤقت معتمد' : r.warnings.length ? 'مسموح مع تحذير' : 'مسموح بالإسناد') : r.mode === 'hard' ? 'تعذّر الإسناد — حظر صارم' : 'تعذّر الإسناد — يمكن طلب تجاوز مؤقت'), r.reasons.length ? h('ul', {}, r.reasons.map((x) => h('li', {}, x.text))) : h('span', {}, e.name + ' مؤهل لتشغيل «' + sk.name + '».'),
          !r.ok && r.alternatives.length ? h('div', {}, h('b', {}, 'بدائل مؤهلة متاحة: '), r.alternatives.map((id) => h('span.sap-hp-tag', {}, en(id)))) : null,
          r.needsOverride ? btn({ label: 'طلب تجاوز مؤقت', icon: 'shield', kind: 'ghost', perm: 'hr.training.edit', onClick: () => requestOverride(result.emp, result.sk, r) }) : null, h('div.sap-hp-note', {}, 'رسالة الرفض تذكر السبب فقط — لا بيانات طبية (اللياقة = لائق/غير لائق).'))); };
      const eSel = SA.form.field({ name: 'e', label: 'الموظف المراد إسناده', type: 'select', options: empOpts((x) => OPS.indexOf(x.id) >= 0), value: simEmp }); const sSel = SA.form.field({ name: 's', label: 'الماكينة / الخط', type: 'select', options: [['', 'اختر الماكينة…']].concat(L('skillDefs').filter((s) => s.type === 'machine').map((s) => [s.id, s.name])), value: simSk });
      const sim = h('div.sap-hp-sim', {}, h('b', {}, 'محاكاة الإسناد (كما يراها مخطِّط الورديات في HR-09)'), h('div.sap-hp-cols', {}, eSel.el, sSel.el), h('div.sap-hp-row', {}, h('button.btn.btn-primary', { type: 'button', onclick: () => { simEmp = eSel.get(); simSk = sSel.get(); if (!simEmp || !simSk) { SA.toast('اختر الموظف والماكينة.', 'warn'); return; } const res = assignMachine(simEmp, simSk, { via: 'web' }); result = { emp: simEmp, sk: simSk, res }; showResult(); if (!res.ok) SA.toast('تعذّر الإسناد — سُجّل في التدقيق', 'warn'); } }, SA.icon('play', 'icon-sm'), 'فحص الإسناد'), h('span.sap-hp-note', {}, 'الرفض يُسجَّل HR.TRN.ASSIGNMENT_BLOCKED ويُخطر المشرف ومدير الإنتاج والسلامة.')), out);
      showResult();
      const blockT = tcard({ caption: 'أنماط الحظر', rows: () => L('skillDefs'), pageSize: 10, columns: [{ key: 'n', label: 'المهارة / الماكينة', render: (s) => h('div', {}, h('b', {}, s.name), h('div.sap-hp-note', {}, s.type === 'safety' ? 'شرط تشغيل مستقل' : 'ماكينة')) }, { key: 'b', label: 'النمط', render: (s) => SA.chip(BLOCK_L[s.block], BLOCK_C[s.block]) }, { key: 'l', label: 'المستوى المطلوب', render: (s) => h('span', {}, h('b.num', {}, s.requiredLevel), ' ', SA.tag('open', 'Open')) }, { key: 'c', label: 'حرجة للسلامة', render: (s) => (s.critical ? SA.chip('نعم', 'danger') : '—') }],
        rowActions: (s) => [{ label: 'تعديل النمط', icon: 'edit', disabled: SA.can('hr.training.edit') ? '' : NOPERM('hr.training.edit'), onClick: () => editBlock(s) }] });
      const ov = L('assignOverrides'); const OVST = { pending: ['بانتظار الاعتماد', 'warning'], active: ['ساري', 'success'], rejected: ['مرفوض', 'danger'], expired: ['منتهي', 'neutral'] };
      const jrT = tcard({ caption: 'التدريب الإلزامي لكل وظيفة', rows: () => L('jobRequired'), pageSize: 6, columns: [{ key: 'p', label: 'الوظيفة', render: (j) => posTitle(j.positionId) }, { key: 'r', label: 'المطلوب', render: (j) => (j.kind === 'skill' ? skillName(j.refId) : courseName(j.refId)) }, { key: 't', label: 'التوقيت', render: (j) => ({ before_operate: 'قبل التشغيل', within_days: 'خلال {Open} يوم من التعيين', recurring: 'دوري كل {Open} شهرًا' })[j.timing] }, { key: 'c', label: 'حرجة', render: (j) => (j.critical ? SA.chip('حرجة للسلامة', 'danger') : '—') }] });
      return h('div.sap-hp-view', {}, SA.alert('info', 'الحظر الفعلي يتم على الخادم عند الإسناد وعند بدء الوردية: توجيه السلامة · اللياقة (حالة فقط) · مستوى المهارة · صلاحية الشهادة. إن تعذّر الفحص يُمنع الإسناد (fail-closed).'), sim,
        h('div.sap-hp-cols', {}, h('div', {}, sec('أنماط الحظر لكل مهارة', blockT.el)), h('div', {}, sec('طلبات التجاوز المؤقت', ov.length ? tcard({ caption: 'طلبات التجاوز', rows: () => L('assignOverrides'), pageSize: 5, columns: [{ key: 'e', label: 'الموظف', render: (o) => en(o.employeeId) }, { key: 's', label: 'الماكينة', render: (o) => skillName(o.skillId) }, { key: 'st', label: 'الحالة', render: (o) => stChip(OVST, o.status) }, { key: 'v', label: 'حتى', render: (o) => (o.validUntil ? SA.fmt.dt(o.validUntil) : '—') }] }).el : SA.card({}, SA.empty({ icon: 'shield', title: 'لا طلبات تجاوز', text: 'تظهر هنا عند طلب تجاوز مشروط من المحاكاة.' }))))),
        h('div.sap-hp-row.is-between', {}, h('h3', { style: { margin: 0 } }, 'التدريب الإلزامي لكل وظيفة'), btn({ label: 'إضافة إلزامي', icon: 'plus', kind: 'ghost', perm: 'hr.training.edit', onClick: addRequired })), jrT.el, specLink('m-trn-07'));
    }, ['skillDefs', 'empSkills', 'assignOverrides', 'jobRequired', 'fitness']);
  }
  function addRequired() {
    return formModal({ title: 'إضافة تدريب إلزامي لوظيفة', icon: 'clipboard', size: 'sm', submitLabel: 'إضافة',
      fields: [{ name: 'pos', label: 'الوظيفة', type: 'select', required: true, options: [['', 'اختر…']].concat((st.get('positions') || []).map((p) => [p.id, p.title])) }, { name: 'ref', label: 'المهارة أو الدورة', type: 'select', required: true, options: [['', 'اختر…']].concat(L('skillDefs').map((s) => ['skill:' + s.id, 'مهارة — ' + s.name]), L('courses').map((c) => ['course:' + c.id, 'دورة — ' + c.name])) }, { name: 'timing', label: 'التوقيت', type: 'select', required: true, options: [['before_operate', 'قبل التشغيل'], ['within_days', 'خلال {Open} يوم من التعيين'], ['recurring', 'دوري كل {Open} شهرًا']] }, { name: 'critical', label: 'حرجة للسلامة (تفعّل الحظر الصارم)', type: 'switch' }],
      onSubmit: (v) => { const [kind, refId] = v.ref.split(':'); const n = emps().filter((e) => e.positionId === v.pos && e.status !== 'terminated').length; st.insert('jobRequired', { id: seqId('jobRequired', 'JR', 2), positionId: v.pos, kind, refId, timing: v.timing, critical: !!v.critical }); aud('HR.TRN.REQUIRED_CHANGED', 'job_required', v.pos, posTitle(v.pos), { after: { المطلوب: kind === 'skill' ? skillName(refId) : courseName(refId), متأثرون: n } }); SA.toast('أُضيف الإلزامي — يتأثر ' + n + ' موظف حاليًا', 'success'); } });
  }

  /* ── الجلسات والحضور ── */
  function scheduleSession() {
    const crs = L('courses').filter((c) => c.active);
    let partField = null;
    return formModal({ title: 'جدولة جلسة تدريب', subtitle: 'UC-TRN-03 — يُقترح المشاركون ممن انتهت شهادته أو لم يكمل توجيه السلامة.', icon: 'star', size: 'lg', submitLabel: 'نشر الجلسة',
      fields: [{ name: 'course', label: 'الدورة', type: 'select', required: true, options: [['', 'اختر الدورة…']].concat(crs.map((c) => [c.id, c.name])), onChange: (id) => { const c = find('courses', id); if (!c || !partField) return; const sugg = emps().filter((e) => OPS.indexOf(e.id) >= 0 && (c.skillId === 'SK-SAFE' ? skillStatus(skillRow(e.id, 'SK-SAFE')).k !== 'ok' : c.skillId ? ['expired', 'none'].indexOf(skillStatus(skillRow(e.id, c.skillId)).k) >= 0 || (skillStatus(skillRow(e.id, c.skillId)).alert === 'urgent' || skillStatus(skillRow(e.id, c.skillId)).alert === 'action') : false)).map((e) => e.id); partField.set(sugg); } },
        { name: 'date', label: 'تاريخ الجلسة', type: 'date', required: true, value: D(7) }, { name: 'loc', label: 'المكان', required: true, value: 'قاعة التدريب — المصنع' }, { name: 'trainer', label: 'المدرب (داخلي/خارجي)', required: true, placeholder: 'اسم المدرب أو الجهة' }, { name: 'seats', label: 'عدد المقاعد', type: 'number', required: true, min: 1, value: 6 }, { name: 'cost', label: 'التكلفة المقدّرة (ج.م)', type: 'number', min: 0, hint: 'حد الاعتماد للتكلفة {Open} (D7).' },
        { name: 'parts', label: 'المشاركون', type: 'multi', options: emps().filter((e) => OPS.indexOf(e.id) >= 0).map((e) => [e.id, e.name, deptName(e.departmentId)]) }],
      onOpen: (by) => { partField = by.parts; },
      check: (v) => { if ((v.parts || []).length > v.seats) return { parts: 'عدد المشاركين أكبر من المقاعد المتاحة (' + v.seats + ').' }; if (!(v.parts || []).length) return { parts: 'اختر مشاركًا واحدًا على الأقل.' }; return null; },
      onSubmit: (v) => { const id = seqId('trainingSessions', 'TS', 3, Y()); st.insert('trainingSessions', { id, courseId: v.course, startsAt: v.date, location: v.loc, trainer: v.trainer, seats: v.seats, estCost: v.cost == null ? 0 : v.cost, actualCost: null, status: 'published', participants: v.parts.map((e) => ({ employeeId: e, present: null, result: null })) }); aud('HR.TRN.SESSION_SCHEDULED', 'training_session', id, courseName(v.course), { after: { تاريخ: v.date, مشاركون: v.parts.length } }); notify('جلسة تدريب جديدة', 'دعوة لجلسة تدريب بتاريخ ' + fd(v.date) + ' (N-53).', 'action', ['R-14', 'R-15'], '#/hr/training?tab=sessions'); SA.toast('نُشرت الجلسة وأُرسلت الدعوات', 'success'); } });
  }
  function closeSession(sid) {
    const s = find('trainingSessions', sid); const c = find('courses', s.courseId);
    return formModal({ title: 'إغلاق الجلسة وإصدار الشهادات', subtitle: courseName(s.courseId), icon: 'checkcircle', size: 'sm', submitLabel: 'إغلاق الجلسة',
      intro: SA.alert('info', 'الناجحون: تتحدّث مصفوفة المهارات وسجل الشهادات. الراسب يظل غير مؤهل ويُقترح إعادة.'), fields: [{ name: 'cost', label: 'التكلفة الفعلية (ج.م)', type: 'number', min: 0, value: s.estCost }],
      check: () => (s.participants.some((p) => p.present == null) ? 'سجّل الحضور والنتيجة لكل المشاركين أولًا.' : null),
      onSubmit: (v) => { const passed = s.participants.filter((p) => p.present && p.result === 'passed');
        st.update('empSkills', (l) => passed.forEach((p) => { if (!c || !c.skillId) return; let r = l.find((x) => x.employeeId === p.employeeId && x.skillId === c.skillId); if (!r) { r = { id: seqId('empSkills', 'ES', 3), employeeId: p.employeeId, skillId: c.skillId }; l.push(r); } const sk = find('skillDefs', c.skillId); Object.assign(r, { level: Math.max(r.level || 0, 3), issuedAt: T(), expiresAt: (c.validityMonths || (sk && sk.validityMonths)) ? D(Math.round((c.validityMonths || sk.validityMonths) * 30.44)) : null, certifiedBy: 'جلسة ' + sid, proof: 'attendance-' + sid + '.pdf (ورقة موقّعة — تجريبي)', revoked: false, alertedLevel: null, expiredLogged: false }); }));
        st.update('trainingNeeds', (l) => l.forEach((n) => { if (n.sessionId === sid && passed.some((p) => p.employeeId === n.employeeId)) n.status = 'closed'; }));
        st.patch('trainingSessions', sid, { status: 'closed', actualCost: v.cost == null ? s.estCost : v.cost });
        aud('HR.TRN.SESSION_CLOSED', 'training_session', sid, courseName(s.courseId), { after: { ناجحون: passed.length, راسبون: s.participants.filter((p) => p.result === 'failed').length, تكلفة: v.cost } }); SA.toast('أُغلقت الجلسة وصدرت ' + passed.length + ' شهادة', 'success'); } });
  }
  function openSession(sid) {
    liveDrawer({ title: 'جلسة تدريب', paths: ['trainingSessions', 'empSkills'], build() {
      const s = find('trainingSessions', sid); if (!s) return false; const c = find('courses', s.courseId); const edit = s.status !== 'closed' && s.status !== 'cancelled' && SA.can('hr.training.edit'); const ctl = {};
      const rows = s.participants.map((p) => { const pr = h('input', { type: 'checkbox', checked: !!p.present, disabled: !edit, 'aria-label': 'حضور ' + en(p.employeeId) }); const rs = h('select.select', { disabled: !edit, 'aria-label': 'نتيجة ' + en(p.employeeId), style: { minWidth: '120px' } }, [['', 'النتيجة…'], ['passed', 'ناجح'], ['failed', 'راسب'], ['absent', 'غائب']].map((o) => h('option', { value: o[0], selected: (p.result || '') === o[0] }, o[1]))); ctl[p.employeeId] = { pr, rs }; return h('tr', {}, h('td', {}, empCell(emp(p.employeeId))), h('td', {}, edit ? h('label.perm-cb', {}, pr, h('span')) : (p.present ? SA.chip('حضر', 'success') : '—')), h('td', {}, edit ? rs : (p.result ? stChip({ passed: ['ناجح', 'success'], failed: ['راسب', 'danger'], absent: ['غائب', 'neutral'] }, p.result) : '—'))); });
      const save = async () => { let bad = null; const next = s.participants.map((p) => { const present = ctl[p.employeeId].pr.checked; const result = ctl[p.employeeId].rs.value || null; if (result === 'passed' && !present) bad = en(p.employeeId); return Object.assign({}, p, { present, result: present ? result : (result === 'absent' ? 'absent' : null) }); }); if (bad) { SA.toast('لا يمكن تسجيل نتيجة «ناجح» لغير الحاضر: ' + bad, 'error'); return; } if (await run(() => { st.patch('trainingSessions', sid, { participants: next, status: s.status === 'published' ? 'held' : s.status }); aud('HR.TRN.ATTENDANCE_RECORDED', 'training_session', sid, courseName(s.courseId), { after: { حاضرون: next.filter((p) => p.present).length, ناجحون: next.filter((p) => p.result === 'passed').length } }); })) SA.toast('تم تسجيل الحضور والنتائج', 'success'); };
      return { title: courseName(s.courseId), subtitle: s.id, body: h('div.sap-drawer-inner', {}, h('div.sap-hp-row.is-between', {}, stChip(SESS_ST, s.status), c && c.safetyCritical ? SA.chip('حرجة للسلامة', 'danger') : null), SA.kv([['التاريخ', fd(s.startsAt)], ['المكان', s.location], ['المدرب', s.trainer], ['المقاعد', s.participants.length + ' / ' + s.seats], ['التكلفة المقدّرة', trnCost(s.estCost)], ['التكلفة الفعلية', s.actualCost == null ? '—' : trnCost(s.actualCost)]]),
        sec('الحضور والنتائج', h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'المشارك'), h('th', {}, 'حضر'), h('th', {}, 'النتيجة'))), h('tbody', {}, rows)))), h('p.sap-hp-note', {}, 'الحضور بالنيابة موسوم on_behalf مع سبب. الحد الأدنى للحضور لاعتبار الاجتياز {Open}%. ' + (c && c.skillId ? 'الناجحون يتحدّثون في المصفوفة عند الإغلاق.' : ''))),
        foot: edit ? [hbtn('حفظ الحضور', save), btn({ label: 'إغلاق الجلسة وإصدار الشهادات', icon: 'check', kind: 'primary', perm: 'hr.training.edit', onClick: () => closeSession(sid) })] : [] };
    } });
  }
  function tabSessions(view) {
    return SA.live(view, () => {
      const t = tcard({ caption: 'جلسات التدريب', rows: () => L('trainingSessions'), search: { placeholder: 'ابحث باسم الدورة…', keys: [(s) => courseName(s.courseId), 'id'] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(SESS_ST).map((k) => [k, SESS_ST[k][0]]) }], onRowClick: (s) => openSession(s.id),
        columns: [{ key: 'c', label: 'الدورة', sort: true, value: (s) => courseName(s.courseId), render: (s) => h('div', {}, h('b', {}, courseName(s.courseId)), h('div.sap-hp-note', {}, s.id + ' · ' + s.location)) }, { key: 'd', label: 'التاريخ', sort: true, value: (s) => s.startsAt, render: (s) => fd(s.startsAt) }, { key: 'p', label: 'المشاركون', render: (s) => h('span.num', {}, s.participants.length + ' / ' + s.seats) }, { key: 'cost', label: 'التكلفة', render: (s) => trnCost(s.actualCost == null ? s.estCost : s.actualCost) }, { key: 'st', label: 'الحالة', render: (s) => stChip(SESS_ST, s.status) }],
        rowActions: (s) => [{ label: 'فتح الحضور والنتائج', icon: 'checkcircle', onClick: () => openSession(s.id) }, s.status === 'published' || s.status === 'held' ? { label: 'إلغاء الجلسة', icon: 'xcircle', danger: true, disabled: SA.can('hr.training.edit') ? '' : NOPERM('hr.training.edit'), onClick: () => confirmAct({ title: 'إلغاء الجلسة ' + s.id, danger: true, reasonRequired: true, confirmLabel: 'إلغاء الجلسة', impact: ['يُبلَّغ المشاركون ومشرفوهم بتغيير الموعد (N-53).'], run: (r) => { st.patch('trainingSessions', s.id, { status: 'cancelled' }); aud('HR.TRN.SESSION_SCHEDULED', 'training_session', s.id, courseName(s.courseId), { after: { حالة: 'ملغاة' }, reason: r.reason }); }, success: 'أُلغيت الجلسة' }) } : null],
        empty: { icon: 'star', title: 'لا توجد جلسات', text: 'جدول جلسة لدورة من الكتالوج.', action: { label: 'جلسة جديدة', perm: 'hr.training.edit', onClick: scheduleSession } } });
      return h('div.sap-hp-view', {}, kpiRow([['جلسات قادمة', N(L('trainingSessions').filter((s) => s.status === 'published' || s.status === 'held').length)], ['ساعات التدريب (مغلقة)', N(L('trainingSessions').filter((s) => s.status === 'closed').reduce((a, s) => a + (find('courses', s.courseId) || { hours: 0 }).hours * s.participants.filter((p) => p.present).length, 0)), { sub: 'ساعة × حاضر' }], ['التكلفة الفعلية', SA.can('hr.salary.view') ? N(SA.fmt.money(L('trainingSessions').reduce((a, s) => a + (s.actualCost || 0), 0))) : secret('سري T3')]]), t.el, h('p.sap-hp-note', {}, 'تكلفة التدريب T3 وتغذي تقرير إثبات صندوق التدريب (مادة 21 Pending). ', specLink('m-trn-03')));
    }, ['trainingSessions']);
  }

  /* ── كتالوج الدورات ── */
  function editCourse(id) {
    const c = id ? find('courses', id) : null;
    return formModal({ title: c ? 'تعديل الدورة: ' + c.name : 'دورة جديدة', icon: 'star', size: 'md', submitLabel: 'حفظ الدورة',
      fields: [{ name: 'id', label: 'الكود', required: true, value: c ? c.id : '', disabled: !!c, placeholder: 'C-XXX-01', hint: 'كود فريد.' }, { name: 'name', label: 'اسم الدورة', required: true, value: c ? c.name : '' }, { name: 'cat', label: 'الفئة', type: 'select', required: true, value: c ? c.category : '', options: [['', 'اختر…'], ['سلامة', 'سلامة'], ['تشغيل ماكينة', 'تشغيل ماكينة'], ['جودة', 'جودة'], ['مهارات مهنية', 'مهارات مهنية']] }, { name: 'hours', label: 'المدة بالساعات', type: 'number', required: true, min: 1, value: c ? c.hours : '' }, { name: 'prov', label: 'مصدر التنفيذ', type: 'select', value: c ? c.provider : 'internal', options: [['internal', 'داخلي (مدرب مستوى 4)'], ['external', 'جهة خارجية']] },
        { name: 'cert', label: 'تُصدر شهادة', type: 'switch', value: c ? c.issuesCert : true }, { name: 'val', label: 'صلاحية الشهادة بالأشهر', type: 'number', min: 1, value: c ? c.validityMonths : '', hint: 'مدة الصلاحية {Open} — اتركها فارغة لـ«غير مُعدّ».' }, { name: 'skill', label: 'ربط بمهارة في المصفوفة (اختياري)', type: 'select', value: c ? c.skillId || '' : '', options: [['', 'بدون ربط']].concat(L('skillDefs').map((s) => [s.id, s.name])) }, { name: 'crit', label: 'حرجة للسلامة (تفعّل الحظر الصارم)', type: 'switch', value: c ? c.safetyCritical : false }, { name: 'claw', label: 'تتطلب اتفاقية استرداد (مادة 95)', type: 'switch', value: c ? c.needsClawback : false }, { name: 'cost', label: 'التكلفة المرجعية (ج.م)', type: 'number', min: 0, value: c ? c.cost : '' }],
      check: (v) => { if (!c && L('courses').some((x) => x.id.toLowerCase() === String(v.id).trim().toLowerCase())) return { id: 'الكود مستخدم من قبل — اختر كودًا فريدًا.' }; return null; },
      onSubmit: (v) => { const rec = { name: v.name.trim(), category: v.cat, hours: v.hours, provider: v.prov, issuesCert: !!v.cert, validityMonths: v.val || null, skillId: v.skill || null, safetyCritical: !!v.crit, needsClawback: !!v.claw, cost: v.cost == null ? 0 : v.cost }; if (c) st.patch('courses', c.id, rec); else st.insert('courses', Object.assign({ id: v.id.trim(), active: true }, rec)); aud('HR.TRN.COURSE_SAVED', 'course', c ? c.id : v.id, rec.name, { after: { فئة: rec.category, ساعات: rec.hours } }); SA.toast('تم حفظ الدورة', 'success'); } });
  }
  function toggleCourse(c) {
    if (c.active && c.safetyCritical && (L('trainingSessions').some((s) => s.courseId === c.id && s.status !== 'closed' && s.status !== 'cancelled') || L('jobRequired').some((j) => j.refId === c.id))) { SA.toast('دورة سلامة إلزامية مرتبطة بجلسات/وظائف — لا يمكن تعطيلها (UC-TRN-01).', 'error', { ms: 6000 }); return; }
    return confirmAct({ title: (c.active ? 'تعطيل' : 'تفعيل') + ' الدورة «' + c.name + '»', confirmLabel: c.active ? 'تعطيل' : 'تفعيل', impact: [c.active ? 'لن تظهر عند جدولة الجلسات.' : 'تعود متاحة للجدولة.'], run: () => { st.patch('courses', c.id, { active: !c.active }); aud('HR.TRN.COURSE_SAVED', 'course', c.id, c.name, { after: { نشطة: !c.active } }); }, success: 'تم التحديث' });
  }
  function tabCourses(view) {
    return SA.live(view, () => {
      const t = tcard({ caption: 'كتالوج الدورات', rows: () => L('courses'), search: { placeholder: 'ابحث بالكود أو الاسم…', keys: ['id', 'name'] }, filters: [{ key: 'category', label: 'الفئة', options: ['سلامة', 'تشغيل ماكينة', 'جودة', 'مهارات مهنية'].map((x) => [x, x]) }],
        columns: [{ key: 'name', label: 'الدورة', sort: true, render: (c) => h('div', {}, h('b', {}, c.name), h('div.sap-hp-note', {}, c.id)) }, { key: 'category', label: 'الفئة' }, { key: 'hours', label: 'الساعات', render: (c) => N(c.hours) }, { key: 'v', label: 'صلاحية الشهادة', render: (c) => (c.issuesCert ? (c.validityMonths ? h('span.num', {}, c.validityMonths + ' شهرًا') : openTag('غير مُعدّة')) : 'بدون شهادة') }, { key: 'flags', label: 'سمات', render: (c) => h('span.sap-hp-pills', {}, c.safetyCritical ? SA.chip('حرجة للسلامة', 'danger') : null, c.needsClawback ? SA.chip('استرداد', 'info') : null, c.provider === 'external' ? SA.chip('خارجية', 'neutral') : null) }, { key: 'cost', label: 'التكلفة', render: (c) => trnCost(c.cost) }, { key: 'a', label: 'الحالة', render: (c) => (c.active ? SA.chip('نشطة', 'success') : SA.chip('معطّلة', 'neutral')) }],
        rowActions: (c) => [{ label: 'تعديل', icon: 'edit', disabled: SA.can('hr.training.edit') ? '' : NOPERM('hr.training.edit'), onClick: () => editCourse(c.id) }, { label: c.active ? 'تعطيل' : 'تفعيل', icon: c.active ? 'xcircle' : 'checkcircle', onClick: () => toggleCourse(c) }, { label: 'جدولة جلسة', icon: 'plus', onClick: scheduleSession }],
        empty: { icon: 'star', title: 'الكتالوج فارغ', action: { label: 'دورة جديدة', perm: 'hr.training.edit', onClick: () => editCourse() } } });
      return h('div.sap-hp-view', {}, t.el, h('p.sap-hp-note', {}, 'الفئات: سلامة · تشغيل ماكينة · جودة · مهارات مهنية. صلاحية الشهادة {Open} حتى تحدّدها السلامة والتشغيل. ', specLink('m-trn-01')));
    }, ['courses']);
  }

  /* ── اتفاقيات الاسترداد ── */
  function cbCalc(c) { const el = monthsElapsed(c.startsOn); const rem = c.mode === 'full' ? (el >= c.stayMonths ? 0 : c.cost) : Math.max(0, c.cost * (c.stayMonths - el) / c.stayMonths); return { elapsed: el, remaining: Math.round(rem * 100) / 100 }; }
  function cbStatus(c) { const e = emp(c.employeeId); if (c.status === 'active' && e && (e.status === 'notice' || e.status === 'terminated') && cbCalc(c).elapsed < c.stayMonths) return 'due'; if (c.status === 'active' && cbCalc(c).elapsed >= c.stayMonths) return 'fulfilled'; return c.status; }
  function newClawback() {
    const eligible = L('courses').filter((c) => c.needsClawback);
    return formModal({ title: 'اتفاقية استرداد تكلفة تدريب', subtitle: 'مادة 95 [Law · Pending]: تسري فقط إن كانت مكتوبة وموقّعة قبل بدء التدريب.', icon: 'doc', size: 'md', submitLabel: 'إنشاء الاتفاقية',
      fields: [{ name: 'emp', label: 'الموظف', type: 'select', required: true, options: empOpts((e) => OPS.indexOf(e.id) >= 0) }, { name: 'course', label: 'الدورة (تتطلب اتفاقية)', type: 'select', required: true, options: [['', 'اختر…']].concat(eligible.map((c) => [c.id, c.name])) }, { name: 'cost', label: 'التكلفة (ج.م)', type: 'number', required: true, min: 1 }, { name: 'stay', label: 'مدة البقاء (شهر)', type: 'number', required: true, min: 1, value: 24 }, { name: 'mode', label: 'طريقة الاسترداد', type: 'select', value: 'pro_rata', options: [['full', 'كاملة'], ['pro_rata', 'تناسبية'], ['schedule', 'جدول متناقص {Open}']] }, { name: 'tstart', label: 'بداية التدريب', type: 'date', required: true, value: D(7) }, { name: 'signed', label: 'تاريخ توقيع الموظف على الاتفاقية', type: 'date', hint: 'اتركه فارغًا إن لم تُوقَّع بعد (تبقى مسودة).' }],
      check: (v) => (v.signed && v.signed >= v.tstart ? { signed: 'الاتفاقية لازم تتوقّع قبل بداية التدريب عشان تسري.' } : null),
      onSubmit: (v) => { const id = seqId('clawbacks', 'CB', 3, Y()); st.insert('clawbacks', { id, employeeId: v.emp, courseId: v.course, cost: v.cost, stayMonths: v.stay, mode: v.mode, signedAt: v.signed || null, signedFile: v.signed ? 'signed-' + id + '.pdf (تجريبي)' : null, startsOn: v.signed ? v.tstart : null, status: v.signed ? 'active' : 'draft', trainingStart: v.tstart }); aud(v.signed ? 'HR.TRN.CLAWBACK_SIGNED' : 'HR.TRN.CLAWBACK_STATUS_CHANGED', 'clawback', id, en(v.emp) + ' — ' + courseName(v.course), { after: { تكلفة: '•••', مدة: v.stay, حالة: v.signed ? 'سارية' : 'مسودة' } }); SA.toast('أُنشئت الاتفاقية' + (v.signed ? ' وهي سارية' : ' كمسودة'), 'success'); } });
  }
  function activateClawback(c) {
    return formModal({ title: 'تفعيل الاتفاقية ' + c.id, subtitle: 'ارفع النسخة الموقّعة من الموظف. لا تُفعَّل قبل التوقيع.', icon: 'doc', size: 'sm', submitLabel: 'تفعيل',
      fields: [{ name: 'signed', label: 'تاريخ التوقيع', type: 'date', required: true, value: D(-1) }, { name: 'file', label: 'النسخة الموقّعة (محاكاة رفع)', required: true, placeholder: 'اتفاقية-موقعة.pdf' }],
      check: (v) => (v.signed >= (c.trainingStart || T()) ? { signed: 'الاتفاقية لازم تتوقّع قبل بداية التدريب عشان تسري.' } : null),
      onSubmit: (v) => { st.patch('clawbacks', c.id, { signedAt: v.signed, signedFile: v.file, startsOn: c.trainingStart, status: 'active' }); aud('HR.TRN.CLAWBACK_SIGNED', 'clawback', c.id, en(c.employeeId), { after: { حالة: 'سارية' } }); SA.toast('الاتفاقية سارية', 'success'); } });
  }
  function proposeInSettlement(c) {
    const calc = cbCalc(c);
    return confirmAct({ title: 'اقتراح بند استرداد في المخالصة', confirmLabel: 'اقتراح البند', impact: ['يظهر بندًا مقترحًا في المخالصة النهائية (HR-25) ولا يُخصم تلقائيًا.', 'سقف خصمه من الأجر أو المخالصة {Open — غير متحقق}.', 'يعتمده HR Manager قبل أن يدخل المخالصة.'], extra: h('p', {}, 'المتبقي: ', money(calc.remaining)),
      run: () => { st.patch('clawbacks', c.id, { status: 'due', proposedAmount: calc.remaining }); const fs = L('settlements').find((x) => x.employeeId === c.employeeId); if (fs) st.patch('settlements', fs.id, { clawbackProposal: { agreementId: c.id, amount: calc.remaining, status: 'proposed' } }); aud('HR.TRN.CLAWBACK_STATUS_CHANGED', 'clawback', c.id, en(c.employeeId), { before: { حالة: 'سارية' }, after: { حالة: 'مستحقة', مقترح_في_المخالصة: !!fs } }); notify('اتفاقية استرداد مستحقة', 'موظف مغادر عليه التزام تدريبي — راجع بند المخالصة (N-54).', 'action', ['R-11'], '#/hr/training?tab=clawback'); }, success: 'أُضيف البند المقترح' });
  }
  function tabClawback(view) {
    return SA.live(view, () => {
      const t = tcard({ caption: 'اتفاقيات استرداد التكلفة', rows: () => L('clawbacks'), onRowClick: null,
        columns: [{ key: 'e', label: 'الموظف', render: (c) => empCell(emp(c.employeeId)) }, { key: 'c', label: 'الدورة', render: (c) => courseName(c.courseId) }, { key: 'cost', label: 'التكلفة', render: (c) => money(c.cost) }, { key: 'm', label: 'البقاء', render: (c) => h('span.num', {}, cbCalc(c).elapsed + ' / ' + c.stayMonths + ' شهر') }, { key: 'rem', label: 'المتبقي للاسترداد', render: (c) => (c.status === 'draft' ? '—' : money(cbCalc(c).remaining)) }, { key: 'st', label: 'الحالة', render: (c) => stChip(CB_ST, cbStatus(c)) }],
        rowActions: (c) => [c.status === 'draft' ? { label: 'تفعيل بعد رفع النسخة الموقّعة', icon: 'check', disabled: SA.can('hr.training.edit') ? '' : NOPERM('hr.training.edit'), onClick: () => activateClawback(c) } : null, cbStatus(c) === 'due' && c.status === 'active' ? { label: 'اقتراح بند في المخالصة', icon: 'swap', disabled: SA.can('hr.training.edit') ? '' : NOPERM('hr.training.edit'), onClick: () => proposeInSettlement(c) } : null],
        empty: { icon: 'doc', title: 'لا اتفاقيات استرداد', action: { label: 'اتفاقية جديدة', perm: 'hr.training.edit', onClick: newClawback } } });
      const cost = SA.form.field({ name: 'c', label: 'التكلفة (ج.م)', type: 'number', value: 6000, min: 0 }); const stay = SA.form.field({ name: 's', label: 'مدة البقاء (شهر)', type: 'number', value: 24, min: 1 }); const el = SA.form.field({ name: 'e', label: 'المنقضي (شهر)', type: 'number', value: 9, min: 0 }); const res = h('div.sap-hp-big', {}, '—'); const form = h('div.sap-hp-note', {});
      const upd = () => { const c = +cost.get() || 0, s = +stay.get() || 0, e = +el.get() || 0; if (!s) { res.textContent = '—'; return; } const r = Math.max(0, c * (s - e) / s); res.textContent = SA.fmt.money(Math.round(r * 100) / 100); form.textContent = c + ' × (' + s + ' − ' + e + ') ÷ ' + s + ' = ' + (Math.round(r * 100) / 100); };
      [cost, stay, el].forEach((f) => f.input.addEventListener('input', upd)); upd();
      return h('div.sap-hp-view', {}, SA.alert('warning', 'اتفاقية الاسترداد (مادة 95 ', lawTag(''), ') لا تسري إلا مكتوبة وموقّعة قبل التدريب. طريقة الاحتساب وسقف الخصم من الأجر {Open — غير متحقق}.'), t.el,
        SA.card({ title: 'حاسبة الاسترداد التناسبي (تجريبية)' }, h('div.sap-hp-cols', {}, cost.el, stay.el, el.el), h('div.sap-hp-row.is-between', {}, h('div', {}, h('div.sap-hp-note', {}, 'المتبقي للاسترداد'), res), h('div.sap-hp-formula', {}, 'remaining = cost × (stay − elapsed) ÷ stay')), form, h('p.sap-hp-note', {}, 'مثال DEMO من المواصفة: 6,000 × (24 − 9) ÷ 24 = 3,750 ج.م.')), h('div.sap-hp-row', {}, btn({ label: 'اتفاقية جديدة', icon: 'plus', kind: 'ghost', perm: 'hr.training.edit', onClick: newClawback }), specLink('m-trn-08')));
    }, ['clawbacks', 'employees']);
  }

  /* ── احتياجات التدريب ── */
  function genNeeds() {
    return confirmAct({ title: 'توليد احتياجات من فجوات المصفوفة', confirmLabel: 'توليد الاحتياجات', impact: ['يفحص المهارات الإلزامية للوظائف والشهادات المنتهية ويضيف احتياجات Proposed للناقص.', 'لا تكرار لنفس الشخص والدورة.'],
      run: () => { let n = 0; emps().filter((e) => OPS.indexOf(e.id) >= 0).forEach((e) => { const req = L('jobRequired').filter((j) => j.positionId === e.positionId && j.kind === 'skill').map((j) => j.refId); const gaps = L('skillDefs').filter((s) => req.indexOf(s.id) >= 0 || (skillRow(e.id, s.id) && skillStatus(skillRow(e.id, s.id)).k === 'expired')).filter((s) => ['ok', 'soon', 'urgent', 'train'].indexOf(skillStatus(skillRow(e.id, s.id)).k) < 0); gaps.forEach((s) => { const crs = L('courses').find((c) => c.skillId === s.id); if (L('trainingNeeds').some((x) => x.employeeId === e.id && x.courseId === (crs && crs.id) && ['closed', 'rejected'].indexOf(x.status) < 0)) return; st.insert('trainingNeeds', { id: seqId('trainingNeeds', 'TN', 4, Y()), employeeId: e.id, need: 'فجوة: ' + s.name, courseId: crs ? crs.id : null, source: 'gap', sourceRef: 'مصفوفة المهارات', priority: s.critical ? 'high' : 'normal', status: 'proposed', sessionId: null, createdAt: new Date().toISOString() }); n++; }); }); aud('HR.TRN.NEED_CREATED', 'training_need', 'batch', 'توليد احتياجات من الفجوات', { after: { جديدة: n } }); SA.toast(n ? 'وُلِّدت ' + n + ' احتياجات جديدة' : 'لا فجوات جديدة', n ? 'success' : 'info'); } });
  }
  function tabNeeds(view) {
    const SRC = { appraisal: 'تقييم أداء', gap: 'فجوة مصفوفة', capa: 'CAPA حادث', new_machine: 'ماكينة جديدة', supervisor: 'طلب مشرف' };
    return SA.live(view, () => {
      const t = tcard({ caption: 'احتياجات التدريب', rows: () => L('trainingNeeds'), selectable: true, search: { placeholder: 'ابحث…', keys: ['need', (n) => en(n.employeeId)] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(NEED_ST).map((k) => [k, NEED_ST[k][0]]) }, { key: 'source', label: 'المصدر', options: Object.keys(SRC).map((k) => [k, SRC[k]]) }],
        bulk: [{ label: 'قبول المحدد', icon: 'check', perm: 'hr.training.edit', run: (rows, ap) => run(() => { rows.filter((r) => r.status === 'proposed').forEach((r) => st.patch('trainingNeeds', r.id, { status: 'accepted' })); }).then(() => { ap.clearSelection(); SA.toast('تم قبول الاحتياجات المقترحة', 'success'); }) }],
        columns: [{ key: 'e', label: 'الموظف', render: (n) => (n.employeeId ? empCell(emp(n.employeeId)) : 'مجموعة') }, { key: 'need', label: 'الاحتياج', render: (n) => h('div', {}, h('b', {}, n.need), h('div.sap-hp-note', {}, n.courseId ? courseName(n.courseId) : 'بدون دورة محددة')) }, { key: 'source', label: 'المصدر', render: (n) => h('span', {}, SRC[n.source] || n.source, h('div.sap-hp-note', {}, n.sourceRef)) }, { key: 'p', label: 'الأولوية', render: (n) => (n.priority === 'high' ? SA.chip('عالية', 'danger') : SA.chip('عادية', 'neutral')) }, { key: 'st', label: 'الحالة', render: (n) => stChip(NEED_ST, n.status) }],
        rowActions: (n) => [n.status === 'proposed' ? { label: 'قبول', icon: 'check', disabled: SA.can('hr.training.edit') ? '' : NOPERM('hr.training.edit'), onClick: () => run(() => st.patch('trainingNeeds', n.id, { status: 'accepted' })).then(() => SA.toast('تم القبول', 'success')) } : null, ['proposed', 'accepted'].indexOf(n.status) >= 0 ? { label: 'ضمّ لجلسة قائمة', icon: 'plus', disabled: SA.can('hr.training.edit') ? '' : NOPERM('hr.training.edit'), onClick: () => joinSession(n) } : null, n.status === 'proposed' ? { label: 'رفض بسبب', icon: 'xcircle', danger: true, onClick: () => confirmAct({ title: 'رفض الاحتياج', danger: true, reasonRequired: true, confirmLabel: 'رفض', run: (r) => st.patch('trainingNeeds', n.id, { status: 'rejected', rejectReason: r.reason }), success: 'تم الرفض' }) } : null],
        empty: { icon: 'clipboard', title: 'لا احتياجات', text: 'تُولَّد من التقييم والفجوات والحوادث وطلبات المشرفين.' } });
      return h('div.sap-hp-view', {}, h('div.sap-hp-row.is-between', {}, h('p.sap-hp-note', {}, 'الاحتياج يدخل Proposed ويُغلق باجتياز الدورة (BR-TRN-12). مصادره: تقييم · فجوة مصفوفة · CAPA · ماكينة جديدة · مشرف.'), btn({ label: 'توليد من فجوات المصفوفة', icon: 'refresh', kind: 'ghost', perm: 'hr.training.edit', onClick: genNeeds })), t.el, specLink('m-trn-09'));
    }, ['trainingNeeds']);
  }
  function joinSession(n) {
    const opts = L('trainingSessions').filter((s) => (s.status === 'published' || s.status === 'held') && (!n.courseId || s.courseId === n.courseId));
    if (!opts.length) { SA.toast('لا جلسة قائمة لنفس الدورة — جدول جلسة جديدة من تبويب «الجلسات».', 'info'); return; }
    return formModal({ title: 'ضمّ الاحتياج لجلسة', icon: 'plus', size: 'sm', submitLabel: 'ضم', fields: [{ name: 's', label: 'الجلسة', type: 'select', required: true, options: [['', 'اختر…']].concat(opts.map((s) => [s.id, courseName(s.courseId) + ' — ' + fd(s.startsAt) + ' (' + s.participants.length + '/' + s.seats + ')'])) }],
      check: (v) => { const s = find('trainingSessions', v.s); return s && s.participants.length >= s.seats ? { s: 'عدد المشاركين أكبر من المقاعد المتاحة (' + s.seats + ').' } : null; },
      onSubmit: (v) => { st.update('trainingSessions', (l) => { const s = l.find((x) => x.id === v.s); if (s && !s.participants.some((p) => p.employeeId === n.employeeId)) s.participants.push({ employeeId: n.employeeId, present: null, result: null }); }); st.patch('trainingNeeds', n.id, { status: 'scheduled', sessionId: v.s }); SA.toast('أُضيف الموظف للجلسة', 'success'); } });
  }

  const trnBadge = () => { const n = expiryRows().filter((r) => r.st.k === 'expired' || r.st.k === 'urgent').length; return n || null; };
  screen({ id: 'hr-training', route: 'hr/training', perm: 'hr.training.view', title: 'التدريب والمهارات', icon: 'star', order: 42, desc: 'كتالوج الدورات وجلساتها، مصفوفة مهارات المشغّلين، تنبيهات انتهاء الشهادات، وحظر إسناد الماكينة لمن شهادته منتهية أو لم يكمل توجيه السلامة.', watch: ['empSkills'], badge: trnBadge, tags: () => [SA.tag('new', 'HR-19')],
    tabs: [
      { id: 'matrix', label: 'مصفوفة المهارات', icon: 'grid', render: tabMatrix, primary: () => btn({ label: 'اعتماد مستوى مهارة', icon: 'check', kind: 'accent', perm: 'hr.training.edit', onClick: () => formModal({ title: 'اختر الموظف والمهارة', icon: 'star', size: 'sm', submitLabel: 'متابعة', fields: [{ name: 'e', label: 'الموظف', type: 'select', required: true, options: empOpts((e) => OPS.indexOf(e.id) >= 0) }, { name: 's', label: 'المهارة', type: 'select', required: true, options: [['', 'اختر…']].concat(L('skillDefs').map((s) => [s.id, s.name])) }], onSubmit: (v) => setTimeout(() => certifyModal(v.e, v.s), 50) }) }) },
      { id: 'expiry', label: 'انتهاء الشهادات', icon: 'clock', render: tabExpiry, badge: () => expiryRows().length || null },
      { id: 'rules', label: 'قاعدة الحظر', icon: 'shield', render: tabRules },
      { id: 'sessions', label: 'الجلسات والحضور', icon: 'users', render: tabSessions, primary: () => btn({ label: 'جلسة جديدة', icon: 'plus', kind: 'accent', perm: 'hr.training.edit', onClick: scheduleSession }) },
      { id: 'courses', label: 'كتالوج الدورات', icon: 'list', render: tabCourses, primary: () => btn({ label: 'دورة جديدة', icon: 'plus', kind: 'accent', perm: 'hr.training.edit', onClick: () => editCourse() }) },
      { id: 'clawback', label: 'استرداد التكلفة', icon: 'coins', render: tabClawback, primary: () => btn({ label: 'اتفاقية جديدة', icon: 'plus', kind: 'accent', perm: 'hr.training.edit', onClick: newClawback }) },
      { id: 'needs', label: 'احتياجات التدريب', icon: 'clipboard', render: tabNeeds, badge: () => L('trainingNeeds').filter((n) => n.status === 'proposed').length || null }
    ] });

  /* ═════════════════════════════ HR-20 · الجزاءات والتظلمات والقضايا (T4) ═════════════════════════════ */
  const VST = { reported: ['مُبلَّغ', 'warning'], open: ['ملف مفتوح', 'info'], hearing: ['إخطار / سماع', 'info'], decided: ['قرار صادر', 'warning'], delivered: ['مُبلَّغ بالقرار', 'success'], closed: ['مُغلق', 'neutral'], noted: ['ملاحظة', 'neutral'], referred: ['مُحال', 'neutral'] };
  const GST = { filed: ['مقدَّم', 'warning'], under_review: ['قيد الدراسة', 'info'], decided: ['صدر القرار', 'success'], closed: ['مُغلق', 'neutral'] };
  const DST = { legal_review: ['مراجعة قانونية', 'warning'], gm_review: ['اعتماد GM', 'warning'], approved: ['معتمد — جاهز للدعوى', 'success'], returned: ['أُعيد لرئيس القسم', 'neutral'], blocked: ['محظور (إجازة مرضية)', 'danger'], court: ['مرفوع للمحكمة', 'info'], rejected: ['مرفوض', 'neutral'] };
  const LST = { preparing: ['تحضير ملف الدعوى', 'info'], open: ['مفتوحة', 'info'], hearing_scheduled: ['جلسة مجدولة', 'warning'], judgment: ['حكم', 'success'], appeal: ['استئناف', 'warning'], closed: ['مُغلقة', 'neutral'] };
  const HST = { received: ['مُستلمة', 'warning'], triage: ['فرز أولي', 'info'], investigation: ['تحقيق', 'info'], decision: ['قرار', 'info'], closed: ['مغلقة', 'neutral'], escalated: ['مُحالة لـGM/Legal', 'danger'] };
  const T4 = () => SA.can('hr.discipline.view');
  const vItem = (v) => find('penaltyCatalog', v.catalogId);
  const vTitle = (v) => (v.kind === 'note' ? 'ملاحظة إدارية' : (vItem(v) || {}).name || 'مخالفة');
  const dcfg = (k, d) => cfg('discipline.' + k, d);
  const regOn = () => !!dcfg('regulationActive', false);
  const monthStartStr = () => { const n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth(), 1)); };
  const usedThisMonth = (empId, exceptId) => L('violations').filter((x) => x.employeeId === empId && x.id !== exceptId && x.decision && x.decision.penalty === 'deduction' && !x.decision.annulled && String(x.decision.decidedAt).slice(0, 10) >= monthStartStr()).reduce((a, x) => a + (x.decision.days || 0), 0);
  const isRepeat = (v) => v.catalogId && L('violations').some((x) => x.id !== v.id && x.employeeId === v.employeeId && x.catalogId === v.catalogId && x.decision && dd(String(x.decision.decidedAt).slice(0, 10), T()) <= 365);
  const mgrChain = (empId) => { const out = []; let e = emp(empId); let g = 0; while (e && e.managerEmpId && g++ < 6) { out.push(e.managerEmpId); e = emp(e.managerEmpId); } return out; };
  function investigatorCheck(userId, empId) {
    const u = SA.userById(userId); const ie = emps().find((x) => x.userId === userId); const e = emp(empId); if (!u) return 'اختر محققًا.';
    if (ie && ie.id === empId) return 'المحقق لا يكون هو المخالف.';
    if (ie && e && ((e.relatives || []).indexOf(ie.id) >= 0 || (ie.relatives || []).indexOf(e.id) >= 0)) return 'تضارب مصالح: المحقق قريب للموظف. يُسند لغيره.';
    const legalOrHr = u.roleId === 'R-11' || u.roleId === 'R-01' || u.roleId === 'R-02' || (ie && ie.departmentId === 'D-07');
    if (legalOrHr) return null; if (!ie || !e) return 'المحقق لازم يكون من الشؤون القانونية أو بدرجة مساوية أو أعلى من الموظف.';
    if (mgrChain(empId).indexOf(ie.id) >= 0 || (ie.managerEmpId && ie.managerEmpId === e.managerEmpId)) return null;
    return 'المحقق لازم يكون من الشؤون القانونية أو بدرجة مساوية أو أعلى من الموظف.';
  }
  const investigatorOpts = () => [['', 'اختر المحقق…']].concat((st.get('users') || []).filter((u) => u.status === 'active' && ['R-11', 'R-01', 'R-02', 'R-05', 'R-14'].indexOf(u.roleId) >= 0).map((u) => [u.id, u.name + ' — ' + SA.roleName(u.roleId)]));
  const addLog = (id, text) => st.update('violations', (l) => { const v = l.find((x) => x.id === id); if (v) (v.log = v.log || []).push({ at: new Date().toISOString(), by: SA.session.userId, text }); });
  const needApprove = () => (SA.can('hr.disciplinary.approve') ? '' : NOPERM('hr.disciplinary.approve'));
  const penLbl = (k) => PEN[k] || k;
  const decSummary = (d) => (!d ? '—' : penLbl(d.penalty) + (d.penalty === 'deduction' ? ' · ' + d.days + ' يوم' : ''));
  const t4gate = (render) => { const d = SA.guard('hr.discipline.view', { title: 'هذه البيانات سرية (T4)', text: 'لا تملك صلاحية الاطلاع على الملفات التأديبية. المشرف يرى «قيد الدراسة» فقط للبلاغات التي رفعها.' }); return d || render(); };

  /* ── الإبلاغ ── */
  function reportViolation(pref) {
    const items = L('penaltyCatalog').filter((c) => c.active); const on = regOn();
    return formModal({ title: 'بلاغ مخالفة / ملاحظة', subtitle: 'الملاحظة (توجيه شفهي، لا جزاء) متاحة دائمًا. المخالفة تدخل المسار الرسمي وتتطلب لائحة معتمدة.', icon: 'alert', size: 'md', submitLabel: 'إرسال',
      intro: on ? null : SA.alert('warning', 'لا توجد لائحة تنظيم عمل معتمدة. يمكنك تسجيل ملاحظة فقط. (القرار D10 Open)'),
      fields: [{ name: 'kind', label: 'نوع البلاغ', type: 'radio', required: true, value: on ? 'violation' : 'note', options: [['note', 'ملاحظة', 'توجيه شفهي — لا يفتح مسارًا رسميًا'], ['violation', 'مخالفة', on ? 'تدخل المسار الرسمي (إخطار ← تحقيق ← قرار)' : 'غير متاحة: لا لائحة معتمدة', on ? '' : 'disabled']] },
        { name: 'emp', label: 'الموظف', type: 'select', required: true, value: pref || '', options: empOpts((e) => e.status !== 'terminated') }, { name: 'item', label: 'نوع المخالفة من الكتالوج', type: 'select', options: [['', 'اختر…']].concat(items.map((c) => [c.id, c.name])), hint: 'غير موجودة في الكتالوج؟ اختر «أخرى» ويراجعها HR.' }, { name: 'disc', label: 'تاريخ العلم بالمخالفة', type: 'date', required: true, value: T(), max: T(), hint: 'تبدأ منه مهلة بدء التحقيق (' + dcfg('investigationStartDays', 7) + ' أيام — Pending [Law]).' }, { name: 'desc', label: 'وصف مختصر', type: 'textarea', required: true, rows: 3 }, { name: 'wit', label: 'شهود (اختياري)' }],
      check: (v) => { if (v.kind === 'violation' && !v.item) return { item: 'اختر نوع المخالفة من الكتالوج (أو «أخرى»).' }; if (String(v.desc).trim().length < 10) return { desc: 'اكتب وصفًا واضحًا (10 حروف على الأقل).' }; if (v.disc > T()) return { disc: 'تاريخ العلم لا يكون في المستقبل.' }; return null; },
      onSubmit: (v) => { const id = seqId('violations', 'VIO', 4, Y()); const isNote = v.kind === 'note'; st.insert('violations', { id, kind: v.kind, employeeId: v.emp, catalogId: isNote ? null : v.item, description: v.desc.trim() + (v.wit ? ' — شهود: ' + v.wit : ''), reportedBy: SA.session.userId, discoveredAt: v.disc, reportedAt: new Date().toISOString(), status: isNote ? 'noted' : 'reported', investigatorId: null, minutes: null, decision: null, log: [{ at: new Date().toISOString(), by: SA.session.userId, text: isNote ? 'ملاحظة مسجّلة' : 'بلاغ مخالفة' }] });
        if (isNote) aud('HR.DSC.NOTE_LOGGED', 'violation', id, 'ملاحظة — ' + en(v.emp), { after: { نوع: 'ملاحظة' } }); else { aud('HR.DSC.REPORT_SUBMITTED', 'violation', id, 'بلاغ — ' + en(v.emp), { after: { علم: v.disc } }); notify('بلاغ جديد', 'يوجد بلاغ جديد يتطلب بدء التحقيق خلال ' + dcfg('investigationStartDays', 7) + ' أيام من العلم (N-30).', 'action', ['R-11'], '#/hr/disciplinary'); }
        SA.toast(isNote ? 'سُجّلت الملاحظة' : 'أُرسل البلاغ — الحالة «مُبلَّغ»', 'success'); } });
  }
  /* ── الفرز وفتح الملف ── */
  function triage(v) {
    return formModal({ title: 'فرز البلاغ — ' + v.id, subtitle: en(v.employeeId) + ' · ' + vTitle(v), icon: 'check', size: 'md', submitLabel: 'تنفيذ',
      fields: [{ name: 'act', label: 'القرار', type: 'radio', required: true, value: 'open', options: [['open', 'فتح ملف تأديبي', 'تعيين محقق وبدء العدّاد'], ['note', 'حفظ كملاحظة', 'لا مسار رسمي'], ['refer', 'إحالة لمسار آخر', 'غياب ← HR-23 · حادث ← HR-21']] }, { name: 'inv', label: 'المحقق (للفتح)', type: 'select', options: investigatorOpts(), hint: 'من الشؤون القانونية أو بدرجة مساوية/أعلى من المخالف.' }, { name: 'ref', label: 'جهة الإحالة', type: 'select', options: [['', '—'], ['absence', 'الغياب/الترك — الاستقالات والإنهاء (HR-23)'], ['incident', 'حادث سلامة — السلامة (HR-21)']] }],
      check: (v2) => { if (v2.act === 'open') { if (!v2.inv) return { inv: 'اختر المحقق.' }; const e = investigatorCheck(v2.inv, v.employeeId); return e ? { inv: e } : null; } if (v2.act === 'refer' && !v2.ref) return { ref: 'اختر جهة الإحالة.' }; return null; },
      onSubmit: (v2) => { if (v2.act === 'open') { st.patch('violations', v.id, { status: 'open', investigatorId: v2.inv, openedAt: new Date().toISOString() }); addLog(v.id, 'فتح الملف وتعيين المحقق: ' + uname(v2.inv)); aud('HR.DSC.CASE_OPENED', 'violation', v.id, en(v.employeeId), { after: { محقق: uname(v2.inv) } }); } else if (v2.act === 'note') { st.patch('violations', v.id, { status: 'noted', kind: 'note' }); addLog(v.id, 'حُفظ كملاحظة'); aud('HR.DSC.NOTE_LOGGED', 'violation', v.id, en(v.employeeId), { after: { نوع: 'ملاحظة' } }); } else { st.patch('violations', v.id, { status: 'referred', referral: v2.ref }); addLog(v.id, 'إحالة: ' + (v2.ref === 'absence' ? 'HR-23' : 'HR-21')); aud('HR.DSC.CASE_OPENED', 'violation', v.id, en(v.employeeId), { after: { إحالة: v2.ref }, severity: 'medium' }); } SA.toast('تم الفرز', 'success'); } });
  }
  function notifyEmployee(v) {
    return formModal({ title: 'إخطار الموظف وتحديد موعد السماع', subtitle: 'DOC-HR-29 — إخطار بمخالفة / استدعاء للتحقيق (مكتوب).', icon: 'doc', size: 'md', submitLabel: 'تسجيل الإخطار',
      fields: [{ name: 'method', label: 'طريقة التسليم', type: 'radio', required: true, value: 'hand', options: [['hand', 'تسليم باليد وتوقيع بالاستلام'], ['registered', 'خطاب مسجّل'], ['witnessed_refusal', 'امتناع عن الاستلام', 'يلزم شاهدان']] }, { name: 'w1', label: 'الشاهد الأول (عند الامتناع)' }, { name: 'w2', label: 'الشاهد الثاني (عند الامتناع)' }, { name: 'hearing', label: 'موعد جلسة السماع', type: 'date', required: true, value: D(3), min: T() }],
      check: (v2) => (v2.method === 'witnessed_refusal' && (!String(v2.w1 || '').trim() || !String(v2.w2 || '').trim()) ? 'إثبات الامتناع يحتاج شاهدين.' : null),
      onSubmit: (v2) => { st.patch('violations', v.id, { status: 'hearing', notifiedAt: T(), notifyMethod: v2.method, witnesses: [v2.w1, v2.w2].filter(Boolean), hearingAt: v2.hearing }); addLog(v.id, 'إخطار الموظف (' + ({ hand: 'باليد', registered: 'خطاب مسجّل', witnessed_refusal: 'امتناع بشاهدين' })[v2.method] + ') وتحديد السماع'); aud('HR.DSC.EMPLOYEE_NOTIFIED', 'violation', v.id, en(v.employeeId), { after: { طريقة: v2.method } }); aud('HR.DSC.HEARING_SCHEDULED', 'violation', v.id, en(v.employeeId), { after: { موعد: v2.hearing } }); notify('لديك إشعار جديد', 'افتح التطبيق للاطلاع على إشعار جديد (N-31).', 'action', [], '#/hr/ess', (SA.store.get('employees') || []).filter((e) => e.id === v.employeeId && e.userId).map((e) => e.userId)); SA.toast('سُجّل الإخطار وحُدّد موعد السماع', 'success'); } });
  }
  function saveMinutes(v) {
    return formModal({ title: 'محضر التحقيق وجلسة السماع', subtitle: 'DOC-HR-30 — أقوال الأطراف ودفاع الموظف والتوصية. يُحفظ في ملف الموظف T4.', icon: 'note', size: 'lg', submitLabel: 'حفظ المحضر',
      fields: [{ name: 'held', label: 'تاريخ الجلسة', type: 'date', required: true, value: v.hearingAt || T() }, { name: 'att', label: 'الحاضرون', required: true, placeholder: 'المحقق · الموظف · شاهد · ممثل النقابة إن وُجد' }, { name: 'stm', label: 'أقوال الأطراف والشهود', type: 'textarea', required: true, rows: 3 }, { name: 'def', label: 'دفاع الموظف', type: 'textarea', required: true, rows: 2 }, { name: 'rec', label: 'توصية المحقق', required: true, placeholder: 'مثال: إنذار كتابي' }, { name: 'oral', label: 'تحقيق شفهي (استثناء: إنذار أو خصم ≤ 1 يوم)', type: 'switch' }],
      onSubmit: (v2) => { st.patch('violations', v.id, { minutes: { heldAt: v2.held, attendees: v2.att, statements: v2.stm, defence: v2.def, recommendation: v2.rec, oralException: !!v2.oral, savedAt: new Date().toISOString(), savedBy: SA.session.userId } }); addLog(v.id, 'حفظ محضر التحقيق' + (v2.oral ? ' (استثناء شفهي)' : '')); aud('HR.DSC.MINUTES_SAVED', 'violation', v.id, en(v.employeeId), { after: { جلسة: v2.held, شفهي: !!v2.oral } }); SA.toast('حُفظ المحضر', 'success'); } });
  }
  /* ── قرار الجزاء + فحص السقف ── */
  function decideModal(v) {
    const item = vItem(v) || { allowed: ['warning', 'deduction'], deductionDays: 1, managerCanDecide: false, name: 'أخرى' }; const capV = dcfg('capPerViolationDays', null); const capM = dcfg('capPerMonthDays', null);
    const used = usedThisMonth(v.employeeId, v.id); const remain = capM == null ? null : Math.max(0, capM - used);
    const panel = h('div.sap-hp-res.is-ok', { role: 'status', 'aria-live': 'polite' }); const daysWrap = { el: null };
    function recalc(vals) { const dys = +vals.days || 0; const isDed = vals.penalty === 'deduction'; SA.clear(panel); let bad = false; const lines = [];
      if (capV == null || capM == null) { bad = true; lines.push('السقوف القانونية غير مُعدّة (Open) — لا يمكن حفظ خصم.'); }
      if (isDed) { lines.push('المستخدم هذا الشهر: ' + used + ' من ' + (capM == null ? 'غير مُعدّ' : capM) + ' يوم · المتبقي: ' + (remain == null ? '—' : remain) + ' يوم · سقف المخالفة: ' + (capV == null ? 'غير مُعدّ' : capV) + ' يوم' + (item.deductionDays ? ' · سقف هذه المخالفة في الكتالوج: ' + item.deductionDays : '')); if ((capV != null && dys > capV) || (remain != null && dys > remain) || (item.deductionDays && dys > item.deductionDays)) { bad = true; lines.push('ما ينفعش الخصم يزيد عن ' + (capV == null ? '{Open}' : capV) + ' أيام للمخالفة، أو عن المتبقي هذا الشهر (' + (remain == null ? '—' : remain) + ' يوم).'); } else if (dys) lines.push('بعد القرار: ' + (used + dys) + ' / ' + capM + ' يوم هذا الشهر.'); } else lines.push('لا خصم في هذا الجزاء — الفحص المالي لا ينطبق.');
      panel.className = 'sap-hp-res ' + (bad ? 'is-bad' : 'is-ok'); panel.append(h('b', {}, bad ? 'الحفظ مرفوض — تجاوز السقف' : 'فحص سقف الخصم: مقبول'), h('ul', {}, lines.map((x) => h('li', {}, x)))); return !bad; }
    const penF = SA.form.field({ name: 'penalty', label: 'الجزاء (جزاء واحد فقط للمخالفة)', type: 'select', required: true, options: [['', 'اختر من القائمة المسموحة…']].concat(item.allowed.map((k) => [k, penLbl(k)])) }); const dayF = SA.form.field({ name: 'days', label: 'أيام الخصم (الأجر الأساسي — بالأيام لا بالجنيه)', type: 'number', min: 1, hint: 'تحويل الأيام لمبلغ يتم في المرتبات (HR-14) — الأجر T3 لا يظهر هنا.' }); const whyF = SA.form.field({ name: 'reasons', label: 'التسبيب (إلزامي — 30 حرفًا على الأقل)', type: 'textarea', required: true, rows: 3 }); const excF = SA.form.field({ name: 'exc', label: 'استثناء مهلة التوقيع (سبب موثّق من HR Manager)', hint: 'تظهر عند تجاوز ' + dcfg('signingDeadlineDays', 30) + ' يومًا من انتهاء التحقيق.' });
    const refresh = () => { dayF.el.style.display = penF.get() !== 'deduction' ? 'none' : ''; recalc({ penalty: penF.get(), days: dayF.get() }); }; penF.input.addEventListener('change', refresh); dayF.input.addEventListener('input', refresh); refresh();
    const m = SA.modal({ title: 'قرار الجزاء — ' + v.id, subtitle: en(v.employeeId) + ' · ' + vTitle(v) + (item.managerCanDecide ? '' : ' · يتجاوز صلاحية المدير'), icon: 'alert', size: 'lg', danger: true,
      body: h('div.sap-confirm', {}, h('div.sap-hp-t4', {}, SA.icon('lock'), h('div', {}, 'قرار تأديبي (T4)', h('small', {}, 'يُرسل بند الخصم «بالأيام» فقط إلى المرتبات — دون تسبيب أو بيانات المخالفة.'))), isRepeat(v) ? SA.alert('warning', 'عود خلال سنة: يُقترح درجة جزاء أعلى (اقتراح غير ملزم).') : null, penF.el, dayF.el, whyF.el, panel, excF.el),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-accent', { type: 'button', onclick: async () => {
        const pen = penF.get(); const dys = +dayF.get() || 0; const reasons = whyF.get().trim(); const errs = [];
        if (!regOn()) errs.push('لا توجد لائحة تنظيم عمل معتمدة. يمكنك تسجيل ملاحظة فقط.');
        if (v.decision) errs.push('المخالفة دي اتوقّع عليها جزاء بالفعل. جزاء واحد فقط لكل مخالفة.');
        if (!penF.validate()) return; if (!whyF.validate()) return;
        if (!v.minutes) errs.push('لازم يتم ربط محضر التحقيق قبل إصدار القرار.');
        if (v.minutes && v.minutes.oralException && !(pen === 'warning' || (pen === 'deduction' && dys <= 1))) errs.push('التحقيق الشفهي يسمح بالإنذار أو خصم يوم واحد فقط.');
        if (pen === 'deduction') { if (!dys) { dayF.error('أدخل عدد أيام الخصم.'); return; } if (!recalc({ penalty: pen, days: dys })) errs.push('ما ينفعش الخصم يزيد عن ' + (capV == null ? '{Open}' : capV) + ' أيام للمخالفة، أو عن المتبقي هذا الشهر (' + (remain == null ? '—' : remain) + ' يوم).'); }
        if (reasons.length < 30) { whyF.error('اكتب أسباب القرار بوضوح (30 حرفًا على الأقل).'); return; }
        if (!item.managerCanDecide && !isHrMgr() && pen !== 'warning') errs.push('هذا الجزاء يتجاوز صلاحية المدير — القرار لـHR Manager.');
        if (v.minutes && dd(String(v.minutes.heldAt).slice(0, 10), T()) > dcfg('signingDeadlineDays', 30) && !String(excF.get() || '').trim()) errs.push('انتهت مهلة توقيع الجزاء. استثناء بسبب موثّق من HR Manager.');
        if (errs.length) { SA.toast(errs[0], 'error', { ms: 6500 }); return; }
        m.setBusy(true);
        try { await SA.api(() => {
          const rec = { penalty: pen, days: pen === 'deduction' ? dys : null, reasons, decidedBy: SA.session.userId, decidedAt: new Date().toISOString(), delivered: false, exception: excF.get() || null };
          st.patch('violations', v.id, { decision: rec, status: 'decided' }); addLog(v.id, 'قرار جزاء: ' + decSummary(rec));
          if (pen === 'deduction') st.insert('payrollInputs', { id: seqId('payrollInputs', 'PI', 4, Y()), kind: 'deduction_days', employeeId: v.employeeId, days: dys, source: v.id, label: 'خصم جزاء (بالأيام)', status: 'pending', createdAt: new Date().toISOString() });
          aud('HR.DSC.DECISION_ISSUED', 'violation', v.id, en(v.employeeId), { before: { جزاء: 'لا شيء' }, after: { جزاء: penLbl(pen), أيام: pen === 'deduction' ? dys : '—' }, reason: reasons });
          notify('لديك إشعار جديد', 'قرار جديد بانتظار التسليم (N-31).', 'action', ['R-11', 'R-12'], '#/hr/disciplinary');
        }); m.close(true); SA.toast('صدر القرار' + (pen === 'deduction' ? ' — أُرسل بند الخصم (بالأيام) إلى المرتبات' : ''), 'success'); } catch (e) { m.setBusy(false); SA.fail(e); }
      } }, 'إصدار القرار')] });
  }
  function deliverDecision(v) {
    return formModal({ title: 'تسليم القرار للموظف', subtitle: v.decision && v.decision.penalty === 'warning' ? 'إنذار كتابي WRN- (DOC-HR-31)' : 'إشعار خصم DED- (DOC-HR-24)', icon: 'doc', size: 'sm', submitLabel: 'تسجيل التسليم',
      fields: [{ name: 'method', label: 'طريقة التسليم', type: 'radio', required: true, value: 'hand', options: [['hand', 'تسليم باليد وتوقيع بالاستلام'], ['registered', 'خطاب مسجّل'], ['witnessed_refusal', 'امتناع عن الاستلام', 'شاهدان']] }, { name: 'w', label: 'الشاهدان (عند الامتناع)', placeholder: 'الاسمان' }, SA.alert('info', 'بعد التسليم تبدأ مهلة التظلم: ' + (dcfg('grievanceDays', null) == null ? 'غير مُعدّة (Open)' : dcfg('grievanceDays') + ' يوم') + '.')],
      check: (v2) => (v2.method === 'witnessed_refusal' && !String(v2.w || '').trim() ? { w: 'إثبات الامتناع يحتاج شاهدين.' } : null),
      onSubmit: (v2) => { st.patch('violations', v.id, (x) => ({ status: 'delivered', decision: Object.assign({}, x.decision, { delivered: true, deliveredAt: new Date().toISOString(), method: v2.method }) })); addLog(v.id, 'تسليم القرار'); aud('HR.DSC.DECISION_DELIVERED', 'violation', v.id, en(v.employeeId), { after: { طريقة: v2.method } }); SA.toast('سُجّل تسليم القرار', 'success'); } });
  }
  function suspendModal(v) {
    const mx = dcfg('suspensionMaxDays', null);
    return formModal({ title: 'تسجيل إيقاف مؤقت أثناء التحقيق', subtitle: 'النظام يسجّل القرار الصادر ولا يصدره (مواد 145–147 Pending).', icon: 'alert', size: 'sm', submitLabel: 'تسجيل', step: 'policy.change',
      fields: [{ name: 'from', label: 'بداية الإيقاف', type: 'date', required: true, value: T() }, { name: 'doc', label: 'رقم/مرجع قرار الإيقاف المكتوب', required: true }, SA.alert('info', 'الحد الأقصى ' + (mx == null ? '{Open}' : mx) + ' يوم بأجر كامل؛ التمديد بقرار قاضٍ — يُنبَّه عاجلًا عند التجاوز.')],
      onSubmit: (v2) => { st.patch('violations', v.id, { suspension: { from: v2.from, maxDays: mx, doc: v2.doc } }); st.patch('employees', v.employeeId, { status: 'suspended' }); addLog(v.id, 'تسجيل إيقاف مؤقت'); aud('HR.DSC.SUSPENSION_RECORDED', 'violation', v.id, en(v.employeeId), { after: { بداية: v2.from, الحد: mx } }); SA.toast('سُجّل الإيقاف ووُسمت حالة الموظف «موقوف»', 'success'); } });
  }
  function closeCase(v) { return confirmAct({ title: 'إغلاق الملف ' + v.id, confirmLabel: 'إغلاق الملف', impact: ['يُحفظ الملف T4 ≥ ' + '{5}' + ' سنوات بعد انتهاء الخدمة (مادة 92) بلا حذف.'], run: () => { st.patch('violations', v.id, { status: 'closed' }); addLog(v.id, 'إغلاق الملف'); }, success: 'أُغلق الملف' }); }

  /* ── ملف المخالفة ── */
  function caseSteps(v) {
    const dl = D(dcfg('investigationStartDays', 7), v.discoveredAt); const steps = [
      { l: 'بلاغ المشرف', d: fd(v.reportedAt), done: true }, { l: 'فرز وفتح الملف', d: v.investigatorId ? 'المحقق: ' + uname(v.investigatorId) : v.status === 'reported' ? 'آخر موعد لبدء التحقيق ' + fd(dl) : '', done: ['reported'].indexOf(v.status) < 0 },
      { l: 'إخطار الموظف وتحديد السماع', d: v.notifiedAt ? 'إخطار ' + fd(v.notifiedAt) + (v.hearingAt ? ' · سماع ' + fd(v.hearingAt) : '') : '', done: !!v.notifiedAt }, { l: 'محضر التحقيق', d: v.minutes ? fd(v.minutes.heldAt) : '', done: !!v.minutes },
      { l: 'قرار الجزاء', d: v.decision ? decSummary(v.decision) : '', done: !!v.decision }, { l: 'تسليم القرار', d: v.decision && v.decision.delivered ? fd(v.decision.deliveredAt) : '', done: !!(v.decision && v.decision.delivered) }, { l: 'إغلاق', d: '', done: v.status === 'closed' }];
    const firstOpen = steps.findIndex((s) => !s.done); return steps.map((s, i) => Object.assign(s, { now: i === firstOpen && v.status !== 'noted' && v.status !== 'referred' }));
  }
  function openCase(id) {
    const v0 = find('violations', id); if (!v0) return;
    aud('HR.DSC.FILE_READ', 'violation', id, 'قراءة ملف ' + id, { severity: 'high' });
    liveDrawer({ title: 'ملف المخالفة', paths: ['violations', 'grievances', 'settings', 'dismissals'], build() {
      const v = find('violations', id); if (!v) return false; const e = emp(v.employeeId); const g = L('grievances').find((x) => x.violationId === v.id); const dm = L('dismissals').find((x) => x.violationId === v.id && ['rejected', 'returned'].indexOf(x.status) < 0);
      const foot = []; const ap = needApprove();
      if (v.status === 'reported') foot.push(btn({ label: 'فرز وفتح ملف', icon: 'check', kind: 'primary', reason: ap, onClick: () => triage(v) }));
      if (v.status === 'open') foot.push(btn({ label: 'إخطار الموظف وتحديد السماع', icon: 'doc', kind: 'primary', reason: ap, onClick: () => notifyEmployee(v) }));
      if (v.status === 'hearing' && !v.minutes) foot.push(btn({ label: 'حفظ محضر التحقيق', icon: 'note', kind: 'primary', reason: ap, onClick: () => saveMinutes(v) }));
      if (v.status === 'hearing' && v.minutes) foot.push(btn({ label: 'إصدار قرار الجزاء', icon: 'alert', kind: 'primary', reason: ap || (regOn() ? '' : 'لا توجد لائحة معتمدة — الملاحظة فقط'), onClick: () => decideModal(v) }));
      if (v.status === 'decided') foot.push(btn({ label: 'تسليم القرار', icon: 'doc', kind: 'primary', reason: ap, onClick: () => deliverDecision(v) }));
      if (v.status === 'delivered') foot.push(btn({ label: 'إغلاق الملف', icon: 'check', kind: 'primary', reason: ap, onClick: () => closeCase(v) }));
      if (['reported', 'open', 'hearing', 'decided', 'delivered'].indexOf(v.status) >= 0 && v.kind !== 'note') foot.unshift(btn({ label: 'إجراءات أخرى', icon: 'dots', kind: 'ghost', onClick: (ev, b) => SA.menu(b, [{ label: 'طلب فصل (ملف قضية)', icon: 'alert', disabled: (v.minutes ? '' : 'يلزم محضر تحقيق مكتمل') || (SA.can('hr.disciplinary.create') ? '' : NOPERM('hr.disciplinary.create')), onClick: () => dismissalWizard(v.id) }, { label: 'تسجيل إيقاف مؤقت', icon: 'clock', disabled: ap, onClick: () => suspendModal(v) }, { label: 'تقديم تظلم نيابةً عن الموظف', icon: 'userx', disabled: v.decision && v.decision.delivered ? (g ? 'يوجد تظلم' : '') : 'بعد تسليم القرار', onClick: () => fileGrievance(v) }]) }));
      return { title: vTitle(v), subtitle: v.id + ' · ' + (e ? e.name : ''), foot, body: h('div.sap-drawer-inner', {}, t4Banner('فُتح هذا الملف الآن وتم تسجيل القراءة (HR.DSC.FILE_READ).'),
        h('div.sap-hp-row.is-between', {}, empCell(e), stChip(VST, v.status)),
        SA.kv([['الوصف', v.description], ['المبلّغ', uname(v.reportedBy)], ['تاريخ العلم', fd(v.discoveredAt)], ['من الكتالوج', v.catalogId ? (vItem(v) || {}).name + (vItem(v) ? ' — ' + vItem(v).clause : '') : '—'], ['المحقق', v.investigatorId ? uname(v.investigatorId) : '—'], v.suspension ? ['الإيقاف المؤقت', 'من ' + fd(v.suspension.from) + ' — الحد ' + (v.suspension.maxDays || '{Open}') + ' يوم'] : null, isRepeat(v) ? ['العود', SA.chip('عود خلال سنة — اقتراح درجة أعلى', 'warning')] : null, v.decision ? ['القرار', h('span', {}, decSummary(v.decision), v.decision.annulled ? ' ' : '', v.decision.annulled ? SA.chip('أُلغي بالتظلم', 'neutral') : '')] : null, v.decision ? ['التسبيب', v.decision.reasons] : null]),
        v.kind === 'note' ? SA.alert('info', 'ملاحظة إدارية — لا تفتح مسارًا رسميًا ولا جزاء.') : sec('مسار الإجراء والمواعيد', h('ul.sap-hp-tl', {}, caseSteps(v).map((s) => h('li', { class: s.done ? 'is-done' : s.now ? 'is-now' : '' }, h('b', {}, s.l), h('small', {}, s.d || (s.now ? 'الخطوة الحالية' : '')))))),
        v.minutes ? sec('المحضر', SA.kv([['الجلسة', fd(v.minutes.heldAt)], ['الحاضرون', v.minutes.attendees], ['الأقوال', v.minutes.statements], ['الدفاع', v.minutes.defence], ['التوصية', v.minutes.recommendation], v.minutes.oralException ? ['استثناء', SA.chip('تحقيق شفهي', 'warning')] : null])) : null,
        g ? SA.alert('warning', 'تظلم ' + g.id + ': ' + GST[g.stage][0] + (g.outcome ? ' — ' + ({ uphold: 'تأييد', modify: 'تعديل', cancel: 'إلغاء' })[g.outcome] : '') + ' — تنفيذ الخصم معلَّق لحين القرار (مقترح Open).') : null, dm ? SA.alert('info', 'طلب فصل ' + dm.id + ' — ' + DST[dm.status][0]) : null,
        v.log && v.log.length ? sec('سجل الملف', h('ul.sap-hp-tl', {}, v.log.slice().reverse().map((x) => h('li', { class: 'is-done' }, h('b', {}, x.text), h('small', {}, SA.fmt.dt(x.at) + (x.by ? ' · ' + uname(x.by) : '')))))) : null) };
    } });
  }
  function tabCases(view, api) {
    if (!T4()) {
      SA.audit('ACCESS.DENIED', { target: { type: 'permission', id: 'hr.discipline.view', label: 'الملفات التأديبية' }, result: 'denied' });
      const mine = L('violations').filter((v) => v.reportedBy === SA.session.userId);
      return SA.live(view, () => h('div.sap-hp-view', {}, SA.denied({ perm: 'hr.discipline.view', title: 'هذه البيانات سرية (T4) — عرض مبسّط', text: 'لا تملك صلاحية الاطلاع على الملفات التأديبية. تظهر لك فقط البلاغات التي رفعتها وحالتها العامة.', home: false }),
        tcard({ caption: 'بلاغاتي', rows: () => L('violations').filter((v) => v.reportedBy === SA.session.userId), columns: [{ key: 'id', label: 'البلاغ' }, { key: 'e', label: 'الموظف', render: (v) => en(v.employeeId) }, { key: 's', label: 'الحالة', render: () => SA.chip('قيد الدراسة', 'info') }], empty: { icon: 'inbox', title: 'لا بلاغات', text: 'ابلاغاتك تظهر هنا بحالة «قيد الدراسة» فقط.' } }).el), ['violations']);
    }
    return SA.live(view, () => {
      const all = L('violations'); const open = all.filter((v) => ['reported', 'open', 'hearing', 'decided'].indexOf(v.status) >= 0 && v.kind !== 'note');
      const t = tcard({ caption: 'الملفات التأديبية', rows: () => L('violations'), search: { placeholder: 'ابحث بالموظف أو رقم الملف…', keys: ['id', (v) => en(v.employeeId), (v) => vTitle(v)] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(VST).map((k) => [k, VST[k][0]]) }], onRowClick: (v) => openCase(v.id),
        columns: [{ key: 'id', label: 'الملف', sort: true, render: (v) => h('div', {}, h('b', {}, v.id), h('div.sap-hp-note', {}, vTitle(v))) }, { key: 'e', label: 'الموظف', render: (v) => empCell(emp(v.employeeId)) }, { key: 'st', label: 'الحالة', render: (v) => stChip(VST, v.status) }, { key: 'dl', label: 'الموعد القادم', render: (v) => { if (v.status === 'reported') { const left = dd(T(), D(dcfg('investigationStartDays', 7), v.discoveredAt)); return left < 0 ? SA.chip('تأخر بدء التحقيق ' + (-left) + ' ي', 'danger') : SA.chip('بدء التحقيق خلال ' + left + ' ي', left <= 2 ? 'warning' : 'info'); } if (v.status === 'hearing' && v.hearingAt && !v.minutes) return 'سماع ' + fd(v.hearingAt); return '—'; } }, { key: 'dec', label: 'القرار (بالأيام)', render: (v) => decSummary(v.decision) }],
        rowActions: (v) => [{ label: 'فتح الملف', icon: 'eye', onClick: () => openCase(v.id) }],
        empty: { icon: 'alert', title: 'لا توجد ملفات', text: 'يبدأ المسار ببلاغ من المشرف.', action: { label: 'بلاغ جديد', perm: 'hr.disciplinary.create', onClick: () => reportViolation() } } });
      return h('div.sap-hp-view', {}, t4Banner('الجزاءات تُعرض «بالأيام» لا بالجنيه — لا أجر في شاشات التأديب. كل فتح ملف يُسجَّل.'), !regOn() ? SA.alert('warning', 'لا توجد لائحة تنظيم عمل معتمدة (D10 Open): لا يمكن إصدار قرارات جزاء؛ الملاحظات فقط. فعّل لائحة من تبويب «الكتالوج واللائحة».') : null,
        kpiRow([['ملفات جارية', N(open.length), { accent: open.length > 0 }], ['بلاغات بانتظار الفرز', N(all.filter((v) => v.status === 'reported').length), { sub: 'مهلة بدء التحقيق ' + dcfg('investigationStartDays', 7) + ' أيام' }], ['قرارات هذا الشهر', N(all.filter((v) => v.decision && String(v.decision.decidedAt).slice(0, 10) >= monthStartStr()).length)], ['تظلمات مفتوحة', N(L('grievances').filter((g) => ['filed', 'under_review'].indexOf(g.stage) >= 0).length)]]), t.el, specLink('m-dsc-01'));
    }, ['violations', 'grievances', 'settings']);
  }

  /* ── الكتالوج واللائحة ── */
  function toggleRegulation() {
    const on = regOn();
    return formModal({ title: on ? 'إيقاف تفعيل اللائحة (للتجربة)' : 'تفعيل لائحة تنظيم العمل', subtitle: 'يُسجَّل بخطورة حرجة. لا يصدر أي قرار جزاء قبل تفعيل لائحة معتمدة بتاريخ سريان.', icon: 'shield', size: 'sm', submitLabel: on ? 'إيقاف التفعيل' : 'تفعيل اللائحة', danger: on, step: 'policy.change', stepTitle: 'تأكيد تغيير اللائحة',
      fields: on ? [{ name: 'why', label: 'سبب الإيقاف', type: 'textarea', required: true, rows: 2 }] : [{ name: 'file', label: 'ملف اللائحة المعتمدة (محاكاة رفع)', required: true, placeholder: 'لائحة-تنظيم-العمل.pdf', hint: 'التفعيل بدون ملف اللائحة المعتمدة مرفوض.' }, { name: 'eff', label: 'تاريخ السريان', type: 'date', required: true, value: T() }],
      onSubmit: (v) => { st.update('settings.hrProtect.discipline', (d) => { d.regulationActive = !on; if (!on) { d.regulationEffective = v.eff; d.regulationFile = v.file; d.regulationLabel = 'لائحة تنظيم العمل المعتمدة — ' + v.file; } }); aud('HR.DSC.REGULATION_ACTIVATED', 'regulation', 'WR-1', 'لائحة تنظيم العمل', { before: { مفعّلة: on }, after: { مفعّلة: !on }, reason: on ? v.why : 'تفعيل بتاريخ سريان ' + v.eff }); SA.toast(on ? 'أُوقف تفعيل اللائحة — القرارات مغلقة' : 'فُعّلت اللائحة', on ? 'warn' : 'success'); } });
  }
  function editLimits() {
    const d = cfg('discipline', {});
    return formModal({ title: 'السقوف والمواعيد القانونية للجزاءات', subtitle: 'قيم Law · Pending بتاريخ سريان — تُقرأ من الإعدادات لا من الكود، وبدون أثر رجعي.', icon: 'gauge', size: 'md', submitLabel: 'حفظ', step: 'policy.change', stepTitle: 'تعديل سقوف قانونية',
      fields: [{ name: 'capV', label: 'سقف الخصم للمخالفة (أيام الأجر الأساسي)', type: 'number', min: 1, value: d.capPerViolationDays }, { name: 'capM', label: 'سقف الخصم في الشهر (أيام)', type: 'number', min: 1, value: d.capPerMonthDays }, { name: 'mgr', label: 'صلاحية المدير المباشر (أقصى أيام خصم)', type: 'number', min: 0, value: d.managerMaxDays }, { name: 'inv', label: 'مهلة بدء التحقيق من تاريخ العلم (أيام)', type: 'number', min: 1, value: d.investigationStartDays }, { name: 'sign', label: 'مهلة توقيع الجزاء بعد انتهاء التحقيق (أيام)', type: 'number', min: 1, value: d.signingDeadlineDays }, { name: 'gr', label: 'مهلة التظلم (أيام) — {Open}', type: 'number', min: 1, value: d.grievanceDays, hint: 'اتركها فارغة = غير مُعدّة.' }, { name: 'why', label: 'سبب التعديل', type: 'textarea', required: true, rows: 2 }],
      onSubmit: (v) => { const before = { سقف_المخالفة: d.capPerViolationDays, سقف_الشهر: d.capPerMonthDays }; st.update('settings.hrProtect.discipline', (x) => { Object.assign(x, { capPerViolationDays: v.capV, capPerMonthDays: v.capM, managerMaxDays: v.mgr, investigationStartDays: v.inv, signingDeadlineDays: v.sign, grievanceDays: v.gr }); }); aud('HR.DSC.LIMITS_CHANGED', 'settings', 'discipline', 'السقوف القانونية للجزاءات', { before, after: { سقف_المخالفة: v.capV, سقف_الشهر: v.capM }, reason: v.why }); SA.toast('حُفظت السقوف — تسري على القرارات القادمة', 'success'); } });
  }
  function editCatalogItem(id) {
    const c = id ? find('penaltyCatalog', id) : null; const capV = dcfg('capPerViolationDays', null);
    return formModal({ title: c ? 'تعديل مخالفة في الكتالوج' : 'مخالفة جديدة في الكتالوج', subtitle: 'مبني من لائحة تنظيم العمل. التعديل لا يسري بأثر رجعي على ملفات مفتوحة.', icon: 'list', size: 'md', submitLabel: 'حفظ في الكتالوج', step: 'policy.change', stepTitle: 'تعديل الكتالوج',
      fields: [{ name: 'name', label: 'وصف المخالفة', required: true, value: c ? c.name : '' }, { name: 'sev', label: 'فئة الجسامة', type: 'select', required: true, value: c ? c.severity : '', options: [['', 'اختر…'], ['minor', 'بسيطة'], ['moderate', 'متوسطة'], ['serious', 'جسيمة']] }, { name: 'clause', label: 'المادة في اللائحة', required: true, value: c ? c.clause : '' }, { name: 'pens', label: 'الجزاءات المسموحة (من سلم المادة 139 — الفصل مسار محكمة)', type: 'multi', required: true, value: c ? c.allowed : ['warning'], options: Object.keys(PEN).map((k) => [k, PEN[k]]) }, { name: 'days', label: 'أقصى أيام خصم لهذه المخالفة', type: 'number', min: 0, value: c ? c.deductionDays : 1 }, { name: 'mgr', label: 'يقرره المدير المباشر', type: 'switch', value: c ? c.managerCanDecide : false }],
      check: (v) => (capV != null && v.days > capV ? { days: 'تعديل يخالف السقف القانوني (' + capV + ' أيام للمخالفة).' } : null),
      onSubmit: (v) => { const rec = { name: v.name.trim(), severity: v.sev, clause: v.clause.trim(), allowed: v.pens, deductionDays: v.days || 0, managerCanDecide: !!v.mgr }; if (c) st.patch('penaltyCatalog', c.id, rec); else st.insert('penaltyCatalog', Object.assign({ id: seqId('penaltyCatalog', 'V', 2), active: true }, rec)); aud('HR.DSC.CATALOG_CHANGED', 'catalog', c ? c.id : 'new', rec.name, { before: c ? { أيام: c.deductionDays, جزاءات: c.allowed.length } : null, after: { أيام: rec.deductionDays, جزاءات: rec.allowed.length } }); SA.toast('حُفظ الكتالوج', 'success'); } });
  }
  function tabCatalog(view) {
    return SA.live(view, () => {
      const d = cfg('discipline', {}); const on = regOn(); const row = (l, v, tag) => [l, h('span', {}, v == null ? openTag('غير مُعدّ') : h('b.num', {}, v), tag ? ' ' : '', tag ? SA.tag('pending', 'Law · Pending') : '')];
      const t = tcard({ caption: 'كتالوج المخالفات والجزاءات', rows: () => L('penaltyCatalog'), pageSize: 10, onRowClick: (c) => (SA.can('hr.disciplinary.approve') ? editCatalogItem(c.id) : null),
        columns: [{ key: 'id', label: 'الكود', render: (c) => h('span.num', {}, c.id) }, { key: 'name', label: 'المخالفة', render: (c) => h('div', {}, h('b', {}, c.name), h('div.sap-hp-note', {}, c.clause)) }, { key: 'sev', label: 'الجسامة', render: (c) => stChip(SEV_VIO, c.severity) }, { key: 'pen', label: 'الجزاءات المسموحة', render: (c) => h('span.sap-hp-pills', {}, c.allowed.map((k) => h('span.sap-hp-tag', {}, penLbl(k)))) }, { key: 'd', label: 'أقصى خصم (أيام)', render: (c) => N(c.deductionDays) }, { key: 'm', label: 'المدير يقرر', render: (c) => (c.managerCanDecide ? SA.chip('نعم', 'success') : '—') }],
        rowActions: (c) => [{ label: 'تعديل', icon: 'edit', disabled: needApprove(), onClick: () => editCatalogItem(c.id) }, { label: c.active ? 'تعطيل' : 'تفعيل', icon: c.active ? 'xcircle' : 'checkcircle', disabled: needApprove(), onClick: () => { st.patch('penaltyCatalog', c.id, { active: !c.active }); aud('HR.DSC.CATALOG_CHANGED', 'catalog', c.id, c.name, { after: { نشط: !c.active } }); } }] });
      return h('div.sap-hp-view', {}, h('div.sap-hp-cols', {}, SA.card({ title: 'لائحة تنظيم العمل', tags: SA.tag('open', 'D10 Open') }, h('div.sap-hp-res.' + (on ? 'is-ok' : 'is-bad'), {}, h('b', {}, on ? 'مفعّلة' : 'غير مفعّلة — القرارات مغلقة'), h('span', { style: { color: 'var(--color-text)' } }, on ? (d.regulationLabel || '') + ' · سريان ' + fd(d.regulationEffective) : 'لا يصدر قرار جزاء قبل تفعيل لائحة معتمدة؛ الملاحظة متاحة دائمًا.')), h('p.sap-hp-note', {}, 'هل لدى المصنع لائحة معتمدة من الجهة (منشآت 10+ عمال)؟ القرار D10 لسه Open — الكتالوج هنا تجريبي للنموذج.'), btn({ label: on ? 'إيقاف التفعيل (للتجربة)' : 'تفعيل اللائحة', icon: 'shield', kind: on ? 'ghost' : 'primary', perm: 'hr.disciplinary.approve', onClick: toggleRegulation })),
        SA.card({ title: 'السقوف والمواعيد القانونية', tags: SA.tag('pending', 'Law · Pending'), actions: btn({ label: 'تعديل', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'hr.compliance.edit', onClick: editLimits }) }, SA.kv([row('سقف الخصم للمخالفة (أيام)', d.capPerViolationDays, true), row('سقف الخصم في الشهر (أيام)', d.capPerMonthDays, true), row('صلاحية المدير المباشر (أيام)', d.managerMaxDays, true), row('بدء التحقيق من العلم (أيام)', d.investigationStartDays, true), row('توقيع الجزاء بعد التحقيق (أيام)', d.signingDeadlineDays, true), row('مهلة التظلم (أيام)', d.grievanceDays, false), row('أساس اليوم (الأجر ÷ ؟)', d.dayBasis, false)]))),
        h('div.sap-hp-row.is-between', {}, h('h3', { style: { margin: 0 } }, 'الكتالوج'), btn({ label: 'مخالفة جديدة', icon: 'plus', kind: 'ghost', perm: 'hr.disciplinary.approve', onClick: () => editCatalogItem() })), t.el, h('p.sap-hp-note', {}, 'سلم المادة 139: إنذار · خصم · تأجيل علاوة · حجب نصف العلاوة · تأجيل ترقية · خفض أجر · تنزيل درجة — والفصل مسار محكمة فقط. ', specLink('m-dsc-06')));
    }, ['penaltyCatalog', 'settings']);
  }

  /* ── التظلمات ── */
  function fileGrievance(v) {
    return formModal({ title: 'تقديم تظلم', subtitle: v ? v.id + ' — ' + en(v.employeeId) : '', icon: 'userx', size: 'sm', submitLabel: 'تقديم التظلم',
      fields: [v ? null : { name: 'vio', label: 'القرار المتظلَّم منه', type: 'select', required: true, options: [['', 'اختر…']].concat(L('violations').filter((x) => x.decision && x.decision.delivered).map((x) => [x.id, x.id + ' — ' + en(x.employeeId)])) }, { name: 'reason', label: 'سبب التظلم', type: 'textarea', required: true, rows: 3 }].filter(Boolean),
      check: (x) => { const id2 = v ? v.id : x.vio; if (L('grievances').some((g) => g.violationId === id2 && g.stage !== 'closed')) return 'يوجد تظلم مفتوح على هذا القرار.'; return null; },
      onSubmit: (x) => { const vid = v ? v.id : x.vio; const vv = find('violations', vid); const id = seqId('grievances', 'GRV', 4, Y()); st.insert('grievances', { id, employeeId: vv.employeeId, violationId: vid, reason: x.reason, filedAt: new Date().toISOString(), dueAt: null, stage: 'filed', outcome: null, decidedBy: null }); st.update('payrollInputs', (l) => l.forEach((p) => { if (p.source === vid && p.status === 'pending') p.status = 'held'; })); aud('HR.DSC.GRIEVANCE_FILED', 'grievance', id, en(vv.employeeId), { after: { قرار: vid } }); notify('لديك إشعار جديد', 'تظلم جديد بانتظار الدراسة.', 'action', ['R-11'], '#/hr/disciplinary?tab=grievances'); SA.toast('قُدّم التظلم — تنفيذ الخصم معلَّق لحين القرار', 'success'); } });
  }
  function decideGrievance(g) {
    const v = g.violationId ? find('violations', g.violationId) : null; const mine = v && v.decision && v.decision.decidedBy === SA.session.userId;
    return formModal({ title: 'قرار التظلم ' + g.id, subtitle: 'تأييد / تعديل / إلغاء — من قرر الجزاء لا يفصل في تظلم نفسه.', icon: 'checkcircle', size: 'sm', submitLabel: 'تسجيل القرار',
      fields: [{ name: 'out', label: 'القرار', type: 'radio', required: true, options: [['uphold', 'تأييد القرار'], ['modify', 'تعديل (تخفيض أيام الخصم)', v && v.decision && v.decision.penalty === 'deduction' ? '' : 'لا ينطبق', v && v.decision && v.decision.penalty === 'deduction' ? '' : 'disabled'], ['cancel', 'إلغاء القرار']].map((o) => (o[3] ? [o[0], o[1], o[2], 'disabled'] : [o[0], o[1]])) }, { name: 'days', label: 'الأيام بعد التعديل', type: 'number', min: 1 }, { name: 'why', label: 'تسبيب قرار التظلم', type: 'textarea', required: true, rows: 2 }],
      check: (x) => { if (mine) return 'من قرر الجزاء لا يفصل في تظلم نفسه — أحِل لمستوى أعلى.'; if (x.out === 'modify' && (!x.days || x.days >= v.decision.days)) return { days: 'أيام الخصم بعد التعديل لازم تكون أقل من ' + v.decision.days + '.' }; return null; },
      onSubmit: (x) => { st.patch('grievances', g.id, { stage: 'decided', outcome: x.out, decidedBy: SA.session.userId, decidedAt: new Date().toISOString(), decisionWhy: x.why });
        if (v) { st.update('violations', (l) => { const vv = l.find((y) => y.id === v.id); if (!vv) return; if (x.out === 'cancel') vv.decision.annulled = true; if (x.out === 'modify') vv.decision.days = x.days; (vv.log = vv.log || []).push({ at: new Date().toISOString(), by: SA.session.userId, text: 'قرار التظلم: ' + ({ uphold: 'تأييد', modify: 'تعديل', cancel: 'إلغاء' })[x.out] }); }); st.update('payrollInputs', (l) => l.forEach((p) => { if (p.source === v.id) { if (x.out === 'cancel') p.status = 'void'; else { if (x.out === 'modify') p.days = x.days; if (p.status === 'held') p.status = 'pending'; } } })); }
        aud('HR.DSC.GRIEVANCE_DECIDED', 'grievance', g.id, en(g.employeeId), { after: { قرار: x.out }, reason: x.why }); SA.toast('صدر قرار التظلم', 'success'); } });
  }
  function tabGrievances(view) {
    return t4gate(() => SA.live(view, () => {
      const t = tcard({ caption: 'التظلمات', rows: () => L('grievances'), columns: [{ key: 'id', label: 'التظلم', render: (g) => h('div', {}, h('b', {}, g.id), h('div.sap-hp-note', {}, g.violationId ? 'من قرار ' + g.violationId : 'من تقييم ' + g.appraisalId)) }, { key: 'e', label: 'الموظف', render: (g) => empCell(emp(g.employeeId)) }, { key: 'r', label: 'السبب', render: (g) => h('span', { title: g.reason }, g.reason.length > 60 ? g.reason.slice(0, 60) + '…' : g.reason) }, { key: 's', label: 'المرحلة', render: (g) => stChip(GST, g.stage) }, { key: 'o', label: 'النتيجة', render: (g) => (g.outcome ? ({ uphold: 'تأييد', modify: 'تعديل', cancel: 'إلغاء' })[g.outcome] : '—') }],
        rowActions: (g) => [g.stage === 'filed' ? { label: 'بدء الدراسة', icon: 'play', disabled: needApprove(), onClick: () => run(() => st.patch('grievances', g.id, { stage: 'under_review' })).then(() => SA.toast('بدأت الدراسة', 'success')) } : null, g.stage === 'under_review' || g.stage === 'filed' ? { label: 'قرار التظلم', icon: 'checkcircle', disabled: needApprove(), onClick: () => decideGrievance(g) } : null, g.violationId ? { label: 'فتح الملف التأديبي', icon: 'eye', onClick: () => openCase(g.violationId) } : null],
        empty: { icon: 'userx', title: 'لا توجد تظلمات', text: 'يقدّمها الموظف بعد تسلّم القرار أو من نتيجة تقييم.' } });
      return h('div.sap-hp-view', {}, t4Banner(), SA.alert('info', 'مهلة التظلم وجهته {Open}. اقتراح: تنفيذ الخصم يُعلَّق أثناء التظلم — مطبَّق هنا (الخصم «معلَّق» في مدخلات المرتبات) لحين القرار. التظلم من تقييم أداء يأتي من «الأداء والتقييم».'), t.el, h('div.sap-hp-row', {}, btn({ label: 'تقديم تظلم', icon: 'plus', kind: 'ghost', perm: 'hr.disciplinary.create', onClick: () => fileGrievance(null) }), specLink('m-dsc-07')));
    }, ['grievances', 'violations']));
  }

  /* ── شكاوى التحرش ── */
  const isHandler = () => (cfg('harassmentHandlers', []) || []).indexOf(SA.session.userId) >= 0 || (SA.session.role && SA.session.role.id === 'R-01');
  function fileHarassment() {
    return formModal({ title: 'بلاغ سري — تحرش / تنمر', subtitle: 'القناة سرية وتُوجَّه فقط لمجموعة المعالجة. اسم الشاكي لا يظهر للمشرف أو للمشكو في حقه.', icon: 'shield', size: 'md', submitLabel: 'إرسال البلاغ السري',
      fields: [{ name: 'anon', label: 'إرسال برمز متابعة بدون اسم', type: 'switch', value: true }, { name: 'against', label: 'الموظف المشكو في حقه', type: 'select', required: true, options: empOpts() }, { name: 'desc', label: 'وصف الواقعة', type: 'textarea', required: true, rows: 4, hint: 'اكتب ما حدث دون إضافة بيانات غير لازمة.' }],
      onSubmit: (v) => { const id = seqId('harassment', 'HAR', 4, Y()); const code = 'HAR-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + String(Math.floor(Math.random() * 90 + 10)); const ag = emp(v.against); const conflict = !!ag && (ag.departmentId === 'D-07' || ag.id === 'E-1001'); const me = myEmp();
        st.insert('harassment', { id, followCode: code, complainantId: v.anon ? null : (me ? me.id : null), againstId: v.against, description: v.desc.trim(), receivedAt: new Date().toISOString(), status: conflict ? 'escalated' : 'received', handlerNote: '', conflict, log: [{ at: new Date().toISOString(), text: 'استُلمت الشكوى عبر القناة السرية' }] });
        aud('HR.DSC.HARASSMENT_FILED', 'harassment', id, 'شكوى سرية', { after: { مجهولة: !!v.anon, تضارب: conflict } }); notify('بلاغ سري جديد', 'يوجد بلاغ جديد في القناة السرية.', 'urgent', [], '#/hr/disciplinary?tab=harassment', cfg('harassmentHandlers', []));
        SA.toast(v.anon ? 'أُرسل البلاغ. رمز المتابعة: ' + code : 'أُرسل البلاغ السري', 'success', { ms: 9000 }); } });
  }
  function updateHarassment(r) {
    const nxt = { received: 'triage', triage: 'investigation', investigation: 'decision', decision: 'closed' }[r.status]; if (!nxt) return;
    return formModal({ title: 'تحديث معالجة الشكوى ' + r.id, subtitle: 'من «' + HST[r.status][0] + '» إلى «' + HST[nxt][0] + '» — سرية وحماية من الانتقام.', icon: 'shield', size: 'sm', submitLabel: 'تحديث',
      fields: [{ name: 'note', label: 'ملاحظة المعالج (سرية)', type: 'textarea', required: true, rows: 3 }],
      check: () => { const ag = emp(r.againstId); const me = myEmp(); if (r.conflict && SA.session.role.id !== 'R-01') return 'تضارب مصالح: الشكوى تُحال لـGM/Legal فقط.'; if (me && ag && me.id === ag.id) return 'لا يمكنك معالجة شكوى ضدك.'; return null; },
      onSubmit: (v) => { st.patch('harassment', r.id, (x) => ({ status: nxt, handlerNote: v.note, log: (x.log || []).concat([{ at: new Date().toISOString(), text: 'تحديث: ' + HST[nxt][0] }]) })); aud('HR.DSC.HARASSMENT_UPDATED', 'harassment', r.id, 'شكوى سرية', { after: { مرحلة: HST[nxt][0] } }); SA.toast('تم التحديث', 'success'); } });
  }
  function openHarassment(id) {
    aud('HR.DSC.HARASSMENT_ACCESSED', 'harassment', id, 'فتح شكوى سرية', { severity: 'critical' });
    liveDrawer({ title: 'شكوى سرية', paths: ['harassment'], build() { const r = find('harassment', id); if (!r) return false; const ag = emp(r.againstId);
      return { title: r.id, subtitle: 'سرية جدًا — معالجون فقط', foot: r.status !== 'closed' ? [btn({ label: 'تحديث المعالجة', icon: 'check', kind: 'primary', onClick: () => updateHarassment(r) })] : [], body: h('div.sap-drawer-inner', {}, t4Banner('تم تسجيل فتح الشكوى (HR.DSC.HARASSMENT_ACCESSED — حرج).'), h('div.sap-hp-row.is-between', {}, stChip(HST, r.status), r.conflict ? SA.chip('تضارب مصالح → GM/Legal', 'danger') : null),
        SA.kv([['رمز المتابعة', h('code', {}, r.followCode)], ['الشاكي', r.complainantId ? en(r.complainantId) : SA.chip('مجهول — برمز متابعة', 'info')], ['المشكو في حقه', ag ? ag.name : '—'], ['الوصف', r.description], ['ملاحظة المعالج', r.handlerNote || '—'], ['وارد', SA.fmt.dt(r.receivedAt)]]), SA.alert('info', 'منع الانتقام: أي تغيير في وردية الشاكي أو تقييمه أو جزاء له أثناء المعالجة ينبّه المعالج.'), sec('السجل', h('ul.sap-hp-tl', {}, (r.log || []).slice().reverse().map((x) => h('li', { class: 'is-done' }, h('b', {}, x.text), h('small', {}, SA.fmt.dt(x.at))))))) }; } });
  }
  function tabHarassment(view) {
    return t4gate(() => {
      if (!isHandler()) { SA.audit('ACCESS.DENIED', { target: { type: 'permission', id: 'hr.harassment.handle', label: 'قناة شكاوى التحرش' }, result: 'denied' }); return h('div.sap-hp-view', {}, SA.denied({ perm: 'hr.harassment.handle', title: 'قناة سرية لمجموعة المعالجة فقط', text: 'الشكاوى السرية يراها المعالجون المحدّدون فقط. مجموعة المعالجة {Open} — تُحدَّد من الإعدادات.', home: false }), btn({ label: 'تقديم بلاغ سري', icon: 'shield', kind: 'primary', onClick: fileHarassment })); }
      return SA.live(view, () => { const t = tcard({ caption: 'شكاوى سرية', rows: () => L('harassment'), onRowClick: (r) => openHarassment(r.id), columns: [{ key: 'id', label: 'الشكوى', render: (r) => h('div', {}, h('b', {}, r.id), h('div.sap-hp-note', {}, 'رمز المتابعة: ', h('code', {}, r.followCode))) }, { key: 'ag', label: 'المشكو في حقه', render: (r) => en(r.againstId) }, { key: 'c', label: 'الشاكي', render: (r) => (r.complainantId ? 'بالاسم (سري)' : 'مجهول') }, { key: 's', label: 'المرحلة', render: (r) => stChip(HST, r.status) }, { key: 'at', label: 'الاستلام', render: (r) => ago(r.receivedAt) }], empty: { icon: 'shield', title: 'لا شكاوى', text: 'القناة السرية مفعّلة.' } });
        return h('div.sap-hp-view', {}, t4Banner('الإشعار للمعالجين بنص محايد دون أي تفاصيل (N-55).'), t.el, h('div.sap-hp-row', {}, btn({ label: 'تقديم بلاغ سري (محاكاة موظف)', icon: 'plus', kind: 'ghost', onClick: fileHarassment }), h('span.sap-hp-note', {}, 'مجموعة المعالجة: ', cfg('harassmentHandlers', []).map(uname).join('، '), ' ', SA.tag('open', 'Open')), specLink('m-dsc-08'))); }, ['harassment']);
    });
  }

  /* ── طلبات الفصل (ملف قضية) ── */
  function dismissalWizard(prefVio) {
    const cands = L('violations').filter((v) => v.kind === 'violation' && !!v.minutes && ['noted', 'referred'].indexOf(v.status) < 0);
    let step = 0; const body = h('div.sap-confirm'); let vio = prefVio || ''; let ground = ''; let evid = ''; let checks = null;
    const m = SA.modal({ title: 'طلب فصل = ملف قضية', subtitle: 'لا يوجد زر «فصل». هذا الملف يمرّ HR ← قانوني ← GM ثم يُحضَّر للمحكمة العمالية؛ الإنهاء لا يُنفَّذ إلا بحكم نهائي.', icon: 'alert', size: 'lg', danger: true, body, foot: [h('span')] });
    function runChecks() { const v = find('violations', vio); const e = v ? emp(v.employeeId) : null; const sick = e ? sickLeaveBlock(e.id) : null; checks = [{ ok: !!(v && v.minutes), l: 'تحقيق مكتوب مكتمل (محضر محفوظ)' }, { ok: !!ground, l: 'سبب من الأسباب السبعة المحصورة (مادة 148)' }, { ok: !sick, l: sick ? 'الموظف في إجازة مرضية مثبتة حتى ' + fd(sick.to) + ' — حظر آلي ولا تجاوز' : 'الموظف ليس في إجازة مرضية مثبتة', hard: !!sick }, { ok: !L('dismissals').some((d) => d.violationId === vio && ['rejected', 'returned'].indexOf(d.status) < 0), l: 'لا طلب فصل مفتوح لنفس الملف' }]; return checks; }
    function render() {
      SA.clear(body); SA.clear(m.foot);
      body.append(SA.stepper(['الملف والسبب', 'الفحص الآلي', 'مراجعة وإرسال'], step));
      if (step === 0) {
        const vs = SA.form.field({ name: 'v', label: 'الملف التأديبي (بعد اكتمال التحقيق)', type: 'select', required: true, value: vio, options: [['', 'اختر الملف…']].concat(cands.map((v) => [v.id, v.id + ' — ' + en(v.employeeId) + ' — ' + vTitle(v)])), onChange: (x) => { vio = x; } });
        const gs = SA.form.field({ name: 'g', label: 'سبب الفصل (قائمة محصورة)', type: 'select', required: true, value: ground, options: [['', 'اختر السبب…']].concat(GROUNDS.map((g, i) => [String(i), (i + 1) + '. ' + g])), onChange: (x) => { ground = x; } });
        const ev = SA.form.field({ name: 'e', label: 'الأدلة وربط المحضر', type: 'textarea', required: true, rows: 3, value: evid, onInput: (x) => { evid = x; } });
        body.append(vs.el, gs.el, ev.el); m.foot.append(hbtn('إلغاء', () => m.close()), h('button.btn.btn-primary', { type: 'button', onclick: () => { if (!vs.validate() | !gs.validate() | !ev.validate()) return; vio = vs.get(); ground = gs.get(); evid = ev.get(); step = 1; render(); } }, 'التالي: الفحص الآلي'));
      } else if (step === 1) {
        const cs = runChecks(); const hard = cs.some((c) => !c.ok && c.hard); const any = cs.some((c) => !c.ok);
        body.append(h('div.sap-hp-steps', {}, cs.map((c) => h('div.sap-hp-step.' + (c.ok ? 'is-done' : 'is-bad'), {}, h('span.n', {}, SA.icon(c.ok ? 'check' : 'x', 'icon-sm')), h('div', {}, h('b', {}, c.l))))), hard ? SA.alert('danger', h('b', {}, 'مينفعش تقديم طلب فصل لأن الموظف في إجازة مرضية مثبتة. '), 'يُسجَّل الحظر (HR.DSC.DISMISSAL_BLOCKED) ويُعاد الفحص عند كل خطوة. تزول المانع ← يعود الطلب للمسودة.') : any ? SA.alert('warning', 'أكمل الشروط الناقصة قبل المتابعة.') : SA.alert('success', 'اجتازت الفحوص الآلية. ما تبقى: مراجعة HR (أنت) ثم المراجعة القانونية واعتماد GM.'));
        m.foot.append(hbtn('رجوع', () => { step = 0; render(); }), hard ? h('button.btn.btn-accent', { type: 'button', onclick: () => { const v = find('violations', vio); aud('HR.DSC.DISMISSAL_BLOCKED', 'violation', vio, 'طلب فصل محظور — ' + en(v.employeeId), { result: 'denied', reason: 'إجازة مرضية مثبتة (حظر آلي — مادة 148)', severity: 'critical' }); SA.toast('تم تسجيل الحظر الآلي — لا يمكن المتابعة.', 'error', { ms: 6000 }); m.close(); } }, 'تسجيل الحظر وإغلاق') : h('button.btn.btn-primary', { type: 'button', disabled: any, onclick: () => { step = 2; render(); } }, 'التالي: مراجعة وإرسال'));
      } else {
        const v = find('violations', vio); const e = emp(v.employeeId); const why = SA.form.field({ name: 'w', label: 'ملاحظة مراجعة HR Manager', type: 'textarea', required: true, rows: 2 });
        body.append(SA.kv([['الموظف', e.name], ['الملف', v.id + ' — ' + vTitle(v)], ['سبب الفصل', GROUNDS[+ground]], ['الأدلة', evid]]), h('div.sap-impact', {}, h('b', {}, 'سلسلة الاعتماد'), h('ul', {}, h('li', {}, '1) مراجعة HR Manager — تتم الآن (أنت).'), h('li', {}, '2) المراجعة القانونية — في صندوق الاعتمادات (جهة غير مُعيّنة Open: صاحب الشركة بديل مؤقت).'), h('li', {}, '3) اعتماد GM — في الصندوق.'), h('li', {}, '4) تحضير ملف الدعوى للمحكمة العمالية. الموظف يبقى على وضعه حتى حكم نهائي.'))), why.el, GROUNDS[+ground].indexOf('ضرر جسيم') >= 0 ? SA.alert('warning', 'ضرر جسيم: مهمة إبلاغ الجهات خلال {24 ساعة} [Law] ستُضاف.') : null);
        m.foot.append(hbtn('رجوع', () => { step = 1; render(); }), h('button.btn.btn-accent', { type: 'button', onclick: async () => { if (!why.validate()) return; if (sickLeaveBlock(e.id)) { SA.toast('حظر آلي: إجازة مرضية مثبتة.', 'error'); return; } if (!(await SA.stepUp('policy.change', { force: true, title: 'تأكيد طلب فصل' }))) return; m.setBusy(true);
          try { await SA.api(() => { const id = seqId('dismissals', 'DM', 4, Y()); const ap = SA.requestApproval({ type: 'dismissal_request', title: 'طلب فصل — ملف ' + id + ' (سري T4)', chain: [{ roleId: 'R-01', label: 'الشؤون القانونية — المراجعة القانونية (جهة غير مُعيّنة Open · بديل مؤقت: صاحب الشركة)' }, { roleId: 'R-02', label: 'المدير العام (GM)' }], context: [['الموظف', e.name], ['السبب', GROUNDS[+ground]], ['الملف التأديبي', v.id], ['فحص الإجازة المرضية', 'لا يوجد حظر وقت الطلب'], ['مراجعة HR', why.get()], ['ملاحظة', 'الفصل لا يُنفَّذ إلا بحكم محكمة عمالية نهائي — النص هنا محايد ولا يحمل تفاصيل المخالفة.']], ref: { type: 'dismissal_request', id } });
            st.insert('dismissals', { id, employeeId: e.id, violationId: v.id, ground: +ground, evidence: evid, status: 'legal_review', approvalId: ap.id, hrReview: { by: SA.session.userId, at: new Date().toISOString(), note: why.get() }, legalReviewedAt: null, legalCaseId: null, createdBy: SA.session.userId, createdAt: new Date().toISOString(), log: [{ at: new Date().toISOString(), text: 'مراجعة HR Manager وإرسال للمراجعة القانونية' }] });
            if (+ground === 1) st.insert('regTasks', { id: seqId('regTasks', 'RT', 3, Y()), incidentId: null, title: 'إبلاغ الجهات بواقعة الضرر الجسيم (طلب فصل ' + id + ')', authority: 'الجهات المختصة {Open}', basis: 'Law · Pending', due: null, assignee: SA.session.userId, status: 'open', proof: null, createdAt: new Date().toISOString(), createdBy: SA.session.userId, doneBy: null });
            aud('HR.DSC.DISMISSAL_REQUESTED', 'dismissal', id, 'طلب فصل — ' + e.name, { after: { سبب: GROUNDS[+ground], اعتماد: ap.id }, reason: why.get() }); notify('طلب بانتظار المراجعة', 'ملف جديد بانتظار المراجعة القانونية (N-56).', 'action', ['R-01', 'R-02'], '#/approvals/' + ap.id); });
            m.close(true); SA.toast('أُرسل طلب الفصل (ملف قضية) إلى المراجعة القانونية واعتماد GM', 'success', { ms: 6000 }); } catch (er) { m.setBusy(false); SA.fail(er); } } }, 'إرسال ملف القضية'));
      }
    }
    render(); return m.closed;
  }
  function openDismissal(id) {
    aud('HR.DSC.FILE_READ', 'dismissal', id, 'قراءة طلب فصل ' + id, { severity: 'high' });
    liveDrawer({ title: 'طلب فصل', paths: ['dismissals', 'approvals', 'leaveRequests', 'legalCases'], build() {
      const d = find('dismissals', id); if (!d) return false; const e = emp(d.employeeId); const ap = d.approvalId ? find('approvals', d.approvalId) : null; const sick = sickLeaveBlock(d.employeeId); const lc = d.legalCaseId ? find('legalCases', d.legalCaseId) : null;
      const steps = [['مراجعة HR Manager', !!d.hrReview, d.hrReview ? fd(d.hrReview.at) : ''], ['المراجعة القانونية', !!d.legalReviewedAt || d.status === 'approved', ap && ap.chain[0] ? (ap.chain[0].status === 'approved' ? 'اعتُمد' : ap.chain[0].status === 'rejected' ? 'مرفوض' : 'بانتظار القرار') : ''], ['اعتماد GM', d.status === 'approved' || d.status === 'court', ap && ap.chain[1] ? (ap.chain[1].status === 'approved' ? 'اعتُمد' : ap.chain[1].status === 'rejected' ? 'مرفوض' : 'بانتظار القرار') : ''], ['تحضير ملف الدعوى للمحكمة العمالية', !!lc, lc ? lc.id : ''], ['تنفيذ الإنهاء في HR-23', d.judgment === 'final', 'بحكم نهائي فقط']];
      const firstOpen = steps.findIndex((s) => !s[1]);
      return { title: en(d.employeeId), subtitle: d.id, foot: [ap ? h('a.btn.btn-ghost', { href: SA.link.approval(ap.id) }, SA.icon('inbox', 'icon-sm'), 'فتح في صندوق الاعتمادات') : null, lc ? btn({ label: 'فتح القضية', icon: 'external', kind: 'ghost', perm: 'hr.legal.view', reason: SA.canSensitive('hr.legal.view') ? '' : 'يتطلب hr.legal.view (T4)', onClick: () => SA.nav('hr/disciplinary', { query: { tab: 'legal', open: lc.id } }) }) : null].filter(Boolean),
        body: h('div.sap-drawer-inner', {}, t4Banner(), h('div.sap-hp-row.is-between', {}, empCell(e), stChip(DST, d.status)),
          sick && ['legal_review', 'gm_review', 'blocked'].indexOf(d.status) >= 0 ? SA.alert('danger', h('b', {}, 'حظر آلي: '), 'الموظف في إجازة مرضية مثبتة حتى ' + fd(sick.to) + '. لا يُعتمد طلب الفصل أثناءها — يُعاد الفحص عند كل خطوة.') : null,
          SA.kv([['سبب الفصل (مادة 148)', GROUNDS[d.ground]], ['الملف التأديبي', d.violationId], ['الأدلة', d.evidence], ['طلب الاعتماد', ap ? h('a', { href: SA.link.approval(ap.id) }, ap.id) : '—'], ['مقدّم الطلب', uname(d.createdBy)]]),
          sec('مسار الملف', h('ul.sap-hp-tl', {}, steps.map((s, i) => h('li', { class: s[1] ? 'is-done' : i === firstOpen && d.status !== 'blocked' && d.status !== 'returned' ? 'is-now' : d.status === 'blocked' && i === firstOpen ? 'is-bad' : '' }, h('b', {}, s[0]), h('small', {}, s[2] || ''))))), d.status === 'approved' ? SA.alert('info', 'اعتُمد الطلب. يُحضَّر ملف الدعوى — الفصل لا يُنفَّذ (HR-23) إلا بحكم نهائي مرفوع في الملف.') : null, d.status === 'returned' ? SA.alert('warning', 'أُعيد الطلب لرئيس القسم' + (d.returnReason ? ': ' + d.returnReason : '') + '.') : null) };
    } });
  }
  function tabDismissal(view) {
    return t4gate(() => SA.live(view, () => {
      const t = tcard({ caption: 'طلبات الفصل', rows: () => L('dismissals'), onRowClick: (d) => openDismissal(d.id), columns: [{ key: 'id', label: 'الملف', render: (d) => h('div', {}, h('b', {}, d.id), h('div.sap-hp-note', {}, d.violationId)) }, { key: 'e', label: 'الموظف', render: (d) => empCell(emp(d.employeeId)) }, { key: 'g', label: 'السبب', render: (d) => h('span', { title: GROUNDS[d.ground] }, GROUNDS[d.ground].slice(0, 36) + '…') }, { key: 's', label: 'الحالة', render: (d) => stChip(DST, d.status) }, { key: 'a', label: 'الاعتماد', render: (d) => (d.approvalId ? h('a', { href: SA.link.approval(d.approvalId) }, d.approvalId) : '—') }, { key: 'l', label: 'القضية', render: (d) => d.legalCaseId || '—' }],
        empty: { icon: 'alert', title: 'لا طلبات فصل', text: 'الفصل مسار قضية — يبدأ من الملف التأديبي بعد اكتمال التحقيق.', action: { label: 'طلب فصل جديد', perm: 'hr.disciplinary.create', onClick: () => dismissalWizard() } } });
      return h('div.sap-hp-view', {}, t4Banner(), SA.alert('danger', h('b', {}, 'لا يوجد زر «فصل» في النظام. '), 'الأقصى «طلب فصل» يفتح ملف قضية (حصر 7 أسباب · حظر آلي أثناء الإجازة المرضية المثبتة · HR ← قانوني ← GM) والتنفيذ بحكم نهائي فقط. مصدر مادة 148 ', lawTag('')), t.el, h('div.sap-hp-row', {}, btn({ label: 'طلب فصل جديد', icon: 'plus', kind: 'ghost', perm: 'hr.disciplinary.create', onClick: () => dismissalWizard() }), specLink('m-dsc-09')));
    }, ['dismissals', 'approvals']));
  }

  /* ── سجل القضايا ── */
  function newLegalCase() {
    return formModal({ title: 'قضية قانونية جديدة', icon: 'doc', size: 'md', submitLabel: 'فتح القضية',
      fields: [{ name: 'court', label: 'المحكمة / الجهة', required: true, value: 'المحكمة العمالية — المنصورة (تجريبي)' }, { name: 'no', label: 'رقم القضية', required: true }, { name: 'subject', label: 'الموضوع', required: true }, { name: 'plaintiff', label: 'المدّعي', required: true }, { name: 'defendant', label: 'المدّعى عليه', required: true, value: 'الشركة' }, { name: 'claim', label: 'المبلغ المطالب به (ج.م)', type: 'number', min: 0 }, { name: 'lawyer', label: 'المحامي', required: true }],
      onSubmit: (v) => { const id = seqId('legalCases', 'LGL', 4, Y()); st.insert('legalCases', { id, court: v.court, caseNo: v.no, subject: v.subject, plaintiff: v.plaintiff, defendant: v.defendant, claim: v.claim || 0, lawyer: v.lawyer, status: 'open', hearings: [], outcome: null, provision: null, source: 'manual', openedAt: new Date().toISOString() }); aud('HR.DSC.LEGAL_CASE_OPENED', 'legal_case', id, v.subject, { after: { محكمة: v.court } }); notify('قضية جديدة', 'سُجّلت قضية جديدة في السجل القانوني (N-35).', 'action', ['R-01', 'R-02'], '#/hr/disciplinary?tab=legal'); SA.toast('فُتحت القضية', 'success'); } });
  }
  function logHearing(c) {
    return formModal({ title: 'تسجيل جلسة — ' + c.id, icon: 'clock', size: 'sm', submitLabel: 'تسجيل',
      fields: [{ name: 'date', label: 'تاريخ الجلسة', type: 'date', required: true, value: D(14) }, { name: 'note', label: 'ملاحظة', required: true }, { name: 'res', label: 'نتيجة الجلسة (إن انعقدت)' }],
      onSubmit: (v) => { st.patch('legalCases', c.id, (x) => ({ hearings: x.hearings.concat([{ date: v.date, result: v.res || null, note: v.note }]), status: v.date >= T() ? 'hearing_scheduled' : x.status })); aud('HR.DSC.LEGAL_HEARING_LOGGED', 'legal_case', c.id, c.subject, { after: { جلسة: v.date } }); SA.toast('سُجّلت الجلسة — تذكير قبل 7 أيام ويومين (N-35)', 'success'); } });
  }
  function legalOutcome(c) {
    return formModal({ title: 'تسجيل نتيجة / حكم — ' + c.id, icon: 'checkcircle', size: 'sm', submitLabel: 'تسجيل النتيجة', step: 'policy.change',
      fields: [{ name: 'out', label: 'النتيجة', type: 'radio', required: true, options: [['for_company', 'حكم لصالح الشركة (نهائي)'], ['against_company', 'حكم ضد الشركة'], ['settlement', 'تسوية ودّية'], ['appeal', 'استئناف']] }, { name: 'prov', label: 'المخصص المالي (ج.م) — إن وُجد', type: 'number', min: 0, hint: 'يُرسل للمالية. الاحتساب {Open}.' }, { name: 'note', label: 'ملاحظات', type: 'textarea', rows: 2 }],
      onSubmit: (v) => { st.patch('legalCases', c.id, { outcome: v.out, provision: v.prov == null ? null : v.prov, status: v.out === 'appeal' ? 'appeal' : v.out === 'settlement' || v.out === 'for_company' || v.out === 'against_company' ? 'judgment' : c.status, outcomeNote: v.note });
        const dm = L('dismissals').find((d) => d.legalCaseId === c.id); if (dm && v.out === 'for_company') { st.patch('dismissals', dm.id, { judgment: 'final', status: 'court' }); notify('حكم نهائي', 'صدر حكم نهائي في ملف طلب فصل — يمكن بدء الإنهاء في HR-23.', 'action', ['R-11'], '#/hr/termination'); }
        aud('HR.DSC.LEGAL_OUTCOME_RECORDED', 'legal_case', c.id, c.subject, { after: { نتيجة: v.out } }); if (v.out === 'against_company') notify('حكم ضد الشركة', 'يلزم تجنيب مخصص مالي — راجع المالية.', 'action', ['R-07'], '#/hr/disciplinary?tab=legal'); SA.toast('سُجّلت النتيجة', 'success'); } });
  }
  function openLegal(id) {
    aud('HR.DSC.FILE_READ', 'legal_case', id, 'قراءة قضية ' + id, { severity: 'high' });
    liveDrawer({ title: 'ملف قضية', paths: ['legalCases'], build() { const c = find('legalCases', id); if (!c) return false;
      return { title: c.subject, subtitle: c.id + ' · ' + c.caseNo, foot: [btn({ label: 'تسجيل جلسة', icon: 'clock', kind: 'ghost', perm: 'hr.legal.view', onClick: () => logHearing(c) }), btn({ label: 'تسجيل نتيجة / حكم', icon: 'checkcircle', kind: 'primary', perm: 'hr.legal.view', onClick: () => legalOutcome(c) })], body: h('div.sap-drawer-inner', {}, t4Banner(), h('div.sap-hp-row.is-between', {}, stChip(LST, c.status), c.source === 'dismissal' ? SA.chip('من طلب فصل ' + c.dismissalId, 'info') : null),
        SA.kv([['المحكمة', c.court], ['المدّعي', c.plaintiff], ['المدّعى عليه', c.defendant], ['المبلغ المطالب به', c.claim ? money(c.claim) : '—'], ['المحامي', c.lawyer], ['المخصص المالي', c.provision == null ? openTag('غير مُعدّ') : money(c.provision)], ['النتيجة', c.outcome ? ({ for_company: 'حكم لصالح الشركة', against_company: 'حكم ضد الشركة', settlement: 'تسوية', appeal: 'استئناف' })[c.outcome] : '—']]),
        sec('الجلسات', c.hearings.length ? h('ul.sap-hp-tl', {}, c.hearings.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((x) => { const left = dd(T(), x.date); return h('li', { class: x.result ? 'is-done' : 'is-now' }, h('b', {}, fd(x.date) + (x.result ? ' — ' + x.result : left >= 0 ? ' — بعد ' + left + ' يوم' : '')), h('small', {}, x.note || '')); })) : h('p.sap-hp-note', {}, 'لا جلسات مسجّلة.'))) }; } });
  }
  function tabLegal(view, api, ctx) {
    const g = SA.guard('hr.legal.view', { title: 'سجل القضايا سري (T4)', text: 'يتطلب صلاحية hr.legal.view — تُمنح صراحةً (قرار 46). مدير الموارد البشرية لا يملكها تلقائيًا.', home: false }); if (g) return g;
    if (ctx && ctx.params && ctx.params.open && find('legalCases', ctx.params.open)) setTimeout(() => openLegal(ctx.params.open), 50);
    return SA.live(view, () => { const t = tcard({ caption: 'سجل القضايا القانونية', rows: () => L('legalCases'), onRowClick: (c) => openLegal(c.id), search: { placeholder: 'ابحث…', keys: ['id', 'subject', 'caseNo'] }, columns: [{ key: 'id', label: 'القضية', render: (c) => h('div', {}, h('b', {}, c.id), h('div.sap-hp-note', {}, c.caseNo)) }, { key: 'sub', label: 'الموضوع', render: (c) => c.subject }, { key: 'court', label: 'المحكمة', render: (c) => c.court }, { key: 'next', label: 'الجلسة القادمة', render: (c) => { const nx = c.hearings.filter((x) => !x.result && x.date >= T()).sort((a, b) => (a.date > b.date ? 1 : -1))[0]; if (!nx) return '—'; const left = dd(T(), nx.date); return SA.chip(fd(nx.date) + ' (' + left + ' ي)', left <= 2 ? 'danger' : left <= 7 ? 'warning' : 'info'); } }, { key: 'st', label: 'الحالة', render: (c) => stChip(LST, c.status) }], empty: { icon: 'doc', title: 'لا قضايا', text: 'تُفتح من ملف طلب فصل معتمد أو يدويًا.', action: { label: 'قضية جديدة', perm: 'hr.legal.view', onClick: newLegalCase } } });
      return h('div.sap-hp-view', {}, t4Banner(), t.el, h('div.sap-hp-row', {}, btn({ label: 'قضية جديدة', icon: 'plus', kind: 'ghost', perm: 'hr.legal.view', onClick: newLegalCase }), specLink('m-dsc-10'))); }, ['legalCases']);
  }

  const dscBadge = () => { if (!T4()) return null; const n = L('violations').filter((v) => v.status === 'reported').length; return n || null; };
  screen({ id: 'hr-disciplinary', route: 'hr/disciplinary', perm: 'hr.disciplinary.view', title: 'الجزاءات والتظلمات', icon: 'alert', order: 43, desc: 'بلاغ المخالفة ← تحقيق مكتوب ← سماع ← قرار من كتالوج اللائحة بسقف خصم لا يُتجاوز ← تظلم. الفصل ملف قضية لا زر. كل البيانات T4.', watch: ['violations'], badge: dscBadge, tags: () => [SA.tag('new', 'HR-20'), SA.chip('T4 سري جدًا', 'danger')],
    tabs: [
      { id: 'cases', label: 'الملفات التأديبية', icon: 'alert', render: tabCases, primary: () => btn({ label: 'بلاغ مخالفة / ملاحظة', icon: 'plus', kind: 'accent', perm: 'hr.disciplinary.create', onClick: () => reportViolation() }), badge: () => (T4() ? L('violations').filter((v) => v.status === 'reported').length || null : null) },
      { id: 'catalog', label: 'الكتالوج واللائحة', icon: 'list', render: tabCatalog },
      { id: 'grievances', label: 'التظلمات', icon: 'userx', render: tabGrievances, badge: () => (T4() ? L('grievances').filter((g) => ['filed', 'under_review'].indexOf(g.stage) >= 0).length || null : null) },
      { id: 'harassment', label: 'شكاوى التحرش', icon: 'shield', render: tabHarassment },
      { id: 'dismissal', label: 'طلبات الفصل', icon: 'doc', render: tabDismissal, primary: () => btn({ label: 'طلب فصل (ملف قضية)', icon: 'plus', kind: 'accent', perm: 'hr.disciplinary.create', onClick: () => dismissalWizard() }) },
      { id: 'legal', label: 'سجل القضايا', icon: 'layers', render: (view, api) => tabLegal(view, api, api.ctx) }
    ] });

  /* ═════════════════════════════ HR-21 · السلامة والصحة المهنية ═════════════════════════════ */
  const INC_ST = { reported: ['مُبلَّغ', 'warning'], classified: ['مُصنَّف', 'info'], investigating: ['قيد التحقيق', 'info'], capa: ['إجراءات مفتوحة (CAPA)', 'warning'], closed: ['مُغلق', 'success'] };
  const INC_TYPE = { near_miss: 'شبه حادث', injury: 'إصابة', damage: 'تلف / حريق / تسريب', unsafe: 'حالة غير آمنة' };
  const CAPA_ST = { open: ['مفتوح', 'warning'], in_progress: ['قيد التنفيذ', 'info'], awaiting_verification: ['بانتظار التحقق', 'warning'], closed: ['مغلق', 'success'] };
  const RT_ST = { open: ['مفتوحة', 'warning'], proof: ['إثبات بانتظار المراجعة', 'info'], done: ['أُنجزت بإثبات', 'success'] };
  const PPE_C = { ok: ['سليم', 'success'], replace: ['بحاجة استبدال', 'warning'], missing: ['مفقود', 'danger'] };
  const FIT_C = { fit: 'success', fit_restricted: 'warning', unfit: 'danger', expired: 'danger', none: 'neutral' };
  const LOCS = ['خط الألومنيوم', 'خط uPVC', 'الدهان والتشطيب', 'خط التركيب', 'منطقة التحميل', 'المخزن', 'مكاتب الإدارة', 'أخرى'];
  const MED = () => SA.canSensitive('hr.medical.view');
  const personCell = (id) => (!id ? '—' : MED() ? en(id) : h('span.sap-hp-secret', {}, SA.icon('lock', 'icon-sm'), 'مصاب — مخفي (T4)'));
  const needOhs = () => (SA.can('hr.ohs.edit') ? '' : NOPERM('hr.ohs.edit'));
  const isLtiSev = (s) => s === 'injury_lti' || s === 'serious' || s === 'fatal';
  const fitChip = (f) => SA.chip(f.label, FIT_C[f.status]);
  const capaOverdue = (c) => c.status !== 'closed' && c.dueOn && c.dueOn < T();
  const allCapas = () => L('incidents').reduce((a, i) => a.concat((i.capas || []).map((c) => Object.assign({ incidentId: i.id }, c))), []);
  const patchInc = (id, fn) => st.patch('incidents', id, fn);

  /* ── بلاغ حادث ── */
  function reportIncident() {
    let injWrap = null;
    return formModal({ title: 'بلاغ حادث / شبه حادث', subtitle: 'ثلاثة حقول إلزامية فقط: النوع · المكان · وصف قصير. الباقي اختياري. شبه الحادث سجل رسمي (كثرته مؤشر صحي).', icon: 'alert', size: 'md', submitLabel: 'إرسال البلاغ',
      fields: [{ name: 'type', label: 'النوع', type: 'radio', required: true, value: 'near_miss', options: Object.keys(INC_TYPE).map((k) => [k, INC_TYPE[k]]), onChange: (v) => { if (injWrap) injWrap.el.style.display = v === 'injury' ? '' : 'none'; } }, { name: 'loc', label: 'المكان / الخط', type: 'select', required: true, options: [['', 'اختر…']].concat(LOCS.map((l) => [l, l])) }, { name: 'desc', label: 'وصف قصير', type: 'textarea', required: true, rows: 3 },
        { name: 'when', label: 'وقت الواقعة', type: 'date', value: T(), max: T(), hint: 'يُحفظ وقت الواقعة الأصلي حتى لو أُرسل لاحقًا بدون إنترنت.' }, { name: 'person', label: 'المصاب (اختياري)', type: 'select', options: empOpts((e) => OPS.indexOf(e.id) >= 0 || e.departmentId === 'D-13') }, { name: 'witness', label: 'شهود (اختياري)' }, { name: 'photo', label: 'إرفاق صورة (محاكاة — حد الحجم {Open})', type: 'switch', hint: 'صور الإصابات تُصنَّف T4 ولا تظهر في السجل العام.' }],
      onOpen: (by) => { injWrap = by.person; injWrap.el.style.display = 'none'; },
      onSubmit: (v) => { const id = seqId('incidents', 'INC', 4, Y()); const inj = v.type === 'injury'; st.insert('incidents', { id, type: v.type, severity: inj ? 'first_aid' : 'near_miss', classified: false, occurredAt: new Date(v.when + 'T12:00:00').toISOString(), reportedAt: new Date().toISOString(), location: v.loc, description: v.desc.trim() + (v.witness ? ' — شهود: ' + v.witness : ''), reporterId: SA.session.userId, personId: v.person || null, bodyPart: '', photos: v.photo ? 1 : 0, recordable: false, lostDays: 0, status: 'reported', serious: false, investigation: null, capas: [], injury: null });
        aud('HR.OHS.INCIDENT_REPORTED', 'incident', id, INC_TYPE[v.type] + ' — ' + v.loc, { after: { نوع: INC_TYPE[v.type], مكان: v.loc } }); notify(inj ? 'بلاغ إصابة — فوري' : 'بلاغ سلامة جديد', inj ? 'سُجّل بلاغ إصابة. اطلب الإسعاف الآن (N-32).' : 'سُجّل شبه حادث/حالة غير آمنة (N-33).', inj ? 'urgent' : 'info', ['R-15', 'R-11', 'R-05'], '#/hr/ohs?tab=incidents'); SA.toast(inj ? 'أُرسل البلاغ — اطلب الإسعاف الآن' : 'أُرسل البلاغ', inj ? 'warn' : 'success', { ms: 6000 }); } });
  }
  function classifyModal(i) {
    return formModal({ title: 'تصنيف الشدة — ' + i.id, subtitle: 'تعريف «الجسيم» لسه Open (D11): التصنيف يدوي مع تحذير. «القابلة للتسجيل» يحددها OHS.', icon: 'gauge', size: 'sm', submitLabel: 'حفظ التصنيف',
      fields: [{ name: 'sev', label: 'الشدة', type: 'select', required: true, value: i.severity, options: [['', 'اختر…']].concat(Object.keys(SEV_INC).map((k) => [k, SEV_INC[k][0]])) }, { name: 'rec', label: 'قابلة للتسجيل (recordable)', type: 'switch', value: i.recordable, hint: 'التعريف {Open} — يحدده مسؤول السلامة لكل بلاغ.' }, { name: 'lost', label: 'أيام فقد الوقت (إن وُجدت)', type: 'number', min: 0, value: i.lostDays || 0, hint: 'لا يُحتسب يوم الإصابة (التعريف {Open}).' }, SA.alert('warning', 'تصنيف «جسيمة» أو «وفاة» أو «مرض مهني» يطلق مهام الإخطار التنظيمي وN-32 للمدير العام.')],
      check: (v) => (isLtiSev(v.sev) && !v.lost && v.sev === 'injury_lti' ? { lost: 'إصابة فقد الوقت لازم يكون لها أيام فقد ≥ 1.' } : null),
      onSubmit: (v) => { const before = { شدة: SEV_INC[i.severity][0], قابلة_للتسجيل: i.recordable }; const serious = ['serious', 'fatal', 'disease'].indexOf(v.sev) >= 0; const injury = ['first_aid', 'injury_no_lt', 'injury_lti', 'serious', 'fatal'].indexOf(v.sev) >= 0;
        patchInc(i.id, (x) => ({ severity: v.sev, recordable: !!v.rec, lostDays: +v.lost || 0, serious, classified: true, status: x.status === 'reported' ? 'classified' : x.status, injury: injury ? (x.injury || { firstAidAt: new Date().toISOString(), facility: '', insuranceTaskId: null, returnToWorkAt: null, lostDays: +v.lost || 0 }) : x.injury }));
        aud('HR.OHS.INCIDENT_CLASSIFIED', 'incident', i.id, i.id, { before, after: { شدة: SEV_INC[v.sev][0], قابلة_للتسجيل: !!v.rec, أيام_فقد: +v.lost || 0 } });
        const cur = find('incidents', i.id);
        if (injury && !cur.injury.insuranceTaskId) { const rid = seqId('regTasks', 'RT', 3, Y()); st.insert('regTasks', { id: rid, incidentId: i.id, title: 'إخطار التأمينات الاجتماعية بإصابة العمل (' + i.id + ')', authority: 'هيئة التأمينات الاجتماعية', basis: 'مادة 63 قانون 148/2019 — Pending', due: null, assignee: SA.session.userId, status: 'open', proof: null, createdAt: new Date().toISOString(), createdBy: SA.session.userId, doneBy: null }); patchInc(i.id, (x) => ({ injury: Object.assign({}, x.injury, { insuranceTaskId: rid }) })); aud('HR.OHS.INJURY_CASE_OPENED', 'incident', i.id, i.id, { after: { مهمة_إخطار: rid } }); aud('HR.OHS.REGTASK_CREATED', 'regtask', rid, 'إخطار التأمينات', { after: { موعد: 'غير مُعدّ (Open)' } }); }
        if (serious) { const rid = seqId('regTasks', 'RT', 3, Y()); st.insert('regTasks', { id: rid, incidentId: i.id, title: 'إخطار الجهة المختصة بالسلامة بحادث جسيم/مرض مهني (' + i.id + ')', authority: 'الجهة المختصة {Open}', basis: 'قرارات 248–252/2026 — غير متحقق', due: null, assignee: SA.session.userId, status: 'open', proof: null, createdAt: new Date().toISOString(), createdBy: SA.session.userId, doneBy: null }); aud('HR.OHS.REGTASK_CREATED', 'regtask', rid, 'إخطار الجهة المختصة', { after: { موعد: 'غير مُعدّ (Open)' } }); notify('حادث جسيم — فوري', 'صُنّف حادث على أنه جسيم. راجع مهام الإخطار (N-32).', 'urgent', ['R-02', 'R-11', 'R-15'], '#/hr/ohs?tab=regulatory'); }
        else if (injury) notify('تصنيف إصابة', 'صُنّفت إصابة عمل — راجع مسار الإصابة (N-32).', 'urgent', ['R-15', 'R-11'], '#/hr/ohs?tab=incidents');
        SA.toast('تم التصنيف' + (serious ? ' وأُنشئت مهام الإخطار' : ''), 'success'); } });
  }
  function saveInvestigation(i) {
    const inv = i.investigation || {};
    return formModal({ title: 'التحقيق والسبب الجذري — ' + i.id, subtitle: 'تحليل «5 لماذا» وتحديد فئة السبب (إنسان · ماكينة · طريقة · بيئة). الهدف: خلال 72 ساعة (موصى به).', icon: 'search', size: 'md', submitLabel: 'حفظ التحقيق',
      fields: [{ name: 'causes', label: 'الأسباب الجذرية (سطر لكل سبب)', type: 'textarea', required: true, rows: 4, value: (inv.causes || []).join('\n') }, { name: 'cat', label: 'فئة السبب', type: 'select', required: true, value: inv.category || '', options: [['', 'اختر…'], ['إنسان', 'إنسان'], ['ماكينة', 'ماكينة'], ['طريقة', 'طريقة'], ['بيئة', 'بيئة']] }, SA.alert('info', 'مخالفة تعليمات سلامة معلنة؟ الإحالة لـHR-20 يدوية وبدون بيانات طبية — ولا تُوسم آليًا (قد تؤثر على استحقاقات الإصابة).')],
      onSubmit: (v) => { patchInc(i.id, (x) => ({ investigation: { causes: v.causes.split('\n').map((s) => s.trim()).filter(Boolean), category: v.cat, investigatorId: SA.session.userId, completedAt: new Date().toISOString() }, status: x.status === 'closed' ? 'closed' : (x.capas && x.capas.length ? 'capa' : 'investigating') })); aud('HR.OHS.INVESTIGATION_SAVED', 'incident', i.id, i.id, { after: { فئة: v.cat } }); SA.toast('حُفظ التحقيق (DOC-HR-36)', 'success'); } });
  }
  function addCapa(i) {
    const ownerOpts = [['', 'اختر مالك الإجراء…']].concat((st.get('users') || []).filter((u) => u.status === 'active' && ['R-05', 'R-15', 'R-14', 'R-11', 'R-06'].indexOf(u.roleId) >= 0).map((u) => [u.id, u.name + ' — ' + SA.roleName(u.roleId)]));
    return formModal({ title: 'إجراء تصحيحي / وقائي (CAPA) — ' + i.id, icon: 'check', size: 'md', submitLabel: 'إضافة الإجراء',
      fields: [{ name: 'type', label: 'النوع', type: 'radio', required: true, value: 'corrective', options: [['corrective', 'تصحيحي'], ['preventive', 'وقائي']] }, { name: 'desc', label: 'وصف الإجراء', type: 'textarea', required: true, rows: 2 }, { name: 'owner', label: 'المالك', type: 'select', required: true, options: ownerOpts }, { name: 'due', label: 'الموعد', type: 'date', required: true, value: D(7) }, { name: 'train', label: 'يتطلب تدريبًا (احتياج في HR-19)', type: 'switch' }],
      check: (v) => (v.due <= T() ? { due: 'الموعد لازم يكون بعد اليوم.' } : null),
      onSubmit: (v) => { const cid = 'CAPA-' + String((i.capas || []).length + 1).padStart(2, '0'); patchInc(i.id, (x) => ({ capas: (x.capas || []).concat([{ id: cid, type: v.type, description: v.desc.trim(), ownerId: v.owner, dueOn: v.due, status: 'open', evidence: null, verifiedAt: null }]), status: x.status === 'closed' ? 'closed' : 'capa' })); aud('HR.OHS.CAPA_CREATED', 'incident', i.id, cid + ' — ' + v.desc.trim().slice(0, 40), { after: { مالك: uname(v.owner), موعد: v.due } });
        if (v.train) { st.insert('trainingNeeds', { id: seqId('trainingNeeds', 'TN', 4, Y()), employeeId: i.personId, need: 'تدريب من CAPA: ' + v.desc.trim().slice(0, 50), courseId: null, source: 'capa', sourceRef: i.id, priority: 'high', status: 'proposed', sessionId: null, createdAt: new Date().toISOString() }); aud('HR.TRN.NEED_CREATED', 'training_need', i.id, 'احتياج من CAPA', { after: { مصدر: i.id } }); }
        notify('إجراء تصحيحي جديد', 'أُسند لك إجراء تصحيحي بموعد ' + fd(v.due) + ' (N-33).', 'action', [], '#/hr/ohs?tab=incidents', [v.owner]); SA.toast('أُضيف الإجراء', 'success'); } });
  }
  function capaStep(i, c) {
    if (c.status === 'open') return run(() => patchInc(i.id, (x) => ({ capas: x.capas.map((k) => (k.id === c.id ? Object.assign({}, k, { status: 'in_progress' }) : k)) }))).then(() => SA.toast('بدأ التنفيذ', 'success'));
    if (c.status === 'in_progress') return formModal({ title: 'رفع إثبات التنفيذ', subtitle: c.description, icon: 'upload', size: 'sm', submitLabel: 'إرسال للتحقق', fields: [{ name: 'ev', label: 'الإثبات (محاكاة رفع)', required: true, placeholder: 'صور / محضر التنفيذ' }], onSubmit: (v) => { patchInc(i.id, (x) => ({ capas: x.capas.map((k) => (k.id === c.id ? Object.assign({}, k, { status: 'awaiting_verification', evidence: v.ev }) : k)) })); SA.toast('بانتظار التحقق من الفعالية', 'success'); } });
    if (c.status === 'awaiting_verification') return confirmAct({ title: 'التحقق من فعالية الإجراء', text: c.description, confirmLabel: 'تحقق وإغلاق الإجراء', impact: ['يُغلق الإجراء ويُسجَّل التحقق.', 'لا يُغلق الحادث قبل التحقق من كل الإجراءات.'], run: () => { patchInc(i.id, (x) => ({ capas: x.capas.map((k) => (k.id === c.id ? Object.assign({}, k, { status: 'closed', verifiedAt: new Date().toISOString() }) : k)) })); aud('HR.OHS.CAPA_VERIFIED', 'incident', i.id, c.id, { after: { تحقق: 'تم' } }); }, success: 'تم التحقق وإغلاق الإجراء' });
  }
  function closeIncident(i) {
    const open = (i.capas || []).filter((c) => c.status !== 'closed');
    if (!i.investigation) { SA.toast('لا إغلاق قبل حفظ التحقيق.', 'error'); return; }
    if (open.length) { SA.toast('لا إغلاق حادث قبل تنفيذ والتحقق من فعالية كل CAPA (متبقي ' + open.length + ').', 'error', { ms: 6000 }); return; }
    return confirmAct({ title: 'إغلاق الحادث ' + i.id, confirmLabel: 'إغلاق الحادث', impact: ['كل الإجراءات التصحيحية متحقَّق منها.', 'يتحول الحادث إلى «مُغلق» ويظل في السجل.'], run: () => { patchInc(i.id, { status: 'closed' }); aud('HR.OHS.INCIDENT_CLOSED', 'incident', i.id, i.id, { after: { حالة: 'مغلق' } }); }, success: 'أُغلق الحادث' });
  }
  function updateLost(i) {
    const lv = L('leaveRequests').find((r) => r.employeeId === i.personId && /sick|injury/.test(r.type || '') && r.status === 'approved' && String(r.from).slice(0, 10) >= String(i.occurredAt).slice(0, 10));
    return formModal({ title: 'تحديث أيام فقد الوقت — ' + i.id, subtitle: lv ? 'وُجدت إجازة مرتبطة (' + lv.id + ' — ' + lv.days + ' يوم).' : 'لا إجازة مرتبطة في HR-11 — إدخال يدوي.', icon: 'clock', size: 'sm', submitLabel: 'تحديث',
      fields: [{ name: 'lost', label: 'أيام فقد الوقت', type: 'number', required: true, min: 0, value: lv ? Math.max(0, lv.days - 1) : (i.injury && i.injury.lostDays) || i.lostDays || 0, hint: 'لا يُحتسب يوم الإصابة (التعريف {Open}).' }, { name: 'rtw', label: 'تاريخ العودة للعمل (اختياري)', type: 'date' }],
      onSubmit: (v) => { patchInc(i.id, (x) => ({ lostDays: v.lost, injury: Object.assign({}, x.injury, { lostDays: v.lost, returnToWorkAt: v.rtw || (x.injury && x.injury.returnToWorkAt) || null }) })); aud('HR.OHS.LOST_TIME_UPDATED', 'incident', i.id, i.id, { before: { أيام: i.lostDays }, after: { أيام: v.lost } }); notify('تحديث إصابة عمل', 'تحدّثت أيام فقد الوقت لحادث ' + i.id + ' (N-34).', 'info', ['R-15', 'R-11'], '#/hr/ohs?tab=incidents'); SA.toast('تم التحديث — تتحدّث مؤشرات LTIFR فورًا', 'success'); } });
  }
  function openIncident(id) {
    liveDrawer({ title: 'ملف الحادث', paths: ['incidents', 'regTasks'], build() {
      const i = find('incidents', id); if (!i) return false; const sv = SEV_INC[i.severity] || ['—', 'neutral']; const inj = i.injury; const task = inj && inj.insuranceTaskId ? find('regTasks', inj.insuranceTaskId) : null; const hrs = dd(String(i.reportedAt).slice(0, 10), T()) * 24;
      const foot = []; const cantEdit = needOhs();
      if (i.status !== 'closed') { foot.push(btn({ label: 'تصنيف الشدة', icon: 'gauge', kind: 'ghost', reason: cantEdit, onClick: () => classifyModal(i) }), btn({ label: 'التحقيق', icon: 'search', kind: 'ghost', reason: cantEdit || (i.classified === false && i.status === 'reported' ? 'صنّف الشدة أولًا' : ''), onClick: () => saveInvestigation(i) }), btn({ label: 'إجراء CAPA', icon: 'plus', kind: 'ghost', reason: cantEdit, onClick: () => addCapa(i) }), btn({ label: 'إغلاق الحادث', icon: 'check', kind: 'primary', reason: cantEdit, onClick: () => closeIncident(i) })); }
      return { title: i.id + ' — ' + INC_TYPE[i.type], subtitle: i.location + ' · ' + fd(i.occurredAt), foot, body: h('div.sap-drawer-inner', {},
        h('div.sap-hp-row.is-between', {}, h('span.sap-hp-pills', {}, SA.chip(sv[0], sv[1]), i.recordable ? SA.chip('قابلة للتسجيل', 'warning') : null, i.serious ? SA.chip('جسيمة', 'danger') : null), stChip(INC_ST, i.status)),
        i.classified === false ? SA.alert('warning', 'بانتظار التصنيف من مسؤول السلامة — الشدة الحالية مؤقتة.') : null,
        SA.kv([['الوصف', i.description], ['المُبلِّغ', uname(i.reporterId)], ['وقت الواقعة', fd(i.occurredAt)], ['وقت البلاغ', SA.fmt.dt(i.reportedAt)], ['المصاب', personCell(i.personId)], i.personId && i.bodyPart ? ['الإصابة', MED() ? i.bodyPart : secret('T4')] : null, ['الصور', i.photos ? (i.type === 'injury' && !MED() ? secret('صور الإصابة T4') : h('div.sap-hp-pills', {}, Array.from({ length: i.photos }, () => h('div.sap-hp-photo', {}, 'صورة (placeholder)')))) : 'لا صور'], ['أيام فقد الوقت', isLtiSev(i.severity) ? N(i.lostDays || 0) : '—']]),
        i.status === 'reported' && hrs > 24 ? SA.alert('warning', 'تجاوز البلاغ 24 ساعة بدون فرز (تقرير OHS الموصى به خلال 24 ساعة).') : null,
        i.investigation ? sec('التحقيق والسبب الجذري', SA.kv([['الفئة', i.investigation.category], ['الأسباب', h('ul', { style: { margin: 0, paddingInlineStart: '18px' } }, i.investigation.causes.map((c) => h('li', {}, c)))], ['المحقق', uname(i.investigation.investigatorId)]])) : (i.classified === false ? null : sec('التحقيق', h('p.sap-hp-note', {}, 'لم يُحفظ تحقيق بعد — المطلوب خلال 72 ساعة (موصى به).'))),
        sec('الإجراءات التصحيحية والوقائية (CAPA)', (i.capas || []).length ? h('div.sap-hp-steps', {}, i.capas.map((c) => h('div.sap-hp-step', { class: c.status === 'closed' ? 'is-done' : capaOverdue(c) ? 'is-bad' : '' }, h('span.n', {}, c.status === 'closed' ? SA.icon('check', 'icon-sm') : c.id.slice(-2)), h('div', {}, h('b', {}, c.description), h('small', {}, (c.type === 'corrective' ? 'تصحيحي' : 'وقائي') + ' · المالك: ' + uname(c.ownerId) + ' · الموعد ' + fd(c.dueOn) + (capaOverdue(c) ? ' — متأخر' : '')), h('div.sap-hp-row', { style: { marginTop: '6px' } }, stChip(CAPA_ST, c.status), c.status !== 'closed' ? btn({ label: c.status === 'open' ? 'بدء التنفيذ' : c.status === 'in_progress' ? 'رفع الإثبات' : 'تحقق من الفعالية', kind: 'ghost', size: 'sm', reason: cantEdit, onClick: () => capaStep(i, c) }) : null))))) : h('p.sap-hp-note', {}, 'لا إجراءات بعد. لا يُغلق الحادث قبل تنفيذ والتحقق من كل إجراء.')),
        inj ? sec('مسار إصابة العمل (T4)', SA.kv([['إسعاف أولي', fd(inj.firstAidAt)], ['جهة العلاج', inj.facility || '—'], ['إخطار التأمينات', task ? h('span', {}, stChip(RT_ST, task.status), ' ', h('a', { href: SA.href('hr/ohs?tab=regulatory') }, task.id), ' ', SA.tag('open', 'الموعد Open')) : '—'], ['أيام فقد الوقت', N(inj.lostDays || 0)], ['العودة للعمل', inj.returnToWorkAt ? fd(inj.returnToWorkAt) : '—']]), btn({ label: 'تحديث أيام فقد الوقت', icon: 'clock', kind: 'ghost', size: 'sm', reason: cantEdit, onClick: () => updateLost(i) }), h('p.sap-hp-note', {}, 'النظام يدير المهمة والإثبات ولا يرسل للجهة. الإسعاف الأولي فورًا حتى لو واصل العمل.')) : null) };
    } });
  }
  function tabIncidents(view) {
    return SA.live(view, () => {
      const t = tcard({ caption: 'سجل الحوادث', rows: () => L('incidents'), search: { placeholder: 'ابحث بالرقم أو المكان…', keys: ['id', 'location', 'description'] }, filters: [{ key: 'severity', label: 'الشدة', options: Object.keys(SEV_INC).map((k) => [k, SEV_INC[k][0]]) }, { key: 'status', label: 'الحالة', options: Object.keys(INC_ST).map((k) => [k, INC_ST[k][0]]) }], onRowClick: (i) => openIncident(i.id), initial: { sort: { key: 'when', dir: 'desc' } },
        columns: [{ key: 'id', label: 'البلاغ', render: (i) => h('div', {}, h('b', {}, i.id), h('div.sap-hp-note', {}, INC_TYPE[i.type])) }, { key: 'when', label: 'الواقعة', sort: true, value: (i) => i.occurredAt, render: (i) => fd(i.occurredAt) }, { key: 'loc', label: 'المكان', render: (i) => i.location }, { key: 'sev', label: 'الشدة', render: (i) => stChip(SEV_INC, i.severity) }, { key: 'p', label: 'المصاب', render: (i) => (i.personId ? personCell(i.personId) : '—') }, { key: 'capa', label: 'CAPA', render: (i) => { const o = (i.capas || []).filter((c) => c.status !== 'closed').length; return o ? SA.chip(o + ' مفتوح', 'warning') : (i.capas || []).length ? SA.chip('مكتمل', 'success') : '—'; } }, { key: 'st', label: 'الحالة', render: (i) => stChip(INC_ST, i.status) }],
        empty: { icon: 'shield', title: 'لا بلاغات', text: 'أي موظف يستطيع البلاغ بثلاث خطوات.', action: { label: 'بلاغ حادث', onClick: reportIncident } } });
      return h('div.sap-hp-view', {}, t.el, h('p.sap-hp-note', {}, 'الحقول الطبية لا تظهر في أي قائمة أو إشعار. ', specLink('m-ohs-03')));
    }, ['incidents']);
  }

  /* ── اللياقة الطبية ── */
  let fitReadLogged = false;
  function recordFitness() {
    return formModal({ title: 'تسجيل نتيجة لياقة طبية', subtitle: 'التقرير T4. الحالة المشتقة (لائق/لائق بقيود/غير لائق/منتهي) بلا تشخيص هي التي يراها المشرف.', icon: 'shield', size: 'md', submitLabel: 'تسجيل النتيجة',
      fields: [{ name: 'emp', label: 'الموظف', type: 'select', required: true, options: empOpts((e) => OPS.indexOf(e.id) >= 0 || e.departmentId === 'D-13') }, { name: 'type', label: 'النوع', type: 'select', value: 'periodic', options: [['pre', 'قبل التعيين'], ['periodic', 'دوري'], ['post_incident', 'بعد إصابة/غياب طويل']] }, { name: 'res', label: 'النتيجة', type: 'radio', required: true, options: [['fit', 'لائق'], ['fit_restricted', 'لائق بقيود'], ['unfit', 'غير لائق']] }, { name: 'rest', label: 'القيود (نص عملي بلا تشخيص)', placeholder: 'مثال: لا رفع فوق 15 كجم' }, { name: 'note', label: 'ملاحظة طبية (T4)', type: 'textarea', rows: 2 }, { name: 'exam', label: 'تاريخ الفحص', type: 'date', required: true, value: T() }, { name: 'next', label: 'الاستحقاق التالي', type: 'date', required: true, value: D(365), hint: 'تكرار الفحص الدوري {Open}.' }, { name: 'fac', label: 'الجهة الطبية', required: true, value: 'جهة طبية معتمدة (تجريبي)' }, { name: 'file', label: 'التقرير (محاكاة رفع T4)', required: true, placeholder: 'تقرير-طبي.pdf' }],
      check: (v) => { if (v.next <= v.exam) return { next: 'الاستحقاق التالي لازم يكون بعد تاريخ الفحص.' }; if (v.res === 'fit_restricted' && !String(v.rest || '').trim()) return { rest: 'اكتب القيود العملية للمشرف.' }; return null; },
      onSubmit: (v) => { st.insert('fitness', { id: seqId('fitness', 'FT', 3), employeeId: v.emp, type: v.type, result: v.res, restrictions: v.rest || '', medicalNote: v.note || '—', facility: v.fac, examDate: v.exam, nextDue: v.next, reportFile: v.file }); aud('HR.OHS.FITNESS_RECORDED', 'employee', v.emp, en(v.emp), { after: { حالة: FIT_LBL[v.res], استحقاق: v.next } }); if (v.res === 'unfit') notify('حالة لياقة', 'تحدّثت حالة لياقة موظف — يُحظر إسناده للمهام الحرجة (N-07).', 'urgent', ['R-15', 'R-11', 'R-14'], '#/hr/ohs?tab=fitness'); SA.toast('سُجّلت النتيجة وتحدّثت الحالة المشتقة', 'success'); } });
  }
  function openMedical(e, f) {
    aud('HR.OHS.MEDICAL_READ', 'employee', e.id, 'سجل طبي — ' + e.name, { severity: 'critical' });
    SA.drawer({ title: 'سجل طبي (T4)', subtitle: e.name, size: 'md', body: h('div.sap-drawer-inner', {}, t4Banner('تم تسجيل قراءة هذا السجل (HR.OHS.MEDICAL_READ — حرج).'), SA.kv([['النتيجة', stChip({ fit: ['لائق', 'success'], fit_restricted: ['لائق بقيود', 'warning'], unfit: ['غير لائق', 'danger'] }, f.result)], ['النوع', ({ pre: 'قبل التعيين', periodic: 'دوري', post_incident: 'بعد إصابة' })[f.type]], ['تاريخ الفحص', fd(f.examDate)], ['الاستحقاق التالي', fd(f.nextDue)], ['الجهة', f.facility], ['القيود', f.restrictions || '—'], ['الملاحظة الطبية', f.medicalNote], ['التقرير', h('span', {}, SA.icon('file', 'icon-sm'), ' ', f.reportFile)]])) });
  }
  function tabFitness(view) {
    if (!fitReadLogged) { fitReadLogged = true; aud('HR.OHS.FITNESS_STATUS_READ', 'employee', 'list', 'قراءة حالات اللياقة (مجمّعة)', { severity: 'info' }); }
    return SA.live(view, () => {
      const med = MED(); const rows = () => emps().filter((e) => L('fitness').some((f) => f.employeeId === e.id)).map((e) => ({ id: e.id, e, f: fitnessStatus(e.id), rec: L('fitness').filter((x) => x.employeeId === e.id).sort((a, b) => (a.examDate < b.examDate ? 1 : -1))[0] }));
      const all = rows();
      const cols = [{ key: 'e', label: 'الموظف', sort: true, value: (r) => r.e.name, render: (r) => empCell(r.e) }, { key: 'f', label: 'حالة اللياقة', render: (r) => fitChip(r.f) }, { key: 'rs', label: 'القيود (نص عملي)', render: (r) => r.f.restrictions || '—' }, { key: 'due', label: 'الاستحقاق', sort: true, value: (r) => r.f.days, render: (r) => (r.f.validUntil ? h('span.num', {}, fd(r.f.validUntil) + ' ', h('span.sap-hp-note', {}, r.f.days < 0 ? '(منتهية)' : '(بعد ' + r.f.days + ' ي)')) : '—') }];
      if (med) cols.push({ key: 'fac', label: 'الجهة / النوع (T4)', render: (r) => r.rec.facility });
      const t = tcard({ caption: 'اللياقة الطبية', rows: () => rows(), search: { placeholder: 'ابحث باسم الموظف…', keys: [(r) => r.e.name] }, filters: [{ key: 'st', label: 'الحالة', options: [['fit', 'لائق'], ['fit_restricted', 'لائق بقيود'], ['unfit', 'غير لائق'], ['expired', 'منتهي']], test: (r, v) => r.f.status === v }], columns: cols,
        rowActions: (r) => [{ label: 'فتح السجل الطبي (T4)', icon: 'lock', disabled: med ? '' : 'يتطلب hr.medical.view', onClick: () => openMedical(r.e, r.rec) }, { label: 'تسجيل لياقة جديدة', icon: 'plus', disabled: med && SA.can('hr.ohs.edit') ? '' : 'يتطلب hr.ohs.edit + hr.medical.view', onClick: recordFitness }] });
      return h('div.sap-hp-view', {}, med ? t4Banner('التشخيص والتقارير تظهر في «فتح السجل الطبي» فقط وكل قراءة تُسجَّل حرجة.') : SA.alert('info', h('b', {}, 'عرض مبسّط (بدون تشخيص): '), 'تظهر لك حالة اللياقة ونص القيود العملية فقط — لا بيانات طبية (hr.fitness.status.view).'),
        kpiRow([['لائق', N(all.filter((r) => r.f.status === 'fit').length)], ['لائق بقيود', N(all.filter((r) => r.f.status === 'fit_restricted').length)], ['غير لائق', N(all.filter((r) => r.f.status === 'unfit').length), { accent: all.some((r) => r.f.status === 'unfit') }], ['منتهي — يلزم فحص', N(all.filter((r) => r.f.status === 'expired').length), { sub: 'حظر صارم للمهام الحرجة' }]]), t.el, h('p.sap-hp-note', {}, 'الحالة المشتقة تُحسب على الخادم ولا تحمل أي حقل طبي لمن لا يملك hr.medical.view. ', specLink('m-ohs-07')));
    }, ['fitness']);
  }

  /* ── PPE ── */
  function inspectPpe(p) {
    return formModal({ title: 'فحص معدة وقاية — ' + p.item, subtitle: en(p.employeeId), icon: 'shield', size: 'sm', submitLabel: 'تسجيل الفحص',
      fields: [{ name: 'c', label: 'الحالة', type: 'radio', required: true, value: p.condition, options: [['ok', 'سليم'], ['replace', 'بحاجة استبدال'], ['missing', 'مفقود']] }, { name: 'n', label: 'ملاحظة (اختياري)', type: 'textarea', rows: 2 }, SA.alert('info', 'PPE مجاني ولا يُخصم من الأجر (مواد 267–269 Pending). الاستبدال يُطلب من أمين المخزن في «العهدة والزي» (HR-08).')],
      onSubmit: (v) => { st.patch('ppeLog', p.id, { condition: v.c, inspectedAt: T(), note: v.n }); aud('HR.OHS.PPE_INSPECTED', 'ppe', p.id, p.item + ' — ' + en(p.employeeId), { after: { حالة: PPE_C[v.c][0] } }); if (v.c !== 'ok') notify('طلب استبدال معدة وقاية', 'طلب استبدال ' + p.item + ' لموظف (N-58).', 'action', ['R-12', 'R-06'], '#/hr/custody'); SA.toast(v.c === 'ok' ? 'سُجّل الفحص' : 'سُجّل الفحص وأُرسل طلب استبدال إلى HR-08', 'success'); } });
  }
  function tabPpe(view) {
    return SA.live(view, () => { const rows = L('ppeLog'); const t = tcard({ caption: 'سجل PPE', rows: () => L('ppeLog'), filters: [{ key: 'condition', label: 'الحالة', options: Object.keys(PPE_C).map((k) => [k, PPE_C[k][0]]) }], search: { placeholder: 'ابحث…', keys: [(p) => en(p.employeeId), 'item'] },
      columns: [{ key: 'e', label: 'الموظف', render: (p) => empCell(emp(p.employeeId)) }, { key: 'item', label: 'المعدة' }, { key: 'iss', label: 'الصرف (HR-08)', render: (p) => fd(p.issuedAt) }, { key: 'due', label: 'الاستبدال', sort: true, value: (p) => p.replaceDue, render: (p) => h('span.num', {}, fd(p.replaceDue) + (p.replaceDue < T() ? ' — متأخر' : '')) }, { key: 'ins', label: 'آخر فحص', render: (p) => fd(p.inspectedAt) }, { key: 'c', label: 'الحالة', render: (p) => stChip(PPE_C, p.condition) }],
      rowActions: (p) => [{ label: 'فحص الآن', icon: 'check', disabled: needOhs(), onClick: () => inspectPpe(p) }] });
      return h('div.sap-hp-view', {}, kpiRow([['بحاجة استبدال', N(rows.filter((p) => p.condition === 'replace').length)], ['مفقود', N(rows.filter((p) => p.condition === 'missing').length), { accent: rows.some((p) => p.condition === 'missing') }], ['استبدال متأخر', N(rows.filter((p) => p.replaceDue < T()).length)]]), t.el, h('p.sap-hp-note', {}, 'الصرف يتم في العهدة والزي (HR-08) ويظهر هنا؛ OHS يملك جدول الفحص والاستبدال. ', specLink('m-ohs-09'))); }, ['ppeLog']);
  }

  /* ── Toolbox ── */
  function logToolbox() {
    return formModal({ title: 'تسجيل حديث سلامة (Toolbox talk)', subtitle: '10–15 دقيقة قبل الوردية بموضوع من OHS وحضور موثّق.', icon: 'users', size: 'md', submitLabel: 'تسجيل',
      fields: [{ name: 'date', label: 'التاريخ', type: 'date', required: true, value: T(), max: T() }, { name: 'shift', label: 'الوردية', type: 'select', required: true, options: [['A', 'A'], ['B', 'B'], ['C', 'C'], ['day', 'نهارية']] }, { name: 'topic', label: 'الموضوع', required: true }, { name: 'dur', label: 'المدة (دقيقة)', type: 'number', required: true, min: 1, value: 12 }, { name: 'att', label: 'الحضور', type: 'multi', required: true, options: emps().filter((e) => OPS.indexOf(e.id) >= 0).map((e) => [e.id, e.name, 'وردية ' + e.shift]) }],
      check: (v) => ((v.att || []).length ? null : { att: 'اختر الحاضرين.' }),
      onSubmit: (v) => { st.insert('toolboxTalks', { id: seqId('toolboxTalks', 'TBT', 3), date: v.date, shift: v.shift, topic: v.topic, presenterId: SA.session.userId, attendees: v.att, duration: v.dur }); aud('HR.OHS.TOOLBOX_HELD', 'toolbox', v.date, v.topic, { after: { حضور: v.att.length, مدة: v.dur } }); SA.toast('سُجّل الحديث — يغذي التزام التدريب', 'success'); } });
  }
  function tabToolbox(view) {
    return SA.live(view, () => { const rows = L('toolboxTalks'); const last = rows.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0]; const since = last ? dd(last.date, T()) : null;
      const t = tcard({ caption: 'أحاديث السلامة', rows: () => L('toolboxTalks'), initial: { sort: { key: 'date', dir: 'desc' } }, columns: [{ key: 'date', label: 'التاريخ', sort: true, render: (x) => fd(x.date) }, { key: 'topic', label: 'الموضوع' }, { key: 'shift', label: 'الوردية' }, { key: 'dur', label: 'المدة', render: (x) => N(x.duration + ' د') }, { key: 'att', label: 'الحضور', render: (x) => h('span.sap-hp-pills', {}, x.attendees.slice(0, 3).map((id) => h('span.sap-hp-tag', {}, en(id))), x.attendees.length > 3 ? h('span.sap-hp-tag', {}, '+' + (x.attendees.length - 3)) : null) }, { key: 'by', label: 'المُقدِّم', render: (x) => uname(x.presenterId) }] });
      return h('div.sap-hp-view', {}, since != null && since > 7 ? SA.alert('warning', 'لم يُسجَّل حديث سلامة منذ ' + since + ' يومًا (تنبيه N-59).') : null, kpiRow([['أحاديث آخر 30 يومًا', N(rows.filter((x) => dd(x.date, T()) <= 30).length)], ['إجمالي الحضور (30 يومًا)', N(rows.filter((x) => dd(x.date, T()) <= 30).reduce((a, x) => a + x.attendees.length, 0))]]), t.el, h('div.sap-hp-row', {}, btn({ label: 'تسجيل حديث سلامة', icon: 'plus', kind: 'ghost', perm: 'hr.ohs.edit', onClick: logToolbox }), specLink('m-ohs-10'))); }, ['toolboxTalks']);
  }

  /* ── مؤشرات السلامة ── */
  function attendanceHours() { let sum = 0; L('attendance').forEach((a) => { if (a.in && a.out) { const [h1, m1] = a.in.split(':').map(Number); const [h2, m2] = a.out.split(':').map(Number); sum += Math.max(0, (h2 * 60 + m2 - h1 * 60 - m1) / 60); } }); return Math.round(sum); }
  function editKpiBase() {
    const o = cfg('ohs', {});
    return formModal({ title: 'أساس مؤشرات السلامة', subtitle: 'تغيير حرج: يُسجَّل ويُعرض الأساس على كل ودجت.', icon: 'gauge', size: 'sm', submitLabel: 'حفظ الأساس', step: 'policy.change', stepTitle: 'تغيير أساس مؤشرات السلامة',
      fields: [{ name: 'hours', label: 'ساعات العمل الفعلية لآخر 12 شهرًا', type: 'number', required: true, min: 1, value: o.hours12m, hint: 'المصدر المعتمد: حضور فعلي + أوفرتايم من HR-10 {Pending}. القيمة الحالية يدوية تجريبية (DEMO).' }, { name: 'contr', label: 'تضمين ساعات المقاولين/اليومية', type: 'select', value: o.includeContractors == null ? '' : String(o.includeContractors), options: [['', '{Open} — غير محدد'], ['true', 'نعم'], ['false', 'لا']] }, { name: 'why', label: 'سبب التغيير', type: 'textarea', required: true, rows: 2 }],
      onSubmit: (v) => { st.update('settings.hrProtect.ohs', (x) => { x.hours12m = v.hours; x.includeContractors = v.contr === '' ? null : v.contr === 'true'; }); aud('HR.OHS.KPI_BASE_CHANGED', 'settings', 'ohs', 'أساس مؤشرات السلامة', { before: { ساعات: o.hours12m }, after: { ساعات: v.hours }, reason: v.why }); SA.toast('حُدّث الأساس — تتحدّث المؤشرات فورًا', 'success'); } });
  }
  function tabKpis(view) {
    let months = cfg('ohs.periodMonths', 12);
    return SA.live(view, () => {
      const k = safetyKpis(months); const f = (v, d) => (v == null ? h('span.sap-hp-note', {}, 'غير متاح') : N(v.toFixed(d == null ? 2 : d)));
      return h('div.sap-hp-view', {}, h('div.sap-hp-row.is-between', {}, h('label.sap-hp-row', {}, h('b', {}, 'الفترة:'), h('select.select', { style: { width: 'auto' }, 'aria-label': 'الفترة', onchange: (e) => { months = +e.target.value; st.set('settings.hrProtect.ohs.periodMonths', months); } }, [3, 6, 12].map((n) => h('option', { value: n, selected: n === months }, 'آخر ' + n + ' شهرًا')))), btn({ label: 'تعديل الأساس والساعات', icon: 'edit', kind: 'ghost', perm: 'hr.ohs.edit', onClick: editKpiBase })),
        h('div.sap-hp-kpi4', {}, [['LTIFR — معدل تكرار الإصابات بفقد الوقت', f(k.ltifr), 'LTIFR = (' + k.lti + ' × ' + num(k.base1, 0) + ') ÷ ' + (k.hours ? num(k.hours, 0) : '—')], ['TRIR — معدل الإصابات القابلة للتسجيل', f(k.trir), 'TRIR = (' + k.recordable + ' × ' + num(k.base2, 0) + ') ÷ ' + (k.hours ? num(k.hours, 0) : '—')], ['معدل الخطورة (تعريف غير متحقق)', f(k.severityRate, 1), 'SR = (' + k.lostDays + ' × ' + num(k.base1, 0) + ') ÷ ' + (k.hours ? num(k.hours, 0) : '—')], ['نسبة شبه الحوادث', f(k.nearMissRatio), k.nearMiss + ' ÷ ' + k.recordable + ' (قابلة للتسجيل)'], ['أيام منذ آخر LTI', k.daysSinceLti == null ? 'لا LTI' : N(k.daysSinceLti), 'اليوم − تاريخ آخر إصابة بفقد وقت']].map((x) => SA.card({}, h('div.sap-hp-note', {}, x[0]), h('div.sap-hp-big', {}, x[1]), h('div.sap-hp-formula', {}, x[2])))),
        SA.card({ title: 'الأساس المستخدم', tags: SA.tag('pending', 'Pending') }, SA.kv([['ساعات العمل الفعلية (' + months + ' شهرًا)', k.hours == null ? openTag('غير مُعدّة') : h('span', {}, h('b.num', {}, num(k.hours, 0)), ' ', SA.demoValue('يدوي تجريبي'))], ['مصدر الساعات', 'يدوي الآن — المصدر المعتمد HR-10 (حضور فعلي + أوفرتايم) {Pending · بند 45}'], ['تضمين المقاولين/اليومية', cfg('ohs.includeContractors', null) == null ? openTag('{Open} — D9') : cfg('ohs.includeContractors') ? 'نعم' : 'لا'], ['حوادث الفترة', h('span', {}, N(k.total), ' (', N(k.lti), ' LTI · ', N(k.recordable), ' قابلة للتسجيل · ', N(k.nearMiss), ' شبه حادث)')], ['عيّنة ساعات الحضور الحالية', h('span', {}, N(attendanceHours()), ' ساعة — عيّنة 5 أيام فقط، لا تكفي كمقام سنوي')]]), h('p.sap-hp-note', {}, 'الأساسان 1,000,000 و200,000 غير قابلين للمقارنة المباشرة — يُكتب الأساس على كل ودجت. الساعات = 0 ← «غير متاح» بدل قسمة على صفر. ', specLink('m-ohs-11'))),
        h('p.sap-hp-note', {}, 'مثال DEMO من المواصفة: LTI = 2، قابلة للتسجيل = 5، الساعات = 350,000 ← LTIFR 5.71 · TRIR 2.86 · معدل الخطورة 20.0 — تتغيّر هنا آنيًا بتصنيف أي بلاغ أو تعديل أيام الفقد.'));
    }, ['incidents', 'settings']);
  }

  /* ── مهام الإخطار التنظيمي (Open per D11) ── */
  function newRegTask() {
    return formModal({ title: 'مهمة إخطار تنظيمي', subtitle: 'كل القيم Open (D11): لا جهة ولا مهلة معتمدة. التنفيذ خارج النظام — لا ادعاء تكامل.', icon: 'doc', size: 'sm', submitLabel: 'إنشاء المهمة',
      fields: [{ name: 'title', label: 'المهمة', required: true }, { name: 'auth', label: 'الجهة', value: '{Open}' }, { name: 'basis', label: 'السند النظامي', value: 'غير متحقق منه' }, { name: 'due', label: 'المهلة (اختياري)', type: 'date', hint: 'بدون مهلة معتمدة: تبقى المهمة بوسم «غير متحقق منه».' }],
      onSubmit: (v) => { const id = seqId('regTasks', 'RT', 3, Y()); st.insert('regTasks', { id, incidentId: null, title: v.title, authority: v.auth, basis: v.basis, due: v.due || null, assignee: SA.session.userId, status: 'open', proof: null, createdAt: new Date().toISOString(), createdBy: SA.session.userId, doneBy: null }); aud('HR.OHS.REGTASK_CREATED', 'regtask', id, v.title, { after: { موعد: v.due || 'غير مُعدّ' } }); SA.toast('أُنشئت المهمة', 'success'); } });
  }
  function regAction(t) {
    if (t.status === 'open') return formModal({ title: 'رفع إثبات الإرسال', subtitle: t.title, icon: 'upload', size: 'sm', submitLabel: 'رفع الإثبات', intro: SA.alert('info', 'نفّذ الإخطار خارج النظام ثم ارفع إثبات الإرسال (رقم/صورة). مراجعته من HR Manager.'), fields: [{ name: 'p', label: 'الإثبات (محاكاة رفع)', required: true, placeholder: 'إيصال-الإخطار.pdf' }], onSubmit: (v) => { st.patch('regTasks', t.id, { status: 'proof', proof: v.p, proofBy: SA.session.userId }); SA.toast('رُفع الإثبات — بانتظار المراجعة', 'success'); } });
    if (t.status === 'proof') { if (t.proofBy === SA.session.userId || t.createdBy === SA.session.userId) { SA.toast('من أنشأ المهمة أو رفع إثباتها لا يغلقها — يراجعها HR Manager.', 'warn', { ms: 5500 }); return; }
      return confirmAct({ title: 'اعتماد إثبات الإخطار', text: t.title, confirmLabel: 'اعتماد وإغلاق', impact: ['تُغلق المهمة بإثبات مراجَع.'], run: () => { st.patch('regTasks', t.id, { status: 'done', doneBy: SA.session.userId }); aud('HR.OHS.REGTASK_DONE', 'regtask', t.id, t.title, { after: { إثبات: t.proof } }); notify('إخطار منجز', 'أُنجزت مهمة إخطار تنظيمي بإثبات (N-57).', 'info', ['R-15'], '#/hr/ohs?tab=regulatory'); }, success: 'أُغلقت المهمة' }); }
  }
  function tabRegulatory(view) {
    return SA.live(view, () => {
      const t = tcard({ caption: 'مهام الإخطار التنظيمي', rows: () => L('regTasks'), columns: [{ key: 'title', label: 'المهمة', render: (r) => h('div', {}, h('b', {}, r.title), h('div.sap-hp-note', {}, r.id + (r.incidentId ? ' · ' + r.incidentId : ''))) }, { key: 'auth', label: 'الجهة', render: (r) => (String(r.authority).indexOf('Open') >= 0 ? openTag('{Open}') : r.authority) }, { key: 'basis', label: 'السند', render: (r) => h('span', {}, r.basis, ' ', SA.tag('pending', 'Pending')) }, { key: 'due', label: 'المهلة', render: (r) => (r.due ? fd(r.due) : h('span', {}, openTag('غير مُعدّة'), ' ', SA.chip('غير متحقق منه', 'warning'))) }, { key: 'st', label: 'الحالة', render: (r) => stChip(RT_ST, r.status) }],
        rowActions: (r) => [r.status !== 'done' ? { label: r.status === 'open' ? 'رفع إثبات الإرسال' : 'اعتماد الإثبات وإغلاق', icon: 'check', disabled: SA.can('hr.ohs.edit') ? '' : NOPERM('hr.ohs.edit'), onClick: () => regAction(r) } : null],
        empty: { icon: 'doc', title: 'لا مهام إخطار', text: 'تُنشأ تلقائيًا عند تصنيف حادث جسيم أو مرض مهني.' } });
      return h('div.sap-hp-view', {}, SA.alert('warning', h('b', {}, 'Open — D11: '), 'مواعيد الإخطار وجهاته وتعريف الحادث الجسيم (قرارات 248–252/2026) غير متحقق منها. النظام يدير مهامًا قابلة للتعديل ويحفظ الإثبات، ولا يُرسل لأي جهة ولا يدّعي تكاملًا.'), t.el, h('div.sap-hp-row', {}, btn({ label: 'مهمة إخطار جديدة', icon: 'plus', kind: 'ghost', perm: 'hr.ohs.edit', onClick: newRegTask }), specLink('m-ohs-12')));
    }, ['regTasks']);
  }

  /* ── لجنة السلامة ── */
  function newMeeting() {
    return formModal({ title: 'اجتماع لجنة السلامة', subtitle: 'لزوم اللجنة وتشكيلها وتكرارها {Open} (D11) — النظام لا يفرض عددًا أو نصابًا.', icon: 'users', size: 'md', submitLabel: 'حفظ المحضر',
      fields: [{ name: 'date', label: 'تاريخ الاجتماع', type: 'date', required: true, value: T() }, { name: 'att', label: 'الحضور', required: true }, { name: 'agenda', label: 'جدول الأعمال (سطر لكل بند)', type: 'textarea', rows: 3, value: L('incidents').filter((i) => i.status !== 'closed' && i.severity !== 'near_miss').map((i) => 'متابعة ' + i.id).join('\n') }, { name: 'min', label: 'المحضر والقرارات', type: 'textarea', required: true, rows: 3 }],
      onSubmit: (v) => { const id = seqId('ohsMeetings', 'SM', 2, Y()); st.insert('ohsMeetings', { id, heldOn: v.date, attendees: v.att, agenda: v.agenda.split('\n').filter(Boolean), minutes: v.min, decisions: 0 }); aud('HR.OHS.COMMITTEE_MEETING_SAVED', 'meeting', id, 'اجتماع لجنة السلامة', { after: { تاريخ: v.date } }); SA.toast('حُفظ المحضر', 'success'); } });
  }
  function tabCommittee(view) {
    return SA.live(view, () => h('div.sap-hp-view', {}, SA.alert('info', 'جدول الأعمال يُملأ من الحوادث والـCAPA المفتوحة. الأعضاء والنصاب والتكرار {Open} حتى اعتماد قرار D11.'), tcard({ caption: 'اجتماعات لجنة السلامة', rows: () => L('ohsMeetings'), columns: [{ key: 'd', label: 'التاريخ', render: (m) => fd(m.heldOn) }, { key: 'a', label: 'الحضور', render: (m) => m.attendees }, { key: 'ag', label: 'جدول الأعمال', render: (m) => m.agenda.join(' · ') }, { key: 'm', label: 'المحضر', render: (m) => m.minutes }], empty: { icon: 'users', title: 'لا اجتماعات مسجّلة', action: { label: 'اجتماع جديد', perm: 'hr.ohs.edit', onClick: newMeeting } } }).el, h('div.sap-hp-row', {}, btn({ label: 'اجتماع جديد', icon: 'plus', kind: 'ghost', perm: 'hr.ohs.edit', onClick: newMeeting }), specLink('m-ohs-13'))), ['ohsMeetings']);
  }

  /* ── لوحة السلامة ── */
  function tabOhsDash(view, api) {
    return SA.live(view, () => {
      const k = safetyKpis(); const capas = allCapas(); const od = capas.filter(capaOverdue); const av = capas.filter((c) => c.status === 'awaiting_verification');
      const unclass = L('incidents').filter((i) => i.status === 'reported'); const fx = L('fitness').map((f) => fitnessStatus(f.employeeId)).filter((x) => x.status === 'expired' || x.status === 'unfit');
      const task = (txt, n, tab, kind) => (n ? h('li', {}, h('button.sap-hp-link', { type: 'button', onclick: () => api.go(tab) }, txt, ' ', SA.chip(String(n), kind || 'warning'))) : null);
      return h('div.sap-hp-view', {}, h('div.sap-hp-kpi4', {}, [SA.kpi('LTIFR', k.ltifr == null ? 'غير متاح' : N(k.ltifr.toFixed(2)), { sub: 'آخر ' + k.months + ' شهرًا · أساس ' + num(k.base1, 0), href: SA.href('hr/ohs?tab=kpis') }), SA.kpi('TRIR', k.trir == null ? 'غير متاح' : N(k.trir.toFixed(2)), { sub: 'أساس ' + num(k.base2, 0), href: SA.href('hr/ohs?tab=kpis') }), SA.kpi('أيام منذ آخر LTI', k.daysSinceLti == null ? '—' : N(k.daysSinceLti), { accent: k.daysSinceLti != null && k.daysSinceLti < 14 }), SA.kpi('شبه حوادث / قابلة للتسجيل', k.nearMissRatio == null ? '—' : N(k.nearMissRatio.toFixed(1)), { sub: k.nearMiss + ' ÷ ' + k.recordable })]),
        h('div.sap-hp-cols', {}, SA.card({ title: 'مهام اليوم' }, h('ul', { style: { margin: 0, paddingInlineStart: '18px', display: 'grid', gap: '8px' } }, [task('بلاغات بانتظار التصنيف', unclass.length, 'incidents'), task('إجراءات CAPA متأخرة', od.length, 'incidents', 'danger'), task('إجراءات بانتظار التحقق من الفعالية', av.length, 'incidents'), task('لياقة منتهية / غير لائق', fx.length, 'fitness', 'danger'), task('معدات وقاية بحاجة استبدال أو مفقودة', L('ppeLog').filter((p) => p.condition !== 'ok').length, 'ppe'), task('مهام إخطار تنظيمي مفتوحة (Open — D11)', L('regTasks').filter((r) => r.status !== 'done').length, 'regulatory')].filter(Boolean)), !unclass.length && !od.length && !av.length && !fx.length ? h('p.sap-hp-note', {}, 'لا مهام عاجلة اليوم.') : null),
          SA.card({ title: 'آخر البلاغات', flush: true }, h('div.table-wrap', {}, h('table.table', {}, h('tbody', {}, L('incidents').slice().sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)).slice(0, 5).map((i) => h('tr', { class: 'is-click', tabindex: 0, onclick: () => openIncident(i.id) }, h('td', {}, h('b', {}, i.id), h('div.sap-hp-note', {}, i.location)), h('td', {}, stChip(SEV_INC, i.severity)), h('td', {}, stChip(INC_ST, i.status))))))))),
        h('p.sap-hp-note', {}, 'المؤشرات تُحسب آنيًا من سجل الحوادث بالصيغ: LTIFR = LTI × 1,000,000 ÷ الساعات · TRIR = القابلة للتسجيل × 200,000 ÷ الساعات. ', specLink('m-ohs-01')));
    }, ['incidents', 'fitness', 'ppeLog', 'regTasks', 'settings']);
  }

  const ohsBadge = () => { const n = L('incidents').filter((i) => i.status === 'reported').length + allCapas().filter(capaOverdue).length; return n || null; };
  screen({ id: 'hr-ohs', route: 'hr/ohs', perm: 'hr.ohs.view', title: 'السلامة والصحة المهنية', icon: 'shield', order: 44, desc: 'بلاغات الحوادث وشبه الحوادث، التحقيق والإجراءات التصحيحية، إصابات العمل، اللياقة الطبية بسرية، معدات الوقاية، ومؤشرات LTIFR/TRIR الآنية.', watch: ['incidents'], badge: ohsBadge, tags: () => [SA.tag('new', 'HR-21'), SA.tag('open', 'D11 Open')],
    tabs: [
      { id: 'dash', label: 'لوحة السلامة', icon: 'dashboard', render: tabOhsDash, primary: () => btn({ label: 'بلاغ حادث / شبه حادث', icon: 'plus', kind: 'accent', onClick: reportIncident }) },
      { id: 'incidents', label: 'الحوادث', icon: 'alert', render: tabIncidents, badge: () => L('incidents').filter((i) => i.status !== 'closed').length || null, primary: () => btn({ label: 'بلاغ حادث / شبه حادث', icon: 'plus', kind: 'accent', onClick: reportIncident }) },
      { id: 'fitness', label: 'اللياقة الطبية', icon: 'user', render: tabFitness, primary: () => btn({ label: 'تسجيل لياقة', icon: 'plus', kind: 'accent', perm: 'hr.ohs.edit', reason: MED() ? '' : 'يتطلب hr.medical.view', onClick: recordFitness }) },
      { id: 'ppe', label: 'معدات الوقاية PPE', icon: 'box', render: tabPpe },
      { id: 'toolbox', label: 'أحاديث السلامة', icon: 'users', render: tabToolbox, primary: () => btn({ label: 'تسجيل حديث سلامة', icon: 'plus', kind: 'accent', perm: 'hr.ohs.edit', onClick: logToolbox }) },
      { id: 'kpis', label: 'المؤشرات LTIFR / TRIR', icon: 'gauge', render: tabKpis },
      { id: 'regulatory', label: 'الإخطار التنظيمي', icon: 'doc', render: tabRegulatory, badge: () => L('regTasks').filter((r) => r.status !== 'done').length || null },
      { id: 'committee', label: 'لجنة السلامة', icon: 'layers', render: tabCommittee, primary: () => btn({ label: 'اجتماع جديد', icon: 'plus', kind: 'accent', perm: 'hr.ohs.edit', onClick: newMeeting }) }
    ] });

  /** إتاحة API للوحات المشرف/الورديات */
  SA.hrProtect = { skillCheck, assignMachine, fitnessStatus, sickLeaveBlock, safetyKpis, skillStatus };

  /* ═════════════════════════════ HR-22 · التحفيز والتقدير ورضا العاملين ═════════════════════════════ */
  const AW_ST = { nominated: ['مُرشَّح', 'warning'], approved: ['معتمد', 'success'], paid: ['مدفوع', 'success'], rejected: ['مرفوض', 'neutral'] };
  const SG_ST = { submitted: ['مقدَّم', 'warning'], under_review: ['قيد الفحص', 'info'], accepted: ['مقبول', 'success'], implemented: ['مُنفَّذ', 'success'], rewarded: ['مُقدَّر', 'success'], rejected: ['مرفوض', 'neutral'] };
  const SH_ST = { draft: ['مسودة', 'neutral'], pending_approval: ['بانتظار الاعتماد', 'warning'], approved: ['معتمد — جاهز للترحيل', 'info'], transferred: ['مُرحَّل للمرتبات', 'success'] };
  const RF_ST = { flagged: ['مُعلَّمة', 'warning'], talked: ['تمت المحادثة', 'info'], resolved: ['محلولة', 'success'], closed: ['مُغلقة', 'neutral'] };
  const rcgEdit = () => (SA.can('hr.recognition.edit') ? '' : NOPERM('hr.recognition.edit'));
  const typeName = (id) => (find('recognitionTypes', id) || {}).name || id;

  /* ── التقدير والجوائز ── */
  function awardGate(e, type) {
    const a = attStats(e.id);
    if (type.id === 'RT-2' && (a.absent > 0 || a.late > 0)) return 'لم يستوفِ شرط الحضور'; // سبب عام فقط — لا ربط بحالة تأديبية (BR-RCG-04)
    if (type.id === 'RT-3' && L('incidents').some((i) => i.personId === e.id && i.recordable && dd(String(i.occurredAt).slice(0, 10), T()) <= 365)) return 'لا يحقق معيار «صفر حوادث» للفترة';
    return null;
  }
  function nominate() {
    return formModal({ title: 'ترشيح تقدير / جائزة', subtitle: 'البوابة موضوعية (حضور / سلامة) — لا ربط بأي حالة تأديبية.', icon: 'star', size: 'md', submitLabel: 'إرسال الترشيح',
      fields: [{ name: 'emp', label: 'الموظف المرشَّح', type: 'select', required: true, options: empOpts() }, { name: 'type', label: 'نوع التقدير', type: 'select', required: true, options: [['', 'اختر…']].concat(L('recognitionTypes').map((t) => [t.id, t.name + (t.cash ? ' — بمكافأة نقدية' : '')])), hint: 'المعيار المكتوب لكل نوع يظهر في ملف الترشيح.' }, { name: 'reason', label: 'سبب الترشيح', type: 'textarea', required: true, rows: 3 }],
      check: (v) => { const me = myEmp(); if (me && me.id === v.emp) return { emp: 'مينفعش ترشّح نفسك.' }; return null; },
      onSubmit: (v) => { const id = seqId('awards', 'AW', 4, Y()); st.insert('awards', { id, employeeId: v.emp, typeId: v.type, nominatedBy: SA.session.userId, reason: v.reason.trim(), status: 'nominated', createdAt: new Date().toISOString(), certNo: null, publish: null }); aud('HR.RCG.NOMINATED', 'award', id, en(v.emp) + ' — ' + typeName(v.type), { after: { نوع: typeName(v.type) } }); SA.toast('أُرسل الترشيح للمراجعة', 'success'); } });
  }
  function approveAward(a) {
    const type = find('recognitionTypes', a.typeId); const e = emp(a.employeeId); const gate = awardGate(e, type);
    if (a.nominatedBy === SA.session.userId) { SA.toast('من رشّح لا يعتمد — فصل مهام (المرشَّح ≠ المقترِح ≠ المعتمِد).', 'warn'); return; }
    return formModal({ title: 'اعتماد تقدير — ' + e.name, subtitle: type.name + ' · المعيار: ' + type.criteria, icon: 'checkcircle', size: 'sm', submitLabel: 'اعتماد وإصدار الشهادة',
      intro: gate ? SA.alert('danger', 'لا يستوفي المعيار: ' + gate + '. لا يُعتمد التقدير.') : SA.alert('success', 'استوفى البوابة الموضوعية للنوع.'),
      fields: [{ name: 'pub', label: 'الإعلان على لوحة الكشك', type: 'switch', hint: 'يُنشر فقط بموافقة الموظف — الافتراضي غير منشور (Open).' }, type.cash ? SA.alert('info', 'مكافأة نقدية: تمر على الاعتماد المالي — حد الاعتماد {Open} (D7). القيمة غير مُعدّة.') : null].filter(Boolean),
      check: () => (gate ? 'لا يُعتمد: ' + gate : null),
      onSubmit: (v) => { const cert = 'RCG-' + Y() + '-' + String(L('awards').filter((x) => x.certNo).length + 1).padStart(4, '0'); st.patch('awards', a.id, { status: 'approved', certNo: cert, publish: !!v.pub, approvedBy: SA.session.userId }); aud('HR.RCG.AWARD_APPROVED', 'award', a.id, e.name + ' — ' + type.name, { after: { شهادة: cert, إعلان: !!v.pub } }); notify('تقدير جديد', 'اعتُمد تقدير لموظف — شهادة جاهزة (N-36).', 'info', ['R-14', 'R-12'], '#/hr/recognition', [e.userId].filter(Boolean)); SA.toast('اعتُمد التقدير وصدرت الشهادة ' + cert, 'success'); } });
  }
  function certDownload(a) { const e = emp(a.employeeId); SA.download('شهادة-تقدير-' + a.certNo + '.txt', 'شهادة تقدير (DOC-HR-51) — نموذج غير رسمي قبل التوقيع والختم\n\nتمنح الشركة (بيانات الشركة — Placeholder) السيد/ة: ' + e.name + '\nتقديرًا في: ' + typeName(a.typeId) + '\nالسبب: ' + a.reason + '\nرقم الشهادة: ' + a.certNo + ' (الترقيم {Open})\nالتاريخ: ' + fd(T()) + '\n\nالتوقيع والختم: ________'); }
  function tabAwards(view) {
    return SA.live(view, () => { const t = tcard({ caption: 'التقدير والجوائز', rows: () => L('awards'), filters: [{ key: 'status', label: 'الحالة', options: Object.keys(AW_ST).map((k) => [k, AW_ST[k][0]]) }, { key: 'typeId', label: 'النوع', options: L('recognitionTypes').map((x) => [x.id, x.name]) }],
      columns: [{ key: 'id', label: 'الترشيح', render: (a) => h('div', {}, h('b', {}, a.id), h('div.sap-hp-note', {}, a.certNo || 'بلا شهادة بعد')) }, { key: 'e', label: 'الموظف', render: (a) => empCell(emp(a.employeeId)) }, { key: 't', label: 'النوع', render: (a) => typeName(a.typeId) }, { key: 'r', label: 'السبب', render: (a) => h('span', { title: a.reason }, a.reason.length > 50 ? a.reason.slice(0, 50) + '…' : a.reason) }, { key: 'by', label: 'رشّحه', render: (a) => uname(a.nominatedBy) }, { key: 's', label: 'الحالة', render: (a) => stChip(AW_ST, a.status) }],
      rowActions: (a) => [a.status === 'nominated' ? { label: 'اعتماد', icon: 'check', disabled: rcgEdit(), onClick: () => approveAward(a) } : null, a.status === 'nominated' ? { label: 'رفض بسبب عام', icon: 'xcircle', danger: true, disabled: rcgEdit(), onClick: () => confirmAct({ title: 'رفض الترشيح', danger: true, reasonRequired: true, confirmLabel: 'رفض', run: (r) => { st.patch('awards', a.id, { status: 'rejected', rejectReason: r.reason }); }, success: 'رُفض الترشيح' }) } : null, a.status === 'approved' && (find('recognitionTypes', a.typeId) || {}).cash ? { label: 'تسجيل الصرف (المالية)', icon: 'coins', disabled: rcgEdit(), onClick: () => confirmAct({ title: 'تسجيل صرف المكافأة', confirmLabel: 'تسجيل الصرف', impact: ['يُسجَّل كمدخل للمرتبات بدون قيمة (القيمة {Open}) ويُنقل الترشيح إلى «مدفوع».'], run: () => { st.patch('awards', a.id, { status: 'paid' }); st.insert('payrollInputs', { id: seqId('payrollInputs', 'PI', 4, Y()), kind: 'award', employeeId: a.employeeId, amount: null, source: a.id, label: 'مكافأة تقدير', status: 'pending', createdAt: new Date().toISOString() }); }, success: 'سُجّل الصرف' }) } : null, a.certNo ? { label: 'تنزيل الشهادة (DOC-HR-51)', icon: 'download', onClick: () => certDownload(a) } : null],
      empty: { icon: 'star', title: 'لا ترشيحات', text: 'رشّح موظفًا مستحقًا ليمر على الاعتماد.', action: { label: 'ترشيح', perm: 'hr.recognition.edit', onClick: nominate } } });
      return h('div.sap-hp-view', {}, kpiRow([['بانتظار الاعتماد', N(L('awards').filter((a) => a.status === 'nominated').length), { accent: L('awards').some((a) => a.status === 'nominated') }], ['معتمدة', N(L('awards').filter((a) => a.status === 'approved' || a.status === 'paid').length)], ['أنواع التقدير', N(L('recognitionTypes').length)]]), t.el, SA.card({ title: 'أنواع التقدير ومعاييرها المكتوبة' }, h('div.sap-hp-steps', {}, L('recognitionTypes').map((x) => h('div.sap-hp-step', {}, h('span.n', {}, SA.icon('star', 'icon-sm')), h('div', {}, h('b', {}, x.name, x.cash ? ' ' : '', x.cash ? SA.chip('نقدي', 'info') : ''), h('small', {}, x.criteria)))))), specLink('m-rcg-01')); }, ['awards', 'recognitionTypes']);
  }

  /* ── خطط الحوافز ── */
  function editScheme(id) {
    const s = id ? find('incentiveSchemes', id) : null;
    return formModal({ title: s ? 'تعديل خطة: ' + s.name : 'خطة حافز جديدة', subtitle: 'كل القيم {Open} حتى تحدّدها الإدارة. الحافز موضوعي ومكتوب ولا يُستخدم كعقوبة مقنّعة.', icon: 'coins', size: 'md', submitLabel: 'حفظ الخطة', step: 'policy.change', stepTitle: 'تعديل خطة حافز',
      fields: [{ name: 'name', label: 'اسم الخطة', required: true, value: s ? s.name : '' }, { name: 'kind', label: 'النوع', type: 'select', required: true, value: s ? s.kind : '', options: [['', 'اختر…'], ['attendance', 'حضور'], ['production', 'إنتاج']] }, { name: 'mode', label: 'الوضع', type: 'select', value: s ? s.mode : 'individual', options: [['individual', 'فردي'], ['crew', 'جماعي (فريق)']] }, { name: 'gate', label: 'مصدر البوابة', type: 'select', required: true, value: s ? 'attendance' : '', options: [['', 'اختر…'], ['attendance', 'الحضور'], ['production', 'الإنتاج {Pending}'], ['discipline', 'حالة تأديبية']], hint: 'البوابة تقرأ الحضور والإنتاج فقط.' }, { name: 'abs', label: 'أقصى غياب بدون إذن', type: 'number', min: 0, value: s && s.gate ? s.gate.maxAbsence : '', hint: 'القيمة {Open} — اتركها فارغة = غير مُعدّة.' }, { name: 'late', label: 'أقصى عدد تأخيرات', type: 'number', min: 0, value: s && s.gate ? s.gate.maxLate : '' }, { name: 'pool', label: 'وعاء الحافز الجماعي (ج.م) — DEMO', type: 'number', min: 0, value: s ? s.pool : '', hint: 'الصيغة الحقيقية {Open}.' }, { name: 'comp', label: 'مكوّن المرتب المرتبط (HR-13)', value: s ? s.component : '', hint: 'خطة بدون ربط بمكوّن مرتب لا تُفعَّل.' }, { name: 'ins', label: 'التصنيف التأميني للحافز', type: 'select', value: s && s.insuranceClass ? s.insuranceClass : '', options: [['', '{Open} — D4 / بند 44'], ['basic', 'أساسي'], ['variable', 'متغير']] }, { name: 'eff', label: 'تاريخ السريان', type: 'date', required: true, value: s ? s.effectiveFrom : D(30) }],
      check: (v) => { if (v.gate === 'discipline') return { gate: 'لا يمكن ربط الحافز بحالة تأديبية. استخدم الحضور أو الإنتاج.' }; if (!String(v.comp || '').trim()) return { comp: 'اربط الخطة بمكوّن مرتب قبل التفعيل.' }; return null; },
      onSubmit: (v) => { const rec = { name: v.name.trim(), kind: v.kind, mode: v.mode, gate: { maxAbsence: v.abs, maxLate: v.late, demo: true }, pool: v.pool == null ? null : v.pool, poolDemo: v.pool != null, component: v.comp.trim(), insuranceClass: v.ins || null, effectiveFrom: v.eff, active: true }; if (s) st.patch('incentiveSchemes', s.id, rec); else st.insert('incentiveSchemes', Object.assign({ id: seqId('incentiveSchemes', 'IS', 2) }, rec)); aud('HR.RCG.SCHEME_SAVED', 'scheme', s ? s.id : 'new', rec.name, { before: s ? { وعاء: s.pool } : null, after: { وعاء: rec.pool, سريان: v.eff } }); SA.toast('حُفظت الخطة — تسري من ' + fd(v.eff) + ' بلا أثر رجعي', 'success'); } });
  }
  function tabSchemes(view) {
    return SA.live(view, () => { const t = tcard({ caption: 'خطط الحوافز', rows: () => L('incentiveSchemes'), onRowClick: (s) => (SA.can('hr.recognition.edit') ? editScheme(s.id) : null),
      columns: [{ key: 'n', label: 'الخطة', render: (s) => h('div', {}, h('b', {}, s.name), h('div.sap-hp-note', {}, s.id)) }, { key: 'k', label: 'النوع', render: (s) => (s.kind === 'attendance' ? 'حضور' : 'إنتاج') + ' · ' + (s.mode === 'crew' ? 'جماعي' : 'فردي') }, { key: 'g', label: 'البوابة', render: (s) => h('span', {}, 'غياب ≤ ', s.gate && s.gate.maxAbsence != null ? N(s.gate.maxAbsence) : openTag('{Open}'), ' · تأخير ≤ ', s.gate && s.gate.maxLate != null ? N(s.gate.maxLate) : openTag('{Open}'), s.gate && s.gate.demo && s.gate.maxAbsence != null ? ' ' : '', s.gate && s.gate.demo && s.gate.maxAbsence != null ? SA.demoValue('') : '') }, { key: 'p', label: 'الوعاء', render: (s) => (s.pool == null ? openTag('غير مُعدّ') : h('span', {}, money(s.pool), ' ', s.poolDemo ? SA.chip('DEMO', 'warning') : '')) }, { key: 'c', label: 'مكوّن المرتب', render: (s) => s.component }, { key: 'i', label: 'تصنيف التأمينات', render: (s) => (s.insuranceClass ? ({ basic: 'أساسي', variable: 'متغير' })[s.insuranceClass] : openTag('{Open} — D4')) }, { key: 'e', label: 'السريان', render: (s) => fd(s.effectiveFrom) }],
      rowActions: (s) => [{ label: 'تعديل (بتاريخ سريان)', icon: 'edit', disabled: rcgEdit(), onClick: () => editScheme(s.id) }] });
      return h('div.sap-hp-view', {}, SA.alert('info', 'خطة الحافز تُعتمد من HR Manager ثم GM وتسري بتاريخ سريان بلا أثر رجعي. التصنيف التأميني للحافز {Open} (D4 — بند 44) ولا يُفترض. مدخلات الإنتاج تتطلب وحدة الإنتاج {Pending}.'), t.el, h('div.sap-hp-row', {}, btn({ label: 'خطة جديدة', icon: 'plus', kind: 'ghost', perm: 'hr.recognition.edit', onClick: () => editScheme() }), specLink('m-rcg-02'))); }, ['incentiveSchemes']);
  }

  /* ── كشوف الحافز ── */
  function newSheet() {
    return formModal({ title: 'إعداد كشف حافز شهري', subtitle: 'يُولَّد Draft: المؤهلون وغير المؤهلين وأسبابهم من الحضور. من أعدّ الكشف لا يعتمده.', icon: 'coins', size: 'sm', submitLabel: 'توليد الكشف',
      fields: [{ name: 'scheme', label: 'الخطة', type: 'select', required: true, options: [['', 'اختر…']].concat(L('incentiveSchemes').filter((s) => s.active).map((s) => [s.id, s.name])) }, { name: 'period', label: 'الفترة (YYYY-MM)', required: true, value: T().slice(0, 7), placeholder: '2026-11' }, { name: 'dept', label: 'القسم/الفريق', type: 'select', required: true, value: 'D-09', options: (st.get('departments') || []).filter((d) => ['D-09', 'D-10', 'D-11', 'D-12'].indexOf(d.id) >= 0).map((d) => [d.id, d.name]) }],
      check: (v) => { if (!/^\d{4}-\d{2}$/.test(v.period)) return { period: 'الصيغة YYYY-MM.' }; if (L('incentiveSheets').some((s) => s.schemeId === v.scheme && s.period === v.period)) return 'يوجد كشف لنفس الخطة والفترة.'; return null; },
      onSubmit: (v) => { const sc = find('incentiveSchemes', v.scheme); const members = emps().filter((e) => e.departmentId === v.dept && e.status !== 'terminated' && OPS.indexOf(e.id) >= 0); const lines = members.map((e) => { const a = attStats(e.id); const g = sc.gate || {}; let eligible = true; let why = ''; if (g.maxAbsence == null || g.maxLate == null) { eligible = false; why = 'شروط الأهلية غير مُعدّة (Open)'; } else if (a.absent > g.maxAbsence || a.late > g.maxLate) { eligible = false; why = 'لم يستوفِ شرط الحضور'; } return { employeeId: e.id, days: a.present, eligible, reasonPublic: why, amount: 0 }; });
        const tot = lines.filter((l) => l.eligible).reduce((a, l) => a + l.days, 0); lines.forEach((l) => { l.amount = l.eligible && sc.pool != null && tot ? Math.round(sc.pool * l.days / tot * 100) / 100 : null; });
        const id = seqId('incentiveSheets', 'INS', 2, Y()).replace(/-(\d+)$/, (m, n) => '-' + v.period.slice(5)); const sid = L('incentiveSheets').some((x) => x.id === id) ? id + '-' + (L('incentiveSheets').length + 1) : id;
        st.insert('incentiveSheets', { id: sid, schemeId: sc.id, period: v.period, status: 'draft', preparedBy: SA.session.userId, createdAt: new Date().toISOString(), approvalId: null, transferredAt: null, lines }); aud('HR.RCG.SHEET_PREPARED', 'incentive_sheet', sid, sc.name + ' ' + v.period, { after: { مؤهلون: lines.filter((l) => l.eligible).length, إجمالي: lines.length } }); SA.toast('وُلِّد الكشف ' + sid, 'success'); } });
  }
  function submitSheet(sh) {
    return confirmAct({ title: 'إرسال الكشف للاعتماد', confirmLabel: 'إرسال للاعتماد', impact: ['يدخل صندوق الاعتمادات: HR Manager ثم المالية.', 'أنت من أعدّ الكشف — لا يمكنك اعتماده.', 'الترحيل للمرتبات بعد الاعتماد فقط.'],
      run: () => { const ap = SA.requestApproval({ type: 'incentive_sheet', title: 'كشف حافز ' + sh.id + ' — ' + (find('incentiveSchemes', sh.schemeId) || {}).name + ' · بيانات تجريبية', chain: [{ roleId: 'R-11', label: 'مدير الموارد البشرية (HR Manager)' }, { roleId: 'R-07', label: 'المالية (اعتماد المبالغ)' }], context: [['الكشف', sh.id], ['الفترة', sh.period], ['المؤهلون', sh.lines.filter((l) => l.eligible).length + ' من ' + sh.lines.length], ['ملاحظة', 'المبالغ T3 (hr.salary.view). من أعدّ الكشف لا يعتمده.']], ref: { type: 'incentive_sheet', id: sh.id } }); st.patch('incentiveSheets', sh.id, { status: 'pending_approval', approvalId: ap.id }); }, success: 'أُرسل الكشف إلى صندوق الاعتمادات' });
  }
  function transferSheet(sh) {
    if (sh.preparedBy === SA.session.userId) { SA.toast('من أعدّ الكشف لا يرحّله — فصل مهام.', 'warn'); return; }
    const n = sh.lines.filter((l) => l.eligible).length;
    return confirmAct({ title: 'ترحيل الكشف للمرتبات', confirmLabel: 'ترحيل', impact: ['يُرحَّل ' + n + ' بند حافز كمكوّن مرتب إلى دورة المرتبات (HR-14).', 'التصنيف التأميني للحافز {Open} — لا يُفترض.', 'لا يمكن تعديل الكشف بعد الترحيل إلا بفتحه من جديد بسبب مكتوب.'],
      run: () => { st.update('payrollInputs', (l) => sh.lines.filter((x) => x.eligible).forEach((x) => l.push({ id: 'PI-' + Y() + '-' + String(l.length + 1).padStart(4, '0'), kind: 'incentive', employeeId: x.employeeId, amount: x.amount, source: sh.id, label: 'حافز ' + sh.period, period: sh.period, status: 'pending', createdAt: new Date().toISOString() }))); st.patch('incentiveSheets', sh.id, { status: 'transferred', transferredAt: new Date().toISOString(), transferredBy: SA.session.userId }); aud('HR.RCG.SHEET_TRANSFERRED', 'incentive_sheet', sh.id, sh.id, { after: { بنود: n } }); notify('حافز مُرحَّل للمرتبات', 'رُحّل كشف حافز ' + sh.id + ' إلى مدخلات المرتبات (N-36).', 'info', ['R-13'], '#/hr/payroll'); }, success: 'رُحّل الكشف للمرتبات' });
  }
  function openSheet(id) {
    liveDrawer({ title: 'كشف الحافز', paths: ['incentiveSheets', 'approvals'], build() {
      const sh = find('incentiveSheets', id); if (!sh) return false; const sc = find('incentiveSchemes', sh.schemeId) || {}; const ap = sh.approvalId ? find('approvals', sh.approvalId) : null; const sal = SA.can('hr.salary.view');
      const foot = []; if (sh.status === 'draft') foot.push(btn({ label: 'إرسال للاعتماد', icon: 'check', kind: 'primary', reason: rcgEdit() || (sh.preparedBy !== SA.session.userId ? 'يُرسله مُعِدّ الكشف' : ''), onClick: () => submitSheet(sh) }));
      if (sh.status === 'approved') foot.push(btn({ label: 'ترحيل للمرتبات', icon: 'swap', kind: 'primary', reason: rcgEdit() || (sh.preparedBy === SA.session.userId ? 'من أعدّ الكشف لا يرحّله' : ''), onClick: () => transferSheet(sh) }));
      return { title: sh.id, subtitle: sc.name + ' · ' + sh.period, foot, body: h('div.sap-drawer-inner', {}, h('div.sap-hp-row.is-between', {}, stChip(SH_ST, sh.status), sal ? null : secret('المبالغ T3 مخفية')), SA.stepper(['مسودة', 'اعتماد HR', 'اعتماد المالية', 'مُرحَّل'], sh.status === 'draft' ? 0 : sh.status === 'pending_approval' ? (ap && ap.chain[0] && ap.chain[0].status === 'approved' ? 2 : 1) : sh.status === 'approved' ? 3 : 4),
        SA.kv([['أعدّه', uname(sh.preparedBy)], ['الاعتماد', ap ? h('a', { href: SA.link.approval(ap.id) }, ap.id) : '—'], ['الأهلية', sal ? 'مبالغ + أسباب' : 'مؤهل / غير مؤهل وسبب عام فقط'], ['المؤهلون', sh.lines.filter((l) => l.eligible).length + ' من ' + sh.lines.length]]),
        sec('بنود الكشف', h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الموظف'), h('th', {}, 'أيام الحضور'), h('th', {}, 'الأهلية'), h('th', {}, 'الحافز'))), h('tbody', {}, sh.lines.map((l) => h('tr', {}, h('td', {}, empCell(emp(l.employeeId), '')), h('td', {}, N(l.days)), h('td', {}, l.eligible ? SA.chip('مؤهل', 'success') : h('span', {}, SA.chip('غير مؤهل', 'neutral'), ' ', h('small', {}, l.reasonPublic))), h('td', {}, l.eligible ? (l.amount == null ? openTag('غير مُعدّ') : money(l.amount)) : '—'))))))),
        sc.mode === 'crew' ? h('div.sap-hp-formula', {}, 'نصيب الفرد = الوعاء × أيام حضوره ÷ مجموع أيام حضور المؤهلين') : null, h('p.sap-hp-note', {}, 'البوابة موضوعية: تقرأ الحضور والإنتاج فقط — ممنوع ربطها بحالة تأديبية أو استخدام حجب الحافز كعقوبة (BR-RCG-04). الاستبعاد = «لم يستوفِ شرط الحضور». الأرقام DEMO.')) };
    } });
  }
  function tabSheets(view) {
    return SA.live(view, () => { const t = tcard({ caption: 'كشوف الحافز الشهرية', rows: () => L('incentiveSheets'), onRowClick: (s) => openSheet(s.id), columns: [{ key: 'id', label: 'الكشف', render: (s) => h('div', {}, h('b', {}, s.id), h('div.sap-hp-note', {}, (find('incentiveSchemes', s.schemeId) || {}).name)) }, { key: 'p', label: 'الفترة', render: (s) => N(s.period) }, { key: 'el', label: 'المؤهلون', render: (s) => N(s.lines.filter((l) => l.eligible).length + ' / ' + s.lines.length) }, { key: 'tot', label: 'الإجمالي', render: (s) => { const tt = s.lines.reduce((a, l) => a + (l.amount || 0), 0); return tt ? money(tt) : openTag('غير مُعدّ'); } }, { key: 'by', label: 'أعدّه', render: (s) => uname(s.preparedBy) }, { key: 'st', label: 'الحالة', render: (s) => stChip(SH_ST, s.status) }],
      empty: { icon: 'coins', title: 'لا كشوف', text: 'أعدّ كشف الشهر من خطة نشطة.', action: { label: 'كشف جديد', perm: 'hr.recognition.edit', onClick: newSheet } } });
      return h('div.sap-hp-view', {}, SA.alert('info', 'مسار الكشف: إعداد ← اعتماد HR Manager ← اعتماد المالية (صندوق الاعتمادات المشترك) ← ترحيل لـHR-14 كمكوّن مرتب. المشرف يرى «مؤهل/غير مؤهل» وسببًا عامًا فقط — المبالغ T3.'), t.el, h('div.sap-hp-row', {}, btn({ label: 'إعداد كشف جديد', icon: 'plus', kind: 'ghost', perm: 'hr.recognition.edit', onClick: newSheet }), specLink('m-rcg-03'))); }, ['incentiveSheets', 'approvals']);
  }

  /* ── الاقتراحات ── */
  function submitSuggestion() {
    return formModal({ title: 'تقديم اقتراح', subtitle: 'باسمك أو مجهولًا — الرد مكتوب دائمًا، ومع المجهول يُنشر برمز متابعة.', icon: 'sparkle', size: 'sm', submitLabel: 'إرسال الاقتراح',
      fields: [{ name: 'anon', label: 'إرسال مجهولًا (برمز متابعة)', type: 'switch' }, { name: 'text', label: 'الاقتراح', type: 'textarea', required: true, rows: 3 }],
      onSubmit: (v) => { const id = seqId('suggestions', 'SG', 4, Y()); const code = v.anon ? 'SG-' + Math.random().toString(36).slice(2, 6).toUpperCase() : null; const me = myEmp(); st.insert('suggestions', { id, employeeId: v.anon ? null : (me ? me.id : null), followCode: code, text: v.text.trim(), status: 'submitted', reply: '', createdAt: new Date().toISOString(), decidedBy: null }); aud('HR.RCG.SUGGESTION_SUBMITTED', 'suggestion', id, 'اقتراح', { after: { مجهول: !!v.anon } }); SA.toast(code ? 'أُرسل الاقتراح. رمز المتابعة: ' + code : 'أُرسل الاقتراح', 'success', { ms: 8000 }); } });
  }
  function decideSuggestion(sg, kind) {
    const lbl = { accepted: 'قبول', rejected: 'رفض', implemented: 'تسجيل التنفيذ' }[kind];
    return formModal({ title: lbl + ' الاقتراح ' + sg.id, subtitle: 'اكتب سبب القبول أو الرفض قبل الإغلاق — رد مكتوب دائمًا.', icon: kind === 'rejected' ? 'xcircle' : 'checkcircle', size: 'sm', submitLabel: lbl, fields: [{ name: 'reply', label: 'الرد على المقترح', type: 'textarea', required: true, rows: 3 }],
      check: (v) => (String(v.reply).trim().length < 5 ? { reply: 'اكتب سبب القبول أو الرفض قبل الإغلاق.' } : null),
      onSubmit: (v) => { st.patch('suggestions', sg.id, { status: kind, reply: v.reply.trim(), decidedBy: SA.session.userId, decidedAt: new Date().toISOString() }); aud('HR.RCG.SUGGESTION_DECIDED', 'suggestion', sg.id, 'اقتراح', { after: { قرار: lbl } }); SA.toast('سُجّل القرار والرد', 'success'); } });
  }
  function tabSuggestions(view) {
    return SA.live(view, () => { const t = tcard({ caption: 'صندوق الاقتراحات', rows: () => L('suggestions'), filters: [{ key: 'status', label: 'الحالة', options: Object.keys(SG_ST).map((k) => [k, SG_ST[k][0]]) }],
      columns: [{ key: 'id', label: 'الاقتراح', render: (s) => h('div', {}, h('b', {}, s.id), h('div.sap-hp-note', {}, s.followCode ? 'مجهول · ' + s.followCode : en(s.employeeId))) }, { key: 't', label: 'النص', render: (s) => h('span', { title: s.text }, s.text.length > 70 ? s.text.slice(0, 70) + '…' : s.text) }, { key: 'age', label: 'العمر', render: (s) => { const d = dd(String(s.createdAt).slice(0, 10), T()); return ['submitted', 'under_review'].indexOf(s.status) >= 0 && d > 14 ? SA.chip('تجاوز SLA ' + d + ' يومًا', 'danger') : ago(s.createdAt); } }, { key: 'st', label: 'الحالة', render: (s) => stChip(SG_ST, s.status) }, { key: 'rep', label: 'الرد', render: (s) => (s.reply ? h('span', { title: s.reply }, s.reply.slice(0, 40) + (s.reply.length > 40 ? '…' : '')) : '—') }],
      rowActions: (s) => [s.status === 'submitted' ? { label: 'بدء الفحص', icon: 'play', disabled: rcgEdit(), onClick: () => run(() => st.patch('suggestions', s.id, { status: 'under_review' })).then(() => SA.toast('قيد الفحص', 'success')) } : null, ['submitted', 'under_review'].indexOf(s.status) >= 0 ? { label: 'قبول بالرد', icon: 'check', disabled: rcgEdit(), onClick: () => decideSuggestion(s, 'accepted') } : null, ['submitted', 'under_review'].indexOf(s.status) >= 0 ? { label: 'رفض بسبب مكتوب', icon: 'xcircle', danger: true, disabled: rcgEdit(), onClick: () => decideSuggestion(s, 'rejected') } : null, s.status === 'accepted' ? { label: 'تسجيل التنفيذ', icon: 'checkcircle', disabled: rcgEdit(), onClick: () => decideSuggestion(s, 'implemented') } : null, s.status === 'implemented' && s.employeeId ? { label: 'ترشيح للتقدير (اقتراح مُنفَّذ)', icon: 'star', disabled: rcgEdit(), onClick: () => { st.insert('awards', { id: seqId('awards', 'AW', 4, Y()), employeeId: s.employeeId, typeId: 'RT-4', nominatedBy: SA.session.userId, reason: 'اقتراح مُنفَّذ: ' + s.text.slice(0, 60), status: 'nominated', createdAt: new Date().toISOString(), certNo: null, publish: null }); st.patch('suggestions', s.id, { status: 'rewarded' }); aud('HR.RCG.NOMINATED', 'award', s.id, 'اقتراح مُنفَّذ', { after: { نوع: 'اقتراح مُنفَّذ' } }); SA.toast('رُشّح للتقدير', 'success'); } } : null],
      empty: { icon: 'sparkle', title: 'الصندوق فاضي', action: { label: 'تقديم اقتراح', onClick: submitSuggestion } } });
      return h('div.sap-hp-view', {}, kpiRow([['بانتظار الفرز', N(L('suggestions').filter((s) => s.status === 'submitted').length)], ['قيد الفحص', N(L('suggestions').filter((s) => s.status === 'under_review').length)], ['مُنفَّذة', N(L('suggestions').filter((s) => ['implemented', 'rewarded'].indexOf(s.status) >= 0).length)]]), t.el, h('div.sap-hp-row', {}, btn({ label: 'تقديم اقتراح (محاكاة موظف)', icon: 'plus', kind: 'ghost', onClick: submitSuggestion }), h('span.sap-hp-note', {}, 'SLA الرد ' + 14 + ' يومًا. المقترح المنفَّذ يُرشَّح للتقدير. '), specLink('m-rcg-04'))); }, ['suggestions']);
  }

  /* ── استطلاع النبض (مجهول) ── */
  const activeSurvey = () => L('surveys').find((s) => s.status === 'open') || L('surveys')[0];
  const SCALE = ['غير موافق بشدة', 'غير موافق', 'محايد', 'موافق', 'موافق بشدة'];
  function surveyResults(sv) {
    const minN = sv.minGroupSize; const byG = {};
    L('surveyAnswers').filter((a) => a.surveyId === sv.id).forEach((a) => { const g = (byG[a.groupKey] = byG[a.groupKey] || { q: {} }); (g.q[a.questionId] = g.q[a.questionId] || []).push(a.value); });
    let groups = Object.keys(byG).map((k) => ({ key: k, label: deptName(k), q: byG[k].q, n: (byG[k].q[sv.questions[0].id] || []).length, invited: emps().filter((e) => e.departmentId === k && e.status !== 'terminated').length }));
    if (minN != null) { const small = groups.filter((g) => g.n < minN); const big = groups.filter((g) => g.n >= minN); if (small.length) { const mq = {}; small.forEach((g) => Object.keys(g.q).forEach((q) => { mq[q] = (mq[q] || []).concat(g.q[q]); })); big.push({ key: '__m', label: 'مجموعات صغيرة مدمجة', q: mq, n: small.reduce((a, g) => a + g.n, 0), invited: small.reduce((a, g) => a + g.invited, 0), merged: true, mergedKeys: small.map((g) => g.label) }); } groups = big; }
    return groups.map((g) => Object.assign(g, { hidden: minN == null || g.n < minN, avgs: sv.questions.map((q) => { const a = g.q[q.id] || []; return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }) }));
  }
  function answerSurvey(sv) {
    const me = myEmp(); const empF = me ? null : SA.form.field({ name: 'e', label: 'بصفتي الموظف (محاكاة دخول بكود + PIN)', type: 'select', required: true, options: empOpts((e) => !!e.departmentId) }); const picks = {};
    const rows = sv.questions.map((q) => { const w = ratingWidget({ title: q.text, anchors: SCALE }, 0, (n) => { picks[q.id] = n; }, false); return h('div.sap-hp-crit', {}, h('b', {}, q.text), w); });
    const m = SA.modal({ title: sv.title + ' — الإجابة بسرية', subtitle: 'الإجابات مجمّعة بالمجموعة ولا تُربط باسمك. لا IP ولا جهاز مع الإجابة.', icon: 'sparkle', size: 'md', body: h('div.sap-confirm', {}, SA.alert('info', 'يُسجَّل «شاركت» في جدول منفصل تمامًا عن الإجابات (لا مفتاح مشترك) — لا طريق لمعرفة من أجاب بماذا.'), empF ? empF.el : null, rows), foot: [hbtn('إلغاء', () => m.close()), h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      const eid = me ? me.id : (empF.validate() ? empF.get() : null); if (!eid) return; if (sv.questions.some((q) => !picks[q.id])) { SA.toast('أجب عن كل الأسئلة (5 ضغطات).', 'error'); return; }
      if (L('surveyParts').some((p) => p.surveyId === sv.id && p.employeeId === eid)) { SA.toast('سبق وشاركت في هذا الاستطلاع — إجابة واحدة لكل موظف.', 'warn'); return; }
      const e = emp(eid); const gk = e.departmentId; m.setBusy(true);
      try { await SA.api(() => { st.insert('surveyParts', { surveyId: sv.id, employeeId: eid, at: new Date().toISOString() }); st.update('surveyAnswers', (l) => sv.questions.forEach((q) => l.push({ surveyId: sv.id, groupKey: gk, questionId: q.id, value: picks[q.id] }))); }); m.close(); SA.toast('شكرًا — سُجّلت مشاركتك وإجابتك مجهولة', 'success'); } catch (er) { m.setBusy(false); SA.fail(er); } } }, 'إرسال الإجابة')] });
  }
  function newSurvey() {
    const depts = (st.get('departments') || []).filter((d) => ['D-09', 'D-10', 'D-11', 'D-12'].indexOf(d.id) >= 0);
    return formModal({ title: 'استطلاع نبض جديد', subtitle: 'حتى 5 أسئلة بمقاييس مصوّرة. الحد الأدنى لحجم المجموعة {Open — المقترح 5}.', icon: 'sparkle', size: 'md', submitLabel: 'إطلاق الاستطلاع',
      fields: [{ name: 'title', label: 'العنوان', required: true, value: 'نبض الربع القادم' }, { name: 'qs', label: 'الأسئلة (سطر لكل سؤال — حتى 5)', type: 'textarea', required: true, rows: 5, value: 'أشعر بالأمان أثناء العمل\nأحصل على التدريب الذي أحتاجه' }, { name: 'groups', label: 'الجمهور (المجموعات)', type: 'multi', required: true, value: depts.map((d) => d.id), options: depts.map((d) => [d.id, d.name]) }, { name: 'min', label: 'الحد الأدنى لحجم المجموعة للعرض', type: 'number', min: 2, hint: 'اتركه فارغًا = غير مُعدّ — تُحجب النتائج حتى يُحدَّد.' }, { name: 'close', label: 'ينتهي في', type: 'date', required: true, value: D(14) }],
      check: (v) => { const n = v.qs.split('\n').map((x) => x.trim()).filter(Boolean).length; if (n > 5) return { qs: 'الحد الأقصى 5 أسئلة.' }; if (!n) return { qs: 'أضف سؤالًا واحدًا على الأقل.' }; return null; },
      onSubmit: (v) => { const id = 'SV-' + Y() + '-' + String(L('surveys').length + 1).padStart(2, '0'); st.update('surveys', (l) => l.forEach((x) => { if (x.status === 'open') x.status = 'closed'; })); st.insert('surveys', { id, title: v.title, questions: v.qs.split('\n').map((x) => x.trim()).filter(Boolean).map((t, i) => ({ id: 'q' + (i + 1), text: t })), groups: v.groups, minGroupSize: v.min || null, opensAt: T(), closesAt: v.close, status: 'open', createdBy: SA.session.userId }); aud('HR.RCG.SURVEY_LAUNCHED', 'survey', id, v.title, { after: { أسئلة: v.qs.split('\n').filter(Boolean).length, حد_أدنى: v.min || 'غير مُعدّ' } }); notify('استطلاع نبض مفتوح', 'يوجد استطلاع جديد — شاركنا رأيك بسرية (N-37).', 'info', ['R-14', 'R-16'], '#/hr/ess'); SA.toast('أُطلق الاستطلاع', 'success'); } });
  }
  function setMinGroup(sv) {
    return formModal({ title: 'الحد الأدنى لحجم مجموعة النتائج', subtitle: 'أي مجموعة أقل لا تُعرض ولا تُصدَّر وتُدمج في مجموعة أعلى قبل الحساب.', icon: 'shield', size: 'sm', submitLabel: 'حفظ الحد', step: 'policy.change', stepTitle: 'تعديل حماية سرية الاستطلاع',
      fields: [{ name: 'min', label: 'الحد الأدنى (مجيبون)', type: 'number', required: true, min: 2, value: sv.minGroupSize == null ? '' : sv.minGroupSize, hint: 'المقترح 5 — القرار Open. التقليل يُسجَّل بخطورة عالية.' }, { name: 'why', label: 'سبب التعديل', type: 'textarea', required: true, rows: 2 }],
      onSubmit: (v) => { st.patch('surveys', sv.id, { minGroupSize: v.min }); aud('HR.RCG.SURVEY_SETTING_CHANGED', 'survey', sv.id, sv.title, { before: { حد: sv.minGroupSize == null ? 'غير مُعدّ' : sv.minGroupSize }, after: { حد: v.min }, reason: v.why }); SA.toast('حُفظ الحد الأدنى — النتائج تُعرض للمجموعات المؤهلة', 'success'); } });
  }
  let resLogged = '';
  function tabPulse(view) {
    return SA.live(view, () => {
      const sv = activeSurvey(); if (!sv) return h('div.sap-hp-view', {}, SA.card({}, SA.empty({ icon: 'sparkle', title: 'لا استطلاعات', action: { label: 'استطلاع جديد', perm: 'hr.recognition.edit', onClick: newSurvey } })));
      if (resLogged !== sv.id) { resLogged = sv.id; aud('HR.RCG.SURVEY_RESULTS_VIEWED', 'survey', sv.id, sv.title, { severity: 'info' }); }
      const res = surveyResults(sv); const parts = L('surveyParts').filter((p) => p.surveyId === sv.id).length; const invited = emps().filter((e) => sv.groups.indexOf(e.departmentId) >= 0 && e.status !== 'terminated').length; const minN = sv.minGroupSize;
      return h('div.sap-hp-view', {}, SA.alert('info', h('b', {}, 'الاستطلاع مجهول: '), 'جدول «المشاركة» منفصل عن جدول «الإجابات» ولا مفتاح مشترك. النتائج مجمّعة فقط ولا يوجد تصدير للإجابات الخام.'),
        kpiRow([['الاستطلاع', h('span', { style: { fontSize: '1.05rem' } }, sv.title), { sub: 'ينتهي ' + fd(sv.closesAt) }], ['المشاركون', N(parts + ' / ' + invited), { sub: invited ? Math.round(parts / invited * 100) + '% مشاركة' : '' }], ['الحد الأدنى لحجم المجموعة', minN == null ? openTag('غير مُعدّ') : N(minN), { sub: 'مقترح 5 — Open' }]]),
        minN == null ? SA.alert('warning', h('b', {}, 'الحد الأدنى غير مُعدّ (Open): '), 'تُحجب كل النتائج حتى تحدّده. ', btn({ label: 'تحديد الحد الأدنى', icon: 'shield', kind: 'primary', size: 'sm', perm: 'hr.recognition.edit', onClick: () => setMinGroup(sv) })) : null,
        SA.card({ title: 'النتائج المجمّعة حسب المجموعة', actions: minN != null ? btn({ label: 'تعديل الحد', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'hr.recognition.edit', onClick: () => setMinGroup(sv) }) : null, flush: true }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'المجموعة'), h('th', {}, 'المجيبون'), h('th', {}, 'المشاركة'), sv.questions.map((q) => h('th', { title: q.text }, q.text.length > 18 ? q.text.slice(0, 18) + '…' : q.text)))), h('tbody', {}, res.map((g) => h('tr', {}, h('td', {}, h('b', {}, g.label), g.merged ? h('div.sap-hp-note', {}, g.mergedKeys.join('، ')) : null), h('td', {}, N(g.hidden ? '—' : g.n)), h('td', {}, g.hidden ? '—' : N(g.invited ? Math.round(g.n / g.invited * 100) + '%' : '—')), g.hidden ? h('td', { colspan: sv.questions.length }, h('span.sap-hp-secret', {}, SA.icon('lock', 'icon-sm'), minN == null ? 'محجوبة — الحد الأدنى غير مُعدّ' : 'عدد المجيبين أقل من الحد الأدنى (' + minN + '). لا تُعرض النتائج لحماية سرية المجيبين.')) : g.avgs.map((a) => h('td', {}, a == null ? '—' : h('span', {}, h('b.num', {}, a.toFixed(2)), h('span.sap-hp-note', {}, ' / 5'))))))))), res.length ? null : h('div.sap-card-body', {}, h('p.sap-hp-note', {}, 'لا إجابات بعد.'))),
        h('div.sap-hp-row', {}, btn({ label: 'أجب عن الاستطلاع (محاكاة موظف)', icon: 'play', kind: 'ghost', onClick: () => answerSurvey(sv) }), btn({ label: 'استطلاع جديد', icon: 'plus', kind: 'ghost', perm: 'hr.recognition.edit', onClick: newSurvey }), specLink('m-rcg-06')));
    }, ['surveys', 'surveyAnswers', 'surveyParts']);
  }

  /* ── خطر ترك العمل ── */
  function retentionCandidates() {
    const lateRule = cfg('retention.lateRule', null); const brad = cfg('retention.bradfordThreshold', null); const out = [];
    emps().filter((e) => e.status !== 'terminated').forEach((e) => { const a = attStats(e.id); if (!a.total) return; if (lateRule != null && a.late >= lateRule) out.push({ e, rule: 'تأخير متكرر', reason: 'تأخر ' + a.late + ' مرات في الفترة المرصودة (إشارة محادثة فقط).' }); if (brad != null) { const S = a.absent, D = a.absent; if (S * S * D >= brad) out.push({ e, rule: 'غياب متكرر (Bradford)', reason: 'مؤشر Bradford ' + (S * S * D) + ' بعد استبعاد المرضي/الإصابة/الوضع.' }); } });
    return out;
  }
  function runRetentionJob() {
    return confirmAct({ title: 'تشغيل فحص خطر الترك الأسبوعي', confirmLabel: 'تشغيل الفحص', impact: ['يُقيَّم الحضور فقط وفق القواعد المعرّفة (قابلة للتعديل).', 'لا مدخلات من الاستطلاع المجهول، ولا يُتخذ أي إجراء سلبي.', 'الإشعار لمدير الموارد البشرية فقط (N-38).'],
      run: () => { let n = 0; retentionCandidates().forEach((c) => { if (L('retentionFlags').some((f) => f.employeeId === c.e.id && f.rule === c.rule && ['resolved', 'closed'].indexOf(f.status) < 0)) return; st.insert('retentionFlags', { id: seqId('retentionFlags', 'RF', 3), employeeId: c.e.id, rule: c.rule, reason: c.reason, flaggedAt: new Date().toISOString(), status: 'flagged', note: '' }); aud('HR.RCG.RETENTION_FLAGGED', 'retention', c.e.id, c.e.name, { after: { قاعدة: c.rule } }); n++; }); if (n) notify('قائمة المراقبة', 'أُضيف ' + n + ' إلى قائمة المراقبة (N-38).', 'info', ['R-11'], '#/hr/recognition?tab=retention'); SA.toast(n ? 'أُضيف ' + n + ' إلى القائمة' : 'لا إضافات جديدة', n ? 'success' : 'info'); } });
  }
  function updateRetention(f, nxt) {
    return formModal({ title: nxt === 'talked' ? 'تسجيل المحادثة' : nxt === 'resolved' ? 'إغلاق كمحلولة' : 'إغلاق', subtitle: en(f.employeeId) + ' — محادثة «ليه ممكن تمشي؟» وليست إجراءً سلبيًا.', icon: 'user', size: 'sm', submitLabel: 'تحديث', fields: [{ name: 'note', label: 'ملاحظة المتابعة', type: 'textarea', required: true, rows: 3 }],
      onSubmit: (v) => { st.patch('retentionFlags', f.id, { status: nxt, note: v.note }); aud('HR.RCG.RETENTION_UPDATED', 'retention', f.employeeId, en(f.employeeId), { after: { حالة: RF_ST[nxt][0] } }); SA.toast('تم التحديث', 'success'); } });
  }
  function editRetentionRules() {
    return formModal({ title: 'قواعد خطر الترك', subtitle: 'تعديلها يُسجَّل بخطورة عالية ويسري بلا أثر رجعي. لا مدخلات من الاستطلاع المجهول.', icon: 'gauge', size: 'sm', submitLabel: 'حفظ القواعد', step: 'policy.change',
      fields: [{ name: 'late', label: 'عدد التأخيرات لإشارة «تأخير متكرر»', type: 'number', min: 1, value: cfg('retention.lateRule', null), hint: 'فارغ = القاعدة متوقفة.' }, { name: 'brad', label: 'عتبة Bradford (S² × D)', type: 'number', min: 1, value: cfg('retention.bradfordThreshold', null), hint: 'العتبة {Open} — فارغ = غير مُعدّة والقاعدة متوقفة.' }, { name: 'why', label: 'السبب', type: 'textarea', required: true, rows: 2 }],
      onSubmit: (v) => { st.update('settings.hrProtect.retention', (r) => { r.lateRule = v.late; r.bradfordThreshold = v.brad; }); aud('HR.RCG.RETENTION_RULE_CHANGED', 'retention', 'rules', 'قواعد خطر الترك', { after: { تأخير: v.late == null ? 'متوقفة' : v.late, bradford: v.brad == null ? 'غير مُعدّة' : v.brad }, reason: v.why }); SA.toast('حُفظت القواعد', 'success'); } });
  }
  function tabRetention(view) {
    if (!isHrMgr()) { SA.audit('ACCESS.DENIED', { target: { type: 'screen', id: 'hr-recognition:retention', label: 'قائمة خطر الترك' }, result: 'denied' }); return SA.denied({ perm: 'hr.retention.view', title: 'هذه القائمة متاحة لمدير الموارد البشرية فقط (T2)', text: 'علامات خطر الترك لا تظهر للمشرفين ولا للمالية، ولا يُبنى عليها إجراء سلبي.', home: false }); }
    return SA.live(view, () => { const lateRule = cfg('retention.lateRule', null); const brad = cfg('retention.bradfordThreshold', null);
      const t = tcard({ caption: 'قائمة المراقبة', rows: () => L('retentionFlags'), columns: [{ key: 'e', label: 'الموظف', render: (f) => empCell(emp(f.employeeId)) }, { key: 'rule', label: 'القاعدة', render: (f) => f.rule }, { key: 'rs', label: 'سبب الإشارة', render: (f) => f.reason }, { key: 'st', label: 'الحالة', render: (f) => stChip(RF_ST, f.status) }, { key: 'n', label: 'ملاحظة', render: (f) => f.note || '—' }],
        rowActions: (f) => [f.status === 'flagged' ? { label: 'تسجيل المحادثة', icon: 'user', onClick: () => updateRetention(f, 'talked') } : null, f.status === 'talked' ? { label: 'إغلاق كمحلولة', icon: 'checkcircle', onClick: () => updateRetention(f, 'resolved') } : null, ['flagged', 'talked'].indexOf(f.status) >= 0 ? { label: 'إغلاق بدون إجراء', icon: 'xcircle', onClick: () => updateRetention(f, 'closed') } : null], empty: { icon: 'user', title: 'لا إشارات', text: 'شغّل الفحص الأسبوعي لتقييم القواعد.' } });
      return h('div.sap-hp-view', {}, SA.alert('warning', h('b', {}, 'للمحادثة فقط: '), 'لا تدخل إجابات الاستطلاع المجهولة في هذه القائمة، ولا تُستخدم أساسًا لأي تقييم أو جزاء أو إنهاء (BR-RCG-10).'),
        SA.card({ title: 'القواعد المعرّفة', actions: btn({ label: 'تعديل القواعد', icon: 'edit', kind: 'ghost', size: 'sm', onClick: editRetentionRules }) }, SA.kv([['تأخير متكرر', lateRule == null ? openTag('متوقفة') : 'عند ' + lateRule + ' تأخيرات فأكثر'], ['غياب متكرر (Bradford)', brad == null ? openTag('العتبة غير مُعدّة') : 'S² × D ≥ ' + brad], ['لا علاوة > 12 شهرًا', h('span', {}, SA.chip('متوقفة', 'neutral'), ' يحتاج تاريخ العلاوات من HR-13')]]), h('div.sap-hp-formula', {}, 'Bradford = S² × D — S: مرات الغياب المتفرقة · D: إجمالي أيام الغياب (بعد استبعاد المرضي المثبت/الإصابة/الوضع)')), t.el, h('div.sap-hp-row', {}, btn({ label: 'تشغيل الفحص الأسبوعي', icon: 'refresh', kind: 'ghost', onClick: runRetentionJob }), specLink('m-rcg-07'))); }, ['retentionFlags', 'settings']);
  }

  const rcgBadge = () => { const n = L('awards').filter((a) => a.status === 'nominated').length + L('suggestions').filter((s) => s.status === 'submitted').length; return n || null; };
  screen({ id: 'hr-recognition', route: 'hr/recognition', perm: 'hr.recognition.view', title: 'التحفيز والتقدير', icon: 'sparkle', order: 45, desc: 'ترشيح التقدير والجوائز، خطط الحوافز التي تغذّي المرتبات بعد الاعتماد، صندوق الاقتراحات، واستطلاع النبض المجهول بحد أدنى لحجم المجموعة.', watch: ['awards', 'suggestions'], badge: rcgBadge, tags: () => [SA.tag('new', 'HR-22')],
    tabs: [
      { id: 'awards', label: 'التقدير والجوائز', icon: 'star', render: tabAwards, primary: () => btn({ label: 'ترشيح تقدير', icon: 'plus', kind: 'accent', perm: 'hr.recognition.edit', onClick: nominate }), badge: () => L('awards').filter((a) => a.status === 'nominated').length || null },
      { id: 'schemes', label: 'خطط الحوافز', icon: 'coins', render: tabSchemes, primary: () => btn({ label: 'خطة جديدة', icon: 'plus', kind: 'accent', perm: 'hr.recognition.edit', onClick: () => editScheme() }) },
      { id: 'sheets', label: 'كشوف الحافز', icon: 'receipt', render: tabSheets, primary: () => btn({ label: 'إعداد كشف', icon: 'plus', kind: 'accent', perm: 'hr.recognition.edit', onClick: newSheet }) },
      { id: 'suggestions', label: 'صندوق الاقتراحات', icon: 'sparkle', render: tabSuggestions, badge: () => L('suggestions').filter((s) => s.status === 'submitted').length || null },
      { id: 'pulse', label: 'استطلاع النبض', icon: 'activity', render: tabPulse, primary: () => btn({ label: 'استطلاع جديد', icon: 'plus', kind: 'accent', perm: 'hr.recognition.edit', onClick: newSurvey }) },
      { id: 'retention', label: 'خطر ترك العمل', icon: 'user', render: tabRetention, when: () => true }
    ] });

  /* ═════════════════════════════ مزامنة قرارات صندوق الاعتمادات مع السجلات المصدر ═════════════════════════════ */
  let recBusy = false;
  function reconcile() {
    if (recBusy || !st.get('meta') || !st.get('meta.hrProtectSeeded')) return;
    recBusy = true;
    try {
      const apps = L('approvals');
      L('dismissals').forEach((d) => {
        const ap = apps.find((a) => a.id === d.approvalId); if (!ap) return; const c1 = ap.chain[0]; const e = emp(d.employeeId);
        if ((ap.status === 'rejected' || ap.status === 'changes_requested') && ['returned', 'rejected'].indexOf(d.status) < 0) {
          const bad = ap.chain.find((c) => c.status === 'rejected'); st.patch('dismissals', d.id, { status: 'returned', returnReason: bad ? bad.reason : 'بطلب تعديل', log: (d.log || []).concat([{ at: new Date().toISOString(), text: 'أُعيد لرئيس القسم: ' + (bad ? bad.reason : '') }]) });
          aud('HR.DSC.DISMISSAL_LEGAL_REVIEWED', 'dismissal', d.id, 'طلب فصل — ' + (e ? e.name : ''), { result: 'failure', after: { قرار: ap.status === 'rejected' ? 'مرفوض' : 'طلب تعديل' }, reason: bad ? bad.reason : '' }); notify('طلب أُعيد', 'أُعيد ملف طلب بسبب مكتوب (N-56).', 'action', ['R-11'], '#/hr/disciplinary?tab=dismissal'); return;
        }
        if (c1 && c1.status === 'approved' && !d.legalReviewedAt && d.status === 'legal_review') { st.patch('dismissals', d.id, { legalReviewedAt: new Date().toISOString(), status: 'gm_review' }); aud('HR.DSC.DISMISSAL_LEGAL_REVIEWED', 'dismissal', d.id, 'طلب فصل — ' + (e ? e.name : ''), { after: { قرار: 'اعتُمدت المراجعة القانونية' }, reason: c1.reason || '' }); notify('طلب بانتظار اعتماد GM', 'ملف بانتظار اعتماد المدير العام (N-56).', 'action', ['R-02'], '#/approvals/' + ap.id); }
        if (ap.status === 'approved' && ['approved', 'court', 'blocked'].indexOf(d.status) < 0) {
          const sick = sickLeaveBlock(d.employeeId);
          if (sick) { st.patch('dismissals', d.id, { status: 'blocked' }); aud('HR.DSC.DISMISSAL_BLOCKED', 'dismissal', d.id, 'طلب فصل — ' + (e ? e.name : ''), { result: 'denied', reason: 'إجازة مرضية مثبتة عند خطوة الاعتماد — حظر آلي', severity: 'critical' }); notify('حظر آلي لطلب فصل', 'حُظر اعتماد طلب لوجود مانع نظامي (N-56).', 'urgent', ['R-11', 'R-02'], '#/hr/disciplinary?tab=dismissal'); return; }
          const lid = seqId('legalCases', 'LGL', 4, Y());
          st.insert('legalCases', { id: lid, court: 'المحكمة العمالية — يُحدَّد (Open)', caseNo: 'لم يُرفع بعد', subject: 'دعوى فصل — ' + (e ? e.name : '') + ' (' + d.id + ')', plaintiff: 'الشركة', defendant: e ? e.name : '', claim: 0, lawyer: 'غير مُعيّن', status: 'preparing', hearings: [], outcome: null, provision: null, source: 'dismissal', dismissalId: d.id, openedAt: new Date().toISOString() });
          st.patch('dismissals', d.id, { status: 'approved', legalCaseId: lid }); aud('HR.DSC.DISMISSAL_APPROVED', 'dismissal', d.id, 'طلب فصل — ' + (e ? e.name : ''), { after: { قضية: lid }, reason: 'اعتماد GM بعد المراجعة القانونية' }); aud('HR.DSC.LEGAL_CASE_OPENED', 'legal_case', lid, 'دعوى فصل', { after: { مصدر: d.id } }); notify('قضية جديدة', 'اعتُمد ملف طلب وفُتحت قضية (N-35).', 'action', ['R-11', 'R-01'], '#/hr/disciplinary?tab=legal');
        }
      });
      L('incentiveSheets').forEach((sh) => {
        const ap = apps.find((a) => a.id === sh.approvalId); if (!ap) return;
        if (ap.status === 'approved' && sh.status === 'pending_approval') { st.patch('incentiveSheets', sh.id, { status: 'approved', approvedAt: new Date().toISOString() }); aud('HR.RCG.SHEET_APPROVED', 'incentive_sheet', sh.id, sh.id, { after: { حالة: 'معتمد' } }); notify('كشف حافز معتمد', 'اعتُمد كشف حافز ' + sh.id + ' وهو جاهز للترحيل للمرتبات (N-36).', 'action', ['R-11', 'R-12', 'R-13'], '#/hr/recognition?tab=sheets'); }
        if ((ap.status === 'rejected' || ap.status === 'changes_requested') && sh.status === 'pending_approval') st.patch('incentiveSheets', sh.id, { status: 'draft', approvalId: null });
      });
      L('assignOverrides').forEach((o) => {
        const ap = apps.find((a) => a.id === o.approvalId); if (!ap || o.status !== 'pending') return;
        if (ap.status === 'approved') { st.patch('assignOverrides', o.id, { status: 'active', validUntil: new Date(Date.now() + (o.hours || 1) * 3600000).toISOString() }); aud('HR.TRN.OVERRIDE_DECIDED', 'override', o.id, en(o.employeeId) + ' — ' + skillName(o.skillId), { after: { قرار: 'معتمد', ساعات: o.hours } }); notify('تجاوز مؤقت معتمد', 'اعتُمد تجاوز مؤقت لحظر الإسناد (N-28).', 'info', ['R-14', 'R-05'], '#/hr/training?tab=rules'); }
        else if (ap.status === 'rejected') { st.patch('assignOverrides', o.id, { status: 'rejected' }); aud('HR.TRN.OVERRIDE_DECIDED', 'override', o.id, en(o.employeeId) + ' — ' + skillName(o.skillId), { result: 'failure', after: { قرار: 'مرفوض' } }); }
      });
    } catch (e) { console.error('[hr-protect] reconcile', e); } finally { recBusy = false; }
  }
  st.subscribe('approvals', () => { setTimeout(reconcile, 0); });
  st.subscribe('violations', () => { setTimeout(normalizeAll, 0); });
  st.subscribe('incidents', () => { setTimeout(normalizeAll, 0); });
  st.subscribe('leaveRequests', () => { /* الحظر يُفحص لحظة الاستعمال (حيّ) */ });
  SA.on('login', () => { setTimeout(() => { ensureSeed(); normalizeAll(); reconcile(); }, 50); });

  /** ملخص تأديبي لتبويب ملف الموظف (HR-06) — T4: يرجع null لمن لا يملك hr.discipline.view */
  SA.hrProtect.disciplineSummary = function (empId) { if (!SA.can('hr.discipline.view')) return null; const v = L('violations').filter((x) => x.employeeId === empId); return { cases: v.length, open: v.filter((x) => ['reported', 'open', 'hearing', 'decided'].indexOf(x.status) >= 0).length, lastDecision: (v.filter((x) => x.decision).sort((a, b) => (a.decision.decidedAt < b.decision.decidedAt ? 1 : -1))[0] || {}).decision || null }; };
  SA.hrProtect.ensureSeed = ensureSeed;
  SA.hrProtect.reconcile = reconcile;

  /* ═════════════════════════════ مهام Test Lab ═════════════════════════════ */
  [
    { id: 'M-P1', area: 'hr', phase2: true, title: 'الأداء: من القالب إلى مقترحات الرفع', persona: 'hr', route: 'hr/performance', est: '6 د', goal: 'قيّم موظفًا (التعليق إلزامي للدرجتين 1 و5)، ابدأ المعايرة وعدّل درجة بسبب، اعتمد الدورة نهائيًا، ثم أنشئ مقترحات HR-07/HR-19 — الدرجة لا تغيّر أي أجر.',
      steps: [{ text: 'تبويب «تقييمات الفريق»: افتح موظفًا «لم يبدأ» وأرسل تقييمه', audit: 'HR.PRF.SUPERVISOR_SUBMITTED' }, { text: 'تبويب «الدورات»: ابدأ المعايرة ثم «الاعتماد النهائي»', audit: 'HR.PRF.FINALIZED' }, { text: 'تبويب «النتائج والمقترحات»: حدّد موظفين وأنشئ المقترحات', audit: 'HR.PRF.PROPOSALS_CREATED' }], detect: [{ audit: 'HR.PRF.SUPERVISOR_SUBMITTED' }, { audit: 'HR.PRF.FINALIZED' }, { audit: 'HR.PRF.PROPOSALS_CREATED' }] },
    { id: 'M-P2', area: 'hr', phase2: true, title: 'التدريب: حظر إسناد ماكينة لشهادة منتهية', persona: 'ohs', route: 'hr/training?tab=rules', est: '4 د', goal: 'جرّب إسناد «عاطف حمدي» لماكينة CNC (شهادته منتهية) وشوف الرفض الصارم والبدائل، ثم جدّد شهادته من المصفوفة وأعد المحاولة.',
      steps: [{ text: 'في «قاعدة الحظر» اختر عاطف حمدي وماكينة CNC ثم «فحص الإسناد»', audit: 'HR.TRN.ASSIGNMENT_BLOCKED' }, { text: 'من «مصفوفة المهارات» افتح خليته واعتمد المستوى مع إرفاق إثبات', audit: 'HR.TRN.SKILL_CERTIFIED' }], detect: [{ audit: 'HR.TRN.ASSIGNMENT_BLOCKED' }, { audit: 'HR.TRN.SKILL_CERTIFIED' }] },
    { id: 'M-P3', area: 'hr', phase2: true, title: 'الجزاءات: قرار بسقف خصم لا يُتجاوز', persona: 'hr', route: 'hr/disciplinary', est: '5 د', goal: 'افتح ملف VIO-2026-0006/0004، وأصدر قرار خصم: جرّب أيامًا فوق السقف وشوف الرفض، ثم يومًا ضمن المتبقي. الجزاء بالأيام والأجر لا يظهر.',
      steps: [{ text: 'افتح ملفًا بعد المحضر واضغط «إصدار قرار الجزاء»', route: 'hr/disciplinary' }, { text: 'جرّب خصمًا يتجاوز المتبقي هذا الشهر ثم عدّله', audit: 'HR.DSC.DECISION_ISSUED' }], detect: [{ audit: 'HR.DSC.DECISION_ISSUED' }] },
    { id: 'M-P4', area: 'hr', phase2: true, title: 'الفصل = ملف قضية: حظر أثناء الإجازة المرضية ثم GM + Legal', persona: 'hr', route: 'hr/disciplinary?tab=dismissal', est: '7 د', goal: 'جرّب طلب فصل لهاني (إجازة مرضية مثبتة) فيُحظر آليًا. ثم قدّم طلبًا لموظف آخر لديه محضر (محسن)، وأكمل المراجعة القانونية ثم اعتماد GM من الصندوق.',
      steps: [{ text: 'افتح «طلب فصل» لملف VIO-2026-0004 (هاني) وشوف الحظر', audit: 'HR.DSC.DISMISSAL_BLOCKED' }, { text: 'قدّم طلب فصل لملف VIO-2026-0006 (محسن)', audit: 'HR.DSC.DISMISSAL_REQUESTED' }, { text: 'من الصندوق: اعتماد قانوني (صاحب الشركة) ثم GM', route: 'approvals', audit: 'HR.DSC.DISMISSAL_APPROVED' }], detect: [{ audit: 'HR.DSC.DISMISSAL_BLOCKED' }, { audit: 'HR.DSC.DISMISSAL_REQUESTED' }, { audit: 'HR.DSC.DISMISSAL_APPROVED' }] },
    { id: 'M-P5', area: 'hr', phase2: true, title: 'سلامة: من البلاغ إلى CAPA والتدريب (متعدد الوحدات)', persona: 'ohs', route: 'hr/ohs', est: '8 د', goal: 'بلّغ عن حادث، صنّفه إصابة بفقد وقت وشوف LTIFR يتغيّر، أضف CAPA يتطلب تدريبًا (يظهر احتياج في التدريب)، ثم كمدير HR جدول جلسة من الاحتياج.',
      steps: [{ text: 'ابعت بلاغ حادث', audit: 'HR.OHS.INCIDENT_REPORTED' }, { text: 'افتحه وصنّفه «إصابة بفقد وقت» بأيام فقد', audit: 'HR.OHS.INCIDENT_CLASSIFIED' }, { text: 'أضف CAPA مع «يتطلب تدريبًا»', audit: 'HR.OHS.CAPA_CREATED' }, { text: 'من «التدريب ← الاحتياجات» اضمّه لجلسة', route: 'hr/training?tab=needs', audit: 'HR.TRN.NEED_CREATED' }], detect: [{ audit: 'HR.OHS.INCIDENT_REPORTED' }, { audit: 'HR.OHS.INCIDENT_CLASSIFIED' }, { audit: 'HR.OHS.CAPA_CREATED' }, { audit: 'HR.TRN.NEED_CREATED' }] },
    { id: 'M-P6', area: 'hr', phase2: true, title: 'السرية الطبية: المشرف يرى «لائق/غير لائق» فقط', persona: 'ohs', route: 'hr/ohs?tab=fitness', est: '3 د', goal: 'كمسؤول سلامة افتح سجلًا طبيًا (يُسجَّل حرجًا). ثم راجع الصلاحيات: من دون hr.medical.view لا يظهر إلا حالة اللياقة.',
      steps: [{ text: 'افتح «فتح السجل الطبي» لموظف', audit: 'HR.OHS.MEDICAL_READ' }], detect: [{ audit: 'HR.OHS.MEDICAL_READ' }] },
    { id: 'M-P7', area: 'hr', phase2: true, title: 'التحفيز: اعتماد كشف الحافز ثم ترحيله للمرتبات', persona: 'hr', route: 'approvals', est: '5 د', goal: 'كشف INS-2026-10 أعدّته ريم. اعتمده من الصندوق (HR ثم المالية)، ثم رحّله للمرتبات من «كشوف الحافز». من أعدّ لا يعتمد ولا يرحّل.',
      steps: [{ text: 'اعتمد خطوة HR في الصندوق', route: 'approvals' }, { text: 'سجّل الدخول كمحاسب واعتمد خطوة المالية', audit: 'HR.RCG.SHEET_APPROVED' }, { text: 'ارجع لـ«كشوف الحافز» ورحّل الكشف', route: 'hr/recognition?tab=sheets', audit: 'HR.RCG.SHEET_TRANSFERRED' }], detect: [{ audit: 'HR.RCG.SHEET_APPROVED' }, { audit: 'HR.RCG.SHEET_TRANSFERRED' }] },
    { id: 'M-P8', area: 'hr', phase2: true, title: 'استطلاع النبض المجهول: حد أدنى Open', persona: 'hr', route: 'hr/recognition?tab=pulse', est: '3 د', goal: 'النتائج محجوبة لأن الحد الأدنى غير مُعدّ (Open). حدّد حدًا (مثلاً 5) وشوف أن المجموعات الأصغر تُدمج أو تُحجب لحماية سرية المجيبين.',
      steps: [{ text: 'اضغط «تحديد الحد الأدنى» واحفظ 5', audit: 'HR.RCG.SURVEY_SETTING_CHANGED' }], detect: [{ audit: 'HR.RCG.SURVEY_SETTING_CHANGED' }] }
  ].forEach((m) => SA.missions.add(m));
})();
