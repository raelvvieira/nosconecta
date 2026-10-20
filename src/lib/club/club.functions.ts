/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { exigeArea } from "@/lib/auth/area.middleware";
import {
  niveisAPagar,
  reguaOrdenada,
  saldoDoExtrato,
  situacaoNoClub,
  type NivelDoClub,
} from "@/lib/club/niveis-do-club";

/**
 * O NÓS Club no servidor.
 *
 * ── O que NÃO existe aqui ─────────────────────────────────────────────────
 *
 * Nenhuma função de "validar indicação". A indicação se confirma sozinha
 * quando o agendamento do indicado é concluído — ver `confirmarPeloAtendimento`
 * logo abaixo e a chamada dela em `agenda.functions.ts`. A clínica já conclui
 * atendimento; pedir um segundo clique para dizer a mesma coisa é como se
 * perde um programa de indicação.
 *
 * Nenhum campo de saldo, e nenhum de nível. Os dois são calculados: o nível,
 * das indicações confirmadas; o saldo, da soma do extrato. Ver
 * `niveis-do-club.ts`.
 */

const exigeClub = exigeArea("club");

export interface IndicacaoNaTela {
  id: string;
  indicadoNome: string;
  indicadoId: string | null;
  status: "pendente" | "confirmada" | "cancelada";
  criadaEm: string;
  confirmadaEm: string | null;
}

export interface LancamentoNaTela {
  id: string;
  valor: number;
  tipo: "nivel" | "boas_vindas" | "uso" | "ajuste";
  descricao: string;
  criadoEm: string;
}

export interface MembroDoClub {
  patientId: string;
  nome: string;
  participa: boolean;
  desde: string | null;
  nivelNome: string | null;
  proximoNome: string | null;
  confirmadas: number;
  pendentes: number;
  faltam: number;
  progresso: number;
  saldo: number;
  liberado: number;
  usado: number;
  indicacoes: IndicacaoNaTela[];
  extrato: LancamentoNaTela[];
  regua: NivelDoClub[];
}

export interface ConfigDoClub {
  creditoPorIndicacao: number;
  creditoBoasVindas: number;
  /** O endereço que vai impresso no QR Code do cartão. Vazio = o endereço por
   *  onde o sistema foi aberto, que é a armadilha que esta coluna fecha. */
  linkDoCartao: string;
}

/** Os valores em dinheiro que não são de nível. Ausentes (tabela ainda não
 *  criada, linha não semeada) caem nos R$ 100 que a clínica definiu — o mesmo
 *  padrão da coluna. */
async function lerConfig(supabase: any, ownerId: string): Promise<ConfigDoClub> {
  try {
    const { data } = await supabase
      .from("club_config")
      .select("credito_por_indicacao, credito_boas_vindas, link_do_cartao")
      .eq("owner_id", ownerId)
      .maybeSingle();
    return {
      creditoPorIndicacao: Number(data?.credito_por_indicacao ?? 100),
      creditoBoasVindas: Number(data?.credito_boas_vindas ?? 100),
      linkDoCartao: String(data?.link_do_cartao ?? "").trim(),
    };
  } catch {
    return { creditoPorIndicacao: 100, creditoBoasVindas: 100, linkDoCartao: "" };
  }
}

async function lerRegua(supabase: any, ownerId: string): Promise<NivelDoClub[]> {
  const { data, error } = await supabase
    .from("club_niveis")
    .select("id, nome, indicacoes, credito, ativo")
    .eq("owner_id", ownerId)
    .eq("ativo", true);
  if (error) throw new Error(error.message);
  return reguaOrdenada(
    ((data ?? []) as any[]).map((n) => ({
      id: String(n.id),
      nome: String(n.nome),
      indicacoes: Number(n.indicacoes),
      credito: Number(n.credito ?? 0),
    })),
  );
}

