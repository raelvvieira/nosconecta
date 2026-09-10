import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { resolveUnitId } from "@/lib/auth/resolve-unit";
import { tabelaDeCartaoAusente, traduzirErroDeCartao } from "./schema-cartao";

/**
 * Cartões de crédito da clínica.
 *
 * ── Por que arquivo próprio, e não dentro de `accounts.functions.ts` ─────
 *
 * O cartão pertence a uma conta, mas tem vida própria: dois dias de ciclo,
 * faturas, compras. Misturar com o CRUD de conta faria um arquivo em que
 * metade das funções fala de uma coisa e metade de outra.
 *
 * ── Tolerância à migration ausente ──────────────────────────────────────
 *
 * As migrations deste projeto são aplicadas à parte, por um comando no
 * Lovable. Entre o deploy do código e esse comando existe uma janela em que
 * `credit_cards` ainda não existe. Nessa janela, listar devolve vazio em vez
 * de derrubar a tela inteira — cartão é funcionalidade nova, e o financeiro
 * que já funcionava não pode parar por causa dela.
 */

export interface CartaoDeCredito {
  id: string;
  accountId: string | null;
  accountName: string | null;
  name: string;
  lastDigits: string | null;
  closingDay: number;
  dueDay: number;
  archivedAt: string | null;
  unitId: string;
}

function validarDia(valor: unknown, campo: string): number {
  const n = Math.trunc(Number(valor));
  if (!Number.isFinite(n) || n < 1 || n > 31) {
    throw new Error(`${campo} precisa ser um dia entre 1 e 31.`);
  }
  return n;
}

function validarNome(valor: unknown): string {
  const nome = String(valor ?? "").trim();
  if (!nome) throw new Error("Informe o nome do cartão.");
  if (nome.length > 60) throw new Error("Nome muito longo (máx. 60).");
  return nome;
}

/** Só os quatro últimos dígitos, e só dígitos — o resto é decoração. */
function validarDigitos(valor: unknown): string | null {
  const d = String(valor ?? "").replace(/\D/g, "");
  return d ? d.slice(-4) : null;
}

export const listCards = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { unitId?: string; incluirArquivados?: boolean } | undefined) => ({
    unitId: input?.unitId ?? null,
    incluirArquivados: Boolean(input?.incluirArquivados),
  }))
  .handler(async ({ data, context }): Promise<CartaoDeCredito[]> => {
    // Mesma regra das contas: não-admin nunca escolhe unidade, sempre a
    // própria; admin sem escolha vê todas.
    const unitFilter = context.isAdmin ? data.unitId : context.unitId;
    const supabase: any = context.supabase;

    let query = supabase
      .from("credit_cards")
      .select(
        "id, account_id, name, last_digits, closing_day, due_day, archived_at, unit_id, financial_accounts(name)",
      )
      .eq("owner_id", context.ownerId)
      .order("name");
    if (unitFilter) query = query.eq("unit_id", unitFilter);
    if (!data.incluirArquivados) query = query.is("archived_at", null);

    const { data: rows, error } = await query;
    if (error) {
      if (tabelaDeCartaoAusente(error)) return [];
      throw error;
    }

    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      accountId: r.account_id ?? null,
      accountName: r.financial_accounts?.name ?? null,
      name: r.name,
      lastDigits: r.last_digits ?? null,
      closingDay: r.closing_day,
      dueDay: r.due_day,
      archivedAt: r.archived_at ?? null,
      unitId: r.unit_id,
    }));
  });

