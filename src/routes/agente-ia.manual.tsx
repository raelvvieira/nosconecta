import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Loader2, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PageHeading } from "@/components/layout/PageHeading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getEstadoDoAgente,
  getInstrucaoDoAgente,
  salvarCorrecao,
} from "@/lib/agente-ia/agente.functions";
import { SECOES, foiCorrigido, textoDoCampo, type CampoDoManual } from "@/lib/agente-ia/manual";

export const Route = createFileRoute("/agente-ia/manual")({
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar o manual"
      description="Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: ManualPage,
});

function ManualPage() {
  const queryClient = useQueryClient();
  const buscarEstado = useServerFn(getEstadoDoAgente);
  const buscarInstrucao = useServerFn(getInstrucaoDoAgente);
  const salvar = useServerFn(salvarCorrecao);

  const estadoQuery = useQuery({ queryKey: ["agente-ia"], queryFn: () => buscarEstado() });
  const estado = estadoQuery.data;

  const [editando, setEditando] = useState<CampoDoManual | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [verInstrucao, setVerInstrucao] = useState(false);

  const instrucaoQuery = useQuery({
    queryKey: ["agente-ia-instrucao"],
    queryFn: () => buscarInstrucao(),
    enabled: verInstrucao,
  });

  useEffect(() => {
    if (!editando || !estado) return;
    setRascunho(textoDoCampo(editando, estado.aprendido, estado.correcoes));
  }, [editando, estado]);

  const confirmar = async () => {
    if (!editando) return;
    setSalvando(true);
    try {
      await salvar({ data: { campo: editando, valor: rascunho } });
      await queryClient.invalidateQueries({ queryKey: ["agente-ia"] });
      await queryClient.invalidateQueries({ queryKey: ["agente-ia-instrucao"] });
      setEditando(null);
      toast.success("Correção salva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const vazio = estado && estado.vendas === 0;

  return (
    <main className="w-full min-w-0 flex-1 px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-10 lg:pt-9">
      <PageHeading
        className="pr-16 lg:pr-0"
        icon={BookOpen}
        title="Manual"
        subtitle="O jeito desta clínica atender, escrito a partir do que deu certo."
        actions={
          <Button variant="outline" onClick={() => setVerInstrucao(true)}>
            Ver instrução
          </Button>
        }
      />

      {estadoQuery.isPending ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : vazio ? (
        <p className="mt-10 rounded-3xl border border-border bg-white/70 p-8 text-center text-sm text-muted-foreground">
          Nada aprendido ainda. Marque as etapas de vitória no Agente e mova alguns cards até lá.
        </p>
      ) : (
        <div className="mt-8 grid gap-3 xl:grid-cols-2 xl:items-start">
          {SECOES.map(({ campo, titulo, pergunta }) => {
            const texto = estado ? textoDoCampo(campo, estado.aprendido, estado.correcoes) : "";
            const corrigido = estado ? foiCorrigido(campo, estado.correcoes) : false;
            return (
              <section key={campo} className="rounded-3xl border border-border bg-white/70 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{titulo}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{pergunta}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Quem lê precisa saber o que é da IA e o que a equipe
                        escreveu. Sem esta marca, uma correção some dentro do
                        texto aprendido e ninguém sabe mais o que é o quê. */}
                    {corrigido && (
                      <span className="rounded-full bg-coral-soft px-2.5 py-0.5 text-2xs font-semibold text-coral">
                        Corrigido
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditando(campo)}
                      className="press grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
                      aria-label={`Corrigir ${titulo}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                  {texto || <span className="text-muted-foreground">Ainda não aprendido.</span>}
                </p>
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{SECOES.find((s) => s.campo === editando)?.titulo}</DialogTitle>
            <DialogDescription>
              Sua correção fica por cima do aprendido e sobrevive às próximas rodadas.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            rows={9}
            className="resize-none"
            placeholder="Escreva como a equipe realmente faz."
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button variant="premium" disabled={salvando} onClick={() => void confirmar()}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={verInstrucao} onOpenChange={setVerInstrucao}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-coral" />
              Instrução do agente
            </DialogTitle>
            <DialogDescription>
              O texto exato que ele recebe. As regras de segurança do fim não são editáveis.
            </DialogDescription>
          </DialogHeader>
          {instrucaoQuery.isPending ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-muted p-4 text-xs leading-5">
              {instrucaoQuery.data}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
