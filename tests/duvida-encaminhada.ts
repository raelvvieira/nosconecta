// Checagens da dúvida que a Luna encaminha para a equipe.
//
// ── O que está em jogo ─────────────────────────────────────────────────────
//
// Entre 28/09 e 15/10 ela disse 50 vezes, em 31 conversas, que ia confirmar
// alguma coisa com a equipe. Nenhuma dessas 50 chegou a ninguém: "vou
// encaminhar" era uma frase no texto da mensagem e nada mais. A pessoa ficava
// esperando uma resposta que ninguém sabia que devia dar.
//
// E quando alguém da clínica finalmente escrevia, a conversa saía das mãos da
// Luna para sempre — são 2.910 mensagens descartadas com o motivo "humano
// assumiu a conversa", em 171 das 291 conversas. Uma pergunta que ela não sabia
// custava o atendimento inteiro.
//
// Os modos de errar aqui, os dois silenciosos:
//
//   **Não registrar.** O campo vem vazio, ninguém é avisado, e a dúvida
//   desaparece exatamente como as 50 de setembro.
//
//   **Encaminhar de novo a cada mensagem.** O modelo não lembra o que fez na
//   mensagem anterior. Sem a instrução dizer que aquela pergunta já está com
//   alguém, ela promete a mesma confirmação a cada resposta, e a pessoa ouve
//   "vou confirmar" cinco vezes seguidas sem nada acontecer.
import {
  montarInstrucao,
  secaoDaDuvidaEncaminhada,
} from "../supabase/functions/_shared/instrucao-do-agente.ts";
import { lerRespostaAoPaciente } from "../supabase/functions/_shared/modelo-de-atendimento.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}
const contem = (n: string, t: string, x: string) => conferir(n, t.includes(x), true);
const naoContem = (n: string, t: string, x: string) => conferir(n, t.includes(x), false);

// ── A instrução, sem dúvida pendente ───────────────────────────────────────
//
// O estado normal. Ela precisa saber COMO encaminhar, porque é o campo que faz
// o aviso sair — a frase bonita na mensagem não avisa ninguém.
{
  const t = secaoDaDuvidaEncaminhada(null);
  contem("diz qual é o campo", t, "duvidaEncaminhada");
  contem("diz que é o campo que avisa", t, "avisa alguém da clínica");
  contem("e o que acontece sem ele", t, "ninguém fica sabendo");
  // A parte que conserta o abandono: encaminhar uma dúvida não é entregar a
  // conversa.
  contem("encaminhar não encerra", t, "NÃO encerra o atendimento");
  contem("ela continua respondendo o resto", t, "continua respondendo");
  naoContem("e não fala de pendência que não existe", t, "Já tem uma dúvida");
}

// Omitido e vazio valem o mesmo que nulo: são os três jeitos de "não tem".
for (const [rotulo, valor] of [
  ["omitido", undefined],
  ["vazio", ""],
  ["só espaços", "   "],
] as const) {
  naoContem(`sem pendência (${rotulo})`, secaoDaDuvidaEncaminhada(valor), "Já tem uma dúvida");
}

// ── Com dúvida pendente ────────────────────────────────────────────────────
//
// O caso real: alguém pergunta quantos ml estão incluídos numa oferta, o
// catálogo não tem esse dado, e a Luna pede confirmação. Na mensagem seguinte
// ela não pode prometer de novo.
{
  const pergunta = "Quantos ml de preenchimento estão incluídos no valor da mentoria?";
  const t = secaoDaDuvidaEncaminhada(pergunta);
  contem("mostra a pergunta que está esperando", t, pergunta);
  contem("avisa que já está encaminhada", t, "Já tem uma dúvida com a equipe");
  contem("manda não encaminhar de novo", t, "Não encaminhe esta mesma pergunta de novo");
  contem("manda deixar o campo vazio", t, "vazio");
  contem("abre a exceção da pergunta diferente", t, "pergunta DIFERENTE");
  // O ponto da coisa: a conversa segue.
  contem("e manda seguir atendendo", t, "siga o atendimento");
}

// Espaços em volta não mudam a pergunta — o modelo devolve o que devolver.
contem(
  "a pergunta vem sem espaço em volta",
  secaoDaDuvidaEncaminhada("  tem estacionamento?  "),
  "A pergunta que está esperando é esta: tem estacionamento?",
);

