/* EG Super Admin prototype — mod-hr-time.js  (HR-09 الورديات · HR-10 الحضور · HR-11 الإجازات · HR-12 الأوفرتايم · HR-32 فريقي)
   Routes: #/hr/shifts · #/hr/attendance · #/hr/leave · #/hr/overtime · #/hr/team   (tabs via ?tab=…)
   Store: extends `hrTime` {settings, shifts, groups, rosters, swaps, tasks, devices, syncLog, periods, exceptions, corrections, absence, leaveTypes, holidays, ledger, otRequests, otReasons, flags}
          + enriches the shared collections `leaveRequests`, `leaveBalances`, `attendance`, `approvals` (idempotent seed, flag meta.timeSeeded).
   Public API (for other HR modules):  SA.hrTime.{dayInfo, attendanceSummary, leaveDaysIn, hasProtectedLeave, balance, requestLeave, overtimeForPeriod, periodStatus, isLocked, teamOf}
   Legal / policy values are Pending [Law] or Open and live in hrTime.settings / leaveTypes (never constants). All data is DEMO. */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  const NOPERM = 'ليست من صلاحياتك';
  const REGISTER_MSS = false; /* mod-hr-ess.js registers hr-mss itself (checked) — renderTeam is still exported as SA.hrTime.renderTeam */
  const p2 = (n) => String(n).padStart(2, '0');
  const DAYN = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const nowIso = () => new Date().toISOString();
  const G = SA.h;

  /* ───────────────────────── dates ───────────────────────── */
  const D = {
    iso(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); },
    parse(s) { const a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); },
    add(s, n) { const d = D.parse(s); d.setDate(d.getDate() + n); return D.iso(d); },
    today() { return D.iso(new Date()); },
    dow(s) { return D.parse(s).getDay(); },
    diff(a, b) { return Math.round((D.parse(b) - D.parse(a)) / 86400000); },
    range(a, b) { const r = []; for (let x = a; x <= b && r.length < 400; x = D.add(x, 1)) r.push(x); return r; },
    monthDays(ym) { const a = ym.split('-').map(Number); const n = new Date(a[0], a[1], 0).getDate(); return Array.from({ length: n }, (_, i) => ym + '-' + p2(i + 1)); },
    addMonth(ym, k) { const a = ym.split('-').map(Number); const d = new Date(a[0], a[1] - 1 + k, 1); return d.getFullYear() + '-' + p2(d.getMonth() + 1); },
    monthLabel(ym) { const a = ym.split('-').map(Number); return MON[a[1] - 1] + ' ' + a[0]; },
    fmt(s) { return s ? SA.fmt.date(s + 'T00:00:00') : '—'; },
    short(s) { return p2(+s.slice(8, 10)) + '/' + s.slice(5, 7); },
    weekStart(s) { return D.add(s, -D.dow(s)); },
    dayName(s) { return DAYN[D.dow(s)]; }
  };
  const tmin = (t) => { const a = String(t || '00:00').split(':'); return +a[0] * 60 + +a[1]; };
  const mtime = (m) => p2(Math.floor(((m % 1440) + 1440) % 1440 / 60)) + ':' + p2(((m % 60) + 60) % 60);
  const spanMin = (a, b) => { const d = tmin(b) - tmin(a); return d > 0 ? d : d + 1440; };
  const hrs = (min) => (Math.round(min / 6) / 10).toString().replace(/\.0$/, '');
  const hash = (s) => { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; };

  /* ───────────────────────── employees / scope ───────────────────────── */
  const emps = () => st.get('employees') || [];
  const activeEmps = () => emps().filter((e) => e.status !== 'terminated');
  const emp = (id) => emps().find((e) => e.id === id) || null;
  const empName = (id) => { const e = emp(id); return e ? e.name : id || '—'; };
  const myEmp = () => { const u = SA.session.userId; return emps().find((e) => e.userId === u) || null; };
  const isMgrOf = (e) => { const m = myEmp(); return !!(m && e && e.managerEmpId === m.id); };
  const teamOf = (empId) => activeEmps().filter((e) => e.managerEmpId === empId);
  function visibleEmps() {
    const all = activeEmps(); const sc = SA.scopeOf('hr'); const m = myEmp();
    if (sc === 'all' || sc === 'department') return all;
    if (sc === 'team') { const ids = new Set(m ? [m.id] : []); let ch = true; while (ch) { ch = false; all.forEach((e) => { if (e.managerEmpId && ids.has(e.managerEmpId) && !ids.has(e.id)) { ids.add(e.id); ch = true; } }); } return all.filter((e) => ids.has(e.id)); }
    return m ? all.filter((e) => e.id === m.id) : [];
  }
  const isSelfOrRelative = (empId) => { const m = myEmp(); if (!m) return false; if (m.id === empId) return true; const e = emp(empId); return !!((m.relatives || []).indexOf(empId) >= 0 || (e && (e.relatives || []).indexOf(m.id) >= 0)); };
  const isHrMgr = () => SA.can('hr.leave.approve') && SA.can('hr.compliance.edit'); /* HR Manager / Super Admin */
  const deptName = (id) => SA.deptName(id);
  const shiftCodeOf = (e) => (e.shift === 'day' ? 'D' : e.shift);
  function empCell(e, sub) { return h('div.sap-usercell', {}, SA.avatar(e.name), h('div', {}, h('b', {}, e.name), h('small', {}, sub == null ? e.empNo + ' · ' + deptName(e.departmentId) : sub))); }

  /* ───────────────────────── catalogue extensions (audit codes / approval types) ───────────────────────── */
  [['HR.SHIFT.CREATED', 'إنشاء وردية', 'medium'], ['HR.SHIFT.UPDATED', 'تعديل وردية', 'medium'], ['HR.SHIFT.RETIRED', 'إيقاف وردية', 'medium'], ['HR.SHIFTGROUP.UPDATED', 'تعديل مجموعة ورديات / يوم راحة', 'high'],
    ['HR.ROSTER.DRAFT_SAVED', 'حفظ مسودة جدول', 'info'], ['HR.ROSTER.WEEK_COPIED', 'نسخ أسبوع في الجدول', 'info'], ['HR.ROSTER.CHECKS_RUN', 'تشغيل فحوصات الجدول', 'info'], ['HR.ROSTER.RULE_OVERRIDDEN', 'تجاوز قاعدة في الجدول', 'high'],
    ['HR.ROSTER.PUBLISHED', 'نشر جدول', 'high'], ['HR.ROSTER.AMENDED', 'تعديل جدول منشور (إصدار جديد)', 'high'], ['HR.ROSTER.SWAP_REQUESTED', 'طلب تبديل وردية', 'info'], ['HR.ROSTER.SWAP_APPROVED', 'اعتماد تبديل وردية', 'medium'], ['HR.ROSTER.SWAP_REJECTED', 'رفض تبديل وردية', 'medium'],
    ['HR.COMPLIANCE.POSTING_CLOSED', 'إغلاق مهمة الإعلان للجهة', 'medium'], ['HR.COMPLIANCE.OT_NOTIFIED', 'إغلاق دفعة إخطار الأوفرتايم', 'medium'],
    ['HR.ATTENDANCE.SOURCE_CONFIGURED', 'تحديد مصدر/جهاز الحضور', 'high'], ['HR.ATTENDANCE.PUNCH_IMPORTED', 'مزامنة/استيراد بصمات', 'info'], ['HR.ATTENDANCE.PUNCH_MANUAL', 'إدخال حضور يدوي بالنيابة', 'medium'],
    ['HR.ATTENDANCE.EXCEPTION_RESOLVED', 'حل استثناء حضور', 'medium'], ['HR.ATTENDANCE.CORRECTION_REQUESTED', 'طلب تصحيح حضور', 'info'], ['HR.ATTENDANCE.CORRECTION_APPROVED', 'اعتماد تصحيح حضور', 'medium'], ['HR.ATTENDANCE.CORRECTION_REJECTED', 'رفض تصحيح حضور', 'medium'],
    ['HR.ATTENDANCE.ABSENCE_NOTICE_PROPOSED', 'اقتراح إنذار غياب (لا إرسال تلقائي)', 'high'], ['HR.ATTENDANCE.ABSENCE_DECISION', 'قرار HR في حالة غياب بدون إذن', 'critical'], ['HR.ATTENDANCE.DEVICE_OFFLINE', 'جهاز حضور غير متصل', 'high'], ['HR.ATTENDANCE.DEVICE_ONLINE', 'جهاز حضور عاد للاتصال', 'info'],
    ['HR.ATTENDANCE.MONTH_LOCKED', 'قفل شهر الحضور للمرتبات', 'high'], ['HR.ATTENDANCE.MONTH_UNLOCKED', 'فتح استثنائي لشهر حضور مقفول', 'critical'], ['HR.ATTENDANCE.POLICY_UPDATED', 'تعديل سياسة الحضور', 'high'], ['HR.ATTENDANCE.EXPORT', 'تصدير شبكة/تقرير حضور', 'medium'],
    ['HR.LEAVE.TYPE_UPDATED', 'تعديل نوع/شرائح إجازة', 'high'], ['HR.LEAVE.ESCALATED', 'تصعيد طلب إجازة تلقائيًا', 'info'], ['HR.LEAVE.CANCELLED', 'إلغاء إجازة (قيد عكسي)', 'medium'], ['HR.LEAVE.SICK_RECORDED', 'تسجيل مرضي مثبت (بلا تشخيص)', 'medium'], ['HR.LEAVE.BALANCE_ADJUSTED', 'تعديل رصيد إجازة', 'high'], ['HR.HOLIDAY.CALENDAR_UPDATED', 'تعديل تقويم العطلات الرسمية', 'medium'],
    ['HR.OT.REQUESTED', 'طلب أوفرتايم مسبق', 'info'], ['HR.OT.REQUESTED_RETRO', 'طلب أوفرتايم بأثر رجعي', 'medium'], ['HR.OT.APPROVED', 'اعتماد أوفرتايم', 'medium'], ['HR.OT.REJECTED', 'رفض أوفرتايم', 'medium'], ['HR.OT.CAP_OVERRIDDEN', 'تجاوز سقف أوفرتايم بسبب', 'high'], ['HR.OT.WORKED_VERIFIED', 'تحقق ساعات الأوفرتايم', 'medium'],
    ['HR.OT.PAYROLL_POSTED', 'ترحيل الأوفرتايم للمرتبات', 'high'], ['HR.OT.POLICY_UPDATED', 'تعديل مضاعفات/سقوف الأوفرتايم', 'high'], ['HR.OT.COST_VIEWED', 'اطلاع على مبالغ الأوفرتايم (T3)', 'medium']
  ].forEach((a) => SA.catalog.addAudit(a[0], a[1], a[2], 'hr'));
  SA.catalog.approvalTypes.overtime = { label: 'أوفرتايم', area: 'hr', icon: 'clock' };
  SA.catalog.approvalTypes.roster = { label: 'جدول ورديات', area: 'hr', icon: 'clock' };

  /* ───────────────────────── static catalogues (labels; values live in the store) ───────────────────────── */
  const LV_ST = { pending: ['بانتظار القرار', 'warning'], approved: ['معتمدة', 'success'], rejected: ['مرفوضة', 'danger'], cancelled: ['ملغاة', 'neutral'] };
  const OT_ST = { requested: ['مطلوب', 'warning'], approved: ['معتمد', 'success'], rejected: ['مرفوض', 'danger'], worked: ['تم العمل', 'info'], verified: ['تم التحقق', 'info'], paid: ['مصروف', 'success'], cancelled: ['ملغي', 'neutral'] };
  const EX_TYPE = { late: 'تأخير', early_leave: 'خروج مبكر', missing_punch: 'بصمة ناقصة', absent_no_notice: 'غياب بدون إخطار', duplicate: 'بصمة مكررة', out_of_zone: 'خارج النطاق الجغرافي' };
  const EX_ST = { open: ['مفتوح', 'warning'], in_review: ['قيد المراجعة', 'info'], resolved: ['محلول', 'success'], escalated: ['مُصعَّد لـHR', 'danger'], rejected: ['مرفوض', 'neutral'] };
  const EX_RES = [['justified', 'مبرَّر — إذن/إخطار مسبق'], ['leave_converted', 'تحويل لإجازة معتمدة'], ['system_error', 'خطأ جهاز/مزامنة'], ['correction', 'تصحيح معتمد'], ['deduct', 'يُعامل بحسب السياسة (خصم)'], ['waived', 'تنازل بسبب موثّق']];
  const DAY_TYPE = { normal: 'يوم عادي', night: 'وردية ليل', weekly_rest: 'راحة أسبوعية', holiday: 'عطلة رسمية' };
  const SHIFT_CHIP = { A: 'chip-success', B: 'chip-warning', C: 'chip-info', D: '' };
  const GLYPH = { present: ['ح', 'حضور'], late: ['ت', 'تأخير'], absent: ['غ', 'غياب'], leave: ['ج', 'إجازة'], holiday: ['ع', 'عطلة رسمية'], rest: ['ر', 'راحة أسبوعية'], missing: ['ب', 'بصمة ناقصة'], pending_correction: ['م', 'تصحيح معلّق'], future: ['·', 'لم يحن بعد'], none: ['', 'خارج الخدمة'] };
  const stChip = (map, k) => { const m = map[k]; return SA.chip(m ? m[0] : k, m ? m[1] : 'neutral'); };

  /* ───────────────────────── CSS (own prefix sap-hrt-) ───────────────────────── */
  const CSS = `
.sap-hrt-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.sap-hrt-tools .cluster,.sap-hrt-cluster{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.sap-hrt-sel{min-height:40px}
.sap-hrt-gridwrap{overflow:auto;border:1px solid var(--color-border);border-radius:10px;background:#fff;max-height:68vh}
.sap-hrt-grid{border-collapse:separate;border-spacing:0;font-size:13px;min-width:100%}
.sap-hrt-grid th,.sap-hrt-grid td{border-bottom:1px solid var(--color-border);border-inline-start:1px solid var(--color-border);padding:0;text-align:center;white-space:nowrap}
.sap-hrt-grid thead th{position:sticky;top:0;background:var(--color-bg-alt);z-index:2;font-weight:700;padding:6px 4px;min-width:38px}
.sap-hrt-grid th.sap-hrt-namecol,.sap-hrt-grid td.sap-hrt-namecol{position:sticky;inset-inline-start:0;background:#fff;z-index:1;text-align:start;min-width:190px;padding:6px 10px;border-inline-start:0}
.sap-hrt-grid thead th.sap-hrt-namecol{z-index:3;background:var(--color-bg-alt)}
.sap-hrt-grid th small{display:block;font-weight:500;color:var(--color-text-muted);font-size:11px}
.sap-hrt-grid th.is-rest,.sap-hrt-grid td.is-rest{background:#f6f6f6}
.sap-hrt-grid th.is-today{box-shadow:inset 0 -3px 0 var(--eg-red)}
.sap-hrt-grid th.is-wk{border-inline-start:2px solid var(--eg-navy-glass)}
.sap-hrt-cell{display:grid;place-items:center;width:100%;min-width:38px;height:38px;border:0;background:transparent;font:700 13px var(--font-ar);cursor:pointer;color:var(--color-text);position:relative}
.sap-hrt-cell:hover:not(:disabled){outline:2px solid var(--eg-navy-glass);outline-offset:-2px}
.sap-hrt-cell:disabled{cursor:not-allowed;opacity:.85}
.sap-hrt-cell:focus-visible{outline:2px solid var(--color-focus);outline-offset:-2px}
.sap-hrt-cell.is-A{background:#e3f4ea;color:#0f5f2f}.sap-hrt-cell.is-B{background:#fdf0dc;color:#7a4300}.sap-hrt-cell.is-C{background:#e6ecf6;color:#012864}.sap-hrt-cell.is-D{background:#eef1f5;color:#2b3a55}
.sap-hrt-cell.is-R{background:#f3f3f3;color:#777}.sap-hrt-cell.is-L{background:repeating-linear-gradient(135deg,#e6ecf6,#e6ecf6 4px,#f3f6fb 4px,#f3f6fb 8px);color:#012864}
.sap-hrt-cell.is-H{background:#f3eefb;color:#5a4a8a}
.sap-hrt-cell.is-bad{box-shadow:inset 0 0 0 2px var(--color-danger)}.sap-hrt-cell.is-warn{box-shadow:inset 0 0 0 2px #e6a100}
.sap-hrt-cell .sap-hrt-pip{position:absolute;inset-block-start:2px;inset-inline-end:3px;width:7px;height:7px;border-radius:50%;background:var(--color-danger)}
.sap-hrt-cell.is-present{background:#e3f4ea;color:#0f5f2f}.sap-hrt-cell.is-late{background:#fdf0dc;color:#7a4300}.sap-hrt-cell.is-absent{background:#fde8e9;color:#a40f15}
.sap-hrt-cell.is-leave{background:#e6ecf6;color:#012864}.sap-hrt-cell.is-holiday{background:#f3eefb;color:#5a4a8a}.sap-hrt-cell.is-rest{background:#f3f3f3;color:#888}
.sap-hrt-cell.is-missing{background:#fff4cc;color:#6b5200}.sap-hrt-cell.is-pending_correction{background:#e0f0ff;color:#0b4a8a}.sap-hrt-cell.is-future{color:#aaa}.sap-hrt-cell.is-none{background:#fafafa}
.sap-hrt-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--color-text-muted)}
.sap-hrt-legend span{display:inline-flex;align-items:center;gap:5px}.sap-hrt-legend i{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:5px;font:700 12px var(--font-ar);font-style:normal}
.sap-hrt-chain{display:flex;flex-wrap:wrap;gap:6px;align-items:stretch;margin:6px 0}
.sap-hrt-chain>li{list-style:none;display:flex;flex-direction:column;gap:2px;padding:8px 12px;border:1px solid var(--color-border);border-radius:10px;background:#fff;min-width:130px;font-size:13px}
.sap-hrt-chain>li small{color:var(--color-text-muted)}
.sap-hrt-chain>li.is-done{border-color:#147a3d;background:#f1faf5}.sap-hrt-chain>li.is-now{border-color:var(--eg-navy);background:var(--color-primary-tint)}.sap-hrt-chain>li.is-no{border-color:var(--color-danger);background:#fff5f5}.sap-hrt-chain>li.is-off{border-style:dashed;color:var(--color-text-muted)}
.sap-hrt-chain{padding:0;margin:6px 0}
.sap-hrt-checks{display:flex;flex-direction:column;gap:6px}
.sap-hrt-check{display:flex;gap:10px;align-items:flex-start;padding:8px 12px;border-radius:8px;border:1px solid var(--color-border);background:#fff;font-size:13px}
.sap-hrt-check.is-bad{border-color:#e9a3a6;background:#fff5f5}.sap-hrt-check.is-warn{border-color:#ecc27a;background:#fffaf0}.sap-hrt-check.is-ok{border-color:#a8d8bb;background:#f4fbf7}
.sap-hrt-check .icon{flex:none;margin-top:2px}
.sap-hrt-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.sap-hrt-cal>div{min-height:76px;border:1px solid var(--color-border);border-radius:8px;padding:5px 6px;background:#fff;font-size:12px;display:flex;flex-direction:column;gap:3px}
.sap-hrt-cal>div.is-head{min-height:0;background:var(--color-bg-alt);font-weight:700;text-align:center}
.sap-hrt-cal>div.is-off{background:#fafafa;color:#aaa}.sap-hrt-cal>div.is-today{box-shadow:inset 0 0 0 2px var(--eg-red)}
.sap-hrt-cal b{font:700 12px var(--font-en)}
.sap-hrt-tag{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;background:var(--color-primary-tint);color:var(--eg-navy);margin:1px}
.sap-hrt-tag.is-warn{background:#fdf0dc;color:#7a4300}.sap-hrt-tag.is-bad{background:#fde8e9;color:#a40f15}
.sap-hrt-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px;align-items:start}
.sap-hrt-bar{height:8px;border-radius:999px;background:#e8e8e8;overflow:hidden;min-width:80px}.sap-hrt-bar>i{display:block;height:100%;background:var(--eg-navy)}
.sap-hrt-bar.is-warn>i{background:#e6a100}.sap-hrt-bar.is-bad>i{background:var(--color-danger)}
.sap-hrt-balance{display:flex;flex-wrap:wrap;gap:10px}
.sap-hrt-balance>div{flex:1 1 160px;border:1px solid var(--color-border);border-radius:10px;padding:10px 12px;background:#fff;display:flex;flex-direction:column;gap:4px}
.sap-hrt-balance b.num{font-size:22px;color:var(--eg-navy)}
.sap-hrt-mss-card{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:12px 14px;border:1px solid var(--color-border);border-radius:12px;background:#fff;flex-wrap:wrap}
.sap-hrt-mobile{max-width:760px;margin-inline:auto;width:100%;display:flex;flex-direction:column;gap:14px}
.sap-hrt-note{font-size:12px;color:var(--color-text-muted)}
.sap-hrt-pre{white-space:pre-wrap;font-size:13px;background:var(--color-bg-alt);padding:10px;border-radius:8px}
.sap-hrt-spec{font-size:12px}
.sap-hrt-ladder{width:100%;border-collapse:collapse;font-size:13px}.sap-hrt-ladder td,.sap-hrt-ladder th{border:1px solid var(--color-border);padding:6px 10px;text-align:start}.sap-hrt-ladder th{background:var(--color-bg-alt)}
@media (max-width:720px){.sap-hrt-grid th.sap-hrt-namecol,.sap-hrt-grid td.sap-hrt-namecol{min-width:132px}.sap-hrt-cal>div{min-height:58px;font-size:11px}.sap-hrt-chain>li{min-width:100px}}
`;
  function injectCss() { if (document.querySelector('style[data-mod="hr-time"]')) return; const s = document.createElement('style'); s.setAttribute('data-mod', 'hr-time'); s.textContent = CSS; document.head.appendChild(s); }

  /* ───────────────────────── store accessors ───────────────────────── */
  const T = (path) => st.get('hrTime' + (path ? '.' + path : ''));
  const SET = () => T('settings') || {};
  const holidays = () => T('holidays') || [];
  const shiftByCode = (c) => (T('shifts') || []).find((s) => s.code === c) || null;
  const groupOfEmp = (e) => (T('groups') || []).find((g) => g.deptId === e.departmentId) || null;
  const restDayOf = (e) => { const g = groupOfEmp(e); return g ? g.restDay : (SET().weeklyRestDay == null ? 5 : SET().weeklyRestDay); };
  const holidayOn = (date) => holidays().find((x) => x.date === date && x.confirmed) || null;
  const restFlag = (e) => (T('flags') || {})[e.id] || {};
  const periodOf = (ym) => (T('periods') || {})[ym] || { status: 'open' };
  const isLocked = (date) => periodOf(date.slice(0, 7)).status === 'locked';
  const lockedMsg = (date) => 'شهر ' + D.monthLabel(date.slice(0, 7)) + ' مقفول للمرتبات. التعديل يحتاج فتحًا استثنائيًا بسبب وصلاحية (BR-ATT-10).';

  /* published roster cell for an employee/date (latest published/amended roster covering the date) */
  function rosterCell(empId, date) {
    const rs = (T('rosters') || []).filter((r) => (r.status === 'published' || r.status === 'amended') && r.periodStart <= date && date <= r.periodEnd);
    for (let i = rs.length - 1; i >= 0; i--) { const c = rs[i].cells && rs[i].cells[empId]; if (c && c[date]) return { code: c[date], roster: rs[i] }; }
    return null;
  }
  /* approved leave covering emp/date */
  function leaveOn(empId, date) {
    return (st.get('leaveRequests') || []).find((l) => l.employeeId === empId && l.status === 'approved' && l.from <= date && date <= l.to) || null;
  }
  const sickProtected = (l) => l && l.type === 'sick';
  function hasProtectedLeave(empId, date) { date = date || D.today(); return (st.get('leaveRequests') || []).some((l) => l.employeeId === empId && l.status === 'approved' && (l.type === 'sick' || l.type === 'maternity') && l.from <= date && date <= l.to); }

  /* ───────────────────────── day info (attendance derivation) ───────────────────────── */
  function dayInfo(e, date) {
    const out = { status: 'none', in: null, out: null, lateMin: 0, earlyMin: 0, shift: null, rec: null, leave: null, locked: isLocked(date), derived: false };
    if (!e) return out;
    if (e.hireDate && date < e.hireDate) return out;
    if (e.endDate && date > e.endDate) return out;
    const rc = rosterCell(e.id, date); const sc = rc ? rc.code : null;
    out.shift = sc && sc !== 'R' ? sc : shiftCodeOf(e);
    const hol = holidayOn(date);
    if (hol) { out.status = 'holiday'; out.note = hol.name; return out; }
    const lv = leaveOn(e.id, date);
    const isRest = sc === 'R' || (!sc && D.dow(date) === restDayOf(e));
    if (isRest && !(sc && sc !== 'R')) { out.status = 'rest'; return out; }
    if (lv) { out.status = 'leave'; out.leave = lv; return out; }
    const rec = (st.get('attendance') || []).find((a) => a.employeeId === e.id && a.date === date);
    const sh = shiftByCode(out.shift) || shiftByCode('D'); const grace = sh && sh.grace != null ? sh.grace : 0; const mode = SET().lateCountMode;
    const today = D.today();
    if (rec) {
      out.rec = rec; out.in = rec.in; out.out = rec.out;
      if (rec.status === 'absent') out.status = 'absent';
      else if (rec.status === 'leave') out.status = 'leave';
      else if (rec.corrPending) out.status = 'pending_correction';
      else if (!rec.in || !rec.out) out.status = 'missing';
      else {
        const lm = Math.max(0, tmin(rec.in) - tmin(sh.start)); out.lateMin = mode === 'from_start' ? lm : Math.max(0, lm - grace);
        out.status = rec.status === 'late' || out.lateMin > 0 ? 'late' : 'present';
        if (out.status === 'late' && !out.lateMin) out.lateMin = lm;
      }
      return out;
    }
    if (date > today) { out.status = 'future'; return out; }
    out.derived = true;
    const x = hash(e.id + date) % 100; const start = tmin(sh.start);
    if (x < 2) { out.status = 'absent'; return out; }
    if (x < 8) { const lm = 8 + (x * 3) % 25; out.lateMin = mode === 'from_start' ? lm : Math.max(0, lm - grace); out.in = mtime(start + lm); out.out = sh.end; out.status = out.lateMin > 0 ? 'late' : 'present'; return out; }
    if (x < 10) { out.in = mtime(start - 3); out.out = null; out.status = date === today ? 'present' : 'missing'; return out; }
    out.in = mtime(start - 12 + (x % 10)); out.out = sh.end; out.status = 'present';
    if (date === today && tmin(mtime(new Date().getHours() * 60 + new Date().getMinutes())) < start) { out.status = 'future'; out.in = null; out.out = null; }
    else if (date === today) out.out = null;
    return out;
  }
  const dayInfoByEmpId = (id, date) => dayInfo(emp(id), date);
  function attendanceSummary(ym) {
    const days = D.monthDays(ym); const o = { month: ym, status: periodOf(ym).status, employees: {} };
    activeEmps().forEach((e) => { const r = { present: 0, late: 0, absent: 0, leave: 0, holiday: 0, rest: 0, missing: 0, lateMin: 0 }; days.forEach((d) => { const i = dayInfo(e, d); if (r[i.status] != null) r[i.status]++; r.lateMin += i.lateMin || 0; }); o.employees[e.id] = r; });
    return o;
  }

  /* ───────────────────────── leave computations ───────────────────────── */
  const leaveType = (id) => (T('leaveTypes') || []).find((t) => t.id === id) || null;
  /* charged days = calendar days in range minus weekly rest and confirmed official holidays (BR-LVE-02) */
  function leaveDaysIn(e, from, to, type) {
    if (!e || !from || !to || to < from) return 0;
    if (type === 'unpaid' || type === 'maternity' || type === 'childcare' || type === 'hajj' || type === 'sick') return D.diff(from, to) + 1; /* calendar days — rule per type is Pending */
    return D.range(from, to).filter((d) => D.dow(d) !== restDayOf(e) && !holidayOn(d)).length;
  }
  function serviceYears(e) { return e && e.hireDate ? D.diff(e.hireDate, D.today()) / 365 : 0; }
  function annualEntitlement(e) {
    const t = leaveType('annual'); const c = (t && t.accrual && t.accrual.tiers) || { y1: 15, y2: 21, y10: 30, yearsFor30: 10, minProRataMonths: 6 };
    const y = serviceYears(e); if (y >= c.yearsFor30) return c.y10; if (y >= 1) return c.y2; const months = Math.floor(y * 12); return months >= c.minProRataMonths ? Math.round(c.y1 * months / 12 * 10) / 10 : 0;
  }
  function casualEntitlement() { const t = leaveType('casual'); return (t && t.accrual && t.accrual.perYear) || 7; }
  function bal(empId, type) {
    const r = (st.get('leaveBalances') || []).find((b) => b.employeeId === empId && b.type === type);
    if (r) return { entitled: r.balanceDays + r.usedDays, used: r.usedDays, remaining: r.balanceDays, row: r };
    const e = emp(empId); if (!e) return { entitled: 0, used: 0, remaining: 0, row: null };
    if (type === 'annual') { const n = annualEntitlement(e); return { entitled: n, used: 0, remaining: n, row: null, computed: true }; }
    if (type === 'casual') { const n = casualEntitlement(); return { entitled: n, used: 0, remaining: n, row: null, computed: true }; }
    return { entitled: 0, used: 0, remaining: 0, row: null };
  }
  function adjustBalance(empId, type, deltaUsed) {
    st.update('leaveBalances', (list) => {
      let r = list.find((b) => b.employeeId === empId && b.type === type);
      if (!r) { const b0 = bal(empId, type); r = { id: 'LB-' + empId + '-' + type, employeeId: empId, type, balanceDays: b0.entitled, usedDays: 0, demo: true, calc: true }; list.push(r); }
      r.usedDays = Math.round((r.usedDays + deltaUsed) * 10) / 10; r.balanceDays = Math.round((r.balanceDays - deltaUsed) * 10) / 10;
    });
  }
  function ledgerAdd(empId, type, kind, qty, refId, note) {
    const L = T('ledger') || []; const id = 'LG-' + String(L.length + 1).padStart(4, '0');
    st.update('hrTime', (t) => { t.ledger.push({ id, employeeId: empId, type, year: new Date().getFullYear(), kind, qty, refId: refId || null, note: note || '', by: SA.session.userId, at: nowIso() }); });
  }

  /* ───────────────────────── approvals bridge (shared inbox) ───────────────────────── */
  function mkChain(list) { return list.map((c, i) => ({ step: i + 1, roleId: c.roleId, label: c.label || SA.roleName(c.roleId), status: i === 0 ? 'pending' : 'waiting', decidedBy: null, decidedAt: null, reason: '' })); }
  const apOf = (id) => (id ? st.find('approvals', id) : null);
  function currentStep(ap) { return ap && ap.status === 'pending' ? ap.chain[ap.currentStep - 1] : null; }
  /** can the logged-in user decide the current step of `ap` for source employee `e`? returns '' or a Arabic reason */
  function cannotDecide(ap, e, kind) {
    const me = SA.session.user; if (!me) return 'سجّل الدخول';
    if (!ap || ap.status !== 'pending') return 'الطلب ليس بانتظار قرار';
    if (e && isSelfOrRelative(e.id) && SA.session.personaId !== 'owner') return 'لا تعتمد طلبك أو طلب قريبك (فصل المهام)';
    if (e && e.userId === me.id) return 'لا تعتمد طلبك بنفسك (فصل المهام)';
    if (ap.requesterId === me.id && me.roleId !== 'R-01') return 'مقدّم الطلب لا يعتمده (فصل المهام)';
    const step = currentStep(ap); if (!step) return 'لا توجد خطوة حالية';
    const prior = ap.chain.some((c) => c.decidedBy === me.id);
    if (prior) return 'قرّرت خطوة سابقة في نفس السلسلة — يكمل شخص آخر';
    if (me.roleId === 'R-01') return '';
    if (kind === 'leave' && step.roleId === 'R-14') {
      if (e && isMgrOf(e)) return '';
      if (step.escalated && SA.can('hr.leave.approve') && me.roleId === 'R-11') return '';
      return 'خطوة المشرف المباشر — ' + (e ? 'ليس مديرًا مباشرًا لـ' + e.name : '') + (me.roleId === 'R-11' ? ' (تُفتح لـHR بعد التصعيد التلقائي)' : '');
    }
    if (me.roleId === step.roleId) return '';
    return 'الخطوة الحالية بانتظار «' + step.label + '»';
  }
  async function decideApproval(ap, decision, reason, e, kind) {
    const why = cannotDecide(ap, e, kind); if (why) { SA.toast(why, 'warn'); return false; }
    if (!(await SA.stepUp('approval.decide'))) return false;
    const me = SA.session.user; let final = null;
    try {
      await SA.api(() => {
        st.update('approvals', (list) => {
          const r = list.find((x) => x.id === ap.id); const step = r.chain[r.currentStep - 1]; const now = nowIso();
          step.status = decision === 'approve' ? 'approved' : 'rejected'; step.decidedBy = me.id; step.decidedAt = now; step.reason = reason || '';
          if (decision === 'reject') { r.status = 'rejected'; r.chain.forEach((c) => { if (c.status === 'waiting') c.status = 'skipped'; }); }
          else if (r.currentStep < r.chain.length) { r.currentStep++; r.chain[r.currentStep - 1].status = 'pending'; }
          else r.status = 'approved';
          r.updatedAt = now; final = r.status;
        });
        SA.audit(decision === 'approve' ? 'APPROVAL.APPROVED' : 'APPROVAL.REJECTED', { target: { type: 'approval', id: ap.id, label: ap.title }, reason, after: { status: final === 'pending' ? 'انتقل للخطوة التالية' : final } });
      });
    } catch (x) { SA.fail(x); return false; }
    const a2 = apOf(ap.id);
    if (a2.status === 'pending') { const nx = a2.chain[a2.currentStep - 1]; SA.notify({ title: 'طلب اعتماد بانتظارك: ' + ap.title, body: 'الخطوة: ' + nx.label, level: 'action', to: [nx.roleId, 'R-01'], link: '#/approvals/' + ap.id }); }
    reconcile(); return true;
  }

  /* ───────────────────────── reconcile: shared-inbox decisions → source records (idempotent) ───────────────────────── */
  function lastDecider(ap) { const c = ap.chain.filter((x) => x.decidedBy).pop(); return c ? c : null; }
  function reconcile() {
    if (!T()) return;
    (st.get('approvals') || []).forEach((ap) => {
      if (!ap.ref) return;
      if (ap.ref.type === 'leave') {
        const lv = st.find('leaveRequests', ap.ref.id); if (!lv || lv.status !== 'pending') return;
        if (ap.status === 'approved') applyLeaveApproved(lv, ap); else if (ap.status === 'rejected') applyLeaveRejected(lv, ap);
      } else if (ap.ref.type === 'overtime') {
        const ot = (T('otRequests') || []).find((o) => o.id === ap.ref.id); if (!ot || ot.status !== 'requested') return;
        if (ap.status === 'approved') applyOtDecision(ot, ap, true); else if (ap.status === 'rejected') applyOtDecision(ot, ap, false);
      } else if (ap.ref.type === 'roster') {
        const r = (T('rosters') || []).find((x) => x.id === ap.ref.id); if (!r || r.status !== 'pending_approval') return;
        if (ap.status === 'rejected') { st.update('hrTime', (t) => { const x = t.rosters.find((q) => q.id === r.id); x.status = 'draft'; x.rejectReason = (lastDecider(ap) || {}).reason || ''; }); }
      }
    });
  }
  function applyLeaveApproved(lv, ap) {
    const e = emp(lv.employeeId); const d = lastDecider(ap);
    st.patch('leaveRequests', lv.id, { status: 'approved', decidedBy: d ? d.decidedBy : null, decidedAt: d ? d.decidedAt : nowIso(), decisionReason: d ? d.reason : '' });
    const days = lv.days || 0;
    if (!lv.balanceApplied) { /* shared flag with mod-hr-ess.js so the balance is deducted exactly once */
      st.patch('leaveRequests', lv.id, { balanceApplied: true });
      if (lv.type === 'annual' || lv.type === 'casual') adjustBalance(lv.employeeId, lv.type, days);
      if (lv.type === 'casual') adjustBalance(lv.employeeId, 'annual', days); /* BR-LVE-03: casual is deducted from annual */
      if (lv.type === 'comp') adjustBalance(lv.employeeId, 'comp', days);
    }
    ledgerAdd(lv.employeeId, lv.type === 'casual' ? 'casual' : lv.type, 'taken', -days, lv.id, 'إجازة معتمدة ' + D.short(lv.from) + '→' + D.short(lv.to));
    if (lv.type === 'casual') ledgerAdd(lv.employeeId, 'annual', 'taken', -days, lv.id, 'العارضة تُخصم من السنوية (م 128)');
    /* attendance: absence exceptions on those days are resolved (leave wins in the grid) */
    st.update('hrTime', (t) => { t.exceptions.forEach((x) => { if (x.employeeId === lv.employeeId && x.date >= lv.from && x.date <= lv.to && (x.status === 'open' || x.status === 'in_review' || x.status === 'escalated')) { x.status = 'resolved'; x.resolution = 'leave_converted'; x.note = 'إجازة معتمدة ' + lv.id; x.resolvedAt = nowIso(); x.resolvedBy = SA.session.userId; } }); });
    if (e && lv.from <= D.today() && D.today() <= lv.to && e.status === 'active') st.patch('employees', e.id, { status: 'leave' });
    if (!(st.get('audit') || []).some((x) => x.code === 'HR.LEAVE.APPROVED' && x.target && x.target.id === lv.id && x.after && x.after.status === 'approved')) SA.audit('HR.LEAVE.APPROVED', { target: { type: 'leave', id: lv.id, label: (e ? e.name : '') + ' — ' + (leaveType(lv.type) || {}).name }, reason: d ? d.reason : '', after: { status: 'approved', days, remaining_annual: lv.type === 'annual' || lv.type === 'casual' ? bal(lv.employeeId, 'annual').remaining : undefined } });
    if (e && e.userId) SA.notify({ title: 'تم اعتماد إجازتك ' + lv.id, body: D.fmt(lv.from) + ' → ' + D.fmt(lv.to), level: 'info', toUsers: [e.userId], link: '#/hr/leave' });
  }
  function applyLeaveRejected(lv, ap) {
    const d = lastDecider(ap); const e = emp(lv.employeeId);
    st.patch('leaveRequests', lv.id, { status: 'rejected', decidedBy: d ? d.decidedBy : null, decidedAt: d ? d.decidedAt : nowIso(), decisionReason: d ? d.reason : '' });
    if (!(st.get('audit') || []).some((x) => x.code === 'HR.LEAVE.REJECTED' && x.target && x.target.id === lv.id)) SA.audit('HR.LEAVE.REJECTED', { target: { type: 'leave', id: lv.id, label: (e ? e.name : '') }, reason: d ? d.reason : '', after: { status: 'rejected' } });
    if (e && e.userId) SA.notify({ title: 'تم رفض إجازتك ' + lv.id, body: d && d.reason ? 'السبب: ' + d.reason : '', level: 'info', toUsers: [e.userId], link: '#/hr/leave' });
  }
  function applyOtDecision(ot, ap, ok) {
    const d = lastDecider(ap);
    st.update('hrTime', (t) => { const o = t.otRequests.find((x) => x.id === ot.id); o.status = ok ? 'approved' : 'rejected'; o.decidedBy = d ? d.decidedBy : null; o.decidedAt = d ? d.decidedAt : nowIso(); o.decisionReason = d ? d.reason : ''; });
    SA.audit(ok ? 'HR.OT.APPROVED' : 'HR.OT.REJECTED', { target: { type: 'overtime', id: ot.id, label: ot.employeeIds.map(empName).join('، ') }, reason: d ? d.reason : '', after: { status: ok ? 'معتمد' : 'مرفوض', hours: hrs(ot.minutes) } });
    SA.notify({ title: (ok ? 'تم اعتماد الأوفرتايم ' : 'تم رفض الأوفرتايم ') + ot.id, body: ot.employeeIds.length + ' موظف · ' + D.fmt(ot.date), level: 'info', toUsers: [ot.requestedBy], link: '#/hr/overtime' });
  }
  /* auto-escalation of leave requests whose supervisor step is older than N working days (BR-LVE-10) */
  function runEscalation() {
    if (!T()) return; const days = SET().leaveEscalationDays; if (days == null) return;
    (st.get('leaveRequests') || []).forEach((lv) => {
      if (lv.status !== 'pending' || !lv.approvalId || lv.escalatedAt) return;
      const ap = apOf(lv.approvalId); const step = currentStep(ap); if (!step || step.roleId !== 'R-14') return;
      let wd = 0; for (let d = D.iso(new Date(lv.createdAt)); d < D.today(); d = D.add(d, 1)) { if (D.dow(d) !== 5) wd++; }
      if (wd < days) return;
      st.update('approvals', (l) => { const r = l.find((x) => x.id === ap.id); r.chain[r.currentStep - 1].escalated = true; r.chain[r.currentStep - 1].label = r.chain[r.currentStep - 1].label.replace(' (مُصعَّد)', '') + ' (مُصعَّد)'; });
      st.patch('leaveRequests', lv.id, { escalatedAt: nowIso() });
      SA.audit('HR.LEAVE.ESCALATED', { actor: { id: 'SYSTEM', name: 'النظام', roleId: null }, via: 'system', target: { type: 'leave', id: lv.id, label: empName(lv.employeeId) }, reason: 'تجاوز مهلة المشرف (' + days + ' يوم عمل)' });
      SA.notify({ title: 'تصعيد تلقائي لطلب إجازة ' + lv.id, body: empName(lv.employeeId) + ' — لم يُقرَّر خلال ' + days + ' يوم عمل. أُتيح القرار لـHR.', level: 'action', to: ['R-11', 'R-14'], link: '#/hr/leave?tab=requests' });
    });
  }

  /* ───────────────────────── idempotent seed (runs right after SA.store.init; flag meta.timeSeeded) ───────────────────────── */
  function seedTime() {
    if (!st.get('employees') || !st.get('approvals') || st.get('meta.timeSeeded')) return;
    const today = D.today(); const ago = (min) => new Date(Date.now() - min * 60000).toISOString(); const dAgo = (n) => D.add(today, -n);
    const sh = (code, name, start, end, o) => Object.assign({ id: 'SH-' + code, code, name, start, end, breakMin: 60, breakPaid: false, night: false, grace: 10, color: '', status: 'active', version: 1, effectiveFrom: '2026-01-01', graceDemo: true }, o || {});
    const shifts = [sh('A', 'صباحية', '07:00', '15:00'), sh('B', 'مسائية', '15:00', '23:00'), sh('C', 'ليلية', '23:00', '07:00', { night: true }), sh('D', 'إدارية (نهار)', '08:00', '16:00')];
    const GR = [['D-09', ['A', 'B'], ['A', 'B']], ['D-10', ['A', 'B', 'C'], ['A', 'B', 'C']], ['D-11', ['A', 'C'], ['A', 'C']], ['D-12', ['A', 'B', 'C'], ['A', 'B', 'C']], ['D-04', ['A', 'B'], ['A', 'B']]];
    const groups = GR.map((g) => ({ id: 'G-' + g[0].slice(2), deptId: g[0], name: SA.deptName(g[0]), restDay: 5, restPaid: true, operates: g[1], pattern: g[2], minCoverage: { A: 1, B: 1, C: 1 }, minCoverageDemo: true }));
    /* rosters */
    const members = (dept) => activeEmps().filter((e) => e.departmentId === dept);
    const wk0 = D.weekStart(today); const end1 = D.add(wk0, 13);
    const mkCells = (mem, from, to, fn) => { const c = {}; mem.forEach((e) => { c[e.id] = {}; D.range(from, to).forEach((d) => { const v = fn(e, d); if (v) c[e.id][d] = v; }); }); return c; };
    const m09 = members('D-09');
    const rs1 = { id: 'RS-2026-0044', name: 'جدول ' + SA.deptName('D-09') + ' · أسبوعان', groupId: 'G-09', periodStart: wk0, periodEnd: end1, weeks: 2, status: 'published', version: 1, createdBy: 'U-27', createdAt: ago(60 * 24 * 6), publishedBy: 'U-08', publishedAt: ago(60 * 24 * 3), history: [{ at: ago(60 * 24 * 3), by: 'U-08', text: 'نشر الإصدار 1' }], overrides: [], cells: mkCells(m09, wk0, end1, (e, d) => (D.dow(d) === 5 ? 'R' : shiftCodeOf(e))) };
    const s2 = D.add(end1, 1); const e2 = D.add(s2, 13);
    const draftFn = (e, d) => {
      if (D.dow(d) === 5 && e.id !== 'E-1020') return 'R'; if (D.dow(d) === 5) return d === D.add(s2, 5) ? 'A' : 'R';
      if (e.id === 'E-1030' && d === D.add(s2, 3)) return 'C'; if (e.id === 'E-1030' && d === D.add(s2, 4)) return 'A';
      if ((e.id === 'E-1021' || e.id === 'E-1030') && (d === D.add(s2, 7) || d === D.add(s2, 8))) return 'A';
      return shiftCodeOf(e);
    };
    const rs2 = { id: 'RS-2026-0045', name: 'جدول ' + SA.deptName('D-09') + ' · الأسبوعان التاليان (مسودة المشرف)', groupId: 'G-09', periodStart: s2, periodEnd: e2, weeks: 2, status: 'draft', version: 0, createdBy: 'U-27', createdAt: ago(60 * 20), publishedBy: null, publishedAt: null, history: [{ at: ago(60 * 20), by: 'U-27', text: 'حفظ مسودة' }], overrides: [], cells: mkCells(m09, s2, e2, draftFn) };
    const swaps = [{ id: 'SW-0001', rosterId: 'RS-2026-0044', date: D.add(wk0, 8), fromEmp: 'E-1020', toEmp: 'E-1021', fromShift: 'A', toShift: 'B', status: 'peer_ok', reason: 'ظرف عائلي', createdAt: ago(60 * 9), createdBy: 'U-27' }];
    const tasks = [{ id: 'TK-0001', type: 'roster_post', refId: 'RS-2026-0044', title: 'إعلان جدول ' + SA.deptName('D-09') + ' وإرسال نسخة للجهة الإدارية', dueAt: D.add(dAgo(3), 7), status: 'open', executedBy: null, closedBy: null, proof: null }];
    const devices = [{ id: 'DV-01', code: 'GATE-01', name: 'بوابة المصنع الرئيسية', model: 'جهاز بصمة (مثال: ZKTeco-style)', location: 'البوابة الرئيسية', mode: 'push', status: 'online', lastSyncAt: ago(2), driftS: 3 }, { id: 'DV-02', code: 'KIOSK-01', name: 'كشك الورشة', model: 'كشك حضور (مرشّح)', location: 'ورشة الإنتاج', mode: 'pull', status: 'degraded', lastSyncAt: ago(25), driftS: 41 }, { id: 'DV-03', code: 'GATE-02', name: 'بوابة الإدارة', model: 'جهاز بصمة (مثال: ZKTeco-style)', location: 'مبنى الإدارة', mode: 'push', status: 'offline', lastSyncAt: ago(42), driftS: 0 }];
    const syncLog = [[2, 'DV-01', true, 38, 'مزامنة دورية'], [27, 'DV-01', true, 12, 'مزامنة دورية'], [25, 'DV-02', true, 9, 'سحب CSV'], [41, 'DV-03', false, 0, 'انقطاع الاتصال — محاولة 3'], [62, 'DV-01', true, 47, 'مزامنة دورية'], [95, 'DV-02', true, 22, 'سحب CSV'], [160, 'DV-03', true, 31, 'مزامنة دورية']].map((r, i) => ({ id: 'SY-' + String(i + 1).padStart(3, '0'), at: ago(r[0]), deviceId: r[1], ok: r[2], count: r[3], note: r[4] }));
    const settings = {
      effectiveFrom: '2026-01-01', weeklyRestDay: 5, weeklyRestPaid: true, maxDailyHours: 8, maxWeeklyHours: 48, minBreakMin: 60, maxContinuousHours: 5, maxDaySpanHours: 10, maxPresenceHours: 12, maxConsecutiveDays: 6,
      restMinBetweenShifts: null, nightWindow: null, postSendDays: 7, otNotifyDays: 7, postingMethod: null,
      lateCountMode: null, correctionWindowHours: null, correctionsPerMonth: null, duplicateWindowMin: null, lateEffect: null, exceptionsCloseHours: 24, deviceOfflineMin: 15, attSource: null,
      absence: { consecWarn: 5, consecLimit: 10, intermWarn: 10, intermLimit: 20 },
      leaveEscalationDays: 1, sickScheme: null, negativeBalance: null, coverageSeverity: 'warn',
      ot: { multNormal: 1.35, multNight: 1.7, multRest: null, multHoliday: null, rateBasis: null, capDay: null, capWeek: null, capMonth: null, deptBudget: null, warnPct: 90, retroHours: 48 }
    };
    const LT = (id, code, name, o) => Object.assign({ id, code, name, paid: true, payScheme: 'full', deductFromAnnual: false, accrual: { kind: 'fixed' }, eligibility: '', docs: [], chain: ['supervisor', 'hr'], legal: '', status: 'pending', version: 1, effectiveFrom: '2026-01-01', active: true, note: '' }, o);
    const leaveTypes = [
      LT('annual', 'ANN', 'سنوية', { accrual: { kind: 'tiers', tiers: { y1: 15, y2: 21, y10: 30, yearsFor30: 10, ageFor30: 50, disability: 45, minProRataMonths: 6, hazardousExtra: 7 } }, eligibility: 'من السنة الأولى؛ خدمة < سنة بالتناسب بشرط ≥ {6} أشهر', legal: 'قانون العمل 14/2025 · م 124–125', note: 'لا تنازل · تسوية/صرف نقدي كل {3 سنوات} على الأكثر · ≥ {15} يومًا مأخوذة بينها {6} متصلة' }),
      LT('casual', 'CAS', 'عارضة', { accrual: { kind: 'fixed', perYear: 7, maxConsecutive: 2 }, deductFromAnnual: true, legal: 'م 128', note: 'تُخصم من السنوية · بحد أقصى {2} متتالية' }),
      LT('sick', 'SIC', 'مرضية', { payScheme: 'scheme', accrual: { kind: 'scheme' }, docs: ['medical_certificate'], chain: ['hr'], legal: 'م 131 + قانون 148/2019 م 76', note: 'مخطط A أو B — قرار D1 مفتوح · HR يسجّلها والمشرف يُبلَّغ بلا تشخيص' }),
      LT('maternity', 'MAT', 'وضع (أمومة)', { accrual: { kind: 'per_event', days: 120, minAfterBirth: 45, maxTimes: 3 }, docs: ['medical_certificate'], chain: ['hr'], eligibility: 'موظفة · بلا حد أدنى للخدمة في قانون العمل', legal: 'م 54–55 (+ قانون 148/2019 م 77)', note: '4 أشهر مدفوعة · لا فصل أثناءها · التأمينات 75% ويكمل صاحب العمل' }),
      LT('childcare', 'CHC', 'رعاية طفل', { paid: false, payScheme: 'none', accrual: { kind: 'per_event', maxMonths: 24, maxTimes: 3 }, eligibility: 'منشأة ≥ {50} عاملًا · خدمة ≥ {سنة}', legal: 'م 57', note: 'بدون أجر حتى {سنتين} حتى {3} مرات' }),
      LT('hajj', 'HAJ', 'حج', { accrual: { kind: 'per_event', days: 30, afterYears: 5, once: true }, eligibility: 'مرة واحدة بعد {5} سنوات خدمة متصلة', legal: 'م 126', note: 'شهر مدفوع' }),
      LT('exam', 'EXM', 'امتحانات', { accrual: { kind: 'per_event', notice: 10 }, docs: ['exam_proof'], legal: 'م 130', note: 'أيام الامتحان فقط بإخطار {10} أيام وإثبات · لا تُخصم من السنوية' }),
      LT('unpaid', 'UNP', 'بدون أجر', { paid: false, payScheme: 'none', accrual: { kind: 'none' }, legal: 'سياسة الشركة', note: 'بموافقة HR' }),
      LT('comp', 'CMP', 'يوم بدل (تعويضية)', { accrual: { kind: 'per_event' }, legal: 'م 121 / 129', note: 'مصدرها الأوفرتايم في الراحة والعطلات (HR-12) — رصيد أيام' })
    ];
    const H = (date, name, confirmed, extra) => Object.assign({ id: 'HD-' + date, date, name, confirmed, moved: false, circular: '' }, extra || {});
    const holidaysL = [H('2026-01-07', 'عيد الميلاد المجيد', true), H('2026-01-25', 'عيد الثورة وعيد الشرطة', true), H('2026-03-20', 'عيد الفطر (تقريبي)', false, { moved: true }), H('2026-04-13', 'شم النسيم', true), H('2026-04-25', 'عيد تحرير سيناء', true), H('2026-05-01', 'عيد العمال', true), H('2026-05-27', 'عيد الأضحى (تقريبي)', false, { moved: true }), H('2026-06-30', 'ذكرى ثورة 30 يونيو', true), H('2026-07-23', 'ذكرى ثورة 23 يوليو', true), H('2026-08-25', 'المولد النبوي (تقريبي)', false, { moved: true }), H('2026-10-06', 'عيد القوات المسلحة', true)];
    const flags = { 'E-1018': { restrictedOT: true } };
    const otReasons = [['urgent_order', 'طلبية عاجلة'], ['machine_breakdown', 'عطل ماكينة'], ['shipment', 'تحميل/شحن'], ['stock_count', 'جرد'], ['absence_cover', 'تغطية غياب']];
    st.set('hrTime', { settings, shifts, groups, rosters: [rs1, rs2], swaps, tasks, devices, syncLog, periods: { '2026-09': { status: 'locked', lockedBy: 'U-08', lockedAt: ago(60 * 24 * 36), waivers: [] }, '2026-10': { status: 'review', waivers: [] } }, exceptions: [], corrections: [], absence: [], leaveTypes, holidays: holidaysL, ledger: [], otRequests: [], otReasons, flags, devicesSource: [], seq: { ex: 0, att: 0, ot: 0, lv: 4 } });

    /* leave: balances for every active employee + ledger + approvals for the seeded requests */
    const lt = leaveTypes[0];
    st.update('leaveBalances', (list) => {
      list.forEach((b) => { if (b.type === 'casual') { b.balanceDays = 7 - b.usedDays; } });
      activeEmps().forEach((e) => {
        ['annual', 'casual'].forEach((ty) => { if (!list.some((b) => b.employeeId === e.id && b.type === ty)) { const n = ty === 'annual' ? annualEntitlement(e) : 7; list.push({ id: 'LB-' + e.id + '-' + ty, employeeId: e.id, type: ty, balanceDays: n, usedDays: 0, demo: true, calc: true }); } });
      });
    });
    const ledger = []; let li = 0; const LG = (e, ty, kind, q, ref, note) => ledger.push({ id: 'LG-' + String(++li).padStart(4, '0'), employeeId: e, type: ty, year: new Date().getFullYear(), kind, qty: q, refId: ref || null, note: note || '', by: 'SYSTEM', at: ago(60 * 24 * 200) });
    (st.get('leaveBalances') || []).forEach((b) => { if (b.type === 'sick') return; LG(b.employeeId, b.type, 'opening', b.balanceDays + b.usedDays, null, b.calc ? 'استحقاق السنة (شرائح Pending)' : 'رصيد افتتاحي تجريبي'); if (b.usedDays) LG(b.employeeId, b.type, 'taken', -b.usedDays, null, 'استخدام سابق (تجريبي)'); });
    st.update('hrTime', (t) => { t.ledger = ledger; });
    /* leaveRequests: realistic dates/fields */
    const nextWork = (d) => { let x = d; while (D.dow(x) === 5 || holidayOn(x)) x = D.add(x, 1); return x; };
    st.update('leaveRequests', (list) => {
      const l1 = list.find((x) => x.id === 'LV-2026-0001'), l3 = list.find((x) => x.id === 'LV-2026-0003');
      if (l1) { l1.createdAt = ago(60 * 52); l1.from = nextWork(D.add(today, 3)); l1.to = D.add(l1.from, 2); l1.days = leaveDaysIn(emp('E-1020'), l1.from, l1.to, 'annual'); l1.createdBy = 'U-25'; l1.onBehalfBy = 'U-25'; }
      if (l3) { l3.from = nextWork(D.add(today, 1)); l3.to = l3.from; l3.days = 1; l3.createdBy = 'U-29'; }
      list.forEach((x) => { if (!x.createdBy) x.createdBy = null; });
      list.push({ id: 'LV-2026-0004', employeeId: 'E-1025', type: 'annual', from: dAgo(1), to: D.add(today, 3), days: 4, status: 'pending', approverEmpId: 'E-1014', reason: 'إجازة سنوية مخططة', createdAt: ago(60 * 24 * 6), createdBy: 'U-25', onBehalfBy: 'U-25' });
      const l4 = list[list.length - 1]; l4.days = leaveDaysIn(emp('E-1025'), l4.from, l4.to, 'annual');
    });
    const mkAp = (title, ref, reqId, chain, status, ageMin, ctx, decided) => {
      const id = st.nextId('approvals', 'AP', 4); const ch = mkChain(chain); const cs = ch.length;
      if (status === 'approved') { ch.forEach((c, i) => { c.status = 'approved'; c.decidedBy = (decided || [])[i] || 'U-08'; c.decidedAt = ago(ageMin - 30 * (i + 1)); c.reason = 'مطابق'; }); }
      if (status === 'rejected') { ch[0].status = 'rejected'; ch[0].decidedBy = (decided || [])[0] || 'U-08'; ch[0].decidedAt = ago(ageMin - 30); ch[0].reason = 'غير مناسب للجدول'; ch.slice(1).forEach((c) => { c.status = 'skipped'; }); }
      st.insert('approvals', { id, type: ref.type, area: 'hr', title, requesterId: reqId, amount: null, discountPct: null, currency: 'EGP', status, chain: ch, currentStep: status === 'pending' ? 1 : status === 'approved' ? cs : 1, createdAt: ago(ageMin), updatedAt: ago(status === 'pending' ? ageMin : ageMin - 30), context: ctx, ref }, true);
      return id;
    };
    const LCH = [{ roleId: 'R-14', label: 'المشرف المباشر' }, { roleId: 'R-11', label: 'مدير الموارد البشرية' }];
    const lvCtx = (lv) => [['الموظف', empName(lv.employeeId)], ['النوع', (leaveTypes.find((t) => t.id === lv.type) || {}).name], ['الفترة', D.fmt(lv.from) + ' → ' + D.fmt(lv.to) + ' (' + lv.days + ' يوم)']];
    const lvs = st.get('leaveRequests');
    const l1 = lvs.find((x) => x.id === 'LV-2026-0001'), l2 = lvs.find((x) => x.id === 'LV-2026-0002'), l3b = lvs.find((x) => x.id === 'LV-2026-0003'), l4b = lvs.find((x) => x.id === 'LV-2026-0004');
    const a1 = mkAp('إجازة سنوية: ' + empName(l1.employeeId) + ' (' + l1.days + ' أيام)', { type: 'leave', id: l1.id }, 'U-25', LCH, 'pending', 60 * 52, lvCtx(l1));
    const a2 = mkAp('إجازة سنوية: ' + empName(l2.employeeId) + ' (' + l2.days + ' أيام)', { type: 'leave', id: l2.id }, 'U-29', LCH, 'approved', 60 * 40, lvCtx(l2), ['U-27', 'U-08']);
    const a3 = mkAp('إجازة عارضة: ' + empName(l3b.employeeId) + ' (يوم)', { type: 'leave', id: l3b.id }, 'U-29', LCH, 'pending', 60 * 3, lvCtx(l3b));
    const a4 = mkAp('إجازة سنوية: ' + empName(l4b.employeeId) + ' (' + l4b.days + ' أيام)', { type: 'leave', id: l4b.id }, 'U-25', LCH, 'approved', 60 * 24 * 5, lvCtx(l4b), ['U-27', 'U-08']);
    st.update('leaveRequests', (list) => { [['LV-2026-0001', a1], ['LV-2026-0002', a2], ['LV-2026-0003', a3], ['LV-2026-0004', a4]].forEach((p) => { const x = list.find((q) => q.id === p[0]); if (x) x.approvalId = p[1]; }); const x2 = list.find((q) => q.id === 'LV-2026-0002'); x2.status = 'approved'; const x4 = list.find((q) => q.id === 'LV-2026-0004'); x4.status = 'approved'; x4.decidedBy = 'U-08'; x4.decidedAt = ago(60 * 24 * 5 - 60); });
    adjustBalance('E-1025', 'annual', 4); ledgerAdd('E-1025', 'annual', 'taken', -4, 'LV-2026-0004', 'إجازة معتمدة (تجريبي)');
    adjustBalance('E-1017', 'annual', 3); ledgerAdd('E-1017', 'annual', 'taken', -3, 'LV-2026-0002', 'إجازة معتمدة (تجريبي)');

    /* attendance seed corrections: a missing punch + a long absence streak (demo cases) */
    const attAt = (id, date) => (st.get('attendance') || []).find((a) => a.employeeId === id && a.date === date);
    const putAtt = (id, date, patch) => st.update('attendance', (list) => { const r = list.find((a) => a.employeeId === id && a.date === date); if (r) Object.assign(r, patch); else list.push(Object.assign({ id: 'AT-' + id + '-' + date, employeeId: id, date, in: null, out: null, status: 'present', shift: shiftCodeOf(emp(id)) }, patch)); });
    const dMiss = dAgo(2); putAtt('E-1017', dMiss, { in: '06:56', out: null, status: 'present', corrPending: true });
    [5, 4, 3, 2, 1].forEach((n) => { const d = dAgo(n); if (D.dow(d) !== 5) putAtt('E-1022', d, { in: null, out: null, status: 'absent' }); });
    /* exceptions from the derived days of the open periods */
    const ex = []; let n = 0; const cutResolved = D.add(today, -6);
    const mkEx = (e, date, type, minutes, status, res, note) => ex.push({ id: 'EX-' + String(++n).padStart(4, '0'), employeeId: e.id, date, type, minutes: minutes || 0, status, dueAt: D.add(date, 1) + 'T17:00:00', resolution: res || null, note: note || '', resolvedBy: status === 'resolved' ? 'U-25' : null, resolvedAt: status === 'resolved' ? ago(60 * 24 * 3) : null, via: 'device' });
    const from = '2026-10-01';
    activeEmps().forEach((e) => D.range(from, D.add(today, -1)).forEach((date) => {
      const i = dayInfo(e, date); const old = date < cutResolved;
      if (i.status === 'late') mkEx(e, date, 'late', i.lateMin, old ? 'resolved' : 'open', old ? (hash(e.id + date) % 2 ? 'justified' : 'deduct') : null);
      else if (i.status === 'missing') mkEx(e, date, 'missing_punch', 0, old ? 'resolved' : 'open', old ? 'correction' : null);
      else if (i.status === 'absent') mkEx(e, date, 'absent_no_notice', 0, old ? 'resolved' : 'open', old ? 'leave_converted' : null);
      else if (i.status === 'pending_correction') mkEx(e, date, 'missing_punch', 0, 'in_review');
    }));
    mkEx(emp('E-1008'), dAgo(2), 'early_leave', 55, 'open'); mkEx(emp('E-1018'), dAgo(1), 'out_of_zone', 0, 'open', null, 'بصمة موبايل — خارج النطاق ~340 م (قراءة واحدة بموافقة الموظف)');
    st.update('hrTime', (t) => { t.exceptions = ex; t.seq.ex = n; });
    const exMiss = ex.find((x) => x.employeeId === 'E-1017' && x.date === dMiss);
    st.update('hrTime', (t) => {
      t.corrections.push({ id: 'ATC-0001', employeeId: 'E-1017', date: dMiss, exceptionId: exMiss ? exMiss.id : null, reqIn: '06:56', reqOut: '15:04', reason: 'نسيت البصمة عند الخروج — كنت في تحميل شحنة', status: 'pending', requestedBy: 'U-29', createdAt: ago(60 * 7), approverId: null, decidedAt: null });
      t.absence.push({ id: 'AB-0001', employeeId: 'E-1022', opened: dAgo(2), stage: 'supervisor_call', callLog: [{ at: ago(60 * 20), by: 'U-27', result: 'لا رد — اتصال أول' }], notice: null, decision: null });
    });
    /* shared overtime requests (+ approvals) */
    const OCH = [{ roleId: 'R-11', label: 'مدير الموارد البشرية (السقف والامتثال)' }];
    const mkOt = (o) => Object.assign({ id: '', employeeIds: [], date: today, from: '15:00', to: '17:00', minutes: 120, dayType: 'normal', reason: 'urgent_order', note: '', mode: 'pre', retroReason: '', status: 'requested', requestedBy: 'U-27', createdAt: ago(60 * 5), approvalId: null, verified: {}, payrollPeriod: null, presence: {} }, o);
    const ots = [
      mkOt({ id: 'OT-2026-0001', employeeIds: ['E-1020', 'E-1023'], date: '2026-10-28', from: '15:00', to: '18:00', minutes: 180, status: 'paid', createdAt: ago(60 * 24 * 9), verified: { 'E-1020': 180, 'E-1023': 165 }, payrollPeriod: '2026-10', _ap: ['approved', 60 * 24 * 9] }),
      mkOt({ id: 'OT-2026-0002', employeeIds: ['E-1020'], date: dAgo(3), from: '15:00', to: '17:00', minutes: 120, status: 'worked', createdAt: ago(60 * 24 * 5), _ap: ['approved', 60 * 24 * 5] }),
      mkOt({ id: 'OT-2026-0003', employeeIds: ['E-1021', 'E-1030'], date: D.add(wk0, 5), from: '07:00', to: '15:00', minutes: 480, dayType: 'weekly_rest', reason: 'shipment', note: 'تحميل شحنة تصدير يوم الجمعة', status: 'requested', createdAt: ago(60 * 5), _ap: ['pending', 60 * 5] }),
      mkOt({ id: 'OT-2026-0004', employeeIds: ['E-1017'], date: dAgo(1), from: '15:00', to: '17:00', minutes: 120, reason: 'machine_breakdown', mode: 'retro', retroReason: 'عطل مفاجئ في الخط — لم يتسع الوقت لإذن مسبق', status: 'requested', createdAt: ago(60 * 3), _ap: ['pending', 60 * 3] }),
      mkOt({ id: 'OT-2026-0005', employeeIds: ['E-1022'], date: dAgo(8), from: '23:00', to: '01:00', minutes: 120, dayType: 'night', reason: 'absence_cover', status: 'rejected', createdAt: ago(60 * 24 * 8), _ap: ['rejected', 60 * 24 * 8] })
    ];
    ots.forEach((o) => {
      const ap = o._ap; delete o._ap;
      o.approvalId = mkAp('أوفرتايم ' + o.id + ' — ' + o.employeeIds.length + ' موظف · ' + hrs(o.minutes) + ' ساعة', { type: 'overtime', id: o.id }, o.requestedBy, OCH, ap[0], ap[1], [['العاملون', o.employeeIds.map(empName).join('، ')], ['التاريخ', D.fmt(o.date) + ' · ' + o.from + '–' + o.to], ['نوع اليوم', DAY_TYPE[o.dayType]], ['السبب', (otReasons.find((r) => r[0] === o.reason) || [])[1]]]);
    });
    st.update('hrTime', (t) => { t.otRequests = ots; t.seq.ot = ots.length; t.tasks.push({ id: 'TK-0002', type: 'ot_notify', refId: 'OT-2026-0001', title: 'إخطار الجهة الإدارية بأوفرتايم الأسبوع المنتهي في ' + D.fmt('2026-10-28'), items: ['OT-2026-0001'], dueAt: D.add('2026-10-28', 7), status: 'open', executedBy: null, closedBy: null, proof: null }); });
    /* notifications that tell the story (N-49 device offline, N-T2 late OT notice) */
    const nf = (title, body, level, to, link, mins) => { const rec = SA.notify({ title, body, level, to, link }); st.patch('notifications', rec.id, { ts: ago(mins) }); };
    nf('N-49 جهاز الحضور غير متصل', 'بوابة الإدارة (GATE-02) مقطوعة من 42 دقيقة — البصمات ستُسجَّل عند رجوع الاتصال.', 'urgent', ['R-11', 'R-10'], '#/hr/attendance?tab=devices', 40);
    nf('N-T2 موعد إخطار الأوفرتايم فات', 'دفعة إخطار الجهة عن أوفرتايم 28 أكتوبر تجاوزت مهلة {7 أيام}. أغلقها بإثبات أو سبب موثّق.', 'urgent', ['R-11', 'R-12'], '#/hr/overtime?tab=notify', 90);
    nf('N-16 مسودة جدول بانتظار المراجعة', 'مسودة جدول ' + SA.deptName('D-09') + ' للأسبوعين التاليين من المشرف — فيها مخالفات تحتاج قرارك قبل النشر.', 'action', ['R-11'], '#/hr/shifts?tab=roster&roster=RS-2026-0045', 60 * 19);
    st.set('meta.timeSeeded', true);
  }
  /* hook: seed right after the store is initialised (this file loads before app.js runs SA.store.init) */
  (function () { const orig = st.init; st.init = function (f) { const s = orig.call(st, f); try { seedTime(); } catch (e) { console.error('[hr-time] seed failed', e); } return s; }; })();
  const ready = () => { if (!T()) { try { seedTime(); } catch (e) { console.error('[hr-time] seed failed', e); } } if (T() && !T('seq')) st.update('hrTime', (t) => { t.seq = { ex: 0, att: 0, ot: 0, lv: 4 }; }); injectCss(); return !!T(); };
  st.subscribe('approvals', () => { try { reconcile(); } catch (e) { console.error('[hr-time] reconcile', e); } });
  const nextId = (coll, prefix, width) => { const t = T(); const k = coll; const n = (t[k] || []).reduce((m, r) => { const x = new RegExp('^' + prefix + '-(\\d+)$').exec(r.id || ''); return x ? Math.max(m, +x[1]) : m; }, 0); return prefix + '-' + String(n + 1).padStart(width || 4, '0'); };
  const tupd = (fn) => st.update('hrTime', fn);

  /* ═════════════════════════════════ shared screen helpers ═════════════════════════════════ */
  function bootScreen(root, build) {
    const host = h('div.sap-hrt-screen'); root.append(host); let off = null, dead = false;
    const skel = () => { SA.clear(host); host.append(SA.skeleton({ kind: 'cards', rows: 4 }), SA.skeleton({ rows: 5 })); };
    const run = () => { skel(); SA.delay(200, { write: true }).then(() => { if (dead) return; SA.clear(host); off = build(host); }, (e) => { if (dead) return; SA.clear(host); host.append(SA.errorState({ text: SA.errorText(e), onRetry: run })); }); };
    run(); return () => { dead = true; if (typeof off === 'function') off(); };
  }
  /** header + tabs + body; body is re-drawn whenever any of `paths` change. o:{route,title,desc,tags,actions(tab)->[],tabs:[{id,label,icon,badge?()}],render:{id:(body,api)=>void},paths} */
  function tabbed(host, ctx, o) {
    let tab = ctx.params.tab && o.tabs.some((t) => t.id === ctx.params.tab) ? ctx.params.tab : o.tabs[0].id;
    const head = h('div'), tabsHost = h('div'), body = h('div.sap-hrt-body', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }); host.append(head, tabsHost, body);
    const api = { get tab() { return tab; }, redraw: draw, setTab(id) { tab = id; tabs.setActive(id); draw(); upUrl(); } };
    const upUrl = () => { try { history.replaceState(null, '', '#/' + o.route + '?tab=' + tab); } catch (e) { /* noop */ } };
    const tabs = SA.tabs({ label: o.title, tabs: o.tabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon, badge: t.badge ? t.badge() : null })), active: tab, onChange: (id) => { tab = id; upUrl(); draw(); } });
    tabsHost.append(tabs.el);
    function draw() {
      const gw = SA.$('.sap-hrt-gridwrap', body); const sx = gw ? gw.scrollLeft : 0, sy = gw ? gw.scrollTop : 0; const mh = body.offsetHeight; body.style.minHeight = mh + 'px';
      SA.clear(head); head.append(SA.pageHead({ title: o.title, desc: o.desc, tags: o.tags, actions: o.actions ? o.actions(tab, api) : [] }));
      o.tabs.forEach((t) => { if (t.badge) tabs.setBadge(t.id, t.badge()); });
      SA.clear(body); try { o.render[tab](body, api); } catch (e) { console.error(e); body.append(SA.errorState({ text: 'تعذّر عرض هذا التبويب', onRetry: draw })); }
      const g2 = SA.$('.sap-hrt-gridwrap', body); if (g2) { g2.scrollLeft = sx; g2.scrollTop = sy; } body.style.minHeight = '';
    }
    draw();
    const offs = (o.paths || []).map((p) => st.subscribe(p, () => { if (document.body.contains(host)) draw(); }));
    return () => offs.forEach((f) => f());
  }
  const tbl = (o) => SA.table(o).el;
  const specLink = (page, anchor, label) => h('a.sap-linkbtn.sap-hrt-spec', { href: '../../' + page + '.html#' + anchor, target: '_blank', rel: 'noopener' }, SA.icon('external', 'icon-sm'), ' ' + (label || 'المواصفة الكاملة'));
  const pendingNote = (txt) => h('p.sap-hrt-note', {}, SA.tag('pending'), ' ', txt);
  const denyBox = (perm, text) => SA.card({}, SA.denied({ perm, title: 'هذا الجزء ليس من صلاحياتك', text: text || 'اطلب الصلاحية من مدير النظام.', home: false }));
  const kpis = (arr) => h('div.sap-grid-cards', {}, arr.map((k) => SA.kpi(k[0], k[1], k[2] || {})));
  const sec = (title, desc, right) => h('div.sap-section-head', {}, h('div', {}, h('h3', {}, title), desc ? h('p.sap-hrt-note', {}, desc) : null), right || null);
  const optVal = (v, fmt) => (v == null ? SA.openValue() : fmt ? fmt(v) : String(v));
  function dateInput(name, label, value, o) { return SA.form.field(Object.assign({ name, label, type: 'text', value, placeholder: 'YYYY-MM-DD', rules: [(v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? null : 'اكتب التاريخ بصيغة YYYY-MM-DD')] }, o || {})); }
  const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !isNaN(D.parse(v).getTime());
  function simpleModal(o) {
    const m = SA.modal({ title: o.title, subtitle: o.subtitle, icon: o.icon || 'edit', size: o.size || 'md', body: o.body, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(null) }, o.cancelLabel || 'إلغاء'), h('button.btn.' + (o.accent ? 'btn-accent' : 'btn-primary'), { type: 'button', id: 'sap-hrt-ok', onclick: async (e) => { if (o.onOk) { const b = e.currentTarget; b.disabled = true; let r; try { r = await o.onOk(m); } finally { b.disabled = false; } if (r !== false) m.close(true); } } }, o.okLabel || 'حفظ')] });
    return m;
  }

  /* ═════════════════════════════════ HR-09 · الورديات والجداول ═════════════════════════════════ */
  const shiftsAll = () => T('shifts') || [];
  const shiftActive = () => shiftsAll().filter((s) => s.status === 'active');
  const shiftSpan = (s) => spanMin(s.start, s.end);
  const shiftEff = (s) => shiftSpan(s) - (s.breakPaid ? 0 : s.breakMin || 0);
  const shiftEndAbs = (s) => tmin(s.end) <= tmin(s.start) ? tmin(s.end) + 1440 : tmin(s.end);
  const rosterById = (id) => (T('rosters') || []).find((r) => r.id === id) || null;
  const groupById = (id) => (T('groups') || []).find((g) => g.id === id) || null;
  const rosterMembers = (r) => { const g = groupById(r.groupId); return g ? activeEmps().filter((e) => e.departmentId === g.deptId) : []; };
  const RS_ST = { draft: ['مسودة', 'warning'], pending_approval: ['قيد الاعتماد', 'info'], published: ['منشور', 'success'], amended: ['منشور (معدّل)', 'success'], archived: ['مؤرشف', 'neutral'] };
  function cellFrom(e, d, r) {
    const lv = leaveOn(e.id, d); if (lv) return 'L';
    if (d >= r.periodStart && d <= r.periodEnd) { const c = r.cells[e.id] && r.cells[e.id][d]; if (c) return c; if (holidayOn(d)) return 'H'; return null; }
    const rc = rosterCell(e.id, d); if (rc && rc.roster.id !== r.id) return rc.code; return holidayOn(d) ? 'H' : null;
  }
  function rosterChecks(r) {
    const g = groupById(r.groupId); const mem = rosterMembers(r); const S = SET(); const items = []; const days = D.range(r.periodStart, r.periodEnd);
    const sh = (c) => shiftByCode(c);
    const work = (c) => c && c !== 'R' && c !== 'L' && c !== 'H';
    mem.forEach((e) => {
      let run = 0;
      D.range(D.add(r.periodStart, -7), r.periodEnd).forEach((d) => {
        const c = cellFrom(e, d, r); run = work(c) ? run + 1 : 0;
        if (d >= r.periodStart && S.maxConsecutiveDays != null && run === S.maxConsecutiveDays + 1) items.push({ level: 'bad', code: 'consec', empId: e.id, date: d, text: 'هذا الجدول يخلّي ' + e.name + ' يشتغل ' + (S.maxConsecutiveDays + 1) + ' أيام ورا بعض (حتى ' + D.fmt(d) + '). لازم راحة 24 ساعة بعد ' + S.maxConsecutiveDays + ' أيام.' });
      });
      D.range(D.add(r.periodStart, -1), r.periodEnd).forEach((d) => {
        const a = cellFrom(e, d, r), b = cellFrom(e, D.add(d, 1), r); if (!work(a) || !work(b) || D.add(d, 1) < r.periodStart) return;
        const sa = sh(a), sb = sh(b); if (!sa || !sb) return;
        const gap = 1440 + tmin(sb.start) - shiftEndAbs(sa);
        if (gap <= 0) items.push({ level: 'bad', code: 'gap', empId: e.id, date: D.add(d, 1), text: 'الوردية دي بتبدأ في نفس لحظة نهاية وردية ' + e.name + ' السابقة (' + D.short(d) + ' ' + a + ' ← ' + D.short(D.add(d, 1)) + ' ' + b + '). اختار وردية تانية أو يوم راحة.' });
        else if (S.restMinBetweenShifts != null && gap < S.restMinBetweenShifts * 60) items.push({ level: 'warn', code: 'gap', empId: e.id, date: D.add(d, 1), text: e.name + ': فاصل ' + hrs(gap) + ' ساعة بين ' + a + ' و' + b + ' أقل من الحد المضبوط.' });
      });
      let wkMin = {}; days.forEach((d) => { const c = cellFrom(e, d, r); if (work(c) && sh(c)) { const k = D.weekStart(d); wkMin[k] = (wkMin[k] || 0) + shiftEff(sh(c)); } });
      Object.keys(wkMin).forEach((k) => { if (S.maxWeeklyHours != null && wkMin[k] > S.maxWeeklyHours * 60) items.push({ level: 'bad', code: 'weekly', empId: e.id, date: k, text: e.name + ': ' + hrs(wkMin[k]) + ' ساعة فعلية في أسبوع ' + D.short(k) + ' (الحد ' + S.maxWeeklyHours + ').' }); });
    });
    if (g) {
      const bySh = {};
      days.forEach((d) => { if (D.dow(d) === g.restDay || holidayOn(d)) return; g.operates.forEach((s) => { const n = mem.filter((e) => cellFrom(e, d, r) === s).length; const need = (g.minCoverage || {})[s]; if (need != null && n < need) { (bySh[s] = bySh[s] || []).push({ d, n, need }); } }); });
      Object.keys(bySh).forEach((s) => items.push({ level: S.coverageSeverity === 'bad' ? 'bad' : 'warn', code: 'coverage', shift: s, date: bySh[s][0].d, text: 'خط ' + g.name.replace(/^خط\s*/, '') + ' في وردية ' + s + ' عليه أقل من الحد المطلوب في ' + bySh[s].length + ' يوم: ' + bySh[s].slice(0, 4).map((x) => D.short(x.d) + ' (' + x.n + ' من ' + x.need + ')').join('، ') + (bySh[s].length > 4 ? '…' : '') }));
      const blanks = []; mem.forEach((e) => days.forEach((d) => { if (!cellFrom(e, d, r)) blanks.push(e.id + d); }));
      if (blanks.length) items.push({ level: 'warn', code: 'blank', text: blanks.length + ' خلية غير مجدولة — حدّد وردية أو يوم راحة قبل النشر.' });
    }
    mem.forEach((e) => { const f = restFlag(e); if (f.restrictedOT) items.push({ level: 'ok', code: 'restrict', text: 'قيد جدولة مفعّل لموظف/ة في المجموعة (بدون كشف السبب للمشرف — T4).' }); });
    items.push({ level: 'ok', code: 'skills', text: 'قاعدة مهارات الماكينات (BR-SHF-07): غير مفعّلة قبل HR-19.' });
    return { items, bad: items.filter((x) => x.level === 'bad'), warn: items.filter((x) => x.level === 'warn') };
  }
  function cellProblems(r, checks) { const m = {}; checks.items.forEach((x) => { if (x.empId && x.date) { const k = x.empId + '|' + x.date; if (!m[k] || x.level === 'bad') m[k] = x.level; } }); return m; }

  function rosterGrid(r, editable, checks) {
    const mem = rosterMembers(r); const days = D.range(r.periodStart, r.periodEnd); const g = groupById(r.groupId); const today = D.today(); const probs = cellProblems(r, checks);
    const thead = h('thead', {}, h('tr', {}, h('th.sap-hrt-namecol', {}, 'الموظف'), days.map((d, i) => h('th', { class: [D.dow(d) === (g ? g.restDay : 5) ? 'is-rest' : '', d === today ? 'is-today' : '', D.dow(d) === 0 && i ? 'is-wk' : ''] }, D.dayName(d).slice(0, 4) , h('small', {}, D.short(d))))));
    const tbody = h('tbody', {}, mem.map((e) => h('tr', {}, h('td.sap-hrt-namecol', {}, h('b', {}, e.name), h('small', { style: { display: 'block', color: 'var(--color-text-muted)' } }, e.empNo + (restFlag(e).restrictedOT ? ' · قيد جدولة' : ''))), days.map((d) => {
      const lv = leaveOn(e.id, d); const hol = holidayOn(d); let c = r.cells[e.id] && r.cells[e.id][d]; const pr = probs[e.id + '|' + d];
      let code = lv ? 'L' : hol && !c ? 'H' : c || ''; const title = lv ? 'إجازة معتمدة ' + lv.id + ' — الخلية مقفولة' : hol ? 'عطلة رسمية: ' + hol.name : c ? (c === 'R' ? 'راحة أسبوعية' : (shiftByCode(c) || {}).name || c) : 'غير مجدول';
      const label = code === 'L' ? 'ج' : code === 'H' ? 'ع' : code === 'R' ? 'ر' : code || '+';
      const b = h('button.sap-hrt-cell', { type: 'button', class: [code ? 'is-' + code : '', pr ? 'is-' + (pr === 'bad' ? 'bad' : 'warn') : ''], title: title + (pr ? ' — فيه مخالفة' : ''), 'aria-label': e.name + ' ' + D.fmt(d) + ': ' + title, disabled: !editable && !code ? false : false, dataset: { emp: e.id, date: d } }, code ? label : h('span', { style: { color: '#bbb' } }, '+'), pr === 'bad' ? h('i.sap-hrt-pip') : null);
      b.addEventListener('click', () => {
        if (lv) { SA.toast('إجازة معتمدة (' + lv.id + ') — لا تُنشر وردية فوق إجازة.', 'info'); return; }
        if (hol && !c) { SA.toast('عطلة رسمية: ' + hol.name, 'info'); return; }
        if (!editable) { SA.toast(r.status === 'draft' ? 'ليست من صلاحياتك (hr.shifts.edit)' : 'الجدول المنشور لا يُعدَّل مكانه — أنشئ إصدارًا معدّلًا (BR-SHF-06).', 'warn'); return; }
        SA.menu(b, shiftActive().map((s) => ({ label: s.code + ' — ' + s.name + ' (' + s.start + '–' + s.end + ')', icon: 'clock', onClick: () => setCell(r.id, e.id, d, s.code) })).concat([{ divider: true }, { label: 'راحة أسبوعية (ر)', icon: 'moon', onClick: () => setCell(r.id, e.id, d, 'R') }, { label: 'مسح الخلية', icon: 'x', onClick: () => setCell(r.id, e.id, d, null) }]));
      });
      return h('td', { class: D.dow(d) === (g ? g.restDay : 5) ? 'is-rest' : '' }, b);
    }))));
    return h('div.sap-hrt-gridwrap', { role: 'region', 'aria-label': 'باني الجدول', tabindex: '0' }, h('table.sap-hrt-grid', {}, thead, tbody));
  }
  function setCell(rid, eid, d, v) { tupd((t) => { const r = t.rosters.find((x) => x.id === rid); if (!r || r.status !== 'draft') return; r.cells[eid] = r.cells[eid] || {}; if (v) r.cells[eid][d] = v; else delete r.cells[eid][d]; r.dirty = true; }); }
  const legend = () => h('div.sap-hrt-legend', {}, shiftActive().map((s) => h('span', {}, h('i.sap-hrt-cell.is-' + s.code, { style: { display: 'inline-grid', width: '22px', height: '22px', minWidth: 0 } }, s.code), s.name + ' ' + s.start + '–' + s.end)), h('span', {}, h('i.sap-hrt-cell.is-R', { style: { display: 'inline-grid', width: '22px', height: '22px', minWidth: 0 } }, 'ر'), 'راحة'), h('span', {}, h('i.sap-hrt-cell.is-L', { style: { display: 'inline-grid', width: '22px', height: '22px', minWidth: 0 } }, 'ج'), 'إجازة معتمدة (مقفولة)'), h('span', {}, h('i.sap-hrt-cell.is-H', { style: { display: 'inline-grid', width: '22px', height: '22px', minWidth: 0 } }, 'ع'), 'عطلة رسمية'));

  async function newRosterFlow() {
    if (!SA.can('hr.shifts.edit')) { SA.toast(NOPERM + ' (hr.shifts.edit)', 'warn'); return; }
    const groups = T('groups') || [];
    const f = { group: SA.form.field({ name: 'g', label: 'المجموعة / الخط', type: 'select', required: true, options: groups.map((g) => [g.id, g.name + ' (' + activeEmps().filter((e) => e.departmentId === g.deptId).length + ' موظف)']) }), weeks: SA.form.field({ name: 'w', label: 'عدد الأسابيع', type: 'select', required: true, options: [['2', 'أسبوعان'], ['3', '3 أسابيع'], ['4', '4 أسابيع']] }), start: dateInput('s', 'بداية الفترة (يوم الأحد)', D.weekStart(D.add(D.today(), 7))), fill: SA.form.field({ name: 'f', label: 'التعبئة المبدئية', type: 'radio', value: 'pattern', options: [['pattern', 'من نمط دوران المجموعة', 'ويُترك يوم الراحة الأسبوعي للمجموعة'], ['copy', 'نسخ آخر جدول للمجموعة', 'نفس الورديات بالأسبوع'], ['empty', 'جدول فارغ']] }) };
    const grp = SA.form.group(Object.values(f));
    const m = simpleModal({ title: 'جدول جديد', subtitle: 'مسودة تُحفظ تلقائيًا ولا تصل للعاملين إلا بعد النشر', icon: 'clock', okLabel: 'إنشاء المسودة', body: h('div.sap-formgrid', {}, f.group.el, f.weeks.el, f.start.el, f.fill.el), async onOk() {
      if (!grp.validate()) return false; const v = grp.get();
      if (!validDate(v.s) || D.dow(v.s) !== 0) { f.start.error('اختر يوم أحد صحيحًا (بداية الأسبوع).'); return false; }
      const g = groupById(v.g); const weeks = +v.w; const end = D.add(v.s, weeks * 7 - 1);
      const clash = (T('rosters') || []).find((r) => r.groupId === g.id && r.status !== 'archived' && r.periodStart <= end && v.s <= r.periodEnd);
      if (clash) { f.start.error('الفترة تتداخل مع الجدول ' + clash.id + ' (' + D.fmt(clash.periodStart) + ' → ' + D.fmt(clash.periodEnd) + ').'); return false; }
      const mem = activeEmps().filter((e) => e.departmentId === g.deptId); const cells = {};
      const last = (T('rosters') || []).filter((r) => r.groupId === g.id && r.status !== 'draft').sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))[0];
      mem.forEach((e, i) => { cells[e.id] = {}; D.range(v.s, end).forEach((d) => {
        if (v.f === 'empty' || leaveOn(e.id, d)) return; if (D.dow(d) === g.restDay) { cells[e.id][d] = 'R'; return; }
        const w = Math.floor(D.diff(v.s, d) / 7);
        if (v.f === 'pattern') cells[e.id][d] = g.pattern[(w + i) % g.pattern.length];
        else if (v.f === 'copy' && last && last.cells[e.id]) { const src = Object.keys(last.cells[e.id]).sort().filter((x) => D.dow(x) === D.dow(d)).pop(); cells[e.id][d] = last.cells[e.id][src] && last.cells[e.id][src] !== 'R' ? last.cells[e.id][src] : shiftCodeOf(e); } else cells[e.id][d] = shiftCodeOf(e);
      }); });
      const id = nextId('rosters', 'RS-2026', 4);
      try { await SA.api(() => { tupd((t) => { t.rosters.push({ id, name: 'جدول ' + g.name + ' · ' + weeks + ' أسابيع', groupId: g.id, periodStart: v.s, periodEnd: end, weeks, status: 'draft', version: 0, createdBy: SA.session.userId, createdAt: nowIso(), publishedBy: null, publishedAt: null, history: [{ at: nowIso(), by: SA.session.userId, text: 'إنشاء مسودة' }], overrides: [], cells }); }); SA.audit('HR.ROSTER.DRAFT_SAVED', { target: { type: 'roster', id, label: g.name }, after: { period: v.s + ' → ' + end, أسابيع: weeks } }); }); } catch (e) { SA.fail(e); return false; }
      SA.toast('تم إنشاء المسودة ' + id, 'success'); SA.nav('hr/shifts', { replace: true, query: { tab: 'roster', roster: id } });
    } });
  }
  async function copyWeekFlow(r) {
    const weeks = Array.from({ length: r.weeks }, (_, i) => i);
    const f = { from: SA.form.field({ name: 'f', label: 'نسخ من أسبوع', type: 'select', value: '0', options: weeks.map((w) => [String(w), 'الأسبوع ' + (w + 1) + ' (' + D.short(D.add(r.periodStart, w * 7)) + ')']) }), to: SA.form.field({ name: 't', label: 'إلى الأسابيع', type: 'multi', required: true, options: weeks.map((w) => [String(w), 'الأسبوع ' + (w + 1) + ' (' + D.short(D.add(r.periodStart, w * 7)) + ')']) }) };
    simpleModal({ title: 'نسخ أسبوع', subtitle: 'تُستثنى الأيام التي فيها إجازة معتمدة', icon: 'copy', okLabel: 'نسخ', body: h('div.sap-formgrid', {}, f.from.el, f.to.el), async onOk() {
      if (!f.to.validate()) return false; const src = +f.from.get(); const tos = f.to.get().map(Number).filter((x) => x !== src); if (!tos.length) { f.to.error('اختر أسبوعًا مختلفًا عن المصدر.'); return false; }
      try { await SA.api(() => { tupd((t) => { const x = t.rosters.find((q) => q.id === r.id); rosterMembers(r).forEach((e) => { x.cells[e.id] = x.cells[e.id] || {}; for (let k = 0; k < 7; k++) { const sd = D.add(r.periodStart, src * 7 + k); const sv = x.cells[e.id][sd]; tos.forEach((w) => { const td = D.add(r.periodStart, w * 7 + k); if (leaveOn(e.id, td)) return; if (sv) x.cells[e.id][td] = sv; else delete x.cells[e.id][td]; }); } }); }); SA.audit('HR.ROSTER.WEEK_COPIED', { target: { type: 'roster', id: r.id, label: r.name }, after: { من: 'الأسبوع ' + (src + 1), إلى: tos.map((w) => 'الأسبوع ' + (w + 1)).join('، ') } }); }); } catch (e) { SA.fail(e); return false; }
      SA.toast('تم نسخ الأسبوع', 'success');
    } });
  }
  async function applyPattern(r) {
    const g = groupById(r.groupId); const res = await SA.confirm({ title: 'تطبيق نمط الدوران', text: 'سيُعاد ملء كل خلايا الجدول من نمط المجموعة (' + g.pattern.join(' ← ') + ') ويوم الراحة ' + DAYN[g.restDay] + '.', impact: ['الخلايا الحالية تُستبدل (إلا أيام الإجازات المعتمدة).', 'لا يصل شيء للعاملين قبل النشر.'], confirmLabel: 'تطبيق النمط' });
    if (!res.ok) return;
    try { await SA.api(() => { tupd((t) => { const x = t.rosters.find((q) => q.id === r.id); rosterMembers(r).forEach((e, i) => { x.cells[e.id] = {}; D.range(r.periodStart, r.periodEnd).forEach((d) => { if (leaveOn(e.id, d)) return; if (D.dow(d) === g.restDay) x.cells[e.id][d] = 'R'; else x.cells[e.id][d] = g.pattern[(Math.floor(D.diff(r.periodStart, d) / 7) + i) % g.pattern.length]; }); }); }); SA.audit('HR.ROSTER.DRAFT_SAVED', { target: { type: 'roster', id: r.id, label: r.name }, reason: 'تطبيق نمط الدوران' }); }); } catch (e) { SA.fail(e); return; }
    SA.toast('تم تطبيق النمط', 'success');
  }
  async function amendRoster(r) {
    const res = await SA.confirm({ title: 'تعديل جدول منشور', text: 'الجدول المنشور لا يُعدَّل مكانه. سيُنشأ إصدار جديد (Amended) كمسودة، والإصدار القديم يبقى محفوظًا ومعتمدًا حتى تنشر الجديد.', reasonRequired: true, reasonLabel: 'سبب التعديل', confirmLabel: 'إنشاء إصدار معدّل', impact: ['الإشعار يصل للمتأثرين بالتعديل فقط.', 'تنشأ مهمة إعلان جديدة للجهة الإدارية خلال {7 أيام} (م 122).'] });
    if (!res.ok) return; const id = nextId('rosters', 'RS-2026', 4);
    try { await SA.api(() => { tupd((t) => { t.rosters.push(Object.assign(SA.clone(r), { id, status: 'draft', version: r.version + 1, amendOf: r.id, amendReason: res.reason, createdBy: SA.session.userId, createdAt: nowIso(), publishedAt: null, publishedBy: null, history: [{ at: nowIso(), by: SA.session.userId, text: 'إصدار معدّل من ' + r.id + ' — ' + res.reason }], overrides: [] })); }); SA.audit('HR.ROSTER.DRAFT_SAVED', { target: { type: 'roster', id, label: r.name }, reason: res.reason, after: { amendOf: r.id } }); }); } catch (e) { SA.fail(e); return; }
    SA.toast('تم إنشاء مسودة معدّلة ' + id, 'success'); SA.nav('hr/shifts', { replace: true, query: { tab: 'roster', roster: id } });
  }
  async function publishRoster(r) {
    const chk = rosterChecks(r); const me = SA.session.user; const overrides = [];
    SA.audit('HR.ROSTER.CHECKS_RUN', { target: { type: 'roster', id: r.id, label: r.name }, after: { مخالفات_حاجبة: chk.bad.length, تحذيرات: chk.warn.length } });
    const g = groupById(r.groupId); const ack = SA.form.field({ name: 'ack', label: chk.warn.length ? 'اطلعت على التحذيرات (' + chk.warn.length + ') وأتحمل نشر الجدول بها' : 'راجعت الجدول', type: 'checkbox' });
    const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('p', {}, 'الجدول: ', h('b', {}, r.name), ' · ', D.fmt(r.periodStart), ' → ', D.fmt(r.periodEnd), r.amendOf ? h('span.chip.chip-info', { style: { marginInlineStart: '6px' } }, 'إصدار معدّل ' + r.version) : null),
      chk.bad.length ? SA.alert('danger', h('b', {}, 'مش هتقدر تنشر: فيه ' + chk.bad.length + ' مخالفات لازم تتحل'), h('ul', { style: { margin: '6px 0 0', paddingInlineStart: '18px' } }, chk.bad.map((x) => h('li', {}, x.text)))) : SA.alert('success', 'لا توجد مخالفات حاجبة.'),
      chk.warn.length ? SA.alert('warning', h('ul', { style: { margin: 0, paddingInlineStart: '18px' } }, chk.warn.map((x) => h('li', {}, x.text)))) : null,
      chk.bad.length ? h('div', {}, h('b', {}, 'تجاوز بسبب (بصلاحية منفصلة — فصل المهام)'), r.createdBy === me.id ? SA.alert('warning', 'أنت من أنشأ هذه المسودة، فلا يمكنك أنت تجاوز قواعدها. اطلب من مدير آخر.') : h('p.sap-hrt-note', {}, 'اكتب سببًا لكل المخالفات الحاجبة ليتسجّل HR.ROSTER.RULE_OVERRIDDEN.')) : null,
      ack.el, h('p.sap-hrt-note', {}, SA.icon('info', 'icon-sm'), ' بعد النشر: إشعار N-16 للمتأثرين، وتُنشأ مهمة «الإعلان والإرسال للجهة خلال ', SET().postSendDays == null ? SA.openValue() : SET().postSendDays + ' أيام', '» (م 122). النظام لا يرسل للجهة إلكترونيًا ولا يدّعي تكاملًا.'));
    let overrideReason = null; const reasonF = SA.form.field({ name: 'r', label: 'سبب التجاوز', type: 'textarea', rows: 2 });
    if (chk.bad.length && r.createdBy !== me.id) body.insertBefore(reasonF.el, ack.el);
    const m = simpleModal({ title: r.amendOf ? 'نشر الإصدار المعدّل' : 'نشر الجدول وإشعار العاملين', icon: 'clock', accent: true, okLabel: 'نشر وإشعار', size: 'lg', body, async onOk() {
      if (chk.bad.length) { if (r.createdBy === me.id) { SA.toast('لا يمكنك تجاوز قواعد جدول أنشأته أنت (فصل المهام).', 'error'); return false; } if (!SA.can('hr.shifts.edit')) { SA.toast(NOPERM, 'warn'); return false; } overrideReason = (reasonF.get() || '').trim(); if (overrideReason.length < 3) { reasonF.error('اكتب سبب التجاوز'); return false; } if (!(await SA.stepUp('policy.change', { force: true, title: 'تأكيد تجاوز قاعدة امتثال', text: 'تجاوز قواعد الراحة/الساعات في الجدول عملية حساسة. أعد التحقق.' }))) return false; }
      if (chk.warn.length && !ack.get()) { ack.error('أكّد الاطلاع على التحذيرات'); return false; }
      const prev = r.amendOf ? rosterById(r.amendOf) : null; const affected = rosterMembers(r).filter((e) => !prev || JSON.stringify(r.cells[e.id] || {}) !== JSON.stringify(prev.cells[e.id] || {}));
      try { await SA.api(() => {
        tupd((t) => {
          const x = t.rosters.find((q) => q.id === r.id); x.status = r.amendOf ? 'amended' : 'published'; x.version = Math.max(1, r.version || 0); x.publishedBy = me.id; x.publishedAt = nowIso(); x.dirty = false; if (!r.amendOf) x.version = 1; x.history.push({ at: nowIso(), by: me.id, text: (r.amendOf ? 'نشر الإصدار المعدّل ' : 'نشر الإصدار ') + x.version + (overrideReason ? ' بتجاوز: ' + overrideReason : '') });
          if (overrideReason) x.overrides = chk.bad.map((b) => ({ rule: b.code, text: b.text, reason: overrideReason, by: me.id, at: nowIso() }));
          if (prev) { const p = t.rosters.find((q) => q.id === prev.id); p.status = 'archived'; p.history.push({ at: nowIso(), by: me.id, text: 'استُبدل بالإصدار ' + x.version + ' (' + x.id + ')' }); }
          t.tasks.push({ id: nextIdLocal(t.tasks, 'TK'), type: 'roster_post', refId: r.id, title: 'إعلان ' + (r.amendOf ? 'تعديل ' : '') + 'جدول ' + (g ? g.name : '') + ' وإرسال نسخة للجهة الإدارية', dueAt: D.add(D.today(), SET().postSendDays || 7), status: 'open', executedBy: null, closedBy: null, proof: null });
        });
        if (overrideReason) chk.bad.forEach((b) => SA.audit('HR.ROSTER.RULE_OVERRIDDEN', { target: { type: 'roster', id: r.id, label: r.name }, reason: overrideReason, after: { rule: b.code } }));
        SA.audit(r.amendOf ? 'HR.ROSTER.AMENDED' : 'HR.ROSTER.PUBLISHED', { target: { type: 'roster', id: r.id, label: r.name }, after: { version: r.amendOf ? r.version : 1, affected: affected.length } });
      }); } catch (e) { SA.fail(e); return false; }
      SA.notify({ title: 'N-16 ' + (r.amendOf ? 'تعديل' : 'نشر') + ' جدول ' + (g ? g.name : ''), body: D.fmt(r.periodStart) + ' → ' + D.fmt(r.periodEnd) + ' · يخصّ ' + affected.length + ' موظف', level: 'info', to: ['R-14'], toUsers: affected.map((e) => e.userId).filter(Boolean), link: '#/hr/shifts?tab=roster' });
      SA.toast('تم نشر الجدول وإشعار ' + affected.length + ' موظف', 'success');
    } });
  }
  function nextIdLocal(list, prefix) { const n = list.reduce((m, r) => { const x = new RegExp('^' + prefix + '-(\\d+)$').exec(r.id || ''); return x ? Math.max(m, +x[1]) : m; }, 0); return prefix + '-' + String(n + 1).padStart(4, '0'); }

  function shiftsRosterTab(body, api, ctx) {
    const all = (T('rosters') || []).slice().sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
    const vis = new Set(visibleEmps().map((e) => e.id));
    const list = all.filter((r) => rosterMembers(r).some((e) => vis.has(e.id)));
    if (!list.length) { body.append(SA.card({}, SA.empty({ icon: 'clock', title: 'لا توجد جداول بعد', text: 'أنشئ أول جدول ورديات لمجموعة أو خط إنتاج. تُحفظ المسودة تلقائيًا ولا يراها العاملون إلا بعد النشر.', action: SA.can('hr.shifts.edit') ? { label: 'جدول جديد', onClick: newRosterFlow } : null }))); return; }
    let rid = ctx.params.roster && list.some((r) => r.id === ctx.params.roster) ? ctx.params.roster : (list.find((r) => r.status === 'draft') || list[0]).id;
    if (api.rosterSel && list.some((r) => r.id === api.rosterSel)) rid = api.rosterSel;
    api.rosterSel = rid; const r = rosterById(rid); const g = groupById(r.groupId); const editable = r.status === 'draft' && SA.can('hr.shifts.edit'); const chk = rosterChecks(r);
    const sel = SA.form.field({ name: 'rs', label: '', type: 'select', value: rid, options: list.map((x) => [x.id, x.id + ' · ' + x.name + ' — ' + RS_ST[x.status][0]]), onChange: (v) => { api.rosterSel = v; api.redraw(); } }); sel.input.classList.add('sap-hrt-sel'); sel.input.setAttribute('aria-label', 'اختيار الجدول'); sel.el.style.minWidth = 'min(100%,420px)';
    const creator = SA.userName(r.createdBy);
    body.append(h('div.sap-hrt-tools', {}, h('div.sap-hrt-cluster', {}, sel.el, stChip(RS_ST, r.status), r.amendOf ? SA.chip('إصدار ' + r.version + ' معدّل من ' + r.amendOf, 'info') : (r.version ? SA.chip('إصدار ' + r.version, 'neutral') : null)),
      h('div.sap-hrt-cluster', {}, r.status === 'draft' ? [SA.btn({ label: 'تطبيق نمط الدوران', icon: 'refresh', kind: 'ghost', size: 'sm', perm: 'hr.shifts.edit', onClick: () => applyPattern(r) }), SA.btn({ label: 'نسخ أسبوع', icon: 'copy', kind: 'ghost', size: 'sm', perm: 'hr.shifts.edit', onClick: () => copyWeekFlow(r) }), SA.btn({ label: 'حفظ المسودة', icon: 'check', kind: 'ghost', size: 'sm', perm: 'hr.shifts.edit', onClick: async () => { try { await SA.api(() => { SA.audit('HR.ROSTER.DRAFT_SAVED', { target: { type: 'roster', id: r.id, label: r.name } }); tupd((t) => { const x = t.rosters.find((q) => q.id === r.id); x.dirty = false; x.history.push({ at: nowIso(), by: SA.session.userId, text: 'حفظ مسودة' }); }); }); SA.toast('تم حفظ المسودة', 'success'); } catch (e) { SA.fail(e); } } }), SA.btn({ label: 'نشر وإشعار', icon: 'mail', kind: 'accent', size: 'sm', perm: 'hr.shifts.edit', onClick: () => publishRoster(r) })] : [r.status === 'published' || r.status === 'amended' ? SA.btn({ label: 'تعديل (إصدار جديد)', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'hr.shifts.edit', onClick: () => amendRoster(r) }) : null]),
    ), h('p.sap-hrt-note', {}, g ? g.name : '', ' · ', D.fmt(r.periodStart), ' → ', D.fmt(r.periodEnd), ' · ', r.weeks, ' أسابيع · أنشأه ', creator, r.publishedAt ? ' · نُشر ' + SA.fmt.rel(r.publishedAt) : ' · لم يُنشر بعد', r.status === 'draft' ? ' · التعديل يُحفظ تلقائيًا كمسودة' : ''));
    if (r.status === 'draft' && !SA.can('hr.shifts.edit')) body.append(SA.alert('info', 'عرض فقط: إنشاء وتعديل الجداول يحتاج hr.shifts.edit (المشرف يرى الجدول ويقترح التعديل على HR).'));
    if (r.rejectReason) body.append(SA.alert('warning', 'أُعيد للمسودة: ' + r.rejectReason));
    body.append(rosterGrid(r, editable, chk), legend());
    const cardChecks = SA.card({ title: 'فحوصات الامتثال والتغطية', actions: [h('span.chip' + (chk.bad.length ? '.chip-danger' : chk.warn.length ? '.chip-warning' : '.chip-success'), {}, chk.bad.length ? chk.bad.length + ' مخالفة حاجبة' : chk.warn.length ? chk.warn.length + ' تحذير' : 'سليم')] }, h('div.sap-hrt-checks', {}, chk.items.length ? chk.items.map((x) => h('div.sap-hrt-check.is-' + x.level, { role: x.level === 'bad' ? 'alert' : null }, SA.icon(x.level === 'bad' ? 'xcircle' : x.level === 'warn' ? 'alert' : 'checkcircle', 'icon-sm'), h('div', {}, x.text, x.empId && x.date ? h('button.sap-linkbtn', { type: 'button', style: { marginInlineStart: '8px' }, onclick: () => { const c = SA.$('.sap-hrt-cell[data-emp="' + x.empId + '"][data-date="' + x.date + '"]', body); if (c) { c.scrollIntoView({ block: 'center', inline: 'center', behavior: SA.reducedMotion ? 'auto' : 'smooth' }); c.focus(); } } }, 'اذهب للخلية') : null))) : SA.empty({ title: 'لا مخالفات' })));
    const cardHist = SA.card({ title: 'سجل الإصدارات' }, h('ul', { style: { margin: 0, paddingInlineStart: '18px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' } }, (r.history || []).slice().reverse().map((x) => h('li', {}, SA.fmt.dt(x.at), ' — ', SA.userName(x.by), ': ', x.text))), (r.overrides || []).length ? h('div', { style: { marginTop: '10px' } }, h('b', {}, 'تجاوزات مسجّلة'), r.overrides.map((o) => h('p.sap-hrt-note', {}, o.text + ' — السبب: ' + o.reason + ' (' + SA.userName(o.by) + ')'))) : null, h('p.sap-hrt-note', { style: { marginTop: '10px' } }, 'اعتماد مدير الإنتاج (R-05): ', SA.chip('غير مفعّل في النموذج', 'neutral'), ' — الدور بلا مفتاح hr.shifts في الكتالوج؛ فحص HR والنشر من HR Manager.'));
    body.append(h('div.sap-hrt-two', {}, cardChecks, cardHist));
  }

  /* — كتالوج الورديات — */
  function shiftEditor(sh) {
    if (!SA.can('hr.shifts.edit')) { SA.toast(NOPERM + ' (hr.shifts.edit)', 'warn'); return; }
    const isNew = !sh; const S = SET(); const o = sh || { code: '', name: '', start: '07:00', end: '15:00', breakMin: 60, breakPaid: false, night: false, grace: 10, effectiveFrom: D.today() };
    const f = {
      code: SA.form.field({ name: 'code', label: 'الكود (A–Z/0–9، حتى 8)', required: true, value: o.code, disabled: !isNew, rules: [(v) => (/^[A-Z0-9]{1,8}$/.test(v || '') ? null : 'أحرف إنجليزية كبيرة وأرقام فقط'), (v) => (isNew && shiftsAll().some((s) => s.code === v) ? 'الكود مستخدم' : null)] }),
      name: SA.form.field({ name: 'name', label: 'الاسم', required: true, value: o.name, rules: [(v) => (v && v.length > 40 ? 'حتى 40 حرفًا' : null)] }),
      start: SA.form.field({ name: 'start', label: 'البداية', required: true, value: o.start, placeholder: 'HH:MM', dir: 'ltr', rules: [(v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? null : 'صيغة HH:MM')] }),
      end: SA.form.field({ name: 'end', label: 'النهاية (تعبر منتصف الليل تلقائيًا)', required: true, value: o.end, placeholder: 'HH:MM', dir: 'ltr', rules: [(v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? null : 'صيغة HH:MM')] }),
      brk: SA.form.field({ name: 'brk', label: 'الاستراحة (دقيقة)', type: 'number', required: true, value: o.breakMin, min: 0, max: 240 }),
      paid: SA.form.field({ name: 'paid', label: 'الاستراحة مدفوعة', type: 'switch', value: o.breakPaid, hint: 'تُحتسب ضمن الساعات الفعلية' }),
      night: SA.form.field({ name: 'night', label: 'وردية ليل', type: 'switch', value: o.night, hint: 'نافذة الليل (من–إلى) غير مُعدّة — Open، فالتصنيف يدوي' }),
      grace: SA.form.field({ name: 'grace', label: 'سماحية الدخول (دقيقة) — قيمة تجريبية', type: 'number', value: o.grace, min: 0, max: 60, hint: 'سياسة التأخير D3 مفتوحة' }),
      eff: dateInput('eff', 'تاريخ السريان', o.effectiveFrom || D.today(), { hint: 'لا تعديل بأثر رجعي — إصدار جديد من تاريخ السريان' })
    };
    const grp = SA.form.group(Object.values(f)); const live = h('div.sap-hrt-checks');
    const upd = () => { SA.clear(live); const s = { start: f.start.get(), end: f.end.get(), breakMin: +f.brk.get() || 0, breakPaid: f.paid.get() }; if (!/^\d\d:\d\d$/.test(s.start) || !/^\d\d:\d\d$/.test(s.end)) return; const span = shiftSpan(s), eff = shiftEff(s);
      live.append(h('div.sap-hrt-check.is-ok', {}, SA.icon('clock', 'icon-sm'), h('div', {}, 'الفترة ', h('b.num', {}, hrs(span)), ' ساعة · الفعلية ', h('b.num', {}, hrs(eff)), ' ساعة (الفترة والفعلية منفصلتان لأن 3×8 ساعات لا تتسع لاستراحة ≥ ساعة — D8).')));
      if (S.minBreakMin != null && s.breakMin < S.minBreakMin) live.append(h('div.sap-hrt-check.is-warn', {}, SA.icon('alert', 'icon-sm'), h('div', {}, 'الاستراحة أقل من ' + S.minBreakMin + ' دقيقة (م 118 · Pending) — تحذير فقط.')));
      if (S.maxDaySpanHours != null && span > S.maxDaySpanHours * 60) live.append(h('div.sap-hrt-check.is-bad', {}, SA.icon('xcircle', 'icon-sm'), h('div', {}, 'فترة اليوم تتجاوز ' + S.maxDaySpanHours + ' ساعات (م 119).')));
      if (S.maxDailyHours != null && eff > S.maxDailyHours * 60) live.append(h('div.sap-hrt-check.is-warn', {}, SA.icon('alert', 'icon-sm'), h('div', {}, 'الساعات الفعلية أكثر من ' + S.maxDailyHours + ' (م 117).'))); };
    ['start', 'end', 'brk'].forEach((k) => f[k].input.addEventListener('input', upd)); f.paid.input.addEventListener('change', upd); upd();
    const used = !isNew ? (T('rosters') || []).filter((r) => r.status !== 'archived' && Object.values(r.cells).some((c) => Object.values(c).indexOf(o.code) >= 0)) : [];
    const m = simpleModal({ title: isNew ? 'وردية جديدة' : 'تعديل وردية ' + o.code, subtitle: isNew ? 'يُحفظ كإصدار 1 بحالة Pending' : 'إصدار ' + o.version + ' ← ' + (o.version + 1) + ' · الجداول المنشورة تبقى على إصدارها', icon: 'clock', size: 'lg', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, h('div.sap-formgrid', {}, f.code.el, f.name.el, f.start.el, f.end.el, f.brk.el, f.grace.el, f.eff.el), f.paid.el, f.night.el, live, used.length ? SA.alert('info', 'مستخدمة في ' + used.length + ' جدول نشط/مسودة (' + used.map((r) => r.id).join('، ') + ').') : null), async onOk() {
      if (!grp.validate()) return false; const v = grp.get();
      if (!validDate(v.eff)) { f.eff.error('تاريخ غير صحيح'); return false; }
      if (!isNew && v.eff < D.today()) { f.eff.error('لا تعديل بأثر رجعي — اختر اليوم أو تاريخًا لاحقًا.'); return false; }
      const nv = { code: v.code, name: v.name.trim(), start: v.start, end: v.end, breakMin: +v.brk || 0, breakPaid: !!v.paid, night: !!v.night, grace: v.grace == null ? 0 : +v.grace, effectiveFrom: v.eff };
      try { await SA.api(() => {
        if (isNew) { tupd((t) => { t.shifts.push(Object.assign({ id: 'SH-' + v.code, status: 'active', version: 1, color: '', graceDemo: true }, nv)); }); SA.audit('HR.SHIFT.CREATED', { target: { type: 'shift', id: 'SH-' + v.code, label: nv.name }, after: nv }); }
        else { const before = SA.pick(o, ['name', 'start', 'end', 'breakMin', 'breakPaid', 'night', 'grace', 'effectiveFrom']); tupd((t) => { const x = t.shifts.find((q) => q.id === o.id); Object.assign(x, nv, { version: x.version + 1 }); }); SA.audit('HR.SHIFT.UPDATED', { target: { type: 'shift', id: o.id, label: nv.name }, before, after: SA.pick(nv, Object.keys(before)) }); }
      }); } catch (e) { SA.fail(e); return false; }
      SA.toast(isNew ? 'تمت إضافة الوردية' : 'تم حفظ إصدار جديد من الوردية', 'success');
    } });
  }
  async function retireShift(s) {
    const usedIn = (T('rosters') || []).filter((r) => r.status !== 'archived' && Object.values(r.cells).some((c) => Object.values(c).indexOf(s.code) >= 0));
    const res = await SA.confirm({ title: 'إيقاف الوردية ' + s.code, danger: true, reasonRequired: true, confirmLabel: 'إيقاف', text: 'الإيقاف (Retire) فقط — لا حذف. لا تظهر الوردية في الجداول الجديدة.', impact: usedIn.length ? ['مستخدمة في: ' + usedIn.map((r) => r.id).join('، ') + ' — تبقى كما هي في الجداول المنشورة.'] : ['غير مستخدمة في جداول نشطة.'] });
    if (!res.ok) return;
    try { await SA.api(() => { tupd((t) => { t.shifts.find((x) => x.id === s.id).status = 'retired'; }); SA.audit('HR.SHIFT.RETIRED', { target: { type: 'shift', id: s.id, label: s.name }, reason: res.reason, before: { status: 'نشطة' }, after: { status: 'موقوفة' } }); }); SA.toast('تم إيقاف الوردية', 'success'); } catch (e) { SA.fail(e); }
  }
  function shiftsCatalogTab(body) {
    const rows = shiftsAll();
    body.append(SA.alert('info', h('b', {}, 'D8 مفتوح — نظام الورديات الفعلي. '), 'الأمثلة (A/B/C/D) تجريبية؛ نافذة الليل والراحة بين الورديات والحد الأدنى للتغطية قيم غير مُعدّة (Open). الساعات القانونية (8/48/10/12) إعدادات Pending بتاريخ سريان.'));
    body.append(SA.card({ flush: true, title: 'كتالوج الورديات', tags: SA.tag('new'), actions: [SA.btn({ label: 'وردية جديدة', icon: 'plus', kind: 'primary', size: 'sm', perm: 'hr.shifts.edit', onClick: () => shiftEditor(null) })] }, tbl({ rowId: 'id', pageSize: 10, caption: 'كتالوج الورديات', rows, search: { placeholder: 'ابحث بالكود أو الاسم…', keys: ['code', 'name'] }, filters: [{ key: 'status', label: 'الحالة', options: [['active', 'نشطة'], ['retired', 'موقوفة']] }],
      columns: [{ key: 'code', label: 'الكود', sort: true, render: (s) => h('span.chip' + (SHIFT_CHIP[s.code] ? '.' + SHIFT_CHIP[s.code] : ''), {}, s.code) }, { key: 'name', label: 'الاسم', sort: true, render: (s) => h('b', {}, s.name) }, { key: 'start', label: 'من – إلى', render: (s) => h('span.num', { dir: 'ltr' }, s.start + ' – ' + s.end), sort: true },
        { key: 'span', label: 'الفترة / الفعلية', render: (s) => h('span', {}, h('b.num', {}, hrs(shiftSpan(s))), ' / ', h('b.num', {}, hrs(shiftEff(s))), ' س') }, { key: 'breakMin', label: 'الاستراحة', render: (s) => s.breakMin + ' د ' + (s.breakPaid ? '(مدفوعة)' : '') }, { key: 'night', label: 'ليل', render: (s) => (s.night ? SA.chip('ليل', 'info') : '—') }, { key: 'grace', label: 'السماحية', render: (s) => (s.grace == null ? SA.openValue() : SA.demoValue(s.grace + ' د')) },
        { key: 'status', label: 'الحالة', sort: true, render: (s) => SA.chip(s.status === 'active' ? 'نشطة' : 'موقوفة', s.status === 'active' ? 'success' : 'neutral') }, { key: 'version', label: 'إصدار', render: (s) => h('span.num', {}, 'v' + s.version + ' · ' + D.short(s.effectiveFrom)) }],
      rowActions: (s) => [{ label: 'تعديل (إصدار جديد)', icon: 'edit', disabled: SA.can('hr.shifts.edit') ? false : NOPERM, onClick: () => shiftEditor(s) }, { label: 'إيقاف الوردية', icon: 'trash', danger: true, disabled: SA.can('hr.shifts.edit') ? (s.status === 'retired' ? 'موقوفة بالفعل' : false) : NOPERM, onClick: () => retireShift(s) }], onRowClick: (s) => shiftEditor(s), empty: { icon: 'clock', title: 'لا توجد ورديات', text: 'ابدأ بتعريف أول وردية.' } })));
    body.append(h('div', {}, specLink('hr-time', 'shf-02', 'المواصفة الكاملة لتعريف الوردية ↗')));
  }

  /* — المجموعات وأيام الراحة — */
  function groupEditor(g) {
    if (!SA.can('hr.shifts.edit')) { SA.toast(NOPERM + ' (hr.shifts.edit)', 'warn'); return; }
    const codes = shiftActive().map((s) => s.code);
    const f = { rest: SA.form.field({ name: 'rest', label: 'يوم الراحة الأسبوعي', type: 'select', value: String(g.restDay), options: DAYN.map((d, i) => [String(i), d]), disabled: !isHrMgr(), hint: isHrMgr() ? 'تغيير يوم الراحة ينشئ مهمة إعلان للجهة (م 120/122)' : 'تغيير يوم الراحة: HR Manager فقط' }), operates: SA.form.field({ name: 'op', label: 'الورديات التي يعمل بها الخط', type: 'multi', value: g.operates, options: codes.map((c) => [c, c + ' — ' + shiftByCode(c).name]) }), pattern: SA.form.field({ name: 'pat', label: 'نمط الدوران (أسبوع بأسبوع، افصل بفاصلة)', value: g.pattern.join(','), hint: 'مثال: A,B — الدورة 1–6 أسابيع', rules: [(v) => { const a = String(v || '').split(',').map((x) => x.trim()).filter(Boolean); return a.length >= 1 && a.length <= 6 && a.every((x) => codes.indexOf(x) >= 0) ? null : 'أكواد ورديات نشطة فقط (1–6 أسابيع)'; }] }) };
    const mc = {}; codes.forEach((c) => { mc[c] = SA.form.field({ name: 'mc' + c, label: 'حد أدنى للتغطية — وردية ' + c, type: 'number', value: (g.minCoverage || {})[c] == null ? '' : g.minCoverage[c], min: 0, max: 99, hint: 'قيمة تجريبية — Open' }); });
    const grp = SA.form.group(Object.values(f));
    simpleModal({ title: 'مجموعة: ' + g.name, subtitle: activeEmps().filter((e) => e.departmentId === g.deptId).length + ' موظف', icon: 'users', size: 'lg', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, h('div.sap-formgrid', {}, f.rest.el, f.pattern.el), f.operates.el, h('div.sap-formgrid', {}, Object.values(mc).map((x) => x.el))), async onOk() {
      if (!grp.validate()) return false; const v = grp.get(); const rd = +v.rest; const pat = v.pat.split(',').map((x) => x.trim()).filter(Boolean); const minC = {}; codes.forEach((c) => { const x = mc[c].get(); if (x != null) minC[c] = x; });
      const before = { restDay: DAYN[g.restDay], operates: g.operates.join(','), pattern: g.pattern.join(','), minCoverage: JSON.stringify(g.minCoverage) }; const after = { restDay: DAYN[rd], operates: v.op.join(','), pattern: pat.join(','), minCoverage: JSON.stringify(minC) };
      try { await SA.api(() => { tupd((t) => { const x = t.groups.find((q) => q.id === g.id); x.restDay = rd; x.operates = v.op; x.pattern = pat; x.minCoverage = minC; x.minCoverageDemo = true;
        if (rd !== g.restDay) t.tasks.push({ id: nextIdLocal(t.tasks, 'TK'), type: 'roster_post', refId: g.id, title: 'إعلان تغيير يوم الراحة لمجموعة ' + g.name + ' (' + DAYN[g.restDay] + ' ← ' + DAYN[rd] + ')', dueAt: D.add(D.today(), SET().postSendDays || 7), status: 'open', executedBy: null, closedBy: null, proof: null }); });
        SA.audit('HR.SHIFTGROUP.UPDATED', { target: { type: 'shiftgroup', id: g.id, label: g.name }, before, after }); }); } catch (e) { SA.fail(e); return false; }
      SA.toast('تم حفظ المجموعة' + (rd !== g.restDay ? ' وأُنشئت مهمة إعلان' : ''), 'success');
    } });
  }
  function shiftsGroupsTab(body) {
    body.append(SA.alert('info', 'الراحة الأسبوعية ≥ 24 ساعة بعد ≤ ' + (SET().maxConsecutiveDays || 6) + ' أيام عمل (م 120 · Pending) — الجمعة افتراضي ويُضبط لكل مجموعة. الحد الأدنى للتغطية قيمة تجريبية (Open).'));
    body.append(SA.card({ flush: true, title: 'مجموعات الورديات (خطوط الإنتاج)' }, tbl({ rowId: 'id', pageSize: 10, caption: 'المجموعات', rows: () => T('groups') || [], search: { placeholder: 'ابحث…', keys: ['name'] },
      columns: [{ key: 'name', label: 'المجموعة', sort: true, render: (g) => h('b', {}, g.name) }, { key: 'm', label: 'الموظفون', render: (g) => h('span.num', {}, activeEmps().filter((e) => e.departmentId === g.deptId).length) }, { key: 'restDay', label: 'الراحة', render: (g) => DAYN[g.restDay] + (g.restPaid ? ' (مدفوعة)' : '') }, { key: 'operates', label: 'الورديات', render: (g) => g.operates.map((c) => h('span.sap-hrt-tag', {}, c)) }, { key: 'pattern', label: 'نمط الدوران', render: (g) => h('span.num', { dir: 'ltr' }, g.pattern.join(' ← ')) }, { key: 'min', label: 'حد التغطية', render: (g) => SA.demoValue(Object.keys(g.minCoverage || {}).filter((k) => g.operates.indexOf(k) >= 0).map((k) => k + ':' + g.minCoverage[k]).join(' · ') || '—') }],
      rowActions: (g) => [{ label: 'تعديل المجموعة', icon: 'edit', disabled: SA.can('hr.shifts.edit') ? false : NOPERM, onClick: () => groupEditor(g) }], onRowClick: (g) => groupEditor(g) })));
  }

  /* — طلبات التبديل — */
  function swapChecks(sw) {
    const r = rosterById(sw.rosterId); const res = []; if (!r) return [{ level: 'bad', text: 'الجدول غير موجود' }];
    const a = emp(sw.fromEmp), b = emp(sw.toEmp); const ca = r.cells[a.id] && r.cells[a.id][sw.date], cb = r.cells[b.id] && r.cells[b.id][sw.date];
    if (!ca || ca === 'R' || !cb || cb === 'R') res.push({ level: 'bad', text: 'التبديل يلزم أن يعمل الطرفان في هذا اليوم.' });
    const copy = SA.clone(r); copy.cells[a.id][sw.date] = cb; copy.cells[b.id][sw.date] = ca;
    const chk = rosterChecks(copy); const base = rosterChecks(r);
    const bad = chk.bad.filter((x) => (x.empId === a.id || x.empId === b.id) && !base.bad.some((y) => y.text === x.text));
    bad.forEach((x) => res.push({ level: 'bad', text: x.text })); chk.warn.filter((x) => x.code === 'coverage' && !base.warn.some((y) => y.text === x.text)).forEach((x) => res.push({ level: 'warn', text: x.text }));
    if (!res.length) res.push({ level: 'ok', text: 'الراحة والحدود والتغطية سليمة للطرفين بعد التبديل.' });
    return res;
  }
  const SW_ST = { sent: ['بانتظار الزميل', 'warning'], peer_ok: ['بانتظار المشرف', 'info'], approved: ['منفّذ', 'success'], rejected: ['مرفوض', 'danger'], expired: ['منتهٍ بلا رد', 'neutral'], cancelled: ['ملغي', 'neutral'] };
  const canSwapAct = (sw) => SA.can('hr.shifts.edit') || isMgrOf(emp(sw.fromEmp)) || isMgrOf(emp(sw.toEmp));
  function swapFlow() {
    const pubs = (T('rosters') || []).filter((r) => r.status === 'published' || r.status === 'amended');
    if (!pubs.length) { SA.toast('لا يوجد جدول منشور لإجراء تبديل عليه.', 'info'); return; }
    if (!(SA.can('hr.shifts.edit') || SA.session.personaId === 'supervisor')) { SA.toast(NOPERM + ' (hr.shifts.edit)', 'warn'); return; }
    const f = { r: SA.form.field({ name: 'r', label: 'الجدول المنشور', type: 'select', required: true, options: pubs.map((r) => [r.id, r.id + ' · ' + r.name]) }), d: SA.form.field({ name: 'd', label: 'يوم التبديل (YYYY-MM-DD)', required: true, value: D.add(D.today(), 4), dir: 'ltr' }), a: SA.form.field({ name: 'a', label: 'الطالب', type: 'select', required: true, options: [] }), b: SA.form.field({ name: 'b', label: 'الزميل', type: 'select', required: true, options: [] }), why: SA.form.field({ name: 'why', label: 'السبب', type: 'textarea', rows: 2, required: true }) };
    const out = h('div.sap-hrt-checks'); const fill = () => { const r = rosterById(f.r.get()); const mem = r ? rosterMembers(r).filter((e) => visibleEmps().some((v) => v.id === e.id)) : []; [f.a, f.b].forEach((x) => { const cur = x.get(); SA.clear(x.input); mem.forEach((e) => x.input.append(h('option', { value: e.id }, e.name))); if (cur) x.set(cur); }); preview(); };
    const preview = () => { SA.clear(out); const r = rosterById(f.r.get()); const d = f.d.get(); if (!r || !validDate(d) || !f.a.get() || !f.b.get() || f.a.get() === f.b.get()) return; const sw = { rosterId: r.id, date: d, fromEmp: f.a.get(), toEmp: f.b.get() }; swapChecks(sw).forEach((x) => out.append(h('div.sap-hrt-check.is-' + x.level, {}, SA.icon(x.level === 'bad' ? 'xcircle' : x.level === 'warn' ? 'alert' : 'checkcircle', 'icon-sm'), h('div', {}, x.text)))); };
    f.r.input.addEventListener('change', fill); ['d', 'a', 'b'].forEach((k) => f[k].input.addEventListener(k === 'd' ? 'input' : 'change', preview)); fill();
    const grp = SA.form.group(Object.values(f));
    simpleModal({ title: 'طلب تبديل وردية', subtitle: 'فحص آلي للراحة والحدود قبل الإرسال · موافقة الزميل ثم المشرف', icon: 'swap', size: 'lg', okLabel: 'إرسال الطلب', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, h('div.sap-formgrid', {}, f.r.el, f.d.el, f.a.el, f.b.el), f.why.el, out), async onOk() {
      if (!grp.validate()) return false; const v = grp.get(); const r = rosterById(v.r);
      if (!validDate(v.d) || v.d < r.periodStart || v.d > r.periodEnd) { f.d.error('اليوم خارج فترة الجدول'); return false; } if (v.a === v.b) { f.b.error('اختر زميلًا مختلفًا'); return false; }
      const sw = { id: nextId('swaps', 'SW', 4), rosterId: r.id, date: v.d, fromEmp: v.a, toEmp: v.b, fromShift: (r.cells[v.a] || {})[v.d], toShift: (r.cells[v.b] || {})[v.d], status: 'sent', reason: v.why, createdAt: nowIso(), createdBy: SA.session.userId };
      const ck = swapChecks(sw); if (ck.some((x) => x.level === 'bad')) { SA.toast('لا يمكن إرسال التبديل: ' + ck.find((x) => x.level === 'bad').text, 'error', { ms: 6500 }); return false; }
      try { await SA.api(() => { tupd((t) => { t.swaps.push(sw); }); SA.audit('HR.ROSTER.SWAP_REQUESTED', { target: { type: 'swap', id: sw.id, label: empName(v.a) + ' ↔ ' + empName(v.b) }, after: { date: v.d } }); }); } catch (e) { SA.fail(e); return false; }
      SA.toast('تم إرسال طلب التبديل ' + sw.id, 'success');
    } });
  }
  async function swapAct(sw, act) {
    if (!canSwapAct(sw)) { SA.toast(NOPERM, 'warn'); return; }
    if (act === 'peer') { const res = await SA.confirm({ title: 'تسجيل موافقة الزميل', text: empName(sw.toEmp) + ' وافق على التبديل (تسجيل بالنيابة بعد التأكد).', confirmLabel: 'تسجيل الموافقة' }); if (!res.ok) return; try { await SA.api(() => tupd((t) => { t.swaps.find((x) => x.id === sw.id).status = 'peer_ok'; })); SA.toast('سُجّلت موافقة الزميل', 'success'); } catch (e) { SA.fail(e); } return; }
    if (act === 'reject') { const res = await SA.confirm({ title: 'رفض التبديل ' + sw.id, danger: true, reasonRequired: true, confirmLabel: 'رفض' }); if (!res.ok) return; try { await SA.api(() => { tupd((t) => { const x = t.swaps.find((q) => q.id === sw.id); x.status = 'rejected'; x.decisionReason = res.reason; }); SA.audit('HR.ROSTER.SWAP_REJECTED', { target: { type: 'swap', id: sw.id, label: empName(sw.fromEmp) + ' ↔ ' + empName(sw.toEmp) }, reason: res.reason }); }); SA.toast('تم رفض التبديل', 'success'); } catch (e) { SA.fail(e); } return; }
    const ck = swapChecks(sw); const bad = ck.find((x) => x.level === 'bad');
    const res = await SA.confirm({ title: 'اعتماد التبديل وتنفيذه', text: empName(sw.fromEmp) + ' (' + sw.fromShift + ') ↔ ' + empName(sw.toEmp) + ' (' + sw.toShift + ') — ' + D.fmt(sw.date), warnings: bad ? [bad.text] : ck.filter((x) => x.level === 'warn').map((x) => x.text), impact: ['ينشأ إصدار معدّل للجدول المنشور ويُسجَّل HR.ROSTER.AMENDED.', 'إشعار للطرفين.'], confirmLabel: 'اعتماد وتنفيذ' });
    if (!res.ok || bad) { if (bad) SA.toast('لا يمكن التنفيذ: ' + bad.text, 'error'); return; }
    const r = rosterById(sw.rosterId);
    try { await SA.api(() => { tupd((t) => { const x = t.rosters.find((q) => q.id === r.id); const a = x.cells[sw.fromEmp][sw.date]; x.cells[sw.fromEmp][sw.date] = x.cells[sw.toEmp][sw.date]; x.cells[sw.toEmp][sw.date] = a; x.version = (x.version || 1) + 1; x.status = 'amended'; x.history.push({ at: nowIso(), by: SA.session.userId, text: 'تبديل ' + sw.id + ': ' + empName(sw.fromEmp) + ' ↔ ' + empName(sw.toEmp) + ' يوم ' + D.short(sw.date) }); t.swaps.find((q) => q.id === sw.id).status = 'approved'; });
      SA.audit('HR.ROSTER.SWAP_APPROVED', { target: { type: 'swap', id: sw.id, label: empName(sw.fromEmp) + ' ↔ ' + empName(sw.toEmp) }, reason: res.reason }); SA.audit('HR.ROSTER.AMENDED', { target: { type: 'roster', id: r.id, label: r.name }, after: { version: (r.version || 1) + 1, via: sw.id } }); }); } catch (e) { SA.fail(e); return; }
    SA.notify({ title: 'N-16 تم تبديل وردية', body: empName(sw.fromEmp) + ' ↔ ' + empName(sw.toEmp) + ' — ' + D.fmt(sw.date), level: 'info', toUsers: [emp(sw.fromEmp).userId, emp(sw.toEmp).userId].filter(Boolean), link: '#/hr/shifts?tab=roster' });
    SA.toast('تم تنفيذ التبديل (إصدار ' + ((r.version || 1) + 1) + ')', 'success');
  }
  function shiftsSwapsTab(body) {
    const vis = new Set(visibleEmps().map((e) => e.id)); const rows = (T('swaps') || []).filter((s) => vis.has(s.fromEmp) || vis.has(s.toEmp));
    body.append(SA.card({ flush: true, title: 'طلبات تبديل الوردية', tags: SA.tag('new'), actions: [SA.btn({ label: 'طلب تبديل', icon: 'swap', kind: 'primary', size: 'sm', onClick: swapFlow })] }, tbl({ rowId: 'id', pageSize: 10, caption: 'طلبات التبديل', rows, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(SW_ST).map((k) => [k, SW_ST[k][0]]) }],
      columns: [{ key: 'id', label: 'الرقم', sort: true, render: (s) => h('b.num', {}, s.id) }, { key: 'who', label: 'الطرفان', render: (s) => h('span', {}, empName(s.fromEmp), ' ', SA.icon('swap', 'icon-sm'), ' ', empName(s.toEmp)) }, { key: 'date', label: 'اليوم', sort: true, render: (s) => D.fmt(s.date) }, { key: 'sh', label: 'الورديتان', render: (s) => h('span.num', {}, (s.fromShift || '—') + ' ↔ ' + (s.toShift || '—')) }, { key: 'status', label: 'الحالة', sort: true, render: (s) => stChip(SW_ST, s.status) }, { key: 'reason', label: 'السبب', render: (s) => s.reason }],
      rowActions: (s) => [{ label: 'تسجيل موافقة الزميل', icon: 'check', disabled: s.status !== 'sent' ? 'ليس بانتظار الزميل' : canSwapAct(s) ? false : NOPERM, onClick: () => swapAct(s, 'peer') }, { label: 'اعتماد وتنفيذ', icon: 'checkcircle', disabled: s.status !== 'peer_ok' ? 'يلزم موافقة الزميل أولًا' : canSwapAct(s) ? false : NOPERM, onClick: () => swapAct(s, 'approve') }, { label: 'رفض', icon: 'xcircle', danger: true, disabled: s.status === 'sent' || s.status === 'peer_ok' ? (canSwapAct(s) ? false : NOPERM) : 'انتهى الطلب', onClick: () => swapAct(s, 'reject') }],
      empty: { icon: 'swap', title: 'لا توجد طلبات تبديل', text: 'الموظف أو المشرف يطلب التبديل بعد نشر الجدول، والنظام يفحص الراحة والحدود لكلا الطرفين.' } })));
    body.append(h('div', {}, specLink('hr-time', 'shf-07', 'شاشة التبديل في التصميم ↗')));
  }

  /* — مهام الإعلان والإخطار للجهة (مشتركة مع الأوفرتايم) — */
  const TK_ST = (t) => { if (t.status === 'closed') return ['مغلقة', 'success']; if (t.status === 'delivered') return ['مُسلَّمة — بانتظار الإغلاق', 'info']; const left = D.diff(D.today(), t.dueAt.slice(0, 10)); if (left < 0) return ['متأخرة', 'danger']; if (left <= 2) return ['قريبة الاستحقاق', 'warning']; return ['مفتوحة', 'warning']; };
  const canExecTask = () => SA.can('hr.shifts.edit') || SA.can('hr.documents.issue');
  const canCloseTask = () => SA.can('hr.compliance.edit');
  async function taskExec(t) {
    if (!canExecTask()) { SA.toast(NOPERM, 'warn'); return; }
    const f = { m: SA.form.field({ name: 'm', label: 'طريقة التسليم للجهة', type: 'select', required: true, options: [['', 'اختر…'], ['paper', 'ورقي (تسليم باليد)'], ['mail', 'بريد/مسجّل'], ['office', 'مكتب العمل']], hint: 'الطريقة القانونية Open — لا تكامل إلكتروني' }) };
    simpleModal({ title: 'تسجيل تنفيذ المهمة', subtitle: t.title, icon: 'mail', body: h('div.sap-formgrid', {}, f.m.el), okLabel: 'تسجيل التسليم', async onOk() { if (!f.m.validate()) return false; try { await SA.api(() => tupd((x) => { const k = x.tasks.find((q) => q.id === t.id); k.status = 'delivered'; k.executedBy = SA.session.userId; k.method = f.m.get(); k.deliveredAt = nowIso(); })); } catch (e) { SA.fail(e); return false; } SA.toast('سُجّل التسليم — بانتظار الإغلاق بإثبات من HR Manager', 'success'); } });
  }
  async function taskClose(t) {
    if (!canCloseTask()) { SA.toast(NOPERM + ' (hr.compliance.edit)', 'warn'); return; }
    if (t.executedBy && t.executedBy === SA.session.userId) { SA.toast('المُغلِق لا يكون هو المُنفِّذ (فصل المهام).', 'error'); return; }
    const late = D.diff(t.dueAt.slice(0, 10), D.today()) > 0;
    const f = { rc: SA.form.field({ name: 'rc', label: 'رقم الإيصال / اسم ملف الإثبات', placeholder: 'مثال: RC-4471 أو proof.pdf' }), why: SA.form.field({ name: 'why', label: late ? 'سبب التأخير الموثّق (مطلوب — المهمة متأخرة)' : 'ملاحظة (اختياري)', type: 'textarea', rows: 2 }) };
    simpleModal({ title: 'إغلاق المهمة بإثبات', subtitle: t.title, icon: 'checkcircle', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, f.rc.el, f.why.el, late ? SA.alert('warning', 'المهمة تجاوزت المهلة ({' + (t.type === 'ot_notify' ? SET().otNotifyDays : SET().postSendDays) + '} أيام).') : null), okLabel: 'إغلاق', async onOk() {
      const rc = (f.rc.get() || '').trim(), why = (f.why.get() || '').trim(); if (!rc && !why) { f.rc.error('ارفع إثبات التسليم (إيصال أو صورة) أو اكتب سبب التأخير قبل الإغلاق.'); return false; } if (late && why.length < 3) { f.why.error('سبب التأخير مطلوب'); return false; }
      try { await SA.api(() => { tupd((x) => { const k = x.tasks.find((q) => q.id === t.id); k.status = 'closed'; k.closedBy = SA.session.userId; k.closedAt = nowIso(); k.proof = rc; k.lateReason = why; }); SA.audit(t.type === 'ot_notify' ? 'HR.COMPLIANCE.OT_NOTIFIED' : 'HR.COMPLIANCE.POSTING_CLOSED', { target: { type: 'task', id: t.id, label: t.title }, reason: why, after: { proof: rc || '—' } }); }); } catch (e) { SA.fail(e); return false; } SA.toast('أُغلقت المهمة بإثبات', 'success');
    } });
  }
  function tasksTable(type) {
    return tbl({ rowId: 'id', pageSize: 10, caption: 'مهام الامتثال', rows: () => (T('tasks') || []).filter((t) => t.type === type), filters: [{ key: 'st', label: 'الحالة', options: [['open', 'مفتوحة/متأخرة'], ['delivered', 'مُسلَّمة'], ['closed', 'مغلقة']], test: (t, v) => (v === 'open' ? t.status === 'open' : t.status === v) }],
      columns: [{ key: 'id', label: 'الرقم', render: (t) => h('b.num', {}, t.id) }, { key: 'title', label: 'المهمة', render: (t) => t.title }, { key: 'dueAt', label: 'الاستحقاق', sort: true, render: (t) => D.fmt(t.dueAt.slice(0, 10)) }, { key: 'status', label: 'الحالة', render: (t) => { const s = TK_ST(t); return SA.chip(s[0], s[1]); } }, { key: 'proof', label: 'الإثبات', render: (t) => (t.proof ? h('span.num', {}, t.proof) : t.lateReason ? 'سبب: ' + t.lateReason : '—') }, { key: 'by', label: 'نفّذ / أغلق', render: (t) => (t.executedBy ? SA.userName(t.executedBy) : '—') + ' / ' + (t.closedBy ? SA.userName(t.closedBy) : '—') }],
      rowActions: (t) => [{ label: 'تسجيل التنفيذ (تسليم)', icon: 'mail', disabled: t.status !== 'open' ? 'تم التنفيذ' : canExecTask() ? false : NOPERM, onClick: () => taskExec(t) }, { label: 'إغلاق بإثبات', icon: 'checkcircle', disabled: t.status === 'closed' ? 'مغلقة' : t.status === 'open' ? 'سجّل التنفيذ أولًا' : canCloseTask() ? (t.executedBy === SA.session.userId ? 'المُغلِق ≠ المُنفِّذ' : false) : NOPERM, onClick: () => taskClose(t) }],
      empty: { icon: 'checkcircle', title: 'لا توجد مهام', text: 'تنشأ تلقائيًا عند نشر جدول أو تجميع أوفرتايم.' } });
  }
  function shiftsTasksTab(body) {
    body.append(SA.alert('warning', h('b', {}, 'مهمة امتثال — لا تكامل إلكتروني. '), 'تعليق الجدول وإرسال نسخة منه ومن أي تعديل للجهة الإدارية خلال ', SET().postSendDays == null ? SA.openValue() : SET().postSendDays + ' أيام', ' (م 122 · Pending). النظام يتتبّع المهلة والإثبات فقط. ينفّذ HR Officer ويغلق HR Manager.'));
    body.append(SA.card({ flush: true, title: 'مهام الإعلان للجهة الإدارية', tags: SA.tag('new') }, tasksTable('roster_post')));
  }

  function renderShifts(root, ctx) {
    if (!ready()) return;
    ctx.setCrumbs([{ label: 'الوقت' }, { label: 'الورديات' }]);
    return bootScreen(root, (host) => tabbed(host, ctx, {
      route: 'hr/shifts', title: 'الورديات والجداول', desc: 'تعريف الورديات وبناء جدول 2–4 أسابيع مع فحوصات الراحة والتغطية، ثم النشر والإشعار والإعلان للجهة.', tags: [SA.tag('new', 'HR-09')],
      tabs: [{ id: 'roster', label: 'باني الجدول', icon: 'grid' }, { id: 'catalog', label: 'الورديات', icon: 'clock' }, { id: 'groups', label: 'المجموعات والراحة', icon: 'users' }, { id: 'swaps', label: 'طلبات التبديل', icon: 'swap', badge: () => { const n = (T('swaps') || []).filter((s) => s.status === 'sent' || s.status === 'peer_ok').length; return n || null; } }, { id: 'tasks', label: 'الإعلان للجهة', icon: 'shield', badge: () => { const n = (T('tasks') || []).filter((t) => t.type === 'roster_post' && t.status !== 'closed').length; return n || null; } }],
      actions: (tab) => (tab === 'roster' ? [SA.btn({ label: 'جدول جديد', icon: 'plus', kind: 'primary', perm: 'hr.shifts.edit', onClick: newRosterFlow })] : tab === 'catalog' ? [] : tab === 'swaps' ? [] : []),
      render: { roster: (b, api) => shiftsRosterTab(b, api, ctx), catalog: shiftsCatalogTab, groups: shiftsGroupsTab, swaps: shiftsSwapsTab, tasks: shiftsTasksTab }, paths: ['hrTime', 'leaveRequests', 'employees']
    }));
  }

  /* ═════════════════════════════════ generic settings editor (Pending/Open values live in the store) ═════════════════════════════════ */
  const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  const setPath = (o, p, v) => { const a = p.split('.'); let x = o; for (let i = 0; i < a.length - 1; i++) { x[a[i]] = x[a[i]] || {}; x = x[a[i]]; } x[a[a.length - 1]] = v; };
  /** rows: [{path,label,ref,type:'number'|'select',options,fmt,unit,hint,openWhenNull:true}] */
  function settingsTable(rows, opts) {
    const S = SET(); opts = opts || {};
    return h('div.table-wrap.sap-table-wrap', {}, h('table.table.sap-table', { 'aria-label': opts.caption || 'الإعدادات' }, h('thead', {}, h('tr', {}, h('th', {}, 'الإعداد'), h('th', {}, 'القيمة'), h('th', {}, 'المرجع'), h('th', {}, 'الحالة'))),
      h('tbody', {}, rows.map((r) => { const v = getPath(S, r.path); return h('tr', {}, h('td', {}, h('b', {}, r.label), r.hint ? h('small', { style: { display: 'block', color: 'var(--color-text-muted)' } }, r.hint) : null), h('td', {}, v == null ? SA.openValue() : h('b.num', {}, r.fmt ? r.fmt(v) : String(v) + (r.unit ? ' ' + r.unit : ''))), h('td', {}, r.ref || '—'), h('td', {}, v == null ? SA.tag('open') : SA.tag(r.approved ? 'approved' : 'pending'), v == null ? '' : h('small', { style: { display: 'block', color: 'var(--color-text-muted)' } }, 'سريان من ' + D.fmt(S.effectiveFrom)))); }))));
  }
  function settingsEdit(o) {
    const S = SET(); const perm = o.perm || 'hr.compliance.edit';
    if (!SA.can(perm)) { SA.toast(NOPERM + ' (' + perm + ')', 'warn'); return; }
    const fs = o.rows.map((r) => ({ r, f: SA.form.field({ name: r.path, label: r.label + (r.unit ? ' (' + r.unit + ')' : ''), type: r.type === 'select' ? 'select' : 'number', value: getPath(S, r.path) == null ? '' : String(getPath(S, r.path)), options: r.type === 'select' ? [['', 'غير مُعدّ (Open)']].concat(r.options) : null, hint: r.hint, min: r.min, max: r.max, rules: [(v) => (v == null || v === '' ? null : r.type === 'select' ? null : isNaN(+v) ? 'رقم فقط' : r.min != null && +v < r.min ? 'الحد الأدنى ' + r.min : r.max != null && +v > r.max ? 'الحد الأقصى ' + r.max : null)] }) }));
    simpleModal({ title: o.title, subtitle: 'تُحفظ بتاريخ سريان اليوم وحالة Pending · القيم الفارغة تبقى Open', icon: 'settings', size: 'lg', body: h('div.sap-formgrid', {}, fs.map((x) => x.f.el)), async onOk() {
      if (!SA.form.group(fs.map((x) => x.f)).validate()) return false; const before = {}, after = {};
      const next = SA.clone(S); fs.forEach((x) => { const raw = x.f.get(); const val = raw === '' || raw == null ? null : x.r.type === 'select' ? (x.r.numeric ? +raw : raw) : +raw; const old = getPath(S, x.r.path); if (val !== old) { before[x.r.label] = old == null ? 'غير مُعدّ' : old; after[x.r.label] = val == null ? 'غير مُعدّ' : val; } setPath(next, x.r.path, val); });
      if (!Object.keys(after).length) { SA.toast('لا تغييرات', 'info'); return; }
      if (!(await SA.stepUp('policy.change'))) return false;
      try { await SA.api(() => { tupd((t) => { t.settings = next; t.settings.effectiveFrom = D.today(); }); SA.audit(o.audit, { target: { type: 'setting', id: o.title, label: o.title }, before, after }); }); } catch (e) { SA.fail(e); return false; }
      SA.toast('تم الحفظ — يسري من اليوم (Pending)', 'success');
    } });
  }

  /* ═════════════════════════════════ HR-10 · الحضور والانصراف والاستثناءات ═════════════════════════════════ */
  const exAll = () => T('exceptions') || [];
  const corrAll = () => T('corrections') || [];
  const canTouch = (e) => !(e && isSelfOrRelative(e.id)) || SA.session.personaId === 'owner';
  const canResolveEx = (e) => !!e && canTouch(e) && (SA.can('hr.attendance.edit') || isMgrOf(e));
  const canApproveCorr = (e) => !!e && canTouch(e) && (SA.can('hr.attendance.approve') || isMgrOf(e));
  const exOverdue = (x) => (x.status === 'open' || x.status === 'in_review') && new Date(x.dueAt).getTime() < Date.now();
  const COR_ST = { pending: ['معلّق', 'warning'], approved: ['معتمد', 'success'], rejected: ['مرفوض', 'danger'], expired: ['منتهي المهلة', 'neutral'] };
  function dayRule(e, date, i) {
    const sh = shiftByCode(i.shift) || shiftByCode('D'); const S = SET(); const mode = S.lateCountMode;
    if (i.status === 'rest') return 'يوم راحة أسبوعية (' + DAYN[restDayOf(e)] + ' أو راحة مجدولة في الجدول المنشور).';
    if (i.status === 'holiday') return 'عطلة رسمية: ' + (i.note || '') + ' — مدفوعة وغير محتسبة من السنوية (م 129).';
    if (i.status === 'leave') return 'إجازة معتمدة' + (i.leave ? ' ' + i.leave.id + ' (' + ((leaveType(i.leave.type) || {}).name || i.leave.type) + ')' : '') + ' — تمنع استثناء الغياب (HR-11).';
    if (i.status === 'future') return 'اليوم لم يحن بعد أو لم تُسجَّل بصمات بعد.';
    const parts = ['الوردية ' + (sh ? sh.code + ' ' + sh.start + '–' + sh.end : '—') + (i.derived ? ' (من الجدول/الافتراضي)' : '')];
    if (i.in) parts.push('أول بصمة ' + i.in); if (i.out) parts.push('آخر بصمة ' + i.out);
    if (i.status === 'late') parts.push('سماحية ' + (sh ? sh.grace : 0) + ' د (تجريبية) · وضع العدّ: ' + (mode === 'from_start' ? 'من بداية الوردية' : mode === 'beyond_grace' ? 'بعد السماحية فقط' : 'غير مُعدّ — معروض «بعد السماحية»') + ' ⇒ تأخير ' + i.lateMin + ' د');
    if (i.status === 'missing') parts.push('بصمة واحدة فقط ⇒ بصمة ناقصة (لا خصم قبل مهلة التصحيح — BR-ATT-06)');
    if (i.status === 'absent') parts.push('لا بصمات ولا إجازة ⇒ غياب بدون إخطار');
    if (i.status === 'pending_correction') parts.push('طلب تصحيح معلّق');
    return parts.join(' · ');
  }
  async function manualAdjust(e, date, i, onDone) {
    if (i.locked) { SA.toast(lockedMsg(date), 'warn', { ms: 6500 }); return; }
    if (!canTouch(e)) { SA.toast('لا تعدّل حضورك أو حضور قريبك (قاعدة القرابة).', 'error'); return; }
    if (!SA.can('hr.attendance.edit')) { SA.toast(NOPERM + ' (hr.attendance.edit)', 'warn'); return; }
    const direct = SA.can('hr.attendance.approve');
    const sh = shiftByCode(i.shift) || shiftByCode('D');
    const f = { in: SA.form.field({ name: 'in', label: 'وقت الدخول', value: i.in || sh.start, dir: 'ltr', placeholder: 'HH:MM', rules: [(v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? null : 'صيغة HH:MM')] }), out: SA.form.field({ name: 'out', label: 'وقت الخروج', value: i.out || sh.end, dir: 'ltr', placeholder: 'HH:MM', rules: [(v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? null : 'صيغة HH:MM')] }), reason: SA.form.field({ name: 'reason', label: 'السبب (إلزامي)', type: 'textarea', rows: 2, required: true }) };
    const g = SA.form.group(Object.values(f));
    simpleModal({ title: direct ? 'تعديل سجل حضور' : 'إدخال يدوي بالنيابة (يحتاج اعتماد)', subtitle: e.name + ' · ' + D.fmt(date), icon: 'edit', okLabel: direct ? 'حفظ التعديل' : 'إرسال للاعتماد', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, SA.alert('info', direct ? 'يُسجَّل التعديل ويُوسم «يدوي» في كل التقارير ويظهر قبل/بعد في التدقيق.' : 'المُدخِل ≠ المُعتمِد (BR-ATT-08): سيُرسل كطلب تصحيح لمدير HR/المشرف.'), h('div.sap-formgrid', {}, f.in.el, f.out.el), f.reason.el), async onOk() {
      if (!g.validate()) return false; const v = g.get();
      try { await SA.api(() => {
        if (direct) { const before = { in: i.in, out: i.out, status: GLYPH[i.status][1] }; tupd((t) => { t.seq.att++; }); st.update('attendance', (list) => { let r = list.find((a) => a.employeeId === e.id && a.date === date); if (!r) { r = { id: 'AT-' + e.id + '-' + date, employeeId: e.id, date, shift: i.shift }; list.push(r); } Object.assign(r, { in: v.in, out: v.out, status: 'present', manual: true, manualBy: SA.session.userId, corrPending: false }); const sh2 = shiftByCode(i.shift) || shiftByCode('D'); if (tmin(v.in) > tmin(sh2.start) + (sh2.grace || 0)) r.status = 'late'; });
          resolveOpenEx(e.id, date, 'correction', 'تعديل يدوي: ' + v.reason); SA.audit('HR.ATTENDANCE.ADJUSTED', { target: { type: 'attendance', id: e.id + '/' + date, label: e.name + ' — ' + D.fmt(date) }, reason: v.reason, before, after: { in: v.in, out: v.out, manual: true } }); }
        else { createCorrection(e, date, v.in, v.out, v.reason, null); }
      }); } catch (x) { SA.fail(x); return false; }
      SA.toast(direct ? 'تم التعديل' : 'أُرسل طلب التصحيح للاعتماد', 'success'); if (onDone) onDone();
    } });
  }
  function resolveOpenEx(empId, date, res, note) { tupd((t) => { t.exceptions.forEach((x) => { if (x.employeeId === empId && x.date === date && x.status !== 'resolved') { x.status = 'resolved'; x.resolution = res; x.note = note || ''; x.resolvedAt = nowIso(); x.resolvedBy = SA.session.userId; } }); }); }
  function createCorrection(e, date, rin, rout, reason, exId) {
    const id = nextId('corrections', 'ATC', 4);
    tupd((t) => { t.corrections.push({ id, employeeId: e.id, date, exceptionId: exId, reqIn: rin, reqOut: rout, reason, status: 'pending', requestedBy: SA.session.userId, createdAt: nowIso(), approverId: null, decidedAt: null }); const x = exId ? t.exceptions.find((q) => q.id === exId) : null; if (x) x.status = 'in_review'; });
    st.update('attendance', (list) => { const r = list.find((a) => a.employeeId === e.id && a.date === date); if (r) r.corrPending = true; else list.push({ id: 'AT-' + e.id + '-' + date, employeeId: e.id, date, in: rin, out: null, status: 'present', shift: shiftCodeOf(e), corrPending: true }); });
    SA.audit('HR.ATTENDANCE.CORRECTION_REQUESTED', { target: { type: 'correction', id, label: e.name + ' — ' + D.fmt(date) }, reason, after: { in: rin, out: rout } });
    const mgr = emp(e.managerEmpId); SA.notify({ title: 'N-18 طلب تصحيح حضور ' + id, body: e.name + ' · ' + D.fmt(date), level: 'action', to: ['R-11'], toUsers: mgr && mgr.userId ? [mgr.userId] : [], link: '#/hr/attendance?tab=corrections' });
    return id;
  }
  function correctionFlow(pre) {
    pre = pre || {}; const vis = visibleEmps(); const meE = myEmp();
    const f = { e: SA.form.field({ name: 'e', label: 'الموظف', type: 'select', required: true, value: pre.empId || (meE ? meE.id : ''), options: [['', 'اختر…']].concat(vis.map((x) => [x.id, x.name])) }), d: SA.form.field({ name: 'd', label: 'اليوم (YYYY-MM-DD)', required: true, value: pre.date || D.add(D.today(), -1), dir: 'ltr' }), i: SA.form.field({ name: 'i', label: 'وقت الدخول المطلوب', value: pre.rin || '', dir: 'ltr', placeholder: 'HH:MM' }), o: SA.form.field({ name: 'o', label: 'وقت الخروج المطلوب', value: pre.rout || '', dir: 'ltr', placeholder: 'HH:MM' }), r: SA.form.field({ name: 'r', label: 'السبب', type: 'textarea', rows: 2, required: true }) };
    const g = SA.form.group(Object.values(f));
    simpleModal({ title: 'طلب تصحيح حضور (نسيت البصمة)', subtitle: 'الموظف ← المشرف (← HR حسب الإعداد)', icon: 'clipboard', okLabel: 'إرسال الطلب', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('div.sap-formgrid', {}, f.e.el, f.d.el, f.i.el, f.o.el), f.r.el), async onOk() {
      if (!g.validate()) return false; const v = g.get(); const e = emp(v.e);
      if (!validDate(v.d) || v.d >= D.today() && v.d > D.today()) { f.d.error('تاريخ غير صحيح'); return false; }
      if (v.d > D.today()) { f.d.error('لا تصحيح لتاريخ مستقبلي'); return false; }
      if (isLocked(v.d)) { f.d.error(lockedMsg(v.d)); return false; }
      if (SET().correctionWindowHours != null && (Date.now() - D.parse(v.d).getTime()) / 3600000 > SET().correctionWindowHours) { f.d.error('فات وقت التصحيح لليوم ده. كلّم مشرفك أو الموارد البشرية.'); return false; }
      if (!v.i && !v.o) { f.i.error('اكتب وقت دخول أو خروج على الأقل'); return false; }
      if ((v.i && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.i)) || (v.o && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.o))) { f.i.error('صيغة الوقت HH:MM'); return false; }
      const ex = exAll().find((x) => x.employeeId === e.id && x.date === v.d && x.status !== 'resolved');
      try { await SA.api(() => createCorrection(e, v.d, v.i || null, v.o || null, v.r, ex ? ex.id : null)); } catch (x) { SA.fail(x); return false; }
      SA.toast('أُرسل طلب التصحيح', 'success');
    } });
  }
  async function decideCorrection(c, ok) {
    const e = emp(c.employeeId); if (isLocked(c.date)) { SA.toast(lockedMsg(c.date), 'warn', { ms: 6500 }); return; }
    if (!canApproveCorr(e)) { SA.toast(!canTouch(e) ? 'لا تعتمد تصحيح حضورك أو قريبك (قاعدة القرابة).' : NOPERM + ' (hr.attendance.approve أو مشرف مباشر)', 'warn'); return; }
    if (c.requestedBy === SA.session.userId) { SA.toast('لا تعتمد طلب تصحيح قدّمته أنت (المُدخِل ≠ المُعتمِد).', 'error'); return; }
    const res = await SA.confirm({ title: (ok ? 'اعتماد' : 'رفض') + ' التصحيح ' + c.id, text: e.name + ' — ' + D.fmt(c.date) + ' · دخول ' + (c.reqIn || '—') + ' / خروج ' + (c.reqOut || '—') + ' · السبب: ' + c.reason, danger: !ok, reasonRequired: !ok, confirmLabel: ok ? 'اعتماد' : 'رفض', impact: ok ? ['يُحدَّث السجل اليومي ويُوسم «مُصحَّح».', 'يُغلق الاستثناء المرتبط.'] : null });
    if (!res.ok) return; if (ok && !(await SA.stepUp('approval.decide'))) return;
    try { await SA.api(() => {
      tupd((t) => { const x = t.corrections.find((q) => q.id === c.id); x.status = ok ? 'approved' : 'rejected'; x.approverId = SA.session.userId; x.decidedAt = nowIso(); x.decisionReason = res.reason; if (c.exceptionId) { const ex = t.exceptions.find((q) => q.id === c.exceptionId); if (ex) { ex.status = ok ? 'resolved' : 'open'; if (ok) { ex.resolution = 'correction'; ex.resolvedBy = SA.session.userId; ex.resolvedAt = nowIso(); ex.note = 'تصحيح ' + c.id; } } } });
      st.update('attendance', (list) => { const r = list.find((a) => a.employeeId === c.employeeId && a.date === c.date); if (r) { r.corrPending = false; if (ok) { if (c.reqIn) r.in = c.reqIn; if (c.reqOut) r.out = c.reqOut; r.status = 'present'; r.corrected = true; } } });
      if (ok) tupd((t) => { t.exceptions.forEach((x) => { if (x.employeeId === c.employeeId && x.date === c.date && x.type === 'missing_punch' && x.status !== 'resolved') { x.status = 'resolved'; x.resolution = 'correction'; x.resolvedAt = nowIso(); x.resolvedBy = SA.session.userId; } }); });
      SA.audit(ok ? 'HR.ATTENDANCE.CORRECTION_APPROVED' : 'HR.ATTENDANCE.CORRECTION_REJECTED', { target: { type: 'correction', id: c.id, label: e.name + ' — ' + D.fmt(c.date) }, reason: res.reason, after: { status: ok ? 'معتمد' : 'مرفوض' } });
    }); } catch (x) { SA.fail(x); return; }
    const req = SA.userById(c.requestedBy); if (req) SA.notify({ title: (ok ? 'تم اعتماد' : 'تم رفض') + ' تصحيح الحضور ' + c.id, body: D.fmt(c.date), level: 'info', toUsers: [req.id], link: '#/hr/attendance?tab=corrections' });
    SA.toast(ok ? 'تم اعتماد التصحيح' : 'تم رفض التصحيح', 'success');
  }
  function openDay(empId, date) {
    const e = emp(empId); if (!e) return; const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
    const d = SA.drawer({ title: e.name, subtitle: D.dayName(date) + ' ' + D.fmt(date), size: 'md', body });
    const draw = () => {
      SA.clear(body); const i = dayInfo(e, date); const exs = exAll().filter((x) => x.employeeId === empId && x.date === date); const cs = corrAll().filter((c) => c.employeeId === empId && c.date === date);
      body.append(h('div.sap-hrt-cluster', {}, h('span.chip', {}, GLYPH[i.status][1]), i.shift ? h('span.sap-hrt-tag', {}, 'وردية ' + i.shift) : null, i.rec && i.rec.manual ? SA.chip('يدوي', 'warning') : null, i.rec && i.rec.corrected ? SA.chip('مُصحَّح', 'info') : null, i.locked ? SA.chip('الشهر مقفول', 'danger') : null),
        SA.kv([['الدخول', i.in || '—'], ['الخروج', i.out || '—'], ['التأخير', i.lateMin ? i.lateMin + ' دقيقة' : '—'], ['القسم', deptName(e.departmentId)]]),
        h('div', {}, h('h4.sap-sub', {}, 'ليه اتحسب كده؟'), h('p.sap-hrt-pre', {}, dayRule(e, date, i))));
      if (i.status === 'leave' && i.leave) body.append(SA.alert('info', 'مرتبط بالإجازة ' + i.leave.id + ' — ', h('a', { href: '#/hr/leave?tab=requests' }, 'افتح الإجازات')));
      if (i.locked) body.append(SA.alert('warning', lockedMsg(date)));
      if (exs.length) body.append(h('div', {}, h('h4.sap-sub', {}, 'الاستثناءات'), exs.map((x) => h('div.sap-hrt-check.is-' + (x.status === 'resolved' ? 'ok' : 'warn'), {}, SA.icon('alert', 'icon-sm'), h('div', {}, EX_TYPE[x.type], ' — ', stChip(EX_ST, x.status), x.resolution ? ' · ' + (EX_RES.find((r) => r[0] === x.resolution) || [])[1] : '', x.status !== 'resolved' ? h('div', { style: { marginTop: '6px' } }, SA.btn({ label: 'حل الاستثناء', icon: 'check', size: 'sm', kind: 'ghost', onClick: () => exResolveFlow([x]) })) : null)))));
      if (cs.length) body.append(h('div', {}, h('h4.sap-sub', {}, 'طلبات التصحيح'), cs.map((c) => h('p', {}, c.id + ' — ' + COR_ST[c.status][0] + ' (' + (c.reqIn || '—') + ' / ' + (c.reqOut || '—') + ')'))));
      body.append(h('div.sap-hrt-cluster', {}, SA.btn({ label: SA.can('hr.attendance.approve') ? 'تعديل السجل' : 'إدخال يدوي بالنيابة', icon: 'edit', kind: 'ghost', reason: i.locked ? 'الشهر مقفول للمرتبات' : !SA.can('hr.attendance.edit') ? NOPERM + ' (hr.attendance.edit)' : '', onClick: () => manualAdjust(e, date, i, draw) }), SA.btn({ label: 'طلب تصحيح', icon: 'clipboard', kind: 'ghost', reason: i.locked ? 'الشهر مقفول للمرتبات' : '', onClick: () => { d.close(); correctionFlow({ empId, date, rin: i.in, rout: i.out }); } })));
    };
    draw(); const un = st.subscribe('hrTime', () => { if (document.body.contains(d.el)) draw(); }); st.subscribe('attendance', () => { if (document.body.contains(d.el)) draw(); });
  }
  async function exResolveFlow(list) {
    const rows = list.filter((x) => x.status !== 'resolved'); if (!rows.length) { SA.toast('لا استثناءات مفتوحة ضمن المحدد', 'info'); return; }
    const okRows = rows.filter((x) => !isLocked(x.date) && canResolveEx(emp(x.employeeId))); const skipped = rows.length - okRows.length;
    if (!okRows.length) { SA.toast(rows.some((x) => isLocked(x.date)) ? lockedMsg(rows[0].date) : NOPERM + ' (hr.attendance.edit أو مشرف مباشر)', 'warn', { ms: 6500 }); return; }
    const f = { res: SA.form.field({ name: 'res', label: 'كود الحل', type: 'select', required: true, options: [['', 'اختر…']].concat(EX_RES.map((r) => [r[0], r[1]])) }), note: SA.form.field({ name: 'note', label: 'ملاحظة', type: 'textarea', rows: 2 }) };
    simpleModal({ title: okRows.length === 1 ? 'حل استثناء' : 'حل ' + okRows.length + ' استثناء بكود واحد', subtitle: okRows.length === 1 ? empName(okRows[0].employeeId) + ' — ' + EX_TYPE[okRows[0].type] + ' · ' + D.fmt(okRows[0].date) : null, icon: 'check', okLabel: 'حل', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, skipped ? SA.alert('warning', 'تجاوزنا ' + skipped + ' (شهر مقفول أو خارج صلاحيتك).') : null, f.res.el, f.note.el, h('p.sap-hrt-note', {}, 'خصم/تحويل الإجازة سياسة D3 المفتوحة — الكود يسجّل القرار فقط.')), async onOk() {
      if (!f.res.validate()) return false; const code = f.res.get(); const ids = new Set(okRows.map((x) => x.id));
      try { await SA.api(() => { tupd((t) => { t.exceptions.forEach((x) => { if (ids.has(x.id)) { x.status = 'resolved'; x.resolution = code; x.note = f.note.get() || ''; x.resolvedAt = nowIso(); x.resolvedBy = SA.session.userId; } }); }); okRows.forEach((x) => SA.audit('HR.ATTENDANCE.EXCEPTION_RESOLVED', { target: { type: 'exception', id: x.id, label: empName(x.employeeId) + ' — ' + EX_TYPE[x.type] + ' ' + D.fmt(x.date) }, reason: f.note.get() || '', after: { resolution: (EX_RES.find((r) => r[0] === code) || [])[1] } })); }); } catch (e) { SA.fail(e); return false; }
      SA.toast('تم حل ' + okRows.length + ' استثناء', 'success');
    } });
  }
  async function exEscalate(x) {
    const e = emp(x.employeeId); if (!canResolveEx(e)) { SA.toast(NOPERM, 'warn'); return; } if (isLocked(x.date)) { SA.toast(lockedMsg(x.date), 'warn'); return; }
    const res = await SA.confirm({ title: 'تصعيد الاستثناء لـHR', reasonRequired: true, confirmLabel: 'تصعيد', text: empName(x.employeeId) + ' — ' + EX_TYPE[x.type] + ' · ' + D.fmt(x.date) });
    if (!res.ok) return; try { await SA.api(() => { tupd((t) => { const q = t.exceptions.find((k) => k.id === x.id); q.status = 'escalated'; q.note = res.reason; }); SA.notify({ title: 'N-19 استثناء حضور مُصعَّد', body: empName(x.employeeId) + ' — ' + EX_TYPE[x.type] + ' ' + D.fmt(x.date), level: 'action', to: ['R-11'], link: '#/hr/attendance?tab=exceptions' }); }); SA.toast('تم التصعيد لـHR', 'success'); } catch (e2) { SA.fail(e2); }
  }

  /* — اليوم (عرض المشرف اليومي) — */
  function attTodayTab(body, api) {
    const date = api.date || D.today(); api.date = date; const vis = visibleEmps();
    const inp = SA.form.field({ name: 'dt', label: '', value: date, dir: 'ltr' }); inp.input.setAttribute('aria-label', 'اليوم'); inp.input.style.maxWidth = '160px';
    inp.input.addEventListener('change', () => { if (validDate(inp.get())) { api.date = inp.get(); api.redraw(); } else inp.error('YYYY-MM-DD'); });
    const rowsAll = vis.map((e) => ({ e, i: dayInfo(e, date), id: e.id }));
    const cnt = (s) => rowsAll.filter((r) => r.i.status === s).length;
    body.append(h('div.sap-hrt-tools', {}, h('div.sap-hrt-cluster', {}, SA.btn({ label: 'اليوم السابق', icon: 'arrowright', kind: 'ghost', size: 'sm', iconOnly: true, onClick: () => { api.date = D.add(date, -1); api.redraw(); } }), inp.el, SA.btn({ label: 'اليوم التالي', icon: 'arrowleft', kind: 'ghost', size: 'sm', iconOnly: true, onClick: () => { api.date = D.add(date, 1); api.redraw(); } }), SA.btn({ label: 'اليوم', kind: 'ghost', size: 'sm', onClick: () => { api.date = D.today(); api.redraw(); } }), h('b', {}, D.dayName(date)), isLocked(date) ? SA.chip('الشهر مقفول', 'danger') : null), h('span.sap-hrt-note', {}, vis.length + ' موظف في نطاقك')));
    body.append(kpis([['حاضر', cnt('present'), {}], ['متأخر', cnt('late'), { sub: cnt('late') ? 'يحتاج مراجعة' : '' }], ['غائب بدون إخطار', cnt('absent'), { accent: false }], ['إجازة', cnt('leave')], ['بصمة ناقصة', cnt('missing') + cnt('pending_correction')], ['راحة/عطلة', cnt('rest') + cnt('holiday')]]));
    const open = exAll().filter((x) => x.date === date && x.status !== 'resolved' && vis.some((e) => e.id === x.employeeId)).length;
    if (open) body.append(SA.alert('warning', h('b', {}, open + ' استثناء مفتوح اليوم. '), h('button.sap-linkbtn', { type: 'button', onclick: () => api.setTab('exceptions') }, 'افتح طابور الاستثناءات')));
    body.append(SA.card({ flush: true, title: 'الحضور اليومي' }, tbl({ rowId: 'id', pageSize: 10, caption: 'الحضور اليومي', rows: rowsAll, search: { placeholder: 'ابحث باسم الموظف…', keys: [(r) => r.e.name, (r) => r.e.empNo] }, filters: [{ key: 'st', label: 'الحالة', options: Object.keys(GLYPH).filter((k) => k !== 'none').map((k) => [k, GLYPH[k][1]]), test: (r, v) => r.i.status === v }, { key: 'dept', label: 'القسم', options: Array.from(new Set(vis.map((e) => e.departmentId))).map((d) => [d, deptName(d)]), test: (r, v) => r.e.departmentId === v }],
      columns: [{ key: 'name', label: 'الموظف', sort: true, value: (r) => r.e.name, render: (r) => empCell(r.e) }, { key: 'shift', label: 'الوردية', render: (r) => (r.i.shift ? h('span.chip' + (SHIFT_CHIP[r.i.shift] ? '.' + SHIFT_CHIP[r.i.shift] : ''), {}, r.i.shift) : '—') }, { key: 'in', label: 'دخول', render: (r) => h('span.num', {}, r.i.in || '—') }, { key: 'out', label: 'خروج', render: (r) => h('span.num', {}, r.i.out || '—') }, { key: 'late', label: 'تأخير', render: (r) => (r.i.lateMin ? r.i.lateMin + ' د' : '—') },
        { key: 'status', label: 'الحالة', sort: true, value: (r) => r.i.status, render: (r) => SA.chip(GLYPH[r.i.status][1], { present: 'success', late: 'warning', absent: 'danger', leave: 'info', missing: 'warning', pending_correction: 'info' }[r.i.status] || 'neutral') }],
      onRowClick: (r) => openDay(r.e.id, date), rowActions: (r) => [{ label: 'تفاصيل اليوم', icon: 'eye', onClick: () => openDay(r.e.id, date) }, { label: 'طلب تصحيح', icon: 'clipboard', disabled: r.i.locked ? 'الشهر مقفول' : false, onClick: () => correctionFlow({ empId: r.e.id, date, rin: r.i.in, rout: r.i.out }) }],
      empty: { icon: 'users', title: 'لا موظفين في نطاقك', text: 'نطاق دورك (الفريق/الذاتي) لا يضم موظفين.' } })));
  }

  /* — الاستثناءات — */
  function attExceptionsTab(body) {
    const vis = new Set(visibleEmps().map((e) => e.id)); const all = exAll().filter((x) => vis.has(x.employeeId));
    const open = all.filter((x) => x.status === 'open' || x.status === 'in_review' || x.status === 'escalated');
    body.append(kpis([['مفتوحة', open.length, { accent: open.length > 0 }], ['متأخرة عن المهلة', all.filter(exOverdue).length, { sub: 'مهلة الإغلاق ' + (SET().exceptionsCloseHours || '—') + ' ساعة' }], ['مُصعَّدة لـHR', all.filter((x) => x.status === 'escalated').length], ['تصحيحات معلّقة', corrAll().filter((c) => c.status === 'pending' && vis.has(c.employeeId)).length]]));
    body.append(SA.card({ flush: true, title: 'طابور الاستثناءات', tags: SA.tag('pending', 'مهلة 24 س'), actions: [SA.btn({ label: 'طلب تصحيح', icon: 'clipboard', kind: 'primary', size: 'sm', onClick: () => correctionFlow() })] }, tbl({ rowId: 'id', pageSize: 10, selectable: true, caption: 'الاستثناءات', rows: () => exAll().filter((x) => vis.has(x.employeeId)), initial: { filters: { st: 'active' }, sort: { key: 'date', dir: 'desc' } },
      search: { placeholder: 'ابحث باسم الموظف…', keys: [(x) => empName(x.employeeId)] }, filters: [{ key: 'st', label: 'الحالة', options: [['active', 'غير محلولة'], ['open', 'مفتوح'], ['in_review', 'قيد المراجعة'], ['escalated', 'مُصعَّد'], ['resolved', 'محلول']], test: (x, v) => (v === 'active' ? x.status !== 'resolved' : x.status === v) }, { key: 'type', label: 'النوع', options: Object.keys(EX_TYPE).map((k) => [k, EX_TYPE[k]]) }],
      bulk: [{ label: 'حل بكود', icon: 'check', run: (rows, ap) => { exResolveFlow(rows).then(() => ap.clearSelection()); } }],
      columns: [{ key: 'emp', label: 'الموظف', sort: true, value: (x) => empName(x.employeeId), render: (x) => { const e = emp(x.employeeId); return e ? empCell(e, deptName(e.departmentId)) : x.employeeId; } }, { key: 'date', label: 'اليوم', sort: true, render: (x) => h('span', {}, D.fmt(x.date), isLocked(x.date) ? h('span.sap-hrt-tag.is-bad', {}, 'مقفول') : null) }, { key: 'type', label: 'النوع', sort: true, render: (x) => h('span', {}, EX_TYPE[x.type], x.minutes ? ' (' + x.minutes + ' د)' : '') },
        { key: 'dueAt', label: 'المهلة', sort: true, render: (x) => (x.status === 'resolved' ? '—' : exOverdue(x) ? SA.chip('فاتت ' + SA.fmt.rel(x.dueAt).replace('منذ ', ''), 'danger') : h('span.t-muted', {}, D.fmt(x.dueAt.slice(0, 10)))) }, { key: 'status', label: 'الحالة', sort: true, render: (x) => stChip(EX_ST, x.status) }, { key: 'res', label: 'الحل', render: (x) => (x.resolution ? (EX_RES.find((r) => r[0] === x.resolution) || [])[1] : '—') }],
      rowActions: (x) => { const e = emp(x.employeeId); const lock = isLocked(x.date) ? 'الشهر مقفول للمرتبات' : false; const perm = canResolveEx(e) ? false : NOPERM; return [{ label: 'حل الاستثناء', icon: 'check', disabled: x.status === 'resolved' ? 'محلول' : lock || perm, onClick: () => exResolveFlow([x]) }, { label: 'طلب تصحيح', icon: 'clipboard', disabled: x.status === 'resolved' ? 'محلول' : lock, onClick: () => correctionFlow({ empId: x.employeeId, date: x.date }) }, { label: 'تصعيد لـHR', icon: 'arrowleft', disabled: x.status === 'resolved' || x.status === 'escalated' ? 'غير متاح' : lock || perm, onClick: () => exEscalate(x) }, { divider: true }, { label: 'فتح اليوم', icon: 'eye', onClick: () => openDay(x.employeeId, x.date) }]; },
      onRowClick: (x) => openDay(x.employeeId, x.date), empty: { icon: 'checkcircle', title: 'لا توجد استثناءات', text: 'كل الحضور سليم ضمن نطاقك.' } })));
  }

  /* — التصحيحات — */
  function attCorrectionsTab(body) {
    const vis = new Set(visibleEmps().map((e) => e.id));
    body.append(SA.card({ flush: true, title: 'طلبات التصحيح (Regularization)', tags: SA.tag('pending'), actions: [SA.btn({ label: 'طلب تصحيح', icon: 'plus', kind: 'primary', size: 'sm', onClick: () => correctionFlow() })] }, tbl({ rowId: 'id', pageSize: 10, caption: 'طلبات التصحيح', rows: () => corrAll().filter((c) => vis.has(c.employeeId) || c.requestedBy === SA.session.userId), initial: { sort: { key: 'createdAt', dir: 'desc' } }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(COR_ST).map((k) => [k, COR_ST[k][0]]) }],
      columns: [{ key: 'id', label: 'الرقم', render: (c) => h('b.num', {}, c.id) }, { key: 'emp', label: 'الموظف', render: (c) => empName(c.employeeId) }, { key: 'date', label: 'اليوم', sort: true, render: (c) => D.fmt(c.date) }, { key: 'times', label: 'المطلوب', render: (c) => h('span.num', { dir: 'ltr' }, (c.reqIn || '—') + ' / ' + (c.reqOut || '—')) }, { key: 'reason', label: 'السبب', render: (c) => c.reason }, { key: 'by', label: 'الطالب', render: (c) => SA.userName(c.requestedBy) }, { key: 'status', label: 'الحالة', sort: true, render: (c) => stChip(COR_ST, c.status) }, { key: 'createdAt', label: 'أُرسل', sort: true, render: (c) => h('span.t-muted', {}, SA.fmt.rel(c.createdAt)) }],
      rowActions: (c) => { const e = emp(c.employeeId); const why = c.status !== 'pending' ? 'تم القرار' : isLocked(c.date) ? 'الشهر مقفول' : c.requestedBy === SA.session.userId ? 'لا تعتمد طلبك (المُدخِل ≠ المُعتمِد)' : canApproveCorr(e) ? false : NOPERM; return [{ label: 'اعتماد', icon: 'checkcircle', disabled: why, onClick: () => decideCorrection(c, true) }, { label: 'رفض', icon: 'xcircle', danger: true, disabled: why, onClick: () => decideCorrection(c, false) }, { label: 'فتح اليوم', icon: 'eye', onClick: () => openDay(c.employeeId, c.date) }]; },
      empty: { icon: 'clipboard', title: 'لا توجد طلبات تصحيح', text: 'الموظف أو المشرف يطلب تصحيح بصمة ناقصة وتُعتمد من المشرف/HR.' } })));
  }

  /* — الشبكة الشهرية — */
  function attMonthTab(body, api) {
    const ym = api.ym || D.today().slice(0, 7); api.ym = ym; const days = D.monthDays(ym); const vis = visibleEmps(); const per = periodOf(ym); const today = D.today();
    const dept = api.dept || ''; const list = dept ? vis.filter((e) => e.departmentId === dept) : vis;
    const deptSel = SA.form.field({ name: 'dp', label: '', type: 'select', value: dept, options: [['', 'كل الأقسام']].concat(Array.from(new Set(vis.map((e) => e.departmentId))).map((d) => [d, deptName(d)])), onChange: (v) => { api.dept = v; api.redraw(); } }); deptSel.input.setAttribute('aria-label', 'القسم'); deptSel.input.classList.add('sap-hrt-sel');
    body.append(h('div.sap-hrt-tools', {}, h('div.sap-hrt-cluster', {}, SA.btn({ label: 'الشهر السابق', icon: 'arrowright', kind: 'ghost', size: 'sm', iconOnly: true, onClick: () => { api.ym = D.addMonth(ym, -1); api.redraw(); } }), h('b', { style: { minWidth: '110px', textAlign: 'center' } }, D.monthLabel(ym)), SA.btn({ label: 'الشهر التالي', icon: 'arrowleft', kind: 'ghost', size: 'sm', iconOnly: true, onClick: () => { api.ym = D.addMonth(ym, 1); api.redraw(); } }), deptSel.el, per.status === 'locked' ? SA.chip('مقفول للمرتبات', 'danger') : per.status === 'review' ? SA.chip('قيد المراجعة', 'warning') : SA.chip('مفتوح', 'neutral')),
      h('div.sap-hrt-cluster', {}, SA.btn({ label: 'تصدير CSV', icon: 'download', kind: 'ghost', size: 'sm', perm: 'hr.reports.export', onClick: () => exportMonth(ym, list) }))));
    const sums = {}; list.forEach((e) => { const r = { present: 0, late: 0, absent: 0, leave: 0 }; days.forEach((d) => { const i = dayInfo(e, d); if (i.status === 'present') r.present++; else if (i.status === 'late') { r.present++; r.late++; } else if (i.status === 'absent') r.absent++; else if (i.status === 'leave') r.leave++; }); sums[e.id] = r; });
    const thead = h('thead', {}, h('tr', {}, h('th.sap-hrt-namecol', {}, 'الموظف'), days.map((d) => h('th', { class: [D.dow(d) === 5 ? 'is-rest' : '', d === today ? 'is-today' : ''] }, D.parse(d).getDate(), h('small', {}, D.dayName(d).slice(0, 3)))), ['ح', 'ت', 'غ', 'ج'].map((x, k) => h('th', { title: ['أيام الحضور', 'التأخير', 'الغياب', 'الإجازة'][k], style: { minWidth: '34px' } }, x))));
    const tbody = h('tbody', {}, list.map((e) => h('tr', {}, h('td.sap-hrt-namecol', {}, h('b', {}, e.name), h('small', { style: { display: 'block', color: 'var(--color-text-muted)' } }, deptName(e.departmentId))), days.map((d) => { const i = dayInfo(e, d); const gl = GLYPH[i.status] || GLYPH.none; return h('td', { class: D.dow(d) === 5 ? 'is-rest' : '' }, h('button.sap-hrt-cell.is-' + i.status, { type: 'button', title: gl[1] + (i.lateMin ? ' ' + i.lateMin + 'د' : '') + ' — ' + D.fmt(d), 'aria-label': e.name + ' ' + D.fmt(d) + ' ' + gl[1], disabled: i.status === 'none', onclick: () => openDay(e.id, d) }, gl[0])); }), ['present', 'late', 'absent', 'leave'].map((k) => h('td', { style: { padding: '0 6px', fontWeight: 700 } }, sums[e.id][k] || '·')))));
    body.append(list.length ? h('div.sap-hrt-gridwrap', { role: 'region', 'aria-label': 'الشبكة الشهرية', tabindex: '0' }, h('table.sap-hrt-grid', {}, thead, tbody)) : SA.card({}, SA.empty({ icon: 'users', title: 'لا موظفين', text: 'لا يوجد موظفون ضمن نطاقك في هذا الفلتر.' })));
    body.append(h('div.sap-hrt-legend', {}, ['present', 'late', 'absent', 'leave', 'holiday', 'rest', 'missing', 'pending_correction'].map((k) => h('span', {}, h('i.sap-hrt-cell.is-' + k, { style: { display: 'inline-grid', width: '22px', height: '22px', minWidth: 0 } }, GLYPH[k][0]), GLYPH[k][1]))));
    if (per.status === 'locked') body.append(SA.alert('info', 'الشهر مقفول للمرتبات — لا تعديل على السجل اليومي إلا بفتح استثنائي (BR-ATT-10).'));
    body.append(h('div', {}, specLink('hr-time', 'att-07', 'الشبكة الشهرية في التصميم ↗')));
  }
  function exportMonth(ym, list) {
    const days = D.monthDays(ym); const rows = [['الموظف', 'القسم'].concat(days.map((d) => D.parse(d).getDate())).concat(['حضور', 'تأخير', 'غياب', 'إجازة'])];
    list.forEach((e) => { const c = { present: 0, late: 0, absent: 0, leave: 0 }; const cells = days.map((d) => { const i = dayInfo(e, d); if (i.status === 'present') c.present++; if (i.status === 'late') { c.present++; c.late++; } if (i.status === 'absent') c.absent++; if (i.status === 'leave') c.leave++; return GLYPH[i.status][0]; }); rows.push([e.name, deptName(e.departmentId)].concat(cells).concat([c.present, c.late, c.absent, c.leave])); });
    SA.download('attendance-' + ym + '.csv', SA.csv(rows), 'text/csv'); SA.audit('HR.ATTENDANCE.EXPORT', { target: { type: 'report', id: 'att-' + ym, label: 'كشف الحضور ' + D.monthLabel(ym) }, after: { employees: list.length } }); SA.toast('تم تصدير كشف الحضور', 'success');
  }

  /* — الغياب بدون إذن (T4) — */
  function absenceCounters(e) {
    const today = D.today(); const cs = (T('absence') || []).filter((c) => c.employeeId === e.id); const since = cs.reduce((m, c) => (c.decision && c.decision.kind === 'justified' && c.decision.at.slice(0, 10) > m ? c.decision.at.slice(0, 10) : m), D.add(today, -365));
    let run = 0, inter = 0; D.range(since, D.add(today, -1)).forEach((d) => { const i = dayInfo(e, d); if (i.status === 'absent') { run++; inter++; } else if (i.status === 'rest' || i.status === 'holiday') { /* لا يكسر العدّ — السياسة Open */ } else if (i.status === 'future') { /* skip */ } else run = 0; });
    return { consec: run, inter };
  }
  const AB_STAGE = { detected: 'مكتشف', supervisor_call: 'اتصال المشرف', hr_follow: 'متابعة HR', written_notice: 'إنذار مكتوب (مقترح)', pending_decision: 'قرار معلّق', closed: 'مغلق', justified: 'مبرَّر' };
  function absenceActions(e, c) {
    const items = []; const mgr = SA.can('hr.attendance.approve');
    items.push({ label: 'تسجيل اتصال المشرف', icon: 'phone', disabled: c ? false : 'افتح حالة أولًا', onClick: () => absenceCall(c) });
    items.push({ label: 'اقتراح إنذار مكتوب', icon: 'doc', disabled: c ? (mgr ? false : 'HR Manager فقط') : 'افتح حالة أولًا', onClick: () => absenceNotice(c) });
    items.push({ label: 'قرار HR Manager', icon: 'shield', disabled: c ? (mgr ? false : 'القرار لـHR Manager فقط (hr.attendance.approve)') : 'افتح حالة أولًا', onClick: () => absenceDecide(c) });
    return items;
  }
  function absenceCall(c) { const f = SA.form.field({ name: 'r', label: 'نتيجة الاتصال', required: true, type: 'textarea', rows: 2 }); simpleModal({ title: 'سجل اتصال', subtitle: empName(c.employeeId), icon: 'phone', body: f.el, okLabel: 'تسجيل', async onOk() { if (!f.validate()) return false; try { await SA.api(() => tupd((t) => { const x = t.absence.find((q) => q.id === c.id); x.callLog.push({ at: nowIso(), by: SA.session.userId, result: f.get() }); if (x.stage === 'detected' || x.stage === 'supervisor_call') x.stage = 'hr_follow'; })); } catch (e) { SA.fail(e); return false; } SA.toast('سُجّل الاتصال — الحالة: متابعة HR', 'success'); } }); }
  async function absenceNotice(c) {
    const res = await SA.confirm({ title: 'اقتراح إنذار غياب مكتوب', reasonRequired: true, confirmLabel: 'تسجيل الاقتراح', text: 'النظام يقترح فقط ولا يرسل ولا يقرر. الإنذار يصدر بقرار HR على نموذج DOC-HR-32 (نص يراجعه القانوني — م 166 Pending).', impact: ['تنتقل الحالة إلى «إنذار مكتوب (مقترح)».', 'لا إرسال تلقائي ولا إنهاء خدمة من هنا (م 148 مسار منفصل).'] });
    if (!res.ok) return; try { await SA.api(() => { tupd((t) => { const x = t.absence.find((q) => q.id === c.id); x.stage = 'written_notice'; x.notice = { at: nowIso(), by: SA.session.userId, note: res.reason }; }); SA.audit('HR.ATTENDANCE.ABSENCE_NOTICE_PROPOSED', { target: { type: 'absence', id: c.id, label: empName(c.employeeId) }, reason: res.reason }); }); SA.toast('سُجّل اقتراح الإنذار — لا إرسال تلقائي', 'success'); } catch (e) { SA.fail(e); }
  }
  async function absenceDecide(c) {
    const f = { k: SA.form.field({ name: 'k', label: 'القرار', type: 'select', required: true, options: [['', 'اختر…'], ['follow', 'استمرار المتابعة'], ['notice', 'إنذار رسمي (يصدر خارج النظام)'], ['refer', 'إحالة للجزاءات/القانوني'], ['justified', 'مبرَّر — إغلاق وتصفير العدّاد']] }), r: SA.form.field({ name: 'r', label: 'السبب', type: 'textarea', rows: 2, required: true }) };
    simpleModal({ title: 'قرار ما بعد العتبة', subtitle: empName(c.employeeId) + ' — لا قرار آلي', icon: 'shield', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, SA.alert('warning', 'القرار لـHR Manager فقط. الفصل التأديبي مسار محكمة عمالية (م 148) ولا يُنفَّذ من هنا.'), f.k.el, f.r.el), okLabel: 'تسجيل القرار', accent: true, async onOk() {
      if (!SA.form.group(Object.values(f)).validate()) return false; if (!(await SA.stepUp('policy.change', { force: true, title: 'تأكيد قرار الغياب', text: 'قرار على بيانات T4 — أعد التحقق.' }))) return false; const k = f.k.get();
      try { await SA.api(() => { tupd((t) => { const x = t.absence.find((q) => q.id === c.id); x.decision = { kind: k, at: nowIso(), by: SA.session.userId, reason: f.r.get() }; x.stage = k === 'justified' ? 'closed' : k === 'refer' ? 'pending_decision' : x.stage; }); SA.audit('HR.ATTENDANCE.ABSENCE_DECISION', { target: { type: 'absence', id: c.id, label: empName(c.employeeId) }, reason: f.r.get(), after: { decision: f.k.input.options[f.k.input.selectedIndex].text } }); }); } catch (e) { SA.fail(e); return false; } SA.toast('سُجّل القرار', 'success');
    } });
  }
  async function absenceOpen(e) {
    const res = await SA.confirm({ title: 'فتح حالة غياب بدون إذن', text: e.name + ' — بيانات سرية T4.', confirmLabel: 'فتح الحالة' }); if (!res.ok) return;
    try { await SA.api(() => { tupd((t) => { t.absence.push({ id: nextId('absence', 'AB', 4), employeeId: e.id, opened: D.today(), stage: 'detected', callLog: [], notice: null, decision: null }); }); SA.audit('HR.ATTENDANCE.ABSENCE_NOTICE_PROPOSED', { target: { type: 'absence', id: e.id, label: e.name }, reason: 'فتح حالة (اكتشاف تلقائي — لا إنذار)' }); }); SA.toast('تم فتح الحالة', 'success'); } catch (x) { SA.fail(x); }
  }
  function attAbsenceTab(body) {
    if (!SA.can('hr.attendance.approve')) { body.append(denyBox('hr.attendance.approve', 'حالات الغياب بدون إذن بيانات T4 — HR Manager فقط.')); return; }
    const S = SET().absence || {}; const vis = visibleEmps();
    body.append(SA.alert('warning', h('b', {}, 'النظام يقترح ولا يقرر. '), 'العتبات (م 166 — مصدر ثانوي · Pending): متتالي إنذار ', h('b.num', {}, S.consecWarn), ' / عتبة ', h('b.num', {}, S.consecLimit), ' · متقطع (12 شهرًا) إنذار ', h('b.num', {}, S.intermWarn), ' / عتبة ', h('b.num', {}, S.intermLimit), '. «بلا عذر» وتعريفه وسياسة كسر العدّ بالراحة/العطلات: Open. الطلب الأصلي ذكر 148/167 والبحث 166 — يُؤكَّد قانونيًا.', h('button.sap-linkbtn', { type: 'button', style: { marginInlineStart: '8px' }, onclick: () => settingsEdit({ title: 'عتبات الغياب بدون إذن', audit: 'HR.ATTENDANCE.POLICY_UPDATED', rows: [{ path: 'absence.consecWarn', label: 'متتالي — حد الإنذار', unit: 'يوم', min: 1, ref: 'م 166' }, { path: 'absence.consecLimit', label: 'متتالي — العتبة', unit: 'يوم', min: 1 }, { path: 'absence.intermWarn', label: 'متقطع — حد الإنذار', unit: 'يوم', min: 1 }, { path: 'absence.intermLimit', label: 'متقطع — العتبة', unit: 'يوم', min: 1 }] }) }, 'تعديل العتبات')));
    const rows = vis.map((e) => { const c = absenceCounters(e); const cs = (T('absence') || []).find((x) => x.employeeId === e.id && x.stage !== 'closed'); return { id: e.id, e, c, cs }; }).filter((r) => r.c.consec > 0 || r.c.inter > 0 || r.cs);
    const level = (r) => (r.c.consec >= S.consecLimit || r.c.inter >= S.intermLimit ? 'limit' : r.c.consec >= S.consecWarn || r.c.inter >= S.intermWarn ? 'warn' : 'low');
    body.append(kpis([['حالات مفتوحة', (T('absence') || []).filter((c) => c.stage !== 'closed').length, { accent: true }], ['عند حد الإنذار', rows.filter((r) => level(r) === 'warn').length], ['فوق العتبة (يحتاج قرارًا)', rows.filter((r) => level(r) === 'limit').length], ['موظفون بغياب مسجّل', rows.length]]));
    body.append(SA.card({ flush: true, title: 'عدّاد الغياب بدون إذن (T4)', tags: SA.tag('pending') }, tbl({ rowId: 'id', pageSize: 10, caption: 'الغياب بدون إذن', rows, initial: { sort: { key: 'consec', dir: 'desc' } }, search: { placeholder: 'ابحث…', keys: [(r) => r.e.name] },
      columns: [{ key: 'emp', label: 'الموظف', sort: true, value: (r) => r.e.name, render: (r) => empCell(r.e) }, { key: 'consec', label: 'متتالي', sort: true, value: (r) => r.c.consec, render: (r) => h('span.num', {}, r.c.consec + ' / ' + S.consecLimit) }, { key: 'inter', label: 'متقطع (12 ش)', sort: true, value: (r) => r.c.inter, render: (r) => h('span.num', {}, r.c.inter + ' / ' + S.intermLimit) }, { key: 'lv', label: 'المستوى', render: (r) => { const l = level(r); return SA.chip(l === 'limit' ? 'فوق العتبة' : l === 'warn' ? 'حد الإنذار' : 'تحت الحد', l === 'limit' ? 'danger' : l === 'warn' ? 'warning' : 'neutral'); } }, { key: 'stage', label: 'مسار الحالة', render: (r) => (r.cs ? SA.chip(AB_STAGE[r.cs.stage], 'info') : '—') }],
      rowActions: (r) => (r.cs ? absenceActions(r.e, r.cs) : [{ label: 'فتح حالة', icon: 'plus', onClick: () => absenceOpen(r.e) }]), empty: { icon: 'checkcircle', title: 'لا حالات غياب بدون إذن', text: 'لا يوجد موظف عليه أيام غياب مسجّلة.' } })));
  }

  /* — الأجهزة والمصدر — */
  const SRC = [['device', 'جهاز بصمة (Push/Pull)', 'مثال: ZKTeco-style — قائمة الأجهزة الفعلية Open'], ['kiosk', 'كشك الحضور (PIN/بطاقة)', 'مصدر مرشّح لاحقًا'], ['mobile', 'تطبيق الموبايل (Geofence اختياري)', 'قراءة واحدة بموافقة الموظف — بند 19'], ['csv', 'استيراد CSV يدوي', 'بديل مؤقت']];
  async function chooseSource(k) {
    if (!SA.can('hr.compliance.edit')) { SA.toast(NOPERM + ' (hr.compliance.edit)', 'warn'); return; }
    const res = await SA.confirm({ title: 'تحديد مصدر الحضور الأول', text: 'المصدر: «' + SRC.find((s) => s[0] === k)[1] + '». المصادر الأخرى تبقى «معطّلة — لاحقًا» (بند 45 · D2).', reasonRequired: true, confirmLabel: 'تثبيت المصدر', impact: ['تُحسب البصمات والاستثناءات من هذا المصدر وحده.', 'تعدد المصادر مستقبلاً يحتاج قاعدة أولوية وإزالة تكرار.'] });
    if (!res.ok) return; if (!(await SA.stepUp('policy.change'))) return;
    try { await SA.api(() => { const before = SET().attSource; tupd((t) => { t.settings.attSource = k; }); SA.audit('HR.ATTENDANCE.SOURCE_CONFIGURED', { target: { type: 'setting', id: 'att-source', label: 'مصدر الحضور الأول' }, reason: res.reason, before: { source: before || 'غير محدد' }, after: { source: k } }); }); SA.toast('تم تثبيت مصدر الحضور', 'success'); } catch (e) { SA.fail(e); }
  }
  async function syncDevice(dv) {
    if (!SA.can('hr.attendance.edit')) { SA.toast(NOPERM, 'warn'); return; }
    try { await SA.api(() => {
      const ok = dv.status !== 'offline'; const n = ok ? 8 + (hash(dv.id + Date.now()) % 30) : 0;
      tupd((t) => { const x = t.devices.find((q) => q.id === dv.id); if (ok) { x.lastSyncAt = nowIso(); x.driftS = (hash(dv.id) % 6); if (x.status === 'degraded') x.status = 'online'; } t.syncLog.unshift({ id: nextIdLocal(t.syncLog, 'SY'), at: nowIso(), deviceId: dv.id, ok, count: n, note: ok ? 'مزامنة يدوية' : 'تعذّر الاتصال — الجهاز مقطوع' }); });
      if (ok) SA.audit('HR.ATTENDANCE.PUNCH_IMPORTED', { target: { type: 'device', id: dv.id, label: dv.name }, after: { punches: n } });
      SA.toast(ok ? 'تمت المزامنة: ' + n + ' بصمة من ' + dv.name : 'تعذّرت المزامنة: ' + dv.name + ' غير متصل — البصمات هتتسجل لما يرجع.', ok ? 'success' : 'warn', { ms: 5500 });
    }); } catch (e) { SA.fail(e); }
  }
  async function toggleDevice(dv) {
    if (!SA.can('hr.attendance.edit')) { SA.toast(NOPERM, 'warn'); return; }
    const toOff = dv.status !== 'offline'; const res = await SA.confirm({ title: toOff ? 'محاكاة انقطاع جهاز' : 'إعادة اتصال الجهاز', text: dv.name, confirmLabel: 'تنفيذ', note: 'محاكاة لحالة الجهاز لأغراض الاختبار — تُسجَّل في التدقيق.' }); if (!res.ok) return;
    try { await SA.api(() => { tupd((t) => { const x = t.devices.find((q) => q.id === dv.id); x.status = toOff ? 'offline' : 'online'; if (!toOff) { x.lastSyncAt = nowIso(); } else x.lastSyncAt = new Date(Date.now() - (SET().deviceOfflineMin || 15) * 60000 - 120000).toISOString(); }); SA.audit(toOff ? 'HR.ATTENDANCE.DEVICE_OFFLINE' : 'HR.ATTENDANCE.DEVICE_ONLINE', { target: { type: 'device', id: dv.id, label: dv.name } }); if (toOff) SA.notify({ title: 'N-49 جهاز الحضور غير متصل', body: dv.name + ' — مقطوع أكثر من ' + (SET().deviceOfflineMin || 15) + ' دقيقة.', level: 'urgent', to: ['R-11', 'R-10'], link: '#/hr/attendance?tab=devices' }); }); SA.toast(toOff ? 'الجهاز الآن غير متصل' : 'عاد الجهاز للاتصال', 'success'); } catch (e) { SA.fail(e); }
  }
  function attDevicesTab(body) {
    const src = SET().attSource; const devs = T('devices') || []; const offMin = SET().deviceOfflineMin || 15;
    const stale = devs.filter((d) => d.status === 'offline' && (Date.now() - new Date(d.lastSyncAt).getTime()) / 60000 > offMin);
    if (stale.length) body.append(SA.alert('danger', h('b', {}, 'جهاز غير متصل: '), stale.map((d) => d.name + ' (منذ ' + Math.round((Date.now() - new Date(d.lastSyncAt).getTime()) / 60000) + ' د)').join('، '), ' — البصمات ستُسجَّل عند رجوع الاتصال (BR-ATT-13 · N-49).'));
    body.append(SA.card({ title: 'مصدر الحضور الأول', tags: [SA.tag('open', 'بند 45 · D2')] },
      !src ? SA.alert('warning', h('b', {}, 'لم يُحدَّد مصدر الحضور بعد (Open). '), 'تعمل الشاشات في وضع «لم يُحدَّد» ببيانات تجريبية. اختر مصدرًا واحدًا بعد مراجعة أجهزة الشركة، والبقية «معطّلة — لاحقًا».') : SA.alert('success', 'المصدر المعتمد: ', h('b', {}, (SRC.find((s) => s[0] === src) || [])[1]), ' — بقية المصادر معطّلة (لاحقًا).'),
      h('div.sap-choices', {}, SRC.map((s) => h('label.sap-choice', {}, h('input', { type: 'radio', name: 'src', value: s[0], checked: src === s[0], disabled: !!src || !SA.can('hr.compliance.edit'), onchange: () => chooseSource(s[0]) }), h('span', {}, h('b', {}, s[1]), h('small', {}, src && src !== s[0] ? 'معطّل — لاحقًا' : s[2]))))), !SA.can('hr.compliance.edit') ? h('p.sap-hrt-note', {}, 'اختيار المصدر لـHR Manager (hr.compliance.edit).') : null));
    body.append(SA.card({ flush: true, title: 'صحة الأجهزة', tags: SA.tag('new'), actions: [SA.btn({ label: 'مزامنة الكل', icon: 'refresh', kind: 'ghost', size: 'sm', perm: 'hr.attendance.edit', onClick: async () => { for (const d of devs) await syncDevice(d); } })] }, tbl({ rowId: 'id', pageSize: 10, caption: 'الأجهزة', rows: () => T('devices') || [],
      columns: [{ key: 'name', label: 'الجهاز', render: (d) => h('div', {}, h('b', {}, d.name), h('small', { style: { display: 'block', color: 'var(--color-text-muted)' } }, d.code + ' · ' + d.model)) }, { key: 'location', label: 'الموقع', render: (d) => d.location }, { key: 'mode', label: 'الاستلام', render: (d) => ({ push: 'Push', pull: 'Pull', csv: 'CSV' }[d.mode]) }, { key: 'status', label: 'الحالة', render: (d) => SA.chip({ online: 'متصل', degraded: 'بطيء', offline: 'غير متصل' }[d.status], { online: 'success', degraded: 'warning', offline: 'danger' }[d.status]) }, { key: 'last', label: 'آخر مزامنة', render: (d) => h('span.t-muted', {}, SA.fmt.rel(d.lastSyncAt)) }, { key: 'drift', label: 'انحراف الساعة', render: (d) => (d.driftS > 30 ? SA.chip(d.driftS + ' ث', 'warning') : d.driftS + ' ث') }],
      rowActions: (d) => [{ label: 'مزامنة الآن', icon: 'refresh', disabled: SA.can('hr.attendance.edit') ? false : NOPERM, onClick: () => syncDevice(d) }, { label: d.status === 'offline' ? 'محاكاة: عودة الاتصال' : 'محاكاة: انقطاع', icon: 'wifioff', disabled: SA.can('hr.attendance.edit') ? false : NOPERM, onClick: () => toggleDevice(d) }] })));
    body.append(SA.card({ flush: true, title: 'سجل المزامنة' }, tbl({ rowId: 'id', pageSize: 10, caption: 'سجل المزامنة', rows: () => T('syncLog') || [], initial: { sort: { key: 'at', dir: 'desc' } }, filters: [{ key: 'deviceId', label: 'الجهاز', options: devs.map((d) => [d.id, d.name]) }, { key: 'ok', label: 'النتيجة', options: [['1', 'نجاح'], ['0', 'فشل']], test: (r, v) => (v === '1') === r.ok }],
      columns: [{ key: 'at', label: 'الوقت', sort: true, render: (r) => SA.fmt.dt(r.at) }, { key: 'deviceId', label: 'الجهاز', render: (r) => (devs.find((d) => d.id === r.deviceId) || {}).name }, { key: 'ok', label: 'النتيجة', render: (r) => SA.chip(r.ok ? 'نجاح' : 'فشل', r.ok ? 'success' : 'danger') }, { key: 'count', label: 'البصمات', render: (r) => h('span.num', {}, r.count) }, { key: 'note', label: 'ملاحظة', render: (r) => r.note }] })));
    body.append(h('div', {}, specLink('hr-time', 'att-08', 'صحة الأجهزة في التصميم ↗')));
  }

  /* — قفل الشهر — */
  function lockChecks(ym) {
    const vis = activeEmps().map((e) => e.id); const exs = exAll().filter((x) => x.date.slice(0, 7) === ym && x.status !== 'resolved');
    const pend = corrAll().filter((c) => c.status === 'pending' && c.date.slice(0, 7) === ym);
    const leaves = (st.get('leaveRequests') || []).filter((l) => l.status === 'pending' && l.from.slice(0, 7) <= ym && l.to.slice(0, 7) >= ym);
    const offline = (T('devices') || []).filter((d) => d.status === 'offline');
    const unver = (T('otRequests') || []).filter((o) => o.date.slice(0, 7) === ym && o.status === 'worked');
    const items = [
      { id: 'ex', level: exs.length ? 'bad' : 'ok', text: exs.length ? exs.length + ' استثناء مفتوح — حلّها أو اكتب تنازلًا بسبب قبل القفل.' : 'لا استثناءات مفتوحة.' },
      { id: 'corr', level: pend.length ? 'bad' : 'ok', text: pend.length ? pend.length + ' طلب تصحيح معلّق.' : 'لا تصحيحات معلّقة.' },
      { id: 'lv', level: leaves.length ? 'warn' : 'ok', text: leaves.length ? leaves.length + ' طلب إجازة معلّق يمس الشهر (قد يُحوّل غيابًا إلى إجازة).' : 'لا إجازات معلّقة.' },
      { id: 'ot', level: unver.length ? 'warn' : 'ok', text: unver.length ? unver.length + ' أوفرتايم «تم العمل» لم يُتحقَّق منه بعد.' : 'الأوفرتايم متحقَّق.' },
      { id: 'dev', level: offline.length ? 'warn' : 'ok', text: offline.length ? offline.length + ' جهاز غير متصل — بصمات قد تكون محبوسة.' : 'كل الأجهزة متصلة.' }
    ];
    return { items, exs, blocking: items.filter((x) => x.level === 'bad').length };
  }
  async function lockMonth(ym) {
    if (!SA.can('hr.attendance.approve')) { SA.toast(NOPERM + ' (hr.attendance.approve)', 'warn'); return; }
    const chk = lockChecks(ym); const reasonF = SA.form.field({ name: 'w', label: 'تنازل مسجّل (إلزامي لأن هناك بنودًا مفتوحة)', type: 'textarea', rows: 2 });
    const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('div.sap-hrt-checks', {}, chk.items.map((x) => h('div.sap-hrt-check.is-' + x.level, {}, SA.icon(x.level === 'ok' ? 'checkcircle' : x.level === 'bad' ? 'xcircle' : 'alert', 'icon-sm'), h('div', {}, x.text)))), chk.blocking ? reasonF.el : null, h('p.sap-hrt-note', {}, 'بعد القفل: لا تعديل على السجل اليومي إلا بفتح استثنائي بصلاحية وسبب وإشعار للمرتبات. فروق إعادة الحساب: سياسة {Open}.'));
    simpleModal({ title: 'قفل شهر ' + D.monthLabel(ym) + ' للمرتبات', icon: 'lock', size: 'lg', accent: true, okLabel: 'قفل الشهر', body, async onOk() {
      const w = (reasonF.get() || '').trim(); if (chk.blocking && w.length < 3) { reasonF.error('فيه ' + chk.exs.length + ' استثناء لسه مفتوح. حلّها أو اكتب تنازل بسبب قبل القفل.'); return false; }
      if (!(await SA.stepUp('policy.change', { title: 'تأكيد قفل الشهر' }))) return false;
      try { await SA.api(() => { tupd((t) => { t.periods[ym] = Object.assign(t.periods[ym] || {}, { status: 'locked', lockedBy: SA.session.userId, lockedAt: nowIso(), waivers: w ? [{ reason: w, by: SA.session.userId, at: nowIso(), open: chk.exs.length }] : [] }); }); SA.audit('HR.ATTENDANCE.MONTH_LOCKED', { target: { type: 'period', id: ym, label: 'حضور ' + D.monthLabel(ym) }, reason: w, after: { استثناءات_متنازل_عنها: chk.exs.length } }); SA.notify({ title: 'N-23 شهر الحضور ' + D.monthLabel(ym) + ' مقفول للمرتبات', body: 'جاهز لدورة المرتبات — أي تعديل لاحق يحتاج فتحًا استثنائيًا.', level: 'action', to: ['R-13', 'R-11'], link: '#/hr/payroll' }); }); } catch (e) { SA.fail(e); return false; } SA.toast('تم قفل الشهر', 'success');
    } });
  }
  async function unlockMonth(ym) {
    if (!SA.can('hr.attendance.approve') || !isHrMgr()) { SA.toast(NOPERM + ' — الفتح الاستثنائي لـHR Manager', 'warn'); return; }
    const res = await SA.confirm({ title: 'فتح استثنائي لشهر ' + D.monthLabel(ym), danger: true, reasonRequired: true, confirmLabel: 'فتح استثنائي', text: 'عملية حرجة: تُشعَر المرتبات وتُعاد الحسابات، والفروق تُرحَّل أو تُعاد المسودة (سياسة Open).', warnings: ['يُنصح بموافقة ثانية من المدير العام/المالية [New].'] });
    if (!res.ok) return; if (!(await SA.stepUp('policy.change', { force: true, title: 'تأكيد الفتح الاستثنائي' }))) return;
    try { await SA.api(() => { tupd((t) => { Object.assign(t.periods[ym], { status: 'review', reopenedBy: SA.session.userId, reopenReason: res.reason, reopenedAt: nowIso() }); }); SA.audit('HR.ATTENDANCE.MONTH_UNLOCKED', { target: { type: 'period', id: ym, label: 'حضور ' + D.monthLabel(ym) }, reason: res.reason }); SA.notify({ title: 'فتح استثنائي لشهر الحضور ' + D.monthLabel(ym), body: 'السبب: ' + res.reason + ' — أعيدوا حساب المرتبات المتأثرة.', level: 'urgent', to: ['R-13', 'R-11', 'R-01'], link: '#/hr/payroll' }); }); SA.toast('تم الفتح الاستثنائي', 'success'); } catch (e) { SA.fail(e); }
  }
  function attLockTab(body, api) {
    const periods = T('periods') || {}; const months = Object.keys(periods).sort().reverse(); const ym = api.lockYm && months.indexOf(api.lockYm) >= 0 ? api.lockYm : (months.find((m) => periods[m].status !== 'locked') || months[0]); api.lockYm = ym; const per = periods[ym]; const chk = lockChecks(ym);
    const sel = SA.form.field({ name: 'm', label: '', type: 'select', value: ym, options: months.map((m) => [m, D.monthLabel(m) + ' — ' + ({ open: 'مفتوح', review: 'قيد المراجعة', locked: 'مقفول' }[periods[m].status] || periods[m].status)]), onChange: (v) => { api.lockYm = v; api.redraw(); } }); sel.input.classList.add('sap-hrt-sel'); sel.input.setAttribute('aria-label', 'الشهر');
    body.append(h('div.sap-hrt-tools', {}, h('div.sap-hrt-cluster', {}, sel.el, per.status === 'locked' ? SA.chip('مقفول', 'danger') : SA.chip('قيد المراجعة', 'warning')), h('div.sap-hrt-cluster', {}, per.status === 'locked' ? SA.btn({ label: 'فتح استثنائي…', icon: 'unlock', kind: 'danger', reason: SA.can('hr.attendance.approve') && isHrMgr() ? '' : NOPERM + ' (HR Manager)', onClick: () => unlockMonth(ym) }) : SA.btn({ label: 'قفل الشهر للمرتبات', icon: 'lock', kind: 'primary', perm: 'hr.attendance.approve', onClick: () => lockMonth(ym) }))));
    if (per.status === 'locked') body.append(SA.alert('info', 'قُفل بواسطة ', h('b', {}, SA.userName(per.lockedBy)), ' ', SA.fmt.rel(per.lockedAt), '. السجل اليومي والاستثناءات والتصحيحات لهذا الشهر لا تُعدَّل. ', (per.waivers || []).length ? 'تنازل مسجّل: ' + per.waivers[0].reason : ''));
    if (per.reopenReason) body.append(SA.alert('warning', 'فُتح استثنائيًا: ' + per.reopenReason));
    body.append(SA.card({ title: 'قائمة فحص القفل — ' + D.monthLabel(ym) }, h('div.sap-hrt-checks', {}, chk.items.map((x) => h('div.sap-hrt-check.is-' + x.level, {}, SA.icon(x.level === 'ok' ? 'checkcircle' : x.level === 'bad' ? 'xcircle' : 'alert', 'icon-sm'), h('div', {}, x.text, x.id === 'ex' && chk.exs.length ? h('button.sap-linkbtn', { type: 'button', style: { marginInlineStart: '8px' }, onclick: () => api.setTab('exceptions') }, 'افتح الطابور') : null))))));
    const sm = attendanceSummary(ym); const tot = Object.values(sm.employees).reduce((a, r) => { Object.keys(r).forEach((k) => { a[k] = (a[k] || 0) + r[k]; }); return a; }, {});
    body.append(SA.card({ title: 'ما يُرسل لدورة المرتبات (HR-14)' }, kpis([['أيام حضور', tot.present || 0], ['أيام تأخير', tot.late || 0, { sub: (tot.lateMin || 0) + ' دقيقة' }], ['أيام غياب', tot.absent || 0], ['أيام إجازة', tot.leave || 0]]), h('p.sap-hrt-note', { style: { marginTop: '10px' } }, 'الخصم/التحويل لإجازة سياسة D3 المفتوحة — المرتبات تقرأ العدّادات فقط عبر SA.hrTime.attendanceSummary("' + ym + '").')));
    body.append(h('div', {}, specLink('hr-time', 'att-09', 'قفل الشهر في التصميم ↗')));
  }

  /* — سياسة الحضور — */
  const ATT_POLICY_ROWS = [
    { path: 'lateCountMode', label: 'وضع عدّ التأخير', type: 'select', options: [['from_start', 'من بداية الوردية'], ['beyond_grace', 'بعد السماحية فقط']], ref: 'D3 — Open', hint: 'مثال: وردية 07:00 وسماحية 10 د وبصمة 07:14 ← 14 أو 4 دقائق', fmt: (v) => ({ from_start: 'من بداية الوردية', beyond_grace: 'بعد السماحية فقط' }[v]) },
    { path: 'lateEffect', label: 'أثر التأخير', type: 'select', options: [['deduct', 'خصم'], ['leave', 'تحويل لإجازة'], ['none', 'تنبيه فقط']], ref: 'D3 — Open', fmt: (v) => ({ deduct: 'خصم', leave: 'تحويل لإجازة', none: 'تنبيه فقط' }[v]) },
    { path: 'correctionWindowHours', label: 'مهلة طلب التصحيح', unit: 'ساعة', min: 1, ref: 'BR-ATT-06 — Open' }, { path: 'correctionsPerMonth', label: 'عدد التصحيحات الشهري', min: 1, ref: 'Open' }, { path: 'duplicateWindowMin', label: 'نافذة تجاهل البصمة المكررة', unit: 'دقيقة', min: 1, ref: 'BR-ATT-03 — Open' },
    { path: 'exceptionsCloseHours', label: 'مهلة إغلاق الاستثناءات', unit: 'ساعة', min: 1, ref: 'lifecycle §1.3' }, { path: 'deviceOfflineMin', label: 'تنبيه الجهاز غير المتصل بعد', unit: 'دقيقة', min: 1, ref: 'N-49' }
  ];
  function attPolicyTab(body) {
    body.append(SA.alert('info', 'سياسة التأخير والخروج المبكر وأثرها (D3 · بند 45) لم تُعتمد بعد — كل قيمة فارغة تظهر «غير مُعدّة» ولا يُخترع لها رقم. السماحية تُضبط لكل وردية (قيمة تجريبية 10 د).'));
    body.append(SA.card({ title: 'سياسات الحضور', tags: SA.tag('open', 'D3'), actions: [SA.btn({ label: 'تعديل السياسة', icon: 'edit', kind: 'primary', size: 'sm', perm: 'hr.compliance.edit', onClick: () => settingsEdit({ title: 'سياسات الحضور', rows: ATT_POLICY_ROWS, audit: 'HR.ATTENDANCE.POLICY_UPDATED' }) })] }, settingsTable(ATT_POLICY_ROWS, { caption: 'سياسات الحضور' })));
    body.append(SA.card({ title: 'عتبات الغياب بدون إذن (م 166 — مصدر ثانوي)' }, settingsTable([{ path: 'absence.consecWarn', label: 'متتالي — حد الإنذار', unit: 'يوم', ref: 'م 166' }, { path: 'absence.consecLimit', label: 'متتالي — العتبة', unit: 'يوم', ref: 'م 166' }, { path: 'absence.intermWarn', label: 'متقطع — حد الإنذار', unit: 'يوم', ref: 'م 166' }, { path: 'absence.intermLimit', label: 'متقطع — العتبة', unit: 'يوم', ref: 'م 166' }], { caption: 'العتبات' }), h('p.sap-hrt-note', { style: { marginTop: '8px' } }, 'ساعات رمضان وأي تخفيض: سياسة بنطاق تواريخ سنوي (لا حكم قانوني للقطاع الخاص) — Open.')));
  }

  function renderAttendance(root, ctx) {
    if (!ready()) return; runEscalation();
    ctx.setCrumbs([{ label: 'الوقت' }, { label: 'الحضور والاستثناءات' }]);
    return bootScreen(root, (host) => tabbed(host, ctx, {
      route: 'hr/attendance', title: 'الحضور والاستثناءات', desc: 'سجل يومي من مصدر واحد، طابور استثناءات بمهلة، تصحيحات بموافقة، شبكة شهرية، وقفل الشهر للمرتبات.', tags: [SA.tag('pending', 'HR-10'), SET().attSource ? null : SA.tag('open', 'المصدر لم يُحدَّد')],
      tabs: [{ id: 'today', label: 'اليوم', icon: 'activity' }, { id: 'exceptions', label: 'الاستثناءات', icon: 'alert', badge: () => { const v = new Set(visibleEmps().map((e) => e.id)); const n = exAll().filter((x) => x.status !== 'resolved' && v.has(x.employeeId)).length; return n || null; } }, { id: 'corrections', label: 'التصحيحات', icon: 'clipboard', badge: () => { const n = corrAll().filter((c) => c.status === 'pending').length; return n || null; } }, { id: 'month', label: 'الشبكة الشهرية', icon: 'grid' }, { id: 'absence', label: 'الغياب بدون إذن', icon: 'userx' }, { id: 'devices', label: 'الأجهزة والمصدر', icon: 'finger' }, { id: 'lock', label: 'قفل الشهر', icon: 'lock' }, { id: 'policy', label: 'السياسة', icon: 'settings' }],
      render: { today: attTodayTab, exceptions: attExceptionsTab, corrections: attCorrectionsTab, month: attMonthTab, absence: attAbsenceTab, devices: attDevicesTab, lock: attLockTab, policy: attPolicyTab }, paths: ['hrTime', 'attendance', 'leaveRequests', 'employees']
    }));
  }

  /* ═════════════════════════════════ HR-11 · الإجازات ═════════════════════════════════ */
  const lvAll = () => st.get('leaveRequests') || [];
  const lvTypeName = (id) => (leaveType(id) || {}).name || id;
  const DOC_LABEL = { medical_certificate: 'شهادة طبية', exam_proof: 'إثبات الامتحان' };
  /* coverage: members of a department grouped by their (rostered or default) shift, minus approved/pending(+hypothetical) leave */
  function coverageFor(deptId, from, to, hypo) {
    const g = (T('groups') || []).find((x) => x.deptId === deptId); if (!g) return [];
    const mem = activeEmps().filter((e) => e.departmentId === deptId); const out = [];
    D.range(from, to).forEach((d) => { if (D.dow(d) === g.restDay || holidayOn(d)) return; g.operates.forEach((s) => { const need = (g.minCoverage || {})[s]; if (need == null) return; const n = mem.filter((e) => { const rc = rosterCell(e.id, d); const code = rc && rc.code !== 'R' ? rc.code : rc ? null : shiftCodeOf(e); if (code !== s) return false; if (leaveOn(e.id, d)) return false; if (hypo && hypo.employeeId === e.id && d >= hypo.from && d <= hypo.to) return false; return true; }).length; if (n < need) out.push({ date: d, shift: s, n, need, group: g.name }); }); });
    return out;
  }
  function leaveChainFor(e, type) {
    const t = leaveType(type) || {}; const hrStep = { roleId: 'R-11', label: 'مدير الموارد البشرية' };
    if ((t.chain || []).indexOf('supervisor') < 0) return [hrStep];
    const mgr = emp(e.managerEmpId); const mu = mgr && mgr.userId ? SA.userById(mgr.userId) : null; const mr = mu ? SA.roleById(mu.roleId) : null;
    if (mu && mr && mu.id !== e.userId && SA.roleCan(mr, 'hr.leave.approve') && mr.id !== 'R-11') return [{ roleId: mr.id, label: 'المشرف المباشر' }, hrStep];
    return [{ roleId: 'R-11', label: 'مدير الموارد البشرية (لا مشرف معتمد للموظف)' }];
  }
  function validateLeave(o) {
    const e = emp(o.employeeId), t = leaveType(o.type); const errors = [], warns = []; const today = D.today(); const S = SET();
    const res = { errors, warns, days: 0, balBefore: null, balAfter: null, annualAfter: null };
    if (!e) { errors.push('اختر الموظف'); return res; } if (!t) { errors.push('اختر نوع الإجازة'); return res; } if (!t.active) { errors.push('هذا النوع موقوف.'); return res; }
    if (!validDate(o.from) || !validDate(o.to)) { errors.push('اكتب تاريخي البداية والنهاية بصيغة YYYY-MM-DD.'); return res; }
    if (o.to < o.from) { errors.push('تاريخ النهاية قبل البداية.'); return res; }
    const days = leaveDaysIn(e, o.from, o.to, o.type); res.days = days;
    if (days <= 0) errors.push('كل الأيام المختارة راحة أسبوعية أو عطلة رسمية — لا شيء يُخصم.');
    if (o.from < today) { if (o.type === 'sick' || (S.leaveRetro !== false)) warns.push('بأثر رجعي (يبدأ قبل اليوم) — يحتاج مراجعة HR.'); }
    if (lvAll().some((l) => l.employeeId === e.id && (l.status === 'approved' || l.status === 'pending') && l.id !== o.ignoreId && l.from <= o.to && o.from <= l.to)) errors.push('عندك إجازة معتمدة أو معلّقة في الأيام دي.');
    if (o.type === 'annual' || o.type === 'casual' || o.type === 'comp') {
      const b = bal(e.id, o.type); res.balBefore = b.remaining; res.balAfter = b.remaining - days;
      if (days > b.remaining && !(S.negativeBalance)) errors.push('رصيدك ' + b.remaining + ' يوم، والطلب ' + days + ' يوم. ممكن تعدّل التواريخ أو تطلب إجازة بدون أجر.');
      if (o.type === 'casual') { const mx = (t.accrual || {}).maxConsecutive || 2; if (days > mx) errors.push('الإجازة العارضة مينفعش تزيد عن ' + (mx === 2 ? 'يومين' : mx + ' أيام') + ' ورا بعض.'); const ba = bal(e.id, 'annual'); res.annualAfter = ba.remaining - days; if (days > ba.remaining) errors.push('العارضة تُخصم من السنوية ورصيد السنوية ' + ba.remaining + ' يوم فقط.'); }
    }
    (t.docs || []).forEach((d) => { if (!o.att) errors.push(d === 'medical_certificate' ? 'لازم ترفع الشهادة الطبية قبل ما نكمّل.' : 'لازم ترفع ' + DOC_LABEL[d] + ' قبل ما نكمّل.'); });
    const yrs = serviceYears(e); const ac = t.accrual || {};
    if (o.type === 'hajj' && ac.afterYears && yrs < ac.afterYears) errors.push('الحج يحتاج خدمة متصلة ≥ ' + ac.afterYears + ' سنوات — خدمة الموظف ' + (Math.round(yrs * 10) / 10) + ' سنة.');
    if (o.type === 'childcare' && yrs < 1) errors.push('رعاية الطفل تحتاج خدمة ≥ سنة (م 57 · Pending).');
    if (o.type === 'maternity') warns.push('تحقق من أهلية الموظفة (النوع/عدد المرات ≤ ' + (ac.maxTimes || '{3}') + '): الملف لا يحمل هذا الحقل.');
    if (o.type === 'exam' && o.from < D.add(today, ac.notice || 10)) warns.push('إخطار الامتحان المطلوب {' + (ac.notice || 10) + '} أيام — تحقق من الإثبات والمهلة.');
    if (o.type === 'sick' && S.sickScheme == null) warns.push('مخطط المرضي (A/B) لم يُحسم — قرار D1 مفتوح؛ يُسجَّل بدون حساب نسب الأجر.');
    if (e.departmentId) { const cov = coverageFor(e.departmentId, o.from, o.to, { employeeId: e.id, from: o.from, to: o.to }); if (cov.length) { res.coverage = cov; warns.push(cov[0].group + ' هيبقى أقل من الحد الأدنى في ' + cov.length + ' يوم/وردية (مثلًا ' + D.short(cov[0].date) + ' وردية ' + cov[0].shift + ': ' + cov[0].n + ' من ' + cov[0].need + ').'); } }
    return res;
  }
  function nextLvId() { const n = lvAll().reduce((m, l) => { const x = /^LV-\d+-(\d+)$/.exec(l.id); return x ? Math.max(m, +x[1]) : m; }, 0); return 'LV-2026-' + String(n + 1).padStart(4, '0'); }
  /** shared API: create a leave request (+ approval in the shared inbox). Returns {ok, lv?, errors?} — callers show errors. */
  function requestLeave(o) {
    ready(); const v = validateLeave(o); if (v.errors.length) return { ok: false, errors: v.errors, warns: v.warns };
    const e = emp(o.employeeId); const t = leaveType(o.type); const id = nextLvId(); const me = SA.session.userId;
    const chain = leaveChainFor(e, o.type); const mgr = emp(e.managerEmpId);
    const lv = { id, employeeId: e.id, type: o.type, from: o.from, to: o.to, days: v.days, status: 'pending', approverEmpId: mgr ? mgr.id : null, reason: o.reason || '', createdAt: nowIso(), createdBy: me, onBehalfBy: me && e.userId !== me ? me : null, attachment: o.att || null, coverageWarn: v.coverage ? v.coverage.length : 0 };
    st.insert('leaveRequests', lv);
    const ap = SA.requestApproval({ type: 'leave', title: 'إجازة ' + t.name + ': ' + e.name + ' (' + v.days + (v.days === 1 ? ' يوم' : ' أيام') + ')', requesterId: me || (e.userId || 'U-25'), chain, ref: { type: 'leave', id }, context: [['الموظف', e.name + ' (' + e.empNo + ')'], ['النوع', t.name], ['الفترة', D.fmt(o.from) + ' → ' + D.fmt(o.to) + ' (' + v.days + ' يوم)'], ['الرصيد بعد', v.balAfter == null ? '—' : v.balAfter + ' يوم'], ['تغطية الخط', v.coverage ? 'تحذير: ' + v.coverage.length + ' يوم/وردية تحت الحد' : 'سليمة'], ['السبب', o.reason || '—']] });
    st.patch('leaveRequests', id, { approvalId: ap.id });
    SA.audit('HR.LEAVE.REQUESTED', { target: { type: 'leave', id, label: e.name + ' — ' + t.name }, after: { from: o.from, to: o.to, days: v.days } });
    if (o.type === 'sick') { SA.audit('HR.LEAVE.SICK_RECORDED', { target: { type: 'leave', id, label: e.name }, after: { شهادة: 'مرفقة (T4 — لا تُعرض)' } }); const m2 = mgr && mgr.userId; if (m2) SA.notify({ title: 'N-34 إجازة مرضية مُسجَّلة لأحد فريقك', body: 'بدون تشخيص — ' + e.name + ' · ' + D.fmt(o.from), level: 'info', toUsers: [m2], link: '#/hr/leave' }); }
    return { ok: true, lv: st.find('leaveRequests', id), approval: ap, warns: v.warns };
  }
  function leaveCalc(e, type, from, to) { const v = validateLeave({ employeeId: e && e.id, type, from, to, att: 'x', ignoreId: null }); return v; }

  function leaveRequestFlow(pre) {
    pre = pre || {}; const vis = visibleEmps(); if (!vis.length) { SA.toast('لا موظفين ضمن نطاقك', 'warn'); return; }
    const types = (T('leaveTypes') || []).filter((t) => t.active);
    const f = { e: SA.form.field({ name: 'e', label: 'الموظف', type: 'select', required: true, value: pre.empId || '', options: [['', 'اختر…']].concat(vis.map((x) => [x.id, x.name + ' — ' + deptName(x.departmentId)])) }), t: SA.form.field({ name: 't', label: 'نوع الإجازة', type: 'select', required: true, value: pre.type || 'annual', options: types.map((x) => [x.id, x.name]) }), from: dateInput('from', 'من (YYYY-MM-DD)', pre.from || D.add(D.today(), 7), { dir: 'ltr' }), to: dateInput('to', 'إلى (YYYY-MM-DD)', pre.to || D.add(D.today(), 9), { dir: 'ltr' }), r: SA.form.field({ name: 'r', label: 'السبب', type: 'textarea', rows: 2 }), att: SA.form.field({ name: 'att', label: 'مرفق (اسم الملف / رقم الشهادة)', placeholder: 'مثال: medical-cert-0412.pdf — محاكاة رفع', dir: 'ltr', hint: 'pdf/jpg ≤ 10MB — الشهادة الطبية سرية T4' }) };
    const out = h('div'); const attWrap = f.att.el;
    const calc = () => { SA.clear(out); const e = emp(f.e.get()); const t = leaveType(f.t.get()); attWrap.style.display = t && (t.docs || []).length ? '' : 'none'; if (!e || !t) { out.append(h('p.sap-hrt-note', {}, 'اختر الموظف والنوع والتواريخ لتظهر حاسبة الرصيد.')); return; }
      const v = validateLeave({ employeeId: e.id, type: t.id, from: f.from.get(), to: f.to.get(), att: (t.docs || []).length ? f.att.get() : 'x' });
      const bals = ['annual', 'casual'].map((k) => bal(e.id, k));
      out.append(h('div.sap-hrt-balance', {}, h('div', {}, h('small', {}, 'أيام الخصم'), h('b.num', {}, v.days), h('small', {}, 'بدون الراحة والعطلات')), h('div', {}, h('small', {}, 'رصيد السنوية'), h('b.num', {}, bals[0].remaining), h('small', {}, v.annualAfter != null ? 'بعد: ' + v.annualAfter : t.id === 'annual' ? 'بعد: ' + v.balAfter : ' ')), h('div', {}, h('small', {}, 'رصيد العارضة'), h('b.num', {}, bals[1].remaining), h('small', {}, t.id === 'casual' ? 'بعد: ' + v.balAfter : ' '))),
        h('div.sap-hrt-checks', { style: { marginTop: '8px' } }, v.errors.map((x) => h('div.sap-hrt-check.is-bad', { role: 'alert' }, SA.icon('xcircle', 'icon-sm'), h('div', {}, x))), v.warns.map((x) => h('div.sap-hrt-check.is-warn', {}, SA.icon('alert', 'icon-sm'), h('div', {}, x))), !v.errors.length ? h('div.sap-hrt-check.is-ok', {}, SA.icon('checkcircle', 'icon-sm'), h('div', {}, 'الطلب صالح. سلسلة الاعتماد: ', leaveChainFor(e, t.id).map((c) => c.label).join(' ← '))) : null)); };
    ['e', 't'].forEach((k) => f[k].input.addEventListener('change', calc)); ['from', 'to', 'att'].forEach((k) => f[k].input.addEventListener('input', calc)); calc();
    simpleModal({ title: 'طلب إجازة', subtitle: 'فحص الرصيد والتداخل والتغطية قبل الإرسال', icon: 'clipboard', size: 'lg', okLabel: 'إرسال الطلب', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, h('div.sap-formgrid', {}, f.e.el, f.t.el, f.from.el, f.to.el), f.r.el, attWrap, out), async onOk() {
      const e = emp(f.e.get()); if (!e) { f.e.error('اختر الموظف'); return false; } if (isSelfOrRelative(e.id) && SA.session.personaId !== 'owner' && !(SA.can('hr.leave.create') && myEmp() && myEmp().id === e.id)) { f.e.error('لا تقدّم نيابةً عن نفسك أو قريبك.'); return false; }
      let r; try { r = await SA.api(() => requestLeave({ employeeId: e.id, type: f.t.get(), from: f.from.get(), to: f.to.get(), reason: f.r.get(), att: f.att.get() || ((leaveType(f.t.get()).docs || []).length ? '' : null) })); } catch (x) { SA.fail(x); return false; }
      if (!r.ok) { SA.toast(r.errors[0], 'error', { ms: 6500 }); calc(); return false; }
      SA.toast('أُرسل الطلب ' + r.lv.id + ' إلى ' + leaveChainFor(e, r.lv.type)[0].label, 'success', { ms: 5000 });
    } });
  }
  function chainView(ap) {
    if (!ap) return h('p.sap-hrt-note', {}, 'لا يوجد طلب اعتماد مرتبط (سجل قديم).');
    return h('ol.sap-hrt-chain', {}, h('li.is-done', {}, h('b', {}, 'مقدّم الطلب'), h('small', {}, SA.userName(ap.requesterId))), ap.chain.map((c) => h('li', { class: c.status === 'approved' ? 'is-done' : c.status === 'rejected' ? 'is-no' : c.status === 'pending' ? 'is-now' : c.status === 'skipped' ? 'is-off' : '' }, h('b', {}, c.label), h('small', {}, c.status === 'approved' ? 'اعتمد: ' + SA.userName(c.decidedBy) : c.status === 'rejected' ? 'رفض: ' + SA.userName(c.decidedBy) : c.status === 'pending' ? 'بانتظار القرار' : c.status === 'skipped' ? 'متخطّى' : 'ينتظر السابق'), c.escalated ? h('small', { style: { color: 'var(--color-danger)' } }, 'مُصعَّد تلقائيًا') : null, c.reason ? h('small', {}, '«' + c.reason + '»') : null)));
  }
  async function leaveDecide(lv, ok) {
    const e = emp(lv.employeeId); const ap = apOf(lv.approvalId); const why = cannotDecide(ap, e, 'leave'); if (why) { SA.toast(why, 'warn', { ms: 6000 }); return; }
    const cov = lv.status === 'pending' ? coverageFor(e.departmentId, lv.from, lv.to, { employeeId: e.id, from: lv.from, to: lv.to }) : [];
    const needReason = !ok || cov.length > 0;
    const res = await SA.confirm({ title: (ok ? 'اعتماد' : 'رفض') + ' الإجازة ' + lv.id, text: e.name + ' — ' + lvTypeName(lv.type) + ' · ' + D.fmt(lv.from) + ' → ' + D.fmt(lv.to) + ' (' + lv.days + ' يوم)', danger: !ok, reasonRequired: needReason, reasonLabel: ok && cov.length ? 'سبب الاعتماد مع تحذير التغطية' : 'السبب', confirmLabel: ok ? 'اعتماد' : 'رفض', warnings: cov.length ? ['تحذير تغطية: خط ' + cov[0].group + ' تحت الحد في ' + cov.length + ' يوم/وردية — الاعتماد مع تحذير يتطلب سببًا.'] : [], impact: ok ? [ap && ap.currentStep < ap.chain.length ? 'تنتقل الخطوة إلى ' + ap.chain[ap.currentStep].label + '.' : 'تُخصم الأيام من الرصيد وتظهر كـ«ج» في شبكة الحضور وتقويم الفريق.', 'يظهر القرار في صندوق الاعتمادات المشترك.'] : ['يُبلَّغ الموظف بالرفض وسببه.'] });
    if (!res.ok) return; await decideApproval(ap, ok ? 'approve' : 'reject', res.reason, e, 'leave'); const fresh = st.find('leaveRequests', lv.id);
    SA.toast(ok ? (fresh.status === 'approved' ? 'تم اعتماد الإجازة وخُصمت من الرصيد' : 'تم اعتماد خطوتك — انتقل الطلب للخطوة التالية') : 'تم رفض الطلب', 'success');
  }
  async function leaveCancel(lv) {
    const e = emp(lv.employeeId); if (!(SA.can('hr.leave.approve') || SA.can('hr.leave.create'))) { SA.toast(NOPERM, 'warn'); return; } if (e && isSelfOrRelative(e.id) && SA.session.personaId !== 'owner') { SA.toast('لا تلغِ إجازتك أو إجازة قريبك.', 'error'); return; }
    const was = lv.status; const res = await SA.confirm({ title: 'إلغاء الإجازة ' + lv.id, danger: true, reasonRequired: true, confirmLabel: 'إلغاء الإجازة', text: e.name + ' — ' + lvTypeName(lv.type) + ' · ' + D.fmt(lv.from) + ' → ' + D.fmt(lv.to), impact: was === 'approved' ? ['قيد عكسي في دفتر الرصيد يعيد ' + lv.days + ' يوم.', 'يعود اليوم لشبكة الحضور وفق الجدول.'] : ['يُسحب الطلب من صندوق الاعتمادات.'] });
    if (!res.ok) return;
    try { await SA.api(() => {
      st.patch('leaveRequests', lv.id, { status: 'cancelled', cancelledBy: SA.session.userId, cancelledAt: nowIso(), cancelReason: res.reason });
      if (was === 'approved') { if (lv.type === 'annual' || lv.type === 'casual') adjustBalance(lv.employeeId, lv.type, -lv.days); if (lv.type === 'casual') adjustBalance(lv.employeeId, 'annual', -lv.days); ledgerAdd(lv.employeeId, lv.type, 'reversal', lv.days, lv.id, 'إلغاء إجازة — قيد عكسي'); if (lv.type === 'casual') ledgerAdd(lv.employeeId, 'annual', 'reversal', lv.days, lv.id, 'إلغاء عارضة — قيد عكسي'); }
      const ap = apOf(lv.approvalId); if (ap && ap.status === 'pending') st.update('approvals', (l) => { const r = l.find((x) => x.id === ap.id); r.status = 'rejected'; r.chain.forEach((c) => { if (c.status === 'pending' || c.status === 'waiting') { c.status = c.status === 'pending' ? 'rejected' : 'skipped'; if (c.status === 'rejected') { c.decidedBy = SA.session.userId; c.decidedAt = nowIso(); c.reason = 'سُحب الطلب: ' + res.reason; } } }); r.updatedAt = nowIso(); });
      SA.audit('HR.LEAVE.CANCELLED', { target: { type: 'leave', id: lv.id, label: e.name }, reason: res.reason, after: { status: 'ملغاة', أعيدت_للرصيد: was === 'approved' ? lv.days : 0 } });
    }); } catch (x) { SA.fail(x); return; }
    if (e.userId) SA.notify({ title: 'أُلغيت الإجازة ' + lv.id, body: res.reason, level: 'info', toUsers: [e.userId], link: '#/hr/leave' });
    SA.toast('تم إلغاء الإجازة', 'success');
  }
  function openLeave(lvId) {
    const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }); const lv0 = st.find('leaveRequests', lvId); if (!lv0) return;
    const d = SA.drawer({ title: 'إجازة ' + lvId, subtitle: empName(lv0.employeeId), size: 'lg', body });
    const draw = () => {
      SA.clear(body); const lv = st.find('leaveRequests', lvId); const e = emp(lv.employeeId); const ap = apOf(lv.approvalId); const isSickT4 = lv.type === 'sick' && !SA.canSensitive('hr.medical.view');
      const bals = ['annual', 'casual'].map((k) => bal(lv.employeeId, k)); const cov = lv.status === 'pending' ? coverageFor(e.departmentId, lv.from, lv.to, { employeeId: e.id, from: lv.from, to: lv.to }) : [];
      const why = lv.status === 'pending' ? cannotDecide(ap, e, 'leave') : 'الطلب ليس معلّقًا';
      body.append(h('div.sap-hrt-cluster', {}, stChip(LV_ST, lv.status), SA.chip(lvTypeName(lv.type), 'info'), lv.escalatedAt ? SA.chip('مُصعَّد تلقائيًا', 'danger') : null, lv.onBehalfBy ? SA.chip('بالنيابة: ' + SA.userName(lv.onBehalfBy), 'neutral') : null),
        SA.kv([['الموظف', e ? e.name + ' (' + e.empNo + ')' : lv.employeeId], ['القسم', e ? deptName(e.departmentId) : '—'], ['الفترة', D.fmt(lv.from) + ' → ' + D.fmt(lv.to)], ['أيام الخصم', lv.days + ' يوم'], ['السبب', isSickT4 ? SA.tag('pending', 'محجوب — T4') : (lv.reason || '—')], ['المرفق', lv.attachment ? (isSickT4 ? 'شهادة طبية (محجوبة — hr.medical.view)' : lv.attachment) : '—'], ['قُدّم', SA.fmt.dt(lv.createdAt)], ['الرصيد (سنوية / عارضة)', bals[0].remaining + ' / ' + bals[1].remaining + ' يوم']]),
        h('div', {}, h('h4.sap-sub', {}, 'سلسلة الاعتماد'), chainView(ap), ap && ap.status === 'pending' ? h('p.sap-hrt-note', {}, 'التصعيد التلقائي لـHR بعد ' + (SET().leaveEscalationDays == null ? 'غير مُعدّ' : SET().leaveEscalationDays + ' يوم عمل') + ' — ', h('a', { href: '#/approvals/' + ap.id }, 'افتحه في صندوق الاعتمادات')) : ap ? h('p.sap-hrt-note', {}, h('a', { href: '#/approvals/' + ap.id }, 'افتحه في صندوق الاعتمادات المشترك')) : null));
      if (cov.length) body.append(SA.alert('warning', h('b', {}, 'تحذير تغطية: '), cov[0].group + ' تحت الحد الأدنى في ' + cov.length + ' يوم/وردية (' + cov.slice(0, 3).map((x) => D.short(x.date) + ' ' + x.shift + ' ' + x.n + '/' + x.need).join('، ') + ').'));
      if (lv.status === 'rejected' && lv.decisionReason) body.append(SA.alert('danger', 'سبب الرفض: ' + lv.decisionReason));
      if (lv.status === 'cancelled') body.append(SA.alert('info', 'أُلغيت بواسطة ' + SA.userName(lv.cancelledBy) + ' — ' + (lv.cancelReason || '')));
      body.append(h('div.sap-hrt-cluster', {}, lv.status === 'pending' ? [SA.btn({ label: 'اعتماد', icon: 'checkcircle', kind: 'primary', reason: why, onClick: () => leaveDecide(lv, true) }), SA.btn({ label: 'رفض', icon: 'xcircle', kind: 'danger', reason: why, onClick: () => leaveDecide(lv, false) })] : null, lv.status === 'pending' || lv.status === 'approved' ? SA.btn({ label: 'إلغاء الإجازة', icon: 'trash', kind: 'ghost', reason: SA.can('hr.leave.approve') || SA.can('hr.leave.create') ? '' : NOPERM, onClick: () => leaveCancel(lv) }) : null));
      if (why && lv.status === 'pending') body.append(h('p.sap-hrt-note', {}, 'لماذا الأزرار مقفولة؟ ' + why));
    };
    draw(); const offs = ['leaveRequests', 'approvals', 'hrTime', 'leaveBalances'].map((p) => st.subscribe(p, () => { if (document.body.contains(d.el)) draw(); }));
  }
  function leaveRequestsTab(body) {
    const vis = new Set(visibleEmps().map((e) => e.id)); const me = SA.session.userId; const all = lvAll().filter((l) => vis.has(l.employeeId) || l.createdBy === me);
    const mine = all.filter((l) => l.status === 'pending' && (() => { const e = emp(l.employeeId); const ap = apOf(l.approvalId); return ap && !cannotDecide(ap, e, 'leave'); })());
    const monthStart = D.today().slice(0, 7);
    body.append(kpis([['بانتظار قراري', mine.length, { accent: mine.length > 0, sub: mine.length ? 'افتح الطلب لتقرر' : '' }], ['معلّقة', all.filter((l) => l.status === 'pending').length], ['مُصعَّدة', all.filter((l) => l.status === 'pending' && l.escalatedAt).length], ['معتمدة هذا الشهر', all.filter((l) => l.status === 'approved' && l.from.slice(0, 7) <= monthStart && l.to.slice(0, 7) >= monthStart).length]]));
    if (SET().leaveEscalationDays != null) body.append(h('p.sap-hrt-note', {}, 'التصعيد التلقائي: خطوة المشرف تُفتح لـHR بعد ', h('b.num', {}, SET().leaveEscalationDays), ' يوم عمل (Pending). الإجازة المرضية المثبتة: HR يسجّل والمشرف يُبلَّغ بلا تشخيص.'));
    body.append(SA.card({ flush: true, title: 'طلبات الإجازة', tags: SA.tag('pending') }, tbl({ rowId: 'id', pageSize: 10, caption: 'طلبات الإجازة', rows: () => lvAll().filter((l) => vis.has(l.employeeId) || l.createdBy === me), initial: { sort: { key: 'createdAt', dir: 'desc' } }, search: { placeholder: 'ابحث باسم الموظف أو رقم الطلب…', keys: ['id', (l) => empName(l.employeeId)] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(LV_ST).map((k) => [k, LV_ST[k][0]]) }, { key: 'type', label: 'النوع', options: (T('leaveTypes') || []).map((t) => [t.id, t.name]) }],
      columns: [{ key: 'id', label: 'الرقم', sort: true, render: (l) => h('b.num', {}, l.id) }, { key: 'emp', label: 'الموظف', sort: true, value: (l) => empName(l.employeeId), render: (l) => { const e = emp(l.employeeId); return e ? empCell(e, deptName(e.departmentId)) : l.employeeId; } }, { key: 'type', label: 'النوع', sort: true, render: (l) => lvTypeName(l.type) }, { key: 'from', label: 'الفترة', sort: true, render: (l) => h('span', {}, D.short(l.from) + ' → ' + D.short(l.to)) }, { key: 'days', label: 'الأيام', sort: true, render: (l) => h('span.num', {}, l.days) },
        { key: 'status', label: 'الحالة', sort: true, render: (l) => { const ap = apOf(l.approvalId); const st0 = currentStep(ap); return h('div', {}, stChip(LV_ST, l.status), l.status === 'pending' && st0 ? h('small', { style: { display: 'block', color: 'var(--color-text-muted)' } }, 'عند: ' + st0.label) : null, l.escalatedAt && l.status === 'pending' ? h('span.sap-hrt-tag.is-bad', {}, 'مُصعَّد') : null, l.coverageWarn ? h('span.sap-hrt-tag.is-warn', {}, 'تغطية') : null); } }, { key: 'createdAt', label: 'قُدّم', sort: true, render: (l) => h('span.t-muted', {}, SA.fmt.rel(l.createdAt)) }],
      rowActions: (l) => { const e = emp(l.employeeId); const ap = apOf(l.approvalId); const why = l.status !== 'pending' ? 'الطلب ليس معلّقًا' : cannotDecide(ap, e, 'leave') || false; return [{ label: 'فتح التفاصيل', icon: 'eye', onClick: () => openLeave(l.id) }, { label: 'اعتماد', icon: 'checkcircle', disabled: why, onClick: () => leaveDecide(l, true) }, { label: 'رفض', icon: 'xcircle', danger: true, disabled: why, onClick: () => leaveDecide(l, false) }, { divider: true }, { label: 'إلغاء', icon: 'trash', disabled: l.status === 'pending' || l.status === 'approved' ? (SA.can('hr.leave.approve') || SA.can('hr.leave.create') ? false : NOPERM) : 'غير متاح', onClick: () => leaveCancel(l) }]; },
      onRowClick: (l) => openLeave(l.id), empty: { icon: 'clipboard', title: 'لا توجد طلبات إجازة', text: 'سيظهر هنا ما يخص نطاقك. الطلب الجديد يمرّ على المشرف ثم HR.', action: SA.can('hr.leave.create') ? { label: 'طلب إجازة', onClick: () => leaveRequestFlow() } : null } })));
    body.append(h('div', {}, specLink('hr-time', 'lve-07', 'صندوق اعتماد الإجازات في التصميم ↗')));
  }

  /* — تقويم الفريق — */
  function leaveCalendarTab(body, api) {
    const ym = api.cym || D.today().slice(0, 7); api.cym = ym; const days = D.monthDays(ym); const vis = visibleEmps(); const dept = api.cdept || ''; const list = dept ? vis.filter((e) => e.departmentId === dept) : vis; const today = D.today();
    const ds = SA.form.field({ name: 'dp', label: '', type: 'select', value: dept, options: [['', 'كل الأقسام']].concat(Array.from(new Set(vis.map((e) => e.departmentId))).map((d) => [d, deptName(d)])), onChange: (v) => { api.cdept = v; api.redraw(); } }); ds.input.classList.add('sap-hrt-sel'); ds.input.setAttribute('aria-label', 'القسم');
    body.append(h('div.sap-hrt-tools', {}, h('div.sap-hrt-cluster', {}, SA.btn({ label: 'الشهر السابق', icon: 'arrowright', kind: 'ghost', size: 'sm', iconOnly: true, onClick: () => { api.cym = D.addMonth(ym, -1); api.redraw(); } }), h('b', { style: { minWidth: '110px', textAlign: 'center' } }, D.monthLabel(ym)), SA.btn({ label: 'الشهر التالي', icon: 'arrowleft', kind: 'ghost', size: 'sm', iconOnly: true, onClick: () => { api.cym = D.addMonth(ym, 1); api.redraw(); } }), ds.el)));
    const pend = (eid, d) => lvAll().find((l) => l.employeeId === eid && l.status === 'pending' && l.from <= d && d <= l.to);
    const thead = h('thead', {}, h('tr', {}, h('th.sap-hrt-namecol', {}, 'الموظف'), days.map((d) => h('th', { class: [D.dow(d) === 5 ? 'is-rest' : '', d === today ? 'is-today' : ''] }, D.parse(d).getDate(), h('small', {}, D.dayName(d).slice(0, 3))))));
    const tbody = h('tbody', {}, list.map((e) => h('tr', {}, h('td.sap-hrt-namecol', {}, h('b', {}, e.name), h('small', { style: { display: 'block', color: 'var(--color-text-muted)' } }, deptName(e.departmentId))), days.map((d) => { const lv = leaveOn(e.id, d), pl = !lv && pend(e.id, d), hol = holidayOn(d); const isRest = D.dow(d) === restDayOf(e); const cls = lv ? 'L' : pl ? 'pend' : hol ? 'H' : isRest ? 'R' : ''; const lab = lv ? 'ج' : pl ? 'م' : hol ? 'ع' : isRest ? 'ر' : ''; const sick = lv && lv.type === 'sick' && !SA.canSensitive('hr.medical.view'); return h('td', { class: isRest ? 'is-rest' : '' }, h('button.sap-hrt-cell' + (cls ? '.is-' + cls : ''), { type: 'button', style: pl ? { background: '#fff4cc', color: '#6b5200' } : null, disabled: !lv && !pl, title: lv ? (sick ? 'إجازة (النوع محجوب T4)' : lvTypeName(lv.type)) + ' — ' + lv.id : pl ? 'معلّقة ' + pl.id : hol ? hol.name : isRest ? 'راحة' : '', onclick: () => openLeave((lv || pl).id) }, lab)); }))));
    body.append(list.length ? h('div.sap-hrt-gridwrap', { role: 'region', 'aria-label': 'تقويم الفريق', tabindex: '0' }, h('table.sap-hrt-grid', {}, thead, tbody)) : SA.card({}, SA.empty({ icon: 'users', title: 'لا موظفين', text: 'لا يوجد موظفون ضمن هذا الفلتر.' })));
    body.append(h('div.sap-hrt-legend', {}, h('span', {}, h('i.sap-hrt-cell.is-L', { style: { display: 'inline-grid', width: '22px', height: '22px', minWidth: 0 } }, 'ج'), 'إجازة معتمدة'), h('span', {}, h('i.sap-hrt-cell', { style: { display: 'inline-grid', width: '22px', height: '22px', minWidth: 0, background: '#fff4cc', color: '#6b5200' } }, 'م'), 'معلّقة'), h('span', {}, h('i.sap-hrt-cell.is-H', { style: { display: 'inline-grid', width: '22px', height: '22px', minWidth: 0 } }, 'ع'), 'عطلة رسمية'), h('span', {}, h('i.sap-hrt-cell.is-R', { style: { display: 'inline-grid', width: '22px', height: '22px', minWidth: 0 } }, 'ر'), 'راحة')));
    const warns = []; Array.from(new Set(list.map((e) => e.departmentId))).forEach((dp) => { const cov = coverageFor(dp, days[0], days[days.length - 1]); if (cov.length) warns.push({ dp, cov }); });
    body.append(SA.card({ title: 'تحذيرات التغطية', tags: SA.tag('new'), actions: [h('span.chip' + (warns.length ? '.chip-warning' : '.chip-success'), {}, warns.length ? warns.reduce((a, w) => a + w.cov.length, 0) + ' يوم/وردية تحت الحد' : 'سليمة')] }, warns.length ? h('div.sap-hrt-checks', {}, warns.map((w) => h('div.sap-hrt-check.is-warn', {}, SA.icon('alert', 'icon-sm'), h('div', {}, h('b', {}, deptName(w.dp)), ': ', w.cov.slice(0, 5).map((x) => D.short(x.date) + ' وردية ' + x.shift + ' (' + x.n + ' من ' + x.need + ')').join('، '), w.cov.length > 5 ? ' …+' + (w.cov.length - 5) : '')))) : SA.empty({ icon: 'checkcircle', title: 'لا تحذيرات تغطية', text: 'الإجازات المعتمدة لا تُنزل أي خط تحت حدّه الأدنى (قيم الحد تجريبية — Open).' })));
  }

  /* — الأرصدة والدفتر — */
  function adjustFlow(e) {
    if (!SA.can('hr.leave.approve') || !SA.can('hr.compliance.edit')) { SA.toast(NOPERM + ' — تعديل الرصيد لـHR Manager', 'warn'); return; } if (isSelfOrRelative(e.id) && SA.session.personaId !== 'owner') { SA.toast('لا تعدّل رصيدك أو رصيد قريبك.', 'error'); return; }
    const f = { t: SA.form.field({ name: 't', label: 'نوع الرصيد', type: 'select', required: true, value: 'annual', options: [['annual', 'سنوية'], ['casual', 'عارضة'], ['comp', 'يوم بدل']] }), q: SA.form.field({ name: 'q', label: 'التغيير (موجب يزيد / سالب يخصم)', type: 'number', required: true, value: 1, hint: 'قيد في دفتر الحركات — لا تعديل للأصل' }), r: SA.form.field({ name: 'r', label: 'سبب التعديل (إلزامي)', type: 'textarea', rows: 2, required: true }) };
    simpleModal({ title: 'تعديل رصيد: ' + e.name, icon: 'edit', body: h('div.sap-formgrid', {}, f.t.el, f.q.el, f.r.el), okLabel: 'تسجيل القيد', async onOk() {
      if (!SA.form.group(Object.values(f)).validate()) return false; const q = +f.q.get(); if (!q) { f.q.error('قيمة غير صفرية'); return false; } const ty = f.t.get(); const b = bal(e.id, ty);
      if (b.remaining + q < 0 && !SET().negativeBalance) { f.q.error('سيجعل الرصيد سالبًا (' + (b.remaining + q) + ') — سياسة الرصيد السالب Open'); return false; }
      if (!(await SA.stepUp('policy.change', { title: 'تأكيد تعديل رصيد' }))) return false;
      try { await SA.api(() => { adjustBalance(e.id, ty, -q); ledgerAdd(e.id, ty, 'adjust', q, null, f.r.get()); SA.audit('HR.LEAVE.BALANCE_ADJUSTED', { target: { type: 'balance', id: e.id + '/' + ty, label: e.name + ' — ' + lvTypeName(ty) }, reason: f.r.get(), before: { الرصيد: b.remaining }, after: { الرصيد: b.remaining + q } }); }); } catch (x) { SA.fail(x); return false; } SA.toast('سُجّل قيد التعديل', 'success');
    } });
  }
  function openBalances(empId) {
    const e = emp(empId); const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }); const d = SA.drawer({ title: 'أرصدة ' + e.name, subtitle: e.empNo + ' · ' + deptName(e.departmentId), size: 'lg', body });
    const draw = () => { SA.clear(body); const bs = ['annual', 'casual', 'comp'].map((k) => [k, bal(empId, k)]); const led = (T('ledger') || []).filter((x) => x.employeeId === empId).slice().reverse(); const kind = { opening: 'افتتاحي', accrual: 'استحقاق', taken: 'أخذ', reversal: 'عكسي', adjust: 'تعديل', cashout: 'صرف', carry: 'ترحيل', forfeit: 'إسقاط' };
      body.append(h('div.sap-hrt-balance', {}, bs.map((x) => h('div', {}, h('small', {}, lvTypeName(x[0])), h('b.num', {}, x[1].remaining), h('small', {}, 'مستحق ' + x[1].entitled + ' · مأخوذ ' + x[1].used), h('div.sap-hrt-bar' + (x[1].entitled && x[1].remaining / x[1].entitled < 0.2 ? '.is-warn' : ''), {}, h('i', { style: { width: (x[1].entitled ? Math.min(100, Math.round(x[1].used / x[1].entitled * 100)) : 0) + '%' } }))))),
        h('p.sap-hrt-note', {}, SA.tag('pending'), ' الاستحقاق من شرائح م 124 (15/21/30/45 · Pending) — الخدمة ', Math.round(serviceYears(e) * 10) / 10, ' سنة. الرصيد = دفتر حركات append-only.'),
        h('div.sap-hrt-cluster', {}, SA.btn({ label: 'تعديل رصيد…', icon: 'edit', kind: 'ghost', size: 'sm', reason: SA.can('hr.leave.approve') && SA.can('hr.compliance.edit') ? '' : NOPERM + ' (HR Manager)', onClick: () => adjustFlow(e) })),
        h('h4.sap-sub', {}, 'دفتر الحركات'), led.length ? h('div.table-wrap', {}, h('table.table.sap-mini', {}, h('thead', {}, h('tr', {}, h('th', {}, 'التاريخ'), h('th', {}, 'النوع'), h('th', {}, 'الحركة'), h('th', {}, 'الكمية'), h('th', {}, 'ملاحظة'))), h('tbody', {}, led.map((x) => h('tr', {}, h('td', {}, SA.fmt.date(x.at)), h('td', {}, lvTypeName(x.type)), h('td', {}, kind[x.kind] || x.kind), h('td.num', { style: { color: x.qty < 0 ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 700 } }, (x.qty > 0 ? '+' : '') + x.qty), h('td', {}, x.note + (x.refId ? ' (' + x.refId + ')' : ''))))))) : SA.empty({ icon: 'list', title: 'لا حركات' })); };
    draw(); ['hrTime', 'leaveBalances'].forEach((p) => st.subscribe(p, () => { if (document.body.contains(d.el)) draw(); }));
  }
  function leaveBalancesTab(body) {
    const vis = visibleEmps(); const rows = vis.map((e) => ({ id: e.id, e, a: bal(e.id, 'annual'), c: bal(e.id, 'casual'), k: bal(e.id, 'comp') }));
    body.append(SA.card({ flush: true, title: 'أرصدة الإجازات', tags: SA.tag('pending'), actions: [] }, tbl({ rowId: 'id', pageSize: 10, caption: 'أرصدة الإجازات', rows: () => visibleEmps().map((e) => ({ id: e.id, e, a: bal(e.id, 'annual'), c: bal(e.id, 'casual'), k: bal(e.id, 'comp') })), search: { placeholder: 'ابحث باسم الموظف…', keys: [(r) => r.e.name, (r) => r.e.empNo] }, initial: { sort: { key: 'annual', dir: 'asc' } },
      columns: [{ key: 'emp', label: 'الموظف', sort: true, value: (r) => r.e.name, render: (r) => empCell(r.e) }, { key: 'annual', label: 'السنوية', sort: true, value: (r) => r.a.remaining, render: (r) => h('div', { style: { minWidth: '120px' } }, h('b.num', {}, r.a.remaining), h('small', { style: { color: 'var(--color-text-muted)' } }, ' من ' + r.a.entitled), h('div.sap-hrt-bar' + (r.a.entitled && r.a.remaining / r.a.entitled < 0.2 ? '.is-warn' : ''), {}, h('i', { style: { width: (r.a.entitled ? Math.min(100, Math.round(r.a.used / r.a.entitled * 100)) : 0) + '%' } }))) }, { key: 'casual', label: 'العارضة', sort: true, value: (r) => r.c.remaining, render: (r) => h('span.num', {}, r.c.remaining + ' / ' + r.c.entitled) }, { key: 'comp', label: 'يوم بدل', render: (r) => h('span.num', {}, r.k.remaining || '—') }, { key: 'svc', label: 'الخدمة', render: (r) => h('span.num', {}, Math.round(serviceYears(r.e) * 10) / 10 + ' سنة') }],
      onRowClick: (r) => openBalances(r.e.id), rowActions: (r) => [{ label: 'الأرصدة والدفتر', icon: 'list', onClick: () => openBalances(r.e.id) }, { label: 'تعديل رصيد…', icon: 'edit', disabled: SA.can('hr.leave.approve') && SA.can('hr.compliance.edit') ? false : NOPERM, onClick: () => adjustFlow(r.e) }], empty: { icon: 'users', title: 'لا موظفين ضمن نطاقك' } })));
    body.append(h('p.sap-hrt-note', {}, 'الرصيد السالب وسقف الترحيل: Open. أساس الأجر اليومي (÷ 30 أم أيام العمل) يخص صرف الرصيد (بند 44 — Pending). تسوية الرصيد/الصرف كل {3 سنوات}: اقرأ ', specLink('hr-time', 'lve-09', 'معالج التسوية ↗')));
  }

  /* — أنواع الإجازات — */
  function typeEditor(t) {
    if (!SA.can('hr.compliance.edit')) { SA.toast(NOPERM + ' (hr.compliance.edit)', 'warn'); return; }
    const ac = t.accrual || {}; const f = {
      paid: SA.form.field({ name: 'paid', label: 'مدفوعة', type: 'switch', value: t.paid }), ded: SA.form.field({ name: 'ded', label: 'تُخصم من السنوية', type: 'switch', value: t.deductFromAnnual }), act: SA.form.field({ name: 'act', label: 'النوع نشط', type: 'switch', value: t.active, hint: 'إيقاف فقط — لا حذف لنوع مستخدم' }),
      chain: SA.form.field({ name: 'chain', label: 'سلسلة الاعتماد', type: 'select', value: (t.chain || []).join('+'), options: [['supervisor+hr', 'المشرف ← HR (تصعيد تلقائي)'], ['hr', 'HR يسجّل (المشرف يُبلَّغ)']] }), elig: SA.form.field({ name: 'elig', label: 'الأهلية', value: t.eligibility, dir: 'rtl' }), legal: SA.form.field({ name: 'legal', label: 'المرجع القانوني', value: t.legal }), note: SA.form.field({ name: 'note', label: 'ملاحظة', type: 'textarea', rows: 2, value: t.note }),
      docs: SA.form.field({ name: 'docs', label: 'المستندات المطلوبة', type: 'multi', value: t.docs || [], options: [['medical_certificate', 'شهادة طبية'], ['exam_proof', 'إثبات الامتحان']] }), eff: dateInput('eff', 'تاريخ السريان (لا أثر رجعي)', D.today())
    };
    const nums = {}; if (t.id === 'annual') ['y1', 'y2', 'y10', 'yearsFor30', 'minProRataMonths', 'hazardousExtra'].forEach((k) => { nums[k] = SA.form.field({ name: k, label: { y1: 'السنة الأولى (يوم)', y2: 'من الثانية (يوم)', y10: 'بعد سنوات الخدمة (يوم)', yearsFor30: 'سنوات الخدمة للشريحة 30', minProRataMonths: 'أدنى أشهر للتناسب', hazardousExtra: '+ أيام للأعمال الخطرة' }[k], type: 'number', value: ac.tiers[k], min: 0, max: 90 }); });
    if (t.id === 'casual') ['perYear', 'maxConsecutive'].forEach((k) => { nums[k] = SA.form.field({ name: k, label: { perYear: 'أيام العارضة سنويًا', maxConsecutive: 'أقصى أيام متتالية' }[k], type: 'number', value: ac[k], min: 0, max: 30 }); });
    const grp = SA.form.group(Object.values(f).concat(Object.values(nums)));
    simpleModal({ title: 'نوع الإجازة: ' + t.name, subtitle: 'إصدار ' + t.version + ' ← ' + (t.version + 1) + ' · الطلبات القديمة تبقى على إصدارها', icon: 'clipboard', size: 'lg', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, SA.alert('info', t.legal + ' — الحالة: ', SA.tag('pending')), t.id === 'sick' ? SA.alert('warning', 'المخطط (A/B) قرار D1 مفتوح — اضبطه من تبويب «المرضي (D1)».') : null, Object.keys(nums).length ? h('div.sap-formgrid', {}, Object.values(nums).map((x) => x.el)) : null, h('div.sap-formgrid', {}, f.chain.el, f.elig.el, f.legal.el, f.eff.el), f.docs.el, f.paid.el, f.ded.el, f.act.el, f.note.el), async onOk() {
      if (!grp.validate()) return false; const v = grp.get(); if (!validDate(v.eff) || v.eff < D.today()) { f.eff.error('لا تعديل بأثر رجعي — اليوم أو لاحقًا'); return false; }
      const before = { paid: t.paid, deductFromAnnual: t.deductFromAnnual, chain: (t.chain || []).join('+'), docs: (t.docs || []).join(','), eligibility: t.eligibility, active: t.active, accrual: JSON.stringify(t.accrual) };
      const next = SA.clone(t); next.paid = !!v.paid; next.deductFromAnnual = !!v.ded; next.active = !!v.act; next.chain = v.chain.split('+'); next.docs = v.docs; next.eligibility = v.elig; next.legal = v.legal; next.note = v.note; next.effectiveFrom = v.eff; next.version = t.version + 1;
      Object.keys(nums).forEach((k) => { if (t.id === 'annual') next.accrual.tiers[k] = +v[k]; else next.accrual[k] = +v[k]; });
      const after = { paid: next.paid, deductFromAnnual: next.deductFromAnnual, chain: next.chain.join('+'), docs: next.docs.join(','), eligibility: next.eligibility, active: next.active, accrual: JSON.stringify(next.accrual) };
      if (!(await SA.stepUp('policy.change'))) return false;
      try { await SA.api(() => { tupd((x) => { x.leaveTypes[x.leaveTypes.findIndex((q) => q.id === t.id)] = next; }); SA.audit('HR.LEAVE.TYPE_UPDATED', { target: { type: 'leave_type', id: t.id, label: t.name }, before, after }); }); } catch (e) { SA.fail(e); return false; } SA.toast('تم حفظ إصدار جديد من النوع (Pending)', 'success');
    } });
  }
  const accrualText = (t) => { const a = t.accrual || {}; if (a.kind === 'tiers') return a.tiers.y1 + ' / ' + a.tiers.y2 + ' / ' + a.tiers.y10 + ' يوم (45 لذوي الإعاقة)'; if (a.kind === 'fixed') return a.perYear + ' أيام سنويًا · ≤ ' + a.maxConsecutive + ' متتالية'; if (a.kind === 'scheme') return 'حسب المخطط A/B — D1 مفتوح'; if (a.kind === 'per_event') return a.days ? a.days + ' يومًا للحدث' + (a.maxTimes ? ' · ≤ ' + a.maxTimes + ' مرات' : '') : a.maxMonths ? '≤ ' + a.maxMonths + ' شهرًا · ≤ ' + a.maxTimes + ' مرات' : 'لكل حدث'; return '—'; };
  function leaveTypesTab(body) {
    body.append(SA.alert('info', 'الكتالوج مُهيّأ من بذور البحث (م 124–132) وكل قيمة فيه ', SA.tag('pending'), ' بتاريخ سريان وإصدارات. المخطط المرضي: ', SA.tag('open', 'D1'), ' — لا تُثبَّت قيم في الكود.'));
    body.append(SA.card({ flush: true, title: 'كتالوج أنواع الإجازات' }, tbl({ rowId: 'id', pageSize: 10, caption: 'أنواع الإجازات', rows: () => T('leaveTypes') || [], search: { placeholder: 'ابحث…', keys: ['name', 'code'] },
      columns: [{ key: 'name', label: 'النوع', sort: true, render: (t) => h('div', {}, h('b', {}, t.name), h('small', { style: { display: 'block', color: 'var(--color-text-muted)' } }, t.legal)) }, { key: 'acc', label: 'الاستحقاق', render: (t) => (t.id === 'sick' ? h('span', {}, accrualText(t), ' ', SA.tag('open', 'D1')) : accrualText(t)) }, { key: 'paid', label: 'الأجر', render: (t) => (t.paid ? 'مدفوعة' + (t.payScheme === 'scheme' ? ' (حسب المخطط)' : '') : 'بدون أجر') }, { key: 'ded', label: 'تُخصم من السنوية', render: (t) => (t.deductFromAnnual ? 'نعم' : '—') }, { key: 'docs', label: 'المستندات', render: (t) => (t.docs || []).map((d) => DOC_LABEL[d]).join('، ') || '—' }, { key: 'chain', label: 'الاعتماد', render: (t) => ((t.chain || []).indexOf('supervisor') >= 0 ? 'المشرف ← HR' : 'HR (المشرف يُبلَّغ)') }, { key: 'status', label: 'الحالة', render: (t) => h('span', {}, t.active ? SA.chip('نشط', 'success') : SA.chip('موقوف', 'neutral'), ' ', SA.tag('pending')) }, { key: 'v', label: 'إصدار', render: (t) => h('span.num', {}, 'v' + t.version + ' · ' + D.short(t.effectiveFrom)) }],
      rowActions: (t) => [{ label: 'تعديل (إصدار جديد)', icon: 'edit', disabled: SA.can('hr.compliance.edit') ? false : NOPERM, onClick: () => typeEditor(t) }], onRowClick: (t) => typeEditor(t) })));
    body.append(h('div', {}, specLink('hr-time', 'lve-01', 'كتالوج الأنواع في التصميم ↗')));
  }

  /* — العطلات الرسمية — */
  function holidayEditor(hd) {
    if (!SA.can('hr.compliance.edit')) { SA.toast(NOPERM + ' (hr.compliance.edit)', 'warn'); return; }
    const isNew = !hd; const o = hd || { date: '', name: '', confirmed: false, moved: false, circular: '' };
    const f = { d: dateInput('d', 'التاريخ', o.date), n: SA.form.field({ name: 'n', label: 'المناسبة', required: true, value: o.name }), c: SA.form.field({ name: 'c', label: 'مؤكدة (بعد الكتاب الدوري)', type: 'switch', value: o.confirmed, hint: 'العطلة غير المؤكدة لا يُحسب خصم على يومها' }), m: SA.form.field({ name: 'm', label: 'منقولة', type: 'switch', value: o.moved }), k: SA.form.field({ name: 'k', label: 'رقم الكتاب الدوري', value: o.circular }) };
    simpleModal({ title: isNew ? 'عطلة رسمية جديدة' : 'تعديل عطلة', subtitle: 'قرار 294/2025 — Pending · N-48 للتأكيد بعد الإعلان', icon: 'clock', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('div.sap-formgrid', {}, f.d.el, f.n.el, f.k.el), f.c.el, f.m.el), async onOk() {
      if (!SA.form.group(Object.values(f)).validate()) return false; const v = { d: f.d.get(), n: f.n.get().trim() }; if (!validDate(v.d)) { f.d.error('تاريخ غير صحيح'); return false; } if (isNew && holidays().some((x) => x.date === v.d)) { f.d.error('تاريخ مسجّل مسبقًا'); return false; }
      try { await SA.api(() => { tupd((t) => { const rec = { id: 'HD-' + v.d, date: v.d, name: v.n, confirmed: f.c.get(), moved: f.m.get(), circular: f.k.get() }; if (isNew) t.holidays.push(rec); else Object.assign(t.holidays.find((x) => x.id === o.id), rec, { id: o.id }); t.holidays.sort((a, b) => (a.date < b.date ? -1 : 1)); }); SA.audit('HR.HOLIDAY.CALENDAR_UPDATED', { target: { type: 'holiday', id: v.d, label: v.n }, before: isNew ? null : { confirmed: o.confirmed, name: o.name }, after: { confirmed: f.c.get(), name: v.n } }); }); } catch (e) { SA.fail(e); return false; } SA.toast('تم حفظ العطلة', 'success');
    } });
  }
  function leaveHolidaysTab(body, api) {
    const yr = api.hyr || new Date().getFullYear(); api.hyr = yr; const list = holidays().filter((x) => x.date.slice(0, 4) === String(yr)); const unconf = list.filter((x) => !x.confirmed).length;
    if (unconf) body.append(SA.alert('warning', h('b', {}, 'N-48: '), unconf + ' عطلة غير مؤكدة بعد الإعلان — لا يُحسب خصم على أيامها حتى التأكيد.'));
    body.append(SA.card({ flush: true, title: 'تقويم العطلات الرسمية ' + yr, tags: SA.tag('pending', 'قرار 294/2025'), actions: [SA.btn({ label: 'عطلة جديدة', icon: 'plus', kind: 'primary', size: 'sm', perm: 'hr.compliance.edit', onClick: () => holidayEditor(null) })] }, tbl({ rowId: 'id', pageSize: 12, caption: 'العطلات', rows: () => holidays().filter((x) => x.date.slice(0, 4) === String(yr)), initial: { sort: { key: 'date', dir: 'asc' } },
      columns: [{ key: 'date', label: 'التاريخ', sort: true, render: (x) => h('span', {}, D.fmt(x.date), ' ', h('small', { style: { color: 'var(--color-text-muted)' } }, D.dayName(x.date))) }, { key: 'name', label: 'المناسبة', sort: true, render: (x) => h('b', {}, x.name) }, { key: 'c', label: 'التأكيد', render: (x) => SA.chip(x.confirmed ? 'مؤكدة' : 'غير مؤكدة', x.confirmed ? 'success' : 'warning') }, { key: 'm', label: 'منقولة', render: (x) => (x.moved ? SA.chip('منقولة', 'info') : '—') }, { key: 'k', label: 'الكتاب الدوري', render: (x) => x.circular || '—' }],
      rowActions: (x) => [{ label: 'تعديل', icon: 'edit', disabled: SA.can('hr.compliance.edit') ? false : NOPERM, onClick: () => holidayEditor(x) }, { label: x.confirmed ? 'إلغاء التأكيد' : 'تأكيد العطلة', icon: 'checkcircle', disabled: SA.can('hr.compliance.edit') ? false : NOPERM, onClick: async () => { try { await SA.api(() => { tupd((t) => { const q = t.holidays.find((k) => k.id === x.id); q.confirmed = !q.confirmed; }); SA.audit('HR.HOLIDAY.CALENDAR_UPDATED', { target: { type: 'holiday', id: x.date, label: x.name }, before: { confirmed: x.confirmed }, after: { confirmed: !x.confirmed } }); }); SA.toast('تم تحديث التأكيد', 'success'); } catch (e) { SA.fail(e); } } }], onRowClick: (x) => holidayEditor(x) })));
    body.append(h('p.sap-hrt-note', {}, 'العمل في عطلة رسمية: أجر اليوم + «مثلي» أو يوم بدل بطلب كتابي — تفسير «مثلي» Open (انظر الأوفرتايم). الأسماء والتواريخ هنا تجريبية.'));
  }

  /* — المرضي (D1) — */
  const LADDER_A = [['أول 90 يومًا', '75% من الأجر التأميني اليومي', 'التأمينات'], ['بعد 90 يومًا', '85%', 'التأمينات'], ['الحد الأقصى', '180 يومًا/سنة', '—'], ['المزمن', 'أجر كامل حتى الشفاء', 'حسب النظام']];
  const LADDER_B = [['3 أشهر', '100% (أجر كامل)', 'صاحب العمل'], ['6 أشهر', '85%', 'التأمينات + الفرق على صاحب العمل'], ['3 أشهر', '75%', 'التأمينات + الفرق على صاحب العمل'], ['الأساس', 'لكل 3 سنوات خدمة (قانون 15/2017 للمنشآت الصناعية)', '—']];
  async function chooseScheme(k) {
    if (!isHrMgr()) { SA.toast(NOPERM + ' (HR Manager)', 'warn'); return; }
    const res = await SA.confirm({ title: 'اعتماد مخطط المرضي ' + k, reasonRequired: true, confirmLabel: 'اعتماد المخطط', text: 'قرار D1: هل المصنع «منشأة صناعية» بقانون 15/2017؟ يُطبَّق المخطط المعتمد فقط بتاريخ سريان اليوم.', warnings: ['قرار قانوني — يُؤكَّد مع المحاسب القانوني قبل التطبيق على المرتبات.'] });
    if (!res.ok) return; if (!(await SA.stepUp('policy.change', { force: true }))) return;
    try { await SA.api(() => { const before = SET().sickScheme; tupd((t) => { t.settings.sickScheme = k; t.settings.effectiveFrom = D.today(); }); SA.audit('HR.LEAVE.TYPE_UPDATED', { target: { type: 'leave_type', id: 'sick', label: 'مخطط المرضي (D1)' }, reason: res.reason, before: { scheme: before || 'غير محسوم' }, after: { scheme: k } }); }); SA.toast('تم اعتماد المخطط ' + k + ' (Pending)', 'success'); } catch (e) { SA.fail(e); }
  }
  function sickRecordFlow() {
    if (!SA.can('hr.leave.approve') || !SA.can('hr.compliance.edit')) { SA.toast(NOPERM + ' — تسجيل المرضي لـHR', 'warn'); return; }
    const f = { e: SA.form.field({ name: 'e', label: 'الموظف', type: 'select', required: true, options: [['', 'اختر…']].concat(visibleEmps().map((x) => [x.id, x.name])) }), from: dateInput('from', 'من', D.today(), { dir: 'ltr' }), to: dateInput('to', 'إلى', D.add(D.today(), 2), { dir: 'ltr' }), att: SA.form.field({ name: 'att', label: 'رقم/اسم الشهادة الطبية (T4)', required: true, dir: 'ltr' }) };
    simpleModal({ title: 'تسجيل إجازة مرضية مثبتة', subtitle: 'HR يسجّل — المشرف يُبلَّغ بدون تشخيص', icon: 'shield', body: h('div.sap-formgrid', {}, f.e.el, f.from.el, f.to.el, f.att.el), async onOk() {
      if (!SA.form.group(Object.values(f)).validate()) return false; const e = emp(f.e.get()); if (isSelfOrRelative(e.id) && SA.session.personaId !== 'owner') { f.e.error('لا تسجّل لنفسك أو قريبك'); return false; }
      const r = requestLeave({ employeeId: e.id, type: 'sick', from: f.from.get(), to: f.to.get(), att: f.att.get(), reason: '' }); if (!r.ok) { SA.toast(r.errors[0], 'error'); return false; }
      /* HR registers → decided immediately by the recorder (chain is HR only) */
      const ap = apOf(r.lv.approvalId); try { await SA.api(() => { st.update('approvals', (l) => { const x = l.find((q) => q.id === ap.id); const c = x.chain[0]; c.status = 'approved'; c.decidedBy = SA.session.userId; c.decidedAt = nowIso(); c.reason = 'تسجيل HR لإجازة مرضية مثبتة'; x.status = 'approved'; x.updatedAt = nowIso(); }); }); reconcile(); } catch (x) { SA.fail(x); return false; } SA.toast('سُجّلت الإجازة المرضية — حماية من الفصل فعّالة', 'success');
    } });
  }
  function leaveSickTab(body) {
    const sc = SET().sickScheme; const canMed = SA.canSensitive('hr.medical.view');
    body.append(sc ? SA.alert('success', 'المخطط المعتمد: ', h('b', {}, sc), ' (Pending — بتاريخ سريان ' + D.fmt(SET().effectiveFrom) + ').') : SA.alert('warning', h('b', {}, 'قرار D1 مفتوح: '), 'هل المصنع «منشأة صناعية» بقانون 15/2017؟ لحين الحسم تُعرض الشاشة المخططين دون اختيار، ولا تُحسب نسب الأجر المرضي.'));
    const ladder = (title, key, rows, desc) => SA.card({ title, tags: [SA.tag('pending', 'م 131'), sc === key ? SA.chip('مُطبَّق', 'success') : null], actions: [SA.btn({ label: sc === key ? 'المخطط الحالي' : 'اعتماد هذا المخطط', icon: 'check', kind: sc === key ? 'ghost' : 'primary', size: 'sm', reason: sc === key ? 'مُطبَّق بالفعل' : isHrMgr() ? '' : NOPERM + ' (HR Manager)', onClick: () => chooseScheme(key) })] }, h('p.sap-hrt-note', {}, desc), h('table.sap-hrt-ladder', {}, h('thead', {}, h('tr', {}, h('th', {}, 'المدة'), h('th', {}, 'نسبة الأجر'), h('th', {}, 'جهة الدفع'))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c)))))));
    body.append(h('div.sap-hrt-two', {}, ladder('المخطط A — التأمينات', 'A', LADDER_A, 'قانون 148/2019 م 76: نسبة من الأجر التأميني اليومي.'), ladder('المخطط B — منشأة صناعية (15/2017)', 'B', LADDER_B, 'لكل 3 سنوات خدمة؛ ويدفع صاحب العمل الفرق بعد خصم ما تدفعه التأمينات.')));
    body.append(SA.alert('info', 'مخطط ثالث ظهر في قالب أودو (30 يومًا كاملة + 60 يومًا 75%) ليس القانون المصري المقروء — لا يُعتمد.'));
    const sick = lvAll().filter((l) => l.type === 'sick' && l.status === 'approved' && visibleEmps().some((e) => e.id === l.employeeId));
    body.append(SA.card({ flush: true, title: 'الإجازات المرضية المثبتة وحماية الفصل', tags: [SA.tag('new', 'T4')], actions: [SA.btn({ label: 'تسجيل مرضي مثبت', icon: 'plus', kind: 'primary', size: 'sm', reason: SA.can('hr.leave.approve') && SA.can('hr.compliance.edit') ? '' : NOPERM + ' (HR)', onClick: sickRecordFlow })] },
      sick.length ? h('div.table-wrap', {}, h('table.table.sap-mini', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الموظف'), h('th', {}, 'الفترة'), h('th', {}, 'الشهادة'), h('th', {}, 'حماية من الفصل حتى'))), h('tbody', {}, sick.map((l) => h('tr', {}, h('td', {}, empName(l.employeeId)), h('td', {}, D.fmt(l.from) + ' → ' + D.fmt(l.to)), h('td', {}, canMed ? l.attachment || '—' : SA.tag('pending', 'محجوبة — hr.medical.view')), h('td', {}, SA.chip(D.fmt(l.to), 'info'))))))) : SA.empty({ icon: 'shield', title: 'لا إجازات مرضية مثبتة', text: 'تسجيل مرضي مثبت يفعّل علامة الحماية من الفصل (م 148) التي يقرؤها مسار الإنهاء.' }), h('p.sap-hrt-note', { style: { marginTop: '8px' } }, 'الواجهة ', h('code', {}, 'SA.hrTime.hasProtectedLeave(empId, date)'), ' يقرؤها HR-23 لرفض الإنهاء التأديبي أثناء مرضي مثبت أو أمومة.')));
  }

  function renderLeave(root, ctx) {
    if (!ready()) return; runEscalation();
    ctx.setCrumbs([{ label: 'الوقت' }, { label: 'الإجازات' }]);
    return bootScreen(root, (host) => tabbed(host, ctx, {
      route: 'hr/leave', title: 'الإجازات', desc: 'كتالوج أنواع قابل للتكوين، طلب بفحص الرصيد، اعتماد المشرف ← HR مع تصعيد تلقائي، وتقويم فريق بتحذيرات التغطية.', tags: [SA.tag('pending', 'HR-11')],
      tabs: [{ id: 'requests', label: 'الطلبات', icon: 'clipboard', badge: () => { const n = lvAll().filter((l) => l.status === 'pending').length; return n || null; } }, { id: 'calendar', label: 'تقويم الفريق', icon: 'grid' }, { id: 'balances', label: 'الأرصدة والدفتر', icon: 'list' }, { id: 'types', label: 'الأنواع', icon: 'layers' }, { id: 'holidays', label: 'العطلات الرسمية', icon: 'clock' }, { id: 'sick', label: 'المرضي (D1)', icon: 'shield' }],
      actions: (tab) => (tab === 'requests' || tab === 'calendar' ? [SA.btn({ label: 'طلب إجازة', icon: 'plus', kind: 'primary', perm: 'hr.leave.create', onClick: () => leaveRequestFlow() })] : []),
      render: { requests: leaveRequestsTab, calendar: leaveCalendarTab, balances: leaveBalancesTab, types: leaveTypesTab, holidays: leaveHolidaysTab, sick: leaveSickTab }, paths: ['hrTime', 'leaveRequests', 'leaveBalances', 'approvals', 'employees']
    }));
  }

  /* ═════════════════════════════════ HR-12 · الأوفرتايم والبدلات ═════════════════════════════════ */
  const otAll = () => T('otRequests') || [];
  const otReasonName = (c) => ((T('otReasons') || []).find((r) => r[0] === c) || [])[1] || c;
  const OTS = () => (SET().ot || {});
  const canSalary = () => SA.canSensitive('hr.salary.view');
  const hourlyOf = (e) => { const b = OTS().rateBasis; if (!b || !e || !e.salary) return null; const base = b === 'full' ? e.salary.basic + e.salary.allowances : e.salary.basic; return base / 30 / 8; };
  /** amount (EGP) for `min` minutes of day type `dt`; null = not computable (Open settings) */
  function otAmount(e, min, dt) {
    const o = OTS(); const hr = hourlyOf(e); if (hr == null) return null;
    if (dt === 'weekly_rest') return Math.round(hr * 8 * 100) / 100; /* أجر يومه كتعويض (+ يوم بدل) — علاوة الأوفرتايم فوقه Open */
    const m = dt === 'night' ? o.multNight : dt === 'holiday' ? o.multHoliday : o.multNormal; if (m == null) return null;
    return Math.round(hr * (min / 60) * m * 100) / 100;
  }
  let costViewLogged = false;
  function logCostView() { if (costViewLogged || !canSalary()) return; costViewLogged = true; SA.audit('HR.OT.COST_VIEWED', { target: { type: 'screen', id: 'hr-overtime', label: 'مبالغ وتكلفة الأوفرتايم' } }); }
  function amountCell(v) { if (!canSalary()) return h('span.t-muted', { title: 'مش مسموح لك تشوف المبالغ (hr.salary.view — T3)' }, SA.icon('lock', 'icon-sm'), ' محجوب'); logCostView(); return v == null ? SA.openValue('غير مُعدّ') : h('span.num', {}, SA.fmt.money(v)); }
  function dayTypeFor(e, date, from) {
    if (holidayOn(date)) return 'holiday'; const rc = rosterCell(e.id, date); if (rc ? rc.code === 'R' : D.dow(date) === restDayOf(e)) return 'weekly_rest';
    const sh = shiftByCode(rc && rc.code !== 'R' ? rc.code : shiftCodeOf(e)); return sh && sh.night ? 'night' : 'normal';
  }
  function otMonthMin(empId, ym, ignoreId) { return otAll().filter((o) => o.id !== ignoreId && o.date.slice(0, 7) === ym && o.status !== 'rejected' && o.status !== 'cancelled' && o.employeeIds.indexOf(empId) >= 0).reduce((a, o) => a + ((o.verified && o.verified[empId]) || o.minutes), 0); }
  function otChecks(o) { /* o:{employeeIds,date,from,to,mode,id?} → {errors,warns,infos,presence:{empId:min}} */
    const errors = [], warns = [], infos = [], presence = {}; const S = SET(); const OP = OTS(); const mins = spanMin(o.from, o.to); const today = D.today();
    if (!validDate(o.date)) { errors.push('اكتب التاريخ بصيغة YYYY-MM-DD.'); return { errors, warns, infos, presence, mins }; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(o.from || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.to || '')) { errors.push('اكتب وقتي البداية والنهاية بصيغة HH:MM.'); return { errors, warns, infos, presence, mins }; }
    if (o.date > today) infos.push('إذن مسبق (قبل الوردية).');
    if (o.date <= today && o.mode === 'retro') { const hoursSince = (Date.now() - D.parse(D.add(o.date, 1)).getTime()) / 3600000; if (OP.retroHours != null && hoursSince > OP.retroHours) { if (SA.can('hr.overtime.approve') && SA.session.user.roleId !== 'R-14') warns.push('فات أكثر من {' + OP.retroHours + ' ساعة} — يُسجَّل كاستثناء HR Manager بسبب.'); else errors.push('فات أكثر من ' + OP.retroHours + ' ساعة. محتاج موافقة مدير الموارد البشرية.'); } }
    (o.employeeIds || []).forEach((id) => {
      const e = emp(id); if (!e) return; const dt = dayTypeFor(e, o.date, o.from); const rc = rosterCell(id, o.date); const sh = shiftByCode(rc && rc.code !== 'R' ? rc.code : shiftCodeOf(e)); let pres = mins;
      if (dt !== 'weekly_rest' && dt !== 'holiday' && sh) { const s0 = tmin(sh.start), e0 = shiftEndAbs(sh); let a = tmin(o.from), b = a + mins; if (a < s0 - 600) { a += 1440; b += 1440; } pres = Math.max(e0, b) - Math.min(s0, a); }
      presence[id] = pres;
      if (restFlag(e).restrictedOT) errors.push('مينفعش نكلّف الموظفة دي بأوفرتايم.');
      if (leaveOn(id, o.date)) errors.push(e.name + ' في إجازة معتمدة يوم ' + D.fmt(o.date) + '.');
      if (OP && S.maxPresenceHours != null && pres > S.maxPresenceHours * 60) errors.push('الطلب ده يخلّي ' + e.name + ' يقعد في المصنع ' + hrs(pres) + ' ساعة، والحد ' + S.maxPresenceHours + ' ساعة.');
      const used = otMonthMin(id, o.date.slice(0, 7), o.id); const capM = OP.capMonth; if (capM != null) { if (used + mins > capM * 60) warns.push(e.name + ': تجاوز السقف الشهري (' + hrs(used + mins) + ' من ' + capM + ' ساعة) — يلزم تجاوز بسبب.'); else if ((used + mins) / (capM * 60) * 100 >= (OP.warnPct || 90)) warns.push('وصل {' + (OP.warnPct || 90) + '%} من سقف ' + e.name + ' الشهري.'); }
      if (otAll().some((x) => x.id !== o.id && x.status !== 'rejected' && x.status !== 'cancelled' && x.date === o.date && x.employeeIds.indexOf(id) >= 0)) warns.push(e.name + ' عليه طلب أوفرتايم آخر في نفس اليوم.');
      if (dt === 'weekly_rest') infos.push(e.name + ': عمل في الراحة الأسبوعية — أجر يومه كتعويض + يوم راحة بدل خلال الأسبوع التالي (م 121 · Pending).'); if (dt === 'holiday') infos.push(e.name + ': عمل في عطلة رسمية — أجر اليوم + «مثلي» أو يوم بدل بطلب كتابي (م 129 — تفسير «مثلي» Open).');
    });
    if (OP.capMonth == null) infos.push('سقوف الأوفرتايم (يومي/أسبوعي/شهري/ميزانية القسم) غير مُعدّة — Open (D7). لا حجب بسقف قبل الضبط.');
    return { errors: Array.from(new Set(errors)), warns, infos, presence, mins };
  }
  function nextOtId() { const n = otAll().reduce((m, o) => { const x = /^OT-\d+-(\d+)$/.exec(o.id); return x ? Math.max(m, +x[1]) : m; }, 0); return 'OT-2026-' + String(n + 1).padStart(4, '0'); }
  function otRequestFlow(pre) {
    pre = pre || {}; if (!SA.can('hr.overtime.create')) { SA.toast(NOPERM + ' (hr.overtime.create)', 'warn'); return; }
    const vis = visibleEmps().filter((e) => e.employmentType !== 'daily' || true);
    const f = { e: SA.form.field({ name: 'e', label: 'العاملون', type: 'multi', required: true, options: vis.map((x) => [x.id, x.name + ' — ' + deptName(x.departmentId)]), value: pre.ids || [] }), d: dateInput('d', 'التاريخ (YYYY-MM-DD)', pre.date || D.add(D.today(), 1), { dir: 'ltr' }), from: SA.form.field({ name: 'from', label: 'من', value: pre.from || '15:00', dir: 'ltr', placeholder: 'HH:MM' }), to: SA.form.field({ name: 'to', label: 'إلى', value: pre.to || '17:00', dir: 'ltr', placeholder: 'HH:MM' }), why: SA.form.field({ name: 'why', label: 'كود السبب (حاجة عمل غير عادية — م 121)', type: 'select', required: true, options: [['', 'اختر…']].concat(T('otReasons') || []) }), note: SA.form.field({ name: 'note', label: 'ملاحظة', type: 'textarea', rows: 2 }), retro: SA.form.field({ name: 'retro', label: 'سبب الأثر الرجعي (إلزامي لو التاريخ فات)', type: 'textarea', rows: 2 }) };
    const out = h('div'); const retroWrap = f.retro.el;
    const params = () => { const date = f.d.get(); return { employeeIds: f.e.get(), date, from: f.from.get(), to: f.to.get(), mode: validDate(date) && date <= D.today() ? 'retro' : 'pre' }; };
    const calc = () => { SA.clear(out); const p = params(); retroWrap.style.display = p.mode === 'retro' ? '' : 'none'; if (!p.employeeIds.length) { out.append(h('p.sap-hrt-note', {}, 'اختر العاملين لتظهر الفحوصات (التواجد ≤ 12 ساعة، القيود، السقوف).')); return; } const c = otChecks(p);
      out.append(h('div.sap-hrt-checks', {}, c.errors.map((x) => h('div.sap-hrt-check.is-bad', { role: 'alert' }, SA.icon('xcircle', 'icon-sm'), h('div', {}, x))), c.warns.map((x) => h('div.sap-hrt-check.is-warn', {}, SA.icon('alert', 'icon-sm'), h('div', {}, x))), c.infos.map((x) => h('div.sap-hrt-check.is-ok', {}, SA.icon('info', 'icon-sm'), h('div', {}, x))), !c.errors.length ? h('div.sap-hrt-check.is-ok', {}, SA.icon('checkcircle', 'icon-sm'), h('div', {}, 'المدة ', h('b.num', {}, hrs(c.mins)), ' ساعة لكل عامل · التواجد المتوقع ', Object.keys(c.presence).map((k) => empName(k).split(' ')[0] + ' ' + hrs(c.presence[k]) + ' س').join('، '))) : null)); };
    ['d', 'from', 'to'].forEach((k) => f[k].input.addEventListener('input', calc)); f.e.el.addEventListener('change', calc); calc();
    simpleModal({ title: 'طلب أوفرتايم', subtitle: 'مسبق قبل الوردية، أو بأثر رجعي خلال {' + (OTS().retroHours == null ? '—' : OTS().retroHours) + ' ساعة} بسبب', icon: 'bolt', size: 'lg', okLabel: 'إرسال للاعتماد', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, f.e.el, h('div.sap-formgrid', {}, f.d.el, f.from.el, f.to.el, f.why.el), f.note.el, retroWrap, out, h('p.sap-hrt-note', {}, 'سلسلة الاعتماد: المشرف (طلب) ← مدير الإنتاج ', SA.chip('غير مفعّل: R-05 بلا مفتاح hr.overtime.approve', 'neutral'), ' ← HR (السقف والامتثال) ← المالية ', SA.chip('فوق الميزانية — الميزانية غير مُعدّة', 'neutral'))), async onOk() {
      if (!SA.form.group([f.e, f.d, f.from, f.to, f.why]).validate()) return false; const p = params(); const c = otChecks(p); if (c.errors.length) { SA.toast(c.errors[0], 'error', { ms: 6500 }); return false; }
      if (p.mode === 'retro' && (f.retro.get() || '').trim().length < 3) { f.retro.error('اكتب سبب الأثر الرجعي'); return false; }
      const id = nextOtId(); const mins = c.mins; const dts = p.employeeIds.map((x) => dayTypeFor(emp(x), p.date, p.from)); const dt = dts.indexOf('holiday') >= 0 ? 'holiday' : dts.indexOf('weekly_rest') >= 0 ? 'weekly_rest' : dts.indexOf('night') >= 0 ? 'night' : 'normal';
      try { await SA.api(() => {
        const rec = { id, employeeIds: p.employeeIds, date: p.date, from: p.from, to: p.to, minutes: mins, dayType: dt, reason: f.why.get(), note: f.note.get() || '', mode: p.mode, retroReason: p.mode === 'retro' ? f.retro.get() : '', status: 'requested', requestedBy: SA.session.userId, createdAt: nowIso(), approvalId: null, verified: {}, payrollPeriod: null, presence: c.presence };
        tupd((t) => { t.otRequests.push(rec); t.seq.ot++; });
        const ap = SA.requestApproval({ type: 'overtime', title: 'أوفرتايم ' + id + ' — ' + p.employeeIds.length + ' موظف · ' + hrs(mins) + ' ساعة' + (p.mode === 'retro' ? ' (رجعي)' : ''), requesterId: SA.session.userId, chain: [{ roleId: 'R-11', label: 'مدير الموارد البشرية (السقف والامتثال)' }], ref: { type: 'overtime', id }, context: [['العاملون', p.employeeIds.map(empName).join('، ')], ['التاريخ', D.fmt(p.date) + ' · ' + p.from + '–' + p.to], ['نوع اليوم', DAY_TYPE[dt]], ['السبب', otReasonName(f.why.get())], ['الوضع', p.mode === 'retro' ? 'بأثر رجعي: ' + f.retro.get() : 'إذن مسبق'], ['فحوصات', c.warns.length ? c.warns.join(' | ') : 'سليمة']] });
        tupd((t) => { t.otRequests.find((q) => q.id === id).approvalId = ap.id; });
        SA.audit(p.mode === 'retro' ? 'HR.OT.REQUESTED_RETRO' : 'HR.OT.REQUESTED', { target: { type: 'overtime', id, label: p.employeeIds.map(empName).join('، ') }, reason: p.mode === 'retro' ? f.retro.get() : '', after: { date: p.date, hours: hrs(mins) } });
        const over = c.warns.filter((w) => w.indexOf('السقف') >= 0).length; if (over) SA.notify({ title: 'N-22 أوفرتايم قريب/فوق السقف', body: id + ' — ' + c.warns[0], level: 'urgent', to: ['R-11'], link: '#/hr/overtime' });
      }); } catch (x) { SA.fail(x); return false; }
      SA.toast('أُرسل الطلب ' + id + ' للاعتماد', 'success');
    } });
  }
  async function otDecide(o, ok) {
    const ap = apOf(o.approvalId); const first = emp(o.employeeIds[0]); const why = cannotDecide(ap, o.employeeIds.length === 1 ? first : null, 'overtime'); if (why) { SA.toast(why, 'warn', { ms: 6000 }); return; }
    if (!SA.can('hr.overtime.approve')) { SA.toast(NOPERM + ' (hr.overtime.approve)', 'warn'); return; }
    const c = otChecks(Object.assign({}, o, { mode: o.mode })); const capWarn = c.warns.filter((w) => w.indexOf('السقف') >= 0);
    const res = await SA.confirm({ title: (ok ? 'اعتماد' : 'رفض') + ' الأوفرتايم ' + o.id, text: o.employeeIds.map(empName).join('، ') + ' — ' + D.fmt(o.date) + ' · ' + o.from + '–' + o.to + ' (' + hrs(o.minutes) + ' ساعة)', danger: !ok, reasonRequired: !ok || capWarn.length > 0 || o.mode === 'retro', reasonLabel: capWarn.length && ok ? 'سبب تجاوز السقف' : o.mode === 'retro' && ok ? 'سبب اعتماد الأثر الرجعي' : 'السبب', warnings: c.warns.concat(c.errors), confirmLabel: ok ? 'اعتماد' : 'رفض', impact: ok ? ['يصبح الطلب «معتمد» وإذن العمل DOC-HR-18 (بلا مبالغ).', 'بعد التنفيذ والتحقق تُرحَّل الساعات لدورة المرتبات.'] : ['يُبلَّغ المشرف بالرفض وسببه.'] });
    if (!res.ok) return; if (ok && c.errors.length) { SA.toast('لا يمكن الاعتماد: ' + c.errors[0], 'error'); return; }
    await decideApproval(ap, ok ? 'approve' : 'reject', res.reason, o.employeeIds.length === 1 ? first : null, 'overtime');
    if (ok && capWarn.length) SA.audit('HR.OT.CAP_OVERRIDDEN', { target: { type: 'overtime', id: o.id, label: o.employeeIds.map(empName).join('، ') }, reason: res.reason, after: { warn: capWarn[0] } });
    SA.toast(ok ? 'تم اعتماد الأوفرتايم' : 'تم رفض الطلب', 'success');
  }
  function applyOtWorked(o) { tupd((t) => { const x = t.otRequests.find((q) => q.id === o.id); x.status = 'worked'; x.workedAt = nowIso(); }); }
  async function otMarkWorked(o) {
    if (!(SA.can('hr.overtime.create') || SA.can('hr.overtime.approve'))) { SA.toast(NOPERM, 'warn'); return; }
    const res = await SA.confirm({ title: 'تسجيل تنفيذ الأوفرتايم ' + o.id, confirmLabel: 'تم العمل', text: 'تأكيد أن العاملين نفّذوا الأوفرتايم المعتمد — ثم يتحقق HR من الساعات الفعلية من الحضور.' }); if (!res.ok) return;
    try { await SA.api(() => applyOtWorked(o)); SA.toast('سُجّل التنفيذ — بانتظار التحقق', 'success'); } catch (e) { SA.fail(e); }
  }
  function otVerifyFlow(o) {
    if (!SA.can('hr.overtime.approve')) { SA.toast(NOPERM + ' (hr.overtime.approve)', 'warn'); return; }
    const fs = o.employeeIds.map((id) => ({ id, f: SA.form.field({ name: id, label: empName(id) + ' — الدقائق الفعلية (المخطط ' + o.minutes + ')', type: 'number', value: (o.verified && o.verified[id]) || o.minutes, min: 0, max: 960, required: true }), comp: SA.form.field({ name: 'c' + id, label: o.dayType === 'holiday' ? 'يوم بدل (بطلب كتابي من العامل)' : 'يوم بدل للراحة الأسبوعية', type: 'checkbox', value: o.dayType === 'weekly_rest' }) }));
    simpleModal({ title: 'التحقق من ساعات الأوفرتايم ' + o.id, subtitle: 'تُقارَن مع الحضور الفعلي قبل الترحيل للمرتبات', icon: 'checkcircle', size: 'lg', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, fs.map((x) => h('div.sap-formgrid', {}, x.f.el, o.dayType === 'weekly_rest' || o.dayType === 'holiday' ? x.comp.el : null)), h('p.sap-hrt-note', {}, 'الأوفرتايم لا يدخل الحضور اليومي كغياب أو تأخير؛ الدقائق المتحقَّقة هي التي تُرحَّل.')), okLabel: 'تأكيد التحقق', async onOk() {
      if (!SA.form.group(fs.map((x) => x.f)).validate()) return false; const ver = {}; fs.forEach((x) => { ver[x.id] = +x.f.get(); });
      try { await SA.api(() => { tupd((t) => { const q = t.otRequests.find((k) => k.id === o.id); q.status = 'verified'; q.verified = ver; q.verifiedBy = SA.session.userId; q.verifiedAt = nowIso(); });
        SA.audit('HR.OT.WORKED_VERIFIED', { target: { type: 'overtime', id: o.id, label: o.employeeIds.map(empName).join('، ') }, after: { total_minutes: Object.values(ver).reduce((a, b) => a + b, 0) } });
        fs.forEach((x) => { if ((o.dayType === 'weekly_rest' || o.dayType === 'holiday') && x.comp.get()) { adjustBalance(x.id, 'comp', -1); ledgerAdd(x.id, 'comp', 'accrual', 1, o.id, 'يوم بدل عن العمل في ' + DAY_TYPE[o.dayType] + ' — مستحق خلال الأسبوع التالي'); SA.audit('HR.OT.COMP_DAY_GRANTED', { target: { type: 'overtime', id: o.id, label: empName(x.id) }, after: { due_by: D.add(o.date, 14) } }); } }); }); } catch (e) { SA.fail(e); return false; }
      SA.toast('تم التحقق من الساعات', 'success');
    } });
  }
  async function otCancel(o) {
    if (!(SA.can('hr.overtime.create') || SA.can('hr.overtime.approve'))) { SA.toast(NOPERM, 'warn'); return; }
    const res = await SA.confirm({ title: 'إلغاء الطلب ' + o.id, danger: true, reasonRequired: true, confirmLabel: 'إلغاء الطلب' }); if (!res.ok) return;
    try { await SA.api(() => { tupd((t) => { t.otRequests.find((q) => q.id === o.id).status = 'cancelled'; }); const ap = apOf(o.approvalId); if (ap && ap.status === 'pending') st.update('approvals', (l) => { const r = l.find((x) => x.id === ap.id); r.status = 'rejected'; r.chain[r.currentStep - 1].status = 'rejected'; r.chain[r.currentStep - 1].decidedBy = SA.session.userId; r.chain[r.currentStep - 1].decidedAt = nowIso(); r.chain[r.currentStep - 1].reason = 'سُحب الطلب: ' + res.reason; r.updatedAt = nowIso(); }); }); SA.toast('أُلغي الطلب', 'success'); } catch (e) { SA.fail(e); }
  }
  function openOt(id) {
    const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }); const d = SA.drawer({ title: 'أوفرتايم ' + id, subtitle: '', size: 'lg', body });
    const draw = () => {
      SA.clear(body); const o = otAll().find((x) => x.id === id); if (!o) { body.append(SA.empty({ title: 'الطلب غير موجود' })); return; } const ap = apOf(o.approvalId); const c = otChecks(o); const why = o.status === 'requested' ? cannotDecide(ap, o.employeeIds.length === 1 ? emp(o.employeeIds[0]) : null, 'overtime') : 'تم القرار';
      body.append(h('div.sap-hrt-cluster', {}, stChip(OT_ST, o.status), SA.chip(o.mode === 'retro' ? 'بأثر رجعي' : 'إذن مسبق', o.mode === 'retro' ? 'warning' : 'neutral'), SA.chip(DAY_TYPE[o.dayType], 'info'), o.payrollPeriod ? SA.chip('مرحَّل لمرتبات ' + o.payrollPeriod, 'success') : null),
        SA.kv([['العاملون', o.employeeIds.map(empName).join('، ')], ['التاريخ', D.dayName(o.date) + ' ' + D.fmt(o.date)], ['الوقت', o.from + ' – ' + o.to + ' (' + hrs(o.minutes) + ' ساعة لكل عامل)'], ['السبب', otReasonName(o.reason) + (o.note ? ' — ' + o.note : '')], o.mode === 'retro' ? ['سبب الأثر الرجعي', o.retroReason] : null, ['الطالب', SA.userName(o.requestedBy) + ' · ' + SA.fmt.rel(o.createdAt)], o.status === 'verified' || o.status === 'paid' ? ['الساعات المتحقَّقة', o.employeeIds.map((x) => empName(x).split(' ')[0] + ' ' + hrs((o.verified || {})[x] || 0) + ' س').join('، ')] : null]),
        h('div', {}, h('h4.sap-sub', {}, 'سلسلة الاعتماد'), chainView(ap), h('p.sap-hrt-note', {}, 'مدير الإنتاج والمالية خطوتان في المواصفة — غير مفعّلتين هنا: دور مدير الإنتاج بلا مفتاح hr.overtime.approve والميزانية Open.')),
        h('div', {}, h('h4.sap-sub', {}, 'المبالغ (T3)'), h('div.table-wrap', {}, h('table.table.sap-mini', {}, h('thead', {}, h('tr', {}, h('th', {}, 'العامل'), h('th', {}, 'التواجد المتوقع'), h('th', {}, 'المبلغ'))), h('tbody', {}, o.employeeIds.map((x) => h('tr', {}, h('td', {}, empName(x)), h('td', {}, hrs(c.presence[x] || o.minutes) + ' س'), h('td', {}, amountCell(otAmount(emp(x), (o.verified && o.verified[x]) || o.minutes, o.dayType)))))))), !canSalary() ? h('p.sap-hrt-note', {}, 'المبالغ تظهر لحاملي hr.salary.view فقط (بند 46 — GM ليس تلقائيًا).') : null));
      if (o.status === 'requested') body.append(h('div.sap-hrt-checks', {}, c.errors.map((x) => h('div.sap-hrt-check.is-bad', {}, SA.icon('xcircle', 'icon-sm'), h('div', {}, x))), c.warns.map((x) => h('div.sap-hrt-check.is-warn', {}, SA.icon('alert', 'icon-sm'), h('div', {}, x))), c.infos.map((x) => h('div.sap-hrt-check.is-ok', {}, SA.icon('info', 'icon-sm'), h('div', {}, x)))));
      body.append(h('div.sap-hrt-cluster', {}, o.status === 'requested' ? [SA.btn({ label: 'اعتماد', icon: 'checkcircle', kind: 'primary', reason: why || (SA.can('hr.overtime.approve') ? '' : NOPERM + ' (hr.overtime.approve)'), onClick: () => otDecide(o, true) }), SA.btn({ label: 'رفض', icon: 'xcircle', kind: 'danger', reason: why || (SA.can('hr.overtime.approve') ? '' : NOPERM), onClick: () => otDecide(o, false) })] : null, o.status === 'approved' ? SA.btn({ label: 'تسجيل التنفيذ (تم العمل)', icon: 'check', kind: 'primary', onClick: () => otMarkWorked(o) }) : null, o.status === 'worked' ? SA.btn({ label: 'تحقق من الساعات', icon: 'checkcircle', kind: 'primary', reason: SA.can('hr.overtime.approve') ? '' : NOPERM + ' (hr.overtime.approve)', onClick: () => otVerifyFlow(o) }) : null, o.status === 'requested' || o.status === 'approved' ? SA.btn({ label: 'إلغاء الطلب', icon: 'trash', kind: 'ghost', onClick: () => otCancel(o) }) : null));
      if (why && o.status === 'requested') body.append(h('p.sap-hrt-note', {}, 'لماذا الأزرار مقفولة؟ ' + why));
      d.setTitle ? d.setTitle('أوفرتايم ' + id, SA.fmt.dt(o.createdAt)) : null;
    };
    draw(); ['hrTime', 'approvals'].forEach((p) => st.subscribe(p, () => { if (document.body.contains(d.el)) draw(); }));
  }
  function otRequestsTab(body) {
    const vis = new Set(visibleEmps().map((e) => e.id)); const me = SA.session.userId; const list = () => otAll().filter((o) => o.requestedBy === me || o.employeeIds.some((x) => vis.has(x)));
    const mineDec = list().filter((o) => o.status === 'requested' && !cannotDecide(apOf(o.approvalId), o.employeeIds.length === 1 ? emp(o.employeeIds[0]) : null, 'overtime') && SA.can('hr.overtime.approve')); const ym = D.today().slice(0, 7);
    const monthMin = list().filter((o) => o.date.slice(0, 7) === ym && (o.status === 'approved' || o.status === 'worked' || o.status === 'verified' || o.status === 'paid')).reduce((a, o) => a + o.minutes * o.employeeIds.length, 0);
    body.append(kpis([['بانتظار قراري', mineDec.length, { accent: mineDec.length > 0 }], ['طلبات معلّقة', list().filter((o) => o.status === 'requested').length], ['ساعات معتمدة هذا الشهر', hrs(monthMin), { sub: 'مجموع ساعات العاملين' }], ['طلبات رجعية', list().filter((o) => o.mode === 'retro' && o.date.slice(0, 7) === ym).length]]));
    body.append(SA.card({ flush: true, title: 'طلبات الأوفرتايم', tags: [SA.tag('pending', '[Law]')] }, tbl({ rowId: 'id', pageSize: 10, caption: 'طلبات الأوفرتايم', rows: list, initial: { sort: { key: 'createdAt', dir: 'desc' } }, search: { placeholder: 'ابحث…', keys: ['id', (o) => o.employeeIds.map(empName).join(' ')] }, filters: [{ key: 'status', label: 'الحالة', options: Object.keys(OT_ST).map((k) => [k, OT_ST[k][0]]) }, { key: 'dayType', label: 'نوع اليوم', options: Object.keys(DAY_TYPE).map((k) => [k, DAY_TYPE[k]]) }],
      columns: [{ key: 'id', label: 'الرقم', sort: true, render: (o) => h('b.num', {}, o.id) }, { key: 'emps', label: 'العاملون', render: (o) => h('span', {}, o.employeeIds.length === 1 ? empName(o.employeeIds[0]) : empName(o.employeeIds[0]) + ' +' + (o.employeeIds.length - 1)) }, { key: 'date', label: 'اليوم', sort: true, render: (o) => D.short(o.date) + ' · ' + o.from + '–' + o.to }, { key: 'hours', label: 'ساعات', render: (o) => h('span.num', {}, hrs(o.minutes)) }, { key: 'dayType', label: 'نوع اليوم', render: (o) => DAY_TYPE[o.dayType] }, { key: 'mode', label: 'الوضع', render: (o) => (o.mode === 'retro' ? SA.chip('رجعي', 'warning') : SA.chip('مسبق', 'neutral')) }, { key: 'status', label: 'الحالة', sort: true, render: (o) => h('div', {}, stChip(OT_ST, o.status), o.payrollPeriod ? h('small', { style: { display: 'block', color: 'var(--color-text-muted)' } }, 'مرتبات ' + o.payrollPeriod) : null) }, { key: 'createdAt', label: 'قُدّم', sort: true, render: (o) => h('span.t-muted', {}, SA.fmt.rel(o.createdAt)) }],
      rowActions: (o) => { const why = o.status !== 'requested' ? 'تم القرار' : cannotDecide(apOf(o.approvalId), o.employeeIds.length === 1 ? emp(o.employeeIds[0]) : null, 'overtime') || (SA.can('hr.overtime.approve') ? false : NOPERM); return [{ label: 'فتح التفاصيل', icon: 'eye', onClick: () => openOt(o.id) }, { label: 'اعتماد', icon: 'checkcircle', disabled: why, onClick: () => otDecide(o, true) }, { label: 'رفض', icon: 'xcircle', danger: true, disabled: why, onClick: () => otDecide(o, false) }, { divider: true }, { label: 'تسجيل التنفيذ', icon: 'check', disabled: o.status === 'approved' ? false : 'للمعتمد فقط', onClick: () => otMarkWorked(o) }, { label: 'تحقق من الساعات', icon: 'checkcircle', disabled: o.status === 'worked' ? (SA.can('hr.overtime.approve') ? false : NOPERM) : 'بعد تسجيل التنفيذ', onClick: () => otVerifyFlow(o) }]; },
      onRowClick: (o) => openOt(o.id), empty: { icon: 'bolt', title: 'لا توجد طلبات أوفرتايم', text: 'الأوفرتايم بإذن مسبق أو بأثر رجعي خلال المهلة، وتحذّرك الفحوصات من تجاوز 12 ساعة تواجد.', action: SA.can('hr.overtime.create') ? { label: 'طلب أوفرتايم', onClick: () => otRequestFlow() } : null } })));
    body.append(h('div', {}, specLink('hr-time', 'ovt-01', 'قائمة الطلبات في التصميم ↗')));
  }

  /* — التحقق وترحيل المرتبات — */
  async function postPayroll(ym) {
    if (!SA.can('hr.overtime.approve')) { SA.toast(NOPERM + ' (hr.overtime.approve)', 'warn'); return; }
    const items = otAll().filter((o) => o.status === 'verified' && !o.payrollPeriod && o.date.slice(0, 7) === ym); if (!items.length) { SA.toast('لا بنود متحقَّقة غير مرحَّلة في هذا الشهر.', 'info'); return; }
    const total = items.reduce((a, o) => a + Object.values(o.verified).reduce((x, y) => x + y, 0), 0);
    const res = await SA.confirm({ title: 'ترحيل دفعة أوفرتايم ' + D.monthLabel(ym) + ' للمرتبات', text: items.length + ' طلب · ' + hrs(total) + ' ساعة متحقَّقة (' + items.map((o) => o.id).join('، ') + ')', confirmLabel: 'ترحيل للمرتبات', impact: ['تظهر الساعات كمدخل في دورة المرتبات (HR-14) بسطر مستقل.', 'المبالغ تُحسب في المرتبات بقواعد الأساس والمضاعفات المعتمدة — Pending.'] });
    if (!res.ok) return; if (!(await SA.stepUp('policy.change'))) return;
    try { await SA.api(() => { tupd((t) => { t.otRequests.forEach((o) => { if (items.some((x) => x.id === o.id)) o.payrollPeriod = ym; }); }); SA.audit('HR.OT.PAYROLL_POSTED', { target: { type: 'period', id: ym, label: 'أوفرتايم ' + D.monthLabel(ym) }, after: { requests: items.length, hours: hrs(total) } }); SA.notify({ title: 'N-24 مدخلات أوفرتايم جاهزة للمرتبات', body: D.monthLabel(ym) + ' — ' + hrs(total) + ' ساعة متحقَّقة.', level: 'action', to: ['R-13', 'R-11'], link: '#/hr/payroll' }); }); SA.toast('تم ترحيل الدفعة للمرتبات', 'success'); } catch (e) { SA.fail(e); }
  }
  function otVerifyTab(body) {
    const pending = otAll().filter((o) => o.status === 'approved' || o.status === 'worked'); const ver = otAll().filter((o) => o.status === 'verified' && !o.payrollPeriod); const months = Array.from(new Set(ver.map((o) => o.date.slice(0, 7))));
    body.append(kpis([['بانتظار التنفيذ/التحقق', pending.length, { accent: pending.length > 0 }], ['متحقَّق وجاهز للترحيل', ver.length], ['مرحَّل للمرتبات', otAll().filter((o) => o.payrollPeriod).length]]));
    body.append(SA.card({ flush: true, title: 'التحقق بعد التنفيذ', actions: months.map((m) => SA.btn({ label: 'ترحيل ' + D.monthLabel(m), icon: 'download', kind: 'ghost', size: 'sm', perm: 'hr.overtime.approve', onClick: () => postPayroll(m) })) }, tbl({ rowId: 'id', pageSize: 10, caption: 'التحقق', rows: () => otAll().filter((o) => ['approved', 'worked', 'verified', 'paid'].indexOf(o.status) >= 0), initial: { sort: { key: 'date', dir: 'desc' } },
      columns: [{ key: 'id', label: 'الرقم', render: (o) => h('b.num', {}, o.id) }, { key: 'emps', label: 'العاملون', render: (o) => o.employeeIds.map((x) => empName(x).split(' ')[0]).join('، ') }, { key: 'date', label: 'اليوم', sort: true, render: (o) => D.fmt(o.date) }, { key: 'plan', label: 'مخطط', render: (o) => h('span.num', {}, hrs(o.minutes) + ' س') }, { key: 'ver', label: 'متحقَّق', render: (o) => (o.verified && Object.keys(o.verified).length ? h('span.num', {}, hrs(Object.values(o.verified).reduce((a, b) => a + b, 0) / o.employeeIds.length) + ' س/عامل') : '—') }, { key: 'status', label: 'الحالة', render: (o) => stChip(OT_ST, o.status) }, { key: 'pp', label: 'المرتبات', render: (o) => o.payrollPeriod || '—' }],
      rowActions: (o) => [{ label: 'فتح', icon: 'eye', onClick: () => openOt(o.id) }, { label: 'تسجيل التنفيذ', icon: 'check', disabled: o.status === 'approved' ? false : 'للمعتمد فقط', onClick: () => otMarkWorked(o) }, { label: 'تحقق من الساعات', icon: 'checkcircle', disabled: o.status === 'worked' ? (SA.can('hr.overtime.approve') ? false : NOPERM) : 'بعد التنفيذ', onClick: () => otVerifyFlow(o) }], onRowClick: (o) => openOt(o.id), empty: { icon: 'checkcircle', title: 'لا بنود للتحقق', text: 'تظهر هنا الطلبات المعتمدة حتى ترحيلها للمرتبات.' } })));
    body.append(h('p.sap-hrt-note', {}, 'القاعدة: لا يصل للمرتبات إلا ما تم التحقق منه (N-23). المصدر: ', h('code', {}, 'SA.hrTime.overtimeForPeriod("YYYY-MM")')));
  }

  /* — إخطار الجهة (م 121) — */
  async function otBatchFlow() {
    if (!canExecTask()) { SA.toast(NOPERM, 'warn'); return; }
    const inTask = new Set((T('tasks') || []).filter((t) => t.type === 'ot_notify').flatMap((t) => t.items || []));
    const items = otAll().filter((o) => ['worked', 'verified', 'paid'].indexOf(o.status) >= 0 && !inTask.has(o.id)); if (!items.length) { SA.toast('لا أوفرتايم منفَّذ خارج دفعات الإخطار.', 'info'); return; }
    const last = items.reduce((m, o) => (o.date > m ? o.date : m), items[0].date); const due = D.add(last, SET().otNotifyDays || 7);
    const res = await SA.confirm({ title: 'تجميع دفعة إخطار للجهة الإدارية', confirmLabel: 'إنشاء الدفعة', text: items.length + ' طلب منفَّذ (' + items.map((o) => o.id).join('، ') + ') — الموعد ' + D.fmt(due) + '.', note: 'قائمة أسبوعية بالأسماء والتواريخ والساعات والأسباب — ليست تكاملًا ولا إخطارًا إلكترونيًا.' }); if (!res.ok) return;
    try { await SA.api(() => { tupd((t) => { t.tasks.push({ id: nextIdLocal(t.tasks, 'TK'), type: 'ot_notify', refId: items[0].id, title: 'إخطار الجهة الإدارية بأوفرتايم حتى ' + D.fmt(last), items: items.map((o) => o.id), dueAt: due, status: 'open', executedBy: null, closedBy: null, proof: null }); }); }); SA.toast('أُنشئت دفعة الإخطار', 'success'); } catch (e) { SA.fail(e); }
  }
  function otNotifyTab(body) {
    body.append(SA.alert('warning', h('b', {}, 'مهمة امتثال بلا تكامل إلكتروني. '), 'يُخطَر الجهة بالأوفرتايم خلال ', SET().otNotifyDays == null ? SA.openValue() : SET().otNotifyDays + ' أيام', ' (م 121 · Pending) — دفعة أسبوعية بدل إخطار لكل طلب. ينفّذ HR Officer ويغلق HR Manager بإثبات.'));
    body.append(SA.card({ flush: true, title: 'دفعات إخطار الجهة (الأوفرتايم)', tags: SA.tag('new'), actions: [SA.btn({ label: 'تجميع دفعة', icon: 'plus', kind: 'primary', size: 'sm', reason: canExecTask() ? '' : NOPERM, onClick: otBatchFlow })] }, tasksTable('ot_notify')));
  }

  /* — المضاعفات والسقوف (إعدادات) — */
  const OT_ROWS = [
    { path: 'ot.multNormal', label: 'مضاعف الأوفرتايم النهاري', ref: 'م 121 — حد أدنى (أجر الساعة + 35%)', hint: 'مضاعف الدفع الكلي للساعة ولا يُضاف فوق الأجر العادي مرة ثانية', min: 1, max: 5 },
    { path: 'ot.multNight', label: 'مضاعف الأوفرتايم الليلي', ref: 'م 121 (14/2025) — +70%', hint: 'تنبيه: بعض المصادر تذكر 135% (قانون 12/2003) — الثقة بنص 14/2025. نافذة الليل Open', min: 1, max: 5 },
    { path: 'ot.multRest', label: 'مضاعف العمل في الراحة الأسبوعية', ref: 'م 121 — أجر يوم + يوم بدل (علاوة فوقها Open)', min: 1, max: 5 },
    { path: 'ot.multHoliday', label: 'مضاعف العمل في العطلات الرسمية', ref: 'م 129 — «مثلي» (التفسير Open)', min: 1, max: 5 },
    { path: 'ot.rateBasis', label: 'أساس الأجر الساعي', type: 'select', options: [['basic', 'الأجر الأساسي ÷ 30 ÷ 8'], ['full', 'الأجر الشامل ÷ 30 ÷ 8']], ref: 'بند 44 — Pending', fmt: (v) => ({ basic: 'الأساسي ÷ 30 ÷ 8', full: 'الشامل ÷ 30 ÷ 8' }[v]) },
    { path: 'ot.capDay', label: 'سقف يومي لكل موظف', unit: 'ساعة', min: 1, ref: 'D7 — Open' }, { path: 'ot.capWeek', label: 'سقف أسبوعي لكل موظف', unit: 'ساعة', min: 1, ref: 'D7 — Open' }, { path: 'ot.capMonth', label: 'سقف شهري لكل موظف', unit: 'ساعة', min: 1, ref: 'D7 — Open' }, { path: 'ot.deptBudget', label: 'ميزانية القسم (T3)', unit: 'ج.م', min: 0, ref: 'D7 — Open' },
    { path: 'ot.warnPct', label: 'نسبة التحذير من السقف', unit: '%', min: 1, max: 100, ref: 'N-22' }, { path: 'ot.retroHours', label: 'مهلة الطلب بأثر رجعي', unit: 'ساعة', min: 1, ref: 'lifecycle D5 (سياسة)' },
    { path: 'maxPresenceHours', label: 'أقصى تواجد داخل المنشأة', unit: 'ساعة', min: 1, ref: 'م 121' }, { path: 'otNotifyDays', label: 'مهلة إخطار الجهة بالأوفرتايم', unit: 'يوم', min: 1, ref: 'م 121' }
  ];
  function otSettingsTab(body) {
    body.append(SA.alert('warning', h('b', {}, 'تعارض مصادر: '), 'نص قانون 14/2025 يقول +70% للأوفرتايم الليلي، وبعض المدونات تذكر 135% (من 12/2003 أو تفسير خاطئ). اعتمدنا النص وأضفنا هذا التنبيه بجوار الإعداد.'));
    body.append(SA.card({ title: 'المضاعفات والسقوف وأنواع اليوم', tags: [SA.tag('pending', '[Law]')], actions: [SA.btn({ label: 'تعديل', icon: 'edit', kind: 'primary', size: 'sm', perm: 'hr.settings.edit', onClick: () => settingsEdit({ title: 'مضاعفات وسقوف الأوفرتايم', rows: OT_ROWS, perm: 'hr.settings.edit', audit: 'HR.OT.POLICY_UPDATED' }) })] }, settingsTable(OT_ROWS, { caption: 'مضاعفات الأوفرتايم' }), h('p.sap-hrt-note', { style: { marginTop: '10px' } }, 'من يضبط المضاعفات ≠ من يعتمد الأوفرتايم الكبير [New]. المبالغ والميزانية T3: تُرى بـ hr.salary.view.')));
    body.append(SA.card({ title: 'أكواد سبب الأوفرتايم (م 121 «حاجة غير عادية»)', tags: SA.tag('new') }, h('div.sap-hrt-cluster', {}, (T('otReasons') || []).map((r) => h('span.sap-hrt-tag', {}, r[1]))), h('p.sap-hrt-note', { style: { marginTop: '8px' } }, 'الكتالوج الفعلي Open — القيم تجريبية. قواعد البدلات (ليل · انتقالات · وجبة · خطورة) تُدار من ', specLink('hr-time', 'ovt-05', 'شاشة البدلات ↗'), ' — تصنيفها للتأمينات D4 Open.')));
  }

  /* — تكلفة الأوفرتايم (T3) — */
  function otCostTab(body) {
    const ym = D.today().slice(0, 7); const reqs = otAll().filter((o) => o.status !== 'rejected' && o.status !== 'cancelled' && o.status !== 'requested');
    const hrsTotal = reqs.reduce((a, o) => a + o.minutes * o.employeeIds.length, 0);
    body.append(kpis([['ساعات الأوفرتايم (الكل)', hrs(hrsTotal)], ['طلبات معتمدة/منفَّذة', reqs.length], ['ساعات هذا الشهر', hrs(reqs.filter((o) => o.date.slice(0, 7) === ym).reduce((a, o) => a + o.minutes * o.employeeIds.length, 0))]]));
    if (!canSalary()) { body.append(denyBox('hr.salary.view', 'مش مسموح لك تشوف المبالغ — تكلفة الأوفرتايم بيانات T3 (بند 46: General Manager ليس تلقائيًا). الساعات أعلاه متاحة.')); return; }
    logCostView();
    const byType = {}; reqs.forEach((o) => o.employeeIds.forEach((id) => { const a = otAmount(emp(id), (o.verified && o.verified[id]) || o.minutes, o.dayType); byType[o.dayType] = byType[o.dayType] || { min: 0, amt: 0, open: 0 }; byType[o.dayType].min += (o.verified && o.verified[id]) || o.minutes; if (a == null) byType[o.dayType].open++; else byType[o.dayType].amt += a; }));
    const basisOpen = SET().ot.rateBasis == null;
    const rowsT = Object.keys(byType).map((k) => h('tr', {}, h('td', {}, DAY_TYPE[k]), h('td.num', {}, hrs(byType[k].min)), h('td', {}, basisOpen || byType[k].open ? SA.openValue('غير مُعدّ') : h('b.num', {}, SA.fmt.money(Math.round(byType[k].amt))))));
    const tbl = h('table.sap-hrt-ladder', {}, h('thead', {}, h('tr', {}, h('th', {}, 'نوع اليوم'), h('th', {}, 'الساعات'), h('th', {}, 'المبلغ'))), h('tbody', {}, rowsT));
    body.append(SA.card({ title: 'تكلفة الأوفرتايم حسب نوع اليوم', tags: [SA.tag('pending', 'T3')] }, basisOpen ? SA.alert('warning', 'أساس الأجر الساعي غير مُعدّ (بند 44) — لا تُحسب مبالغ قبل ضبطه من تبويب «المضاعفات والسقوف».') : null, tbl, h('p.sap-hrt-note', { style: { marginTop: '8px' } }, 'ميزانية القسم: ', optVal(SET().ot.deptBudget, (v) => SA.fmt.money(v)), ' — Overtime% = ساعات الأوفرتايم ÷ الساعات المجدولة العادية (يُحسب عند توفر الجداول).')));
  }

  function renderOvertime(root, ctx) {
    if (!ready()) return;
    ctx.setCrumbs([{ label: 'الوقت' }, { label: 'الأوفرتايم' }]);
    return bootScreen(root, (host) => tabbed(host, ctx, {
      route: 'hr/overtime', title: 'الأوفرتايم والبدلات', desc: 'طلب مسبق أو بأثر رجعي، فحص 12 ساعة تواجد والسقوف، اعتماد، تحقق، ثم ترحيل الساعات المعتمدة للمرتبات.', tags: [SA.tag('pending', '[Law] HR-12')],
      tabs: [{ id: 'requests', label: 'الطلبات', icon: 'bolt', badge: () => { const n = otAll().filter((o) => o.status === 'requested').length; return n || null; } }, { id: 'verify', label: 'التحقق والترحيل', icon: 'checkcircle' }, { id: 'notify', label: 'إخطار الجهة', icon: 'shield', badge: () => { const n = (T('tasks') || []).filter((t) => t.type === 'ot_notify' && t.status !== 'closed').length; return n || null; } }, { id: 'settings', label: 'المضاعفات والسقوف', icon: 'settings' }, { id: 'cost', label: 'التكلفة (T3)', icon: 'coins' }],
      actions: (tab) => (tab === 'requests' ? [SA.btn({ label: 'طلب أوفرتايم', icon: 'plus', kind: 'primary', perm: 'hr.overtime.create', onClick: () => otRequestFlow() })] : []),
      render: { requests: otRequestsTab, verify: otVerifyTab, notify: otNotifyTab, settings: otSettingsTab, cost: otCostTab }, paths: ['hrTime', 'approvals', 'attendance', 'employees']
    }));
  }

  /* ═════════════════════════════════ HR-32 · فريقي (MSS — واجهة المشرف) ═════════════════════════════════ */
  function renderTeam(root, ctx) {
    if (!ready()) return; runEscalation();
    ctx.setCrumbs([{ label: 'لوحة HR' }, { label: 'فريقي' }]);
    return bootScreen(root, (host) => {
      const wrap = h('div.sap-hrt-mobile'); host.append(wrap); let day = D.today();
      const draw = () => {
        SA.clear(wrap); const me = myEmp(); const team = me ? teamOf(me.id) : visibleEmps(); const today = day; const infos = team.map((e) => ({ e, i: dayInfo(e, today) })); const c = (s) => infos.filter((x) => x.i.status === s).length;
        wrap.append(SA.pageHead({ title: 'فريقي', desc: (me ? me.name + ' — ' : '') + D.dayName(today) + ' ' + D.fmt(today) + ' · ' + team.length + ' من فريقك', tags: [SA.tag('new', 'HR-32 · MSS')], actions: [SA.btn({ label: 'طلب أوفرتايم', icon: 'bolt', kind: 'primary', perm: 'hr.overtime.create', onClick: () => otRequestFlow({ ids: [] }) })] }));
        if (!team.length) { wrap.append(SA.card({}, SA.empty({ icon: 'users', title: 'لا يوجد أعضاء في فريقك', text: 'الفريق = من يتبعونك مباشرة في الهيكل (المدير المباشر).' }))); return; }
        wrap.append(h('div.sap-grid-cards', {}, [['حاضر', c('present')], ['متأخر', c('late')], ['غائب', c('absent')], ['إجازة', c('leave')], ['لم يصل/ناقصة', c('future') + c('missing')]].map((k) => SA.kpi(k[0], k[1]))));
        /* pending decisions */
        const myLeaves = lvAll().filter((l) => l.status === 'pending' && team.some((e) => e.id === l.employeeId)); const myCorr = corrAll().filter((x) => x.status === 'pending' && team.some((e) => e.id === x.employeeId)); const mySw = (T('swaps') || []).filter((s) => s.status === 'peer_ok' && (team.some((e) => e.id === s.fromEmp) || team.some((e) => e.id === s.toEmp)));
        const myEx = exAll().filter((x) => x.status !== 'resolved' && team.some((e) => e.id === x.employeeId));
        const card = (title, count, rows, empty) => SA.card({ title: title + (count ? ' (' + count + ')' : '') }, rows.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, rows) : h('p.sap-hrt-note', {}, empty));
        wrap.append(card('بانتظار قراري', myLeaves.length + myCorr.length + mySw.length, [].concat(
          myLeaves.map((l) => { const e = emp(l.employeeId); const ap = apOf(l.approvalId); const why = cannotDecide(ap, e, 'leave'); return h('div.sap-hrt-mss-card', {}, h('div', {}, h('b', {}, e.name), h('small', { style: { display: 'block', color: 'var(--color-text-muted)' } }, 'إجازة ' + lvTypeName(l.type) + ' · ' + D.short(l.from) + ' → ' + D.short(l.to) + ' (' + l.days + ' يوم)'), l.escalatedAt ? h('span.sap-hrt-tag.is-bad', {}, 'مُصعَّد') : null), h('div.sap-hrt-cluster', {}, SA.btn({ label: 'اعتماد', icon: 'check', kind: 'primary', size: 'sm', reason: why || '', onClick: () => leaveDecide(l, true) }), SA.btn({ label: 'رفض', kind: 'ghost', size: 'sm', reason: why || '', onClick: () => leaveDecide(l, false) }), SA.btn({ label: 'تفاصيل', kind: 'ghost', size: 'sm', onClick: () => openLeave(l.id) }))); }),
          myCorr.map((x) => h('div.sap-hrt-mss-card', {}, h('div', {}, h('b', {}, empName(x.employeeId)), h('small', { style: { display: 'block', color: 'var(--color-text-muted)' } }, 'تصحيح حضور ' + D.short(x.date) + ' · ' + (x.reqIn || '—') + '/' + (x.reqOut || '—'))), h('div.sap-hrt-cluster', {}, SA.btn({ label: 'اعتماد', icon: 'check', kind: 'primary', size: 'sm', onClick: () => decideCorrection(x, true) }), SA.btn({ label: 'رفض', kind: 'ghost', size: 'sm', onClick: () => decideCorrection(x, false) })))),
          mySw.map((s) => h('div.sap-hrt-mss-card', {}, h('div', {}, h('b', {}, empName(s.fromEmp) + ' ↔ ' + empName(s.toEmp)), h('small', { style: { display: 'block', color: 'var(--color-text-muted)' } }, 'تبديل وردية ' + D.short(s.date))), h('div.sap-hrt-cluster', {}, SA.btn({ label: 'اعتماد', icon: 'check', kind: 'primary', size: 'sm', onClick: () => swapAct(s, 'approve') }), SA.btn({ label: 'رفض', kind: 'ghost', size: 'sm', onClick: () => swapAct(s, 'reject') }))))), 'لا توجد طلبات تنتظرك الآن.'));
        wrap.append(SA.card({ title: 'حضور اليوم', actions: [h('div.sap-hrt-cluster', {}, SA.btn({ label: 'اليوم السابق', icon: 'arrowright', kind: 'ghost', size: 'sm', iconOnly: true, onClick: () => { day = D.add(day, -1); draw(); } }), SA.btn({ label: 'اليوم', kind: 'ghost', size: 'sm', onClick: () => { day = D.today(); draw(); } }), SA.btn({ label: 'اليوم التالي', icon: 'arrowleft', kind: 'ghost', size: 'sm', iconOnly: true, onClick: () => { day = D.add(day, 1); draw(); } }))] }, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, infos.map((x) => h('button.sap-hrt-mss-card', { type: 'button', style: { textAlign: 'start', width: '100%', cursor: 'pointer' }, onclick: () => openDay(x.e.id, today) }, h('div.sap-usercell', {}, SA.avatar(x.e.name), h('div', {}, h('b', {}, x.e.name), h('small', {}, (x.i.in ? 'دخول ' + x.i.in : 'لا بصمة') + (x.i.out ? ' · خروج ' + x.i.out : '') + (x.i.lateMin ? ' · تأخير ' + x.i.lateMin + ' د' : '')))), SA.chip(GLYPH[x.i.status][1], { present: 'success', late: 'warning', absent: 'danger', leave: 'info', missing: 'warning' }[x.i.status] || 'neutral')))), myEx.length ? h('p.sap-hrt-note', { style: { marginTop: '8px' } }, myEx.length + ' استثناء مفتوح لفريقك — ', h('a', { href: '#/hr/attendance?tab=exceptions' }, 'افتح الطابور')) : null));
        const wk = D.weekStart(D.today()); const days7 = D.range(wk, D.add(wk, 6));
        wrap.append(SA.card({ title: 'جدول هذا الأسبوع', actions: [h('a.sap-linkbtn', { href: '#/hr/shifts?tab=roster' }, 'كل الجداول')] }, h('div.sap-hrt-gridwrap', {}, h('table.sap-hrt-grid', {}, h('thead', {}, h('tr', {}, h('th.sap-hrt-namecol', {}, 'الموظف'), days7.map((d) => h('th', { class: d === D.today() ? 'is-today' : '' }, D.dayName(d).slice(0, 3), h('small', {}, D.short(d)))))), h('tbody', {}, team.map((e) => h('tr', {}, h('td.sap-hrt-namecol', {}, h('b', {}, e.name.split(' ').slice(0, 2).join(' '))), days7.map((d) => { const i = dayInfo(e, d); const code = i.status === 'rest' ? 'R' : i.status === 'leave' ? 'L' : i.status === 'holiday' ? 'H' : i.shift; return h('td', {}, h('span.sap-hrt-cell.is-' + code, { style: { cursor: 'default' } }, code === 'R' ? 'ر' : code === 'L' ? 'ج' : code === 'H' ? 'ع' : code)); }))))))));
        wrap.append(h('div.sap-hrt-cluster', {}, h('a.btn.btn-ghost', { href: '#/hr/leave?tab=calendar' }, SA.icon('grid', 'icon-sm'), 'تقويم إجازات الفريق'), h('a.btn.btn-ghost', { href: '#/hr/overtime' }, SA.icon('bolt', 'icon-sm'), 'طلبات الأوفرتايم'), h('a.btn.btn-ghost', { href: '#/hr/requisitions' }, SA.icon('userplus', 'icon-sm'), 'طلب توظيف')));
      };
      draw(); const offs = ['hrTime', 'leaveRequests', 'approvals', 'attendance'].map((p) => st.subscribe(p, () => { if (document.body.contains(wrap)) draw(); }));
      return () => offs.forEach((f) => f());
    });
  }

  /* ═════════════════════════════════ public API + registration + missions ═════════════════════════════════ */
  function overtimeForPeriod(ym) { const out = {}; otAll().filter((o) => o.date.slice(0, 7) === ym && (o.status === 'verified' || o.status === 'paid')).forEach((o) => o.employeeIds.forEach((id) => { const m = (o.verified && o.verified[id]) || 0; if (!m) return; out[id] = out[id] || { minutes: 0, byDayType: {}, requests: [], posted: true }; out[id].minutes += m; out[id].byDayType[o.dayType] = (out[id].byDayType[o.dayType] || 0) + m; out[id].requests.push(o.id); if (!o.payrollPeriod) out[id].posted = false; })); return out; }
  SA.hrTime = {
    dayInfo: dayInfoByEmpId, attendanceSummary, leaveDaysIn: (empId, from, to, type) => leaveDaysIn(emp(empId), from, to, type), hasProtectedLeave, balance: bal, requestLeave, validateLeave, overtimeForPeriod,
    periodStatus: (ym) => periodOf(ym).status, renderTeam, isLocked, teamOf, correctionFlow, leaveRequestFlow, ready,
    requestCorrection(empId, date, rin, rout, reason) { ready(); const e = emp(empId); if (!e) return { ok: false, errors: ['الموظف غير موجود'] }; if (isLocked(date)) return { ok: false, errors: [lockedMsg(date)] }; const ex = exAll().find((x) => x.employeeId === empId && x.date === date && x.status !== 'resolved'); const id = createCorrection(e, date, rin, rout, reason, ex ? ex.id : null); return { ok: true, id }; }
  };
  const nav = (id) => SA.hrNav.find((d) => d.id === id) || {};
  const reg = (id, fn) => { const d = nav(id); SA.register({ app: 'hr', id, group: d.group, title: d.title, icon: d.icon, route: d.route, perm: d.perm, order: d.order, desc: d.desc, render: fn }); };
  reg('hr-shifts', renderShifts); reg('hr-attendance', renderAttendance); reg('hr-leave', renderLeave); reg('hr-overtime', renderOvertime);
  if (REGISTER_MSS) reg('hr-mss', renderTeam);

  const M = (id, title, persona, route, est, goal, steps, detect) => SA.missions.add({ id, area: 'hr', title, persona, route, est, goal, steps, detect });
  M('M-HT1', 'الوقت: ابنِ جدولًا وانشره بعد معالجة المخالفات', 'hr', 'hr-shifts', '6 د', 'افتح مسودة المشرف لخط الألومنيوم: فيها 7 أيام متتالية وتعارض وردية ليل ثم صباح وتغطية ناقصة. عالج المخالفات (أو تجاوزها بسبب) ثم انشر وراقب N-16 ومهمة الإعلان للجهة.', [{ text: 'افتح باني الجدول واختر المسودة', route: 'hr-shifts' }, { text: 'غيّر خلية مخالفة أو استخدم «نسخ أسبوع»', audit: undefined }, { text: 'انشر الجدول (أو تجاوز بسبب)', audit: 'HR.ROSTER.PUBLISHED' }], [{ audit: 'HR.ROSTER.PUBLISHED' }]);
  M('M-HT2', 'الوقت: اطلب إجازة وراقب الرصيد والتقويم', 'hrofficer', 'hr-leave', '5 د', 'قدّم طلب إجازة سنوية لموظف نيابةً عنه: لاحظ حاسبة الرصيد والتغطية، ثم تابع الطلب عند المشرف ← HR.', [{ text: 'افتح الإجازات واضغط «طلب إجازة»', route: 'hr-leave' }, { text: 'أرسل الطلب بعد فحص الرصيد', audit: 'HR.LEAVE.REQUESTED' }], [{ audit: 'HR.LEAVE.REQUESTED' }]);
  M('M-HT3', 'الوقت: أغلق استثناءً وصحّح بصمة ناقصة', 'supervisor', 'hr-attendance', '4 د', 'كمشرف اعتمد طلب تصحيح «نسيت البصمة» لمصطفى عوض، ثم أغلق استثناء آخر بكود.', [{ text: 'افتح تبويب التصحيحات', route: 'hr-attendance' }, { text: 'اعتمد التصحيح', audit: 'HR.ATTENDANCE.CORRECTION_APPROVED' }], [{ audit: 'HR.ATTENDANCE.CORRECTION_APPROVED' }]);
  M('M-HT4', 'الوقت: قفل شهر الحضور للمرتبات', 'hr', 'hr-attendance', '5 د', 'من «قفل الشهر» لأكتوبر: لن يقفل مع استثناءات مفتوحة إلا بتنازل مسجّل. اقفل الشهر ثم جرّب تعديل يوم فيه (ممنوع) والفتح الاستثنائي.', [{ text: 'افتح تبويب قفل الشهر', route: 'hr-attendance' }, { text: 'اقفل الشهر', audit: 'HR.ATTENDANCE.MONTH_LOCKED' }], [{ audit: 'HR.ATTENDANCE.MONTH_LOCKED' }]);
  M('M-HT5', 'الوقت: أوفرتايم من الطلب حتى المرتبات', 'supervisor', 'hr-overtime', '8 د', 'كمشرف اطلب أوفرتايم لعاملين (جرّب تجاوز 12 ساعة)، ثم كـHR Manager اعتمده وتحقق من الساعات ورحّلها للمرتبات.', [{ text: 'افتح الأوفرتايم واطلب إذنًا', route: 'hr-overtime' }, { text: 'أرسل الطلب', audit: 'HR.OT.REQUESTED' }, { text: 'كـHR: اعتمد ثم تحقق ورحّل', audit: 'HR.OT.APPROVED' }], [{ audit: 'HR.OT.REQUESTED' }, { audit: 'HR.OT.APPROVED' }]);
  M('M-HT6', 'عبر الوحدات: إجازة معتمدة تظهر في الحضور والتقويم والرصيد', 'hr', 'hr-leave', '7 د', 'اعتمد طلب إجازة معلّق (خطوة المشرف ثم HR)، ثم افتح الشبكة الشهرية وتقويم الفريق ودفتر الرصيد: الإجازة تظهر «ج» والرصيد انخفض وقيد «أخذ» في الدفتر، وكله في صندوق الاعتمادات.', [{ text: 'افتح الإجازات وطلبًا معلقًا', route: 'hr-leave' }, { text: 'اعتمد الإجازة', audit: 'HR.LEAVE.APPROVED' }, { text: 'راجع الحضور', route: 'hr-attendance' }], [{ audit: 'HR.LEAVE.APPROVED' }, { route: 'hr-attendance' }]);
})();
