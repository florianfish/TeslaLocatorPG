// Telegram bot commands (/position, /etat, /charge, /partage), answered only in the configured chats.
// Uses long polling (getUpdates): no public URL or webhook needed, works behind Home Assistant.
import { callTelegram, sendMessage, isAuthorizedChat, hasBotToken, escapeHtml } from "./telegram";
import { NotificationTelemetry, chargingSummaryLines, openIssues } from "./notifications";

export interface BotVehicle {
  location: { lat: number; lon: number; timestamp: number } | null;
  telemetry: NotificationTelemetry & {
    speed: number | null;
    outside_temp: number | null;
    sentry_mode: boolean | null;
    active_route: { destination?: string | null; minutes_to_arrival?: number | null; energy_at_arrival?: number | null } | null;
  };
}

export type ShareResult = { ok: true; url: string; expiresAt: number } | { ok: false; error: string };

export interface BotContext {
  getVehicle(): BotVehicle;
  // durationText is what the user typed (e.g. "2h"), validated by the server like the share-links API
  createShareLink(label: string, durationText: string): ShareResult;
}

interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
}

const POLL_TIMEOUT_SECONDS = 50;
const DEFAULT_SHARE_DURATION = "2h";

const COMMANDS = [
  { command: "position", description: "Position actuelle de la voiture" },
  { command: "etat", description: "État général (batterie, verrouillage, pneus…)" },
  { command: "charge", description: "État de la recharge" },
  { command: "partage", description: "Lien de partage temporaire (ex : /partage 2h Famille)" },
  { command: "aide", description: "Liste des commandes" },
];

const STATE_LABELS: Record<string, string> = {
  online: "en ligne",
  asleep: "endormie",
  offline: "hors ligne",
  suspended: "en veille",
  charging: "en charge",
  driving: "en route",
  updating: "en mise à jour",
};

let context: BotContext | null = null;
let offset = 0;
let lastPollError = "";

export function initTelegramBot(ctx: BotContext) {
  const enabled = (process.env.TELEGRAM_COMMANDS || "true").toLowerCase() === "true";
  // Started with the token alone: messages from unknown chats are logged with their ID, which is how
  // the chat ID is found during setup
  if (!hasBotToken() || !enabled) return;
  context = ctx;
  void callTelegram("setMyCommands", { commands: COMMANDS }).catch((err) =>
    console.error(`Telegram setMyCommands failed: ${err instanceof Error ? err.message : err}`)
  );
  void pollLoop();
  console.log("Telegram bot commands enabled (/position, /etat, /charge, /partage)");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollLoop() {
  // Skip commands sent while the add-on was stopped: replaying them (e.g. /partage) would surprise
  try {
    const pending = await callTelegram<TelegramUpdate[]>("getUpdates", { offset: -1, timeout: 0 });
    if (pending.length > 0) offset = pending[pending.length - 1].update_id + 1;
  } catch {
    // Reported by the loop below
  }

  for (;;) {
    try {
      const updates = await callTelegram<TelegramUpdate[]>("getUpdates", {
        offset,
        timeout: POLL_TIMEOUT_SECONDS,
        allowed_updates: ["message"],
      });
      lastPollError = "";
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update).catch((err) => console.error("Telegram command failed:", err instanceof Error ? err.message : err));
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: number }).code;
      if (error !== lastPollError) {
        // 409: a webhook is set on this bot, or another instance polls it with the same token
        console.error(`Telegram polling failed${code === 409 ? " (bot used by another instance or a webhook)" : ""}: ${error}`);
        lastPollError = error;
      }
      await sleep(code === 409 ? 30000 : 5000);
    }
  }
}

async function handleUpdate(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.text || !context) return;
  const chatId = message.chat.id;
  if (!isAuthorizedChat(chatId)) {
    console.log(`Telegram: ignored message from chat ${chatId}, not in the configured chat IDs (add it to allow notifications and commands)`);
    return;
  }

  // "/cmd@BotName args" in groups, "/cmd args" in private chats
  const match = message.text.trim().match(/^\/([a-z_]+)(?:@\S+)?\s*(.*)$/is);
  if (!match) return;
  const command = match[1].toLowerCase();
  const args = match[2].trim();

  switch (command) {
    case "position":
      return replyPosition(chatId);
    case "etat":
    case "état":
      return sendMessage(chatId, statusText());
    case "charge":
      return sendMessage(chatId, chargeText());
    case "partage":
      return sendMessage(chatId, shareText(args));
    default:
      return sendMessage(chatId, helpText());
  }
}

