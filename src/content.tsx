import React from "react";
import { Root, createRoot } from "react-dom/client";
import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import ReadableContent from "./ReadableContent";

// Track whether the readable view is currently open, and whether a
// transition (open or close) is in progress to guard against rapid clicks.
let isReadableViewOpen = false;
let isTransitioning = false;

// Hold a reference to the React root so we can unmount it on close,
// avoiding a memory leak from orphaned subscriptions and internal state.
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

/**
 * Wait for a stylesheet `<link>` to finish loading inside a shadow root.
 * Resolves once the browser has fetched and applied the CSS, preventing a
 * flash of unstyled content (FOUC).
 */
function loadStylesheet(shadowRoot: ShadowRoot, href: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () =>
      reject(new Error(`Failed to load stylesheet: ${href}`));
    shadowRoot.appendChild(link);
  });
}

async function createReadableView() {
  try {
    // Create a clone of the document to avoid modifying the original
    const documentClone = document.cloneNode(true) as Document;

    // Use Readability to parse the article content
    const reader = new Readability(documentClone);
    const article = reader.parse();

    if (!article) {
      console.error("Could not extract article content");
      // Fix: reset state so the user can retry or close cleanly.
      isReadableViewOpen = false;
      return;
    }

    // Sanitize article HTML — Readability is not a security sanitizer and
    // may preserve event handlers or other XSS vectors from malicious pages.
    const sanitizedContent = DOMPurify.sanitize(article.content || "");

    // Create a container for the readable view
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

    // Create a shadow DOM root
    const shadowRoot = container.attachShadow({ mode: "open" });

    // Inject a :host reset so the shadow DOM starts from a clean slate.
    const hostReset = document.createElement("style");
    hostReset.textContent = `:host { all: initial; }`;
    shadowRoot.appendChild(hostReset);

    // Wait for the full stylesheet to load before rendering, so the user
    // never sees a flash of unstyled content.
    const cssURL = browserAPI.runtime.getURL("assets/content.css");
    await loadStylesheet(shadowRoot, cssURL);

    // Create a container for our React app inside the shadow DOM
    const appContainer = document.createElement("div");
    shadowRoot.appendChild(appContainer);

    // Render the readable content. The close button lives inside the React
    // component so it can participate in Tailwind dark-mode styling.
    reactRoot = createRoot(appContainer);
    reactRoot.render(
      <React.StrictMode>
        <ReadableContent
          title={article.title || ""}
          content={sanitizedContent}
          byline={article.byline || undefined}
          siteName={article.siteName || undefined}
          onClose={() => {
            closeReadableView();
            isReadableViewOpen = false;
          }}
        />
      </React.StrictMode>,
    );
  } catch (error) {
    console.error("Error creating readable view:", error);
    isReadableViewOpen = false;
  }
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
