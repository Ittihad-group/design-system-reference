/* EG Super Admin prototype — mod-hr-ess.js  (HR-32 · الخدمة الذاتية للموظف والمشرف: خدماتي · فريقي · الكشك)
   Routes:  #/hr/ess[/home|shifts|payslips[/<period>]|leave[/new]|attendance|requests|profile|acks|inbox|report]   (id hr-ess, perm hr.ess.use)
            #/hr/team[/today|approvals|roster|report|probation]                                                      (id hr-mss, perm hr.mss.use)
            #/hr/kiosk                                                                                              (id hr-kiosk, open to any signed-in user — shop-floor shared device simulation)
            #/hr/channels                                                                                           (id hr-channels, perm hr.employees.view — HR side: ESS requests, devices, acknowledgements)
   Collections owned/created here (defensive, idempotent seeding via meta.essSeeded):
     essRequests[]   {id:'ESR-2026-0001', kind:'attendance_fix|profile_change|bank_change|shift_swap|payslip_query|ppe', employeeId, requestedBy:userId, status:'pending|approved|rejected|cancelled|scheduled|applied', title, data:{…}, approvalId|null, createdAt, onBehalf?}
     docRequests[]   {id:'DQ-2026-0001', employeeId, docType:'salary_cert|employment_cert|id_letter', purpose, status:'requested|issued|rejected|cancelled', approvalId, requestedBy, createdAt}
     acknowledgements[] {id, employeeId, docId, docVersion, method:'pin', signedAt, device}      policyDocs[] {id, title, version, summary[], body, quiz?}
     overtimeRequests[] {id:'OT-2026-0001', employeeId, date, hours, reason, status:'pending|approved|rejected', requestedBy, approvalId|null, createdAt}
     violations[]    {id:'VIO-2026-0001', employeeId, reporterId, type, date, description, status:'reported', channel:'mss'}      (feeds hr-disciplinary)
     incidents[]     {id:'INC-2026-0001', type:'injury|near_miss|hazard|other', location, description, employeeId|null, reporterId, severity, status:'reported', channel:'ess|kiosk|mss', createdAt}  (feeds hr-ohs)
     probationReviews[] {id, employeeId, reviewerId, outcome:'continue|end|discuss', notes, status:'submitted', createdAt}
     essQueue[]/kioskQueue[]  offline drafts (non-sensitive only)         essCalls[] supervisor call-outcome log
   Existing collections written: attendance (punch), leaveRequests (+approvalId, stage, source), loans (advance requests), approvals (SA.requestApproval), audit, notifications, employees (phone/emergency/address/bankLast4 on approved change). */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store, C = SA.catalog;

  /* ───────────────────────── catalogue additions (idempotent) ───────────────────────── */
  [['HR.ESS.LOGIN', 'دخول خدماتي/الكشك', 'info'], ['HR.ESS.LOGIN_FAILED', 'فشل دخول خدماتي/الكشك', 'medium'], ['HR.ESS.PAYSLIP_VIEWED', 'اطلاع الموظف على مفردة مرتبه (T3 ذاتي)', 'medium'], ['HR.ESS.REQUEST_SUBMITTED', 'تقديم طلب من خدماتي', 'info'],
    ['HR.ESS.PROFILE_CHANGE_REQUESTED', 'طلب تغيير بيانات الملف', 'medium'], ['HR.ESS.BANK_CHANGE_REQUESTED', 'طلب تغيير الحساب البنكي', 'high'], ['HR.ESS.ACK_SIGNED', 'إقرار وتوقيع سياسة', 'info'],
    ['HR.ESS.OFFLINE_SYNCED', 'مزامنة مسودات بعد انقطاع الاتصال', 'info'], ['HR.ESS.INCIDENT_REPORTED', 'بلاغ مشكلة/حادث من خدماتي', 'high'], ['HR.ESS.ONBEHALF_SUBMITTED', 'إدخال طلب بالنيابة (الجسر الورقي)', 'medium'],
    ['HR.ATTENDANCE.PUNCH_MOBILE', 'بصمة من الموبايل/خدماتي', 'info'], ['HR.KIOSK.PUNCH', 'بصمة على الكشك', 'info'], ['HR.KIOSK.OFFLINE', 'بصمة محفوظة محليًا (الكشك دون اتصال)', 'medium'], ['HR.KIOSK.ADMIN_EXIT', 'خروج المسؤول من وضع الكشك', 'medium'],
    ['HR.INBOX.APPROVED', 'اعتماد من صندوق المشرف', 'medium'], ['HR.INBOX.REJECTED', 'رفض من صندوق المشرف', 'medium'], ['HR.OVERTIME.APPROVED', 'اعتماد أوفرتايم (المشرف)', 'medium'], ['HR.OVERTIME.REJECTED', 'رفض أوفرتايم (المشرف)', 'medium'],
    ['HR.DISCIPLINE.REPORTED', 'بلاغ مخالفة من المشرف', 'high'], ['HR.PROBATION.REVIEW_SUBMITTED', 'تقييم فترة التجربة (توصية المشرف)', 'medium']
  ].forEach((a) => C.addAudit(a[0], a[1], a[2], 'hr'));
  Object.assign(C.approvalTypes, {
    attendance_fix: { label: 'تصحيح بصمة', area: 'hr', icon: 'clock' }, doc_request: { label: 'طلب مستند', area: 'hr', icon: 'doc' }, profile_change: { label: 'تغيير بيانات الملف', area: 'hr', icon: 'edit' },
    bank_change: { label: 'تغيير حساب بنكي', area: 'hr', icon: 'coins' }, payslip_query: { label: 'استفسار عن مفردة مرتب', area: 'hr', icon: 'info' }, ppe: { label: 'طلب زي/عهدة', area: 'hr', icon: 'box' }, shift_swap: { label: 'تبديل وردية', area: 'hr', icon: 'swap' }, overtime: { label: 'أوفرتايم', area: 'hr', icon: 'bolt' }
  });
  SA.icons.addMany({
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    backspace: '<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m12 9.5 5 5M17 9.5l-5 5"/>',
    wifi: '<path d="M2.5 9a15 15 0 0 1 19 0M5.5 12.5a10.5 10.5 0 0 1 13 0M8.8 16a6 6 0 0 1 6.4 0"/><circle cx="12" cy="19.2" r="1"/>',
    health: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    battery: '<rect x="2.5" y="8" width="16" height="9" rx="2"/><path d="M21 11v3M5.5 11v3M8.5 11v3"/>',
    phoneframe: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'
  });

  /* ───────────────────────── tiny utils ───────────────────────── */
  const p2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const hm = (d) => p2(d.getHours()) + ':' + p2(d.getMinutes());
  const today = () => ymd(new Date());
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  const dayIdx = (s) => (new Date(s + 'T12:00:00').getDay() + 1) % 7; /* السبت=0 … الجمعة=6 */
  const isFri = (s) => dayIdx(s) === 6;
  const DAYN = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  const MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const fdate = (s) => (s ? SA.fmt.date(String(s).length === 10 ? s + 'T12:00:00' : s) : '—');
  const mins = (t) => { const a = String(t || '0:0').split(':'); return (+a[0]) * 60 + (+a[1] || 0); };
  const L = (k) => st.get(k) || [];
  const empById = (id) => L('employees').find((e) => e.id === id) || null;
  const userOfEmp = (e) => (e && e.userId ? SA.userById(e.userId) : null);
  const firstName = (n) => String(n || '').split(/\s+/)[0];
  const num = (n) => h('span.num', {}, n);
  const hrsTxt = (n) => (n === 1 ? 'ساعة' : n === 2 ? 'ساعتان' : n + (n <= 10 ? ' ساعات' : ' ساعة'));
  const daysTxt = (n) => (n === 1 ? 'يوم' : n === 2 ? 'يومان' : n + (n <= 10 ? ' أيام' : ' يومًا'));
  const dirLtr = (t) => h('span.num', { dir: 'ltr' }, t);
  const store = {
    get(k) { try { return sessionStorage.getItem('eg.ess.' + k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) sessionStorage.removeItem('eg.ess.' + k); else sessionStorage.setItem('eg.ess.' + k, v); } catch (e) { /* noop */ } }
  };
  const LEAVE_T = { annual: 'سنوية', casual: 'عارضة', sick: 'مرضية', unpaid: 'بدون أجر' };
  const DOC_T = { salary_cert: 'شهادة مرتب', employment_cert: 'شهادة عمل', id_letter: 'خطاب تعريف' };
  const KIND_T = { attendance_fix: ['تصحيح بصمة', 'clock'], profile_change: ['تغيير بيانات', 'edit'], bank_change: ['تغيير حساب بنكي', 'coins'], shift_swap: ['تبديل وردية', 'swap'], payslip_query: ['استفسار عن مفردة', 'info'], ppe: ['طلب زي/عهدة', 'box'] };
  const STAT = {
    pending: ['بانتظار القرار', 'warning'], approved: ['تمت الموافقة', 'success'], rejected: ['مرفوض', 'danger'], cancelled: ['ملغي', 'neutral'], scheduled: ['مجدول للتنفيذ', 'info'], applied: ['تم التنفيذ', 'success'],
    requested: ['بانتظار HR', 'warning'], issued: ['جاهز للتحميل', 'success'], queued: ['بانتظار المزامنة', 'info'], conflict: ['تعارض', 'danger'], pending_peer: ['بانتظار الزميل', 'warning']
  };
  const chipOf = (s) => { const m = STAT[s] || [s, 'neutral']; return SA.chip(m[0], m[1]); };

  /* ───────────────────────── styles ───────────────────────── */
  (function css() {
    if (document.querySelector('style[data-mod="hr-ess"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'hr-ess');
    s.textContent = `
.sap-ess2{max-width:880px;margin-inline:auto;width:100%;font-size:1.0625rem;display:flex;flex-direction:column;gap:16px}
.sap-ess2 .btn{min-height:48px;font-size:1rem}.sap-ess2 .btn-lg{min-height:60px;font-size:1.15rem;border-radius:16px}
.sap-ess2-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;max-width:880px;margin-inline:auto;width:100%}
.sap-ess2-tools .sap-ess2-tool{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding-inline:14px;border-radius:12px;border:1px solid var(--sap-hair);background:#fff;font-weight:700;color:var(--eg-navy);cursor:pointer;font-size:.9rem}
.sap-ess2-tool[aria-pressed="true"]{background:var(--eg-navy);color:#fff;border-color:var(--eg-navy)}
.sap-ess2-tool.is-danger{color:var(--color-danger);border-color:color-mix(in srgb,var(--color-danger) 35%,#fff)}
.sap-ess2-tools .sap-ess2-sp{flex:1}
.sap-ess2-timer{display:inline-flex;align-items:center;gap:6px;font-size:.85rem;color:var(--color-warning);background:var(--color-warning-tint);padding:6px 12px;border-radius:999px;font-weight:700}
.sap-ess2-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.sap-ess2-back{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding-inline:14px 18px;border-radius:14px;background:#fff;border:1px solid var(--sap-hair);font-weight:800;color:var(--eg-navy);cursor:pointer;font-size:1rem;box-shadow:var(--sap-shadow-1)}
.sap-ess2-h1{font-size:1.65rem;margin:0;color:var(--eg-navy-deep);line-height:1.3}
.sap-ess2-sub{color:var(--color-text-muted);margin:2px 0 0;font-size:1rem}
.sap-ess2-card{background:#fff;border:1px solid var(--sap-hair);border-radius:18px;padding:18px;box-shadow:var(--sap-shadow-1);display:flex;flex-direction:column;gap:12px}
.sap-ess2-card h2{font-size:1.15rem;margin:0;color:var(--eg-navy-deep)}
.sap-ess2-hero{background:linear-gradient(135deg,var(--eg-navy-deep),var(--eg-navy));color:#fff;border-radius:22px;padding:20px;display:flex;flex-direction:column;gap:14px;box-shadow:var(--sap-shadow-2)}
.sap-ess2-hero small{color:#c5d3ee;font-size:.95rem}.sap-ess2-hero h2{color:#fff;margin:0;font-size:1.5rem}
.sap-ess2-hero .sap-ess2-time{font-size:2rem;font-weight:800;letter-spacing:.5px;direction:ltr;display:inline-block}
.sap-ess2-hero .chip{background:rgba(255,255,255,.14);color:#fff}
.sap-ess2-greet{display:flex;flex-direction:column;gap:2px}.sap-ess2-greet h1{margin:0;font-size:1.9rem;color:var(--eg-navy-deep)}
.sap-ess2-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:14px}
.sap-ess2-tile{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-height:140px;padding:18px;border-radius:20px;border:1px solid var(--sap-hair);background:#fff;cursor:pointer;text-align:start;box-shadow:var(--sap-shadow-1);transition:transform .15s,box-shadow .15s;font-family:inherit;color:inherit}
.sap-ess2-tile:hover{transform:translateY(-3px);box-shadow:var(--sap-shadow-2)}.sap-ess2-tile:focus-visible{outline:3px solid var(--color-focus);outline-offset:2px}
.sap-ess2-tile .sap-ess2-ico{width:56px;height:56px;border-radius:16px;background:var(--eg-navy-tint);color:var(--eg-navy);display:grid;place-items:center}
.sap-ess2-tile .sap-ess2-ico .icon{width:30px;height:30px}.sap-ess2-tile b{font-size:1.2rem;color:var(--eg-navy-deep)}.sap-ess2-tile small{color:var(--color-text-muted);font-size:.9rem;line-height:1.5}
.sap-ess2-tile.is-alert .sap-ess2-ico{background:var(--color-danger-tint);color:var(--color-danger)}
.sap-ess2-badge{position:absolute;inset-block-start:12px;inset-inline-end:12px;min-width:26px;height:26px;border-radius:13px;background:var(--eg-red);color:#fff;font-weight:800;font-size:.85rem;display:grid;place-items:center;padding-inline:7px}
.sap-ess2-mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px}
.sap-ess2-mini button{display:flex;align-items:center;gap:10px;min-height:56px;padding-inline:14px;border-radius:14px;border:1px solid var(--sap-hair);background:#fff;font-weight:700;color:var(--eg-navy);cursor:pointer;font-family:inherit;font-size:1rem}
.sap-ess2-mini button .icon{width:22px;height:22px}
.sap-ess2-list{display:flex;flex-direction:column;gap:10px}
.sap-ess2-row{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:16px;background:#fff;border:1px solid var(--sap-hair);text-align:start;font-family:inherit;color:inherit;width:100%;min-height:64px}
button.sap-ess2-row{cursor:pointer}button.sap-ess2-row:hover{box-shadow:var(--sap-shadow-2)}
.sap-ess2-row .sap-ess2-ico{width:44px;height:44px;border-radius:12px;background:var(--eg-navy-tint);color:var(--eg-navy);display:grid;place-items:center;flex:none}
.sap-ess2-row > div{flex:1;min-width:0}.sap-ess2-row b{display:block;font-size:1.05rem;color:var(--eg-navy-deep)}.sap-ess2-row small{color:var(--color-text-muted);font-size:.9rem}
.sap-ess2-bal{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.sap-ess2-bal > div{background:#fff;border:1px solid var(--sap-hair);border-radius:16px;padding:14px;text-align:center}
.sap-ess2-bal b{display:block;font-size:2rem;color:var(--eg-navy-deep);line-height:1.2}.sap-ess2-bal span{font-size:.9rem;color:var(--color-text-muted)}
.sap-ess2-secret{display:inline-flex;align-items:center;gap:6px;background:var(--color-danger-tint);color:var(--color-danger);padding:4px 12px;border-radius:999px;font-weight:800;font-size:.85rem}
.sap-ess2-mask{letter-spacing:3px;color:var(--color-text-muted)}
.sap-ess2-pay{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:14px 0;border-block-end:1px dashed var(--color-border)}
.sap-ess2-pay:last-child{border:0}.sap-ess2-pay b{font-size:1.25rem;color:var(--eg-navy-deep)}.sap-ess2-pay span{color:var(--color-text-muted)}
.sap-ess2-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px}
.sap-ess2-choice{display:flex;flex-direction:column;align-items:center;gap:8px;min-height:92px;padding:14px 10px;border-radius:16px;border:2px solid var(--sap-hair);background:#fff;cursor:pointer;font-weight:800;color:var(--eg-navy);font-family:inherit;font-size:1rem;text-align:center}
.sap-ess2-choice .icon{width:28px;height:28px}.sap-ess2-choice small{font-weight:500;color:var(--color-text-muted);font-size:.82rem}
.sap-ess2-choice[aria-pressed="true"]{border-color:var(--eg-navy);background:var(--eg-navy-tint);box-shadow:0 0 0 3px color-mix(in srgb,var(--eg-navy) 16%,transparent)}
.sap-ess2-choice.is-danger[aria-pressed="true"]{border-color:var(--eg-red);background:var(--color-danger-tint);color:var(--color-danger)}
.sap-ess2-chips{display:flex;flex-wrap:wrap;gap:8px}
.sap-ess2-chipbtn{min-height:44px;padding-inline:16px;border-radius:999px;border:1.5px solid var(--color-border-strong);background:#fff;font-weight:700;color:var(--eg-navy);cursor:pointer;font-family:inherit;font-size:.95rem}
.sap-ess2-chipbtn[aria-pressed="true"]{background:var(--eg-navy);color:#fff;border-color:var(--eg-navy)}
.sap-ess2-cal{background:#fff;border:1px solid var(--sap-hair);border-radius:18px;padding:12px}
.sap-ess2-cal-head{display:flex;align-items:center;justify-content:space-between;margin-block-end:8px}.sap-ess2-cal-head b{font-size:1.1rem;color:var(--eg-navy-deep)}
.sap-ess2-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.sap-ess2-cal-dn{font-size:.72rem;text-align:center;color:var(--color-text-muted);padding-block:4px;font-weight:700}
.sap-ess2-cal-d{min-height:44px;border-radius:12px;border:1px solid transparent;background:var(--color-bg-alt);font-weight:700;color:var(--eg-navy-deep);cursor:pointer;font-family:inherit;font-size:1rem;position:relative}
.sap-ess2-cal-d.is-fri{background:repeating-linear-gradient(135deg,#f0f1f4,#f0f1f4 5px,#e6e8ed 5px,#e6e8ed 10px);color:var(--color-text-muted)}
.sap-ess2-cal-d.is-today{border-color:var(--eg-navy)}.sap-ess2-cal-d.is-in{background:var(--eg-navy-tint);color:var(--eg-navy)}
.sap-ess2-cal-d.is-edge{background:var(--eg-navy);color:#fff}.sap-ess2-cal-d.is-off{visibility:hidden}
.sap-ess2-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:.82rem;color:var(--color-text-muted);margin-block-start:8px}
.sap-ess2-legend i{display:inline-block;width:14px;height:14px;border-radius:4px;margin-inline-end:6px;vertical-align:-2px}
.sap-ess2-banner{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;font-size:.95rem;line-height:1.6}
.sap-ess2-banner.is-warn{background:var(--color-warning-tint);color:#6b3a00}.sap-ess2-banner.is-info{background:var(--eg-navy-tint);color:var(--eg-navy-deep)}.sap-ess2-banner.is-danger{background:var(--color-danger-tint);color:#7a0b10}
.sap-ess2-banner .icon{flex:none;margin-block-start:2px}
.sap-ess2-steps{display:flex;gap:6px;align-items:center;margin-block-end:4px}.sap-ess2-steps i{flex:1;height:6px;border-radius:3px;background:var(--color-border)}.sap-ess2-steps i.is-on{background:var(--eg-navy)}
.sap-ess2-done{text-align:center;padding:28px 12px;display:flex;flex-direction:column;align-items:center;gap:12px}
.sap-ess2-done .sap-ess2-ok{width:84px;height:84px;border-radius:50%;background:var(--color-success-tint);color:var(--color-success);display:grid;place-items:center}.sap-ess2-done .sap-ess2-ok .icon{width:44px;height:44px}
.sap-ess2-done h2{font-size:1.5rem;margin:0;color:var(--eg-navy-deep)}
.sap-ess2-week{display:flex;flex-direction:column;gap:8px}.sap-ess2-day{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:#fff;border:1px solid var(--sap-hair);min-height:60px}
.sap-ess2-day.is-today{border-color:var(--eg-navy);box-shadow:0 0 0 3px color-mix(in srgb,var(--eg-navy) 12%,transparent)}.sap-ess2-day .sap-ess2-dn{width:72px;font-weight:800;color:var(--eg-navy-deep)}.sap-ess2-day > div{flex:1}
.sap-ess2-pin{letter-spacing:8px;text-align:center;font-size:1.6rem;direction:ltr;min-height:56px}
.sap-ess2-fieldrow{display:flex;gap:12px;flex-wrap:wrap}.sap-ess2-fieldrow > *{flex:1 1 220px}
.sap-ess2 .field .input,.sap-ess2 .field .select,.sap-ess2 .field .textarea{min-height:52px;font-size:1.05rem}
.sap-ess2-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px}.sap-ess2-sum > div{background:#fff;border:1px solid var(--sap-hair);border-radius:14px;padding:10px;text-align:center}.sap-ess2-sum b{display:block;font-size:1.5rem;color:var(--eg-navy-deep)}.sap-ess2-sum span{font-size:.82rem;color:var(--color-text-muted)}
.sap-ess2-foot{display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;align-items:center}
.sap-ess2-note{font-size:.9rem;color:var(--color-text-muted)}
/* phone frame */
.sap-phn{width:392px;max-width:100%;margin-inline:auto;border-radius:46px;background:#0b1220;padding:12px;box-shadow:0 30px 60px rgba(2,26,67,.28),inset 0 0 0 2px #26324a}
.sap-phn-screen{background:var(--sap-canvas);border-radius:36px;overflow:hidden;height:min(790px,calc(100vh - 250px));min-height:520px;display:flex;flex-direction:column;position:relative}
.sap-phn-status{display:flex;justify-content:space-between;align-items:center;padding:10px 22px 6px;font-size:.8rem;font-weight:800;color:var(--eg-navy-deep);background:#fff;direction:ltr}
.sap-phn-status span{display:inline-flex;gap:6px;align-items:center}.sap-phn-status .icon{width:15px;height:15px}
.sap-phn-appbar{display:flex;align-items:center;gap:10px;padding:8px 16px 10px;background:#fff;border-block-end:1px solid var(--color-border);font-weight:800;color:var(--eg-navy)}
.sap-phn-appbar img{width:26px;height:26px}
.sap-phn-scroll{flex:1;overflow:auto;padding:14px 14px 18px}.sap-phn-scroll .sap-ess2{gap:14px;font-size:1rem}
.sap-phn-scroll .sap-ess2-h1{font-size:1.35rem}.sap-phn-scroll .sap-ess2-tiles{grid-template-columns:1fr 1fr}.sap-phn-scroll .sap-ess2-tile{min-height:128px;padding:14px}
.sap-phn-scroll .sap-ess2-bal b{font-size:1.6rem}
.sap-phn-tabs{display:grid;grid-template-columns:repeat(4,1fr);background:#fff;border-block-start:1px solid var(--color-border);padding:6px 6px 10px}
.sap-phn-tabs button{display:flex;flex-direction:column;align-items:center;gap:2px;min-height:52px;border:0;background:none;color:var(--color-text-muted);font-weight:700;font-size:.72rem;cursor:pointer;font-family:inherit;border-radius:12px}
.sap-phn-tabs button[aria-current="page"]{color:var(--eg-navy);background:var(--eg-navy-tint)}.sap-phn-tabs .icon{width:22px;height:22px}
@media (max-width:520px){.sap-phn{border-radius:0;padding:0;background:none;box-shadow:none;width:auto}.sap-phn-screen{border-radius:0;height:auto;min-height:0;overflow:visible;background:none}.sap-phn-status,.sap-phn-appbar{display:none}.sap-phn-scroll{overflow:visible;padding:0}.sap-phn-tabs{position:sticky;inset-block-end:0;border-radius:14px;box-shadow:var(--sap-shadow-2);margin-block-start:12px}.sap-ess2-bal{grid-template-columns:1fr 1fr 1fr}.sap-ess2-tiles{grid-template-columns:1fr 1fr}.sap-ess2-h1{font-size:1.4rem}.sap-ess2-hero .sap-ess2-time{font-size:1.7rem}}
/* MSS */
.sap-mss{display:flex;flex-direction:column;gap:16px}
.sap-mss-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
.sap-mss-sum > button,.sap-mss-sum > div{background:#fff;border:1px solid var(--sap-hair);border-radius:14px;padding:12px 14px;text-align:start;font-family:inherit;color:inherit;display:flex;flex-direction:column;gap:2px;box-shadow:var(--sap-shadow-1)}
.sap-mss-sum > button{cursor:pointer}.sap-mss-sum > button[aria-pressed="true"]{border-color:var(--eg-navy);box-shadow:0 0 0 3px color-mix(in srgb,var(--eg-navy) 14%,transparent)}
.sap-mss-sum b{font-size:1.7rem;color:var(--eg-navy-deep);line-height:1.2}.sap-mss-sum span{font-size:.85rem;color:var(--color-text-muted);display:flex;align-items:center;gap:6px}
.sap-mss-sum .dot{width:9px;height:9px;border-radius:50%;display:inline-block}
.sap-mss-person{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff;border:1px solid var(--sap-hair);border-radius:14px;min-height:64px;flex-wrap:wrap}
.sap-mss-person > div.sap-mss-info{flex:1;min-width:160px}.sap-mss-person b{display:block;color:var(--eg-navy-deep)}.sap-mss-person small{color:var(--color-text-muted)}
.sap-mss-q{background:#fff;border:1px solid var(--sap-hair);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px;box-shadow:var(--sap-shadow-1)}
.sap-mss-q-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.sap-mss-q-head > div{flex:1;min-width:150px}.sap-mss-q-head b{display:block;font-size:1.05rem;color:var(--eg-navy-deep)}
.sap-mss-q .sap-mss-act{display:flex;gap:10px;flex-wrap:wrap}.sap-mss-q .sap-mss-act .btn{flex:1 1 140px;min-height:52px;font-size:1.02rem}
.sap-mss-cov{display:flex;gap:10px;padding:10px 12px;border-radius:12px;font-size:.9rem;line-height:1.6;align-items:flex-start}
.sap-mss-cov.is-ok{background:var(--color-success-tint);color:#0d5a2c}.sap-mss-cov.is-warn{background:var(--color-warning-tint);color:#6b3a00}
.sap-mss-roster{overflow:auto;border:1px solid var(--sap-hair);border-radius:14px;background:#fff}
.sap-mss-roster table{border-collapse:collapse;width:100%;min-width:640px}.sap-mss-roster th,.sap-mss-roster td{padding:8px 6px;text-align:center;border-block-end:1px solid var(--color-border);font-size:.9rem}
.sap-mss-roster th:first-child,.sap-mss-roster td:first-child{text-align:start;padding-inline-start:12px;position:sticky;inset-inline-start:0;background:#fff;min-width:150px}
.sap-mss-roster th.is-today{background:var(--eg-navy-tint)}.sap-mss-roster td.is-rest{background:#f4f5f8;color:var(--color-text-muted)}
.sap-mss-shift{display:inline-flex;min-width:34px;justify-content:center;padding:3px 8px;border-radius:8px;font-weight:800;font-size:.85rem}
.sap-mss-shift.s-A{background:#e7efff;color:#12408f}.sap-mss-shift.s-B{background:#fdf0dc;color:#8a4b00}.sap-mss-shift.s-C{background:#ece4fa;color:#4a2b8a}.sap-mss-shift.s-day{background:#e3f4ea;color:#0f6a35}.sap-mss-shift.s-lv{background:#fbe3e4;color:#a10f15}
.sap-mss-forms{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:16px;align-items:start}
.sap-mss-phone{max-width:460px;width:100%;background:#fff;border:1px solid var(--sap-hair);border-radius:24px;padding:18px;display:flex;flex-direction:column;gap:14px;box-shadow:var(--sap-shadow-2)}
.sap-mss-phone h2{margin:0;font-size:1.2rem;color:var(--eg-navy-deep);display:flex;gap:10px;align-items:center}
.sap-mss-reasons{display:flex;gap:8px;flex-wrap:wrap}
@media (max-width:720px){.sap-mss-q .sap-mss-act .btn{flex:1 1 100%}}
/* kiosk */
.sap-ksk-host{padding:0 !important;max-width:none !important;gap:0 !important}
.sap-ksk{background:linear-gradient(180deg,#02183f,#012864 60%,#021c4a);color:#fff;border-radius:22px;min-height:calc(100vh - 150px);display:flex;flex-direction:column;overflow:hidden;font-size:1.15rem}
.sap-ksk-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 22px;background:rgba(0,0,0,.25);font-size:.9rem;color:#c5d3ee}
.sap-ksk-top span{display:inline-flex;align-items:center;gap:6px}.sap-ksk-top .icon{width:16px;height:16px}
.sap-ksk-safety{display:flex;align-items:center;gap:14px;padding:12px 22px;background:#b4690a;color:#fff;font-weight:800;font-size:1rem;flex-wrap:wrap}
.sap-ksk-safety .icon{width:24px;height:24px}.sap-ksk-safety em{font-style:normal;background:rgba(255,255,255,.2);border-radius:999px;padding:3px 12px;font-size:.9rem}
.sap-ksk-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:26px 18px}
.sap-ksk-clock{font-size:4.2rem;font-weight:800;letter-spacing:2px;direction:ltr;line-height:1}.sap-ksk-date{font-size:1.25rem;color:#c5d3ee;margin-block-start:-8px}
.sap-ksk-start{min-height:96px;padding-inline:48px;border-radius:24px;border:0;background:var(--eg-red);color:#fff;font-size:1.8rem;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 10px 30px rgba(0,0,0,.35);display:inline-flex;align-items:center;gap:14px}
.sap-ksk-start .icon{width:36px;height:36px}.sap-ksk-start:focus-visible,.sap-ksk-key:focus-visible,.sap-ksk-tile:focus-visible{outline:4px solid #fff;outline-offset:3px}
.sap-ksk-pad{display:grid;grid-template-columns:repeat(3,92px);gap:12px;justify-content:center}
.sap-ksk-key{min-height:84px;border-radius:20px;border:0;background:rgba(255,255,255,.12);color:#fff;font-size:2rem;font-weight:800;cursor:pointer;font-family:inherit;display:grid;place-items:center;direction:ltr}
.sap-ksk-key:active{background:rgba(255,255,255,.28)}.sap-ksk-key.is-go{background:var(--color-success);}.sap-ksk-key.is-del{background:rgba(255,255,255,.06)}
.sap-ksk-display{min-width:300px;text-align:center;font-size:2.4rem;letter-spacing:10px;font-weight:800;background:rgba(255,255,255,.1);border-radius:18px;padding:14px 18px;min-height:76px;direction:ltr}
.sap-ksk-seg{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.sap-ksk-seg button{min-height:56px;padding-inline:22px;border-radius:16px;border:2px solid rgba(255,255,255,.25);background:none;color:#fff;font-weight:800;font-size:1.05rem;cursor:pointer;font-family:inherit}
.sap-ksk-seg button[aria-pressed="true"]{background:#fff;color:var(--eg-navy);border-color:#fff}
.sap-ksk-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:16px;width:100%;max-width:1000px}
.sap-ksk-tile{display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-height:170px;padding:22px;border-radius:26px;border:0;background:#fff;color:var(--eg-navy-deep);cursor:pointer;font-family:inherit;text-align:start;font-size:1.5rem;font-weight:800;box-shadow:0 8px 26px rgba(0,0,0,.28)}
.sap-ksk-tile .icon{width:54px;height:54px;color:var(--eg-navy)}.sap-ksk-tile small{font-size:1rem;font-weight:500;color:var(--color-text-muted)}
.sap-ksk-tile.is-in{background:var(--color-success);color:#fff}.sap-ksk-tile.is-in .icon,.sap-ksk-tile.is-in small{color:#fff}.sap-ksk-tile.is-out{background:var(--eg-red);color:#fff}.sap-ksk-tile.is-out .icon,.sap-ksk-tile.is-out small{color:#fff}
.sap-ksk-tile[disabled]{opacity:.55;cursor:not-allowed}
.sap-ksk-msg{background:rgba(255,255,255,.1);border-radius:18px;padding:16px 22px;font-size:1.15rem;max-width:640px;text-align:center}.sap-ksk-msg.is-err{background:rgba(196,18,24,.35)}.sap-ksk-msg.is-ok{background:rgba(20,122,61,.45)}
.sap-ksk-who{display:flex;align-items:center;gap:14px;font-size:1.5rem;font-weight:800}.sap-ksk-who .avatar{width:54px;height:54px;font-size:1.2rem}
.sap-ksk-bar{height:8px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden;width:min(420px,80%)}.sap-ksk-bar i{display:block;height:100%;background:#fff;transition:width 1s linear}
.sap-ksk-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 22px;background:rgba(0,0,0,.25);font-size:.9rem;color:#c5d3ee;flex-wrap:wrap}
.sap-ksk-foot button{background:none;border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:10px;min-height:44px;padding-inline:14px;cursor:pointer;font-family:inherit}
.sap-ksk-lines{display:flex;flex-direction:column;gap:10px;width:100%;max-width:640px}.sap-ksk-line{display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.1);border-radius:16px;padding:14px 18px;font-size:1.15rem}
.sap-ksk-line.is-today{background:#fff;color:var(--eg-navy-deep)}
@media (max-width:640px){.sap-ksk-clock{font-size:3rem}.sap-ksk-pad{grid-template-columns:repeat(3,76px)}.sap-ksk-key{min-height:72px}.sap-ksk-start{font-size:1.4rem;padding-inline:28px;min-height:80px}.sap-ksk-display{min-width:0;width:100%;font-size:2rem}}
/* hub */
.sap-hub-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px}
.sap-hub-card{display:flex;flex-direction:column;gap:10px;background:#fff;border:1px solid var(--sap-hair);border-radius:16px;padding:18px;box-shadow:var(--sap-shadow-1)}
.sap-hub-card .sap-hub-ico{width:48px;height:48px;border-radius:14px;background:var(--eg-navy-tint);color:var(--eg-navy);display:grid;place-items:center}.sap-hub-card h3{margin:0;font-size:1.1rem}.sap-hub-card p{margin:0;color:var(--color-text-muted);font-size:.92rem;line-height:1.7;flex:1}
`;
    document.head.appendChild(s);
  })();

  /* ───────────────────────── identity: whose ESS/MSS is this? ───────────────────────── */
  /** → {emp, preview}. Accounts without an employee file (owner, GM backup…) may preview ESS/MSS as any employee — read-only. */
  function who(forMss) {
    const own = L('employees').find((e) => e.userId === SA.session.userId) || null;
    if (own) return { emp: own, preview: false, own: true };
    const pid = store.get(forMss ? 'prevMss' : 'prevEss');
    const pe = pid ? empById(pid) : null;
    return { emp: pe, preview: !!pe, own: false };
  }
  const team = (emp) => (emp ? L('employees').filter((e) => e.managerEmpId === emp.id && e.status !== 'terminated') : []);
  const deptName = (id) => SA.deptName(id);
  const posTitle = (e) => { const p = L('positions').find((x) => x.id === e.positionId); return p ? p.title : ''; };
  const offReason = () => (SA.sim.offline ? 'هذا الإجراء لا يتم دون اتصال بالإنترنت (بند 9/30). عند عودة الاتصال يمكنك المتابعة.' : '');
  const previewReason = (w) => (w && w.preview ? 'وضع المعاينة — للقراءة فقط. ادخل بحساب الموظف نفسه لتنفيذ الإجراءات.' : '');
  const noteTo = (o) => SA.notify(o);

  /* ───────────────────────── shifts (demo definitions — Open: الورديات الفعلية من HR-09) ───────────────────────── */
  const SHIFT_DEF = { day: { name: 'الوردية النهارية', from: '08:00', to: '16:00' }, A: { name: 'الوردية الصباحية (A)', from: '06:00', to: '14:00' }, B: { name: 'الوردية المسائية (B)', from: '14:00', to: '22:00' }, C: { name: 'الوردية الليلية (C)', from: '22:00', to: '06:00' } };
  const GRACE_MIN = 15; /* حد السماح بالتأخير — قيمة تجريبية، القرار الفعلي Open (HR-10) */
  const weekIndex = (s) => Math.floor((new Date(s + 'T12:00:00').getTime() - new Date('2026-01-03T12:00:00').getTime()) / 604800000);
  /** shift code of an employee on a date: Friday = rest; A/B/C rotate weekly (demo); approved swaps override. */
  function shiftOn(emp, date) {
    if (!emp) return null; if (isFri(date)) return 'rest';
    const sw = L('essRequests').find((r) => r.kind === 'shift_swap' && r.status === 'approved' && r.data && r.data.date === date && (r.employeeId === emp.id || r.data.peerId === emp.id));
    if (sw) { const other = empById(sw.employeeId === emp.id ? sw.data.peerId : sw.employeeId); if (other) return rawShift(other, date); }
    return rawShift(emp, date);
  }
  function rawShift(emp, date) { if (emp.shift === 'day') return 'day'; const order = ['A', 'B', 'C']; const i = order.indexOf(emp.shift); if (i < 0) return emp.shift || 'day'; return order[(((i + weekIndex(date) - weekIndex(today())) % 3) + 3) % 3]; }
  const shiftTxt = (code) => (code === 'rest' ? 'راحة أسبوعية' : SHIFT_DEF[code] ? SHIFT_DEF[code].from + ' – ' + SHIFT_DEF[code].to : '—');
  const shiftName = (code) => (code === 'rest' ? 'راحة' : SHIFT_DEF[code] ? SHIFT_DEF[code].name : code);

  /* ───────────────────────── leave helpers ───────────────────────── */
  function countDays(from, to) { let n = 0; for (let d = from, g = 0; d <= to && g < 400; d = addDays(d, 1), g++) if (!isFri(d)) n++; return n; }
  const balanceOf = (empId, type) => L('leaveBalances').find((b) => b.employeeId === empId && b.type === type) || null;
  const leaveOn = (empId, date) => L('leaveRequests').find((r) => r.employeeId === empId && r.status === 'approved' && r.from <= date && r.to >= date) || null;
  const overlap = (a, b) => a.from <= b.to && b.from <= a.to;

  /* ───────────────────────── policies for acknowledgements ───────────────────────── */
  const POLICIES = [
    { id: 'POL-001', title: 'لائحة تنظيم العمل (CMP-07)', version: 1, effective: '2026-09-01', mandatory: true, law: true,
      summary: ['مواعيد الحضور والانصراف والتأخير ينظّمها جدول الوردية.', 'الإجازات تُطلب مسبقًا من المشرف، والعارضة لا تزيد عن يومين متتاليين.', 'المخالفات لها جزاءات مدرّجة ولا يوقّعها إلا HR بعد تحقيق مكتوب.', 'من حقك التظلم من أي قرار خلال المهلة المحددة في اللائحة.'],
      body: 'نص تجريبي للائحة تنظيم العمل. النص القانوني الكامل والمعتمد يصدر من مستندات HR بعد اعتماد اللائحة من الجهة المختصة (Pending [Law]). هذا العرض للتجربة فقط ويوضح كيف يظهر الملخص ثم النص الكامل ثم التوقيع بالـPIN.' },
    { id: 'POL-002', title: 'سياسة السلامة والصحة المهنية', version: 2, effective: '2026-10-01', mandatory: true,
      summary: ['ارتدِ معدات الوقاية (خوذة، نظارة، حذاء) في كل مناطق الإنتاج.', 'بلّغ فورًا عن أي إصابة أو شبه حادث أو خطر.', 'لا تشغّل ماكينة لم تتدرّب عليها.', 'اعرف أقرب مخرج طوارئ ونقطة التجمع.'],
      body: 'نص تجريبي لسياسة السلامة والصحة المهنية (الإصدار 2). الإصدار الجديد يتطلب إقرارًا جديدًا حسب BR-ESS-14. النص الرسمي الكامل يأتي من مستندات HR.',
      quiz: { q: 'لو شفت خطر في الخط (سلك مكشوف مثلًا) تعمل إيه؟', options: ['أتجاهله وأكمل شغل', 'أبلّغ فورًا من زر «بلّغ مشكلة» أو المشرف', 'أستنى لآخر الوردية'], answer: 1 } },
    { id: 'POL-003', title: 'سياسة الاستخدام المقبول للأجهزة والبيانات', version: 1, effective: '2026-08-15', mandatory: false,
      summary: ['استخدم الأجهزة للعمل فقط.', 'لا تشارك الـPIN أو كلمة المرور مع أحد.', 'سجّل خروجك من الأجهزة المشتركة دائمًا.'],
      body: 'نص تجريبي لسياسة الاستخدام المقبول. النص الكامل من مستندات HR.' }
  ];

  /* ───────────────────────── idempotent seeding + boot (runs on first render; the store does not exist at script-load time) ───────────────────────── */
  let booted = false;
  function ensure() {
    if (!st.get('meta')) return false;
    if (!st.get('meta.essSeeded')) { seed(); st.set('meta.essSeeded', true); }
    if (!booted) { booted = true; st.subscribe('approvals', syncApprovals); st.subscribe('tour.sim', onSim); }
    tickBank(); syncApprovals();
    return true;
  }
  function seed() {
    ['essRequests', 'docRequests', 'acknowledgements', 'violations', 'incidents', 'probationReviews', 'essQueue', 'kioskQueue', 'essCalls', 'overtimeRequests'].forEach((k) => { if (!Array.isArray(st.get(k))) st.set(k, []); });
    if (!Array.isArray(st.get('policyDocs')) || !st.get('policyDocs').length) st.set('policyDocs', SA.clone(POLICIES));
    const mk = (min) => new Date(Date.now() - min * 60000).toISOString();
    if (!L('acknowledgements').some((a) => a.employeeId === 'E-1017')) st.insert('acknowledgements', { id: 'ACK-0001', employeeId: 'E-1017', docId: 'POL-001', docVersion: 1, method: 'pin', signedAt: mk(60 * 24 * 40), device: 'جهاز شخصي (تجريبي)' });
    /* today's attendance for the supervisor's line (so «فريقي» has a real picture). Skips anyone who already has a record. */
    const t = today(); const plan = { 'E-1020': 'present', 'E-1021': 'late', 'E-1022': 'absent', 'E-1023': 'present', 'E-1024': 'present', 'E-1025': 'leave', 'E-1026': 'present', 'E-1027': 'late', 'E-1028': 'present', 'E-1029': 'present', 'E-1031': 'present' };
    Object.keys(plan).forEach((id) => {
      const e = empById(id); if (!e || L('attendance').some((a) => a.employeeId === id && a.date === t)) return;
      const stt = plan[id]; const ago = (m) => hm(new Date(Date.now() - m * 60000)); const k = parseInt(id.slice(-2), 10);
      st.insert('attendance', { id: 'AT-' + id + '-T', employeeId: id, date: t, in: stt === 'absent' || stt === 'leave' ? null : ago(stt === 'late' ? 9 + (k % 4) : 25 + (k % 7) * 6), out: null, status: stt, shift: e.shift, source: 'seed' });
    });
  }

  /* ───────────────────────── approvals: advance a chain + sync decisions made elsewhere (inbox SA-16 / HR screens) back to the source records ───────────────────────── */
  function advanceApproval(apId, ok, reason) {
    const me = SA.session.user; const now = new Date().toISOString();
    if (!apId || !st.find('approvals', apId)) return null;
    st.update('approvals', (list) => {
      const a = list.find((x) => x.id === apId); if (!a) return; const step = a.chain.find((s) => s.status === 'pending'); if (!step) return;
      step.status = ok ? 'approved' : 'rejected'; step.decidedBy = me ? me.id : null; step.decidedAt = now; step.reason = reason || '';
      if (!ok) { a.status = 'rejected'; a.chain.forEach((s) => { if (s.status === 'waiting') s.status = 'skipped'; }); }
      else { const nx = a.chain.find((s) => s.status === 'waiting'); if (nx) { nx.status = 'pending'; a.currentStep = nx.step; } else a.status = 'approved'; }
      a.updatedAt = now;
    });
    return st.find('approvals', apId);
  }
  function withdrawApproval(apId, reason) {
    if (!apId || !st.find('approvals', apId)) return;
    const now = new Date().toISOString();
    st.update('approvals', (list) => { const a = list.find((x) => x.id === apId); if (!a || a.status !== 'pending') return; a.chain.forEach((s) => { if (s.status === 'pending' || s.status === 'waiting') s.status = 'skipped'; }); a.status = 'rejected'; a.updatedAt = now; a.chain[0].reason = a.chain[0].reason || reason || 'سحبه مقدّم الطلب'; });
  }
  function applyAttendanceFix(req) {
    const d = req.data || {}; const e = empById(req.employeeId); if (!e || !d.date) return;
    const rec = L('attendance').find((a) => a.employeeId === e.id && a.date === d.date);
    const code = shiftOn(e, d.date); const def = SHIFT_DEF[code];
    const patch = { adjusted: true, adjustedBy: req.id, source: rec && rec.source ? rec.source : 'manual' };
    if (d.field === 'in') { patch.in = d.time; patch.status = def && mins(d.time) - mins(def.from) > GRACE_MIN ? 'late' : 'present'; } else patch.out = d.time;
    if (rec) st.patch('attendance', rec.id, (r) => Object.assign({}, patch, d.field === 'out' && (r.status === 'absent') ? { status: 'present' } : {}));
    else st.insert('attendance', Object.assign({ id: 'AT-' + e.id + '-' + d.date.replace(/-/g, ''), employeeId: e.id, date: d.date, in: null, out: null, status: 'present', shift: e.shift }, patch));
  }
  function syncApprovals() {
    if (!st.get('meta')) return;
    const aps = L('approvals').filter((a) => a.ref && (a.status === 'approved' || a.status === 'rejected'));
    aps.forEach((a) => {
      const ok = a.status === 'approved'; const rt = a.ref.type;
      if (rt === 'leave') {
        const r0 = st.find('leaveRequests', a.ref.id); if (!r0 || r0.status !== 'pending') return;
        setTimeout(() => { /* deferred: the HR-time module reconciles first (ledger + balances); this is only a fallback */
        const r = st.find('leaveRequests', a.ref.id); if (!r || r.status !== 'pending') return;
        if (ok) {
          st.patch('leaveRequests', r.id, { status: 'approved', stage: 'done', decidedAt: new Date().toISOString() });
          const b = balanceOf(r.employeeId, r.type === 'unpaid' ? '-' : r.type);
          if (b && !r.balanceApplied) { st.patch('leaveBalances', b.id, { balanceDays: Math.max(0, b.balanceDays - r.days), usedDays: (b.usedDays || 0) + r.days }); st.patch('leaveRequests', r.id, { balanceApplied: true }); }
          if (!L('audit').some((x) => x.code === 'HR.LEAVE.APPROVED' && x.target && x.target.id === r.id && x.after && x.after.status === 'approved')) SA.audit('HR.LEAVE.APPROVED', { target: { type: 'leave_request', id: r.id, label: 'إجازة ' + (LEAVE_T[r.type] || r.type) + ' — ' + (empById(r.employeeId) || {}).name }, after: { status: 'approved', stage: 'done' }, reason: 'اكتملت سلسلة الاعتماد' });
        } else { st.patch('leaveRequests', r.id, { status: 'rejected', stage: 'done' }); }
        const e = empById(r.employeeId); if (e && e.userId) noteTo({ title: ok ? 'تمت الموافقة على إجازتك' : 'تم رفض طلب إجازتك', body: 'إجازة ' + (LEAVE_T[r.type] || '') + ' من ' + fdate(r.from) + ' إلى ' + fdate(r.to), level: ok ? 'info' : 'action', toUsers: [e.userId], link: '#/hr/ess/requests' });
        }, 80);
      } else if (rt === 'doc_request') {
        const r = st.find('docRequests', a.ref.id); if (!r || r.status !== 'requested') return;
        st.patch('docRequests', r.id, { status: ok ? 'issued' : 'rejected', issuedAt: ok ? new Date().toISOString() : null });
        const e = empById(r.employeeId); if (e && e.userId) noteTo({ title: ok ? 'مستندك جاهز للتحميل' : 'تم رفض طلب المستند', body: DOC_T[r.docType] || '', level: 'info', toUsers: [e.userId], link: '#/hr/ess/requests' });
      } else if (['attendance_fix', 'profile_change', 'bank_change', 'shift_swap', 'payslip_query', 'ppe'].indexOf(rt) >= 0) {
        const r = st.find('essRequests', a.ref.id); if (!r || r.status !== 'pending') return;
        if (!ok) { st.patch('essRequests', r.id, { status: 'rejected' }); } else if (rt === 'attendance_fix') { applyAttendanceFix(r); st.patch('essRequests', r.id, { status: 'approved' }); }
        else if (rt === 'profile_change') { const e = empById(r.employeeId); if (e) st.patch('employees', e.id, (x) => ({ profile: Object.assign({}, x.profile || {}, r.data.changes || {}) })); st.patch('essRequests', r.id, { status: 'approved' }); }
        else if (rt === 'bank_change') st.patch('essRequests', r.id, { status: 'scheduled', effectiveAt: new Date(Date.now() + 24 * 3600000).toISOString() });
        else st.patch('essRequests', r.id, { status: 'approved' });
        const e = empById(r.employeeId); if (e && e.userId) noteTo({ title: ok ? 'تمت الموافقة على طلبك' : 'تم رفض طلبك', body: r.title, level: rt === 'bank_change' ? 'urgent' : 'info', toUsers: [e.userId], link: '#/hr/ess/requests' });
      }
    });
  }
  function tickBank() {
    if (!st.get('meta')) return;
    L('essRequests').filter((r) => r.kind === 'bank_change' && r.status === 'scheduled' && r.effectiveAt && new Date(r.effectiveAt).getTime() <= Date.now()).forEach((r) => {
      const e = empById(r.employeeId); if (!e) return;
      st.patch('employees', e.id, { bankLast4: r.data.newLast4 }); st.patch('essRequests', r.id, { status: 'applied' });
      SA.audit('HR.EMPLOYEE.UPDATED', { target: { type: 'employee', id: e.id, label: e.name }, before: { bank: '•••• ' + (r.data.oldLast4 || '') }, after: { bank: '•••• ' + r.data.newLast4 }, reason: 'تنفيذ تغيير الحساب البنكي بعد مدة التأخير', actor: { id: 'SYSTEM', name: 'النظام', roleId: null } });
      if (e.userId) noteTo({ title: 'تم تنفيذ تغيير حسابك البنكي', body: 'الحساب الجديد ينتهي بـ •••• ' + r.data.newLast4, level: 'urgent', toUsers: [e.userId], link: '#/hr/ess/profile' });
    });
  }
  function onSim() { if (!SA.sim.offline) flushQueues(); }

  /* ───────────────────────── core actions (shared by ESS / MSS / kiosk) ───────────────────────── */
  function outsideShift(code, t) {
    const d = SHIFT_DEF[code]; if (!d) return true; const s = mins(d.from); let e = mins(d.to); if (e <= s) e += 1440; const x = mins(t);
    return ![x, x + 1440].some((v) => v >= s - 120 && v <= e + 120);
  }
  /** Writes today's attendance punch. dir: 'in'|'out'. atIso = device time (offline kiosk reconciliation). */
  function applyPunch(empId, dir, source, atIso, extra) {
    const at = atIso ? new Date(atIso) : new Date(); const date = ymd(at), t = hm(at); const e = empById(empId);
    const rec = L('attendance').find((a) => a.employeeId === empId && a.date === date);
    if (dir === 'in') {
      if (rec && rec.in) return { dup: true, rec };
      const def = SHIFT_DEF[shiftOn(e, date)]; const diff = def ? mins(t) - mins(def.from) : 0; const late = !!def && diff > GRACE_MIN && diff < 600; const status = late ? 'late' : 'present';
      const patch = Object.assign({ in: t, status, source, punches: ((rec && rec.punches) || []).concat([{ type: 'in', ts: at.toISOString(), source }]) }, extra || {});
      if (rec) st.patch('attendance', rec.id, patch); else st.insert('attendance', Object.assign({ id: 'AT-' + empId + '-' + date.replace(/-/g, ''), employeeId: empId, date, out: null, shift: e ? e.shift : 'day' }, patch));
      return { ok: true, status, time: t, late };
    }
    if (!rec || !rec.in) return { noIn: true };
    if (rec.out) return { dup: true, rec };
    st.patch('attendance', rec.id, { out: t, punches: (rec.punches || []).concat([{ type: 'out', ts: at.toISOString(), source }]) });
    return { ok: true, time: t, hours: Math.max(0, (mins(t) - mins(rec.in)) / 60) };
  }
  const todayRec = (empId) => L('attendance').find((a) => a.employeeId === empId && a.date === today()) || null;

  const managerRole = (emp) => { const m = empById(emp && emp.managerEmpId); const u = userOfEmp(m); return u && u.roleId !== 'R-01' ? { roleId: u.roleId, label: u.roleId === 'R-14' ? 'المشرف المباشر — ' + m.name : u.roleId === 'R-05' ? 'رئيس القسم — ' + m.name : SA.roleName(u.roleId) + ' — ' + m.name } : null; };
  const hrStep = (label) => ({ roleId: 'R-11', label: label || 'HR — مراجعة' });
  const ctxRows = (e, rows) => [['الموظف', e.name + ' (' + e.empNo + ')'], ['القسم', deptName(e.departmentId)]].concat(rows || []);
  const via = () => (store.get('frame') === '1' ? 'mobile' : 'web');

  function createLeave(o) {
    const e = o.emp; const id = st.nextId('leaveRequests', 'LV-2026', 4); const mr = o.onBehalf ? null : managerRole(e);
    const chain = (mr ? [mr] : []).concat([hrStep(o.onBehalf ? 'HR — مراجعة (أُدخل بالنيابة)' : 'HR — فحص الرصيد والسياسة')]);
    const rec = { id, employeeId: e.id, type: o.type, from: o.from, to: o.to, days: o.days, status: 'pending', stage: mr ? 'supervisor' : 'hr', approverEmpId: e.managerEmpId || null, reason: o.reason || '', createdAt: new Date().toISOString(), source: o.onBehalf ? 'onbehalf' : 'ess', attach: !!o.attach, approvalId: null };
    if (o.onBehalf) rec.onBehalf = o.onBehalf;
    st.insert('leaveRequests', rec, true);
    const label = 'إجازة ' + LEAVE_T[o.type] + ' — ' + e.name;
    const ap = SA.requestApproval({ type: 'leave', title: label + ' (' + o.days + ' ' + (o.days === 1 ? 'يوم' : 'أيام') + ')', requesterId: e.userId || SA.session.userId, chain, context: ctxRows(e, [['النوع', LEAVE_T[o.type]], ['من', fdate(o.from)], ['إلى', fdate(o.to)], ['عدد الأيام', String(o.days)], ['الرصيد بعد الطلب', o.balanceAfter == null ? 'غير مُعدّ' : o.balanceAfter + ' يوم'], ['السبب', o.reason || '—']].concat(o.onBehalf ? [['أُدخل بالنيابة', o.onBehalf.byName + ' — ' + o.onBehalf.reason]] : [])), ref: { type: 'leave', id } });
    st.patch('leaveRequests', id, { approvalId: ap.id });
    SA.audit('HR.LEAVE.REQUESTED', { target: { type: 'leave_request', id, label }, after: { status: 'pending', type: o.type, from: o.from, to: o.to, days: o.days, source: rec.source }, reason: o.reason || '', via: via() });
    return st.find('leaveRequests', id);
  }
  function createEssRequest(e, kind, title, data, chain, extra) {
    const id = st.nextId('essRequests', 'ESR-2026', 4);
    const ap = SA.requestApproval({ type: kind, title: title + ' — ' + e.name, requesterId: e.userId || SA.session.userId, chain, context: ctxRows(e, (extra && extra.ctx) || []), ref: { type: kind, id } });
    const rec = { id, kind, employeeId: e.id, requestedBy: SA.session.userId, status: 'pending', title, data, approvalId: ap.id, createdAt: new Date().toISOString() };
    if (extra && extra.onBehalf) rec.onBehalf = extra.onBehalf;
    st.insert('essRequests', rec, true);
    return rec;
  }
  function createDocRequest(e, docType, purpose) {
    const id = st.nextId('docRequests', 'DQ-2026', 4);
    const ap = SA.requestApproval({ type: 'doc_request', title: DOC_T[docType] + ' — ' + e.name, requesterId: e.userId || SA.session.userId, chain: [{ roleId: 'R-12', label: 'HR Officer — تجهيز المستند' }, { roleId: 'R-11', label: 'HR Manager — التوقيع' }], context: ctxRows(e, [['المستند', DOC_T[docType]], ['الغرض (جهة التقديم)', purpose]]), ref: { type: 'doc_request', id } });
    st.insert('docRequests', { id, employeeId: e.id, docType, purpose, status: 'requested', approvalId: ap.id, requestedBy: SA.session.userId, createdAt: new Date().toISOString() }, true);
    SA.audit('HR.ESS.REQUEST_SUBMITTED', { target: { type: 'doc_request', id, label: DOC_T[docType] + ' — ' + e.name }, after: { docType, purpose }, via: via() });
    noteTo({ title: 'طلب مستند جديد: ' + DOC_T[docType], body: e.name + ' — الغرض: ' + purpose, level: 'action', to: ['R-12', 'R-11'], link: '#/approvals/' + ap.id });
    return st.find('docRequests', id);
  }
  function createAdvance(e, amount, reason) {
    const id = st.nextId('loans', 'LN-2026', 4);
    const ap = SA.requestApproval({ type: 'advance', title: 'سلفة: ' + e.name, requesterId: e.userId || SA.session.userId, amount, chain: [{ roleId: 'R-11', label: 'مدير الموارد البشرية' }, { roleId: 'R-07', label: 'المالية' }], context: ctxRows(e, [['المبلغ', SA.fmt.money(amount) + ' (تجريبي)'], ['السبب', reason || '—'], ['ملاحظة', 'حدود السلف والخصومات {Open}']]), ref: { type: 'advance', id } });
    st.insert('loans', { id, employeeId: e.id, kind: 'advance', amount, monthly: null, status: 'requested', requestedAt: new Date().toISOString(), approvalId: ap.id, reason: reason || '', source: 'ess' });
    SA.audit('HR.ADVANCE.REQUESTED', { target: { type: 'loan', id, label: 'سلفة — ' + e.name }, after: { amount, status: 'requested' }, reason: reason || '', via: via() });
    return st.find('loans', id);
  }
  function createIncident(o) {
    const id = st.nextId('incidents', 'INC-2026', 4); const injury = o.type === 'injury';
    const rec = { id, type: o.type, location: o.location, description: o.description, employeeId: o.employeeId || null, reporterId: o.reporterId || SA.session.userId, severity: injury ? 'high' : 'medium', status: 'reported', channel: o.channel || 'ess', photo: !!o.photo, createdAt: o.at || new Date().toISOString() };
    st.insert('incidents', rec, true);
    const T = { injury: 'إصابة', near_miss: 'شبه حادث', hazard: 'خطر', other: 'مشكلة أخرى' }[o.type] || o.type;
    SA.audit(o.channel === 'mss' ? 'HR.OHS.INCIDENT_RECORDED' : 'HR.ESS.INCIDENT_REPORTED', { target: { type: 'incident', id, label: T + ' — ' + o.location }, after: { type: o.type, location: o.location, channel: o.channel || 'ess' }, reason: o.description, actor: o.actor || undefined, via: via() });
    noteTo({ title: (injury ? 'عاجل: بلاغ إصابة — ' : 'بلاغ سلامة — ') + T, body: o.location + ' · ' + o.description, level: injury ? 'urgent' : 'action', to: ['R-15', 'R-11'], link: '#/hr/ohs' });
    return rec;
  }
  /** offline drafts (non-sensitive only: leave + incident). Synced on reconnect with conflict display instead of overwrite (BR-ESS-08). */
  function queueDraft(kind, payload, label) {
    const id = st.nextId('essQueue', 'Q', 3); st.insert('essQueue', { id, kind, payload, label, employeeId: payload.employeeId, createdAtClient: new Date().toISOString(), status: 'queued' }, true); return id;
  }
  function flushQueues() {
    if (SA.sim.offline || !st.get('meta')) return;
    const q = L('essQueue').filter((x) => x.status === 'queued'); const kq = L('kioskQueue').filter((x) => x.status === 'queued'); if (!q.length && !kq.length) return;
    let synced = 0, conflicts = 0;
    kq.forEach((it) => {
      const e = empById(it.employeeId); const r = applyPunch(it.employeeId, it.dir, 'kiosk', it.deviceTs, { reconciled: true });
      st.patch('kioskQueue', it.id, { status: r.dup ? 'conflict' : 'synced', syncedAt: new Date().toISOString() });
      if (r.dup) { conflicts++; return; } synced++;
      SA.audit('HR.KIOSK.PUNCH', { target: { type: 'employee', id: it.employeeId, label: e ? e.name : it.employeeId }, after: { dir: it.dir, time: r.time, reconciled: true }, reason: 'مزامنة بعد انقطاع — وقت الجهاز ' + fdate(it.deviceTs) + ' ' + SA.fmt.time(it.deviceTs), actor: e ? { id: e.userId || e.id, name: e.name, roleId: (userOfEmp(e) || {}).roleId || null } : undefined });
    });
    q.forEach((it) => {
      const e = empById(it.employeeId); const p = it.payload;
      if (it.kind === 'leave') {
        const clash = L('leaveRequests').some((r) => r.employeeId === p.employeeId && (r.status === 'pending' || r.status === 'approved') && overlap(r, p));
        if (clash) { conflicts++; st.patch('essQueue', it.id, { status: 'conflict', note: 'يوجد طلب إجازة آخر بنفس الأيام — راجع قبل الإرسال.' }); return; }
        createLeave({ emp: e, type: p.type, from: p.from, to: p.to, days: p.days, reason: p.reason, attach: p.attach, balanceAfter: p.balanceAfter });
      } else if (it.kind === 'incident') createIncident(Object.assign({}, p, { at: it.createdAtClient }));
      st.patch('essQueue', it.id, { status: 'synced', syncedAt: new Date().toISOString() }); synced++;
    });
    if (synced || conflicts) {
      SA.audit('HR.ESS.OFFLINE_SYNCED', { target: { type: 'queue', id: 'essQueue', label: 'مزامنة المسودات' }, after: { synced, conflicts } });
      SA.toast(synced ? 'تمت مزامنة ' + synced + ' عنصر بعد عودة الاتصال' + (conflicts ? ' — و' + conflicts + ' بتعارض يحتاج مراجعتك' : '') : 'تعارض في ' + conflicts + ' عنصر — راجع «طلباتي»', conflicts ? 'warn' : 'success');
    }
  }

  /* ───────────────────────── shared small UI ───────────────────────── */
  async function run(fn) { try { const r = await SA.api(fn); return { ok: true, r }; } catch (e) { SA.fail(e); return { ok: false }; } }
  function lockBtn(o, reason) { return SA.btn(Object.assign({}, o, { reason: reason || o.reason })); }
  function bigBtn(label, icon, kind, onClick, reason) { return SA.btn({ label, icon, kind: kind || 'primary', size: 'lg', onClick, reason: reason || '' }); }
  function chipSet(options, value, onChange, cls) {
    const wrap = h('div.' + (cls || 'sap-ess2-chips'), { role: 'group' });
    options.forEach((o) => wrap.appendChild(h('button.sap-ess2-chipbtn', { type: 'button', 'aria-pressed': String(o[0] === value), onclick: (ev) => { SA.$$('button', wrap).forEach((b) => b.setAttribute('aria-pressed', 'false')); ev.currentTarget.setAttribute('aria-pressed', 'true'); onChange(o[0]); } }, o[1])));
    return wrap;
  }
  function choiceGrid(options, value, onChange) {
    const wrap = h('div.sap-ess2-choices', { role: 'radiogroup' });
    options.forEach((o) => wrap.appendChild(h('button.sap-ess2-choice' + (o.danger ? '.is-danger' : ''), { type: 'button', role: 'radio', 'aria-pressed': String(o.id === value), 'aria-checked': String(o.id === value), onclick: (ev) => { SA.$$('button', wrap).forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-checked', 'false'); }); ev.currentTarget.setAttribute('aria-pressed', 'true'); ev.currentTarget.setAttribute('aria-checked', 'true'); onChange(o.id); } }, SA.icon(o.icon || 'check'), o.label, o.sub ? h('small', {}, o.sub) : null)));
    return wrap;
  }
  const banner = (kind, icon, ...kids) => h('div.sap-ess2-banner.is-' + kind, { role: kind === 'danger' ? 'alert' : null }, SA.icon(icon), h('div', {}, kids));
  const offBanner = () => (SA.sim.offline ? banner('warn', 'wifioff', h('b', {}, 'لا يوجد اتصال. '), 'بتشوف البيانات المحمّلة. الطلبات البسيطة (إجازة، بلاغ) تتحفظ كمسودة وتتبعت لما النت يرجع. الاعتماد والتحويلات والتغيير البنكي مقفولة.') : null);
  /** PIN prompt (employee PIN simulation: 123456). Resolves true/false. 3 failures → false + audit. */
  function askPin(o) {
    return new Promise((resolve) => {
      let fails = 0; const err = h('div.sap-field-error', { role: 'alert', hidden: true });
      const inp = h('input.input.sap-ess2-pin', { type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off', 'aria-label': 'الرقم السري PIN', placeholder: '••••••' });
      const submit = () => {
        if (inp.value === '123456') { m.close(true); return; }
        fails++; SA.audit('HR.ESS.LOGIN_FAILED', { target: { type: 'action', id: o.key || 'pin', label: o.title }, result: 'failure', reason: 'PIN خاطئ' });
        if (fails >= 3) { m.close(false); SA.toast('PIN خاطئ 3 مرات — اتلغت العملية. كلّم HR.', 'error'); return; }
        err.hidden = false; err.textContent = 'الرقم السري غلط. متبقي ' + (3 - fails) + (3 - fails === 1 ? ' محاولة' : ' محاولات'); inp.value = ''; inp.focus();
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      const m = SA.modal({ title: o.title || 'اكتب الرقم السري (PIN)', icon: 'lock', size: 'sm', body: h('div.sap-confirm', {}, h('p', {}, o.text || 'العملية دي سرية. اكتب الـPIN بتاعك.'), h('label.field', {}, h('span.label', {}, 'الرقم السري'), inp, err), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'تجريبي: الـPIN هو ', h('code', {}, '123456')))), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(false) }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: submit }, SA.icon('check', 'icon-sm'), o.confirmLabel || 'تأكيد')] });
      m.closed.then((r) => resolve(!!r));
    });
  }
  /** Employee picker for accounts without an employee file (owner/GM…): read-only preview of ESS/MSS. */
  function previewPicker(forMss) {
    const list = L('employees').filter((e) => e.status !== 'terminated' && (!forMss || team(e).length));
    const sel = SA.form.field({ name: 'e', label: forMss ? 'اعرض «فريقي» كمشرف' : 'اعرض «خدماتي» كموظف', type: 'select', options: [['', 'اختر…']].concat(list.map((e) => [e.id, e.name + ' — ' + e.empNo])) });
    return h('div.sap-ess2-card', {}, h('h2', {}, 'معاينة بدون ملف موظف'), h('p.sap-ess2-note', {}, 'حسابك مش مرتبط بملف موظف، فالشاشة دي تُعرض للمعاينة فقط (قراءة فقط ولا تنفيذ إجراءات). اختر موظفًا لتشوف تجربته.'), sel.el, SA.btn({ label: 'عرض المعاينة', icon: 'eye', onClick: () => { if (!sel.get()) { sel.error('اختر موظفًا'); return; } store.set(forMss ? 'prevMss' : 'prevEss', sel.get()); SA.router.refresh(); } }));
  }
  function previewBar(w, forMss) {
    return w.preview ? banner('info', 'eye', h('b', {}, 'وضع المعاينة — ' + w.emp.name + '. '), 'قراءة فقط. ', h('button.sap-linkbtn', { type: 'button', onclick: () => { store.set(forMss ? 'prevMss' : 'prevEss', null); SA.router.refresh(); } }, 'تغيير الموظف')) : null;
  }
  function allRequests(e) {
    const out = [];
    L('leaveRequests').filter((r) => r.employeeId === e.id).forEach((r) => out.push({ key: 'LV:' + r.id, id: r.id, kind: 'leave', icon: 'clipboard', title: 'إجازة ' + (LEAVE_T[r.type] || r.type) + ' — ' + r.days + ' ' + (r.days === 1 ? 'يوم' : 'أيام'), sub: fdate(r.from) + (r.to !== r.from ? ' ← ' + fdate(r.to) : ''), status: r.status === 'pending' && r.stage === 'hr' ? 'at_hr' : r.status, at: r.createdAt, rec: r, approvalId: r.approvalId }));
    L('loans').filter((r) => r.employeeId === e.id && r.kind === 'advance').forEach((r) => out.push({ key: 'LN:' + r.id, id: r.id, kind: 'advance', icon: 'coins', title: 'سلفة ' + SA.fmt.money(r.amount), sub: r.reason || 'طلب سلفة', status: r.status === 'requested' ? 'pending' : r.status === 'approved' || r.status === 'active' ? 'approved' : r.status, at: r.requestedAt, rec: r, approvalId: r.approvalId }));
    L('docRequests').filter((r) => r.employeeId === e.id).forEach((r) => out.push({ key: 'DQ:' + r.id, id: r.id, kind: 'doc', icon: 'doc', title: DOC_T[r.docType] || 'مستند', sub: 'الغرض: ' + r.purpose, status: r.status, at: r.createdAt, rec: r, approvalId: r.approvalId }));
    L('essRequests').filter((r) => r.employeeId === e.id).forEach((r) => out.push({ key: 'ES:' + r.id, id: r.id, kind: r.kind, icon: (KIND_T[r.kind] || [0, 'inbox'])[1], title: r.title, sub: r.onBehalf ? 'أُدخل بالنيابة — ' + r.onBehalf.byName : (KIND_T[r.kind] || [r.kind])[0], status: r.status, at: r.createdAt, rec: r, approvalId: r.approvalId }));
    L('essQueue').filter((r) => r.employeeId === e.id && r.status !== 'synced').forEach((r) => out.push({ key: 'Q:' + r.id, id: r.id, kind: 'draft', icon: 'upload', title: r.label, sub: r.status === 'conflict' ? (r.note || 'تعارض') : 'مسودة محفوظة على جهازك', status: r.status, at: r.createdAtClient, rec: r }));
    return out.sort((a, b) => new Date(b.at) - new Date(a.at));
  }
  const reqChip = (s) => (s === 'at_hr' ? SA.chip('عند HR', 'info') : chipOf(s));
  function chainTimeline(apId) {
    const ap = apId ? st.find('approvals', apId) : null; if (!ap) return h('p.sap-ess2-note', {}, 'لا يوجد مسار اعتماد لهذا الطلب.');
    const ST = { approved: ['وافق', 'success'], pending: ['دوره الآن', 'warning'], waiting: ['بانتظار الخطوة السابقة', 'neutral'], rejected: ['رفض', 'danger'], skipped: ['لم يُنفَّذ', 'neutral'] };
    return h('ol.timeline', {}, ap.chain.map((s) => { const m = ST[s.status] || [s.status, 'neutral']; return h('li', {}, h('div', {}, h('b', {}, s.label), ' ', SA.chip(m[0], m[1]), s.decidedBy ? h('div', {}, h('small.t-muted', {}, SA.userName(s.decidedBy) + ' · ' + SA.fmt.dt(s.decidedAt) + (s.reason ? ' — «' + s.reason + '»' : ''))) : null)); }));
  }

  /* ═════════════════════════════ ESS — خدماتي ═════════════════════════════ */
  const ESS = {};
  const revealed = new Set();
  const isShared = () => store.get('device') === 'shared';
  const inPhone = () => store.get('frame') === '1';
  const sharedTtl = () => parseInt(store.get('ttl'), 10) || 300; /* 5 دقائق خمول — UC-ESS-02 (القيمة {Open}) */
  const greeting = () => (new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير');
  const mask = () => h('span.num.sap-ess2-mask', { 'aria-label': 'مخفي' }, '••••••');
  const head = (X, title, sub, backTo) => h('div.sap-ess2-head', {}, backTo === false ? null : h('button.sap-ess2-back', { type: 'button', onclick: () => X.go(backTo || 'home') }, SA.icon('arrowright', 'icon-sm'), 'رجوع'), h('div', {}, h('h1.sap-ess2-h1', {}, title), sub ? h('p.sap-ess2-sub', {}, sub) : null));
  const tile = (icon, title, sub, onClick, o) => { o = o || {}; return h('button.sap-ess2-tile' + (o.alert ? '.is-alert' : ''), { type: 'button', onclick: onClick }, h('span.sap-ess2-ico', {}, SA.icon(icon)), h('b', {}, title), sub ? h('small', {}, sub) : null, o.badge ? h('span.sap-ess2-badge', { 'aria-label': o.badge + ' عنصر' }, o.badge) : null); };
  const rowBtn = (icon, title, sub, right, onClick) => h(onClick ? 'button.sap-ess2-row' : 'div.sap-ess2-row', onClick ? { type: 'button', onclick: onClick } : {}, h('span.sap-ess2-ico', {}, SA.icon(icon)), h('div', {}, h('b', {}, title), sub ? h('small', {}, sub) : null), right || null);
  const myPending = (e) => allRequests(e).filter((r) => ['pending', 'requested', 'at_hr', 'queued', 'pending_peer', 'scheduled'].indexOf(r.status) >= 0).length;
  const unackCount = (e) => L('policyDocs').filter((p) => !L('acknowledgements').some((a) => a.employeeId === e.id && a.docId === p.id && a.docVersion === p.version)).length;

  /* ── check-in / check-out (simulated geofence, writes a real attendance punch) ── */
  async function doPunch(X, dir) {
    const lock = previewReason(X.w) || (SA.sim.offline ? 'التسجيل من خدماتي يحتاج اتصالًا (وقت الخادم). استخدم الكشك — بيحفظ البصمة ويزامنها لما الاتصال يرجع.' : '');
    if (lock) { SA.toast(lock, 'warn'); return; }
    const e = X.emp; const t = hm(new Date()); const code = shiftOn(e, today()); let geo = 'in';
    const warns = []; if (outsideShift(code, t)) warns.push('الوقت الآن خارج ورديتك (' + shiftTxt(code) + '). التسجيل هيتم وهيتنبّه المشرف.');
    const seg = SA.segmented([['in', 'داخل نطاق المصنع'], ['out', 'خارج النطاق']], 'in', (v) => { geo = v; });
    const r = await SA.confirm({ title: dir === 'in' ? 'تسجيل حضور' : 'تسجيل انصراف', icon: 'clock', text: 'الساعة الآن ' + t + '. الموقع بيتقرأ مرة واحدة فقط ولا يُتتبَّع.', warnings: warns, extra: h('div', {}, h('span.label', {}, 'الموقع (محاكاة)'), seg), confirmLabel: dir === 'in' ? 'سجّل حضوري' : 'سجّل انصرافي', note: 'هتتسجّل البصمة باسمك مع الوقت والمصدر.' });
    if (!r.ok) return;
    const out = await run(() => { const x = applyPunch(e.id, dir, 'mobile', null, geo === 'out' ? { geo: 'outside', flag: 'review' } : { geo: 'inside' }); if (x.ok) SA.audit('HR.ATTENDANCE.PUNCH_MOBILE', { target: { type: 'attendance', id: e.id + ' · ' + today(), label: (dir === 'in' ? 'حضور' : 'انصراف') + ' — ' + e.name }, after: { dir, time: x.time, status: x.status || null, geo }, via: via() }); return x; });
    if (!out.ok) return; const x = out.r;
    if (x.dup) SA.toast('البصمة مسجّلة قبل كده اليوم.', 'info');
    else if (x.noIn) SA.toast('لازم تسجّل الحضور الأول.', 'warn');
    else if (dir === 'in') SA.toast(x.late ? 'تم تسجيل حضورك ' + x.time + ' — متأخر عن الوردية' : 'تم تسجيل حضورك الساعة ' + x.time, x.late || geo === 'out' ? 'warn' : 'success');
    else SA.toast('تم تسجيل انصرافك الساعة ' + x.time + ' — عملت ' + x.hours.toFixed(1) + ' ساعة', 'success');
  }

  /* ── home ── */
  ESS.home = { deps: ['attendance', 'leaveRequests', 'essRequests', 'docRequests', 'loans', 'notifications', 'acknowledgements', 'essQueue'], render(box, X) {
    const e = X.emp; const t = today(); const code = shiftOn(e, t); const rec = todayRec(e.id); const lv = leaveOn(e.id, t); const def = SHIFT_DEF[code];
    const pend = myPending(e); const unread = SA.notifications.unread(); const acks = unackCount(e);
    let state, chip;
    if (lv) { state = h('p', {}, 'أنت في إجازة اليوم. استمتع بيومك.'); chip = SA.chip('في إجازة', 'info'); }
    else if (code === 'rest') { state = h('p', {}, 'اليوم راحة أسبوعية.'); chip = SA.chip('راحة', 'neutral'); }
    else if (rec && rec.in && rec.out) { state = h('p', {}, 'تم تسجيل حضورك ', dirLtr(rec.in), ' وانصرافك ', dirLtr(rec.out), '. تسلم إيدك.'); chip = SA.chip('انتهت الوردية', 'success'); }
    else if (rec && rec.in) { state = h('p', {}, 'تم تسجيل حضورك الساعة ', dirLtr(rec.in), rec.status === 'late' ? ' (متأخر)' : '', '.'); chip = SA.chip(rec.status === 'late' ? 'متأخر' : 'حاضر', rec.status === 'late' ? 'warning' : 'success'); }
    else { state = h('p', {}, 'لسه ما سجّلتش حضورك اليوم.'); chip = SA.chip('لم تسجّل بعد', 'warning'); }
    const canPunch = !lv && code !== 'rest' && !(rec && rec.in && rec.out);
    const lockR = previewReason(X.w);
    box.append(
      h('div.sap-ess2-greet', {}, h('h1', {}, greeting() + ' يا ' + firstName(e.name)), h('span.sap-ess2-sub', {}, e.empNo + ' · ' + deptName(e.departmentId) + (posTitle(e) ? ' · ' + posTitle(e) : ''))),
      offBanner(), previewBar(X.w),
      h('section.sap-ess2-hero', { 'aria-label': 'ورديتك اليوم' }, h('div', {}, h('small', {}, 'ورديتك اليوم'), h('h2', {}, code === 'rest' ? 'راحة أسبوعية' : shiftName(code)), def ? h('span.sap-ess2-time', {}, def.from + ' – ' + def.to) : null, h('div', {}, h('small', {}, deptName(e.departmentId) + ' · الورديات تجريبية (HR-09)'))), h('div', {}, chip), state,
        canPunch ? SA.btn({ label: rec && rec.in ? 'سجّل انصرافي' : 'سجّل حضوري', icon: 'finger', kind: 'accent', size: 'lg', reason: lockR, onClick: () => doPunch(X, rec && rec.in ? 'out' : 'in') }) : null),
      pend ? h('button.sap-ess2-row', { type: 'button', onclick: () => X.go('requests') }, h('span.sap-ess2-ico', {}, SA.icon('inbox')), h('div', {}, h('b', {}, 'عندك ' + pend + (pend === 1 ? ' طلب' : ' طلبات') + ' بانتظار الرد'), h('small', {}, 'اضغط لمتابعة الحالة')), SA.icon('chevron', 'icon-flip')) : null,
      h('div.sap-ess2-tiles', {}, tile('calendar', 'وردتي', 'جدولك الأسبوعي وتبديل وردية', () => X.go('shifts')), tile('coins', 'مرتبي', 'مفردة المرتب (سرية)', () => X.go('payslips')), tile('clipboard', 'إجازتي', 'رصيدك وطلب إجازة', () => X.go('leave')), tile('inbox', 'طلباتي', 'متابعة كل طلباتك ومستنداتك', () => X.go('requests'), { badge: pend || null }), tile('alert', 'بلّغ مشكلة', 'إصابة أو خطر أو شبه حادث', () => X.go('report'), { alert: true })),
      h('div.sap-ess2-mini', {}, h('button', { type: 'button', onclick: () => X.go('attendance') }, SA.icon('clock'), 'حضوري'), h('button', { type: 'button', onclick: () => X.go('profile') }, SA.icon('user'), 'بياناتي'), h('button', { type: 'button', onclick: () => X.go('acks') }, SA.icon('doc'), 'إقراراتي' + (acks ? ' (' + acks + ')' : '')), h('button', { type: 'button', onclick: () => X.go('inbox') }, SA.icon('bell'), 'الإشعارات' + (unread ? ' (' + unread + ')' : ''))));
  } };

  /* ── وردتي ── */
  ESS.shifts = { deps: ['attendance', 'leaveRequests', 'essRequests'], render(box, X) {
    const e = X.emp; const t = today(); let off = X.arg === 'next' ? 7 : 0;
    const start = addDays(t, -dayIdx(t) + off);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    box.append(head(X, 'وردتي', 'جدولك الأسبوعي — الورديات تجريبية ومصدرها HR-09'), offBanner(), previewBar(X.w),
      SA.segmented([['now', 'هذا الأسبوع'], ['next', 'الأسبوع الجاي']], X.arg === 'next' ? 'next' : 'now', (v) => X.go('shifts', v === 'next' ? 'next' : '')));
    const list = h('div.sap-ess2-week', {});
    days.forEach((d) => {
      const code = shiftOn(e, d); const lv = leaveOn(e.id, d); const swap = L('essRequests').find((r) => r.kind === 'shift_swap' && r.employeeId === e.id && r.data && r.data.date === d && ['pending', 'approved'].indexOf(r.status) >= 0);
      const canSwap = d > t && code !== 'rest' && !lv && !swap;
      list.append(h('div.sap-ess2-day' + (d === t ? '.is-today' : ''), {}, h('div.sap-ess2-dn', {}, DAYN[dayIdx(d)], h('div', {}, h('small.sap-ess2-note', {}, fdate(d)))),
        h('div', {}, lv ? h('b', {}, 'إجازة') : h('b', {}, shiftName(code)), h('div', {}, h('small.num', {}, lv ? 'موافق عليها' : code === 'rest' ? 'راحة أسبوعية' : shiftTxt(code) + ' · ' + deptName(e.departmentId)))),
        d === t ? SA.chip('اليوم', 'info') : null, swap ? chipOf(swap.status === 'approved' ? 'approved' : 'pending_peer') : null,
        canSwap ? SA.btn({ label: 'بدّل', icon: 'swap', kind: 'ghost', size: 'sm', reason: previewReason(X.w), onClick: () => swapSheet(X, d) }) : null));
    });
    box.append(list, h('p.sap-ess2-note', {}, 'التبديل بيتأكد آليًا من قواعد الراحة، وبيحتاج موافقة الزميل ثم المشرف. فحص المهارة {Open}.'));
  } };
  function swapSheet(X, date) {
    const e = X.emp; const mates = L('employees').filter((x) => x.departmentId === e.departmentId && x.id !== e.id && x.status === 'active');
    const f = SA.form.field({ name: 'peer', label: 'مين زميلك؟', type: 'select', required: true, options: [['', 'اختر زميلًا…']].concat(mates.map((x) => [x.id, x.name + ' — ' + shiftName(shiftOn(x, date))])) });
    let reason = 'ظرف عائلي'; const R = ['ظرف عائلي', 'ظرف صحي', 'مشوار شخصي', 'أخرى'];
    const m = SA.modal({ title: 'تبديل وردية يوم ' + DAYN[dayIdx(date)] + ' ' + fdate(date), icon: 'swap', size: 'sm', body: h('div.sap-confirm', {}, h('p', {}, 'ورديتك دلوقتي: ', h('b', {}, shiftName(shiftOn(e, date)))), f.el, h('span.label', {}, 'السبب'), chipSet(R.map((x) => [x, x]), reason, (v) => { reason = v; })),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'إرسال طلب التبديل', icon: 'check', kind: 'primary', onClick: async () => {
        if (!f.validate()) return; const peer = empById(f.get()); const mine = shiftOn(e, date), theirs = shiftOn(peer, date);
        if (mine === theirs) { f.error('نفس الوردية — مفيش داعي للتبديل'); return; }
        if (leaveOn(peer.id, date)) { f.error('الزميل ده في إجازة اليوم ده'); return; }
        if (theirs === 'rest') { f.error('رفض آلي: ده يوم راحة الزميل — قاعدة الراحة الأسبوعية'); return; }
        if (offReason()) { SA.toast('طلب التبديل يحتاج اتصالًا.', 'warn'); return; }
        m.setBusy(true); const o = await run(() => { const mr = managerRole(e); const rec = createEssRequest(e, 'shift_swap', 'تبديل وردية ' + fdate(date) + ' مع ' + peer.name, { date, peerId: peer.id, peerConsent: 'pending', reason }, [mr || hrStep('HR — مراجعة')], { ctx: [['اليوم', fdate(date)], ['الزميل', peer.name], ['السبب', reason], ['موافقة الزميل', 'بانتظار']] }); SA.audit('HR.ESS.REQUEST_SUBMITTED', { target: { type: 'shift_swap', id: rec.id, label: rec.title }, after: { date, peer: peer.name }, reason, via: via() }); return rec; });
        m.setBusy(false); if (o.ok) { m.close(); SA.toast('تم إرسال طلب التبديل — بانتظار موافقة زميلك ثم مشرفك', 'success'); }
      } })] });
  }

  /* ── مرتبي ── */
  function payslipList(e) {
    if (!e.salary) return [];
    const run0 = L('payrollRuns')[0]; const cur = run0 ? run0.period : '2026-10';
    const prev = (p, n) => { const a = p.split('-').map(Number); const d = new Date(a[0], a[1] - 1 - n, 1); return d.getFullYear() + '-' + p2(d.getMonth() + 1); };
    const label = (p) => { const a = p.split('-').map(Number); return MON[a[1] - 1] + ' ' + a[0]; };
    const rows = [{ period: cur, status: run0 && run0.status === 'released' ? 'published' : 'pending' }].concat([1, 2, 3].map((n) => ({ period: prev(cur, n), status: 'published' })));
    return rows.map((r) => Object.assign(r, { id: 'PAY-' + r.period + '-' + String(e.empNo).slice(-4), label: label(r.period), basic: e.salary.basic, allowances: e.salary.allowances }));
  }
  ESS.payslips = { deps: ['payrollRuns'], render(box, X) {
    const e = X.emp; const list = payslipList(e); const sel = X.arg ? list.find((p) => p.period === X.arg) : null;
    if (sel) return payslipDetail(box, X, sel);
    box.append(head(X, 'مرتبي', 'مفردات مرتبك — سرية: الأرقام مخفية لحد ما تضغط «إظهار»'), previewBar(X.w), offBanner());
    if (!list.length) { box.append(SA.empty({ icon: 'coins', title: 'لا توجد مفردة منشورة بعد', text: 'أول ما HR تنشر مفردة مرتبك هتظهر هنا.' })); return; }
    box.append(h('div.sap-ess2-list', {}, list.map((p) => rowBtn('receipt', p.label, p.status === 'published' ? 'مفردة منشورة · ' + p.id : 'قيد التجهيز — لم تُنشر بعد', p.status === 'published' ? h('span.sap-ess2-secret', {}, SA.icon('lock', 'icon-sm'), 'سري') : SA.chip('قيد التجهيز', 'warning'), p.status === 'published' ? () => X.go('payslips', p.period) : () => SA.toast('المفردة لسه ما اتنشرتش. بتظهر بعد إطلاق كشف المرتبات.', 'info')))),
      h('p.sap-ess2-note', {}, 'الأرقام بتظهر بعد ضغطك «إظهار» وكل اطلاع بيتسجّل. على الجهاز المشترك لازم PIN في كل مرة.'));
  } };
  function payslipDetail(box, X, p) {
    const e = X.emp; const shown = revealed.has(p.id); const gross = (p.basic || 0) + (p.allowances || 0);
    const val = (v) => (shown ? h('b.num', {}, SA.fmt.money(v)) : mask());
    box.append(head(X, 'مفردة ' + p.label, p.id, 'payslips'), previewBar(X.w), offBanner(),
      h('div.sap-ess2-card', {}, h('div.sap-ess2-foot', {}, h('span.sap-ess2-secret', {}, SA.icon('lock', 'icon-sm'), 'سري — T3'), shown ? SA.btn({ label: 'إخفاء الأرقام', icon: 'eyeoff', kind: 'ghost', onClick: () => { revealed.delete(p.id); SA.router.refresh(); } }) : SA.btn({ label: isShared() ? 'إظهار (PIN)' : 'إظهار الأرقام', icon: 'eye', kind: 'primary', size: 'lg', reason: previewReason(X.w), onClick: async () => {
          if (isShared() && !(await askPin({ title: 'اكتب الـPIN لإظهار المفردة', text: 'ده جهاز مشترك — لازم PIN في كل مرة.', key: 'payslip' }))) return;
          revealed.add(p.id); SA.audit('HR.ESS.PAYSLIP_VIEWED', { target: { type: 'payslip', id: p.id, label: 'مفردة ' + p.label + ' — ' + e.name }, reason: 'اطلاع ذاتي', via: via() }); SA.router.refresh(); } })),
        h('div.sap-ess2-pay', {}, h('span', {}, 'الأساسي'), val(p.basic)), h('div.sap-ess2-pay', {}, h('span', {}, 'البدلات'), val(p.allowances)),
        h('div.sap-ess2-pay', {}, h('span', {}, 'الأوفرتايم'), SA.openValue('غير مُعدّ')), h('div.sap-ess2-pay', {}, h('span', {}, 'الإجمالي قبل الخصومات'), val(gross)),
        h('div.sap-ess2-pay', {}, h('span', {}, 'التأمينات والضريبة والخصومات'), SA.openValue('تُحسب بعد إعداد [Law]')), h('div.sap-ess2-pay', {}, h('span', {}, 'الصافي'), SA.openValue('غير مُعدّ')),
        h('p.sap-ess2-note', {}, 'بيانات تجريبية. الاستقطاعات والصافي قيم قانونية (Open) ولا تُخترع قبل اعتماد إعدادات التأمينات والضريبة.')),
      h('div.sap-ess2-foot', {}, SA.btn({ label: 'تحميل PDF الرسمي', icon: 'download', kind: 'ghost', reason: 'الملف الرسمي بالختم يصدر من مستندات HR (HR-29) — Pending.' }), SA.btn({ label: 'ابعت استفسار لـHR', icon: 'info', kind: 'ghost', reason: previewReason(X.w) || offReason(), onClick: () => querySheet(X, p) })));
  }
  function querySheet(X, p) {
    const e = X.emp; const f = SA.form.field({ name: 'q', label: 'اكتب استفسارك (من غير أرقام المرتب)', type: 'textarea', required: true, rules: [SA.form.rules.min(5)] });
    const m = SA.modal({ title: 'استفسار عن مفردة ' + p.label, icon: 'info', size: 'sm', body: h('div.sap-confirm', {}, f.el, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الاستفسار بيوصل HR كطلب، وممنوع كتابة الأرقام السرية في الإشعارات.'))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'إرسال', icon: 'check', onClick: async () => { if (!f.validate()) return; m.setBusy(true); const o = await run(() => { const rec = createEssRequest(e, 'payslip_query', 'استفسار عن مفردة ' + p.label, { period: p.period, text: f.get() }, [hrStep('HR — الرد على الاستفسار')], { ctx: [['المفردة', p.label], ['الاستفسار', f.get()]] }); SA.audit('HR.ESS.REQUEST_SUBMITTED', { target: { type: 'payslip_query', id: rec.id, label: rec.title }, via: via() }); return rec; }); m.setBusy(false); if (o.ok) { m.close(); SA.toast('تم إرسال استفسارك لـHR', 'success'); } } })] });
  }

  /* ── إجازتي ── */
  function balanceCards(e) {
    return h('div.sap-ess2-bal', {}, [['annual', 'سنوية'], ['casual', 'عارضة'], ['sick', 'مرضية']].map((t) => { const b = balanceOf(e.id, t[0]); return h('div', {}, b ? h('b.num', {}, b.balanceDays) : h('b', {}, '—'), h('span', {}, t[1] + (b ? ' (يوم)' : ' — غير مُعدّ'))); }));
  }
  function rangeCalendar(state, onChange) {
    const el = h('div.sap-ess2-cal'); const t = today(); let view = new Date((state.from || t) + 'T12:00:00'); view.setDate(1);
    function draw() {
      SA.clear(el); const y = view.getFullYear(), mo = view.getMonth(); const first = ymd(view); const lead = dayIdx(first); const dim = new Date(y, mo + 1, 0).getDate();
      el.append(h('div.sap-ess2-cal-head', {}, h('button.btn.btn-ghost.btn-icon', { type: 'button', 'aria-label': 'الشهر السابق', onclick: () => { view.setMonth(mo - 1); draw(); } }, SA.icon('chevron')), h('b', {}, MON[mo] + ' ' + y), h('button.btn.btn-ghost.btn-icon', { type: 'button', 'aria-label': 'الشهر التالي', onclick: () => { view.setMonth(mo + 1); draw(); } }, SA.icon('chevron', 'icon-flip'))));
      const g = h('div.sap-ess2-cal-grid', { role: 'grid' }); ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'].forEach((n) => g.append(h('div.sap-ess2-cal-dn', {}, n)));
      for (let i = 0; i < lead; i++) g.append(h('span.sap-ess2-cal-d.is-off', { 'aria-hidden': 'true' }));
      for (let d = 1; d <= dim; d++) {
        const ds = y + '-' + p2(mo + 1) + '-' + p2(d); const edge = ds === state.from || ds === state.to; const inr = state.from && state.to && ds > state.from && ds < state.to;
        g.append(h('button.sap-ess2-cal-d' + (isFri(ds) ? '.is-fri' : '') + (ds === t ? '.is-today' : '') + (edge ? '.is-edge' : inr ? '.is-in' : ''), { type: 'button', 'aria-pressed': String(edge || !!inr), 'aria-label': DAYN[dayIdx(ds)] + ' ' + fdate(ds) + (isFri(ds) ? ' — راحة' : ''), onclick: () => {
          if (!state.from || (state.from && state.to)) { state.from = ds; state.to = null; } else if (ds < state.from) { state.to = state.from; state.from = ds; } else state.to = ds;
          onChange(state); draw();
        } }, String(d)));
      }
      el.append(g, h('div.sap-ess2-legend', {}, h('span', {}, h('i', { style: 'background:var(--eg-navy)' }), 'بداية/نهاية'), h('span', {}, h('i', { style: 'background:var(--eg-navy-tint)' }), 'المدة'), h('span', {}, h('i', { style: 'background:#e6e8ed' }), 'الجمعة — راحة (لا تُخصم)'), h('span', {}, 'العطلات الرسمية: غير مُعدّة')));
    }
    draw(); return el;
  }
  ESS.leave = { deps: ['leaveRequests', 'leaveBalances', 'essQueue'], render(box, X) {
    const e = X.emp;
    if (X.arg === 'new') return leaveWizard(box, X);
    box.append(head(X, 'إجازتي', 'رصيدك الحالي وطلباتك'), previewBar(X.w), offBanner(), h('div.sap-ess2-card', {}, h('h2', {}, 'رصيدك'), balanceCards(e), h('p.sap-ess2-note', {}, 'الرصيد تجريبي — قواعد الاستحقاق {Law/Open} من HR-11.')),
      bigBtn('اطلب إجازة', 'plus', 'primary', () => X.go('leave', 'new'), previewReason(X.w)));
    const mine = L('leaveRequests').filter((r) => r.employeeId === e.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    box.append(h('h2.sap-ess2-sub', { style: 'margin:6px 0 0;font-weight:800;color:var(--eg-navy-deep)' }, 'طلباتي للإجازة'), mine.length ? h('div.sap-ess2-list', {}, mine.map((r) => rowBtn('clipboard', 'إجازة ' + LEAVE_T[r.type] + ' — ' + r.days + ' ' + (r.days === 1 ? 'يوم' : 'أيام'), fdate(r.from) + (r.to !== r.from ? ' ← ' + fdate(r.to) : ''), reqChip(r.status === 'pending' && r.stage === 'hr' ? 'at_hr' : r.status), () => openRequest(X, { kind: 'leave', rec: r, id: r.id, approvalId: r.approvalId, title: 'إجازة ' + LEAVE_T[r.type], status: r.status })))) : SA.empty({ icon: 'clipboard', title: 'لا توجد طلبات إجازة', text: 'اضغط «اطلب إجازة» لتبدأ.' }));
  } };
  function leaveWizard(box, X) {
    const e = X.emp; const S = { step: 1, type: 'annual', from: null, to: null, reason: '', attach: false };
    const host = h('div.sap-ess2', { style: 'gap:14px' }); box.append(host);
    const stepsBar = () => h('div.sap-ess2-steps', { 'aria-label': 'خطوة ' + S.step + ' من 3' }, [1, 2, 3].map((n) => h('i', { class: n <= S.step ? 'is-on' : '' })));
    function calc() { const days = S.from && S.to ? countDays(S.from, S.to) : 0; const b = balanceOf(e.id, S.type); return { days, b, after: b ? b.balanceDays - days : null }; }
    function draw() {
      SA.clear(host);
      host.append(head({ go: () => (S.step > 1 ? ((S.step--), draw()) : X.go('leave')) }, ['', 'اختر نوع الإجازة', 'اختر الأيام', 'راجع وأرسل'][S.step], 'الخطوة ' + S.step + ' من 3', 'x'), stepsBar(), offBanner(), previewBar(X.w));
      if (S.step === 1) {
        host.append(choiceGrid([{ id: 'annual', icon: 'calendar', label: 'سنوية', sub: balSub('annual') }, { id: 'casual', icon: 'bolt', label: 'عارضة', sub: balSub('casual') }, { id: 'sick', icon: 'health', label: 'مرضية', sub: balSub('sick') }, { id: 'unpaid', icon: 'minus', label: 'بدون أجر', sub: 'بموافقة HR' }], S.type, (v) => { S.type = v; }), h('div.sap-ess2-foot', {}, h('span'), bigBtn('التالي', 'chevron', 'primary', () => { S.step = 2; draw(); })));
        host.querySelectorAll('.sap-ess2-foot .icon')[0] && host.querySelectorAll('.sap-ess2-foot .icon')[0].classList.add('icon-flip');
      } else if (S.step === 2) {
        const sum = h('p.sap-ess2-sub', { 'aria-live': 'polite' }); const upd = () => { const c = calc(); sum.textContent = S.from ? (S.to ? 'من ' + fdate(S.from) + ' إلى ' + fdate(S.to) + ' — ' + c.days + ' يوم يُخصم' : 'البداية ' + fdate(S.from) + ' — اختر يوم النهاية') : 'اضغط يوم البداية ثم يوم النهاية'; nextBtn.disabled = !(S.from && S.to); };
        const nextBtn = h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => { const c = calc(); if (!c.days) { SA.toast('الأيام المختارة كلها جمعة/راحة — مفيش حاجة تتخصم.', 'warn'); return; } S.step = 3; draw(); } }, 'التالي');
        const cal = rangeCalendar(S, upd); host.append(cal, sum, h('div.sap-ess2-foot', {}, h('button.btn.btn-ghost', { type: 'button', onclick: () => { S.step = 1; draw(); } }, 'السابق'), nextBtn)); upd();
      } else {
        const c = calc(); const warns = []; const hardBlock = [];
        if (c.b && c.days > c.b.balanceDays && S.type !== 'unpaid') warns.push('رصيدك (' + c.b.balanceDays + ' يوم) مش كفاية. ممكن تحوّلها «بدون أجر» بموافقة HR.');
        if (!c.b && S.type !== 'unpaid') warns.push('رصيدك لسه غير مُعدّ من HR — HR هتراجع الرصيد قبل الموافقة.');
        if (S.type === 'casual' && c.days > 2) warns.push('الإجازة العارضة مينفعش تزيد عن يومين متتاليين — هتتراجع من HR.');
        const retro = S.from < today(); if (retro) warns.push('الإجازة بأثر رجعي — محتاجة موافقة HR وسبب مكتوب.');
        const clash = L('leaveRequests').find((r) => r.employeeId === e.id && (r.status === 'pending' || r.status === 'approved') && overlap(r, { from: S.from, to: S.to }));
        if (clash) hardBlock.push('عندك طلب إجازة تاني بنفس الأيام (' + clash.id + '). عدّل الأيام.');
        const rf = SA.form.field({ name: 'reason', label: retro ? 'السبب (مطلوب)' : 'ملاحظة (اختياري)', type: 'textarea', value: S.reason, rows: 2, required: retro, onInput: (v) => { S.reason = v; } });
        const af = S.type === 'sick' ? SA.form.field({ name: 'attach', label: 'أرفقت الشهادة الطبية (محاكاة)', type: 'checkbox', value: S.attach, onChange: (v) => { S.attach = v; } }) : null;
        host.append(h('div.sap-ess2-card', {}, h('div.sap-ess2-sum', {}, h('div', {}, h('b.num', {}, c.days), h('span', {}, 'يوم هيتخصم')), h('div', {}, h('b.num', {}, c.b ? c.b.balanceDays : '—'), h('span', {}, 'رصيدك الحالي')), h('div', {}, h('b.num', {}, c.after == null ? '—' : Math.max(c.after, 0)), h('span', {}, 'هيتبقى'))),
          h('p', {}, 'إجازة ', h('b', {}, LEAVE_T[S.type]), ' من ', h('b', {}, fdate(S.from)), ' إلى ', h('b', {}, fdate(S.to)), '.'), warns.map((w) => banner('warn', 'alert', w)), hardBlock.map((w) => banner('danger', 'xcircle', w)), rf.el, af ? af.el : null),
          h('div.sap-ess2-foot', {}, h('button.btn.btn-ghost', { type: 'button', onclick: () => { S.step = 2; draw(); } }, 'السابق'), SA.btn({ label: SA.sim.offline ? 'احفظ كمسودة' : 'إرسال الطلب', icon: 'check', kind: 'accent', size: 'lg', reason: previewReason(X.w) || (hardBlock[0] || ''), onClick: (ev, btn) => submit(c, retro, rf, af, btn) })));
      }
    }
    const balSub = (t) => { const b = balanceOf(e.id, t); return b ? 'رصيدك ' + b.balanceDays + ' يوم' : 'رصيد غير مُعدّ'; };
    async function submit(c, retro, rf, af, btn) {
      if (retro && !rf.validate()) return;
      if (S.type === 'sick' && af && !S.attach) { af.error('الإجازة المرضية تحتاج شهادة طبية'); return; }
      const payload = { employeeId: e.id, type: S.type, from: S.from, to: S.to, days: c.days, reason: S.reason, attach: S.attach, balanceAfter: c.after == null ? null : Math.max(c.after, 0) };
      btn.disabled = true;
      if (SA.sim.offline) { const qid = queueDraft('leave', payload, 'إجازة ' + LEAVE_T[S.type] + ' — ' + c.days + ' يوم (مسودة)'); btn.disabled = false; SA.toast('اتحفظت كمسودة (' + qid + ') وهتتبعت تلقائيًا لما الاتصال يرجع.', 'info', { ms: 6000 }); X.go('requests'); return; }
      const o = await run(() => createLeave(Object.assign({ emp: e }, payload))); btn.disabled = false; if (!o.ok) return; done(o.r);
    }
    function done(rec) {
      SA.clear(host); const mgr = empById(e.managerEmpId);
      host.append(h('div.sap-ess2-card.sap-ess2-done', {}, h('span.sap-ess2-ok', {}, SA.icon('check')), h('h2', {}, 'تم إرسال الطلب ' + (mgr ? 'لمشرفك' : 'لـHR')), h('p', {}, rec.id + ' · ' + 'إجازة ' + LEAVE_T[rec.type] + ' — ' + rec.days + ' ' + (rec.days === 1 ? 'يوم' : 'أيام')), chipOf('pending'), h('p.sap-ess2-note', {}, 'الحالة: بانتظار ' + (mgr ? mgr.name + ' (مشرفك)' : 'HR') + ' ثم مراجعة HR. زمن الرد المتوقع: خلال يوم عمل (قيمة تجريبية — Open).'), h('div.sap-ess2-foot', {}, bigBtn('طلباتي', 'inbox', 'primary', () => X.go('requests')), bigBtn('الرئيسية', 'home', 'ghost', () => X.go('home')))));
    }
    draw();
  }

  /* ── حضوري + «نسيت البصمة» ── */
  const monthClosed = (date) => { const per = date.slice(0, 7); const r = L('payrollRuns').find((x) => x.period === per); return !!r && ['finance_approved', 'gm_approved', 'released'].indexOf(r.status) >= 0; };
  ESS.attendance = { deps: ['attendance', 'leaveRequests', 'essRequests'], render(box, X) {
    const e = X.emp; const t = today(); const ym = t.slice(0, 7);
    const days = Array.from({ length: 8 }, (_, i) => addDays(t, -i));
    const recs = L('attendance').filter((a) => a.employeeId === e.id && a.date.slice(0, 7) === ym);
    const cnt = { present: 0, late: 0, absent: 0, leave: 0 }; recs.forEach((r) => { if (cnt[r.status] != null) cnt[r.status]++; });
    L('leaveRequests').filter((r) => r.employeeId === e.id && r.status === 'approved').forEach((r) => { for (let d = r.from, g = 0; d <= r.to && g < 60; d = addDays(d, 1), g++) if (d.slice(0, 7) === ym && d <= t && !isFri(d) && !recs.some((x) => x.date === d)) cnt.leave++; });
    box.append(head(X, 'حضوري', 'ملخص الشهر وآخر الأيام'), previewBar(X.w), offBanner(),
      h('div.sap-ess2-sum', {}, h('div', {}, h('b.num', {}, cnt.present), h('span', {}, 'حاضر')), h('div', {}, h('b.num', { style: 'color:var(--color-warning)' }, cnt.late), h('span', {}, 'متأخر')), h('div', {}, h('b.num', { style: 'color:var(--color-danger)' }, cnt.absent), h('span', {}, 'غائب')), h('div', {}, h('b.num', {}, cnt.leave), h('span', {}, 'إجازة'))));
    const list = h('div.sap-ess2-list', {});
    days.forEach((d) => {
      const rec = L('attendance').find((a) => a.employeeId === e.id && a.date === d); const lv = leaveOn(e.id, d); const fixes = L('essRequests').filter((r) => r.kind === 'attendance_fix' && r.employeeId === e.id && r.data && r.data.date === d);
      const issue = !lv && !isFri(d) && (!rec || !rec.in || (!rec.out && d < t) || rec.status === 'absent');
      let chip, sub;
      if (lv) { chip = SA.chip('إجازة', 'info'); sub = 'إجازة ' + LEAVE_T[lv.type]; } else if (isFri(d)) { chip = SA.chip('راحة', 'neutral'); sub = 'راحة أسبوعية'; }
      else if (!rec) { chip = SA.chip(d === t ? 'لم تسجّل بعد' : 'لا بصمة مسجّلة', d === t ? 'warning' : 'danger'); sub = 'لا يوجد سجل'; }
      else { chip = SA.chip({ present: 'حاضر', late: 'متأخر', absent: 'غائب', leave: 'إجازة' }[rec.status] || rec.status, { present: 'success', late: 'warning', absent: 'danger', leave: 'info' }[rec.status] || 'neutral'); sub = 'حضور ' + (rec.in || '—') + ' · انصراف ' + (rec.out || '—') + (rec.adjusted ? ' · مُصحَّح' : ''); }
      list.append(h('div.sap-ess2-row', {}, h('span.sap-ess2-ico', {}, SA.icon('clock')), h('div', {}, h('b', {}, DAYN[dayIdx(d)] + ' ' + fdate(d)), h('small.num', {}, sub), fixes.length ? h('div', {}, chipOf(fixes[0].status)) : null), chip, issue && d <= t && !fixes.some((f) => f.status === 'pending') ? SA.btn({ label: 'نسيت البصمة', icon: 'edit', kind: 'ghost', size: 'sm', reason: previewReason(X.w) || offReason(), onClick: () => fixSheet(X, d, rec) }) : null));
    });
    box.append(list);
  } };
  function fixSheet(X, date, rec) {
    const e = X.emp; if (monthClosed(date)) { SA.toast('الشهر مقفول للمرتبات — اطلب من HR.', 'warn'); return; }
    const code = shiftOn(e, date); const def = SHIFT_DEF[code] || SHIFT_DEF.day; let field = rec && rec.in && !rec.out ? 'out' : 'in'; let reason = 'نسيت'; const RS = ['نسيت', 'الجهاز عطلان', 'كنت في مهمة', 'أخرى'];
    const tf = SA.form.field({ name: 'time', label: 'الوقت الصحيح', type: 'text', value: field === 'in' ? def.from : def.to, required: true, hint: 'اكتب الوقت بصيغة 24 ساعة مثل 08:05', rules: [(v) => (/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v).trim()) ? null : 'اكتب الوقت بصيغة صحيحة مثل 08:05')] });
    const m = SA.modal({ title: 'تصحيح بصمة — ' + DAYN[dayIdx(date)] + ' ' + fdate(date), icon: 'clock', size: 'sm', body: h('div.sap-confirm', {}, h('span.label', {}, 'إيه اللي ناقص؟'), chipSet([['in', 'الحضور'], ['out', 'الانصراف']], field, (v) => { field = v; tf.set(v === 'in' ? def.from : def.to); }), tf.el, h('span.label', {}, 'السبب'), chipSet(RS.map((x) => [x, x]), reason, (v) => { reason = v; }), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الطلب بيروح لمشرفك للمراجعة. التصحيح مبيتنفّذش غير بعد موافقته.'))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'إرسال للمشرف', icon: 'check', onClick: async () => {
        if (!tf.validate()) return; const time = tf.get().trim().replace(/^(\d):/, '0$1:'); m.setBusy(true);
        const o = await run(() => { const mr = managerRole(e); const rec2 = createEssRequest(e, 'attendance_fix', 'تصحيح بصمة ' + (field === 'in' ? 'الحضور' : 'الانصراف') + ' — ' + fdate(date), { date, field, time, reason }, [mr || hrStep('HR — مراجعة')], { ctx: [['اليوم', fdate(date)], ['المطلوب', (field === 'in' ? 'حضور ' : 'انصراف ') + time], ['السبب', reason]] }); SA.audit('HR.ESS.REQUEST_SUBMITTED', { target: { type: 'attendance_fix', id: rec2.id, label: rec2.title }, after: { date, field, time }, reason, via: via() }); return rec2; });
        m.setBusy(false); if (o.ok) { m.close(); SA.toast('تم إرسال طلب التصحيح لمشرفك', 'success'); }
      } })] });
  }

  /* ── طلباتي + مستنداتي ── */
  function openRequest(X, r) {
    const rec = r.rec; const body = h('div.sap-confirm', {}, SA.kv([['رقم الطلب', dirLtr(r.id)], ['الحالة', reqChip(r.status)], ['النوع', r.title], ['وقت التقديم', SA.fmt.dt(rec.createdAt || rec.requestedAt || rec.createdAtClient)]].concat(r.kind === 'leave' ? [['الأيام', fdate(rec.from) + ' ← ' + fdate(rec.to) + ' (' + rec.days + ')'], ['سبب الطلب', rec.reason || '—']] : []).concat(rec.onBehalf ? [['بالنيابة', rec.onBehalf.byName + ' — ' + rec.onBehalf.reason]] : []).concat(rec.status === 'scheduled' || r.status === 'scheduled' ? [['يُنفَّذ بعد', SA.fmt.dt(rec.effectiveAt)]] : [])), h('h3', { style: 'margin:12px 0 6px;font-size:1rem' }, 'مسار الاعتماد'), chainTimeline(r.approvalId));
    const canCancel = ['pending', 'requested', 'at_hr', 'scheduled', 'queued'].indexOf(r.status) >= 0 && r.kind !== 'advance';
    const foot = [];
    if (r.kind === 'bank_change' && r.status === 'scheduled') foot.push(h('button.btn.btn-ghost', { type: 'button', onclick: () => { st.patch('essRequests', rec.id, { effectiveAt: new Date(Date.now() - 1000).toISOString() }); tickBank(); m.close(); SA.toast('محاكاة: مرّت مدة التأخير — اتنفّذ التغيير', 'info'); } }, 'محاكاة مرور 24 ساعة'));
    if (r.kind === 'doc' && r.status === 'issued') foot.push(SA.btn({ label: 'تحميل المستند', icon: 'download', kind: 'primary', onClick: () => { SA.download(r.id + '.txt', 'نموذج تجريبي — ' + r.title + '\nالموظف: ' + X.emp.name + '\nالغرض: ' + (rec.purpose || '') + '\n(المستند الرسمي بالختم يصدر من HR-29)', 'text/plain'); } }));
    if (canCancel) foot.push(SA.btn({ label: 'سحب الطلب', icon: 'x', kind: 'danger', reason: previewReason(X.w), onClick: async () => { const c = await SA.confirm({ title: 'سحب الطلب', text: 'متأكد إنك عايز تسحب «' + r.title + '»؟', danger: true, confirmLabel: 'اسحب الطلب' }); if (!c.ok) return; const o = await run(() => { if (r.kind === 'leave') st.patch('leaveRequests', rec.id, { status: 'cancelled' }); else if (r.kind === 'doc') st.patch('docRequests', rec.id, { status: 'cancelled' }); else if (r.kind === 'draft') st.patch('essQueue', rec.id, { status: 'synced', note: 'سُحبت' }); else st.patch('essRequests', rec.id, { status: 'cancelled' }); withdrawApproval(r.approvalId, 'سحبه مقدّم الطلب'); SA.audit(r.kind === 'leave' ? 'HR.LEAVE.REJECTED' : 'HR.ESS.REQUEST_SUBMITTED', { target: { type: r.kind, id: r.id, label: r.title }, after: { status: 'cancelled' }, reason: 'سحب الطلب بواسطة مقدّمه', via: via() }); }); if (o.ok) { m.close(); SA.toast('تم سحب الطلب', 'success'); } } }));
    const m = SA.drawer({ title: r.title, subtitle: r.id, size: 'md', body, foot });
  }
  ESS.requests = { deps: ['leaveRequests', 'essRequests', 'docRequests', 'loans', 'essQueue', 'approvals'], render(box, X) {
    const e = X.emp; tickBank(); const filt = X.arg || 'all'; const all = allRequests(e);
    const open = (r) => ['pending', 'requested', 'at_hr', 'queued', 'conflict', 'pending_peer', 'scheduled'].indexOf(r.status) >= 0;
    const rows = filt === 'open' ? all.filter(open) : filt === 'done' ? all.filter((r) => !open(r)) : all;
    box.append(head(X, 'طلباتي', 'كل طلباتك ومستنداتك في مكان واحد'), previewBar(X.w), offBanner(),
      h('div.sap-ess2-mini', {}, h('button', { type: 'button', onclick: () => docSheet(X) }, SA.icon('doc'), 'اطلب شهادة'), h('button', { type: 'button', onclick: () => advanceSheet(X) }, SA.icon('coins'), 'اطلب سلفة'), h('button', { type: 'button', onclick: () => ppeSheet(X) }, SA.icon('box'), 'طلب زي / عهدة'), h('button', { type: 'button', onclick: () => X.go('acks') }, SA.icon('check'), 'إقراراتي')),
      SA.segmented([['all', 'الكل'], ['open', 'بانتظار الرد'], ['done', 'منتهية']], filt, (v) => X.go('requests', v === 'all' ? '' : v)));
    const docs = all.filter((r) => r.kind === 'doc' && r.status === 'issued');
    if (docs.length) box.append(h('div.sap-ess2-card', {}, h('h2', {}, 'مستنداتي الجاهزة'), docs.map((d) => rowBtn('doc', d.title, 'جاهز للتحميل · ' + d.id, SA.chip('جاهز', 'success'), () => openRequest(X, d)))));
    box.append(rows.length ? h('div.sap-ess2-list', {}, rows.map((r) => rowBtn(r.icon, r.title, r.sub + ' · ' + SA.fmt.rel(r.at), reqChip(r.status), () => openRequest(X, r)))) : SA.empty({ icon: 'inbox', title: filt === 'open' ? 'مفيش طلبات معلّقة' : 'لا توجد طلبات', text: 'لما تقدّم طلب (إجازة، شهادة، سلفة…) هيظهر هنا مع حالته.' }));
  } };
  function docSheet(X) {
    const e = X.emp; let dt = 'salary_cert'; const pf = SA.form.field({ name: 'p', label: 'الغرض (جهة التقديم) — إلزامي', type: 'text', required: true, placeholder: 'مثال: بنك مصر — فتح حساب', rules: [SA.form.rules.min(3)] });
    const m = SA.modal({ title: 'اطلب مستند', icon: 'doc', size: 'sm', body: h('div.sap-confirm', {}, choiceGrid(Object.keys(DOC_T).map((k) => ({ id: k, icon: 'doc', label: DOC_T[k] })), dt, (v) => { dt = v; }), pf.el, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'HR Officer بيجهّزه وHR Manager بيوقّعه، وبعدها بتحمّله من هنا. كل مستند بيتسجّل صدر لمين ولماذا.'))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'إرسال الطلب', icon: 'check', reason: previewReason(X.w) || offReason(), onClick: async () => { if (!pf.validate()) return; m.setBusy(true); const o = await run(() => createDocRequest(e, dt, pf.get().trim())); m.setBusy(false); if (o.ok) { m.close(); SA.toast('تم إرسال طلب ' + DOC_T[dt] + ' — هيظهر لـHR فورًا', 'success'); } } })] });
  }
  function advanceSheet(X) {
    const e = X.emp; const af = SA.form.field({ name: 'a', label: 'المبلغ المطلوب (ج.م)', type: 'number', required: true, min: 1, rules: [(v) => (v > 0 && Number.isInteger(v) ? null : 'اكتب مبلغًا صحيحًا أكبر من صفر')] }); const rf = SA.form.field({ name: 'r', label: 'السبب', type: 'textarea', required: true, rows: 2, rules: [SA.form.rules.min(3)] });
    const open = L('loans').find((l) => l.employeeId === e.id && l.kind === 'advance' && ['requested', 'approved', 'active'].indexOf(l.status) >= 0);
    const m = SA.modal({ title: 'طلب سلفة', icon: 'coins', size: 'sm', body: h('div.sap-confirm', {}, open ? banner('warn', 'alert', 'عندك سلفة قائمة (' + open.id + '). طلب سلفة جديدة بتتراجع من HR.') : null, offReason() ? banner('danger', 'wifioff', offReason()) : null, af.el, rf.el, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'السلفة بتروح HR ثم المالية. الحد الأقصى وطريقة الخصم ', SA.openValue('غير مُعدّة'), '.'))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'إرسال طلب السلفة', icon: 'check', reason: previewReason(X.w) || offReason(), onClick: async () => { if (!SA.form.group([af, rf]).validate()) return; m.setBusy(true); const o = await run(() => createAdvance(e, af.get(), rf.get().trim())); m.setBusy(false); if (o.ok) { m.close(); SA.toast('تم إرسال طلب السلفة ' + o.r.id + ' — بانتظار HR', 'success'); } } })] });
  }
  function ppeSheet(X) {
    const e = X.emp; let item = 'خوذة'; const IT = ['خوذة', 'نظارة', 'قفازات', 'حذاء أمان', 'زي عمل'];
    const m = SA.modal({ title: 'طلب زي / معدات وقاية', icon: 'box', size: 'sm', body: h('div.sap-confirm', {}, chipSet(IT.map((x) => [x, x]), item, (v) => { item = v; }), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الطلب بيروح HR لتسليم العهدة.'))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'إرسال', icon: 'check', reason: previewReason(X.w) || offReason(), onClick: async () => { m.setBusy(true); const o = await run(() => { const rec = createEssRequest(e, 'ppe', 'طلب ' + item, { item }, [{ roleId: 'R-12', label: 'HR Officer — تسليم العهدة' }], { ctx: [['الصنف', item]] }); SA.audit('HR.ESS.REQUEST_SUBMITTED', { target: { type: 'ppe', id: rec.id, label: rec.title }, via: via() }); return rec; }); m.setBusy(false); if (o.ok) { m.close(); SA.toast('تم إرسال الطلب', 'success'); } } })] });
  }

  /* ── بياناتي + الحساب البنكي ── */
  ESS.profile = { deps: ['employees', 'essRequests'], render(box, X) {
    const e = X.emp; tickBank(); const prof = e.profile || {}; const mgr = empById(e.managerEmpId);
    const bankReq = L('essRequests').filter((r) => r.kind === 'bank_change' && r.employeeId === e.id && ['pending', 'scheduled'].indexOf(r.status) >= 0)[0];
    const reveal = SA.can('hr.pii.reveal');
    box.append(head(X, 'بياناتي', 'ملفك الوظيفي'), previewBar(X.w), offBanner(),
      h('div.sap-ess2-card', {}, h('h2', {}, 'البيانات الأساسية'), SA.kv([['الاسم', e.name + ' (لا يُعدَّل من هنا)'], ['الرقم الوظيفي', dirLtr(e.empNo)], ['القسم', deptName(e.departmentId)], ['الوظيفة', posTitle(e) || '—'], ['المدير المباشر', mgr ? mgr.name : '—'], ['تاريخ التعيين', fdate(e.hireDate)], ['الرقم القومي', h('span.num', { dir: 'ltr' }, '••••••••••' + (e.nationalIdLast4 || '••••'))]])),
      h('div.sap-ess2-card', {}, h('div.sap-ess2-foot', {}, h('h2', {}, 'بيانات التواصل'), SA.btn({ label: 'تعديل', icon: 'edit', kind: 'ghost', size: 'sm', reason: previewReason(X.w), onClick: () => contactSheet(X) })), SA.kv([['الهاتف', dirLtr(e.phone || '—')], ['العنوان', e.address || 'غير مُسجّل'], ['جهة الطوارئ', e.emergency ? e.emergency.name + ' — ' + e.emergency.phone : 'غير مُسجّلة']]), h('p.sap-ess2-note', {}, 'الهاتف والعنوان وجهة الطوارئ بتتعدّل مباشرة.')),
      h('div.sap-ess2-card', {}, h('div.sap-ess2-foot', {}, h('h2', {}, 'بيانات تحتاج موافقة HR'), SA.btn({ label: 'اطلب تعديل', icon: 'edit', kind: 'ghost', size: 'sm', reason: previewReason(X.w) || offReason(), onClick: () => profileChangeSheet(X) })), SA.kv([['الحالة الاجتماعية', prof.marital ? ({ single: 'أعزب/عزباء', married: 'متزوج/ة', other: 'أخرى' }[prof.marital] || prof.marital) : 'غير مُسجّلة'], ['عدد المُعالين', prof.dependents != null ? String(prof.dependents) : 'غير مُسجّل']])),
      h('div.sap-ess2-card', {}, h('div.sap-ess2-foot', {}, h('h2', {}, 'الحساب البنكي'), h('span.sap-ess2-secret', {}, SA.icon('lock', 'icon-sm'), 'سري')), SA.kv([['الحساب الحالي', h('span.num', { dir: 'ltr' }, 'EG•• •••• •••• •••• •••• ' + (e.bankLast4 || '••••'))]]),
        bankReq ? banner('info', 'clock', h('b', {}, bankReq.status === 'scheduled' ? 'تغيير الحساب مجدول — ' : 'طلب تغيير الحساب قيد المراجعة — '), bankReq.status === 'scheduled' ? 'هيتنفّذ بعد ' + SA.fmt.dt(bankReq.effectiveAt) + '. تقدر تلغيه قبلها من «طلباتي».' : 'شخص ثانٍ من HR بيراجعه وبعدين بيتنفّذ بعد مدة تأخير (24 ساعة — قيمة Open).') : null,
        SA.btn({ label: 'طلب تغيير الحساب البنكي', icon: 'coins', kind: 'ghost', reason: previewReason(X.w) || offReason() || (bankReq ? 'عندك طلب تغيير قائم' : ''), onClick: () => bankSheet(X) }),
        reveal ? null : h('p.sap-ess2-note', {}, 'الأرقام مقنّعة بالكامل. كشف الرقم كاملًا لـHR بصلاحية «hr.pii.reveal» وبيتسجّل.')));
  } };
  function contactSheet(X) {
    const e = X.emp; const em = e.emergency || {};
    const g = SA.form.group([SA.form.field({ name: 'phone', label: 'رقم الهاتف', type: 'tel', value: e.phone || '', required: true, rules: [SA.form.rules.phone] }), SA.form.field({ name: 'address', label: 'العنوان', type: 'text', value: e.address || '' }), SA.form.field({ name: 'en', label: 'اسم جهة الطوارئ', type: 'text', value: em.name || '' }), SA.form.field({ name: 'ep', label: 'هاتف جهة الطوارئ', type: 'tel', value: em.phone || '', rules: [SA.form.rules.phone] })]);
    const m = SA.modal({ title: 'تعديل بيانات التواصل', icon: 'user', size: 'sm', body: h('div.sap-confirm', {}, g.fields.map((f) => f.el)), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'حفظ', icon: 'check', reason: offReason(), onClick: async () => {
      if (!g.validate()) return; const v = g.get(); m.setBusy(true);
      const o = await run(() => { const before = { phone: e.phone, address: e.address || null, emergency: em.name ? em.name + ' — ' + em.phone : null }; st.patch('employees', e.id, { phone: v.phone.trim(), address: v.address.trim(), emergency: { name: v.en.trim(), phone: v.ep.trim() } }); SA.audit('HR.EMPLOYEE.UPDATED', { target: { type: 'employee', id: e.id, label: e.name }, before, after: { phone: v.phone, address: v.address, emergency: v.en ? v.en + ' — ' + v.ep : null }, reason: 'تحديث ذاتي من خدماتي', via: via() }); });
      m.setBusy(false); if (o.ok) { m.close(); SA.toast('تم حفظ بياناتك', 'success'); } } })] });
  }
  function profileChangeSheet(X) {
    const e = X.emp; const prof = e.profile || {}; let marital = prof.marital || 'single';
    const df = SA.form.field({ name: 'd', label: 'عدد المُعالين', type: 'number', value: prof.dependents != null ? prof.dependents : 0, min: 0, rules: [(v) => (v == null || (v >= 0 && Number.isInteger(v)) ? null : 'اكتب رقمًا صحيحًا')] });
    const m = SA.modal({ title: 'طلب تعديل بيانات حساسة', icon: 'edit', size: 'sm', body: h('div.sap-confirm', {}, h('span.label', {}, 'الحالة الاجتماعية'), chipSet([['single', 'أعزب/عزباء'], ['married', 'متزوج/ة'], ['other', 'أخرى']], marital, (v) => { marital = v; }), df.el, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'التعديل ده بيمرّ على HR للموافقة قبل ما يتغيّر في ملفك. الرقم القومي والاسم لا يُعدّلان من هنا.'))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'إرسال لـHR', icon: 'check', reason: offReason(), onClick: async () => { if (!df.validate()) return; m.setBusy(true); const o = await run(() => { const rec = createEssRequest(e, 'profile_change', 'تعديل بيانات الملف (حالة اجتماعية / مُعالين)', { changes: { marital, dependents: df.get() == null ? 0 : df.get() } }, [{ roleId: 'R-12', label: 'HR Officer — مراجعة التغيير' }], { ctx: [['الحالة الاجتماعية', marital], ['عدد المُعالين', String(df.get() == null ? 0 : df.get())]] }); SA.audit('HR.ESS.PROFILE_CHANGE_REQUESTED', { target: { type: 'profile_change', id: rec.id, label: rec.title }, after: rec.data.changes, via: via() }); return rec; }); m.setBusy(false); if (o.ok) { m.close(); SA.toast('تم إرسال طلب التعديل لـHR', 'success'); } } })] });
  }
  async function bankSheet(X) {
    const e = X.emp; if (offReason()) { SA.toast(offReason(), 'warn'); return; }
    if (!(await SA.stepUp('bank.change', { force: true, title: 'إعادة التحقق قبل تغيير الحساب البنكي', text: 'تغيير الحساب البنكي عملية حساسة. اكتب كلمة المرور أو كود التحقق.' }))) return;
    let proof = false; const f = SA.form.field({ name: 'iban', label: 'رقم الحساب الجديد (IBAN)', type: 'text', required: true, placeholder: 'EG00 0000 0000 0000 0000 0000 000', dir: 'ltr', hint: 'يبدأ بـEG ويتكوّن من 29 حرفًا/رقمًا', rules: [(v) => (/^EG\d{27}$/.test(String(v).replace(/\s+/g, '').toUpperCase()) ? null : 'صيغة الـIBAN غير صحيحة — EG + 27 رقم')] });
    const pf = SA.form.field({ name: 'proof', label: 'أرفقت صورة إثبات الحساب (محاكاة)', type: 'checkbox', value: false, onChange: (v) => { proof = v; } });
    const m = SA.modal({ title: 'طلب تغيير الحساب البنكي', icon: 'coins', size: 'sm', body: h('div.sap-confirm', {}, f.el, pf.el, banner('info', 'info', 'شخص ثانٍ من HR هيراجع الطلب وهيتنفّذ بعد مدة تأخير (24 ساعة — Open). هتوصلك رسالة عاجلة، وتقدر تلغي خلال التأخير.')),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'إرسال الطلب', icon: 'check', onClick: async () => {
        if (!f.validate()) return; if (!proof) { pf.error('أرفق صورة إثبات الحساب'); return; }
        const raw = f.get().replace(/\s+/g, '').toUpperCase(); const last4 = raw.slice(-4); m.setBusy(true);
        const o = await run(() => { const rec = createEssRequest(e, 'bank_change', 'تغيير الحساب البنكي', { newMasked: 'EG•• •••• •••• •••• •••• ' + last4, newLast4: last4, oldLast4: e.bankLast4 || '', proof: true }, [hrStep('HR — مراجع ثانٍ (فصل مهام)')], { ctx: [['الحساب الجديد', 'EG•• •••• •••• •••• •••• ' + last4], ['الحساب الحالي', '•••• ' + (e.bankLast4 || '')], ['التنفيذ', 'بعد مدة تأخير {24 ساعة — Open}'], ['ملاحظة', 'مراجع ثانٍ ≠ مقدّم الطلب']] }); SA.audit('HR.ESS.BANK_CHANGE_REQUESTED', { target: { type: 'bank_change', id: rec.id, label: 'تغيير الحساب البنكي — ' + e.name }, after: { new: '•••• ' + last4 }, via: via() }); if (e.userId) noteTo({ title: 'تم تقديم طلب تغيير حسابك البنكي', body: 'الحساب الجديد ينتهي بـ •••• ' + last4 + '. لو مش أنت، كلّم HR فورًا.', level: 'urgent', toUsers: [e.userId], link: '#/hr/ess/requests' }); return rec; });
        m.setBusy(false); if (o.ok) { m.close(); SA.toast('تم إرسال الطلب — بانتظار مراجع ثانٍ من HR', 'success'); } } })] });
  }

  /* ── إقراراتي ── */
  ESS.acks = { deps: ['acknowledgements', 'policyDocs'], render(box, X) {
    const e = X.emp; const docs = L('policyDocs'); const sel = X.arg ? docs.find((d) => d.id === X.arg) : null;
    if (sel) return ackDetail(box, X, sel);
    box.append(head(X, 'إقراراتي', 'سياسات تنتظر توقيعك'), previewBar(X.w), offBanner());
    if (!docs.length) { box.append(SA.empty({ icon: 'doc', title: 'مفيش إقرارات', text: 'أول ما HR تنشر سياسة جديدة هتظهر هنا.' })); return; }
    box.append(h('div.sap-ess2-list', {}, docs.map((d) => { const a = L('acknowledgements').find((x) => x.employeeId === e.id && x.docId === d.id && x.docVersion === d.version); const old = !a && L('acknowledgements').find((x) => x.employeeId === e.id && x.docId === d.id); return rowBtn('doc', d.title, 'الإصدار ' + d.version + (d.mandatory ? ' · إلزامي' : '') + (a ? ' · وُقِّع ' + SA.fmt.rel(a.signedAt) : old ? ' · الإصدار اتغيّر — محتاج إقرار جديد' : ''), a ? SA.chip('تم التوقيع', 'success') : SA.chip(old ? 'إقرار جديد' : 'بانتظار توقيعك', 'warning'), () => X.go('acks', d.id)); })));
  } };
  function ackDetail(box, X, d) {
    const e = X.emp; const a = L('acknowledgements').find((x) => x.employeeId === e.id && x.docId === d.id && x.docVersion === d.version); let quizOk = !d.quiz; let full = false;
    box.append(head(X, d.title, 'الإصدار ' + d.version + ' · سريان ' + fdate(d.effective), 'acks'), previewBar(X.w), offBanner());
    const body = h('div.sap-ess2-card', {}, h('h2', {}, 'الملخص'), h('ul', { style: 'margin:0;padding-inline-start:20px;line-height:2' }, d.summary.map((s) => h('li', {}, s))), d.law ? banner('info', 'info', 'النص القانوني الكامل Pending [Law] — تجريبي.') : null);
    box.append(body);
    const fullBox = h('div.sap-ess2-card', { hidden: true }, h('h2', {}, 'النص الكامل'), h('p', { style: 'line-height:2' }, d.body)); box.append(h('button.btn.btn-ghost', { type: 'button', onclick: (ev) => { full = !full; fullBox.hidden = !full; ev.currentTarget.textContent = full ? 'إخفاء النص الكامل' : 'اقرأ النص الكامل'; } }, 'اقرأ النص الكامل'), fullBox);
    if (a) { box.append(banner('info', 'checkcircle', h('b', {}, 'تم التوقيع '), SA.fmt.dt(a.signedAt) + ' · ' + a.device + ' · الإصدار ' + a.docVersion + '. نسخة الوثيقة المُقَرّ بها محفوظة.')); return; }
    const quizBox = d.quiz ? (() => { let sel2 = null; const out = h('div.sap-ess2-card', {}, h('h2', {}, 'اختبار فهم قصير'), h('p', {}, d.quiz.q), choiceGrid(d.quiz.options.map((o, i) => ({ id: String(i), icon: 'check', label: o })), null, (v) => { sel2 = +v; quizOk = sel2 === d.quiz.answer; fb.textContent = quizOk ? 'إجابة صحيحة' : 'إجابة غير صحيحة — راجع الملخص وجرّب تاني'; fb.style.color = quizOk ? 'var(--color-success)' : 'var(--color-danger)'; })); const fb = h('b', { role: 'status' }); out.append(fb); return out; })() : null;
    if (quizBox) box.append(quizBox);
    box.append(bigBtn('اطلعت ووافقت — توقيع بالـPIN', 'check', 'accent', async () => {
      if (!quizOk) { SA.toast('أجب على سؤال الفهم الأول بشكل صحيح.', 'warn'); return; }
      if (SA.sim.offline) { SA.toast('التوقيع يحتاج اتصالًا.', 'warn'); return; }
      if (!(await askPin({ title: 'التوقيع الإلكتروني', text: 'اكتب الـPIN بتاعك كتوقيع على «' + d.title + '» (الإصدار ' + d.version + ').', confirmLabel: 'وقّع', key: 'ack' }))) return;
      const o = await run(() => { const id = st.nextId('acknowledgements', 'ACK', 4); st.insert('acknowledgements', { id, employeeId: e.id, docId: d.id, docVersion: d.version, method: 'pin', signedAt: new Date().toISOString(), device: isShared() ? 'جهاز مشترك' : inPhone() ? 'موبايل (إطار)' : 'ويب شخصي' }); SA.audit('HR.ESS.ACK_SIGNED', { target: { type: 'policy', id: d.id, label: d.title + ' v' + d.version }, after: { signed: true, version: d.version, method: 'PIN' }, via: via() }); });
      if (o.ok) SA.toast('تم التوقيع وحفظ نسخة الوثيقة', 'success');
    }, previewReason(X.w)));
  }

  /* ── الإشعارات ── */
  ESS.inbox = { deps: ['notifications'], render(box, X) {
    const list = SA.notifications.forMe(); const LV = { urgent: ['عاجل', 'alert'], action: ['مطلوب إجراء', 'bolt'], info: ['للعلم', 'info'] };
    box.append(head(X, 'الإشعارات', 'كل رسائلك من النظام'), previewBar(X.w), h('div.sap-ess2-foot', {}, h('span.sap-ess2-note', {}, SA.notifications.unread() + ' غير مقروء'), SA.btn({ label: 'تحديد الكل كمقروء', icon: 'check', kind: 'ghost', size: 'sm', onClick: () => SA.notifications.markAll() })));
    if (!list.length) { box.append(SA.empty({ icon: 'bell', title: 'لا توجد إشعارات', text: 'مفيش حاجة جديدة.' })); return; }
    box.append(h('div.sap-ess2-list', {}, list.slice(0, 40).map((n) => { const l = LV[n.level] || LV.info; const read = SA.notifications.isRead(n); return rowBtn(l[1], n.title, (n.body || '') + ' · ' + SA.fmt.rel(n.ts), read ? SA.chip('مقروء', 'neutral') : SA.chip(l[0], n.level === 'urgent' ? 'danger' : n.level === 'action' ? 'warning' : 'info'), () => { SA.notifications.markRead(n.id); const lk = String(n.link || ''); if (lk.indexOf('#/hr/ess') === 0) SA.nav(lk); else if (lk) { if (L('approvals').length && /#\/approvals/.test(lk) && SA.can('sa.approvals.view')) SA.nav(lk); else X.go('requests'); } }); })));
  } };

  /* ── بلّغ مشكلة ── */
  ESS.report = { deps: [], static: true, render(box, X) {
    const e = X.emp; const S = { type: 'near_miss', location: null, desc: '', photo: false };
    const locs = L('departments').filter((d) => /^D-(09|1[0-3])$/.test(d.id)).map((d) => d.name).concat(['المخزن', 'الساحة', 'مكان آخر']);
    S.location = deptName(e.departmentId);
    const host = h('div.sap-ess2', { style: 'gap:14px' }); box.append(host);
    function draw() {
      SA.clear(host);
      const df = SA.form.field({ name: 'd', label: 'اكتب باختصار إيه اللي حصل', type: 'textarea', rows: 3, value: S.desc, required: true, rules: [SA.form.rules.min(5)], onInput: (v) => { S.desc = v; } });
      host.append(head(X, 'بلّغ مشكلة', 'البلاغ بيوصل مسؤول السلامة فورًا'), offBanner(), previewBar(X.w),
        h('span.label', {}, 'النوع'), choiceGrid([{ id: 'injury', icon: 'health', label: 'إصابة', sub: 'بيبلّغ فورًا', danger: true }, { id: 'near_miss', icon: 'alert', label: 'شبه حادث', sub: 'كان ممكن يحصل' }, { id: 'hazard', icon: 'bolt', label: 'خطر', sub: 'مكان أو ماكينة' }, { id: 'other', icon: 'info', label: 'أخرى' }], S.type, (v) => { S.type = v; }),
        h('span.label', {}, 'المكان'), chipSet(locs.map((x) => [x, x]), S.location, (v) => { S.location = v; }), df.el,
        h('div.sap-ess2-foot', {}, h('button.btn.btn-ghost', { type: 'button', onclick: () => { S.photo = !S.photo; draw(); } }, SA.icon(S.photo ? 'checkcircle' : 'upload', 'icon-sm'), S.photo ? 'صورة مرفقة (تجريبي)' : 'أضف صورة (اختياري)'), SA.btn({ label: SA.sim.offline ? 'احفظ كمسودة' : 'إرسال البلاغ', icon: 'alert', kind: 'accent', size: 'lg', reason: previewReason(X.w), onClick: async (ev, btn) => {
          if (!df.validate()) return; const payload = { type: S.type, location: S.location, description: S.desc.trim(), employeeId: e.id, reporterId: e.userId || SA.session.userId, channel: 'ess', photo: S.photo }; btn.disabled = true;
          if (SA.sim.offline) { const q = queueDraft('incident', payload, 'بلاغ سلامة (مسودة) — ' + S.location); btn.disabled = false; SA.toast('اتحفظ كمسودة (' + q + ') وهيتبعت لما الاتصال يرجع.', 'info', { ms: 6000 }); X.go('requests'); return; }
          const o = await run(() => createIncident(payload)); btn.disabled = false; if (!o.ok) return; sent(o.r);
        } })));
    }
    function sent(r) { SA.clear(host); host.append(h('div.sap-ess2-card.sap-ess2-done', {}, h('span.sap-ess2-ok', {}, SA.icon('check')), h('h2', {}, 'تم إرسال البلاغ'), h('p', {}, r.id + ' — وصل مسؤول السلامة' + (r.type === 'injury' ? ' كبلاغ عاجل' : '') + '.'), r.type === 'injury' ? banner('danger', 'health', 'لو الإصابة محتاجة إسعاف، كلّم المشرف أو الإسعاف فورًا.') : null, h('div.sap-ess2-foot', {}, bigBtn('الرئيسية', 'home', 'primary', () => X.go('home')), bigBtn('بلاغ تاني', 'plus', 'ghost', () => { S.desc = ''; S.photo = false; draw(); })))); }
    draw();
  } };

  /* ── ESS shell: toolbar (device mode / phone frame), idle timer for shared devices, phone frame ── */
  const ESS_TITLES = { home: 'الرئيسية', shifts: 'وردتي', payslips: 'مرتبي', leave: 'إجازتي', attendance: 'حضوري', requests: 'طلباتي', profile: 'بياناتي', acks: 'إقراراتي', inbox: 'الإشعارات', report: 'بلّغ مشكلة' };
  function essLogout(msg) { revealed.clear(); ['device', 'frame', 'ttl', 'prevEss', 'prevMss'].forEach((k) => store.set(k, null)); SA.auth.logout(msg || 'تم تسجيل الخروج. تم تنظيف بيانات الجلسة من هذا الجهاز.'); }
  function renderEss(root, ctx) {
    ensure();
    if (ctx.params.frame === 'phone') store.set('frame', '1'); else if (ctx.params.frame === 'off') store.set('frame', '0');
    if (ctx.params.ttl) store.set('ttl', ctx.params.ttl); if (ctx.params.device === 'shared' || ctx.params.device === 'personal') store.set('device', ctx.params.device);
    ctx.setCrumbs([{ label: 'خدماتي' }, { label: ESS_TITLES[ctx.path[0] || 'home'] || 'خدماتي' }]);
    const w = who(false); const sub = ESS[ctx.path[0]] ? ctx.path[0] : 'home'; const arg = ctx.path[1] || '';
    const cleanups = []; let disposed = false; let cleanScreen = null;
    const phone = inPhone();
    const X = { w, emp: w.emp, arg, go: (s, a) => SA.nav('hr/ess' + (s && s !== 'home' ? '/' + s + (a ? '/' + a : '') : '')) };
    const view = h('div.sap-ess2'); const scroller = phone ? h('div.sap-phn-scroll', {}, view) : null;
    /* toolbar */
    let timerChip = null; let last = Date.now();
    const tools = h('div.sap-ess2-tools', {},
      SA.segmented([['personal', 'جهازي الشخصي'], ['shared', 'جهاز مشترك']], isShared() ? 'shared' : 'personal', (v) => { store.set('device', v); revealed.clear(); SA.router.refresh(); }),
      h('button.sap-ess2-tool', { type: 'button', 'aria-pressed': String(phone), onclick: () => { store.set('frame', phone ? '0' : '1'); SA.router.refresh(); } }, SA.icon('phoneframe', 'icon-sm'), 'عرض كهاتف'),
      h('button.sap-ess2-tool', { type: 'button', onclick: () => SA.nav('hr/kiosk') }, SA.icon('scan', 'icon-sm'), 'وضع الكشك'),
      h('span.sap-ess2-sp'),
      isShared() ? (timerChip = h('span.sap-ess2-timer', { role: 'timer', 'aria-label': 'مهلة الجلسة' })) : null,
      isShared() ? h('button.sap-ess2-tool.is-danger', { type: 'button', onclick: () => essLogout() }, SA.icon('logout', 'icon-sm'), 'خروج وتنظيف الجهاز') : null);
    if (isShared()) {
      const bump = () => { last = Date.now(); }; ['pointerdown', 'keydown', 'scroll'].forEach((ev) => root.addEventListener(ev, bump, true));
      const iv = setInterval(() => { const left = sharedTtl() - Math.floor((Date.now() - last) / 1000); if (timerChip) timerChip.textContent = 'الجلسة تنتهي بعد ' + Math.floor(Math.max(left, 0) / 60) + ':' + p2(Math.max(left, 0) % 60); if (left <= 0) { clearInterval(iv); essLogout('انتهت الجلسة بعد مدة خمول على الجهاز المشترك. تم تنظيف بياناتك من الجهاز.'); } }, 1000); cleanups.push(() => clearInterval(iv));
    }
    function draw(first) {
      if (disposed) return; if (cleanScreen) { try { cleanScreen(); } catch (e) { /* noop */ } cleanScreen = null; }
      const scr = ESS[sub]; const go = () => {
        if (disposed) return; SA.clear(view);
        if (!w.emp) { view.append(previewPicker(false)); return; }
        try { const c = scr.render(view, X); if (typeof c === 'function') cleanScreen = c; } catch (e) { console.error(e); view.append(SA.errorState({ text: SA.errorText(e), onRetry: () => draw(true) })); }
      };
      if (first) { SA.clear(view); view.append(SA.skeleton({ kind: 'cards', rows: 3 })); SA.delay(140, { write: false }).then(go, go); } else go();
    }
    const scr0 = ESS[sub]; const isStatic = scr0.static || (sub === 'leave' && arg === 'new'); if (!isStatic) { (scr0.deps || []).forEach((p) => cleanups.push(st.subscribe(p, () => draw(false)))); cleanups.push(st.subscribe('tour.sim', () => draw(false))); }
    if (!phone) root.append(tools, view);
    else {
      const unread = SA.notifications.unread();
      const tab = (id, icon, label) => h('button', { type: 'button', 'aria-current': sub === id ? 'page' : null, onclick: () => X.go(id) }, SA.icon(icon), label + (id === 'inbox' && unread ? ' (' + unread + ')' : ''));
      const frame = h('div.sap-phn', {}, h('div.sap-phn-screen', {}, h('div.sap-phn-status', {}, h('span', {}, hm(new Date())), h('span', {}, SA.icon(SA.sim.offline ? 'wifioff' : 'wifi'), SA.icon('battery'))), h('div.sap-phn-appbar', {}, h('img', { src: '../../assets/images/logo/mark.png', alt: '' }), h('span', {}, 'EG · خدماتي')), scroller, h('nav.sap-phn-tabs', { 'aria-label': 'تنقّل التطبيق' }, tab('home', 'home', 'الرئيسية'), tab('requests', 'inbox', 'طلباتي'), tab('inbox', 'bell', 'الإشعارات'), tab('profile', 'user', 'أنا'))));
      root.append(tools, frame);
    }
    draw(true);
    return () => { disposed = true; cleanups.forEach((f) => { try { f(); } catch (e) { /* noop */ } }); if (cleanScreen) try { cleanScreen(); } catch (e) { /* noop */ } };
  }

  /* ═════════════════════════════ MSS — فريقي (المشرف) ═════════════════════════════ */
  const T_STAT = {
    present: ['حاضر', 'success'], late: ['متأخر', 'warning'], absent: ['غائب بلا إخطار', 'danger'], leave: ['في إجازة', 'info'], pending: ['لم يسجّل بعد', 'neutral'], rest: ['راحة', 'neutral']
  };
  function todayStatus(e) {
    const t = today(); const rec = todayRec(e.id); const lv = leaveOn(e.id, t);
    if (isFri(t)) return { k: 'rest', note: '' };
    if (lv || (rec && rec.status === 'leave') || (e.status === 'leave' && !(rec && rec.in))) return { k: 'leave', note: lv ? 'إجازة ' + LEAVE_T[lv.type] : 'إجازة' };
    if (rec && rec.status === 'absent') return { k: 'absent', note: '' };
    if (rec && rec.in) return { k: rec.status === 'late' ? 'late' : 'present', note: 'حضور ' + rec.in };
    return { k: 'pending', note: '' };
  }
  const lastCall = (empId) => L('essCalls').filter((c) => c.employeeId === empId && c.date === today()).sort((a, b) => new Date(b.at) - new Date(a.at))[0] || null;

  /* queue items: everything from my team that waits for the supervisor's decision */
  function queueItems(me) {
    const ids = team(me).map((x) => x.id); const out = [];
    L('leaveRequests').filter((r) => ids.indexOf(r.employeeId) >= 0 && r.status === 'pending' && (r.stage || 'supervisor') === 'supervisor').forEach((r) => out.push({ key: 'LV:' + r.id, kind: 'leave', id: r.id, emp: empById(r.employeeId), rec: r, at: r.createdAt }));
    L('overtimeRequests').filter((r) => ids.indexOf(r.employeeId) >= 0 && r.status === 'pending').forEach((r) => out.push({ key: 'OT:' + r.id, kind: 'overtime', id: r.id, emp: empById(r.employeeId), rec: r, at: r.createdAt }));
    L('essRequests').filter((r) => ids.indexOf(r.employeeId) >= 0 && r.status === 'pending' && (r.kind === 'attendance_fix' || r.kind === 'shift_swap') && !(r.onBehalf && r.onBehalf.by === me.userId)).forEach((r) => out.push({ key: 'ES:' + r.id, kind: r.kind, id: r.id, emp: empById(r.employeeId), rec: r, at: r.createdAt }));
    return out.sort((a, b) => new Date(a.at) - new Date(b.at));
  }
  function coverage(item, mem) {
    const r = item.rec; const others = mem.filter((x) => x.id !== r.employeeId && L('leaveRequests').some((l) => l.employeeId === x.id && (l.status === 'approved' || l.status === 'pending') && l.id !== r.id && overlap(l, r)));
    return { others, total: mem.length, avail: mem.length - 1 - others.length };
  }
  const KIND_LBL = { leave: ['طلب إجازة', 'clipboard'], overtime: ['أوفرتايم', 'bolt'], attendance_fix: ['تصحيح بصمة', 'clock'], shift_swap: ['تبديل وردية', 'swap'] };
  const REASONS = ['تعارض مع جدول الإنتاج', 'نقص تغطية في الخط', 'رصيد غير كافٍ', 'مفيش مستند', 'التوقيت غير مناسب', 'سبب آخر'];

  async function decideItem(item, ok, reason, me) {
    const e = item.emp; const rec = item.rec; const iso = new Date().toISOString();
    const o = await run(() => {
      if (item.kind === 'leave') {
        const label = 'إجازة ' + LEAVE_T[rec.type] + ' — ' + e.name;
        if (ok) {
          if (rec.approvalId && st.find('approvals', rec.approvalId)) advanceApproval(rec.approvalId, true, reason);
          else { const ap = SA.requestApproval({ type: 'leave', title: label + ' (' + rec.days + ' أيام) — بانتظار HR', requesterId: e.userId || me.id, chain: [hrStep('HR — فحص الرصيد والسياسة')], context: ctxRows(e, [['النوع', LEAVE_T[rec.type]], ['من', fdate(rec.from)], ['إلى', fdate(rec.to)], ['اعتمده المشرف', me.name + (reason ? ' — ' + reason : '')]]), ref: { type: 'leave', id: rec.id } }); st.patch('leaveRequests', rec.id, { approvalId: ap.id }); }
          st.patch('leaveRequests', rec.id, { stage: 'hr', supervisorDecision: { by: me.id, at: iso, reason: reason || '' } });
          SA.audit('HR.LEAVE.APPROVED', { target: { type: 'leave_request', id: rec.id, label }, before: { stage: 'supervisor' }, after: { status: 'pending', stage: 'hr', step: 'المشرف' }, reason: reason || 'اعتماد المشرف', via: via() });
        } else {
          if (rec.approvalId) advanceApproval(rec.approvalId, false, reason);
          st.patch('leaveRequests', rec.id, { status: 'rejected', stage: 'done', supervisorDecision: { by: me.id, at: iso, reason } });
          SA.audit('HR.LEAVE.REJECTED', { target: { type: 'leave_request', id: rec.id, label }, after: { status: 'rejected' }, reason, via: via() });
        }
        if (e.userId) noteTo({ title: ok ? 'وافق مشرفك على إجازتك' : 'مشرفك رفض طلب الإجازة', body: ok ? 'بانتظار مراجعة HR.' : 'السبب: ' + reason, level: ok ? 'info' : 'action', toUsers: [e.userId], link: '#/hr/ess/requests' });
      } else if (item.kind === 'overtime') {
        st.patch('overtimeRequests', rec.id, { status: ok ? 'approved' : 'rejected', decidedBy: me.id, decidedAt: iso, decisionReason: reason || '' });
        SA.audit(ok ? 'HR.OVERTIME.APPROVED' : 'HR.OVERTIME.REJECTED', { target: { type: 'overtime', id: rec.id, label: 'أوفرتايم ' + rec.hours + ' ساعة — ' + e.name }, after: { status: ok ? 'approved' : 'rejected', hours: rec.hours }, reason: reason || 'اعتماد المشرف', via: via() });
        if (ok) noteTo({ title: 'أوفرتايم معتمد من المشرف', body: e.name + ' — ' + rec.hours + ' ساعة (' + fdate(rec.date) + ')', level: 'info', to: ['R-13'], link: '#/hr/overtime' });
        if (e.userId) noteTo({ title: ok ? 'تم اعتماد الأوفرتايم' : 'تم رفض الأوفرتايم', body: rec.hours + ' ساعة — ' + fdate(rec.date), level: 'info', toUsers: [e.userId], link: '#/hr/ess/requests' });
      } else {
        if (rec.approvalId) advanceApproval(rec.approvalId, ok, reason);
        if (ok && item.kind === 'attendance_fix') { applyAttendanceFix(rec); SA.audit('HR.ATTENDANCE.ADJUSTED', { target: { type: 'attendance', id: e.id + ' · ' + rec.data.date, label: 'تصحيح بصمة — ' + e.name }, after: { [rec.data.field === 'in' ? 'in' : 'out']: rec.data.time }, reason: rec.data.reason, via: via() }); }
        st.patch('essRequests', rec.id, { status: ok ? 'approved' : 'rejected', decidedBy: me.id, decidedAt: iso });
        SA.audit(ok ? 'HR.INBOX.APPROVED' : 'HR.INBOX.REJECTED', { target: { type: item.kind, id: rec.id, label: rec.title }, after: { status: ok ? 'approved' : 'rejected' }, reason: reason || 'قرار المشرف', via: via() });
        if (e.userId) noteTo({ title: ok ? 'تمت الموافقة على طلبك' : 'تم رفض طلبك', body: rec.title + (ok ? '' : ' — السبب: ' + reason), level: 'info', toUsers: [e.userId], link: '#/hr/ess/requests' });
      }
    });
    return o.ok;
  }
  function rejectSheet(item, me, done) {
    let reason = REASONS[0]; const tf = SA.form.field({ name: 'x', label: 'ملاحظة إضافية (اختياري)', type: 'text' });
    const m = SA.modal({ title: 'رفض الطلب — ' + (item.emp ? item.emp.name : ''), icon: 'xcircle', danger: true, size: 'sm', body: h('div.sap-confirm', {}, h('span.label', {}, 'اختر السبب'), chipSet(REASONS.map((x) => [x, x]), reason, (v) => { reason = v; }), tf.el, h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), 'السبب بيوصل الموظف وبيتسجّل في السجل.')),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-accent', { type: 'button', onclick: async () => { m.setBusy(true); const ok = await decideItem(item, false, reason + (tf.get().trim() ? ' — ' + tf.get().trim() : ''), me); m.setBusy(false); if (ok) { m.close(); SA.toast('تم رفض الطلب وإبلاغ الموظف', 'success'); if (done) done(); } } }, 'رفض الطلب')] });
  }

  function itemCard(item, mem, W, me) {
    const e = item.emp; const rec = item.rec; const k = KIND_LBL[item.kind]; const lockR = previewReason(W) || offReason();
    let detail, cov = null, approveLock = '';
    if (item.kind === 'leave') {
      detail = SA.kv([['النوع', 'إجازة ' + LEAVE_T[rec.type]], ['الأيام', fdate(rec.from) + ' ← ' + fdate(rec.to) + ' (' + daysTxt(rec.days) + ')'], ['السبب', rec.reason || '—']].concat(rec.attach ? [['مرفق', 'شهادة مرفقة']] : []));
      const c = coverage(item, mem);
      cov = h('div.sap-mss-cov.is-' + (c.others.length ? 'warn' : 'ok'), {}, SA.icon(c.others.length ? 'alert' : 'checkcircle'), h('div', {}, c.others.length ? h('b', {}, 'تنبيه تغطية: ') : h('b', {}, 'التغطية: '), c.others.length ? c.others.map((x) => x.name).join('، ') + ' في إجازة بنفس الأيام. ' : 'مفيش تعارض مع زملاء الفريق. ', 'المتاح من الفريق في الأيام دي: ', h('b', {}, c.avail + ' من ' + c.total), '. الحد الأدنى للطاقم ', SA.openValue('غير مُعدّ'), ' — التنبيه للعلم ولا يمنع.'));
      const b = balanceOf(e.id, rec.type); if (b && rec.days > b.balanceDays && rec.type !== 'unpaid') cov.append(h('div', {}, 'رصيد الموظف ' + b.balanceDays + ' يوم أقل من المطلوب — HR هتراجع.'));
    } else if (item.kind === 'overtime') {
      detail = SA.kv([['اليوم', fdate(rec.date)], ['الساعات', hrsTxt(rec.hours)], ['السبب', rec.reason || '—'], ['السقف الشهري', SA.openValue('غير مُعدّ')]]);
    } else if (item.kind === 'attendance_fix') {
      detail = SA.kv([['اليوم', fdate(rec.data.date)], ['المطلوب', (rec.data.field === 'in' ? 'تعديل وقت الحضور إلى ' : 'تعديل وقت الانصراف إلى ') + rec.data.time], ['السبب', rec.data.reason || '—']].concat(rec.onBehalf ? [['أُدخل بالنيابة', rec.onBehalf.byName]] : []));
    } else {
      const peer = empById(rec.data.peerId); detail = SA.kv([['اليوم', fdate(rec.data.date)], ['مع', peer ? peer.name : '—'], ['السبب', rec.data.reason || '—'], ['موافقة الزميل', rec.data.peerConsent === 'yes' ? SA.chip('وافق', 'success') : SA.chip('بانتظار الزميل', 'warning')]]);
      if (rec.data.peerConsent !== 'yes') approveLock = 'لازم موافقة الزميل أولًا. سجّلها بعد ما يؤكد لك.';
    }
    const extra = item.kind === 'shift_swap' && rec.data.peerConsent !== 'yes' ? SA.btn({ label: 'سجّل موافقة الزميل (بالنيابة)', icon: 'check', kind: 'ghost', reason: lockR, onClick: async () => { const o = await run(() => { st.patch('essRequests', rec.id, (x) => ({ data: Object.assign({}, x.data, { peerConsent: 'yes', peerConsentBy: me.id }) })); SA.audit('HR.ESS.ONBEHALF_SUBMITTED', { target: { type: 'shift_swap', id: rec.id, label: rec.title }, after: { peerConsent: 'yes' }, reason: 'تسجيل موافقة الزميل بواسطة المشرف', via: via() }); }); if (o.ok) SA.toast('تم تسجيل موافقة الزميل', 'success'); } }) : null;
    return h('article.sap-mss-q', { 'aria-label': k[0] + ' — ' + e.name }, h('div.sap-mss-q-head', {}, SA.avatar(e.name), h('div', {}, h('b', {}, e.name), h('small.t-muted', {}, SA.fmt.rel(item.at) + ' · ' + item.id)), SA.chip(k[0], 'info'), item.kind === 'leave' && rec.source === 'onbehalf' ? SA.chip('بالنيابة', 'neutral') : null), detail, cov, extra,
      h('div.sap-mss-act', {}, SA.btn({ label: 'اعتمد', icon: 'check', kind: 'primary', size: 'lg', reason: lockR || approveLock, onClick: async (ev, btn) => { btn.disabled = true; const ok = await decideItem(item, true, '', me); if (!ok) btn.disabled = false; else SA.toast('تم الاعتماد' + (item.kind === 'leave' ? ' — الطلب راح لـHR للمراجعة' : ''), 'success'); } }), SA.btn({ label: 'ارفض', icon: 'x', kind: 'ghost', size: 'lg', reason: lockR, onClick: () => rejectSheet(item, me) })),
      lockR ? h('p.sap-ess2-note', {}, lockR) : null);
  }

  /* ── tabs ── */
  const MSS = {};
  MSS.today = { deps: ['attendance', 'leaveRequests', 'essCalls', 'employees'], render(box, X) {
    const mem = team(X.emp); const F = X.filter || 'all'; const rows = mem.map((e) => ({ e, s: todayStatus(e) }));
    const cnt = (k) => rows.filter((r) => r.s.k === k).length; const present = cnt('present') + cnt('late');
    const tiles = [['all', 'الفريق', rows.length, 'var(--eg-navy)'], ['present', 'حاضر', cnt('present'), 'var(--color-success)'], ['late', 'متأخر', cnt('late'), 'var(--color-warning)'], ['absent', 'غائب بلا إخطار', cnt('absent'), 'var(--color-danger)'], ['leave', 'في إجازة', cnt('leave'), '#2d5a9a'], ['pending', 'لم يسجّل بعد', cnt('pending'), '#8a8f9a']];
    box.append(offBanner(), h('div.sap-mss-sum', {}, tiles.map((t) => h('button', { type: 'button', 'aria-pressed': String(F === t[0]), onclick: () => X.go('today', t[0] === 'all' ? '' : t[0]) }, h('span', {}, h('i.dot', { style: 'background:' + t[3] }), t[1]), h('b.num', {}, t[2])))),
      h('div.sap-mss-cov.is-' + (cnt('absent') ? 'warn' : 'ok'), {}, SA.icon(cnt('absent') ? 'alert' : 'checkcircle'), h('div', {}, h('b', {}, 'حضور الخط: '), h('b', {}, present + ' من ' + rows.length), ' · الفجوة عن الحد الأدنى للطاقم: ', SA.openValue('غير مُعدّ'), ' · مهارات الماكينات اليوم: ', SA.openValue('تُربط من HR-19'))));
    const shown = rows.filter((r) => F === 'all' || r.s.k === F);
    if (!rows.length) { box.append(SA.empty({ icon: 'users', title: 'لا يوجد أعضاء في فريقك', text: 'الفريق بيتحدد من «المدير المباشر» في ملف الموظف.' })); return; }
    if (!shown.length) { box.append(SA.empty({ icon: 'search', title: 'مفيش حد في الحالة دي', text: 'جرّب فلتر تاني.' })); return; }
    box.append(h('div.sap-ess2-list', {}, shown.map((r) => {
      const m = T_STAT[r.s.k]; const lc = lastCall(r.e.id); const code = shiftOn(r.e, today());
      const callBtn = h('a.btn.btn-ghost.btn-sm', { href: 'tel:' + String(r.e.phone || '').replace(/\s+/g, ''), 'aria-label': 'اتصال بـ' + r.e.name }, SA.icon('phone', 'icon-sm'), 'اتصل');
      return h('div.sap-mss-person', {}, SA.avatar(r.e.name), h('div.sap-mss-info', {}, h('b', {}, r.e.name), h('small', {}, (posTitle(r.e) || '') + ' · ' + shiftName(code) + (r.s.note ? ' · ' + r.s.note : ''))), SA.chip(m[0], m[1]), lc ? SA.chip(lc.result === 'answered' ? 'رد ' + SA.fmt.time(lc.at) : 'لم يرد ' + SA.fmt.time(lc.at), lc.result === 'answered' ? 'success' : 'warning') : null,
        r.s.k === 'absent' || r.s.k === 'pending' ? [callBtn, SA.btn({ label: 'نتيجة الاتصال', icon: 'list', kind: 'ghost', size: 'sm', reason: previewReason(X.w), onClick: (ev) => SA.menu(ev.currentTarget, [{ label: 'رد على الاتصال', icon: 'check', onClick: () => logCall(r.e, 'answered') }, { label: 'لم يرد', icon: 'x', onClick: () => logCall(r.e, 'no_answer') }]) })] : null);
    })));
  } };
  function logCall(e, result) { st.insert('essCalls', { id: st.nextId('essCalls', 'CL', 3), employeeId: e.id, result, at: new Date().toISOString(), date: today(), by: SA.session.userId }); SA.toast(result === 'answered' ? 'اتسجّل: الموظف رد' : 'اتسجّل: لم يرد', 'info'); }

  MSS.approvals = { deps: ['leaveRequests', 'overtimeRequests', 'essRequests', 'approvals', 'employees'], render(box, X) {
    const me = SA.session.user; const mem = team(X.emp); const items = X.w.preview ? queueItems({ id: X.emp.id, userId: X.emp.userId }) : queueItems({ id: X.emp.id, userId: me.id });
    const ots = items.filter((i) => i.kind === 'overtime');
    box.append(offBanner(), h('div.sap-ess2-foot', {}, h('p.sap-ess2-note', { style: 'margin:0' }, items.length ? items.length + ' طلب بانتظار قرارك — أقدم طلب أولًا' : 'مفيش طلبات معلّقة'), h('div.sap-actions', {}, ots.length > 1 ? SA.btn({ label: 'اعتماد كل الأوفرتايم (' + ots.length + ')', icon: 'checkcircle', kind: 'ghost', reason: previewReason(X.w) || offReason(), onClick: () => bulkOvertime(ots, me) }) : null, SA.btn({ label: 'طلب بالنيابة', icon: 'userplus', kind: 'ghost', reason: previewReason(X.w), onClick: () => onBehalfSheet(X, mem, me) }))));
    if (!items.length) box.append(SA.empty({ icon: 'checkcircle', title: 'مفيش حاجة بانتظار قرارك', text: 'الطلبات الجديدة من فريقك (إجازة، أوفرتايم، تصحيح بصمة) بتظهر هنا.' }));
    else box.append(h('div.sap-ess2-list', {}, items.map((i) => itemCard(i, mem, X.w, me))));
    const ids = mem.map((x) => x.id);
    const hot = ((st.get('hrTime') || {}).otRequests || []).filter((o) => (o.employeeIds || []).length && o.employeeIds.every((x) => ids.indexOf(x) >= 0)).slice(0, 6);
    if (hot.length) box.append(SA.card({ title: 'أوفرتايم فريقك', actions: [SA.btn({ label: 'فتح الأوفرتايم', icon: 'bolt', kind: 'ghost', size: 'sm', perm: 'hr.overtime.view', onClick: () => SA.nav('hr/overtime') })] }, h('p.sap-ess2-note', { style: 'margin-block:0 8px' }, 'قرار الأوفرتايم عند مدير الموارد البشرية (السقف والامتثال) — بتتابع حالته هنا.'), h('div.sap-ess2-list', {}, hot.map((o) => h('div.sap-mss-person', {}, SA.icon('bolt'), h('div.sap-mss-info', {}, h('b', {}, o.employeeIds.map((x) => (empById(x) || {}).name).join('، ')), h('small', {}, o.id + ' · ' + fdate(o.date) + ' · ' + hrsTxt(Math.round((o.minutes || 0) / 6) / 10))), chipOf(o.status === 'requested' ? 'requested' : o.status === 'approved' ? 'approved' : 'rejected'))))));
    const hist = L('leaveRequests').filter((r) => ids.indexOf(r.employeeId) >= 0 && r.supervisorDecision).sort((a, b) => new Date(b.supervisorDecision.at) - new Date(a.supervisorDecision.at)).slice(0, 5);
    if (hist.length) box.append(SA.card({ title: 'قراراتك الأخيرة' }, h('div.sap-ess2-list', {}, hist.map((r) => h('div.sap-mss-person', {}, SA.avatar((empById(r.employeeId) || {}).name), h('div.sap-mss-info', {}, h('b', {}, (empById(r.employeeId) || {}).name), h('small', {}, 'إجازة ' + LEAVE_T[r.type] + ' · ' + fdate(r.from) + ' ← ' + fdate(r.to))), reqChip(r.status === 'pending' ? 'at_hr' : r.status), h('small.t-muted', {}, SA.fmt.rel(r.supervisorDecision.at)))))));
  } };
  async function bulkOvertime(ots, me) {
    const sum = ots.reduce((a, i) => a + i.rec.hours, 0);
    const c = await SA.confirm({ title: 'اعتماد ' + ots.length + ' طلب أوفرتايم', impact: ['إجمالي الساعات: ' + sum + ' ساعة لـ' + ots.map((i) => i.emp.name).join('، '), 'سقف الأوفرتايم الشهري {Open} — لا فحص للسقف في النموذج.'], confirmLabel: 'اعتمد الكل', note: 'كل طلب بيتسجّل بقرار مستقل في السجل.' });
    if (!c.ok) return; let n = 0; for (const i of ots) { if (await decideItem(i, true, 'اعتماد جماعي', me)) n++; } SA.toast('تم اعتماد ' + n + ' طلب أوفرتايم', 'success');
  }
  function onBehalfSheet(X, mem, me) {
    let kind = 'leave'; let rsn = 'الموظف بلا هاتف'; const RS = ['الموظف بلا هاتف', 'الموظف مش في الموقع', 'نموذج ورقي'];
    const ef = SA.form.field({ name: 'e', label: 'الموظف', type: 'select', required: true, options: [['', 'اختر…']].concat(mem.map((x) => [x.id, x.name])) });
    const typ = SA.form.field({ name: 'lt', label: 'نوع الإجازة', type: 'select', options: [['annual', 'سنوية'], ['casual', 'عارضة']] });
    const f1 = SA.form.field({ name: 'f', label: 'من تاريخ', type: 'date', required: true, value: today() }); const f2 = SA.form.field({ name: 't', label: 'إلى تاريخ', type: 'date', required: true, value: today() });
    const nf = SA.form.field({ name: 'n', label: 'ملاحظة / رقم الورقة', type: 'text', required: true, rules: [SA.form.rules.min(3)] });
    const m = SA.modal({ title: 'إدخال طلب بالنيابة (الجسر الورقي)', icon: 'userplus', size: 'sm', body: h('div.sap-confirm', {}, banner('info', 'info', 'الطلب بيتوسم «بالنيابة» باسمك ولا يتجاوز سلسلة الاعتماد (بيروح HR). ممنوع لأي طلب مالي حساس.'), ef.el, typ.el, h('div.sap-ess2-fieldrow', {}, f1.el, f2.el), nf.el, h('span.label', {}, 'سبب الإدخال بالنيابة'), chipSet(RS.map((x) => [x, x]), rsn, (v) => { rsn = v; })),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), SA.btn({ label: 'إدخال الطلب', icon: 'check', onClick: async () => {
        if (!SA.form.group([ef, f1, f2, nf]).validate()) return; if (f2.get() < f1.get()) { f2.error('تاريخ النهاية قبل البداية'); return; }
        const e = empById(ef.get()); const days = countDays(f1.get(), f2.get()); if (!days) { f2.error('كل الأيام جمعة/راحة'); return; }
        if (L('leaveRequests').some((r) => r.employeeId === e.id && (r.status === 'pending' || r.status === 'approved') && overlap(r, { from: f1.get(), to: f2.get() }))) { ef.error('الموظف عنده إجازة بنفس الأيام'); return; }
        m.setBusy(true); const o = await run(() => { const b = balanceOf(e.id, typ.get()); const rec = createLeave({ emp: e, type: typ.get(), from: f1.get(), to: f2.get(), days, reason: nf.get().trim(), balanceAfter: b ? Math.max(b.balanceDays - days, 0) : null, onBehalf: { by: me.id, byName: me.name, reason: rsn } }); SA.audit('HR.ESS.ONBEHALF_SUBMITTED', { target: { type: 'leave_request', id: rec.id, label: 'إجازة بالنيابة — ' + e.name }, after: { by: me.name, reason: rsn }, reason: nf.get().trim(), via: via() }); return rec; });
        m.setBusy(false); if (o.ok) { m.close(); SA.toast('تم إدخال الطلب ' + o.r.id + ' بالنيابة — بانتظار HR', 'success'); } } })] });
  }

  MSS.roster = { deps: ['leaveRequests', 'essRequests'], render(box, X) {
    const mem = team(X.emp); const t = today(); const off = X.arg === 'next' ? 7 : X.arg === 'prev' ? -7 : 0; const start = addDays(t, -dayIdx(t) + off); const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    box.append(offBanner(), h('div.sap-ess2-foot', {}, SA.segmented([['prev', 'الأسبوع اللي فات'], ['now', 'هذا الأسبوع'], ['next', 'الأسبوع الجاي']], off < 0 ? 'prev' : off > 0 ? 'next' : 'now', (v) => X.go('roster', v === 'now' ? '' : v)), h('span.sap-ess2-note', {}, 'الورديات تجريبية ومصدرها HR-09 · A/B/C بتدور أسبوعيًا')));
    if (!mem.length) { box.append(SA.empty({ icon: 'users', title: 'لا يوجد أعضاء في فريقك' })); return; }
    const head2 = h('tr', {}, h('th', {}, 'الموظف'), days.map((d) => h('th' + (d === t ? '.is-today' : ''), {}, DAYN[dayIdx(d)], h('div', {}, h('small.num', {}, d.slice(8) + '/' + d.slice(5, 7))))));
    const body = mem.map((e) => h('tr', {}, h('td', {}, h('b', {}, e.name), h('div', {}, h('small.t-muted', {}, posTitle(e)))), days.map((d) => { const lv = leaveOn(e.id, d); const c = shiftOn(e, d); const swap = L('essRequests').some((r) => r.kind === 'shift_swap' && r.status === 'pending' && r.data.date === d && r.employeeId === e.id); return c === 'rest' ? h('td.is-rest', {}, 'راحة') : h('td', {}, lv ? h('span.sap-mss-shift.s-lv', {}, 'إجازة') : h('span.sap-mss-shift.s-' + c, { title: shiftTxt(c) }, c === 'day' ? 'نهاري' : c), swap ? h('div', {}, h('small', { style: 'color:var(--color-warning)' }, 'تبديل؟')) : null); })));
    box.append(h('div.sap-mss-roster', { role: 'region', 'aria-label': 'جدول الورديات الأسبوعي', tabindex: '0' }, h('table', {}, h('thead', {}, head2), h('tbody', {}, body))),
      h('div.sap-ess2-legend', {}, ['A', 'B', 'C', 'day'].map((c) => h('span', {}, h('span.sap-mss-shift.s-' + c, {}, c === 'day' ? 'نهاري' : c), ' ' + SHIFT_DEF[c].from + ' – ' + SHIFT_DEF[c].to)), h('span', {}, h('span.sap-mss-shift.s-lv', {}, 'إجازة'), ' موافق عليها')));
  } };

  /* phone-style report forms (violation → hr-disciplinary, incident → hr-ohs) */
  MSS.report = { deps: ['violations', 'incidents'], static: true, render(box, X) {
    const me = SA.session.user; const mem = team(X.emp); const lockR = previewReason(X.w);
    const forms = h('div.sap-mss-forms', {});
    /* violation */
    const V = { type: 'تأخير متكرر' }; const VT = ['تأخير متكرر', 'مخالفة سلامة', 'سلوك غير لائق', 'إهمال في العمل', 'غياب بلا إذن', 'أخرى'];
    const ve = SA.form.field({ name: 'e', label: 'الموظف', type: 'select', required: true, options: [['', 'اختر…']].concat(mem.map((x) => [x.id, x.name])) }); const vd = SA.form.field({ name: 'd', label: 'تاريخ الواقعة', type: 'date', required: true, value: today() }); const vt = SA.form.field({ name: 't', label: 'وصف الواقعة (وقائع فقط)', type: 'textarea', rows: 3, required: true, rules: [SA.form.rules.min(10)] });
    const vcard = h('section.sap-mss-phone', {}, h('h2', {}, SA.icon('alert', 'icon-lg'), 'بلاغ مخالفة'), h('p.sap-ess2-note', { style: 'margin:0' }, 'بلاغ فقط — القرار والتحقيق عند HR ولن يظهر لك ملف التحقيق بعد التسليم.'), ve.el, h('span.label', {}, 'نوع المخالفة'), chipSet(VT.map((x) => [x, x]), V.type, (v) => { V.type = v; }), vd.el, vt.el,
      SA.btn({ label: 'تسليم البلاغ لـHR', icon: 'check', kind: 'primary', size: 'lg', reason: lockR, onClick: async (ev, btn) => {
        if (!SA.form.group([ve, vd, vt]).validate()) return; const e = empById(ve.get()); btn.disabled = true;
        const o = await run(() => { const id = st.nextId('violations', 'VIO-2026', 4); const rec = { id, employeeId: e.id, reporterId: me.id, type: V.type, date: vd.get(), description: vt.get().trim(), status: 'reported', channel: 'mss', createdAt: new Date().toISOString() }; st.insert('violations', rec, true); SA.audit('HR.DISCIPLINE.REPORTED', { target: { type: 'violation', id, label: V.type + ' — ' + e.name }, after: { type: V.type, date: rec.date }, reason: rec.description, via: via() }); noteTo({ title: 'بلاغ مخالفة جديد: ' + V.type, body: e.name + ' — من المشرف ' + me.name, level: 'action', to: ['R-11'], link: '#/hr/disciplinary' }); return rec; });
        btn.disabled = false; if (o.ok) { ve.set(''); vt.set(''); SA.toast('تم تسليم البلاغ ' + o.r.id + ' لـHR', 'success'); } } }));
    /* incident */
    const I = { type: 'near_miss', loc: deptName(X.emp.departmentId) }; const locs = L('departments').filter((d) => /^D-(09|1[0-3])$/.test(d.id)).map((d) => d.name).concat(['المخزن', 'الساحة']);
    const iw = SA.form.field({ name: 'w', label: 'مين المتأثر؟ (اختياري)', type: 'select', options: [['', 'لا أحد / غير محدد']].concat(mem.map((x) => [x.id, x.name])) }); const it = SA.form.field({ name: 't', label: 'إيه اللي حصل؟', type: 'textarea', rows: 3, required: true, rules: [SA.form.rules.min(5)] });
    const icard = h('section.sap-mss-phone', {}, h('h2', {}, SA.icon('health', 'icon-lg'), 'بلاغ حادث سريع'), h('p.sap-ess2-note', { style: 'margin:0' }, 'بيوصل مسؤول السلامة فورًا (عاجل للإصابة) ويفتح سجل في السلامة.'), choiceGrid([{ id: 'injury', icon: 'health', label: 'إصابة', danger: true }, { id: 'near_miss', icon: 'alert', label: 'شبه حادث' }, { id: 'hazard', icon: 'bolt', label: 'خطر' }, { id: 'other', icon: 'info', label: 'أخرى' }], I.type, (v) => { I.type = v; }), h('span.label', {}, 'المكان'), chipSet(locs.map((x) => [x, x]), I.loc, (v) => { I.loc = v; }), iw.el, it.el,
      SA.btn({ label: 'إرسال البلاغ', icon: 'alert', kind: 'accent', size: 'lg', reason: lockR, onClick: async (ev, btn) => {
        if (!it.validate()) return; btn.disabled = true; const w = iw.get() ? empById(iw.get()) : null;
        const o = await run(() => createIncident({ type: I.type, location: I.loc, description: it.get().trim(), employeeId: w ? w.id : null, reporterId: me.id, channel: 'mss' })); btn.disabled = false; if (o.ok) { it.set(''); SA.toast('تم تسجيل البلاغ ' + o.r.id + ' وإبلاغ السلامة', 'success'); } } }));
    forms.append(vcard, icard);
    const mineV = L('violations').filter((v) => v.reporterId === me.id).slice(0, 4); const mineI = L('incidents').filter((v) => v.reporterId === me.id && v.channel === 'mss').slice(0, 4);
    box.append(offBanner(), forms, (mineV.length || mineI.length) ? SA.card({ title: 'بلاغاتك الأخيرة' }, h('div.sap-ess2-list', {}, mineV.map((v) => h('div.sap-mss-person', {}, SA.icon('alert'), h('div.sap-mss-info', {}, h('b', {}, v.type + ' — ' + (empById(v.employeeId) || {}).name), h('small', {}, v.id + ' · ' + SA.fmt.rel(v.createdAt))), SA.chip('تم التسليم لـHR', 'info'))), mineI.map((v) => h('div.sap-mss-person', {}, SA.icon('health'), h('div.sap-mss-info', {}, h('b', {}, v.location + ' — ' + v.description.slice(0, 40)), h('small', {}, v.id + ' · ' + SA.fmt.rel(v.createdAt))), SA.chip('وصل السلامة', 'info'))))) : null);
  } };

  MSS.probation = { deps: ['probationReviews', 'employees'], static: false, render(box, X) {
    const me = SA.session.user; const mem = team(X.emp).filter((e) => e.status === 'probation'); const days = (st.get('settings.hr.probationDays')) || 90; const lockR = previewReason(X.w) || offReason();
    box.append(offBanner(), h('p.sap-ess2-note', {}, 'تقييمك توصية فقط — قرار إنهاء التجربة أو التثبيت عند HR. مدة التجربة: ', typeof days === 'number' && st.get('settings.hr.probationDays') ? days + ' يوم' : SA.demoValue('90 يوم — [Law] Pending')));
    if (!mem.length) { box.append(SA.empty({ icon: 'userplus', title: 'مفيش تقييمات تجربة مستحقة', text: 'الموظفين تحت التجربة في فريقك بيظهروا هنا.' })); return; }
    mem.forEach((e) => {
      const due = addDays(e.hireDate, days); const late = due < today(); const diff = Math.round((new Date(due + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 86400000);
      const rev = L('probationReviews').find((r) => r.employeeId === e.id && r.status === 'submitted');
      let out = 'continue'; const nf = SA.form.field({ name: 'n', label: 'ملاحظاتك (إلزامي)', type: 'textarea', rows: 3, required: true, rules: [SA.form.rules.min(10)] });
      box.append(h('div.sap-mss-q', {}, h('div.sap-mss-q-head', {}, SA.avatar(e.name), h('div', {}, h('b', {}, e.name), h('small.t-muted', {}, posTitle(e) + ' · تعيين ' + fdate(e.hireDate))), late ? SA.chip('مستحق — متأخر ' + Math.abs(diff) + ' يوم', 'danger') : SA.chip('مستحق بعد ' + diff + ' يوم', 'warning')), SA.kv([['نهاية التجربة المتوقعة', fdate(due)], ['الحضور', 'من سجل الحضور']]),
        rev ? banner('info', 'checkcircle', h('b', {}, 'تم التسليم: '), { continue: 'يستمر', discuss: 'يحتاج نقاش', end: 'لا يستمر' }[rev.outcome] + ' — ' + rev.notes + ' (بانتظار قرار HR)') : [choiceGrid([{ id: 'continue', icon: 'checkcircle', label: 'يستمر / يُثبَّت' }, { id: 'discuss', icon: 'users', label: 'يحتاج نقاش' }, { id: 'end', icon: 'userx', label: 'لا يستمر', danger: true }], out, (v) => { out = v; }), nf.el,
          SA.btn({ label: 'إرسال التقييم لـHR', icon: 'check', kind: 'primary', size: 'lg', reason: lockR, onClick: async (ev, btn) => { if (!nf.validate()) return; btn.disabled = true; const o = await run(() => { const id = st.nextId('probationReviews', 'PBR', 3); st.insert('probationReviews', { id, employeeId: e.id, reviewerId: me.id, outcome: out, notes: nf.get().trim(), status: 'submitted', createdAt: new Date().toISOString() }); SA.audit('HR.PROBATION.REVIEW_SUBMITTED', { target: { type: 'employee', id: e.id, label: 'تقييم تجربة — ' + e.name }, after: { outcome: out }, reason: nf.get().trim(), via: via() }); noteTo({ title: 'تقييم فترة تجربة: ' + e.name, body: 'توصية المشرف: ' + ({ continue: 'يستمر', discuss: 'يحتاج نقاش', end: 'لا يستمر' }[out]), level: 'action', to: ['R-11', 'R-12'], link: '#/hr/onboarding' }); }); btn.disabled = false; if (o.ok) SA.toast('تم إرسال التقييم لـHR', 'success'); } })]));
    });
  } };

  const MSS_TABS = [['today', 'اليوم', 'users'], ['approvals', 'الاعتمادات', 'check'], ['roster', 'الجدول', 'calendar'], ['report', 'بلاغات', 'alert'], ['probation', 'التجربة', 'userplus']];
  function renderMss(root, ctx) {
    ensure(); const w = who(true); const tab = MSS[ctx.path[0]] ? ctx.path[0] : 'today'; const arg = ctx.path[1] || '';
    ctx.setCrumbs([{ label: 'فريقي' }, { label: (MSS_TABS.find((t) => t[0] === tab) || [0, 'اليوم'])[1] }]);
    const cleanups = []; let disposed = false; let clean = null; const X = { w, emp: w.emp, filter: arg, arg, go: (s, a) => SA.nav('hr/team' + (s === 'today' && !a ? '' : '/' + s + (a ? '/' + a : ''))) };
    const wrap = h('div.sap-mss', {}); root.append(wrap);
    if (!w.emp) { wrap.append(SA.pageHead({ title: 'فريقي', desc: 'متابعة فريقك والاعتمادات بنقرة (HR-32 · MSS)' }), previewPicker(true)); return; }
    const mem = team(w.emp); const pendingN = () => (w.emp ? queueItems({ id: w.emp.id, userId: w.preview ? w.emp.userId : SA.session.userId }).length : 0);
    const tabsC = SA.tabs({ tabs: MSS_TABS.map((t) => ({ id: t[0], label: t[1], icon: t[2], badge: t[0] === 'approvals' && pendingN() ? pendingN() : null })), active: tab, onChange: (id) => X.go(id), label: 'أقسام فريقي' });
    const view = h('div.sap-mss', { id: 'panel-' + tab, role: 'tabpanel' });
    wrap.append(SA.pageHead({ title: 'فريقي', desc: w.emp.name + ' · ' + deptName(w.emp.departmentId) + ' · ' + mem.length + ' من الفريق', tags: [SA.tag('pending', 'HR-32')], actions: [SA.btn({ label: 'خدماتي (حسابي)', icon: 'user', kind: 'ghost', onClick: () => SA.nav('hr/ess') }), SA.btn({ label: 'الكشك', icon: 'scan', kind: 'ghost', onClick: () => SA.nav('hr/kiosk') })] }), previewBar(w, true), tabsC.el, view);
    function draw(first) {
      if (disposed) return; if (clean) { try { clean(); } catch (e) { /* noop */ } clean = null; }
      const go = () => { if (disposed) return; SA.clear(view); try { const c = MSS[tab].render(view, X); if (typeof c === 'function') clean = c; } catch (e) { console.error(e); view.append(SA.errorState({ text: SA.errorText(e), onRetry: () => draw(true) })); } tabsC.setBadge('approvals', pendingN() || null); };
      if (first) { SA.clear(view); view.append(SA.skeleton({ kind: 'table', rows: 5 })); SA.delay(160, { write: false }).then(go, go); } else go();
    }
    (MSS[tab].deps || []).forEach((p) => cleanups.push(st.subscribe(p, () => draw(false)))); if (!MSS[tab].static) cleanups.push(st.subscribe('tour.sim', () => draw(false)));
    draw(true);
    return () => { disposed = true; cleanups.forEach((f) => { try { f(); } catch (e) { /* noop */ } }); if (clean) try { clean(); } catch (e) { /* noop */ } };
  }

  /* ═════════════════════════════ الكشك — شاشة مشتركة عند الخط ═════════════════════════════ */
  const kioskLocks = new Set();
  const KIOSK = { id: 'KIOSK-01', battery: 86 };
  function renderKiosk(root, ctx) {
    ensure(); ctx.setCrumbs([{ label: 'الكشك' }]);
    root.classList.add('sap-ksk-host');
    const stage = h('div.sap-ksk', { tabindex: '-1' }); root.append(stage);
    const IDLE = 15; const S = { view: 'idle', method: 'code', digits: '', pin: '', emp: null, msg: null, secs: IDLE, fails: {}, rep: { type: null, loc: null }, tmp: null };
    let disposed = false; let clockEl = null, barEl = null, dateEl = null;
    const actorOf = (e) => ({ id: e.userId || e.id, name: e.name, roleId: (userOfEmp(e) || {}).roleId || null });
    const dept = () => (S.emp ? deptName(S.emp.departmentId) : 'خط بثق الأبواب');
    function topbar() {
      return h('div.sap-ksk-top', {}, h('span', {}, SA.icon('scan'), KIOSK.id + ' · ' + 'خط بثق الأبواب'), h('span', {}, SA.icon(SA.sim.offline ? 'wifioff' : 'wifi'), SA.sim.offline ? 'غير متصل — البصمة تُحفظ محليًا' : 'متصل'), h('span', {}, SA.icon('battery'), 'البطارية ' + KIOSK.battery + '% (تجريبي)'), h('span', {}, 'آخر نبضة ' + hm(new Date())));
    }
    function safety() {
      const when = (i) => new Date(i.occurredAt || i.date || i.at || i.createdAt || '').getTime(); const inj = L('incidents').filter((i) => (i.type === 'injury' || i.kind === 'injury' || i.category === 'injury') && isFinite(when(i))).sort((a, b) => when(b) - when(a))[0]; const days = inj ? Math.max(0, Math.floor((Date.now() - when(inj)) / 86400000)) : 128;
      return h('div.sap-ksk-safety', {}, SA.icon('shield'), h('span', {}, 'السلامة أولًا — ارتدِ الخوذة والنظارة والحذاء'), h('em', {}, 'أيام منذ آخر إصابة: ' + days + (inj ? '' : ' (تجريبي)')));
    }
    const msgNode = () => (S.msg ? h('div.sap-ksk-msg' + (S.msg.kind === 'err' ? '.is-err' : S.msg.kind === 'ok' ? '.is-ok' : ''), { role: 'status' }, S.msg.text) : null);
    const bar = () => h('div.sap-ksk-bar', { 'aria-hidden': 'true' }, (barEl = h('i', { style: 'width:' + (S.secs / IDLE * 100) + '%' })));
    function reset(text, kind) { S.view = 'idle'; S.digits = ''; S.pin = ''; S.emp = null; S.tmp = null; S.msg = text ? { text, kind: kind || 'info' } : null; S.secs = IDLE; draw(); }
    function go(view, extra) { S.view = view; S.secs = IDLE; if (extra) Object.assign(S, extra); draw(); }
    function result(text, kind) { S.msg = { text, kind }; go('result'); }
    function keypad(onKey, onGo, goLabel) {
      const k = (label, cls, fn, aria) => h('button.sap-ksk-key' + (cls ? '.' + cls : ''), { type: 'button', 'aria-label': aria || null, onclick: fn }, label);
      return h('div.sap-ksk-pad', {}, ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => k(d, '', () => onKey(d))), k(SA.icon('backspace'), 'is-del', () => onKey('del'), 'مسح'), k('0', '', () => onKey('0')), k(goLabel || SA.icon('check'), 'is-go', onGo, 'تأكيد'));
    }
    function press(d) {
      S.secs = IDLE;
      if (S.view === 'id') { if (d === 'del') S.digits = S.digits.slice(0, -1); else if (S.digits.length < (S.method === 'nid' ? 4 : 6)) S.digits += d; draw(); if (S.method === 'nid' && S.digits.length === 4) submitId(); }
      else if (S.view === 'pin') { if (d === 'del') S.pin = S.pin.slice(0, -1); else if (S.pin.length < 6) S.pin += d; draw(); if (S.pin.length === 6) submitPin(); }
    }
    function failId(text) { S.msg = { text, kind: 'err' }; S.digits = ''; SA.audit('HR.ESS.LOGIN_FAILED', { target: { type: 'kiosk', id: KIOSK.id, label: 'دخول كشك فاشل' }, result: 'failure', reason: text, actor: { id: KIOSK.id, name: 'الكشك ' + KIOSK.id, roleId: null } }); draw(); }
    function submitId() {
      const d = S.digits; if (!d) return failId('اكتب رقمك الأول');
      const list = L('employees'); const e = S.method === 'code' ? list.find((x) => x.empNo === 'EMP-' + String(parseInt(d, 10) || 0).padStart(4, '0')) : list.filter((x) => x.nationalIdLast4 === d)[0];
      if (!e) return failId('الرقم غير صحيح — جرّب تاني');
      if (e.status === 'terminated' || e.status === 'suspended' || kioskLocks.has(e.id)) return failId('تعذّر الدخول — كلّم HR');
      S.msg = null; S.emp = e; S.view = 'pin'; S.pin = ''; S.secs = IDLE; draw();
    }
    function submitPin() {
      const e = S.emp;
      if (S.pin === '123456') { SA.audit('HR.ESS.LOGIN', { target: { type: 'kiosk', id: KIOSK.id, label: 'دخول الكشك' }, after: { method: S.method === 'code' ? 'كود + PIN' : 'رقم قومي + PIN' }, actor: actorOf(e), via: 'web' }); S.msg = null; go('menu'); return; }
      S.fails[e.id] = (S.fails[e.id] || 0) + 1; SA.audit('HR.ESS.LOGIN_FAILED', { target: { type: 'employee', id: e.id, label: e.name }, result: 'failure', reason: 'PIN خاطئ (' + S.fails[e.id] + ')', actor: { id: KIOSK.id, name: 'الكشك ' + KIOSK.id, roleId: null } });
      if (S.fails[e.id] >= 3) { kioskLocks.add(e.id); reset('تم إيقاف الدخول بعد 3 محاولات — كلّم HR. (العدد {Open} — قيمة تجريبية)', 'err'); return; }
      S.msg = { text: 'الرقم السري غلط — متبقي ' + (3 - S.fails[e.id]) + ' محاولة', kind: 'err' }; S.pin = ''; draw();
    }
    async function punch(dir, force) {
      const e = S.emp; const t = hm(new Date()); const code = shiftOn(e, today());
      if (!force && outsideShift(code, t)) { go('confirm', { tmp: { dir } }); return; }
      if (SA.sim.offline) {
        st.insert('kioskQueue', { id: st.nextId('kioskQueue', 'KQ', 3), employeeId: e.id, dir, deviceTs: new Date().toISOString(), status: 'queued' });
        SA.audit('HR.KIOSK.OFFLINE', { target: { type: 'employee', id: e.id, label: e.name }, after: { dir, deviceTime: t }, reason: 'الكشك دون اتصال — البصمة في الطابور المحلي', actor: actorOf(e) });
        return result('تم حفظ البصمة على الجهاز (الساعة ' + t + ') وهتتسجّل أول ما الاتصال يرجع.', 'ok');
      }
      const o = await run(() => { const x = applyPunch(e.id, dir, 'kiosk'); if (x.ok) SA.audit('HR.KIOSK.PUNCH', { target: { type: 'employee', id: e.id, label: (dir === 'in' ? 'حضور' : 'انصراف') + ' — ' + e.name }, after: { dir, time: x.time, status: x.status || null }, actor: actorOf(e) }); return x; });
      if (!o.ok) return result('حصلت مشكلة — جرّب تاني', 'err'); const x = o.r;
      if (x.dup) return result('سجّلت بصمتك قبل كده اليوم.', 'err'); if (x.noIn) return result('لازم تسجّل الحضور الأول.', 'err');
      result(dir === 'in' ? 'تم تسجيل حضورك الساعة ' + x.time + (x.late ? ' — متأخر عن الوردية' : ' — يوم موفق') : 'تم تسجيل انصرافك الساعة ' + x.time + ' — تسلم إيدك', x.late ? 'err' : 'ok');
    }
    async function sendReport() {
      const e = S.emp; if (!S.rep.type) { S.msg = { text: 'اختر نوع المشكلة الأول', kind: 'err' }; draw(); return; }
      const o = await run(() => createIncident({ type: S.rep.type, location: S.rep.loc || dept(), description: 'بلاغ سريع من الكشك ' + KIOSK.id, employeeId: e.id, reporterId: e.userId || e.id, channel: 'kiosk', actor: actorOf(e) }));
      if (o.ok) result('تم إرسال البلاغ لمسؤول السلامة' + (S.rep.type === 'injury' ? ' — عاجل. لو محتاج إسعاف نادِ المشرف فورًا.' : '.'), 'ok');
    }
    async function sendPpe(item) {
      const e = S.emp; const o = await run(() => { const rec = createEssRequest(e, 'ppe', 'طلب ' + item + ' (من الكشك)', { item, channel: 'kiosk' }, [{ roleId: 'R-12', label: 'HR Officer — تسليم العهدة' }], { ctx: [['الصنف', item], ['القناة', 'الكشك ' + KIOSK.id]] }); SA.audit('HR.ESS.REQUEST_SUBMITTED', { target: { type: 'ppe', id: rec.id, label: rec.title }, actor: actorOf(e) }); return rec; });
      if (o.ok) result('تم إرسال طلب ' + item + ' لـHR.', 'ok');
    }
    const tileBtn = (icon, title, sub, onClick, cls, dis) => h('button.sap-ksk-tile' + (cls ? '.' + cls : ''), { type: 'button', disabled: !!dis, onclick: onClick }, SA.icon(icon), title, sub ? h('small', {}, sub) : null);
    function draw() {
      if (disposed) return; SA.clear(stage); clockEl = barEl = dateEl = null;
      let body; const e = S.emp;
      if (S.view === 'idle') {
        body = [(clockEl = h('div.sap-ksk-clock', {}, hm(new Date()))), (dateEl = h('div.sap-ksk-date', {}, DAYN[dayIdx(today())] + ' ' + fdate(today()))), msgNode(), h('button.sap-ksk-start', { type: 'button', onclick: () => go('id') }, SA.icon('finger'), 'اضغط هنا — بصمتك وخدماتك'), h('p.sap-ess2-note', { style: 'color:#c5d3ee' }, 'مفيش مرتب ولا بيانات سرية على الكشك.')];
      } else if (S.view === 'id') {
        body = [h('h2', { style: 'margin:0;font-size:1.8rem' }, 'اكتب رقمك'), h('div.sap-ksk-seg', {}, [['code', 'رقم الموظف'], ['nid', 'آخر 4 من الرقم القومي']].map((m) => h('button', { type: 'button', 'aria-pressed': String(S.method === m[0]), onclick: () => { S.method = m[0]; S.digits = ''; S.msg = null; S.secs = IDLE; draw(); } }, m[1]))), h('div.sap-ksk-display', { 'aria-live': 'polite' }, S.digits || '—'), msgNode(), keypad(press, submitId), h('p.sap-ess2-note', { style: 'color:#c5d3ee' }, 'تجريبي: رقم الموظف مثلًا 17 (مصطفى عوض) · PIN 123456'), h('div.sap-ksk-seg', {}, h('button', { type: 'button', onclick: () => reset() }, 'رجوع'))];
      } else if (S.view === 'pin') {
        body = [h('div.sap-ksk-who', {}, SA.avatar(e.name), 'أهلًا ' + firstName(e.name)), h('h2', { style: 'margin:0;font-size:1.5rem' }, 'اكتب الرقم السري (PIN)'), h('div.sap-ksk-display', { 'aria-label': 'الرقم السري' }, S.pin ? '•'.repeat(S.pin.length) : '—'), msgNode(), keypad(press, () => { if (S.pin.length === 6) submitPin(); else { S.msg = { text: 'الـPIN 6 أرقام', kind: 'err' }; draw(); } }), h('div.sap-ksk-seg', {}, h('button', { type: 'button', onclick: () => reset() }, 'مش أنا — رجوع'))];
      } else if (S.view === 'menu') {
        const rec = todayRec(e.id); const done = rec && rec.in && rec.out; const inn = rec && rec.in && !rec.out; const lv = leaveOn(e.id, today());
        body = [h('div.sap-ksk-who', {}, SA.avatar(e.name), e.name), msgNode(), h('div.sap-ksk-tiles', {},
          tileBtn(inn ? 'logout' : 'finger', done ? 'تم تسجيل الحضور والانصراف' : inn ? 'تسجيل انصراف' : 'تسجيل حضور', done ? 'تسلم إيدك' : lv ? 'أنت في إجازة اليوم' : inn ? 'حضورك ' + rec.in : 'ورديتك ' + shiftTxt(shiftOn(e, today())), () => punch(inn ? 'out' : 'in'), done ? '' : inn ? 'is-out' : 'is-in', done),
          tileBtn('calendar', 'ورديتي', 'جدولك الأيام الجاية', () => go('sched')), tileBtn('clipboard', 'رصيد إجازتي', 'سنوي · عارضة · مرضي', () => go('bal')), tileBtn('alert', 'بلّغ مشكلة', 'إصابة · خطر · شبه حادث', () => go('report', { rep: { type: null, loc: deptName(e.departmentId) } })), tileBtn('box', 'طلب زي / PPE', 'خوذة · نظارة · قفازات', () => go('ppe'))), bar(), h('div.sap-ksk-seg', {}, h('button', { type: 'button', onclick: () => reset('تم الخروج — خلّي بالك من سلامتك') }, 'خروج'))];
      } else if (S.view === 'confirm') {
        const code = shiftOn(e, today()); body = [h('div.sap-ksk-msg.is-err', {}, 'الوقت الآن خارج ورديتك (' + shiftTxt(code) + '). تسجّل رغم كده؟ المشرف هيتنبّه.'), h('div.sap-ksk-seg', {}, h('button', { type: 'button', onclick: () => punch(S.tmp.dir, true) }, 'سجّل رغم كده'), h('button', { type: 'button', onclick: () => go('menu') }, 'إلغاء')), bar()];
      } else if (S.view === 'sched') {
        body = [h('h2', { style: 'margin:0;font-size:1.8rem' }, 'ورديتي'), h('div.sap-ksk-lines', {}, [0, 1, 2, 3].map((i) => { const d = addDays(today(), i); const c = shiftOn(e, d); return h('div.sap-ksk-line' + (i === 0 ? '.is-today' : ''), {}, h('b', {}, i === 0 ? 'اليوم' : DAYN[dayIdx(d)] + ' ' + fdate(d)), h('span', {}, c === 'rest' ? 'راحة' : shiftTxt(c) + ' · ' + shiftName(c))); })), bar(), h('div.sap-ksk-seg', {}, h('button', { type: 'button', onclick: () => go('menu') }, 'رجوع'))];
      } else if (S.view === 'bal') {
        body = [h('h2', { style: 'margin:0;font-size:1.8rem' }, 'رصيد إجازتي'), h('div.sap-ksk-lines', {}, [['annual', 'سنوية'], ['casual', 'عارضة'], ['sick', 'مرضية']].map((t) => { const b = balanceOf(e.id, t[0]); return h('div.sap-ksk-line', {}, h('b', {}, t[1]), h('span', {}, b ? b.balanceDays + ' يوم' : 'غير مُعدّ')); })), bar(), h('div.sap-ksk-seg', {}, h('button', { type: 'button', onclick: () => go('menu') }, 'رجوع'))];
      } else if (S.view === 'report') {
        body = [h('h2', { style: 'margin:0;font-size:1.8rem' }, 'بلّغ مشكلة'), msgNode(), h('div.sap-ksk-tiles', { style: 'max-width:760px' }, [['injury', 'health', 'إصابة'], ['near_miss', 'alert', 'شبه حادث'], ['hazard', 'bolt', 'خطر'], ['other', 'info', 'أخرى']].map((t) => h('button.sap-ksk-tile', { type: 'button', 'aria-pressed': String(S.rep.type === t[0]), style: S.rep.type === t[0] ? 'outline:5px solid #fff;background:#fdf0dc;min-height:130px' : 'min-height:130px', onclick: () => { S.rep.type = t[0]; S.msg = null; S.secs = IDLE; draw(); } }, SA.icon(t[1]), t[2]))), h('div.sap-ksk-seg', {}, [deptName(e.departmentId), 'المخزن', 'الساحة'].map((l) => h('button', { type: 'button', 'aria-pressed': String(S.rep.loc === l), onclick: () => { S.rep.loc = l; S.secs = IDLE; draw(); } }, l))), h('button.sap-ksk-start', { type: 'button', onclick: sendReport }, SA.icon('alert'), 'إرسال البلاغ'), bar(), h('div.sap-ksk-seg', {}, h('button', { type: 'button', onclick: () => go('menu') }, 'رجوع'))];
      } else if (S.view === 'ppe') {
        body = [h('h2', { style: 'margin:0;font-size:1.8rem' }, 'محتاج إيه؟'), h('div.sap-ksk-tiles', {}, ['خوذة', 'نظارة', 'قفازات', 'حذاء أمان', 'زي عمل'].map((it) => tileBtn('box', it, '', () => sendPpe(it)))), bar(), h('div.sap-ksk-seg', {}, h('button', { type: 'button', onclick: () => go('menu') }, 'رجوع'))];
      } else {
        body = [msgNode(), bar(), h('div.sap-ksk-seg', {}, h('button', { type: 'button', onclick: () => go('menu') }, 'ارجع للقائمة'), h('button', { type: 'button', onclick: () => reset('تم الخروج — خلّي بالك من سلامتك') }, 'خروج'))];
      }
      stage.append(topbar(), safety(), h('div.sap-ksk-body', {}, body), h('div.sap-ksk-foot', {}, h('span', {}, 'EG-Kiosk (نموذج تجريبي) · لا يعرض أي أجر أو بيانات سرية · عودة تلقائية بعد ' + IDLE + ' ثانية'), h('button', { type: 'button', onclick: adminExit }, 'خروج المسؤول')));
      if (S.view !== 'idle') { const f = stage.querySelector('.sap-ksk-key, .sap-ksk-tile:not([disabled]), .sap-ksk-start, .sap-ksk-seg button'); if (f && document.activeElement === document.body) f.focus({ preventScroll: true }); }
    }
    async function adminExit() {
      const ok = await askPin({ title: 'خروج المسؤول (Admin PIN)', text: 'للخروج من وضع الكشك اكتب الـPIN الخاص بالمسؤول.', confirmLabel: 'خروج', key: 'kiosk-admin' }); if (!ok) return;
      SA.audit('HR.KIOSK.ADMIN_EXIT', { target: { type: 'kiosk', id: KIOSK.id, label: 'خروج المسؤول من وضع الكشك' }, after: { locks_cleared: kioskLocks.size } }); kioskLocks.clear(); SA.nav(SA.homeRoute() || 'hr/ess');
    }
    const onKey = (ev) => { if (!/^(id|pin)$/.test(S.view) || /INPUT|TEXTAREA|SELECT/.test((ev.target || {}).tagName || '')) return; if (/^\d$/.test(ev.key)) { ev.preventDefault(); press(ev.key); } else if (ev.key === 'Backspace') { ev.preventDefault(); press('del'); } else if (ev.key === 'Enter' && S.view === 'id') { ev.preventDefault(); submitId(); } };
    stage.addEventListener('keydown', onKey); stage.addEventListener('pointerdown', () => { S.secs = IDLE; });
    const iv = setInterval(() => { if (disposed) return; if (clockEl) clockEl.textContent = hm(new Date()); if (S.view !== 'idle') { S.secs--; if (barEl) barEl.style.width = Math.max(0, S.secs / IDLE * 100) + '%'; if (S.secs <= 0) reset('رجعنا للشاشة الرئيسية لعدم الاستخدام.'); } }, 1000);
    const unsub = [st.subscribe('tour.sim', () => { if (S.view === 'idle' || S.view === 'id') draw(); }), st.subscribe('attendance', () => { if (S.view === 'menu') draw(); })];
    draw();
    return () => { disposed = true; clearInterval(iv); unsub.forEach((f) => f()); root.classList.remove('sap-ksk-host'); };
  }

  /* ═════════════════════════════ المركز: خدماتي · فريقي · الكشك (جهة HR) ═════════════════════════════ */
  function hubRequests() {
    const rows = [];
    L('leaveRequests').filter((r) => r.source === 'ess' || r.source === 'onbehalf').forEach((r) => rows.push({ id: r.id, type: 'إجازة ' + LEAVE_T[r.type], emp: empById(r.employeeId), status: r.status === 'pending' && r.stage === 'hr' ? 'at_hr' : r.status, at: r.createdAt, ap: r.approvalId, via: r.source === 'onbehalf' ? 'بالنيابة' : 'خدماتي' }));
    L('loans').filter((r) => r.source === 'ess' || r.id === 'LN-2026-0001').forEach((r) => rows.push({ id: r.id, type: 'سلفة ' + SA.fmt.money(r.amount), emp: empById(r.employeeId), status: r.status === 'requested' ? 'pending' : r.status, at: r.requestedAt, ap: r.approvalId, via: 'خدماتي' }));
    L('docRequests').forEach((r) => rows.push({ id: r.id, type: DOC_T[r.docType] || 'مستند', emp: empById(r.employeeId), status: r.status, at: r.createdAt, ap: r.approvalId, via: 'خدماتي' }));
    L('essRequests').forEach((r) => rows.push({ id: r.id, type: (KIND_T[r.kind] || [r.kind])[0], emp: empById(r.employeeId), status: r.status, at: r.createdAt, ap: r.approvalId, via: r.onBehalf ? 'بالنيابة' : 'خدماتي' }));
    L('overtimeRequests').forEach((r) => rows.push({ id: r.id, type: 'أوفرتايم ' + r.hours + ' ساعة', emp: empById(r.employeeId), status: r.status, at: r.createdAt, ap: r.approvalId, via: 'فريقي' }));
    return rows.sort((a, b) => new Date(b.at) - new Date(a.at));
  }
  function renderHub(root, ctx) {
    ensure(); const tab = ['overview', 'requests', 'devices', 'acks'].indexOf(ctx.path[0]) >= 0 ? ctx.path[0] : 'overview';
    ctx.setCrumbs([{ label: 'خدماتي والكشك' }]);
    const wrap = h('div.sap-mss', {}); root.append(wrap); const view = h('div.sap-mss', {}); let disposed = false; const offs = [];
    const tabs = SA.tabs({ tabs: [{ id: 'overview', label: 'القنوات', icon: 'phoneframe' }, { id: 'requests', label: 'الطلبات الواردة', icon: 'inbox' }, { id: 'devices', label: 'الأجهزة والمزامنة', icon: 'scan' }, { id: 'acks', label: 'الإقرارات', icon: 'doc' }], active: tab, onChange: (id) => SA.nav('hr/channels' + (id === 'overview' ? '' : '/' + id)) });
    wrap.append(SA.pageHead({ title: 'خدماتي · فريقي · الكشك', desc: 'قنوات الخدمة الذاتية للعاملين والمشرفين (HR-32) — وهنا بتشوف جهة HR: الطلبات الواردة والأجهزة والإقرارات.', tags: [SA.tag('pending', 'HR-32')] }), tabs.el, view);
    const hubCard = (icon, title, desc, btns) => h('div.sap-hub-card', {}, h('span.sap-hub-ico', {}, SA.icon(icon, 'icon-lg')), h('h3', {}, title), h('p', {}, desc), h('div.sap-actions', {}, btns));
    function draw() {
      if (disposed) return; SA.clear(view);
      if (tab === 'overview') {
        view.append(h('div.sap-hub-grid', {},
          hubCard('user', 'خدماتي (ويب)', 'واجهة مبسطة بأزرار كبيرة: وردتي، مرتبي، إجازتي، طلباتي، بلّغ مشكلة. جهاز شخصي أو مشترك.', [SA.btn({ label: 'افتح خدماتي', icon: 'user', perm: 'hr.ess.use', onClick: () => SA.nav('hr/ess') })]),
          hubCard('phoneframe', 'خدماتي داخل هاتف', 'نفس الشاشات داخل إطار هاتف (EG-Mobile) مع شريط تبويب سفلي.', [SA.btn({ label: 'افتح في الإطار', icon: 'phoneframe', kind: 'ghost', perm: 'hr.ess.use', onClick: () => SA.nav('hr/ess', { query: { frame: 'phone' } }) })]),
          hubCard('users', 'فريقي (للمشرف)', 'اليوم: حاضر/متأخر/غائب · اعتمادات بنقرة · جدول الورديات · بلاغ مخالفة وحادث · تقييم التجربة.', [SA.btn({ label: 'افتح فريقي', icon: 'users', perm: 'hr.mss.use', onClick: () => SA.nav('hr/team') })]),
          hubCard('scan', 'الكشك عند الخط', 'أزرار ضخمة: كود/رقم قومي + PIN ← بصمة، ورديتي، رصيدي، بلاغ. عودة تلقائية بعد 15 ثانية، وطابور دون اتصال.', [SA.btn({ label: 'افتح الكشك', icon: 'scan', onClick: () => SA.nav('hr/kiosk') })])),
          SA.card({ title: 'جرّب رحلة كاملة' }, h('ol', { style: 'margin:0;padding-inline-start:20px;line-height:2' }, h('li', {}, 'ادخل كـ«موظف» (employee@eg-demo.test) ← خدماتي ← اطلب إجازة.'), h('li', {}, 'ادخل كـ«مشرف» (supervisor@eg-demo.test) ← فريقي ← الاعتمادات ← اعتمد (بيشوف تنبيه التغطية).'), h('li', {}, 'ادخل كـ«HR Manager» (hr@eg-demo.test) ← صندوق الاعتمادات ← راجع الطلب (الخطوة التانية) ← وشوف الحدث في سجل التدقيق.'), h('li', {}, 'جرّب «غير متصل» من وضع الاختبار: الاعتماد يتقفل، والإجازة/البلاغ يتحفظوا كمسودة.'))),
          SA.alert('info', 'أي حساب بدون ملف موظف (مثل صاحب الشركة) يفتح خدماتي/فريقي كمعاينة للقراءة فقط بعد اختيار موظف.'));
      } else if (tab === 'requests') {
        const rows = hubRequests();
        view.append(h('div.card.card-flush.sap-listcard', {}, SA.table({ id: 'ess-req', rowId: 'id', pageSize: 10, caption: 'الطلبات الواردة من خدماتي وفريقي', rows: () => hubRequests(),
          search: { placeholder: 'ابحث برقم الطلب أو الموظف…', keys: [(r) => r.id, (r) => (r.emp || {}).name, (r) => r.type] }, filters: [{ key: 'status', label: 'الحالة', options: [['pending', 'بانتظار'], ['at_hr', 'عند HR'], ['approved', 'تمت الموافقة'], ['rejected', 'مرفوض'], ['requested', 'مستند بانتظار HR'], ['issued', 'مستند جاهز']] }],
          columns: [{ key: 'id', label: 'الرقم', sort: true, render: (r) => dirLtr(r.id) }, { key: 'type', label: 'الطلب', sort: true }, { key: 'emp', label: 'الموظف', value: (r) => (r.emp || {}).name, sort: true, render: (r) => (r.emp ? SA.userCell(r.emp, { sub: deptName(r.emp.departmentId) }) : '—') }, { key: 'via', label: 'القناة' }, { key: 'status', label: 'الحالة', sort: true, render: (r) => reqChip(r.status) }, { key: 'at', label: 'الوقت', sort: (a, b) => new Date(a.at) - new Date(b.at), render: (r) => h('span.t-muted', { title: SA.fmt.dt(r.at) }, SA.fmt.rel(r.at)) }],
          rowActions: (r) => [{ label: 'فتح في صندوق الاعتمادات', icon: 'inbox', disabled: r.ap && SA.can('sa.approvals.view') ? false : r.ap ? 'تحتاج sa.approvals.view' : 'لا يوجد اعتماد مرتبط', onClick: () => SA.nav('approvals/' + r.ap) }],
          onRowClick: (r) => { if (r.ap && SA.can('sa.approvals.view')) SA.nav('approvals/' + r.ap); else SA.toast(r.ap ? 'فتح الاعتماد يحتاج صلاحية الصندوق (sa.approvals.view). افتحه من إشعارك أو من شاشة HR المختصة.' : 'لا يوجد اعتماد مرتبط بهذا الطلب', 'info'); },
          empty: { icon: 'inbox', title: 'لا توجد طلبات واردة بعد', text: 'لما يقدّم موظف طلبًا من «خدماتي» هيظهر هنا فورًا.' } }).el), rows.length ? null : null);
      } else if (tab === 'devices') {
        const q = L('essQueue'); const kq = L('kioskQueue'); const nq = (a, s) => a.filter((x) => x.status === s).length;
        view.append(h('div.sap-mss-sum', {}, [['أجهزة الكشك', '1 (تجريبي)'], ['بصمات كشك بالطابور', nq(kq, 'queued')], ['مسودات خدماتي بالطابور', nq(q, 'queued')], ['تعارضات مزامنة', nq(kq, 'conflict') + nq(q, 'conflict')]].map((s) => h('div', {}, h('span', {}, s[0]), h('b.num', {}, s[1])))),
          SA.card({ title: 'حالة الأجهزة (نبضة الجهاز)' }, SA.kv([['الجهاز', KIOSK.id + ' — خط بثق الأبواب'], ['الشبكة', SA.sim.offline ? SA.chip('غير متصل', 'danger') : SA.chip('متصل', 'success')], ['البطارية', KIOSK.battery + '% (تجريبي)'], ['آخر نبضة', SA.fmt.dt(new Date().toISOString())], ['إنذار انقطاع الكشك أثناء الوردية', SA.openValue('15 دقيقة — Pending (N-49)')]])),
          SA.card({ title: 'طابور المزامنة', flush: true }, (kq.length + q.length) ? h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['الرقم', 'النوع', 'الموظف', 'وقت الجهاز', 'الحالة'].map((x) => h('th', {}, x)))), h('tbody', {}, kq.map((r) => h('tr', {}, h('td', {}, r.id), h('td', {}, 'بصمة كشك — ' + (r.dir === 'in' ? 'حضور' : 'انصراف')), h('td', {}, (empById(r.employeeId) || {}).name), h('td', {}, SA.fmt.dt(r.deviceTs)), h('td', {}, chipOf(r.status === 'synced' ? 'applied' : r.status)))).concat(q.map((r) => h('tr', {}, h('td', {}, r.id), h('td', {}, r.label), h('td', {}, (empById(r.employeeId) || {}).name), h('td', {}, SA.fmt.dt(r.createdAtClient)), h('td', {}, chipOf(r.status === 'synced' ? 'applied' : r.status)))))))) : SA.empty({ icon: 'activity', title: 'الطابور فاضي', text: 'فعّل «Offline» من وضع الاختبار وسجّل بصمة على الكشك لتشوف الطابور.' })));
      } else {
        const act = L('employees').filter((e) => e.status !== 'terminated'); const docs = L('policyDocs');
        view.append(SA.card({ title: 'تتبّع الإقرارات (BR-ESS-14)', flush: true }, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, ['السياسة', 'الإصدار', 'الإلزام', 'وقّعوا', 'النسبة'].map((x) => h('th', {}, x)))), h('tbody', {}, docs.map((d) => { const n = act.filter((e) => L('acknowledgements').some((a) => a.employeeId === e.id && a.docId === d.id && a.docVersion === d.version)).length; const pct = act.length ? Math.round(n / act.length * 100) : 0; return h('tr', {}, h('td', {}, h('b', {}, d.title)), h('td', {}, 'v' + d.version), h('td', {}, d.mandatory ? SA.chip('إلزامي', 'warning') : SA.chip('اختياري', 'neutral')), h('td', {}, n + ' من ' + act.length), h('td', {}, SA.chip(pct + '%', pct >= 80 ? 'success' : pct >= 30 ? 'warning' : 'danger'))); })))), h('p.sap-ess2-note', { style: 'padding:12px 16px;margin:0' }, 'الإقرار يحفظ الإصدار ووقت التوقيع والجهاز. تغيّر الإصدار = إقرار جديد. مهلة 60 يومًا للائحة CMP-07 من بلوغ العتبة {Pending}.')));
      }
    }
    ['leaveRequests', 'essRequests', 'docRequests', 'loans', 'overtimeRequests', 'essQueue', 'kioskQueue', 'acknowledgements', 'tour.sim'].forEach((p) => offs.push(st.subscribe(p, () => { if (tab !== 'requests') draw(); })));
    view.append(SA.skeleton({ kind: 'cards', rows: 4 })); SA.delay(160, { write: false }).then(draw, draw);
    return () => { disposed = true; offs.forEach((f) => f()); };
  }

  /* ═════════════════════════════ registration ═════════════════════════════ */
  const navOrder = (id) => { const d = (SA.hrNav || []).find((x) => x.id === id); return d ? d.order : 40; };
  SA.register({ id: 'hr-ess', app: 'hr', group: 'hr-dash', title: 'خدماتي', icon: 'user', route: 'hr/ess', perm: 'hr.ess.use', order: 0, desc: 'الخدمة الذاتية للموظف: وردتي، مرتبي، إجازتي، طلباتي، بلّغ مشكلة', nav: false, render: renderEss });
  SA.register({ id: 'hr-mss', app: 'hr', group: 'hr-dash', title: 'فريقي', icon: 'users', route: 'hr/team', perm: 'hr.mss.use', order: navOrder('hr-mss'), desc: 'واجهة المشرف: اليوم، اعتمادات بنقرة، الجدول، بلاغات، التجربة', render: renderMss, badge() { try { const e = (st.get('employees') || []).find((x) => x.userId === SA.session.userId); return e ? queueItems({ id: e.id, userId: SA.session.userId }).length || null : null; } catch (x) { return null; } } });
  SA.register({ id: 'hr-kiosk', app: 'hr', group: 'hr-dash', title: 'الكشك', icon: 'scan', route: 'hr/kiosk', perm: null, order: 36, desc: 'وضع الكشك عند الخط (محاكاة جهاز مشترك)', nav: false, render: renderKiosk });
  SA.register({ id: 'hr-channels', app: 'hr', group: 'hr-dash', title: 'خدماتي والكشك', icon: 'phoneframe', route: 'hr/channels', perm: 'hr.employees.view', order: 35, desc: 'قنوات الخدمة الذاتية وطلباتها الواردة والأجهزة والإقرارات', render: renderHub, badge() { try { return L('docRequests').filter((r) => r.status === 'requested').length + L('essRequests').filter((r) => r.status === 'pending' && ['profile_change', 'bank_change', 'ppe', 'payslip_query'].indexOf(r.kind) >= 0).length || null; } catch (e) { return null; } } });
  SA.ess = { ensure, applyPunch, team, shiftOn, createLeave };

  /* search provider: jump to my ESS screens */
  SA.search.register({ id: 'ess', label: 'خدماتي', perm: 'hr.ess.use', query: (q) => [['وردتي', 'hr/ess/shifts', 'calendar'], ['مرتبي', 'hr/ess/payslips', 'coins'], ['إجازتي', 'hr/ess/leave', 'clipboard'], ['طلباتي', 'hr/ess/requests', 'inbox'], ['بلّغ مشكلة', 'hr/ess/report', 'alert'], ['إقراراتي', 'hr/ess/acks', 'doc']].filter((r) => !q || r[0].indexOf(q) >= 0).map((r) => ({ title: r[0], sub: 'خدماتي', icon: r[2], route: r[1] })) });

  /* ═════════════════════════════ Test Lab missions ═════════════════════════════ */
  [
    { id: 'M-E1', area: 'hr', title: 'خدماتي: سجّل حضورك من الموبايل', persona: 'employee', route: 'hr/ess', est: '2 د', goal: 'من الواجهة المبسطة اضغط «سجّل حضوري» (موقع محاكى)، وشوف البصمة تظهر في حضوري وفي «فريقي» للمشرف.', steps: [{ text: 'اضغط «سجّل حضوري» وأكّد' , audit: 'HR.ATTENDANCE.PUNCH_MOBILE' }, { text: 'افتح «حضوري» وراجع اليوم', route: 'hr-ess' }], detect: [{ audit: 'HR.ATTENDANCE.PUNCH_MOBILE' }] },
    { id: 'M-E2', area: 'hr', title: 'خدماتي: مفردة المرتب السرية (جهاز مشترك)', persona: 'employee', route: 'hr/ess/payslips', est: '3 د', goal: 'بدّل لـ«جهاز مشترك»، افتح مفردة، لاحظ إن الأرقام مخفية وبتطلب PIN 123456، والاطلاع بيتسجّل.', steps: [{ text: 'اختر «جهاز مشترك» ثم افتح مفردة شهر' }, { text: 'اضغط «إظهار (PIN)» واكتب 123456', audit: 'HR.ESS.PAYSLIP_VIEWED' }], detect: [{ audit: 'HR.ESS.PAYSLIP_VIEWED' }] },
    { id: 'M-E3', area: 'hr', title: 'رحلة كاملة: موظف يطلب إجازة ← مشرف يعتمد ← HR يراجع', persona: 'employee', route: 'hr/ess/leave/new', est: '7 د', goal: 'موظف يطلب إجازة في 3 خطوات، المشرف يعتمدها من «فريقي» مع تنبيه التغطية، ثم HR Manager يكمل السلسلة من الصندوق المشترك. اتنقل بين الحسابات من شاشة الدخول.', steps: [{ text: 'كموظف: اطلب إجازة (نوع ← أيام ← إرسال)', audit: 'HR.LEAVE.REQUESTED' }, { text: 'كمشرف: افتح فريقي ← الاعتمادات واعتمد الطلب', audit: 'HR.LEAVE.APPROVED' }, { text: 'كـHR Manager: افتح الصندوق وراجع/اعتمد (الخطوة الثانية)', audit: 'APPROVAL.APPROVED' }], detect: [{ audit: 'HR.LEAVE.REQUESTED' }, { audit: 'HR.LEAVE.APPROVED' }, { audit: 'APPROVAL.APPROVED' }] },
    { id: 'M-E4', area: 'hr', title: 'خدماتي: غيّر حسابك البنكي بأمان', persona: 'employee', route: 'hr/ess/profile', est: '3 د', goal: 'طلب تغيير الحساب يحتاج Step-up (123456) ومراجع ثانٍ من HR وتأخير 24 ساعة، والأرقام مقنّعة.', steps: [{ text: 'افتح بياناتي ← طلب تغيير الحساب البنكي' }, { text: 'اكتب IBAN مصري (EG + 27 رقم) وأرفق الإثبات', audit: 'HR.ESS.BANK_CHANGE_REQUESTED' }], detect: [{ audit: 'HR.ESS.BANK_CHANGE_REQUESTED' }] },
    { id: 'M-E5', area: 'hr', title: 'خدماتي: وقّع على سياسة السلامة بالـPIN', persona: 'employee', route: 'hr/ess/acks', est: '3 د', goal: 'اقرأ الملخص، جاوب سؤال الفهم، ووقّع بالـPIN. الإقرار بيحفظ الإصدار والجهاز.', steps: [{ text: 'افتح إقراراتي ← سياسة السلامة' }, { text: 'جاوب السؤال ثم «اطلعت ووافقت»', audit: 'HR.ESS.ACK_SIGNED' }], detect: [{ audit: 'HR.ESS.ACK_SIGNED' }] },
    { id: 'M-E6', area: 'hr', title: 'خدماتي: اطلب شهادة مرتب وسلفة', persona: 'employee', route: 'hr/ess/requests', est: '3 د', goal: 'الشهادة لازم لها غرض، والطلبين بيظهروا لـHR في الصندوق المشترك.', steps: [{ text: 'اطلب شهادة مرتب مع الغرض', audit: 'HR.ESS.REQUEST_SUBMITTED' }, { text: 'اطلب سلفة', audit: 'HR.ADVANCE.REQUESTED' }], detect: [{ audit: 'HR.ESS.REQUEST_SUBMITTED' }, { audit: 'HR.ADVANCE.REQUESTED' }] },
    { id: 'M-E7', area: 'hr', title: 'خدماتي: بلّغ إصابة أو خطر', persona: 'employee', route: 'hr/ess/report', est: '2 د', goal: 'البلاغ بيوصل السلامة فورًا (عاجل للإصابة) ويظهر في سجل السلامة.', steps: [{ text: 'افتح «بلّغ مشكلة» واختر النوع والمكان', audit: 'HR.ESS.INCIDENT_REPORTED' }], detect: [{ audit: 'HR.ESS.INCIDENT_REPORTED' }] },
    { id: 'M-S1', area: 'hr', title: 'فريقي: اعتمد إجازة بنقرة وشوف تنبيه التغطية', persona: 'supervisor', route: 'hr/team/approvals', est: '3 د', goal: 'افتح الاعتمادات، لاحظ تنبيه التغطية لو في زميل في إجازة بنفس الأيام، ثم اعتمد أو ارفض بسبب جاهز. الطلب بعد اعتمادك بيروح HR في الصندوق المشترك.', steps: [{ text: 'افتح فريقي ← الاعتمادات' }, { text: 'اضغط «اعتمد» على طلب إجازة', audit: 'HR.LEAVE.APPROVED' }], detect: [{ audit: 'HR.LEAVE.APPROVED' }] },
    { id: 'M-S2', area: 'hr', title: 'فريقي: بلاغ مخالفة + تقييم تجربة', persona: 'supervisor', route: 'hr/team/report', est: '4 د', goal: 'سلّم بلاغ مخالفة لـHR (من غير ما تشوف التحقيق)، ثم قيّم موظف تحت التجربة.', steps: [{ text: 'سلّم بلاغ مخالفة', audit: 'HR.DISCIPLINE.REPORTED' }, { text: 'افتح تبويب التجربة وأرسل التقييم', audit: 'HR.PROBATION.REVIEW_SUBMITTED' }], detect: [{ audit: 'HR.DISCIPLINE.REPORTED' }, { audit: 'HR.PROBATION.REVIEW_SUBMITTED' }] },
    { id: 'M-K1', area: 'hr', title: 'الكشك: بصمة بالكود والـPIN', persona: 'employee', route: 'hr/kiosk', est: '2 د', goal: 'ادخل برقم الموظف 17 والـPIN 123456 وسجّل بصمة. الكشك مفيهوش أي أجر.', steps: [{ text: 'افتح الكشك واكتب 17 ثم PIN 123456' }, { text: 'اضغط «تسجيل حضور»', audit: 'HR.KIOSK.PUNCH' }], detect: [{ route: 'hr-kiosk' }, { audit: 'HR.KIOSK.PUNCH' }] },
    { id: 'M-K2', area: 'hr', title: 'الكشك دون اتصال: طابور ومصالحة', persona: 'employee', route: 'hr/kiosk', est: '4 د', goal: 'فعّل Offline من وضع الاختبار، سجّل بصمة (تتحفظ محليًا)، ثم رجّع الاتصال وشوف المزامنة.', steps: [{ text: 'فعّل «Offline» وسجّل بصمة على الكشك', audit: 'HR.KIOSK.OFFLINE' }, { text: 'أوقف Offline وشوف المزامنة', audit: 'HR.KIOSK.PUNCH' }], detect: [{ audit: 'HR.KIOSK.OFFLINE' }, { audit: 'HR.KIOSK.PUNCH' }] }
  ].forEach((m) => SA.missions.add(m));
})();
