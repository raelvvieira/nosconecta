// O motor que aprende a atender lendo as conversas reais da clínica.
//
// ── O ciclo ────────────────────────────────────────────────────────────────
//
//   coletar  →  escolher quais conversas ensinam
//   aprender →  ler as transcrições e destilar o método desta clínica
//
// Cada passo tem uma condição de parada que evita gastar chamada de modelo à
// toa. Se nenhuma venda nova entrou desde a última rodada, o ciclo para no
// coletor: reconstruir o manual produziria exatamente o mesmo texto.
//
// ── Por que a etapa do funil, e não perguntar à IA ─────────────────────────
//
// A primeira versão do sistema de origem perguntava a um modelo, conversa por
// conversa, se ela tinha virado venda. Foi trocada pelo histórico real de
// movimentação de etapa: a etapa real cobre tanto card movido à mão quanto por
// automação, é mais abrangente que a inferência que substituiu, e não custa
// nada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { atender } from "../_shared/atendimento.ts";
import {
  contarPorConversa,
  escolherConversas,
  type ConversaDoCorpus,
} from "../_shared/corpus-de-aprendizado.ts";
import { lerTudo } from "../_shared/ler-paginado.ts";
import { clienteDaIa, responderPaciente, temChave } from "../_shared/modelo-de-atendimento.ts";
import {
  CAMPOS_DO_MANUAL,
  manualEfetivo,
  montarInstrucao,
  type ManualDeVendas,
} from "../_shared/instrucao-do-agente.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Teto de conversas levadas ao prompt por rodada. As mais recentes
 *  representam melhor o jeito atual de atender, e o prompt precisa caber. */
const MAX_FONTES = 20;
/** Mensagens por conversa, e caracteres por mensagem. */
const JANELA_DE_MENSAGENS = 40;
const MAX_CARACTERES = 400;
/** Abaixo disso o manual não é confiável e a tela diz isso. Três vendas é
 *  pouco para generalizar, mas é o mínimo em que um padrão começa a aparecer. */
const MINIMO_PARA_CONFIAR = 3;

// ── O modelo ───────────────────────────────────────────────────────────────


/**
 * O formato exigido da resposta.
 *
 * O sistema de origem pedia "responda APENAS com um JSON válido, sem markdown"
 * e torcia. Com `output_config.format` o formato é garantido pela API, não
 * pedido por favor — some a classe inteira de defeito em que o modelo devolve
 * o JSON embrulhado em ```json e o parse quebra.
 */
const FORMATO_DO_MANUAL = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [...CAMPOS_DO_MANUAL],
    properties: {
      tom: { type: "string" },
      saudacao: { type: "string" },
      // `minItems: 0` é deliberado. Com `required` de dez campos, o modelo é
      // obrigado a devolver `etapas` — e um modelo obrigado a preencher uma
      // lista que não viu acontecer INVENTA etapa. Lista vazia precisa ser
      // resposta legítima, e o prompt diz isso em palavras também.
      etapas: {
        type: "array",
        minItems: 0,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["nome", "sinais", "objetivo", "proximo_passo"],
          properties: {
            nome: { type: "string" },
            sinais: { type: "string" },
            objetivo: { type: "string" },
            proximo_passo: { type: "string" },
          },
        },
      },
      descoberta: { type: "string" },
      duvidas_de_procedimento: { type: "string" },
      apresentacao_preco: { type: "string" },
      objecoes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["objecao", "resposta"],
          properties: { objecao: { type: "string" }, resposta: { type: "string" } },
        },
      },
      agendamento: { type: "string" },
      fechamento: { type: "string" },
      observacoes: { type: "string" },
    },
  },
};

/**
 * O prompt de aprendizado.
 *
 * As três últimas regras são o que faz ele funcionar. "Não invente técnica
 * genérica" e "cite frases reais" impedem o modelo de devolver um manual de
 * vendas de livro — o valor está em soar como ESTA clínica, não em saber
 * vender em geral. E "se só houver uma conversa, não generalize" evita que um
 * caso único vire lei, que é o erro mais provável no começo.
 */
