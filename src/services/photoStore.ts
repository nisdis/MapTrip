import { useEffect, useState } from "react";
import localforage from "localforage";

// Photos live in the browser (IndexedDB) until a trip is saved to the cloud.
const store = localforage.createInstance({
  name: "record-my-trip",
  storeName: "photos",
});

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/** Downscales and re-encodes as JPEG: small uploads, and EXIF/GPS is stripped. */
export async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This image format isn't supported by your browser");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
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
 * Where to show a trip photo from: this device if it's here, else the account
 * (a trip recorded on another device). null while loading or if neither has it.
 */
export function usePhotoUrl(photo: { id: string; cloudPath?: string }): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void getPhotoBlob(photo.id).then((blob) => {
      if (cancelled) return;
      if (blob) setUrl((objectUrl = URL.createObjectURL(blob)));
      else if (photo.cloudPath) setUrl(`/api/photo?path=${encodeURIComponent(photo.cloudPath)}`);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id, photo.cloudPath]);
  return url;
}
