// Onde existe vaga livre na agenda.
//
// ── Por que existe ──────────────────────────────────────────────────────
//
// O manual da Luna chama a regra dos dois horários de "uma das regras
// comerciais mais importantes", e proíbe inventar disponibilidade. As duas
// coisas juntas só são possíveis se alguém calcular vaga de verdade — e nada no
// sistema fazia isso. O que existia era detecção de colisão REATIVA (avisar
// depois de alguém já ter escolhido um horário), em três pontos, e nenhum deles
// impedia nada.
//
// ── Puro, e por isso conferível ─────────────────────────────────────────
//
// Nenhuma consulta ao banco aqui dentro. Quem chama traz jornada, ocupação e
// salas; esta função só recorta. É o que permite exercitar os casos que doem —
// almoço no meio da tarde, dia fechado, vaga que não cabe — sem banco e sem
// enviar nada a ninguém.
//
// ── Por que as primitivas de hora estão copiadas ────────────────────────
//
// `timeToMinutes`, `minutesToTime` e `overlaps` são gêmeas de
// `src/lib/date.ts`. Aquele arquivo roda no navegador e no Worker; este roda no
// Deno, e não há import entre os dois mundos. A duplicação é a mesma que o
// projeto já carrega em `instrucao-do-agente.ts` / `manual.ts`, e pelo mesmo
// motivo. Mudar uma exige mudar a outra: o fim EXCLUSIVO é a regra que não pode
// divergir — 09:00–10:00 e 10:00–11:00 não colidem, e é dela que sai a vaga das
// 10:00.

/** "09:00" → 540. Aceita "09:00:00" do Postgres. */
export function emMinutos(hora: string): number {
  const [h, m] = String(hora ?? "")
    .split(":")
    .map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 540 → "09:00". Passa da meia-noite? Prende em 23:59. */
export function emHora(total: number): string {
  const preso = Math.max(0, Math.min(total, 23 * 60 + 59));
  return `${String(Math.floor(preso / 60)).padStart(2, "0")}:${String(preso % 60).padStart(2, "0")}`;
}

/** Duas faixas do mesmo dia se sobrepõem? Fim exclusivo. */
export function colide(aIni: string, aFim: string, bIni: string, bFim: string): boolean {
  return emMinutos(aIni) < emMinutos(bFim) && emMinutos(bIni) < emMinutos(aFim);
}

export type ModoDoDia = "aberto" | "fechado" | "sob_consulta";

export interface Jornada {
  unidadeId: string;
  /** 0 = domingo, 6 = sábado. */
  weekday: number;
  modo: ModoDoDia;
  abre: string | null;
  fecha: string | null;
}

/** Uma cadeira. A unidade vem dela, e é por isso que o horário sabe a cidade. */
export interface Sala {
  id: string;
  nome: string;
  unidadeId: string;
  unidadeNome: string;
}

/** Um pedaço de tempo já tomado: consulta ou bloqueio (almoço, compromisso). */
export interface Ocupado {
  /** "YYYY-MM-DD" */
  date: string;
  inicio: string;
  fim: string;
  /** Nulo quando o bloqueio vale para a unidade inteira, não para uma cadeira. */
  salaId: string | null;
  unidadeId: string | null;
}

export interface Vaga {
  /** "YYYY-MM-DD" */
  date: string;
  hora: string;
  salaId: string;
  salaNome: string;
  unidadeId: string;
  unidadeNome: string;
}

export interface PedidoDeVagas {
  jornadas: Jornada[];
  salas: Sala[];
  ocupados: Ocupado[];
  /** Quanto dura o que vai ser marcado. */
  duracaoMin: number;
  /** Primeiro dia a considerar, "YYYY-MM-DD" — normalmente hoje. */
  de: string;
  /** Quantos dias olhar para frente, contando `de`. */
  dias: number;
  /** De quanto em quanto tempo uma vaga pode começar. */
  passoMin: number;
  /** Teto de vagas devolvidas. */
  maximo: number;
  /**
   * Hora mínima no primeiro dia, "HH:MM".
   *
   * Sem isto, às 15h a Luna ofereceria as 08:00 de hoje — um horário que já
   * passou. É o erro mais fácil de cometer aqui e o mais óbvio para quem recebe.
   */
  agoraNoPrimeiroDia?: string;
  /**
   * Antecedência mínima, em minutos, a partir de `agoraNoPrimeiroDia`.
   *
   * "Tenho às 15h" mandado às 14h57 não é oferta, é armadilha.
   */
  antecedenciaMin?: number;
  /**
   * As datas em que uma unidade de VIAGEM atende: unidade → datas
   * ("YYYY-MM-DD").
   *
   * Unidade ausente deste mapa atende pela jornada da semana, como sempre —
   * é o caso da unidade principal. Unidade presente só atende nas datas que
   * vierem aqui, e fora delas não tem vaga nenhuma, mesmo que
   * `clinic_business_hours` diga "aberto".
   *
   * ── Por que isto não é um bloqueio ────────────────────────────────────
   *
   * A agenda de Porto Alegre está cadastrada aberta de segunda a sábado, com
   * duas cadeiras, e a Dra. Mariane vai para lá de tempo em tempo. Cadastrar
   * a ausência como bloqueio exigiria uma linha por dia em que ela NÃO está —
   * centenas, para sempre, e um esquecimento vira uma consulta marcada numa
   * cidade onde não há ninguém. O avesso é uma linha por viagem.
   */
  diasDaUnidade?: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface ResultadoDeVagas {
  vagas: Vaga[];
  /** Dias no intervalo que são "sob consulta" — a Luna não oferece, mas também
   *  não nega: ela encaminha. Sem esta lista, domingo viraria "não atendemos". */
  diasSobConsulta: string[];
}

/** Soma dias a uma data "YYYY-MM-DD" sem passar por fuso. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  // `Date.UTC` e leitura em UTC: a data aqui é um rótulo de calendário, não um
  // instante. Construir no fuso local e ler no local funcionaria também, mas já
  // custou caro neste projeto em outro lugar — em UTC não há horário de verão
  // para atravessar.
  const t = new Date(Date.UTC(a, (m || 1) - 1, d || 1));
  t.setUTCDate(t.getUTCDate() + dias);
  return t.toISOString().slice(0, 10);
}

/** O dia da semana de uma data "YYYY-MM-DD". 0 = domingo. */
export function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, (m || 1) - 1, d || 1)).getUTCDay();
}

