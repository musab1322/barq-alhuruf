import { CATEGORIES, normalize } from "@/lib/arabic";
import { inDictionary } from "@/lib/dictionary";
import { ruleCheck, unknownResult, type Result } from "@/lib/validate";

/**
 * التحقق من الإجابات.
 * الطلب: { letter, items: [{ cat: 0..4, answer }] }
 * الرد:  { results: [{ ok, reason? }], ai: boolean, aiEnabled: boolean }
 * 1) قواعد ثابتة: فاضية، حرف واحد، تكرار حرف، أحرف غير عربية، لا تبدأ بالحرف.
 * 2) القاموس المدمج: إذا الكلمة معروفة في تصنيفها تُقبل فوراً.
 * 3) الذكاء الاصطناعي (إذا وُجد GROQ_API_KEY أو OPENAI_API_KEY) يحكم على الكلمات غير الموجودة في القاموس.
 *    بدونه، الكلمة غير المعروفة تُعتبر خطأ (والمضيف يقدر يعتمدها يدوياً من شاشة النتائج).
 */

type Item = { cat: number; answer: string };

const MAX_ITEMS = 60;

function aiConfig() {
  if (process.env.GROQ_API_KEY) {
    return {
      key: process.env.GROQ_API_KEY,
      base: process.env.AI_BASE_URL || "https://api.groq.com/openai/v1",
      model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
      fallbacks: ["llama-3.1-8b-instant", "openai/gpt-oss-120b"],
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      key: process.env.OPENAI_API_KEY,
      base: process.env.AI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.AI_MODEL || "gpt-4o-mini",
      fallbacks: ["gpt-4.1-mini"],
    };
  }
  return null;
}

let workingModel: string | null = null;
let lastError = "";

// ذاكرة مؤقتة حتى لا نسأل عن نفس الكلمة مرتين
const cache = new Map<string, Result>();

async function aiCheck(items: { i: number; cat: number; answer: string }[]): Promise<Map<number, { ok: boolean; reason?: string }> | null> {
  const cfg = aiConfig();
  if (!cfg || !items.length) return null;
  const list = items.map((x) => ({ i: x.i, category: CATEGORIES[x.cat].name, hint: CATEGORIES[x.cat].hint, word: x.answer }));
  const system =
    "أنت حكم صارم وعادل في لعبة (إنسان حيوان نبات جماد بلاد). لكل كلمة قرر هل هي كلمة حقيقية تنتمي فعلاً للتصنيف المطلوب. " +
    "إنسان = اسم علم لشخص (ذكر أو أنثى) من أي لغة أو ثقافة. حيوان = أي حيوان أو طائر أو سمكة أو حشرة. " +
    "نبات = أي نبات أو شجرة أو زهرة أو فاكهة أو خضار أو عشب أو حبوب. جماد = أي شيء مادي غير حي (أدوات، أثاث، مواد، أجهزة، ملابس...). " +
    "بلاد = دولة أو مدينة أو منطقة جغرافية معروفة. تسامح مع الأخطاء الإملائية البسيطة واللهجات الخليجية والكلمات المعرّبة. " +
    "ارفض الكلمات العشوائية أو المخترعة أو غير الموجودة، والكلمات الموجودة لكن في تصنيف آخر (مثلاً: موز في خانة حيوان). " +
    'أجب بـ JSON فقط بالشكل: {"results":[{"i":0,"ok":true,"reason":""}]} حيث reason جملة عربية قصيرة جداً عند الرفض.';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    let res: Response | null = null;
    for (const model of [...new Set([workingModel || cfg.model, cfg.model, ...cfg.fallbacks])]) {
      res = await fetch(`${cfg.base}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key.trim()}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(list) },
          ],
        }),
      });
      if (res.ok) {
        workingModel = model;
        break;
      }
      const txt = (await res.text()).slice(0, 300);
      lastError = `HTTP ${res.status}: ${txt}`;
      console.error("AI validation failed", model, lastError);
      // نجرب نموذج ثاني فقط إذا كانت المشكلة في النموذج نفسه
      if (!(res.status === 404 || res.status === 400) || !/model/i.test(txt)) return null;
    }
    if (!res || !res.ok) return null;
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    const out = new Map<number, { ok: boolean; reason?: string }>();
    for (const r of parsed.results || []) {
      if (typeof r?.i === "number") out.set(r.i, { ok: r.ok === true, reason: r.ok === true ? undefined : String(r.reason || "") });
    }
    return out;
  } catch (e) {
    lastError = String(e).slice(0, 200);
    console.error("AI validation error", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  let body: { letter?: string; items?: Item[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const letter = String(body.letter || "").slice(0, 2);
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, MAX_ITEMS).map((x) => ({
    cat: Math.max(0, Math.min(CATEGORIES.length - 1, Number(x?.cat) || 0)),
    answer: String(x?.answer || "").trim().slice(0, 40),
  }));
  if (!letter) return Response.json({ error: "letter required" }, { status: 400 });

  const results: Result[] = [];
  const pending: { i: number; cat: number; answer: string }[] = [];
  items.forEach((it, i) => {
    const rule = ruleCheck(it.cat, it.answer, letter);
    if (rule) results[i] = rule;
    else if (inDictionary(it.cat, it.answer)) results[i] = { ok: true, source: "dict" };
    else {
      const hit = cache.get(`${it.cat}|${normalize(it.answer)}`);
      if (hit) results[i] = hit;
      else {
        results[i] = unknownResult(it.cat, it.answer);
        pending.push({ i, ...it });
      }
    }
  });

  const cfg = aiConfig();
  let ai = !!cfg;
  if (pending.length && cfg) {
    const out = await aiCheck(pending);
    if (!out) ai = false;
    else {
      pending.forEach((p) => {
        const r = out.get(p.i);
        if (!r) return;
        const catName = CATEGORIES[p.cat].name;
        const res: Result = r.ok
          ? { ok: true, source: "ai" }
          : { ok: false, source: "ai", reason: `«${p.answer}» ليست ${catName}${r.reason ? ": " + r.reason : ""}` };
        results[p.i] = res;
        if (cache.size > 5000) cache.clear();
        cache.set(`${p.cat}|${normalize(p.answer)}`, res);
      });
    }
  }

  return Response.json({ results, ai, aiEnabled: !!cfg });
}

// حالة التحقق الذكي: GET /api/validate  (أضف ?test=1 لتجربة فعلية على كلمتين)
let selfTest: { at: number; ok: boolean; detail: string } | null = null;

export async function GET(req: Request) {
  const cfg = aiConfig();
  const provider = process.env.GROQ_API_KEY ? "groq" : process.env.OPENAI_API_KEY ? "openai" : null;
  const wantTest = new URL(req.url).searchParams.has("test");
  if (cfg && wantTest && (!selfTest || !selfTest.ok || Date.now() - selfTest.at > 10 * 60 * 1000)) {
    const out = await aiCheck([
      { i: 0, cat: 1, answer: "موز" },
      { i: 1, cat: 1, answer: "ماعز" },
    ]);
    selfTest = out
      ? { at: Date.now(), ok: out.get(0)?.ok === false && out.get(1)?.ok === true, detail: `موز كحيوان=${out.get(0)?.ok} ، ماعز كحيوان=${out.get(1)?.ok}` }
      : { at: Date.now(), ok: false, detail: `فشل الاتصال بخدمة الذكاء الاصطناعي: ${lastError}` };
  }
  return Response.json({ aiEnabled: !!cfg, provider, model: workingModel || cfg?.model || null, selfTest });
}
