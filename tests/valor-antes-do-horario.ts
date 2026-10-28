// O horário não sai antes do valor, e a microqualificação continua.
//
// O caso que motivou: Camily, 28/10. "Quero agendar uma avaliação!",
// "Clareamento dentário", "Florianópolis", e a Luna mandou dois horários sem
// nunca ter dito o valor; a Dra. Mariane entrou para mandar a tabela.
//
// Duas coisas são conferidas:
//   - a instrução (regra nº 8) tem os dois caminhos e preserva o que já valia:
//     primeira resposta sem preço, microqualificação no caminho exploratório,
//     preço perguntado não é pedido de agendamento;
//   - a rede do atendimento reconhece "horário antes do valor" nas falas reais,
//     e não confunde duração ("6 horas") com oferta de horário.
import {
  CORRECAO_VALOR_ANTES_DO_HORARIO,
  horarioAntesDoValor,
  informaValor,
  ofereceHorario,
} from "../supabase/functions/_shared/valor-antes-do-horario.ts";
import { montarInstrucao } from "../supabase/functions/_shared/instrucao-do-agente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── A conversa da Camily, como foi ───────────────────────────────────────
const ABERTURA =
  "Oii, aqui é a Luna, auxiliar da Dra. Mariane 😊 Qual procedimento ou questão você quer avaliar?";
const CIDADE = "Você é de Porto Alegre, né?";
const HORARIOS =
  "Tenho quarta-feira, 28/10, às 17h ou 17h30, na NÓS Florianópolis. Qual horário fica melhor?";

conferir(
  "Camily: dois horários sem valor nenhum antes é barrado",
  horarioAntesDoValor(HORARIOS, [ABERTURA, CIDADE]),
  true,
);

// ── Como deveria ter sido (caminho 2) ────────────────────────────────────
const VALOR_E_CIDADE =
  "O clareamento em consultório fica R$ 600, com limpeza completa e 2 sessões, em até 10x. A avaliação com a Dra. Mariane é sem custo. Você é de Florianópolis ou Porto Alegre?";
conferir(
  "caminho 2: valor junto da pergunta da cidade não é horário",
  ofereceHorario(VALOR_E_CIDADE),
  false,
);
conferir(
  "caminho 2: depois do valor, os dois horários passam",
  horarioAntesDoValor(HORARIOS, [ABERTURA, VALOR_E_CIDADE]),
  false,
);
conferir(
  "caminho 2: valor e horários na mesma mensagem, cidade já confirmada, passam",
  horarioAntesDoValor(
    "O clareamento em consultório fica R$ 600, em até 10x, e a avaliação é sem custo. Tenho quarta às 17h ou quinta às 9h30 na NÓS Florianópolis. Qual fica melhor?",
    [ABERTURA],
  ),
  false,
);
conferir(
  "a tabela mandada pela equipe também conta como valor recebido",
  horarioAntesDoValor(HORARIOS, [ABERTURA, "✨🦷 Combo clareamento + limpeza: Por 399,00 reais"]),
  false,
);
conferir(
  "valor que depende da avaliação conta, sem inventar orçamento",
  horarioAntesDoValor(HORARIOS, [
    ABERTURA,
    "Nesse procedimento o valor depende da quantidade e da região, e é passado depois da avaliação, que é sem custo.",
  ]),
  false,
);

// ── Caminho 1: quem está conhecendo não recebe horário ainda ─────────────
conferir(
  "caminho 1: valor sem horário não aciona nada",
  horarioAntesDoValor("O combo fica R$ 399, em até 10x. Você já fez clareamento alguma vez?", [
    ABERTURA,
  ]),
  false,
);

// ── O que NÃO é oferta de horário ────────────────────────────────────────
for (const t of [
  "O efeito do clareamento aparece em poucos dias e dura meses.",
  "O gel é usado por cerca de 3 horas por dia durante 1 mês.",
  "Atendemos até as 19h.",
  "A sessão leva umas 2 horas.",
]) {
  conferir(`não é oferta: ${t}`, ofereceHorario(t), false);
}
for (const t of [
  "Tenho amanhã às 9h ou às 14h30.",
  "Consigo sexta, 30/10, às 10:00.",
  "Tem hoje às 17h, serve?",
]) {
  conferir(`é oferta: ${t}`, ofereceHorario(t), true);
}

// ── O que conta como valor ───────────────────────────────────────────────
conferir(
  "'avaliação gratuita' sozinha não é valor",
  informaValor("A avaliação é gratuita 😊"),
  false,
);
conferir("R$ é valor", informaValor("Fica R$600 à vista"), true);
conferir("reais é valor", informaValor("fica 790 reais"), true);
conferir(
  "'o orçamento é passado depois da avaliação' é valor dependente",
  informaValor("O orçamento é passado depois da avaliação com a Dra."),
  true,
);

// ── O recado da segunda tentativa ────────────────────────────────────────
for (const trecho of ["regra nº 8", "sem custo", "pergunte a cidade", "sem inventar orçamento"]) {
  conferir(`correção diz: ${trecho}`, CORRECAO_VALOR_ANTES_DO_HORARIO.includes(trecho), true);
}

// ── A instrução: os dois caminhos, e o que não podia se perder ───────────
{
  const t = montarInstrucao({ clinica: "NÓS Odontologia", manual: {}, procedimentos: [] });
  for (const trecho of [
    "VALOR ANTES DE HORÁRIO",
    "A primeira resposta continua SEM preço",
    "CAMINHO 1",
    "microqualificação curta",
    "se já fez antes",
    "Perguntar preço NÃO é pedir para marcar",
    "Preço e horário NUNCA",
    "CAMINHO 2",
    "Não transforme essa pessoa num",
    "A avaliação é sem custo; o procedimento é pago",
    "Uma oferta pertinente",
    "não mande todas as modalidades",
    "sem inventar orçamento",
    "Se o valor já está acima marcado com VOCÊ, não repita",
    "Quero agendar uma avaliação",
  ]) {
    conferir(`regra 8 traz: ${trecho}`, t.includes(trecho), true);
  }
  conferir(
    "a regra 8 fica entre as invioláveis, depois do manual",
    t.indexOf("VALOR ANTES DE HORÁRIO") > t.indexOf("REGRAS QUE VOCÊ NUNCA PODE QUEBRAR"),
    true,
  );
}

if (falhas.length) {
  console.error(`valor-antes-do-horario: ${falhas.length} falha(s)\n` + falhas.join("\n"));
  process.exit(1);
}
console.log(`valor-antes-do-horario: ${ok} checagens ok`);
