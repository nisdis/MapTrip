import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getAuth } from "../_lib/auth.js";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
// Videos are up to 100 MB, shrunk to 720p in the app first (~40 MB a minute). Same as src/utils/media.ts.
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const VIDEO_TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

async function handler(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const json = await handleUpload({
      body,
      request,
      // Runs only when a browser asks for an upload token (not on Blob's callback).
      onBeforeGenerateToken: async (pathname) => {
        const session = await getAuth().api.getSession({ headers: request.headers });
        if (!session) throw new Error("Please sign in");
        // Users may only write their own photos and videos: trips/<userId>/<uuid>.<jpg|mp4|mov|webm>
        const expected = new RegExp(
          `^trips/${session.user.id.replace(/[^a-zA-Z0-9_-]/g, "")}/[0-9a-f-]{36}\\.(jpg|mp4|mov|webm)$`,
          "i",
        );
        const m = expected.exec(pathname);
        if (!m) throw new Error("Invalid photo path");
        const ext = m[1].toLowerCase();
        const video = ext !== "jpg";
        return {
          allowedContentTypes: video ? [VIDEO_TYPES[ext]] : ["image/jpeg"],
          maximumSizeInBytes: video ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES,
          addRandomSuffix: false,
          allowOverwrite: true, // lets a failed save be retried
        };
      },
    });
    return Response.json(json);
  } catch (error) {
    console.error("Photo upload error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return Response.json({ message }, { status: message === "Please sign in" ? 401 : 400 });
  }
}

export { handler as POST };
