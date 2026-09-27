// Checagens da tabela de preços que vai para a instrução do agente.
//
// Dois modos de errar, os dois com consequência comercial:
//
//   **Cotar o piso como preço.** O NÓS Prevent é anunciado "a partir de R$ 800",
//   e essa frase saiu 200 vezes. Se a instrução disser "R$ 800,00", a IA cota
//   oitocentos fechados — uma promessa que a clínica não fez, e que vira
//   discussão na cadeira.
//
//   **Esconder o parcelamento.** O manual manda informar junto do valor, para o
//   paciente não descobrir depois que existia condição melhor.
//
// E o caso que mais importa: sem procedimento liberado, a tabela precisa PROIBIR
// falar de preço. Hoje são 278 procedimentos cadastrados e oito liberados; um
// erro aqui liberaria os 278.
import { tabelaDePrecos } from "../supabase/functions/_shared/instrucao-do-agente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}
const contem = (n: string, t: string, x: string) => conferir(n, t.includes(x), true);
const naoContem = (n: string, t: string, x: string) => conferir(n, t.includes(x), false);

// ── Nada liberado: proibir, não silenciar ───────────────────────────────
{
  const t = tabelaDePrecos([]);
  contem("sem liberação, não tem tabela", t, "NÃO tem tabela de preços liberada");
  contem("e proíbe estimar", t, "Nunca");
  contem("nem dar faixa", t, "nunca diga 'em torno de'");
}

// ── O caso normal ───────────────────────────────────────────────────────
const combo = { nome: "Combo: clareamento + limpeza", preco: 399, duracaoMinutos: 90 };
{
  const t = tabelaDePrecos([combo]);
  contem("o valor sai em reais", t, "R$ 399,00");
  contem("com a duração", t, "90 min");
  contem("e diz que só estes valem", t, "Estes, e somente estes");
  // Sem item "a partir de", a explicação não aparece — texto que não serve a
  // nada só dilui a instrução.
  naoContem("sem piso, sem explicação de piso", t, "valor MÍNIMO");
}

// ── "A partir de" ───────────────────────────────────────────────────────
const prevent = {
  nome: "NÓS Prevent — botox 3 regiões",
  preco: 800,
  duracaoMinutos: 60,
  aPartirDe: true,
};
{
  const t = tabelaDePrecos([combo, prevent]);
  contem("o piso vem rotulado", t, "a partir de R$ 800,00");
  // O fechado continua fechado: um não contamina o outro.
  contem("e o fechado segue fechado", t, "- Combo: clareamento + limpeza: R$ 399,00");
  naoContem("o fechado não ganha 'a partir de'", t, "a partir de R$ 399,00");
  // A explicação é o que faz o rótulo valer algo.
  contem("explica o que é o piso", t, "valor MÍNIMO");
  contem("manda dizer 'a partir de'", t, 'Diga "a partir de" também');
  contem("e proíbe prometer o valor", t, "nunca");
}

// ── O parcelamento ──────────────────────────────────────────────────────
{
  const t = tabelaDePrecos([combo], "em até 10x no cartão");
  contem("aparece a condição", t, "em até 10x no cartão");
  contem("e manda dizer junto do valor", t, "junto do valor, não depois");
}
// Vazio e só-espaços não inventam condição.
naoContem("sem parcelamento, nada é prometido", tabelaDePrecos([combo], ""), "podem ser pagos");
naoContem("só espaços também não", tabelaDePrecos([combo], "   "), "podem ser pagos");
naoContem("e nulo também não", tabelaDePrecos([combo], null), "podem ser pagos");

// ── Preço ausente ───────────────────────────────────────────────────────
// Um item liberado sem preço não pode virar "R$ 0,00" — cortesia por acidente.
{
  const t = tabelaDePrecos([{ nome: "Avaliação", preco: null }]);
  naoContem("preço nulo não vira zero", t, "R$ 0,00");
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da tabela de preços`);