export interface FonteParaAprender {
  texto: string;
  /** A pessoa desta conversa virou paciente da clínica. */
  virouPaciente: boolean;
}

function promptDeAprendizado(fontes: FonteParaAprender[]): string {
  const blocos = fontes
    .map((f, i) => {
      const selo = f.virouPaciente ? "VIROU PACIENTE" : "desfecho desconhecido";
      return `--- CONVERSA ${i + 1} (${selo}) ---\n${f.texto}`;
    })
    .join("\n\n");

  return [
    "Abaixo estão conversas reais de WhatsApp de uma clínica odontológica",
    "brasileira. Seu trabalho é descobrir o MÉTODO de atendimento desta equipe:",
    "como ela fala, o que funciona, o que ela responde quando o paciente hesita.",
    "",
    "Cada conversa vem marcada. \"VIROU PACIENTE\" quer dizer que a pessoa acabou",
    "virando paciente da clínica — é a evidência mais forte de que aquilo deu",
    "certo. \"desfecho desconhecido\" quer dizer que não se sabe no que deu.",
    "",
    "Regras:",
    "- Tire o método principalmente das conversas marcadas VIROU PACIENTE.",
    "- Conversa de desfecho desconhecido serve para reconhecer o que NÃO",
    "  destrava e para observar o jeito de falar. Não a cite como exemplo do",
    "  que funciona.",
    "- Baseie tudo no que está escrito nas conversas. Não invente técnica de",
    "  vendas genérica que não apareça ali.",
    "- Cite frases reais sempre que puder — são elas que ensinam.",
    "- Escreva em português do Brasil, simples e direto.",
    "- Se só houver uma conversa, descreva o que dá para observar, sem",
    "  generalizar demais.",
    "- Não inclua preço específico em `apresentacao_preco`: descreva o MOMENTO e",
    "  a FORMA de falar de valor. Os preços vêm da tabela da clínica, não daqui.",
    "- Em `etapas`, descreva só as etapas que você VIU acontecer nestas",
    "  conversas, na ordem em que acontecem. Lista vazia é uma resposta válida",
    "  e é melhor que uma etapa inventada. Em `sinais`, escreva o que o paciente",
    "  diz ou faz que mostra que a conversa chegou ali.",
    "",
    blocos,
  ].join("\n");
}

// ── Coleta ─────────────────────────────────────────────────────────────────

interface ItemDoFunil {
  id: string;
  /** A conversa de onde o card nasceu, quando há uma. É dela que sai a
   *  transcrição que o playbook aprende. */
  conversaId: string | null;
  titulo: string | null;
}

/**
 * Os cards do funil, por id.
 *
 * Lia `/api/v1/pipelines/{id}/pipeline_items` na conta do CRM. Agora é uma
 * consulta na nossa tabela — e como deixou de ser uma ida à rede, a leitura
 * preguiçosa lá embaixo perdeu quase toda a razão de ser; ficou por não haver
 * motivo de tirá-la.
 */
async function itensDoFunil(ownerId: string): Promise<Map<string, ItemDoFunil>> {
  const mapa = new Map<string, ItemDoFunil>();
  const { data, error } = await supabase
    .from("funnel_cards")
    .select("id, conversation_id, title")
    .eq("owner_id", ownerId);
  // Erro não vira mapa vazio calado: sem isto, uma consulta quebrada faria o
  // playbook dizer "nenhuma venda nova" para sempre.
  if (error) throw new Error(`funnel_cards: ${error.message}`);

  for (const row of data ?? []) {
    const id = String(row?.id ?? "");
    if (!id) continue;
    mapa.set(id, {
      id,
      conversaId: row?.conversation_id ? String(row.conversation_id) : null,
      titulo: row?.title ?? null,
    });
  }
  return mapa;
}

/** `pipeline_deals.item_id` guarda `conv:<id>` quando o desfecho foi marcado
 *  numa conversa sem card no funil. Ver `src/lib/atendimentos/deal-key.ts`. */
