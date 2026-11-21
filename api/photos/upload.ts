import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getAuth } from "../_lib/auth.js";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

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
        // Users may only write their own photos: trips/<userId>/<uuid>.jpg
        const expected = new RegExp(
          `^trips/${session.user.id.replace(/[^a-zA-Z0-9_-]/g, "")}/[0-9a-f-]{36}\\.jpg$`,
          "i",
        );
        if (!expected.test(pathname)) throw new Error("Invalid photo path");
        return {
          allowedContentTypes: ["image/jpeg"],
          maximumSizeInBytes: MAX_PHOTO_BYTES,
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
