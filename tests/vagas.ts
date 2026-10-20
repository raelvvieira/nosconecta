// Checagens do cálculo de vaga livre.
//
// O que está em jogo: é daqui que sai "tenho terça às 14h ou quinta às 10h".
// Uma vaga errada não dá erro em tela nenhuma — dá uma pessoa chegando na
// clínica num horário que não existe, ou a Luna oferecendo domingo de manhã.
//
// Os modos de errar, todos silenciosos:
//
//   **Oferecer o que já passou.** Às 15h, oferecer as 08:00 de hoje.
//
//   **Tratar "não configurado" como aberto.** Dia sem linha de jornada tem de
//   ser fechado. O contrário enche a conversa de horário inventado.
//
//   **Confundir fechado com sob consulta.** Domingo na NÓS não é fechado: é
//   "confirmo com a Dra.". Se virar fechado, a Luna diz "não atendemos domingo"
//   e o lead vai embora.
//
//   **Errar o fim exclusivo.** Depois de 09:00–10:00, as 10:00 estão LIVRES. Se
//   colidissem, metade da agenda desapareceria.
//
//   **Deixar a vaga passar do fechamento.** Uma avaliação de 60 min às 13:30 num
//   sábado que fecha 14:00 não cabe.
import {
  FAIXAS,
  colide,
  espalharMomentos,
  periodoDoDia,
  diaDaSemana,
  diasEntre,
  emHora,
  emMinutos,
  escolherMomentos,
  somarDias,
  vagasLivres,
  type Jornada,
  type Ocupado,
  type Sala,
  type Vaga,
} from "../supabase/functions/_shared/vagas.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── As primitivas de hora ───────────────────────────────────────────────
conferir("hora do Postgres com segundos", emMinutos("09:00:00"), 540);
conferir("volta para texto", emHora(540), "09:00");
conferir("meia-noite não vira 24", emHora(24 * 60 + 30).slice(0, 2), "23");
// A regra que não pode divergir da gêmea em src/lib/date.ts.
conferir(
  "fim exclusivo: encostadas não colidem",
  colide("09:00", "10:00", "10:00", "11:00"),
  false,
);
conferir("sobreposição de verdade colide", colide("09:00", "10:00", "09:30", "10:30"), true);
conferir("uma dentro da outra colide", colide("09:00", "12:00", "10:00", "11:00"), true);

// ── Datas sem fuso ──────────────────────────────────────────────────────
conferir("soma dias", somarDias("2026-09-28", 3), "2026-10-01");
conferir("vira o mês", somarDias("2026-09-30", 1), "2026-10-01");
conferir("vira o ano", somarDias("2026-12-31", 1), "2027-01-01");
// 28/09/2026 é uma segunda-feira.
conferir("segunda é 1", diaDaSemana("2026-09-28"), 1);
conferir("domingo é 0", diaDaSemana("2026-09-27"), 0);
conferir("sábado é 6", diaDaSemana("2026-10-03"), 6);

// ── O cenário real da NÓS ───────────────────────────────────────────────
// Segunda a sexta 08:00–19:00, sábado 08:00–14:00, domingo sob consulta.
const UNIDADE = "u-floripa";
const jornadaDaNos: Jornada[] = [
  { unidadeId: UNIDADE, weekday: 0, modo: "sob_consulta", abre: null, fecha: null },
  ...[1, 2, 3, 4, 5].map((weekday) => ({
    unidadeId: UNIDADE,
    weekday,
    modo: "aberto" as const,
    abre: "08:00",
    fecha: "19:00",
  })),
  { unidadeId: UNIDADE, weekday: 6, modo: "aberto", abre: "08:00", fecha: "14:00" },
];
const umaSala: Sala[] = [
  { id: "s1", nome: "Cadeira 1", unidadeId: UNIDADE, unidadeNome: "NÓS Florianópolis" },
];
const base = {
  jornadas: jornadaDaNos,
  salas: umaSala,
  ocupados: [] as Ocupado[],
  duracaoMin: 60,
  de: "2026-09-28", // segunda
  dias: 1,
  passoMin: 60,
  maximo: 50,
};

