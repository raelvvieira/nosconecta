// Qual caso de antes e depois a IA pode enviar.
//
// O que se testa aqui é a fronteira entre o que o modelo diz e o arquivo que
// sai. Em `agendamento-da-ia.ts` o erro era uma paciente marcada no dia
// errado; aqui é a foto do rosto de uma paciente saindo para um desconhecido
// no WhatsApp, e isso não se desfaz.
import {
  casoEscolhido,
  catalogoDeCasos,
  comoUsarOsCasos,
  MAXIMO_DE_CASOS,
  type CasoDaClinica,
} from "../supabase/functions/_shared/casos-da-ia.ts";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  if (real !== esperado) {
    console.error(`FALHOU ${oQue}: esperava ${String(esperado)}, veio ${String(real)}`);
    process.exit(1);
  }
}

const casos: CasoDaClinica[] = [
  {
    id: "a1",
    titulo: "Clareamento, resultado natural",
    mediaPath: "casos/clareamento-natural.jpg",
    quandoUsar: "quando a pessoa teme ficar com os dentes artificiais",
  },
  {
    id: "b2",
    titulo: "Lentes de resina",
    mediaPath: "casos/lentes.jpg",
    quandoUsar: null,
  },
];

// ── O catálogo ──────────────────────────────────────────────────────────────

const cat = catalogoDeCasos(casos);
conferir("dois casos", cat.length, 2);
conferir("o primeiro é C1", cat[0].codigo, "C1");
conferir("o segundo é C2", cat[1].codigo, "C2");
conferir("o arquivo viaja junto", cat[0].mediaPath, "casos/clareamento-natural.jpg");
conferir(
  "quando usar vem junto",
  cat[0].quandoUsar,
  "quando a pessoa teme ficar com os dentes artificiais",
);
conferir("sem quando usar vira nulo", cat[1].quandoUsar, null);

conferir("lista vazia", catalogoDeCasos([]).length, 0);
conferir("nulo não quebra", catalogoDeCasos(null).length, 0);
conferir("indefinido não quebra", catalogoDeCasos(undefined).length, 0);

// Caso sem arquivo não entra: o código existiria, o modelo o usaria, e a falha
// apareceria lá no download, com a conversa esperando.
const sujo = catalogoDeCasos([
  { id: "ok", titulo: "Bom", mediaPath: "casos/bom.jpg" },
  { id: "", titulo: "Sem id", mediaPath: "casos/x.jpg" },
  { id: "y", titulo: "", mediaPath: "casos/y.jpg" },
  { id: "z", titulo: "Sem arquivo", mediaPath: "" },
  { id: "w", titulo: "   ", mediaPath: "casos/w.jpg" },
]);
conferir("só o completo entra", sujo.length, 1);
conferir("e a numeração não pula", sujo[0].codigo, "C1");

// O teto existe para o modelo escolher o que combina, não o que sobrou.
const muitos = catalogoDeCasos(
  Array.from({ length: 30 }, (_, i) => ({
    id: `id${i}`,
    titulo: `Caso ${i}`,
    mediaPath: `casos/${i}.jpg`,
  })),
);
conferir("corta no teto", muitos.length, MAXIMO_DE_CASOS);
conferir("teto próprio", catalogoDeCasos(casos, 1).length, 1);
conferir("teto zero", catalogoDeCasos(casos, 0).length, 0);

// ── A escolha: o que vale ───────────────────────────────────────────────────

conferir("C1 devolve o caso", casoEscolhido({ codigo: "C1" }, cat)?.id, "a1");
conferir("C2 devolve o outro", casoEscolhido({ codigo: "C2" }, cat)?.id, "b2");
conferir("e o arquivo certo", casoEscolhido({ codigo: "C2" }, cat)?.mediaPath, "casos/lentes.jpg");
conferir("minúscula vale", casoEscolhido({ codigo: "c1" }, cat)?.id, "a1");
conferir("espaço em volta vale", casoEscolhido({ codigo: "  C1  " }, cat)?.id, "a1");

