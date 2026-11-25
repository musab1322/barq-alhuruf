// أدوات اللغة العربية: توحيد الكتابة والتحقق من الحرف

export const ALL_LETTERS = "ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي".split(" ");
export const HARD_LETTERS = ["ث", "ذ", "ض", "ظ", "غ"];

export const CATEGORIES = [
  { key: "human", name: "إنسان", hint: "اسم ذكر أو أنثى", emoji: "🧑" },
  { key: "animal", name: "حيوان", hint: "أي حيوان أو طائر أو حشرة", emoji: "🐪" },
  { key: "plant", name: "نبات", hint: "شجر، فاكهة، خضار، زهور", emoji: "🌴" },
  { key: "object", name: "جماد", hint: "أي شيء غير حي", emoji: "🪨" },
  { key: "country", name: "بلاد", hint: "دولة أو مدينة", emoji: "🌍" },
] as const;

/** توحيد الكتابة: إزالة التشكيل والتطويل، توحيد الهمزات والتاء المربوطة والألف المقصورة */
export function normalize(s: string): string {
  return String(s || "")
    .trim()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** إزالة "ال" التعريف من بداية الكلمة */
export function stripAl(s: string): string {
  return s.startsWith("ال") && s.length > 3 ? s.slice(2) : s;
}

/** القاعدة: الكلمة تبدأ بالحرف، أو تبدأ به بعد حذف "ال" التعريف (مثل: الأردن لحرف الألف، الليمون لحرف اللام) */
export function startsWithLetter(answer: string, letter: string): boolean {
  const a = normalize(answer);
  const l = normalize(letter);
  if (!a) return false;
  return a.startsWith(l) || stripAl(a).startsWith(l);
}

/** مفتاح المقارنة لاكتشاف الإجابات المكررة */
export function compareKey(answer: string): string {
  return stripAl(normalize(answer)).replace(/\s/g, "");
}
