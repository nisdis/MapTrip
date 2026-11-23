import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_GAP_MS, _resetNominatimClient, nominatimGet } from "../../src/services/nominatimClient";

describe("nominatim client (shared rate limit)", () => {
  const calls: number[] = [];
  let fail = false;

  beforeEach(() => {
    _resetNominatimClient();
    calls.length = 0;
    fail = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls.push(Date.now());
        return fail ? new Response("busy", { status: 503 }) : Response.json([{ ok: true }]);
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("spaces requests at least MIN_GAP_MS apart across callers", async () => {
    await Promise.all([nominatimGet("/a"), nominatimGet("/b"), nominatimGet("/c")]);
    expect(calls).toHaveLength(3);
    for (let i = 1; i < calls.length; i++) expect(calls[i] - calls[i - 1]).toBeGreaterThanOrEqual(MIN_GAP_MS - 20);
  });

  it("shares identical requests and reuses answers", async () => {
    const [a, b] = await Promise.all([nominatimGet("/same"), nominatimGet("/same")]);
    await nominatimGet("/same");
    expect(calls).toHaveLength(1);
    expect(a).toEqual(b);
  });

  it("never caches a failure", async () => {
    fail = true;
    await expect(nominatimGet("/flaky")).rejects.toThrow("503");
    fail = false;
    await expect(nominatimGet("/flaky")).resolves.toEqual([{ ok: true }]);
    expect(calls).toHaveLength(2);
  });

  it("a caller can stop waiting without cancelling the shared request", async () => {
    const ctrl = new AbortController();
    const first = nominatimGet("/shared", ctrl.signal);
    const second = nominatimGet("/shared");
    ctrl.abort();
    await expect(first).rejects.toThrow("Aborted");
    await expect(second).resolves.toEqual([{ ok: true }]);
  });
});
