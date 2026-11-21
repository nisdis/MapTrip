import { useCallback } from "react";
import { authClient } from "../services/authClient";

export type AuthMode = "signin" | "signup";

/** Optional auth: only used for saving trips to the cloud. */
export function useAuth() {
  const { data: session } = authClient.useSession();

  const authenticate = useCallback(
    async (mode: AuthMode, email: string, password: string) => {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              email,
              password,
              name: email.split("@")[0],
            })
          : await authClient.signIn.email({ email, password });
      if (result.error) {
        throw new Error(
          result.error.message ||
            "Couldn't reach the account service. Try again later.",
        );
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    await authClient.signOut();
  }, []);

  return { user: session?.user ?? null, authenticate, signOut };
}
