import { useCallback, useEffect, useState } from "react";
import { Award, Ban, Check, Lock, Route, Share2, UserMinus, UserPlus, UserRound, Users, Grid3x3 } from "lucide-react";
import { AuthForm } from "../components/AuthForm";
import { useAuth } from "../hooks/useAuth";
import { shareLink } from "../services/appBridge";
import { setDisplayName } from "../services/publicTrips";
import {
  SocialError,
  block,
  follow,
  getProfile,
  profileUrl,
  saveSocialSettings,
  unblock,
  unfollow,
  type Profile,
} from "../services/social";
import { formatClock, formatKm } from "../utils/tripStats";
import { RouteThumb } from "../components/RouteThumb";
import { summarize, type Explored } from "../services/explored";

function Toggle({ label, note, on, onChange }: { label: string; note: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4" />
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs text-asphalt/60">{note}</span>
      </span>
    </label>
  );
}

function ChooseName({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6 font-hud text-asphalt">
      <form
        className="w-full max-w-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await setDisplayName(name.trim());
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save the name");
          } finally {
            setBusy(false);
          }
        }}
      >
        <UserRound aria-hidden className="h-10 w-10 text-asphalt/40" />
        <h1 className="mt-3 text-xl font-bold">Set up your profile</h1>
        <p className="mt-1 text-sm text-asphalt/65">
          Your profile shows the name you choose and the trips you share. Your email is never shown.
        </p>
        <label className="mt-4 block text-sm font-bold" htmlFor="public-name">
          Public name
        </label>
        <input
          id="public-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          required
          className="mt-1 w-full rounded-xl border-2 border-asphalt/20 bg-paper px-3 py-2.5 text-base"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-signal">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || !name.trim()} className="mt-4 h-11 w-full rounded-xl bg-highway text-sm font-bold text-white disabled:opacity-50">
          Save
        </button>
        <a href="/" className="mt-3 block text-center text-sm font-bold text-highway">
          ← Map Trip
        </a>
      </form>
    </main>
  );
}