const PREFIXO_CONVERSA = "conv:";

/**
 * As vendas novas desde a última rodada, de DUAS fontes.
 *
 * ── Por que duas ─────────────────────────────────────────────────────────
 *
 * `ganho`: alguém marcou a negociação como Ganho — no card ou direto na
 * conversa. Nesta clínica é a fonte principal, porque o desfecho é marcado no
 * chat e muitas vezes sem card nenhum no funil. Ler só etapa deixava a maior
 * parte das vitórias invisível para o aprendizado, e o manual aprendia de uma
 * amostra enviesada sem que ninguém tivesse como perceber.
 *
 * `etapa`: o card entrou numa etapa escolhida como vitória. Continua valendo
 * para quem trabalha pelo funil.
 *
 * A mesma conversa nunca entra duas vezes: o índice único de
 * `ai_playbook_sources` cuida disso, e a leitura de conhecidas evita a ida ao
 * banco à toa.
 */
async function coletarVendas(
  ownerId: string,
  playbookId: string,
  etapasDeVitoria: string[],
  aprenderDeGanhos: boolean,
) {
  const { data: jaConhecidas } = await supabase
    .from("ai_playbook_sources")
    .select("conversation_id")
    .eq("playbook_id", playbookId);
  const conhecidas = new Set((jaConhecidas ?? []).map((s: any) => String(s.conversation_id)));

  const novas: {
    conversation_id: string;
    contact_name: string | null;
    source: "ganho" | "etapa";
  }[] = [];
  const vistas = new Set<string>();
  const registrar = (id: string, nome: string | null, source: "ganho" | "etapa") => {
    if (!id || conhecidas.has(id) || vistas.has(id)) return;
    vistas.add(id);
    novas.push({ conversation_id: id, contact_name: nome, source });
  };

  // Os cards só são lidos se alguma das fontes precisar deles — a fonte de
  // Ganho marcado em conversa dispensa.
  let itens: Map<string, ItemDoFunil> | null = null;
  const doFunil = async () => (itens ??= await itensDoFunil(ownerId));

  // ── Fonte 1: marcado como Ganho ─────────────────────────────────────────
  if (aprenderDeGanhos) {
    const { data: ganhos } = await supabase
      .from("pipeline_deals")
      .select("item_id, updated_at")
      .eq("owner_id", ownerId)
      .eq("status", "won")
      .order("updated_at", { ascending: false })
      .limit(500);

    for (const d of ganhos ?? []) {
      const chave = String(d?.item_id ?? "");
      if (!chave) continue;
      if (chave.startsWith(PREFIXO_CONVERSA)) {
        // Ganho marcado na conversa: a chave JÁ é o id da conversa.
        registrar(chave.slice(PREFIXO_CONVERSA.length), null, "ganho");
        continue;
      }
      // Ganho no card: a chave é o id do card, e a conversa vem do funil.
      const item = (await doFunil()).get(chave);
      if (item?.conversaId) registrar(item.conversaId, item.titulo, "ganho");
    }
  }

  // ── Fonte 2: entrou numa etapa de vitória ───────────────────────────────
  if (etapasDeVitoria.length) {
    const { data: eventos } = await supabase
      .from("pipeline_deal_events")
      .select("item_id, meta, created_at")
      .eq("owner_id", ownerId)
      .eq("kind", "stage")
      .order("created_at", { ascending: false })
      .limit(500);

    const emEtapaDeVitoria = (eventos ?? []).filter((e: any) =>
      etapasDeVitoria.includes(String(e?.meta?.stageId ?? "")),
    );
    for (const ev of emEtapaDeVitoria) {
      // `item_id` aqui é o id do CARD, não da conversa — por isso o cruzamento.
      // Card que nasceu sem conversa não tem transcrição para aprender e some
      // em silêncio: não é erro, é card sem o que ensinar.
      const item = (await doFunil()).get(String(ev.item_id));
      if (item?.conversaId) registrar(item.conversaId, item.titulo, "etapa");
    }
  }

  if (!novas.length) {
    if (!aprenderDeGanhos && !etapasDeVitoria.length) {
      return { novas: 0, motivo: "nenhuma fonte de aprendizado escolhida" };
    }
    return { novas: 0, motivo: "nenhuma venda nova desde a última rodada" };
  }

  const { error } = await supabase.from("ai_playbook_sources").insert(
    novas.map((n) => ({
      owner_id: ownerId,
      playbook_id: playbookId,
      conversation_id: n.conversation_id,
      contact_name: n.contact_name,
      source: n.source,
      // Toda fonte nasce como `pessoa`: hoje quem marca Ganho e move card é
      // gente. Quando o agente ganhar regra de mover card sozinho, quem gravar
      // a movimentação dele marca `agente` — e o aprendizado continua lendo só
      // as de pessoa.
      moved_by: "pessoa",
    })),
  );
  if (error) throw new Error(error.message);
  return {
    novas: novas.length,
    motivo: null,
    porFonte: {
      ganho: novas.filter((n) => n.source === "ganho").length,
      etapa: novas.filter((n) => n.source === "etapa").length,
    },
  };
}

