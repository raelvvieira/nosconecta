// O atendimento: da mensagem que chega até a resposta que sai.
//
// ── Por que mora em _shared/ ───────────────────────────────────────────────
//
// Dois caminhos entram aqui: o webhook da conexão própria, que recebe cada
// mensagem que o paciente manda, e a SIMULAÇÃO da tela, que manda uma mensagem
// de mentira. Os dois passam por esta mesma função — se a simulação tivesse
// código próprio, ela provaria o código da simulação, não o do atendimento. O
// que muda entre eles é o `enviar` (um manda pelo WhatsApp, o outro coleta
// numa lista) e o `historico`.
//
// ── O que este arquivo NÃO decide ──────────────────────────────────────────
//
// As regras de repasse para humano (`instrucao-do-agente.ts`) e os filtros
// (`filtros-do-agente.ts`) moram em outros arquivos, de propósito. Aqui é a
// orquestração; lá é a decisão. Misturar as três coisas foi o que produziu, na
// referência, um arquivo em que ninguém achava mais o filtro que importava.
import { decidirSeResponde, registrarFalha, registrarSucesso } from "./filtros-do-agente.ts";
import { esperaDeDigitacao, normalizarRitmo, segmentar } from "./humanizacao.ts";
import { manualEfetivo, montarInstrucao } from "./instrucao-do-agente.ts";
import { agoraNaClinica, horariosParaOferecer } from "./agenda-da-clinica.ts";
import { semTravessao } from "./sem-travessao.ts";

export interface MensagemDeEntrada {
  conversationId: string;
  contactId?: string | null;
  contactName?: string | null;
  conteudo: string | null;
  daClinica: boolean;
  privada: boolean;
  /** Veio de um grupo do WhatsApp. O agente nunca responde em grupo — ver
   *  `filtros-do-agente.ts`. Opcional para quem não tem como saber (a
   *  simulação da tela), e aí vale `false`. */
  ehGrupo?: boolean;
  /**
   * A pessoa já tem ficha de paciente.
   *
   * Opcional, e o padrão é `false` — o lado PERMISSIVO. Isso é seguro só
   * porque o único chamador autorizado a omitir é a simulação da tela, que
   * não envia nada a ninguém. O webhook passa os dois sempre, explicitamente:
   * omitir ali soltaria a IA em cima de paciente sem que nada acusasse.
   */
  ehPaciente?: boolean;
  /** A conversa nasceu dentro da janela de contato novo. Mesma regra de
   *  omissão do campo acima. */
  conversaNova?: boolean;
}

/** Manda um pedaço da resposta. `esperaMs` é o tempo de digitação antes dele. */
export type Enviar = (pedaco: string, esperaMs: number) => Promise<void>;

export interface Dependencias {
  supabase: any;
  ownerId: string;
  /** As últimas mensagens da conversa, para o modelo ter contexto. */
  historico: (
    conversationId: string,
  ) => Promise<{ deQuem: "clinica" | "paciente"; texto: string }[]>;
  /** Chama o modelo. Separado para a simulação poder rodar sem chave. */
  responderComIa: (instrucao: string, historico: string, mensagem: string) => Promise<string>;
  enviar: Enviar;
  agora?: Date;
  /**
   * Rodar mesmo com o agente desligado. **Só a simulação da tela passa isto.**
   *
   * ── Por que existe ────────────────────────────────────────────────────
   *
   * A simulação existe para responder "o que ela diria?" sem deixar que ela
   * diga a um paciente. Mas `decidirSeResponde` checa o interruptor primeiro,
   * então com o agente desligado a tela de teste devolvia "agente desligado" e
   * mais nada — e a única maneira de ver uma resposta era LIGAR o agente em
   * cima das conversas reais.
   *
   * Isto é o oposto do que a tela promete. Ela virava um botão que só
   * funcionava depois de você ter corrido o risco que ela existe para evitar.
   *
   * ── Por que não é o filtro que muda ───────────────────────────────────
   *
   * `decidirSeResponde` continua pura e continua dizendo a verdade: agente
   * desligado não responde. O que muda é o estado que ESTE chamador informa, e
   * só quando quem chamou é a simulação — que não tem `enviar` para o
   * WhatsApp, e por isso não tem como escapar para ninguém.
   *
   * Os outros filtros continuam todos valendo, inclusive o disjuntor: se o
   * modelo estiver falhando, a simulação precisa mostrar isso e não esconder.
   */
  ignorarInterruptor?: boolean;
}

export interface ResultadoDoAtendimento {
  respondeu: boolean;
  motivo?: string;
  pedacos: string[];
}

/** O relógio que vale, respeitando `deps.agora` — é o que permite fixar o tempo
 *  no teste e na simulação em vez de depender da hora em que se roda. */
function agoraDoAtendimento(deps: Dependencias): Date {
  return deps.agora ?? new Date();
}

