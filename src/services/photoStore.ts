import { useEffect, useState } from "react";
import localforage from "localforage";
import { imageFormat, unreadablePhotoMessage } from "../utils/media";

// Photos live in the browser (IndexedDB) until a trip is saved to the cloud.
const store = localforage.createInstance({
  name: "record-my-trip",
  storeName: "photos",
});

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/** The iPhone photo decoder isn't on this phone yet and there's no connection. */
class NeedsInternet extends Error {
  constructor() {
    super("Connect to the internet once to open iPhone (HEIC) photos. After that they work offline too.");
  }
}

/**
 * Opens a photo as something we can draw: the fast way; iPhone (HEIC) photos,
 * which most browsers can't open, with a decoder fetched only when needed
 * (about 1 MB); else the way <img> does.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (imageFormat(await file.slice(0, 32).arrayBuffer()) === "heic") {
      const decoder = await import("heic-to").catch(() => {
        throw new NeedsInternet();
      });
      return decoder.heicTo({ blob: file, type: "bitmap" });
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Downscales and re-encodes as JPEG: small uploads, and EXIF/GPS is stripped. */
export async function prepareImage(file: File): Promise<Blob> {
  let image: ImageBitmap | HTMLImageElement;
  try {
    image = await decode(file);
  } catch (e) {
    if (e instanceof NeedsInternet) throw e;
    throw new Error(unreadablePhotoMessage(imageFormat(await file.slice(0, 32).arrayBuffer())));
  }
  const w = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const h = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (!(image instanceof HTMLImageElement)) image.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Couldn't process the image");
  return blob;
}

export async function savePhotoBlob(id: string, blob: Blob): Promise<void> {
  await store.setItem(id, blob);
}

export async function getPhotoBlob(id: string): Promise<Blob | null> {
  return (await store.getItem<Blob>(id)) ?? null;
}

export async function deletePhotoBlob(id: string): Promise<void> {
  await store.removeItem(id);
}

/**
 * Where to show a trip photo or video from: this device if it's here, else
 * the account (recorded on another device). Videos from the account are
 * downloaded whole first (so they play without the server streaming them).
 * null while loading or if neither has it.
 */
export function usePhotoUrl(photo: { id: string; cloudPath?: string; kind?: string }): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const show = (blob: Blob) => {
      if (!cancelled) setUrl((objectUrl = URL.createObjectURL(blob)));
    };
    void getPhotoBlob(photo.id).then(async (blob) => {
      if (cancelled) return;
      if (blob) return show(blob);
      if (!photo.cloudPath) return;
      const remote = `/api/photo?path=${encodeURIComponent(photo.cloudPath)}`;
      if (photo.kind !== "video") return setUrl(remote);
      const res = await fetch(remote).catch(() => null);
      if (res?.ok) show(await res.blob());
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id, photo.cloudPath, photo.kind]);
  return url;
}
