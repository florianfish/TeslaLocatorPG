import crypto from "crypto";
import fs from "fs";
import path from "path";

// Temporary read-only share links, persisted so they survive a restart.
// Only a SHA-256 hash of each token is stored: a leaked file does not leak usable links.

export interface ShareLink {
  id: string;
  label: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
}

export type PublicShareLink = Omit<ShareLink, "tokenHash">;

const TOKEN_PREFIX = "sl_";
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 30 * 24 * 60;

let dataDir = "";
let storeFile = "";
let links: ShareLink[] = [];

// Called once environment variables (.env, add-on options) are loaded
export function initShareLinks() {
  dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  storeFile = path.join(dataDir, "share-links.json");
  links = load();
  console.log(`Share links store: ${storeFile} (${listShareLinks().length} active)`);
}

function load(): ShareLink[] {
  try {
    if (!fs.existsSync(storeFile)) return [];
    const parsed = JSON.parse(fs.readFileSync(storeFile, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`Failed to read share links from ${storeFile}:`, err);
    return [];
  }
}

function save() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storeFile, JSON.stringify(links, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error(`Failed to write share links to ${storeFile}:`, err);
  }
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function toPublic({ tokenHash, ...link }: ShareLink): PublicShareLink {
  return link;
}

// Accepts minutes as a number, or a string such as "90", "30m", "2h" or "7d"
export function parseDurationMinutes(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  const match = input.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([mhd]?)$/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const factor = match[2] === "d" ? 24 * 60 : match[2] === "h" ? 60 : 1;
  return value * factor;
}

export function createShareLink(label: string, durationMinutes: number): { link: PublicShareLink; token: string } {
  const token = TOKEN_PREFIX + crypto.randomBytes(24).toString("base64url");
  const now = Date.now();
  const link: ShareLink = {
    id: crypto.randomBytes(6).toString("hex"),
    label,
    tokenHash: hashToken(token),
    createdAt: now,
    expiresAt: now + Math.round(durationMinutes * 60_000),
  };
  links.push(link);
  save();
  return { link: toPublic(link), token };
}

export function findShareLink(token: string): PublicShareLink | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const tokenHash = hashToken(token);
  const link = links.find((l) => l.tokenHash === tokenHash && l.expiresAt > Date.now());
  return link ? toPublic(link) : null;
}

export function isShareLinkActive(id: string): boolean {
  return links.some((l) => l.id === id && l.expiresAt > Date.now());
}

export function listShareLinks(): PublicShareLink[] {
  const now = Date.now();
  return links.filter((l) => l.expiresAt > now).map(toPublic).sort((a, b) => a.expiresAt - b.expiresAt);
}

export function revokeShareLink(id: string): boolean {
  const before = links.length;
  links = links.filter((l) => l.id !== id);
  if (links.length === before) return false;
  save();
  return true;
}

// Drop expired entries from the store
export function purgeExpiredShareLinks() {
  const now = Date.now();
  const before = links.length;
  links = links.filter((l) => l.expiresAt > now);
  if (links.length !== before) save();
}
