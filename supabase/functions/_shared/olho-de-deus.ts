// O Olho de Deus: a semana inteira da Luna somada, e o que ela ensina.
//
// ── Por que um olho novo, tendo um ────────────────────────────────────────
//
// `licoes-do-atendimento.ts` já olha a Luna, de hora em hora, desde 29/09, e já
// rendeu 117 lições. Elas são boas: 72 das 117 sugestões dizem a MESMA coisa —
// depois de responder o preço, consultar a agenda e oferecer dois horários
// reais em vez de fazer outra pergunta. O sistema chegou sozinho ao gargalo que
// a auditoria de 15/10 confirmou.
//
// O problema é que esse olho tem três limites, e nenhum deles se conserta
// afinando o prompt dele:
//
//   **Ele olha UMA conversa por vez.** Nunca vai ver "75 conversas começam com
//   o mesmo texto do anúncio" nem "preço citado 109 vezes, horário oferecido
//   12". Esses fatos não existem dentro de nenhuma conversa; existem entre
//   elas.
//
//   **Ele olha só a conversa, nunca o sistema.** As 2.910 mensagens que a Luna
//   deixou de responder, com o motivo gravado em `ai_agent_messages`, são
//   invisíveis para ele. E é lá que estava o maior gargalo de todos.
//
//   **Ninguém lê 117 linhas.** O padrão só aparece somando.
//
// ── A decisão que define este arquivo ─────────────────────────────────────
//
// **O modelo não conta nada.** Todos os números saem de `numerosDaSemana`, que
// é código puro sobre as linhas do banco. O modelo recebe os números prontos e
// escreve o texto.
//
// Isso não é preciosismo. Um modelo a quem se entrega duas mil linhas e se pede
// "quantas pararam no preço?" devolve um número plausível, não o certo — e um
// relatório semanal cujo número está plausível é pior que relatório nenhum,
// porque alguém vai reescrever o manual com base nele. A mesma fronteira de
// `agendamento-da-ia.ts`: o modelo opina, o código afirma.
//
// ── O que este olho NÃO faz ───────────────────────────────────────────────
//
// Não reescreve o manual, não muda configuração, não manda mensagem para
// ninguém. Ele produz um texto para uma pessoa ler e decidir. A Luna editando a
// própria instrução a partir da leitura que ela fez de si mesma, sem ninguém
// olhando, é o único jeito de este sistema piorar sozinho.

// ── O que entra ───────────────────────────────────────────────────────────

import { nomeDaAssistente } from "./identidade-do-consultorio.ts";

/** Uma lição já gravada por `agente-licoes`. */
export interface LicaoDaSemana {
  desfecho: string;
  motivo: string;
  confianca: string;
  sugestao: string;
  oQueFaltou: string;
  momentoDecisivo: string;
  mensagens: number;
}

/** Uma linha de `ai_agent_messages` — o lado do SISTEMA. É daqui que sai o
 *  motivo de cada silêncio, e era o que o olho antigo não lia. */
export interface LinhaDeAuditoria {
  direction: string;
  skippedReason: string | null;
  conteudo: string | null;
}

/** Uma sessão da semana, para saber de onde a conversa veio e como terminou. */
export interface SessaoDaSemana {
  anuncioTitulo: string | null;
  anuncioId: string | null;
  humanoAssumiu: boolean;
  duvidaPendente: boolean;
  lunaFalou: boolean;
}

export interface LinhasDaSemana {
  licoes: LicaoDaSemana[];
  auditoria: LinhaDeAuditoria[];
  sessoes: SessaoDaSemana[];
  /** Consultas criadas na janela, por status. Só a contagem interessa. */
  consultasCriadas: number;
  consultasConcluidas: number;
}

// ── Os temas, que é como 117 sugestões viram uma conversa ────────────────
//
// Lista fechada, e as palavras de cada tema vêm das sugestões REAIS desta base.
// Classificar por palavra é grosseiro e é honesto: dá para conferir qual
// sugestão caiu em qual tema, o que um rótulo escolhido por modelo não daria.
//
// `outros` existe para o total fechar. Um tema que começa a encher `outros` é
// um tema que falta nesta lista, e o relatório mostra isso em vez de esconder.
export const TEMAS: readonly { tema: string; palavras: readonly string[] }[] = [
  { tema: "oferecer dois horários", palavras: ["horário", "horarios", "agenda", "agendar"] },
  { tema: "voltar em quem sumiu", palavras: ["follow", "retomar", "retomada", "reengaj"] },
  {
    tema: "unidade e endereço",
    palavras: ["unidade", "endereço", "endereco", "florian", "porto alegre", "cidade"],
  },
  {
    tema: "preço e condições",
    palavras: ["preço", "preco", "valor", "parcel", "desconto", "sinal"],
  },
  {
    tema: "tom e jeito de escrever",
    palavras: ["tom", "condescend", "respeitoso", "humano", "curta", "curtas", "repetir"],
  },
  {
    tema: "o que ela não pode responder",
    palavras: ["encaminh", "equipe", "transferir", "clínic", "autorizado", "catálogo", "catalogo"],
  },
  { tema: "paciente modelo e mentoria", palavras: ["paciente modelo", "mentoria", "reserva"] },
] as const;