/** Quantas mensagens da conversa vão como contexto. Suficiente para o modelo
 *  saber do que se está falando, curto o bastante para não virar custo. */
const JANELA_DE_CONTEXTO = 20;

export async function atender(
  deps: Dependencias,
  entrada: MensagemDeEntrada,
): Promise<ResultadoDoAtendimento> {
  const { supabase, ownerId } = deps;
  const agora = deps.agora ?? new Date();

  const { data: agente } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!agente) return { respondeu: false, motivo: "agente não existe", pedacos: [] };

  const sessao = await garantirSessao(supabase, ownerId, agente.id, entrada);

  const decisao = decidirSeResponde(
    {
      // Ver `ignorarInterruptor` em `Dependencias`: só a simulação da tela
      // passa `true`, e ela não envia nada a ninguém.
      ligado: deps.ignorarInterruptor === true || !!agente.enabled,
      circuitoAbertoAte: agente.circuit_open_until ?? null,
      // `!== false` e não `!!`: a coluna nasceu depois das linhas que já
      // existiam, e uma linha antiga traz `undefined`. Com `!!` o filtro
      // nasceria DESLIGADO justamente na clínica que já tinha agente — o
      // contrário do que a migration promete com `DEFAULT true`.
      soParaNaoPaciente: agente.so_para_nao_paciente !== false,
      soParaConversaNova: agente.so_para_conversa_nova !== false,
    },
    { humanoAssumiuEm: sessao.human_took_over_at ?? null },
    {
      conteudo: entrada.conteudo,
      daClinica: entrada.daClinica,
      privada: entrada.privada,
      ehGrupo: !!entrada.ehGrupo,
      ehPaciente: !!entrada.ehPaciente,
      conversaNova: entrada.conversaNova !== false,
    },
    agora,
  );

  // A mensagem entra no registro ANTES da decisão, e a decisão vira uma linha
  // com o motivo. É isso que transforma "a IA não respondeu" de mistério em
  // linha lida.
  await registrar(supabase, ownerId, sessao.id, {
    direction: decisao.responde ? "entrada" : "ignorada",
    content: entrada.conteudo,
    skipped_reason: decisao.responde ? null : decisao.motivo,
  });

  if (!decisao.responde) {
    // Mensagem da própria clínica que NÃO é da IA = uma pessoa assumiu. É o
    // `human_takeover`: daqui em diante a IA se cala nesta conversa até alguém
    // devolvê-la na tela.
    if (decisao.motivo === "mensagem da própria clínica" && !sessao.human_took_over_at) {
      await supabase
        .from("ai_agent_sessions")
        .update({ human_took_over_at: agora.toISOString(), updated_at: agora.toISOString() })
        .eq("id", sessao.id);
    }
    return { respondeu: false, motivo: decisao.motivo, pedacos: [] };
  }

  await supabase
    .from("ai_agent_sessions")
    .update({ last_inbound_at: agora.toISOString(), updated_at: agora.toISOString() })
    .eq("id", sessao.id);

  let texto: string;
  try {
    texto =
      agente.mode === "ia"
        ? await responderComModelo(deps, agente, entrada)
        : String(agente.echo_message ?? "").trim();
    if (!texto) return { respondeu: false, motivo: "resposta vazia", pedacos: [] };
  } catch (e) {
    const novo = registrarFalha(
      { falhas: Number(agente.failure_count ?? 0), abertoAte: agente.circuit_open_until ?? null },
      agora,
    );
    await supabase
      .from("ai_agents")
      .update({ failure_count: novo.falhas, circuit_open_until: novo.abertoAte })
      .eq("id", agente.id);
    await registrar(supabase, ownerId, sessao.id, {
      direction: "ignorada",
      content: null,
      skipped_reason: `falha ao gerar resposta: ${String(e).slice(0, 300)}`,
    });
    throw e;
  }

  const ritmo = normalizarRitmo({
    debounceSegundos: agente.debounce_seconds,
    segmentar: agente.segment_enabled,
    limite: agente.segment_limit,
    minimo: agente.segment_min_size,
    msPorCaractere: Number(agente.delay_per_character ?? 0),
  });

  // O travessão sai ANTES de segmentar. Depois seria pior: o corte olharia um
  // comprimento que ainda vai mudar, e um pedaço poderia começar com a vírgula
  // que o filtro acabou de criar.
  //
  // Vale para os dois modos, não só o de IA: a frase fixa também é escrita por
  // uma pessoa, e uma pessoa que colou texto de algum lugar pode ter trazido
  // travessão junto.
  const pedacos = segmentar(semTravessao(texto), ritmo);
  for (const pedaco of pedacos) {
    await deps.enviar(pedaco, esperaDeDigitacao(pedaco, ritmo));
    await registrar(supabase, ownerId, sessao.id, { direction: "saida", content: pedaco });
  }

  const zerado = registrarSucesso();
  await supabase
    .from("ai_agents")
    .update({ failure_count: zerado.falhas, circuit_open_until: zerado.abertoAte })
    .eq("id", agente.id);
  await supabase
    .from("ai_agent_sessions")
    .update({ last_outbound_at: agora.toISOString(), updated_at: agora.toISOString() })
    .eq("id", sessao.id);

  return { respondeu: true, pedacos };
}

