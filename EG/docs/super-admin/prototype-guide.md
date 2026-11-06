# Super Admin + HR — دليل النموذج التفاعلي (Prototype Guide)

> للمطوّرين (Phase 2) وللمالك. **تطبيق واحد لمساحتين: Super Admin + الموارد البشرية (HR)** بنفس الـstore والاعتمادات والتدقيق والإشعارات. النموذج في `prototype/super-admin/` — HTML/CSS/JS ثابت، **يعمل من `file://`** (scripts كلاسيكية، بدون modules/fetch/build). البيانات تجريبية ومحفوظة في `localStorage` (`eg.sa.proto.v1`).

## 1. التشغيل
- مباشرة: افتح `prototype/super-admin/index.html` (file://).
- أو خادم محلي: `cd prototype/super-admin && python3 -m http.server 8765` ثم `http://localhost:8765/index.html`.
- **المُطلِق (Launcher):** `prototype/index.html` — بطاقة لكل رحلة («ابدأ كصاحب الشركة» / «ابدأ كـHR Manager» / «ابدأ كموظف» …). يربط إلى `prototype/super-admin/index.html#/start?persona=<owner|backup|gm|salesmgr|rep|acct|wh|hr|it|hrofficer|payroll|supervisor|ohs|employee>` فيفتح شاشة الدخول معبّأة ببيانات الشخصية. خادم: `cd EG && python3 -m http.server 8765` ثم `http://localhost:8765/prototype/index.html`.
- أول شاشة: «ابدأ كصاحب الشركة» → بريد/كلمة مرور → MFA. زر **وضع الاختبار** (Test Lab) عائم في الركن.

## 2. الشخصيات (كلمة المرور لكل الحسابات `Demo@1234` · كود MFA/OTP/Step-up الدائم `123456`)
| الشخصية | البريد | الدور | MFA | ملاحظات |
|---|---|---|---|---|
| owner | owner@eg-demo.test | R-01 Super Admin | ✔ | كل شيء |
| backup | backup@eg-demo.test | R-01 | ✔ | احتياطي (تجريبي — Open) |
| gm | gm@eg-demo.test | R-02 General Manager | ✔ | اعتمادات/تقارير، لا أجور |
| salesmgr | sales.mgr@eg-demo.test | R-03 | — | يعتمد خطوة 1 + طلبات التجار |
| rep | rep@eg-demo.test | R-04 Sales Rep | — | `sa.customers.view` فقط، نطاق own |
| acct | accountant@eg-demo.test | R-07 | — | سياسة المالية + تقارير |
| wh | warehouse@eg-demo.test | R-06 | — | المخازن |
| hr | hr@eg-demo.test | R-11 HR Manager | — | مساحة HR كاملة؛ في SA فقط `sa.users.view` + `sa.departments.view` → باقي شاشات SA ممنوعة |
| it | it@eg-demo.test | R-10 IT/Tech [New] | ✔ | أمان/جلسات/تكاملات |
| hrofficer | hr.officer@eg-demo.test | R-12 HR Officer [New] | — | تشغيل HR (ملفات/حضور/إجازات)، لا أجور |
| payroll | payroll@eg-demo.test | R-13 Payroll Officer [New] | — | يجهّز المرتبات (maker) ويرى الأجور؛ لا يعتمد ولا يطلق |
| supervisor | supervisor@eg-demo.test | R-14 Line Supervisor [New] | — | فريقه فقط (`hr.mss.use`): إجازات/أوفرتايم/طلب توظيف |
| ohs | ohs@eg-demo.test | R-15 OHS Officer [New] | — | السلامة + الطبي (`hr.medical.view`) |
| employee | employee@eg-demo.test | R-16 Employee (ESS) | — | واجهة «خدماتي» المبسطة (shell منفصل بأزرار كبيرة) |
(`hr` = HR Manager (R-11، يعتمد ويرى الأجور) · Owner/GM يرون المساحتين؛ GM **لا** يملك `hr.salary.view`.)
مستخدمون بحالات: `U-12` موقوف، `U-17`/`U-20` معطّل، `U-18`/`U-21` بانتظار التفعيل.

## 3. ترتيب تحميل السكربتات (`index.html`)
`icons.js (design system) → core.js → ui.js → seed.js → auth.js → shell.js → missions.js → tour.js → mod-users → mod-roles → mod-scope → mod-sacct → mod-overview → mod-approvals → mod-audit → mod-security → mod-access-log → mod-reports → mod-org → mod-policies → mod-data → mod-system → mod-mobile → mod-hr-core → mod-hr-people → mod-hr-time → mod-hr-pay → mod-hr-protect → mod-hr-ess → app.js` (كلها في `js/`). كل `mod-*.js` هو IIFE يستدعي `SA.register(...)`. **لا تعدّل ملفات غيرك**؛ CSS خاص بك يُضاف في **ملف `css/<ملفك>.css`** مرتبط من `index.html` أو داخل `proto.css` تحت تعليق باسمك (`/* ── B: ... */`) بادئته `sap-`.

## 4. واجهة `SA` (كل التواقيع)
### 4.1 بناء الواجهة
- `SA.h('tag.cls#id', attrs, ...children)` — hyperscript. attrs: `class`(string|array|object) `style`(obj|string) `dataset` `html` `on<event>` `ref` + أي attribute/aria. children: string/Node/array (falsy يُتجاهل).
- `SA.icon(name, cls?)` → SVG Node من السبريت (`#i-name`). `SA.icons.add(name, innerSvg24)` / `addMany({})`. الأيقونات المتاحة: ما في `js/icons.js` + الإضافات في `ui.js` (key, history, trash, edit, copy, unlock, dots, arrowleft/right, sort, building, list, compare, flask, note, target, play, external, qr, file, mail, link, star, layers, activity, inbox, grid, chevdown/up, doc, sidebar, pin, cursor, upload, swap, userplus, userx, checkcircle, xcircle, server, keyboard, gauge, moon).
- `SA.$ / SA.$$ / SA.clear(el) / SA.esc / SA.debounce / SA.uid / SA.clone / SA.deepEqual / SA.pick`.
### 4.2 المخزن (Store)
- `SA.store.get(path)` (مرجع حي — **لا تعدّله مباشرة**) · `set(path, v)` · `update(path, draft => {mutate} | v => newV)` · `subscribe(path, cb) → unsubscribe` (مجمّع/async، يُطلَق لو path أب/ابن) · `find(coll,id)` · `patch(coll,id,{..}|fn)` · `insert(coll, rec, atStart?)` · `remove(coll,id)` · `nextId(coll,'U',2)` → `U-25`.
- `SA.live(root, build, ['users','audit'])` — يعيد رسم `root` عند تغيّر المسارات، يرجع cleanup (أعده من `render`).
- `SA.resetDemo()`.
### 4.3 الوحدات والتنقل
```js
SA.register({ id:'users', group:'access', title:'المستخدمون', icon:'users', route:'users', perm:'sa.users.view', order:10,
              badge(){ return n|null }, nav:true, render(root, ctx){ …; return cleanup } })
```
- `group` ∈ `overview|access|org|policies|data|oversight|reports|system` (ترتيب القائمة). `route` قد يكون متداخلًا (`users/security`) — أطول تطابق يفوز. `perm:null` = أي مستخدم.
- `ctx = { path:[...segments بعد route], params:{query}, route, module, root, setCrumbs([{label,href?}]), setTitle(t) }`.
  مثال: `#/users/U-12?tab=sessions` → `ctx.path=['U-12']`, `ctx.params.tab='sessions'`. `render` يتعامل مع **loading/empty/error/denied**؛ لو رمى خطأ يعرض الـshell شاشة خطأ مع إعادة محاولة.
- `SA.nav('users/U-12', {replace?, query?})` · `SA.href(route)` · `SA.route` (الحالي) · `SA.link.user(id)|role(id,tab)|approval(id)|audit(q)|dealer(id)` · `SA.homeRoute()`.
- مسارات متوقعة للوحدات القادمة (ليستخدمها بعضكم كروابط): `overview, approvals(/AP-id), audit, security-center, sessions, dealers(/requests/DR-id), access-log, reports, company, departments, modules, warehouses, currency, policies/approvals, policies/numbering, policies/finance, policies/security, customers(/price-lists), suppliers, settings, notifications, integrations, backup, mobile`.
### 4.4 الصلاحيات
- `SA.can('sa.users.edit')` · `SA.canAny([...])` · `SA.canSensitive('data.cost.view')` · `SA.scopeOf('customers')` → own|team|department|all · `SA.scopeFilter('customers', rows, 'salesRepId')` · `SA.guard(perm)` → `null` أو عقدة ممنوع (ويسجّل `ACCESS.DENIED`) · `SA.denied({perm,title,text})`.
- الصلاحيات تُقرأ من **لقطة (snapshot) وقت الدخول**؛ لو الدور اتعدّل أثناء الجلسة يظهر بانر UC-GLB-05 و`SA.session.reloadPerms()` يحدّثها.
- مفاتيح: `sa.<res>.<action>` — الكتالوج في `SA.catalog.perms` / `SA.catalog.permKeys`. حساسة: `SA.catalog.sensitive`.
- `SA.session`: `user`, `userId`, `personaId`, `role`, `snapshot`, `isAuthed`, `locked`, `device`, `permsStale`.
### 4.5 التدقيق والإشعارات
- `SA.audit(code, {target:{type,id,label}, before, after, reason, severity, result:'success|failure|denied', via:'web|mobile|system', actor?})` — يضيف في `audit` (الأحدث أولًا). الخطورة الافتراضية من `SA.catalog.auditByCode[code]`. الأكواد: `SA.catalog.audit` (code,label,severity,category). مرّر `via:'mobile'` من وحدة الموبايل.
- `SA.notify({title, body, level:'urgent'|'action'|'info', to:[roleIds], toUsers:[userIds], link:'#/approvals/AP-1'})` — الجرس + `SA.notifications.unread(level?)`.
- `SA.track('event.name', data)` — حدث اختبار تلتقطه المهام (`{event:'…'}`). المستخدم حاليًا: `route:<moduleId>` (تلقائي), `sim.used`, `idle.locked`. **على وحدة C استدعاء `SA.track('approval.simulated')` عند تشغيل محاكي الاعتماد.**
- `SA.redact(obj)` · `SA.diffRows(before, after)` · `SA.diffTable(before, after)` — إخفاء الأجور/التكاليف/الأرباح لمن لا يملك الصلاحية.
### 4.6 التفاعل
- `SA.toast(msg, 'success|error|warn|info', {undo:fn, ms})`
- `SA.confirm({title, text, impact:[..], warnings:[..], reasonRequired, reasonLabel, danger, confirmLabel, extra:Node}) → Promise<{ok, reason}>`
- `SA.stepUp('role.update', {title,text}) → Promise<boolean>` — يسأل فقط لو المفتاح داخل `settings.security.stepUpActions` (قائمة قابلة للتعديل من سياسة الأمان؛ الكتالوج `SA.catalog.stepUp`). فشل 3 مرات ⇒ `AUTH.STEPUP_FAILED`.
- `SA.modal({title, subtitle, icon, body, foot:[..], size:'sm|md|lg|xl', danger, dismissible, onClose}) → {el, body, foot, close(result), closed:Promise, setBusy(b)}` · `SA.drawer({title, subtitle, body, foot, tabs, size, headActions})` (نفس الواجهة) · `SA.menu(anchor, items)`.
- `SA.btn({label, icon, kind:'primary|accent|ghost|danger', size, perm, reason, onClick, iconOnly})` — لو `perm` غير ممنوح أو `reason` موجود ⇒ زر مقفول بقفل + tooltip. **زر accent واحد فقط في الشاشة.**
- `SA.chip(text, kind)` · `SA.statusChip('user'|'approval'|'dealer'|'session', status)` · `SA.severityChip(sev)` · `SA.roleChip(roleId)` · `SA.avatar(name)` · `SA.userCell(user)` · `SA.kv([[label,value]])`.
- `SA.pageHead({title, desc, tags, actions, back})` · `SA.card({title, actions, flush}, ...kids)` · `SA.kpi(label, value, {href, accent, sub})` · `SA.tabs({tabs:[{id,label,icon,badge}], active, onChange}) → {el, setActive, setBadge}` · `SA.stepper(steps, idx)` · `SA.segmented(items, active, cb)` · `SA.alert('info|warning|danger|success', ...kids)`.
- الحالات: `SA.empty({icon,title,text,action:{label,onClick,perm}})` · `SA.errorState({onRetry})` · `SA.skeleton({kind:'table|cards|form', rows})`.
- `SA.table(opts)` — راجع التعليق أعلى الدالة في `ui.js`: `columns[{key,label,sort,value,render,class}]`, `rows`(array|fn), `search:{keys}`, `filters[{key,label,options:[[v,l]],test}]`, `initial`, `pageSize`, `selectable`, `bulk[{label,icon,danger,perm,run(rows)}]`, `rowActions(row)→menu items`, `onRowClick`, `empty`, `state`, `onRetry`, `toolbar`, `onChange`. يرجع `{el, refresh, setState, setRows, getState, selected, filteredRows, setFilter, clearSelection}`.
- النماذج: `SA.form.field({name,label,type:'text|email|tel|password|number|textarea|select|checkbox|switch|radio|multi',value,options:[[value,label,desc]],required,hint,rules:[fn],onChange}) → {el,get,set,error,validate,focus}` · `SA.form.group(fields) → {get(), validate()}` · `SA.form.rules.required|email|phone|min(n)`.
- المحاكاة: `SA.delay(ms?, {write})` · `SA.api(fn, {ms, read})` (يطبّق slow/offline/server-error) · `SA.fail(err)` · `SA.sim.{slow,error,offline}`. **كل تنفيذ يمرّ عبر `await SA.api(() => …)` داخل try/catch → `SA.fail(e)`.**
- `SA.tag('approved|pending|open|new', text?)` شارة توثيق (يمكن إخفاؤها) · `SA.openValue(label?)` (قيمة Open: «غير مُعدّ») · `SA.demoValue(text)` (قيمة تجريبية مُعلَّمة).
- `SA.fmt.date|time|dt|rel|num|money(n)` («ج.م»). `SA.download(file, text, mime)` · `SA.csv(rows)` · `SA.copy(text)`.
### 4.7 RBAC / مستخدمون / جلسات (مساعدات جاهزة)
- `SA.rbac`: `diff(permsA, permsB)`, `sentences(diff)`, `summary(role)`, `members(roleId)`, `superAdmins(onlyActive)`, `setCell`, `setSaKey`, `bump(roleId)`.
- `SA.users` (في `mod-users.js`): `disable(id)`, `enable(id)`, `unlock(id)`, `forceLogout(id)`, `resetPassword(id)`, `changeRole(id, roleId)`, `open(id)`، كلها `Promise<boolean>` وتتحقق من الصلاحية/القواعد/Confirm/Step-up/Audit/إشعار — **استخدمها بدل إعادة كتابتها** (مثلًا زر «فك قفل» في مركز الأمان = `SA.users.unlock(id)`).
- `SA.sessions` (في `mod-users.js`): `forUser(userId)`, `revoke(sessionId, {reason})`, `revokeAll(userId)` تكتب `SESSION.REVOKED`/`DEVICE.REVOKED`. الجلسة الملغاة تُنهي دخول صاحبها خلال ثوانٍ.
- `SA.auth`: `loginAs(personaId)`, `logout(msg)`, `lock()`.
### 4.8 البحث العام (Ctrl/Cmd+K)
`SA.search.register({id, label, perm, query(q) → [{title, sub, icon, route}]})` — النتائج تُفلتَر بصلاحية الباحث تلقائيًا. الأساسي يغطي الوحدات/المستخدمين/الأدوار/العملاء/الموردين/الترقيم.
### 4.9 المهام (Test Lab)
`SA.missions.add({...})` (راجع `js/missions.js`). الصيغة:
```js
{ id:'M-xx', title, area:'users', persona:'owner', route:'users/new', est:'3 د', goal:'…',
  steps:[{text, audit?:'USER.CREATED', route?:'users', event?:'name', where?:{via:'mobile'}}],
  detect:[{audit:'USER.CREATED'}, {event:'approval.simulated'}, {route:'audit'}] }   // كلها مطلوبة؛ تُحتسب بعد ضغط «ابدأ»
```

## 5. مفاتيح الـstore (التفاصيل الكاملة والحقول في رأس `js/seed.js`)
`meta, session, users, creds, roles, departments, modules, warehouses, customers, suppliers, priceLists, dealerRequests, dealers, approvals, sessions, audit, notifications, settings{company,numbering,approvalRules,finance,security,general,notifications,integrations,superAdmin}, ui{showTags,density,sidebarCollapsed}, tour{sim,notes,progress,idleOverrideSec}`.
قيم Open = `null` في الإعدادات (لا تخترع رقمًا). المخزن يتم تعديله بـ`SA.store.update/patch` فقط، ثم `SA.audit` ثم `SA.notify` عند اللزوم.

## 6. قواعد الاتفاقيات
- **Audit**: كل تغيير ⇒ `SA.audit(code, {target, before, after, reason})` بنفس الأكواد في الكتالوج (لا تخترع أكوادًا). ممنوع تعديل/حذف السجل. `ACCESS.DENIED` يتجمّع (count++).
- **Notifications**: `urgent` = أمني/حرج (أحمر) · `action` = مطلوب قرار (كحلي) · `info` = للعلم. `to` = أدوار.
- **Step-up** حسب الكتالوج `SA.catalog.stepUp` (`approval.decide`, `audit.export`, `dealer.override`, `policy.change`, `module.toggle`, `company.official`, `voucher.execute` …).
- **فصل المهام**: لا يعتمد المستخدم طلبه (`approval.requesterId === SA.session.userId` ⇒ الزر معطّل بسبب). المبيعات تعتمد طلبات التجار، والأدمن يتجاوز بـ`sa.dealers.override` + سبب + Step-up + `DEALER.OVERRIDDEN`.
- RTL: خصائص منطقية فقط · أرقام لاتينية (`.num`) · «ج.م» · لمس ≥ 44px على الأزرار الأساسية · لا emoji.
- لا تُظهر قيمة Open كرقم؛ استخدم `SA.openValue()`. تعطيل بدل حذف. لا ادعاء تكامل ضريبي؛ الفاتورة الإلكترونية «Open — التنفيذ مؤجل».

## 7. أصناف CSS المتاحة
- من الـDesign System: `.btn .btn-primary|accent|ghost|danger|sm|lg|icon` · `.field .label .input .select .textarea .help .check .switch` · `.chip .chip-success|warning|danger|info` · `.card .card-head .kpi` · `.table .table-wrap` · `.tabs .tab .segmented` · `.alert .alert-*` · `.empty .denied .avatar .role-chip .perm .perm-cb .timeline .audit .audit-item .progress .skeleton .setting-row .stackbar .chart-svg .amount .conf-badge` · `.pending-badge .approved-badge .open-badge .new-badge` (شارات).
- من `proto.css` (بادئة `sap-`): `sap-pagehead sap-h1 sap-desc sap-actions sap-back` · `sap-card sap-card-body sap-card-title` · `sap-grid-cards` (KPIs) · `sap-split` (master-detail) · `sap-tablecard sap-toolbar sap-chips sap-fchip sap-bulkbar sap-pager sap-kebab` · `sap-usercell sap-avatar` · `sap-kv` · `sap-alert sap-hint sap-impact sap-audit-note` · `sap-stepper` · `sap-empty sap-state-ico` · `sap-banner` · `sap-diff` · `sap-choices sap-choice` · `sap-switch-line` · `sap-count` · `sap-linkbtn` · `sap-doc-tag` (شارة قابلة للإخفاء) · `sap-open sap-demo-val` · `sap-sr` (للقارئات فقط) · `sap-section` · `sap-flex` · `sap-muted`.

## 8. ما يجب أن يبنيه كل وكيل
**B (الرقابة وعمليات الهوية)** — `mod-overview.js` (SA-22: KPIs من نفس المصدر + تنبيهات + عدّاد اعتمادات) · `mod-approvals.js` (SA-16: صندوق موحّد، Stepper السلسلة، اعتماد/رفض/طلب تعديل/تفويض، فصل المهام، Step-up، `APPROVAL.*`) · `mod-audit.js` (SA-17: فلاتر، Diff قبل/بعد، تصدير بـStep-up ⇒ `EXPORT.AUDIT`، للقراءة فقط) · `mod-security.js` (SA-18 مركز الأمان + SA-05 الجلسات والأجهزة + SA-06 حسابات/طلبات التجار) · `mod-access-log.js` (SA-19) · `mod-reports.js` (SA-23).
**C (المنظمة والسياسات والبيانات والنظام)** — `mod-org.js` (SA-07..11: الشركة، الأقسام، الموديولات + حوار الأثر، المخازن، العملة والوحدات) · `mod-policies.js` (SA-12..15: مصفوفة الاعتماد + المحاكي، الترقيم والقوالب، المالية، الأمان — **سياسة الأمان تعدّل `settings.security` (مدة الخمول، حد القفل، `stepUpActions`)**) · `mod-data.js` (SA-20/21: العملاء + قوائم الأسعار، الموردون) · `mod-system.js` (SA-24..27) · `mod-mobile.js` (SA-28: إطار هاتف يشارك `approvals` نفسها، `via:'mobile'`).
كلٌّ يضيف مهامه عبر `SA.missions.add` ويحدّث هذا الدليل بقسمه إن لزم.


## 9. توسعة: تطبيق واحد (Super Admin + HR)
### 9.1 المساحات (Apps)
- `SA.register({ app:'sa'|'hr', ... })` — الافتراضي `sa`، و`hr` تلقائيًا لو الـroute يبدأ بـ`hr/`. مجموعات قائمة HR في `SA.catalog.hrGroups` (لوحة HR · التوظيف · الموظفون · الوقت · المرتبات · التطوير والحماية · الإنهاء · المستندات والتقارير · الإعدادات)، ومجموعات SA في `SA.catalog.groups`؛ `SA.catalog.groupsOf(app)`.
- الشل: قسم «المساحات» أعلى القائمة + مبدّل (الإدارة | HR) في الشريط العلوي؛ لا يظهر لمن يملك مساحة واحدة فقط. `SA.appsFor()` · `SA.currentApp()` · `SA.setApp('hr')` · `SA.homeRoute(app?)` · `SA.appEnabled('hr')` (موديول HR يمكن تعطيله من SA-09 → صفحة «الموديول معطّل») · `SA.isEss()`.
- الشخصية تهبط في `role.homeApp` (`'sa'|'hr'`). موظف ESS (`hr.ess.use` فقط) يدخل **shell «خدماتي»** مبسطًا (بدون sidebar) ويفتح `hr/ess`.
- **كل شاشات HR مسجّلة الآن كـstubs** (`SA.hrNav` في `shell.js`، `stub:true`، شارة «قريبًا») بالصلاحية والـroute الصحيحين؛ **وكيل HR يستبدل الـstub بـ`SA.register` بنفس الـ`id`**:
| id | route | perm | feature |
|---|---|---|---|
| hr-dashboard | hr/dashboard | hr.dashboard.view | HR-27 |
| hr-planning / hr-requisitions / hr-candidates / hr-offers | hr/planning · requisitions · candidates · offers | hr.planning/requisitions/candidates/offers.view | HR-01..04 |
| hr-employees / hr-onboarding / hr-changes / hr-custody / hr-contractors | hr/employees · onboarding · changes · custody · contractors | hr.<x>.view | HR-06 · 05 · 07 · 08 · 34 |
| hr-shifts / hr-attendance / hr-leave / hr-overtime | hr/shifts · attendance · leave · overtime | hr.<x>.view | HR-09..12 |
| hr-salary / hr-payroll / hr-loans / hr-payments / hr-gov | hr/salary · payroll · loans · payments · gov | hr.salary_structure/payroll/loans/payments/gov.view | HR-13..17 |
| hr-performance / hr-training / hr-disciplinary / hr-ohs / hr-recognition | hr/performance · training · disciplinary · ohs · recognition | hr.<x>.view | HR-18..22 |
| hr-termination / hr-clearance / hr-settlement / hr-archive | hr/termination · clearance · settlement · archive | hr.<x>.view | HR-23..26 |
| hr-documents / hr-reports | hr/documents · reports | hr.documents/reports.view | HR-29 · 28 |
| hr-compliance / hr-settings / hr-acl | hr/compliance · settings · acl | hr.<x>.view | HR-30 · 33 · 31 |
| hr-mss ("فريقي") | hr/team | hr.mss.use | HR-32 |
| hr-ess ("خدماتي"، `nav:false`) | hr/ess | hr.ess.use | HR-32 — fallback موجود (أزرار كبيرة)؛ يُستبدل |
ملفات HR: `mod-hr-core.js` (HR-27/01..04/30/31/33) · `mod-hr-people.js` (05..08/34) · `mod-hr-time.js` (09..12) · `mod-hr-pay.js` (13..17) · `mod-hr-protect.js` (18..26/28/29) · `mod-hr-ess.js` (32). كلها placeholders فارغة محمّلة من `index.html`.
### 9.2 كتالوج الصلاحيات
- مفاتيح `hr.<resource>.<action>` في `SA.catalog.perms` (مدخلات `app:'hr'`، `SA.catalog.permsOf('hr')`)؛ `role.sa[]` يحمل مفاتيح `sa.*` و`hr.*` معًا (اسم الحقل قديم). `SA.catalog.permKeys` = الكل. `SA.can('hr.leave.approve')`.
- **المفاتيح الحساسة** (docs/hr §7.1) في `SA.catalog.sensitive` (تظهر في تبويب «الصلاحيات الحساسة»): `hr.salary.view` · `hr.medical.view` · `hr.discipline.view` · `hr.legal.view` · `hr.pii.reveal` · `hr.export.sensitive` · `hr.payroll.prepare|approve|release` · `hr.final_settlement.calculate|approve|pay` · `hr.salary.change.request|approve`. `SA.can(key)` تحوّل تلقائيًا للمفاتيح الحساسة إلى `SA.canSensitive`.
- **Alias:** `data.wages.view` (SA) ≡ `hr.salary.view` (HR) — مفتاح واحد في النموذج: `SA.catalog.alias`/`SA.catalog.canon(key)`؛ كل الدوال (`can`, `canSensitive`, `roleSensitive`, `SA.redact`) تقبل أيًّا من الاسمين. المالك يملكه، **GM لا يملكه** (بند 46)، HR Manager وPayroll Officer يملكانه.
- `SA.redact(obj)` يخفي أي مفتاح اسمه salary/wage/cost/profit… لمن لا يملك الصلاحية (حقل `employees[].salary` يتغطى تلقائيًا).
### 9.3 الاعتمادات والتدقيق والإشعارات (مشتركة)
- `approvals[]` فيه `area:'sa'|'hr'` و`type` من `SA.catalog.approvalTypes` (SA: discount, large_order, price_list, payment_voucher, dealer_override · HR: `payroll_run`, `salary_change`, `final_settlement`, `hiring_requisition`, `advance`, `leave`) + `ref:{type,id}` يربط السجل المصدر. **إنشاء طلب من أي موديول:** `SA.requestApproval({type, title, requesterId?, amount?, chain:[roleId|{roleId,label}], context:[[label,value]], ref:{type,id}})` → يُدخل الطلب في الصندوق المشترك (SA-16) وينبّه أول دور في السلسلة. عند القرار على الطلب يجب أن يحدّث مالك الموديول السجل المصدر (مثلاً `payrollRuns[].status`) ويكتب حدث HR المناسب. الصندوق (B) يعرض الكل ويفلتر بـ`area`.
- التدقيق: أكواد `HR.<AREA>.<ACTION>` في الكتالوج (فئة `hr`)؛ أضف أكوادًا جديدة بـ`SA.catalog.addAudit('HR.LOAN.CLOSED','إغلاق سلفة','medium','hr')`. كل مدخل تدقيق فيه `area` (`sa` أو `hr`) ليستعمله فلتر السجل ومركز الأمان. قراءة T3/T4 (`HR.SALARY.VIEWED`, `HR.EMPLOYEE.PII_REVEALED`) تُسجَّل بـ`SA.audit`.
- الإشعارات: نفس الجرس (`SA.notify`، `to:[roleIds]` أو `toUsers`). أدوار HR: R-11 HR Manager · R-12 HR Officer · R-13 Payroll · R-14 Supervisor · R-15 OHS · R-16 Employee.
- فصل المهام (إلزامي): من يجهّز كشف المرتبات لا يعتمده/يطلقه؛ من ينشئ تغيير مرتب/سلفة لا يعتمده؛ من يحسب المخالصة غير من يصرفها؛ HR لا يعدّل ملفه أو أقاربه (`employees[].relatives`). `SA.session.userId` مقابل `requesterId/preparedBy/calculatedBy`.
### 9.4 بيانات HR في الـstore (التفاصيل في رأس `seed.js`)
`employees` (31، مرتبط بـ`users` عبر `userId` وبـ`departments` المشتركة — أُضيفت أقسام الإنتاج D-09..D-13) · `positions` · `leaveBalances` · `leaveRequests` · `attendance` (عيّنة 5 أيام) · `payrollRuns` (`PR-2026-10` — **DEMO**، الاستقطاعات/الصافي `null` = Open/Law) · `loans` · `requisitions` · `candidates` · `salaryChanges` · `settlements`. أرقام المرتبات تجريبية (`salary.demo:true`) والقيم القانونية (تأمينات/ضريبة/أرصدة الإجازات) **Open/Law** ولا تُخترع. أرقام HR المقترحة (`EMP-`, `LV-`, `LN-`, `FS-`…) مضافة لـ`settings.numbering`.
### 9.5 مهام Test Lab لـHR
`M-H1..M-H5` في `missions.js` (`phase2:true`): اعتماد كشف المرتبات (`HR.PAYROLL.APPROVED`) · اعتماد طلب توظيف (`HR.REQUISITION.APPROVED`) · اعتماد إجازة كمشرف (`HR.LEAVE.APPROVED`) · طلب إجازة من «خدماتي» (`HR.LEAVE.REQUESTED`) · فصل المهام و`hr.salary.view` للـGM (`ROLE.SENSITIVE_GRANTED`). تكتمل تلقائيًا بمجرد أن تكتب وحدات Phase 2 هذه الأحداث.
### 9.6 ملاحظات تقنية
- `Element.prototype.append` مُعدَّل في `core.js` ليتجاهل `null/false` ويسطّح المصفوفات (لا يظهر نص "null").
- `SA.hrNav` (قائمة الـstubs) مرجع المعرّفات؛
- `app.js` في `js/app.js` (يشغّل الـstore والـtest lab والـrouter).

## 10. توسعة ERP: كل أقسام المصنع على نفس التطبيق (2026-11-06)
> الملفات: `js/erp-core.js` (العقد المشترك) · `js/seed-erp.js` (بيانات المصنع والقصة الحية) · `css/erp.css` · موديول لكل قسم `js/mod-<x>.js`. الخطة الكاملة: [`docs/PLAN.md`](../PLAN.md) (القسم 11 للديمو).

### 10.1 المساحات الجديدة (`SA.catalog.apps`)
`exec` لوحة القيادة والذكاء الاصطناعي · `crm` المبيعات وCRM · `mfg` التصنيع والجودة · `scm` المشتريات والمخازن والشحن · `fin` المالية والحسابات · `care` الدعم والصيانة · `expo` المعارض والفعاليات · `portal` بوابة التاجر (shell خاص `mountPortal` للتاجر الخارجي) — بجانب `sa` و`hr`.
- كل app له `home` (معرّف شاشة البداية) و`moduleKey` (يربطه بـSA-09 الموديولات). الشاشة نفسها ممكن يكون لها `moduleKey` (مثلاً الجودة `quality`).
- مفاتيح الصلاحية `<app>.<res>.<action>` (الكتالوج في `erp-core.js`، وتظهر تلقائيًا في شاشة الأدوار). التكاليف/الأرباح: `data.cost.view` / `data.profit.view` (حساسة، Approved بند 25).
- `C.groupsOf(app)` من `C.appGroups`، و`SA.register` يستنتج الـapp من أول جزء في الـroute.
- عقد المسارات (Route contract) في أول `erp-core.js` — `ERP.route(docId)` يحوّل أي رقم مستند (SO-/WO-/QC-/PS-/GRN-/DN-/INV-/RV-/PV-/JE-/TKT-/MWO-/EV-…) لرابطه.

### 10.2 `window.ERP`
- **بحث:** `ERP.item/customer/supplier/line/machine/wh` · `ERP.fmt.money/short/qty/pct/date` · `ERP.no('SO')` ترقيم بلا تكرار يحدّث `settings.numbering`.
- **المخزون:** `ERP.stock.qty/available/reserve/move/transfer/low/onOrder/value` — أرصدة `stock[]` + دفتر `stockMoves[]`.
- **الأستاذ العام:** `ERP.gl.post({memo, ref, lines:[{acc, dr|cr}]})` · `ERP.gl.balance(code, from, to)` — دليل حسابات `accounts[]` وقيود `journal[]`.
- **دورة العمل (`ERP.flow`)** — كل خطوة تكتب المخزون + القيد + التدقيق + الإشعار:
  `createOrder → submitOrder` (بوابة ⇒ `pending_review` ثم `logCall`؛ خصم/قيمة فوق الحد ⇒ اعتماد `sales_order`) `→ confirmOrder` (حجز أو أوامر تشغيل) `→ releaseWO → startWO → reportWO` (يفتح فحص نهائي) `→ recordQC` (مخزن تام أو حجر + NCR) `→ createDelivery → dispatch → deliver → invoiceOrder → receivePayment` (+ `chequeStatus`).
  المشتريات: `mrp() → createPRQ → createPO → submitPO` (اعتماد `purchase_order` فوق الحد) `→ sendPO → receivePO` (GRN + فحص استلام) `→ recordQC` (مخزن خامات + فاتورة مورد) `→ createVoucher` (اعتماد `voucher`) `→ executeVoucher`.
  الحدود (`ERP.flow.limits`) **قيم تجريبية**؛ الفعلية Open (بنود 33/42). الضريبة `ERP.taxRate()` = `settings.finance.taxRate` أو 14% تجريبية.
- **الاعتمادات:** `ERP.onApproval(refType, fn)` — مالك كل نوع يحدّث سجله المصدر (idempotent). الأنواع الجديدة في `C.approvalTypes`.
- **البيانات الخاصة بموديول:** `ERP.addSeed(name, (S, ctx) => …)` يعمل داخل `SA.seed.build`.
- **الواجهة:** `ERP.chart.columns/line/donut/bars/gauge/meter/funnel/spark` · `ERP.ui.kpi/kpis/status/docLink/itemCell/swatch/cost/chain(soId)/aiCard/insights(area)/demo`.

### 10.3 الشخصيات الجديدة
`prod` مدير الإنتاج · `qc` الجودة · `buyer` المشتريات · `logistics` الشحن · `cfo` المدير المالي (R-22) · `maint` الصيانة · `cs` خدمة العملاء · `marketing` المعارض · `dealer` التاجر (R-21، حساب خارجي C-001). المالك (R-01) و`gm` يبدآن في `exec`.

### 10.4 القصة الحية في البيانات
خط التجاليد L-03 متوقف (M-301، `MWO-2026-0087`، اعتماد شراء عاجل `AP-2104`) ويؤثر على طلب تصدير عُمان `SO-2026-0480` · طلب تاجر من البوابة `SO-2026-0481` بانتظار مكالمة · فوم بورد المستشفى بانتظار الفحص النهائي · NCR فرق لون + CAPA · أوامر شراء وسندات صرف بانتظار الاعتماد · 12 شهرًا من الفواتير والتحصيل والشيكات والقيود.

### 10.5 تصحيحات على البيانات الأصلية
البيانات الأصلية كانت لنشاط ألومنيوم/زجاج؛ اتعدّلت لنشاط WPC & PVC (الأقسام، الموردون، أسماء الخطوط في شاشات HR، اسم الشركة)، واسم حساب صاحب الشركة التجريبي.
