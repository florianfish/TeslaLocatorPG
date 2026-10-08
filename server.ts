import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import mqtt from "mqtt";
import { execSync } from "child_process";
import { createServer as createViteServer } from "vite";
import {
  initShareLinks,
  createShareLink,
  findShareLink,
  isShareLinkActive,
  listShareLinks,
  revokeShareLink,
  purgeExpiredShareLinks,
  parseDurationMinutes,
  MIN_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  PublicShareLink,
} from "./shareLinks";

// Automatic version detection helper
function getAppVersion(): string {
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION;
  }
  try {
    const commitCount = execSync("git rev-list --count HEAD", { stdio: ["pipe", "pipe", "ignore"] }).toString().trim();
    const shortHash = execSync("git rev-parse --short HEAD", { stdio: ["pipe", "pipe", "ignore"] }).toString().trim();
    return `v2.2.${commitCount} (${shortHash})`;
  } catch {
    return "v2.2.0";
  }
}

// Load environment variables
dotenv.config();

// Home Assistant add-on: options from the add-on Configuration tab override environment variables
function loadAddonOptions() {
  const optionsFile = process.env.ADDON_OPTIONS_FILE;
  if (!optionsFile || !fs.existsSync(optionsFile)) return;
  try {
    const options = JSON.parse(fs.readFileSync(optionsFile, "utf-8"));
    for (const [key, value] of Object.entries(options)) {
      if (value !== null && value !== undefined && value !== "") {
        process.env[key.toUpperCase()] = String(value);
      }
    }
    console.log(`Loaded Home Assistant add-on options from ${optionsFile}`);
  } catch (err) {
    console.error("Failed to read Home Assistant add-on options:", err);
  }
}
loadAddonOptions();
initShareLinks();

const app = express();
const PORT = 3000;

app.use(express.json());

// Secrets & Token configuration
type Role = "admin" | "user";

function getRoleFromToken(token: any): Role | null {
  if (!token || typeof token !== "string") return null;

  const adminToken = process.env.ADMIN_ACCESS_TOKEN;
  const userToken = process.env.USER_ACCESS_TOKEN;
  const legacyToken = process.env.SECURE_ACCESS_TOKEN;

  if (adminToken && token === adminToken) return "admin";
  if (userToken && token === userToken) return "user";
  if (legacyToken && token === legacyToken) return "admin";

  return null;
}

// Home Assistant Ingress: requests are already authenticated by HA and only come from the Supervisor proxy
const INGRESS_PROXY_IP = "172.30.32.2";

function isIngressRequest(req: express.Request): boolean {
  if (process.env.HA_INGRESS !== "true") return false;
  return req.socket.remoteAddress?.replace(/^::ffff:/, "") === INGRESS_PROXY_IP;
}

// Token from `?token=` or, for API clients such as Home Assistant's rest_command, `Authorization: Bearer`
function getRequestToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.substring(7).trim();
  return typeof req.query.token === "string" ? req.query.token : null;
}

function getRequestAuth(req: express.Request): { role: Role; share?: PublicShareLink } | null {
  if (isIngressRequest(req)) return { role: "admin" };
  const token = getRequestToken(req);
  const role = getRoleFromToken(token);
  if (role) return { role };
  // Temporary share links grant read-only access until they expire or are revoked
  const share = token ? findShareLink(token) : null;
  return share ? { role: "user", share } : null;
}

function getRequestRole(req: express.Request): Role | null {
  return getRequestAuth(req)?.role ?? null;
}

// Public base URL used to build share links (the Ingress URL requires a Home Assistant login)
function getPublicBaseUrl(req: express.Request): string | null {
  const configured = process.env.PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (isIngressRequest(req)) return null;
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] || req.protocol;
  return `${proto}://${req.get("host")}`;
}

// MQTT Configuration
const rawBrokerUrl = process.env.MQTT_BROKER_URL || "";
const MQTT_USERNAME = process.env.MQTT_USERNAME || "";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "teslamate/cars/1/location";

// Resolve connection scheme
let brokerUrl = rawBrokerUrl;
if (brokerUrl.startsWith("http://")) {
  brokerUrl = "mqtt://" + brokerUrl.substring(7);
} else if (brokerUrl.startsWith("https://")) {
  brokerUrl = "mqtts://" + brokerUrl.substring(8);
}

