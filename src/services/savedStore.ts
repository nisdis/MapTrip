import localforage from "localforage";
import type { SavedEntry } from "../types/saved";

// Saved places live on the device (no account needed); sync copies them to the cloud.
const store = localforage.createInstance({ name: "record-my-trip", storeName: "saved" });

export async function listSavedEntries(): Promise<SavedEntry[]> {
  const out: SavedEntry[] = [];
  await store.iterate<SavedEntry, void>((v) => {
    out.push(v);
  });
  return out;
}

export async function putSavedEntries(entries: SavedEntry[]): Promise<void> {
  await Promise.all(entries.map((e) => store.setItem(e.key, e)));
}
