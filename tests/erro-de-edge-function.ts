// Checagens da mensagem de erro de Edge Function.
//
// O caso que motivou: "Falha na conexão (404)" na tela de conectar o
// WhatsApp. O 404 vinha do roteador do Supabase — a função não estava
// publicada —, mas a tela mostrava só o número, e 404 não diz a ninguém que
// falta publicar.
import { erroDaEdgeFunction } from "../src/lib/atendimentos/erro-de-edge-function.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (obtido === esperado) ok++;
  else falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// O caso real, com o corpo exato que o Supabase devolve.
conferir(
  "404 diz o que fazer",
  erroDaEdgeFunction("wa-conexao", 404, {
    code: "NOT_FOUND",
    message: "Requested function was not found",
  }).message,
  'A função "wa-conexao" ainda não foi publicada. No Lovable: "Deploy the wa-conexao edge function" e depois Publish.',
);
// O nome entra na mensagem: é ele que vai no prompt do Lovable.
conferir(
  "404 de outra função",
  erroDaEdgeFunction("meta-capi", 404, {}).message,
  'A função "meta-capi" ainda não foi publicada. No Lovable: "Deploy the meta-capi edge function" e depois Publish.',
);

// Erro nosso: a mensagem da função é melhor que qualquer coisa que a gente
// escreva por cima dela.
conferir(
  "mensagem da própria função",
  erroDaEdgeFunction("crm-whatsapp", 400, { error: "ownerId e action são obrigatórios" }).message,
  "ownerId e action são obrigatórios",
);
// Algumas funções usam `message` em vez de `error`.
conferir(
  "campo message",
  erroDaEdgeFunction("x", 500, { message: "Evolution fora do ar" }).message,
  "Evolution fora do ar",
);
conferir(
  "error tem prioridade sobre message",
  erroDaEdgeFunction("x", 500, { error: "esta", message: "aquela" }).message,
  "esta",
);

// Sem corpo útil, sobra o número — mas com o nome junto, que é o que permite
// procurar no log certo.
conferir("sem corpo", erroDaEdgeFunction("wa-espelho", 500, {}).message, "Falha ao chamar wa-espelho (500).");
conferir("corpo nulo", erroDaEdgeFunction("wa-espelho", 502, null).message, "Falha ao chamar wa-espelho (502).");
// Mensagem vazia não é mensagem.
conferir("error vazio", erroDaEdgeFunction("x", 500, { error: "" }).message, "Falha ao chamar x (500).");
// Objeto no lugar de texto não pode virar "[object Object]" na tela.
conferir(
  "error que não é texto",
  erroDaEdgeFunction("x", 500, { error: { detalhe: "algo" } }).message,
  "Falha ao chamar x (500).",
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da mensagem de erro de Edge Function`);