if (brokerUrl) {
  console.log(`Configured MQTT connection: ${brokerUrl} as user: ${MQTT_USERNAME}`);
} else {
  console.warn("WARNING: MQTT_BROKER_URL is not defined in environment variables.");
}

// Server memory storage
let mqttStatus = "disconnected";
let mqttError: string | null = null;
let carLocation: {
  lat: number;
  lon: number;
  timestamp: number;
  topic: string;
  rawPayload: string;
} | null = null;

let carTelemetry = {
  speed: null as number | null,
  battery_level: null as number | null,
  state: null as string | null,
  odometer: null as number | null,
  outside_temp: null as number | null,
  shift_state: null as string | null,
  sentry_mode: null as boolean | null,
  active_route: null as any,
  tpms: null as {
    tpms_pressure_fl: number | null;
    tpms_pressure_fr: number | null;
    tpms_pressure_rl: number | null;
    tpms_pressure_rr: number | null;
    tpms_soft_warning_fl?: boolean | null;
    tpms_soft_warning_fr?: boolean | null;
    tpms_soft_warning_rl?: boolean | null;
    tpms_soft_warning_rr?: boolean | null;
  } | null,
  charging: null as Record<ChargingField, number | boolean | null> | null,
};

// TeslaMate charging topics (teslamate/cars/<id>/<field>). TeslaMate publishes an empty
// payload when a value no longer applies (e.g. time_to_full_charge once charging stops).
const CHARGING_NUMERIC_FIELDS = [
  "charger_power",
  "charger_voltage",
  "charger_actual_current",
  "charger_phases",
  "charge_energy_added",
  "time_to_full_charge",
  "charge_limit_soc",
  "est_battery_range_km",
] as const;
const CHARGING_BOOLEAN_FIELDS = ["plugged_in", "charge_port_door_open"] as const;
type ChargingField = (typeof CHARGING_NUMERIC_FIELDS)[number] | (typeof CHARGING_BOOLEAN_FIELDS)[number];

// Track all active topics and their latest details
const topicsMap = new Map<string, {
  payload: string;
  timestamp: number;
  parsedGps?: { lat: number; lon: number };
}>();

// Keep a rolling log of the last 50 raw messages
const messageLogs: Array<{
  id: string;
  topic: string;
  payload: string;
  timestamp: number;
  parsedGps?: { lat: number; lon: number };
}> = [];

// Read-only users (user token, share links) only get what the map needs: no raw MQTT
// topics/logs/payloads, no broker details, and no odometer, tyre pressure or Sentry status.
const USER_HIDDEN_TELEMETRY = ["odometer", "tpms", "sentry_mode"] as const;

function restrictForRole(role: Role, data: any) {
  if (role === "admin") return data;
  const { topics, logs, message, ...rest } = data;
  if (rest.carLocation) {
    const { lat, lon, timestamp } = rest.carLocation;
    rest.carLocation = { lat, lon, timestamp };
  }
  if (rest.carTelemetry) {
    rest.carTelemetry = { ...rest.carTelemetry };
    for (const key of USER_HIDDEN_TELEMETRY) rest.carTelemetry[key] = null;
  }
  // Broker errors can contain hostnames or IP addresses
  if (rest.mqttError) rest.mqttError = "Connexion au broker MQTT impossible.";
  if (rest.error) rest.error = "Connexion au broker MQTT impossible.";
  return rest;
}

// SSE Clients for real-time streaming (shareId set when connected through a temporary share link)
const clients: Array<{ res: express.Response; role: Role; shareId?: string }> = [];

// Helper to broadcast events to all connected SSE clients
function broadcast(data: any) {
  const serialized = {
    admin: JSON.stringify(data),
    user: JSON.stringify(restrictForRole("user", data)),
  };
  clients.forEach(({ res: client, role }) => {
    try {
      client.write(`data: ${serialized[role]}\n\n`);
    } catch (err) {
      console.error("Error broadcasting to SSE client:", err);
    }
  });
}

