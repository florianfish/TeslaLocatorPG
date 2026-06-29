import express from "express";
import path from "path";
import dotenv from "dotenv";
import mqtt from "mqtt";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Secrets & Token configuration
const SECURE_ACCESS_TOKEN = process.env.SECURE_ACCESS_TOKEN || "xxxxxxxxxxx";

// MQTT Configuration
const rawBrokerUrl = process.env.MQTT_BROKER_URL || "mqtt://xxx.xxx.xxx.xxx:1883";
const MQTT_USERNAME = process.env.MQTT_USERNAME || "xxxxx";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "xxxxx";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "teslamate/cars/1/location";

// Resolve connection scheme
let brokerUrl = rawBrokerUrl;
if (brokerUrl.startsWith("http://")) {
  brokerUrl = "mqtt://" + brokerUrl.substring(7);
} else if (brokerUrl.startsWith("https://")) {
  brokerUrl = "mqtts://" + brokerUrl.substring(8);
}

console.log(`Configured MQTT connection: ${brokerUrl} as user: ${MQTT_USERNAME}`);

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
  active_route: null as any,
};

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

// SSE Clients for real-time streaming
const clients: express.Response[] = [];

// Helper to broadcast events to all connected SSE clients
function broadcast(data: any) {
  clients.forEach((client) => {
    try {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
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
          `teslamate/cars/${carId}/active_route`
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
      const carIdMatch = topic.match(/^teslamate\/cars\/([^/]+)\/(speed|state|battery_level|odometer|outside_temp|shift_state|active_route)$/);
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
            if (parsed.active_route !== undefined) carTelemetry.active_route = parsed.active_route;
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
  const { token } = req.query;
  const isValid = token === SECURE_ACCESS_TOKEN;

  res.json({
    authorized: isValid,
    brokerUrl: rawBrokerUrl,
    topicConfig: MQTT_TOPIC,
    defaultLocation: { lat: 46.2276, lon: 2.2137 } // Center of France
  });
});

// Endpoint to fetch latest data on-demand
app.get("/api/data", (req, res) => {
  const { token } = req.query;
  if (token !== SECURE_ACCESS_TOKEN) {
    return res.status(403).json({ error: "Unauthorized. Missing or invalid secure token." });
  }

  res.json({
    mqttStatus,
    mqttError,
    carLocation,
    carTelemetry,
    topics: Array.from(topicsMap.entries()),
    logs: messageLogs,
  });
});

// Real-time Event Stream (SSE)
app.get("/api/stream", (req, res) => {
  const { token } = req.query;
  if (token !== SECURE_ACCESS_TOKEN) {
    return res.status(403).send("Unauthorized. Missing or invalid secure token.");
  }

  // Set SSE headers (including X-Accel-Buffering to prevent proxy buffering)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send initial comment to flush buffering proxies
  res.write(":\n\n");

  // Send initial load
  const initialPayload = {
    type: "init",
    mqttStatus,
    mqttError,
    carLocation,
    carTelemetry,
    topics: Array.from(topicsMap.entries()),
    logs: messageLogs,
  };
  res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);

  // Keep track of active stream connections
  clients.push(res);

  req.on("close", () => {
    const index = clients.indexOf(res);
    if (index !== -1) {
      clients.splice(index, 1);
    }
  });
});

// Periodic keep-alive ping to prevent proxy/browser timeout disconnections
setInterval(() => {
  clients.forEach((client) => {
    try {
      client.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
    } catch (err) {
      // client error or closed connection (handled by req.on("close"))
    }
  });
}, 10000);

// Support publishing custom coordinates for testing / simulation
app.post("/api/test-publish", (req, res) => {
  const { token } = req.query;
  if (token !== SECURE_ACCESS_TOKEN) {
    return res.status(403).json({ error: "Unauthorized. Missing or invalid secure token." });
  }

  const { topic, payload } = req.body;
  if (!topic || !payload) {
    return res.status(400).json({ error: "Missing topic or payload in body" });
  }

  const payloadStr = typeof payload === "object" ? JSON.stringify(payload) : String(payload);

  if (mqttClient && mqttClient.connected) {
    mqttClient.publish(topic, payloadStr, { qos: 0, retain: false }, (err) => {
      if (err) {
        console.error("Failed to publish test message to MQTT broker:", err);
        return res.status(500).json({ error: "Failed to publish: " + err.message });
      }
      return res.json({ success: true, message: "Published successfully to MQTT broker!" });
    });
  } else {
    // If not connected to a live broker, simulate receiving the message locally so the user can still test the UI!
    console.log(`[Simulating MQTT Local Message] topic: ${topic}, payload: ${payloadStr}`);
    
    const timestamp = Date.now();
    const parsedGps = parseGps(payloadStr);

    topicsMap.set(topic, {
      payload: payloadStr,
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
    const carIdMatch = topic.match(/^teslamate\/cars\/([^/]+)\/(speed|state|battery_level|odometer|outside_temp|shift_state|active_route)$/);
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

      // Extract extra telemetry parameters if they happen to be part of the location JSON payload
      try {
        const parsed = JSON.parse(payloadStr);
        if (parsed && typeof parsed === "object") {
          if (parsed.speed !== undefined) carTelemetry.speed = Number(parsed.speed);
          if (parsed.battery_level !== undefined) carTelemetry.battery_level = Number(parsed.battery_level);
          if (parsed.state !== undefined) carTelemetry.state = String(parsed.state);
          if (parsed.odometer !== undefined) carTelemetry.odometer = Number(parsed.odometer);
          if (parsed.outside_temp !== undefined) carTelemetry.outside_temp = Number(parsed.outside_temp);
          if (parsed.shift_state !== undefined) carTelemetry.shift_state = String(parsed.shift_state);
          if (parsed.active_route !== undefined) carTelemetry.active_route = parsed.active_route;
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
      message: "Simulated message locally (MQTT client is currently offline or disconnected)."
    });
  }
});

// ================= VITE ASSET HANDLING =================

async function startServer() {
  const isDev = process.env.NODE_ENV === "development" || 
    (process.env.NODE_ENV !== "production" && 
     (typeof __filename === "undefined" || !__filename.endsWith("server.cjs")));

  if (isDev) {
    // Development Mode: Use Vite Middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
