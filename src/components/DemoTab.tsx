import { useEffect, useState } from "react";
import { BatteryCharging, Navigation2, ParkingSquare, Play, Square } from "lucide-react";
import { MqttStatus } from "../types";

type Scenario = "drive" | "charging" | "parked";

interface SimulatorStatus {
  running: boolean;
  scenario: Scenario | null;
  progress: number;
}

interface DemoTabProps {
  token: string;
  mqttStatus: MqttStatus;
}

const SCENARIOS: { key: Scenario; label: string; description: string; icon: typeof Play; color: string }[] = [
  {
    key: "drive",
    label: "Trajet avec navigation",
    description: "Arc de Triomphe → Gare de Lyon : position, vitesse, batterie et itinéraire actif.",
    icon: Navigation2,
    color: "text-sky-400",
  },
  {
    key: "charging",
    label: "Recharge rapide",
    description: "Superchargeur de 18 % à 80 %, avec courbe de puissance dégressive.",
    icon: BatteryCharging,
    color: "text-emerald-400",
  },
  {
    key: "parked",
    label: "Garée sous Sentinelle",
    description: "Voiture verrouillée, Sentinelle active, pneu arrière gauche sous-gonflé.",
    icon: ParkingSquare,
    color: "text-rose-400",
  },
];

export default function DemoTab({ token, mqttStatus }: DemoTabProps) {
  const [status, setStatus] = useState<SimulatorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = async (init?: RequestInit) => {
    try {
      const res = await fetch(`api/simulator?token=${encodeURIComponent(token)}`, init);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const send = (body: { action: "start" | "stop"; scenario?: Scenario }) =>
    request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  // Poll the progress while the tab is open
  useEffect(() => {
    request();
    const interval = setInterval(request, 1000);
    return () => clearInterval(interval);
  }, [token]);

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-950/20 text-[11px] text-amber-200/90 leading-relaxed">
        <span className="font-bold uppercase tracking-wider text-amber-400">Mode démo (dev uniquement)</span>
        <p className="mt-1">
          Injecte des trames TeslaMate fictives dans le serveur local. Elles ne sont pas publiées sur le broker et ne
          déclenchent pas d'alerte Telegram.
        </p>
        {mqttStatus === "connected" && (
          <p className="mt-1 text-amber-300">Le broker est connecté : les vraies données de la voiture se mélangeront à la démo.</p>
        )}
      </div>

      <div className="space-y-2">
        {SCENARIOS.map(({ key, label, description, icon: Icon, color }) => {
          const isRunning = status?.running && status.scenario === key;
          return (
            <div
              key={key}
              className={`p-3 rounded-xl border transition-colors ${
                isRunning ? "bg-slate-950 border-cyan-500/40" : "bg-slate-950 border-slate-800/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 shrink-0 ${color}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-200">{label}</p>
                  <p className="text-[10px] text-slate-500 leading-snug">{description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => send(isRunning ? { action: "stop" } : { action: "start", scenario: key })}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    isRunning
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30"
                      : "bg-cyan-600 hover:bg-cyan-500 text-white"
                  }`}
                >
                  {isRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {isRunning ? "Arrêter" : "Lancer"}
                </button>
              </div>
              {status?.scenario === key && key !== "parked" && (
                <div className="mt-2.5 h-1.5 rounded-full bg-slate-900 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${isRunning ? "bg-cyan-500" : "bg-slate-600"}`}
                    style={{ width: `${Math.round(status.progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-rose-400">Simulateur indisponible : {error}</p>}
    </div>
  );
}