// ── Coleta pelo espelho ────────────────────────────────────────────────────
//
// A coleta pelo funil acima não acha nada e não vai achar tão cedo: o funil
// começou do zero quando saímos do CRM (0 cards), e os "ganhos" que sobraram
// apontam para ids de cards que não existem mais. Ela fica, porque volta a ser
// a melhor fonte no dia em que houver card — venda marcada por uma pessoa é
// evidência mais forte do que qualquer inferência.
//
// Esta aqui é a que funciona hoje. A evidência que ela usa no lugar do funil é
// a ficha: a pessoa daquela conversa virou paciente da clínica. São 42
// conversas assim com troca real, contra 318 com troca real no total.

/**
 * Quem já é paciente, pelo id de contato do WhatsApp.
 *
 * `patients.crm_contact_id` e não `wa_contacts.patient_id`: a segunda parece
 * feita para isto e tem 690 linhas preenchidas, mas **nada no código a
 * escreve** — foi um backfill que congelou. Esta é a mesma coluna que
 * `getPatientByCrmContact` usa para escrever "Paciente da clínica" no painel
 * do chat, então a tela e o aprendizado enxergam a mesma pessoa.
 */
async function contatosComFicha(ownerId: string): Promise<Set<string>> {
  const linhas = await lerTudo<{ crm_contact_id: string | null }>(
    (de, ate) =>
      supabase
        .from("patients")
        .select("crm_contact_id")
        .eq("owner_id", ownerId)
        .not("crm_contact_id", "is", null)
        .order("crm_contact_id", { ascending: true })
        .range(de, ate),
    "pacientes",
  );
  return new Set(linhas.map((l) => String(l.crm_contact_id ?? "")).filter(Boolean));
}

/** As conversas do espelho, com quantas mensagens cada lado escreveu. */
async function conversasDoEspelho(ownerId: string): Promise<ConversaDoCorpus[]> {
  const [mensagens, conversas, comFicha] = await Promise.all([
    lerTudo<{
      crm_conversation_id: string | null;
      from_me: boolean | null;
      body: string | null;
      is_private: boolean | null;
    }>(
      (de, ate) =>
        supabase
          .from("wa_messages")
          .select("crm_conversation_id, from_me, body, is_private")
          .eq("owner_id", ownerId)
          // Ordem única: sem ela o `.range` repete linha e pula linha, calado.
          .order("sent_at", { ascending: true })
          .order("crm_message_id", { ascending: true })
          .range(de, ate),
      "mensagens do espelho",
    ),
    lerTudo<{
      crm_conversation_id: string | null;
      crm_contact_id: string | null;
      last_message_at: string | null;
    }>(
      (de, ate) =>
        supabase
          .from("wa_conversations")
          .select("crm_conversation_id, crm_contact_id, last_message_at")
          .eq("owner_id", ownerId)
          .order("crm_conversation_id", { ascending: true })
          .range(de, ate),
      "conversas do espelho",
    ),
    contatosComFicha(ownerId),
  ]);

  const contas = contarPorConversa(mensagens);

  return conversas.map((c) => {
    const id = String(c.crm_conversation_id ?? "");
    const conta = contas.get(id) ?? { daClinica: 0, doContato: 0 };
    return {
      conversationId: id,
      // O nome mora em `wa_contacts`, não aqui. Ele é só rótulo na tela de
      // "de onde ele aprendeu" — não vale uma terceira leitura da base inteira.
      contactName: null,
      ehPaciente: comFicha.has(String(c.crm_contact_id ?? "")),
      daClinica: conta.daClinica,
      doContato: conta.doContato,
      ultimaEm: String(c.last_message_at ?? ""),
    };
  });
}

