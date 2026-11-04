/* EG Design System — mobile-proto.js
   Interactive phone prototype for mobile.html#try (reference page only, NOT part of the app kit).
   A small state machine renders the real .m-* components (css/mobile.css) inside a 360×740 device:
   login → home → sales / production / stock / more, notifications, RBAC roles, AR⇄EN (RTL⇄LTR), offline,
   loading / empty / error states, and push notifications that deep-link and re-check permission + state.
   Every annotated element carries data-ann="key"; ANN below describes its shape, behaviour and Flutter widget,
   and the stage draws a numbered pin + leader line from the element to its note beside the phone. */
(function () {
  "use strict";
  var stage = document.getElementById("pr-stage");
  if (!stage) return;

  /* ───────────────────────── helpers ───────────────────────── */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function ic(n, c) { return '<svg class="icon ' + (c || "") + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  function T(ar, en) { return S.lang === "ar" ? ar : en; }
  function B(p) { return T(p[0], p[1]); }
  function nf(x) { return Number(x).toLocaleString("en-US"); }
  function a(k) { return ' data-ann="' + k + '"'; }
  function price(x) {
    return S.lang === "ar" ? '<span class="m-price">' + nf(x) + "<em>ج.م</em></span>"
      : '<span class="m-price"><em style="margin:0 4px 0 0">EGP</em>' + nf(x) + "</span>";
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ───────────────────────── data (seed from docs/demo-data.md) ───────────────────────── */
  var ROLES = {
    admin: { email: "admin@egerman-upvc.com", n: ["مدير النظام", "System Admin"], init: ["م", "S"], tag: "admin",
      perms: "sales.view sales.create sales.approve prod.view prod.update inv.view inv.request fin.view cost.view cus.view" },
    sales: { email: "sales@egerman-upvc.com", n: ["موظف مبيعات", "Sales Rep"], init: ["ع", "R"], tag: "sales",
      perms: "sales.view sales.create inv.view cus.view" },
    prod: { email: "production@egerman-upvc.com", n: ["مشرف إنتاج", "Production Lead"], init: ["ش", "P"], tag: "production",
      perms: "prod.view prod.update inv.view inv.request" }
  };
  var LOGINS = { "admin@egerman-upvc.com": ["admin123", "admin"], "sales@egerman-upvc.com": ["sales123", "sales"] };
  var CUS = [
    { id: "CUS-001", t: "retail", n: ["عميل تجزئة", "Retail customer"], s: ["عميل تجزئة", "Retail"], c: ["استلام مصنع", "Factory pickup"], bal: 0 },
    { id: "CUS-002", t: "contractor", n: ["مقاول — النيل للإنشاءات", "Contractor — Nile Construction"], s: ["النيل للإنشاءات", "Nile Constr."], c: ["المنصورة", "Mansoura"], bal: 159200 },
    { id: "CUS-003", t: "dealer", n: ["شركة العدس — عُمان", "Al-Adas Co. — Oman"], s: ["شركة العدس", "Al-Adas"], c: ["مسقط", "Muscat"], bal: 163800 }
  ];
  var CT = { dealer: ["موزع", "Dealer"], contractor: ["مقاول", "Contractor"], retail: ["تجزئة", "Retail"] };
  var PRD = [
    { sku: "DOOR-D134", n: ["باب WPC D134", "WPC Door D134"], sz: ["215×80", "215×90", "215×110"], u: ["وحدة", "pcs"], price: 7100, cost: 5200, av: 6, min: 20, wip: 8, fin: ["#7f6750", "#c5b4a0", "#604031", "#ebdecb", "#cfcfcf"] },
    { sku: "DOOR-D132", n: ["باب WPC D132", "WPC Door D132"], sz: ["215×80", "215×90"], u: ["وحدة", "pcs"], price: 7400, cost: 5450, av: 48, min: 15, wip: 0, fin: ["#7e766b", "#a39889", "#534034", "#f2f2f2", "#777777"] },
    { sku: "CLAD-17x280", n: ["تجاليد WPC 17×280", "WPC Cladding 17×280"], sz: ["17×280"], u: ["قطعة", "pcs"], price: 250, cost: 170, av: 1240, min: 300, wip: 0, fin: ["#c5b4a0", "#7f6750", "#e8e8e8", "#604031", "#777777"] },
    { sku: "FOAM-10", n: ["لوح PVC فوم", "PVC Foam Board"], sz: ["4.5–17"], szu: ["مم", "mm"], u: ["لوح", "sheets"], price: null, cost: null, av: 85, min: 40, wip: 0, fin: ["#f2f2f2", "#e8e8e8", "#cfcfcf"] },
    { sku: "ACC-DOOR-KIT", n: ["طقم إكسسوار باب", "Door Accessory Kit"], sz: ["—"], u: ["طقم", "sets"], price: 450, cost: 300, av: 130, min: 50, wip: 0, fin: [] }
  ];
  var INV = [
    { id: "INV-2025-0318", c: "CUS-002", amt: 159200, due: "2025-11-05", late: true },
    { id: "INV-2025-0315", c: "CUS-003", amt: 163800, due: "2025-11-10", late: false }
  ];
  var CASH = 410500;
  var ST = {
    draft: ["مسودة", "Draft", ""], confirmed: ["مؤكد", "Confirmed", "is-info"], production: ["إنتاج", "In production", "is-warn"], shipped: ["تم الشحن", "Shipped", "is-ok"],
    queued: ["في الانتظار", "Queued", "is-warn"], in_progress: ["جارٍ", "In progress", "is-warn"], done: ["مكتمل", "Done", "is-ok"]
  };
  var STEPS = ["draft", "confirmed", "production", "shipped"];

  function seed() {
    return {
      orders: [
        { id: "SO-2025-0145", st: "draft", c: "CUS-001", d: "2025-11-02", l: [["DOOR-D134", 2]] },
        { id: "SO-2025-0144", st: "shipped", c: "CUS-003", d: "2025-11-01", l: [["DOOR-D134", 50]] },
        { id: "SO-2025-0143", st: "production", c: "CUS-002", d: "2025-10-30", l: [["DOOR-D134", 12], ["CLAD-17x280", 54]] },
        { id: "SO-2025-0142", st: "confirmed", c: "CUS-002", d: "2025-10-28", l: [["DOOR-D134", 5], ["CLAD-17x280", 100]] }
      ],
      wos: [
        { id: "WO-2025-0087", st: "in_progress", sku: "DOOR-D134", q: 40, done: 22, due: "2025-11-08" },
        { id: "WO-2025-0088", st: "queued", sku: "CLAD-17x280", q: 600, done: 0, due: "2025-11-12" },
        { id: "WO-2025-0089", st: "done", sku: "FOAM-10", q: 120, done: 120, due: "2025-11-01" }
      ],
      notes: [
        { id: "n1", lv: "urgent", t: ["مخزون منخفض: باب D134", "Low stock: Door D134"], b: ["المتاح 6 والحد الأدنى 20", "Available 6, minimum 20"], ago: ["منذ 2 د", "2 min ago"], unread: true, resolved: false, roles: ["admin", "prod"], go: { r: "inv", sku: "DOOR-D134" }, btn: ["فتح المخزون", "Open stock"] },
        { id: "n2", lv: "action", t: ["SO-2025-0145 بانتظار تأكيدك", "SO-2025-0145 awaits your approval"], b: ["عميل تجزئة · 14,200 ج.م", "Retail customer · EGP 14,200"], ago: ["منذ 5 د", "5 min ago"], unread: true, resolved: false, roles: ["admin"], go: { r: "order", id: "SO-2025-0145" }, btn: ["فتح الطلب", "Open order"] },
        { id: "n3", lv: "info", t: ["تم شحن SO-2025-0144", "SO-2025-0144 shipped"], b: ["شركة العدس — عُمان", "Al-Adas Co. — Oman"], ago: ["منذ ساعة", "1 hr ago"], unread: false, resolved: true, roles: ["admin", "sales"], go: { r: "order", id: "SO-2025-0144" } }
      ]
    };
  }

  /* ───────────────────────── state ───────────────────────── */
  var S;
  function fresh(keep) {
    var d = seed();
    return {
      lang: keep ? keep.lang : "ar", ann: keep ? keep.ann : true,
      role: null, route: "login", params: {}, stack: [], tab: "home",
      offline: false, force: "normal",
      filt: { sales: "all", prod: "all", inv: "all", notes: "all", cus: "all" },
      q: "", sheet: null, push: null, pending: null,
      ns: { action: true, info: false, quiet: false },
      no: { c: "CUS-001", sku: "DOOR-D134", qty: 1 }, log: 5,
      login: { email: "", pw: "", err: "", busy: false, show: false },
      orders: d.orders, wos: d.wos, notes: d.notes, seq: { so: 146, wo: 90, n: 10 }
    };
  }
  S = fresh();

  function can(p) { return !!S.role && (" " + ROLES[S.role].perms + " ").indexOf(" " + p + " ") > -1; }
  var NEED = { sales: "sales.view", order: "sales.view", neworder: "sales.create", prod: "prod.view", wo: "prod.view", inv: "inv.view", finance: "fin.view", customers: "cus.view" };
  var TAB = { home: "home", sales: "sales", order: "sales", neworder: "sales", prod: "prod", wo: "prod", inv: "inv", more: "more", products: "more", customers: "more", finance: "more", nsettings: "more" };
  function prd(sku) { return PRD.filter(function (p) { return p.sku === sku; })[0]; }
  function cus(id) { return CUS.filter(function (c) { return c.id === id; })[0]; }
  function ord(id) { return S.orders.filter(function (o) { return o.id === id; })[0]; }
  function wo(id) { return S.wos.filter(function (o) { return o.id === id; })[0]; }
  function total(o) { return o.l.reduce(function (s, x) { return s + prd(x[0]).price * x[1]; }, 0); }
  function low(p) { return p.av < p.min; }
  function myNotes() { return S.notes.filter(function (n) { return S.role && n.roles.indexOf(ROLES[S.role].tag === "production" ? "prod" : S.role) > -1; }); }
  function bellCount() { return myNotes().filter(function (n) { return !n.resolved && (n.lv === "urgent" || n.lv === "action"); }).length; }
  function chip(st) { var s = ST[st]; return '<span class="m-chip ' + s[2] + '">' + T(s[0], s[1]) + "</span>"; }

  /* ───────────────────────── annotations ───────────────────────── */
  /* t = name · shape = how it looks · fn = what it does · w = Flutter widget */
  var NAV = { k: "nav", t: "التنقل السفلي", w: "NavigationBar", shape: "ارتفاع 64px · 5 تبويبات كحد أقصى · المختار كبسولة كحلي فاتح مع شريط أحمر علوي · نص 13px", fn: "التبويبات تظهر حسب صلاحية المستخدم. الباقي داخل «المزيد»." };
  var BELL = { k: "bell", t: "جرس الإشعارات", w: "IconButton + Badge", shape: "دائرة لمس 48px · شارة حمراء بعدد ما يحتاج إجراءً فقط", fn: "يفتح مركز الإشعارات. العدّاد يستثني «للعلم» وما تمت معالجته." };
  var BACK = { k: "back", t: "زر الرجوع", w: "BackButton", shape: "دائرة 48px · السهم ينقلب مع اتجاه اللغة", fn: "يرجع للشاشة السابقة ويحفظ الفلتر والتمرير." };
  var OFFL = { k: "offline", t: "شريط بدون إنترنت", w: "MaterialBanner", shape: "شريط كامل العرض · أصفر دافئ · أيقونة + جملة + «أعد المحاولة»", fn: "يبقى ظاهراً ما دام الاتصال مقطوعاً. العمل الحساس يتعطّل بسببه." };
  var SKEL = { k: "skel", t: "هيكل التحميل", w: "SkeletonList", shape: "نفس مقاس البطاقة · كتل رمادية متلألئة بدل دوّار", fn: "يحجز مكان المحتوى فلا تقفز الشاشة عند وصول البيانات." };
  var EMPT = { k: "empty", t: "حالة فارغة", w: "EmptyState", shape: "أيقونة 72px + عنوان + سطر شرح", fn: "تقول لماذا لا يوجد شيء وماذا يفعل المستخدم." };
  var ERRS = { k: "err", t: "تعذّر التحميل", w: "ErrorState", shape: "أيقونة حمراء خفيفة + زر «أعد المحاولة» ثانوي", fn: "لا نص خطأ تقني. المحاولة مرة أخرى بنقرة، والعمل لا يضيع." };
  var FILT = { k: "filters", t: "فلاتر الحالة", w: "ChoiceChip", shape: "كبسولات 44px · المفعّلة كحلي بنص أبيض · عدّاد صغير بجانب الاسم", fn: "اختيار بدل كتابة: تصفية القائمة بنقرة، وتمرير أفقي إن زادت." };
  var GLOBAL = [BELL, BACK, OFFL, SKEL, EMPT, ERRS, NAV];

  var ANN = {
    login: [
      { k: "logo", t: "الشعار الرسمي", w: "Image.asset", shape: "الشعار الأفقي الملوّن · ارتفاع 34px · بلا ظل أو تلوين", fn: "يظهر هنا فقط. في الأماكن الضيقة يُستعمل الختم وحده." },
      { k: "lang", t: "مفتاح اللغة", w: "SegmentedButton", shape: "زر 40px · الفعّال أبيض بظل خفيف على خلفية رمادية", fn: "يقلب الواجهة كلها بين RTL وLTR (مرآة كاملة) ويُحفظ الاختيار." },
      { k: "email", t: "حقل البريد", w: "TextField(email)", shape: "52px · حد 2px رمادي يصير كحلياً عند التركيز · نص 16px", fn: "لوحة مفاتيح البريد، والاتجاه LTR دائماً حتى في العربي." },
      { k: "pass", t: "حقل كلمة المرور", w: "TextField(obscure)", shape: "52px · أيقونة قفل + زر عين 44px لإظهار/إخفاء", fn: "عند الخطأ يتلوّن الحد بالأحمر ولا يُمسح ما كتبه المستخدم." },
      { k: "err-msg", t: "رسالة الخطأ", w: "InputDecoration.errorText", shape: "تحت الحقل مباشرة · أحمر داكن 14px عريض · أيقونة تنبيه", fn: "تقول ما حدث وما الحل. بديل عن SnackBar الأحمر القديم." },
      { k: "forgot", t: "نسيت كلمة السر؟", w: "TextButton", shape: "نص كحلي بخط سفلي · منطقة لمس 48px", fn: "يفتح شاشة الاستعادة بالبريد." },
      { k: "go", t: "زر الدخول", w: "FilledButton", shape: "الزر الرئيسي: أحمر #ED1C24 · 52px · نص 19px عريض أبيض · ركن 14px", fn: "إجراء واحد في الشاشة. أثناء الإرسال يظهر دوّار ويتعطّل الزر." },
      { k: "help", t: "رقم المساعدة", w: "Text.rich", shape: "سطر 14px رمادي · الرقم كحلي عريض", fn: "الخط الساخن 15536 لمن نسي كلمة السر أو أُوقف حسابه." }
    ],
    forgot: [
      { k: "ficon", t: "أيقونة الأمان", w: "CircleAvatar", shape: "دائرة 72px كحلي فاتح · أيقونة درع كحلية", fn: "تطمئن المستخدم أن الاستعادة آمنة." },
      { k: "femail", t: "حقل البريد", w: "TextField(email)", shape: "52px · متركّز تلقائياً عند فتح الشاشة", fn: "لا نكشف إن كان البريد مسجّلاً أم لا (أمان)." },
      { k: "fsend", t: "أرسل رابط الاستعادة", w: "FilledButton", shape: "أحمر 52px · فعل واحد", fn: "يرسل الرابط ويعود لشاشة الدخول مع تنبيه." },
      { k: "fback", t: "رجوع", w: "TextButton", shape: "نص كحلي بلا خلفية · 48px", fn: "مخرج واضح دون إتمام الاستعادة." }
    ],
    expired: [
      { k: "xicon", t: "أيقونة الحالة", w: "EmptyState.icon", shape: "ساعة داخل دائرة 72px كحلي فاتح", fn: "لا إنذار أحمر: الجلسة انتهت لأمانه وليست خطأً." },
      { k: "xbtn", t: "تسجيل الدخول", w: "FilledButton", shape: "كحلي 52px (ثانوي): الحالة ليست عاجلة", fn: "ما كتبه المستخدم محفوظ على الجهاز بعد العودة." }
    ],
    noperm: [
      { k: "pnicon", t: "أيقونة الصلاحية", w: "EmptyState.icon", shape: "درع داخل دائرة 72px", fn: "الشاشة موجودة لكنها خارج دور المستخدم." },
      { k: "pnbtn", t: "رجوع", w: "OutlinedButton", shape: "أبيض بحد رمادي ونص كحلي · 52px", fn: "لا طريق مسدود: رجوع وسطر يشرح من يضيف الصلاحية." }
    ],
    home: [
      { k: "kpi", t: "بطاقة مؤشر", w: "StatCard", shape: "بيضاء · ركن 14px · الرقم 19px عريض بخط Poppins بأرقام منتظمة", fn: "نفس مؤشرات التطبيق الحالي. بطاقات المالية تُخفى عمّن لا يملك الصلاحية." },
      { k: "seclink", t: "رابط «الكل»", w: "TextButton", shape: "نص كحلي عريض · منطقة لمس 32px على الأقل", fn: "ينقل للقائمة الكاملة في تبويبها." },
      { k: "rec", t: "بطاقة سجل", w: "RecordCard", shape: "بيضاء · ركن 14px · الرقم والحالة في الأعلى · القيمة في الأسفل", fn: "نقرة واحدة تفتح التفاصيل مباشرة." }
    ],
    sales: [
      FILT,
      { k: "rec", t: "بطاقة أمر بيع", w: "RecordCard (Card + ListTile)", shape: "رقم الأمر + الحالة · العميل والتاريخ · الإجمالي بخط Poppins", fn: "تفتح تفاصيل الأمر. الأمر المحفوظ دون نت يحمل «بانتظار المزامنة»." },
      { k: "chip", t: "شارة الحالة", w: "StatusChip", shape: "كبسولة 28px · نقطة + نص · اللون وحده لا يكفي", fn: "7 حالات بنفس أكواد التطبيق: مسودة، مؤكد، إنتاج، تم الشحن…" },
      { k: "fab", t: "زر أمر جديد", w: "FloatingActionButton.extended", shape: "عائم أحمر 56px · نص 17px · قرب الإبهام أسفل الشاشة", fn: "ينشئ مسودة أمر بيع. هو الإجراء الأحمر الوحيد هنا." }
    ],
    order: [
      { k: "recheck", t: "إعادة فحص الحالة", w: "MaterialBanner", shape: "شريط أخضر أعلى الشاشة بجملة واحدة", fn: "بعد فتح إشعار يتحقق التطبيق من حالة الأمر الآن قبل إظهار أي زر." },
      { k: "details", t: "بيانات الأمر", w: "Card + DefaultTextStyle", shape: "بطاقة بيضاء · التسميات رمادية والقيم عريضة · الإجمالي Poppins", fn: "الأساسيات في أول الشاشة، والبنود تحتها." },
      { k: "lines", t: "بنود الأمر", w: "ListView.separated", shape: "سطر لكل بند: الاسم والكمية يميناً والسعر يساراً · فاصل 1px", fn: "للقراءة فقط؛ التعديل من زر «تعديل»." },
      { k: "steps", t: "مراحل الأمر", w: "Stepper (custom)", shape: "4 مقاطع 6px · الحالية حمراء والسابقة كحلية · النص تحتها 13px", fn: "تقول أين وصل الأمر دون فتح شاشة أخرى." },
      { k: "noappr", t: "سطر الصلاحية", w: "Visibility(permission)", shape: "ملاحظة صفراء خفيفة بدل الزر", fn: "موظف المبيعات لا يرى «أكّد الأمر» أصلاً (RBAC) ولا يُترك زر معطّل بلا شرح." },
      { k: "confirm", t: "أكّد الأمر", w: "FilledButton", shape: "الزر الرئيسي الأحمر 52px داخل شريط ثابت أسفل الشاشة", fn: "يظهر لمن يملك صلاحية التأكيد فقط، ويفتح ورقة تأكيد. يتعطّل دون إنترنت." },
      { k: "promote", t: "حوّل للإنتاج", w: "FilledButton", shape: "أحمر 52px · يحلّ محل «أكّد» بعد التأكيد", fn: "ينشئ أمر تشغيل ويحرّك الأمر لمرحلة «إنتاج». معطّل دون إنترنت." },
      { k: "edit", t: "زر ثانوي", w: "OutlinedButton", shape: "أبيض بحد رمادي ونص كحلي · 52px", fn: "إجراء ثانوي لا ينافس الأحمر." }
    ],
    "order:confirm": [
      { k: "sheet", t: "ورقة التأكيد", w: "showModalBottomSheet", shape: "تصعد من الأسفل · ركن علوي 24px · مقبض 40×4 · خلفية معتمة", fn: "تأكيد قبل أي إجراء حاسم. تُغلق بنقرة خارجها أو «إلغاء»." },
      { k: "yes", t: "زر أكّد", w: "FilledButton", shape: "أحمر 52px · فعل واحد", fn: "ينفّذ التغيير ثم يعرض تنبيه نجاح مع «تراجع». معطّل دون إنترنت." },
      { k: "cancel", t: "إلغاء", w: "TextButton", shape: "نص كحلي بلا خلفية · 48px", fn: "مخرج آمن بلا أي تغيير." }
    ],
    neworder: [
      { k: "cus", t: "اختيار العميل", w: "ChoiceChip", shape: "كبسولات 44px بالاسم المختصر · المختار كحلي", fn: "تسريع الإدخال: اختيار لا كتابة." },
      { k: "prd", t: "اختيار المنتج", w: "RadioListTile", shape: "صف 56px · حد 2px يصير كحلياً مع خلفية فاتحة عند الاختيار", fn: "الاسم والسعر في صف واحد؛ نقرة واحدة تكفي." },
      { k: "stepper", t: "عدّاد الكمية", w: "Row(IconButton ×2)", shape: "زران 60×60 · الرقم 34px عريض في الوسط · زر الزيادة كحلي", fn: "كمية بالضغط بدل لوحة الأرقام، مناسب لليد المتسخة." },
      { k: "tot", t: "الإجمالي", w: "Card", shape: "بطاقة كحلية فاتحة · القيمة كبيرة بخط Poppins", fn: "يتحدّث فوراً مع المنتج والكمية." },
      { k: "save", t: "احفظ كمسودة", w: "FilledButton", shape: "أحمر 52px في شريط ثابت أسفل الشاشة", fn: "مسودة غير حساسة: تُحفظ حتى دون إنترنت وتُزامَن لاحقاً." }
    ],
    prod: [
      FILT,
      { k: "wo", t: "بطاقة أمر تشغيل", w: "RecordCard", shape: "الرقم والحالة · المنتج والكمية · شريط تقدّم · موعد التسليم", fn: "تفتح أمر التشغيل لتسجيل الإنتاج." },
      { k: "progress", t: "شريط التقدّم", w: "LinearProgressIndicator", shape: "ارتفاع 8px · كحلي ويتحول أخضر عند 100% · النسبة تحته", fn: "حالة العمل في لمحة دون أرقام كثيرة." }
    ],
    wo: [
      { k: "wdetails", t: "بيانات أمر التشغيل", w: "Card", shape: "بطاقة بيضاء · المنتج والكمية والمنجز والموعد", fn: "القيم الأهم عريضة وتتحدث مع كل تسجيل." },
      { k: "wprogress", t: "التقدّم", w: "LinearProgressIndicator", shape: "8px · كحلي ← أخضر عند الاكتمال", fn: "يتحرك فور تسجيل كمية جديدة." },
      { k: "wstep", t: "عدّاد الكمية المنتجة", w: "Row(IconButton ×2)", shape: "أزرار 60×60 · الرقم 34px · الحد الأعلى المتبقي", fn: "اختيار الكمية بالضغط لا بالكتابة، ولا يتجاوز المتبقي." },
      { k: "wgo", t: "سجّل إنتاج / ابدأ", w: "FilledButton", shape: "أحمر 52px · النص يذكر الكمية: «سجّل 5 وحدات»", fn: "إجراء واحد بحسب الحالة: ابدأ التشغيل ← سجّل إنتاج ← اكتمل." }
    ],
    inv: [
      { k: "search", t: "حقل البحث", w: "SearchBar", shape: "كبسولة 48px · أيقونة بحث · نص 16px", fn: "بحث بالكود أو الاسم أثناء الكتابة. مسح الباركود يُضاف لاحقاً." },
      FILT,
      { k: "avail", t: "الكمية المتاحة", w: "Text + شرط", shape: "رقم 22px عريض · يتحول أحمر عند النزول تحت الحد الأدنى", fn: "تنبيه بصري هادئ ومعه شارة «منخفض»، فاللون وحده لا يكفي." },
      { k: "row", t: "صف صنف", w: "RecordCard", shape: "الاسم والكود · المقاسات · الكمية المتاحة في طرف الصف", fn: "تفتح ورقة تفاصيل الصنف." }
    ],
    "inv:item": [
      { k: "sheet", t: "تفاصيل الصنف", w: "showModalBottomSheet", shape: "ورقة سفلية · الأرقام الثلاثة الأهم في صفوف", fn: "تفاصيل دون ترك القائمة، وتُغلق بنقرة خارجها." },
      { k: "req", t: "اطلب إنتاج", w: "FilledButton", shape: "أحمر 52px · يظهر للمنخفض ولمن يملك الصلاحية", fn: "ينشئ أمر تشغيل في الانتظار ويعالج إشعار المخزون. معطّل دون إنترنت." },
      { k: "close", t: "إغلاق", w: "TextButton", shape: "نص كحلي · 48px", fn: "رجوع للقائمة." }
    ],
    notes: [
      { k: "readall", t: "قراءة الكل", w: "TextButton", shape: "نص كحلي 15px في شريط التطبيق", fn: "يعلّم كل الإشعارات مقروءة دفعة واحدة." },
      FILT,
      { k: "lv", t: "أيقونة المستوى", w: "CircleAvatar", shape: "دائرة 44px: أحمر عاجل · كحلي يحتاج إجراء · رمادي للعلم", fn: "المستوى يُعرف من اللون والأيقونة والنص معاً." },
      { k: "dot", t: "نقطة غير المقروء", w: "Badge", shape: "دائرة حمراء 10px في زاوية البطاقة", fn: "تختفي بنقر الإشعار. لا تُحتسب في عدّاد الجرس." },
      { k: "nact", t: "زر الإجراء", w: "FilledButton.tonal", shape: "كحلي 44px · فعل واحد داخل الإشعار", fn: "يفتح الشاشة المعنية، ويتحقق التطبيق من الصلاحية والحالة قبل أي تنفيذ." }
    ],
    nsettings: [
      { k: "sw-urgent", t: "مفتاح «عاجل» مقفل", w: "Switch (disabled)", shape: "مفتاح 56×32 مفعّل ومطفأ التفاعل", fn: "التنبيهات العاجلة لا يمكن إيقافها." },
      { k: "sw", t: "مفتاح كبير", w: "Switch", shape: "56×32 يسهل الضغط عليه بإبهام واحد · الفعّال كحلي", fn: "يحفظ التفضيل فوراً بلا زر «حفظ»." },
      { k: "quiet", t: "وقت الهدوء", w: "SwitchListTile", shape: "صف 64px بأيقونة وسطرين", fn: "غير مفعّل حتى تعتمد إدارة التشغيل الساعات (Open)." }
    ],
    more: [
      { k: "account", t: "بطاقة الحساب", w: "ListTile", shape: "صورة حرفية 52px · الاسم والبريد · شارة الدور", fn: "تعرّف المستخدم بدوره وصلاحياته." },
      { k: "mrow", t: "صف قائمة", w: "ListTile", shape: "أيقونة 40px في مربع فاتح · عنوان 16px عريض · سهم يتبع الاتجاه", fn: "الوحدات الأقل استخداماً داخل «المزيد»، وتظهر حسب الصلاحية." },
      { k: "lang", t: "مفتاح اللغة", w: "SegmentedButton", shape: "عربي / EN · الفعّال أبيض بظل خفيف", fn: "قلب كامل RTL ⇄ LTR والتطبيق كله يتبدّل الآن." },
      { k: "logout", t: "تسجيل الخروج", w: "OutlinedButton", shape: "ثانوي أبيض · أيقونة + نص · 52px", fn: "ثانوي عمداً كي لا يُضغط بالخطأ. يمسح الجلسة من الجهاز." }
    ],
    products: [
      { k: "pcard", t: "بطاقة منتج", w: "Card", shape: "بيضاء · العنوان والكود ثم الألوان والمقاسات ثم السعر", fn: "المعلومات التسويقية أولاً، والأرقام الداخلية في الأسفل." },
      { k: "swatch", t: "ألوان الكتالوج", w: "Row(CircleAvatar)", shape: "دوائر 22px بحد أبيض وظل رفيع · «+11» للباقي", fn: "الألوان الرسمية الـ 11 من الكتالوج." },
      { k: "tags", t: "المقاسات", w: "Chip", shape: "وسوم 26px بأرقام لاتينية", fn: "المقاسات الرسمية بدل بيانات العينة القديمة." },
      { k: "cost", t: "التكلفة (بصلاحية)", w: "Visibility(permission)", shape: "صف إضافي بلون خافت", fn: "تظهر لمن يملك صلاحية التكاليف فقط. غير ظاهرة لموظف المبيعات." }
    ],
    customers: [
      FILT,
      { k: "crow", t: "بطاقة عميل", w: "RecordCard", shape: "الاسم والنوع · الكود والمدينة · الرصيد", fn: "قراءة سريعة قبل المكالمة أو الزيارة." },
      { k: "bal", t: "الرصيد", w: "Text + صلاحية", shape: "رقم Poppins عريض كحلي", fn: "ذمم العميل مالية: تُخفى عمّن لا يملك صلاحية المالية." }
    ],
    finance: [
      { k: "fkpi", t: "مؤشر مالي", w: "StatCard", shape: "نفس بطاقة المؤشر · الرقم بالجنيه بأرقام منتظمة", fn: "نظرة سريعة، والتفاصيل على الويب." },
      { k: "frow", t: "فاتورة مستحقة", w: "RecordCard", shape: "الرقم والحالة · العميل والاستحقاق · المبلغ", fn: "«متأخرة» بالأحمر الداكن مع النص، لا باللون وحده." },
      { k: "fdis", t: "المالية دون اتصال", w: "EmptyState", shape: "درع داخل دائرة + سطر يشرح السبب", fn: "المالية معطّلة دون إنترنت (قرار معتمد)." }
    ],
    push: [
      { k: "push", t: "إشعار فوق الشاشة", w: "Heads-up notification", shape: "بطاقة بيضاء 20px · حد جانبي أحمر للعاجل · الشعار + الوقت", fn: "نقرة واحدة تفتح الشاشة المعنية مباشرة." },
      { k: "pgo", t: "زر الإجراء", w: "NotificationAction", shape: "كحلي 44px · فعل واحد: «فتح الطلب»", fn: "يفتح الطلب فقط؛ لا ينفّذ تأكيداً من نص الإشعار أبداً." },
      { k: "plater", t: "لاحقاً", w: "NotificationAction", shape: "ثانوي رمادي فاتح 44px", fn: "يؤجل دون حذف، ويبقى في مركز الإشعارات." }
    ]
  };

  /* ───────────────────────── shared UI pieces ───────────────────────── */
  function bell() {
    var c = bellCount();
    return '<button class="m-iconbtn" type="button" data-act="bell"' + a("bell") + ' aria-label="' + T("الإشعارات", "Notifications") + '">' + ic("bell") + (c ? '<span class="m-badge num">' + c + "</span>" : "") + "</button>";
  }
  function appbar(o) {
    var back = o.back ? '<button class="m-iconbtn" type="button" data-act="back"' + a("back") + ' aria-label="' + T("رجوع", "Back") + '">' + ic("chevron", S.lang === "en" ? "pr-flip" : "") + "</button>" : "";
    return '<div class="m-appbar">' + back + "<h1>" + o.title + "</h1>" + (o.right || "") + (o.bell ? bell() : "") + "</div>";
  }
  function offBanner() {
    return S.offline ? '<div class="m-banner is-offline"' + a("offline") + ' role="status">' + ic("wifioff") + "<span>" + T("لا يوجد اتصال بالإنترنت", "No internet connection") + '</span><button class="m-btn m-btn-text" type="button" data-act="retry-net">' + T("أعد المحاولة", "Retry") + "</button></div>" : "";
  }
  function nav() {
    var tabs = ["home"]; if (can("sales.view")) tabs.push("sales"); if (can("prod.view")) tabs.push("prod"); if (can("inv.view")) tabs.push("inv"); tabs.push("more");
    var meta = { home: ["home", "الرئيسية", "Home"], sales: ["cart", "المبيعات", "Sales"], prod: ["factory", "الإنتاج", "Production"], inv: ["warehouse", "المخزون", "Stock"], more: ["menu", "المزيد", "More"] };
    return '<nav class="m-nav"' + a("nav") + ' aria-label="' + T("التنقل", "Navigation") + '">' + tabs.map(function (t) {
      var m = meta[t];
      return '<a href="#try" data-act="tab" data-tab="' + t + '"' + (S.tab === t ? ' aria-current="page"' : "") + '><span class="m-pill">' + ic(m[0]) + "</span>" + T(m[1], m[2]) + "</a>";
    }).join("") + "</nav>";
  }
  function filters(key, defs, counts) {
    return '<div class="m-filters"' + a("filters") + ' role="group">' + defs.map(function (d) {
      var on = S.filt[key] === d[0];
      return '<button class="m-fchip" type="button" data-act="filt" data-k="' + key + '" data-v="' + d[0] + '" aria-pressed="' + on + '">' + T(d[1], d[2]) + (counts && counts[d[0]] != null ? ' <b class="num">' + counts[d[0]] + "</b>" : "") + "</button>";
    }).join("") + "</div>";
  }
  function stat(label, val, cls, ann) { return '<div class="m-stat ' + (cls || "") + '"' + (ann ? a(ann) : "") + "><small>" + label + "</small><b>" + val + "</b></div>"; }
  function skeleton() {
    var one = function (k) { return '<div class="m-skel"' + (k ? a("skel") : "") + '><div class="skeleton" style="width:40px;height:40px;border-radius:12px"></div><div style="flex:1;display:grid;gap:8px"><div class="skeleton" style="height:14px;width:60%"></div><div class="skeleton" style="height:12px;width:35%"></div></div><div class="skeleton" style="height:22px;width:54px"></div></div>'; };
    return one(1) + one() + one() + one();
  }
  function empty(icon, h, p, key) {
    return '<div class="m-empty"' + a(key || "empty") + '><div class="m-ico-lg">' + ic(icon) + "</div><h3>" + h + "</h3><p>" + p + "</p></div>";
  }
  function errState() {
    return '<div class="m-empty"' + a("err") + '><div class="m-ico-lg" style="background:var(--eg-red-tint);color:var(--eg-red-deep)">' + ic("alert") + "</div><h3>" + T("تعذّر التحميل", "Couldn't load") + "</h3><p>" + T("تحقق من الاتصال وحاول مرة أخرى. لم يضِع شيء.", "Check your connection and try again. Nothing was lost.") + '</p><button class="m-btn m-btn-ghost" type="button" data-act="retry-force">' + ic("refresh") + " " + T("أعد المحاولة", "Try again") + "</button></div>";
  }
  /* returns replacement HTML for a list when a forced state is active, else null */
  function forced(kind) {
    if (S.force === "loading") return skeleton();
    if (S.force === "empty") return kind || empty("clipboard", T("لا توجد بيانات", "Nothing here"), T("أي سجل جديد يظهر هنا.", "New records appear here."));
    if (S.force === "error") return errState();
    return null;
  }
  function orderCard(o, first) {
    var c = cus(o.c);
    return '<div class="m-rec" role="button" tabindex="0" data-act="open-order" data-id="' + o.id + '"' + (first ? a("rec") : "") + '><div class="m-rec-top"><b class="num">' + o.id + "</b>" +
      chip(o.st).replace('<span class="m-chip', '<span' + (first ? a("chip") : "") + ' class="m-chip') + '</div><div class="m-rec-foot"><span class="m-rec-sub">' + B(c.n) + '<br /><span class="num">' + o.d + "</span></span>" +
      (o.sync ? '<span class="m-sync">' + ic("refresh") + T("بانتظار المزامنة", "Waiting to sync") + "</span>" : price(total(o))) + "</div></div>";
  }
  function woCard(w, first) {
    var p = prd(w.sku), pct = Math.round(w.done / w.q * 100);
    return '<div class="m-rec" role="button" tabindex="0" data-act="open-wo" data-id="' + w.id + '"' + (first ? a("wo") : "") + '><div class="m-rec-top"><b class="num">' + w.id + "</b>" + chip(w.st) + '</div><div class="m-rec-sub">' + B(p.n) + " × <span class=\"num\">" + nf(w.q) + '</span></div><div class="m-progress ' + (pct >= 100 ? "is-done" : "") + '" style="--v:' + pct + '%"' + (first ? a("progress") : "") + '></div><div class="m-rec-foot"><span class="num">' + pct + "%</span><span class=\"m-rec-sub\">" + T("التسليم", "Due") + ' <span class="num">' + w.due + "</span></span></div></div>";
  }

  /* ───────────────────────── screens ───────────────────────── */
  var V = {};

  V.login = function () {
    var L = S.login, off = S.offline;
    return { bar: "none", bg: "#fff", h:
      '<div class="m-body" style="gap:14px;padding-top:12px;background:#fff">' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><img' + a("logo") + ' src="./assets/images/logo/wordmark-color.png" alt="' + T("المصرية الألمانية", "Egyptian-German") + '" style="height:34px;width:auto" /><div class="m-seg"' + a("lang") + ' role="group" aria-label="Language"><button type="button" data-act="lang" data-v="ar" aria-pressed="' + (S.lang === "ar") + '">عربي</button><button type="button" data-act="lang" data-v="en" aria-pressed="' + (S.lang === "en") + '">EN</button></div></div>' +
      '<div style="margin-top:14px"><h2 class="m-h1">' + T("تسجيل الدخول", "Sign in") + '</h2><p class="m-sub">' + T("المصرية الألمانية — مصنع جمصة", "Egyptian-German — Gamasa Plant") + "</p></div>" +
      (off ? '<div class="m-banner is-offline" style="border-radius:12px"' + a("offline") + ">" + ic("wifioff") + "<span>" + T("لا يوجد اتصال بالإنترنت", "No internet connection") + "</span></div>" : "") +
      '<div class="m-field"><label class="m-label" for="pr-email">' + T("البريد الإلكتروني", "Email") + '</label><div class="m-input"' + a("email") + ">" + ic("user") + '<input id="pr-email" data-in="email" type="email" dir="ltr" autocomplete="off" value="' + esc(L.email) + '" placeholder="name@egerman-upvc.com" style="text-align:start"' + (L.busy ? " disabled" : "") + " /></div></div>" +
      '<div class="m-field"><label class="m-label" for="pr-pw">' + T("كلمة المرور", "Password") + '</label><div class="m-input ' + (L.err ? "has-error" : "") + '"' + a("pass") + ">" + ic("lock") + '<input id="pr-pw" data-in="pw" type="' + (L.show ? "text" : "password") + '" dir="ltr" autocomplete="off" value="' + esc(L.pw) + '" placeholder="••••••••" style="text-align:start"' + (L.busy ? " disabled" : "") + ' /><button class="m-iconbtn" type="button" data-act="eye" aria-label="' + T("إظهار كلمة السر", "Show password") + '">' + ic(L.show ? "eyeoff" : "eye") + "</button></div>" +
      (L.err ? '<div class="m-error" role="alert"' + a("err-msg") + ">" + ic("alert") + "<span>" + L.err + "</span></div>" : "") + "</div>" +
      '<a class="m-link" href="#try" data-act="forgot"' + a("forgot") + ' style="align-self:flex-start">' + T("نسيت كلمة السر؟", "Forgot password?") + "</a>" +
      '<div class="m-sp"></div>' +
      '<button class="m-btn m-btn-accent ' + (L.busy ? "is-loading" : "") + '" type="button" data-act="login"' + a("go") + (L.busy ? ' aria-busy="true"' : "") + ">" + (L.busy ? T("جارٍ الدخول", "Signing in") : T("تسجيل الدخول", "Sign in")) + "</button>" +
      '<div' + a("help") + ' style="text-align:center;font-size:14px;color:var(--eg-muted)">' + T("محتاج مساعدة؟ اتصل ", "Need help? Call ") + '<b class="num" style="color:var(--eg-navy)">15536</b></div></div>' };
  };

  V.forgot = function () {
    return { bar: "none", bg: "#fff", h:
      appbar({ back: true, title: "" }) +
      '<div class="m-body" style="gap:16px;background:#fff;padding-top:8px;align-items:center;text-align:center">' +
      '<div' + a("ficon") + ' style="width:72px;height:72px;border-radius:50%;background:var(--eg-navy-tint);color:var(--eg-navy);display:grid;place-items:center">' + ic("shield", "icon-lg") + "</div>" +
      '<div><h2 class="m-h1" style="font-size:22px">' + T("استعد كلمة السر", "Reset your password") + '</h2><p class="m-sub" style="margin-top:8px">' + T("سنرسل لك رابط إعادة التعيين على بريدك، أو تواصل مع مدير النظام.", "We'll email you a reset link, or contact your system admin.") + "</p></div>" +
      '<div class="m-field" style="width:100%;text-align:start"><label class="m-label" for="pr-femail">' + T("البريد الإلكتروني", "Email") + '</label><div class="m-input is-focus"' + a("femail") + ">" + ic("user") + '<input id="pr-femail" type="email" dir="ltr" placeholder="name@egerman-upvc.com" style="text-align:start" /></div></div>' +
      '<div class="m-help" style="text-align:start">' + T("أو اطلب إعادة التعيين من مدير النظام: الخط الساخن ", "Or ask your admin to reset it: hotline ") + '<b class="num">15536</b></div>' +
      '<div class="m-sp"></div><button class="m-btn m-btn-accent" type="button" data-act="forgot-send"' + a("fsend") + ">" + T("أرسل رابط الاستعادة", "Send reset link") + '</button><button class="m-btn m-btn-text" type="button" data-act="back"' + a("fback") + ">" + T("رجوع لتسجيل الدخول", "Back to sign in") + "</button></div>" };
  };

  V.expired = function () {
    return { bar: "none", bg: "#fff", h: '<div class="m-body is-center" style="background:#fff"><div class="m-empty"><div class="m-ico-lg"' + a("xicon") + ">" + ic("clock") + "</div><h3>" + T("سجّل دخولك مرة أخرى", "Please sign in again") + "</h3><p>" + T("انتهت جلستك لأمانك. ما كتبته محفوظ على الجهاز.", "Your session ended for your security. What you typed is saved on this device.") + '</p><button class="m-btn m-btn-secondary" type="button" data-act="to-login"' + a("xbtn") + ">" + T("تسجيل الدخول", "Sign in") + "</button></div></div>" };
  };

  V.noperm = function () {
    return { bar: "none", h: appbar({ back: true, title: "" }) + '<div class="m-body is-center"><div class="m-empty"><div class="m-ico-lg"' + a("pnicon") + ">" + ic("shield") + "</div><h3>" + T("هذه الشاشة ليست من صلاحياتك", "This screen isn't in your role") + "</h3><p>" + T("اطلب من مدير النظام (Super Admin) إضافتها لدورك.", "Ask your system admin (Super Admin) to add it to your role.") + '</p><button class="m-btn m-btn-ghost" type="button" data-act="back"' + a("pnbtn") + ">" + T("رجوع", "Back") + "</button></div></div>" };
  };

  V.home = function () {
    var r = ROLES[S.role], os = S.orders, open = os.filter(function (o) { return o.st !== "shipped"; }).length;
    var month = os.reduce(function (s, o) { return s + total(o); }, 0);
    var inprod = S.wos.filter(function (w) { return w.st === "in_progress"; }).length;
    var queued = S.wos.filter(function (w) { return w.st === "queued"; }).length;
    var done = S.wos.filter(function (w) { return w.st === "done"; }).length;
    var lows = PRD.filter(low).length, recv = CUS.reduce(function (s, c) { return s + c.bal; }, 0);
    var lowCard = function (ann) { return stat(T("مخزون منخفض", "Low stock"), lows, lows ? "is-low" : "is-ok", ann); };
    var cards;
    if (S.role === "admin") cards = [stat(T("مبيعات الشهر", "Month sales"), price(month), "", "kpi"), stat(T("أوامر مفتوحة", "Open orders"), open), stat(T("تحت التشغيل", "In production"), inprod), lowCard(), stat(T("ذمم مدينة", "Receivables"), price(recv)), stat(T("نقدية", "Cash"), price(CASH), "is-ok")];
    else if (S.role === "sales") cards = [stat(T("مبيعات الشهر", "Month sales"), price(month), "", "kpi"), stat(T("أوامر مفتوحة", "Open orders"), open), stat(T("مسودات", "Drafts"), os.filter(function (o) { return o.st === "draft"; }).length), stat(T("عملاء", "Customers"), CUS.length)];
    else cards = [stat(T("تحت التشغيل", "In production"), inprod, "", "kpi"), stat(T("في الانتظار", "Queued"), queued), stat(T("مكتمل", "Done"), done, "is-ok"), lowCard()];
    var list, head, tab;
    if (S.role === "prod") { head = T("أوامر التشغيل", "Work orders"); tab = "prod"; list = S.wos.slice(0, 2).map(function (w, i) { return woCard(w, i === 0); }).join(""); }
    else { head = T("أحدث أوامر البيع", "Latest sales orders"); tab = "sales"; list = os.slice().sort(byIdDesc).slice(0, 2).map(function (o, i) { return orderCard(o, i === 0); }).join(""); }
    return { bar: "nav", dev: "is-brandbar", h:
      '<div class="m-appbar is-brand"><div class="m-avatar" style="background:rgba(255,255,255,.16)">' + B(r.init) + '</div><div class="m-hello"><small>' + T("صباح الخير", "Good morning") + "</small><b>" + B(r.n) + "</b></div>" + bell() + "</div>" +
      offBanner() +
      '<div class="m-body"><div class="m-plant">' + ic("factory") + T("مصنع جمصة — المنطقة الصناعية المرحلة الثالثة", "Gamasa Plant — Industrial Zone Phase 3") + '</div><div class="m-kpis">' + cards.join("") + "</div>" +
      '<div class="m-sec"><span>' + head + '</span><a href="#try" data-act="tab" data-tab="' + tab + '"' + a("seclink") + ">" + T("الكل", "All") + "</a></div>" + list + "</div>" + nav() };
  };
  function byIdDesc(x, y) { return x.id < y.id ? 1 : -1; }

  V.sales = function () {
    var f = S.filt.sales, all = S.orders.slice().sort(byIdDesc);
    var counts = { all: all.length }; STEPS.forEach(function (s) { counts[s] = all.filter(function (o) { return o.st === s; }).length; });
    var list = all.filter(function (o) { return f === "all" || o.st === f; });
    var body = forced();
    if (body === null) body = list.length ? list.map(function (o, i) { return orderCard(o, i === 0); }).join("") : empty("clipboard", T("لا توجد أوامر بهذه الحالة", "No orders in this status"), T("غيّر الفلتر لرؤية باقي الأوامر.", "Change the filter to see other orders."));
    return { bar: "nav", h:
      appbar({ title: T("المبيعات", "Sales"), bell: true }) + offBanner() +
      '<div class="m-body ' + (can("sales.create") ? "has-fab" : "") + '" style="gap:10px">' + filters("sales", [["all", "الكل", "All"], ["draft", "مسودة", "Draft"], ["confirmed", "مؤكد", "Confirmed"], ["production", "إنتاج", "Production"], ["shipped", "تم الشحن", "Shipped"]], counts) + body + "</div>" +
      (can("sales.create") ? '<button class="m-fab" type="button" data-act="new-order"' + a("fab") + ">" + ic("plus") + T("أمر جديد", "New order") + "</button>" : "") + nav() };
  };

  V.order = function () {
    var o = ord(S.params.id), c = cus(o.c), idx = STEPS.indexOf(o.st), bar = "none", actions = "", note = "";
    var off = S.offline ? " disabled" : "", offNote = S.offline ? '<div class="m-help" style="grid-column:1/-1;text-align:center;font-weight:600;color:var(--color-warning)">' + ic("wifioff") + " " + T("يحتاج اتصالاً", "Needs a connection") + "</div>" : "";
    if (o.st === "draft" && can("sales.approve")) { bar = "action"; actions = '<div class="m-actionbar is-2"><button class="m-btn m-btn-accent" type="button" data-act="ask-confirm"' + a("confirm") + off + ">" + ic("check") + T("أكّد الأمر", "Confirm order") + '</button><button class="m-btn m-btn-ghost" type="button" data-act="edit-order"' + a("edit") + ">" + T("تعديل", "Edit") + "</button>" + offNote + "</div>"; }
    else if (o.st === "confirmed" && can("sales.approve")) { bar = "action"; actions = '<div class="m-actionbar">' + '<button class="m-btn m-btn-accent" type="button" data-act="promote"' + a("promote") + off + ">" + ic("factory") + T("حوّل للإنتاج", "Send to production") + "</button>" + offNote + "</div>"; }
    else if (o.st === "draft") { bar = "action"; note = '<div class="m-lock-note"' + a("noappr") + ">" + ic("shield") + "<span>" + T("تأكيد الأمر من صلاحية المدير.", "Confirming is a manager permission.") + "</span></div>"; actions = '<div class="m-actionbar"><button class="m-btn m-btn-ghost" type="button" data-act="edit-order"' + a("edit") + ">" + T("تعديل", "Edit") + "</button></div>"; }
    var recheck = S.params.via === "push" && o.st !== "draft" ? '<div class="m-banner is-ok"' + a("recheck") + ' role="status">' + ic("check") + "<span>" + T("تم تأكيد هذا الأمر مسبقاً — لا إجراء مطلوب.", "This order is already confirmed — nothing to do.") + "</span></div>" : "";
    return { bar: bar, h:
      appbar({ back: true, title: '<span class="num">' + o.id + "</span>" }) + offBanner() + recheck +
      '<div class="m-body">' +
      '<div class="m-card"' + a("details") + '><div class="m-card-top">' + chip(o.st).replace('<span class="m-chip', '<span' + ' class="m-chip') + (o.sync ? '<span class="m-sync">' + ic("refresh") + T("بانتظار المزامنة", "Waiting to sync") + "</span>" : "") + '</div><dl class="m-kv"><dt>' + T("العميل", "Customer") + "</dt><dd>" + B(c.n) + "</dd><dt>" + T("التاريخ", "Date") + '</dt><dd class="num">' + o.d + "</dd><dt>" + T("الإجمالي", "Total") + "</dt><dd>" + price(total(o)) + "</dd></dl></div>" +
      '<div class="m-card"' + a("lines") + '><div class="m-label">' + T("البنود", "Items") + "</div><div>" + o.l.map(function (x) { var p = prd(x[0]); return '<div class="m-line"><span>' + B(p.n) + ' <small class="num">× ' + nf(x[1]) + "</small></span>" + price(p.price * x[1]) + "</div>"; }).join("") + "</div></div>" +
      '<div class="m-card"' + a("steps") + '><div class="m-label">' + T("مرحلة الأمر", "Order stage") + '</div><div class="m-steps">' + STEPS.map(function (s, i) { return '<div class="' + (i < idx ? "on" : i === idx ? "now" : "") + '"><i></i>' + T(ST[s][0], ST[s][1]) + "</div>"; }).join("") + "</div></div>" + note + "</div>" + actions };
  };

  V.neworder = function () {
    var N = S.no, p = prd(N.sku), prods = PRD.filter(function (x) { return x.price != null; });
    return { bar: "action", h:
      appbar({ back: true, title: T("أمر بيع جديد", "New sales order") }) + offBanner() +
      '<div class="m-body">' +
      '<div class="m-field"><div class="m-label">' + T("العميل", "Customer") + '</div><div class="m-filters"' + a("cus") + ">" + CUS.map(function (c) { return '<button class="m-fchip" type="button" data-act="no-cus" data-v="' + c.id + '" aria-pressed="' + (N.c === c.id) + '">' + B(c.s) + "</button>"; }).join("") + "</div></div>" +
      '<div class="m-field"' + a("prd") + '><div class="m-label">' + T("المنتج", "Product") + "</div>" + prods.map(function (x) { return '<button class="m-opt" type="button" data-act="no-prd" data-v="' + x.sku + '" aria-pressed="' + (N.sku === x.sku) + '" style="margin-bottom:8px"><span class="m-opt-t">' + B(x.n) + "<small class=\"num\">" + x.sku + "</small></span>" + price(x.price) + "</button>"; }).join("") + "</div>" +
      '<div class="m-field"><div class="m-label">' + T("الكمية", "Quantity") + '</div><div class="m-stepper"' + a("stepper") + '><button type="button" data-act="no-dec" aria-label="' + T("أنقص", "Decrease") + '">' + ic("minus") + "</button><output>" + N.qty + "<small>" + B(p.u) + '</small></output><button type="button" class="is-plus" data-act="no-inc" aria-label="' + T("زد", "Increase") + '">' + ic("plus") + "</button></div></div>" +
      '<div class="m-card" style="background:var(--eg-navy-tint);border-color:transparent"' + a("tot") + '><div class="m-card-top" style="align-items:center"><span class="m-label">' + T("الإجمالي", "Total") + '</span><span class="m-price" style="font-size:24px">' + (S.lang === "ar" ? nf(p.price * N.qty) + "<em>ج.م</em>" : "<em style=\"margin:0 4px 0 0\">EGP</em>" + nf(p.price * N.qty)) + "</span></div></div></div>" +
      '<div class="m-actionbar"><button class="m-btn m-btn-accent" type="button" data-act="save-order"' + a("save") + ">" + ic("check") + T("احفظ كمسودة", "Save as draft") + "</button>" + (S.offline ? '<div class="m-help" style="text-align:center">' + T("ستُحفظ على الجهاز وتُزامَن عند عودة الاتصال.", "Saved on this device and synced when you're back online.") + "</div>" : "") + "</div>" };
  };

  V.prod = function () {
    var f = S.filt.prod, counts = { all: S.wos.length, in_progress: 0, queued: 0, done: 0 }; S.wos.forEach(function (w) { counts[w.st]++; });
    var list = S.wos.filter(function (w) { return f === "all" || w.st === f; });
    var body = forced();
    if (body === null) body = list.length ? list.map(function (w, i) { return woCard(w, i === 0); }).join("") : empty("clipboard", T("لا توجد أوامر تشغيل", "No work orders"), T("أي أمر جديد يظهر هنا.", "New orders appear here."));
    return { bar: "nav", h: appbar({ title: T("الإنتاج", "Production"), bell: true }) + offBanner() + '<div class="m-body" style="gap:10px">' + filters("prod", [["all", "الكل", "All"], ["in_progress", "جارٍ", "In progress"], ["queued", "في الانتظار", "Queued"], ["done", "مكتمل", "Done"]], counts) + body + "</div>" + nav() };
  };

  V.wo = function () {
    var w = wo(S.params.id), p = prd(w.sku), pct = Math.round(w.done / w.q * 100), rem = w.q - w.done, canUp = can("prod.update"), bar = "none", extra = "", act = "";
    if (canUp && w.st === "queued") { bar = "action"; act = '<div class="m-actionbar"><button class="m-btn m-btn-accent" type="button" data-act="wo-start"' + a("wgo") + ">" + ic("factory") + T("ابدأ التشغيل", "Start production") + "</button></div>"; }
    if (canUp && w.st === "in_progress") {
      bar = "action"; var n = Math.min(S.log, rem);
      extra = '<div class="m-card"><div class="m-label">' + T("الكمية المنتجة الآن", "Quantity produced now") + '</div><div class="m-stepper"' + a("wstep") + '><button type="button" data-act="log-dec" aria-label="' + T("أنقص", "Decrease") + '">' + ic("minus") + "</button><output>" + n + "<small>" + T("المتبقي ", "Left ") + nf(rem) + '</small></output><button type="button" class="is-plus" data-act="log-inc" aria-label="' + T("زد", "Increase") + '">' + ic("plus") + "</button></div></div>";
      act = '<div class="m-actionbar"><button class="m-btn m-btn-accent" type="button" data-act="wo-log"' + a("wgo") + ">" + ic("check") + T("سجّل " + n + " " + B(p.u), "Log " + n + " " + B(p.u)) + "</button></div>";
    }
    return { bar: bar, h:
      appbar({ back: true, title: '<span class="num">' + w.id + "</span>" }) + offBanner() +
      '<div class="m-body"><div class="m-card"' + a("wdetails") + '><div class="m-card-top">' + chip(w.st) + '</div><dl class="m-kv"><dt>' + T("المنتج", "Product") + "</dt><dd>" + B(p.n) + "</dd><dt>" + T("الكمية", "Quantity") + '</dt><dd class="num">' + nf(w.q) + "</dd><dt>" + T("المنجز", "Done") + '</dt><dd class="num">' + nf(w.done) + "</dd><dt>" + T("التسليم", "Due") + '</dt><dd class="num">' + w.due + "</dd></dl></div>" +
      '<div class="m-card"><div class="m-label">' + T("التقدّم", "Progress") + '</div><div class="m-progress ' + (pct >= 100 ? "is-done" : "") + '" style="--v:' + pct + '%"' + a("wprogress") + '></div><div class="num" style="font-weight:700;color:var(--eg-navy)">' + pct + "%</div></div>" + extra + "</div>" + act };
  };

  V.inv = function () {
    var f = S.filt.inv, q = S.q.toLowerCase(), counts = { all: PRD.length, low: PRD.filter(low).length };
    var list = PRD.filter(function (p) { return (f === "all" || low(p)) && (!q || (p.sku + " " + p.n[0] + " " + p.n[1]).toLowerCase().indexOf(q) > -1); });
    var body = forced();
    if (body === null) body = list.length ? list.map(function (p, i) {
      return '<div class="m-rec" role="button" tabindex="0" data-act="open-item" data-sku="' + p.sku + '"' + (i === 0 ? a("row") : "") + '><div class="m-inv"><div><div class="m-rec-top" style="justify-content:flex-start;gap:8px"><b>' + B(p.n) + "</b>" + (low(p) ? '<span class="m-chip is-bad">' + T("منخفض", "Low") + "</span>" : "") + '</div><div class="m-rec-sub"><span class="num">' + p.sku + "</span></div></div>" +
        '<div class="m-avail ' + (low(p) ? "is-low" : "") + '"' + (i === 0 ? a("avail") : "") + '><b class="num">' + nf(p.av) + "</b><small>" + T("متاح", "avail.") + "</small></div></div></div>";
    }).join("") : empty("search", T("لا نتائج", "No results"), T("جرّب كوداً أو اسماً آخر.", "Try a different code or name."));
    return { bar: "nav", h: appbar({ title: T("المخزون", "Stock"), bell: true }) + offBanner() + '<div class="m-body" style="gap:10px"><label class="m-search"' + a("search") + ">" + ic("search") + '<input id="pr-q" data-in="q" type="search" value="' + esc(S.q) + '" placeholder="' + T("بحث بالكود أو الاسم", "Search by code or name") + '" style="flex:1;min-width:0;border:0;outline:0;background:none;font:inherit;color:var(--eg-ink)" /></label>' + filters("inv", [["all", "الكل", "All"], ["low", "منخفض", "Low"]], counts) + body + "</div>" + nav() };
  };

  V.notes = function () {
    var f = S.filt.notes, mine = myNotes();
    var list = mine.filter(function (n) { return f === "all" || (f === "action" ? (n.lv !== "info" && !n.resolved) : n.lv === "info"); });
    var counts = { all: mine.length, action: mine.filter(function (n) { return n.lv !== "info" && !n.resolved; }).length };
    var body = forced();
    if (body === null) body = list.length ? '<div class="m-ngroup">' + T("اليوم", "Today") + "</div>" + list.map(function (n, i) {
      var go = n.btn && !n.resolved && n.lv !== "info";
      return '<div class="m-note ' + (n.unread ? "is-unread" : "") + '" data-act="read-note" data-id="' + n.id + '"><span class="m-lv is-' + n.lv + '"' + (i === 0 ? a("lv") : "") + ">" + ic(n.lv === "urgent" ? "bolt" : n.lv === "action" ? "bell" : "check") + "</span><b>" + B(n.t) + "</b><p>" + B(n.b) + "</p><time>" + B(n.ago) + "</time>" + (n.unread ? '<span class="m-dot"' + (i === 0 ? a("dot") : "") + "></span>" : "") +
        (go ? '<div class="m-card-actions"><button class="m-btn m-btn-sm m-btn-primary" type="button" data-act="note-go" data-id="' + n.id + '"' + (i === 0 ? a("nact") : "") + ">" + B(n.btn) + "</button></div>" : (n.lv !== "info" && n.resolved ? '<div class="m-card-actions"><span class="m-chip is-ok">' + T("تمت المعالجة", "Handled") + "</span></div>" : "")) + "</div>";
    }).join("") : empty("bell", T("لا توجد إشعارات", "No notifications"), T("كل شيء تحت السيطرة.", "You're all caught up."));
    return { bar: "nav", h: appbar({ title: T("الإشعارات", "Notifications"), right: '<button class="m-btn m-btn-text m-btn-sm" type="button" data-act="read-all"' + a("readall") + ' style="width:auto;font-size:15px">' + T("قراءة الكل", "Mark all read") + "</button>" }) + offBanner() +
      '<div class="m-body" style="gap:10px">' + filters("notes", [["all", "الكل", "All"], ["action", "يحتاج إجراء", "Needs action"], ["info", "للعلم", "FYI"]], counts) + body + "</div>" + nav() };
  };

  V.nsettings = function () {
    function sw(k, on, dis, ann) { return '<label class="m-switch"' + (ann ? a(ann) : "") + '><input type="checkbox" data-ns="' + k + '"' + (on ? " checked" : "") + (dis ? " disabled" : "") + ' aria-label="' + k + '" /><span></span></label>'; }
    return { bar: "nav", h: appbar({ back: true, title: T("إعدادات الإشعارات", "Notification settings") }) + offBanner() +
      '<div class="m-body"><div class="m-list"><div class="m-row"><span class="m-ico" style="background:var(--eg-red-tint);color:var(--eg-red-deep)">' + ic("bolt") + '</span><span class="m-txt"><b>' + T("عاجل", "Urgent") + "</b><small>" + T("لا يمكن إيقافه", "Cannot be turned off") + "</small></span>" + sw("urgent", true, true, "sw-urgent") + "</div>" +
      '<div class="m-row"><span class="m-ico">' + ic("bell") + '</span><span class="m-txt"><b>' + T("يحتاج إجراء", "Needs action") + "</b><small>" + T("صوت واهتزاز", "Sound & vibration") + "</small></span>" + sw("action", S.ns.action, false, "sw") + "</div>" +
      '<div class="m-row"><span class="m-ico" style="background:var(--color-neutral-tint);color:var(--color-neutral)">' + ic("info") + '</span><span class="m-txt"><b>' + T("للعلم", "FYI") + "</b><small>" + T("صامت في المركز فقط", "Silent, in the center only") + "</small></span>" + sw("info", S.ns.info) + "</div></div>" +
      '<div class="m-sec"><span>' + T("خارج ساعات العمل", "Outside work hours") + '</span></div><div class="m-list"' + a("quiet") + '><div class="m-row"><span class="m-ico">' + ic("clock") + '</span><span class="m-txt"><b>' + T("وقت الهدوء", "Quiet hours") + "</b><small>" + T("غير مفعّل · بانتظار اعتماد التشغيل", "Off · awaiting operations approval") + "</small></span>" + sw("quiet", S.ns.quiet) + "</div></div>" +
      '<div class="m-help" style="padding-inline:4px">' + T("ساعات الهدوء والمستلمون والأحداث غير مفعّلة حتى اعتماد التشغيل (Open).", "Quiet hours, recipients and events stay off until operations approve (Open).") + "</div></div>" + nav() };
  };

  V.more = function () {
    var r = ROLES[S.role];
    function row(act, icon, t) { return '<a class="m-row" href="#try" data-act="' + act + '"><span class="m-ico">' + ic(icon) + '</span><span class="m-txt"><b>' + t + "</b></span>" + ic("chevron", "icon-chev") + "</a>"; }
    return { bar: "nav", h: appbar({ title: T("المزيد", "More"), bell: true }) + offBanner() +
      '<div class="m-body"><div class="m-account"' + a("account") + '><div class="m-avatar">' + B(r.init) + "</div><div><b>" + B(r.n) + "</b><small>" + r.email + '</small></div><span class="m-chip is-info" style="margin-inline-start:auto">' + r.tag + "</span></div>" +
      '<div class="m-list"' + a("mrow") + ">" + row("go-products", "box", T("المنتجات", "Products")) + (can("cus.view") ? row("go-customers", "users", T("العملاء", "Customers")) : "") + (can("fin.view") ? row("go-finance", "coins", T("المالية", "Finance")) : "") + row("go-nsettings", "bell", T("إعدادات الإشعارات", "Notification settings")) + "</div>" +
      '<div class="m-list"><div class="m-row"><span class="m-ico">' + ic("globe") + '</span><span class="m-txt"><b>' + T("اللغة", "Language") + '</b></span><div class="m-seg"' + a("lang") + '><button type="button" data-act="lang" data-v="ar" aria-pressed="' + (S.lang === "ar") + '">عربي</button><button type="button" data-act="lang" data-v="en" aria-pressed="' + (S.lang === "en") + '">EN</button></div></div>' +
      '<div class="m-row"><span class="m-ico">' + ic("phone") + '</span><span class="m-txt"><b>' + T("الخط الساخن", "Hotline") + '</b><small class="num" dir="ltr" style="display:block;text-align:start">15536</small></span></div></div>' +
      '<button class="m-btn m-btn-ghost" type="button" data-act="logout"' + a("logout") + ">" + ic("logout") + T("تسجيل الخروج", "Sign out") + "</button></div>" + nav() };
  };

  V.products = function () {
    var body = forced();
    if (body === null) body = PRD.map(function (p, i) {
      return '<div class="m-card"' + (i === 0 ? a("pcard") : "") + '><div class="m-card-top"><div><h3 class="m-card-title">' + B(p.n) + '</h3><span class="m-rec-sub num">' + p.sku + "</span></div></div>" +
        (p.fin.length ? '<div class="m-dots-fin"' + (i === 0 ? a("swatch") : "") + ">" + p.fin.map(function (c) { return '<i style="--c:' + c + '"></i>'; }).join("") + '<small>+11</small></div>' : "") +
        '<div style="display:flex;gap:6px;flex-wrap:wrap"' + (i === 0 ? a("tags") : "") + ">" + p.sz.map(function (s) { return '<span class="m-tag">' + s + (p.szu ? " " + B(p.szu) : "") + "</span>"; }).join("") + "</div>" +
        '<div class="m-rec-foot"><span class="m-rec-sub">' + T("السعر", "Price") + "</span>" + (p.price != null ? price(p.price) : '<span class="m-rec-sub">' + T("عبر المبيعات", "Via sales") + "</span>") + "</div>" +
        (can("cost.view") && p.cost != null ? '<div class="m-rec-foot" style="color:var(--eg-muted)"' + (i === 0 ? a("cost") : "") + "><span>" + T("التكلفة", "Cost") + "</span>" + price(p.cost) + "</div>" : "") + "</div>";
    }).join("");
    return { bar: "nav", h: appbar({ back: true, title: T("المنتجات", "Products") }) + offBanner() + '<div class="m-body">' + body + "</div>" + nav() };
  };

  V.customers = function () {
    var f = S.filt.cus, counts = { all: CUS.length, dealer: 0, contractor: 0, retail: 0 }; CUS.forEach(function (c) { counts[c.t]++; });
    var list = CUS.filter(function (c) { return f === "all" || c.t === f; }), body = forced();
    if (body === null) body = list.map(function (c, i) {
      return '<div class="m-rec"' + (i === 0 ? a("crow") : "") + '><div class="m-rec-top"><b>' + B(c.n) + '</b><span class="m-chip ' + (c.t === "dealer" ? "is-info" : "") + '">' + B(CT[c.t]) + '</span></div><div class="m-rec-foot"><span class="m-rec-sub"><span class="num">' + c.id + "</span> · " + B(c.c) + "</span>" + (can("fin.view") ? '<span' + (i === 0 ? a("bal") : "") + ">" + price(c.bal) + "</span>" : "") + "</div></div>";
    }).join("");
    return { bar: "nav", h: appbar({ back: true, title: T("العملاء", "Customers") }) + offBanner() + '<div class="m-body" style="gap:10px">' + filters("cus", [["all", "الكل", "All"], ["dealer", "موزع", "Dealer"], ["contractor", "مقاول", "Contractor"], ["retail", "تجزئة", "Retail"]], counts) + body + "</div>" + nav() };
  };

  V.finance = function () {
    var recv = CUS.reduce(function (s, c) { return s + c.bal; }, 0), body;
    if (S.offline) body = '<div class="m-empty"' + a("fdis") + '><div class="m-ico-lg">' + ic("shield") + "</div><h3>" + T("المالية تحتاج اتصالاً", "Finance needs a connection") + "</h3><p>" + T("لا تتوفر الأرقام المالية دون إنترنت حمايةً لها.", "Financial figures aren't available offline, to protect them.") + "</p></div>";
    else body = '<div class="m-kpis">' + stat(T("ذمم مدينة", "Receivables"), price(recv), "", "fkpi") + stat(T("نقدية", "Cash"), price(CASH), "is-ok") + "</div>" + '<div class="m-sec"><span>' + T("فواتير مستحقة", "Invoices due") + "</span></div>" +
      INV.map(function (v, i) { return '<div class="m-rec"' + (i === 0 ? a("frow") : "") + '><div class="m-rec-top"><b class="num">' + v.id + '</b><span class="m-chip ' + (v.late ? "is-bad" : "is-warn") + '">' + (v.late ? T("متأخرة", "Overdue") : T("مستحقة", "Due")) + '</span></div><div class="m-rec-foot"><span class="m-rec-sub">' + B(cus(v.c).s) + '<br /><span class="num">' + v.due + "</span></span>" + price(v.amt) + "</div></div>"; }).join("");
    return { bar: "nav", h: appbar({ back: true, title: T("المالية", "Finance") }) + offBanner() + '<div class="m-body">' + body + "</div>" + nav() };
  };

  /* ───────────────────────── overlays (sheet / push / toast) ───────────────────────── */
  function sheetHtml() {
    var sh = S.sheet; if (!sh) return "";
    if (sh.k === "confirm") {
      var o = ord(sh.id), off = S.offline;
      return '<div class="m-scrim" data-act="close-sheet"></div><div class="m-sheet" role="dialog" aria-label="' + T("تأكيد الأمر", "Confirm order") + '"' + a("sheet") + '><div class="m-ico-lg is-info">' + ic("check") + "</div><div><h2 class=\"m-h2\">" + T("تأكيد الأمر ", "Confirm order ") + '<span class="num">' + o.id + "</span>" + T("؟", "?") + '</h2><p class="m-sub" style="margin-top:4px">' + T("ستتغيّر حالته من «مسودة» إلى «مؤكد».", "Its status changes from “Draft” to “Confirmed”.") + "</p></div>" +
        '<button class="m-btn m-btn-accent" type="button" data-act="do-confirm"' + a("yes") + (off ? " disabled" : "") + ">" + T("أكّد", "Confirm") + "</button>" + (off ? '<div class="m-help" style="text-align:center;font-weight:600;color:var(--color-warning)">' + T("يحتاج اتصالاً", "Needs a connection") + "</div>" : "") +
        '<button class="m-btn m-btn-text" type="button" data-act="close-sheet"' + a("cancel") + ">" + T("إلغاء", "Cancel") + "</button></div>";
    }
    var p = prd(sh.sku), req = can("inv.request") && low(p), off2 = S.offline ? " disabled" : "";
    return '<div class="m-scrim" data-act="close-sheet"></div><div class="m-sheet" role="dialog" aria-label="' + B(p.n) + '"' + a("sheet") + '><div style="display:flex;align-items:center;gap:10px"><h2 class="m-h2" style="flex:1">' + B(p.n) + "</h2>" + (low(p) ? '<span class="m-chip is-bad">' + T("منخفض", "Low") + "</span>" : '<span class="m-chip is-ok">' + T("كافٍ", "OK") + "</span>") + '</div><dl class="m-kv"><dt>' + T("الكود", "Code") + '</dt><dd class="num">' + p.sku + "</dd><dt>" + T("المتاح", "Available") + '</dt><dd class="num" style="color:' + (low(p) ? "var(--eg-red-deep)" : "inherit") + '">' + nf(p.av) + "</dd><dt>" + T("تحت التشغيل", "In production") + '</dt><dd class="num">' + nf(p.wip) + "</dd><dt>" + T("الحد الأدنى", "Minimum") + '</dt><dd class="num">' + nf(p.min) + "</dd></dl>" +
      (req ? '<button class="m-btn m-btn-accent" type="button" data-act="req-prod"' + a("req") + off2 + ">" + ic("factory") + T("اطلب إنتاج", "Request production") + "</button>" + (S.offline ? '<div class="m-help" style="text-align:center;font-weight:600;color:var(--color-warning)">' + T("يحتاج اتصالاً", "Needs a connection") + "</div>" : "") : "") +
      '<button class="m-btn ' + (req ? "m-btn-text" : "m-btn-ghost") + '" type="button" data-act="close-sheet"' + a("close") + ">" + T("إغلاق", "Close") + "</button></div>";
  }
  function pushHtml() {
    var n = S.push; if (!n) return "";
    return '<div class="pr-push is-' + n.lv + '" role="alert" tabindex="0" data-act="push-open"' + a("push") + '><div class="m-push-head"><img src="./assets/images/logo/mark.png" alt="" /><b>' + T("المصرية الألمانية", "Egyptian-German") + "</b><time>" + T("الآن", "now") + '</time></div><h4 class="m-push-title">' + B(n.t) + '</h4><p class="m-push-body">' + B(n.b) + "</p>" +
      (n.btn ? '<div class="m-push-actions"><button class="is-primary" type="button" data-act="push-open"' + a("pgo") + ">" + B(n.btn) + '</button><button type="button" data-act="push-close"' + a("plater") + ">" + T("لاحقاً", "Later") + "</button></div>" : "") + "</div>";
  }

  var toastTimer;
  function toast(kind, msg, act, fn) {
    var host = $("#pr-toasts"); if (!host) return; host.innerHTML = "";
    var t = document.createElement("div"); t.className = "m-toast is-" + kind; t.setAttribute("role", "status");
    t.style.insetBlockEnd = (cur.bar === "action" ? 92 : cur.bar === "nav" ? 76 : 16) + "px";
    t.innerHTML = ic(kind === "ok" ? "check" : kind === "bad" ? "alert" : "info") + "<span>" + msg + "</span>" + (act ? '<button class="m-act" type="button">' + act + "</button>" : "");
    host.appendChild(t); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 4200);
    var b = $(".m-act", t); if (b) b.addEventListener("click", function () { clearTimeout(toastTimer); t.remove(); if (fn) fn(); });
  }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

  /* ───────────────────────── render ───────────────────────── */
  var cur = { bar: "none" }, lastRoute = null;
  var dev = $("#pr-dev"), scr = $("#pr-scr"), viewHost = $("#pr-view");

  function render() {
    var focusId = document.activeElement && document.activeElement.id, ss, se;
    if (focusId && document.activeElement.setSelectionRange) { try { ss = document.activeElement.selectionStart; se = document.activeElement.selectionEnd; } catch (e) {} }
    var oldBody = $(".m-body", viewHost), keep = oldBody && lastRoute === S.route ? oldBody.scrollTop : 0;
    var r = V[S.route](); cur = r;
    dev.setAttribute("dir", S.lang === "ar" ? "rtl" : "ltr"); dev.setAttribute("lang", S.lang);
    dev.className = "m-device " + (r.dev || ""); scr.style.background = r.bg || ""; scr.setAttribute("data-bar", r.bar || "none");
    var v = document.createElement("div"); v.className = "pr-view" + (lastRoute === S.route ? " is-still" : ""); v.innerHTML = r.h;
    viewHost.replaceWith(v); viewHost = v; v.id = "pr-view";
    $("#pr-sheet").innerHTML = sheetHtml(); $("#pr-pushhost").innerHTML = pushHtml();
    var nb = $(".m-body", v); if (nb && keep) nb.scrollTop = keep;
    lastRoute = S.route;
    if (focusId) { var f = document.getElementById(focusId); if (f && !f.disabled) { f.focus(); if (ss != null && f.setSelectionRange) { try { f.setSelectionRange(ss, se); } catch (e) {} } } }
    syncControls(); buildAnn(); placeAnn();
    clearTimeout(settle); settle = setTimeout(schedule, 420); /* after sheet / push / view animations settle */
  }
  var settle;

  /* ───────────────────────── navigation ───────────────────────── */
  function go(r, p, o) {
    o = o || {};
    if (NEED[r] && !can(NEED[r])) { p = { denied: r }; r = "noperm"; }
    if (o.reset) S.stack = []; else if (!o.replace && S.route !== "login") S.stack.push({ r: S.route, p: S.params });
    S.route = r; S.params = p || {}; S.sheet = null;
    if (TAB[r]) S.tab = TAB[r];
    if (r === "inv" && p && p.open) { S.sheet = { k: "item", sku: p.open }; }
    render();
  }
  function back() {
    var prev = S.stack.pop(); if (prev) { S.route = prev.r; S.params = prev.p; S.sheet = null; render(); }
    else if (!S.role) { S.route = "login"; S.params = {}; render(); }
    else go(S.tab === "more" ? "more" : S.tab, {}, { reset: true });
  }
  function target(g, via) {
    if (g.r === "order") go("order", { id: g.id, via: via }, {});
    else if (g.r === "inv") go("inv", { open: g.sku }, {});
    else if (g.r === "finance") go("finance", {}, {});
  }
  function signIn(role, quiet) {
    S.role = role; S.stack = []; S.tab = "home"; S.login.err = ""; S.login.busy = false; S.login.pw = "";
    if (S.pending) { var g = S.pending; S.pending = null; S.route = "home"; S.params = {}; render(); target(g, "push"); if (!quiet) toast("ok", T("أهلاً " + B(ROLES[role].n), "Welcome " + B(ROLES[role].n))); return; }
    S.route = "home"; S.params = {}; S.sheet = null; render();
    if (!quiet) toast("ok", T("دخلت كـ" + B(ROLES[role].n), "Signed in as " + B(ROLES[role].n)));
  }
  function ensureAccess() {
    if (S.role && NEED[S.route] && !can(NEED[S.route])) { go("home", {}, { reset: true }); }
    else if (S.role && S.route !== "login") render();
  }

  /* ───────────────────────── actions ───────────────────────── */
  var A = {};
  A.tab = function (el) { go(el.dataset.tab, {}, { reset: true }); };
  A.back = back;
  A.bell = function () { go("notes"); };
  A.lang = function (el) { S.lang = el.dataset.v; render(); };
  A.eye = function () { S.login.show = !S.login.show; render(); };
  A.forgot = function () { go("forgot"); };
  A["forgot-send"] = function () { toast("ok", T("إن كان البريد مسجّلاً سيصلك الرابط", "If the email is registered, you'll get the link")); S.stack = []; S.route = "login"; render(); };
  A["to-login"] = function () { S.route = "login"; S.stack = []; render(); };
  A.login = function () {
    var L = S.login; if (L.busy) return;
    if (S.offline) { L.err = T("تحتاج اتصالاً لتسجيل الدخول لأول مرة.", "You need a connection for the first sign-in."); render(); return; }
    if (!L.email.trim()) { L.err = T("اكتب البريد الإلكتروني.", "Enter your email."); render(); return; }
    if (!L.pw) { L.err = T("اكتب كلمة المرور.", "Enter your password."); render(); return; }
    L.err = ""; L.busy = true; render();
    setTimeout(function () {
      var hit = LOGINS[L.email.trim().toLowerCase()];
      L.busy = false;
      if (hit && hit[0] === L.pw) signIn(hit[1]);
      else { L.err = T("البريد أو كلمة المرور غير صحيحة. تأكد منهما أو اضغط «نسيت كلمة السر».", "Wrong email or password. Check them or tap “Forgot password?”."); render(); }
    }, 750);
  };
  A.logout = function () { S.role = null; S.stack = []; S.route = "login"; S.params = {}; S.login.pw = ""; S.sheet = null; S.push = null; render(); toast("info", T("تم تسجيل الخروج", "Signed out")); };
  A.filt = function (el) { S.filt[el.dataset.k] = el.dataset.v; render(); };
  A["retry-net"] = function () { toast("info", T("ما زال لا يوجد اتصال", "Still no connection")); };
  A["retry-force"] = function () { S.force = "loading"; render(); setTimeout(function () { S.force = "normal"; render(); }, 800); };
  A["open-order"] = function (el) { go("order", { id: el.dataset.id }); };
  A["new-order"] = function () { S.no = { c: "CUS-001", sku: "DOOR-D134", qty: 1 }; go("neworder"); };
  A["no-cus"] = function (el) { S.no.c = el.dataset.v; render(); };
  A["no-prd"] = function (el) { S.no.sku = el.dataset.v; render(); };
  A["no-inc"] = function () { S.no.qty = Math.min(99, S.no.qty + 1); render(); };
  A["no-dec"] = function () { S.no.qty = Math.max(1, S.no.qty - 1); render(); };
  A["save-order"] = function () {
    var id = "SO-2025-0" + S.seq.so++, o = { id: id, st: "draft", c: S.no.c, d: "2025-11-03", l: [[S.no.sku, S.no.qty]], sync: S.offline };
    S.orders.push(o);
    if (!S.offline) addNote(o);
    S.filt.sales = "all"; S.stack = []; S.route = "sales"; S.tab = "sales"; render();
    toast("ok", S.offline ? T("حُفظت المسودة على الجهاز · ستُزامَن لاحقاً", "Draft saved on this device · will sync later") : T("حُفظت المسودة " + id, "Draft " + id + " saved"));
  };
  function addNote(o) {
    S.notes.unshift({ id: "n" + S.seq.n++, lv: "action", t: [o.id + " بانتظار تأكيدك", o.id + " awaits your approval"], b: [B2(cus(o.c).n, 0) + " · " + nf(total(o)) + " ج.م", B2(cus(o.c).n, 1) + " · EGP " + nf(total(o))], ago: ["الآن", "now"], unread: true, resolved: false, roles: ["admin"], go: { r: "order", id: o.id }, btn: ["فتح الطلب", "Open order"] });
  }
  function B2(p, i) { return p[i]; }
  function woId() { var n = S.seq.wo++; return "WO-2025-" + (n < 100 ? "00" : "0") + n; }
  A["edit-order"] = function () { toast("info", T("نموذج التعديل خارج نطاق هذه التجربة", "The edit form is outside this prototype")); };
  A["ask-confirm"] = function () { S.sheet = { k: "confirm", id: S.params.id }; render(); };
  A["close-sheet"] = function () { S.sheet = null; render(); };
  A["do-confirm"] = function () {
    var o = ord(S.sheet.id); o.st = "confirmed"; S.sheet = null;
    S.notes.forEach(function (n) { if (n.go && n.go.id === o.id && n.lv === "action") { n.resolved = true; n.unread = false; } });
    render();
    toast("ok", T("تم تأكيد الأمر", "Order confirmed"), T("تراجع", "Undo"), function () { o.st = "draft"; S.notes.forEach(function (n) { if (n.go && n.go.id === o.id && n.lv === "action") n.resolved = false; }); render(); });
  };
  A.promote = function () {
    var o = ord(S.params.id); o.st = "production";
    var l = o.l[0], w = { id: woId(), st: "queued", sku: l[0], q: l[1], done: 0, due: "2025-11-12" }; S.wos.push(w);
    render(); toast("ok", T("أُنشئ أمر التشغيل " + w.id, "Work order " + w.id + " created"));
  };
  A["open-wo"] = function (el) { S.log = 5; go("wo", { id: el.dataset.id }); };
  A["log-inc"] = function () { var w = wo(S.params.id); S.log = Math.min(w.q - w.done, S.log + 1); render(); };
  A["log-dec"] = function () { S.log = Math.max(1, S.log - 1); render(); };
  A["wo-start"] = function () { var w = wo(S.params.id); w.st = "in_progress"; S.log = 5; render(); toast("ok", T("بدأ التشغيل", "Production started")); };
  A["wo-log"] = function () {
    var w = wo(S.params.id), n = Math.min(S.log, w.q - w.done); w.done += n;
    if (w.done >= w.q) { w.st = "done"; render(); toast("ok", T("اكتمل أمر التشغيل", "Work order complete")); }
    else { S.log = Math.min(S.log, w.q - w.done); render(); toast("ok", T("سُجّل " + n + " " + B(prd(w.sku).u), n + " " + B(prd(w.sku).u) + " logged")); }
  };
  A["open-item"] = function (el) { S.sheet = { k: "item", sku: el.dataset.sku }; render(); };
  A["req-prod"] = function () {
    var p = prd(S.sheet.sku), q = Math.ceil((p.min * 2 - p.av) / 5) * 5, w = { id: woId(), st: "queued", sku: p.sku, q: q, done: 0, due: "2025-11-10" };
    S.wos.push(w); S.sheet = null;
    S.notes.forEach(function (n) { if (n.go && n.go.sku === p.sku) { n.resolved = true; n.unread = false; } });
    render(); toast("ok", T("أُنشئ أمر التشغيل " + w.id, "Work order " + w.id + " created"));
  };
  A["read-note"] = function (el) { var n = S.notes.filter(function (x) { return x.id === el.dataset.id; })[0]; if (n && n.unread) { n.unread = false; render(); } };
  A["read-all"] = function () { S.notes.forEach(function (n) { n.unread = false; }); render(); };
  A["note-go"] = function (el) { var n = S.notes.filter(function (x) { return x.id === el.dataset.id; })[0]; n.unread = false; target(n.go, "push"); };
  A["go-products"] = function () { go("products"); };
  A["go-customers"] = function () { go("customers"); };
  A["go-finance"] = function () { go("finance"); };
  A["go-nsettings"] = function () { go("nsettings"); };
  A["push-close"] = function () { S.push = null; clearTimeout(pushTimer); render(); };
  A["push-open"] = function () {
    var n = S.push; S.push = null; clearTimeout(pushTimer); n.unread = false;
    if (!S.role) { S.pending = n.go; render(); toast("info", T("سجّل دخولك أولاً، ثم يفتح الطلب مباشرة", "Sign in first — the item opens right after")); return; }
    target(n.go, "push");
  };

  var pushTimer;
  var PUSHES = {
    urgent: { lv: "urgent", t: ["مخزون منخفض: باب D134", "Low stock: Door D134"], b: ["المتاح 6 والحد الأدنى 20.", "Available 6, minimum 20."], roles: ["admin", "prod"], go: { r: "inv", sku: "DOOR-D134" }, btn: ["فتح المخزون", "Open stock"] },
    action: { lv: "action", t: ["أمر البيع SO-2025-0145 بانتظار تأكيدك", "Order SO-2025-0145 awaits your approval"], b: ["عميل تجزئة · 14,200 ج.م", "Retail customer · EGP 14,200"], roles: ["admin"], go: { r: "order", id: "SO-2025-0145" }, btn: ["فتح الطلب", "Open order"] },
    info: { lv: "info", t: ["تقرير المالية اليومي جاهز", "Daily finance report is ready"], b: ["ملخص النقدية والذمم لليوم.", "Today's cash and receivables summary."], roles: ["admin"], go: { r: "finance" } }
  };
  function sendPush(kind) {
    var d = PUSHES[kind], role = S.role ? (S.role) : null;
    if (role && d.roles.indexOf(role) < 0) { toast("info", T("هذا الإشعار لا يصل لدور «" + B(ROLES[role].n) + "»: يصل لمن يملك الصلاحية فقط", "This alert doesn't reach the “" + B(ROLES[role].n) + "” role — only holders of the permission")); return; }
    var n = { id: "n" + S.seq.n++, lv: d.lv, t: d.t, b: d.b, ago: ["الآن", "now"], unread: true, resolved: d.lv === "info", roles: d.roles, go: d.go, btn: d.btn };
    if (kind === "action" && ord("SO-2025-0145").st !== "draft") n.resolved = true;
    S.notes.unshift(n); S.push = n; clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { if (S.push === n) { S.push = null; render(); } }, 9000);
    render();
  }

  /* ───────────────────────── events (phone) ───────────────────────── */
  dev.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]"); if (!el || !dev.contains(el)) return;
    var f = A[el.dataset.act]; if (!f) return;
    if (el.tagName === "A") e.preventDefault();
    if (el.closest(".m-note") && el.dataset.act !== "read-note" && el.tagName === "BUTTON") e.stopPropagation();
    f(el, e);
  });
  dev.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.id === "pr-pw" || e.key === "Enter" && e.target.id === "pr-email") { e.preventDefault(); A.login(); return; }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
  });
  dev.addEventListener("input", function (e) {
    var k = e.target.dataset.in; if (!k) return;
    if (k === "email") S.login.email = e.target.value;
    else if (k === "pw") S.login.pw = e.target.value;
    else if (k === "q") { S.q = e.target.value; render(); }
  });
  dev.addEventListener("change", function (e) { var k = e.target.dataset.ns; if (k) S.ns[k] = e.target.checked; });

  /* ───────────────────────── page controls ───────────────────────── */
  var JUMP = [["login", "الدخول"], ["home", "الرئيسية"], ["sales", "المبيعات"], ["order", "تفاصيل أمر"], ["confirm", "ورقة التأكيد"], ["neworder", "أمر جديد"], ["prod", "الإنتاج"], ["wo", "أمر تشغيل"], ["inv", "المخزون"], ["item", "تفاصيل صنف"], ["notes", "الإشعارات"], ["nsettings", "إعدادات الإشعارات"], ["more", "المزيد"], ["products", "المنتجات"], ["customers", "العملاء"], ["finance", "المالية"], ["forgot", "نسيت كلمة السر"], ["expired", "انتهاء الجلسة"]];
  var jump = $("#pr-jump");
  jump.insertAdjacentHTML("beforeend", JUMP.map(function (j) { return '<button class="pr-jchip" type="button" data-jump="' + j[0] + '" aria-pressed="false">' + j[1] + "</button>"; }).join(""));

  function jumpTo(k) {
    S.push = null; S.sheet = null; S.pending = null;
    if (k === "login") { S.role = null; S.stack = []; S.route = "login"; S.params = {}; S.login.err = ""; render(); return; }
    if (k === "forgot") { S.role = null; S.stack = [{ r: "login", p: {} }]; S.route = "forgot"; S.params = {}; render(); return; }
    if (k === "expired") { S.role = null; S.stack = []; S.route = "expired"; S.params = {}; render(); return; }
    if (!S.role) S.role = "admin";
    var first = S.orders.slice().sort(byIdDesc)[0];
    if (k === "order" || k === "confirm") {
      var d = S.orders.filter(function (o) { return o.st === "draft"; })[0] || first;
      go("order", { id: d.id }, { reset: true });
      if (k === "confirm") { if (d.st === "draft" && can("sales.approve")) { S.sheet = { k: "confirm", id: d.id }; render(); } else toast("info", T("ورقة التأكيد تظهر لمن يملك صلاحية التأكيد وللأمر المسودة فقط", "The confirm sheet needs the approve permission and a draft order")); }
      return;
    }
    if (k === "wo") { S.log = 5; var w = S.wos.filter(function (x) { return x.st === "in_progress"; })[0] || S.wos[0]; go("wo", { id: w.id }, { reset: true }); return; }
    if (k === "item") { go("inv", {}, { reset: true }); S.sheet = { k: "item", sku: "DOOR-D134" }; render(); return; }
    if (k === "neworder") { S.no = { c: "CUS-001", sku: "DOOR-D134", qty: 1 }; go("neworder", {}, { reset: true }); return; }
    go(k, {}, { reset: true });
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-jump],[data-pr-role],[data-pr-lang],[data-pr-force],[data-pr-push],#pr-expire,#pr-reset"); if (!t || !host().contains(t)) return;
    if (t.dataset.jump) jumpTo(t.dataset.jump);
    else if (t.dataset.prRole) { var wasIn = !!S.role; S.push = null; if (!wasIn) { S.pending = null; signIn(t.dataset.prRole); } else { S.role = t.dataset.prRole; S.sheet = null; S.stack = []; if (S.tab === "sales" && !can("sales.view") || S.tab === "prod" && !can("prod.view")) S.tab = "home"; ensureAccess(); toast("info", T("الدور الآن: " + B(ROLES[S.role].n), "Role: " + B(ROLES[S.role].n))); } }
    else if (t.dataset.prLang) { S.lang = t.dataset.prLang; render(); }
    else if (t.dataset.prForce) { S.force = t.dataset.prForce; render(); }
    else if (t.dataset.prPush) { sendPush(t.dataset.prPush); }
    else if (t.id === "pr-expire") { jumpTo("expired"); }
    else if (t.id === "pr-reset") { S = fresh({ lang: S.lang, ann: S.ann }); lastRoute = null; $("#pr-toasts").innerHTML = ""; render(); }
  });
  function host() { return document.getElementById("try"); }
  $("#pr-offline").addEventListener("change", function (e) {
    S.offline = e.target.checked;
    var pend = S.orders.filter(function (o) { return o.sync; });
    if (!S.offline && pend.length) { pend.forEach(function (o) { o.sync = false; addNote(o); }); render(); toast("ok", T("تمت مزامنة " + pend.length + " مسودة", pend.length + " draft synced")); }
    else render();
    if (S.offline) toast("info", T("وضع بدون إنترنت: العمل الحساس معطّل", "Offline mode: sensitive actions are disabled"));
  });
  $("#pr-annsw").addEventListener("change", function (e) { S.ann = e.target.checked; render(); });

  function syncControls() {
    $$("[data-pr-role]").forEach(function (b) { b.setAttribute("aria-pressed", String(S.role === b.dataset.prRole)); });
    $$("[data-pr-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(S.lang === b.dataset.prLang)); });
    $$("[data-pr-force]").forEach(function (b) { b.setAttribute("aria-pressed", String(S.force === b.dataset.prForce)); });
    $("#pr-offline").checked = S.offline; $("#pr-annsw").checked = S.ann;
    var key = S.route === "order" && S.sheet ? "confirm" : S.route === "inv" && S.sheet ? "item" : S.route;
    $$(".pr-jchip").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.jump === key)); });
    stage.classList.toggle("no-ann", !S.ann);
  }

  /* ───────────────────────── annotations (pins + notes + leader lines) ───────────────────────── */
  var GAP = 40, LANE = 244, PAD = 14, items = [], raf;
  var cards = $("#pr-cards"), pins = $("#pr-pins"), svg = $("#pr-lines"), wrap = $("#pr-wrap");

  function annKey() { return S.push ? "push" : S.sheet ? S.route + ":" + S.sheet.k : S.route; }
  function buildAnn() {
    items = []; cards.innerHTML = ""; pins.innerHTML = ""; svg.innerHTML = "";
    if (!S.ann) return;
    var key = annKey(), defs = (ANN[key] || []).slice();
    if (!S.push && !S.sheet) GLOBAL.forEach(function (g) { if (!defs.some(function (d) { return d.k === g.k; })) defs.push(g); });
    var seen = {};
    defs.forEach(function (d) { if (seen[d.k]) return; var el = scr.querySelector('[data-ann="' + d.k + '"]'); if (el) { seen[d.k] = 1; items.push({ d: d, el: el }); } });
    items.sort(function (x, y) { return x.el.compareDocumentPosition(y.el) & 4 ? -1 : 1; });
    items.forEach(function (it, i) {
      cards.insertAdjacentHTML("beforeend", '<div class="pr-ann" data-i="' + i + '"><div class="pr-ann-h"><span class="n">' + (i + 1) + "</span><b>" + it.d.t + "</b><em>" + it.d.w + "</em></div><p><span>الشكل</span>" + it.d.shape + "</p><p><span>الوظيفة</span>" + it.d.fn + "</p></div>");
      pins.insertAdjacentHTML("beforeend", '<div class="pr-pin" data-i="' + i + '">' + (i + 1) + "</div>");
      svg.insertAdjacentHTML("beforeend", '<path data-i="' + i + '"></path><circle r="3.2" data-i="' + i + '"></circle>');
      it.card = cards.lastElementChild; it.pin = pins.lastElementChild; it.path = svg.querySelector('path[data-i="' + i + '"]'); it.dot = svg.querySelector('circle[data-i="' + i + '"]');
    });
  }

  function fit() {
    var vh = window.innerHeight, zH = (vh - 120) / 740, zW = (stage.clientWidth - 24) / 360;
    var z = Math.max(.6, Math.min(1, zH, zW)); wrap.style.setProperty("--z", z.toFixed(3)); return z;
  }
  function placeAnn() {
    cancelAnimationFrame(raf);
    var z = fit(); stage.style.minHeight = "";
    if (!S.ann || !items.length) return;
    var sr = stage.getBoundingClientRect(), pr = dev.getBoundingClientRect();
    LANE = Math.min(284, Math.floor((stage.clientWidth - 360 * z - 2 * GAP - 28) / 2));
    var narrow = LANE < 200;
    stage.classList.toggle("is-narrow", narrow);
    sr = stage.getBoundingClientRect(); pr = dev.getBoundingClientRect();
    var pcx = pr.left + pr.width / 2, cnt = { l: 0, r: 0 };
    var vis = items.map(function (it) {
      var r = it.el.getBoundingClientRect(), clip = (it.el.closest(".m-body") || scr).getBoundingClientRect(), cy = r.top + Math.min(r.height / 2, 26);
      it.r = r; it.vis = r.width > 0 && cy > clip.top + 6 && cy < clip.bottom - 6 && r.bottom > clip.top + 10;
      var cx = r.left + r.width / 2; it.side = cx < pcx - 26 ? "l" : cx > pcx + 26 ? "r" : null; it.cy = cy; return it;
    });
    vis.forEach(function (it) { if (it.vis && it.side) cnt[it.side]++; });
    vis.forEach(function (it) { if (it.vis && !it.side) { it.side = cnt.l < cnt.r ? "l" : "r"; cnt[it.side]++; } });
    items.forEach(function (it) {
      it.card.style.width = narrow ? "" : LANE + "px"; it.card.hidden = !it.vis && !narrow; it.pin.hidden = !it.vis; it.path.style.display = it.dot.style.display = (it.vis && !narrow) ? "" : "none";
      if (!it.vis) return;
      var px = it.side === "l" ? it.r.left - 11 : it.r.right + 11; px = Math.max(pr.left + 12, Math.min(pr.right - 12, px));
      it.px = px - sr.left; it.py = it.cy - sr.top;
      it.pin.style.left = it.px + "px"; it.pin.style.top = it.py + "px";
    });
    if (narrow) return;
    var H = sr.height, maxNeed = 0;
    ["l", "r"].forEach(function (s) {
      var list = items.filter(function (it) { return it.vis && it.side === s; }).sort(function (x, y) { return x.py - y.py; });
      var y = PAD; list.forEach(function (it) { it.h = it.card.offsetHeight; it.top = Math.max(it.py - 22, y); y = it.top + it.h + 10; });
      var total = list.reduce(function (t, it) { return t + it.h + 10; }, PAD * 2 - 10); maxNeed = Math.max(maxNeed, total);
      var lim = Math.max(H, total);
      for (var i = list.length - 1; i >= 0; i--) { var mx = (i === list.length - 1 ? lim - PAD : list[i + 1].top - 10) - list[i].h; if (list[i].top > mx) list[i].top = Math.max(PAD, mx); }
      list.forEach(function (it) {
        var left = s === "l" ? pr.left - sr.left - GAP - LANE : pr.right - sr.left + GAP;
        it.card.style.left = left + "px"; it.card.style.top = it.top + "px";
        var ex = s === "l" ? left + LANE : left, ey = it.top + 22, mx2 = (it.px + ex) / 2;
        it.path.setAttribute("d", "M" + it.px + "," + it.py + " C" + mx2 + "," + it.py + " " + mx2 + "," + ey + " " + ex + "," + ey);
        it.dot.setAttribute("cx", ex); it.dot.setAttribute("cy", ey);
      });
    });
    if (maxNeed > H) stage.style.minHeight = maxNeed + "px";
  }
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(placeAnn); }
  scr.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  if (window.ResizeObserver) new ResizeObserver(schedule).observe(stage);
  window.addEventListener("load", schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

  function hl(i, on) {
    var it = items[i]; if (!it) return;
    it.card.classList.toggle("is-hl", on); it.pin.classList.toggle("is-hl", on); it.path.classList.toggle("is-hl", on); it.el.classList.toggle("is-ann-hl", on);
  }
  cards.addEventListener("mouseover", function (e) { var c = e.target.closest(".pr-ann"); if (c) hl(+c.dataset.i, true); });
  cards.addEventListener("mouseout", function (e) { var c = e.target.closest(".pr-ann"); if (c) hl(+c.dataset.i, false); });
  scr.addEventListener("mouseover", function (e) { var el = e.target.closest("[data-ann]"); if (!el) return; items.forEach(function (it, i) { if (it.el === el) hl(i, true); }); });
  scr.addEventListener("mouseout", function (e) { var el = e.target.closest("[data-ann]"); if (!el) return; items.forEach(function (it, i) { if (it.el === el) hl(i, false); }); });

  /* start */
  render();
  window.EG = window.EG || {}; window.EG.proto = { go: go, state: function () { return S; } };
})();