/**
 * Confirma a indicação que este atendimento validava, e paga o que ela
 * desbloqueou.
 *
 * Não é server function de propósito: quem chama é `onStatusTransition`, no
 * meio da conclusão de um atendimento que já aconteceu no mundo real. Por isso
 * também não levanta — uma falha aqui vira log, nunca desfaz a conclusão. É a
 * mesma escolha que o recebimento e a conversão da Meta já fazem ali.
 */
export async function confirmarPeloAtendimento(
  supabase: any,
  ownerId: string,
  appointmentId: string,
): Promise<{ confirmou: boolean; niveis: string[] }> {
  try {
    const { data: indicacao } = await supabase
      .from("club_indicacoes")
      .select("id, indicador_id")
      .eq("owner_id", ownerId)
      .eq("appointment_id", appointmentId)
      .eq("status", "pendente")
      .maybeSingle();
    if (!indicacao?.id) return { confirmou: false, niveis: [] };

    const agora = new Date().toISOString();
    const { error } = await supabase
      .from("club_indicacoes")
      .update({ status: "confirmada", confirmada_em: agora, updated_at: agora })
      .eq("id", indicacao.id)
      .eq("owner_id", ownerId)
      // Só sai de pendente: duas conclusões do mesmo atendimento (status que
      // vai, volta e vai) não podem confirmar duas vezes.
      .eq("status", "pendente");
    if (error) throw error;

    await pagarPelaIndicacao(supabase, ownerId, String(indicacao.indicador_id), indicacao.id);
    const niveis = await liberarCreditoDeNivel(supabase, ownerId, String(indicacao.indicador_id));
    return { confirmou: true, niveis };
  } catch (e) {
    console.error("[club] indicação não confirmou", e);
    return { confirmou: false, niveis: [] };
  }
}

/** Cancela a indicação presa a um atendimento que foi cancelado. O crédito já
 *  pago NÃO volta: ele foi comunicado à paciente, e tirar crédito de alguém
 *  por um cancelamento de agenda é o tipo de coisa que acaba com um programa
 *  de relacionamento. */
export async function cancelarPeloAtendimento(
  supabase: any,
  ownerId: string,
  appointmentId: string,
): Promise<void> {
  try {
    await supabase
      .from("club_indicacoes")
      .update({ status: "cancelada", updated_at: new Date().toISOString() })
      .eq("owner_id", ownerId)
      .eq("appointment_id", appointmentId)
      .eq("status", "pendente");
  } catch (e) {
    console.error("[club] indicação não cancelou", e);
  }
}

/**
 * O crédito de cada indicação confirmada.
 *
 * Separado do crédito de nível porque são duas coisas: este entra TODA vez que
 * alguém indicado comparece; aquele, uma vez por nível alcançado.
 *
 * A trava contra pagar duas vezes é o índice único sobre `indicacao_id` — a
 * indicação que vai e volta de confirmada (correção de engano, atendimento
 * reaberto) não pode render de novo. Por isso o erro do insert é ignorado em
 * silêncio: ele é o índice funcionando.
 */
async function pagarPelaIndicacao(
  supabase: any,
  ownerId: string,
  patientId: string,
  indicacaoId: string,
): Promise<void> {
  try {
    const { creditoPorIndicacao } = await lerConfig(supabase, ownerId);
    if (creditoPorIndicacao <= 0) return;
    await supabase.from("club_creditos").insert({
      owner_id: ownerId,
      patient_id: patientId,
      valor: creditoPorIndicacao,
      tipo: "indicacao",
      indicacao_id: indicacaoId,
      descricao: "Indicação confirmada",
    });
  } catch (e) {
    console.error("[club] crédito da indicação", e);
  }
}

/**
 * Paga os níveis que a pessoa alcançou e ainda não receberam crédito.
 *
 * A trava contra pagar duas vezes é o índice único do extrato
 * (`club_creditos_um_por_nivel`), e não esta conta: duas confirmações no mesmo
 * segundo leem o mesmo "já pagos" e tentariam lançar as duas. A segunda bate
 * no índice e é ignorada aqui — por isso o insert vai um a um.
 */
