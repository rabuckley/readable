import { Component, type ComponentChildren } from "preact";

interface ErrorBoundaryProps {
  onClose: () => void;
  children: ComponentChildren;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches rendering errors in the readable view and shows a fallback
 * message instead of leaving the user with a blank or broken overlay.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Readable view rendering error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-oat-50 flex min-h-screen items-center justify-center dark:bg-neutral-900">
          <div className="max-w-md text-center">
            <p className="mb-6 text-lg text-neutral-700 dark:text-neutral-300">
              Something went wrong while rendering the article.
            </p>
            <button
              onClick={this.props.onClose}
              className="cursor-pointer rounded-lg border-none bg-neutral-700 px-6 py-2 text-white dark:bg-neutral-300 dark:text-neutral-900"
            >
              Close
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
