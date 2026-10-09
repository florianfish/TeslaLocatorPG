import { useState } from "react";
import { BatteryCharging, ChevronDown, ChevronUp, Clock, Gauge, Plug, Route, Zap } from "lucide-react";
import { ChargingData } from "../types";
import ChargeControls from "./ChargeControls";

interface ChargingPanelProps {
  charging: ChargingData | null;
  batteryLevel: number | null;
  // Plugged in but not charging (stopped, waiting for a scheduled start, or limit reached)
  isCharging?: boolean;
  // Hides the details, e.g. while the telemetry panel above is expanded and needs the height
  compact?: boolean;
  // Admin token (empty through Ingress): shows the start / stop / schedule controls when configured on the server
  controlsToken?: string;
}

// TeslaMate publishes time_to_full_charge in decimal hours
function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${m.toString().padStart(2, "0")}`;
}

function formatEta(hours: number): string {
  const eta = new Date(Date.now() + hours * 3600 * 1000);
  return eta.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function ChargingPanel({ charging, batteryLevel, isCharging = true, compact = false, controlsToken }: ChargingPanelProps) {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const power = charging?.charger_power ?? null;
  const limit = charging?.charge_limit_soc ?? null;
  const timeToFull = charging?.time_to_full_charge ?? null;
  const hasTimeToFull = timeToFull !== null && timeToFull > 0;
  // Above ~22 kW the car is on a DC fast charger (Supercharger, Ionity...)
  const isFastCharging = power !== null && power > 22;
  const level = batteryLevel !== null ? Math.max(0, Math.min(100, batteryLevel)) : null;

  return (
    <div className="w-full md:w-96 shrink-0 pointer-events-auto font-sans">
      <div className="bg-slate-900/90 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-4 shadow-2xl shadow-emerald-500/10 flex flex-col gap-3.5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              {isCharging ? <BatteryCharging className="w-5 h-5 animate-pulse" /> : <Plug className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-emerald-300 uppercase tracking-widest truncate">
                {!isCharging ? "Véhicule branché" : isFastCharging ? "Recharge rapide" : "Recharge en cours"}
              </h2>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">
                {!isCharging
                  ? "Pas de recharge en cours"
                  : `${power !== null ? `${power} kW` : "-- kW"}${hasTimeToFull ? ` • Fin vers ${formatEta(timeToFull)}` : ""}`}
              </p>
            </div>
          </div>
          {!compact && (
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 rounded-xl border bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/50 transition-colors cursor-pointer shrink-0"
            title={isMinimized ? "Agrandir la recharge" : "Minimiser la recharge"}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4 text-emerald-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          )}
        </div>

        {/* Battery gauge with charge limit marker */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-2xl font-extrabold font-mono text-white tracking-tight">
              {level !== null ? `${level}%` : "--%"}
            </span>
            {limit !== null && (
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                Limite <span className="text-emerald-400 font-mono">{limit}%</span>
              </span>
            )}
          </div>
          <div className="relative h-3 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.6)] transition-all duration-700"
              style={{ width: `${level ?? 0}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-pulse" />
            </div>
            {limit !== null && (
              <div
                className="absolute inset-y-0 w-0.5 bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.8)]"
                style={{ left: `${Math.max(0, Math.min(100, limit))}%` }}
                title={`Limite de charge : ${limit}%`}
              />
            )}
          </div>
        </div>

        {!isMinimized && !compact && isCharging && (
          <div className="grid grid-cols-2 gap-3">
            {/* Power */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Puissance</span>
                <span className="text-xs font-mono font-bold text-white truncate block">
                  {power !== null ? `${power} kW` : "---"}
                </span>
              </div>
            </div>

            {/* Time to full */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Temps restant</span>
                <span className="text-xs font-mono font-bold text-white truncate block">
                  {hasTimeToFull ? formatDuration(timeToFull) : "---"}
                </span>
              </div>
            </div>

            {/* Energy added */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 shrink-0">
                <BatteryCharging className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Énergie ajoutée</span>
                <span className="text-xs font-mono font-bold text-white truncate block">
                  {charging?.charge_energy_added != null ? `${charging.charge_energy_added.toFixed(2)} kWh` : "---"}
                </span>
              </div>
            </div>

            {/* Estimated range */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
                <Route className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Autonomie est.</span>
                <span className="text-xs font-mono font-bold text-white truncate block">
                  {charging?.est_battery_range_km != null ? `${Math.round(charging.est_battery_range_km)} km` : "---"}
                </span>
              </div>
            </div>

            {/* Electrical details */}
            <div className="col-span-2 bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                {isFastCharging ? <Gauge className="w-4 h-4 text-cyan-400" /> : <Plug className="w-4 h-4 text-cyan-400" />}
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  {isFastCharging ? "Courant continu" : "Borne AC"}
                </span>
              </div>
              <span className="font-mono font-bold text-slate-200 text-[11px]">
                {charging?.charger_voltage != null ? `${charging.charger_voltage} V` : "-- V"}
                {" · "}
                {charging?.charger_actual_current != null ? `${charging.charger_actual_current} A` : "-- A"}
                {charging?.charger_phases ? ` · ${charging.charger_phases} ph` : ""}
              </span>
            </div>
          </div>
        )}

        {!isMinimized && !compact && controlsToken !== undefined && <ChargeControls token={controlsToken} isCharging={isCharging} />}
      </div>
    </div>
  );
}
