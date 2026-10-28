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
import { aConversaAindaEDaIa } from "./conversa-nova.ts";
import { decidirSeResponde, registrarFalha, registrarSucesso } from "./filtros-do-agente.ts";
import { esperaDeDigitacao, normalizarRitmo, segmentar } from "./humanizacao.ts";
import { manualEfetivo, montarInstrucao } from "./instrucao-do-agente.ts";
import { agoraNaClinica, horariosParaOferecer } from "./agenda-da-clinica.ts";
import { semTravessao } from "./sem-travessao.ts";
import { emojiNaMedida } from "./emoji-na-medida.ts";
import { cancelarRecuperacao, iniciarRecuperacao } from "./recuperacao-no-banco.ts";
import { pediuParaParar } from "./recuperacao.ts";
import { aClinicaJaFalou, ehEcoDaPropriaIa, oQueEuMandei } from "./historico-da-clinica.ts";
import { blocoSemResposta, jaDisseIssoAgora } from "./nao-repetir.ts";
import {
  anuncioDoEvento,
  anuncioGuardado,
  jaProcurouAnuncio,
  type Anuncio,
} from "./veio-de-anuncio.ts";
import { catalogoDeVagas, vagaFechada, type VagaComCodigo } from "./agendamento-da-ia.ts";
import { casoEscolhido, catalogoDeCasos, type CasoComCodigo } from "./casos-da-ia.ts";
import {
  catalogoDeUnidades,
  unidadeEscolhida,
  unidadePeloDdd,
  ufDoTelefone,
  type CidadeDeclarada,
  type UnidadeComCodigo,
} from "./cidade-do-paciente.ts";
import { cidadeDita, municipioDaUnidade, unidadeMaisProxima } from "./localizacao-do-paciente.ts";
import type { ProfissionalDaClinica } from "./instrucao-do-agente.ts";
import type { HorariosParaOferecer } from "./instrucao-do-agente.ts";
import type { RespostaAoPaciente } from "./modelo-de-atendimento.ts";

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
   * Dias que a pessoa ficou calada ANTES desta mensagem.
   *
   * Serve a uma pergunta diferente de `conversaNova`, e a confusão entre as
   * duas é o que calava a Luna no meio de um fechamento: a janela de contato
   * novo decide se ela pode ENTRAR, e o silêncio decide se ela pode CONTINUAR
   * numa conversa que já é dela. Ver `aConversaAindaEDaIa`.
   *
   * `null` ou omitido quando não se sabe — e aí só a regra de entrar vale, que
   * é o lado conservador.
   */
  silencioEmDias?: number | null;
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
  /**
   * O número de WhatsApp da pessoa, como o jid informou ("5551999887766").
   *
   * Serve a uma coisa só: o DDD, que sugere de que cidade ela é quando a
   * clínica atende em mais de uma. Palpite, nunca resposta — ver
   * `cidade-do-paciente.ts`.
   *
   * Ausente na prévia da tela, e aí não há palpite e a Luna pergunta a cidade
   * sem viés, que é o comportamento certo para uma conversa inventada.
   */
  telefone?: string | null;
}

/**
 * Manda um pedaço da resposta. `esperaMs` é o tempo de digitação antes dele.
 *
 * Devolve o id que o WhatsApp deu à mensagem, quando há. É esse id que permite
 * reconhecer a própria mensagem quando ela volta pelo webhook, em vez de
 * comparar o texto e errar quando a recepção repete uma frase da IA.
 */
export type Enviar = (
  pedaco: string,
  esperaMs: number,
  /**
   * O caso de antes e depois que vai JUNTO deste pedaço, como legenda.
   *
   * Só chega preenchido no ÚLTIMO pedaço, e só no webhook: a prévia da tela
   * recebe o mesmo `Enviar` sem saber baixar imagem, e por isso testar a Luna
   * nunca manda foto de paciente para ninguém. Mesma separação de
   * `registrarAgendamento`.
   */
  caso?: CasoComCodigo | null,
) => Promise<string | null | void>;