/** O tema de uma sugestão. O PRIMEIRO que casar, na ordem da lista — e a ordem
 *  não é alfabética: é da mudança que mais move agendamento para a que menos. */
export function temaDaSugestao(sugestao: string): string {
  const t = semAcento(sugestao);
  for (const { tema, palavras } of TEMAS) {
    if (palavras.some((p) => t.includes(semAcento(p)))) return tema;
  }
  return "outros";
}

function semAcento(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// ── O que sai ─────────────────────────────────────────────────────────────

export interface Contagem {
  rotulo: string;
  quantas: number;
}

export interface NumerosDaSemana {
  /** Conversas com sessão criada na janela. */
  conversas: number;
  /** Destas, em quantas a Luna chegou a falar. */
  conversasAtendidas: number;
  /** Mensagens de paciente que ela respondeu, e que ela deixou passar. */
  mensagensRespondidas: number;
  mensagensIgnoradas: number;
  /** Por que ela se calou, do mais comum para o menos. É a tabela que o olho
   *  antigo não via. */
  motivosDoSilencio: Contagem[];
  /** Quantas respostas ofereceram horário de verdade. */
  respostasComHorario: number;
  /** Quantas citaram preço. */
  respostasComPreco: number;
  /** Quantas empurraram para a equipe. */
  respostasQueRepassaram: number;
  /** Dúvidas que ela encaminhou pelo campo próprio (o caminho novo). */
  duvidasEncaminhadas: number;
  /** Conversas assumidas por uma pessoa, e conversas com dúvida esperando. */
  conversasAssumidas: number;
  conversasComDuvidaAberta: number;
  /** Consultas criadas e concluídas na janela. */
  consultasCriadas: number;
  consultasConcluidas: number;
  /** As lições: quantas, e o que elas disseram. */
  licoes: number;
  licoesQueFecharam: number;
  motivosDasLicoes: Contagem[];
  /** As sugestões agrupadas por tema. É isto que transforma 117 linhas numa
   *  decisão. */
  sugestoesPorTema: Contagem[];
  /** De onde vieram as conversas. */
  porAnuncio: Contagem[];
  /** Agendamentos por conversa atendida, em porcento. `null` quando não houve
   *  conversa atendida — zero dividido por zero não é zero por cento. */
  conversaoPorcento: number | null;
}

/** Marcas de texto nas respostas. Grosseiras e conferíveis, como os temas: o
 *  que importa é a PROPORÇÃO entre elas, e ela não muda com um falso positivo
 *  aqui e ali. Foi assim que se descobriu "109 preços contra 12 horários". */
// `(?:^|[^\p{L}])` e não `\b`: `\b` é fronteira de caractere ASCII, e "à" não
// é um deles — então `\bàs` nunca casa depois de espaço, e "quinta às 14h"
// ficava de fora da contagem. O teste pegou isto.
const MARCA_DE_HORARIO = /(?:^|[^\p{L}])(?:às|as)\s*\d{1,2}\s*(?:[:h]|horas)/iu;
const MARCA_DE_PRECO = /R\$\s*\d/i;
const MARCA_DE_REPASSE =
  /\b(?:equipe|vou confirmar|vou verificar|vou encaminhar|passo para|passar para)\b/i;

/**
 * A semana somada.
 *
 * Pura: as mesmas linhas dão os mesmos números, sempre. É o que permite
 * conferir o relatório sem chamar modelo e sem banco.
 */
export function numerosDaSemana(l: LinhasDaSemana): NumerosDaSemana {
  const licoes = l.licoes ?? [];
  const auditoria = l.auditoria ?? [];
  const sessoes = l.sessoes ?? [];

  const saidas = auditoria.filter((a) => a.direction === "saida");
  const entradas = auditoria.filter((a) => a.direction === "entrada");
  const ignoradas = auditoria.filter((a) => a.direction === "ignorada");

  // Silêncio: só o que tinha texto de paciente para responder. Mensagem da
  // própria clínica voltando pelo webhook também entra como "ignorada", e
  // contá-la inflaria o número que mais importa desta tabela.
  const silenciadas = ignoradas.filter(
    (a) => String(a.conteudo ?? "").trim() && !/^dúvida encaminhada/.test(a.skippedReason ?? ""),
  );

  const conversasAtendidas = sessoes.filter((s) => s.lunaFalou).length;

  return {
    conversas: sessoes.length,
    conversasAtendidas,
    mensagensRespondidas: entradas.length,
    mensagensIgnoradas: silenciadas.length,
    motivosDoSilencio: contar(silenciadas.map((a) => a.skippedReason ?? "sem motivo gravado")),
    respostasComHorario: saidas.filter((a) => MARCA_DE_HORARIO.test(a.conteudo ?? "")).length,
    respostasComPreco: saidas.filter((a) => MARCA_DE_PRECO.test(a.conteudo ?? "")).length,
    respostasQueRepassaram: saidas.filter((a) => MARCA_DE_REPASSE.test(a.conteudo ?? "")).length,
    duvidasEncaminhadas: ignoradas.filter((a) => /^dúvida encaminhada/.test(a.skippedReason ?? ""))
      .length,
    conversasAssumidas: sessoes.filter((s) => s.humanoAssumiu).length,
    conversasComDuvidaAberta: sessoes.filter((s) => s.duvidaPendente).length,
    consultasCriadas: l.consultasCriadas ?? 0,
    consultasConcluidas: l.consultasConcluidas ?? 0,
    licoes: licoes.length,
    licoesQueFecharam: licoes.filter((x) => x.desfecho === "agendou").length,
    motivosDasLicoes: contar(licoes.map((x) => x.motivo || "não deu para saber")),
    sugestoesPorTema: contar(
      licoes
        .map((x) => x.sugestao)
        .filter((s) => String(s ?? "").trim())
        .map(temaDaSugestao),
    ),
    porAnuncio: contar(
      sessoes.map((s) => String(s.anuncioTitulo ?? "").trim() || "sem anúncio identificado"),
    ),
    conversaoPorcento:
      conversasAtendidas > 0
        ? Math.round((1000 * (l.consultasCriadas ?? 0)) / conversasAtendidas) / 10
        : null,
  };
}

/** Conta e ordena do maior para o menor. Empate pelo rótulo, para o relatório
 *  de duas semanas iguais sair idêntico em vez de embaralhado. */
function contar(valores: string[]): Contagem[] {
  const mapa = new Map<string, number>();
  for (const v of valores) {
    const rotulo = String(v ?? "").trim();
    if (!rotulo) continue;
    mapa.set(rotulo, (mapa.get(rotulo) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([rotulo, quantas]) => ({ rotulo, quantas }))
    .sort((a, b) => b.quantas - a.quantas || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

// ── O que o modelo escreve ────────────────────────────────────────────────

/**
 * O formato do relatório.
 *
 * Campos, e não um texto corrido, pela mesma razão de `FORMATO_DA_LICAO`: a
 * tela mostra "o que mudar no manual" ao lado de "o que mudar no sistema", e
 * um parágrafo único obrigaria quem lê a garimpar as duas coisas. E porque a
 * separação é a decisão que importa — trocar uma frase do .md é uma tarde;
 * mexer no código é uma obra.
 *
 * Todos obrigatórios porque o modo estrito da OpenAI exige. Campo sem conteúdo
 * vem vazio, e vazio a tela sabe esconder.
 */
export const FORMATO_DO_RELATORIO = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "gargalo_da_semana",
      "o_que_mudou",
      "como_ela_esta_conduzindo",
      "o_que_o_sistema_impede",
      "mudar_no_manual",
      "mudar_no_sistema",
      "observar_na_proxima",
      "confianca",
    ],
    properties: {
      /** UMA coisa. A pergunta é "se eu só puder mexer em uma coisa, qual é?",
       *  e um relatório que responde com cinco não foi respondido. */
      gargalo_da_semana: { type: "string" },
      /** Comparado com a semana anterior. Vazio na primeira semana. */
      o_que_mudou: { type: "string" },
      /** O jeito dela: abordagem, tom, condução. É a parte que responde "ela
       *  está ficando mais humana?". */
      como_ela_esta_conduzindo: { type: "string" },
      /** O que o CÓDIGO está impedindo, lido da tabela de silêncios. É a parte
       *  que o olho antigo não tinha como ver. */
      o_que_o_sistema_impede: { type: "string" },
      mudar_no_manual: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["secao", "mudanca", "porque", "prioridade"],
          properties: {
            /** A seção do manual, como ela aparece no texto ("14.1"). Vazio
             *  quando a mudança não tem seção ainda. */
            secao: { type: "string" },
            mudanca: { type: "string" },
            /** O número que sustenta. Sem ele é opinião. */
            porque: { type: "string" },
            prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
          },
        },
      },
      mudar_no_sistema: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["o_que", "porque", "prioridade"],
          properties: {
            o_que: { type: "string" },
            porque: { type: "string" },
            prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
          },
        },
      },
      /** O que medir na semana seguinte para saber se a mudança funcionou. É o
       *  que transforma o relatório em ciclo em vez de desabafo. */
      observar_na_proxima: { type: "string" },
      confianca: { type: "string", enum: ["alta", "media", "baixa"] },
    },
  },
};

