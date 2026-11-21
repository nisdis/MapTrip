import { get } from "@vercel/blob";
import { getAuth } from "./_lib/auth.js";

// Private photos are only readable through this route, by their owner.
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return Response.json({ message: "Please sign in" }, { status: 401 });

    const path = new URL(request.url).searchParams.get("path") ?? "";
    const prefix = `trips/${session.user.id}/`;
    if (!path.startsWith(prefix) || path.includes("..") || !/\.jpg$/i.test(path)) {
      return Response.json({ message: "Not found" }, { status: 404 });
    }

    const blob = await get(path, { access: "private" });
    if (!blob || blob.statusCode !== 200) {
      return Response.json({ message: "Not found" }, { status: 404 });
    }
    return new Response(blob.stream, {
      headers: {
        "Content-Type": blob.blob.contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Photo read error:", error);
    return Response.json({ message: "Photo unavailable" }, { status: 503 });
  }
}
