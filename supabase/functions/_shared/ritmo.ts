// O ritmo de uma fila de disparo: quando cada mensagem sai.
//
// Fica aqui, e não inline no `handleCreate`, por dois motivos. Primeiro porque
// é a conta que decide se o número da clínica é bloqueado — mandar 200
// mensagens é uma coisa, mandar 200 em cadência de metrônomo é outra, e é a
// segunda que os sistemas antispam reconhecem. Segundo porque este arquivo não
// importa nada do Deno, então dá para exercitá-lo com bun fora da Edge Function
// (que o `bunx tsc` do projeto não cobre).
//
// O horário de cada alvo é gravado na criação (`scheduled_for`), não decidido
// no envio: assim a fila é previsível, dá para dizer a que horas termina, e o
// cron não guarda estado nenhum — só manda o que já venceu.

export interface Ritmo {
  /** Menor intervalo entre duas mensagens, em segundos. */
  minSegundos: number;
  /** Maior intervalo. Igual ao mínimo = cadência fixa. */
  maxSegundos: number;
  /** Pausa longa a cada N mensagens. `0` desliga. */
  pausarACada: number;
  /** Quanto dura essa pausa, em minutos. */
  retomarEmMinutos: number;
}

export const RITMO_PADRAO: Ritmo = {
  minSegundos: 5,
  maxSegundos: 10,
  pausarACada: 0,
  retomarEmMinutos: 5,
};

/** Limites de sanidade. Existem para um valor absurdo vindo de fora não gerar
 *  uma fila que termina daqui a três meses — nem uma rajada de 1 em 1ms. */
export const LIMITES = {
  minSegundos: 1,
  maxSegundos: 300,
  pausarACada: 500,
  retomarEmMinutos: 240,
};

export function normalizarRitmo(bruto: Partial<Ritmo> | null | undefined): Ritmo {
  const r = { ...RITMO_PADRAO, ...(bruto ?? {}) };
  const min = clamp(Math.round(r.minSegundos), LIMITES.minSegundos, LIMITES.maxSegundos);
  // O máximo nunca fica abaixo do mínimo: invertidos, a faixa seria vazia e o
  // sorteio devolveria NaN silenciosamente.
  const max = clamp(Math.round(r.maxSegundos), min, LIMITES.maxSegundos);
  return {
    minSegundos: min,
    maxSegundos: max,
    pausarACada: clamp(Math.round(r.pausarACada), 0, LIMITES.pausarACada),
    retomarEmMinutos: clamp(Math.round(r.retomarEmMinutos), 0, LIMITES.retomarEmMinutos),
  };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Os horários de saída de cada mensagem, em milissegundos.
 *
 * `sortear` é injetado para o teste poder fixar o acaso — sem isso não há como
 * afirmar nada sobre uma função que depende de `Math.random`.
 */
export function horariosDaFila(
  quantidade: number,
  ritmo: Ritmo,
  inicio: number,
  sortear: () => number = Math.random,
): number[] {
  const r = normalizarRitmo(ritmo);
  const horarios: number[] = [];
  let t = inicio;

  for (let i = 0; i < quantidade; i++) {
    if (i > 0) {
      // Intervalo sorteado dentro da faixa. Cadência irregular parece gente;
      // intervalo exato é o padrão que denuncia envio automático.
      const faixa = r.maxSegundos - r.minSegundos;
      const intervalo = r.minSegundos + Math.floor(sortear() * (faixa + 1));
      t += intervalo * 1000;

      // A pausa longa entra ANTES da mensagem que abre o próximo bloco, então
      // ela conta blocos fechados: com `pausarACada: 50`, a pausa acontece
      // entre a 50ª e a 51ª.
      if (r.pausarACada > 0 && i % r.pausarACada === 0) {
        t += r.retomarEmMinutos * 60 * 1000;
      }
    }
    horarios.push(t);
  }
  return horarios;
}

/** Quanto tempo a fila inteira leva, em minutos — o número que a tela promete
 *  antes de disparar. Usa a média da faixa, não o mínimo: prometer o melhor
 *  caso e entregar o pior é pior do que prometer a média. */
export function duracaoEstimadaMinutos(quantidade: number, ritmo: Ritmo): number {
  if (quantidade <= 1) return 0;
  const r = normalizarRitmo(ritmo);
  const intervalos = quantidade - 1;
  const medio = (r.minSegundos + r.maxSegundos) / 2;
  const pausas = r.pausarACada > 0 ? Math.floor(intervalos / r.pausarACada) : 0;
  const segundos = intervalos * medio + pausas * r.retomarEmMinutos * 60;
  return Math.round(segundos / 60);
}