export interface MudancaNoManual {
  secao: string;
  mudanca: string;
  porque: string;
  prioridade: string;
}

export interface MudancaNoSistema {
  oQue: string;
  porque: string;
  prioridade: string;
}

export interface Relatorio {
  gargalo: string;
  oQueMudou: string;
  comoEstaConduzindo: string;
  oQueOSistemaImpede: string;
  noManual: MudancaNoManual[];
  noSistema: MudancaNoSistema[];
  observarNaProxima: string;
  confianca: string;
}

const PRIORIDADES = ["alta", "media", "baixa"];

/** Lê o JSON do modelo sem confiar nele. Campo que faltou vira vazio: vazio a
 *  tela esconde, `undefined` ela imprimiria. */
export function relatorioDoJson(bruto: unknown): Relatorio {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => String(v ?? "").trim();
  const prioridade = (v: unknown) => (PRIORIDADES.includes(texto(v)) ? texto(v) : "media");
  const lista = (v: unknown) => (Array.isArray(v) ? v : []);

  return {
    gargalo: texto(o.gargalo_da_semana),
    oQueMudou: texto(o.o_que_mudou),
    comoEstaConduzindo: texto(o.como_ela_esta_conduzindo),
    oQueOSistemaImpede: texto(o.o_que_o_sistema_impede),
    noManual: lista(o.mudar_no_manual)
      .map((m) => {
        const x = (m ?? {}) as Record<string, unknown>;
        return {
          secao: texto(x.secao),
          mudanca: texto(x.mudanca),
          porque: texto(x.porque),
          prioridade: prioridade(x.prioridade),
        };
      })
      // Item sem a mudança escrita não é item: seria uma linha em branco com
      // prioridade alta na tela de quem vai decidir o que fazer na segunda.
      .filter((m) => m.mudanca),
    noSistema: lista(o.mudar_no_sistema)
      .map((m) => {
        const x = (m ?? {}) as Record<string, unknown>;
        return {
          oQue: texto(x.o_que),
          porque: texto(x.porque),
          prioridade: prioridade(x.prioridade),
        };
      })
      .filter((m) => m.oQue),
    observarNaProxima: texto(o.observar_na_proxima),
    confianca: ["alta", "media", "baixa"].includes(texto(o.confianca))
      ? texto(o.confianca)
      : "baixa",
  };
}

