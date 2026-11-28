// A trip's name, as the owner types it. Shared by the app and the server.
// No imports: used by both.

export const TRIP_NAME_MAX = 80;

/**
 * A usable trip name: invisible and control characters removed, spaces
 * collapsed, 1–80 characters. Null when nothing is left.
 */
export function cleanTripName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  return [...name].slice(0, TRIP_NAME_MAX).join("").trim();
}
