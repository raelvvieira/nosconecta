// Checagens do Olho de Deus.
//
// ── O que está em jogo ─────────────────────────────────────────────────────
//
// Este relatório é lido uma vez por semana e vira mudança no manual da Luna. Um
// número errado aqui não dá erro em tela nenhuma: dá alguém reescrevendo a
// instrução dela com base num fato que não aconteceu.
//
// Por isso a regra do arquivo que isto exercita é que o modelo NÃO conta nada.
// Todos os números saem de `numerosDaSemana`, que é código puro — e é
// exatamente o que estes testes conferem.
//
// Os modos de errar, todos silenciosos:
//
//   **Contar eco como silêncio.** A resposta da própria Luna volta pelo webhook
//   e entra na auditoria como "ignorada". Contá-la infla o número que mais
//   importa da tabela — o de mensagens de paciente sem resposta — e o relatório
//   passa a culpar o sistema por mensagens que nunca existiram.
//
//   **Dividir por zero com cara de zero.** Semana sem conversa atendida não tem
//   conversão de 0%; não tem conversão. "0%" faria a semana seguinte parecer uma
//   melhora que não houve.
//
//   **Deixar o markdown remontar o número.** O documento é montado em volta das
//   contagens, não a partir de uma segunda leitura delas.
import {
  MAX_PRATICAS,
  TEMAS,
  boasPraticasDoJson,
  markdownDoRelatorio,
  numerosDaSemana,
  promptDasBoasPraticas,
  promptDoOlho,
  relatorioDoJson,
  secoesDoManual,
  temaDaSugestao,
  type LicaoDaSemana,
  type LinhaDeAuditoria,
  type SessaoDaSemana,
} from "../supabase/functions/_shared/olho-de-deus.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}
const contem = (n: string, t: string, x: string) => conferir(n, t.includes(x), true);
const naoContem = (n: string, t: string, x: string) => conferir(n, t.includes(x), false);

// ── Os temas: 117 sugestões virando uma decisão ────────────────────────────
//
// As frases abaixo são sugestões REAIS desta base, copiadas de
// `ai_agent_licoes`. É o único jeito de o agrupamento ser conferível.

conferir(
  "a sugestão que repete 72 vezes cai no tema certo",
  temaDaSugestao(
    "Na seção 14.1, acrescentar que, quando a pessoa pergunta o preço de um combo de anúncio, depois de responder ao preço devo conduzir para avaliação e oferecer dois horários reais",
  ),
  "oferecer dois horários",
);
conferir(
  "retomada combinada é follow-up",
  temaDaSugestao(
    "Na seção 21, acrescentar que, se a pessoa disser quando pretende retomar, devo combinar e registrar um follow-up contextual para esse dia.",
  ),
  "voltar em quem sumiu",
);
conferir(
  "endereço cai em unidade",
  temaDaSugestao(
    "Na seção 6.4, acrescentar que, após responder o endereço, não repetir a pergunta",
  ),
  "unidade e endereço",
);
conferir(
  "sinal e juros caem em preço",
  temaDaSugestao("resposta-modelo para dúvidas sobre sinal e juros: informar apenas condições"),
  "preço e condições",
);
// Sem acento e em caixa alta continua sendo a mesma palavra: o modelo escreve
// como quiser, e um tema que depende da grafia perfeita não agrupa nada.
conferir(
  "HORARIOS sem acento e em caixa alta agrupa igual",
  temaDaSugestao("OFERECER DOIS HORARIOS REAIS"),
  "oferecer dois horários",
);
// O que não casa vai para `outros`, e isso é informação: tema que começa a
// encher `outros` é tema que falta na lista.
conferir("o que não casa vira outros", temaDaSugestao("escrever com mais carinho"), "outros");
conferir("sugestão vazia vira outros", temaDaSugestao(""), "outros");
conferir("a lista de temas não está vazia", TEMAS.length > 0, true);

