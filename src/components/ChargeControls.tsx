import { useEffect, useRef, useState } from "react";
import { AlarmClock, Gauge, Loader2, Play, Square, X } from "lucide-react";

interface ChargeSettings {
  amps?: number;
  limit?: number;
}

interface NumberSetting {
  value: number | null;
  min: number;
  max: number;
  step: number;
}

interface ChargeControlStatus {
  configured: boolean;
  reason: string | null;
  entity: string | null;
  scheduledAt: number | null;
  scheduledSettings: ChargeSettings | null;
  canSetAmps: boolean;
  canSetLimit: boolean;
  lastRun: { at: number; action: "on" | "off"; scheduled: boolean; ok: boolean; pending?: boolean; error?: string; warning?: string } | null;
  // Only sent by GET: current values and ranges read from Home Assistant
  settings?: { amps: NumberSetting | null; limit: NumberSetting | null };
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

function describeSettings(settings: ChargeSettings | null): string {
  if (!settings) return "";
  const parts = [settings.amps !== undefined && `${settings.amps} A`, settings.limit !== undefined && `${settings.limit} %`];
  return parts.filter(Boolean).join(" · ");
}

// Empty field: setting left unchanged; otherwise an integer within the entity's range
function parseSetting(input: string, range: NumberSetting | null | undefined): number | undefined | null {
  if (input.trim() === "") return undefined;
  const value = Number(input);
  if (!Number.isInteger(value)) return null;
  if (range && (value < range.min || value > range.max)) return null;
  return value;
}

// Charge start / stop and scheduled start through the Home Assistant switch (admin only)
export default function ChargeControls({ token, isCharging }: ChargeControlsProps) {
  const [status, setStatus] = useState<ChargeControlStatus | null>(null);
  const [time, setTime] = useState("23:00");
  const [ampsInput, setAmpsInput] = useState("");
  const [limitInput, setLimitInput] = useState("");
  const [pending, setPending] = useState<Action | null>(null);
  // Commands acting on the car need a second click to confirm
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "pending" | "warn" | "error"; text: string } | null>(null);
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

