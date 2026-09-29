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
  { waMessageId: "3EB0AAA", texto: "Oi Gabriela! Que bom te ver por aqui 😊" },
  {
    waMessageId: "3EB0BBB",
    texto: "Tenho dois horários: amanhã às 10:00 ou quinta às 14:30. Qual fica melhor?",
  },
];

/** O mesmo, sem id: é o que está gravado para o que a IA mandou antes de a
 *  coluna existir. A comparação por texto tem de continuar valendo. */
const MANDEI_SEM_ID = MANDEI.map((m) => ({ waMessageId: null, texto: m.texto }));

// ── O caso que importa ───────────────────────────────────────────────────
conferir(
  "reconhece a frase que acabou de mandar",
  ehEcoDaPropriaIa(MANDEI[0].texto, MANDEI_SEM_ID),
  true,
);
conferir("reconhece a segunda frase", ehEcoDaPropriaIa(MANDEI[1].texto, MANDEI_SEM_ID), true);
conferir(
  "mensagem de uma pessoa da recepção não é eco",
  ehEcoDaPropriaIa("Oi Gabriela, aqui é a Ana da NÓS!", MANDEI_SEM_ID),
  false,
);

// ── Normalização ─────────────────────────────────────────────────────────
conferir(
  "espaço a mais no meio não desfaz o reconhecimento",
  ehEcoDaPropriaIa("Oi  Gabriela! Que bom te ver por aqui 😊", MANDEI_SEM_ID),
  true,
);
conferir(
  "espaço nas pontas não desfaz",
  ehEcoDaPropriaIa("  Oi Gabriela! Que bom te ver por aqui 😊  ", MANDEI_SEM_ID),
  true,
);
conferir(
  "quebra de linha vira espaço dos dois lados",
  ehEcoDaPropriaIa("Oi Gabriela!\nQue bom te ver por aqui 😊", [
    { waMessageId: null, texto: "Oi Gabriela! Que bom te ver por aqui 😊" },
  ]),
  true,
);
conferir(
  "maiúscula não desfaz",
  ehEcoDaPropriaIa("OI GABRIELA! QUE BOM TE VER POR AQUI 😊", MANDEI_SEM_ID),
  true,
);
// Acento NÃO é ignorado: é frase contra frase, e uma frase sem acento é outra
// frase — quase certamente digitada por uma pessoa.
conferir(
  "acento diferente não conta como eco",
  ehEcoDaPropriaIa(
    "Tenho dois horarios: amanha às 10:00 ou quinta às 14:30. Qual fica melhor?",
    MANDEI_SEM_ID,
  ),
  false,
);

// ── Vazio ────────────────────────────────────────────────────────────────
conferir("mensagem sem texto nunca é eco", ehEcoDaPropriaIa(null, MANDEI_SEM_ID), false);
conferir("mensagem vazia nunca é eco", ehEcoDaPropriaIa("   ", MANDEI_SEM_ID), false);
conferir(
  "mensagem vazia não casa com envio vazio",
  ehEcoDaPropriaIa("", [{ waMessageId: null, texto: "" }]),
  false,
);
conferir("sem nada enviado, nada é eco", ehEcoDaPropriaIa("Oi!", []), false);

// ── Só pedaço, e pedaço a mais ───────────────────────────────────────────
//
// A resposta sai segmentada e CADA pedaço é registrado sozinho. Então o eco que
// volta é um pedaço inteiro, nunca meio pedaço nem dois juntos.
conferir("pedaço parcial não é eco", ehEcoDaPropriaIa("Oi Gabriela!", MANDEI_SEM_ID), false);
conferir(
  "dois pedaços juntos não são eco",
  ehEcoDaPropriaIa(MANDEI.map((m) => m.texto).join(" "), MANDEI_SEM_ID),
  false,
);

// ── O id, que é prova e não indício ──────────────────────────────────────
//
// A comparação por texto erra quando a recepção repete uma frase da IA, e
// depende de a Evolution continuar não devolvendo eco das mensagens da própria
// API — comportamento de fornecedor, que muda sem aviso. O id não depende de
// nada disso: a Evolution o devolve no instante do envio e a IA o guarda.
conferir("id que eu mandei é meu", ehEcoDaPropriaIa("qualquer texto", MANDEI, "3EB0BBB"), true);
conferir(
  "id que eu não mandei é de outra pessoa",
  ehEcoDaPropriaIa("Oi, aqui é a Dra. Mariane", MANDEI, "2AC0999"),
  false,
);
// O id manda, mesmo quando o texto não bate.
conferir("id vence texto diferente", ehEcoDaPropriaIa("texto que mudou", MANDEI, "3EB0AAA"), true);
// E o texto continua valendo quando não há id — a rede para o que foi enviado
// antes desta coluna existir.
conferir(
  "sem id, o texto ainda reconhece",
  ehEcoDaPropriaIa(MANDEI[0].texto, MANDEI_SEM_ID, null),
  true,
);
conferir(
  "id desconhecido não impede o texto de reconhecer",
  ehEcoDaPropriaIa(MANDEI[0].texto, MANDEI_SEM_ID, "2AC0999"),
  true,
);
// O caso real de 29/09: a Dra. digitou do celular. Id diferente, texto
// diferente — tem de ser lida como pessoa, e é isso que marca o takeover.
conferir(
  "a mensagem da dentista não é eco",
  ehEcoDaPropriaIa("Oii", MANDEI, "2ACA8EC04175961D77F2"),
  false,
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do histórico da clínica`);