// ── O pedido ao modelo ────────────────────────────────────────────────────

/** Quantas lições vão citadas no pedido. As de ALTA confiança primeiro: é
 *  delas que sai o que o relatório pode dizer sobre tom e condução sem
 *  inventar. Vinte cabem com folga e já dão repetição suficiente para o padrão
 *  aparecer. */
export const LICOES_CITADAS = 20;

export interface PedidoDoOlho {
  de: string;
  ate: string;
  numeros: NumerosDaSemana;
  /** O nome da assistente deste consultório ("Luna" se não escolheu). */
  assistente?: string | null;
  licoes: LicaoDaSemana[];
  /** Os TÍTULOS das seções do manual que está valendo. Só os títulos — ver
   *  `secoesDoManual` para o motivo. */
  secoesDoManual: string[];
  /** O gargalo que o relatório anterior apontou. É o que permite dizer "o que
   *  mudou" em vez de recomeçar toda semana. */
  gargaloAnterior: string | null;
}

/**
 * O pedido do relatório semanal.
 *
 * ── Por que só os títulos das seções do manual ────────────────────────────
 *
 * Duas razões, e as duas importam. O manual tem 88.659 caracteres: mandá-lo
 * inteiro custaria 25 mil tokens por semana para servir só a uma coisa — a
 * sugestão apontar para uma seção que existe. Ver `secoesDoManual`.
 *
 * E porque o manual é escrito na SEGUNDA PESSOA, para quem atende. Posto como
 * instrução do sistema, o modelo volta a atender — devolve uma mensagem para a
 * paciente em vez de um relatório. É a mesma armadilha que `promptDaLicao` e
 * `sugestoes-de-fala.ts` já descrevem. Uma lista de títulos não tem como ser
 * confundida com um pedido de atendimento.
 *
 * ── Por que os números vão prontos ────────────────────────────────────────
 *
 * Porque é a única forma de o relatório ser conferível. Ver o cabeçalho deste
 * arquivo: o modelo opina, o código afirma. A última linha do pedido existe
 * para ele não cair na tentação de arredondar.
 */
