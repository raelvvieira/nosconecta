// Checagens do reconhecimento da própria resposta.
//
// ── Por que esta é a checagem que impede o pior defeito ─────────────────
//
// A Evolution devolve pelo webhook tudo que o número manda, inclusive o que a
// IA mandou: 830 mensagens `fromMe` chegaram por esse caminho até 27/09. Sem
// reconhecer a própria resposta, ela voltava como "mensagem da própria clínica"
// — o motivo que `atender` transforma em `human_took_over_at`. A IA respondia
// uma vez, marcava a conversa como assumida por uma recepcionista que nunca
// existiu, e se calava para sempre.
//
// Os modos de errar:
//
//   **Comparar cru.** O WhatsApp devolve o texto como o recebeu; uma diferença
//   de um espaço faria a IA achar que uma pessoa assumiu a conversa.
//
//   **Casar vazio com vazio.** Foto e áudio chegam sem texto. Se mensagem sem
//   texto casasse com um envio vazio, qualquer figurinha da recepção seria lida
//   como eco e a pessoa que assumiu a conversa passaria batida.
//
//   **Tirar acento.** Aqui se compara uma frase inteira com ela mesma, não se
//   procura palavra: "voce" não é o que a IA mandou se ela escreveu "você".
import { ehEcoDaPropriaIa } from "../supabase/functions/_shared/historico-da-clinica.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const MANDEI = [
  "Oi Gabriela! Que bom te ver por aqui 😊",
  "Tenho dois horários: amanhã às 10:00 ou quinta às 14:30. Qual fica melhor?",
];

// ── O caso que importa ───────────────────────────────────────────────────
conferir("reconhece a frase que acabou de mandar", ehEcoDaPropriaIa(MANDEI[0], MANDEI), true);
conferir("reconhece a segunda frase", ehEcoDaPropriaIa(MANDEI[1], MANDEI), true);
conferir(
  "mensagem de uma pessoa da recepção não é eco",
  ehEcoDaPropriaIa("Oi Gabriela, aqui é a Ana da NÓS!", MANDEI),
  false,
);

// ── Normalização ─────────────────────────────────────────────────────────
conferir(
  "espaço a mais no meio não desfaz o reconhecimento",
  ehEcoDaPropriaIa("Oi  Gabriela! Que bom te ver por aqui 😊", MANDEI),
  true,
);
conferir(
  "espaço nas pontas não desfaz",
  ehEcoDaPropriaIa("  Oi Gabriela! Que bom te ver por aqui 😊  ", MANDEI),
  true,
);
conferir(
  "quebra de linha vira espaço dos dois lados",
  ehEcoDaPropriaIa("Oi Gabriela!\nQue bom te ver por aqui 😊", [
    "Oi Gabriela! Que bom te ver por aqui 😊",
  ]),
  true,
);
conferir(
  "maiúscula não desfaz",
  ehEcoDaPropriaIa("OI GABRIELA! QUE BOM TE VER POR AQUI 😊", MANDEI),
  true,
);
// Acento NÃO é ignorado: é frase contra frase, e uma frase sem acento é outra
// frase — quase certamente digitada por uma pessoa.
conferir(
  "acento diferente não conta como eco",
  ehEcoDaPropriaIa(
    "Tenho dois horarios: amanha às 10:00 ou quinta às 14:30. Qual fica melhor?",
    MANDEI,
  ),
  false,
);

// ── Vazio ────────────────────────────────────────────────────────────────
conferir("mensagem sem texto nunca é eco", ehEcoDaPropriaIa(null, MANDEI), false);
conferir("mensagem vazia nunca é eco", ehEcoDaPropriaIa("   ", MANDEI), false);
conferir("mensagem vazia não casa com envio vazio", ehEcoDaPropriaIa("", ["", "  "]), false);
conferir("sem nada enviado, nada é eco", ehEcoDaPropriaIa("Oi!", []), false);

// ── Só pedaço, e pedaço a mais ───────────────────────────────────────────
//
// A resposta sai segmentada e CADA pedaço é registrado sozinho. Então o eco que
// volta é um pedaço inteiro, nunca meio pedaço nem dois juntos.
conferir("pedaço parcial não é eco", ehEcoDaPropriaIa("Oi Gabriela!", MANDEI), false);
conferir("dois pedaços juntos não são eco", ehEcoDaPropriaIa(MANDEI.join(" "), MANDEI), false);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do histórico da clínica`);
