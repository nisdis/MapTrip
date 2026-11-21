import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../services/supabase";

/** Optional auth: only used for saving trips to the cloud. */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) =>
      setSession(s),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  /** Sends a magic link; no password to manage. */
  const signInWithEmail = useCallback(async (email: string) => {
    if (!supabase) throw new Error("Cloud save is not configured");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  return { user: session?.user ?? null, signInWithEmail, signOut };
}
