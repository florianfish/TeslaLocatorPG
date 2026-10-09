import fs from "fs";
import path from "path";
import { broadcastMessage, escapeHtml } from "./telegram";

// Starts / stops charging through a Home Assistant switch entity (Tesla Fleet, Teslemetry, Tessie...),
// immediately or at a scheduled time. TeslaMate itself is read-only and cannot send commands to the car.

export interface ChargeControlStatus {
  configured: boolean;
  entity: string | null;
  scheduledAt: number | null;
  lastRun: { at: number; action: "on" | "off"; scheduled: boolean; ok: boolean; error?: string } | null;
}

// A schedule missed while the server was down still runs if it is not older than this
const MISSED_SCHEDULE_GRACE_MS = 30 * 60 * 1000;
export const MAX_SCHEDULE_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;

let entity = "";
let haBaseUrl = "";
let haToken = "";
let storeFile = "";
let scheduledAt: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastRun: ChargeControlStatus["lastRun"] = null;

// Called once environment variables (.env, add-on options) are loaded
export function initChargeControl() {
  entity = (process.env.CHARGE_SWITCH_ENTITY || "").trim();
  // Inside the add-on, the Supervisor proxies the Home Assistant API with its own token.
  // Elsewhere (Docker, local dev), HA_URL + a long-lived access token are needed.
  if (process.env.SUPERVISOR_TOKEN) {
    haBaseUrl = "http://supervisor/core/api";
    haToken = process.env.SUPERVISOR_TOKEN;
  } else {
    haBaseUrl = (process.env.HA_URL || "").replace(/\/+$/, "") + "/api";
    haToken = process.env.HA_TOKEN || "";
  }

  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  storeFile = path.join(dataDir, "charge-schedule.json");

  if (!isChargeControlConfigured()) {
    if (entity) console.warn("Charge control disabled: Home Assistant API not reachable (HA_URL / HA_TOKEN not set)");
    return;
  }
  console.log(`Charge control enabled with ${entity}`);
  restoreSchedule();
}

export function isChargeControlConfigured(): boolean {
  return /^switch\.[a-z0-9_]+$/.test(entity) && haToken !== "" && haBaseUrl !== "/api";
}

export function getChargeControlStatus(): ChargeControlStatus {
  const configured = isChargeControlConfigured();
  return { configured, entity: configured ? entity : null, scheduledAt, lastRun };
}

async function callSwitch(on: boolean): Promise<void> {
  const res = await fetch(`${haBaseUrl}/services/switch/${on ? "turn_on" : "turn_off"}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${haToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ entity_id: entity }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Home Assistant a répondu ${res.status}${detail ? ` : ${detail}` : ""}`);
  }
}

export async function setCharging(on: boolean, scheduled = false): Promise<ChargeControlStatus> {
  const action = on ? "on" : "off";
  try {
    await callSwitch(on);
    lastRun = { at: Date.now(), action, scheduled, ok: true };
    console.log(`Charge control: ${entity} turned ${action}${scheduled ? " (scheduled)" : ""}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    lastRun = { at: Date.now(), action, scheduled, ok: false, error };
    console.error(`Charge control: failed to turn ${action} ${entity}: ${error}`);
    throw new Error(error);
  }
  return getChargeControlStatus();
}

function formatTime(at: number): string {
  return new Date(at).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

async function runScheduledStart() {
  clearSchedule();
  try {
    await setCharging(true, true);
    void broadcastMessage("⚡ <b>Recharge programmée lancée</b>\nLa demande de démarrage a été envoyée à la voiture.");
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    void broadcastMessage(`⚠️ <b>Échec de la recharge programmée</b>\n${escapeHtml(error)}`);
  }
}

function armTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (scheduledAt === null) return;
  timer = setTimeout(runScheduledStart, Math.max(0, scheduledAt - Date.now()));
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
    fs.writeFileSync(storeFile, JSON.stringify({ scheduledAt }), { mode: 0o600 });
  } catch (err) {
    console.error(`Failed to write charge schedule to ${storeFile}:`, err);
  }
}

function restoreSchedule() {
  try {
    if (!fs.existsSync(storeFile)) return;
    const saved = JSON.parse(fs.readFileSync(storeFile, "utf-8"))?.scheduledAt;
    if (typeof saved !== "number") return;
    if (saved < Date.now() - MISSED_SCHEDULE_GRACE_MS) {
      console.warn(`Charge control: scheduled start of ${new Date(saved).toISOString()} missed while stopped, discarded`);
      clearSchedule();
      return;
    }
    scheduledAt = saved;
    armTimer();
    console.log(`Charge control: start scheduled for ${new Date(saved).toISOString()}`);
  } catch (err) {
    console.error(`Failed to read charge schedule from ${storeFile}:`, err);
  }
}

export function scheduleChargeStart(at: number): ChargeControlStatus {
  scheduledAt = at;
  persist();
  armTimer();
  console.log(`Charge control: start scheduled for ${new Date(at).toISOString()}`);
  void broadcastMessage(`🕒 <b>Recharge programmée</b>\nDémarrage prévu ${escapeHtml(formatTime(at))}.`);
  return getChargeControlStatus();
}

export function clearSchedule(): ChargeControlStatus {
  scheduledAt = null;
  armTimer();
  persist();
  return getChargeControlStatus();
}