// Segunda 08:00–19:00, de hora em hora, 60 min: 08:00 até 18:00 = 11 vagas.
{
  const r = vagasLivres(base);
  conferir("segunda rende 11 vagas de uma hora", r.vagas.length, 11);
  conferir("a primeira é às 08:00", r.vagas[0].hora, "08:00");
  conferir("a última cabe antes de fechar", r.vagas[r.vagas.length - 1].hora, "18:00");
  conferir("e carrega a unidade", r.vagas[0].unidadeNome, "NÓS Florianópolis");
}

// Sábado fecha às 14:00: 08:00 até 13:00 = 6 vagas. A de 13:30 não cabe.
{
  const r = vagasLivres({ ...base, de: "2026-10-03", passoMin: 30 });
  conferir("sábado para de oferecer às 13:00", r.vagas[r.vagas.length - 1].hora, "13:00");
  conferir(
    "nenhuma vaga passa das 14:00",
    r.vagas.every((v) => emMinutos(v.hora) + 60 <= 14 * 60),
    true,
  );
}

// Domingo: nenhuma vaga, MAS registrado como sob consulta.
{
  const r = vagasLivres({ ...base, de: "2026-09-27" });
  conferir("domingo não tem vaga", r.vagas.length, 0);
  conferir("domingo é sob consulta, não fechado", r.diasSobConsulta, ["2026-09-27"]);
}

// Dia sem linha de jornada é FECHADO, nunca aberto.
{
  const r = vagasLivres({ ...base, jornadas: [] });
  conferir("sem jornada configurada, nenhuma vaga", r.vagas.length, 0);
  conferir("e não é sob consulta", r.diasSobConsulta, []);
}
{
  const soTerca: Jornada[] = [
    { unidadeId: UNIDADE, weekday: 2, modo: "aberto", abre: "08:00", fecha: "19:00" },
  ];
  const r = vagasLivres({ ...base, jornadas: soTerca, dias: 2 });
  conferir(
    "só a terça configurada rende vagas só na terça",
    new Set(r.vagas.map((v) => v.date)),
    new Set(["2026-09-29"]),
  );
}

// ── A ocupação ──────────────────────────────────────────────────────────
// Consulta de 09:00 às 10:00 tira a vaga das 09:00 e DEIXA a das 10:00.
{
  const r = vagasLivres({
    ...base,
    ocupados: [
      { date: "2026-09-28", inicio: "09:00", fim: "10:00", salaId: "s1", unidadeId: UNIDADE },
    ],
  });
  const horas = r.vagas.map((v) => v.hora);
  conferir("a hora ocupada sai", horas.includes("09:00"), false);
  conferir("a hora encostada fica", horas.includes("10:00"), true);
  conferir("sobram 10", r.vagas.length, 10);
}

// Almoço 12:00–13:00 sem sala trava a unidade inteira.
{
  const r = vagasLivres({
    ...base,
    ocupados: [
      { date: "2026-09-28", inicio: "12:00", fim: "13:00", salaId: null, unidadeId: UNIDADE },
    ],
  });
  conferir("o almoço tira o meio-dia", r.vagas.map((v) => v.hora).includes("12:00"), false);
  conferir("e devolve as 13:00", r.vagas.map((v) => v.hora).includes("13:00"), true);
}

// Ocupação de OUTRA sala não tira a vaga desta.
{
  const duas: Sala[] = [
    ...umaSala,
    { id: "s2", nome: "Cadeira 2", unidadeId: UNIDADE, unidadeNome: "NÓS Florianópolis" },
  ];
  const r = vagasLivres({
    ...base,
    salas: duas,
    ocupados: [
      { date: "2026-09-28", inicio: "09:00", fim: "10:00", salaId: "s1", unidadeId: UNIDADE },
    ],
  });
  const noveHoras = r.vagas.filter((v) => v.hora === "09:00");
  conferir("às 09:00 sobra a outra cadeira", noveHoras.length, 1);
  conferir("e é a cadeira 2", noveHoras[0].salaId, "s2");
}

