import { getAuth } from "./_lib/auth.js";

// All /api/auth/* paths are rewritten here (see vercel.json): a [...all] file only
// matches one path segment on Vercel, which broke /api/auth/sign-up/email.

async function handler(request: Request): Promise<Response> {
  try {
    return await getAuth().handler(request);
  } catch (error) {
    console.error("Auth error:", error);
    return Response.json(
      { message: "Cloud accounts are not available right now." },
      { status: 503 },
    );
  }
}

export { handler as GET, handler as POST };
