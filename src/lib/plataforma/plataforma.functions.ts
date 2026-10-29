/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas novas, fora do types.ts do Lovable */
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { custoEmUsd, precoDoModelo, type PrecoDoModelo } from "@/lib/agente-ia/consumo";
import { motivoDaConta, type MotivoDaConta } from "@/lib/auth/erro-do-convite";

/**
 * O painel de quem administra a plataforma: todos os consultórios, num lugar.
 *
 * ── Quem passa ───────────────────────────────────────────────────────────
 *
 * Só quem está em `plataforma_admins`. A tabela é fechada para quem está
 * logado (sem regra de leitura), então a conferência é feita aqui, com a chave
 * de serviço, e tudo o que o painel lê ou grava passa por ela também: o painel
 * olha para TODOS os consultórios, e nenhuma regra por consultório deixaria.
 *
 * ── O que nunca sai daqui ────────────────────────────────────────────────
 *
 * O custo em dólar e o preço do modelo. Decisão de 29/10: só a plataforma vê
 * quanto a IA custa; o consultório vê conversas, nunca dinheiro ou token.
 */

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function ehDaPlataforma(userId: string): Promise<boolean> {
  const { data, error } = await (await admin())
    .from("plataforma_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Falha ao verificar seu acesso.");
  return !!data;
}

export const exigePlataforma = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    if (!(await ehDaPlataforma(context.userId))) {
      throw new Error("Seu nível de acesso não inclui esta área.");
    }
    return next();
  });

/** Para o menu: mostra o item do painel só para quem é da plataforma. */
export const souDaPlataforma = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => ehDaPlataforma(context.userId));

// ── A lista ─────────────────────────────────────────────────────────────

export type Plano = "basico" | "ia";
export type Situacao = "teste" | "ativa" | "suspensa";

export interface Consultorio {
  ownerId: string;
  nome: string;
  cidade: string;
  whatsapp: string;
  plano: Plano;
  situacao: Situacao;
  testeAte: string | null;
  responsavelAvaliacao: string;
  clubLigado: boolean;
  franquia: number;
  extras: number;
  criadoEm: string;
  pessoas: number;
  whatsappStatus: string | null;
  whatsappNumero: string | null;
  conversasNoMes: number;
  /** Nulo quando algum modelo usado não tem preço: "não sei", nunca zero. */
  custoNoMesUsd: number | null;
}

/** Começo do mês corrente no fuso do Brasil, em ISO. */
export function comecoDoMes(agora = new Date()): string {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(agora)
    .split("-");
  return `${ano}-${mes}-01T03:00:00.000Z`;
}

