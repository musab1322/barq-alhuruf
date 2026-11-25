import { CATEGORIES, normalize, startsWithLetter } from "@/lib/arabic";

/**
 * التحقق من الإجابات.
 * الطلب: { letter, items: [{ cat: 0..4, answer }] }
 * الرد:  { results: [{ ok, reason? }], ai: boolean }
 * 1) فحص الحرف محلياً (سريع ودقيق).
 * 2) فحص التصنيف بالذكاء الاصطناعي إذا وُجد GROQ_API_KEY أو OPENAI_API_KEY.
 *    إذا فشل الاتصال بالذكاء الاصطناعي تُقبل الإجابات (حتى لا تتعطل اللعبة).
 */

type Item = { cat: number; answer: string };
type Result = { ok: boolean; reason?: string };

const MAX_ITEMS = 60;

function aiConfig() {
  if (process.env.GROQ_API_KEY) {
    return {
      key: process.env.GROQ_API_KEY,
      base: process.env.AI_BASE_URL || "https://api.groq.com/openai/v1",
      model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      key: process.env.OPENAI_API_KEY,
      base: process.env.AI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.AI_MODEL || "gpt-4o-mini",
    };
  }
  return null;
}

// ذاكرة مؤقتة بسيطة حتى لا نسأل عن نفس الكلمة مرتين
const cache = new Map<string, Result>();

async function aiCheck(items: { i: number; cat: number; answer: string }[]): Promise<Map<number, Result> | null> {
  const cfg = aiConfig();
  if (!cfg || !items.length) return null;
  const list = items.map((x) => ({ i: x.i, category: CATEGORIES[x.cat].name, hint: CATEGORIES[x.cat].hint, word: x.answer }));
  const system =
    "أنت حكم في لعبة (إنسان حيوان نبات جماد بلاد). لكل كلمة قرر هل تنتمي فعلاً للتصنيف المطلوب. " +
    "إنسان = اسم علم لشخص (ذكر أو أنثى) من أي لغة أو ثقافة. حيوان = أي كائن حي من الحيوانات أو الطيور أو الأسماك أو الحشرات. " +
    "نبات = أي نبات أو شجرة أو زهرة أو فاكهة أو خضار أو عشب. جماد = أي شيء مادي غير حي (أدوات، أثاث، مواد، أجهزة...). " +
    "بلاد = دولة أو مدينة أو منطقة جغرافية معروفة. كن متسامحاً مع الأخطاء الإملائية البسيطة واللهجات والكلمات المعرّبة، " +
    "وارفض فقط الكلمات التي لا تنتمي للتصنيف بوضوح أو الكلمات غير الموجودة. " +
    'أجب بـ JSON فقط بالشكل: {"results":[{"i":0,"ok":true,"reason":""}]} حيث reason جملة عربية قصيرة جداً عند الرفض.';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(list) },
        ],
      }),
    });
    if (!res.ok) {
      console.error("AI validation failed", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    const out = new Map<number, Result>();
    for (const r of parsed.results || []) {
      if (typeof r?.i === "number") out.set(r.i, { ok: r.ok !== false, reason: r.ok === false ? String(r.reason || "") : undefined });
    }
    return out;
  } catch (e) {
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
    const catName = CATEGORIES[it.cat].name;
    if (!it.answer) results[i] = { ok: false, reason: `خانة ${catName} فاضية` };
    else if (!startsWithLetter(it.answer, letter)) results[i] = { ok: false, reason: `الكلمة في خانة ${catName} لا تبدأ بحرف ${letter}` };
    else {
      const ck = `${it.cat}|${normalize(it.answer)}`;
      const hit = cache.get(ck);
      if (hit) results[i] = hit;
      else {
        results[i] = { ok: true };
        pending.push({ i, ...it });
      }
    }
  });

  const cfg = aiConfig();
  let ai = false;
  if (pending.length && cfg) {
    const out = await aiCheck(pending);
    if (out) {
      ai = true;
      pending.forEach((p) => {
        const r = out.get(p.i);
        if (!r) return;
        const catName = CATEGORIES[p.cat].name;
        const res: Result = r.ok ? { ok: true } : { ok: false, reason: `«${p.answer}» ليست ${catName}${r.reason ? ": " + r.reason : ""}` };
        results[p.i] = res;
        if (cache.size > 5000) cache.clear();
        cache.set(`${p.cat}|${normalize(p.answer)}`, res);
      });
    }
  } else if (cfg) ai = true;

  return Response.json({ results, ai, aiEnabled: !!cfg });
}
