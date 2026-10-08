// Telegram notifications triggered by telemetry transitions. Each alert fires once, then re-arms when the
// situation is back to normal. State is kept in memory: after a restart, an ongoing alert is reported again.
import { broadcastMessage, isTelegramConfigured, getChatIds, TelegramResult } from "./telegram";

export interface NotificationTelemetry {
  state: string | null;
  shift_state: string | null;
  battery_level: number | null;
  tpms: Record<string, number | boolean | null | undefined> | null;
  charging: Record<string, number | boolean | null> | null;
  security: Record<string, boolean | null> | null;
}

interface NotificationConfig {
  chargeStarted: boolean;
  chargeComplete: boolean;
  chargeEndingSoon: boolean;
  chargeEndingSoonMinutes: number;
  tpms: boolean;
  tpmsThresholdBar: number;
  batteryLow: boolean;
  batteryLowThreshold: number;
  leftOpen: boolean;
  leftOpenDelayMinutes: number;
}

export interface NotificationStatus {
  configured: boolean;
  chatCount: number;
  commands: boolean;
  alerts: { key: string; label: string; enabled: boolean }[];
}

// Charging values (power, time to full) settle about a minute after charging starts
const CHARGE_STARTED_DELAY_MS = 60 * 1000;
// A tyre must go back this far above the threshold before it can alert again
const TPMS_HYSTERESIS_BAR = 0.1;
// The battery must charge this much above the threshold before it can alert again
const BATTERY_HYSTERESIS_PERCENT = 5;
const PSI_PER_BAR = 14.5038;

const TYRES = [
  { key: "fl", label: "avant gauche" },
  { key: "fr", label: "avant droit" },
  { key: "rl", label: "arrière gauche" },
  { key: "rr", label: "arrière droit" },
] as const;

const OPENINGS = [
  { key: "doors_open", label: "une porte est ouverte" },
  { key: "trunk_open", label: "le coffre est ouvert" },
  { key: "frunk_open", label: "le frunk est ouvert" },
  { key: "windows_open", label: "une fenêtre est ouverte" },
] as const;

let config: NotificationConfig | null = null;
let latest: NotificationTelemetry | null = null;
let previousState: string | null = null;
let chargeStartedTimer: NodeJS.Timeout | null = null;
const alertedTyres = new Set<string>();
// Set while charging once the remaining time has been seen above the threshold, so the alert fires on the crossing
let chargeEndingSoonArmed = false;
let batteryLowAlerted = false;
let leftOpenTimer: NodeJS.Timeout | null = null;
let leftOpenAlerted = false;

function envFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return defaultValue;
  return value.toLowerCase() === "true";
}

function envNumber(name: string, defaultValue: number): number {
  const value = Number(process.env[name]);
  return process.env[name] && Number.isFinite(value) && value > 0 ? value : defaultValue;
}

// Called once environment variables (.env, add-on options) are loaded, after initTelegram()
export function initNotifications() {
  if (!isTelegramConfigured()) {
    console.log("Telegram notifications disabled (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set)");
    return;
  }

  config = {
    chargeStarted: envFlag("NOTIFY_CHARGE_STARTED", true),
    chargeComplete: envFlag("NOTIFY_CHARGE_COMPLETE", true),
    chargeEndingSoon: envFlag("NOTIFY_CHARGE_ENDING_SOON", true),
    chargeEndingSoonMinutes: envNumber("CHARGE_ENDING_SOON_MINUTES", 15),
    tpms: envFlag("NOTIFY_TPMS", true),
    tpmsThresholdBar: envNumber("TPMS_ALERT_THRESHOLD", 2.3),
    batteryLow: envFlag("NOTIFY_BATTERY_LOW", true),
    batteryLowThreshold: envNumber("BATTERY_LOW_THRESHOLD", 20),
    leftOpen: envFlag("NOTIFY_LEFT_OPEN", true),
    leftOpenDelayMinutes: envNumber("LEFT_OPEN_DELAY_MINUTES", 10),
  };

  const enabled = getNotificationStatus().alerts.filter((a) => a.enabled).map((a) => a.label);
  console.log(`Telegram notifications enabled for ${getChatIds().length} chat(s): ${enabled.join(", ") || "aucune"}`);
}

export function getNotificationStatus(): NotificationStatus {
  const c = config;
  return {
    configured: isTelegramConfigured(),
    chatCount: getChatIds().length,
    commands: isTelegramConfigured() && envFlag("TELEGRAM_COMMANDS", true),
    alerts: [
      { key: "charge_started", label: "Début de charge", enabled: !!c?.chargeStarted },
      { key: "charge_ending_soon", label: `Fin de charge dans ${c?.chargeEndingSoonMinutes ?? 15} min`, enabled: !!c?.chargeEndingSoon },
      { key: "charge_complete", label: "Fin de charge", enabled: !!c?.chargeComplete },
      { key: "tpms", label: `Pneus < ${c?.tpmsThresholdBar ?? 2.3} bar`, enabled: !!c?.tpms },
      { key: "battery_low", label: `Batterie < ${c?.batteryLowThreshold ?? 20}%`, enabled: !!c?.batteryLow },
      { key: "left_open", label: `Voiture ouverte depuis ${c?.leftOpenDelayMinutes ?? 10} min`, enabled: !!c?.leftOpen },
    ],
  };
}

export async function sendTestNotification(): Promise<TelegramResult[]> {
  const enabled = getNotificationStatus().alerts.filter((a) => a.enabled).map((a) => `• ${a.label}`);
  return broadcastMessage(
    ["🔔 <b>Notification de test</b>", "Tesla Tracker peut vous écrire.", "", "Alertes actives :", ...(enabled.length ? enabled : ["• aucune"])].join("\n")
  );
}

