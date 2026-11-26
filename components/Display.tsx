"use client";

import confetti from "canvas-confetti";
import { CheckCircle2, Crown, Loader2, PenLine, Trophy, Zap } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES } from "@/lib/arabic";
import type { Engine } from "@/lib/engine";
import { finishRuleText, fmtTime, scoreRound, standings } from "@/lib/scoring";
import Credit from "./Credit";
import type { GameState, RoundRecord } from "@/lib/types";

/** شاشة العرض الكبيرة (تلفزيون / بروجكتر): تتابع الغرفة بدون ما تلعب */
export default function Display({ e }: { e: Engine }) {
  const S = e.S;
  const r = e.currentRound();
  return (
    <div className="fixed inset-0 overflow-auto bg-[radial-gradient(circle_at_10%_0%,#7c3aed_0,transparent_45%),radial-gradient(circle_at_100%_100%,#f97316_0,transparent_40%),linear-gradient(160deg,#1e1b4b,#0f172a)] text-white">
      <div className="mx-auto flex min-h-full max-w-[1600px] flex-col gap-6 p-6 lg:p-10">
        <TopBar e={e} />
        {!S ? (
          <div className="flex flex-1 items-center justify-center text-3xl">
            {e.joinFailed ? "ما لقينا الغرفة، تأكد إن المضيف فاتح اللعبة" : <Loader2 className="h-16 w-16 animate-spin" />}
          </div>
        ) : S.phase === "lobby" ? (
          <LobbyView e={e} S={S} />
        ) : S.phase === "playing" && r ? (
          <PlayingView e={e} S={S} r={r} />
        ) : S.phase === "closing" && r ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <BigLetter letter={r.letter} />
            <div className="text-6xl font-black">⏰ انتهت الجولة!</div>
            <div className="flex items-center gap-3 text-3xl text-white/70">
              <Loader2 className="h-9 w-9 animate-spin" /> نتحقق من الإجابات…
            </div>
          </div>
        ) : S.phase === "results" && r ? (
          <ResultsView e={e} S={S} r={r} />
        ) : S.phase === "final" ? (
          <FinalView S={S} />
        ) : null}
        {S && <ChatTicker S={S} />}
        <Credit dark />
      </div>
    </div>
  );
}

