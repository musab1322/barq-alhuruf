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
  id: string; // معرّف فريد للجولة
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
  checksX?: Record<string, Check[]>; // التحقق من الإجابة الثانية
  overrides: Record<string, boolean>; // "playerId|catIndex" -> قرار المضيف
  ai: boolean;
}

export interface Settings {
  rounds: number;
  time: number; // ثواني
  hardOff: boolean;
  letters?: string[]; // الحروف المسموحة (إذا فاضية نستخدم hardOff)
  finishers?: number; // 0 = تلقائي، -1 = كل اللاعبين، أو عدد محدد
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
  chat?: ChatMsg[];
}

export type Msg =
  | { t: "state"; d: GameState }
  | { t: "hello"; d: { name: string; prev?: string } }
  | { t: "finish"; d: { round: number; elapsedMs: number; main: string[]; extra: string[] } }
  | { t: "draft"; d: { round: number; main: string[]; extra: string[] } }
  | { t: "sync" }
  | { t: "drafts" }
  | { t: "chat"; d: { text: string } };

export interface ChatMsg {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
}
