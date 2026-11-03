/* EG Design System — demo-data.js
   Seeded from https://egerman-upvc.com/
*/
(function (global) {
  "use strict";

  const EG = {
    company: {
      name: {
        ar: "المصرية الألمانية لتصنيع منتجات WPC & PVC",
        en: "Egyptian-German for WPC & PVC Products",
      },
      shortName: { ar: "المصرية الألمانية", en: "Egyptian-German" },
      mark: "EG",
      site: "https://egerman-upvc.com/",
      hotline: "15536",
      phone: "+201555515536",
      whatsapp: "201555515536",
      email: "contact@egerman-upvc.com",
      hours: {
        ar: "من 9ص – 5 م بسعر المكالمة العادية",
        en: "From 9am – 5pm at the price of a regular call",
      },
      address: {
        ar: "الدقهلية، جمصه، المنطقة الصناعية المرحلة الثالثة – جمهورية مصر العربية",
        en: "Dakahlia, Gamasa, Industrial Zone Phase 3 – Arab Republic of Egypt",
      },
      social: {
        facebook:
          "https://www.facebook.com/p/Wpc-upvc-%D8%A7%D9%84%D9%85%D8%B5%D8%B1%D9%8A%D8%A9-%D8%A7%D9%84%D8%A3%D9%84%D9%85%D8%A7%D9%86%D9%8A%D8%A9-%D9%84%D8%B5%D9%86%D8%A7%D8%B9%D8%A9-%D8%A3%D8%A8%D9%88%D8%A7%D8%A8-61570215165479/",
        instagram: "https://www.instagram.com/egerman.upvc",
        youtube: "https://www.youtube.com/@user-eletthad",
        tiktok: "https://www.tiktok.com/@korean.upvc",
        whatsapp: "https://wa.me/201555515536",
      },
    },
    brand: {
      colors: {
        red: "#ED1C24",
        navy: "#0E2F64",
        bg: "#EEEEEE",
        surface: "#FFFFFF",
        ink: "#141414",
      },
      logos: {
        mark: "./assets/images/logo/mark.png",
        wordmark: "./assets/images/logo/wordmark-color.png",
        wordmarkReverse: "./assets/images/logo/wordmark-white.png",
        favicon: "./assets/images/logo/favicon.png",
      },
    },
    vision: {
      ar: "أن نكون الشركة الرائدة في تصنيع منتجات WPC & PVC عبر تقديم حلول مبتكرة ومستدامة للبناء والتشييد.",
      en: "To be the leading company in manufacturing WPC & PVC products by delivering innovative and sustainable construction solutions.",
    },
    mission: {
      ar: "نوفر منتجات بجودة عالية وكفاءة استثنائية تلبي احتياجات عملائنا وتدعم الاستدامة في المشاريع السكنية والتجارية.",
      en: "We provide high-quality, exceptionally efficient products that meet our clients’ needs and support sustainability in residential and commercial projects.",
    },
    products: [
      {
        id: "doors",
        skuSamples: ["D134", "D132"],
        title: { ar: "أبواب من خامة WPC & PVC", en: "WPC & PVC Doors" },
        image: "./assets/images/products/doors.png",
        samplePrice: { ar: "من 7100 ج.م", en: "From 7100 EGP" },
      },
      {
        id: "cladding",
        skuSamples: ["CL-16x280"],
        title: { ar: "تجاليد WPC بديل الخشب", en: "WPC Wood Alternative Cladding" },
        image: "./assets/images/products/cladding.png",
        samplePrice: { ar: "من 250 ج.م", en: "From 250 EGP" },
      },
      {
        id: "foam",
        skuSamples: ["FOAM"],
        title: { ar: "ألواح PVC الفوم بورد", en: "PVC Foam Board Sheets" },
        image: "./assets/images/products/foam.png",
        samplePrice: null,
      },
    ],
    services: [
      "wpc-doors",
      "cladding",
      "foam-board",
      "custom",
      "consulting",
      "shipping",
    ],
    dealers: [{ name: "Al-Adas", market: "Oman", ar: "العدس" }],
    users: [
      { email: "admin@egerman-upvc.com", role: "admin", password: "admin123" },
      { email: "sales@egerman-upvc.com", role: "sales", password: "sales123" },
    ],
  };

  global.EG = EG;
})(typeof window !== "undefined" ? window : globalThis);
