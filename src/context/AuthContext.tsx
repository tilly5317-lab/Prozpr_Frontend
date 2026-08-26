import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getAvatarUrl,
  getMe,
  getToken,
  clearToken,
  BackendOfflineError,
  type UserInfo,
} from "@/lib/api";

interface AuthState {
  user: UserInfo | null;
  loading: boolean;
  authenticated: boolean;
  refresh: () => Promise<void>;
  signOut: () => void;
  /**
   * Presigned read URL for the profile picture, or null.
   *
   * Lives here rather than in whichever screen happens to draw an avatar: the
   * picture appears on the profile, the dashboard switcher and the account
   * page, and a per-screen fetch meant uploading one only changed the screen
   * you uploaded it from.
   */
  avatarUrl: string | null;
  /** Re-mint the URL — after an upload or removal, or when one expires. */
  refreshAvatar: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  authenticated: false,
  refresh: async () => {},
  signOut: () => {},
  avatarUrl: null,
  refreshAvatar: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await getMe();
      setUser(me);
    } catch (err) {
      // If backend is offline we don't want to destroy the user's token.
      if (err instanceof BackendOfflineError) return;
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAvatar = useCallback(async () => {
    if (!getToken()) {
      setAvatarUrl(null);
      return;
    }
    try {
      setAvatarUrl(await getAvatarUrl());
    } catch {
      // A picture that won't load is not worth breaking a page over — the
      // initials fallback covers it.
    }
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
    setAvatarUrl(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user?.avatar_set) {
      setAvatarUrl(null);
      return;
    }
    void refreshAvatar();
  }, [user?.avatar_set, refreshAvatar]);

  return (
    <AuthContext.Provider
      value={{ user, loading, authenticated: !!user, refresh, signOut, avatarUrl, refreshAvatar }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