// Duas unidades não se misturam: o bloqueio de uma não afeta a outra.
{
  const OUTRA = "u-poa";
  const salasDasDuas: Sala[] = [
    ...umaSala,
    { id: "s9", nome: "Cadeira 1", unidadeId: OUTRA, unidadeNome: "NÓS Porto Alegre" },
  ];
  const jornadaDasDuas: Jornada[] = [
    ...jornadaDaNos,
    { unidadeId: OUTRA, weekday: 1, modo: "aberto", abre: "08:00", fecha: "19:00" },
  ];
  const r = vagasLivres({
    ...base,
    salas: salasDasDuas,
    jornadas: jornadaDasDuas,
    ocupados: [
      { date: "2026-09-28", inicio: "09:00", fim: "10:00", salaId: null, unidadeId: UNIDADE },
    ],
  });
  const noveHoras = r.vagas.filter((v) => v.hora === "09:00");
  conferir("o bloqueio de Floripa não fecha Porto Alegre", noveHoras.length, 1);
  conferir("e a vaga que sobra é de Porto Alegre", noveHoras[0].unidadeNome, "NÓS Porto Alegre");
}

// ── O que já passou ─────────────────────────────────────────────────────
{
  const r = vagasLivres({ ...base, agoraNoPrimeiroDia: "15:00", antecedenciaMin: 0 });
  conferir("às 15h não oferece a manhã", r.vagas[0].hora, "15:00");
  conferir("e sobram 4", r.vagas.length, 4);
}
// Antecedência: às 14:57, as 15:00 não valem.
{
  const r = vagasLivres({ ...base, agoraNoPrimeiroDia: "14:57", antecedenciaMin: 60 });
  conferir("com 1h de antecedência, a primeira é 16:00", r.vagas[0].hora, "16:00");
}
// O corte vale SÓ no primeiro dia — amanhã a manhã volta.
{
  const r = vagasLivres({ ...base, dias: 2, agoraNoPrimeiroDia: "15:00" });
  const deAmanha = r.vagas.filter((v) => v.date === "2026-09-29");
  conferir("amanhã oferece de manhã de novo", deAmanha[0].hora, "08:00");
}

// ── O teto ──────────────────────────────────────────────────────────────
conferir("o máximo é respeitado", vagasLivres({ ...base, dias: 5, maximo: 3 }).vagas.length, 3);
// Duração que não cabe em dia nenhum.
conferir(
  "procedimento de 12 horas não acha vaga",
  vagasLivres({ ...base, duracaoMin: 720 }).vagas.length,
  0,
);
// Passo de 30 min: de 08:00 a 18:00, de meia em meia hora, são 21 — e não 22.
// A última cabe às 18:00 porque 18:00 + 60 min bate exatamente no fechamento.
conferir(
  "passo de 30 min rende 21 na segunda",
  vagasLivres({ ...base, passoMin: 30 }).vagas.length,
  21,
);

// ── A escolha dos momentos a oferecer ───────────────────────────────────
//
// O erro que esta parte existe para impedir: com 4 cadeiras livres, as quatro
// primeiras vagas cronológicas são a MESMA hora. "15h ou 15h" não é escolha.

const CADEIRAS = ["s1", "s2", "s3", "s4"];
function vagasEm(date: string, horas: string[]): Vaga[] {
  const saida: Vaga[] = [];
  for (const hora of horas)
    for (const id of CADEIRAS)
      saida.push({
        date,
        hora,
        salaId: id,
        salaNome: id,
        unidadeId: UNIDADE,
        unidadeNome: "NÓS Florianópolis",
      });
  return saida;
}

conferir(
  "as faixas vão da mais perto para a mais longe",
  FAIXAS.map((f) => f.ateMinutos),
  [180, 2880, 10080, 21600],
);
conferir("dias entre datas", diasEntre("2026-09-28", "2026-09-30"), 2);
conferir("dias entre datas vira o mês", diasEntre("2026-09-30", "2026-10-02"), 2);

// Quatro cadeiras na mesma hora = UMA opção, nunca duas.
{
  const r = escolherMomentos(vagasEm("2026-09-28", ["15:00", "16:00"]), {
    date: "2026-09-28",
    hora: "14:00",
  });
  conferir("duas opções, não duas cadeiras", r.paraOferecer.length, 2);
  conferir(
    "e são horas diferentes",
    r.paraOferecer.map((m) => m.hora),
    ["15:00", "16:00"],
  );
  conferir("as quatro cadeiras viajam juntas", r.paraOferecer[0].vagas.length, 4);
}

