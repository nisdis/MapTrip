import { createAuthClient } from "better-auth/react";

// Same-origin: talks to the /api/auth function on whichever domain serves the app.
export const authClient = createAuthClient();
