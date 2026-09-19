// Checagens da junção da thread de um número.
//
// As duas formas de errar aqui são silenciosas: mensagem repetida parece
// mensagem enviada duas vezes, e ordem errada faz a conversa de agosto
// aparecer depois da de setembro.
import { juntarMensagens } from "../src/lib/atendimentos/thread.ts";
import type { MessageRow } from "../src/lib/atendimentos/atendimentos.functions.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

function msg(id: string, timestamp: string, body = id): MessageRow {
  return {
    id,
    fromMe: false,
    body,
    attachments: [],
    status: "received",
    timestamp,
    isPrivate: false,
  };
}

// ── Ordem de tempo, atravessando as conversas ────────────────────────────
// As partes chegam agrupadas por conversa; emendadas sem ordenar, a antiga
// apareceria depois da nova.
conferir(
  "intercala as duas conversas",
  juntarMensagens([
    [msg("a1", "2026-08-10T10:00:00Z"), msg("a2", "2026-09-19T09:00:00Z")],
    [msg("b1", "2026-08-15T10:00:00Z"), msg("b2", "2026-09-01T10:00:00Z")],
  ]).map((m) => m.id),
  ["a1", "b1", "b2", "a2"],
);

// ── Sem repetir ──────────────────────────────────────────────────────────
// A mesma mensagem chega por dois caminhos: o CRM devolve a thread e o
// espelho guarda uma cópia dela.
conferir(
  "mesma mensagem nos dois lados aparece uma vez",
  juntarMensagens([[msg("x", "2026-09-19T10:00:00Z")], [msg("x", "2026-09-19T10:00:00Z")]]).length,
  1,
);
// Quem vence é a última parte — a mais confiável é passada por último.
conferir(
  "a última versão vence",
  juntarMensagens([
    [msg("x", "2026-09-19T10:00:00Z", "parcial")],
    [msg("x", "2026-09-19T10:00:00Z", "completa")],
  ])[0].body,
  "completa",
);

// ── Bordas ───────────────────────────────────────────────────────────────
conferir("nenhuma parte", juntarMensagens([]), []);
conferir("partes vazias", juntarMensagens([[], []]), []);
conferir(
  "uma parte só passa inteira",
  juntarMensagens([[msg("a", "2026-09-19T10:00:00Z"), msg("b", "2026-09-19T11:00:00Z")]]).map(
    (m) => m.id,
  ),
  ["a", "b"],
);
// Mensagem sem data vai para o começo, não para um lugar sorteado.
conferir(
  "sem data fica no começo",
  juntarMensagens([
    [msg("com", "2026-09-19T10:00:00Z")],
    [{ ...msg("sem", "2026-01-01T00:00:00Z"), timestamp: "" }],
  ]).map((m) => m.id),
  ["sem", "com"],
);
// Mesmo instante: a ordem não pode embaralhar o que já estava junto.
conferir(
  "mesmo instante mantém a ordem de entrada",
  juntarMensagens([[msg("p", "2026-09-19T10:00:00Z"), msg("q", "2026-09-19T10:00:00Z")]]).map(
    (m) => m.id,
  ),
  ["p", "q"],
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da thread de um número`);
