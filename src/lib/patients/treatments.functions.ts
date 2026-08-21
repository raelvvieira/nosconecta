/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { clinicTodayStr } from "@/lib/date";

// Orçamentos e tratamentos.
//
// Um orçamento aprovado É o tratamento a executar — mesma tabela, `status`
// diferente. Ver o comentário da migration 20260821140000 sobre por que não são
// duas tabelas.

const TABELA_AUSENTE = "42P01";

export class TratamentosIndisponiveis extends Error {
  constructor() {
    super("As tabelas de orçamento ainda não foram criadas no banco.");
    this.name = "TratamentosIndisponiveis";
  }
}

function lancarSeErroReal(error: any): void {
  if (!error) return;
  if (error.code === TABELA_AUSENTE || /does not exist/i.test(String(error.message ?? ""))) {
    throw new TratamentosIndisponiveis();
  }
  throw new Error(error.message);
}

export type StatusDoPlano = "draft" | "approved" | "rejected";
export type StatusDoItem = "pending" | "done";

export interface ItemDoPlano {
  id: string;
  procedureName: string;
  tooth: string | null;
  amount: number;
  status: StatusDoItem;
  /** Já gerou recebimento? É o que impede cobrar duas vezes o mesmo item. */
  temCobranca: boolean;
}

export interface PlanoDeTratamento {
  id: string;
  title: string;
  status: StatusDoPlano;
  professionalName: string | null;
  notes: string | null;
  createdAt: string;
  approvedAt: string | null;
  itens: ItemDoPlano[];
  total: number;
  totalConcluido: number;
}

export interface TratamentosDoPaciente {
  planos: PlanoDeTratamento[];
  indisponivel: boolean;
}

const money = (v: any): number => Number(v ?? 0);

export const getTratamentos = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { patientId: string }) => input)
  .handler(async ({ data, context }): Promise<TratamentosDoPaciente> => {
    const supabase: any = context.supabase;
    const { data: planos, error } = await supabase
      .from("treatment_plans")
      .select("id, title, status, professional_name, notes, created_at, approved_at")
      .eq("patient_id", data.patientId)
      .order("created_at", { ascending: false });

    try {
      lancarSeErroReal(error);
    } catch (e) {
      if (e instanceof TratamentosIndisponiveis) return { planos: [], indisponivel: true };
      throw e;
    }

    const lista = planos ?? [];
    if (!lista.length) return { planos: [], indisponivel: false };

    // Todos os itens de todos os planos numa consulta: um `in` em vez de uma
    // ida por plano, que é o que aconteceria num laço.
    const { data: itens, error: erroItens } = await supabase
      .from("treatment_items")
      .select("id, plan_id, procedure_name, tooth, amount, status, transaction_id")
      .in("plan_id", lista.map((p: any) => p.id))
      .order("created_at", { ascending: true });
    lancarSeErroReal(erroItens);

    const porPlano = new Map<string, ItemDoPlano[]>();
    for (const i of itens ?? []) {
      const item: ItemDoPlano = {
        id: String(i.id),
        procedureName: i.procedure_name,
        tooth: i.tooth ?? null,
        amount: money(i.amount),
        status: i.status as StatusDoItem,
        temCobranca: !!i.transaction_id,
      };
      porPlano.set(i.plan_id, [...(porPlano.get(i.plan_id) ?? []), item]);
    }

    return {
      indisponivel: false,
      planos: lista.map((p: any) => {
        const seus = porPlano.get(p.id) ?? [];
        return {
          id: String(p.id),
          title: p.title,
          status: p.status as StatusDoPlano,
          professionalName: p.professional_name ?? null,
          notes: p.notes ?? null,
          createdAt: p.created_at,
          approvedAt: p.approved_at ?? null,
          itens: seus,
          total: seus.reduce((s, i) => s + i.amount, 0),
          totalConcluido: seus.filter((i) => i.status === "done").reduce((s, i) => s + i.amount, 0),
        };
      }),
    };
  });

export const salvarPlano = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      patientId: string;
      title: string;
      itens: { procedureId?: string | null; procedureName: string; tooth?: string | null; amount: number }[];
    }) => {
      if (!input.patientId) throw new Error("Paciente não informado.");
      if (!input.title?.trim()) throw new Error("Dê um nome ao orçamento.");
      if (!input.itens?.length) throw new Error("Adicione ao menos um procedimento.");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const { data: prof } = await supabase
      .from("professionals")
      .select("id, name")
      .eq("owner_id", context.ownerId)
      .limit(1)
      .maybeSingle();

    const { data: plano, error } = await supabase
      .from("treatment_plans")
      .insert({
        patient_id: data.patientId,
        professional_id: prof?.id ?? null,
        professional_name: prof?.name ?? null,
        title: data.title.trim(),
        status: "draft",
      })
      .select("id")
      .single();
    lancarSeErroReal(error);

    const { error: erroItens } = await supabase.from("treatment_items").insert(
      data.itens.map((i) => ({
        plan_id: plano.id,
        procedure_id: i.procedureId ?? null,
        // Snapshot de nome e valor: a tabela de preços muda, o orçamento
        // aprovado não. Ver o comentário da migration.
        procedure_name: i.procedureName,
        tooth: i.tooth ?? null,
        amount: i.amount,
      })),
    );
    lancarSeErroReal(erroItens);
    return { id: String(plano.id) };
  });

