import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type MobileFabAction = {
  label: string;
  onClick: () => void;
};

export type MobileNavAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
};

type Ctx = {
  fab: MobileFabAction | null;
  setFab: (a: MobileFabAction | null) => void;
  navActions: MobileNavAction[];
  setNavActions: (a: MobileNavAction[]) => void;
};

const MobileFabContext = createContext<Ctx | null>(null);

export function MobileFabProvider({ children }: { children: ReactNode }) {
  const [fab, setFab] = useState<MobileFabAction | null>(null);
  const [navActions, setNavActions] = useState<MobileNavAction[]>([]);
  return (
    <MobileFabContext.Provider value={{ fab, setFab, navActions, setNavActions }}>
      {children}
    </MobileFabContext.Provider>
  );
}

export function useMobileFab() {
  return useContext(MobileFabContext);
}

/**
 * Register an action for the floating "+" button on the mobile tab bar.
 * Unregisters on unmount.
 */
export function useRegisterMobileFab(action: MobileFabAction | null) {
  const ctx = useContext(MobileFabContext);
  const ref = useRef(action);
  ref.current = action;

  const stableOnClick = useCallback(() => {
    ref.current?.onClick();
  }, []);

  useEffect(() => {
    if (!ctx) return;
    if (!action) {
      ctx.setFab(null);
      return;
    }
    ctx.setFab({ label: action.label, onClick: stableOnClick });
    return () => ctx.setFab(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action?.label]);
}

/**
 * Register secondary nav actions to be rendered alongside the FAB on the
 * mobile tab bar (used by pages like Agenda that need extra buttons there).
 * Unregisters on unmount.
 */
export function useRegisterMobileNavActions(actions: MobileNavAction[] | null) {
  const ctx = useContext(MobileFabContext);
  const ref = useRef(actions);
  ref.current = actions;

  // Stable wrapped actions: icons stay the same identity; only onClick is wrapped.
  const key = actions?.map((a) => a.label).join("|") ?? "";

  useEffect(() => {
    if (!ctx) return;
    if (!actions || actions.length === 0) {
      ctx.setNavActions([]);
      return;
    }
    const wrapped = actions.map((a, i) => ({
      label: a.label,
      icon: a.icon,
      onClick: () => ref.current?.[i]?.onClick(),
    }));
    ctx.setNavActions(wrapped);
    return () => ctx.setNavActions([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
