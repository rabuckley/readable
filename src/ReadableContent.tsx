import type { FunctionalComponent } from "preact";
import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import java from "highlight.js/lib/languages/java";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import diff from "highlight.js/lib/languages/diff";
import x86asm from "highlight.js/lib/languages/x86asm";
import ruby from "highlight.js/lib/languages/ruby";
import php from "highlight.js/lib/languages/php";
import type { ReadableSettings } from "./settings";
import { saveSettings } from "./settings";

// Register languages once at module load.
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("java", java);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("x86asm", x86asm);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("php", php);

// Reading Time

const WORDS_PER_MINUTE = 238;

function estimateReadingTime(html: string): number {
  // Strip HTML tags and count whitespace-delimited words.
  const text = html.replace(/<[^>]*>/g, "");
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

// Font Size / Width Mappings

const FONT_SIZES = ["small", "medium", "large"] as const;
const FONT_SIZE_VALUES: Record<ReadableSettings["fontSize"], string> = {
  small: "1rem",
  medium: "1.125rem",
  large: "1.25rem",
};

const WIDTH_VALUES: Record<ReadableSettings["width"], string> = {
  narrow: "40rem",
  medium: "48rem",
  wide: "60rem",
};

// Focus Trap

interface ReadableContentProps {
  title: string;
  content: string;
  byline?: string;
  siteName?: string;
  errorMessage?: string;
  initialSettings: ReadableSettings;
  onClose: () => void;
}

/**
 * Trap focus within `containerRef` and close on Escape. Also handles
 * Ctrl/Cmd +/- font size shortcuts. Implemented inline rather than in a
 * separate file — there's only one consumer, and the project favors
 * avoiding premature abstraction.
 */
function useFocusTrap(
  containerRef: preact.RefObject<HTMLDivElement | null>,
  onClose: () => void,
  onFontSizeChange: (direction: "increase" | "decrease") => void,
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

      // Font size shortcuts: Ctrl/Cmd + / Ctrl/Cmd -
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        onFontSizeChange("increase");
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        onFontSizeChange("decrease");
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
  }, [containerRef, onClose, onFontSizeChange]);
}

// Theme Application

/**
 * For theme "auto", track OS dark-mode preference and toggle the `dark`
 * class on the container element accordingly.
 */
function useAutoTheme(
  containerRef: preact.RefObject<HTMLDivElement | null>,
  theme: ReadableSettings["theme"],
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Apply class-based theme to the container.
    el.classList.remove("dark", "sepia");

    if (theme === "dark") {
      el.classList.add("dark");
      return;
    }
    if (theme === "sepia") {
      el.classList.add("sepia");
      return;
    }
    if (theme === "light") {
      return;
    }

    // theme === "auto": mirror OS preference.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      el.classList.toggle("dark", mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [containerRef, theme]);
}

// Settings Toolbar

const THEME_OPTIONS: { value: ReadableSettings["theme"]; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "sepia", label: "Sepia" },
];

const WIDTH_OPTIONS: { value: ReadableSettings["width"]; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "medium", label: "Medium" },
  { value: "wide", label: "Wide" },
];

const toolbarBtnBase =
  "cursor-pointer rounded border-none px-2 py-1 text-sm transition-colors";
const toolbarBtnInactive =
  "bg-transparent text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700";
const toolbarBtnActive =
  "bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100";

// Component

