// Checagens do texto de horários que vai para a instrução do agente.
//
// Isto é prompt, não tela — e prompt errado não dá erro em lugar nenhum. Dá uma
// mensagem no WhatsApp de um paciente com um horário que não existe, ou com um
// "não atendemos domingo" que é falso.
//
// As três ausências que NÃO podem virar o mesmo texto:
//
//   **Não consultei a agenda** (leitura falhou, jornada não configurada) — o
//   agente tem de calar sobre horário e passar para uma pessoa.
//
//   **Consultei e não há vaga** — pode dizer que vai ver com a equipe.
//
//   **Este dia é sob consulta** — domingo na NÓS. Não oferecer, e sobretudo NÃO
//   negar: a clínica atende domingo falando com a Dra. Dizer "não atendemos"
//   perde o paciente com uma informação errada.
import {
  secaoDeHorarios,
  type HorariosParaOferecer,
} from "../supabase/functions/_shared/instrucao-do-agente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}
function contem(nome: string, texto: string, trecho: string) {
  conferir(nome, texto.includes(trecho), true);
}
function naoContem(nome: string, texto: string, trecho: string) {
  conferir(nome, texto.includes(trecho), false);
}

// ── Ausência 1: não consultei ───────────────────────────────────────────
{
  const t = secaoDeHorarios(null);
  contem("sem consulta, manda não dizer horário", t, "Não diga horário nenhum");
  contem("e manda passar para uma pessoa", t, "passe a conversa para uma pessoa");
  // O erro grave: afirmar que não há vaga quando não se sabe.
  naoContem("e NÃO afirma que não há vaga", t, "NÃO há vaga");
}

// ── Ausência 2: consultei e não há ──────────────────────────────────────
{
  const t = secaoDeHorarios({
    paraOferecer: [],
    reserva: [],
    faixa: null,
    diasSobConsulta: [],
  });
  contem("sem vaga, diz que consultou", t, "A agenda foi consultada");
  contem("e que não há nos quinze dias", t, "NÃO há vaga nos próximos quinze dias");
}

// ── O caso normal ───────────────────────────────────────────────────────
const doisHorarios: HorariosParaOferecer = {
  paraOferecer: [
    { date: "2026-10-01", hora: "14:00", unidadeNome: "NÓS Florianópolis" },
    { date: "2026-10-02", hora: "09:30", unidadeNome: "NÓS Porto Alegre" },
  ],
  reserva: [{ date: "2026-10-02", hora: "16:00", unidadeNome: "NÓS Florianópolis" }],
  faixa: "nos próximos 2 dias",
  diasSobConsulta: [],
};
{
  const t = secaoDeHorarios(doisHorarios);
  // 01/10/2026 é uma quinta-feira; 02/10 é sexta.
  contem("escreve o dia da semana", t, "quinta-feira, 01/10, às 14:00");
  contem("e o segundo", t, "sexta-feira, 02/10, às 09:30");
  // A unidade é o que faz a cidade sair certa sem a IA adivinhar.
  contem("a unidade vem junto", t, "na NÓS Porto Alegre");
  contem("diz a faixa", t, "nos próximos 2 dias");
  contem("manda oferecer os dois de uma vez", t, "os dois de uma vez, numa frase");
  contem("proíbe mandar a agenda inteira", t, "Não mande a agenda inteira");
  contem("e proíbe devolver a pergunta", t, "quando você");
  // ── O que a clínica reclamou em 29/09 ──────────────────────────────────
  //
  // A instrução ANTIGA dizia "não pergunte primeiro quando a pessoa pode" e
  // mandava oferecer de uma vez — sem dizer QUANDO. O resultado foi a Luna
  // respondendo preço, duração e dois horários na primeira mensagem, antes de
  // a pessoa dizer o que queria.
  contem(
    "diz que horário não vem na primeira resposta",
    t,
    "só depois de a pessoa dizer o que quer",
  );
  contem("e aponta para a regra do ritmo", t, "regra nº 8");
  // A reserva existe para responder "nenhum desses serve".
  contem("a reserva aparece", t, "nenhum dos dois serve");
  contem("com o horário de reserva", t, "sexta-feira, 02/10, às 16:00");
  // O agente NÃO marca — só a equipe fecha.
  contem("deixa claro que não marca", t, "Você NÃO marca a consulta");
}

