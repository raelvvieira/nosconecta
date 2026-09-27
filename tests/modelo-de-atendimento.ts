// Checagens do cliente da OpenAI.
//
// A troca de provedor não é "outro endereço": são duas exigências da API que,
// erradas, derrubam funcionalidades inteiras sem dizer o porquê.
//
//   **O modo estrito recusa palavras de JSON Schema.** `FORMATO_DAS_SUGESTOES`
//   pede `maxItems: 3` e `FORMATO_DO_MANUAL` pede `minItems: 0`. Mandados como
//   estão, a API devolve 400 — e aí o aprendizado e os cards verdes do chat
//   morrem juntos, com um erro que não diz qual palavra ofendeu.
//
//   **O teto de tokens mudou de nome.** Modelos novos recusam `max_tokens` e
//   exigem `max_completion_tokens`; antigos fazem o contrário. Como o modelo é
//   escolhido pela clínica numa lista da própria conta, os dois casos existem.
//
// E uma terceira, silenciosa: recusa do modelo NÃO pode virar mensagem para o
// paciente. Um texto de recusa mandado a quem perguntou sobre limpeza é pior
// que silêncio.
import {
  ehErroDeTetoDeTokens,
  formatoDeResposta,
  paraModoEstrito,
  textoDaResposta,
} from "../supabase/functions/_shared/modelo-de-atendimento.ts";
import { FORMATO_DAS_SUGESTOES } from "../supabase/functions/_shared/sugestoes-de-fala.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── As palavras que a OpenAI recusa ─────────────────────────────────────
{
  const traduzido = paraModoEstrito({
    type: "object",
    properties: {
      lista: { type: "array", minItems: 0, maxItems: 3, items: { type: "string", maxLength: 40 } },
      texto: { type: "string", pattern: "^x" },
    },
  }) as any;
  conferir("minItems sai", "minItems" in traduzido.properties.lista, false);
  conferir("maxItems sai", "maxItems" in traduzido.properties.lista, false);
  conferir(
    "maxLength sai, no fundo do aninhamento",
    "maxLength" in traduzido.properties.lista.items,
    false,
  );
  conferir("pattern sai", "pattern" in traduzido.properties.texto, false);
  // O que importa fica.
  conferir("o tipo fica", traduzido.properties.lista.type, "array");
  conferir("os items ficam", traduzido.properties.lista.items.type, "string");
}

// ── `required` passa a cobrir tudo ──────────────────────────────────────
// No modo estrito não existe campo opcional: a API recusa um objeto cujo
// `required` não cubra o `properties` inteiro. Quem escreve o esquema não
// precisa lembrar disso.
{
  const t = paraModoEstrito({
    type: "object",
    required: ["a"],
    properties: { a: { type: "string" }, b: { type: "string" }, c: { type: "string" } },
  }) as any;
  conferir("required cobre todas as propriedades", t.required, ["a", "b", "c"]);
  conferir("additionalProperties é negado", t.additionalProperties, false);
}

// O esquema de verdade das sugestões atravessa a tradução sem sobrar palavra
// recusada em lugar nenhum — é a checagem que prova o caso real, não um
// exemplo de laboratório.
{
  const json = JSON.stringify(formatoDeResposta(FORMATO_DAS_SUGESTOES, "sugestoes"));
  for (const palavra of ["minItems", "maxItems", "maxLength", "pattern"]) {
    conferir(`o esquema real sai sem ${palavra}`, json.includes(palavra), false);
  }
  const envelope = formatoDeResposta(FORMATO_DAS_SUGESTOES, "sugestoes") as any;
  conferir("o envelope é json_schema", envelope.type, "json_schema");
  conferir("com nome", envelope.json_schema.name, "sugestoes");
  conferir("e estrito", envelope.json_schema.strict, true);
  // A lista continua exigida pelo esquema, só sem o teto de tamanho — que o
  // consumidor corta com `slice(0, QUANTAS_SUGESTOES)`.
  conferir(
    "sugestoes continua no required",
    envelope.json_schema.schema.required.includes("sugestoes"),
    true,
  );
}

// Tipos que não são objeto passam intactos.
conferir("texto passa", paraModoEstrito("oi"), "oi");
conferir("número passa", paraModoEstrito(3), 3);
conferir("nulo passa", paraModoEstrito(null), null);
conferir("lista de valores passa", paraModoEstrito(["a", "b"]), ["a", "b"]);

// ── O teto de tokens que mudou de nome ──────────────────────────────────
conferir(
  "reconhece o pedido de trocar o parâmetro",
  ehErroDeTetoDeTokens(
    "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
  ),
  true,
);
conferir(
  "e o contrário também",
  ehErroDeTetoDeTokens("Unsupported parameter: 'max_completion_tokens' is not supported."),
  true,
);
// O que NÃO pode virar segunda tentativa: repetir uma chamada que falhou por
// outro motivo dobra o custo de um erro de verdade.
conferir("chave inválida não repete", ehErroDeTetoDeTokens("Incorrect API key provided"), false);
conferir(
  "modelo inexistente não repete",
  ehErroDeTetoDeTokens("The model `nao-existe` does not exist"),
  false,
);
conferir(
  "cota estourada não repete",
  ehErroDeTetoDeTokens("You exceeded your current quota"),
  false,
);
conferir("mensagem vazia não repete", ehErroDeTetoDeTokens(""), false);

// ── A recusa não vira mensagem ──────────────────────────────────────────
conferir(
  "texto normal sai limpo",
  textoDaResposta({ choices: [{ message: { content: "  Oi! Tudo bem?  " } }] }),
  "Oi! Tudo bem?",
);
conferir(
  "recusa vira vazio, mesmo com conteúdo ao lado",
  textoDaResposta({
    choices: [{ message: { refusal: "não posso ajudar com isso", content: "texto qualquer" } }],
  }),
  "",
);
conferir("resposta sem escolhas vira vazio", textoDaResposta({ choices: [] }), "");
conferir("resposta nula vira vazio", textoDaResposta(null), "");
conferir(
  "conteúdo que não é texto vira vazio",
  textoDaResposta({ choices: [{ message: { content: 42 } }] }),
  "",
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do cliente da OpenAI`);
