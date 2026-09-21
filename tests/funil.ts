// Checagens de de quem é cada card do funil.
//
// Dois jeitos de errar, os dois sem erro na tela:
//
//   Não achar o card — a pessoa está no funil e a conversa dela diz que não
//   está em etapa nenhuma. Foi o que acontecia quando o card era preso a UMA
//   conversa e a pessoa escrevia por outra.
//
//   Achar o card errado — o "Ganho" de alguém cai na negociação de outro.
import { cardDaPessoa, chaveDaPessoa, chaveDoTelefone } from "../src/lib/atendimentos/funil.ts";
import type { CardDoFunil } from "../src/lib/atendimentos/funil.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

function card(p: Partial<CardDoFunil> & { id: string }): CardDoFunil {
  return {
    id: p.id,
    type: p.type ?? "pessoa",
    itemId: p.itemId ?? "5548984195309",
    stageId: p.stageId ?? "etapa-1",
    title: p.title ?? null,
  };
}

// ── A chave do telefone ──────────────────────────────────────────────────
conferir("número completo", chaveDoTelefone("5548984195309"), "5548984195309");
conferir("sem o 55 ganha o país", chaveDoTelefone("48984195309"), "5548984195309");
conferir("com máscara", chaveDoTelefone("(48) 98419-5309"), "5548984195309");
conferir("fixo de oito dígitos", chaveDoTelefone("4832221100"), "554832221100");
conferir("vazio", chaveDoTelefone(""), null);
conferir("só espaço", chaveDoTelefone("   "), null);
conferir("nulo", chaveDoTelefone(null), null);
// Pedaço de número não pode virar chave: dois fragmentos diferentes cairiam
// na mesma e colariam duas pessoas no mesmo card.
conferir("pedaço de número não é chave", chaveDoTelefone("98419"), null);
conferir("11 dígitos sem DDD reconhecível", chaveDoTelefone("984195309"), null);

// ── Qual chave a pessoa usa ──────────────────────────────────────────────
conferir("telefone manda", chaveDaPessoa({ telefone: "5548984195309", conversaId: "abc" }), {
  type: "pessoa",
  itemId: "5548984195309",
});
conferir("sem telefone, a conversa", chaveDaPessoa({ conversaId: "abc" }), {
  type: "conversa",
  itemId: "abc",
});
conferir(
  "telefone imprestável cai na conversa",
  chaveDaPessoa({ telefone: "99", conversaId: "abc" }),
  {
    type: "conversa",
    itemId: "abc",
  },
);
conferir("sem nada", chaveDaPessoa({}), null);
conferir("tudo em branco", chaveDaPessoa({ telefone: "  ", conversaId: "  " }), null);

// ── O caso que motivou a mudança ─────────────────────────────────────────
// A pessoa entrou no funil por uma conversa e escreveu de novo por outra. O
// card tem de aparecer nas duas.
{
  const cards = [card({ id: "c1", type: "pessoa", itemId: "5548984195309" })];
  conferir(
    "card acha a pessoa pela conversa nova",
    cardDaPessoa(cards, { conversaId: "conversa-nova", telefone: "5548984195309" })?.id,
    "c1",
  );
  conferir(
    "e pela antiga também",
    cardDaPessoa(cards, { conversaId: "conversa-velha", telefone: "5548984195309" })?.id,
    "c1",
  );
}

// O número escrito de outro jeito continua sendo a mesma pessoa.
conferir(
  "com e sem o 55 casam",
  cardDaPessoa([card({ id: "c1", type: "pessoa", itemId: "5551993351821" })], {
    telefone: "51993351821",
  })?.id,
  "c1",
);

// ── Card preso à conversa ────────────────────────────────────────────────
// Grupo e contato identificado só por lid não têm número.
conferir(
  "acha pelo id da conversa",
  cardDaPessoa([card({ id: "g1", type: "conversa", itemId: "120363041234567890@g.us" })], {
    conversaId: "120363041234567890@g.us",
  })?.id,
  "g1",
);
// Duas conversas diferentes não são a mesma pessoa.
conferir(
  "conversa diferente não casa",
  cardDaPessoa([card({ id: "g1", type: "conversa", itemId: "grupo-a" })], {
    conversaId: "grupo-b",
  }),
  null,
);

// ── O card nasceu sem número e a pessoa ganhou um ────────────────────────
// Achar só pela chave preferida faria o card sumir da tela sem ter sido
// apagado.
conferir(
  "card de conversa continua sendo achado depois do telefone aparecer",
  cardDaPessoa([card({ id: "c1", type: "conversa", itemId: "conversa-1" })], {
    conversaId: "conversa-1",
    telefone: "5548984195309",
  })?.id,
  "c1",
);
// E quando existem os dois, o da pessoa ganha — é o que sobrevive à troca de
// conversa.
{
  const cards = [
    card({ id: "por-conversa", type: "conversa", itemId: "conversa-1" }),
    card({ id: "por-telefone", type: "pessoa", itemId: "5548984195309" }),
  ];
  conferir(
    "o card da pessoa tem precedência",
    cardDaPessoa(cards, { conversaId: "conversa-1", telefone: "5548984195309" })?.id,
    "por-telefone",
  );
}

// ── Nada a achar ─────────────────────────────────────────────────────────
conferir("funil vazio", cardDaPessoa([], { telefone: "5548984195309" }), null);
conferir(
  "ninguém casa",
  cardDaPessoa([card({ id: "c1", itemId: "5511999998888" })], { telefone: "5548984195309" }),
  null,
);
conferir("pessoa sem identidade nenhuma", cardDaPessoa([card({ id: "c1" })], {}), null);
// Telefone que não vira chave não pode casar com um card de conversa por acaso.
conferir(
  "telefone imprestável não vira chave de pessoa",
  cardDaPessoa([card({ id: "c1", type: "pessoa", itemId: "99" })], { telefone: "99" }),
  null,
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do funil`);
