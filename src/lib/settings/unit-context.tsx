import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getSettings,
  type SettingsData,
  type UnitSetting,
} from "@/lib/settings/settings.functions";
import type { MemberRole } from "@/lib/auth/clinic-context.middleware";
import type { RecursosDoConsultorio } from "@/lib/auth/niveis-de-acesso";
import { settingsQuery } from "@/components/settings/SettingsNav";

type SettingsFetcher = () => Promise<SettingsData>;

const STORAGE_KEY = "nosconecta:selectedUnitId";

interface UnitContextValue {
  isAdmin: boolean;
  /** O nível de acesso de quem está logado. É daqui que o menu e as rotas
   *  decidem o que mostrar — ver `niveis-de-acesso.ts`. */
  nivel: MemberRole | null;
  /** O que o plano do consultório liga. `null` enquanto carrega: aí vale só
   *  o nível, como antes. */
  recursos: RecursosDoConsultorio | null;
  units: UnitSetting[];
  /** Preferência de UI de qual unidade os próximos cadastros (paciente,
   *  agendamento, transação...) devem usar — só existe pra admin, que é
   *  quem enxerga mais de uma unidade; quem não é admin nem chama isto, o
   *  servidor sempre carimba a unidade da própria conta. `null` = "todas as
   *  unidades" (a criação continua exigindo uma escolha real — ver
   *  `resolveUnitId` no servidor, que cai para a única unidade ativa
   *  quando ninguém escolheu e só existe uma). */
  selectedUnitId: string | null;
  setSelectedUnitId: (id: string | null) => void;
}

const UnitContext = createContext<UnitContextValue | null>(null);

export function UnitProvider({ children }: { children: ReactNode }) {
  const fetchSettings = useServerFn(getSettings);
  const settingsResult = useQuery(settingsQuery(fetchSettings as unknown as SettingsFetcher));
  const units = settingsResult.data?.units ?? [];
  const isAdmin = settingsResult.data?.isAdmin ?? false;
  // `null` enquanto carrega: `podeVerArea` trata nível desconhecido como "só o
  // Início", então o menu nasce curto e cresce — nunca o contrário, que seria
  // mostrar o Financeiro por um quadro para quem não pode vê-lo.
  const nivel = settingsResult.data?.nivel ?? null;
  const recursos = settingsResult.data?.recursos ?? null;

  const [selectedUnitId, setSelectedUnitIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setSelectedUnitIdState(stored);
    setHydrated(true);
  }, []);

  // Unidade guardada foi excluída (ou nunca foi escolhida) e só existe uma
  // agora: cai pra ela sozinho, mesma regra do fallback no servidor — assim
  // o seletor nunca fica "travado" numa unidade que já era.
  useEffect(() => {
    if (!hydrated || !units.length) return;
    const stillExists = units.some((u) => u.id === selectedUnitId);
    if (!stillExists) {
      setSelectedUnitIdState(units.length === 1 ? units[0].id : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, units]);

  function setSelectedUnitId(id: string | null) {
    setSelectedUnitIdState(id);
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <UnitContext.Provider
      value={{ isAdmin, nivel, recursos, units, selectedUnitId, setSelectedUnitId }}
    >
      {children}
    </UnitContext.Provider>
  );
}

export function useUnitSelection() {
  const ctx = useContext(UnitContext);
  if (!ctx) throw new Error("useUnitSelection precisa estar dentro de <UnitProvider>.");
  return ctx;
}