export function promptDoOlho(p: PedidoDoOlho): string {
  const n = p.numeros;
  const a = nomeDaAssistente(p.assistente);
  const linhas: string[] = [];

  linhas.push(
    `Você é o supervisor da ${a}, a assistente que atende os pacientes desta`,
    "clínica odontológica pelo WhatsApp. Você NÃO está atendendo ninguém: você",
    "está lendo a semana dela e escrevendo um relatório para a dona da clínica.",
    "",
    `A semana vai de ${p.de} a ${p.ate}.`,
    "",
    "## Os números da semana",
    "",
    "Estes números foram CONTADOS no banco de dados, um por um. São fatos.",
    "",
    `- Conversas novas: ${n.conversas}, e a ${a} falou em ${n.conversasAtendidas} delas.`,
    `- Mensagens de paciente que ela respondeu: ${n.mensagensRespondidas}.`,
    `- Mensagens de paciente que ela deixou sem resposta: ${n.mensagensIgnoradas}.`,
    `- Respostas que ofereceram horário: ${n.respostasComHorario}.`,
    `- Respostas que citaram preço: ${n.respostasComPreco}.`,
    `- Respostas que empurraram para a equipe: ${n.respostasQueRepassaram}.`,
    `- Dúvidas que ela encaminhou formalmente: ${n.duvidasEncaminhadas}.`,
    `- Conversas que uma pessoa assumiu: ${n.conversasAssumidas}.`,
    `- Consultas criadas no período: ${n.consultasCriadas}, concluídas: ${n.consultasConcluidas}.`,
    n.conversaoPorcento === null
      ? "- Conversão: não houve conversa atendida, então não há taxa."
      : `- Consultas por conversa atendida: ${n.conversaoPorcento}%.`,
  );

  if (n.motivosDoSilencio.length) {
    linhas.push(
      "",
      "### Por que ela não respondeu",
      "",
      "Cada mensagem que ela deixou passar tem o motivo gravado pelo sistema.",
      "Esta tabela é o lado do CÓDIGO, não da conversa:",
      "",
      ...n.motivosDoSilencio.map((m) => `- ${m.rotulo}: ${m.quantas}`),
    );
  }

  if (n.motivosDasLicoes.length) {
    linhas.push(
      "",
      "### Como as conversas terminaram",
      "",
      `Ela avaliou ${n.licoes} conversas encerradas, e fechou sozinha ${n.licoesQueFecharam}.`,
      "",
      ...n.motivosDasLicoes.map((m) => `- ${m.rotulo}: ${m.quantas}`),
    );
  }

  if (n.sugestoesPorTema.length) {
    linhas.push(
      "",
      "### O que ela mesma sugeriu, agrupado",
      "",
      "Cada conversa encerrada rendeu uma sugestão de mudança no manual. Elas",
      "foram agrupadas por tema. A contagem é o que importa: tema que repete é",
      "padrão, tema que aparece uma vez é caso isolado.",
      "",
      ...n.sugestoesPorTema.map((m) => `- ${m.rotulo}: ${m.quantas}`),
    );
  }

  if (n.porAnuncio.length) {
    linhas.push(
      "",
      "### De onde as conversas vieram",
      "",
      ...n.porAnuncio.map((m) => `- ${m.rotulo}: ${m.quantas}`),
    );
  }

  const citadas = [...(p.licoes ?? [])]
    .sort((a, b) => peso(b.confianca) - peso(a.confianca) || b.mensagens - a.mensagens)
    .slice(0, LICOES_CITADAS)
    .filter((x) => String(x.oQueFaltou ?? "").trim() || String(x.momentoDecisivo ?? "").trim());

  if (citadas.length) {
    linhas.push(
      "",
      "## As conversas, nas palavras dela",
      "",
      `A própria ${a} avaliou cada uma destas. Use-as para falar de ABORDAGEM,`,
      "tom e condução — é o único material que você tem para isso, e citar é",
      "melhor que generalizar:",
      "",
      ...citadas.flatMap((x) => {
        const partes = [`- [${x.confianca}, ${x.motivo}] ${x.oQueFaltou || "(nada faltou)"}`];
        if (String(x.momentoDecisivo ?? "").trim()) {
          partes.push(`  Momento que virou: ${x.momentoDecisivo}`);
        }
        return partes;
      }),
    );
  }

  if (String(p.gargaloAnterior ?? "").trim()) {
    linhas.push(
      "",
      "## O que o relatório da semana passada apontou",
      "",
      String(p.gargaloAnterior).trim(),
      "",
      "Compare: isso melhorou, piorou ou ficou igual? É esta comparação que vai",
      "no campo `o_que_mudou`. Se os números não permitirem dizer, diga que não",
      "permitiram.",
    );
  }

  if ((p.secoesDoManual ?? []).length) {
    linhas.push(
      "",
      "## As seções do manual que está valendo",
      "",
      "Suas sugestões devem apontar para uma destas seções — é assim que a dona",
      "da clínica aplica a mudança sem procurar onde encaixa. Se a mudança não",
      "couber em nenhuma, deixe a seção vazia e diga no texto que é seção nova.",
      "",
      ...p.secoesDoManual.map((t) => `- ${t}`),
    );
  }

  linhas.push(
    "",
    "## O que você vai escrever",
    "",
    "1. **O gargalo da semana: UMA coisa.** Se a clínica só puder mexer em uma,",
    "   qual é? Cinco prioridades é nenhuma prioridade.",
    "2. **Como ela está conduzindo.** Abordagem, tom, inteligência na hora de",
    "   virar a conversa. Cite as falas acima.",
    "3. **O que o sistema está impedindo.** Olhe a tabela de motivos de",
    "   silêncio. Aqui a culpa raramente é do jeito dela de escrever.",
    "4. **O que mudar no manual**, por seção, com o número que sustenta.",
    "5. **O que mudar no sistema**, para quem programa.",
    "6. **O que observar na semana que vem**, para saber se funcionou.",
    "",
    "## Regras",
    "",
    "- Não invente número nenhum. Use os números acima, como estão. Se um",
    "  número que você precisaria não está acima, diga que não foi medido.",
    "- Separe o que é defeito de CONVERSA do que é defeito de SISTEMA. Dizer",
    "  que ela precisa 'ser mais atenciosa' sobre uma mensagem que o código",
    "  nunca deixou chegar nela é a forma mais rápida de piorar o manual.",
    "- Toda sugestão tem de ser acionável. 'Melhorar a abordagem' não é.",
    "- O que a clínica mediu vale mais que qualquer boa prática geral. Se um",
    "  conselho de fora contradiz o que estes números mostram, os números",
    "  ganham.",
    "- Em português do Brasil, direto, sem elogio e sem jargão de consultoria.",
  );

  return linhas.join("\n");
}

function peso(confianca: string): number {
  if (confianca === "alta") return 3;
  if (confianca === "media") return 2;
  return 1;
}

