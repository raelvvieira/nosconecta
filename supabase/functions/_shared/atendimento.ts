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
import { aClinicaJaFalou, ehEcoDaPropriaIa, oQueEuMandei } from "./historico-da-clinica.ts";
import { blocoSemResposta, jaDisseIssoAgora } from "./nao-repetir.ts";
import {
  anuncioDoEvento,
  anuncioGuardado,
  jaProcurouAnuncio,
  type Anuncio,
} from "./veio-de-anuncio.ts";

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
  /**
   * A pessoa chegou clicando num anúncio.
   *
   * FATO, separado do anúncio em si logo abaixo, e de propósito: a simulação da
   * tela finge ser o contato do anúncio (é justamente quem a IA atende) sem ter
   * um anúncio de verdade para mostrar. Juntar os dois obrigaria a simulação a
   * inventar um texto de anúncio, e aí a prévia exercitaria uma instrução que a
   * produção nunca vai montar.
   */
  veioDeAnuncio?: boolean;
  /**
   * QUAL anúncio, quando se sabe. Vai para a instrução, não para o filtro.
   *
   * O webhook lê isto da primeira mensagem da pessoa e `atender` guarda na
   * sessão: o WhatsApp só marca a primeira. Reler o marcador a cada mensagem
   * faria a IA decidir "não veio de anúncio" na segunda e abandonar a conversa
   * depois de uma frase.
   */
  anuncio?: Anuncio | null;
  /**
   * Quando a mensagem foi enviada, como o WhatsApp informou.
   *
   * Serve para a espera que agrupa as bolhas: depois de esperar, pergunta-se se
   * chegou mensagem MAIS NOVA que esta. Sem a hora da própria mensagem não há
   * como comparar, e a conversa em que a pessoa manda "oi" e a pergunta em
   * seguida vira duas respostas — foi o que aconteceu em 28/09.
   */
  recebidaEm?: string | null;
  /**
   * O id que o WhatsApp deu a esta mensagem.
   *
   * É por ele que se sabe se uma mensagem `from_me` é a própria resposta da IA
   * voltando ou alguém da equipe digitando — comparação exata, contra o id que
   * a IA guardou quando enviou. Ver `ehEcoDaPropriaIa`.
   */
  messageId?: string | null;
  /**
   * Ninguém da clínica falou nesta conversa ainda.
   *
   * Opcional e permissivo por omissão, como os dois acima. As mensagens da
   * própria IA NÃO contam como histórico — quem resolve isso é `atender`, com o
   * `last_outbound_at` da sessão, porque o espelho não sabe quem escreveu.
   */
  semHistorico?: boolean;
}

/**
 * Manda um pedaço da resposta. `esperaMs` é o tempo de digitação antes dele.
 *
 * Devolve o id que o WhatsApp deu à mensagem, quando há. É esse id que permite
 * reconhecer a própria mensagem quando ela volta pelo webhook, em vez de
 * comparar o texto e errar quando a recepção repete uma frase da IA.
 */
export type Enviar = (pedaco: string, esperaMs: number) => Promise<string | null | void>;

export interface Dependencias {
  supabase: any;
  ownerId: string;
  /** As últimas mensagens da conversa, para o modelo ter contexto. */
  historico: (
    conversationId: string,
  ) => Promise<{ deQuem: "clinica" | "paciente"; texto: string }[]>;
  /** Chama o modelo. Separado para a simulação poder rodar sem chave. */
  responderComIa: (instrucao: string, historico: string, mensagens: string[]) => Promise<string>;
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
  /**
   * Pular a espera que agrupa as bolhas. **Só a simulação da tela passa isto.**
   *
   * A espera existe para o WhatsApp, onde a pessoa manda três mensagens
   * seguidas. Na tela de teste ela só faria o botão ficar quinze segundos sem
   * resposta, e quem testa concluiria que a IA quebrou.
   */
  ignorarEspera?: boolean;
  /**
   * Não barrar resposta parecida com o que já saiu. **Só a simulação da tela
   * passa isto.**
   *
   * Quem testa a mesma frase duas vezes seguidas na prévia receberia "resposta
   * repetida" na segunda — que é o comportamento CERTO no WhatsApp e um defeito
   * aparente na tela de teste.
   */
  ignorarRepeticao?: boolean;
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

  const soDeAnuncio = agente.so_de_anuncio !== false;
  const soSemHistorico = agente.so_sem_historico !== false;