export interface Dependencias {
  supabase: any;
  ownerId: string;
  /** As últimas mensagens da conversa, para o modelo ter contexto. */
  historico: (
    conversationId: string,
  ) => Promise<{ deQuem: "clinica" | "paciente"; texto: string }[]>;
  /** Chama o modelo. Separado para a simulação poder rodar sem chave. */
  responderComIa: (
    instrucao: string,
    historico: string,
    mensagens: string[],
  ) => Promise<RespostaAoPaciente>;
  /**
   * Põe na agenda o horário que a IA fechou.
   *
   * Opcional, e é a diferença entre atender de verdade e simular: a prévia da
   * tela passa `responderComIa` e NÃO passa isto, então ela mostra o que a Luna
   * diria sem marcar ninguém. Ausente, o fechamento é só registrado no log.
   */
  registrarAgendamento?: (vaga: VagaComCodigo, sessaoId: string) => Promise<void>;
  /**
   * Avisa a clínica de que a Luna encaminhou uma dúvida.
   *
   * Opcional pela MESMA razão de `registrarAgendamento`: a prévia da tela não
   * passa isto, e por isso testar a Luna não faz o celular de ninguém vibrar.
   * Ausente, a dúvida é só registrada na sessão e no log.
   *
   * Nunca levanta — quem fornece engole a falha. Um push que não sai não pode
   * impedir a resposta que já foi para a paciente de ser contabilizada.
   */
  avisarDuvida?: (pergunta: string) => Promise<void>;
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

