// Checagens do detector de "a migration do cartão ainda não rodou".
//
// Esta suíte existe porque a primeira versão do detector ERROU na prática: ela
// só conhecia o dialeto do Postgres (`42P01`, "does not exist"), e o que chega
// ao app vem do PostgREST, que diz outra coisa — `PGRST205`, "Could not find
// the table 'public.credit_cards' in the schema cache". O resultado foi o erro
// cru vazando para a tela de quem só queria cadastrar um cartão.
import {
  ERRO_DE_MIGRACAO_PENDENTE,
  tabelaDeCartaoAusente,
  traduzirErroDeCartao,
} from "../src/lib/finance/schema-cartao.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── O caso real que escapou ──────────────────────────────────────────────
conferir(
  "PostgREST: tabela fora do cache de esquema",
  tabelaDeCartaoAusente({
    code: "PGRST205",
    message: "Could not find the table 'public.credit_cards' in the schema cache",
  }),
  true,
);
// Mesmo sem o código, a frase basta — um cliente novo pode trocar um sem trocar
// a outra.
conferir(
  "só a frase do PostgREST, sem código",
  tabelaDeCartaoAusente({
    message: "Could not find the table 'public.card_invoices' in the schema cache",
  }),
  true,
);
conferir("só o código do PostgREST, sem frase", tabelaDeCartaoAusente({ code: "PGRST205" }), true);

// ── O dialeto do Postgres cru, que já funcionava ─────────────────────────
conferir(
  "Postgres: relation does not exist",
  tabelaDeCartaoAusente({
    code: "42P01",
    message: 'relation "public.credit_cards" does not exist',
  }),
  true,
);
conferir("Postgres: só o código 42P01", tabelaDeCartaoAusente({ code: "42P01" }), true);

// ── Coluna ausente conta igual: a migration é a mesma ────────────────────
conferir(
  "PostgREST: coluna fora do cache",
  tabelaDeCartaoAusente({
    code: "PGRST204",
    message:
      "Could not find the 'card_invoice_id' column of 'financial_transactions' in the schema cache",
  }),
  true,
);
conferir("Postgres: coluna não existe", tabelaDeCartaoAusente({ code: "42703" }), true);

// ── O que NÃO pode ser confundido com migration pendente ─────────────────
// Confundir aqui é pior do que o bug original: mandaria a pessoa rodar
// migration por causa de um erro de permissão ou de rede, e ela acharia que o
// sistema está quebrado.
conferir(
  "violação de RLS não é migration",
  tabelaDeCartaoAusente({ code: "42501", message: "permission denied" }),
  false,
);
conferir(
  "chave duplicada não é migration",
  tabelaDeCartaoAusente({ code: "23505", message: "duplicate key value" }),
  false,
);
conferir(
  "violação de FK não é migration",
  tabelaDeCartaoAusente({ code: "23503", message: "violates foreign key constraint" }),
  false,
);
conferir(
  "erro de rede não é migration",
  tabelaDeCartaoAusente({ message: "Failed to fetch" }),
  false,
);
conferir("erro sem nada dentro", tabelaDeCartaoAusente({}), false);
conferir("nulo não é erro", tabelaDeCartaoAusente(null), false);
conferir("indefinido não é erro", tabelaDeCartaoAusente(undefined), false);

// ── A tradução ───────────────────────────────────────────────────────────
conferir(
  "erro de migration vira a instrução do Lovable",
  traduzirErroDeCartao({
    code: "PGRST205",
    message: "Could not find the table 'public.credit_cards'",
  }).message,
  ERRO_DE_MIGRACAO_PENDENTE,
);
// Qualquer outro erro sobe com a mensagem original: escondê-la atrás de um
// texto genérico tiraria a única pista de quem for depurar.
conferir(
  "outro erro preserva a mensagem original",
  traduzirErroDeCartao({ code: "23505", message: "duplicate key value" }).message,
  "duplicate key value",
);
conferir(
  "erro sem mensagem ganha um texto legível",
  traduzirErroDeCartao({}).message,
  "Falha ao salvar o cartão.",
);
conferir(
  "a instrução cita o comando exato do Lovable",
  ERRO_DE_MIGRACAO_PENDENTE.includes("Apply pending Supabase migrations"),
  true,
);

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do detector de migration pendente`);
