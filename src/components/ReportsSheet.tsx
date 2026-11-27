import { useEffect, useState } from "react";
import { ExternalLink, Flag, X } from "lucide-react";
import { REPORT_REASONS, getReports, moderate, moderateComment, type ReportedComment, type ReportedTrip } from "../services/publicTrips";

const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;

/** Admins: reported trips, to restore (back into Explore) or take down (made private). */
export function ReportsSheet({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ReportedTrip[] | null>(null);
  const [comments, setComments] = useState<ReportedComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    getReports()
      .then((r) => {
        setItems(r.reports);
        setComments(r.comments ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load reports"));
  useEffect(() => {
    void load();
  }, []);

  const decide = async (id: string, decision: "restore" | "remove") => {
    if (decision === "remove" && !window.confirm("Take this trip down? It becomes private; only its owner can see it.")) return;
    setBusy(id);
    try {
      await moderate(id, decision);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Reported trips"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Flag className="h-5 w-5 text-red-600" /> Reported trips
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {items && items.length === 0 && comments.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-500">Nothing to review.</p>
        )}
        <ul className="mt-3 space-y-3">
          {(items ?? []).map((r) => (
            <li key={r.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.title ?? "Trip"}</div>
                  <div className="text-xs text-gray-500">
                    {r.display_name ?? "No name"} · {r.visibility} · {r.count} report{r.count === 1 ? "" : "s"}
                    {r.hidden_at && r.visibility === "public" ? " · out of Explore" : ""}
                  </div>
                </div>
                <a href={`/t/${r.id}`} target="_blank" rel="noreferrer" className="p-1 text-gray-500" aria-label="Open trip">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-gray-700">
                {r.reasons.map((reason, i) => (
                  <li key={i}>
                    • {reasonLabel(reason)}
                    {r.details[i] ? `: “${r.details[i]}”` : ""}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => decide(r.id, "restore")}
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => decide(r.id, "remove")}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white"
                >
                  Take down
                </button>
              </div>
            </li>
          ))}
        </ul>
        {comments.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-semibold text-gray-700">Reported comments</h3>
            <ul className="mt-2 space-y-3" aria-label="Reported comments">
              {comments.map((c) => (
                <li key={c.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 whitespace-pre-line break-words text-sm">“{c.body}”</p>
                    <a href={`/t/${c.trip_id}`} target="_blank" rel="noreferrer" className="p-1 text-gray-500" aria-label="Open trip">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    by {c.author ?? "No name"} · {c.count} report{c.count === 1 ? "" : "s"}: {c.reasons.join(", ")}
                  </div>
                  <div className="mt-3 flex gap-2">
                    {(["keep", "remove"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        disabled={busy === c.id}
                        onClick={async () => {
                          setBusy(c.id);
                          try {
                            await moderateComment(c.id, d);
                            await load();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Couldn't save");
                          } finally {
                            setBusy(null);
                          }
                        }}
                        className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                          d === "remove" ? "bg-red-600 text-white" : "border border-gray-300"
                        }`}
                      >
                        {d === "remove" ? "Remove comment" : "Keep it"}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
