// O módulo Paciente Modelo HOF: a seção da instrução gerada do cadastro.
//
// ── O que este arquivo decide ────────────────────────────────────────────
//
// Antes, a edição vivia em três campos soltos do agente (uma data, um texto
// livre e um endereço). A Luna anunciava "23, 24 e 25" quando a prática era
// só sábado e domingo, não sabia quantos ml tinha cada valor, dava o endereço
// da clínica e inventava que o sinal "não é abatido".
//
// Agora a edição é cadastro: dias de prática com vagas, ofertas com ml e
// parcelas, a regra do sinal, a FAQ aprovada. Esta seção é montada daqui a
// cada resposta, e só entra quando o público da sessão é `paciente_modelo`
// e o módulo está ligado. Fora disso, vale a proibição de sempre: nada de
// preço de harmonização por WhatsApp.
//
// Módulo puro, com `tests/modulo-paciente-modelo.ts`. A gravação da reserva
// mora em `atendimento.ts`.

export type StatusDaEdicao = "rascunho" | "inscricoes_abertas" | "esgotada" | "encerrada";

export interface PraticaDaEdicao {
  id: string;
  /** AAAA-MM-DD */
  data: string;
  horaInicio: string | null;
  horaFim: string | null;
  vagas: number;
  /** Reservas que ocupam vaga (sinal pendente dentro do prazo ou confirmada). */
  ocupadas: number;
  observacao?: string | null;
}

export interface OfertaDaEdicao {
  id: string;
  nome: string;
  descricao: string | null;
  ml: number | null;
  precoVista: number;
  precoParcelado: number | null;
  parcelasMax: number | null;
  tipo: "procedimento" | "combo";
  destaque: boolean;
}

export interface EdicaoDoModulo {
  id: string;
  nome: string;
  cidade: string | null;
  endereco: string | null;
  inicio: string | null;
  fim: string | null;
  status: StatusDaEdicao;
  observacoes: string | null;
  praticas: PraticaDaEdicao[];
  ofertas: OfertaDaEdicao[];
}

export interface ConfigDoModulo {
  sinal: {
    valor: number;
    abatido: boolean;
    chavePix: string;
    titular: string;
    prazoHoras: number;
  };
  pagamento: { formas: string[]; parcelasMax: number; boleto: boolean };
  cancelamento: string;
  credenciais: string;
  fotos: string;
  retornoDias: number | null;
  faq: { pergunta: string; resposta: string }[];
  listaDeInteresse: boolean;
}

export const CONFIG_PADRAO: ConfigDoModulo = {
  sinal: { valor: 150, abatido: false, chavePix: "", titular: "", prazoHoras: 24 },
  pagamento: { formas: ["pix", "cartao", "cartao_parcelado"], parcelasMax: 4, boleto: false },
  cancelamento: "",
  credenciais: "",
  fotos: "",
  retornoDias: null,
  faq: [],
  listaDeInteresse: true,
};

/** A configuração como a tela e a Luna a leem: o que vier torto cai no padrão. */
export function configDoModulo(bruto: unknown): ConfigDoModulo {
  const c = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, any>;
  const s = (c.sinal && typeof c.sinal === "object" ? c.sinal : {}) as Record<string, unknown>;
  const p = (c.pagamento && typeof c.pagamento === "object" ? c.pagamento : {}) as Record<
    string,
    unknown
  >;
  const num = (v: unknown, padrao: number) =>
    Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : padrao;
  const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    sinal: {
      valor: num(s.valor, CONFIG_PADRAO.sinal.valor),
      abatido: s.abatido === true,
      chavePix: txt(s.chavePix),
      titular: txt(s.titular),
      prazoHoras: num(s.prazoHoras, CONFIG_PADRAO.sinal.prazoHoras),
    },
    pagamento: {
      formas: Array.isArray(p.formas) ? p.formas.map(String) : CONFIG_PADRAO.pagamento.formas,
      parcelasMax: num(p.parcelasMax, CONFIG_PADRAO.pagamento.parcelasMax),
      boleto: p.boleto === true,
    },
    cancelamento: txt(c.cancelamento),
    credenciais: txt(c.credenciais),
    fotos: txt(c.fotos),
    retornoDias:
      c.retornoDias === null || c.retornoDias === undefined || c.retornoDias === ""
        ? null
        : num(c.retornoDias, 0),
    faq: Array.isArray(c.faq)
      ? c.faq
          .map((f: any) => ({ pergunta: txt(f?.pergunta), resposta: txt(f?.resposta) }))
          .filter((f: { pergunta: string; resposta: string }) => f.pergunta && f.resposta)
      : [],
    listaDeInteresse: c.listaDeInteresse !== false,
  };
}