// ── As contagens ───────────────────────────────────────────────────────────

const licao = (p: Partial<LicaoDaSemana> = {}): LicaoDaSemana => ({
  desfecho: "nao_agendou",
  motivo: "não respondeu mais",
  confianca: "media",
  sugestao: "",
  oQueFaltou: "",
  momentoDecisivo: "",
  mensagens: 5,
  ...p,
});
const linha = (p: Partial<LinhaDeAuditoria> = {}): LinhaDeAuditoria => ({
  direction: "saida",
  skippedReason: null,
  conteudo: "",
  ...p,
});
const sessao = (p: Partial<SessaoDaSemana> = {}): SessaoDaSemana => ({
  anuncioTitulo: null,
  anuncioId: null,
  humanoAssumiu: false,
  duvidaPendente: false,
  lunaFalou: true,
  ...p,
});

// O defeito que mais importa: o eco da própria Luna NÃO é mensagem de paciente
// sem resposta. Ele chega como "ignorada" com o motivo "humano assumiu" e sem
// texto de paciente nenhum.
{
  const n = numerosDaSemana({
    licoes: [],
    auditoria: [
      // Mensagem de paciente barrada: conta.
      linha({
        direction: "ignorada",
        skippedReason: "conversa antiga",
        conteudo: "oi, tem horário?",
      }),
      // Eco da clínica voltando, sem texto: não conta.
      linha({ direction: "ignorada", skippedReason: "humano assumiu a conversa", conteudo: "" }),
      // Linha de dúvida encaminhada: é registro do caminho novo, não silêncio.
      linha({
        direction: "ignorada",
        skippedReason: "dúvida encaminhada: quantos ml inclui?",
        conteudo: null,
      }),
    ],
    sessoes: [],
    consultasCriadas: 0,
    consultasConcluidas: 0,
  });
  conferir("só mensagem de paciente conta como silêncio", n.mensagensIgnoradas, 1);
  conferir("e o motivo é o dela", n.motivosDoSilencio, [{ rotulo: "conversa antiga", quantas: 1 }]);
  conferir("a dúvida encaminhada é contada à parte", n.duvidasEncaminhadas, 1);
}

// Preço contra horário: a proporção que revelou o gargalo.
{
  const n = numerosDaSemana({
    licoes: [],
    auditoria: [
      linha({ conteudo: "O combo fica R$ 990 à vista." }),
      linha({ conteudo: "Tenho quinta às 14h ou sexta às 10h, qual fica melhor?" }),
      linha({ conteudo: "Vou confirmar com a equipe e já te falo." }),
      linha({ conteudo: "Oii, aqui é a Luna 😊" }),
      // Entrada não é resposta: contar aqui inflaria as três marcas de cima.
      linha({ direction: "entrada", conteudo: "quanto custa R$?" }),
    ],
    sessoes: [],
    consultasCriadas: 0,
    consultasConcluidas: 0,
  });
  conferir("conta quem citou preço", n.respostasComPreco, 1);
  conferir("conta quem ofereceu horário", n.respostasComHorario, 1);
  conferir("conta quem repassou", n.respostasQueRepassaram, 1);
  conferir("e as entradas ficam fora das marcas", n.mensagensRespondidas, 1);
}

// "às 14h", "as 14:00" e "às 9 horas" são todos oferta de horário; "14 anos"
// não é. A marca precisa ser estreita o bastante para a proporção valer.
for (const [texto, esperado] of [
  ["posso quinta às 14h", 1],
  ["pode ser as 9:30", 1],
  ["tenho às 9 horas", 1],
  ["ela tem 14 anos", 0],
  ["custa 14 reais", 0],
] as const) {
  const n = numerosDaSemana({
    licoes: [],
    auditoria: [linha({ conteudo: texto })],
    sessoes: [],
    consultasCriadas: 0,
    consultasConcluidas: 0,
  });
  conferir(`marca de horário em "${texto}"`, n.respostasComHorario, esperado);
}

