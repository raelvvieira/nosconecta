/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { exigeEstoque } from "@/lib/auth/area.middleware";
import { resolveUnitId } from "@/lib/auth/resolve-unit";
import { clinicTodayStr } from "@/lib/date";
import {
  comprasNoPeriodo,
  consumoMedio,
  custoPorUnidade,
  diasRestantes,
  emUnidades,
  leituraDoEstoque,
  resumoDoEstoque,
  rotuloDoSaldo,
  ultimaCompra,
  type MovimentoDoEstoque,
  type ResumoDoEstoque,
  type SituacaoDoEstoque,
  type TipoDeMovimento,
  type UltimaCompra,
} from "@/lib/estoque/estoque";

// O estoque. Toda consulta filtra por `owner_id` (nunca confiar só na regra do
// banco) e, quando a pessoa está presa a uma unidade, também por ela.
//
// O saldo NUNCA é gravado à mão: cada função aqui só cria movimentos, e o banco
// soma (gatilho `estoque_aplicar_movimento`). Errou? Lança um ajuste.

const LIMITE_DE_NOME = 120;
const LIMITE_DE_TEXTO = 400;

export interface ItemDoEstoque {
  id: string;
  nome: string;
  categoria: string | null;
  rotuloUnidade: string;
  rotuloEmbalagem: string;
  unidadesPorEmbalagem: number;
  minimoUnidades: number;
  observacoes: string | null;
  /** Saldo em unidades (na unidade escolhida, ou somando todas). */
  saldo: number;
  /** "3 caixas + 12 unidades". */
  saldoEmTexto: string;
  consumoPorDia: number | null;
  diasObservados: number;
  diasRestantes: number | null;
  situacao: SituacaoDoEstoque;
  /** 0 a 1: o quanto a barra está cheia. */
  nivel: number;
  cor: string;
  compra: UltimaCompra | null;
  /** Saldo de cada unidade da clínica, para quem vê todas. */
  porUnidade: { unitId: string; saldo: number }[];
}

export interface PainelDoEstoque {
  unidades: { id: string; nome: string }[];
  /** A unidade em foco; `null` = todas somadas (só o administrador). */
  unidadeAtual: string | null;
  podeEscolherUnidade: boolean;
  itens: ItemDoEstoque[];
  resumo: ResumoDoEstoque;
  comprasDoMes: number;
  categorias: string[];
}

const texto = (v: unknown, max: number): string =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const positivo = (v: unknown, nome: string, max = 1_000_000): number => {
  const n = numero(v);
  if (n < 0 || n > max) throw new Error(`${nome} inválido.`);
  return n;
};

async function lerTodasAsLinhas(consulta: (de: number, ate: number) => any): Promise<any[]> {
  const saida: any[] = [];
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await consulta(pagina * 1000, (pagina + 1) * 1000 - 1);
    if (error) throw new Error(error.message);
    saida.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return saida;
}

