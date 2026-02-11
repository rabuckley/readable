import { render } from "preact";
import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import ReadableContent from "./ReadableContent";
import ErrorBoundary from "./ErrorBoundary";

// Track whether the readable view is currently open, and whether a
// transition (open or close) is in progress to guard against rapid clicks.
let isReadableViewOpen = false;
let isTransitioning = false;

// Hold a reference to the Preact app container so we can unmount on close,
// avoiding a memory leak from orphaned subscriptions and internal state.
let appContainer: HTMLElement | null = null;

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
  // Intentionally no backgroundColor here — the Preact component handles
  // both light and dark backgrounds via Tailwind classes.

  document.body.appendChild(container);

  const shadowRoot = container.attachShadow({ mode: "open" });

  // Inject a :host reset so the shadow DOM starts from a clean slate.
  const hostReset = document.createElement("style");
  hostReset.textContent = `:host { all: initial; }`;
  shadowRoot.appendChild(hostReset);

  // Show a plain-DOM loading indicator before the stylesheet loads or
  // Preact mounts. This is intentionally not a Preact component — it
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
    // Start stylesheet loading and article parsing in parallel.
    const cssURL = browserAPI.runtime.getURL("assets/content.css");
    const [, article] = await Promise.all([
      loadStylesheet(shadowRoot, cssURL),
      parseArticle(),
    ]);

    // Remove loading indicator now that we're ready to render.
    loadingEl.remove();

    const onClose = () => {
      closeReadableView();
      isReadableViewOpen = false;
    };

    appContainer = document.createElement("div");
    shadowRoot.appendChild(appContainer);

    if (!article) {
      // Readability couldn't extract content — still open the overlay so
      // the user gets feedback rather than a silent no-op.
      render(
        <ErrorBoundary onClose={onClose}>
          <ReadableContent
            title=""
            content=""
            errorMessage="Couldn't extract article content from this page."
            onClose={onClose}
          />
        </ErrorBoundary>,
        appContainer,
      );
      return;
    }

    const sanitizedContent = DOMPurify.sanitize(article.content || "");

    render(
      <ErrorBoundary onClose={onClose}>
        <ReadableContent
          title={article.title || ""}
          content={sanitizedContent}
          byline={article.byline || undefined}
          siteName={article.siteName || undefined}
          onClose={onClose}
        />
      </ErrorBoundary>,
      appContainer,
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
  const reader = new Readability(documentClone);
  return reader.parse();
}

/**
 * Closes the readable view by unmounting Preact and removing the container
 * (which also removes the shadow DOM and all its contents).
 */
function closeReadableView() {
  if (appContainer) {
    render(null, appContainer);
    appContainer = null;
  }

  const container = document.getElementById("readable-container");
  if (container) {
    container.remove();
  }
}
