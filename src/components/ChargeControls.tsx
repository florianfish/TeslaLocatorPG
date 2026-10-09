import { useEffect, useRef, useState } from "react";
import { AlarmClock, Loader2, Play, Square, X } from "lucide-react";

interface ChargeControlStatus {
  configured: boolean;
  entity: string | null;
  scheduledAt: number | null;
  lastRun: { at: number; action: "on" | "off"; scheduled: boolean; ok: boolean; error?: string } | null;
}

interface ChargeControlsProps {
  token: string;
  isCharging: boolean;
}

type Action = "start" | "stop" | "schedule" | "cancel";

// Next occurrence of HH:MM in the browser's timezone (today, or tomorrow if already past)
function nextOccurrence(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  return date.getTime();
}

function formatSchedule(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return `aujourd'hui à ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `demain à ${time}`;
  return `${date.toLocaleDateString("fr-FR", { weekday: "long" })} à ${time}`;
}

// Charge start / stop and scheduled start through the Home Assistant switch (admin only)
export default function ChargeControls({ token, isCharging }: ChargeControlsProps) {
  const [status, setStatus] = useState<ChargeControlStatus | null>(null);
  const [time, setTime] = useState("23:00");
  const [pending, setPending] = useState<Action | null>(null);
  // Commands acting on the car need a second click to confirm
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const load = () =>
      fetch(`api/charge-control?token=${encodeURIComponent(token)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setStatus(data))
        .catch(() => {});
    load();
    const interval = setInterval(load, 30000);
    return () => {
      clearInterval(interval);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, [token]);

  if (!status?.configured) return null;

  const run = async (action: Action) => {
    if ((action === "start" || action === "stop") && confirming !== action) {
      setConfirming(action);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirming(null), 4000);
      return;
    }
    setConfirming(null);
    setPending(action);
    setFeedback(null);
    try {
      const at = action === "schedule" ? nextOccurrence(time) : undefined;
      const res = await fetch(`api/charge-control?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, at }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setStatus(data);
      const messages: Record<Action, string> = {
        start: "Démarrage demandé à la voiture.",
        stop: "Arrêt demandé à la voiture.",
        schedule: `Recharge programmée ${data.scheduledAt ? formatSchedule(data.scheduledAt) : ""}.`,
        cancel: "Programmation annulée.",
      };
      setFeedback({ ok: true, text: messages[action] });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setPending(null);
    }
  };

  const nowAction: Action = isCharging ? "stop" : "start";
  const lastScheduledFailure = status.lastRun?.scheduled && !status.lastRun.ok ? status.lastRun : null;

  return (
    <div className="space-y-2.5">
      {/* Start / stop now */}
      <button
        onClick={() => run(nowAction)}
        disabled={pending !== null}
        className={`w-full rounded-xl py-2.5 px-4 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-wait ${
          confirming === nowAction
            ? "bg-amber-500 text-slate-950 animate-pulse"
            : isCharging
            ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40"
            : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40"
        }`}
      >
        {pending === nowAction ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isCharging ? (
          <Square className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        {confirming === nowAction ? "Confirmer ?" : isCharging ? "Arrêter la charge" : "Démarrer la charge"}
      </button>

      {/* Scheduled start */}
      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60">
        <div className="flex items-center gap-2 mb-2">
          <AlarmClock className="w-4 h-4 text-sky-400" />
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Démarrage programmé</span>
        </div>
        {status.scheduledAt ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-sky-300 first-letter:uppercase">{formatSchedule(status.scheduledAt)}</span>
            <button
              onClick={() => run("cancel")}
              disabled={pending !== null}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer disabled:opacity-60"
            >
              {pending === "cancel" ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              Annuler
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-white [color-scheme:dark] focus:outline-none focus:border-sky-500"
            />
            <button
              onClick={() => run("schedule")}
              disabled={pending !== null || nextOccurrence(time) === null}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer disabled:opacity-60"
            >
              {pending === "schedule" ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlarmClock className="w-3 h-3" />}
              Programmer
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <p className={`text-[10px] font-semibold ${feedback.ok ? "text-emerald-400" : "text-rose-400"}`}>{feedback.text}</p>
      )}
      {!feedback && lastScheduledFailure && (
        <p className="text-[10px] font-semibold text-rose-400">
          Échec du démarrage programmé ({new Date(lastScheduledFailure.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}) : {lastScheduledFailure.error}
        </p>
      )}
    </div>
  );
}