  // ── A pessoa falou: a retomada programada morre aqui ────────────────────
  //
  // Na hora, e não na próxima rodada do Recovery Engine. Qualquer mensagem
  // dela conta, mesmo uma que a Luna não vá responder: a sequência existe para
  // quem PAROU de responder, e ela não parou. Uma sequência nova só nasce na
  // próxima resposta da Luna, contada a partir dela.
  //
  // A simulação da tela não mexe em sequência de ninguém.
  if (!entrada.daClinica && !entrada.privada && deps.ignorarInterruptor !== true) {
    await cancelarRecuperacao(
      supabase,
      sessao.id,
      "a pessoa respondeu",
      pediuParaParar(entrada.conteudo) ? { nao_contatar_em: agora.toISOString() } : {},
    );
  }

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
      // Entrar, OU continuar. A primeira parte é a regra de sempre: a conversa
      // nasceu dentro da janela. A segunda é a que faltava: a conversa já é da
      // Luna (`last_outbound_at`) e a pessoa não ficou calada mais que a
      // janela. Sem ela, um fechamento que leva mais de `novo_ate_dias` morre
      // de velhice com a pessoa respondendo do outro lado.
      conversaNova:
        entrada.conversaNova !== false ||
        aConversaAindaEDaIa(
          {
            iaJaFalou: !!sessao.last_outbound_at,
            silencioEmDias: entrada.silencioEmDias ?? null,
          },
          Number(agente.novo_ate_dias ?? 7),
        ),
      // O fato explícito quando quem chamou sabe, OU o anúncio guardado na
      // sessão. As duas leituras concordam no webhook, que calcula o fato do
      // mesmo anúncio; a segunda é o que sustenta a conversa a partir da
      // segunda mensagem, quando o marcador não vem mais.
      //
      // E a Luna já ter falado aqui: o filtro decide quem ENTRA, não quem
      // continua. Quem chegou pelo site não tem anúncio guardado, e sem isto
      // a segunda mensagem dela ficaria sem resposta no meio da conversa.
      veioDeAnuncio:
        entrada.veioDeAnuncio !== false || anuncio !== null || !!sessao.last_outbound_at,
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
      // A conversa é da equipe agora: nenhuma retomada automática por cima.
      await cancelarRecuperacao(supabase, sessao.id, "a equipe assumiu a conversa");
    }
    return { respondeu: false, motivo: decisao.motivo, pedacos: [] };
  }

  await supabase
    .from("ai_agent_sessions")
    .update({ last_inbound_at: agora.toISOString(), updated_at: agora.toISOString() })
    .eq("id", sessao.id);

  let texto: string;
  // A vaga que a IA fechou nesta resposta, se fechou alguma. Fica guardada e só
  // é registrada DEPOIS do envio — ver o comentário no fim desta função.
  let vagaFechadaAqui: VagaComCodigo | null = null;
  // O caso de antes e depois que ela escolheu mandar, já validado contra o
  // catálogo desta conversa. `null` é o normal: prova visual é exceção.
  let caso: CasoComCodigo | null = null;
  // A dúvida que ela encaminhou NESTA resposta. Registrada depois do envio, pelo
  // mesmo motivo do agendamento: a mensagem para a paciente vem primeiro.
  let duvidaNova = "";
  // A que já estava esperando. Lida da sessão porque é ela que muda a instrução
  // — sem isso a Luna encaminharia a mesma pergunta a cada mensagem.
  const duvidaPendente = String(sessao.duvida_pendente ?? "").trim() || null;
  // A cidade que ela já confirmou nesta conversa. Lida da sessão porque é ela
  // que decide QUAIS horários entram na instrução — precisa estar em mãos antes
  // de montar a instrução, não depois da resposta.
  const unidadeDaSessao = String(sessao.unidade_id ?? "").trim() || null;
  // A que ela confirmou NESTA mensagem, se confirmou. Gravada depois do envio,
  // pelo mesmo motivo do agendamento e da dúvida.
  let cidadeNova: UnidadeComCodigo | null = null;
  // Em que situação a conversa fica se a pessoa parar aqui. Vem da resposta da
  // Luna; quem decide quando voltar é o Recovery Engine.
  let recuperacao = { rotulo: "", perguntaAberta: "", retornoCombinado: "" };
  try {
    if (agente.mode === "ia") {
      const r = await responderComModelo(
        deps,
        agente,
        entrada,
        anuncio,
        sessao.id,
        duvidaPendente,
        unidadeDaSessao,
      );
      texto = r.texto;
      vagaFechadaAqui = r.vaga;
      caso = r.caso;
      duvidaNova = r.duvida;
      cidadeNova = r.cidade;
      recuperacao = r.recuperacao;
    } else {
      texto = String(agente.echo_message ?? "").trim();
    }
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
  //
  // O emoji também sai na medida aqui, olhando as últimas respostas desta
  // conversa: um sorriso a cada três mensagens, no máximo (`emoji-na-medida.ts`).
  const anteriores = await oQueEuMandei(supabase, sessao.id, agora, 30 * 24 * 60);
  const pedacos = segmentar(
    emojiNaMedida(
      semTravessao(texto),
      anteriores.map((m) => m.texto),
    ),
    ritmo,
  );
  const enviados: string[] = [];
  for (const [indice, pedaco] of pedacos.entries()) {
    // A imagem vai no ÚLTIMO pedaço, como legenda dele.
    //
    // No primeiro ela chegaria antes do contexto — a pessoa veria a foto e só
    // depois leria por que a Luna a mandou. E numa mensagem só, porque é assim
    // que uma pessoa manda: escreve e anexa, não anexa e some.
    const casoDestePedaco = indice === pedacos.length - 1 ? caso : null;
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

    const idEnviado = await deps.enviar(pedaco, esperaDeDigitacao(pedaco, ritmo), casoDestePedaco);
    enviados.push(pedaco);
    await registrar(supabase, ownerId, sessao.id, {
      direction: "saida",
      content: pedaco,
      wa_message_id: typeof idEnviado === "string" ? idEnviado : null,
      // O caso fica gravado NA mensagem que o levou. É daqui que sai a trava
      // de um por conversa, e é daqui que vai sair a medição de se prova
      // visual converte.
      caso_id: casoDestePedaco?.id ?? null,
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

  // ── A dúvida encaminhada, DEPOIS do envio ───────────────────────────────
  //
  // A ordem é a mesma do agendamento, e pela mesma razão: se gravar a dúvida
  // falhasse antes do envio, a paciente ficaria sem a resposta por causa de uma
  // linha de registro.
  //
  // Só a PRIMEIRA fica guardada. Já havendo uma esperando, a instrução já disse
  // para ela não encaminhar de novo; se encaminhou mesmo assim, sobrescrever
  // apagaria a pergunta que alguém ainda não respondeu.
  if (duvidaNova && !duvidaPendente) {
    const { error } = await supabase
      .from("ai_agent_sessions")
      .update({
        duvida_pendente: duvidaNova,
        duvida_pendente_em: agora.toISOString(),
        updated_at: agora.toISOString(),
      })
      .eq("id", sessao.id);

    if (error) {
      // Coluna pendente de migration, ou banco instável. A resposta já saiu;
      // o que se perde é o aviso, e isso vai para o log em vez de estourar.
      console.warn("[atendimento] dúvida não ficou registrada:", error.message);
    } else {
      await registrar(supabase, ownerId, sessao.id, {
        direction: "ignorada",
        content: null,
        skipped_reason: `dúvida encaminhada: ${duvidaNova.slice(0, 240)}`,
      });
      // O aviso é o ponto da coisa: antes disto, "vou confirmar com a equipe"
      // não chegava a ninguém. Nunca derruba nada — ver `avisarDuvida`.
      if (deps.avisarDuvida) {
        try {
          await deps.avisarDuvida(duvidaNova);
        } catch (e) {
          console.warn(
            "[atendimento] aviso da dúvida não saiu:",
            e instanceof Error ? e.message : e,
          );
        }
      }
    }
  }

  // ── A cidade confirmada, DEPOIS do envio ────────────────────────────────
  //
  // Mesma ordem da dúvida: a mensagem para a paciente vem primeiro, e uma falha
  // de banco não pode deixá-la sem resposta.
  //
  // Sobrescreve quando muda, ao contrário da dúvida: a pessoa que diz "ah, na
  // verdade eu estou em Porto Alegre agora" está CORRIGINDO, e manter a
  // primeira cidade faria todos os horários seguintes saírem da errada.
  if (cidadeNova && cidadeNova.id !== unidadeDaSessao) {
    const { error } = await supabase
      .from("ai_agent_sessions")
      .update({
        unidade_id: cidadeNova.id,
        unidade_em: agora.toISOString(),
        updated_at: agora.toISOString(),
      })
      .eq("id", sessao.id);
    if (error) {
      // Coluna pendente de migration, ou banco instável. A resposta já saiu; o
      // que se perde é a memória da cidade, e a Luna pergunta de novo na
      // mensagem seguinte — chato, e muito melhor que estourar.
      console.warn("[atendimento] cidade não ficou registrada:", error.message);
    } else {
      await registrar(supabase, ownerId, sessao.id, {
        direction: "ignorada",
        content: null,
        skipped_reason: `cidade confirmada: ${cidadeNova.nome}`,
      });
    }
  }

  // ── O agendamento, DEPOIS do envio ──────────────────────────────────────
  //
  // A ordem não é gosto. Se a criação viesse antes e falhasse, a paciente
  // ficaria sem a resposta que ela está esperando no WhatsApp por causa de um
  // erro de banco. Depois, o pior caso é o que já existia antes desta função:
  // conversa respondida, agendamento não registrado, motivo no log.
  //
  // `registrarAgendamento` ausente é o caso da prévia da tela: ela mostra o que
  // a Luna diria, e marcar alguém a partir de um teste seria o pior defeito
  // possível desta feature.
  if (vagaFechadaAqui && deps.registrarAgendamento) {
    try {
      await deps.registrarAgendamento(vagaFechadaAqui, sessao.id);
    } catch (e) {
      await registrar(supabase, ownerId, sessao.id, {
        direction: "ignorada",
        content: null,
        skipped_reason: `fechou ${vagaFechadaAqui.codigo} e falhou ao agendar: ${String(e).slice(0, 240)}`,
      });
    }
  } else if (vagaFechadaAqui) {
    await registrar(supabase, ownerId, sessao.id, {
      direction: "ignorada",
      content: null,
      skipped_reason: `fechou ${vagaFechadaAqui.codigo} (${vagaFechadaAqui.date} ${vagaFechadaAqui.hora}) sem registrar: simulação`,
    });
  }

  // ── A sequência de recuperação, por último ──────────────────────────────
  //
  // Nasce da resposta que acabou de sair: é ela que pode ficar sem resposta.
  // Não nasce quando a Luna fechou um horário (a conversa virou consulta), no
  // modo de frase fixa (não há quem escreva a retomada), nem na simulação.
  if (agente.mode === "ia" && !vagaFechadaAqui && deps.ignorarInterruptor !== true) {
    await iniciarRecuperacao(supabase, {
      agente,
      ownerId,
      sessionId: sessao.id,
      origem: agoraDoAtendimento(deps),
      primeiraRespostaDaLuna: !sessao.last_outbound_at,
      rotulo: recuperacao.rotulo,
      perguntaAberta: recuperacao.perguntaAberta,
      retornoCombinado: recuperacao.retornoCombinado,
      ultimaMensagemDaPessoa: entrada.conteudo,
    });
  } else if (vagaFechadaAqui && deps.ignorarInterruptor !== true) {
    await cancelarRecuperacao(supabase, sessao.id, "já agendou");
  }

  return { respondeu: true, pedacos: enviados };
}

/**
 * A instrução completa da Luna: manual, procedimentos escolhidos, unidades com
 * endereço, tabela de preços, horários e as regras invioláveis.
 *
 * ── Por que isto é exportado ────────────────────────────────────────────
 *
 * Porque o follow-up (`agente-followup`) precisa da MESMA instrução. Quando eu
 * escrevi aquela função, copiei estas consultas para lá e errei duas: leu
 * `ai_agent_playbooks`, que não existe, e pegou TODOS os procedimentos ativos
 * em vez dos escolhidos em `ai_agent_procedures`.
 *
 * O segundo erro é o grave, e é invisível: a Luna do follow-up citaria preço de
 * procedimento que a clínica tirou da lista de propósito. Uma mensagem com
 * preço errado, mandada sozinha, de madrugada do ponto de vista de quem
 * escreveu o código — e ninguém descobre até um paciente cobrar.
 *
 * Duas montagens da mesma instrução divergem sempre. Esta é a única.
 */
/**
 * A instrução e a tabela de horários que ela carrega.
 *
 * Os horários saem junto porque é contra eles que o código devolvido pela IA é
 * validado. Reconsultar a agenda depois da resposta daria outra tabela — meia
 * hora passou, e a vaga que ela ofereceu pode já não estar na lista.
 */
export interface InstrucaoMontada {
  texto: string;
  horarios: HorariosParaOferecer | null;
  /** Os casos com código, para validar o que o modelo devolver. Sai junto do
   *  texto, e não é reconsultado depois, pelo mesmo motivo dos horários: a
   *  lista precisa ser a MESMA que montou a instrução. */
  casos: CasoComCodigo[];
  /** As unidades com código (`U1`, `U2`), pelo mesmo motivo: é contra esta
   *  lista que o código da cidade é validado, e remontá-la depois poderia
   *  numerar diferente. */
  unidades: UnidadeComCodigo[];
}

/** A unidade como a instrução a usa: com id, nome, endereço e a marca de
 *  principal. O `id` é o que liga o catálogo de códigos à agenda e à cidade
 *  dita pela pessoa, e o endereço é o que diz de onde ela fica. */
interface UnidadeDaClinica {
  id: string;
  nome: string;
  endereco: string | null;
  principal: boolean;
}

export async function instrucaoDaLuna(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  // deno-lint-ignore no-explicit-any
  agente: any,
  anuncio: Anuncio | null,
  agora: Date,
  /** A conversa, para saber se um caso já saiu nela. Ausente na prévia da
   *  tela, que mostra o que ela diria numa conversa do zero. */
  sessaoId?: string | null,
  /** A dúvida que já está com a equipe nesta conversa. Ver
   *  `secaoDaDuvidaEncaminhada`. */
  duvidaPendente?: string | null,
  /** A unidade da cidade que a pessoa já confirmou nesta conversa, lida da
   *  sessão. Nula enquanto ela não disse de onde é. */
  unidadeConfirmadaId?: string | null,
  /** O número dela, só para o palpite do DDD. Ausente na prévia da tela. */
  telefone?: string | null,
  /** O que a PESSOA escreveu na conversa, da mais antiga para a mais nova —
   *  é daqui que sai a cidade que ela disse. Ver `localizacao-do-paciente.ts`. */
  falasDoPaciente?: readonly string[] | null,
): Promise<InstrucaoMontada> {
  const { data: playbook } = await supabase
    .from("ai_sales_playbooks")
    .select("learned, overrides")
    .eq("owner_id", ownerId)
    .maybeSingle();

  // Só os procedimentos ESCOLHIDOS. A lista tem 282 ativos e a clínica decide
  // quais a Luna pode citar; mandar todos seria ela oferecer o que ninguém
  // autorizou.
  const { data: escolhidos } = await supabase
    .from("ai_agent_procedures")
    .select("procedure_id")
    .eq("agent_id", agente.id);
  // deno-lint-ignore no-explicit-any
  const ids = (escolhidos ?? []).map((e: any) => e.procedure_id);

  // deno-lint-ignore no-explicit-any
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
  //
  // O `id` entra na leitura desde 19/10: é dele que sai o catálogo de códigos
  // (`U1`, `U2`) com que a Luna diz de que cidade a pessoa é, e é por ele que a
  // agenda sabe quais horários pode oferecer.
  const { data: unidades } = await supabase
    .from("clinic_units")
    .select("id, name, address, is_default")
    .eq("owner_id", ownerId)
    .eq("active", true)
    .order("is_default", { ascending: false });
  // deno-lint-ignore no-explicit-any
  const listaDeUnidades: UnidadeDaClinica[] = (unidades ?? []).map((u: any) => ({
    id: String(u.id ?? ""),
    nome: String(u.name ?? "").trim(),
    endereco: u.address ?? null,
    principal: u.is_default === true,
  }));
  const unidade = listaDeUnidades[0] ?? null;

  // ── De que cidade é esta pessoa ─────────────────────────────────────────
  //
  // O catálogo é montado aqui e DEVOLVIDO junto da instrução, como os horários
  // e os casos: é contra ele que o código que o modelo responde vai ser
  // validado. Montar outro depois daria outra numeração se uma unidade tivesse
  // sido desativada no meio da conversa, e `U2` passaria a ser outra cidade.
  const catalogoDasUnidades = catalogoDeUnidades(listaDeUnidades);
  const confirmada =
    catalogoDasUnidades.find((u) => u.id === String(unidadeConfirmadaId ?? "")) ?? null;
  // A cidade que ela DISSE vence o DDD (LUNA V4.1, regra 15). O código acha
  // o município e a unidade mais próxima; a instrução já chega com o fato.
  let declarada: CidadeDeclarada | null = null;
  try {
    const ufsDaClinica = new Set(
      listaDeUnidades
        .map((u) => municipioDaUnidade(u.nome, u.endereco)?.uf)
        .filter((uf): uf is string => !!uf),
    );
    const dita = cidadeDita(falasDoPaciente ?? [], ufDoTelefone(telefone), ufsDaClinica);
    if (dita?.municipio) {
      const perto = unidadeMaisProxima(dita.municipio, listaDeUnidades);
      declarada = {
        cidade: dita.municipio.nome,
        uf: dita.municipio.uf,
        unidade: perto
          ? (catalogoDasUnidades.find((u) => u.id === perto.unidade.id) ?? null)
          : null,
      };
    } else if (dita?.ambiguo.length) {
      declarada = {
        cidade: "",
        uf: "",
        unidade: null,
        ambiguo: dita.ambiguo.map((m) => `${m.nome}/${m.uf}`),
      };
    }
    if (declarada) {
      console.log(
        `[luna] cidade dita: ${declarada.cidade || "ambígua"}${declarada.uf ? `/${declarada.uf}` : ""} → ${declarada.unidade?.nome ?? "sem unidade"}`,
      );
    }
  } catch (e) {
    // Falhar aqui não pode calar a Luna: fica o comportamento de antes.
    console.warn("[luna] não deu para resolver a cidade dita:", e);
  }

  const palpite = confirmada
    ? null
    : declarada?.unidade
      ? declarada.unidade
      : unidadePeloDdd(
          telefone,
          catalogoDasUnidades,
          Object.fromEntries(listaDeUnidades.map((u) => [u.id, u.endereco])),
        );

  // Os horários de verdade, ao lado das outras leituras de contexto. É o que
  // torna a regra dos dois horários possível — antes disto o agente não tinha
  // como saber que horário existe, e a regra fixa mandava calar sobre agenda.
  //
  // Devolve `null` quando a agenda não pôde ser lida, e `null` na instrução
  // significa "não consultei", nunca "não há vaga". A diferença importa: um
  // banco instável não pode virar "estamos sem horário" para quem quer marcar.
  //
  // Com a cidade confirmada, a agenda devolve só os horários DELA — e devolve
  // lista vazia quando não há vaga lá, que é a resposta certa para quem está
  // numa cidade sem viagem marcada. Com o palpite do DDD, ela tenta a unidade
  // sugerida e cede se não houver vaga: um palpite não pode calar a conversa.
  // Ver `escolherMomentos`.
  const cidadeDaAgenda = confirmada
    ? { id: confirmada.id, nome: confirmada.nome, confirmada: true }
    : palpite
      ? // A cidade dita vale como confirmada para a agenda: horário de outra
        // cidade para quem disse onde mora é exatamente o erro a evitar.
        { id: palpite.id, nome: palpite.nome, confirmada: !!declarada?.unidade }
      : null;
  const horarios = await horariosParaOferecer(supabase, ownerId, agora, cidadeDaAgenda);

  // ── A biblioteca de casos ───────────────────────────────────────────────
  //
  // Só os ATIVOS. Desligar um caso na tela precisa tirá-lo da conversa
  // seguinte, não só escondê-lo da grade — é o único jeito de retirar de
  // circulação uma foto que a paciente pediu para não usar mais.
  //
  // Falha de leitura devolve lista vazia, nunca derruba a resposta: sem caso a
  // Luna fala de resultado com palavras, que é o que ela fazia até ontem.
  // deno-lint-ignore no-explicit-any
  let casosDaClinica: any[] = [];
  try {
    const { data } = await supabase
      .from("ai_agent_casos")
      .select("id, titulo, media_path, quando_usar")
      .eq("owner_id", ownerId)
      .eq("ativo", true)
      .order("created_at", { ascending: false });
    casosDaClinica = data ?? [];
  } catch (e) {
    console.warn("[atendimento] não deu para ler a biblioteca de casos:", e);
  }
  const casos = catalogoDeCasos(
    // deno-lint-ignore no-explicit-any
    casosDaClinica.map((c: any) => ({
      id: String(c.id),
      titulo: String(c.titulo ?? ""),
      mediaPath: String(c.media_path ?? ""),
      quandoUsar: c.quando_usar ?? null,
    })),
  );

  // Os horários saem junto com o texto, e não só dentro dele: é por eles que se
  // valida o código que a IA devolve. Reconsultar a agenda depois da resposta
  // daria uma tabela diferente — meia hora passou, e a vaga que ela ofereceu
  // pode não estar mais na lista.
  const texto = montarInstrucao({
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
    cidade: {
      catalogo: catalogoDasUnidades,
      confirmada,
      palpite: declarada?.unidade ? null : palpite,
      declarada,
    },
    profissionais: await profissionaisDaClinica(supabase, ownerId),
    instrucaoBase: agente.instrucao_base ?? null,
    parcelamento: agente.parcelamento ?? null,
    pacienteModelo: {
      ate: agente.paciente_modelo_ate ?? null,
      texto: agente.paciente_modelo_texto ?? null,
      // O endereço do LOCAL da mentoria, que não é nenhuma das unidades. Ver
      // `PacienteModelo.local` e a conversa de 15/10 citada lá.
      local: agente.paciente_modelo_local ?? null,
    },
    hoje: agoraNaClinica(agora).date,
    casos,
    // Um caso por conversa. A marca fica no espelho das mensagens: se alguma
    // saída desta sessão já levou imagem, não vai outra.
    //
    // Só pergunta ao banco se há caso para mandar. Sem biblioteca — que é o
    // estado de hoje, e vai ser por um tempo — a resposta não mudaria nada e
    // seria uma consulta a mais em cada mensagem de paciente.
    jaMandouCaso:
      casos.length > 0 && sessaoId ? await jaMandouCasoNestaConversa(supabase, sessaoId) : false,
    duvidaPendente: duvidaPendente ?? null,
  });

  return { texto, horarios, casos, unidades: catalogoDasUnidades };
}

/**
 * As profissionais ativas e o que a ficha clínica diz de cada uma.
 *
 * Lido a cada mensagem, sem cache: mudar a especialidade na ficha vale na
 * resposta seguinte (LUNA V4.1, fase 3). Falha de leitura devolve lista
 * vazia — a seção some e a Luna encaminha a pergunta, em vez de calar.
 */
async function profissionaisDaClinica(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
): Promise<ProfissionalDaClinica[]> {
  try {
    const { data, error } = await supabase
      .from("professionals")
      .select("name, specialties, specialty, registration_number")
      .eq("owner_id", ownerId)
      .eq("active", true)
      .order("name");
    if (error) throw error;
    // deno-lint-ignore no-explicit-any
    return (data ?? []).map((p: any) => ({
      nome: String(p.name ?? ""),
      especialidades: [
        ...(Array.isArray(p.specialties) ? p.specialties : []),
        ...(p.specialty && !(p.specialties ?? []).includes(p.specialty) ? [p.specialty] : []),
      ].map(String),
      registro: p.registration_number ?? null,
    }));
  } catch (e) {
    console.warn("[luna] não deu para ler as profissionais:", e);
    return [];
  }
}

/**
 * Um caso já saiu nesta conversa?
 *
 * Falha de leitura devolve `true` — e isto é de propósito. Errando para "já
 * mandou", a Luna deixa de mandar uma foto que poderia; errando para o outro
 * lado, manda a segunda. Entre perder uma prova e insistir com a imagem de
 * uma paciente, o lado seguro é não mandar.
 */
async function jaMandouCasoNestaConversa(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  sessaoId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("ai_agent_messages")
      .select("id")
      .eq("session_id", sessaoId)
      .not("caso_id", "is", null)
      .limit(1);
    // A coluna só existe depois da migration. Enquanto ela não rodar, o erro
    // significa "nenhum caso foi mandado ainda", não "pare de mandar".
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return true;
  }
}

async function responderComModelo(
  deps: Dependencias,
  // deno-lint-ignore no-explicit-any
  agente: any,
  entrada: MensagemDeEntrada,
  anuncio: Anuncio | null,
  sessaoId: string,
  duvidaPendente: string | null,
  /** A unidade da cidade já confirmada nesta conversa, lida da sessão. */
  unidadeConfirmadaId: string | null,
): Promise<{
  texto: string;
  vaga: VagaComCodigo | null;
  caso: CasoComCodigo | null;
  /** A dúvida que ela encaminhou nesta resposta. Vazio é o normal. */
  duvida: string;
  /** A cidade que ela disse nesta mensagem, já validada contra o catálogo.
   *  `null` é o normal: a cidade se diz uma vez por conversa. */
  cidade: UnidadeComCodigo | null;
  /** O rótulo do Recovery Engine. Conferido em `trilhaDaSequencia`. */
  recuperacao: { rotulo: string; perguntaAberta: string; retornoCombinado: string };
}> {
  const { supabase, ownerId } = deps;
  // O histórico vem ANTES da instrução desde a V4.1: é das falas da pessoa
  // que sai a cidade que ela disse ("sou de Criciúma").
  const anteriores = await deps.historico(entrada.conversationId);
  const falasDoPaciente = [
    ...anteriores.filter((m) => m.deQuem === "paciente").map((m) => m.texto),
    String(entrada.conteudo ?? ""),
  ];
  const instrucao = await instrucaoDaLuna(
    supabase,
    ownerId,
    agente,
    anuncio,
    agoraDoAtendimento(deps),
    sessaoId,
    duvidaPendente,
    unidadeConfirmadaId,
    entrada.telefone ?? null,
    falasDoPaciente,
  );

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

  const resposta = await deps.responderComIa(instrucao.texto, historico, bloco);

  // O código vira vaga AQUI, contra a tabela que montou a instrução. É a
  // fronteira: daqui para baixo o que existe é uma data que veio do banco, não
  // uma data que o modelo escreveu. Código desconhecido devolve `null` e nada
  // é criado — ver `agendamento-da-ia.ts`.
  const vaga = vagaFechada(
    { codigo: resposta.horarioFechado },
    catalogoDeVagas(instrucao.horarios),
  );
  // Mesma fronteira, para o arquivo: o código vira caso AQUI, contra a lista
  // que montou esta instrução. Código fora dela não manda imagem nenhuma.
  const caso = casoEscolhido({ codigo: resposta.casoEnviado }, instrucao.casos);
  // E a mesma fronteira para a cidade: o código vira unidade AQUI, contra o
  // catálogo desta instrução. Daqui sai em que cidade a consulta será marcada e
  // qual endereço a confirmação vai mandar — um código inventado não confirma
  // nada, e a Luna pergunta de novo na mensagem seguinte.
  const cidade = unidadeEscolhida({ codigo: resposta.cidadeConfirmada }, instrucao.unidades);
  return {
    texto: resposta.texto,
    vaga,
    caso,
    duvida: resposta.duvidaEncaminhada,
    cidade,
    recuperacao: {
      rotulo: resposta.estadoDaConversa ?? "",
      perguntaAberta: resposta.perguntaAberta ?? "",
      retornoCombinado: resposta.retornoCombinado ?? "",
    },
  };
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
    /** O caso de antes e depois que foi junto. Coluna nova: ver abaixo por que
     *  o insert tolera que ela ainda não exista. */
    caso_id?: string | null;
  },
) {
  // A auditoria falhar não pode impedir a resposta de sair: o paciente esperando
  // importa mais que a linha de log.
  const { error } = await supabase
    .from("ai_agent_messages")
    .insert({ owner_id: ownerId, session_id: sessionId, ...linha });
  if (!error) return;

  // ── A coluna que pode não existir ainda ────────────────────────────────
  //
  // Migration e deploy são dois passos manuais no Lovable, sem ordem garantida
  // entre eles. Se a função subir antes da migration, `caso_id` derruba TODO
  // insert de auditoria — inclusive o das conversas que nunca viram um caso.
  //
  // Então tenta de novo sem ela. A mensagem já saiu para a paciente; perder a
  // linha de log inteira por causa de uma coluna pendente é o pior dos dois.
  if (linha.caso_id !== undefined) {
    const { caso_id: _pendente, ...semCaso } = linha;
    const { error: erroSemCaso } = await supabase
      .from("ai_agent_messages")
      .insert({ owner_id: ownerId, session_id: sessionId, ...semCaso });
    if (!erroSemCaso) {
      console.warn("[atendimento] coluna caso_id ausente, migration pendente");
      return;
    }
  }
  console.error("[atendimento] auditoria falhou:", error);
}
