// Checagens do agrupamento da caixa de entrada.
//
// A regra: no WhatsApp o NÚMERO é a conversa. As linhas separadas vinham do
// CRM — encerrar e reabrir criava outra, um contato salvo duas vezes criava
// mais uma — e a tela herdava a separação.
//
// Errar aqui não dá erro: junta gente diferente na mesma linha (e a conversa
// de alguém some debaixo do nome de outro) ou deixa a mesma pessoa espalhada
// em três linhas.
import { agruparPorContato } from "../src/lib/atendimentos/agruparConversas.ts";
import type { ConversationRow } from "../src/lib/atendimentos/atendimentos.functions.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

function conversa(p: Partial<ConversationRow> & { id: string }): ConversationRow {
  return {
    id: p.id,
    contactId: p.contactId ?? null,
    contactName: p.contactName ?? null,
    phone: p.phone ?? null,
    avatarUrl: p.avatarUrl ?? null,
    lastMessagePreview: p.lastMessagePreview ?? null,
    lastMessageAt: p.lastMessageAt ?? null,
    unreadCount: p.unreadCount ?? 0,
    status: p.status ?? "open",
  };
}

// ── O caso que motivou a mudança ─────────────────────────────────────────
// Mesma pessoa, dois contatos diferentes no CRM, NOMES diferentes. A regra
// antiga exigia telefone E nome iguais, então isto continuava em duas linhas.
{
  const grupos = agruparPorContato([
    conversa({
      id: "10",
      contactId: "A",
      phone: "5548984195309",
      contactName: "Carol",
      unreadCount: 2,
    }),
    conversa({
      id: "11",
      contactId: "B",
      phone: "5548984195309",
      contactName: "Carol Kroeff",
      unreadCount: 3,
    }),
  ]);
  conferir("nomes diferentes, mesmo número = uma linha", grupos.length, 1);
  conferir("não-lidas somam", grupos[0].naoLidas, 5);
  conferir("a primeira é a principal", grupos[0].principal.id, "10");
  conferir(
    "a outra fica no grupo",
    grupos[0].outras.map((o) => o.id),
    ["11"],
  );
}

// O número escrito de jeitos diferentes é o mesmo número.
{
  const grupos = agruparPorContato([
    conversa({ id: "1", contactId: "A", phone: "5551993351821" }),
    conversa({ id: "2", contactId: "B", phone: "51993351821" }),
  ]);
  conferir("com e sem o 55 casam", grupos.length, 1);
}

// Conversa do CRM + conversa da conexão própria, mesma pessoa.
{
  const grupos = agruparPorContato([
    conversa({
      id: "5548984195309@s.whatsapp.net",
      contactId: "5548984195309@s.whatsapp.net",
      phone: "5548984195309",
      contactName: "Tiago",
    }),
    conversa({ id: "9912", contactId: "77", phone: "5548984195309", contactName: "Tiago" }),
  ]);
  conferir("as duas origens viram uma linha", grupos.length, 1);
}

// ── Nome e foto se completam entre as conversas ──────────────────────────
// A da Evolution nasce com o `pushName`; a do CRM, com o nome cadastrado. Uma
// linha sem nome ao lado de uma com nome vira "Contato" à toa.
{
  const grupos = agruparPorContato([
    conversa({ id: "1", phone: "5548984195309", contactName: null, avatarUrl: null }),
    conversa({
      id: "2",
      phone: "5548984195309",
      contactName: "Lourdes",
      avatarUrl: "https://x/a.jpg",
    }),
  ]);
  conferir("nome vem da outra conversa", grupos[0].principal.contactName, "Lourdes");
  conferir("foto vem da outra conversa", grupos[0].principal.avatarUrl, "https://x/a.jpg");
  conferir("mas a principal continua sendo a primeira", grupos[0].principal.id, "1");
}
// O nome da principal não é substituído quando ela já tem um.
{
  const grupos = agruparPorContato([
    conversa({ id: "1", phone: "5511999998888", contactName: "Ana" }),
    conversa({ id: "2", phone: "5511999998888", contactName: "Ana Paula" }),
  ]);
  conferir("nome existente não é trocado", grupos[0].principal.contactName, "Ana");
}

// ── Grupos do WhatsApp ───────────────────────────────────────────────────
// Não têm telefone. A identidade é o id do grupo — e dois grupos diferentes
// não podem virar um.
{
  const grupos = agruparPorContato([
    conversa({
      id: "g1",
      contactId: "120363041234567890@g.us",
      phone: null,
      contactName: "#NÓS Floripa",
    }),
    conversa({
      id: "g2",
      contactId: "120363049999999999@g.us",
      phone: null,
      contactName: "Estudos",
    }),
  ]);
  conferir("dois grupos continuam dois", grupos.length, 2);
}
// Mesmo grupo em duas conversas junta.
{
  const grupos = agruparPorContato([
    conversa({ id: "g1", contactId: "120363041234567890@g.us", phone: null }),
    conversa({ id: "g2", contactId: "120363041234567890@g.us", phone: null }),
  ]);
  conferir("mesmo grupo é uma linha", grupos.length, 1);
}

// ── Sem telefone e sem contato ───────────────────────────────────────────
// Cada conversa é o seu próprio grupo. Colapsar todas numa só juntaria gente
// diferente e sumiria com a conversa de alguém.
{
  const grupos = agruparPorContato([
    conversa({ id: "x1", phone: null, contactId: null }),
    conversa({ id: "x2", phone: null, contactId: null }),
  ]);
  conferir("sem identidade, cada uma é uma linha", grupos.length, 2);
}
// Telefone vazio não é telefone — senão todas as conversas sem número viriam
// para a mesma linha.
{
  const grupos = agruparPorContato([
    conversa({ id: "x1", phone: "", contactId: "A" }),
    conversa({ id: "x2", phone: "", contactId: "B" }),
  ]);
  conferir("telefone vazio cai para o contato", grupos.length, 2);
}

// ── A ordem de entrada é preservada ──────────────────────────────────────
{
  const grupos = agruparPorContato([
    conversa({ id: "a", phone: "5511111111111" }),
    conversa({ id: "b", phone: "5522222222222" }),
    conversa({ id: "c", phone: "5511111111111" }),
  ]);
  conferir(
    "ordem das linhas",
    grupos.map((g) => g.principal.id),
    ["a", "b"],
  );
  conferir(
    "a terceira entrou no grupo da primeira",
    grupos[0].outras.map((o) => o.id),
    ["c"],
  );
}

conferir("lista vazia", agruparPorContato([]), []);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do agrupamento por número`);
