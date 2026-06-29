import React, { useState } from "react";
import { Lock, ShieldAlert, KeyRound, ArrowRight } from "lucide-react";

interface SecureLoginProps {
  isLoading: boolean;
  errorMsg: string | null;
  onVerify: (token: string) => void;
}

export default function SecureLogin({ isLoading, errorMsg, onVerify }: SecureLoginProps) {
  const [inputToken, setInputToken] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputToken.trim()) {
      onVerify(inputToken.trim());
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#E82127]/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-950/10 rounded-full blur-3xl animate-pulse delay-700"></div>

      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#E82127]/10 border border-[#E82127]/20 flex items-center justify-center text-[#E82127] mb-4 animate-bounce">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Accès Sécurisé</h1>
          <p className="text-sm text-slate-400 mt-2">
            La carte de localisation en temps réel est protégée. Veuillez saisir la clé de sécurité pour y accéder.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-500/20 rounded-xl flex gap-3 text-red-200 text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0 text-red-400" />
            <div>
              <p className="font-semibold">Vérification échouée</p>
              <p className="text-red-300/80 text-xs mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center py-6">
            <div className="w-10 h-10 border-4 border-[#E82127] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-400 text-sm mt-4 animate-pulse">Vérification de la clé d'accès...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="token" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Clé d'accès ou jeton (Token)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  id="token"
                  type="password"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="Saisissez votre clé..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-[#E82127] focus:ring-1 focus:ring-[#E82127] text-white rounded-xl py-3 pl-10 pr-4 text-sm transition-all outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#E82127] hover:bg-[#ff2b32] active:bg-[#b81216] text-white font-medium text-sm rounded-xl py-3 px-4 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#E82127]/20 group cursor-pointer"
            >
              Déverrouiller la carte
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500">
            Conseil : Vous pouvez ajouter <code className="bg-slate-950 px-1.5 py-0.5 rounded text-[#E82127]">?token=VOTRE_CLE</code> à l'URL pour un accès direct et automatique.
          </p>
        </div>
      </div>
    </div>
  );
}