// Coordinate parsing helper
function parseGps(payloadStr: string): { lat: number; lon: number } | null {
  try {
    const trimmed = payloadStr.trim();
    if (!trimmed) return null;

    // Check if it's JSON
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const data = JSON.parse(trimmed);

      if (typeof data === "object" && data !== null) {
        let lat: number | undefined;
        let lon: number | undefined;

        // Try direct keys
        const keys = Object.keys(data);
        for (const k of keys) {
          const lowerK = k.toLowerCase();
          if (lowerK === "lat" || lowerK === "latitude" || lowerK === "gps_lat" || lowerK === "y") {
            lat = Number(data[k]);
          }
          if (lowerK === "lon" || lowerK === "lng" || lowerK === "longitude" || lowerK === "gps_lon" || lowerK === "x") {
            lon = Number(data[k]);
          }
        }

        if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
          return { lat, lon };
        }

        // Try nested objects
        for (const k of keys) {
          if (typeof data[k] === "object" && data[k] !== null) {
            const sub = data[k];
            let subLat: number | undefined;
            let subLon: number | undefined;
            for (const sk of Object.keys(sub)) {
              const lowerSk = sk.toLowerCase();
              if (lowerSk === "lat" || lowerSk === "latitude" || lowerSk === "y") {
                subLat = Number(sub[sk]);
              }
              if (lowerSk === "lon" || lowerSk === "lng" || lowerSk === "longitude" || lowerSk === "x") {
                subLon = Number(sub[sk]);
              }
            }
            if (subLat !== undefined && subLon !== undefined && !isNaN(subLat) && !isNaN(subLon)) {
              return { lat: subLat, lon: subLon };
            }
          }
        }

        // Try Array [lat, lon] or [lon, lat]
        if (Array.isArray(data) && data.length >= 2) {
          const val1 = Number(data[0]);
          const val2 = Number(data[1]);
          if (!isNaN(val1) && !isNaN(val2)) {
            if (val1 >= -90 && val1 <= 90 && val2 >= -180 && val2 <= 180) {
              return { lat: val1, lon: val2 };
            } else if (val2 >= -90 && val2 <= 90 && val1 >= -180 && val1 <= 180) {
              return { lat: val2, lon: val1 };
            }
          }
        }
      }
    }
  } catch (e) {
    // Fail silently, fallback to regex
  }

  // Fallback to text matching: "lat, lon" or "48.8566, 2.3522" or similar
  const regex = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/;
  const match = payloadStr.match(regex);
  if (match) {
    const val1 = parseFloat(match[1]);
    const val2 = parseFloat(match[2]);
    // Validate bounds
    if (val1 >= -90 && val1 <= 90 && val2 >= -180 && val2 <= 180) {
      return { lat: val1, lon: val2 };
    }
  }

  return null;
}

// Connect to MQTT Broker
let mqttClient: mqtt.MqttClient | null = null;

