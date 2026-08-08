import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSettings } from "@/lib/settings/settings.functions";
import {
  professionals as fallbackProfessionals,
  procedures as fallbackProcedures,
  rooms as fallbackRooms,
} from "@/components/agenda/mock-data";

// Catálogo de profissionais/salas/procedimentos vindo das Configurações.
// Estava montado dentro da página de Agenda; virou hook porque agora o chat
// também abre o mesmo formulário de agendamento e precisa das mesmas opções
// — duas telas montando isso separado sairiam do ar uma da outra.
export function useAgendaCatalog() {
  const fetchSettings = useServerFn(getSettings);
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => fetchSettings(),
    staleTime: 15_000,
  });

  const professionals =
    settings?.professionals
      .filter((item) => item.active)
      .map((item) => ({ id: item.id, name: item.name, specialty: item.specialty })) ?? fallbackProfessionals;

  const rooms =
    settings?.chairs
      .filter((item) => item.active)
      .map((item) => ({
        id: item.id,
        name: item.roomName ? `${item.name} · ${item.roomName}` : item.name,
      })) ?? fallbackRooms;

  const procedures =
    settings?.procedures
      .filter((item) => item.active)
      .map((item) => ({
        id: item.id,
        name: item.name,
        duration: item.durationMinutes,
        price: item.price,
      })) ?? fallbackProcedures;

  return { professionals, rooms, procedures };
}