/**
 * As vagas livres, em ordem cronológica.
 *
 * Uma vaga por (dia, hora, sala): duas cadeiras livres às 14h são duas vagas,
 * porque é assim que a clínica atende duas pessoas ao mesmo tempo. Quem oferece
 * escolhe duas da lista; quem grava usa a sala que veio junto.
 */
export function vagasLivres(p: PedidoDeVagas): ResultadoDeVagas {
  const vagas: Vaga[] = [];
  const diasSobConsulta: string[] = [];
  const duracao = Math.max(1, Math.floor(p.duracaoMin));
  const passo = Math.max(5, Math.floor(p.passoMin));

  // Jornada indexada por unidade+dia. Dia sem linha é fechado: "ninguém
  // configurou" e "está fechado" produzem a mesma agenda vazia, e tratar
  // ausência como aberto encheria a conversa de horário que não existe.
  const porUnidadeEDia = new Map<string, Jornada>();
  for (const j of p.jornadas) porUnidadeEDia.set(`${j.unidadeId}|${j.weekday}`, j);

  const minimo =
    p.agoraNoPrimeiroDia != null
      ? emMinutos(p.agoraNoPrimeiroDia) + Math.max(0, p.antecedenciaMin ?? 0)
      : null;

  for (let i = 0; i < Math.max(1, p.dias) && vagas.length < p.maximo; i++) {
    const date = somarDias(p.de, i);
    const wd = diaDaSemana(date);

    // Ocupação do dia, separada uma vez por dia em vez de a cada vaga: são até
    // 2000 agendamentos na memória e o laço de dentro roda dezenas de vezes.
    const ocupadosDoDia = p.ocupados.filter((o) => o.date === date);

    let algumaUnidadeSobConsulta = false;

    for (const sala of p.salas) {
      // Unidade de viagem fora de um dia de viagem: nem vaga, nem "sob
      // consulta". A conta vem ANTES da jornada da semana de propósito — um
      // domingo em Porto Alegre num dia em que ninguém está lá não é "confirmar
      // com a Dra.", é um dia em que aquela unidade não existe.
      const datasDaUnidade = p.diasDaUnidade?.get(sala.unidadeId);
      if (datasDaUnidade && !datasDaUnidade.has(date)) continue;

      const j = porUnidadeEDia.get(`${sala.unidadeId}|${wd}`);
      if (!j || j.modo === "fechado") continue;
      if (j.modo === "sob_consulta") {
        algumaUnidadeSobConsulta = true;
        continue;
      }
      if (!j.abre || !j.fecha) continue;

      const abre = emMinutos(j.abre);
      const fecha = emMinutos(j.fecha);

      for (let t = abre; t + duracao <= fecha && vagas.length < p.maximo; t += passo) {
        if (minimo !== null && i === 0 && t < minimo) continue;

        const inicio = emHora(t);
        const fim = emHora(t + duracao);

        // Um bloqueio sem sala trava a unidade inteira — é como o almoço e a
        // viagem são cadastrados. Com sala, trava só aquela cadeira.
        const tomado = ocupadosDoDia.some((o) => {
          const mesmaSala = o.salaId != null && o.salaId === sala.id;
          const unidadeInteira =
            o.salaId == null && (o.unidadeId == null || o.unidadeId === sala.unidadeId);
          if (!mesmaSala && !unidadeInteira) return false;
          return colide(inicio, fim, o.inicio, o.fim);
        });
        if (tomado) continue;

        vagas.push({
          date,
          hora: inicio,
          salaId: sala.id,
          salaNome: sala.nome,
          unidadeId: sala.unidadeId,
          unidadeNome: sala.unidadeNome,
        });
      }
    }

    if (algumaUnidadeSobConsulta) diasSobConsulta.push(date);
  }

  return { vagas, diasSobConsulta };
}