function connectMqtt() {
  if (!brokerUrl) {
    console.warn("MQTT broker URL is missing. Skipping connection.");
    mqttStatus = "disconnected";
    mqttError = "Broker URL non configuré dans .env";
    return;
  }

  console.log(`Connecting to MQTT broker at ${brokerUrl}...`);
  mqttStatus = "connecting";
  mqttError = null;
  broadcast({ type: "status", status: mqttStatus, error: mqttError });

  try {
    mqttClient = mqtt.connect(brokerUrl, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      reconnectPeriod: 5000, // Reconnect every 5s
      connectTimeout: 10000,
    });

    mqttClient.on("connect", () => {
      console.log("Successfully connected to MQTT broker.");
      mqttStatus = "connected";
      mqttError = null;
      broadcast({ type: "status", status: mqttStatus, error: mqttError });

      // Determine topics to subscribe to. If using TeslaMate location, subscribe to other telemetry topics too!
      const topicsToSubscribe: string[] = [MQTT_TOPIC];
      const carMatch = MQTT_TOPIC.match(/^teslamate\/cars\/([^/]+)\/location$/);
      if (carMatch) {
        const carId = carMatch[1];
        topicsToSubscribe.push(
          `teslamate/cars/${carId}/speed`,
          `teslamate/cars/${carId}/state`,
          `teslamate/cars/${carId}/battery_level`,
          `teslamate/cars/${carId}/odometer`,
          `teslamate/cars/${carId}/outside_temp`,
          `teslamate/cars/${carId}/shift_state`,
          `teslamate/cars/${carId}/sentry_mode`,
          `teslamate/cars/${carId}/active_route`,
          `teslamate/cars/${carId}/tpms_pressure_fl`,
          `teslamate/cars/${carId}/tpms_pressure_fr`,
          `teslamate/cars/${carId}/tpms_pressure_rl`,
          `teslamate/cars/${carId}/tpms_pressure_rr`,
          `teslamate/cars/${carId}/tpms_soft_warning_fl`,
          `teslamate/cars/${carId}/tpms_soft_warning_fr`,
          `teslamate/cars/${carId}/tpms_soft_warning_rl`,
          `teslamate/cars/${carId}/tpms_soft_warning_rr`,
          ...[...CHARGING_NUMERIC_FIELDS, ...CHARGING_BOOLEAN_FIELDS].map((field) => `teslamate/cars/${carId}/${field}`)
        );
      }

      mqttClient?.subscribe(topicsToSubscribe, (err) => {
        if (err) {
          console.error(`MQTT subscription error for topics:`, topicsToSubscribe, err);
        } else {
          console.log(`Subscribed to MQTT topics:`, topicsToSubscribe);
        }
      });
    });

    mqttClient.on("message", (topic, message) => {
      const rawPayload = message.toString();
      const timestamp = Date.now();
      const parsedGps = parseGps(rawPayload);

      // Save to topics tracking
      topicsMap.set(topic, {
        payload: rawPayload,
        timestamp,
        parsedGps: parsedGps || undefined,
      });

      // Helper to parse scalar values
      const parseValue = (val: string) => {
        const trimmed = val.trim();
        try {
          return JSON.parse(trimmed);
        } catch {
          const num = Number(trimmed);
          return isNaN(num) ? trimmed : num;
        }
      };

      // Check if this topic belongs to any of the telemetry fields
      const carIdMatch = topic.match(/^teslamate\/cars\/([^/]+)\/(speed|state|battery_level|odometer|outside_temp|shift_state|sentry_mode|active_route|tpms_pressure_fl|tpms_pressure_fr|tpms_pressure_rl|tpms_pressure_rr|tpms_soft_warning_fl|tpms_soft_warning_fr|tpms_soft_warning_rl|tpms_soft_warning_rr)$/);
      if (carIdMatch) {
        const subTopicType = carIdMatch[2];
        const parsedVal = parseValue(rawPayload);
        if (subTopicType === "speed") {
          carTelemetry.speed = typeof parsedVal === "number" ? parsedVal : parseInt(parsedVal, 10);
        } else if (subTopicType === "state") {
          carTelemetry.state = String(parsedVal);
        } else if (subTopicType === "battery_level") {
          carTelemetry.battery_level = typeof parsedVal === "number" ? parsedVal : parseInt(parsedVal, 10);
        } else if (subTopicType === "odometer") {
          carTelemetry.odometer = typeof parsedVal === "number" ? parsedVal : parseFloat(parsedVal);
        } else if (subTopicType === "outside_temp") {
          carTelemetry.outside_temp = typeof parsedVal === "number" ? parsedVal : parseFloat(parsedVal);
        } else if (subTopicType === "shift_state") {
          carTelemetry.shift_state = String(parsedVal);
        } else if (subTopicType === "sentry_mode") {
          carTelemetry.sentry_mode = parsedVal === true || String(parsedVal).toLowerCase() === "true";
        } else if (subTopicType.startsWith("tpms_")) {
          applyTpmsData(parsedVal, subTopicType);
        } else if (subTopicType === "active_route") {
          if (typeof parsedVal === "object" && parsedVal !== null) {
            carTelemetry.active_route = parsedVal;
          } else {
            try {
              carTelemetry.active_route = JSON.parse(String(parsedVal));
            } catch {
              carTelemetry.active_route = { error: String(parsedVal) };
            }
          }
        }
      }

      const chargingMatch = topic.match(/^teslamate\/cars\/[^/]+\/([a-z_]+)$/);
      if (chargingMatch) applyChargingData(chargingMatch[1], rawPayload);

      // Update car location if GPS coordinates detected
      if (parsedGps) {
        carLocation = {
          lat: parsedGps.lat,
          lon: parsedGps.lon,
          timestamp,
          topic,
          rawPayload,
        };
        console.log(`Detected location on topic [${topic}]: ${parsedGps.lat}, ${parsedGps.lon}`);

        // Extract extra telemetry parameters if they happen to be part of the location JSON payload
        try {
          const parsed = JSON.parse(rawPayload);
          if (parsed && typeof parsed === "object") {
            if (parsed.speed !== undefined) carTelemetry.speed = Number(parsed.speed);
            if (parsed.battery_level !== undefined) carTelemetry.battery_level = Number(parsed.battery_level);
            if (parsed.state !== undefined) carTelemetry.state = String(parsed.state);
            if (parsed.odometer !== undefined) carTelemetry.odometer = Number(parsed.odometer);
            if (parsed.outside_temp !== undefined) carTelemetry.outside_temp = Number(parsed.outside_temp);
            if (parsed.shift_state !== undefined) carTelemetry.shift_state = String(parsed.shift_state);
            if (parsed.sentry_mode !== undefined) carTelemetry.sentry_mode = parsed.sentry_mode === true || String(parsed.sentry_mode).toLowerCase() === "true";
            if (parsed.active_route !== undefined) carTelemetry.active_route = parsed.active_route;
            applyTpmsData(parsed);
          }
        } catch {}
      }

      // Add to message logs
      const logEntry = {
        id: Math.random().toString(36).substring(2, 9),
        topic,
        payload: rawPayload,
        timestamp,
        parsedGps: parsedGps || undefined,
      };
      messageLogs.unshift(logEntry);
      if (messageLogs.length > 50) {
        messageLogs.pop();
      }

      // Broadcast update to all live streams
      broadcast({
        type: "message",
        message: logEntry,
        carLocation,
        carTelemetry,
        topics: Array.from(topicsMap.entries()),
      });
    });

    mqttClient.on("offline", () => {
      console.warn("MQTT broker went offline.");
      mqttStatus = "disconnected";
      broadcast({ type: "status", status: mqttStatus, error: null });
    });

    mqttClient.on("reconnect", () => {
      console.log("MQTT client attempting to reconnect...");
      mqttStatus = "connecting";
      broadcast({ type: "status", status: mqttStatus, error: null });
    });

    mqttClient.on("error", (err) => {
      console.error("MQTT client connection error:", err);
      mqttStatus = "error";
      mqttError = err.message || "Unknown error";
      broadcast({ type: "status", status: mqttStatus, error: mqttError });
    });

  } catch (err: any) {
    console.error("Failed to initialize MQTT connection:", err);
    mqttStatus = "error";
    mqttError = err.message || "Failed to initiate client";
  }
}

