import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { resolveUnitId } from "@/lib/auth/resolve-unit";
import { tabelaDeCartaoAusente } from "./schema-cartao";

type AccountType = "bank" | "cash" | "pix" | "credit";

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { unitId?: string } | undefined) => ({ unitId: input?.unitId ?? null }))
  .handler(async ({ data, context }) => {
    // Conta bancária é por unidade — não-admin nunca escolhe, sempre a
    // própria; admin sem escolha nenhuma vê todas.
    const unitFilter = context.isAdmin ? data.unitId : context.unitId;
    // types.ts ainda não conhece unit_id (Lovable regenera depois da
    // migration) — mesmo escape que patients.functions.ts já usa.
    const supabase: any = context.supabase;
    let query = supabase
      .from("financial_accounts")
      .select("id, name, type, last_digits, unit_id, current_balance")
      .eq("owner_id", context.ownerId)
      .order("name");
    if (unitFilter) query = query.eq("unit_id", unitFilter);
    const { data: rows, error } = await query;
    if (error) throw error;
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      type: String(r.type),
      last_digits: (r.last_digits as string | null) ?? null,
      unit_id: String(r.unit_id),
      // `null` e 0 chegam diferentes do banco e significam coisas diferentes:
      // conta nunca informada contra conta zerada de verdade. Quem decide o
      // que mostrar é a tela; aqui os dois sobrevivem.
      current_balance: r.current_balance === null ? null : Number(r.current_balance),
    }));
  });

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: { name: string; type?: AccountType; last_digits?: string | null; unitId?: string }) => {
      const name = input.name?.trim();
      if (!name) throw new Error("Informe o nome da conta");
      if (name.length > 60) throw new Error("Nome muito longo (máx. 60)");
      const type: AccountType =
        input.type && ["bank", "cash", "pix", "credit"].includes(input.type) ? input.type : "bank";
      return { name, type, last_digits: input.last_digits?.trim() || null, unitId: input.unitId };
    },
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const unitId = await resolveUnitId(context, data.unitId);

    const { data: existing } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("owner_id", context.ownerId)
      .eq("unit_id", unitId)
      .ilike("name", data.name)
      .maybeSingle();
    if (existing) throw new Error("Já existe uma conta com esse nome nesta unidade");

    const { data: row, error } = await supabase
      .from("financial_accounts")
      .insert({
        owner_id: context.ownerId,
        unit_id: unitId,
        name: data.name,
        type: data.type,
        last_digits: data.last_digits,
      })
      .select("id, name, type")
      .single();
    if (error) throw error;
    return row as { id: string; name: string; type: string };
  });

export const updateAccount = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: { id: string; name: string; type?: AccountType; last_digits?: string | null }) => {
      if (!input.id) throw new Error("Conta inválida");
      const name = input.name?.trim();
      if (!name) throw new Error("Informe o nome da conta");
      if (name.length > 60) throw new Error("Nome muito longo (máx. 60)");
      const type: AccountType =
        input.type && ["bank", "cash", "pix", "credit"].includes(input.type) ? input.type : "bank";
      return { id: input.id, name, type, last_digits: input.last_digits?.trim() || null };
    },
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;

    // Mesmo cuidado da criação: dois nomes iguais na mesma unidade tornam o
    // seletor de conta impossível de usar.
    const { data: atual } = await supabase
      .from("financial_accounts")
      .select("unit_id")
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!atual) throw new Error("Conta não encontrada");

    const { data: existing } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("owner_id", context.ownerId)
      .eq("unit_id", atual.unit_id)
      .ilike("name", data.name)
      .neq("id", data.id)
      .maybeSingle();
    if (existing) throw new Error("Já existe uma conta com esse nome nesta unidade");

    const { error } = await supabase
      .from("financial_accounts")
      .update({ name: data.name, type: data.type, last_digits: data.last_digits })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw error;
    return { ok: true };
  });

/**
 * O saldo de uma conta.
 *
 * ── Por que isto não existia ────────────────────────────────────────────
 *
 * `financial_accounts.current_balance` era lido em cinco lugares do app — o
 * cartão de contas, o total disponível do painel, o Saldo Atual do
 * Planejamento e as duas projeções de 30 e 90 dias — e escrito em NENHUM. Não
 * havia tela, campo nem função para informá-lo. Por isso as cinco contas da
 * clínica estavam todas em R$ 0,00: não é que ninguém preencheu, é que não
 * havia como.
 *
 * E como o Planejamento inteiro parte desse número, as três projeções dele
 * eram calculadas em cima de um zero que ninguém escolheu.
 *
 * ── Por que é um lançamento manual, e não um cálculo ────────────────────
 *
 * O saldo de verdade está no banco, e o sistema não tem integração bancária.
 * Somar os lançamentos também não daria: o financeiro começou em agosto e o
 * dinheiro é anterior a ele. Então alguém informa o que o extrato mostra, e a
 * data em que olhou fica registrada — é ela que diz se o número ainda vale.
 */
export const setAccountBalance = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string; balance: number }) => {
    if (!input.id) throw new Error("Conta inválida");
    const balance = Number(input.balance);
    if (!Number.isFinite(balance)) throw new Error("Informe um saldo válido");
    // Negativo é permitido: conta no cheque especial existe, e recusá-la
    // obrigaria a informar um número falso.
    if (Math.abs(balance) > 99_999_999) throw new Error("Saldo fora do limite");
    return { id: input.id, balance: Math.round(balance * 100) / 100 };
  })
  .handler(async ({ data, context }) => {
    // Sem o escape de `any` que o resto deste arquivo usa: ali ele existe
    // porque `types.ts` ainda não conhece `unit_id`, e `current_balance` ele
    // conhece.
    const { error } = await context.supabase
      .from("financial_accounts")
      .update({ current_balance: data.balance, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Conta inválida");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;

    // Conta que paga cartão não se apaga por baixo dele. `credit_cards.account_id`
    // é `ON DELETE SET NULL`, então o banco deixaria passar — e o cartão ficaria
    // sem quem pague a fatura, em silêncio.
    const { data: cartoes, error: erroCartoes } = await supabase
      .from("credit_cards")
      .select("name")
      .eq("owner_id", context.ownerId)
      .eq("account_id", data.id)
      .is("archived_at", null);
    // Migration ainda não aplicada: não há cartão nenhum para proteger.
    if (erroCartoes && !tabelaDeCartaoAusente(erroCartoes)) throw erroCartoes;
    if ((cartoes ?? []).length > 0) {
      const nomes = (cartoes as any[]).map((c) => c.name).join(", ");
      throw new Error(
        `Esta conta paga o cartão ${nomes}. Aponte o cartão para outra conta (ou arquive-o) antes de excluir.`,
      );
    }

    // Desvincula transações que usam a conta antes de remover (evita erro de FK).
    //
    // O `unit_id` aqui não é zelo: sem ele o update varria as transações de
    // TODAS as unidades do dono, e apagar uma conta de Florianópolis
    // desvincularia lançamentos de Porto Alegre.
    let desvincular = supabase
      .from("financial_transactions")
      .update({ account_id: null })
      .eq("owner_id", context.ownerId)
      .eq("account_id", data.id);
    if (context.unitId) desvincular = desvincular.eq("unit_id", context.unitId);
    await desvincular;

    const { error } = await supabase
      .from("financial_accounts")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw error;
    return { ok: true };
  });