// Conversão: `null` quando não houve conversa atendida, NUNCA zero.
{
  const semNinguem = numerosDaSemana({
    licoes: [],
    auditoria: [],
    sessoes: [sessao({ lunaFalou: false })],
    consultasCriadas: 0,
    consultasConcluidas: 0,
  });
  conferir("sem conversa atendida não há taxa", semNinguem.conversaoPorcento, null);
  conferir("mas a conversa existe", semNinguem.conversas, 1);
  conferir("e ela não conta como atendida", semNinguem.conversasAtendidas, 0);

  const comGente = numerosDaSemana({
    licoes: [],
    auditoria: [],
    sessoes: [sessao(), sessao(), sessao(), sessao()],
    consultasCriadas: 1,
    consultasConcluidas: 0,
  });
  conferir("uma consulta em quatro conversas é 25%", comGente.conversaoPorcento, 25);

  const comZero = numerosDaSemana({
    licoes: [],
    auditoria: [],
    sessoes: [sessao()],
    consultasCriadas: 0,
    consultasConcluidas: 0,
  });
  conferir("zero consulta com conversa atendida é 0%, não null", comZero.conversaoPorcento, 0);
}

// Ordem: do maior para o menor, e empate pelo rótulo — duas semanas iguais
// têm de render relatórios iguais, não embaralhados.
{
  const n = numerosDaSemana({
    licoes: [
      licao({ motivo: "parou no preço" }),
      licao({ motivo: "não respondeu mais" }),
      licao({ motivo: "não respondeu mais" }),
      licao({ motivo: "eu me perdi na conversa" }),
    ],
    auditoria: [],
    sessoes: [],
    consultasCriadas: 0,
    consultasConcluidas: 0,
  });
  conferir(
    "motivos do maior para o menor, empate alfabético",
    n.motivosDasLicoes.map((m) => `${m.rotulo}:${m.quantas}`),
    ["não respondeu mais:2", "eu me perdi na conversa:1", "parou no preço:1"],
  );
  conferir("e o total de lições fecha", n.licoes, 4);
}

// Sessão sem anúncio não desaparece da tabela: "sem anúncio identificado" é um
// número que importa — é quem chegou sem a gente saber de onde.
{
  const n = numerosDaSemana({
    licoes: [],
    auditoria: [],
    sessoes: [
      sessao({ anuncioTitulo: "Fale Comigo" }),
      sessao({ anuncioTitulo: "Fale Comigo" }),
      sessao({ anuncioTitulo: null }),
    ],
    consultasCriadas: 0,
    consultasConcluidas: 0,
  });
  conferir(
    "quem veio sem anúncio continua contado",
    n.porAnuncio.map((m) => `${m.rotulo}:${m.quantas}`),
    ["Fale Comigo:2", "sem anúncio identificado:1"],
  );
}

// Semana vazia não derruba nada e não inventa número.
{
  const n = numerosDaSemana({
    licoes: [],
    auditoria: [],
    sessoes: [],
    consultasCriadas: 0,
    consultasConcluidas: 0,
  });
  conferir("semana vazia: zero conversas", n.conversas, 0);
  conferir("semana vazia: sem taxa", n.conversaoPorcento, null);
  conferir("semana vazia: tabelas vazias", n.motivosDoSilencio.length, 0);
}

