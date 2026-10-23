import { SeletorDeMes } from "./SeletorDeMes";

/**
 * O topo das telas financeiras.
 *
 * Tinha "Hoje · 7 dias · 30 dias · 90 dias" ao lado de um calendário. Nenhuma
 * dessas janelas fecha uma conta da clínica, e o padrão — últimos 30 dias
 * corridos — mostrava metade de um mês e metade do outro. Ver `SeletorDeMes`.
 */
export function PageHeader({
  titulo = "Financeiro",
  subtitulo = "Resumo financeiro da clínica",
  from,
  to,
  onRangeChange,
  acoes,
}: {
  titulo?: string;
  subtitulo?: string;
  from?: string;
  to?: string;
  onRangeChange: (r: { from?: string; to?: string }) => void;
  /** Ações da tela — entram à ESQUERDA dos controles de período, porque
   *  registrar algo é decisão, e escolher período é ajuste de vista. */
  acoes?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-[1.1] tracking-tight lg:text-3xl">
          {titulo}
        </h1>
        <p className="mt-1 hidden text-sm text-muted-foreground lg:block">{subtitulo}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {acoes}
        <SeletorDeMes from={from} to={to} onChange={onRangeChange} />
      </div>
    </header>
  );
}
