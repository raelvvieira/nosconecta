import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { CAMPOS_DO_MANUAL, type ManualDeVendas } from "./manual";

export type { ManualDeVendas };

export interface EstadoDoAgente {
  agenteId: string;
  nome: string;
  ligado: boolean;
  etapasDeVitoria: string[];
  /** Aprender com conversas marcadas como Ganho. Ligado por padrão. */
  aprenderDeGanhos: boolean;
  /**
   * Vendas marcadas por uma pessoa no funil. Hoje é zero: o funil começou do
   * zero quando saímos do CRM.
   *
   * Contado separado das conversas de propósito. Somar os dois faria a tela
   * dizer "20 vendas" sem que exista uma, e o número que deveria dar
   * segurança seria o menos confiável da página.
   */
  vendas: number;
  /** Conversas reais do espelho que sustentam o manual. É daqui que ele vem
   *  hoje. */
  conversas: number;
  /** De onde vieram — responde "aprendeu com o quê?". */
  porFonte: { ganho: number; etapa: number; paciente: number; conversa: number };
  /** Menos de três fontes: o manual existe, mas generaliza demais. */
  confiavel: boolean;
  faltam: number;
  /** A chave da IA está configurada? Só isso — nunca o valor. */
  temChave: boolean;
  aprendido: ManualDeVendas;
  correcoes: ManualDeVendas;
  aprendidoEm: string | null;
  /** Por que a última rodada não aprendeu. Nulo quando aprendeu. */
  ultimoMotivo: string | null;
}

async function chamar(body: unknown): Promise<any> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/ai-playbook`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body ?? {}),
    // O ciclo lê várias conversas no CRM e ainda chama o modelo. Tempo curto
    // aqui viraria "erro" numa rodada que ia terminar.
    signal: AbortSignal.timeout(230_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falha ao chamar ai-playbook (${res.status})`);
  return json;
}

export const getEstadoDoAgente = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<EstadoDoAgente> => {
    const json = await chamar({ ownerId: context.ownerId, action: "estado" });
    const a = json.agente ?? {};
    const p = json.playbook ?? {};
    return {
      agenteId: String(a.id ?? ""),
      nome: a.name ?? "Assistente da NÓS",
      ligado: !!a.enabled,
      etapasDeVitoria: Array.isArray(a.winning_stage_ids) ? a.winning_stage_ids.map(String) : [],
      aprenderDeGanhos: a.learn_from_won !== false,
      vendas: Number(json.vendas ?? 0),
      conversas: Number(json.conversas ?? 0),
      porFonte: {
        ganho: Number(json.porFonte?.ganho ?? 0),
        etapa: Number(json.porFonte?.etapa ?? 0),
        paciente: Number(json.porFonte?.paciente ?? 0),
        conversa: Number(json.porFonte?.conversa ?? 0),
      },
      confiavel: !!json.confiavel,
      faltam: Number(json.faltam ?? 0),
      temChave: !!json.temChave,
      aprendido: (p.learned ?? {}) as ManualDeVendas,
      correcoes: (p.overrides ?? {}) as ManualDeVendas,
      aprendidoEm: p.last_learned_at ?? null,
      ultimoMotivo: p.last_skip_reason ?? null,
    };
  });

/**
 * A instrução exata que o agente recebe.
 *
 * Vem do servidor de propósito. As regras de repasse para humano moram em
 * `_shared/instrucao-do-agente.ts` e não são espelhadas aqui: uma cópia no
 * navegador poderia divergir e a tela mostraria regras de segurança que não são
 * as que estão valendo.
 */
export const getInstrucaoDoAgente = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<string> => {
    const json = await chamar({ ownerId: context.ownerId, action: "instrucao" });
    return String(json.instrucao ?? "");
  });

/** Roda o ciclo agora: coleta vendas novas e reconstrói o manual. */
export const aprenderAgora = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<{ novas: number; aprendeu: boolean; motivo?: string }> => {
    const json = await chamar({ ownerId: context.ownerId, action: "ciclo" });
    return {
      novas: Number(json.novas ?? 0),
      aprendeu: !!json.aprendeu,
      motivo: json.motivo ?? undefined,
    };
  });

