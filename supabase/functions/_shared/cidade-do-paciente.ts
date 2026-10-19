// De que cidade a pessoa está falando — e qual das unidades é a dela.
//
// ── Por que existe ──────────────────────────────────────────────────────
//
// A clínica atende em duas cidades. A Dra. Mariane mora em Florianópolis e
// viaja a Porto Alegre de tempo em tempo, e os anúncios rodam para as duas.
//
// A Luna não sabia disso. Ela oferecia os horários da faixa mais próxima, e a
// faixa mais próxima é quase sempre de Florianópolis — então quem clicou no
// anúncio de Porto Alegre recebia um horário em outra cidade, com o nome da
// unidade na frase e sem ninguém perguntar nada.
//
// A conversa da clínica, em 19/10: "a I.A identificar pelo DDD, mas
// simplesmente fazer uma confirmação de cidade antes de oferecer 2 horários".
// É literalmente isto que este arquivo faz — o DDD é palpite, a pergunta é a
// confirmação, e nada é oferecido antes dela.
//
// ── Por que código, e não o nome da cidade ──────────────────────────────
//
// Mesmo padrão de `agendamento-da-ia.ts` e `casos-da-ia.ts`: o modelo devolve
// `U1`, validado contra o catálogo que montou a instrução daquela mensagem.
// Devolver "Porto Alegre" obrigaria alguém a casar texto livre com o cadastro,
// e um "POA" ou um "porto alegre " com espaço sobrando viraria uma consulta na
// cidade errada. Código fora do catálogo não confirma nada.

/** Uma unidade do cadastro, como esta conta precisa dela. */
export interface UnidadeParaCidade {
  id: string;
  nome: string;
  endereco?: string | null;
}

/** A unidade com o código que o modelo usa para apontá-la. */
export interface UnidadeComCodigo {
  /** `U1`, `U2`… */
  codigo: string;
  id: string;
  nome: string;
}

/**
 * As unidades com código, na ordem em que vieram.
 *
 * Unidade sem id ou sem nome fica fora: sem id não há o que gravar, e sem nome
 * a Luna não teria como perguntar pela cidade.
 */
export function catalogoDeUnidades(
  unidades: readonly UnidadeParaCidade[] | null | undefined,
): UnidadeComCodigo[] {
  return (unidades ?? [])
    .filter((u) => String(u?.id ?? "").trim() && String(u?.nome ?? "").trim())
    .map((u, i) => ({
      codigo: `U${i + 1}`,
      id: String(u.id).trim(),
      nome: String(u.nome).trim(),
    }));
}

/**
 * O código que o modelo devolveu, virando unidade.
 *
 * Tolerante na CAIXA e nos espaços ("u2", " U2 "), e em nada mais: código que
 * não está no catálogo devolve nulo, e nulo quer dizer "a cidade continua não
 * confirmada" — a Luna pergunta de novo, que é melhor que marcar no escuro.
 */
export function unidadeEscolhida(
  resposta: { codigo?: string | null } | null | undefined,
  catalogo: readonly UnidadeComCodigo[],
): UnidadeComCodigo | null {
  const codigo = String(resposta?.codigo ?? "")
    .trim()
    .toUpperCase();
  if (!codigo) return null;
  return catalogo.find((u) => u.codigo === codigo) ?? null;
}

// ── O palpite pelo DDD ──────────────────────────────────────────────────
//
// O DDD diz onde a LINHA foi habilitada, não onde a pessoa está. Medido nas
// conversas de setembro e outubro: entre quem veio dos anúncios de Porto
// Alegre, 35 números com DDD 51 e 1 com DDD 48; entre os de Florianópolis, 44
// com DDD 48 e 2 com 51. Acerta quase sempre entre os dois DDDs locais — e
// cerca de um em cada cinco números é de fora dos dois, onde ele não diz nada.
//
// Por isso é palpite e não resposta: ele muda o JEITO de perguntar ("você é de
// Porto Alegre, né?" em vez de "de onde você fala?") e não dispensa a pergunta.

