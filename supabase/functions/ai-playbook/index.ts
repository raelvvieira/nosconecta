// O motor que aprende a atender lendo as conversas que viraram venda.
//
// ── O ciclo ────────────────────────────────────────────────────────────────
//
//   coletar  →  achar as conversas que entraram numa etapa de vitória
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
import { crmFetch } from "../_shared/crm-auth.ts";
import { atender } from "../_shared/atendimento.ts";
import { clienteDaIa, responderPaciente, temChave } from "../_shared/modelo-de-atendimento.ts";
import { unwrap } from "../_shared/crm-client.ts";
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
      descoberta: { type: "string" },
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
function promptDeAprendizado(transcricoes: string[]): string {
  const vendas = transcricoes.map((t, i) => `--- VENDA ${i + 1} ---\n${t}`).join("\n\n");
  return [
    "Abaixo estão conversas reais de WhatsApp que TERMINARAM EM VENDA nesta",
    "clínica odontológica brasileira. Seu trabalho é descobrir o MÉTODO de",
    "atendimento desta equipe: como ela fala, o que funciona, o que ela responde",
    "quando o paciente hesita.",
    "",
    "Regras:",
    "- Baseie tudo no que está escrito nas conversas. Não invente técnica de",
    "  vendas genérica que não apareça ali.",
    "- Cite frases reais sempre que puder — são elas que ensinam.",
    "- Escreva em português do Brasil, simples e direto.",
    "- Se só houver uma conversa, descreva o que dá para observar, sem",
    "  generalizar demais.",
    "- Não inclua preço específico em `apresentacao_preco`: descreva o MOMENTO e",
    "  a FORMA de falar de valor. Os preços vêm da tabela da clínica, não daqui.",
    "",
    vendas,
  ].join("\n");
}

// ── Coleta ─────────────────────────────────────────────────────────────────

interface ItemDoFunil {
  id: string;
  tipo: "conversation" | "contact";
  itemId: string;
  titulo: string | null;
}

