import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { resolveUnitId } from "@/lib/auth/resolve-unit";
import { gravarTolerandoColunaAusente, semColuna } from "@/lib/schema-fallback";
import type {
  Appointment,
  AppointmentNotification,
  AppointmentStatus,
  AppointmentType,
  BlockedTime,
  WaitingListItem,
} from "@/components/agenda/types";

export interface AgendaOverview {
  appointments: Appointment[];
  blockedTimes: BlockedTime[];
  waitingList: WaitingListItem[];
}

function mapAppointment(row: any, notifications: AppointmentNotification[]): Appointment {
  return {
    id: row.id,
    patientId: row.patient_id ?? undefined,
    patientName: row.patient_name,
    procedureName: row.procedure_name,
    professionalId: row.professional_id ?? "",
    professionalName: row.professional_name,
    roomId: row.room_id ?? "",
    roomName: row.room_name ?? "",
    date: row.date,
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    status: row.status,
    type: row.type,
    expectedRevenue: Number(row.expected_revenue),
    // Nulo continua nulo: é o que distingue "não confirmado" de "foi de graça".
    actualRevenue: row.actual_revenue === null || row.actual_revenue === undefined
      ? null
      : Number(row.actual_revenue),
    notes: row.notes ?? undefined,
    generateFinancial: row.generate_financial,
    notifications,
  };
}

function mapBlockedTime(row: any): BlockedTime {
  return {
    id: row.id,
    professionalId: row.professional_id ?? "",
    roomId: row.room_id ?? "",
    date: row.date,
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    reason: row.reason ?? "",
  };
}

function mapWaitingListItem(row: any): WaitingListItem {
  const created = new Date(row.created_at);
  const daysWaiting = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000));
  return {
    id: row.id,
    patientName: row.patient_name,
    procedureName: row.procedure_name,
    daysWaiting,
  };
}