export const definirStatusDoPlano = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string; status: StatusDoPlano }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("treatment_plans")
      .update({
        status: data.status,
        approved_at: data.status === "approved" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    lancarSeErroReal(error);
    return { ok: true };
  });

export const excluirPlano = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    // Os itens somem junto pelo ON DELETE CASCADE da FK.
    const { error } = await supabase.from("treatment_plans").delete().eq("id", data.id);
    lancarSeErroReal(error);
    return { ok: true };
  });

/**
 * Conclui um item e, opcionalmente, gera o recebimento dele.
 *
 * O recebimento sai por `createAppointmentReceivable` — a mesma função que a
 * agenda usa ao concluir um atendimento — e não por um insert próprio em
 * `financial_transactions`. Um segundo caminho para dinheiro entrar no sistema
 * é como duas contabilidades começam a divergir.
 *
 * Não uso `createReceivable` (a server function da tela de Recebimentos)
 * porque ela é feita para ser chamada pelo NAVEGADOR: resolve unidade e dono a
 * partir da requisição. Aqui já estamos no servidor, com `context.ownerId` na
 * mão — chamar uma server function de dentro de outra seria pedir ao sistema
 * que redescubra o que ele já sabe. `createAppointmentReceivable` existe
 * exatamente para este caso, recebendo supabase/owner/unidade explícitos.
 *
 * `transaction_id` guarda o vínculo, e é o que impede cobrar duas vezes o
 * mesmo procedimento se alguém clicar de novo.
 */
export const concluirItem = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string; gerarCobranca: boolean }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true; cobrancaGerada: boolean }> => {
    const supabase: any = context.supabase;

    const { data: item, error: erroLeitura } = await supabase
      .from("treatment_items")
      .select(
        "id, plan_id, procedure_name, amount, transaction_id, treatment_plans(patient_id, professional_id)",
      )
      .eq("id", data.id)
      .maybeSingle();
    lancarSeErroReal(erroLeitura);
    if (!item) throw new Error("Procedimento não encontrado.");

    let transactionId: string | null = item.transaction_id ?? null;
    let cobrancaGerada = false;

    // Já tem cobrança: concluir de novo não gera outra. É a proteção contra o
    // clique repetido, e vale mesmo que a interface esconda o botão.
    if (data.gerarCobranca && !transactionId && money(item.amount) > 0) {
      const pacienteId = item.treatment_plans?.patient_id ?? null;
      // A unidade vem do PACIENTE, não do usuário logado: um admin pode estar
      // com "todas as unidades" selecionadas, e o lançamento tem que cair na
      // unidade onde o paciente é atendido.
      const { data: paciente } = await supabase
        .from("patients")
        .select("unit_id")
        .eq("id", pacienteId)
        .maybeSingle();
      if (!paciente?.unit_id) {
        throw new Error("Paciente sem unidade — não é possível gerar o recebimento.");
      }

      const { createAppointmentReceivable } = await import("@/lib/finance/receivables.functions");
      transactionId = await createAppointmentReceivable(
        supabase,
        context.ownerId,
        paciente.unit_id,
        {
          amount: money(item.amount),
          description: item.procedure_name,
          dueDate: clinicTodayStr(),
          patientId: pacienteId,
          professionalId: item.treatment_plans?.professional_id ?? null,
        },
      );
      cobrancaGerada = !!transactionId;
    }

    const { error } = await supabase
      .from("treatment_items")
      .update({
        status: "done",
        done_at: new Date().toISOString(),
        transaction_id: transactionId,
      })
      .eq("id", data.id);
    lancarSeErroReal(error);
    return { ok: true, cobrancaGerada };
  });

export const reabrirItem = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    // O recebimento gerado NÃO é apagado ao reabrir: dinheiro que já entrou no
    // financeiro não pode sumir porque alguém desmarcou um item. Se a cobrança
    // foi indevida, ela é cancelada na tela de Recebimentos, que é onde essa
    // decisão tem consequência visível.
    const { error } = await supabase
      .from("treatment_items")
      .update({ status: "pending", done_at: null })
      .eq("id", data.id);
    lancarSeErroReal(error);
    return { ok: true };
  });
