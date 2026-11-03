/* EG mobile kit — behaviours used by mobile.html (and reusable by the real app):
   icon placeholders, PIN pad, hold-to-confirm, toast, password eye, filter chips, mark-as-read. */
(function () {
  "use strict";

  /* <i data-i="bell" data-c="icon-chev"></i>  →  <svg class="icon icon-chev"><use href="#i-bell"/></svg> */
  function icons(root) {
    (root || document).querySelectorAll("i[data-i]").forEach(function (el) {
      var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      s.setAttribute("class", "icon " + (el.dataset.c || ""));
      s.setAttribute("aria-hidden", "true");
      s.innerHTML = '<use href="#i-' + el.dataset.i + '"/>';
      el.replaceWith(s);
    });
  }

  function toast(host, kind, msg, act) {
    var t = document.createElement("div");
    t.className = "m-toast is-" + kind;
    t.setAttribute("role", "status");
    t.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-' + (kind === "ok" ? "check" : kind === "bad" ? "alert" : "info") + '"/></svg><span>' + msg + "</span>" + (act ? '<button class="m-act" type="button">' + act + "</button>" : "");
    if (host === document.body) t.classList.add("m-toast-live");
    host.appendChild(t);
    var timer = setTimeout(function () { t.remove(); }, 3800);
    var b = t.querySelector(".m-act");
    if (b) b.addEventListener("click", function () { clearTimeout(timer); t.remove(); });
    return t;
  }

  document.addEventListener("DOMContentLoaded", function () {
    icons();

    /* PIN pad */
    document.querySelectorAll(".m-keypad[data-pin]").forEach(function (pad) {
      var scr = pad.closest(".m-scr"), dots = scr.querySelectorAll(".m-dots i"), val = "";
      function paint() { dots.forEach(function (d, i) { d.classList.toggle("on", i < val.length); }); }
      pad.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        var k = b.dataset.k;
        if (k === "del") val = val.slice(0, -1);
        else if (k && val.length < dots.length) val += k;
        paint();
        if (val.length === dots.length) {
          toast(scr, "ok", "تم حفظ الرقم السري");
          setTimeout(function () { val = ""; paint(); }, 1200);
        }
      });
    });

    /* hold to confirm */
    document.querySelectorAll(".m-hold").forEach(function (b) {
      var iv, p = 0, label = b.querySelector("b");
      var start = b.dataset.label;
      function reset() { clearInterval(iv); p = 0; b.style.setProperty("--p", "0%"); b.classList.remove("is-holding"); }
      function down(e) {
        if (b.classList.contains("is-done")) return;
        e.preventDefault(); b.classList.add("is-holding");
        iv = setInterval(function () {
          p += 4; b.style.setProperty("--p", Math.min(p, 100) + "%");
          if (p >= 100) { clearInterval(iv); b.classList.remove("is-holding"); b.classList.add("is-done"); label.textContent = b.dataset.done; }
        }, 40);
      }
      b.addEventListener("pointerdown", down);
      ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { b.addEventListener(ev, function () { if (!b.classList.contains("is-done")) reset(); }); });
      b.addEventListener("dblclick", function () { if (b.classList.contains("is-done")) { b.classList.remove("is-done"); label.textContent = start; reset(); } });
      b.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && !b.classList.contains("is-done")) { e.preventDefault(); b.classList.add("is-done"); label.textContent = b.dataset.done; } });
    });

    document.addEventListener("click", function (e) {
      /* live toasts */
      var t = e.target.closest("[data-mtoast]");
      if (t) { toast(document.body, t.dataset.kind || "info", t.dataset.msg, t.dataset.act); return; }
      /* in-phone action buttons that confirm */
      var a = e.target.closest("[data-mdone]");
      if (a) { var scr = a.closest(".m-scr, .m-device"); toast(scr.classList.contains("m-scr") ? scr : scr.querySelector(".m-scr"), "ok", a.dataset.mdone); return; }
      /* password eye */
      var eye = e.target.closest("[data-eye]");
      if (eye) {
        var inp = eye.closest(".m-input").querySelector("input"), show = inp.type === "password";
        inp.type = show ? "text" : "password";
        eye.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-' + (show ? "eyeoff" : "eye") + '"/></svg>';
        eye.setAttribute("aria-label", show ? "إخفاء كلمة السر" : "إظهار كلمة السر");
        return;
      }
      /* filter chips */
      var f = e.target.closest(".m-fchip");
      if (f) { f.parentElement.querySelectorAll(".m-fchip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === f)); }); return; }
      /* mark notification read */
      var n = e.target.closest(".m-note.is-unread");
      if (n && !e.target.closest("button")) { n.classList.remove("is-unread"); var d = n.querySelector(".m-dot"); if (d) d.remove(); }
    });
  });

  window.EG = window.EG || {};
  window.EG.mobile = { toast: toast, icons: icons };
})();