// A faixa de 3 horas ganha quando tem duas opções dentro dela.
{
  const r = escolherMomentos(
    [...vagasEm("2026-09-28", ["15:00", "16:00"]), ...vagasEm("2026-10-05", ["09:00"])],
    { date: "2026-09-28", hora: "14:00" },
  );
  conferir("a faixa escolhida é a mais próxima", r.faixa, "nas próximas 3 horas");
  conferir(
    "e nada de outra semana entra",
    r.paraOferecer.every((m) => m.date === "2026-09-28"),
    true,
  );
}

// Só UMA opção em 3 horas: a faixa cede para a seguinte, em vez de oferecer uma.
{
  const r = escolherMomentos(
    [...vagasEm("2026-09-28", ["15:00"]), ...vagasEm("2026-09-29", ["09:00", "10:00"])],
    { date: "2026-09-28", hora: "14:00" },
  );
  conferir("uma só não fecha a faixa de 3 horas", r.faixa, "nos próximos 2 dias");
  conferir("e a de hoje continua sendo a primeira oferecida", r.paraOferecer[0].hora, "15:00");
  conferir("a segunda vem de amanhã", r.paraOferecer[1].date, "2026-09-29");
}

// Nada em 2 dias nem em 7: cai para 15.
{
  const r = escolherMomentos(vagasEm("2026-10-10", ["09:00", "10:00"]), {
    date: "2026-09-28",
    hora: "14:00",
  });
  conferir("faixa de 15 dias quando é o que há", r.faixa, "nos próximos 15 dias");
  conferir("e oferece as duas", r.paraOferecer.length, 2);
}

// A reserva é o que responde "nenhum desses serve" sem ir ao banco de novo.
{
  const r = escolherMomentos(vagasEm("2026-09-29", ["09:00", "10:00", "11:00", "14:00", "15:00"]), {
    date: "2026-09-28",
    hora: "14:00",
  });
  conferir("oferece dois", r.paraOferecer.length, 2);
  // Um da manhã e um da tarde, não duas horas seguidas da manhã: é o que
  // transforma a oferta numa escolha de verdade.
  conferir(
    "um por período",
    r.paraOferecer.map((m) => m.hora),
    ["09:00", "14:00"],
  );
  // Aqui TODO o resto cai em períodos já oferecidos, e a reserva devolve mesmo
  // assim — melhor uma alternativa próxima do que nenhuma.
  conferir(
    "e guarda o resto de reserva",
    r.reserva.map((m) => m.hora),
    ["10:00", "11:00", "15:00"],
  );
}

// ── O espalhamento ──────────────────────────────────────────────────────
//
// O defeito que isto conserta foi visto rodando com a agenda real: a escolha
// cronológica devolvia "segunda às 08:00 ou segunda às 08:30". Trinta minutos de
// diferença não é escolha — quem não pode às oito não pode às oito e meia.
conferir("manhã até 11:59", periodoDoDia("11:59"), "manhã");
conferir("tarde do meio-dia às 16:59", periodoDoDia("12:00"), "tarde");
conferir("noite das 17h em diante", periodoDoDia("17:00"), "noite");

{
  const horas: string[] = [];
  for (let t = 8 * 60; t <= 18 * 60; t += 30) horas.push(emHora(t));
  const r = escolherMomentos(vagasEm("2026-09-29", horas), { date: "2026-09-28", hora: "14:00" });
  conferir("o mais próximo continua sendo o primeiro", r.paraOferecer[0].hora, "08:00");
  conferir("mas o segundo é de outro período", periodoDoDia(r.paraOferecer[1].hora), "tarde");
  conferir("nunca meia hora depois", r.paraOferecer[1].hora === "08:30", false);
  // A reserva PRIORIZA o período não recusado, mas a lista sai em ordem
  // cronológica, então 08:30 volta à frente — e está certo: num dia só, cabe
  // tudo, e uma alternativa próxima vale mais que uma lista curta. O que a
  // priorização garante é que a opção da noite não seja expulsa pelo teto.
  conferir(
    "a noite entra na reserva",
    r.reserva.some((m) => periodoDoDia(m.hora) === "noite"),
    true,
  );
}