const ReadableContent: FunctionalComponent<ReadableContentProps> = ({
  title,
  content,
  byline,
  siteName,
  errorMessage,
  initialSettings,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<ReadableSettings>(initialSettings);

  const changeFontSize = useCallback(
    (direction: "increase" | "decrease") => {
      setSettings((prev) => {
        const idx = FONT_SIZES.indexOf(prev.fontSize);
        const next =
          direction === "increase"
            ? Math.min(idx + 1, FONT_SIZES.length - 1)
            : Math.max(idx - 1, 0);
        return { ...prev, fontSize: FONT_SIZES[next] };
      });
    },
    [],
  );

  useFocusTrap(containerRef, onClose, changeFontSize);
  useAutoTheme(containerRef, settings.theme);

  // Persist settings whenever they change.
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Syntax highlighting: run highlight.js over code blocks after the
  // article content renders or when the content changes.
  useEffect(() => {
    contentRef.current?.querySelectorAll("pre code").forEach((block) => {
      const el = block as HTMLElement;
      // Avoid re-highlighting blocks that highlight.js already processed.
      if (el.dataset.highlighted) return;

      // Restore the language class from the data attribute we stashed before
      // Readability stripped CSS classes. This gives highlight.js a
      // deterministic language hint instead of relying on auto-detection.
      if (el.dataset.language) {
        el.classList.add(`language-${el.dataset.language}`);
      }

      hljs.highlightElement(el);
    });
  }, [content]);

  const readingTime = content ? estimateReadingTime(content) : 0;

  const update = <K extends keyof ReadableSettings>(
    key: K,
    value: ReadableSettings[K],
  ) => setSettings((prev) => ({ ...prev, [key]: value }));

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
      className="bg-oat-50 min-h-screen dark:bg-neutral-900"
    >
      {/* Settings toolbar */}
      <div className="sticky top-0 z-[10000] flex flex-wrap items-center justify-center gap-2 border-b border-neutral-200 bg-neutral-100/90 px-4 py-2 text-sm backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-800/90">
        {/* Font size controls */}
        <button
          onClick={() => changeFontSize("decrease")}
          aria-label="Decrease font size"
          className={`${toolbarBtnBase} ${toolbarBtnInactive}`}
        >
          A&minus;
        </button>
        <button
          onClick={() => changeFontSize("increase")}
          aria-label="Increase font size"
          className={`${toolbarBtnBase} ${toolbarBtnInactive}`}
        >
          A+
        </button>

        <span className="text-neutral-300 dark:text-neutral-600">|</span>

        {/* Theme controls */}
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => update("theme", opt.value)}
            aria-pressed={settings.theme === opt.value}
            className={`${toolbarBtnBase} ${settings.theme === opt.value ? toolbarBtnActive : toolbarBtnInactive}`}
          >
            {opt.label}
          </button>
        ))}

        <span className="text-neutral-300 dark:text-neutral-600">|</span>

        {/* Width controls */}
        {WIDTH_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => update("width", opt.value)}
            aria-pressed={settings.width === opt.value}
            className={`${toolbarBtnBase} ${settings.width === opt.value ? toolbarBtnActive : toolbarBtnInactive}`}
          >
            {opt.label}
          </button>
        ))}

        <span className="text-neutral-300 dark:text-neutral-600">|</span>

        {/* Close button (moved from fixed position into toolbar) */}
        <button
          onClick={onClose}
          aria-label="Close readable view"
          className={`${toolbarBtnBase} ${toolbarBtnInactive}`}
        >
          &times;
        </button>
      </div>

      {/* Article content */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `1fr minmax(0, ${WIDTH_VALUES[settings.width]}) 1fr`,
        }}
      >
        <div
          ref={contentRef}
          className="prose prose-neutral dark:prose-invert md:prose-lg prose-blockquote:not-italic prose-headings:font-semibold prose-headings:font-sans prose-lead:text-neutral-900 dark:prose-lead:text-neutral-300 prose-pre:bg-neutral-100 prose-pre:text-neutral-800 dark:prose-pre:text-neutral-300 dark:prose-pre:bg-neutral-800 prose-code:font-medium prose-code:font-mono col-span-1 col-start-2 my-12 font-serif"
          style={{ fontSize: FONT_SIZE_VALUES[settings.fontSize] }}
        >
          <h1>{title}</h1>
          {(byline || siteName || readingTime > 0) && (
            <div className="mb-4 text-neutral-600 dark:text-neutral-300">
              {byline && <span>{byline}</span>}
              {byline && siteName && <span> &middot; </span>}
              {siteName && <span>{siteName}</span>}
              {(byline || siteName) && readingTime > 0 && (
                <span> &middot; </span>
              )}
              {readingTime > 0 && <span>{readingTime} min read</span>}
            </div>
          )}
          <div dangerouslySetInnerHTML={{ __html: content }} />
        </div>
      </div>
    </div>
  );
};

export default ReadableContent;