// Start MQTT connection
connectMqtt();

// ================= API ENDPOINTS =================

// Endpoint to fetch basic config and check token validity
app.get("/api/config", (req, res) => {
  const auth = getRequestAuth(req);
  const isValid = auth !== null;

  res.json({
    authorized: isValid,
    role: auth?.role,
    share: auth?.share ? { label: auth.share.label, expiresAt: auth.share.expiresAt } : undefined,
    ingress: isIngressRequest(req),
    version: getAppVersion(),
    // Broker details are only disclosed to admins
    brokerUrl: auth?.role === "admin" ? rawBrokerUrl : "",
    topicConfig: auth?.role === "admin" ? MQTT_TOPIC : "",
    defaultLocation: { lat: 46.2276, lon: 2.2137 } // Center of France
  });
});

// Endpoint to fetch latest data on-demand
app.get("/api/data", (req, res) => {
  const role = getRequestRole(req);
  if (!role) {
    return res.status(403).json({ error: "Unauthorized. Missing or invalid secure token." });
  }

  res.json(restrictForRole(role, {
    role,
    mqttStatus,
    mqttError,
    carLocation,
    carTelemetry,
    topics: Array.from(topicsMap.entries()),
    logs: messageLogs,
  }));
});

// Real-time Event Stream (SSE)
app.get("/api/stream", (req, res) => {
  const auth = getRequestAuth(req);
  if (!auth) {
    return res.status(403).send("Unauthorized. Missing or invalid secure token.");
  }
  const { role } = auth;

  // Set SSE headers (including X-Accel-Buffering to prevent proxy buffering)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send initial comment to flush buffering proxies
  res.write(":\n\n");

  // Send initial load
  const initialPayload = restrictForRole(role, {
    type: "init",
    role,
    mqttStatus,
    mqttError,
    carLocation,
    carTelemetry,
    topics: Array.from(topicsMap.entries()),
    logs: messageLogs,
  });
  res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);

  // Keep track of active stream connections
  const client = { res, role, shareId: auth.share?.id };
  clients.push(client);

  req.on("close", () => {
    const index = clients.indexOf(client);
    if (index !== -1) {
      clients.splice(index, 1);
    }
  });
});

