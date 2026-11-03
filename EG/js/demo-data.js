/* EG Design System — demo-data.js
   Facts sourced from egerman-upvc.com (pages + printed catalogs, checked Nov 2026).
   Anything under `demo` is invented sample data for prototypes, not company records. */
(function (global) {
  "use strict";

  const EG = {
    company: {
      name: { ar: "المصرية الألمانية لتصنيع منتجات WPC & PVC", en: "Egyptian-German for WPC & PVC Products" },
      shortName: { ar: "المصرية الألمانية", en: "Egyptian-German" },
      tagline: { ar: "باب أهل مصر", en: "The door of Egypt's people" }, /* printed on door catalog footer */
      mark: "EG",
      site: "https://egerman-upvc.com/",
      altSite: "www.EGerman-pvc.com", /* printed on catalogs */
      hotline: "15536",
      phone: "+201555515536",
      whatsapp: "201555515536",
      email: "contact@egerman-upvc.com",
      hours: { ar: "من 9ص – 5م بسعر المكالمة العادية", en: "9am – 5pm at regular call rate" },
      address: {
        ar: "الدقهلية، جمصة، المنطقة الصناعية المرحلة الثالثة – جمهورية مصر العربية",
        en: "Dakahlia, Gamasa, Industrial Zone Phase 3 – Arab Republic of Egypt",
      },
      geo: { lat: 31.439146, lng: 31.48027 },
      social: {
        facebook: "https://www.facebook.com/p/Wpc-upvc-%D8%A7%D9%84%D9%85%D8%B5%D8%B1%D9%8A%D8%A9-%D8%A7%D9%84%D8%A3%D9%84%D9%85%D8%A7%D9%86%D9%8A%D8%A9-%D9%84%D8%B5%D9%86%D8%A7%D8%B9%D8%A9-%D8%A3%D8%A8%D9%88%D8%A7%D8%A8-61570215165479/",
        instagram: "https://www.instagram.com/egerman.upvc",
        youtube: "https://www.youtube.com/@user-eletthad",
        tiktok: "https://www.tiktok.com/@korean.upvc",
        whatsapp: "https://wa.me/201555515536",
      },
    },
    brand: {
      colors: { red: "#ED1C24", navy: "#012864", glass: "#345383", bg: "#EEEEEE", surface: "#FFFFFF", ink: "#141414" },
    },
    /* Counters on the live site (final values; the page shows "1" until the animation runs). Unverified claims. */
    stats: [
      { value: 25, suffix: "+", label: { ar: "سنوات من الخبرة", en: "Years of experience" } },
      { value: 100, suffix: "+", label: { ar: "عامل مؤهل", en: "Skilled workers" } },
      { value: 5000, suffix: "", label: { ar: "عميل راضٍ", en: "Satisfied clients" } },
      { value: 500, suffix: "", label: { ar: "مشروع", en: "Projects" } },
    ],
    certifications: [
      { id: "iso14001", label: { ar: "ISO 14001", en: "ISO 14001" }, image: "./assets/images/badges/badge-1.png" },
      { id: "iso9001", label: { ar: "ISO 9001", en: "ISO 9001" }, image: "./assets/images/badges/badge-2.png" },
      { id: "made-in-egypt", label: { ar: "علامة الجودة – صنع في مصر", en: "Made in Egypt quality mark" }, image: "./assets/images/badges/badge-3.png" },
    ],
    values: [
      { ar: "الجودة العالية", en: "High quality" },
      { ar: "الابتكار", en: "Innovation" },
      { ar: "الاستدامة", en: "Sustainability" },
      { ar: "الاحترافية", en: "Professionalism" },
    ],
    /* Shared across doors, cladding and foam board (printed color catalog) */
    finishes: [
      ["C132", "#7f6750"], ["C160", "#c5b4a0"], ["C021", "#7e766b"], ["C198", "#ebdecb"],
      ["C182", "#604031"], ["C115", "#cfcfcf"], ["C091", "#777777"], ["C173", "#a39889"],
      ["C102", "#534034"], ["C3003", "#f2f2f2"], ["C8001", "#e8e8e8"],
    ].map(([code, hex]) => ({ code, hex })),
    benefits: [
      { icon: "leaf", ar: "صديق للبيئة", en: "Environmentally friendly" },
      { icon: "flameoff", ar: "لا يساعد على الاشتعال", en: "Non-flammable" },
      { icon: "bugoff", ar: "مانع للحشرات", en: "Insect repellent" },
      { icon: "volumeoff", ar: "كاتم للصوت", en: "Silencer" },
      { icon: "dropoff", ar: "لا يتأثر بالماء", en: "Not affected by water" },
      { icon: "palette", ar: "تنوع في الألوان", en: "Wide range of colors" },
      { icon: "brushoff", ar: "لا يحتاج دهان", en: "No painting needed" },
      { icon: "wrench", ar: "سهل التركيب", en: "Easy installation" },
      { icon: "sparkle", ar: "سهل التنظيف", en: "Easy to clean" },
    ],
    products: [
      {
        id: "doors",
        title: { ar: "أبواب WPC & PVC", en: "WPC & PVC Doors" },
        image: "./assets/images/products/doors.png",
        unit: "pcs",
        /* catalog: four sizes, height 215 cm; leaf 4.5 cm, single piece, no filling */
        sizes: [{ w: 110, h: 215 }, { w: 100, h: 215 }, { w: 90, h: 215 }, { w: 80, h: 215 }],
        thicknessCm: 4.5,
        skuSamples: ["D134", "D132"], /* from earlier site scrape */
      },
      {
        id: "cladding",
        title: { ar: "تجاليد WPC بديل الخشب", en: "WPC Wood-Alternative Cladding" },
        image: "./assets/images/products/cladding.png",
        unit: "pcs",
        sizes: [{ w: 17, h: 280 }], /* catalog prints 17 × 280 cm */
        skuSamples: ["K71-1", "K71-2", "K71-3", "K71-4", "K71-5"],
      },
      {
        id: "foam",
        title: { ar: "ألواح PVC فوم بورد", en: "PVC Foam Board" },
        image: "./assets/images/products/foam.png",
        unit: "sheet",
        sizes: [{ w: 122, h: 244 }],
        thicknessMm: [4.5, 6, 8, 10, 12, 14, 17],
        skuSamples: ["FOAM-6MM"],
      },
    ],
    news: [
      { ar: "زيارة السفير المصري في سلطنة عُمان لوكيل المصنع الكوري", en: "Egyptian Ambassador to Oman visits the factory's agent" },
      { ar: "معرض منتجات مصانع المنطقة الصناعية بجمصة", en: "Gamasa industrial zone products exhibition" },
    ],
    dealers: [{ name: "Al-Adas", ar: "العدس", market: "Oman" }],

    /* ── demo: invented rows for tables / dashboards ── */
    demo: {
      orders: [
        { id: "SO-1042", customer: "العدس – سلطنة عُمان", total: 184500, status: "confirmed", date: "2026-10-28" },
        { id: "SO-1043", customer: "مقاولات النيل", total: 62300, status: "production", date: "2026-10-29" },
        { id: "SO-1044", customer: "معرض الدلتا للأبواب", total: 21300, status: "shipped", date: "2026-10-30" },
        { id: "SO-1045", customer: "م. أحمد سمير", total: 7100, status: "draft", date: "2026-11-01" },
        { id: "SO-1046", customer: "شركة التعمير", total: 98750, status: "cancelled", date: "2026-11-02" },
      ],
      stock: [
        { sku: "D134-C132-90", name: "باب D134 · C132 · 90 سم", qty: 42, min: 20 },
        { sku: "K71-3", name: "تجليد K71-3 · 17×280", qty: 8, min: 30 },
        { sku: "FOAM-6MM-C8001", name: "فوم بورد 6 مم · C8001", qty: 0, min: 15 },
      ],
      users: [
        { email: "admin@egerman-upvc.com", role: "admin", password: "admin123" },
        { email: "sales@egerman-upvc.com", role: "sales", password: "sales123" },
      ],
    },
  };

  global.EG = Object.assign(global.EG || {}, EG);
})(typeof window !== "undefined" ? window : globalThis);
