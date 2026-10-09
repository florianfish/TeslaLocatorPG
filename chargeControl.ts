import fs from "fs";
import path from "path";
import { broadcastMessage, escapeHtml } from "./telegram";

// Starts / stops charging through a Home Assistant switch entity (Tesla Fleet, Teslemetry, Tessie...),
// immediately or at a scheduled time, optionally setting the charging current and the charge limit
// first through number entities. TeslaMate itself is read-only and cannot send commands to the car.

// Charging current (A) and charge limit (%) applied before starting; absent fields are left unchanged
export interface ChargeSettings {
  amps?: number;
  limit?: number;
}

// A number entity as read from Home Assistant: current value and accepted range
export interface NumberSetting {
  value: number | null;
  min: number;
  max: number;
  step: number;
}

export interface ChargeControlStatus {
  configured: boolean;
  // Why charge control is unavailable, shown to admins
  reason: string | null;
  entity: string | null;
  scheduledAt: number | null;
  scheduledSettings: ChargeSettings | null;
  // Which settings can be applied (their number entity is configured)
  canSetAmps: boolean;
  canSetLimit: boolean;
  // pending: sent to Home Assistant, still waiting for its answer (car waking up)
  lastRun: {
    at: number;
    action: "on" | "off";
    scheduled: boolean;
    ok: boolean;
    pending?: boolean;
    error?: string;
    // A setting could not be applied but charging was still started / stopped
    warning?: string;
    settings?: ChargeSettings;
  } | null;
}

// A schedule missed while the server was down still runs if it is not older than this
const MISSED_SCHEDULE_GRACE_MS = 30 * 60 * 1000;
export const MAX_SCHEDULE_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;
// Home Assistant answers once the command reached the car, which first has to wake up
// when asleep (often 20 to 60 s): give up only after this
const HA_CALL_TIMEOUT_MS = 2 * 60 * 1000;
// The UI is answered after this, the command keeps running and its outcome lands in lastRun
const RESPONSE_WAIT_MS = 20 * 1000;

let entity = "";
let currentEntity = "";
let limitEntity = "";
let wakeEntity = "";
let haBaseUrl = "";
let haToken = "";
let storeFile = "";
let scheduledAt: number | null = null;
let scheduledSettings: ChargeSettings | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastRun: ChargeControlStatus["lastRun"] = null;

// Called once environment variables (.env, add-on options) are loaded
export function initChargeControl() {
  entity = (process.env.CHARGE_SWITCH_ENTITY || "").trim();
  currentEntity = (process.env.CHARGE_CURRENT_ENTITY || "").trim();
  limitEntity = (process.env.CHARGE_LIMIT_ENTITY || "").trim();
  wakeEntity = (process.env.CHARGE_WAKE_ENTITY || "").trim();
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

  const reason = unavailableReason();
  if (reason) {
    console.log(`Charge control disabled: ${reason}`);
    return;
  }
  console.log(`Charge control enabled with ${[entity, currentEntity, limitEntity, wakeEntity].filter(Boolean).join(", ")}`);
  restoreSchedule();
}

function unavailableReason(): string | null {
  if (!entity) return "Renseigner l'option « Entité de recharge » de l'add-on (ex : switch.ma_tesla_charge), puis redémarrer l'add-on.";
  if (!/^switch\.[a-z0-9_]+$/.test(entity)) return `« ${entity} » n'est pas une entité switch valide (format attendu : switch.nom_de_l_entite).`;
  for (const [option, value] of [["Entité d'ampérage de recharge", currentEntity], ["Entité de limite de charge", limitEntity]]) {
    if (value && !/^number\.[a-z0-9_]+$/.test(value)) {
      return `Option « ${option} » : « ${value} » n'est pas une entité number valide (format attendu : number.nom_de_l_entite).`;
    }
  }
  if (wakeEntity && !/^button\.[a-z0-9_]+$/.test(wakeEntity)) {
    return `Option « Entité de réveil » : « ${wakeEntity} » n'est pas une entité button valide (format attendu : button.nom_de_l_entite).`;
  }
  if (!haToken || haBaseUrl === "/api") return "API Home Assistant inaccessible : hors add-on, renseigner HA_URL et HA_TOKEN.";
  return null;
}

export function isChargeControlConfigured(): boolean {
  return unavailableReason() === null;
}

export function getChargeControlStatus(): ChargeControlStatus {
  const reason = unavailableReason();
  const configured = reason === null;
  return {
    configured,
    reason,
    entity: configured ? entity : null,
    scheduledAt,
    scheduledSettings,
    canSetAmps: configured && currentEntity !== "",
    canSetLimit: configured && limitEntity !== "",
    lastRun,
  };
}

