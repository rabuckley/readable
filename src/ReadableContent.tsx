import type { FC, RefObject } from "react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Minus, Plus, Sun, Moon, Monitor, X } from "lucide-react";

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
  onNavigate?: (url: string) => void;
  onNavigateNewTab?: (url: string) => void;
}

/**
 * Trap focus within `containerRef` and close on Escape. Also handles
 * Ctrl/Cmd +/- font size shortcuts. Implemented inline rather than in a
 * separate file — there's only one consumer, and the project favors
 * avoiding premature abstraction.
 */
function useFocusTrap(
  containerRef: RefObject<HTMLDivElement | null>,
  onClose: () => void,
  onFontSizeChange: (direction: "increase" | "decrease") => void,
) {
  // Remember what was focused on the host page so we can restore it when
  // the overlay closes.
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;

    // Focus the first focusable element (the close button) inside the
    // overlay. We need a short delay because React may not have flushed
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
  containerRef: RefObject<HTMLDivElement | null>,
  theme: ReadableSettings["theme"],
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Apply class-based theme to the container.
    el.classList.remove("dark");

    if (theme === "dark") {
      el.classList.add("dark");
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

const THEME_OPTIONS: {
  value: ReadableSettings["theme"];
  label: string;
  icon: FC<{ className?: string }>;
}[] = [
  { value: "auto", label: "Auto theme", icon: Monitor },
  { value: "light", label: "Light theme", icon: Sun },
  { value: "dark", label: "Dark theme", icon: Moon },
];

// Content-width icon — three centered horizontal bars at different
// lengths to suggest narrow, medium, or wide article width.
function WidthIcon({ variant }: { variant: ReadableSettings["width"] }) {
  const barWidths = {
    narrow: [7, 5, 7],
    medium: [11, 8, 11],
    wide: [14, 12, 14],
  }[variant];
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <rect
        x={(16 - barWidths[0]) / 2}
        y="3"
        width={barWidths[0]}
        height="2"
        rx="1"
      />
      <rect
        x={(16 - barWidths[1]) / 2}
        y="7"
        width={barWidths[1]}
        height="2"
        rx="1"
      />
      <rect
        x={(16 - barWidths[2]) / 2}
        y="11"
        width={barWidths[2]}
        height="2"
        rx="1"
      />
    </svg>
  );
}

const WIDTH_OPTIONS: {
  value: ReadableSettings["width"];
  label: string;
}[] = [
  { value: "narrow", label: "Narrow width" },
  { value: "medium", label: "Medium width" },
  { value: "wide", label: "Wide width" },
];

const FONT_SIZE_LABELS: Record<ReadableSettings["fontSize"], string> = {
  small: "S",
  medium: "M",
  large: "L",
};

// Component

const ReadableContent: FC<ReadableContentProps> = ({
  title,
  content,
  byline,
  siteName,
  errorMessage,
  initialSettings,
  onClose,
  onNavigate,
  onNavigateNewTab,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<ReadableSettings>(initialSettings);

  const changeFontSize = useCallback((direction: "increase" | "decrease") => {
    setSettings((prev) => {
      const idx = FONT_SIZES.indexOf(prev.fontSize);
      const next =
        direction === "increase"
          ? Math.min(idx + 1, FONT_SIZES.length - 1)
          : Math.max(idx - 1, 0);
      return { ...prev, fontSize: FONT_SIZES[next] };
    });
  }, []);

  // Intercept link clicks inside the article body so users stay in reader
  // mode when navigating. Regular clicks navigate in-place; modifier-clicks
  // (Ctrl/Cmd) and middle-clicks open in a new tab, also in reader mode.
  const handleArticleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const isNewTabClick =
        e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey;

      // Nothing to do if we have no navigation handlers.
      if (!onNavigate && !onNavigateNewTab) return;
      if (isNewTabClick && !onNavigateNewTab) return;
      if (!isNewTabClick && !onNavigate) return;

      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;

      let parsed: URL;
      try {
        parsed = new URL(anchor.href);
      } catch {
        return;
      }

      // Only intercept HTTP(S) links — let mailto:, tel:, etc. through.
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;

      // Same-page fragment-only links: just suppress navigation. The reader
      // content may not have matching IDs, so scrolling would be misleading.
      if (
        parsed.origin === location.origin &&
        parsed.pathname === location.pathname &&
        parsed.hash &&
        !parsed.search
      ) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      if (isNewTabClick) {
        onNavigateNewTab!(parsed.href);
      } else {
        onNavigate!(parsed.href);
      }
    },
    [onNavigate, onNavigateNewTab],
  );

  useFocusTrap(containerRef, onClose, changeFontSize);
  useAutoTheme(containerRef, settings.theme);

  // Persist settings whenever they change.
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Syntax highlighting: pre-process the content HTML so highlighted
  // markup is part of the React-managed string. This avoids the previous
  // approach of mutating the DOM after render via useEffect, which was
  // fragile — if React re-wrote the innerHTML during reconciliation
  // (e.g. after a settings change), the hljs spans were lost and the
  // effect wouldn't re-run because `content` hadn't changed.
  const highlightedContent = useMemo(() => {
    if (!content) return content;

    const container = document.createElement("div");
    container.innerHTML = content;

    container.querySelectorAll("pre code").forEach((block) => {
      const el = block as HTMLElement;

      // Restore the language class from the data attribute we stashed
      // before Readability stripped CSS classes. This gives highlight.js
      // a deterministic language hint instead of relying on auto-detection.
      if (el.dataset.language) {
        el.classList.add(`language-${el.dataset.language}`);
      }

      hljs.highlightElement(el);
    });

    return container.innerHTML;
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
        className="bg-oat-50 text-foreground flex min-h-screen items-center justify-center dark:bg-neutral-900"
      >
        <div className="max-w-md text-center">
          <p className="mb-6 text-lg text-neutral-700 dark:text-neutral-300">
            {errorMessage}
          </p>
          <Button
            onClick={onClose}
            aria-label="Close readable view"
            variant="secondary"
          >
            Close
          </Button>
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
      className="bg-oat-50 text-foreground min-h-screen dark:bg-neutral-900"
    >
      {/* Vertical sidebar controls */}
      <TooltipProvider delayDuration={200}>
        <nav
          aria-label="Reading settings"
          className="border-border fixed top-0 left-0 z-10000 flex h-full w-12 flex-col items-center justify-center gap-1.5 border-r bg-neutral-100/90 backdrop-blur-sm dark:bg-neutral-800/90"
        >
          {/* Font size controls */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => changeFontSize("decrease")}
                aria-label="Decrease font size"
              >
                <Minus />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Smaller text</TooltipContent>
          </Tooltip>
          <span className="text-muted-foreground text-[10px] font-medium">
            {FONT_SIZE_LABELS[settings.fontSize]}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => changeFontSize("increase")}
                aria-label="Increase font size"
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Larger text</TooltipContent>
          </Tooltip>

          <Separator className="w-6" />

          {/* Theme controls */}
          <ToggleGroup
            type="single"
            value={settings.theme}
            onValueChange={(value: string) => {
              if (value) update("theme", value as ReadableSettings["theme"]);
            }}
            className="flex-col"
            size="sm"
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value={value} aria-label={label}>
                    <Icon />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>

          <Separator className="w-6" />

          {/* Width controls */}
          <ToggleGroup
            type="single"
            value={settings.width}
            onValueChange={(value: string) => {
              if (value) update("width", value as ReadableSettings["width"]);
            }}
            className="flex-col"
            size="sm"
          >
            {WIDTH_OPTIONS.map(({ value, label }) => (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value={value} aria-label={label}>
                    <WidthIcon variant={value} />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>

          <Separator className="w-6" />

          {/* Close button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close readable view"
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Close</TooltipContent>
          </Tooltip>
        </nav>
      </TooltipProvider>

      {/* Article content — left padding avoids overlap with fixed sidebar */}
      <div
        className="grid gap-4 pl-12"
        style={{
          gridTemplateColumns: `1fr minmax(0, ${WIDTH_VALUES[settings.width]}) 1fr`,
        }}
      >
        <div
          className="prose prose-neutral dark:prose-invert md:prose-lg prose-blockquote:not-italic prose-headings:font-semibold prose-headings:font-sans prose-lead:text-neutral-900 dark:prose-lead:text-neutral-300 prose-pre:bg-neutral-100 prose-pre:text-neutral-800 dark:prose-pre:text-neutral-300 dark:prose-pre:bg-neutral-800 prose-code:font-medium prose-code:font-mono col-span-1 col-start-2 my-12 max-w-none font-serif"
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
          <div
            onClick={handleArticleClick}
            onAuxClick={handleArticleClick}
            dangerouslySetInnerHTML={{ __html: highlightedContent }}
          />
        </div>
      </div>
    </div>
  );
};

export default ReadableContent;
