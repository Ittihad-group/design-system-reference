/* EG Super Admin + HR prototype — mod-hr-people.js
   HR Phase 2 · agent 2 (الموظفون): HR-06 hr-employees · HR-05 hr-onboarding · HR-07 hr-changes · HR-08 hr-custody · HR-34 hr-contractors.
   Specs: docs/hr/02-onboard-core.md · visual target hr-people.html.
   Own data (created lazily + idempotently by ensure(), flag meta.hrPeopleSeeded): empFiles · empEvents · onbPlans · probations · changeRequests · hrLetters ·
   custodyItems · custodyMatrix · custodyIssues · chargebacks · agencies · ctrWorkers · ctrRequests · ctrRoster · ctrBlacklist · importBatches · dupCases · settings.hrPeople.
   Public helpers: SA.hrPeople.{gate, inductionOk, custodyOpen, settings, openProfile}. */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  const DAY = 86400000;
  const p2 = (n) => String(n).padStart(2, '0');
  const isoD = (d) => new Date(d).toISOString().slice(0, 10);
  const today = () => isoD(Date.now());
  const addDays = (iso, n) => isoD(new Date(iso).getTime() + n * DAY);
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);
  const nowIso = () => new Date().toISOString();
  const agoIso = (min) => new Date(Date.now() - min * 60000).toISOString();
  const me = () => SA.session.user;
  const NOPERM = 'ليست من صلاحياتك';
  const permReason = (k) => (SA.can(k) ? '' : NOPERM + ' (' + k + ')');
  const col = (n) => st.get(n) || [];
  const EMPS = () => col('employees');
  const emp = (id) => EMPS().find((e) => e.id === id) || null;
  const empOfUser = (uid) => EMPS().find((e) => e.userId === uid) || null;
  const myEmp = () => empOfUser(SA.session.userId);
  const posTitle = (id) => { const p = col('positions').find((x) => x.id === id); return p ? p.title : '—'; };
  const file = (id) => st.find('empFiles', id);
  const S = () => (st.get('settings.hrPeople') || {});
  const canSal = () => SA.canSensitive('hr.salary.view');
  const canT2 = () => SA.can('hr.employees.edit') || SA.can('hr.employees.create');
  const isMgr = () => SA.can('hr.changes.approve'); // مستوى قرار HR Manager في هذا النموذج
  const secret = (why) => h('span.sap-pp-secret', { title: why || 'سري — يتطلب hr.salary.view' }, SA.icon('lock', 'icon-sm'), 'سري');
  const moneyT3 = (n) => (canSal() ? (n == null ? SA.openValue() : h('span.num', {}, SA.fmt.money(n))) : secret());
  const tierBadge = (t) => h('span.conf-badge.sap-pp-tier', { title: 'تدرّج سرية البيانات ' + t }, t);
  const nm = (v) => h('span.num', {}, v == null || v === '' ? '—' : v);
  const ltr = (v) => h('span.num.sap-pp-ltr', { dir: 'ltr' }, v == null || v === '' ? '—' : v);
  const EMP_ST = { active: ['نشط', 'success'], probation: ['تجربة', 'info'], leave: ['في إجازة', 'info'], suspended: ['موقوف', 'danger'], notice: ['فترة إخطار', 'warning'], terminated: ['منتهي', 'neutral'] };
  const stChip = (map, k) => { const m = map[k]; return SA.chip(m ? m[0] : k, m ? m[1] : 'neutral'); };
  const ETYPE = { permanent: 'دائم', contract: 'متعاقد', daily: 'يومية' };
  const isProdDept = (d) => ['D-05', 'D-09', 'D-10', 'D-11', 'D-12', 'D-13'].indexOf(d) >= 0;
  const isProdEmp = (e) => !!e && isProdDept(e.departmentId);
  const reportsOf = (id, acc) => { acc = acc || new Set(); EMPS().forEach((e) => { if (e.managerEmpId === id && !acc.has(e.id)) { acc.add(e.id); reportsOf(e.id, acc); } }); return acc; };
  const deptName = (id) => SA.deptName(id);
  const empLink = (e) => h('a.sap-linkbtn', { href: SA.href('hr/employees/' + e.id) }, e.name);
  const empCell = (e, sub) => SA.userCell({ name: e.name }, { sub: sub || (e.empNo + ' · ' + posTitle(e.positionId)) });
  const unsubs = [];
  /** employees visible to the current user (scope on 'hr'). 'department' for a user of the HR department = all (HR operations). */
  function visibleEmps() {
    const all = EMPS(), u = me(); if (!u) return [];
    const sc = SA.scopeOf('hr'); if (sc === 'all' || (SA.session.role && SA.session.role.isProtected)) return all;
    const mine = myEmp();
    if (sc === 'team') { const ids = mine ? reportsOf(mine.id) : new Set(); if (mine) ids.add(mine.id); return all.filter((e) => ids.has(e.id)); }
    if (sc === 'department') return u.departmentId === 'D-07' ? all : all.filter((e) => e.departmentId === u.departmentId);
    return mine ? [mine] : [];
  }
  const canSee = (id) => visibleEmps().some((e) => e.id === id);
  /** HR cannot edit own file or a relative's file (BR-EMP-07) */
  function selfBlock(e) {
    const m = myEmp(); if (!m || !e) return '';
    if (e.id === m.id) return 'لا يمكنك تعديل ملفك أو اعتماد طلب يخصّك بنفسك — الطلب يتحوّل لـHR Manager (BR-EMP-07).';
    if ((e.relatives || []).indexOf(m.id) >= 0 || (m.relatives || []).indexOf(e.id) >= 0) return 'الملف ده لقريب لك (حقل القرابة) — لا تعدّله أو تعتمده بنفسك (BR-EMP-07).';
    return '';
  }

  /* ───────────────────────── css (own prefix sap-pp-) ───────────────────────── */
  (function () {
    if (document.querySelector('style[data-mod="hr-people"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'hr-people');
    s.textContent = [
      '.sap-pp-ltr{unicode-bidi:plaintext;direction:ltr;display:inline-block}',
      '.sap-pp-secret{display:inline-flex;align-items:center;gap:6px;background:var(--color-bg-alt);color:var(--color-text-muted);border:1px dashed var(--color-border-strong);border-radius:8px;padding:2px 10px;font-size:var(--text-caption);font-weight:600}',
      '.sap-pp-mask{font-family:var(--font-en,monospace);letter-spacing:.06em;direction:ltr;display:inline-block;color:var(--color-text)}',
      '.sap-pp-tier{margin-inline-start:6px;font-size:11px;padding:1px 6px}',
      '.sap-pp-profile{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:16px 18px;border:1px solid var(--color-border);border-radius:16px;background:#fff;margin-bottom:14px}',
      '.sap-pp-profile .sap-avatar{width:56px;height:56px;font-size:20px}',
      '.sap-pp-profile h2{margin:0;font-size:1.25rem;color:var(--eg-navy)}',
      '.sap-pp-profile small{color:var(--color-text-muted)}',
      '.sap-pp-profile .sap-pp-pmain{flex:1;min-width:220px;display:grid;gap:4px}',
      '.sap-pp-profile .sap-pp-pmeta{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
      '.sap-pp-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:16px;align-items:start}',
      '.sap-pp-stack{display:grid;gap:14px}',
      '.sap-pp-views{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}',
      '.sap-pp-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;padding:14px}',
      '.sap-pp-ecard{display:grid;gap:8px;text-align:start;border:1px solid var(--color-border);background:#fff;border-radius:14px;padding:14px;cursor:pointer;min-height:44px;font:inherit;color:inherit;transition:border-color .15s,box-shadow .15s}',
      '.sap-pp-ecard:hover,.sap-pp-ecard:focus-visible{border-color:var(--eg-navy-soft);box-shadow:0 2px 10px rgba(1,40,100,.08)}',
      '.sap-pp-ecard b{color:var(--eg-navy)} .sap-pp-ecard small{color:var(--color-text-muted)}',
      '.sap-pp-ecard-top{display:flex;gap:10px;align-items:center}',
      '.sap-pp-tree,.sap-pp-tree ul{list-style:none;margin:0;padding:0}',
      '.sap-pp-tree ul{margin-inline-start:18px;padding-inline-start:16px;border-inline-start:2px solid var(--color-border)}',
      '.sap-pp-tree li{position:relative;padding-block:5px}',
      '.sap-pp-node{display:inline-flex;gap:10px;align-items:center;border:1px solid var(--color-border);background:#fff;border-radius:12px;padding:7px 12px;min-height:44px}',
      '.sap-pp-node:hover{border-color:var(--eg-navy-soft)} .sap-pp-node a{color:var(--eg-navy);font-weight:700;text-decoration:none}',
      '.sap-pp-node small{color:var(--color-text-muted)}',
      '.sap-pp-tgl{border:0;background:var(--color-primary-tint);color:var(--eg-navy);border-radius:8px;min-width:28px;min-height:28px;font:700 12px var(--font-en,sans-serif);cursor:pointer}',
      '.sap-pp-crews{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;padding:14px}',
      '.sap-pp-crew{border:1px solid var(--color-border);border-radius:14px;padding:14px;background:#fff;display:grid;gap:8px}',
      '.sap-pp-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}',
      '.sap-pp-stat{border:1px solid var(--color-border);border-radius:12px;padding:10px 12px;background:#fff;display:grid;gap:2px}',
      '.sap-pp-stat span{font-size:var(--text-caption);color:var(--color-text-muted)} .sap-pp-stat b{font:700 1.4rem var(--font-en,sans-serif);color:var(--eg-navy)}',
      '.sap-pp-stat.is-warn b{color:var(--color-warning)} .sap-pp-stat.is-bad b{color:var(--color-danger)} .sap-pp-stat.is-ok b{color:var(--color-success)}',
      '.sap-pp-lockcard{display:grid;gap:8px;justify-items:center;text-align:center;padding:28px 18px;border:1px dashed var(--color-border-strong);border-radius:14px;background:var(--color-bg-alt)}',
      '.sap-pp-lockcard .dot{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#fff;color:var(--eg-navy);border:1px solid var(--color-border)}',
      '.sap-pp-tab-lock{opacity:.72}',
      '.sap-pp-task{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--color-border)}.sap-pp-task>:last-child{grid-column:2}',
      '.sap-pp-task:last-child{border-bottom:0}',
      '.sap-pp-task.is-done .sap-pp-tt{text-decoration:line-through;color:var(--color-text-muted)}',
      '.sap-pp-task.is-blocked{background:var(--color-danger-tint)}',
      '.sap-pp-tt{display:grid;gap:2px} .sap-pp-tt small{color:var(--color-text-muted)}',
      '.sap-pp-ck{width:26px;height:26px;border-radius:8px;border:2px solid var(--color-border-strong);display:grid;place-items:center;background:#fff;color:#fff}',
      '.sap-pp-task.is-done .sap-pp-ck{background:var(--color-success);border-color:var(--color-success)}',
      '.sap-pp-task.is-blocked .sap-pp-ck{border-color:var(--color-danger)}',
      '.sap-pp-owner{font-size:var(--text-caption);font-weight:700;color:var(--eg-navy);background:var(--color-primary-tint);border-radius:999px;padding:2px 10px;white-space:nowrap}',
      '.sap-pp-gate{display:flex;gap:14px;align-items:flex-start;padding:14px 16px;border-radius:14px;border:1px solid var(--color-border);background:#fff}',
      '.sap-pp-gate.is-locked{border-color:var(--color-danger);background:var(--color-danger-tint)} .sap-pp-gate.is-open{border-color:var(--color-success);background:var(--color-success-tint)}',
      '.sap-pp-gate .dot{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#fff;flex:none}',
      '.sap-pp-meter{height:8px;border-radius:999px;background:var(--color-neutral-tint);overflow:hidden} .sap-pp-meter>i{display:block;height:100%;background:var(--eg-navy);border-radius:inherit}',
      '.sap-pp-meter.is-ok>i{background:var(--color-success)} .sap-pp-meter.is-warn>i{background:var(--color-warning)} .sap-pp-meter.is-bad>i{background:var(--color-danger)}',
      '.sap-pp-tl{list-style:none;margin:0;padding:0;display:grid;gap:0}',
      '.sap-pp-tl li{display:grid;grid-template-columns:110px 18px 1fr;gap:10px;padding:10px 0;position:relative}',
      '.sap-pp-tl li time{font:600 12px var(--font-en,sans-serif);color:var(--color-text-muted);text-align:end;padding-top:2px}',
      '.sap-pp-tl li .sap-pp-dot{width:12px;height:12px;border-radius:50%;background:var(--eg-navy);margin-top:5px;justify-self:center;position:relative;z-index:1}',
      '.sap-pp-tl li::before{content:"";position:absolute;inset-inline-start:calc(110px + 10px + 8px);top:0;bottom:0;width:2px;background:var(--color-border)}',
      '.sap-pp-tl li.is-future .sap-pp-dot{background:#fff;border:2px solid var(--color-warning)} .sap-pp-tl li.is-now .sap-pp-dot{background:var(--color-accent);box-shadow:0 0 0 4px var(--color-accent-tint)}',
      '.sap-pp-tl .b{display:grid;gap:3px} .sap-pp-tl .b p{margin:0;font-size:var(--text-dense);color:var(--color-text-muted)}',
      '.sap-pp-sig{border:1px dashed var(--color-border-strong);border-radius:12px;background:#fff;position:relative;touch-action:none}',
      '.sap-pp-sig canvas{width:100%;height:130px;display:block;border-radius:12px;cursor:crosshair}',
      '.sap-pp-sig .sap-pp-sigph{position:absolute;inset:0;display:grid;place-items:center;color:var(--color-text-muted);font-size:var(--text-dense);pointer-events:none}',
      '.sap-pp-letter{background:#fff;border:1px solid var(--color-border-strong);border-radius:6px;padding:26px 30px;line-height:2;font-size:15px;box-shadow:0 2px 14px rgba(0,0,0,.06)}',
      '.sap-pp-letter h3{text-align:center;margin:0 0 6px;color:var(--eg-navy)} .sap-pp-letter .sap-pp-lh{display:flex;justify-content:space-between;color:var(--color-text-muted);font-size:13px;border-bottom:1px solid var(--color-border);padding-bottom:8px;margin-bottom:12px}',
      '.sap-pp-letter .sap-pp-lsig{margin-top:26px;display:flex;justify-content:space-between;color:var(--color-text-muted);font-size:13px}',
      '.sap-pp-diff{display:grid;grid-template-columns:auto 1fr 1fr;border:1px solid var(--color-border);border-radius:12px;overflow:hidden;background:#fff;font-size:var(--text-dense)}',
      '.sap-pp-diff>*{padding:9px 12px;border-bottom:1px solid var(--color-border)} .sap-pp-diff>b{background:var(--color-bg-alt);color:var(--color-text-muted);font-weight:600}',
      '.sap-pp-diff .after{color:var(--eg-navy);font-weight:700} .sap-pp-diff .before{color:var(--color-text-muted);text-decoration:line-through}',
      '.sap-pp-chain{list-style:none;margin:0;padding:0;display:grid;gap:8px}',
      '.sap-pp-chain li{display:flex;gap:10px;align-items:center;padding:9px 12px;border:1px solid var(--color-border);border-radius:12px;background:#fff}',
      '.sap-pp-chain li.is-now{border-color:var(--eg-navy-soft);background:var(--color-primary-tint)} .sap-pp-chain li.is-ok{border-color:var(--color-success);background:var(--color-success-tint)} .sap-pp-chain li.is-no{border-color:var(--color-danger)}',
      '.sap-pp-chain .n{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--eg-navy);color:#fff;font:700 12px var(--font-en,sans-serif);flex:none}',
      '.sap-pp-dz{border:2px dashed var(--color-border-strong);border-radius:14px;padding:26px 18px;text-align:center;background:var(--color-bg-alt);display:grid;gap:8px;justify-items:center}',
      '.sap-pp-dz.is-over{border-color:var(--eg-navy);background:var(--color-primary-tint)}',
      '.sap-pp-cal{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}',
      '.sap-pp-note{display:flex;gap:10px;align-items:flex-start;font-size:var(--text-caption);color:var(--color-text-muted);padding:8px 2px}',
      '.sap-pp-sec-title{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:2px 0 8px}',
      '.sap-pp-sec-title h3{margin:0;font-size:1rem;color:var(--eg-navy)}',
      '.sap-pp-sch{width:100%;border-collapse:collapse;font-size:var(--text-dense)} .sap-pp-sch td,.sap-pp-sch th{padding:7px 10px;border-bottom:1px solid var(--color-border);text-align:start}',
      '.sap-pp-pill-row{display:flex;gap:8px;flex-wrap:wrap}',
      '.sap-pp-spec{font-size:var(--text-caption);display:inline-flex;gap:6px;align-items:center;color:var(--eg-navy);font-weight:600;text-decoration:none}',
      '.sap-pp-spec:hover{text-decoration:underline}',
      '.sap-pp-tabs-wrap{overflow-x:auto;margin-bottom:14px}',
      '.sap-pp-tabs-wrap .tabs{flex-wrap:nowrap;min-width:max-content}',
      '@media (max-width:700px){.sap-pp-tl li{grid-template-columns:78px 16px 1fr}.sap-pp-tl li::before{inset-inline-start:calc(78px + 10px + 7px)}.sap-pp-diff{grid-template-columns:1fr}.sap-pp-task{grid-template-columns:auto 1fr}.sap-pp-task>:last-child{grid-column:1/-1}.sap-pp-letter{padding:16px}}'
    ].join('\n');
    document.head.appendChild(s);
  })();

  /* ───────────────────────── catalog additions ───────────────────────── */
  const AUD = [
    ['HR.EMP.CHANGE_REQUESTED', 'طلب تعديل بيانات حساسة بملف موظف', 'medium'], ['HR.EMP.BANK_CHANGE_REQUESTED', 'طلب تغيير حساب بنكي', 'high'], ['HR.EMP.BANK_CHANGE_APPROVED', 'اعتماد تغيير الحساب البنكي', 'high'], ['HR.EMP.BANK_CHANGE_EFFECTIVE', 'سريان الحساب البنكي الجديد', 'high'], ['HR.EMP.BANK_CHANGE_REJECTED', 'رفض تغيير الحساب البنكي', 'medium'],
    ['HR.EMP.DOC_UPLOADED', 'رفع مستند موظف', 'info'], ['HR.EMP.DOC_REPLACED', 'استبدال مستند بنسخة جديدة', 'info'], ['HR.EMP.DOC_DELETED', 'حذف ناعم لمستند', 'high'], ['HR.EMP.COMPLETENESS_WAIVED', 'إعفاء عنصر اكتمال ملف', 'medium'],
    ['HR.EMP.IMPORT_STARTED', 'بدء استيراد موظفين', 'medium'], ['HR.EMP.IMPORT_COMMITTED', 'اعتماد دفعة استيراد', 'high'], ['HR.EMP.IMPORT_ROLLED_BACK', 'تراجع عن دفعة استيراد', 'high'],
    ['HR.EMP.DUPLICATE_FLAGGED', 'اشتباه تكرار موظف', 'medium'], ['HR.EMP.DUPLICATE_DISMISSED', 'استبعاد اشتباه تكرار', 'medium'], ['HR.EMP.MERGED', 'دمج سجلي موظف', 'critical'], ['HR.EMP.HISTORY_VIEWED', 'قراءة سجل ملف موظف فيه بيانات T3', 'high'], ['HR.EMP.STATUS_CHANGED', 'تغيير حالة موظف', 'high'],
    ['HR.ONB.CREATED', 'إنشاء قائمة تعيين', 'info'], ['HR.ONB.TASK_COMPLETED', 'إتمام مهمة تعيين', 'info'], ['HR.ONB.TASK_BLOCKED', 'حجب مهمة تعيين بسبب', 'medium'], ['HR.ONB.INDUCTION_DONE', 'تسجيل توعية السلامة', 'medium'], ['HR.ONB.GATE_RELEASED', 'فتح بوابة الماكينات', 'medium'], ['HR.ONB.GATE_VIOLATION', 'محاولة وصول للخط قبل التوعية', 'high'],
    ['HR.ONB.INSURANCE_EXPORTED', 'تصدير بيانات تسجيل التأمينات', 'medium'], ['HR.ONB.INSURANCE_CONFIRMED', 'تأكيد رقم/إفادة التأمين', 'medium'], ['HR.ONB.BUDDY_ASSIGNED', 'تعيين زميل مرشد', 'info'], ['HR.ONB.DAY1_SIGNOFF', 'اعتماد اكتمال اليوم الأول', 'medium'],
    ['HR.PROB.STARTED', 'بدء فترة تجربة', 'info'], ['HR.PROB.REVIEW_SUBMITTED', 'تسليم تقييم نقطة تفتيش', 'info'], ['HR.PROB.CONFIRMED', 'تثبيت بعد التجربة', 'high'], ['HR.PROB.EXTENDED', 'تمديد فترة التجربة', 'high'], ['HR.PROB.TERMINATION_REFERRED', 'إحالة للإنهاء أثناء التجربة', 'high'], ['HR.PROB.DECISION_OVERDUE', 'تجاوز موعد قرار التجربة', 'high'],
    ['HR.CHG.REQUESTED', 'تقديم طلب تغيير وظيفي', 'medium'], ['HR.CHG.APPROVED', 'اكتمال اعتماد طلب تغيير', 'high'], ['HR.CHG.REJECTED', 'رفض طلب تغيير', 'high'], ['HR.CHG.EFFECTIVE', 'سريان تغيير وظيفي', 'high'], ['HR.CHG.SALARY_APPLIED', 'سريان مرتب جديد (T3)', 'critical'], ['HR.CHG.LETTER_ISSUED', 'إصدار خطاب تغيير', 'medium'], ['HR.CHG.CANCELLED', 'إلغاء طلب تغيير', 'high'], ['HR.CHG.SUSPENDED', 'إيقاف عن العمل', 'critical'], ['HR.CHG.RETURNED_FROM_SUSPENSION', 'عودة من الإيقاف', 'high'], ['HR.CHG.SOD_BLOCKED', 'محاولة مخالفة لفصل المهام', 'high'],
    ['HR.CST.ISSUED', 'صرف عهدة', 'medium'], ['HR.CST.SIGNATURE_CAPTURED', 'التقاط توقيع استلام', 'info'], ['HR.CST.RETURNED', 'استرجاع عهدة', 'info'], ['HR.CST.REPLACED', 'استبدال عهدة', 'info'], ['HR.CST.LOSS_REPORTED', 'بلاغ فقد/تلف عهدة', 'medium'], ['HR.CST.CHARGEBACK_PROPOSED', 'اقتراح خصم فقد/تلف', 'high'], ['HR.CST.CHARGEBACK_APPROVED', 'اعتماد خصم فقد/تلف (T3)', 'critical'], ['HR.CST.CHARGEBACK_WAIVED', 'إعفاء من خصم', 'high'], ['HR.CST.WRITTEN_OFF', 'شطب عهدة', 'high'], ['HR.CST.ITEM_UPDATED', 'تعديل صنف عهدة', 'medium'], ['HR.CST.MATRIX_CHANGED', 'تعديل مصفوفة PPE', 'medium'],
    ['HR.CTR.AGENCY_CREATED', 'إنشاء وكالة', 'medium'], ['HR.CTR.HEADCOUNT_REQUESTED', 'طلب عدد عمالة', 'info'], ['HR.CTR.HEADCOUNT_CONFIRMED', 'تأكيد عدد من الوكالة', 'info'], ['HR.CTR.WORKER_REGISTERED', 'تسجيل عامل مقاول', 'info'], ['HR.CTR.GATE_CHECKED', 'فحص بوابة ناجح', 'info'], ['HR.CTR.GATE_REFUSED', 'رفض عند البوابة/الخط', 'high'], ['HR.CTR.INDUCTION_DONE', 'توعية سلامة لعامل مقاول', 'medium'], ['HR.CTR.HOURS_APPROVED', 'اعتماد ساعات مقاول', 'medium'], ['HR.CTR.HOURS_ADJUSTED', 'تعديل ساعات مقاول', 'high'], ['HR.CTR.BLACKLISTED', 'إدراج بالقائمة السوداء', 'high'], ['HR.CTR.BLACKLIST_LIFTED', 'رفع حظر من القائمة السوداء', 'high'], ['HR.CTR.CONVERTED', 'تحويل عامل مقاول لموظف', 'high'], ['HR.CTR.SETTINGS_CHANGED', 'تفعيل/تعطيل ميزة المقاولين', 'medium'],
    ['HR.SETTINGS.PEOPLE_CHANGED', 'تعديل إعدادات التعيين والعهدة', 'high']
  ];
  AUD.forEach((a) => SA.catalog.addAudit(a[0], a[1], a[2], 'hr'));
  SA.catalog.approvalTypes.job_change = { label: 'تغيير وظيفي', area: 'hr', icon: 'swap' };
  SA.catalog.approvalTypes.custody_chargeback = { label: 'خصم فقد/تلف عهدة', area: 'hr', icon: 'coins' };
  SA.catalog.approvalTypes.contractor_action = { label: 'إجراء مقاولين', area: 'hr', icon: 'truck' };

  /* ───────────────────────── generic helpers ───────────────────────── */
  const specLink = (anchor, label) => h('a.sap-pp-spec', { href: '../../hr-people.html#' + anchor, target: '_blank', rel: 'noopener' }, SA.icon('external', 'icon-sm'), label || 'المواصفة الكاملة ↗');
  const note = (icon, ...kids) => h('div.sap-pp-note', {}, SA.icon(icon || 'info', 'icon-sm'), h('span', {}, kids));
  const lockCard = (title, text, key) => h('div.sap-pp-lockcard', { role: 'status' }, h('span.dot', {}, SA.icon('lock')), h('strong', {}, title), h('span.t-muted', {}, text), key ? h('code', {}, key) : null);
  const meter = (pct, kind) => h('div.sap-pp-meter' + (kind ? '.is-' + kind : ''), { role: 'progressbar', 'aria-valuenow': Math.round(pct), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: Math.max(0, Math.min(100, pct)) + '%' } }));
  const statBox = (label, value, kind) => h('div.sap-pp-stat' + (kind ? '.is-' + kind : ''), {}, h('span', {}, label), h('b', {}, value));
  const csvQ = (v) => String(v == null ? '' : v);
  /** SA.api wrapper: run fn through the simulated server; returns {ok, value}. */
  async function run(fn) { try { const v = await SA.api(fn); return { ok: true, value: v }; } catch (e) { SA.fail(e); return { ok: false }; } }
  /** Generic form dialog. o: {title, subtitle, icon, size, intro, fields:[SA.form.field], extra:Node, submitLabel, kind, onSubmit(values, modal) → Promise<boolean>|boolean} */
  function formDialog(o) {
    const fields = (o.fields || []).filter(Boolean); const g = SA.form.group(fields);
    const body = h('div.sap-confirm', {}, o.intro || null, h('div.sap-formgrid', {}, fields.map((f) => { if (f.full) f.el.style.gridColumn = '1 / -1'; return f.el; })), o.extra || null);
    let m; const submit = async () => {
      if (!g.validate()) return; if (o.validate) { const msg = o.validate(g.get()); if (msg) { SA.toast(msg, 'error', { ms: 6000 }); return; } }
      m.setBusy(true); let ok = false;
      try { ok = await o.onSubmit(g.get(), m); } catch (e) { SA.fail(e); ok = false; }
      if (m.el && m.el.isConnected) { m.setBusy(false); if (ok) m.close(true); }
    };
    m = SA.modal({ title: o.title, subtitle: o.subtitle, icon: o.icon || 'edit', size: o.size || 'md', body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, 'إلغاء'), h('button.btn.btn-' + (o.kind || 'primary'), { type: 'button', onclick: submit }, o.submitLabel || 'حفظ')] });
    return m;
  }
  const F = (o) => { const f = SA.form.field(o); f.full = !!o.full; return f; };
  const opt = (arr, empty) => (empty ? [['', empty]] : []).concat(arr);
  const deptOpts = () => col('departments').filter((d) => d.active !== false).map((d) => [d.id, d.name]);
  const posOpts = () => col('positions').map((p) => [p.id, p.title]);
  const empOpts = (filter) => EMPS().filter(filter || ((e) => e.status !== 'terminated')).map((e) => [e.id, e.name + ' — ' + e.empNo]);
  const dateRule = (v) => (!v || /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'صيغة التاريخ غير صحيحة');
  /** Loading → ready gate used by every screen (skeleton, offline/error state with retry) */
  function loadGate(root, kind, build) {
    let alive = true; const host = h('div'); root.appendChild(host);
    const go = () => {
      SA.clear(host); host.appendChild(SA.skeleton({ kind: kind || 'table', rows: 6 }));
      SA.delay(220, { write: false }).then(() => { if (!alive) return; SA.clear(host); const c = build(host); if (typeof c === 'function') cleanups.push(c); }, (e) => { if (!alive) return; SA.clear(host); host.appendChild(SA.errorState({ text: SA.errorText(e), onRetry: go })); });
    };
    const cleanups = []; go();
    return () => { alive = false; cleanups.forEach((c) => { try { c(); } catch (e) { /* noop */ } }); };
  }
  /** re-render `host` on store changes (keeps scroll) */
  function live(host, build, paths) { return SA.live(host, build, paths); }
  function download(name, rows) { SA.download(name, SA.csv(rows), 'text/csv'); }
  function deliver(code, target, o) { return SA.audit(code, Object.assign({ target }, o || {})); }
  const tgt = (type, id, label) => ({ type, id, label });
  const empTgt = (e) => tgt('employee', e.id, e.name + ' (' + e.empNo + ')');
  const nextSeq = (coll, prefix, width, withYear) => {
    const y = new Date().getFullYear(); let max = 0; const re = new RegExp('^' + prefix + '-' + (withYear ? y + '-' : '') + '(\\d+)$');
    col(coll).forEach((r) => { const m = re.exec(r.id || ''); if (m) max = Math.max(max, +m[1]); });
    return prefix + '-' + (withYear ? y + '-' : '') + String(max + 1).padStart(width || 4, '0');
  };
  function addEvent(e, ev) {
    const rec = Object.assign({ id: 'EV-' + Math.random().toString(36).slice(2, 8).toUpperCase(), employeeId: e.id, tier: 'T1', at: nowIso(), effectiveFrom: today(), actor: me() ? me().name : 'النظام', approver: null, reason: '', source: '' }, ev);
    st.insert('empEvents', rec, true); return rec;
  }
  const empEventsOf = (id) => col('empEvents').filter((x) => x.employeeId === id).sort((a, b) => (b.effectiveFrom + b.at).localeCompare(a.effectiveFrom + a.at));
  function letter(type, e, ref, title, bodyLines) {
    const rec = { id: nextSeq('hrLetters', 'LET', 4, true), type, employeeId: e.id, ref: ref || null, title, body: bodyLines, issuedAt: nowIso(), issuedBy: me() ? me().name : 'النظام', docNo: type === 'probation' ? 'DOC-HR-15' : type === 'custody' ? 'DOC-HR-12' : type === 'contractor' ? 'DOC-HR-P5' : 'DOC-HR-28' };
    st.insert('hrLetters', rec, true); return rec;
  }
  function showLetter(l) {
    const e = emp(l.employeeId); const co = st.get('settings.company') || {};
    const paper = h('div.sap-pp-letter', {}, h('div.sap-pp-lh', {}, h('span', {}, 'رقم المستند: ', h('b.num', {}, l.docNo + ' · ' + l.id)), h('span', {}, 'التاريخ: ', h('b.num', {}, SA.fmt.date(l.issuedAt)))), h('h3', {}, l.title), l.body.map((p) => h('p', {}, p)),
      h('div.sap-pp-lsig', {}, h('span', {}, 'التوقيع والختم: ', SA.tag('pending', 'مَن يوقّع — D14')), h('span', {}, 'الموظف: ', e ? e.name : '—')));
    const m = SA.modal({ title: l.title, subtitle: l.docNo + ' — معاينة (نموذج تجريبي، ليس مستندًا رسميًا)', icon: 'doc', size: 'lg', body: h('div', {}, paper, note('info', 'الاسم الرسمي للشركة وختمها وتوقيعها {Open} — المستند الرسمي يصدر من HR-29. ', co.nameAr ? 'الشركة: ' + co.nameAr : '')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => SA.copy(l.body.join('\n')).then(() => SA.toast('تم نسخ نص الخطاب', 'success')) }, SA.icon('copy', 'icon-sm'), 'نسخ النص'), h('button.btn.btn-primary', { type: 'button', onclick: () => m.close() }, 'إغلاق')] });
  }
  const sysActor = () => ({ id: 'SYSTEM', name: 'النظام', roleId: null });
  /** quick avatar-name header used by drawers */
  const personLine = (e) => h('div.sap-usercell', {}, SA.avatar(e.name), h('div', {}, h('b', {}, e.name), h('small', {}, e.empNo + ' · ' + posTitle(e.positionId) + ' · ' + deptName(e.departmentId))));

  /* ───────────────────────── reference tables + seed ───────────────────────── */
  const SEED_V = 4;
  const GOV = { '01': 'القاهرة', '02': 'الإسكندرية', '03': 'بورسعيد', '04': 'السويس', '11': 'دمياط', '12': 'الدقهلية', '13': 'الشرقية', '14': 'القليوبية', '15': 'كفر الشيخ', '16': 'الغربية', '17': 'المنوفية', '18': 'البحيرة', '19': 'الإسماعيلية', '21': 'الجيزة', '22': 'بني سويف', '23': 'الفيوم', '24': 'المنيا', '25': 'أسيوط', '26': 'سوهاج', '27': 'قنا', '28': 'أسوان', '29': 'الأقصر', '31': 'البحر الأحمر', '32': 'الوادي الجديد', '33': 'مطروح', '34': 'شمال سيناء', '35': 'جنوب سيناء', '88': 'خارج الجمهورية' };
  const GOVK = Object.keys(GOV);
  const FEMALE = ['هبة', 'نهى', 'مروة', 'سلمى', 'ريم', 'رانيا', 'عبير', 'أميرة', 'جيهان', 'منة'];
  const BANKS = ['بنك مصر', 'البنك الأهلي المصري', 'بنك القاهرة', 'البنك التجاري الدولي'];
  const MARITAL = { single: 'أعزب/عزباء', married: 'متزوج/ة', divorced: 'مطلّق/ة', widowed: 'أرمل/ة' };
  const MILITARY = { completed: 'أدّى الخدمة', exempt: 'معفى', postponed: 'مؤجّل', na: 'لا ينطبق' };
  const DOC_TYPES = { national_id: 'صورة بطاقة الرقم القومي', contract: 'عقد العمل', photo: 'صورة شخصية', education: 'شهادة المؤهل', medical: 'شهادة اللياقة الطبية', military: 'موقف التجنيد', birth: 'شهادة ميلاد', other: 'مستند آخر' };
  const DOC_EXPIRY = { national_id: true, medical: true, other: true };
  const INDUCTION_TOPICS = ['قواعد السلامة العامة بالمصنع', 'مخارج الطوارئ وخطة الإخلاء', 'استخدام معدات الوقاية PPE', 'مخاطر الماكينات والقفل/التأمين (LOTO)', 'مكافحة الحريق', 'الإبلاغ عن الحوادث والإصابات'];
  /* department-head step only where the head's role can decide in the shared inbox (R-03 holds sa.approvals.approve); other departments: HR Manager → GM */
  const DEPT_HEAD = { 'D-02': 'R-03' };
  const deptHeadRole = (d) => DEPT_HEAD[d] || null;
  /** Egyptian national-id STRUCTURE check only (BR-EMP-02): century 2|3 + valid birth date + governorate code. The final check digit algorithm is {Open} — not assumed. */
  function checkNid(v) {
    v = String(v || '').replace(/\s/g, '');
    if (!/^\d{14}$/.test(v)) return { ok: false, msg: 'الرقم القومي لازم يكون 14 رقمًا' };
    if (v[0] !== '2' && v[0] !== '3') return { ok: false, msg: 'رقم القرن (أول رقم) لازم يكون 2 أو 3' };
    const y = (v[0] === '2' ? 1900 : 2000) + (+v.slice(1, 3)), m = +v.slice(3, 5), d = +v.slice(5, 7); const dt = new Date(Date.UTC(y, m - 1, d));
    if (m < 1 || m > 12 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || dt > new Date()) return { ok: false, msg: 'تاريخ الميلاد داخل الرقم غير صالح' };
    if (!GOV[v.slice(7, 9)]) return { ok: false, msg: 'كود المحافظة غير موجود في الجدول المرجعي' };
    return { ok: true, dob: y + '-' + p2(m) + '-' + p2(d), gov: GOV[v.slice(7, 9)], gender: (+v[12]) % 2 ? 'M' : 'F' };
  }
  const phoneRule = (v) => (!v || /^(\+?20|0)?1[0125]\d{8}$/.test(String(v).replace(/[\s-]/g, '')) ? null : 'رقم الموبايل غير صحيح (مثال: 01012345678)');
  const maskNid = (last4) => h('span.sap-pp-mask', { title: 'مخفي — آخر 4 أرقام فقط (BR-EMP-03)' }, '•••••••••• ' + last4);
  const maskAcc = (last4) => h('span.sap-pp-mask', { title: 'مخفي — آخر 4 أرقام فقط' }, '•••• •••• ' + last4);

  const TASKS = {
    prod: [
      ['contract', 'عقد عمل عربي بأربع نسخ موقّعة (صاحب العمل · العامل · التأمينات · الجهة الإدارية)', 'HR Officer', 0, true, 'contract'],
      ['docs', 'استلام مستندات التعيين وصورة البطاقة', 'HR Officer', 0, false, 'manual'],
      ['file', 'استكمال ملف الموظف وبيانات الصرف', 'HR Officer', 1, false, 'manual'],
      ['insurance', 'تسجيل التأمينات — مهمة متتبّعة (تصدير بيانات فقط، لا ربط آلي)', 'Payroll', 3, true, 'insurance'],
      ['induction', 'توعية السلامة وفتح بوابة الماكينات', 'OHS', 0, true, 'induction'],
      ['ppe', 'صرف PPE والزي بإيصال موقّع', 'المخزن / HR', 1, true, 'ppe'],
      ['buddy', 'تعيين الزميل المرشد وتعريف المشرف', 'HR Officer', 1, false, 'buddy'],
      ['badge', 'إصدار الكارنيه وربط البصمة', 'HR Officer', 1, false, 'manual'],
      ['signoff', 'اعتماد المشرف لاكتمال اليوم الأول', 'المشرف', 2, false, 'signoff']
    ],
    office: [
      ['contract', 'عقد عمل عربي بأربع نسخ موقّعة', 'HR Officer', 0, true, 'contract'],
      ['docs', 'استلام مستندات التعيين وصورة البطاقة', 'HR Officer', 0, false, 'manual'],
      ['file', 'استكمال ملف الموظف وبيانات الصرف', 'HR Officer', 1, false, 'manual'],
      ['insurance', 'تسجيل التأمينات — مهمة متتبّعة (تصدير فقط)', 'Payroll', 3, true, 'insurance'],
      ['it', 'إنشاء حساب النظام والبريد', 'IT', 1, false, 'manual'],
      ['buddy', 'تعيين الزميل المرشد وتعريف المشرف', 'HR Officer', 1, false, 'buddy'],
      ['signoff', 'اعتماد المشرف لاكتمال اليوم الأول', 'المشرف', 2, false, 'signoff']
    ]
  };
  function newPlan(e, family, startDate, id) {
    return { id: id || nextSeq('onbPlans', 'ONB', 4, true), employeeId: e.id, family, templateId: family + '-v1', startDate, createdAt: nowIso(),
      tasks: TASKS[family].map((t) => ({ id: t[0], title: t[1], owner: t[2], dueOffset: t[3], required: t[4], kind: t[5], status: 'todo', blockedReason: '', doneBy: null, doneAt: null })),
      induction: { status: 'pending', area: null, topics: [], result: null, conductedBy: null, signedAt: null, validUntil: null, attempts: [] }, buddy: { buddyEmpId: null, introAt: null }, signoff: null, contractWaiver: null };
  }
  const newProbation = (e, startDate, initial) => ({ id: 'PB-' + e.id, employeeId: e.id, startDate, initialDays: initial, extendedDays: 0, extensionUsed: false, status: 'running', decision: null, decidedBy: null, decidedAt: null, reason: '', reviews: [], remindersSent: [] });

  function mkFile(e) {
    const idx = parseInt(e.id.slice(2), 10), d = (n) => isoD(Date.now() - n * DAY), dp = (n) => isoD(Date.now() + n * DAY);
    const age = 22 + (idx * 7) % 30, by = 2026 - age, bm = 1 + (idx * 5) % 12, bd = 1 + (idx * 11) % 28;
    const female = FEMALE.indexOf(e.name.split(' ')[0]) >= 0; const gov = GOVK[(idx * 3) % GOVK.length];
    const nid = (by >= 2000 ? '3' : '2') + String(by).slice(2) + p2(bm) + p2(bd) + gov + String((idx * 37) % 10) + e.nationalIdLast4;
    const mil = female ? 'na' : ['completed', 'exempt', 'postponed'][idx % 3];
    const doc = (id, type, number, issuedDays, expDays, extra) => Object.assign({ id: id, type, label: DOC_TYPES[type], number: number || '', issuedOn: d(issuedDays), expiresOn: expDays == null ? null : dp(expDays), ver: 1, file: DOC_TYPES[type] + ' — ' + e.empNo + '.pdf', deleted: false, art92: ['national_id', 'contract', 'photo', 'education', 'medical', 'military'].indexOf(type) >= 0, tier: type === 'medical' ? 'T4' : 'T2' }, extra || {});
    const docs = [doc('D1', 'national_id', nid, 700, idx % 9 === 0 ? 24 : 1500 + idx), doc('D2', 'contract', 'CTR-' + String(idx).padStart(4, '0'), Math.max(1, Math.round((Date.now() - new Date(e.hireDate)) / DAY)), null), doc('D3', 'photo', '', 300, null), doc('D4', 'education', 'مؤهل-' + idx, 2000, null)];
    if (e.status !== 'terminated') docs.push(doc('D5', 'medical', 'MED-' + idx, 300, ((idx * 13) % 140) - 25));
    if (!female) docs.push(doc('D6', 'military', mil === 'completed' ? 'شهادة أداء الخدمة' : 'إعفاء/تأجيل', 1000, null));
    const married = idx % 3 !== 0; const deps = [];
    if (married) deps.push({ id: 'DP1', name: (female ? 'محمد ' : 'منى ') + e.name.split(' ').slice(-1)[0], relation: female ? 'زوج' : 'زوجة', dob: (by + 1) + '-0' + (1 + idx % 9) + '-1' + (idx % 9), nidLast4: String(1100 + idx * 13).slice(-4), insured: idx % 2 === 0 });
    for (let k = 0; k < idx % 3; k++) deps.push({ id: 'DP' + (k + 2), name: 'ابن/ة ' + e.name.split(' ')[0] + ' ' + (k + 1), relation: 'ابن/ة', dob: (2012 + k * 3) + '-0' + (1 + k) + '-15', nidLast4: String(2200 + idx * 7 + k).slice(-4), insured: true });
    const prod = isProdEmp(e) && ['P-07', 'P-08', 'P-09', 'P-10'].indexOf(e.positionId) >= 0;
    const fresh = Date.now() - new Date(e.hireDate) < 30 * DAY;
    return { id: e.id, personal: { nationalId: nid, dob: by + '-' + p2(bm) + '-' + p2(bd), gender: female ? 'F' : 'M', marital: married ? 'married' : 'single', nationality: 'مصري', military: mil, mobile: '+20 10' + (10000000 + (idx * 7919) % 89999999), personalEmail: 'emp' + idx + '@example.test', address: { governorate: GOV[gov], city: e.city, street: 'شارع ' + (10 + idx % 40) + ' — ' + e.city }, nameEn: null },
      contract: { no: 'CTR-' + String(idx).padStart(4, '0'), type: e.employmentType === 'permanent' ? 'غير محدد المدة' : e.employmentType === 'daily' ? 'يومية' : 'محدد المدة', start: e.hireDate, end: e.employmentType === 'permanent' ? null : isoD(new Date(e.hireDate).getTime() + 365 * DAY), copies: { employer: true, worker: true, insurance: true, admin: true }, status: e.status === 'terminated' ? 'ended' : 'active' },
      docs, dependants: deps, emergency: [{ id: 'EM1', name: (female ? 'أحمد ' : 'منى ') + e.name.split(' ').slice(-1)[0], relation: female ? 'زوج' : idx % 2 ? 'زوجة' : 'أخ', phone: '+20 100 000 ' + (2000 + idx), priority: 1 }],
      bank: { type: 'bank', bankName: BANKS[idx % BANKS.length], last4: e.bankLast4, holder: e.name, status: 'active', pending: null },
      insurance: fresh ? { status: 'pending', insuranceNo: null, exportedAt: null, submittedAt: null, confirmedAt: null } : { status: 'confirmed', insuranceNo: 'DEMO-' + (100000 + idx * 13), exportedAt: d(300), submittedAt: d(298), confirmedAt: d(290) },
      skills: prod ? [{ id: 'SK1', name: 'تشغيل ' + ['خط البثق', 'ماكينة القطع', 'خط التجميع', 'ماكينة اللامينيشن'][idx % 4], level: 1 + idx % 4, cert: 'شهادة تشغيل داخلية', expiresOn: dp(60 + (idx % 6) * 70) }, { id: 'SK2', name: 'السلامة المهنية الأساسية', level: 2 + idx % 3, cert: 'شهادة توعية السلامة', expiresOn: null }] : [],
      notes: { medical: idx === 1020 ? [{ id: 'NM1', date: d(120), text: 'لياقة مشروطة: لا عمل على ارتفاع أكثر من 2 متر (ملاحظة تجريبية).' }] : [], discipline: idx === 1023 ? [{ id: 'ND1', date: d(200), text: 'إنذار شفهي — تأخير متكرر (ملاحظة تجريبية).' }] : [], legal: idx === 1026 ? [{ id: 'NL1', date: d(60), text: 'قضية عمالية قيد النظر — مرجع داخلي {Open} (ملاحظة تجريبية).' }] : [] },
      sizes: prod ? { shoe: String(39 + idx % 6), overall: ['M', 'L', 'XL', 'XXL'][idx % 4], glove: ['M', 'L', 'XL'][idx % 3], helmet: 'قياس واحد', shirt: ['M', 'L', 'XL'][idx % 3] } : {}, checklist: {} };
  }

  function seed() {
    const d = (n) => isoD(Date.now() - n * DAY);
    st.update('settings', (s) => { s.hrPeople = Object.assign({ probationMaxDays: 90, probationReminderDays: 7, checkpoints: [30, 60, 80], chargebackCapDays: 5, chargebackCapMonths: 2, minWage: 7000, minWageBasis: null, bankDelayHours: 24, revealSeconds: 20, docAlertDays: [60, 30], dueReminderDays: 30, depreciationPct: 25, contractorsEnabled: true, inductionValidMonths: null, suspensionMaxDays: 60, showDeltaToApprovers: null, inductionTopics: INDUCTION_TOPICS.slice() }, s.hrPeople || {}); });
    /* shared employees: realistic probation cases + two extra records (a duplicate suspect + a day-2 hire) */
    st.update('employees', (list) => {
      const g = (id) => list.find((x) => x.id === id);
      const a = g('E-1031'); if (a) { a.hireDate = d(40); a.status = 'probation'; }
      const b = g('E-1030'); if (b) { b.hireDate = d(55); b.status = 'probation'; }
      const e27 = g('E-1027');
      if (!g('E-1032') && e27) list.push({ id: 'E-1032', empNo: 'EMP-0032', name: 'محسن بدوى', userId: null, departmentId: e27.departmentId, positionId: e27.positionId, managerEmpId: e27.managerEmpId, status: 'active', hireDate: d(3), endDate: null, shift: e27.shift, employmentType: e27.employmentType, phone: '+20 111 000 1032', city: e27.city, nationalIdLast4: e27.nationalIdLast4, bankLast4: e27.bankLast4, salary: { basic: e27.salary.basic, allowances: e27.salary.allowances, demo: true }, relatives: [] });
      if (!g('E-1033')) list.push({ id: 'E-1033', empNo: 'EMP-0033', name: 'نبيل صفوت', userId: null, departmentId: 'D-10', positionId: 'P-08', managerEmpId: 'E-1014', status: 'probation', hireDate: d(2), endDate: null, shift: 'B', employmentType: 'permanent', phone: '+20 111 000 1033', city: 'جمصة', nationalIdLast4: '7731', bankLast4: '4420', salary: { basic: 7800, allowances: 1200, demo: true }, relatives: [] });
    });
    const files = EMPS().map(mkFile);
    const f27 = files.find((f) => f.id === 'E-1027'), f32 = files.find((f) => f.id === 'E-1032');
    if (f27 && f32) { f32.personal = Object.assign({}, f27.personal); f32.docs = f32.docs.slice(0, 2).map((x) => Object.assign({}, x, { number: f27.personal.nationalId })); }
    const f05 = files.find((f) => f.id === 'E-1005'); if (f05) f05.bank.pending = { id: 'BK-1', newBank: 'البنك الأهلي المصري', newLast4: '8830', requestedBy: 'U-25', requestedAt: agoIso(70), approvedBy: null, approvedAt: null, effectiveAt: null, status: 'awaiting_approval' };
    const f33 = files.find((f) => f.id === 'E-1033'); if (f33) { f33.contract.copies = { employer: true, worker: true, insurance: false, admin: false }; f33.docs = f33.docs.filter((x) => x.type !== 'medical').concat([{ id: 'D5', type: 'medical', label: DOC_TYPES.medical, number: 'MED-33', issuedOn: d(4), expiresOn: isoD(Date.now() + 360 * DAY), ver: 1, file: 'لياقة طبية — EMP-0033.pdf', deleted: false, art92: true, tier: 'T4' }]); f33.skills = []; f33.sizes = { shoe: '43', overall: 'L', glove: 'L', helmet: 'قياس واحد', shirt: 'L' }; }
    st.set('empFiles', files);
    const events = [];
    EMPS().forEach((e) => { events.push({ id: 'EV-H' + e.id, employeeId: e.id, field: 'hire', label: 'التعيين', old: null, new: posTitle(e.positionId) + ' — ' + deptName(e.departmentId), tier: 'T1', effectiveFrom: e.hireDate, at: new Date(e.hireDate).toISOString(), actor: 'U-25', approver: 'U-08', reason: 'تعيين جديد', source: 'HR-05' });
      events.push({ id: 'EV-S' + e.id, employeeId: e.id, field: 'basic', label: 'المرتب الأساسي عند التعيين', old: null, new: e.salary.basic, tier: 'T3', effectiveFrom: e.hireDate, at: new Date(e.hireDate).toISOString(), actor: 'U-26', approver: 'U-08', reason: 'تحديد المرتب', source: 'HR-07' }); });
    st.set('empEvents', events.reverse());
    /* onboarding + probation */
    const plans = [], probs = [];
    const p31 = newPlan(emp('E-1031'), 'prod', d(40), 'ONB-2026-0001');
    p31.tasks.forEach((t) => { t.status = 'done'; t.doneBy = t.owner === 'OHS' ? 'U-28' : 'U-25'; t.doneAt = new Date(Date.now() - 38 * DAY).toISOString(); });
    p31.induction = { status: 'done', area: 'خط بثق الأبواب', topics: INDUCTION_TOPICS.slice(0, 5), result: 'pass', conductedBy: 'U-28', signedAt: new Date(Date.now() - 38 * DAY).toISOString(), validUntil: null, attempts: [] };
    p31.buddy = { buddyEmpId: 'E-1017', introAt: new Date(Date.now() - 39 * DAY).toISOString() }; p31.signoff = { by: 'U-27', at: new Date(Date.now() - 37 * DAY).toISOString() };
    const p33 = newPlan(emp('E-1033'), 'prod', d(2), 'ONB-2026-0002');
    const tk = (k) => p33.tasks.find((t) => t.id === k);
    tk('docs').status = 'done'; tk('docs').doneBy = 'U-25'; tk('docs').doneAt = new Date(Date.now() - 2 * DAY).toISOString(); tk('badge').status = 'blocked'; tk('badge').blockedReason = 'بانتظار طباعة الكارنيه من الأمن';
    plans.push(p33, p31); st.set('onbPlans', plans);
    const pb30 = newProbation(emp('E-1030'), d(55), 60), pb31 = newProbation(emp('E-1031'), d(40), 90), pb33 = newProbation(emp('E-1033'), d(2), 90);
    const rev = (day, sc, rec, notes) => ({ id: 'RV-' + day + '-' + Math.random().toString(36).slice(2, 5), day, scores: sc, notes: notes || '', recommendation: rec, reviewerId: 'U-27', submittedAt: new Date(Date.now() - 20 * DAY).toISOString() });
    pb30.reviews.push(rev(30, { attendance: 4, performance: 4, safety: 5, teamwork: 4 }, 'fit')); pb31.reviews.push(rev(30, { attendance: 5, performance: 4, safety: 4, teamwork: 5 }, 'fit', 'التزام ممتاز بالمواعيد.'));
    st.set('probations', [pb30, pb31, pb33]);
    /* custody catalog + matrix + issues */
    const IT = [['IT-01', 'خوذة أمان', 'ppe', true, false, ['قياس واحد'], 36, 150, 40], ['IT-02', 'حذاء أمان', 'ppe', false, false, ['39', '40', '41', '42', '43', '44', '45'], 12, 900, 25], ['IT-03', 'نظارة وقاية', 'ppe', false, false, ['قياس واحد'], 6, 60, 80], ['IT-04', 'قفازات عمل', 'ppe', false, false, ['M', 'L', 'XL'], 3, 40, 120], ['IT-05', 'سدادات أذن', 'ppe', false, false, ['قياس واحد'], 1, 10, 300], ['IT-06', 'بدلة عمل (أوفرول)', 'uniform', false, false, ['M', 'L', 'XL', 'XXL'], 12, 450, 50], ['IT-07', 'كارنيه الدخول', 'id_card', true, false, [], null, null, 30], ['IT-08', 'مفتاح خزانة', 'key', true, false, [], null, null, 60], ['IT-09', 'لابتوب', 'device', true, true, [], null, 25000, 4], ['IT-10', 'عدة يدوية', 'tool', true, false, [], 24, 1200, 12]];
    st.set('custodyItems', IT.map((r) => ({ id: r[0], code: r[0], name: r[1], category: r[2], returnable: r[3], requiresSerial: r[4], sizes: r[5], cycleMonths: r[6], unitValue: r[7], stock: r[8], standardRef: null, demo: true })));
    const mat = []; ['P-07', 'P-08', 'P-09', 'P-10'].forEach((p) => { [['IT-01', 1, true], ['IT-02', 1, true], ['IT-03', 1, true], ['IT-04', 2, false], ['IT-05', 2, false], ['IT-06', 2, true]].forEach((m) => mat.push({ positionId: p, itemId: m[0], qty: m[1], requiredForAccess: m[2] })); });
    mat.push({ positionId: 'P-07', itemId: 'IT-08', qty: 1, requiredForAccess: false });
    col('positions').filter((p) => ['P-07', 'P-08', 'P-09', 'P-10'].indexOf(p.id) < 0).forEach((p) => mat.push({ positionId: p.id, itemId: 'IT-07', qty: 1, requiredForAccess: false }));
    st.set('custodyMatrix', mat);
    const issues = []; let ln = 0; const itemById = (id) => IT.find((x) => x[0] === id);
    const prodEmps = EMPS().filter((e) => ['P-07', 'P-08', 'P-09', 'P-10'].indexOf(e.positionId) >= 0 && e.status !== 'terminated' && e.id !== 'E-1033' && e.id !== 'E-1032');
    prodEmps.forEach((e, i) => {
      const issuedDays = e.id === 'E-1031' ? 38 : Math.min(Math.round((Date.now() - new Date(e.hireDate)) / DAY) - 1, 20 + ((i * 53) % 330));
      const issuedAt = new Date(Date.now() - issuedDays * DAY).toISOString(); const f = files.find((x) => x.id === e.id); const sz = (f && f.sizes) || {};
      const lines = mat.filter((m) => m.positionId === e.positionId && m.itemId !== 'IT-07').map((m) => { const it = itemById(m.itemId); const size = m.itemId === 'IT-02' ? sz.shoe : m.itemId === 'IT-06' ? sz.overall : m.itemId === 'IT-04' ? sz.glove : (it[5][0] || ''); ln++; return { id: 'CL-' + String(ln).padStart(4, '0'), itemId: m.itemId, size: size || '', qty: m.qty, serial: '', conditionOut: 'new', dueReplaceOn: it[6] ? isoD(new Date(issuedAt).getTime() + it[6] * 30 * DAY) : null, status: 'issued', returnedAt: null, conditionIn: null }; });
      issues.push({ id: 'CUS-2026-' + String(issues.length + 1).padStart(4, '0'), employeeId: e.id, issuedBy: 'U-25', issuedAt, channel: 'paper', signatureRef: 'SIG-' + e.id, status: 'issued', lines });
    });
    const lostIssue = issues.find((x) => x.employeeId === 'E-1024'); let cbLine = null;
    if (lostIssue) { ln++; cbLine = { id: 'CL-' + String(ln).padStart(4, '0'), itemId: 'IT-10', size: '', qty: 1, serial: '', conditionOut: 'new', dueReplaceOn: null, status: 'lost', returnedAt: nowIso(), conditionIn: 'lost' }; lostIssue.lines.push(cbLine); }
    st.set('custodyIssues', issues);
    /* shared inbox coherence: these seeds create approval requests for HR Manager */
    st.set('chargebacks', []); st.set('changeRequests', []); st.set('hrLetters', []);
    if (cbLine) {
      const e = emp('E-1024'); const cb = { id: 'CB-2026-0001', lineId: cbLine.id, employeeId: e.id, itemId: 'IT-10', reason: 'فقد عدة يدوية أثناء الوردية — محضر الواقعة رقم {Open}', itemValue: 1200, depreciationPct: 25, net: 900, capDays: 5, capMonths: 2, schedule: [{ month: isoD(Date.now() + 20 * DAY).slice(0, 7), amount: 900 }], deductible: 900, notDeductible: 0, proposedBy: 'U-25', proposedAt: agoIso(60 * 20), approvalId: null, status: 'pending_approval', legalReview: false, objection: null, statement: 'إفادة الموظف مرفقة' };
      const ap = SA.requestApproval({ type: 'custody_chargeback', title: 'خصم فقد عهدة: ' + e.name + ' — عدة يدوية', requesterId: 'U-25', chain: [{ roleId: 'R-11', label: 'مدير الموارد البشرية' }], context: [['الموظف', e.name + ' (' + e.empNo + ')'], ['الصنف', 'عدة يدوية — فقد'], ['القيمة والخصم', 'سري (T3) — hr.salary.view'], ['السقف القانوني', 'مُعدّ في الإعدادات [Law Art. 151 · Pending]'], ['ملاحظة', 'المقترِح لا يعتمد (BR-CST-12)']], ref: { type: 'custody_chargeback', id: cb.id } });
      cb.approvalId = ap.id; st.insert('chargebacks', cb);
    }
    const mkCr = (o) => Object.assign({ id: nextSeq('changeRequests', 'CHG', 4, true), status: 'in_approval', createdAt: nowIso(), reason: '', before: {}, after: {}, salary: null, effectiveFrom: today(), approvalId: null, scId: null, letterId: null, retro: false }, o);
    const c1 = mkCr({ type: 'transfer', employeeId: 'E-1021', requestedBy: 'U-27', reason: 'تغطية احتياج خط التعبئة', before: { departmentId: 'D-09', managerEmpId: 'E-1014' }, after: { departmentId: 'D-10', managerEmpId: 'E-1014' }, effectiveFrom: isoD(Date.now() + 9 * DAY), createdAt: agoIso(60 * 9) });
    st.insert('changeRequests', c1);
    const a1 = SA.requestApproval({ type: 'job_change', title: 'نقل: ' + emp('E-1021').name + ' من ' + deptName('D-09') + ' إلى ' + deptName('D-10'), requesterId: 'U-27', chain: [{ roleId: 'R-11', label: 'مدير الموارد البشرية' }], context: [['الموظف', emp('E-1021').name + ' (EMP-0022)'], ['النوع', 'نقل'], ['من → إلى', deptName('D-09') + ' → ' + deptName('D-10')], ['تاريخ السريان', SA.fmt.date(c1.effectiveFrom)], ['الأثر المالي', 'لا']], ref: { type: 'job_change', id: c1.id } });
    st.patch('changeRequests', c1.id, { approvalId: a1.id });
    st.insert('changeRequests', mkCr({ type: 'promotion', employeeId: 'E-1005', requestedBy: 'U-26', reason: 'ترقية إلى مندوب أول', before: { title: posTitle('P-03') }, after: { title: 'مندوب أول' }, salary: { from: 11000, to: 12500 }, effectiveFrom: today(), approvalId: 'AP-2011', scId: 'SC-2026-0001', createdAt: agoIso(360) }));
    const c3 = mkCr({ type: 'title', employeeId: 'E-1006', requestedBy: 'U-08', status: 'effective', reason: 'تحديث المسمى الوظيفي', before: { title: posTitle('P-03') }, after: { title: 'مندوب مبيعات — تجزئة' }, effectiveFrom: d(62), createdAt: agoIso(60 * 24 * 70), appliedAt: agoIso(60 * 24 * 62) });
    st.insert('changeRequests', c3);
    const e6 = emp('E-1006'); if (e6) { st.patch('employees', 'E-1006', { titleOverride: 'مندوب مبيعات — تجزئة' }); const l = letter('change', e6, c3.id, 'خطاب تغيير المسمى الوظيفي', ['السيد/ة ' + e6.name + '،', 'نحيطكم علمًا بأنه تقرر اعتبارًا من ' + SA.fmt.date(d(62)) + ' تعديل مسماكم الوظيفي إلى «مندوب مبيعات — تجزئة» دون أثر مالي.', 'وتفضلوا بقبول فائق الاحترام.']); st.patch('changeRequests', c3.id, { letterId: l.id }); addEvent(e6, { field: 'title', label: 'المسمى الوظيفي', old: posTitle('P-03'), new: 'مندوب مبيعات — تجزئة', effectiveFrom: d(62), at: agoIso(60 * 24 * 62), source: 'HR-07', reason: 'تحديث المسمى', actor: 'U-08' }); }
    /* contractors (D9 Open — enabled for the demo) */
    const AG = [{ id: 'AGN-001', name: 'وكالة الدلتا للتوريد', crNo: 'سجل تجاري {Placeholder}', taxId: 'بطاقة ضريبية {Placeholder}', contact: 'م. شادي — +20 100 555 0101', status: 'active', wageLiability: null, rating: 4, contractFrom: d(120), contractTo: isoD(Date.now() + 180 * DAY), blacklisted: false }, { id: 'AGN-002', name: 'شركة الصفوة للعمالة', crNo: 'سجل تجاري {Placeholder}', taxId: 'بطاقة ضريبية {Placeholder}', contact: 'أ. نادية — +20 100 555 0202', status: 'active', wageLiability: null, rating: 3, contractFrom: d(300), contractTo: isoD(Date.now() + 25 * DAY), blacklisted: false }, { id: 'AGN-003', name: 'مقاولات الوادي للخدمات', crNo: 'سجل تجاري {Placeholder}', taxId: 'بطاقة ضريبية {Placeholder}', contact: 'أ. رضا — +20 100 555 0303', status: 'under_review', wageLiability: null, rating: null, contractFrom: null, contractTo: null, blacklisted: false }];
    st.set('agencies', AG);
    const WN = [['فارس عبد الحميد', 'AGN-001', 'عامل تعبئة', true, true], ['سعيد منير', 'AGN-001', 'عامل تعبئة', true, true], ['حمدي رجب', 'AGN-001', 'عامل تحميل', true, true], ['بلال أنور', 'AGN-001', 'عامل تعبئة', true, false], ['كمال الدسوقي', 'AGN-002', 'فني مساعد', true, true], ['عصام فرغلي', 'AGN-002', 'فني مساعد', true, true], ['ناصر يوسف', 'AGN-002', 'عامل نظافة صناعية', true, false], ['رامز علوان', 'AGN-002', 'عامل تحميل', false, false], ['أسامة حجازي', 'AGN-001', 'عامل تعبئة', true, true], ['مدحت سليم', 'AGN-002', 'فني مساعد', true, true], ['إيهاب لطيف', 'AGN-001', 'عامل تحميل', true, true], ['مصطفى كامل', 'AGN-002', 'عامل تعبئة', true, false]];
    const workers = WN.map((w, i) => { const by = 1985 + (i * 3) % 14; const nid = (by >= 2000 ? '3' : '2') + String(by).slice(2) + p2(1 + (i * 5) % 12) + p2(1 + (i * 7) % 28) + GOVK[(i * 5) % GOVK.length] + '1' + String(3000 + i * 131).slice(-4); return { id: 'CW-' + String(i + 1).padStart(3, '0'), name: w[0], nationalId: nid, agencyId: w[1], role: w[2], idChecked: w[3], inductionDone: w[4], inductionDate: w[4] ? d(20 + i) : null, inductionValidUntil: null, status: 'registered', phone: '+20 11' + (10000000 + i * 91357), registeredAt: new Date(Date.now() - (30 - i) * DAY).toISOString(), blacklisted: false, convertedEmployeeId: null }; });
    workers[11].blacklisted = true; workers[11].status = 'blacklisted';
    st.set('ctrWorkers', workers);
    const T = today(), Y = d(1), Y2 = d(2); const roster = [];
    const ent = (date, w, o) => roster.push(Object.assign({ id: 'RS-' + date + '-' + w.id, date, workerId: w.id, agencyId: w.agencyId, requestId: 'HCR-2026-0001', expected: true, gateIn: null, gateOut: null, lineIn: null, lineOut: null, idOk: false, inductionOk: !!w.inductionDone, hoursRaw: null, hoursApproved: null, approvedBy: null, adjustReason: '', status: 'expected', supervisorId: 'U-27' }, o || {}));
    workers.filter((w) => !w.blacklisted).forEach((w, i) => { if (i === 0) ent(T, w, { gateIn: '07:50', idOk: true, lineIn: '08:05', status: 'on_line' }); else if (i === 1) ent(T, w, { gateIn: '07:58', idOk: true, status: 'arrived' }); else if (i < 8) ent(T, w); });
    workers.filter((w) => !w.blacklisted).slice(0, 7).forEach((w, i) => { ent(Y, w, { gateIn: '07:5' + i, idOk: true, lineIn: '08:0' + i, lineOut: '16:' + p2(10 + i * 5), gateOut: '16:' + p2(15 + i * 5), hoursRaw: +(8 + i * 0.25).toFixed(2), status: 'left' }); if (i < 5) ent(Y2, w, { gateIn: '07:55', idOk: true, lineIn: '08:00', lineOut: '16:00', gateOut: '16:05', hoursRaw: 8, hoursApproved: 8, approvedBy: 'U-27', status: 'approved' }); });
    st.set('ctrRoster', roster);
    st.set('ctrRequests', [{ id: 'HCR-2026-0001', deptId: 'D-10', role: 'عامل تعبئة', qty: 6, from: Y, to: isoD(Date.now() + 6 * DAY), agencyId: 'AGN-001', confirmedQty: 4, requestedBy: 'U-27', approvedBy: 'U-25', status: 'confirmed_partial', createdAt: agoIso(60 * 30) }, { id: 'HCR-2026-0002', deptId: 'D-12', role: 'فني مساعد', qty: 3, from: isoD(Date.now() + 3 * DAY), to: isoD(Date.now() + 10 * DAY), agencyId: null, confirmedQty: 0, requestedBy: 'U-27', approvedBy: null, status: 'sent', createdAt: agoIso(60 * 6) }]);
    st.set('ctrBlacklist', [{ id: 'BL-001', subjectType: 'worker', subjectId: 'CW-012', subjectName: workers[11].name, reason: 'سلوك خطر على خط الإنتاج وتجاوز تعليمات السلامة', evidence: 'محضر أمن رقم {Open}', requestedBy: 'U-25', approvedBy: 'U-08', from: d(15), to: null, status: 'active', liftedBy: null, liftReason: '' }]);
    st.set('importBatches', []); st.set('dupCases', []); st.set('ctrActions', []);
  }
  let seeding = false;
  function ensure() {
    if (seeding || !st.get('meta') || !st.get('employees') || !st.get('settings') || !st.get('approvals')) return false;
    if (st.get('meta.hrPeopleSeeded') === SEED_V) return true;
    seeding = true;
    try { seed(); st.set('meta.hrPeopleSeeded', SEED_V); } catch (e) { console.error('[hr-people] seed failed', e); return false; } finally { seeding = false; }
    return true;
  }

  /* ═════════════════════════ HR-06 · الموظفون ═════════════════════════ */
  const SHIFT = { day: 'نهاري', A: 'وردية A', B: 'وردية B', C: 'وردية C' };
  const subnavTabs = () => [{ id: 'dir', label: 'الدليل' }, { id: 'quality', label: 'جودة البيانات' }, { id: 'duplicates', label: 'كشف التكرار', badge: (dupPairs().length || null) }];
  function subnav(active) {
    const ts = subnavTabs().filter((t) => t.id === 'dir' || canT2());
    return h('div.sap-pp-tabs-wrap', {}, SA.tabs({ tabs: ts, active, label: 'أقسام الموظفين', onChange: (id) => SA.nav(id === 'dir' ? 'hr/employees' : 'hr/employees/' + id) }).el);
  }
  const docState = (d) => {
    if (!d.expiresOn) return { k: 'ok', label: 'ساري', kind: 'success', days: null };
    const days = daysBetween(today(), d.expiresOn); const al = S().docAlertDays || [60, 30];
    if (days < 0) return { k: 'expired', label: 'منتهي', kind: 'danger', days };
    if (days <= al[1]) return { k: 'soon30', label: 'ينتهي خلال ' + days + ' يوم', kind: 'warning', days };
    if (days <= al[0]) return { k: 'soon60', label: 'ينتهي خلال ' + days + ' يوم', kind: 'info', days };
    return { k: 'ok', label: 'ساري', kind: 'success', days };
  };
  const liveDocs = (f) => (f ? f.docs.filter((d) => !d.deleted) : []);
  const visibleDocs = (f) => liveDocs(f).filter((d) => d.tier !== 'T4' || SA.can('hr.medical.view'));
  const expiringDocs = (f, max) => visibleDocs(f).filter((d) => { const s = docState(d); return s.k === 'expired' || (s.days != null && s.days <= (max == null ? 30 : max)); });

  const ART92 = [
    ['name', 'الاسم والمهنة', (e) => !!e.name && !!e.positionId], ['nid', 'الرقم القومي وصورة البطاقة', (e, f) => liveDocs(f).some((d) => d.type === 'national_id')], ['dob', 'تاريخ الميلاد', (e, f) => !!f.personal.dob], ['address', 'محل الإقامة', (e, f) => !!(f.personal.address && f.personal.address.street)],
    ['education', 'المؤهل الدراسي', (e, f) => liveDocs(f).some((d) => d.type === 'education')], ['hire', 'تاريخ الالتحاق بالعمل', (e) => !!e.hireDate], ['contract', 'عقد العمل بأربع نسخ', (e, f) => Object.keys(f.contract.copies).every((k) => f.contract.copies[k])], ['photo', 'صورة شخصية', (e, f) => liveDocs(f).some((d) => d.type === 'photo')],
    ['military', 'موقف التجنيد', (e, f) => f.personal.military === 'na' ? 'na' : liveDocs(f).some((d) => d.type === 'military')], ['medical', 'شهادة اللياقة الطبية سارية', (e, f) => liveDocs(f).some((d) => d.type === 'medical' && docState(d).k !== 'expired')], ['insurance', 'بيانات التأمينات', (e, f) => f.insurance.status !== 'pending'], ['bank', 'بيانات الصرف', (e, f) => !!f.bank.last4],
    ['emergency', 'جهة اتصال للطوارئ', (e, f) => f.emergency.length > 0], ['wage', 'بيان الأجر', (e) => (e.salary && e.salary.basic > 0)], ['rules', 'إقرار استلام لائحة العمل', (e, f) => !!(f.checklist.rules && f.checklist.rules.status === 'present'), 'manual'], ['signature', 'نموذج توقيع الموظف', (e, f) => !!(f.checklist.signature && f.checklist.signature.status === 'present'), 'manual']
  ];
  function checklistOf(e) {
    const f = file(e.id); if (!f) return { items: [], pct: 0, done: 0 };
    const items = ART92.map((it) => { const w = f.checklist[it[0]]; const v = it[2](e, f); let s = v === 'na' ? 'na' : v ? 'present' : 'missing'; if (s === 'missing' && w && w.status === 'waived') s = 'waived'; return { key: it[0], label: it[1], status: s, manual: it[3] === 'manual', waiver: w && w.status === 'waived' ? w : null }; });
    const done = items.filter((x) => x.status !== 'missing').length; return { items, done, pct: Math.round(done / items.length * 100) };
  }
  function qualityOf(e) {
    const f = file(e.id); if (!f) return { index: 0, fields: 0, docs: 0, cons: 0 };
    const req = [e.name, e.departmentId, e.positionId, e.managerEmpId || e.id === 'E-1001', e.hireDate, e.phone, f.personal.nationalId, f.personal.dob, f.personal.address && f.personal.address.street, f.bank.last4, f.emergency.length, isProdEmp(e) ? (f.sizes && f.sizes.shoe) : true];
    const fields = Math.round(req.filter(Boolean).length / req.length * 100);
    const docs = visibleDocs(f).length ? Math.round(visibleDocs(f).filter((d) => docState(d).k !== 'expired').length / visibleDocs(f).length * 100) : 0;
    const chk = checkNid(f.personal.nationalId); const cons = chk.ok && chk.dob === f.personal.dob && (f.personal.gender === chk.gender || true) ? 100 : 40;
    return { index: Math.round(fields * 0.5 + docs * 0.3 + cons * 0.2), fields, docs, cons };
  }
  const PBLK = 'سبب الحجب'; // shared label

  /* duplicates */
  const normName = (s) => String(s || '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  function lev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 3; const d = []; for (let i = 0; i <= m; i++) { d[i] = [i]; } for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
  function dupPairs() {
    if (!ensure()) return [];
    const out = [], fs = col('empFiles'), list = EMPS().filter((e) => !e.mergedInto); const dismissed = col('dupCases').filter((c) => c.decision === 'dismissed').map((c) => [c.a, c.b].sort().join('|'));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]; const key = [a.id, b.id].sort().join('|'); if (dismissed.indexOf(key) >= 0) continue;
      const fa = fs.find((f) => f.id === a.id), fb = fs.find((f) => f.id === b.id); if (!fa || !fb) continue;
      if (fa.personal.nationalId && fa.personal.nationalId === fb.personal.nationalId) out.push({ key, a, b, match: 'exact', why: 'تطابق تام بالرقم القومي' });
      else if (lev(normName(a.name), normName(b.name)) <= 1 && (a.phone === b.phone || fa.personal.dob === fb.personal.dob)) out.push({ key, a, b, match: 'probable', why: 'اسم متقارب + نفس الهاتف/الميلاد' });
    }
    return out;
  }

  /* ───────── PII reveal (T2) ───────── */
  function piiCell(e, kind, full, last4) {
    const box = h('span.sap-flex', { style: { display: 'inline-flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } });
    let timer = null;
    const mask = () => (kind === 'bank' ? maskAcc(last4) : maskNid(last4));
    const draw = (shown, left) => {
      SA.clear(box);
      if (shown) { box.append(h('span.sap-pp-mask', { style: { fontWeight: '700' } }, full), h('small.t-muted', {}, 'سيُخفى بعد ' + left + ' ث · لا يدخل في أي تصدير')); return; }
      box.append(mask(), SA.btn({ label: 'إظهار', icon: 'eye', kind: 'ghost', size: 'sm', reason: permReason('hr.pii.reveal'), onClick: reveal }));
    };
    async function reveal() {
      const r = await SA.confirm({ title: 'إظهار ' + (kind === 'bank' ? 'رقم الحساب' : 'الرقم القومي') + ' كاملًا', icon: 'eye', confirmLabel: 'إظهار', reasonRequired: true, reasonLabel: 'سبب الإظهار', impact: ['هتظهر القيمة كاملة لـ' + (S().revealSeconds || 20) + ' ثانية (قيمة تجريبية — الأصل {Open}) ثم تتخفى تلقائيًا.', 'الإظهار مش بيدخل في أي تصدير.'], note: 'كل كشف بيتسجّل باسمك في HR.EMPLOYEE.PII_REVEALED.' });
      if (!r.ok) return;
      deliver('HR.EMPLOYEE.PII_REVEALED', empTgt(e), { reason: r.reason, after: { field: kind === 'bank' ? 'bank_account' : 'national_id' } });
      let left = S().revealSeconds || 20; draw(true, left);
      timer = setInterval(() => { left--; if (!box.isConnected || left <= 0) { clearInterval(timer); if (box.isConnected) draw(false); } else draw(true, left); }, 1000);
    }
    draw(false); return box;
  }
  const fmtNid = (v) => String(v).replace(/(\d)(\d{2})(\d{2})(\d{2})(\d{2})(\d{5})/, '$1 $2$3$4 $5 $6');

  /* ───────── CSV export (directory) ───────── */
  function exportDirectory(rows) {
    const sens = SA.can('hr.export.sensitive'); const head = ['الرقم الوظيفي', 'الاسم', 'القسم', 'الوظيفة', 'الوردية', 'نوع التوظيف', 'الحالة', 'تاريخ التعيين', 'هاتف العمل'];
    if (sens) head.push('الرقم القومي (مقنّع)', 'الحساب البنكي (مقنّع)'); if (sens && canSal()) head.push('المرتب الأساسي');
    const data = [head].concat(rows.map((e) => { const f = file(e.id); const r = [e.empNo, e.name, deptName(e.departmentId), e.titleOverride || posTitle(e.positionId), SHIFT[e.shift] || e.shift, ETYPE[e.employmentType], (EMP_ST[e.status] || [e.status])[0], e.hireDate, e.phone]; if (sens) r.push('•••••••••• ' + e.nationalIdLast4, '•••• ' + (f ? f.bank.last4 : '')); if (sens && canSal()) r.push(e.salary.basic); return r; }));
    download('employees-' + today() + '.csv', data);
    deliver(sens ? 'HR.EXPORT.SENSITIVE' : 'EXPORT.DATA', tgt('export', 'employees', 'دليل الموظفين (' + rows.length + ')'), { after: { rows: rows.length, sensitive: sens } });
    SA.toast('تم تنزيل ' + rows.length + ' سجل' + (sens ? ' (أعمدة T2 مقنّعة)' : ' (T0/T1 فقط)'), 'success');
  }

  /* ───────── directory ───────── */
  function renderDirectory(root, ctx) {
    ctx.setCrumbs([{ label: 'الموظفون' }, { label: 'الدليل والملفات' }]);
    let view = ctx.path[0] === 'org' ? 'org' : (ctx.params.view || 'table'); let orgMode = 'tree';
    const head = SA.pageHead({ title: 'الدليل والملفات', desc: 'دليل موحّد بنطاق بياناتك — الحقول الحساسة مخفية افتراضيًا ولا تُكشف إلا بصلاحية وسبب مسجّل.', tags: [SA.tag('pending')], actions: [
      SA.btn({ label: 'استيراد', icon: 'upload', kind: 'ghost', perm: 'hr.employees.create', onClick: () => SA.nav('hr/employees/import') }),
      SA.btn({ label: 'تصدير', icon: 'download', kind: 'ghost', perm: 'hr.employees.export', onClick: () => exportDirectory(table ? table.filteredRows() : visibleEmps()) }),
      SA.btn({ label: 'موظف جديد', icon: 'userplus', kind: 'accent', perm: 'hr.employees.create', onClick: () => SA.nav('hr/employees/new') })] });
    root.append(head);
    let table = null;
    return loadGate(root, 'table', (host) => {
      const kpis = h('div.sap-grid-cards', { style: { marginBottom: '14px' } }); const sub = subnav('dir'); const viewBar = h('div.sap-pp-views'); const body = h('div'); const cardsBox = h('div.sap-pp-cards'); const orgBox = h('div.card.sap-card', {}, h('div.sap-card-body'));
      host.append(kpis, sub, viewBar, body);
      const rows = () => visibleEmps().slice().sort((a, b) => a.empNo.localeCompare(b.empNo));
      function drawKpis() {
        const r = visibleEmps(); const t2 = canT2(); SA.clear(kpis);
        const cnt = (s) => r.filter((e) => e.status === s).length;
        kpis.append(SA.kpi('على رأس العمل', r.filter((e) => ['active', 'probation', 'leave', 'notice'].indexOf(e.status) >= 0).length, { sub: r.length + ' سجل في نطاقك' }), SA.kpi('تحت التجربة', cnt('probation'), { sub: 'قرارات التجربة في «التعيين والتجربة»' }), SA.kpi('في إجازة / موقوف', cnt('leave') + cnt('suspended'), {}),
          t2 ? SA.kpi('مستندات تنتهي ≤ 30 يوم', r.reduce((n, e) => n + expiringDocs(file(e.id), 30).length, 0), { sub: 'تشمل المنتهية بالفعل' }) : null, t2 ? SA.kpi('ملفات غير مكتملة (م. 92)', r.filter((e) => e.status !== 'terminated' && checklistOf(e).pct < 100).length, { sub: 'قائمة تجريبية — Pending [Law]' }) : null);
        kpis.querySelectorAll('.kpi').forEach((k, i) => { if (i === 1 && table) { k.style.cursor = 'pointer'; k.onclick = () => table.setFilter('status', 'probation'); } });
      }
      function drawViews() {
        SA.clear(viewBar); viewBar.append(SA.segmented([['table', 'جدول'], ['cards', 'بطاقات'], ['org', 'هيكل تنظيمي']], view, (v) => { view = v; applyView(); history.replaceState(null, '', '#/hr/employees' + (v === 'table' ? '' : '?view=' + v)); }), h('span.t-muted', {}, 'بيانات تجريبية — العدد الحقيقي {Open} (بند 3)'));
      }
      function cardsDraw() {
        const list = table.filteredRows(); SA.clear(cardsBox); let shown = 24;
        const draw = () => { SA.clear(cardsBox); if (!list.length) { cardsBox.append(SA.empty({ icon: 'search', title: 'مفيش موظفين بالفلاتر دي', text: 'جرّب تشيل فلتر أو تغيّر البحث.' })); return; } list.slice(0, shown).forEach((e) => cardsBox.append(h('button.sap-pp-ecard', { type: 'button', onclick: () => SA.nav('hr/employees/' + e.id) }, h('div.sap-pp-ecard-top', {}, SA.avatar(e.name), h('div', {}, h('b', {}, e.name), h('br'), h('small', {}, e.empNo))), h('div', {}, h('div', {}, e.titleOverride || posTitle(e.positionId)), h('small', {}, deptName(e.departmentId) + ' · ' + (SHIFT[e.shift] || e.shift))), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' } }, stChip(EMP_ST, e.status), h('small.num', {}, e.phone))))); if (list.length > shown) cardsBox.append(h('div', { style: { gridColumn: '1 / -1', textAlign: 'center' } }, h('button.btn.btn-ghost', { type: 'button', onclick: () => { shown += 24; draw(); } }, 'عرض المزيد (' + (list.length - shown) + ')'))); };
        draw();
      }
      function orgDraw() {
        const bodyEl = orgBox.firstChild; SA.clear(bodyEl);
        const ids = new Set(table.filteredRows().map((e) => e.id)); const all = visibleEmps(); const byMgr = {}; all.forEach((e) => { (byMgr[e.managerEmpId || ''] = byMgr[e.managerEmpId || ''] || []).push(e); });
        const seg = SA.segmented([['tree', 'الهيكل'], ['crews', 'الورديات والطواقم']], orgMode, (v) => { orgMode = v; orgDraw(); });
        bodyEl.append(h('div', { style: { marginBottom: '12px' } }, seg));
        if (orgMode === 'crews') {
          const groups = {}; all.filter((e) => e.status !== 'terminated' && ids.has(e.id)).forEach((e) => { const k = (isProdDept(e.departmentId) ? 'إنتاج' : 'إدارة') + '|' + e.shift; (groups[k] = groups[k] || []).push(e); });
          const crews = h('div.sap-pp-crews'); Object.keys(groups).sort().forEach((k) => { const g = groups[k]; const sup = g.map((e) => e.managerEmpId).filter(Boolean).sort((a, b) => g.filter((x) => x.managerEmpId === b).length - g.filter((x) => x.managerEmpId === a).length)[0]; crews.append(h('div.sap-pp-crew', {}, h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('b', {}, k.split('|')[0] + ' — ' + (SHIFT[k.split('|')[1]] || k.split('|')[1])), SA.chip(g.length + ' موظف', 'info')), h('small.t-muted', {}, 'المشرف الغالب: ' + (sup && emp(sup) ? emp(sup).name : '—')), h('div', { style: { fontSize: 'var(--text-dense)' } }, g.slice(0, 6).map((e) => empLink(e)).reduce((a, x, i) => a.concat(i ? [' · ', x] : [x]), []), g.length > 6 ? ' …' : ''))); });
          bodyEl.append(crews.childNodes.length ? crews : SA.empty({ icon: 'users', title: 'لا توجد طواقم مطابقة' })); return;
        }
        const keep = (e) => ids.has(e.id) || (byMgr[e.id] || []).some(keep); const roots = all.filter((e) => !e.managerEmpId || !all.some((x) => x.id === e.managerEmpId)).filter(keep);
        const node = (e, depth) => { const kids = (byMgr[e.id] || []).filter(keep); let open = depth < 2; const li = h('li'); const ul = h('ul', { hidden: !open });
          const tg = kids.length ? h('button.sap-pp-tgl', { type: 'button', 'aria-expanded': String(open), 'aria-label': 'طيّ/فرد ' + e.name, onclick: () => { open = !open; ul.hidden = !open; tg.setAttribute('aria-expanded', String(open)); tg.textContent = open ? '−' : kids.length; } }, open ? '−' : kids.length) : null;
          li.append(h('div.sap-pp-node', {}, SA.avatar(e.name), h('div', {}, h('a', { href: SA.href('hr/employees/' + e.id) }, e.name), h('br'), h('small', {}, (e.titleOverride || posTitle(e.positionId)) + ' · ' + deptName(e.departmentId))), stChip(EMP_ST, e.status), tg)); kids.forEach((k) => ul.append(node(k, depth + 1))); if (kids.length) li.append(ul); return li; };
        bodyEl.append(roots.length ? h('ul.sap-pp-tree', {}, roots.map((r) => node(r, 0))) : SA.empty({ icon: 'users', title: 'لا يوجد موظفون في الهيكل' }));
      }
      function applyView() {
        drawViews(); table.el.classList.toggle('sap-pp-hide-table', view !== 'table');
        cardsBox.remove(); orgBox.remove();
        if (view === 'cards') { body.firstChild.appendChild(cardsBox); cardsDraw(); } else if (view === 'org') { body.appendChild(orgBox); orgDraw(); }
      }
      table = SA.table({
        rowId: 'id', pageSize: 10, caption: 'دليل الموظفين', rows, initial: { filters: { status: ctx.params.status || '' } },
        search: { placeholder: 'اسم · رقم وظيفي · تليفون' + (canT2() ? ' · الرقم القومي' : ''), keys: (e, q) => { const f = file(e.id); return [e.name, e.empNo, e.phone, posTitle(e.positionId)].some((v) => String(v).toLowerCase().indexOf(q) >= 0) || (canT2() && f && String(f.personal.nationalId).indexOf(q) >= 0); } },
        filters: [{ key: 'departmentId', label: 'القسم', options: deptOpts() }, { key: 'status', label: 'الحالة', options: Object.keys(EMP_ST).map((k) => [k, EMP_ST[k][0]]) }, { key: 'shift', label: 'الوردية', options: Object.keys(SHIFT).map((k) => [k, SHIFT[k]]) }, { key: 'employmentType', label: 'النوع', options: Object.keys(ETYPE).map((k) => [k, ETYPE[k]]) }],
        columns: [{ key: 'name', label: 'الموظف', sort: true, render: (e) => empCell(e) }, { key: 'departmentId', label: 'القسم', sort: true, value: (e) => deptName(e.departmentId), render: (e) => deptName(e.departmentId) }, { key: 'shift', label: 'الوردية', sort: true, render: (e) => SHIFT[e.shift] || e.shift }, { key: 'employmentType', label: 'النوع', render: (e) => ETYPE[e.employmentType] || e.employmentType }, { key: 'status', label: 'الحالة', sort: true, render: (e) => stChip(EMP_ST, e.status) }, { key: 'hireDate', label: 'التعيين', sort: true, render: (e) => h('span.num', {}, SA.fmt.date(e.hireDate)) },
          canT2() ? { key: 'docs', label: 'تنبيهات', render: (e) => { const n = expiringDocs(file(e.id), 30).length; return n ? SA.chip(n + ' مستند', 'warning') : h('span.t-muted', {}, '—'); } } : null].filter(Boolean),
        onRowClick: (e) => SA.nav('hr/employees/' + e.id), rowActions: (e) => [{ label: 'فتح الملف', icon: 'id', onClick: () => SA.nav('hr/employees/' + e.id) }, { label: 'طلب تغيير وظيفي', icon: 'swap', hidden: !SA.can('hr.changes.create'), onClick: () => SA.nav('hr/changes/new', { query: { emp: e.id } }) }, { label: 'صرف عهدة', icon: 'box', hidden: !SA.can('hr.custody.edit'), onClick: () => SA.nav('hr/custody', { query: { issue: e.id } }) }],
        empty: { icon: 'users', title: 'لا يوجد موظفون في نطاقك', text: 'نطاق بياناتك قد يكون محدودًا بفريقك أو قسمك.' },
        onChange: () => { if (view === 'cards') cardsDraw(); else if (view === 'org') orgDraw(); }
      });
      const wrap = h('div.card.card-flush.sap-listcard', {}, table.el); body.append(wrap);
      drawKpis(); applyView();
      const off = st.subscribe('employees', () => { if (!host.isConnected) return; drawKpis(); table.refresh(); if (view === 'cards') cardsDraw(); else if (view === 'org') orgDraw(); });
      const off2 = st.subscribe('empFiles', () => { if (host.isConnected) drawKpis(); });
      return () => { off(); off2(); };
    });
  }

  /* ───────── profile ───────── */
  const TAB_DEFS = [['overview', 'نظرة عامة', 'user'], ['personal', 'البيانات الشخصية', 'id'], ['job', 'الوظيفة والعقد', 'building'], ['documents', 'المستندات', 'file'], ['family', 'المعالون والطوارئ', 'users'], ['bank', 'البنك والصرف', 'coins'], ['insurance', 'التأمينات', 'shield'], ['skills', 'المهارات والشهادات', 'star'], ['custody', 'العهدة', 'box'], ['leave', 'الإجازات', 'clipboard'], ['salary', 'المرتب', 'coins'], ['history', 'السجل', 'history'], ['notes', 'ملاحظات سرية', 'lock'], ['completeness', 'اكتمال الملف', 'checkcircle']];
  const lockedTab = (id) => (id === 'personal' || id === 'documents' || id === 'family' || id === 'bank' || id === 'insurance' || id === 'completeness' ? !canT2() : id === 'salary' ? !canSal() : id === 'notes' ? !(SA.can('hr.medical.view') || SA.can('hr.discipline.view') || SA.can('hr.legal.view')) : false);
  const T3ON = {}; // per-session throttle for read audits
  function throttle(key, ms) { const n = Date.now(); if (T3ON[key] && n - T3ON[key] < (ms || 300000)) return false; T3ON[key] = n; return true; }

  function renderProfile(root, ctx, id) {
    const e0 = emp(id);
    if (!e0) { root.append(SA.pageHead({ title: 'موظف غير موجود', back: { href: SA.href('hr/employees'), label: 'الدليل' } }), SA.card({}, SA.empty({ icon: 'search', title: 'الملف غير موجود', text: 'الرقم ' + id + ' غير موجود (ربما اتدمج في سجل آخر).', action: { label: 'العودة للدليل', icon: 'arrowright', onClick: () => SA.nav('hr/employees') } }))); return; }
    if (!canSee(id)) { SA.audit('ACCESS.DENIED', { target: tgt('employee', id, 'ملف موظف خارج النطاق'), result: 'denied', reason: 'خارج نطاق البيانات (hr)' }); root.append(SA.denied({ perm: 'hr.employees.view', title: 'ملف خارج نطاق بياناتك', text: 'نطاقك على بيانات الموارد البشرية «' + SA.rbac.scopeLabel(SA.scopeOf('hr')) + '». الملف ده خارجه. (تم تسجيل المحاولة.)' })); return; }
    ctx.setCrumbs([{ label: 'الموظفون' }, { label: 'الدليل والملفات', href: SA.href('hr/employees') }, { label: e0.name }]);
    let tab = ctx.params.tab && TAB_DEFS.some((t) => t[0] === ctx.params.tab) ? ctx.params.tab : 'overview';
    return loadGate(root, 'detail', (host) => {
      const wrap = h('div'); host.append(wrap);
      function draw() {
        const e = emp(id); if (!e) { SA.nav('hr/employees'); return; } const f = file(id);
        SA.clear(wrap); wrap.append(profileHead(e), h('div.sap-pp-tabs-wrap', {}, SA.tabs({ label: 'تبويبات ملف الموظف', active: tab, tabs: TAB_DEFS.map((t) => ({ id: t[0], label: t[1], icon: lockedTab(t[0]) ? 'lock' : t[2] })), onChange: (v) => { tab = v; history.replaceState(null, '', '#/hr/employees/' + id + '?tab=' + v); drawPanel(); } }).el));
        const panel = h('div#panel-' + tab, { role: 'tabpanel', 'aria-labelledby': 'tab-' + tab }); wrap.append(panel); drawPanelInto(panel, e, f);
        setTimeout(() => { const b = wrap.querySelector('.tab[aria-selected=true]'); if (b && b.scrollIntoView) b.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 0);
      }
      function drawPanelInto(panel, e, f) { const fn = TABS[tab]; try { SA.clear(panel); panel.append(fn(e, f, draw)); } catch (err) { console.error(err); panel.append(SA.errorState({ onRetry: draw })); } }
      function drawPanel() { const panel = wrap.querySelector('[role=tabpanel]'); if (panel) { panel.id = 'panel-' + tab; panel.setAttribute('aria-labelledby', 'tab-' + tab); drawPanelInto(panel, emp(id), file(id)); } }
      draw();
      const offs = ['employees', 'empFiles', 'empEvents', 'custodyIssues', 'leaveRequests', 'changeRequests', 'probations', 'onbPlans', 'chargebacks'].map((p) => st.subscribe(p, () => { if (wrap.isConnected) draw(); }));
      return () => offs.forEach((o) => o());
    });
  }
  function profileHead(e) {
    const pb = probOf(e.id); const blk = selfBlock(e); const pl = planOf(e.id);
    const menu = (a) => SA.menu(a, [{ label: 'نسخ الرقم الوظيفي', icon: 'copy', onClick: () => SA.copy(e.empNo).then(() => SA.toast('تم النسخ', 'success')) }, { label: 'قائمة التعيين', icon: 'check', hidden: !pl || !SA.can('hr.onboarding.view'), onClick: () => SA.nav('hr/onboarding/' + pl.id) }, { label: 'فترة التجربة', icon: 'clock', hidden: !pb || !SA.can('hr.onboarding.view'), onClick: () => SA.nav('hr/onboarding/probation/' + e.id) }, { label: 'صرف عهدة', icon: 'box', hidden: !SA.can('hr.custody.edit'), onClick: () => SA.nav('hr/custody', { query: { issue: e.id } }) }, { label: 'الهيكل التنظيمي', icon: 'users', onClick: () => SA.nav('hr/employees/org') }]);
    return h('div', {}, SA.pageHead({ title: 'ملف الموظف', back: { href: SA.href('hr/employees'), label: 'الدليل' }, actions: [SA.btn({ label: 'طلب تغيير وظيفي', icon: 'swap', kind: 'ghost', perm: 'hr.changes.create', onClick: () => SA.nav('hr/changes/new', { query: { emp: e.id } }) }), SA.btn({ label: 'تعديل البيانات', icon: 'edit', kind: 'primary', perm: 'hr.employees.edit', reason: blk, onClick: () => editDialog(e) }), h('button.sap-kebab', { type: 'button', 'aria-label': 'المزيد', 'aria-haspopup': 'menu', onclick: (ev) => menu(ev.currentTarget) }, SA.icon('dots'))] }),
      h('div.sap-pp-profile', {}, SA.avatar(e.name), h('div.sap-pp-pmain', {}, h('h2', {}, e.name), h('div.sap-pp-pmeta', {}, h('b.num', {}, e.empNo), stChip(EMP_ST, e.status), h('span', {}, (e.titleOverride || posTitle(e.positionId)) + ' · ' + deptName(e.departmentId)), e.mergedInto ? SA.chip('دُمج في ' + (emp(e.mergedInto) || {}).empNo, 'neutral') : null), h('small', {}, 'تاريخ التعيين ' + SA.fmt.date(e.hireDate) + ' · ' + (SHIFT[e.shift] || e.shift) + ' · ' + (ETYPE[e.employmentType] || ''))), pb && pb.status === 'running' ? h('div', {}, SA.chip('تجربة — متبقي ' + Math.max(0, probInfo(pb).daysLeft) + ' يوم', probInfo(pb).daysLeft <= (S().probationReminderDays || 7) ? 'warning' : 'info')) : null));
  }

  const kvRow = (a, b) => [a, b];
  const sec = (title, kids, actions, tier) => SA.card({ title: h('span', {}, title, tier ? tierBadge(tier) : null), actions: actions || null }, kids);
  const TABS = {
    overview(e, f) {
      const ck = checklistOf(e), q = qualityOf(e), alerts = []; const mgr = e.managerEmpId ? emp(e.managerEmpId) : null; const pb = probOf(e.id); const pl = planOf(e.id);
      if (f && f.bank.pending) alerts.push(['warning', 'طلب تغيير حساب بنكي قيد المراجعة', 'bank']);
      if (f && canT2()) expiringDocs(f, 30).forEach((d) => alerts.push([docState(d).k === 'expired' ? 'danger' : 'warning', d.label + ' — ' + docState(d).label, 'documents']));
      if (pl && planInfo(pl).blockers.length) alerts.push(['danger', 'قائمة التعيين فيها ' + planInfo(pl).blockers.length + ' عائق (Blocker)', null, SA.href('hr/onboarding/' + pl.id)]);
      if (pb && pb.status === 'running' && probInfo(pb).daysLeft <= (S().probationReminderDays || 7)) alerts.push(['warning', 'قرار التجربة مستحق خلال ' + probInfo(pb).daysLeft + ' يوم', null, SA.href('hr/onboarding/probation/' + e.id)]);
      const gate = gateOf(e.id); if (isProdEmp(e) && !gate.open) alerts.push(['danger', 'بوابة الماكينات مقفولة: ' + gate.reason, null, SA.href('hr/onboarding/' + (pl ? pl.id : ''))]);
      const open = custodyOpenOf(e.id); if (open.length && e.status === 'terminated') alerts.push(['danger', 'عهدة قائمة تمنع إخلاء الطرف (' + open.length + ')', 'custody']);
      return h('div.sap-pp-grid2', {}, h('div.sap-pp-stack', {},
        sec('ملخص', SA.kv([['القسم', deptName(e.departmentId)], ['الوظيفة', e.titleOverride || posTitle(e.positionId)], ['المدير المباشر', mgr ? empLink(mgr) : '—'], ['الوردية', SHIFT[e.shift] || e.shift], ['مدة الخدمة', Math.max(0, Math.floor(daysBetween(e.hireDate, today()) / 30)) + ' شهر تقريبًا'], ['هاتف العمل', ltr(e.phone)], ['الموقع', e.city]]), null, 'T1'),
        sec('تنبيهات', alerts.length ? h('div.sap-pp-stack', {}, alerts.map((a) => h('div.sap-alert.alert.alert-' + (a[0] === 'danger' ? 'danger' : 'warning'), {}, SA.icon('alert'), h('div', {}, a[1], ' ', a[2] ? h('a.sap-linkbtn', { href: '#/hr/employees/' + e.id + '?tab=' + a[2] }, 'فتح') : h('a.sap-linkbtn', { href: a[3] }, 'فتح'))))) : SA.empty({ icon: 'checkcircle', title: 'مفيش تنبيهات', text: 'الملف سليم حاليًا.' }))),
        h('div.sap-pp-stack', {}, canT2() ? sec('اكتمال الملف وجودة البيانات', h('div.sap-pp-stack', {}, h('div', {}, h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', {}, 'بنود المادة 92 (قائمة تجريبية)'), h('b.num', {}, ck.done + ' / ' + ck.items.length)), meter(ck.pct, ck.pct === 100 ? 'ok' : ck.pct >= 70 ? 'warn' : 'bad')), h('div', {}, h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', {}, 'مؤشر الجودة (أوزان 50/30/20 تجريبية)'), h('b.num', {}, q.index + '%')), meter(q.index, q.index >= 85 ? 'ok' : 'warn')))) : sec('اكتمال الملف', lockCard('بيانات T2', 'اكتمال الملف يتطلب صلاحية تعديل الملفات.', 'hr.employees.edit')),
          sec('ملخص الإجازات والعهدة', h('div.sap-pp-stats', {}, statBox('رصيد سنوي', (col('leaveBalances').find((b) => b.employeeId === e.id && b.type === 'annual') || {}).balanceDays == null ? '—' : col('leaveBalances').find((b) => b.employeeId === e.id && b.type === 'annual').balanceDays), statBox('طلبات إجازة', col('leaveRequests').filter((r) => r.employeeId === e.id).length), statBox('عهدة قائمة', open.length, open.length ? 'warn' : '')), null, 'T1')));
    },
    personal(e, f) {
      if (!canT2()) return lockCard('البيانات الشخصية (T2)', 'تظهر لمن يملك صلاحية إدارة ملفات الموظفين. غيره يرى T0/T1 فقط (BR-EMP-17).', 'hr.employees.edit');
      const chk = checkNid(f.personal.nationalId); const p = f.personal; const blk = selfBlock(e);
      return h('div.sap-pp-grid2', {}, sec('الهوية', SA.kv([['الاسم', e.name], ['الاسم اللاتيني', p.nameEn || SA.openValue('غير مسجّل')], ['الرقم القومي', piiCell(e, 'nid', fmtNid(p.nationalId), e.nationalIdLast4)], ['تاريخ الميلاد', h('span.num', {}, SA.fmt.date(p.dob)), chk.ok && chk.dob !== p.dob ? SA.chip('غير مطابق للرقم القومي', 'warning') : null], ['النوع', p.gender === 'F' ? 'أنثى' : 'ذكر'], ['الحالة الاجتماعية', MARITAL[p.marital]], ['الجنسية', p.nationality], ['موقف التجنيد', MILITARY[p.military]]].map((r) => [r[0], r[2] ? h('span', {}, r[1], ' ', r[2]) : r[1]])), [SA.btn({ label: 'تعديل', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'hr.employees.edit', reason: blk, onClick: () => editDialog(e) })], 'T2'),
        sec('الاتصال والعنوان', SA.kv([['هاتف العمل', h('span', {}, ltr(e.phone), tierBadge('T0'))], ['موبايل شخصي', ltr(p.mobile)], ['بريد شخصي', ltr(p.personalEmail)], ['المحافظة', p.address.governorate], ['المدينة', p.address.city], ['العنوان', p.address.street]]), null, 'T2'));
    },
    job(e, f) {
      const mgr = e.managerEmpId ? emp(e.managerEmpId) : null; const pend = col('changeRequests').filter((c) => c.employeeId === e.id && ['in_approval', 'scheduled', 'approved'].indexOf(c.status) >= 0);
      const vers = empEventsOf(e.id).filter((x) => ['hire', 'department', 'title', 'position', 'shift', 'grade', 'manager', 'status'].indexOf(x.field) >= 0);
      return h('div.sap-pp-grid2', {}, h('div.sap-pp-stack', {}, sec('الوظيفة الحالية', SA.kv([['القسم', deptName(e.departmentId)], ['الوظيفة', e.titleOverride || posTitle(e.positionId)], ['الدرجة', e.grade || SA.openValue()], ['المدير المباشر', mgr ? empLink(mgr) : '—'], ['الوردية', SHIFT[e.shift] || e.shift], ['نوع التوظيف', ETYPE[e.employmentType]], ['تاريخ التعيين', h('span.num', {}, SA.fmt.date(e.hireDate))], ['الموقع', e.city]]), [SA.btn({ label: 'طلب تغيير', icon: 'swap', kind: 'ghost', size: 'sm', perm: 'hr.changes.create', onClick: () => SA.nav('hr/changes/new', { query: { emp: e.id } }) })], 'T1'),
        sec('سجل الإسنادات (تواريخ السريان)', vers.length ? h('ol.sap-pp-tl', {}, vers.slice(0, 8).map((v) => h('li', {}, h('time', {}, SA.fmt.date(v.effectiveFrom)), h('span.sap-pp-dot'), h('div.b', {}, h('b', {}, v.label), h('p', {}, (v.old != null ? v.old + ' ← ' : '') + v.new))))) : SA.empty({ icon: 'history', title: 'لا إسنادات مسجّلة' }), null, 'T1')),
        h('div.sap-pp-stack', {}, sec('العقد', canT2() ? h('div.sap-pp-stack', {}, SA.kv([['رقم العقد', h('span.num', {}, f.contract.no)], ['النوع', f.contract.type], ['البداية', h('span.num', {}, SA.fmt.date(f.contract.start))], ['النهاية', f.contract.end ? h('span.num', {}, SA.fmt.date(f.contract.end)) : 'غير محدد'], ['الحالة', SA.chip(f.contract.status === 'active' ? 'ساري' : 'منتهي', f.contract.status === 'active' ? 'success' : 'neutral')]]), h('div', {}, h('b', { style: { fontSize: 'var(--text-dense)' } }, 'نسخ العقد الأربع (م. 89 — Pending [Law])'), h('div.sap-pp-pill-row', { style: { marginTop: '6px' } }, [['employer', 'صاحب العمل'], ['worker', 'العامل'], ['insurance', 'مكتب التأمينات'], ['admin', 'الجهة الإدارية']].map((c) => SA.chip(c[1], f.contract.copies[c[0]] ? 'success' : 'warning'))))) : lockCard('تفاصيل العقد (T2)', 'تظهر لمن يملك صلاحية تعديل الملفات.', 'hr.employees.edit'), null, 'T2'),
          sec('تغييرات قيد الاعتماد / مجدولة', pend.length ? h('div.sap-pp-stack', {}, pend.map((c) => h('div.sap-alert.alert.alert-info', {}, SA.icon('swap'), h('div', {}, h('b', {}, CHG_TYPES[c.type] ? CHG_TYPES[c.type].label : c.type), ' — ' + (CHG_STATUS[c.status] || [c.status])[0] + ' · سريان ' + SA.fmt.date(c.effectiveFrom), ' ', SA.can('hr.changes.view') ? h('a.sap-linkbtn', { href: SA.href('hr/changes/' + c.id) }, c.id) : null)))) : h('p.t-muted', {}, 'لا توجد تغييرات قيد الاعتماد.'))));
    },
    documents(e, f) {
      if (!canT2()) return lockCard('خزنة المستندات (T2)', 'تظهر لمن يملك صلاحية تعديل الملفات.', 'hr.employees.edit');
      const docs = visibleDocs(f); const hiddenMed = liveDocs(f).length - docs.length; const blk = selfBlock(e);
      const counts = { all: docs.length, soon: docs.filter((d) => ['soon30', 'soon60'].indexOf(docState(d).k) >= 0).length, expired: docs.filter((d) => docState(d).k === 'expired').length };
      const table = SA.table({ rowId: 'id', pageSize: 10, rows: () => visibleDocs(file(e.id)), caption: 'مستندات الموظف',
        filters: [{ key: 'state', label: 'الحالة', options: [['ok', 'ساري'], ['soon60', 'تنتهي ≤ 60 يوم'], ['soon30', 'تنتهي ≤ 30 يوم'], ['expired', 'منتهي']], test: (d, v) => docState(d).k === v }],
        columns: [{ key: 'label', label: 'المستند', sort: true, render: (d) => h('span', {}, d.label, d.tier === 'T4' ? tierBadge('T4') : null) }, { key: 'number', label: 'الرقم', render: (d) => (d.type === 'national_id' ? maskNid(e.nationalIdLast4) : d.number ? h('span.num', {}, d.number) : '—') }, { key: 'issuedOn', label: 'الإصدار', render: (d) => h('span.num', {}, SA.fmt.date(d.issuedOn)) }, { key: 'expiresOn', label: 'الانتهاء', sort: true, render: (d) => (d.expiresOn ? h('span.num', {}, SA.fmt.date(d.expiresOn)) : 'بلا انتهاء') }, { key: 'state', label: 'الحالة', render: (d) => { const s = docState(d); return SA.chip(s.label, s.kind); } }, { key: 'ver', label: 'النسخة', render: (d) => h('span.num', {}, 'v' + d.ver) }],
        rowActions: (d) => [{ label: 'تنزيل (محاكاة)', icon: 'download', onClick: () => SA.toast('تنزيل «' + d.file + '» (محاكاة — لا ملفات حقيقية)', 'info') }, { label: 'استبدال بنسخة جديدة', icon: 'upload', disabled: permReason('hr.employees.edit') || blk, onClick: () => docDialog(e, d) }, { label: 'حذف ناعم بسبب', icon: 'trash', danger: true, disabled: permReason('hr.employees.edit') || blk || (d.art92 ? 'مستندات م. 92 لا تُحذف خلال الاحتفاظ (BR-EMP-09)' : ''), onClick: () => docDelete(e, d) }],
        empty: { icon: 'file', title: 'لا توجد مستندات', text: 'ارفع أول مستند للموظف.' } });
      return h('div.sap-pp-grid2', {}, h('div.card.card-flush.sap-listcard', {}, table.el), h('div.sap-pp-stack', {}, sec('رفع مستند', h('div.sap-pp-stack', {}, h('div.sap-pp-stats', {}, statBox('المستندات', counts.all), statBox('تنتهي قريبًا', counts.soon, counts.soon ? 'warn' : ''), statBox('منتهية', counts.expired, counts.expired ? 'bad' : '')), SA.btn({ label: 'رفع مستند جديد', icon: 'upload', kind: 'primary', perm: 'hr.employees.edit', reason: blk, onClick: () => docDialog(e, null) }), hiddenMed ? note('lock', 'مستند طبي (T4) مخفي — يحتاج hr.medical.view.') : null), null, 'T2'), sec('قواعد التنبيه', h('div.sap-pp-pill-row', {}, (S().docAlertDays || [60, 30]).map((n, i) => SA.chip(n + ' يوم · ' + (i ? 'إجراء' : 'معلومة'), i ? 'warning' : 'info')), SA.chip('منتهي · عاجل', 'danger')), null)));
    },
    family(e, f) {
      if (!canT2()) return lockCard('المعالون وجهات الطوارئ (T2)', 'تظهر لمن يملك صلاحية تعديل الملفات.', 'hr.employees.edit'); const blk = selfBlock(e);
      return h('div.sap-pp-grid2', {}, sec('المعالون', f.dependants.length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الاسم', 'الصلة', 'الميلاد', 'الرقم القومي', 'مؤمَّن'].map((t) => h('th', {}, t)))), h('tbody', {}, f.dependants.map((d) => h('tr', {}, h('td', {}, d.name), h('td', {}, d.relation), h('td.num', {}, SA.fmt.date(d.dob)), h('td', {}, maskNid(d.nidLast4)), h('td', {}, d.insured ? SA.chip('نعم', 'success') : SA.chip('لا', 'neutral'))))))) : SA.empty({ icon: 'users', title: 'لا معالون مسجّلون' }), [SA.btn({ label: 'إضافة معال', icon: 'plus', kind: 'ghost', size: 'sm', perm: 'hr.employees.edit', reason: blk, onClick: () => depDialog(e) })], 'T2'),
        sec('جهات الاتصال للطوارئ', h('div.sap-pp-stack', {}, f.emergency.map((c) => h('div.sap-usercell', {}, SA.avatar(c.name), h('div', {}, h('b', {}, c.name + ' (' + c.relation + ')'), h('small.num', {}, c.phone + ' · أولوية ' + c.priority)))).concat([note('info', 'لازم جهة اتصال طوارئ واحدة على الأقل (من بنود م. 92 التجريبية).')])), [SA.btn({ label: 'إضافة جهة', icon: 'plus', kind: 'ghost', size: 'sm', perm: 'hr.employees.edit', reason: blk, onClick: () => emgDialog(e) })], 'T2'));
    },
    bank(e, f) {
      if (!canT2()) return lockCard('بيانات الصرف (T2)', 'تظهر لمن يملك صلاحية تعديل الملفات.', 'hr.employees.edit');
      const b = f.bank, p = b.pending; const blk = selfBlock(e);
      return h('div.sap-pp-grid2', {}, sec('حساب الصرف الحالي', h('div.sap-pp-stack', {}, SA.kv([['طريقة الصرف', b.type === 'bank' ? 'تحويل بنكي (D5 Pending)' : b.type], ['البنك', b.bankName], ['رقم الحساب', piiCell(e, 'bank', '•••••••• ' + b.last4 + ' (القيمة الكاملة محفوظة في البنك)', b.last4)], ['اسم صاحب الحساب', b.holder], ['الحالة', SA.chip('ساري', 'success')]]), SA.btn({ label: 'طلب تغيير الحساب', icon: 'edit', kind: 'primary', perm: 'hr.employees.edit', reason: blk || (p ? 'يوجد طلب تغيير قيد المعالجة' : ''), onClick: () => bankDialog(e) })), null, 'T2'),
        sec('ضوابط تغيير الحساب (BR-EMP-06)', h('div.sap-pp-stack', {}, p ? bankPending(e, f) : SA.empty({ icon: 'checkcircle', title: 'لا طلب تغيير حالي', text: 'أي تغيير يحتاج معتمدًا مختلفًا عن الطالب + إشعار فوري للموظف + تأخير ' + (S().bankDelayHours || 24) + ' ساعة.' }), note('info', 'قيمة التأخير تجريبية (24 ساعة — Pending) ولا تسري داخل نافذة إقفال المرتبات {Open}.'))));
    },
    insurance(e, f) {
      if (!canT2()) return lockCard('التأمينات (T2)', 'تظهر لمن يملك صلاحية تعديل الملفات.', 'hr.employees.edit');
      const ins = f.insurance; const steps = [['pending', 'معلّقة'], ['submitted', 'مُقدَّمة (يدويًا)'], ['confirmed', 'مؤكَّدة']]; const idx = steps.findIndex((s) => s[0] === ins.status);
      return h('div.sap-pp-grid2', {}, sec('حالة التسجيل في التأمينات', h('div.sap-pp-stack', {}, SA.stepper(steps.map((s) => s[1]), idx), SA.kv([['الرقم التأميني', ins.insuranceNo ? h('span.num', {}, ins.insuranceNo, SA.demoValue('')) : SA.openValue('لم يُسجَّل بعد')], ['تاريخ التصدير', ins.exportedAt ? SA.fmt.date(ins.exportedAt) : '—'], ['تاريخ التقديم', ins.submittedAt ? SA.fmt.date(ins.submittedAt) : '—'], ['تاريخ التأكيد', ins.confirmedAt ? SA.fmt.date(ins.confirmedAt) : '—'], ['الأجر التأميني', canSal() ? SA.openValue('غير مُعدّ (بند 44)') : secret()]]), h('div.sap-pp-pill-row', {}, SA.btn({ label: 'تصدير بيانات التسجيل', icon: 'download', kind: 'ghost', perm: 'hr.employees.edit', onClick: () => insExport(e) }), SA.btn({ label: 'تأكيد التقديم يدويًا', icon: 'check', kind: 'ghost', perm: 'hr.employees.edit', reason: ins.status !== 'pending' ? 'تم التقديم' : '', onClick: () => insSubmit(e) }), SA.btn({ label: 'تسجيل رقم التأمين', icon: 'shield', kind: 'primary', perm: 'hr.employees.edit', reason: ins.status === 'confirmed' ? 'مؤكَّد بالفعل' : ins.status === 'pending' ? 'قدّم البيانات أولًا' : '', onClick: () => insConfirm(e) }))), null, 'T2'),
        sec('بدون ادّعاء تكامل', h('div.sap-pp-stack', {}, SA.alert('warning', h('b', {}, 'مهمة متتبّعة — لا يوجد ربط آلي مع الهيئة. '), 'البيانات تُصدَّر ويُقدَّمها الموظف المختص يدويًا، وأرقام الاستمارات ومواعيد التسجيل {Open} (D12) وتتأكد من الهيئة.'), note('lock', 'عمود الأجر في الحزمة T3: يظهر لمن يملك hr.salary.view وغيره يرى «سري» في الواجهة والتصدير (BR-ONB-10).'))));
    },
    skills(e, f) {
      const blk = selfBlock(e);
      return h('div', {}, SA.card({ title: 'المهارات والشهادات', actions: [SA.btn({ label: 'إضافة مهارة', icon: 'plus', kind: 'ghost', size: 'sm', perm: 'hr.employees.edit', reason: blk, onClick: () => skillDialog(e) })], flush: true }, f.skills.length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['المهارة / الماكينة', 'المستوى (0–4)', 'الشهادة', 'تنتهي'].map((t) => h('th', {}, t)))), h('tbody', {}, f.skills.map((s) => { const dd = s.expiresOn ? daysBetween(today(), s.expiresOn) : null; return h('tr', {}, h('td', {}, s.name), h('td.num', {}, h('b', {}, s.level)), h('td', {}, s.cert || '—'), h('td', {}, s.expiresOn ? h('span', {}, h('span.num', {}, SA.fmt.date(s.expiresOn)), ' ', dd != null && dd <= 60 ? SA.chip(dd < 0 ? 'منتهية' : dd + ' يوم', dd < 0 ? 'danger' : 'warning') : null) : 'بلا انتهاء')); })))) : SA.empty({ icon: 'star', title: 'لا مهارات مسجّلة', text: 'مصفوفة المهارات التفصيلية في التدريب (HR-19).' })));
    },
    custody(e) {
      const lines = []; col('custodyIssues').filter((i) => i.employeeId === e.id).forEach((i) => i.lines.forEach((l) => lines.push(Object.assign({ slip: i }, l))));
      const it = (id) => col('custodyItems').find((x) => x.id === id) || { name: id };
      return h('div', {}, SA.card({ title: 'دفتر عهدة الموظف', actions: [SA.btn({ label: 'صرف عهدة', icon: 'box', kind: 'ghost', size: 'sm', perm: 'hr.custody.edit', onClick: () => SA.nav('hr/custody', { query: { issue: e.id } }) }), SA.btn({ label: 'فتح العهدة', icon: 'external', kind: 'ghost', size: 'sm', perm: 'hr.custody.view', onClick: () => SA.nav('hr/custody') })], flush: true },
        lines.length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الصنف', 'المقاس', 'الكمية', 'الصرف', 'الاستبدال المتوقع', 'الحالة'].map((t) => h('th', {}, t)))), h('tbody', {}, lines.map((l) => h('tr', {}, h('td', {}, it(l.itemId).name, ' ', h('small.num', {}, l.slip.id)), h('td', {}, l.size || '—'), h('td.num', {}, l.qty), h('td.num', {}, SA.fmt.date(l.slip.issuedAt)), h('td', {}, l.dueReplaceOn ? h('span.num', {}, SA.fmt.date(l.dueReplaceOn)) : SA.openValue('غير مُعدّ')), h('td', {}, stChip(LINE_ST, l.status))))))) : SA.empty({ icon: 'box', title: 'لا عهدة مسجّلة', text: 'لا يوجد صرف لهذا الموظف.' })));
    },
    leave(e) {
      const bal = col('leaveBalances').filter((b) => b.employeeId === e.id); const reqs = col('leaveRequests').filter((r) => r.employeeId === e.id).sort((a, b) => b.from.localeCompare(a.from)); const T = { annual: 'سنوية', sick: 'مرضية', casual: 'عارضة' };
      return h('div.sap-pp-grid2', {}, sec('الأرصدة', bal.length ? h('div.sap-pp-stats', {}, bal.map((b) => statBox(T[b.type] || b.type, b.balanceDays + ' / ' + (b.balanceDays + b.usedDays)))) : SA.empty({ icon: 'clipboard', title: 'الأرصدة غير مُعدّة', text: 'قواعد الاستحقاق قانونية Pending [Law] وتُعدّ من إعدادات الإجازات.' }), null, 'T1'),
        sec('الطلبات', reqs.length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الرقم', 'النوع', 'من', 'إلى', 'الأيام', 'الحالة'].map((t) => h('th', {}, t)))), h('tbody', {}, reqs.map((r) => h('tr', {}, h('td.num', {}, r.id), h('td', {}, T[r.type] || r.type), h('td.num', {}, SA.fmt.date(r.from)), h('td.num', {}, SA.fmt.date(r.to)), h('td.num', {}, r.days), h('td', {}, SA.chip({ pending: 'بانتظار الاعتماد', approved: 'معتمدة', rejected: 'مرفوضة' }[r.status] || r.status, { pending: 'warning', approved: 'success', rejected: 'danger' }[r.status] || 'neutral'))))))) : SA.empty({ icon: 'clipboard', title: 'لا طلبات إجازة' }), SA.can('hr.leave.view') ? [SA.btn({ label: 'شاشة الإجازات', icon: 'external', kind: 'ghost', size: 'sm', onClick: () => SA.nav('hr/leave') })] : null, canT2() ? 'T2' : 'T1'));
    },
    salary(e) {
      if (!canSal()) return h('div.sap-pp-lockcard', { role: 'alert' }, h('span.dot', {}, SA.icon('lock')), h('strong', {}, 'ممنوع — تبويب المرتب (T3 سري)'), h('span.t-muted', {}, 'لا تُعرض أي قيم ولا أرقام مقنّعة. الأجور تظهر لمن تمنحه الإدارة hr.salary.view صراحةً — General Manager ليس تلقائيًا (بند 46 Pending).'), h('code', {}, 'hr.salary.view'), SA.can('sa.roles.view') ? h('a.sap-linkbtn', { href: SA.href('roles') }, 'الأدوار والصلاحيات الحساسة') : null);
      if (throttle('sal-' + e.id)) deliver('HR.SALARY.VIEWED', empTgt(e), { reason: 'فتح تبويب المرتب' });
      const evs = empEventsOf(e.id).filter((x) => x.tier === 'T3'); const pend = col('changeRequests').filter((c) => c.employeeId === e.id && c.salary && ['in_approval', 'scheduled', 'approved'].indexOf(c.status) >= 0);
      return h('div.sap-pp-grid2', {}, sec('الأجر الحالي', h('div.sap-pp-stack', {}, SA.kv([['الأساسي', moneyT3(e.salary.basic)], ['البدلات', moneyT3(e.salary.allowances)], ['الإجمالي', moneyT3(e.salary.basic + e.salary.allowances)], ['الأجر التأميني', SA.openValue('غير مُعدّ (بند 44)')], ['الحد الأدنى للأجور (إعداد)', h('span', {}, h('span.num', {}, SA.fmt.money(S().minWage)), SA.tag('pending', 'Law · Pending'))]]), e.salary.pending ? SA.alert('warning', 'لم يُحدَّد المرتب بعد — يُحدَّد بطلب تغيير مرتب (فصل مهام).') : null, e.salary.demo ? note('info', 'أرقام تجريبية obviously-demo.') : null, SA.btn({ label: 'طلب تغيير مرتب', icon: 'swap', kind: 'ghost', perm: 'hr.salary.change.request', onClick: () => SA.nav('hr/changes/new', { query: { emp: e.id, type: 'salary' } }) })), null, 'T3'),
        h('div.sap-pp-stack', {}, pend.length ? sec('تغيير مرتب قيد الاعتماد', pend.map((c) => h('div.sap-alert.alert.alert-info', {}, SA.icon('swap'), h('div', {}, h('b', {}, c.id), ' · الأساسي ', moneyT3(c.salary.from), ' ← ', moneyT3(c.salary.to), ' · سريان ' + SA.fmt.date(c.effectiveFrom)))), null, 'T3') : null,
          sec('تاريخ المرتب (بتواريخ السريان)', evs.length ? h('ol.sap-pp-tl', {}, evs.slice(0, 8).map((v) => h('li', {}, h('time', {}, SA.fmt.date(v.effectiveFrom)), h('span.sap-pp-dot'), h('div.b', {}, h('b', {}, v.label), h('p', {}, (v.old != null ? SA.fmt.money(v.old) + ' ← ' : '') + SA.fmt.money(v.new)))))) : SA.empty({ icon: 'history', title: 'لا تغييرات' }), null, 'T3'), h('p.sap-hint', {}, SA.icon('eye', 'icon-sm'), h('span', {}, 'قراءة هذا التبويب تُسجَّل (HR.SALARY.VIEWED). لا يظهر لمدير النظام ولا للمشرف ولا للـGM تلقائيًا.'))));
    },
    history(e) {
      const evs = empEventsOf(e.id); const showT3 = evs.some((x) => x.tier === 'T3') && canSal();
      if (showT3 && throttle('hist-' + e.id)) deliver('HR.EMP.HISTORY_VIEWED', empTgt(e), { reason: 'فتح السجل وفيه قيم T3' });
      const fut = col('changeRequests').filter((c) => c.employeeId === e.id && ['scheduled', 'in_approval'].indexOf(c.status) >= 0 && c.effectiveFrom > today());
      const val = (v, ev) => (ev.tier === 'T3' && !canSal() ? secret() : ev.tier === 'T3' && typeof v === 'number' ? SA.fmt.money(v) : v);
      return h('div', {}, SA.card({ title: 'سجل الأحداث وتاريخ التغيير' }, h('ol.sap-pp-tl', {}, fut.map((c) => h('li.is-future', {}, h('time', {}, SA.fmt.date(c.effectiveFrom), h('br'), h('small', {}, 'مجدول')), h('span.sap-pp-dot'), h('div.b', {}, h('b', {}, (CHG_TYPES[c.type] || {}).label || c.type), h('p', {}, c.id + ' · ' + (CHG_STATUS[c.status] || [c.status])[0])))), evs.map((v, i) => h('li' + (i === 0 && !fut.length ? '.is-now' : ''), {}, h('time', {}, SA.fmt.date(v.effectiveFrom)), h('span.sap-pp-dot'), h('div.b', {}, h('b', {}, v.label, v.tier !== 'T1' ? tierBadge(v.tier) : null), h('p', {}, h('span', {}, (v.old != null ? [val(v.old, v), ' ← '] : ''), val(v.new, v)), v.reason ? ' · ' + v.reason : '', v.actor ? ' · بواسطة ' + (SA.userName(v.actor) !== v.actor ? SA.userName(v.actor) : v.actor) : ''))))), evs.length ? null : SA.empty({ icon: 'history', title: 'لا أحداث' })), h('p.sap-hint', {}, SA.icon('eye', 'icon-sm'), h('span', {}, 'سجل لا يُعدَّل ولا يُحذف (append-only). قيم T3 تظهر «سري» لغير المخوّل، وقراءة سجل فيه T3 تُسجَّل HR.EMP.HISTORY_VIEWED.')));
    },
    notes(e, f) {
      const secs = [['medical', 'ملاحظات طبية', 'hr.medical.view'], ['discipline', 'ملاحظات تأديبية', 'hr.discipline.view'], ['legal', 'قضايا عمالية', 'hr.legal.view']];
      if (!secs.some((s) => SA.can(s[2]))) return lockCard('ملاحظات T4 مقفولة', 'الطبي والتأديبي والقضايا بمفاتيح منفصلة فقط، ولا تُصدَّر ولا تُرسَل في إشعار بدونها (BR-EMP-05).', 'hr.medical.view · hr.discipline.view · hr.legal.view');
      secs.forEach((s) => { if (SA.can(s[2]) && (f.notes[s[0]] || []).length && throttle('n-' + s[0] + e.id)) deliver('HR.EMP.HISTORY_VIEWED', empTgt(e), { reason: 'قراءة ' + s[1] + ' (T4)' }); });
      return h('div.sap-pp-stack', {}, secs.map((s) => sec(s[1], SA.can(s[2]) ? ((f.notes[s[0]] || []).length ? f.notes[s[0]].map((n) => h('div.sap-alert.alert.alert-info', {}, SA.icon('note'), h('div', {}, h('b.num', {}, SA.fmt.date(n.date)), ' — ', n.text))) : h('p.t-muted', {}, 'لا توجد ملاحظات.')) : lockCard('مقفول', 'يحتاج ' + s[2], s[2]), null, 'T4')));
    },
    completeness(e, f) {
      if (!canT2()) return lockCard('اكتمال الملف (T2)', 'يتطلب صلاحية تعديل الملفات.', 'hr.employees.edit');
      const ck = checklistOf(e), q = qualityOf(e); const chk = checkNid(f.personal.nationalId); const lab = { present: ['موجود', 'success'], missing: ['ناقص', 'danger'], na: ['لا ينطبق', 'neutral'], waived: ['مُعفى', 'info'] };
      const blk = selfBlock(e);
      return h('div.sap-pp-grid2', {}, SA.card({ title: 'بنود المادة 92 — قائمة تجريبية', tags: SA.tag('pending', 'Law · Pending'), flush: true }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['البند', 'الحالة', ''].map((t) => h('th', {}, t)))), h('tbody', {}, ck.items.map((it) => h('tr', {}, h('td', {}, it.label, it.waiver ? h('small.t-muted', {}, ' — ' + it.waiver.reason) : null), h('td', {}, SA.chip(lab[it.status][0], lab[it.status][1])), h('td', {}, it.status === 'missing' ? [it.manual ? SA.btn({ label: 'تسجيل', icon: 'check', kind: 'ghost', size: 'sm', perm: 'hr.employees.edit', reason: blk, onClick: () => ckMark(e, it.key) }) : null, SA.btn({ label: 'إعفاء', icon: 'xcircle', kind: 'ghost', size: 'sm', perm: 'hr.changes.approve', reason: permReason('hr.changes.approve') || blk, onClick: () => ckWaive(e, it) })] : null))))))),
        h('div.sap-pp-stack', {}, sec('الاكتمال', h('div', { style: { textAlign: 'center' } }, h('div.num', { style: { font: '700 2.4rem var(--font-en,sans-serif)', color: 'var(--eg-navy)' } }, ck.pct + '%'), h('small.t-muted', {}, ck.done + ' / ' + ck.items.length + ' بند'), meter(ck.pct, ck.pct === 100 ? 'ok' : ck.pct >= 70 ? 'warn' : 'bad'), ck.pct < 100 ? h('p.t-muted', { style: { marginBlock: '8px 0' } }, '«جاهز للتفعيل» يتطلب 100% أو إعفاءً مسبّبًا من HR Manager (BR-EMP-10).') : null)),
          sec('مؤشر جودة البيانات', h('div.sap-pp-stack', {}, [['حقول مطلوبة', q.fields, '50%'], ['مستندات سارية', q.docs, '30%'], ['اتساق (ميلاد ≈ رقم قومي)', q.cons, '20%']].map((r) => h('div', {}, h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-caption)' } }, h('span', {}, r[0] + ' (' + r[2] + ')'), h('b.num', {}, r[1] + '%')), meter(r[1], r[1] >= 85 ? 'ok' : 'warn'))).concat([h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('b', {}, 'المؤشر'), h('b.num', {}, q.index + '%')), note('info', 'الأوزان {Open} — DEMO 50/30/20.')])), null),
          sec('بيانات مشتقّة من الرقم القومي', chk.ok ? SA.kv([['تاريخ الميلاد', SA.fmt.date(chk.dob)], ['المحافظة', chk.gov], ['النوع من الرقم', chk.gender === 'M' ? 'ذكر' : 'أنثى']]) : SA.alert('danger', chk.msg), null, 'T2')));
    }
  };

  /* ───────── profile dialogs & actions ───────── */
  const sodBlock = (requesterUserId, e) => { const u = me(); if (!u) return 'غير مسجّل'; if (requesterUserId && requesterUserId === u.id) return 'أنت مقدّم الطلب — لا يعتمد الطالب طلبه (فصل المهام).'; if (e && e.userId && e.userId === u.id) return 'الطلب يخصّك أنت — لا تعتمد طلبًا عن نفسك.'; return selfBlock(e); };
  function patchFile(id, fn) { st.update('empFiles', (l) => { const f = l.find((x) => x.id === id); if (f) fn(f); }); }
  function requestProfileChange(e, kind, payload, summary, attachment) {
    const cr = { id: nextSeq('changeRequests', 'CHG', 4, true), type: 'profile', kind, employeeId: e.id, requestedBy: me().id, status: 'in_approval', reason: summary, before: {}, after: payload, salary: null, effectiveFrom: today(), createdAt: nowIso(), approvalId: null, scId: null, letterId: null, retro: false, attachment };
    st.insert('changeRequests', cr, true);
    const ap = SA.requestApproval({ type: 'job_change', title: 'تعديل بيانات حساسة: ' + e.name + ' — ' + summary, chain: [{ roleId: 'R-11', label: 'مدير الموارد البشرية' }], context: [['الموظف', e.name + ' (' + e.empNo + ')'], ['التعديل', summary], ['المرفق', attachment || '—'], ['ملاحظة', 'تعديل حقل حساس: HR Officer يطلب ← HR Manager يعتمد (مرفق إلزامي)']], ref: { type: 'job_change', id: cr.id } });
    st.patch('changeRequests', cr.id, { approvalId: ap.id });
    deliver('HR.EMP.CHANGE_REQUESTED', empTgt(e), { reason: summary, after: { kind, approval: ap.id } });
    return cr;
  }
  const attachRule = (v) => (!v || !String(v).trim() ? 'المرفق إلزامي للتعديل الحساس' : null);
  function editDialog(e) {
    const blk = selfBlock(e); if (blk) { SA.toast(blk, 'error', { ms: 6500 }); deliver('HR.CHG.SOD_BLOCKED', empTgt(e), { result: 'denied', reason: blk }); return; }
    const f = file(e.id), p = f.personal; const t2 = canT2();
    const fl = [F({ name: 'phone', label: 'هاتف العمل (T0)', type: 'tel', required: true, value: e.phone, rules: [phoneRule] }),
      t2 ? F({ name: 'mobile', label: 'موبايل شخصي (T2)', type: 'tel', value: p.mobile, rules: [phoneRule] }) : null, t2 ? F({ name: 'email', label: 'بريد شخصي', type: 'email', value: p.personalEmail, rules: [SA.form.rules.email] }) : null,
      t2 ? F({ name: 'gov', label: 'المحافظة', type: 'select', options: GOVK.map((k) => [GOV[k], GOV[k]]), value: p.address.governorate }) : null, t2 ? F({ name: 'city', label: 'المدينة', value: p.address.city }) : null, t2 ? F({ name: 'street', label: 'العنوان', value: p.address.street, full: true }) : null,
      t2 ? F({ name: 'name', label: 'الاسم الكامل (حقل حساس)', value: e.name, required: true, hint: 'تغييره يحتاج اعتماد HR Manager ومرفقًا.', full: true }) : null, t2 ? F({ name: 'marital', label: 'الحالة الاجتماعية (حقل حساس)', type: 'select', options: Object.keys(MARITAL).map((k) => [k, MARITAL[k]]), value: p.marital }) : null,
      t2 ? F({ name: 'attach', label: 'المرفق (للتعديل الحساس)', placeholder: 'اسم الملف المرفق — مثال: شهادة-زواج.pdf' }) : null].filter(Boolean);
    formDialog({ title: 'تعديل بيانات ' + e.name, subtitle: 'الحقول العادية تُحفظ فورًا، والحساسة (الاسم · الحالة الاجتماعية) بطلب اعتماد.', icon: 'edit', fields: fl, submitLabel: 'حفظ',
      validate: (v) => { const sensitive = v.name !== e.name || (t2 && v.marital !== p.marital); return sensitive && !String(v.attach || '').trim() && !isMgr() ? 'المرفق إلزامي للتعديل الحساس (الاسم/الحالة الاجتماعية).' : null; },
      async onSubmit(v) {
        const direct = {}; const before = {}, after = {};
        if (v.phone !== e.phone) { before.phone = e.phone; after.phone = v.phone; direct.phone = v.phone; }
        const pf = {}; if (t2) { [['mobile', 'mobile'], ['email', 'personalEmail']].forEach((k) => { if (v[k[0]] !== p[k[1]]) { before[k[1]] = p[k[1]]; after[k[1]] = v[k[0]]; pf[k[1]] = v[k[0]]; } }); const ad = Object.assign({}, p.address, { governorate: v.gov, city: v.city, street: v.street }); if (JSON.stringify(ad) !== JSON.stringify(p.address)) { before.address = p.address.street; after.address = v.street; pf.address = ad; } }
        const sens = []; if (t2 && v.name.trim() !== e.name) sens.push(['name', v.name.trim(), 'تغيير الاسم إلى «' + v.name.trim() + '»']); if (t2 && v.marital !== p.marital) sens.push(['marital', v.marital, 'الحالة الاجتماعية: ' + MARITAL[p.marital] + ' ← ' + MARITAL[v.marital]]);
        if (!Object.keys(after).length && !sens.length) { SA.toast('لا توجد تغييرات للحفظ', 'info'); return false; }
        const r = await run(() => {
          if (Object.keys(after).length) { if (direct.phone) st.patch('employees', e.id, { phone: direct.phone }); if (Object.keys(pf).length) patchFile(e.id, (ff) => { Object.assign(ff.personal, pf); }); deliver('HR.EMPLOYEE.UPDATED', empTgt(e), { before, after, reason: 'تعديل بيانات غير حساسة' }); addEvent(e, { field: 'contact', label: 'تعديل بيانات الاتصال', old: null, new: Object.keys(after).join('، '), source: 'HR-06' }); }
          sens.forEach((s) => { if (isMgr()) { if (s[0] === 'name') { st.patch('employees', e.id, { name: s[1] }); } else patchFile(e.id, (ff) => { ff.personal.marital = s[1]; }); deliver('HR.EMPLOYEE.UPDATED', empTgt(e), { before: { [s[0]]: s[0] === 'name' ? e.name : p.marital }, after: { [s[0]]: s[1] }, reason: s[2] + ' (مرفق: ' + (v.attach || '—') + ')' }); addEvent(e, { field: s[0], label: s[2], old: null, new: s[1], source: 'HR-06', reason: v.attach }); } else requestProfileChange(e, s[0], { value: s[1] }, s[2], v.attach); });
        });
        if (!r.ok) return false; SA.toast(sens.length && !isMgr() ? 'تم حفظ التعديلات العادية وإرسال التعديل الحساس لاعتماد HR Manager (في صندوق الاعتمادات).' : 'تم حفظ بيانات ' + e.name, 'success', { ms: 5500 }); return true;
      } });
  }
  function docDialog(e, existing) {
    const blk = selfBlock(e); if (blk) { SA.toast(blk, 'error'); return; }
    let fileInput = h('input.input', { type: 'file', accept: '.pdf,.jpg,.jpeg,.png', 'aria-label': 'الملف' });
    const types = Object.keys(DOC_TYPES).filter((k) => k !== 'medical' || SA.can('hr.medical.view')).map((k) => [k, DOC_TYPES[k]]);
    const fl = [F({ name: 'type', label: 'نوع المستند', type: 'select', required: true, options: types, value: existing ? existing.type : 'other', disabled: !!existing }), F({ name: 'number', label: 'رقم المستند', value: existing ? existing.number : '' }),
      F({ name: 'issuedOn', label: 'تاريخ الإصدار', type: 'date', required: true, value: today(), rules: [dateRule] }), F({ name: 'expiresOn', label: 'تاريخ الانتهاء', type: 'date', rules: [dateRule] })];
    const extra = h('div.field', {}, h('span.label', {}, 'الملف (PDF · JPG · PNG)', h('span.req', {}, '*')), fileInput, h('div.help', {}, 'محاكاة رفع — يُحفظ الاسم فقط. الحد الأقصى للحجم {Open}.'));
    formDialog({ title: existing ? 'استبدال «' + existing.label + '» بنسخة جديدة' : 'رفع مستند', subtitle: e.name, icon: 'upload', fields: fl, extra, submitLabel: existing ? 'استبدال' : 'رفع',
      validate: (v) => { const t = v.type; if ((DOC_EXPIRY[t] || t === 'medical') && !v.expiresOn) return 'تاريخ الانتهاء إلزامي لهذا النوع من المستندات.'; if (v.expiresOn && v.expiresOn < v.issuedOn) return 'تاريخ الانتهاء لازم يكون بعد تاريخ الإصدار.'; const fi = fileInput.files && fileInput.files[0]; if (!fi) return 'اختر ملفًا للرفع.'; if (!/\.(pdf|jpe?g|png)$/i.test(fi.name)) return 'نوع الملف غير مسموح (PDF أو JPG أو PNG).'; if (fi.size > 5 * 1024 * 1024) return 'حجم الملف أكبر من الحد التجريبي (5MB).'; return null; },
      async onSubmit(v) {
        const fi = fileInput.files[0]; const r = await run(() => {
          patchFile(e.id, (ff) => { const cur = existing ? ff.docs.find((d) => d.id === existing.id) : ff.docs.find((d) => d.type === v.type && !d.deleted); if (cur) { cur.prev = (cur.prev || []).concat([{ ver: cur.ver, number: cur.number, expiresOn: cur.expiresOn, file: cur.file }]); cur.ver++; cur.number = v.number; cur.issuedOn = v.issuedOn; cur.expiresOn = v.expiresOn || null; cur.file = fi.name; } else ff.docs.push({ id: 'D' + Math.random().toString(36).slice(2, 6).toUpperCase(), type: v.type, label: DOC_TYPES[v.type], number: v.number, issuedOn: v.issuedOn, expiresOn: v.expiresOn || null, ver: 1, file: fi.name, deleted: false, art92: ['national_id', 'contract', 'photo', 'education', 'medical', 'military'].indexOf(v.type) >= 0, tier: v.type === 'medical' ? 'T4' : 'T2' }); });
          deliver(existing || file(e.id).docs.some((d) => d.type === v.type && d.ver > 1) ? 'HR.EMP.DOC_REPLACED' : 'HR.EMP.DOC_UPLOADED', empTgt(e), { after: { type: DOC_TYPES[v.type], file: fi.name, expiresOn: v.expiresOn || null } });
        }); if (!r.ok) return false; SA.toast('تم رفع المستند', 'success'); return true;
      } });
  }
  async function docDelete(e, d) {
    const r = await SA.confirm({ title: 'حذف ناعم: ' + d.label, danger: true, confirmLabel: 'حذف', reasonRequired: true, reasonLabel: 'سبب الحذف', impact: ['المستند يتحوّل لـ«محذوف» ويظل في الأرشيف ولا يُسترجع من الواجهة العادية.', 'يؤثر على اكتمال الملف إن كان من بنود م. 92.'] });
    if (!r.ok) return; const x = await run(() => { patchFile(e.id, (ff) => { const t = ff.docs.find((q) => q.id === d.id); if (t) { t.deleted = true; t.deletedReason = r.reason; } }); deliver('HR.EMP.DOC_DELETED', empTgt(e), { reason: r.reason, before: { doc: d.label } }); }); if (x.ok) SA.toast('تم الحذف الناعم', 'success');
  }
  function depDialog(e) {
    const fl = [F({ name: 'name', label: 'الاسم', required: true }), F({ name: 'relation', label: 'الصلة', type: 'select', required: true, options: [['زوج/ة', 'زوج/ة'], ['ابن/ة', 'ابن/ة'], ['أب', 'أب'], ['أم', 'أم']] }), F({ name: 'dob', label: 'تاريخ الميلاد', type: 'date', required: true, rules: [dateRule] }), F({ name: 'nid4', label: 'آخر 4 أرقام من الرقم القومي', rules: [(v) => (!v || /^\d{4}$/.test(v) ? null : '4 أرقام فقط')] }), F({ name: 'insured', label: 'مؤمَّن عليه', type: 'checkbox' }), F({ name: 'attach', label: 'المرفق (إلزامي)', required: !isMgr(), rules: isMgr() ? [] : [attachRule] })];
    formDialog({ title: 'إضافة معال', subtitle: e.name + ' — تعديل حساس: يحتاج HR Manager', icon: 'users', fields: fl, submitLabel: isMgr() ? 'إضافة' : 'إرسال للاعتماد', validate: (v) => (v.dob > today() ? 'تاريخ الميلاد في المستقبل.' : null),
      async onSubmit(v) { const dep = { id: 'DP' + Math.random().toString(36).slice(2, 5).toUpperCase(), name: v.name.trim(), relation: v.relation, dob: v.dob, nidLast4: v.nid4 || '----', insured: !!v.insured };
        const r = await run(() => { if (isMgr()) { patchFile(e.id, (ff) => ff.dependants.push(dep)); deliver('HR.EMPLOYEE.UPDATED', empTgt(e), { after: { dependant: dep.name }, reason: 'إضافة معال' }); } else requestProfileChange(e, 'dependant', { dep }, 'إضافة معال: ' + dep.name + ' (' + dep.relation + ')', v.attach); });
        if (r.ok) SA.toast(isMgr() ? 'تمت الإضافة' : 'أُرسل طلب إضافة المعال لاعتماد HR Manager', 'success'); return r.ok; } });
  }
  function emgDialog(e) {
    formDialog({ title: 'إضافة جهة اتصال للطوارئ', subtitle: e.name, icon: 'phone', fields: [F({ name: 'name', label: 'الاسم', required: true }), F({ name: 'relation', label: 'الصلة', required: true }), F({ name: 'phone', label: 'الهاتف', type: 'tel', required: true, rules: [phoneRule] }), F({ name: 'priority', label: 'الأولوية', type: 'number', value: 2, min: 1, max: 5, required: true })], submitLabel: 'إضافة',
      async onSubmit(v) { const r = await run(() => { patchFile(e.id, (ff) => ff.emergency.push({ id: 'EM' + Math.random().toString(36).slice(2, 5).toUpperCase(), name: v.name.trim(), relation: v.relation, phone: v.phone, priority: v.priority })); deliver('HR.EMPLOYEE.UPDATED', empTgt(e), { after: { emergencyContact: v.name }, reason: 'إضافة جهة طوارئ' }); }); if (r.ok) SA.toast('تمت الإضافة', 'success'); return r.ok; } });
  }
  function skillDialog(e) {
    formDialog({ title: 'إضافة مهارة / شهادة', subtitle: e.name, icon: 'star', fields: [F({ name: 'name', label: 'المهارة / الماكينة', required: true }), F({ name: 'level', label: 'المستوى (0–4)', type: 'number', min: 0, max: 4, value: 1, required: true, rules: [(v) => (v == null || (v >= 0 && v <= 4) ? null : 'من 0 إلى 4')] }), F({ name: 'cert', label: 'الشهادة' }), F({ name: 'exp', label: 'تاريخ الانتهاء', type: 'date', rules: [dateRule] })], submitLabel: 'إضافة',
      async onSubmit(v) { const r = await run(() => { patchFile(e.id, (ff) => ff.skills.push({ id: 'SK' + Math.random().toString(36).slice(2, 5).toUpperCase(), name: v.name.trim(), level: v.level, cert: v.cert, expiresOn: v.exp || null })); deliver('HR.EMPLOYEE.UPDATED', empTgt(e), { after: { skill: v.name }, reason: 'إضافة مهارة' }); }); if (r.ok) SA.toast('تمت الإضافة', 'success'); return r.ok; } });
  }
  /* bank change control */
  function bankDialog(e) {
    const blk = selfBlock(e); if (blk) { SA.toast(blk, 'error'); return; }
    formDialog({ title: 'طلب تغيير الحساب البنكي', subtitle: e.name + ' — ضوابط: معتمد ثانٍ + إشعار للموظف + تأخير ' + (S().bankDelayHours || 24) + ' ساعة', icon: 'coins', fields: [F({ name: 'bank', label: 'البنك الجديد', type: 'select', required: true, options: BANKS.map((b) => [b, b]) }), F({ name: 'acc', label: 'رقم الحساب الجديد', required: true, rules: [(v) => (/^\d{10,20}$/.test(String(v || '').replace(/\s/g, '')) ? null : 'رقم الحساب من 10 إلى 20 رقمًا')], hint: 'يُخزَّن مقنّعًا (آخر 4 أرقام فقط).' }), F({ name: 'holder', label: 'اسم صاحب الحساب', required: true, value: e.name, hint: 'لازم يطابق اسم الموظف.' , full: true }), F({ name: 'reason', label: 'سبب التغيير', type: 'textarea', required: true, full: true })], submitLabel: 'إرسال الطلب',
      validate: (v) => (normName(v.holder) !== normName(e.name) ? 'اسم صاحب الحساب لا يطابق اسم الموظف.' : null),
      async onSubmit(v) {
        const last4 = v.acc.replace(/\s/g, '').slice(-4); const r = await run(() => { patchFile(e.id, (ff) => { ff.bank.pending = { id: 'BK-' + Math.random().toString(36).slice(2, 5).toUpperCase(), newBank: v.bank, newLast4: last4, reason: v.reason, requestedBy: me().id, requestedAt: nowIso(), approvedBy: null, approvedAt: null, effectiveAt: null, status: 'awaiting_approval' }; });
          deliver('HR.EMP.BANK_CHANGE_REQUESTED', empTgt(e), { after: { bank: v.bank, last4 }, reason: v.reason });
          SA.notify({ title: 'طلب تغيير حساب بنكي: ' + e.name, body: 'بانتظار معتمد ثانٍ ثم تأخير ' + (S().bankDelayHours || 24) + ' ساعة.', level: 'action', to: ['R-11'], link: '#/hr/employees/' + e.id + '?tab=bank' });
          if (e.userId) SA.notify({ title: 'تم تقديم طلب لتغيير حساب صرف مرتبك', body: 'لو ما طلبتش ده بلّغ الموارد البشرية فورًا.', level: 'urgent', toUsers: [e.userId], link: '' }); });
        if (r.ok) SA.toast('أُرسل الطلب — ينتظر معتمدًا مختلفًا عنك', 'success'); return r.ok;
      } });
  }
  function bankPending(e, f) {
    const p = f.bank.pending; const due = p.effectiveAt ? new Date(p.effectiveAt) : null; const left = due ? Math.max(0, Math.ceil((due - Date.now()) / 3600000)) : null;
    const reqName = SA.userName(p.requestedBy);
    const sb = sodBlock(p.requestedBy, e);
    return h('div.sap-pp-stack', {}, h('ol.sap-pp-tl', {}, h('li.is-now', {}, h('time', {}, SA.fmt.date(p.requestedAt), h('br'), SA.fmt.time(p.requestedAt)), h('span.sap-pp-dot'), h('div.b', {}, h('b', {}, 'طلب تغيير الحساب'), h('p', {}, 'الطالب: ' + reqName + ' · ' + f.bank.bankName + ' ' + '•••• ' + f.bank.last4 + ' ← ' + p.newBank + ' •••• ' + p.newLast4))), h('li' + (p.approvedBy ? '' : '.is-future'), {}, h('time', {}, p.approvedAt ? SA.fmt.date(p.approvedAt) : '—'), h('span.sap-pp-dot'), h('div.b', {}, h('b', {}, p.approvedBy ? 'اعتمد: ' + SA.userName(p.approvedBy) : 'بانتظار المعتمد'), h('p', {}, 'المعتمد لازم يكون مختلفًا عن الطالب وعن الموظف'))), h('li.is-future', {}, h('time', {}, due ? SA.fmt.date(due) : '—'), h('span.sap-pp-dot'), h('div.b', {}, h('b', {}, 'سريان الحساب الجديد'), h('p', {}, p.status === 'delayed' ? 'متبقي ' + left + ' ساعة (تأخير ' + (S().bankDelayHours || 24) + ' ساعة)' : 'بعد الاعتماد + ' + (S().bankDelayHours || 24) + ' ساعة')))),
      h('div.sap-pp-pill-row', {}, p.status === 'awaiting_approval' ? [SA.btn({ label: 'اعتماد', icon: 'check', kind: 'primary', perm: 'hr.changes.approve', reason: permReason('hr.changes.approve') || sb, onClick: () => bankDecide(e, true) }), SA.btn({ label: 'رفض', icon: 'xcircle', kind: 'ghost', perm: 'hr.changes.approve', reason: permReason('hr.changes.approve') || sb, onClick: () => bankDecide(e, false) })] : [SA.btn({ label: 'محاكاة مرور التأخير (تجريبي)', icon: 'clock', kind: 'ghost', perm: 'hr.employees.edit', onClick: () => bankApply(e, true) })]),
      sb && p.status === 'awaiting_approval' ? SA.alert('warning', sb) : null);
  }
  async function bankDecide(e, ok) {
    const f = file(e.id), p = f.bank.pending; const sb = sodBlock(p.requestedBy, e); if (sb) { SA.toast(sb, 'error', { ms: 6500 }); deliver('HR.CHG.SOD_BLOCKED', empTgt(e), { result: 'denied', reason: sb }); return; }
    const r = await SA.confirm({ title: ok ? 'اعتماد تغيير الحساب' : 'رفض تغيير الحساب', danger: !ok, confirmLabel: ok ? 'اعتماد' : 'رفض', reasonRequired: !ok, impact: ok ? ['الحساب الجديد يسري بعد ' + (S().bankDelayHours || 24) + ' ساعة من الاعتماد (فصل مهام + تأخير).', 'سيُشعَر الموظف فورًا.'] : ['يُغلق الطلب ويبقى الحساب الحالي.'] });
    if (!r.ok) return; if (ok && !(await SA.stepUp('approval.decide'))) return;
    const x = await run(() => { if (ok) { patchFile(e.id, (ff) => { Object.assign(ff.bank.pending, { approvedBy: me().id, approvedAt: nowIso(), effectiveAt: new Date(Date.now() + (S().bankDelayHours || 24) * 3600000).toISOString(), status: 'delayed' }); }); deliver('HR.EMP.BANK_CHANGE_APPROVED', empTgt(e), { after: { newLast4: p.newLast4 }, reason: r.reason }); if (e.userId) SA.notify({ title: 'اعتماد تغيير حساب صرف مرتبك', body: 'يسري بعد ' + (S().bankDelayHours || 24) + ' ساعة. لو لم تطلبه بلّغ HR فورًا.', level: 'urgent', toUsers: [e.userId] }); } else { patchFile(e.id, (ff) => { ff.bank.pending = null; }); deliver('HR.EMP.BANK_CHANGE_REJECTED', empTgt(e), { reason: r.reason }); } });
    if (x.ok) SA.toast(ok ? 'تم الاعتماد — يسري بعد فترة التأخير' : 'تم الرفض', 'success');
  }
  function bankApply(e, simulated) {
    const f = file(e.id); const p = f.bank.pending; if (!p || p.status !== 'delayed') return false;
    patchFile(e.id, (ff) => { ff.bank.bankName = p.newBank; ff.bank.last4 = p.newLast4; ff.bank.pending = null; }); st.patch('employees', e.id, { bankLast4: p.newLast4 });
    addEvent(e, { field: 'bank', label: 'تغيير حساب الصرف', old: '•••• ' + f.bank.last4, new: '•••• ' + p.newLast4, tier: 'T2', source: 'HR-06', approver: p.approvedBy, reason: p.reason });
    SA.audit('HR.EMP.BANK_CHANGE_EFFECTIVE', { target: empTgt(e), after: { last4: p.newLast4 }, reason: simulated ? 'محاكاة مرور فترة التأخير (تجريبي)' : 'انتهاء فترة التأخير', actor: simulated ? undefined : sysActor() });
    if (e.userId) SA.notify({ title: 'سرى حساب الصرف الجديد', body: 'تم تحديث حساب صرف مرتبك.', level: 'info', toUsers: [e.userId] }); return true;
  }
  function bankTick() { col('empFiles').forEach((f) => { const p = f.bank && f.bank.pending; if (p && p.status === 'delayed' && p.effectiveAt && new Date(p.effectiveAt) <= Date.now()) { const e = emp(f.id); if (e) bankApply(e, false); } }); }
  /* insurance (tracked task — no integration claim) */
  async function insExport(e) {
    const f = file(e.id); const reveal = SA.can('hr.pii.reveal');
    const rows = [['الرقم الوظيفي', 'الاسم', 'الرقم القومي', 'تاريخ التعيين', 'الوظيفة', 'الأجر التأميني'], [e.empNo, e.name, reveal ? f.personal.nationalId : '•••••••••• ' + e.nationalIdLast4, e.hireDate, posTitle(e.positionId), canSal() ? 'غير مُعدّ {Open}' : 'سري']];
    download('insurance-pack-' + e.empNo + '.csv', rows);
    patchFile(e.id, (ff) => { ff.insurance.exportedAt = nowIso(); }); deliver('HR.ONB.INSURANCE_EXPORTED', empTgt(e), { after: { nationalId: reveal ? 'كامل' : 'مقنّع', wage: canSal() ? 'مصدّر' : 'سري' } });
    SA.toast(reveal ? 'تم تصدير حزمة التأمينات' : 'تم التصدير بالرقم القومي مقنّعًا (لا تملك hr.pii.reveal)', 'success', { ms: 5500 });
  }
  async function insSubmit(e) {
    const r = await SA.confirm({ title: 'تأكيد تقديم بيانات التأمينات يدويًا', confirmLabel: 'تم التقديم', impact: ['ينتقل التسجيل إلى «مُقدَّمة» — لا يوجد ربط آلي مع الهيئة.', 'بعدها سجّل الرقم التأميني عند وصول الإفادة.'] }); if (!r.ok) return;
    const x = await run(() => { patchFile(e.id, (ff) => { ff.insurance.status = 'submitted'; ff.insurance.submittedAt = nowIso(); }); deliver('HR.ONB.INSURANCE_EXPORTED', empTgt(e), { reason: 'تقديم يدوي للهيئة', after: { status: 'submitted' } }); }); if (x.ok) SA.toast('تم تسجيل التقديم', 'success');
  }
  function insConfirm(e) {
    formDialog({ title: 'تسجيل الرقم التأميني', subtitle: e.name, icon: 'shield', fields: [F({ name: 'no', label: 'الرقم التأميني / رقم الإفادة', required: true, rules: [SA.form.rules.min(5)], hint: 'صيغة الأرقام {Open} (D12) — يُتأكد منها من الهيئة.' })], submitLabel: 'تأكيد',
      async onSubmit(v) { const r = await run(() => { patchFile(e.id, (ff) => { ff.insurance.status = 'confirmed'; ff.insurance.insuranceNo = v.no.trim(); ff.insurance.confirmedAt = nowIso(); }); deliver('HR.ONB.INSURANCE_CONFIRMED', empTgt(e), { after: { status: 'confirmed' } }); }); if (r.ok) SA.toast('تم تأكيد التأمينات', 'success'); return r.ok; } });
  }
  /* completeness */
  async function ckMark(e, key) { const x = await run(() => { patchFile(e.id, (ff) => { ff.checklist[key] = { status: 'present', by: me().id, at: nowIso() }; }); deliver('HR.EMPLOYEE.UPDATED', empTgt(e), { after: { checklist: key }, reason: 'تسجيل بند اكتمال' }); }); if (x.ok) SA.toast('تم التسجيل', 'success'); }
  async function ckWaive(e, it) {
    const r = await SA.confirm({ title: 'إعفاء «' + it.label + '» من الاكتمال', confirmLabel: 'إعفاء', reasonRequired: true, reasonLabel: 'سبب الإعفاء', impact: ['البند يُحتسب «مُعفى» في مؤشر الاكتمال.', 'قرار HR Manager فقط (BR-EMP-10).'] }); if (!r.ok) return;
    const x = await run(() => { patchFile(e.id, (ff) => { ff.checklist[it.key] = { status: 'waived', reason: r.reason, by: me().id, at: nowIso() }; }); deliver('HR.EMP.COMPLETENESS_WAIVED', empTgt(e), { reason: r.reason, after: { item: it.label } }); }); if (x.ok) SA.toast('تم الإعفاء', 'success');
  }

  /* ───────── create employee (form · import · conversion) ───────── */
  const nextEmpNum = () => EMPS().reduce((m, e) => Math.max(m, parseInt(String(e.empNo).replace(/\D/g, ''), 10) || 0), 0) + 1;
  const nextEmpId = () => 'E-' + (EMPS().reduce((m, e) => Math.max(m, parseInt(e.id.slice(2), 10) || 0), 1000) + 1);
  function createEmployee(v, o) {
    o = o || {}; const id = nextEmpId(); const empNo = 'EMP-' + String(nextEmpNum()).padStart(4, '0'); const name = [v.first, v.father, v.grand, v.family].filter(Boolean).join(' ') || v.name; const chk = checkNid(v.nid);
    const rec = { id, empNo, name, userId: null, departmentId: v.deptId, positionId: v.positionId, managerEmpId: v.managerEmpId || null, status: o.status || 'probation', hireDate: v.hireDate, endDate: null, shift: v.shift || 'day', employmentType: v.etype || 'permanent', phone: v.phone || v.mobile || '', city: v.city || 'جمصة', nationalIdLast4: v.nid.slice(-4), bankLast4: '', salary: { basic: v.basic || 0, allowances: v.allowances || 0, demo: true, pending: !v.basic } , relatives: [] };
    st.insert('employees', rec);
    const f = { id, personal: { nationalId: v.nid, dob: chk.dob, gender: v.gender || chk.gender, marital: 'single', nationality: 'مصري', military: 'na', mobile: v.mobile || '', personalEmail: '', address: { governorate: chk.gov, city: v.city || '', street: '' }, nameEn: v.nameEn || null }, contract: { no: 'CTR-' + empNo.slice(4), type: v.etype === 'daily' ? 'يومية' : v.etype === 'contract' ? 'محدد المدة' : 'غير محدد المدة', start: v.hireDate, end: null, copies: { employer: false, worker: false, insurance: false, admin: false }, status: 'active' }, docs: [], dependants: [], emergency: [], bank: { type: 'bank', bankName: '', last4: '', holder: name, status: 'none', pending: null }, insurance: { status: 'pending', insuranceNo: null, exportedAt: null, submittedAt: null, confirmedAt: null }, skills: [], notes: { medical: [], discipline: [], legal: [] }, sizes: {}, checklist: {} };
    st.insert('empFiles', f);
    addEvent(rec, { field: 'hire', label: 'التعيين', old: null, new: posTitle(rec.positionId) + ' — ' + deptName(rec.departmentId), effectiveFrom: rec.hireDate, source: o.source || 'HR-06', reason: o.reason || 'تعيين جديد' });
    if (v.basic) addEvent(rec, { field: 'basic', label: 'المرتب الأساسي عند التعيين', old: null, new: v.basic, tier: 'T3', effectiveFrom: rec.hireDate, source: 'HR-06' });
    if (o.plan !== false) { const fam = isProdDept(rec.departmentId) ? 'prod' : 'office'; st.insert('onbPlans', newPlan(rec, fam, rec.hireDate), true); if (!o.noAudit) deliver('HR.ONB.CREATED', empTgt(rec), { after: { family: fam } }); }
    if (o.probation !== false) { st.insert('probations', newProbation(rec, rec.hireDate, v.probationDays || S().probationMaxDays || 90)); if (!o.noAudit) deliver('HR.PROB.STARTED', empTgt(rec), { after: { days: v.probationDays || S().probationMaxDays || 90 } }); }
    if (!o.noAudit) deliver('HR.EMPLOYEE.CREATED', empTgt(rec), { after: { empNo, department: deptName(rec.departmentId), via: o.source || 'نموذج' } });
    return rec;
  }
  function renderEmpForm(root, ctx) {
    ctx.setCrumbs([{ label: 'الموظفون' }, { label: 'الدليل', href: SA.href('hr/employees') }, { label: 'موظف جديد' }]);
    const den = SA.guard('hr.employees.create'); if (den) { root.append(den); return; }
    root.append(SA.pageHead({ title: 'موظف جديد', desc: 'يُنشئ ملفًا بحالة «تجربة» وقائمة تعيين وسجل تجربة — الرقم الوظيفي يتولّد تلقائيًا ولا يُعدَّل.', back: { href: SA.href('hr/employees'), label: 'الدليل' }, tags: [SA.tag('pending')] }));
    const mgrOpts = opt(empOpts((e) => e.status !== 'terminated'), 'بدون مدير');
    const ar = (v) => (!v || /^[؀-ۿ\s]+$/.test(v) ? null : 'استخدم حروفًا عربية');
    const prev = h('div'); const nidAlert = h('div');
    const fl = { first: F({ name: 'first', label: 'الاسم الأول', required: true, rules: [ar] }), father: F({ name: 'father', label: 'اسم الأب', required: true, rules: [ar] }), grand: F({ name: 'grand', label: 'اسم الجد', required: true, rules: [ar] }), family: F({ name: 'family', label: 'اسم العائلة', required: true, rules: [ar] }), nameEn: F({ name: 'nameEn', label: 'الاسم باللاتينية (للبنوك)', dir: 'ltr' }),
      nid: F({ name: 'nid', label: 'الرقم القومي (14 رقمًا)', required: true, hint: 'يُتحقق من الهيكل فقط (قرن + ميلاد + محافظة). خوارزمية الرقم الأخير {Open}.', rules: [(v) => { const c = checkNid(v); if (!c.ok) return c.msg; const dup = col('empFiles').find((f) => f.personal.nationalId === String(v).replace(/\s/g, '')); return dup ? 'الرقم القومي موجود بالفعل: ' + (emp(dup.id) || {}).empNo : null; }], onInput: () => nidCheck() }),
      gender: F({ name: 'gender', label: 'النوع', type: 'select', required: true, options: [['', 'اختر…'], ['M', 'ذكر'], ['F', 'أنثى']] }), mobile: F({ name: 'mobile', label: 'موبايل', type: 'tel', required: true, rules: [phoneRule] }),
      deptId: F({ name: 'deptId', label: 'القسم', type: 'select', required: true, options: opt(deptOpts(), 'اختر القسم…'), onChange: () => preview() }), positionId: F({ name: 'positionId', label: 'الوظيفة', type: 'select', required: true, options: opt(posOpts(), 'اختر الوظيفة…') }), managerEmpId: F({ name: 'managerEmpId', label: 'المدير المباشر', type: 'select', options: mgrOpts }),
      shift: F({ name: 'shift', label: 'الوردية', type: 'select', options: Object.keys(SHIFT).map((k) => [k, SHIFT[k]]), value: 'day' }), etype: F({ name: 'etype', label: 'نوع التوظيف', type: 'select', options: Object.keys(ETYPE).map((k) => [k, ETYPE[k]]), value: 'permanent' }), hireDate: F({ name: 'hireDate', label: 'تاريخ التعيين', type: 'date', required: true, value: today(), rules: [dateRule] }),
      probationDays: F({ name: 'probationDays', label: 'مدة التجربة (يوم)', type: 'number', required: true, value: Math.min(S().probationMaxDays || 90, 90), min: 1, max: S().probationMaxDays || 90, hint: 'الحد الأقصى ' + (S().probationMaxDays || 90) + ' يوم (م. 90 — Pending، إعداد قابل للتعديل). التجربة مرة واحدة.', rules: [(v) => (v > (S().probationMaxDays || 90) ? 'أكبر من الحد الأقصى المُعدّ (' + (S().probationMaxDays || 90) + ')' : v < 1 ? 'مدة غير صالحة' : null)] }) };
    if (canSal()) { fl.basic = F({ name: 'basic', label: 'المرتب الأساسي (T3)', type: 'number', min: 0, rules: [(v) => (v != null && v < 0 ? 'قيمة غير صالحة' : null)] }); fl.allowances = F({ name: 'allowances', label: 'البدلات (T3)', type: 'number', min: 0, value: 0 }); }
    const g = SA.form.group(Object.values(fl));
    function nidCheck() { SA.clear(nidAlert); const v = fl.nid.get().replace(/\s/g, ''); if (v.length < 14) return; const c = checkNid(v); if (!c.ok) return; const dup = col('empFiles').find((x) => x.personal.nationalId === v); nidAlert.append(dup ? SA.alert('danger', h('b', {}, 'تطابق تام بالرقم القومي: '), (emp(dup.id) || {}).name + ' (' + (emp(dup.id) || {}).empNo + ') — لا يمكن إنشاء سجل ثانٍ. ', h('a', { href: SA.href('hr/employees/' + dup.id) }, 'فتح الملف')) : SA.alert('success', 'هيكل الرقم صالح: ميلاد ' + SA.fmt.date(c.dob) + ' · ' + c.gov)); if (!dup && !fl.gender.get()) fl.gender.set(c.gender); }
    function preview() { SA.clear(prev); const d = fl.deptId.get(); prev.append(SA.kv([['الرقم الوظيفي', h('b.num', {}, 'EMP-' + String(nextEmpNum()).padStart(4, '0'))], ['الحالة عند الإنشاء', 'تجربة'], ['قائمة التعيين', d ? (isProdDept(d) ? 'خط إنتاج (بوابة سلامة + PPE)' : 'مكتبية') : 'حسب القسم'], ['سجل التجربة', 'يبدأ من تاريخ التعيين — مرة واحدة'], ['الإشعارات', 'HR Manager · المشرف · OHS لو إنتاج']])); }
    const submit = async () => {
      if (!g.validate()) return; const v = g.get(); const c = checkNid(v.nid); if (v.gender && c.gender !== v.gender) { SA.toast('النوع المختار لا يطابق الرقم القومي — راجع البيانات (اتساق).', 'warn', { ms: 6000 }); }
      if (v.basic != null && v.basic !== '' && canSal() && (v.basic + (v.allowances || 0)) < S().minWage) { fl.basic.error('الإجمالي أقل من الحد الأدنى للأجور المُعدّ (' + SA.fmt.money(S().minWage) + ')'); return; }
      if (v.hireDate > isoD(Date.now() + 30 * DAY)) { fl.hireDate.error('تاريخ التعيين بعيد جدًا'); return; }
      btn.disabled = true; let rec; const r = await run(() => { rec = createEmployee(Object.assign({}, v, { nid: v.nid.replace(/\s/g, '') })); });
      btn.disabled = false; if (!r.ok) return; SA.notify({ title: 'تعيين جديد: ' + rec.name, body: 'قائمة اليوم الأول وفترة التجربة بدأت.', level: 'action', to: ['R-11'].concat(isProdDept(rec.departmentId) ? ['R-15'] : []), toUsers: rec.managerEmpId && emp(rec.managerEmpId) && emp(rec.managerEmpId).userId ? [emp(rec.managerEmpId).userId] : [], link: '#/hr/employees/' + rec.id });
      SA.toast('تم إنشاء ' + rec.name + ' (' + rec.empNo + ')', 'success'); SA.nav('hr/employees/' + rec.id);
    };
    const btn = h('button.btn.btn-accent', { type: 'button', onclick: submit }, SA.icon('userplus', 'icon-sm'), 'إنشاء الموظف وبدء التعيين');
    root.append(h('div.sap-pp-grid2', {}, h('div.card.sap-card', {}, h('div.sap-card-body', {}, h('h3.sap-h2', {}, 'الهوية'), h('div.sap-formgrid', {}, fl.first.el, fl.father.el, fl.grand.el, fl.family.el, fl.nameEn.el), h('div.sap-formgrid', { style: { marginTop: '14px' } }, fl.nid.el, fl.gender.el, fl.mobile.el), nidAlert, h('h3.sap-h2', { style: { marginTop: '22px' } }, 'الوظيفة'), h('div.sap-formgrid', {}, fl.deptId.el, fl.positionId.el, fl.managerEmpId.el, fl.shift.el, fl.etype.el, fl.hireDate.el, fl.probationDays.el), h('h3.sap-h2', { style: { marginTop: '22px' } }, 'المرتب ', tierBadge('T3')), canSal() ? h('div.sap-formgrid', {}, fl.basic.el, fl.allowances.el) : SA.alert('info', 'المرتب T3 — لا تملك hr.salary.view، فيُحدَّد المرتب لاحقًا بطلب تغيير مرتب من مسؤول المرتبات (فصل مهام).')), h('div.sap-card-foot', { style: { display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '14px 18px' } }, h('a.btn.btn-ghost', { href: SA.href('hr/employees') }, 'إلغاء'), btn)),
      h('div.sap-pp-stack', {}, SA.card({ title: 'ما قبل الحفظ' }, prev), SA.card({ title: 'ضوابط' }, h('div.sap-pp-stack', {}, note('shield', 'لا إنشاء بنفس الرقم القومي (نشط أو أرشيف). إعادة التعيين تتم من الأرشيف ولا تفتح تجربة جديدة (BR-ONB-02).'), note('lock', 'HR لا يعدّل ملفه ولا ملف قريب له (BR-EMP-07).'), specLink('m-scr-emp-12', 'SCR-EMP-12 ↗'))))));
    preview(); return null;
  }

  /* ───────── bulk import (CSV) with validation report ───────── */
  const HDR = { name: ['الاسم', 'الاسم الكامل', 'name', 'full_name', 'fullname'], nid: ['الرقم القومي', 'الرقم القومى', 'national_id', 'nid'], dept: ['القسم', 'department', 'dept'], position: ['الوظيفة', 'المسمى', 'المسمى الوظيفي', 'position', 'job'], hire: ['تاريخ التعيين', 'hire_date', 'hire'], phone: ['الموبايل', 'الهاتف', 'التليفون', 'phone', 'mobile'], basic: ['المرتب الأساسي', 'المرتب', 'الأجر', 'basic', 'salary'] };
  const HDR_LABEL = { name: 'الاسم', nid: 'الرقم القومي', dept: 'القسم', position: 'الوظيفة', hire: 'تاريخ التعيين', phone: 'الموبايل', basic: 'المرتب الأساسي (T3)' };
  function parseCsv(text) {
    text = String(text || '').replace(/^﻿/, ''); const first = text.split(/\r?\n/)[0] || ''; const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === delim) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; cur = ''; } else cur += c; }
    row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row); return rows;
  }
  function validateImport(text) {
    const grid = parseCsv(text); if (grid.length < 2) return { error: 'الملف فاضي أو فيه صف العناوين فقط.' };
    const head = grid[0].map((x) => x.trim().toLowerCase()); const map = {}; const mapping = [];
    Object.keys(HDR).forEach((k) => { const i = head.findIndex((x) => HDR[k].some((s) => s.toLowerCase() === x)); if (i >= 0) { map[k] = i; mapping.push([grid[0][i], HDR_LABEL[k], 'تلقائي']); } });
    if (map.name == null || map.nid == null) return { error: 'العمودان «الاسم» و«الرقم القومي» إلزاميان في ملف الاستيراد.' };
    const existing = {}; col('empFiles').forEach((f) => { existing[f.personal.nationalId] = f.id; }); const seen = {}; const depts = col('departments'); const poss = col('positions'); const rows = [];
    grid.slice(1).forEach((r, i) => {
      const g = (k) => (map[k] == null ? '' : String(r[map[k]] || '').trim()); const issues = []; const n = i + 2; const nid = g('nid').replace(/\s/g, '');
      const data = { name: g('name'), nid, deptName: g('dept'), posName: g('position'), hire: g('hire'), phone: g('phone'), basic: g('basic') };
      if (!data.name || data.name.split(/\s+/).length < 2) issues.push({ kind: 'error', msg: 'الاسم لازم يكون ثنائيًا على الأقل' }); else if (data.name.split(/\s+/).length < 4) issues.push({ kind: 'warn', msg: 'الاسم أقل من رباعي (BR-EMP-18)' });
      const c = checkNid(nid); if (!c.ok) issues.push({ kind: 'error', msg: c.msg }); else if (existing[nid]) issues.push({ kind: 'error', msg: 'مكرر مع ' + (emp(existing[nid]) || {}).empNo + ' (' + (emp(existing[nid]) || {}).name + ')' }); else if (seen[nid]) issues.push({ kind: 'error', msg: 'مكرر داخل الملف مع الصف ' + seen[nid] }); else seen[nid] = n;
      const dep = data.deptName ? depts.find((d) => normName(d.name) === normName(data.deptName) || normName(d.name).indexOf(normName(data.deptName)) >= 0) : null; if (map.dept == null || !data.deptName) issues.push({ kind: 'error', msg: 'القسم مطلوب' }); else if (!dep) issues.push({ kind: 'error', msg: 'القسم «' + data.deptName + '» غير موجود' }); else data.deptId = dep.id;
      const pos = data.posName ? poss.find((p) => normName(p.title) === normName(data.posName) || normName(p.title).indexOf(normName(data.posName)) >= 0) : null; if (!data.posName) issues.push({ kind: 'error', msg: 'الوظيفة مطلوبة' }); else if (!pos) issues.push({ kind: 'error', msg: 'الوظيفة «' + data.posName + '» غير موجودة في الهيكل' }); else data.positionId = pos.id;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.hire) || isNaN(new Date(data.hire))) issues.push({ kind: 'error', msg: 'تاريخ التعيين غير صالح (YYYY-MM-DD)' }); else if (data.hire > today()) issues.push({ kind: 'warn', msg: 'تاريخ التعيين في المستقبل' });
      if (data.phone && phoneRule(data.phone)) issues.push({ kind: 'warn', msg: 'الموبايل غير صحيح — سيُترك فارغًا' }); else if (data.phone) data.phoneOk = true;
      if (data.basic !== '') { if (!canSal()) issues.push({ kind: 'warn', msg: 'عمود المرتب T3 — تجاهلناه (يحتاج hr.salary.view)' }); else if (isNaN(+data.basic)) issues.push({ kind: 'error', msg: 'المرتب غير رقمي' }); else if (+data.basic < S().minWage) issues.push({ kind: 'error', msg: 'أقل من الحد الأدنى للأجور المُعدّ (' + SA.fmt.money(S().minWage) + ')' }); else data.basicOk = +data.basic; }
      rows.push({ n, data, issues, status: issues.some((x) => x.kind === 'error') ? 'error' : issues.length ? 'warn' : 'valid' });
    });
    return { rows, mapping, map, hasSalary: map.basic != null && canSal() };
  }
  function sampleCsv() {
    const d1 = (col('departments').find((d) => isProdDept(d.id)) || {}).name || 'الإنتاج'; const mk = (y, m, d, gov, seq) => '2' + String(y).slice(2) + p2(m) + p2(d) + gov + String(seq).padStart(5, '0');
    const dup = (file('E-1005') || { personal: {} }).personal.nationalId || '29001010100011';
    const rows = [['الاسم', 'الرقم القومي', 'القسم', 'الوظيفة', 'تاريخ التعيين', 'الموبايل', 'المرتب الأساسي'],
      ['سامح عبد الغني محمود رشاد', mk(1991, 5, 14, '12', 40123), d1, 'فني تشغيل', today(), '01011112222', canSal() ? 8200 : ''], ['إيمان فتحي علي سالم', mk(1994, 9, 3, '01', 51234), d1, 'فني تشغيل', today(), '01122223333', canSal() ? 8000 : ''],
      ['خالد منصور', '2950101', d1, 'فني تشغيل', today(), '01033334444', ''], ['أحمد سعيد عوض حسن', dup, d1, 'فني تشغيل', today(), '01044445555', ''], ['هاني عادل مسعود نصر', mk(1990, 2, 20, '13', 61345), 'قسم غير موجود', 'فني تشغيل', today(), '01055556666', ''],
      ['وليد سمير جابر عطية', mk(1988, 11, 8, '14', 71456), d1, 'فني تشغيل', today(), '123', ''], ['وليد سمير جابر عطية', mk(1988, 11, 8, '14', 71456), d1, 'فني تشغيل', today(), '01077778888', '']];
    return SA.csv(rows);
  }
  function renderImport(root, ctx) {
    ctx.setCrumbs([{ label: 'الموظفون' }, { label: 'الدليل', href: SA.href('hr/employees') }, { label: 'استيراد جماعي' }]);
    const den = SA.guard('hr.employees.create'); if (den) { root.append(den); return; }
    root.append(SA.pageHead({ title: 'استيراد موظفين (CSV)', desc: 'رفع ← تقرير تحقق صفًا بصف ← اعتماد الدفعة. لا استبدال صامت، والدفعة قابلة للتراجع.', back: { href: SA.href('hr/employees'), label: 'الدليل' }, tags: [SA.tag('new')] }));
    const st0 = { step: 0, text: '', fileName: '', res: null, filter: 'all', done: null };
    const host = h('div'); root.append(host);
    const offB = st.subscribe('importBatches', () => { if (st0.step === 0 && host.isConnected) draw(); });
    function stepsEl() { return SA.stepper(['رفع الملف', 'تقرير التحقق', 'اعتماد الدفعة'], st0.step); }
    function draw() {
      SA.clear(host);
      if (st0.step === 0) host.append(h('div.card.sap-card', {}, h('div.sap-card-body', {}, stepsEl(), uploadStep())), batchesCard());
      else if (st0.step === 1) host.append(h('div.card.sap-card', {}, h('div.sap-card-body', {}, stepsEl(), reportStep())));
      else host.append(h('div.card.sap-card', {}, h('div.sap-card-body', {}, stepsEl(), doneStep())));
    }
    function uploadStep() {
      const ta = h('textarea.textarea', { rows: 6, 'aria-label': 'محتوى CSV', placeholder: 'ألصق محتوى CSV هنا أو اختر ملفًا…', style: { direction: 'ltr', textAlign: 'start', fontFamily: 'var(--font-en,monospace)' }, oninput: (e) => { st0.text = e.target.value; } }, st0.text);
      const fi = h('input', { type: 'file', accept: '.csv,.txt,text/csv', hidden: true, onchange: (e) => readFile(e.target.files[0]) });
      const dz = h('div.sap-pp-dz', { ondragover: (e) => { e.preventDefault(); dz.classList.add('is-over'); }, ondragleave: () => dz.classList.remove('is-over'), ondrop: (e) => { e.preventDefault(); dz.classList.remove('is-over'); readFile(e.dataTransfer.files[0]); } }, SA.icon('upload', 'icon-lg'), h('b', {}, 'اسحب ملف CSV هنا'), h('small.t-muted', {}, 'UTF-8 · الحد الأقصى للحجم {Open} · الأعمدة: الاسم، الرقم القومي، القسم، الوظيفة، تاريخ التعيين، الموبايل، المرتب الأساسي (اختياري T3)'), h('div.sap-pp-pill-row', {}, h('button.btn.btn-ghost', { type: 'button', onclick: () => fi.click() }, SA.icon('file', 'icon-sm'), 'اختيار ملف'), h('button.btn.btn-ghost', { type: 'button', onclick: () => { st0.text = sampleCsv(); st0.fileName = 'نموذج-تجريبي.csv'; ta.value = st0.text; SA.toast('تم تحميل بيانات تجريبية فيها أخطاء مقصودة', 'info'); } }, 'بيانات تجريبية'), h('button.btn.btn-ghost', { type: 'button', onclick: () => download('employees-import-template.csv', parseCsv(sampleCsv()).slice(0, 2)) }, SA.icon('download', 'icon-sm'), 'تنزيل ملف نموذجي')), fi);
      function readFile(f) { if (!f) return; if (!/\.(csv|txt)$/i.test(f.name)) { SA.toast('نوع الملف غير مدعوم — استخدم CSV.', 'error'); return; } if (f.size > 2 * 1024 * 1024) { SA.toast('الملف أكبر من الحد التجريبي (2MB).', 'error'); return; } const r = new FileReader(); r.onload = () => { st0.text = String(r.result); st0.fileName = f.name; ta.value = st0.text; SA.toast('تم تحميل ' + f.name, 'success'); }; r.readAsText(f, 'utf-8'); }
      return h('div.sap-pp-stack', { style: { marginTop: '16px' } }, dz, h('label.field', {}, h('span.label', {}, 'أو ألصق المحتوى'), ta), h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, SA.btn({ label: 'تحقق من الملف', icon: 'arrowleft', kind: 'primary', onClick: async () => { if (!st0.text.trim()) { SA.toast('اختر ملفًا أو ألصق محتوى أولًا', 'warn'); return; } const r = await run(() => validateImport(st0.text)); if (!r.ok) return; if (r.value.error) { SA.toast(r.value.error, 'error', { ms: 6500 }); return; } st0.res = r.value; st0.filter = 'all'; st0.step = 1; deliver('HR.EMP.IMPORT_STARTED', tgt('import', st0.fileName || 'ملف', st0.fileName || 'لصق'), { after: { rows: r.value.rows.length } }); draw(); } })));
    }
    function reportStep() {
      const res = st0.res, rows = res.rows; const ok = rows.filter((r) => r.status === 'valid').length, warn = rows.filter((r) => r.status === 'warn').length, err = rows.filter((r) => r.status === 'error').length; const good = rows.filter((r) => r.status !== 'error');
      const chips = h('div.sap-pp-pill-row', {}, [['all', 'الكل', rows.length], ['error', 'أخطاء', err], ['warn', 'تحذيرات', warn], ['valid', 'صالح', ok]].map((c) => h('button.sap-pill', { type: 'button', 'aria-pressed': String(st0.filter === c[0]), onclick: () => { st0.filter = c[0]; draw(); } }, c[1], h('b.num', {}, c[2]))));
      const shown = rows.filter((r) => st0.filter === 'all' || r.status === st0.filter);
      return h('div.sap-pp-stack', { style: { marginTop: '16px' } }, h('div.sap-pp-stats', {}, statBox('صفوف الملف', rows.length), statBox('صالح', ok, 'ok'), statBox('تحذير', warn, warn ? 'warn' : ''), statBox('أخطاء (تُستبعد)', err, err ? 'bad' : '')),
        h('details', {}, h('summary', { style: { cursor: 'pointer', fontWeight: 700, color: 'var(--eg-navy)' } }, 'مطابقة الأعمدة (' + res.mapping.length + ')'), h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['عمود الملف', 'حقل النظام', 'المطابقة'].map((t) => h('th', {}, t)))), h('tbody', {}, res.mapping.map((m) => h('tr', {}, h('td', {}, m[0]), h('td', {}, m[1]), h('td', {}, SA.chip(m[2], 'success')))))))),
        chips, h('div.table-wrap.sap-table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['صف', 'الحالة', 'الاسم', 'الرقم القومي', 'المشكلة'].map((t) => h('th', {}, t)))), h('tbody', {}, shown.map((r) => h('tr', {}, h('td.num', {}, r.n), h('td', {}, SA.chip({ valid: 'صالح', warn: 'تحذير', error: 'خطأ' }[r.status], { valid: 'success', warn: 'warning', error: 'danger' }[r.status])), h('td', {}, r.data.name), h('td', {}, maskNid(r.data.nid.slice(-4))), h('td', {}, r.issues.length ? r.issues.map((x) => h('div', { style: { color: x.kind === 'error' ? 'var(--color-danger)' : 'var(--color-warning)', fontSize: 'var(--text-caption)' } }, x.msg)) : h('span.t-muted', {}, '—'))))))),
        res.hasSalary ? SA.alert('warning', 'الملف فيه عمود مرتب (T3): الأرقام تُطبَّق فقط بعد موافقة ثانية من معتمد ≠ المستورد (BR-EMP-12). سيُنشأ طلب اعتماد.') : null,
        h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'space-between', flexWrap: 'wrap' } }, h('div.sap-pp-pill-row', {}, SA.btn({ label: 'رجوع', icon: 'arrowright', kind: 'ghost', onClick: () => { st0.step = 0; draw(); } }), SA.btn({ label: 'تقرير الأخطاء CSV', icon: 'download', kind: 'ghost', onClick: () => { download('import-report-' + today() + '.csv', [['صف', 'الحالة', 'الاسم', 'المشكلة']].concat(rows.filter((r) => r.issues.length).map((r) => [r.n, r.status, r.data.name, r.issues.map((x) => x.msg).join(' | ')]))); SA.toast('تم تنزيل تقرير التحقق (DOC-HR-P1)', 'success'); } })), SA.btn({ label: 'استيراد ' + good.length + ' صف', icon: 'check', kind: 'accent', perm: 'hr.employees.create', reason: good.length ? '' : 'لا يوجد صفوف صالحة', onClick: () => commit(good, res) })));
    }
    async function commit(good, res) {
      const r = await SA.confirm({ title: 'اعتماد دفعة الاستيراد', confirmLabel: 'استيراد ' + good.length, impact: [good.length + ' ملف موظف جديد بحالة «نشط» (مستورد من ملف قائم).', 'الصفوف ذات الأخطاء (' + (res.rows.length - good.length) + ') لن تُستورد.', 'الدفعة تتسجّل باسمك وتقبل التراجع (النافذة {Open}).'].concat(res.hasSalary ? ['أرقام المرتب تنتظر اعتماد معتمد ثانٍ.'] : []) });
      if (!r.ok) return; let batch;
      const x = await run(() => {
        const created = []; const pend = [];
        good.forEach((row) => { const d = row.data; const rec = createEmployee({ name: d.name, nid: d.nid, deptId: d.deptId, positionId: d.positionId, hireDate: d.hire, mobile: d.phoneOk ? d.phone : '', basic: 0 }, { status: 'active', plan: false, probation: false, source: 'استيراد', noAudit: true, reason: 'استيراد جماعي' }); created.push(rec.id); if (d.basicOk) pend.push({ empId: rec.id, basic: d.basicOk }); });
        batch = { id: nextSeq('importBatches', 'IMP', 3, false), file: st0.fileName || 'لصق', total: res.rows.length, created, skipped: res.rows.length - good.length, at: nowIso(), by: me().id, rolledBackAt: null, pendingSalaries: pend, salaryApprovalId: null };
        st.insert('importBatches', batch, true);
        if (pend.length) { const cr = { id: nextSeq('changeRequests', 'CHG', 4, true), type: 'import_salary', employeeId: created[0], requestedBy: me().id, status: 'in_approval', reason: 'اعتماد أعمدة المرتب لدفعة ' + batch.id, before: {}, after: { batchId: batch.id }, salary: null, effectiveFrom: today(), createdAt: nowIso(), approvalId: null, scId: null, letterId: null, retro: false }; st.insert('changeRequests', cr, true); const ap = SA.requestApproval({ type: 'job_change', title: 'اعتماد مرتبات دفعة استيراد ' + batch.id + ' (' + pend.length + ' موظف)', chain: [{ roleId: 'R-11', label: 'مدير الموارد البشرية' }], context: [['الدفعة', batch.id], ['الملف', batch.file], ['عدد الموظفين', String(pend.length)], ['الأرقام', 'سرية (T3) — hr.salary.view'], ['ملاحظة', 'المستورد ≠ المعتمد (BR-EMP-12)']], ref: { type: 'job_change', id: cr.id } }); st.patch('changeRequests', cr.id, { approvalId: ap.id }); st.patch('importBatches', batch.id, { salaryApprovalId: ap.id }); }
        deliver('HR.EMP.IMPORT_COMMITTED', tgt('import', batch.id, 'دفعة ' + batch.id + ' — ' + batch.file), { after: { created: created.length, skipped: batch.skipped, salaryPending: pend.length } });
      });
      if (!x.ok) return; SA.notify({ title: 'تم استيراد ' + batch.created.length + ' موظف', body: 'الدفعة ' + batch.id + ' بواسطة ' + me().name, level: 'info', to: ['R-11'], link: '#/hr/employees' }); st0.done = batch; st0.step = 2; draw();
    }
    function doneStep() { const b = st0.done; return h('div.sap-success', { style: { marginTop: '16px' } }, h('span.sap-state-ico.is-ok', {}, SA.icon('checkcircle', 'icon-lg')), h('h2', {}, 'تم استيراد ' + b.created.length + ' موظف'), h('p.t-muted', {}, 'الدفعة ' + b.id + ' · تخطّينا ' + b.skipped + ' صف' + (b.pendingSalaries.length ? ' · المرتبات بانتظار اعتماد ثانٍ في صندوق الاعتمادات' : '')), h('div.sap-pp-pill-row', { style: { justifyContent: 'center' } }, h('a.btn.btn-primary', { href: SA.href('hr/employees') }, 'فتح الدليل'), h('button.btn.btn-ghost', { type: 'button', onclick: () => { st0.step = 0; st0.text = ''; st0.res = null; draw(); } }, 'دفعة جديدة'))); }
    function batchesCard() {
      const list = col('importBatches'); if (!list.length) return null;
      return SA.card({ title: 'الدفعات السابقة', flush: true }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الدفعة', 'الملف', 'الموظفون', 'المنفّذ', 'الحالة', ''].map((t) => h('th', {}, t)))), h('tbody', {}, list.map((b) => h('tr', {}, h('td.num', {}, b.id), h('td', {}, b.file), h('td.num', {}, b.created.length), h('td', {}, SA.userName(b.by)), h('td', {}, b.rolledBackAt ? SA.chip('تم التراجع', 'neutral') : SA.chip('مُعتمدة', 'success')), h('td', {}, b.rolledBackAt ? null : SA.btn({ label: 'تراجع', icon: 'history', kind: 'ghost', size: 'sm', perm: 'hr.employees.create', onClick: () => rollback(b) }))))))));
    }
    async function rollback(b) {
      const linked = b.created.filter((id) => col('custodyIssues').some((i) => i.employeeId === id) || col('attendance').some((a) => a.employeeId === id) || col('leaveRequests').some((a) => a.employeeId === id) || col('loans').some((a) => a.employeeId === id));
      if (linked.length) { SA.toast('لا يمكن التراجع: ' + linked.length + ' موظف عليهم سجلات مرتبطة (عهدة/حضور/إجازات).', 'error', { ms: 6500 }); return; }
      const r = await SA.confirm({ title: 'التراجع عن الدفعة ' + b.id, danger: true, confirmLabel: 'تراجع', reasonRequired: true, impact: ['حذف ' + b.created.length + ' ملف موظف أُنشئ بهذه الدفعة (لم تُستخدم بعد).', 'الإجراء يتسجّل ولا يُمكن إعادته إلا باستيراد جديد.'] }); if (!r.ok) return;
      const x = await run(() => { st.update('employees', (l) => l.filter((e) => b.created.indexOf(e.id) < 0)); st.update('empFiles', (l) => l.filter((f) => b.created.indexOf(f.id) < 0)); st.update('empEvents', (l) => l.filter((v) => b.created.indexOf(v.employeeId) < 0)); st.patch('importBatches', b.id, { rolledBackAt: nowIso() }); deliver('HR.EMP.IMPORT_ROLLED_BACK', tgt('import', b.id, 'دفعة ' + b.id), { reason: r.reason, after: { removed: b.created.length } }); }); if (x.ok) SA.toast('تم التراجع عن الدفعة', 'success');
    }
    draw(); return () => offB();
  }

  /* ───────── duplicates + merge ───────── */
  function mergeBlock(a, b) {
    const open = col('payrollRuns').filter((r) => ['released', 'paid'].indexOf(r.status) < 0); if (!open.length) return '';
    const inRun = (e) => e.status !== 'terminated' && e.hireDate <= isoD(new Date(open[0].period + '-28'));
    return inRun(a) && inRun(b) ? 'فترة مرتبات مفتوحة (' + open[0].id + ') تشمل السجلين — الدمج محجوب (BR-EMP-13).' : '';
  }
  function renderDuplicates(root, ctx) {
    ctx.setCrumbs([{ label: 'الموظفون' }, { label: 'الدليل', href: SA.href('hr/employees') }, { label: 'كشف التكرار' }]);
    const den = SA.guard('hr.employees.edit'); if (den) { root.append(den); return; }
    root.append(SA.pageHead({ title: 'كشف التكرار والدمج', desc: 'تطابق بالرقم القومي (تام) أو اسم متقارب مع نفس الهاتف/الميلاد (محتمل). الدمج لـHR Manager فقط بسبب وStep-up.', back: { href: SA.href('hr/employees'), label: 'الدليل' }, tags: [SA.tag('new')] }));
    return loadGate(root, 'cards', (host) => {
      const head = subnav('duplicates'); const body = h('div.sap-pp-stack'); host.append(head, body);
      function draw() {
        const pairs = dupPairs(); SA.clear(body);
        pairs.forEach((p) => { if (!col('dupCases').some((c) => c.key === p.key)) { st.insert('dupCases', { id: nextSeq('dupCases', 'DUP', 3, false), key: p.key, a: p.a.id, b: p.b.id, match: p.match, decision: null, flaggedAt: nowIso() }); deliver('HR.EMP.DUPLICATE_FLAGGED', tgt('duplicate', p.key, p.a.name + ' ≈ ' + p.b.name), { actor: sysActor(), after: { match: p.match }, reason: p.why }); } });
        if (!pairs.length) { body.append(SA.card({}, SA.empty({ icon: 'checkcircle', title: 'لا اشتباه تكرار', text: 'لا توجد سجلات متطابقة بالرقم القومي أو متقاربة الاسم.' }))); return; }
        pairs.forEach((p) => { const fa = file(p.a.id), fb = file(p.b.id); const blk = mergeBlock(p.a, p.b); const row = (l, x, y) => h('tr', { class: x !== y ? 'is-changed' : '' }, h('td', {}, l), h('td', {}, x == null || x === '' ? '—' : x), h('td', {}, y == null || y === '' ? '—' : y));
          body.append(SA.card({ title: h('span', {}, p.a.name + ' ≈ ' + p.b.name), actions: [SA.chip(p.why, p.match === 'exact' ? 'danger' : 'warning')] }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الحقل'), h('th', {}, p.a.empNo), h('th', {}, p.b.empNo))), h('tbody', {}, row('الاسم', p.a.name, p.b.name), row('الرقم القومي', canT2() ? '•••••••••• ' + p.a.nationalIdLast4 : '', '•••••••••• ' + p.b.nationalIdLast4), row('القسم', deptName(p.a.departmentId), deptName(p.b.departmentId)), row('الهاتف', p.a.phone, p.b.phone), row('تاريخ التعيين', SA.fmt.date(p.a.hireDate), SA.fmt.date(p.b.hireDate)), row('الحالة', (EMP_ST[p.a.status] || [])[0], (EMP_ST[p.b.status] || [])[0]), row('تاريخ الميلاد', fa && SA.fmt.date(fa.personal.dob), fb && SA.fmt.date(fb.personal.dob))))),
            blk ? SA.alert('warning', blk) : null, h('div.sap-pp-pill-row', { style: { marginTop: '12px' } }, SA.btn({ label: 'دمج السجلين', icon: 'swap', kind: 'primary', perm: 'hr.changes.approve', reason: permReason('hr.changes.approve') || blk, onClick: () => mergeDialog(p) }), SA.btn({ label: 'ليس تكرارًا', icon: 'xcircle', kind: 'ghost', perm: 'hr.employees.edit', onClick: () => dismissDup(p) }))));
        });
      }
      draw(); const o = st.subscribe('employees', () => { if (host.isConnected) draw(); }); return o;
    });
  }
  async function dismissDup(p) {
    const r = await SA.confirm({ title: 'استبعاد اشتباه التكرار', confirmLabel: 'ليس تكرارًا', reasonRequired: true, impact: [p.a.name + ' و' + p.b.name + ' يبقيان سجلين منفصلين ولن يُشار إليهما كتكرار مرة أخرى.'] }); if (!r.ok) return;
    const x = await run(() => { const c = col('dupCases').find((q) => q.key === p.key); if (c) st.patch('dupCases', c.id, { decision: 'dismissed', by: me().id, reason: r.reason, at: nowIso() }); else st.insert('dupCases', { id: nextSeq('dupCases', 'DUP', 3, false), key: p.key, a: p.a.id, b: p.b.id, match: p.match, decision: 'dismissed', by: me().id, reason: r.reason, at: nowIso() }); deliver('HR.EMP.DUPLICATE_DISMISSED', tgt('duplicate', p.key, p.a.name + ' ≈ ' + p.b.name), { reason: r.reason }); }); if (x.ok) SA.toast('تم الاستبعاد', 'success');
  }
  function mergeDialog(p) {
    const older = p.a.empNo < p.b.empNo ? p.a : p.b; const fields = [['name', 'الاسم'], ['phone', 'الهاتف'], ['city', 'الموقع'], ['shift', 'الوردية'], ['departmentId', 'القسم']];
    const surv = F({ name: 'surv', label: 'السجل الناجي (يبقى رقمه الوظيفي)', type: 'radio', required: true, value: older.id, options: [[p.a.id, p.a.empNo + ' — ' + p.a.name], [p.b.id, p.b.empNo + ' — ' + p.b.name]], full: true });
    const choice = {}; const fl = fields.map((f) => { choice[f[0]] = F({ name: f[0], label: f[1], type: 'select', options: [['s', 'من الناجي'], ['o', 'من السجل المدموج']], value: 's' }); return choice[f[0]]; });
    const reason = F({ name: 'reason', label: 'سبب الدمج', type: 'textarea', required: true, full: true });
    formDialog({ title: 'دمج سجلين', subtitle: p.a.empNo + ' + ' + p.b.empNo, icon: 'swap', size: 'lg', fields: [surv].concat(fl, [reason]), submitLabel: 'دمج', kind: 'accent', intro: SA.alert('warning', 'السجل المدموج يتحوّل لـ tombstone ويحمل مرجع الناجي؛ كل السجلات التابعة (حضور، إجازات، عهدة، سجل) تُعاد ربطها. الرقم الوظيفي للمدموج لا يُعاد استخدامه.'),
      async onSubmit(v) {
        if (!(await SA.stepUp('policy.change', { force: true, title: 'تأكيد دمج سجلين', text: 'الدمج عملية حرجة (HR.EMP.MERGED). أعد التحقق للمتابعة.' }))) return false;
        const sid = v.surv, did = sid === p.a.id ? p.b.id : p.a.id; const S1 = emp(sid), D1 = emp(did);
        const r = await run(() => {
          ['attendance', 'leaveRequests', 'leaveBalances', 'loans', 'salaryChanges', 'settlements', 'custodyIssues', 'onbPlans', 'probations', 'changeRequests', 'empEvents', 'chargebacks'].forEach((c) => { if (st.get(c)) st.update(c, (l) => { l.forEach((x) => { if (x.employeeId === did) x.employeeId = sid; }); }); });
          st.update('employees', (l) => { const s = l.find((x) => x.id === sid), d = l.find((x) => x.id === did); l.forEach((x) => { if (x.managerEmpId === did) x.managerEmpId = sid; if (x.relatives) x.relatives = x.relatives.map((q) => (q === did ? sid : q)); }); fields.forEach((f) => { if (choice[f[0]].get() === 'o') s[f[0]] = d[f[0]]; }); d.status = 'terminated'; d.endDate = today(); d.mergedInto = sid; });
          patchFile(sid, (sf) => { const df = file(did); if (df) df.docs.forEach((q) => { if (!sf.docs.some((z) => z.type === q.type)) sf.docs.push(Object.assign({}, q, { id: 'M' + q.id })); }); }); st.update('empFiles', (l) => l.filter((f) => f.id !== did));
          const c = col('dupCases').find((q) => q.key === p.key); const rec = { decision: 'merged', survivor: sid, by: me().id, reason: v.reason, at: nowIso() }; if (c) st.patch('dupCases', c.id, rec); else st.insert('dupCases', Object.assign({ id: nextSeq('dupCases', 'DUP', 3, false), key: p.key, a: p.a.id, b: p.b.id, match: p.match }, rec));
          deliver('HR.EMP.MERGED', tgt('employee', sid, S1.name + ' ← ' + D1.empNo), { reason: v.reason, before: { merged: D1.empNo }, after: { survivor: S1.empNo } });
        });
        if (!r.ok) return false; SA.notify({ title: 'دمج سجلين: ' + S1.empNo + ' ← ' + D1.empNo, body: 'راجع أثر الدمج على المرتبات.', level: 'action', to: ['R-11', 'R-13'], link: '#/hr/employees/' + sid }); SA.toast('تم الدمج — الناجي ' + S1.empNo, 'success'); return true;
      } });
  }

  /* ───────── data quality ───────── */
  function renderQuality(root, ctx) {
    ctx.setCrumbs([{ label: 'الموظفون' }, { label: 'الدليل', href: SA.href('hr/employees') }, { label: 'جودة البيانات' }]);
    const den = SA.guard('hr.employees.edit'); if (den) { root.append(den); return; }
    root.append(SA.pageHead({ title: 'لوحة جودة البيانات', desc: 'مؤشر مرجّح: حقول مطلوبة + مستندات سارية + اتساق. الأوزان {Open} (DEMO 50/30/20).', back: { href: SA.href('hr/employees'), label: 'الدليل' }, tags: [SA.tag('open', 'الأوزان Open')] }));
    return loadGate(root, 'cards', (host) => {
      const list = visibleEmps().filter((e) => e.status !== 'terminated'); const qs = list.map((e) => ({ e, q: qualityOf(e), f: file(e.id) })); const avg = qs.length ? Math.round(qs.reduce((a, x) => a + x.q.index, 0) / qs.length) : 0;
      const issues = [['مقاس PPE غير مسجّل', (x) => isProdEmp(x.e) && ['P-07', 'P-08', 'P-09', 'P-10'].indexOf(x.e.positionId) >= 0 && !(x.f.sizes && x.f.sizes.shoe), 'job'], ['شهادة لياقة طبية منتهية', (x) => liveDocs(x.f).some((d) => d.type === 'medical' && docState(d).k === 'expired'), 'documents'], ['مستند ينتهي خلال 30 يومًا', (x) => expiringDocs(x.f, 30).some((d) => docState(d).k !== 'expired'), 'documents'], ['لا جهة اتصال طوارئ', (x) => !x.f.emergency.length, 'family'], ['نسخ العقد غير مكتملة', (x) => Object.keys(x.f.contract.copies).some((k) => !x.f.contract.copies[k]), 'job'], ['التأمينات معلّقة', (x) => x.f.insurance.status === 'pending', 'insurance'], ['حساب بنكي غير مسجّل', (x) => !x.f.bank.last4, 'bank'], ['المرتب غير محدد', (x) => x.e.salary && x.e.salary.pending, 'salary']];
      const depts = {}; qs.forEach((x) => { (depts[x.e.departmentId] = depts[x.e.departmentId] || []).push(x.q.index); });
      host.append(subnav('quality'), h('div.sap-grid-cards', { style: { marginBottom: '14px' } }, SA.kpi('متوسط مؤشر الجودة', avg + '%', { sub: qs.length + ' ملف في نطاقك' }), SA.kpi('ملفات تحت 70%', qs.filter((x) => x.q.index < 70).length, {}), SA.kpi('ملفات 100% اكتمال', list.filter((e) => checklistOf(e).pct === 100).length, {})),
        h('div.sap-pp-grid2', {}, SA.card({ title: 'حسب القسم' }, h('div.sap-pp-stack', {}, Object.keys(depts).map((d) => { const a = Math.round(depts[d].reduce((s, v) => s + v, 0) / depts[d].length); return h('div', {}, h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-dense)' } }, h('span', {}, deptName(d) + ' (' + depts[d].length + ')'), h('b.num', {}, a + '%')), meter(a, a >= 85 ? 'ok' : a >= 70 ? 'warn' : 'bad')); }))),
          SA.card({ title: 'أكثر المشاكل تكرارًا' }, h('div.sap-pp-stack', {}, issues.map((is) => { const hit = qs.filter(is[1]); return h('details', {}, h('summary', { style: { cursor: 'pointer', display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center' } }, h('span', {}, is[0]), SA.chip(hit.length + ' ملف', hit.length ? 'warning' : 'success')), hit.length ? h('div', { style: { padding: '8px 4px', display: 'flex', gap: '6px 12px', flexWrap: 'wrap' } }, hit.slice(0, 20).map((x) => h('a.sap-linkbtn', { href: '#/hr/employees/' + x.e.id + '?tab=' + is[2] }, x.e.name))) : null); })))));
      return null;
    });
  }

  /* ═════════════════════════ HR-05 · التعيين والتجربة ═════════════════════════ */
  const planOf = (empId) => col('onbPlans').find((p) => p.employeeId === empId) || null;
  const probOf = (empId) => col('probations').find((p) => p.employeeId === empId) || null;
  const LINE_ST = { issued: ['مصروف', 'info'], returned: ['مُسترجع', 'success'], replaced: ['مُستبدل', 'success'], lost: ['مفقود', 'danger'], damaged: ['تالف', 'warning'], written_off: ['مشطوب', 'neutral'] };
  const itemOf = (id) => col('custodyItems').find((x) => x.id === id) || { id, name: id, category: 'tool' };
  function ppeRequired(empId) { const e = emp(empId); if (!e) return []; return col('custodyMatrix').filter((m) => m.positionId === e.positionId && m.requiredForAccess); }
  function ppeDone(empId) { const need = ppeRequired(empId); if (!need.length) return true; const has = new Set(); col('custodyIssues').filter((i) => i.employeeId === empId).forEach((i) => i.lines.forEach((l) => { if (['issued', 'replaced'].indexOf(l.status) >= 0) has.add(l.itemId); })); return need.every((m) => has.has(m.itemId)); }
  function custodyOpenOf(empId) { const out = []; col('custodyIssues').filter((i) => i.employeeId === empId).forEach((i) => i.lines.forEach((l) => { const it = itemOf(l.itemId); const cb = col('chargebacks').find((c) => c.lineId === l.id); if ((l.status === 'issued' && it.returnable) || (['lost', 'damaged'].indexOf(l.status) >= 0 && (!cb || ['pending_approval', 'proposed', 'reported'].indexOf(cb.status) >= 0))) out.push({ slip: i, line: l, item: it }); })); return out; }
  function gateOf(empId) {
    const e = emp(empId); if (!e) return { open: false, reason: 'موظف غير موجود' }; if (!isProdEmp(e)) return { open: true, na: true, reason: '' };
    const pl = planOf(empId); if (!pl) return { open: true, legacy: true, reason: '' };
    if (pl.induction.status !== 'done') return { open: false, reason: 'توعية السلامة لم تُسجَّل بعد (BR-ONB-01)' };
    return { open: true, reason: '' };
  }
  function taskState(plan, t) {
    const f = file(plan.employeeId); let done = t.status === 'done'; const blocked = t.status === 'blocked';
    if (t.kind === 'contract') done = !!(f && Object.keys(f.contract.copies).every((k) => f.contract.copies[k])) || !!plan.contractWaiver;
    else if (t.kind === 'insurance') done = !!(f && f.insurance.status !== 'pending'); else if (t.kind === 'induction') done = plan.induction.status === 'done'; else if (t.kind === 'ppe') done = ppeDone(plan.employeeId); else if (t.kind === 'buddy') done = !!plan.buddy.buddyEmpId; else if (t.kind === 'signoff') done = !!plan.signoff;
    const dueDate = addDays(plan.startDate, t.dueOffset); return { done, blocked: blocked && !done, overdue: !done && dueDate < today(), dueDate };
  }
  function planInfo(plan) {
    const tasks = plan.tasks.map((t) => Object.assign({ t }, taskState(plan, t))); const blockers = tasks.filter((x) => !x.done && ((x.t.required && x.overdue) || x.blocked));
    const doneN = tasks.filter((x) => x.done).length; const status = doneN === tasks.length ? 'complete' : blockers.length ? 'overdue' : doneN > 0 ? 'in_progress' : 'not_started';
    return { tasks, blockers, doneN, total: tasks.length, pct: Math.round(doneN / tasks.length * 100), status };
  }
  const PLAN_ST = { not_started: ['لم تبدأ', 'neutral'], in_progress: ['جارية', 'info'], overdue: ['متأخرة — عائق', 'danger'], complete: ['مكتملة', 'success'] };
  function probInfo(pb) {
    const total = pb.initialDays + pb.extendedDays; const end = addDays(pb.startDate, total); const elapsed = daysBetween(pb.startDate, today()); const daysLeft = daysBetween(today(), end); const max = S().probationMaxDays || 90;
    const cps = (S().checkpoints || [30, 60, 80]).filter((d) => d < total); const reviewDue = cps.find((d) => elapsed >= d && !pb.reviews.some((r) => r.day === d)) || null; const rem = S().probationReminderDays || 7;
    let state = pb.status; if (pb.status === 'running' || pb.status === 'extended') state = daysLeft < 0 ? 'overdue' : daysLeft <= rem ? 'decision_due' : reviewDue ? 'review_due' : pb.extensionUsed ? 'extended' : 'running';
    return { total, end, elapsed, daysLeft, cps, reviewDue, state, maxAdd: pb.extensionUsed ? 0 : Math.max(0, max - total), max };
  }
  const PROB_ST = { running: ['جارية', 'info'], review_due: ['مراجعة مستحقة', 'warning'], decision_due: ['قرار مستحق', 'warning'], overdue: ['تجاوز موعد القرار', 'danger'], extended: ['ممدّدة', 'info'], confirmed: ['مُثبَّت', 'success'], termination_referred: ['محال للإنهاء', 'danger'] };
  function probTick() {
    if (!ensure()) return; const rem = S().probationReminderDays || 7;
    col('probations').forEach((pb) => { if (['confirmed', 'termination_referred'].indexOf(pb.status) >= 0) return; const e = emp(pb.employeeId); if (!e) return; const i = probInfo(pb); const sup = e.managerEmpId && emp(e.managerEmpId) ? emp(e.managerEmpId).userId : null; const sent = pb.remindersSent || [];
      if (i.daysLeft >= 0 && i.daysLeft <= rem && sent.indexOf('N-13') < 0) { st.patch('probations', pb.id, { remindersSent: sent.concat(['N-13']) }); SA.notify({ title: 'قرار التجربة مستحق: ' + e.name, body: 'متبقي ' + i.daysLeft + ' يوم على نهاية التجربة — لا قرار تلقائي.', level: 'action', to: ['R-11'], toUsers: sup ? [sup] : [], link: '#/hr/onboarding/probation/' + e.id }); }
      if (i.daysLeft < 0 && sent.indexOf('N-14') < 0) { st.patch('probations', pb.id, { remindersSent: sent.concat(['N-14']) }); SA.notify({ title: 'تجاوز موعد قرار التجربة: ' + e.name, body: 'انتهت المدة دون قرار مسجّل.', level: 'urgent', to: ['R-11', 'R-02'], link: '#/hr/onboarding/probation/' + e.id }); SA.audit('HR.PROB.DECISION_OVERDUE', { target: empTgt(e), actor: sysActor(), reason: 'انتهت مدة التجربة دون قرار' }); } });
  }
  const sigPad = () => {
    const c = h('canvas', { width: 480, height: 130, 'aria-label': 'لوحة التوقيع', role: 'img' }); const ph = h('div.sap-pp-sigph', {}, 'وقّع هنا بالماوس أو اللمس'); const box = h('div.sap-pp-sig', {}, c, ph); let drawing = false, dirty = false; const ctx2 = c.getContext('2d'); ctx2.lineWidth = 2.2; ctx2.lineCap = 'round'; ctx2.strokeStyle = '#012864';
    const pos = (ev) => { const r = c.getBoundingClientRect(); return [(ev.clientX - r.left) * c.width / r.width, (ev.clientY - r.top) * c.height / r.height]; };
    c.addEventListener('pointerdown', (ev) => { drawing = true; dirty = true; ph.hidden = true; const p = pos(ev); ctx2.beginPath(); ctx2.moveTo(p[0], p[1]); c.setPointerCapture && c.setPointerCapture(ev.pointerId); });
    c.addEventListener('pointermove', (ev) => { if (!drawing) return; const p = pos(ev); ctx2.lineTo(p[0], p[1]); ctx2.stroke(); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => c.addEventListener(t, () => { drawing = false; }));
    return { el: h('div', {}, box, h('button.sap-linkbtn', { type: 'button', style: { marginTop: '6px' }, onclick: () => { ctx2.clearRect(0, 0, c.width, c.height); dirty = false; ph.hidden = false; } }, 'مسح التوقيع')), isEmpty: () => !dirty };
  };
  const stepOr = async (key) => SA.stepUp(key);
  /* shared settings dialog (probation · bank · reveal · custody caps · docs) */
  function peopleSettingsDialog() {
    const s = S(); const num2 = (name, label, hint, o) => F(Object.assign({ name, label, type: 'number', required: true, value: s[name], hint: (hint || '') + ' — Pending [Law]/قابل للتعديل', min: 0 }, o || {}));
    const fl = [num2('probationMaxDays', 'الحد الأقصى للتجربة (يوم)', 'م. 90 — {3 أشهر}', { min: 1 }), num2('probationReminderDays', 'تذكير قرار التجربة قبل (يوم)', 'N-13', { min: 1 }), F({ name: 'checkpoints', label: 'نقاط التفتيش (أيام)', required: true, value: (s.checkpoints || []).join(','), hint: 'أرقام مفصولة بفواصل، مثال: 30,60,80' }),
      num2('chargebackCapDays', 'سقف الخصم الشهري (أيام من الأساسي)', 'م. 151'), num2('chargebackCapMonths', 'إجمالي الشهور لسقف الخصم', 'م. 151'), num2('minWage', 'الحد الأدنى للأجور (ج.م)', 'HR-30'), num2('bankDelayHours', 'تأخير سريان الحساب البنكي (ساعة)', 'BR-EMP-06'), num2('revealSeconds', 'مدة ظهور «إظهار» (ثانية)', 'BR-EMP-03'), num2('dueReminderDays', 'تذكير استحقاق الاستبدال (يوم)', 'BR-CST-06'), num2('depreciationPct', 'نسبة الإهلاك الافتراضية (%)', 'BR-CST-05 {Open}', { min: 0, max: 100 }),
      F({ name: 'reason', label: 'سبب التعديل', type: 'textarea', required: true, full: true })];
    formDialog({ title: 'إعدادات التعيين والتجربة والعهدة', subtitle: 'قيم قانونية Pending — تُقرأ من الإعدادات وليست ثوابت.', icon: 'settings', size: 'lg', fields: fl, submitLabel: 'حفظ الإعدادات',
      validate: (v) => { const cp = String(v.checkpoints).split(',').map((x) => +x.trim()); if (cp.some((x) => !x || x < 1)) return 'نقاط التفتيش غير صالحة.'; if (v.probationReminderDays >= v.probationMaxDays) return 'التذكير لازم يكون أقل من الحد الأقصى.'; return null; },
      async onSubmit(v) { if (!(await SA.stepUp('policy.change'))) return false; const before = {}, after = {}; const nv = Object.assign({}, v, { checkpoints: String(v.checkpoints).split(',').map((x) => +x.trim()) }); delete nv.reason; Object.keys(nv).forEach((k) => { if (JSON.stringify(nv[k]) !== JSON.stringify(s[k])) { before[k] = s[k]; after[k] = nv[k]; } });
        const r = await run(() => { st.update('settings', (x) => { Object.assign(x.hrPeople, nv); }); deliver('HR.SETTINGS.PEOPLE_CHANGED', tgt('settings', 'hrPeople', 'إعدادات التعيين والعهدة'), { before, after, reason: v.reason }); }); if (r.ok) SA.toast('تم حفظ الإعدادات', 'success'); return r.ok; } });
  }

  function renderOnboarding(root, ctx) {
    ensure(); probTick();
    const a = ctx.path[0];
    if (a && a !== 'probation' && a !== 'templates') return renderPlan(root, ctx, a);
    ctx.setCrumbs([{ label: 'الموظفون' }, { label: 'التعيين والتجربة' }]);
    let tab = a === 'probation' ? 'probation' : a === 'templates' ? 'templates' : ctx.params.tab || 'plans'; let drawerRef = null; let leaving = false;
    root.append(SA.pageHead({ title: 'التعيين الأول والتجربة', desc: 'قائمة اليوم الأول موزّعة على أصحابها، بوابة سلامة قبل الماكينات، وتجربة مرة واحدة بقرار مسجّل — بدون قرار تلقائي.', tags: [SA.tag('new'), SA.tag('pending', 'Law · Pending')], actions: [SA.btn({ label: 'الإعدادات', icon: 'settings', kind: 'ghost', perm: 'hr.settings.edit', onClick: peopleSettingsDialog }), SA.btn({ label: 'موظف جديد', icon: 'userplus', kind: 'accent', perm: 'hr.employees.create', onClick: () => SA.nav('hr/employees/new') })] }));
    return loadGate(root, 'table', (host) => {
      const plansAll = () => col('onbPlans').filter((p) => canSee(p.employeeId)); const probsAll = () => col('probations').filter((p) => canSee(p.employeeId));
      const tabs = SA.tabs({ label: 'أقسام التعيين', active: tab, tabs: [{ id: 'plans', label: 'التعيينات الجديدة', badge: plansAll().filter((p) => planInfo(p).status !== 'complete').length || null }, { id: 'probation', label: 'فترة التجربة', badge: probsAll().filter((p) => ['confirmed', 'termination_referred'].indexOf(p.status) < 0).length || null }, { id: 'templates', label: 'القوالب' }], onChange: (id) => { tab = id; history.replaceState(null, '', '#/hr/onboarding' + (id === 'plans' ? '' : '/' + id)); drawBody(); } });
      const body = h('div'); host.append(h('div.sap-pp-tabs-wrap', {}, tabs.el), body);
      function drawBody() { SA.clear(body); (tab === 'probation' ? probTab : tab === 'templates' ? tplTab : plansTab)(body); }
      function plansTab(box) {
        const list = plansAll(); const infos = list.map((p) => [p, planInfo(p)]);
        box.append(h('div.sap-grid-cards', { style: { marginBottom: '14px' } }, SA.kpi('قوائم جارية', infos.filter((x) => x[1].status !== 'complete').length), SA.kpi('متأخرة (عوائق)', infos.filter((x) => x[1].status === 'overdue').length, { sub: 'مهام إلزامية متأخرة أو محجوبة' }), SA.kpi('بوابات ماكينات مقفولة', infos.filter((x) => !gateOf(x[0].employeeId).open).length, { sub: 'بدون توعية سلامة' }), SA.kpi('مكتملة', infos.filter((x) => x[1].status === 'complete').length)));
        const table = SA.table({ rowId: 'id', pageSize: 10, caption: 'قوائم التعيين', rows: () => plansAll().slice().sort((x, y) => y.startDate.localeCompare(x.startDate)), search: { placeholder: 'بحث باسم الموظف…', keys: (p, q) => (emp(p.employeeId) || { name: '' }).name.indexOf(q) >= 0 },
          filters: [{ key: 'status', label: 'الحالة', options: Object.keys(PLAN_ST).map((k) => [k, PLAN_ST[k][0]]), test: (p, v) => planInfo(p).status === v }],
          columns: [{ key: 'employeeId', label: 'الموظف', render: (p) => { const e = emp(p.employeeId); return e ? empCell(e) : p.employeeId; } }, { key: 'startDate', label: 'تاريخ البدء', sort: true, render: (p) => h('span.num', {}, SA.fmt.date(p.startDate)) }, { key: 'status', label: 'الحالة', render: (p) => stChip(PLAN_ST, planInfo(p).status) }, { key: 'pct', label: 'التقدّم', render: (p) => { const i = planInfo(p); return h('div', { style: { minWidth: '130px' } }, h('small.num', {}, i.doneN + ' / ' + i.total), meter(i.pct, i.status === 'overdue' ? 'bad' : i.pct === 100 ? 'ok' : '')); } }, { key: 'blk', label: 'العوائق', render: (p) => { const n = planInfo(p).blockers.length; return n ? SA.chip(n + ' عائق', 'danger') : h('span.t-muted', {}, '—'); } }, { key: 'gate', label: 'بوابة الماكينات', render: (p) => { const g = gateOf(p.employeeId); return g.na ? h('span.t-muted', {}, 'لا تنطبق') : g.open ? SA.chip('مفتوحة', 'success') : SA.chip('مقفولة', 'danger'); } }],
          onRowClick: (p) => SA.nav('hr/onboarding/' + p.id), empty: { icon: 'check', title: 'لا توجد قوائم تعيين', text: 'تُنشأ قائمة تلقائيًا عند تعيين موظف جديد.', action: { label: 'موظف جديد', icon: 'userplus', perm: 'hr.employees.create', onClick: () => SA.nav('hr/employees/new') } } });
        box.append(h('div.card.card-flush.sap-listcard', {}, table.el));
      }
      function probTab(box) {
        const list = probsAll(); const infos = list.map((p) => [p, probInfo(p)]); const open = infos.filter((x) => ['confirmed', 'termination_referred'].indexOf(x[0].status) < 0);
        box.append(h('div.sap-grid-cards', { style: { marginBottom: '14px' } }, SA.kpi('تجارب جارية', open.length), SA.kpi('قرار مستحق / متأخر', open.filter((x) => ['decision_due', 'overdue'].indexOf(x[1].state) >= 0).length, { sub: 'تذكير قبل ' + (S().probationReminderDays || 7) + ' أيام' }), SA.kpi('مراجعات مستحقة', open.filter((x) => x[1].reviewDue).length), SA.kpi('تمديد مستخدم', infos.filter((x) => x[0].extensionUsed).length, { sub: 'مرة واحدة فقط' })),
          SA.alert('info', 'التجربة مرة واحدة وبحد أقصى ', SA.demoValue(S().probationMaxDays + ' يوم'), ' [Law Art. 90 · Pending] — إعداد قابل للتعديل. الإنهاء أثناء التجربة يتحوّل لطلب في الاستقالات والإنهاء.'));
        const table = SA.table({ rowId: 'id', pageSize: 10, caption: 'فترة التجربة', rows: () => probsAll(), filters: [{ key: 'state', label: 'الحالة', options: Object.keys(PROB_ST).map((k) => [k, PROB_ST[k][0]]), test: (p, v) => probInfo(p).state === v }],
          columns: [{ key: 'employeeId', label: 'الموظف', render: (p) => { const e = emp(p.employeeId); return e ? empCell(e) : p.employeeId; } }, { key: 'startDate', label: 'البداية', sort: true, render: (p) => h('span.num', {}, SA.fmt.date(p.startDate)) }, { key: 'days', label: 'المدة', render: (p) => { const i = probInfo(p); return h('span.num', {}, p.initialDays + (p.extendedDays ? ' + ' + p.extendedDays : '') + ' يوم'); } }, { key: 'end', label: 'النهاية', render: (p) => h('span.num', {}, SA.fmt.date(probInfo(p).end)) }, { key: 'left', label: 'المتبقي', sort: (x, y) => probInfo(x).daysLeft - probInfo(y).daysLeft, render: (p) => { if (['confirmed', 'termination_referred'].indexOf(p.status) >= 0) return '—'; const d = probInfo(p).daysLeft; return h('b.num', { style: { color: d < 0 ? 'var(--color-danger)' : d <= 7 ? 'var(--color-warning)' : 'inherit' } }, d < 0 ? 'منتهية منذ ' + (-d) : d + ' يوم'); } }, { key: 'rev', label: 'التقييمات', render: (p) => h('span.num', {}, p.reviews.length + ' / ' + probInfo(p).cps.length) }, { key: 'state', label: 'الحالة', render: (p) => stChip(PROB_ST, probInfo(p).state) }],
          onRowClick: (p) => { drawerRef = openProbDrawer(p.employeeId, () => { if (!leaving) history.replaceState(null, '', '#/hr/onboarding/probation'); }); history.replaceState(null, '', '#/hr/onboarding/probation/' + p.employeeId); }, empty: { icon: 'clock', title: 'لا توجد سجلات تجربة' } });
        box.append(h('div.card.card-flush.sap-listcard', {}, table.el));
      }
      function tplTab(box) {
        const tpl = (fam, title, extra) => SA.card({ title, actions: [SA.chip('v1 · ساري', 'success')] }, h('div.sap-pp-stack', {}, TASKS[fam].map((t) => h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', borderBottom: '1px solid var(--color-border)', paddingBlock: '8px' } }, h('span', {}, t[1]), h('span', { style: { display: 'flex', gap: '6px' } }, h('span.sap-pp-owner', {}, t[2]), SA.chip('يوم ' + t[3], 'neutral'), t[4] ? SA.chip('إلزامي للوصول', 'danger') : null))), extra));
        box.append(h('div.sap-pp-grid2', {}, tpl('prod', 'قالب خط الإنتاج', note('shield', 'المهام الإلزامية للوصول (توعية السلامة · PPE · التأمينات · العقد) لا تُحذف من قوالب الإنتاج وتُضاف فقط (BR-ONB-08).')), tpl('office', 'قالب الوظائف المكتبية')), h('div', { style: { marginTop: '10px' } }, specLink('m-scr-onb-10', 'محرّر القوالب SCR-ONB-10 ↗')));
      }
      drawBody();
      if (a === 'probation' && ctx.path[1]) { if (probOf(ctx.path[1])) drawerRef = openProbDrawer(ctx.path[1], () => { if (!leaving) history.replaceState(null, '', '#/hr/onboarding/probation'); }); else SA.toast('لا يوجد سجل تجربة لهذا الموظف', 'error'); }
      const offs = ['onbPlans', 'probations', 'employees'].map((p) => st.subscribe(p, () => { if (host.isConnected) { tabs.setBadge('plans', plansAll().filter((x) => planInfo(x).status !== 'complete').length || null); drawBody(); } }));
      return () => { leaving = true; offs.forEach((o) => o()); if (drawerRef) drawerRef.close(); };
    });
  }

  /* ───────── plan detail (SCR-ONB-02) ───────── */
  function renderPlan(root, ctx, planId) {
    const pl0 = col('onbPlans').find((p) => p.id === planId);
    if (!pl0) { root.append(SA.pageHead({ title: 'قائمة غير موجودة', back: { href: SA.href('hr/onboarding'), label: 'التعيين والتجربة' } }), SA.card({}, SA.empty({ icon: 'search', title: 'قائمة التعيين غير موجودة', text: planId }))); return; }
    if (!canSee(pl0.employeeId)) { root.append(SA.denied({ perm: 'hr.onboarding.view', title: 'قائمة خارج نطاق بياناتك' })); return; }
    const e0 = emp(pl0.employeeId); ctx.setCrumbs([{ label: 'الموظفون' }, { label: 'التعيين والتجربة', href: SA.href('hr/onboarding') }, { label: e0.name }]);
    return loadGate(root, 'detail', (host) => {
      const wrap = h('div'); host.append(wrap);
      function draw() {
        const pl = col('onbPlans').find((p) => p.id === planId); if (!pl) return; const e = emp(pl.employeeId); const info = planInfo(pl); const gate = gateOf(pl.employeeId); const f = file(pl.employeeId); const blk = selfBlock(e); SA.clear(wrap);
        const canEdit = SA.can('hr.onboarding.edit');
        const taskRow = (x) => { const t = x.t; const acts = [];
          if (!x.done && t.kind === 'manual') { acts.push(SA.btn({ label: 'إتمام', icon: 'check', kind: 'primary', size: 'sm', perm: 'hr.onboarding.edit', reason: blk, onClick: () => taskDone(pl, t) })); acts.push(x.blocked ? SA.btn({ label: 'إلغاء الحجب', icon: 'unlock', kind: 'ghost', size: 'sm', perm: 'hr.onboarding.edit', onClick: () => taskBlock(pl, t, false) }) : SA.btn({ label: 'حجب', icon: 'xcircle', kind: 'ghost', size: 'sm', perm: 'hr.onboarding.edit', onClick: () => taskBlock(pl, t, true) })); }
          if (!x.done && t.kind === 'contract') { acts.push(SA.btn({ label: 'تسجيل نسخ', icon: 'doc', kind: 'primary', size: 'sm', perm: 'hr.onboarding.edit', reason: blk, onClick: () => contractDialog(pl) })); acts.push(SA.btn({ label: 'استثناء', icon: 'shield', kind: 'ghost', size: 'sm', perm: 'hr.changes.approve', reason: permReason('hr.changes.approve') || blk, onClick: () => contractWaive(pl) })); }
          if (!x.done && t.kind === 'insurance') acts.push(SA.btn({ label: 'مهمة التأمينات', icon: 'shield', kind: 'primary', size: 'sm', perm: 'hr.employees.edit', onClick: () => SA.nav('hr/employees/' + e.id, { query: { tab: 'insurance' } }) }));
          if (!x.done && t.kind === 'induction') acts.push(SA.btn({ label: 'تسجيل التوعية', icon: 'shield', kind: 'primary', size: 'sm', perm: 'hr.ohs.edit', reason: blk, onClick: () => inductionDialog(pl) }));
          if (!x.done && t.kind === 'ppe') acts.push(SA.btn({ label: 'صرف PPE', icon: 'box', kind: 'primary', size: 'sm', perm: 'hr.custody.edit', onClick: () => SA.nav('hr/custody', { query: { issue: e.id } }) }));
          if (!x.done && t.kind === 'buddy') acts.push(SA.btn({ label: 'تعيين مرشد', icon: 'users', kind: 'primary', size: 'sm', perm: 'hr.onboarding.edit', reason: blk, onClick: () => buddyDialog(pl) }));
          if (!x.done && t.kind === 'signoff') acts.push(SA.btn({ label: 'اعتماد اليوم الأول', icon: 'checkcircle', kind: 'primary', size: 'sm', perm: 'hr.onboarding.edit', reason: blk, onClick: () => signoff(pl) }));
          const extra = t.kind === 'contract' ? ' · النسخ ' + (f ? Object.keys(f.contract.copies).filter((k) => f.contract.copies[k]).length : 0) + '/4' + (pl.contractWaiver ? ' (مستثنى بقرار)' : '') : t.kind === 'insurance' && f ? ' · ' + { pending: 'معلّقة', submitted: 'مُقدَّمة', confirmed: 'مؤكَّدة' }[f.insurance.status] : t.kind === 'buddy' && pl.buddy.buddyEmpId ? ' · ' + ((emp(pl.buddy.buddyEmpId) || {}).name || '') : t.kind === 'signoff' && pl.signoff ? ' · ' + SA.userName(pl.signoff.by) : '';
          return h('div.sap-pp-task' + (x.done ? '.is-done' : '') + (x.blocked || (x.overdue && t.required) ? '.is-blocked' : ''), {}, h('span.sap-pp-ck', {}, x.done ? SA.icon('check', 'icon-sm') : null), h('div.sap-pp-tt', {}, h('span', {}, t.title, t.required ? h('span', { style: { marginInlineStart: '8px' } }, SA.chip('إلزامي للوصول', 'danger')) : null), h('small', {}, 'موعد: ' + SA.fmt.date(x.dueDate) + (x.overdue ? ' — متأخرة' : '') + extra + (t.blockedReason && x.blocked ? ' — محجوبة: ' + t.blockedReason : '') + (t.doneBy && x.done && t.kind === 'manual' ? ' · أتمّها ' + SA.userName(t.doneBy) : '')), x.overdue || x.blocked ? null : null), h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, h('span.sap-pp-owner', {}, t.owner), acts)); };
        const owners = []; info.tasks.forEach((x) => { if (owners.indexOf(x.t.owner) < 0) owners.push(x.t.owner); });
        wrap.append(SA.pageHead({ title: 'قائمة التعيين', back: { href: SA.href('hr/onboarding'), label: 'التعيين والتجربة' }, tags: [stChip(PLAN_ST, info.status)], actions: [SA.btn({ label: 'ملف الموظف', icon: 'id', kind: 'ghost', perm: 'hr.employees.view', onClick: () => SA.nav('hr/employees/' + e.id) })] }),
          h('div.sap-pp-profile', {}, SA.avatar(e.name), h('div.sap-pp-pmain', {}, h('h2', {}, e.name), h('div.sap-pp-pmeta', {}, h('b.num', {}, e.empNo), stChip(EMP_ST, e.status), h('span', {}, posTitle(e.positionId) + ' · ' + deptName(e.departmentId))), h('small', {}, 'بدأ ' + SA.fmt.date(pl.startDate) + ' · القالب ' + pl.templateId)), h('div', { style: { minWidth: '200px' } }, h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', {}, 'التقدّم'), h('b.num', {}, info.doneN + ' / ' + info.total)), meter(info.pct, info.status === 'overdue' ? 'bad' : info.pct === 100 ? 'ok' : ''))),
          blk ? SA.alert('warning', blk) : null,
          h('div.sap-pp-grid2', {}, h('div.sap-pp-stack', {}, info.blockers.length ? SA.card({ title: h('span', {}, 'العوائق (Blockers)', SA.chip(String(info.blockers.length), 'danger')) }, h('ul', { style: { margin: 0, paddingInlineStart: '18px' } }, info.blockers.map((x) => h('li', {}, x.t.title + (x.blocked ? ' — محجوبة: ' + x.t.blockedReason : ' — متأخرة') + ' (المسؤول: ' + x.t.owner + ')')))) : SA.alert('success', 'لا عوائق — كل المهام الإلزامية في موعدها.'),
            SA.card({ title: 'مهام اليوم الأول حسب المسؤول', flush: true }, owners.map((o) => h('div', {}, h('div', { style: { padding: '8px 14px', background: 'var(--color-bg-alt)', fontWeight: 700, fontSize: 'var(--text-dense)', color: 'var(--eg-navy)' } }, o), info.tasks.filter((x) => x.t.owner === o).map(taskRow))))),
            h('div.sap-pp-stack', {}, isProdEmp(e) ? gateCard(pl, e, gate) : SA.alert('info', 'وظيفة مكتبية — بوابة الماكينات لا تنطبق.'), SA.card({ title: 'توعية السلامة (OHS)' }, SA.kv([['الحالة', pl.induction.status === 'done' ? SA.chip('تمت — اجتاز', 'success') : SA.chip('لم تتم', 'danger')], ['المنطقة', pl.induction.area || '—'], ['بواسطة', pl.induction.conductedBy ? SA.userName(pl.induction.conductedBy) : '—'], ['تاريخ التوقيع', pl.induction.signedAt ? SA.fmt.dt(pl.induction.signedAt) : '—'], ['صلاحية التوعية', SA.openValue('غير مُعدّة (D11)')], ['محاولات سابقة', pl.induction.attempts.length || 0]])),
              SA.card({ title: 'PPE والزي' }, h('div.sap-pp-stack', {}, ppeRequired(e.id).length ? ppeRequired(e.id).map((m) => { const has = col('custodyIssues').some((i) => i.employeeId === e.id && i.lines.some((l) => l.itemId === m.itemId && ['issued', 'replaced'].indexOf(l.status) >= 0)); return h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', {}, itemOf(m.itemId).name + ' × ' + m.qty), SA.chip(has ? 'مصروف' : 'لم يُصرف', has ? 'success' : 'danger')); }) : h('p.t-muted', {}, 'لا مصفوفة PPE لهذه الوظيفة.'), SA.btn({ label: 'صرف من العهدة', icon: 'box', kind: 'ghost', size: 'sm', perm: 'hr.custody.edit', onClick: () => SA.nav('hr/custody', { query: { issue: e.id } }) }), note('lock', 'PPE مجاني ولا يُخصم ثمنه من العامل (م. 267–269 — Pending).'))))));
      }
      function gateCard(pl, e, gate) {
        return h('div.sap-pp-gate.' + (gate.open ? 'is-open' : 'is-locked'), { role: 'status' }, h('span.dot', {}, SA.icon(gate.open ? 'unlock' : 'lock')), h('div', { style: { display: 'grid', gap: '6px', flex: 1 } }, h('b', {}, gate.open ? 'بوابة الماكينات مفتوحة' : 'بوابة الماكينات مقفولة'), h('span', {}, gate.open ? 'توعية السلامة سُجّلت — يمكن إسناد الموظف لخط الإنتاج.' : gate.reason + '. لا إسناد في الجدول ولا بصمة على الخط ولا صرف مفاتيح لحد ما تتم التوعية.'),
          h('div.sap-pp-pill-row', {}, SA.btn({ label: 'جرّب إسناده لماكينة', icon: 'play', kind: 'ghost', size: 'sm', onClick: () => { if (gate.open) { SA.toast('مسموح: ' + e.name + ' يمكنه العمل على الخط.', 'success'); } else { SA.toast('مرفوض: بوابة السلامة مقفولة لـ' + e.name + ' (BR-ONB-01).', 'error', { ms: 6000 }); deliver('HR.ONB.GATE_VIOLATION', empTgt(e), { result: 'denied', reason: 'محاولة إسناد لخط الإنتاج قبل توعية السلامة' }); SA.notify({ title: 'محاولة وصول للخط قبل التوعية: ' + e.name, body: 'تم الحجب على الخادم (N-12).', level: 'urgent', to: ['R-11', 'R-15'], link: '#/hr/onboarding/' + pl.id }); } } }), !gate.open ? SA.btn({ label: 'تسجيل التوعية', icon: 'shield', kind: 'primary', size: 'sm', perm: 'hr.ohs.edit', onClick: () => inductionDialog(pl) }) : null)));
      }
      draw();
      const offs = ['onbPlans', 'empFiles', 'custodyIssues', 'employees'].map((p) => st.subscribe(p, () => { if (wrap.isConnected) draw(); })); return () => offs.forEach((o) => o());
    });
  }
  function logTask(pl, t, code, extra) { const e = emp(pl.employeeId); deliver(code, tgt('onboarding', pl.id, (e ? e.name : '') + ' — ' + (t ? t.title : '')), extra); }
  async function taskDone(pl, t) {
    const r = await SA.confirm({ title: 'إتمام المهمة', text: t.title, confirmLabel: 'تم', impact: ['تُسجَّل باسمك وبوقت الإتمام.', 'لا يُعتمد إتمام المهمة ممن نفّذها (فصل مهام).'] }); if (!r.ok) return;
    const x = await run(() => { st.update('onbPlans', (l) => { const p = l.find((q) => q.id === pl.id); const k = p.tasks.find((q) => q.id === t.id); k.status = 'done'; k.doneBy = me().id; k.doneAt = nowIso(); k.blockedReason = ''; }); logTask(pl, t, 'HR.ONB.TASK_COMPLETED'); }); if (x.ok) SA.toast('تم إتمام المهمة', 'success');
  }
  async function taskBlock(pl, t, on) {
    if (!on) { const x = await run(() => { st.update('onbPlans', (l) => { const k = l.find((q) => q.id === pl.id).tasks.find((q) => q.id === t.id); k.status = 'todo'; k.blockedReason = ''; }); }); if (x.ok) SA.toast('أُلغي الحجب', 'success'); return; }
    const r = await SA.confirm({ title: 'حجب المهمة', text: t.title, danger: true, confirmLabel: 'حجب', reasonRequired: true, reasonLabel: 'سبب الحجب', impact: ['تظهر المهمة كعائق (Blocker) في اللوحة.'] }); if (!r.ok) return;
    const x = await run(() => { st.update('onbPlans', (l) => { const k = l.find((q) => q.id === pl.id).tasks.find((q) => q.id === t.id); k.status = 'blocked'; k.blockedReason = r.reason; }); logTask(pl, t, 'HR.ONB.TASK_BLOCKED', { reason: r.reason }); }); if (x.ok) SA.toast('تم الحجب', 'warn');
  }
  function contractDialog(pl) {
    const f = file(pl.employeeId); const cp = f.contract.copies; const labs = [['employer', 'نسخة صاحب العمل'], ['worker', 'نسخة العامل'], ['insurance', 'نسخة مكتب التأمينات'], ['admin', 'نسخة الجهة الإدارية']];
    const fl = labs.map((l) => F({ name: l[0], label: l[1] + ' — مُستلمة وموقّعة', type: 'checkbox', value: cp[l[0]] }));
    formDialog({ title: 'عقد العمل — النسخ الأربع', subtitle: emp(pl.employeeId).name + ' — م. 89 Pending [Law]', icon: 'doc', fields: fl, submitLabel: 'حفظ',
      async onSubmit(v) { const r = await run(() => { patchFile(pl.employeeId, (ff) => { labs.forEach((l) => { ff.contract.copies[l[0]] = !!v[l[0]]; }); }); logTask(pl, { title: 'عقد عمل بأربع نسخ' }, 'HR.ONB.TASK_COMPLETED', { after: v }); }); if (r.ok) SA.toast('تم تحديث نسخ العقد', 'success'); return r.ok; } });
  }
  async function contractWaive(pl) {
    const r = await SA.confirm({ title: 'استثناء شرط عقد الأربع نسخ', confirmLabel: 'استثناء', reasonRequired: true, reasonLabel: 'سبب الاستثناء', impact: ['تُعتبر المهمة مكتملة بقرار HR Manager وسبب (BR-ONB-11).'] }); if (!r.ok) return;
    const x = await run(() => { st.update('onbPlans', (l) => { l.find((q) => q.id === pl.id).contractWaiver = { by: me().id, reason: r.reason, at: nowIso() }; }); logTask(pl, { title: 'استثناء عقد 4 نسخ' }, 'HR.ONB.TASK_COMPLETED', { reason: r.reason }); }); if (x.ok) SA.toast('تم الاستثناء', 'success');
  }
  function buddyDialog(pl) {
    const e = emp(pl.employeeId); const opts = EMPS().filter((x) => x.id !== e.id && x.status === 'active' && x.departmentId === e.departmentId).map((x) => [x.id, x.name + ' — ' + posTitle(x.positionId)]);
    formDialog({ title: 'تعيين الزميل المرشد', subtitle: e.name, icon: 'users', fields: [F({ name: 'buddy', label: 'الزميل المرشد', type: 'select', required: true, options: opt(opts.length ? opts : empOpts((x) => x.id !== e.id && x.status === 'active'), 'اختر…'), hint: 'من نفس القسم وبحالة نشط — لا يكون هو الموظف نفسه.' })], submitLabel: 'تعيين',
      async onSubmit(v) { const r = await run(() => { st.update('onbPlans', (l) => { l.find((q) => q.id === pl.id).buddy = { buddyEmpId: v.buddy, introAt: nowIso() }; }); logTask(pl, { title: 'تعيين زميل مرشد' }, 'HR.ONB.BUDDY_ASSIGNED', { after: { buddy: (emp(v.buddy) || {}).name } }); }); if (r.ok) SA.toast('تم تعيين المرشد', 'success'); return r.ok; } });
  }
  async function signoff(pl) {
    const e = emp(pl.employeeId); const info = planInfo(pl); const pending = info.tasks.filter((x) => !x.done && x.t.kind !== 'signoff' && x.t.required);
    if (pending.length) { SA.toast('لا اعتماد قبل إتمام المهام الإلزامية: ' + pending.map((x) => x.t.title).join('، '), 'error', { ms: 7000 }); return; }
    const doers = pl.tasks.filter((t) => t.doneBy).map((t) => t.doneBy); if (doers.indexOf(me().id) >= 0) { SA.toast('أنت نفّذت مهام في القائمة — لا يعتمد المنفّذ اكتمال قائمته (فصل المهام BR-ONB-07). يعتمدها المشرف أو معتمد آخر.', 'error', { ms: 7000 }); deliver('HR.CHG.SOD_BLOCKED', tgt('onboarding', pl.id, e.name), { result: 'denied', reason: 'منفّذ مهام يحاول اعتماد الاكتمال' }); return; }
    const r = await SA.confirm({ title: 'اعتماد اكتمال اليوم الأول', text: e.name, confirmLabel: 'اعتماد', impact: ['تُغلق قائمة اليوم الأول كـ«مكتملة».', 'يُسجَّل اعتمادك كمشرف/معتمد.'] }); if (!r.ok) return;
    const x = await run(() => { st.update('onbPlans', (l) => { l.find((q) => q.id === pl.id).signoff = { by: me().id, at: nowIso() }; }); logTask(pl, { title: 'اعتماد اليوم الأول' }, 'HR.ONB.DAY1_SIGNOFF'); }); if (x.ok) SA.toast('تم اعتماد اكتمال اليوم الأول', 'success');
  }
  function inductionDialog(pl) {
    const e = emp(pl.employeeId); const topics = S().inductionTopics || INDUCTION_TOPICS; const pad = sigPad();
    const fl = [F({ name: 'area', label: 'منطقة العمل', type: 'select', required: true, options: opt(deptOpts().filter((d) => isProdDept(d[0])), 'اختر…'), value: e.departmentId }), F({ name: 'result', label: 'النتيجة', type: 'radio', required: true, value: 'pass', options: [['pass', 'اجتاز'], ['fail', 'لم يجتز']] }), F({ name: 'topics', label: 'المحاور المُغطّاة', type: 'multi', required: true, options: topics.map((t) => [t, t]), value: topics.slice(0, 5), full: true })];
    const extra = h('div', {}, h('b', { style: { fontSize: 'var(--text-dense)' } }, 'توقيع الموظف (إلزامي عند النجاح)'), pad.el, h('p.t-caption', {}, 'صلاحية التوعية ', SA.openValue('غير مُعدّة (D11)')));
    formDialog({ title: 'تسجيل توعية السلامة', subtitle: e.name + ' — بوابة الماكينات', icon: 'shield', size: 'lg', fields: fl, extra, submitLabel: 'تسجيل',
      validate: (v) => (v.result === 'pass' && pad.isEmpty() ? 'توقيع الموظف مطلوب عند النجاح (لا توعية بدون توقيع).' : null),
      async onSubmit(v) {
        const ok = v.result === 'pass'; const r = await run(() => {
          st.update('onbPlans', (l) => { const p = l.find((q) => q.id === pl.id); p.induction.attempts.push({ at: nowIso(), by: me().id, result: v.result }); if (ok) p.induction = Object.assign(p.induction, { status: 'done', area: deptName(v.area), topics: v.topics, result: 'pass', conductedBy: me().id, signedAt: nowIso(), validUntil: null }); });
          SA.audit('HR.ONB.INDUCTION_DONE', { target: tgt('onboarding', pl.id, e.name), result: ok ? 'success' : 'failure', after: { area: deptName(v.area), result: v.result, topics: v.topics.length } });
          if (ok) { SA.audit('HR.ONB.GATE_RELEASED', { target: tgt('onboarding', pl.id, e.name), after: { gate: 'open' } }); SA.notify({ title: 'فُتحت بوابة الماكينات: ' + e.name, body: 'توعية السلامة سُجّلت.', level: 'info', to: ['R-11'], toUsers: e.managerEmpId && emp(e.managerEmpId) && emp(e.managerEmpId).userId ? [emp(e.managerEmpId).userId] : [], link: '#/hr/onboarding/' + pl.id }); }
        }); if (!r.ok) return false; SA.toast(ok ? 'تم تسجيل التوعية وفتح بوابة الماكينات' : 'سُجّلت المحاولة — البوابة تبقى مقفولة', ok ? 'success' : 'warn'); return true;
      } });
  }

  /* ───────── probation drawer: reviews + decision ───────── */
  function openProbDrawer(empId, onClose) {
    let d; const body = h('div.sap-pp-stack');
    function draw() {
      const e = emp(empId), pb = probOf(empId); SA.clear(body); if (!e || !pb) { body.append(SA.empty({ icon: 'search', title: 'السجل غير موجود' })); return; }
      const i = probInfo(pb); const final = ['confirmed', 'termination_referred'].indexOf(pb.status) >= 0; const blk = selfBlock(e);
      body.append(personLine(e), h('div.sap-pp-stats', {}, statBox('المدة', pb.initialDays + (pb.extendedDays ? '+' + pb.extendedDays : '')), statBox('مضى', i.elapsed + ' يوم'), statBox('المتبقي', final ? '—' : Math.max(0, i.daysLeft), i.daysLeft <= 7 && !final ? 'warn' : ''), statBox('تمديد', pb.extensionUsed ? 'مستخدم' : 'متاح')), h('div', {}, stChip(PROB_ST, i.state), ' ', h('span.t-muted', {}, 'النهاية ' + SA.fmt.date(i.end))),
        SA.card({ title: 'نقاط التفتيش' }, h('div.sap-pp-stack', {}, i.cps.map((day) => { const rv = pb.reviews.find((r) => r.day === day); const due = i.elapsed >= day; return h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' } }, h('div', {}, h('b', {}, 'يوم ' + day), h('div.t-muted', { style: { fontSize: 'var(--text-caption)' } }, rv ? 'مناسبة: ' + ({ fit: 'مناسب', watch: 'يحتاج متابعة', unfit: 'غير مناسب' }[rv.recommendation]) + ' · ' + SA.userName(rv.reviewerId) + ' · أداء ' + rv.scores.performance + '/5 · حضور ' + rv.scores.attendance + '/5' : due ? 'مستحقة' : 'لم يحن موعدها')), rv ? SA.chip('سُلّمت', 'success') : SA.btn({ label: 'تقييم', icon: 'edit', kind: due ? 'primary' : 'ghost', size: 'sm', perm: 'hr.onboarding.edit', reason: blk || (due ? '' : 'لم يحن موعد النقطة'), onClick: () => reviewDialog(pb, day) })); }))),
        final ? SA.alert(pb.status === 'confirmed' ? 'success' : 'danger', pb.status === 'confirmed' ? 'تم التثبيت بتاريخ ' + SA.fmt.date(pb.decidedAt) + ' بواسطة ' + SA.userName(pb.decidedBy) : 'أُحيل للإنهاء — يتابع من الاستقالات والإنهاء.') : SA.card({ title: 'قرار نهاية التجربة' }, h('div.sap-pp-stack', {}, note('info', 'لا قرار تلقائي: تثبيت أو تمديد داخل الحد (مرة واحدة) أو إحالة للإنهاء. القرار لـHR Manager.'), h('div.sap-pp-pill-row', {}, SA.btn({ label: 'اتخاذ قرار', icon: 'checkcircle', kind: 'primary', perm: 'hr.changes.approve', reason: permReason('hr.changes.approve') || blk, onClick: () => decisionDialog(pb) })), i.maxAdd === 0 ? note('lock', pb.extensionUsed ? 'التمديد استُخدم — مرة واحدة فقط.' : 'لا مجال للتمديد: المدة وصلت الحد الأقصى ' + i.max + ' يوم.') : note('info', 'متاح تمديد حتى ' + i.maxAdd + ' يوم (الحد الأقصى ' + i.max + ').'))));
    }
    d = SA.drawer({ title: 'فترة التجربة', subtitle: (emp(empId) || {}).name, size: 'lg', body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close() }, 'إغلاق')], onClose: () => { offs.forEach((o) => o()); if (onClose) onClose(); } });
    const offs = ['probations', 'employees'].map((p) => st.subscribe(p, () => { if (body.isConnected) draw(); })); draw(); return d;
  }
  function reviewDialog(pb, day) {
    const e = emp(pb.employeeId); const sc = [['attendance', 'الحضور'], ['performance', 'الأداء'], ['safety', 'الالتزام بالسلامة'], ['teamwork', 'العمل الجماعي']]; const sel = (k, l) => F({ name: k, label: l + ' (1–5)', type: 'select', required: true, options: [1, 2, 3, 4, 5].map((n) => [String(n), String(n)]), value: '4' });
    const fl = sc.map((s) => sel(s[0], s[1])).concat([F({ name: 'rec', label: 'التوصية', type: 'select', required: true, options: [['fit', 'مناسب'], ['watch', 'يحتاج متابعة'], ['unfit', 'غير مناسب']], value: 'fit' }), F({ name: 'notes', label: 'ملاحظات', type: 'textarea', full: true })]);
    formDialog({ title: 'تقييم نقطة تفتيش — يوم ' + day, subtitle: e.name, icon: 'edit', fields: fl, submitLabel: 'تسليم التقييم', validate: (v) => (v.rec === 'unfit' && !String(v.notes || '').trim() ? 'الملاحظة إلزامية لو التوصية «غير مناسب».' : e.userId && e.userId === me().id ? 'لا تقيّم نفسك.' : null),
      async onSubmit(v) { const r = await run(() => { st.update('probations', (l) => { const p = l.find((q) => q.id === pb.id); p.reviews.push({ id: 'RV-' + day + '-' + Math.random().toString(36).slice(2, 5), day, scores: { attendance: +v.attendance, performance: +v.performance, safety: +v.safety, teamwork: +v.teamwork }, notes: v.notes, recommendation: v.rec, reviewerId: me().id, submittedAt: nowIso() }); }); deliver('HR.PROB.REVIEW_SUBMITTED', empTgt(e), { after: { day, rec: v.rec } }); }); if (r.ok) SA.toast('تم تسليم التقييم', 'success'); return r.ok; } });
  }
  function sickBlock(empId) { return col('leaveRequests').find((r) => r.employeeId === empId && r.type === 'sick' && r.status === 'approved' && r.from <= today() && r.to >= today()); }
  function decisionDialog(pb) {
    const e = emp(pb.employeeId); const i = probInfo(pb); let mode = 'confirm';
    const days = F({ name: 'days', label: 'أيام التمديد', type: 'number', min: 1, value: Math.min(30, Math.max(1, i.maxAdd)), hint: 'متاح حتى ' + i.maxAdd + ' يوم (المدة الحالية ' + i.total + ' من أقصى ' + i.max + ').' });
    const reason = F({ name: 'reason', label: 'سبب القرار', type: 'textarea', full: true, hint: 'إلزامي للتمديد والإحالة للإنهاء.' });
    const info = h('div'); const segBox = h('div');
    const rerender = () => { SA.clear(info); days.el.hidden = mode !== 'extend';
      if (mode === 'confirm') info.append(SA.alert('info', 'التثبيت: يتحوّل الموظف إلى «نشط» ويصدر خطاب التثبيت (DOC-HR-15) وتُبلَّغ المرتبات.'));
      if (mode === 'extend') info.append(i.maxAdd > 0 && i.daysLeft >= 0 ? SA.alert('info', 'التمديد مرة واحدة فقط وبقرار مسبّب قبل نهاية المدة، وإجمالي المدة لا يتجاوز ' + i.max + ' يوم.') : SA.alert('danger', pb.extensionUsed ? 'التمديد استُخدم من قبل — مرة واحدة فقط (BR-ONB-02).' : i.daysLeft < 0 ? 'انتهت المدة — لا تمديد بعد النهاية (BR-ONB-03).' : 'لا مجال للتمديد: المدة الحالية ' + i.total + ' يوم = الحد الأقصى ' + i.max + ' (BR-ONB-03).'));
      if (mode === 'terminate') info.append(SA.alert('warning', 'الإنهاء أثناء التجربة مش زر: يتحوّل لطلب في «الاستقالات والإنهاء» بحظر آلي لو في إجازة مرضية مثبتة. شروط الإخطار والمستحقات {Open} [Law · غير متحقق].')); };
    segBox.append(SA.segmented([['confirm', 'تثبيت'], ['extend', 'تمديد'], ['terminate', 'إحالة للإنهاء']], mode, (v) => { mode = v; rerender(); }));
    const m = formDialog({ title: 'قرار نهاية التجربة', subtitle: e.name + ' — ' + i.elapsed + ' يوم من ' + i.total, icon: 'checkcircle', size: 'md', fields: [days, reason], extra: h('div', {}, segBox, info), submitLabel: 'تسجيل القرار', kind: 'primary',
      validate: () => { if (mode !== 'confirm' && !String(reason.get() || '').trim()) return 'السبب إلزامي للتمديد والإحالة.'; if (mode === 'extend') { if (pb.extensionUsed) return 'التمديد استُخدم من قبل.'; if (i.daysLeft < 0) return 'انتهت المدة — لا تمديد.'; const n = days.get(); if (!n || n < 1) return 'أدخل عدد أيام التمديد.'; if (i.total + n > i.max) return 'التمديد يتجاوز الحد الأقصى (' + i.max + ' يوم): المتاح ' + i.maxAdd + '.'; } if (mode === 'terminate' && sickBlock(e.id)) return 'حظر آلي: الموظف في إجازة مرضية مثبتة — لا إنهاء (م. قانونية Pending).'; if (mode === 'confirm' && !pb.reviews.length) return 'لا يمكن التثبيت بدون أي تقييم نقطة تفتيش مسلَّم.'; return null; },
      async onSubmit(v) {
        const sb = sodBlock(null, e); if (sb) { SA.toast(sb, 'error', { ms: 6500 }); return false; }
        if (!(await SA.stepUp('approval.decide'))) return false; let lt = null;
        const r = await run(() => {
          if (mode === 'confirm') { st.update('probations', (l) => { Object.assign(l.find((q) => q.id === pb.id), { status: 'confirmed', decision: 'confirm', decidedBy: me().id, decidedAt: nowIso(), reason: v.reason }); }); st.patch('employees', e.id, { status: 'active' }); lt = letter('probation', e, pb.id, 'خطاب التثبيت بعد اجتياز فترة التجربة', ['السيد/ة ' + e.name + '،', 'يسرنا إبلاغكم بأنه تقرر تثبيتكم في وظيفة «' + posTitle(e.positionId) + '» بقسم ' + deptName(e.departmentId) + ' اعتبارًا من ' + SA.fmt.date(today()) + ' بعد اجتيازكم فترة التجربة (' + i.total + ' يومًا) بنجاح.', 'وتفضلوا بقبول فائق الاحترام.']); addEvent(e, { field: 'status', label: 'التثبيت بعد التجربة', old: 'تجربة', new: 'نشط', source: 'HR-05', reason: v.reason || 'اجتاز التجربة', approver: me().id }); deliver('HR.PROB.CONFIRMED', empTgt(e), { after: { status: 'active' }, reason: v.reason }); deliver('HR.EMP.STATUS_CHANGED', empTgt(e), { before: { status: 'probation' }, after: { status: 'active' } }); }
          else if (mode === 'extend') { st.update('probations', (l) => { Object.assign(l.find((q) => q.id === pb.id), { extendedDays: v.days, extensionUsed: true, status: 'extended', decision: 'extend', decidedBy: me().id, decidedAt: nowIso(), reason: v.reason, remindersSent: [] }); }); deliver('HR.PROB.EXTENDED', empTgt(e), { before: { days: i.total }, after: { days: i.total + v.days }, reason: v.reason }); addEvent(e, { field: 'probation', label: 'تمديد التجربة ' + v.days + ' يوم', old: i.total + ' يوم', new: (i.total + v.days) + ' يوم', source: 'HR-05', reason: v.reason }); }
          else { st.update('probations', (l) => { Object.assign(l.find((q) => q.id === pb.id), { status: 'termination_referred', decision: 'terminate', decidedBy: me().id, decidedAt: nowIso(), reason: v.reason }); }); deliver('HR.PROB.TERMINATION_REFERRED', empTgt(e), { reason: v.reason }); SA.notify({ title: 'إحالة للإنهاء أثناء التجربة: ' + e.name, body: 'السبب: ' + v.reason, level: 'action', to: ['R-11', 'R-02'], link: '#/hr/termination' }); }
        });
        if (!r.ok) return false;
        if (mode === 'confirm') { SA.notify({ title: 'تثبيت موظف: ' + e.name, body: 'اجتاز التجربة — حالته الآن نشط.', level: 'info', to: ['R-13', 'R-11'], toUsers: e.userId ? [e.userId] : [], link: '#/hr/employees/' + e.id }); SA.toast('تم التثبيت — صدر خطاب DOC-HR-15', 'success', { ms: 6500 }); showLetter(lt); }
        else SA.toast(mode === 'extend' ? 'تم تمديد التجربة ' + v.days + ' يوم' : 'أُحيل للإنهاء — تابع من الاستقالات والإنهاء', 'success'); return true;
      } });
    rerender(); return m;
  }

  /* ═════════════════════════ HR-07 · التغييرات الوظيفية ═════════════════════════ */
  const CHG_TYPES = { transfer: { label: 'نقل', desc: 'قسم جديد ومدير جديد', icon: 'swap' }, promotion: { label: 'ترقية', desc: 'وظيفة/مسمى جديد ودرجة (وربما مرتب)', icon: 'star' }, grade: { label: 'تغيير درجة', desc: 'درجة وظيفية جديدة', icon: 'layers' }, salary: { label: 'تغيير مرتب', desc: 'T3 — أساسي وبدلات', icon: 'coins' }, title: { label: 'تغيير مسمى', desc: 'مسمى بدون أثر مالي', icon: 'edit' }, shift_group: { label: 'مجموعة وردية', desc: 'نقل لوردية مع فحص الأثر', icon: 'clock' }, suspend: { label: 'إيقاف عن العمل', desc: 'قرار كتابي بأجر كامل', icon: 'alert' }, return: { label: 'عودة من الإيقاف', desc: 'استئناف العمل', icon: 'check' }, profile: { label: 'تعديل بيانات حساسة', desc: '', icon: 'id' }, import_salary: { label: 'مرتبات دفعة استيراد', desc: '', icon: 'upload' } };
  const CHG_STATUS = { in_approval: ['في الاعتماد', 'warning'], returned: ['مُرجَع للاستيفاء', 'info'], approved: ['معتمد', 'info'], scheduled: ['مجدول', 'info'], effective: ['ساري', 'success'], rejected: ['مرفوض', 'danger'], cancelled: ['ملغي', 'neutral'] };
  const monthStart = () => today().slice(0, 7) + '-01';
  const isFinancial = (cr) => !!cr.salary;
  const subjectEmp = (cr) => emp(cr.employeeId);
  function chainFor(cr) {
    const e = subjectEmp(cr); const HRM = { roleId: 'R-11', label: 'مدير الموارد البشرية' }, GM = { roleId: 'R-02', label: 'المدير العام (الأثر المالي والاعتماد النهائي)' };
    const head = (d) => { const r = deptHeadRole(d); return r ? { roleId: r, label: 'رئيس القسم' } : null; }; let c = [];
    switch (cr.type) {
      case 'transfer': c = [head(e.departmentId), cr.after.departmentId && cr.after.departmentId !== e.departmentId ? head(cr.after.departmentId) : null, HRM]; break;
      case 'promotion': case 'grade': c = [head(e.departmentId), HRM, GM]; break;
      case 'salary': c = [head(e.departmentId), HRM, GM]; break;
      case 'shift_group': c = [head(e.departmentId), HRM]; break;
      case 'suspend': c = [HRM, GM]; break; default: c = [HRM];
    }
    const out = []; const my = me() ? me().roleId : null; const subjRole = e && e.userId && SA.userById(e.userId) ? SA.userById(e.userId).roleId : null;
    c.filter(Boolean).forEach((s) => { if (out.some((x) => x.roleId === s.roleId)) return; if (s.roleId === my || s.roleId === subjRole) out.push({ roleId: 'R-01', label: s.label + ' (بديل: الطالب/الموظف يشغل نفس الدور)' }); else out.push(s); });
    const seen = new Set(); return out.filter((s) => { if (seen.has(s.roleId)) return false; seen.add(s.roleId); return true; });
  }
  /** rows [label, before, after, tier] */
  function chgRows(cr) {
    const e = subjectEmp(cr) || {}; const r = []; const b = cr.before || {}, a = cr.after || {};
    if (a.departmentId) r.push(['القسم', deptName(b.departmentId), deptName(a.departmentId), 'T1']); if (a.managerEmpId !== undefined && cr.type === 'transfer') r.push(['المدير المباشر', (emp(b.managerEmpId) || {}).name || '—', (emp(a.managerEmpId) || {}).name || '—', 'T1']);
    if (a.title) r.push(['المسمى', b.title || '—', a.title, 'T1']); if (a.positionId) r.push(['الوظيفة', posTitle(b.positionId), posTitle(a.positionId), 'T1']); if (a.grade) r.push(['الدرجة', b.grade || 'غير مُعدّة', a.grade, 'T1']); if (a.shift) r.push(['الوردية', SHIFT[b.shift] || b.shift, SHIFT[a.shift] || a.shift, 'T1']);
    if (cr.salary) { r.push(['المرتب الأساسي', cr.salary.from, cr.salary.to, 'T3']); if (cr.salary.allowTo != null) r.push(['البدلات', cr.salary.allowFrom, cr.salary.allowTo, 'T3']); }
    if (cr.type === 'suspend') r.push(['الحالة', 'نشط', 'موقوف ' + a.days + ' يوم (بأجر كامل)', 'T4']); if (cr.type === 'return') r.push(['الحالة', 'موقوف', 'عودة للعمل', 'T1']);
    if (cr.type === 'profile') r.push(['التعديل', '—', cr.reason, 'T2']); if (cr.type === 'import_salary') r.push(['الدفعة', '—', (cr.after || {}).batchId, 'T3']);
    return r;
  }
  const rowVal = (v, tier) => (tier === 'T3' && !canSal() ? secret() : typeof v === 'number' ? h('span.num', {}, SA.fmt.money(v)) : v == null ? '—' : String(v));
  const chgBrief = (cr) => { const rows = chgRows(cr).filter((x) => x[3] !== 'T3' || canSal()); if (!rows.length) return cr.salary ? secret() : '—'; const x = rows[0]; return h('span', {}, x[0] + ': ', h('span.t-muted', {}, typeof x[1] === 'number' ? SA.fmt.num(x[1]) : x[1]), ' ← ', h('b', {}, typeof x[2] === 'number' ? SA.fmt.num(x[2]) : x[2])); };
  const myTurn = (cr) => { const ap = col('approvals').find((a) => a.id === cr.approvalId); if (!ap || ap.status !== 'pending') return false; const step = ap.chain[ap.currentStep - 1]; return !!step && (step.roleId === (me() || {}).roleId || (SA.session.role && SA.session.role.isProtected)) && ap.requesterId !== me().id; };
  /* ── approvals → source records (reconciler) ── */
  function letterFor(cr, e) {
    const L = CHG_TYPES[cr.type].label; const lines = ['السيد/ة ' + e.name + '،'];
    const rows = chgRows(cr).filter((x) => x[3] !== 'T4'); lines.push('نحيطكم علمًا بأنه تقرر اعتبارًا من ' + SA.fmt.date(cr.effectiveFrom) + ' إجراء «' + L + '» على النحو التالي:');
    rows.forEach((x) => lines.push('— ' + x[0] + ': من ' + (typeof x[1] === 'number' ? SA.fmt.money(x[1]) : x[1]) + ' إلى ' + (typeof x[2] === 'number' ? SA.fmt.money(x[2]) : x[2]))); lines.push('وتفضلوا بقبول فائق الاحترام.');
    return letter('change', e, cr.id, 'خطاب ' + L, lines);
  }
  function applyChange(cr) {
    const e = emp(cr.employeeId); if (!e) return; const a = cr.after || {}, ev = (o) => addEvent(e, Object.assign({ effectiveFrom: cr.effectiveFrom, source: 'HR-07', reason: cr.reason, actor: cr.requestedBy, approver: me() ? me().id : null }, o));
    st.update('employees', (l) => { const x = l.find((q) => q.id === cr.employeeId);
      if (cr.type === 'transfer') { x.departmentId = a.departmentId; if (a.managerEmpId !== undefined) x.managerEmpId = a.managerEmpId; }
      if (a.positionId) x.positionId = a.positionId; if (a.title) x.titleOverride = a.title; if (a.grade) x.grade = a.grade; if (a.shift) x.shift = a.shift;
      if (cr.salary) { x.salary.basic = cr.salary.to; if (cr.salary.allowTo != null) x.salary.allowances = cr.salary.allowTo; x.salary.pending = false; }
      if (cr.type === 'suspend') { x.prevStatus = x.status; x.status = 'suspended'; x.suspension = { from: cr.effectiveFrom, days: a.days, paidPct: 100 }; } if (cr.type === 'return') { x.status = x.prevStatus && x.prevStatus !== 'suspended' ? x.prevStatus : 'active'; x.suspension = null; } });
    if (cr.type === 'transfer') { st.update('leaveRequests', (l) => l.forEach((r) => { if (r.employeeId === cr.employeeId && r.status === 'pending' && a.managerEmpId) r.approverEmpId = a.managerEmpId; })); ev({ field: 'department', label: 'نقل إلى ' + deptName(a.departmentId), old: deptName(cr.before.departmentId), new: deptName(a.departmentId) }); }
    if (cr.type === 'promotion' || cr.type === 'title' || a.positionId) ev({ field: 'title', label: cr.type === 'promotion' ? 'ترقية' : 'تغيير المسمى', old: cr.before.title || posTitle(cr.before.positionId), new: a.title || posTitle(a.positionId) });
    if (a.grade) ev({ field: 'grade', label: 'تغيير الدرجة', old: cr.before.grade || null, new: a.grade }); if (a.shift) ev({ field: 'shift', label: 'تغيير مجموعة الوردية', old: SHIFT[cr.before.shift], new: SHIFT[a.shift] });
    if (cr.salary) { ev({ field: 'basic', label: 'تغيير المرتب الأساسي', old: cr.salary.from, new: cr.salary.to, tier: 'T3' }); if (cr.scId) st.patch('salaryChanges', cr.scId, { status: 'approved', effectiveFrom: cr.effectiveFrom, applied: true, appliedAt: nowIso() }); SA.audit('HR.CHG.SALARY_APPLIED', { target: empTgt(e), before: { basic: cr.salary.from }, after: { basic: cr.salary.to, effectiveFrom: cr.effectiveFrom }, reason: cr.reason }); }
    if (cr.type === 'suspend') { ev({ field: 'status', label: 'إيقاف عن العمل', old: 'نشط', new: 'موقوف ' + a.days + ' يوم', tier: 'T4' }); SA.audit('HR.CHG.SUSPENDED', { target: empTgt(e), after: { days: a.days, paidPct: 100 }, reason: cr.reason }); }
    if (cr.type === 'return') { ev({ field: 'status', label: 'عودة من الإيقاف', old: 'موقوف', new: 'نشط' }); SA.audit('HR.CHG.RETURNED_FROM_SUSPENSION', { target: empTgt(e), reason: cr.reason }); }
    let lt = null; if (['suspend', 'return'].indexOf(cr.type) < 0) { lt = letterFor(cr, e); SA.audit('HR.CHG.LETTER_ISSUED', { target: empTgt(e), after: { letter: lt.id, doc: lt.docNo } }); }
    st.patch('changeRequests', cr.id, { status: 'effective', appliedAt: nowIso(), letterId: lt ? lt.id : cr.letterId });
    SA.audit('HR.CHG.EFFECTIVE', { target: empTgt(e), after: { type: cr.type, effectiveFrom: cr.effectiveFrom }, reason: cr.reason });
    SA.notify({ title: (CHG_TYPES[cr.type] || {}).label + ' ساري: ' + e.name, body: 'يسري اعتبارًا من ' + SA.fmt.date(cr.effectiveFrom) + (lt ? ' — صدر الخطاب ' + lt.docNo : ''), level: 'info', to: ['R-13'].concat(cr.salary ? ['R-11'] : []), toUsers: (e.userId ? [e.userId] : []).concat(e.managerEmpId && emp(e.managerEmpId) && emp(e.managerEmpId).userId ? [emp(e.managerEmpId).userId] : []), link: '#/hr/employees/' + e.id });
  }
  function applyBatchSalaries(cr) {
    const b = st.find('importBatches', (cr.after || {}).batchId); if (!b) return; (b.pendingSalaries || []).forEach((p) => { const e = emp(p.empId); if (!e) return; st.update('employees', (l) => { const x = l.find((q) => q.id === p.empId); x.salary.basic = p.basic; x.salary.pending = false; }); addEvent(e, { field: 'basic', label: 'المرتب الأساسي (دفعة استيراد)', old: null, new: p.basic, tier: 'T3', source: 'HR-06', approver: me().id }); });
    st.patch('importBatches', b.id, { pendingSalaries: [], salaryApplied: true }); SA.audit('HR.SALARY.CHANGE_APPROVED', { target: tgt('import', b.id, 'مرتبات دفعة ' + b.id), after: { employees: (b.pendingSalaries || []).length } });
  }
  function applyProfile(cr) {
    const e = emp(cr.employeeId); if (!e) return; const p = cr.after || {};
    if (cr.kind === 'name') st.patch('employees', e.id, { name: p.value }); else if (cr.kind === 'marital') patchFile(e.id, (f) => { f.personal.marital = p.value; }); else if (cr.kind === 'dependant') patchFile(e.id, (f) => f.dependants.push(p.dep));
    addEvent(e, { field: cr.kind, label: cr.reason, old: null, new: cr.kind === 'dependant' ? p.dep.name : p.value, source: 'HR-06', reason: cr.attachment ? 'مرفق: ' + cr.attachment : '', approver: me().id });
    SA.audit('HR.EMPLOYEE.UPDATED', { target: empTgt(e), after: { [cr.kind]: cr.kind === 'dependant' ? p.dep.name : p.value }, reason: cr.reason + ' (معتمد)' }); st.patch('changeRequests', cr.id, { status: 'effective', appliedAt: nowIso() });
  }
  function markApproved(cr) {
    const e = emp(cr.employeeId); SA.audit('HR.CHG.APPROVED', { target: empTgt(e || { id: cr.employeeId, name: '', empNo: '' }), after: { id: cr.id, type: cr.type }, reason: cr.reason });
    if (cr.type === 'profile') { st.patch('changeRequests', cr.id, { status: 'approved' }); applyProfile(cr); return; }
    if (cr.type === 'import_salary') { st.patch('changeRequests', cr.id, { status: 'effective', appliedAt: nowIso() }); applyBatchSalaries(cr); return; }
    if (cr.effectiveFrom > today()) { st.patch('changeRequests', cr.id, { status: 'scheduled', approvedAt: nowIso() }); SA.notify({ title: 'تغيير معتمد ومجدول: ' + (e ? e.name : ''), body: 'يسري في ' + SA.fmt.date(cr.effectiveFrom), level: 'info', to: ['R-11'], link: '#/hr/changes/' + cr.id }); return; }
    st.patch('changeRequests', cr.id, { status: 'approved', approvedAt: nowIso() }); applyChange(Object.assign({}, cr, { status: 'approved' }));
  }
  function markRejected(cr, ap, status) {
    const e = emp(cr.employeeId) || { id: cr.employeeId, name: '', empNo: '' }; const last = ap.chain.filter((s) => s.status === 'rejected' || s.status === 'changes_requested').pop();
    st.patch('changeRequests', cr.id, { status: status || 'rejected', decisionReason: last ? last.reason : '' }); if (cr.scId) st.patch('salaryChanges', cr.scId, { status: 'rejected' });
    SA.audit('HR.CHG.REJECTED', { target: empTgt(e), reason: last ? last.reason : '', after: { id: cr.id } }); SA.notify({ title: 'رُفض طلب التغيير ' + cr.id, body: last && last.reason ? last.reason : '', level: 'info', toUsers: [cr.requestedBy], link: '#/hr/changes/' + cr.id });
  }
  function applyDue() { col('changeRequests').filter((c) => c.status === 'scheduled' && c.effectiveFrom <= today()).forEach((c) => { applyChange(c); }); }
  function reconcile() {
    if (!ensure()) return; if (!me()) return; const aps = col('approvals'); const ap = (id) => aps.find((a) => a.id === id);
    col('changeRequests').slice().forEach((cr) => { if (cr.status !== 'in_approval' || !cr.approvalId) return; const a = ap(cr.approvalId); if (!a) return; if (a.status === 'approved') markApproved(cr); else if (a.status === 'rejected') markRejected(cr, a); else if (a.status === 'changes_requested') markRejected(cr, a, 'returned'); });
    col('chargebacks').slice().forEach((cb) => { if (cb.status !== 'pending_approval' || !cb.approvalId) return; const a = ap(cb.approvalId); if (!a) return; if (a.status === 'approved') cbApproved(cb); else if (a.status === 'rejected') cbRejected(cb, a); });
    col('ctrActions').slice().forEach((c) => { if (c.status !== 'in_approval' || !c.approvalId) return; const a = ap(c.approvalId); if (!a) return; if (a.status === 'approved') ctrApproved(c); else if (a.status === 'rejected') { st.patch('ctrActions', c.id, { status: 'rejected' }); SA.notify({ title: 'رُفض طلب مقاولين: ' + c.title, level: 'info', toUsers: [c.requestedBy], link: '#/hr/contractors' }); } });
    applyDue(); bankTick(); probTick();
  }
  /* ── screens ── */
  function renderChanges(root, ctx) {
    ensure(); probTick(); const a = ctx.path[0];
    if (a === 'new') return renderChangeWizard(root, ctx);
    ctx.setCrumbs([{ label: 'الموظفون' }, { label: 'التغييرات الوظيفية' }]); let tab = ctx.params.tab || (col('changeRequests').some(myTurn) ? 'mine' : 'all'); let drawerRef = null; let leaving = false;
    root.append(SA.pageHead({ title: 'التغييرات الوظيفية', desc: 'نقل · ترقية · درجة · مرتب · مسمى · وردية · إيقاف — طلب واحد بتاريخ سريان، يمر على سلسلة اعتماد في صندوق الاعتمادات المشترك، ثم يولّد خطابًا وأثرًا في الملف والمرتبات.', tags: [SA.tag('new'), SA.tag('open', 'حدود الاعتماد D7')], actions: [SA.btn({ label: 'طلب تغيير', icon: 'plus', kind: 'accent', perm: 'hr.changes.create', onClick: () => SA.nav('hr/changes/new') })] }));
    return loadGate(root, 'table', (host) => {
      const vis = (c) => canSee(c.employeeId) || (c.requestedBy === me().id); const all = () => col('changeRequests').filter(vis);
      const mine = () => all().filter(myTurn); const mineReq = () => all().filter((c) => c.requestedBy === me().id);
      const tabs = SA.tabs({ label: 'صندوق التغييرات', active: tab, tabs: [{ id: 'mine', label: 'أنا لازم أتصرف', badge: mine().length || null }, { id: 'req', label: 'طلباتي', badge: mineReq().length || null }, { id: 'all', label: 'الكل', badge: all().length }], onChange: (id) => { tab = id; drawTable(); } });
      const kpis = h('div.sap-grid-cards', { style: { marginBottom: '14px' } }); const box = h('div');
      host.append(kpis, h('div.sap-pp-tabs-wrap', {}, tabs.el), box);
      function drawKpis() { SA.clear(kpis); const l = all(); kpis.append(SA.kpi('في الاعتماد', l.filter((c) => c.status === 'in_approval').length), SA.kpi('مجدولة', l.filter((c) => c.status === 'scheduled').length), SA.kpi('سارية هذا الشهر', l.filter((c) => c.status === 'effective' && (c.appliedAt || '').slice(0, 7) === today().slice(0, 7)).length), SA.kpi('مرفوضة / ملغاة', l.filter((c) => ['rejected', 'cancelled'].indexOf(c.status) >= 0).length)); }
      let table = null;
      function drawTable() { SA.clear(box); const src = tab === 'mine' ? mine : tab === 'req' ? mineReq : all;
        table = SA.table({ rowId: 'id', pageSize: 10, caption: 'طلبات التغيير', rows: () => src().slice().sort((x, y) => y.createdAt.localeCompare(x.createdAt)), search: { placeholder: 'بحث بالرقم أو الموظف…', keys: (c, q) => c.id.toLowerCase().indexOf(q) >= 0 || ((emp(c.employeeId) || {}).name || '').indexOf(q) >= 0 },
          filters: [{ key: 'type', label: 'النوع', options: Object.keys(CHG_TYPES).filter((k) => ['profile', 'import_salary'].indexOf(k) < 0).map((k) => [k, CHG_TYPES[k].label]) }, { key: 'status', label: 'الحالة', options: Object.keys(CHG_STATUS).map((k) => [k, CHG_STATUS[k][0]]) }],
          columns: [{ key: 'id', label: 'الطلب', sort: true, render: (c) => h('b.num', {}, c.id) }, { key: 'employeeId', label: 'الموظف', render: (c) => { const e = emp(c.employeeId); return e ? empCell(e, deptName(e.departmentId)) : c.employeeId; } }, { key: 'type', label: 'النوع', render: (c) => SA.chip((CHG_TYPES[c.type] || {}).label || c.type, 'info') }, { key: 'brief', label: 'التغيير', render: (c) => chgBrief(c) }, { key: 'effectiveFrom', label: 'السريان', sort: true, render: (c) => h('span.num', {}, SA.fmt.date(c.effectiveFrom)) }, { key: 'requestedBy', label: 'الطالب', render: (c) => SA.userName(c.requestedBy) }, { key: 'status', label: 'الحالة', render: (c) => stChip(CHG_STATUS, c.status) }, { key: 'step', label: 'الخطوة', render: (c) => { const ap = col('approvals').find((x) => x.id === c.approvalId); return ap ? h('span.num', {}, c.status === 'in_approval' ? ap.currentStep + ' / ' + ap.chain.length : ap.chain.length + ' / ' + ap.chain.length) : '—'; } }],
          onRowClick: (c) => { drawerRef = openChgDrawer(c.id, () => { if (!leaving) history.replaceState(null, '', '#/hr/changes'); }); history.replaceState(null, '', '#/hr/changes/' + c.id); },
          empty: { icon: 'swap', title: tab === 'mine' ? 'لا شيء ينتظر قرارك' : 'لا توجد طلبات تغيير', text: tab === 'mine' ? 'عند وصول خطوة اعتماد لدورك تظهر هنا (والقرار نفسه من صندوق الاعتمادات).' : 'ابدأ بطلب تغيير لموظف.', action: { label: 'طلب تغيير', icon: 'plus', perm: 'hr.changes.create', onClick: () => SA.nav('hr/changes/new') } } });
        box.append(h('div.card.card-flush.sap-listcard', {}, table.el)); }
      drawKpis(); drawTable();
      if (a) { if (col('changeRequests').some((c) => c.id === a)) drawerRef = openChgDrawer(a, () => { if (!leaving) history.replaceState(null, '', '#/hr/changes'); }); else SA.toast('الطلب غير موجود', 'error'); }
      const offs = ['changeRequests', 'approvals', 'employees'].map((p) => st.subscribe(p, () => { if (!host.isConnected) return; drawKpis(); tabs.setBadge('mine', mine().length || null); tabs.setBadge('all', all().length); table && table.refresh(); }));
      return () => { leaving = true; offs.forEach((o) => o()); if (drawerRef) drawerRef.close(); };
    });
  }
  function openChgDrawer(id, onClose) {
    let d; const body = h('div.sap-pp-stack');
    function draw() {
      const cr = col('changeRequests').find((c) => c.id === id); SA.clear(body); if (!cr) { body.append(SA.empty({ icon: 'search', title: 'الطلب غير موجود' })); return; } const e = emp(cr.employeeId); const ap = col('approvals').find((x) => x.id === cr.approvalId);
      const rows = chgRows(cr); const steps = ap ? ap.chain : [];
      body.append(e ? personLine(e) : null, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, SA.chip((CHG_TYPES[cr.type] || {}).label, 'info'), stChip(CHG_STATUS, cr.status), cr.retro ? SA.chip('أثر رجعي', 'warning') : null),
        SA.card({ title: 'الفرق (قبل / بعد)' }, h('div.sap-pp-diff', {}, h('b', {}, 'الحقل'), h('b', {}, 'قبل'), h('b', {}, 'بعد'), rows.map((r) => [h('span', {}, r[0], r[3] !== 'T1' ? tierBadge(r[3]) : null), h('span.before', {}, rowVal(r[1], r[3])), h('span.after', {}, rowVal(r[2], r[3]))])), cr.salary && !canSal() ? note('lock', 'المبالغ سرية (T3) — لا تملك hr.salary.view. المعتمد بدونها يرى النسبة/الدرجة فقط إن فُعّل show_delta_to_approvers {Open}.') : null),
        SA.kv([['تاريخ السريان', h('span.num', {}, SA.fmt.date(cr.effectiveFrom))], ['الطالب', SA.userName(cr.requestedBy)], ['السبب', cr.reason || '—'], ['تاريخ الطلب', SA.fmt.dt(cr.createdAt)], cr.decisionReason ? ['سبب القرار', cr.decisionReason] : null, cr.type === 'suspend' ? ['حد الإيقاف', SA.demoValue((S().suspensionMaxDays || 60) + ' يوم') ] : null]),
        steps.length ? SA.card({ title: 'سلسلة الاعتماد' }, h('ul.sap-pp-chain', {}, steps.map((s, i) => h('li' + (s.status === 'approved' ? '.is-ok' : s.status === 'pending' ? '.is-now' : s.status === 'rejected' ? '.is-no' : ''), {}, h('span.n', {}, i + 1), h('div', { style: { flex: 1 } }, h('b', {}, s.label), h('div.t-muted', { style: { fontSize: 'var(--text-caption)' } }, s.status === 'approved' ? 'اعتمد: ' + SA.userName(s.decidedBy) : s.status === 'rejected' ? 'رفض: ' + SA.userName(s.decidedBy) + (s.reason ? ' — ' + s.reason : '') : s.status === 'pending' ? 'بانتظار القرار' : s.status === 'skipped' ? 'تم التخطي' : 'في الانتظار')), SA.statusChip('approval', s.status === 'waiting' ? 'pending' : s.status))), h('p.sap-hint', { style: { marginTop: '10px' } }, SA.icon('shield', 'icon-sm'), h('span', {}, 'فصل المهام: الطالب لا يعتمد، والموظف موضوع الطلب لا يعتمد، ولا يظهر شخص في خطوتين.')))) : null,
        cr.letterId ? h('div', {}, SA.btn({ label: 'عرض الخطاب (DOC-HR-28)', icon: 'doc', kind: 'ghost', reason: cr.salary && !canSal() ? 'الخطاب يحتوي مبالغ T3 — يحتاج hr.salary.view' : '', onClick: () => { const l = st.find('hrLetters', cr.letterId); if (l) showLetter(l); } })) : null);
      d.foot.replaceChildren(...[h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close() }, 'إغلاق'), ap && SA.can('sa.approvals.view') ? h('a.btn.btn-ghost', { href: SA.link.approval(ap.id) }, SA.icon('inbox', 'icon-sm'), 'فتح في صندوق الاعتمادات') : null, ['in_approval', 'scheduled', 'returned'].indexOf(cr.status) >= 0 ? SA.btn({ label: 'إلغاء الطلب', icon: 'xcircle', kind: 'danger', reason: !(isMgr() || cr.requestedBy === me().id) ? 'للطالب أو HR Manager فقط' : '', onClick: () => cancelChange(cr) }) : null].filter(Boolean));
    }
    d = SA.drawer({ title: 'طلب تغيير ' + id, subtitle: 'مراجعة الفرق وسلسلة الاعتماد', size: 'lg', body, foot: [h('span')], onClose: () => { offs.forEach((o) => o()); if (onClose) onClose(); } });
    const offs = ['changeRequests', 'approvals', 'employees'].map((p) => st.subscribe(p, () => { if (body.isConnected) draw(); })); draw(); return d;
  }
  async function cancelChange(cr) {
    const e = emp(cr.employeeId); const r = await SA.confirm({ title: 'إلغاء الطلب ' + cr.id, danger: true, confirmLabel: 'إلغاء الطلب', reasonRequired: true, impact: [cr.status === 'in_approval' ? 'يُغلق طلب الاعتماد في الصندوق المشترك كـ«مرفوض/مسحوب».' : 'يُلغى التغيير المجدول قبل سريانه.', 'بعد السريان لا إلغاء — تصحيح بطلب جديد فقط.'] }); if (!r.ok) return;
    const x = await run(() => { st.patch('changeRequests', cr.id, { status: 'cancelled', decisionReason: r.reason }); if (cr.scId) st.patch('salaryChanges', cr.scId, { status: 'rejected' }); const ap = col('approvals').find((a) => a.id === cr.approvalId); if (ap && ap.status === 'pending') st.update('approvals', (l) => { const q = l.find((z) => z.id === ap.id); q.status = 'rejected'; q.updatedAt = nowIso(); const cur = q.chain[q.currentStep - 1]; if (cur) { cur.status = 'rejected'; cur.decidedBy = me().id; cur.decidedAt = nowIso(); cur.reason = 'سحب الطلب: ' + r.reason; } }); deliver('HR.CHG.CANCELLED', empTgt(e || { id: cr.employeeId, name: '', empNo: '' }), { reason: r.reason, after: { id: cr.id } }); }); if (x.ok) SA.toast('تم إلغاء الطلب', 'success');
  }
  /* ── wizard ── */
  function renderChangeWizard(root, ctx) {
    ctx.setCrumbs([{ label: 'الموظفون' }, { label: 'التغييرات الوظيفية', href: SA.href('hr/changes') }, { label: 'طلب تغيير' }]);
    const den = SA.guard('hr.changes.create'); if (den) { root.append(den); return; }
    root.append(SA.pageHead({ title: 'طلب تغيير وظيفي', desc: 'أربع خطوات: النوع والموظف ← التفاصيل ← المراجعة وسلسلة الاعتماد ← إرسال. لا يعتمد الطالب طلبه.', back: { href: SA.href('hr/changes'), label: 'الصندوق' } }));
    const S0 = { step: 0, type: ctx.params.type || '', empId: ctx.params.emp || '', vals: {} }; const host = h('div.card.sap-wizard'); root.append(host);
    const allowed = (k) => k === 'salary' ? SA.can('hr.salary.change.request') : k === 'suspend' || k === 'return' ? isMgr() : true;
    const whyNot = (k) => (k === 'salary' ? permReason('hr.salary.change.request') : k === 'suspend' || k === 'return' ? 'قرار HR Manager + GM (hr.changes.approve)' : '');
    let fields = {}; let grp = null;
    function buildFields() {
      const e = emp(S0.empId); const t = S0.type; fields = {}; const v = S0.vals;
      const dt = F({ name: 'effectiveFrom', label: 'تاريخ السريان', type: 'date', required: true, value: v.effectiveFrom || today(), rules: [dateRule], hint: 'قبل ' + SA.fmt.date(monthStart()) + ' يعتبر أثرًا رجعيًا: يحتاج Finance وسببًا وينتج فروقًا.' }); const reason = F({ name: 'reason', label: 'السبب', type: 'textarea', required: true, value: v.reason || '', full: true });
      if (t === 'transfer') { fields.departmentId = F({ name: 'departmentId', label: 'القسم الجديد', type: 'select', required: true, options: opt(deptOpts().filter((d) => d[0] !== e.departmentId), 'اختر…'), value: v.departmentId || '' }); fields.managerEmpId = F({ name: 'managerEmpId', label: 'المدير المباشر الجديد', type: 'select', options: opt(empOpts((x) => x.status !== 'terminated' && x.id !== e.id), 'بدون'), value: v.managerEmpId || e.managerEmpId || '' }); }
      if (t === 'promotion') { fields.positionId = F({ name: 'positionId', label: 'الوظيفة الجديدة', type: 'select', required: true, options: opt(posOpts().filter((p) => p[0] !== e.positionId), 'اختر…'), value: v.positionId || '' }); fields.title = F({ name: 'title', label: 'المسمى (اختياري)', value: v.title || '' }); fields.grade = F({ name: 'grade', label: 'الدرجة (اختياري)', value: v.grade || '' }); }
      if (t === 'grade') fields.grade = F({ name: 'grade', label: 'الدرجة الجديدة', required: true, value: v.grade || '', hint: 'الدرجات {Open}' });
      if (t === 'title') fields.title = F({ name: 'title', label: 'المسمى الجديد', required: true, value: v.title || '', hint: 'بدون أثر مالي — يولّد خطابًا مع ذلك.' });
      if (t === 'shift_group') fields.shift = F({ name: 'shift', label: 'الوردية الجديدة', type: 'select', required: true, options: opt(Object.keys(SHIFT).filter((k) => k !== e.shift).map((k) => [k, SHIFT[k]]), 'اختر…'), value: v.shift || '' });
      if (t === 'suspend') fields.days = F({ name: 'days', label: 'مدة الإيقاف (يوم)', type: 'number', required: true, min: 1, value: v.days || '', hint: 'الحد ' + (S().suspensionMaxDays || 60) + ' يوم بأجر كامل أثناء التحقيق [Law Arts. 145–147 · Pending]؛ التمديد بأمر قاضٍ فقط.' });
      if ((t === 'salary' || (t === 'promotion' && SA.can('hr.salary.change.request'))) && canSal()) { fields.basic = F({ name: 'basic', label: 'المرتب الأساسي الجديد (T3)', type: 'number', required: t === 'salary', min: 0, value: v.basic || '', hint: 'الحالي: ' + SA.fmt.money(e.salary.basic) }); fields.allow = F({ name: 'allow', label: 'البدلات الجديدة (اختياري)', type: 'number', min: 0, value: v.allow == null ? '' : v.allow }); }
      fields.effectiveFrom = dt; fields.reason = reason; grp = SA.form.group(Object.values(fields));
    }
    const needsSal = () => S0.type === 'salary' || (S0.type === 'promotion' && S0.vals.basic);
    function buildCr() {
      const e = emp(S0.empId); const v = S0.vals; const t = S0.type; const cr = { type: t, employeeId: e.id, requestedBy: me().id, reason: v.reason, effectiveFrom: v.effectiveFrom, before: {}, after: {}, salary: null, retro: v.effectiveFrom < monthStart() };
      if (t === 'transfer') { cr.before = { departmentId: e.departmentId, managerEmpId: e.managerEmpId }; cr.after = { departmentId: v.departmentId, managerEmpId: v.managerEmpId || null }; }
      if (t === 'promotion') { cr.before = { positionId: e.positionId, title: e.titleOverride || posTitle(e.positionId), grade: e.grade || null }; cr.after = { positionId: v.positionId }; if (v.title) cr.after.title = v.title; if (v.grade) cr.after.grade = v.grade; }
      if (t === 'grade') { cr.before = { grade: e.grade || null }; cr.after = { grade: v.grade }; } if (t === 'title') { cr.before = { title: e.titleOverride || posTitle(e.positionId) }; cr.after = { title: v.title }; }
      if (t === 'shift_group') { cr.before = { shift: e.shift }; cr.after = { shift: v.shift }; } if (t === 'suspend') cr.after = { days: v.days }; if (t === 'return') cr.after = {};
      if (needsSal() && v.basic != null && v.basic !== '') cr.salary = { from: e.salary.basic, to: +v.basic, allowFrom: e.salary.allowances, allowTo: v.allow === '' || v.allow == null ? null : +v.allow }; return cr;
    }
    function checks(cr) {
      const e = emp(cr.employeeId); const out = []; const open = col('changeRequests').find((c) => c.employeeId === e.id && c.type === cr.type && ['in_approval', 'scheduled', 'approved'].indexOf(c.status) >= 0);
      out.push(open ? ['bad', 'يوجد طلب ' + open.id + ' من نفس النوع مفتوح لهذا الموظف (BR-CHG-13).'] : ['ok', 'لا طلب مفتوح من نفس النوع.']);
      const sb = sodBlock(null, e); out.push(sb ? ['bad', sb] : ['ok', 'فصل المهام: الطالب (' + me().name + ') ≠ الموظف.']);
      if (cr.salary) { const tot = cr.salary.to + (cr.salary.allowTo != null ? cr.salary.allowTo : e.salary.allowances); out.push(cr.salary.to <= 0 || tot < S().minWage ? ['bad', 'الإجمالي الجديد أقل من الحد الأدنى للأجور المُعدّ (' + SA.fmt.money(S().minWage) + ') — أساس المقارنة {Open}.'] : ['ok', 'الإجمالي الجديد ≥ الحد الأدنى للأجور المُعدّ.']); if (cr.salary.to === cr.salary.from) out.push(['bad', 'المرتب الجديد مطابق للحالي.']); }
      if (cr.type === 'shift_group') { const g = gateOf(e.id); if (cr.after.shift !== 'day' && isProdEmp(e) && !g.open) out.push(['bad', 'الوردية الجديدة على خط إنتاج وبوابة السلامة مقفولة (BR-CHG-07/10).']); else out.push(['warn', 'قد تخالف حد الراحة بين الورديات — يُراجع في الجداول (HR-09).']); }
      if (cr.type === 'suspend') { const mx = S().suspensionMaxDays || 60; out.push(cr.after.days > mx ? ['bad', 'المدة أكبر من ' + mx + ' يوم — يحتاج أمر قاضٍ [Law].'] : ['ok', 'ضمن حد الإيقاف المُعدّ، بأجر كامل.']); if (['active', 'probation'].indexOf(e.status) < 0) out.push(['bad', 'الموظف ليس على رأس العمل.']); if (sickBlock(e.id)) out.push(['bad', 'إجازة مرضية مثبتة — حظر آلي.']); }
      if (cr.type === 'return' && e.status !== 'suspended') out.push(['bad', 'الموظف غير موقوف.']);
      if (cr.retro) out.push(['warn', 'أثر رجعي قبل بداية الشهر — يحتاج Finance وسببًا ويُنتج فروقًا للمرتبات.']);
      if (cr.type === 'transfer' && cr.after.departmentId === e.departmentId) out.push(['bad', 'القسم الجديد مطابق للحالي.']);
      return out;
    }
    function draw() {
      SA.clear(host); host.append(h('div.sap-wiz-steps', {}, SA.stepper(['النوع والموظف', 'التفاصيل', 'المراجعة والإرسال'], S0.step)));
      const panel = h('div.sap-wiz-panel'); const foot = h('div.sap-wiz-foot'); host.append(panel, foot);
      if (S0.step === 0) {
        const sel = F({ name: 'emp', label: 'الموظف', type: 'select', required: true, options: opt(empOpts((e) => ['active', 'probation', 'suspended'].indexOf(e.status) >= 0 && canSee(e.id)), 'اختر الموظف…'), value: S0.empId });
        panel.append(h('h2.sap-h2', {}, 'نوع التغيير'), h('div.sap-pp-cal', { style: { marginBottom: '16px' } }, Object.keys(CHG_TYPES).filter((k) => ['profile', 'import_salary'].indexOf(k) < 0).map((k) => { const ok = allowed(k); return h('button.sap-ecard-btn.sap-pp-ecard', { type: 'button', 'aria-pressed': String(S0.type === k), title: ok ? '' : whyNot(k), style: { opacity: ok ? 1 : 0.55, borderColor: S0.type === k ? 'var(--eg-navy)' : '', background: S0.type === k ? 'var(--color-primary-tint)' : '' }, onclick: () => { if (!ok) { SA.toast(whyNot(k), 'warn'); return; } S0.type = k; S0.vals = {}; draw(); } }, h('div.sap-pp-ecard-top', {}, SA.icon(ok ? CHG_TYPES[k].icon : 'lock'), h('b', {}, CHG_TYPES[k].label)), h('small', {}, CHG_TYPES[k].desc)); })), sel.el);
        foot.append(h('a.btn.btn-ghost', { href: SA.href('hr/changes') }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: () => { if (!S0.type) { SA.toast('اختر نوع التغيير', 'warn'); return; } if (!sel.validate()) return; const e = emp(sel.get()); const sb = sodBlock(null, e); if (sb) { SA.toast(sb, 'error', { ms: 6500 }); deliver('HR.CHG.SOD_BLOCKED', empTgt(e), { result: 'denied', reason: sb }); return; } if (S0.type === 'return' && e.status !== 'suspended') { SA.toast('الموظف غير موقوف.', 'error'); return; } if (S0.type === 'suspend' && e.status === 'suspended') { SA.toast('الموظف موقوف بالفعل.', 'error'); return; } S0.empId = e.id; buildFields(); S0.step = 1; draw(); } }, 'التالي', SA.icon('arrowleft', 'icon-sm')));
      } else if (S0.step === 1) {
        const e = emp(S0.empId); buildFields();
        panel.append(h('h2.sap-h2', {}, CHG_TYPES[S0.type].label + ' — ' + e.name), personLine(e), h('div.sap-formgrid', { style: { marginTop: '14px' } }, Object.values(fields).map((f) => { if (f.full) f.el.style.gridColumn = '1 / -1'; return f.el; })), S0.type === 'salary' && !canSal() ? SA.alert('warning', 'لا تملك hr.salary.view — لا يمكن تحديد مبالغ المرتب.') : null, S0.type === 'return' ? SA.alert('info', 'العودة تحتاج قرار HR Manager؛ تُستأنف الأرصدة دون فقد (BR-CHG-09).') : null);
        foot.append(h('button.btn.btn-ghost', { type: 'button', onclick: () => { S0.step = 0; draw(); } }, SA.icon('arrowright', 'icon-sm'), 'السابق'), h('button.btn.btn-primary', { type: 'button', onclick: () => { if (!grp.validate()) return; const raw = grp.get(); if (S0.type === 'suspend' && (!raw.days || raw.days < 1)) { fields.days.error('أدخل مدة الإيقاف'); return; } S0.vals = Object.assign({}, S0.vals, raw); S0.step = 2; draw(); } }, 'مراجعة', SA.icon('arrowleft', 'icon-sm')));
      } else {
        const cr = buildCr(); const e = emp(cr.employeeId); const ch = checks(cr); const chain = chainFor(cr); const bad = ch.some((c) => c[0] === 'bad');
        panel.append(h('h2.sap-h2', {}, 'مراجعة وإرسال'), h('div.sap-pp-grid2', {}, h('div.sap-pp-stack', {}, personLine(e), h('div.sap-pp-diff', {}, h('b', {}, 'الحقل'), h('b', {}, 'قبل'), h('b', {}, 'بعد'), chgRows(cr).map((r) => [h('span', {}, r[0]), h('span.before', {}, rowVal(r[1], r[3])), h('span.after', {}, rowVal(r[2], r[3]))])), SA.kv([['السريان', SA.fmt.date(cr.effectiveFrom)], ['السبب', cr.reason]])),
          h('div.sap-pp-stack', {}, SA.card({ title: 'فحوص قبل الإرسال' }, h('div.sap-pp-stack', {}, ch.map((c) => h('div.sap-alert.alert.alert-' + (c[0] === 'ok' ? 'success' : c[0] === 'warn' ? 'warning' : 'danger'), {}, SA.icon(c[0] === 'ok' ? 'checkcircle' : 'alert'), h('div', {}, c[1]))))), SA.card({ title: 'سلسلة الاعتماد المتوقعة' }, h('ul.sap-pp-chain', {}, chain.map((s, i) => h('li', {}, h('span.n', {}, i + 1), h('b', {}, s.label)))), h('p.sap-hint', { style: { marginTop: '8px' } }, SA.icon('info', 'icon-sm'), h('span', {}, 'الحدود المالية {Open} (D7). القرار يتم من صندوق الاعتمادات المشترك.'))))));
        foot.append(h('button.btn.btn-ghost', { type: 'button', onclick: () => { S0.step = 1; draw(); } }, SA.icon('arrowright', 'icon-sm'), 'السابق'), SA.btn({ label: 'إرسال للاعتماد', icon: 'check', kind: 'accent', reason: bad ? 'عالج الفحوص الحمراء أولًا' : '', onClick: () => submit(cr) }));
      }
    }
    async function submit(cr) {
      const e = emp(cr.employeeId); let rec; const r = await run(() => {
        cr.id = nextSeq('changeRequests', 'CHG', 4, true); cr.status = 'in_approval'; cr.createdAt = nowIso(); cr.approvalId = null; cr.scId = null; cr.letterId = null;
        if (cr.salary) { const sc = { id: nextSeq('salaryChanges', 'SC', 4, true), employeeId: e.id, fromBasic: cr.salary.from, toBasic: cr.salary.to, requestedBy: me().id, status: 'pending', approvalId: null, createdAt: nowIso() }; st.insert('salaryChanges', sc); cr.scId = sc.id; }
        st.insert('changeRequests', cr, true); const chain = chainFor(cr);
        const ap = SA.requestApproval({ type: cr.salary ? 'salary_change' : 'job_change', title: CHG_TYPES[cr.type].label + ': ' + e.name + (cr.type === 'transfer' ? ' إلى ' + deptName(cr.after.departmentId) : cr.type === 'promotion' ? ' (ترقية)' : ''), requesterId: me().id, chain, context: [['الموظف', e.name + ' (' + e.empNo + ')'], ['النوع', CHG_TYPES[cr.type].label], ['تاريخ السريان', SA.fmt.date(cr.effectiveFrom)], ['السبب', cr.reason], ['الأثر المالي', cr.salary ? 'نعم — المبالغ سرية (hr.salary.view)' : 'لا'], ['ملاحظة', 'الطالب والموظف لا يعتمدان (فصل المهام). الحدود المالية {Open} (D7).']].concat(cr.retro ? [['تنبيه', 'أثر رجعي — يحتاج Finance وسببًا']] : []), ref: cr.salary ? { type: 'salary_change', id: cr.scId } : { type: 'job_change', id: cr.id } });
        st.patch('changeRequests', cr.id, { approvalId: ap.id }); if (cr.scId) st.patch('salaryChanges', cr.scId, { approvalId: ap.id }); rec = Object.assign({}, cr, { approvalId: ap.id });
        deliver('HR.CHG.REQUESTED', empTgt(e), { after: { id: cr.id, type: cr.type, effectiveFrom: cr.effectiveFrom, approval: ap.id }, reason: cr.reason }); if (cr.salary) deliver('HR.SALARY.CHANGE_REQUESTED', empTgt(e), { after: { id: cr.scId, approval: ap.id }, reason: cr.reason });
      }); if (!r.ok) return; SA.toast('أُرسل الطلب ' + rec.id + ' إلى ' + chainFor(rec)[0].label, 'success', { ms: 6000 }); SA.nav('hr/changes/' + rec.id);
    }
    if (S0.empId && emp(S0.empId) && S0.type && allowed(S0.type)) { const e = emp(S0.empId); if (!sodBlock(null, e) && canSee(e.id)) { buildFields(); S0.step = 1; } else { S0.empId = ''; } } else if (S0.type && !allowed(S0.type)) { SA.toast(whyNot(S0.type), 'warn'); S0.type = ''; }
    draw(); return null;
  }

  /* ═════════════════════════ HR-08 · العهدة والزي وPPE ═════════════════════════ */
  const CAT = { ppe: 'معدات وقاية PPE', uniform: 'زي', tool: 'أدوات', id_card: 'كارنيه', key: 'مفاتيح', device: 'أجهزة' };
  const CB_ST = { reported: ['بلاغ — بدون اقتراح', 'warning'], pending_approval: ['بانتظار اعتماد الخصم', 'warning'], approved: ['خصم معتمد', 'danger'], waived: ['مُعفى', 'neutral'], written_off: ['مشطوب', 'neutral'], rejected: ['مرفوض', 'neutral'] };
  const flatLines = () => { const out = []; col('custodyIssues').forEach((i) => i.lines.forEach((l) => out.push(Object.assign({ slip: i, lineId: l.id }, l)))); return out; };
  const monthsAdd = (n) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
  function capOf(e, item) { const s = S(); const monthly = (s.chargebackCapDays || 0) * (e.salary.basic || 0) / 30; return { monthly, total: monthly * (s.chargebackCapMonths || 0) }; }
  function chargeCalc(e, value, depPct) {
    const net = Math.round(value * (1 - depPct / 100) * 100) / 100; const cap = capOf(e); let rest = Math.min(net, cap.total); const schedule = []; let m = 1;
    while (rest > 0.009 && schedule.length < (S().chargebackCapMonths || 1)) { const a = Math.min(rest, cap.monthly); schedule.push({ month: monthsAdd(m++), amount: Math.round(a * 100) / 100 }); rest -= a; }
    const ded = schedule.reduce((s, x) => s + x.amount, 0); return { net, cap, schedule, deductible: Math.round(ded * 100) / 100, notDeductible: Math.round((net - ded) * 100) / 100 };
  }
  function cbApproved(cb) {
    const e = emp(cb.employeeId); st.patch('chargebacks', cb.id, { status: 'approved', approvedAt: nowIso() }); const lt = letter('chargeback', e, cb.id, 'إخطار خصم فقد/تلف عهدة', ['السيد/ة ' + e.name + '،', 'نحيطكم علمًا بأنه تقرر خصم قيمة العهدة المفقودة/التالفة (' + itemOf(cb.itemId).name + ') وفق الجدول المعتمد وفي حدود السقف القانوني المُعدّ، ولكم حق الاعتراض خلال المدة {Open} يومًا.', 'وتفضلوا بقبول فائق الاحترام.']); lt.docNo = 'DOC-HR-24'; st.patch('hrLetters', lt.id, { docNo: 'DOC-HR-24' });
    SA.audit('HR.CST.CHARGEBACK_APPROVED', { target: empTgt(e), after: { id: cb.id, months: cb.schedule.length }, reason: 'اعتماد من صندوق الاعتمادات' }); SA.notify({ title: 'خصم عهدة معتمد: ' + e.name, body: 'جدول الخصم جاهز للمرتبات (' + cb.schedule.length + ' شهر).', level: 'action', to: ['R-13', 'R-07'], toUsers: e.userId ? [e.userId] : [], link: '#/hr/custody' });
  }
  function cbRejected(cb) { const e = emp(cb.employeeId); st.patch('chargebacks', cb.id, { status: 'waived' }); st.update('custodyIssues', (l) => l.forEach((i) => i.lines.forEach((x) => { if (x.id === cb.lineId) x.status = 'written_off'; }))); SA.audit('HR.CST.CHARGEBACK_WAIVED', { target: empTgt(e), after: { id: cb.id }, reason: 'رفض اعتماد الخصم' }); }
  const itemOpts = () => col('custodyItems').map((i) => [i.id, i.name]);

  function renderCustody(root, ctx) {
    ensure(); probTick(); ctx.setCrumbs([{ label: 'الموظفون' }, { label: 'العهدة والزي' }]); let tab = ctx.params.tab || 'ledger';
    root.append(SA.pageHead({ title: 'العهدة والزي وPPE', desc: 'كل صرف بإيصال موقّع ومقاس ودورة استبدال. الفقد يمر على حاسبة السقف القانوني والاعتماد. PPE مجاني ولا يُخصم ثمنه.', tags: [SA.tag('new'), SA.tag('pending', 'السقف Law · Pending')], actions: [SA.btn({ label: 'الإعدادات', icon: 'settings', kind: 'ghost', perm: 'hr.settings.edit', onClick: peopleSettingsDialog }), SA.btn({ label: 'صرف عهدة', icon: 'box', kind: 'accent', perm: 'hr.custody.edit', onClick: () => issueDialog(null) })] }));
    return loadGate(root, 'table', (host) => {
      const vis = (l) => canSee(l.slip.employeeId);
      const tabs = SA.tabs({ label: 'أقسام العهدة', active: tab, tabs: [{ id: 'ledger', label: 'الدفتر' }, { id: 'due', label: 'الاستحقاقات والمخزون', badge: dueLines().length || null }, { id: 'losses', label: 'الفقد والخصومات', badge: col('chargebacks').filter((c) => ['reported', 'pending_approval'].indexOf(c.status) >= 0).length || null }, { id: 'catalog', label: 'الكتالوج والمصفوفة' }], onChange: (id) => { tab = id; history.replaceState(null, '', '#/hr/custody' + (id === 'ledger' ? '' : '?tab=' + id)); drawBody(); } });
      const body = h('div'); host.append(h('div.sap-pp-tabs-wrap', {}, tabs.el), body);
      function drawBody() { SA.clear(body); ({ ledger: ledgerTab, due: dueTab, losses: lossTab, catalog: catalogTab }[tab] || ledgerTab)(body); }
      function ledgerTab(box) {
        const t = SA.table({ rowId: 'lineId', pageSize: 10, caption: 'دفتر العهدة', rows: () => flatLines().filter(vis).sort((a, b) => b.slip.issuedAt.localeCompare(a.slip.issuedAt)), search: { placeholder: 'بحث بالموظف أو الصنف أو الإيصال…', keys: (l, q) => ((emp(l.slip.employeeId) || {}).name || '').indexOf(q) >= 0 || itemOf(l.itemId).name.indexOf(q) >= 0 || l.slip.id.toLowerCase().indexOf(q) >= 0 },
          filters: [{ key: 'status', label: 'الحالة', options: Object.keys(LINE_ST).map((k) => [k, LINE_ST[k][0]]) }, { key: 'itemId', label: 'الصنف', options: itemOpts() }, { key: 'cat', label: 'الفئة', options: Object.keys(CAT).map((k) => [k, CAT[k]]), test: (l, v) => itemOf(l.itemId).category === v }],
          columns: [{ key: 'emp', label: 'الموظف', render: (l) => { const e = emp(l.slip.employeeId); return e ? empCell(e, deptName(e.departmentId)) : l.slip.employeeId; } }, { key: 'itemId', label: 'الصنف', sort: true, value: (l) => itemOf(l.itemId).name, render: (l) => h('span', {}, itemOf(l.itemId).name, ' ', SA.chip(CAT[itemOf(l.itemId).category] || '', 'neutral')) }, { key: 'size', label: 'المقاس', render: (l) => l.size || '—' }, { key: 'qty', label: 'الكمية', render: (l) => h('span.num', {}, l.qty) }, { key: 'issued', label: 'الصرف', sort: (a, b) => a.slip.issuedAt.localeCompare(b.slip.issuedAt), render: (l) => h('span.num', {}, SA.fmt.date(l.slip.issuedAt), h('br'), h('small.t-muted', {}, l.slip.id)) }, { key: 'due', label: 'الاستبدال المتوقع', sort: (a, b) => String(a.dueReplaceOn || '9').localeCompare(String(b.dueReplaceOn || '9')), render: (l) => (l.dueReplaceOn ? h('span.num', {}, SA.fmt.date(l.dueReplaceOn)) : SA.openValue('غير مُعدّ')) }, { key: 'status', label: 'الحالة', render: (l) => stChip(LINE_ST, l.status) }],
          rowActions: (l) => [{ label: 'عرض الإيصال', icon: 'doc', onClick: () => viewReceipt(l.slip) }, { label: 'استرجاع / استبدال', icon: 'swap', disabled: permReason('hr.custody.edit') || (l.status !== 'issued' ? 'الصنف غير مصروف حاليًا' : ''), onClick: () => returnDialog(l) }, { label: 'ملف الموظف', icon: 'id', onClick: () => SA.nav('hr/employees/' + l.slip.employeeId, { query: { tab: 'custody' } }) }],
          empty: { icon: 'box', title: 'لا توجد عهدة', text: 'ابدأ بصرف أول عهدة بإيصال موقّع.', action: { label: 'صرف عهدة', icon: 'box', perm: 'hr.custody.edit', onClick: () => issueDialog(null) } } });
        box.append(h('div.card.card-flush.sap-listcard', {}, t.el));
      }
      function dueLines() { const n = S().dueReminderDays || 30; return flatLines().filter((l) => vis(l) && l.status === 'issued' && l.dueReplaceOn && daysBetween(today(), l.dueReplaceOn) <= n); }
      function dueTab(box) {
        const d = dueLines(); const over = d.filter((l) => l.dueReplaceOn < today()); const dem = {}; d.forEach((l) => { dem[l.itemId] = (dem[l.itemId] || 0) + l.qty; });
        box.append(h('div.sap-grid-cards', { style: { marginBottom: '14px' } }, SA.kpi('مستحق خلال ' + (S().dueReminderDays || 30) + ' يوم', d.length - over.length), SA.kpi('متأخر الاستبدال', over.length), SA.kpi('أصناف عليها طلب', Object.keys(dem).length)),
          h('div.sap-pp-grid2', {}, SA.card({ title: 'المخزون المطلوب مقابل الرصيد', flush: true }, Object.keys(dem).length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الصنف', 'مطلوب', 'الرصيد', 'الحالة'].map((t) => h('th', {}, t)))), h('tbody', {}, Object.keys(dem).map((k) => { const it = itemOf(k); const short = (it.stock || 0) < dem[k]; return h('tr', {}, h('td', {}, it.name), h('td.num', {}, dem[k]), h('td.num', {}, it.stock), h('td', {}, short ? SA.chip('نقص — اطلب شراء', 'danger') : SA.chip('كافٍ', 'success'))); })))) : SA.empty({ icon: 'checkcircle', title: 'لا استحقاقات', text: 'لا أصناف تحتاج استبدالًا قريبًا.' })), SA.card({ title: 'قوائم الاستبدال', flush: true }, d.length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الموظف', 'الصنف', 'الاستحقاق', ''].map((t) => h('th', {}, t)))), h('tbody', {}, d.sort((a, b) => a.dueReplaceOn.localeCompare(b.dueReplaceOn)).slice(0, 25).map((l) => h('tr', {}, h('td', {}, empLink(emp(l.slip.employeeId) || { id: l.slip.employeeId, name: l.slip.employeeId })), h('td', {}, itemOf(l.itemId).name), h('td', {}, l.dueReplaceOn < today() ? SA.chip('متأخر ' + (-daysBetween(today(), l.dueReplaceOn)) + ' يوم', 'danger') : SA.chip(SA.fmt.date(l.dueReplaceOn), 'warning')), h('td', {}, SA.btn({ label: 'استبدال', icon: 'swap', kind: 'ghost', size: 'sm', perm: 'hr.custody.edit', onClick: () => returnDialog(l, true) }))))))) : SA.empty({ icon: 'checkcircle', title: 'لا شيء مستحق' }))), note('info', 'دورات الاستبدال وأيام التذكير {Open} — قيم الديمو تجريبية وتُعدّل من الكتالوج والإعدادات.'));
      }
      function lossTab(box) {
        const cbs = col('chargebacks').filter((c) => canSee(c.employeeId)); const lost = flatLines().filter((l) => vis(l) && ['lost', 'damaged'].indexOf(l.status) >= 0 && !cbs.some((c) => c.lineId === l.id && c.status !== 'reported'));
        box.append(h('div.sap-grid-cards', { style: { marginBottom: '14px' } }, SA.kpi('بلاغات بدون اقتراح', lost.length), SA.kpi('بانتظار الاعتماد', cbs.filter((c) => c.status === 'pending_approval').length), SA.kpi('خصومات معتمدة', cbs.filter((c) => c.status === 'approved').length)),
          SA.alert('info', 'سقف الخصم: ', SA.demoValue((S().chargebackCapDays || 0) + ' أيام/شهر'), ' ولمدة ', SA.demoValue((S().chargebackCapMonths || 0) + ' شهر'), ' [Law Art. 151 · Pending]. PPE: لا خصم افتراضيًا. المقترِح ≠ المعتمِد.'));
        if (lost.length) box.append(SA.card({ title: 'بلاغات فقد/تلف بانتظار اقتراح الخصم', flush: true }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الموظف', 'الصنف', 'الحالة', ''].map((t) => h('th', {}, t)))), h('tbody', {}, lost.map((l) => h('tr', {}, h('td', {}, empLink(emp(l.slip.employeeId))), h('td', {}, itemOf(l.itemId).name), h('td', {}, stChip(LINE_ST, l.status)), h('td', {}, h('div.sap-pp-pill-row', {}, SA.btn({ label: 'اقتراح خصم', icon: 'coins', kind: 'primary', size: 'sm', perm: 'hr.custody.edit', onClick: () => chargeDialog(l) }), SA.btn({ label: 'شطب', icon: 'trash', kind: 'ghost', size: 'sm', perm: 'hr.changes.approve', reason: permReason('hr.changes.approve'), onClick: () => writeOff(l) }))))))))));
        const t = SA.table({ rowId: 'id', pageSize: 10, caption: 'حالات الخصم', rows: () => col('chargebacks').filter((c) => canSee(c.employeeId)), columns: [{ key: 'id', label: 'الحالة', render: (c) => h('b.num', {}, c.id) }, { key: 'emp', label: 'الموظف', render: (c) => empLink(emp(c.employeeId) || { id: c.employeeId, name: c.employeeId }) }, { key: 'item', label: 'الصنف', render: (c) => itemOf(c.itemId).name }, { key: 'net', label: 'صافي الخصم', render: (c) => (canSal() ? (c.net != null ? h('span.num', {}, SA.fmt.money(c.deductible) + (c.notDeductible ? ' من ' + SA.fmt.money(c.net) : '')) : '—') : secret()) }, { key: 'status', label: 'الحالة', render: (c) => stChip(CB_ST, c.status) }, { key: 'by', label: 'المقترِح', render: (c) => SA.userName(c.proposedBy) }], onRowClick: (c) => cbDrawer(c.id), empty: { icon: 'coins', title: 'لا حالات خصم', text: 'تظهر هنا بلاغات الفقد والتلف المقترح خصمها.' } });
        box.append(h('div.card.card-flush.sap-listcard', { style: { marginTop: '14px' } }, t.el));
      }
      function catalogTab(box) {
        const t = SA.table({ rowId: 'id', pageSize: 12, caption: 'كتالوج العهدة', rows: () => col('custodyItems'), filters: [{ key: 'category', label: 'الفئة', options: Object.keys(CAT).map((k) => [k, CAT[k]]) }], columns: [{ key: 'name', label: 'الصنف', sort: true, render: (i) => h('b', {}, i.name) }, { key: 'category', label: 'الفئة', render: (i) => CAT[i.category] }, { key: 'sizes', label: 'المقاسات', render: (i) => (i.sizes.length ? i.sizes.join('، ') : '—') }, { key: 'cycleMonths', label: 'دورة الاستبدال', render: (i) => (i.cycleMonths ? h('span', {}, h('span.num', {}, i.cycleMonths + ' شهر'), SA.demoValue('')) : SA.openValue('غير مُعدّة')) }, { key: 'unitValue', label: 'القيمة', render: (i) => (i.unitValue ? h('span', {}, canSal() ? SA.fmt.money(i.unitValue) : secret(), SA.demoValue('')) : SA.openValue()) }, { key: 'stock', label: 'الرصيد', render: (i) => h('span.num', {}, i.stock) }, { key: 'ref', label: 'مرجع المعيار', render: (i) => (i.category === 'ppe' ? (i.standardRef || SA.openValue('غير مُعدّ')) : '—') }],
          rowActions: (i) => [{ label: 'تعديل الصنف', icon: 'edit', disabled: permReason('hr.custody.edit'), onClick: () => itemDialog(i) }], toolbar: [SA.btn({ label: 'صنف جديد', icon: 'plus', kind: 'ghost', perm: 'hr.custody.edit', onClick: () => itemDialog(null) })], empty: { icon: 'box', title: 'الكتالوج فاضي' } });
        const posSel = F({ name: 'pos', label: 'الوظيفة', type: 'select', options: posOpts(), value: 'P-08' }); const mbox = h('div'); const drawM = () => { SA.clear(mbox); const p = posSel.get(); const rows = col('custodyMatrix').filter((m) => m.positionId === p); mbox.append(rows.length ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الصنف', 'الكمية', 'إلزامي للوصول'].map((x) => h('th', {}, x)))), h('tbody', {}, rows.map((m) => h('tr', {}, h('td', {}, itemOf(m.itemId).name), h('td.num', {}, m.qty), h('td', {}, m.requiredForAccess ? SA.chip('إلزامي', 'danger') : SA.chip('عادي', 'neutral'))))))) : SA.empty({ icon: 'box', title: 'لا استحقاقات لهذه الوظيفة' }), SA.btn({ label: 'تعديل الاستحقاقات', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'hr.custody.edit', onClick: () => matrixDialog(p) })); }; posSel.input.addEventListener('change', drawM); drawM();
        box.append(h('div.card.card-flush.sap-listcard', {}, t.el), SA.card({ title: 'مصفوفة PPE والزي حسب الوظيفة' }, h('div.sap-pp-stack', {}, posSel.el, mbox, note('lock', 'الأصناف الإلزامية للوصول تتزامن مع قائمة التعيين (HR-05) وتُشترط لفتح بوابة الإنتاج بجانب توعية السلامة.'))));
      }
      drawBody(); if (ctx.params.issue && SA.can('hr.custody.edit')) setTimeout(() => issueDialog(ctx.params.issue), 50);
      const offs = ['custodyIssues', 'chargebacks', 'custodyItems', 'custodyMatrix', 'employees'].map((p) => st.subscribe(p, () => { if (host.isConnected) { tabs.setBadge('due', dueLines().length || null); drawBody(); } })); return () => offs.forEach((o) => o());
    });
  }
  function viewReceipt(slip) { const l = col('hrLetters').find((x) => x.ref === slip.id && x.type === 'custody'); if (l) showLetter(l); else { const e = emp(slip.employeeId); showLetter({ id: 'LET-' + slip.id, type: 'custody', docNo: 'DOC-HR-12', employeeId: slip.employeeId, title: 'إيصال استلام عهدة ' + slip.id, issuedAt: slip.issuedAt, body: ['استلم السيد/ة ' + e.name + ' الأصناف التالية بتاريخ ' + SA.fmt.date(slip.issuedAt) + ':'].concat(slip.lines.map((x) => '— ' + itemOf(x.itemId).name + (x.size ? ' (' + x.size + ')' : '') + ' × ' + x.qty)).concat(['وأقرّ بمسؤوليتي عنها وبإعادتها عند الطلب أو انتهاء الخدمة.']) }); } }
  /* issue */
  function issueDialog(preEmp) {
    const pad = sigPad(); const rowsBox = h('div.sap-pp-stack'); let rows = [];
    const empSel = F({ name: 'emp', label: 'الموظف', type: 'select', required: true, options: opt(empOpts((e) => ['active', 'probation'].indexOf(e.status) >= 0 && canSee(e.id)), 'اختر الموظف…'), value: preEmp || '', onChange: () => fill(), full: true });
    const chan = F({ name: 'chan', label: 'قناة التوقيع', type: 'select', options: [['touch', 'لمس على الشاشة'], ['kiosk', 'كشك/PIN'], ['paper', 'ورقي ممسوح']], value: 'touch' });
    function fill() {
      SA.clear(rowsBox); rows = []; const eid = empSel.get(); const e = emp(eid); if (!e) return; const f = file(eid); const sz = (f && f.sizes) || {}; const need = col('custodyMatrix').filter((m) => m.positionId === e.positionId);
      const have = new Set(); col('custodyIssues').filter((i) => i.employeeId === eid).forEach((i) => i.lines.forEach((l) => { if (['issued', 'replaced'].indexOf(l.status) >= 0) have.add(l.itemId); }));
      col('custodyItems').forEach((it) => { const m = need.find((x) => x.itemId === it.id); const sizeDef = it.id === 'IT-02' ? sz.shoe : it.id === 'IT-06' ? sz.overall : it.id === 'IT-04' ? sz.glove : (it.sizes[0] || '');
        const on = F({ name: 'on', label: it.name, type: 'checkbox', value: !!m && !have.has(it.id) });
        const size = it.sizes.length ? F({ name: 'size', label: 'المقاس', type: 'select', options: it.sizes.map((s) => [s, s]), value: it.sizes.indexOf(sizeDef) >= 0 ? sizeDef : it.sizes[0] }) : null; const qty = F({ name: 'qty', label: 'الكمية', type: 'number', min: 1, value: m ? m.qty : 1 }); const serial = it.requiresSerial ? F({ name: 'serial', label: 'الرقم التسلسلي / IMEI', placeholder: 'مطلوب' }) : null;
        rows.push({ it, on, size, qty, serial }); rowsBox.append(h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(160px,1.3fr) minmax(90px,.7fr) 80px minmax(120px,1fr)', gap: '10px', alignItems: 'end', padding: '8px 0', borderBottom: '1px solid var(--color-border)' } }, h('div', {}, on.el, h('small.t-muted', {}, CAT[it.category] + (m && m.requiredForAccess ? ' · إلزامي للوصول' : '') + (have.has(it.id) ? ' · مصروف سابقًا' : ' · رصيد ' + it.stock))), size ? size.el : h('span'), qty.el, serial ? serial.el : h('span'))); });
    }
    const extra = h('div.sap-pp-stack', {}, h('div', {}, h('b', { style: { fontSize: 'var(--text-dense)' } }, 'الأصناف'), rowsBox), chan.el, h('div', {}, h('b', { style: { fontSize: 'var(--text-dense)' } }, 'توقيع الموظف على الاستلام (إلزامي)'), pad.el));
    const m = formDialog({ title: 'صرف عهدة', subtitle: 'إيصال موقّع برقم CUS- — يخصم رصيد المخزن', icon: 'box', size: 'xl', fields: [empSel], extra, submitLabel: 'صرف وإصدار الإيصال',
      validate: (v) => { const e = emp(v.emp); const sb = selfBlock(e) || (e && e.userId === me().id ? 'لا تصرف عهدة لنفسك (فصل المهام).' : ''); if (sb) return sb; const sel = rows.filter((r) => r.on.get()); if (!sel.length) return 'اختر صنفًا واحدًا على الأقل.'; for (const r of sel) { const q = r.qty.get(); if (!q || q < 1) return 'الكمية غير صالحة لـ' + r.it.name; if (r.serial && !String(r.serial.get() || '').trim()) return 'الرقم التسلسلي مطلوب لـ' + r.it.name + ' (BR-CST-08).'; if (q > r.it.stock) return 'نقص الرصيد في «' + r.it.name + '» (المتاح ' + r.it.stock + ') — اطلب شراء (غير مربوط بالمخزون {Open}).'; } if (pad.isEmpty() && chan.get() === 'touch') return 'التوقيع مطلوب — لا صرف بدون توقيع الاستلام (BR-CST-01).'; return null; },
      async onSubmit(v) {
        const e = emp(v.emp); const sel = rows.filter((r) => r.on.get()); let slip; const r = await run(() => {
          let ln = col('custodyIssues').reduce((m, i) => i.lines.reduce((mm, l) => Math.max(mm, parseInt(String(l.id).replace(/\D/g, ''), 10) || 0), m), 0); const issuedAt = nowIso();
          slip = { id: nextSeq('custodyIssues', 'CUS', 4, true), employeeId: e.id, issuedBy: me().id, issuedAt, channel: chan.get(), signatureRef: 'SIG-' + Math.random().toString(36).slice(2, 8).toUpperCase(), status: 'issued', lines: sel.map((x) => { ln++; return { id: 'CL-' + String(ln).padStart(4, '0'), itemId: x.it.id, size: x.size ? x.size.get() : '', qty: x.qty.get(), serial: x.serial ? x.serial.get().trim() : '', conditionOut: 'new', dueReplaceOn: x.it.cycleMonths ? isoD(Date.now() + x.it.cycleMonths * 30 * DAY) : null, status: 'issued', returnedAt: null, conditionIn: null }; }) };
          st.insert('custodyIssues', slip, true); st.update('custodyItems', (l) => sel.forEach((x) => { l.find((q) => q.id === x.it.id).stock -= x.qty.get(); }));
          const szMap = { 'IT-02': 'shoe', 'IT-06': 'overall', 'IT-04': 'glove' }; const chg = []; patchFile(e.id, (ff) => { sel.forEach((x) => { const k = szMap[x.it.id]; if (k && x.size && ff.sizes[k] !== x.size.get()) { chg.push(k); ff.sizes[k] = x.size.get(); } }); }); if (chg.length) deliver('HR.CST.ITEM_UPDATED', empTgt(e), { reason: 'تغيير مقاسات الموظف: ' + chg.join('، ') });
          letter('custody', e, slip.id, 'إيصال استلام عهدة ' + slip.id, ['استلم السيد/ة ' + e.name + ' (' + e.empNo + ') الأصناف التالية بتاريخ ' + SA.fmt.date(issuedAt) + ':'].concat(slip.lines.map((x) => '— ' + itemOf(x.itemId).name + (x.size ? ' (' + x.size + ')' : '') + (x.serial ? ' — ' + x.serial : '') + ' × ' + x.qty)).concat(['وأقرّ بمسؤوليتي عنها وبإعادتها عند الطلب أو انتهاء الخدمة. التوقيع: ' + slip.signatureRef]));
          deliver('HR.CST.ISSUED', empTgt(e), { after: { slip: slip.id, items: slip.lines.length } }); deliver('HR.CST.SIGNATURE_CAPTURED', empTgt(e), { after: { slip: slip.id, channel: slip.channel } });
        }); if (!r.ok) return false;
        if (e.userId) SA.notify({ title: 'تم صرف عهدة لك', body: slip.id + ' — ' + slip.lines.length + ' صنف', level: 'info', toUsers: [e.userId] }); SA.toast('تم الصرف — إيصال ' + slip.id, 'success', { ms: 6000, undo: null }); setTimeout(() => viewReceipt(slip), 200); return true;
      } });
    if (preEmp) fill(); return m;
  }
  /* return / replace / loss */
  function returnDialog(line, replaceDefault) {
    const e = emp(line.slip.employeeId); const it = itemOf(line.itemId); const pad = sigPad(); const padBox = h('div', { hidden: true }, h('b', { style: { fontSize: 'var(--text-dense)' } }, 'توقيع الموظف على الاستلام الجديد'), pad.el);
    const cond = F({ name: 'cond', label: 'حالة الصنف عند الاسترجاع', type: 'radio', required: true, value: 'good', options: [['good', 'جيد'], ['worn', 'مستهلك'], ['damaged', 'تالف'], ['lost', 'مفقود']], full: true, onChange: () => sync() });
    const rep = F({ name: 'rep', label: 'استبدال بصنف جديد (يبدأ دورة جديدة)', type: 'checkbox', value: !!replaceDefault, onChange: () => sync() }); const notes = F({ name: 'notes', label: 'ملاحظات / واقعة', type: 'textarea', full: true });
    const warn = h('div'); function sync() { const c = cond.get(); padBox.hidden = !rep.get() || ['damaged', 'lost'].indexOf(c) >= 0 && false; rep.el.hidden = c === 'lost' && false; SA.clear(warn); if (['damaged', 'lost'].indexOf(c) >= 0) warn.append(SA.alert('warning', it.category === 'ppe' ? 'PPE مجاني: لا خصم افتراضيًا (م. 267–269 Pending) — الخصم يحتاج HR Manager ومراجعة قانونية.' : 'سيُفتح بلاغ فقد/تلف ويمكن اقتراح خصم في حدود السقف القانوني المُعدّ بعد إفادة الموظف واعتماد HR Manager.'), ['id_card', 'key'].indexOf(it.category) >= 0 && c === 'lost' ? SA.alert('danger', 'فقد كارنيه/مفتاح: تعطيل فوري + بدل فاقد {Open} (BR-CST-07).') : null); }
    formDialog({ title: 'استرجاع / استبدال — ' + it.name, subtitle: e.name + ' · ' + line.slip.id + (line.size ? ' · المقاس ' + line.size : ''), icon: 'swap', fields: [cond, rep, notes], extra: h('div.sap-pp-stack', {}, warn, padBox), submitLabel: 'تسجيل',
      validate: (v) => { if (['damaged', 'lost'].indexOf(v.cond) >= 0 && !String(v.notes || '').trim()) return 'اكتب واقعة الفقد/التلف في الملاحظات.'; if (v.rep && (it.stock || 0) < line.qty) return 'نقص رصيد الصنف للاستبدال.'; if (v.rep && pad.isEmpty()) return 'توقيع الموظف على الاستلام الجديد مطلوب.'; return null; },
      async onSubmit(v) {
        const bad = ['damaged', 'lost'].indexOf(v.cond) >= 0; const r = await run(() => {
          st.update('custodyIssues', (l) => { const s = l.find((q) => q.id === line.slip.id); const x = s.lines.find((q) => q.id === line.lineId); x.status = bad ? v.cond : (v.rep ? 'replaced' : 'returned'); x.returnedAt = nowIso(); x.conditionIn = v.cond; x.notes = v.notes; });
          if (bad) { st.insert('chargebacks', { id: nextSeq('chargebacks', 'CB', 4, true), lineId: line.lineId, employeeId: e.id, itemId: line.itemId, reason: v.notes, status: 'reported', proposedBy: null, createdAt: nowIso(), approvalId: null }); deliver('HR.CST.LOSS_REPORTED', empTgt(e), { after: { item: it.name, condition: v.cond }, reason: v.notes }); if (['id_card', 'key'].indexOf(it.category) >= 0 && v.cond === 'lost') deliver('HR.CST.LOSS_REPORTED', empTgt(e), { reason: 'تعطيل فوري لـ' + it.name + ' وتحديث بوابات الدخول' }); }
          else deliver(v.rep ? 'HR.CST.REPLACED' : 'HR.CST.RETURNED', empTgt(e), { after: { item: it.name, condition: v.cond } });
          if (!bad) st.update('custodyItems', (l) => { if (it.returnable && !v.rep) l.find((q) => q.id === it.id).stock += line.qty; });
          if (v.rep) { const ln = col('custodyIssues').reduce((m, i) => i.lines.reduce((mm, l) => Math.max(mm, parseInt(String(l.id).replace(/\D/g, ''), 10) || 0), m), 0) + 1; const slip = { id: nextSeq('custodyIssues', 'CUS', 4, true), employeeId: e.id, issuedBy: me().id, issuedAt: nowIso(), channel: 'touch', signatureRef: 'SIG-' + Math.random().toString(36).slice(2, 8).toUpperCase(), status: 'issued', replacementOf: line.lineId, lines: [{ id: 'CL-' + String(ln).padStart(4, '0'), itemId: it.id, size: line.size, qty: line.qty, serial: '', conditionOut: 'new', dueReplaceOn: it.cycleMonths ? isoD(Date.now() + it.cycleMonths * 30 * DAY) : null, status: 'issued', returnedAt: null, conditionIn: null }] }; st.insert('custodyIssues', slip, true); st.update('custodyItems', (l) => { l.find((q) => q.id === it.id).stock -= line.qty; }); }
        }); if (!r.ok) return false; SA.toast(bad ? 'تم تسجيل البلاغ — اقترح الخصم من تبويب «الفقد والخصومات»' : v.rep ? 'تم الاستبدال وبدأت دورة جديدة' : 'تم تسجيل الاسترجاع', bad ? 'warn' : 'success', { ms: 5500 }); return true;
      } }); sync();
  }
  function chargeDialog(line) {
    const e = emp(line.slip.employeeId); const it = itemOf(line.itemId); const cb = col('chargebacks').find((c) => c.lineId === line.lineId); const ppe = it.category === 'ppe';
    if (selfBlock(e)) { SA.toast(selfBlock(e), 'error'); return; }
    if (ppe && !isMgr()) { SA.toast('PPE مجاني ولا يُخصم ثمنه (م. 267–269 Pending) — أي خصم يحتاج HR Manager ومراجعة قانونية.', 'warn', { ms: 7000 }); return; }
    const value = F({ name: 'value', label: 'قيمة الصنف (ج.م)', type: 'number', required: true, min: 0, value: it.unitValue || '', hint: 'القيمة وأساس التكلفة {Open}.' }); const dep = F({ name: 'dep', label: 'نسبة الإهلاك %', type: 'number', required: true, min: 0, max: 100, value: S().depreciationPct, hint: 'حسب العمر — {Open}' });
    const inc = F({ name: 'inc', label: 'الواقعة الموثقة / رقم المحضر', required: true, value: cb ? cb.reason : '', full: true }); const stmt = F({ name: 'stmt', label: 'إفادة الموظف (مختصر)', type: 'textarea', required: true, full: true }); const legal = ppe ? F({ name: 'legal', label: 'تمت المراجعة القانونية لخصم PPE', type: 'checkbox', full: true }) : null;
    const calc = h('div.sap-pp-stack'); const draw = () => { SA.clear(calc); const v = value.get(), d = dep.get(); if (v == null || d == null) return; const c = chargeCalc(e, v, d);
      calc.append(SA.card({ title: 'حاسبة السقف القانوني' }, h('div.sap-pp-stack', {}, SA.kv([['القيمة بعد الإهلاك', canSal() ? SA.fmt.money(c.net) : secret()], ['السقف الشهري', h('span', {}, (S().chargebackCapDays || 0) + ' أيام من الأساسي', canSal() ? ' = ' + SA.fmt.money(c.cap.monthly) : ' (المبلغ سري)')], ['إجمالي الشهور المسموح', (S().chargebackCapMonths || 0) + ' شهر'], ['قابل للخصم', canSal() ? SA.fmt.money(c.deductible) : (c.notDeductible ? 'جزء من القيمة' : 'كامل القيمة')], ['غير قابل للخصم (يتجاوز السقف)', c.notDeductible > 0 ? (canSal() ? SA.fmt.money(c.notDeductible) : 'نعم') : SA.chip('لا يوجد', 'success')]]), canSal() && c.schedule.length ? h('table.sap-pp-sch', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الشهر'), h('th', {}, 'القسط'))), h('tbody', {}, c.schedule.map((s) => h('tr', {}, h('td.num', {}, s.month), h('td.num', {}, SA.fmt.money(s.amount)))))) : null, c.notDeductible > 0 ? SA.alert('warning', 'الجزء الزائد عن السقف لا يُخصم — يُعفى أو يُشطب بقرار.') : null))); };
    value.input.addEventListener('input', draw); dep.input.addEventListener('input', draw); draw();
    formDialog({ title: 'اقتراح خصم فقد/تلف', subtitle: e.name + ' — ' + it.name, icon: 'coins', size: 'lg', fields: [value, dep, inc, stmt, legal].filter(Boolean), extra: calc, submitLabel: 'إرسال للاعتماد', intro: ppe ? SA.alert('danger', 'PPE: لا خصم افتراضيًا. يلزم HR Manager + مراجعة قانونية، والمقترِح لا يعتمد.') : SA.alert('info', 'المقترِح ≠ المعتمِد. يُرسل الاقتراح لسلسلة HR Manager ← المالية في صندوق الاعتمادات.'),
      validate: (v) => (ppe && !v.legal ? 'أكّد المراجعة القانونية لخصم PPE.' : null),
      async onSubmit(v) { const c = chargeCalc(e, v.value, v.dep); if (c.deductible <= 0) { SA.toast('لا مبلغ قابل للخصم ضمن السقف.', 'error'); return false; } let rec;
        const r = await run(() => { const my = me().roleId; const chain = [{ roleId: 'R-11', label: 'مدير الموارد البشرية (اعتماد) — المالية/المرتبات تنفّذ' }].map((s) => (s.roleId === my ? { roleId: 'R-01', label: s.label + ' (بديل — المقترِح يشغل الدور)' } : s)); const id = cb ? cb.id : nextSeq('chargebacks', 'CB', 4, true); rec = { id, lineId: line.lineId, employeeId: e.id, itemId: it.id, reason: v.inc, statement: v.stmt, itemValue: v.value, depreciationPct: v.dep, net: c.net, capDays: S().chargebackCapDays, capMonths: S().chargebackCapMonths, schedule: c.schedule, deductible: c.deductible, notDeductible: c.notDeductible, proposedBy: me().id, proposedAt: nowIso(), status: 'pending_approval', legalReview: !!v.legal, objection: null };
          if (cb) st.patch('chargebacks', id, rec); else st.insert('chargebacks', rec, true);
          const ap = SA.requestApproval({ type: 'custody_chargeback', title: 'خصم فقد عهدة: ' + e.name + ' — ' + it.name, requesterId: me().id, chain, context: [['الموظف', e.name + ' (' + e.empNo + ')'], ['الصنف', it.name + (ppe ? ' (PPE — مراجعة قانونية)' : '')], ['الواقعة', v.inc], ['القيمة والخصم', 'سري (T3) — hr.salary.view'], ['السقف القانوني', 'مُعدّ: ' + S().chargebackCapDays + ' أيام × ' + S().chargebackCapMonths + ' شهر [Law Art. 151 · Pending]'], ['ملاحظة', 'المقترِح لا يعتمد (BR-CST-12)']], ref: { type: 'custody_chargeback', id } }); st.patch('chargebacks', id, { approvalId: ap.id });
          deliver('HR.CST.CHARGEBACK_PROPOSED', empTgt(e), { after: { id, months: c.schedule.length }, reason: v.inc }); }); if (!r.ok) return false; SA.toast('أُرسل اقتراح الخصم ' + rec.id + ' للاعتماد', 'success'); return true; } });
  }
  async function writeOff(line) {
    const e = emp(line.slip.employeeId); const r = await SA.confirm({ title: 'شطب العهدة المفقودة', confirmLabel: 'شطب', danger: true, reasonRequired: true, impact: ['تُعتبر العهدة مشطوبة بلا خصم ولا تمنع إخلاء الطرف.', 'قرار HR Manager وسبب (BR-CST-09).'] }); if (!r.ok) return;
    const x = await run(() => { st.update('custodyIssues', (l) => l.forEach((i) => i.lines.forEach((q) => { if (q.id === line.lineId) q.status = 'written_off'; }))); const cb = col('chargebacks').find((c) => c.lineId === line.lineId); if (cb) st.patch('chargebacks', cb.id, { status: 'written_off' }); deliver('HR.CST.WRITTEN_OFF', empTgt(e), { reason: r.reason, after: { item: itemOf(line.itemId).name } }); }); if (x.ok) SA.toast('تم الشطب', 'success');
  }
  function cbDrawer(id) {
    let d; const body = h('div.sap-pp-stack');
    const draw = () => { const c = col('chargebacks').find((x) => x.id === id); SA.clear(body); if (!c) return; const e = emp(c.employeeId) || { name: c.employeeId, id: c.employeeId, empNo: '', positionId: '', departmentId: '' }; const ap = col('approvals').find((a) => a.id === c.approvalId);
      body.append(personLine(e), stChip(CB_ST, c.status), SA.kv([['الصنف', itemOf(c.itemId).name], ['الواقعة', c.reason || '—'], ['إفادة الموظف', c.statement || '—'], ['المقترِح', c.proposedBy ? SA.userName(c.proposedBy) : '—'], ['صافي القيمة', c.net != null ? (canSal() ? SA.fmt.money(c.net) : secret()) : '—'], ['قابل للخصم', c.deductible != null ? (canSal() ? SA.fmt.money(c.deductible) : secret()) : '—'], ['السقف', c.capDays ? c.capDays + ' أيام × ' + c.capMonths + ' شهر (إعداد وقت الاقتراح)' : '—']]),
        c.schedule && c.schedule.length ? SA.card({ title: 'جدول الخصم' }, canSal() ? h('table.sap-pp-sch', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الشهر'), h('th', {}, 'القسط'))), h('tbody', {}, c.schedule.map((s) => h('tr', {}, h('td.num', {}, s.month), h('td.num', {}, SA.fmt.money(s.amount)))))) : secret()) : null,
        ap ? SA.card({ title: 'الاعتماد' }, h('ul.sap-pp-chain', {}, ap.chain.map((s, i) => h('li' + (s.status === 'approved' ? '.is-ok' : s.status === 'pending' ? '.is-now' : ''), {}, h('span.n', {}, i + 1), h('b', {}, s.label), SA.statusChip('approval', s.status === 'waiting' ? 'pending' : s.status))), SA.can('sa.approvals.view') ? h('a.sap-linkbtn', { href: SA.link.approval(ap.id) }, 'فتح في صندوق الاعتمادات') : null)) : null); };
    d = SA.drawer({ title: 'حالة خصم ' + id, subtitle: 'فقد/تلف عهدة', size: 'lg', body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close() }, 'إغلاق')], onClose: () => offs.forEach((o) => o()) });
    const offs = ['chargebacks', 'approvals'].map((p) => st.subscribe(p, () => { if (body.isConnected) draw(); })); draw();
  }
  function itemDialog(it) {
    const f = { name: F({ name: 'name', label: 'اسم الصنف', required: true, value: it ? it.name : '' }), category: F({ name: 'category', label: 'الفئة', type: 'select', required: true, options: Object.keys(CAT).map((k) => [k, CAT[k]]), value: it ? it.category : 'tool' }), sizes: F({ name: 'sizes', label: 'المقاسات (مفصولة بفواصل)', value: it ? it.sizes.join('،') : '' }), cycle: F({ name: 'cycle', label: 'دورة الاستبدال (شهر)', type: 'number', min: 1, value: it && it.cycleMonths ? it.cycleMonths : '', hint: 'فارغ = غير مُعدّ {Open}' }), value: F({ name: 'value', label: 'القيمة (ج.م)', type: 'number', min: 0, value: it && it.unitValue ? it.unitValue : '', hint: 'فارغ = غير مُعدّ {Open}' }), stock: F({ name: 'stock', label: 'رصيد المخزن', type: 'number', min: 0, required: true, value: it ? it.stock : 0 }), ref: F({ name: 'ref', label: 'مرجع المعيار (لـPPE)', value: it && it.standardRef ? it.standardRef : '', hint: 'PPE يتطلب مرجعًا — {Open}' }), ret: F({ name: 'ret', label: 'مُسترجَع عند انتهاء الخدمة', type: 'checkbox', value: it ? it.returnable : true }), ser: F({ name: 'ser', label: 'يتطلب رقمًا تسلسليًا', type: 'checkbox', value: it ? it.requiresSerial : false }) };
    formDialog({ title: it ? 'تعديل صنف: ' + it.name : 'صنف عهدة جديد', icon: 'box', fields: Object.values(f), submitLabel: 'حفظ',
      async onSubmit(v) { const rec = { name: v.name.trim(), category: v.category, sizes: String(v.sizes || '').split(/[،,]/).map((x) => x.trim()).filter(Boolean), cycleMonths: v.cycle || null, unitValue: v.value || null, stock: v.stock, standardRef: v.ref || null, returnable: !!v.ret, requiresSerial: !!v.ser };
        const r = await run(() => { if (it) { st.patch('custodyItems', it.id, rec); deliver('HR.CST.ITEM_UPDATED', tgt('custody_item', it.id, rec.name), { before: { stock: it.stock, cycle: it.cycleMonths, value: it.unitValue }, after: { stock: rec.stock, cycle: rec.cycleMonths, value: rec.unitValue } }); } else { const id = 'IT-' + String(col('custodyItems').length + 1).padStart(2, '0'); st.insert('custodyItems', Object.assign({ id, code: id, demo: true }, rec)); deliver('HR.CST.ITEM_UPDATED', tgt('custody_item', id, rec.name), { after: rec, reason: 'صنف جديد' }); } }); if (r.ok) SA.toast('تم الحفظ', 'success'); return r.ok; } });
  }
  function matrixDialog(posId) {
    const cur = col('custodyMatrix').filter((m) => m.positionId === posId); const lst = col('custodyItems').map((it) => { const m = cur.find((x) => x.itemId === it.id); return { it, on: F({ name: 'on', label: it.name, type: 'checkbox', value: !!m }), qty: F({ name: 'qty', label: 'الكمية', type: 'number', min: 1, value: m ? m.qty : 1 }), req: F({ name: 'req', label: 'إلزامي للوصول', type: 'checkbox', value: m ? m.requiredForAccess : false }) }; });
    const body = h('div.sap-pp-stack', {}, lst.map((x) => h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(150px,1.5fr) 90px minmax(120px,1fr)', gap: '10px', alignItems: 'end', borderBottom: '1px solid var(--color-border)', paddingBlock: '6px' } }, x.on.el, x.qty.el, x.req.el)));
    const m = SA.modal({ title: 'استحقاقات ' + posTitle(posId), subtitle: 'مصفوفة PPE والزي', icon: 'box', size: 'lg', body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => { const sel = lst.filter((x) => x.on.get()); const nonPpeReq = sel.filter((x) => x.req.get() && false); m.setBusy(true); const r = await run(() => { const before = cur.length; st.update('custodyMatrix', (l) => l.filter((q) => q.positionId !== posId).concat(sel.map((x) => ({ positionId: posId, itemId: x.it.id, qty: x.qty.get() || 1, requiredForAccess: !!x.req.get() })))); deliver('HR.CST.MATRIX_CHANGED', tgt('position', posId, posTitle(posId)), { before: { items: before }, after: { items: sel.length } }); }); m.setBusy(false); if (r.ok) { SA.toast('تم حفظ المصفوفة', 'success'); m.close(); } } }, 'حفظ')] });
  }

  /* ═════════════════════════ HR-34 · المقاولون والوكالات واليومية ═════════════════════════ */
  const AG_ST = { active: ['نشطة', 'success'], under_review: ['تحت المراجعة', 'warning'], suspended: ['موقوفة', 'danger'], blacklisted: ['محظورة', 'danger'], expired: ['منتهية', 'neutral'] };
  const RS_ST = { expected: ['متوقع', 'neutral'], arrived: ['وصل البوابة', 'info'], on_line: ['على الخط', 'success'], left: ['غادر — ساعات بانتظار الاعتماد', 'warning'], approved: ['ساعات معتمدة', 'success'], refused: ['مرفوض', 'danger'] };
  const RQ_ST = { sent: ['مرسل — بانتظار اعتماد HR', 'warning'], approved: ['معتمد — بانتظار تأكيد الوكالة', 'info'], confirmed_partial: ['مؤكد جزئيًا', 'warning'], confirmed_full: ['مؤكد كليًا', 'success'], closed: ['مُغلق', 'neutral'], cancelled: ['ملغي', 'neutral'] };
  const WK_ST = { registered: ['مسجّل', 'neutral'], authorized: ['مصرّح بالدخول', 'success'], blacklisted: ['محظور', 'danger'], converted: ['مُحوّل لموظف', 'info'] };
  const workerOf = (id) => col('ctrWorkers').find((w) => w.id === id) || null;
  const agencyOf = (id) => col('agencies').find((a) => a.id === id) || null;
  const hhmm = () => new Date().toTimeString().slice(0, 5);
  const hrsBetween = (a, b) => { if (!a || !b) return null; const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number); return Math.max(0, Math.round(((h2 * 60 + m2) - (h1 * 60 + m1)) / 15) / 4); };
  const inductionOkW = (w) => !!(w && w.inductionDone);
  const wMask = (w) => maskNid(String(w.nationalId).slice(-4));
  const ctrOn = () => S().contractorsEnabled !== false;
  async function setCtrEnabled(v) {
    const r = await SA.confirm({ title: v ? 'تفعيل ميزة المقاولين (D9)' : 'تعطيل ميزة المقاولين (D9)', confirmLabel: v ? 'تفعيل' : 'تعطيل', danger: !v, reasonRequired: true, impact: [v ? 'تظهر شاشات الوكالات وكشف اليوم والساعات.' : 'تُخفى شاشات المقاولين (الحالة الافتراضية «غير مُفعّل» حتى يُحسم القرار D9).', 'المقاولون لا يدخلون كشف مرتبات الموظفين في كل الأحوال.'] }); if (!r.ok) return;
    const x = await run(() => { st.update('settings', (s) => { s.hrPeople.contractorsEnabled = v; }); deliver('HR.CTR.SETTINGS_CHANGED', tgt('settings', 'contractors', 'ميزة المقاولين'), { before: { enabled: !v }, after: { enabled: v }, reason: r.reason }); }); if (x.ok) SA.toast(v ? 'تم تفعيل الميزة (تجريبيًا)' : 'تم تعطيل الميزة', 'success');
  }
  function renderContractors(root, ctx) {
    ensure(); ctx.setCrumbs([{ label: 'الموظفون' }, { label: 'المقاولون واليومية' }]); let tab = ctx.params.tab || 'today'; let drawerRef = null; let leaving = false;
    const head = SA.pageHead({ title: 'عمالة المقاولين والوكالات واليومية', desc: 'ليسوا موظفين ولا يدخلون كشف المرتبات: عدد مطلوب، كشف يومي، فحص هوية، توعية سلامة إلزامية، ساعات يعتمدها المشرف، قائمة سوداء، وتحويل للموظف.', tags: [SA.tag('new'), SA.tag('open', 'D9 Open')], actions: ctrOn() ? [SA.btn({ label: 'تسجيل عامل', icon: 'userplus', kind: 'ghost', perm: 'hr.contractors.edit', onClick: () => workerDialog() }), SA.btn({ label: 'طلب عدد عمالة', icon: 'plus', kind: 'accent', perm: 'hr.contractors.edit', onClick: () => requestDialog() })] : [] });
    root.append(head);
    if (!ctrOn()) { root.append(SA.card({}, SA.empty({ icon: 'truck', title: 'ميزة المقاولين غير مُفعّلة', text: 'القرار D9 (هل نستخدم عمالة مقاولين/يومية؟) لسه Open — الحالة الافتراضية «غير مُفعّل».', action: SA.can('hr.settings.edit') ? { label: 'تفعيل تجريبي', icon: 'check', onClick: () => setCtrEnabled(true) } : null })), specLink('m-scr-ctr-14', 'SCR-CTR-14 ↗')); return; }
    return loadGate(root, 'table', (host) => {
      const hoursPending = () => col('ctrRoster').filter((r) => r.status === 'left').length;
      const tabs = SA.tabs({ label: 'أقسام المقاولين', active: tab, tabs: [{ id: 'today', label: 'كشف اليوم' }, { id: 'hours', label: 'الساعات والاعتماد', badge: hoursPending() || null }, { id: 'requests', label: 'طلبات العدد', badge: col('ctrRequests').filter((r) => r.status === 'sent').length || null }, { id: 'agencies', label: 'الوكالات' }, { id: 'workers', label: 'العمال' }, { id: 'blacklist', label: 'القائمة السوداء' }], onChange: (id) => { tab = id; history.replaceState(null, '', '#/hr/contractors' + (id === 'today' ? '' : '?tab=' + id)); drawBody(); } });
      const banner = SA.alert('warning', h('b', {}, 'مُفعّلة تجريبيًا — القرار D9 لسه Open. '), 'الأسعار وأساس الفاتورة ومسؤولية الأجور والتأمينات {Open} [Law · غير متحقق]. ', SA.can('hr.settings.edit') ? h('button.sap-linkbtn', { type: 'button', onclick: () => setCtrEnabled(false) }, 'تعطيل الميزة') : null);
      const body = h('div'); host.append(banner, h('div.sap-pp-tabs-wrap', {}, tabs.el), body);
      const drawBody = () => { SA.clear(body); ({ today: todayTab, hours: hoursTab, requests: reqTab, agencies: agTab, workers: wkTab, blacklist: blTab }[tab] || todayTab)(body); };
      /* — today — */
      function todayTab(box) {
        const rows = () => col('ctrRoster').filter((r) => r.date === today()); const all = rows();
        box.append(h('div.sap-grid-cards', { style: { marginBottom: '14px' } }, SA.kpi('المتوقع اليوم', all.length), SA.kpi('وصلوا البوابة', all.filter((r) => ['arrived', 'on_line', 'left', 'approved'].indexOf(r.status) >= 0).length), SA.kpi('على الخط', all.filter((r) => r.status === 'on_line').length), SA.kpi('مرفوضون', all.filter((r) => r.status === 'refused').length, { sub: 'توعية/هوية/حظر' })));
        const t = SA.table({ rowId: 'id', pageSize: 12, caption: 'كشف اليوم', rows, search: { placeholder: 'بحث باسم العامل…', keys: (r, q) => (workerOf(r.workerId) || { name: '' }).name.indexOf(q) >= 0 }, filters: [{ key: 'agencyId', label: 'الوكالة', options: col('agencies').map((a) => [a.id, a.name]) }, { key: 'status', label: 'الحالة', options: Object.keys(RS_ST).map((k) => [k, RS_ST[k][0]]) }],
          columns: [{ key: 'w', label: 'العامل', render: (r) => { const w = workerOf(r.workerId) || { name: r.workerId, role: '' }; return h('div.sap-usercell', {}, SA.avatar(w.name), h('div', {}, h('b', {}, w.name), h('small', {}, w.role + ' · ' + (w.id || '')))); } }, { key: 'agencyId', label: 'الوكالة', render: (r) => (agencyOf(r.agencyId) || {}).name }, { key: 'checks', label: 'الهوية / التوعية', render: (r) => h('div.sap-pp-pill-row', {}, SA.chip(r.idOk ? 'هوية ✓' : 'هوية', r.idOk ? 'success' : 'neutral'), SA.chip(inductionOkW(workerOf(r.workerId)) ? 'توعية ✓' : 'بدون توعية', inductionOkW(workerOf(r.workerId)) ? 'success' : 'danger')) }, { key: 'times', label: 'بوابة / خط', render: (r) => h('span.num', {}, (r.gateIn || '—') + ' / ' + (r.lineIn || '—') + (r.lineOut ? ' → ' + r.lineOut : '')) }, { key: 'status', label: 'الحالة', render: (r) => stChip(RS_ST, r.status) }, { key: 'act', label: 'الإجراء', render: (r) => rowAction(r) }],
          empty: { icon: 'truck', title: 'لا كشف لليوم', text: 'أضف عمالًا من طلب عدد مؤكد.', action: { label: 'طلب عدد عمالة', icon: 'plus', perm: 'hr.contractors.edit', onClick: () => requestDialog() } }, toolbar: [SA.btn({ label: 'إضافة للكشف', icon: 'plus', kind: 'ghost', perm: 'hr.contractors.edit', onClick: addToRoster })] });
        box.append(h('div.card.card-flush.sap-listcard', {}, t.el));
      }
      function rowAction(r) {
        const w = workerOf(r.workerId); if (!w) return '—';
        if (r.status === 'expected' || r.status === 'refused') return SA.btn({ label: 'فحص البوابة', icon: 'shield', kind: 'primary', size: 'sm', perm: 'hr.contractors.edit', onClick: () => gateDialog(r) });
        if (r.status === 'arrived') return h('div.sap-pp-pill-row', {}, SA.btn({ label: 'دخول الخط', icon: 'play', kind: 'primary', size: 'sm', perm: 'hr.contractors.edit', onClick: () => lineEnter(r) }), !inductionOkW(w) ? SA.btn({ label: 'توعية', icon: 'shield', kind: 'ghost', size: 'sm', perm: 'hr.ohs.edit', onClick: () => ctrInduction(w) }) : null);
        if (r.status === 'on_line') return SA.btn({ label: 'تسجيل مغادرة', icon: 'logout', kind: 'ghost', size: 'sm', perm: 'hr.contractors.edit', onClick: () => leave(r) });
        return h('span.t-muted', {}, r.hoursRaw != null ? r.hoursRaw + ' ساعة' : '—');
      }
      function addToRoster() {
        const used = new Set(col('ctrRoster').filter((r) => r.date === today()).map((r) => r.workerId)); const opts = col('ctrWorkers').filter((w) => !w.blacklisted && w.status !== 'converted' && !used.has(w.id) && (agencyOf(w.agencyId) || {}).status === 'active').map((w) => [w.id, w.name + ' — ' + (agencyOf(w.agencyId) || {}).name]);
        if (!opts.length) { SA.toast('لا عمال متاحون للإضافة (الكل في الكشف أو الوكالة غير نشطة).', 'info'); return; }
        formDialog({ title: 'إضافة عامل لكشف اليوم', icon: 'plus', fields: [F({ name: 'w', label: 'العامل', type: 'select', required: true, options: opt(opts, 'اختر…') })], submitLabel: 'إضافة', async onSubmit(v) { const w = workerOf(v.w); const r = await run(() => { st.insert('ctrRoster', { id: 'RS-' + today() + '-' + w.id, date: today(), workerId: w.id, agencyId: w.agencyId, requestId: null, expected: true, gateIn: null, gateOut: null, lineIn: null, lineOut: null, idOk: false, inductionOk: !!w.inductionDone, hoursRaw: null, hoursApproved: null, approvedBy: null, adjustReason: '', status: 'expected', supervisorId: null }); }); if (r.ok) SA.toast('أُضيف للكشف', 'success'); return r.ok; } });
      }
      /* — hours — */
      function hoursTab(box) {
        const rows = () => col('ctrRoster').filter((r) => ['left', 'approved'].indexOf(r.status) >= 0).sort((a, b) => b.date.localeCompare(a.date)); const apprByAg = {}; rows().filter((r) => r.status === 'approved').forEach((r) => { apprByAg[r.agencyId] = (apprByAg[r.agencyId] || 0) + (r.hoursApproved || 0); });
        const t = SA.table({ rowId: 'id', pageSize: 12, selectable: true, caption: 'اعتماد الساعات', rows, filters: [{ key: 'status', label: 'الحالة', options: [['left', 'بانتظار الاعتماد'], ['approved', 'معتمدة']] }, { key: 'agencyId', label: 'الوكالة', options: col('agencies').map((a) => [a.id, a.name]) }],
          columns: [{ key: 'date', label: 'التاريخ', sort: true, render: (r) => h('span.num', {}, SA.fmt.date(r.date)) }, { key: 'w', label: 'العامل', render: (r) => (workerOf(r.workerId) || {}).name }, { key: 'agencyId', label: 'الوكالة', render: (r) => (agencyOf(r.agencyId) || {}).name }, { key: 'raw', label: 'ساعات البصمة', render: (r) => h('span.num', {}, r.hoursRaw) }, { key: 'appr', label: 'المعتمدة', render: (r) => (r.hoursApproved != null ? h('b.num', {}, r.hoursApproved) : '—') }, { key: 'status', label: 'الحالة', render: (r) => stChip(RS_ST, r.status) }],
          rowActions: (r) => [{ label: 'اعتماد كما هي', icon: 'check', disabled: r.status !== 'left' ? 'معتمدة بالفعل' : permReason('hr.contractors.edit'), onClick: () => approveHours([r]) }, { label: 'تعديل الساعات بسبب', icon: 'edit', disabled: permReason('hr.contractors.edit'), onClick: () => adjustHours(r) }],
          bulk: [{ label: 'اعتماد المحدد', icon: 'check', perm: 'hr.contractors.edit', run: (sel, api) => { approveHours(sel.filter((r) => r.status === 'left')); api.clearSelection(); } }], empty: { icon: 'clock', title: 'لا ساعات للاعتماد' } });
        box.append(h('div.sap-pp-grid2', {}, h('div.card.card-flush.sap-listcard', {}, t.el), h('div.sap-pp-stack', {}, SA.card({ title: 'أساس الفاتورة — ساعات معتمدة' }, h('div.sap-pp-stack', {}, col('agencies').map((a) => h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', {}, a.name), h('b.num', {}, (apprByAg[a.id] || 0) + ' ساعة'))), SA.kv([['الأسعار', canSal() ? SA.openValue('غير مُعدّة (Open)') : secret()], ['فرق الفاتورة المسموح', SA.openValue()]]), note('lock', 'لا فوترة إلا على الساعات المعتمدة من المشرف (BR-CTR-05). مطابقة الفاتورة والتسوية تتم مع Finance — انظر المواصفة.'), specLink('m-scr-ctr-08', 'SCR-CTR-08 ↗'))))));
      }
      async function approveHours(list) {
        if (!list.length) { SA.toast('لا ساعات بانتظار الاعتماد في المحدد.', 'info'); return; } const r = await SA.confirm({ title: 'اعتماد ساعات ' + list.length + ' عامل', confirmLabel: 'اعتماد', impact: ['تصبح الساعات أساس الفاتورة وتُغلق للتعديل بدون سبب.', 'مسؤولية الاعتماد على المشرف (BR-CTR-05).'] }); if (!r.ok) return;
        const x = await run(() => { st.update('ctrRoster', (l) => l.forEach((q) => { if (list.some((z) => z.id === q.id)) { q.hoursApproved = q.hoursRaw; q.approvedBy = me().id; q.status = 'approved'; } })); deliver('HR.CTR.HOURS_APPROVED', tgt('roster', list[0].date, list.length + ' سجل ساعات'), { after: { rows: list.length, hours: list.reduce((a, q) => a + (q.hoursRaw || 0), 0) } }); }); if (x.ok) SA.toast('تم اعتماد الساعات', 'success');
      }
      function adjustHours(r) { const w = workerOf(r.workerId); formDialog({ title: 'تعديل الساعات', subtitle: w.name + ' — ' + SA.fmt.date(r.date), icon: 'edit', fields: [F({ name: 'h', label: 'الساعات المعتمدة', type: 'number', required: true, min: 0, value: r.hoursApproved != null ? r.hoursApproved : r.hoursRaw }), F({ name: 'reason', label: 'سبب التعديل', type: 'textarea', required: true, full: true })], submitLabel: 'اعتماد بالتعديل', async onSubmit(v) { const x = await run(() => { st.update('ctrRoster', (l) => { const q = l.find((z) => z.id === r.id); q.hoursApproved = v.h; q.approvedBy = me().id; q.status = 'approved'; q.adjustReason = v.reason; }); deliver(v.h !== r.hoursRaw ? 'HR.CTR.HOURS_ADJUSTED' : 'HR.CTR.HOURS_APPROVED', tgt('roster', r.id, w.name), { before: { hours: r.hoursRaw }, after: { hours: v.h }, reason: v.reason }); }); if (x.ok) SA.toast('تم الاعتماد', 'success'); return x.ok; } }); }
      /* — requests — */
      function reqTab(box) {
        const t = SA.table({ rowId: 'id', pageSize: 10, caption: 'طلبات العدد', rows: () => col('ctrRequests').slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)), filters: [{ key: 'status', label: 'الحالة', options: Object.keys(RQ_ST).map((k) => [k, RQ_ST[k][0]]) }],
          columns: [{ key: 'id', label: 'الطلب', render: (r) => h('b.num', {}, r.id) }, { key: 'role', label: 'المطلوب', render: (r) => h('span', {}, r.role, h('small.t-muted', {}, ' · ' + deptName(r.deptId))) }, { key: 'qty', label: 'العدد', render: (r) => h('span.num', {}, r.confirmedQty + ' / ' + r.qty) }, { key: 'range', label: 'الفترة', render: (r) => h('span.num', {}, SA.fmt.date(r.from) + ' → ' + SA.fmt.date(r.to)) }, { key: 'agencyId', label: 'الوكالة', render: (r) => (agencyOf(r.agencyId) || {}).name || '—' }, { key: 'by', label: 'الطالب', render: (r) => SA.userName(r.requestedBy) }, { key: 'status', label: 'الحالة', render: (r) => stChip(RQ_ST, r.status) }],
          rowActions: (r) => [{ label: 'اعتماد وتحديد الوكالة', icon: 'check', disabled: r.status !== 'sent' ? 'ليس بانتظار الاعتماد' : permReason('hr.contractors.edit') || (r.requestedBy === me().id ? 'أنت الطالب — لا تعتمد طلبك' : ''), onClick: () => approveRequest(r) }, { label: 'تسجيل تأكيد الوكالة', icon: 'users', disabled: ['approved', 'confirmed_partial'].indexOf(r.status) < 0 ? 'يتطلب طلبًا معتمدًا' : permReason('hr.contractors.edit'), onClick: () => confirmRequest(r) }, { label: 'إلغاء', icon: 'xcircle', disabled: ['sent', 'approved'].indexOf(r.status) < 0 ? 'لا يمكن الإلغاء' : permReason('hr.contractors.edit'), onClick: () => cancelRequest(r) }], empty: { icon: 'truck', title: 'لا طلبات عدد', action: { label: 'طلب عدد عمالة', icon: 'plus', perm: 'hr.contractors.edit', onClick: () => requestDialog() } } });
        box.append(h('div.card.card-flush.sap-listcard', {}, t.el), note('info', 'الطلب المؤقت ينتهي تلقائيًا بتاريخ النهاية (BR-CTR-13). فوق حد العدد {Open} يحتاج HR Manager.'));
      }
      /* — agencies — */
      function agTab(box) {
        const t = SA.table({ rowId: 'id', pageSize: 10, caption: 'الوكالات', rows: () => col('agencies'), search: { placeholder: 'بحث باسم الوكالة…', keys: ['name', 'id'] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(AG_ST).map((k) => [k, AG_ST[k][0]]) }],
          columns: [{ key: 'name', label: 'الوكالة', sort: true, render: (a) => h('div', {}, h('b', {}, a.name), h('br'), h('small.t-muted', {}, a.id + ' · ' + a.contact)) }, { key: 'status', label: 'الحالة', render: (a) => stChip(AG_ST, a.status) }, { key: 'contract', label: 'نهاية العقد', sort: (x, y) => String(x.contractTo || '9').localeCompare(String(y.contractTo || '9')), render: (a) => { if (!a.contractTo) return SA.openValue('غير مُحدد'); const d = daysBetween(today(), a.contractTo); return h('span', {}, h('span.num', {}, SA.fmt.date(a.contractTo)), ' ', d <= 30 ? SA.chip(d < 0 ? 'منتهٍ' : d + ' يوم', d < 0 ? 'danger' : 'warning') : null); } }, { key: 'workers', label: 'العمال', render: (a) => h('span.num', {}, col('ctrWorkers').filter((w) => w.agencyId === a.id).length) }, { key: 'rating', label: 'التقييم', render: (a) => (a.rating ? h('span.num', {}, a.rating + ' / 5 ', SA.demoValue('')) : SA.openValue('غير مُقيَّمة')) }],
          onRowClick: (a) => { drawerRef = agencyDrawer(a.id); }, toolbar: [SA.btn({ label: 'وكالة جديدة', icon: 'plus', kind: 'ghost', perm: 'hr.contractors.edit', onClick: agencyDialog })], empty: { icon: 'building', title: 'لا وكالات' } });
        box.append(h('div.card.card-flush.sap-listcard', {}, t.el));
      }
      /* — workers — */
      function wkTab(box) {
        const t = SA.table({ rowId: 'id', pageSize: 10, caption: 'عمال الوكالات', rows: () => col('ctrWorkers'), search: { placeholder: 'بحث بالاسم…', keys: ['name', 'id'] }, filters: [{ key: 'agencyId', label: 'الوكالة', options: col('agencies').map((a) => [a.id, a.name]) }, { key: 'status', label: 'الحالة', options: Object.keys(WK_ST).map((k) => [k, WK_ST[k][0]]) }],
          columns: [{ key: 'name', label: 'العامل', sort: true, render: (w) => h('div.sap-usercell', {}, SA.avatar(w.name), h('div', {}, h('b', {}, w.name), h('small', {}, w.id + ' · ' + w.role))) }, { key: 'agencyId', label: 'الوكالة', render: (w) => (agencyOf(w.agencyId) || {}).name }, { key: 'nid', label: 'الرقم القومي', render: (w) => (canT2() ? wMask(w) : secret('T2')) }, { key: 'induction', label: 'التوعية', render: (w) => (w.inductionDone ? SA.chip('سارية — ' + SA.fmt.date(w.inductionDate), 'success') : SA.chip('لم تتم', 'danger')) }, { key: 'status', label: 'الحالة', render: (w) => stChip(WK_ST, w.status) }],
          rowActions: (w) => [{ label: 'تسجيل توعية السلامة', icon: 'shield', disabled: w.blacklisted ? 'محظور' : permReason('hr.ohs.edit'), onClick: () => ctrInduction(w) }, { label: 'تحويل لموظف', icon: 'userplus', disabled: w.status === 'converted' ? 'مُحوّل بالفعل' : w.blacklisted ? 'محظور' : permReason('hr.contractors.edit'), onClick: () => convertDialog(w) }, { label: 'طلب إدراج بالقائمة السوداء', icon: 'xcircle', danger: true, disabled: w.blacklisted ? 'محظور بالفعل' : permReason('hr.contractors.edit'), onClick: () => blacklistDialog('worker', w.id) }], toolbar: [SA.btn({ label: 'تسجيل عامل', icon: 'userplus', kind: 'ghost', perm: 'hr.contractors.edit', onClick: () => workerDialog() })], empty: { icon: 'users', title: 'لا عمال مسجّلون' } });
        box.append(h('div.card.card-flush.sap-listcard', {}, t.el));
      }
      /* — blacklist — */
      function blTab(box) {
        const t = SA.table({ rowId: 'id', pageSize: 10, caption: 'القائمة السوداء', rows: () => col('ctrBlacklist'), columns: [{ key: 'id', label: 'القيد', render: (b) => h('b.num', {}, b.id) }, { key: 'subj', label: 'المحظور', render: (b) => h('span', {}, b.subjectName, h('small.t-muted', {}, b.subjectType === 'worker' ? ' · عامل' : ' · وكالة')) }, { key: 'reason', label: 'السبب (داخلي — T4)', render: (b) => (isMgr() ? b.reason : secret('T4 — HR Manager')) }, { key: 'from', label: 'من', render: (b) => h('span.num', {}, SA.fmt.date(b.from)) }, { key: 'by', label: 'الطالب / المعتمد', render: (b) => SA.userName(b.requestedBy) + ' / ' + (b.approvedBy ? SA.userName(b.approvedBy) : '—') }, { key: 'status', label: 'الحالة', render: (b) => (b.status === 'active' ? SA.chip('محظور', 'danger') : SA.chip('مرفوع', 'neutral')) }],
          rowActions: (b) => [{ label: 'رفع الحظر', icon: 'unlock', disabled: b.status !== 'active' ? 'غير ساري' : permReason('hr.changes.approve'), onClick: () => liftBlacklist(b) }], empty: { icon: 'checkcircle', title: 'القائمة السوداء فاضية' } });
        box.append(h('div.card.card-flush.sap-listcard', {}, t.el), note('lock', 'سبب الإدراج التفصيلي لا يُعرض للوكالة (تُبلَّغ بالنتيجة). الإدراج بقرار HR Manager (+ GM للوكالة) بسبب وأدلة، والمقترِح ≠ المعتمِد.'));
      }
      drawBody();
      const offs = ['ctrRoster', 'ctrWorkers', 'ctrRequests', 'agencies', 'ctrBlacklist', 'ctrActions'].map((p) => st.subscribe(p, () => { if (host.isConnected) { tabs.setBadge('hours', hoursPending() || null); drawBody(); } })); return () => { leaving = true; offs.forEach((o) => o()); if (drawerRef) drawerRef.close(); };
    });
  }
  /* gate check (SCR-CTR-05) */
  function gateDialog(r) {
    const w = workerOf(r.workerId); const ag = agencyOf(w.agencyId); let refuse = '';
    if (w.blacklisted) refuse = 'العامل في القائمة السوداء — الدخول ممنوع فورًا (BR-CTR-04).'; else if (ag && ['active'].indexOf(ag.status) < 0) refuse = 'الوكالة غير نشطة (' + AG_ST[ag.status][0] + ').'; else if (ag && ag.contractTo && ag.contractTo < today()) refuse = 'عقد الوكالة منتهٍ — لا إسناد (BR-CTR-11).';
    else if (col('empFiles').some((f) => f.personal.nationalId === w.nationalId && (emp(f.id) || {}).status !== 'terminated')) refuse = 'الرقم القومي مسجّل لموظف حالي (BR-CTR-03).'; else if (col('ctrRoster').some((q) => q.date === r.date && q.id !== r.id && workerOf(q.workerId) && workerOf(q.workerId).nationalId === w.nationalId && q.agencyId !== r.agencyId)) refuse = 'نفس الرقم القومي مسجّل لوكالة أخرى اليوم (BR-CTR-03).';
    const idc = F({ name: 'id', label: 'تطابقت الصورة والهوية مع الحاضر', type: 'checkbox', value: false });
    const body = h('div.sap-pp-stack', {}, h('div.sap-usercell', {}, SA.avatar(w.name), h('div', {}, h('b', {}, w.name), h('small', {}, w.role + ' · ' + (ag || {}).name))), SA.kv([['الرقم القومي', canT2() ? wMask(w) : secret('T2')], ['توعية السلامة', w.inductionDone ? SA.chip('سارية', 'success') : SA.chip('لم تتم — الدخول للخط مرفوض', 'danger')], ['صلاحية التوعية', SA.openValue('غير مُعدّة (D11)')]]), refuse ? SA.alert('danger', refuse) : idc.el);
    let m; const doRefuse = async () => { const x = await run(() => { st.update('ctrRoster', (l) => { const q = l.find((z) => z.id === r.id); q.status = 'refused'; }); deliver('HR.CTR.GATE_REFUSED', tgt('roster', r.id, w.name), { result: 'denied', reason: refuse || 'فشل مطابقة الهوية' }); }); if (x.ok) { SA.toast('رُفض الدخول: ' + (refuse || 'فشل مطابقة الهوية'), 'error', { ms: 6000 }); m.close(); } };
    const okBtn = h('button.btn.btn-primary', { type: 'button', onclick: async () => { if (!idc.get()) { SA.toast('أكّد مطابقة الهوية أو ارفض الدخول.', 'warn'); return; } const x = await run(() => { st.update('ctrRoster', (l) => { const q = l.find((z) => z.id === r.id); q.idOk = true; q.gateIn = hhmm(); q.status = 'arrived'; q.inductionOk = !!w.inductionDone; }); deliver('HR.CTR.GATE_CHECKED', tgt('roster', r.id, w.name), { after: { gateIn: hhmm(), induction: !!w.inductionDone } }); }); if (x.ok) { SA.toast('تم تسجيل وصول ' + w.name, 'success'); m.close(); } } }, 'تسجيل الوصول');
    m = SA.modal({ title: 'فحص الهوية والتوعية عند البوابة', subtitle: SA.fmt.date(r.date), icon: 'shield', size: 'md', body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-danger', { type: 'button', onclick: doRefuse }, refuse ? 'تسجيل الرفض' : 'رفض الدخول'), refuse ? null : okBtn] });
  }
  async function lineEnter(r) {
    const w = workerOf(r.workerId); if (!inductionOkW(w)) { SA.toast('مرفوض: ' + w.name + ' بدون توعية سلامة — لا دخول للخط (BR-CTR-02).', 'error', { ms: 6500 }); deliver('HR.CTR.GATE_REFUSED', tgt('roster', r.id, w.name), { result: 'denied', reason: 'محاولة دخول الخط بدون توعية سلامة' }); SA.notify({ title: 'محاولة دخول خط بدون توعية: ' + w.name, body: 'عامل مقاول — تم الحجب.', level: 'urgent', to: ['R-11', 'R-15'], link: '#/hr/contractors' }); return; }
    const x = await run(() => { st.update('ctrRoster', (l) => { const q = l.find((z) => z.id === r.id); q.lineIn = hhmm(); q.status = 'on_line'; }); }); if (x.ok) SA.toast('سُمح لـ' + w.name + ' بدخول الخط', 'success');
  }
  async function leave(r) { const w = workerOf(r.workerId); const x = await run(() => { st.update('ctrRoster', (l) => { const q = l.find((z) => z.id === r.id); q.lineOut = hhmm(); q.gateOut = hhmm(); q.hoursRaw = hrsBetween(q.lineIn || q.gateIn, hhmm()) || 0.25; q.status = 'left'; }); }); if (x.ok) SA.toast('سُجلت مغادرة ' + w.name + ' — الساعات بانتظار اعتماد المشرف', 'success'); }
  function ctrInduction(w) {
    const topics = S().inductionTopics || INDUCTION_TOPICS; const pad = sigPad();
    formDialog({ title: 'توعية سلامة — عامل مقاول', subtitle: w.name, icon: 'shield', size: 'lg', fields: [F({ name: 'result', label: 'النتيجة', type: 'radio', value: 'pass', required: true, options: [['pass', 'اجتاز'], ['fail', 'لم يجتز']] }), F({ name: 'topics', label: 'المحاور', type: 'multi', required: true, options: topics.map((t) => [t, t]), value: topics.slice(0, 5), full: true })], extra: h('div', {}, h('b', { style: { fontSize: 'var(--text-dense)' } }, 'توقيع العامل'), pad.el), submitLabel: 'تسجيل',
      validate: (v) => (v.result === 'pass' && pad.isEmpty() ? 'التوقيع مطلوب عند النجاح.' : null),
      async onSubmit(v) { const ok = v.result === 'pass'; const x = await run(() => { if (ok) { st.update('ctrWorkers', (l) => { const q = l.find((z) => z.id === w.id); q.inductionDone = true; q.inductionDate = today(); q.status = 'authorized'; }); st.update('ctrRoster', (l) => l.forEach((q) => { if (q.workerId === w.id && q.date === today()) q.inductionOk = true; })); } SA.audit('HR.CTR.INDUCTION_DONE', { target: tgt('contractor', w.id, w.name), result: ok ? 'success' : 'failure', after: { result: v.result, topics: v.topics.length } }); }); if (x.ok) SA.toast(ok ? 'تم تسجيل التوعية — مسموح بدخول الخط' : 'سُجلت المحاولة — لا دخول للخط', ok ? 'success' : 'warn'); return x.ok; } });
  }
  function workerDialog() {
    const ags = col('agencies').filter((a) => a.status === 'active').map((a) => [a.id, a.name]); if (!ags.length) { SA.toast('لا وكالة نشطة لتسجيل عمال عليها.', 'warn'); return; }
    formDialog({ title: 'تسجيل عامل مقاول', icon: 'userplus', fields: [F({ name: 'name', label: 'الاسم', required: true, rules: [(v) => (String(v).trim().split(/\s+/).length < 2 ? 'الاسم ثنائي على الأقل' : null)] }), F({ name: 'nid', label: 'الرقم القومي', required: true, hint: 'فريد — ليس موظفًا حاليًا — ليس محظورًا.', rules: [(v) => { const c = checkNid(v); if (!c.ok) return c.msg; v = String(v).replace(/\s/g, ''); if (col('ctrWorkers').some((w) => w.nationalId === v)) return 'مسجّل كعامل مقاول بالفعل'; if (col('empFiles').some((f) => f.personal.nationalId === v && (emp(f.id) || {}).status !== 'terminated')) return 'مسجّل لموظف حالي (BR-CTR-03)'; return null; }] }), F({ name: 'agency', label: 'الوكالة', type: 'select', required: true, options: opt(ags, 'اختر…') }), F({ name: 'role', label: 'الدور', required: true, value: 'عامل تعبئة' }), F({ name: 'phone', label: 'الموبايل', type: 'tel', rules: [phoneRule] })], submitLabel: 'تسجيل',
      async onSubmit(v) { let w; const x = await run(() => { w = { id: nextSeq('ctrWorkers', 'CW', 3, false), name: v.name.trim(), nationalId: v.nid.replace(/\s/g, ''), agencyId: v.agency, role: v.role, idChecked: false, inductionDone: false, inductionDate: null, inductionValidUntil: null, status: 'registered', phone: v.phone, registeredAt: nowIso(), blacklisted: false, convertedEmployeeId: null }; st.insert('ctrWorkers', w); deliver('HR.CTR.WORKER_REGISTERED', tgt('contractor', w.id, w.name), { after: { agency: (agencyOf(v.agency) || {}).name } }); }); if (x.ok) SA.toast('تم تسجيل ' + w.name + ' — يحتاج توعية سلامة قبل أول دخول للخط', 'success', { ms: 5500 }); return x.ok; } });
  }
  function agencyDialog() {
    formDialog({ title: 'وكالة جديدة', icon: 'building', fields: [F({ name: 'name', label: 'اسم الوكالة', required: true, rules: [(v) => (col('agencies').some((a) => normName(a.name) === normName(v)) ? 'الاسم مسجّل بالفعل' : null)] }), F({ name: 'contact', label: 'مسؤول التواصل', required: true }), F({ name: 'from', label: 'بداية العقد', type: 'date', rules: [dateRule] }), F({ name: 'to', label: 'نهاية العقد', type: 'date', rules: [dateRule] })], submitLabel: 'إنشاء (تحت المراجعة)', validate: (v) => (v.from && v.to && v.to < v.from ? 'نهاية العقد قبل بدايته.' : null),
      async onSubmit(v) { const x = await run(() => { const id = nextSeq('agencies', 'AGN', 3, false); st.insert('agencies', { id, name: v.name.trim(), crNo: 'سجل تجاري {Placeholder}', taxId: 'بطاقة ضريبية {Placeholder}', contact: v.contact, status: 'under_review', wageLiability: null, rating: null, contractFrom: v.from || null, contractTo: v.to || null, blacklisted: false }); deliver('HR.CTR.AGENCY_CREATED', tgt('agency', id, v.name), { after: { status: 'under_review' } }); }); if (x.ok) SA.toast('أُنشئت الوكالة — فعّلها بعد المراجعة', 'success'); return x.ok; } });
  }
  function agencyDrawer(id) {
    let d; const body = h('div.sap-pp-stack');
    const draw = () => { const a = agencyOf(id); SA.clear(body); if (!a) return; const ws = col('ctrWorkers').filter((w) => w.agencyId === id); const hrs = col('ctrRoster').filter((r) => r.agencyId === id && r.status === 'approved').reduce((s, r) => s + (r.hoursApproved || 0), 0); const dd = a.contractTo ? daysBetween(today(), a.contractTo) : null;
      body.append(h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, stChip(AG_ST, a.status), dd != null && dd <= 30 ? SA.chip(dd < 0 ? 'عقد منتهٍ' : 'العقد ينتهي بعد ' + dd + ' يوم', dd < 0 ? 'danger' : 'warning') : null), SA.kv([['المعرّف', a.id], ['التواصل', a.contact], ['السجل التجاري', SA.openValue('Placeholder')], ['العقد', a.contractFrom ? SA.fmt.date(a.contractFrom) + ' → ' + SA.fmt.date(a.contractTo) : SA.openValue('غير مُحدد')], ['الأسعار (T3)', canSal() ? SA.openValue('غير مُعدّة (Open)') : secret()], ['مسؤولية الأجور والتأمينات', SA.openValue('تُحدد حسب العقد (Open)')], ['ساعات معتمدة', h('b.num', {}, hrs)]]),
        SA.card({ title: 'العمال (' + ws.length + ')', flush: true }, ws.length ? h('div.table-wrap', {}, h('table.table', {}, h('tbody', {}, ws.map((w) => h('tr', {}, h('td', {}, w.name), h('td', {}, w.role), h('td', {}, stChip(WK_ST, w.status))))))) : SA.empty({ icon: 'users', title: 'لا عمال' })),
        h('div.sap-pp-pill-row', {}, a.status === 'under_review' ? SA.btn({ label: 'تفعيل الوكالة', icon: 'check', kind: 'primary', perm: 'hr.changes.approve', reason: permReason('hr.changes.approve'), onClick: () => agStatus(a, 'active') }) : null, a.status === 'active' ? SA.btn({ label: 'إيقاف', icon: 'xcircle', kind: 'ghost', perm: 'hr.contractors.edit', onClick: () => agStatus(a, 'suspended') }) : null, a.status === 'suspended' ? SA.btn({ label: 'إعادة تفعيل', icon: 'check', kind: 'ghost', perm: 'hr.contractors.edit', onClick: () => agStatus(a, 'active') }) : null, a.status !== 'blacklisted' ? SA.btn({ label: 'طلب إدراج بالقائمة السوداء', icon: 'xcircle', kind: 'danger', perm: 'hr.contractors.edit', onClick: () => blacklistDialog('agency', a.id) }) : null)); };
    d = SA.drawer({ title: (agencyOf(id) || {}).name || 'وكالة', subtitle: 'ملف الوكالة', size: 'lg', body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close() }, 'إغلاق')], onClose: () => offs.forEach((o) => o()) }); const offs = ['agencies', 'ctrWorkers', 'ctrRoster'].map((p) => st.subscribe(p, () => { if (body.isConnected) draw(); })); draw(); return d;
  }
  async function agStatus(a, to) { const r = await SA.confirm({ title: (to === 'active' ? 'تفعيل' : 'إيقاف') + ' الوكالة ' + a.name, confirmLabel: 'تأكيد', danger: to !== 'active', reasonRequired: to !== 'active', impact: [to === 'active' ? 'يمكن تسجيل عمالها وإدراجهم في الكشف.' : 'لا يُسمح بدخول عمال الوكالة أثناء الإيقاف.'] }); if (!r.ok) return; const x = await run(() => { st.patch('agencies', a.id, { status: to }); deliver('HR.CTR.AGENCY_CREATED', tgt('agency', a.id, a.name), { before: { status: a.status }, after: { status: to }, reason: r.reason || 'تفعيل بعد المراجعة' }); }); if (x.ok) SA.toast('تم', 'success'); }
  /* requests */
  function requestDialog() {
    const deps = deptOpts().filter((d) => isProdDept(d[0]));
    formDialog({ title: 'طلب عدد عمالة', subtitle: 'يمر على اعتماد HR ثم تأكيد الوكالة', icon: 'truck', fields: [F({ name: 'dept', label: 'القسم', type: 'select', required: true, options: opt(deps, 'اختر…') }), F({ name: 'role', label: 'الدور المطلوب', required: true, value: 'عامل تعبئة' }), F({ name: 'qty', label: 'العدد', type: 'number', required: true, min: 1, value: 3 }), F({ name: 'from', label: 'من', type: 'date', required: true, value: today(), rules: [dateRule] }), F({ name: 'to', label: 'إلى', type: 'date', required: true, value: addDays(today(), 7), rules: [dateRule] })], submitLabel: 'إرسال', validate: (v) => (v.to < v.from ? 'تاريخ النهاية قبل البداية.' : v.qty < 1 ? 'العدد غير صالح' : null),
      async onSubmit(v) { let rec; const x = await run(() => { rec = { id: nextSeq('ctrRequests', 'HCR', 4, true), deptId: v.dept, role: v.role, qty: v.qty, from: v.from, to: v.to, agencyId: null, confirmedQty: 0, requestedBy: me().id, approvedBy: null, status: 'sent', createdAt: nowIso() }; st.insert('ctrRequests', rec, true); deliver('HR.CTR.HEADCOUNT_REQUESTED', tgt('request', rec.id, v.role + ' × ' + v.qty), { after: { dept: deptName(v.dept), qty: v.qty } }); SA.notify({ title: 'طلب عدد عمالة جديد ' + rec.id, body: v.role + ' × ' + v.qty + ' — ' + deptName(v.dept), level: 'action', to: ['R-11', 'R-12'], link: '#/hr/contractors?tab=requests' }); }); if (x.ok) SA.toast('أُرسل الطلب ' + rec.id, 'success'); return x.ok; } });
  }
  function approveRequest(r) { const ags = col('agencies').filter((a) => a.status === 'active').map((a) => [a.id, a.name]); formDialog({ title: 'اعتماد طلب العدد ' + r.id, subtitle: r.role + ' × ' + r.qty, icon: 'check', fields: [F({ name: 'ag', label: 'الوكالة', type: 'select', required: true, options: opt(ags, 'اختر الوكالة…') })], submitLabel: 'اعتماد', async onSubmit(v) { const x = await run(() => { st.patch('ctrRequests', r.id, { status: 'approved', agencyId: v.ag, approvedBy: me().id }); deliver('HR.CTR.HEADCOUNT_REQUESTED', tgt('request', r.id, r.role), { after: { approvedBy: me().name, agency: (agencyOf(v.ag) || {}).name }, reason: 'اعتماد الطلب' }); }); if (x.ok) SA.toast('تم الاعتماد وإرساله للوكالة', 'success'); return x.ok; } }); }
  function confirmRequest(r) { formDialog({ title: 'تأكيد الوكالة', subtitle: (agencyOf(r.agencyId) || {}).name + ' — المطلوب ' + r.qty, icon: 'users', fields: [F({ name: 'q', label: 'العدد المؤكَّد', type: 'number', required: true, min: 0, max: r.qty, value: r.qty, rules: [(v) => (v > r.qty ? 'أكبر من المطلوب' : null)] })], submitLabel: 'تسجيل', async onSubmit(v) { const x = await run(() => { st.patch('ctrRequests', r.id, { confirmedQty: v.q, status: v.q >= r.qty ? 'confirmed_full' : 'confirmed_partial' }); deliver('HR.CTR.HEADCOUNT_CONFIRMED', tgt('request', r.id, r.role), { after: { confirmed: v.q, of: r.qty } }); }); if (x.ok) SA.toast('تم تسجيل التأكيد', 'success'); return x.ok; } }); }
  async function cancelRequest(r) { const c = await SA.confirm({ title: 'إلغاء ' + r.id, danger: true, confirmLabel: 'إلغاء الطلب', reasonRequired: true }); if (!c.ok) return; const x = await run(() => { st.patch('ctrRequests', r.id, { status: 'cancelled' }); deliver('HR.CTR.HEADCOUNT_REQUESTED', tgt('request', r.id, r.role), { reason: 'إلغاء: ' + c.reason }); }); if (x.ok) SA.toast('تم الإلغاء', 'success'); }
  /* blacklist */
  function chainBL(kind) { const my = me().roleId; return (kind === 'agency' ? [{ roleId: 'R-11', label: 'مدير الموارد البشرية' }, { roleId: 'R-02', label: 'المدير العام (للوكالات)' }] : [{ roleId: 'R-11', label: 'مدير الموارد البشرية' }]).map((s) => (s.roleId === my ? { roleId: 'R-01', label: s.label + ' (بديل — الطالب يشغل الدور)' } : s)); }
  function blacklistDialog(kind, id) {
    const subj = kind === 'worker' ? workerOf(id) : agencyOf(id);
    formDialog({ title: 'طلب إدراج بالقائمة السوداء', subtitle: subj.name + (kind === 'agency' ? ' — وكالة (HR Manager + GM)' : ' — عامل'), icon: 'xcircle', fields: [F({ name: 'reason', label: 'السبب (داخلي)', type: 'textarea', required: true, full: true }), F({ name: 'evid', label: 'الأدلة / مرجع المحضر', required: true, full: true })], submitLabel: 'إرسال للاعتماد', kind: 'danger', intro: SA.alert('warning', 'يمنع التسجيل والدخول فورًا بعد الاعتماد. المقترِح لا يعتمد، والسبب التفصيلي لا يُعرض للوكالة.'),
      async onSubmit(v) { const x = await run(() => { const ca = { id: nextSeq('ctrActions', 'CA', 3, false), kind: 'blacklist', subjectType: kind, subjectId: id, title: 'إدراج بالقائمة السوداء: ' + subj.name, reason: v.reason, evidence: v.evid, requestedBy: me().id, status: 'in_approval', approvalId: null, createdAt: nowIso() }; st.insert('ctrActions', ca, true); const ap = SA.requestApproval({ type: 'contractor_action', title: ca.title, requesterId: me().id, chain: chainBL(kind), context: [['المحظور', subj.name + (kind === 'worker' ? ' (' + subj.id + ')' : '')], ['النوع', kind === 'worker' ? 'عامل' : 'وكالة'], ['السبب', 'سري (T4) — يُعرض لـHR Manager'], ['ملاحظة', 'المقترِح ≠ المعتمِد · لا يُبلَّغ سبب الإدراج للوكالة']], ref: { type: 'contractor_action', id: ca.id } }); st.patch('ctrActions', ca.id, { approvalId: ap.id }); }); if (x.ok) SA.toast('أُرسل طلب الإدراج لصندوق الاعتمادات', 'success'); return x.ok; } });
  }
  function ctrApproved(c) {
    if (c.kind === 'blacklist') {
      const subj = c.subjectType === 'worker' ? workerOf(c.subjectId) : agencyOf(c.subjectId); st.insert('ctrBlacklist', { id: nextSeq('ctrBlacklist', 'BL', 3, false), subjectType: c.subjectType, subjectId: c.subjectId, subjectName: subj ? subj.name : c.subjectId, reason: c.reason, evidence: c.evidence, requestedBy: c.requestedBy, approvedBy: me().id, from: today(), to: null, status: 'active', liftedBy: null, liftReason: '' });
      if (c.subjectType === 'worker') { st.patch('ctrWorkers', c.subjectId, { blacklisted: true, status: 'blacklisted' }); st.update('ctrRoster', (l) => { for (let i = l.length - 1; i >= 0; i--) if (l[i].workerId === c.subjectId && l[i].date >= today() && l[i].status === 'expected') l.splice(i, 1); }); } else { st.patch('agencies', c.subjectId, { status: 'blacklisted', blacklisted: true }); st.update('ctrWorkers', (l) => l.forEach((w) => { if (w.agencyId === c.subjectId && w.status !== 'converted') { w.status = 'blacklisted'; w.blacklisted = true; } })); }
      st.patch('ctrActions', c.id, { status: 'approved' }); SA.audit('HR.CTR.BLACKLISTED', { target: tgt(c.subjectType, c.subjectId, subj ? subj.name : ''), reason: c.reason, after: { evidence: c.evidence } }); SA.notify({ title: 'إدراج بالقائمة السوداء: ' + (subj ? subj.name : ''), body: 'يمنع الدخول والتسجيل فورًا.', level: 'info', to: ['R-11', 'R-15'], link: '#/hr/contractors?tab=blacklist' });
    } else if (c.kind === 'convert') {
      const w = workerOf(c.subjectId); if (!w) return; const p = c.payload; let e; if (col('empFiles').some((f) => f.personal.nationalId === w.nationalId)) { st.patch('ctrActions', c.id, { status: 'rejected' }); SA.toast('التحويل تعذّر: الرقم القومي موجود في الموظفين.', 'error'); return; }
      e = createEmployee({ name: w.name, nid: w.nationalId, deptId: p.deptId, positionId: p.positionId, hireDate: p.hireDate, mobile: w.phone, etype: p.etype, probationDays: p.probationDays }, { source: 'تحويل مقاول ' + w.id, reason: 'تحويل من ' + (agencyOf(w.agencyId) || {}).name });
      st.patch('ctrWorkers', w.id, { status: 'converted', convertedEmployeeId: e.id }); if (w.inductionDone) st.update('onbPlans', (l) => { const pl = l.find((q) => q.employeeId === e.id); if (pl) pl.induction = { status: 'done', area: 'من سجل المقاول', topics: [], result: 'pass', conductedBy: null, signedAt: nowIso(), validUntil: null, attempts: [] }; });
      st.patch('ctrActions', c.id, { status: 'approved', employeeId: e.id }); SA.audit('HR.CTR.CONVERTED', { target: tgt('contractor', w.id, w.name), after: { employee: e.empNo, priorDays: c.payload.priorDays }, reason: p.release });
      SA.notify({ title: 'تحويل مقاول لموظف: ' + e.name, body: 'قائمة تعيين وفترة تجربة بدأت (' + e.empNo + ').', level: 'action', to: ['R-11', 'R-12'], link: '#/hr/onboarding' });
    }
  }
  async function liftBlacklist(b) { const r = await SA.confirm({ title: 'رفع الحظر عن ' + b.subjectName, confirmLabel: 'رفع الحظر', reasonRequired: true, impact: ['يعود مسموحًا بالتسجيل والدخول.', 'قرار HR Manager بسبب مسجّل.'] }); if (!r.ok) return; const x = await run(() => { st.patch('ctrBlacklist', b.id, { status: 'lifted', liftedBy: me().id, liftReason: r.reason, to: today() }); if (b.subjectType === 'worker') st.patch('ctrWorkers', b.subjectId, { blacklisted: false, status: 'registered' }); else { st.patch('agencies', b.subjectId, { status: 'under_review', blacklisted: false }); st.update('ctrWorkers', (l) => l.forEach((w) => { if (w.agencyId === b.subjectId && w.status === 'blacklisted') { w.status = 'registered'; w.blacklisted = false; } })); } deliver('HR.CTR.BLACKLIST_LIFTED', tgt(b.subjectType, b.subjectId, b.subjectName), { reason: r.reason }); }); if (x.ok) SA.toast('تم رفع الحظر', 'success'); }
  function convertDialog(w) {
    const days = col('ctrRoster').filter((r) => r.workerId === w.id && ['approved', 'left'].indexOf(r.status) >= 0).length;
    formDialog({ title: 'تحويل عامل لموظف', subtitle: w.name + ' — ' + (agencyOf(w.agencyId) || {}).name, icon: 'userplus', size: 'lg', fields: [F({ name: 'dept', label: 'القسم', type: 'select', required: true, options: opt(deptOpts(), 'اختر…') }), F({ name: 'pos', label: 'الوظيفة', type: 'select', required: true, options: opt(posOpts(), 'اختر…') }), F({ name: 'hire', label: 'تاريخ التعيين', type: 'date', required: true, value: today(), rules: [dateRule] }), F({ name: 'etype', label: 'نوع التوظيف', type: 'select', options: Object.keys(ETYPE).map((k) => [k, ETYPE[k]]), value: 'permanent' }), F({ name: 'pdays', label: 'مدة التجربة (يوم)', type: 'number', min: 1, max: S().probationMaxDays || 90, required: true, value: S().probationMaxDays || 90 }), F({ name: 'release', label: 'مرجع تنازل/إفراج الوكالة', required: true, full: true, hint: 'شروط الوكالة {Open} (BR-CTR-10).' }), F({ name: 'cnt', label: 'احتساب أيام الوكالة (' + days + ' يوم) من التجربة', type: 'checkbox', disabled: true, hint: '{Open} — لم يُحسم (BR-CTR-10)' })],
      intro: SA.alert('info', 'التحويل يدخل «التعيين والتجربة» كتعيين جديد. المقترِح (HR Officer) ≠ المعتمِد (HR Manager) عبر صندوق الاعتمادات. سجل الإسناد السابق يبقى مرجعًا.'), submitLabel: 'إرسال للاعتماد',
      async onSubmit(v) { const x = await run(() => { const ca = { id: nextSeq('ctrActions', 'CA', 3, false), kind: 'convert', subjectType: 'worker', subjectId: w.id, title: 'تحويل مقاول لموظف: ' + w.name, payload: { deptId: v.dept, positionId: v.pos, hireDate: v.hire, etype: v.etype, probationDays: v.pdays, release: v.release, priorDays: days }, requestedBy: me().id, status: 'in_approval', approvalId: null, createdAt: nowIso() }; st.insert('ctrActions', ca, true); const chain = [{ roleId: 'R-11', label: 'مدير الموارد البشرية' }].map((s) => (s.roleId === me().roleId ? { roleId: 'R-01', label: s.label + ' (بديل)' } : s)); const ap = SA.requestApproval({ type: 'contractor_action', title: ca.title, requesterId: me().id, chain, context: [['العامل', w.name + ' (' + w.id + ')'], ['الوكالة', (agencyOf(w.agencyId) || {}).name], ['القسم/الوظيفة', deptName(v.dept) + ' / ' + posTitle(v.pos)], ['أيام العمل السابقة', String(days)], ['ملاحظة', 'احتساب أيام الوكالة من التجربة {Open}']], ref: { type: 'contractor_action', id: ca.id } }); st.patch('ctrActions', ca.id, { approvalId: ap.id }); }); if (x.ok) SA.toast('أُرسل طلب التحويل لاعتماد HR Manager', 'success'); return x.ok; } });
  }

  /* ═════════════════════════ registration · public helpers · missions ═════════════════════════ */
  function renderEmployees(root, ctx) {
    if (!ensure()) { root.append(SA.errorState({ title: 'البيانات غير جاهزة', text: 'أعد تحميل الصفحة.', onRetry: () => location.reload() })); return; }
    bankTick(); const p = ctx.path[0];
    if (p === 'new') return renderEmpForm(root, ctx);
    if (p === 'import') return renderImport(root, ctx);
    if (p === 'quality') return renderQuality(root, ctx);
    if (p === 'duplicates') return renderDuplicates(root, ctx);
    if (p && p !== 'org') return renderProfile(root, ctx, p);
    return renderDirectory(root, ctx);
  }
  function reg(id, render, extra) {
    const d = SA.hrNav.find((x) => x.id === id); if (!d) { console.error('[hr-people] unknown nav id', id); return; }
    SA.register(Object.assign({ id, app: 'hr', group: d.group, title: d.title, icon: d.icon, route: d.route, perm: d.perm, order: d.order, desc: d.desc, render }, extra || {}));
  }
  const dueCount = () => { try { if (!ensure()) return 0; const n = S().dueReminderDays || 30; return flatLines().filter((l) => canSee(l.slip.employeeId) && l.status === 'issued' && l.dueReplaceOn && daysBetween(today(), l.dueReplaceOn) < 0).length; } catch (e) { return 0; } };
  reg('hr-employees', renderEmployees);
  reg('hr-onboarding', renderOnboarding, { badge() { try { if (!ensure()) return null; const n = col('onbPlans').filter((p) => canSee(p.employeeId) && planInfo(p).blockers.length).length + col('probations').filter((p) => canSee(p.employeeId) && ['decision_due', 'overdue'].indexOf(probInfo(p).state) >= 0 && ['confirmed', 'termination_referred'].indexOf(p.status) < 0).length; return n || null; } catch (e) { return null; } } });
  reg('hr-changes', renderChanges, { badge() { try { if (!ensure() || !me()) return null; const n = col('changeRequests').filter(myTurn).length; return n || null; } catch (e) { return null; } } });
  reg('hr-custody', renderCustody, { badge() { return dueCount() || null; } });
  reg('hr-contractors', renderContractors, { badge() { try { if (!ensure() || !ctrOn()) return null; return col('ctrRoster').filter((r) => r.status === 'left').length || null; } catch (e) { return null; } } });

  if (SA.approvals && SA.approvals.typeKeys) { ['job_change', 'custody_chargeback', 'contractor_action'].forEach((k) => { SA.approvals.typeKeys[k] = ['hr.changes.approve']; }); }
  /* approvals → source records; time-based effects (bank delay, probation reminders, scheduled changes) */
  st.subscribe('approvals', () => { try { reconcile(); } catch (e) { console.error('[hr-people] reconcile', e); } });
  SA.on('login', () => setTimeout(() => { try { if (ensure()) reconcile(); } catch (e) { console.error(e); } }, 400));
  SA.on('track', (ev) => { if (ev && ev.name && ev.name.indexOf('route:') === 0) { try { if (ensure()) reconcile(); } catch (e) { console.error(e); } } });

  /** helpers other modules can use (clearance, schedules, payroll …) */
  SA.hrPeople = {
    gate: (empId) => { ensure(); return gateOf(empId); },
    inductionOk: (empId) => { ensure(); return gateOf(empId).open; },
    custodyOpen: (empId) => { ensure(); return custodyOpenOf(empId); },
    settings: () => S(),
    openProfile: (id, tab) => SA.nav('hr/employees/' + id, tab ? { query: { tab } } : undefined),
    approvedSalaryChanges: () => col('salaryChanges').filter((c) => c.status === 'approved'),
    pendingChargebacks: (empId) => col('chargebacks').filter((c) => c.status === 'approved' && (!empId || c.employeeId === empId))
  };

  /* Test Lab missions */
  [
    { id: 'M-HP1', area: 'hr', title: 'ملف موظف: كشف الرقم القومي بسبب مسجّل', persona: 'hr', route: 'hr/employees', est: '2 د', goal: 'افتح ملف موظف → «البيانات الشخصية» → «إظهار» الرقم القومي. لاحظ التخفي التلقائي، ثم افتح سجل التدقيق. جرّب نفس الشيء كـHR Officer (لا زر إظهار).', steps: [{ text: 'افتح دليل الموظفين ثم ملف «ياسر مصطفى»', route: 'hr-employees' }, { text: 'من البيانات الشخصية اضغط «إظهار» واكتب السبب', audit: 'HR.EMPLOYEE.PII_REVEALED' }], detect: [{ audit: 'HR.EMPLOYEE.PII_REVEALED' }] },
    { id: 'M-HP2', area: 'hr', title: 'تعيين موظف جديد وقائمة اليوم الأول', persona: 'hrofficer', route: 'hr/employees/new', est: '4 د', goal: 'أنشئ موظفًا بحالة تجربة (جرّب رقمًا قوميًا مكررًا أولًا)، ثم افتح قائمة التعيين وشوف المهام الموزّعة على أصحابها.', steps: [{ text: 'املأ النموذج — رقم قومي صالح الهيكل (14 رقمًا)', audit: 'HR.EMPLOYEE.CREATED' }, { text: 'افتح «التعيين والتجربة» وشوف القائمة الجديدة', route: 'hr-onboarding' }], detect: [{ audit: 'HR.EMPLOYEE.CREATED' }, { audit: 'HR.ONB.CREATED' }, { route: 'hr-onboarding' }] },
    { id: 'M-HP3', area: 'hr', title: 'بوابة السلامة: لا ماكينة قبل التوعية', persona: 'hr', route: 'hr/onboarding', est: '4 د', goal: 'افتح قائمة «نبيل صفوت» (بوابة مقفولة)، جرّب إسناده لماكينة (مرفوض ويتسجّل عاجل)، ثم سجّل توعية السلامة بتوقيعه وشوف البوابة تنفتح.', steps: [{ text: 'افتح قائمة نبيل صفوت واضغط «جرّب إسناده لماكينة»', audit: 'HR.ONB.GATE_VIOLATION' }, { text: 'سجّل التوعية بتوقيع الموظف', audit: 'HR.ONB.INDUCTION_DONE' }], detect: [{ audit: 'HR.ONB.GATE_VIOLATION' }, { audit: 'HR.ONB.INDUCTION_DONE' }, { audit: 'HR.ONB.GATE_RELEASED' }] },
    { id: 'M-HP4', area: 'hr', title: 'قرار التجربة: تمديد مرة واحدة داخل الحد', persona: 'hr', route: 'hr/onboarding/probation', est: '3 د', goal: 'افتح تجربة «شريف مرزوق» (قرار مستحق): جرّب تمديدًا يتجاوز الحد الأقصى (يُمنع) ثم تمديدًا مسموحًا، وراجع أن التمديد لا يتكرر.', steps: [{ text: 'اتخذ قرار تمديد أكبر من المتاح (ممنوع)' }, { text: 'مدّد بعدد أيام ضمن الحد', audit: 'HR.PROB.EXTENDED' }], detect: [{ audit: 'HR.PROB.EXTENDED' }] },
    { id: 'M-HP5', area: 'hr', title: 'تغيير مرتب كاملًا: طلب ← اعتماد ← أثر في الملف', persona: 'payroll', route: 'hr/changes/new?type=salary', est: '6 د', goal: 'كمسؤول مرتبات اطلب تغيير مرتب لموظف (فصل المهام)، ثم ادخل كمدير موارد بشرية/مالك واعتمد من صندوق الاعتمادات، وبعدها شوف المرتب الجديد وسجل السريان والخطاب في ملف الموظف.', steps: [{ text: 'قدّم طلب تغيير المرتب (حد أدنى للأجور مُفحوص)', audit: 'HR.CHG.REQUESTED' }, { text: 'اعتمد كل خطوات السلسلة من صندوق الاعتمادات', route: 'approvals' }, { text: 'راجع تبويب المرتب والسجل في ملف الموظف', audit: 'HR.CHG.EFFECTIVE' }], detect: [{ audit: 'HR.CHG.REQUESTED' }, { route: 'approvals' }, { audit: 'HR.CHG.EFFECTIVE' }] },
    { id: 'M-HP6', area: 'hr', title: 'صرف عهدة بإيصال موقّع ومقاس', persona: 'hrofficer', route: 'hr/custody', est: '3 د', goal: 'اصرف PPE لموظف: اختر الأصناف والمقاسات ووقّع الموظف على اللوحة. جرّب الصرف بدون توقيع (ممنوع).', steps: [{ text: 'افتح «صرف عهدة» واختر موظفًا' }, { text: 'وقّع واصرف', audit: 'HR.CST.ISSUED' }], detect: [{ audit: 'HR.CST.ISSUED' }] },
    { id: 'M-HP7', area: 'hr', title: 'فقد عهدة: حاسبة السقف والاعتماد', persona: 'hr', route: 'approvals', est: '4 د', goal: 'خصم فقد عهدة CB-2026-0001 ينتظر الاعتماد (اقترحه HR Officer). اعتمده من صندوق الاعتمادات كـHR Manager ثم شوف أثره في «الفقد والخصومات».', steps: [{ text: 'افتح صندوق الاعتمادات واعتمد «خصم فقد عهدة»', audit: 'APPROVAL.APPROVED' }, { text: 'افتح «العهدة ← الفقد والخصومات»', route: 'hr-custody' }], detect: [{ audit: 'HR.CST.CHARGEBACK_APPROVED' }, { route: 'hr-custody' }] },
    { id: 'M-HP8', area: 'hr', title: 'مقاولون: لا دخول للخط بدون توعية', persona: 'hr', route: 'hr/contractors', est: '4 د', goal: 'في كشف اليوم افحص عامل بدون توعية: يدخل البوابة لكن مرفوض عند الخط. سجّل التوعية ثم أدخله الخط. جرّب أيضًا إدراج عامل بالقائمة السوداء.', steps: [{ text: 'افحص العامل عند البوابة ثم حاول دخول الخط', audit: 'HR.CTR.GATE_REFUSED' }, { text: 'سجّل توعية السلامة', audit: 'HR.CTR.INDUCTION_DONE' }], detect: [{ audit: 'HR.CTR.GATE_REFUSED' }, { audit: 'HR.CTR.INDUCTION_DONE' }] },
    { id: 'M-HP9', area: 'hr', title: 'تحويل مقاول لموظف (عبر الاعتماد)', persona: 'hr', route: 'hr/contractors?tab=workers', est: '5 د', goal: 'حوّل عاملًا لموظف: يُرسل طلب اعتماد، تعتمده من الصندوق، فيظهر الموظف الجديد بقائمة تعيين وتجربة.', steps: [{ text: 'من تبويب العمال اختر «تحويل لموظف»' }, { text: 'اعتمد الطلب من صندوق الاعتمادات', route: 'approvals' }, { text: 'افتح التعيين والتجربة', route: 'hr-onboarding' }], detect: [{ route: 'approvals' }, { audit: 'HR.CTR.CONVERTED' }, { route: 'hr-onboarding' }] },
    { id: 'M-HP10', area: 'hr', title: 'تغيير حساب بنكي بمعتمد ثانٍ وتأخير', persona: 'hr', route: 'hr/employees/E-1005?tab=bank', est: '3 د', goal: 'ملف ياسر مصطفى فيه طلب تغيير حساب قدّمته HR Officer. اعتمده كـHR Manager (طالب ≠ معتمد) ثم جرّب «محاكاة مرور التأخير».', steps: [{ text: 'اعتمد طلب تغيير الحساب', audit: 'HR.EMP.BANK_CHANGE_APPROVED' }, { text: 'حاكِ مرور التأخير', audit: 'HR.EMP.BANK_CHANGE_EFFECTIVE' }], detect: [{ audit: 'HR.EMP.BANK_CHANGE_APPROVED' }, { audit: 'HR.EMP.BANK_CHANGE_EFFECTIVE' }] },
    { id: 'M-HP11', area: 'hr', title: 'استيراد موظفين CSV وتقرير التحقق', persona: 'hrofficer', route: 'hr/employees/import', est: '4 د', goal: 'حمّل البيانات التجريبية (فيها أخطاء مقصودة)، راجع تقرير التحقق صفًا بصف، ثم استورد الصفوف الصالحة وجرّب التراجع.', steps: [{ text: 'اضغط «بيانات تجريبية» ثم «تحقق من الملف»', audit: 'HR.EMP.IMPORT_STARTED' }, { text: 'استورد الصفوف الصالحة', audit: 'HR.EMP.IMPORT_COMMITTED' }], detect: [{ audit: 'HR.EMP.IMPORT_STARTED' }, { audit: 'HR.EMP.IMPORT_COMMITTED' }] },
    { id: 'M-HP12', area: 'hr', title: 'كشف التكرار ودمج سجلين', persona: 'hr', route: 'hr/employees/duplicates', est: '4 د', goal: 'سجل «محسن بدوى» مشتبه تكراره بالرقم القومي. قارن واختر الناجي وادمج بسبب وStep-up.', steps: [{ text: 'افتح كشف التكرار وقارن السجلين' }, { text: 'ادمج بسبب وأدخل كود التحقق', audit: 'HR.EMP.MERGED' }], detect: [{ audit: 'HR.EMP.MERGED' }] }
  ].forEach((m) => SA.missions.add(Object.assign({ phase2: false }, m)));
})();
