/* Presentation flow: Hub → 1 Identity → 2 Components → 3 Super Admin → 4 Catalog → 5 Finance & HR → 6 Mobile → 7 Documents.
   A sidebar (right in RTL) lists the steps on every page, collapses to an icon rail, and becomes a drawer on small screens.
   An end-of-page "next / previous" panel is injected too. Hidden when printing (documents.html prints only the A4 pages). */
(function () {
  "use strict";
  var STEPS = [
    { file: "index.html", n: "", label: "الرئيسية", title: "الرئيسية", home: true },
    { file: "brand.html", n: "1", label: "الهوية والمقاسات", title: "الهوية والمقاسات", next: "الألوان والخطوط والمقاسات وكيف تُطبّق على الموقع والنظام والموبايل" },
    { file: "design-system.html", n: "2", label: "المكونات", title: "المكونات", next: "الأزرار والنماذج والجداول والتنبيهات وهيكل النظام والأيقونات" },
    { file: "super-admin.html", n: "3", label: "Super Admin", title: "Super Admin: إدارة النظام", next: "المستخدمون، الأدوار والصلاحيات (RBAC)، الأقسام والموديولات، إعدادات الشركة والمخازن والعملة، النشاط" },
    { file: "catalog.html", n: "4", label: "الكتالوج والتاجر", title: "الكتالوج وبوابة التاجر", next: "الكتالوج العام، أنشئ طلبك، حساب التاجر ومتابعة الطلبات، ومراجعة المبيعات" },
    { file: "finance-hr.html", n: "5", label: "الحسابات والـHR", title: "الحسابات والموارد البشرية", next: "الفواتير والتحصيل والسندات والذمم، والحضور والإجازات والمرتبات ومفردات المرتب" },
    { file: "mobile.html", n: "6", label: "الموبايل", title: "تطبيق الموبايل: الأساسيات", next: "نموذج تفاعلي بالشروحات بجانب كل زر، ثم الدخول والحساب، مكتبة المكونات، الشاشات، ونظام الإشعارات" },
    { file: "documents.html", n: "7", label: "المستندات (PDF)", title: "المستندات والتقارير (PDF)", next: "أي وحدة تحتاج أي مستند، و11 قالب A4 مع ملفات PDF جاهزة" }
  ];
  var cur = location.pathname.split("/").pop() || "index.html";
  var i = STEPS.findIndex(function (s) { return s.file === cur; });
  if (i < 0) return;

  var KEY = "eg-flow-collapsed";
  function store(v) { try { if (v === undefined) return localStorage.getItem(KEY); localStorage.setItem(KEY, v); } catch (e) {} return null; }

  var css = document.createElement("style");
  css.textContent =
    ":root{--flow-w:244px}body.fs-collapsed{--flow-w:68px}" +
    "body.has-flow-side{padding-inline-start:var(--flow-w);transition:padding var(--duration-base,240ms) var(--ease-out,ease)}" +
    ".flow-side{position:fixed;inset-block:0;inset-inline-start:0;width:var(--flow-w);z-index:45;background:var(--eg-navy-deep);color:#dbe4f5;display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-4) var(--space-3);overflow-y:auto;overflow-x:hidden;transition:width var(--duration-base,240ms) var(--ease-out,ease),transform var(--duration-base,240ms) var(--ease-out,ease)}" +
    ".flow-side .fs-brand{display:flex;align-items:center;gap:var(--space-3);text-decoration:none;color:#fff;padding:var(--space-2);min-height:48px}" +
    ".flow-side .fs-brand img{width:36px;height:36px;border-radius:50%;background:#fff;padding:2px;flex:none}" +
    ".flow-side .fs-brand b{font-size:var(--text-dense);line-height:1.25;white-space:nowrap}.flow-side .fs-brand small{display:block;color:#8ea1c4;font-weight:500;font-size:11px}" +
    ".flow-side .fs-label{font-size:11px;font-weight:700;color:#8ea1c4;padding:var(--space-2) var(--space-3) 0;letter-spacing:.02em;white-space:nowrap}" +
    ".flow-side nav{display:flex;flex-direction:column;gap:2px;position:relative}" +
    ".flow-side nav a{display:flex;align-items:center;gap:var(--space-3);min-height:44px;padding:6px var(--space-3);border-radius:var(--radius-md);color:inherit;text-decoration:none;font-size:var(--text-dense);font-weight:500;white-space:nowrap;position:relative}" +
    ".flow-side nav a:hover{background:rgba(255,255,255,.08);color:#fff}" +
    ".flow-side nav a .n{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.1);color:#fff;font:700 12px var(--font-en)}" +
    ".flow-side nav a .n .icon{width:16px;height:16px}" +
    ".flow-side nav a[aria-current=page]{background:rgba(255,255,255,.12);color:#fff;font-weight:700;box-shadow:inset 3px 0 0 var(--color-accent,#ed1c24)}" +
    "[dir=rtl] .flow-side nav a[aria-current=page]{box-shadow:inset -3px 0 0 var(--color-accent,#ed1c24)}" +
    ".flow-side nav a[aria-current=page] .n{background:var(--color-accent,#ed1c24)}" +
    ".flow-side nav a.is-done .n{background:rgba(95,211,141,.22);color:#9be3b8}" +
    ".flow-side .fs-foot{margin-top:auto;display:flex;flex-direction:column;gap:var(--space-2);border-top:1px solid rgba(255,255,255,.12);padding-top:var(--space-3)}" +
    ".flow-side .fs-foot a{display:flex;align-items:center;gap:var(--space-3);color:#b9c7e2;text-decoration:none;font-size:var(--text-caption);padding:6px var(--space-3);border-radius:var(--radius-md);white-space:nowrap}" +
    ".flow-side .fs-foot a:hover{background:rgba(255,255,255,.08);color:#fff}" +
    ".flow-side .fs-collapse{display:flex;align-items:center;gap:var(--space-3);background:none;border:0;color:#b9c7e2;cursor:pointer;font:inherit;font-size:var(--text-caption);padding:6px var(--space-3);border-radius:var(--radius-md);white-space:nowrap}" +
    ".flow-side .fs-collapse:hover{background:rgba(255,255,255,.08);color:#fff}" +
    ".flow-side .fs-collapse .icon,.flow-side .fs-foot .icon{width:18px;height:18px;transition:transform var(--duration-base,240ms)}" +
    "body.fs-collapsed .flow-side .fs-collapse .icon{transform:scaleX(-1)}" +
    "body.fs-collapsed .flow-side .t,body.fs-collapsed .flow-side .fs-brand b,body.fs-collapsed .flow-side .fs-label{display:none}" +
    "body.fs-collapsed .flow-side nav a,body.fs-collapsed .flow-side .fs-collapse,body.fs-collapsed .flow-side .fs-foot a{justify-content:center;padding-inline:0}" +
    ".fs-burger{display:none;position:fixed;inset-block-start:10px;inset-inline-start:10px;z-index:46;width:44px;height:44px;border-radius:50%;border:0;background:var(--eg-navy-deep);color:#fff;box-shadow:0 4px 14px rgba(2,26,67,.35);cursor:pointer;place-items:center}" +
    ".fs-burger .icon{width:22px;height:22px}.fs-scrim{display:none}" +
    ".flow-next{background:var(--eg-navy-deep);color:#fff;padding-block:var(--space-10)}" +
    ".flow-next .in{width:min(100% - 2rem,var(--container));margin-inline:auto;display:flex;gap:var(--space-5);align-items:center;justify-content:space-between;flex-wrap:wrap}" +
    ".flow-next small{color:#9aa7bd;display:block;margin-bottom:4px}" +
    ".flow-next h2{margin:0;font-size:var(--text-h2)}.flow-next p{margin:4px 0 0;color:#b9c7e2}" +
    ".flow-next .btns{display:flex;gap:var(--space-3);flex-wrap:wrap}" +
    ".ds-nav{top:0!important}.doc-info{top:72px!important}[id]{scroll-margin-top:72px}" +
    "@media (max-width:1000px){" +
    ":root,body.fs-collapsed{--flow-w:0px}body.has-flow-side{padding-inline-start:0}" +
    ".flow-side{width:272px;transform:translateX(100%);box-shadow:0 0 40px rgba(2,26,67,.4)}[dir=ltr] .flow-side{transform:translateX(-100%)}" +
    "body.fs-open .flow-side{transform:none}.fs-burger{display:grid}body.fs-open .fs-burger{display:none}" +
    "body.fs-open .fs-scrim{display:block;position:fixed;inset:0;background:rgba(2,26,67,.5);z-index:44}" +
    "body.fs-collapsed .flow-side .t,body.fs-collapsed .flow-side .fs-brand b,body.fs-collapsed .flow-side .fs-label{display:initial}" +
    ".flow-side .fs-collapse{display:none}.ds-nav .container{padding-inline-start:52px}}" +
    "@media print{.flow-side,.fs-burger,.fs-scrim,.flow-next{display:none!important}body.has-flow-side{padding-inline-start:0!important}}";
  document.head.appendChild(css);

  function ic(n) { return (window.EG && EG.icon) ? EG.icon(n) : ""; }
  var items = STEPS.map(function (s, k) {
    var badge = s.home ? (ic("home") || "⌂") : s.n;
    var state = k === i ? ' aria-current="page"' : (k < i && !s.home ? ' class="is-done"' : "");
    return '<a href="./' + s.file + '"' + state + ' title="' + s.label + '"><span class="n">' + badge + '</span><span class="t">' + s.label + "</span></a>";
  }).join("");
  var chip = 'style="display:grid;place-items:center;width:28px;height:28px;flex:none"';

  var side = '<aside class="flow-side" id="flow-side" aria-label="مسار العرض">' +
    '<a class="fs-brand" href="./index.html"><img src="./assets/images/logo/mark.png" alt="EG" /><b>نظام تصميم EG<small>المصرية الألمانية</small></b></a>' +
    '<div class="fs-label">رحلة العرض</div><nav>' + items + "</nav>" +
    '<div class="fs-foot"><a href="./index.html#tech-title" title="للمطورين"><span ' + chip + ">" + (ic("wrench") || "⚙") + '</span><span class="t">للمطورين</span></a>' +
    '<button class="fs-collapse" type="button" id="fs-toggle" aria-label="طي / فتح القائمة" title="طي / فتح القائمة"><span ' + chip + ">" + (ic("chevron") || "›") + '</span><span class="t">طي القائمة</span></button></div></aside>' +
    '<button class="fs-burger" type="button" id="fs-burger" aria-label="قائمة المسار" aria-controls="flow-side">' + (ic("menu") || "☰") + '</button><div class="fs-scrim" id="fs-scrim"></div>';

  document.body.classList.add("has-flow-side");
  if (store() === "1") document.body.classList.add("fs-collapsed");
  document.body.insertAdjacentHTML("afterbegin", side);

  document.getElementById("fs-toggle").addEventListener("click", function () {
    var c = document.body.classList.toggle("fs-collapsed"); store(c ? "1" : "0");
  });
  function closeDrawer() { document.body.classList.remove("fs-open"); }
  document.getElementById("fs-burger").addEventListener("click", function () { document.body.classList.toggle("fs-open"); });
  document.getElementById("fs-scrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
  document.getElementById("flow-side").addEventListener("click", function (e) { if (e.target.closest("a")) closeDrawer(); });

  var nx = STEPS[i + 1], pv = STEPS[i - 1];
  if (i > 0 && (nx || pv)) {
    var html = '<section class="flow-next"><div class="in"><div>' +
      (nx ? "<small>الخطوة التالية · " + (nx.n || "") + "</small><h2>" + nx.title + "</h2><p>" + (nx.next || "") + "</p>"
          : "<small>انتهت الرحلة</small><h2>راجعت الهوية والمكونات والمستندات</h2><p>ارجع للرئيسية لقرارات الإدارة المطلوبة.</p>") +
      '</div><div class="btns">' +
      (pv ? '<a class="btn btn-ghost" href="./' + pv.file + '">→ ' + (pv.n ? "الخطوة " + pv.n + ": " : "") + pv.label + "</a>" : "") +
      (nx ? '<a class="btn btn-accent btn-lg" href="./' + nx.file + '">التالي: ' + nx.label + " ←</a>"
          : '<a class="btn btn-accent btn-lg" href="./index.html">العودة للرئيسية</a>') +
      "</div></div></section>";
    var anchor = document.querySelector("body > footer");
    (anchor ? anchor : document.body).insertAdjacentHTML(anchor ? "beforebegin" : "beforeend", html);
  }
})();
