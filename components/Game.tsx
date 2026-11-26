"use client";

import confetti from "canvas-confetti";
import {
  Check,
  CheckCircle2,
  Copy,
  Crown,
  Flag,
  Hourglass,
  Loader2,
  LogIn,
  Medal,
  Play,
  Plus,
  RotateCcw,
  Share2,
  Sparkles,
  MessageCircle,
  Send,
  Timer,
  Tv,
  Trophy,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { CATEGORIES, HARD_LETTERS } from "@/lib/arabic";
import { Engine } from "@/lib/engine";
import { finishRuleText, fmtTime, scoreRound, standings } from "@/lib/scoring";
import { sounds } from "@/lib/sound";
import type { GameState, RoundRecord } from "@/lib/types";
import Credit from "./Credit";
import Display from "./Display";

// ---------- الجذر ----------
export default function Game() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const e = new Engine();
    setEngine(e);
    const un = e.subscribe(force);
    // شاشة العرض، أو الرجوع التلقائي لنفس الغرفة بعد تحديث الصفحة
    const p = new URLSearchParams(location.search);
    const r = p.get("r");
    const local = p.has("local");
    if (r && p.has("screen")) e.watch(r, local);
    else if (r && e.myName && e.savedRoom() === r) e.join(r, local);
    return () => {
      un();
    };
  }, []);
  if (!engine) return <Shell><div className="py-20 text-center text-white/70"><Loader2 className="mx-auto animate-spin" /></div></Shell>;
  return (
    <Shell>
      <Screen e={engine} />
      {engine.S && engine.room && !engine.viewer && !engine.kicked && <Chat e={engine} S={engine.S} />}
      <Toasts e={engine} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,#7c3aed_0,transparent_45%),radial-gradient(circle_at_100%_100%,#f97316_0,transparent_40%),linear-gradient(160deg,#1e1b4b,#0f172a)] px-4 py-6 text-slate-800">
      <div className="mx-auto max-w-3xl">{children}</div>
      <Credit />
    </div>
  );
}

function Screen({ e }: { e: Engine }) {
  if (e.viewer) return <Display e={e} />;
  if (e.kicked)
    return (
      <>
        <Logo />
        <div className={`${card} text-center`}>
          <h2 className="text-xl font-black">دخلت بنفس الاسم من جهاز ثاني 📱</h2>
          <p className="mt-2 text-slate-500">لاعبك ونقاطك انتقلت للجهاز الثاني.</p>
          <button className={`${btnMain} mt-4`} onClick={() => e.leave()}>
            الرئيسية
          </button>
        </div>
      </>
    );
  if (!e.room) return <Home e={e} />;
  if (!e.S) return <Joining e={e} />;
  switch (e.S.phase) {
    case "lobby":
      return <Lobby e={e} S={e.S} />;
    case "playing":
      return <Playing e={e} S={e.S} r={e.currentRound()!} />;
    case "closing":
      return <Closing r={e.currentRound()!} />;
    case "results":
      return <Results e={e} S={e.S} r={e.currentRound()!} />;
    case "final":
      return <Final e={e} S={e.S} />;
  }
}

// ---------- مكونات صغيرة ----------
const card = "rounded-3xl bg-white p-5 shadow-2xl shadow-black/30 sm:p-6";
const btn =
  "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-lg font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";
const btnMain = `${btn} bg-gradient-to-l from-amber-400 to-orange-500 text-slate-900 shadow-lg shadow-orange-500/30 hover:brightness-110`;
const btnGhost = `${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`;
const input =
  "w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-lg outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100";

function Logo({ small }: { small?: boolean }) {
  return (
    <div className={`text-center text-white ${small ? "mb-4" : "mb-7 mt-4"}`}>
      <h1 className={`font-black leading-tight ${small ? "text-2xl" : "text-3xl sm:text-5xl"}`}>
        <span className="inline-block animate-[bounce_2s_infinite]">🌴</span> إنسان <span className="text-amber-400">حيوان</span> نبات{" "}
        <span className="text-orange-400">جماد</span> بلاد
      </h1>
      {!small && <p className="mt-2 text-white/70">العبها مع أصحابك لحظياً من أي جهاز</p>}
    </div>
  );
}

