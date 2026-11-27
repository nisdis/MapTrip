import { get } from "@vercel/blob";
import { getAuth } from "./_lib/auth.js";
import { getPool } from "./_lib/db.js";
import { stripJpegMetadata } from "./_lib/publicTrip.js";

// Private photos are only readable through this route: by their owner, or by
// anyone for photos the owner chose to show on a shared trip.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A photo the owner chose to show on an unlisted/public trip: anyone may see it. */
async function sharedPhoto(tripId: string, photoId: string): Promise<Response> {
  const notFound = Response.json({ message: "Not found" }, { status: 404 });
  if (!UUID.test(tripId) || !UUID.test(photoId)) return notFound;
  const { rows } = await getPool().query<{ data: { photos?: { id?: string; cloudPath?: string }[] }; share: { photos?: string[] } }>(
    "select data, share from trips where id = $1 and visibility in ('unlisted', 'public')",
    [tripId],
  );
  const trip = rows[0];
  if (!trip || !(trip.share?.photos ?? []).includes(photoId)) return notFound;
  const photo = (trip.data.photos ?? []).find((p) => p.id === photoId);
  if (!photo?.cloudPath || !photo.cloudPath.endsWith(`/${photoId}.jpg`)) return notFound;
  const blob = await get(photo.cloudPath, { access: "private" });
  if (!blob || blob.statusCode !== 200) return notFound;
  const bytes = stripJpegMetadata(new Uint8Array(await new Response(blob.stream).arrayBuffer()));
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      // Short: if the owner unticks it or makes the trip private, it goes soon.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const tripId = url.searchParams.get("trip");
    const photoId = url.searchParams.get("photo");
    if (tripId != null && photoId != null) return await sharedPhoto(tripId, photoId);

    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return Response.json({ message: "Please sign in" }, { status: 401 });

    const path = new URL(request.url).searchParams.get("path") ?? "";
    const prefix = `trips/${session.user.id}/`;
    if (!path.startsWith(prefix) || path.includes("..") || !/\.(jpg|mp4|mov|webm)$/i.test(path)) {
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
