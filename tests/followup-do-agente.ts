// Checagens de quando a Luna volta em quem sumiu.
//
// ── Por que esta decisão merece teste antes de existir ──────────────────
//
// Ela manda mensagem no WhatsApp de gente real, sozinha, sem ninguém olhando.
// Errar aqui não aparece como erro na tela: aparece como paciente irritado, ou
// como número bloqueado — e bloqueio no WhatsApp derruba a reputação e leva
// embora também as conversas que funcionavam.
//
// Os modos de errar:
//
//   **Acordar o acervo.** Ligar a chave e mandar mensagem para 262 conversas
//   paradas de uma vez, muitas de dois meses atrás. É o defeito mais caro
//   possível, e é o que `ligadoDesde` existe para impedir.
//
//   **Falar por cima de uma pessoa.** A conversa que a recepção assumiu não é
//   mais da Luna.
//
//   **Cobrar quem já agendou.**
//
//   **Confundir "abandonou" com "está esperando resposta".** São opostos: num
//   caso a Luna insiste, no outro ela deve ficar quieta e a conversa aparecer
//   em "Sem resposta".
//
//   **Mandar de madrugada.** Mensagem automática às 3h não tem desculpa.
import {
  MAIS_CEDO,
  MAIS_TARDE,
  RITMO_PADRAO_DO_FOLLOWUP,
  decidirFollowup,
  dentroDaJanela,
  promptDoFollowup,
  type EstadoDaConversa,
  type RitmoDoFollowup,
} from "../supabase/functions/_shared/followup-do-agente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const AGORA = new Date("2026-09-30T18:00:00Z");
const h = (horas: number) => new Date(AGORA.getTime() - horas * 3_600_000).toISOString();

// Uma conversa de anúncio em que a Luna falou e a pessoa sumiu faz 30 horas.
const abandonada: EstadoDaConversa = {
  humanoAssumiu: false,
  ultimaEntrada: h(31),
  ultimaSaida: h(30),
  criadaEm: h(32),
  followupsEnviados: 0,
  ultimoFollowupEm: null,
  veioDeAnuncio: true,
  jaAgendou: false,
};

const ligado: RitmoDoFollowup = {
  ...RITMO_PADRAO_DO_FOLLOWUP,
  ligado: true,
  ligadoDesde: h(100),
};

// ── O caso que a função existe para pegar ────────────────────────────────
conferir("conversa abandonada ganha o primeiro toque", decidirFollowup(abandonada, ligado, AGORA), {
  volta: true,
  toque: 1,
});

// ── Nasce desligado ──────────────────────────────────────────────────────
conferir("o padrão é desligado", RITMO_PADRAO_DO_FOLLOWUP.ligado, false);
conferir(
  "desligado não volta em ninguém",
  decidirFollowup(abandonada, RITMO_PADRAO_DO_FOLLOWUP, AGORA),
  { volta: false, motivo: "follow-up desligado" },
);

// ── Ligar não acorda o passado ───────────────────────────────────────────
//
// É o teste mais importante deste arquivo. A clínica ligou a chave agora, e a
// conversa parou dois meses atrás.
{
  const velha: EstadoDaConversa = {
    ...abandonada,
    ultimaEntrada: h(24 * 60 + 1),
    ultimaSaida: h(24 * 60),
    criadaEm: h(24 * 60 + 2),
  };
  const ligadoAgora: RitmoDoFollowup = { ...ligado, ligadoDesde: h(0.1) };
  conferir("conversa de dois meses não é acordada", decidirFollowup(velha, ligadoAgora, AGORA), {
    volta: false,
    motivo: "conversa velha demais para follow-up",
  });

  // E uma parada faz três dias, dentro da validade, mas parada ANTES de ligar:
  // também não. É o caso que faria 262 mensagens saírem juntas.
  const paradaAntes: EstadoDaConversa = {
    ...abandonada,
    ultimaEntrada: h(73),
    ultimaSaida: h(72),
    criadaEm: h(74),
  };
  conferir(
    "parada antes de ligar a chave também não é acordada",
    decidirFollowup(paradaAntes, ligadoAgora, AGORA),
    { volta: false, motivo: "já estava parada antes de o follow-up ser ligado" },
  );
  // A mesma conversa, com a chave ligada desde antes dela parar: aí volta.
  conferir(
    "mas com a chave já ligada, ela volta",
    decidirFollowup(paradaAntes, { ...ligado, ligadoDesde: h(100) }, AGORA),
    { volta: true, toque: 1 },
  );
}

// ── Quem não pode receber ────────────────────────────────────────────────
conferir(
  "humano assumiu, a Luna se cala",
  decidirFollowup({ ...abandonada, humanoAssumiu: true }, ligado, AGORA),
  { volta: false, motivo: "humano assumiu a conversa" },
);
conferir(
  "quem agendou não é cobrado",
  decidirFollowup({ ...abandonada, jaAgendou: true }, ligado, AGORA),
  { volta: false, motivo: "já agendou" },
);
conferir(
  "fora do anúncio, a Luna não volta",
  decidirFollowup({ ...abandonada, veioDeAnuncio: false }, ligado, AGORA),
  { volta: false, motivo: "não veio de anúncio" },
);
conferir(
  "humano assumiu ganha do silêncio curto na explicação",
  decidirFollowup(
    { ...abandonada, humanoAssumiu: true, ultimaSaida: h(1), ultimaEntrada: h(2) },
    ligado,
    AGORA,
  ),
  { volta: false, motivo: "humano assumiu a conversa" },
);

