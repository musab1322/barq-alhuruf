"use client";
import { ALL_LETTERS, CATEGORIES, HARD_LETTERS, normalize, startsWithLetter } from "./arabic";
import { offlineCheck } from "./validate";
import { neededFinishers } from "./scoring";
import { sounds } from "./sound";
import { connect, type Transport } from "./transport";
import type { Check, GameState, Msg, RoundRecord, Settings } from "./types";

/**
 * محرك اللعبة.
 *
 * منع التضارب: حالة الغرفة يملكها "المضيف" (منشئ الغرفة) فقط، وكل اللاعبين يرسلون له طلبات
 * (انضمام، انتهيت، مسودة الإجابات). المضيف يعالج الرسائل واحدة واحدة بالترتيب (JavaScript أحادي
 * الخيط)، فإذا ضغط لاعبان "انتهيت" في نفس اللحظة تُسجَّل الأولى ثم الثانية، ولا يمكن أن يُسجَّل
 * أكثر من العدد المطلوب لأن الجولة تُغلق داخل نفس المعالجة. بعد كل تغيير يبث المضيف الحالة كاملة
 * مع رقم إصدار (v) متزايد، وكل لاعب يقبل فقط الإصدار الأحدث. إذا خرج المضيف، يتسلم أقدم لاعب متصل.
 */

const COLLECT_MS = 2000;
const HOST_TIMEOUT_MS = 4000;

type Listener = () => void;
export type Toast = { id: number; text: string; kind?: "info" | "success" | "error" };

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

export class Engine {
  myId: string;
  myName = "";
  room: string | null = null;
  local = false;
  S: GameState | null = null;
  online: string[] = [];
  offset = 0;
  joinFailed = false;
  toasts: Toast[] = [];
  aiEnabled: boolean | null = null;
  viewer = false; // شاشة العرض: تتابع فقط ولا تلعب
  kicked = false;

  private net: Transport | null = null;
  private listeners = new Set<Listener>();
  private drafts: Record<number, { main: string[]; extra: string[] }> = {};
  private collected: Record<string, { main: string[]; extra: string[] }> = {};
  private finishPayload: Record<string, { main: string[]; extra: string[] }> = {};
  private collectUntil = 0;
  private finalizing = false;
  private hostMissingSince = 0;
  private offlineSince: Record<string, number> = {};
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private loop: ReturnType<typeof setInterval> | null = null;
  private joinRetry: ReturnType<typeof setTimeout> | null = null;
  private lastPhaseKey = "";
  private lastTickSec = -1;

