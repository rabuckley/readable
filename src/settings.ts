// Use browser namespace for Firefox compatibility
declare const browser: typeof chrome;
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

export interface ReadableSettings {
  fontSize: "small" | "medium" | "large";
  theme: "light" | "dark" | "auto";
  width: "narrow" | "medium" | "wide";
}

const DEFAULTS: ReadableSettings = {
  fontSize: "medium",
  theme: "auto",
  width: "medium",
};

const STORAGE_KEY = "readableSettings";

export async function loadSettings(): Promise<ReadableSettings> {
  try {
    const result = await browserAPI.storage.local.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      return { ...DEFAULTS, ...result[STORAGE_KEY] };
    }
  } catch (e) {
    console.warn("Failed to load settings, using defaults:", e);
  }
  return { ...DEFAULTS };
}

export async function saveSettings(settings: ReadableSettings): Promise<void> {
  try {
    await browserAPI.storage.local.set({ [STORAGE_KEY]: settings });
  } catch (e) {
    console.warn("Failed to save settings:", e);
  }
}