// ── Quais vagas oferecer ────────────────────────────────────────────────
//
// O cálculo acima acha TUDO: com 4 cadeiras e a agenda vazia, mais de 500 vagas
// em quinze dias. Isso não vai para a instrução do modelo, e não por economia:
// uma lista de 500 horários é maior que o manual inteiro, e o manual pede DUAS
// opções.
//
// ── O erro que isto existe para impedir ─────────────────────────────────
//
// As quatro primeiras vagas cronológicas são a MESMA hora em quatro cadeiras
// diferentes. Pegar "as duas primeiras" ofereceria "15h ou 15h" — que não é
// escolha, é um bug que parece descuido de quem escreveu a mensagem.
//
// Então a escolha é por MOMENTO (dia + hora), não por vaga. A cadeira vai junto
// para quem grava, mas duas cadeiras na mesma hora contam como uma opção.
//
// ── As faixas de preferência ────────────────────────────────────────────
//
// Regra da clínica, 28/09: o melhor é nas próximas 3 horas; não havendo, nos
// dois dias seguintes; depois dentro de sete dias; por último, quinze.
//
// A faixa mais próxima ganha, e só se ela não tiver o suficiente a seguinte
// entra — oferecer uma opção de hoje e uma de duas semanas na mesma mensagem
// faria a de hoje parecer a única de verdade.

export interface Faixa {
  rotulo: string;
  ateMinutos: number;
}

/** Da mais desejada para a menos. Ver o comentário acima. */
export const FAIXAS: readonly Faixa[] = [
  { rotulo: "nas próximas 3 horas", ateMinutos: 3 * 60 },
  { rotulo: "nos próximos 2 dias", ateMinutos: 2 * 24 * 60 },
  { rotulo: "nos próximos 7 dias", ateMinutos: 7 * 24 * 60 },
  { rotulo: "nos próximos 15 dias", ateMinutos: 15 * 24 * 60 },
];

