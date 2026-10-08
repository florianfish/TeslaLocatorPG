import { useEffect, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, MessageSquare, Send, XCircle } from "lucide-react";

interface NotificationStatus {
  configured: boolean;
  chatCount: number;
  commands: boolean;
  alerts: { key: string; label: string; enabled: boolean }[];
}

interface TestResult {
  chatId: string;
  ok: boolean;
  error?: string;
}

interface NotificationsTabProps {
  token: string;
}

export default function NotificationsTab({ token }: NotificationsTabProps) {
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`api/notifications?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`);
        setStatus(await res.json());
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [token]);

  const sendTest = async () => {
    setIsSending(true);
    setResults(null);
    setSendError(null);
    try {
      const res = await fetch(`api/notifications/test?token=${encodeURIComponent(token)}`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setResults(data.results);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  };

  if (loadError) {
    return <p className="text-xs text-rose-400">Impossible de lire la configuration : {loadError}</p>;
  }
  if (!status) {
    return <p className="text-xs text-slate-500 italic">Chargement…</p>;
  }

  return (
    <div className="space-y-4">
      <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${status.configured ? "bg-emerald-950/30 border-emerald-500/30" : "bg-amber-950/30 border-amber-500/30"}`}>
        {status.configured ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="text-xs">
          <p className={`font-bold ${status.configured ? "text-emerald-300" : "text-amber-300"}`}>
            {status.configured ? `Telegram configuré (${status.chatCount} chat${status.chatCount > 1 ? "s" : ""})` : "Telegram non configuré"}
          </p>
          <p className="text-slate-400 mt-0.5">
            {status.configured
              ? "Les alertes se règlent dans l'onglet Configuration de l'add-on (ou le fichier .env)."
              : "Renseigner le jeton du bot et le chat ID dans l'onglet Configuration de l'add-on, puis redémarrer."}
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <BellRing className="w-3.5 h-3.5" /> Alertes
        </h3>
        <ul className="space-y-1.5">
          {status.alerts.map((alert) => (
            <li key={alert.key} className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs">
              <span className={alert.enabled ? "text-slate-200" : "text-slate-500"}>{alert.label}</span>
              <span className={`text-[10px] font-bold uppercase ${alert.enabled ? "text-emerald-400" : "text-slate-600"}`}>
                {alert.enabled ? "Active" : "Inactive"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5 text-slate-200">
          <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Commandes du bot (/position, /etat, /charge, /partage)
        </span>
        <span className={`text-[10px] font-bold uppercase ${status.commands ? "text-emerald-400" : "text-slate-600"}`}>
          {status.commands ? "Actives" : "Inactives"}
        </span>
      </div>

      <button
        onClick={sendTest}
        disabled={!status.configured || isSending}
        className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl py-3 px-4 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
      >
        <Send className="w-4 h-4" />
        {isSending ? "Envoi…" : "Envoyer une notification de test"}
      </button>

      {sendError && <p className="text-xs text-rose-400">{sendError}</p>}
      {results && (
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li
              key={r.chatId}
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs border ${r.ok ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300" : "bg-rose-950/30 border-rose-500/30 text-rose-300"}`}
            >
              {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              <span>
                Chat <code className="font-mono">{r.chatId}</code> : {r.ok ? "envoyée" : r.error}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
