import { Component } from "react";
import { logger } from "../lib/logger";

const log = logger("ErrorBoundary");

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    log.error("React render error caught by boundary", {
      message: error.message,
      componentStack: errorInfo?.componentStack?.split("\n").slice(0, 5),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] items-center justify-center bg-gray-50 px-4">
          <div className="max-w-sm text-center">
            <div className="mb-4 text-4xl">😬</div>
            <h2 className="text-lg font-semibold text-gray-900">
              Something went wrong
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              An unexpected error occurred. Try refreshing the page. If the
              problem persists, we're probably already fixing it.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Refresh page
            </button>
            {this.props.dev && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-xs text-gray-400">
                  Error details
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-100 p-3 text-xs text-red-600">
                  {this.state.error.message}
                  {"\n\n"}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
