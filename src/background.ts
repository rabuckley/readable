// Use browser namespace for Firefox compatibility
declare const browser: typeof chrome;
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Persistence for Pending Reader-Mode Tabs
//
// MV3 service workers can be killed after ~30s of inactivity. An in-memory
// Set would lose all tracked tabs. We use chrome.storage.session as the
// source of truth and keep an in-memory Set as a write-through cache so
// the high-frequency onUpdated listener can check synchronously.

const STORAGE_KEY = "pendingReaderModeTabs";
const pendingReaderModeTabs = new Set<number>();

/** Restore the in-memory cache from session storage on every SW startup. */
async function hydratePendingTabs(): Promise<void> {
  try {
    const result = await browserAPI.storage.session.get(STORAGE_KEY);
    const stored = (result[STORAGE_KEY] as number[] | undefined) ?? [];
    for (const id of stored) {
      pendingReaderModeTabs.add(id);
    }
  } catch (err) {
    console.warn("Failed to hydrate pendingReaderModeTabs:", err);
  }
}

/** Fire-and-forget write of the current set to session storage. */
function persistPendingTabs(): void {
  browserAPI.storage.session
    .set({ [STORAGE_KEY]: [...pendingReaderModeTabs] })
    .catch((err: unknown) =>
      console.warn("Failed to persist pendingReaderModeTabs:", err),
    );
}

function addPendingTab(tabId: number): void {
  pendingReaderModeTabs.add(tabId);
  persistPendingTabs();
}

function removePendingTab(tabId: number): void {
  pendingReaderModeTabs.delete(tabId);
  persistPendingTabs();
}

// Hydrate immediately on every service worker startup.
hydratePendingTabs();

// Retry Logic
//
// After navigating a pending tab, the content script may not have registered
// its message listener by the time onUpdated fires. We retry sendMessage
// with exponential backoff. Retries are cancellable so that toggling reader
// mode off (or closing the tab) aborts stale attempts.

const RETRY_DELAYS_MS = [100, 200, 400, 800];

const pendingRetries = new Map<number, { cancelled: boolean }>();

function cancelPendingRetry(tabId: number): void {
  const entry = pendingRetries.get(tabId);
  if (entry) {
    entry.cancelled = true;
    pendingRetries.delete(tabId);
  }
}

async function sendMakeReadableWithRetry(tabId: number): Promise<void> {
  // Cancel any existing retry sequence for this tab before starting a new one.
  cancelPendingRetry(tabId);

  const handle = { cancelled: false };
  pendingRetries.set(tabId, handle);

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (handle.cancelled) return;

    try {
      await browserAPI.tabs.sendMessage(tabId, { action: "makeReadable" });
      // Success — clean up and return.
      pendingRetries.delete(tabId);
      return;
    } catch {
      // If this was the last attempt, give up.
      if (attempt === RETRY_DELAYS_MS.length) {
        console.warn(
          `Failed to send makeReadable to tab ${tabId} after ${attempt + 1} attempts`,
        );
        pendingRetries.delete(tabId);
        return;
      }

      // Wait before the next retry.
      await new Promise<void>((resolve) =>
        setTimeout(resolve, RETRY_DELAYS_MS[attempt]),
      );
    }
  }
}

// Icon Click Handler

browserAPI.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  // If the tab is being tracked for persistent reader mode, the user is
  // toggling it off via the icon — stop tracking before sending the
  // toggle message so future navigations stay in normal mode.
  if (pendingReaderModeTabs.has(tab.id)) {
    removePendingTab(tab.id);
    cancelPendingRetry(tab.id);
  }

  browserAPI.tabs
    .sendMessage(tab.id, { action: "makeReadable" })
    .catch((err: unknown) =>
      console.warn("Failed to send makeReadable on icon click:", err),
    );
});

// Message Handlers

browserAPI.runtime.onMessage.addListener(
  (message: { action: string; url?: string }, sender) => {
    switch (message.action) {
      // Navigate in-place while asking the background script to re-activate
      // reader mode once the new page has loaded.
      case "navigateInReaderMode": {
        if (!message.url) break;
        const tabId = sender.tab?.id;
        if (tabId === undefined) break;

        addPendingTab(tabId);
        browserAPI.tabs.update(tabId, { url: message.url }).catch((err) => {
          console.warn("Failed to navigate tab:", err);
          removePendingTab(tabId);
        });
        break;
      }

      // Open a URL in a new tab and track it for reader mode, so
      // Ctrl/Cmd-click and middle-click on links stay in reader mode.
      case "openInReaderModeNewTab": {
        if (!message.url) break;
        browserAPI.tabs
          .create({ url: message.url })
          .then((newTab) => {
            if (newTab.id !== undefined) {
              addPendingTab(newTab.id);
            }
          })
          .catch((err: unknown) =>
            console.warn("Failed to open new tab in reader mode:", err),
          );
        break;
      }

      // The content script sends this when the user explicitly closes reader
      // mode (close button, Escape). Stop tracking the tab so subsequent
      // navigations don't re-activate.
      case "exitReaderMode": {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) {
          removePendingTab(tabId);
          cancelPendingRetry(tabId);
        }
        break;
      }
    }
  },
);

// Tab Lifecycle

// When a pending tab finishes loading, send makeReadable to re-activate
// reader mode. Uses retry with backoff since the content script may not
// have registered its listener yet.
browserAPI.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" && pendingReaderModeTabs.has(tabId)) {
    // Intentionally keep the tab in pendingReaderModeTabs so that
    // back/forward navigations also re-activate reader mode. The tab is
    // only removed when the user explicitly exits (close button, Escape,
    // or icon toggle).
    sendMakeReadableWithRetry(tabId);
  }
});

// Clean up tracking when a tab is closed.
browserAPI.tabs.onRemoved.addListener((tabId) => {
  removePendingTab(tabId);
  cancelPendingRetry(tabId);
});
