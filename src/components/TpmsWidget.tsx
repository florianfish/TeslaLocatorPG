import { useState } from "react";
import { AlertTriangle, CheckCircle2, Disc } from "lucide-react";
import { TpmsData } from "../types";

interface TpmsWidgetProps {
  tpms: TpmsData | null;
}

type Unit = "bar" | "psi";

export default function TpmsWidget({ tpms }: TpmsWidgetProps) {
  const [unit, setUnit] = useState<Unit>("bar");

  if (!tpms) {
    return (
      <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
          <Disc className="w-4 h-4 text-slate-500" />
          Pression des Pneus (TPMS)
        </div>
        <p className="text-xs text-slate-500 italic">Aucune donnée TPMS reçue pour le moment.</p>
      </div>
    );
  }

  // Convert raw value (TeslaMate values can be in Bar or PSI) to target unit
  const formatPressure = (val: number | null): { valueStr: string; barVal: number | null } => {
    if (val === null || isNaN(val)) return { valueStr: "--", barVal: null };
    
    // Auto-detect if raw value is in PSI (usually > 10) or Bar (usually < 10)
    const isRawPsi = val > 10;
    const barVal = isRawPsi ? val / 14.5038 : val;
    const psiVal = isRawPsi ? val : val * 14.5038;

    if (unit === "bar") {
      return { valueStr: `${barVal.toFixed(1)} bar`, barVal };
    } else {
      return { valueStr: `${Math.round(psiVal)} psi`, barVal };
    }
  };

  const getTireStatus = (val: number | null, softWarning?: boolean | null) => {
    if (softWarning) {
      return { color: "amber", text: "Warning Tesla", alert: true, critical: false };
    }
    if (val === null || isNaN(val)) return { color: "slate", text: "N/A", alert: false, critical: false };

    // Determine bar value for threshold checking
    const bar = val > 10 ? val / 14.5038 : val;

    if (bar < 2.3) {
      return { color: "rose", text: "Sous-gonflé", alert: true, critical: true };
    } else if (bar < 2.6) {
      return { color: "amber", text: "Pression basse", alert: true, critical: false };
    } else if (bar > 3.4) {
      return { color: "amber", text: "Sur-gonflé", alert: true, critical: false };
    } else {
      return { color: "emerald", text: "Normal", alert: false, critical: false };
    }
  };

  const tires = [
    { label: "Avant Gauche", key: "fl", val: tpms.tpms_pressure_fl, warning: tpms.tpms_soft_warning_fl, pos: "top-left" },
    { label: "Avant Droit", key: "fr", val: tpms.tpms_pressure_fr, warning: tpms.tpms_soft_warning_fr, pos: "top-right" },
    { label: "Arrière Gauche", key: "rl", val: tpms.tpms_pressure_rl, warning: tpms.tpms_soft_warning_rl, pos: "bottom-left" },
    { label: "Arrière Droit", key: "rr", val: tpms.tpms_pressure_rr, warning: tpms.tpms_soft_warning_rr, pos: "bottom-right" },
  ];

  const alerts = tires.map(t => ({ ...t, status: getTireStatus(t.val, t.warning) })).filter(t => t.status.alert);

  const hasCritical = alerts.some(a => a.status.critical);

  return (
    <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 font-sans">
      {/* Header with Unit Selector */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Disc className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Pression des Pneus</h3>
            <p className="text-[10px] text-slate-500">Capteurs TPMS Tesla</p>
          </div>
        </div>

        {/* Unit switch */}
        <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => setUnit("bar")}
            className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${
              unit === "bar" ? "bg-sky-500 text-slate-950 shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            BAR
          </button>
          <button
            onClick={() => setUnit("psi")}
            className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${
              unit === "psi" ? "bg-sky-500 text-slate-950 shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            PSI
          </button>
        </div>
      </div>

      {/* Alert Banner if any tire under/over-inflated */}
      {alerts.length > 0 && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border ${
          hasCritical 
            ? "bg-rose-500/15 border-rose-500/30 text-rose-300 animate-pulse" 
            : "bg-amber-500/15 border-amber-500/30 text-amber-300"
        }`}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {hasCritical ? "Alerte sous-gonflage critique !" : "Ajustement de pression recommandé"} sur{" "}
            {alerts.map(a => a.label).join(", ")}.
          </span>
        </div>
      )}

      {/* 2D Vehicle Diagram Grid */}
      <div className="relative grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
        {/* Central Vehicle Silhouette */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-20 h-36 rounded-3xl border-2 border-dashed border-sky-400 bg-sky-950/20 flex items-center justify-center text-[10px] font-mono text-sky-400 uppercase tracking-widest">
            TESLA
          </div>
        </div>

        {tires.map((tire) => {
          const formatted = formatPressure(tire.val);
          const status = getTireStatus(tire.val, tire.warning);


          let statusStyle = "bg-slate-900/80 border-slate-800 text-slate-300";
          let badgeStyle = "bg-slate-800 text-slate-400";
          if (status.color === "emerald") {
            statusStyle = "bg-emerald-950/30 border-emerald-500/30 text-emerald-300";
            badgeStyle = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";
          } else if (status.color === "amber") {
            statusStyle = "bg-amber-950/40 border-amber-500/40 text-amber-300";
            badgeStyle = "bg-amber-500/10 text-amber-400 border border-amber-500/30";
          } else if (status.color === "rose") {
            statusStyle = "bg-rose-950/50 border-rose-500/50 text-rose-200 animate-pulse";
            badgeStyle = "bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold";
          }

          return (
            <div
              key={tire.key}
              className={`flex flex-col justify-between p-2.5 rounded-xl border backdrop-blur-md transition-all ${statusStyle}`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {tire.label}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${badgeStyle}`}>
                  {status.text}
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div className="flex items-center gap-1.5">
                  <Disc className={`w-3.5 h-3.5 ${
                    status.color === "emerald" ? "text-emerald-400" :
                    status.color === "amber" ? "text-amber-400" :
                    status.color === "rose" ? "text-rose-400" : "text-slate-500"
                  }`} />
                  <span className="text-sm font-extrabold tracking-tight">
                    {formatted.valueStr}
                  </span>
                </div>
                {status.color === "emerald" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
