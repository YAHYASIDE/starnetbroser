/**
 * ⚠️ The dish's alerts as Starlink shows them under «الأجهزة» (read by the sync, in English), turned
 * into Arabic the operator reads at a glance: what's wrong and what to do. An alert the app doesn't
 * know yet is shown as Starlink wrote it. Pure.
 */

export interface DishAlertView {
  icon: string;
  title: string;
  advice?: string;
  /** Starlink's own words. */
  original: string;
}

const KNOWN: { test: RegExp; icon: string; title: string; advice?: string }[] = [
  { test: /obstruct|محجوب|عائق|عوائق/i, icon: "🌳", title: "الطبق محجوب جزئياً عن السماء", advice: "ضعه في مكان مكشوف من كل الجهات (بعيداً عن الأشجار والجدران)." },
  { test: /priority data|باقة الأولوية/i, icon: "🐢", title: "نفدت باقة الأولوية - السرعة محدودة", advice: "يعمل بسرعة محدودة حتى الدورة القادمة، أو أضف بيانات أولوية." },
  { test: /moving too fast|while stationary|الحركة/i, icon: "🚗", title: "متوقف لأنه يتحرك", advice: "يعمل من جديد عندما يتوقف (الخطة لا تسمح بالحركة)." },
  { test: /outside|home country|region|البلد|خارج/i, icon: "🌍", title: "مقيّد - خارج البلد المسجّل", advice: "أعده إلى البلد المسجّل ووصّله بالكهرباء 24 ساعة." },
  { test: /overheat|too hot|thermal|ساخن|حرارة/i, icon: "🔥", title: "الطبق ساخن جداً - الأداء منخفض", advice: "يعود طبيعياً عندما يبرد." },
  { test: /snow|heat(ing)? to melt|ثلج/i, icon: "❄️", title: "يسخّن لإذابة الثلج" },
  { test: /reboot|restart|software update|update (is )?(ready|pending)|إعادة التشغيل|تحديث/i, icon: "🔄", title: "يحتاج إعادة تشغيل أو تحديث برنامج", advice: "اضغط «Reboot» في صفحة الجهاز أو افصل الكهرباء وأعدها." },
  { test: /ethernet|cable|كابل/i, icon: "🔌", title: "مشكلة في الكابل", advice: "تأكد من توصيل الكابل جيداً وأنه سليم." },
  { test: /power|voltage|كهرباء|الطاقة/i, icon: "⚡", title: "مشكلة في الكهرباء", advice: "تأكد من مصدر الكهرباء والمحوّل." },
  { test: /offline|not connected|disconnected|غير متصل/i, icon: "📴", title: "الطبق غير متصل" },
  { test: /motor|tilt|mast|vertical|مائل|المحرك/i, icon: "📐", title: "الطبق مائل أو المحرك عالق", advice: "ثبّت الطبق مستقيماً وتأكد أنه حر الحركة." },
  { test: /location|الموقع/i, icon: "📍", title: "الطبق في موقع غير متوقع", advice: "تحقق من عنوان الخدمة في Starlink." },
];

export function describeDishAlert(original: string): DishAlertView {
  const known = KNOWN.find((k) => k.test.test(original));
  return known ? { icon: known.icon, title: known.title, ...(known.advice ? { advice: known.advice } : {}), original } : { icon: "⚠️", title: original, original };
}

export function describeDishAlerts(alerts: string[] | undefined): DishAlertView[] {
  return (alerts ?? []).filter((a) => a.trim()).map(describeDishAlert);
}
