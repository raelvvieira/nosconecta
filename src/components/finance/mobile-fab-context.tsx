import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type MobileFabAction = {
  label: string;
  onClick: () => void;
};

/** Handlers das ações da ilha, por id.
 *
 *  Antes a página registrava rótulo, ícone E ação juntos, e a ilha desenhava o
 *  que chegasse. Só que a ilha também é desenhada durante o carregamento da
 *  rota, quando a página ainda não montou: a lista vinha vazia e a barra
 *  aparecia com o "+" sozinho, encostado na borda — a tela "errada" que
 *  aparecia antes da certa.
 *
 *  A forma (quais botões, com que rótulo e ícone) é fixa por rota e agora mora
 *  em `destinos.ts`. Daqui viaja só o que de fato pertence à página: o que
 *  acontece ao tocar. Sem handler, o botão é desenhado igual e desabilitado. */
export type IlhaHandlers = Record<string, () => void>;

type Ctx = {
  fab: MobileFabAction | null;
  setFab: (a: MobileFabAction | null) => void;
  handlers: IlhaHandlers;
  setHandlers: (h: IlhaHandlers) => void;
};

const MobileFabContext = createContext<Ctx | null>(null);

export function MobileFabProvider({ children }: { children: ReactNode }) {
  const [fab, setFab] = useState<MobileFabAction | null>(null);
  const [handlers, setHandlers] = useState<IlhaHandlers>({});
  return (
    <MobileFabContext.Provider value={{ fab, setFab, handlers, setHandlers }}>
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
 * Liga os handlers das ações que a ilha inferior desenha para esta rota.
 * As chaves são os ids declarados em `destinos.ts`. Desliga ao desmontar.
 */
export function useRegisterIlhaHandlers(handlers: IlhaHandlers) {
  const ctx = useContext(MobileFabContext);
  const ref = useRef(handlers);
  ref.current = handlers;

  // As chaves são estáveis por rota; só as funções mudam a cada render. Por
  // isso o efeito depende das CHAVES e o despacho passa pelo ref — assim o
  // contexto não é reescrito a cada render da página.
  const chaves = Object.keys(handlers).sort().join("|");

  useEffect(() => {
    if (!ctx) return;
    if (!chaves) {
      ctx.setHandlers({});
      return;
    }
    const estaveis: IlhaHandlers = {};
    for (const k of chaves.split("|")) {
      estaveis[k] = () => ref.current?.[k]?.();
    }
    ctx.setHandlers(estaveis);
    return () => ctx.setHandlers({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaves]);
}