export const getEstoque = createServerFn({ method: "GET" })
  .middleware([exigeEstoque])
  .inputValidator((input: { unitId?: string | null } | undefined) => ({
    unitId: input?.unitId || null,
  }))
  .handler(async ({ data, context }): Promise<PainelDoEstoque> => {
    const supabase: any = context.supabase;
    const hoje = clinicTodayStr();

    const { data: us, error: erroUnidades } = await supabase
      .from("clinic_units")
      .select("id, name")
      .eq("owner_id", context.ownerId)
      .eq("active", true)
      .order("name");
    if (erroUnidades) throw new Error(erroUnidades.message);
    let unidades = ((us ?? []) as { id: string; name: string }[]).map((u) => ({
      id: String(u.id),
      nome: String(u.name ?? "").trim(),
    }));

    // Quem está preso a uma unidade só enxerga a dele.
    const podeEscolherUnidade = Boolean(context.isAdmin) && unidades.length > 1;
    let unidadeAtual: string | null = null;
    if (!context.isAdmin) {
      unidadeAtual = context.unitId ?? null;
      unidades = unidades.filter((u) => u.id === unidadeAtual);
    } else if (data.unitId && unidades.some((u) => u.id === data.unitId)) {
      unidadeAtual = data.unitId;
    } else if (unidades.length === 1) {
      unidadeAtual = unidades[0].id;
    }

    const { data: itensBrutos, error: erroItens } = await supabase
      .from("estoque_itens")
      .select(
        "id, nome, categoria, rotulo_unidade, rotulo_embalagem, unidades_por_embalagem, minimo_unidades, observacoes",
      )
      .eq("owner_id", context.ownerId)
      .eq("ativo", true)
      .order("nome");
    if (erroItens) throw new Error(erroItens.message);

    let consultaSaldos = supabase
      .from("estoque_saldos")
      .select("item_id, unit_id, quantidade")
      .eq("owner_id", context.ownerId);
    if (unidadeAtual) consultaSaldos = consultaSaldos.eq("unit_id", unidadeAtual);
    const { data: saldosBrutos, error: erroSaldos } = await consultaSaldos;
    if (erroSaldos) throw new Error(erroSaldos.message);

    const desde = new Date(Date.now() - 400 * 86_400_000).toISOString();
    const movimentosBrutos = await lerTodasAsLinhas((de, ate) => {
      let q = supabase
        .from("estoque_movimentos")
        .select("item_id, unit_id, tipo, quantidade, custo_total, custo_unitario, ocorreu_em")
        .eq("owner_id", context.ownerId)
        .gte("ocorreu_em", desde)
        .order("ocorreu_em", { ascending: true })
        .range(de, ate);
      if (unidadeAtual) q = q.eq("unit_id", unidadeAtual);
      return q;
    });

    const saldoPorItem = new Map<string, number>();
    const porUnidadePorItem = new Map<string, { unitId: string; saldo: number }[]>();
    for (const s of (saldosBrutos ?? []) as {
      item_id: string;
      unit_id: string;
      quantidade: number;
    }[]) {
      const id = String(s.item_id);
      saldoPorItem.set(id, (saldoPorItem.get(id) ?? 0) + numero(s.quantidade));
      const lista = porUnidadePorItem.get(id) ?? [];
      lista.push({ unitId: String(s.unit_id), saldo: numero(s.quantidade) });
      porUnidadePorItem.set(id, lista);
    }

    const movimentosPorItem = new Map<string, MovimentoDoEstoque[]>();
    const todos: MovimentoDoEstoque[] = [];
    for (const m of movimentosBrutos) {
      const mov: MovimentoDoEstoque = {
        tipo: m.tipo as TipoDeMovimento,
        quantidade: numero(m.quantidade),
        custoTotal: m.custo_total == null ? null : numero(m.custo_total),
        custoUnitario: m.custo_unitario == null ? null : numero(m.custo_unitario),
        dia: clinicTodayStr(new Date(m.ocorreu_em)),
      };
      const id = String(m.item_id);
      const lista = movimentosPorItem.get(id) ?? [];
      lista.push(mov);
      movimentosPorItem.set(id, lista);
      todos.push(mov);
    }

    const itens: ItemDoEstoque[] = ((itensBrutos ?? []) as Record<string, unknown>[]).map((i) => {
      const id = String(i.id);
      const porEmbalagem = numero(i.unidades_por_embalagem) || 1;
      const minimo = numero(i.minimo_unidades);
      const movs = movimentosPorItem.get(id) ?? [];
      const saldo = saldoPorItem.get(id) ?? 0;
      const consumo = consumoMedio(movs, hoje);
      const dias = diasRestantes(saldo, consumo.porDia);
      const maiorEntrada = movs
        .filter((m) => m.tipo === "entrada")
        .reduce((mx, m) => Math.max(mx, m.quantidade), 0);
      const leitura = leituraDoEstoque({ saldo, minimo, dias, referencia: maiorEntrada });
      return {
        id,
        nome: String(i.nome),
        categoria: (i.categoria as string | null) ?? null,
        rotuloUnidade: String(i.rotulo_unidade ?? "unidade"),
        rotuloEmbalagem: String(i.rotulo_embalagem ?? "caixa"),
        unidadesPorEmbalagem: porEmbalagem,
        minimoUnidades: minimo,
        observacoes: (i.observacoes as string | null) ?? null,
        saldo,
        saldoEmTexto: rotuloDoSaldo(
          saldo,
          porEmbalagem,
          String(i.rotulo_embalagem ?? "caixa"),
          String(i.rotulo_unidade ?? "unidade"),
        ),
        consumoPorDia: consumo.porDia,
        diasObservados: consumo.diasObservados,
        diasRestantes: dias,
        situacao: leitura.situacao,
        nivel: leitura.nivel,
        cor: leitura.cor,
        compra: ultimaCompra(movs, porEmbalagem),
        porUnidade: porUnidadePorItem.get(id) ?? [],
      };
    });

    const mes = hoje.slice(0, 7);
    return {
      unidades,
      unidadeAtual,
      podeEscolherUnidade,
      itens,
      resumo: resumoDoEstoque(
        itens.map((i) => ({
          saldo: i.saldo,
          situacao: i.situacao,
          custoUnitario: i.compra?.custoUnitario ?? null,
        })),
      ),
      comprasDoMes: comprasNoPeriodo(todos, `${mes}-01`, `${mes}-31`),
      categorias: [
        ...new Set(itens.map((i) => i.categoria).filter((c): c is string => !!c)),
      ].sort(),
    };
  });