export const listarConsultorios = createServerFn({ method: "GET" })
  .middleware([exigePlataforma])
  .handler(async (): Promise<{ consultorios: Consultorio[]; dolar: number | null }> => {
    const db = await admin();
    const desde = comecoDoMes();
    const [fichas, resumo, precos, cotacao] = await Promise.all([
      db.from("clinicas").select("*").order("criado_em", { ascending: true }),
      db.rpc("plataforma_resumo", { _desde: desde }),
      db.from("ai_precos_modelo").select("modelo, usd_entrada, usd_cache, usd_saida"),
      db.from("cotacao_dolar").select("valor").order("dia", { ascending: false }).limit(1),
    ]);
    for (const r of [fichas, resumo, precos]) if (r.error) throw new Error(r.error.message);

    // O preço é da plataforma: o mesmo modelo custa o mesmo para todos.
    const cadastrados: Record<string, PrecoDoModelo> = {};
    for (const p of (precos.data ?? []) as any[]) {
      cadastrados[String(p.modelo)] = {
        entrada: Number(p.usd_entrada),
        cache: p.usd_cache === null ? null : Number(p.usd_cache),
        saida: Number(p.usd_saida),
      };
    }

    const porDono = new Map<string, any>(
      ((resumo.data ?? []) as any[]).map((r) => [String(r.owner_id), r]),
    );

    const consultorios = ((fichas.data ?? []) as any[]).map((c): Consultorio => {
      const r = porDono.get(String(c.owner_id)) ?? {};
      let custo: number | null = 0;
      for (const u of (r.uso ?? []) as any[]) {
        const parcial = custoEmUsd(
          { entrada: Number(u.entrada), cache: Number(u.cache), saida: Number(u.saida) },
          precoDoModelo(u.modelo, cadastrados),
        );
        custo = parcial === null || custo === null ? null : custo + parcial;
      }
      return {
        ownerId: String(c.owner_id),
        nome: String(c.nome ?? ""),
        cidade: String(c.cidade ?? ""),
        whatsapp: String(c.whatsapp ?? ""),
        plano: c.plano as Plano,
        situacao: c.situacao as Situacao,
        testeAte: c.teste_ate ?? null,
        responsavelAvaliacao: String(c.responsavel_avaliacao ?? ""),
        clubLigado: !!c.club_ligado,
        franquia: Number(c.franquia_conversas_mes ?? 0),
        extras: Number(c.conversas_extras ?? 0),
        criadoEm: c.criado_em,
        pessoas: Number(r.pessoas ?? 0),
        whatsappStatus: r.whatsapp_status ?? null,
        whatsappNumero: r.whatsapp_numero ?? null,
        conversasNoMes: Number(r.conversas ?? 0),
        custoNoMesUsd: custo,
      };
    });
    const dolar = Number((cotacao.data as any[] | null)?.[0]?.valor);
    return { consultorios, dolar: Number.isFinite(dolar) && dolar > 0 ? dolar : null };
  });

// ── Mudar um consultório ────────────────────────────────────────────────

