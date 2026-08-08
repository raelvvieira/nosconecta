import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createAppointment, updateAppointment } from "@/lib/agenda/agenda.functions";
import type { Appointment } from "@/components/agenda/types";

// Único caminho de gravação de agendamento do sistema. Antes vivia dentro da
// página de Agenda; virou hook porque o chat também cria agendamento agora e
// os dois precisam gravar igual — inclusive os defaults. Dois lugares
// montando o payload à mão sairiam do ar um do outro em silêncio, e um
// agendamento criado pelo chat poderia não aparecer direito na Agenda.
export function useSaveAppointment(options?: { onSaved?: () => void }) {
  const queryClient = useQueryClient();
  const createFn = useServerFn(createAppointment);
  const updateFn = useServerFn(updateAppointment);

  return useMutation({
    mutationFn: async ({ data, existingId }: { data: Partial<Appointment>; existingId?: string }) => {
      const today = new Date().toISOString().slice(0, 10);
      const payload = {
        id: existingId,
        patientId: data.patientId ?? null,
        patientName: data.patientName ?? "",
        procedureName: data.procedureName ?? "",
        professionalId: data.professionalId || null,
        professionalName: data.professionalName ?? "",
        roomId: data.roomId || null,
        roomName: data.roomName ?? "",
        date: data.date ?? today,
        startTime: data.startTime ?? "09:00",
        endTime: data.endTime ?? "10:00",
        status: data.status,
        type: data.type,
        expectedRevenue: data.expectedRevenue ?? 0,
        notes: data.notes ?? null,
        generateFinancial: data.generateFinancial ?? true,
      };
      if (existingId) await updateFn({ data: payload });
      else await createFn({ data: payload });
      return { existingId };
    },
    onSuccess: ({ existingId }) => {
      toast.success(existingId ? "Agendamento atualizado" : "Agendamento criado");
      // Invalida a Agenda mesmo quando salvo de outra tela — é o que garante
      // que um agendamento feito pelo chat apareça lá sem recarregar.
      queryClient.invalidateQueries({ queryKey: ["agenda-overview"] });
      options?.onSaved?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar agendamento"),
  });
}