async function liberarCreditoDeNivel(
  supabase: any,
  ownerId: string,
  patientId: string,
): Promise<string[]> {
  const regua = await lerRegua(supabase, ownerId);
  if (!regua.length) return [];

  const { count } = await supabase
    .from("club_indicacoes")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("indicador_id", patientId)
    .eq("status", "confirmada");

  const { data: pagos } = await supabase
    .from("club_creditos")
    .select("nivel_id")
    .eq("owner_id", ownerId)
    .eq("patient_id", patientId)
    .eq("tipo", "nivel");

  const aPagar = niveisAPagar(
    count ?? 0,
    regua,
    ((pagos ?? []) as any[]).map((p) => String(p.nivel_id ?? "")),
  );

  const pagou: string[] = [];
  for (const nivel of aPagar) {
    const { error } = await supabase.from("club_creditos").insert({
      owner_id: ownerId,
      patient_id: patientId,
      valor: nivel.credito,
      tipo: "nivel",
      nivel_id: nivel.id,
      descricao: `${nivel.nome} desbloqueado`,
    });
    if (!error) pagou.push(nivel.nome);
  }
  return pagou;
}

/**
 * Cria a indicação pendente de um agendamento.
 *
 * Chamada de `agenda.functions.ts` logo depois de o agendamento nascer: é ali
 * que a recepção responde "veio por indicação?", e é o agendamento que vai
 * confirmar a indicação mais tarde.
 */
export async function registrarIndicacaoDoAgendamento(
  supabase: any,
  ownerId: string,
  dados: {
    indicadorId: string;
    appointmentId: string;
    indicadoId: string | null;
    indicadoNome: string;
  },
): Promise<void> {
  try {
    if (!dados.indicadorId || dados.indicadorId === dados.indicadoId) return;
    const { error } = await supabase.from("club_indicacoes").insert({
      owner_id: ownerId,
      indicador_id: dados.indicadorId,
      indicado_id: dados.indicadoId,
      indicado_nome: dados.indicadoNome,
      appointment_id: dados.appointmentId,
      status: "pendente",
    });
    // Índice único: esta pessoa já tinha sido indicada antes. Não é erro de
    // quem agendou — é a régua funcionando (uma pessoa conta uma vez).
    if (error) console.warn("[club] indicação não registrada:", error.message);
  } catch (e) {
    console.error("[club] indicação não registrada", e);
  }
}

// ── O que as telas chamam ─────────────────────────────────────────────────

