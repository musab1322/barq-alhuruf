import { CATEGORIES, normalize, startsWithLetter, stripAl } from "./arabic";
import { inDictionary } from "./dictionary";

export type Result = { ok: boolean; reason?: string; source?: "rule" | "dict" | "ai" | "unknown" };

/**
 * الفحوصات الثابتة (بدون ذكاء اصطناعي):
 * فاضية، أحرف غير عربية، كلمة قصيرة (حرف واحد)، تكرار نفس الحرف، لا تبدأ بالحرف.
 * يرجع null إذا نجحت الكلمة في كل الفحوصات.
 */
export function ruleCheck(cat: number, answer: string, letter: string): Result | null {
  const name = CATEGORIES[cat].name;
  const a = String(answer || "").trim();
  if (!a) return { ok: false, reason: `خانة ${name} فاضية`, source: "rule" };
  const n = normalize(a);
  if (!/^[ء-ي ]+$/.test(n)) return { ok: false, reason: `اكتب خانة ${name} بالحروف العربية فقط`, source: "rule" };
  const core = stripAl(n).replace(/\s/g, "");
  if (core.length < 2) return { ok: false, reason: `«${a}» في خانة ${name} قصيرة جداً، اكتب كلمة كاملة`, source: "rule" };
  if (/^(.)\1+$/.test(core)) return { ok: false, reason: `«${a}» في خانة ${name} مو كلمة`, source: "rule" };
  if (!startsWithLetter(a, letter)) return { ok: false, reason: `الكلمة في خانة ${name} لا تبدأ بحرف ${letter}`, source: "rule" };
  return null;
}

/** فحص كامل بدون ذكاء اصطناعي: القواعد ثم القاموس */
export function offlineCheck(cat: number, answer: string, letter: string): Result {
  const r = ruleCheck(cat, answer, letter);
  if (r) return r;
  if (inDictionary(cat, answer)) return { ok: true, source: "dict" };
  return unknownResult(cat, answer);
}

export function unknownResult(cat: number, answer: string): Result {
  return { ok: false, reason: `ما عرفنا «${String(answer).trim()}» كـ${CATEGORIES[cat].name}`, source: "unknown" };
}
