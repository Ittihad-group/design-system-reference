/* Presentation flow: Hub → 1 Identity → 2 Components → 3 Documents (PDF).
   Injects a sticky step bar on top of every page and a "next / previous" panel at the end.
   Not shown in print (documents.html prints only the A4 pages). */
(function () {
  "use strict";
  var STEPS = [
    { file: "index.html", n: "", label: "الرئيسية", title: "الرئيسية" },
    { file: "brand.html", n: "1", label: "الهوية والمقاسات", title: "الهوية والمقاسات", next: "الألوان والخطوط والمقاسات وكيف تُطبّق على الموقع والنظام والموبايل" },
    { file: "design-system.html", n: "2", label: "المكونات", title: "المكونات", next: "الأزرار والنماذج والجداول والتنبيهات وهيكل النظام والأيقونات" },
    { file: "super-admin.html", n: "3", label: "Super Admin", title: "Super Admin: إدارة النظام", next: "المستخدمون، الأدوار والصلاحيات (RBAC)، الأقسام والموديولات، إعدادات الشركة والمخازن والعملة، النشاط" },
    { file: "catalog.html", n: "4", label: "الكتالوج والتاجر", title: "الكتالوج وبوابة التاجر", next: "الكتالوج العام، أنشئ طلبك، حساب التاجر ومتابعة الطلبات، ومراجعة المبيعات" },
    { file: "mobile.html", n: "5", label: "الموبايل", title: "تطبيق الموبايل: الأساسيات", next: "الدخول والحساب، مكتبة مكونات الموبايل، الشاشات الأساسية، ونظام الإشعارات" },
    { file: "documents.html", n: "6", label: "المستندات (PDF)", title: "المستندات والتقارير (PDF)", next: "أي وحدة تحتاج أي مستند، و6 قوالب A4 مع ملفات PDF جاهزة" }
  ];
  var cur = location.pathname.split("/").pop() || "index.html";
  var i = STEPS.findIndex(function (s) { return s.file === cur; });
  if (i < 0) return;

  var css = document.createElement("style");
  css.textContent =
    ".flow-bar{position:sticky;top:0;z-index:70;background:#fff;border-bottom:1px solid var(--color-border);box-shadow:0 1px 2px rgba(2,26,67,.06)}" +
    ".flow-bar .in{display:flex;align-items:center;gap:6px;min-height:46px;overflow-x:auto;width:min(100% - 2rem,var(--container));margin-inline:auto}" +
    ".flow-bar a{display:flex;align-items:center;gap:8px;white-space:nowrap;text-decoration:none;color:var(--color-text-muted);font-size:var(--text-dense);font-weight:600;padding:6px 12px;border-radius:99px}" +
    ".flow-bar a:hover{background:var(--color-secondary-tint);color:var(--eg-navy)}" +
    ".flow-bar a[aria-current=page]{background:var(--eg-navy);color:#fff}" +
    ".flow-bar .n{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--color-secondary-tint);color:var(--eg-navy);font-size:12px;font-family:var(--font-en)}" +
    ".flow-bar a[aria-current=page] .n{background:var(--eg-red);color:#fff}" +
    ".flow-bar .sep{color:var(--color-border-strong);flex:none}" +
    ".flow-bar .sp{flex:1}" +
    ".flow-next{background:var(--eg-navy-deep);color:#fff;padding-block:var(--space-10)}" +
    ".flow-next .in{width:min(100% - 2rem,var(--container));margin-inline:auto;display:flex;gap:var(--space-5);align-items:center;justify-content:space-between;flex-wrap:wrap}" +
    ".flow-next small{color:#9aa7bd;display:block;margin-bottom:4px}" +
    ".flow-next h2{margin:0;font-size:var(--text-h2)}.flow-next p{margin:4px 0 0;color:#b9c7e2}" +
    ".flow-next .btns{display:flex;gap:var(--space-3);flex-wrap:wrap}" +
    ".ds-nav{top:46px!important}.doc-info{top:116px!important}[id]{scroll-margin-top:110px}";
  document.head.appendChild(css);

  var bar = '<nav class="flow-bar" aria-label="مسار العرض"><div class="in">' +
    STEPS.map(function (s, k) {
      var inner = (s.n ? '<span class="n">' + s.n + "</span>" : "") + s.label;
      return (k ? '<span class="sep">›</span>' : "") + '<a href="./' + s.file + '"' + (k === i ? ' aria-current="page"' : "") + ">" + inner + "</a>";
    }).join("") + '<span class="sp"></span><a href="./index.html#tech-title">للمطورين</a></div></nav>';
  document.body.insertAdjacentHTML("afterbegin", bar);

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