  // ── De qual anúncio esta pessoa veio ────────────────────────────────────
  //
  // O WhatsApp marca SÓ a primeira mensagem de quem clicou. Por isso o anúncio
  // é propriedade da conversa: chega na primeira mensagem, fica guardado na
  // sessão, e as próximas mensagens da mesma pessoa continuam sabendo de onde
  // ela veio. Sem isto a IA responderia a primeira mensagem e decidiria, na
  // segunda, que essa pessoa não veio de anúncio.
  const anuncioDaSessao = anuncioGuardado(sessao.anuncio);
  let anuncio: Anuncio | null = entrada.anuncio ?? anuncioDaSessao;

  // ── E quando o marcador chegou antes de o agente saber lê-lo ────────────
  //
  // Aconteceu de verdade em 28/09: a conversa de um anúncio entrou às 00:03:54
  // e o deploy que ensinou o webhook a ler `ctwaClid` terminou um minuto
  // depois. O marcador ficou gravado no espelho, mas não na sessão — e a partir
  // daí TODA mensagem daquela pessoa era barrada com "não veio de anúncio",
  // para sempre, porque o WhatsApp só marca a primeira.
  //
  // O mesmo vale para qualquer conversa de anúncio aberta antes desta função
  // existir. Então, quando a sessão não sabe, procura-se no espelho — onde o
  // payload cru está gravado — e o resultado fica guardado. Objeto vazio quer
  // dizer "procurei e não era de anúncio": é o que impede a busca de repetir a
  // cada mensagem.
  if (!anuncio && !jaProcurouAnuncio(sessao.anuncio)) {
    anuncio = await anuncioNoEspelho(supabase, ownerId, entrada.conversationId);
    await supabase
      .from("ai_agent_sessions")
      .update({ anuncio: anuncio ?? {}, updated_at: agora.toISOString() })
      .eq("id", sessao.id);
  } else if (entrada.anuncio && !anuncioDaSessao) {
    await supabase
      .from("ai_agent_sessions")
      .update({ anuncio: entrada.anuncio, updated_at: agora.toISOString() })
      .eq("id", sessao.id);
  }

  // ── "A clínica já falou aqui?" ──────────────────────────────────────────
  //
  // O espelho não sabe QUEM escreveu: a resposta da própria IA entra com
  // `from_me = true` igual à da recepção. Então a pergunta se responde em duas
  // partes — se a IA já falou nesta sessão (`last_outbound_at`), a conversa é
  // dela e o `from_me` que existe é o dela.
  //
  // Sem esta segunda parte o critério inverteria na segunda mensagem da pessoa
  // e a IA abandonaria a conversa depois de uma frase, que é o defeito que
  // `conversa-nova.ts` já descreve por escrito.
  let semHistorico = entrada.semHistorico !== false;
  if (entrada.semHistorico === undefined && soSemHistorico) {
    semHistorico =
      !!sessao.last_outbound_at ||
      !(await aClinicaJaFalou(supabase, ownerId, entrada.conversationId));
  }

