// As figurinhas da quebra de padrão do Recovery Engine.
//
// O que não pode acontecer: figurinha em conversa de preço ou de "vou pensar",
// duas figurinhas na mesma sequência, a mesma figurinha duas vezes para a
// mesma pessoa, e figurinha que não existe (lista vazia ou arquivo sumido).
import {
  escolherFigurinha,
  figurinhasAprovadas,
  mecanismoDaEtapa,
  podeUsarFigurinha,
  type FigurinhaAprovada,
} from "../supabase/functions/_shared/recuperacao.ts";
import { corpoDeFigurinha, rota } from "../supabase/functions/_shared/evolution-enviar.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const f = (id: string): FigurinhaAprovada => ({
  id,
  path: `dono/recebidas/${id}.webp`,
  mimetype: "image/webp",
  animada: false,
});
const TRES = [f("A"), f("B"), f("C")];

// ── Quando cabe ──────────────────────────────────────────────────────────
conferir(
  "cabe em quem nunca respondeu",
  podeUsarFigurinha({ trilha: "INITIAL_NO_RESPONSE", usados: ["PRESENCE_CHECK"], aprovadas: TRES }),
  true,
);
for (const trilha of [
  "PRICE_SILENCE",
  "SAID_WILL_THINK",
  "AWAITING_DATA",
  "AWAITING_RESERVATION",
  "STOP",
] as const) {
  conferir(
    `não cabe em ${trilha}`,
    podeUsarFigurinha({ trilha, usados: [], aprovadas: TRES }),
    false,
  );
}
conferir(
  "uma por sequência",
  podeUsarFigurinha({
    trilha: "INITIAL_NO_RESPONSE",
    usados: ["PRESENCE_CHECK", "PATTERN_INTERRUPT"],
    aprovadas: TRES,
  }),
  false,
);
conferir(
  "sem aprovada, não cabe",
  podeUsarFigurinha({ trilha: "INITIAL_NO_RESPONSE", usados: [], aprovadas: [] }),
  false,
);

// ── O mecanismo segue a disponibilidade ─────────────────────────────────
conferir(
  "com figurinha, o FU2 é quebra de padrão",
  mecanismoDaEtapa("PATTERN_INTERRUPT", ["PRESENCE_CHECK"], { figurinha: true, casos: true }),
  "PATTERN_INTERRUPT",
);
conferir(
  "sem figurinha, vira texto leve",
  mecanismoDaEtapa("PATTERN_INTERRUPT", ["PRESENCE_CHECK"], { figurinha: false, casos: true }),
  "OPEN_LOOP",
);

// ── Qual mandar ──────────────────────────────────────────────────────────
conferir("sorteio no começo da lista", escolherFigurinha(TRES, [], 0)?.id, "A");
conferir("sorteio no fim da lista", escolherFigurinha(TRES, [], 0.99)?.id, "C");
conferir("evita a que a pessoa já recebeu", escolherFigurinha(TRES, ["A", "B"], 0)?.id, "C");
conferir(
  "se já recebeu todas, repete em vez de travar",
  escolherFigurinha(TRES, ["A", "B", "C"], 0)?.id,
  "A",
);
conferir("lista vazia, nenhuma", escolherFigurinha([], [], 0.5), null);

// ── A lista guardada ─────────────────────────────────────────────────────
conferir(
  "lista do banco: sem caminho sai, sem tipo vira webp",
  figurinhasAprovadas([{ id: "X", path: "p.webp" }, { id: "Y" }, null, "lixo"]),
  [{ id: "X", path: "p.webp", mimetype: "image/webp", animada: false }],
);
conferir("lista que não é lista", figurinhasAprovadas({ id: "X" }), []);

// ── A chamada da Evolution ───────────────────────────────────────────────
conferir("rota da figurinha", rota("sendSticker", "nos teste"), "/message/sendSticker/nos%20teste");
conferir("corpo da figurinha, sem legenda", corpoDeFigurinha("5548999999999", "QUJD"), {
  number: "5548999999999",
  sticker: "QUJD",
});

if (falhas.length) {
  console.error(`figurinhas-da-luna: ${falhas.length} falha(s)\n` + falhas.join("\n"));
  process.exit(1);
}
console.log(`figurinhas-da-luna: ${ok} checagens ok`);
