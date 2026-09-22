import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createAppointment, updateAppointment } from "@/lib/agenda/agenda.functions";
import { createPatient, getPatientByCrmContact } from "@/lib/patients/patients.functions";
import { formatWhatsappNumber, normalizeBrazilianPhone } from "@/lib/atendimentos/phone";
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
    // Repassada como veio, inclusive `undefined`: no servidor, lista vazia
    // manda APAGAR os itens e ausente manda não mexer neles. Trocar uma pela
    // outra aqui faria quem move um bloco no calendário apagar os
    // procedimentos do agendamento que moveu.
    procedures: data.procedures,
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

/**
 * Os dados de quem ainda não tem ficha, como o formulário os separou.
 *
 * Nome e sobrenome vêm separados porque a Meta casa a conversão por `fn` e
 * `ln`, dois hashes distintos — dividir "Ana Paula Silva" no automático dá
 * fn "Ana", errado e em silêncio. O telefone vem junto porque é ele que
 * permite o match acontecer.
 */
export interface NomeDoPacienteNovo {
  primeiro: string;
  sobrenome: string;
  telefone?: string;
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
   * Gravar o `crmContactId` é o que evita duplicata: o próximo agendamento da
   * mesma pessoa reencontra este paciente por essa coluna em vez de criar um
   * segundo. O nome dela é herança do CRM externo, que não existe mais; o que
   * ela guarda é o identificador da pessoa no WhatsApp.
   */
  const resolvePatientId = async (
    data: Partial<Appointment>,
    contact: OriginContact,
    /** Nome, sobrenome e telefone como o formulário os separou, quando os separou. */
    nome?: NomeDoPacienteNovo,
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
        // O telefone digitado no formulário ganha do contato: quem agenda pela
        // Agenda informa o número na hora, e é o único que existe nesse
        // caminho. Sem ele o evento da Meta sai com hash de nome e nada mais
        // — a Meta recebe, responde 200, e não casa com anúncio nenhum.
        // `normalizeBrazilianPhone` antes de formatar: o que vem do formulário
        // é digitado à mão, quase sempre sem o 55 do país. Sem o país o CRM lê
        // o DDD como código de outro país, e a Meta não casa o hash com nada.
        phone: nome?.telefone
          ? formatWhatsappNumber(normalizeBrazilianPhone(nome.telefone))
          : contact.phone
            ? formatWhatsappNumber(contact.phone)
            : undefined,
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
      pagamentoRecebido,
    }: {
      data: Partial<Appointment>;
      existingId?: string;
      contact?: OriginContact;
      /** Data do retorno pré-agendado, quando o atendimento foi confirmado. */
      retornoEm?: string | null;
      /** Nome, sobrenome e telefone do formulário, para a ficha nascer certa. */
      nome?: NomeDoPacienteNovo;
      /** A confirmação marcou que o valor já entrou no caixa. */
      pagamentoRecebido?: boolean;
    }) => {
      // Só ao criar: editar um agendamento existente não deve inventar paciente.
      //
      // ── Por que não depende mais de `contact` ─────────────────────────
      //
      // Dependia, e era o furo: a criação de ficha só acontecia quando o
      // agendamento nascia de uma conversa de WhatsApp. Quem agendava pela
      // Agenda digitando um nome novo — o "Usar 'Fulano' (paciente novo)" do
      // combobox — gravava o agendamento com `patient_id` nulo e NENHUMA
      // linha em `patients`. O `resolvePerson` da Edge Function da Meta busca
      // os dados pessoais só nessa tabela, então o evento saía com hash de
      // nome e mais nada: a Meta respondia 200, o log do sistema dizia
      // "enviado", e no Gerenciador de Anúncios não aparecia Lead nenhum.
      //
      // `resolvePatientId` já devolve `data.patientId` na primeira linha
      // quando ele existe, então paciente vinculado continua intocado.
      //
      // ── Editando ───────────────────────────────────────────────────────
      //
      // Editar não inventa paciente: o formulário abre com o que já está
      // gravado, e criar ficha a partir disso seria duplicar quem já existe.
      // A exceção é o conserto explícito — alguém abriu um agendamento sem
      // ficha e DIGITOU o telefone. Aí a intenção é essa, e é o único jeito de
      // recuperar os agendamentos que foram salvos sem ninguém por trás.
      const consertando = Boolean(existingId && !data.patientId && nome?.telefone);
      const patientId =
        existingId && !consertando
          ? (data.patientId ?? null)
          : await resolvePatientId(data, contact ?? { phone: null, crmContactId: null }, nome);

      const payload = { id: existingId, ...appointmentPayload(data, patientId) };
      // O retorno é criado no servidor, dentro da transição de status — é o
      // único ponto por onde passam os dois caminhos que concluem (formulário
      // e botão do celular).
      const r: any = existingId
        ? await updateFn({ data: { ...payload, retornoEm, pagamentoRecebido } })
        : await createFn({
            data: {
              ...payload,
              // `retornoEm` faltava aqui, e só aqui.
              //
              // O servidor sempre soube recebê-lo na criação, mas o cliente
              // não mandava: registrar um atendimento retroativo escolhendo
              // "retorno em 3 meses" não criava retorno nenhum, em silêncio.
              // Apareceu agora porque `pagamentoRecebido` percorre o mesmo
              // caminho e teria sumido do mesmo jeito.
              retornoEm,
              pagamentoRecebido,
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