export const salvarConfiguracaoDoAgente = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      nome?: string;
      ligado?: boolean;
      etapasDeVitoria?: string[];
      aprenderDeGanhos?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.nome !== undefined) campos.name = data.nome.trim() || "Assistente da NÓS";
    if (data.ligado !== undefined) campos.enabled = data.ligado;
    if (data.etapasDeVitoria !== undefined) campos.winning_stage_ids = data.etapasDeVitoria;
    if (data.aprenderDeGanhos !== undefined) campos.learn_from_won = data.aprenderDeGanhos;

    const { error } = await supabase
      .from("ai_agents")
      .update(campos)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Grava uma correção humana.
 *
 * Escreve em `overrides`, NUNCA em `learned`. É o que faz a correção sobreviver
 * ao próximo reaprendizado — que reescreve `learned` inteiro.
 *
 * Campo apagado sai do objeto em vez de virar string vazia: vazio significaria
 * "corrigi para nada", e a leitura passaria a mostrar um buraco no lugar do que
 * a IA aprendeu.
 */
export const salvarCorrecao = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { campo: string; valor: string }) => {
    if (!CAMPOS_DO_MANUAL.includes(input.campo as never)) {
      throw new Error(`Campo desconhecido: ${input.campo}`);
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { data: atual, error: erroLeitura } = await supabase
      .from("ai_sales_playbooks")
      .select("id, overrides")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (erroLeitura) throw new Error(erroLeitura.message);
    if (!atual) throw new Error("O manual ainda não existe. Abra a página do agente uma vez.");

    const overrides = { ...(atual.overrides ?? {}) };
    const valor = data.valor.trim();
    if (valor) overrides[data.campo] = valor;
    else delete overrides[data.campo];

    const { error } = await supabase
      .from("ai_sales_playbooks")
      .update({ overrides, updated_at: new Date().toISOString() })
      .eq("id", atual.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── O recorte do catálogo ──────────────────────────────────────────────────

export interface ProcedimentoDoCatalogo {
  id: string;
  nome: string;
  preco: number;
  duracaoMinutos: number;
  categoria: string | null;
  /** O agente pode citar e precificar este? */
  liberado: boolean;
}

/**
 * O catálogo da clínica com a marcação do que o agente pode citar.
 *
 * NÃO existe tabela de produtos própria do agente: o catálogo é
 * `clinic_procedures`, o mesmo que a Agenda e o Financeiro usam. Duas listas de
 * preço divergiriam, e um preço errado dito a um paciente é o pior defeito
 * possível num negócio de serviço.
 */
export const getProcedimentosDoAgente = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<ProcedimentoDoCatalogo[]> => {
    const supabase: any = context.supabase;
    const [{ data: procedimentos, error }, { data: escolhidos }] = await Promise.all([
      supabase
        .from("clinic_procedures")
        .select("id, name, price, duration_minutes, category")
        .eq("owner_id", context.ownerId)
        .eq("active", true)
        .order("name"),
      supabase.from("ai_agent_procedures").select("procedure_id").eq("owner_id", context.ownerId),
    ]);
    if (error) throw new Error(error.message);

    const liberados = new Set((escolhidos ?? []).map((e: any) => String(e.procedure_id)));
    return (procedimentos ?? []).map((p: any) => ({
      id: String(p.id),
      nome: p.name,
      preco: Number(p.price ?? 0),
      duracaoMinutos: Number(p.duration_minutes ?? 0),
      categoria: p.category ?? null,
      liberado: liberados.has(String(p.id)),
    }));
  });

export const alternarProcedimentoDoAgente = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { procedureId: string; liberado: boolean }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("id")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!agente) throw new Error("O agente ainda não existe. Abra a página do agente uma vez.");

    if (data.liberado) {
      const { error } = await supabase
        .from("ai_agent_procedures")
        .insert({ owner_id: context.ownerId, agent_id: agente.id, procedure_id: data.procedureId });
      // 23505 = já estava liberado. Dois cliques rápidos no mesmo item não são
      // erro, são dois cliques rápidos.
      if (error && error.code !== "23505") throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("ai_agent_procedures")
        .delete()
        .eq("agent_id", agente.id)
        .eq("procedure_id", data.procedureId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ── Atendimento ────────────────────────────────────────────────────────────

// ── Atendimento ───────────────────────────────────────────────────────────
//
// As "regras de comportamento" (passar para uma pessoa, cutucar quem ficou
// quieto, atualizar cadastro, mover no funil) moravam aqui e saíram em 28/09:
// gravavam linhas em `ai_agent_rules` que NENHUM código lia, e duas das quatro
// são ações que o motor não tem. A tabela fica no banco, vazia — ela nunca
// recebeu uma linha nesta clínica. Quando as ações existirem, o que volta é a
// leitura delas em `instrucao-do-agente.ts`, não a tela.

export interface ConfigDeAtendimento {
  debounceSegundos: number;
  segmentar: boolean;
  limite: number;
  minimo: number;
  msPorCaractere: number;
  /** Disjuntor aberto até quando, se estiver. */
  circuitoAbertoAte: string | null;
  /** A clínica já gravou uma chave da IA aqui? */
  temChavePropria: boolean;
  /** `••••••••` com os quatro últimos. NUNCA a chave inteira — mesmo cuidado
   *  do token da Meta em `meta-capi`. Vazio quando não há chave gravada. */
  chaveResumida: string;
  /** Só fala com quem ainda não tem ficha de paciente. */
  soParaNaoPaciente: boolean;
  /** Só fala em conversa que nasceu há pouco. */
  soParaConversaNova: boolean;
  /** Só fala com quem chegou clicando num anúncio. */
  soDeAnuncio: boolean;
  /** Só fala enquanto ninguém da clínica tiver falado nesta conversa. */
  soSemHistorico: boolean;
  /** Por quantos dias uma conversa ainda conta como nova. */
  novoAteDias: number;
  /**
   * O modelo da OpenAI que atende. Vazio = nada roda.
   *
   * Não tem padrão de propósito: quais modelos existem depende da conta, e um
   * nome chutado no código falharia com "model not found" no meio de um
   * atendimento — com o paciente esperando. Vazio falha na tela, onde alguém
   * pode escolher.
   */
  modelo: string;
  /** O manual de condução escrito pela clínica. Vazio = a IA usa o método
   *  gerado pelo aprendizado. */
  instrucaoBase: string;
}

export const getAtendimento = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<ConfigDeAtendimento> => {
    const supabase: any = context.supabase;
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!agente) throw new Error("O agente ainda não existe. Abra a página do agente uma vez.");

    return {
      debounceSegundos: Number(agente.debounce_seconds ?? 5),
      segmentar: agente.segment_enabled !== false,
      limite: Number(agente.segment_limit ?? 300),
      minimo: Number(agente.segment_min_size ?? 50),
      msPorCaractere: Number(agente.delay_per_character ?? 50),
      circuitoAbertoAte: agente.circuit_open_until ?? null,
      temChavePropria: !!agente.api_key,
      // O `select("*")` acima traz a chave para o SERVIDOR, e ela para aqui:
      // o que desce para o navegador é só a marca. Ler de volta uma chave que
      // alguém digitou não serve para nada e é o jeito mais fácil de ela
      // vazar num print de tela.
      chaveResumida: agente.api_key ? `••••••••${String(agente.api_key).slice(-4)}` : "",
      // `!== false` e não `!!`: linha criada antes da coluna traz `undefined`,
      // e com `!!` o filtro nasceria desligado justamente na clínica que já
      // tinha agente — o oposto do `DEFAULT true` da migration.
      soParaNaoPaciente: agente.so_para_nao_paciente !== false,
      soParaConversaNova: agente.so_para_conversa_nova !== false,
      soDeAnuncio: agente.so_de_anuncio !== false,
      soSemHistorico: agente.so_sem_historico !== false,
      novoAteDias: Number(agente.novo_ate_dias ?? 7),
      modelo: String(agente.model ?? ""),
      instrucaoBase: String(agente.instrucao_base ?? ""),
    };
  });

export const salvarAtendimento = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      debounceSegundos?: number;
      segmentar?: boolean;
      limite?: number;
      minimo?: number;
      msPorCaractere?: number;
      /** A chave da IA. String vazia REMOVE a que estiver gravada. */
      chaveDaIa?: string;
      soParaNaoPaciente?: boolean;
      soParaConversaNova?: boolean;
      soDeAnuncio?: boolean;
      soSemHistorico?: boolean;
      novoAteDias?: number;
      /** O modelo da OpenAI. String vazia limpa a escolha. */
      modelo?: string;
      /** O manual de condução. String vazia devolve o método gerado. */
      instrucaoBase?: string;
    }) => {
      if (input.novoAteDias !== undefined) {
        // O mesmo intervalo do CHECK do banco. Recusar aqui dá uma frase que
        // explica; deixar passar dá um erro de constraint que não explica
        // nada a quem está na tela.
        if (
          !Number.isInteger(input.novoAteDias) ||
          input.novoAteDias < 1 ||
          input.novoAteDias > 90
        ) {
          throw new Error("A janela de contato novo vai de 1 a 90 dias.");
        }
      }
      if (input.chaveDaIa !== undefined) {
        const chave = input.chaveDaIa.trim();
        // Vazio é intenção de remover, e é válido.
        if (chave) {
          // Validação de FORMA, não de validade: uma chave errada só o
          // provedor sabe recusar, e ele recusa com uma mensagem clara. O que
          // dá para pegar aqui é o engano de colar outra coisa — um espaço no
          // meio quase sempre é texto copiado junto.
          if (/\s/.test(chave)) {
            throw new Error("A chave não pode ter espaços. Copie só a chave, sem texto em volta.");
          }
          if (chave.length < 20)
            throw new Error("Essa chave parece curta demais. Confira se copiou inteira.");
        }
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.debounceSegundos !== undefined) campos.debounce_seconds = data.debounceSegundos;
    if (data.segmentar !== undefined) campos.segment_enabled = data.segmentar;
    if (data.limite !== undefined) campos.segment_limit = data.limite;
    if (data.minimo !== undefined) campos.segment_min_size = data.minimo;
    if (data.soParaNaoPaciente !== undefined) campos.so_para_nao_paciente = data.soParaNaoPaciente;
    if (data.soParaConversaNova !== undefined)
      campos.so_para_conversa_nova = data.soParaConversaNova;
    if (data.soDeAnuncio !== undefined) campos.so_de_anuncio = data.soDeAnuncio;
    if (data.soSemHistorico !== undefined) campos.so_sem_historico = data.soSemHistorico;
    if (data.novoAteDias !== undefined) campos.novo_ate_dias = data.novoAteDias;
    if (data.msPorCaractere !== undefined) campos.delay_per_character = data.msPorCaractere;
    // `null` e não string vazia: a coluna vazia significaria "chave em branco"
    // para quem lesse, e a pergunta que o resto do código faz é se ela EXISTE.
    if (data.chaveDaIa !== undefined) campos.api_key = data.chaveDaIa.trim() || null;
    // Mesma razão do `null` acima: "ninguém escolheu" é diferente de "escolheu
    // uma string vazia", e é a primeira coisa que o código pergunta.
    if (data.modelo !== undefined) campos.model = data.modelo.trim() || null;
    // `null` e não string vazia, mesma razão da chave: a pergunta que o resto do
    // código faz é se o manual EXISTE, não se ele está em branco.
    if (data.instrucaoBase !== undefined) campos.instrucao_base = data.instrucaoBase.trim() || null;

    const { error } = await supabase
      .from("ai_agents")
      .update(campos)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Cria ou atualiza uma regra de comportamento.
 *
 * Toda regra nasce DESLIGADA — a tela liga depois, num gesto separado. Vale
 * para todas e especialmente para `pipeline`: um agente que move card sozinho
 * gera a própria matéria-prima de aprendizado, e ligar isso sem querer é o tipo
 * de coisa que só se descobre semanas depois, quando o manual já aprendeu com
 * os próprios enganos.
 */
/**
 * Os modelos que a chave desta clínica pode usar, perguntados à OpenAI.
 *
 * ── Por que a lista não está no código ──────────────────────────────────
 *
 * Porque ela não é nossa. Quais modelos existem depende do plano da conta, do
 * que a organização liberou e do que a OpenAI lançou depois deste commit.
 * Qualquer lista escrita aqui começa desatualizada e envelhece calada — e o
 * sintoma, semanas depois, é "model not found" no meio de um atendimento.
 *
 * Perguntando à conta, a tela mostra os nomes DE VERDADE. Se o modelo que
 * alguém procura não estiver ali, isso também é a resposta.
 *
 * ── O que não sai daqui ─────────────────────────────────────────────────
 *
 * A chave. Ela é lida no servidor, usada no cabeçalho da chamada e descartada.
 * O que desce para o navegador é uma lista de nomes.
 */
export const listarModelosDaIa = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<{ modelos: string[]; erro: string | null }> => {
    // `types.ts` é gerado pelo Lovable e não conhece a coluna `model`, que
    // nasceu agora — mesma razão do `any` nas outras funções deste arquivo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("api_key")
      .eq("owner_id", context.ownerId)
      .maybeSingle();

    const chave = String(agente?.api_key ?? "").trim() || process.env.OPENAI_API_KEY || "";
    if (!chave) return { modelos: [], erro: "Cadastre a chave da OpenAI primeiro." };

    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { authorization: `Bearer ${chave}` },
        signal: AbortSignal.timeout(20_000),
      });
      // A forma mínima que se lê da resposta. Tipar só isto é mais honesto que
      // `any`: o resto do corpo da OpenAI não interessa a esta tela.
      const json = (await res.json().catch(() => null)) as {
        data?: { id?: string }[];
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        // A mensagem da OpenAI vem inteira de propósito: "incorrect API key"
        // e "you exceeded your quota" pedem ações diferentes, e traduzir as
        // duas para "não deu" esconderia justamente o que resolver.
        return { modelos: [], erro: json?.error?.message ?? `A OpenAI respondeu ${res.status}.` };
      }
      const nomes: string[] = (Array.isArray(json?.data) ? json.data : [])
        .map((m) => String(m?.id ?? ""))
        .filter(Boolean)
        // Fora o que não conversa: transcrição, imagem, voz, embedding e
        // moderação aparecem na mesma lista e só atrapalhariam a escolha.
        .filter(
          (id: string) =>
            !/whisper|tts|dall-e|embedding|moderation|image|audio|realtime|transcribe|search|sora/i.test(
              id,
            ),
        )
        .sort();
      return { modelos: [...new Set(nomes)], erro: null };
    } catch (e) {
      return {
        modelos: [],
        erro: e instanceof Error ? e.message : "Não deu para falar com a OpenAI.",
      };
    }
  });