function TopBar({ e }: { e: Engine }) {
  const [qr, setQr] = useState("");
  const link = typeof window !== "undefined" ? `${location.origin}${location.pathname}?r=${e.room}${e.local ? "&local=1" : ""}` : "";
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: "#1e1b4b", light: "#ffffff" } })
      .then(setQr)
      .catch(() => {});
  }, [link]);
  const r = e.currentRound();
  return (
    <div className="flex items-center justify-between gap-6">
      <div>
        <div className="text-3xl font-black lg:text-4xl">
          🌴 إنسان <span className="text-amber-400">حيوان</span> نبات <span className="text-orange-400">جماد</span> بلاد
        </div>
        {e.S && r && e.S.phase !== "lobby" && (
          <div className="mt-1 text-2xl text-white/70">
            الجولة {r.no} من {e.S.settings.rounds}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 rounded-3xl bg-white/10 p-3 pl-5 backdrop-blur">
        {qr && <img src={qr} alt="رمز الدخول" className="h-24 w-24 rounded-xl lg:h-28 lg:w-28" />}
        <div>
          <div className="text-lg text-white/70">ادخل اللعبة برمز</div>
          <div dir="ltr" className="text-5xl font-black tracking-[.2em] text-amber-300">
            {e.room}
          </div>
          <div dir="ltr" className="text-sm text-white/60">
            {link.replace(/^https?:\/\//, "")}
          </div>
        </div>
      </div>
    </div>
  );
}

function BigLetter({ letter }: { letter: string }) {
  return (
    <div
      key={letter}
      className="flex h-56 w-56 shrink-0 items-center justify-center rounded-[3rem] bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-[10rem] font-black leading-none shadow-2xl shadow-rose-500/40 animate-[pop_.6s_ease] lg:h-72 lg:w-72 lg:text-[13rem]"
    >
      {letter}
    </div>
  );
}

function LobbyView({ e, S }: { e: Engine; S: GameState }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10">
      <div className="text-5xl font-black">امسح الرمز أو ادخل الرمز من جوالك 📱</div>
      <div className="flex max-w-5xl flex-wrap justify-center gap-4">
        {S.order.map((id) => (
          <div key={id} className={`flex items-center gap-2 rounded-full px-7 py-4 text-3xl font-black ${e.online.includes(id) ? "bg-white text-violet-900" : "bg-white/20 text-white/50"}`}>
            {id === S.hostId && <Crown className="h-8 w-8 text-amber-500" />}
            {S.players[id]?.name}
          </div>
        ))}
      </div>
      <div className="text-2xl text-white/60">
        {S.order.length} لاعب · بانتظار المضيف يبدأ اللعبة · {S.settings.rounds} جولات
      </div>
    </div>
  );
}

function Countdown({ e, r }: { e: Engine; r: RoundRecord }) {
  const ref = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = e.now();
      const total = r.endsAt - r.startedAt;
      const left = Math.max(0, Math.min(total, r.endsAt - now));
      const s = Math.ceil(left / 1000);
      if (ref.current) {
        ref.current.textContent = now < r.startedAt ? "استعد…" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        ref.current.style.color = s <= 10 ? "#fb7185" : "";
      }
      if (bar.current) bar.current.style.width = `${(left / total) * 100}%`;
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [e, r]);
  return (
    <div className="w-full">
      <div ref={ref} dir="ltr" className="text-center font-mono text-[7rem] font-black leading-none tabular-nums lg:text-[9rem]" />
      <div className="mt-4 h-5 overflow-hidden rounded-full bg-white/15">
        <div ref={bar} className="h-full rounded-full bg-gradient-to-l from-emerald-400 via-amber-400 to-rose-500" />
      </div>
    </div>
  );
}

function PlayingView({ e, S, r }: { e: Engine; S: GameState; r: RoundRecord }) {
  return (
    <div className="grid flex-1 items-center gap-10 lg:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-6">
        <BigLetter letter={r.letter} />
        <div className="flex flex-wrap justify-center gap-2 text-2xl">
          {CATEGORIES.map((c) => (
            <span key={c.key} className="rounded-full bg-white/10 px-4 py-1.5">
              {c.emoji} {c.name}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-8">
        <Countdown e={e} r={r} />
        <div className="text-center text-3xl text-white/80">تنتهي الجولة عند {finishRuleText(r.needed, r.participants.length)} 🏁</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {r.participants.map((id) => {
            const f = r.finishers.findIndex((x) => x.id === id);
            const done = f >= 0;
            return (
              <div key={id} className={`flex items-center gap-3 rounded-2xl px-5 py-4 text-3xl font-black transition ${done ? "bg-emerald-500 text-white" : "bg-white/10"}`}>
                {done ? <CheckCircle2 className="h-9 w-9" /> : <PenLine className="h-8 w-8 animate-pulse text-white/60" />}
                <span className="flex-1 truncate">{S.players[id]?.name}</span>
                {done && (
                  <span dir="ltr" className="font-mono text-2xl">
                    {fmtTime(r.finishers[f].elapsedMs)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ResultsView({ e, S, r }: { e: Engine; S: GameState; r: RoundRecord }) {
  const sc = scoreRound(r);
  const st = standings(S);
  const top = sc.ranking[0];
  const name = (id: string) => S.players[id]?.name || "؟";
  void e;
  return (
    <div className="grid flex-1 gap-6 xl:grid-cols-[1fr_420px]">
      <div className="overflow-hidden rounded-3xl bg-white text-slate-800 shadow-2xl">
        <div className="flex items-center gap-4 bg-gradient-to-l from-amber-300 to-orange-400 px-6 py-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/40 text-5xl font-black">{r.letter}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xl font-bold text-amber-900">
              <Zap className="h-6 w-6" /> أعلى درجة في الجولة
            </div>
            <div className="text-4xl font-black">
              {top ? name(top) : "—"} · {top ? sc.points[top] : 0} نقطة{" "}
              <span dir="ltr" className="font-mono text-2xl">
                ⏱️ {fmtTime(top ? sc.time[top] : null)}
              </span>
            </div>
          </div>
        </div>
        <table className="w-full text-right text-2xl">
          <thead>
            <tr className="bg-slate-100 text-xl text-slate-500">
              <th className="p-3">اللاعب</th>
              {CATEGORIES.map((c) => (
                <th key={c.key} className="p-3">
                  {c.emoji} {c.name}
                </th>
              ))}
              <th className="p-3">الوقت</th>
              <th className="p-3">النقاط</th>
            </tr>
          </thead>
          <tbody>
            {sc.ranking.map((pid, i) => (
              <tr key={pid} className={i % 2 ? "bg-slate-50" : ""}>
                <td className="p-3 font-black">
                  {["🥇", "🥈", "🥉"][i] || ""} {name(pid)}
                </td>
                {sc.cells[pid].map((c, k) => (
                  <td key={k} className="p-3 align-top">
                    <div className={`font-bold ${c.valid ? "" : "text-rose-500 line-through"}`}>{c.main || <span className="text-slate-300">—</span>}</div>
                    <div className={`text-base font-black ${c.points === 10 ? "text-emerald-600" : c.points === 5 ? "text-amber-600" : "text-rose-500"}`}>{c.points}</div>
                    {c.extra && <div className="text-sm text-slate-400">+ {c.extra}</div>}
                  </td>
                ))}
                <td dir="ltr" className="p-3 text-right font-mono text-xl">
                  {fmtTime(sc.time[pid])}
                </td>
                <td className="p-3">
                  <span className="rounded-full bg-violet-600 px-4 py-1 font-black text-white">{sc.points[pid]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-3xl bg-white/10 p-6 backdrop-blur">
        <div className="mb-4 flex items-center gap-2 text-3xl font-black">
          <Trophy className="h-8 w-8 text-amber-400" /> الترتيب العام
        </div>
        <div className="space-y-3">
          {st.map((x, i) => (
            <div key={x.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-2xl ${i === 0 ? "bg-amber-400 text-slate-900" : "bg-white/10"}`}>
              <span className="w-9 text-center font-black">{["🥇", "🥈", "🥉"][i] || i + 1}</span>
              <span className="flex-1 truncate font-black">{name(x.id)}</span>
              <span dir="ltr" className="font-mono text-base opacity-70">
                {fmtTime(x.timeMs)}
              </span>
              <span className="w-16 text-left text-3xl font-black">{x.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FinalView({ S }: { S: GameState }) {
  const st = standings(S);
  useEffect(() => {
    const end = Date.now() + 4000;
    const colors = ["#f59e0b", "#f97316", "#8b5cf6", "#10b981", "#ec4899"];
    const frame = () => {
      confetti({ particleCount: 8, angle: 60, spread: 70, origin: { x: 0 }, colors });
      confetti({ particleCount: 8, angle: 120, spread: 70, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);
  const P = ({ i, h, medal, color }: { i: number; h: string; medal: string; color: string }) => {
    const x = st[i];
    return (
      <div className="flex w-64 flex-col items-center justify-end">
        {x && (
          <>
            <div className="text-7xl">{medal}</div>
            <div className="mt-2 max-w-full truncate text-4xl font-black">{S.players[x.id]?.name}</div>
            <div className="text-2xl text-white/80">{x.total} نقطة</div>
          </>
        )}
        <div className={`mt-3 w-full rounded-t-3xl ${color} ${h}`} />
      </div>
    );
  };
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <Trophy className="h-24 w-24 animate-[bounce_1.5s_infinite] text-amber-400" />
      <div className="text-7xl font-black">الفائز: {st[0] ? S.players[st[0].id]?.name : ""} 🎉</div>
      <div className="mt-6 flex items-end gap-6">
        <P i={1} h="h-40" medal="🥈" color="bg-slate-400" />
        <P i={0} h="h-60" medal="🥇" color="bg-gradient-to-t from-amber-500 to-yellow-400" />
        <P i={2} h="h-28" medal="🥉" color="bg-orange-700" />
      </div>
    </div>
  );
}

/** آخر رسائل الشات تظهر على الشاشة الكبيرة */
function ChatTicker({ S }: { S: GameState }) {
  const msgs = (S.chat || []).slice(-3);
  if (!msgs.length) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {msgs.map((m) => (
        <div key={m.id} className="animate-[slideup_.3s_ease] rounded-2xl bg-white/10 px-4 py-2 text-xl backdrop-blur">
          💬 <span className="font-black text-amber-300">{m.name}:</span> {m.text}
        </div>
      ))}
    </div>
  );
}