export const verMembro = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { patientId: string }) => ({ patientId: input.patientId }))
  .handler(async ({ data, context }): Promise<MembroDoClub> => {
    const supabase: any = context.supabase;
    const [paciente, indicacoes, extrato, regua] = await Promise.all([
      supabase
        .from("patients")
        .select("id, name, club_desde")
        .eq("id", data.patientId)
        .eq("owner_id", context.ownerId)
        .maybeSingle(),
      supabase
        .from("club_indicacoes")
        .select("id, indicado_nome, indicado_id, status, created_at, confirmada_em")
        .eq("owner_id", context.ownerId)
        .eq("indicador_id", data.patientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("club_creditos")
        .select("id, valor, tipo, descricao, created_at")
        .eq("owner_id", context.ownerId)
        .eq("patient_id", data.patientId)
        .order("created_at", { ascending: false }),
      lerRegua(supabase, context.ownerId),
    ]);

    const lista = ((indicacoes.data ?? []) as any[]).map((i) => ({
      id: String(i.id),
      indicadoNome: String(i.indicado_nome ?? ""),
      indicadoId: i.indicado_id ? String(i.indicado_id) : null,
      status: i.status as IndicacaoNaTela["status"],
      criadaEm: i.created_at,
      confirmadaEm: i.confirmada_em ?? null,
    }));
    const lancamentos = ((extrato.data ?? []) as any[]).map((l) => ({
      id: String(l.id),
      valor: Number(l.valor),
      tipo: l.tipo as LancamentoNaTela["tipo"],
      descricao: String(l.descricao ?? ""),
      criadoEm: l.created_at,
    }));

    const confirmadas = lista.filter((i) => i.status === "confirmada").length;
    const s = situacaoNoClub(confirmadas, regua);

    return {
      patientId: data.patientId,
      nome: String(paciente.data?.name ?? ""),
      participa: !!paciente.data?.club_desde,
      desde: paciente.data?.club_desde ?? null,
      nivelNome: s.nivel?.nome ?? null,
      proximoNome: s.proximo?.nome ?? null,
      confirmadas,
      pendentes: lista.filter((i) => i.status === "pendente").length,
      faltam: s.faltam,
      progresso: s.progresso,
      saldo: saldoDoExtrato(lancamentos),
      liberado: lancamentos.filter((l) => l.valor > 0).reduce((t, l) => t + l.valor, 0),
      usado: lancamentos.filter((l) => l.valor < 0).reduce((t, l) => t - l.valor, 0),
      indicacoes: lista,
      extrato: lancamentos,
      regua,
    };
  });

export const entrarNoClub = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { patientId: string; participa: boolean }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("patients")
      // Sair do Club apaga a data de entrada, e não o histórico: as indicações
      // e o extrato continuam lá, e voltar a participar devolve tudo.
      .update({ club_desde: data.participa ? new Date().toISOString() : null })
      .eq("id", data.patientId)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Indicação registrada à mão, fora da agenda — a pessoa que o membro indicou
 *  e que ainda nem marcou. Nasce pendente, como a da agenda. */
export const adicionarIndicacao = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: { indicadorId: string; indicadoNome: string; indicadoId?: string | null }) => {
      const nome = String(input.indicadoNome ?? "").trim();
      if (!input.indicadorId?.trim()) throw new Error("Indicador inválido.");
      if (!nome) throw new Error("Diga quem foi indicado.");
      return {
        indicadorId: input.indicadorId.trim(),
        indicadoNome: nome.slice(0, 120),
        indicadoId: input.indicadoId?.trim() || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    if (data.indicadoId && data.indicadoId === data.indicadorId) {
      throw new Error("Ninguém indica a si mesmo.");
    }
    const { error } = await supabase.from("club_indicacoes").insert({
      owner_id: context.ownerId,
      indicador_id: data.indicadorId,
      indicado_id: data.indicadoId,
      indicado_nome: data.indicadoNome,
      status: "pendente",
    });
    if (error) {
      const { ehChaveDuplicada } = await import("@/lib/finance/erro-do-banco");
      if (ehChaveDuplicada(error)) throw new Error("Esta pessoa já foi indicada por alguém.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

/**
 * Confirma ou cancela uma indicação à mão.
 *
 * Existe para o que a agenda não cobre: a indicação registrada sem
 * agendamento, e a correção de um engano. O caminho normal continua sendo o
 * atendimento concluído.
 */
export const mudarIndicacao = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string; status: "confirmada" | "cancelada" }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { data: antes } = await supabase
      .from("club_indicacoes")
      .select("indicador_id, status")
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!antes) throw new Error("Indicação não encontrada.");

    const agora = new Date().toISOString();
    const { error } = await supabase
      .from("club_indicacoes")
      .update({
        status: data.status,
        confirmada_em: data.status === "confirmada" ? agora : null,
        updated_at: agora,
      })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);

    if (data.status === "confirmada") {
      await pagarPelaIndicacao(supabase, context.ownerId, String(antes.indicador_id), data.id);
    }
    const niveis =
      data.status === "confirmada"
        ? await liberarCreditoDeNivel(supabase, context.ownerId, String(antes.indicador_id))
        : [];
    return { ok: true, niveis };
  });