  // While a command waits for the car to wake up, poll its outcome and replace the pending message
  const isPending = feedback?.tone === "pending";
  useEffect(() => {
    if (!isPending) return;
    const interval = setInterval(async () => {
      const res = await fetch(`api/charge-control?token=${encodeURIComponent(token)}`).catch(() => null);
      const data: ChargeControlStatus | null = res?.ok ? await res.json() : null;
      if (!data) return;
      setStatus(data);
      if (data.lastRun && !data.lastRun.pending) {
        setFeedback(
          data.lastRun.ok && data.lastRun.warning
            ? { tone: "warn", text: `Démarrage confirmé, mais : ${data.lastRun.warning}` }
            : data.lastRun.ok
            ? { tone: "ok", text: data.lastRun.action === "on" ? "Démarrage confirmé par la voiture." : "Arrêt confirmé par la voiture." }
            : { tone: "error", text: data.lastRun.error || "Échec de la commande." }
        );
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isPending, token]);

  if (!status) return null;
  if (!status.configured) {
    return (
      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex gap-2 text-[10px] leading-relaxed text-slate-400">
        <AlarmClock className="w-4 h-4 shrink-0 text-slate-500" />
        <p>
          <span className="block font-bold uppercase tracking-wider text-slate-500 mb-0.5">Pilotage de la recharge désactivé</span>
          {status.reason}
        </p>
      </div>
    );
  }

  const ranges = status.settings;
  const amps = status.canSetAmps ? parseSetting(ampsInput, ranges?.amps) : undefined;
  const limit = status.canSetLimit ? parseSetting(limitInput, ranges?.limit) : undefined;
  const settingsValid = amps !== null && limit !== null;
  const hasSettings = status.canSetAmps || status.canSetLimit;

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
      const settings: ChargeSettings | undefined =
        action === "start" || action === "schedule" ? { amps: amps ?? undefined, limit: limit ?? undefined } : undefined;
      const res = await fetch(`api/charge-control?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, at, settings }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      // POST answers carry no settings: keep the ones last read
      setStatus((prev) => ({ ...data, settings: data.settings ?? prev?.settings }));
      const detail = settings ? describeSettings(settings) : "";
      const messages: Record<Action, string> = {
        start: `Démarrage demandé à la voiture${detail ? ` (${detail})` : ""}.`,
        stop: "Arrêt demandé à la voiture.",
        schedule: `Recharge programmée ${data.scheduledAt ? formatSchedule(data.scheduledAt) : ""}${detail ? ` (${detail})` : ""}.`,
        cancel: "Programmation annulée.",
      };
      if (data.lastRun?.pending && (action === "start" || action === "stop")) {
        setFeedback({ tone: "pending", text: "Commande envoyée, la voiture se réveille… (jusqu'à une minute)" });
      } else if (data.lastRun?.warning && action === "start") {
        setFeedback({ tone: "warn", text: `Démarrage confirmé, mais : ${data.lastRun.warning}` });
      } else {
        setFeedback({ tone: "ok", text: messages[action] });
      }
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setPending(null);
    }
  };

  const nowAction: Action = isCharging ? "stop" : "start";
  const lastScheduledFailure = status.lastRun?.scheduled && !status.lastRun.ok && !status.lastRun.pending ? status.lastRun : null;

  const fieldClass =
    "w-full min-w-0 bg-slate-900 border rounded-lg pl-2.5 pr-7 py-1.5 text-xs font-mono font-bold text-white placeholder:text-slate-600 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="space-y-2.5">
      {/* Charging current and limit, applied before starting (now or scheduled) */}
      {hasSettings && (!isCharging || !status.scheduledAt) && (
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Réglages au démarrage</span>
          </div>
          <div className="flex gap-2">
            {status.canSetAmps && (
              <label className="flex-1 min-w-0">
                <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">
                  Ampérage{ranges?.amps ? ` (${ranges.amps.min}–${ranges.amps.max})` : ""}
                </span>
                <span className="relative block">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={ranges?.amps?.min}
                    max={ranges?.amps?.max}
                    step={1}
                    value={ampsInput}
                    onChange={(e) => setAmpsInput(e.target.value)}
                    placeholder={ranges?.amps?.value != null ? String(ranges.amps.value) : "—"}
                    className={`${fieldClass} ${amps === null ? "border-rose-500" : "border-slate-800 focus:border-emerald-500"}`}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">A</span>
                </span>
              </label>
            )}
            {status.canSetLimit && (
              <label className="flex-1 min-w-0">
                <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">
                  Limite{ranges?.limit ? ` (${ranges.limit.min}–${ranges.limit.max})` : ""}
                </span>
                <span className="relative block">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={ranges?.limit?.min}
                    max={ranges?.limit?.max}
                    step={1}
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                    placeholder={ranges?.limit?.value != null ? String(ranges.limit.value) : "—"}
                    className={`${fieldClass} ${limit === null ? "border-rose-500" : "border-slate-800 focus:border-emerald-500"}`}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">%</span>
                </span>
              </label>
            )}
          </div>
          <p className="mt-1.5 text-[9px] text-slate-500">Vide : valeur actuelle conservée. Le réglage reste ensuite dans la voiture.</p>
        </div>
      )}

      {/* Start / stop now */}
      <button
        onClick={() => run(nowAction)}
        disabled={pending !== null || (nowAction === "start" && !settingsValid)}
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
            <span className="text-xs font-bold text-sky-300 first-letter:uppercase">
              {formatSchedule(status.scheduledAt)}
              {status.scheduledSettings && (
                <span className="block text-[10px] font-semibold text-slate-400 normal-case">{describeSettings(status.scheduledSettings)}</span>
              )}
            </span>
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
              disabled={pending !== null || nextOccurrence(time) === null || !settingsValid}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer disabled:opacity-60"
            >
              {pending === "schedule" ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlarmClock className="w-3 h-3" />}
              Programmer
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <p className={`text-[10px] font-semibold ${
          feedback.tone === "ok" ? "text-emerald-400" : feedback.tone === "pending" || feedback.tone === "warn" ? "text-amber-400" : "text-rose-400"
        }`}>{feedback.text}</p>
      )}
      {!feedback && lastScheduledFailure && (
        <p className="text-[10px] font-semibold text-rose-400">
          Échec du démarrage programmé ({new Date(lastScheduledFailure.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}) : {lastScheduledFailure.error}
        </p>
      )}
    </div>
  );
}
