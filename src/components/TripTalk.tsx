import { useCallback, useEffect, useState } from "react";
import { Flag, MessageCircle, Send, Trash2 } from "lucide-react";
import { AuthForm } from "./AuthForm";
import type { AuthMode } from "../hooks/useAuth";
import {
  REACTIONS,
  SocialError,
  addComment,
  deleteComment,
  getTalk,
  reportComment,
  setReaction,
  type ReactionId,
  type TripTalk as Talk,
} from "../services/social";
import { track } from "../services/usage";

interface TripTalkProps {
  tripId: string;
  signedIn: boolean;
  onAuthenticate: (mode: AuthMode, email: string, password: string) => Promise<void>;
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
};

/** Reactions and comments under a shared trip. */
export function TripTalk({ tripId, signedIn, onAuthenticate }: TripTalkProps) {
  const [talk, setTalk] = useState<Talk | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [reported, setReported] = useState<string[]>([]);
  const [reporting, setReporting] = useState<string | null>(null);

  const load = useCallback(() => getTalk(tripId).then(setTalk).catch(() => setTalk(null)), [tripId]);
  useEffect(() => {
    void load();
  }, [load, signedIn]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    if (!signedIn) return setSignIn(true);
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof SocialError || e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (!talk) return null;
  const total = Object.values(talk.counts).reduce((a, b) => a + b, 0);
  const who = talk.people.slice(0, 3).map((p) => p.name);

  return (
    <section aria-label="Reactions and comments" className="mt-3 border-t border-asphalt/15 pt-3">
      <div role="group" aria-label="React" className="flex flex-wrap gap-1.5">
        {REACTIONS.map((r) => {
          const on = talk.mine === r.id;
          const n = talk.counts[r.id];
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              aria-label={`${r.label}${n ? ` (${n})` : ""}`}
              title={r.label}
              disabled={busy || (signedIn && !talk.canTalk && !talk.isOwner)}
              onClick={() =>
                act(async () => {
                  await setReaction(tripId, on ? null : (r.id as ReactionId));
                  if (!on) track("reaction_added");
                })
              }
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-base disabled:opacity-50 ${
                on ? "border-highway bg-highway/10" : "border-asphalt/20"
              }`}
            >
              <span aria-hidden>{r.emoji}</span>
              {n > 0 && <span className="text-xs font-bold tabular-nums">{n}</span>}
            </button>
          );
        })}
      </div>
      {total > 0 && (
        <p className="mt-1.5 text-xs text-asphalt/60">
          {who.join(", ")}
          {total > who.length ? ` and ${total - who.length} more` : ""} reacted
        </p>
      )}

      <h2 className="mt-3 flex items-center gap-1.5 text-sm font-bold">
        <MessageCircle aria-hidden className="h-4 w-4" /> Comments {talk.comments.length > 0 && <span className="font-normal text-asphalt/60">{talk.comments.length}</span>}
      </h2>
      <ul className="mt-1 space-y-2" aria-label="Comments">
        {talk.comments.map((c) => (
          <li key={c.id} className="rounded-xl bg-asphalt/5 p-2.5">
            <div className="flex items-baseline gap-2 text-xs">
              <a href={`/u/${c.author.id}`} className="font-bold text-highway">
                {c.author.name}
              </a>
              <span className="text-asphalt/50">{ago(c.createdAt)}</span>
              <span className="ml-auto flex gap-1">
                {c.canDelete && (
                  <button
                    type="button"
                    aria-label="Delete comment"
                    onClick={() => window.confirm("Delete this comment?") && act(() => deleteComment(c.id))}
                    className="rounded p-1 text-asphalt/50 hover:text-signal"
                  >
                    <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  </button>
                )}
                {signedIn && !c.canDelete && !reported.includes(c.id) && (
                  <button
                    type="button"
                    aria-label="Report comment"
                    onClick={() => setReporting(reporting === c.id ? null : c.id)}
                    className="rounded p-1 text-asphalt/50 hover:text-signal"
                  >
                    <Flag aria-hidden className="h-3.5 w-3.5" />
                  </button>
                )}
                {reported.includes(c.id) && <span className="text-asphalt/50">Reported</span>}
              </span>
            </div>
            <p className="mt-0.5 whitespace-pre-line break-words text-sm">{c.body}</p>
            {reporting === c.id && (
              <div role="group" aria-label="Why report it?" className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-asphalt/60">Why?</span>
                {(
                  [
                    ["spam", "Spam"],
                    ["harassment", "Harassment"],
                    ["inappropriate", "Inappropriate"],
                    ["other", "Other"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      act(async () => {
                        await reportComment(c.id, id);
                        setReported((r) => [...r, c.id]);
                        setReporting(null);
                      })
                    }
                    className="rounded-full border border-asphalt/25 px-2.5 py-1"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
        {talk.comments.length === 0 && <li className="text-sm text-asphalt/50">No comments yet.</li>}
      </ul>

      {talk.canTalk || talk.isOwner ? (
        <form
          className="mt-2 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            void act(async () => {
              await addComment(tripId, draft);
              track("comment_added");
              setDraft("");
            });
          }}
        >
          <label className="sr-only" htmlFor={`comment-${tripId}`}>
            Write a comment
          </label>
          <textarea
            id={`comment-${tripId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 500))}
            rows={1}
            placeholder="Write a comment…"
            className="min-h-[2.5rem] flex-1 resize-none rounded-xl border border-asphalt/20 bg-white px-3 py-2 text-sm dark:bg-transparent"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Post comment"
            className="rounded-xl bg-highway p-2.5 text-white disabled:opacity-40"
          >
            <Send aria-hidden className="h-4 w-4" />
          </button>
        </form>
      ) : signedIn ? (
        <p className="mt-2 text-xs text-asphalt/60">
          You can react and comment on public trips, and on unlisted ones from people you follow, once you have a public
          name on your profile.
        </p>
      ) : (
        !signIn && (
          <button type="button" onClick={() => setSignIn(true)} className="mt-2 text-sm font-bold text-highway underline">
            Sign in to react and comment
          </button>
        )
      )}
      {error && <p className="mt-2 text-sm text-signal">{error}</p>}
      {signIn && !signedIn && (
        <div className="mt-2">
          <AuthForm
            reason="to react and comment."
            onAuthenticate={onAuthenticate}
            onSuccess={() => setSignIn(false)}
            onCancel={() => setSignIn(false)}
          />
        </div>
      )}
    </section>
  );
}
