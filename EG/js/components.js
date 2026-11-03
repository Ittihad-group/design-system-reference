/* Small render helpers shared by the reference page and future screens. */
(function (global) {
  "use strict";
  const EG = (global.EG = global.EG || {});
  const STATUS = {
    draft: ["مسودة", "Draft", ""],
    confirmed: ["مؤكد", "Confirmed", "chip-info"],
    production: ["قيد الإنتاج", "In production", "chip-warning"],
    shipped: ["تم الشحن", "Shipped", "chip-success"],
    cancelled: ["ملغي", "Cancelled", "chip-danger"],
  };
  EG.chip = (status, lang) => {
    const s = STATUS[status] || STATUS.draft;
    return '<span class="chip ' + s[2] + '">' + (lang === "en" ? s[1] : s[0]) + "</span>";
  };
  EG.money = (n) => new Intl.NumberFormat("en-US").format(n) + " ج.م";
})(window);
