import { useEffect, useState } from "react";
import { Car, Compass, Navigation, RefreshCw, AlertTriangle, Settings, Radio, Gauge, Battery, Zap, Thermometer, Milestone, MapPin } from "lucide-react";
import { CarLocation, MqttStatus, CarTelemetry } from "../types";

interface MapOverlayProps {
  carLocation: CarLocation | null;
  carTelemetry: CarTelemetry | null;
  mqttStatus: MqttStatus;
  mqttError: string | null;
  onCenter: () => void;
  onToggleDebug: () => void;
  isDebugOpen: boolean;
  token: string;
}

export default function MapOverlay({
  carLocation,
  carTelemetry,
  mqttStatus,
  mqttError,
  onCenter,
  onToggleDebug,
  isDebugOpen,
  token,
}: MapOverlayProps) {
  const [timeAgo, setTimeAgo] = useState<string>("Jamais");

  useEffect(() => {
    if (!carLocation) {
      setTimeAgo("En attente de coordonnées...");
      return;
    }

    const updateTimeAgo = () => {
      const elapsed = Date.now() - carLocation.timestamp;
      const seconds = Math.floor(elapsed / 1000);

      if (seconds < 5) {
        setTimeAgo("À l'instant");
      } else if (seconds < 60) {
        setTimeAgo(`Il y a ${seconds} s`);
      } else {
        const minutes = Math.floor(seconds / 60);
        setTimeAgo(`Il y a ${minutes} min`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 5000);
    return () => clearInterval(interval);
  }, [carLocation]);

  const getStatusBadge = () => {
    switch (mqttStatus) {
      case "connected":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Broker Connecté
          </span>
        );
      case "connecting":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"></span>
            Connexion...
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            Erreur
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            Déconnecté
          </span>
        );
    }
  };

  return (
    <div className="absolute inset-x-0 top-0 p-4 z-[1000] flex flex-col md:flex-row justify-between items-start gap-4 pointer-events-none font-sans">
      {/* HUD Info Panel */}
      <div className="w-full md:w-auto max-w-sm bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-5 shadow-2xl pointer-events-auto flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-850 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#E82127]/15 border border-[#E82127]/30 flex items-center justify-center text-[#E82127]">
              <Car className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Télémétrie Voiture</h1>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Données GPS & MQTT</p>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        {/* Live Coordinate details */}
        {carLocation ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60">
                <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1">Latitude</span>
                <span className="text-xs font-mono font-bold text-[#E82127] select-all">
                  {carLocation.lat.toFixed(6)}
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60">
                <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1">Longitude</span>
                <span className="text-xs font-mono font-bold text-[#E82127] select-all">
                  {carLocation.lon.toFixed(6)}
                </span>
              </div>
            </div>

            {/* Telemetry Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Speed */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 shrink-0">
                  <Gauge className="w-4 h-4 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Vitesse</span>
                  <span className="text-xs font-mono font-bold text-white truncate block">
                    {carTelemetry && carTelemetry.speed !== null ? `${carTelemetry.speed} km/h` : "0 km/h"}
                  </span>
                </div>
              </div>

              {/* Battery */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                  <Battery className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Batterie</span>
                  <span className="text-xs font-mono font-bold text-white truncate block">
                    {carTelemetry && carTelemetry.battery_level !== null ? `${carTelemetry.battery_level}%` : "---"}
                  </span>
                </div>
              </div>

              {/* State */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">État</span>
                  <span className="text-xs font-bold text-white capitalize truncate block" title={carTelemetry?.state || ""}>
                    {carTelemetry && carTelemetry.state ? carTelemetry.state : "Inconnu"}
                  </span>
                </div>
              </div>

              {/* Temperature */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 shrink-0">
                  <Thermometer className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Temp Ext</span>
                  <span className="text-xs font-mono font-bold text-white truncate block">
                    {carTelemetry && carTelemetry.outside_temp !== null ? `${carTelemetry.outside_temp.toFixed(1)} °C` : "---"}
                  </span>
                </div>
              </div>
            </div>

            {/* Rapport de vitesse (Shift State P R N D) */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Boite / Rapport</span>
              </div>
              <div className="flex items-center gap-1 font-mono font-bold text-xs">
                {["P", "R", "N", "D"].map((gear) => {
                  const isActive = carTelemetry?.shift_state === gear || (gear === "P" && !carTelemetry?.shift_state);
                  return (
                    <span
                      key={gear}
                      className={`w-6 h-6 flex items-center justify-center rounded-lg transition-all ${
                        isActive
                          ? "bg-[#E82127] text-white shadow-[0_0_8px_rgba(232,33,39,0.5)] font-black scale-105"
                          : "bg-slate-900 text-slate-600 border border-slate-800/40"
                      }`}
                    >
                      {gear}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Itinéraire Actif */}
            {carTelemetry?.active_route && (
              <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Itinéraire Actif</span>
                  </div>
                  {carTelemetry.active_route.error ? (
                    <span className="text-[9px] font-semibold text-rose-400 bg-rose-950/20 px-2 py-0.5 rounded border border-rose-800/20">Pas d'itinéraire</span>
                  ) : (
                    <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-800/20">En cours</span>
                  )}
                </div>

                {carTelemetry.active_route.error ? (
                  <p className="text-xs text-slate-500 italic">Aucun trajet en cours vers une destination.</p>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Destination</span>
                        <span className="text-xs font-extrabold text-white truncate block" title={carTelemetry.active_route.destination || ""}>
                          {carTelemetry.active_route.destination}
                        </span>
                      </div>
                      {carTelemetry.active_route.energy_at_arrival !== null && (
                        <div className="text-right shrink-0 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1">
                          <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">À l'arrivée</span>
                          <span className="text-xs font-mono font-bold text-emerald-400">
                            {carTelemetry.active_route.energy_at_arrival}%
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-900">
                      {carTelemetry.active_route.minutes_to_arrival !== null && (
                        <div className="bg-slate-900/60 p-2 rounded-lg text-center">
                          <span className="block text-[8px] uppercase text-slate-500 font-bold mb-0.5">Temps</span>
                          <span className="text-xs font-mono font-bold text-slate-200">
                            {carTelemetry.active_route.minutes_to_arrival < 60 
                              ? `${Math.round(carTelemetry.active_route.minutes_to_arrival)} min`
                              : `${Math.floor(carTelemetry.active_route.minutes_to_arrival / 60)}h${Math.round(carTelemetry.active_route.minutes_to_arrival % 60)}`
                            }
                          </span>
                        </div>
                      )}
                      {carTelemetry.active_route.miles_to_arrival !== null && (
                        <div className="bg-slate-900/60 p-2 rounded-lg text-center">
                          <span className="block text-[8px] uppercase text-slate-500 font-bold mb-0.5">Distance</span>
                          <span className="text-xs font-mono font-bold text-slate-200">
                            {(carTelemetry.active_route.miles_to_arrival * 1.60934).toFixed(1)} km
                          </span>
                        </div>
                      )}
                      {carTelemetry.active_route.traffic_minutes_delay !== null && (
                        <div className="bg-slate-900/60 p-2 rounded-lg text-center">
                          <span className="block text-[8px] uppercase text-slate-500 font-bold mb-0.5">Trafic</span>
                          <span className={`text-xs font-mono font-bold ${
                            carTelemetry.active_route.traffic_minutes_delay > 0 ? "text-amber-400" : "text-emerald-400"
                          }`}>
                            {carTelemetry.active_route.traffic_minutes_delay > 0 
                              ? `+${Math.round(carTelemetry.active_route.traffic_minutes_delay)}m`
                              : "Fluide"
                            }
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Odometer */}
            {carTelemetry && carTelemetry.odometer !== null && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <Milestone className="w-4 h-4 text-amber-500" />
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Kilométrage total</span>
                </div>
                <span className="font-mono font-bold text-slate-200">
                  {carTelemetry.odometer.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/40 p-2.5 rounded-xl border border-slate-850">
              <div className="flex items-center gap-1.5 min-w-0">
                <Compass className="w-4 h-4 text-[#E82127] shrink-0" />
                <span className="text-[10px] font-mono truncate text-slate-400" title={carLocation.topic}>
                  Topic : <span className="text-[#E82127] font-bold">{carLocation.topic}</span>
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0 font-semibold text-slate-500 text-[10px]">
                <RefreshCw className="w-3 h-3 text-[#E82127] animate-spin" style={{ animationDuration: "4s" }} />
                <span>{timeAgo}</span>
              </div>
            </div>

            {/* Recenter button */}
            <button
              onClick={onCenter}
              className="w-full bg-[#E82127] hover:bg-[#ff2b32] active:bg-[#b81216] text-white font-bold text-xs uppercase tracking-wider rounded-xl py-3 px-4 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#E82127]/20 cursor-pointer"
            >
              <Navigation className="w-4 h-4" />
              Centrer sur la voiture
            </button>
          </div>
        ) : (
          <div className="py-6 text-center">
            <div className="w-9 h-9 rounded-xl bg-[#E82127]/5 border border-[#E82127]/20 flex items-center justify-center mx-auto mb-3 animate-spin" style={{ animationDuration: "6s" }}>
              <Compass className="w-5 h-5 text-[#E82127]" />
            </div>
            <p className="text-xs text-slate-300 font-semibold uppercase tracking-wider">Recherche du signal...</p>
            <p className="text-[10px] text-slate-500 mt-2 max-w-[240px] mx-auto leading-relaxed">
              En attente des premières coordonnées transmises par le traceur GPS.
            </p>
          </div>
        )}

        {/* MQTT Connection Error alert if any */}
        {mqttError && (
          <div className="p-3 bg-rose-950/30 border border-rose-500/10 rounded-xl flex gap-2.5 text-rose-300 text-[10px]">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <div>
              <p className="font-bold uppercase tracking-wider text-rose-400">Erreur réseau</p>
              <p className="text-rose-300/80 truncate max-w-[200px]" title={mqttError}>{mqttError}</p>
            </div>
          </div>
        )}
      </div>

      {/* Floating Header Actions */}
      <div className="w-full md:w-auto flex justify-between md:justify-end items-center gap-2 pointer-events-auto">
        <button
          onClick={onToggleDebug}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all shadow-2xl cursor-pointer ${
            isDebugOpen
              ? "bg-[#E82127] border-[#E82127] text-white shadow-lg shadow-[#E82127]/20"
              : "bg-slate-900/95 hover:bg-slate-800/95 text-slate-300 border-slate-800 hover:border-slate-700"
          }`}
        >
          <Settings className={`w-4 h-4 ${isDebugOpen ? "animate-spin" : ""}`} style={{ animationDuration: "10s" }} />
          <span>Console & MQTT</span>
        </button>
      </div>
    </div>
  );
}
