import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Errors are surfaced in the UI — no console needed in production
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5 text-center">
          <div className="w-14 h-14 rounded-xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="font-bold text-xl">Something went wrong</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            An unexpected error occurred. Try refreshing the page.
          </p>
          {this.state.error && (
            <p className="text-xs text-muted-foreground/60 font-mono bg-muted px-3 py-2 rounded-lg max-w-xs break-all">
              {this.state.error.message}
            </p>
          )}
          <div className="flex gap-3 mt-2">
            <button
              onClick={this.handleRetry}
              className="px-5 py-2.5 bg-primary text-primary-foreground-lg text-sm font-bold hover:opacity-90 transition-all"
            >
              Try again
            </button>
            <a
              href="/"
              className="px-5 py-2.5 bg-muted rounded-full text-sm font-medium hover:bg-muted/80 transition-all"
            >
              Go home
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