// Periodic keep-alive ping to prevent proxy/browser timeout disconnections
setInterval(() => {
  clients.forEach((client) => {
    try {
      client.res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
    } catch (err) {
      // client error or closed connection (handled by req.on("close"))
    }
  });
}, 10000);

// Close streams opened with a share link that has expired or been revoked
function closeInactiveShareStreams() {
  clients
    .filter((client) => client.shareId && !isShareLinkActive(client.shareId))
    .forEach((client) => {
      try {
        client.res.write(`data: ${JSON.stringify({ type: "expired" })}\n\n`);
        client.res.end();
      } catch {
        // already closed
      }
    });
}

setInterval(() => {
  closeInactiveShareStreams();
  purgeExpiredShareLinks();
}, 15000);

// ================= SHARE LINKS (admin) =================

app.get("/api/share-links", (req, res) => {
  if (getRequestRole(req) !== "admin") {
    return res.status(403).json({ error: "Accès refusé. Le jeton d'administration (Admin) est requis pour cette opération." });
  }
  res.json({ links: listShareLinks(), publicUrl: getPublicBaseUrl(req) });
});

app.post("/api/share-links", (req, res) => {
  if (getRequestRole(req) !== "admin") {
    return res.status(403).json({ error: "Accès refusé. Le jeton d'administration (Admin) est requis pour cette opération." });
  }

  const durationMinutes = parseDurationMinutes(req.body?.duration ?? "2h");
  if (durationMinutes === null || durationMinutes < MIN_DURATION_MINUTES || durationMinutes > MAX_DURATION_MINUTES) {
    return res.status(400).json({
      error: `Durée invalide : utiliser des minutes ou un suffixe m/h/d (ex : "30m", "2h", "7d"), entre ${MIN_DURATION_MINUTES} min et ${MAX_DURATION_MINUTES / 1440} jours.`,
    });
  }
  const rawLabel = typeof req.body?.label === "string" ? req.body.label.trim() : "";
  const label = rawLabel.substring(0, 60) || "Lien de partage";

  const { link, token } = createShareLink(label, durationMinutes);
  const baseUrl = getPublicBaseUrl(req);
  console.log(`Share link created: "${link.label}" (${link.id}), expires ${new Date(link.expiresAt).toISOString()}`);

  res.status(201).json({
    ...link,
    token,
    url: baseUrl ? `${baseUrl}/?token=${encodeURIComponent(token)}` : null,
  });
});

app.delete("/api/share-links/:id", (req, res) => {
  if (getRequestRole(req) !== "admin") {
    return res.status(403).json({ error: "Accès refusé. Le jeton d'administration (Admin) est requis pour cette opération." });
  }
  if (!revokeShareLink(req.params.id)) {
    return res.status(404).json({ error: "Lien de partage introuvable ou déjà expiré." });
  }
  console.log(`Share link revoked: ${req.params.id}`);
  closeInactiveShareStreams();
  res.json({ success: true });
});

// Helper function to update TPMS state safely
function applyChargingData(field: string, rawPayload: string) {
  const isNumeric = (CHARGING_NUMERIC_FIELDS as readonly string[]).includes(field);
  const isBoolean = (CHARGING_BOOLEAN_FIELDS as readonly string[]).includes(field);
  if (!isNumeric && !isBoolean) return;

  if (!carTelemetry.charging) {
    carTelemetry.charging = Object.fromEntries(
      [...CHARGING_NUMERIC_FIELDS, ...CHARGING_BOOLEAN_FIELDS].map((key) => [key, null])
    ) as Record<ChargingField, number | boolean | null>;
  }

  const trimmed = rawPayload.trim();
  let value: number | boolean | null = null;
  if (trimmed !== "") {
    if (isBoolean) {
      value = trimmed.toLowerCase() === "true";
    } else {
      const num = Number(trimmed);
      value = Number.isFinite(num) ? num : null;
    }
  }
  carTelemetry.charging[field as ChargingField] = value;
}

