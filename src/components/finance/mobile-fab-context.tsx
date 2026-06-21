import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type MobileFabAction = {
  label: string;
  onClick: () => void;
};

type Ctx = {
  fab: MobileFabAction | null;
  setFab: (a: MobileFabAction | null) => void;
};

const MobileFabContext = createContext<Ctx | null>(null);

export function MobileFabProvider({ children }: { children: ReactNode }) {
  const [fab, setFab] = useState<MobileFabAction | null>(null);
  return (
    <MobileFabContext.Provider value={{ fab, setFab }}>
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
