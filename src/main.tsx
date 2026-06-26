import { createRoot } from "react-dom/client";
import { PostHogProvider } from "posthog-js/react";
import { initPostHog, posthog } from "@/lib/posthog";
import App from "./App.tsx";
import "./index.css";

initPostHog();

createRoot(document.getElementById("root")!).render(
  <PostHogProvider client={posthog}>
    <App />
  </PostHogProvider>,
);