// Vários dias: a reserva cobre manhã, tarde e noite de dias diferentes — é o que
// responde "prefiro à tarde" sem segunda ida ao banco.
{
  const muitos = [
    ...vagasEm("2026-09-29", ["08:00", "12:00", "17:00"]),
    ...vagasEm("2026-09-30", ["08:00", "12:00", "17:00"]),
  ];
  const r = escolherMomentos(muitos, { date: "2026-09-28", hora: "14:00" }, 2, 10);
  conferir(
    "a reserva tem os três períodos",
    new Set(r.reserva.map((m) => periodoDoDia(m.hora))).size,
    3,
  );
  conferir("e mais de um dia", new Set(r.reserva.map((m) => m.date)).size, 2);
}

// Espalhar nunca devolve menos do que havia: sem diversidade, completa com os
// mais próximos em vez de encurtar a lista.
{
  const tudoDeManha = escolherMomentos(vagasEm("2026-09-29", ["08:00", "08:30", "09:00"]), {
    date: "2026-09-28",
    hora: "14:00",
  });
  conferir("sem diversidade ainda oferece dois", tudoDeManha.paraOferecer.length, 2);
  conferir("e sobra um de reserva", tudoDeManha.reserva.length, 1);
  conferir("espalhar respeita o pedido", espalharMomentos(tudoDeManha.reserva, 5).length, 1);
}

// A ordem cronológica é preservada mesmo depois de espalhar.
{
  const r = escolherMomentos(
    [...vagasEm("2026-09-30", ["08:00"]), ...vagasEm("2026-09-29", ["15:00"])],
    { date: "2026-09-28", hora: "14:00" },
  );
  conferir(
    "o dia anterior vem primeiro",
    r.paraOferecer.map((m) => m.date),
    ["2026-09-29", "2026-09-30"],
  );
}

// Agenda vazia: nenhuma faixa, e isso precisa ser distinguível de "achei".
{
  const r = escolherMomentos([], { date: "2026-09-28", hora: "14:00" });
  conferir("sem vaga, sem faixa", r.faixa, null);
  conferir("e sem oferta", r.paraOferecer.length, 0);
}

// Horário que já passou não é oferecido nem entra na reserva.
{
  const r = escolherMomentos(vagasEm("2026-09-28", ["09:00", "16:00"]), {
    date: "2026-09-28",
    hora: "14:00",
  });
  conferir(
    "a manhã que passou não aparece",
    r.paraOferecer.map((m) => m.hora),
    ["16:00"],
  );
}

// ── Duas cidades nunca viram duas opções equivalentes ──────────────────────
//
// O caso real, de 15/10 às 01:48: a conversa era sobre uma mentoria em PORTO
// ALEGRE, e quando perguntaram o endereço a Luna respondeu o de Florianópolis.
// A causa aqui dentro era o agrupamento: um momento era (dia, hora), e as
// cadeiras das duas unidades caíam no mesmo. Quem gravava ficava com `vagas[0]`
// — a primeira que o banco devolvesse —, e com duas unidades ativas isso era
// uma moeda jogada em metade das conversas.
//
// Agora um momento é (dia, hora, UNIDADE), e os dois horários oferecidos são
// sempre da mesma.

const POA = "u-poa";
function vagasEmPoa(date: string, horas: string[]): Vaga[] {
  const saida: Vaga[] = [];
  for (const hora of horas)
    saida.push({
      date,
      hora,
      salaId: "poa-1",
      salaNome: "Cadeira 1",
      unidadeId: POA,
      unidadeNome: "NÓS Porto Alegre",
    });
  return saida;
}