async function callService(domain: string, service: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${haBaseUrl}/services/${domain}/${service}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${haToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(HA_CALL_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Home Assistant turns any integration error (car asleep, command refused...) into a bare 500
    // whose real cause is only written to its own logs
    const detail =
      res.status === 500
        ? "erreur de l'intégration Tesla, voir les journaux de Home Assistant"
        : (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`${domain}.${service} ${data.entity_id ?? ""} : Home Assistant a répondu ${res.status}${detail ? ` (${detail})` : ""}`);
  }
}

// Fallback ranges when Home Assistant does not answer (or the entity is unavailable)
const DEFAULT_RANGES = {
  amps: { min: 0, max: 48, step: 1 },
  limit: { min: 50, max: 100, step: 1 },
};

// Reads a number entity from Home Assistant's state machine: does not wake the car
async function readNumber(entityId: string, fallback: Omit<NumberSetting, "value">): Promise<NumberSetting> {
  try {
    const res = await fetch(`${haBaseUrl}/states/${entityId}`, {
      headers: { Authorization: `Bearer ${haToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const attr = data?.attributes ?? {};
    const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);
    const value = Number.parseFloat(data?.state);
    return {
      value: Number.isFinite(value) ? value : null,
      min: num(attr.min, fallback.min),
      max: num(attr.max, fallback.max),
      step: num(attr.step, fallback.step),
    };
  } catch (err) {
    console.warn(`Charge control: cannot read ${entityId}: ${err instanceof Error ? err.message : String(err)}`);
    return { value: null, ...fallback };
  }
}

// Current values and accepted ranges of the configured number entities
export async function readChargeSettings(): Promise<{ amps: NumberSetting | null; limit: NumberSetting | null }> {
  if (!isChargeControlConfigured()) return { amps: null, limit: null };
  const [amps, limit] = await Promise.all([
    currentEntity ? readNumber(currentEntity, DEFAULT_RANGES.amps) : null,
    limitEntity ? readNumber(limitEntity, DEFAULT_RANGES.limit) : null,
  ]);
  return { amps, limit };
}

// Checks requested settings against the configured entities and their ranges; throws a readable message
export async function validateChargeSettings(raw: unknown): Promise<ChargeSettings> {
  const input = (raw ?? {}) as Record<string, unknown>;
  const settings: ChargeSettings = {};
  const ranges = await readChargeSettings();
  const check = (key: "amps" | "limit", label: string, unit: string, range: NumberSetting | null) => {
    const value = input[key];
    if (value === undefined || value === null || value === "") return;
    if (!range) throw new Error(`${label} : entité non configurée dans les options de l'add-on.`);
    if (typeof value !== "number" || !Number.isInteger(value) || value < range.min || value > range.max) {
      throw new Error(`${label} invalide : entre ${range.min} et ${range.max} ${unit}.`);
    }
    settings[key] = value;
  };
  check("amps", "Ampérage", "A", ranges.amps);
  check("limit", "Limite de charge", "%", ranges.limit);
  return settings;
}

export function describeSettings(settings: ChargeSettings | null | undefined): string {
  if (!settings) return "";
  const parts = [settings.amps !== undefined && `${settings.amps} A`, settings.limit !== undefined && `jusqu'à ${settings.limit} %`];
  return parts.filter(Boolean).join(", ");
}

type SettingStep = { label: string; entityId: string; value: number };

async function setNumber({ entityId, value }: SettingStep): Promise<void> {
  await callService("number", "set_value", { entity_id: entityId, value });
}

// Applies the settings, then flips the switch. Tesla Fleet's number entities do not wake the car
// (the integration fails with "The vehicle is not 'online'") while its switch does: the wake button,
// when configured, is pressed first, and settings still refused are retried once the switch went
// through. One still failing does not prevent charging, it is reported as a warning.
async function sendCommand(on: boolean, settings: ChargeSettings): Promise<string | undefined> {
  const candidates: [string, string, number | undefined, Omit<NumberSetting, "value">][] = [
    ["Ampérage", currentEntity, settings.amps, DEFAULT_RANGES.amps],
    ["Limite de charge", limitEntity, settings.limit, DEFAULT_RANGES.limit],
  ];
  // Values already in place are not sent again (reading the state does not wake the car)
  const steps: SettingStep[] = [];
  for (const [label, entityId, value, range] of candidates) {
    if (value === undefined) continue;
    if ((await readNumber(entityId, range)).value !== value) steps.push({ label, entityId, value });
  }

  if (steps.length && wakeEntity) {
    try {
      await callService("button", "press", { entity_id: wakeEntity });
    } catch (err) {
      console.warn(`Charge control: cannot wake the car with ${wakeEntity}: ${describeError(err)}`);
    }
  }

  const failed: SettingStep[] = [];
  for (const step of steps) {
    try {
      await setNumber(step);
    } catch (err) {
      console.warn(`Charge control: cannot set ${step.entityId} to ${step.value} yet, retrying after the switch: ${describeError(err)}`);
      failed.push(step);
    }
  }
  await callService("switch", on ? "turn_on" : "turn_off", { entity_id: entity });

  const warnings: string[] = [];
  for (const step of failed) {
    try {
      await setNumber(step);
    } catch (err) {
      const error = describeError(err);
      console.warn(`Charge control: cannot set ${step.entityId} to ${step.value}: ${error}`);
      warnings.push(`${step.label} non appliqué(e) : ${error}`);
    }
  }
  return warnings.length ? warnings.join(" ; ") : undefined;
}

function describeError(err: unknown): string {
  if (err instanceof Error && err.name === "TimeoutError") {
    return `Pas de réponse de Home Assistant après ${HA_CALL_TIMEOUT_MS / 60000} min : voiture injoignable ?`;
  }
  return err instanceof Error ? err.message : String(err);
}

// Sends the command and records its outcome in lastRun; rejects with a readable message
// Resolves with a warning when a setting could not be applied
function runSwitch(on: boolean, scheduled: boolean, settings: ChargeSettings = {}): Promise<string | undefined> {
  const action = on ? "on" : "off";
  lastRun = { at: Date.now(), action, scheduled, ok: false, pending: true, settings };
  const detail = describeSettings(settings);
  return sendCommand(on, settings).then(
    (warning) => {
      lastRun = { at: Date.now(), action, scheduled, ok: true, warning, settings };
      console.log(`Charge control: ${entity} turned ${action}${detail ? ` (${detail})` : ""}${scheduled ? " (scheduled)" : ""}`);
      return warning;
    },
    (err) => {
      const error = describeError(err);
      lastRun = { at: Date.now(), action, scheduled, ok: false, error, settings };
      console.error(`Charge control: failed to turn ${action} ${entity}: ${error}`);
      throw new Error(error);
    }
  );
}

// Immediate start / stop from the UI: answers once Home Assistant confirms, or after
// RESPONSE_WAIT_MS with lastRun still pending while a sleeping car wakes up
export async function setCharging(on: boolean, settings: ChargeSettings = {}): Promise<ChargeControlStatus> {
  const run = runSwitch(on, false, on ? settings : {});
  let waitTimer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<"slow">((resolve) => {
    waitTimer = setTimeout(() => resolve("slow"), RESPONSE_WAIT_MS);
  });
  try {
    const result = await Promise.race([run.then(() => "done" as const), slow]);
    // Still running: its outcome is kept in lastRun, nobody awaits the rejection anymore
    if (result === "slow") run.catch(() => {});
  } finally {
    clearTimeout(waitTimer);
  }
  return getChargeControlStatus();
}

function formatTime(at: number): string {
  return new Date(at).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

async function runScheduledStart() {
  const settings = scheduledSettings ?? {};
  clearSchedule();
  try {
    const warning = await runSwitch(true, true, settings);
    const detail = describeSettings(settings);
    void broadcastMessage(
      `⚡ <b>Recharge programmée lancée</b>\nLa demande de démarrage a été envoyée à la voiture${detail ? ` (${escapeHtml(detail)})` : ""}.` +
        (warning ? `\n⚠️ ${escapeHtml(warning)}` : "")
    );
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
    fs.writeFileSync(storeFile, JSON.stringify({ scheduledAt, settings: scheduledSettings }), { mode: 0o600 });
  } catch (err) {
    console.error(`Failed to write charge schedule to ${storeFile}:`, err);
  }
}

function restoreSchedule() {
  try {
    if (!fs.existsSync(storeFile)) return;
    const stored = JSON.parse(fs.readFileSync(storeFile, "utf-8"));
    const saved = stored?.scheduledAt;
    if (typeof saved !== "number") return;
    if (saved < Date.now() - MISSED_SCHEDULE_GRACE_MS) {
      console.warn(`Charge control: scheduled start of ${new Date(saved).toISOString()} missed while stopped, discarded`);
      clearSchedule();
      return;
    }
    scheduledAt = saved;
    scheduledSettings = restoreSettings(stored?.settings);
    armTimer();
    console.log(`Charge control: start scheduled for ${new Date(saved).toISOString()}`);
  } catch (err) {
    console.error(`Failed to read charge schedule from ${storeFile}:`, err);
  }
}

// Keeps only the settings whose entity is still configured (options may have changed since)
function restoreSettings(raw: unknown): ChargeSettings | null {
  const input = (raw ?? {}) as Record<string, unknown>;
  const settings: ChargeSettings = {};
  if (currentEntity && typeof input.amps === "number") settings.amps = input.amps;
  if (limitEntity && typeof input.limit === "number") settings.limit = input.limit;
  return Object.keys(settings).length ? settings : null;
}

export function scheduleChargeStart(at: number, settings: ChargeSettings = {}): ChargeControlStatus {
  scheduledAt = at;
  scheduledSettings = Object.keys(settings).length ? settings : null;
  persist();
  armTimer();
  const detail = describeSettings(scheduledSettings);
  console.log(`Charge control: start scheduled for ${new Date(at).toISOString()}${detail ? ` (${detail})` : ""}`);
  void broadcastMessage(
    `🕒 <b>Recharge programmée</b>\nDémarrage prévu ${escapeHtml(formatTime(at))}${detail ? ` (${escapeHtml(detail)})` : ""}.`
  );
  return getChargeControlStatus();
}

export function clearSchedule(): ChargeControlStatus {
  scheduledAt = null;
  scheduledSettings = null;
  armTimer();
  persist();
  return getChargeControlStatus();
}