/** DDD → sigla do estado. */
const UF_POR_DDD: Record<string, string> = {
  "11": "SP",
  "12": "SP",
  "13": "SP",
  "14": "SP",
  "15": "SP",
  "16": "SP",
  "17": "SP",
  "18": "SP",
  "19": "SP",
  "21": "RJ",
  "22": "RJ",
  "24": "RJ",
  "27": "ES",
  "28": "ES",
  "31": "MG",
  "32": "MG",
  "33": "MG",
  "34": "MG",
  "35": "MG",
  "37": "MG",
  "38": "MG",
  "41": "PR",
  "42": "PR",
  "43": "PR",
  "44": "PR",
  "45": "PR",
  "46": "PR",
  "47": "SC",
  "48": "SC",
  "49": "SC",
  "51": "RS",
  "53": "RS",
  "54": "RS",
  "55": "RS",
  "61": "DF",
  "62": "GO",
  "64": "GO",
  "63": "TO",
  "65": "MT",
  "66": "MT",
  "67": "MS",
  "68": "AC",
  "69": "RO",
  "71": "BA",
  "73": "BA",
  "74": "BA",
  "75": "BA",
  "77": "BA",
  "79": "SE",
  "81": "PE",
  "87": "PE",
  "82": "AL",
  "83": "PB",
  "84": "RN",
  "85": "CE",
  "88": "CE",
  "86": "PI",
  "89": "PI",
  "91": "PA",
  "93": "PA",
  "94": "PA",
  "92": "AM",
  "97": "AM",
  "95": "RR",
  "96": "AP",
  "98": "MA",
  "99": "MA",
};

/** Sigla do estado → capital. É por ela que o DDD encontra a unidade: o
 *  cadastro guarda cidade e rua, nunca DDD. */
const CAPITAL_DA_UF: Record<string, string> = {
  AC: "Rio Branco",
  AL: "Maceió",
  AM: "Manaus",
  AP: "Macapá",
  BA: "Salvador",
  CE: "Fortaleza",
  DF: "Brasília",
  ES: "Vitória",
  GO: "Goiânia",
  MA: "São Luís",
  MG: "Belo Horizonte",
  MS: "Campo Grande",
  MT: "Cuiabá",
  PA: "Belém",
  PB: "João Pessoa",
  PE: "Recife",
  PI: "Teresina",
  PR: "Curitiba",
  RJ: "Rio de Janeiro",
  RN: "Natal",
  RO: "Porto Velho",
  RR: "Boa Vista",
  RS: "Porto Alegre",
  SC: "Florianópolis",
  SE: "Aracaju",
  SP: "São Paulo",
  TO: "Palmas",
};

/** Sem acento e em minúsculas, para comparar cidade do cadastro com cidade da
 *  tabela: "Florianópolis" e "florianopolis" são a mesma cidade. */
