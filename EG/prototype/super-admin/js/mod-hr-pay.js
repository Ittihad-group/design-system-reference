/* EG Super Admin prototype — mod-hr-pay.js
   HR-13 هيكل المرتب (hr-salary) · HR-14 دورة المرتبات (hr-payroll) · HR-15 السلف والقروض (hr-loans) · HR-16 الصرف ومفردات المرتب (hr-payments) · HR-17 التأمينات والضريبة (hr-gov)
   Routes: #/hr/salary · #/hr/payroll[/:runId[/lines/:empId]] · #/hr/loans[/:loanId] · #/hr/payments · #/hr/gov     (perm per SA.hrNav; wages need hr.salary.view)

   ── مفتاح القواعد القانونية (يملكه وكيل hr-compliance؛ هذا الملف يقرأه فقط) ───────────────────────────────────────────
   settings.hrLegal = {                                   // كل جدول = قائمة إصدارات بتاريخ سريان؛ المحرك يقرأ الساري بتاريخ نهاية فترة الدورة
     period:    { month_days:30, day_hours:8 },
     insurance: [{ id, from:'2026-01-01', status:'pending|approved', emp_rate:11, er_rate:18.75, min:2700, max:16700,
                   branches:[{ id:'pension', ar:'المعاش', emp:9, er:12 }, …] }],
     tax:       [{ id, from:'2024-03-01', status, exemption:20000, months:12, deductible:['ins_employee'], brackets:[{ upTo:40000, rate:0 }, … , { upTo:null, rate:27.5 }] }],
     overtime:  [{ id, from:'2025-09-01', status, day:1.35, night:1.70 }],
     minWage:   [{ id, from:'2025-03-01', status, monthly:7000, hourly:28, basis:null|'basic'|'basic_fixed'|'gross_fixed' }],
     caps:      [{ id, from, status, penalty_days:5, loan_pct:10, creditor_pct:25, alimony_pct:50, damage_days_month:5, damage_months_total:2 }],
     raise:     [{ id, from, status, pct:3, floor:250 }]
   }
   غياب المفتاح/الجدول ⇒ يُستخدم fallback مأخوذ من docs/hr/research/egypt-compliance.md (§1.6 · §2 · §3) موسوم Pending [Law] / DEMO. لا أرقام قانونية خارج هذا الجدول.
   API للوحدات الأخرى:  SA.hrPay.rules(asOfISO) · SA.hrPay.compFor(empId, asOfISO) · SA.hrPay.payslipFor(empId) · SA.hrPay.loansOf(empId) · SA.hrPay.reconcile()

   ── مجموعات الـstore التي تنشئها هذه الوحدة (lazy، flag meta.hrPaySeeded) ──────────────────────────────────────────
   payComponents[] كتالوج المكونات · payGrades[] الدرجات · compAssignments[] التعويضات بتاريخ سريان {employeeId, from, lines:[{code,amount}], source, status} ·
   payProfiles[] طريقة الصرف/الحساب لكل موظف (مقنّع) · bankChanges[] طلبات تغيير الحساب · payOtInputs[] أوفرتايم تجريبي (يُستخدم فقط إن لم توجد مجموعة أوفرتايم لوكيل الوقت) ·
   deductions[] (DED-) · payBatches[] دفعات البنك/النقدي · payslips[] (PAY-) · raiseCycles[] · govCalendar[] · govForms[] · govLog[] (append-only) · settings.hrPayroll
   مُوسَّعة: payrollRuns[] (lines بالقروش، inputs، rules، checks، resolutions، timeline…) · loans[] (schedule، ledger append-only) · salaryChanges[] (effectiveFrom/components)
   المبالغ داخل lines بالقروش (integer)؛ باقي المجموعات والحقول المشتركة (gross/net على الدورة، amount على السلفة) بالجنيه.

   ── الصلاحيات المستخدمة ── hr.salary_structure.view|edit · hr.payroll.view|prepare|approve|release · hr.loans.view|create|approve · hr.payments.view|export · hr.gov.view|edit
      hr.salary.view (T3) · hr.salary.change.request · hr.pii.reveal (كشف الحساب/اعتماد تغييره) · hr.export.sensitive (تصدير) · hr.settings.edit (إعدادات المرتبات)
   ── التدقيق ── الموجود: HR.PAYROLL.PREPARED/APPROVED/RELEASED · HR.ADVANCE.REQUESTED/APPROVED · HR.SALARY.VIEWED/CHANGE_REQUESTED/CHANGE_APPROVED · HR.EXPORT.SENSITIVE · HR.EMPLOYEE.PII_REVEALED.
      المضاف (addAudit): HR.PAYROLL.* · HR.SALARY.* · HR.ADVANCE.* · HR.LOAN.* · HR.DEDUCTION.* · HR.PAYMENTS.* · HR.BANK_ACCOUNT.* · HR.PAYSLIP.VIEWED · HR.GOV.*  (القائمة أسفل).
   ── لا ادعاء تكامل مع التأمينات (NOSI) أو الضرائب (ETA) أو بنك: كلها تقارير/ملفات للتصدير والتسليم يدوي. */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  const API = (SA.hrPay = {});
  const FLAG = 2;

  /* ───────────────────────── helpers ───────────────────────── */
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const pad = (n) => String(n).padStart(2, '0');
  const col = (n) => st.get(n) || [];
  const meU = () => SA.session.user;
  const meId = () => { const u = SA.session.user; return u ? u.id : null; };
  const emps = () => col('employees');
  const empById = (id) => emps().find((e) => e.id === id) || null;
  const empName = (id) => { const e = empById(id); return e ? e.name : id || '—'; };
  const empOfUser = (uid) => emps().find((e) => e.userId === uid) || null;
  const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const rnd = (x) => (x < 0 ? -Math.floor(-x + 0.5 + 1e-9) : Math.floor(x + 0.5 + 1e-9));
  const P = (egp) => rnd(Number(egp || 0) * 100);                       // جنيه → قروش
  const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fp = (p) => nf.format(Math.round(p) / 100);                      // قروش → «8,988.00»
  const fe = (egp) => nf.format(Number(egp || 0));
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
  const uniq = (a) => Array.from(new Set(a));
  const NOPERM = (k) => 'ليست من صلاحياتك (' + k + ')';
  const canWages = () => SA.canSensitive('hr.salary.view');
  const actorOf = (uid) => { const u = SA.userById(uid); return u ? { id: u.id, name: u.name, roleId: u.roleId } : undefined; };
  const PER = {
    parse(p) { const a = String(p).split('-').map(Number); const y = a[0], m = a[1]; const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { y, m, days: last, start: y + '-' + pad(m) + '-01', end: y + '-' + pad(m) + '-' + pad(last) }; },
    add(p, n) { const x = PER.parse(p); const d = new Date(Date.UTC(x.y, x.m - 1 + n, 1)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); },
    label(p) { const x = PER.parse(p); return MONTHS[x.m - 1] + ' ' + x.y; },
    of(iso) { return String(iso).slice(0, 7); },
    cur() { return todayISO().slice(0, 7); }
  };
  const addDays = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
  const hashStr = (s) => { let a = 5381, b = 52711; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = ((a << 5) + a + c) >>> 0; b = ((b << 5) ^ (b >>> 27) ^ c) >>> 0; } return (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')); };
  /** SHA-256 (hex) when WebCrypto is available (https/localhost), else a labelled fallback hash. */
  function sha256Hex(text) {
    try { if (window.crypto && crypto.subtle) return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then((b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('')); } catch (e) { /* fall through */ }
    return Promise.resolve('demo-' + hashStr(text) + hashStr(text.split('').reverse().join('')));
  }
  const aud = (code, target, o) => SA.audit(code, Object.assign({ target }, o || {}));
  const AUDITS = [
    ['HR.PAYROLL.RUN_CREATED', 'فتح دورة مرتبات', 'medium'], ['HR.PAYROLL.INPUTS_PULLED', 'سحب وتجميد مدخلات الدورة', 'info'], ['HR.PAYROLL.CALCULATED', 'حساب دورة المرتبات', 'medium'],
    ['HR.PAYROLL.CHECK_WAIVED', 'تجاوز فحص مانع في الدورة', 'high'], ['HR.PAYROLL.REJECTED', 'رفض/إرجاع كشف المرتبات', 'medium'], ['HR.PAYROLL.PERIOD_LOCKED', 'قفل فترة المرتبات', 'high'],
    ['HR.PAYROLL.PAYSLIPS_PUBLISHED', 'نشر مفردات المرتب', 'medium'], ['HR.PAYROLL.REGISTER_VIEWED', 'قراءة كشف المرتبات (T3)', 'info'], ['HR.PAYROLL.REGISTER_EXPORTED', 'تصدير كشف المرتبات', 'high'],
    ['HR.PAYROLL.ARREARS_GENERATED', 'توليد دورة فروق', 'medium'], ['HR.PAYROLL.REVERSAL_CREATED', 'إنشاء مستند عكس لدورة', 'high'], ['HR.PAYROLL.PENDING_RULES_ACCEPTED', 'قبول قواعد Pending لدورة', 'high'],
    ['HR.PAYROLL.SETTINGS_CHANGED', 'تغيير إعدادات المرتبات', 'high'], ['HR.SALARY.COMPONENT_CHANGED', 'تعديل مكوّن مرتب', 'high'], ['HR.SALARY.GRADE_CHANGED', 'تعديل درجة/نطاق مرتب', 'medium'],
    ['HR.SALARY.RAISE_CYCLE_CREATED', 'إنشاء دورة علاوة سنوية', 'medium'], ['HR.SALARY.RAISE_CYCLE_APPLIED', 'تطبيق دورة علاوة سنوية', 'high'], ['HR.ADVANCE.REJECTED', 'رفض سلفة', 'medium'],
    ['HR.ADVANCE.DISBURSED', 'تأكيد صرف سلفة', 'high'], ['HR.LOAN.SETTLED', 'تسوية مبكرة لسلفة', 'high'], ['HR.LOAN.CLOSED', 'إغلاق سلفة', 'medium'], ['HR.LOAN.DEFERRED', 'تأجيل قسط سلفة', 'medium'],
    ['HR.DEDUCTION.CREATED', 'إنشاء خصم (DED)', 'medium'], ['HR.DEDUCTION.APPROVED', 'اعتماد خصم (DED)', 'high'], ['HR.PAYMENTS.BANK_FILE_EXPORTED', 'تصدير ملف تحويل بنكي', 'high'],
    ['HR.PAYMENTS.CASH_SHEET_EXPORTED', 'تصدير كشف صرف نقدي', 'high'], ['HR.PAYMENTS.STATUS_RECORDED', 'تسجيل حالة صرف', 'medium'], ['HR.PAYMENTS.RETRY_CREATED', 'إعادة محاولة صرف بدفعة جديدة', 'medium'],
    ['HR.PAYMENTS.PV_LINKED', 'ربط سند صرف PV-', 'medium'], ['HR.BANK_ACCOUNT.CHANGE_REQUESTED', 'طلب تغيير حساب بنكي', 'high'], ['HR.BANK_ACCOUNT.CHANGE_APPROVED', 'اعتماد تغيير حساب بنكي', 'high'],
    ['HR.BANK_ACCOUNT.CHANGE_REJECTED', 'رفض تغيير حساب بنكي', 'medium'], ['HR.PAYSLIP.VIEWED', 'اطلاع على مفردة مرتب', 'info'], ['HR.GOV.REPORT_EXPORTED', 'تصدير تقرير حكومي', 'high'],
    ['HR.GOV.SUBMISSION_LOGGED', 'تسجيل تسليم حكومي (يدوي)', 'medium'], ['HR.GOV.CALENDAR_CHANGED', 'تعديل تقويم الالتزامات', 'medium']
  ];
  AUDITS.forEach((a) => SA.catalog.addAudit(a[0], a[1], a[2], 'hr'));

  /* ───────────────────────── safe formula evaluator (BR-SAL-11: no eval) ───────────────────────── */
  const FN_VARS = ['basic', 'hours', 'days', 'paid_days', 'month_days', 'day_hours', 'rate', 'att_days'];
  function evalFormula(src, vars) {
    src = String(src || '').trim(); if (!src) throw new Error('المعادلة فارغة');
    if (!/^[\s\d.A-Za-z_+\-*/(),]*$/.test(src)) throw new Error('رموز غير مسموحة في المعادلة');
    const T = (src.match(/\d+\.?\d*|[A-Za-z_][A-Za-z0-9_]*|[-+*/(),]/g) || []); let i = 0;
    const FN = { min: Math.min, max: Math.max, round: (x) => rnd(x), abs: Math.abs };
    const peek = () => T[i], next = () => T[i++];
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const o = next(); const r = term(); v = o === '+' ? v + r : v - r; } return v; }
    function term() { let v = unary(); while (peek() === '*' || peek() === '/') { const o = next(); const r = unary(); if (o === '/' && r === 0) throw new Error('قسمة على صفر'); v = o === '*' ? v * r : v / r; } return v; }
    function unary() { if (peek() === '-') { next(); return -unary(); } return atom(); }
    function atom() {
      const t = next(); if (t === undefined) throw new Error('المعادلة ناقصة');
      if (t === '(') { const v = expr(); if (next() !== ')') throw new Error('قوس ناقص'); return v; }
      if (/^\d/.test(t)) return parseFloat(t);
      if (/^[A-Za-z_]/.test(t)) {
        if (peek() === '(') { next(); const args = []; if (peek() !== ')') { args.push(expr()); while (peek() === ',') { next(); args.push(expr()); } } if (next() !== ')') throw new Error('قوس ناقص'); if (!FN[t]) throw new Error('دالة غير مسموحة: ' + t); return FN[t].apply(null, args); }
        if (!Object.prototype.hasOwnProperty.call(vars, t)) throw new Error('متغير غير معرّف: ' + t); return vars[t];
      }
      throw new Error('رمز غير متوقع: ' + t);
    }
    const v = expr(); if (i < T.length) throw new Error('رمز زائد: ' + T[i]); return v;
  }
  API.evalFormula = evalFormula;

  /* ───────────────────────── legal rule tables (read-only here — owner: hr-compliance) ───────────────────────── */
  const BR = [{ id: 'pension', ar: 'المعاش (الشيخوخة والعجز والوفاة)', emp: 9, er: 12 }, { id: 'sickness', ar: 'المرض', emp: 1, er: 3.25 }, { id: 'injury', ar: 'إصابات العمل', emp: 0, er: 1.5 }, { id: 'unemployment', ar: 'البطالة', emp: 0, er: 1 }, { id: 'gratuity', ar: 'نظام المكافأة', emp: 1, er: 1 }];
  const DEF = {
    period: { month_days: 30, day_hours: 8 },
    insurance: [
      { id: 'INS-2025', from: '2025-01-01', status: 'pending', emp_rate: 11, er_rate: 18.75, min: 2300, max: 14500, branches: BR },
      { id: 'INS-2026', from: '2026-01-01', status: 'pending', emp_rate: 11, er_rate: 18.75, min: 2700, max: 16700, branches: BR }],
    tax: [{ id: 'TAX-2024-03', from: '2024-03-01', status: 'pending', exemption: 20000, months: 12, deductible: ['ins_employee'], brackets: [{ upTo: 40000, rate: 0 }, { upTo: 55000, rate: 10 }, { upTo: 70000, rate: 15 }, { upTo: 200000, rate: 20 }, { upTo: 400000, rate: 22.5 }, { upTo: 1200000, rate: 25 }, { upTo: null, rate: 27.5 }] }],
    overtime: [{ id: 'OT-2025-09', from: '2025-09-01', status: 'pending', day: 1.35, night: 1.7 }],
    minWage: [{ id: 'MW-2025-03', from: '2025-03-01', status: 'pending', monthly: 7000, hourly: 28, basis: null }],
    caps: [{ id: 'CAP-2025-09', from: '2025-09-01', status: 'pending', penalty_days: 5, loan_pct: 10, creditor_pct: 25, alimony_pct: 50, damage_days_month: 5, damage_months_total: 2 }],
    raise: [{ id: 'RS-2025-03', from: '2025-03-01', status: 'pending', pct: 3, floor: 250 }]
  };
  const RULE_TABLES = [['insurance', 'جدول التأمينات الاجتماعية'], ['tax', 'جدول ضريبة كسب العمل'], ['overtime', 'مضاعفات الأوفرتايم'], ['minWage', 'الحد الأدنى للأجر'], ['caps', 'سقوف الخصم'], ['raise', 'العلاوة السنوية']];
  function legalStore() { const s = st.get('settings') || {}; return s.hrLegal || (s.hrCompliance && s.hrCompliance.legal) || null; }
  const pickVer = (list, asOf) => (list || []).filter((x) => x && x.from <= asOf).sort((a, b) => (a.from < b.from ? 1 : -1))[0] || null;
  /** Resolved rule set as of a date (default today): {insurance,tax,overtime,minWage,caps,raise,period,pending,missing,source}. */
  API.rules = function (asOf) {
    asOf = asOf || todayISO(); const L = legalStore() || {};
    const out = { asOf, missing: [], pending: false, source: legalStore() ? 'settings' : 'fallback', tables: {} };
    RULE_TABLES.forEach((t) => {
      const k = t[0]; const fromStore = Array.isArray(L[k]) && L[k].length ? L[k] : null; const v = pickVer(fromStore || DEF[k], asOf);
      if (!v) { out[k] = null; out.missing.push(k); return; }
      out[k] = Object.assign(SA.clone(v), { src: fromStore ? 'settings' : 'fallback' }); if (v.status !== 'approved') out.pending = true;
    });
    out.period = Object.assign({}, DEF.period, L.period || {});
    return out;
  };
  const rulesLabel = (R) => RULE_TABLES.filter((t) => R[t[0]]).map((t) => R[t[0]].id + (R[t[0]].status === 'approved' ? '' : ' [Pending]')).join(' · ');

  /* ───────────────────────── seed (lazy, idempotent) ───────────────────────── */
  const CAT = [
    // code, ar, en, kind, nature, taxable, insurable, calcText, prorate, prorateText, rule, taxNote, insNote
    ['BASIC', 'الأجر الأساسي', 'Basic wage', 'basic', 'basic', 1, 1, 'مبلغ ثابت لكل موظف', 'paydays', 'أيام الدفع'],
    ['TRANSPORT', 'بدل انتقال', 'Transport allowance', 'allowance', 'variable', 1, 0, 'مبلغ ثابت', 'attendance', 'أيام الحضور'],
    ['MEAL', 'بدل وجبة', 'Meal allowance', 'allowance', 'variable', 1, 1, 'لكل يوم حضور', 'attendance', 'أيام الحضور'],
    ['SHIFT', 'بدل وردية', 'Shift allowance', 'allowance', 'variable', 1, 1, 'لكل وردية', 'none', 'بدون'],
    ['NIGHT', 'بدل ليلي', 'Night allowance', 'allowance', 'variable', 1, 1, 'لكل وردية ليلية', 'none', 'بدون'],
    ['INC_PROD', 'حافز إنتاج', 'Production incentive', 'incentive', 'variable', 1, 1, 'معادلة من بيانات الإنتاج {Open} — حاليًا مبلغ من التعويض', 'none', 'بوابة حضور'],
    ['INC_ATT', 'حافز حضور', 'Attendance bonus', 'incentive', 'variable', 1, 1, 'شرط: لا غياب غير مبرر', 'none', 'بدون', 'no_unexcused_absence'],
    ['OT_DAY', 'أوفرتايم نهاري', 'Overtime (day)', 'overtime', 'variable', 1, 1, 'ساعات × سعر الساعة × مضاعف النهاري (من جدول القواعد)', 'none', 'بدون'],
    ['OT_NIGHT', 'أوفرتايم ليلي', 'Overtime (night)', 'overtime', 'variable', 1, 1, 'ساعات × سعر الساعة × مضاعف الليلي (من جدول القواعد)', 'none', 'بدون'],
    ['ABSENCE', 'خصم غياب / إجازة بلا أجر', 'Unpaid absence', 'reduction', '', 0, 0, 'أيام × الأساسي ÷ قاعدة الشهر (يُطبَّق عبر أيام الدفع)', 'none', '—', '', 'يخفّض الوعاء', 'يخفّض الوعاء'],
    ['PENALTY', 'جزاء تأديبي (خصم)', 'Disciplinary deduction', 'deduction', '', 0, 0, 'مبلغ أو أيام مع سقف', 'none', '—', '', 'بعد الضريبة', '—'],
    ['LOAN', 'قسط سلفة', 'Loan instalment', 'deduction', '', 0, 0, 'من جدول السداد (HR-15)', 'none', '—', '', 'بعد الضريبة', '—'],
    ['CREDITOR', 'خصم دائن / نفقة', 'Creditor / alimony', 'deduction', '', 0, 0, 'نسبة ≤ سقف من الصافي بعد الضريبة والتأمين', 'none', '—', '', 'بعد الضريبة والتأمين', '—'],
    ['INS_EMP', 'تأمينات: حصة العامل', 'Insurance — employee', 'statutory', '', 0, 0, 'جدول قواعد التأمينات', 'none', '—', '', 'يُخصم من الوعاء الضريبي', '—'],
    ['INS_ER', 'تأمينات: حصة صاحب العمل', 'Insurance — employer', 'employer', '', 0, 0, 'جدول قواعد التأمينات', 'none', '—', '', '—', '—'],
    ['TAX', 'ضريبة كسب العمل', 'Payroll income tax', 'statutory', '', 0, 0, 'جدول الشرائح + الإعفاء الشخصي', 'none', '—', '', '—', '—'],
    ['MARTYRS', 'صندوق تكريم الشهداء', "Martyrs' fund", 'statutory', '', 0, 0, 'جدول قواعد — من يتحمّله؟ Pending (غير مفعّل)', 'none', '—', '', '—', '—'],
    ['ARREARS', 'فروق / أثر رجعي', 'Arrears', 'adjustment', '', 1, 1, 'من مستند التصحيح', 'none', '—', '', 'حسب المكوّن الأصلي', 'حسب الأصل']
  ];
  const KIND_AR = { basic: 'أساسي', allowance: 'بدل', incentive: 'حافز', overtime: 'أوفرتايم', reduction: 'تخفيض استحقاق', deduction: 'خصم', statutory: 'قانوني', employer: 'مساهمة صاحب عمل', adjustment: 'تسوية' };
  const GRADES = [['G1', 'الدرجة 1 — عمالة فنية', 7000, 9000], ['G2', 'الدرجة 2 — فني أول / إداري', 9000, 12000], ['G3', 'الدرجة 3 — مشرف / أخصائي', 12000, 18000], ['G4', 'الدرجة 4 — مدير إدارة', 18000, 28000], ['G5', 'الدرجة 5 — إدارة عليا', 28000, 45000]];
  const gradeFor = (basic) => (GRADES.find((g) => basic <= g[3]) || GRADES[GRADES.length - 1])[0];
  function splitAllow(e) {
    const A = (e.salary && e.salary.allowances) || 0, B = (e.salary && e.salary.basic) || 0; const tr = Math.round(A * 0.35 / 50) * 50, meal = Math.round(A * 0.30 / 10) * 10, rest = A - tr - meal;
    const lines = [{ code: 'BASIC', amount: B }]; if (tr > 0) lines.push({ code: 'TRANSPORT', amount: tr }); if (meal > 0) lines.push({ code: 'MEAL', amount: meal }); if (rest > 0) lines.push({ code: e.shift === 'day' ? 'INC_ATT' : 'SHIFT', amount: rest });
    return lines;
  }
  const mkSchedule = (amount, n, firstMonth) => {
    const total = P(amount), base = rnd(total / n); const rows = []; let acc = 0;
    for (let i = 1; i <= n; i++) { const p = i < n ? base : total - acc; acc += p; rows.push({ n: i, month: PER.add(firstMonth, i - 1), amount: p / 100, status: 'scheduled' }); }
    return rows;
  };
  API.mkSchedule = mkSchedule;
  const MIN_INSTALMENTS = (amount, capEgp) => (capEgp > 0 ? Math.ceil(amount / capEgp) : null);

  function seed() {
    const S = st.get('settings') || {};
    if (!S.hrPayroll) st.set('settings.hrPayroll', { varianceNetPct: null, varianceEmpPct: null, minWageBasis: 'basic', minWageBasisDemo: true, loanCapCompanyPct: null, loanMaxMultiple: null, loanMaxInstallments: null, loanMaxConcurrent: null, loanFinanceLimit: null, loanGmLimit: null, bankHoldHours: 24, cashRoundTo: null, bankProfile: { encoding: 'utf8bom', delimiter: ',', decimal: '.', nameLang: 'ar', maxRecords: null, debitAccountMasked: '••••0000' }, denoms: [200, 100, 50, 20, 10, 5, 1] });
    const E = emps();
    st.set('payComponents', CAT.map((c, i) => ({ id: 'PC-' + c[0], code: c[0], name: c[1], nameEn: c[2], kind: c[3], nature: c[4], taxable: !!c[5], insurable: !!c[6], calcText: c[7], prorate: c[8], prorateText: c[9], rule: c[10] || '', formula: '', taxNote: c[11] || '', insNote: c[12] || '', assignable: ['basic', 'allowance', 'incentive'].indexOf(c[3]) >= 0, system: ['statutory', 'employer', 'reduction', 'deduction', 'overtime', 'adjustment'].indexOf(c[3]) >= 0, order: (i + 1) * 10, show: true, status: 'active', review: 'pending', from: '2026-01-01', glHint: '', version: 1, history: [] })));
    st.set('payGrades', GRADES.map((g) => ({ id: g[0], name: g[1], min: g[2], max: g[3], status: 'active', demo: true })));
    /* compensation assignments (effective-dated) */
    const CA = []; let caN = 0; const hist = ['E-1005', 'E-1008', 'E-1014', 'E-1017', 'E-1018', 'E-1020'];
    E.forEach((e) => {
      const lines = splitAllow(e); const mk = (from, ls, src, extra) => CA.push(Object.assign({ id: 'CA-' + String(++caN).padStart(4, '0'), employeeId: e.id, from, gradeId: gradeFor(ls[0].amount), lines: ls, source: src, status: 'approved', approvalId: null, createdBy: 'U-26', createdAt: ago(60), reason: src === 'hire' ? 'تعويض التعيين' : 'علاوة سنوية', demo: true }, extra || {}));
      const raiseOn = e.hireDate ? addDays(e.hireDate, 365) : null;
      if (hist.indexOf(e.id) >= 0 && raiseOn && raiseOn < addDays(todayISO(), -45)) {
        const old = lines.map((l) => ({ code: l.code, amount: l.code === 'BASIC' ? Math.round(l.amount * 0.92 / 100) * 100 : l.amount }));
        mk(e.hireDate, old, 'hire'); mk(raiseOn.slice(0, 8) + '01', lines, 'raise');
      } else mk(e.hireDate || '2024-01-01', lines, 'hire');
    });
    st.set('compAssignments', CA);
    /* payment profiles */
    const cashIds = ['E-1029', 'E-1030'];
    st.set('payProfiles', E.map((e, i) => { const cash = e.employmentType === 'daily' || cashIds.indexOf(e.id) >= 0; const miss = e.id === 'E-1026'; const last4 = miss || cash ? null : e.bankLast4; return { id: 'PP-' + e.id, employeeId: e.id, method: cash ? 'cash' : 'bank', bank: cash ? '' : 'بنك تجريبي — فرع ' + (e.city || 'المنصورة'), last4, account: last4 ? 'EG00 0001 0002 0000 0000 ' + last4 : '', verifiedAt: last4 ? ago(200) : null, updatedAt: ago(200) }; }));
    st.set('bankChanges', []);
    /* demo inputs: overtime + attendance absences (dates fixed to the seeded periods) */
    const ot = (id, emp, date, kind, hours, status) => ({ id: 'OT-P-' + id, employeeId: emp, date, kind, hours, status, source: 'payroll-demo' });
    st.set('payOtInputs', [ot('01', 'E-1021', '2026-09-08', 'day', 6, 'approved'), ot('02', 'E-1025', '2026-09-15', 'night', 4, 'approved'), ot('03', 'E-1014', '2026-09-22', 'day', 8, 'approved'),
      ot('04', 'E-1020', '2026-10-06', 'day', 8, 'approved'), ot('05', 'E-1021', '2026-10-08', 'day', 6, 'approved'), ot('06', 'E-1021', '2026-10-14', 'night', 4, 'approved'), ot('07', 'E-1022', '2026-10-15', 'day', 4, 'approved'),
      ot('08', 'E-1025', '2026-10-20', 'night', 6, 'approved'), ot('09', 'E-1014', '2026-10-22', 'day', 10, 'approved'), ot('10', 'E-1017', '2026-10-27', 'day', 3, 'pending'), ot('11', 'E-1026', '2026-10-28', 'night', 2, 'pending')]);
    const absn = (id, emp, date, rev) => { const e = empById(emp); return { id: 'AT-PAY-' + id, employeeId: emp, date, in: null, out: null, status: 'absent', shift: e ? e.shift : 'day', reviewed: !!rev, excused: false, source: 'payroll-demo' }; };
    st.update('attendance', (l) => { [absn('01', 'E-1008', '2026-09-09', 1), absn('02', 'E-1008', '2026-09-10', 1), absn('03', 'E-1022', '2026-09-21', 1), absn('04', 'E-1025', '2026-10-12', 0), absn('05', 'E-1025', '2026-10-13', 0)].forEach((r) => { if (!l.some((x) => x.id === r.id)) l.push(r); }); });
    st.set('deductions', [
      { id: 'DED-2026-0001', employeeId: 'E-1021', type: 'penalty', days: 1, amount: null, month: '2026-10', status: 'approved', source: 'HR-20', reason: 'تأخير متكرر — قرار تأديبي (تجريبي)', legalBasis: 'مادة 143/148 (Pending)', createdBy: 'U-25', createdAt: ago(12), approvedBy: 'U-08', approvedAt: ago(10), appliedRun: null },
      { id: 'DED-2026-0002', employeeId: 'E-1020', type: 'creditor', days: null, amount: 600, month: '2026-10', status: 'approved', source: 'manual', reason: 'خصم دائن بموافقة كتابية (تجريبي)', legalBasis: 'مادة 114 (Pending) — موافقة كتابية', createdBy: 'U-25', createdAt: ago(14), approvedBy: 'U-08', approvedAt: ago(11), appliedRun: null }]);
    /* loans: extend the seeded request + two active ones (so payroll has instalments to deduct) */
    st.update('loans', (list) => {
      list.forEach((l) => { if (l.id === 'LN-2026-0001') Object.assign(l, { installments: 6, monthly: 500, schedule: null, ledger: [], reason: 'ظرف عائلي (تجريبي)', createdBy: 'U-29', disbursedAt: null, firstMonth: null }); });
      const mkLoan = (id, emp, kind, amount, n, first, disb, paidN, reason) => {
        const sch = mkSchedule(amount, n, first); const ledger = [{ id: id + '-L1', ts: disb + 'T09:00:00.000Z', type: 'disbursement', amount, ref: 'PV-2026-' + (id.slice(-2) + 10), by: 'U-06', note: 'صرف السلفة (سند PV- — Open)' }];
        sch.forEach((r) => { if (r.n <= paidN) { r.status = 'deducted'; r.runId = 'PR-' + r.month; ledger.push({ id: id + '-L' + (r.n + 1), ts: r.month + '-27T09:00:00.000Z', type: 'installment', amount: -r.amount, ref: 'PR-' + r.month, by: 'SYSTEM', note: 'قسط ' + r.n + '/' + n }); } });
        return { id, employeeId: emp, kind, amount, monthly: sch[0].amount, installments: n, status: 'active', requestedAt: ago(150), approvalId: null, reason, createdBy: 'U-26', disbursedAt: disb, firstMonth: first, schedule: sch, ledger };
      };
      list.push(mkLoan('LN-2026-0002', 'E-1008', 'loan', 6000, 12, '2026-06', '2026-05-28', 4, 'قرض شخصي بدون فوائد (تجريبي)'));
      list.push(mkLoan('LN-2026-0003', 'E-1020', 'advance', 2000, 4, '2026-09', '2026-08-30', 1, 'سلفة طارئة (تجريبي)'));
    });
    /* government calendar + forms (all {Open}/Pending — النظام لا يدّعي تكاملًا) */
    st.set('govCalendar', [
      { id: 'GC-01', title: 'سداد اشتراكات التأمينات الاجتماعية', kind: 'insurance', freq: 'monthly', day: 1, due: 'يوم 1 من الشهر التالي', doc: 'pending', note: 'قانون 148 م121 — غرامة تأخير = متوسط عائد أذون الخزانة + 2%/شهر وتُعفى خلال 15 يومًا (Pending [Law])', enabled: true },
      { id: 'GC-02', title: 'بيانات تسجيل موظف جديد (استمارة 1 + 111)', kind: 'insurance', freq: 'event', day: null, due: null, doc: 'unverified', note: 'مهلة التسجيل في اللائحة التنفيذية ولم تُوثَّق {Open}', enabled: true },
      { id: 'GC-03', title: 'إنهاء الخدمة لدى التأمينات (استمارة 6؟)', kind: 'insurance', freq: 'event', day: null, due: null, doc: 'unverified', note: 'رقم الاستمارة غير مؤكد في أي مصدر مفتوح {Open}', enabled: true },
      { id: 'GC-04', title: 'تحديث بيانات الأجور بعد تغيير حدود يناير', kind: 'insurance', freq: 'annual', day: null, due: null, doc: 'unverified', note: 'NOSI تعلن الحدود عادةً نهاية نوفمبر — الموعد {Open}', enabled: true },
      { id: 'GC-05', title: 'نموذج الاحتساب الشهري لضريبة كسب العمل + السداد', kind: 'tax', freq: 'monthly', day: 15, due: 'يوم 15 من الشهر التالي', doc: 'pending', note: 'منظومة ETA الموحدة — التأخير بعد 15 يعيد الاحتساب مع غرامة تأخير (Pending)', enabled: true },
      { id: 'GC-06', title: 'الإقرار الربع سنوي (نموذج 4 مرتبات)', kind: 'tax', freq: 'quarterly', day: null, due: null, doc: 'unverified', note: 'يناير/أبريل/يوليو/أكتوبر — الموعد {Open} يُؤكَّد مع المحاسب', enabled: true },
      { id: 'GC-07', title: 'التسوية السنوية (نموذج 9 تسويات)', kind: 'tax', freq: 'annual', day: null, due: 'نهاية يناير (مصدر 2021)', doc: 'unverified', note: 'غير موثّق لعام 2026', enabled: true },
      { id: 'GC-08', title: 'شهادة نهاية السنة للموظف (إجمالي الأجر والضريبة)', kind: 'internal', freq: 'annual', day: null, due: null, doc: 'internal', note: 'شهادة داخلية من بيانات الدورات — ليست نموذجًا حكوميًا', enabled: true },
      { id: 'GC-09', title: 'بيان القوى العاملة للوزارة', kind: 'internal', freq: 'annual', day: null, due: null, doc: 'pending', note: 'مادة 8 من مواد الإصدار — الدورية {Open}', enabled: true },
      { id: 'GC-10', title: 'صندوق تكريم الشهداء (مطالبة مع مطالبة الضريبة)', kind: 'tax', freq: 'monthly', day: null, due: 'مع مطالبة الضريبة', doc: 'pending', note: 'الأساس ومن يتحمله غير واضح — غير مفعّل', enabled: false }]);
    st.set('govForms', [
      { id: 'GF-01', name: 'استمارة 1 — تسجيل مؤمَّن عليه جديد', authority: 'NOSI', source: 'مصدر ثانوي', deadline: null }, { id: 'GF-02', name: 'استمارة 2 — فتح ملف المنشأة / بيانات الأجور؟', authority: 'NOSI', source: 'مصدر ثانوي', deadline: null },
      { id: 'GF-03', name: 'استمارة 111 — تقرير اللياقة الطبية', authority: 'NOSI', source: 'مصدر ثانوي', deadline: null }, { id: 'GF-04', name: 'استمارة 6؟ — إنهاء الخدمة', authority: 'NOSI', source: 'غير مؤكد', deadline: null },
      { id: 'GF-05', name: 'نموذج الاحتساب الشهري', authority: 'ETA', source: 'رسمي (FAQ v4 · مارس 2026)', deadline: null }, { id: 'GF-06', name: 'نموذج 2 مرتبات', authority: 'ETA', source: 'رسمي + ثانوي', deadline: null },
      { id: 'GF-07', name: 'نموذج 4 مرتبات (ربع سنوي)', authority: 'ETA', source: 'رسمي + ثانوي', deadline: null }, { id: 'GF-08', name: 'نموذج 9 تسويات (سنوي)', authority: 'ETA', source: 'رسمي', deadline: null }]);
    st.set('govLog', [{ id: 'GS-0001', calendarId: 'GC-01', title: 'سداد اشتراكات التأمينات الاجتماعية', period: '2026-09', deliveredBy: 'U-06', deliveredAt: '2026-10-01', reference: 'إيصال سداد رقم 8841 (تجريبي)', proof: 'receipt-8841.pdf', note: '', correctionOf: null }, { id: 'GS-0002', calendarId: 'GC-05', title: 'نموذج الاحتساب الشهري لضريبة كسب العمل + السداد', period: '2026-09', deliveredBy: 'U-06', deliveredAt: '2026-10-14', reference: 'مطالبة ETA رقم 5512 (تجريبي)', proof: 'eta-claim-5512.pdf', note: '', correctionOf: null }]); st.set('payBatches', []); st.set('payslips', []); st.set('raiseCycles', []);
    buildSeedRuns();
  }
  function ensure() { if (!st.get('meta') || (st.get('meta.hrPaySeeded') || 0) >= FLAG) return; st.set('meta.hrPaySeeded', FLAG); try { seed(); } catch (e) { console.error('[hr-pay] seed failed', e); } }
  API.ensure = ensure;

  /* ───────────────────────── compensation resolution ───────────────────────── */
  function compLines(empId, asOf) {
    const e = empById(empId);
    const list = col('compAssignments').filter((a) => a.employeeId === empId && a.status === 'approved' && a.from <= asOf).sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0));
    const a = list[0]; let lines; let drift = false;
    if (a) lines = a.lines.map((l) => ({ code: l.code, amount: l.amount }));
    else if (e && e.salary) { lines = [{ code: 'BASIC', amount: e.salary.basic }]; if (e.salary.allowances) lines.push({ code: 'TRANSPORT', amount: e.salary.allowances }); } else lines = [];
    /* the profile may have been edited elsewhere (HR-07 salary change): current/future periods follow the profile so payroll never disagrees with the file */
    if (e && e.salary && asOf >= PER.cur() + '-01' && (!a || a.from <= todayISO())) {
      const basic = lines.find((l) => l.code === 'BASIC'); if (basic && basic.amount !== e.salary.basic) { basic.amount = e.salary.basic; drift = true; }
      const allow = sum(lines.filter((l) => l.code !== 'BASIC'), (l) => l.amount); const diff = (e.salary.allowances || 0) - allow;
      if (diff !== 0) { const tgt = lines.find((l) => l.code === 'MEAL') || lines.find((l) => l.code !== 'BASIC'); if (tgt) tgt.amount = Math.max(0, tgt.amount + diff); else lines.push({ code: 'TRANSPORT', amount: diff }); drift = true; }
    }
    return { id: a ? a.id : null, from: a ? a.from : null, lines, drift, gradeId: a ? a.gradeId : null };
  }
  API.compFor = (empId, asOf) => compLines(empId, asOf || todayISO());
  const monthlyOf = (lines) => sum(lines, (l) => l.amount);
  const basicOf = (lines) => ((lines || []).find((l) => l.code === 'BASIC') || { amount: 0 }).amount;
  const compMeta = () => { const o = {}; col('payComponents').forEach((c) => { o[c.code] = { name: c.name, kind: c.kind, taxable: !!c.taxable, insurable: !!c.insurable, prorate: c.prorate, rule: c.rule || '' }; }); return o; };

  /* ───────────────────────── inputs (attendance · leave · OT · loans · deductions) ───────────────────────── */
  const UNPAID_TYPES = ['unpaid', 'without_pay', 'unpaid_leave'];
  const overlapDays = (from, to, a, b) => { const s = from > a ? from : a, e = to < b ? to : b; return s > e ? 0 : daysBetween(s, e) + 1; };
  function otRecords(per) {
    const cands = ['overtime', 'overtimeRequests', 'otRequests'];
    for (let i = 0; i < cands.length; i++) {
      const arr = st.get(cands[i]); if (!Array.isArray(arr)) continue;
      const rows = arr.map((r) => ({ id: r.id, employeeId: r.employeeId, date: r.date || r.day || String(r.from || '').slice(0, 10), kind: /night|ليل/i.test(String(r.kind || r.type || r.shiftType || r.category || '')) ? 'night' : 'day', hours: Number(r.hours != null ? r.hours : r.approvedHours != null ? r.approvedHours : r.hrs) || 0, status: /approv|معتمد/i.test(String(r.status)) ? 'approved' : 'pending' })).filter((r) => r.date && r.date >= per.start && r.date <= per.end);
      if (rows.length) return { rows, source: cands[i] };
    }
    return { rows: col('payOtInputs').filter((r) => r.date >= per.start && r.date <= per.end), source: 'payOtInputs' };
  }
  function sigOf(period) {
    const per = PER.parse(period);
    const att = col('attendance').filter((a) => a.status === 'absent' && a.date >= per.start && a.date <= per.end).map((a) => a.id + (a.reviewed ? 'r' : '') + (a.excused ? 'e' : '')).sort();
    const ot = otRecords(per).rows.map((r) => r.id + r.status + r.hours).sort(); const lr = [];
    col('loans').forEach((l) => { if (l.status === 'active' && l.schedule) l.schedule.forEach((r) => { if (r.month === period && r.status !== 'deducted') lr.push(l.id + r.n + r.status + r.amount); }); });
    const dd = col('deductions').filter((d) => d.month === period && d.status === 'approved').map((d) => d.id + d.days + d.amount);
    const ca = col('compAssignments').filter((a) => a.status === 'approved' && a.from <= per.end).map((a) => a.id + a.from);
    const lv = col('leaveRequests').filter((l) => l.status === 'approved' && l.from <= per.end && l.to >= per.start).map((l) => l.id + l.from + l.to + l.type);
    return hashStr(JSON.stringify([att, ot, lr, dd, ca, lv]));
  }
  function pullInputs(run, force) {
    const per = PER.parse(run.period); const att = col('attendance'), leaves = col('leaveRequests').filter((l) => l.status === 'approved'), ot = otRecords(per), loans = col('loans'), deds = col('deductions'), profiles = col('payProfiles');
    const res = run.resolutions || {}, ov = run.overrides || {}; const byEmp = {}, excluded = []; const C = { employees: 0, absences: 0, openAbsences: 0, leaves: 0, otApproved: 0, otPending: 0, loanRows: 0, deductions: 0, changes: 0 };
    emps().forEach((e) => {
      if (e.hireDate && e.hireDate > per.end) return; if (e.endDate && e.endDate < per.start) return;
      if (!force && (e.status === 'terminated' || e.status === 'suspended')) { excluded.push({ empId: e.id, reason: e.status === 'terminated' ? 'منتهي الخدمة — يُحال للمخالصة (HR-25)' : 'موقوف عن العمل' }); return; }
      const cl = compLines(e.id, per.end);
      const absAll = att.filter((a) => a.employeeId === e.id && a.status === 'absent' && a.date >= per.start && a.date <= per.end);
      const abs = absAll.filter((a) => !leaves.some((l) => l.employeeId === e.id && l.from <= a.date && l.to >= a.date)).map((a) => { const r = res['abs:' + a.id]; return { id: a.id, date: a.date, decision: r ? r.value : a.reviewed ? (a.excused ? 'paid' : 'unpaid') : null }; });
      const myLv = leaves.filter((l) => l.employeeId === e.id && l.from <= per.end && l.to >= per.start); const unpaidLeave = sum(myLv.filter((l) => UNPAID_TYPES.indexOf(l.type) >= 0), (l) => overlapDays(l.from, l.to, per.start, per.end));
      const myOt = ot.rows.filter((r) => r.employeeId === e.id); const oa = (k) => sum(myOt.filter((r) => r.status === 'approved' && r.kind === k), (r) => r.hours), op = (k) => sum(myOt.filter((r) => r.status !== 'approved' && r.kind === k), (r) => r.hours);
      const loanRows = []; loans.forEach((l) => { if (l.employeeId !== e.id || l.status !== 'active' || !l.schedule) return; l.schedule.forEach((r) => { if (r.month === run.period && (r.status === 'scheduled' || r.status === 'due' || (force && r.status === 'deducted'))) loanRows.push({ loanId: l.id, n: r.n, amount: r.amount }); }); });
      const pens = deds.filter((d) => d.employeeId === e.id && d.status === 'approved' && d.month === run.period).map((d) => ({ id: d.id, type: d.type, days: d.days, amount: d.amount }));
      const prof = profiles.find((p) => p.employeeId === e.id) || { method: 'bank', last4: e.bankLast4 }; const method = (ov.method && ov.method[e.id]) || prof.method;
      byEmp[e.id] = { compId: cl.id, drift: cl.drift, comps: cl.lines, absent: abs, absentUnpaid: abs.filter((a) => a.decision !== 'paid').length, unpaidLeave, otDay: oa('day'), otNight: oa('night'), otPendDay: op('day'), otPendNight: op('night'), loans: loanRows, deds: pens, method, hasAccount: !!prof.last4 };
      C.employees++; C.absences += abs.length; C.openAbsences += abs.filter((a) => a.decision == null).length; C.leaves += myLv.length; C.otApproved += oa('day') + oa('night'); C.otPending += op('day') + op('night'); C.loanRows += loanRows.length; C.deductions += pens.length;
    });
    C.changes = col('compAssignments').filter((a) => a.status === 'approved' && a.source !== 'hire' && a.from >= per.start && a.from <= per.end).length;
    return { pulledAt: new Date().toISOString(), pulledBy: meId(), sig: sigOf(run.period), byEmp, excluded, counts: C, otSource: ot.source };
  }

  /* ───────────────────────── calculation engine (integer piasters; half-up per line) ───────────────────────── */
  function calcLine(e, run, inp) {
    const R = run.rules, per = PER.parse(run.period), M = R.period.month_days, DH = R.period.day_hours, cat = run.compSnap || {}; const S = st.get('settings.hrPayroll') || {};
    const tr = []; let sn = 0; const T = (label, formula, p, setting, txt) => tr.push({ n: ++sn, label, formula, p: p == null ? null : p, txt: txt || '', setting: setting || '' });
    let from = 1, to = M; if (e.hireDate > per.start) from = Math.min(M, Number(e.hireDate.slice(8, 10))); if (e.endDate && e.endDate >= per.start && e.endDate <= per.end) to = Math.min(M, Number(e.endDate.slice(8, 10)));
    const span = Math.max(0, to - from + 1), unpaid = (inp.absentUnpaid || 0) + (inp.unpaidLeave || 0), payDays = Math.max(0, span - unpaid), ratio = payDays / M;
    T('أيام الدفع', span === M && !unpaid ? M + ' يوم (شهر كامل)' : span + ' يوم خدمة' + (unpaid ? ' − ' + unpaid + ' يوم بلا أجر' : '') + ' = ' + payDays, null, 'period.month_days=' + M, payDays + ' / ' + M);
    const basicAmt = basicOf(inp.comps), basicP = P(basicAmt), lines = [];
    (inp.comps || []).forEach((c) => {
      const m = cat[c.code] || { name: c.code, taxable: true, insurable: false, prorate: 'paydays', rule: '' }; const full = P(c.amount); let due = m.prorate === 'none' ? full : rnd(full * ratio), note = '';
      if (m.rule === 'no_unexcused_absence' && (inp.absentUnpaid || 0) > 0) { due = 0; note = 'سقط الحافز: غياب غير مبرر ' + inp.absentUnpaid + ' يوم'; }
      lines.push({ code: c.code, name: m.name, p: due, base: full, taxable: !!m.taxable, insurable: !!m.insurable, qty: m.prorate === 'none' ? '' : payDays + '/' + M, note });
      T(m.name, m.prorate === 'none' && !note ? fp(full) + ' (بدون تناسب)' : fp(full) + ' × ' + payDays + '/' + M + (note ? ' — ' + note : ''), due, 'component ' + c.code + (m.taxable ? ' · خاضع' : ' · معفى') + (m.insurable ? ' · تأميني' : ' · غير تأميني'));
    });
    const rate = basicP / (M * DH);
    [['OT_DAY', 'day', inp.otDay], ['OT_NIGHT', 'night', inp.otNight]].forEach((o) => {
      if (!(o[2] > 0)) return; const mult = R.overtime ? R.overtime[o[1]] : null; if (!mult) throw SA.Err('rules', 'جدول الأوفرتايم غير مُعدّ');
      const m = cat[o[0]] || { name: o[0], taxable: true, insurable: true }; const v = rnd(o[2] * rate * mult);
      lines.push({ code: o[0], name: m.name, p: v, base: 0, taxable: !!m.taxable, insurable: !!m.insurable, qty: o[2] + ' س × ' + fp(rnd(rate * mult)) });
      T(m.name, o[2] + ' س × (' + fp(basicP) + ' ÷ (' + M + '×' + DH + ')) × ' + mult, v, 'overtime.' + o[1] + '_multiplier=' + mult + ' [' + (R.overtime.status === 'approved' ? 'معتمد' : 'Pending [Law]') + ']');
    });
    const gross = sum(lines, (l) => l.p); T('إجمالي الاستحقاق', 'Σ بنود الاستحقاق', gross, 'تصنيف المكونات (HR-13)');
    const insRaw = sum(lines.filter((l) => l.insurable), (l) => l.p), I = R.insurance; if (!I) throw SA.Err('rules', 'جدول التأمينات غير مُعدّ');
    const insWage = insRaw > 0 ? Math.min(Math.max(insRaw, P(I.min)), P(I.max)) : 0;
    T('الأجر التأميني الخام', lines.filter((l) => l.insurable).map((l) => fp(l.p)).join(' + ') || '0.00', insRaw, 'insurable=true لكل مكوّن (غير التأميني: ' + (lines.filter((l) => !l.insurable).map((l) => l.name).join('، ') || '—') + ')');
    T('الأجر التأميني بعد الحدين', 'min(max(' + fp(insRaw) + ', ' + fp(P(I.min)) + '), ' + fp(P(I.max)) + ')', insWage, 'insurance.min/max · ' + I.id + ' (من ' + I.from + ') [' + (I.status === 'approved' ? 'معتمد' : 'Pending [Law]') + ']');
    const insEmp = rnd(insWage * I.emp_rate / 100), insEr = rnd(insWage * I.er_rate / 100);
    T('تأمينات — حصة العامل', fp(insWage) + ' × ' + I.emp_rate + '%', insEmp, 'insurance.employee_rate=' + I.emp_rate + '% · ' + I.id); T('تأمينات — حصة صاحب العمل', fp(insWage) + ' × ' + I.er_rate + '%', insEr, 'insurance.employer_rate=' + I.er_rate + '% · ' + I.id + ' (داخلية — لا تظهر على المفردة)');
    const X = R.tax; if (!X) throw SA.Err('rules', 'جدول الضريبة غير مُعدّ');
    const taxable = sum(lines.filter((l) => l.taxable), (l) => l.p); const base = Math.max(0, taxable - ((X.deductible || []).indexOf('ins_employee') >= 0 ? insEmp : 0)); const months = X.months || 12;
    const annual = base * months, afterEx = Math.max(0, annual - P(X.exemption)); let prev = 0, annualTax = 0; const slices = [];
    (X.brackets || []).forEach((b) => { const up = b.upTo == null ? Infinity : P(b.upTo); const sl = Math.max(0, Math.min(afterEx, up) - prev); const tx = sl * b.rate / 100; slices.push({ from: prev, to: b.upTo == null ? null : P(b.upTo), rate: b.rate, slice: sl, tax: tx }); annualTax += tx; prev = up; });
    const tax = rnd(annualTax / months);
    T('الدخل الخاضع للضريبة', 'Σ المكونات الخاضعة', taxable, 'taxable=true لكل مكوّن'); T('الوعاء الضريبي الشهري', fp(taxable) + ' − تأمينات العامل ' + fp(insEmp), base, 'tax.deductible_items=[' + (X.deductible || []).join(',') + ']');
    T('الوعاء السنوي المُسنَد (DEMO)', fp(base) + ' × ' + months, annual, 'ETA الفعلي: تراكمي × 360 ÷ أيام فعلية (Open) — التبسيط ×' + months);
    T('بعد الإعفاء الشخصي', fp(annual) + ' − ' + fp(P(X.exemption)), afterEx, 'tax.personal_exemption=' + fe(X.exemption) + ' · ' + X.id + ' [' + (X.status === 'approved' ? 'معتمد' : 'Pending [Law]') + ']');
    T('الضريبة السنوية بالشرائح', slices.filter((s) => s.slice > 0).map((s) => fp(s.slice) + ' × ' + s.rate + '%').join(' + ') || '0.00', annualTax, 'tax.brackets[0..' + ((X.brackets || []).length - 1) + ']', fp(annualTax).replace(/\.00$/, '') + '');
    T('الضريبة الشهرية', fp(annualTax) + ' ÷ ' + months, tax, 'rounding=half_up_2dp');
    /* deductions with legal caps */
    const C = R.caps || { penalty_days: 0, loan_pct: 0, creditor_pct: 0, alimony_pct: 0, damage_days_month: 0 }; const flags = [];
    const penReq = sum((inp.deds || []).filter((d) => d.type === 'penalty'), (d) => (d.days != null ? d.days * basicP / M : P(d.amount))), dmgReq = sum((inp.deds || []).filter((d) => d.type === 'damage'), (d) => (d.days != null ? d.days * basicP / M : P(d.amount)));
    const penCap = C.penalty_days * basicP / M, dmgCap = (C.damage_days_month || 0) * basicP / M; let penalty = rnd(Math.min(penReq, penCap)) + rnd(Math.min(dmgReq, dmgCap));
    if (penReq > penCap + 0.5) flags.push('penalty_clipped'); if (dmgReq > dmgCap + 0.5) flags.push('damage_clipped');
    if (penReq || dmgReq) T('الجزاء المالي / التلفيات', 'min(طلب ' + fp(rnd(penReq + dmgReq)) + ', سقف ' + C.penalty_days + ' أيام × ' + fp(basicP) + ' ÷ ' + M + ' = ' + fp(rnd(penCap)) + ')', penalty, 'deduction_caps.penalty_days=' + C.penalty_days + ' [Law · Pending]');
    const loanPct = S.loanCapCompanyPct != null ? Math.min(C.loan_pct, S.loanCapCompanyPct) : C.loan_pct; const capLoan = Math.floor(basicP * loanPct / 100); const loanApplied = [], loanDeferred = []; let loan = 0;
    (inp.loans || []).forEach((r) => { const p = P(r.amount); if (loan + p <= capLoan) { loanApplied.push(r); loan += p; } else { loanDeferred.push(r); flags.push('loan_deferred'); } });
    if ((inp.loans || []).length) T('قسط السلفة', (loanApplied.map((r) => r.loanId + ' #' + r.n + ' = ' + fp(P(r.amount))).join(' + ') || '0.00') + ' (سقف ' + loanPct + '% × ' + fp(basicP) + ' = ' + fp(capLoan) + ')', loan, 'deduction_caps.loan_pct=' + C.loan_pct + '%' + (S.loanCapCompanyPct != null ? ' · سقف الشركة ' + S.loanCapCompanyPct + '%' : ''));
    const afterTI = Math.max(0, gross - tax - insEmp); const ordReq = sum((inp.deds || []).filter((d) => d.type === 'creditor'), (d) => P(d.amount)), alReq = sum((inp.deds || []).filter((d) => d.type === 'alimony'), (d) => P(d.amount));
    const credPct = alReq ? C.alimony_pct : C.creditor_pct; let creditor = rnd(Math.min(ordReq + alReq, afterTI * credPct / 100));
    if (ordReq + alReq > creditor + 1) flags.push('creditor_clipped'); if (ordReq + alReq) T('خصم الدائن / النفقة', 'min(طلب ' + fp(ordReq + alReq) + ', ' + credPct + '% × (' + fp(gross) + ' − ضريبة − تأمينات) = ' + fp(rnd(afterTI * credPct / 100)) + ')', creditor, 'deduction_caps.creditor_pct=' + C.creditor_pct + '% · alimony=' + C.alimony_pct + '% [Law · Pending]');
    let net = gross - insEmp - tax - penalty - loan - creditor; const deferred = { loan: 0, penalty: 0, creditor: 0 };
    if (net < 0) { /* BR-PRL-09: never lock a negative net — defer by priority (loan → penalty → creditor) */
      while (net < 0 && loanApplied.length) { const r = loanApplied.pop(); const p = P(r.amount); loan -= p; net += p; loanDeferred.unshift(r); deferred.loan += p; }
      if (net < 0 && penalty > 0) { const d = Math.min(penalty, -net); penalty -= d; net += d; deferred.penalty += d; }
      if (net < 0 && creditor > 0) { const d = Math.min(creditor, -net); creditor -= d; net += d; deferred.creditor += d; }
      if (deferred.loan || deferred.penalty || deferred.creditor) { flags.push('deferred'); T('تأجيل خصومات لمنع صافٍ سالب', 'أولوية: قانوني ← دائن ← جزاء ← سلفة', deferred.loan + deferred.penalty + deferred.creditor, 'BR-PRL-09'); }
    }
    const totalDed = insEmp + tax + penalty + loan + creditor; net = gross - totalDed; const employerCost = gross + insEr;
    T('إجمالي الاستقطاع', 'تأمينات ' + fp(insEmp) + ' + ضريبة ' + fp(tax) + ' + جزاء ' + fp(penalty) + ' + سلفة ' + fp(loan) + ' + دائن ' + fp(creditor), totalDed, '');
    T('صافي المرتب', fp(gross) + ' − ' + fp(totalDed), net, 'net = gross − deductions'); T('تكلفة صاحب العمل (داخلية)', fp(gross) + ' + ' + fp(insEr), employerCost, 'BR-PRL-19');
    return { empId: e.id, empNo: e.empNo, name: e.name, deptId: e.departmentId, posId: e.positionId, payDays, comps: lines, gross, insRaw, insWage, insEmp, insEr, taxable, taxBase: base, annualBase: annual, annualAfterEx: afterEx, annualTax, slices, tax, penalty, penaltyReq: rnd(penReq + dmgReq), loan, loanApplied, loanDeferred, creditor, creditorReq: ordReq + alReq, deferred, totalDed, net, employerCost, method: inp.method, flags, basicP, trace: tr };
  }
  function totalsOf(lines) {
    const t = { count: lines.length, gross: 0, insWage: 0, insEmp: 0, insEr: 0, taxable: 0, tax: 0, penalty: 0, loan: 0, creditor: 0, totalDed: 0, net: 0, employerCost: 0, bankP: 0, cashP: 0, holdP: 0, bankN: 0, cashN: 0, holdN: 0 };
    lines.forEach((l) => { ['gross', 'insWage', 'insEmp', 'insEr', 'taxable', 'tax', 'penalty', 'loan', 'creditor', 'totalDed', 'net', 'employerCost'].forEach((k) => { t[k] += l[k]; }); if (l.method === 'cash') { t.cashP += l.net; t.cashN++; } else if (l.method === 'hold') { t.holdP += l.net; t.holdN++; } else { t.bankP += l.net; t.bankN++; } });
    return t;
  }
  API.totalsOf = totalsOf;

  /* ───────────────────────── checks · variance · GM gate ───────────────────────── */
  const minBasisValue = (comps, basis) => { const meta = compMeta(); const cs = comps || []; if (basis === 'gross_fixed') return monthlyOf(cs); if (basis === 'basic_fixed') return sum(cs.filter((c) => c.code === 'BASIC' || (meta[c.code] && meta[c.code].kind === 'allowance')), (c) => c.amount); return basicOf(cs); };
  const MW_BASIS = [['basic', 'الأساسي فقط'], ['basic_fixed', 'الأساسي + البدلات الثابتة'], ['gross_fixed', 'إجمالي الأجر الثابت']];
  function prevRun(run) { return col('payrollRuns').filter((r) => r.id !== run.id && (!r.type || r.type === 'regular') && r.period < run.period && (r.status === 'released' || r.status === 'locked') && r.lines).sort((a, b) => (a.period < b.period ? 1 : -1))[0] || null; }
  function varianceOf(run) {
    const prev = prevRun(run); if (!prev || !run.lines) return { prev: null }; const cur = totalsOf(run.lines), pt = totalsOf(prev.lines); const byEmp = {};
    run.lines.forEach((l) => { const pl = prev.lines.find((x) => x.empId === l.empId); byEmp[l.empId] = pl && pl.net ? (l.net - pl.net) / pl.net * 100 : null; });
    const byDept = {}; uniq(run.lines.map((l) => l.deptId).concat(prev.lines.map((l) => l.deptId))).forEach((d) => { const a = sum(run.lines.filter((l) => l.deptId === d), (l) => l.net), b = sum(prev.lines.filter((l) => l.deptId === d), (l) => l.net); byDept[d] = { cur: a, prev: b, pct: b ? (a - b) / b * 100 : null }; });
    return { prev: { id: prev.id, period: prev.period }, curNet: cur.net, prevNet: pt.net, pct: pt.net ? (cur.net - pt.net) / pt.net * 100 : null, byEmp, byDept, curCount: run.lines.length, prevCount: prev.lines.length };
  }
  function gmGate(run) {
    const S = st.get('settings.hrPayroll') || {}; if (run.type && run.type !== 'regular') return { required: true, open: false, reason: 'مستند تصحيح/عكس يمرّ دائمًا ببوابة المدير العام.' }; const v = varianceOf(run);
    if (S.varianceNetPct == null && S.varianceEmpPct == null) return { required: true, open: true, reason: 'عتبة التباين غير مُعدّة (Open) — تُمرَّر للمدير العام افتراضيًا إلى أن تُحدَّد العتبة.' };
    if (!v.prev) return { required: true, open: false, reason: 'لا توجد دورة سابقة للمقارنة — بوابة المدير العام مطلوبة.' };
    if (S.varianceNetPct != null && Math.abs(v.pct) > S.varianceNetPct) return { required: true, open: false, reason: 'تباين الصافي ' + v.pct.toFixed(2) + '% تجاوز العتبة ' + S.varianceNetPct + '%.' };
    if (S.varianceEmpPct != null) { const bad = Object.keys(v.byEmp).filter((k) => v.byEmp[k] != null && Math.abs(v.byEmp[k]) > S.varianceEmpPct); if (bad.length) return { required: true, open: false, reason: bad.length + ' موظف تجاوز تباينهم عتبة ' + S.varianceEmpPct + '%.' }; }
    return { required: false, open: false, reason: 'التباين ضمن العتبات المُعدّة (' + (S.varianceNetPct != null ? 'صافي ' + S.varianceNetPct + '%' : '') + (S.varianceEmpPct != null ? ' · موظف ' + S.varianceEmpPct + '%' : '') + ').' };
  }
  function buildChecks(run) {
    const R = run.rules, res = run.resolutions || {}, lines = run.lines || [], inp = run.inputs ? run.inputs.byEmp : {}, ck = []; const S = st.get('settings.hrPayroll') || {};
    const add = (type, sev, empId, title, text, extra, key) => { key = key || type + ':' + (empId || ''); const r = res[key]; ck.push(Object.assign({ id: key, type, sev, empId: empId || null, title, text, status: r ? r.status : 'open', resolution: r || null }, extra || {})); };
    const profiles = col('payProfiles'); const basis = S.minWageBasis || 'basic'; const v = varianceOf(run);
    lines.forEach((l) => {
      const i = inp[l.empId] || {}; const prof = profiles.find((p) => p.employeeId === l.empId); const e = empById(l.empId);
      if (prof && prof.method === 'bank' && !prof.last4) add('miss_bank', 'block', l.empId, 'حساب بنكي ناقص', 'طريقة الصرف «بنك» ولا يوجد رقم حساب — لا يُصدَّر سطر بنكي بدون حساب.', { fixes: ['cash', 'hold'] });
      if (R.minWage && e && e.employmentType !== 'daily') { const bv = minBasisValue(i.comps, basis); if (bv < R.minWage.monthly) add('below_min', 'block', l.empId, 'أقل من الحد الأدنى للأجر', 'أساس المقارنة (' + (MW_BASIS.find((b) => b[0] === basis) || [0, basis])[1] + '): ' + fe(bv) + ' أقل من الحد الساري ' + fe(R.minWage.monthly) + ' ج.م (' + R.minWage.id + ').', { fixes: [] }); }
      if (l.net < 0) add('neg_net', 'block', l.empId, 'صافٍ سالب', 'الصافي ' + fp(l.net) + ' بعد تأجيل كل الخصومات القابلة للتأجيل — الخصومات القانونية وحدها تتجاوز الاستحقاق.', { fixes: [] });
      if (l.flags.indexOf('deferred') >= 0 || l.flags.indexOf('loan_deferred') >= 0) add('deferred', 'warn', l.empId, 'خصومات مؤجلة', 'أُجّلت خصومات للشهر التالي بسبب السقف أو الصافي (' + (l.loanDeferred || []).map((r) => r.loanId + ' #' + r.n).join('، ') + ').', { fixes: [] });
      if (l.flags.indexOf('penalty_clipped') >= 0 || l.flags.indexOf('damage_clipped') >= 0 || l.flags.indexOf('creditor_clipped') >= 0) add('cap_clipped', 'warn', l.empId, 'اقتُصّ خصم عند السقف القانوني', 'الطلب ' + fp((l.penaltyReq || 0) + (l.creditorReq || 0)) + ' تجاوز السقف فاقتُصّ تلقائيًا (مادة 114/143/148 — Pending).', { fixes: [] });
      (i.absent || []).forEach((a) => { if (a.decision == null || res['abs:' + a.id]) add('open_absence', 'warn', l.empId, 'غياب مفتوح في الحضور', 'غياب بتاريخ ' + SA.fmt.date(a.date) + ' لم يُراجَع في الحضور — يُخصم افتراضيًا (بدون أجر) حتى تقرر.', { attId: a.id, fixes: ['paid', 'unpaid'] }, 'abs:' + a.id); });
      const pend = (i.otPendDay || 0) + (i.otPendNight || 0); if (pend > 0) add('unapproved_ot', 'warn', l.empId, 'أوفرتايم غير معتمد', pend + ' ساعة أوفرتايم لم تُعتمد — مستبعدة من الحساب (BR-PRL-04).', { fixes: ['ack'] });
      if (S.varianceEmpPct != null && v.byEmp && v.byEmp[l.empId] != null && Math.abs(v.byEmp[l.empId]) > S.varianceEmpPct) add('var_emp', 'warn', l.empId, 'تباين موظف فوق العتبة', 'تباين الصافي ' + v.byEmp[l.empId].toFixed(1) + '% عن الدورة السابقة (العتبة ' + S.varianceEmpPct + '%).', { fixes: ['ack'] });
      if (i.drift) add('profile_sync', 'info', l.empId, 'مواءمة مع ملف الموظف', 'المرتب في ملف الموظف يختلف عن آخر تعويض مسجّل — اعتُمد ملف الموظف (تغيير من الموارد البشرية).', { fixes: [] });
    });
    (run.inputs && run.inputs.excluded || []).forEach((x) => add('excluded', 'info', x.empId, 'موظف مستبعد من الدورة', x.reason, { fixes: [] }));
    if (v.prev) add('var_net', S.varianceNetPct != null && Math.abs(v.pct) > S.varianceNetPct ? 'warn' : 'info', null, 'تباين صافي الدورة عن ' + v.prev.id, (v.pct >= 0 ? '+' : '') + v.pct.toFixed(2) + '% (' + fp(v.prevNet) + ' ← ' + fp(v.curNet) + ') · العتبة: ' + (S.varianceNetPct == null ? 'غير مُعدّة (Open) — لا حكم تلقائي' : S.varianceNetPct + '%'), { fixes: [] });
    else add('var_net', 'info', null, 'لا دورة سابقة للمقارنة', 'مقارنة التباين تحتاج دورة سابقة مقفولة.', { fixes: [] });
    add('no_registry', 'info', null, 'بيانات التسجيل التأميني غير مُدخلة {Open}', 'مقارنة الأجر التأميني المحسوب بالمسجّل (G4) غير ممكنة — لا يوجد سجل تسجيل في هذا الإصدار.', { fixes: [] });
    if (R.pending) add('rules_pending', 'warn', null, 'قواعد قانونية Pending', 'الدورة تعمل بقيم Pending [Law] (' + rulesLabel(R) + ')' + (run.pendingAccepted ? ' — قبلها ' + SA.userName(run.pendingAccepted.by) + ': «' + run.pendingAccepted.reason + '»' : '') + '. لا تُفعَّل رسميًا قبل اعتماد المحاسب القانوني (بند 44).', { fixes: [] });
    if (run.inputs && run.status !== 'locked' && run.status !== 'released' && run.inputs.sig !== sigOf(run.period)) add('stale', 'warn', null, 'تغيّر مصدر بعد تجميد المدخلات', 'حضور/أوفرتايم/سلف/تعويضات تغيّرت بعد السحب — أعد السحب والحساب (HR.PAYROLL.INPUTS_STALE).', { fixes: [] });
    return ck;
  }
  const blockers = (run) => (run.checks || []).filter((c) => c.sev === 'block' && c.status === 'open');

  /* ───────────────────────── run lifecycle (store-level) ───────────────────────── */
  const ORD = { draft: 0, inputs_frozen: 1, calculated: 2, prepared: 3, hr_review: 4, finance_approved: 5, gm_approved: 6, locked: 7, released: 8 };
  const RUN_ST = { draft: ['مسودة', 'neutral'], inputs_frozen: ['مدخلات مجمّدة', 'info'], calculated: ['محسوب', 'info'], prepared: ['بانتظار مراجعة HR', 'warning'], hr_review: ['بانتظار اعتماد المالية', 'warning'], finance_approved: ['بانتظار بوابة المدير العام', 'warning'], gm_approved: ['معتمد — جاهز للقفل', 'success'], locked: ['مقفول', 'success'], released: ['مُصرَف', 'success'], cancelled: ['ملغى', 'neutral'], reversed: ['معكوس', 'danger'] };
  const runChip = (r) => SA.chip((RUN_ST[r.status] || [r.status])[0], (RUN_ST[r.status] || [0, 'neutral'])[1]);
  const getRun = (id) => { const r = st.find('payrollRuns', id); return r ? SA.clone(r) : null; };
  function saveRun(run) {
    if (run.lines) { const t = totalsOf(run.lines); run.employees = t.count; run.gross = t.gross / 100; run.deductions = t.totalDed / 100; run.net = t.net / 100; }
    st.update('payrollRuns', (l) => { const i = l.findIndex((x) => x.id === run.id); if (i >= 0) l[i] = run; else l.unshift(run); });
    return run;
  }
  const tl = (run, what, extra) => { run.timeline = run.timeline || []; run.timeline.unshift(Object.assign({ ts: new Date().toISOString(), by: meId(), what }, extra || {})); };
  function baseRun(period, o) {
    o = o || {}; const per = PER.parse(period); const R = API.rules(per.end);
    return { id: o.id || 'PR-' + period, period, type: o.type || 'regular', status: 'draft', preparedBy: o.preparedBy || meId(), preparedAt: new Date().toISOString(), employees: 0, gross: null, deductions: null, net: null, demo: true, approvalId: null, rules: R, compSnap: compMeta(), resolutions: {}, overrides: { method: {} }, approvedSteps: 0, timeline: [], lines: null, inputs: null, checks: [], pendingAccepted: o.pendingAccepted || null, parentId: o.parentId || null, published: null, pv: null };
  }
  function calcRun(run) {
    const out = []; Object.keys(run.inputs.byEmp).forEach((id) => { const e = empById(id); if (e) out.push(calcLine(e, run, run.inputs.byEmp[id])); });
    out.sort((a, b) => (a.empNo < b.empNo ? -1 : 1)); run.lines = out; run.checks = buildChecks(run); return run;
  }
  /** pull + calculate in one go (used by seeds and by "fix" actions); keeps the status ≥ calculated */
  function refreshRun(run, force) { run.inputs = pullInputs(run, force); calcRun(run); if (ORD[run.status] < ORD.calculated) run.status = 'calculated'; return run; }

  /* ───────────────────────── approvals: decide + reconcile (single source of truth = the approval record) ───────────────────────── */
  function canDecide(ap, extra) {
    if (!ap || ap.status !== 'pending') return { ok: false, why: 'الطلب ليس بانتظار قرار.' };
    const step = ap.chain[ap.currentStep - 1]; if (!step || step.status !== 'pending') return { ok: false, why: 'لا توجد خطوة بانتظار قرارك.' };
    const u = meU(); const r = SA.session.role; if (!u) return { ok: false, why: 'غير مسجّل.' };
    if (ap.requesterId === u.id) return { ok: false, why: 'فصل المهام: لا تعتمد طلبًا قدّمته بنفسك.', step };
    if (ap.chain.some((s) => s.decidedBy === u.id)) return { ok: false, why: 'فصل المهام: لا يعتمد شخص واحد خطوتين في نفس الطلب.', step };
    if (!(step.roleId === u.roleId || (r && r.isProtected))) return { ok: false, why: 'هذه الخطوة لدور «' + step.label + '».', step };
    if (extra) { const w = extra(step); if (w) return { ok: false, why: w, step }; }
    return { ok: true, step };
  }
  async function decideStep(ap, decision, o) {
    o = o || {}; const chk = canDecide(ap, o.extra); if (!chk.ok) { SA.toast(chk.why, 'warn', { ms: 6000 }); return false; }
    const step = chk.step; const last = ap.currentStep >= ap.chain.length;
    const r = await SA.confirm({ title: (decision === 'approved' ? 'اعتماد: ' : 'رفض/إرجاع: ') + step.label, danger: decision !== 'approved', confirmLabel: decision === 'approved' ? 'اعتماد' : 'رفض وإرجاع', reasonRequired: decision !== 'approved', reasonLabel: decision === 'approved' ? 'ملاحظة (اختياري)' : 'سبب الرفض / الإرجاع', reason: true,
      impact: o.impact || (decision === 'approved' ? [last ? 'هذه الخطوة الأخيرة — يصبح الطلب «معتمدًا».' : 'ينتقل الطلب للخطوة التالية: ' + ap.chain[ap.currentStep].label + '.'] : ['يعود المصدر لحالة «محسوب/مطلوب» ويُنبَّه المُجهِّز.']), warnings: o.warnings || [] });
    if (!r.ok) return false; if (!(await SA.stepUp('approval.decide'))) return false;
    try {
      await SA.api(() => {
        const now = new Date().toISOString();
        st.update('approvals', (l) => {
          const a = l.find((x) => x.id === ap.id); const s = a.chain[a.currentStep - 1]; s.status = decision; s.decidedBy = meId(); s.decidedAt = now; s.reason = r.reason || '';
          if (decision === 'approved') { if (a.currentStep >= a.chain.length) a.status = 'approved'; else { a.currentStep += 1; a.chain[a.currentStep - 1].status = 'pending'; } } else { a.status = 'rejected'; a.chain.forEach((x) => { if (x.status === 'waiting') x.status = 'skipped'; }); }
          a.updatedAt = now;
        });
        SA.audit(decision === 'approved' ? 'APPROVAL.APPROVED' : 'APPROVAL.REJECTED', { target: { type: 'approval', id: ap.id, label: ap.title }, reason: r.reason, after: { step: step.label, status: decision } });
      });
    } catch (e) { SA.fail(e); return false; }
    const fresh = st.find('approvals', ap.id);
    if (decision === 'approved' && fresh && fresh.status === 'pending') { const nx = fresh.chain[fresh.currentStep - 1]; SA.notify({ title: 'بانتظار قرارك: ' + fresh.title, body: 'الخطوة السابقة اعتُمدت — الخطوة الحالية: ' + nx.label, level: 'action', to: [nx.roleId, 'R-01'], link: '#/approvals/' + fresh.id }); }
    reconcile(); return true;
  }
  const lastDecider = (ap, st2) => { const s = ap.chain.filter((x) => x.decidedBy && (!st2 || x.status === st2)).sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1))[0]; return s ? s.decidedBy : null; };
  let busy = false;
  function reconcile() {
    if (busy || !st.get('meta') || (st.get('meta.hrPaySeeded') || 0) < FLAG) return; busy = true;
    try { reconcileRuns(); reconcileLoans(); reconcileChanges(); } catch (e) { console.error('[hr-pay] reconcile', e); } finally { busy = false; }
  }
  API.reconcile = reconcile;
  function reconcileRuns() {
    col('payrollRuns').slice().forEach((r0) => {
      if (!r0.approvalId) return; const ap = st.find('approvals', r0.approvalId); if (!ap) return; const run = SA.clone(r0); let changed = false; const done = ap.chain.filter((s) => s.status === 'approved'); const known = run.approvedSteps || 0;
      if ((ap.status === 'rejected' || ap.status === 'changes_requested') && ORD[run.status] >= ORD.prepared && ORD[run.status] < ORD.locked && run.rejectedApprovalId !== ap.id) {
        const who = lastDecider(ap, 'rejected') || lastDecider(ap); const s = ap.chain.find((x) => x.status === 'rejected');
        run.status = 'calculated'; run.rejectedApprovalId = ap.id; run.approvedSteps = 0; run.rejection = { by: who, at: ap.updatedAt, reason: s ? s.reason : '', step: s ? s.label : '' }; tl(run, 'رُفض/أُعيد من «' + (s ? s.label : 'الاعتماد') + '»', { by: who });
        aud('HR.PAYROLL.REJECTED', { type: 'payroll_run', id: run.id, label: 'كشف مرتبات ' + run.id }, { actor: actorOf(who), reason: s ? s.reason : '', before: { status: r0.status }, after: { status: 'calculated' } });
        SA.notify({ title: 'أُعيد كشف المرتبات ' + run.id, body: (s ? s.label + ': ' : '') + (s && s.reason ? s.reason : 'بدون سبب'), level: 'urgent', toUsers: [run.preparedBy], to: ['R-13'], link: '#/hr/payroll/' + run.id }); changed = true;
      } else if (ap.status === 'pending' || ap.status === 'approved') {
        if (done.length > known) { done.slice(known).forEach((s) => { tl(run, 'اعتُمدت خطوة «' + s.label + '»', { by: s.decidedBy }); aud('HR.PAYROLL.APPROVED', { type: 'payroll_run', id: run.id, label: 'كشف مرتبات ' + run.id }, { actor: actorOf(s.decidedBy), reason: s.reason, after: { step: s.label, status: 'approved' } }); }); run.approvedSteps = done.length; changed = true; }
        let ns = run.status; if (ap.status === 'approved') ns = 'gm_approved'; else if (done.length >= 2 && ap.chain.length > 2) ns = 'finance_approved'; else if (done.length >= 1) ns = 'hr_review'; else ns = ORD[run.status] >= ORD.prepared ? ns : 'prepared';
        if (ORD[ns] > ORD[run.status] && ORD[run.status] < ORD.locked) { run.status = ns; changed = true; if (ns === 'gm_approved') { SA.notify({ title: 'كشف المرتبات ' + run.id + ' معتمد', body: 'جاهز لقفل الفترة وإطلاق الصرف (hr.payroll.release).', level: 'action', to: ['R-07', 'R-01'], link: '#/hr/payroll/' + run.id }); } }
      }
      if (changed) saveRun(run);
    });
  }
  function reconcileLoans() {
    col('loans').slice().forEach((l) => {
      if (l.status !== 'requested' || !l.approvalId) return; const ap = st.find('approvals', l.approvalId); if (!ap) return;
      if (ap.status === 'approved') { st.patch('loans', l.id, { status: 'approved', approvedAt: ap.updatedAt }); aud('HR.ADVANCE.APPROVED', { type: 'loan', id: l.id, label: 'سلفة ' + empName(l.employeeId) }, { actor: actorOf(lastDecider(ap)), after: { status: 'approved' } }); SA.notify({ title: 'سلفة معتمدة بانتظار الصرف: ' + empName(l.employeeId), body: 'تنفيذ الصرف للمالية (سند PV-) — منفّذ الصرف ≠ معتمد السلفة.', level: 'action', to: ['R-07', 'R-01'], link: '#/hr/loans/' + l.id }); }
      else if (ap.status === 'rejected' || ap.status === 'changes_requested') { const s = ap.chain.find((x) => x.status === 'rejected'); st.patch('loans', l.id, { status: 'rejected', rejectReason: s ? s.reason : '' }); aud('HR.ADVANCE.REJECTED', { type: 'loan', id: l.id, label: 'سلفة ' + empName(l.employeeId) }, { actor: actorOf(lastDecider(ap)), reason: s ? s.reason : '', after: { status: 'rejected' } }); }
    });
  }
  const nextCA = () => 'CA-' + String((col('compAssignments').reduce((m, a) => Math.max(m, parseInt(String(a.id).slice(3), 10) || 0), 0)) + 1).padStart(4, '0');
  function applyComp(empId, from, lines, source, extra) {
    const rec = Object.assign({ id: nextCA(), employeeId: empId, from, gradeId: gradeFor(basicOf(lines)), lines, source, status: 'approved', createdBy: meId(), createdAt: new Date().toISOString(), reason: '', demo: true }, extra || {});
    st.insert('compAssignments', rec);
    if (from <= todayISO()) { const tot = monthlyOf(lines), b = basicOf(lines); st.patch('employees', empId, (e) => ({ salary: Object.assign({}, e.salary, { basic: b, allowances: tot - b }) })); }
    return rec;
  }
  function reconcileChanges() {
    col('salaryChanges').slice().forEach((sc) => {
      if (sc.payApplied || !sc.approvalId) return; const ap = st.find('approvals', sc.approvalId); if (!ap || ap.status !== 'approved') return;
      const cur = compLines(sc.employeeId, todayISO()); let lines = sc.components ? SA.clone(sc.components) : cur.lines.map((l) => (l.code === 'BASIC' ? { code: 'BASIC', amount: sc.toBasic } : l));
      const from = sc.effectiveFrom || (String(ap.updatedAt || new Date().toISOString()).slice(0, 7) + '-01');
      applyComp(sc.employeeId, from, lines, 'change', { sourceChangeId: sc.id, approvalId: ap.id, reason: sc.reason || 'تغيير مرتب معتمد' });
      st.patch('salaryChanges', sc.id, { payApplied: true, status: 'approved', effectiveFrom: from });
      if (!col('audit').some((a) => a.code === 'HR.SALARY.CHANGE_APPROVED' && a.target && a.target.id === sc.id)) aud('HR.SALARY.CHANGE_APPROVED', { type: 'salary_change', id: sc.id, label: 'تغيير مرتب — ' + empName(sc.employeeId) }, { actor: actorOf(lastDecider(ap)), after: { effectiveFrom: from } });
    });
    col('raiseCycles').slice().forEach((rc) => {
      if (rc.status !== 'submitted' || !rc.approvalId) return; const ap = st.find('approvals', rc.approvalId); if (!ap) return;
      if (ap.status === 'approved') {
        rc.proposals.forEach((p) => { const cur = compLines(p.empId, todayISO()); const lines = cur.lines.map((l) => (l.code === 'BASIC' ? { code: 'BASIC', amount: p.to } : l)); applyComp(p.empId, rc.effectiveFrom, lines, 'raise', { approvalId: ap.id, reason: 'علاوة سنوية ' + rc.id }); });
        st.patch('raiseCycles', rc.id, { status: 'applied', appliedAt: new Date().toISOString() }); aud('HR.SALARY.RAISE_CYCLE_APPLIED', { type: 'raise_cycle', id: rc.id, label: 'دورة علاوة ' + rc.id }, { actor: actorOf(lastDecider(ap)), after: { count: rc.proposals.length, effectiveFrom: rc.effectiveFrom } });
      } else if (ap.status === 'rejected' || ap.status === 'changes_requested') st.patch('raiseCycles', rc.id, { status: 'rejected' });
    });
  }
  st.subscribe('approvals', () => { if (SA.session && SA.session.isAuthed) reconcile(); });

  /* ───────────────────────── loans helpers ───────────────────────── */
  const loanBalance = (ln) => Math.round(sum(ln.ledger || [], (x) => x.amount) * 100) / 100;
  const loanCapEgp = (emp) => { const R = API.rules(todayISO()); const S = st.get('settings.hrPayroll') || {}; const c = R.caps ? R.caps.loan_pct : null; if (c == null) return null; const pct = S.loanCapCompanyPct != null ? Math.min(c, S.loanCapCompanyPct) : c; const b = basicOf(compLines(emp.id, todayISO()).lines); return Math.floor(b * pct) / 100; };
  const LN_ST = { requested: ['بانتظار الاعتماد', 'warning'], approved: ['معتمدة — بانتظار الصرف', 'info'], active: ['نشطة', 'success'], closed: ['مغلقة', 'neutral'], rejected: ['مرفوضة', 'danger'] };
  API.loansOf = (empId) => col('loans').filter((l) => l.employeeId === empId).map((l) => ({ id: l.id, kind: l.kind, amount: l.amount, status: l.status, balance: loanBalance(l), monthly: l.monthly }));

  /* ───────────────────────── payments: batches + payslips ───────────────────────── */
  function createBatches(run, o) {
    o = o || {}; const profiles = col('payProfiles'); const mkId = () => 'PAYBATCH-' + run.id.replace(/^PR-/, '') + '-' + pad(col('payBatches').filter((b) => b.runId === run.id).length + 1);
    const out = []; const now = new Date().toISOString();
    [['bank', 'generic_csv'], ['cash', 'cash_sheet']].forEach((k) => {
      const ls = run.lines.filter((l) => l.method === k[0]).map((l) => { const pr = profiles.find((p) => p.employeeId === l.empId) || {}; return { empId: l.empId, empNo: l.empNo, name: l.name, amountP: l.net, status: o.settled ? (k[0] === 'bank' ? 'paid' : 'received') : 'pending', last4: pr.last4 || null, note: '' }; }).filter((x) => x.amountP > 0);
      if (!ls.length) return;
      const b = { id: mkId(), runId: run.id, period: run.period, kind: k[0], profile: k[1], count: ls.length, totalP: sum(ls, (x) => x.amountP), status: o.settled ? 'settled' : 'generated', createdAt: now, createdBy: o.by || meId(), retryOf: null, exportedAt: o.settled ? now : null, exportedBy: o.settled ? o.by || meId() : null, hash: null, lines: ls };
      st.insert('payBatches', b, true); out.push(b);
    });
    return out;
  }
  const batchStatus = (b) => { const ls = b.lines; if (ls.every((x) => x.status === 'paid' || x.status === 'received' || x.status === 'retried')) return 'settled'; if (ls.some((x) => x.status === 'rejected')) return 'partial'; return b.exportedAt ? 'exported' : 'generated'; };
  const BATCH_ST = { generated: ['مُولَّد', 'info'], exported: ['مُصدَّر — بانتظار رد البنك', 'warning'], partial: ['مرفوض جزئيًا', 'danger'], settled: ['مكتمل', 'success'] };
  const slipNo = (run, l) => 'PAY-' + run.id.replace(/^PR-/, '') + '-' + l.empNo;
  function createPayslips(run, by) {
    const now = new Date().toISOString(); const recs = run.lines.map((l) => ({ id: slipNo(run, l), runId: run.id, empId: l.empId, empNo: l.empNo, rev: 0, publishedAt: now, publishedBy: by || meId(), viewedBy: [] }));
    st.update('payslips', (list) => { recs.forEach((r) => { if (!list.some((x) => x.id === r.id && x.rev === 0)) list.push(r); }); });
    return recs;
  }
  function payslipChecks(run, l) {
    const earn = sum(l.comps, (c) => c.p), ded = l.insEmp + l.tax + l.penalty + l.loan + l.creditor, R = run.rules, T = totalsOf(run.lines), row = run.lines.find((x) => x.empId === l.empId);
    return [['P1', 'إجمالي الاستحقاق = مجموع أسطر الاستحقاق', earn === l.gross], ['P2', 'إجمالي الاستقطاع = مجموع أسطر الاستقطاع', ded === l.totalDed], ['P3', 'الصافي = الاستحقاق − الاستقطاع ≥ 0', l.gross - l.totalDed === l.net && l.net >= 0], ['P4', 'الصافي = صف الموظف في كشف ' + run.id, !!row && row.net === l.net],
      ['P5', 'Σ صافي المفردات = صافي الدورة', sum(run.lines, (x) => x.net) === T.net], ['P6', 'تأمينات العامل = معدل التأمينات × الأجر التأميني', l.insEmp === rnd(l.insWage * R.insurance.emp_rate / 100)], ['P7', 'سطر السلفة = أقساط سجل الرصيد المقيّدة في الدورة', l.loan === sum(l.loanApplied || [], (r) => P(r.amount))], ['P8', 'أيام الدفع ≤ قاعدة الشهر', l.payDays <= R.period.month_days]];
  }
  API.payslipFor = function (empId) {
    const slips = col('payslips').filter((s) => s.empId === empId).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)); const s = slips[0]; if (!s) return null; const run = st.find('payrollRuns', s.runId); const l = run && run.lines ? run.lines.find((x) => x.empId === empId) : null; return l ? { slip: s, run, line: l } : null;
  };

  /* ───────────────────────── lifecycle actions (store-level; UI wrappers add confirm/step-up/guards) ───────────────────────── */
  function doCreate(period, o) {
    const run = baseRun(period, o); if (RULE_TABLES.some((t) => !run.rules[t[0]])) throw SA.Err('rules', 'جدول قواعد غير مُعدّ لهذه الفترة'); tl(run, 'فتح الدورة'); saveRun(run);
    aud('HR.PAYROLL.RUN_CREATED', { type: 'payroll_run', id: run.id, label: 'كشف مرتبات ' + PER.label(period) }, { after: { period, status: 'draft', rules: rulesLabel(run.rules) } });
    if (run.pendingAccepted) aud('HR.PAYROLL.PENDING_RULES_ACCEPTED', { type: 'payroll_run', id: run.id, label: run.id }, { reason: run.pendingAccepted.reason, after: { rules: rulesLabel(run.rules) } });
    return run;
  }
  function doPull(id) {
    const run = getRun(id); run.rules = API.rules(PER.parse(run.period).end); run.compSnap = compMeta(); run.inputs = pullInputs(run); run.lines = null; run.checks = []; run.status = 'inputs_frozen'; tl(run, 'سحب وتجميد المدخلات (' + run.inputs.counts.employees + ' موظف)'); saveRun(run);
    aud('HR.PAYROLL.INPUTS_PULLED', { type: 'payroll_run', id: run.id, label: run.id }, { after: run.inputs.counts }); return run;
  }
  function doCalc(id) {
    const run = getRun(id); const was = run.lines ? 'RECALCULATED' : 'CALCULATED'; calcRun(run); if (ORD[run.status] < ORD.calculated) run.status = 'calculated'; const t = totalsOf(run.lines); tl(run, 'حساب الدورة: صافي ' + fp(t.net) + ' ج.م'); saveRun(run);
    aud('HR.PAYROLL.CALCULATED', { type: 'payroll_run', id: run.id, label: run.id }, { after: { employees: t.count, net: SA.canSensitive('hr.salary.view') ? t.net / 100 : '•••', mode: was } }); return run;
  }
  function doSubmit(id) {
    const run = getRun(id); const cc = chainFor(run); const t = totalsOf(run.lines);
    const ap = SA.requestApproval({ type: 'payroll_run', title: 'كشف مرتبات ' + run.id + ' (' + PER.label(run.period) + ') — بانتظار مراجعة HR', requesterId: meId(), chain: cc.chain, ref: { type: 'payroll_run', id: run.id },
      context: [['الكشف', run.id], ['الفترة', PER.label(run.period)], ['عدد الموظفين', String(t.count)], ['بوابة المدير العام', cc.gate.required ? 'مطلوبة — ' + cc.gate.reason : 'غير مطلوبة — ' + cc.gate.reason], ['القواعد', rulesLabel(run.rules)], ['ملاحظة', 'الأجور سرية (hr.salary.view). التجهيز/الاعتماد/الإطلاق صلاحيات منفصلة.']] });
    run.approvalId = ap.id; run.status = 'prepared'; run.approvedSteps = 0; run.preparedBy = meId(); run.preparedAt = new Date().toISOString(); run.gmGate = cc.gate; run.rejection = null; tl(run, 'أُرسل للمراجعة (' + ap.id + ')'); saveRun(run);
    aud('HR.PAYROLL.PREPARED', { type: 'payroll_run', id: run.id, label: 'كشف مرتبات ' + run.id }, { after: { status: 'prepared', employees: t.count, approval: ap.id, gmGate: cc.gate.required } });
    return run;
  }
  const chainFor = (run) => { const g = gmGate(run); const c = [{ roleId: 'R-11', label: 'مدير الموارد البشرية (مراجعة)' }, { roleId: 'R-07', label: 'المالية (اعتماد الصرف)' }]; if (g.required) c.push({ roleId: 'R-02', label: 'المدير العام (بوابة التباين)' }); return { chain: c, gate: g }; };
  function doLock(id) {
    const run = getRun(id); run.status = 'locked'; run.lockedAt = new Date().toISOString(); run.lockedBy = meId(); run.hash = hashStr(JSON.stringify(run.lines)); tl(run, 'قُفلت الفترة — لا تعديل بعد الآن'); saveRun(run);
    aud('HR.PAYROLL.PERIOD_LOCKED', { type: 'payroll_run', id: run.id, label: run.id }, { after: { status: 'locked', hash: run.hash } }); return run;
  }
  function applyReleaseEffects(run) {
    const closed = [];
    st.update('loans', (list) => {
      run.lines.forEach((l) => {
        (l.loanApplied || []).forEach((r) => { const ln = list.find((x) => x.id === r.loanId); if (!ln || !ln.schedule) return; const row = ln.schedule.find((x) => x.n === r.n); if (!row || row.status === 'deducted') return; row.status = 'deducted'; row.runId = run.id; ln.ledger = ln.ledger || []; ln.ledger.push({ id: ln.id + '-L' + (ln.ledger.length + 1), ts: new Date().toISOString(), type: 'installment', amount: -row.amount, ref: run.id, by: meId(), note: 'قسط ' + row.n + '/' + ln.schedule.length }); });
        (l.loanDeferred || []).forEach((r) => { const ln = list.find((x) => x.id === r.loanId); if (!ln || !ln.schedule) return; const row = ln.schedule.find((x) => x.n === r.n); if (!row || row.status === 'deferred') return; row.status = 'deferred'; const lastM = ln.schedule.reduce((m, x) => (x.month > m ? x.month : m), run.period); ln.schedule.push({ n: ln.schedule.length + 1, month: PER.add(lastM, 1), amount: row.amount, status: 'scheduled', deferredFrom: row.n }); ln.ledger = ln.ledger || []; ln.ledger.push({ id: ln.id + '-L' + (ln.ledger.length + 1), ts: new Date().toISOString(), type: 'deferral', amount: 0, ref: run.id, by: meId(), note: 'تأجيل القسط ' + row.n + ' لسقف/صافٍ (BR-LON-07)' }); });
      });
      list.forEach((ln) => { if (ln.status === 'active' && ln.ledger && ln.ledger.length && Math.abs(loanBalance(ln)) < 0.005) { ln.status = 'closed'; ln.closedAt = new Date().toISOString(); closed.push(ln); } });
    });
    st.update('deductions', (list) => {
      run.lines.forEach((l) => { const i = run.inputs && run.inputs.byEmp[l.empId]; if (!i) return; (i.deds || []).forEach((d) => { const doc = list.find((x) => x.id === d.id); if (!doc) return; if ((l.deferred.penalty || l.deferred.creditor) && (d.type === 'penalty' || d.type === 'creditor' || d.type === 'alimony')) { doc.month = PER.add(run.period, 1); doc.note = 'أُجّل من ' + run.id; } else { doc.status = 'applied'; doc.appliedRun = run.id; } }); });
    });
    closed.forEach((ln) => aud('HR.LOAN.CLOSED', { type: 'loan', id: ln.id, label: 'سلفة ' + empName(ln.employeeId) }, { after: { status: 'closed', via: run.id } }));
  }
  function doRelease(id) {
    const run = getRun(id); const t = totalsOf(run.lines); if (t.bankP + t.cashP + t.holdP !== t.net) throw SA.Err('control', 'بنك + نقدي + محجوز ≠ الصافي (BR-PAY-01)');
    let batches = []; if (run.type !== 'reversal') { batches = createBatches(run); if (run.type === 'regular') applyReleaseEffects(run); }
    run.status = 'released'; run.releasedAt = new Date().toISOString(); run.releasedBy = meId(); run.pv = { id: null, status: 'open', note: 'تنشئ المالية سند الصرف PV- وتعتمده وتنفّذه (بند 42) — لا تكامل في هذا الإصدار' }; tl(run, 'أُطلق الصرف: ' + batches.length + ' دفعة'); saveRun(run);
    aud('HR.PAYROLL.RELEASED', { type: 'payroll_run', id: run.id, label: run.id }, { severity: 'critical', after: { status: 'released', bank: t.bankN, cash: t.cashN, hold: t.holdN, batches: batches.map((b) => b.id) } });
    SA.notify({ title: 'أُطلق صرف ' + run.id, body: 'ملف البنك وكشف النقدي جاهزان — سند الصرف PV- للمالية.', level: 'action', to: ['R-07', 'R-11', 'R-01'], link: '#/hr/payments?run=' + run.id });
    return run;
  }
  function doPublish(id, reason) {
    const run = getRun(id); const recs = createPayslips(run); run.published = { at: new Date().toISOString(), by: meId(), count: recs.length, early: !!reason }; tl(run, 'نُشرت ' + recs.length + ' مفردة مرتب' + (reason ? ' (قبل تأكيد الصرف: ' + reason + ')' : '')); saveRun(run);
    aud('HR.PAYROLL.PAYSLIPS_PUBLISHED', { type: 'payroll_run', id: run.id, label: run.id }, { reason, after: { count: recs.length } });
    const uids = run.lines.map((l) => (empById(l.empId) || {}).userId).filter(Boolean);
    if (uids.length) SA.notify({ title: 'مفردة مرتبك لشهر ' + PER.label(run.period) + ' متاحة', body: 'افتح «خدماتي» لمشاهدتها. (لا تُرسل الأرقام في الإشعارات.)', level: 'info', toUsers: uids, link: '#/hr/ess' });
    return run;
  }
  function doArrears(parentId) {
    const parent = getRun(parentId); const per = PER.parse(parent.period); const n = col('payrollRuns').filter((r) => r.parentId === parent.id && r.type === 'arrears').length + 1; const id = parent.id + '-OC' + n;
    const run = baseRun(parent.period, { id, type: 'arrears', parentId: parent.id }); run.rules = SA.clone(parent.rules); run.compSnap = SA.clone(parent.compSnap); const lines = [], skipped = [];
    parent.lines.forEach((old) => {
      const e = empById(old.empId); const pin = SA.clone(parent.inputs.byEmp[old.empId]); pin.comps = compLines(old.empId, per.end).lines; pin.loans = []; pin.deds = [];
      const nw = calcLine(e, parent, pin);
      const pinOld = SA.clone(parent.inputs.byEmp[old.empId]); pinOld.loans = []; pinOld.deds = []; const old2 = calcLine(e, parent, pinOld); const dd = (k) => nw[k] - old2[k];
      if (dd('gross') === 0 && dd('insEmp') === 0 && dd('tax') === 0) return;
      const netD = dd('gross') - dd('insEmp') - dd('tax'); if (netD <= 0) { skipped.push(old.empId); return; }
      lines.push({ empId: old.empId, empNo: old.empNo, name: old.name, deptId: old.deptId, posId: old.posId, payDays: 0, comps: [{ code: 'ARREARS', name: 'فروق أثر رجعي — ' + PER.label(parent.period), p: dd('gross'), base: 0, taxable: true, insurable: true, qty: '' }], gross: dd('gross'), insRaw: dd('insRaw'), insWage: dd('insWage'), insEmp: dd('insEmp'), insEr: dd('insEr'), taxable: dd('taxable'), taxBase: dd('taxBase'), annualBase: 0, annualAfterEx: 0, annualTax: 0, slices: [], tax: dd('tax'), penalty: 0, penaltyReq: 0, loan: 0, loanApplied: [], loanDeferred: [], creditor: 0, creditorReq: 0, deferred: { loan: 0, penalty: 0, creditor: 0 }, totalDed: dd('insEmp') + dd('tax'), net: netD, employerCost: dd('gross') + dd('insEr'), method: old.method, flags: ['arrears'], basicP: 0,
        trace: [{ n: 1, label: 'فروق الاستحقاق', formula: 'إجمالي بالتعويض الحالي ' + fp(old2.gross + dd('gross')) + ' − إجمالي بالتعويض المقفول ' + fp(old2.gross), p: dd('gross'), txt: '', setting: 'لا تعديل في الدورة الأصلية ' + parent.id }, { n: 2, label: 'فرق التأمينات (حصة العامل)', formula: fp(nw.insEmp) + ' − ' + fp(old2.insEmp), p: dd('insEmp'), txt: '', setting: '' }, { n: 3, label: 'فرق الضريبة', formula: fp(nw.tax) + ' − ' + fp(old2.tax), p: dd('tax'), txt: '', setting: '' }, { n: 4, label: 'صافي الفروق', formula: fp(dd('gross')) + ' − ' + fp(dd('insEmp') + dd('tax')), p: netD, txt: '', setting: 'ETA لا يقبل أرقامًا سالبة (BR-GOV-08)' }] });
    });
    if (!lines.length) return null;
    run.lines = lines; run.inputs = { pulledAt: new Date().toISOString(), pulledBy: meId(), sig: null, byEmp: {}, excluded: [], counts: { employees: lines.length }, arrears: true, skipped }; run.status = 'calculated'; run.checks = [{ id: 'arrears:info', type: 'arrears', sev: 'info', empId: null, title: 'دورة فروق من ' + parent.id, text: lines.length + ' موظف · الأصل المقفول لا يتغيّر' + (skipped.length ? ' · ' + skipped.length + ' سطر بفرق سالب لم يُدرج (يُرحَّل للدورة التالية — BR-GOV-08)' : ''), status: 'open', resolution: null }];
    tl(run, 'توليد دورة فروق من ' + parent.id); saveRun(run);
    aud('HR.PAYROLL.ARREARS_GENERATED', { type: 'payroll_run', id: run.id, label: run.id }, { after: { parent: parent.id, employees: lines.length } }); return run;
  }
  function doReversal(parentId, reason) {
    const parent = getRun(parentId); const id = parent.id + '-REV'; const run = baseRun(parent.period, { id, type: 'reversal', parentId: parent.id }); run.rules = SA.clone(parent.rules); run.compSnap = SA.clone(parent.compSnap);
    const neg = (x) => (typeof x === 'number' ? -x : x);
    run.lines = parent.lines.map((l) => Object.assign({}, SA.clone(l), { comps: l.comps.map((c) => Object.assign({}, c, { p: -c.p })), gross: -l.gross, insRaw: -l.insRaw, insWage: -l.insWage, insEmp: -l.insEmp, insEr: -l.insEr, taxable: -l.taxable, taxBase: -l.taxBase, tax: -l.tax, penalty: -l.penalty, loan: -l.loan, creditor: -l.creditor, totalDed: -l.totalDed, net: -l.net, employerCost: -l.employerCost, flags: ['reversal'], loanApplied: [], loanDeferred: [], trace: [{ n: 1, label: 'عكس كامل لسطر ' + parent.id, formula: 'قيمة الأصل × (−1)', p: -l.net, txt: '', setting: 'مستند عكس — الأصل لا يُعدَّل' }] }));
    run.inputs = { pulledAt: new Date().toISOString(), pulledBy: meId(), sig: null, byEmp: {}, excluded: [], counts: { employees: run.lines.length }, reversal: true }; run.status = 'calculated'; run.reversalReason = reason;
    run.checks = [{ id: 'reversal:info', type: 'reversal', sev: 'info', empId: null, title: 'مستند عكس للدورة ' + parent.id, text: 'السبب: ' + reason, status: 'open', resolution: null }]; tl(run, 'إنشاء مستند عكس لـ' + parent.id); saveRun(run);
    st.patch('payrollRuns', parent.id, { reversalId: id });
    aud('HR.PAYROLL.REVERSAL_CREATED', { type: 'payroll_run', id: run.id, label: run.id }, { reason, severity: 'high', after: { parent: parent.id } }); return run;
  }

  /* ───────────────────────── seed: PR-2026-09 (history) + PR-2026-10 (the demo run, same id/approval as seed.js) ───────────────────────── */
  function buildSeedRuns() {
    const old = col('payrollRuns').find((r) => r.id === 'PR-2026-10');
    /* September (released, published) — gives the variance check and the payslips something real to compare with */
    const sep = baseRun('2026-09', { id: 'PR-2026-09', preparedBy: 'U-26' }); sep.overrides.method['E-1026'] = 'cash'; sep.inputs = pullInputs(sep, true); calcRun(sep);
    sep.status = 'released'; sep.preparedAt = ago(40); sep.lockedAt = ago(36); sep.lockedBy = 'U-06'; sep.releasedAt = ago(35); sep.releasedBy = 'U-06'; sep.hash = hashStr(JSON.stringify(sep.lines)); sep.approvalId = null; sep.approvedSteps = 3; sep.pv = { id: 'PV-2026-0099', status: 'linked', note: 'نُفِّذ من المالية (بيانات تجريبية)' }; sep.published = { at: ago(35), by: 'U-06', count: sep.lines.length };
    sep.timeline = [{ ts: ago(35), by: 'U-06', what: 'نُشرت المفردات' }, { ts: ago(35), by: 'U-06', what: 'أُطلق الصرف' }, { ts: ago(36), by: 'U-06', what: 'قُفلت الفترة' }, { ts: ago(40), by: 'U-26', what: 'جُهّز الكشف وأُرسل للاعتماد' }]; sep.rules.pending = true;
    /* October (the run in the shared inbox: AP-2009) */
    const oct = baseRun('2026-10', { id: 'PR-2026-10', preparedBy: 'U-26' }); oct.overrides.method['E-1026'] = 'cash'; oct.pendingAccepted = { by: 'U-26', at: ago(0.2), reason: 'تشغيل تجريبي بقيم Pending لحين اعتماد المحاسب القانوني (بند 44)' };
    oct.resolutions['miss_bank:E-1026'] = { status: 'fixed', value: 'cash', by: 'U-26', at: ago(0.2), reason: 'صرف نقدي هذا الشهر لحين تحديث بيانات الحساب' };
    ['AT-PAY-04', 'AT-PAY-05'].forEach((a) => { oct.resolutions['abs:' + a] = { status: 'fixed', value: 'unpaid', by: 'U-26', at: ago(0.2), reason: 'غياب بلا عذر' }; });
    oct.inputs = pullInputs(oct, false); calcRun(oct); oct.status = 'prepared'; oct.approvalId = old ? old.approvalId : 'AP-2009'; oct.preparedAt = ago(0.1); oct.approvedSteps = 0; oct.gmGate = gmGate(oct);
    oct.timeline = [{ ts: ago(0.1), by: 'U-26', what: 'أُرسل للمراجعة (' + oct.approvalId + ')' }, { ts: ago(0.15), by: 'U-26', what: 'حساب الدورة وإغلاق الفحوصات المانعة' }, { ts: ago(0.2), by: 'U-26', what: 'سحب وتجميد المدخلات' }, { ts: ago(0.25), by: 'U-26', what: 'فتح الدورة (قبول قواعد Pending بسبب مسجّل)' }];
    saveRun(sep); saveRun(oct);
    st.update('payrollRuns', (l) => { l.sort((a, b) => (a.period < b.period ? 1 : -1)); });
    createBatches(sep, { settled: true, by: 'U-06' }); createPayslips(sep, 'U-06');
  }

  /* wire real state into the public API (other modules / ESS) */
  API.runs = () => col('payrollRuns').map((r) => ({ id: r.id, period: r.period, status: r.status, net: r.net, published: !!r.published }));
  API.legal = () => API.rules(todayISO());

  /* ═══════════════════════════════════════════ UI — shared building blocks ═══════════════════════════════════════════ */
  const secret = () => h('span.sap-pay-secret', { title: 'سري — يحتاج hr.salary.view' }, SA.icon('lock', 'icon-sm'), 'سري');
  const A = (p) => (canWages() ? h('span.sap-pay-amt', fp(p)) : secret());           // قروش (بيانات فردية T3)
  const AE = (egp) => (canWages() ? h('span.sap-pay-amt', fe(egp)) : secret());       // جنيه (بيانات فردية T3)
  const AT = (p) => h('span.sap-pay-amt', fp(p));                                      // إجماليات (hr.payroll.view)
  const code = (t) => h('code.sap-pay-code', t);
  const kpiRow = (items) => h('div.sap-grid-cards', items.map((i) => SA.kpi(i[0], i[1], i[2])));
  const needWages = () => (canWages() ? null : SA.alert('warning', h('b', {}, 'الأجور سرية (T3). '), 'حسابك لا يملك ', code('hr.salary.view'), ' — الأرقام الفردية تظهر «سري» ولا يُسجَّل أي اطلاع. الإجماليات متاحة بصلاحية العرض فقط.'));
  const openLink = (txt, href) => h('a.sap-pay-link', { href }, txt, SA.icon('arrowleft', 'icon-sm'));
  const specLink = (anchor) => h('a.sap-pay-spec', { href: '../../hr-payroll.html#' + anchor, target: '_blank', rel: 'noopener' }, 'المواصفة الكاملة ↗');
  const lawTag = (t) => SA.tag('pending', t || 'Pending [Law]');
  const field = (o) => SA.form.field(o);
  const viewed = new Set();
  function logSalaryView(empId, why) { if (!canWages()) return; const k = meId() + ':' + empId; if (viewed.has(k)) return; viewed.add(k); aud('HR.SALARY.VIEWED', { type: 'employee', id: empId, label: empName(empId) }, { reason: why || 'عرض هيكل المرتب' }); }
  const deptOpts = () => [['', 'كل الأقسام']].concat((st.get('departments') || []).filter((d) => d.active).map((d) => [d.id, d.name]));
  const pCol = (k) => 'تحت ' + k;
  /** conflict of interest (BR-SAL-10): HR can't change own salary or a relative's */
  function conflictWith(empId) { const u = meU(); const mine = u ? empOfUser(u.id) : null; if (!mine) return ''; if (mine.id === empId) return 'لا يمكنك تعديل مرتبك أو سلفتك بنفسك (تعارض مصالح).'; if ((mine.relatives || []).indexOf(empId) >= 0 || ((empById(empId) || {}).relatives || []).indexOf(mine.id) >= 0) return 'الموظف من أقاربك المسجّلين — تعارض مصالح (BR-SAL-10).'; return ''; }
  function loadScreen(root, ctx, crumb, build) {
    ensure(); reconcile(); ctx.setCrumbs([{ label: 'المرتبات' }, { label: crumb }]); let stopped = false, cleanup = null;
    const go = () => { SA.clear(root); root.append(SA.skeleton({ kind: 'detail', rows: 8 })); SA.delay(SA.sim.slow ? undefined : 120).then(() => { if (stopped) return; SA.clear(root); try { cleanup = build(); } catch (e) { console.error(e); root.append(SA.errorState({ onRetry: go })); } }, (e) => { if (stopped) return; SA.clear(root); root.append(SA.errorState({ text: SA.errorText(e), onRetry: go })); }); };
    go(); return () => { stopped = true; if (typeof cleanup === 'function') cleanup(); };
  }
  function reg(id, render, extra) { const old = SA.moduleById(id); if (!old) { console.error('[hr-pay] stub not found: ' + id); return; } SA.register(Object.assign({ id, app: 'hr', group: old.group, title: old.title, icon: old.icon, route: old.route, perm: old.perm, order: old.order, desc: old.desc }, extra || {}, { render })); }
  /** tab host: panel content rebuilt per tab; every builder returns a cleanup */
  function tabbed(host, defs, active, onTab) {
    let cur = active && defs.some((d) => d.id === active) ? active : defs[0].id, stop = null; const panel = h('div.sap-pay-panel', { role: 'tabpanel' });
    const tabs = SA.tabs({ tabs: defs.map((d) => ({ id: d.id, label: d.label, icon: d.icon })), active: cur, onChange: (id) => show(id) });
    function show(id) { cur = id; if (stop) { stop(); stop = null; } SA.clear(panel); panel.setAttribute('aria-labelledby', 'tab-' + id); stop = defs.find((d) => d.id === id).build(panel) || null; if (onTab) onTab(id); }
    host.append(tabs.el, panel); show(cur);
    return { show: (id) => { tabs.setActive(id); show(id); }, cleanup: () => { if (stop) stop(); } };
  }
  /** generic form modal: fields = SA.form.field[]; onSubmit(values, modal) → Promise<boolean> */
  function formModal(o) {
    const grp = SA.form.group(o.fields || []); const ok = h('button.btn.' + (o.danger ? 'btn-accent' : 'btn-primary'), { type: 'button' }, o.confirmLabel || 'حفظ'); const cancel = h('button.btn.btn-ghost', { type: 'button' }, 'إلغاء');
    const m = SA.modal({ title: o.title, subtitle: o.subtitle, icon: o.icon || 'edit', size: o.size || 'md', danger: o.danger, body: h('div.sap-confirm', {}, o.before || null, (o.fields || []).map((f) => f.el), o.after || null, o.note === false ? null : h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), o.note || 'هيتسجّل في سجل التدقيق باسمك مع الوقت.')), foot: [cancel, ok] });
    cancel.addEventListener('click', () => m.close(false));
    ok.addEventListener('click', async () => { if (!grp.validate()) return; if (o.validate) { const msg = o.validate(grp.get()); if (msg) { SA.toast(msg, 'warn', { ms: 6000 }); return; } } m.setBusy(true); try { const done = await o.onSubmit(grp.get(), m); m.setBusy(false); if (done) m.close(true); } catch (e) { m.setBusy(false); SA.fail(e); } });
    return m;
  }
  const chipOk = (t, ok) => SA.chip(t, ok ? 'success' : 'danger');

  /* ═══════════════════════════════════════════ HR-13 · هيكل المرتب (hr-salary) ═══════════════════════════════════════════ */
  const gradesList = () => col('payGrades');
  const gradeOfBasic = (b) => { const gs = gradesList().slice().sort((a, c) => a.max - c.max); return gs.find((g) => b <= g.max) || gs[gs.length - 1] || null; };
  function minInfo(e) {
    const R = API.rules(todayISO()); const S = st.get('settings.hrPayroll') || {}; const basis = S.minWageBasis || 'basic'; const cl = compLines(e.id, todayISO()); const mw = R.minWage ? R.minWage.monthly : null;
    const vals = {}; MW_BASIS.forEach((b) => { vals[b[0]] = minBasisValue(cl.lines, b[0]); });
    return { basis, value: vals[basis], vals, min: mw, ok: mw == null ? null : vals[basis] >= mw, daily: e.employmentType === 'daily', cl };
  }
  const SRC_AR = { hire: 'تعيين', raise: 'علاوة سنوية', change: 'تغيير مرتب', manual: 'تعديل' };
  const nextSC = () => { const y = new Date().getFullYear(); const max = col('salaryChanges').reduce((m, x) => Math.max(m, parseInt(String(x.id).split('-')[2], 10) || 0), 0); return 'SC-' + y + '-' + String(max + 1).padStart(4, '0'); };

  function openComponentEditor(c) {
    if (!SA.can('hr.salary_structure.edit')) { SA.toast(NOPERM('hr.salary_structure.edit'), 'warn'); return; }
    const isNew = !c; const cur = c || { code: '', name: '', nameEn: '', kind: 'allowance', nature: 'variable', taxable: true, insurable: false, prorate: 'paydays', calcType: 'fixed', formula: '', order: 190, show: true, glHint: '' };
    const used = isNew ? 0 : usageOf(cur.code); const locked = !isNew && cur.system;
    const f = { code: field({ name: 'code', label: 'الكود', value: cur.code, required: true, disabled: !isNew, hint: isNew ? 'حروف لاتينية كبيرة وشرطة سفلية (مثل: HOUSING) — لا يتغيّر بعد الإنشاء.' : 'لا يتغيّر بعد الإنشاء.', rules: [(v) => (isNew && !/^[A-Z][A-Z_]{1,15}$/.test(v) ? 'من 2 إلى 16 حرفًا لاتينيًا كبيرًا' : isNew && col('payComponents').some((x) => x.code === v) ? 'الكود مستخدم من قبل' : null)] }),
      name: field({ name: 'name', label: 'الاسم بالعربي', value: cur.name, required: true }), nameEn: field({ name: 'nameEn', label: 'الاسم بالإنجليزي', value: cur.nameEn, dir: 'ltr' }),
      kind: field({ name: 'kind', label: 'النوع', type: 'select', value: cur.kind, disabled: !isNew && locked, options: Object.keys(KIND_AR).filter((k) => isNew ? ['allowance', 'incentive'].indexOf(k) >= 0 : true).map((k) => [k, KIND_AR[k]]) }),
      taxable: field({ name: 'taxable', label: 'خاضع لضريبة كسب العمل', type: 'switch', value: cur.taxable, hint: 'تصنيف Pending [Law] — يُراجع مع المحاسب القانوني (بند 44).' }),
      insurable: field({ name: 'insurable', label: 'داخل الأجر التأميني', type: 'switch', value: cur.insurable, hint: 'قانون 148 م1(8): بدل الانتقال وما في حكمه مستثنى (مقترح Pending).' }),
      nature: field({ name: 'nature', label: 'أساسي / متغير (م1(4) قانون العمل)', type: 'select', value: cur.nature || 'variable', options: [['basic', 'أساسي'], ['variable', 'متغير']], hint: 'للعلاوة والجزاءات والتقارير — لا يغيّر وعاء التأمينات.' }),
      calcType: field({ name: 'calcType', label: 'طريقة الحساب', type: 'select', value: cur.calcType || 'fixed', options: [['fixed', 'مبلغ ثابت لكل موظف'], ['per_day', 'لكل يوم حضور'], ['per_shift', 'لكل وردية'], ['formula', 'معادلة آمنة']] }),
      formula: field({ name: 'formula', label: 'المعادلة (اختياري — بدون eval)', type: 'textarea', rows: 2, value: cur.formula, dir: 'ltr', hint: 'المتغيرات: ' + FN_VARS.join(' · ') + ' — الدوال: min max round abs' }),
      prorate: field({ name: 'prorate', label: 'التناسب', type: 'select', value: cur.prorate, options: [['paydays', 'أيام الدفع'], ['attendance', 'أيام الحضور'], ['none', 'بدون تناسب']] }),
      order: field({ name: 'order', label: 'ترتيب الطباعة على المفردة', type: 'number', value: cur.order, min: 1 }), glHint: field({ name: 'glHint', label: 'تلميح الحساب المحاسبي (نص — لا يُرحَّل قيد)', value: cur.glHint || '', hint: 'الربط الفعلي Open (بند 40).' }),
      reason: field({ name: 'reason', label: 'سبب التعديل', type: 'textarea', rows: 2, value: '', required: !isNew, hint: 'مطلوب لأي تعديل على مكوّن قائم — يُحفظ في إصدار المكوّن.' }) };
    const testBox = h('div.sap-pay-testbox'); const vars = { basic: 7200, hours: 8, days: 30, paid_days: 30, month_days: 30, day_hours: 8, rate: 30, att_days: 26 };
    const runTest = () => { SA.clear(testBox); const src = f.formula.get().trim(); if (!src) { testBox.append(h('span.t-muted', {}, 'اكتب معادلة لاختبارها بقيم تجريبية.')); return; } try { const v = evalFormula(src, vars); testBox.append(SA.chip('المعادلة صحيحة', 'success'), h('span', {}, ' ' + Object.keys(vars).map((k) => k + '=' + vars[k]).join('، ') + ' ← '), h('b.num', {}, fe(v))); } catch (e) { testBox.append(SA.chip('خطأ', 'danger'), h('span', {}, ' ' + e.message)); } };
    f.formula.input.addEventListener('input', SA.debounce(runTest, 200)); runTest();
    const info = [];
    if (used) info.push(SA.alert('info', 'المكوّن مستخدم في ' + used + ' دورة — لا يُحذف (BR-SAL-04). التعديل ينتج إصدارًا جديدًا يسري على الدورات القادمة؛ الدورات الجارية تحتفظ بنسخة التصنيف وقت سحب المدخلات.'));
    if (locked) info.push(SA.alert('info', 'مكوّن نظامي: يُحسب من القواعد (تأمينات/ضريبة/أوفرتايم/خصومات) — يمكن تعديل الاسم والترتيب فقط.'));
    formModal({ title: isNew ? 'مكوّن مرتب جديد' : 'تعديل المكوّن ' + cur.code, subtitle: isNew ? 'بدل أو حافز قابل للتعيين على الموظفين' : 'إصدار جديد v' + ((c.version || 1) + 1), icon: 'edit', size: 'lg', fields: Object.keys(f).map((k) => f[k]), before: h('div', {}, info, lawTag(), ' التصنيف النهائي يعتمده HR والمحاسب القانوني.'), after: h('div', {}, h('b', {}, 'اختبار المعادلة'), testBox), confirmLabel: isNew ? 'إنشاء المكوّن' : 'حفظ الإصدار',
      validate: (v) => { if (v.formula && v.formula.trim()) { try { evalFormula(v.formula, vars); } catch (e) { return 'المعادلة غير صالحة: ' + e.message; } } return ''; },
      async onSubmit(v) {
        const flagsChanged = !isNew && (cur.taxable !== v.taxable || cur.insurable !== v.insurable);
        if (flagsChanged) { const r = await SA.confirm({ title: 'تغيير تصنيف قانوني لمكوّن', danger: true, confirmLabel: 'اعتماد التغيير', impact: ['يغيّر وعاء ' + (cur.insurable !== v.insurable ? 'التأمينات' : '') + (cur.insurable !== v.insurable && cur.taxable !== v.taxable ? ' و' : '') + (cur.taxable !== v.taxable ? 'الضريبة' : '') + ' لكل دورة قادمة.', 'لا يغيّر الدورات المقفولة — أي أثر رجعي يُعالَج بدورة فروق.'], warnings: ['التصنيف Pending [Law] حتى اعتماد المحاسب القانوني.'] }); if (!r.ok) return false; if (!(await SA.stepUp('policy.change'))) return false; }
        await SA.api(() => {
          const before = isNew ? null : SA.pick(cur, ['name', 'kind', 'taxable', 'insurable', 'prorate', 'calcType', 'formula', 'order']); const after = { name: v.name, kind: v.kind, taxable: v.taxable, insurable: v.insurable, prorate: v.prorate, calcType: v.calcType, formula: v.formula, order: v.order };
          if (isNew) { const kindAr = KIND_AR[v.kind]; st.insert('payComponents', { id: 'PC-' + v.code, code: v.code, name: v.name, nameEn: v.nameEn, kind: v.kind, nature: v.nature, taxable: v.taxable, insurable: v.insurable, calcText: { fixed: 'مبلغ ثابت', per_day: 'لكل يوم حضور', per_shift: 'لكل وردية', formula: 'معادلة: ' + (v.formula || '—') }[v.calcType], calcType: v.calcType, prorate: v.prorate, prorateText: { paydays: 'أيام الدفع', attendance: 'أيام الحضور', none: 'بدون' }[v.prorate], rule: '', formula: v.formula, taxNote: '', insNote: '', assignable: true, system: false, order: Number(v.order) || 190, show: true, status: 'active', review: 'pending', from: todayISO(), glHint: v.glHint, version: 1, history: [{ v: 1, at: new Date().toISOString(), by: meId(), reason: 'إنشاء (' + kindAr + ')' }] }); }
          else st.patch('payComponents', c.id, (x) => ({ name: v.name, nameEn: v.nameEn, kind: x.system ? x.kind : v.kind, nature: v.nature, taxable: x.system ? x.taxable : v.taxable, insurable: x.system ? x.insurable : v.insurable, calcType: v.calcType, formula: v.formula, prorate: x.system ? x.prorate : v.prorate, prorateText: { paydays: 'أيام الدفع', attendance: 'أيام الحضور', none: 'بدون' }[v.prorate], order: Number(v.order) || x.order, glHint: v.glHint, version: (x.version || 1) + 1, history: [{ v: (x.version || 1) + 1, at: new Date().toISOString(), by: meId(), reason: v.reason, before }].concat(x.history || []) }));
          aud('HR.SALARY.COMPONENT_CHANGED', { type: 'pay_component', id: isNew ? v.code : c.code, label: v.name }, { before, after, reason: isNew ? 'إنشاء مكوّن' : v.reason });
        }); SA.toast(isNew ? 'أُنشئ المكوّن ' + v.code : 'حُفظ إصدار جديد للمكوّن ' + c.code, 'success'); return true;
      } });
  }
  async function toggleComponent(c) {
    if (!SA.can('hr.salary_structure.edit')) { SA.toast(NOPERM('hr.salary_structure.edit'), 'warn'); return; } const retire = c.status === 'active';
    const r = await SA.confirm({ title: retire ? 'إيقاف المكوّن ' + c.code : 'تفعيل المكوّن ' + c.code, danger: retire, confirmLabel: retire ? 'إيقاف' : 'تفعيل', reasonRequired: true, impact: retire ? ['لا يُعيَّن على موظفين جدد ولا يظهر في الدورات القادمة.', 'يبقى مقروءًا في المفردات القديمة (لا حذف — BR-SAL-04).'] : ['يعود متاحًا للتعيين والحساب.'] }); if (!r.ok) return;
    try { await SA.api(() => { st.patch('payComponents', c.id, (x) => ({ status: retire ? 'retired' : 'active', version: (x.version || 1) + 1, history: [{ v: (x.version || 1) + 1, at: new Date().toISOString(), by: meId(), reason: (retire ? 'إيقاف: ' : 'تفعيل: ') + r.reason }].concat(x.history || []) })); aud('HR.SALARY.COMPONENT_CHANGED', { type: 'pay_component', id: c.code, label: c.name }, { reason: r.reason, before: { status: c.status }, after: { status: retire ? 'retired' : 'active' } }); }); SA.toast((retire ? 'أُوقف ' : 'فُعّل ') + c.code, 'success'); } catch (e) { SA.fail(e); }
  }

  function tabCatalog(panel, setActions) {
    setActions([SA.btn({ label: 'مكوّن جديد', icon: 'plus', kind: 'primary', perm: 'hr.salary_structure.edit', onClick: () => openComponentEditor(null) })]);
    let tbl = null; const view = {};
    const build = () => {
      const rows = col('payComponents').slice().sort((a, b) => a.order - b.order);
      tbl = SA.table({ caption: 'كتالوج مكونات المرتب', rows: () => col('payComponents').slice().sort((a, b) => a.order - b.order), pageSize: 25, initial: view.s, onChange: (s) => { view.s = s; },
        search: { placeholder: 'ابحث بالكود أو الاسم', keys: ['code', 'name', 'nameEn'] }, filters: [{ key: 'kind', label: 'النوع', options: Object.keys(KIND_AR).map((k) => [k, KIND_AR[k]]) }, { key: 'status', label: 'الحالة', options: [['active', 'فعّال'], ['retired', 'متقاعد']] }],
        columns: [
          { key: 'code', label: 'الكود', sort: true, render: (c) => code(c.code) },
          { key: 'name', label: 'المكوّن', sort: true, render: (c) => h('div', {}, h('b', {}, c.name), h('div.t-caption', { dir: 'ltr', style: { textAlign: 'start' } }, c.nameEn)) },
          { key: 'kind', label: 'النوع', render: (c) => SA.chip(KIND_AR[c.kind] || c.kind, 'info') },
          { key: 'taxable', label: 'الضريبة', render: (c) => (c.assignable || c.kind === 'overtime' || c.kind === 'adjustment' ? SA.chip(c.taxable ? 'خاضع' : 'معفى', c.taxable ? 'success' : 'neutral') : h('span.t-caption', {}, c.taxNote || '—')) },
          { key: 'insurable', label: 'التأمينات', render: (c) => (c.assignable || c.kind === 'overtime' || c.kind === 'adjustment' ? SA.chip(c.insurable ? 'تأميني' : 'غير تأميني', c.insurable ? 'success' : 'neutral') : h('span.t-caption', {}, c.insNote || '—')) },
          { key: 'calcText', label: 'طريقة الحساب', render: (c) => h('span.t-dense', {}, c.calcText) },
          { key: 'prorateText', label: 'التناسب', render: (c) => h('span.t-dense', {}, c.prorateText) },
          { key: 'status', label: 'الحالة', render: (c) => h('span', {}, SA.chip(c.status === 'active' ? 'فعّال' : 'متقاعد', c.status === 'active' ? 'success' : 'neutral'), c.review === 'pending' ? SA.tag('pending', 'تصنيف Pending') : null) }],
        rowActions: (c) => [{ label: 'تعديل', icon: 'edit', onClick: () => openComponentEditor(c), disabled: SA.can('hr.salary_structure.edit') ? false : NOPERM('hr.salary_structure.edit') }, { label: c.status === 'active' ? 'إيقاف' : 'تفعيل', icon: c.status === 'active' ? 'xcircle' : 'checkcircle', onClick: () => toggleComponent(c), disabled: SA.can('hr.salary_structure.edit') ? false : NOPERM('hr.salary_structure.edit') }, { label: 'سجل الإصدارات (' + (c.version || 1) + ')', icon: 'history', onClick: () => openComponentHistory(c) }],
        onRowClick: (c) => openComponentEditor(c), empty: { icon: 'coins', title: 'لا توجد مكونات', text: 'ابدأ بمكوّن جديد.', action: { label: 'مكوّن جديد', onClick: () => openComponentEditor(null), perm: 'hr.salary_structure.edit' } } });
      return h('div', {}, SA.alert('warning', h('b', {}, 'تصنيف المكونات (أساسي/متغير، تأميني، خاضع) Pending '), 'حتى يعتمده HR والمحاسب القانوني (بند 44 · D4). قانون 148 لا يفرّق أساسي/متغير للاشتراك — التقسيم هنا للعلاوة والجزاءات والتقارير.'), h('div.sap-tablecard-wrap', {}, tbl.el), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'تلميح الحساب المحاسبي نص إرشادي ولا يرحّل قيدًا (بند 40 ', SA.openValue('Open'), '). ', specLink('scr-sal-01'))));
    };
    return SA.live(panel, build, ['payComponents']);
  }
  function openComponentHistory(c) {
    const hs = c.history || []; SA.drawer({ title: 'إصدارات المكوّن ' + c.code, subtitle: c.name, size: 'md', body: hs.length ? h('ol.sap-pay-timeline', {}, hs.map((x) => h('li', {}, h('b', {}, 'v' + x.v), h('span.t-muted', {}, ' · ' + SA.fmt.dt(x.at) + ' · ' + SA.userName(x.by)), h('p', {}, x.reason || '—'), x.before ? h('div.t-caption', {}, 'قبل: ' + Object.keys(x.before).map((k) => k + '=' + x.before[k]).join('، ')) : null))) : SA.empty({ icon: 'history', title: 'لا إصدارات سابقة', text: 'المكوّن بإصداره الأول.' }) });
  }

  function tabGrades(panel, setActions) {
    setActions([]);
    return SA.live(panel, () => {
      const E = emps().filter((e) => e.status !== 'terminated'); const R = API.rules(todayISO());
      const rows = gradesList().map((g) => { const mem = E.filter((e) => { const gg = gradeOfBasic(basicOf(compLines(e.id, todayISO()).lines)); return gg && gg.id === g.id; }); const below = mem.filter((e) => basicOf(compLines(e.id, todayISO()).lines) < g.min).length; return { g, n: mem.length, below }; });
      const t = SA.table({ caption: 'الدرجات والنطاقات', rows: () => rows.map((r) => Object.assign({ id: r.g.id }, r)), pageSize: 10,
        columns: [{ key: 'id', label: 'الدرجة', render: (r) => code(r.g.id) }, { key: 'name', label: 'الاسم', render: (r) => h('b', {}, r.g.name) }, { key: 'min', label: 'الحد الأدنى للنطاق', render: (r) => AE(r.g.min) }, { key: 'max', label: 'الحد الأقصى', render: (r) => AE(r.g.max) },
          { key: 'n', label: 'موظفون', render: (r) => h('span.num', {}, r.n) }, { key: 'below', label: 'تحت النطاق', render: (r) => (r.below ? SA.chip(r.below + ' تحت الحد', 'warning') : SA.chip('سليم', 'success')) }, { key: 'dm', label: 'الحد الأدنى للأجر', render: (r) => (R.minWage && r.g.min < R.minWage.monthly ? SA.chip('النطاق يبدأ تحت ' + fe(R.minWage.monthly), 'danger') : SA.chip('أعلى من الحد القانوني', 'success')) }],
        rowActions: (r) => [{ label: 'تعديل النطاق', icon: 'edit', onClick: () => editGrade(r.g), disabled: SA.can('hr.salary_structure.edit') ? false : NOPERM('hr.salary_structure.edit') }], onRowClick: (r) => editGrade(r.g) });
      return h('div', {}, needWages(), SA.alert('info', 'نطاقات الدرجات (', SA.demoValue('DEMO'), ') إرشادية للتحقق من موقع الأساسي داخل الدرجة؛ لا تغيّر الحساب. أي موظف تحت حد نطاقه يظهر كتحذير في تعويضاته.'), h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, specLink('scr-sal-03')));
    }, ['payGrades', 'compAssignments', 'employees']);
  }
  function editGrade(g) {
    if (!SA.can('hr.salary_structure.edit')) { SA.toast(NOPERM('hr.salary_structure.edit'), 'warn'); return; } if (!canWages()) { SA.toast('نطاقات الدرجات سرية — تحتاج hr.salary.view', 'warn'); return; }
    const f = { name: field({ name: 'name', label: 'اسم الدرجة', value: g.name, required: true }), min: field({ name: 'min', label: 'الحد الأدنى (ج.م)', type: 'number', value: g.min, required: true, min: 0 }), max: field({ name: 'max', label: 'الحد الأقصى (ج.م)', type: 'number', value: g.max, required: true, min: 0 }), reason: field({ name: 'reason', label: 'السبب', type: 'textarea', rows: 2, required: true }) };
    formModal({ title: 'تعديل نطاق ' + g.id, icon: 'edit', fields: [f.name, f.min, f.max, f.reason], validate: (v) => (Number(v.min) >= Number(v.max) ? 'الحد الأدنى يجب أن يكون أقل من الأقصى' : ''), async onSubmit(v) { await SA.api(() => { st.patch('payGrades', g.id, { name: v.name, min: Number(v.min), max: Number(v.max) }); aud('HR.SALARY.GRADE_CHANGED', { type: 'pay_grade', id: g.id, label: v.name }, { reason: v.reason, before: { min: g.min, max: g.max }, after: { min: Number(v.min), max: Number(v.max) } }); }); SA.toast('حُفظ نطاق ' + g.id, 'success'); return true; } });
  }

  function tabAssign(panel, setActions, ctxPath) {
    setActions([]); const view = {};
    const stop = SA.live(panel, () => {
      const rows = () => emps().filter((e) => e.status !== 'terminated').map((e) => { const cl = compLines(e.id, todayISO()); const b = basicOf(cl.lines), tot = monthlyOf(cl.lines); const g = gradeOfBasic(b); const mi = minInfo(e); const pend = col('salaryChanges').find((x) => x.employeeId === e.id && x.status === 'pending'); return { id: e.id, e, cl, basic: b, total: tot, grade: g, mi, pend, name: e.name, dept: deptName(e.departmentId) }; });
      const t = SA.table({ caption: 'تعويضات الموظفين', rows, pageSize: 10, initial: view.s, onChange: (s) => { view.s = s; }, search: { placeholder: 'ابحث بالاسم أو الرقم الوظيفي', keys: (r, q) => (r.name + ' ' + r.e.empNo).toLowerCase().indexOf(q) >= 0 },
        filters: [{ key: 'dept', label: 'القسم', options: deptOpts().slice(1).map((o) => [o[1], o[1]]), test: (r, v) => r.dept === v }, { key: 'grade', label: 'الدرجة', options: gradesList().map((g) => [g.id, g.id]), test: (r, v) => r.grade && r.grade.id === v }, { key: 'flag', label: 'تنبيه', options: [['below', 'تحت الحد الأدنى للأجر'], ['range', 'خارج نطاق الدرجة'], ['pend', 'تغيير معلّق']], test: (r, v) => (v === 'below' ? r.mi.ok === false : v === 'pend' ? !!r.pend : r.grade && (r.basic < r.grade.min || r.basic > r.grade.max)) }],
        columns: [{ key: 'name', label: 'الموظف', sort: true, render: (r) => h('div.sap-usercell', {}, SA.avatar(r.name), h('div', {}, h('b', {}, r.name), h('small', {}, r.e.empNo + ' · ' + r.dept))) }, { key: 'grade', label: 'الدرجة', render: (r) => (r.grade ? code(r.grade.id) : '—') },
          { key: 'basic', label: 'الأساسي', sort: true, render: (r) => AE(r.basic) }, { key: 'allow', label: 'البدلات والحوافز', render: (r) => AE(r.total - r.basic) }, { key: 'total', label: 'الإجمالي الشهري', sort: true, render: (r) => h('b', {}, AE(r.total)) },
          { key: 'from', label: 'ساري من', render: (r) => h('span.num', {}, r.cl.from || '—') }, { key: 'mw', label: 'الحد الأدنى', render: (r) => (r.mi.daily ? SA.chip('أجر يومي', 'neutral') : r.mi.ok === null ? SA.openValue() : chipOk(r.mi.ok ? 'مطابق' : 'أقل من الحد', r.mi.ok)) },
          { key: 'pend', label: 'تغيير', render: (r) => (r.pend ? SA.chip('معلّق ' + r.pend.id, 'warning') : '—') }],
        onRowClick: (r) => openEmpComp(r.id), rowActions: (r) => [{ label: 'فتح التعويضات والتاريخ', icon: 'list', onClick: () => openEmpComp(r.id) }, { label: 'تغيير التعويضات', icon: 'edit', onClick: () => openChange(r.id), disabled: SA.can('hr.salary.change.request') ? false : NOPERM('hr.salary.change.request') }] });
      return h('div', {}, needWages(), h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'كل تعويض بتاريخ سريان؛ لا تداخل بين تعويضين معتمدين (BR-SAL-05). التغيير بأثر رجعي داخل فترة مقفولة لا يعدّل الدفعة — يُنتج دورة فروق (BR-SAL-06). ', specLink('scr-sal-04'))));
    }, ['compAssignments', 'employees', 'salaryChanges', 'payGrades', 'settings.hrPayroll']);
    if (ctxPath && ctxPath[0] && empById(ctxPath[0])) setTimeout(() => openEmpComp(ctxPath[0]), 60);
    return stop;
  }
  function openEmpComp(empId) {
    const e = empById(empId); if (!e) return; logSalaryView(empId, 'عرض تعويضات الموظف'); const meta = compMeta();
    const hist = col('compAssignments').filter((a) => a.employeeId === empId && a.status === 'approved').sort((a, b) => (a.from < b.from ? 1 : -1)); const pend = col('salaryChanges').filter((x) => x.employeeId === empId && x.status === 'pending'); const cl = compLines(empId, todayISO()); const mi = minInfo(e); const g = gradeOfBasic(basicOf(cl.lines));
    const compsTbl = h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['المكوّن', 'المبلغ الشهري', 'الضريبة', 'التأمينات'].map((x) => h('th', {}, x)))), h('tbody', {}, cl.lines.map((l) => { const m = meta[l.code] || {}; return h('tr', {}, h('td', {}, h('b', {}, m.name || l.code), ' ', code(l.code)), h('td', {}, AE(l.amount)), h('td', {}, SA.chip(m.taxable ? 'خاضع' : 'معفى', m.taxable ? 'success' : 'neutral')), h('td', {}, SA.chip(m.insurable ? 'تأميني' : 'غير تأميني', m.insurable ? 'success' : 'neutral'))); }), h('tr.sap-pay-total', {}, h('td', {}, 'الإجمالي'), h('td', {}, h('b', {}, AE(monthlyOf(cl.lines)))), h('td'), h('td')))));
    const body = h('div', {}, needWages(), cl.drift ? SA.alert('info', 'التعويض مُواءَم مع ملف الموظف (تغيير من الموارد البشرية بعد آخر تعويض مسجّل).') : null,
      SA.kv([['الموظف', e.name + ' · ' + e.empNo], ['القسم والوظيفة', deptName(e.departmentId)], ['الدرجة', g ? g.id + ' — ' + g.name : '—'], ['نطاق الدرجة', g && canWages() ? fe(g.min) + ' – ' + fe(g.max) + ' ج.م' : (g ? secret() : '—')], ['الحد الأدنى للأجر', mi.daily ? 'أجر يومي — يُقارن بحد الساعة' : (mi.min == null ? SA.openValue() : h('span', {}, chipOk(mi.ok ? 'مطابق' : 'أقل من ' + fe(mi.min), mi.ok), ' (الأساس: ' + (MW_BASIS.find((b) => b[0] === mi.basis) || [0, mi.basis])[1] + ')'))]]),
      h('h3.sap-sub', {}, 'المكونات السارية'), compsTbl,
      pend.length ? h('div', {}, h('h3.sap-sub', {}, 'تغييرات معلّقة'), pend.map((p) => SA.alert('warning', h('b', {}, p.id + ' · '), 'من ' + (p.effectiveFrom || 'تاريخ الاعتماد') + ' — ', openLink('متابعة في صندوق الاعتمادات', SA.href('approvals/' + p.approvalId))))) : null,
      h('h3.sap-sub', {}, 'تاريخ التعويضات'), hist.length ? h('ol.sap-pay-timeline', {}, hist.map((a, i) => h('li', { class: i === 0 ? 'is-now' : '' }, h('b', {}, 'من ' + a.from), h('span.t-muted', {}, ' · ' + (SRC_AR[a.source] || a.source) + (i === 0 ? ' · ساري' : '')), h('div', {}, 'الأساسي: ', AE(basicOf(a.lines)), ' · الإجمالي: ', AE(monthlyOf(a.lines))), h('div.t-caption', {}, (a.reason || '') + (a.createdBy ? ' — ' + SA.userName(a.createdBy) : '') + (a.approvalId ? ' · ' + a.approvalId : ''))))) : SA.empty({ icon: 'history', title: 'لا تاريخ' }));
    const conflict = conflictWith(empId);
    SA.drawer({ title: e.name, subtitle: 'تعويضات الموظف بتاريخ سريان', size: 'lg', body, foot: [SA.btn({ label: 'تغيير التعويضات', icon: 'edit', kind: 'primary', perm: 'hr.salary.change.request', reason: conflict || (!canWages() ? 'تحتاج hr.salary.view لرؤية القيم' : ''), onClick: () => openChange(empId) })] });
  }
  function openChange(empId) {
    const e = empById(empId); if (!e) return; if (!SA.can('hr.salary.change.request')) { SA.toast(NOPERM('hr.salary.change.request'), 'warn'); return; } if (!canWages()) { SA.toast('تحتاج hr.salary.view لرؤية القيم وتعديلها', 'warn'); return; }
    const cf = conflictWith(empId); if (cf) { SA.toast(cf, 'error', { ms: 6500 }); return; }
    if (col('salaryChanges').some((x) => x.employeeId === empId && x.status === 'pending')) { SA.toast('يوجد تغيير معلّق لنفس الموظف — اعتمده أو ارفضه أولًا (لا تداخل).', 'warn', { ms: 6000 }); return; }
    const cl = compLines(empId, todayISO()); const meta = compMeta(); const lines = cl.lines.map((l) => ({ code: l.code, amount: l.amount })); const R = API.rules(todayISO());
    const eff = field({ name: 'eff', label: 'يسري من شهر', type: 'month', value: PER.cur(), required: true, hint: 'يسري من أول الشهر المختار. شهر سابق مقفول ⇒ دورة فروق.' }); const reason = field({ name: 'reason', label: 'سبب التغيير', type: 'textarea', rows: 2, required: true });
    const box = h('div.sap-pay-lines'); const msg = h('div'); const addSel = h('select.select', { 'aria-label': 'إضافة مكوّن' });
    const redraw = () => {
      SA.clear(box); lines.forEach((l, i) => { const m = meta[l.code] || {}; const inp = h('input.input.num', { type: 'number', min: 0, value: l.amount, 'aria-label': m.name || l.code, dir: 'ltr', style: { textAlign: 'start' }, onchange: (ev) => { l.amount = Math.max(0, Number(ev.target.value) || 0); check(); } });
        box.append(h('div.sap-pay-line', {}, h('span', {}, h('b', {}, m.name || l.code), ' ', code(l.code)), inp, l.code === 'BASIC' ? h('span.t-caption', {}, 'الأساسي') : h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { lines.splice(i, 1); redraw(); check(); } }, SA.icon('trash', 'icon-sm'), 'إزالة'))); });
      SA.clear(addSel); addSel.append(h('option', { value: '' }, 'إضافة مكوّن…')); col('payComponents').filter((c) => c.assignable && c.status === 'active' && !lines.some((l) => l.code === c.code)).forEach((c) => addSel.append(h('option', { value: c.code }, c.name + ' (' + c.code + ')'))); check();
    };
    addSel.addEventListener('change', () => { if (addSel.value) { lines.push({ code: addSel.value, amount: 0 }); redraw(); } });
    let blockMsg = '';
    function check() {
      SA.clear(msg); blockMsg = ''; const b = basicOf(lines); const mw = R.minWage; const basis = (st.get('settings.hrPayroll') || {}).minWageBasis || 'basic'; const bv = minBasisValue(lines, basis); const g = gradeOfBasic(b); const month = eff.get() || PER.cur();
      if (!(b > 0)) blockMsg = 'الأساسي مطلوب وأكبر من صفر.';
      else if (mw && e.employmentType !== 'daily' && bv < mw.monthly) blockMsg = 'أقل من الحد الأدنى للأجر ' + fe(mw.monthly) + ' ج.م (الأساس: ' + (MW_BASIS.find((x) => x[0] === basis) || [0, basis])[1] + ') — ممنوع الحفظ.';
      if (blockMsg) msg.append(SA.alert('danger', blockMsg));
      if (g && b > 0 && (b < g.min || b > g.max)) msg.append(SA.alert('warning', 'الأساسي خارج نطاق ' + g.id + ' (' + fe(g.min) + ' – ' + fe(g.max) + ').'));
      const locked = col('payrollRuns').find((r) => r.period >= month && (r.status === 'locked' || r.status === 'released') && (!r.type || r.type === 'regular'));
      if (locked) msg.append(SA.alert('info', 'الفترة ' + PER.label(locked.period) + ' مقفولة (' + locked.id + ') — لا تتعدّل؛ سيُولَّد الفرق في دورة تصحيح (BR-SAL-06).'));
      msg.append(h('div.sap-pay-sum', {}, 'الإجمالي الجديد: ', h('b.num', {}, fe(monthlyOf(lines))), ' ج.م  (الحالي ', h('span.num', {}, fe(monthlyOf(cl.lines))), ')'));
    }
    eff.input.addEventListener('change', check); redraw();
    formModal({ title: 'تغيير تعويضات ' + e.name, subtitle: 'يمرّ بطلب اعتماد: مدير HR ← المدير العام — من ينشئ لا يعتمد', icon: 'edit', size: 'lg', fields: [eff, reason], before: h('div', {}, box, addSel), after: msg, confirmLabel: 'إرسال للاعتماد',
      validate: () => blockMsg, async onSubmit(v) {
        const from = (v.eff || PER.cur()) + '-01'; let sc;
        await SA.api(() => {
          sc = { id: nextSC(), employeeId: empId, fromBasic: basicOf(cl.lines), toBasic: basicOf(lines), components: SA.clone(lines), effectiveFrom: from, reason: v.reason, requestedBy: meId(), status: 'pending', approvalId: null, createdAt: new Date().toISOString() };
          const ap = SA.requestApproval({ type: 'salary_change', title: 'تغيير مرتب: ' + e.name + ' (' + v.reason.slice(0, 40) + ')', requesterId: meId(), chain: [{ roleId: 'R-11', label: 'مدير الموارد البشرية' }, { roleId: 'R-02', label: 'المدير العام' }], ref: { type: 'salary_change', id: sc.id }, context: [['الموظف', e.name + ' (' + e.empNo + ')'], ['يسري من', from], ['السبب', v.reason], ['ملاحظة', 'الأرقام سرية (hr.salary.view). مقدّم الطلب لا يعتمده (فصل مهام).']] });
          sc.approvalId = ap.id; st.insert('salaryChanges', sc, true);
          aud('HR.SALARY.CHANGE_REQUESTED', { type: 'salary_change', id: sc.id, label: 'تغيير مرتب — ' + e.name }, { reason: v.reason, after: { effectiveFrom: from, approval: ap.id } });
        }); SA.toast('أُرسل طلب ' + sc.id + ' للاعتماد (' + sc.approvalId + ')', 'success'); return true;
      } });
  }

  function tabMinWage(panel, setActions) {
    setActions([]);
    return SA.live(panel, () => {
      const R = API.rules(todayISO()); const S = st.get('settings.hrPayroll') || {}; const basis = S.minWageBasis || 'basic'; const mw = R.minWage;
      const rows = () => emps().filter((e) => e.status !== 'terminated').map((e) => ({ id: e.id, e, mi: minInfo(e), name: e.name }));
      const counts = {}; MW_BASIS.forEach((b) => { counts[b[0]] = rows().filter((r) => !r.mi.daily && mw && r.mi.vals[b[0]] < mw.monthly).length; });
      const seg = SA.segmented(MW_BASIS.map((b) => [b[0], b[1] + (canWages() ? ' (' + counts[b[0]] + ' تحت الحد)' : '')]), basis, (v) => changeBasis(v));
      if (!SA.can('hr.settings.edit')) SA.$$('button', seg).forEach((b) => b.setAttribute('aria-disabled', 'true'));
      const t = SA.table({ caption: 'فحص الحد الأدنى للأجر', rows, pageSize: 10, search: { placeholder: 'ابحث بالاسم', keys: ['name'] }, filters: [{ key: 'ok', label: 'الحالة', options: [['no', 'أقل من الحد'], ['yes', 'مطابق']], test: (r, v) => (v === 'no' ? r.mi.ok === false : r.mi.ok === true) }],
        columns: [{ key: 'name', label: 'الموظف', sort: true, render: (r) => h('div.sap-usercell', {}, SA.avatar(r.name), h('div', {}, h('b', {}, r.name), h('small', {}, r.e.empNo)))}, { key: 'v', label: 'قيمة أساس المقارنة', render: (r) => AE(r.mi.value) }, { key: 'min', label: 'الحد الساري', render: () => (mw ? h('span.num', {}, fe(mw.monthly)) : SA.openValue()) },
          { key: 'diff', label: 'الفرق', render: (r) => (canWages() && mw ? h('span.num' + (r.mi.value < mw.monthly ? '.sap-pay-neg' : ''), {}, fe(r.mi.value - mw.monthly)) : secret()) }, { key: 'st', label: 'الحالة', render: (r) => (r.mi.daily ? SA.chip('أجر يومي — بحد الساعة', 'neutral') : r.mi.ok === null ? SA.openValue() : chipOk(r.mi.ok ? 'مطابق' : 'أقل من الحد', r.mi.ok)) }],
        rowActions: (r) => [{ label: 'تغيير التعويضات', icon: 'edit', onClick: () => openChange(r.id), disabled: SA.can('hr.salary.change.request') ? false : NOPERM('hr.salary.change.request') }] });
      return h('div', {}, needWages(), SA.alert('warning', h('b', {}, 'الحد الأدنى للأجر (قطاع خاص): '), mw ? fe(mw.monthly) + ' ج.م/شهر من ' + mw.from + ' · ' + fe(mw.hourly) + ' ج.م/ساعة للجزئي ' : 'غير مُعدّ ', lawTag(), ' ', h('span', {}, 'القيمة من جدول القواعد (' + (mw ? mw.id : '—') + ') ويُعدَّل من '), openLink('الامتثال', SA.href('hr/compliance')), '. أساس المقارنة ', SA.openValue('Open'), ' — هل يشمل البدلات وحصة صاحب العمل؟ (مصدر ثانوي).'),
        h('div.sap-pay-basis', {}, h('b', {}, 'أساس المقارنة المُجرَّب'), seg, h('span.t-caption', {}, SA.can('hr.settings.edit') ? 'الاختيار الحالي تجريبي (Pending) — يُغيّره HR بخطوة تحقق.' : 'التغيير من صلاحية hr.settings.edit.')), h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, specLink('scr-sal-06')));
    }, ['compAssignments', 'employees', 'settings.hrPayroll', 'settings.hrLegal']);
  }
  async function changeBasis(v) {
    if (!SA.can('hr.settings.edit')) { SA.toast(NOPERM('hr.settings.edit'), 'warn'); st.set('settings.hrPayroll.minWageBasis', st.get('settings.hrPayroll.minWageBasis')); return; }
    const cur = (st.get('settings.hrPayroll') || {}).minWageBasis; if (cur === v) return;
    const r = await SA.confirm({ title: 'تغيير أساس فحص الحد الأدنى', confirmLabel: 'تطبيق', reasonRequired: true, impact: ['يغيّر نتيجة الفحص في تعويضات الموظفين والدورات القادمة.', 'القرار النهائي {Open} مع المحاسب القانوني.'] });
    if (!r.ok) { st.set('settings.hrPayroll.minWageBasis', cur); return; } if (!(await SA.stepUp('policy.change'))) { st.set('settings.hrPayroll.minWageBasis', cur); return; }
    try { await SA.api(() => { st.set('settings.hrPayroll.minWageBasis', v); aud('HR.PAYROLL.SETTINGS_CHANGED', { type: 'settings', id: 'hrPayroll.minWageBasis', label: 'أساس فحص الحد الأدنى للأجر' }, { reason: r.reason, before: { basis: cur }, after: { basis: v } }); }); SA.toast('طُبّق أساس المقارنة', 'success'); } catch (e) { st.set('settings.hrPayroll.minWageBasis', cur); SA.fail(e); }
  }

  function lastRaiseDate(empId) { const a = col('compAssignments').filter((x) => x.employeeId === empId && x.status === 'approved' && x.source !== 'hire').sort((p, q) => (p.from < q.from ? 1 : -1))[0]; const e = empById(empId); return a ? a.from : e ? e.hireDate : null; }
  function tabRaise(panel, setActions) {
    const draft = { eff: PER.add(PER.cur(), 1), prop: {}, sel: {} };
    setActions([]);
    return SA.live(panel, () => {
      const R = API.rules(todayISO()); const rs = R.raise; const effDate = draft.eff + '-01'; const meta = compMeta();
      const elig = emps().filter((e) => e.status !== 'terminated' && e.status !== 'suspended').map((e) => { const lr = lastRaiseDate(e.id); const cl = compLines(e.id, todayISO()); const b = basicOf(cl.lines); const insRaw = sum(cl.lines.filter((l) => meta[l.code] && meta[l.code].insurable), (l) => l.amount); const insW = R.insurance ? Math.min(Math.max(insRaw, R.insurance.min), R.insurance.max) : insRaw; const minRaise = rs ? Math.max(Math.round(insW * rs.pct) / 100, rs.floor) : null; return { e, lr, due: lr ? addDays(lr, 365) : null, b, insW, minRaise, cl }; }).filter((x) => x.due && x.due <= effDate && col('salaryChanges').every((c) => !(c.employeeId === x.e.id && c.status === 'pending')));
      elig.forEach((x) => { if (draft.prop[x.e.id] == null) draft.prop[x.e.id] = x.minRaise; if (draft.sel[x.e.id] == null) draft.sel[x.e.id] = true; });
      const total = () => sum(elig.filter((x) => draft.sel[x.e.id]), (x) => Number(draft.prop[x.e.id]) || 0); const totalBox = h('b.num', {}, canWages() ? fe(total()) : '—'); const cnt = h('span.num', {}, elig.filter((x) => draft.sel[x.e.id]).length);
      const effIn = h('input.input', { type: 'month', value: draft.eff, 'aria-label': 'شهر سريان العلاوة', style: { maxWidth: '200px' }, onchange: (ev) => { draft.eff = ev.target.value || draft.eff; draft.prop = {}; draft.sel = {}; SA.store.set('ui.payRaiseTick', Date.now()); } });
      const rowsEl = elig.map((x) => { const id = x.e.id; const inp = h('input.input.num', { type: 'number', min: 0, step: '0.01', value: draft.prop[id], disabled: !canWages(), 'aria-label': 'قيمة العلاوة ' + x.e.name, dir: 'ltr', style: { textAlign: 'start', maxWidth: '130px' }, onchange: (ev) => { draft.prop[id] = Number(ev.target.value) || 0; totalBox.textContent = canWages() ? fe(total()) : '—'; flag.replaceChildren(...flagNodes(x)); } });
        const flagNodes = (xx) => (Number(draft.prop[id]) + 0.001 < xx.minRaise ? [SA.chip('أقل من الحد الأدنى للعلاوة', 'danger')] : [SA.chip('مطابق', 'success')]); const flag = h('span', {}, flagNodes(x)); const cb = h('input', { type: 'checkbox', checked: !!draft.sel[id], 'aria-label': 'تضمين ' + x.e.name, onchange: (ev) => { draft.sel[id] = ev.target.checked; totalBox.textContent = canWages() ? fe(total()) : '—'; cnt.textContent = elig.filter((q) => draft.sel[q.e.id]).length; } });
        return h('tr', {}, h('td', {}, h('label.perm-cb', {}, cb, h('span'))), h('td', {}, h('b', {}, x.e.name), h('div.t-caption', {}, x.e.empNo + ' · ' + deptName(x.e.departmentId))), h('td', {}, h('span.num', {}, x.lr || '—')), h('td', {}, AE(x.insW)), h('td', {}, canWages() && x.minRaise != null ? h('span.num', {}, fe(x.minRaise)) : secret()), h('td', {}, inp), h('td', {}, AE(x.b)), h('td', {}, canWages() ? h('span.num', {}, fe(x.b + (Number(draft.prop[id]) || 0))) : secret()), h('td', {}, flag)); });
      const cycles = col('raiseCycles');
      return h('div', {}, needWages(), SA.alert('info', h('b', {}, 'قاعدة العلاوة السنوية: '), rs ? 'تستحق بعد سنة من التعيين/آخر علاوة وقيمتها ≥ الأكبر بين ' + rs.pct + '% × الأجر التأميني و' + fe(rs.floor) + ' ج.م ' : 'غير مُعدّة ', lawTag(), ' الاستثناء فقط بقرار موثّق من المجلس القومي للأجور.'),
        h('div.sap-pay-basis', {}, h('label', {}, h('b', {}, 'شهر السريان'), ' ', effIn), h('span.t-muted', {}, elig.length + ' موظف مستحق في هذا التاريخ'), h('span.sap-pay-grow'), SA.btn({ label: 'إنشاء دورة علاوة وإرسالها للاعتماد', icon: 'checkcircle', kind: 'primary', perm: 'hr.salary.change.request', reason: !canWages() ? 'تحتاج hr.salary.view' : !elig.length ? 'لا موظفون مستحقون' : '', onClick: () => createRaiseCycle(elig, draft) })),
        elig.length ? h('div.table-wrap.sap-pay-scroll', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['', 'الموظف', 'آخر علاوة/تعيين', 'الأجر التأميني', 'الحد الأدنى للعلاوة', 'العلاوة المقترحة', 'الأساسي الحالي', 'الأساسي الجديد', 'التحقق'].map((x) => h('th', {}, x)))), h('tbody', {}, rowsEl)), h('div.sap-pay-foot', {}, 'المحدد: ', cnt, ' موظف · إجمالي العلاوات الشهرية: ', totalBox, ' ج.م')) : SA.empty({ icon: 'clock', title: 'لا موظفين مستحقين لعلاوة في هذا الشهر', text: 'جرّب شهرًا لاحقًا — الاستحقاق بعد 12 شهرًا من التعيين/آخر علاوة.' }),
        h('h3.sap-sub', {}, 'دورات العلاوة'), cycles.length ? h('div.sap-pay-list', {}, cycles.map((c) => h('div.sap-pay-rowcard', {}, h('b', {}, c.id), ' ', SA.chip({ draft: 'مسودة', submitted: 'بانتظار الاعتماد', applied: 'مُطبّقة', rejected: 'مرفوضة' }[c.status] || c.status, c.status === 'applied' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning'), h('span.t-muted', {}, ' · سريان ' + c.effectiveFrom + ' · ' + c.proposals.length + ' موظف · '), c.approvalId ? openLink(c.approvalId, SA.href('approvals/' + c.approvalId)) : null))) : h('p.t-muted', {}, 'لا دورات علاوة بعد.'), h('p.sap-hint', {}, specLink('scr-sal-07')));
    }, ['compAssignments', 'raiseCycles', 'employees', 'ui.payRaiseTick']);
  }
  async function createRaiseCycle(elig, draft) {
    const picks = elig.filter((x) => draft.sel[x.e.id]); if (!picks.length) { SA.toast('اختر موظفًا واحدًا على الأقل.', 'warn'); return; }
    const bad = picks.filter((x) => Number(draft.prop[x.e.id]) + 0.001 < x.minRaise); if (bad.length) { SA.toast(bad.length + ' علاوة أقل من الحد الأدنى القانوني — عدّلها أو أزل الموظف (الاستثناء يحتاج قرار مجلس الأجور موثّقًا).', 'error', { ms: 7000 }); return; }
    const conf = picks.find((x) => conflictWith(x.e.id)); if (conf) { SA.toast(conflictWith(conf.e.id) + ' — ' + conf.e.name, 'error', { ms: 7000 }); return; }
    const r = await SA.confirm({ title: 'إنشاء دورة علاوة سنوية', confirmLabel: 'إرسال للاعتماد', impact: [picks.length + ' موظف · سريان ' + draft.eff + '-01', 'تمرّ بطلب اعتماد: مدير HR ← المدير العام. لا تطبيق قبل الاعتماد.', 'تُنشأ تعويضات جديدة بتاريخ سريان ويُحدَّث ملف الموظف عند الاعتماد.'] }); if (!r.ok) return;
    try {
      let rc; await SA.api(() => {
        rc = { id: 'RC-' + new Date().getFullYear() + '-' + String(col('raiseCycles').length + 1).padStart(3, '0'), effectiveFrom: draft.eff + '-01', status: 'submitted', createdBy: meId(), createdAt: new Date().toISOString(), proposals: picks.map((x) => ({ empId: x.e.id, from: x.b, raise: Number(draft.prop[x.e.id]), to: Math.round((x.b + Number(draft.prop[x.e.id])) * 100) / 100 })), approvalId: null };
        const ap = SA.requestApproval({ type: 'salary_change', title: 'دورة علاوة سنوية ' + rc.id + ' (' + picks.length + ' موظف)', requesterId: meId(), chain: [{ roleId: 'R-11', label: 'مدير الموارد البشرية' }, { roleId: 'R-02', label: 'المدير العام' }], ref: { type: 'raise_cycle', id: rc.id }, context: [['الدورة', rc.id], ['عدد الموظفين', String(picks.length)], ['يسري من', rc.effectiveFrom], ['ملاحظة', 'الأرقام سرية (hr.salary.view). الحد الأدنى للعلاوة من جدول القواعد.']] });
        rc.approvalId = ap.id; st.insert('raiseCycles', rc, true); aud('HR.SALARY.RAISE_CYCLE_CREATED', { type: 'raise_cycle', id: rc.id, label: 'دورة علاوة ' + rc.id }, { after: { count: picks.length, effectiveFrom: rc.effectiveFrom, approval: ap.id } });
      }); SA.toast('أُرسلت دورة العلاوة ' + rc.id + ' للاعتماد (' + rc.approvalId + ')', 'success');
    } catch (e) { SA.fail(e); }
  }

  /* HR-13 register */
  reg('hr-salary', function (root, ctx) {
    return loadScreen(root, ctx, 'هيكل المرتب', () => {
      const actions = h('div.sap-actions'); const setActions = (n) => { SA.clear(actions); n.forEach((x) => actions.append(x)); };
      const kpis = h('div'); const host = h('div.sap-pay-host');
      root.append(SA.pageHead({ title: 'هيكل المرتب ومكوناته', desc: 'كتالوج مكونات قابل للتهيئة (خاضع؟ تأميني؟ ثابت/معادلة؟ تناسب؟) · الدرجات · تعويضات بتاريخ سريان · فحص الحد الأدنى · العلاوة السنوية. لا قيمة قانونية داخل الكود.', tags: [lawTag(), SA.tag('pending', 'بند 44 · D4')], actions }), kpis, host);
      const stopK = SA.live(kpis, () => { const E = emps().filter((e) => e.status !== 'terminated'); const below = E.filter((e) => minInfo(e).ok === false).length; return kpiRow([['مكونات فعّالة', col('payComponents').filter((c) => c.status === 'active').length, { sub: col('payComponents').length + ' في الكتالوج' }], ['الدرجات', gradesList().length, { sub: 'نطاقات DEMO' }], ['تحت الحد الأدنى للأجر', canWages() ? below : '—', { sub: 'حسب الأساس المختار', accent: below > 0 && canWages() }], ['تغييرات معلّقة', col('salaryChanges').filter((x) => x.status === 'pending').length, { href: SA.href('approvals'), sub: 'في صندوق الاعتمادات' }]]); }, ['payComponents', 'compAssignments', 'salaryChanges', 'settings.hrPayroll', 'payGrades']);
      const t = tabbed(host, [{ id: 'catalog', label: 'كتالوج المكونات', icon: 'list', build: (p) => tabCatalog(p, setActions) }, { id: 'grades', label: 'الدرجات والنطاقات', icon: 'layers', build: (p) => tabGrades(p, setActions) }, { id: 'assign', label: 'تعويضات الموظفين', icon: 'users', build: (p) => tabAssign(p, setActions, ctx.path) }, { id: 'minwage', label: 'الحد الأدنى للأجر', icon: 'shield', build: (p) => tabMinWage(p, setActions) }, { id: 'raise', label: 'العلاوة السنوية', icon: 'clock', build: (p) => tabRaise(p, setActions) }], ctx.params.tab || (ctx.path[0] ? 'assign' : 'catalog'));
      return () => { stopK(); t.cleanup(); };
    });
  });

  /* ═══════════════════════════════════════════ HR-14 · دورة المرتبات (hr-payroll) ═══════════════════════════════════════════ */
  function live2(root, build, paths) { const run = () => { const sy = window.scrollY; SA.clear(root); const n = build(); if (n) root.appendChild(n); window.scrollTo(0, sy); }; const offs = (paths || []).map((p) => st.subscribe(p, run)); run(); return { refresh: run, stop: () => offs.forEach((f) => f()) }; }
  const STEPS = ['الفترة والمدخلات', 'الحساب', 'الفحوصات', 'المراجعة والاعتماد', 'القفل والصرف والنشر'];
  const stepOf = (run) => { const s = run.status; return s === 'draft' ? 0 : s === 'inputs_frozen' ? 1 : s === 'calculated' ? 2 : (s === 'prepared' || s === 'hr_review' || s === 'finance_approved') ? 3 : 4; };
  const TYPE_AR = { regular: 'دورة عادية', arrears: 'دورة فروق (تصحيح)', reversal: 'مستند عكس', offcycle: 'دورة إضافية' };
  const approvalOf = (run) => (run.approvalId ? st.find('approvals', run.approvalId) : null);
  const isSubmitted = (run) => ORD[run.status] >= ORD.prepared;
  function nextAction(run) {
    const ap = approvalOf(run);
    switch (run.status) {
      case 'draft': return 'سحب المدخلات'; case 'inputs_frozen': return 'حساب الدورة'; case 'calculated': return blockers(run).length ? 'معالجة الفحوصات المانعة' : 'الإرسال للمراجعة';
      case 'prepared': case 'hr_review': case 'finance_approved': { const s = ap && ap.chain[ap.currentStep - 1]; return s ? 'بانتظار: ' + s.label : '—'; }
      case 'gm_approved': return 'قفل الفترة'; case 'locked': return 'إطلاق الصرف'; case 'released': return run.published ? 'مكتملة' : 'نشر المفردات'; default: return '—';
    }
  }
  function mineNow(run) {
    if (!SA.session.isAuthed) return false; const ap = approvalOf(run); const me = meId();
    if (ORD[run.status] <= ORD.calculated) return SA.can('hr.payroll.prepare');
    if (ORD[run.status] <= ORD.finance_approved) return !!ap && canDecide(ap, (s) => (run.preparedBy === me ? 'فصل المهام: من جهّز الكشف لا يعتمده.' : '')).ok;
    return SA.can('hr.payroll.release') && run.preparedBy !== me && !(run.status === 'released' && run.published);
  }
  const needMeCount = () => { try { return col('payrollRuns').filter((r) => r.status !== 'cancelled' && !(r.status === 'released' && r.published) && mineNow(r)).length || null; } catch (e) { return null; } };
  const sodBlock = (run, what) => (run.preparedBy === meId() ? 'فصل المهام: أنت من جهّز هذا الكشف — لا يمكنك ' + what + ' (BR-PRL-11).' : '');

  /* ───── actions (confirm · step-up · SoD · audit) ───── */
  async function actPull(run) {
    if (!SA.can('hr.payroll.prepare')) { SA.toast(NOPERM('hr.payroll.prepare'), 'warn'); return; } if (isSubmitted(run)) { SA.toast('الكشف أُرسل للمراجعة — لا إعادة سحب إلا بعد الرفض/الإرجاع.', 'warn'); return; }
    try { await SA.api(() => doPull(run.id)); const r = getRun(run.id); SA.toast('سُحبت المدخلات وجُمّدت: ' + r.inputs.counts.employees + ' موظف', 'success'); } catch (e) { SA.fail(e); }
  }
  async function actCalc(run) {
    if (!SA.can('hr.payroll.prepare')) { SA.toast(NOPERM('hr.payroll.prepare'), 'warn'); return; } if (isSubmitted(run)) { SA.toast('الكشف أُرسل للمراجعة — لا إعادة حساب.', 'warn'); return; }
    const bar = h('div.progress', {}, h('span', { style: { width: '8%', transition: 'width .25s' } })); const lab = h('p.t-muted', {}, 'في قائمة الانتظار (Queued)…');
    const m = SA.modal({ title: 'حساب الدورة ' + run.id, icon: 'gauge', size: 'sm', dismissible: false, body: h('div.sap-confirm', {}, lab, bar, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الدورة تُنفَّذ كمهمة خلفية بتقدّم واستئناف (BR-PRL-20) — هنا محاكاة.')))});
    const tick = [[250, 30, 'جاري الحساب (Running)…'], [600, 70, 'تطبيق التأمينات والضريبة بجداول القواعد الساريّة…'], [950, 100, 'اكتمل (Done)']]; tick.forEach((t) => setTimeout(() => { bar.firstChild.style.width = t[1] + '%'; lab.textContent = t[2]; }, t[0]));
    try { await SA.api(() => doCalc(run.id), { ms: 1050 }); m.close(); const r = getRun(run.id); SA.toast('اكتمل الحساب — ' + r.lines.length + ' سطر · ' + (r.checks.filter((c) => c.status === 'open' && c.sev === 'block').length) + ' فحص مانع', 'success'); } catch (e) { m.close(); SA.fail(e); }
  }
  async function actFix(run, ck, value) {
    if (!SA.can('hr.payroll.prepare')) { SA.toast(NOPERM('hr.payroll.prepare'), 'warn'); return; } if (isSubmitted(run)) { SA.toast('الكشف أُرسل — المعالجة بعد الإرجاع فقط.', 'warn'); return; }
    let reason = '';
    if (ck.type === 'miss_bank') { const r = await SA.confirm({ title: value === 'cash' ? 'تحويل ' + empName(ck.empId) + ' لصرف نقدي' : 'حجز مرتب ' + empName(ck.empId), reasonRequired: true, confirmLabel: 'تطبيق', impact: [value === 'cash' ? 'يظهر في كشف الصرف النقدي بدل ملف البنك (لهذه الدورة فقط).' : 'يُستثنى من البنك والنقدي ويبقى «محجوزًا» حتى تحديث الحساب.', 'لا يغيّر ملف الموظف — تغيير الحساب يمرّ بضبط HR-16.'] }); if (!r.ok) return; reason = r.reason; }
    try { await SA.api(() => { const x = getRun(run.id); x.resolutions = x.resolutions || {}; x.overrides = x.overrides || { method: {} }; x.resolutions[ck.id] = { status: ck.type === 'unapproved_ot' || ck.type === 'var_emp' ? 'ack' : 'fixed', value, by: meId(), at: new Date().toISOString(), reason };
      if (ck.type === 'miss_bank') x.overrides.method[ck.empId] = value; refreshRun(x); tl(x, 'معالجة فحص: ' + ck.title + ' (' + empName(ck.empId) + ')'); saveRun(x); aud('HR.PAYROLL.CALCULATED', { type: 'payroll_run', id: run.id, label: run.id }, { after: { fix: ck.type, employee: empName(ck.empId), value }, reason }); }); SA.toast('طُبّقت المعالجة وأُعيد الحساب', 'success'); } catch (e) { SA.fail(e); }
  }
  async function actWaive(run, ck) {
    if (!SA.can('hr.payroll.approve')) { SA.toast(NOPERM('hr.payroll.approve') + ' — تجاوز الفحص المانع من صلاحية المراجع', 'warn'); return; } const b = sodBlock(run, 'تجاوز فحص مانع'); if (b) { SA.toast(b, 'warn'); return; }
    const r = await SA.confirm({ title: 'تجاوز فحص مانع', danger: true, confirmLabel: 'تجاوز بسبب مسجّل', reasonRequired: true, reasonLabel: 'سبب التجاوز', impact: ['«' + ck.title + '» — ' + (ck.empId ? empName(ck.empId) : 'عام'), 'يُسجَّل التجاوز ويُنبَّه مدير الموارد البشرية (HR.PAYROLL.CHECK_WAIVED).'] }); if (!r.ok) return; if (!(await SA.stepUp('policy.change'))) return;
    try { await SA.api(() => { const x = getRun(run.id); x.resolutions[ck.id] = { status: 'waived', by: meId(), at: new Date().toISOString(), reason: r.reason }; x.checks = buildChecks(x); tl(x, 'تجاوز فحص مانع: ' + ck.title); saveRun(x); aud('HR.PAYROLL.CHECK_WAIVED', { type: 'payroll_run', id: run.id, label: run.id }, { reason: r.reason, after: { check: ck.type, employee: ck.empId ? empName(ck.empId) : null } }); SA.notify({ title: 'تجاوز فحص مانع في ' + run.id, body: ck.title + ' — ' + r.reason, level: 'action', to: ['R-11'], link: '#/hr/payroll/' + run.id }); }); SA.toast('سُجّل التجاوز', 'success'); } catch (e) { SA.fail(e); }
  }
  async function actSubmit(run) {
    if (!SA.can('hr.payroll.prepare')) { SA.toast(NOPERM('hr.payroll.prepare'), 'warn'); return; } if (blockers(run).length) { SA.toast('عالج الفحوصات المانعة أولًا.', 'warn'); return; } if (!run.lines) { SA.toast('احسب الدورة أولًا.', 'warn'); return; }
    const cc = chainFor(run); const r = await SA.confirm({ title: 'إرسال ' + run.id + ' للمراجعة والاعتماد', confirmLabel: 'إرسال للمراجعة', impact: ['سلسلة الاعتماد: ' + cc.chain.map((c) => c.label).join(' ← '), cc.gate.required ? 'بوابة المدير العام مطلوبة: ' + cc.gate.reason : 'بوابة المدير العام غير مطلوبة: ' + cc.gate.reason, 'بعد الإرسال لا تعديل على المدخلات — الرفض يعيد الكشف «محسوب».', 'أنت لا تعتمد ولا تقفل ولا تصرف هذا الكشف (فصل المهام).'] }); if (!r.ok) return;
    try { await SA.api(() => doSubmit(run.id)); SA.toast('أُرسل للمراجعة — ظهر في صندوق الاعتمادات المشترك', 'success'); } catch (e) { SA.fail(e); }
  }
  async function actDecide(run, decision) {
    const ap = approvalOf(run); if (!ap) return; const w = [];
    if (decision === 'approved') { const g = run.gmGate; if (ap.currentStep === 1) w.push('راجع الفحوصات والتباين قبل الاعتماد — الأجور سرية.'); if (g && g.required && ap.currentStep === ap.chain.length) w.push('أنت تعتمد بوابة التباين: ' + g.reason); }
    await decideStep(ap, decision, { extra: () => (run.preparedBy === meId() ? 'فصل المهام: من جهّز الكشف لا يعتمده.' : ''), warnings: w });
  }
  async function actLock(run) {
    if (!SA.can('hr.payroll.release')) { SA.toast(NOPERM('hr.payroll.release'), 'warn'); return; } const b = sodBlock(run, 'قفل الفترة'); if (b) { SA.toast(b, 'warn'); return; } if (run.status !== 'gm_approved') { SA.toast('القفل بعد الاعتماد الكامل فقط.', 'warn'); return; }
    const r = await SA.confirm({ title: 'قفل فترة ' + PER.label(run.period), danger: true, confirmLabel: 'قفل الفترة', impact: ['لا تعديل مباشر بعد القفل — أي تصحيح بدورة فروق أو مستند عكس.', 'يُثبَّت لقطة القواعد والمدخلات وبصمة الكشف.'], warnings: run.rules.pending ? ['القواعد المُطبّقة Pending [Law] — القفل يعني قبولها لهذه الدورة (بند 44).'] : [] }); if (!r.ok) return; if (!(await SA.stepUp('voucher.execute'))) return;
    try { await SA.api(() => doLock(run.id)); SA.toast('قُفلت الفترة', 'success'); } catch (e) { SA.fail(e); }
  }
  async function actRelease(run) {
    if (!SA.can('hr.payroll.release')) { SA.toast(NOPERM('hr.payroll.release'), 'warn'); return; } const b = sodBlock(run, 'إطلاق الصرف'); if (b) { SA.toast(b, 'warn'); return; } if (run.status !== 'locked') { SA.toast('الإطلاق بعد قفل الفترة.', 'warn'); return; }
    const t = totalsOf(run.lines); const ok = t.bankP + t.cashP + t.holdP === t.net;
    const r = await SA.confirm({ title: 'إطلاق صرف ' + run.id, danger: true, confirmLabel: 'إطلاق الصرف', impact: ['يُنشأ ملف تحويل بنكي (' + t.bankN + ' سطر · ' + fp(t.bankP) + ') وكشف صرف نقدي (' + t.cashN + ' سطر · ' + fp(t.cashP) + ')' + (t.holdN ? ' و' + t.holdN + ' محجوز (' + fp(t.holdP) + ')' : '') + '.', 'ضابط BR-PAY-01: بنك + نقدي + محجوز = الصافي ' + (ok ? '✓ متطابق' : '✗ غير متطابق'), 'تُخصم أقساط السلف وتُقيَّد في سجل الرصيد، وتُطبَّق الخصومات المعتمدة.', 'سند الصرف PV- للمالية (إنشاء/اعتماد/تنفيذ منفصلة) — حالته Open ولا تكامل بنكي.'], warnings: ok ? [] : ['الأرقام غير متطابقة — لا إطلاق.'] }); if (!r.ok || !ok) return; if (!(await SA.stepUp('voucher.execute'))) return;
    try { await SA.api(() => doRelease(run.id)); SA.toast('أُطلق الصرف — افتح «الصرف ومفردات المرتب»', 'success'); } catch (e) { SA.fail(e); }
  }
  async function actPublish(run) {
    if (!SA.can('hr.payroll.release')) { SA.toast(NOPERM('hr.payroll.release'), 'warn'); return; } if (run.status !== 'released') { SA.toast('النشر بعد إطلاق الصرف (أو بسبب مسجّل).', 'warn'); return; }
    const bad = run.lines.filter((l) => payslipChecks(run, l).some((c) => !c[2])); if (bad.length) { SA.toast(bad.length + ' مفردة فيها فرق في ضوابط P1–P8 — لا نشر.', 'error'); return; }
    const confirmed = col('payBatches').filter((b) => b.runId === run.id).every((b) => batchStatus(b) === 'settled'); let reason = '';
    const r = await SA.confirm({ title: 'نشر مفردات المرتب (' + run.lines.length + ')', confirmLabel: 'نشر المفردات', reasonRequired: !confirmed, reasonLabel: 'سبب النشر قبل تأكيد الصرف', impact: ['تظهر المفردة لكل موظف في «خدماتي» بشارة «سري» — لا تُرسل الأرقام في إشعار.', 'ضوابط P1–P8 اجتازت لكل المفردات.'], warnings: confirmed ? [] : ['الصرف لم يُؤكَّد بعد (BR-PAY-14) — النشر يحتاج سببًا.'] }); if (!r.ok) return; reason = r.reason;
    try { await SA.api(() => doPublish(run.id, confirmed ? '' : reason)); SA.toast('نُشرت المفردات', 'success'); } catch (e) { SA.fail(e); }
  }
  async function actArrears(run) {
    if (!SA.can('hr.payroll.prepare')) { SA.toast(NOPERM('hr.payroll.prepare'), 'warn'); return; }
    const r = await SA.confirm({ title: 'توليد دورة فروق من ' + run.id, confirmLabel: 'توليد', impact: ['تُحسب الفروق بين التعويض الساري حاليًا لتلك الفترة والتعويض الذي قُفلت به الدورة.', 'الدورة المقفولة لا تتغيّر — الفروق مستند جديد يمرّ بسلسلة الاعتماد كاملة.'] }); if (!r.ok) return;
    try { let nr = null; await SA.api(() => { nr = doArrears(run.id); }); if (!nr) { SA.toast('لا فروق: التعويضات الحالية مطابقة لما قُفلت به الدورة (أو الفروق سالبة).', 'info', { ms: 6000 }); return; } SA.toast('وُلّدت ' + nr.id, 'success'); SA.nav('hr/payroll/' + nr.id); } catch (e) { SA.fail(e); }
  }
  async function actReversal(run) {
    if (!SA.can('hr.payroll.approve')) { SA.toast(NOPERM('hr.payroll.approve') + ' — العكس: مدير HR + المالية', 'warn'); return; }
    const r = await SA.confirm({ title: 'مستند عكس للدورة ' + run.id, danger: true, confirmLabel: 'إنشاء مستند العكس', reasonRequired: true, reasonLabel: 'سبب العكس', impact: ['ينشأ مستند جديد ' + run.id + '-REV بقيم معكوسة — الأصل لا يُعدَّل.', 'يمرّ بسلسلة الاعتماد كاملة ثم القفل.'] }); if (!r.ok) return; if (!(await SA.stepUp('policy.change'))) return;
    try { let nr; await SA.api(() => { nr = doReversal(run.id, r.reason); }); SA.toast('أُنشئ ' + nr.id, 'success'); SA.nav('hr/payroll/' + nr.id); } catch (e) { SA.fail(e); }
  }
  function openNewRun() {
    if (!SA.can('hr.payroll.prepare')) { SA.toast(NOPERM('hr.payroll.prepare'), 'warn'); return; }
    const last = col('payrollRuns').filter((r) => !r.type || r.type === 'regular').map((r) => r.period).sort().pop(); const def = last ? PER.add(last, 1) : PER.cur(); const per = field({ name: 'period', label: 'فترة الدورة (شهر)', type: 'month', value: def, required: true, hint: 'شهر ميلادي؛ قاعدة الشهر وأيام الدفع من جدول القواعد.' });
    const box = h('div'); const acc = field({ name: 'accept', label: 'سبب قبول القواعد Pending', type: 'textarea', rows: 2, hint: 'مطلوب لأن إصدارات القواعد غير معتمدة قانونيًا (BR-PRL-17).' }); let rules = null;
    const upd = () => { SA.clear(box); const p = per.get(); if (!p) return; rules = API.rules(PER.parse(p).end); const miss = RULE_TABLES.filter((t) => !rules[t[0]]); const exists = col('payrollRuns').some((r) => r.period === p && (!r.type || r.type === 'regular') && r.status !== 'cancelled');
      if (exists) box.append(SA.alert('danger', 'توجد دورة عادية لهذه الفترة بالفعل — لا تكرار (BR-PRL-15).')); if (miss.length) box.append(SA.alert('danger', 'جدول قواعد غير مُعدّ لتاريخ ' + PER.parse(p).end + ': ' + miss.map((m) => m[1]).join('، ') + ' — لا قيمة صفرية بديلة (BR-PRL-01).'));
      box.append(h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الجدول', 'الإصدار الساري', 'من', 'الحالة'].map((x) => h('th', {}, x)))), h('tbody', {}, RULE_TABLES.map((t) => { const v = rules[t[0]]; return h('tr', {}, h('td', {}, t[1]), h('td', {}, v ? code(v.id) : SA.openValue()), h('td', {}, v ? h('span.num', {}, v.from) : '—'), h('td', {}, v ? (v.status === 'approved' ? SA.chip('معتمد', 'success') : SA.chip('Pending [Law]', 'warning')) : SA.chip('غير مُعدّ', 'danger'))); })))), rules.source === 'fallback' ? h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'مصدر القواعد: قيم الريسيرش الافتراضية (DEMO) — تُعدَّل من ', openLink('الامتثال', SA.href('hr/compliance')))) : null);
      if (rules.pending) box.append(acc.el); box._state = { exists, miss }; };
    per.input.addEventListener('change', upd); upd();
    formModal({ title: 'دورة مرتبات جديدة', subtitle: 'الخطوة 1 من 5 — الفترة والقواعد', icon: 'receipt', size: 'lg', fields: [per], after: box, confirmLabel: 'فتح الدورة',
      validate: () => (box._state.exists ? 'توجد دورة لهذه الفترة' : box._state.miss.length ? 'جدول قواعد غير مُعدّ' : rules.pending && (acc.get() || '').trim().length < 3 ? 'اكتب سبب قبول القواعد Pending' : ''),
      async onSubmit(v) { let run; await SA.api(() => { run = doCreate(v.period, { pendingAccepted: rules.pending ? { by: meId(), at: new Date().toISOString(), reason: acc.get().trim() } : null }); }); SA.toast('فُتحت ' + run.id, 'success'); SA.nav('hr/payroll/' + run.id); return true; } });
  }

  /* ───── list ───── */
  function payrollList(root, ctx) {
    return loadScreen(root, ctx, 'دورة المرتبات', () => {
      const kpis = h('div'), host = h('div'); const view = {};
      root.append(SA.pageHead({ title: 'دورة المرتبات', desc: 'معالج الدورة: الفترة ← المدخلات ← الحساب ← الفحوصات ← مراجعة HR ← اعتماد المالية ← بوابة المدير العام ← قفل ← صرف ← نشر المفردات. تجهيز/اعتماد/إطلاق صلاحيات منفصلة.', tags: [lawTag(), SA.tag('pending', 'بند 44')], actions: [SA.btn({ label: 'دورة جديدة', icon: 'plus', kind: 'primary', perm: 'hr.payroll.prepare', onClick: openNewRun })] }), kpis, host);
      const s1 = SA.live(kpis, () => {
        const runs = col('payrollRuns'); const reg = runs.filter((r) => !r.type || r.type === 'regular').sort((a, b) => (a.period < b.period ? 1 : -1)); const cur = reg[0]; const t = cur && cur.lines ? totalsOf(cur.lines) : null; const mine = needMeCount();
        return kpiRow([['آخر دورة', cur ? cur.id : '—', { sub: cur ? (RUN_ST[cur.status] || [cur.status])[0] : '', href: cur ? SA.href('hr/payroll/' + cur.id) : null }], ['صافي آخر دورة', t ? h('span.sap-pay-amt', fp(t.net)) : '—', { sub: t ? t.count + ' موظف · ج.م' : '' }], ['بانتظار إجراءك', mine || 0, { accent: !!mine, sub: mine ? 'افتح الدورة المميّزة' : 'لا شيء مطلوب منك' }], ['دورات مقفولة/مُصرَفة', runs.filter((r) => r.status === 'locked' || r.status === 'released').length, { sub: 'من ' + runs.length }]]);
      }, ['payrollRuns', 'approvals']);
      const s2 = SA.live(host, () => {
        const t = SA.table({ caption: 'دورات المرتبات', rows: () => col('payrollRuns').slice().sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : a.id < b.id ? 1 : -1)), pageSize: 10, initial: view.s, onChange: (s) => { view.s = s; },
          search: { placeholder: 'ابحث برقم الدورة أو الفترة', keys: ['id', 'period'] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(RUN_ST).map((k) => [k, RUN_ST[k][0]]) }, { key: 'type', label: 'النوع', options: Object.keys(TYPE_AR).map((k) => [k, TYPE_AR[k]]), test: (r, v) => (r.type || 'regular') === v }],
          columns: [{ key: 'id', label: 'الدورة', sort: true, render: (r) => h('a.sap-pay-link', { href: SA.href('hr/payroll/' + r.id) }, h('b', {}, r.id)) }, { key: 'period', label: 'الفترة', sort: true, render: (r) => PER.label(r.period) }, { key: 'type', label: 'النوع', render: (r) => h('span.t-dense', {}, TYPE_AR[r.type || 'regular']) },
            { key: 'status', label: 'الحالة', render: (r) => h('span', {}, runChip(r), r.published ? SA.chip('منشور', 'info') : null, r.reversalId ? SA.chip('عُكس ' + r.reversalId, 'danger') : null) }, { key: 'employees', label: 'الموظفون', sort: true, render: (r) => h('span.num', {}, r.employees || '—') },
            { key: 'gross', label: 'الاستحقاق', render: (r) => (r.lines ? AT(totalsOf(r.lines).gross) : '—') }, { key: 'ded', label: 'الاستقطاع', render: (r) => (r.lines ? AT(totalsOf(r.lines).totalDed) : '—') }, { key: 'net', label: 'الصافي', sort: true, render: (r) => (r.lines ? h('b', {}, AT(totalsOf(r.lines).net)) : '—') },
            { key: 'prep', label: 'جهّزه', render: (r) => SA.userName(r.preparedBy) }, { key: 'next', label: 'التالي', render: (r) => (mineNow(r) ? h('b.sap-pay-now', {}, SA.icon('arrowleft', 'icon-sm'), nextAction(r)) : h('span.t-muted', {}, nextAction(r))) }],
          rowActions: (r) => [{ label: 'فتح الدورة', icon: 'arrowleft', onClick: () => SA.nav('hr/payroll/' + r.id) }, { label: 'توليد دورة فروق', icon: 'swap', hidden: (r.type || 'regular') !== 'regular' || (r.status !== 'locked' && r.status !== 'released'), onClick: () => actArrears(r), disabled: SA.can('hr.payroll.prepare') ? false : NOPERM('hr.payroll.prepare') }, { label: 'مستند عكس', icon: 'history', danger: true, hidden: (r.type || 'regular') !== 'regular' || r.status !== 'released' || !!r.reversalId, onClick: () => actReversal(r), disabled: SA.can('hr.payroll.approve') ? false : NOPERM('hr.payroll.approve') }],
          onRowClick: (r) => SA.nav('hr/payroll/' + r.id), empty: { icon: 'receipt', title: 'لا توجد دورات بعد', text: 'افتح أول دورة لتبدأ معالج المرتبات.', action: { label: 'دورة جديدة', onClick: openNewRun, perm: 'hr.payroll.prepare' } } });
        return h('div', {}, canWages() ? null : SA.alert('info', 'تعرض الشاشة الإجماليات فقط — أرقام الأفراد تحتاج ', code('hr.salary.view'), '.'), h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الدورة المقفولة لا تُعدَّل: التصحيح بدورة فروق، والعكس بمستند جديد (BR-PRL-12). ', specLink('scr-prl-01'))));
      }, ['payrollRuns', 'approvals']);
      return () => { s1.stop && s1.stop(); s2(); };
    });
  }

  /* ───── detail: wizard + register + activity ───── */
  function stepBar(run, view, refresh) {
    const cur = stepOf(run); const ol = h('ol.sap-stepper.sap-pay-steps', { 'aria-label': 'خطوات الدورة' });
    STEPS.forEach((s, i) => { const done = i < cur || (i === 4 && run.status === 'released' && run.published); ol.append(h('li', { class: done ? 'is-done' : i === cur ? 'is-now' : '', 'aria-current': i === view.step ? 'step' : null }, h('button.sap-pay-stepbtn' + (i === view.step ? '.is-view' : ''), { type: 'button', onclick: () => { view.step = i; refresh(); } }, h('span.sap-step-n', {}, done ? SA.icon('check', 'icon-sm') : String(i + 1)), h('span', {}, s)))); });
    return ol;
  }
  function totalsStrip(run) {
    if (!run.lines) return null; const t = totalsOf(run.lines);
    return h('div.sap-pay-totals', {}, [['الموظفون', t.count, true], ['إجمالي الاستحقاق', t.gross], ['تأمينات العامل', t.insEmp], ['ضريبة كسب العمل', t.tax], ['إجمالي الاستقطاع', t.totalDed], ['الصافي', t.net, false, true], ['تكلفة صاحب العمل', t.employerCost]].map((x) => h('div.sap-pay-tot' + (x[3] ? '.is-net' : ''), {}, h('span', {}, x[0]), h('b', {}, x[2] ? h('span.num', {}, x[1]) : AT(x[1])))));
  }
  function headActions(run) {
    const a = []; const me = meId(); const ap = approvalOf(run);
    const menu = h('button.btn.btn-ghost.btn-icon', { type: 'button', 'aria-label': 'المزيد', onclick: (e) => SA.menu(e.currentTarget, [{ label: 'توليد دورة فروق', icon: 'swap', hidden: (run.type || 'regular') !== 'regular' || (run.status !== 'locked' && run.status !== 'released'), onClick: () => actArrears(run), disabled: SA.can('hr.payroll.prepare') ? false : NOPERM('hr.payroll.prepare') }, { label: 'مستند عكس', icon: 'history', danger: true, hidden: (run.type || 'regular') !== 'regular' || run.status !== 'released' || !!run.reversalId, onClick: () => actReversal(run), disabled: SA.can('hr.payroll.approve') ? false : NOPERM('hr.payroll.approve') }, { label: 'سجل التدقيق لهذه الدورة', icon: 'history', onClick: () => SA.nav('audit', { query: { q: run.id } }) }]) }, SA.icon('dots'));
    const typ = run.type || 'regular'; const auto = typ === 'regular';
    switch (run.status) {
      case 'draft': a.push(SA.btn({ label: 'سحب وتجميد المدخلات', icon: 'download2', kind: 'primary', perm: 'hr.payroll.prepare', onClick: () => actPull(run) })); break;
      case 'inputs_frozen': a.push(SA.btn({ label: 'حساب الدورة', icon: 'gauge', kind: 'primary', perm: 'hr.payroll.prepare', onClick: () => actCalc(run) })); break;
      case 'calculated': a.push(SA.btn({ label: 'إرسال للمراجعة', icon: 'checkcircle', kind: 'primary', perm: 'hr.payroll.prepare', reason: blockers(run).length ? blockers(run).length + ' فحص مانع مفتوح' : '', onClick: () => actSubmit(run) })); break;
      case 'prepared': case 'hr_review': case 'finance_approved': { const c = ap ? canDecide(ap, () => (run.preparedBy === me ? 'فصل المهام: من جهّز الكشف لا يعتمده.' : '')) : { ok: false, why: 'لا طلب اعتماد' }; const step = ap && ap.chain[ap.currentStep - 1]; a.push(SA.btn({ label: 'اعتماد: ' + (step ? step.label : ''), icon: 'checkcircle', kind: 'primary', reason: c.ok ? '' : c.why || '', onClick: () => actDecide(run, 'approved') })); break; }
      case 'gm_approved': a.push(SA.btn({ label: 'قفل الفترة', icon: 'lock', kind: 'primary', perm: 'hr.payroll.release', reason: sodBlock(run, 'قفل الفترة'), onClick: () => actLock(run) })); break;
      case 'locked': a.push(SA.btn({ label: 'إطلاق الصرف', icon: 'coins', kind: 'accent', perm: 'hr.payroll.release', reason: sodBlock(run, 'إطلاق الصرف'), onClick: () => actRelease(run) })); break;
      case 'released': if (!run.published) a.push(SA.btn({ label: 'نشر مفردات المرتب', icon: 'doc', kind: 'primary', perm: 'hr.payroll.release', onClick: () => actPublish(run) })); else a.push(SA.btn({ label: 'الصرف ومفردات المرتب', icon: 'arrowleft', kind: 'primary', onClick: () => SA.nav('hr/payments', { query: { run: run.id } }) })); break;
      default: break;
    }
    if (auto || run.status === 'released' || run.status === 'locked') a.push(menu); return a;
  }
  /* step panels */
  function panelInputs(run, view, refresh) {
    const inp = run.inputs; const per = PER.parse(run.period); const stale = inp && isFrozenStale(run);
    const rulesTbl = h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الجدول', 'الإصدار المُثبَّت', 'ساري من', 'الحالة', 'المصدر'].map((x) => h('th', {}, x)))), h('tbody', {}, RULE_TABLES.map((t) => { const v = run.rules[t[0]]; return h('tr', {}, h('td', {}, t[1]), h('td', {}, v ? code(v.id) : SA.openValue()), h('td', {}, v ? h('span.num', {}, v.from) : '—'), h('td', {}, v ? (v.status === 'approved' ? SA.chip('معتمد', 'success') : SA.chip('Pending [Law]', 'warning')) : SA.chip('غير مُعدّ', 'danger')), h('td', {}, h('span.t-caption', {}, v ? (v.src === 'settings' ? 'جدول الامتثال (settings.hrLegal)' : 'قيم الريسيرش الافتراضية (DEMO)') : '—'))); }))));
    const C = inp ? inp.counts : null; const row = (src, n, note, link) => h('tr', {}, h('td', {}, h('b', {}, src)), h('td', {}, h('span.num', {}, n)), h('td', {}, note), h('td', {}, link ? openLink('افتح', SA.href(link)) : '—'));
    const srcTbl = C ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['المصدر', 'العدد', 'ملاحظة', ''].map((x) => h('th', {}, x)))), h('tbody', {},
      row('الموظفون المشمولون', C.employees, (inp.excluded || []).length ? (inp.excluded.length + ' مستبعد (منتهي/موقوف)') : 'نشط/تجربة/إجازة', 'hr/employees'), row('الحضور — غياب بالفترة', C.absences, C.openAbsences ? C.openAbsences + ' غياب لم يُراجَع (بدون أجر افتراضيًا)' : 'كلها مراجَعة', 'hr/attendance'), row('الإجازات المعتمدة المتقاطعة', C.leaves, 'أنواع بلا أجر تُخصم من أيام الدفع', 'hr/leave'),
      row('الأوفرتايم المعتمد (ساعة)', C.otApproved, C.otPending ? C.otPending + ' ساعة غير معتمدة — مستبعدة (المصدر: ' + inp.otSource + ')' : 'المصدر: ' + inp.otSource, 'hr/overtime'), row('أقساط السلف المستحقة', C.loanRows, 'تُخصم داخل الدورة فقط وبسقف قانوني', 'hr/loans'), row('خصومات DED معتمدة', C.deductions, 'جزاء/تلفيات/دائن بسقوفها', 'hr/loans?tab=deductions'), row('تغييرات تعويضات سارية في الفترة', C.changes, 'تغييرات مرتب معتمدة تبدأ داخل الفترة', 'hr/salary?tab=assign')))) : SA.empty({ icon: 'download2', title: 'لم تُسحب المدخلات بعد', text: 'اسحب الحضور والإجازات والأوفرتايم والسلف والتغييرات المعتمدة وجمّدها قبل الحساب.', action: run.status === 'draft' && SA.can('hr.payroll.prepare') ? { label: 'سحب وتجميد المدخلات', icon: 'download2', onClick: () => actPull(run) } : null });
    return h('div.sap-pay-stack', {}, SA.card({ title: 'الفترة والقواعد المُثبَّتة (Snapshot)', tags: lawTag(), actions: [openLink('جداول الامتثال', SA.href('hr/compliance'))] }, SA.kv([['الفترة', PER.label(run.period) + ' (' + per.start + ' → ' + per.end + ')'], ['قاعدة الشهر', run.rules.period.month_days + ' يوم · ' + run.rules.period.day_hours + ' ساعات/يوم'], ['النوع', TYPE_AR[run.type || 'regular']], ['قبول Pending', run.pendingAccepted ? h('span', {}, SA.userName(run.pendingAccepted.by) + ' — «' + run.pendingAccepted.reason + '»') : (run.rules.pending ? h('span', {}, 'لم يُقبل') : 'لا حاجة — كل الإصدارات معتمدة')]]), rulesTbl),
      SA.card({ title: 'مصادر المدخلات', actions: inp ? [h('span.t-caption', {}, 'سُحبت ' + SA.fmt.dt(inp.pulledAt) + ' · ' + SA.userName(inp.pulledBy))] : null }, stale ? SA.alert('warning', h('b', {}, 'تغيّر مصدر بعد التجميد. '), 'أعد السحب والحساب (HR.PAYROLL.INPUTS_STALE).') : null, srcTbl, inp && !isSubmitted(run) && (run.type || 'regular') === 'regular' ? h('div.sap-pay-actions', {}, SA.btn({ label: 'إعادة السحب', icon: 'refresh', kind: 'ghost', perm: 'hr.payroll.prepare', onClick: () => actPull(run) })) : null), h('p.sap-hint', {}, specLink('scr-prl-02')));
  }
  const isFrozenStale = (run) => !!run.inputs && !!run.inputs.sig && ORD[run.status] < ORD.locked && run.inputs.sig !== sigOf(run.period);
  function panelCalc(run, view) {
    if (!run.lines) return SA.card({}, SA.empty({ icon: 'gauge', title: 'لم تُحسب الدورة بعد', text: 'بعد تجميد المدخلات يُطبّق المحرك المكونات والتأمينات والضريبة والسقوف سطرًا سطرًا (نصف لأعلى لمنزلتين).', action: run.status === 'inputs_frozen' && SA.can('hr.payroll.prepare') ? { label: 'حساب الدورة', icon: 'gauge', onClick: () => actCalc(run) } : null }));
    const meta = run.compSnap || {}; const kindSum = (l, kinds) => sum(l.comps.filter((c) => kinds.indexOf((meta[c.code] || {}).kind) >= 0), (c) => c.p);
    const t = SA.table({ caption: 'سطور الدورة', rows: () => run.lines.map((l) => Object.assign({ id: l.empId }, l)), pageSize: 10, initial: view.t, onChange: (s) => { view.t = s; }, search: { placeholder: 'ابحث بالاسم أو الرقم', keys: ['name', 'empNo'] },
      filters: [{ key: 'method', label: 'الصرف', options: [['bank', 'بنك'], ['cash', 'نقدي'], ['hold', 'محجوز']] }, { key: 'dept', label: 'القسم', options: uniq(run.lines.map((l) => l.deptId)).map((d) => [d, deptName(d)]), test: (r, v) => r.deptId === v }],
      columns: [{ key: 'name', label: 'الموظف', sort: true, render: (l) => h('div.sap-usercell', {}, SA.avatar(l.name), h('div', {}, h('b', {}, l.name), h('small', {}, l.empNo + ' · ' + deptName(l.deptId)))) }, { key: 'payDays', label: 'أيام الدفع', render: (l) => h('span.num', {}, l.payDays) }, { key: 'gross', label: 'الاستحقاق', sort: true, render: (l) => A(l.gross) },
        { key: 'insEmp', label: 'تأمينات', render: (l) => A(l.insEmp) }, { key: 'tax', label: 'ضريبة', render: (l) => A(l.tax) }, { key: 'oth', label: 'سلف وخصومات', render: (l) => A(l.penalty + l.loan + l.creditor) }, { key: 'net', label: 'الصافي', sort: true, render: (l) => h('b', {}, A(l.net)) },
        { key: 'method', label: 'الصرف', render: (l) => SA.chip({ bank: 'بنك', cash: 'نقدي', hold: 'محجوز' }[l.method] || l.method, l.method === 'hold' ? 'warning' : 'neutral') }, { key: 'fl', label: '', render: (l) => (l.flags.length ? SA.chip(l.flags.length + ' تنبيه', 'warning') : '') }],
      rowActions: (l) => [{ label: 'تتبّع الحساب', icon: 'list', onClick: () => SA.nav('hr/payroll/' + run.id + '/lines/' + l.empId) }], onRowClick: (l) => SA.nav('hr/payroll/' + run.id + '/lines/' + l.empId) });
    return h('div.sap-pay-stack', {}, totalsStrip(run), needWages(), h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'انقر أي سطر لتتبّع الحساب من الإجمالي إلى الصافي بالإعدادات المُستخدمة. ', specLink('scr-prl-03'))));
  }
  function panelChecks(run) {
    const cks = run.checks || []; const open = (s) => cks.filter((c) => c.sev === s && c.status === 'open').length; const can = SA.can('hr.payroll.prepare') && !isSubmitted(run);
    if (!run.lines) return SA.card({}, SA.empty({ icon: 'checkcircle', title: 'الفحوصات تعمل بعد الحساب', text: 'تُفحص الحسابات البنكية والحد الأدنى للأجر والصافي السالب والتباين والأوفرتايم غير المعتمد والغياب المفتوح.' }));
    const group = (sev, title) => { const l = cks.filter((c) => c.sev === sev); if (!l.length) return null; return h('div', {}, h('h3.sap-sub', {}, title + ' (' + l.length + ')'), h('div.sap-pay-checks', {}, l.map((c) => checkCard(run, c, can)))); };
    return h('div.sap-pay-stack', {}, h('div.sap-pay-pills', {}, SA.chip(open('block') + ' مانع مفتوح', open('block') ? 'danger' : 'success'), SA.chip(open('warn') + ' تحذير', open('warn') ? 'warning' : 'neutral'), SA.chip(cks.filter((c) => c.sev === 'info').length + ' معلومة', 'info'), isSubmitted(run) ? SA.chip('الكشف أُرسل — الفحوصات للقراءة', 'neutral') : null),
      group('block', 'فحوصات مانعة'), group('warn', 'تحذيرات'), group('info', 'معلومات'), h('p.sap-hint', {}, specLink('scr-prl-04')));
  }
  function checkCard(run, c, can) {
    const st1 = c.status; const acts = [];
    if (st1 === 'open' && can) {
      if (c.type === 'miss_bank') acts.push(SA.btn({ label: 'تحويل لنقدي', icon: 'coins', kind: 'ghost', size: 'sm', onClick: () => actFix(run, c, 'cash') }), SA.btn({ label: 'حجز المرتب', icon: 'lock', kind: 'ghost', size: 'sm', onClick: () => actFix(run, c, 'hold') }));
      if (c.type === 'open_absence') acts.push(SA.btn({ label: 'بأجر (مبرَّر)', icon: 'checkcircle', kind: 'ghost', size: 'sm', onClick: () => actFix(run, c, 'paid') }), SA.btn({ label: 'بدون أجر', icon: 'xcircle', kind: 'ghost', size: 'sm', onClick: () => actFix(run, c, 'unpaid') }));
      if (c.type === 'unapproved_ot' || c.type === 'var_emp') acts.push(SA.btn({ label: 'اطلعت', icon: 'check', kind: 'ghost', size: 'sm', onClick: () => actFix(run, c, 'ack') }));
    }
    if (st1 === 'open' && c.sev === 'block' && !isSubmitted(run)) acts.push(SA.btn({ label: 'تجاوز بسبب', icon: 'shield', kind: 'ghost', size: 'sm', perm: 'hr.payroll.approve', reason: sodBlock(run, 'تجاوز فحص مانع'), onClick: () => actWaive(run, c) }));
    if (c.empId && ['below_min'].indexOf(c.type) >= 0) acts.push(h('a.btn.btn-ghost.btn-sm', { href: SA.href('hr/salary/' + c.empId) }, 'افتح التعويضات'));
    const lab = st1 === 'open' ? (c.sev === 'block' ? ['مفتوح', 'danger'] : c.sev === 'warn' ? ['مفتوح', 'warning'] : ['معلومة', 'info']) : st1 === 'fixed' ? ['عولج', 'success'] : st1 === 'waived' ? ['مُتجاوَز بسبب', 'warning'] : ['اطُّلع', 'neutral'];
    return h('div.sap-pay-check.is-' + c.sev + (st1 !== 'open' ? '.is-done' : ''), {}, h('div.sap-pay-check-top', {}, h('b', {}, c.title), SA.chip(lab[0], lab[1])), c.empId ? h('div.t-caption', {}, h('a.sap-pay-link', { href: SA.href('hr/payroll/' + run.id + '/lines/' + c.empId) }, empName(c.empId)), ' · ' + (empById(c.empId) || {}).empNo) : null, h('p', {}, c.text), c.resolution ? h('div.t-caption', {}, (c.resolution.value ? 'القرار: ' + ({ cash: 'صرف نقدي', hold: 'حجز', paid: 'بأجر', unpaid: 'بدون أجر', ack: 'اطلاع' }[c.resolution.value] || c.resolution.value) + ' — ' : '') + SA.userName(c.resolution.by) + ' · ' + SA.fmt.dt(c.resolution.at) + (c.resolution.reason ? ' · «' + c.resolution.reason + '»' : '')) : null, acts.length ? h('div.sap-pay-actions', {}, acts) : null);
  }
  function panelApproval(run) {
    const ap = approvalOf(run); const v = varianceOf(run); const S = st.get('settings.hrPayroll') || {}; const cc = run.lines && !ap ? chainFor(run) : null; const g = ap ? run.gmGate : cc && cc.gate; const chain = ap ? ap.chain : cc ? cc.chain.map((c, i) => ({ step: i + 1, label: c.label, roleId: c.roleId, status: 'waiting' })) : [];
    const stepRows = chain.map((s) => h('li', { class: 'sap-pay-chainstep is-' + s.status + (ap && ap.currentStep === s.step && ap.status === 'pending' ? ' is-cur' : '') }, h('span.sap-pay-dot'), h('div', {}, h('b', {}, s.step + '. ' + s.label), h('div.t-caption', {}, s.status === 'approved' ? 'اعتمد ' + SA.userName(s.decidedBy) + ' · ' + SA.fmt.dt(s.decidedAt) + (s.reason ? ' · «' + s.reason + '»' : '') : s.status === 'rejected' ? 'رفض ' + SA.userName(s.decidedBy) + ' · «' + s.reason + '»' : s.status === 'pending' ? 'بانتظار القرار' : s.status === 'skipped' ? 'تخطّي' : 'لم يبدأ'))));
    const deptRows = v.prev ? Object.keys(v.byDept).sort().map((d) => v.byDept[d].prev || v.byDept[d].cur ? h('tr', {}, h('td', {}, deptName(d)), h('td', {}, AT(v.byDept[d].prev)), h('td', {}, AT(v.byDept[d].cur)), h('td', {}, v.byDept[d].pct == null ? '—' : h('span.num' + (Math.abs(v.byDept[d].pct) > 3 ? '.sap-pay-neg' : ''), {}, (v.byDept[d].pct >= 0 ? '+' : '') + v.byDept[d].pct.toFixed(1) + '%'))) : null) : [];
    return h('div.sap-pay-stack', {}, run.rejection ? SA.alert('danger', h('b', {}, 'أُعيد الكشف: '), (run.rejection.step || '') + ' — ' + (run.rejection.reason || 'بدون سبب') + ' · ' + SA.userName(run.rejection.by)) : null,
      SA.card({ title: 'التباين عن الدورة السابقة وبوابة المدير العام', tags: SA.tag('open', 'العتبة Open') }, v.prev ? h('div', {}, SA.kv([['الدورة السابقة', v.prev.id + ' (' + PER.label(v.prev.period) + ')'], ['صافي السابقة ← الحالية', h('span', {}, AT(v.prevNet), ' ← ', AT(v.curNet))], ['التباين', h('b.num', {}, (v.pct >= 0 ? '+' : '') + v.pct.toFixed(2) + '%')], ['عدد الموظفين', v.prevCount + ' ← ' + v.curCount], ['عتبة الصافي', S.varianceNetPct == null ? SA.openValue('غير مُعدّة') : S.varianceNetPct + '%'], ['عتبة الموظف', S.varianceEmpPct == null ? SA.openValue('غير مُعدّة') : S.varianceEmpPct + '%']]), h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['القسم', 'السابقة', 'الحالية', 'التباين'].map((x) => h('th', {}, x)))), h('tbody', {}, deptRows)))) : h('p.t-muted', {}, 'لا دورة سابقة مقفولة للمقارنة.'),
        g ? SA.alert(g.required ? 'warning' : 'success', h('b', {}, g.required ? 'بوابة المدير العام مطلوبة: ' : 'بوابة المدير العام غير مطلوبة: '), g.reason) : null, SA.can('hr.settings.edit') ? h('div.sap-pay-actions', {}, SA.btn({ label: 'ضبط عتبات التباين', icon: 'settings', kind: 'ghost', size: 'sm', onClick: () => openVarianceSettings() })) : null),
      SA.card({ title: 'سلسلة الاعتماد', actions: ap ? [openLink(ap.id + ' في صندوق الاعتمادات', SA.href('approvals/' + ap.id))] : null }, chain.length ? h('ol.sap-pay-chain', {}, stepRows) : h('p.t-muted', {}, 'تُبنى السلسلة عند الإرسال للمراجعة.'),
        h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'كل خطوة تمرّ عبر صندوق الاعتمادات المشترك (type = payroll_run). من يجهّز لا يعتمد ولا يقفل ولا يصرف، ولا يعتمد شخص واحد خطوتين.')),
        run.status === 'calculated' && SA.can('hr.payroll.prepare') ? h('div.sap-pay-actions', {}, SA.btn({ label: 'إرسال للمراجعة', icon: 'checkcircle', kind: 'primary', reason: blockers(run).length ? blockers(run).length + ' فحص مانع مفتوح' : '', onClick: () => actSubmit(run) })) : null,
        ap && ap.status === 'pending' ? (() => { const c = canDecide(ap, () => (run.preparedBy === meId() ? 'فصل المهام: من جهّز الكشف لا يعتمده.' : '')); return h('div.sap-pay-actions', {}, SA.btn({ label: 'اعتماد', icon: 'checkcircle', kind: 'primary', reason: c.ok ? '' : c.why, onClick: () => actDecide(run, 'approved') }), SA.btn({ label: 'رفض وإرجاع', icon: 'xcircle', kind: 'ghost', reason: c.ok ? '' : c.why, onClick: () => actDecide(run, 'rejected') })); })() : null), h('p.sap-hint', {}, specLink('scr-prl-05')));
  }
  function openVarianceSettings() {
    if (!SA.can('hr.settings.edit')) { SA.toast(NOPERM('hr.settings.edit'), 'warn'); return; } const S = st.get('settings.hrPayroll') || {};
    const a = field({ name: 'net', label: 'عتبة تباين إجمالي الصافي (%)', type: 'number', value: S.varianceNetPct, min: 0, hint: 'اتركه فارغًا = غير مُعدّ (Open).' }), b = field({ name: 'emp', label: 'عتبة تباين الموظف (%)', type: 'number', value: S.varianceEmpPct, min: 0, hint: 'اتركه فارغًا = غير مُعدّ (Open).' }), why = field({ name: 'reason', label: 'السبب', type: 'textarea', rows: 2, required: true });
    formModal({ title: 'عتبات التباين لبوابة المدير العام', subtitle: 'قيمتان Open — لا قيمة افتراضية (BR-PRL-13)', icon: 'settings', fields: [a, b, why], async onSubmit(v) { if (!(await SA.stepUp('policy.change'))) return false; await SA.api(() => { st.update('settings.hrPayroll', (x) => { x.varianceNetPct = v.net == null ? null : Number(v.net); x.varianceEmpPct = v.emp == null ? null : Number(v.emp); }); aud('HR.PAYROLL.SETTINGS_CHANGED', { type: 'settings', id: 'hrPayroll.variance', label: 'عتبات التباين' }, { reason: v.reason, before: { net: S.varianceNetPct, emp: S.varianceEmpPct }, after: { net: v.net, emp: v.emp } }); }); SA.toast('حُفظت العتبات', 'success'); return true; } });
  }
  function panelRelease(run) {
    const t = run.lines ? totalsOf(run.lines) : null; const batches = col('payBatches').filter((b) => b.runId === run.id); const sod = sodBlock(run, 'القفل أو الإطلاق');
    const card = (n, title, state, body, act) => h('div.sap-pay-relcard' + (state === 'done' ? '.is-done' : state === 'now' ? '.is-now' : ''), {}, h('div.sap-pay-relhead', {}, h('span.sap-step-n', {}, state === 'done' ? SA.icon('check', 'icon-sm') : n), h('b', {}, title)), body, act ? h('div.sap-pay-actions', {}, act) : null);
    const s = ORD[run.status];
    return h('div.sap-pay-stack', {}, sod && ORD[run.status] >= ORD.gm_approved && run.status !== 'released' ? SA.alert('info', sod) : null,
      h('div.sap-pay-rel', {}, card('1', 'قفل الفترة', s >= ORD.locked ? 'done' : s === ORD.gm_approved ? 'now' : '', h('div', {}, h('p.t-muted', {}, 'بعد القفل لا تعديل مباشر — التصحيح بدورة فروق والعكس بمستند جديد.'), run.lockedAt ? h('div.t-caption', {}, 'قفلها ' + SA.userName(run.lockedBy) + ' · ' + SA.fmt.dt(run.lockedAt) + ' · بصمة ' + run.hash) : null), s === ORD.gm_approved ? SA.btn({ label: 'قفل الفترة', icon: 'lock', kind: 'primary', perm: 'hr.payroll.release', reason: sod, onClick: () => actLock(run) }) : null),
        card('2', 'إطلاق الصرف', s >= ORD.released ? 'done' : s === ORD.locked ? 'now' : '', h('div', {}, t ? h('ul.sap-plain', {}, h('li', {}, 'بنك: ', h('b', {}, t.bankN), ' سطر · ', AT(t.bankP)), h('li', {}, 'نقدي: ', h('b', {}, t.cashN), ' سطر · ', AT(t.cashP)), h('li', {}, 'محجوز: ', h('b', {}, t.holdN), ' سطر · ', AT(t.holdP)), h('li', {}, 'الإجمالي = الصافي ', t.bankP + t.cashP + t.holdP === t.net ? chipOk('متطابق ✓', true) : chipOk('غير متطابق', false))) : null, run.releasedAt ? h('div.t-caption', {}, 'أطلقها ' + SA.userName(run.releasedBy) + ' · ' + SA.fmt.dt(run.releasedAt)) : null, batches.length ? h('div.t-caption', {}, batches.map((b) => b.id).join(' · ')) : null, run.pv ? h('div.t-caption', {}, 'سند الصرف PV-: ', run.pv.id ? code(run.pv.id) : SA.openValue('Open — المالية'), ' ', openLink('الصرف', SA.href('hr/payments?run=' + run.id))) : null), s === ORD.locked ? SA.btn({ label: 'إطلاق الصرف', icon: 'coins', kind: 'accent', perm: 'hr.payroll.release', reason: sod, onClick: () => actRelease(run) }) : null),
        card('3', 'نشر مفردات المرتب', run.published ? 'done' : s >= ORD.released ? 'now' : '', h('div', {}, h('p.t-muted', {}, 'تُنشر بشارة «سري»؛ ضوابط P1–P8 قبل النشر؛ لا تُرسل الأرقام في إشعار.'), run.published ? h('div.t-caption', {}, run.published.count + ' مفردة · ' + SA.fmt.dt(run.published.at) + (run.published.early ? ' (قبل تأكيد الصرف)' : '')) : null), s >= ORD.released && !run.published ? SA.btn({ label: 'نشر المفردات', icon: 'doc', kind: 'primary', perm: 'hr.payroll.release', onClick: () => actPublish(run) }) : null)),
      run.hash ? h('p.sap-hint', {}, SA.icon('lock', 'icon-sm'), h('span', {}, 'بصمة الكشف المقفول: ', code(run.hash))) : null, h('p.sap-hint', {}, specLink('scr-prl-06')));
  }
  /* register (by department) */
  function compCols(run, l) { const meta = run.compSnap || {}; const k = (kinds) => sum(l.comps.filter((c) => kinds.indexOf((meta[c.code] || {}).kind) >= 0 || (c.code === 'ARREARS' && kinds.indexOf('adjustment') >= 0)), (c) => c.p); return { basic: k(['basic']), allow: k(['allowance']), inc: k(['incentive']), ot: k(['overtime']), adj: k(['adjustment']) }; }
  const REG_COLS = [['basic', 'الأساسي (المستحق)'], ['allow', 'البدلات'], ['inc', 'الحوافز'], ['ot', 'الأوفرتايم'], ['gross', 'إجمالي الاستحقاق'], ['insWage', 'الأجر التأميني'], ['insEmp', 'تأمينات العامل'], ['tax', 'ضريبة كسب العمل'], ['loan', 'سلف'], ['oth', 'خصومات أخرى'], ['totalDed', 'إجمالي الاستقطاع'], ['net', 'الصافي']];
  function regRow(run, l) { const c = compCols(run, l); return { basic: c.basic + c.adj, allow: c.allow, inc: c.inc, ot: c.ot, gross: l.gross, insWage: l.insWage, insEmp: l.insEmp, tax: l.tax, loan: l.loan, oth: l.penalty + l.creditor, totalDed: l.totalDed, net: l.net }; }
  const addRows = (rows) => { const o = {}; REG_COLS.forEach((c) => { o[c[0]] = sum(rows, (r) => r[c[0]]); }); return o; };
  function controlTotals(run) {
    const L = run.lines || []; const R = REG_COLS; const rows = L.map((l) => regRow(run, l)); const tot = addRows(rows); const groups = uniq(L.map((l) => l.deptId)).map((d) => addRows(L.filter((l) => l.deptId === d).map((l) => regRow(run, l)))); const T = totalsOf(L); const batches = col('payBatches').filter((b) => b.runId === run.id && !b.retryOf);
    const c = [];
    c.push(['C1', 'مجموع كل عمود = مجموع الأقسام = الإجمالي العام', R.every((k) => sum(groups, (g) => g[k[0]]) === tot[k[0]])]);
    c.push(['C2', 'لكل صف: الاستحقاق − الاستقطاع = الصافي', L.every((l) => l.gross - l.totalDed === l.net) && tot.gross - tot.totalDed === tot.net]);
    c.push(['C3', 'صافي البنك + النقدي + المحجوز = الصافي العام', T.bankP + T.cashP + T.holdP === T.net]);
    c.push(['C4', 'إجمالي ملف التحويل = صافي صفوف «بنك» وعدد السجلات = عدد صفوف «بنك»', run.status === 'released' && run.type !== 'reversal' ? (batches.filter((b) => b.kind === 'bank').reduce((a, b) => a + b.totalP, 0) === T.bankP && batches.filter((b) => b.kind === 'bank').reduce((a, b) => a + b.count, 0) === L.filter((l) => l.method === 'bank' && l.net > 0).length) : null]);
    c.push(['C5', 'Σ تأمينات العامل = أرقام تقرير التأمينات (HR-17)', run.status === 'locked' || run.status === 'released' ? govTotals(run).insEmp === T.insEmp : null]);
    c.push(['C6', 'Σ الضريبة = إجمالي تقرير الحجز (HR-17)', run.status === 'locked' || run.status === 'released' ? govTotals(run).tax === T.tax : null]);
    c.push(['C7', 'عدد الصفوف = عدد المفردات PAY- المنشورة', run.published ? col('payslips').filter((s) => s.runId === run.id && s.rev === 0).length === L.length : null]);
    return c;
  }
  const govTotals = (run) => { const T = totalsOf(run.lines || []); return { insEmp: sum(run.lines || [], (l) => l.insEmp), insEr: T.insEr, tax: sum(run.lines || [], (l) => l.tax), insWage: T.insWage }; };
  function panelRegister(run) {
    if (!run.lines) return SA.card({}, SA.empty({ icon: 'receipt', title: 'لا كشف قبل الحساب' }));
    if (canWages() && !viewed.has('reg:' + run.id)) { viewed.add('reg:' + run.id); aud('HR.PAYROLL.REGISTER_VIEWED', { type: 'payroll_run', id: run.id, label: run.id }, { reason: 'قراءة كشف المرتبات' }); }
    const depts = uniq(run.lines.map((l) => l.deptId)).sort(); const tot = addRows(run.lines.map((l) => regRow(run, l))); const ct = controlTotals(run);
    const head = h('tr', {}, h('th', {}, 'م'), h('th', {}, 'الرقم'), h('th', {}, 'الاسم'), h('th', {}, 'أيام'), REG_COLS.map((c) => h('th', {}, c[1])), h('th', {}, 'الصرف'));
    const body = []; let n = 0;
    depts.forEach((d) => { const ls = run.lines.filter((l) => l.deptId === d); const sub = addRows(ls.map((l) => regRow(run, l)));
      body.push(h('tr.sap-pay-dept', {}, h('td', { colSpan: 4 }, h('b', {}, deptName(d)), h('span.t-muted', {}, ' · ' + ls.length + ' موظف')), REG_COLS.map((c) => h('td', {}, h('b', {}, AT(sub[c[0]]))), ), h('td')));
      if (canWages()) ls.forEach((l) => { const r = regRow(run, l); n++; body.push(h('tr.sap-pay-lrow', { onclick: () => SA.nav('hr/payroll/' + run.id + '/lines/' + l.empId) }, h('td', {}, h('span.num', {}, n)), h('td', {}, l.empNo), h('td', {}, l.name), h('td', {}, h('span.num', {}, l.payDays)), REG_COLS.map((c) => h('td', {}, h('span.sap-pay-amt', fp(r[c[0]])))), h('td', {}, { bank: 'بنك', cash: 'نقدي', hold: 'محجوز' }[l.method]))); }); });
    body.push(h('tr.sap-pay-grand', {}, h('td', { colSpan: 4 }, 'الإجمالي العام · ' + run.lines.length + ' موظف'), REG_COLS.map((c) => h('td', {}, AT(tot[c[0]]))), h('td')));
    return h('div.sap-pay-stack', {}, canWages() ? null : SA.alert('warning', h('b', {}, 'الإجماليات فقط. '), 'بدون ', code('hr.salary.view'), ' تُجمَّع الدورة حسب القسم ولا تظهر سطور الأفراد (BR-PRL-18).'),
      SA.card({ title: 'كشف المرتبات ' + run.id + ' حسب القسم', tags: SA.chip('سري · الموارد البشرية والمالية فقط', 'danger'), actions: [SA.btn({ label: 'تصدير CSV', icon: 'download2', kind: 'ghost', size: 'sm', perm: 'hr.export.sensitive', reason: canWages() ? '' : 'يحتاج hr.salary.view', onClick: () => exportRegister(run) })], flush: true }, h('div.table-wrap.sap-pay-scroll', {}, h('table.table.sap-pay-reg', {}, h('thead', {}, head), h('tbody', {}, body)))),
      SA.card({ title: 'ضوابط التطابق C1–C8' }, h('ul.sap-pay-ctl', {}, ct.map((c) => h('li.' + (c[2] === null ? 'is-na' : c[2] ? 'is-ok' : 'is-bad'), {}, SA.icon(c[2] === null ? 'minus' : c[2] ? 'checkcircle' : 'xcircle', 'icon-sm'), h('b', {}, c[0]), h('span', {}, c[1]), SA.chip(c[2] === null ? 'بعد القفل/الإطلاق' : c[2] ? 'متطابق' : 'فرق', c[2] === null ? 'neutral' : c[2] ? 'success' : 'danger'))), h('li.is-na', {}, SA.icon('minus', 'icon-sm'), h('b', {}, 'C8'), h('span', {}, 'الصافي العام بالحروف مطابق للأرقام'), SA.chip('غير منفَّذ في النموذج', 'neutral')))),
      h('p.sap-hint', {}, specLink('scr-prl-08')));
  }
  async function exportRegister(run) {
    if (!SA.can('hr.export.sensitive')) { SA.toast(NOPERM('hr.export.sensitive'), 'warn'); return; } if (!canWages()) { SA.toast('يحتاج hr.salary.view', 'warn'); return; }
    const r = await SA.confirm({ title: 'تصدير كشف المرتبات ' + run.id, confirmLabel: 'تصدير', danger: true, impact: ['ملف CSV بأجور الأفراد (T3) — خارج النظام.', 'يُسجَّل التصدير ويُنبَّه مدير الموارد البشرية والمالك (N-50).'], reasonRequired: true, reasonLabel: 'سبب التصدير' }); if (!r.ok) return; if (!(await SA.stepUp('audit.export', { force: true, title: 'تصدير بيانات حساسة', text: 'أدخل كلمة مرورك أو كود التحقق لتصدير أجور الأفراد.' }))) return;
    try { await SA.api(() => { const rows = [['م', 'الرقم الوظيفي', 'الاسم', 'القسم', 'أيام الدفع'].concat(REG_COLS.map((c) => c[1])).concat(['طريقة الصرف'])]; run.lines.forEach((l, i) => { const x = regRow(run, l); rows.push([i + 1, l.empNo, l.name, deptName(l.deptId), l.payDays].concat(REG_COLS.map((c) => (x[c[0]] / 100).toFixed(2))).concat([l.method])); }); const t = addRows(run.lines.map((l) => regRow(run, l))); rows.push(['', '', 'الإجمالي العام', '', ''].concat(REG_COLS.map((c) => (t[c[0]] / 100).toFixed(2))).concat([''])); SA.download(run.id + '-register.csv', SA.csv(rows), 'text/csv');
      aud('HR.PAYROLL.REGISTER_EXPORTED', { type: 'payroll_run', id: run.id, label: run.id }, { reason: r.reason, after: { rows: run.lines.length } }); aud('HR.EXPORT.SENSITIVE', { type: 'payroll_run', id: run.id, label: 'تصدير كشف ' + run.id }, { reason: r.reason }); SA.notify({ title: 'تصدير كشف مرتبات ' + run.id, body: SA.userName(meId()) + ' — ' + r.reason, level: 'urgent', to: ['R-11', 'R-01'], link: '#/audit' }); }); SA.toast('صُدّر الكشف وسُجّل الحدث', 'success'); } catch (e) { SA.fail(e); }
  }
  function panelActivity(run) {
    const tlr = run.timeline || []; const au = col('audit').filter((a) => a.target && a.target.id === run.id).slice(0, 12);
    return h('div.sap-pay-stack', {}, SA.card({ title: 'سجل الدورة' }, tlr.length ? h('ol.sap-pay-timeline', {}, tlr.map((x) => h('li', {}, h('b', {}, x.what), h('span.t-muted', {}, ' · ' + SA.fmt.dt(x.ts) + ' · ' + SA.userName(x.by))))) : h('p.t-muted', {}, 'لا أحداث.')),
      SA.card({ title: 'أحداث التدقيق المرتبطة', actions: [openLink('فتح سجل التدقيق', SA.href('audit?q=' + run.id))] }, au.length ? h('ul.sap-plain', {}, au.map((a) => h('li', {}, h('code', {}, a.code), ' — ' + SA.auditLabel(a.code) + ' · ' + a.actor.name + ' · ' + SA.fmt.dt(a.ts)))) : h('p.t-muted', {}, 'لا أحداث مرتبطة بعد.')));
  }
  /* employee trace drawer (SCR-PRL-07) */
  function openTrace(run, empId, onClose) {
    const l = run.lines && run.lines.find((x) => x.empId === empId);
    if (!canWages()) { const d = SA.drawer({ title: 'تتبّع حساب موظف', subtitle: 'سري (T3)', body: SA.denied({ perm: 'hr.salary.view', title: 'أجور الأفراد سرية', text: 'تتبّع الحساب يكشف الأجر والتأمينات والضريبة — يحتاج hr.salary.view. لا يُسجَّل اطلاع.', home: false }), onClose }); return d; }
    if (!l) { SA.drawer({ title: 'تتبّع حساب موظف', body: SA.empty({ icon: 'search', title: 'الموظف ليس في هذه الدورة', text: 'قد يكون مستبعدًا (منتهي/موقوف) أو لم يُحسب بعد.' }), onClose }); return; }
    logSalaryView(empId, 'تتبّع حساب ' + run.id);
    const rows = l.trace.map((t) => h('tr', {}, h('td', {}, h('span.num', {}, t.n)), h('td', {}, h('b', {}, t.label)), h('td.sap-pay-formula', {}, t.formula), h('td', {}, t.p != null ? h('b.sap-pay-amt', {}, fp(t.p)) : h('span.t-muted', {}, t.txt || '—')), h('td', {}, h('span.t-caption', {}, t.setting))));
    const sl = (l.slices || []).filter((s) => s.slice > 0 || s.rate === 0).slice(0, 8);
    const foot = l.gross - l.totalDed === l.net;
    const pr = col('payProfiles').find((p) => p.employeeId === empId);
    const body = h('div.sap-pay-stack', {}, h('div.sap-pay-chain-bar', {}, ['الاستحقاق ' + fp(l.gross), '− تأمينات ' + fp(l.insEmp), '− ضريبة ' + fp(l.tax), '− سلف/جزاء/دائن ' + fp(l.penalty + l.loan + l.creditor), '= الصافي ' + fp(l.net)].map((x, i) => h('span.' + (i === 4 ? 'is-net' : ''), {}, x))),
      SA.kv([['الموظف', l.name + ' · ' + l.empNo], ['القسم', deptName(l.deptId)], ['أيام الدفع', l.payDays + ' / ' + run.rules.period.month_days], ['طريقة الصرف', { bank: 'بنك' + (pr && pr.last4 ? ' ••••' + pr.last4 : ''), cash: 'نقدي', hold: 'محجوز' }[l.method]], ['الأجر التأميني بعد الحدين', h('span.sap-pay-amt', fp(l.insWage))], ['تكلفة صاحب العمل (داخلية)', h('span.sap-pay-amt', fp(l.employerCost))]]),
      l.flags.length ? SA.alert('warning', l.flags.map((f) => ({ penalty_clipped: 'اقتُصّ الجزاء عند السقف', damage_clipped: 'اقتُصّت التلفيات عند السقف', creditor_clipped: 'اقتُصّ خصم الدائن عند السقف', loan_deferred: 'أُجّل قسط سلفة لتجاوز السقف', deferred: 'أُجّلت خصومات لمنع صافٍ سالب', arrears: 'سطر فروق', reversal: 'سطر عكس' }[f] || f)).join(' · ')) : null,
      h('div.table-wrap', {}, h('table.table.sap-pay-trace', {}, h('thead', {}, h('tr', {}, ['#', 'الخطوة', 'المعادلة', 'القيمة (ج.م)', 'الإعداد المُستخدم'].map((x) => h('th', {}, x)))), h('tbody', {}, rows))),
      sl.length ? h('div', {}, h('h3.sap-sub', {}, 'شرائح الضريبة المطبّقة (سنويًا بعد الإعفاء)'), h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['من', 'إلى', 'النسبة', 'الجزء الخاضع', 'الضريبة'].map((x) => h('th', {}, x)))), h('tbody', {}, sl.map((s) => h('tr', {}, h('td', {}, h('span.sap-pay-amt', fp(s.from))), h('td', {}, s.to == null ? 'فما فوق' : h('span.sap-pay-amt', fp(s.to))), h('td', {}, h('span.num', {}, s.rate + '%')), h('td', {}, h('span.sap-pay-amt', fp(s.slice))), h('td', {}, h('span.sap-pay-amt', fp(s.tax))))))))) : null,
      h('div.sap-pay-footcheck' + (foot ? '.is-ok' : '.is-bad'), {}, SA.icon(foot ? 'checkcircle' : 'xcircle', 'icon-sm'), foot ? 'الاستحقاق − الاستقطاع = الصافي ✓ (' + fp(l.gross) + ' − ' + fp(l.totalDed) + ' = ' + fp(l.net) + ')' : 'فرق في الجمع'),
      h('p.sap-hint', {}, SA.icon('lock', 'icon-sm'), h('span', {}, 'اطلاعك على هذا الحساب سُجّل (HR.SALARY.VIEWED). ', specLink('scr-prl-07'))));
    const idx = run.lines.findIndex((x) => x.empId === empId);
    SA.drawer({ title: l.name, subtitle: 'تتبّع الحساب · ' + run.id, size: 'xl', body, onClose, foot: [h('button.btn.btn-ghost', { type: 'button', disabled: idx <= 0, onclick: (e) => { SA.layers.closeAll(); SA.nav('hr/payroll/' + run.id + '/lines/' + run.lines[idx - 1].empId); } }, 'السابق'), h('button.btn.btn-ghost', { type: 'button', disabled: idx >= run.lines.length - 1, onclick: () => { SA.layers.closeAll(); SA.nav('hr/payroll/' + run.id + '/lines/' + run.lines[idx + 1].empId); } }, 'التالي')] });
  }
  /* detail screen */
  function payrollDetail(root, ctx) {
    const id = ctx.path[0]; const view = { tab: ctx.params.tab || 'wizard', step: null }; let draw = null;
    return loadScreen(root, ctx, id, () => {
      const exists = getRun(id); if (!exists) { root.append(SA.empty({ icon: 'receipt', title: 'الدورة ' + id + ' غير موجودة', text: 'ربما حُذفت من بيانات التجربة أو أن الرابط غير صحيح.', action: { label: 'كل الدورات', icon: 'arrowleft', onClick: () => SA.nav('hr/payroll') } })); return null; }
      ctx.setCrumbs([{ label: 'المرتبات' }, { label: 'دورة المرتبات', href: SA.href('hr/payroll') }, { label: id }]);
      const host = h('div'); root.append(host); let traceOpen = false;
      const L = live2(host, () => {
        const run = getRun(id); if (!run) return SA.empty({ icon: 'receipt', title: 'الدورة غير موجودة' }); if (view.lastStatus !== run.status) { view.step = stepOf(run); view.lastStatus = run.status; }
        const ap = approvalOf(run); const typ = run.type || 'regular';
        const banners = [];
        if (isFrozenStale(run)) banners.push(SA.alert('warning', h('b', {}, 'تغيّر مصدر بعد تجميد المدخلات. '), 'أعد السحب والحساب لتشمل التغييرات.'));
        if (run.rules.pending && ORD[run.status] < ORD.locked) banners.push(SA.alert('warning', h('b', {}, 'قواعد Pending [Law]: '), 'التأمينات والضريبة والأوفرتايم والسقوف تُحسب بقيم غير معتمدة قانونيًا — DEMO حتى اعتماد المحاسب القانوني (بند 44).'));
        if (typ !== 'regular') banners.push(SA.alert('info', h('b', {}, TYPE_AR[typ] + ' من ' + run.parentId + ': '), 'مستند جديد مرتبط بالأصل — الأصل المقفول لا يتغيّر.'));
        if (mineNow(run)) banners.push(SA.alert('success', h('b', {}, 'بانتظار إجراءك: '), nextAction(run)));
        const tabsEl = SA.tabs({ tabs: [{ id: 'wizard', label: 'المعالج', icon: 'receipt' }, { id: 'register', label: 'الكشف حسب القسم', icon: 'list' }, { id: 'checks', label: 'الفحوصات', icon: 'checkcircle', badge: (run.checks || []).filter((c) => c.status === 'open' && c.sev !== 'info').length || undefined }, { id: 'activity', label: 'السجل', icon: 'history' }], active: view.tab, onChange: (t) => { view.tab = t; L.refresh(); } });
        const stepPanel = [panelInputs, panelCalc, panelChecks, panelApproval, panelRelease][view.step];
        const panel = view.tab === 'wizard' ? h('div', {}, stepBar(run, view, () => L.refresh()), stepPanel(run, view, () => L.refresh())) : view.tab === 'register' ? panelRegister(run) : view.tab === 'checks' ? panelChecks(run) : panelActivity(run);
        return h('div.sap-pay-detail', {}, SA.pageHead({ title: (typ === 'regular' ? 'كشف مرتبات ' : TYPE_AR[typ] + ' ') + run.id, desc: PER.label(run.period) + ' · ' + (run.employees || 0) + ' موظف · جهّزه ' + SA.userName(run.preparedBy) + (ap ? ' · طلب الاعتماد ' + ap.id : ''), tags: [runChip(run), run.published ? SA.chip('منشور', 'info') : null, SA.tag('open', 'DEMO')], back: { href: SA.href('hr/payroll'), label: 'كل الدورات' }, actions: headActions(run) }), banners, totalsStrip(run), tabsEl.el, panel);
      }, ['payrollRuns', 'approvals', 'payBatches', 'payslips', 'payProfiles', 'settings.hrPayroll', 'loans', 'deductions']);
      draw = L;
      if (ctx.path[1] === 'lines' && ctx.path[2]) setTimeout(() => { const r = getRun(id); if (r) openTrace(r, ctx.path[2], () => { if (location.hash.indexOf('/lines/') >= 0) SA.nav('hr/payroll/' + id, { replace: true }); }); }, 80);
      return () => L.stop();
    });
  }
  reg('hr-payroll', function (root, ctx) { return ctx.path[0] ? payrollDetail(root, ctx) : payrollList(root, ctx); }, { badge: needMeCount });

  /* ═══════════════════════════════════════════ HR-15 · السلف والقروض والخصومات (hr-loans) ═══════════════════════════════════════════ */
  const KIND_LN = { advance: 'سلفة', loan: 'قرض' }; const nextLN = () => { const y = new Date().getFullYear(); const max = col('loans').reduce((m, x) => Math.max(m, parseInt(String(x.id).split('-')[2], 10) || 0), 0); return 'LN-' + y + '-' + String(max + 1).padStart(4, '0'); };
  const nextDED = () => { const y = new Date().getFullYear(); const max = col('deductions').reduce((m, x) => Math.max(m, parseInt(String(x.id).split('-')[2], 10) || 0), 0); return 'DED-' + y + '-' + String(max + 1).padStart(4, '0'); };
  const lastRunPeriod = () => col('payrollRuns').filter((r) => !r.type || r.type === 'regular').map((r) => r.period).sort().pop() || null;
  const freePeriod = () => { const lr = lastRunPeriod(); const base = lr ? PER.add(lr, 1) : PER.cur(); return base; };
  const nextDue = (ln) => (ln.schedule || []).find((r) => r.status === 'scheduled' || r.status === 'due');
  const myLoanApproval = (ln) => (ln.approvalId ? st.find('approvals', ln.approvalId) : null);
  const loanBlockSelf = (ln, what) => { const cf = conflictWith(ln.employeeId); return cf ? cf.replace('تعديل مرتبك أو سلفتك', what + ' سلفتك') : ''; };
  const needLoan = () => { try { return col('loans').filter((l) => { const ap = myLoanApproval(l); if (l.status === 'requested' && ap) return canDecide(ap, () => loanBlockSelf(l, 'اعتماد')).ok; if (l.status === 'approved') return SA.can('hr.loans.approve') && !(ap && ap.chain.some((s) => s.decidedBy === meId())) && ap && ap.requesterId !== meId(); return false; }).length || null; } catch (e) { return null; } };

  function openLoanRequest() {
    if (!SA.can('hr.loans.create')) { SA.toast(NOPERM('hr.loans.create'), 'warn'); return; }
    const emp = field({ name: 'emp', label: 'الموظف', type: 'select', required: true, options: [['', 'اختر…']].concat(emps().filter((e) => e.status !== 'terminated').map((e) => [e.id, e.name + ' — ' + e.empNo])), onChange: () => upd() });
    const kind = field({ name: 'kind', label: 'النوع', type: 'radio', value: 'advance', options: [['advance', 'سلفة', 'قصيرة الأجل بأقساط قليلة'], ['loan', 'قرض', 'أقساط أطول — بدون فوائد']], onChange: () => upd() });
    const amt = field({ name: 'amount', label: 'المبلغ (ج.م)', type: 'number', required: true, min: 1, onInput: () => upd() }), n = field({ name: 'n', label: 'عدد الأقساط', type: 'number', required: true, min: 1, value: 6, onInput: () => upd() }), why = field({ name: 'reason', label: 'السبب', type: 'textarea', rows: 2, required: true });
    const box = h('div'); let blockMsg = 'اختر الموظف وأدخل المبلغ.';
    function upd() {
      SA.clear(box); blockMsg = ''; const e = empById(emp.get()); const a = Number(amt.get()), k = Number(n.get()); const R = API.rules(todayISO());
      if (!e) { blockMsg = 'اختر الموظف.'; return; } const cap = loanCapEgp(e), basic = basicOf(compLines(e.id, todayISO()).lines);
      const dup = col('loans').some((l) => l.employeeId === e.id && (l.status === 'requested' || l.status === 'approved'));
      if (dup) { box.append(SA.alert('warning', 'للموظف سلفة قيد الاعتماد/الصرف — «السلف المتزامنة» حدّها {Open} ولا يُمنع هنا لكن راجع قبل الاعتماد.')); }
      if (!(a > 0) || !(k >= 1)) { blockMsg = 'أدخل المبلغ وعدد الأقساط.'; box.append(SA.openValue('الحد الأقصى للسلفة (مضاعف المرتب): غير مُعدّ')); return; }
      const minN = cap ? MIN_INSTALMENTS(a, cap) : null; const inst = Math.round(a / k * 100) / 100;
      box.append(SA.kv([['أساس الأجر (الأساسي)', AE(basic)], ['سقف القسط (' + (R.caps ? R.caps.loan_pct : '—') + '% من الأجر)', cap == null ? SA.openValue() : AE(cap)], ['الحد الأدنى لعدد الأقساط', minN == null ? '—' : minN], ['القسط الشهري', h('b', {}, AE(inst))], ['حد المنتج (مضاعف المرتب · أقصى أقساط · متزامنة)', SA.openValue('Open')]]), lawTag('م113 Pending'));
      if (minN && k < minN) { blockMsg = 'القسط ' + fe(inst) + ' يتجاوز سقف ' + fe(cap) + ' — الحد الأدنى ' + minN + ' أقساط (م113).'; box.append(SA.alert('danger', blockMsg)); } else if (cap) box.append(SA.alert('success', 'القسط ضمن السقف القانوني (' + Math.round(inst / basic * 1000) / 10 + '% من الأساسي).'));
      const cf = conflictWith(e.id); if (cf && e.userId !== meId()) { blockMsg = cf; box.append(SA.alert('danger', cf)); }
    }
    upd();
    formModal({ title: 'طلب سلفة / قرض', subtitle: 'بدون فوائد · يمرّ بمسار اعتماد: مدير HR ← المالية (type = advance)', icon: 'coins', size: 'lg', fields: [emp, kind, amt, n, why], after: box, confirmLabel: 'إرسال للاعتماد', validate: () => { upd(); return blockMsg; },
      async onSubmit(v) {
        const e = empById(v.emp); let ln;
        await SA.api(() => {
          const a = Number(v.amount), k = Number(v.n); ln = { id: nextLN(), employeeId: e.id, kind: v.kind, amount: a, monthly: Math.round(a / k * 100) / 100, installments: k, status: 'requested', requestedAt: new Date().toISOString(), approvalId: null, reason: v.reason, createdBy: meId(), schedule: null, ledger: [], disbursedAt: null };
          const ap = SA.requestApproval({ type: 'advance', title: (KIND_LN[v.kind]) + ': ' + e.name, requesterId: meId(), amount: a, chain: [{ roleId: 'R-11', label: 'مدير الموارد البشرية' }, { roleId: 'R-07', label: 'المالية' }], ref: { type: 'advance', id: ln.id }, context: [['الموظف', e.name], ['المبلغ', fe(a) + ' ج.م (تجريبي)'], ['الأقساط', k + ' × ' + fe(ln.monthly)], ['ملاحظة', 'حدود السلف والخصومات {Open}. منفّذ الصرف ≠ معتمد السلفة.']] });
          ln.approvalId = ap.id; st.insert('loans', ln, true); aud('HR.ADVANCE.REQUESTED', { type: 'loan', id: ln.id, label: KIND_LN[v.kind] + ' — ' + e.name }, { reason: v.reason, after: { amount: canWages() ? a : '•••', installments: k, approval: ap.id } });
        }); SA.toast('أُرسل الطلب ' + ln.id + ' (' + ln.approvalId + ') للاعتماد', 'success'); return true;
      } });
  }
  async function actLoanDecide(ln, decision) { const ap = myLoanApproval(ln); if (!ap) return; await decideStep(ap, decision, { extra: () => loanBlockSelf(ln, decision === 'approved' ? 'اعتماد' : 'البت في') }); }
  function openDisburse(ln) {
    if (!SA.can('hr.loans.approve')) { SA.toast(NOPERM('hr.loans.approve'), 'warn'); return; } const ap = myLoanApproval(ln);
    if (ap && ap.chain.some((s) => s.decidedBy === meId())) { SA.toast('فصل المهام: منفّذ الصرف ≠ معتمد السلفة — اطلب من مستخدم آخر.', 'warn', { ms: 6500 }); return; } if (ap && ap.requesterId === meId()) { SA.toast('فصل المهام: مقدّم الطلب لا ينفّذ الصرف.', 'warn'); return; }
    const first = field({ name: 'first', label: 'شهر أول قسط', type: 'month', value: freePeriod(), required: true, hint: 'الأقساط تُخصم داخل دورة المرتبات فقط — اختر شهرًا لا تتجاوزه دورة مقفولة.' }), date = field({ name: 'date', label: 'تاريخ الصرف', type: 'date', value: todayISO(), required: true }), pv = field({ name: 'pv', label: 'رقم سند الصرف PV- (إن وُجد)', hint: 'الإنشاء والاعتماد والتنفيذ للمالية — الحالة Open ولا تكامل.', dir: 'ltr' });
    const k = ln.installments || MIN_INSTALMENTS(ln.amount, loanCapEgp(empById(ln.employeeId)) || ln.amount) || 6;
    formModal({ title: 'تأكيد صرف ' + ln.id, subtitle: empName(ln.employeeId) + ' — ' + k + ' قسط', icon: 'coins', fields: [date, first, pv], after: SA.alert('info', 'بتأكيد الصرف يُفتح سجل الرصيد (append-only) ويُجدوَل السداد ويدخل أول قسط في دورة الشهر المختار.'), confirmLabel: 'تأكيد الصرف',
      validate: (v) => { const lr = col('payrollRuns').filter((r) => (!r.type || r.type === 'regular') && ORD[r.status] >= ORD.locked).map((r) => r.period).sort().pop(); return lr && v.first <= lr ? 'شهر أول قسط يقع في فترة مقفولة (' + lr + ')' : ''; },
      async onSubmit(v) {
        if (!(await SA.stepUp('voucher.execute'))) return false;
        await SA.api(() => { const sch = mkSchedule(ln.amount, k, v.first); st.patch('loans', ln.id, (x) => ({ status: 'active', installments: k, monthly: sch[0].amount, schedule: sch, firstMonth: v.first, disbursedAt: v.date, ledger: (x.ledger || []).concat([{ id: ln.id + '-L1', ts: new Date(v.date + 'T09:00:00').toISOString(), type: 'disbursement', amount: ln.amount, ref: v.pv || 'PV- (Open)', by: meId(), note: 'تأكيد صرف — سند PV-' + (v.pv ? ' ' + v.pv : ' Open') }]) }));
          aud('HR.ADVANCE.DISBURSED', { type: 'loan', id: ln.id, label: KIND_LN[ln.kind] + ' — ' + empName(ln.employeeId) }, { after: { status: 'active', firstMonth: v.first, pv: v.pv || 'Open' } });
          const eu = (empById(ln.employeeId) || {}).userId; SA.notify({ title: 'تم صرف سلفتك', body: 'تدخل الأقساط دورة المرتبات من ' + PER.label(v.first) + '.', level: 'info', toUsers: eu ? [eu] : [], to: ['R-13'], link: '#/hr/loans/' + ln.id }); }); SA.toast('أُكّد الصرف — دخلت الأقساط دورة ' + PER.label(v.first), 'success'); return true;
      } });
  }
  function openEarly(ln) {
    if (!SA.can('hr.loans.approve')) { SA.toast(NOPERM('hr.loans.approve'), 'warn'); return; } const bal = loanBalance(ln);
    const method = field({ name: 'method', label: 'طريقة السداد', type: 'radio', value: 'cash', options: [['cash', 'نقدًا للخزينة', 'إيصال قبض'], ['transfer', 'تحويل بنكي', 'مرجع التحويل'], ['payroll', 'خصم دفعة واحدة من المرتب', 'يحتاج رأيًا قانونيًا {Open} — غير متاح', 'disabled']] }), amt = field({ name: 'amount', label: 'المبلغ (ج.م)', type: 'number', value: bal, required: true, min: 0.01, max: bal, hint: 'الرصيد الحالي ' + fe(bal) + ' ج.م — السداد المبكر الطوعي لا يتقيد بسقف القسط (BR-LON-12).' }), ref = field({ name: 'ref', label: 'مرجع الإيصال/التحويل', required: true, dir: 'ltr' }), why = field({ name: 'reason', label: 'ملاحظة', type: 'textarea', rows: 2 });
    formModal({ title: 'سداد مبكر / تسوية — ' + ln.id, subtitle: empName(ln.employeeId), icon: 'checkcircle', fields: [method, amt, ref, why], validate: (v) => (Number(v.amount) > bal + 0.001 ? 'المبلغ أكبر من الرصيد' : Number(v.amount) <= 0 ? 'أدخل مبلغًا' : ''), confirmLabel: 'تسجيل السداد',
      async onSubmit(v) { if (!(await SA.stepUp('voucher.execute'))) return false; const a = Math.round(Number(v.amount) * 100) / 100;
        await SA.api(() => { let closed = false; st.update('loans', (list) => { const x = list.find((q) => q.id === ln.id); x.ledger.push({ id: x.id + '-L' + (x.ledger.length + 1), ts: new Date().toISOString(), type: 'early_settlement', amount: -a, ref: v.ref, by: meId(), note: 'سداد مبكر (' + (v.method === 'cash' ? 'نقدًا' : 'تحويل') + ')' + (v.reason ? ' — ' + v.reason : '') }); let rem = P(a); for (let i = x.schedule.length - 1; i >= 0 && rem > 0; i--) { const r = x.schedule[i]; if (r.status !== 'scheduled') continue; const take = Math.min(P(r.amount), rem); r.amount = (P(r.amount) - take) / 100; rem -= take; if (r.amount <= 0.004) r.status = 'cancelled'; } if (Math.abs(loanBalance(x)) < 0.005) { x.status = 'closed'; x.closedAt = new Date().toISOString(); closed = true; } });
          aud('HR.LOAN.SETTLED', { type: 'loan', id: ln.id, label: 'سداد مبكر — ' + empName(ln.employeeId) }, { reason: v.reason, after: { paid: canWages() ? a : '•••', closed } }); if (closed) aud('HR.LOAN.CLOSED', { type: 'loan', id: ln.id, label: ln.id }, { after: { status: 'closed', via: 'early_settlement' } }); }); SA.toast('سُجّل السداد المبكر', 'success'); return true; } });
  }
  function openDefer(ln) {
    if (!SA.can('hr.loans.approve')) { SA.toast(NOPERM('hr.loans.approve'), 'warn'); return; } const rows = (ln.schedule || []).filter((r) => r.status === 'scheduled'); if (!rows.length) { SA.toast('لا أقساط مجدولة للتأجيل.', 'info'); return; }
    const lockedP = col('payrollRuns').filter((r) => (!r.type || r.type === 'regular') && ORD[r.status] >= ORD.locked).map((r) => r.period).sort().pop();
    const sel = field({ name: 'n', label: 'القسط المؤجَّل', type: 'select', required: true, options: rows.filter((r) => !lockedP || r.month > lockedP).map((r) => [String(r.n), 'القسط ' + r.n + ' — ' + PER.label(r.month)]) }), why = field({ name: 'reason', label: 'سبب التأجيل', type: 'textarea', rows: 2, required: true });
    formModal({ title: 'تأجيل قسط — ' + ln.id, subtitle: 'التأجيل لا يغيّر الرصيد · عدد المرات {Open}', icon: 'history', fields: [sel, why], after: SA.alert('info', 'يُنقل القسط إلى نهاية الجدول (BR-LON-08). حدّ عدد التأجيلات: ', SA.openValue('Open')), confirmLabel: 'تأجيل',
      async onSubmit(v) { await SA.api(() => { st.update('loans', (list) => { const x = list.find((q) => q.id === ln.id); const row = x.schedule.find((r) => String(r.n) === v.n); row.status = 'deferred'; const lastM = x.schedule.reduce((m, r) => (r.month > m ? r.month : m), row.month); x.schedule.push({ n: x.schedule.length + 1, month: PER.add(lastM, 1), amount: row.amount, status: 'scheduled', deferredFrom: row.n }); x.ledger.push({ id: x.id + '-L' + (x.ledger.length + 1), ts: new Date().toISOString(), type: 'deferral', amount: 0, ref: '', by: meId(), note: 'تأجيل القسط ' + row.n + ' — ' + v.reason }); }); aud('HR.LOAN.DEFERRED', { type: 'loan', id: ln.id, label: empName(ln.employeeId) }, { reason: v.reason, after: { instalment: Number(v.n) } }); }); SA.toast('أُجّل القسط ' + v.n, 'success'); return true; } });
  }
  function openLoan(ln0) {
    const ln = st.find('loans', ln0.id) || ln0; const e = empById(ln.employeeId); const ap = myLoanApproval(ln); const bal = loanBalance(ln); const sch = ln.schedule || []; const SCH_ST = { scheduled: ['مجدول', 'neutral'], due: ['مستحق', 'warning'], deducted: ['مخصوم', 'success'], deferred: ['مؤجَّل', 'info'], cancelled: ['ملغى', 'neutral'] };
    logSalaryView(ln.employeeId, 'عرض سلفة ' + ln.id);
    const body = h('div.sap-pay-stack', {}, needWages(), SA.kv([['السلفة', ln.id + ' · ' + (KIND_LN[ln.kind] || ln.kind)], ['الموظف', (e ? e.name + ' · ' + e.empNo : ln.employeeId)], ['الحالة', SA.chip((LN_ST[ln.status] || [ln.status])[0], (LN_ST[ln.status] || [0, 'neutral'])[1])], ['المبلغ', AE(ln.amount)], ['القسط × العدد', h('span', {}, AE(ln.monthly), ' × ', ln.installments || '—')], ['الرصيد الحالي', h('b', {}, AE(bal))], ['السبب', ln.reason || '—'], ['صُرفت في', ln.disbursedAt ? SA.fmt.date(ln.disbursedAt) : '—'], ['سند الصرف PV-', ln.status === 'active' || ln.status === 'closed' ? ((ln.ledger[0] || {}).ref || SA.openValue('Open')) : SA.openValue('Open — المالية')]]),
      ap ? h('div', {}, h('h3.sap-sub', {}, 'مسار الاعتماد ', openLink(ap.id, SA.href('approvals/' + ap.id))), h('ol.sap-pay-chain', {}, ap.chain.map((s) => h('li', { class: 'sap-pay-chainstep is-' + s.status + (ap.currentStep === s.step && ap.status === 'pending' ? ' is-cur' : '') }, h('span.sap-pay-dot'), h('div', {}, h('b', {}, s.step + '. ' + s.label), h('div.t-caption', {}, s.status === 'approved' ? 'اعتمد ' + SA.userName(s.decidedBy) + ' · ' + SA.fmt.dt(s.decidedAt) : s.status === 'rejected' ? 'رفض: «' + s.reason + '»' : s.status === 'pending' ? 'بانتظار القرار' : s.status === 'skipped' ? 'تخطّي' : 'لم يبدأ')))))) : null,
      sch.length ? h('div', {}, h('h3.sap-sub', {}, 'جدول السداد'), h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['القسط', 'الشهر', 'المبلغ', 'الحالة'].map((x) => h('th', {}, x)))), h('tbody', {}, sch.map((r) => h('tr', {}, h('td', {}, h('span.num', {}, r.n + (r.deferredFrom ? ' (من ' + r.deferredFrom + ')' : ''))), h('td', {}, PER.label(r.month)), h('td', {}, AE(r.amount)), h('td', {}, SA.chip((SCH_ST[r.status] || [r.status])[0], (SCH_ST[r.status] || [0, 'neutral'])[1]) , r.runId ? h('span.t-caption', {}, ' ' + r.runId) : null)))))), h('p.sap-hint', {}, 'الأقساط متساوية بتقريب القروش والأخير يمتص الفرق؛ لا فوائد ولا رسوم (BR-LON-05).')) : null,
      (ln.ledger || []).length ? h('div', {}, h('h3.sap-sub', {}, 'سجل الرصيد (append-only)'), h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['التاريخ', 'النوع', 'المبلغ', 'الرصيد بعده', 'المرجع'].map((x) => h('th', {}, x)))), h('tbody', {}, (() => { let acc = 0; return ln.ledger.map((x) => { acc = Math.round((acc + x.amount) * 100) / 100; return h('tr', {}, h('td', {}, SA.fmt.date(x.ts)), h('td', {}, { disbursement: 'صرف', installment: 'قسط', early_settlement: 'سداد مبكر', deferral: 'تأجيل', adjustment: 'تسوية' }[x.type] || x.type), h('td', {}, AE(x.amount)), h('td', {}, AE(acc)), h('td', {}, h('span.t-caption', {}, x.ref || '—'))); }); })())))) : null, h('p.sap-hint', {}, specLink('scr-lon-04')));
    const foot = []; const c = ap ? canDecide(ap, () => loanBlockSelf(ln, 'اعتماد')) : { ok: false };
    if (ln.status === 'requested') { foot.push(SA.btn({ label: 'اعتماد', icon: 'checkcircle', kind: 'primary', reason: c.ok ? '' : c.why || '', onClick: () => actLoanDecide(ln, 'approved') }), SA.btn({ label: 'رفض', icon: 'xcircle', kind: 'ghost', reason: c.ok ? '' : c.why || '', onClick: () => actLoanDecide(ln, 'rejected') })); }
    if (ln.status === 'approved') foot.push(SA.btn({ label: 'تأكيد الصرف', icon: 'coins', kind: 'primary', perm: 'hr.loans.approve', onClick: () => openDisburse(ln) }));
    if (ln.status === 'active') foot.push(SA.btn({ label: 'سداد مبكر', icon: 'checkcircle', kind: 'primary', perm: 'hr.loans.approve', onClick: () => openEarly(ln) }), SA.btn({ label: 'تأجيل قسط', icon: 'history', kind: 'ghost', perm: 'hr.loans.approve', onClick: () => openDefer(ln) }));
    SA.drawer({ title: (KIND_LN[ln.kind] || '') + ' ' + ln.id, subtitle: e ? e.name : '', size: 'lg', body, foot, onClose: () => { if (location.hash.indexOf('hr/loans/') >= 0) SA.nav('hr/loans', { replace: true }); } });
  }
  function tabLoans(panel, setActions, ctxPath) {
    setActions([SA.btn({ label: 'طلب سلفة', icon: 'plus', kind: 'primary', perm: 'hr.loans.create', onClick: openLoanRequest })]); const view = {};
    const stop = SA.live(panel, () => {
      const R = API.rules(todayISO()); const loans = col('loans'); const active = loans.filter((l) => l.status === 'active'); const bal = sum(active, loanBalance); const nextP = freePeriod(); const nextRows = sum(active, (l) => sum((l.schedule || []).filter((r) => r.month === nextP && r.status === 'scheduled'), (r) => r.amount));
      const lastNet = (() => { const r = col('payrollRuns').filter((x) => (!x.type || x.type === 'regular') && x.lines).sort((a, b) => (a.period < b.period ? 1 : -1))[0]; return r ? totalsOf(r.lines).net / 100 : 0; })();
      const t = SA.table({ caption: 'السلف والقروض', rows: () => col('loans').slice().sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1)).map((l) => Object.assign({}, l, { empName: empName(l.employeeId) })), pageSize: 10, initial: view.s, onChange: (s) => { view.s = s; }, search: { placeholder: 'ابحث بالموظف أو رقم السلفة', keys: ['id', 'empName'] },
        filters: [{ key: 'status', label: 'الحالة', options: Object.keys(LN_ST).map((k) => [k, LN_ST[k][0]]) }, { key: 'kind', label: 'النوع', options: Object.keys(KIND_LN).map((k) => [k, KIND_LN[k]]) }],
        columns: [{ key: 'id', label: 'السلفة', sort: true, render: (l) => h('b', {}, l.id) }, { key: 'empName', label: 'الموظف', sort: true, render: (l) => h('div', {}, h('b', {}, l.empName), h('div.t-caption', {}, KIND_LN[l.kind] || l.kind)) }, { key: 'amount', label: 'المبلغ', sort: true, render: (l) => AE(l.amount) },
          { key: 'inst', label: 'الأقساط', render: (l) => (l.installments ? h('span', {}, AE(l.monthly), ' × ', h('span.num', {}, l.installments)) : '—') }, { key: 'bal', label: 'الرصيد', render: (l) => (l.status === 'active' || l.status === 'closed' ? AE(loanBalance(l)) : '—') },
          { key: 'status', label: 'الحالة', render: (l) => SA.chip((LN_ST[l.status] || [l.status])[0], (LN_ST[l.status] || [0, 'neutral'])[1]) }, { key: 'next', label: 'القسط القادم', render: (l) => { const d = nextDue(l); return d ? h('span', {}, PER.label(d.month)) : '—'; } }, { key: 'nm', label: '', render: (l) => (mineLoan(l) ? h('b.sap-pay-now', {}, SA.icon('arrowleft', 'icon-sm'), 'إجراؤك') : '') }],
        rowActions: (l) => [{ label: 'التفاصيل وجدول السداد', icon: 'list', onClick: () => openLoan(l) }, { label: 'تأكيد الصرف', icon: 'coins', hidden: l.status !== 'approved', onClick: () => openDisburse(l), disabled: SA.can('hr.loans.approve') ? false : NOPERM('hr.loans.approve') }, { label: 'سداد مبكر', icon: 'checkcircle', hidden: l.status !== 'active', onClick: () => openEarly(l), disabled: SA.can('hr.loans.approve') ? false : NOPERM('hr.loans.approve') }, { label: 'تأجيل قسط', icon: 'history', hidden: l.status !== 'active', onClick: () => openDefer(l), disabled: SA.can('hr.loans.approve') ? false : NOPERM('hr.loans.approve') }],
        onRowClick: (l) => openLoan(l), empty: { icon: 'coins', title: 'لا توجد سلف', text: 'اطلب أول سلفة لموظف.', action: { label: 'طلب سلفة', onClick: openLoanRequest, perm: 'hr.loans.create' } } });
      return h('div.sap-pay-stack', {}, kpiRow([['سلف نشطة', active.length, { sub: loans.filter((l) => l.status === 'requested' || l.status === 'approved').length + ' قيد الاعتماد/الصرف' }], ['الرصيد القائم', canWages() ? h('span.sap-pay-amt', fe(bal)) : secret(), { sub: lastNet ? 'التعرّض ' + (Math.round(bal / lastNet * 1000) / 10) + '% من صافي آخر دورة' : '' }], ['أقساط ' + PER.label(nextP), canWages() ? h('span.sap-pay-amt', fe(nextRows)) : secret(), { sub: 'تدخل الدورة القادمة' }], ['سقف القسط القانوني', R.caps ? R.caps.loan_pct + '%' : '—', { sub: 'من الأجر — م113 Pending' }]]), needWages(), h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الخصم داخل دورة المرتبات فقط، ولا يُخصم قسط يجعل الصافي سالبًا (يُؤجَّل). ', specLink('scr-lon-01'))));
    }, ['loans', 'approvals', 'payrollRuns']);
    if (ctxPath && ctxPath[0]) { const ln = st.find('loans', ctxPath[0]); if (ln) setTimeout(() => openLoan(ln), 80); }
    return stop;
  }
  const mineLoan = (l) => { const ap = myLoanApproval(l); if (l.status === 'requested' && ap) return canDecide(ap, () => loanBlockSelf(l, 'اعتماد')).ok; if (l.status === 'approved') return SA.can('hr.loans.approve') && !!ap && ap.requesterId !== meId() && !ap.chain.some((s) => s.decidedBy === meId()); return false; };

  /* deductions (DED-) */
  const DED_T = { penalty: 'جزاء مالي', damage: 'تلفيات', creditor: 'خصم دائن', alimony: 'نفقة' }; const DED_ST = { draft: ['مسودة — بانتظار الاعتماد', 'warning'], approved: ['معتمد — يدخل الدورة', 'success'], applied: ['مُطبَّق', 'neutral'], cancelled: ['ملغى', 'neutral'] };
  function openDeduction() {
    if (!SA.can('hr.loans.create')) { SA.toast(NOPERM('hr.loans.create'), 'warn'); return; }
    const emp = field({ name: 'emp', label: 'الموظف', type: 'select', required: true, options: [['', 'اختر…']].concat(emps().filter((e) => e.status !== 'terminated').map((e) => [e.id, e.name + ' — ' + e.empNo])), onChange: () => upd() }), type = field({ name: 'type', label: 'النوع', type: 'select', value: 'penalty', options: Object.keys(DED_T).map((k) => [k, DED_T[k]]), onChange: () => upd() }),
      val = field({ name: 'val', label: 'القيمة (أيام للجزاء/التلفيات — جنيه للدائن/النفقة)', type: 'number', required: true, min: 0.01, onInput: () => upd() }), month = field({ name: 'month', label: 'يُخصم في دورة', type: 'month', value: freePeriod(), required: true }), why = field({ name: 'reason', label: 'السبب', type: 'textarea', rows: 2, required: true }), basis = field({ name: 'basis', label: 'الأساس القانوني', required: true, hint: 'مثل: قرار تأديبي HR-20 · موافقة كتابية (م114)' }); const box = h('div'); let bm = '';
    function upd() { SA.clear(box); bm = ''; const e = empById(emp.get()); const v = Number(val.get()); if (!e || !(v > 0)) { bm = 'اختر الموظف وأدخل القيمة.'; return; } const R = API.rules(todayISO()); const C = R.caps; if (!C) { bm = 'جدول السقوف غير مُعدّ'; box.append(SA.alert('danger', bm)); return; } const b = P(basicOf(compLines(e.id, todayISO()).lines)); const tp = type.get(); const daily = b / R.period.month_days;
      if (tp === 'penalty' || tp === 'damage') { const cd = tp === 'penalty' ? C.penalty_days : C.damage_days_month; const cap = daily * cd; const req = daily * v; box.append(SA.kv([['القيمة اليومية (الأساسي ÷ ' + R.period.month_days + ')', AE(rnd(daily) / 100)], ['السقف (' + cd + ' أيام)', AE(rnd(cap) / 100)], ['المبلغ المطلوب', AE(rnd(req) / 100)]]), lawTag('م143/148/151 Pending')); if (req > cap) box.append(SA.alert('warning', 'يتجاوز السقف — سيُقتصّ تلقائيًا عند ' + cd + ' أيام ويظهر تنبيه في الدورة.')); }
      else { box.append(SA.alert('info', 'السقف ' + (tp === 'alimony' ? C.alimony_pct : C.creditor_pct) + '% من الصافي بعد الضريبة والتأمين — يُطبَّق عند الحساب (م114 Pending) بموافقة كتابية.')); } }
    upd(); formModal({ title: 'خصم جديد (DED-)', subtitle: 'جزاء/تلفيات/دائن بسقوفها القانونية — يُعتمد من شخص آخر', icon: 'receipt', size: 'lg', fields: [emp, type, val, month, basis, why], after: box, confirmLabel: 'إنشاء مسودة الخصم', validate: () => { upd(); return bm; },
      async onSubmit(v) { let d; await SA.api(() => { const days = v.type === 'penalty' || v.type === 'damage'; d = { id: nextDED(), employeeId: v.emp, type: v.type, days: days ? Number(v.val) : null, amount: days ? null : Number(v.val), month: v.month, status: 'draft', source: 'manual', reason: v.reason, legalBasis: v.basis, createdBy: meId(), createdAt: new Date().toISOString(), approvedBy: null, appliedRun: null }; st.insert('deductions', d, true); aud('HR.DEDUCTION.CREATED', { type: 'deduction', id: d.id, label: DED_T[v.type] + ' — ' + empName(v.emp) }, { reason: v.reason, after: { type: v.type, month: v.month } }); SA.notify({ title: 'خصم بانتظار الاعتماد: ' + d.id, body: DED_T[v.type] + ' — ' + empName(v.emp), level: 'action', to: ['R-11', 'R-07'], link: '#/hr/loans?tab=deductions' }); }); SA.toast('أُنشئ ' + d.id + ' — بانتظار الاعتماد', 'success'); return true; } });
  }
  async function approveDeduction(d) {
    if (!SA.can('hr.loans.approve')) { SA.toast(NOPERM('hr.loans.approve'), 'warn'); return; } if (d.createdBy === meId()) { SA.toast('فصل المهام: من أنشأ الخصم لا يعتمده.', 'warn'); return; } const cf = conflictWith(d.employeeId); if (cf) { SA.toast(cf, 'error'); return; }
    const r = await SA.confirm({ title: 'اعتماد الخصم ' + d.id, confirmLabel: 'اعتماد', impact: ['يُخطَر الموظف قبل الخصم (BR-LON-15).', 'يدخل دورة ' + PER.label(d.month) + ' بسقفه القانوني.'] }); if (!r.ok) return;
    try { await SA.api(() => { st.patch('deductions', d.id, { status: 'approved', approvedBy: meId(), approvedAt: new Date().toISOString() }); aud('HR.DEDUCTION.APPROVED', { type: 'deduction', id: d.id, label: DED_T[d.type] + ' — ' + empName(d.employeeId) }, { reason: r.reason, after: { status: 'approved', month: d.month } }); const eu = (empById(d.employeeId) || {}).userId; if (eu) SA.notify({ title: 'إخطار خصم ' + d.id, body: 'سيُخصم بند «' + DED_T[d.type] + '» من مرتب ' + PER.label(d.month) + ' — راجع التفاصيل في خدماتي.', level: 'urgent', toUsers: [eu], link: '#/hr/ess' }); }); SA.toast('اعتُمد ' + d.id, 'success'); } catch (e) { SA.fail(e); }
  }
  async function cancelDeduction(d) { const r = await SA.confirm({ title: 'إلغاء الخصم ' + d.id, danger: true, reasonRequired: true, confirmLabel: 'إلغاء الخصم' }); if (!r.ok) return; try { await SA.api(() => { st.patch('deductions', d.id, { status: 'cancelled' }); aud('HR.DEDUCTION.APPROVED', { type: 'deduction', id: d.id, label: d.id }, { reason: r.reason, after: { status: 'cancelled' } }); }); SA.toast('أُلغي الخصم', 'success'); } catch (e) { SA.fail(e); } }
  function tabDeductions(panel, setActions) {
    setActions([SA.btn({ label: 'خصم جديد', icon: 'plus', kind: 'primary', perm: 'hr.loans.create', onClick: openDeduction })]); const view = {};
    return SA.live(panel, () => {
      const R = API.rules(todayISO()); const C = R.caps;
      const t = SA.table({ caption: 'الخصومات', rows: () => col('deductions').slice().map((d) => Object.assign({}, d, { empName: empName(d.employeeId) })), pageSize: 10, initial: view.s, onChange: (s) => { view.s = s; }, search: { placeholder: 'ابحث', keys: ['id', 'empName'] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(DED_ST).map((k) => [k, DED_ST[k][0]]) }, { key: 'type', label: 'النوع', options: Object.keys(DED_T).map((k) => [k, DED_T[k]]) }],
        columns: [{ key: 'id', label: 'الرقم', render: (d) => h('b', {}, d.id) }, { key: 'empName', label: 'الموظف', sort: true }, { key: 'type', label: 'النوع', render: (d) => SA.chip(DED_T[d.type] || d.type, 'info') }, { key: 'val', label: 'القيمة', render: (d) => (d.days != null ? h('span.num', {}, d.days + ' يوم') : AE(d.amount)) }, { key: 'month', label: 'الدورة', render: (d) => PER.label(d.month) }, { key: 'basis', label: 'الأساس القانوني', render: (d) => h('span.t-dense', {}, d.legalBasis) }, { key: 'status', label: 'الحالة', render: (d) => SA.chip((DED_ST[d.status] || [d.status])[0], (DED_ST[d.status] || [0, 'neutral'])[1]) }, { key: 'by', label: 'أنشأه', render: (d) => SA.userName(d.createdBy) }],
        rowActions: (d) => [{ label: 'اعتماد', icon: 'checkcircle', hidden: d.status !== 'draft', onClick: () => approveDeduction(d), disabled: SA.can('hr.loans.approve') ? (d.createdBy === meId() ? 'فصل المهام: من أنشأ لا يعتمد' : false) : NOPERM('hr.loans.approve') }, { label: 'إلغاء', icon: 'xcircle', danger: true, hidden: d.status === 'applied' || d.status === 'cancelled', onClick: () => cancelDeduction(d), disabled: SA.can('hr.loans.create') ? false : NOPERM('hr.loans.create') }], empty: { icon: 'receipt', title: 'لا خصومات', text: 'الجزاءات تأتي من HR-20 والباقي يُنشأ هنا.', action: { label: 'خصم جديد', onClick: openDeduction, perm: 'hr.loans.create' } } });
      const capRows = C ? [['جزاء مالي', C.penalty_days + ' أيام أجر أساسي لكل مخالفة ولكل شهر', 'الأساسي ÷ ' + R.period.month_days, 'م143/148'], ['تلفيات', C.damage_days_month + ' أيام/شهر و' + C.damage_months_total + ' شهر إجمالًا', 'الأجر', 'م151'], ['سلفة صاحب العمل', C.loan_pct + '% من الأجر لكل قسط — بلا فوائد', 'الأجر (الأساسي — Pending)', 'م113'], ['دائن / نفقة', C.creditor_pct + '% / ' + C.alimony_pct + '% بعد الضريبة والتأمين', 'الصافي بعدهما', 'م114']] : [];
      return h('div.sap-pay-stack', {}, needWages(), h('div.sap-tablecard-wrap', {}, t.el), SA.card({ title: 'سقوف الخصم المطبّقة في الدورة', tags: lawTag(), actions: [openLink('جدول السقوف في الامتثال', SA.href('hr/compliance'))] }, C ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['النوع', 'السقف', 'الأساس', 'المادة'].map((x) => h('th', {}, x)))), h('tbody', {}, capRows.map((r) => h('tr', {}, r.map((x) => h('td', {}, x))))))) : SA.openValue('سقوف غير مُعدّة')), h('p.sap-hint', {}, specLink('scr-lon-10')));
    }, ['deductions', 'employees']);
  }
  function tabLoanSettings(panel, setActions) {
    setActions([]);
    return SA.live(panel, () => {
      const S = st.get('settings.hrPayroll') || {}; const R = API.rules(todayISO()); const legal = R.caps ? R.caps.loan_pct : null; const o = (k, l) => [l, S[k] == null ? SA.openValue() : String(S[k])];
      return h('div.sap-pay-stack', {}, SA.card({ title: 'سقف قسط السلفة', tags: lawTag('م113 Pending'), actions: [SA.btn({ label: 'تعديل سقف الشركة', icon: 'edit', kind: 'primary', size: 'sm', perm: 'hr.settings.edit', onClick: () => editCompanyCap(legal) })] }, SA.kv([['السقف القانوني (من جدول القواعد)', legal == null ? SA.openValue() : legal + '% من الأجر'], ['سقف الشركة (أشدّ — اختياري)', S.loanCapCompanyPct == null ? SA.openValue('غير مُعدّ') : S.loanCapCompanyPct + '%'], ['السقف الفعلي في الدورة', legal == null ? '—' : Math.min(legal, S.loanCapCompanyPct == null ? legal : S.loanCapCompanyPct) + '%'], ['أساس «الأجر»', 'الأساسي (Pending — قد يكون الإجمالي)']]), SA.alert('info', 'سقف الشركة لا يتجاوز السقف القانوني أبدًا؛ الأقساط الأعلى منه تُؤجَّل لا تُقتصّ.')),
        SA.card({ title: 'حدود منتج السلف', tags: SA.tag('open', 'Open') }, SA.kv([o('loanMaxMultiple', 'الحد الأقصى كمضاعف للمرتب'), o('loanMaxInstallments', 'أقصى عدد أقساط'), o('loanMaxConcurrent', 'السلف المتزامنة'), o('loanFinanceLimit', 'حد اعتماد المالية'), o('loanGmLimit', 'حد المدير العام'), ['مدة الخدمة المطلوبة', SA.openValue()], ['SLA الاعتماد', SA.openValue()]]), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'لا قيم افتراضية (BR-LON-02) — تُحدَّد بقرار الإدارة وبتاريخ سريان. ', specLink('scr-lon-07')))));
    }, ['settings.hrPayroll', 'settings.hrLegal']);
  }
  function editCompanyCap(legal) {
    if (!SA.can('hr.settings.edit')) { SA.toast(NOPERM('hr.settings.edit'), 'warn'); return; } const S = st.get('settings.hrPayroll') || {};
    const f = field({ name: 'pct', label: 'سقف الشركة لقسط السلفة (% من الأجر)', type: 'number', value: S.loanCapCompanyPct, min: 1, max: legal || 100, hint: 'فارغ = غير مُعدّ. لا يزيد عن السقف القانوني ' + (legal == null ? '(غير مُعدّ)' : legal + '%') + '.' }), why = field({ name: 'reason', label: 'السبب', type: 'textarea', rows: 2, required: true });
    formModal({ title: 'سقف الشركة للخصم من السلف', icon: 'settings', fields: [f, why], validate: (v) => (v.pct != null && legal != null && Number(v.pct) > legal ? 'لا يتجاوز السقف القانوني ' + legal + '%' : ''), async onSubmit(v) { if (!(await SA.stepUp('policy.change'))) return false; await SA.api(() => { st.update('settings.hrPayroll', (x) => { x.loanCapCompanyPct = v.pct == null ? null : Number(v.pct); }); aud('HR.PAYROLL.SETTINGS_CHANGED', { type: 'settings', id: 'hrPayroll.loanCapCompanyPct', label: 'سقف الشركة لقسط السلفة' }, { reason: v.reason, before: { pct: S.loanCapCompanyPct }, after: { pct: v.pct } }); }); SA.toast('حُفظ السقف', 'success'); return true; } });
  }
  reg('hr-loans', function (root, ctx) {
    return loadScreen(root, ctx, 'السلف والقروض', () => {
      const actions = h('div.sap-actions'); const setActions = (n) => { SA.clear(actions); n.forEach((x) => actions.append(x)); }; const host = h('div');
      root.append(SA.pageHead({ title: 'السلف والقروض والخصومات', desc: 'طلب ← اعتماد متسلسل ← صرف عبر المالية (PV-) ← جدول سداد ← خصم تلقائي داخل الدورة ← سجل رصيد لا يتعدّل ← تسوية مبكرة. السقوف القانونية Pending وحدود المنتج Open.', tags: [lawTag(), SA.tag('open', 'الحدود Open')], actions }), host);
      const t = tabbed(host, [{ id: 'loans', label: 'السلف والقروض', icon: 'coins', build: (p) => tabLoans(p, setActions, ctx.path) }, { id: 'deductions', label: 'الخصومات الأخرى وسقوفها', icon: 'receipt', build: (p) => tabDeductions(p, setActions) }, { id: 'settings', label: 'السقوف والحدود', icon: 'settings', build: (p) => tabLoanSettings(p, setActions) }], ctx.params.tab || 'loans');
      return () => t.cleanup();
    });
  }, { badge: needLoan });

  /* ═══════════════════════════════════════════ HR-16 · الصرف ومفردات المرتب (hr-payments) ═══════════════════════════════════════════ */
  const profileOf = (empId) => col('payProfiles').find((p) => p.employeeId === empId) || null;
  const maskAcc = (p) => (p && p.last4 ? '••••' + p.last4 : '—');
  const bankProfile = () => Object.assign({ encoding: 'utf8bom', delimiter: ',', decimal: '.', nameLang: 'ar', maxRecords: null, debitAccountMasked: '••••0000' }, (st.get('settings.hrPayroll') || {}).bankProfile || {});
  const LN_BATCH_KIND = { bank: 'تحويل بنكي', cash: 'صرف نقدي' };
  const LINE_ST = { pending: ['قيد التنفيذ', 'warning'], paid: ['مدفوع', 'success'], received: ['مستلم', 'success'], rejected: ['مرفوض', 'danger'], retried: ['أُعيدت المحاولة', 'neutral'] };
  function applyDueBankChanges() {
    const now = Date.now(); col('bankChanges').slice().forEach((c) => { if (c.status === 'holding' && c.effectiveAt && new Date(c.effectiveAt).getTime() <= now) activateBankChange(c, false); });
  }
  function activateBankChange(c, demo) {
    st.patch('payProfiles', 'PP-' + c.employeeId, { method: 'bank', bank: c.newBank, last4: c.newLast4, account: c.newAccount, updatedAt: new Date().toISOString(), verifiedAt: new Date().toISOString() });
    st.patch('bankChanges', c.id, { status: 'effective', activatedAt: new Date().toISOString(), activatedDemo: !!demo });
  }
  const pickRun = (rid) => { const runs = col('payrollRuns').filter((r) => r.lines); return (rid && runs.find((r) => r.id === rid)) || runs.filter((r) => r.status === 'released' || r.status === 'locked').sort((a, b) => (a.period < b.period ? 1 : a.id < b.id ? 1 : -1))[0] || runs.sort((a, b) => (a.period < b.period ? 1 : -1))[0] || null; };
  const batchesOf = (run) => col('payBatches').filter((b) => b.runId === run.id).sort((a, b) => (a.id < b.id ? -1 : 1));
  function fileHeaderBody(run, lines, full) {
    const P0 = bankProfile(); const d = P0.delimiter === 'tab' ? '\t' : P0.delimiter === 'semicolon' ? ';' : ','; const money = (p) => (p / 100).toFixed(2).replace('.', P0.decimal === 'comma' ? ',' : '.'); const ref = 'PAYBATCH-' + run.id.replace(/^PR-/, '') + '-01'; const tot = sum(lines, (l) => l.net);
    const head = ['H', ref, P0.debitAccountMasked, run.period + '-28', lines.length, money(tot), 'EGP'].join(d);
    const det = lines.map((l, i) => { const pr = profileOf(l.empId); return ['D', i + 1, l.empNo, l.name, 'BANK-CODE (Open)', full ? (pr.account || '') : maskAcc(pr), money(l.net), 'EGP', 'مرتب ' + PER.label(run.period)].join(d); });
    return { head, det, tot, count: lines.length, ref, body: [head].concat(det).join('\n') };
  }
  const bankLines = (run) => run.lines.filter((l) => l.method === 'bank' && l.net > 0);
  function preChecks(run) {
    const L = bankLines(run); const accs = L.map((l) => (profileOf(l.empId) || {}).account).filter(Boolean); const T = totalsOf(run.lines); const f = fileHeaderBody(run, L, false);
    return [['كل سطر بنكي له رقم حساب', L.every((l) => !!(profileOf(l.empId) || {}).last4)], ['مجموع الأسطر = صافي صفوف «بنك» في الكشف', f.tot === T.bankP], ['عدد السجلات = عدد صفوف «بنك»', f.count === T.bankN || L.length === f.count], ['لا تكرار لرقم حساب بين موظفين', accs.length === uniq(accs).length], ['لا مبالغ سالبة أو صفرية', L.every((l) => l.net > 0)], ['أسماء المستفيدين غير فارغة', L.every((l) => !!l.name)]];
  }
  async function exportBank(run) {
    if (!SA.can('hr.payments.export')) { SA.toast(NOPERM('hr.payments.export'), 'warn'); return; } if (run.status !== 'released') { SA.toast('التصدير بعد إطلاق الصرف (HR-14 · الخطوة 5).', 'warn'); return; }
    const pc = preChecks(run); if (pc.some((x) => !x[1])) { SA.toast('فشل فحص مسبق — لا تصدير.', 'error'); return; }
    const b = batchesOf(run).find((x) => x.kind === 'bank' && !x.retryOf); if (!b) { SA.toast('لا دفعة بنكية لهذه الدورة.', 'info'); return; }
    const r = await SA.confirm({ title: 'تصدير ملف التحويل البنكي', danger: true, confirmLabel: 'تصدير الملف', reasonRequired: true, reasonLabel: 'سبب/غرض التصدير', impact: ['ملف يحوي أرقام حسابات كاملة (T2) — يُحفظ بصمته ولا يتغيّر بعد الإطلاق.', 'يُسجَّل التصدير ويُنبَّه مدير HR والمالك (N-50).', 'لا تكامل بنكي — تُرفع الدفعة يدويًا من المالية (PV-).'] }); if (!r.ok) return; if (!(await SA.stepUp('audit.export', { force: true, title: 'تصدير ملف بنكي', text: 'أدخل كلمة مرورك أو كود التحقق لتصدير ملف التحويل.' }))) return;
    try { const f = fileHeaderBody(run, bankLines(run), true); const hash = await sha256Hex(f.body); const P0 = bankProfile(); const d = P0.delimiter === 'tab' ? '\t' : P0.delimiter === 'semicolon' ? ';' : ','; const text = f.body + '\n' + ['T', f.count, (f.tot / 100).toFixed(2), hash].join(d);
      await SA.api(() => { SA.download(b.id + '.csv', text, 'text/csv'); st.patch('payBatches', b.id, { exportedAt: new Date().toISOString(), exportedBy: meId(), hash, status: 'exported' }); aud('HR.PAYMENTS.BANK_FILE_EXPORTED', { type: 'payment_batch', id: b.id, label: 'ملف بنكي ' + b.id }, { reason: r.reason, after: { count: f.count, hash: hash.slice(0, 16) + '…' } }); aud('HR.EXPORT.SENSITIVE', { type: 'payment_batch', id: b.id, label: b.id }, { reason: r.reason }); SA.notify({ title: 'تصدير ملف بنكي ' + b.id, body: SA.userName(meId()) + ' — ' + r.reason, level: 'urgent', to: ['R-11', 'R-01'], link: '#/audit' }); }); SA.toast('صُدّر الملف وحُفظت بصمته', 'success'); } catch (e) { SA.fail(e); }
  }
  const greedy = (egp, denoms) => { const out = []; let rem = Math.floor(egp); denoms.slice().sort((a, b) => b - a).forEach((d) => { const n = Math.floor(rem / d); out.push(n); rem -= n * d; }); return out; };
  function cashSheet(run, batch) {
    const D = (st.get('settings.hrPayroll') || {}).denoms || [200, 100, 50, 20, 10, 5, 1]; const Ds = D.slice().sort((a, b) => b - a); const ls = batch ? batch.lines : run.lines.filter((l) => l.method === 'cash' && l.net > 0).map((l) => ({ empId: l.empId, empNo: l.empNo, name: l.name, amountP: l.net, status: 'pending' }));
    return { Ds, ls, rows: ls.map((x) => { const g = greedy(x.amountP / 100, Ds); return Object.assign({}, x, { g, frac: x.amountP % 100, dept: (run.lines.find((l) => l.empId === x.empId) || {}).deptId }); }) };
  }
  async function exportCash(run, batch) {
    if (!SA.can('hr.payments.export')) { SA.toast(NOPERM('hr.payments.export'), 'warn'); return; }
    const r = await SA.confirm({ title: 'تصدير كشف الصرف النقدي', danger: true, confirmLabel: 'تصدير', reasonRequired: true, reasonLabel: 'سبب التصدير', impact: ['يحوي أسماء ومبالغ العمال — خارج النظام.', 'يُسجَّل ويُنبَّه مدير HR والمالك (N-50).'] }); if (!r.ok) return; if (!(await SA.stepUp('audit.export', { force: true, title: 'تصدير كشف نقدي', text: 'أدخل كلمة مرورك أو كود التحقق.' }))) return;
    try { await SA.api(() => { const c = cashSheet(run, batch); const rows = [['م', 'الرقم الوظيفي', 'الاسم', 'القسم', 'المبلغ'].concat(c.Ds.map((d) => 'فئة ' + d)).concat(['كسور (قروش)', 'التوقيع/البصمة', 'الشاهد'])]; c.rows.forEach((x, i) => rows.push([i + 1, x.empNo, x.name, deptName(x.dept), (x.amountP / 100).toFixed(2)].concat(x.g).concat([x.frac, '', '']))); rows.push(['', '', 'الإجمالي', '', (sum(c.rows, (x) => x.amountP) / 100).toFixed(2)]); SA.download((batch ? batch.id : run.id + '-cash') + '.csv', SA.csv(rows), 'text/csv'); aud('HR.PAYMENTS.CASH_SHEET_EXPORTED', { type: 'payroll_run', id: run.id, label: 'كشف نقدي ' + run.id }, { reason: r.reason, after: { rows: c.rows.length } }); aud('HR.EXPORT.SENSITIVE', { type: 'payroll_run', id: run.id, label: 'كشف نقدي' }, { reason: r.reason }); SA.notify({ title: 'تصدير كشف صرف نقدي ' + run.id, body: SA.userName(meId()) + ' — ' + r.reason, level: 'urgent', to: ['R-11', 'R-01'], link: '#/audit' }); }); SA.toast('صُدّر الكشف النقدي', 'success'); } catch (e) { SA.fail(e); }
  }
  async function recordLine(b, empId, status) {
    if (!SA.can('hr.payroll.release') && !SA.can('hr.payments.export')) { SA.toast(NOPERM('hr.payroll.release'), 'warn'); return; } let reason = '';
    if (status === 'rejected') { const r = await SA.confirm({ title: 'تسجيل رفض البنك — ' + empName(empId), danger: true, reasonRequired: true, reasonLabel: 'سبب الرفض (رد البنك)', confirmLabel: 'تسجيل الرفض' }); if (!r.ok) return; reason = r.reason; }
    try { await SA.api(() => { st.update('payBatches', (l) => { const x = l.find((q) => q.id === b.id); const ln = x.lines.find((q) => q.empId === empId); ln.status = status; ln.note = reason; ln.at = new Date().toISOString(); ln.by = meId(); x.status = batchStatus(x); }); aud('HR.PAYMENTS.STATUS_RECORDED', { type: 'payment_batch', id: b.id, label: empName(empId) }, { reason, after: { status } }); }); SA.toast('سُجّلت الحالة', 'success'); } catch (e) { SA.fail(e); }
  }
  async function recordAll(b) {
    if (!SA.can('hr.payroll.release')) { SA.toast(NOPERM('hr.payroll.release'), 'warn'); return; } const r = await SA.confirm({ title: 'تسجيل نجاح كل أسطر ' + b.id, confirmLabel: 'تسجيل', impact: ['كل الأسطر القائمة تصبح «' + (b.kind === 'bank' ? 'مدفوع' : 'مستلم') + '» — اعتمد على رد البنك/إيصال الخزينة الفعلي.'] }); if (!r.ok) return;
    try { await SA.api(() => { st.update('payBatches', (l) => { const x = l.find((q) => q.id === b.id); x.lines.forEach((ln) => { if (ln.status === 'pending') { ln.status = b.kind === 'bank' ? 'paid' : 'received'; ln.at = new Date().toISOString(); ln.by = meId(); } }); x.status = batchStatus(x); }); aud('HR.PAYMENTS.STATUS_RECORDED', { type: 'payment_batch', id: b.id, label: b.id }, { after: { all: true } }); }); SA.toast('سُجّل نجاح الدفعة', 'success'); } catch (e) { SA.fail(e); }
  }
  async function retryBatch(b) {
    if (!SA.can('hr.payroll.release')) { SA.toast(NOPERM('hr.payroll.release'), 'warn'); return; } const rej = b.lines.filter((x) => x.status === 'rejected'); if (!rej.length) { SA.toast('لا أسطر مرفوضة.', 'info'); return; }
    const r = await SA.confirm({ title: 'إعادة محاولة ' + rej.length + ' سطر مرفوض', confirmLabel: 'إنشاء دفعة جديدة', impact: ['تُنشأ دفعة جديدة مرتبطة بالأصل ' + b.id + ' ولا تُعدَّل الأصلية (BR-PAY-17).', 'تأكد من تصحيح بيانات الحساب أولًا من «الحسابات البنكية».'] }); if (!r.ok) return;
    try { let nb; await SA.api(() => { const n = col('payBatches').filter((x) => x.retryOf === b.id).length + 1; nb = { id: b.id + '-RT' + n, runId: b.runId, period: b.period, kind: b.kind, profile: b.profile, count: rej.length, totalP: sum(rej, (x) => x.amountP), status: 'generated', createdAt: new Date().toISOString(), createdBy: meId(), retryOf: b.id, exportedAt: null, hash: null, lines: rej.map((x) => ({ empId: x.empId, empNo: x.empNo, name: x.name, amountP: x.amountP, status: 'pending', last4: (profileOf(x.empId) || {}).last4 || null, note: 'إعادة محاولة' })) };
      st.insert('payBatches', nb, true); st.update('payBatches', (l) => { const x = l.find((q) => q.id === b.id); x.lines.forEach((ln) => { if (ln.status === 'rejected') ln.status = 'retried'; }); x.status = batchStatus(x); }); aud('HR.PAYMENTS.RETRY_CREATED', { type: 'payment_batch', id: nb.id, label: 'إعادة محاولة من ' + b.id }, { after: { count: rej.length } }); }); SA.toast('أُنشئت ' + nb.id, 'success'); } catch (e) { SA.fail(e); }
  }
  function openLinkPV(run) {
    if (!(SA.can('hr.payroll.release') || SA.can('finance.voucher.create'))) { SA.toast(NOPERM('hr.payroll.release') + ' أو finance.voucher.create', 'warn'); return; } const f = field({ name: 'pv', label: 'رقم سند الصرف PV-', required: true, dir: 'ltr', hint: 'مثل: PV-2026-0124 — يُنشئه ويعتمده وينفّذه فريق المالية (بند 42).', rules: [(v) => (!/^PV-\d{4}-\d{3,5}$/.test(v) ? 'الصيغة PV-YYYY-NNNN' : null)] });
    formModal({ title: 'ربط سند الصرف PV-', subtitle: run.id, icon: 'link', fields: [f], after: SA.alert('info', 'HR يجهّز ويصدّر ويتابع فقط؛ المالية تنشئ السند وتعتمده وتنفّذه بصلاحيات منفصلة. لا تكامل مالي في هذا الإصدار.'), confirmLabel: 'ربط', async onSubmit(v) { await SA.api(() => { const x = getRun(run.id); x.pv = { id: v.pv, status: 'linked', note: 'رُبط يدويًا', by: meId(), at: new Date().toISOString() }; tl(x, 'رُبط سند الصرف ' + v.pv); saveRun(x); aud('HR.PAYMENTS.PV_LINKED', { type: 'payroll_run', id: run.id, label: v.pv }, { after: { pv: v.pv } }); }); SA.toast('رُبط ' + v.pv, 'success'); return true; } });
  }
  /* bank account change control (SCR-PAY-05/06) */
  function openBankChange(emp) {
    if (!(SA.can('hr.employees.edit') || SA.can('hr.payments.export') || SA.can('hr.payroll.prepare'))) { SA.toast(NOPERM('hr.employees.edit'), 'warn'); return; } const pr = profileOf(emp.id);
    if (col('bankChanges').some((c) => c.employeeId === emp.id && (c.status === 'pending' || c.status === 'holding'))) { SA.toast('يوجد طلب تغيير معلّق لنفس الموظف.', 'warn'); return; }
    const bank = field({ name: 'bank', label: 'اسم البنك والفرع', required: true, value: pr && pr.bank || '' }), acc = field({ name: 'acc', label: 'رقم الحساب / IBAN الجديد', required: true, dir: 'ltr', rules: [(v) => (v && v.replace(/\s/g, '').replace(/^EG/i, '').replace(/\D/g, '').length < 10 ? 'رقم غير صالح (10 أرقام على الأقل)' : null)] }), proof = field({ name: 'proof', label: 'إثبات الملكية (اسم الملف/المرجع)', required: true, hint: 'خطاب البنك أو صورة بطاقة الحساب — إلزامي.' }), nm = field({ name: 'nm', label: 'تحققت من مطابقة اسم صاحب الحساب لاسم الموظف', type: 'checkbox', required: true, rules: [(v) => (v ? null : 'التحقق من مطابقة الاسم إلزامي')] }), why = field({ name: 'reason', label: 'سبب التغيير', type: 'textarea', rows: 2, required: true });
    formModal({ title: 'تغيير الحساب البنكي — ' + emp.name, subtitle: 'ثنائي التحقق: طالب ≠ معتمد · حجز ' + ((st.get('settings.hrPayroll') || {}).bankHoldHours || 24) + ' ساعة · إشعار عاجل للموظف', icon: 'lock', size: 'lg', fields: [bank, acc, proof, nm, why], before: SA.alert('warning', 'لا يسري على دفعة مُجهَّزة أو مُصدَّرة، ويتطلب شخصًا ثانيًا يعتمده (BR-PAY-06).'), confirmLabel: 'إرسال للاعتماد',
      async onSubmit(v) { const digits = v.acc.replace(/\D/g, ''); let c; await SA.api(() => { c = { id: 'BC-' + String(col('bankChanges').length + 1).padStart(4, '0'), employeeId: emp.id, requestedBy: meId(), requestedAt: new Date().toISOString(), oldBank: pr ? pr.bank : '', oldLast4: pr ? pr.last4 : null, newBank: v.bank, newAccount: v.acc.toUpperCase(), newLast4: digits.slice(-4), proof: v.proof, reason: v.reason, status: 'pending', approvedBy: null, effectiveAt: null }; st.insert('bankChanges', c, true); aud('HR.BANK_ACCOUNT.CHANGE_REQUESTED', { type: 'employee', id: emp.id, label: emp.name }, { reason: v.reason, after: { newLast4: c.newLast4, proof: v.proof } });
        SA.notify({ title: 'طلب تغيير حساب بنكي: ' + emp.name, body: 'يحتاج اعتماد شخص ثانٍ (hr.pii.reveal) — ' + c.id, level: 'action', to: ['R-11'], link: '#/hr/payments?tab=accounts' }); if (emp.userId) SA.notify({ title: 'طُلب تغيير حسابك البنكي', body: 'إن لم تطلب أنت ذلك فأبلغ الموارد البشرية فورًا. لن يسري التغيير قبل مرور مدة الحجز.', level: 'urgent', toUsers: [emp.userId], link: '#/hr/ess' }); }); SA.toast('أُرسل الطلب ' + c.id + ' لاعتماد شخص ثانٍ', 'success'); return true; } });
  }
  async function decideBankChange(c, ok) {
    if (!SA.can('hr.pii.reveal')) { SA.toast(NOPERM('hr.pii.reveal') + ' — اعتماد تغيير الحساب', 'warn'); return; } if (c.requestedBy === meId()) { SA.toast('فصل المهام: طالب التغيير لا يعتمده.', 'warn'); return; }
    const hold = (st.get('settings.hrPayroll') || {}).bankHoldHours || 24; const r = await SA.confirm({ title: (ok ? 'اعتماد' : 'رفض') + ' تغيير الحساب البنكي', danger: !ok, confirmLabel: ok ? 'اعتماد وبدء الحجز' : 'رفض', reasonRequired: !ok, reasonLabel: 'سبب الرفض', impact: ok ? ['يسري التغيير بعد ' + hold + ' ساعة من الآن ما لم يعترض الموظف.', 'إشعار عاجل للموظف.'] : ['يبقى الحساب القديم.'] }); if (!r.ok) return; if (ok && !(await SA.stepUp('user.reset_password'))) return;
    try { await SA.api(() => { const eff = new Date(Date.now() + hold * 3600000).toISOString(); st.patch('bankChanges', c.id, ok ? { status: 'holding', approvedBy: meId(), approvedAt: new Date().toISOString(), effectiveAt: eff } : { status: 'rejected', approvedBy: meId(), rejectReason: r.reason }); aud(ok ? 'HR.BANK_ACCOUNT.CHANGE_APPROVED' : 'HR.BANK_ACCOUNT.CHANGE_REJECTED', { type: 'employee', id: c.employeeId, label: empName(c.employeeId) }, { reason: r.reason, after: { status: ok ? 'holding' : 'rejected', effectiveAt: ok ? eff : null } }); const eu = (empById(c.employeeId) || {}).userId; if (eu) SA.notify({ title: ok ? 'اعتُمد تغيير حسابك البنكي — يسري بعد ' + hold + ' ساعة' : 'رُفض طلب تغيير حسابك البنكي', body: ok ? 'إن لم تطلبه فاعترض فورًا عبر الموارد البشرية.' : r.reason, level: 'urgent', toUsers: [eu], link: '#/hr/ess' }); }); SA.toast(ok ? 'اعتُمد — بدأ الحجز' : 'رُفض الطلب', 'success'); } catch (e) { SA.fail(e); }
  }
  /* tabs */
  function tabPayDash(panel, setActions, S) {
    setActions([]);
    return SA.live(panel, () => {
      const run = pickRun(S.run); if (!run) return SA.empty({ icon: 'coins', title: 'لا دورات بعد', text: 'ابدأ دورة مرتبات من «دورة المرتبات».' }); S.run = run.id; const T = totalsOf(run.lines); const bs = batchesOf(run); const ok = T.bankP + T.cashP + T.holdP === T.net;
      const t = SA.table({ caption: 'دفعات الصرف', rows: () => batchesOf(run), pageSize: 10, columns: [{ key: 'id', label: 'الدفعة', render: (b) => h('b', {}, b.id) }, { key: 'kind', label: 'النوع', render: (b) => LN_BATCH_KIND[b.kind] }, { key: 'count', label: 'السجلات', render: (b) => h('span.num', {}, b.count) }, { key: 'tot', label: 'الإجمالي', render: (b) => AT(b.totalP) }, { key: 'st', label: 'الحالة', render: (b) => SA.chip((BATCH_ST[batchStatus(b)] || [b.status])[0], (BATCH_ST[batchStatus(b)] || [0, 'neutral'])[1]) }, { key: 'rt', label: 'الأصل', render: (b) => (b.retryOf ? h('span.t-caption', {}, 'إعادة محاولة من ' + b.retryOf) : '—') }, { key: 'ex', label: 'التصدير', render: (b) => (b.exportedAt ? h('span.t-caption', {}, SA.fmt.dt(b.exportedAt)) : 'لم يُصدَّر') }],
        empty: { icon: 'coins', title: 'لا دفعات بعد', text: run.status === 'released' ? '' : 'تُنشأ الدفعات عند إطلاق الصرف من دورة المرتبات.' } });
      return h('div.sap-pay-stack', {}, ORD[run.status] < ORD.released && run.type !== 'reversal' ? SA.alert('info', h('b', {}, 'الدورة ' + run.id + ' في حالة «' + (RUN_ST[run.status] || [run.status])[0] + '». '), 'الصرف يبدأ بعد القفل والإطلاق — ', openLink('افتح الدورة', SA.href('hr/payroll/' + run.id))) : null, run.type === 'reversal' ? SA.alert('info', 'مستند عكس — لا دفعات صرف؛ تُرحَّل آثاره عبر المالية {Open}.') : null,
        h('div.sap-pay-totals', {}, [['بنك', T.bankP, T.bankN], ['نقدي', T.cashP, T.cashN], ['محجوز', T.holdP, T.holdN], ['الصافي', T.net, T.count, true]].map((x) => h('div.sap-pay-tot' + (x[3] ? '.is-net' : ''), {}, h('span', {}, x[0] + ' · ' + x[2] + ' سطر'), h('b', {}, AT(x[1]))))),
        h('div.sap-pay-footcheck' + (ok ? '.is-ok' : '.is-bad'), {}, SA.icon(ok ? 'checkcircle' : 'xcircle', 'icon-sm'), 'BR-PAY-01: بنك + نقدي + محجوز = صافي الدورة ' + (ok ? '✓ متطابق' : '✗ غير متطابق')),
        SA.card({ title: 'دفعات الصرف' }, h('div.sap-tablecard-wrap', {}, t.el)),
        SA.card({ title: 'سند الصرف PV- (المالية)', tags: SA.tag('open', 'Open') }, SA.kv([['الحالة', run.pv && run.pv.id ? SA.chip('مربوط', 'success') : SA.openValue('غير مربوط')], ['رقم السند', run.pv && run.pv.id ? code(run.pv.id) : '—'], ['من يملك التنفيذ', 'المالية — إنشاء/اعتماد/تنفيذ صلاحيات منفصلة (بند 42)']]), ORD[run.status] >= ORD.released && !(run.pv && run.pv.id) ? h('div.sap-pay-actions', {}, SA.btn({ label: 'ربط سند PV-', icon: 'link', kind: 'ghost', onClick: () => openLinkPV(run) })) : null),
        SA.card({ title: 'نشر مفردات المرتب' }, run.published ? SA.alert('success', 'نُشرت ' + run.published.count + ' مفردة في ' + SA.fmt.dt(run.published.at)) : h('p.t-muted', {}, ORD[run.status] >= ORD.released ? 'جاهزة للنشر من تبويب «مفردات المرتب».' : 'تُنشر بعد إطلاق الصرف.')), h('p.sap-hint', {}, specLink('scr-pay-01')));
    }, ['payrollRuns', 'payBatches', 'ui.payTick']);
  }
  function tabBank(panel, setActions, S) {
    const st1 = { full: false };
    return SA.live(panel, () => {
      const run = pickRun(S.run); if (!run) return SA.empty({ icon: 'download2', title: 'لا دورة' }); const L = bankLines(run); const f = fileHeaderBody(run, L, st1.full); const pc = preChecks(run); const P0 = bankProfile(); const b = batchesOf(run).find((x) => x.kind === 'bank' && !x.retryOf);
      setActions([SA.btn({ label: 'تصدير ملف التحويل', icon: 'download2', kind: 'primary', perm: 'hr.payments.export', reason: run.status !== 'released' ? 'بعد إطلاق الصرف' : '', onClick: () => exportBank(run) })]);
      const pre = h('pre.sap-pay-file', { dir: 'ltr', tabIndex: 0, 'aria-label': 'معاينة ملف التحويل' }, f.head + '\n' + f.det.join('\n') + '\nT|' + f.count + '|' + (f.tot / 100).toFixed(2) + '|' + (b && b.hash ? b.hash : '(تُحسب عند التصدير SHA-256)'));
      return h('div.sap-pay-stack', {}, SA.alert('warning', h('b', {}, 'بروفايل عام (Generic CSV) — ليس مواصفة بنك. '), 'صيغ البنوك (الأهلي/مصر/CIB) ', SA.openValue('Open'), ' حتى توفر المالية المواصفات الرسمية؛ لا ادعاء تكامل بنكي (BR-PAY-03).'),
        SA.card({ title: 'خيارات البروفايل', actions: [SA.btn({ label: 'تعديل', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'hr.settings.edit', onClick: () => editBankProfile() })] }, SA.kv([['الترميز', { utf8bom: 'UTF-8 مع BOM', utf8: 'UTF-8', win1256: 'Windows-1256' }[P0.encoding]], ['الفاصل', { ',': 'فاصلة', semicolon: 'فاصلة منقوطة', tab: 'Tab' }[P0.delimiter] || P0.delimiter], ['الفاصل العشري', P0.decimal === 'comma' ? 'فاصلة' : 'نقطة'], ['لغة اسم المستفيد', P0.nameLang === 'ar' ? 'عربي' : 'لاتيني'], ['حد السجلات/الملف', P0.maxRecords == null ? SA.openValue() : String(P0.maxRecords)], ['حساب المدين', P0.debitAccountMasked]])),
        SA.card({ title: 'الفحوصات المسبقة' }, h('ul.sap-pay-ctl', {}, pc.map((c) => h('li.' + (c[1] ? 'is-ok' : 'is-bad'), {}, SA.icon(c[1] ? 'checkcircle' : 'xcircle', 'icon-sm'), h('span', {}, c[0]), SA.chip(c[1] ? 'سليم' : 'فشل', c[1] ? 'success' : 'danger'))))),
        SA.card({ title: 'معاينة الملف · ' + L.length + ' سجل', tags: run.status === 'released' ? null : SA.chip('معاينة قبل الإطلاق', 'warning'), actions: [SA.can('hr.pii.reveal') ? SA.btn({ label: st1.full ? 'إخفاء الحسابات' : 'كشف الحسابات كاملة (يُسجَّل)', icon: st1.full ? 'eyeoff' : 'eye', kind: 'ghost', size: 'sm', onClick: () => { st1.full = !st1.full; if (st1.full) aud('HR.EMPLOYEE.PII_REVEALED', { type: 'payment_batch', id: run.id, label: 'حسابات ملف البنك' }, { reason: 'معاينة ملف التحويل' }); S.tick(); } }) : null] }, canWages() ? pre : SA.denied({ perm: 'hr.salary.view', title: 'مبالغ الملف سرية', text: 'تحتاج hr.salary.view لرؤية المعاينة.', home: false })),
        h('p.sap-hint', {}, SA.icon('lock', 'icon-sm'), h('span', {}, 'أرقام الحسابات مقنّعة (آخر 4 أرقام) والكشف الكامل بـ', code('hr.pii.reveal'), ' ويُسجَّل. ', specLink('scr-pay-02'))));
    }, ['payrollRuns', 'payBatches', 'payProfiles', 'settings.hrPayroll', 'ui.payTick']);
  }
  function editBankProfile() {
    if (!SA.can('hr.settings.edit')) { SA.toast(NOPERM('hr.settings.edit'), 'warn'); return; } const P0 = bankProfile();
    const f = { enc: field({ name: 'enc', label: 'الترميز', type: 'select', value: P0.encoding, options: [['utf8bom', 'UTF-8 مع BOM'], ['utf8', 'UTF-8'], ['win1256', 'Windows-1256']] }), del: field({ name: 'del', label: 'الفاصل', type: 'select', value: P0.delimiter, options: [[',', 'فاصلة'], ['semicolon', 'فاصلة منقوطة'], ['tab', 'Tab']] }), dec: field({ name: 'dec', label: 'الفاصل العشري', type: 'select', value: P0.decimal, options: [['dot', 'نقطة'], ['comma', 'فاصلة']] }), reason: field({ name: 'reason', label: 'السبب', type: 'textarea', rows: 2, required: true }) };
    formModal({ title: 'بروفايل التصدير العام', icon: 'settings', fields: Object.keys(f).map((k) => f[k]), async onSubmit(v) { await SA.api(() => { st.update('settings.hrPayroll', (x) => { x.bankProfile = Object.assign({}, x.bankProfile, { encoding: v.enc, delimiter: v.del, decimal: v.dec }); }); aud('HR.PAYROLL.SETTINGS_CHANGED', { type: 'settings', id: 'hrPayroll.bankProfile', label: 'بروفايل الملف البنكي' }, { reason: v.reason, before: { enc: P0.encoding, del: P0.delimiter, dec: P0.decimal }, after: { enc: v.enc, del: v.del, dec: v.dec } }); }); SA.toast('حُفظ البروفايل', 'success'); return true; } });
  }
  function tabCash(panel, setActions, S) {
    return SA.live(panel, () => {
      const run = pickRun(S.run); if (!run) return SA.empty({ icon: 'coins', title: 'لا دورة' }); const batch = batchesOf(run).find((b) => b.kind === 'cash' && !b.retryOf); const c = cashSheet(run, batch); const total = sum(c.rows, (x) => x.amountP);
      setActions([SA.btn({ label: 'تصدير كشف الصرف النقدي', icon: 'download2', kind: 'primary', perm: 'hr.payments.export', onClick: () => exportCash(run, batch) })]);
      if (!canWages()) return SA.denied({ perm: 'hr.salary.view', title: 'مبالغ الصرف النقدي سرية', text: 'تحتاج hr.salary.view لرؤية الكشف.', home: false });
      const denomTot = c.Ds.map((d, i) => sum(c.rows, (x) => x.g[i])); const fracTot = sum(c.rows, (x) => x.frac); const chk = sum(c.Ds.map((d, i) => d * denomTot[i] * 100), (x) => x) + fracTot === total;
      return h('div.sap-pay-stack', {}, SA.alert('info', 'كشف موقّع وشاهد وتحقق من الهوية؛ غير المستلم يُعاد للخزينة بمحضر شخصين. تقريب الصرف لأقرب جنيه ', SA.openValue('Open'), ' — تظهر الكسور منفصلة.'),
        c.rows.length ? h('div.table-wrap.sap-pay-scroll', {}, h('table.table.sap-pay-sheet', {}, h('thead', {}, h('tr', {}, ['م', 'الرقم', 'الاسم', 'القسم', 'المبلغ'].concat(c.Ds.map((d) => 'فئة ' + d)).concat(['كسور', 'التوقيع/البصمة', 'الشاهد', 'الحالة', '']).map((x) => h('th', {}, x)))), h('tbody', {}, c.rows.map((x, i) => h('tr', {}, h('td', {}, h('span.num', {}, i + 1)), h('td', {}, x.empNo), h('td', {}, x.name), h('td', {}, deptName(x.dept)), h('td', {}, h('b', {}, A(x.amountP))), x.g.map((n) => h('td', {}, h('span.num', {}, n || '·'))), h('td', {}, h('span.num', {}, x.frac ? (x.frac / 100).toFixed(2) : '·')), h('td.sap-pay-sign', {}, ''), h('td.sap-pay-sign', {}, ''), h('td', {}, SA.chip((LINE_ST[x.status] || [x.status])[0], (LINE_ST[x.status] || [0, 'neutral'])[1])), h('td', {}, batch && x.status === 'pending' ? SA.btn({ label: 'تسجيل الاستلام', size: 'sm', kind: 'ghost', perm: 'hr.payments.export', onClick: () => recordLine(batch, x.empId, 'received') }) : null))), h('tr.sap-pay-grand', {}, h('td', { colSpan: 4 }, 'الإجمالي · ' + c.rows.length + ' عامل'), h('td', {}, AT(total)), denomTot.map((n) => h('td', {}, h('span.num', {}, n))), h('td', {}, h('span.num', {}, (fracTot / 100).toFixed(2))), h('td', { colSpan: 4 }))))) : SA.empty({ icon: 'coins', title: 'لا صرف نقدي في هذه الدورة' }),
        c.rows.length ? h('div.sap-pay-footcheck' + (chk ? '.is-ok' : '.is-bad'), {}, SA.icon(chk ? 'checkcircle' : 'xcircle', 'icon-sm'), 'إجمالي الفئات + الكسور = إجمالي الكشف ' + (chk ? '✓' : '✗')) : null,
        batch && batch.lines.some((x) => x.status === 'pending') ? h('div.sap-pay-actions', {}, SA.btn({ label: 'تسجيل استلام الكل', icon: 'checkcircle', kind: 'ghost', perm: 'hr.payroll.release', onClick: () => recordAll(batch) })) : null, h('p.sap-hint', {}, specLink('scr-pay-04')));
    }, ['payrollRuns', 'payBatches', 'settings.hrPayroll', 'ui.payTick']);
  }
  function tabStatus(panel, setActions, S) {
    setActions([]); const view = {};
    return SA.live(panel, () => {
      const run = pickRun(S.run); if (!run) return SA.empty({ icon: 'coins', title: 'لا دورة' }); const bs = batchesOf(run);
      const rows = () => { const o = []; batchesOf(run).forEach((b) => b.lines.forEach((l) => o.push(Object.assign({ id: b.id + ':' + l.empId, batch: b }, l)))); return o; };
      const t = SA.table({ caption: 'حالة الصرف', rows, pageSize: 10, initial: view.s, onChange: (s) => { view.s = s; }, search: { placeholder: 'ابحث بالموظف أو الدفعة', keys: ['name', 'empNo', (r) => r.batch.id] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(LINE_ST).map((k) => [k, LINE_ST[k][0]]) }, { key: 'kind', label: 'النوع', options: [['bank', 'بنك'], ['cash', 'نقدي']], test: (r, v) => r.batch.kind === v }],
        columns: [{ key: 'b', label: 'الدفعة', render: (r) => h('span.t-dense', {}, r.batch.id) }, { key: 'name', label: 'الموظف', sort: true, render: (r) => h('div', {}, h('b', {}, r.name), h('div.t-caption', {}, r.empNo + ' · ' + LN_BATCH_KIND[r.batch.kind])) }, { key: 'amt', label: 'المبلغ', render: (r) => A(r.amountP) }, { key: 'acc', label: 'الحساب', render: (r) => (r.batch.kind === 'bank' ? maskAcc(profileOf(r.empId)) : 'نقدي') }, { key: 'status', label: 'الحالة', render: (r) => SA.chip((LINE_ST[r.status] || [r.status])[0], (LINE_ST[r.status] || [0, 'neutral'])[1]) }, { key: 'note', label: 'ملاحظة', render: (r) => r.note || '—' }],
        rowActions: (r) => [{ label: r.batch.kind === 'bank' ? 'تسجيل: تم الدفع' : 'تسجيل: تم الاستلام', icon: 'checkcircle', hidden: r.status !== 'pending', onClick: () => recordLine(r.batch, r.empId, r.batch.kind === 'bank' ? 'paid' : 'received') }, { label: 'تسجيل: رفض البنك', icon: 'xcircle', danger: true, hidden: r.status !== 'pending' || r.batch.kind !== 'bank', onClick: () => recordLine(r.batch, r.empId, 'rejected') }, { label: 'تحديث الحساب البنكي', icon: 'edit', hidden: r.status !== 'rejected', onClick: () => { S.go('accounts'); } }],
        empty: { icon: 'coins', title: 'لا أسطر صرف', text: 'تظهر بعد إطلاق الصرف.' } });
      return h('div.sap-pay-stack', {}, h('div.sap-pay-actions', {}, bs.filter((b) => b.lines.some((l) => l.status === 'pending')).map((b) => SA.btn({ label: 'نجاح كل ' + b.id, icon: 'checkcircle', kind: 'ghost', size: 'sm', perm: 'hr.payroll.release', onClick: () => recordAll(b) })), bs.filter((b) => b.lines.some((l) => l.status === 'rejected')).map((b) => SA.btn({ label: 'إعادة محاولة المرفوض في ' + b.id, icon: 'refresh', kind: 'primary', size: 'sm', perm: 'hr.payroll.release', onClick: () => retryBatch(b) }))), needWages(), h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'إعادة المحاولة بدفعة جديدة لا تعدّل الأصلية (BR-PAY-17). تسجيل رد البنك يدوي — لا تكامل بنكي. ', specLink('scr-pay-03'))));
    }, ['payBatches', 'payrollRuns', 'ui.payTick']);
  }
  function tabAccounts(panel, setActions, S) {
    setActions([]); const view = {};
    return SA.live(panel, () => {
      applyDueBankChanges(); const pend = col('bankChanges').filter((c) => c.status === 'pending' || c.status === 'holding'); const hist = col('bankChanges').filter((c) => c.status === 'effective' || c.status === 'rejected');
      const t = SA.table({ caption: 'الحسابات البنكية', rows: () => emps().filter((e) => e.status !== 'terminated').map((e) => Object.assign({ id: e.id, e, pr: profileOf(e.id), name: e.name })), pageSize: 10, initial: view.s, onChange: (s) => { view.s = s; }, search: { placeholder: 'ابحث بالاسم', keys: ['name'] }, filters: [{ key: 'm', label: 'الطريقة', options: [['bank', 'بنك'], ['cash', 'نقدي']], test: (r, v) => r.pr && r.pr.method === v }, { key: 's', label: 'الحالة', options: [['miss', 'ناقص'], ['pend', 'تغيير معلّق']], test: (r, v) => (v === 'miss' ? r.pr && r.pr.method === 'bank' && !r.pr.last4 : pend.some((c) => c.employeeId === r.id)) }],
        columns: [{ key: 'name', label: 'الموظف', sort: true, render: (r) => h('div.sap-usercell', {}, SA.avatar(r.name), h('div', {}, h('b', {}, r.name), h('small', {}, r.e.empNo)))}, { key: 'm', label: 'الطريقة', render: (r) => SA.chip(r.pr && r.pr.method === 'cash' ? 'نقدي' : 'بنك', 'neutral') }, { key: 'bank', label: 'البنك', render: (r) => (r.pr && r.pr.bank) || '—' }, { key: 'acc', label: 'الحساب (مقنّع)', render: (r) => h('span.num', {}, maskAcc(r.pr)) },
          { key: 'st', label: 'الحالة', render: (r) => (r.pr && r.pr.method === 'bank' && !r.pr.last4 ? SA.chip('ناقص — يمنع الدفعة', 'danger') : pend.some((c) => c.employeeId === r.id) ? SA.chip('تغيير معلّق', 'warning') : r.pr && r.pr.method === 'cash' ? SA.chip('نقدي', 'neutral') : SA.chip('موثّق', 'success')) }],
        rowActions: (r) => [{ label: 'تغيير الحساب البنكي', icon: 'edit', onClick: () => openBankChange(r.e) }, { label: 'كشف الحساب كاملًا (يُسجَّل)', icon: 'eye', hidden: !(r.pr && r.pr.last4), onClick: () => { if (!SA.can('hr.pii.reveal')) { SA.toast(NOPERM('hr.pii.reveal'), 'warn'); return; } aud('HR.EMPLOYEE.PII_REVEALED', { type: 'employee', id: r.id, label: r.name }, { reason: 'عرض الحساب البنكي' }); SA.modal({ title: 'الحساب البنكي — ' + r.name, icon: 'lock', size: 'sm', body: h('div.sap-confirm', {}, h('code.sap-pay-code', { dir: 'ltr' }, r.pr.account), h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), 'سُجّل هذا الكشف باسمك (HR.EMPLOYEE.PII_REVEALED).')) }); } }] });
      const chg = (c) => h('tr', {}, h('td', {}, h('b', {}, empName(c.employeeId)), h('div.t-caption', {}, c.id)), h('td', {}, h('span.num', {}, c.oldLast4 ? '••••' + c.oldLast4 + ' ← ' : ''), h('span.num', {}, '••••' + c.newLast4)), h('td', {}, SA.userName(c.requestedBy), h('div.t-caption', {}, SA.fmt.dt(c.requestedAt))), h('td', {}, c.status === 'pending' ? SA.chip('بانتظار شخص ثانٍ', 'warning') : h('span', {}, SA.chip('حجز حتى ' + SA.fmt.dt(c.effectiveAt), 'info'))), h('td', {}, c.proof),
        h('td', {}, c.status === 'pending' ? h('div.sap-pay-actions', {}, SA.btn({ label: 'اعتماد', size: 'sm', kind: 'primary', perm: 'hr.pii.reveal', reason: c.requestedBy === meId() ? 'فصل المهام: طالب التغيير لا يعتمده' : '', onClick: () => decideBankChange(c, true) }), SA.btn({ label: 'رفض', size: 'sm', kind: 'ghost', perm: 'hr.pii.reveal', reason: c.requestedBy === meId() ? 'فصل المهام' : '', onClick: () => decideBankChange(c, false) })) : SA.btn({ label: 'تفعيل الآن (تجريبي)', size: 'sm', kind: 'ghost', perm: 'hr.settings.edit', onClick: () => { activateBankChange(c, true); SA.toast('فُعّل التغيير الآن (تسريع تجريبي لمدة الحجز)', 'info'); } })));
      return h('div.sap-pay-stack', {}, SA.alert('warning', h('b', {}, 'ضبط تغيير الحساب: '), 'طالب ≠ معتمد · إثبات إلزامي · مطابقة الاسم · حجز ' + ((st.get('settings.hrPayroll') || {}).bankHoldHours || 24) + ' ساعة · إشعار عاجل للموظف. لا يسري على دفعة مُجهَّزة.'),
        pend.length ? SA.card({ title: 'طلبات تغيير معلّقة (' + pend.length + ')', flush: true }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الموظف', 'الحساب', 'الطالب', 'الحالة', 'الإثبات', ''].map((x) => h('th', {}, x)))), h('tbody', {}, pend.map(chg))))) : null,
        h('div.sap-tablecard-wrap', {}, t.el), hist.length ? h('p.t-caption', {}, 'آخر التغييرات: ' + hist.slice(0, 3).map((c) => empName(c.employeeId) + ' (' + (c.status === 'effective' ? 'سرى' : 'رُفض') + ')').join('، ')) : null, h('p.sap-hint', {}, specLink('scr-pay-05')));
    }, ['payProfiles', 'bankChanges', 'employees']);
  }
  /* payslips */
  function slipHtml(run, l) { const rows = (arr) => arr.map((x) => '<tr><td>' + SA.esc(x[0]) + '</td><td>' + SA.esc(x[1]) + '</td><td dir="ltr" style="text-align:left">' + fp(x[2]) + '</td></tr>').join(''); const d = slipLines(run, l); const wm = 'سري · ' + SA.userName(meId()) + ' · ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
    return '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>' + slipNo(run, l) + '</title><body style="font-family:Tahoma,Arial;margin:32px;position:relative"><div style="position:absolute;inset:0;opacity:.07;font-size:42px;transform:rotate(-24deg);display:flex;flex-wrap:wrap;gap:60px;pointer-events:none">' + Array(18).join('<span>' + SA.esc(wm) + '</span>') + '</div><h2>مفردات مرتب — ' + slipNo(run, l) + ' <small style="background:#fdecea;color:#b3000a;padding:2px 10px;border-radius:99px">سري</small></h2><p>' + SA.esc(l.name) + ' · ' + SA.esc(l.empNo) + ' · ' + PER.label(run.period) + '</p><h3>الاستحقاقات</h3><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">' + rows(d.earn) + '</table><h3>الاستقطاعات</h3><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">' + rows(d.ded) + '</table><h2>الصافي: ' + fp(l.net) + ' ج.م</h2><p style="color:#666">مستند داخلي سري — ليس مستندًا إلكترونيًا رسميًا (بند 28). ' + SA.esc(wm) + '</p></body></html>'; }
  function slipLines(run, l) {
    const inp = run.inputs && run.inputs.byEmp ? run.inputs.byEmp[l.empId] : null; const earn = l.comps.map((c) => [c.name, c.qty || '', c.p]); const ded = [['التأمينات الاجتماعية (حصة العامل)', 'الأجر التأميني ' + fp(l.insWage) + ' × ' + run.rules.insurance.emp_rate + '%', l.insEmp], ['ضريبة كسب العمل', run.rules.tax.id, l.tax]];
    if (l.penalty) ded.push(['جزاء مالي', (inp ? inp.deds.filter((d) => d.type === 'penalty' || d.type === 'damage').map((d) => d.id).join('، ') : ''), l.penalty]); if (l.loan) ded.push(['قسط سلفة', (l.loanApplied || []).map((r) => r.loanId + ' #' + r.n).join('، '), l.loan]); if (l.creditor) ded.push(['خصم دائن / نفقة', 'م114', l.creditor]); return { earn, ded, inp };
  }
  function openPayslip(run, l, slip) {
    if (!canWages()) { SA.drawer({ title: 'مفردة مرتب', subtitle: 'سري', body: SA.denied({ perm: 'hr.salary.view', title: 'المفردة سرية', text: 'تحتاج hr.salary.view. الموظف يرى مفردته من «خدماتي».', home: false }) }); return; }
    const k = 'slip:' + (slip ? slip.id : slipNo(run, l)); if (!viewed.has(k)) { viewed.add(k); aud('HR.PAYSLIP.VIEWED', { type: 'payslip', id: slipNo(run, l), label: l.name }, { reason: 'اطلاع HR (بدون المحتوى)' }); if (slip) st.update('payslips', (arr) => { const x = arr.find((q) => q.id === slip.id && q.rev === slip.rev); if (x && x.viewedBy.indexOf(meId()) < 0) x.viewedBy.push(meId()); }); }
    const d = slipLines(run, l); const e = empById(l.empId); const checks = payslipChecks(run, l); const wm = 'سري · ' + SA.userName(meId()) + ' · ' + SA.fmt.date(new Date().toISOString());
    const tbl = (title, rows, tot) => h('div', {}, h('h3.sap-sub', {}, title), h('div.table-wrap', {}, h('table.table', {}, h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r[0]), h('td.t-caption', {}, r[1]), h('td', {}, h('span.sap-pay-amt', fp(r[2]))))), h('tr.sap-pay-total', {}, h('td', { colSpan: 2 }, 'الإجمالي'), h('td', {}, h('b.sap-pay-amt', {}, fp(tot))))))));
    const body = h('div.sap-pay-slip', {}, h('div.sap-pay-wm', { 'aria-hidden': 'true' }, Array.from({ length: 24 }, () => h('span', {}, wm))), h('div.sap-pay-slip-in', {}, h('div.sap-pay-slip-head', {}, h('div', {}, h('b', {}, 'مفردات مرتب'), h('div.t-caption', {}, slipNo(run, l) + ' · الدورة ' + run.id)), h('span.sap-pay-secretbadge', {}, SA.icon('lock', 'icon-sm'), 'سري')), h('p.t-caption', {}, 'بيانات الشركة الرسمية: Placeholder حتى بند 11 — لا ختم تجريبي على نسخة قابلة للاستخدام.'),
      SA.kv([['الاسم', l.name], ['الرقم الوظيفي', l.empNo], ['القسم', deptName(l.deptId)], ['تاريخ التعيين', e ? SA.fmt.date(e.hireDate) : '—'], ['الشهر', PER.label(run.period)], ['أيام الدفع', l.payDays + ' / ' + run.rules.period.month_days], ['الأوفرتايم (نهاري/ليلي)', d.inp ? d.inp.otDay + ' / ' + d.inp.otNight + ' ساعة' : '—'], ['طريقة الصرف', { bank: 'بنك ' + maskAcc(profileOf(l.empId)), cash: 'نقدي', hold: 'محجوز' }[l.method]]]),
      tbl('الاستحقاقات', d.earn, l.gross), tbl('الاستقطاعات', d.ded, l.totalDed), h('div.sap-pay-net', {}, h('span', {}, 'صافي المرتب'), h('b.sap-pay-amt', {}, fp(l.net) + ' ج.م')), h('p.t-caption', {}, 'لا تُعرض حصة صاحب العمل وتكلفتها (داخلية). الإجماليات السنوية حتى تاريخه [New]: ' + fp(sum(col('payrollRuns').filter((r) => r.lines && r.period.slice(0, 4) === run.period.slice(0, 4) && r.period <= run.period && (r.status === 'released' || r.status === 'locked' || r.id === run.id)), (r) => (r.lines.find((x) => x.empId === l.empId) || { gross: 0 }).gross)) + ' استحقاق'),
      h('h3.sap-sub', {}, 'ضوابط التطابق قبل النشر'), h('ul.sap-pay-ctl', {}, checks.map((c) => h('li.' + (c[2] ? 'is-ok' : 'is-bad'), {}, SA.icon(c[2] ? 'checkcircle' : 'xcircle', 'icon-sm'), h('b', {}, c[0]), h('span', {}, c[1]), SA.chip(c[2] ? 'سليم' : 'فرق', c[2] ? 'success' : 'danger'))))));
    SA.drawer({ title: l.name, subtitle: slipNo(run, l), size: 'lg', body, foot: [SA.btn({ label: 'تنزيل نسخة بعلامة مائية', icon: 'download2', kind: 'ghost', perm: 'hr.export.sensitive', onClick: async () => { if (!(await SA.stepUp('audit.export', { force: true, title: 'تنزيل مفردة', text: 'أدخل كلمة مرورك أو كود التحقق.' }))) return; SA.download(slipNo(run, l) + '.html', slipHtml(run, l), 'text/html'); aud('HR.EXPORT.SENSITIVE', { type: 'payslip', id: slipNo(run, l), label: l.name }, { reason: 'تنزيل مفردة بعلامة مائية' }); SA.toast('نُزّلت المفردة بعلامة مائية باسمك', 'success'); } })] });
  }
  function tabSlips(panel, setActions, S) {
    const view = {};
    return SA.live(panel, () => {
      const run = pickRun(S.run); if (!run) return SA.empty({ icon: 'doc', title: 'لا دورة' });
      setActions([SA.btn({ label: 'نشر المفردات', icon: 'doc', kind: 'primary', perm: 'hr.payroll.release', reason: run.published ? 'منشورة بالفعل' : run.status !== 'released' ? 'بعد إطلاق الصرف' : '', onClick: () => actPublish(run) })]);
      const slips = col('payslips').filter((s) => s.runId === run.id && s.rev === 0);
      const t = SA.table({ caption: 'مفردات المرتب', rows: () => run.lines.map((l) => ({ id: l.empId, l, name: l.name, slip: col('payslips').find((s) => s.runId === run.id && s.empId === l.empId && s.rev === 0) || null, ok: payslipChecks(run, l).every((c) => c[2]) })), pageSize: 10, initial: view.s, onChange: (s) => { view.s = s; }, search: { placeholder: 'ابحث بالاسم أو الرقم', keys: (r, q) => (r.name + ' ' + r.l.empNo).toLowerCase().indexOf(q) >= 0 }, filters: [{ key: 'p', label: 'النشر', options: [['yes', 'منشور'], ['no', 'غير منشور']], test: (r, v) => (v === 'yes' ? !!r.slip : !r.slip) }],
        columns: [{ key: 'name', label: 'الموظف', sort: true, render: (r) => h('div', {}, h('b', {}, r.name), h('div.t-caption', {}, r.l.empNo + ' · ' + deptName(r.l.deptId))) }, { key: 'no', label: 'رقم المفردة', render: (r) => code(slipNo(run, r.l)) }, { key: 'net', label: 'الصافي', render: (r) => A(r.l.net) }, { key: 'ok', label: 'ضوابط P1–P8', render: (r) => chipOk(r.ok ? 'سليمة' : 'فرق', r.ok) }, { key: 'st', label: 'النشر', render: (r) => (r.slip ? SA.chip('منشورة ' + SA.fmt.date(r.slip.publishedAt), 'info') : SA.chip('غير منشورة', 'neutral')) }, { key: 'v', label: 'اطلاعات', render: (r) => (r.slip ? h('span.num', {}, r.slip.viewedBy.length) : '—') }],
        onRowClick: (r) => openPayslip(run, r.l, r.slip), rowActions: (r) => [{ label: 'فتح المفردة', icon: 'doc', onClick: () => openPayslip(run, r.l, r.slip) }] });
      return h('div.sap-pay-stack', {}, SA.alert('info', h('b', {}, 'المفردة سرية: '), 'شارة «سري» وعلامة مائية باسم المشاهد؛ لا تُرسل الأرقام في إشعار أو إيميل أو واتساب؛ والمشاهدة تُسجَّل بدون المحتوى (BR-PAY-10). تغيير مفردة منشورة = إصدار -R1 بنفس الرقم.'), needWages(), h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, slips.length + ' منشورة من ' + run.lines.length + '. ', specLink('scr-pay-08'))));
    }, ['payslips', 'payrollRuns', 'ui.payTick']);
  }
  function tabPayProfile(panel, setActions) {
    setActions([]);
    return SA.live(panel, () => h('div.sap-pay-stack', {}, SA.card({ title: 'طرق الصرف' }, SA.kv([['بنك (تحويل)', SA.chip('مفعّل', 'success')], ['نقدي (كشف موقّع)', SA.chip('مفعّل', 'success')], ['محجوز', SA.chip('مفعّل', 'success')], ['بطاقة مرتب / محفظة لعمال بلا بنك', SA.openValue('Open — قرار مالي D5')]]), h('p.sap-hint', {}, 'التصميم يدعم طرق صرف بديلة كنوع ولا يفترض مزوّدًا (BR-PAY-09).')),
      SA.card({ title: 'بروفايلات البنوك' }, SA.kv([['البروفايل العام (Generic CSV)', SA.chip('جاهز', 'success')], ['الأهلي المصري / بنك مصر / CIB', SA.openValue('Open — بانتظار مواصفات المالية')], ['تقريب الصرف النقدي', SA.openValue('Open')], ['مدة حجز تغيير الحساب', ((st.get('settings.hrPayroll') || {}).bankHoldHours || 24) + ' ساعة (Pending)']])), h('p.sap-hint', {}, specLink('scr-pay-11'))), ['settings.hrPayroll']);
  }
  reg('hr-payments', function (root, ctx) {
    return loadScreen(root, ctx, 'الصرف ومفردات المرتب', () => {
      applyDueBankChanges(); const actions = h('div.sap-actions'); const setActions = (n) => { SA.clear(actions); n.forEach((x) => actions.append(x)); }; const host = h('div'); const S = { run: ctx.params.run || null, tick: () => st.set('ui.payTick', Date.now()), go: null };
      const picker = h('div.sap-pay-picker'); let tabsApi = null; S.go = (id) => tabsApi && tabsApi.show(id);
      root.append(SA.pageHead({ title: 'الصرف ومفردات المرتب', desc: 'من الدورة المعتمدة: ملف تحويل بنكي (بروفايل عام) · كشف صرف نقدي بالفئات · تتبع الحالة وإعادة المحاولة · ضبط تغيير الحساب · نشر المفردات بشارة «سري» · ربط سند PV- للمالية. لا تكامل بنكي.', tags: [SA.tag('pending', 'بند 42 · D5'), SA.tag('open', 'ملفات البنك Open')], actions }), picker, host);
      const stopPick = SA.live(picker, () => { const runs = col('payrollRuns').filter((r) => r.lines).sort((a, b) => (a.period < b.period ? 1 : a.id < b.id ? 1 : -1)); const cur = pickRun(S.run); if (cur) S.run = cur.id; const sel = h('select.select', { 'aria-label': 'الدورة', onchange: (e) => { S.run = e.target.value; S.tick(); } }, runs.map((r) => h('option', { value: r.id, selected: cur && r.id === cur.id }, r.id + ' — ' + (RUN_ST[r.status] || [r.status])[0]))); return h('div.sap-pay-basis', {}, h('label', {}, h('b', {}, 'الدورة'), ' ', sel), cur ? runChip(cur) : null, cur ? openLink('فتح الدورة', SA.href('hr/payroll/' + cur.id)) : null); }, ['payrollRuns', 'ui.payTick']);
      tabsApi = tabbed(host, [{ id: 'dash', label: 'لوحة الصرف', icon: 'coins', build: (p) => tabPayDash(p, setActions, S) }, { id: 'bank', label: 'ملف البنك', icon: 'download2', build: (p) => tabBank(p, setActions, S) }, { id: 'cash', label: 'الصرف النقدي', icon: 'receipt', build: (p) => tabCash(p, setActions, S) }, { id: 'status', label: 'الحالة وإعادة المحاولة', icon: 'refresh', build: (p) => tabStatus(p, setActions, S) }, { id: 'accounts', label: 'الحسابات البنكية', icon: 'lock', build: (p) => tabAccounts(p, setActions, S) }, { id: 'slips', label: 'مفردات المرتب', icon: 'doc', build: (p) => tabSlips(p, setActions, S) }, { id: 'settings', label: 'البروفايلات', icon: 'settings', build: (p) => tabPayProfile(p, setActions) }], ctx.params.tab || 'dash');
      return () => { stopPick(); tabsApi.cleanup(); };
    });
  });

  /* ═══════════════════════════════════════════ HR-17 · التأمينات والضريبة والإقرارات (hr-gov) ═══════════════════════════════════════════ */
  const closedRuns = () => col('payrollRuns').filter((r) => r.lines && (!r.type || r.type === 'regular') && (r.status === 'locked' || r.status === 'released')).sort((a, b) => (a.period < b.period ? 1 : -1));
  const KIND_G = { insurance: ['التأمينات', 'info'], tax: ['الضرائب', 'warning'], internal: ['داخلي', 'neutral'] }; const FREQ_G = { monthly: 'شهري', event: 'عند الحدث', annual: 'سنوي', quarterly: 'ربع سنوي' };
  const DOC_G = { pending: ['Pending [Law]', 'warning'], unverified: ['غير موثّق — Open', 'danger'], internal: ['داخلي', 'neutral'], official: ['رسمي', 'success'] };
  const alloc = (total, weights) => { const sw = sum(weights); if (!sw) return weights.map(() => 0); const raw = weights.map((w) => total * w / sw); const fl = raw.map(Math.floor); let rest = total - sum(fl); const ord = raw.map((r, i) => [r - fl[i], i]).sort((a, b) => b[0] - a[0]); ord.forEach((o) => { if (rest > 0) { fl[o[1]]++; rest--; } }); return fl; };
  function nextDueOf(entry, run) {
    if (!entry.enabled) return { txt: 'غير مفعّل', kind: 'neutral' }; const lastP = run ? run.period : PER.add(PER.cur(), -1);
    if (entry.freq === 'monthly' && entry.day) { const per = PER.add(lastP, 1); const due = per + '-' + pad(entry.day); const done = col('govLog').some((g) => g.calendarId === entry.id && g.period === lastP); const dd = daysBetween(todayISO(), due);
      if (done) return { txt: 'تم التسليم', kind: 'success', due, period: lastP }; if (dd < 0) return { txt: 'متأخر ' + (-dd) + ' يوم', kind: 'danger', due, period: lastP }; if (dd <= 7) return { txt: 'قريب — بعد ' + dd + ' يوم', kind: 'warning', due, period: lastP }; return { txt: 'قادم', kind: 'info', due, period: lastP }; }
    return { txt: entry.due || 'غير مُعدّ', kind: 'open', due: null };
  }
  function openGovEntry(e) {
    if (!SA.can('hr.gov.edit')) { SA.toast(NOPERM('hr.gov.edit'), 'warn'); return; } const isNew = !e; const cur = e || { title: '', kind: 'insurance', freq: 'monthly', day: null, due: '', doc: 'unverified', note: '', enabled: true };
    const f = { title: field({ name: 'title', label: 'الالتزام', value: cur.title, required: true }), kind: field({ name: 'kind', label: 'الجهة', type: 'select', value: cur.kind, options: Object.keys(KIND_G).map((k) => [k, KIND_G[k][0]]) }), freq: field({ name: 'freq', label: 'التكرار', type: 'select', value: cur.freq, options: Object.keys(FREQ_G).map((k) => [k, FREQ_G[k]]) }), day: field({ name: 'day', label: 'يوم الاستحقاق من الشهر التالي', type: 'number', value: cur.day, min: 1, max: 28, hint: 'اتركه فارغًا = غير مُعدّ (Open) — بدون حساب تواريخ.' }), due: field({ name: 'due', label: 'نص الموعد (للعرض)', value: cur.due || '' }), doc: field({ name: 'doc', label: 'مستوى التوثيق', type: 'select', value: cur.doc, options: Object.keys(DOC_G).map((k) => [k, DOC_G[k][0]]) }), note: field({ name: 'note', label: 'ملاحظة', type: 'textarea', rows: 2, value: cur.note }), enabled: field({ name: 'enabled', label: 'مفعّل في التقويم', type: 'switch', value: cur.enabled }), reason: field({ name: 'reason', label: 'سبب التعديل', type: 'textarea', rows: 2, required: !isNew }) };
    formModal({ title: isNew ? 'التزام جديد' : 'تعديل الالتزام', icon: 'clock', size: 'lg', fields: Object.keys(f).map((k) => f[k]), before: SA.alert('warning', 'كل موعد إعداد بتاريخ سريان؛ الاستمارات والمهل غير موثّقة تظهر Open ولا تُعرض كحقائق (BR-GOV-09).'), async onSubmit(v) { await SA.api(() => { const rec = { title: v.title, kind: v.kind, freq: v.freq, day: v.day == null ? null : Number(v.day), due: v.due, doc: v.doc, note: v.note, enabled: v.enabled }; if (isNew) st.insert('govCalendar', Object.assign({ id: 'GC-' + String(col('govCalendar').length + 1).padStart(2, '0') }, rec)); else st.patch('govCalendar', e.id, rec); aud('HR.GOV.CALENDAR_CHANGED', { type: 'gov_calendar', id: isNew ? 'new' : e.id, label: v.title }, { reason: v.reason, before: isNew ? null : SA.pick(e, ['day', 'due', 'doc', 'enabled']), after: SA.pick(rec, ['day', 'due', 'doc', 'enabled']) }); }); SA.toast('حُفظ الالتزام', 'success'); return true; } });
  }
  function openSubmission(entry, period) {
    if (!SA.can('hr.gov.edit')) { SA.toast(NOPERM('hr.gov.edit'), 'warn'); return; } const cal = col('govCalendar').filter((x) => x.enabled);
    const ob = field({ name: 'ob', label: 'الالتزام', type: 'select', required: true, value: entry ? entry.id : '', options: [['', 'اختر…']].concat(cal.map((c) => [c.id, c.title])) }), per = field({ name: 'period', label: 'الفترة المقصودة', type: 'month', value: period || (closedRuns()[0] ? closedRuns()[0].period : PER.add(PER.cur(), -1)), required: true }), date = field({ name: 'date', label: 'تاريخ التسليم', type: 'date', value: todayISO(), required: true }), ref = field({ name: 'ref', label: 'رقم الإيصال / المرجع', required: true }), proof = field({ name: 'proof', label: 'اسم ملف الإثبات', required: true, hint: 'مثل: receipt-8841.pdf — الإثبات يُحفظ مرجعًا (النموذج لا يرفع ملفات).' }), note = field({ name: 'note', label: 'ملاحظة', type: 'textarea', rows: 2 });
    formModal({ title: 'تسجيل تسليم يدوي', subtitle: 'السجل append-only: لا تعديل بعد «مُسلَّم» — التصحيح بسجل جديد', icon: 'checkcircle', fields: [ob, per, date, ref, proof, note], before: SA.alert('info', 'لا تكامل مع التأمينات (NOSI) أو الضرائب (ETA): يُسلَّم يدويًا بيد مفوّض ويُسجَّل هنا بإثباته (BR-GOV-01).'), confirmLabel: 'تسجيل التسليم',
      validate: (v) => (col('govLog').some((g) => g.calendarId === v.ob && g.period === v.period && !g.correctionOf) ? 'سُجّل تسليم لنفس الالتزام والفترة — أضف سجل تصحيح بدل التكرار.' : ''),
      async onSubmit(v) { const c = cal.find((x) => x.id === v.ob); let rec; await SA.api(() => { rec = { id: 'GS-' + String(col('govLog').length + 1).padStart(4, '0'), calendarId: c.id, title: c.title, period: v.period, deliveredBy: meId(), deliveredAt: v.date, reference: v.ref, proof: v.proof, note: v.note, correctionOf: null }; st.insert('govLog', rec, true); aud('HR.GOV.SUBMISSION_LOGGED', { type: 'gov_submission', id: rec.id, label: c.title + ' — ' + v.period }, { after: { reference: v.ref, proof: v.proof } }); }); SA.toast('سُجّل التسليم ' + rec.id, 'success'); return true; } });
  }
  function tabGovCal(panel, setActions) {
    setActions([SA.btn({ label: 'تسجيل تسليم', icon: 'checkcircle', kind: 'primary', perm: 'hr.gov.edit', onClick: () => openSubmission() })]);
    return SA.live(panel, () => {
      const run = closedRuns()[0]; const rows = () => col('govCalendar').map((e) => Object.assign({}, e, { nd: nextDueOf(e, run) }));
      const late = rows().filter((r) => r.nd.kind === 'danger').length, soon = rows().filter((r) => r.nd.kind === 'warning').length;
      const t = SA.table({ caption: 'تقويم الالتزامات', rows, pageSize: 10, search: { placeholder: 'ابحث', keys: ['title'] }, filters: [{ key: 'kind', label: 'الجهة', options: Object.keys(KIND_G).map((k) => [k, KIND_G[k][0]]) }],
        columns: [{ key: 'title', label: 'الالتزام', sort: true, render: (r) => h('div', {}, h('b', {}, r.title), h('div.t-caption', {}, r.note)) }, { key: 'kind', label: 'الجهة', render: (r) => SA.chip(KIND_G[r.kind][0], KIND_G[r.kind][1]) }, { key: 'freq', label: 'التكرار', render: (r) => FREQ_G[r.freq] }, { key: 'due', label: 'الموعد', render: (r) => (r.nd.due ? h('span', {}, SA.fmt.date(r.nd.due), h('div.t-caption', {}, r.due)) : (r.due ? h('span', {}, r.due) : SA.openValue())) },
          { key: 'doc', label: 'التوثيق', render: (r) => SA.chip(DOC_G[r.doc][0], DOC_G[r.doc][1]) }, { key: 'st', label: 'الحالة', render: (r) => (r.nd.kind === 'open' ? (r.due ? SA.chip('يدوي — ' + r.due, 'neutral') : SA.openValue('غير مُعدّ')) : SA.chip(r.nd.txt, r.nd.kind)) }],
        rowActions: (r) => [{ label: 'تسجيل تسليم', icon: 'checkcircle', hidden: !r.enabled, onClick: () => openSubmission(r, r.nd.period), disabled: SA.can('hr.gov.edit') ? false : NOPERM('hr.gov.edit') }, { label: 'تعديل الالتزام', icon: 'edit', onClick: () => openGovEntry(r), disabled: SA.can('hr.gov.edit') ? false : NOPERM('hr.gov.edit') }], onRowClick: (r) => openGovEntry(r) });
      return h('div.sap-pay-stack', {}, SA.alert('warning', h('b', {}, 'لا ادعاء تكامل: '), 'النظام يحسب ويجمّع ويطابق ويُصدّر ويذكّر؛ التسليم لـ NOSI/ETA يدوي بيد مفوّض ويُسجَّل بإثباته. الاستمارات ومهلها غير موثّقة تظهر ', SA.openValue('Open'), '.'),
        kpiRow([['آخر دورة مقفولة', run ? run.id : '—', { sub: run ? PER.label(run.period) : 'لا دورة مقفولة بعد', href: run ? SA.href('hr/payroll/' + run.id) : null }], ['التزامات متأخرة', late, { accent: late > 0, sub: 'تستحق تسجيل تسليم' }], ['قريبة الاستحقاق', soon, { sub: 'خلال 7 أيام' }], ['سجل التسليم', col('govLog').length, { sub: 'append-only' }]]),
        h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'تذكير قبل الموعد بأيام {Open} (BR-GOV-13). الإقرارات الربع سنوية والتسوية السنوية والشهادات وبيان القوى العاملة: ', specLink('scr-gov-06'), ' · ', specLink('scr-gov-08'))));
    }, ['govCalendar', 'govLog', 'payrollRuns']);
  }
  function govRunPicker(S) { const runs = closedRuns(); const cur = (S.run && runs.find((r) => r.id === S.run)) || runs[0] || null; S.cur = cur; return cur; }
  function govExport(kind, run, rows, header) {
    return async function () {
      if (!SA.can('hr.export.sensitive')) { SA.toast(NOPERM('hr.export.sensitive'), 'warn'); return; } if (!canWages()) { SA.toast('يحتاج hr.salary.view', 'warn'); return; }
      const r = await SA.confirm({ title: 'تصدير ' + (kind === 'ins' ? 'تقرير تسوية التأمينات' : 'تقرير حجز الضريبة') + ' — ' + run.id, danger: true, confirmLabel: 'تصدير', reasonRequired: true, reasonLabel: 'سبب/غرض التصدير', impact: ['ملف بأجور وأرقام قومية مقنّعة — للتسليم اليدوي (لا تكامل).', 'يُسجَّل ويُنبَّه مدير HR والمالك (N-50).', 'يُصدَّر من دورة مقفولة مطابقة لكشف PR- فقط (BR-GOV-10).'] }); if (!r.ok) return; if (!(await SA.stepUp('audit.export', { force: true, title: 'تصدير تقرير حكومي', text: 'أدخل كلمة مرورك أو كود التحقق.' }))) return;
      try { await SA.api(() => { SA.download((kind === 'ins' ? 'NOSI-reconciliation-' : 'ETA-withholding-') + run.period + '.csv', SA.csv([header].concat(rows)), 'text/csv'); aud('HR.GOV.REPORT_EXPORTED', { type: 'payroll_run', id: run.id, label: (kind === 'ins' ? 'تسوية التأمينات ' : 'حجز الضريبة ') + run.period }, { reason: r.reason, after: { rows: rows.length } }); aud('HR.EXPORT.SENSITIVE', { type: 'payroll_run', id: run.id, label: 'تقرير حكومي ' + run.period }, { reason: r.reason }); SA.notify({ title: 'تصدير تقرير حكومي ' + run.period, body: SA.userName(meId()) + ' — ' + r.reason, level: 'urgent', to: ['R-11', 'R-01'], link: '#/audit' }); }); SA.toast('صُدّر التقرير — التسليم يدوي ويُسجَّل في «سجل التسليم»', 'success'); } catch (e) { SA.fail(e); }
    };
  }
  const natId = (empId) => { const e = empById(empId); return e ? '••••••••••' + (e.nationalIdLast4 || '----') : '—'; };
  function tabGovIns(panel, setActions, S) {
    return SA.live(panel, () => {
      const run = govRunPicker(S); if (!run) { setActions([]); return SA.empty({ icon: 'shield', title: 'لا دورة مقفولة بعد', text: 'التقارير الحكومية تُصدَّر من الدورات المقفولة فقط (BR-GOV-10). اقفل دورة من «دورة المرتبات».', action: { label: 'افتح دورة المرتبات', icon: 'arrowleft', onClick: () => SA.nav('hr/payroll') } }); }
      const T = totalsOf(run.lines); const I = run.rules.insurance; const br = I.branches || []; const eAlloc = alloc(T.insEmp, br.map((b) => b.emp)), rAlloc = alloc(T.insEr, br.map((b) => b.er));
      const excl = (run.inputs && run.inputs.excluded || []).filter((x) => /منتهي/.test(x.reason)); const rowsData = run.lines.map((l, i) => { const e = empById(l.empId) || {}; return { id: l.empId, i: i + 1, l, e, atMin: l.insWage === P(I.min) && l.insRaw < P(I.min), atMax: l.insWage === P(I.max) && l.insRaw > P(I.max) }; });
      const g = [['G1', 'Σ حصة العامل = تأمينات العامل في كشف ' + run.id, sum(run.lines, (l) => l.insEmp) === T.insEmp && sum(eAlloc) === T.insEmp], ['G2', 'Σ حصة صاحب العمل = حصة الصاحب في ملخص الدورة', sum(run.lines, (l) => l.insEr) === T.insEr && sum(rAlloc) === T.insEr], ['G3', 'عدد الصفوف = من في الدورة (' + run.lines.length + ') + المنتهون خلال الشهر (' + excl.length + ')', rowsData.length === run.lines.length], ['G4', 'لا موظف في الدورة بلا تسجيل (أو مبرر)', null]];
      const hdr = ['م', 'الرقم القومي (مقنّع)', 'الرقم التأميني', 'الاسم', 'تاريخ الالتحاق', 'تاريخ الانتهاء', 'الأجر التأميني المسجّل', 'الأجر التأميني المحسوب', 'الفرق', 'حصة العامل', 'حصة صاحب العمل', 'الإجمالي', 'ملاحظة']; const exRows = rowsData.map((r) => [r.i, natId(r.id), 'غير مُدخل (Open)', r.l.name, r.e.hireDate || '', r.e.endDate || '', 'غير مُدخل (Open)', (r.l.insWage / 100).toFixed(2), '', (r.l.insEmp / 100).toFixed(2), (r.l.insEr / 100).toFixed(2), ((r.l.insEmp + r.l.insEr) / 100).toFixed(2), r.atMin ? 'عند الحد الأدنى' : r.atMax ? 'عند الحد الأقصى' : '']);
      const bad = g.some((x) => x[2] === false);
      setActions([SA.btn({ label: 'تصدير تقرير التسوية (CSV)', icon: 'download2', kind: 'primary', perm: 'hr.export.sensitive', reason: bad ? 'فرق في ضوابط G1–G4 — لا تصدير' : !canWages() ? 'يحتاج hr.salary.view' : '', onClick: govExport('ins', run, exRows, hdr) })]);
      const t = SA.table({ caption: 'تقرير تسوية التأمينات', rows: () => rowsData, pageSize: 10, search: { placeholder: 'ابحث بالاسم', keys: (r, q) => (r.l.name + ' ' + r.l.empNo).toLowerCase().indexOf(q) >= 0 },
        columns: [{ key: 'i', label: 'م', render: (r) => h('span.num', {}, r.i) }, { key: 'nid', label: 'الرقم القومي', render: (r) => h('span.num', {}, natId(r.id)) }, { key: 'ins', label: 'الرقم التأميني', render: () => SA.openValue('غير مُدخل') }, { key: 'name', label: 'الاسم', sort: true, render: (r) => h('div', {}, h('b', {}, r.l.name), h('div.t-caption', {}, r.l.empNo)) }, { key: 'reg', label: 'المسجّل', render: () => SA.openValue('غير مُدخل') }, { key: 'calc', label: 'المحسوب', render: (r) => A(r.l.insWage) },
          { key: 'e', label: 'حصة العامل', render: (r) => A(r.l.insEmp) }, { key: 'r', label: 'حصة صاحب العمل', render: (r) => A(r.l.insEr) }, { key: 'tot', label: 'الإجمالي', render: (r) => h('b', {}, A(r.l.insEmp + r.l.insEr)) }, { key: 'n', label: 'ملاحظة', render: (r) => (r.atMin ? SA.chip('عند الحد الأدنى', 'warning') : r.atMax ? SA.chip('عند الحد الأقصى', 'warning') : '') }] });
      return h('div.sap-pay-stack', {}, SA.alert('warning', h('b', {}, 'تقرير للتصدير وليس تكاملًا مع NOSI. '), 'تخطيط NOSI الفعلي ', SA.openValue('Open'), ' — الأعمدة عامة. الرقم التأميني والأجر المسجّل غير متوفرين في هذا الإصدار (G4 غير ممكن).'),
        SA.card({ title: 'اشتراكات ' + PER.label(run.period) + ' · ' + run.id, tags: lawTag(), actions: [h('span.t-caption', {}, I.id + ' · أجر تأميني بين ' + fe(I.min) + ' و' + fe(I.max))] }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الفرع', 'العامل %', 'صاحب العمل %', 'مبلغ العامل', 'مبلغ صاحب العمل'].map((x) => h('th', {}, x)))), h('tbody', {}, br.map((b, i) => h('tr', {}, h('td', {}, b.ar), h('td', {}, h('span.num', {}, b.emp ? b.emp + '%' : '—')), h('td', {}, h('span.num', {}, b.er ? b.er + '%' : '—')), h('td', {}, AT(eAlloc[i])), h('td', {}, AT(rAlloc[i])))), h('tr.sap-pay-grand', {}, h('td', {}, 'الإجمالي'), h('td', {}, h('span.num', {}, I.emp_rate + '%')), h('td', {}, h('span.num', {}, I.er_rate + '%')), h('td', {}, AT(T.insEmp)), h('td', {}, AT(T.insEr)))))), h('p.sap-hint', {}, 'تصنيف إصابات العمل 1.5–2% حسب النشاط ', SA.openValue('Open'), ' · الأجر التأميني للدورة ', AT(T.insWage), ' · سداد بحلول يوم 1 من الشهر التالي (Pending).')),
        SA.card({ title: 'ضوابط G1–G4' }, h('ul.sap-pay-ctl', {}, g.map((c) => h('li.' + (c[2] === null ? 'is-na' : c[2] ? 'is-ok' : 'is-bad'), {}, SA.icon(c[2] === null ? 'minus' : c[2] ? 'checkcircle' : 'xcircle', 'icon-sm'), h('b', {}, c[0]), h('span', {}, c[1]), SA.chip(c[2] === null ? 'Open' : c[2] ? 'متطابق' : 'فرق', c[2] === null ? 'neutral' : c[2] ? 'success' : 'danger'))))),
        needWages(), h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, specLink('scr-gov-04')));
    }, ['payrollRuns', 'ui.payTick']);
  }
  function tabGovTax(panel, setActions, S) {
    return SA.live(panel, () => {
      const run = govRunPicker(S); if (!run) { setActions([]); return SA.empty({ icon: 'receipt', title: 'لا دورة مقفولة بعد', text: 'التقارير الحكومية تُصدَّر من الدورات المقفولة فقط.' }); }
      const T = totalsOf(run.lines); const yr = run.period.slice(0, 4); const prior = col('payrollRuns').filter((r) => r.lines && (!r.type || r.type === 'regular') && r.period.slice(0, 4) === yr && r.period < run.period && (r.status === 'released' || r.status === 'locked'));
      const rowsData = run.lines.map((l, i) => { const pl = prior.map((r) => r.lines.find((x) => x.empId === l.empId)).filter(Boolean); const cumBase = sum(pl, (x) => x.taxBase) + l.taxBase, cumTax = sum(pl, (x) => x.tax) + l.tax, prevTax = sum(pl, (x) => x.tax); return { id: l.empId, i: i + 1, l, cumBase, cumTax, prevTax }; });
      const hdr = ['م', 'الرقم القومي (مقنّع)', 'الاسم', 'المعاملة الضريبية', 'الدخل الخاضع للشهر', 'تخفيض: تأمينات العامل', 'الوعاء الشهري', 'الوعاء التراكمي منذ بداية السنة', 'الضريبة التراكمية', 'المحجوز سابقًا', 'الضريبة المستحقة هذا الشهر'];
      const exRows = rowsData.map((r) => [r.i, natId(r.id), r.l.name, 'غير مُسنَد (Open)', (r.l.taxable / 100).toFixed(2), (r.l.insEmp / 100).toFixed(2), (r.l.taxBase / 100).toFixed(2), (r.cumBase / 100).toFixed(2), (r.cumTax / 100).toFixed(2), (r.prevTax / 100).toFixed(2), (r.l.tax / 100).toFixed(2)]);
      const neg = rowsData.some((r) => r.l.tax < 0); const c6 = sum(run.lines, (l) => l.tax) === T.tax;
      setActions([SA.btn({ label: 'تصدير تقرير الحجز (CSV)', icon: 'download2', kind: 'primary', perm: 'hr.export.sensitive', reason: neg || !c6 ? 'فرق/قيم سالبة — لا تصدير (BR-GOV-08)' : !canWages() ? 'يحتاج hr.salary.view' : '', onClick: govExport('tax', run, exRows, hdr) })]);
      const t = SA.table({ caption: 'تقرير حجز الضريبة', rows: () => rowsData, pageSize: 10, search: { placeholder: 'ابحث بالاسم', keys: (r, q) => (r.l.name + ' ' + r.l.empNo).toLowerCase().indexOf(q) >= 0 },
        columns: [{ key: 'i', label: 'م', render: (r) => h('span.num', {}, r.i) }, { key: 'nid', label: 'الرقم القومي', render: (r) => h('span.num', {}, natId(r.id)) }, { key: 'name', label: 'الاسم', sort: true, render: (r) => h('div', {}, h('b', {}, r.l.name), h('div.t-caption', {}, r.l.empNo)) }, { key: 'tr', label: 'المعاملة الضريبية', render: () => SA.openValue('غير مُسنَد') }, { key: 'taxable', label: 'الدخل الخاضع', render: (r) => A(r.l.taxable) }, { key: 'ins', label: 'تأمينات العامل', render: (r) => A(r.l.insEmp) }, { key: 'base', label: 'الوعاء الشهري', render: (r) => A(r.l.taxBase) }, { key: 'cum', label: 'تراكمي', render: (r) => A(r.cumBase) }, { key: 'tax', label: 'الضريبة هذا الشهر', render: (r) => h('b', {}, A(r.l.tax)) }] });
      return h('div.sap-pay-stack', {}, SA.alert('warning', h('b', {}, 'صيغة عامة — قالب ETA الفعلي Open. '), 'منهج ETA تراكمي ومُسنَد سنويًا (× 360 ÷ أيام العمل) ', SA.openValue('Open'), '؛ التقرير يعرض التراكمي من الدورات المقفولة لنفس السنة. المعاملة الضريبية (8 أكواد) حقل إلزامي قائمته Open.'),
        kpiRow([['الدورة', run.id, { sub: PER.label(run.period) }], ['إجمالي الضريبة المحجوزة', AT(T.tax), { sub: 'بحلول يوم 15 من الشهر التالي (Pending)' }], ['الوعاء الشهري', AT(sum(run.lines, (l) => l.taxBase)), {}], ['ضابط C6', c6 ? 'متطابق ✓' : 'فرق', { accent: !c6, sub: 'Σ الضريبة = كشف PR-' }]]), needWages(), h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, 'أرقام سالبة غير مقبولة في ETA: التصحيحات تُرحَّل للشهر التالي (BR-GOV-08). ', specLink('scr-gov-05')));
    }, ['payrollRuns', 'ui.payTick']);
  }
  function tabGovLog(panel, setActions) {
    setActions([SA.btn({ label: 'تسجيل تسليم', icon: 'checkcircle', kind: 'primary', perm: 'hr.gov.edit', onClick: () => openSubmission() })]);
    return SA.live(panel, () => {
      const t = SA.table({ caption: 'سجل التسليم', rows: () => col('govLog'), pageSize: 10, search: { placeholder: 'ابحث', keys: ['title', 'reference', 'id'] }, columns: [{ key: 'id', label: 'السجل', render: (g) => h('b', {}, g.id) }, { key: 'title', label: 'الالتزام', render: (g) => g.title }, { key: 'period', label: 'الفترة', render: (g) => PER.label(g.period) }, { key: 'at', label: 'تاريخ التسليم', render: (g) => SA.fmt.date(g.deliveredAt) }, { key: 'by', label: 'سلّمه', render: (g) => SA.userName(g.deliveredBy) }, { key: 'ref', label: 'المرجع', render: (g) => g.reference }, { key: 'proof', label: 'الإثبات', render: (g) => code(g.proof) }, { key: 'st', label: 'الحالة', render: () => SA.chip('مُسلَّم — مقفول', 'success') }], empty: { icon: 'inbox', title: 'لا تسليمات مسجّلة', text: 'سجّل أول تسليم يدوي بإثباته.', action: { label: 'تسجيل تسليم', onClick: () => openSubmission(), perm: 'hr.gov.edit' } } });
      return h('div.sap-pay-stack', {}, SA.alert('info', 'السجل append-only: لا تعديل بعد «مُسلَّم»؛ التصحيح بسجل جديد (BR-GOV-12). الإثبات مرجع نصي في النموذج.'), h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, specLink('scr-gov-09')));
    }, ['govLog']);
  }
  function tabGovForms(panel, setActions) {
    setActions([]);
    return SA.live(panel, () => {
      const t = SA.table({ caption: 'الاستمارات', rows: () => col('govForms'), pageSize: 10, columns: [{ key: 'name', label: 'الاستمارة / النموذج', render: (f) => h('b', {}, f.name) }, { key: 'a', label: 'الجهة', render: (f) => SA.chip(f.authority, f.authority === 'NOSI' ? 'info' : 'warning') }, { key: 'src', label: 'المصدر', render: (f) => f.source }, { key: 'dl', label: 'المهلة', render: (f) => (f.deadline ? f.deadline : SA.openValue('غير موثّقة')) }, { key: 'v', label: 'التحقق', render: (f) => (f.verifiedBy ? SA.chip('موثّق — ' + SA.userName(f.verifiedBy), 'success') : SA.chip('غير مُتحقَّق منها', 'danger')) }],
        rowActions: (f) => [{ label: 'إدخال المهلة وتوثيقها', icon: 'edit', onClick: () => editForm(f), disabled: SA.can('hr.gov.edit') ? false : NOPERM('hr.gov.edit') }], onRowClick: (f) => editForm(f) });
      return h('div.sap-pay-stack', {}, SA.alert('danger', h('b', {}, 'أرقام الاستمارات ومهلها غير مُتحقَّق منها في الريسيرش (§9). '), 'تظهر بحقول فارغة Open قابلة للتعبئة ولا تُعرض كحقائق (BR-GOV-09).'), h('div.sap-tablecard-wrap', {}, t.el), h('p.sap-hint', {}, specLink('scr-gov-10')));
    }, ['govForms']);
  }
  function editForm(f) {
    if (!SA.can('hr.gov.edit')) { SA.toast(NOPERM('hr.gov.edit'), 'warn'); return; } const dl = field({ name: 'dl', label: 'المهلة (نص حر)', value: f.deadline || '', hint: 'مثل: خلال 30 يومًا من التعيين — لا تُدخل شيئًا لم تتحقق منه.' }), src = field({ name: 'src', label: 'مصدر التحقق', value: f.verifiedBy ? f.source : '', hint: 'اللائحة التنفيذية / موقع الجهة / المحاسب القانوني' }), ver = field({ name: 'ver', label: 'تحققتُ من الرقم والمهلة', type: 'checkbox', value: !!f.verifiedBy }), why = field({ name: 'reason', label: 'السبب', type: 'textarea', rows: 2, required: true });
    formModal({ title: f.name, subtitle: 'غير مُتحقَّق منه حتى تُدخل المصدر', icon: 'edit', fields: [dl, src, ver, why], validate: (v) => (v.ver && !(v.src || '').trim() ? 'اكتب مصدر التحقق' : ''), async onSubmit(v) { await SA.api(() => { st.patch('govForms', f.id, { deadline: v.dl || null, source: v.ver ? v.src : f.source, verifiedBy: v.ver ? meId() : null, verifiedAt: v.ver ? new Date().toISOString() : null }); aud('HR.GOV.CALENDAR_CHANGED', { type: 'gov_form', id: f.id, label: f.name }, { reason: v.reason, before: { deadline: f.deadline, verified: !!f.verifiedBy }, after: { deadline: v.dl, verified: v.ver } }); }); SA.toast('حُفظت الاستمارة', 'success'); return true; } });
  }
  reg('hr-gov', function (root, ctx) {
    return loadScreen(root, ctx, 'التأمينات والضريبة', () => {
      const actions = h('div.sap-actions'); const setActions = (n) => { SA.clear(actions); n.forEach((x) => actions.append(x)); }; const host = h('div'); const S = { run: ctx.params.run || null, cur: null }; const picker = h('div.sap-pay-picker');
      root.append(SA.pageHead({ title: 'التأمينات والضريبة والإقرارات', desc: 'تقرير تسوية التأمينات وتقرير حجز ضريبة كسب العمل كملفات للتصدير من الدورات المقفولة، وتقويم التزامات وسجل تسليم يدوي. بدون أي ادعاء تكامل مع NOSI أو ETA.', tags: [lawTag(), SA.tag('open', 'الاستمارات والمهل Open')], actions }), picker, host);
      const stopPick = SA.live(picker, () => { const runs = closedRuns(); const cur = govRunPicker(S); if (!runs.length) return h('div'); const sel = h('select.select', { 'aria-label': 'الدورة المقفولة', onchange: (e) => { S.run = e.target.value; st.set('ui.payTick', Date.now()); } }, runs.map((r) => h('option', { value: r.id, selected: cur && r.id === cur.id }, r.id + ' — ' + PER.label(r.period)))); return h('div.sap-pay-basis', {}, h('label', {}, h('b', {}, 'الدورة المقفولة'), ' ', sel), h('span.t-caption', {}, 'التقارير من الدورات المقفولة فقط ومتطابقة مع كشف PR-')); }, ['payrollRuns', 'ui.payTick']);
      const t = tabbed(host, [{ id: 'cal', label: 'التقويم والامتثال', icon: 'clock', build: (p) => tabGovCal(p, setActions) }, { id: 'ins', label: 'تسوية التأمينات', icon: 'shield', build: (p) => tabGovIns(p, setActions, S) }, { id: 'tax', label: 'حجز الضريبة', icon: 'receipt', build: (p) => tabGovTax(p, setActions, S) }, { id: 'log', label: 'سجل التسليم', icon: 'inbox', build: (p) => tabGovLog(p, setActions) }, { id: 'forms', label: 'الاستمارات (Open)', icon: 'doc', build: (p) => tabGovForms(p, setActions) }], ctx.params.tab || 'cal');
      return () => { stopPick(); t.cleanup(); };
    });
  });

  /* ═══════════════════════════════════════════ search · missions · css · boot ═══════════════════════════════════════════ */
  SA.search.register({ id: 'hr-pay', label: 'المرتبات', perm: 'hr.payroll.view', query: (q) => (q ? col('payrollRuns').filter((r) => (r.id + ' ' + r.period + ' ' + PER.label(r.period)).toLowerCase().indexOf(q) >= 0).map((r) => ({ title: 'كشف مرتبات ' + r.id, sub: PER.label(r.period) + ' · ' + (RUN_ST[r.status] || [r.status])[0], icon: 'receipt', route: 'hr/payroll/' + r.id })).concat(col('loans').filter((l) => (l.id + ' ' + empName(l.employeeId)).toLowerCase().indexOf(q) >= 0).map((l) => ({ title: 'سلفة ' + l.id, sub: empName(l.employeeId), icon: 'coins', route: 'hr/loans/' + l.id }))) : []) });

  [
    { id: 'M-P1', area: 'hr', title: 'المرتبات: جهّز دورة نوفمبر من الصفر حتى الإرسال للمراجعة', persona: 'payroll', route: 'hr/payroll', est: '6 د', goal: 'كمسؤول مرتبات افتح دورة جديدة (تقبل قواعد Pending بسبب)، اسحب المدخلات واحسب، وعالج فحص «الحساب البنكي الناقص» ثم أرسل للمراجعة. لاحظ أنك لا تستطيع اعتماد ما جهّزته.',
      steps: [{ text: 'افتح «دورة جديدة» ثم اقبل القواعد Pending بسبب', audit: 'HR.PAYROLL.RUN_CREATED' }, { text: 'اسحب المدخلات واحسب الدورة', audit: 'HR.PAYROLL.CALCULATED' }, { text: 'عالج الفحص المانع (تحويل لنقدي) ثم أرسل للمراجعة', audit: 'HR.PAYROLL.PREPARED' }], detect: [{ audit: 'HR.PAYROLL.RUN_CREATED' }, { audit: 'HR.PAYROLL.CALCULATED' }, { audit: 'HR.PAYROLL.PREPARED' }] },
    { id: 'M-P2', area: 'hr', title: 'المرتبات: تتبّع حساب موظف من الاستحقاق إلى الصافي', persona: 'hr', route: 'hr/payroll/PR-2026-10', est: '3 د', goal: 'افتح كشف PR-2026-10 وانقر أي موظف: تتبّع الحساب بخطواته (التأمينات بالحدين، الضريبة بالشرائح، السقوف) والإعداد المُستخدم في كل خطوة. الاطلاع يُسجَّل.',
      steps: [{ text: 'من تبويب «الحساب» انقر على موظف', route: 'hr-payroll' }, { text: 'راجع الشرائح والتأمينات وتحقق من الاستحقاق − الاستقطاع = الصافي', audit: 'HR.SALARY.VIEWED' }], detect: [{ route: 'hr-payroll' }, { audit: 'HR.SALARY.VIEWED' }] },
    { id: 'M-P3', area: 'hr', title: 'من الكشف إلى مفردة المرتب (4 أشخاص · فصل مهام كامل)', persona: 'hr', route: 'hr/payroll/PR-2026-10', est: '12 د', goal: 'سلسلة كاملة على PR-2026-10: مدير HR يراجع، المالية تعتمد، المدير العام يمرّر بوابة التباين، ثم المالية تقفل وتطلق الصرف وتنشر المفردات. بدّل الشخصيات (hr ← acct ← gm ← acct) وجرّب أن المجهِّز لا يعتمد.',
      steps: [{ text: 'كـHR Manager: اعتمد خطوة المراجعة', audit: 'HR.PAYROLL.APPROVED' }, { text: 'كمالية (acct): اعتمد ثم المدير العام (gm) يعتمد بوابة التباين' }, { text: 'كمالية: اقفل الفترة', audit: 'HR.PAYROLL.PERIOD_LOCKED' }, { text: 'كمالية: أطلق الصرف ثم انشر المفردات', audit: 'HR.PAYROLL.RELEASED' }], detect: [{ audit: 'HR.PAYROLL.APPROVED' }, { audit: 'HR.PAYROLL.PERIOD_LOCKED' }, { audit: 'HR.PAYROLL.RELEASED' }, { audit: 'HR.PAYROLL.PAYSLIPS_PUBLISHED' }] },
    { id: 'M-P4', area: 'hr', title: 'سلفة: من الطلب إلى الخصم التلقائي في الدورة', persona: 'payroll', route: 'hr/loans', est: '8 د', goal: 'اطلب سلفة لموظف (جرّب أقساطًا أقل من الحد الأدنى فتُمنع)، ثم بدّل: HR يعتمد، المالية تعتمد، والمالك ينفّذ الصرف (منفّذ الصرف ≠ معتمد). بعدها يدخل القسط الأول في دورة الشهر التالي.',
      steps: [{ text: 'اطلب سلفة بأقساط مناسبة للسقف', audit: 'HR.ADVANCE.REQUESTED' }, { text: 'اعتمد كمدير HR ثم كمالية', audit: 'HR.ADVANCE.APPROVED' }, { text: 'كصاحب الشركة: أكّد الصرف', audit: 'HR.ADVANCE.DISBURSED' }], detect: [{ audit: 'HR.ADVANCE.REQUESTED' }, { audit: 'HR.ADVANCE.APPROVED' }, { audit: 'HR.ADVANCE.DISBURSED' }] },
    { id: 'M-P5', area: 'hr', title: 'تغيير تعويض بتاريخ سريان وأثره على الدورة', persona: 'payroll', route: 'hr/salary', est: '7 د', goal: 'غيّر تعويضات موظف (يُمنع تحت الحد الأدنى للأجر)، ثم كمدير HR اعتمد الطلب من صندوق الاعتمادات: يظهر التعويض الجديد بتاريخ سريانه في ملف الموظف وفي مدخلات الدورة القادمة. لو جعلته بأثر رجعي على دورة مقفولة ولّد دورة فروق.',
      steps: [{ text: 'من «تعويضات الموظفين» اختر موظفًا واضغط «تغيير التعويضات»', audit: 'HR.SALARY.CHANGE_REQUESTED' }, { text: 'كمدير HR اعتمد الطلب (ثم المدير العام)', audit: 'HR.SALARY.CHANGE_APPROVED' }], detect: [{ audit: 'HR.SALARY.CHANGE_REQUESTED' }, { audit: 'HR.SALARY.CHANGE_APPROVED' }] },
    { id: 'M-P6', area: 'hr', title: 'ضبط تغيير الحساب البنكي (ثنائي التحقق + حجز)', persona: 'payroll', route: 'hr/payments', est: '5 د', goal: 'اطلب تغيير حساب موظف (إثبات + مطابقة اسم). لا تستطيع اعتماده بنفسك؛ بدّل لمدير HR فيعتمده ويبدأ الحجز وتصل إشعارات عاجلة للموظف.',
      steps: [{ text: 'من تبويب «الحسابات البنكية» اطلب تغيير حساب', audit: 'HR.BANK_ACCOUNT.CHANGE_REQUESTED' }, { text: 'كمدير HR اعتمد الطلب', audit: 'HR.BANK_ACCOUNT.CHANGE_APPROVED' }], detect: [{ audit: 'HR.BANK_ACCOUNT.CHANGE_REQUESTED' }, { audit: 'HR.BANK_ACCOUNT.CHANGE_APPROVED' }] },
    { id: 'M-P7', area: 'hr', title: 'التقارير الحكومية: صدّر تسوية التأمينات وسجّل التسليم اليدوي', persona: 'hr', route: 'hr/gov', est: '5 د', goal: 'من دورة مقفولة صدّر تقرير التسوية (Step-up + سبب) وسجّل التسليم اليدوي بإثباته. لا ادعاء تكامل مع NOSI/ETA، والاستمارات ومهلها Open.',
      steps: [{ text: 'افتح تبويب «تسوية التأمينات» وصدّر CSV', audit: 'HR.GOV.REPORT_EXPORTED' }, { text: 'سجّل التسليم اليدوي', audit: 'HR.GOV.SUBMISSION_LOGGED' }], detect: [{ audit: 'HR.GOV.REPORT_EXPORTED' }, { audit: 'HR.GOV.SUBMISSION_LOGGED' }] },
    { id: 'M-P8', area: 'hr', title: 'المدير العام: إجماليات المرتبات فقط (بدون hr.salary.view)', persona: 'gm', route: 'hr/payroll/PR-2026-10', est: '2 د', goal: 'ادخل كمدير عام وافتح كشف PR-2026-10: ترى الإجماليات والتباين وبوابتك، أما الأجور الفردية فتظهر «سري» وتتبّع الحساب ممنوع.',
      steps: [{ text: 'افتح الكشف وتبويب «الكشف حسب القسم»', route: 'hr-payroll' }], detect: [{ route: 'hr-payroll' }] }
  ].forEach((m) => SA.missions.add(m));

  const CSS = `
.sap-pay-amt{font-family:var(--font-en);font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate;display:inline-block;font-weight:600;white-space:nowrap}
.sap-pay-neg{color:var(--color-danger)}
.sap-pay-secret{display:inline-flex;align-items:center;gap:4px;color:var(--color-text-muted);font-weight:700;background:var(--color-bg-alt);border:1px dashed var(--color-border-strong);border-radius:999px;padding:0 9px;font-size:12px;white-space:nowrap;min-height:22px}
.sap-pay-code{font:600 12px var(--font-mono);background:var(--color-bg-alt);border:1px solid var(--color-border);border-radius:6px;padding:1px 7px;direction:ltr;unicode-bidi:isolate;display:inline-block}
.sap-pay-link{color:var(--color-primary);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:4px}.sap-pay-link:hover{text-decoration:underline}
.sap-pay-spec{font-size:12px;color:var(--color-primary);margin-inline-start:6px}
.sap-pay-panel{display:flex;flex-direction:column;gap:16px;margin-top:16px}
.sap-pay-stack{display:flex;flex-direction:column;gap:16px}
.sap-pay-detail{display:flex;flex-direction:column;gap:16px}
.sap-pay-totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.sap-pay-tot{display:flex;flex-direction:column;gap:6px;background:#fff;border:1px solid var(--sap-hair);border-radius:12px;padding:12px 14px;box-shadow:var(--sap-shadow-1)}
.sap-pay-tot>span{font-size:var(--text-caption);color:var(--color-text-muted)}.sap-pay-tot b{font-size:1.15rem;color:var(--eg-navy-deep)}
.sap-pay-tot.is-net{background:var(--eg-navy-deep);border-color:var(--eg-navy-deep)}.sap-pay-tot.is-net>span{color:#b9c8e6}.sap-pay-tot.is-net b{color:#fff}
.sap-pay-steps{margin-block:4px}
.sap-pay-stepbtn{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:8px;cursor:pointer;min-height:44px;padding-inline:6px;border-radius:8px}
.sap-pay-stepbtn:hover{background:var(--color-primary-tint)}.sap-pay-stepbtn:focus-visible{outline:2px solid var(--color-focus);outline-offset:2px}.sap-pay-stepbtn.is-view{background:var(--color-primary-tint);font-weight:700}
.sap-pay-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px}
.sap-pay-basis{display:flex;gap:12px;flex-wrap:wrap;align-items:center;background:#fff;border:1px solid var(--sap-hair);border-radius:12px;padding:10px 14px}.sap-pay-basis .select,.sap-pay-basis .input{min-height:40px}
.sap-pay-grow{flex:1}
.sap-pay-picker:empty{display:none}
.sap-pay-timeline{list-style:none;margin:0;padding:0 18px 0 0;display:flex;flex-direction:column;gap:12px;border-inline-start:2px solid var(--color-border);padding-inline-start:16px;padding-inline-end:0}
.sap-pay-timeline li{position:relative}.sap-pay-timeline li::before{content:"";position:absolute;inset-inline-start:-23px;top:6px;width:10px;height:10px;border-radius:50%;background:var(--color-border-strong);border:2px solid #fff}
.sap-pay-timeline li.is-now::before{background:var(--color-success)}
.sap-pay-lines{display:flex;flex-direction:column;gap:8px;margin-bottom:8px}
.sap-pay-line{display:grid;grid-template-columns:1fr 150px auto;gap:10px;align-items:center;padding:6px 10px;border:1px solid var(--color-border);border-radius:10px;background:#fff}
.sap-pay-sum{background:var(--color-bg-alt);border-radius:10px;padding:8px 12px;font-size:var(--text-dense)}
.sap-pay-testbox{display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--color-bg-alt);border-radius:10px;padding:8px 12px;margin-top:6px;font-size:var(--text-dense)}
.sap-pay-scroll{overflow:auto;max-height:560px}
.sap-pay-reg{font-size:12.5px;min-width:1240px}.sap-pay-reg th{white-space:normal;line-height:1.35;font-size:12px}.sap-pay-reg td{white-space:nowrap}
.sap-pay-dept td{background:var(--color-primary-tint);border-block:1px solid var(--color-border)}
.sap-pay-lrow{cursor:pointer}.sap-pay-lrow:hover td{background:var(--color-bg-alt)}
.sap-pay-grand td,.sap-pay-total td{background:var(--eg-navy-deep);color:#fff;font-weight:700}.sap-pay-grand td .sap-pay-amt,.sap-pay-grand td b{color:#fff}.sap-pay-total td{background:var(--color-bg-alt);color:var(--eg-navy-deep)}
.sap-pay-pills{display:flex;gap:8px;flex-wrap:wrap}
.sap-pay-checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:12px}
.sap-pay-check{background:#fff;border:1px solid var(--color-border);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;border-inline-start:4px solid var(--color-border-strong)}
.sap-pay-check.is-block{border-inline-start-color:var(--color-danger)}.sap-pay-check.is-warn{border-inline-start-color:var(--color-warning)}.sap-pay-check.is-info{border-inline-start-color:var(--color-info)}.sap-pay-check.is-done{opacity:.82}
.sap-pay-check p{margin:0;font-size:var(--text-dense)}.sap-pay-check-top{display:flex;justify-content:space-between;gap:8px;align-items:center}
.sap-pay-chain{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}
.sap-pay-chainstep{display:flex;gap:12px;align-items:flex-start;padding:10px 0;position:relative}
.sap-pay-chainstep:not(:last-child)::after{content:"";position:absolute;inset-inline-start:7px;top:28px;bottom:-6px;width:2px;background:var(--color-border)}
.sap-pay-dot{width:16px;height:16px;border-radius:50%;border:2px solid var(--color-border-strong);background:#fff;flex:none;margin-top:3px}
.sap-pay-chainstep.is-approved .sap-pay-dot{background:var(--color-success);border-color:var(--color-success)}.sap-pay-chainstep.is-rejected .sap-pay-dot{background:var(--color-danger);border-color:var(--color-danger)}
.sap-pay-chainstep.is-cur .sap-pay-dot{border-color:var(--color-warning);box-shadow:0 0 0 4px var(--color-warning-tint)}.sap-pay-chainstep.is-skipped{opacity:.55}
.sap-pay-rel{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:14px}
.sap-pay-relcard{background:#fff;border:1px solid var(--color-border);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.sap-pay-relcard.is-now{border-color:var(--eg-navy);box-shadow:var(--sap-shadow-2)}.sap-pay-relcard.is-done{background:var(--color-success-tint);border-color:color-mix(in srgb,var(--color-success) 30%,transparent)}
.sap-pay-relhead{display:flex;gap:10px;align-items:center}.sap-pay-relcard p{margin:0}
.sap-pay-ctl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.sap-pay-ctl li{display:grid;grid-template-columns:auto auto 1fr auto;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;background:var(--color-bg-alt);font-size:var(--text-dense)}
.sap-pay-ctl li.is-ok .icon{color:var(--color-success)}.sap-pay-ctl li.is-bad{background:var(--color-danger-tint)}.sap-pay-ctl li.is-bad .icon{color:var(--color-danger)}.sap-pay-ctl li.is-na{opacity:.75}
.sap-pay-footcheck{display:flex;gap:8px;align-items:center;padding:10px 14px;border-radius:10px;font-weight:600;font-size:var(--text-dense)}
.sap-pay-footcheck.is-ok{background:var(--color-success-tint);color:var(--color-success)}.sap-pay-footcheck.is-bad{background:var(--color-danger-tint);color:var(--color-danger)}
.sap-pay-trace td{vertical-align:top}.sap-pay-formula{font:12.5px var(--font-mono);direction:ltr;text-align:start;color:var(--color-text-muted);min-width:240px;unicode-bidi:plaintext}
.sap-pay-chain-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sap-pay-chain-bar span{background:var(--color-bg-alt);border:1px solid var(--color-border);border-radius:999px;padding:4px 12px;font:600 12.5px var(--font-en);direction:ltr}.sap-pay-chain-bar span.is-net{background:var(--eg-navy-deep);color:#fff;border-color:var(--eg-navy-deep)}
.sap-pay-file{background:var(--eg-navy-deep);color:#d6e2ff;border-radius:12px;padding:14px 16px;font:12.5px/1.8 var(--font-mono);direction:ltr;text-align:start;overflow:auto;white-space:pre;margin:0;max-height:420px}
.sap-pay-slip{position:relative;overflow:hidden;border:1px solid var(--color-border);border-radius:12px;background:#fff}
.sap-pay-wm{position:absolute;inset:-20%;display:flex;flex-wrap:wrap;gap:46px;align-content:flex-start;transform:rotate(-22deg);opacity:.06;font-weight:800;font-size:20px;pointer-events:none;color:var(--eg-navy-deep)}
.sap-pay-slip-in{position:relative;padding:16px;display:flex;flex-direction:column;gap:12px}.sap-pay-slip-head{display:flex;justify-content:space-between;align-items:center}
.sap-pay-secretbadge{display:inline-flex;gap:6px;align-items:center;background:var(--color-danger-tint);color:var(--color-danger);font-weight:800;border-radius:999px;padding:4px 14px}
.sap-pay-net{display:flex;justify-content:space-between;align-items:center;background:var(--eg-navy-deep);color:#fff;border-radius:12px;padding:12px 16px;font-size:1.1rem}.sap-pay-net b{color:#fff;font-size:1.35rem}
.sap-pay-sheet{font-size:12.5px;min-width:1000px}.sap-pay-sign{min-width:90px;border-inline:1px dashed var(--color-border-strong)}
.sap-pay-now{display:inline-flex;gap:4px;align-items:center;color:var(--color-accent)}
.sap-pay-list{display:flex;flex-direction:column;gap:8px}.sap-pay-rowcard{background:#fff;border:1px solid var(--color-border);border-radius:10px;padding:10px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sap-tablecard-wrap{display:block}
@media (max-width:700px){.sap-pay-line{grid-template-columns:1fr}.sap-pay-ctl li{grid-template-columns:auto 1fr}.sap-pay-ctl li .chip{grid-column:2}}
@media print{.sap-pay-wm{opacity:.12}}`;
  (function () { const el = document.createElement('style'); el.setAttribute('data-mod', 'hr-pay'); el.textContent = CSS; document.head.appendChild(el); })();
  /* boot: the store is created by app.js after every module has loaded → seed lazily on the next tick */
  setTimeout(() => { try { ensure(); reconcile(); } catch (e) { console.error('[hr-pay] boot', e); } }, 0);
})();
