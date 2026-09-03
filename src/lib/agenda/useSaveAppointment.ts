import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createAppointment, updateAppointment } from "@/lib/agenda/agenda.functions";
import { createPatient, getPatientByCrmContact } from "@/lib/patients/patients.functions";
import { formatWhatsappNumber } from "@/lib/atendimentos/phone";
import { useUnitSelection } from "@/lib/settings/unit-context";
import { useAgendaCatalog } from "@/lib/agenda/useAppointmentForm";
import type { Appointment } from "@/components/agenda/types";
import { localDateStr } from "@/lib/date";

/**
 * Payload completo de um agendamento, do jeito que o servidor espera.
 *
 * Existe separado porque `updateAppointment` grava a linha inteira: quem mandar
 * só os campos que mudaram apaga o resto (paciente vira "", valor previsto vira
 * 0, valor cobrado vira null). Quem move um bloco na agenda passa por aqui pelo
 * mesmo motivo que o formulário passa.
 */
export function appointmentPayload(data: Partial<Appointment>, patientId: string | null) {
  const today = localDateStr();
  return {
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
    actualRevenue: data.actualRevenue ?? null,
    notes: data.notes ?? null,
    generateFinancial: data.generateFinancial ?? true,
  };
}

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
  const { selectedUnitId } = useUnitSelection();
  const { rooms } = useAgendaCatalog();

  /**
   * A unidade do agendamento vem da CADEIRA escolhida.
   *
   * Cadeira e unidade são a mesma informação dita de dois jeitos — cada cadeira
   * já pertence a uma unidade —, então derivar aqui é melhor do que pedir as
   * duas no formulário, onde elas poderiam se contradizer.
   *
   * Antes ia só o `selectedUnitId`, que é o seletor global do menu e começa em
   * "todas as unidades": com duas unidades cadastradas, o servidor recusava com
   * "Selecione a unidade." num formulário que não tinha campo de unidade
   * nenhum para atender ao pedido.
   *
   * Fica no hook, e não no formulário, porque quatro telas gravam agendamento
   * (Agenda, chat, celular e o arrastar do calendário) — resolver em cada uma
   * seria a mesma regra em quatro lugares, saindo do ar uma da outra.
   */
  const unidadeDaCadeira = (roomId?: string | null): string | null =>
    (roomId && rooms.find((r) => r.id === roomId)?.unitId) || null;

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
    /** Nome e sobrenome como o formulário os separou, quando os separou. */
    nome?: { primeiro: string; sobrenome: string },
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
    // A unidade sai da CADEIRA, igual à do agendamento logo abaixo.
    //
    // Aqui ia só o `selectedUnitId` — o seletor global do menu, que começa em
    // "todas as unidades". Com duas unidades cadastradas, agendar alguém que
    // ainda não é paciente falhava com "Selecione a unidade." num formulário
    // que não tem campo de unidade nenhum, e que na linha de cima já dizia
    // "Este agendamento entra na unidade NÓS Florianópolis".
    //
    // O agendamento nunca foi o problema: ele já derivava certo. Quem estourava
    // era a criação do PACIENTE, um passo antes — e o erro não dizia isso.
    const criado = await createPatientFn({
      data: {
        name,
        // As partes vêm do formulário quando ele as tem. Sem elas o servidor
        // divide sozinho pela primeira palavra — que é o que a Meta já fazia,
        // e acerta na maioria; erra em nome composto ("Ana Paula").
        firstName: nome?.primeiro || undefined,
        lastName: nome?.sobrenome || undefined,
        phone: contact.phone ? formatWhatsappNumber(contact.phone) : undefined,
        crmContactId: contact.crmContactId ?? undefined,
        unitId: unidadeDaCadeira(data.roomId) ?? selectedUnitId ?? undefined,
      },
    });
    return criado.id;
  };

  return useMutation({
    mutationFn: async ({
      data,
      existingId,
      contact,
      retornoEm,
      nome,
    }: {
      data: Partial<Appointment>;
      existingId?: string;
      contact?: OriginContact;
      /** Data do retorno pré-agendado, quando o atendimento foi confirmado. */
      retornoEm?: string | null;
      /** Nome e sobrenome separados no formulário, para a ficha nascer certa. */
      nome?: { primeiro: string; sobrenome: string };
    }) => {
      // Só ao criar: editar um agendamento existente não deve inventar paciente.
      const patientId =
        !existingId && contact
          ? await resolvePatientId(data, contact, nome)
          : (data.patientId ?? null);

      const payload = { id: existingId, ...appointmentPayload(data, patientId) };
      // O retorno é criado no servidor, dentro da transição de status — é o
      // único ponto por onde passam os dois caminhos que concluem (formulário
      // e botão do celular).
      const r: any = existingId
        ? await updateFn({ data: { ...payload, retornoEm } })
        : await createFn({
            data: {
              ...payload,
              unitId: unidadeDaCadeira(data.roomId) ?? selectedUnitId ?? undefined,
            },
          });
      return { existingId, retornoEm: retornoEm ?? null, conflitos: r?.conflitos ?? [] };
    },
    onSuccess: ({ existingId, retornoEm, conflitos }) => {
      if (retornoEm) {
        const quando = retornoEm.split("-").reverse().join("/");
        if (conflitos.length) {
          // Aviso, não bloqueio: o retorno é criado do mesmo jeito. O
          // calendário empilha cards sobrepostos sem sinalizar conflito, então
          // sem esta mensagem ninguém descobriria.
          toast.warning(
            `Retorno criado em ${quando}, mas ${conflitos[0].patientName} já tem atendimento às ${conflitos[0].startTime}.`,
          );
        } else {
          toast.success(`Retorno pré-agendado para ${quando}`);
        }
      }
      toast.success(existingId ? "Agendamento atualizado" : "Agendamento criado");
      // Invalida a Agenda mesmo quando salvo de outra tela — é o que garante
      // que um agendamento feito pelo chat apareça lá sem recarregar.
      queryClient.invalidateQueries({ queryKey: ["agenda-overview"] });
      options?.onSaved?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar agendamento"),
  });
}
