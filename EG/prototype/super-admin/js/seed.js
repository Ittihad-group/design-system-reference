/* EG Super Admin prototype — seed.js
   Builds the full demo dataset (`SA.seed.build()` → state). Everything here is DEMO data — obviously fictional names,
   RFC-5737/.test addresses, EGP shown as "ج.م", Latin digits. Values that are {Open} in the docs are `null` (never invented).

   STATE SHAPE (one object, persisted in localStorage key 'eg.sa.proto.v1'; get via SA.store.get('<path>')):
   ── meta            { v, auditSeq, notifySeq, seededAt }
   ── session         { userId|null, snap:{roleId,roleName,version,sa:[]|'*',sensitive:[]|'*',scope:{},matrix:{}}, sessionId, loginAt, lastActive, locked:bool }
   ── users[]         { id:'U-01', name, email (unique), phone, roleId, departmentId, managerId|null, warehouseIds:[], status:'active|pending|disabled|locked',
                        mfa:bool, locale:'ar|en', jobTitle, lastLogin:iso|null, createdAt, createdBy, persona:'owner|backup|gm|salesmgr|rep|acct|wh|hr|it'|null,
                        failed:int (consecutive failed logins), disabledReason?, disabledAt?, lockedAt?, activationToken? }
   ── creds           { [userId]: 'Demo@1234' }   (demo passwords; MFA/OTP demo code is always 123456)
   ── roles[]         { id:'R-01', nameAr, nameEn, description, isSystem, isProtected (Super Admin: locked), isNew (tag [New]), tag:'pending|new|approved', status:'active|draft', version:int (bump → perms banner),
                        matrix:{ [resourceId]: {view,create,edit,delete,approve,export} }, scope:{ [resourceId]:'own|team|department|all' },
                        sensitive:[ 'data.cost.view', … ] | ['*'], sa:[ 'sa.users.view', … ] | ['*'], createdAt, updatedAt }
   ── departments[]   { id:'D-01', name, managerId, parentId|null, active }
   ── modules[]       { key:'sales', nameAr, enabled, locked, phase:'v1|p2|v2', note }
   ── warehouses[]    { id:'W-01', code, name, type:'FG|RM|WIP', managerId, active, hasStock:bool }
   ── customers[]     { id:'C-001', code:'CUS-001', name, type:'dealer|direct|contractor', city, contacts:[{name,phone}], salesRepId, priceListId, status:'active|disabled', balance (read-only, from finance), openOrders:int }
   ── suppliers[]     { id:'S-001', code:'SUP-001', name, type:'raw|accessories', contacts:[], paymentTerms:null, status, balance, openPOs:int }
   ── priceLists[]    { id:'PL-01', name, itemsCount, assignedTo:[customerId|dealerId], updatedAt, status }
   ── dealerRequests[]{ id:'DR-101', company, contact, phone, city, docs:[{name,ok}], status:'pending_review|approved|rejected|needs_info', submittedAt, reviewerId, decision:{by,at,reason,via:'sales|override'}|null, accountId|null }
   ── dealers[]       { id:'DL-01', requestId, company, customerId, priceListId, status:'active|suspended', createdAt }
   ── approvals[]     { id:'AP-2001', type:'discount|large_order|price_list|payment_voucher|payroll|dealer_override', title, requesterId, amount (EGP)|null, discountPct|null, status:'pending|approved|rejected|changes_requested|delegated',
                        chain:[{step, roleId, label, status:'approved|pending|waiting|rejected|skipped', decidedBy, decidedAt, reason}], currentStep, createdAt, updatedAt, context:[[label,value]], delegatedTo?, requesterDisabled? }
   ── sessions[]      { id:'SE-001', userId, platform:'web|ios|android', device, ip, createdAt, lastActive, status:'active|revoked', pushStatus:'active|none|revoked', revokedAt?, revokedBy? }
   ── audit[]         NEWEST FIRST. { id:'AU-0101', ts, actor:{id,name,roleId}, code, target:{type,id,label}|null, before, after, reason, severity:'info|medium|high|critical', result:'success|failure|denied', ip, device, via:'web|mobile|system', count, stepUp:bool }
   ── notifications[] NEWEST FIRST. { id:'N-101', ts, title, body, level:'urgent|action|info', to:[roleIds], toUsers:[userIds], link:'#/…', readBy:[userIds] }
   ── settings        { company, numbering[], approvalRules[], finance, security, general, notifications, integrations[], superAdmin }  (see buildSettings)
   ── HR collections (shared app; HR modules in Phase 2 extend them) ──
   ── employees[]     { id:'E-1001', empNo:'EMP-0001', name, userId|null (link to users[] when the employee has a system account), departmentId (departments[] — SAME collection as SA), positionId, managerEmpId|null,
                        status:'active|probation|leave|suspended|notice|terminated', hireDate, endDate?, shift:'A|B|C|day', employmentType:'permanent|contract|daily', phone, city, nationalIdLast4, bankLast4,
                        salary:{basic, allowances, demo:true}  (T3 SENSITIVE — key name 'salary' is auto-redacted by SA.redact unless SA.canSensitive('hr.salary.view')), relatives:[employeeIds] (conflict-of-interest) }
   ── positions[]     { id:'P-01', title, departmentId, grade:null, headcount, filled }
   ── leaveBalances[] { id, employeeId, type:'annual|sick|casual', balanceDays, usedDays, demo:true }   (entitlement rules are {Law/Open})
   ── leaveRequests[] { id:'LV-2026-0001', employeeId, type, from, to, days, status:'pending|approved|rejected', approverEmpId, reason, createdAt }
   ── attendance[]    { id, employeeId, date:'YYYY-MM-DD', in:'HH:MM'|null, out:'HH:MM'|null, status:'present|late|absent|leave', shift }
   ── payrollRuns[]   { id:'PR-2026-10', period:'2026-10', status:'prepared|hr_review|finance_approved|gm_approved|released', preparedBy:userId, employees:int, gross:int, deductions:null ({Open}), net:null, demo:true, approvalId }
   ── loans[]         { id:'LN-2026-0001', employeeId, kind:'advance|loan', amount, monthly:null, status:'requested|approved|active|closed', requestedAt, approvalId|null }
   ── requisitions[]  { id:'RQ-2026-0001', positionId, departmentId, headcount, reason, requestedBy:userId, status:'pending_approval|approved|rejected|open|filled', createdAt, approvalId|null }
   ── candidates[]    { id:'CD-001', name, requisitionId, stage:'applied|screening|interview|test|offer|hired|rejected', source, appliedAt }
   ── salaryChanges[] { id:'SC-2026-0001', employeeId, fromBasic, toBasic, requestedBy:userId, status:'pending|approved|rejected', approvalId|null, createdAt }
   ── settlements[]   { id:'FS-2026-0001', employeeId, status:'draft|calculated|approved|paid', calculatedBy, approvalId|null, createdAt }
   Approvals have `area:'sa'|'hr'` and HR types: payroll_run | salary_change | final_settlement | hiring_requisition | advance | leave (SA.catalog.approvalTypes). Roles have `homeApp:'sa'|'hr'`.
   Permission keys: role.sa holds BOTH sa.* and hr.* keys; sensitive[] holds hr.salary.view (alias data.wages.view), hr.payroll.prepare, … (SA.catalog.sensitive).
   ── ui             { showTags, density:'comfortable|compact', sidebarCollapsed, app:'sa|hr' }
   ── tour           { sim:{slow,error,offline}, notes:[], progress:{[missionId]:{startedAt, steps:{i:ts}, doneAt}}, idleOverrideSec:null }
*/
(function () {
  'use strict';
  const SA = window.SA;
  const R = SA.rbac;
  const MIN = 60000;
  const ago = (min) => new Date(Date.now() - min * MIN).toISOString();
  const SEED_PW = 'Demo@1234';

  const HRALL = SA.catalog.permKeys.filter((k) => k.indexOf('hr.') === 0);
  function buildRoles() {
    const mk = (id, nameAr, nameEn, desc, o) => Object.assign({ id, nameAr, nameEn, description: desc, isSystem: true, isProtected: false, isNew: false, tag: 'pending', status: 'active', version: 1, homeApp: 'sa', matrix: {}, scope: {}, sensitive: [], sa: [], createdAt: ago(60 * 24 * 90), updatedAt: ago(60 * 24 * 20) }, o);
    const M = (map) => { const m = {}; SA.catalog.resources.forEach((r) => { m[r.id] = R.row(map[r.id] || ''); }); return m; };
    const roles = [];
    const all = {}; SA.catalog.resources.forEach((r) => { all[r.id] = 'vcedax'; });
    const allScope = {}; SA.catalog.resources.forEach((r) => { if (r.scoped) allScope[r.id] = 'all'; });
    roles.push(mk('R-01', 'Super Admin / صاحب الشركة', 'Super Admin / Owner', 'كل الصلاحيات. لا تعديل ولا حذف (BR-ROL-01).', { isProtected: true, matrix: M(all), scope: allScope, sensitive: ['*'], sa: ['*'], tag: 'approved' }));
    roles.push(mk('R-02', 'General Manager', 'General Manager', 'يرى أجزاء بصلاحيات محددة + اعتمادات. الأجور مش تلقائيًا (بند 46).', { matrix: M({ sales: 'vax', customers: 'vx', products: 'v', inventory: 'vx', manufacturing: 'v', purchasing: 'vax', finance: 'vax', hr: 'v' }), scope: { sales: 'all', customers: 'all', inventory: 'all', manufacturing: 'all', purchasing: 'all', finance: 'all', hr: 'all' }, sensitive: ['data.cost.view', 'data.profit.view', 'sales.discount.approve', 'sales.order.confirm', 'finance.voucher.approve', 'hr.payroll.approve', 'hr.final_settlement.approve'], sa: ['hr.dashboard.view', 'hr.employees.view', 'hr.requisitions.view', 'hr.requisitions.approve', 'hr.payroll.view', 'hr.reports.view', 'hr.leave.view', 'sa.overview.view', 'sa.users.view', 'sa.departments.view', 'sa.warehouses.view', 'sa.approvals.view', 'sa.approvals.approve', 'sa.approvals.delegate', 'sa.audit.view', 'sa.reports.view', 'sa.reports.export', 'sa.customers.view', 'sa.suppliers.view', 'sa.dealers.view'] }));
    roles.push(mk('R-03', 'Sales Manager', 'Sales Manager', 'الخطوة الأولى في سلسلة الاعتماد، ويرى فريقه (بند 33).', { matrix: M({ sales: 'vcedax', customers: 'vcex', products: 'v', inventory: 'v' }), scope: { sales: 'team', customers: 'team', inventory: 'all' }, sensitive: ['sales.discount.approve', 'sales.order.confirm'], sa: ['sa.overview.view', 'sa.users.view', 'sa.approvals.view', 'sa.approvals.approve', 'sa.dealers.view', 'sa.dealers.review', 'sa.customers.view', 'sa.customers.create', 'sa.customers.edit', 'sa.customers.export', 'sa.reports.view'] }));
    roles.push(mk('R-04', 'Sales Representative', 'Sales Representative', 'عملاؤه فقط · بدون تكاليف/أرباح (بند 25 Approved).', { matrix: M({ sales: 'vce', customers: 'vce', products: 'v', inventory: 'v' }), scope: { sales: 'own', customers: 'own', inventory: 'all' }, sensitive: [], sa: ['sa.customers.view'] }));
    roles.push(mk('R-05', 'Production Manager', 'Production Manager', 'أوامر التشغيل داخل القسم.', { matrix: M({ manufacturing: 'vceax', inventory: 'v', products: 'v', purchasing: 'v' }), scope: { manufacturing: 'department', inventory: 'all', purchasing: 'all' }, sensitive: [], sa: ['sa.overview.view'] }));
    roles.push(mk('R-06', 'Warehouse Manager', 'Warehouse Manager', 'المخازن المسندة له.', { matrix: M({ inventory: 'vcedx', products: 'v', purchasing: 'v', manufacturing: 'v' }), scope: { inventory: 'department', purchasing: 'all', manufacturing: 'all' }, sensitive: [], sa: ['sa.overview.view', 'sa.warehouses.view', 'sa.warehouses.edit'] }));
    roles.push(mk('R-07', 'Accountant', 'Accountant', 'إعدادات المالية والتحصيل (بصلاحية).', { matrix: M({ finance: 'vcex', customers: 'v', sales: 'v', purchasing: 'v' }), scope: { finance: 'all', customers: 'all', sales: 'all', purchasing: 'all' }, sensitive: ['finance.voucher.create', 'finance.reports.export', 'data.cost.view', 'hr.salary.view', 'hr.payroll.release', 'hr.final_settlement.pay'], sa: ['hr.dashboard.view', 'hr.payroll.view', 'hr.loans.view', 'hr.loans.approve', 'hr.payments.view', 'hr.settlement.view', 'sa.overview.view', 'sa.policies.finance.view', 'sa.policies.finance.edit', 'sa.customers.view', 'sa.suppliers.view', 'sa.reports.view', 'sa.reports.export', 'sa.approvals.view'] }));
    roles.push(mk('R-08', 'Purchasing Officer', 'Purchasing Officer', 'الموردون وأوامر الشراء.', { matrix: M({ purchasing: 'vcex', inventory: 'v', products: 'v' }), scope: { purchasing: 'department', inventory: 'all' }, sensitive: [], sa: ['sa.overview.view', 'sa.suppliers.view', 'sa.suppliers.create', 'sa.suppliers.edit'] }));
    roles.push(mk('R-09', 'Quality Control', 'Quality Control', 'موديول الجودة خارج v1 قبل اعتماد فريق المنتج (بند 34).', { matrix: M({}), scope: {}, sensitive: [], sa: [] }));
    roles.push(mk('R-10', 'IT / Tech Admin', 'IT / Tech Admin', 'الأمان والتكاملات من غير ما يبقى Owner. غير موجود في قائمة الأدوار المعتمدة (قرار 11).', { isNew: true, tag: 'new', matrix: M({}), scope: {}, sensitive: [], sa: ['sa.overview.view', 'sa.users.view', 'sa.users.unlock', 'sa.users.force_logout', 'sa.users.reset_password', 'sa.sessions.view', 'sa.sessions.revoke', 'sa.security_center.view', 'sa.security_center.unlock', 'sa.policies.security.view', 'sa.policies.security.edit', 'sa.settings.view', 'sa.settings.edit', 'sa.audit.view', 'sa.roles.view'], createdAt: ago(60 * 24 * 6), updatedAt: ago(60 * 24 * 6) }));
    roles.push(mk('R-11', 'HR Manager', 'HR Manager', 'يعتمد ويراجع المرتبات ويملك الجزاءات والتعاقدات. الأجور: HR صراحةً (بند 46). بدون صلاحيات Super Admin تقريبًا. (غير موجود في قائمة الأدوار المبدئية)', { homeApp: 'hr', matrix: M({ hr: 'vcedax' }), scope: { hr: 'all' }, sensitive: ['hr.salary.view', 'hr.medical.view', 'hr.discipline.view', 'hr.pii.reveal', 'hr.payroll.approve', 'hr.salary.change.approve', 'hr.final_settlement.calculate', 'hr.final_settlement.approve', 'hr.export.sensitive'], sa: ['sa.users.view', 'sa.departments.view'].concat(HRALL.filter((k) => !/\.ess\.|\.mss\./.test(k))) }));
    roles.push(mk('R-12', 'HR Officer', 'HR Officer', 'تشغيل HR اليومي: ملفات وحضور وإجازات. لا يرى الأجور.', { isNew: true, tag: 'new', homeApp: 'hr', matrix: M({ hr: 'vced' }), scope: { hr: 'department' }, sensitive: [], sa: ['hr.dashboard.view', 'hr.employees.view', 'hr.employees.create', 'hr.employees.edit', 'hr.requisitions.view', 'hr.requisitions.create', 'hr.candidates.view', 'hr.candidates.create', 'hr.candidates.edit', 'hr.offers.view', 'hr.offers.create', 'hr.onboarding.view', 'hr.onboarding.edit', 'hr.custody.view', 'hr.custody.edit', 'hr.shifts.view', 'hr.attendance.view', 'hr.attendance.edit', 'hr.leave.view', 'hr.leave.create', 'hr.contractors.view', 'hr.documents.view', 'hr.documents.issue', 'hr.reports.view', 'hr.planning.view', 'hr.mss.use'] }));
    roles.push(mk('R-13', 'Payroll Officer', 'Payroll Officer', 'يجهّز كشف المرتبات (maker) ويرى الأجور. لا يعتمد ولا يطلق الصرف.', { isNew: true, tag: 'new', homeApp: 'hr', matrix: M({ hr: 'vce' }), scope: { hr: 'all' }, sensitive: ['hr.salary.view', 'hr.payroll.prepare', 'hr.salary.change.request'], sa: ['hr.dashboard.view', 'hr.employees.view', 'hr.salary_structure.view', 'hr.salary_structure.edit', 'hr.payroll.view', 'hr.loans.view', 'hr.loans.create', 'hr.payments.view', 'hr.gov.view', 'hr.gov.edit', 'hr.attendance.view', 'hr.overtime.view', 'hr.changes.view', 'hr.changes.create'] }));
    roles.push(mk('R-14', 'Line Supervisor', 'Line Supervisor', 'المشرف المباشر: يعتمد إجازات فريقه ويطلب أوفرتايم وتوظيف.', { isNew: true, tag: 'new', homeApp: 'hr', matrix: M({ hr: 'v' }), scope: { hr: 'team' }, sensitive: [], sa: ['hr.mss.use', 'hr.ess.use', 'hr.employees.view', 'hr.attendance.view', 'hr.leave.view', 'hr.leave.approve', 'hr.overtime.view', 'hr.overtime.create', 'hr.requisitions.view', 'hr.requisitions.create', 'hr.shifts.view'] }));
    roles.push(mk('R-15', 'OHS Officer', 'OHS Officer', 'السلامة والصحة المهنية. يرى الطبي (T4) للسلامة فقط.', { isNew: true, tag: 'new', homeApp: 'hr', matrix: M({ hr: 'v' }), scope: { hr: 'all' }, sensitive: ['hr.medical.view'], sa: ['hr.dashboard.view', 'hr.ohs.view', 'hr.ohs.edit', 'hr.training.view', 'hr.training.edit', 'hr.employees.view', 'hr.reports.view'] }));
    roles.push(mk('R-16', 'Employee (ESS)', 'Employee (ESS)', 'خدمة ذاتية: بياناته وطلباته ومفردات مرتبه فقط. بدون أي صلاحية إدارة.', { isNew: true, tag: 'new', homeApp: 'hr', matrix: M({}), scope: {}, sensitive: [], sa: ['hr.ess.use'] }));
    return roles;
  }

  function buildUsers() {
    const U = (id, name, email, roleId, dept, mgr, status, o) => Object.assign({ id, name, email: email + '@eg-demo.test', phone: '+20 10' + String(10000000 + (id.length * 7919 + parseInt(id.slice(2), 10) * 104729) % 89999999), roleId, departmentId: dept, managerId: mgr, warehouseIds: [], status, mfa: false, locale: 'ar', jobTitle: '', lastLogin: null, createdAt: ago(60 * 24 * 60), createdBy: 'U-01', persona: null, failed: 0 }, o);
    return [
      U('U-01', 'أحمد المنشاوي', 'owner', 'R-01', 'D-01', null, 'active', { mfa: true, persona: 'owner', jobTitle: 'صاحب الشركة والمصنع', lastLogin: ago(95), createdBy: 'SYSTEM' }),
      U('U-02', 'منى السيد', 'backup', 'R-01', 'D-01', 'U-01', 'active', { mfa: true, persona: 'backup', jobTitle: 'مسؤول احتياطي', lastLogin: ago(60 * 26) }),
      U('U-03', 'خالد عبد الله', 'gm', 'R-02', 'D-01', 'U-01', 'active', { mfa: true, persona: 'gm', jobTitle: 'المدير العام', lastLogin: ago(240) }),
      U('U-04', 'هبة فاروق', 'sales.mgr', 'R-03', 'D-02', 'U-03', 'active', { persona: 'salesmgr', jobTitle: 'مدير المبيعات', lastLogin: ago(50) }),
      U('U-05', 'ياسر مصطفى', 'rep', 'R-04', 'D-02', 'U-04', 'active', { persona: 'rep', jobTitle: 'مندوب مبيعات', lastLogin: ago(130) }),
      U('U-06', 'نهى إبراهيم', 'accountant', 'R-07', 'D-03', 'U-03', 'active', { persona: 'acct', jobTitle: 'محاسبة', lastLogin: ago(75) }),
      U('U-07', 'عمرو حسن', 'warehouse', 'R-06', 'D-04', 'U-03', 'active', { persona: 'wh', warehouseIds: ['W-01', 'W-02'], jobTitle: 'مدير المخازن', lastLogin: ago(60 * 5) }),
      U('U-08', 'سلمى رضا', 'hr', 'R-11', 'D-07', 'U-03', 'active', { persona: 'hr', jobTitle: 'مدير الموارد البشرية', lastLogin: ago(60 * 3) }),
      U('U-09', 'طارق نبيل', 'it', 'R-10', 'D-08', 'U-03', 'active', { mfa: true, persona: 'it', jobTitle: 'مسؤول تقنية المعلومات', lastLogin: ago(60 * 8) }),
      U('U-10', 'مروة جلال', 'marwa', 'R-04', 'D-02', 'U-04', 'active', { jobTitle: 'مندوبة مبيعات', lastLogin: ago(60 * 2) }),
      U('U-11', 'إسلام شريف', 'islam', 'R-04', 'D-02', 'U-04', 'active', { jobTitle: 'مندوب مبيعات', lastLogin: ago(60 * 30) }),
      U('U-12', 'دعاء ماهر', 'doaa', 'R-04', 'D-02', 'U-04', 'locked', { jobTitle: 'مندوبة مبيعات', failed: 5, lockedAt: ago(60 * 20), lastLogin: ago(60 * 22) }),
      U('U-13', 'حسام كامل', 'hossam', 'R-05', 'D-05', 'U-03', 'active', { jobTitle: 'مدير الإنتاج', lastLogin: ago(60 * 9) }),
      U('U-14', 'رانيا عادل', 'rania', 'R-08', 'D-06', 'U-03', 'active', { jobTitle: 'مسؤولة مشتريات', lastLogin: ago(60 * 48) }),
      U('U-15', 'وليد صبحي', 'walid', 'R-09', 'D-05', 'U-13', 'active', { jobTitle: 'مفتش جودة', lastLogin: ago(60 * 72) }),
      U('U-16', 'آية سمير', 'aya', 'R-07', 'D-03', 'U-06', 'active', { jobTitle: 'محاسبة مساعدة', lastLogin: ago(60 * 6) }),
      U('U-17', 'كريم زكريا', 'karim', 'R-06', 'D-04', 'U-07', 'disabled', { warehouseIds: ['W-03'], jobTitle: 'أمين مخزن', disabledReason: 'نُقل لفرع آخر', disabledAt: ago(60 * 24 * 12), lastLogin: ago(60 * 24 * 13) }),
      U('U-18', 'شيماء لطفي', 'shaimaa', 'R-04', 'D-02', 'U-04', 'pending', { jobTitle: 'مندوبة مبيعات', activationToken: 'demo-act-18', createdAt: ago(60 * 30), createdBy: 'U-08' }),
      U('U-19', 'باسم عوض', 'basem', 'R-03', 'D-02', 'U-03', 'active', { jobTitle: 'مدير مبيعات المنطقة الجنوبية', lastLogin: ago(60 * 4) }),
      U('U-20', 'ليلى منصور', 'laila', 'R-04', 'D-02', 'U-04', 'disabled', { jobTitle: 'مندوبة مبيعات سابقة', disabledReason: 'انتهاء التعاقد', disabledAt: ago(60 * 24 * 30), lastLogin: ago(60 * 24 * 31) }),
      U('U-21', 'محمود الجمال', 'mahmoud', 'R-07', 'D-03', 'U-06', 'pending', { jobTitle: 'محاسب', activationToken: 'demo-act-21', createdAt: ago(60 * 5), createdBy: 'U-08' }),
      U('U-22', 'أميرة وجدي', 'amira', 'R-06', 'D-04', 'U-07', 'active', { warehouseIds: ['W-03'], jobTitle: 'أمينة مخزن', lastLogin: ago(60 * 7) }),
      U('U-23', 'عبد الرحمن فتحي', 'abdelrahman', 'R-08', 'D-06', 'U-14', 'active', { jobTitle: 'مسؤول مشتريات', lastLogin: ago(60 * 11) }),
      U('U-25', 'ريم عبد الحميد', 'hr.officer', 'R-12', 'D-07', 'U-08', 'active', { persona: 'hrofficer', jobTitle: 'أخصائية موارد بشرية', lastLogin: ago(70) }),
      U('U-26', 'أشرف عماد', 'payroll', 'R-13', 'D-03', 'U-06', 'active', { persona: 'payroll', jobTitle: 'مسؤول مرتبات', lastLogin: ago(110) }),
      U('U-27', 'سيد رمضان', 'supervisor', 'R-14', 'D-09', 'U-13', 'active', { persona: 'supervisor', jobTitle: 'مشرف خط الألومنيوم', lastLogin: ago(40) }),
      U('U-28', 'عبير الشافعي', 'ohs', 'R-15', 'D-13', 'U-13', 'active', { persona: 'ohs', jobTitle: 'مسؤولة السلامة والصحة المهنية', lastLogin: ago(200) }),
      U('U-29', 'مصطفى عوض', 'employee', 'R-16', 'D-09', 'U-27', 'active', { persona: 'employee', jobTitle: 'فني تشغيل', lastLogin: ago(300) }),
      U('U-24', 'جيهان سعد', 'gihan', 'R-11', 'D-07', 'U-08', 'active', { jobTitle: 'أخصائية موارد بشرية', lastLogin: ago(60 * 14) })
    ];
  }

  function buildAudit() {
    const users = {}; buildUsers().forEach((u) => (users[u.id] = u));
    let seq = 100; const rows = [];
    const A = (mins, code, actorId, tt, tid, tl, o) => {
      o = o || {}; const u = users[actorId]; const cat = SA.catalog.auditByCode[code];
      rows.push({ id: '', ts: ago(mins), actor: u ? { id: u.id, name: u.name, roleId: u.roleId } : { id: 'SYSTEM', name: 'النظام', roleId: null }, code, target: tid ? { type: tt, id: tid, label: tl } : null, before: o.before === undefined ? null : o.before, after: o.after === undefined ? null : o.after, reason: o.reason || '', severity: o.sev || (cat && cat.severity) || 'info', result: o.result || 'success', ip: o.ip || '192.0.2.' + (10 + (actorId ? parseInt(actorId.slice(2), 10) : 0)), device: o.device || 'Chrome · Windows', via: o.via || 'web', count: o.count || 1, area: code.indexOf('HR.') === 0 ? 'hr' : 'sa', stepUp: !!o.stepUp });
    };
    A(14, 'AUTH.LOGIN_SUCCESS', 'U-01', 'user', 'U-01', 'أحمد المنشاوي');
    A(22, 'APPROVAL.APPROVED', 'U-04', 'approval', 'AP-2002', 'طلب كبير — خطوة مدير المبيعات', { reason: 'العميل قديم والسداد منتظم', after: { status: 'step 1 approved' } });
    A(41, 'USER.UPDATED', 'U-08', 'user', 'U-24', 'جيهان سعد', { before: { jobTitle: 'موظفة موارد بشرية' }, after: { jobTitle: 'أخصائية موارد بشرية' } });
    A(55, 'AUTH.LOGIN_FAILED', null, 'user', 'U-12', 'دعاء ماهر', { result: 'failure', ip: '198.51.100.23', device: 'Chrome · Android' });
    A(60, 'AUTH.LOGIN_FAILED', null, 'user', 'U-12', 'دعاء ماهر', { result: 'failure', ip: '198.51.100.23', device: 'Chrome · Android', sev: 'medium' });
    A(65, 'AUTH.ACCOUNT_LOCKED', null, 'user', 'U-12', 'دعاء ماهر', { result: 'failure', sev: 'high', reason: 'تجاوز حد المحاولات الفاشلة', ip: '198.51.100.23' });
    A(95, 'AUTH.LOGIN_SUCCESS', 'U-01', 'user', 'U-01', 'أحمد المنشاوي', { device: 'Safari · macOS' });
    A(130, 'AUTH.LOGIN_SUCCESS', 'U-05', 'user', 'U-05', 'ياسر مصطفى', { device: 'Chrome · Android', via: 'mobile' });
    A(190, 'ACCESS.DENIED', 'U-05', 'route', '/roles', 'الأدوار والصلاحيات', { result: 'denied', count: 2 });
    A(250, 'EXPORT.AUDIT', 'U-01', 'audit', 'AUD-EXP-1', 'تصدير سجل التدقيق (CSV)', { stepUp: true, after: { rows: 118, format: 'CSV' } });
    A(310, 'ROLE.UPDATED', 'U-01', 'role', 'R-03', 'Sales Manager', { stepUp: true, reason: 'تفويض اعتماد الخصم لمدير المبيعات', before: { 'sales.approve': false }, after: { 'sales.approve': true } });
    A(380, 'USER.CREATED', 'U-08', 'user', 'U-21', 'محمود الجمال', { after: { role: 'Accountant', department: 'المالية', status: 'pending' } });
    A(430, 'SESSION.REVOKED', 'U-09', 'session', 'SE-014', 'جلسة U-17 — Chrome · Windows', { reason: 'جهاز مشترك', after: { status: 'revoked' } });
    A(520, 'AUTH.LOGIN_SUCCESS', 'U-09', 'user', 'U-09', 'طارق نبيل');
    A(600, 'POLICY.SECURITY_CHANGED', 'U-01', 'policy', 'security', 'سياسة الأمان', { stepUp: true, before: { idleMinutes: 20 }, after: { idleMinutes: 30 } });
    A(740, 'DEALER.REQUEST_APPROVED', 'U-04', 'dealer_request', 'DR-104', 'شركة البناء الحديث', { reason: 'مستندات كاملة وزيارة ميدانية', after: { status: 'approved', priceList: 'PL-02' } });
    A(900, 'APPROVAL.REJECTED', 'U-04', 'approval', 'AP-2006', 'خصم على طلب بيع', { reason: 'النسبة أعلى من المعتاد لهذا العميل', after: { status: 'rejected' } });
    A(1100, 'USER.DISABLED', 'U-01', 'user', 'U-17', 'كريم زكريا', { stepUp: true, reason: 'نُقل لفرع آخر', before: { status: 'active' }, after: { status: 'disabled' } });
    A(1250, 'AUTH.MFA_FAILED', 'U-03', 'user', 'U-03', 'خالد عبد الله', { result: 'failure' });
    A(1300, 'AUTH.LOGIN_SUCCESS', 'U-03', 'user', 'U-03', 'خالد عبد الله');
    A(1500, 'WAREHOUSE.UPDATED', 'U-07', 'warehouse', 'W-02', 'مخزن المواد الخام', { before: { manager: 'U-22' }, after: { manager: 'U-07' } });
    A(1700, 'NOTIFICATION.RULE_CHANGED', 'U-09', 'notification_rule', 'default', 'قواعد الإشعارات', { before: { channel: null }, after: { channel: null }, reason: 'مراجعة فقط' });
    A(1900, 'COMPANY.UPDATED', 'U-01', 'company', 'company', 'بيانات الشركة', { stepUp: true, before: { nameEn: '' }, after: { nameEn: 'EG Doors & Windows' } });
    A(2200, 'USER.ROLE_CHANGED', 'U-01', 'user', 'U-19', 'باسم عوض', { stepUp: true, reason: 'ترقية لمدير مبيعات', before: { role: 'Sales Representative' }, after: { role: 'Sales Manager' } });
    A(2500, 'MODULE.TOGGLED', 'U-01', 'module', 'quality', 'الجودة', { stepUp: true, before: { enabled: true }, after: { enabled: false }, reason: 'خارج v1 (بند 34)' });
    A(2900, 'EXPORT.REPORT', 'U-06', 'report', 'RPT-12', 'تقرير أعمار الديون', { after: { format: 'XLSX' } });
    A(3300, 'PRICELIST.CHANGED', 'U-04', 'price_list', 'PL-02', 'قائمة أسعار تجار الجملة', { before: { items: 38 }, after: { items: 41 } });
    A(3700, 'AUTH.PASSWORD_RESET_REQUESTED', 'U-09', 'user', 'U-16', 'آية سمير', { stepUp: true });
    A(4300, 'DEPT.UPDATED', 'U-01', 'department', 'D-08', 'تقنية المعلومات', { before: { manager: null }, after: { manager: 'U-09' } });
    A(5000, 'APPROVAL.APPROVED', 'U-03', 'approval', 'AP-2010', 'سند صرف — مشتريات', { stepUp: true, reason: 'مطابق للمستندات', after: { status: 'approved' } });
    A(5800, 'ROLE.CREATED', 'U-01', 'role', 'R-10', 'IT / Tech Admin', { stepUp: true, after: { nameAr: 'IT / Tech Admin', tag: 'New' } });
    A(7200, 'ROLE.SENSITIVE_GRANTED', 'U-01', 'role', 'R-11', 'HR Manager', { stepUp: true, reason: 'الأجور: HR صراحةً (بند 46)', before: { 'hr.salary.view': false }, after: { 'hr.salary.view': true } });
    A(8600, 'SUPERADMIN.BACKUP_NAMED', 'U-01', 'user', 'U-02', 'منى السيد', { stepUp: true, sev: 'critical', after: { backup: 'U-02', note: 'اسم تجريبي — القرار الفعلي Open' } });
    A(9400, 'SUPERADMIN.MFA_CHANGED', 'U-02', 'user', 'U-02', 'منى السيد', { stepUp: true, sev: 'critical', after: { mfa: true } });
    A(10100, 'SETTINGS.CHANGED', 'U-01', 'settings', 'general', 'الإعدادات العامة', { before: { dateFormat: 'YYYY-MM-DD' }, after: { dateFormat: 'DD/MM/YYYY' } });
    A(11800, 'DEALER.REQUEST_REJECTED', 'U-04', 'dealer_request', 'DR-105', 'تاجر الدلتا', { reason: 'مستندات ناقصة ولم تُستكمل', after: { status: 'rejected' } });
    A(13000, 'POLICY.NUMBERING_CHANGED', 'U-01', 'numbering', 'QT', 'ترقيم عرض السعر', { stepUp: true, before: { prefix: 'QU' }, after: { prefix: 'QT' } });
    A(15000, 'USER.UNLOCKED', 'U-09', 'user', 'U-10', 'مروة جلال', { reason: 'نسيت كلمة المرور', before: { status: 'locked' }, after: { status: 'active' } });
    A(17000, 'USER.FORCE_LOGOUT', 'U-09', 'user', 'U-14', 'رانيا عادل', { reason: 'فقدان جهاز', stepUp: true });
    A(19000, 'AUTH.LOGIN_SUCCESS', 'U-02', 'user', 'U-02', 'منى السيد', { device: 'Chrome · Windows' });
    A(150, 'HR.PAYROLL.PREPARED', 'U-26', 'payroll_run', 'PR-2026-10', 'كشف مرتبات أكتوبر 2026 (تجريبي)', { after: { status: 'prepared', employees: 30 } });
    A(260, 'HR.LEAVE.APPROVED', 'U-27', 'leave_request', 'LV-2026-0002', 'إجازة اعتيادية — مصطفى عوض', { reason: 'لا تعارض مع الجدول', after: { status: 'approved' } });
    A(480, 'HR.REQUISITION.CREATED', 'U-27', 'requisition', 'RQ-2026-0001', 'فني تشغيل — خط الألومنيوم', { after: { headcount: 2 } });
    A(900, 'HR.EMPLOYEE.PII_REVEALED', 'U-08', 'employee', 'E-1005', 'ياسر مصطفى', { reason: 'مراجعة مستندات التعيين' });
    A(1800, 'HR.SALARY.VIEWED', 'U-26', 'employee', 'E-1005', 'ياسر مصطفى', { reason: 'تجهيز الكشف' });
    A(3000, 'HR.SETTLEMENT.CALCULATED', 'U-25', 'settlement', 'FS-2026-0001', 'مخالصة كريم زكريا', { after: { status: 'calculated' } });
    rows.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    rows.forEach((r, i) => { r.id = 'AU-' + String(100 + rows.length - i).padStart(4, '0'); });
    seq = 100 + rows.length;
    return { rows, seq };
  }

  function buildApprovals() {
    const step = (n, roleId, label, status, by, at, reason) => ({ step: n, roleId, label, status, decidedBy: by || null, decidedAt: at || null, reason: reason || '' });
    const mgr = (st, by, at, reason) => step(1, 'R-03', 'مدير المبيعات (Sales Manager)', st, by, at, reason);
    const gm = (n, st, by, at, reason) => step(n, 'R-02', 'المدير العام (General Manager)', st, by, at, reason);
    const mk = (id, type, title, requesterId, amount, disc, status, chain, cur, mins, ctx, extra) => Object.assign({ id, type, area: (SA.catalog.approvalTypes[type] || {}).area || 'sa', title, requesterId, amount, discountPct: disc, currency: 'EGP', status, chain, currentStep: cur, createdAt: ago(mins), updatedAt: ago(Math.max(1, mins - 30)), context: ctx }, extra || {});
    return [
      mk('AP-2001', 'discount', 'خصم على طلب بيع SO-2026-0412 — معرض النيل للنوافذ', 'U-05', 84500, 8, 'pending', [mgr('pending'), gm(2, 'waiting')], 1, 180, [['العميل', 'معرض النيل للنوافذ'], ['قيمة الطلب', '84,500 ج.م'], ['الخصم المطلوب', '8%'], ['البنود', '14 بابًا + 6 نوافذ'], ['ملاحظة المندوب', 'عميل قديم وبيطلب بكميات متكررة']]),
      mk('AP-2002', 'large_order', 'طلب كبير SO-2026-0418 — شركة الأفق للمقاولات', 'U-10', 412000, null, 'pending', [mgr('approved', 'U-04', ago(22), 'العميل قديم والسداد منتظم'), gm(2, 'pending')], 2, 60 * 26, [['العميل', 'شركة الأفق للمقاولات'], ['قيمة الطلب', '412,000 ج.م'], ['شروط الدفع', 'دفعة مقدمة + شيكات'], ['تاريخ التسليم المطلوب', '30 يومًا']]),
      mk('AP-2003', 'price_list', 'تعديل قائمة أسعار تجار الجملة (PL-02)', 'U-04', null, null, 'pending', [gm(1, 'pending')], 1, 60 * 20, [['القائمة', 'تجار الجملة'], ['التغيير', '3 أصناف جديدة + تعديل سعر صنفين'], ['مين يملك التعديل في المبيعات', 'Open (بند 31)']]),
      mk('AP-2004', 'payment_voucher', 'سند صرف PV-2026-0119 — مورد إكسسوارات', 'U-06', 38000, null, 'pending', [gm(1, 'pending')], 1, 60 * 5, [['المورد', 'شركة الإكسسوارات الحديثة'], ['المبلغ', '38,000 ج.م'], ['الإنشاء', 'نهى إبراهيم'], ['التنفيذ', 'بعد الاعتماد — بصلاحية منفصلة']]),
      mk('AP-2005', 'discount', 'خصم على طلب بيع SO-2026-0399 — مؤسسة السلام', 'U-11', 27300, 5, 'approved', [mgr('approved', 'U-04', ago(60 * 40), 'مقبول'), gm(2, 'skipped')], 2, 60 * 48, [['العميل', 'مؤسسة السلام'], ['قيمة الطلب', '27,300 ج.م'], ['الخصم', '5%']]),
      mk('AP-2006', 'discount', 'خصم على طلب بيع SO-2026-0390 — مقاولات الصعيد', 'U-05', 96000, 12, 'rejected', [mgr('rejected', 'U-04', ago(900), 'النسبة أعلى من المعتاد لهذا العميل'), gm(2, 'skipped')], 1, 60 * 30, [['العميل', 'مقاولات الصعيد'], ['قيمة الطلب', '96,000 ج.م'], ['الخصم', '12%']]),
      mk('AP-2007', 'dealer_override', 'تجاوز تسجيل تاجر — مؤسسة النور للتجارة', 'U-04', null, null, 'pending', [step(1, 'R-01', 'صاحب الشركة (Super Admin)', 'pending')], 1, 60 * 3, [['الطلب', 'DR-102'], ['سبب التجاوز المقترح', 'عميل استراتيجي بتزكية مدير المبيعات'], ['ملاحظة', 'القرار الأصلي للمبيعات؛ التجاوز بسجل (بند 32)']]),
      mk('AP-2008', 'price_list', 'قائمة أسعار خاصة لتاجر جديد (طلب صاحب الشركة)', 'U-01', null, null, 'pending', [gm(1, 'pending')], 1, 60 * 2, [['القائمة', 'PL-04 — تاجر خاص'], ['ملاحظة', 'مقدّم الطلب هو صاحب الشركة: لا يعتمد طلبه بنفسه (فصل المهام)']]),
      mk('AP-2009', 'payroll_run', 'كشف مرتبات PR-2026-10 (بيانات تجريبية) — بانتظار مراجعة HR', 'U-26', null, null, 'pending', [step(1, 'R-11', 'مدير الموارد البشرية (مراجعة)', 'pending'), step(2, 'R-07', 'المالية (اعتماد الصرف)', 'waiting'), gm(3, 'waiting')], 1, 60 * 8, [['الكشف', 'PR-2026-10'], ['الفترة', 'أكتوبر 2026'], ['عدد الموظفين', '30'], ['ملاحظة', 'الأجور سرية (hr.salary.view). التجهيز/الاعتماد/الإطلاق صلاحيات منفصلة.']], { ref: { type: 'payroll_run', id: 'PR-2026-10' } }),
      mk('AP-2011', 'salary_change', 'تغيير مرتب: ياسر مصطفى (ترقية)', 'U-26', null, null, 'pending', [step(1, 'R-11', 'مدير الموارد البشرية', 'pending'), gm(2, 'waiting')], 1, 60 * 6, [['الموظف', 'ياسر مصطفى (EMP-0005)'], ['السبب', 'ترقية إلى مندوب أول'], ['ملاحظة', 'مقدّم الطلب لا يعتمده (فصل مهام)']], { ref: { type: 'salary_change', id: 'SC-2026-0001' } }),
      mk('AP-2012', 'final_settlement', 'مخالصة نهائية FS-2026-0001 — موظف منتهي الخدمة', 'U-25', null, null, 'pending', [step(1, 'R-11', 'مدير الموارد البشرية', 'pending'), step(2, 'R-07', 'المالية (الصرف)', 'waiting')], 1, 60 * 30, [['الموظف', 'كريم زكريا (EMP-0016)'], ['سبب الإنهاء', 'نقل لفرع آخر'], ['ملاحظة', 'من يحسب المخالصة غير من يصرفها']], { ref: { type: 'final_settlement', id: 'FS-2026-0001' } }),
      mk('AP-2013', 'hiring_requisition', 'طلب توظيف: فني تشغيل — خط الألومنيوم', 'U-27', null, null, 'pending', [step(1, 'R-11', 'مدير الموارد البشرية', 'pending'), gm(2, 'waiting')], 1, 60 * 12, [['الوظيفة', 'فني تشغيل'], ['القسم', 'خط الألومنيوم'], ['العدد', '2'], ['السبب', 'زيادة الطلب على الإنتاج']], { ref: { type: 'hiring_requisition', id: 'RQ-2026-0001' } }),
      mk('AP-2014', 'advance', 'سلفة: مصطفى عوض', 'U-29', 3000, null, 'pending', [step(1, 'R-11', 'مدير الموارد البشرية', 'pending'), step(2, 'R-07', 'المالية', 'waiting')], 1, 60 * 4, [['الموظف', 'مصطفى عوض'], ['المبلغ', '3,000 ج.م (تجريبي)'], ['ملاحظة', 'حدود السلف والخصومات {Open}']], { ref: { type: 'advance', id: 'LN-2026-0001' } }),
      mk('AP-2010', 'payment_voucher', 'سند صرف PV-2026-0118 — مشتريات خامات', 'U-14', 86400, null, 'approved', [gm(1, 'approved', 'U-03', ago(5000), 'مطابق للمستندات')], 1, 60 * 90, [['المورد', 'مصنع الألومنيوم الوطني'], ['المبلغ', '86,400 ج.م']])
    ];
  }

  function buildSettings() {
    const num = (type, labelAr, prefix, o) => Object.assign({ type, labelAr, prefix, format: 'PREFIX-YYYY-NNNN', pad: 4, includeYear: true, yearlyReset: true, last: 0, issued: 0, locked: false, source: 'بند 47', tag: 'pending' }, o);
    return {
      company: { nameAr: 'مصنع EG للأبواب والنوافذ (اسم تجريبي)', nameEn: '', address: '', taxId: '', commercialReg: '', phone: '', email: '', website: '', sealUploaded: false, signatureUploaded: false, logoUploaded: true, docLanguage: null, readiness: { note: 'الرقم الضريبي والسجل التجاري والعنوان الرسمي: Open (بند 11)' } },
      numbering: [
        num('INV', 'فاتورة بيع', 'INV', { source: 'بند 14', issued: 187, last: 187, locked: true }),
        num('DN', 'إذن تسليم', 'DN', { source: 'بند 14', issued: 96, last: 96, locked: true }),
        num('WO', 'أمر تشغيل', 'WO', { source: 'بند 14', issued: 54, last: 54, locked: true }),
        num('ST', 'إذن مخزني', 'ST', { source: 'بند 14', issued: 12, last: 12, locked: true }),
        num('PS', 'أمر شراء', 'PS', { source: 'بند 14', issued: 44, last: 44, locked: true }),
        num('QT', 'عرض سعر', 'QT', { issued: 0 }), num('RV', 'سند قبض', 'RV', { issued: 232, last: 232, locked: true }), num('PV', 'سند صرف', 'PV', { issued: 119, last: 119, locked: true }),
        num('PR', 'كشف مرتبات', 'PR', {}), num('AG', 'أعمار الديون', 'AG', {}), num('SOA', 'كشف حساب', 'SOA', {}), num('PAY', 'مفردات مرتب', 'PAY', {}),
        num('PF', 'فاتورة مبدئية', 'PF', { source: 'الديمو', issued: 146, last: 146, locked: true }),
        num('EMP', 'رقم وظيفي', 'EMP', { source: 'HR §13', issued: 30, last: 30, locked: true }), num('CTR', 'عقد', 'CTR', { source: 'HR §13' }), num('OFR', 'عرض وظيفي', 'OFR', { source: 'HR §13' }), num('LV', 'طلب إجازة', 'LV', { source: 'HR §13', issued: 2, last: 2, locked: true }), num('OT', 'طلب أوفرتايم', 'OT', { source: 'HR §13' }), num('LN', 'سلفة/قرض', 'LN', { source: 'HR §13', issued: 1, last: 1, locked: true }), num('WRN', 'إنذار', 'WRN', { source: 'HR §13' }), num('DED', 'إشعار خصم', 'DED', { source: 'HR §13' }), num('CER', 'شهادة (مرتب/خبرة)', 'CER', { source: 'HR §13' }), num('CLR', 'إخلاء طرف', 'CLR', { source: 'HR §13' }), num('FS', 'مخالصة نهائية', 'FS', { source: 'HR §13', issued: 1, last: 1, locked: true }), num('INC', 'حادث/إصابة', 'INC', { source: 'HR §13' }),
        num('SO', 'أمر بيع', 'SO', { source: 'الديمو — غير مدرجة (قرار 7)', tag: 'new', issued: 412, last: 412, locked: true })
      ],
      approvalRules: [
        { id: 'AR-1', trigger: 'discount_pct', label: 'نسبة خصم تتجاوز الحد', threshold: null, chain: ['R-03', 'R-02'], escalationHours: null, enabled: false },
        { id: 'AR-2', trigger: 'order_value', label: 'قيمة طلب تتجاوز الحد', threshold: null, chain: ['R-03', 'R-02'], escalationHours: null, enabled: false },
        { id: 'AR-3', trigger: 'exception', label: 'طلب استثنائي', threshold: null, chain: ['R-02'], escalationHours: null, enabled: false }
      ],
      finance: { taxRate: null, taxInclusive: null, paymentMethods: { cash: true, transfer: true, cheque: true, card: false }, fiscalYearStart: null, overdueDays: null, overdueAction: null, banks: [] },
      security: {
        idleMinutes: 30, idleDemo: true, lockoutThreshold: 5, lockoutDemo: true, lockoutMinutes: null,
        stepUpActions: SA.catalog.stepUp.map((s) => s[0]), stepUpValidMinutes: null,
        passwordMinLength: null, passwordComplexity: null, passwordExpiryDays: null, resetLinkMinutes: null,
        mfaRequiredFor: 'superadmin', mfaMethod: null, ipRestrictions: false
      },
      general: { language: 'ar', digits: 'latin', timezone: 'Africa/Cairo', dateFormat: 'DD/MM/YYYY', currency: 'EGP' },
      notifications: { rules: [], quietHours: null },
      integrations: [
        { id: 'einvoice', label: 'الفاتورة الإلكترونية', status: 'open_hold', note: 'Open — التنفيذ مؤجل (بند 12/43). ملف PDF العادي ليس فاتورة إلكترونية معتمدة.' },
        { id: 'email', label: 'البريد الإلكتروني', status: 'not_configured', note: '' },
        { id: 'sms', label: 'الرسائل النصية', status: 'not_configured', note: '' },
        { id: 'push', label: 'الإشعارات (FCM + APNs)', status: 'not_configured', note: 'الـBackend هو من يقرر (بند 29)' }
      ],
      superAdmin: { primaryUserId: 'U-01', backupUserId: 'U-02', backupDemo: true, recoveryCodesGeneratedAt: null, recoveryCodes: null, recoveryUsedAt: null }
    };
  }

  function buildSessions() {
    const S = (id, userId, platform, device, ip, mins, o) => Object.assign({ id, userId, platform, device, ip, createdAt: ago(mins + 60), lastActive: ago(mins), status: 'active', pushStatus: platform === 'web' ? 'none' : 'active' }, o);
    return [
      S('SE-001', 'U-01', 'web', 'Chrome · macOS', '192.0.2.11', 94), S('SE-002', 'U-01', 'ios', 'iPhone 15 · EG-Mobile', '198.51.100.40', 240),
      S('SE-003', 'U-02', 'web', 'Chrome · Windows', '192.0.2.12', 60 * 26, { status: 'revoked', revokedAt: ago(60 * 25), revokedBy: 'U-02' }),
      S('SE-004', 'U-03', 'web', 'Edge · Windows', '192.0.2.13', 240), S('SE-005', 'U-03', 'android', 'Galaxy S23 · EG-Mobile', '198.51.100.41', 60 * 6),
      S('SE-006', 'U-04', 'web', 'Chrome · Windows', '192.0.2.14', 50), S('SE-007', 'U-05', 'android', 'Redmi Note · EG-Mobile', '198.51.100.42', 130),
      S('SE-008', 'U-06', 'web', 'Chrome · Windows', '192.0.2.16', 75), S('SE-009', 'U-07', 'web', 'Chrome · Windows (جهاز مشترك — المخزن)', '192.0.2.17', 300),
      S('SE-010', 'U-08', 'web', 'Chrome · Windows', '192.0.2.18', 180), S('SE-011', 'U-09', 'web', 'Firefox · Linux', '192.0.2.19', 480),
      S('SE-012', 'U-10', 'android', 'Galaxy A54 · EG-Mobile', '198.51.100.43', 120), S('SE-013', 'U-13', 'web', 'Chrome · Windows', '192.0.2.23', 540),
      S('SE-014', 'U-17', 'web', 'Chrome · Windows', '192.0.2.27', 60 * 24 * 13, { status: 'revoked', revokedAt: ago(60 * 24 * 12), revokedBy: 'U-01' }),
      S('SE-015', 'U-19', 'web', 'Chrome · Windows', '192.0.2.29', 240)
    ];
  }

  function buildNotifications() {
    const N = (n, mins, title, body, level, to, link, read) => ({ id: 'N-' + (100 + n), ts: ago(mins), title, body, level, to, toUsers: [], link, readBy: read ? read : [] });
    return [
      N(8, 12, 'حساب موقوف: دعاء ماهر', 'تم قفل الحساب بعد تجاوز حد المحاولات الفاشلة. افتح مركز الأمان أو المستخدمين لفك القفل.', 'urgent', ['R-01', 'R-10'], '#/users/U-12'),
      N(7, 35, 'طلب اعتماد جديد: خصم SO-2026-0412', 'ياسر مصطفى طلب خصم 8% — بانتظار مدير المبيعات.', 'action', ['R-03', 'R-01'], '#/approvals/AP-2001'),
      N(6, 60 * 3, 'طلب تجاوز تسجيل تاجر', 'مدير المبيعات اقترح تجاوز طلب «مؤسسة النور للتجارة». القرار يُسجَّل بسبب.', 'action', ['R-01'], '#/approvals/AP-2007'),
      N(5, 60 * 5, 'سند صرف PV-2026-0119 بانتظار الاعتماد', 'المبلغ 38,000 ج.م — بانتظار المدير العام.', 'action', ['R-02', 'R-01'], '#/approvals/AP-2004'),
      N(4, 60 * 26, 'طلب كبير بانتظار المدير العام', 'SO-2026-0418 — 412,000 ج.م. اعتمده مدير المبيعات.', 'action', ['R-02', 'R-01'], '#/approvals/AP-2002'),
      N(3, 60 * 48, 'تغيير في الصلاحيات', 'تم تحديث دور Sales Manager. راجع سجل التدقيق.', 'info', ['R-01', 'R-10'], '#/audit'),
      N(2, 60 * 72, 'مستخدمان بانتظار التفعيل', 'شيماء لطفي ومحمود الجمال لم يفعّلا حساباتهما بعد.', 'info', ['R-01'], '#/users?status=pending'),
      N(11, 60 * 8, 'كشف المرتبات PR-2026-10 بانتظار المراجعة', 'جهّزه مسؤول المرتبات — بانتظار مدير الموارد البشرية.', 'action', ['R-11', 'R-01'], '#/approvals/AP-2009'),
      N(10, 60 * 12, 'طلب توظيف جديد', 'مشرف خط الألومنيوم طلب فني تشغيل (2).', 'action', ['R-11', 'R-01'], '#/approvals/AP-2013'),
      N(9, 60 * 4, 'طلب سلفة', 'مصطفى عوض طلب سلفة — بانتظار HR.', 'action', ['R-11'], '#/approvals/AP-2014'),
      N(1, 60 * 120, 'نموذج تجريبي', 'أهلًا بك. افتح «وضع الاختبار» لتبدأ المهام، وكل البيانات هنا تجريبية ومحفوظة في متصفحك فقط.', 'info', [], '')
    ];
  }


  /* ───────────────────────── HR collections ───────────────────────── */
  function buildHr() {
    const d = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    const POS = [['P-01', 'المدير العام', 'D-01', 1, 1], ['P-02', 'مدير المبيعات', 'D-02', 2, 2], ['P-03', 'مندوب مبيعات', 'D-02', 6, 5], ['P-04', 'محاسب', 'D-03', 3, 3], ['P-05', 'أمين مخزن', 'D-04', 3, 3], ['P-06', 'مدير الإنتاج', 'D-05', 1, 1], ['P-07', 'مشرف خط', 'D-09', 3, 1], ['P-08', 'فني تشغيل', 'D-09', 12, 10], ['P-09', 'فني دهان', 'D-11', 4, 3], ['P-10', 'فني تركيب', 'D-12', 6, 4], ['P-11', 'مسؤول مشتريات', 'D-06', 2, 2], ['P-12', 'أخصائي موارد بشرية', 'D-07', 3, 3], ['P-13', 'مسؤول سلامة', 'D-13', 1, 1], ['P-14', 'مسؤول مرتبات', 'D-03', 1, 1]];
    const positions = POS.map((p) => ({ id: p[0], title: p[1], departmentId: p[2], grade: null, headcount: p[3], filled: p[4] }));
    // [id, name, userId, dept, position, status, shift, type, basic, allow, hireDaysAgo, city, mgrEmp]
    const E = [
      ['E-1001', 'خالد عبد الله', 'U-03', 'D-01', 'P-01', 'active', 'day', 'permanent', 38000, 9000, 2400, 'المنصورة', null],
      ['E-1002', 'هبة فاروق', 'U-04', 'D-02', 'P-02', 'active', 'day', 'permanent', 24000, 5000, 1800, 'المنصورة', 'E-1001'],
      ['E-1003', 'باسم عوض', 'U-19', 'D-02', 'P-02', 'active', 'day', 'permanent', 21000, 4000, 1100, 'القاهرة', 'E-1001'],
      ['E-1004', 'نهى إبراهيم', 'U-06', 'D-03', 'P-04', 'active', 'day', 'permanent', 17000, 3000, 1500, 'المنصورة', 'E-1001'],
      ['E-1005', 'ياسر مصطفى', 'U-05', 'D-02', 'P-03', 'active', 'day', 'permanent', 11000, 2500, 900, 'المنصورة', 'E-1002'],
      ['E-1006', 'مروة جلال', 'U-10', 'D-02', 'P-03', 'active', 'day', 'permanent', 10500, 2500, 700, 'جمصة', 'E-1002'],
      ['E-1007', 'إسلام شريف', 'U-11', 'D-02', 'P-03', 'active', 'day', 'permanent', 10000, 2200, 500, 'القاهرة', 'E-1002'],
      ['E-1008', 'عمرو حسن', 'U-07', 'D-04', 'P-05', 'active', 'A', 'permanent', 13000, 2000, 1600, 'جمصة', 'E-1001'],
      ['E-1009', 'سلمى رضا', 'U-08', 'D-07', 'P-12', 'active', 'day', 'permanent', 22000, 4500, 1300, 'المنصورة', 'E-1001'],
      ['E-1010', 'ريم عبد الحميد', 'U-25', 'D-07', 'P-12', 'active', 'day', 'permanent', 12000, 2000, 600, 'المنصورة', 'E-1009'],
      ['E-1011', 'أشرف عماد', 'U-26', 'D-03', 'P-14', 'active', 'day', 'permanent', 14000, 2500, 800, 'جمصة', 'E-1004'],
      ['E-1012', 'حسام كامل', 'U-13', 'D-05', 'P-06', 'active', 'day', 'permanent', 26000, 6000, 2000, 'المنصورة', 'E-1001'],
      ['E-1013', 'رانيا عادل', 'U-14', 'D-06', 'P-11', 'active', 'day', 'permanent', 15000, 2500, 1000, 'المنصورة', 'E-1001'],
      ['E-1014', 'سيد رمضان', 'U-27', 'D-09', 'P-07', 'active', 'A', 'permanent', 14500, 3500, 1700, 'جمصة', 'E-1012'],
      ['E-1015', 'عبير الشافعي', 'U-28', 'D-13', 'P-13', 'active', 'day', 'permanent', 14000, 2500, 900, 'جمصة', 'E-1012'],
      ['E-1016', 'كريم زكريا', 'U-17', 'D-04', 'P-05', 'terminated', 'B', 'permanent', 9500, 1500, 1400, 'جمصة', 'E-1008'],
      ['E-1017', 'مصطفى عوض', 'U-29', 'D-09', 'P-08', 'active', 'A', 'permanent', 8500, 1800, 800, 'جمصة', 'E-1014'],
      ['E-1018', 'أميرة وجدي', 'U-22', 'D-04', 'P-05', 'active', 'B', 'permanent', 9800, 1500, 600, 'جمصة', 'E-1008'],
      ['E-1019', 'جيهان سعد', 'U-24', 'D-07', 'P-12', 'active', 'day', 'permanent', 11500, 2000, 500, 'المنصورة', 'E-1009']
    ];
    const WORKERS = ['إبراهيم صلاح', 'عاطف حمدي', 'ماهر سلامة', 'رضا عبد الفتاح', 'أيمن شوقي', 'هاني عادل', 'وائل مسعود', 'محسن بدوي', 'طارق زيدان', 'سمير علّام', 'شريف مرزوق', 'جمال قطب'];
    const WD = [['D-09', 'P-08'], ['D-09', 'P-08'], ['D-10', 'P-08'], ['D-10', 'P-08'], ['D-10', 'P-08'], ['D-11', 'P-09'], ['D-11', 'P-09'], ['D-12', 'P-10'], ['D-12', 'P-10'], ['D-12', 'P-10'], ['D-09', 'P-08'], ['D-10', 'P-08']];
    WORKERS.forEach((n, i) => E.push(['E-' + (1020 + i), n, null, WD[i][0], WD[i][1], i === 11 ? 'probation' : i === 5 ? 'leave' : 'active', ['A', 'B', 'C'][i % 3], i % 4 === 3 ? 'daily' : 'permanent', 7600 + (i % 5) * 400, 1200 + (i % 3) * 200, 100 + i * 120, 'جمصة', 'E-1014']));
    const employees = E.map((e, i) => ({ id: e[0], empNo: 'EMP-' + String(i + 1).padStart(4, '0'), name: e[1], userId: e[2], departmentId: e[3], positionId: e[4], managerEmpId: e[12], status: e[5], hireDate: d(e[10]), endDate: e[5] === 'terminated' ? d(20) : null, shift: e[6], employmentType: e[7], phone: '+20 111 000 ' + String(1000 + i), city: e[11], nationalIdLast4: String(1000 + ((i * 7919) % 8999)), bankLast4: String(2000 + ((i * 104729) % 7999)), salary: { basic: e[8], allowances: e[9], demo: true }, relatives: [] }));
    employees.find((x) => x.id === 'E-1006').relatives = ['E-1005'];
    const leaveBalances = []; ['E-1005', 'E-1006', 'E-1014', 'E-1017', 'E-1020', 'E-1025'].forEach((id) => { [['annual', 21, 4], ['sick', 15, 0], ['casual', 6, 1]].forEach((t) => leaveBalances.push({ id: 'LB-' + id + '-' + t[0], employeeId: id, type: t[0], balanceDays: t[1] - t[2], usedDays: t[2], demo: true })); });
    const leaveRequests = [
      { id: 'LV-2026-0001', employeeId: 'E-1020', type: 'annual', from: d(-3), to: d(-5), days: 3, status: 'pending', approverEmpId: 'E-1014', reason: 'ظروف عائلية', createdAt: ago(60 * 20) },
      { id: 'LV-2026-0002', employeeId: 'E-1017', type: 'annual', from: d(-10), to: d(-12), days: 3, status: 'approved', approverEmpId: 'E-1014', reason: 'سفر', createdAt: ago(60 * 40) },
      { id: 'LV-2026-0003', employeeId: 'E-1017', type: 'casual', from: d(-1), to: d(-1), days: 1, status: 'pending', approverEmpId: 'E-1014', reason: 'ظرف طارئ', createdAt: ago(60 * 3) }
    ];
    const attendance = []; const ids = ['E-1005', 'E-1008', 'E-1014', 'E-1017', 'E-1018', 'E-1020', 'E-1021', 'E-1022', 'E-1023', 'E-1025'];
    for (let k = 1; k <= 5; k++) ids.forEach((id, i) => { const r = (i * 7 + k * 13) % 11; const st = r === 0 ? 'absent' : r === 1 ? 'late' : 'present'; const emp = employees.find((x) => x.id === id); attendance.push({ id: 'AT-' + id + '-' + k, employeeId: id, date: d(k), in: st === 'absent' ? null : st === 'late' ? '08:' + (20 + r * 3) : '07:5' + (i % 10), out: st === 'absent' ? null : '16:0' + (k % 10), status: st, shift: emp.shift }); });
    const grossAll = employees.filter((e) => e.status !== 'terminated').reduce((a, e) => a + e.salary.basic + e.salary.allowances, 0);
    return {
      employees, positions, leaveBalances, leaveRequests, attendance,
      payrollRuns: [{ id: 'PR-2026-10', period: '2026-10', status: 'prepared', preparedBy: 'U-26', employees: employees.filter((e) => e.status !== 'terminated').length, gross: grossAll, deductions: null, net: null, demo: true, approvalId: 'AP-2009' }],
      loans: [{ id: 'LN-2026-0001', employeeId: 'E-1017', kind: 'advance', amount: 3000, monthly: null, status: 'requested', requestedAt: ago(240), approvalId: 'AP-2014' }],
      requisitions: [{ id: 'RQ-2026-0001', positionId: 'P-08', departmentId: 'D-09', headcount: 2, reason: 'زيادة الطلب على الإنتاج', requestedBy: 'U-27', status: 'pending_approval', createdAt: ago(720), approvalId: 'AP-2013' }, { id: 'RQ-2026-0002', positionId: 'P-10', departmentId: 'D-12', headcount: 1, reason: 'استبدال', requestedBy: 'U-13', status: 'open', createdAt: ago(60 * 24 * 9), approvalId: null }],
      candidates: [{ id: 'CD-001', name: 'أحمد سعيد', requisitionId: 'RQ-2026-0002', stage: 'interview', source: 'بوابة الوظائف', appliedAt: ago(60 * 24 * 6) }, { id: 'CD-002', name: 'منة الله فتحي', requisitionId: 'RQ-2026-0002', stage: 'screening', source: 'ترشيح داخلي', appliedAt: ago(60 * 24 * 4) }, { id: 'CD-003', name: 'يوسف مجدي', requisitionId: 'RQ-2026-0002', stage: 'applied', source: 'بوابة الوظائف', appliedAt: ago(60 * 24 * 2) }, { id: 'CD-004', name: 'نادر عبد الله', requisitionId: 'RQ-2026-0002', stage: 'test', source: 'بوابة الوظائف', appliedAt: ago(60 * 24 * 5) }],
      salaryChanges: [{ id: 'SC-2026-0001', employeeId: 'E-1005', fromBasic: 11000, toBasic: 12500, requestedBy: 'U-26', status: 'pending', approvalId: 'AP-2011', createdAt: ago(360) }],
      settlements: [{ id: 'FS-2026-0001', employeeId: 'E-1016', status: 'calculated', calculatedBy: 'U-25', approvalId: 'AP-2012', createdAt: ago(60 * 30) }]
    };
  }

  SA.seed = {
    build() {
      const roles = buildRoles();
      const users = buildUsers();
      const audit = buildAudit();
      const creds = {}; users.forEach((u) => { creds[u.id] = SEED_PW; });
      return {
        meta: { v: 4, auditSeq: audit.seq, notifySeq: 130, seededAt: new Date().toISOString() },
        session: { userId: null, snap: null, sessionId: null, loginAt: null, lastActive: null, locked: false },
        users, creds, roles, ...buildHr(),
        departments: [
          { id: 'D-01', name: 'الإدارة العليا', managerId: 'U-03', parentId: null, active: true },
          { id: 'D-02', name: 'المبيعات', managerId: 'U-04', parentId: null, active: true },
          { id: 'D-03', name: 'المالية', managerId: 'U-06', parentId: null, active: true },
          { id: 'D-04', name: 'المخازن', managerId: 'U-07', parentId: null, active: true },
          { id: 'D-05', name: 'الإنتاج والجودة', managerId: 'U-13', parentId: null, active: true },
          { id: 'D-06', name: 'المشتريات', managerId: 'U-14', parentId: null, active: true },
          { id: 'D-07', name: 'الموارد البشرية', managerId: 'U-08', parentId: null, active: true },
          { id: 'D-08', name: 'تقنية المعلومات', managerId: 'U-09', parentId: null, active: true },
          { id: 'D-09', name: 'خط الألومنيوم', managerId: 'U-27', parentId: 'D-05', active: true },
          { id: 'D-10', name: 'خط uPVC', managerId: 'U-13', parentId: 'D-05', active: true },
          { id: 'D-11', name: 'الدهان والتشطيب', managerId: 'U-13', parentId: 'D-05', active: true },
          { id: 'D-12', name: 'التركيب والصيانة', managerId: 'U-13', parentId: 'D-05', active: true },
          { id: 'D-13', name: 'السلامة والصحة المهنية', managerId: 'U-28', parentId: null, active: true }
        ],
        modules: [
          { key: 'sales', nameAr: 'المبيعات', enabled: true, locked: false, phase: 'v1', note: '' },
          { key: 'customers', nameAr: 'العملاء', enabled: true, locked: false, phase: 'v1', note: '' },
          { key: 'products', nameAr: 'المنتجات', enabled: true, locked: false, phase: 'v1', note: '' },
          { key: 'inventory', nameAr: 'المخزون', enabled: true, locked: false, phase: 'v1', note: '' },
          { key: 'manufacturing', nameAr: 'التصنيع', enabled: true, locked: false, phase: 'v1', note: '' },
          { key: 'purchasing', nameAr: 'المشتريات', enabled: true, locked: false, phase: 'v1', note: '' },
          { key: 'finance', nameAr: 'المالية', enabled: true, locked: false, phase: 'v1', note: '' },
          { key: 'hr', nameAr: 'الموارد البشرية', enabled: true, locked: false, phase: 'p2', note: 'أولوية P2 في v1 (Pending) — مفعّل في النموذج' },
          { key: 'quality', nameAr: 'الجودة', enabled: false, locked: false, phase: 'v2', note: 'خارج v1 قبل اعتماد فريق المنتج (بند 34)' },
          { key: 'super_admin', nameAr: 'Super Admin', enabled: true, locked: true, phase: 'v1', note: 'مقفول: لا يمكن تعطيله' }
        ],
        warehouses: [
          { id: 'W-01', code: 'WH-FG', name: 'مخزن المنتج التام', type: 'FG', managerId: 'U-07', active: true, hasStock: true },
          { id: 'W-02', code: 'WH-RM', name: 'مخزن المواد الخام', type: 'RM', managerId: 'U-07', active: true, hasStock: true },
          { id: 'W-03', code: 'WH-WIP', name: 'مخزن تحت التشغيل', type: 'WIP', managerId: 'U-22', active: true, hasStock: true },
          { id: 'W-04', code: 'WH-SHW', name: 'مخزن المعرض', type: 'FG', managerId: 'U-22', active: false, hasStock: false }
        ],
        customers: [
          { id: 'C-001', code: 'CUS-001', name: 'معرض النيل للنوافذ', type: 'dealer', city: 'القاهرة', contacts: [{ name: 'م. سامي ناجي', phone: '+20 100 000 0001' }], salesRepId: 'U-05', priceListId: 'PL-02', status: 'active', balance: 31600, openOrders: 2 },
          { id: 'C-002', code: 'CUS-002', name: 'شركة الأفق للمقاولات', type: 'contractor', city: 'الجيزة', contacts: [{ name: 'أ. هشام قاسم', phone: '+20 100 000 0002' }], salesRepId: 'U-10', priceListId: 'PL-03', status: 'active', balance: 120000, openOrders: 3 },
          { id: 'C-003', code: 'CUS-003', name: 'مؤسسة السلام', type: 'dealer', city: 'الإسكندرية', contacts: [{ name: 'أ. ماجد رفعت', phone: '+20 100 000 0003' }], salesRepId: 'U-11', priceListId: 'PL-02', status: 'active', balance: 0, openOrders: 0 },
          { id: 'C-004', code: 'CUS-004', name: 'مقاولات الصعيد', type: 'contractor', city: 'أسيوط', contacts: [{ name: 'م. عادل يوسف', phone: '+20 100 000 0004' }], salesRepId: 'U-05', priceListId: 'PL-03', status: 'active', balance: 41246, openOrders: 1 },
          { id: 'C-005', code: 'CUS-005', name: 'معرض الصفوة', type: 'dealer', city: 'الجيزة', contacts: [{ name: 'أ. تامر فؤاد', phone: '+20 100 000 0005' }], salesRepId: 'U-10', priceListId: 'PL-02', status: 'active', balance: 9800, openOrders: 1 },
          { id: 'C-006', code: 'CUS-006', name: 'م. أحمد سمير (مباشر)', type: 'direct', city: 'القاهرة', contacts: [{ name: 'م. أحمد سمير', phone: '+20 100 000 0006' }], salesRepId: 'U-05', priceListId: 'PL-01', status: 'active', balance: 0, openOrders: 0 },
          { id: 'C-007', code: 'CUS-007', name: 'شركة التعمير', type: 'contractor', city: 'المنصورة', contacts: [{ name: 'أ. نبيل عزت', phone: '+20 100 000 0007' }], salesRepId: 'U-11', priceListId: 'PL-03', status: 'active', balance: 31100, openOrders: 1 },
          { id: 'C-008', code: 'CUS-008', name: 'معرض الدلتا', type: 'dealer', city: 'المنصورة', contacts: [{ name: 'أ. وائل شحاتة', phone: '+20 100 000 0008' }], salesRepId: 'U-10', priceListId: 'PL-02', status: 'active', balance: 0, openOrders: 0 },
          { id: 'C-009', code: 'CUS-009', name: 'العدس للتجارة', type: 'dealer', city: 'طنطا', contacts: [{ name: 'أ. محسن العدس', phone: '+20 100 000 0009' }], salesRepId: 'U-11', priceListId: 'PL-02', status: 'active', balance: 184500, openOrders: 2 },
          { id: 'C-010', code: 'CUS-010', name: 'مكتب هندسي — الشروق', type: 'direct', city: 'القاهرة', contacts: [{ name: 'م. شريف لبيب', phone: '+20 100 000 0010' }], salesRepId: 'U-05', priceListId: 'PL-01', status: 'disabled', balance: 0, openOrders: 0 }
        ],
        suppliers: [
          { id: 'S-001', code: 'SUP-001', name: 'مصنع الألومنيوم الوطني', type: 'raw', contacts: [{ name: 'أ. رضا الشرقاوي', phone: '+20 100 100 0001' }], paymentTerms: null, status: 'active', balance: 86400, openPOs: 2 },
          { id: 'S-002', code: 'SUP-002', name: 'شركة الإكسسوارات الحديثة', type: 'accessories', contacts: [{ name: 'أ. ياسمين فرج', phone: '+20 100 100 0002' }], paymentTerms: null, status: 'active', balance: 38000, openPOs: 1 },
          { id: 'S-003', code: 'SUP-003', name: 'الزجاج المصري', type: 'raw', contacts: [{ name: 'م. سعيد بدر', phone: '+20 100 100 0003' }], paymentTerms: null, status: 'active', balance: 0, openPOs: 0 },
          { id: 'S-004', code: 'SUP-004', name: 'مصنع الدهانات المتحد', type: 'raw', contacts: [{ name: 'أ. ليلى حمدي', phone: '+20 100 100 0004' }], paymentTerms: null, status: 'active', balance: 12500, openPOs: 1 },
          { id: 'S-005', code: 'SUP-005', name: 'ورشة الفواصل والمقابض', type: 'accessories', contacts: [{ name: 'أ. عصام منير', phone: '+20 100 100 0005' }], paymentTerms: null, status: 'disabled', balance: 0, openPOs: 0 },
          { id: 'S-006', code: 'SUP-006', name: 'شركة العبوات والتغليف', type: 'accessories', contacts: [{ name: 'أ. دينا حافظ', phone: '+20 100 100 0006' }], paymentTerms: null, status: 'active', balance: 4300, openPOs: 0 }
        ],
        priceLists: [
          { id: 'PL-01', name: 'قائمة التجزئة (مباشر)', itemsCount: 64, assignedTo: ['C-006', 'C-010'], updatedAt: ago(60 * 24 * 40), status: 'active' },
          { id: 'PL-02', name: 'قائمة تجار الجملة', itemsCount: 41, assignedTo: ['C-001', 'C-003', 'C-005', 'C-008', 'C-009', 'DL-01'], updatedAt: ago(3300), status: 'active' },
          { id: 'PL-03', name: 'قائمة المقاولين', itemsCount: 38, assignedTo: ['C-002', 'C-004', 'C-007'], updatedAt: ago(60 * 24 * 15), status: 'active' },
          { id: 'PL-04', name: 'قائمة تاجر خاص (مسودة)', itemsCount: 12, assignedTo: [], updatedAt: ago(120), status: 'draft' }
        ],
        dealerRequests: [
          { id: 'DR-101', company: 'شركة الأفق للمقاولات (طلب تاجر)', contact: 'هشام قاسم', phone: '+20 100 200 0101', city: 'الجيزة', docs: [{ name: 'سجل تجاري', ok: true }, { name: 'بطاقة ضريبية', ok: true }], status: 'pending_review', submittedAt: ago(60 * 40), reviewerId: null, decision: null, accountId: null },
          { id: 'DR-102', company: 'مؤسسة النور للتجارة', contact: 'مصطفى النجار', phone: '+20 100 200 0102', city: 'الإسكندرية', docs: [{ name: 'سجل تجاري', ok: true }, { name: 'بطاقة ضريبية', ok: false }], status: 'pending_review', submittedAt: ago(60 * 20), reviewerId: null, decision: null, accountId: null },
          { id: 'DR-103', company: 'معرض الصفوة الجديد', contact: 'تامر فؤاد', phone: '+20 100 200 0103', city: 'الجيزة', docs: [{ name: 'سجل تجاري', ok: false }], status: 'needs_info', submittedAt: ago(60 * 70), reviewerId: 'U-04', decision: { by: 'U-04', at: ago(60 * 60), reason: 'نرجو رفع صورة السجل التجاري', via: 'sales' }, accountId: null },
          { id: 'DR-104', company: 'شركة البناء الحديث', contact: 'عادل يوسف', phone: '+20 100 200 0104', city: 'أسيوط', docs: [{ name: 'سجل تجاري', ok: true }, { name: 'بطاقة ضريبية', ok: true }], status: 'approved', submittedAt: ago(60 * 24 * 6), reviewerId: 'U-04', decision: { by: 'U-04', at: ago(740), reason: 'مستندات كاملة وزيارة ميدانية', via: 'sales' }, accountId: 'DL-01' },
          { id: 'DR-105', company: 'تاجر الدلتا', contact: 'وائل شحاتة', phone: '+20 100 200 0105', city: 'المنصورة', docs: [{ name: 'سجل تجاري', ok: false }], status: 'rejected', submittedAt: ago(60 * 24 * 12), reviewerId: 'U-04', decision: { by: 'U-04', at: ago(11800), reason: 'مستندات ناقصة ولم تُستكمل', via: 'sales' }, accountId: null }
        ],
        dealers: [{ id: 'DL-01', requestId: 'DR-104', company: 'شركة البناء الحديث', customerId: null, priceListId: 'PL-02', status: 'active', createdAt: ago(740) }],
        approvals: buildApprovals(),
        sessions: buildSessions(),
        audit: audit.rows,
        notifications: buildNotifications(),
        settings: buildSettings(),
        ui: { showTags: true, density: 'comfortable', sidebarCollapsed: false, app: null },
        tour: { sim: { slow: false, error: false, offline: false }, notes: [], progress: {}, idleOverrideSec: null, open: false }
      };
    }
  };
})();