// ── O que se faz fora desta clínica ───────────────────────────────────────
//
// A parte que busca na internet. Ela fica numa CHAMADA SEPARADA, e isso é a
// decisão que protege o relatório: a busca é a peça que mais tem como falhar
// (modelo que não suporta, conta sem a função liberada, rede), e uma semana
// inteira de leitura não pode se perder por causa dela.
//
// ── O aviso honesto sobre esta seção ──────────────────────────────────────
//
// O que está escrito por aí sobre "conversão no WhatsApp" é, na média, pior do
// que os números desta clínica. As 117 lições já apontaram, por conta própria e
// com dado, o gargalo que a auditoria confirmou — 72 das 117 sugestões dizendo
// a mesma coisa. Nenhum artigo de blog chega perto disso em qualidade de sinal.
//
// Por isso esta seção existe SEPARADA e rotulada como referência: ela sugere
// hipóteses para testar, nunca conclusões para aplicar. A hierarquia de fontes
// do próprio manual já diz isso, e aqui ela é estrutura, não recomendação —
// uma boa prática de fora não entra no relatório como se fosse coisa medida.

export const FORMATO_DAS_BOAS_PRATICAS = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["praticas", "o_que_nao_achei"],
    properties: {
      praticas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["pratica", "porque_funciona", "fonte", "o_que_testar_aqui"],
          properties: {
            pratica: { type: "string" },
            porque_funciona: { type: "string" },
            /** De onde veio. Sem fonte não entra: uma recomendação sem origem é
             *  indistinguível de invenção, e esta é a seção em que o modelo tem
             *  mais espaço para inventar. */
            fonte: { type: "string" },
            /** Como testar NESTA clínica, amarrado ao número que motivou. É o
             *  que impede a seção de virar lista de conselhos genéricos. */
            o_que_testar_aqui: { type: "string" },
          },
        },
      },
      /** O que ele procurou e não achou. Vale tanto quanto o que achou: diz
       *  onde não há resposta pronta e a clínica vai ter de medir sozinha. */
      o_que_nao_achei: { type: "string" },
    },
  },
};

export interface BoaPratica {
  pratica: string;
  porqueFunciona: string;
  fonte: string;
  oQueTestarAqui: string;
}

export interface BoasPraticas {
  praticas: BoaPratica[];
  oQueNaoAchei: string;
}

export function boasPraticasDoJson(bruto: unknown): BoasPraticas {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => String(v ?? "").trim();
  const lista = Array.isArray(o.praticas) ? o.praticas : [];
  return {
    praticas: lista
      .map((m) => {
        const x = (m ?? {}) as Record<string, unknown>;
        return {
          pratica: texto(x.pratica),
          porqueFunciona: texto(x.porque_funciona),
          fonte: texto(x.fonte),
          oQueTestarAqui: texto(x.o_que_testar_aqui),
        };
      })
      // Sem prática escrita ou sem fonte, fora. Ver o comentário acima: é a
      // seção mais fácil de encher de texto que parece certo.
      .filter((m) => m.pratica && m.fonte),
    oQueNaoAchei: texto(o.o_que_nao_achei),
  };
}

/** Quantas práticas no máximo. Cinco: é uma seção de referência no fim de um
 *  relatório, não o relatório. */
export const MAX_PRATICAS = 5;

/**
 * O pedido da busca.
 *
 * Ele leva os números da clínica de propósito: uma busca sem contexto devolve
 * "responda rápido e seja simpático". Com o gargalo em mãos, a pergunta deixa
 * de ser "o que funciona em WhatsApp?" e passa a ser "o que se sabe sobre
 * ISTO que está acontecendo aqui?".
 */
