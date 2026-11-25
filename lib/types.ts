export type Phase = "lobby" | "playing" | "closing" | "results" | "final";

export interface Player {
  name: string;
  joinedAt: number;
}

export interface Finisher {
  id: string;
  elapsedMs: number; // الزمن من بداية الجولة حتى ضغط "انتهيت" بنجاح
}

export interface Check {
  ok: boolean;
  reason?: string;
}

export interface RoundRecord {
  no: number;
  letter: string;
  startedAt: number; // بساعة المضيف
  endsAt: number;
  closedAt: number;
  participants: string[];
  finishers: Finisher[]; // بالترتيب، أول من أنهى أولاً
  needed: number; // عدد المنهين المطلوب لإغلاق الجولة
  answers: Record<string, { main: string[]; extra: string[] }>;
  checks: Record<string, Check[]>;
  overrides: Record<string, boolean>; // "playerId|catIndex" -> قرار المضيف
  ai: boolean;
}

export interface Settings {
  rounds: number;
  time: number; // ثواني
  hardOff: boolean;
}

export interface GameState {
  v: number;
  hostId: string;
  hostNow: number;
  phase: Phase;
  settings: Settings;
  players: Record<string, Player>;
  order: string[];
  rounds: RoundRecord[];
  used: string[];
}

export type Msg =
  | { t: "state"; d: GameState }
  | { t: "hello"; d: { name: string } }
  | { t: "finish"; d: { round: number; elapsedMs: number; main: string[]; extra: string[] } }
  | { t: "draft"; d: { round: number; main: string[]; extra: string[] } }
  | { t: "sync" }
  | { t: "drafts" };