/** Escolhe as conversas da rodada e as registra como fonte. */
async function coletarDoEspelho(
  ownerId: string,
  playbookId: string,
  vagas: number,
): Promise<{ novas: number; motivo: string | null; porFonte?: Record<string, number> }> {
  if (vagas <= 0) return { novas: 0, motivo: null };

  const { data: jaConhecidas } = await supabase
    .from("ai_playbook_sources")
    .select("conversation_id")
    .eq("playbook_id", playbookId);
  const conhecidas = new Set((jaConhecidas ?? []).map((s: any) => String(s.conversation_id)));

  const escolhidas = escolherConversas(await conversasDoEspelho(ownerId), conhecidas, vagas);
  if (!escolhidas.length) {
    return { novas: 0, motivo: "nenhuma conversa nova com troca dos dois lados" };
  }

  // `upsert` e não `insert`: o cron das 7h e o botão "Aprender agora" podem
  // correr juntos, e o índice único faria a rodada inteira morrer por uma
  // conversa repetida que não era problema nenhum.
  const { error } = await supabase.from("ai_playbook_sources").upsert(
    escolhidas.map((c) => ({
      owner_id: ownerId,
      playbook_id: playbookId,
      conversation_id: c.conversationId,
      contact_name: c.contactName,
      source: c.source,
      moved_by: "pessoa",
    })),
    { onConflict: "playbook_id,conversation_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);

  return {
    novas: escolhidas.length,
    motivo: null,
    porFonte: {
      paciente: escolhidas.filter((c) => c.source === "paciente").length,
      conversa: escolhidas.filter((c) => c.source === "conversa").length,
    },
  };
}

// ── Transcrição ────────────────────────────────────────────────────────────

async function transcricao(ownerId: string, conversationId: string): Promise<string | null> {
  // Lia `/api/v1/conversations/{id}/messages` na conta do CRM. Agora sai do
  // espelho, que tem as duas origens — o histórico herdado e tudo o que passou
  // pela conexão própria.
  const { data: msgs, error } = await supabase
    .from("wa_messages")
    .select("body, from_me, is_private, sent_at")
    .eq("owner_id", ownerId)
    .eq("crm_conversation_id", conversationId)
    // As ÚLTIMAS mensagens, não as primeiras: o fechamento é onde a venda
    // acontece, e é o que se quer aprender. Vêm da mais nova para a mais
    // velha e são reviradas abaixo.
    .order("sent_at", { ascending: false })
    .limit(JANELA_DE_MENSAGENS);
  if (error) {
    console.error(`[ai-playbook] transcrição de ${conversationId}:`, error.message);
    return null;
  }
  if (!msgs?.length) return null;

  const linhas: string[] = [];
  for (const m of [...msgs].reverse()) {
    // Nota interna é conversa da equipe sobre o paciente, não com ele. Ensinar
    // o agente com ela faria o que é combinado nos bastidores sair na resposta.
    if (m.is_private) continue;
    const texto = String(m?.body ?? "").trim();
    if (!texto) continue; // anexo sem legenda não ensina nada
    linhas.push(`${m.from_me ? "CLÍNICA" : "PACIENTE"}: ${texto.slice(0, MAX_CARACTERES)}`);
  }
  return linhas.length ? linhas.join("\n") : null;
}

// ── Aprendizado ────────────────────────────────────────────────────────────

/**
 * A ordem em que as fontes entram no prompt.
 *
 * Venda marcada por uma pessoa é a evidência mais forte; ficha de paciente vem
 * logo atrás; conversa de desfecho desconhecido é a mais fraca. Sem esta
 * ordem, vinte fontes gravadas no mesmo instante saem em ordem arbitrária do
 * banco, e uma venda de verdade pode ficar de fora do prompt por sorteio.
 */
const PESO_DA_FONTE: Record<string, number> = { ganho: 0, etapa: 1, paciente: 2, conversa: 3 };

async function aprender(ownerId: string, playbookId: string, chaveDaClinica: string | null) {
  const { data: fontes } = await supabase
    .from("ai_playbook_sources")
    .select("conversation_id, source")
    // Só o que uma PESSOA moveu. Ver o comentário da coluna na migration: um
    // agente que move card sozinho geraria a própria matéria-prima de treino.
    .eq("moved_by", "pessoa")
    .eq("playbook_id", playbookId)
    .order("learned_at", { ascending: false })
    // Lê mais do que cabe no prompt para poder ESCOLHER quais vão — o corte
    // por peso abaixo é que decide, não a ordem de gravação.
    .limit(MAX_FONTES * 3);

  if (!fontes?.length) return { aprendeu: false, motivo: "nenhuma conversa registrada ainda" };

  const ordenadas = [...fontes].sort(
    (a: any, b: any) => (PESO_DA_FONTE[a.source] ?? 9) - (PESO_DA_FONTE[b.source] ?? 9),
  );

  const paraAprender: FonteParaAprender[] = [];
  for (const f of ordenadas) {
    if (paraAprender.length >= MAX_FONTES) break;
    const t = await transcricao(ownerId, String(f.conversation_id));
    if (t) {
      paraAprender.push({
        texto: t,
        // "ganho" e "etapa" vêm do funil: alguém marcou a venda à mão. É a
        // evidência mais forte que existe aqui, mais ainda que a ficha.
        virouPaciente: f.source === "paciente" || f.source === "ganho" || f.source === "etapa",
      });
    }
  }
  if (!paraAprender.length) {
    return { aprendeu: false, motivo: "essas conversas não têm mensagens legíveis" };
  }

  // A chave da clínica, quando ela tem uma. Sem este argumento o aprendizado
  // usava só o segredo do ambiente — e a chave que a pessoa acabou de colar na
  // tela do agente não valeria justamente aqui.
  const resposta = await clienteDaIa(chaveDaClinica).messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    // A tarefa é DESCREVER o que está escrito, não inventar método. Esforço
    // médio é o ponto em que ela é feita com cuidado sem virar ensaio.
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: FORMATO_DO_MANUAL },
    messages: [{ role: "user", content: promptDeAprendizado(paraAprender) }],
  });

  if (resposta.stop_reason === "refusal") {
    return { aprendeu: false, motivo: "o modelo recusou analisar estas conversas" };
  }

  const bloco = resposta.content.find((b: any) => b.type === "text");
  const texto = (bloco as any)?.text ?? "";
  let manual: ManualDeVendas;
  try {
    manual = JSON.parse(texto);
  } catch {
    return { aprendeu: false, motivo: "a resposta do modelo não veio no formato esperado" };
  }

  // `overrides` NÃO é tocado. É a regra que faz a correção humana sobreviver ao
  // reaprendizado — sem ela, toda rodada apagaria o que a pessoa consertou.
  const { error } = await supabase
    .from("ai_sales_playbooks")
    .update({
      learned: manual,
      last_learned_at: new Date().toISOString(),
      last_skip_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playbookId);
  if (error) throw new Error(error.message);

  return { aprendeu: true, fontes: paraAprender.length };
}

