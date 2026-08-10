import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createAppointment, updateAppointment } from "@/lib/agenda/agenda.functions";
import { createPatient, getPatientByCrmContact } from "@/lib/patients/patients.functions";
import { formatWhatsappNumber } from "@/lib/atendimentos/phone";
import type { Appointment } from "@/components/agenda/types";

/** Contato de WhatsApp que originou o agendamento, quando houver. */
interface OriginContact {
  phone: string | null;
  crmContactId: string | null;
}

// Único caminho de gravação de agendamento do sistema. Antes vivia dentro da
// página de Agenda; virou hook porque o chat também cria agendamento agora e
// os dois precisam gravar igual — inclusive os defaults. Dois lugares
// montando o payload à mão sairiam do ar um do outro em silêncio, e um
// agendamento criado pelo chat poderia não aparecer direito na Agenda.
export function useSaveAppointment(options?: { onSaved?: () => void }) {
  const queryClient = useQueryClient();
  const createFn = useServerFn(createAppointment);
  const updateFn = useServerFn(updateAppointment);
  const createPatientFn = useServerFn(createPatient);
  const findByContactFn = useServerFn(getPatientByCrmContact);

  /**
   * Garante um paciente de verdade por trás de um agendamento que nasceu de uma
   * conversa.
   *
   * Sem isto o agendamento fica com `patient_id` nulo e nenhuma linha em
   * `patients` — e o `resolvePerson` da Edge Function da Meta busca os dados
   * pessoais só nessa tabela. Ou seja: o evento `appointment.created` saía sem
   * telefone e sem nome, e o match na Meta se perdia. Conferir o telefone na
   * tela sem gravar aqui seria confirmar um dado que nunca é enviado.
   *
   * Gravar o `crmContactId` é o que evita duplicata dos dois lados: o
   * `handleUpsert` do crm-contacts usa essa coluna para dar PATCH no contato
   * que já existe em vez de criar outro, e o próximo agendamento do mesmo
   * contato reencontra este paciente em vez de criar um segundo.
   */
  const resolvePatientId = async (
    data: Partial<Appointment>,
    contact: OriginContact,
  ): Promise<string | null> => {
    if (data.patientId) return data.patientId;
    const name = data.patientName?.trim();
    if (!name) return null;

    if (contact.crmContactId) {
      const existente = await findByContactFn({ data: { crmContactId: contact.crmContactId } });
      if (existente) return existente.id;
    }

    // O telefone é gravado no mesmo formato em que foi conferido na tela. O
    // normPhone da Meta tira a pontuação e valida o E.164 depois.
    const criado = await createPatientFn({
      data: {
        name,
        phone: contact.phone ? formatWhatsappNumber(contact.phone) : undefined,
        crmContactId: contact.crmContactId ?? undefined,
      },
    });
    return criado.id;
  };

  return useMutation({
    mutationFn: async ({
      data,
      existingId,
      contact,
    }: {
      data: Partial<Appointment>;
      existingId?: string;
      contact?: OriginContact;
    }) => {
      const today = new Date().toISOString().slice(0, 10);

      // Só ao criar: editar um agendamento existente não deve inventar paciente.
      const patientId =
        !existingId && contact ? await resolvePatientId(data, contact) : (data.patientId ?? null);

      const payload = {
        id: existingId,
        patientId: patientId ?? null,
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