// O mesmo dia e a mesma hora nas duas cidades são DOIS momentos, não um.
{
  const r = escolherMomentos(
    [...vagasEm("2026-09-28", ["15:00"]), ...vagasEmPoa("2026-09-28", ["15:00"])],
    { date: "2026-09-28", hora: "14:00" },
    2,
  );
  const todos = [...r.paraOferecer, ...r.reserva];
  conferir("as duas cidades não se fundem num momento", todos.length, 2);
  conferir(
    "e cada momento sabe a sua unidade",
    todos.map((m) => m.unidadeId).sort(),
    [UNIDADE, POA].sort(),
  );
  // Nenhuma das duas tem DUAS opções, então não há par para oferecer de uma
  // unidade só — e o que não pode acontecer é oferecer uma de cada cidade.
  conferir(
    "a oferta não mistura cidade",
    new Set(r.paraOferecer.map((m) => m.unidadeId)).size <= 1,
    true,
  );
}

// A cadeira que sobrou não arrasta a unidade: cada momento guarda a sua.
{
  const r = escolherMomentos(
    [...vagasEm("2026-09-28", ["15:00", "16:00"]), ...vagasEmPoa("2026-09-28", ["15:00", "16:00"])],
    { date: "2026-09-28", hora: "14:00" },
    2,
  );
  conferir(
    "os dois oferecidos são da mesma cidade",
    new Set(r.paraOferecer.map((m) => m.unidadeId)).size,
    1,
  );
  conferir(
    "e as cadeiras do momento são todas dela",
    r.paraOferecer.every((m) => m.vagas.every((vg) => vg.unidadeId === m.unidadeId)),
    true,
  );
  // A outra cidade continua existindo, na reserva — é o que responde "eu sou de
  // Porto Alegre". Jogá-la fora deixaria quem está na outra cidade sem resposta.
  conferir(
    "a outra cidade sobra na reserva",
    r.reserva.some((m) => m.unidadeId !== r.paraOferecer[0].unidadeId),
    true,
  );
}

// A unidade escolhida é a do horário MAIS PRÓXIMO entre as que têm duas opções.
{
  const r = escolherMomentos(
    [
      // Porto Alegre tem duas, e mais cedo.
      ...vagasEmPoa("2026-09-28", ["15:00", "16:00"]),
      // Florianópolis tem duas também, mas depois.
      ...vagasEm("2026-09-28", ["16:30"]),
      ...vagasEm("2026-09-29", ["09:00"]),
    ],
    { date: "2026-09-28", hora: "14:00" },
    2,
  );
  conferir("ganha quem tem o horário mais próximo", r.paraOferecer[0].unidadeId, POA);
  conferir(
    "e o par inteiro é dela",
    r.paraOferecer.every((m) => m.unidadeId === POA),
    true,
  );
}

// Uma opção em cada cidade na faixa curta NÃO fecha a faixa: a conta é por
// unidade. Somando as duas, a faixa de 3 horas passaria e a oferta sairia com
// uma cidade de cada lado.
{
  const r = escolherMomentos(
    [
      ...vagasEm("2026-09-28", ["15:00"]),
      ...vagasEmPoa("2026-09-28", ["16:00"]),
      // Só Florianópolis tem duas, e já na faixa de dois dias.
      ...vagasEm("2026-09-29", ["09:00", "11:00"]),
    ],
    { date: "2026-09-28", hora: "14:00" },
    2,
  );
  conferir("a faixa abre até caber um par de uma só unidade", r.faixa, "nos próximos 2 dias");
  conferir("e o par é de uma cidade só", new Set(r.paraOferecer.map((m) => m.unidadeId)).size, 1);
}

// A tarde da outra cidade não é apagada da reserva por já ter saído uma tarde.
// Para quem está em Porto Alegre, a tarde de Porto Alegre é a resposta certa.
{
  const r = escolherMomentos(
    [...vagasEm("2026-09-29", ["14:00", "15:00"]), ...vagasEmPoa("2026-09-29", ["14:30"])],
    { date: "2026-09-29", hora: "09:00" },
    2,
    10,
  );
  conferir(
    "a tarde da outra cidade continua na reserva",
    r.reserva.some((m) => m.unidadeId === POA),
    true,
  );
}

// Uma clínica de uma unidade só não muda de comportamento. É a maioria, e uma
// mudança de regra que mexe no caso simples é uma regressão disfarçada.
{
  const r = escolherMomentos(vagasEm("2026-09-28", ["15:00", "16:00"]), {
    date: "2026-09-28",
    hora: "14:00",
  });
  conferir("unidade única: duas opções como antes", r.paraOferecer.length, 2);
  conferir(
    "e as horas são as mesmas",
    r.paraOferecer.map((m) => m.hora),
    ["15:00", "16:00"],
  );
}