export const getAgendaOverview = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { unitId?: string } | undefined) => ({ unitId: input?.unitId ?? null }))
  .handler(async ({ data, context }): Promise<AgendaOverview> => {
    const supabase = context.supabase;
    // Não-admin nunca escolhe: sempre a própria unidade. Admin sem escolha
    // nenhuma vê todas — `null` não filtra.
    const unitFilter = context.isAdmin ? data.unitId : context.unitId;
    const comUnidade = (q: any) => (unitFilter ? q.eq("unit_id", unitFilter) : q);

    const [apptRes, blockRes, waitRes, notifRes] = await Promise.all([
      comUnidade(
        supabase
          .from("appointments")
          .select("*")
          .eq("owner_id", context.ownerId)
          .order("date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(2000),
      ),
      comUnidade(
        supabase
          .from("blocked_times")
          .select("*")
          .eq("owner_id", context.ownerId)
          .order("date", { ascending: true })
          .limit(1000),
      ),
      comUnidade(
        supabase
          .from("waiting_list")
          .select("*")
          .eq("owner_id", context.ownerId)
          .order("created_at", { ascending: true })
          .limit(200),
      ),
      // Sem filtro de unidade aqui de propósito: a tabela não tem unit_id
      // próprio (é escopada via join com appointments na RLS — ver migration).
      // Notificação de agendamento fora do recorte simplesmente não casa com
      // nenhum id do `apptRes` já filtrado, e o mapa abaixo a ignora.
      supabase
        .from("appointment_notifications")
        .select("appointment_id, kind, channel, status, sent_at")
        .eq("owner_id", context.ownerId)
        .limit(5000),
    ]);
    if (apptRes.error) throw new Error(apptRes.error.message);
    if (blockRes.error) throw new Error(blockRes.error.message);
    if (waitRes.error) throw new Error(waitRes.error.message);
    if (notifRes.error) throw new Error(notifRes.error.message);

    const notifByAppt = new Map<string, AppointmentNotification[]>();
    for (const row of (notifRes.data ?? []) as any[]) {
      const list = notifByAppt.get(row.appointment_id) ?? [];
      list.push({
        kind: row.kind,
        channel: row.channel,
        status: row.status,
        sentAt: row.sent_at,
      });
      notifByAppt.set(row.appointment_id, list);
    }

    return {
      appointments: (apptRes.data ?? []).map((row: any) =>
        mapAppointment(row, notifByAppt.get(row.id) ?? []),
      ),
      blockedTimes: (blockRes.data ?? []).map(mapBlockedTime),
      waitingList: (waitRes.data ?? []).map(mapWaitingListItem),
    };
  });

// ---------- appointments: mutations ----------

/** Colunas lidas depois de gravar, para decidir a transição de status. */
const COLUNAS_TRANSICAO = [
  "status", "patient_id", "patient_name", "procedure_name", "professional_id",
  "date", "actual_revenue", "expected_revenue", "generate_financial",
  "room_id", "room_name", "professional_name", "start_time", "end_time",
  "unit_id",
];
const SELECT_TRANSICAO = COLUNAS_TRANSICAO.join(", ");
const SELECT_TRANSICAO_SEM_VALOR = COLUNAS_TRANSICAO.filter((c) => c !== "actual_revenue").join(", ");

/**
 * Um atendimento só é dado como realizado com o valor cobrado junto.
 *
 * Zero é aceito de propósito — atendimento de cortesia existe. O que não passa
 * é nulo, que significa "ninguém preencheu". Essa distinção só é possível
 * porque `actual_revenue` é anulável, diferente de `expected_revenue`, que é
 * NOT NULL DEFAULT 0 e por isso não consegue diferenciar as duas coisas.
 */
function assertValorAoConcluir(
  status: AppointmentStatus | undefined,
  actualRevenue: number | null | undefined,
): void {
  if (status !== "completed") return;
  if (actualRevenue === null || actualRevenue === undefined || Number.isNaN(actualRevenue)) {
    throw new Error("Informe o valor cobrado para confirmar o atendimento.");
  }
  if (actualRevenue < 0) throw new Error("O valor cobrado não pode ser negativo.");
}

const appointmentInput = (input: {
  id?: string;
  patientId?: string | null;
  patientName: string;
  procedureName: string;
  professionalId?: string | null;
  professionalName: string;
  roomId?: string | null;
  roomName?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status?: AppointmentStatus;
  type?: AppointmentType;
  expectedRevenue?: number;
  actualRevenue?: number | null;
  notes?: string | null;
  generateFinancial?: boolean;
  /**
   * Não mandar a confirmação na criação.
   *
   * Existe por causa do retorno pré-agendado. `createAppointment` avisa o
   * paciente sem olhar a data, então um retorno criado hoje para daqui a seis
   * meses dispararia e-mail, SMS e WhatsApp **agora**, com o texto já trazendo
   * a data de daqui a meio ano. Os lembretes automáticos não precisam disso:
   * o cron varre por data e pega o retorno na véspera, na hora certa.
   */
  skipConfirmation?: boolean;
  /** Data do retorno a pré-agendar quando este save conclui o atendimento. */
  retornoEm?: string | null;
}) => {
  if (!input.patientName?.trim()) throw new Error("Informe o nome do paciente");
  if (!input.date) throw new Error("Informe a data");
  if (!input.startTime || !input.endTime) throw new Error("Informe o horário");
  // A regra vive aqui, e não só na tela, porque são quatro caminhos de
  // interface que chegam a "concluído" — o botão do celular, e o formulário
  // em três telas — mais o caso de um agendamento já NASCER concluído, já que
  // o mesmo validador serve create e update. Validar no cliente cobriria um.
  assertValorAoConcluir(input.status, input.actualRevenue);
  return {
    id: input.id,
    patient_id: input.patientId || null,
    patient_name: input.patientName.trim(),
    procedure_name: input.procedureName?.trim() || "Consulta",
    professional_id: input.professionalId || null,
    professional_name: input.professionalName?.trim() || "",
    room_id: input.roomId || null,
    room_name: input.roomName?.trim() || null,
    date: input.date,
    start_time: input.startTime,
    end_time: input.endTime,
    status: input.status ?? "pending",
    type: input.type ?? "consultation",
    expected_revenue: input.expectedRevenue ?? 0,
    // `undefined` vira `null` só quando veio explicitamente nulo; sem a chave,
    // preserva o que já está gravado no update.
    actual_revenue: input.actualRevenue ?? null,
    notes: input.notes?.trim() || null,
    generate_financial: input.generateFinancial ?? true,
    // Fora do payload da tabela — só orienta o handler. Removido antes do insert.
    __skipConfirmation: Boolean(input.skipConfirmation),
    __retornoEm: input.retornoEm ?? null,
  };
};

/**
 * Criação de agendamento sem a casca de server function.
 *
 * Existe separada porque o funil também cria agendamento — um "Ganho" vira um
 * atendimento já concluído. Duplicar este corpo lá significaria duas
 * implementações de notificação, conversão e recebimento saindo do ar uma da
 * outra em silêncio; um handler não pode chamar outro handler diretamente,
 * então o miolo vira função comum e os dois entram por aqui.
 */
export async function criarAgendamento(
  supabase: any,
  ownerId: string,
  row: Record<string, any>,
  opcoes: { skipConfirmation?: boolean; retornoEm?: string | null } = {},
): Promise<{ id: string }> {
  const { data: inserted, error } = await gravarTolerandoColunaAusente({
    coluna: "actual_revenue",
    exigida: row.status === "completed",
    motivo: "O valor cobrado ainda não pode ser gravado.",
    tentar: (sem) =>
      supabase
        .from("appointments")
        .insert({ ...(sem ? semColuna(row, "actual_revenue") : row), owner_id: ownerId })
        .select("id")
        .single(),
  });
  if (error) throw new Error(error.message);

  // Data já passada nunca notifica, tenha vindo `skipConfirmation` ou não.
  // Registrar um atendimento antigo — para ter o histórico no sistema — não
  // pode disparar "confirme sua consulta" de uma consulta de semana passada.
  // A regra mora aqui, e não na tela, porque quatro telas criam agendamento.
  const jaAconteceu = String(row.date) < new Date().toISOString().slice(0, 10);
  if (!opcoes.skipConfirmation && !jaAconteceu) {
    const { triggerAppointmentNotification } = await import("@/lib/agenda/notifications.server");
    await triggerAppointmentNotification(inserted.id, "confirmation");
  }
  const { dispatchMetaCapiEvent } = await import("@/lib/integrations/meta-capi.server");
  await dispatchMetaCapiEvent(ownerId, "appointment.created", {
    entityId: inserted.id,
    patientId: row.patient_id,
    contactName: row.patient_name,
    amount: row.expected_revenue,
  });

  // Nascendo já concluído (registro retroativo pela agenda, ou um Ganho do
  // funil), a conversão e o recebimento saem do mesmo lugar que qualquer outra
  // conclusão — `statusAnterior` nulo conta como transição.
  if (row.status === "completed") {
    await onStatusTransition(
      supabase, ownerId, inserted.id, null,
      { ...row, actual_revenue: row.actual_revenue ?? null } as any,
      opcoes.retornoEm,
    );
  }
  return { id: inserted.id };
}

export const createAppointment = createServerFn({ method: "POST" })
  .inputValidator((input: Parameters<typeof appointmentInput>[0] & { unitId?: string }) => ({
    ...appointmentInput(input),
    // Fora do payload de colunas do `appointmentInput` de propósito: unidade
    // não é editável em update (agendamento não troca de local sozinho), só
    // resolvida na criação — por isso fica de fora do mapeamento compartilhado.
    unitId: input.unitId,
  }))
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    const { id: _ignored, __skipConfirmation: skipConfirmation, __retornoEm: retornoEm, unitId: rawUnitId, ...row } = data;
    const unitId = await resolveUnitId(context, rawUnitId);
    // types.ts é gerado pelo Lovable a partir do banco e só passa a conhecer
    // actual_revenue depois que a migration rodar lá. Mesmo escape que
    // patients.functions.ts já usa, até a regeneração.
    return criarAgendamento(context.supabase as any, context.ownerId, { ...row, unit_id: unitId }, {
      skipConfirmation,
      retornoEm,
    });
  });

