// Checagens da etiqueta de aviso na agenda.
//
// ── O caso real ────────────────────────────────────────────────────────
//
// 01/10: o Daniel Costa respondeu "Opa", "Tudo bem, pode ser", "To aqui em
// baixo" e "Pediram para esperar um pouco" — confirmou e depois avisou que
// tinha chegado. A agenda mostrou **"pediu remarcar"** ao lado de uma consulta
// marcada como "Confirmado", e a equipe ficou olhando para uma contradição que
// o sistema inventou.
//
// A causa: a etiqueta escrevia "pediu remarcar" para QUALQUER aviso em aberto.
// Medido na caixa inteira da clínica no mesmo dia:
//
//   23 avisos "Resposta não entendida"
//    1 aviso  "Paciente quer remarcar"
//
// Errava 23 de 24 vezes.
//
// Os modos de errar:
//
//   **Afirmar o que não se sabe.** "Pediu remarcar" é uma afirmação sobre o que
//   o paciente quer. Quando o sistema NÃO entendeu a resposta, ele não sabe.
//
//   **Classificar pelo corpo.** O corpo traz as palavras do paciente; o título
//   traz a leitura do sistema. Ler o corpo faria a etiqueta afirmar "pediu
//   remarcar" justamente nas respostas não entendidas.
//
//   **Pintar tudo de alarme.** Resposta para ler é tarefa; pedido de remarcar
//   mexe na agenda. Mesma cor nos dois ensina a ignorar a cor.
import {
  ROTULO_DO_AVISO,
  TOM_DO_AVISO,
  tipoDoAviso,
} from "../src/lib/notifications/tipo-do-aviso.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── Os dois títulos que existem de verdade na caixa ──────────────────────
conferir("o aviso do Daniel não é de remarcar", tipoDoAviso("Resposta não entendida"), "resposta");
conferir("o único de remarcar é de remarcar", tipoDoAviso("Paciente quer remarcar"), "remarcar");

// ── Outras formas de dizer a mesma coisa ─────────────────────────────────
conferir("reagendar conta", tipoDoAviso("Paciente quer reagendar"), "remarcar");
conferir("cancelar conta", tipoDoAviso("Paciente pediu para cancelar"), "remarcar");
conferir("desmarcar conta", tipoDoAviso("Vai desmarcar"), "remarcar");
conferir("sem acento também", tipoDoAviso("Paciente quer REMARCAR"), "remarcar");

// ── O padrão é o que não afirma nada ─────────────────────────────────────
conferir("título desconhecido vira resposta", tipoDoAviso("Paciente mandou foto"), "resposta");
conferir("vazio vira resposta", tipoDoAviso(""), "resposta");
conferir("nulo vira resposta", tipoDoAviso(null), "resposta");
conferir("indefinido vira resposta", tipoDoAviso(undefined), "resposta");
conferir("confirmação não é remarcar", tipoDoAviso("Agendamento confirmado"), "resposta");

// ── A decisão de ler SÓ o título ─────────────────────────────────────────
//
// O corpo de um aviso não entendido carrega o texto cru do paciente. Se a
// classificação olhasse ali, esta frase viraria "pediu remarcar" — afirmando
// com certeza justamente o que o sistema não conseguiu ler.
conferir(
  "palavra do paciente no título alheio não contamina",
  tipoDoAviso("Resposta não entendida"),
  "resposta",
);

// ── O que a tela escreve e com que cor ───────────────────────────────────
conferir("o rótulo de remarcar", ROTULO_DO_AVISO.remarcar, "pediu remarcar");
conferir("o rótulo de resposta é ação, não diagnóstico", ROTULO_DO_AVISO.resposta, "ver resposta");
conferir(
  "e a resposta não é pintada de alarme",
  TOM_DO_AVISO.resposta === TOM_DO_AVISO.remarcar,
  false,
);
conferir("remarcar usa o tom de aviso", TOM_DO_AVISO.remarcar.includes("warning"), true);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da etiqueta de aviso`);
