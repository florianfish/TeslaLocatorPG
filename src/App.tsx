import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Shield, User, LogOut } from "lucide-react";
import { CarLocation, MqttStatus, TopicEntry, MessageLog, ConfigData, CarTelemetry, UserRole } from "./types";
import SecureLogin from "./components/SecureLogin";
import MapOverlay from "./components/MapOverlay";
import DebugPanel from "./components/DebugPanel";

export default function App() {
  // Authentication & Security state
  const [token, setToken] = useState<string>(() => {
    // Try to get token from URL first, otherwise from localStorage
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) return urlToken;
    return localStorage.getItem("car_tracker_token") || "";
  });
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  // Always verify on load: Home Assistant Ingress sessions are authorized without a token
  const [isVerifying, setIsVerifying] = useState<boolean>(true);
  const [isIngress, setIsIngress] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // App & Broker configuration
  const [appVersion, setAppVersion] = useState<string>("v2.2");
  const [brokerUrl, setBrokerUrl] = useState<string>("");
  const [topicConfig, setTopicConfig] = useState<string>("");

  // Live Location & MQTT status state
  const [carLocation, setCarLocation] = useState<CarLocation | null>(null);
  const [carTelemetry, setCarTelemetry] = useState<CarTelemetry | null>(null);
  const [mqttStatus, setMqttStatus] = useState<MqttStatus>("disconnected");
  const [mqttError, setMqttError] = useState<string | null>(null);
  const [topics, setTopics] = useState<TopicEntry[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);

  // UI state
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);

  // Leaflet Map Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // 1. Verification of the secure token
  useEffect(() => {
    const verifyToken = async () => {
      setIsVerifying(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`api/config?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          throw new Error("Impossible de joindre le serveur de configuration.");
        }
        const data: ConfigData = await res.json();

        if (data.authorized) {
          setAuthorized(true);
          setUserRole(data.role || "admin");
          if (data.version) setAppVersion(data.version);
          setBrokerUrl(data.brokerUrl);
          setTopicConfig(data.topicConfig);
          setIsIngress(Boolean(data.ingress));
          // Persist token for future sessions
          if (token) localStorage.setItem("car_tracker_token", token);

          // Clear query params to keep URL clean, but keep token in memory
          const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
          window.history.replaceState({ path: cleanUrl }, "", cleanUrl);
        } else {
          setAuthorized(false);
          setUserRole(null);
          setErrorMsg(token ? "La clé de sécurité fournie est invalide. Veuillez réessayer." : null);
          localStorage.removeItem("car_tracker_token");
        }
      } catch (err: any) {
        setAuthorized(false);
        setUserRole(null);
        setErrorMsg(err.message || "Erreur de connexion.");
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  // 2. Load initial snapshot data once authorized
  useEffect(() => {
    if (!authorized) return;

    const loadInitialData = async () => {
      try {
        const res = await fetch(`api/data?token=${encodeURIComponent(token)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.role) setUserRole(data.role);
          setMqttStatus(data.mqttStatus);
          setMqttError(data.mqttError);
          setCarLocation(data.carLocation);
          setCarTelemetry(data.carTelemetry || null);
          setTopics(data.topics || []);
          setLogs(data.logs || []);
        }
      } catch (err) {
        console.error("Error loading initial tracker data:", err);
      }
    };

    loadInitialData();
  }, [authorized, token]);

  // 3. Setup SSE real-time stream once authorized
  useEffect(() => {
    if (!authorized) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    function connect() {
      if (eventSource) {
        eventSource.close();
      }

      const streamUrl = `api/stream?token=${encodeURIComponent(token)}`;
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "ping") {
            // Heartbeat message from server, keep-alive active
            return;
          }

          if (data.type === "init") {
            if (data.role) setUserRole(data.role);
            setMqttStatus(data.mqttStatus);
            setMqttError(data.mqttError);
            setCarLocation(data.carLocation);
            setCarTelemetry(data.carTelemetry || null);
            setTopics(data.topics || []);
            setLogs(data.logs || []);
          } else if (data.type === "message") {
            if (data.carLocation) {
              setCarLocation(data.carLocation);
            }
            if (data.carTelemetry) {
              setCarTelemetry(data.carTelemetry);
            }
            if (data.topics) {
              setTopics(data.topics);
            }
            if (data.message) {
              setLogs((prev) => [data.message, ...prev.slice(0, 49)]);
            }
          } else if (data.type === "status") {
            setMqttStatus(data.status);
            setMqttError(data.error);
          }
        } catch (err) {
          console.error("Error parsing real-time message stream:", err);
        }
      };

      eventSource.onerror = (err) => {
        // EventSource handles transient reconnects automatically.
        // We log as warning instead of a red console error to prevent false alerts.
        console.warn("Real-time stream state change or connection interruption.", err);
        if (eventSource && eventSource.readyState === EventSource.CLOSED) {
          eventSource.close();
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => {
            connect();
          }, 3000);
        }
      };
    }

    connect();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [authorized, token]);

  // 4. Initialize Leaflet Map
  useEffect(() => {
    if (!authorized || !mapContainerRef.current || mapRef.current) return;

    // Create the Leaflet map instance
    // Default centering to France (46.2276, 2.2137)
    const map = L.map(mapContainerRef.current, {
      zoomControl: false, // We'll place a custom one or just let users use zoom interactions
    }).setView([46.2276, 2.2137], 6);

    // Use CartoDB Voyager tiles (bright, clear light mode)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '© OpenStreetMap contributors, © CartoDB',
      maxZoom: 20,
    }).addTo(map);

    // Place zoom controls on the bottom-right for a cleaner aesthetic
    L.control.zoom({
      position: "bottomright",
    }).addTo(map);

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [authorized]);

  // 5. Reactive map updates when car location changes
  useEffect(() => {
    if (!mapRef.current || !carLocation) return;

    const { lat, lon, timestamp, topic } = carLocation;

    // Define custom HTML/SVG glowing marker for the car in Sleek Interface theme
    const carIcon = L.divIcon({
      className: "custom-car-marker",
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute -inset-8 bg-[#E82127]/30 rounded-full blur-xl animate-pulse"></div>
          <div class="absolute w-16 h-16 bg-[#E82127]/15 rounded-full animate-ping"></div>
          <div class="w-10 h-10 bg-[#E82127] rounded-xl flex items-center justify-center shadow-2xl rotate-45 border border-white/20">
            <svg class="w-6 h-6 text-white -rotate-45" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.27-3.82c.14-.4.51-.68.94-.68h9.58c.43 0 .8.28.94.68L19 11H5z"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    const updateTime = new Date(timestamp).toLocaleTimeString();

    if (!markerRef.current) {
      // First position received: Add marker and pan/zoom map directly
      markerRef.current = L.marker([lat, lon], { icon: carIcon }).addTo(mapRef.current);
      mapRef.current.setView([lat, lon], 15);
    } else {
      // Move marker smoothly
      markerRef.current.setLatLng([lat, lon]);
      // Center the map viewport smoothly on the vehicle's new position
      mapRef.current.panTo([lat, lon]);
    }

    // Bind customized popup
    markerRef.current.bindPopup(`
      <div class="p-1 font-sans text-xs">
        <div class="font-bold text-slate-900 flex items-center gap-1.5 mb-1 text-sm">
          <span class="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
          Véhicule Localisé
        </div>
        <p class="text-[10px] text-slate-500 mb-2">Mis à jour : ${updateTime}</p>
        <div class="bg-slate-50 border border-slate-100 p-1.5 rounded font-mono text-[10px] text-slate-700 select-all leading-relaxed">
          Lat : ${lat.toFixed(6)}<br/>
          Lon : ${lon.toFixed(6)}
        </div>
        <div class="text-[9px] text-slate-400 mt-2 italic break-all">Topic : ${topic}</div>
      </div>
    `, {
      closeButton: false,
      offset: [0, -10]
    });

  }, [carLocation]);

  // Recenter helper
  const handleRecenter = () => {
    if (mapRef.current && carLocation) {
      mapRef.current.flyTo([carLocation.lat, carLocation.lon], 16, {
        animate: true,
        duration: 1.5,
      });
    }
  };

  // Focus on coordinates from the active topic inspector
  const handleSelectTopicCoordinate = (lat: number, lon: number, topic: string) => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lon], 16, { animate: true, duration: 1.5 });

      // Update our displayed location if the user focuses a secondary topic
      setCarLocation({
        lat,
        lon,
        timestamp: Date.now(),
        topic,
        rawPayload: `Simulated from topic selector: lat ${lat}, lon ${lon}`
      });
    }
  };

  const handleVerifyToken = (newToken: string) => {
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem("car_tracker_token");
    setToken("");
    setAuthorized(false);
    setUserRole(null);
    setCarLocation(null);
    setCarTelemetry(null);
    setMqttStatus("disconnected");
    setIsDebugOpen(false);
  };

  // If token verification is finished and user is not authorized, show SecureLogin form
  if (!authorized && !isVerifying) {
    return (
      <SecureLogin
        isLoading={false}
        errorMsg={errorMsg}
        onVerify={handleVerifyToken}
      />
    );
  }

  const formattedBroker = brokerUrl ? brokerUrl.replace(/^mqtts?:\/\//, "") : "Non configuré";

  return (
    <div className="w-screen h-screen bg-slate-950 text-slate-100 font-sans flex flex-col overflow-hidden select-none relative">
      {/* Cockpit Loading Overlay during initial token verification */}
      {isVerifying && (
        <div className="absolute inset-0 z-[2000] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center font-sans pointer-events-auto">
          <div className="w-14 h-14 rounded-2xl bg-[#E82127]/15 border border-[#E82127]/30 flex items-center justify-center text-[#E82127] mb-4 shadow-2xl animate-pulse">
            <svg className="w-7 h-7 text-[#E82127]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5-1.5 1.5zM5 11l1.27-3.82c.14-.4.51-.68.94-.68h9.58c.43 0 .8.28.94.68L19 11H5z"/>
            </svg>
          </div>
          <div className="w-8 h-8 border-3 border-[#E82127] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-300 text-xs font-mono font-semibold uppercase tracking-wider mt-4 animate-pulse">
            Initialisation du Cockpit Tesla...
          </p>
        </div>
      )}

      {/* Header Navigation */}
      <header className="h-16 px-6 md:px-8 border-b border-slate-850 flex items-center justify-between bg-black/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#E82127]/15 border border-[#E82127]/30 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-[#E82127] animate-pulse" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C11.38 2 10.15 3.03 8.35 4.3C7.53 4.88 6.46 5.37 5.14 5.76C4.43 5.97 4 6.64 4 7.38V9.16C4 9.87 4.4 10.51 5.04 10.77C6.54 11.38 7.6 11.83 8.12 12.05C8.04 12.33 8 12.65 8 13C8 14.88 9.38 16.5 11 16.92V19H9.5C8.67 19 8 19.67 8 20.5C8 21.33 8.67 22 9.5 22H14.5C15.33 22 16 21.33 16 20.5C16 19.67 15.33 19 14.5 19H13V16.92C14.62 16.5 16 14.88 16 13C16 12.65 15.96 12.33 15.88 12.05C16.4 11.83 17.46 11.38 18.96 10.77C19.6 10.51 20 9.87 20 9.16V7.38C20 6.64 19.57 5.97 18.86 5.76C17.54 5.37 16.47 4.88 15.65 4.3C13.85 3.03 12.62 2 12 2Z" opacity="0.15" />
              <path d="M12 4.5c2.5 0 5-.5 7.5-1.5.2-.1.5.1.5.4 0 .3-.1.5-.4.6-2.4.9-4.8 1.5-7.6 1.5-2.8 0-5.2-.6-7.6-1.5-.3-.1-.4-.3-.4-.6 0-.3.3-.5.5-.4 2.5 1 5 1.5 7.5 1.5zm0 3c1.8 0 3.6-.3 5.4-.9.3-.1.5.1.6.4s-.1.5-.4.6c-1.8.6-3.6.9-5.6.9-2 0-3.8-.3-5.6-.9-.3-.1-.5-.3-.4-.6.1-.3.3-.5.6-.4 1.8.6 3.6.9 5.4.9zm0 2c.1 0 .2.1.2.2v8.6c0 .4-.3.7-.7.7s-.7-.3-.7-.7V9.7c0-.1.1-.2.2-.2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold tracking-tight uppercase text-white">
              Tesla Tracker <span className="text-[#E82127] text-xs font-mono ml-1.5 md:ml-2">{appVersion}</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[9px] md:text-[10px] text-slate-500 uppercase font-semibold">Statut Broker MQTT</span>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${mqttStatus === "connected"
                  ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                  : mqttStatus === "connecting"
                    ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse"
                    : "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                }`} />
              <span className={`text-xs md:text-sm font-mono font-semibold ${mqttStatus === "connected" ? "text-emerald-400" : mqttStatus === "connecting" ? "text-amber-400" : "text-rose-400"
                }`}>
                {formattedBroker}
              </span>
            </div>
          </div>
          <div className="hidden sm:block h-8 w-[1px] bg-slate-800"></div>
          {userRole === "admin" ? (
            <div className="px-3 py-1.5 bg-[#E82127]/10 border border-[#E82127]/30 rounded-full flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-[#E82127]" />
              <span className="text-xs font-bold text-[#E82127] font-mono uppercase tracking-wider">Admin</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 bg-sky-950/40 border border-sky-500/30 rounded-full flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs font-bold text-sky-300 font-mono uppercase tracking-wider">Utilisateur</span>
            </div>
          )}

          {!isIngress && (
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-slate-900/90 hover:bg-rose-950/50 border border-slate-800 hover:border-rose-500/30 text-slate-300 hover:text-rose-300 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer shadow-sm group ml-1"
            title="Déconnexion (supprimer le jeton de session)"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-400 group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden md:inline font-sans">Déconnexion</span>
          </button>
          )}
        </div>
      </header>

      {/* Main Content Area: Map Viewport */}
      <main className="flex-1 relative flex overflow-hidden bg-[#0B0F19]">
        {/* Full Screen Map Container */}
        <div ref={mapContainerRef} id="map" className="w-full h-full z-0" />

        {/* Floating HUD Controls */}
        <MapOverlay
          carLocation={carLocation}
          carTelemetry={carTelemetry}
          mqttStatus={mqttStatus}
          mqttError={mqttError}
          onCenter={handleRecenter}
          onToggleDebug={() => setIsDebugOpen(!isDebugOpen)}
          isDebugOpen={isDebugOpen}
          token={token}
          userRole={userRole}
        />

        {/* Sliding Control/Debug Drawer */}
        <DebugPanel
          isOpen={isDebugOpen}
          onClose={() => setIsDebugOpen(false)}
          mqttStatus={mqttStatus}
          brokerUrl={brokerUrl}
          topicConfig={topicConfig}
          topics={topics}
          logs={logs}
          token={token}
          onSelectTopicCoordinate={handleSelectTopicCoordinate}
        />
      </main>
    </div>
  );
}