export const createCard = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      accountId: string;
      name: string;
      lastDigits?: string | null;
      closingDay: number;
      dueDay: number;
      unitId?: string;
    }) => {
      if (!input.accountId) throw new Error("Escolha a conta que paga a fatura.");
      return {
        accountId: input.accountId,
        name: validarNome(input.name),
        lastDigits: validarDigitos(input.lastDigits),
        closingDay: validarDia(input.closingDay, "O dia de fechamento"),
        dueDay: validarDia(input.dueDay, "O dia de vencimento"),
        unitId: input.unitId,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const unitId = await resolveUnitId(context, data.unitId);

    // A conta tem que ser desta clínica E desta unidade. Sem esta conferência
    // um cartão da unidade A poderia ser pago por conta da unidade B, e o
    // dinheiro andaria entre unidades sem ninguém ver.
    const { data: conta } = await supabase
      .from("financial_accounts")
      .select("id, unit_id")
      .eq("id", data.accountId)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!conta) throw new Error("Conta não encontrada.");
    if (conta.unit_id !== unitId) throw new Error("A conta é de outra unidade.");

    const { data: row, error } = await supabase
      .from("credit_cards")
      .insert({
        owner_id: context.ownerId,
        unit_id: unitId,
        account_id: data.accountId,
        name: data.name,
        last_digits: data.lastDigits,
        closing_day: data.closingDay,
        due_day: data.dueDay,
      })
      .select("id")
      .single();
    if (error) throw traduzirErroDeCartao(error);
    return { id: row.id as string };
  });

export const updateCard = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      id: string;
      accountId: string;
      name: string;
      lastDigits?: string | null;
      closingDay: number;
      dueDay: number;
    }) => {
      if (!input.id) throw new Error("Cartão inválido.");
      if (!input.accountId) throw new Error("Escolha a conta que paga a fatura.");
      return {
        id: input.id,
        accountId: input.accountId,
        name: validarNome(input.name),
        lastDigits: validarDigitos(input.lastDigits),
        closingDay: validarDia(input.closingDay, "O dia de fechamento"),
        dueDay: validarDia(input.dueDay, "O dia de vencimento"),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;

    const { error } = await supabase
      .from("credit_cards")
      .update({
        account_id: data.accountId,
        name: data.name,
        last_digits: data.lastDigits,
        closing_day: data.closingDay,
        due_day: data.dueDay,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw traduzirErroDeCartao(error);

    // Mudar os dias vale só para compras FUTURAS: as faturas já criadas
    // guardam as próprias datas e não se mexem. Quem chama avisa isso na tela,
    // senão parece que o sistema ignorou a mudança.
    return { ok: true };
  });

export const archiveCard = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string; arquivar?: boolean }) => {
    if (!input.id) throw new Error("Cartão inválido.");
    return { id: input.id, arquivar: input.arquivar !== false };
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;

    // Arquivar, nunca apagar: apagar levaria junto as faturas já pagas, e
    // despesa real sumiria do histórico — o fluxo de caixa do passado mudaria.
    if (data.arquivar) {
      const { data: pendentes } = await supabase
        .from("card_invoices")
        .select("id, due_date, financial_transactions!settles_card_invoice_id(status)")
        .eq("card_id", data.id)
        .eq("owner_id", context.ownerId);

      const emAberto = ((pendentes ?? []) as any[]).filter((f) =>
        (f.financial_transactions ?? []).some((t: any) => t.status !== "paid"),
      );
      if (emAberto.length > 0) {
        throw new Error(
          `Este cartão ainda tem ${emAberto.length} fatura(s) não paga(s). Pague ou cancele antes de arquivar.`,
        );
      }
    }

    const { error } = await supabase
      .from("credit_cards")
      .update({
        archived_at: data.arquivar ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw traduzirErroDeCartao(error);
    return { ok: true };
  });

export const deleteCard = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Cartão inválido.");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;

    // Apagar de verdade só um cartão que nunca teve fatura. Com fatura, o
    // caminho é arquivar — apagar reescreveria o passado.
    const { count } = await supabase
      .from("card_invoices")
      .select("id", { count: "exact", head: true })
      .eq("card_id", data.id)
      .eq("owner_id", context.ownerId);

    if ((count ?? 0) > 0) {
      throw new Error(
        "Este cartão já tem faturas e não pode ser excluído. Arquive-o: ele some dos lançamentos e o histórico fica de pé.",
      );
    }

    const { error } = await supabase
      .from("credit_cards")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw traduzirErroDeCartao(error);
    return { ok: true };
  });
