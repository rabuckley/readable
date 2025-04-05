// Use browser namespace for Firefox compatibility
declare const browser: typeof chrome;
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.action.onClicked.addListener((tab) => {
  if (tab.id) {
    browserAPI.tabs.sendMessage(tab.id, { action: "makeReadable" });
  }
});
