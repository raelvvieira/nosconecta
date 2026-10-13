// Onde cada consulta fica quando duas acontecem ao mesmo tempo.
//
// Em 13/10 o cartão da Andressa (15:00–16:00) tapou a metade de baixo do da
// Letícia (14:00–15:30), inclusive o procedimento e o "ver resposta". Quem
// olhasse a semana veria uma consulta onde havia duas — e esse é o tipo de
// defeito que ninguém reporta, porque ninguém vê o que não apareceu.
import { lugaresNaColuna, type PeriodoNaGrade } from "../src/lib/agenda/sobreposicao";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  if (real !== esperado) {
    console.error(`FALHOU ${oQue}: esperava ${String(esperado)}, veio ${String(real)}`);
    process.exit(1);
  }
}

const p = (id: string, startTime: string, endTime: string): PeriodoNaGrade => ({
  id,
  startTime,
  endTime,
});

// ── O caso que motivou tudo ─────────────────────────────────────────────────

{
  const lugares = lugaresNaColuna([
    p("leticia", "14:00", "15:30"),
    p("andressa", "15:00", "16:00"),
  ]);
  conferir("as duas aparecem", lugares.size, 2);
  conferir("Letícia fica à esquerda", lugares.get("leticia")?.esquerda, 0);
  conferir("e com metade da largura", lugares.get("leticia")?.largura, 0.5);
  conferir("Andressa vai para a direita", lugares.get("andressa")?.esquerda, 0.5);
  conferir("com a outra metade", lugares.get("andressa")?.largura, 0.5);
}

// ── Sozinha ocupa tudo ──────────────────────────────────────────────────────
//
// O caso comum numa clínica com uma profissional. Não pode regredir por causa
// do caso raro.

{
  const lugares = lugaresNaColuna([p("a", "14:00", "15:00")]);
  conferir("uma só fica inteira", lugares.get("a")?.largura, 1);
  conferir("e encostada à esquerda", lugares.get("a")?.esquerda, 0);
}

// ── Encostar não é cruzar ───────────────────────────────────────────────────
//
// Uma termina 15:00 e a outra começa 15:00: são seguidas, não simultâneas.
// Tratá-las como simultâneas espremeria metade da agenda de uma clínica que
// marca de hora em hora — que é o caso desta.

{
  const lugares = lugaresNaColuna([p("a", "14:00", "15:00"), p("b", "15:00", "16:00")]);
  conferir("a primeira fica inteira", lugares.get("a")?.largura, 1);
  conferir("a segunda também", lugares.get("b")?.largura, 1);
  conferir("as duas à esquerda", lugares.get("b")?.esquerda, 0);
}

// Um minuto de cruzamento já é cruzamento.
{
  const lugares = lugaresNaColuna([p("a", "14:00", "15:01"), p("b", "15:00", "16:00")]);
  conferir("um minuto já divide", lugares.get("a")?.largura, 0.5);
}

// ── Três ao mesmo tempo ─────────────────────────────────────────────────────

{
  const lugares = lugaresNaColuna([
    p("a", "14:00", "15:00"),
    p("b", "14:00", "15:00"),
    p("c", "14:00", "15:00"),
  ]);
  conferir("três dividem em três", lugares.get("a")?.largura, 1 / 3);
  conferir("primeira coluna", lugares.get("a")?.esquerda, 0);
  conferir("segunda coluna", lugares.get("b")?.esquerda, 1 / 3);
  conferir("terceira coluna", lugares.get("c")?.esquerda, 2 / 3);
}

// ── A coluna se libera quando a consulta acaba ──────────────────────────────
//
// É isto que faz três consultas seguidas de meia hora caberem numa coluna só,
// em vez de virarem três colunas magras.

{
  const lugares = lugaresNaColuna([
    p("longa", "14:00", "17:00"),
    p("curta1", "14:00", "14:30"),
    p("curta2", "15:00", "15:30"),
    p("curta3", "16:00", "16:30"),
  ]);
  conferir("duas colunas bastam", lugares.get("longa")?.largura, 0.5);
  conferir("a longa fica à esquerda", lugares.get("longa")?.esquerda, 0);
  conferir("as curtas dividem a segunda coluna", lugares.get("curta1")?.esquerda, 0.5);
  conferir("a segunda curta reusa a coluna", lugares.get("curta2")?.esquerda, 0.5);
  conferir("e a terceira também", lugares.get("curta3")?.esquerda, 0.5);
}