/** "2026-10-25" → "25/10". Sem `Date`: é calendário, não instante. */
function diaCurto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  return m ? `${m[3]}/${m[2]}` : String(iso ?? "");
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function diaDaSemana(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return "";
  // Meio-dia UTC: a data é de calendário e nenhum fuso a move de dia.
  return DIAS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)).getUTCDay()];
}

function reais(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Vagas que ainda sobram no dia. */
export function vagasRestantes(p: PraticaDaEdicao): number {
  return Math.max(0, Number(p.vagas) - Number(p.ocupadas));
}

/** O último dia de prática da edição, ou o fim do curso quando não há prática. */
function ultimoDia(e: EdicaoDoModulo): string | null {
  const datas = e.praticas
    .map((p) => p.data)
    .filter(Boolean)
    .sort();
  return datas.length ? datas[datas.length - 1] : e.fim;
}

/**
 * A edição que a Luna pode oferecer hoje: com inscrições abertas (ou esgotada,
 * para ela saber dizer que lotou) e com o último dia de prática ainda por vir.
 * Com mais de uma, a mais próxima.
 */
export function edicaoAberta(edicoes: EdicaoDoModulo[], hoje: string): EdicaoDoModulo | null {
  const vivas = edicoes
    .filter((e) => e.status === "inscricoes_abertas" || e.status === "esgotada")
    .filter((e) => {
      const fim = ultimoDia(e);
      return !!fim && fim >= hoje;
    })
    .sort((a, b) => String(ultimoDia(a)).localeCompare(String(ultimoDia(b))));
  return vivas[0] ?? null;
}

/** As práticas que ainda dá para oferecer: de hoje em diante e com vaga. */
export function praticasOferiveis(e: EdicaoDoModulo, hoje: string): PraticaDaEdicao[] {
  return [...e.praticas]
    .filter((p) => p.data >= hoje && vagasRestantes(p) > 0)
    .sort((a, b) => a.data.localeCompare(b.data));
}

export interface CatalogoDaEdicao {
  praticas: { codigo: string; pratica: PraticaDaEdicao }[];
  ofertas: { codigo: string; oferta: OfertaDaEdicao }[];
}

/** Os códigos desta conversa: `P1`, `P2` para os dias e `O1`, `O2` para as ofertas. */
export function catalogoDaEdicao(e: EdicaoDoModulo | null, hoje: string): CatalogoDaEdicao {
  if (!e) return { praticas: [], ofertas: [] };
  return {
    praticas: praticasOferiveis(e, hoje).map((pratica, i) => ({ codigo: `P${i + 1}`, pratica })),
    ofertas: e.ofertas.map((oferta, i) => ({ codigo: `O${i + 1}`, oferta })),
  };
}

export interface ReservaBruta {
  dia?: unknown;
  oferta?: unknown;
  nome?: unknown;
}

export interface ReservaPedida {
  pratica: PraticaDaEdicao;
  oferta: OfertaDaEdicao | null;
  nome: string;
}

/**
 * O que a Luna devolveu vira reserva AQUI, contra o catálogo desta
 * instrução. Dia fora da lista (ou que lotou entre a oferta e o aceite) não
 * reserva nada. Oferta é opcional: a pessoa pode reservar o dia e decidir o
 * procedimento na avaliação.
 */
export function reservaPedida(
  bruto: ReservaBruta,
  catalogo: CatalogoDaEdicao,
): ReservaPedida | null {
  const dia = String(bruto?.dia ?? "")
    .trim()
    .toUpperCase();
  if (!dia) return null;
  const p = catalogo.praticas.find((x) => x.codigo === dia);
  if (!p || vagasRestantes(p.pratica) <= 0) return null;
  const cod = String(bruto?.oferta ?? "")
    .trim()
    .toUpperCase();
  const o = cod ? catalogo.ofertas.find((x) => x.codigo === cod) : undefined;
  const nome = String(bruto?.nome ?? "")
    .trim()
    .slice(0, 120);
  return { pratica: p.pratica, oferta: o?.oferta ?? null, nome };
}

/** A proibição de sempre, para quem procura harmonização fora da vaga. */
export function secaoDeHarmonizacao(quem: string): string[] {
  return [
    "## Harmonização facial",
    "",
    "Para quem procura harmonização facial, preenchimento ou bioestimulador:",
    'você NUNCA dá valor por aqui, nem faixa, nem "a partir de", nem compara',
    "com outro procedimento. O valor depende do rosto da pessoa e sai da",
    `avaliação com ${quem}. Explique o procedimento se perguntarem, e`,
    "conduza para a avaliação.",
    "",
    "A exceção é a lista de preços acima: o que está nela, você pode informar",
    "do jeito que está escrito lá. O que não está nela, não.",
  ];
}

export interface EntradaDaSecao {
  edicao: EdicaoDoModulo | null;
  /** A próxima edição que ainda não abriu, para a Luna poder citar. */
  proxima?: EdicaoDoModulo | null;
  config: ConfigDoModulo;
  manual?: string | null;
  hoje: string;
  /** Quem avalia (a Dra.). */
  quem: string;
  catalogo: CatalogoDaEdicao;
}

/**
 * A seção inteira, para uma conversa de paciente modelo.
 *
 * Tudo o que está aqui veio do cadastro. O que não está cadastrado vira a
 * instrução de dizer que vai confirmar — nunca um palpite.
 */
export function secaoDoModuloPacienteModelo(x: EntradaDaSecao): string {
  const { edicao: e, config: c, hoje, quem, catalogo } = x;
  const partes = ["## Paciente modelo: esta conversa é da vaga da mentoria", ""];
  partes.push(
    "A pessoa chegou pela vaga de PACIENTE MODELO da mentoria de harmonização",
    `facial. Nela, os alunos aplicam e ${quem} supervisiona e faz a análise`,
    "facial junto com eles. Tudo abaixo vale só para esta conversa; os preços",
    "da lista da clínica, mais acima, NÃO valem aqui.",
    "",
  );

  const manual = String(x.manual ?? "").trim();
  if (manual) partes.push("### Como conduzir", "", manual, "");

  if (!e) {
    partes.push(
      "### Não há edição aberta agora",
      "",
      "NÃO cite valores de paciente modelo: eles valem só dentro de uma edição.",
    );
    if (x.proxima) {
      const q = x.proxima;
      partes.push(
        `A próxima edição cadastrada é "${q.nome}"` +
          (q.cidade ? `, em ${q.cidade}` : "") +
          (q.inicio ? `, de ${diaCurto(q.inicio)}${q.fim ? ` a ${diaCurto(q.fim)}` : ""}` : "") +
          ", ainda sem inscrições abertas.",
      );
    }
    if (c.listaDeInteresse) {
      partes.push(
        "",
        "Ofereça entrar na lista de interesse: quando a próxima edição abrir, a",
        "clínica avisa por aqui. Se a pessoa aceitar, preencha `entrarNaLista`",
        'com "sim".',
      );
    } else {
      partes.push("", "Diga que vai confirmar quando abre a próxima e encaminhe a dúvida.");
    }
    return partes.join("\n");
  }

  // ── A edição ──────────────────────────────────────────────────────────
  partes.push(`### A edição: ${e.nome}`, "");
  if (e.cidade) partes.push(`Cidade: ${e.cidade}.`);
  if (e.inicio && e.fim) {
    partes.push(
      `A mentoria (o curso) vai de ${diaCurto(e.inicio)} a ${diaCurto(e.fim)}. Isso NÃO é`,
      "o dia da pessoa: os dias de prática com pacientes estão listados abaixo,",
      "e são só esses que você oferece.",
    );
  }
  if (e.observacoes) partes.push("", e.observacoes.trim());
  partes.push("");

  partes.push("### Onde esta edição acontece", "");
  if (e.endereco) {
    partes.push(
      e.endereco.trim(),
      "",
      "Este é o único endereço que você dá numa conversa de paciente modelo. Os",
      "endereços da seção 'Onde a clínica fica' são das unidades de atendimento",
      "e NÃO valem aqui.",
    );
  } else {
    partes.push(
      "O endereço desta edição NÃO está cadastrado. Se perguntarem, diga que vai",
      "confirmar e encaminhe a dúvida. Não dê o endereço da clínica.",
    );
  }
  partes.push("");

  // ── Os dias de prática ────────────────────────────────────────────────
  partes.push("### Os dias de prática com pacientes (só estes)", "");
  if (e.status === "esgotada" || catalogo.praticas.length === 0) {
    partes.push(
      "Esta edição está LOTADA: não há mais vaga em dia nenhum. Diga isso com",
      "clareza, não ofereça dia, e",
      c.listaDeInteresse
        ? 'ofereça a lista de interesse da próxima (`entrarNaLista` = "sim" se aceitar).'
        : "diga que vai avisar quando abrir a próxima.",
    );
  } else {
    for (const { codigo, pratica } of catalogo.praticas) {
      const hora =
        pratica.horaInicio && pratica.horaFim
          ? `, das ${pratica.horaInicio.slice(0, 5)} às ${pratica.horaFim.slice(0, 5)}`
          : "";
      const sobra = vagasRestantes(pratica);
      partes.push(
        `- ${codigo}: ${diaDaSemana(pratica.data)}, ${diaCurto(pratica.data)}${hora} — ${sobra} vaga${sobra === 1 ? "" : "s"}` +
          (pratica.observacao ? ` (${pratica.observacao})` : ""),
      );
    }
    partes.push(
      "",
      "Ofereça pelo dia (sábado, domingo), nunca pelo código. O horário exato",
      "dentro do dia quem combina é a equipe depois da reserva. Dia que não está",
      "na lista não existe para você.",
    );
  }
  partes.push("");

  // ── As ofertas ────────────────────────────────────────────────────────
  partes.push("### Os procedimentos desta edição e os valores (só estes)", "");
  for (const { codigo, oferta: o } of catalogo.ofertas) {
    const ml = o.ml ? ` (${o.ml} ml)` : "";
    const parc =
      o.precoParcelado && o.parcelasMax
        ? ` ou ${reais(o.precoParcelado)} em até ${o.parcelasMax}x`
        : "";
    partes.push(
      `- ${codigo}: ${o.nome}${ml}: ${reais(o.precoVista)} à vista${parc}` +
        (o.destaque ? " — o mais escolhido" : "") +
        (o.descricao ? `. ${o.descricao.trim()}` : ""),
    );
  }
  partes.push(
    "",
    "Dê o valor do que a pessoa pediu, e só ele; a lista inteira só se ela",
    "pedir todos. Quantidade de ml: a que está na oferta; se a oferta não diz,",
    "diga que depende da avaliação e encaminhe a dúvida se insistirem.",
    `A indicação do que fazer é de ${quem}, na avaliação do dia.`,
    "",
  );

  // ── Reserva e sinal ───────────────────────────────────────────────────
  partes.push("### Como a reserva funciona", "");
  partes.push(
    `Para garantir a vaga, a pessoa paga um sinal de ${reais(c.sinal.valor)} por Pix` +
      (c.sinal.titular ? ` (titular: ${c.sinal.titular})` : "") +
      ".",
    c.sinal.abatido
      ? "O sinal É abatido do valor do procedimento no dia."
      : "O sinal NÃO é abatido: é à parte do valor do procedimento.",
    "O sinal existe porque quem reserva não pode faltar, senão os alunos ficam",
    "sem a prática.",
    `Prazo para mandar o sinal depois de escolher o dia: ${c.sinal.prazoHoras} horas; depois disso a vaga volta.`,
    "",
    "O procedimento é pago no dia: " +
      [
        c.pagamento.formas.includes("pix") ? "Pix" : "",
        c.pagamento.formas.includes("cartao") || c.pagamento.formas.includes("cartao_parcelado")
          ? `cartão (parcelado em até ${c.pagamento.parcelasMax}x)`
          : "",
        c.pagamento.formas.includes("dinheiro") ? "dinheiro" : "",
      ]
        .filter(Boolean)
        .join(", ") +
      (c.pagamento.boleto ? ", ou boleto." : ". Não tem boleto."),
  );
  if (c.cancelamento) partes.push("", `Cancelamento e falta: ${c.cancelamento}`);
  if (c.retornoDias) partes.push("", `Há retorno ${c.retornoDias} dias depois do procedimento.`);
  partes.push(
    "",
    "**Quando a pessoa disser que quer reservar**, faça nesta ordem, em",
    "mensagens separadas se precisar: confirme o dia (dos listados acima),",
    "pergunte o nome completo, e só então preencha `reservaDia` com o código do",
    "dia, `reservaOferta` com o código da oferta (vazio se ela ainda não",
    "escolheu) e `reservaNome` com o nome completo. Na mesma resposta, diga",
    "que a vaga fica guardada assim que o sinal chegar" +
      (c.sinal.chavePix
        ? ` e passe a chave Pix: ${c.sinal.chavePix}.`
        : ", e que a equipe manda a chave Pix por aqui."),
    "Peça o comprovante por aqui. Quem confirma o pagamento é a equipe.",
    "",
    "Não preencha a reserva antes de ter o dia e o nome. Não preencha o campo",
    "de horário da agenda (`horarioFechado`) numa conversa de paciente modelo:",
    "a vaga da mentoria não é um horário da agenda.",
    "",
  );

  // ── Credenciais, fotos, FAQ ───────────────────────────────────────────
  partes.push("### Perguntas que já têm resposta", "");
  partes.push(
    `- Quem é ${quem}? ` +
      (c.credenciais
        ? c.credenciais
        : "A especialização formal NÃO está cadastrada: diga que vai confirmar e encaminhe a dúvida. Não invente registro nem especialidade."),
  );
  partes.push(
    "- Fotos: " +
      (c.fotos ||
        "a regra de fotos não está cadastrada; diga que vai confirmar e encaminhe a dúvida."),
  );
  partes.push(
    "- Quem aplica? Os alunos da mentoria, com supervisão de " +
      quem +
      ", que faz a análise facial junto com eles e define o que faz sentido para cada rosto.",
  );
  for (const f of c.faq) partes.push(`- ${f.pergunta} ${f.resposta}`);
  partes.push("");

  partes.push(
    "Se a pessoa não puder em nenhum dos dias, diga que haverá outras edições e",
    c.listaDeInteresse
      ? 'ofereça a lista de interesse (`entrarNaLista` = "sim" se aceitar).'
      : "que a clínica avisa quando abrir.",
    "Quem prefere fazer fora da mentoria faz particular, com outro valor: aí",
    "vale a regra de harmonização da clínica (sem preço por aqui, avaliação).",
  );

  return partes.join("\n");
}
