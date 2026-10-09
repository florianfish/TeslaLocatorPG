import { useEffect, useState } from "react";
import { Car, Compass, Navigation, RefreshCw, AlertTriangle, Settings, Radio, Gauge, Battery, Zap, Thermometer, Milestone, ChevronDown, ChevronUp, Disc, Eye, Share2 } from "lucide-react";
import { CarLocation, MqttStatus, CarTelemetry, UserRole } from "../types";
import TpmsWidget from "./TpmsWidget";
import ChargingPanel from "./ChargingPanel";
import ActiveRouteHud, { isRouteActive } from "./ActiveRouteHud";

interface MapOverlayProps {
  carLocation: CarLocation | null;
  carTelemetry: CarTelemetry | null;
  mqttStatus: MqttStatus;
  mqttError: string | null;
  onCenter: () => void;
  onToggleDebug: () => void;
  isDebugOpen: boolean;
  onToggleShare: () => void;
  isShareOpen: boolean;
  token: string;
  userRole?: UserRole | null;
}

export default function MapOverlay({
  carLocation,
  carTelemetry,
  mqttStatus,
  mqttError,
  onCenter,
  onToggleDebug,
  isDebugOpen,
  onToggleShare,
  isShareOpen,
  token,
  userRole,
}: MapOverlayProps) {
  const [timeAgo, setTimeAgo] = useState<string>("Jamais");
  const [isMinimized, setIsMinimized] = useState<boolean>(true);
  // Sentry status, odometer and tyre pressures are not sent to read-only users
  const isAdmin = userRole === "admin";

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

  const tpmsLowest = carTelemetry?.tpms
    ? Math.min(
        ...[
          carTelemetry.tpms.tpms_pressure_fl,
          carTelemetry.tpms.tpms_pressure_fr,
          carTelemetry.tpms.tpms_pressure_rl,
          carTelemetry.tpms.tpms_pressure_rr,
        ].filter((val): val is number => val !== null && !isNaN(val))
      )
    : null;

  const hasTpmsAlert = tpmsLowest !== null && (tpmsLowest < 2.3 || tpmsLowest > 3.4);

  return (
    <div className="absolute inset-x-0 top-0 p-4 z-[1000] flex flex-col md:flex-row justify-between items-start gap-4 pointer-events-none font-sans">
      {/* Left column: telemetry HUD, with the charging panel stacked below it so they never overlap */}
      <div className="w-full md:w-auto max-w-sm flex flex-col gap-3 max-h-[calc(100vh-6rem)]">
      {/* HUD Info Panel */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 md:p-5 shadow-2xl pointer-events-auto flex flex-col gap-3.5 min-h-0">
        {/* Header */}
        <div className={`flex items-center justify-between gap-2 shrink-0 ${!isMinimized ? "border-b border-slate-850 pb-3" : ""}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#E82127]/15 border border-[#E82127]/30 flex items-center justify-center text-[#E82127] shrink-0">
              <Car className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs font-bold text-slate-400 uppercase tracking-widest truncate">Télémétrie Voiture</h1>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider truncate">
                {isMinimized && carTelemetry?.speed !== null && carTelemetry?.speed !== undefined
                  ? `${carTelemetry.speed} km/h • ${carTelemetry.battery_level ?? '--'}%`
                  : "Données GPS & MQTT"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className={`p-1.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
              hasTpmsAlert
                ? "bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse"
                : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/50"
            }`}
            title={isMinimized ? "Agrandir la télémétrie" : "Minimiser la télémétrie"}
          >
            {isMinimized ? <ChevronDown className="w-4 h-4 text-[#E82127]" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
          </button>
        </div>

        {/* Minimized Quick Summary Bar */}
        {isMinimized && carLocation && (
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800/60 shrink-0">
            <div className="flex items-center gap-3 text-xs font-mono font-bold text-slate-200 flex-wrap">
              {carTelemetry?.sentry_mode && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-extrabold animate-pulse" title="Mode Sentinelle Actif">
                  <Eye className="w-3 h-3 text-rose-400" />
                  Sentinelle
                </span>
              )}
              {carTelemetry?.speed !== null && carTelemetry?.speed !== undefined && (
                <span className="flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5 text-rose-400" />
                  {carTelemetry.speed} km/h
                </span>
              )}
              {carTelemetry?.battery_level !== null && carTelemetry?.battery_level !== undefined && (
                <span className="flex items-center gap-1">
                  <Battery className="w-3.5 h-3.5 text-emerald-400" />
                  {carTelemetry.battery_level}%
                </span>
              )}
              {carTelemetry?.state === "charging" && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold" title="Recharge en cours">
                  <Zap className="w-3 h-3 animate-pulse" />
                  {carTelemetry.charging?.charger_power != null ? `${carTelemetry.charging.charger_power} kW` : "Charge"}
                </span>
              )}
              {carTelemetry?.tpms && (
                <span className="flex items-center gap-1 cursor-pointer" onClick={() => setIsMinimized(false)}>
                  <Disc className={`w-3.5 h-3.5 ${hasTpmsAlert ? "text-rose-400 animate-pulse" : "text-sky-400"}`} />
                  <span className={hasTpmsAlert ? "text-rose-400 font-extrabold animate-pulse" : "text-slate-300"}>
                    {tpmsLowest !== null && !isNaN(tpmsLowest) ? `${tpmsLowest.toFixed(1)} bar` : "TPMS"}
                  </span>
                </span>
              )}
              {carTelemetry?.shift_state && (
                <span className="px-1.5 py-0.5 rounded bg-[#E82127] text-white font-black text-[10px]">
                  {carTelemetry.shift_state}
                </span>
              )}
            </div>
            <button
              onClick={onCenter}
              className="bg-[#E82127] hover:bg-[#ff2b32] active:bg-[#b81216] text-white font-bold text-[10px] uppercase tracking-wider rounded-lg py-1.5 px-3 transition-all flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Navigation className="w-3 h-3" />
              Centrer
            </button>
          </div>
        )}


        {/* Full Telemetry details (Visible when expanded) */}
        {!isMinimized && (
          carLocation ? (
            <div className="space-y-3.5 overflow-y-auto pr-1 flex-1 min-h-0 custom-scrollbar">
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

            {/* Mode Sentinelle (Sentry Mode Status) */}
            {isAdmin && (
            <div className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
              carTelemetry?.sentry_mode
                ? "bg-rose-950/30 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.12)]"
                : "bg-slate-950 border-slate-800/60"
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${
                  carTelemetry?.sentry_mode
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse"
                    : "bg-slate-900 text-slate-500 border border-slate-800/60"
                }`}>
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Mode Sentinelle</span>
                  <span className={`text-xs font-bold ${
                    carTelemetry?.sentry_mode ? "text-rose-400 font-extrabold" : carTelemetry?.sentry_mode === false ? "text-slate-400" : "text-slate-500"
                  }`}>
                    {carTelemetry?.sentry_mode ? "Actif (Surveillance)" : carTelemetry?.sentry_mode === false ? "Inactif" : "Inconnu"}
                  </span>
                </div>
              </div>
              {carTelemetry?.sentry_mode && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 font-mono text-[9px] font-extrabold animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                  REC
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

            {/* Widget TPMS - Pression des Pneus */}
            {isAdmin && <TpmsWidget tpms={carTelemetry?.tpms || null} />}

            <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/40 p-2.5 rounded-xl border border-slate-850">
              <div className="flex items-center gap-1.5 min-w-0">
                <Compass className="w-4 h-4 text-[#E82127] shrink-0" />
                {carLocation.topic ? (
                  <span className="text-[10px] font-mono truncate text-slate-400" title={carLocation.topic}>
                    Topic : <span className="text-[#E82127] font-bold">{carLocation.topic}</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-400">Dernière position</span>
                )}
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
        ))}

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

      {isRouteActive(carTelemetry?.active_route) && (
        <ActiveRouteHud route={carTelemetry.active_route} compact={!isMinimized} />
      )}

      {(carTelemetry?.state === "charging" || carTelemetry?.charging?.plugged_in) && (
        <ChargingPanel
          charging={carTelemetry.charging}
          batteryLevel={carTelemetry.battery_level}
          isCharging={carTelemetry.state === "charging"}
          compact={!isMinimized}
          controlsToken={isAdmin ? token : undefined}
        />
      )}
      </div>

      {/* Floating Header Actions - Only available for Admin role */}
      {userRole === "admin" && (
        <div className="w-full md:w-auto flex justify-between md:justify-end items-center gap-2 pointer-events-auto">
          <button
            onClick={onToggleShare}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all shadow-2xl cursor-pointer ${
              isShareOpen
                ? "bg-sky-600 border-sky-600 text-white shadow-lg shadow-sky-600/20"
                : "bg-slate-900/95 hover:bg-slate-800/95 text-slate-300 border-slate-800 hover:border-slate-700"
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span>Partager</span>
          </button>
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
      )}
    </div>
  );
}