/** Roda o atendimento com uma mensagem de mentira. Nada sai para paciente
 *  nenhum — é o que torna isto testável antes do registro no CRM. */
export const simularAtendimento = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { texto: string }) => {
    if (!input.texto?.trim()) throw new Error("Escreva uma mensagem para simular.");
    return input;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      respondeu: boolean;
      motivo?: string;
      enviados: { texto: string; esperaMs: number }[];
      /** O agente está desligado — a tela precisa dizer que isto é prévia. */
      desligado: boolean;
    }> => {
      const json = await chamar({
        ownerId: context.ownerId,
        action: "simular",
        texto: data.texto,
      });
      return {
        respondeu: !!json.respondeu,
        motivo: json.motivo ?? undefined,
        enviados: json.enviados ?? [],
        desligado: !!json.desligado,
      };
    },
  );

/** Devolve a conversa para a IA depois de um humano ter assumido. */
export const devolverParaIa = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { sessionId: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("ai_agent_sessions")
      .update({ human_took_over_at: null, updated_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Painel ─────────────────────────────────────────────────────────────────

export interface PainelDoFunil {
  ganhos: number;
  perdidos: number;
  emNegociacao: number;
  /** Ganhos ÷ (ganhos + perdidos). Nulo enquanto não houver desfecho nenhum. */
  conversao: number | null;
  valorGanho: number;
  /** Os motivos de perda mais frequentes, do maior para o menor. */
  motivosDePerda: { motivo: string; quantos: number }[];
}

/**
 * O retrato do funil, calculado sem IA nenhuma.
 *
 * É contagem e aritmética sobre `pipeline_deals`, que é local. Não chama
 * modelo e não vai ao CRM: um painel que custa uma chamada de IA por abertura
 * de página é um painel que ninguém deixa aberto.
 */
export const getPainelDoFunil = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<PainelDoFunil> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("pipeline_deals")
      .select("status, value, loss_reason")
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);

    const linhas = data ?? [];
    const ganhos = linhas.filter((d: any) => d.status === "won");
    const perdidos = linhas.filter((d: any) => d.status === "lost");

    const porMotivo = new Map<string, number>();
    for (const p of perdidos) {
      const m = String(p.loss_reason ?? "").trim();
      if (!m) continue;
      porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
    }

    const desfechos = ganhos.length + perdidos.length;
    return {
      ganhos: ganhos.length,
      perdidos: perdidos.length,
      emNegociacao: linhas.filter((d: any) => d.status === "negotiating").length,
      // Nulo, não zero: sem desfecho nenhum a taxa não existe, e mostrar 0%
      // faria parecer que a clínica não fecha nada.
      conversao: desfechos > 0 ? ganhos.length / desfechos : null,
      valorGanho: ganhos.reduce((s: number, d: any) => s + Number(d.value ?? 0), 0),
      motivosDePerda: [...porMotivo.entries()]
        .map(([motivo, quantos]) => ({ motivo, quantos }))
        .sort((a, b) => b.quantos - a.quantos)
        .slice(0, 4),
    };
  });

