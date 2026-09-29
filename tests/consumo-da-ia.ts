// Checagens da contagem de tokens e da conversão em dinheiro.
//
// ── Por que estas contas merecem teste ──────────────────────────────────
//
// Elas viram um número em reais numa tela, e um número em reais numa tela é
// acreditado. Um erro aqui não aparece como erro: aparece como uma conta
// menor do que a fatura, e ninguém desconfia até a fatura chegar.
//
// Os modos de errar:
//
//   **Contar a entrada duas vezes.** `prompt_tokens` da OpenAI JÁ inclui os
//   tokens servidos do cache. Somar os dois infla a entrada, e a entrada é a
//   maior parte do gasto aqui — a instrução da Luna passa de 40 mil letras e
//   vai inteira em toda chamada.
//
//   **Transformar "não sei" em zero.** O modelo desta clínica não está no
//   catálogo público. Sem preço, o custo é desconhecido; devolver zero diria
//   que a IA é de graça.
//
//   **Campo que não veio virar zero.** Resposta de erro não traz `usage`, e
//   modelo sem cache não traz `prompt_tokens_details`.
import { usoDaResposta } from "../supabase/functions/_shared/consumo-da-ia.ts";
import {
  PRECOS_DE_CATALOGO,
  custoEmReais,
  custoEmUsd,
  mesDeBrasilia,
  precoDoModelo,
  reaisLegiveis,
  somarPorMes,
  tokensLegiveis,
} from "../src/lib/agente-ia/consumo.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}
function perto(nome: string, obtido: number | null, esperado: number, tolerancia = 1e-9) {
  if (obtido !== null && Math.abs(obtido - esperado) <= tolerancia) ok++;
  else falhas.push(`${nome} — esperado ~${esperado}, veio ${obtido}`);
}

// ── Ler o `usage` ────────────────────────────────────────────────────────
{
  // Resposta real da OpenAI com cache: 18.000 de entrada, dos quais 16.384
  // vieram do cache. A entrada COBRADA como nova é a diferença.
  const uso = usoDaResposta(
    {
      usage: {
        prompt_tokens: 18_000,
        completion_tokens: 220,
        total_tokens: 18_220,
        prompt_tokens_details: { cached_tokens: 16_384 },
      },
    },
    "gpt-4o",
  );
  conferir("a entrada vem líquida do cache", uso, {
    modelo: "gpt-4o",
    entrada: 1_616,
    cache: 16_384,
    saida: 220,
  });
  conferir(
    "e a soma bate com o total que a API mandou",
    (uso?.entrada ?? 0) + (uso?.cache ?? 0) + (uso?.saida ?? 0),
    18_220,
  );
}

conferir(
  "sem detalhes de cache, tudo é entrada nova",
  usoDaResposta({ usage: { prompt_tokens: 900, completion_tokens: 100 } }, "gpt-4o"),
  { modelo: "gpt-4o", entrada: 900, cache: 0, saida: 100 },
);
conferir("resposta sem usage não vira zero, vira nada", usoDaResposta({ choices: [] }, "x"), null);
conferir("corpo nulo não quebra", usoDaResposta(null, "x"), null);
conferir(
  "nome novo dos campos também é lido",
  usoDaResposta({ usage: { input_tokens: 50, output_tokens: 7 } }, "x"),
  { modelo: "x", entrada: 50, cache: 0, saida: 7 },
);
conferir(
  "cache maior que o total não faz entrada negativa",
  usoDaResposta(
    {
      usage: {
        prompt_tokens: 100,
        completion_tokens: 0,
        prompt_tokens_details: { cached_tokens: 500 },
      },
    },
    "x",
  ),
  { modelo: "x", entrada: 0, cache: 500, saida: 0 },
);
// Número que não é número vira zero, e não NaN: um NaN atravessaria a soma
// inteira do mês e a tela mostraria "R$ NaN". A linha toda zerada é descartada
// depois, por `anotarConsumo` — ver o teste do vizinho abaixo.
conferir(
  "valor estranho conta como zero, não como NaN",
  usoDaResposta({ usage: { prompt_tokens: "muitos", completion_tokens: -3 } }, "x"),
  { modelo: "x", entrada: 0, cache: 0, saida: 0 },
);
conferir(
  "e zerada ela não custa NaN",
  custoEmUsd({ entrada: 0, cache: 0, saida: 0 }, { entrada: 3, cache: 1, saida: 9 }),
  0,
);

