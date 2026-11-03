/* "أنشئ طلبك" — interactive dealer order demo (catalog.html).
   The dealer sees dealer prices while ordering; the invoice (proforma) is drawn live beside the builder;
   on submit the dealer is told a sales rep will call to confirm. Illustrative prices; VAT 14% is a sample value, not approved (open-questions #38). */
(function () {
  "use strict";
  var root = document.getElementById("order-flow");
  if (!root) return;

  var VAT = 0.14;
  var FIN = ["C132", "C160", "C021", "C198", "C182", "C115", "C091", "C173", "C102", "C3003", "C8001"];
  var FOAM = { "4.5": [400, 430], "6": [480, 520], "8": [600, 650], "10": [720, 780], "12": [850, 920], "14": [980, 1060], "17": [1150, 1240] };
  var PRODUCTS = [
    { id: "d134", name: "باب WPC مودرن D134", img: "doors", unit: "pcs", step: 1, price: 7100, pub: 7600, label: "العرض (سم)", opts: [80, 90, 100, 110], def: 90, fin: true, sku: function (o, f) { return "D134-" + f + "-" + o; }, desc: function (o) { return o + "×215 سم"; } },
    { id: "d132", name: "باب WPC مودرن D132", img: "doors", unit: "pcs", step: 1, price: 7100, pub: 7600, label: "العرض (سم)", opts: [80, 90, 100, 110], def: 90, fin: true, sku: function (o, f) { return "D132-" + f + "-" + o; }, desc: function (o) { return o + "×215 سم"; } },
    { id: "clad", name: "تجليد WPC بديل الخشب", img: "cladding", unit: "m²", step: 5, price: 250, pub: 270, label: "الموديل", opts: ["K71-1", "K71-2", "K71-3", "K71-4", "K71-5"], def: "K71-2", fin: true, sku: function (o, f) { return o + "-" + f; }, desc: function (o) { return "17×280 سم"; } },
    { id: "foam", name: "ألواح PVC فوم بورد", img: "foam", unit: "pcs", step: 1, label: "السمك (مم)", opts: ["4.5", "6", "8", "10", "12", "14", "17"], def: "6", fin: true, byOpt: FOAM, sku: function (o, f) { return "FOAM-" + o.replace(".", "_") + "MM-" + f; }, desc: function (o) { return o + " مم · 122×244 سم"; } },
    { id: "acc", name: "طقم إكسسوارات باب", img: null, unit: "pcs", step: 1, price: 450, pub: 480, opts: null, fin: false, sku: function () { return "ACC-DOOR-KIT"; }, desc: function () { return ""; } }
  ];

  var sel = { p: 0, fin: "C091", opt: "90", qty: 1 };
  var lines = [{ p: 0, fin: "C091", opt: "90", qty: 24 }, { p: 2, fin: "C102", opt: "K71-2", qty: 120 }];
  var step = 0, lastAdded = -1;

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || root).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); }
  function fmt(n) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmt0(n) { return n.toLocaleString("en-US"); }
  function prices(p, opt) {
    var P = PRODUCTS[p];
    if (P.byOpt) { var v = P.byOpt[String(opt)] || P.byOpt["6"]; return { price: v[0], pub: v[1] }; }
    return { price: P.price, pub: P.pub };
  }

  /* Arabic amount in words (EGP) */
  var ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  var TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  var HUND = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
  function under1000(n) {
    var parts = [], h = Math.floor(n / 100), r = n % 100;
    if (h) parts.push(HUND[h]);
    if (r) {
      if (r < 20) parts.push(ONES[r]);
      else { var u = r % 10, t = Math.floor(r / 10); parts.push(u ? ONES[u] + " و" + TENS[t] : TENS[t]); }
    }
    return parts.join(" و");
  }
  function scaled(k, one, two, few, many) {
    if (k === 1) return one;
    if (k === 2) return two;
    if (k >= 3 && k <= 10) return under1000(k) + " " + few;
    return under1000(k) + " " + many;
  }
  function words(n) {
    if (n === 0) return "صفر";
    var out = [], m = Math.floor(n / 1000000), th = Math.floor((n % 1000000) / 1000), rest = n % 1000;
    if (m) out.push(scaled(m, "مليون", "مليونان", "ملايين", "مليوناً"));
    if (th) out.push(scaled(th, "ألف", "ألفان", "آلاف", "ألفاً"));
    if (rest) out.push(under1000(rest));
    return out.join(" و");
  }
  function money(n) {
    var pounds = Math.floor(n + 1e-9), pi = Math.round((n - pounds) * 100);
    if (pi === 100) { pounds += 1; pi = 0; }
    var pw = pounds === 1 ? "جنيه واحد" : pounds === 2 ? "جنيهان" : pounds >= 3 && pounds <= 10 ? words(pounds) + " جنيهات" : words(pounds) + " جنيهاً";
    var s = "فقط " + pw;
    if (pi) s += " و" + (pi === 1 ? "قرش واحد" : pi === 2 ? "قرشان" : pi <= 10 ? words(pi) + " قروش" : words(pi) + " قرشاً");
    return s + " لا غير";
  }
  window.EG = window.EG || {};
  window.EG.amountInWords = money;

  /* ---------- totals ---------- */
  function totals() {
    var sub = 0, pub = 0;
    lines.forEach(function (l) { var pr = prices(l.p, l.opt); sub += l.qty * pr.price; pub += l.qty * pr.pub; });
    var vat = Math.round(sub * VAT * 100) / 100;
    return { sub: sub, pub: pub, save: pub - sub, vat: vat, total: sub + vat, count: lines.length };
  }

  /* ---------- invoice (proforma) sheet ---------- */
  function invoiceHTML(opts) {
    opts = opts || {};
    var t = totals(), d = new Date();
    var date = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    var rows = lines.map(function (l, i) {
      var P = PRODUCTS[l.p], pr = prices(l.p, l.opt);
      var fin = P.fin ? ' · <span class="num">' + l.fin + "</span>" : "";
      var desc = P.desc(l.opt);
      return '<tr class="' + (i === lastAdded ? "flash" : "") + '"><td class="num">' + (i + 1) + "</td><td>" + P.name + (desc ? " · " + desc : "") + fin + '<div class="t-caption num">' + P.sku(String(l.opt), l.fin) + "</div></td><td>" + fin + '</td><td class="num" style="text-align:end">' + fmt0(l.qty) + '<span class="unit">' + P.unit + '</span></td><td class="num" style="text-align:end">' + fmt(pr.price) + '</td><td class="num" style="text-align:end"><b>' + fmt(l.qty * pr.price) + "</b></td></tr>";
    }).join("");
    var empty = '<tr><td colspan="5" class="t-muted" style="text-align:center;padding:24px">أضف منتجاً وسيظهر هنا فوراً.</td></tr>';
    var phone = opts.phone ? '<div><div class="t-caption">رقم الاتصال لتأكيد الطلب</div><strong class="num">' + opts.phone + "</strong></div>" : '<div><div class="t-caption">الرقم الضريبي</div><span class="ph">Placeholder</span></div>';
    return '<div class="inv-ribbon">فاتورة مبدئية · Proforma <span class="pending-badge">بانتظار تأكيد هاتفي</span></div>' +
      '<div class="spread"><img src="./assets/images/logo/wordmark-color.png" alt="" style="height:36px;width:auto" /><div style="text-align:end"><strong class="num">' + (opts.no || "DRF-2026-0146") + '</strong><div class="t-caption num">' + date + "</div></div></div>" +
      '<div class="grid grid-2" style="gap:var(--space-3)"><div><div class="t-caption">التاجر</div><strong>شركة النيل للمقاولات</strong><div class="t-caption">قائمة أسعار التاجر</div></div>' + phone + "</div>" +
      '<table class="table" style="min-width:0"><thead><tr><th>#</th><th>الصنف</th><th style="text-align:end">الكمية</th><th style="text-align:end">سعر الوحدة</th><th style="text-align:end">الإجمالي</th></tr></thead><tbody>' + (rows || empty) + "</tbody></table>" +
      '<div class="totals"><div><span>الإجمالي</span><b class="num">' + fmt(t.sub) + "</b></div>" +
      (t.save > 0 ? '<div style="color:var(--color-success)"><span>وفّرت بسعر التاجر</span><b class="num">' + fmt(t.save) + "</b></div>" : "") +
      '<div><span>ضريبة القيمة المضافة (نسبة نموذجية 14%) <span class="pending-badge">Pending</span></span><b class="num">' + fmt(t.vat) + '</b></div><div class="grand"><span>الإجمالي المستحق</span><span class="num">' + fmt(t.total) + " ج.م</span></div></div>" +
      '<div class="doc-words-screen"><b>المبلغ كتابةً:</b> ' + (t.count ? money(t.total) : "—") + "</div>" +
      '<div class="inv-note">هذه فاتورة مبدئية لطلبك وليست فاتورة ضريبية. <strong>لا يُؤكَّد الطلب إلا بعد أن يتصل بك أحد ممثلي المبيعات هاتفياً.</strong> الأسعار توضيحية وتخضع لسياسات الشركة.</div>';
  }
  function renderInvoices() {
    var live = $("#inv-live"), rev = $("#inv-review");
    if (live) live.innerHTML = invoiceHTML();
    if (rev) rev.innerHTML = invoiceHTML({ phone: ($("#call-phone") || {}).value });
    lastAdded = -1;
  }

  /* ---------- builder ---------- */
  function renderPicker() {
    var P = PRODUCTS[sel.p];
    $$("#prod-pick button").forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === sel.p)); });
    var optBox = $("#opt-box");
    if (P.opts) {
      optBox.hidden = false;
      $("#opt-label").textContent = P.label;
      $("#opt-pick").innerHTML = P.opts.map(function (o) { return '<button class="opt-chip od-opt" type="button" data-o="' + o + '" aria-pressed="' + (String(o) === String(sel.opt)) + '">' + o + "</button>"; }).join("");
    } else optBox.hidden = true;
    $("#fin-box").hidden = !P.fin;
    $$("#fin-pick button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.f === sel.fin)); });
    $("#fin-lbl").textContent = sel.fin;
    var pr = prices(sel.p, sel.opt);
    $("#sel-unit").textContent = P.unit;
    $("#sel-qty").textContent = fmt0(sel.qty);
    $("#sel-price").textContent = fmt0(pr.price);
    $("#sel-pub").textContent = fmt0(pr.pub);
    $("#sel-total").textContent = fmt(sel.qty * pr.price);
  }
  function renderLines() {
    var box = $("#lines");
    box.innerHTML = lines.length ? lines.map(function (l, i) {
      var P = PRODUCTS[l.p], pr = prices(l.p, l.opt);
      return '<div class="cart-line"><div class="cart-info"><strong>' + P.name + '</strong><div class="t-caption num">' + P.sku(String(l.opt), l.fin) + '</div></div><div class="qty" data-i="' + i + '"><button type="button" data-d="-1" aria-label="نقص">−</button><output class="num">' + fmt0(l.qty) + '</output><button type="button" data-d="1" aria-label="زيادة">+</button><span class="unit" style="padding-inline:8px">' + P.unit + '</span></div><div class="amount">' + fmt(l.qty * pr.price) + '<span class="cur">ج.م</span></div><button class="btn btn-ghost btn-icon btn-sm" type="button" data-rm="' + i + '" aria-label="حذف">✕</button></div>';
    }).join("") : '<div class="empty" style="padding:var(--space-6)"><span class="t-muted">لا بنود بعد. اختر منتجاً وأضفه.</span></div>';
    $("#line-count").textContent = lines.length;
    var t = totals();
    var bar = $("#cart-total"); if (bar) bar.textContent = fmt(t.total);
  }
  function refresh() { renderPicker(); renderLines(); renderInvoices(); updateNav(); }

  /* ---------- steps ---------- */
  var panels = $$(".panel"), stepsEl = $$("#steps li"), next = $("#next-btn"), prev = $("[data-prev]");
  function updateNav() {
    panels.forEach(function (p, k) { p.classList.toggle("is-on", k === step); });
    stepsEl.forEach(function (s, k) { s.className = k < step ? "is-done" : k === step ? "is-now" : ""; });
    next.style.display = step === 0 ? "none" : "";
    next.textContent = step === 2 ? "إرسال الطلب" : step === 3 ? "طلب جديد" : "متابعة";
    next.disabled = step === 1 && !lines.length;
    prev.style.visibility = step === 0 || step === 3 ? "hidden" : "visible";
  }
  function submit() {
    var ph = ($("#call-phone") || {}).value || "0100 000 0000";
    $("#call-phone-out").textContent = ph;
    $("#call-time-out").textContent = ($("#call-time") || {}).value || "خلال ساعات العمل";
    $("#ok-total").textContent = fmt(totals().total);
    $("#ok-count").textContent = lines.length;
  }
  root.addEventListener("click", function (e) {
    var t = e.target;
    var pp = t.closest("#prod-pick button");
    if (pp) { sel.p = +pp.dataset.p; var P = PRODUCTS[sel.p]; sel.opt = P.opts ? String(P.def) : ""; sel.qty = P.step === 5 ? 20 : 1; refresh(); return; }
    var op = t.closest(".od-opt"); if (op) { sel.opt = op.dataset.o; refresh(); return; }
    var fp = t.closest("#fin-pick button"); if (fp) { sel.fin = fp.dataset.f; refresh(); return; }
    var sq = t.closest("#sel-stepper button");
    if (sq) { var st = PRODUCTS[sel.p].step; sel.qty = Math.max(st, sel.qty + (+sq.dataset.d) * st); refresh(); return; }
    if (t.closest("#add-line")) {
      var P2 = PRODUCTS[sel.p], found = -1;
      lines.forEach(function (l, i) { if (l.p === sel.p && l.fin === sel.fin && String(l.opt) === String(sel.opt)) found = i; });
      if (found >= 0) { lines[found].qty += sel.qty; lastAdded = found; }
      else { lines.push({ p: sel.p, fin: P2.fin ? sel.fin : "", opt: sel.opt, qty: sel.qty }); lastAdded = lines.length - 1; }
      refresh(); return;
    }
    var cq = t.closest(".cart-line .qty button");
    if (cq) { var i = +cq.parentElement.dataset.i, s2 = PRODUCTS[lines[i].p].step; lines[i].qty = Math.max(s2, lines[i].qty + (+cq.dataset.d) * s2); lastAdded = i; refresh(); return; }
    var rm = t.closest("[data-rm]"); if (rm) { lines.splice(+rm.dataset.rm, 1); refresh(); return; }
    if (t.closest("[data-print]")) { var host = $("#inv-review") || $("#inv-live"); host.classList.add("is-printing"); window.print(); host.classList.remove("is-printing"); return; }
    if (t.closest("#next-btn")) {
      if (step === 3) { step = 0; lines = [{ p: 0, fin: "C091", opt: "90", qty: 24 }]; sel = { p: 0, fin: "C091", opt: "90", qty: 1 }; refresh(); return; }
      if (step === 2) submit();
      step = Math.min(3, step + 1); if (step === 2) renderInvoices(); updateNav(); return;
    }
    if (t.closest("[data-next]")) { step = 1; updateNav(); return; }
    if (t.closest("[data-prev]")) { step = Math.max(0, step - 1); updateNav(); return; }
  });
  root.addEventListener("input", function (e) { if (e.target.id === "call-phone") renderInvoices(); });

  /* static pickers */
  $("#prod-pick").innerHTML = PRODUCTS.map(function (p, i) {
    var pr = prices(i, p.def || "6");
    return '<button type="button" class="prod-btn" data-p="' + i + '" aria-pressed="' + (i === sel.p) + '">' + (p.img ? '<img src="./assets/images/products/' + p.img + '.png" alt="" />' : '<span class="ph-img">+</span>') + "<b>" + p.name + '</b><span class="num t-caption">' + fmt0(pr.price) + ' ج.م / ' + p.unit + "</span></button>";
  }).join("");
  $("#fin-pick").innerHTML = FIN.map(function (f) { return '<button type="button" data-f="' + f + '" style="--c:var(--finish-' + f.toLowerCase() + ')" aria-pressed="' + (f === sel.fin) + '" aria-label="' + f + '"></button>'; }).join("");
  refresh();
})();
