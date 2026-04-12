import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  listFamilyMembers,
  setActiveFamilyMemberId,
  type FamilyMember,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export type ActiveView =
  | { type: "self" }
  | { type: "member"; member: FamilyMember }
  | { type: "cumulative" };

interface FamilyState {
  members: FamilyMember[];
  activeView: ActiveView;
  loading: boolean;
  switchToSelf: () => void;
  switchToMember: (member: FamilyMember) => void;
  switchToCumulative: () => void;
  refreshMembers: () => Promise<void>;
}

const FamilyContext = createContext<FamilyState>({
  members: [],
  activeView: { type: "self" },
  loading: false,
  switchToSelf: () => {},
  switchToMember: () => {},
  switchToCumulative: () => {},
  refreshMembers: async () => {},
});

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { authenticated } = useAuth();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>({ type: "self" });
  const [loading, setLoading] = useState(false);

  const refreshMembers = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    try {
      const res = await listFamilyMembers();
      setMembers(res.members);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) {
      refreshMembers();
    } else {
      setMembers([]);
      setActiveView({ type: "self" });
      setActiveFamilyMemberId(null);
    }
  }, [authenticated, refreshMembers]);

  const switchToSelf = useCallback(() => {
    setActiveFamilyMemberId(null);
    setActiveView({ type: "self" });
  }, []);

  const switchToMember = useCallback((member: FamilyMember) => {
    setActiveFamilyMemberId(member.id);
    setActiveView({ type: "member", member });
  }, []);

  const switchToCumulative = useCallback(() => {
    setActiveFamilyMemberId(null);
    setActiveView({ type: "cumulative" });
  }, []);

  return (
    <FamilyContext.Provider
      value={{
        members,
        activeView,
        loading,
        switchToSelf,
        switchToMember,
        switchToCumulative,
        refreshMembers,
      }}
    >
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  return useContext(FamilyContext);
}
