import { Sidebar } from "@/components/finance/Sidebar";
import { Skeleton } from "@/components/ui/skeleton";

// Enquanto o loader não volta, a rota mostrava tela branca — o app parecia
// travado. O esqueleto reproduz a silhueta da tela que vai chegar, então a
// troca é uma revelação e não um salto: mesma moldura, mesmas posições.
//
// A barra lateral é a de verdade, não um bloco cinza. Ela não depende de
// dado nenhum e continua navegável durante o carregamento.

type Shape = "kpis" | "list" | "board" | "calendar";

function Line({ className }: { className?: string }) {
  return <Skeleton className={className ?? "h-4 w-full"} />;
}

function KpiBlock() {
  return (
    <div className="surface-card space-y-3 p-4 md:p-5">
      <div className="flex items-center justify-between">
        <Line className="h-3 w-20" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      <Line className="h-7 w-28" />
      <Line className="h-3 w-32" />
    </div>
  );
}

function RowBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 md:px-5">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Line className="h-3.5 w-[45%]" />
        {!compact && <Line className="h-3 w-[28%]" />}
      </div>
      <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
    </div>
  );
}

function ShapeBody({ shape }: { shape: Shape }) {
  if (shape === "board") {
    return (
      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2, 3].map((column) => (
          <div key={column} className="w-[280px] shrink-0 space-y-3">
            <Line className="h-4 w-28" />
            {[0, 1, 2].map((card) => (
              <div key={card} className="surface-card space-y-2.5 p-4">
                <Line className="h-3.5 w-[70%]" />
                <Line className="h-3 w-[45%]" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (shape === "calendar") {
    return (
      <div className="surface-card overflow-hidden p-4 md:p-5">
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl md:h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {shape === "kpis" && (
        <div className="grid grid-cols-2 gap-3 md:gap-5 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <KpiBlock key={i} />)}
        </div>
      )}

      <div className="surface-card divide-y divide-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-4 md:px-5">
          <Line className="h-4 w-36" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => <RowBlock key={i} compact={shape === "kpis"} />)}
      </div>
    </>
  );
}

export function RouteSkeleton({ shape = "list" }: { shape?: Shape }) {
  return (
    <div className="app-bg flex h-dvh overflow-hidden" aria-busy="true" aria-live="polite">
      <Sidebar />
      <span className="sr-only">Carregando…</span>
      <main className="custom-scroll min-w-0 flex-1 space-y-5 overflow-y-auto px-4 pb-nav pt-[calc(env(safe-area-inset-top)+52px)] md:px-6 lg:px-10 lg:pb-8 lg:pt-8">
        <div className="space-y-2">
          <Line className="h-7 w-52" />
          <Line className="h-4 w-40" />
        </div>
        <ShapeBody shape={shape} />
      </main>
    </div>
  );
}
