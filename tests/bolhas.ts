// A resposta da Luna em bolhas (V4.2, seção E12).
//
// O que não pode acontecer: o JSON chegar ao paciente, uma resposta no
// formato antigo se perder, ou a junção das bolhas virar outro texto.
import { lerRespostaAoPaciente } from "../supabase/functions/_shared/modelo-de-atendimento.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const base = {
  horarioFechado: "",
  casoEnviado: "",
  duvidaEncaminhada: "",
  cidadeConfirmada: "",
  estadoDaConversa: "ACTIVE_CONVERSATION_DROP",
  perguntaAberta: "",
  retornoCombinado: "",
};

const duas = lerRespostaAoPaciente(
  JSON.stringify({
    ...base,
    bolhas: [
      "Oii, aqui é a Luna, auxiliar da Dra. Mariane.",
      "Qual procedimento você quer avaliar?",
    ],
  }),
);
conferir("lê as bolhas", duas.bolhas.length, 2);
conferir(
  "o texto é a junção",
  duas.texto,
  "Oii, aqui é a Luna, auxiliar da Dra. Mariane.\n\nQual procedimento você quer avaliar?",
);
conferir("e os campos seguem", duas.estadoDaConversa, "ACTIVE_CONVERSATION_DROP");

const vazias = lerRespostaAoPaciente(JSON.stringify({ ...base, bolhas: ["", "  ", "Oi!"] }));
conferir("bolha vazia sai", vazias.bolhas, ["Oi!"]);

const antiga = lerRespostaAoPaciente(JSON.stringify({ ...base, resposta: "Formato antigo." }));
conferir("formato antigo ainda vale", antiga.bolhas, ["Formato antigo."]);

const cru = lerRespostaAoPaciente("Texto solto, sem JSON.");
conferir("texto cru vira uma bolha", cru.bolhas, ["Texto solto, sem JSON."]);

const semNada = lerRespostaAoPaciente(JSON.stringify({ ...base, bolhas: [] }));
conferir("JSON sem fala não vai para o paciente", [semNada.texto, semNada.bolhas], ["", []]);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`bolhas: ${ok} checagens ok`);
