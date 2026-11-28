import { describe, expect, it } from "vitest";
import { needsSync, uploadsTo } from "../../src/hooks/useTripSync";
import type { Trip } from "../../src/types/trip";

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: "t",
  name: "T",
  kind: "recorded",
  createdAt: 1,
  distanceM: 0,
  durationS: 0,
  ...over,
});

describe("which trips go to the account that's signed in", () => {
  it("trips recorded while signed out join whoever signs in", () => {
    expect(uploadsTo(trip(), "me")).toBe(true);
  });
  it("its own trips go up; another account's never do (a shared phone)", () => {
    expect(uploadsTo(trip({ ownerId: "me" }), "me")).toBe(true);
    expect(uploadsTo(trip({ ownerId: "someone-else" }), "me")).toBe(false);
  });
  it("nothing to send for trips already up, or only listed from another device", () => {
    expect(uploadsTo(trip({ ownerId: "me", cloudSyncedAt: 5 }), "me")).toBe(false);
    expect(needsSync(trip({ summaryOnly: true }))).toBe(false);
    // A photo added since the last upload: send it again.
    expect(uploadsTo(trip({ ownerId: "me", cloudSyncedAt: 5, photos: [{ id: "p", addedAt: 6 }] }), "me")).toBe(true);
  });
});

describe("renaming", () => {
  it("a renamed trip goes up, even one only listed from another device", () => {
    expect(uploadsTo(trip({ ownerId: "me", cloudSyncedAt: 5, renamed: true }), "me")).toBe(true);
    expect(uploadsTo(trip({ ownerId: "me", cloudSyncedAt: 5, summaryOnly: true, renamed: true }), "me")).toBe(true);
    expect(uploadsTo(trip({ ownerId: "someone-else", cloudSyncedAt: 5, renamed: true }), "me")).toBe(false);
  });
});

describe("cleanTripName", async () => {
  const { cleanTripName, TRIP_NAME_MAX } = await import("../../api/_lib/tripName");
  it("trims, collapses spaces, drops invisible characters", () => {
    expect(cleanTripName("  Coast \n  ride\u200b ")).toBe("Coast ride");
  });
  it("refuses empty names and non-strings", () => {
    expect(cleanTripName("   ")).toBeNull();
    expect(cleanTripName("\u200b")).toBeNull();
    expect(cleanTripName(42)).toBeNull();
  });
  it("cuts long names", () => {
    expect(cleanTripName("x".repeat(200))).toHaveLength(TRIP_NAME_MAX);
  });
});