// ── A seção dentro da instrução inteira ────────────────────────────────────
//
// Ela entra ANTES das regras invioláveis, e isso não é arrumação: a regra nº 1
// manda passar a conversa para uma pessoa em certas situações, e esta seção é o
// que diz que passar UMA DÚVIDA não é passar a conversa. Lida depois, a
// distinção chegaria tarde.
{
  const base = { clinica: "NÓS Odontologia", manual: {}, procedimentos: [] };
  const inteira = montarInstrucao({ ...base, duvidaPendente: "tem estacionamento?" });
  contem("a instrução traz a seção", inteira, "Quando você precisa confirmar algo com a equipe");
  contem("e a dúvida pendente", inteira, "tem estacionamento?");
  conferir(
    "e ela vem antes das regras invioláveis",
    inteira.indexOf("confirmar algo com a equipe") <
      inteira.indexOf("REGRAS QUE VOCÊ NUNCA PODE QUEBRAR"),
    true,
  );
  // Sem dúvida pendente a seção continua existindo: é como ela aprende a
  // encaminhar da primeira vez.
  const semNada = montarInstrucao(base);
  contem("a seção existe mesmo sem pendência", semNada, "duvidaEncaminhada");
  naoContem("sem inventar pendência", semNada, "Já tem uma dúvida");
}

// ── A leitura do que o modelo devolve ──────────────────────────────────────
//
// A fronteira. Daqui para dentro a dúvida é uma linha no banco e um aviso no
// celular de alguém, então o que entra tem de ser texto de verdade.
{
  const r = lerRespostaAoPaciente(
    JSON.stringify({
      resposta: "Vou confirmar isso com a equipe e já te falo.",
      horarioFechado: "",
      casoEnviado: "",
      duvidaEncaminhada: "Quantos ml inclui a oferta?",
    }),
  );
  conferir("a fala sai inteira", r.texto, "Vou confirmar isso com a equipe e já te falo.");
  conferir("e a dúvida também", r.duvidaEncaminhada, "Quantos ml inclui a oferta?");
}

// Sem o campo: resposta normal, sem dúvida. É a imensa maioria das mensagens, e
// inventar pendência aqui calaria a Luna numa pergunta que ela respondeu.
conferir(
  "resposta sem o campo não encaminha nada",
  lerRespostaAoPaciente(
    JSON.stringify({ resposta: "A limpeza fica R$ 300.", horarioFechado: "", casoEnviado: "" }),
  ).duvidaEncaminhada,
  "",
);

// Tipo errado não vira dúvida: o campo é texto para uma pessoa ler.
for (const valor of [42, null, true, { a: 1 }, ["x"]]) {
  conferir(
    `${JSON.stringify(valor)} não vira dúvida`,
    lerRespostaAoPaciente(JSON.stringify({ resposta: "oi", duvidaEncaminhada: valor }))
      .duvidaEncaminhada,
    "",
  );
}

// Espaços em volta saem — a coluna não guarda indentação do modelo.
conferir(
  "a dúvida vem sem espaço em volta",
  lerRespostaAoPaciente(JSON.stringify({ resposta: "oi", duvidaEncaminhada: "  tem wifi?  " }))
    .duvidaEncaminhada,
  "tem wifi?",
);

// Teto de 300: é uma frase para a tela e para o aviso no celular, não um
// relatório. Um modelo que despejasse a conversa inteira aqui encheria a coluna
// e o push.
{
  const enorme = "a".repeat(500);
  const r = lerRespostaAoPaciente(JSON.stringify({ resposta: "oi", duvidaEncaminhada: enorme }));
  conferir("a dúvida é cortada em 300", r.duvidaEncaminhada.length, 300);
}

// Texto que não é JSON: a fala é o que veio, e NADA é encaminhado. A paciente
// não pode ficar sem resposta por causa de um campo, e um aviso tirado de um
// texto que não entendemos seria pior que nenhum.
{
  const r = lerRespostaAoPaciente("Oi! A limpeza fica R$ 300.");
  conferir("texto cru vira a fala", r.texto, "Oi! A limpeza fica R$ 300.");
  conferir("e não encaminha nada", r.duvidaEncaminhada, "");
}

// JSON válido que não é a resposta: mesmo princípio.
{
  const r = lerRespostaAoPaciente(JSON.stringify({ outra: "coisa", duvidaEncaminhada: "x" }));
  conferir("objeto estranho não encaminha", r.duvidaEncaminhada, "");
}

// Vazio é vazio.
conferir("string vazia não encaminha", lerRespostaAoPaciente("").duvidaEncaminhada, "");

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da dúvida encaminhada`);