/**
 * Avisa a Meta de uma mudança de status — **só quando ela de fato aconteceu**.
 *
 * O `event_id` é `<evento>:<id>:<status>`, e a tabela de eventos não tem
 * unique nessa coluna: reenviar depende inteiramente da deduplicação da Meta,
 * que só vale por uma janela. Sem esta guarda, corrigir o valor de um
 * atendimento já confirmado e salvar de novo mandaria uma segunda conversão —
 * ou seja, receita contada em dobro.
 *
 * O valor da conversão é o cobrado; o previsto só entra enquanto não há
 * cobrado, para os outros status.
 */
async function onStatusTransition(
  supabase: any,
  ownerId: string,
  id: string,
  statusAnterior: string | null | undefined,
  row: {
    status: string;
    patient_id: string | null;
    patient_name: string;
    procedure_name?: string | null;
    professional_id?: string | null;
    date?: string | null;
    actual_revenue: number | null;
    expected_revenue: number | null;
    generate_financial?: boolean | null;
    room_id?: string | null;
    room_name?: string | null;
    professional_name?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    unit_id?: string | null;
  },
  retornoEm?: string | null,
): Promise<{ patientName: string; startTime: string }[]> {
  if (statusAnterior === row.status) return [];

  const { dispatchMetaCapiEvent } = await import("@/lib/integrations/meta-capi.server");
  await dispatchMetaCapiEvent(ownerId, "appointment.status_changed", {
    entityId: `${id}:${row.status}`,
    status: row.status,
    patientId: row.patient_id,
    contactName: row.patient_name,
    amount: row.actual_revenue ?? row.expected_revenue ?? null,
  });

  // Cumpre o que o interruptor "Gerar cobrança ao concluir" sempre prometeu.
  // Dentro da guarda de transição: reconfirmar ou reeditar não gera segunda
  // cobrança. Best-effort como o resto — uma falha no financeiro não pode
  // desfazer a conclusão do atendimento, que já aconteceu no mundo real.
  if (row.status === "completed" && row.generate_financial) {
    try {
      if (!row.unit_id) throw new Error("Agendamento sem unidade — não é possível gerar o recebimento.");
      const { createAppointmentReceivable } = await import("@/lib/finance/receivables.functions");
      await createAppointmentReceivable(supabase, ownerId, row.unit_id, {
        amount: row.actual_revenue ?? 0,
        description: `${row.procedure_name || "Atendimento"} · ${row.patient_name}`,
        dueDate: row.date ?? new Date().toISOString().slice(0, 10),
        patientId: row.patient_id,
        professionalId: row.professional_id ?? null,
      });
    } catch (e) {
      console.error("[agenda] recebimento do atendimento concluído", e);
    }
  }

  // Retorno pré-agendado. Mora aqui, e não no cliente, porque são dois
  // caminhos que concluem um atendimento — o formulário e o botão do celular —
  // e os dois passam por esta função. Duplicar no cliente sairia do ar.
  if (row.status === "completed" && retornoEm) {
    const inicio = String(row.start_time ?? "09:00").slice(0, 5);
    const fim = String(row.end_time ?? "10:00").slice(0, 5);

    const { overlaps } = await import("@/lib/date");
    const { data: doDia } = await supabase
      .from("appointments")
      .select("patient_name, start_time, end_time")
      .eq("owner_id", ownerId)
      .eq("date", retornoEm)
      .neq("status", "cancelled");

    const conflitos = (doDia ?? [])
      .filter((r: any) =>
        overlaps(inicio, fim, String(r.start_time).slice(0, 5), String(r.end_time).slice(0, 5)),
      )
      .map((r: any) => ({
        patientName: r.patient_name,
        startTime: String(r.start_time).slice(0, 5),
      }));

    const retorno = {
      owner_id: ownerId,
      // Mesma unidade do atendimento original — um retorno nunca troca de local sozinho.
      unit_id: row.unit_id ?? null,
      patient_id: row.patient_id,
      patient_name: row.patient_name,
      procedure_name: row.procedure_name || "Consulta",
      professional_id: row.professional_id ?? null,
      professional_name: row.professional_name ?? "",
      room_id: row.room_id ?? null,
      room_name: row.room_name ?? null,
      date: retornoEm,
      start_time: inicio,
      end_time: fim,
      status: "pending",
      type: "return",
      expected_revenue: row.expected_revenue ?? 0,
      actual_revenue: null,
      notes: `Retorno do atendimento de ${String(row.date ?? "").split("-").reverse().join("/")}.`,
      generate_financial: true,
    };
    // O retorno nasce pendente, sem valor cobrado — pode ir sem a coluna.
    const { error } = await gravarTolerandoColunaAusente({
      coluna: "actual_revenue",
      exigida: false,
      motivo: "",
      tentar: (sem) =>
        supabase.from("appointments").insert(sem ? semColuna(retorno, "actual_revenue") : retorno),
    });
    if (error) throw new Error(error.message);

    // Nenhuma confirmação é disparada de propósito: o insert é direto, sem
    // passar por createAppointment. Avisar hoje um paciente sobre uma consulta
    // daqui a seis meses seria ruído — e os lembretes automáticos, que varrem
    // por data, pegam este retorno na véspera do jeito certo.
    return conflitos;
  }

  return [];
}