// ── A unidade de viagem ─────────────────────────────────────────────────
//
// A agenda de Porto Alegre está cadastrada ABERTA de segunda a sábado, com
// duas cadeiras, e a Dra. Mariane vai para lá de tempo em tempo. Sem os dias
// de viagem, havia vaga livre em Porto Alegre em todo dia do calendário — e
// uma pessoa de lá receberia "terça às 10h" num dia em que a sala está vazia.
//
// O que se exercita aqui é o avesso de um bloqueio: em vez de cadastrar as
// centenas de dias em que ela NÃO está, cadastram-se os poucos em que está.

const jornadaDePoa: Jornada[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  unidadeId: POA,
  weekday,
  modo: "aberto" as const,
  abre: "08:00",
  fecha: "19:00",
}));
const salaDePoa: Sala[] = [
  { id: "poa-1", nome: "Cadeira 1", unidadeId: POA, unidadeNome: "NÓS Porto Alegre" },
];
const duasUnidades = {
  ...base,
  jornadas: [...jornadaDaNos, ...jornadaDePoa],
  salas: [...umaSala, ...salaDePoa],
  dias: 3, // segunda 28, terça 29, quarta 30
  maximo: 500,
};

// Sem dias marcados, nada muda: é o estado de hoje, e as duas unidades abrem.
{
  const r = vagasLivres(duasUnidades);
  conferir(
    "sem dias marcados, as duas unidades têm vaga",
    new Set(r.vagas.map((v) => v.unidadeId)),
    new Set([UNIDADE, POA]),
  );
}

// Porto Alegre marcada só na terça: quarta e segunda não existem para ela.
{
  const r = vagasLivres({
    ...duasUnidades,
    diasDaUnidade: new Map([[POA, new Set(["2026-09-29"])]]),
  });
  const diasDePoa = new Set(r.vagas.filter((v) => v.unidadeId === POA).map((v) => v.date));
  conferir("Porto Alegre só no dia da viagem", diasDePoa, new Set(["2026-09-29"]));
  // E o mais importante: Florianópolis não perde nada. A trava é por unidade.
  const diasDeFloripa = new Set(r.vagas.filter((v) => v.unidadeId === UNIDADE).map((v) => v.date));
  conferir(
    "Florianópolis continua todos os dias",
    diasDeFloripa,
    new Set(["2026-09-28", "2026-09-29", "2026-09-30"]),
  );
}

// Nenhuma data marcada para a unidade de viagem: ela simplesmente não tem
// vaga. É o que acontece quando a próxima viagem ainda não foi cadastrada, e é
// o lado seguro — a Luna diz que confirma as datas, em vez de oferecer um dia
// em que ninguém está lá.
{
  const r = vagasLivres({
    ...duasUnidades,
    diasDaUnidade: new Map([[POA, new Set<string>()]]),
  });
  conferir(
    "viagem sem data não rende vaga",
    r.vagas.some((v) => v.unidadeId === POA),
    false,
  );
  conferir(
    "e Florianópolis segue inteira",
    r.vagas.some((v) => v.unidadeId === UNIDADE),
    true,
  );
}

// Fora do dia de viagem, o domingo da unidade de viagem não é "sob consulta":
// é um dia em que aquela unidade não existe. Virar sob consulta faria a Luna
// dizer "confirmo com a Dra." sobre uma cidade onde não há viagem marcada.
{
  const r = vagasLivres({
    ...duasUnidades,
    jornadas: [
      ...jornadaDaNos,
      { unidadeId: POA, weekday: 0, modo: "sob_consulta", abre: null, fecha: null },
    ],
    de: "2026-09-27", // domingo
    dias: 1,
    diasDaUnidade: new Map([[POA, new Set(["2026-09-29"])]]),
  });
  conferir("domingo de Porto Alegre fora da viagem não é sob consulta", r.diasSobConsulta, [
    "2026-09-27",
  ]);
}