// ── A escolha: o que NÃO vale ───────────────────────────────────────────────
//
// Qualquer um destes mandando foto é uma imagem que ninguém autorizou saindo
// no WhatsApp de um desconhecido.

conferir("campo ausente", casoEscolhido({}, cat), null);
conferir("objeto nulo", casoEscolhido(null, cat), null);
conferir("indefinido", casoEscolhido(undefined, cat), null);
conferir("vazio", casoEscolhido({ codigo: "" }, cat), null);
conferir("só espaço", casoEscolhido({ codigo: "   " }, cat), null);
conferir("nulo", casoEscolhido({ codigo: null }, cat), null);
conferir("código inventado", casoEscolhido({ codigo: "C9" }, cat), null);
conferir("prefixo de horário", casoEscolhido({ codigo: "H1" }, cat), null);
// O caminho do arquivo no campo do código é o jeito mais direto de tentar
// mandar um arquivo que não está na lista.
conferir("caminho de arquivo", casoEscolhido({ codigo: "casos/lentes.jpg" }, cat), null);
conferir("outro caminho", casoEscolhido({ codigo: "../private/foto.jpg" }, cat), null);
conferir("título em vez do código", casoEscolhido({ codigo: "Lentes de resina" }, cat), null);
conferir("id em vez do código", casoEscolhido({ codigo: "b2" }, cat), null);
conferir("número", casoEscolhido({ codigo: 1 }, cat), null);
conferir("booleano", casoEscolhido({ codigo: true }, cat), null);
// Catálogo vazio recusa até um código bem formado: sem caso oferecido não há
// o que mandar.
conferir("C1 sem catálogo", casoEscolhido({ codigo: "C1" }, []), null);
conferir("catálogo nulo", casoEscolhido({ codigo: "C1" }, null as never), null);

// ── A instrução ─────────────────────────────────────────────────────────────

conferir("sem caso, nada a ensinar", comoUsarOsCasos([]).length, 0);

{
  const texto = comoUsarOsCasos(cat).join("\n");
  conferir("traz o código", texto.includes("**C1**"), true);
  conferir("e o título", texto.includes("Clareamento, resultado natural"), true);
  conferir("e o quando usar", texto.includes("quando a pessoa teme"), true);
  conferir("diz qual campo preencher", texto.includes("casoEnviado"), true);
  // O procedimento do catálogo saiu do cadastro: amarrar a foto a um item da
  // tabela de preços a deixava presa àquele item. Quem diz se o caso serve é o
  // "quando usar", e a instrução precisa dizer que ele é ASSUNTO, não condição
  // exata — senão a Luna volta a tratar "limpeza e clareamento" como uma coisa
  // só que não cobre quem falou de clareamento.
  conferir("o quando usar é assunto, não condição", texto.includes("não uma condição exata"), true);

  // A regra que protege: o caminho do arquivo NÃO pode aparecer na instrução.
  // Se aparecer, o modelo pode citá-lo na conversa ou tentar usá-lo direto.
  conferir("o arquivo não aparece", texto.includes("casos/clareamento-natural.jpg"), false);
  conferir("nem o outro", texto.includes("casos/lentes.jpg"), false);
  conferir("nem a extensão", texto.includes(".jpg"), false);

  conferir("proíbe em contexto clínico", texto.includes("dor, sintoma"), true);
  conferir("proíbe prometer o mesmo resultado", texto.includes("você vai ficar"), true);
  conferir("um por conversa", texto.includes("mais de um por conversa"), true);
  conferir("código fora da lista não manda", texto.includes("não manda nada"), true);
}

// Depois do primeiro caso, a instrução muda: a trava de "um por conversa" só
// funciona se o texto souber que já houve um — o modelo não lembra sozinho.
{
  const texto = comoUsarOsCasos(cat, true).join("\n");
  conferir("avisa que já mandou", texto.includes("já mandou um caso"), true);
  conferir("e não lista mais nenhum", texto.includes("**C1**"), false);
  conferir("nem ensina o campo", texto.includes("casoEnviado"), false);
}

console.log(`ok — ${feitas} checagens dos casos da IA`);
