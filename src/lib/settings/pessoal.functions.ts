/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { exigeConfiguracoes } from "@/lib/auth/area.middleware";
import type { NivelDeAcesso } from "@/lib/auth/niveis-de-acesso";

/**
 * As pessoas da clínica, numa lista só.
 *
 * ── Por que uma lista só, com duas tabelas por baixo ──────────────────────
 *
 * Configurações tinha "Profissionais" e "Usuários e permissões". A mesma
 * pessoa aparecia nas duas, sem nada dizendo que era a mesma — e a Dra.
 * Mariane chegou a aparecer três vezes, com o acesso de verdade desativado
 * enquanto uma linha fantasma, sem login, parecia ativa.
 *
 * As tabelas continuam duas porque respondem a perguntas diferentes:
 * `professionals` é a quem o agendamento aponta (CRO, cor na agenda,
 * comissão), `clinic_members` é quem entra no sistema. Juntar apagaria o
 * histórico da agenda. O que faltava era o vínculo — `professional_id` — e uma
 * tela que mostrasse as duas caras da mesma pessoa.
 *
 * Daí os dois tipos de linha que esta lista devolve:
 *
 *   **Com acesso** — tem login (ou um convite aceito), tem nível e unidades.
 *   **Só ficha clínica** — atende pacientes e não usa o sistema. É o caso de
 *   quem foi cadastrado só para aparecer na agenda.
 */

export interface PessoaDaClinica {
  /** `membro:<id>` ou `profissional:<id>`. A tela não mistura os dois mundos
   *  numa chave só — e o id de origem vai separado, abaixo. */
  chave: string;
  memberId: string | null;
  professionalId: string | null;
  nome: string;
  email: string;
  telefone: string | null;
  /** Nulo para quem só tem ficha clínica, sem acesso ao sistema. */
  nivel: NivelDeAcesso | null;
  situacao: "ativo" | "desativado" | "sem_acesso";
  /** `true` quando existe um login de verdade ligado a esta linha. Uma linha
   *  "ativa" sem login é um cadastro que nunca virou conta — e era o que
   *  escondia a Dra. Mariane sem acesso. */
  temLogin: boolean;
  unidadeIds: string[];
  /** Dados da ficha clínica, quando há. */
  especialidade: string;
  registro: string;
  comissaoPct: number;
  cor: string;
}

export interface ConviteAberto {
  id: string;
  token: string;
  nivel: NivelDeAcesso;
  convidadoNome: string;
  criadoEm: string;
  expiraEm: string;
}

function assertAdmin(context: { isAdmin: boolean }) {
  if (!context.isAdmin) throw new Error("Apenas administradores podem gerenciar as pessoas.");
}

/** Ninguém mexe no próprio acesso por aqui: tirar o próprio nível de
 *  administrador, sem outro admin na clínica, deixa a clínica sem ninguém que
 *  possa desfazer. */
async function assertNaoEhVoce(supabase: any, memberId: string, ownerId: string, userId: string) {
  const { data, error } = await supabase
    .from("clinic_members")
    .select("user_id")
    .eq("id", memberId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.user_id === userId) throw new Error("Você não pode alterar o seu próprio acesso.");
}

