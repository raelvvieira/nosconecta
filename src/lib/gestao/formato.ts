// Como os números do painel de Gestão aparecem na tela.

const inteiros = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const umaCasa = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** "R$ 17.468" — sem centavos: num painel de gestão, centavo é ruído. */
export function reais(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const texto = inteiros.format(Math.abs(Math.round(n)));
  return `${n < 0 ? "−" : ""}R$ ${texto}`;
}

/** "27,3%". */
export function pct(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${semZero(umaCasa.format(n))}%`;
}

/** "544,0" → "544": a casa decimal só aparece quando diz alguma coisa. */
function semZero(texto: string): string {
  return texto.replace(/,0$/, "");
}

/** "+1,1 p.p." / "−35,2 p.p." — a variação de um indicador que já é %. */
export function pp(n: number | null | undefined): string | null {
  if (n === null || n === undefined || Math.abs(n) < 0.05) return null;
  return `${n > 0 ? "+" : "−"}${umaCasa.format(Math.abs(n))} p.p.`;
}

/** Horas com uma casa: "41,5 h". */
export function horas(n: number): string {
  return `${semZero(umaCasa.format(n))} h`;
}

export function inteiro(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : inteiros.format(n);
}

/** "Outubro de 2026". */
export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return t.charAt(0).toUpperCase() + t.slice(1).replace(" de ", " de ");
}

/** "out" — para o eixo do gráfico. */
export function mesCurto(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1))
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "");
}