export function promptDasBoasPraticas(numeros: NumerosDaSemana, gargalo: string): string {
  const n = numeros;
  return [
    "Você está ajudando a melhorar o atendimento por WhatsApp de uma clínica",
    "odontológica e de estética facial no Brasil. O atendimento é feito por uma",
    "assistente de IA que conversa com quem clica em anúncios do Instagram e do",
    "Facebook, e o objetivo de cada conversa é marcar uma avaliação.",
    "",
    "## O que está acontecendo nesta clínica, medido",
    "",
    `- ${n.conversasAtendidas} conversas atendidas na semana.`,
    `- ${n.respostasComPreco} respostas citaram preço; ${n.respostasComHorario} ofereceram horário.`,
    `- ${n.respostasQueRepassaram} respostas empurraram a conversa para a equipe.`,
    `- ${n.consultasCriadas} consultas marcadas.`,
    ...(n.motivosDasLicoes.length
      ? [
          "- Como as conversas terminaram:",
          ...n.motivosDasLicoes.map((m) => `  - ${m.rotulo}: ${m.quantas}`),
        ]
      : []),
    "",
    gargalo ? `O gargalo apontado nesta semana: ${gargalo}` : "",
    "",
    "## O que eu quero de você",
    "",
    `Busque na internet e traga no máximo ${MAX_PRATICAS} práticas de vendas por`,
    "conversa que tenham evidência de melhorar conversão em marcação de",
    "consulta ou agendamento, e que sejam relevantes para ESTE gargalo.",
    "",
    "Para cada uma: o que é, por que funciona, a fonte (com o endereço do site",
    "quando houver), e como testar aqui amarrado a um dos números acima.",
    "",
    "## Regras",
    "",
    "- Nada sem fonte. Se você não achou de onde veio, não traga.",
    "- Nada genérico. 'Responda rápido' e 'seja empático' não ajudam ninguém.",
    "- Nada que exija mentir, pressionar, criar urgência falsa ou prometer",
    "  resultado clínico. Isto é saúde, e no Brasil há regra do conselho de",
    "  odontologia sobre o que se pode prometer em publicidade.",
    "- Se o que você achar contradizer os números acima, diga isso: os números desta clínica ganham.",
    "- Em português do Brasil.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

// ── O arquivo que a clínica lê ────────────────────────────────────────────

export interface RelatorioCompleto {
  de: string;
  ate: string;
  numeros: NumerosDaSemana;
  /** O nome da assistente deste consultório ("Luna" se não escolheu). */
  assistente?: string | null;
  relatorio: Relatorio;
  /** As práticas de fora, quando a busca rodou. */
  praticas: BoasPraticas | null;
  /** Por que não rodou, quando não rodou. Uma das duas é sempre nula. */
  motivoSemPraticas: string | null;
  modelo: string;
  geradoEm: string;
}

/** "2026-10-16" → "16/10". Sem `Date`: é conta de calendário, e `Date` traria
 *  fuso para uma data que já vem pronta. */
function diaMes(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? "").trim());
  return m ? `${m[3]}/${m[2]}` : String(iso ?? "").trim();
}

/**
 * O relatório em markdown, pronto para baixar.
 *
 * ── Por que o markdown é montado aqui, e não pedido ao modelo ─────────────
 *
 * Porque metade dele é número, e número pedido ao modelo é número arredondado.
 * O modelo escreve as partes de texto; esta função monta o documento em volta
 * delas e imprime as contagens como elas são. É a mesma fronteira do resto do
 * arquivo, aplicada ao documento final.
 *
 * E porque assim o cabeçalho pode dizer, sempre e sem depender de o modelo
 * lembrar, de onde veio cada parte. Quem for reescrever o manual com isto na
 * mão precisa saber o que foi contado e o que foi interpretado.
 */