// ── Sugestões de fala no chat ──────────────────────────────────────────────

export interface SugestaoDeFala {
  /** O texto pronto para mandar. É ele que vai para o composer. */
  fala: string;
  /** Por que agora — em letra menor, sob a fala. */
  porque: string;
}

export interface SugestoesDaConversa {
  etapaAtual: string | null;
  porqueEssaEtapa: string | null;
  sugestoes: SugestaoDeFala[];
  /** Por que não veio nada. Nulo quando veio. */
  motivo: string | null;
}

/**
 * O que dizer agora, nesta conversa.
 *
 * Isto NÃO é o agente. É uma sugestão para quem está atendendo: aparece no
 * painel, a pessoa lê, decide, e o texto só sai se ela mandar. Por isso
 * funciona com a IA desligada e não abre sessão de atendimento.
 *
 * **Nunca levanta erro.** Falta de chave, recusa do modelo ou conversa vazia
 * voltam como `motivo` com a lista vazia, e o painel simplesmente não mostra o
 * card. Um erro vermelho em toda conversa aberta seria pior que card nenhum.
 */
export const getSugestoesDaConversa = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { conversationId: string }) => input)
  .handler(async ({ data, context }): Promise<SugestoesDaConversa> => {
    const vazio = (motivo: string): SugestoesDaConversa => ({
      etapaAtual: null,
      porqueEssaEtapa: null,
      sugestoes: [],
      motivo,
    });

    if (!data.conversationId) return vazio("conversa não informada");

    try {
      const json = await chamar({
        ownerId: context.ownerId,
        action: "sugerir",
        conversationId: data.conversationId,
      });
      return {
        etapaAtual: json.etapaAtual ?? null,
        porqueEssaEtapa: json.porqueEssaEtapa ?? null,
        sugestoes: Array.isArray(json.sugestoes) ? json.sugestoes : [],
        motivo: json.motivo ?? null,
      };
    } catch (e) {
      // Sugestão é conforto, não função. Se ela cair, a conversa continua
      // exatamente como era antes de este card existir.
      console.warn("[sugestoes]", e);
      return vazio(e instanceof Error ? e.message : "não deu para sugerir agora");
    }
  });

