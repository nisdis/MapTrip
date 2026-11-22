
// Turns raw GPS fixes into a steady speed.
// Phones often send fixes with no speed (Wi-Fi/cell fixes, or between GPS
// updates). Showing those as 0 makes the reading flicker, so instead:
//  - use the phone's own speed (Doppler, the most accurate) when it has one,
//  - otherwise measure distance over the last few seconds,
//  - ignore movement within the GPS error (standing still reads 0),
//  - smooth, and only fall to 0 once you have really stopped.

export interface Fix {
  lat: number;
  lng: number;
  /** epoch ms */
  t: number;
  /** metres */
  accuracy: number;
  /** m/s from the device, or null if it didn't provide one */
  speed: number | null;
}

const WINDOW_MS = 10000; // fit velocity over this much recent history
const MIN_SPAN_MS = 2000; // need at least this much time to measure
const MAX_ACCURACY_M = 60; // fixes worse than this are too vague to measure with
const STOPPED_MS = 0.5; // below ~2 km/h counts as stopped
const MAX_PLAUSIBLE_MS = 100; // 360 km/h: faster is a GPS glitch
const HOLD_MS = 4000; // keep the last speed this long when fixes carry no information
const SMOOTHING = 0.6; // 0 = frozen, 1 = no smoothing
const MAX_ACCEL = 8; // m/s² — hard braking/acceleration; bigger jumps need a second reading to confirm
const TRUST_DEVICE_MS = 3000; // after a device speed, hold it rather than mix in weaker estimates

const M_PER_DEG = 111320;

/**
 * Velocity from a straight-line fit through recent positions (least squares).
 * Using every point averages out GPS noise. The speed only counts if it is
 * clearly bigger than its own uncertainty (2 standard errors), so standing
 * still with a wandering GPS reads 0 while a slow walk still registers.
 * Returns null when there isn't enough history to say.
 */
function fittedSpeed(fixes: Fix[]): number | null {
  const n = fixes.length;
  if (n < 3 || fixes[n - 1].t - fixes[0].t < MIN_SPAN_MS) return null;
  const lat0 = fixes[0].lat;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const pts = fixes.map((f) => ({
    t: (f.t - fixes[0].t) / 1000,
    x: (f.lng - fixes[0].lng) * M_PER_DEG * cos,
    y: (f.lat - lat0) * M_PER_DEG,
  }));
  const mean = (k: "t" | "x" | "y") => pts.reduce((s, p) => s + p[k], 0) / n;
  const tm = mean("t");
  const xm = mean("x");
  const ym = mean("y");
  let stt = 0;
  let stx = 0;
  let sty = 0;
  for (const p of pts) {
    stt += (p.t - tm) ** 2;
    stx += (p.t - tm) * (p.x - xm);
    sty += (p.t - tm) * (p.y - ym);
  }
  if (stt === 0) return null;
  const vx = stx / stt;
  const vy = sty / stt;
  let ss = 0;
  for (const p of pts) {
    ss += (p.x - (xm + vx * (p.t - tm))) ** 2 + (p.y - (ym + vy * (p.t - tm))) ** 2;
  }
  const standardError = Math.sqrt(ss / Math.max(1, 2 * (n - 2)) / stt);
  const speed = Math.hypot(vx, vy);
  if (speed > MAX_PLAUSIBLE_MS) return null;
  return speed > 2 * standardError ? speed : 0;
}

export class SpeedEstimator {
  private fixes: Fix[] = [];
  private value = 0;
  private lastInformedAt = 0;
  private pending: number | null = null;
  private lastMeasuredAt = -Infinity;
  private lastDeviceAt = -Infinity;

  /** Feed one fix; returns the smoothed speed in m/s. */
  update(fix: Fix): number {
    this.fixes.push(fix);
    this.fixes = this.fixes.filter((f) => fix.t - f.t <= WINDOW_MS);

    let measured: number | null = null;

    const device = fix.speed;
    if (device != null && Number.isFinite(device) && device >= 0 && device <= MAX_PLAUSIBLE_MS) {
      measured = device;
      this.lastDeviceAt = fix.t;
    } else if (fix.t - this.lastDeviceAt <= TRUST_DEVICE_MS) {
      // The phone measured speed a moment ago (Doppler, far better than positions):
      // keep it instead of averaging in a position fit that may include a stop.
      measured = null;
      this.lastInformedAt = fix.t;
    } else {
      measured = fittedSpeed(this.fixes.filter((f) => f.accuracy <= MAX_ACCURACY_M));
    }

    if (measured != null) {
      // A jump no vehicle could make is held back until the next reading agrees,
      // so one wild GPS value can't get through, while real acceleration isn't delayed.
      const dt = Math.min(5, Math.max(1, (fix.t - this.lastMeasuredAt) / 1000));
      const plausible = Math.abs(measured - this.value) <= MAX_ACCEL * dt + 3;
      const confirmed = this.pending != null && Math.abs(measured - this.pending) <= 0.3 * measured + 2;
      this.lastMeasuredAt = fix.t;
      this.lastInformedAt = fix.t;
      if (plausible || confirmed) {
        this.pending = null;
        this.value = this.value + SMOOTHING * (measured - this.value);
      } else {
        this.pending = measured;
      }
    } else if (fix.t - this.lastInformedAt > HOLD_MS) {
      // Nothing to go on for a while: ease towards 0 rather than snapping.
      this.value = this.value * (1 - SMOOTHING);
    }

    if (this.value < STOPPED_MS) this.value = 0;
    return this.value;
  }

  reset() {
    this.fixes = [];
    this.value = 0;
    this.lastInformedAt = 0;
    this.pending = null;
    this.lastMeasuredAt = -Infinity;
    this.lastDeviceAt = -Infinity;
  }
}