// ── As seções do manual ────────────────────────────────────────────────────
//
// Só os títulos vão ao modelo: o manual instalado tem 88.659 caracteres, e
// mandá-lo inteiro custaria 25 mil tokens por semana para servir a uma coisa
// só — a sugestão apontar para uma seção que existe.
{
  const manual = [
    "# LUNA V3",
    "Algum texto de abertura que não é título.",
    "## 5. Abertura da conversa",
    "mais texto",
    "### 5.4 O texto do anúncio não é a pergunta da pessoa",
    "16.2. Formas de pagamento",
    "não é título: 2026 foi o ano",
  ].join("\n");
  const s = secoesDoManual(manual);
  contem("pega título de markdown", s.join("\n"), "5. Abertura da conversa");
  contem("pega subtítulo", s.join("\n"), "5.4 O texto do anúncio não é a pergunta da pessoa");
  contem("pega a forma numerada sem cerquilha", s.join("\n"), "16.2. Formas de pagamento");
  naoContem("não pega texto corrido", s.join("\n"), "Algum texto de abertura");
  conferir("e o corpo do manual não vem junto", s.join("\n").includes("mais texto"), false);
  conferir("manual vazio não quebra", secoesDoManual(null), []);
  conferir("o teto é respeitado", secoesDoManual("## a\n## b\n## c", 2).length, 2);
}

// ── O pedido ao modelo ─────────────────────────────────────────────────────

{
  const numeros = numerosDaSemana({
    licoes: [
      licao({
        confianca: "alta",
        oQueFaltou: "não ofereci dois horários",
        sugestao: "oferecer horários",
      }),
    ],
    auditoria: [linha({ conteudo: "fica R$ 990" })],
    sessoes: [sessao()],
    consultasCriadas: 0,
    consultasConcluidas: 0,
  });
  const p = promptDoOlho({
    de: "2026-10-09",
    ate: "2026-10-15",
    numeros,
    licoes: [licao({ confianca: "alta", oQueFaltou: "não ofereci dois horários" })],
    secoesDoManual: ["14.1 Preço", "29 Agendamento"],
    gargaloAnterior: "Ela não oferece horário depois do preço.",
  });
  contem("o pedido traz a janela", p, "2026-10-09 a 2026-10-15");
  contem("traz os números contados", p, "Respostas que citaram preço: 1");
  contem("traz as seções do manual", p, "14.1 Preço");
  contem("traz o gargalo anterior para comparar", p, "Ela não oferece horário depois do preço.");
  contem("cita a fala da lição", p, "não ofereci dois horários");
  // A regra que protege o relatório inteiro.
  contem("proíbe inventar número", p, "Não invente número nenhum");
  contem("manda separar conversa de sistema", p, "defeito de SISTEMA");
  // E o que NÃO pode estar ali: um pedido que pareça atendimento.
  naoContem("não pede para atender ninguém", p, "responda ao paciente");

  // Sem relatório anterior, a seção de comparação não aparece inventada.
  const primeiro = promptDoOlho({
    de: "2026-10-09",
    ate: "2026-10-15",
    numeros,
    licoes: [],
    secoesDoManual: [],
    gargaloAnterior: null,
  });
  naoContem("primeira semana não compara com nada", primeiro, "semana passada apontou");
}

// A busca leva os números da clínica: sem eles, a pergunta virava "o que
// funciona em WhatsApp?" e a resposta, "responda rápido e seja simpático".
{
  const numeros = numerosDaSemana({
    licoes: [],
    auditoria: [linha({ conteudo: "fica R$ 990" })],
    sessoes: [sessao()],
    consultasCriadas: 0,
    consultasConcluidas: 0,
  });
  const p = promptDasBoasPraticas(numeros, "Ela não oferece horário depois do preço.");
  contem("a busca sabe do gargalo", p, "Ela não oferece horário depois do preço.");
  contem("e dos números", p, "1 respostas citaram preço");
  contem("exige fonte", p, "Nada sem fonte");
  contem("proíbe urgência falsa", p, "urgência falsa");
  contem("e deixa claro quem ganha no empate", p, "números desta clínica ganham");
  conferir("o teto de práticas existe", MAX_PRATICAS > 0, true);
}

// ── A leitura da resposta ──────────────────────────────────────────────────

