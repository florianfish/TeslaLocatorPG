// Telegram notifications triggered by telemetry transitions (charge started/finished, low tyre pressure).
// State is kept in memory: after a restart, a tyre that is still under-inflated is reported again.

export interface NotificationTelemetry {
  state: string | null;
  battery_level: number | null;
  tpms: Record<string, number | boolean | null | undefined> | null;
  charging: Record<string, number | boolean | null> | null;
}

interface NotificationConfig {
  botToken: string;
  chatIds: string[];
  chargeStarted: boolean;
  chargeComplete: boolean;
  tpms: boolean;
  tpmsThresholdBar: number;
}

// Charging values (power, time to full) settle about a minute after charging starts
const CHARGE_STARTED_DELAY_MS = 60 * 1000;
// A tyre must go back this far above the threshold before it can alert again
const TPMS_HYSTERESIS_BAR = 0.1;
const PSI_PER_BAR = 14.5038;

const TYRES = [
  { key: "fl", label: "avant gauche" },
  { key: "fr", label: "avant droit" },
  { key: "rl", label: "arrière gauche" },
  { key: "rr", label: "arrière droit" },
] as const;

let config: NotificationConfig | null = null;
let latest: NotificationTelemetry | null = null;
let previousState: string | null = null;
let chargeStartedTimer: NodeJS.Timeout | null = null;
const alertedTyres = new Set<string>();

function envFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return defaultValue;
  return value.toLowerCase() === "true";
}

// Called once environment variables (.env, add-on options) are loaded
export function initNotifications() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatIds = (process.env.TELEGRAM_CHAT_ID || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!botToken || chatIds.length === 0) {
    console.log("Telegram notifications disabled (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set)");
    return;
  }

  const threshold = Number(process.env.TPMS_ALERT_THRESHOLD);
  config = {
    botToken,
    chatIds,
    chargeStarted: envFlag("NOTIFY_CHARGE_STARTED", true),
    chargeComplete: envFlag("NOTIFY_CHARGE_COMPLETE", true),
    tpms: envFlag("NOTIFY_TPMS", true),
    tpmsThresholdBar: Number.isFinite(threshold) && threshold > 0 ? threshold : 2.3,
  };

  const enabled = [
    config.chargeStarted && "début de charge",
    config.chargeComplete && "fin de charge",
    config.tpms && `pneus < ${config.tpmsThresholdBar} bar`,
  ].filter(Boolean);
  console.log(`Telegram notifications enabled for ${chatIds.length} chat(s): ${enabled.join(", ") || "aucune"}`);
}

async function sendTelegram(text: string) {
  if (!config) return;
  for (const chatId of config.chatIds) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      });
      if (!res.ok) {
        // The response body explains the error (bad chat id, bot blocked...) without echoing the token
        console.error(`Telegram notification failed for chat ${chatId}: HTTP ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      console.error(`Telegram notification failed for chat ${chatId}:`, err instanceof Error ? err.message : err);
    }
  }
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatEta(hours: number): string {
  const eta = new Date(Date.now() + hours * 3600 * 1000);
  return eta.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h === 0 ? `${m} min` : `${h} h ${m.toString().padStart(2, "0")}`;
}

function chargeStartedMessage(t: NotificationTelemetry): string {
  const power = num(t.charging?.charger_power);
  const limit = num(t.charging?.charge_limit_soc);
  const timeToFull = num(t.charging?.time_to_full_charge);
  const lines = ["⚡ <b>Recharge démarrée</b>"];
  if (t.battery_level !== null) lines.push(`Batterie : ${t.battery_level}%${limit !== null ? ` → ${limit}%` : ""}`);
  if (power !== null) lines.push(`Puissance : ${power} kW`);
  if (timeToFull !== null && timeToFull > 0) {
    lines.push(`Fin prévue vers <b>${formatEta(timeToFull)}</b> (dans ${formatDuration(timeToFull)})`);
  }
  return lines.join("\n");
}

function chargeEndedMessage(t: NotificationTelemetry): string {
  const limit = num(t.charging?.charge_limit_soc);
  const added = num(t.charging?.charge_energy_added);
  const range = num(t.charging?.est_battery_range_km);
  // TeslaMate leaves "charging" both when the limit is reached and when the cable is unplugged early
  const reachedLimit = t.battery_level !== null && limit !== null && t.battery_level >= limit - 1;
  const lines = [reachedLimit ? "✅ <b>Recharge terminée</b>" : "⏹️ <b>Recharge interrompue</b>"];
  if (t.battery_level !== null) lines.push(`Batterie : ${t.battery_level}%${limit !== null ? ` (limite ${limit}%)` : ""}`);
  if (added !== null) lines.push(`Énergie ajoutée : ${added.toFixed(2)} kWh`);
  if (range !== null) lines.push(`Autonomie estimée : ${Math.round(range)} km`);
  return lines.join("\n");
}

function checkCharging(t: NotificationTelemetry) {
  if (!config || t.state === previousState) return;
  const wasCharging = previousState === "charging";
  const isCharging = t.state === "charging";
  // The first state received after startup is the current one, not a transition
  const isFirstState = previousState === null;
  previousState = t.state;
  if (isFirstState) return;

  if (isCharging && config.chargeStarted) {
    if (chargeStartedTimer) clearTimeout(chargeStartedTimer);
    chargeStartedTimer = setTimeout(() => {
      chargeStartedTimer = null;
      if (latest?.state === "charging") void sendTelegram(chargeStartedMessage(latest));
    }, CHARGE_STARTED_DELAY_MS);
  }

  if (wasCharging && !isCharging) {
    if (chargeStartedTimer) {
      clearTimeout(chargeStartedTimer);
      chargeStartedTimer = null;
    }
    if (config.chargeComplete) void sendTelegram(chargeEndedMessage(t));
  }
}

function checkTpms(t: NotificationTelemetry) {
  if (!config?.tpms || !t.tpms) return;
  const threshold = config.tpmsThresholdBar;
  const newAlerts: string[] = [];

  for (const { key, label } of TYRES) {
    const raw = num(t.tpms[`tpms_pressure_${key}`]);
    const softWarning = t.tpms[`tpms_soft_warning_${key}`] === true;
    // TeslaMate values can be in bar or psi depending on the car settings
    const bar = raw === null ? null : raw > 10 ? raw / PSI_PER_BAR : raw;

    const isLow = softWarning || (bar !== null && bar < threshold);
    const isRecovered = !softWarning && bar !== null && bar >= threshold + TPMS_HYSTERESIS_BAR;

    if (isLow && !alertedTyres.has(key)) {
      alertedTyres.add(key);
      newAlerts.push(`• Pneu ${label} : <b>${bar !== null ? `${bar.toFixed(1)} bar` : "?"}</b>${softWarning ? " (alerte Tesla)" : ""}`);
    } else if (isRecovered) {
      alertedTyres.delete(key);
    }
  }

  if (newAlerts.length > 0) {
    void sendTelegram([`🛞 <b>Pression des pneus basse</b> (seuil ${threshold} bar)`, ...newAlerts].join("\n"));
  }
}

// Called after every MQTT message with the up-to-date telemetry
export function onTelemetryUpdate(telemetry: NotificationTelemetry) {
  if (!config) return;
  latest = telemetry;
  checkCharging(telemetry);
  checkTpms(telemetry);
}