export const listarPessoal = createServerFn({ method: "GET" })
  .middleware([exigeConfiguracoes])
  .handler(async ({ context }): Promise<PessoaDaClinica[]> => {
    assertAdmin(context);
    const supabase: any = context.supabase;

    const [membros, vinculos, fichas] = await Promise.all([
      supabase
        .from("clinic_members")
        .select("id, name, email, phone, role, status, unit_id, user_id, professional_id")
        .eq("owner_id", context.ownerId)
        .in("status", ["active", "disabled"])
        .order("name"),
      supabase
        .from("clinic_member_units")
        .select("member_id, unit_id")
        .eq("owner_id", context.ownerId),
      supabase
        .from("professionals")
        .select(
          "id, name, email, phone, specialty, registration_number, commission_pct, color, active, unit_id",
        )
        .eq("owner_id", context.ownerId)
        .order("name"),
    ]);
    if (membros.error) throw new Error(membros.error.message);
    if (fichas.error) throw new Error(fichas.error.message);

    const unidadesDoMembro = new Map<string, string[]>();
    for (const v of (vinculos.data ?? []) as any[]) {
      const lista = unidadesDoMembro.get(String(v.member_id)) ?? [];
      lista.push(String(v.unit_id));
      unidadesDoMembro.set(String(v.member_id), lista);
    }

    const fichaPorId = new Map<string, any>(
      ((fichas.data ?? []) as any[]).map((f) => [String(f.id), f]),
    );
    const fichasUsadas = new Set<string>();

    const pessoas: PessoaDaClinica[] = ((membros.data ?? []) as any[]).map((m) => {
      const ficha = m.professional_id ? fichaPorId.get(String(m.professional_id)) : null;
      if (ficha) fichasUsadas.add(String(ficha.id));
      // A unidade principal entra na lista mesmo sem linha em
      // `clinic_member_units`: é o que o cadastro antigo tinha, e sumir com ela
      // na tela faria parecer que a pessoa perdeu acesso.
      const unidades = new Set(unidadesDoMembro.get(String(m.id)) ?? []);
      if (m.unit_id) unidades.add(String(m.unit_id));
      return {
        chave: `membro:${m.id}`,
        memberId: String(m.id),
        professionalId: ficha ? String(ficha.id) : null,
        nome: String(m.name ?? "").trim(),
        email: String(m.email ?? ""),
        telefone: m.phone ?? null,
        nivel: (m.role ?? null) as NivelDeAcesso | null,
        situacao: m.status === "active" ? "ativo" : "desativado",
        temLogin: !!m.user_id,
        unidadeIds: [...unidades],
        especialidade: ficha?.specialty ?? "",
        registro: ficha?.registration_number ?? "",
        comissaoPct: Number(ficha?.commission_pct ?? 0),
        cor: ficha?.color ?? "#8B5CF6",
      };
    });

    // As fichas clínicas que não pertencem a ninguém com acesso. Elas são
    // pessoas também — só não entram no sistema.
    for (const f of (fichas.data ?? []) as any[]) {
      if (fichasUsadas.has(String(f.id))) continue;
      pessoas.push({
        chave: `profissional:${f.id}`,
        memberId: null,
        professionalId: String(f.id),
        nome: String(f.name ?? "").trim(),
        email: f.email ?? "",
        telefone: f.phone ?? null,
        nivel: null,
        situacao: "sem_acesso",
        temLogin: false,
        unidadeIds: f.unit_id ? [String(f.unit_id)] : [],
        especialidade: f.specialty ?? "",
        registro: f.registration_number ?? "",
        comissaoPct: Number(f.commission_pct ?? 0),
        cor: f.color ?? "#8B5CF6",
      });
    }

    return pessoas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  });

/** Nível e unidades de quem já tem acesso. */
export const salvarAcesso = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: { memberId: string; nivel: NivelDeAcesso; unidadeIds: string[] }) => {
    if (!input.memberId?.trim()) throw new Error("Pessoa inválida.");
    return {
      memberId: input.memberId.trim(),
      nivel: input.nivel,
      unidadeIds: [...new Set((input.unidadeIds ?? []).filter(Boolean))],
    };
  })
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    await assertNaoEhVoce(supabase, data.memberId, context.ownerId, context.userId);

    // Administrador enxerga a clínica inteira: unidade principal nula é como o
    // sistema já representava isso antes desta tela existir.
    const principal = data.nivel === "admin" ? null : (data.unidadeIds[0] ?? null);
    if (data.nivel !== "admin" && !principal) {
      throw new Error("Escolha ao menos uma unidade para esta pessoa.");
    }

    const { error } = await supabase
      .from("clinic_members")
      .update({ role: data.nivel, unit_id: principal, updated_at: new Date().toISOString() })
      .eq("id", data.memberId)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);

    // Troca o conjunto inteiro, como o calendário dos dias de viagem: a tela
    // tem uma lista de marcadas, e mandar diferenças faria dois cliques
    // rápidos fora de ordem deixarem uma unidade que ninguém marcou.
    const fora = await supabase
      .from("clinic_member_units")
      .delete()
      .eq("owner_id", context.ownerId)
      .eq("member_id", data.memberId);
    if (fora.error) throw new Error(fora.error.message);

    if (data.unidadeIds.length) {
      const { error: erroIns } = await supabase.from("clinic_member_units").insert(
        data.unidadeIds.map((unit_id) => ({
          owner_id: context.ownerId,
          member_id: data.memberId,
          unit_id,
        })),
      );
      if (erroIns) throw new Error(erroIns.message);
    }
    return { ok: true };
  });

