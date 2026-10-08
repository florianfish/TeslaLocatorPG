import React, { useEffect, useState } from "react";
import { X, Share2, Link2, Copy, Check, Trash2, Clock, AlertTriangle, Plus } from "lucide-react";
import { ShareLink } from "../types";

interface SharePanelProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
}

const DURATIONS = [
  { label: "30 min", value: "30m" },
  { label: "1 h", value: "1h" },
  { label: "2 h", value: "2h" },
  { label: "8 h", value: "8h" },
  { label: "24 h", value: "24h" },
  { label: "7 j", value: "7d" },
];

function formatExpiry(expiresAt: number, now: number): string {
  const minutes = Math.max(0, Math.round((expiresAt - now) / 60000));
  const remaining =
    minutes < 60 ? `${minutes} min` : minutes < 48 * 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : `${Math.round(minutes / 1440)} j`;
  const date = new Date(expiresAt).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return `${remaining} (${date})`;
}

export default function SharePanel({ isOpen, onClose, token }: SharePanelProps) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [duration, setDuration] = useState("2h");
  const [isCreating, setIsCreating] = useState(false);
  const [created, setCreated] = useState<{ url: string | null; token: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const apiUrl = (suffix = "") => `api/share-links${suffix}?token=${encodeURIComponent(token)}`;

  const loadLinks = async () => {
    try {
      const res = await fetch(apiUrl());
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible de charger les liens.");
      setLinks(data.links);
      setPublicUrl(data.publicUrl);
    } catch (err: any) {
      setError(err.message || "Erreur réseau.");
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadLinks();
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Expired links disappear from the list without a refetch
  const activeLinks = links.filter((l) => l.expiresAt > now);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(apiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, duration }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible de créer le lien.");
      setCreated({ url: data.url, token: data.token, label: data.label });
      setLabel("");
      setNow(Date.now());
      await loadLinks();
    } catch (err: any) {
      setError(err.message || "Erreur réseau.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(apiUrl(`/${encodeURIComponent(id)}`), { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible de révoquer le lien.");
      await loadLinks();
    } catch (err: any) {
      setError(err.message || "Erreur réseau.");
    }
  };

  const createdValue = created ? created.url || created.token : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(createdValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie impossible : sélectionnez le lien et copiez-le manuellement.");
    }
  };

  const handleNativeShare = async () => {
    if (!created?.url) return;
    try {
      await navigator.share({ title: "Position de la Tesla", text: created.label, url: created.url });
    } catch {
      // share sheet dismissed
    }
  };

  return (
    <div className="absolute right-0 top-0 h-full w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl z-[1001] flex flex-col font-sans text-slate-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
        <div className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-sky-400" />
          <div>
            <h2 className="text-sm font-bold text-white">Liens de partage</h2>
            <p className="text-[10px] text-slate-500 font-medium">Accès en lecture seule, limité dans le temps</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {publicUrl === null && (
          <div className="p-3 bg-amber-950/30 border border-amber-500/20 rounded-xl flex gap-2.5 text-amber-200 text-[11px] leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <p>
              Aucune URL publique configurée (option <span className="font-mono">public_url</span>) : seul le jeton sera affiché, à
              ajouter à l'adresse d'accès direct sous la forme <span className="font-mono">?token=…</span>.
            </p>
          </div>
        )}

        {/* Creation form */}
        <form onSubmit={handleCreate} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Libellé</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              placeholder="ex : Trajet retour vacances"
              className="bg-slate-900 border border-slate-800 focus:border-sky-500/50 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Durée de validité</span>
            <div className="grid grid-cols-3 gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDuration(d.value)}
                  className={`py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    duration === d.value
                      ? "bg-sky-500/15 border-sky-500/50 text-sky-300"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isCreating}
            className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {isCreating ? "Création..." : "Créer le lien"}
          </button>
        </form>

        {error && (
          <div className="p-3 bg-rose-950/30 border border-rose-500/20 rounded-xl flex gap-2.5 text-rose-300 text-[11px]">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <p>{error}</p>
          </div>
        )}

        {/* Freshly created link: the token is only shown once */}
        {created && (
          <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3 flex flex-col gap-2">
            <p className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
              {created.url ? "Lien créé" : "Jeton créé"} : copiez-le maintenant, il ne sera plus affiché
            </p>
            <input
              readOnly
              value={createdValue}
              onFocus={(e) => e.target.select()}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-200 outline-none select-all"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg py-2 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copié" : "Copier"}
              </button>
              {created.url && typeof navigator.share === "function" && (
                <button
                  onClick={handleNativeShare}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg py-2 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Envoyer
                </button>
              )}
            </div>
          </div>
        )}

        {/* Active links */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            Liens actifs ({activeLinks.length})
          </span>
          {activeLinks.length === 0 ? (
            <p className="text-xs text-slate-500 italic">Aucun lien actif.</p>
          ) : (
            activeLinks.map((link) => (
              <div key={link.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-start gap-2">
                  <Link2 className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate" title={link.label}>{link.label}</p>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Expire dans {formatExpiry(link.expiresAt, now)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(link.id)}
                  title="Révoquer ce lien"
                  className="w-8 h-8 shrink-0 rounded-lg border border-slate-800 hover:border-rose-500/40 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