// ── A conta do dinheiro ──────────────────────────────────────────────────
{
  const uso = { entrada: 1_000_000, cache: 0, saida: 0 };
  perto(
    "um milhão de entrada custa o preço de tabela",
    custoEmUsd(uso, PRECOS_DE_CATALOGO["gpt-4o"]),
    2.5,
  );
}
{
  const uso = { entrada: 0, cache: 1_000_000, saida: 0 };
  perto("o cache custa metade no gpt-4o", custoEmUsd(uso, PRECOS_DE_CATALOGO["gpt-4o"]), 1.25);
}
{
  // Sem preço de cache, o token de cache é cobrado como entrada cheia: errar
  // para o lado caro, nunca para o barato.
  const uso = { entrada: 0, cache: 1_000_000, saida: 0 };
  perto(
    "sem preço de cache, cobra como entrada",
    custoEmUsd(uso, { entrada: 3, cache: null, saida: 9 }),
    3,
  );
}
{
  // A chamada real da Luna, com a instrução inteira: a saída é minúscula perto
  // da entrada, e é isso que a tela precisa deixar visível.
  const uso = { entrada: 1_616, cache: 16_384, saida: 220 };
  perto(
    "uma resposta da Luna",
    custoEmUsd(uso, PRECOS_DE_CATALOGO["gpt-4o"]),
    (1_616 * 2.5 + 16_384 * 1.25 + 220 * 10) / 1_000_000,
  );
}

conferir(
  "sem preço, o custo é desconhecido e não zero",
  custoEmUsd({ entrada: 9_999, cache: 0, saida: 9_999 }, null),
  null,
);
conferir(
  "chamada sem gasto custa zero de verdade",
  custoEmUsd({ entrada: 0, cache: 0, saida: 0 }, PRECOS_DE_CATALOGO["gpt-4o"]),
  0,
);

// ── Reais ────────────────────────────────────────────────────────────────
perto("dez dólares a 5,40", custoEmReais(10, 5.4), 54);
conferir("sem custo não há reais", custoEmReais(null, 5.4), null);
conferir("sem cotação não há reais", custoEmReais(10, null), null);
conferir("cotação zero não vira de graça", custoEmReais(10, 0), null);
conferir("cotação negativa é recusada", custoEmReais(10, -5.4), null);

// ── Achar o preço ────────────────────────────────────────────────────────
conferir(
  "o catálogo responde pelos modelos públicos",
  precoDoModelo("gpt-4o-mini", {}),
  PRECOS_DE_CATALOGO["gpt-4o-mini"],
);
conferir(
  "caixa alta não esconde o modelo",
  precoDoModelo("GPT-4O", {}),
  PRECOS_DE_CATALOGO["gpt-4o"],
);
conferir(
  "espaço sobrando não esconde o modelo",
  precoDoModelo("  gpt-4o  ", {}),
  PRECOS_DE_CATALOGO["gpt-4o"],
);
conferir("o modelo desta clínica não está no catálogo", precoDoModelo("gpt-6-luna", {}), null);
{
  const meu = { "gpt-6-luna": { entrada: 1.1, cache: 0.3, saida: 4.4 } };
  conferir("o que a clínica digitou responde", precoDoModelo("gpt-6-luna", meu), meu["gpt-6-luna"]);
  const sobrepoe = { "gpt-4o": { entrada: 1, cache: 1, saida: 1 } };
  conferir("e ganha do catálogo", precoDoModelo("gpt-4o", sobrepoe), sobrepoe["gpt-4o"]);
}
conferir(
  "modelo vazio não casa com nada",
  precoDoModelo("", { "": { entrada: 1, cache: 1, saida: 1 } }),
  null,
);
conferir("modelo nulo não quebra", precoDoModelo(null, {}), null);

// ── O mês, em Brasília ───────────────────────────────────────────────────
//
// O defeito que isto previne: somar por mês em UTC. Uma chamada das 22h de
// 30/09 em São Paulo é 01/10 em UTC — e cairia em outubro, numa tela cuja
// pergunta é "quanto gastei em setembro".
conferir("22h de 30/09 em SP ainda é setembro", mesDeBrasilia("2026-10-01T01:00:00Z"), "2026-09");
conferir("meio-dia de 01/10 é outubro", mesDeBrasilia("2026-10-01T15:00:00Z"), "2026-10");
conferir("data inválida não vira mês", mesDeBrasilia("não é data"), null);

