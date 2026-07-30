import React, { useState } from "react";
import {
  X,
  Radio,
  Server,
  Activity,
  Send,
  Database,
  ChevronRight,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  MapPin,
  Clock,
  Eye
} from "lucide-react";
import { MessageLog, TopicEntry, MqttStatus } from "../types";

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mqttStatus: MqttStatus;
  brokerUrl: string;
  topicConfig: string;
  topics: TopicEntry[];
  logs: MessageLog[];
  token: string;
  onSelectTopicCoordinate: (lat: number, lon: number, topic: string) => void;
}

export default function DebugPanel({
  isOpen,
  onClose,
  mqttStatus,
  brokerUrl,
  topicConfig,
  topics,
  logs,
  token,
  onSelectTopicCoordinate,
}: DebugPanelProps) {
  const [activeTab, setActiveTab] = useState<"topics" | "logs" | "publish">("topics");

  // Publishing form state
  const [pubTopic, setPubTopic] = useState("teslamate/cars/1/location");
  const [pubPayload, setPubPayload] = useState(
    JSON.stringify({ latitude: 35.278131, longitude: 29.744801 }, null, 2)
  );
  const [isPublishing, setIsPublishing] = useState(false);
  const [pubResult, setPubResult] = useState<{ success: boolean; message: string } | null>(null);

  // Search filter for logs
  const [logSearch, setLogSearch] = useState("");

  if (!isOpen) return null;

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPublishing(true);
    setPubResult(null);

    try {
      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(pubPayload);
      } catch {
        parsedPayload = pubPayload; // Send as plain string if not valid JSON
      }

      const res = await fetch(`/api/test-publish?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: pubTopic,
          payload: parsedPayload,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPubResult({ success: true, message: data.message });
      } else {
        setPubResult({ success: false, message: data.error || "Une erreur est survenue." });
      }
    } catch (err: any) {
      setPubResult({ success: false, message: err.message || "Erreur réseau." });
    } finally {
      setIsPublishing(false);
    }
  };

  const loadSimulatedPreset = (name: string, lat: number, lon: number) => {
    setPubTopic("teslamate/cars/1/location");
    setPubPayload(JSON.stringify({ latitude: lat, longitude: lon }, null, 2));
  };

  const filteredLogs = logs.filter(
    (log) =>
      log.topic.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.payload.toLowerCase().includes(logSearch.toLowerCase())
  );

  return (
    <div className="absolute right-0 top-0 h-full w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl z-[1001] flex flex-col font-sans text-slate-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-cyan-400" />
          <div>
            <h2 className="text-sm font-bold text-white">Console Console & MQTT</h2>
            <p className="text-[10px] text-slate-500 font-medium truncate max-w-[240px]" title={brokerUrl}>
              {brokerUrl}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Connection Info Bar */}
      <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800/60 flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${
              mqttStatus === "connected"
                ? "bg-emerald-500"
                : mqttStatus === "connecting"
                ? "bg-amber-500 animate-pulse"
                : "bg-rose-500"
            }`}
          />
          <span className="capitalize text-[10px] text-slate-400">
            Statut : <span className="text-slate-200 font-semibold">{mqttStatus}</span>
          </span>
        </div>
        <span className="text-[10px] text-slate-400">
          Abonnement : <code className="bg-slate-950 px-1 py-0.5 rounded text-cyan-400">{topicConfig}</code>
        </span>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-950/50 border-b border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab("topics")}
          className={`flex-1 py-3 text-center border-b font-medium transition-colors cursor-pointer ${
            activeTab === "topics"
              ? "text-cyan-400 border-cyan-500 bg-slate-900/50"
              : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/20"
          }`}
        >
          <Activity className="w-3.5 h-3.5 inline mr-1.5" />
          Topics ({topics.length})
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`flex-1 py-3 text-center border-b font-medium transition-colors cursor-pointer ${
            activeTab === "logs"
              ? "text-cyan-400 border-cyan-500 bg-slate-900/50"
              : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/20"
          }`}
        >
          <Database className="w-3.5 h-3.5 inline mr-1.5" />
          Journal ({logs.length})
        </button>
        <button
          onClick={() => setActiveTab("publish")}
          className={`flex-1 py-3 text-center border-b font-medium transition-colors cursor-pointer ${
            activeTab === "publish"
              ? "text-cyan-400 border-cyan-500 bg-slate-900/50"
              : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/20"
          }`}
        >
          <Send className="w-3.5 h-3.5 inline mr-1.5" />
          Simulateur
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* TOPICS TAB */}
        {activeTab === "topics" && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Topics Détectés et Derniers Payloads
            </h3>
            {topics.length === 0 ? (
              <div className="text-center py-12 bg-slate-950/20 border border-slate-800 rounded-xl">
                <Radio className="w-8 h-8 text-slate-600 animate-pulse mx-auto mb-2" />
                <p className="text-xs text-slate-400">Aucun topic détecté pour l'instant</p>
                <p className="text-[10px] text-slate-500 max-w-[200px] mx-auto mt-1">
                  Les topics s'afficheront en temps réel dès qu'un message sera publié.
                </p>
              </div>
            ) : (
              topics.map(([name, data]) => (
                <div
                  key={name}
                  className="bg-slate-950/60 border border-slate-850 rounded-xl p-3 flex flex-col gap-2 hover:border-slate-800 transition-colors"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-mono text-xs text-cyan-400 font-semibold break-all" title={name}>
                      {name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {new Date(data.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="bg-slate-950 border border-slate-900/80 p-2 rounded-lg text-xs font-mono text-slate-300 break-all overflow-x-auto select-all max-h-24">
                    {data.payload}
                  </div>

                  {data.parsedGps ? (
                    <div className="flex items-center justify-between border-t border-slate-900 pt-2 text-[10px]">
                      <span className="flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Coordonnées détectées !
                      </span>
                      <button
                        onClick={() =>
                          onSelectTopicCoordinate(
                            data.parsedGps!.lat,
                            data.parsedGps!.lon,
                            name
                          )
                        }
                        className="flex items-center gap-1 hover:text-cyan-400 font-semibold transition-colors text-slate-400 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-cyan-400 animate-bounce" />
                        Voir sur la carte
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 bg-slate-900/50 px-2 py-0.5 rounded-full self-start">
                      <FileCode className="w-3.5 h-3.5 text-slate-600" />
                      Données diverses
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === "logs" && (
          <div className="space-y-3 flex flex-col h-full">
            {/* Search filter */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Filtrer par topic ou contenu..."
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2 pl-9 pr-4 text-xs outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  Aucun message correspondant trouvé.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 bg-slate-950/40 border border-slate-850/60 rounded-lg font-mono text-[11px] leading-relaxed"
                  >
                    <div className="flex justify-between items-center gap-2 mb-1 border-b border-slate-900 pb-1 text-slate-400">
                      <span className="text-cyan-400 font-bold truncate max-w-[180px]" title={log.topic}>
                        {log.topic}
                      </span>
                      <span className="text-[9px] shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-slate-300 break-all whitespace-pre-wrap select-all">{log.payload}</div>
                    {log.parsedGps && (
                      <div className="text-[9px] text-emerald-400 font-semibold mt-1 flex items-center gap-1 bg-emerald-500/5 px-1.5 py-0.5 rounded self-start border border-emerald-500/10">
                        <MapPin className="w-3 h-3" />
                        GPS : {log.parsedGps.lat.toFixed(5)}, {log.parsedGps.lon.toFixed(5)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* PUBLISH TAB */}
        {activeTab === "publish" && (
          <div className="space-y-4">
            <div className="bg-cyan-950/30 border border-cyan-500/10 rounded-2xl p-4 text-xs text-cyan-200">
              <p className="font-bold flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                Simulateur de traceur GPS
              </p>
              <p className="leading-relaxed text-cyan-300/80">
                Vous n'avez pas de traceur physique connecté pour le moment ? Utilisez ce panneau pour envoyer des coordonnées GPS fictives. Cela mettra à jour la carte instantanément.
              </p>
            </div>

            {/* Presets Grid */}
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Simulations Rapides (Presets de Trajets)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => loadSimulatedPreset("Paris (Tour Eiffel)", 48.8584, 2.2945)}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2.5 text-left text-xs transition-colors cursor-pointer group"
                >
                  <span className="font-bold text-slate-300 block group-hover:text-white">Paris</span>
                  <span className="text-[10px] text-slate-500 font-mono">Tour Eiffel</span>
                </button>
                <button
                  type="button"
                  onClick={() => loadSimulatedPreset("Marseille (Vieux Port)", 43.2965, 5.3698)}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2.5 text-left text-xs transition-colors cursor-pointer group"
                >
                  <span className="font-bold text-slate-300 block group-hover:text-white">Marseille</span>
                  <span className="text-[10px] text-slate-500 font-mono">Vieux Port</span>
                </button>
                <button
                  type="button"
                  onClick={() => loadSimulatedPreset("Lyon (Place Bellecour)", 45.7578, 4.8322)}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2.5 text-left text-xs transition-colors cursor-pointer group"
                >
                  <span className="font-bold text-slate-300 block group-hover:text-white">Lyon</span>
                  <span className="text-[10px] text-slate-500 font-mono">Bellecour</span>
                </button>
                <button
                  type="button"
                  onClick={() => loadSimulatedPreset("Bordeaux (Miroir d'eau)", 44.8415, -0.5701)}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2.5 text-left text-xs transition-colors cursor-pointer group"
                >
                  <span className="font-bold text-slate-300 block group-hover:text-white">Bordeaux</span>
                  <span className="text-[10px] text-slate-500 font-mono">Miroir d'eau</span>
                </button>
              </div>
            </div>

            {/* Telemetry Shift State Presets */}
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Simulations Boite de Vitesse (shift_state)
              </span>
              <div className="grid grid-cols-4 gap-2">
                {["P", "R", "N", "D"].map((gear) => (
                  <button
                    key={gear}
                    type="button"
                    onClick={() => {
                      setPubTopic("teslamate/cars/1/shift_state");
                      setPubPayload(gear);
                    }}
                    className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2 text-center text-xs font-bold transition-all cursor-pointer text-[#E82127]"
                  >
                    Boite {gear}
                  </button>
                ))}
              </div>
            </div>

            {/* Simulations Mode Sentinelle */}
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Simulations Mode Sentinelle (sentry_mode)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPubTopic("teslamate/cars/1/sentry_mode");
                    setPubPayload("true");
                  }}
                  className="bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/40 rounded-xl p-2.5 text-center text-xs font-bold transition-all cursor-pointer text-rose-400 flex items-center justify-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                  Sentinelle ON (true)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPubTopic("teslamate/cars/1/sentry_mode");
                    setPubPayload("false");
                  }}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2.5 text-center text-xs font-bold transition-all cursor-pointer text-slate-400"
                >
                  Sentinelle OFF (false)
                </button>
              </div>
            </div>

            {/* Simulations Itinéraire Actif */}
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Simulations Itinéraires (active_route)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPubTopic("teslamate/cars/1/active_route");
                    const userPreset = {
                      destination: "Home",
                      energy_at_arrival: 73,
                      miles_to_arrival: 6.485299,
                      minutes_to_arrival: 23.466667,
                      traffic_minutes_delay: 0.0,
                      location: {
                        latitude: 35.278131,
                        longitude: 29.744801
                      },
                      error: null
                    };
                    setPubPayload(JSON.stringify(userPreset, null, 2));
                  }}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2.5 text-center text-xs font-bold transition-colors cursor-pointer text-emerald-400"
                >
                  Destination Home (Égypte)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPubTopic("teslamate/cars/1/active_route");
                    const localPreset = {
                      destination: "Maison (Paris)",
                      energy_at_arrival: 85,
                      miles_to_arrival: 3.1,
                      minutes_to_arrival: 12.5,
                      traffic_minutes_delay: 2.0,
                      location: {
                        latitude: 48.875,
                        longitude: 2.305
                      },
                      error: null
                    };
                    setPubPayload(JSON.stringify(localPreset, null, 2));
                  }}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2.5 text-center text-xs font-bold transition-colors cursor-pointer text-emerald-400"
                >
                  Destination (Paris)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPubTopic("teslamate/cars/1/location");
                    const emptyPreset = {
                      error: "No active route available"
                    };
                    setPubPayload(JSON.stringify(emptyPreset, null, 2));
                  }}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2 col-span-2 text-center text-xs font-bold transition-colors cursor-pointer text-rose-400"
                >
                  Pas d'itinéraire actif
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPubTopic("teslamate/cars/1/tpms_pressure_fl");
                    setPubPayload("2.9");
                  }}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2 text-center text-xs font-bold transition-colors cursor-pointer text-sky-400"
                >
                  🛞 AV-G à 2.9 bar
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPubTopic("teslamate/cars/1/tpms_pressure_rl");
                    setPubPayload("2.1");
                  }}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2 text-center text-xs font-bold transition-colors cursor-pointer text-amber-400"
                >
                  ⚠️ AR-G à 2.1 bar
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPubTopic("teslamate/cars/1/tpms_soft_warning_rl");
                    setPubPayload("true");
                  }}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2 text-center text-xs font-bold transition-colors cursor-pointer text-rose-400"
                >
                  ⚠️ Soft Warning AR-G
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPubTopic("teslamate/cars/1/location");
                    setPubPayload(JSON.stringify({
                      tpms_pressure_fl: 2.9,
                      tpms_pressure_fr: 2.8,
                      tpms_pressure_rl: 2.9,
                      tpms_pressure_rr: 2.8,
                      tpms_soft_warning_fl: false,
                      tpms_soft_warning_fr: false,
                      tpms_soft_warning_rl: false,
                      tpms_soft_warning_rr: false
                    }, null, 2));
                  }}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-xl p-2 text-center text-xs font-bold transition-colors cursor-pointer text-emerald-400"
                >
                  🚗 Pack 4 Pneus OK
                </button>
              </div>
            </div>



            {/* Custom publishing form */}
            <form onSubmit={handlePublish} className="space-y-4 pt-2 border-t border-slate-850">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Topic MQTT de publication
                </label>
                <input
                  type="text"
                  value={pubTopic}
                  onChange={(e) => setPubTopic(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2 px-3 text-xs outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Payload du message (Texte brut ou JSON)
                </label>
                <textarea
                  value={pubPayload}
                  onChange={(e) => setPubPayload(e.target.value)}
                  rows={6}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 font-mono rounded-xl py-2 px-3 text-xs outline-none focus:border-cyan-500 leading-relaxed"
                  required
                />
              </div>

              {pubResult && (
                <div
                  className={`p-3 rounded-xl flex gap-2 text-xs border ${
                    pubResult.success
                      ? "bg-emerald-950/40 border-emerald-500/20 text-emerald-200"
                      : "bg-rose-950/40 border-rose-500/20 text-rose-200"
                  }`}
                >
                  {pubResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <div>
                    <p className="font-semibold">{pubResult.success ? "Succès" : "Erreur"}</p>
                    <p className="text-[10px] opacity-80 mt-0.5">{pubResult.message}</p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isPublishing}
                className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium text-xs rounded-xl py-3 px-4 transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-600/10 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {isPublishing ? "Publication en cours..." : "Publier sur le broker"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