// ── O que ela aprendeu com o desfecho das conversas ────────────────────────

export interface LicaoDaLuna {
  id: string;
  quando: string;
  conversationId: string | null;
  nome: string | null;
  /** `true` = ela conduziu até a consulta marcada, sozinha. */
  fechou: boolean;
  /** Uma pessoa da clínica assumiu no meio. */
  humanoAssumiu: boolean;
  oQueFuncionou: string;
  oQueFaltou: string;
  motivo: string;
  momentoDecisivo: string;
  sugestao: string;
  confianca: string;
  mensagens: number;
}

export interface LicoesDaLuna {
  /** Conversas em que ela fechou sozinha, e conversas em que não. */
  fechou: number;
  naoFechou: number;
  /** Os motivos de não fechar, do mais comum para o menos. É a contagem que
   *  muda o manual: "sete das dez pararam no preço" é uma frase acionável. */
  motivos: { motivo: string; quantas: number }[];
  licoes: LicaoDaLuna[];
}

/**
 * As lições, para ler na tela.
 *
 * ── Por que as contagens vêm do servidor ────────────────────────────────
 *
 * Porque a lista é recortada (as últimas 30) e a contagem não pode ser. Somar no
 * navegador daria "3 de 4 conversas pararam no preço" olhando só as últimas 30 —
 * e é justamente a contagem que alguém vai usar para reescrever o manual.
 */
