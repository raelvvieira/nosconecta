import {
  chaveDaOrigem,
  ehOrigem,
  ORIGENS,
  resolverOrigem,
  rotuloDaOrigem,
} from "../src/lib/atendimentos/origem-do-lead.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

conferir("sem nada é orgânico", resolverOrigem(null, []), { tipo: "organico", manual: false });
conferir("clique no anúncio", resolverOrigem(null, ["meta_ads"]), {
  tipo: "meta_ads",
  manual: false,
});
conferir("frase do site", resolverOrigem(null, ["site"]), { tipo: "site", manual: false });
conferir("clique vale mais que a frase", resolverOrigem(null, ["site", "meta_ads"]), {
  tipo: "meta_ads",
  manual: false,
});
conferir("manual vale mais que o automático", resolverOrigem("indicacao", ["meta_ads"]), {
  tipo: "indicacao",
  manual: true,
});
conferir("manual orgânico também vale", resolverOrigem("organico", ["meta_ads"]), {
  tipo: "organico",
  manual: true,
});
conferir("manual inválido é ignorado", resolverOrigem("qualquer", ["site"]), {
  tipo: "site",
  manual: false,
});
conferir("sinal desconhecido é ignorado", resolverOrigem(null, ["x"]), {
  tipo: "organico",
  manual: false,
});

conferir("chave pelo telefone", chaveDaOrigem("(48) 99626-6217", "c1"), "5548996266217");
conferir("chave sem telefone", chaveDaOrigem(null, "c1"), "conv:c1");
conferir("telefone curto vira conversa", chaveDaOrigem("123", "c1"), "conv:c1");

conferir("ehOrigem", ehOrigem("meta_ads"), true);
conferir("ehOrigem inválida", ehOrigem("tiktok"), false);
conferir("rótulo", rotuloDaOrigem("meta_ads"), "Meta Ads");
conferir(
  "todas as opções têm rótulo",
  ORIGENS.every((o) => o.rotulo.length > 0),
  true,
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`origem-do-lead: ${ok} checagens ok`);