export const updateAppointment = createServerFn({ method: "POST" })
  .inputValidator(appointmentInput)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("Agendamento inválido");
    // Nenhum dos dois é coluna: orientam o handler e saem do payload.
    const { id, __skipConfirmation: _ignored, __retornoEm: retornoEm, ...row } = data;
    const supabase: any = context.supabase;

    // Lido antes do update: é a única forma de saber que ESTE save foi o que
    // concluiu o atendimento. Antes, salvar o formulário com status concluído
    // não avisava a Meta de nada.
    const { data: antes } = await supabase
      .from("appointments")
      .select("status")
      .eq("id", id)
      .eq("owner_id", context.ownerId)
      .maybeSingle();

    const { data: updated, error } = await gravarTolerandoColunaAusente({
      coluna: "actual_revenue",
      exigida: row.status === "completed",
      motivo: "O valor cobrado ainda não pode ser gravado.",
      tentar: (sem) =>
        supabase
          .from("appointments")
          .update(sem ? semColuna(row, "actual_revenue") : row)
          .eq("id", id)
          .eq("owner_id", context.ownerId)
          .select(sem ? SELECT_TRANSICAO_SEM_VALOR : SELECT_TRANSICAO)
          .single(),
    });
    if (error) throw new Error(error.message);

    const conflitos = await onStatusTransition(
      supabase, context.ownerId, id, antes?.status, updated, retornoEm,
    );
    return { ok: true, conflitos };
  });

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      id: string;
      status: AppointmentStatus;
      actualRevenue?: number | null;
      /** Data do retorno pré-agendado, quando houver. */
      retornoEm?: string | null;
      /** Decidido na confirmação, não no agendamento: gera o recebimento? */
      generateFinancial?: boolean;
    }) => {
      assertValorAoConcluir(input.status, input.actualRevenue);
      return input;
    },
  )
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { data: antes } = await supabase
      .from("appointments")
      .select("status")
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .maybeSingle();

    // O valor só é gravado ao concluir; os outros status não mexem nele.
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "completed") {
      patch.actual_revenue = data.actualRevenue;
      // Gravado antes do `select`, para que `onStatusTransition` leia a escolha
      // feita agora na confirmação, e não a que estava salva no agendamento.
      if (data.generateFinancial !== undefined) patch.generate_financial = data.generateFinancial;
    }

    const { data: updated, error } = await gravarTolerandoColunaAusente({
      coluna: "actual_revenue",
      exigida: data.status === "completed",
      motivo: "O valor cobrado ainda não pode ser gravado.",
      tentar: (sem) =>
        supabase
          .from("appointments")
          .update(sem ? semColuna(patch, "actual_revenue") : patch)
          .eq("id", data.id)
          .eq("owner_id", context.ownerId)
          .select(sem ? SELECT_TRANSICAO_SEM_VALOR : SELECT_TRANSICAO)
          .single(),
    });
    if (error) throw new Error(error.message);

    const conflitos = await onStatusTransition(
      supabase, context.ownerId, data.id, antes?.status, updated, data.retornoEm,
    );
    return { ok: true, conflitos };
  });