// ── O grupo é transitivo ────────────────────────────────────────────────────
//
// A cruza com B, B cruza com C, e A e C não se tocam. Mesmo assim os três
// dividem a mesma largura: sem isso, A e C ficariam na coluna 0 com larguras
// diferentes e as bordas não alinhariam na tela.

{
  const lugares = lugaresNaColuna([
    p("a", "14:00", "15:00"),
    p("b", "14:30", "15:30"),
    p("c", "15:00", "16:00"),
  ]);
  conferir("A e C não se tocam mas dividem igual", lugares.get("a")?.largura, 0.5);
  conferir("C também", lugares.get("c")?.largura, 0.5);
  // C cabe na coluna que A deixou livre às 15:00.
  conferir("C reusa a coluna de A", lugares.get("c")?.esquerda, 0);
  conferir("B fica na outra", lugares.get("b")?.esquerda, 0.5);
}

// ── Grupos separados não se contaminam ──────────────────────────────────────

{
  const lugares = lugaresNaColuna([
    p("manha1", "08:00", "09:00"),
    p("manha2", "08:30", "09:30"),
    p("tarde", "15:00", "16:00"),
  ]);
  conferir("as da manhã dividem", lugares.get("manha1")?.largura, 0.5);
  conferir("a da tarde fica inteira", lugares.get("tarde")?.largura, 1);
  conferir("e à esquerda", lugares.get("tarde")?.esquerda, 0);
}

// ── A ordem de entrada não muda o desenho ───────────────────────────────────
//
// Depender da ordem do banco faria o mesmo dia desenhar diferente conforme as
// consultas voltassem da consulta em outra sequência — e o cartão pularia de
// lado sem nada ter mudado.

{
  const dados = [p("a", "14:00", "15:30"), p("b", "15:00", "16:00"), p("c", "14:00", "14:30")];
  const direto = lugaresNaColuna(dados);
  const invertido = lugaresNaColuna([...dados].reverse());
  for (const id of ["a", "b", "c"]) {
    conferir(`${id} no mesmo lugar`, direto.get(id)?.esquerda, invertido.get(id)?.esquerda);
    conferir(`${id} com a mesma largura`, direto.get(id)?.largura, invertido.get(id)?.largura);
  }
}

// Empate perfeito: a mais longa fica à esquerda, que é como se lê.
{
  const lugares = lugaresNaColuna([p("curta", "14:00", "14:30"), p("longa", "14:00", "16:00")]);
  conferir("a mais longa à esquerda", lugares.get("longa")?.esquerda, 0);
  conferir("a curta à direita", lugares.get("curta")?.esquerda, 0.5);
}

// ── O que não pode quebrar ──────────────────────────────────────────────────

conferir("lista vazia", lugaresNaColuna([]).size, 0);
conferir("nulo não quebra", lugaresNaColuna(null as never).size, 0);
conferir("indefinido não quebra", lugaresNaColuna(undefined as never).size, 0);
conferir("sem id fica de fora", lugaresNaColuna([p("", "14:00", "15:00")]).size, 0);

// Hora mal formada não derruba a agenda inteira: a consulta vai para o começo
// do dia, visivelmente errada, e o resto continua desenhado. Sumir com a grade
// toda por causa de uma linha torta seria pior.
{
  const lugares = lugaresNaColuna([p("torta", "", ""), p("boa", "14:00", "15:00")]);
  conferir("a boa continua inteira", lugares.get("boa")?.largura, 1);
  conferir("e a torta aparece", lugares.has("torta"), true);
}

// Consulta de duração zero — dado estranho que existe no banco de clínica.
{
  const lugares = lugaresNaColuna([p("zero", "14:00", "14:00"), p("normal", "14:00", "15:00")]);
  conferir("duração zero não cruza com ninguém", lugares.get("normal")?.largura, 1);
}

// Uma agenda cheia de verdade, para a conta não explodir em nada.
{
  const muitas = Array.from({ length: 40 }, (_, i) =>
    p(
      `id${i}`,
      `${String(8 + (i % 10)).padStart(2, "0")}:00`,
      `${String(9 + (i % 10)).padStart(2, "0")}:00`,
    ),
  );
  const lugares = lugaresNaColuna(muitas);
  conferir("todas recebem lugar", lugares.size, 40);
}

console.log(`ok — ${feitas} checagens da sobreposição na agenda`);
