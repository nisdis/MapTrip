import { useEffect, useState } from "react";
import { BatteryCharging, Check, X } from "lucide-react";
import { callApp } from "../services/appBridge";

interface BatteryGuideProps {
  /** lower-case brand from the app, e.g. "samsung", "xiaomi" */
  manufacturer: string;
  onClose: () => void;
}

interface Steps {
  brand: string;
  steps: string[];
  extra?: string;
}

// Where each brand hides "let this app run in the background". Menu names vary
// by model and Android version; these are the usual ones (see dontkillmyapp.com).
function stepsFor(m: string): Steps {
  const settings = "Tap Open settings below";
  if (m.includes("samsung")) {
    return {
      brand: "Samsung",
      steps: [settings, "Battery", "Choose Unrestricted"],
      extra: "Also check Settings › Battery › Background usage limits: Record My Trip must not be in Sleeping or Deep sleeping apps.",
    };
  }
  if (/xiaomi|redmi|poco/.test(m)) {
    return {
      brand: "Xiaomi",
      steps: [settings, "Battery saver (or Battery)", "Choose No restrictions"],
      extra: "On the same page, turn on Autostart.",
    };
  }
  if (/oppo|realme|oneplus/.test(m)) {
    return {
      brand: m.includes("oneplus") ? "OnePlus" : m.includes("realme") ? "Realme" : "Oppo",
      steps: [settings, "Battery usage", "Turn on Allow background activity"],
      extra: "Also turn on Allow auto launch if you see it.",
    };
  }
  if (/huawei|honor/.test(m)) {
    return {
      brand: m.includes("honor") ? "Honor" : "Huawei",
      steps: ["Open Settings › Battery › App launch", "Find Record My Trip", "Switch to Manage manually and turn on all three options"],
    };
  }
  if (m.includes("vivo")) {
    return {
      brand: "Vivo",
      steps: [settings, "Battery", "Choose Allow high background power consumption"],
    };
  }
  return { brand: "Android", steps: [settings, "App battery usage (or Battery)", "Choose Unrestricted"] };
}

/**
 * Phones save battery by stopping apps in the background, which would stop
 * trip recording with the screen off. Shown once, the first time a trip is
 * recorded in the app, while the app is still restricted.
 */
export function BatteryGuide({ manufacturer, onClose }: BatteryGuideProps) {
  const [ok, setOk] = useState(false);
  const { brand, steps, extra } = stepsFor(manufacturer);

  // Back from the settings page: check whether it worked.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      void callApp<{ unrestricted: boolean }>({ type: "batteryStatus" }).then((r) => r?.unrestricted && setOk(true));
    };
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/50" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Keep recording with the screen off"
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-[22px] bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))] font-hud text-asphalt shadow-[0_-10px_36px_rgba(31,42,48,0.22)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <BatteryCharging aria-hidden className="h-5 w-5 text-highway" />
            Keep recording with the screen off
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-asphalt/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {ok ? (
          <p role="status" className="mt-3 flex items-center gap-2 rounded-lg bg-highway/10 px-3 py-3 text-sm font-bold text-highway">
            <Check aria-hidden className="h-5 w-5" /> All set. Recording will carry on while the phone is locked.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-asphalt/75">
              {brand} phones can stop apps in the background to save battery, which would stop your trip recording when
              the screen is off. Let Record My Trip run:
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            {extra && <p className="mt-2 text-xs text-asphalt/65">{extra}</p>}
            <p className="mt-2 text-xs text-asphalt/55">It only affects this app, and only uses battery while recording.</p>
          </>
        )}

        <div className="mt-4 flex gap-2">
          {!ok && (
            <button
              type="button"
              onClick={() => void callApp({ type: "openBatterySettings" })}
              className="flex h-12 flex-1 items-center justify-center rounded-xl bg-highway font-bold text-white"
            >
              Open settings
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`h-12 rounded-xl border-2 border-asphalt/30 px-5 font-bold ${ok ? "flex-1" : ""}`}
          >
            {ok ? "Done" : "Later"}
          </button>
        </div>
      </section>
    </div>
  );
}