// ── A cidade confirmada escolhe a oferta ────────────────────────────────
//
// Confirmada a cidade, os dois horários saem DELA. Sem isto, a faixa mais
// próxima decide — e a faixa mais próxima é quase sempre de Florianópolis,
// que é a cidade onde a Dra. está todos os dias.

// Porto Alegre tem o horário mais tarde, e ainda assim é o que sai.
{
  const r = escolherMomentos(
    [...vagasEm("2026-09-28", ["15:00", "16:00"]), ...vagasEmPoa("2026-09-30", ["09:00", "10:00"])],
    { date: "2026-09-28", hora: "14:00" },
    2,
    10,
    { unidadeId: POA, exigir: true },
  );
  conferir(
    "a oferta é da cidade confirmada",
    new Set(r.paraOferecer.map((m) => m.unidadeId)),
    new Set([POA]),
  );
  conferir("e são dois", r.paraOferecer.length, 2);
  // Os de Florianópolis não desaparecem: ficam na reserva, para quando a pessoa
  // disser que na verdade está na outra cidade.
  conferir(
    "a outra cidade fica na reserva",
    r.reserva.some((m) => m.unidadeId === UNIDADE),
    true,
  );
}

// E este é o caso que não pode falhar: a cidade confirmada não tem vaga. A
// oferta sai VAZIA, de propósito. Oferecer Florianópolis para quem acabou de
// dizer que está em Porto Alegre é marcar uma viagem de 470 km sem avisar.
{
  const r = escolherMomentos(
    vagasEm("2026-09-28", ["15:00", "16:00"]),
    { date: "2026-09-28", hora: "14:00" },
    2,
    10,
    { unidadeId: POA, exigir: true },
  );
  conferir("sem vaga na cidade confirmada, nada a oferecer", r.paraOferecer.length, 0);
  conferir("e a faixa não é afirmada", r.faixa, null);
  conferir(
    "a outra cidade continua só na reserva",
    r.reserva.every((m) => m.unidadeId === UNIDADE),
    true,
  );
  conferir("a reserva não está vazia", r.reserva.length > 0, true);
}

// Cidade confirmada numa clínica de uma unidade só: a unidade confirmada É a
// única, e nada muda.
{
  const r = escolherMomentos(
    vagasEm("2026-09-28", ["15:00", "16:00"]),
    { date: "2026-09-28", hora: "14:00" },
    2,
    10,
    { unidadeId: UNIDADE, exigir: true },
  );
  conferir("unidade única confirmada: duas opções", r.paraOferecer.length, 2);
}

// ── O palpite do DDD, que cede ──────────────────────────────────────────
//
// A cidade confirmada manda mesmo quando dói. O palpite, não: ele acerta
// quase sempre, e no dia em que errar não pode ser ele a deixar a conversa
// sem horário nenhum. Então vale enquanto houver vaga naquela unidade, e some
// quando não houver.

// Havendo vaga na unidade do palpite, ele vale igual à confirmação.
{
  const r = escolherMomentos(
    [...vagasEm("2026-09-28", ["15:00", "16:00"]), ...vagasEmPoa("2026-09-30", ["09:00", "10:00"])],
    { date: "2026-09-28", hora: "14:00" },
    2,
    10,
    { unidadeId: POA, exigir: false },
  );
  conferir(
    "o palpite escolhe a unidade",
    new Set(r.paraOferecer.map((m) => m.unidadeId)),
    new Set([POA]),
  );
}

// Não havendo, ele se desfaz — e a oferta volta a ser a de sempre, em vez de
// vazia. É a diferença que separa palpite de confirmação.
{
  const r = escolherMomentos(
    vagasEm("2026-09-28", ["15:00", "16:00"]),
    { date: "2026-09-28", hora: "14:00" },
    2,
    10,
    { unidadeId: POA, exigir: false },
  );
  conferir("palpite sem vaga não cala a conversa", r.paraOferecer.length, 2);
  conferir(
    "e a oferta vem da unidade que tem vaga",
    new Set(r.paraOferecer.map((m) => m.unidadeId)),
    new Set([UNIDADE]),
  );
  conferir("com a faixa afirmada", r.faixa, "nas próximas 3 horas");
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do cálculo de vagas`);