{
  const r = relatorioDoJson({
    gargalo_da_semana: "  Ela não oferece horário.  ",
    o_que_mudou: "",
    como_ela_esta_conduzindo: "Tom bom, condução fraca.",
    o_que_o_sistema_impede: "2.910 mensagens caladas.",
    mudar_no_manual: [
      { secao: "14.1", mudanca: "oferecer dois horários", porque: "72 de 117", prioridade: "alta" },
      // Item sem a mudança escrita não é item: seria uma linha em branco com
      // prioridade alta na tela de quem vai decidir o que fazer na segunda.
      { secao: "9", mudanca: "   ", porque: "x", prioridade: "alta" },
    ],
    mudar_no_sistema: [{ o_que: "ligar o follow-up", porque: "80 sumiram", prioridade: "media" }],
    observar_na_proxima: "A proporção preço/horário.",
    confianca: "alta",
  });
  conferir("o gargalo vem sem espaço em volta", r.gargalo, "Ela não oferece horário.");
  conferir("item em branco sai da lista", r.noManual.length, 1);
  conferir("e o que ficou está inteiro", r.noManual[0].secao, "14.1");
  conferir("o sistema também é lido", r.noSistema[0].oQue, "ligar o follow-up");
  conferir("a confiança passa", r.confianca, "alta");
}

// Prioridade estranha vira `media`: o relatório não pode ter um item sem lugar
// nas listas por prioridade do markdown — ele desapareceria do documento.
conferir(
  "prioridade inventada vira media",
  relatorioDoJson({
    gargalo_da_semana: "x",
    mudar_no_manual: [{ mudanca: "y", prioridade: "URGENTÍSSIMO" }],
  }).noManual[0].prioridade,
  "media",
);
// Lixo não derruba e não inventa.
conferir("nulo vira relatório vazio", relatorioDoJson(null).gargalo, "");
conferir("confiança ausente é baixa", relatorioDoJson({}).confianca, "baixa");
conferir(
  "lista que não é lista vira vazia",
  relatorioDoJson({ mudar_no_manual: "x" }).noManual,
  [],
);

// A seção de fora é a mais fácil de encher de texto que parece certo. Sem
// fonte, não entra.
{
  const b = boasPraticasDoJson({
    praticas: [
      {
        pratica: "Oferecer duas opções fecha mais",
        porque_funciona: "reduz esforço",
        fonte: "exemplo.com/estudo",
        o_que_testar_aqui: "medir",
      },
      {
        pratica: "Seja simpático",
        porque_funciona: "as pessoas gostam",
        fonte: "",
        o_que_testar_aqui: "",
      },
      { pratica: "", fonte: "exemplo.com" },
    ],
    o_que_nao_achei: "nada sobre odontologia no Brasil",
  });
  conferir("prática sem fonte não entra", b.praticas.length, 1);
  conferir("e a que ficou é a com fonte", b.praticas[0].fonte, "exemplo.com/estudo");
  conferir("o que não achou é guardado", b.oQueNaoAchei, "nada sobre odontologia no Brasil");
  conferir("nulo não quebra", boasPraticasDoJson(null).praticas, []);
}

// ── O documento ────────────────────────────────────────────────────────────

const numerosCheios = numerosDaSemana({
  licoes: [licao({ motivo: "não respondeu mais", sugestao: "oferecer dois horários reais" })],
  auditoria: [
    linha({ conteudo: "fica R$ 990" }),
    linha({ direction: "ignorada", skippedReason: "conversa antiga", conteudo: "oi?" }),
  ],
  sessoes: [sessao()],
  consultasCriadas: 2,
  consultasConcluidas: 1,
});

const relatorioCheio = relatorioDoJson({
  gargalo_da_semana: "Ela não oferece horário depois do preço.",
  o_que_mudou: "Igual à semana passada.",
  como_ela_esta_conduzindo: "Tom bom, condução fraca.",
  o_que_o_sistema_impede: "Uma mensagem barrada por conversa antiga.",
  mudar_no_manual: [
    {
      secao: "14.1",
      mudanca: "oferecer dois horários",
      porque: "1 preço, 0 horários",
      prioridade: "alta",
    },
    { secao: "", mudanca: "seção nova sobre retomada", porque: "80 sumiram", prioridade: "baixa" },
  ],
  mudar_no_sistema: [{ o_que: "ligar o follow-up", porque: "80 sumiram", prioridade: "alta" }],
  observar_na_proxima: "A proporção preço/horário.",
  confianca: "media",
});

