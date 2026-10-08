// Minimal Telegram Bot API client shared by notifications and bot commands.

export interface TelegramResult {
  chatId: string;
  ok: boolean;
  error?: string;
}

let botToken = "";
let chatIds: string[] = [];
// Overridable for automated tests only (fake Bot API server); not an add-on option
let apiBaseUrl = "https://api.telegram.org";

// Called once environment variables (.env, add-on options) are loaded
export function initTelegram() {
  botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  chatIds = (process.env.TELEGRAM_CHAT_ID || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  apiBaseUrl = (process.env.TELEGRAM_API_URL || apiBaseUrl).replace(/\/+$/, "");
}

export function hasBotToken(): boolean {
  return botToken !== "";
}

export function isTelegramConfigured(): boolean {
  return botToken !== "" && chatIds.length > 0;
}

export function getChatIds(): string[] {
  return chatIds;
}

export function isAuthorizedChat(chatId: string | number): boolean {
  return chatIds.includes(String(chatId));
}

// Calls a Bot API method. Errors carry Telegram's description, never the token
export async function callTelegram<T = unknown>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBaseUrl}/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await res.json().catch(() => null)) as { ok: boolean; result?: T; description?: string; error_code?: number } | null;
  if (!res.ok || !data?.ok) {
    const error = new Error(data?.description || `HTTP ${res.status}`) as Error & { code?: number };
    error.code = data?.error_code ?? res.status;
    throw error;
  }
  return data.result as T;
}

export async function sendMessage(chatId: string | number, text: string, extra: Record<string, unknown> = {}) {
  return callTelegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
}

// Sends the same message to every configured chat and reports the outcome per chat
export async function broadcastMessage(text: string): Promise<TelegramResult[]> {
  if (!isTelegramConfigured()) return [];
  return Promise.all(
    chatIds.map(async (chatId) => {
      try {
        await sendMessage(chatId, text);
        return { chatId, ok: true };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`Telegram message failed for chat ${chatId}: ${error}`);
        return { chatId, ok: false, error };
      }
    })
  );
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
