import { CATEGORIES, compareKey } from "./arabic";
import type { GameState, RoundRecord } from "./types";

export interface CellResult {
  main: string;
  extra: string;
  valid: boolean;
  points: number;
  reason?: string;
  overridden: boolean;
  extraValid: boolean;
  extraPoints: number;
  extraReason?: string;
}

export interface RoundScore {
  cells: Record<string, CellResult[]>;
  points: Record<string, number>;
  time: Record<string, number | null>; // null = ما أنهى
  ranking: string[];
}

/**
 * حساب نقاط جولة، لكل خانة:
 * الإجابة الأساسية والإجابة الثانية تنحسب بنفس القاعدة: 10 للفريدة، 5 للمكررة، 0 للفارغة أو الخاطئة.
 * التكرار يُحسب بين كل الإجابات الصحيحة في الخانة (الأساسية والثانية لكل اللاعبين).
 * الإجابة الثانية إذا كانت نفس إجابتك الأساسية = 0.
 */
export function scoreRound(r: RoundRecord): RoundScore {
  const cells: Record<string, CellResult[]> = {};
  const points: Record<string, number> = {};
  const time: Record<string, number | null> = {};

  r.participants.forEach((pid) => {
    const a = r.answers[pid] || { main: [], extra: [] };
    cells[pid] = CATEGORIES.map((_, i) => {
      const main = (a.main[i] || "").trim();
      const extra = (a.extra[i] || "").trim();
      const chk = r.checks[pid]?.[i];
      const key = `${pid}|${i}`;
      const overridden = key in r.overrides;
      const valid = overridden ? r.overrides[key] && !!main : !!main && !!chk?.ok;
      const xchk = r.checksX?.[pid]?.[i];
      const xkey = `${pid}|x|${i}`;
      let extraValid = xkey in r.overrides ? r.overrides[xkey] && !!extra : !!extra && !!xchk?.ok;
      let extraReason = xchk?.reason;
      if (extraValid && main && compareKey(extra) === compareKey(main)) {
        extraValid = false;
        extraReason = "نفس إجابتك الأولى";
      }
      return { main, extra, valid, points: 0, reason: chk?.reason, overridden, extraValid, extraPoints: 0, extraReason };
    });
    const f = r.finishers.find((x) => x.id === pid);
    time[pid] = f ? f.elapsedMs : null;
  });

  CATEGORIES.forEach((_, i) => {
    const counts: Record<string, number> = {};
    const add = (w: string) => (counts[compareKey(w)] = (counts[compareKey(w)] || 0) + 1);
    r.participants.forEach((pid) => {
      const c = cells[pid][i];
      if (c.valid) add(c.main);
      if (c.extraValid) add(c.extra);
    });
    r.participants.forEach((pid) => {
      const c = cells[pid][i];
      c.points = c.valid ? (counts[compareKey(c.main)] > 1 ? 5 : 10) : 0;
      c.extraPoints = c.extraValid ? (counts[compareKey(c.extra)] > 1 ? 5 : 10) : 0;
    });
  });

  r.participants.forEach((pid) => {
    points[pid] = cells[pid].reduce((s, c) => s + c.points + c.extraPoints, 0);
  });

  const ranking = [...r.participants].sort((a, b) => {
    if (points[b] !== points[a]) return points[b] - points[a];
    return (time[a] ?? Infinity) - (time[b] ?? Infinity); // الأسرع أولاً
  });
  return { cells, points, time, ranking };
}

export interface Standing {
  id: string;
  total: number;
  timeMs: number; // مجموع الأزمنة (من لم ينهِ يُحسب له زمن الجولة كاملاً)
  roundsPlayed: number;
}

/** الترتيب العام: المجموع ثم الأسرع (أقل مجموع زمن) */
export function standings(s: GameState): Standing[] {
  const map: Record<string, Standing> = {};
  s.order.forEach((id) => (map[id] = { id, total: 0, timeMs: 0, roundsPlayed: 0 }));
  s.rounds.forEach((r) => {
    if (!r.closedAt) return;
    const sc = scoreRound(r);
    const full = r.closedAt - r.startedAt;
    r.participants.forEach((pid) => {
      if (!map[pid]) return;
      map[pid].total += sc.points[pid];
      map[pid].timeMs += sc.time[pid] ?? full;
      map[pid].roundsPlayed++;
    });
  });
  return Object.values(map).sort((a, b) => (b.total !== a.total ? b.total - a.total : a.timeMs - b.timeMs));
}

export function fmtTime(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms)) return "—";
  const s = Math.floor(ms / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m > 0 ? m + ":" + String(ss).padStart(2, "0") : ss}.${String(cs).padStart(2, "0")}`;
}

/** عدد المنهين المطلوب لإغلاق الجولة: لاعب واحد إذا كانوا 2 أو أقل، واثنين إذا 3 فأكثر */
export function neededFinishers(n: number, setting = 0): number {
  if (setting === -1) return Math.max(1, n); // كل اللاعبين
  if (setting > 0) return Math.max(1, Math.min(setting, n));
  return n >= 3 ? 2 : 1; // تلقائي
}

/** نص يوضح متى تنتهي الجولة */
export function finishRuleText(needed: number, total: number): string {
  if (needed >= total && total > 1) return "كل اللاعبين ينهون";
  if (needed === 1) return "أول لاعب ينهي";
  if (needed === 2) return "أول لاعبين ينهون";
  return `أول ${needed} لاعبين ينهون`;
}
