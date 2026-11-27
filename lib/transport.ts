"use client";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { Msg } from "./types";

/**
 * طبقة الاتصال اللحظي.
 * - الإنتاج: Supabase Realtime (Broadcast للرسائل + Presence لمعرفة المتصلين).
 * - التجربة المحلية (?local=1): BroadcastChannel بين تبويبات نفس المتصفح.
 */

export interface Transport {
  send(msg: Msg): void;
  close(): void;
}

export interface Handlers {
  onMsg(msg: Msg, from: string): void;
  onPresence(ids: string[]): void;
  onReady(): void;
  onReconnect?(): void;
  onStatus?(s: string): void;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://townyhytnscdupxrtflv.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvd255aHl0bnNjZHVweHJ0Zmx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyODI1OTgsImV4cCI6MjExMDg1ODU5OH0.qlEYvCRdC7G5KGMDXdl1DJkbuBYvKMr-lUFsAQBBP9A";

export function connect(room: string, myId: string, h: Handlers, local: boolean): Transport {
  if (local) return localTransport(room, myId, h);

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 30 } } });
  const ch: RealtimeChannel = client.channel(`insan-${encodeURIComponent(room)}`, {
    config: { broadcast: { self: false, ack: false }, presence: { key: myId } },
  });
  ch.on("broadcast", { event: "m" }, ({ payload }) => {
    if (payload?.msg) h.onMsg(payload.msg as Msg, payload.from);
  });
  ch.on("presence", { event: "sync" }, () => {
    const ids = Object.keys(ch.presenceState());
    if (!ids.includes(myId)) ids.push(myId);
    h.onPresence(ids);
  });
  let ready = false;
  ch.subscribe((status) => {
    h.onStatus?.(status);
    if (status === "SUBSCRIBED") {
      ch.track({ at: Date.now() });
      if (!ready) {
        ready = true;
        h.onReady();
      } else h.onReconnect?.();
    }
  });
  return {
    send(msg) {
      ch.send({ type: "broadcast", event: "m", payload: { msg, from: myId } });
    },
    close() {
      client.removeChannel(ch);
    },
  };
}

function localTransport(room: string, myId: string, h: Handlers): Transport {
  const bc = new BroadcastChannel(`insan-${room}`);
  const seen: Record<string, number> = {};
  const emit = () => {
    const now = Date.now();
    const ids = Object.keys(seen).filter((k) => now - seen[k] < 3500);
    ids.push(myId);
    h.onPresence(ids);
  };
  bc.onmessage = (e) => {
    const m = e.data;
    if (m.ping) {
      const isNew = !seen[m.from];
      seen[m.from] = Date.now();
      if (isNew) emit();
      return;
    }
    h.onMsg(m.msg, m.from);
  };
  const ping = () => bc.postMessage({ ping: true, from: myId });
  const iv = setInterval(() => {
    ping();
    emit();
  }, 1000);
  ping();
  setTimeout(() => h.onReady(), 50);
  return {
    send(msg) {
      bc.postMessage({ msg, from: myId });
    },
    close() {
      clearInterval(iv);
      bc.close();
    },
  };
}
