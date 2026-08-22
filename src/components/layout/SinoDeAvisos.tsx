import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import {
  listarAvisos,
  marcarTodosLidos,
  type AvisoDaClinica,
} from "@/lib/notifications/inbox.functions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// O sino da clínica.
//
// Antes disto havia DOIS sinos diferentes: no desktop, um `<button>` sem
// `onClick` nenhum e com uma bolinha vermelha fixa no código — sempre acesa,
// mesmo sem nada para ver; no celular, um `Link` para Configurações. Este
// componente substitui os dois, e a bolinha passa a significar alguma coisa.

function quando(iso: string): string {
  const agora = Date.now();
  const minutos = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

function Linha({ aviso, onIr }: { aviso: AvisoDaClinica; onIr: () => void }) {
  const conteudo = (
    <>
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          aviso.lido ? "bg-transparent" : "bg-coral",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{aviso.title}</span>
        {aviso.body && (
          <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">
            {aviso.body}
          </span>
        )}
        <span className="mt-1 block text-3xs text-muted-foreground/80">{quando(aviso.createdAt)}</span>
      </span>
    </>
  );

  // Aviso sem destino não vira link: um item clicável que não leva a lugar
  // nenhum é pior do que um item que assume ser só informação.
  if (!aviso.url) {
    return <div className="flex gap-2.5 px-4 py-3">{conteudo}</div>;
  }
  return (
    <Link
      to={aviso.url}
      onClick={onIr}
      className="flex gap-2.5 px-4 py-3 transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
    >
      {conteudo}
    </Link>
  );
}

export function SinoDeAvisos({ className }: { className?: string }) {
  const buscar = useServerFn(listarAvisos);
  const lerTudo = useServerFn(marcarTodosLidos);
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);

  const caixa = useQuery({
    queryKey: ["clinic-notifications"],
    queryFn: () => buscar(),
    staleTime: 30_000,
    // O aviso chega por evento externo (paciente responde, cron roda), não por
    // ação de quem está olhando a tela — então revalidar ao voltar para a aba é
    // o que mantém o contador honesto sem ficar consultando de minuto em minuto.
    refetchOnWindowFocus: true,
  });

  const marcar = useMutation({
    mutationFn: () => lerTudo(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clinic-notifications"] }),
  });

  const avisos = caixa.data?.avisos ?? [];
  const naoLidos = caixa.data?.naoLidos ?? 0;

  return (
    <Popover
      open={aberto}
      onOpenChange={(o) => {
        setAberto(o);
        // Marca ao ABRIR, não ao fechar: quem abriu viu. Fazer no fechamento
        // deixaria o contador aceso enquanto a lista está na frente da pessoa.
        if (o && naoLidos > 0) marcar.mutate();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={naoLidos > 0 ? `Avisos (${naoLidos} novos)` : "Avisos"}
          className={cn(
            "press relative grid place-items-center rounded-2xl border border-border bg-card shadow-soft",
            className,
          )}
        >
          <Bell className="h-5 w-5 text-foreground" strokeWidth={1.75} />
          {naoLidos > 0 && (
            <span className="absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full border-2 border-card bg-danger px-1 text-3xs font-bold leading-none text-white">
              {naoLidos > 9 ? "9+" : naoLidos}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Avisos</p>
        </div>
        {caixa.isLoading ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : !avisos.length ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum aviso por aqui.
          </p>
        ) : (
          <div className="custom-scroll max-h-[60vh] divide-y divide-border overflow-y-auto overflow-x-hidden">
            {avisos.map((a) => (
              <Linha key={a.id} aviso={a} onIr={() => setAberto(false)} />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