export const salvarConsultorio = createServerFn({ method: "POST" })
  .middleware([exigePlataforma])
  .inputValidator(
    (input: {
      ownerId: string;
      nome: string;
      plano: Plano;
      situacao: Situacao;
      testeAte: string | null;
      responsavelAvaliacao: string;
      clubLigado: boolean;
      franquia: number;
    }) => {
      if (!["basico", "ia"].includes(input.plano)) throw new Error("Plano inválido.");
      if (!["teste", "ativa", "suspensa"].includes(input.situacao)) {
        throw new Error("Situação inválida.");
      }
      const nome = String(input.nome ?? "").trim();
      if (!nome) throw new Error("O consultório precisa de um nome.");
      const franquia = Math.max(0, Math.floor(Number(input.franquia) || 0));
      const testeAte = input.testeAte ? new Date(input.testeAte) : null;
      if (testeAte && Number.isNaN(testeAte.getTime())) throw new Error("Data de teste inválida.");
      return {
        ownerId: String(input.ownerId),
        nome: nome.slice(0, 120),
        plano: input.plano,
        situacao: input.situacao,
        testeAte: testeAte ? testeAte.toISOString() : null,
        responsavelAvaliacao: String(input.responsavelAvaliacao ?? "")
          .trim()
          .slice(0, 120),
        clubLigado: !!input.clubLigado,
        franquia,
      };
    },
  )
  .handler(async ({ data }) => {
    const { error } = await (
      await admin()
    )
      .from("clinicas")
      .update({
        nome: data.nome,
        plano: data.plano,
        situacao: data.situacao,
        teste_ate: data.testeAte,
        responsavel_avaliacao: data.responsavelAvaliacao || null,
        club_ligado: data.clubLigado,
        franquia_conversas_mes: data.franquia,
        atualizado_em: new Date().toISOString(),
      })
      .eq("owner_id", data.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lança um pacote extra de conversas, depois de o consultório pagar. */
export const lancarPacote = createServerFn({ method: "POST" })
  .middleware([exigePlataforma])
  .inputValidator(
    (input: { ownerId: string; conversas: number; valorReais: number | null; obs?: string }) => {
      const conversas = Math.floor(Number(input.conversas) || 0);
      if (conversas <= 0) throw new Error("Diga quantas conversas o pacote tem.");
      const valor =
        input.valorReais === null || input.valorReais === undefined
          ? null
          : Math.round(Number(input.valorReais) * 100);
      if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
        throw new Error("Valor inválido.");
      }
      return {
        ownerId: String(input.ownerId),
        conversas,
        valorCentavos: valor,
        obs: String(input.obs ?? "")
          .trim()
          .slice(0, 200),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: ficha, error: erroFicha } = await db
      .from("clinicas")
      .select("conversas_extras")
      .eq("owner_id", data.ownerId)
      .maybeSingle();
    if (erroFicha) throw new Error(erroFicha.message);
    if (!ficha) throw new Error("Consultório não encontrado.");

    const { error } = await db.from("clinica_pacotes").insert({
      owner_id: data.ownerId,
      conversas: data.conversas,
      valor_centavos: data.valorCentavos,
      observacao: data.obs || null,
      lancado_por: context.userId,
    });
    if (error) throw new Error(error.message);

    // Soma com trava otimista: dois lançamentos ao mesmo tempo não se apagam.
    const antes = Number(ficha.conversas_extras ?? 0);
    const { data: certo, error: erroSoma } = await db
      .from("clinicas")
      .update({
        conversas_extras: antes + data.conversas,
        atualizado_em: new Date().toISOString(),
      })
      .eq("owner_id", data.ownerId)
      .eq("conversas_extras", antes)
      .select("owner_id");
    if (erroSoma) throw new Error(erroSoma.message);
    if (!certo?.length) throw new Error("O saldo mudou enquanto isso. Atualize e lance de novo.");
    return { ok: true, extras: antes + data.conversas };
  });

// ── Convite para um consultório novo ────────────────────────────────────

export interface ConviteDeConsultorio {
  id: string;
  token: string;
  nomeConsultorio: string;
  email: string;
  plano: Plano;
  diasDeTeste: number;
  criadoEm: string;
  expiraEm: string;
}

function novoToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

export const criarConviteDeConsultorio = createServerFn({ method: "POST" })
  .middleware([exigePlataforma])
  .inputValidator(
    (input: { nomeConsultorio: string; email?: string; plano: Plano; diasDeTeste: number }) => {
      const nome = String(input.nomeConsultorio ?? "").trim();
      if (!nome) throw new Error("Diga o nome do consultório.");
      if (!["basico", "ia"].includes(input.plano)) throw new Error("Plano inválido.");
      return {
        nome: nome.slice(0, 120),
        email:
          String(input.email ?? "")
            .trim()
            .toLowerCase()
            .slice(0, 200) || null,
        plano: input.plano,
        dias: Math.max(0, Math.min(365, Math.floor(Number(input.diasDeTeste) || 0))),
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ token: string }> => {
    const token = novoToken();
    const { error } = await (await admin()).from("convites_de_consultorio").insert({
      token,
      nome_consultorio: data.nome,
      email: data.email,
      plano: data.plano,
      dias_de_teste: data.dias,
      criado_por: context.userId,
    });
    if (error) throw new Error(error.message);
    return { token };
  });

export const listarConvitesDeConsultorio = createServerFn({ method: "GET" })
  .middleware([exigePlataforma])
  .handler(async (): Promise<ConviteDeConsultorio[]> => {
    const { data, error } = await (await admin())
      .from("convites_de_consultorio")
      .select("id, token, nome_consultorio, email, plano, dias_de_teste, criado_em, expira_em")
      .is("usado_em", null)
      .is("revogado_em", null)
      .gt("expira_em", new Date().toISOString())
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((c) => ({
      id: String(c.id),
      token: String(c.token),
      nomeConsultorio: String(c.nome_consultorio),
      email: String(c.email ?? ""),
      plano: c.plano as Plano,
      diasDeTeste: Number(c.dias_de_teste),
      criadoEm: c.criado_em,
      expiraEm: c.expira_em,
    }));
  });

export const revogarConviteDeConsultorio = createServerFn({ method: "POST" })
  .middleware([exigePlataforma])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data }) => {
    const { error } = await (await admin())
      .from("convites_de_consultorio")
      .update({ revogado_em: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── O lado de quem recebe o convite (sem conta ainda) ───────────────────

async function conviteValido(token: string): Promise<any | null> {
  const t = String(token ?? "").trim();
  if (!/^[a-f0-9]{64}$/.test(t)) return null;
  const { data, error } = await (await admin())
    .from("convites_de_consultorio")
    .select("nome_consultorio, email, plano, dias_de_teste")
    .eq("token", t)
    .is("usado_em", null)
    .is("revogado_em", null)
    .gt("expira_em", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error("Não foi possível verificar o convite.");
  return data ?? null;
}

/** O convite visto por quem o abriu: vale? para que consultório? */
export const conviteDeConsultorioPublico = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => ({ token: String(input.token ?? "") }))
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; nomeConsultorio: string; email: string; diasDeTeste: number }> => {
      const c = await conviteValido(data.token);
      if (!c) return { ok: false, nomeConsultorio: "", email: "", diasDeTeste: 0 };
      return {
        ok: true,
        nomeConsultorio: String(c.nome_consultorio),
        email: String(c.email ?? ""),
        diasDeTeste: Number(c.dias_de_teste),
      };
    },
  );

/**
 * Cria a conta do dono, já confirmada, a partir do convite.
 *
 * Mesmo raciocínio de `criarContaDoConvite` (equipe): o link é a prova, vale
 * para uma pessoa e vence. Confere o convite ANTES de criar, para esta função
 * pública não virar porta para criar conta confirmada à vontade. O consultório
 * em si nasce depois, já logado, em `criar_clinica`, que confere o convite de
 * novo e o marca como usado.
 */
export const criarContaDoDono = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { token: string; email: string; senha: string; nome: string; telefone: string }) => {
      const email = String(input.email ?? "")
        .trim()
        .toLowerCase();
      if (!email.includes("@")) throw new Error("E-mail inválido.");
      if (String(input.senha ?? "").length < 8) {
        throw new Error("A senha precisa ter pelo menos 8 caracteres.");
      }
      return {
        token: String(input.token ?? "").trim(),
        email,
        senha: String(input.senha),
        nome: String(input.nome ?? "")
          .trim()
          .slice(0, 120),
        telefone: String(input.telefone ?? "")
          .trim()
          .slice(0, 40),
      };
    },
  )
  .handler(
    async ({ data }): Promise<{ ok: boolean; motivo?: "convite_invalido" | MotivoDaConta }> => {
      if (!(await conviteValido(data.token))) return { ok: false, motivo: "convite_invalido" };
      const { data: criado, error } = await (
        await admin()
      ).auth.admin.createUser({
        email: data.email,
        password: data.senha,
        email_confirm: true,
        user_metadata: { full_name: data.nome, phone: data.telefone },
      });
      if (error || !criado?.user?.id) {
        const motivo = motivoDaConta(error);
        if (motivo === "falhou") console.error("[consultorio] conta não criada", error?.message);
        return { ok: false, motivo };
      }
      return { ok: true };
    },
  );

/** Já logado: cria o consultório (ver `criar_clinica`). */
export const criarConsultorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { nome: string; cidade: string; whatsapp: string; convite: string | null }) => ({
      nome: String(input.nome ?? "")
        .trim()
        .slice(0, 120),
      cidade: String(input.cidade ?? "")
        .trim()
        .slice(0, 80),
      whatsapp: String(input.whatsapp ?? "")
        .trim()
        .slice(0, 40),
      convite: input.convite ? String(input.convite).trim() : null,
    }),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; motivo?: string }> => {
    const supabase: any = context.supabase;
    const { data: r, error } = await supabase.rpc("criar_clinica", {
      _nome: data.nome,
      _cidade: data.cidade,
      _whatsapp: data.whatsapp,
      _convite: data.convite,
    });
    if (error) {
      console.error("[consultorio] criar_clinica falhou", error.message);
      return { ok: false, motivo: "falhou" };
    }
    const resposta = (r ?? {}) as { ok?: boolean; motivo?: string };
    return resposta.ok ? { ok: true } : { ok: false, motivo: resposta.motivo ?? "falhou" };
  });
