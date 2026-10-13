// Onde cada consulta fica quando duas acontecem ao mesmo tempo.
//
// ── O que estava errado ─────────────────────────────────────────────────────
//
// Todo cartão era desenhado com `left: 4, right: 4` — a largura inteira da
// coluna do dia. A altura sempre esteve certa (proporcional ao minuto), então
// uma consulta de 1h30 ocupava mesmo 1h30 de grade. O problema era a largura:
// quem começava depois cobria quem já estava lá.
//
// Em 13/10 isso escondeu uma paciente. Letícia das 14:00 às 15:30 e Andressa
// das 15:00 às 16:00: o cartão da Andressa tapou a metade de baixo do da
// Letícia, inclusive o nome do procedimento e o "ver resposta". Quem olhasse a
// semana veria uma consulta onde havia duas.
//
// ── A regra ────────────────────────────────────────────────────────────────
//
// É a de qualquer agenda: consultas que se cruzam no tempo dividem a largura,
// lado a lado. Quem não cruza com ninguém continua ocupando tudo.
//
// Em duas etapas, porque são duas perguntas diferentes:
//
// 1. **Grupo** — quem precisa dividir espaço com quem. É transitivo: A cruza
//    com B, B cruza com C, e mesmo que A e C não se toquem os três dividem a
//    mesma largura. Sem isso, A e C ficariam na coluna 0 com larguras
//    diferentes e as bordas não alinhariam.
// 2. **Coluna** — dentro do grupo, cada consulta vai para a primeira coluna
//    livre naquele intervalo. Uma coluna fica livre de novo assim que a
//    consulta que a ocupava termina, que é o que faz três consultas seguidas
//    de meia hora caberem numa coluna só.
//
// ── Por que módulo puro ────────────────────────────────────────────────────
//
// Porque é geometria, e geometria errada aqui some com paciente da tela — o
// tipo de defeito que ninguém reporta, porque ninguém vê o que não apareceu.
// Dá para exercitar encaixe perfeito, cruzamento parcial, três em cima da
// mesma hora e o caso que engana (uma acaba exatamente quando a outra começa)
// sem montar componente nenhum. Ver `tests/sobreposicao.ts`.

/** O mínimo que este cálculo precisa saber de uma consulta. */
export interface PeriodoNaGrade {
  id: string;
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
}

/** Onde o cartão fica, em fração da largura da coluna do dia. */
export interface LugarNaColuna {
  /** 0 = encostado à esquerda; 0.5 = na metade. */
  esquerda: number;
  /** 1 = largura inteira; 0.5 = metade. */
  largura: number;
}

function emMinutos(hora: string): number {
  const [h, m] = String(hora ?? "").split(":");
  const hh = Number(h);
  const mm = Number(m);
  return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}

/**
 * Duas consultas ocupam o mesmo instante?
 *
 * Encostar NÃO é cruzar: uma que termina 15:00 e outra que começa 15:00 são
 * seguidas, não simultâneas, e tratá-las como simultâneas espremeria metade da
 * agenda de uma clínica que marca de hora em hora — que é o caso desta.
 */
function cruzam(a: PeriodoNaGrade, b: PeriodoNaGrade): boolean {
  return (
    emMinutos(a.startTime) < emMinutos(b.endTime) && emMinutos(b.startTime) < emMinutos(a.endTime)
  );
}

/**
 * O lugar de cada consulta na largura da coluna, por id.
 *
 * Consulta sozinha fica com a largura inteira — o caso comum numa clínica com
 * uma profissional, e o que não pode regredir por causa do caso raro.
 *
 * A ordem de entrada não importa para o resultado: a função ordena por início
 * (e, empatando, pela mais longa primeiro, para a maior ficar à esquerda, que é
 * como se lê). Depender da ordem do banco faria o mesmo dia desenhar diferente
 * conforme a consulta voltasse da consulta em outra sequência.
 */
export function lugaresNaColuna(periodos: PeriodoNaGrade[]): Map<string, LugarNaColuna> {
  const lugares = new Map<string, LugarNaColuna>();
  const lista = (Array.isArray(periodos) ? periodos : []).filter((p) => p?.id);
  if (!lista.length) return lugares;

  const ordenados = [...lista].sort((a, b) => {
    const porInicio = emMinutos(a.startTime) - emMinutos(b.startTime);
    if (porInicio !== 0) return porInicio;
    const duracao = (p: PeriodoNaGrade) => emMinutos(p.endTime) - emMinutos(p.startTime);
    const porDuracao = duracao(b) - duracao(a);
    // Terceiro critério pelo id: sem ele, duas consultas idênticas no horário
    // trocariam de lado entre renderizações, e o cartão pularia na tela.
    return porDuracao !== 0 ? porDuracao : a.id.localeCompare(b.id);
  });

  // ── 1. Os grupos ──────────────────────────────────────────────────────
  //
  // Um grupo se fecha quando chega uma consulta que começa depois do fim mais
  // tardio de todas as anteriores: daí em diante nada mais cruza com nada do
  // que ficou para trás.
  const grupos: PeriodoNaGrade[][] = [];
  let grupo: PeriodoNaGrade[] = [];
  let fimDoGrupo = -1;

  for (const p of ordenados) {
    if (grupo.length && emMinutos(p.startTime) >= fimDoGrupo) {
      grupos.push(grupo);
      grupo = [];
      fimDoGrupo = -1;
    }
    grupo.push(p);
    fimDoGrupo = Math.max(fimDoGrupo, emMinutos(p.endTime));
  }
  if (grupo.length) grupos.push(grupo);

  // ── 2. As colunas dentro de cada grupo ────────────────────────────────
  for (const g of grupos) {
    // `colunas[i]` guarda a consulta que ocupa a coluna `i` por último.
    const colunas: PeriodoNaGrade[][] = [];
    const daConsulta = new Map<string, number>();

    for (const p of g) {
      let escolhida = colunas.findIndex((col) => !col.some((outra) => cruzam(outra, p)));
      if (escolhida === -1) {
        colunas.push([]);
        escolhida = colunas.length - 1;
      }
      colunas[escolhida].push(p);
      daConsulta.set(p.id, escolhida);
    }

    const largura = 1 / colunas.length;
    for (const p of g) {
      const coluna = daConsulta.get(p.id) ?? 0;
      lugares.set(p.id, { esquerda: coluna * largura, largura });
    }
  }

  return lugares;
}

/** A largura inteira — para quem não estiver no mapa, que não devia acontecer. */
export const COLUNA_INTEIRA: LugarNaColuna = { esquerda: 0, largura: 1 };