/** Dias de calendário entre duas datas "YYYY-MM-DD". */
export function diasEntre(de: string, ate: string): number {
  const n = (iso: string) => {
    const [a, m, d] = iso.split("-").map(Number);
    return Date.UTC(a, (m || 1) - 1, d || 1);
  };
  return Math.round((n(ate) - n(de)) / 86_400_000);
}

export interface Momento {
  date: string;
  hora: string;
  /** Quantos minutos daqui. Usado para ordenar e para achar a faixa. */
  emMinutosDaqui: number;
  /**
   * A unidade DESTE momento.
   *
   * Um momento é (dia, hora, UNIDADE), e a unidade entrou na chave em 16/10.
   * Antes era só (dia, hora): as cadeiras das duas cidades caíam no mesmo
   * momento e quem gravava ficava com `vagas[0]` — a primeira que o banco
   * devolveu. Com duas unidades ativas, metade das vezes era a outra.
   *
   * O estrago não é só de gravação. Em 15/10, 01:48, numa conversa sobre uma
   * mentoria em Porto Alegre, a Luna respondeu o endereço de Florianópolis
   * quando perguntaram onde ficava, e a Dra. Mariane teve de entrar e colar o
   * endereço certo à mão.
   */
  unidadeId: string;
  unidadeNome: string;
  /** Uma opção por momento; as cadeiras livres nessa hora vêm todas, e quem
   *  grava escolhe a primeira. Sem isto, o agendamento não saberia a sala.
   *  Depois de 16/10 todas são da MESMA unidade, então "a primeira" deixou de
   *  ser uma escolha de cidade. */
  vagas: Vaga[];
}

/** Manhã, tarde ou noite. É por período que uma pessoa pensa a própria agenda —
 *  ninguém responde "prefiro às 14h30", responde "prefiro à tarde". */
export function periodoDoDia(hora: string): "manhã" | "tarde" | "noite" {
  const m = emMinutos(hora);
  if (m < 12 * 60) return "manhã";
  if (m < 17 * 60) return "tarde";
  return "noite";
}

/**
 * Escolhe espalhando por dia e período, começando pelo mais próximo.
 *
 * ── O defeito que isto conserta ──────────────────────────────────────────
 *
 * Pegar "os N primeiros" cronologicamente devolvia 08:00, 08:30, 09:00, 09:30…
 * da mesma manhã. Duas consequências, as duas vistas rodando com a agenda real:
 *
 * "Tenho segunda às 08:00 ou segunda às 08:30" não é uma escolha — são trinta
 * minutos de diferença, e quem não pode às oito também não pode às oito e meia.
 *
 * E a reserva (o que responde "nenhum desses serve, prefiro à tarde") ficava
 * inteira na manhã de segunda. Não havia o que responder.
 *
 * Então a primeira passada pega UM por (dia, período), em ordem cronológica: o
 * mais próximo continua sendo o primeiro — a preferência da clínica —, mas o
 * segundo já é uma alternativa de verdade. A segunda passada completa com os
 * mais próximos que sobraram, para nunca devolver menos do que havia.
 */