function applyTpmsData(parsedVal: any, subTopicType?: string) {
  if (!carTelemetry.tpms) {
    carTelemetry.tpms = {
      tpms_pressure_fl: null,
      tpms_pressure_fr: null,
      tpms_pressure_rl: null,
      tpms_pressure_rr: null,
      tpms_soft_warning_fl: null,
      tpms_soft_warning_fr: null,
      tpms_soft_warning_rl: null,
      tpms_soft_warning_rr: null,
    };
  }

  if (typeof parsedVal === "object" && parsedVal !== null) {
    if (parsedVal.tpms_pressure_fl !== undefined) carTelemetry.tpms.tpms_pressure_fl = Number(parsedVal.tpms_pressure_fl);
    if (parsedVal.tpms_pressure_fr !== undefined) carTelemetry.tpms.tpms_pressure_fr = Number(parsedVal.tpms_pressure_fr);
    if (parsedVal.tpms_pressure_rl !== undefined) carTelemetry.tpms.tpms_pressure_rl = Number(parsedVal.tpms_pressure_rl);
    if (parsedVal.tpms_pressure_rr !== undefined) carTelemetry.tpms.tpms_pressure_rr = Number(parsedVal.tpms_pressure_rr);

    if (parsedVal.tpms_soft_warning_fl !== undefined) carTelemetry.tpms.tpms_soft_warning_fl = Boolean(parsedVal.tpms_soft_warning_fl);
    if (parsedVal.tpms_soft_warning_fr !== undefined) carTelemetry.tpms.tpms_soft_warning_fr = Boolean(parsedVal.tpms_soft_warning_fr);
    if (parsedVal.tpms_soft_warning_rl !== undefined) carTelemetry.tpms.tpms_soft_warning_rl = Boolean(parsedVal.tpms_soft_warning_rl);
    if (parsedVal.tpms_soft_warning_rr !== undefined) carTelemetry.tpms.tpms_soft_warning_rr = Boolean(parsedVal.tpms_soft_warning_rr);

    if (parsedVal.fl !== undefined) carTelemetry.tpms.tpms_pressure_fl = Number(parsedVal.fl);
    if (parsedVal.fr !== undefined) carTelemetry.tpms.tpms_pressure_fr = Number(parsedVal.fr);
    if (parsedVal.rl !== undefined) carTelemetry.tpms.tpms_pressure_rl = Number(parsedVal.rl);
    if (parsedVal.rr !== undefined) carTelemetry.tpms.tpms_pressure_rr = Number(parsedVal.rr);

    if (subTopicType && parsedVal[subTopicType] !== undefined) {
      if (subTopicType.startsWith("tpms_soft_warning_")) {
        (carTelemetry.tpms as any)[subTopicType] = Boolean(parsedVal[subTopicType]);
      } else {
        (carTelemetry.tpms as any)[subTopicType] = Number(parsedVal[subTopicType]);
      }
    }
  } else if (subTopicType) {
    if (subTopicType.startsWith("tpms_pressure_")) {
      const pressVal = typeof parsedVal === "number" ? parsedVal : parseFloat(String(parsedVal));
      if (!isNaN(pressVal)) {
        (carTelemetry.tpms as any)[subTopicType] = pressVal;
      }
    } else if (subTopicType.startsWith("tpms_soft_warning_")) {
      const boolVal = parsedVal === true || String(parsedVal).toLowerCase() === "true";
      (carTelemetry.tpms as any)[subTopicType] = boolVal;
    }
  }
}