async function itensDoFunil(ownerId: string): Promise<Map<string, ItemDoFunil>> {
  const { data: cred } = await supabase
    .from("crm_credentials")
    .select("pipeline_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const pipelineId = cred?.pipeline_id;
  const mapa = new Map<string, ItemDoFunil>();
  if (!pipelineId) return mapa;

  const res = await crmFetch(supabase, ownerId, `/api/v1/pipelines/${pipelineId}/pipeline_items`);
  const bruto = unwrap(res);
  const lista = Array.isArray(bruto) ? bruto : (bruto?.items ?? bruto?.pipeline_items ?? []);
  for (const row of Array.isArray(lista) ? lista : []) {
    const id = String(row?.id ?? "");
    if (!id) continue;
    mapa.set(id, {
      id,
      tipo: row?.type === "contact" ? "contact" : "conversation",
      itemId: String(row?.item_id ?? row?.conversation_id ?? row?.contact_id ?? ""),
      titulo: row?.title ?? row?.contact?.name ?? null,
    });
  }
  return mapa;
}

/**
 * As vendas novas desde a última rodada.
 *
 * Lê `pipeline_deal_events` — o registro LOCAL de movimentação de etapa, que é
 * onde `movePipelineItem` grava toda mudança. `item_id` ali é o id do CARD, não
 * da conversa, por isso o cruzamento com a lista de itens do funil.
 */
async function coletarVendas(ownerId: string, playbookId: string, etapasDeVitoria: string[]) {
  if (!etapasDeVitoria.length) {
    return { novas: 0, motivo: "nenhuma etapa de vitória escolhida" };
  }

  const { data: eventos } = await supabase
    .from("pipeline_deal_events")
    .select("item_id, meta, created_at")
    .eq("owner_id", ownerId)
    .eq("kind", "stage")
    .order("created_at", { ascending: false })
    .limit(500);

  const ganhos = (eventos ?? []).filter((e: any) =>
    etapasDeVitoria.includes(String(e?.meta?.stageId ?? "")),
  );
  if (!ganhos.length) return { novas: 0, motivo: "nenhum card entrou numa etapa de vitória" };

  const { data: jaConhecidas } = await supabase
    .from("ai_playbook_sources")
    .select("conversation_id")
    .eq("playbook_id", playbookId);
  const conhecidas = new Set((jaConhecidas ?? []).map((s: any) => String(s.conversation_id)));

  const itens = await itensDoFunil(ownerId);
  const novas: { conversation_id: string; contact_name: string | null }[] = [];
  const vistas = new Set<string>();

  for (const ev of ganhos) {
    const item = itens.get(String(ev.item_id));
    // Card que só existe como contato não tem transcrição para aprender. Some
    // em silêncio de propósito: não é erro, é um card de outro tipo.
    if (!item || item.tipo !== "conversation" || !item.itemId) continue;
    if (conhecidas.has(item.itemId) || vistas.has(item.itemId)) continue;
    vistas.add(item.itemId);
    novas.push({ conversation_id: item.itemId, contact_name: item.titulo });
  }

  if (!novas.length) return { novas: 0, motivo: "nenhuma venda nova desde a última rodada" };

  const { error } = await supabase.from("ai_playbook_sources").insert(
    novas.map((n) => ({
      owner_id: ownerId,
      playbook_id: playbookId,
      conversation_id: n.conversation_id,
      contact_name: n.contact_name,
      // Toda fonte nasce como `pessoa`: hoje quem move card é gente. Quando o
      // agente ganhar regra de mover card sozinho, quem gravar a movimentação
      // dele marca `agente` — e o aprendizado continua lendo só as de pessoa.
      moved_by: "pessoa",
    })),
  );
  if (error) throw new Error(error.message);
  return { novas: novas.length, motivo: null };
}

// ── Transcrição ────────────────────────────────────────────────────────────

async function transcricao(ownerId: string, conversationId: string): Promise<string | null> {
  try {
    const res = await crmFetch(
      supabase,
      ownerId,
      `/api/v1/conversations/${conversationId}/messages`,
    );
    const msgs = unwrap(res);
    if (!Array.isArray(msgs) || !msgs.length) return null;

    // As ÚLTIMAS mensagens, não as primeiras: o fechamento é onde a venda
    // acontece, e é o que se quer aprender.
    const janela = msgs.slice(-JANELA_DE_MENSAGENS);
    const linhas: string[] = [];
    for (const m of janela) {
      const texto = String(m?.content ?? "").trim();
      if (!texto) continue; // anexo sem legenda não ensina nada
      const tipo = m?.message_type;
      const daClinica = tipo === 1 || tipo === "1" || tipo === "outgoing";
      linhas.push(`${daClinica ? "CLÍNICA" : "PACIENTE"}: ${texto.slice(0, MAX_CARACTERES)}`);
    }
    return linhas.length ? linhas.join("\n") : null;
  } catch {
    return null; // conversa que sumiu do CRM não derruba a rodada inteira
  }
}

// ── Aprendizado ────────────────────────────────────────────────────────────

async function aprender(ownerId: string, playbookId: string) {
  const { data: fontes } = await supabase
    .from("ai_playbook_sources")
    .select("conversation_id")
    // Só o que uma PESSOA moveu. Ver o comentário da coluna na migration: um
    // agente que move card sozinho geraria a própria matéria-prima de treino.
    .eq("moved_by", "pessoa")
    .eq("playbook_id", playbookId)
    .order("learned_at", { ascending: false })
    .limit(MAX_FONTES);

  if (!fontes?.length) return { aprendeu: false, motivo: "nenhuma venda registrada ainda" };

  const transcricoes: string[] = [];
  for (const f of fontes) {
    const t = await transcricao(ownerId, String(f.conversation_id));
    if (t) transcricoes.push(t);
  }
  if (!transcricoes.length) {
    return { aprendeu: false, motivo: "as conversas dessas vendas não têm mensagens legíveis" };
  }

  const resposta = await clienteDaIa().messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    // A tarefa é DESCREVER o que está escrito, não inventar método. Esforço
    // médio é o ponto em que ela é feita com cuidado sem virar ensaio.
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: FORMATO_DO_MANUAL },
    messages: [{ role: "user", content: promptDeAprendizado(transcricoes) }],
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

  return { aprendeu: true, fontes: transcricoes.length };
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
  const { count } = await supabase
    .from("ai_playbook_sources")
    .select("id", { count: "exact", head: true })
    .eq("playbook_id", playbook.id)
    .eq("moved_by", "pessoa");
  const vendas = count ?? 0;
  return {
    ok: true,
    agente,
    playbook,
    vendas,
    confiavel: vendas >= MINIMO_PARA_CONFIAR,
    faltam: Math.max(MINIMO_PARA_CONFIAR - vendas, 0),
    // Só SE existe, nunca o valor. Sem isto, a falta da chave só aparecia como
    // erro depois de alguém clicar em "Aprender agora".
    temChave: temChave(),
  };
}

/** O ciclo inteiro. Chamado pelo cron e pelo botão "Aprender agora". */
async function handleCiclo(ownerId: string) {
  const agente = await garantirAgente(ownerId);
  const playbook = await garantirPlaybook(ownerId);
  const etapas = Array.isArray(agente.winning_stage_ids)
    ? agente.winning_stage_ids.map(String)
    : [];

  const coleta = await coletarVendas(ownerId, playbook.id, etapas);
  if (coleta.novas === 0) {
    // Para aqui de propósito: reaprender sem venda nova gastaria uma chamada
    // de modelo para produzir o mesmo texto.
    await supabase
      .from("ai_sales_playbooks")
      .update({ last_skip_reason: coleta.motivo })
      .eq("id", playbook.id);
    return { ok: true, novas: 0, aprendeu: false, motivo: coleta.motivo };
  }

  const resultado = await aprender(ownerId, playbook.id);
  if (!resultado.aprendeu) {
    await supabase
      .from("ai_sales_playbooks")
      .update({ last_skip_reason: resultado.motivo })
      .eq("id", playbook.id);
  }
  return { ok: true, novas: coleta.novas, ...resultado };
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
 * falar com o CRM, e o histórico, que vem vazio.
 *
 * É o que torna o atendimento testável sem depender do registro no CRM: nada
 * sai para paciente nenhum.
 */
async function handleSimular(ownerId: string, texto: string) {
  const enviados: { texto: string; esperaMs: number }[] = [];
  const resultado = await atender(
    {
      supabase,
      ownerId,
      historico: async () => [],
      responderComIa: responderPaciente,
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