export const definirSituacao = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: { memberId: string; desativado: boolean }) => input)
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    await assertNaoEhVoce(supabase, data.memberId, context.ownerId, context.userId);
    const { error } = await supabase
      .from("clinic_members")
      .update({ status: data.desativado ? "disabled" : "active" })
      .eq("id", data.memberId)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Apaga um cadastro de acesso que nunca virou conta.
 *
 * Só linhas SEM login: é a limpeza das duplicatas que sobraram de cadastros
 * antigos (foi uma delas que escondeu a dona da clínica sem acesso). Uma linha
 * com login não sai por aqui — para essa existe desativar, que preserva o
 * histórico de quem fez o quê.
 */
export const removerCadastroSemLogin = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: { memberId: string }) => input)
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("clinic_members")
      .delete()
      .eq("id", data.memberId)
      .eq("owner_id", context.ownerId)
      .is("user_id", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Liga (ou desliga) a ficha clínica de uma pessoa com acesso. */
export const vincularFicha = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: { memberId: string; professionalId: string | null }) => input)
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("clinic_members")
      .update({ professional_id: data.professionalId })
      .eq("id", data.memberId)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Convites ──────────────────────────────────────────────────────────────

/** 64 caracteres de hexadecimal. É o segredo do link: quem o tem, tem o
 *  convite — por isso o prazo de sete dias e o uso único, no banco. */
function novoToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

export const criarConvite = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: { nivel: NivelDeAcesso; nome?: string | null }) => ({
    nivel: input.nivel,
    nome: String(input.nome ?? "")
      .trim()
      .slice(0, 80),
  }))
  .handler(async ({ data, context }): Promise<{ token: string }> => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    const token = novoToken();
    const { error } = await supabase.from("clinic_invites").insert({
      owner_id: context.ownerId,
      token,
      role: data.nivel,
      convidado_nome: data.nome || null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { token };
  });

export const listarConvites = createServerFn({ method: "GET" })
  .middleware([exigeConfiguracoes])
  .handler(async ({ context }): Promise<ConviteAberto[]> => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("clinic_invites")
      .select("id, token, role, convidado_nome, created_at, expires_at")
      .eq("owner_id", context.ownerId)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((c) => ({
      id: String(c.id),
      token: String(c.token),
      nivel: c.role as NivelDeAcesso,
      convidadoNome: c.convidado_nome ?? "",
      criadoEm: c.created_at,
      expiraEm: c.expires_at,
    }));
  });

export const revogarConvite = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    // Revoga, não apaga: o registro de que um convite existiu e para qual
    // nível é o que responde "quem deu acesso a essa pessoa?" depois.
    const { error } = await supabase
      .from("clinic_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * O convite visto por quem o recebeu — antes de existir conta nenhuma.
 *
 * Passa por uma função do banco (`convite_para_mostrar`) e não por uma leitura
 * da tabela: quem abre o link não está logado, e a tabela de convites só é
 * legível por administrador. A função devolve o mínimo: se vale, para qual
 * nível, e as unidades da clínica para a pessoa escolher onde atende.
 */
export const convitePublico = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => ({ token: String(input.token ?? "").trim() }))
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      nivel: NivelDeAcesso | null;
      convidadoNome: string;
      unidades: { id: string; nome: string }[];
    }> => {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data: resposta, error } = await supabase.rpc("convite_para_mostrar", {
        _token: data.token,
      });
      if (error) throw new Error("Não foi possível verificar o convite.");
      const r = (resposta ?? {}) as any;
      return {
        ok: r?.ok === true,
        nivel: (r?.nivel ?? null) as NivelDeAcesso | null,
        convidadoNome: r?.convidado_nome ?? "",
        unidades: Array.isArray(r?.unidades) ? r.unidades : [],
      };
    },
  );
