/* EG Super Admin prototype — missions.js  (Test Lab missions — DATA ONLY)
   Format:
   { id, area:'users'|'roles'|…|'hr', title, persona:'owner'|…, route:'users/new', est:'3 د', goal,
     steps:[{ text, audit?:'CODE', route?:'moduleId', event?:'name', where?:{via:'mobile'} }],
     detect:[ {audit:'USER.CREATED', where?:{…entry fields…}} | {event:'name'} | {route:'moduleId'} ] }   // ALL clauses required; counted after «ابدأ»
   Modules may append more with SA.missions.add({...}). `phase2:true` = HR placeholder that becomes completable once the Phase-2 HR module exists. */
(function () {
  'use strict';
  const SA = window.SA;
  const list = [];
  SA.missions = {
    list,
    add(m) { const i = list.findIndex((x) => x.id === m.id); if (i >= 0) list.splice(i, 1, m); else list.push(m); SA.emit('missions'); return m; },
    areas: { users: 'المستخدمون', roles: 'الأدوار', security: 'الأمان', approvals: 'الاعتمادات', dealers: 'التجار', org: 'المنظمة', policies: 'السياسات', audit: 'التدقيق', mobile: 'الموبايل', system: 'النظام', test: 'اختبار الحالات', hr: 'الموارد البشرية' }
  };
  [
    { id: 'M-01', area: 'users', title: 'أنشئ مستخدمًا جديدًا وعيّن له دورًا', persona: 'owner', route: 'users/new', est: '3 د', goal: 'جرّب المعالج ذي الخطوات الثلاث، وتأكد إن الحساب «بانتظار التفعيل» وإنه ظهر في سجل التدقيق.',
      steps: [{ text: 'افتح «مستخدم جديد» واملأ البيانات (جرّب بريدًا مكررًا أولًا)', route: 'users' }, { text: 'اختر الدور والقسم وراجع ملخص الدور' }, { text: 'أرسل رابط التفعيل ثم جرّب صفحة التفعيل', audit: 'USER.CREATED' }], detect: [{ audit: 'USER.CREATED' }] },
    { id: 'M-02', area: 'users', title: 'غيّر دور مستخدم وراجع فرق الصلاحيات', persona: 'owner', route: 'users', est: '3 د', goal: 'من درج المستخدم → «الدور والنطاق»، شوف الفرق قبل التأكيد. جرّب كمان تغيّر دور نفسك (ممنوع).',
      steps: [{ text: 'افتح مستخدمًا (مثلاً ياسر مصطفى) واذهب لتبويب الدور والنطاق' }, { text: 'اختر دورًا جديدًا وراجع الفرق ثم أكّد بسبب', audit: 'USER.ROLE_CHANGED' }], detect: [{ audit: 'USER.ROLE_CHANGED' }] },
    { id: 'M-03', area: 'roles', title: 'عدّل صلاحيات دور وراجع ملخص الفروقات ثم احفظ بـStep-up', persona: 'owner', route: 'roles/R-03', est: '4 د', goal: 'غيّر خانة في المصفوفة (جرّب إلغاء «عرض»)، شوف شريط التغييرات غير المحفوظة، ثم ملخص الفروقات والتحقق.',
      steps: [{ text: 'افتح دور Sales Manager وعدّل خانة اعتماد/تصدير', route: 'roles' }, { text: 'اضغط «مراجعة الفروقات وحفظ» وراجع الملخص' }, { text: 'أدخل كود التحقق 123456', audit: 'ROLE.UPDATED' }], detect: [{ audit: 'ROLE.UPDATED' }] },
    { id: 'M-04', area: 'roles', title: 'حدّد نطاق «ذاتي» لمندوب وامنح صلاحية حساسة', persona: 'owner', route: 'scope?role=R-04', est: '4 د', goal: 'غيّر نطاق دور وامنح مفتاحًا حساسًا بتحذيره، واحفظهما بسبب وStep-up.',
      steps: [{ text: 'في شاشة النطاق غيّر نطاق العملاء أو المبيعات', route: 'scope' }, { text: 'من «الصلاحيات الحساسة» فعّل مفتاحًا (مثلاً عرض التكاليف)' }, { text: 'احفظ مع السبب والتحقق', audit: 'ROLE.SENSITIVE_GRANTED' }], detect: [{ audit: 'ROLE.SCOPE_CHANGED' }, { audit: 'ROLE.SENSITIVE_GRANTED' }] },
    { id: 'M-05', area: 'roles', title: 'شوف كأنك دور — ثم قارن دورين', persona: 'owner', route: 'roles/R-04', est: '2 د', goal: 'معاينة القائمة والشاشات اللي الدور هيشوفها بدون انتحال هوية، ومقارنة الفروق.',
      steps: [{ text: 'اضغط «شوف كأنك هذا الدور»' }, { text: 'افتح «مقارنة دورين»', route: 'roles' }], detect: [{ route: 'roles' }, { event: 'roles.viewas' }] },
    { id: 'M-06', area: 'security', title: 'اقفل حساب بعد محاولات فاشلة ثم افتح القفل', persona: 'owner', route: 'users', est: '4 د', goal: 'سجّل خروج، جرّب كلمة مرور غلط 5 مرات لحساب مندوب (قيمة تجريبية)، ثم ادخل كصاحب الشركة وافتح القفل.',
      steps: [{ text: 'سجّل الخروج وجرّب كلمة مرور غلط على rep@eg-demo.test حتى يقفل', audit: 'AUTH.ACCOUNT_LOCKED' }, { text: 'ادخل كصاحب الشركة وافتح قفل الحساب من المستخدمين', audit: 'USER.UNLOCKED' }], detect: [{ audit: 'AUTH.ACCOUNT_LOCKED' }, { audit: 'USER.UNLOCKED' }] },
    { id: 'M-07', area: 'users', title: 'عطّل مستخدمًا وشوف الأثر في كل مكان', persona: 'owner', route: 'users', est: '4 د', goal: 'عطّل مندوبًا: الجلسات تنتهي، السجل يتحدث، ولو سجّل دخوله بيترفض. جرّب كمان تعطيل آخر Super Admin (ممنوع).',
      steps: [{ text: 'عطّل مستخدمًا نشطًا بسبب', audit: 'USER.DISABLED' }, { text: 'افتح سجل التدقيق وشوف الحدث', route: 'audit' }], detect: [{ audit: 'USER.DISABLED' }] },
    { id: 'M-08', area: 'security', title: 'ولّد أكواد استرجاع لحساب Super Admin', persona: 'owner', route: 'users/security', est: '3 د', goal: 'من شاشة أمان Super Admin ولّد أكواد، نزّلها، وراجع الحدث الحرج.',
      steps: [{ text: 'افتح أمان Super Admin', route: 'sacct' }, { text: 'ولّد أكواد الاسترجاع بـStep-up', audit: 'SUPERADMIN.MFA_CHANGED' }], detect: [{ audit: 'SUPERADMIN.MFA_CHANGED' }] },
    { id: 'M-09', area: 'approvals', title: 'اعتمد طلب خصم من صندوق الاعتمادات', persona: 'salesmgr', route: 'approvals', est: '3 د', goal: 'كمدير مبيعات اعتمد طلب خصم بسبب. لاحظ ظهور الخطوة التالية للمدير العام وتحديث العدّاد.',
      steps: [{ text: 'افتح صندوق الاعتمادات', route: 'approvals' }, { text: 'اعتمد طلب الخصم AP-2001', audit: 'APPROVAL.APPROVED' }], detect: [{ audit: 'APPROVAL.APPROVED' }] },
    { id: 'M-10', area: 'approvals', title: 'ارفض طلبًا بسبب — وجرّب اعتماد طلبك أنت', persona: 'owner', route: 'approvals', est: '3 د', goal: 'افتح AP-2008 (طلبك): زر الاعتماد معطّل «فصل المهام». ارفض طلبًا آخر بسبب.',
      steps: [{ text: 'جرّب اعتماد AP-2008 (مقدّم الطلب هو أنت)' }, { text: 'ارفض طلبًا آخر بسبب', audit: 'APPROVAL.REJECTED' }], detect: [{ audit: 'APPROVAL.REJECTED' }] },
    { id: 'M-11', area: 'dealers', title: 'اعتمد طلب تاجر كـSales ثم تجاوزه كـSuper Admin', persona: 'salesmgr', route: 'dealers/requests', est: '5 د', goal: 'المبيعات هي الأصل. ثم بدّل لصاحب الشركة واعكس قرارًا بسبب + Step-up.',
      steps: [{ text: 'كمدير مبيعات: اعتمد/ارفض طلب تاجر', audit: 'DEALER.REQUEST_APPROVED' }, { text: 'كصاحب الشركة: تجاوز قرارًا بسبب', audit: 'DEALER.OVERRIDDEN' }], detect: [{ audit: 'DEALER.REQUEST_APPROVED' }, { audit: 'DEALER.OVERRIDDEN' }] },
    { id: 'M-12', area: 'org', title: 'عطّل موديولًا وشوف الأثر', persona: 'owner', route: 'modules', est: '3 د', goal: 'عطّل موديولًا (مثلاً المشتريات)، راجع حوار الأثر، ثم شوف ظهوره في المصفوفة والسجل.',
      steps: [{ text: 'افتح الموديولات وعطّل موديولًا', audit: 'MODULE.TOGGLED' }], detect: [{ audit: 'MODULE.TOGGLED' }] },
    { id: 'M-13', area: 'policies', title: 'غيّر بادئة ترقيم مستند', persona: 'owner', route: 'policies/numbering', est: '3 د', goal: 'جرّب بادئة مكررة (ممنوعة) ثم بادئة جديدة؛ والأنواع اللي صدر منها مستندات مقفولة.',
      steps: [{ text: 'عدّل بادئة نوع لم يصدر منه مستند', audit: 'POLICY.NUMBERING_CHANGED' }], detect: [{ audit: 'POLICY.NUMBERING_CHANGED' }] },
    { id: 'M-14', area: 'policies', title: 'جرّب محاكي قواعد الاعتماد', persona: 'owner', route: 'policies/approvals', est: '2 د', goal: '«طلب بخصم X% وقيمة Y هيروح لمين؟» — المحاكي لا ينشئ طلبًا.',
      steps: [{ text: 'افتح مصفوفة الاعتماد وشغّل المحاكي', event: 'approval.simulated' }], detect: [{ event: 'approval.simulated' }] },
    { id: 'M-15', area: 'policies', title: 'اضبط مدة الخمول وجرّب قفل الشاشة', persona: 'owner', route: 'policies/security', est: '3 د', goal: 'غيّر مدة الخمول، ثم افتح «وضع الاختبار» وفعّل قفل الخمول وافتح الجلسة.',
      steps: [{ text: 'عدّل سياسة الأمان', audit: 'POLICY.SECURITY_CHANGED' }, { text: 'فعّل «قفل الخمول الآن» من وضع الاختبار', event: 'idle.locked' }], detect: [{ audit: 'POLICY.SECURITY_CHANGED' }, { event: 'idle.locked' }] },
    { id: 'M-16', area: 'audit', title: 'صدّر سجل التدقيق', persona: 'owner', route: 'audit', est: '2 د', goal: 'فلتر السجل وصدّره (Step-up). التصدير نفسه بيتسجّل.',
      steps: [{ text: 'افتح سجل التدقيق وصدّر CSV', audit: 'EXPORT.AUDIT' }], detect: [{ audit: 'EXPORT.AUDIT' }] },
    { id: 'M-17', area: 'mobile', title: 'افتح SA على الموبايل واعتمد طلبًا', persona: 'owner', route: 'mobile', est: '3 د', goal: 'الموبايل بيشارك نفس بيانات الاعتمادات. اعتمد من الإطار وشوف التحديث في الصندوق.',
      steps: [{ text: 'افتح معاينة الموبايل', route: 'mobile' }, { text: 'اعتمد طلبًا', audit: 'APPROVAL.APPROVED' }], detect: [{ route: 'mobile' }, { audit: 'APPROVAL.APPROVED', where: { via: 'mobile' } }] },
    { id: 'M-18', area: 'security', title: 'أنهِ جلسة جهاز لمستخدم', persona: 'it', route: 'sessions', est: '2 د', goal: 'كمسؤول IT أنهِ جلسة/جهاز، وشوف المستخدم بيخرج.',
      steps: [{ text: 'افتح الجلسات وأنهِ جلسة', audit: 'SESSION.REVOKED' }], detect: [{ audit: 'SESSION.REVOKED' }] },
    { id: 'M-19', area: 'test', title: 'جرّب شاشة ممنوعة كـHR Manager', persona: 'hr', route: 'roles', est: '2 د', goal: 'ادخل كـHR Manager وافتح #/roles مباشرة: صفحة 403 وحدث ACCESS.DENIED في السجل.',
      steps: [{ text: 'افتح /roles مباشرة', audit: 'ACCESS.DENIED' }], detect: [{ audit: 'ACCESS.DENIED' }] },
    { id: 'M-20', area: 'test', title: 'جرّب بطء الشبكة وخطأ الخادم وعدم الاتصال', persona: 'owner', route: 'users', est: '3 د', goal: 'من «محاكاة الحالات» فعّل البطء ثم «خطأ في الإجراء القادم» وحاول تعطيل مستخدمًا، ثم Offline.',
      steps: [{ text: 'فعّل محاكاة وجرّب إجراء', event: 'sim.used' }], detect: [{ event: 'sim.used' }] },
    { id: 'M-21', area: 'test', title: 'غيّر صلاحيات دورك أثناء الجلسة', persona: 'salesmgr', route: 'users', est: '2 د', goal: 'من وضع الاختبار فعّل «تغيّر الصلاحيات أثناء الجلسة» وشوف بانر «تم تحديث صلاحياتك» وأعد التحميل (UC-GLB-05).',
      steps: [{ text: 'فعّل المحاكاة ثم اضغط إعادة تحميل الصلاحيات', event: 'perms.reloaded' }], detect: [{ event: 'perms.reloaded' }] },
    /* ───── HR (placeholders: become completable when the Phase-2 HR modules exist) ───── */
    { id: 'M-H1', area: 'hr', phase2: true, title: 'HR: راجع واعتمد كشف المرتبات PR-2026-10', persona: 'hr', route: 'approvals', est: '5 د', goal: 'مسؤول المرتبات جهّز الكشف (تجريبي). كـHR Manager راجعه من صندوق الاعتمادات المشترك، ثم كمالية/مدير عام أكمل السلسلة. الأجور تظهر فقط لمن يملك hr.salary.view.',
      steps: [{ text: 'افتح دورة المرتبات في HR', route: 'hr-payroll' }, { text: 'اعتمد الكشف (خطوة مراجعة HR)', audit: 'HR.PAYROLL.APPROVED' }], detect: [{ audit: 'HR.PAYROLL.APPROVED' }] },
    { id: 'M-H2', area: 'hr', phase2: true, title: 'HR: اعتمد طلب توظيف من مشرف الخط', persona: 'hr', route: 'hr/requisitions', est: '3 د', goal: 'المشرف طلب فني تشغيل (AP-2013). اعتمده كـHR Manager ثم أكمل كمدير عام.',
      steps: [{ text: 'افتح طلبات التوظيف', route: 'hr-requisitions' }, { text: 'اعتمد الطلب', audit: 'HR.REQUISITION.APPROVED' }], detect: [{ audit: 'HR.REQUISITION.APPROVED' }] },
    { id: 'M-H3', area: 'hr', phase2: true, title: 'HR: اعتمد إجازة فريقك كمشرف', persona: 'supervisor', route: 'hr/leave', est: '2 د', goal: 'كمشرف خط اعتمد طلب إجازة لموظف من فريقك (نطاق الفريق).',
      steps: [{ text: 'افتح الإجازات', route: 'hr-leave' }, { text: 'اعتمد الطلب', audit: 'HR.LEAVE.APPROVED' }], detect: [{ audit: 'HR.LEAVE.APPROVED' }] },
    { id: 'M-H4', area: 'hr', phase2: true, title: 'HR: موظف يطلب إجازة من «خدماتي»', persona: 'employee', route: 'hr/ess', est: '2 د', goal: 'من واجهة الخدمة الذاتية المبسطة اطلب إجازة، ثم تابعها عند المشرف.',
      steps: [{ text: 'اضغط «طلب إجازة»', audit: 'HR.LEAVE.REQUESTED' }], detect: [{ audit: 'HR.LEAVE.REQUESTED' }] },
    { id: 'M-H5', area: 'hr', phase2: true, title: 'HR + SA: فصل المهام والأجور (hr.salary.view)', persona: 'gm', route: 'hr/employees', est: '3 د', goal: 'كمدير عام افتح ملف موظف: الأجور محجوبة (بند 46). ثم كصاحب الشركة امنح hr.salary.view للمدير العام من الأدوار وشوف الفرق.',
      steps: [{ text: 'افتح ملف موظف كمدير عام وشوف الأجر محجوب', route: 'hr-employees' }, { text: 'كصاحب الشركة امنح hr.salary.view', audit: 'ROLE.SENSITIVE_GRANTED' }], detect: [{ audit: 'ROLE.SENSITIVE_GRANTED' }] }
  ].forEach((m) => SA.missions.add(m));
})();
