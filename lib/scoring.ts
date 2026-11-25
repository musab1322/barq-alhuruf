import { CATEGORIES, compareKey } from "./arabic";
import type { GameState, RoundRecord } from "./types";

export interface CellResult {
  main: string;
  extra: string;
  valid: boolean;
  points: number;
  reason?: string;
  overridden: boolean;
}

export interface RoundScore {
  cells: Record<string, CellResult[]>;
  points: Record<string, number>;
  time: Record<string, number | null>; // null = ما أنهى
  ranking: string[];
}

/** حساب نقاط جولة: 10 للفريدة، 5 للمكررة، 0 للفارغة أو الخاطئة. الإجابة الثانية دائماً 0 */
export function scoreRound(r: RoundRecord): RoundScore {
  const cells: Record<string, CellResult[]> = {};
  const points: Record<string, number> = {};
  const time: Record<string, number | null> = {};

  r.participants.forEach((pid) => {
    const a = r.answers[pid] || { main: [], extra: [] };
    cells[pid] = CATEGORIES.map((_, i) => {
      const main = (a.main[i] || "").trim();
      const chk = r.checks[pid]?.[i];
      const key = `${pid}|${i}`;
      const overridden = key in r.overrides;
      const valid = overridden ? r.overrides[key] && !!main : !!main && !!chk?.ok;
      return { main, extra: (a.extra[i] || "").trim(), valid, points: 0, reason: chk?.reason, overridden };
    });
    const f = r.finishers.find((x) => x.id === pid);
    time[pid] = f ? f.elapsedMs : null;
  });

  CATEGORIES.forEach((_, i) => {
    const counts: Record<string, number> = {};
    r.participants.forEach((pid) => {
      const c = cells[pid][i];
      if (c.valid) counts[compareKey(c.main)] = (counts[compareKey(c.main)] || 0) + 1;
    });
    r.participants.forEach((pid) => {
      const c = cells[pid][i];
      c.points = c.valid ? (counts[compareKey(c.main)] > 1 ? 5 : 10) : 0;
    });
  });

  r.participants.forEach((pid) => {
    points[pid] = cells[pid].reduce((s, c) => s + c.points, 0);
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
export function neededFinishers(n: number): number {
  return n >= 3 ? 2 : 1;
}
