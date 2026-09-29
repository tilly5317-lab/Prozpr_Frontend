import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Page tests drive dozens of user-event taps through jsdom; the slowest
    // (InvestPreferences) takes ~3s locally and ~6s on the CI runner, past the
    // 5s default. One generous budget beats per-test overrides.
    testTimeout: 20_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