function comparavel(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * O DDD de um número de WhatsApp.
 *
 * Exige o 55 do Brasil e o tamanho de um número brasileiro — 12 dígitos com
 * fixo, 13 com celular. Qualquer outra coisa devolve nulo, e nulo é "não sei".
 *
 * ── Por que não aceitar o número sem o código do país ─────────────────────
 *
 * Porque um número de onze dígitos é ambíguo, e a ambiguidade cai do lado
 * errado: "14155550123" é um telefone de São Francisco, e lido como brasileiro
 * ele tem DDD 14 — Bauru, interior de São Paulo. O palpite sairia errado com
 * cara de certo.
 *
 * E não se perde nada: o telefone sempre chega de `telefoneDoJid`, que
 * devolve o número como o WhatsApp o identifica, com código de país.
 */
export function dddDoTelefone(telefone: string | null | undefined): string | null {
  const digitos = String(telefone ?? "").replace(/\D/g, "");
  if (!digitos.startsWith("55")) return null;
  if (digitos.length !== 12 && digitos.length !== 13) return null;
  const ddd = digitos.slice(2, 4);
  return UF_POR_DDD[ddd] ? ddd : null;
}

/**
 * A unidade que o DDD sugere, quando sugere uma só.
 *
 * Casa primeiro pela CIDADE (a capital do estado do DDD aparece no nome ou no
 * endereço da unidade), e só então pela SIGLA do estado. Duas unidades
 * batendo, ou nenhuma, devolve nulo: um palpite ambíguo é pior que nenhum,
 * porque entraria na instrução como se fosse informação.
 */
export function unidadePeloDdd(
  telefone: string | null | undefined,
  catalogo: readonly UnidadeComCodigo[],
  /** Os endereços, pelo id da unidade — o nome sozinho pode não dizer a
   *  cidade. */
  enderecos: Readonly<Record<string, string | null | undefined>> = {},
): UnidadeComCodigo | null {
  const ddd = dddDoTelefone(telefone);
  if (!ddd) return null;
  const uf = UF_POR_DDD[ddd];
  const capital = comparavel(CAPITAL_DA_UF[uf] ?? "");
  if (!capital) return null;

  const texto = (u: UnidadeComCodigo) => comparavel(`${u.nome} ${enderecos[u.id] ?? ""}`);

  const porCidade = catalogo.filter((u) => texto(u).includes(capital));
  if (porCidade.length === 1) return porCidade[0];

  // A sigla só vale como palavra inteira: "RS" dentro de outra palavra não é
  // estado nenhum, e um endereço tem muita letra solta.
  const sigla = new RegExp(`(^|[^a-z0-9])${comparavel(uf)}([^a-z0-9]|$)`);
  const porEstado = catalogo.filter((u) => sigla.test(texto(u)));
  return porEstado.length === 1 ? porEstado[0] : null;
}

/**
 * As linhas da instrução sobre a cidade.
 *
 * Vazio quando a clínica tem uma unidade só: a pergunta não existe, e uma
 * seção pedindo para confirmar a cidade de quem só tem uma opção é ruído que o
 * modelo tenta obedecer.
 */
export function secaoDaCidade(
  catalogo: readonly UnidadeComCodigo[],
  confirmada: UnidadeComCodigo | null,
  palpite: UnidadeComCodigo | null,
): string {
  if (catalogo.length < 2) return "";

  const lista = catalogo.map((u) => `- ${u.codigo} = ${u.nome}`);

  if (confirmada) {
    return [
      "## A cidade desta pessoa",
      "",
      `Ela já disse que é de ${confirmada.nome} (${confirmada.codigo}). NÃO pergunte`,
      "de novo — perguntar duas vezes a mesma coisa é o que mais denuncia",
      "automação. Todos os horários que você tem para oferecer já são dessa",
      "unidade.",
      "",
      "Se em algum momento ela disser que na verdade é da outra cidade, preencha",
      "`cidadeConfirmada` com o código da nova:",
      "",
      ...lista,
    ].join("\n");
  }

  const partes = [
    "## A cidade desta pessoa",
    "",
    "A clínica atende em mais de uma cidade, e cada uma tem a sua agenda:",
    "",
    ...lista,
    "",
    "ANTES de oferecer qualquer horário, confirme de onde ela fala. Uma pergunta",
    'curta, dentro da conversa, não um formulário: "você é de Porto Alegre?",',
    '"você está aqui em Florianópolis?". Pode ser na mesma mensagem em que você',
    "responde o que ela perguntou.",
  ];

  if (palpite) {
    // Sem o "NÓS" na frente: a pergunta é sobre a CIDADE da pessoa, e "você é
    // de NÓS Porto Alegre?" não é português.
    const cidade = palpite.nome.replace(/^N[ÓO]S\s+/i, "").trim() || palpite.nome;
    partes.push(
      "",
      // O DDD entra como JEITO DE PERGUNTAR, nunca como resposta: ele diz onde
      // a linha foi habilitada, e um em cada cinco números é de outro estado.
      `O DDD do número dela costuma ser de ${palpite.nome} (${palpite.codigo}). Use isso`,
      `só para perguntar do jeito mais provável — "você é de ${cidade}, né?" — e`,
      "NÃO para afirmar: o DDD é de onde o número foi feito, não de onde a pessoa",
      "está hoje.",
    );
  }

  partes.push(
    "",
    "Quando ela responder, preencha `cidadeConfirmada` com o código da unidade",
    "dela. É isso que faz a consulta ser marcada na cidade certa e o endereço da",
    "confirmação sair correto.",
    "",
    // ── A mensagem em que ela acabou de dizer a cidade ───────────────────
    //
    // Os dois horários da seção de horários foram escolhidos antes desta
    // mensagem, quando a cidade ainda era desconhecida — podem ser de outra
    // cidade. A lista de alternativas, não: ela traz as duas cidades, cada
    // linha com a sua unidade. Sem esta instrução, o modelo ou ofereceria os
    // dois primeiros (cidade errada) ou não ofereceria nada depois de a pessoa
    // ter respondido o que ele perguntou.
    "Se ela disser a cidade NESTA mensagem e você for oferecer horário em",
    "seguida, use a lista de alternativas da seção de horários: cada linha diz a",
    "unidade, e você oferece dois da cidade dela. Não havendo nenhum da cidade",
    "dela, diga que vai confirmar as próximas datas de atendimento lá com a",
    "equipe — nunca ofereça um horário da outra cidade.",
    "",
    "Enquanto ela não disser a cidade, NÃO ofereça horário e NÃO preencha",
    "`horarioFechado`. Marcar na cidade errada faz a pessoa viajar para outro",
    "estado, ou chegar a uma sala onde não há ninguém.",
  );

  return partes.join("\n");
}