/** A person's page (/u/<id>): name, trips you may see, achievements if they show them, follow. */
export default function ProfileViewer({ userId }: { userId: string }) {
  const auth = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needSignIn, setNeedSignIn] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    () =>
      getProfile(userId)
        .then((p) => {
          setMissing(false);
          setProfile(p);
          document.title = `${p.displayName} · Map Trip`;
        })
        .catch(() => setMissing(true)),
    [userId],
  );
  // Reload when signing in or out: what's visible depends on who's looking.
  useEffect(() => {
    void load();
  }, [load, auth.user?.id]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      if (e instanceof SocialError && e.status === 401) setNeedSignIn(true);
      else setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // Your own page before you've picked a public name: pick one here.
  if (missing && auth.user?.id === userId) return <ChooseName onDone={() => void load()} />;
  if (missing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper p-6 font-hud text-asphalt">
        <div className="max-w-sm text-center">
          <Users aria-hidden className="mx-auto h-10 w-10 text-asphalt/40" />
          <h1 className="mt-3 text-xl font-bold">Profile not found</h1>
          <a href="/" className="mt-5 inline-block rounded-xl bg-asphalt px-5 py-3 text-sm font-bold text-paper">
            Open Map Trip
          </a>
        </div>
      </main>
    );
  }
  if (!profile) return <main className="min-h-screen bg-paper p-6 font-hud text-asphalt/60">Loading…</main>;

  const rel = profile.relationship;
  const followLabel =
    rel.following === "approved" ? "Following" : rel.following === "pending" ? "Requested" : rel.followsMe === "approved" ? "Follow back" : "Request to follow";

  return (
    <main className="min-h-[100dvh] overflow-y-auto bg-paper font-hud text-asphalt">
      <div className="mx-auto max-w-xl px-4 pb-16 pt-6">
        <a href="/" className="text-sm font-bold text-highway">
          ← Map Trip
        </a>
        <div className="mt-4 flex items-center gap-4">
          <div aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-highway text-2xl font-bold text-white">
            {profile.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold">{profile.displayName}</h1>
            <p className="text-sm text-asphalt/65">
              {profile.followers} follower{profile.followers === 1 ? "" : "s"} · {profile.following} following
              {rel.followsMe === "approved" && !profile.isMe ? " · follows you" : ""}
            </p>
          </div>
        </div>

        {!profile.isMe && !rel.blockedByMe && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!auth.user) return setNeedSignIn(true);
                void act(() => (rel.following === "none" ? follow(profile.userId) : unfollow(profile.userId)));
              }}
              aria-pressed={rel.following !== "none"}
              className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:opacity-50 ${
                rel.following === "none" ? "bg-highway text-white" : "border-2 border-asphalt/25"
              }`}
              title={rel.following === "approved" ? "Tap to unfollow" : rel.following === "pending" ? "Tap to cancel the request" : undefined}
            >
              {rel.following === "approved" ? <Check className="h-4 w-4" /> : rel.following === "pending" ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {followLabel}
            </button>
            {auth.user && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Block ${profile.displayName}? You'll stop following each other and they can't request to follow you.`))
                    void act(() => block(profile.userId));
                }}
                className="flex h-11 items-center gap-1.5 rounded-xl border-2 border-asphalt/15 px-3 text-sm text-asphalt/70"
              >
                <Ban className="h-4 w-4" /> Block
              </button>
            )}
          </div>
        )}
        {rel.blockedByMe && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-asphalt/5 px-3 py-2 text-sm">
            You blocked {profile.displayName}.
            <button type="button" onClick={() => void act(() => unblock(profile.userId))} className="font-bold text-highway">
              Unblock
            </button>
          </div>
        )}
        {rel.following === "pending" && (
          <p className="mt-2 text-xs text-asphalt/60">Waiting for {profile.displayName} to approve. Approved followers also see unlisted trips.</p>
        )}
        {needSignIn && !auth.user && (
          <div className="mt-3">
            <AuthForm reason={`to follow ${profile.displayName}.`} onAuthenticate={auth.authenticate} onSuccess={() => setNeedSignIn(false)} onCancel={() => setNeedSignIn(false)} />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-signal">
            {error}
          </p>
        )}

        {profile.isMe && profile.settings && (
          <section className="mt-5 rounded-xl border-2 border-asphalt/10 p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Your profile</h2>
              <button
                type="button"
                onClick={async () => {
                  const r = await shareLink(profile.displayName, `${profile.displayName} on Map Trip`, profileUrl(profile.userId)).catch(() => null);
                  if (r === "copied") setCopied(true);
                }}
                className="flex items-center gap-1 text-xs font-bold text-highway"
              >
                <Share2 className="h-3.5 w-3.5" /> {copied ? "Link copied" : "Share profile link"}
              </button>
            </div>
            <Toggle
              label="Show my achievements"
              note="On your profile, for anyone who can see it. Off: only you see them."
              on={profile.settings.showAchievements}
              onChange={(v) => void act(() => saveSocialSettings({ showAchievements: v }))}
            />
            <Toggle
              label="Show my explored map"
              note="Countries, regions and squares from trips you've shared (not near your Home or Work). Off: only you see it."
              on={profile.settings.showExplored}
              onChange={(v) => void act(() => saveSocialSettings({ showExplored: v }))}
            />
            <Toggle
              label="Join the leaderboard"
              note="Your weekly and monthly distance, shown to you and people who follow you."
              on={profile.settings.leaderboard}
              onChange={(v) => void act(() => saveSocialSettings({ leaderboard: v }))}
            />
          </section>
        )}

        {profile.explored && profile.explored.length > 0 && <ProfileExplored cells={profile.explored} />}

        {profile.achievements && profile.achievements.length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Award className="h-5 w-5 text-[#9a6700]" /> Achievements
              {profile.isMe && !profile.settings?.showAchievements && <Lock className="h-4 w-4 text-asphalt/40" aria-label="Only you can see these" />}
            </h2>
            <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {profile.achievements.map((a) => (
                <li key={a.id} className={`rounded-xl p-3 ${a.earned ? "bg-milestone/25" : "bg-asphalt/5"}`}>
                  <div className={`text-sm font-bold ${a.earned ? "" : "text-asphalt/55"}`}>{a.title}</div>
                  <div className="text-[11px] text-asphalt/60">{a.description}</div>
                  {!a.earned && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-asphalt/10" role="progressbar" aria-valuenow={Math.round(a.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full bg-highway" style={{ width: `${a.progress * 100}%` }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {profile.isMe && <p className="mt-1 text-[11px] text-asphalt/50">Counted from trips recorded in the app and saved to your account (imports don't count).</p>}
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-lg font-bold">Trips</h2>
          {profile.trips.length === 0 ? (
            <p className="mt-2 text-sm text-asphalt/60">No shared trips {profile.isMe ? "yet. Share one from Trips." : "you can see."}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {profile.trips.map((t) => (
                <li key={t.id}>
                  <a href={`/t/${t.id}`} className="flex items-center gap-3 rounded-xl bg-asphalt/5 p-3">
                    {t.line?.length ? (
                      <RouteThumb lines={t.line} className="h-12 w-12 text-highway" />
                    ) : (
                      <Route aria-hidden className="h-5 w-5 flex-shrink-0 text-highway" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{t.title}</span>
                      <span className="block text-xs text-asphalt/60">
                        {formatKm(t.stats.distanceM)} km · {formatClock(t.stats.durationS)} ·{" "}
                        {new Date(`${t.stats.date}T12:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
                        {t.visibility === "unlisted" ? " · followers & link" : ""}
                        {t.imported ? " · imported" : ""}
                        {t.reactions ? ` · 👏 ${t.reactions}` : ""}
                        {t.comments ? ` · 💬 ${t.comments}` : ""}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

/** Someone's Explored map, as they chose to show it: counts and countries. */
function ProfileExplored({ cells }: { cells: string[] }) {
  const [data, setData] = useState<Explored | null>(null);
  useEffect(() => {
    void summarize(cells)
      .then(setData)
      .catch(() => setData(null));
  }, [cells]);
  return (
    <section className="mt-6" aria-label="Explored map">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Grid3x3 className="h-5 w-5 text-highway" /> Explored
      </h2>
      <p className="mt-1 text-sm text-asphalt/70">
        {cells.length.toLocaleString()} {cells.length === 1 ? "square" : "squares"} (~1 km²)
        {data && (
          <>
            {" "}
            · {data.countries.length} {data.countries.length === 1 ? "country" : "countries"} · {data.regionCount}{" "}
            {data.regionCount === 1 ? "region" : "regions"}
          </>
        )}
      </p>
      {data && data.countries.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {data.countries.map((c) => (
            <li key={c.code} className="rounded-full bg-asphalt/5 px-3 py-1 text-sm">
              {c.name} <span className="text-asphalt/60">· {c.regions.length}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
