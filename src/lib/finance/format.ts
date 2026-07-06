/**
 * Converte um valor digitado em número, aceitando formatos brasileiros e
 * internacionais: "32.240,00", "32240,00", "32240", "32.240", "32240.00",
 * "R$ 1.234,56". Retorna NaN se não houver dígitos.
 */
export const parseBRLInput = (raw: string): number => {
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/[^0-9.,-]/g, "");
  if (!s) return NaN;
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (!s) return NaN;

  if (s.includes(",")) {
    // Vírgula é o separador decimal; pontos são de milhar.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".")) {
    const parts = s.split(".");
    const last = parts[parts.length - 1];
    // Mais de um ponto, ou último grupo com 3 dígitos → separador de milhar.
    if (parts.length > 2 || last.length === 3) {
      s = parts.join("");
    }
    // caso contrário, mantém o ponto como decimal (ex: "32240.00", "1.5")
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
};

export const formatBRL = (value: number, opts: { compact?: boolean } = {}) => {
  if (opts.compact) {
    const abs = Math.abs(value);
    if (abs >= 1000) {
      return `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
    }
  }
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
};

export const formatPercent = (value: number, digits = 0) =>
  `${value >= 0 ? "" : ""}${value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;

export const formatDateBR = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export const formatDateBRFull = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