export function markdownDoRelatorio(r: RelatorioCompleto): string {
  const n = r.numeros;
  const l: string[] = [];

  l.push(
    `# Olho de Deus — semana de ${diaMes(r.de)} a ${diaMes(r.ate)}`,
    "",
    `> Os números abaixo foram **contados** no banco, um por um. O texto foi`,
    `> **escrito** pelo modelo \`${r.modelo}\` a partir deles. Gerado em`,
    `> ${diaMes(r.geradoEm)}. Confiança que ele declarou na própria leitura:`,
    `> **${r.relatorio.confianca}**.`,
    "",
  );

  if (r.relatorio.gargalo) {
    l.push("## O gargalo da semana", "", r.relatorio.gargalo, "");
  }
  if (r.relatorio.oQueMudou) {
    l.push("## O que mudou desde a semana passada", "", r.relatorio.oQueMudou, "");
  }
  if (r.relatorio.comoEstaConduzindo) {
    l.push("## Como ela está conduzindo", "", r.relatorio.comoEstaConduzindo, "");
  }
  if (r.relatorio.oQueOSistemaImpede) {
    l.push("## O que o sistema está impedindo", "", r.relatorio.oQueOSistemaImpede, "");
  }

  // Manual e sistema separados, e cada um em ordem de prioridade: é a divisão
  // que decide quem faz o quê. Trocar uma frase do manual é uma tarde; mexer no
  // código é uma obra, e misturar os dois numa lista só faz a obra parecer
  // barata.
  if (r.relatorio.noManual.length) {
    l.push("## O que mudar no manual (.md)", "");
    for (const prio of PRIORIDADES) {
      const desta = r.relatorio.noManual.filter((m) => m.prioridade === prio);
      if (!desta.length) continue;
      l.push(`### Prioridade ${prio}`, "");
      for (const m of desta) {
        l.push(`- ${m.secao ? `**§${m.secao}** — ` : ""}${m.mudanca}`);
        if (m.porque) l.push(`  - Porque: ${m.porque}`);
      }
      l.push("");
    }
  }

  if (r.relatorio.noSistema.length) {
    l.push("## O que mudar no sistema (código)", "");
    for (const prio of PRIORIDADES) {
      const desta = r.relatorio.noSistema.filter((m) => m.prioridade === prio);
      if (!desta.length) continue;
      l.push(`### Prioridade ${prio}`, "");
      for (const m of desta) {
        l.push(`- ${m.oQue}`);
        if (m.porque) l.push(`  - Porque: ${m.porque}`);
      }
      l.push("");
    }
  }

  if (r.relatorio.observarNaProxima) {
    l.push("## O que observar na semana que vem", "", r.relatorio.observarNaProxima, "");
  }

  // ── Os números, por último e inteiros ───────────────────────────────────
  //
  // No fim porque ninguém abre um relatório para ler tabela; e inteiros porque
  // é com eles que se confere o texto de cima. Sem esta parte o relatório
  // vira opinião bem escrita.
  l.push(
    "## Os números, como foram contados",
    "",
    "| | |",
    "|---|---|",
    `| Conversas novas | ${n.conversas} |`,
    `| Conversas em que a ${nomeDaAssistente(r.assistente)} falou | ${n.conversasAtendidas} |`,
    `| Mensagens de paciente respondidas | ${n.mensagensRespondidas} |`,
    `| Mensagens de paciente sem resposta | ${n.mensagensIgnoradas} |`,
    `| Respostas que ofereceram horário | ${n.respostasComHorario} |`,
    `| Respostas que citaram preço | ${n.respostasComPreco} |`,
    `| Respostas que passaram para a equipe | ${n.respostasQueRepassaram} |`,
    `| Dúvidas encaminhadas formalmente | ${n.duvidasEncaminhadas} |`,
    `| Conversas que uma pessoa assumiu | ${n.conversasAssumidas} |`,
    `| Conversas com dúvida ainda aberta | ${n.conversasComDuvidaAberta} |`,
    `| Consultas criadas | ${n.consultasCriadas} |`,
    `| Consultas concluídas | ${n.consultasConcluidas} |`,
    `| Consultas por conversa atendida | ${n.conversaoPorcento === null ? "não houve conversa atendida" : `${n.conversaoPorcento}%`} |`,
    `| Conversas avaliadas pela própria ${nomeDaAssistente(r.assistente)} | ${n.licoes} |`,
    `| Dessas, fechadas por ela sozinha | ${n.licoesQueFecharam} |`,
    "",
  );

  const tabela = (titulo: string, itens: Contagem[]) => {
    if (!itens.length) return;
    l.push(`### ${titulo}`, "", ...itens.map((i) => `- ${i.rotulo}: **${i.quantas}**`), "");
  };
  tabela("Por que ela não respondeu", n.motivosDoSilencio);
  tabela("Como as conversas terminaram", n.motivosDasLicoes);
  tabela("O que ela mesma sugeriu, por tema", n.sugestoesPorTema);
  tabela("De onde as conversas vieram", n.porAnuncio);

  // ── A referência de fora, no fim e rotulada ─────────────────────────────
  //
  // Depois dos números de propósito, e com o aviso: é hipótese para testar, não
  // conclusão para aplicar. Ver o comentário em `FORMATO_DAS_BOAS_PRATICAS`.
  l.push("## Referência: o que se faz fora daqui", "");
  if (r.praticas && r.praticas.praticas.length) {
    l.push(
      "Isto NÃO foi medido nesta clínica. São hipóteses para testar, e onde",
      "contradisserem os números de cima, os números de cima ganham.",
      "",
    );
    for (const p of r.praticas.praticas) {
      l.push(`- **${p.pratica}**`);
      if (p.porqueFunciona) l.push(`  - Por que funciona: ${p.porqueFunciona}`);
      if (p.oQueTestarAqui) l.push(`  - Como testar aqui: ${p.oQueTestarAqui}`);
      l.push(`  - Fonte: ${p.fonte}`);
    }
    l.push("");
    if (r.praticas.oQueNaoAchei) {
      l.push(`O que ele procurou e não achou: ${r.praticas.oQueNaoAchei}`, "");
    }
  } else if (r.motivoSemPraticas) {
    l.push(
      `A busca não foi feita nesta semana: ${r.motivoSemPraticas}`,
      "",
      "O resto do relatório está completo — a busca é uma seção à parte",
      "justamente para não levar a semana embora quando falha.",
      "",
    );
  } else {
    l.push("A busca na internet está desligada nas configurações do Olho.", "");
  }

  return l.join("\n");
}

// ── As seções do manual, e por que só os títulos ──────────────────────────

/**
 * Os títulos das seções do manual.
 *
 * O manual instalado hoje tem 88.659 caracteres — perto de 25 mil tokens.
 * Mandá-lo inteiro a cada relatório custaria isso toda semana para servir a UMA
 * finalidade: a sugestão apontar para uma seção que existe, em vez de inventar
 * um lugar onde encaixar.
 *
 * Os títulos bastam para isso e cabem em algumas centenas de tokens. O corpo
 * de cada seção o modelo não precisa ler: quem já leu, conversa por conversa,
 * foi `agente-licoes` — e as sugestões dele, que chegam aqui citadas, já vêm
 * com o número da seção.
 */
export function secoesDoManual(manual: string | null | undefined, maximo = 200): string[] {
  const linhas = String(manual ?? "").split("\n");
  const titulos: string[] = [];
  for (const linha of linhas) {
    const t = linha.trim();
    // Markdown de verdade (`## 14.1 Preço`) e a forma numerada que o manual da
    // clínica também usa (`14.1. Preço`) no começo da linha. As duas aparecem
    // no LUNA V3, e pegar só uma deixaria metade do manual invisível.
    if (/^#{1,4}\s+\S/.test(t) || /^\d{1,2}(\.\d{1,2})*\.?\s+\S/.test(t)) {
      titulos.push(t.replace(/^#+\s*/, ""));
      if (titulos.length >= maximo) break;
    }
  }
  return titulos;
}
