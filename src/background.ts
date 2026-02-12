// Use browser namespace for Firefox compatibility
declare const browser: typeof chrome;
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Tabs that should auto-activate reader mode after navigation completes.
// Populated by the "navigateInReaderMode" message and consumed by the
// tabs.onUpdated listener below.
const pendingReaderModeTabs = new Set<number>();

browserAPI.action.onClicked.addListener((tab) => {
  if (tab.id) {
    // If the tab is being tracked for persistent reader mode, the user is
    // toggling it off via the icon — stop tracking before sending the
    // toggle message so future navigations stay in normal mode.
    if (pendingReaderModeTabs.has(tab.id)) {
      pendingReaderModeTabs.delete(tab.id);
    }
    browserAPI.tabs.sendMessage(tab.id, { action: "makeReadable" });
  }
});

// Handle requests from the content script to navigate while staying in
// reader mode. We navigate the tab normally and track it so onUpdated
// can re-activate reader mode once the new page loads.
browserAPI.runtime.onMessage.addListener(
  (message: { action: string; url?: string }, sender) => {
    if (message.action === "navigateInReaderMode" && message.url) {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return;

      pendingReaderModeTabs.add(tabId);
      browserAPI.tabs.update(tabId, { url: message.url });
    }

    // Open a URL in a new tab and track it for reader mode, so
    // Ctrl/Cmd-click and middle-click on links stay in reader mode.
    if (message.action === "openInReaderModeNewTab" && message.url) {
      browserAPI.tabs.create({ url: message.url }).then((newTab) => {
        if (newTab.id !== undefined) {
          pendingReaderModeTabs.add(newTab.id);
        }
      });
    }

    // The content script sends this when the user explicitly closes reader
    // mode (close button, Escape). Stop tracking the tab so subsequent
    // navigations don't re-activate.
    if (message.action === "exitReaderMode") {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        pendingReaderModeTabs.delete(tabId);
      }
    }
  },
);

// When a pending tab finishes loading, send makeReadable to re-activate
// reader mode. A short delay lets the content script register its
// listener before we send the message.
browserAPI.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" && pendingReaderModeTabs.has(tabId)) {
    // Intentionally keep the tab in pendingReaderModeTabs so that
    // back/forward navigations also re-activate reader mode. The tab is
    // only removed when the user explicitly exits (close button, Escape,
    // or icon toggle).
    setTimeout(() => {
      browserAPI.tabs.sendMessage(tabId, { action: "makeReadable" });
    }, 100);
  }
});

// Clean up tracking when a tab is closed.
browserAPI.tabs.onRemoved.addListener((tabId) => {
  pendingReaderModeTabs.delete(tabId);
});