function helpText(): string {
  return ["🚗 <b>Tesla Tracker</b>", "", ...COMMANDS.map((c) => `/${c.command} : ${c.description}`)].join("\n");
}

function timeAgo(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `il y a ${hours} h` : `il y a ${Math.floor(hours / 24)} j`;
}

function stateLabel(state: string | null): string {
  return state ? escapeHtml(STATE_LABELS[state] || state) : "inconnu";
}

async function replyPosition(chatId: number) {
  const { location, telemetry: t } = context!.getVehicle();
  if (!location) {
    await sendMessage(chatId, "📍 Position inconnue : aucune coordonnée reçue depuis le démarrage.");
    return;
  }
  await callTelegram("sendLocation", { chat_id: chatId, latitude: location.lat, longitude: location.lon });
  const lines = [`📍 Position ${timeAgo(location.timestamp)} · voiture ${stateLabel(t.state)}`];
  if (t.state === "driving" && t.speed !== null) lines.push(`Vitesse : ${t.speed} km/h`);
  if (t.battery_level !== null) lines.push(`Batterie : ${t.battery_level}%`);
  const route = t.active_route;
  if (route?.destination) {
    lines.push(
      `Navigation vers <b>${escapeHtml(route.destination)}</b>${route.minutes_to_arrival != null ? `, arrivée dans ${Math.round(route.minutes_to_arrival)} min` : ""}`
    );
  }
  await sendMessage(chatId, lines.join("\n"));
}

function statusText(): string {
  const { location, telemetry: t } = context!.getVehicle();
  const lines = [`🚗 <b>Voiture ${stateLabel(t.state)}</b>`];
  if (t.battery_level !== null) {
    const range = t.charging?.est_battery_range_km;
    lines.push(`🔋 Batterie : ${t.battery_level}%${typeof range === "number" ? ` (${Math.round(range)} km)` : ""}`);
  }
  if (t.security) {
    const issues = openIssues(t);
    lines.push(issues.length ? `🔓 ${issues.join(", ")}` : t.security.locked === true ? "🔒 Verrouillée, tout est fermé" : "🔒 Verrouillage inconnu");
  }
  if (t.sentry_mode !== null) lines.push(`👁️ Sentinelle : ${t.sentry_mode ? "active" : "inactive"}`);
  if (t.outside_temp !== null) lines.push(`🌡️ Extérieur : ${t.outside_temp.toFixed(1)} °C`);
  const pressures = ["fl", "fr", "rl", "rr"]
    .map((k) => t.tpms?.[`tpms_pressure_${k}`])
    .filter((v): v is number => typeof v === "number")
    .map((v) => (v > 10 ? v / 14.5038 : v));
  if (pressures.length) lines.push(`🛞 Pneus : ${Math.min(...pressures).toFixed(1)} à ${Math.max(...pressures).toFixed(1)} bar`);
  if (location) lines.push(`📍 Position ${timeAgo(location.timestamp)} (/position)`);
  return lines.join("\n");
}

function chargeText(): string {
  const { telemetry: t } = context!.getVehicle();
  if (t.state === "charging") return ["⚡ <b>Recharge en cours</b>", ...chargingSummaryLines(t)].join("\n");
  const lines = [`🔌 <b>Pas en charge</b> · voiture ${stateLabel(t.state)}`];
  if (t.battery_level !== null) lines.push(`Batterie : ${t.battery_level}%`);
  const limit = t.charging?.charge_limit_soc;
  if (typeof limit === "number") lines.push(`Limite de charge : ${limit}%`);
  if (t.charging?.plugged_in != null) lines.push(t.charging.plugged_in ? "Câble branché" : "Câble débranché");
  return lines.join("\n");
}

function shareText(args: string): string {
  // "/partage", "/partage 30m", "/partage 2h Famille" or "/partage Famille"
  const [first = "", ...rest] = args.split(/\s+/).filter(Boolean);
  const looksLikeDuration = /^\d+\s*[mhdj]?$/i.test(first);
  const durationText = looksLikeDuration ? first.replace(/j$/i, "d") : DEFAULT_SHARE_DURATION;
  const label = (looksLikeDuration ? rest.join(" ") : args).trim() || "Telegram";

  const result = context!.createShareLink(label, durationText);
  if (!result.ok) return `⚠️ ${escapeHtml(result.error)}`;
  const until = new Date(result.expiresAt).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return [`🔗 <b>Lien de partage « ${escapeHtml(label)} »</b>`, `Valable jusqu'à ${until}`, "", escapeHtml(result.url)].join("\n");
}