// ── Esperando resposta é o OPOSTO de abandonada ──────────────────────────
conferir(
  "a pessoa falou por último: a Luna não insiste",
  decidirFollowup({ ...abandonada, ultimaEntrada: h(1), ultimaSaida: h(30) }, ligado, AGORA),
  { volta: false, motivo: "a pessoa está esperando resposta" },
);
conferir(
  "a Luna nunca falou: não há o que retomar",
  decidirFollowup({ ...abandonada, ultimaSaida: null }, ligado, AGORA),
  { volta: false, motivo: "a Luna ainda não falou aqui" },
);
conferir(
  "ninguém do outro lado escreveu",
  decidirFollowup({ ...abandonada, ultimaEntrada: null }, ligado, AGORA),
  { volta: false, motivo: "a pessoa nunca escreveu" },
);

// ── O relógio de cada toque ──────────────────────────────────────────────
conferir(
  "19 horas de silêncio ainda é cedo",
  decidirFollowup({ ...abandonada, ultimaSaida: h(19), ultimaEntrada: h(20) }, ligado, AGORA),
  { volta: false, motivo: "silêncio ainda curto" },
);
conferir(
  "20 horas já dá",
  decidirFollowup({ ...abandonada, ultimaSaida: h(20), ultimaEntrada: h(21) }, ligado, AGORA),
  { volta: true, toque: 1 },
);
// O segundo toque conta do PRIMEIRO, não do silêncio. Sem isso os dois sairiam
// quase juntos e a pessoa receberia duas mensagens no mesmo dia.
conferir(
  "o segundo espera 72h depois do primeiro",
  decidirFollowup({ ...abandonada, followupsEnviados: 1, ultimoFollowupEm: h(71) }, ligado, AGORA),
  { volta: false, motivo: "silêncio ainda curto" },
);
conferir(
  "e sai no 72º",
  decidirFollowup(
    {
      ...abandonada,
      followupsEnviados: 1,
      ultimoFollowupEm: h(72),
      ultimaSaida: h(72),
      ultimaEntrada: h(96),
    },
    ligado,
    AGORA,
  ),
  { volta: true, toque: 2 },
);
conferir(
  "dois toques e para",
  decidirFollowup(
    {
      ...abandonada,
      followupsEnviados: 2,
      ultimoFollowupEm: h(200),
      ultimaSaida: h(200),
      ultimaEntrada: h(240),
      criadaEm: h(250),
    },
    ligado,
    AGORA,
  ),
  { volta: false, motivo: "já tentei o bastante" },
);

// ── A janela de horário ──────────────────────────────────────────────────
const semana = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  modo: "normal",
  abre: "08:00:00",
  fecha: "20:00:00",
}));
const domingo = { weekday: 0, modo: "sob_consulta", abre: null, fecha: null };

conferir("meio da tarde, quarta-feira", dentroDaJanela(15, 3, semana), true);
conferir("três da manhã, nunca", dentroDaJanela(3, 3, semana), false);
// A clínica abre às 8h, mas mensagem automática não sai antes das 9h.
conferir("às 8h a clínica abre e o robô ainda não fala", dentroDaJanela(8, 3, semana), false);
conferir("às 9h já fala", dentroDaJanela(9, 3, semana), true);
// A clínica fecha às 20h, mas o robô para às 19h.
conferir("às 19h o robô já parou", dentroDaJanela(19, 3, semana), false);
conferir("às 18h ainda fala", dentroDaJanela(18, 3, semana), true);
conferir(
  "domingo sob consulta não é hora de atendimento",
  dentroDaJanela(15, 0, [...semana, domingo]),
  false,
);
conferir("dia sem jornada cadastrada, não manda", dentroDaJanela(15, 6, semana), false);
// Falha fechada: sem jornada nenhuma, não se sabe se está aberto.
conferir("sem jornada nenhuma, não manda", dentroDaJanela(15, 3, []), false);
conferir(
  "hora torta no cadastro fecha a janela",
  dentroDaJanela(15, 3, [{ weekday: 3, modo: "normal", abre: null, fecha: "20:00:00" }]),
  false,
);
conferir("os limites são 9 e 19", [MAIS_CEDO, MAIS_TARDE], [9, 19]);

// ── O pedido que vai ao modelo ───────────────────────────────────────────
{
  const p1 = promptDoFollowup({ toque: 1, historico: "VOCÊ: oi", horasDeSilencio: 30 });
  conferir("o primeiro toque retoma", p1.includes("Retome de onde a conversa parou"), true);
  conferir("diz quanto tempo faz", p1.includes("cerca de 30 horas"), true);
  conferir("proíbe repetir", p1.includes("Não repita informação que já está acima"), true);
  conferir("proíbe se anunciar como robô", p1.includes("não diga que é mensagem"), true);

  const p2 = promptDoFollowup({ toque: 2, historico: "VOCÊ: oi", horasDeSilencio: 100 });
  conferir("o segundo muda o ângulo", p2.includes("Mude o ângulo"), true);
  conferir("e é o último", p2.includes("Última tentativa"), true);
  conferir("os dois toques são textos diferentes", p1 === p2, false);

  // Toque fora da tabela não pode gerar prompt sem ângulo nenhum.
  const p9 = promptDoFollowup({ toque: 9, historico: "x", horasDeSilencio: 1 });
  conferir("toque desconhecido cai no primeiro ângulo", p9.includes("Retome de onde"), true);
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do follow-up`);
