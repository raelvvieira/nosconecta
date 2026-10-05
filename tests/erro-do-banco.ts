import { ehChaveDuplicada, CHAVE_DUPLICADA } from "../src/lib/finance/erro-do-banco";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  if (real !== esperado) {
    console.error(`FALHOU ${oQue}: esperava ${String(esperado)}, veio ${String(real)}`);
    process.exit(1);
  }
}

// ── O que É duplicata ───────────────────────────────────────────────────────

conferir("código em string", ehChaveDuplicada({ code: "23505" }), true);
conferir("código em número", ehChaveDuplicada({ code: 23505 }), true);
conferir("a constante exportada", ehChaveDuplicada({ code: CHAVE_DUPLICADA }), true);
conferir(
  "erro do PostgREST completo",
  ehChaveDuplicada({
    code: "23505",
    details: "Key (owner_id, source_type, source_id)=(…) already exists.",
    message: 'duplicate key value violates unique constraint "idx_lancamento_por_origem"',
  }),
  true,
);
conferir(
  "Error embalado, com o texto do Postgres",
  ehChaveDuplicada(
    new Error('duplicate key value violates unique constraint "idx_lancamento_por_origem"'),
  ),
  true,
);
conferir(
  "Error embalado, com o código no texto",
  ehChaveDuplicada(new Error("23505: conflito")),
  true,
);
conferir(
  "texto em maiúsculas",
  ehChaveDuplicada(new Error("DUPLICATE KEY VALUE VIOLATES UNIQUE CONSTRAINT")),
  true,
);

// ── O que NÃO é, e precisa continuar subindo ────────────────────────────────
//
// Este é o lado que importa: engolir um erro de verdade como se fosse
// duplicata faria o recebimento desaparecer sem ninguém saber.

conferir("nulo", ehChaveDuplicada(null), false);
conferir("indefinido", ehChaveDuplicada(undefined), false);
conferir("texto solto", ehChaveDuplicada("23505"), false);
conferir("número solto", ehChaveDuplicada(23505), false);
conferir("objeto vazio", ehChaveDuplicada({}), false);
conferir("violação de NOT NULL", ehChaveDuplicada({ code: "23502" }), false);
conferir("violação de chave estrangeira", ehChaveDuplicada({ code: "23503" }), false);
conferir("violação de CHECK", ehChaveDuplicada({ code: "23514" }), false);
conferir("recusa da política de RLS", ehChaveDuplicada({ code: "42501" }), false);
conferir(
  "erro de permissão com mensagem",
  ehChaveDuplicada({ code: "42501", message: "new row violates row-level security policy" }),
  false,
);
conferir("mensagem sem código nem texto", ehChaveDuplicada(new Error("timeout")), false);
conferir("code vazio", ehChaveDuplicada({ code: "" }), false);
// O código não pode casar por estar CONTIDO em outro código.
conferir("código parecido", ehChaveDuplicada({ code: "235051" }), false);

console.log(`ok — ${feitas} checagens do erro de chave duplicada`);