/**
 * Um lançamento no extrato.
 *
 * Positivo ou negativo — nunca "definir saldo". A clínica pediu assim, e o
 * motivo é auditoria: um saldo editável responde "quanto tem" e nunca "por
 * quê". O crédito de nível não entra por aqui: aquele é lançado pelo sistema,
 * com o índice único que impede o mesmo nível de pagar duas vezes.
 */
export const movimentarCreditos = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      patientId: string;
      valor: number;
      tipo: "boas_vindas" | "uso" | "ajuste";
      descricao: string;
    }) => {
      const valor = Number(input.valor);
      if (!Number.isFinite(valor) || valor === 0) throw new Error("Informe um valor.");
      const descricao = String(input.descricao ?? "").trim();
      if (!descricao) throw new Error("Diga do que se trata — é o extrato de alguém.");
      return {
        patientId: input.patientId,
        // Uso é sempre saída, e os outros dois sempre entrada: deixar o sinal
        // na mão de quem digita faria "uso: 250" virar crédito a mais.
        valor: input.tipo === "uso" ? -Math.abs(valor) : Math.abs(valor),
        tipo: input.tipo,
        descricao: descricao.slice(0, 200),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase.from("club_creditos").insert({
      owner_id: context.ownerId,
      patient_id: data.patientId,
      valor: data.valor,
      tipo: data.tipo,
      descricao: data.descricao,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── O painel ──────────────────────────────────────────────────────────────

export interface MembroNoPainel {
  patientId: string;
  nome: string;
  nivelNome: string | null;
  confirmadas: number;
  pendentes: number;
  saldo: number;
}

export interface PainelDoClub {
  membros: number;
  indicacoesNoMes: number;
  confirmadasNoMes: number;
  pendentes: number;
  liberado: number;
  usado: number;
  saldoEmAberto: number;
  porNivel: { nome: string; quantos: number }[];
  ranking: MembroNoPainel[];
  regua: NivelDoClub[];
  config: ConfigDoClub;
}

export const painelDoClub = createServerFn({ method: "GET" })
  .middleware([exigeClub])
  .handler(async ({ context }): Promise<PainelDoClub> => {
    const supabase: any = context.supabase;
    const inicioDoMes = new Date();
    inicioDoMes.setDate(1);
    inicioDoMes.setHours(0, 0, 0, 0);

    const [membros, indicacoes, creditos, regua, config] = await Promise.all([
      supabase
        .from("patients")
        .select("id, name, club_desde")
        .eq("owner_id", context.ownerId)
        .not("club_desde", "is", null),
      supabase
        .from("club_indicacoes")
        .select("indicador_id, status, created_at")
        .eq("owner_id", context.ownerId),
      supabase.from("club_creditos").select("patient_id, valor").eq("owner_id", context.ownerId),
      lerRegua(supabase, context.ownerId),
      lerConfig(supabase, context.ownerId),
    ]);

    const listaDeIndicacoes = (indicacoes.data ?? []) as any[];
    const listaDeCreditos = (creditos.data ?? []) as any[];

    const confirmadasPor = new Map<string, number>();
    const pendentesPor = new Map<string, number>();
    for (const i of listaDeIndicacoes) {
      const chave = String(i.indicador_id);
      if (i.status === "confirmada") {
        confirmadasPor.set(chave, (confirmadasPor.get(chave) ?? 0) + 1);
      } else if (i.status === "pendente") {
        pendentesPor.set(chave, (pendentesPor.get(chave) ?? 0) + 1);
      }
    }
    const saldoPor = new Map<string, number>();
    for (const c of listaDeCreditos) {
      const chave = String(c.patient_id);
      saldoPor.set(chave, (saldoPor.get(chave) ?? 0) + Number(c.valor || 0));
    }

    const lista: MembroNoPainel[] = ((membros.data ?? []) as any[]).map((p) => {
      const confirmadas = confirmadasPor.get(String(p.id)) ?? 0;
      return {
        patientId: String(p.id),
        nome: String(p.name ?? ""),
        nivelNome: situacaoNoClub(confirmadas, regua).nivel?.nome ?? null,
        confirmadas,
        pendentes: pendentesPor.get(String(p.id)) ?? 0,
        saldo: saldoPor.get(String(p.id)) ?? 0,
      };
    });

    const doMes = listaDeIndicacoes.filter((i) => new Date(i.created_at) >= inicioDoMes);
    const liberado = listaDeCreditos
      .filter((c) => Number(c.valor) > 0)
      .reduce((t, c) => t + Number(c.valor), 0);
    const usado = listaDeCreditos
      .filter((c) => Number(c.valor) < 0)
      .reduce((t, c) => t - Number(c.valor), 0);

    return {
      membros: lista.length,
      indicacoesNoMes: doMes.length,
      confirmadasNoMes: doMes.filter((i) => i.status === "confirmada").length,
      pendentes: listaDeIndicacoes.filter((i) => i.status === "pendente").length,
      liberado,
      usado,
      saldoEmAberto: liberado - usado,
      porNivel: regua.map((n) => ({
        nome: n.nome,
        quantos: lista.filter((m) => m.nivelNome === n.nome).length,
      })),
      ranking: [...lista].sort((a, b) => b.confirmadas - a.confirmadas).slice(0, 10),
      regua,
      config,
    };
  });

/** Os dois valores em dinheiro que não são de nível. Só administrador: é
 *  quanto a clínica passa a dever por indicação. */
export const salvarConfigDoClub = createServerFn({ method: "POST" })
  .middleware([exigeClub])
  .inputValidator(
    (input: { creditoPorIndicacao: number; creditoBoasVindas: number; linkDoCartao?: string }) => {
      const por = Number(input.creditoPorIndicacao);
      const boas = Number(input.creditoBoasVindas);
      if (!Number.isFinite(por) || por < 0) throw new Error("Valor por indicação inválido.");
      if (!Number.isFinite(boas) || boas < 0) throw new Error("Valor de boas-vindas inválido.");

      // Sem barra no fim e sem caminho: o que vai guardado é o ENDEREÇO do
      // site, e o `/club` é somado por quem monta o link. Guardar
      // "site.com/club/" faria o QR apontar para "site.com/club//club".
      let link = String(input.linkDoCartao ?? "").trim();
      if (link) {
        if (!/^https?:\/\//i.test(link)) link = `https://${link}`;
        try {
          const u = new URL(link);
          link = `${u.protocol}//${u.host}`;
        } catch {
          throw new Error("Endereço inválido. Algo como https://club.suaclinica.com.br");
        }
      }
      return { creditoPorIndicacao: por, creditoBoasVindas: boas, linkDoCartao: link };
    },
  )
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Apenas administradores mudam os valores do Club.");
    const supabase: any = context.supabase;
    const { error } = await supabase.from("club_config").upsert(
      {
        owner_id: context.ownerId,
        credito_por_indicacao: data.creditoPorIndicacao,
        credito_boas_vindas: data.creditoBoasVindas,
        link_do_cartao: data.linkDoCartao || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** A régua, editável. Quem mexe aqui muda quanto a clínica deve a quem indica
 *  — por isso só administrador. */
export const salvarNivel = createServerFn({ method: "POST" })
  .middleware([exigeClub])
  .inputValidator(
    (input: { id?: string | null; nome: string; indicacoes: number; credito: number }) => {
      const nome = String(input.nome ?? "").trim();
      if (!nome) throw new Error("Dê um nome ao nível.");
      const indicacoes = Math.floor(Number(input.indicacoes));
      if (!Number.isFinite(indicacoes) || indicacoes < 1) {
        throw new Error("O nível precisa exigir ao menos uma indicação.");
      }
      const credito = Number(input.credito);
      if (!Number.isFinite(credito) || credito < 0) throw new Error("Crédito inválido.");
      return { id: input.id?.trim() || null, nome: nome.slice(0, 40), indicacoes, credito };
    },
  )
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Apenas administradores mudam a régua do Club.");
    const supabase: any = context.supabase;
    const campos = {
      nome: data.nome,
      indicacoes: data.indicacoes,
      credito: data.credito,
      ordem: data.indicacoes,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await supabase
          .from("club_niveis")
          .update(campos)
          .eq("id", data.id)
          .eq("owner_id", context.ownerId)
      : await supabase.from("club_niveis").insert({ ...campos, owner_id: context.ownerId });
    if (error) {
      const { ehChaveDuplicada } = await import("@/lib/finance/erro-do-banco");
      if (ehChaveDuplicada(error)) throw new Error("Já existe um nível com esse número.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

// ── A conta do paciente, a partir do cartão ───────────────────────────────

/** Sem acento, sem pontuação, em minúsculas. É assim que "José da Silva" e
 *  "jose silva" viram a mesma pessoa na hora de conferir o nome. */
function comparavelNome(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O nome que a pessoa digitou bate com o da ficha?
 *
 * Primeiro nome igual, e mais um pedaço qualquer em comum quando a ficha tem
 * sobrenome. Não é exigir o nome completo escrito igual — "Ana Paula Souza"
 * na ficha e "Ana Souza" no cartão é a mesma pessoa, e recusar isso seria
 * mandar embora quem tem o cartão na mão.
 *
 * Também não é aceitar só o primeiro nome: numa base com duas "Ana" o
 * primeiro nome sozinho não distingue ninguém.
 */
export function nomeConfere(digitado: string, daFicha: string): boolean {
  const a = comparavelNome(digitado).split(" ").filter(Boolean);
  const b = comparavelNome(daFicha).split(" ").filter(Boolean);
  if (!a.length || !b.length) return false;
  if (a[0] !== b[0]) return false;
  if (b.length === 1 || a.length === 1) return true;
  const resto = new Set(b.slice(1));
  return a.slice(1).some((parte) => resto.has(parte));
}

export interface ResultadoDaContaDoClub {
  ok: boolean;
  motivo?: "sem_cadastro" | "ja_tem_conta" | "email_em_uso" | "falhou";
}

/**
 * Cria a conta do paciente pelo cartão — já confirmada, para ele entrar na
 * mesma tela.
 *
 * ── Por que não é o cadastro comum do Supabase ────────────────────────────
 *
 * Porque aquele manda um e-mail de confirmação e devolve a pessoa para a
 * caixa de entrada. Para quem está com um cartão na mão, encostado no balcão
 * ou na sala de espera, isso é onde a história acaba.
 *
 * O que substitui a confirmação por e-mail como prova de identidade é o
 * CRUZAMENTO com a base: telefone (nas duas formas que o sistema já usa para
 * casar paciente com conversa) e nome. Quem não está na base da clínica não
 * cria conta nenhuma — e é por isso que esta função não cria paciente: ela só
 * reconhece quem já é.
 *
 * A chave de serviço é usada aqui e só aqui no caminho do paciente, para
 * criar o login com `email_confirm`. Nada do que a pessoa digita vira consulta
 * livre: o telefone vira variantes conhecidas, o nome é só comparado.
 */
export const criarContaDoClub = createServerFn({ method: "POST" })
  .inputValidator((input: { nome: string; telefone: string; email: string; senha: string }) => {
    const nome = String(input.nome ?? "").trim();
    const email = String(input.email ?? "")
      .trim()
      .toLowerCase();
    if (!nome) throw new Error("Diga seu nome completo.");
    if (!email.includes("@")) throw new Error("E-mail inválido.");
    if (String(input.senha ?? "").length < 8) {
      throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    }
    return {
      nome: nome.slice(0, 120),
      telefone: String(input.telefone ?? "").trim(),
      email,
      senha: String(input.senha),
    };
  })
  .handler(async ({ data }): Promise<ResultadoDaContaDoClub> => {
    const { variantesDoNumero } = await import("@/lib/atendimentos/phone");
    const formas = variantesDoNumero(data.telefone);
    if (!formas.length) return { ok: false, motivo: "sem_cadastro" };

    const url = process.env.SUPABASE_URL;
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !chave) {
      console.error("[club] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
      return { ok: false, motivo: "falhou" };
    }
    const { createClient } = await import("@supabase/supabase-js");
    const admin: any = createClient(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // A ficha, pelo telefone. Sem filtro de dono: o paciente não sabe o que é
    // uma clínica dentro do sistema, e a base é de uma só — o `owner_id` da
    // ficha encontrada é que manda daqui para a frente.
    const { data: achados, error } = await admin
      .from("patients")
      .select("id, name, email, club_user_id, club_desde, owner_id")
      .in("phone", formas)
      .limit(5);
    if (error) {
      console.error("[club] busca de paciente falhou", error.message);
      return { ok: false, motivo: "falhou" };
    }
    const lista = (achados ?? []) as any[];
    if (!lista.length) return { ok: false, motivo: "sem_cadastro" };

    // Nome que não bate devolve a MESMA recusa de telefone que não existe, e de
    // propósito: respostas diferentes para os dois casos transformam este
    // endereço — que é público, porque quem chega aqui ainda não tem conta —
    // num jeito de descobrir quais telefones são de pacientes da clínica.
    const ficha = lista.find((p) => nomeConfere(data.nome, String(p.name ?? "")));
    if (!ficha) return { ok: false, motivo: "sem_cadastro" };
    if (ficha.club_user_id) return { ok: false, motivo: "ja_tem_conta" };

    // A conta nasce confirmada: a prova de identidade aqui foi o cruzamento
    // acima, não a caixa de entrada.
    const { data: criado, error: erroConta } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { full_name: data.nome, club: true },
    });
    if (erroConta || !criado?.user?.id) {
      const texto = String(erroConta?.message ?? "");
      if (/already|registered|exists/i.test(texto)) return { ok: false, motivo: "email_em_uso" };
      console.error("[club] conta não criada", texto);
      return { ok: false, motivo: "falhou" };
    }

    const agora = new Date().toISOString();
    const { error: erroVinculo } = await admin
      .from("patients")
      .update({
        club_user_id: criado.user.id,
        club_desde: ficha.club_desde ?? agora,
        // O e-mail do Club entra na ficha quando ela não tinha nenhum: é o
        // contato que a própria pessoa acabou de confirmar que é dela.
        email: ficha.email || data.email,
        updated_at: agora,
      })
      .eq("id", ficha.id)
      // Ninguém mais pode ter pego esta ficha enquanto isto rodava.
      .is("club_user_id", null);
    if (erroVinculo) {
      console.error("[club] vínculo falhou", erroVinculo.message);
      return { ok: false, motivo: "falhou" };
    }

    // O crédito de boas-vindas. Índice único por paciente: quem sair e voltar
    // não ganha de novo. Falha aqui não desfaz a conta — a pessoa já entrou, e
    // um crédito que não entrou a clínica lança à mão.
    try {
      const { creditoBoasVindas } = await lerConfig(admin, ficha.owner_id);
      if (creditoBoasVindas > 0) {
        await admin.from("club_creditos").insert({
          owner_id: ficha.owner_id,
          patient_id: ficha.id,
          valor: creditoBoasVindas,
          tipo: "boas_vindas",
          descricao: "Boas-vindas ao NÓS Club",
        });
      }
    } catch (e) {
      console.error("[club] crédito de boas-vindas", e);
    }

    return { ok: true };
  });