async function responderComModelo(
  deps: Dependencias,
  agente: any,
  entrada: MensagemDeEntrada,
): Promise<string> {
  const { supabase, ownerId } = deps;

  const { data: playbook } = await supabase
    .from("ai_sales_playbooks")
    .select("learned, overrides")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const { data: escolhidos } = await supabase
    .from("ai_agent_procedures")
    .select("procedure_id")
    .eq("agent_id", agente.id);
  const ids = (escolhidos ?? []).map((e: any) => e.procedure_id);

  let procedimentos: any[] = [];
  if (ids.length) {
    const { data } = await supabase
      .from("clinic_procedures")
      .select("name, price, price_from, duration_minutes, category")
      .eq("owner_id", ownerId)
      .eq("active", true)
      .in("id", ids);
    procedimentos = data ?? [];
  }

  const { data: unidade } = await supabase
    .from("clinic_units")
    .select("name")
    .eq("owner_id", ownerId)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Os horários de verdade, ao lado das outras leituras de contexto. É o que
  // torna a regra dos dois horários possível — antes disto o agente não tinha
  // como saber que horário existe, e a regra fixa mandava calar sobre agenda.
  //
  // Devolve `null` quando a agenda não pôde ser lida, e `null` na instrução
  // significa "não consultei", nunca "não há vaga". A diferença importa: um
  // banco instável não pode virar "estamos sem horário" para quem quer marcar.
  const horarios = await horariosParaOferecer(supabase, ownerId, agoraDoAtendimento(deps));

  const instrucao = montarInstrucao({
    horarios,
    clinica: unidade?.name ?? "NÓS Odontologia",
    manual: manualEfetivo(playbook?.learned, playbook?.overrides),
    procedimentos: procedimentos.map((p) => ({
      nome: p.name,
      preco: p.price ?? null,
      duracaoMinutos: p.duration_minutes ?? null,
      categoria: p.category ?? null,
      aPartirDe: p.price_from === true,
    })),
    instrucaoBase: agente.instrucao_base ?? null,
    parcelamento: agente.parcelamento ?? null,
    pacienteModelo: {
      ate: agente.paciente_modelo_ate ?? null,
      texto: agente.paciente_modelo_texto ?? null,
    },
    hoje: agoraNaClinica(agoraDoAtendimento(deps)).date,
  });

  const anteriores = await deps.historico(entrada.conversationId);
  const historico = anteriores
    .slice(-JANELA_DE_CONTEXTO)
    .map((m) => `${m.deQuem === "clinica" ? "VOCÊ" : "PACIENTE"}: ${m.texto}`)
    .join("\n");

  return deps.responderComIa(instrucao, historico, String(entrada.conteudo ?? ""));
}

async function garantirSessao(
  supabase: any,
  ownerId: string,
  agentId: string,
  entrada: MensagemDeEntrada,
) {
  const { data } = await supabase
    .from("ai_agent_sessions")
    .select("*")
    .eq("agent_id", agentId)
    .eq("conversation_id", entrada.conversationId)
    .maybeSingle();
  if (data) return data;

  const { data: nova, error } = await supabase
    .from("ai_agent_sessions")
    .insert({
      owner_id: ownerId,
      agent_id: agentId,
      conversation_id: entrada.conversationId,
      contact_id: entrada.contactId ?? null,
      contact_name: entrada.contactName ?? null,
    })
    .select("*")
    .single();
  // 23505 = duas mensagens da mesma conversa chegaram juntas e as duas tentaram
  // criar a sessão. Ler de novo resolve; estourar aqui perderia a mensagem.
  if (error) {
    if (error.code === "23505") {
      const { data: existente } = await supabase
        .from("ai_agent_sessions")
        .select("*")
        .eq("agent_id", agentId)
        .eq("conversation_id", entrada.conversationId)
        .single();
      return existente;
    }
    throw new Error(error.message);
  }
  return nova;
}

async function registrar(
  supabase: any,
  ownerId: string,
  sessionId: string,
  linha: { direction: string; content: string | null; skipped_reason?: string | null },
) {
  // A auditoria falhar não pode impedir a resposta de sair: o paciente esperando
  // importa mais que a linha de log.
  await supabase
    .from("ai_agent_messages")
    .insert({ owner_id: ownerId, session_id: sessionId, ...linha })
    .then(undefined, (e: unknown) => console.error("[atendimento] auditoria falhou:", e));
}