// ── Cadastro ───────────────────────────────────────────────────────────────

interface DadosDoItem {
  nome: string;
  categoria: string | null;
  rotuloUnidade: string;
  rotuloEmbalagem: string;
  unidadesPorEmbalagem: number;
  minimoUnidades: number;
  observacoes: string | null;
}

function validarItem(input: Partial<DadosDoItem> | undefined): DadosDoItem {
  const nome = texto(input?.nome, LIMITE_DE_NOME);
  if (!nome) throw new Error("Dê um nome ao item.");
  const por = numero(input?.unidadesPorEmbalagem ?? 1);
  if (!(por > 0) || por > 1_000_000) throw new Error("Informe quantas unidades vêm em cada caixa.");
  return {
    nome,
    categoria: texto(input?.categoria, 60) || null,
    rotuloUnidade: texto(input?.rotuloUnidade, 30) || "unidade",
    rotuloEmbalagem: texto(input?.rotuloEmbalagem, 30) || "caixa",
    unidadesPorEmbalagem: por,
    minimoUnidades: positivo(input?.minimoUnidades ?? 0, "Mínimo"),
    observacoes: texto(input?.observacoes, LIMITE_DE_TEXTO) || null,
  };
}

const colunasDoItem = (d: DadosDoItem) => ({
  nome: d.nome,
  categoria: d.categoria,
  rotulo_unidade: d.rotuloUnidade,
  rotulo_embalagem: d.rotuloEmbalagem,
  unidades_por_embalagem: d.unidadesPorEmbalagem,
  minimo_unidades: d.minimoUnidades,
  observacoes: d.observacoes,
});

function erroDeNomeRepetido(error: { code?: string; message?: string }): Error {
  return error.code === "23505"
    ? new Error("Já existe um item com esse nome.")
    : new Error(error.message ?? "Não foi possível salvar o item.");
}

export const criarItemDeEstoque = createServerFn({ method: "POST" })
  .middleware([exigeEstoque])
  .inputValidator((input: Partial<DadosDoItem>) => validarItem(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const { data: criado, error } = await supabase
      .from("estoque_itens")
      .insert({ owner_id: context.ownerId, ...colunasDoItem(data) })
      .select("id")
      .single();
    if (error) throw erroDeNomeRepetido(error);
    return { id: String(criado.id) };
  });

