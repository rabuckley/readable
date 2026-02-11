import type { FunctionalComponent } from "preact";
import { useEffect, useRef } from "preact/hooks";

interface ReadableContentProps {
  title: string;
  content: string;
  byline?: string;
  siteName?: string;
  errorMessage?: string;
  onClose: () => void;
}

/**
 * Trap focus within `containerRef` and close on Escape. Implemented inline
 * rather than in a separate file — there's only one consumer, and the
 * project favors avoiding premature abstraction.
 */
function useFocusTrap(
  containerRef: preact.RefObject<HTMLDivElement | null>,
  onClose: () => void,
) {
  // Remember what was focused on the host page so we can restore it when
  // the overlay closes.
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;

    // Focus the first focusable element (the close button) inside the
    // overlay. We need a short delay because Preact may not have flushed
    // the DOM synchronously when running inside a shadow root.
    requestAnimationFrame(() => {
      const root = containerRef.current?.getRootNode() as
        | ShadowRoot
        | undefined;
      const firstFocusable = root?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
    });

    return () => {
      // Restore focus to the element that was active before the overlay
      // opened, if it's still in the DOM.
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      // Gather focusable elements from the shadow root, not the document,
      // because focus inside a shadow root is reported on the host element.
      const root = container!.getRootNode() as ShadowRoot;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = root.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    // Attach to the shadow root so we intercept events before they reach
    // the host page.
    const root = container.getRootNode() as ShadowRoot;
    root.addEventListener("keydown", handleKeyDown as EventListener);
    return () =>
      root.removeEventListener("keydown", handleKeyDown as EventListener);
  }, [containerRef, onClose]);
}

const ReadableContent: FunctionalComponent<ReadableContentProps> = ({
  title,
  content,
  byline,
  siteName,
  errorMessage,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, onClose);

  // Error state: show a centered message instead of article content.
  if (errorMessage) {
    return (
      <div
        ref={containerRef}
        role="dialog"
        aria-modal={true}
        aria-label="Readable article view"
        className="bg-oat-50 flex min-h-screen items-center justify-center dark:bg-neutral-900"
      >
        <div className="max-w-md text-center">
          <p className="mb-6 text-lg text-neutral-700 dark:text-neutral-300">
            {errorMessage}
          </p>
          <button
            onClick={onClose}
            aria-label="Close readable view"
            className="cursor-pointer rounded-lg border-none bg-neutral-700 px-6 py-2 text-white dark:bg-neutral-300 dark:text-neutral-900"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal={true}
      aria-label="Readable article view"
      className="bg-oat-50 grid min-h-screen grid-cols-[1fr_minmax(0,var(--container-3xl))_1fr] gap-4 dark:bg-neutral-900"
    >
      <button
        onClick={onClose}
        aria-label="Close readable view"
        className="fixed top-4 right-4 z-[10000] flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-neutral-700 text-2xl text-white dark:bg-neutral-300 dark:text-neutral-900"
      >
        &times;
      </button>
      <div className="prose prose-neutral dark:prose-invert md:prose-lg prose-blockquote:not-italic prose-headings:font-semibold prose-headings:font-sans prose-lead:text-neutral-900 dark:prose-lead:text-neutral-300 prose-pre:bg-neutral-100 prose-pre:text-neutral-800 dark:prose-pre:text-neutral-300 dark:prose-pre:bg-neutral-800 prose-code:font-medium prose-code:font-mono col-span-1 col-start-2 my-12 font-serif">
        <h1>{title}</h1>
        {(byline || siteName) && (
          <div className="mb-4 text-neutral-600 dark:text-neutral-300">
            {byline && <span>{byline}</span>}
            {byline && siteName && <span> &middot; </span>}
            {siteName && <span>{siteName}</span>}
          </div>
        )}
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    </div>
  );
};

export default ReadableContent;
