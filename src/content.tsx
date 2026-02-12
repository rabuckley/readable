import { createRoot, type Root } from "react-dom/client";
import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import ReadableContent from "./ReadableContent";
import ErrorBoundary from "./ErrorBoundary";
import { loadSettings } from "./settings";

// Track whether the readable view is currently open, and whether a
// transition (open or close) is in progress to guard against rapid clicks.
let isReadableViewOpen = false;
let isTransitioning = false;

// Hold a reference to the React root so we can unmount on close, avoiding a
// memory leak from orphaned subscriptions and internal state.
let reactRoot: Root | null = null;

// Use browser namespace for Firefox compatibility
declare const browser: typeof chrome;
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Listen for message from background script
browserAPI.runtime.onMessage.addListener((message: { action: string }) => {
  if (message.action === "makeReadable") {
    // Ignore clicks while a transition is already in progress.
    if (isTransitioning) return true;

    if (isReadableViewOpen) {
      closeReadableView();
      isReadableViewOpen = false;
      browserAPI.runtime.sendMessage({ action: "exitReaderMode" });
    } else {
      isReadableViewOpen = true;
      isTransitioning = true;
      createReadableView()
        .catch((err) => {
          console.error("Failed to create readable view:", err);
          isReadableViewOpen = false;
        })
        .finally(() => {
          isTransitioning = false;
        });
    }
  }

  return true;
});

const STYLESHEET_TIMEOUT_MS = 5_000;

// Matches `language-*` and `lang-*` class tokens used by highlight.js, Prism,
// and similar syntax highlighters. Readability strips all CSS classes, so we
// stash the language in a data attribute before parsing.
const LANGUAGE_CLASS_RE = /\blang(?:uage)?-([\w-]+)\b/;

/**
 * Preserve syntax-highlighting language hints that would otherwise be lost
 * when Readability strips CSS classes. For each `<code>` element, extract
 * the language identifier from `language-*` / `lang-*` classes (checking
 * the element itself then its parent, since sites vary) and store it as
 * `data-language`. Both Readability and DOMPurify leave data attributes
 * intact, and we restore the class before highlight.js runs.
 */
function preserveLanguageHints(doc: Document): void {
  for (const code of doc.querySelectorAll("code")) {
    // Readability strips CSS classes from all elements, which destroys any
    // existing syntax highlighting (e.g. `hljs-keyword` spans become bare
    // `<span>`s). Remove the "already highlighted" marker so highlight.js
    // will re-process the block from scratch after rendering.
    code.removeAttribute("data-highlighted");

    const match =
      LANGUAGE_CLASS_RE.exec(code.className) ??
      LANGUAGE_CLASS_RE.exec(code.parentElement?.className ?? "");
    if (match) {
      code.setAttribute("data-language", match[1]);
    }
  }
}

/**
 * Wait for a stylesheet `<link>` to finish loading inside a shadow root.
 * Resolves once the browser has fetched and applied the CSS, preventing a
 * flash of unstyled content (FOUC). Falls back after a timeout — unstyled
 * content is better than an indefinite hang.
 */
function loadStylesheet(shadowRoot: ShadowRoot, href: string): Promise<void> {
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;

    const timer = setTimeout(() => {
      console.warn(
        `Stylesheet load timed out after ${STYLESHEET_TIMEOUT_MS}ms, proceeding unstyled`,
      );
      resolve();
    }, STYLESHEET_TIMEOUT_MS);

    link.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    link.onerror = () => {
      clearTimeout(timer);
      console.error(`Failed to load stylesheet: ${href}`);
      resolve();
    };

    shadowRoot.appendChild(link);
  });
}