{
  const md = markdownDoRelatorio({
    de: "2026-10-09",
    ate: "2026-10-15",
    numeros: numerosCheios,
    relatorio: relatorioCheio,
    praticas: null,
    motivoSemPraticas: null,
    modelo: "gpt-6-luna",
    geradoEm: "2026-10-16T07:00:00Z",
  });
  contem("o título traz a semana", md, "semana de 09/10 a 15/10");
  contem("o cabeçalho diz o que foi contado e o que foi escrito", md, "foram **contados**");
  contem("e qual modelo escreveu", md, "gpt-6-luna");
  contem("o gargalo está lá", md, "Ela não oferece horário depois do preço.");
  // A separação que decide quem faz o quê.
  contem("manual e sistema são seções separadas", md, "O que mudar no manual (.md)");
  contem("e a do código também", md, "O que mudar no sistema (código)");
  contem("a seção vem com o §", md, "**§14.1**");
  // Item sem seção não imprime um § vazio.
  naoContem("item sem seção não ganha § solto", md, "**§** —");
  // Os números, como foram contados.
  contem("o número do silêncio aparece", md, "| Mensagens de paciente sem resposta | 1 |");
  contem("a consulta criada aparece", md, "| Consultas criadas | 2 |");
  contem("a tabela de motivos aparece", md, "conversa antiga: **1**");
  contem("e o tema das sugestões", md, "oferecer dois horários: **1**");
  // A busca desligada é dita, não escondida.
  contem("diz que a busca está desligada", md, "busca na internet está desligada");
}

// Busca que falhou: o relatório sai COMPLETO e o motivo aparece. É o desenho
// que impede uma semana inteira de se perder por causa da parte mais frágil.
{
  const md = markdownDoRelatorio({
    de: "2026-10-09",
    ate: "2026-10-15",
    numeros: numerosCheios,
    relatorio: relatorioCheio,
    praticas: null,
    motivoSemPraticas: "o modelo escolhido não aceita busca",
    modelo: "gpt-6-luna",
    geradoEm: "2026-10-16T07:00:00Z",
  });
  contem("o motivo da falha aparece", md, "o modelo escolhido não aceita busca");
  contem("e o relatório segue completo", md, "Ela não oferece horário depois do preço.");
  contem("com os números", md, "| Consultas criadas | 2 |");
}

// Busca que rodou: a seção é rotulada como referência, e a fonte vai junto.
{
  const md = markdownDoRelatorio({
    de: "2026-10-09",
    ate: "2026-10-15",
    numeros: numerosCheios,
    relatorio: relatorioCheio,
    praticas: {
      praticas: [
        {
          pratica: "Duas opções fecham mais que uma pergunta aberta",
          porqueFunciona: "reduz o esforço de decidir",
          fonte: "exemplo.com/estudo",
          oQueTestarAqui: "comparar com a proporção preço/horário",
        },
      ],
      oQueNaoAchei: "nada específico de odontologia no Brasil",
    },
    motivoSemPraticas: null,
    modelo: "gpt-6-luna",
    geradoEm: "2026-10-16T07:00:00Z",
  });
  contem("a prática aparece", md, "Duas opções fecham mais");
  contem("com a fonte", md, "Fonte: exemplo.com/estudo");
  // O aviso que mantém a hierarquia de fontes: o que a clínica mediu ganha.
  contem("rotulada como não medida aqui", md, "NÃO foi medido nesta clínica");
  contem("e com quem ganha no empate", md, "os números de cima ganham");
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do Olho de Deus`);
