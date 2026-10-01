// Checagens da ligação entre a venda e o anúncio.
//
// ── O caso real ────────────────────────────────────────────────────────
//
// Juliano clicou num anúncio do Instagram em 28/09 às 00:03 e o sistema
// guardou o `ctwa_clid` (138 caracteres, começando com `Afg`). Em 30/09 às
// 23:42 ele virou cliente, R$ 990. O evento saiu com telefone, nome e país —
// e sem o clique. A Meta reconheceu a pessoa (correspondência 4,8, telefone em
// 100%) e não atribuiu a venda a anúncio nenhum.
//
// Os modos de errar:
//
//   **Marcar `business_messaging` sem clique.** É afirmar à Meta que a venda
//   veio de uma conversa de anúncio sem ter como provar. O evento sairia da
//   contagem normal sem entrar em contagem nenhuma — pior que não marcar.
//
//   **Mandar o clique errado.** Quem clicou em dois anúncios tem de dar
//   crédito ao último, que é a regra da própria Meta.
//
//   **Mandar clique velho.** Um clique de seis meses não causou a compra de
//   hoje.
import {
  camposDeMensageria,
  cliqueQueVale,
  validoComoClickId,
  validoComoPageId,
} from "../supabase/functions/_shared/conversao-de-anuncio.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// Do mesmo tamanho e forma do real, sem ser o do paciente.
const CLIQUE = "Afg" + "r".repeat(135);
const OUTRO = "Afg" + "z".repeat(135);

// ── Os campos de mensageria ──────────────────────────────────────────────
//
// Precisa dos DOIS, e a segunda parte custou um reenvio recusado para
// descobrir. A Meta respondeu, em 01/10:
//
//   "não tem page_id nem whatsapp_business_account_id. Um desses parâmetros é
//    necessário em user_data." (100 / 2804116)
const PAGINA = "107444382072130";

conferir("com clique e página, vira conversão de conversa", camposDeMensageria(CLIQUE, PAGINA), {
  action_source: "business_messaging",
  messaging_channel: "whatsapp",
});

// O caso que a Meta recusou: clique sem página. Melhor sair como saía antes do
// que sair e ser recusado — recusado a conversão SOME, cega ela ao menos conta
// no conjunto de dados.
conferir("clique sem página não marca", camposDeMensageria(CLIQUE, null), null);
conferir("página sem clique não marca", camposDeMensageria(null, PAGINA), null);
conferir("nenhum dos dois não marca", camposDeMensageria(null, null), null);
conferir("string vazia não marca", camposDeMensageria("", PAGINA), null);
conferir("só espaço não marca", camposDeMensageria("   ", PAGINA), null);
conferir("clique curto demais não marca", camposDeMensageria("abc123", PAGINA), null);
conferir("página vazia não marca", camposDeMensageria(CLIQUE, ""), null);

// ── O id da Página ───────────────────────────────────────────────────────
conferir("o id real passa", validoComoPageId(PAGINA), true);
conferir("com espaço em volta passa", validoComoPageId("  107444382072130  "), true);
conferir("nulo não passa", validoComoPageId(null), false);
conferir("nome da página não passa", validoComoPageId("Dra. Mariane Botti"), false);
conferir("número curto demais não passa", validoComoPageId("123"), false);
conferir("com letra no meio não passa", validoComoPageId("10744a382072130"), false);

// ── O que parece um clique ───────────────────────────────────────────────
conferir("o formato real passa", validoComoClickId(CLIQUE), true);
conferir("nulo não passa", validoComoClickId(null), false);
conferir("com espaço no meio não passa", validoComoClickId("Afg rrrr" + "r".repeat(30)), false);
conferir("exatamente 20 passa", validoComoClickId("a".repeat(20)), true);
conferir("19 não passa", validoComoClickId("a".repeat(19)), false);

// ── Qual clique vale ─────────────────────────────────────────────────────
const AGORA = new Date("2026-10-01T12:00:00Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000).toISOString();

conferir(
  "o caso do Juliano: um clique, dentro da janela",
  cliqueQueVale([{ clickId: CLIQUE, quando: diasAtras(3) }], AGORA),
  CLIQUE,
);
conferir(
  "dois cliques: vale o mais recente",
  cliqueQueVale(
    [
      { clickId: CLIQUE, quando: diasAtras(40) },
      { clickId: OUTRO, quando: diasAtras(2) },
    ],
    AGORA,
  ),
  OUTRO,
);
conferir(
  "e a ordem da lista não importa",
  cliqueQueVale(
    [
      { clickId: OUTRO, quando: diasAtras(2) },
      { clickId: CLIQUE, quando: diasAtras(40) },
    ],
    AGORA,
  ),
  OUTRO,
);
conferir(
  "clique de seis meses não vale",
  cliqueQueVale([{ clickId: CLIQUE, quando: diasAtras(180) }], AGORA),
  null,
);
conferir(
  "clique com data no futuro não vale",
  cliqueQueVale([{ clickId: CLIQUE, quando: diasAtras(-5) }], AGORA),
  null,
);
conferir(
  "velho e novo juntos: vale o novo",
  cliqueQueVale(
    [
      { clickId: CLIQUE, quando: diasAtras(180) },
      { clickId: OUTRO, quando: diasAtras(10) },
    ],
    AGORA,
  ),
  OUTRO,
);
conferir(
  "velho sozinho continua sem valer",
  cliqueQueVale([{ clickId: OUTRO, quando: diasAtras(91) }], AGORA),
  null,
);
conferir("lista vazia dá nulo", cliqueQueVale([], AGORA), null);
conferir(
  "clique nulo na lista é ignorado",
  cliqueQueVale([{ clickId: null, quando: diasAtras(1) }], AGORA),
  null,
);
conferir(
  "data ilegível é ignorada",
  cliqueQueVale([{ clickId: CLIQUE, quando: "ontem" }], AGORA),
  null,
);
conferir(
  "janela customizada é respeitada",
  cliqueQueVale([{ clickId: CLIQUE, quando: diasAtras(10) }], AGORA, 7),
  null,
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da conversão de anúncio`);
