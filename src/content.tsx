import React from "react";
import { createRoot } from "react-dom/client";
import { Readability } from "@mozilla/readability";
import ReadableContent from "./ReadableContent";

// Track whether the readable view is currently open
let isReadableViewOpen = false;

// Use browser namespace for Firefox compatibility
declare const browser: typeof chrome;
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Listen for message from background script
browserAPI.runtime.onMessage.addListener((message: { action: string }) => {
  if (message.action === "makeReadable") {
    // Toggle the readable view state
    if (isReadableViewOpen) {
      // If view is already open, close it
      closeReadableView();
      isReadableViewOpen = false;
    } else {
      // Otherwise, create the readable view
      isReadableViewOpen = true; // Set this before async function starts
      createReadableView().catch((err) => {
        console.error("Failed to create readable view:", err);
        isReadableViewOpen = false;
      });
    }
  }

  // Need to return true if you want to send a response back to the sender
  return true;
});

async function createReadableView() {
  try {
    // Create a clone of the document to avoid modifying the original
    const documentClone = document.cloneNode(true) as Document;

    // Use Readability to parse the article content
    const reader = new Readability(documentClone);
    const article = reader.parse();

    if (!article) {
      console.error("Could not extract article content");
      return;
    }

    // Create a container for the readable view
    const container = document.createElement("div");
    container.id = "readable-container";
    container.style.position = "fixed";
    container.style.inset = "0";
    container.style.backgroundColor = "white";
    container.style.zIndex = "9999";
    container.style.overflow = "auto";
    container.style.padding = "0";
    container.style.margin = "0";
    container.style.fontFamily = "sans-serif";

    document.body.appendChild(container);

    // Create a shadow DOM root
    const shadowRoot = container.attachShadow({ mode: "open" });

    // Add styles to the shadow DOM
    const style = document.createElement("style");
    // Include necessary CSS from index.css
    style.textContent = `
      @import url('${browserAPI.runtime.getURL("assets/content.css")}');

      :host {
        all: initial;
      }
    `;
    shadowRoot.appendChild(style);

    // Create a container for our React app inside the shadow DOM
    const appContainer = document.createElement("div");
    shadowRoot.appendChild(appContainer);

    // Render the readable content
    const root = createRoot(appContainer);
    root.render(
      <React.StrictMode>
        <ReadableContent
          title={article.title || ""}
          content={article.content || ""}
          byline={article.byline || undefined}
          siteName={article.siteName || undefined}
        />
      </React.StrictMode>,
    );

    // Add close button to the shadow DOM
    const closeButton = document.createElement("button");
    closeButton.id = "readable-close-button";
    closeButton.textContent = "×";
    closeButton.style.position = "fixed";
    closeButton.style.top = "1rem";
    closeButton.style.right = "1rem";
    closeButton.style.fontSize = "1.5rem";
    closeButton.style.width = "2rem";
    closeButton.style.height = "2rem";
    closeButton.style.borderRadius = "50%";
    closeButton.style.backgroundColor = "#333";
    closeButton.style.color = "white";
    closeButton.style.border = "none";
    closeButton.style.cursor = "pointer";
    closeButton.style.zIndex = "10000";
    closeButton.style.display = "flex";
    closeButton.style.alignItems = "center";
    closeButton.style.justifyContent = "center";

    closeButton.addEventListener("click", () => {
      closeReadableView();
      isReadableViewOpen = false;
    });

    // Append the close button to the shadow root instead of body
    shadowRoot.appendChild(closeButton);
  } catch (error) {
    console.error("Error creating readable view:", error);
    isReadableViewOpen = false;
  }
}

/**
 * Closes the readable view by removing the container
 * (which also removes the shadow DOM and all its contents)
 */
function closeReadableView() {
  const container = document.getElementById("readable-container");

  if (container) {
    container.remove();
  }
}