// Support publishing custom coordinates for testing / simulation
app.post("/api/test-publish", (req, res) => {
  const role = getRequestRole(req);
  if (role !== "admin") {
    return res.status(403).json({ error: "Accès refusé. Le jeton d'administration (Admin) est requis pour cette opération." });
  }

  const { topic, payload } = req.body;
  if (!topic || payload === undefined || payload === null) {
    return res.status(400).json({ error: "Missing topic or payload in body" });
  }

  const payloadStr = typeof payload === "object" ? JSON.stringify(payload) : String(payload);

  if (mqttClient && mqttClient.connected) {
    mqttClient.publish(topic, payloadStr, { qos: 0, retain: false }, (err) => {
      if (err) {
        console.error("Failed to publish test message to MQTT broker:", err);
      }
    });
  }

  console.log(`[Processing Test Message] topic: ${topic}, payload: ${payloadStr}`);
  
  const timestamp = Date.now();
  const parsedGps = parseGps(payloadStr);

  topicsMap.set(topic, {
    payload: payloadStr,
    timestamp,
    parsedGps: parsedGps || undefined,
  });

  const parseValue = (val: string) => {
    const trimmed = val.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const num = Number(trimmed);
      return isNaN(num) ? trimmed : num;
    }
  };

  const carIdMatch = topic.match(/^teslamate\/cars\/([^/]+)\/(speed|state|battery_level|odometer|outside_temp|shift_state|sentry_mode|active_route|tpms_pressure_fl|tpms_pressure_fr|tpms_pressure_rl|tpms_pressure_rr|tpms_soft_warning_fl|tpms_soft_warning_fr|tpms_soft_warning_rl|tpms_soft_warning_rr)$/);
  if (carIdMatch) {
    const subTopicType = carIdMatch[2];
    const parsedVal = parseValue(payloadStr);
    if (subTopicType === "speed") {
      carTelemetry.speed = typeof parsedVal === "number" ? parsedVal : parseInt(parsedVal, 10);
    } else if (subTopicType === "state") {
      carTelemetry.state = String(parsedVal);
    } else if (subTopicType === "battery_level") {
      carTelemetry.battery_level = typeof parsedVal === "number" ? parsedVal : parseInt(parsedVal, 10);
    } else if (subTopicType === "odometer") {
      carTelemetry.odometer = typeof parsedVal === "number" ? parsedVal : parseFloat(parsedVal);
    } else if (subTopicType === "outside_temp") {
      carTelemetry.outside_temp = typeof parsedVal === "number" ? parsedVal : parseFloat(parsedVal);
    } else if (subTopicType === "shift_state") {
      carTelemetry.shift_state = String(parsedVal);
    } else if (subTopicType === "sentry_mode") {
      carTelemetry.sentry_mode = parsedVal === true || String(parsedVal).toLowerCase() === "true";
    } else if (subTopicType.startsWith("tpms_")) {
      applyTpmsData(parsedVal, subTopicType);
    } else if (subTopicType === "active_route") {
      if (typeof parsedVal === "object" && parsedVal !== null) {
        carTelemetry.active_route = parsedVal;
      } else {
        try {
          carTelemetry.active_route = JSON.parse(String(parsedVal));
        } catch {
          carTelemetry.active_route = { error: String(parsedVal) };
        }
      }
    }
  }

  if (parsedGps) {
    carLocation = {
      lat: parsedGps.lat,
      lon: parsedGps.lon,
      timestamp,
      topic,
      rawPayload: payloadStr,
    };

    try {
      const parsed = JSON.parse(payloadStr);
      if (parsed && typeof parsed === "object") {
        if (parsed.speed !== undefined) carTelemetry.speed = Number(parsed.speed);
        if (parsed.battery_level !== undefined) carTelemetry.battery_level = Number(parsed.battery_level);
        if (parsed.state !== undefined) carTelemetry.state = String(parsed.state);
        if (parsed.odometer !== undefined) carTelemetry.odometer = Number(parsed.odometer);
        if (parsed.outside_temp !== undefined) carTelemetry.outside_temp = Number(parsed.outside_temp);
        if (parsed.shift_state !== undefined) carTelemetry.shift_state = String(parsed.shift_state);
        if (parsed.sentry_mode !== undefined) carTelemetry.sentry_mode = parsed.sentry_mode === true || String(parsed.sentry_mode).toLowerCase() === "true";
        if (parsed.active_route !== undefined) carTelemetry.active_route = parsed.active_route;
        applyTpmsData(parsed);
      }
    } catch {}
  }

  const logEntry = {
    id: Math.random().toString(36).substring(2, 9),
    topic,
    payload: payloadStr,
    timestamp,
    parsedGps: parsedGps || undefined,
  };
  messageLogs.unshift(logEntry);
  if (messageLogs.length > 50) {
    messageLogs.pop();
  }

  broadcast({
    type: "message",
    message: logEntry,
    carLocation,
    carTelemetry,
    topics: Array.from(topicsMap.entries()),
  });

  return res.json({
    success: true,
    message: "Message simulé et diffusé avec succès aux clients !"
  });

});

// ================= VITE ASSET HANDLING =================

async function startServer() {
  const isDev = process.env.NODE_ENV === "development" || 
    (process.env.NODE_ENV !== "production" && 
     (typeof __filename === "undefined" || !__filename.endsWith("server.cjs")));

  const httpServer = http.createServer(app);

  if (isDev) {
    // Development Mode: Use Vite Middleware with HMR bound to httpServer
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode: Serve Static Build Files
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // No explicit host: listen on IPv4 and IPv6 (the Home Assistant Nginx proxy reaches add-ons over IPv6)
  httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT} (IPv4 + IPv6)`);
  });
}

startServer();