async function createReadableView() {
  // Create the outer container and shadow DOM first, so we can show a
  // loading indicator while the stylesheet loads and Readability parses.
  const container = document.createElement("div");
  container.id = "readable-container";
  container.style.position = "fixed";
  container.style.inset = "0";
  container.style.zIndex = "9999";
  container.style.overflow = "auto";
  container.style.padding = "0";
  container.style.margin = "0";
  container.style.fontFamily = "sans-serif";
  // Intentionally no backgroundColor here — the React component handles
  // both light and dark backgrounds via Tailwind classes.

  document.body.appendChild(container);

  const shadowRoot = container.attachShadow({ mode: "open" });

  // Inject a :host reset so the shadow DOM starts from a clean slate.
  const hostReset = document.createElement("style");
  hostReset.textContent = `:host { all: initial; }`;
  shadowRoot.appendChild(hostReset);

  // Show a plain-DOM loading indicator before the stylesheet loads or
  // React mounts. This is intentionally not a React component — it
  // needs to appear before the framework is ready.
  const loadingEl = document.createElement("div");
  loadingEl.textContent = "Loading article\u2026";
  loadingEl.style.cssText =
    "display:flex;align-items:center;justify-content:center;" +
    "min-height:100vh;font:1.125rem/1 system-ui,sans-serif;" +
    "color:#525252;background:#fafaf8;";
  // Respect OS dark-mode for the loading screen.
  if (matchMedia("(prefers-color-scheme: dark)").matches) {
    loadingEl.style.color = "#d4d4d4";
    loadingEl.style.background = "#171717";
  }
  shadowRoot.appendChild(loadingEl);

  try {
    // Start stylesheet loading, settings loading, and article parsing in
    // parallel. Settings load is fast (<5ms from chrome.storage.local) but
    // we overlap it anyway.
    const cssURL = browserAPI.runtime.getURL("assets/content.css");
    const [, settings, article] = await Promise.all([
      loadStylesheet(shadowRoot, cssURL),
      loadSettings(),
      parseArticle(),
    ]);

    // Remove loading indicator now that we're ready to render.
    loadingEl.remove();

    const onClose = () => {
      closeReadableView();
      isReadableViewOpen = false;
      browserAPI.runtime.sendMessage({ action: "exitReaderMode" });
    };

    // Navigate in-place while asking the background script to re-activate
    // reader mode once the new page has loaded.
    const onNavigate = (url: string) => {
      closeReadableView();
      isReadableViewOpen = false;
      browserAPI.runtime.sendMessage({ action: "navigateInReaderMode", url });
    };

    // Open a link in a new tab with reader mode active.
    const onNavigateNewTab = (url: string) => {
      browserAPI.runtime.sendMessage({
        action: "openInReaderModeNewTab",
        url,
      });
    };

    const appContainer = document.createElement("div");
    shadowRoot.appendChild(appContainer);
    reactRoot = createRoot(appContainer);

    if (!article) {
      // Readability couldn't extract content — still open the overlay so
      // the user gets feedback rather than a silent no-op.
      reactRoot.render(
        <ErrorBoundary onClose={onClose}>
          <ReadableContent
            title=""
            content=""
            errorMessage="Couldn't extract article content from this page."
            initialSettings={settings}
            onClose={onClose}
          />
        </ErrorBoundary>,
      );
      return;
    }

    const sanitizedContent = DOMPurify.sanitize(article.content || "");

    reactRoot.render(
      <ErrorBoundary onClose={onClose}>
        <ReadableContent
          title={article.title || ""}
          content={sanitizedContent}
          byline={article.byline || undefined}
          siteName={article.siteName || undefined}
          initialSettings={settings}
          onClose={onClose}
          onNavigate={onNavigate}
          onNavigateNewTab={onNavigateNewTab}
        />
      </ErrorBoundary>,
    );
  } catch (error) {
    console.error("Error creating readable view:", error);
    isReadableViewOpen = false;
    container.remove();
  }
}

/**
 * Clone the document and run Readability on the clone. Returns `null`
 * when extraction fails.
 */
function parseArticle() {
  const documentClone = document.cloneNode(true) as Document;
  preserveLanguageHints(documentClone);
  const reader = new Readability(documentClone);
  return reader.parse();
}

/**
 * Closes the readable view by unmounting React and removing the container
 * (which also removes the shadow DOM and all its contents).
 */
function closeReadableView() {
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }

  const container = document.getElementById("readable-container");
  if (container) {
    container.remove();
  }
}
