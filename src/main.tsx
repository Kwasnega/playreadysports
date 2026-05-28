import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ── PostHog analytics (opt-in via VITE_POSTHOG_KEY) ─────────────────────────
const posthogKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
if (posthogKey) {
  const _ph = "posthog-js";
  import(/* @vite-ignore */ _ph).then(({ default: posthog }) => {
    posthog.init(posthogKey, {
      api_host: import.meta.env.VITE_POSTHOG_HOST ?? "https://app.posthog.com",
      capture_pageview: true,
      autocapture: false,
      persistence: "localStorage",
    });
  }).catch(() => {/* posthog not installed — add posthog-js to devDependencies */});
}

// ── Sentry error monitoring (opt-in via VITE_SENTRY_DSN) ────────────────────
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  const _sentry = "@sentry/react";
  import(/* @vite-ignore */ _sentry).then((Sentry) => {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.2,
      replaysOnErrorSampleRate: 1.0,
    });
  }).catch(() => {/* @sentry/react not installed */});
}

createRoot(document.getElementById("root")!).render(<App />);
