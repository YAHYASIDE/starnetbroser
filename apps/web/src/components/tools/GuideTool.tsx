"use client";

import Link from "next/link";

const SECTIONS: { title: string; items: { text: string; href?: string }[] }[] = [
  {
    title: "✅ كل يوم",
    items: [
      { text: "خطة اليوم: قائمة واحدة بالتجديدات والوعود والديون القديمة والزبائن المتوقفين - أشّر على ما أنجزته.", href: "/tools#today" },
      { text: "دفعة سريعة: ابحث عن الجهاز واكتب المبلغ - يُسجَّل في الجهاز والكاش ويُرسل سند القبض واتساب.", href: "/tools#pay" },
      { text: "وعود الدفع: «سيدفع 5000 يوم الخميس» - تظهر يوم موعدها في التذكيرات وخطة اليوم. من البطاقة: التفاصيل ← 🤝 وعد دفع.", href: "/tools#promises" },
    ],
  },
  {
    title: "📈 المتابعة والأرقام",
    items: [
      { text: "التوقعات: دخل التجديدات القادمة لكل أسبوع، ونسبة الأجهزة النشطة، وكم تحتاج بطاقة Starlink هذا الأسبوع.", href: "/tools#forecast" },
      { text: "الاسترجاع: الزبائن الذين لم يجددوا - رسالة واتساب جاهزة لكل واحد أو للكل.", href: "/tools#winback" },
      { text: "الأهداف: حدد هدف الشهر (تجديدات، زبائن جدد، تحصيل) وتابع هل أنت على المسار.", href: "/tools#goals" },
      { text: "الأفضل: ترتيب المندوبين هذا الشهر وأوفى الزبائن.", href: "/tools#leaders" },
      { text: "المصاريف: مصاريفك حسب الفئة مقارنة بالشهر السابق.", href: "/tools#expenses" },
    ],
  },
  {
    title: "🛠 الترتيب والأدوات",
    items: [
      { text: "فحص البيانات: إيميل أو KIT مكرر، جهاز بدون تاريخ أو زبون أو هاتف، شحنة بخسارة، تجديد تم في Starlink ولم يُسجَّل…", href: "/tools#health" },
      { text: "الأسعار: غيّر السعر الشهري لكل الأجهزة التي تحمله دفعة واحدة (مثلاً تكلفة Starlink من 50$ إلى 55$).", href: "/tools#prices" },
      { text: "حاسبة الربح وعرض السعر (واتساب أو PDF) والرسائل الجماعية بقوالبك الخاصة.", href: "/tools#calculator" },
      { text: "ملاحظات الزبون: في بطاقة كل زبون زر 📝 ملاحظات، مع نسبة وفائه بوعود الدفع.", href: "/clients" },
    ],
  },
  {
    title: "🤖 بوت المالك (اكتب في تيليغرام)",
    items: [
      { text: "خطة · البطاقة · توقعات · وعود · استرجاع · فحص · أهداف · ملخص · الكاش · المتوقفة · تنتهي · كشف <اسم>" },
      { text: "أو اكتب اسم زبون أو جهاز أو هاتف أو KIT لتظهر بطاقته مع زر واتساب." },
      { text: "يصلك تلقائياً: ملخص الصباح (مع الوعود ونقص البطاقة)، ملخص المساء، وملخص الأسبوع كل سبت." },
    ],
  },
  {
    title: "🤝 بوت المندوبين",
    items: [
      { text: "أزرار المندوب: أجهزتي، تنتهي، الموقوفة، ديون زبائني، كشفي، الأيام، دفعة، زبون جديد، تفعيل، بحث، 🤝 وعد دفع." },
      { text: "«وعد 5000 محمد الخميس» يُسجَّل وعداً مباشرة، و«وعودي» يعرض وعود زبائنه." },
      { text: "رمز تطبيق المندوب (المندوبون ← إدارة): يضيف أجهزته ويسجّل دخولها من هاتفه ويرسلها لك جاهزة.", href: "/representatives" },
    ],
  },
];

/** 📖 Where everything is - with a link to each tool. */
export function GuideTool() {
  return (
    <div className="tool-body">
      {SECTIONS.map((section) => (
        <details key={section.title} className="tool-issue" open={section.title.startsWith("✅")}>
          <summary>
            <span className="tool-issue-title">{section.title}</span>
          </summary>
          <ul className="tool-list guide-list">
            {section.items.map((item) => (
              <li key={item.text}>
                {item.href ? (
                  <Link href={item.href} className="tool-link">
                    {item.text}
                  </Link>
                ) : (
                  <span>{item.text}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