// Sem reserva, a seção não promete uma segunda rodada que não tem.
naoContem(
  "sem reserva, não fala de nenhum dos dois",
  secaoDeHorarios({ ...doisHorarios, reserva: [] }),
  "nenhum dos dois serve",
);

// ── Ausência 3: sob consulta ────────────────────────────────────────────
{
  const t = secaoDeHorarios({ ...doisHorarios, diasSobConsulta: ["2026-10-04"] });
  // 04/10/2026 é um domingo.
  contem("lista o dia sob consulta", t, "domingo, 04/10");
  contem("manda não oferecer", t, "Não ofereça nenhum deles");
  // O ponto inteiro desta seção: não pode virar "não atendemos".
  contem("e proíbe dizer que não atende", t, "NÃO diga que a");
  contem("dizendo que atende", t, "porque atende");
}

// Sob consulta sem nenhuma vaga: as duas coisas convivem, porque é o domingo de
// uma semana lotada.
{
  const t = secaoDeHorarios({
    paraOferecer: [],
    reserva: [],
    faixa: null,
    diasSobConsulta: ["2026-10-04"],
  });
  contem("diz que não há vaga", t, "NÃO há vaga");
  contem("e ainda assim explica o domingo", t, "domingo, 04/10");
}

// ── A quarta ausência: não há vaga NA CIDADE DELA ───────────────────────
//
// Esta é diferente das três de cima, e é a que apareceu com a unidade de Porto
// Alegre. A agenda foi consultada, há vaga de sobra — em Florianópolis. Para
// quem acabou de dizer que está em Porto Alegre, "temos horário" é falso e
// oferecer um dos de Florianópolis é marcar uma viagem de 470 km sem avisar.
{
  const t = secaoDeHorarios({
    paraOferecer: [],
    reserva: [
      { date: "2026-10-05", hora: "09:00", unidadeNome: "NÓS Florianópolis" },
      { date: "2026-10-06", hora: "14:00", unidadeNome: "NÓS Florianópolis" },
    ],
    faixa: null,
    diasSobConsulta: [],
    unidadeDoPaciente: { id: "u-poa", nome: "NÓS Porto Alegre" },
  });
  contem("diz em qual cidade não há vaga", t, "NÃO há vaga na NÓS Porto Alegre");
  contem("proíbe oferecer da outra", t, "NÃO ofereça horário de outra");
  contem("inclusive os que aparecem abaixo", t, "nem os que aparecerem mais abaixo");
  contem("manda confirmar as próximas datas", t, "próximas datas de atendimento");
  // E não pode sair a frase genérica, que convida a "ver uma possibilidade" sem
  // dizer que a possibilidade é em outra cidade.
  naoContem("sem a frase genérica", t, "ver uma possibilidade com a");
}

// Com vaga na cidade dela, a seção oferece normalmente — e avisa que a lista de
// alternativas pode ter outra cidade, porque ela tem mesmo: é de propósito, para
// responder "na verdade eu estou na outra".
{
  const t = secaoDeHorarios({
    paraOferecer: [
      { date: "2026-10-05", hora: "09:00", unidadeNome: "NÓS Porto Alegre" },
      { date: "2026-10-05", hora: "15:00", unidadeNome: "NÓS Porto Alegre" },
    ],
    reserva: [{ date: "2026-10-06", hora: "10:00", unidadeNome: "NÓS Florianópolis" }],
    faixa: "nos próximos 2 dias",
    diasSobConsulta: [],
    unidadeDoPaciente: { id: "u-poa", nome: "NÓS Porto Alegre" },
  });
  contem("oferece os dois dela", t, "às 09:00, na NÓS Porto Alegre");
  contem("avisa da outra cidade na reserva", t, "pode ter horários de outra cidade");
  contem("e diz qual é a dela", t, "da NÓS Porto Alegre — ofereça só os que dizem");
}

// Sem cidade confirmada, o texto é o de sempre: nenhuma dessas frases aparece.
{
  const t = secaoDeHorarios({
    paraOferecer: [{ date: "2026-10-05", hora: "09:00", unidadeNome: "NÓS Florianópolis" }],
    reserva: [{ date: "2026-10-06", hora: "10:00", unidadeNome: "NÓS Porto Alegre" }],
    faixa: "nos próximos 2 dias",
    diasSobConsulta: [],
  });
  naoContem("sem cidade, nada de aviso de cidade", t, "pode ter horários de outra cidade");
  naoContem("nem de proibição", t, "NÃO ofereça horário de outra");
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da seção de horários`);
