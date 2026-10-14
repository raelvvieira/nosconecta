// Quem já esteve na agenda — o recorte "clientes ativos" do disparo.
//
// Este é o terceiro filtro que decide para quem uma mensagem sai, ao lado do
// DDD e da tag. Errar aqui tem duas faces, e as duas são ruins de jeitos
// diferentes:
//
//   Largo demais — um estranho recebe uma mensagem endereçada a cliente
//   ("que bom te ver de novo"), e isso não se desfaz.
//
//   Estreito demais — some cliente de verdade da lista, em silêncio. Foi o que
//   quase aconteceu: casar por `crm_contact_id` achava 11 das 49 pessoas com
//   horário marcado, e casar o telefone literalmente achava 6. Ninguém veria
//   que faltavam 38, porque a tela mostraria um número menor com ar de certo.
import {
  contarNaAgenda,
  esteveNaAgenda,
  filtrarContatos,
  type ContatoFiltravel,
} from "../src/lib/atendimentos/contactFilters";
import { variantesDoNumero } from "../src/lib/atendimentos/phone";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  if (real !== esperado) {
    console.error(`FALHOU ${oQue}: esperava ${String(esperado)}, veio ${String(real)}`);
    process.exit(1);
  }
}

/** O conjunto como o servidor o monta: todas as formas de cada número. */
function conjunto(...fichas: string[]): Set<string> {
  const s = new Set<string>();
  for (const f of fichas) for (const v of variantesDoNumero(f)) s.add(v);
  return s;
}

// ── O nono dígito, que é o caso de verdade ──────────────────────────────────
//
// A ficha do paciente guarda com o 9, o WhatsApp guarda sem. Nesta base, das
// 49 pessoas com horário marcado, comparar literalmente achava 6.

{
  const naAgenda = conjunto("5551993967887"); // ficha, com o 9
  conferir("casa com o mesmo número", esteveNaAgenda("5551993967887", naAgenda), true);
  conferir("casa sem o nono dígito", esteveNaAgenda("555193967887", naAgenda), true);
}
{
  const naAgenda = conjunto("555193967887"); // ficha, sem o 9
  conferir("o contrário também", esteveNaAgenda("5551993967887", naAgenda), true);
  conferir("e o literal", esteveNaAgenda("555193967887", naAgenda), true);
}

// Formatado na tela continua sendo o mesmo número.
{
  const naAgenda = conjunto("5548996881898");
  conferir("com parênteses e traço", esteveNaAgenda("+55 (48) 99688-1898", naAgenda), true);
  conferir("sem o país", esteveNaAgenda("48996881898", naAgenda), true);
}

// ── Quem NÃO pode entrar ────────────────────────────────────────────────────
//
// Cada um destes passando é um estranho recebendo mensagem de cliente.

{
  const naAgenda = conjunto("5551993967887");
  conferir("outro número", esteveNaAgenda("5551999999999", naAgenda), false);
  // O mesmo final em outro DDD é a armadilha do "casar pelos 8 últimos": em
  // São Paulo existe alguém com o mesmo fim de número.
  conferir("mesmo final, outro DDD", esteveNaAgenda("5511993967887", naAgenda), false);
  conferir("sem telefone", esteveNaAgenda(null, naAgenda), false);
  conferir("telefone vazio", esteveNaAgenda("", naAgenda), false);
  conferir("indefinido", esteveNaAgenda(undefined, naAgenda), false);
  conferir("lixo", esteveNaAgenda("não sei", naAgenda), false);
  conferir("número pela metade", esteveNaAgenda("5551", naAgenda), false);
}

// Agenda vazia não libera ninguém — nem derruba a tela.
conferir("conjunto vazio nega todo mundo", esteveNaAgenda("5551993967887", new Set()), false);

// Fixo não ganha o nono dígito: 9 na frente de um fixo gera número que não
// existe, e casar com ele seria casar com ninguém.
{
  const naAgenda = conjunto("555133334444");
  conferir("fixo casa consigo", esteveNaAgenda("555133334444", naAgenda), true);
  conferir("fixo não vira celular", esteveNaAgenda("5551933334444", naAgenda), false);
}

// ── A contagem que a ficha mostra ───────────────────────────────────────────

const base: ContatoFiltravel[] = [
  { id: "a", name: "Juliane Fusieger", phone: "5551995790196" },
  { id: "b", name: "Alice", phone: "555190104474" }, // na agenda, sem o 9
  { id: "c", name: "Desconhecido", phone: "5511988887777" },
  { id: "d", name: "Sem número", phone: null },
];
const naAgenda = conjunto("5551995790196", "5551990104474");

conferir("conta só quem esteve", contarNaAgenda(base, naAgenda), 2);
conferir("conta zero com agenda vazia", contarNaAgenda(base, new Set()), 0);
conferir("conta zero sem contatos", contarNaAgenda([], naAgenda), 0);

// ── O filtro inteiro ────────────────────────────────────────────────────────

{
  const r = filtrarContatos(base, { busca: "", ddds: new Set(), naAgenda });
  conferir("sobram dois", r.length, 2);
  conferir(
    "a Juliane fica",
    r.some((c) => c.id === "a"),
    true,
  );
  conferir(
    "a Alice fica, apesar do nono dígito",
    r.some((c) => c.id === "b"),
    true,
  );
  conferir(
    "o desconhecido sai",
    r.some((c) => c.id === "c"),
    false,
  );
  conferir(
    "quem não tem número sai",
    r.some((c) => c.id === "d"),
    false,
  );
}

// Desligado, a lista é a de sempre — o recorte não pode vazar para quem não
// pediu por ele.
{
  conferir("sem o filtro, todos", filtrarContatos(base, { busca: "", ddds: new Set() }).length, 4);
  conferir(
    "nulo também não filtra",
    filtrarContatos(base, { busca: "", ddds: new Set(), naAgenda: null }).length,
    4,
  );
}

// ── Somando com os outros recortes ──────────────────────────────────────────
//
// Os filtros se acumulam: "clientes ativos do DDD 51" é um recorte legítimo, e
// cada um deles sozinho não pode desfazer o outro.

{
  const r = filtrarContatos(base, { busca: "", ddds: new Set(["51"]), naAgenda });
  conferir("ativos do 51", r.length, 2);
}
{
  const r = filtrarContatos(base, { busca: "", ddds: new Set(["11"]), naAgenda });
  conferir("ativos do 11 não existem", r.length, 0);
}
{
  const r = filtrarContatos(base, { busca: "juliane", ddds: new Set(), naAgenda });
  conferir("busca dentro dos ativos", r.length, 1);
  conferir("e é ela", r[0]?.id, "a");
}
{
  // Quem a busca acharia, mas não é cliente, continua fora.
  const r = filtrarContatos(base, { busca: "desconhecido", ddds: new Set(), naAgenda });
  conferir("a busca não fura o recorte", r.length, 0);
}

console.log(`ok — ${feitas} checagens de quem já esteve na agenda`);