export const atualizarItemDeEstoque = createServerFn({ method: "POST" })
  .middleware([exigeEstoque])
  .inputValidator((input: Partial<DadosDoItem> & { id: string; arquivar?: boolean }) => {
    if (!input?.id) throw new Error("Item inválido.");
    return { id: String(input.id), arquivar: input.arquivar === true, dados: validarItem(input) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("estoque_itens")
      .update({
        ...colunasDoItem(data.dados),
        ...(data.arquivar ? { ativo: false } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw erroDeNomeRepetido(error);
    return { ok: true };
  });

// ── Movimentos ─────────────────────────────────────────────────────────────

/** O item e a unidade são desta clínica, e a unidade é uma que a pessoa pode usar. */
async function conferirItemEUnidade(
  context: any,
  itemId: string,
  unitIdPedida: string | null,
): Promise<{ unitId: string; porEmbalagem: number; nome: string }> {
  const unitId = await resolveUnitId(context, unitIdPedida);
  const { data: item, error } = await context.supabase
    .from("estoque_itens")
    .select("id, nome, unidades_por_embalagem, ativo")
    .eq("id", itemId)
    .eq("owner_id", context.ownerId)
    .maybeSingle();
  if (error || !item || !item.ativo) throw new Error("Item não encontrado.");
  const { data: unidade } = await context.supabase
    .from("clinic_units")
    .select("id")
    .eq("id", unitId)
    .eq("owner_id", context.ownerId)
    .maybeSingle();
  if (!unidade) throw new Error("Unidade inválida.");
  return {
    unitId,
    porEmbalagem: numero(item.unidades_por_embalagem) || 1,
    nome: String(item.nome),
  };
}

async function saldoAtual(context: any, itemId: string, unitId: string): Promise<number> {
  const { data } = await context.supabase
    .from("estoque_saldos")
    .select("quantidade")
    .eq("owner_id", context.ownerId)
    .eq("item_id", itemId)
    .eq("unit_id", unitId)
    .maybeSingle();
  return numero(data?.quantidade);
}

async function gravarMovimento(context: any, linha: Record<string, unknown>): Promise<void> {
  const { error } = await context.supabase
    .from("estoque_movimentos")
    .insert({ owner_id: context.ownerId, criado_por: context.userId ?? null, ...linha });
  if (error) throw new Error(error.message);
}

interface QuantidadeEmCaixas {
  itemId: string;
  unitId?: string | null;
  caixas?: number;
  avulsas?: number;
}

export const registrarEntradaDeEstoque = createServerFn({ method: "POST" })
  .middleware([exigeEstoque])
  .inputValidator(
    (
      input: QuantidadeEmCaixas & {
        /** O total pago por esta entrada, ou o preço de cada caixa. Um dos dois. */
        custoTotal?: number | null;
        custoPorEmbalagem?: number | null;
        fornecedor?: string | null;
      },
    ) => {
      if (!input?.itemId) throw new Error("Escolha o item.");
      return {
        itemId: String(input.itemId),
        unitId: input.unitId || null,
        caixas: positivo(input.caixas ?? 0, "Caixas", 100_000),
        avulsas: positivo(input.avulsas ?? 0, "Unidades", 10_000_000),
        custoTotal:
          input.custoTotal == null ? null : positivo(input.custoTotal, "Valor", 100_000_000),
        custoPorEmbalagem:
          input.custoPorEmbalagem == null
            ? null
            : positivo(input.custoPorEmbalagem, "Valor da caixa", 100_000_000),
        fornecedor: texto(input.fornecedor, 80) || null,
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true; unidades: number }> => {
    const { unitId, porEmbalagem } = await conferirItemEUnidade(context, data.itemId, data.unitId);
    const unidades = emUnidades(data.caixas, data.avulsas, porEmbalagem);
    if (!(unidades > 0)) throw new Error("Informe a quantidade que entrou.");
    // O preço pode vir pelo total pago ou pelo valor de cada caixa.
    let custoTotal = data.custoTotal;
    if (custoTotal == null && data.custoPorEmbalagem != null) {
      custoTotal = Math.round((unidades / porEmbalagem) * data.custoPorEmbalagem * 100) / 100;
    }
    await gravarMovimento(context, {
      item_id: data.itemId,
      unit_id: unitId,
      tipo: "entrada",
      quantidade: unidades,
      custo_total: custoTotal,
      custo_unitario: custoTotal == null ? null : custoPorUnidade(custoTotal, unidades),
      fornecedor: data.fornecedor,
    });
    return { ok: true, unidades };
  });

export const registrarSaidaDeEstoque = createServerFn({ method: "POST" })
  .middleware([exigeEstoque])
  .inputValidator(
    (input: QuantidadeEmCaixas & { tipo?: "saida" | "perda"; motivo?: string | null }) => {
      if (!input?.itemId) throw new Error("Escolha o item.");
      return {
        itemId: String(input.itemId),
        unitId: input.unitId || null,
        caixas: positivo(input.caixas ?? 0, "Caixas", 100_000),
        avulsas: positivo(input.avulsas ?? 0, "Unidades", 10_000_000),
        tipo: input.tipo === "perda" ? ("perda" as const) : ("saida" as const),
        motivo: texto(input.motivo, LIMITE_DE_TEXTO) || null,
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true; unidades: number }> => {
    const { unitId, porEmbalagem, nome } = await conferirItemEUnidade(
      context,
      data.itemId,
      data.unitId,
    );
    const unidades = emUnidades(data.caixas, data.avulsas, porEmbalagem);
    if (!(unidades > 0)) throw new Error("Informe a quantidade que saiu.");
    // Dar baixa em mais do que existe é quase sempre engano de digitação. A
    // exceção é o ajuste, que corrige o saldo para a contagem real.
    const saldo = await saldoAtual(context, data.itemId, unitId);
    if (unidades > saldo + 1e-9) {
      throw new Error(
        `Só há ${rotuloDoSaldo(saldo, porEmbalagem)} de ${nome} nesta unidade. Para corrigir o saldo, use "Ajustar".`,
      );
    }
    await gravarMovimento(context, {
      item_id: data.itemId,
      unit_id: unitId,
      tipo: data.tipo,
      quantidade: -unidades,
      motivo: data.motivo,
    });
    return { ok: true, unidades };
  });

/** A contagem física: informa o que há de verdade, e o sistema lança a diferença. */
export const ajustarSaldoDeEstoque = createServerFn({ method: "POST" })
  .middleware([exigeEstoque])
  .inputValidator((input: QuantidadeEmCaixas & { motivo?: string | null }) => {
    if (!input?.itemId) throw new Error("Escolha o item.");
    return {
      itemId: String(input.itemId),
      unitId: input.unitId || null,
      caixas: positivo(input.caixas ?? 0, "Caixas", 100_000),
      avulsas: positivo(input.avulsas ?? 0, "Unidades", 10_000_000),
      motivo: texto(input.motivo, LIMITE_DE_TEXTO) || "Contagem do estoque",
    };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; diferenca: number }> => {
    const { unitId, porEmbalagem } = await conferirItemEUnidade(context, data.itemId, data.unitId);
    const contado = emUnidades(data.caixas, data.avulsas, porEmbalagem);
    const saldo = await saldoAtual(context, data.itemId, unitId);
    const diferenca = Math.round((contado - saldo) * 1000) / 1000;
    if (diferenca === 0) return { ok: true, diferenca: 0 };
    await gravarMovimento(context, {
      item_id: data.itemId,
      unit_id: unitId,
      tipo: "ajuste",
      quantidade: diferenca,
      motivo: data.motivo,
    });
    return { ok: true, diferenca };
  });