// ── A soma do mês ────────────────────────────────────────────────────────
{
  const linhas = [
    {
      quando: "2026-09-29T12:00:00Z",
      modelo: "gpt-4o",
      para: "resposta",
      entrada: 1_000,
      cache: 2_000,
      saida: 100,
      estimado: false,
    },
    {
      quando: "2026-09-29T13:00:00Z",
      modelo: "gpt-4o",
      para: "sugestao",
      entrada: 500,
      cache: 0,
      saida: 50,
      estimado: false,
    },
    {
      quando: "2026-10-01T15:00:00Z",
      modelo: "gpt-4o",
      para: "resposta",
      entrada: 100,
      cache: 0,
      saida: 10,
      estimado: false,
    },
  ];
  const meses = somarPorMes(linhas, {});
  conferir(
    "dois meses, o mais novo primeiro",
    meses.map((m) => m.mes),
    ["2026-10", "2026-09"],
  );
  conferir("setembro soma as duas chamadas", meses[1].chamadas, 2);
  conferir("e os tokens das duas", meses[1].tokens, 1_000 + 2_000 + 100 + 500 + 50);
  conferir("nada sem preço, porque gpt-4o está no catálogo", meses[1].semPreco, 0);
  perto(
    "e o dólar bate com a conta feita à mão",
    meses[1].usd,
    (1_500 * 2.5 + 2_000 * 1.25 + 150 * 10) / 1_000_000,
  );
  conferir("quem mais gastou vem primeiro", meses[1].porUso[0].para, "resposta");
  conferir("com o nome que a tela mostra", meses[1].porUso[0].nome, "Respostas no WhatsApp");
}

{
  // O caso desta clínica: modelo sem preço em lugar nenhum.
  const linhas = [
    {
      quando: "2026-09-29T12:00:00Z",
      modelo: "gpt-6-luna",
      para: "resposta",
      entrada: 315_723,
      cache: 0,
      saida: 1_386,
      estimado: true,
    },
  ];
  const [mes] = somarPorMes(linhas, {});
  conferir("os tokens continuam contados", mes.tokens, 317_109);
  conferir("mas o dinheiro é desconhecido, não zero", mes.usd, null);
  conferir("e a tela sabe que é estimativa", mes.temEstimativa, true);
  conferir("e quantas linhas estão sem preço", mes.semPreco, 1);

  // Cadastrado o preço, o mês que já passou se acerta sozinho. É o motivo de
  // o custo não ser congelado na gravação.
  const [comPreco] = somarPorMes(linhas, {
    "gpt-6-luna": { entrada: 1.1, cache: 0.3, saida: 4.4 },
  });
  perto(
    "com o preço digitado, o passado se acerta",
    comPreco.usd,
    (315_723 * 1.1 + 1_386 * 4.4) / 1_000_000,
  );
  conferir("e não sobra linha sem preço", comPreco.semPreco, 0);
}

{
  // Mês em que a clínica trocou de modelo: o custo é por LINHA, nunca sobre o
  // total de tokens do mês.
  const linhas = [
    {
      quando: "2026-09-10T12:00:00Z",
      modelo: "gpt-4o",
      para: "resposta",
      entrada: 1_000_000,
      cache: 0,
      saida: 0,
      estimado: false,
    },
    {
      quando: "2026-09-20T12:00:00Z",
      modelo: "gpt-4o-mini",
      para: "resposta",
      entrada: 1_000_000,
      cache: 0,
      saida: 0,
      estimado: false,
    },
  ];
  const [mes] = somarPorMes(linhas, {});
  perto("cada linha com o preço do seu modelo", mes.usd, 2.5 + 0.15);
}

conferir("sem linha nenhuma, nenhum mês", somarPorMes([], {}), []);

// ── Como a tela escreve os números ───────────────────────────────────────
conferir("abaixo de mil vai inteiro", tokensLegiveis(40), "40");
conferir("milhares ficam legíveis", tokensLegiveis(315_723), "316 mil");
conferir("poucos milhares ganham decimal", tokensLegiveis(1_386), "1,4 mil");
conferir("milhões também", tokensLegiveis(2_400_000), "2,4 mi");
conferir("negativo não vira número estranho", tokensLegiveis(-5), "0");
conferir("sem valor, travessão", reaisLegiveis(null), "—");
conferir("centavos aparecem", reaisLegiveis(4.2), "R$\u00a04,20");

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do consumo da IA`);