  // ── É a minha própria resposta voltando? ────────────────────────────────
  //
  // Só se pergunta quando a mensagem saiu da clínica — para toda mensagem de
  // paciente a resposta é não, e uma consulta por mensagem recebida seria
  // gasto puro.
  const ecoDaPropriaIa = entrada.daClinica
    ? ehEcoDaPropriaIa(
        entrada.conteudo,
        await oQueEuMandei(supabase, sessao.id, agora),
        entrada.messageId ?? null,
      )
    : false;

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
      soDeAnuncio,
      soSemHistorico,
    },
    { humanoAssumiuEm: sessao.human_took_over_at ?? null },
    {
      conteudo: entrada.conteudo,
      daClinica: entrada.daClinica,
      privada: entrada.privada,
      ehGrupo: !!entrada.ehGrupo,
      ehPaciente: !!entrada.ehPaciente,
      conversaNova: entrada.conversaNova !== false,
      // O fato explícito quando quem chamou sabe, OU o anúncio guardado na
      // sessão. As duas leituras concordam no webhook, que calcula o fato do
      // mesmo anúncio; a segunda é o que sustenta a conversa a partir da
      // segunda mensagem, quando o marcador não vem mais.
      veioDeAnuncio: entrada.veioDeAnuncio !== false || anuncio !== null,
      semHistorico,
      ecoDaPropriaIa,
    },
    agora,
  );

  // ── A espera que agrupa as bolhas ───────────────────────────────────────
  //
  // No WhatsApp a pessoa manda "oi", depois "tudo bem?", depois a pergunta. São
  // três eventos, e sem espera são três respostas. Em 28/09 a Sabrina mandou
  // "Olá" às 18:31:59 e "Qual valor?" quatro segundos depois, e recebeu DUAS
  // respostas quase iguais, com três segundos entre elas.
  //
  // O campo "esperar antes de responder" já existia na tela, valia 5 segundos,
  // e nada no código o lia: era gravado, normalizado e ignorado.
  //
  // Como funciona: espera, e então pergunta se chegou mensagem MAIS NOVA que
  // esta na mesma conversa. Se chegou, esta desiste — a mais nova está fazendo
  // a mesma espera e vai responder com a conversa inteira na mão. Sobra
  // exatamente uma resposta, a da última bolha, e é ela que tem o contexto
  // completo.
  let motivoDaEspera: string | null = null;
  if (decisao.responde && !deps.ignorarEspera) {
    const segundos = Math.max(0, Number(agente.debounce_seconds ?? 0));
    if (segundos > 0) {
      await new Promise((r) => setTimeout(r, segundos * 1000));
      // O teto é o instante da CONFERÊNCIA, não o da chegada. Passar `agora`
      // aqui foi o defeito de 29/09: a espera dura 15 segundos, então tudo que
      // chega DURANTE ela tem `sent_at` maior que a chegada — e ficava fora da
      // busca. Justamente o que a espera existe para pegar. Em 48 horas o
      // motivo abaixo apareceu uma vez só, e uma pessoa recebeu três respostas
      // seguidas para a mesma pergunta.
      if (await chegouMensagemMaisNova(supabase, ownerId, entrada, new Date())) {
        motivoDaEspera = "mensagem mais nova chegou";
      }
    }
  }

  const responde = decisao.responde && !motivoDaEspera;
  const motivo = motivoDaEspera ?? (decisao.responde ? null : decisao.motivo);

  // A mensagem entra no registro com o motivo de não ter sido respondida. É
  // isso que transforma "a IA não respondeu" de mistério em linha lida.
  await registrar(supabase, ownerId, sessao.id, {
    direction: responde ? "entrada" : "ignorada",
    content: entrada.conteudo,
    skipped_reason: motivo,
  });

  if (motivoDaEspera) return { respondeu: false, motivo: motivoDaEspera, pedacos: [] };

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
        ? await responderComModelo(deps, agente, entrada, anuncio)
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

  // ── Isto eu já mandei agora há pouco? ──────────────────────────────────
  //
  // A espera agrupa as bolhas e faz sobrar uma resposta só. Mas ela é uma
  // corrida, e corrida empata: duas mensagens gravadas no MESMO segundo não
  // são "mais nova" uma que a outra, e as duas respondem. Em 29/09 três
  // execuções correram juntas e mandaram o mesmo endereço três vezes, com
  // sete segundos entre elas.
  //
  // Esta leitura acontece DEPOIS do modelo, de propósito: é o último instante
  // antes do envio, e é quando as respostas das irmãs já estão gravadas. A
  // janela é curta (5 minutos) porque a pessoa pode perguntar a mesma coisa de
  // novo mais tarde, e aí a resposta igual é a resposta certa.
  const jaDitas = deps.ignorarRepeticao ? [] : await oQueEuMandei(supabase, sessao.id, agora, 5);
  const repetida = jaDisseIssoAgora(
    texto,
    jaDitas.map((m) => m.texto),
  );
  if (repetida) {
    await registrar(supabase, ownerId, sessao.id, {
      direction: "ignorada",
      content: texto,
      skipped_reason: `resposta repetida (já mandei: ${repetida.slice(0, 120)})`,
    });
    return { respondeu: false, motivo: "resposta repetida", pedacos: [] };
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
  const enviados: string[] = [];
  for (const pedaco of pedacos) {
    // ── Alguém assumiu enquanto eu escrevia? ────────────────────────────
    //
    // A decisão de responder já passou faz tempo: houve a espera, a chamada do
    // modelo e o tempo de digitação de cada pedaço. Em 29/09 foram 7 segundos
    // entre a Dra. Mariane digitar e a IA mandar a resposta que já estava
    // pronta — e ela seguiu por mais cinco minutos.
    //
    // Uma leitura por pedaço, numa tabela de 50 linhas. É barata e é a
    // diferença entre calar no meio e a dentista ter de escrever "desculpa
    // nossa ia" para o paciente.
    if (await humanoAssumiuAgora(supabase, sessao.id)) {
      await registrar(supabase, ownerId, sessao.id, {
        direction: "ignorada",
        content: pedaco,
        skipped_reason: "humano assumiu enquanto eu escrevia",
      });
      return {
        respondeu: enviados.length > 0,
        motivo: "humano assumiu a conversa",
        pedacos: enviados,
      };
    }

    const idEnviado = await deps.enviar(pedaco, esperaDeDigitacao(pedaco, ritmo));
    enviados.push(pedaco);
    await registrar(supabase, ownerId, sessao.id, {
      direction: "saida",
      content: pedaco,
      wa_message_id: typeof idEnviado === "string" ? idEnviado : null,
    });
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

  return { respondeu: true, pedacos: enviados };
}

async function responderComModelo(
  deps: Dependencias,
  agente: any,
  entrada: MensagemDeEntrada,
  anuncio: Anuncio | null,
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

  // As unidades ATIVAS com endereço, e não só o nome da principal: é daqui que
  // sai a resposta para "onde vocês ficam?", que a Luna não sabia dar.
  const { data: unidades } = await supabase
    .from("clinic_units")
    .select("name, address, is_default")
    .eq("owner_id", ownerId)
    .eq("active", true)
    .order("is_default", { ascending: false });
  const listaDeUnidades = (unidades ?? []).map((u: any) => ({
    nome: String(u.name ?? "").trim(),
    endereco: u.address ?? null,
    principal: u.is_default === true,
  }));
  const unidade = listaDeUnidades[0] ?? null;

  // Os horários de verdade, ao lado das outras leituras de contexto. É o que
  // torna a regra dos dois horários possível — antes disto o agente não tinha
  // como saber que horário existe, e a regra fixa mandava calar sobre agenda.
  //
  // Devolve `null` quando a agenda não pôde ser lida, e `null` na instrução
  // significa "não consultei", nunca "não há vaga". A diferença importa: um
  // banco instável não pode virar "estamos sem horário" para quem quer marcar.
  const horarios = await horariosParaOferecer(supabase, ownerId, agoraDoAtendimento(deps));

  const instrucao = montarInstrucao({
    anuncio,
    horarios,
    clinica: unidade?.nome || "NÓS Odontologia",
    unidades: listaDeUnidades,
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

  // ── O conjunto, e não a última bolha ────────────────────────────────────
  //
  // O espelho já tem esta mensagem gravada, então o rabo de falas do paciente
  // no fim do histórico É o que está sem resposta — sem consulta nova e sem
  // coluna nova. Ver `blocoSemResposta`.
  //
  // `entrada.conteudo` entra como reserva para o caso de o espelho não ter
  // alcançado a mensagem ainda: melhor responder só a última bolha do que
  // chamar o modelo sem dizer a que responder.
  const { anteriores: contexto, semResposta } = blocoSemResposta(
    anteriores.slice(-JANELA_DE_CONTEXTO),
  );
  const bloco = semResposta.length ? semResposta : [String(entrada.conteudo ?? "")];

  const historico = contexto
    .map((m) => `${m.deQuem === "clinica" ? "VOCÊ" : "PACIENTE"}: ${m.texto}`)
    .join("\n");

  return deps.responderComIa(instrucao, historico, bloco);
}

/**
 * Alguém da clínica assumiu esta conversa neste exato momento?
 *
 * Erro de leitura devolve `false` — a IA continua. Calar por causa de uma falha
 * de rede deixaria o paciente sem resposta sem que ninguém soubesse; falar
 * quando alguém já assumiu é constrangedor, mas visível, e a mensagem seguinte
 * já encontra a marca.
 */
async function humanoAssumiuAgora(supabase: any, sessionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("ai_agent_sessions")
    .select("human_took_over_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    console.warn("[atendimento] não deu para reler a sessão:", error.message);
    return false;
  }
  return !!data?.human_took_over_at;
}

/**
 * Chegou mensagem mais nova desta pessoa enquanto a espera corria?
 *
 * Compara pela hora da PRÓPRIA mensagem (`recebidaEm`), e não pelo relógio de
 * quem processa: os dois eventos podem ser processados fora de ordem, e o que
 * decide quem responde tem de ser a ordem em que a pessoa escreveu.
 *
 * Sem `recebidaEm` — o caso da simulação da tela — a resposta é "não chegou".
 * Devolver `true` ali calaria a prévia sem explicação.
 */
async function chegouMensagemMaisNova(
  supabase: any,
  ownerId: string,
  entrada: MensagemDeEntrada,
  agora: Date,
): Promise<boolean> {
  const minha = entrada.recebidaEm ?? null;
  if (!minha) return false;

  // ── O empate ────────────────────────────────────────────────────────────
  //
  // `sent_at` do WhatsApp tem resolução de SEGUNDO. Duas bolhas mandadas no
  // mesmo segundo não são mais novas uma que a outra, nenhuma desiste, e as
  // duas respondem — a mesma repetição que a espera existe para evitar.
  //
  // O desempate é o id da mensagem, que é único e comparável. Não é a ordem em
  // que a pessoa escreveu, é uma ordem ARBITRÁRIA — e é o que basta: o que
  // importa é que exatamente uma das duas se ache a última, não qual delas.
  //
  // Os valores vão entre aspas porque a vírgula é o separador de condições no
  // PostgREST: um id que trouxesse vírgula partiria o filtro em dois e a busca
  // passaria a perguntar outra coisa, em silêncio.
  const meuId = String(entrada.messageId ?? "");
  const desempate = meuId
    ? `and(sent_at.eq."${minha}",crm_message_id.gt."${meuId.replace(/"/g, "")}")`
    : null;

  let busca = supabase
    .from("wa_messages")
    .select("crm_message_id")
    .eq("owner_id", ownerId)
    .eq("crm_conversation_id", entrada.conversationId)
    .eq("from_me", false)
    // Mensagem com data no futuro (relógio torto na origem) calaria a IA para
    // sempre nesta conversa: toda mensagem seguinte pareceria mais velha que
    // ela. O teto é o instante da CONFERÊNCIA, depois da espera.
    .lte("sent_at", agora.toISOString());

  busca = desempate ? busca.or(`sent_at.gt."${minha}",${desempate}`) : busca.gt("sent_at", minha);

  const { data, error } = await busca.limit(1);

  // Erro de leitura NÃO pode virar "chegou mais nova": isso engoliria a
  // resposta em silêncio. Sem saber, responde-se — no pior caso a pessoa
  // recebe duas respostas, que é o defeito antigo e não um novo.
  if (error) {
    console.warn(`[atendimento] espera não conferida em ${entrada.conversationId}:`, error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Procura o marcador de anúncio nas primeiras mensagens da conversa, no espelho.
 *
 * Só as PRIMEIRAS, e só as recebidas: o WhatsApp anexa `ctwaClid` à mensagem de
 * quem clicou, e nunca ao que a clínica manda. Três bastam com folga, e o limite
 * importa porque `payload` guarda o evento inteiro, miniatura do anúncio
 * inclusa.
 *
 * Quem decide o que é anúncio continua sendo `anuncioDoEvento` — a mesma função
 * que o webhook usa. Duas leituras do mesmo marcador divergiriam no dia em que
 * a Evolution mudasse de formato.
 */
async function anuncioNoEspelho(
  supabase: any,
  ownerId: string,
  conversationId: string,
): Promise<Anuncio | null> {
  const { data, error } = await supabase
    .from("wa_messages")
    .select("payload")
    .eq("owner_id", ownerId)
    .eq("crm_conversation_id", conversationId)
    .eq("from_me", false)
    .order("sent_at", { ascending: true })
    .limit(3);

  // Erro de leitura devolve `null`, e `null` aqui vira "não veio de anúncio",
  // que CALA a IA. É o lado seguro: falar com quem não veio de anúncio é o que
  // esta versão inteira existe para impedir.
  if (error) {
    console.warn(`[atendimento] anúncio de ${conversationId}:`, error.message);
    return null;
  }

  for (const linha of data ?? []) {
    const achado = anuncioDoEvento((linha as { payload?: unknown }).payload);
    if (achado) return achado;
  }
  return null;
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
  linha: {
    direction: string;
    content: string | null;
    skipped_reason?: string | null;
    wa_message_id?: string | null;
  },
) {
  // A auditoria falhar não pode impedir a resposta de sair: o paciente esperando
  // importa mais que a linha de log.
  await supabase
    .from("ai_agent_messages")
    .insert({ owner_id: ownerId, session_id: sessionId, ...linha })
    .then(undefined, (e: unknown) => console.error("[atendimento] auditoria falhou:", e));
}
