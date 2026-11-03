/* AR (RTL) ⇄ EN (LTR) switch. Persists in localStorage. Elements with data-ar / data-en swap text. */
(function () {
  "use strict";
  const KEY = "eg-lang";
  function apply(lang) {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-ar][data-en]").forEach((el) => { el.textContent = el.dataset[lang]; });
    document.querySelectorAll("[data-lang-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.langToggle === lang)));
    try { localStorage.setItem(KEY, lang); } catch (e) {}
  }
  let saved = "ar";
  try { saved = localStorage.getItem(KEY) || "ar"; } catch (e) {}
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-lang-toggle]").forEach((b) => b.addEventListener("click", () => apply(b.dataset.langToggle)));
    apply(saved);
  });
})();