export const listarLicoesDaLuna = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<LicoesDaLuna> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a tabela nasceu depois do types.ts gerado pelo Lovable
    const supabase: any = context.supabase;

    const { data: contagem } = await supabase
      .from("ai_agent_licoes")
      .select("desfecho, motivo")
      .eq("owner_id", context.ownerId)
      .limit(2000);

    const todas = (contagem ?? []) as { desfecho: string; motivo: string | null }[];
    const porMotivo = new Map<string, number>();
    for (const l of todas) {
      if (l.desfecho === "agendou") continue;
      const m = String(l.motivo ?? "").trim() || "não deu para saber";
      // "não se aplica" é o motivo do desfecho positivo; numa conversa que não
      // fechou ele não diz nada e só ocuparia a primeira linha da contagem.
      if (m === "não se aplica") continue;
      porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
    }

    const { data: recentes } = await supabase
      .from("ai_agent_licoes")
      .select(
        "id, created_at, conversation_id, contact_name, desfecho, humano_assumiu, o_que_funcionou, o_que_faltou, motivo, momento_decisivo, sugestao, confianca, mensagens",
      )
      .eq("owner_id", context.ownerId)
      .order("created_at", { ascending: false })
      .limit(30);

    return {
      fechou: todas.filter((l) => l.desfecho === "agendou").length,
      naoFechou: todas.filter((l) => l.desfecho !== "agendou").length,
      motivos: [...porMotivo.entries()]
        .map(([motivo, quantas]) => ({ motivo, quantas }))
        .sort((a, b) => b.quantas - a.quantas),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linha da tabela nova
      licoes: ((recentes ?? []) as any[]).map((l) => ({
        id: String(l.id),
        quando: String(l.created_at),
        conversationId: l.conversation_id ?? null,
        nome: l.contact_name ?? null,
        fechou: l.desfecho === "agendou",
        humanoAssumiu: !!l.humano_assumiu,
        oQueFuncionou: String(l.o_que_funcionou ?? ""),
        oQueFaltou: String(l.o_que_faltou ?? ""),
        motivo: String(l.motivo ?? ""),
        momentoDecisivo: String(l.momento_decisivo ?? ""),
        sugestao: String(l.sugestao ?? ""),
        confianca: String(l.confianca ?? ""),
        mensagens: Number(l.mensagens ?? 0),
      })),
    };
  });
