export const SETTINGS_KEY = "readflow.settings";

export interface Settings {
  theme: "light" | "dark" | "system";
  rate: number;
  pitch: number;
  volume: number;
  voiceChoice: string | null;
  language: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  rate: 1,
  pitch: 1,
  volume: 1,
  voiceChoice: null,
  language: "auto",
};

const listeners = new Set<() => void>();
let snapshot: Settings = DEFAULT_SETTINGS;
let snapshotRaw: string | null | undefined;

export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSettingsSnapshot(): Settings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw === snapshotRaw) return snapshot;
  snapshotRaw = raw;
  if (!raw) {
    snapshot = DEFAULT_SETTINGS;
    return snapshot;
  }
  try {
    snapshot = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    snapshot = DEFAULT_SETTINGS;
  }
  return snapshot;
}

export function getServerSettingsSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}

export function writeSettings(patch: Partial<Settings>) {
  const next = { ...getSettingsSnapshot(), ...patch };
  const raw = JSON.stringify(next);
  localStorage.setItem(SETTINGS_KEY, raw);
  snapshot = next;
  snapshotRaw = raw;
  listeners.forEach((listener) => listener());
}