function LetterBadge({ letter, size = "lg" }: { letter: string; size?: "lg" | "sm" }) {
  return (
    <div
      key={letter}
      className={`flex shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 font-black text-white shadow-xl shadow-rose-500/40 animate-[pop_.6s_ease] ${
        size === "lg" ? "h-24 w-24 text-6xl sm:h-28 sm:w-28 sm:text-7xl" : "h-14 w-14 text-3xl"
      }`}
    >
      {letter}
    </div>
  );
}

function PlayerChips({ e, S, scores }: { e: Engine; S: GameState; scores?: boolean }) {
  const st = scores ? Object.fromEntries(standings(S).map((x) => [x.id, x.total])) : {};
  return (
    <div className="flex flex-wrap gap-2">
      {S.order.map((id) => {
        const on = e.online.includes(id);
        return (
          <span key={id} className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-bold ${on ? "bg-violet-100 text-violet-900" : "bg-slate-100 text-slate-400"}`}>
            <span className={`h-2 w-2 rounded-full ${on ? "bg-emerald-500" : "bg-slate-300"}`} />
            {id === S.hostId && <Crown className="h-4 w-4 text-amber-500" />}
            {S.players[id]?.name}
            {id === e.myId && <span className="text-xs font-medium opacity-60">(أنت)</span>}
            {scores && <span className="mr-1 rounded-full bg-white px-2 text-sm">{st[id] ?? 0}</span>}
          </span>
        );
      })}
    </div>
  );
}

function Toasts({ e }: { e: Engine }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4">
      {e.toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-[slideup_.3s_ease] rounded-2xl px-5 py-3 font-bold text-white shadow-xl ${
            t.kind === "success" ? "bg-emerald-600" : t.kind === "error" ? "bg-rose-600" : "bg-slate-900"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------- الشاشة الرئيسية ----------
function Home({ e }: { e: Engine }) {
  const params = typeof window !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
  const linkRoom = params.get("r");
  const local = params.has("local");
  const [name, setName] = useState(e.myName);
  const [code, setCode] = useState("");
  const ok = () => {
    if (!name.trim()) {
      e.toast("اكتب اسمك أول ✍️", "error");
      return false;
    }
    sounds.unlock();
    e.setName(name);
    return true;
  };
  const joinCode = (c: string) => {
    const clean = c.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
    if (clean.length !== 5) return e.toast("رمز الغرفة ٥ أرقام", "error");
    if (ok()) e.join(clean, local);
  };
  return (
    <>
      <Logo />
      <div className={card}>
        <label className="mb-2 block font-bold">اسمك</label>
        <input
          className={input}
          value={name}
          maxLength={20}
          placeholder="اكتب اسمك"
          onChange={(x) => setName(x.target.value)}
          onKeyDown={(x) => x.key === "Enter" && (linkRoom ? joinCode(linkRoom) : ok() && e.create(local))}
        />
        <div className="mt-5 space-y-3">
          {linkRoom && (
            <button className={`${btnMain} w-full`} onClick={() => joinCode(linkRoom)}>
              <LogIn className="h-5 w-5" /> دخول الغرفة {linkRoom}
            </button>
          )}
          <button className={`${linkRoom ? btnGhost : btnMain} w-full`} onClick={() => ok() && e.create(local)}>
            <Sparkles className="h-5 w-5" /> إنشاء غرفة جديدة
          </button>
        </div>
        {!linkRoom && (
          <>
            <div className="my-5 flex items-center gap-3 text-slate-400">
              <div className="h-px flex-1 bg-slate-200" /> أو ادخل غرفة صديقك <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="flex gap-2">
              <input
                className={`${input} text-center tracking-[.4em]`}
                dir="ltr"
                inputMode="numeric"
                maxLength={5}
                placeholder="12345"
                value={code}
                onChange={(x) => setCode(x.target.value)}
                onKeyDown={(x) => x.key === "Enter" && joinCode(code)}
              />
              <button className={`${btn} bg-emerald-500 text-white`} onClick={() => joinCode(code)}>
                دخول
              </button>
            </div>
          </>
        )}
      </div>
      <div className={`${card} mt-4`}>
        <h2 className="mb-3 text-xl font-black">طريقة اللعب</h2>
        <ul className="list-disc space-y-1.5 pr-5 text-slate-600">
          <li>كل جولة يظهر حرف عشوائي (ما يتكرر)، واكتب كلمة تبدأ فيه بكل خانة.</li>
          <li>لكل خانة تقدر تكتب إجابة ثانية للمتعة، بس ما تنحسب لها نقاط.</li>
          <li>اضغط <b>انتهيت</b>: نتحقق إن كل كلمة تبدأ بالحرف وإنها من التصنيف الصحيح. لو فيه خطأ تعدله وتحاول مرة ثانية.</li>
          <li>الجولة تنتهي عند أول لاعبين ينهون (أو أول لاعب إذا كنتم اثنين)، أو عند انتهاء الوقت.</li>
          <li>النقاط: ١٠ للإجابة الفريدة، ٥ للمكررة، و٠ للفاضية أو الغلط. عند التعادل يتقدم الأسرع.</li>
          <li>"ال" التعريف ما تنحسب: «الأردن» تصلح لحرف الألف، و«الليمون» لحرف اللام.</li>
        </ul>
      </div>
    </>
  );
}

function Joining({ e }: { e: Engine }) {
  return (
    <>
      <Logo />
      <div className={`${card} text-center`}>
        {e.joinFailed ? (
          <>
            <XCircle className="mx-auto mb-3 h-12 w-12 text-rose-500" />
            <h2 className="text-xl font-black">ما لقينا الغرفة {e.room}</h2>
            <p className="mt-2 text-slate-500">تأكد من الرمز، أو إن صاحب الغرفة فاتح الصفحة.</p>
            <div className="mt-5 flex justify-center gap-2">
              <button className={btnMain} onClick={() => e.join(e.room!, e.local)}>
                <RotateCcw className="h-5 w-5" /> حاول مرة ثانية
              </button>
              <button className={btnGhost} onClick={() => e.leave()}>
                الرئيسية
              </button>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-orange-500" />
            <h2 className="text-xl font-black">جاري الدخول للغرفة {e.room}…</h2>
          </>
        )}
      </div>
    </>
  );
}

// ---------- صالة الانتظار ----------
function Lobby({ e, S }: { e: Engine; S: GameState }) {
  const host = e.isHost();
  const link = typeof window !== "undefined" ? `${location.origin}${location.pathname}?r=${e.room}${e.local ? "&local=1" : ""}` : "";
  const st = S.settings;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      e.toast("تم نسخ الرابط ✅", "success");
    } catch {
      prompt("انسخ الرابط:", link);
    }
  };
  return (
    <>
      <Logo small />
      <div className={card}>
        <p className="text-center text-slate-500">رمز الغرفة</p>
        <div dir="ltr" className="my-2 rounded-2xl bg-gradient-to-l from-violet-100 to-orange-100 py-3 text-center text-5xl font-black tracking-[.3em] text-violet-900">
          {e.room}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={`${btnGhost} flex-1`} onClick={copy}>
            <Copy className="h-5 w-5" /> نسخ رابط الدعوة
          </button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              className={`${btnGhost} flex-1`}
              onClick={() => navigator.share({ title: "إنسان حيوان نبات جماد بلاد", text: `تعال العب معي! رمز الغرفة ${e.room}`, url: link }).catch(() => {})}
            >
              <Share2 className="h-5 w-5" /> مشاركة
            </button>
          )}
          <a className={`${btnGhost} flex-1`} href={`${link}&screen=1`} target="_blank" rel="noreferrer">
            <Tv className="h-5 w-5" /> شاشة العرض
          </a>
        </div>
        <p className="mt-2 text-center text-sm text-slate-400">افتح «شاشة العرض» على التلفزيون أو البروجكتر: تعرض الحرف والوقت والنتائج للكل.</p>
        <AiBadge />
        <div className="hidden">
        </div>
      </div>

      <div className={`${card} mt-4`}>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-black">
          <Users className="h-6 w-6 text-violet-600" /> اللاعبين ({S.order.length})
        </h2>
        <PlayerChips e={e} S={S} />
      </div>

      <div className={`${card} mt-4`}>
        <h2 className="mb-3 text-xl font-black">
          الإعدادات {!host && <span className="text-sm font-medium text-slate-400">(يحددها المضيف)</span>}
        </h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <span key={c.key} className="rounded-full bg-slate-100 px-3 py-1.5 font-bold">
              {c.emoji} {c.name}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block font-bold">عدد الجولات</span>
            <select className={input} disabled={!host} value={st.rounds} onChange={(x) => e.updateSettings({ rounds: +x.target.value })}>
              {[3, 5, 7, 10, 15].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-bold">أقصى وقت للجولة</span>
            <select className={input} disabled={!host} value={st.time} onChange={(x) => e.updateSettings({ time: +x.target.value })}>
              {[60, 90, 120, 180, 300].map((n) => (
                <option key={n} value={n}>
                  {n >= 120 ? `${n / 60} دقائق` : `${n} ثانية`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2">
          <input type="checkbox" className="h-5 w-5 accent-orange-500" disabled={!host} checked={st.hardOff} onChange={(x) => e.updateSettings({ hardOff: x.target.checked })} />
          استبعاد الحروف الصعبة ({HARD_LETTERS.join(" ")})
        </label>
        <label className="mt-4 block">
          <span className="mb-1 block font-bold">تنتهي الجولة عند</span>
          <select className={input} disabled={!host} value={st.finishers ?? 0} onChange={(x) => e.updateSettings({ finishers: +x.target.value })}>
            <option value={0}>تلقائي (أول لاعب إذا كنتم ٢، وأول لاعبين إذا ٣ أو أكثر)</option>
            <option value={1}>أول لاعب ينهي</option>
            <option value={2}>أول لاعبين ينهون</option>
            <option value={3}>أول ٣ لاعبين</option>
            <option value={4}>أول ٤ لاعبين</option>
            <option value={5}>أول ٥ لاعبين</option>
            <option value={-1}>كل اللاعبين ينهون (أو ينتهي الوقت)</option>
          </select>
        </label>
      </div>

      <div className="mt-4">
        {host ? (
          <>
            <button className={`${btnMain} w-full py-4 text-xl`} onClick={() => e.startGame()}>
              <Play className="h-6 w-6" /> بدء اللعبة
            </button>
            {S.order.length < 2 && <p className="mt-2 text-center text-sm text-white/60">تقدر تبدأ لحالك للتجربة، بس اللعب أحلى مع أصحابك 😄</p>}
          </>
        ) : (
          <div className={`${card} flex items-center justify-center gap-2 text-slate-500`}>
            <Hourglass className="h-5 w-5 animate-pulse" /> بانتظار المضيف يبدأ اللعبة…
          </div>
        )}
      </div>
    </>
  );
}

// ---------- الجولة ----------
function Stopwatch({ e, r, frozen }: { e: Engine; r: RoundRecord; frozen?: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = e.now();
      const el = Math.max(0, now - r.startedAt);
      if (ref.current) ref.current.textContent = now < r.startedAt ? "جاهز…" : fmtTime(frozen ?? el);
      const total = r.endsAt - r.startedAt;
      const left = Math.max(0, Math.min(total, r.endsAt - now));
      if (barRef.current) barRef.current.style.width = `${(left / total) * 100}%`;
      if (leftRef.current) {
        const s = Math.ceil(left / 1000);
        leftRef.current.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        leftRef.current.className = s <= 10 ? "font-black text-rose-600 animate-pulse" : "font-bold text-slate-500";
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [e, r, frozen]);
  return (
    <div className="flex-1">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Timer className="h-4 w-4" /> وقتك
      </div>
      <span ref={ref} dir="ltr" className="block font-mono text-3xl font-black tabular-nums sm:text-4xl" />
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div ref={barRef} className="h-full rounded-full bg-gradient-to-l from-emerald-400 via-amber-400 to-rose-500" />
      </div>
      <div className="mt-1 text-sm">
        الوقت المتبقي: <span ref={leftRef} dir="ltr" />
      </div>
    </div>
  );
}

function Playing({ e, S, r }: { e: Engine; S: GameState; r: RoundRecord }) {
  const d = e.draft(r);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [showExtra, setShowExtra] = useState<Record<number, boolean>>({});
  const mine = r.finishers.find((f) => f.id === e.myId);
  const inRound = r.participants.includes(e.myId);
  const locked = !!mine || busy;
  useEffect(() => setErrors([]), [r.id]);

  const onFinish = async () => {
    setBusy(true);
    setErrors([]);
    const errs = await e.finish();
    setErrors(errs);
    setBusy(false);
  };

  return (
    <>
      <div className={`${card} flex items-center gap-4`}>
        <LetterBadge letter={r.letter} />
        <Stopwatch e={e} r={r} frozen={mine?.elapsedMs ?? null} />
        <div className="hidden text-center sm:block">
          <div className="text-sm text-slate-500">الجولة</div>
          <div className="text-2xl font-black">
            {r.no}/{S.settings.rounds}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-white/10 px-4 py-2 text-center text-sm text-white">
        تنتهي الجولة عند {finishRuleText(r.needed, r.participants.length)} ·{" "}
        {r.finishers.length ? (
          <span className="font-bold">
            أنهى:{" "}
            {r.finishers.map((f) => `${S.players[f.id]?.name} (${fmtTime(f.elapsedMs)})`).join("، ")}
          </span>
        ) : (
          "ما أحد أنهى للحين"
        )}
      </div>

      {!inRound ? (
        <div className={`${card} mt-4 text-center text-slate-500`}>دخلت في نص الجولة، بتلعب من الجولة الجاية 👀</div>
      ) : (
        <div className={`${card} mt-4 space-y-4`}>
          {CATEGORIES.map((c, i) => (
            <CategoryField
              key={`${r.id}-${i}`}
              i={i}
              letter={r.letter}
              cat={c}
              main={d.main[i]}
              extra={d.extra[i]}
              locked={locked}
              showExtra={!!showExtra[i] || !!d.extra[i]}
              onShowExtra={() => setShowExtra((s) => ({ ...s, [i]: true }))}
              onChange={(field, v) => e.setDraft(field, i, v)}
            />
          ))}

          {errors.length > 0 && (
            <div className="animate-[shake_.4s_ease] rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 text-rose-700">
              <div className="mb-1 flex items-center gap-2 font-black">
                <XCircle className="h-5 w-5" /> يوجد أخطاء، عدّلها واضغط انتهيت مرة ثانية:
              </div>
              <ul className="list-disc pr-6">
                {errors.map((x, k) => (
                  <li key={k}>{x}</li>
                ))}
              </ul>
            </div>
          )}

          {mine ? (
            <div className="rounded-2xl bg-emerald-50 p-4 text-center font-bold text-emerald-700">
              <CheckCircle2 className="mx-auto mb-1 h-8 w-8" />
              أنهيت في {fmtTime(mine.elapsedMs)} ثانية 🎉 بانتظار باقي اللاعبين…
            </div>
          ) : (
            <button className={`${btn} w-full bg-gradient-to-l from-emerald-500 to-teal-500 py-4 text-xl text-white shadow-lg shadow-emerald-500/30`} disabled={busy} onClick={onFinish}>
              {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Flag className="h-6 w-6" />}
              {busy ? "جاري التحقق…" : "انتهيت!"}
            </button>
          )}
        </div>
      )}

      <div className={`${card} mt-4`}>
        <PlayerChips e={e} S={S} scores />
      </div>
    </>
  );
}

function CategoryField(p: {
  i: number;
  letter: string;
  cat: (typeof CATEGORIES)[number];
  main: string;
  extra: string;
  locked: boolean;
  showExtra: boolean;
  onShowExtra: () => void;
  onChange: (f: "main" | "extra", v: string) => void;
}) {
  const [main, setMain] = useState(p.main);
  const [extra, setExtra] = useState(p.extra);
  return (
    <div>
      <label className="mb-1.5 flex items-center justify-between font-bold">
        <span className="text-lg">
          {p.cat.emoji} {p.cat.name} <span className="text-sm font-medium text-slate-400">· {p.cat.hint}</span>
        </span>
      </label>
      <input
        id={`a${p.i}`}
        className={`${input} ${p.locked ? "bg-slate-50" : ""}`}
        value={main}
        disabled={p.locked}
        autoComplete="off"
        maxLength={40}
        placeholder={`${p.cat.name} يبدأ بحرف ${p.letter}`}
        onChange={(x) => {
          setMain(x.target.value);
          p.onChange("main", x.target.value);
        }}
        onKeyDown={(x) => {
          if (x.key === "Enter") document.getElementById(`a${p.i + 1}`)?.focus();
        }}
      />
      {p.showExtra ? (
        <input
          className={`${input} mt-2 border-dashed py-2 text-base`}
          value={extra}
          disabled={p.locked}
          autoComplete="off"
          maxLength={40}
          placeholder="إجابة ثانية (للمتعة، بدون نقاط)"
          onChange={(x) => {
            setExtra(x.target.value);
            p.onChange("extra", x.target.value);
          }}
        />
      ) : (
        !p.locked && (
          <button className="mt-1.5 flex items-center gap-1 text-sm font-bold text-violet-600 hover:text-violet-800" onClick={p.onShowExtra}>
            <Plus className="h-4 w-4" /> إجابة ثانية (بدون نقاط)
          </button>
        )
      )}
    </div>
  );
}

function Closing({ r }: { r: RoundRecord }) {
  return (
    <>
      <Logo small />
      <div className={`${card} text-center`}>
        <LetterBadge letter={r.letter} />
        <h2 className="mt-4 text-2xl font-black">⏰ انتهت الجولة!</h2>
        <p className="mt-2 flex items-center justify-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> نجمع الإجابات ونتحقق منها…
        </p>
      </div>
    </>
  );
}

// ---------- النتائج ----------
function Results({ e, S, r }: { e: Engine; S: GameState; r: RoundRecord }) {
  const sc = scoreRound(r);
  const overall = standings(S);
  const host = e.isHost();
  const last = r.no >= S.settings.rounds;
  const topRound = sc.ranking[0];
  const name = (id: string) => S.players[id]?.name || "؟";
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (topRound === e.myId) confetti({ particleCount: 80, spread: 70, origin: { y: 0.3 } });
  }, [topRound, e.myId]);

  return (
    <>
      <div className={`${card} flex items-center gap-4`}>
        <LetterBadge letter={r.letter} size="sm" />
        <div className="flex-1">
          <h2 className="text-2xl font-black">
            نتائج الجولة {r.no} من {S.settings.rounds}
          </h2>
          <p className="text-sm text-slate-500">{r.ai ? "🤖 تم التحقق من التصنيفات بالذكاء الاصطناعي" : "تم التحقق بالقاموس المدمج (أضف مفتاح GROQ_API_KEY لتحقق أذكى). المضيف يقدر يعتمد أي كلمة صحيحة ما عرفناها."}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl bg-gradient-to-br from-amber-300 to-orange-400 p-5 shadow-xl">
          <div className="flex items-center gap-2 font-bold text-amber-900">
            <Zap className="h-5 w-5" /> أعلى درجة في الجولة
          </div>
          <div className="mt-1 text-2xl font-black">{topRound ? name(topRound) : "—"}</div>
          <div className="font-bold text-amber-900">
            {topRound ? sc.points[topRound] : 0} نقطة · ⏱️ {fmtTime(topRound ? sc.time[topRound] : null)}
          </div>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-violet-400 to-fuchsia-500 p-5 text-white shadow-xl">
          <div className="flex items-center gap-2 font-bold">
            <Trophy className="h-5 w-5" /> المتصدر العام
          </div>
          <div className="mt-1 text-2xl font-black">{overall[0] ? name(overall[0].id) : "—"}</div>
          <div className="font-bold opacity-90">
            {overall[0]?.total ?? 0} نقطة · ⏱️ {fmtTime(overall[0]?.timeMs)}
          </div>
        </div>
      </div>

      <div className={`${card} mt-4`}>
        <h3 className="mb-3 text-xl font-black">إجابات اللاعبين</h3>
        {host && <p className="mb-3 text-sm text-slate-500">بصفتك المضيف تقدر تضغط ✓ أو ✗ لتصحيح حكم أي إجابة.</p>}
        <div className="space-y-4">
          {sc.ranking.map((pid, rank) => (
            <div key={pid} className="overflow-hidden rounded-2xl border-2 border-slate-100">
              <div className="flex items-center gap-3 bg-slate-50 px-4 py-2.5">
                <span className="text-xl">{["🥇", "🥈", "🥉"][rank] || `${rank + 1}.`}</span>
                <span className="flex-1 text-lg font-black">
                  {name(pid)} {pid === e.myId && <span className="text-sm font-medium text-slate-400">(أنت)</span>}
                </span>
                <span dir="ltr" className="rounded-full bg-white px-2.5 py-0.5 font-mono text-sm font-bold text-slate-600">
                  ⏱️ {fmtTime(sc.time[pid])}
                </span>
                <span className="rounded-full bg-violet-600 px-3 py-0.5 font-black text-white">{sc.points[pid]}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {CATEGORIES.map((c, i) => {
                  const cell = sc.cells[pid][i];
                  return (
                    <div key={i} className="flex items-start gap-2 px-4 py-2">
                      <span className="w-16 shrink-0 pt-0.5 text-sm font-bold text-slate-400">
                        {c.emoji} {c.name}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={`font-bold ${cell.valid ? "" : "text-rose-500 line-through decoration-2"}`}>{cell.main || <span className="text-slate-300 no-underline">—</span>}</div>
                        {!cell.valid && cell.main && cell.reason && !cell.overridden && <div className="text-xs text-rose-500">{cell.reason}</div>}
                        {cell.extra && <div className="text-sm text-slate-400">الإجابة الثانية: {cell.extra} · 0</div>}
                      </div>
                      {host && cell.main && (
                        <button
                          title={cell.valid ? "اعتبرها خطأ" : "اعتبرها صحيحة"}
                          className={`rounded-lg p-1 ${cell.valid ? "text-slate-300 hover:bg-rose-50 hover:text-rose-500" : "text-slate-300 hover:bg-emerald-50 hover:text-emerald-600"}`}
                          onClick={() => e.toggleOverride(pid, i, cell.valid)}
                        >
                          {cell.valid ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        </button>
                      )}
                      <span
                        className={`w-9 shrink-0 rounded-lg py-0.5 text-center font-black ${
                          cell.points === 10 ? "bg-emerald-100 text-emerald-700" : cell.points === 5 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-600"
                        }`}
                      >
                        {cell.points}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${card} mt-4`}>
        <h3 className="mb-3 flex items-center gap-2 text-xl font-black">
          <Medal className="h-6 w-6 text-amber-500" /> الترتيب العام
        </h3>
        <StandingsList S={S} e={e} />
      </div>

      <div className="mt-4 space-y-2">
        {host ? (
          <>
            {!last && (
              <button className={`${btnMain} w-full py-4 text-xl`} onClick={() => e.startRound()}>
                <Play className="h-6 w-6" /> الجولة التالية
              </button>
            )}
            <button className={`${last ? btnMain + " py-4 text-xl" : btnGhost} w-full`} onClick={() => e.endGame()}>
              <Trophy className="h-5 w-5" /> {last ? "إعلان الفائز" : "إنهاء اللعبة"}
            </button>
          </>
        ) : (
          <div className={`${card} flex items-center justify-center gap-2 text-slate-500`}>
            <Hourglass className="h-5 w-5 animate-pulse" /> بانتظار المضيف…
          </div>
        )}
      </div>
    </>
  );
}

function StandingsList({ S, e }: { S: GameState; e: Engine }) {
  const st = standings(S);
  return (
    <div className="space-y-2">
      {st.map((x, i) => (
        <div key={x.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${i === 0 ? "bg-gradient-to-l from-amber-100 to-yellow-50" : "bg-slate-50"}`}>
          <span className="w-8 text-center text-xl font-black">{["🥇", "🥈", "🥉"][i] || i + 1}</span>
          <span className="flex-1 font-bold">
            {S.players[x.id]?.name} {x.id === e.myId && <span className="text-sm text-slate-400">(أنت)</span>}
          </span>
          <span dir="ltr" className="font-mono text-sm text-slate-500">
            ⏱️ {fmtTime(x.timeMs)}
          </span>
          <span className="w-14 text-left text-2xl font-black">{x.total}</span>
        </div>
      ))}
      <p className="text-xs text-slate-400">عند التعادل يتقدم الأسرع (أقل مجموع زمن؛ من لم ينهِ جولة يُحسب له زمنها كاملاً).</p>
    </div>
  );
}

// ---------- التتويج ----------
function Final({ e, S }: { e: Engine; S: GameState }) {
  const st = standings(S);
  const [first, second, third] = st;
  useEffect(() => {
    sounds.win();
    const end = Date.now() + 2500;
    const colors = ["#f59e0b", "#f97316", "#8b5cf6", "#10b981", "#ec4899"];
    const frame = () => {
      confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0 }, colors });
      confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);
  const Podium = ({ x, h, medal, color }: { x?: (typeof st)[number]; h: string; medal: string; color: string }) => (
    <div className="flex flex-1 flex-col items-center justify-end">
      {x && (
        <>
          <div className="text-4xl">{medal}</div>
          <div className="mt-1 max-w-full truncate text-center font-black text-white">{S.players[x.id]?.name}</div>
          <div className="text-sm font-bold text-white/80">{x.total} نقطة</div>
        </>
      )}
      <div className={`mt-2 w-full rounded-t-2xl ${color} ${h} flex items-start justify-center pt-2 text-3xl font-black text-white/90 shadow-inner`}>
        {x ? "" : ""}
      </div>
    </div>
  );
  return (
    <>
      <Logo small />
      <div className="rounded-3xl bg-white/10 p-5 text-center backdrop-blur">
        <Trophy className="mx-auto h-14 w-14 animate-[bounce_1.5s_infinite] text-amber-400" />
        <h2 className="mt-2 text-3xl font-black text-white">الفائز: {first ? S.players[first.id]?.name : ""} 🎉</h2>
        <div className="mt-6 flex items-end gap-3">
          <Podium x={second} h="h-24" medal="🥈" color="bg-slate-400" />
          <Podium x={first} h="h-36" medal="🥇" color="bg-gradient-to-t from-amber-500 to-yellow-400" />
          <Podium x={third} h="h-16" medal="🥉" color="bg-orange-700" />
        </div>
      </div>
      <div className={`${card} mt-4`}>
        <StandingsList S={S} e={e} />
      </div>
      <div className="mt-4">
        {e.isHost() ? (
          <button className={`${btnMain} w-full py-4 text-xl`} onClick={() => e.backToLobby()}>
            <RotateCcw className="h-6 w-6" /> لعبة جديدة
          </button>
        ) : (
          <div className={`${card} text-center text-slate-500`}>المضيف يقدر يبدأ لعبة جديدة</div>
        )}
      </div>
    </>
  );
}

function AiBadge() {
  const [st, setSt] = useState<{ aiEnabled: boolean; provider: string | null } | null>(null);
  useEffect(() => {
    fetch("/api/validate")
      .then((r) => r.json())
      .then(setSt)
      .catch(() => {});
  }, []);
  if (!st) return null;
  return (
    <div className={`mt-3 rounded-2xl px-4 py-2 text-center text-sm font-bold ${st.aiEnabled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
      {st.aiEnabled ? "🤖 التحقق الذكي مفعّل: نتأكد إن كل كلمة من تصنيفها الصحيح" : "📖 التحقق بالقاموس المدمج (التحقق الذكي غير مفعّل)"}
    </div>
  );
}

// ---------- الشات بين اللاعبين ----------
function Chat({ e, S }: { e: Engine; S: GameState }) {
  const msgs = S.chat || [];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [seen, setSeen] = useState(msgs.length ? msgs[msgs.length - 1].id : "");
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = msgs.length ? msgs[msgs.length - 1].id : "";
  const seenIdx = msgs.findIndex((m) => m.id === seen);
  const unread = open ? 0 : msgs.slice(seenIdx + 1).filter((m) => m.from !== e.myId).length;
  const prevLast = useRef(lastId);
  useEffect(() => {
    if (open) setSeen(lastId);
    if (lastId && lastId !== prevLast.current) {
      const m = msgs[msgs.length - 1];
      if (m.from !== e.myId) sounds.chat();
    }
    prevLast.current = lastId;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lastId, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = () => {
    if (!text.trim()) return;
    e.sendChat(text);
    setText("");
  };
  return (
    <>
      <button
        aria-label="الشات"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 left-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-xl shadow-violet-900/40 transition active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-7 w-7" />}
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-black">{unread}</span>}
      </button>
      {open && (
        <div className="fixed bottom-24 left-4 right-4 z-40 flex max-h-[60vh] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl sm:left-5 sm:right-auto sm:w-96">
          <div className="flex items-center gap-2 bg-gradient-to-l from-violet-600 to-fuchsia-600 px-4 py-3 font-black text-white">
            <MessageCircle className="h-5 w-5" /> شات الغرفة
          </div>
          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {msgs.length === 0 && <p className="py-6 text-center text-sm text-slate-400">ما فيه رسائل للحين، قل هلا 👋</p>}
            {msgs.map((m) => {
              const mine = m.from === e.myId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? "bg-violet-600 text-white" : "bg-slate-100"}`}>
                    {!mine && <div className="text-xs font-black text-violet-700">{m.name}</div>}
                    <div className="break-words">{m.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 border-t border-slate-100 p-2">
            <input
              className="flex-1 rounded-xl border-2 border-slate-200 px-3 py-2 outline-none focus:border-violet-400"
              placeholder="اكتب رسالة…"
              maxLength={200}
              value={text}
              onChange={(x) => setText(x.target.value)}
              onKeyDown={(x) => x.key === "Enter" && send()}
            />
            <button onClick={send} className="rounded-xl bg-violet-600 px-3 text-white" aria-label="إرسال">
              <Send className="h-5 w-5 -scale-x-100" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
