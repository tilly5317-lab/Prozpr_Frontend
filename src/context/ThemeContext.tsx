import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: ResolvedTheme;
  setMode: (m: ThemeMode) => void;
}

const STORAGE_KEY = "theme-mode";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function getSystemMode(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [systemMode, setSystemMode] = useState<ResolvedTheme>(getSystemMode);

  // Track OS-level preference for the "system" mode.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      setSystemMode(e.matches ? "dark" : "light");
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const resolvedMode: ResolvedTheme = mode === "system" ? systemMode : mode;

  // Apply / remove .dark on <html> and expose a data attr for debugging.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedMode === "dark");
    root.dataset.themeMode = mode;
    root.style.colorScheme = resolvedMode;
  }, [resolvedMode, mode]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, m);
      } catch {
        /* ignore storage failures */
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolvedMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
