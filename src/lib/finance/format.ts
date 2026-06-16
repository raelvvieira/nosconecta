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
