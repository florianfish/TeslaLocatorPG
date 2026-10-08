import { ReactNode, useEffect } from "react";
import { History, X } from "lucide-react";
// Bundled at build time: the changelog is the same for every role and needs no API call
import changelogMarkdown from "../../tesla-locator/CHANGELOG.md?raw";

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersion: string;
}

interface ChangelogEntry {
  version: string;
  items: string[];
}

// The changelog only uses "## <version>" headings and "- " bullets
function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      entries.push({ version: heading[1], items: [] });
    } else if (entries.length > 0 && /^\s*-\s+/.test(line)) {
      entries[entries.length - 1].items.push(line.replace(/^\s*-\s+/, ""));
    }
  }
  return entries;
}

// Inline `code` and **bold** rendered as React nodes (no raw HTML injection)
function renderInline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-400 font-mono text-[11px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-slate-100 font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

const entries = parseChangelog(changelogMarkdown);

export default function ChangelogModal({ isOpen, onClose, currentVersion }: ChangelogModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // The add-on image reports "v1.3.1"; local builds report "v2.2.<commits> (<hash>)" and match nothing
  const current = currentVersion.replace(/^v/, "").split(" ")[0];

  return (
    <div
      className="fixed inset-0 z-[3000] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 font-sans"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        className="w-full max-w-lg max-h-[80vh] bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 p-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E82127]/15 border border-[#E82127]/30 flex items-center justify-center text-[#E82127]">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 id="changelog-title" className="text-xs font-bold text-slate-300 uppercase tracking-widest">Nouveautés</h2>
              <p className="text-[10px] text-slate-500 font-mono">Version installée : {currentVersion}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl border bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/50 transition-colors cursor-pointer"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5 custom-scrollbar">
          {entries.map((entry) => {
            const isCurrent = entry.version === current;
            return (
              <section key={entry.version}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className={`font-mono font-bold text-sm ${isCurrent ? "text-[#E82127]" : "text-slate-200"}`}>
                    v{entry.version}
                  </h3>
                  {isCurrent && (
                    <span className="px-2 py-0.5 rounded-full bg-[#E82127]/15 border border-[#E82127]/30 text-[#E82127] text-[9px] font-bold uppercase tracking-wider">
                      Version actuelle
                    </span>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {entry.items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-400 leading-relaxed">
                      <span className="text-[#E82127] shrink-0">•</span>
                      <span>{renderInline(item)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