export const deleteAppointment = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("appointments")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- blocked times: mutations ----------

const blockedTimeInput = (input: {
  professionalId: string;
  roomId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
}) => {
  if (!input.professionalId) throw new Error("Selecione o profissional");
  if (!input.date) throw new Error("Informe a data");
  if (!input.startTime || !input.endTime) throw new Error("Informe o horário");
  return {
    professional_id: input.professionalId,
    room_id: input.roomId || null,
    date: input.date,
    start_time: input.startTime,
    end_time: input.endTime,
    reason: input.reason?.trim() || null,
  };
};

export const createBlockedTime = createServerFn({ method: "POST" })
  .inputValidator((input: Parameters<typeof blockedTimeInput>[0] & { unitId?: string }) => ({
    ...blockedTimeInput(input),
    unitId: input.unitId,
  }))
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    const { unitId: rawUnitId, ...row } = data;
    const unitId = await resolveUnitId(context, rawUnitId);
    // types.ts ainda não conhece unit_id (Lovable regenera depois da migration).
    const supabase: any = context.supabase;
    const { data: inserted, error } = await supabase
      .from("blocked_times")
      .insert({ ...row, owner_id: context.ownerId, unit_id: unitId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

// Editar e excluir não existiam: dava para criar um compromisso e nunca mais
// tirá-lo da agenda. Passa a existir agora que ele deixou de ser um bloco
// hachurado inerte — compromisso é justamente o que mais muda de horário.

export const updateBlockedTime = createServerFn({ method: "POST" })
  .inputValidator((input: Parameters<typeof blockedTimeInput>[0] & { id: string }) => ({
    ...blockedTimeInput(input),
    id: input.id,
  }))
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    const { id, ...row } = data;
    if (!id) throw new Error("Compromisso inválido");
    const { error } = await context.supabase
      .from("blocked_times")
      .update(row)
      .eq("id", id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBlockedTime = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("blocked_times")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Agendamentos do mesmo profissional que colidem com uma faixa de horário.
 *
 * Serve para avisar antes de criar um retorno em cima de outro atendimento. O
 * calendário posiciona todos os cards com `left: 4, right: 4` e o mesmo
 * `zIndex`, então uma sobreposição não aparece como conflito — aparece como um
 * card escondido atrás do outro. Sem este aviso, ninguém notaria.
 */
export const findConflicts = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { date: string; startTime: string; endTime: string; professionalId?: string | null }) => input,
  )
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }): Promise<{ patientName: string; startTime: string }[]> => {
    const supabase: any = context.supabase;
    let query = supabase
      .from("appointments")
      .select("patient_name, start_time, end_time")
      .eq("owner_id", context.ownerId)
      .eq("date", data.date)
      .neq("status", "cancelled");
    if (data.professionalId) query = query.eq("professional_id", data.professionalId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const { overlaps } = await import("@/lib/date");
    return (rows ?? [])
      .filter((r: any) =>
        overlaps(
          data.startTime,
          data.endTime,
          String(r.start_time).slice(0, 5),
          String(r.end_time).slice(0, 5),
        ),
      )
      .map((r: any) => ({
        patientName: r.patient_name,
        startTime: String(r.start_time).slice(0, 5),
      }));
  });
