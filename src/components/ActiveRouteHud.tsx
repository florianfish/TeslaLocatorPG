import { useMemo, useState } from "react";
import { Battery, ChevronDown, ChevronUp, Clock, Flag, Navigation2, Route, TrafficCone } from "lucide-react";
import { ActiveRoute } from "../types";

interface ActiveRouteHudProps {
  route: ActiveRoute;
  // Hides the details, e.g. while the telemetry panel above is expanded and needs the height
  compact?: boolean;
}

const KM_PER_MILE = 1.609344;

// TeslaMate publishes the route with no destination, or an "error" field, when navigation is off
export function isRouteActive(route: ActiveRoute | null | undefined): route is ActiveRoute {
  return !!route && !route.error && (!!route.destination || route.minutes_to_arrival != null);
}

function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${m.toString().padStart(2, "0")}`;
}

function arrivalEnergyColor(level: number): string {
  if (level < 10) return "text-rose-400";
  if (level < 20) return "text-amber-400";
  return "text-emerald-400";
}

export default function ActiveRouteHud({ route, compact = false }: ActiveRouteHudProps) {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const minutes = route.minutes_to_arrival;
  const distanceKm = route.miles_to_arrival != null ? route.miles_to_arrival * KM_PER_MILE : null;
  const energy = route.energy_at_arrival != null ? Math.round(route.energy_at_arrival) : null;
  const trafficDelay = route.traffic_minutes_delay != null ? Math.round(route.traffic_minutes_delay) : 0;

  // Recomputed on each new route payload, which TeslaMate refreshes while driving
  const arrivalTime = useMemo(() => {
    if (minutes == null) return null;
    return new Date(Date.now() + minutes * 60 * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }, [route]);

  return (
    <div className="w-full md:w-96 shrink-0 pointer-events-auto font-sans">
      <div className="bg-slate-900/90 backdrop-blur-xl border border-sky-500/30 rounded-2xl p-4 shadow-2xl shadow-sky-500/10 flex flex-col gap-3.5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Navigation2 className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-sky-300 uppercase tracking-widest truncate">Navigation en cours</h2>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate" title={route.destination || ""}>
                <Flag className="w-3 h-3 inline -mt-0.5 mr-1 text-sky-400" />
                {route.destination || "Destination inconnue"}
              </p>
            </div>
          </div>
          {!compact && (
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 rounded-xl border bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/50 transition-colors cursor-pointer shrink-0"
            title={isMinimized ? "Agrandir l'itinéraire" : "Minimiser l'itinéraire"}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4 text-sky-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          )}
        </div>

        {/* Arrival time, always visible */}
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Arrivée prévue</span>
            <span className="text-2xl font-extrabold font-mono text-white tracking-tight">
              {arrivalTime ?? "--:--"}
            </span>
          </div>
          <div className="text-right">
            <span className="block text-sm font-mono font-bold text-sky-300">
              {minutes != null ? `dans ${formatDuration(minutes)}` : "---"}
            </span>
            {trafficDelay > 0 && (
              <span className="text-[10px] font-bold text-amber-400">+{trafficDelay} min de trafic</span>
            )}
          </div>
        </div>

        {!isMinimized && !compact && (
          <div className="grid grid-cols-2 gap-3">
            {/* Remaining distance */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 shrink-0">
                <Route className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Distance restante</span>
                <span className="text-xs font-mono font-bold text-white truncate block">
                  {distanceKm !== null ? `${distanceKm.toLocaleString("fr-FR", { maximumFractionDigits: distanceKm < 10 ? 1 : 0 })} km` : "---"}
                </span>
              </div>
            </div>

            {/* Battery at arrival */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                <Battery className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Batterie à l'arrivée</span>
                <span className={`text-xs font-mono font-bold truncate block ${energy !== null ? arrivalEnergyColor(energy) : "text-white"}`}>
                  {energy !== null ? `${energy}%` : "---"}
                </span>
              </div>
            </div>

            {/* Traffic */}
            <div className="col-span-2 bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                {trafficDelay > 0 ? <TrafficCone className="w-4 h-4 text-amber-400" /> : <Clock className="w-4 h-4 text-cyan-400" />}
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Trafic</span>
              </div>
              <span className={`font-mono font-bold text-[11px] ${trafficDelay > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {trafficDelay > 0 ? `+${formatDuration(trafficDelay)} de retard` : "Fluide"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