  constructor() {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem("insan_id");
    } catch {}
    if (!id) {
      id = rid();
      try {
        sessionStorage.setItem("insan_id", id);
      } catch {}
    }
    this.myId = id;
    try {
      this.myName = sessionStorage.getItem("insan_name") || localStorage.getItem("insan_name") || "";
    } catch {}
  }

  // ---------- اشتراك الواجهة ----------
  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private changed() {
    this.listeners.forEach((l) => l());
  }
  toast(text: string, kind: Toast["kind"] = "info") {
    const t = { id: Date.now() + Math.random(), text, kind };
    this.toasts = [...this.toasts, t].slice(-3);
    this.changed();
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      this.changed();
    }, 3200);
  }

  // ---------- أدوات ----------
  isHost() {
    return !!this.S && this.S.hostId === this.myId;
  }
  now() {
    return Date.now() + this.offset;
  }
  currentRound(): RoundRecord | null {
    if (!this.S || !this.S.rounds.length) return null;
    return this.S.rounds[this.S.rounds.length - 1];
  }
  draft(no: number) {
    if (!this.drafts[no]) {
      let saved: { main: string[]; extra: string[] } | null = null;
      try {
        saved = JSON.parse(sessionStorage.getItem(`insan_draft_${this.room}_${no}`) || "null");
      } catch {}
      this.drafts[no] = saved || { main: CATEGORIES.map(() => ""), extra: CATEGORIES.map(() => "") };
    }
    return this.drafts[no];
  }
  private saveDraft(no: number) {
    try {
      sessionStorage.setItem(`insan_draft_${this.room}_${no}`, JSON.stringify(this.draft(no)));
    } catch {}
  }
  private send(msg: Msg) {
    this.net?.send(msg);
  }
  private broadcast() {
    if (!this.isHost() || !this.S) return;
    this.S.v++;
    this.S.hostNow = Date.now();
    this.send({ t: "state", d: this.S });
    this.afterState();
  }

  // ---------- الدخول ----------
  setName(n: string) {
    this.myName = n.trim().slice(0, 20);
    try {
      localStorage.setItem("insan_name", this.myName);
      sessionStorage.setItem("insan_name", this.myName);
    } catch {}
  }

  create(local: boolean) {
    const code = String(Math.floor(10000 + Math.random() * 90000));
    this.S = {
      v: 1,
      hostId: this.myId,
      hostNow: Date.now(),
      phase: "lobby",
      settings: { rounds: 5, time: 120, hardOff: true },
      players: { [this.myId]: { name: this.myName, joinedAt: Date.now() } },
      order: [this.myId],
      rounds: [],
      used: [],
    };
    this.open(code, local, true);
  }

  join(code: string, local: boolean) {
    this.S = null;
    this.joinFailed = false;
    this.kicked = false;
    this.open(code, local, false);
  }

  /** شاشة العرض: تدخل الغرفة كمشاهد فقط */
  watch(code: string, local: boolean) {
    this.viewer = true;
    this.myId = "screen-" + rid();
    this.S = null;
    this.joinFailed = false;
    this.open(code, local, false);
  }

  /** الغرفة المحفوظة لهذا التبويب (للرجوع تلقائياً بعد تحديث الصفحة) */
  savedRoom(): string | null {
    try {
      return sessionStorage.getItem("insan_room");
    } catch {
      return null;
    }
  }

  private open(code: string, local: boolean, create: boolean) {
    this.room = code;
    this.local = local;
    this.online = [this.myId];
    const url = new URL(location.href);
    url.searchParams.set("r", code);
    history.replaceState(null, "", url);
    if (!this.viewer)
      try {
        sessionStorage.setItem("insan_room", code);
      } catch {}
    this.net = connect(
      code,
      this.myId,
      {
        onMsg: (m, from) => this.onMsg(m, from),
        onPresence: (ids) => this.onPresence(ids),
        onReady: () => {
          if (create) this.broadcast();
          else {
            this.hello();
            let tries = 0;
            const retry = () => {
              if (this.S) return;
              if (++tries > 4) {
                this.joinFailed = true;
                this.changed();
                return;
              }
              this.hello();
              this.joinRetry = setTimeout(retry, 2500);
            };
            this.joinRetry = setTimeout(retry, 2500);
          }
        },
        onReconnect: () => {
          if (this.isHost()) this.broadcast();
          else {
            this.hello();
            if (!this.viewer) this.sendDraft(true);
          }
        },
        onStatus: (s) => {
          if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") this.toast("مشكلة في الاتصال… نحاول من جديد", "error");
        },
      },
      local
    );
    if (!this.loop) this.loop = setInterval(() => this.tick(), 200);
    this.changed();
  }

  private hello() {
    if (this.viewer) this.send({ t: "sync" });
    else this.send({ t: "hello", d: { name: this.myName } });
  }

  leave() {
    try {
      sessionStorage.removeItem("insan_room");
    } catch {}
    this.net?.close();
    this.net = null;
    this.room = null;
    this.S = null;
    if (this.joinRetry) clearTimeout(this.joinRetry);
    const url = new URL(location.href);
    url.searchParams.delete("r");
    history.replaceState(null, "", url);
    this.changed();
  }

  // ---------- الرسائل ----------
  private onMsg(m: Msg, from: string) {
    if (m.t === "state") {
      const d = m.d;
      if (this.S && !(d.v > this.S.v || d.hostId !== this.S.hostId)) return;
      if (this.S && this.isHost() && d.hostId !== this.myId && d.v < this.S.v) return;
      const prevHost = this.S?.hostId;
      const wasIn = !!this.S?.players[this.myId];
      const rejoinedAsHost = !this.S && d.hostId === this.myId;
      this.S = d;
      this.offset = d.hostNow - Date.now();
      if (this.joinRetry) clearTimeout(this.joinRetry);
      if (rejoinedAsHost) {
        // رجع المضيف بعد تحديث الصفحة: يستلم الحالة من اللاعبين ويكمل
        this.offset = 0;
        this.collected = {};
        this.finishPayload = {};
        if (d.phase === "closing") this.collectUntil = Date.now() + COLLECT_MS;
        this.send({ t: "drafts" });
        this.broadcast();
        return;
      }
      if (!this.viewer && !d.players[this.myId] && this.myName) {
        if (wasIn) {
          // تم استرجاع لاعبي من جهاز آخر
          this.kicked = true;
          this.changed();
          return;
        }
        this.hello();
      }
      if (!this.viewer && (d.phase === "closing" || (prevHost && prevHost !== d.hostId))) this.sendDraft(true);
      this.afterState();
      return;
    }
    if (this.viewer) return;
    if (m.t === "drafts") {
      this.sendDraft(true);
      return;
    }
    // المضيف حدّث الصفحة ورجع بدون الحالة: أقدم لاعب متصل يرسلها له
    if (m.t === "hello" && this.S && !this.isHost() && from === this.S.hostId) {
      const helper = this.S.order.find((id) => id !== this.S!.hostId && this.online.includes(id));
      if (helper === this.myId) {
        const copy: GameState = { ...this.S, v: this.S.v + 1, hostNow: this.now() };
        this.send({ t: "state", d: copy });
      }
      return;
    }
    if (!this.isHost() || !this.S) return;
    const S = this.S;
    if (m.t === "sync") {
      this.broadcast();
    } else if (m.t === "hello") {
      let name = String(m.d?.name || "لاعب").trim().slice(0, 20) || "لاعب";
      if (!S.players[from]) {
        const same = (id: string) => normalize(S.players[id]?.name || "") === normalize(name);
        // نفس الاسم وصاحبه غير متصل = نفس اللاعب دخل من جهاز آخر: نسترجع لاعبه ونقاطه
        const old = S.order.find((id) => id !== from && id !== this.myId && same(id) && !this.online.includes(id));
        if (old) {
          this.reassign(old, from);
          this.toast(`رجع ${name} 🔄`);
        } else {
          if (S.order.some(same)) name = `${name} ${S.order.filter(same).length + 1}`;
          S.players[from] = { name, joinedAt: Date.now() };
          S.order.push(from);
          this.toast(`انضم ${name} 👋`);
        }
      } else S.players[from].name = name;
      this.broadcast();
    } else if (m.t === "draft") {
      const r = this.currentRound();
      if (r && m.d.round === r.no && !this.finishPayload[from]) this.collected[from] = { main: m.d.main, extra: m.d.extra };
    } else if (m.t === "finish") {
      this.hostFinish(from, m.d.round, m.d.elapsedMs, m.d.main, m.d.extra);
    }
  }

  /** نقل لاعب (اسمه ونقاطه وإجاباته) من معرّف قديم لمعرّف جديد */
  private reassign(oldId: string, newId: string) {
    const S = this.S!;
    S.players[newId] = S.players[oldId];
    delete S.players[oldId];
    S.order = S.order.map((x) => (x === oldId ? newId : x));
    const mv = <T,>(o: Record<string, T>) => {
      if (oldId in o) {
        o[newId] = o[oldId];
        delete o[oldId];
      }
    };
    for (const r of S.rounds) {
      r.participants = r.participants.map((x) => (x === oldId ? newId : x));
      r.finishers = r.finishers.map((f) => (f.id === oldId ? { ...f, id: newId } : f));
      mv(r.answers);
      mv(r.checks);
      for (const k of Object.keys(r.overrides)) {
        if (k.startsWith(oldId + "|")) {
          r.overrides[newId + k.slice(oldId.length)] = r.overrides[k];
          delete r.overrides[k];
        }
      }
    }
    mv(this.collected);
    mv(this.finishPayload);
  }

  private onPresence(ids: string[]) {
    this.online = ids;
    const S = this.S;
    if (S && this.isHost() && S.phase === "lobby") {
      const t = Date.now();
      let ch = false;
      for (const id of [...S.order]) {
        if (id === this.myId) continue;
        if (ids.includes(id)) {
          delete this.offlineSince[id];
          continue;
        }
        this.offlineSince[id] = this.offlineSince[id] || t;
        if (t - this.offlineSince[id] > 8000 && !S.rounds.some((r) => r.participants.includes(id))) {
          delete S.players[id];
          S.order = S.order.filter((x) => x !== id);
          ch = true;
        }
      }
      if (ch) this.broadcast();
    }
    this.changed();
  }

  // تأثيرات عند تغير المرحلة (أصوات وتنبيهات)
  private afterState() {
    const S = this.S;
    if (!S) return this.changed();
    const r = this.currentRound();
    const key = `${S.phase}:${r?.no ?? 0}:${r?.finishers.length ?? 0}`;
    if (key !== this.lastPhaseKey) {
      const [prevPhase, prevNo, prevF] = this.lastPhaseKey.split(":");
      if (S.phase === "playing" && (prevPhase !== "playing" || Number(prevNo) !== r?.no)) sounds.start();
      if (r && S.phase !== "lobby" && Number(prevNo) === r.no && r.finishers.length > Number(prevF || 0)) {
        const f = r.finishers[r.finishers.length - 1];
        if (f.id !== this.myId) {
          this.toast(`🏁 ${S.players[f.id]?.name || "لاعب"} أنهى الجولة!`, "success");
          sounds.finish();
        }
      }
      if (S.phase === "closing" && prevPhase === "playing") sounds.timeUp();
      this.lastPhaseKey = key;
    }
    this.changed();
  }

  // ---------- أوامر اللاعب ----------
  setDraft(field: "main" | "extra", i: number, value: string) {
    const r = this.currentRound();
    if (!r || this.S?.phase !== "playing") return;
    this.draft(r.no)[field][i] = value.slice(0, 40);
    this.saveDraft(r.no);
    this.sendDraft(false);
  }

  private sendDraft(immediate: boolean) {
    const r = this.currentRound();
    if (!r) return;
    if (this.draftTimer) clearTimeout(this.draftTimer);
    const go = () => {
      const d = this.draft(r.no);
      if (this.isHost()) {
        if (!this.finishPayload[this.myId]) this.collected[this.myId] = d;
      } else this.send({ t: "draft", d: { round: r.no, main: d.main, extra: d.extra } });
    };
    if (immediate) go();
    else this.draftTimer = setTimeout(go, 700);
  }

  /** زر "انتهيت": تحقق ثم أرسل للمضيف. يرجع قائمة الأخطاء (فارغة = نجح) */
  async finish(): Promise<string[]> {
    const r = this.currentRound();
    const S = this.S;
    if (!r || !S || S.phase !== "playing") return ["الجولة انتهت"];
    if (this.now() < r.startedAt) return ["انتظر لحظة، الجولة ما بدأت"];
    const elapsedMs = Math.max(0, Math.round(this.now() - r.startedAt));
    const d = this.draft(r.no);
    const res = await validate(r.letter, d.main.map((answer, cat) => ({ cat, answer })));
    if (res.aiEnabled != null) this.aiEnabled = res.aiEnabled;
    const errors = res.results.map((x) => (x.ok ? "" : x.reason || "إجابة غير صحيحة")).filter(Boolean);
    if (errors.length) {
      sounds.error();
      return errors;
    }
    if (this.S?.phase !== "playing" || this.currentRound()?.no !== r.no) return ["انتهت الجولة قبل التحقق 😅"];
    if (this.isHost()) this.hostFinish(this.myId, r.no, elapsedMs, d.main, d.extra);
    else this.send({ t: "finish", d: { round: r.no, elapsedMs, main: d.main, extra: d.extra } });
    sounds.finish();
    return [];
  }

  // ---------- أوامر المضيف ----------
  updateSettings(p: Partial<Settings>) {
    if (!this.isHost() || !this.S || this.S.phase !== "lobby") return;
    Object.assign(this.S.settings, p);
    this.broadcast();
  }

  startGame() {
    if (!this.isHost() || !this.S) return;
    this.S.rounds = [];
    this.S.used = [];
    this.startRound();
  }

  startRound() {
    const S = this.S;
    if (!this.isHost() || !S) return;
    const allowed = ALL_LETTERS.filter((l) => !(S.settings.hardOff && HARD_LETTERS.includes(l)));
    let pool = allowed.filter((l) => !S.used.includes(l));
    if (!pool.length) {
      S.used = [];
      pool = allowed;
    }
    const letter = pool[Math.floor(Math.random() * pool.length)];
    S.used.push(letter);
    const participants = S.order.filter((id) => this.online.includes(id));
    const startedAt = Date.now() + 1500; // مهلة صغيرة حتى تصل الرسالة للجميع
    S.rounds.push({
      no: S.rounds.length + 1,
      letter,
      startedAt,
      endsAt: startedAt + S.settings.time * 1000,
      closedAt: 0,
      participants,
      finishers: [],
      needed: neededFinishers(participants.length),
      answers: {},
      checks: {},
      overrides: {},
      ai: false,
    });
    S.phase = "playing";
    this.collected = {};
    this.finishPayload = {};
    this.finalizing = false;
    this.broadcast();
  }

  private hostFinish(from: string, round: number, elapsedMs: number, main: string[], extra: string[]) {
    const S = this.S;
    const r = this.currentRound();
    if (!S || !r || S.phase !== "playing" || r.no !== round) return;
    if (!r.participants.includes(from) || r.finishers.some((f) => f.id === from)) return;
    const clean = (a: string[]) => CATEGORIES.map((_, i) => String(a?.[i] || "").trim().slice(0, 40));
    const m = clean(main);
    // فحص احتياطي للحرف عند المضيف
    if (!m.every((w) => startsWithLetter(w, r.letter))) return;
    const maxElapsed = Date.now() - r.startedAt + 1000;
    r.finishers.push({ id: from, elapsedMs: Math.min(Math.max(0, elapsedMs), Math.max(0, maxElapsed)) });
    this.finishPayload[from] = { main: m, extra: clean(extra) };
    if (r.finishers.length >= r.needed) this.closeRound();
    else this.broadcast();
  }

  private closeRound() {
    const S = this.S;
    const r = this.currentRound();
    if (!S || !r) return;
    S.phase = "closing";
    r.closedAt = Date.now();
    this.collectUntil = Date.now() + COLLECT_MS;
    this.sendDraft(true);
    this.broadcast();
  }

  private async finalizeRound() {
    const S = this.S;
    const r = this.currentRound();
    if (!S || !r || this.finalizing) return;
    this.finalizing = true;
    const answers: RoundRecord["answers"] = {};
    const checks: RoundRecord["checks"] = {};
    const items: { pid: string; cat: number; answer: string }[] = [];
    const clean = (a?: string[]) => CATEGORIES.map((_, i) => String(a?.[i] || "").trim().slice(0, 40));
    for (const pid of r.participants) {
      const fp = this.finishPayload[pid];
      const src = fp || this.collected[pid] || (pid === this.myId ? this.draft(r.no) : undefined);
      answers[pid] = { main: clean(src?.main), extra: clean(src?.extra) };
      if (fp) checks[pid] = CATEGORIES.map(() => ({ ok: true }));
      else {
        checks[pid] = CATEGORIES.map(() => ({ ok: false }) as Check);
        answers[pid].main.forEach((answer, cat) => {
          if (answer) items.push({ pid, cat, answer });
          else checks[pid][cat] = { ok: false, reason: "فاضية" };
        });
      }
    }
    let ai = false;
    if (items.length) {
      const res = await validate(r.letter, items.map(({ cat, answer }) => ({ cat, answer })));
      ai = !!res.ai;
      items.forEach((it, i) => (checks[it.pid][it.cat] = res.results[i] || { ok: true }));
    } else ai = this.aiEnabled ?? false;
    // تأكد أن الحالة ما تغيرت أثناء الانتظار
    if (this.S !== S || this.currentRound() !== r || S.phase !== "closing" || !this.isHost()) {
      this.finalizing = false;
      return;
    }
    r.answers = answers;
    r.checks = checks;
    r.ai = ai;
    S.phase = "results";
    this.finalizing = false;
    this.broadcast();
  }

  toggleOverride(pid: string, i: number, currentValid: boolean) {
    const S = this.S;
    const r = this.currentRound();
    if (!this.isHost() || !S || !r || S.phase !== "results") return;
    const key = `${pid}|${i}`;
    r.overrides[key] = !currentValid;
    this.broadcast();
  }

  endGame() {
    if (!this.isHost() || !this.S) return;
    this.S.phase = "final";
    this.broadcast();
  }

  backToLobby() {
    if (!this.isHost() || !this.S) return;
    this.S.phase = "lobby";
    this.S.rounds = [];
    this.S.used = [];
    this.broadcast();
  }

  // ---------- الحلقة الدورية ----------
  private tick() {
    const S = this.S;
    if (!S) return;
    const r = this.currentRound();
    // صوت تكتكة في آخر 5 ثواني
    if (S.phase === "playing" && r) {
      const left = Math.ceil((r.endsAt - this.now()) / 1000);
      if (left <= 5 && left > 0 && left !== this.lastTickSec) {
        this.lastTickSec = left;
        sounds.tick();
      }
    }
    if (this.isHost()) {
      const t = Date.now();
      if (S.phase === "playing" && r && t >= r.endsAt) this.closeRound();
      else if (S.phase === "closing" && t >= this.collectUntil) void this.finalizeRound();
      else if (t - S.hostNow > 4000) this.broadcast(); // نبضة دورية
    } else this.checkHost();
  }

  private checkHost() {
    const S = this.S;
    if (!S) return;
    if (this.online.includes(S.hostId)) {
      this.hostMissingSince = 0;
      return;
    }
    if (!this.hostMissingSince) {
      this.hostMissingSince = Date.now();
      return;
    }
    if (Date.now() - this.hostMissingSince < HOST_TIMEOUT_MS) return;
    const candidate = S.order.find((id) => this.online.includes(id));
    if (candidate !== this.myId) return;
    // تسلّم دور المضيف وحوّل الأوقات لساعتي
    for (const r of S.rounds) {
      r.startedAt -= this.offset;
      r.endsAt -= this.offset;
      if (r.closedAt) r.closedAt -= this.offset;
    }
    this.offset = 0;
    S.hostId = this.myId;
    S.v += 5;
    this.collected = {};
    this.finishPayload = {};
    this.finalizing = false;
    if (S.phase === "closing") this.collectUntil = Date.now() + COLLECT_MS;
    this.hostMissingSince = 0;
    this.toast("أصبحت أنت المضيف 👑", "success");
    this.broadcast();
  }
}

async function validate(letter: string, items: { cat: number; answer: string }[]) {
  try {
    const res = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letter, items }),
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as { results: Check[]; ai: boolean; aiEnabled?: boolean };
  } catch {
    // بدون خادم: القواعد والقاموس
    return {
      ai: false,
      aiEnabled: undefined,
      results: items.map(({ cat, answer }) => offlineCheck(cat, answer, letter)),
    };
  }
}