export function espalharMomentos(
  momentos: readonly Momento[],
  quantos: number,
  /**
   * Períodos a evitar na primeira passada, no formato
   * `YYYY-MM-DD|manhã|<unidadeId>`.
   *
   * É o que faz a reserva não começar meia hora depois do que a pessoa acabou de
   * recusar: quem disse não para segunda às 08:00 não quer segunda às 08:30.
   */
  evitar: ReadonlySet<string> = new Set(),
): Momento[] {
  const escolhidos: Momento[] = [];
  const vistos = new Set<string>(evitar);
  const usados = new Set<Momento>();

  for (const m of momentos) {
    if (escolhidos.length >= quantos) break;
    // A unidade entra na chave desde 16/10: sem ela, oferecer a tarde de quinta
    // em Florianópolis apagaria da reserva a tarde de quinta em Porto Alegre —
    // que é exatamente o horário certo para quem está na outra cidade.
    const chave = `${m.date}|${periodoDoDia(m.hora)}|${m.unidadeId}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    escolhidos.push(m);
    usados.add(m);
  }

  for (const m of momentos) {
    if (escolhidos.length >= quantos) break;
    if (usados.has(m)) continue;
    escolhidos.push(m);
  }

  // Cronológica no fim: a segunda passada pode ter inserido algo anterior ao que
  // a primeira já tinha pego, e uma lista fora de ordem faria o agente oferecer
  // quinta antes de segunda.
  return escolhidos.sort((a, b) => a.emMinutosDaqui - b.emMinutosDaqui);
}

/**
 * Os momentos a oferecer, da faixa mais próxima que tiver o suficiente.
 *
 * Devolve mais que `quantas` de propósito — `paraOferecer` é o que a Luna deve
 * propor agora, e `reserva` é para quando a pessoa disser "nenhum desses" e
 * informar um período. Sem a reserva, responder a isso exigiria uma segunda ida
 * ao banco no meio da conversa; com ela, a resposta já está na mesa.
 */
export function escolherMomentos(
  vagas: readonly Vaga[],
  agora: { date: string; hora: string },
  quantas = 2,
  naReserva = 10,
  /**
   * A unidade da cidade que a pessoa confirmou, quando ela já confirmou.
   *
   * Com ela, a oferta sai DESTA unidade e de nenhuma outra — mesmo que isso
   * deixe a oferta vazia. Vazia é a resposta certa: quem está em Porto Alegre
   * e não tem vaga em Porto Alegre precisa ouvir que a equipe confirma as
   * próximas datas de lá, não receber um horário em Florianópolis porque a
   * agenda de Florianópolis tinha vaga.
   *
   * Nula (a maioria das conversas, e toda a prévia da tela) mantém a escolha
   * de sempre: a faixa mais próxima em que uma unidade sozinha tem o
   * suficiente.
   */
  unidadePreferida: string | null = null,
): { paraOferecer: Momento[]; reserva: Momento[]; faixa: string | null } {
  const porMomento = new Map<string, Momento>();
  for (const v of vagas) {
    // A unidade entra na chave: ver o comentário em `Momento`. Sem ela, duas
    // cidades no mesmo horário viram um momento só.
    const chave = `${v.date}T${v.hora}@${v.unidadeId}`;
    const existente = porMomento.get(chave);
    if (existente) {
      existente.vagas.push(v);
      continue;
    }
    porMomento.set(chave, {
      date: v.date,
      hora: v.hora,
      unidadeId: v.unidadeId,
      unidadeNome: v.unidadeNome,
      emMinutosDaqui:
        diasEntre(agora.date, v.date) * 24 * 60 + (emMinutos(v.hora) - emMinutos(agora.hora)),
      vagas: [v],
    });
  }

  const momentos = [...porMomento.values()]
    // Nada no passado chega aqui em condições normais, mas a guarda é barata e
    // o custo de errar é oferecer um horário que já passou.
    .filter((m) => m.emMinutosDaqui >= 0)
    .sort((a, b) => a.emMinutosDaqui - b.emMinutosDaqui);

  // Confirmada a cidade, só ela concorre à oferta. A lista completa continua
  // viva em `momentos` — é dela que sai a reserva, e é a reserva que responde
  // "na verdade eu estou na outra cidade".
  const candidatos = unidadePreferida
    ? momentos.filter((m) => m.unidadeId === unidadePreferida)
    : momentos;

  // ── A faixa, e a unidade ────────────────────────────────────────────────
  //
  // A primeira faixa em que UMA unidade sozinha tem `quantas` opções. A
  // contagem é por unidade, e não no total, porque é isso que a clínica pediu:
  // "não misturar horários de cidades diferentes como opções equivalentes".
  // Contando no total, uma faixa com uma vaga em Florianópolis e uma em Porto
  // Alegre passaria, e as duas opções oferecidas seriam de cidades diferentes.
  //
  // Havendo mais de uma unidade qualificada na mesma faixa, vale a que tem o
  // horário MAIS PRÓXIMO — a mesma preferência que o resto da função já usa.
  //
  // Não havendo nenhuma em faixa nenhuma, vale a última faixa e a unidade do
  // horário mais próximo que existir: oferecer uma opção distante é melhor que
  // nenhuma, e era o que a versão anterior já fazia.
  //
  // Com a cidade confirmada, `candidatos` já é de uma unidade só e esta busca
  // só decide a FAIXA. Sem nenhum momento naquela unidade, nenhuma faixa bate
  // a conta e a oferta sai vazia — de propósito.
  let faixa: Faixa | null = null;
  let unidadeEscolhida: string | null = null;
  for (const f of FAIXAS) {
    const naFaixa = candidatos.filter((m) => m.emMinutosDaqui <= f.ateMinutos);
    // `momentos` já está em ordem cronológica, então a primeira unidade a bater
    // a conta é a que tem o horário mais próximo entre as qualificadas.
    const porUnidade = new Map<string, number>();
    let achou: string | null = null;
    for (const m of naFaixa) {
      const quantos = (porUnidade.get(m.unidadeId) ?? 0) + 1;
      porUnidade.set(m.unidadeId, quantos);
      if (quantos >= quantas) {
        achou = m.unidadeId;
        break;
      }
    }
    if (achou) {
      faixa = f;
      unidadeEscolhida = achou;
      break;
    }
  }
  const limite = faixa?.ateMinutos ?? FAIXAS[FAIXAS.length - 1].ateMinutos;
  const dentro = candidatos.filter((m) => m.emMinutosDaqui <= limite);
  const unidade = unidadePreferida ?? unidadeEscolhida ?? dentro[0]?.unidadeId ?? null;

  // Os dois para oferecer saem de UMA unidade só. É a trava: daqui não sai um
  // par de horários em cidades diferentes, nem com a agenda vazia de um lado.
  const paraOferecer = espalharMomentos(
    unidade ? dentro.filter((m) => m.unidadeId === unidade) : dentro,
    quantas,
  );

  // A reserva sai do intervalo INTEIRO, não só da faixa escolhida: ela existe
  // para responder "prefiro à tarde", e a tarde pode não estar na faixa de três
  // horas. Espalhada pelo mesmo critério, ela cobre manhã, tarde e noite de
  // vários dias em vez de dez meia-horas seguidas.
  //
  // E ela PODE ter outras unidades, de propósito: é o que responde "eu sou de
  // Porto Alegre". Cada linha da instrução diz a unidade do horário, então aqui
  // elas não são equivalentes — são alternativas identificadas. O que não pode
  // é a OFERTA misturar, e isso o filtro acima resolveu.
  //
  // Ordem: primeiro a unidade oferecida, depois as outras. Quem disse "nenhum
  // desses, prefiro à tarde" quer a tarde na mesma cidade.
  const jaOferecidos = new Set(paraOferecer);
  const restantes = momentos
    .filter((m) => !jaOferecidos.has(m))
    .sort((a, b) => {
      const pesoA = a.unidadeId === unidade ? 0 : 1;
      const pesoB = b.unidadeId === unidade ? 0 : 1;
      return pesoA - pesoB || a.emMinutosDaqui - b.emMinutosDaqui;
    });
  // A unidade entra na chave do período evitado: a tarde de quinta em Porto
  // Alegre é uma alternativa de verdade para quem recusou a tarde de quinta em
  // Florianópolis, e bloqueá-la esconderia justamente a resposta certa para
  // quem está na outra cidade.
  const periodosOferecidos = new Set(
    paraOferecer.map((m) => `${m.date}|${periodoDoDia(m.hora)}|${m.unidadeId}`),
  );

  return {
    paraOferecer,
    reserva: espalharMomentos(restantes, naReserva, periodosOferecidos),
    faixa: dentro.length ? (faixa?.rotulo ?? FAIXAS[FAIXAS.length - 1].rotulo) : null,
  };
}
