import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Plug, PlugZap, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { desconectarConexaoPropria, getConexaoPropria } from "@/lib/atendimentos/conexao.functions";
import { formatWhatsappNumber } from "@/lib/atendimentos/phone";
import { cn } from "@/lib/utils";
import { ConectarWhatsapp } from "./ConectarWhatsapp";

// O card de conexão do Dashboard.
//
// ── Por que ele mostra DUAS linhas ──────────────────────────────────────
//
// Durante a migração existem duas conexões de verdade: a do CRM, que atende a
// clínica hoje, e a própria, que vai atender. O card mostrava só a primeira e
// escondia a segunda atrás de um botão tracejado escrito "(nova)" — então não
// dava para ver em qual delas o número estava, nem desligar uma para ligar a
// outra, que é exatamente o que a virada exige.
//
// A linha do CRM some sozinha quando ele estiver desconectado: aí a migração
// terminou e o card volta a ser de uma conexão só, sem ninguém precisar
// apagar nada.
//
// ── E "Conectar" é SEMPRE a conexão própria ─────────────────────────────
//
// Não existe mais caminho na tela para parear um número novo no CRM. Conectar
// ali seria andar para trás — a conexão própria é o destino, e deixar as duas
// portas abertas só criaria a chance de reconectar no lugar errado num dia de
// pressa. O CRM fica com uma ação só: desligar.

type EstadoDaConexao = "open" | "connecting" | "erro" | "off";

const PONTO: Record<EstadoDaConexao, string> = {
  open: "bg-success",
  connecting: "bg-warning",
  erro: "bg-danger",
  off: "bg-muted-foreground/40",
};

const ROTULO: Record<EstadoDaConexao, string> = {
  open: "Conectado",
  connecting: "Conectando…",
  erro: "Erro na conexão",
  off: "Desconectado",
};

export function WhatsappConnectionCard({
  dailyUsage,
}: {
  dailyUsage?: { limit: number; usedToday: number };
}) {
  const queryClient = useQueryClient();
  const buscarPropria = useServerFn(getConexaoPropria);
  const desligarPropria = useServerFn(desconectarConexaoPropria);

  const [conectarAberto, setConectarAberto] = useState(false);
  const [confirmando, setConfirmando] = useState<"propria" | null>(null);

  // Havia aqui uma segunda linha, a do CRM, e um botão para desconectar o
  // número de lá — a tela da migração. Ela saiu junto com a conta: o número
  // está na conexão própria desde 18/09.
  const propriaQuery = useQuery({
    queryKey: ["conexao-propria"],
    queryFn: () => buscarPropria(),
    staleTime: 8_000,
    refetchInterval: (q) => (q.state.data?.estado === "connecting" ? 4_000 : 20_000),
  });

  const propria = propriaQuery.data ?? null;

  const propriaEstado: EstadoDaConexao =
    propria?.estado === "open" ? "open" : propria?.estado === "connecting" ? "connecting" : "off";

  const desconectar = useMutation({
    mutationFn: async () => {
      await desligarPropria();
    },
    onSuccess: () => {
      toast.success("WhatsApp desconectado.");
      queryClient.invalidateQueries({ queryKey: ["conexao-propria"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setConfirmando(null),
  });

  return (
    <>
      <section className="surface-card flex h-full flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">WhatsApp</p>
        </div>

        <div className="divide-y divide-border">
          {/* A conexão própria vem primeiro: é ela que o sistema vai usar. */}
          <LinhaDeConexao
            titulo="Conexão própria"
            telefone={propria?.telefone ?? null}
            estado={propriaEstado}
            acao={
              propriaEstado === "open" ? (
                <BotaoDesconectar
                  onClick={() => setConfirmando("propria")}
                  ocupado={desconectar.isPending && confirmando === "propria"}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setConectarAberto(true)}
                  className="press ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-2 text-xs font-semibold text-white"
                >
                  <PlugZap className="h-3.5 w-3.5" strokeWidth={2} />
                  Conectar
                </button>
              )
            }
          />
        </div>

        {dailyUsage && (
          <div className="mt-auto">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="min-w-0 truncate">Envio diário de campanhas</span>
              <span className="shrink-0">
                {dailyUsage.usedToday}/{dailyUsage.limit}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-primary"
                style={{
                  width: `${dailyUsage.limit > 0 ? Math.min(100, Math.round((dailyUsage.usedToday / dailyUsage.limit) * 100)) : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </section>

      <ConectarWhatsapp open={conectarAberto} onOpenChange={setConectarAberto} />

      {/* Desconectar é ação de mão única: a clínica para de receber até
          alguém parear de novo. Confirmar aqui não é burocracia. */}
      <AlertDialog open={confirmando !== null} onOpenChange={(o) => !o && setConfirmando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar o WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              A clínica para de receber e de enviar mensagens até alguém escanear o QR Code de novo.
              As conversas já recebidas continuam aqui.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={desconectar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={desconectar.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmando) desconectar.mutate();
              }}
            >
              {desconectar.isPending ? "Desconectando…" : "Desconectar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BotaoDesconectar({ onClick, ocupado }: { onClick: () => void; ocupado: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      className="press ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
    >
      {ocupado ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Plug className="h-3.5 w-3.5" strokeWidth={2} />
      )}
      Desconectar
    </button>
  );
}

function LinhaDeConexao({
  titulo,
  telefone,
  estado,
  nota,
  extra,
  acao,
}: {
  titulo: string;
  telefone: string | null;
  estado: EstadoDaConexao;
  nota?: string | null;
  extra?: React.ReactNode;
  acao: React.ReactNode;
}) {
  const conectado = estado === "open";
  const formatado = formatWhatsappNumber(telefone);
  return (
    // `flex-wrap` com piso de largura no texto: o número não encolhe para
    // caber ao lado do botão — em 360px "+55 (48) 98419-5309" sairia cortado,
    // e número cortado é número errado. O botão é que desce para a linha de
    // baixo quando a largura acaba.
    <div className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
          conectado ? "bg-success-soft text-success" : "bg-surface-muted text-muted-foreground",
        )}
      >
        {conectado ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : estado === "erro" ? (
          <X className="h-4 w-4 text-danger" strokeWidth={2.5} />
        ) : (
          <Plug className="h-4 w-4" strokeWidth={1.75} />
        )}
      </span>

      {/* SEM `min-w-0` e sem largura chutada, de propósito. É a ausência do
          `min-w-0` que faz o bloco de texto não encolher abaixo do próprio
          conteúdo mínimo — e como o número está em `whitespace-nowrap`, esse
          mínimo é o número inteiro. Resultado: o botão desce sozinho quando o
          número não cabe ao lado, e fica na mesma linha quando cabe. */}
      <div className="flex-1">
        <p className="whitespace-nowrap text-sm font-medium">
          {conectado && formatado ? formatado : titulo}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PONTO[estado])} />
          <span className={conectado ? "text-success" : "text-muted-foreground"}>
            {conectado && formatado ? `${ROTULO[estado]} · ${titulo}` : ROTULO[estado]}
          </span>
        </p>
        {nota && <p className="mt-1 text-2xs leading-tight text-foreground-subtle">{nota}</p>}
        {extra && <div className="mt-1">{extra}</div>}
      </div>

      {acao}
    </div>
  );
}
