/* Tabs, segmented, modal, toast, row select — only what the reference page demonstrates. */
(function () {
  "use strict";
  document.addEventListener("click", (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) {
      const list = tab.parentElement;
      list.querySelectorAll('[role="tab"]').forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      return;
    }
    const seg = e.target.closest(".segmented button");
    if (seg) { seg.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === seg))); return; }

    const open = e.target.closest("[data-open-modal]");
    if (open) { const m = document.getElementById(open.dataset.openModal); if (m) { m.hidden = false; m.querySelector("button")?.focus(); } return; }
    if (e.target.closest("[data-close-modal]") || e.target.classList.contains("modal-backdrop")) {
      e.target.closest(".modal-backdrop").hidden = true; return;
    }
    const t = e.target.closest("[data-toast]");
    if (t) {
      const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = t.dataset.toast;
      document.body.appendChild(el); setTimeout(() => el.remove(), 2600);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal-backdrop").forEach((m) => (m.hidden = true));
  });
  document.addEventListener("change", (e) => {
    const cb = e.target.closest("tr input[type=checkbox]");
    if (cb) cb.closest("tr").classList.toggle("is-selected", cb.checked);
  });
})();