function send(text: string) {
  void broadcastMessage(text);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatEta(hours: number): string {
  const eta = new Date(Date.now() + hours * 3600 * 1000);
  return eta.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h === 0 ? `${m} min` : `${h} h ${m.toString().padStart(2, "0")}`;
}

// Shared with the /charge bot command
export function chargingSummaryLines(t: NotificationTelemetry): string[] {
  const power = num(t.charging?.charger_power);
  const limit = num(t.charging?.charge_limit_soc);
  const timeToFull = num(t.charging?.time_to_full_charge);
  const added = num(t.charging?.charge_energy_added);
  const lines: string[] = [];
  if (t.battery_level !== null) lines.push(`Batterie : ${t.battery_level}%${limit !== null ? ` → ${limit}%` : ""}`);
  if (power !== null) lines.push(`Puissance : ${power} kW`);
  if (added !== null && added > 0) lines.push(`Énergie ajoutée : ${added.toFixed(2)} kWh`);
  if (timeToFull !== null && timeToFull > 0) {
    lines.push(`Fin prévue vers <b>${formatEta(timeToFull)}</b> (dans ${formatDuration(timeToFull)})`);
  }
  return lines;
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
  if (!isCharging) chargeEndingSoonArmed = false;
  if (isFirstState) return;

  if (isCharging && config.chargeStarted) {
    if (chargeStartedTimer) clearTimeout(chargeStartedTimer);
    chargeStartedTimer = setTimeout(() => {
      chargeStartedTimer = null;
      if (latest?.state === "charging") send(["⚡ <b>Recharge démarrée</b>", ...chargingSummaryLines(latest)].join("\n"));
    }, CHARGE_STARTED_DELAY_MS);
  }

  if (wasCharging && !isCharging) {
    if (chargeStartedTimer) {
      clearTimeout(chargeStartedTimer);
      chargeStartedTimer = null;
    }
    if (config.chargeComplete) send(chargeEndedMessage(t));
  }
}

function checkChargeEndingSoon(t: NotificationTelemetry) {
  if (!config?.chargeEndingSoon || t.state !== "charging") return;
  const timeToFull = num(t.charging?.time_to_full_charge);
  if (timeToFull === null || timeToFull <= 0) return;
  const thresholdHours = config.chargeEndingSoonMinutes / 60;

  if (timeToFull > thresholdHours) {
    chargeEndingSoonArmed = true;
  } else if (chargeEndingSoonArmed) {
    chargeEndingSoonArmed = false;
    send(["🔋 <b>Fin de charge imminente</b>", ...chargingSummaryLines(t)].join("\n"));
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
    send([`🛞 <b>Pression des pneus basse</b> (seuil ${threshold} bar)`, ...newAlerts].join("\n"));
  }
}

function checkBatteryLow(t: NotificationTelemetry) {
  if (!config?.batteryLow || t.battery_level === null) return;
  const threshold = config.batteryLowThreshold;
  if (t.state === "charging" || t.battery_level >= threshold + BATTERY_HYSTERESIS_PERCENT) {
    batteryLowAlerted = false;
    return;
  }
  if (t.battery_level < threshold && !batteryLowAlerted) {
    batteryLowAlerted = true;
    const range = num(t.charging?.est_battery_range_km);
    const pluggedIn = t.charging?.plugged_in === true;
    send(
      [
        `🪫 <b>Batterie basse : ${t.battery_level}%</b>`,
        range !== null ? `Autonomie estimée : ${Math.round(range)} km` : null,
        pluggedIn ? "Câble branché, mais la voiture ne charge pas." : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
}

// What is left open or unlocked, as sentences for the alert
export function openIssues(t: NotificationTelemetry): string[] {
  const s = t.security;
  if (!s) return [];
  const issues: string[] = [];
  if (s.locked === false) issues.push("la voiture est déverrouillée");
  for (const { key, label } of OPENINGS) if (s[key] === true) issues.push(label);
  return issues;
}

// Parked with nobody inside: the only situation where something left open is worth an alert
function isUnattended(t: NotificationTelemetry): boolean {
  const parked = t.state !== "driving" && (t.shift_state === null || t.shift_state === "P");
  return parked && t.security?.is_user_present !== true;
}

function checkLeftOpen(t: NotificationTelemetry) {
  if (!config?.leftOpen) return;
  const shouldWatch = openIssues(t).length > 0 && isUnattended(t);

  if (!shouldWatch) {
    if (leftOpenTimer) clearTimeout(leftOpenTimer);
    leftOpenTimer = null;
    // Locked again, or someone is back in the car: a later departure must alert again
    leftOpenAlerted = false;
    return;
  }
  if (leftOpenTimer || leftOpenAlerted) return;

  const delayMinutes = config.leftOpenDelayMinutes;
  leftOpenTimer = setTimeout(() => {
    leftOpenTimer = null;
    if (!latest || !isUnattended(latest)) return;
    const issues = openIssues(latest);
    if (issues.length === 0) return;
    leftOpenAlerted = true;
    send([`🔓 <b>Voiture laissée ouverte</b> depuis ${delayMinutes} min`, ...issues.map((i) => `• ${i[0].toUpperCase()}${i.slice(1)}`)].join("\n"));
  }, delayMinutes * 60 * 1000);
}

// Called after every MQTT message with the up-to-date telemetry
export function onTelemetryUpdate(telemetry: NotificationTelemetry) {
  if (!config) return;
  latest = telemetry;
  checkCharging(telemetry);
  checkChargeEndingSoon(telemetry);
  checkTpms(telemetry);
  checkBatteryLow(telemetry);
  checkLeftOpen(telemetry);
}