// ── Estado ─────────────────────────────────────────────────────────────────

async function garantirPlaybook(ownerId: string) {
  const { data } = await supabase
    .from("ai_sales_playbooks")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (data) return data;
  const { data: novo, error } = await supabase
    .from("ai_sales_playbooks")
    .insert({ owner_id: ownerId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return novo;
}

async function garantirAgente(ownerId: string) {
  const { data } = await supabase.from("ai_agents").select("*").eq("owner_id", ownerId).maybeSingle();
  if (data) return data;
  const { data: novo, error } = await supabase
    .from("ai_agents")
    .insert({ owner_id: ownerId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return novo;
}

async function handleEstado(ownerId: string) {
  const [agente, playbook] = [await garantirAgente(ownerId), await garantirPlaybook(ownerId)];
  const { data: fontes } = await supabase
    .from("ai_playbook_sources")
    .select("source")
    .eq("playbook_id", playbook.id)
    .eq("moved_by", "pessoa");
  const lista = fontes ?? [];
  const total = lista.length;
  // `vendas` conta só o que veio do funil — venda marcada por uma pessoa. As
  // conversas do espelho contam para a confiança, mas NÃO podem ser somadas
  // como venda: a tela diria "20 vendas" sem que exista uma, e o número que
  // deveria dar segurança viraria o menos confiável da página.
  const vendas = lista.filter((f: any) => f.source === "ganho" || f.source === "etapa").length;
  return {
    ok: true,
    agente,
    playbook,
    vendas,
    conversas: total - vendas,
    confiavel: total >= MINIMO_PARA_CONFIAR,
    faltam: Math.max(MINIMO_PARA_CONFIAR - total, 0),
    // Só SE existe, nunca o valor. Sem isto, a falta da chave só aparecia como
    // erro depois de alguém clicar em "Aprender agora". Considera a chave da
    // clínica e o segredo do ambiente, nessa ordem.
    temChave: temChave(agente?.api_key ?? null),
    // De onde o manual aprendeu. Responde "aprendeu com o quê?" — a pergunta
    // que aparece assim que o número surpreende.
    porFonte: {
      ganho: lista.filter((f: any) => f.source === "ganho").length,
      etapa: lista.filter((f: any) => f.source === "etapa").length,
      paciente: lista.filter((f: any) => f.source === "paciente").length,
      conversa: lista.filter((f: any) => f.source === "conversa").length,
    },
  };
}

/** O ciclo inteiro. Chamado pelo cron e pelo botão "Aprender agora". */
async function handleCiclo(ownerId: string) {
  const agente = await garantirAgente(ownerId);
  const playbook = await garantirPlaybook(ownerId);
  const etapas = Array.isArray(agente.winning_stage_ids)
    ? agente.winning_stage_ids.map(String)
    : [];

  // Duas fontes, nesta ordem. O funil primeiro porque venda marcada por uma
  // pessoa é a evidência mais forte — hoje ele devolve zero, mas volta a
  // valer assim que houver card. O espelho preenche as vagas que sobrarem.
  const doFunil = await coletarVendas(ownerId, playbook.id, etapas, agente.learn_from_won !== false);
  const doEspelho = await coletarDoEspelho(ownerId, playbook.id, MAX_FONTES - doFunil.novas);

  const novas = doFunil.novas + doEspelho.novas;
  if (novas === 0) {
    // Para aqui de propósito: reaprender sem conversa nova gastaria uma
    // chamada de modelo para produzir exatamente o mesmo texto.
    const motivo = doEspelho.motivo ?? doFunil.motivo;
    await supabase
      .from("ai_sales_playbooks")
      .update({ last_skip_reason: motivo })
      .eq("id", playbook.id);
    return { ok: true, novas: 0, aprendeu: false, motivo };
  }

  const resultado = await aprender(ownerId, playbook.id, agente.api_key ?? null);
  if (!resultado.aprendeu) {
    await supabase
      .from("ai_sales_playbooks")
      .update({ last_skip_reason: resultado.motivo })
      .eq("id", playbook.id);
  }
  return { ok: true, novas, ...resultado };
}

/** A instrução exata que o agente vai receber. A tela pede AQUI em vez de
 *  montar por conta: uma cópia no navegador poderia mostrar regras de segurança
 *  diferentes das que estão valendo. */
async function handleInstrucao(ownerId: string) {
  const agente = await garantirAgente(ownerId);
  const playbook = await garantirPlaybook(ownerId);

  const { data: escolhidos } = await supabase
    .from("ai_agent_procedures")
    .select("procedure_id")
    .eq("agent_id", agente.id);
  const ids = (escolhidos ?? []).map((e: any) => e.procedure_id);

  let procedimentos: any[] = [];
  if (ids.length) {
    const { data } = await supabase
      .from("clinic_procedures")
      .select("name, price, duration_minutes, category")
      .eq("owner_id", ownerId)
      .eq("active", true)
      .in("id", ids);
    procedimentos = data ?? [];
  }

  const { data: unidade } = await supabase
    .from("clinic_units")
    .select("name")
    .eq("owner_id", ownerId)
    // A unidade padrão, não "a primeira que vier": o nome entra na primeira
    // frase que o paciente lê, e sair errado é o tipo de detalhe que denuncia
    // automação.
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    ok: true,
    instrucao: montarInstrucao({
      clinica: unidade?.name ?? "NÓS Odontologia",
      manual: manualEfetivo(playbook.learned, playbook.overrides),
      procedimentos: procedimentos.map((p) => ({
        nome: p.name,
        preco: p.price ?? null,
        duracaoMinutos: p.duration_minutes ?? null,
        categoria: p.category ?? null,
      })),
    }),
  };
}

/**
 * Roda o atendimento com uma mensagem escrita na tela.
 *
 * Passa pelo MESMO `atender` do webhook — filtros, humanização, segmentação e
 * modelo. O que muda é só o `enviar`, que aqui coleta numa lista em vez de
 * mandar pelo WhatsApp, e o histórico, que vem vazio.
 *
 * É o que torna o atendimento testável de verdade: nada sai para paciente
 * nenhum.
 */
async function handleSimular(ownerId: string, texto: string) {
  const enviados: { texto: string; esperaMs: number }[] = [];
  const agente = await garantirAgente(ownerId);
  const chave: string | null = agente?.api_key ?? null;
  const resultado = await atender(
    {
      supabase,
      ownerId,
      historico: async () => [],
      responderComIa: (instrucao, historico, mensagem) =>
        responderPaciente(instrucao, historico, mensagem, chave),
      // Sem `dormir`: a simulação MOSTRA a espera calculada em vez de esperar.
      // Esperar de verdade aqui só faria a tela travar pelo mesmo tempo.
      enviar: async (pedaco, esperaMs) => {
        enviados.push({ texto: pedaco, esperaMs });
      },
    },
    {
      conversationId: `simulacao-${ownerId}`,
      contactName: "Simulação",
      conteudo: texto,
      daClinica: false,
      privada: false,
      // A simulação nunca é grupo: quem escreve é quem está na tela.
      ehGrupo: false,
    },
  );
  return { ok: true, ...resultado, enviados };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { ownerId, action, texto } = (await req.json()) as {
      ownerId?: string;
      action?: string;
      texto?: string;
    };
    if (!ownerId || !action) {
      return new Response(JSON.stringify({ error: "ownerId e action são obrigatórios" }), {
        status: 400,
      });
    }

    let result: unknown;
    if (action === "estado") result = await handleEstado(ownerId);
    else if (action === "ciclo") result = await handleCiclo(ownerId);
    else if (action === "instrucao") result = await handleInstrucao(ownerId);
    else if (action === "simular") result = await handleSimular(ownerId, String(texto ?? ""));
    else {
      return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), {
        status: 400,
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[ai-playbook]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
