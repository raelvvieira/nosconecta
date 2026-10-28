// Checagens do filtro de emoji da Luna.
//
// O que importa: um sorriso de vez em quando, nunca a cada mensagem, e o texto
// continuar lendo certo quando o emoji que fazia papel de ponto sai.
import { emojiNaMedida, temEmoji } from "../supabase/functions/_shared/emoji-na-medida.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── Sem emoji, a mensagem passa idêntica ────────────────────────────────
conferir(
  "texto sem emoji não é tocado",
  emojiNaMedida("Tenho  terça às 14h30.", ["Oi 😊"]),
  "Tenho  terça às 14h30.",
);

// ── Primeira resposta: fica um ──────────────────────────────────────────
conferir(
  "abertura mantém o sorriso",
  emojiNaMedida(
    "Oii, aqui é a Luna, auxiliar da Dra. Mariane 😊 Qual procedimento você quer avaliar?",
  ),
  "Oii, aqui é a Luna, auxiliar da Dra. Mariane 😊 Qual procedimento você quer avaliar?",
);
conferir(
  "dois emojis viram um",
  emojiNaMedida("Marcado! Terça às 14h30 😊 Qualquer coisa é só chamar 💛", []),
  "Marcado! Terça às 14h30 😊 Qualquer coisa é só chamar",
);

// ── Sorriu há pouco: sai, e o ponto entra no lugar ──────────────────────
const sorriu = ["Você já fez clareamento alguma vez?", "Oii, aqui é a Luna 😊"];
conferir(
  "emoji entre frases vira ponto",
  emojiNaMedida("Ah, você já fez clareamento caseiro 😊 Você é de Florianópolis?", sorriu),
  "Ah, você já fez clareamento caseiro. Você é de Florianópolis?",
);
conferir(
  "emoji no fim só sai",
  emojiNaMedida("Qualquer coisa, é só chamar aqui 💛", sorriu),
  "Qualquer coisa, é só chamar aqui",
);
conferir(
  "emoji depois de pontuação não duplica o ponto",
  emojiNaMedida("Combinado! 😊 Até terça.", sorriu),
  "Combinado! Até terça.",
);
conferir(
  "emoji antes de minúscula não inventa ponto",
  emojiNaMedida("Claro 😊 e fica tranquila", sorriu),
  "Claro e fica tranquila",
);
conferir(
  "emoji sozinho na linha não deixa linha suja",
  emojiNaMedida("Perfeito\n😊\nTe espero terça", sorriu),
  "Perfeito\n\nTe espero terça",
);

// ── A janela: duas respostas sem emoji liberam o próximo ────────────────
conferir(
  "duas respostas limpas liberam",
  emojiNaMedida("Fechado 😊", ["Tenho terça às 14h30.", "Você é de Florianópolis?", "Oi 😊"]),
  "Fechado 😊",
);
conferir(
  "a penúltima com emoji ainda segura",
  emojiNaMedida("Fechado 😊", ["Tenho terça às 14h30.", "Oi 😊"]),
  "Fechado",
);

// ── Emojis compostos saem inteiros ──────────────────────────────────────
conferir(
  "tom de pele e junção saem juntos",
  emojiNaMedida("A Dra. Mariane te atende 👩🏻‍⚕️", sorriu),
  "A Dra. Mariane te atende",
);
conferir("seletor de variação sai junto", emojiNaMedida("Obrigada ❤️", sorriu), "Obrigada");
conferir(
  "reticências ficam inteiras",
  emojiNaMedida("Entendi... 😊 Vamos ver", sorriu),
  "Entendi... Vamos ver",
);
conferir("temEmoji reconhece", temEmoji("Oi 😊"), true);
conferir("temEmoji não confunde número", temEmoji("R$ 1.280,00 em 4x #1"), false);

if (falhas.length) {
  console.error(`emoji-na-medida: ${falhas.length} falha(s)\n` + falhas.join("\n"));
  process.exit(1);
}
console.log(`emoji-na-medida: ${ok} checagens ok`);
