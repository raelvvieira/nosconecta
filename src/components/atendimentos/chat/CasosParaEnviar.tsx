import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listarCasosParaEnviar, type CasoParaEnviar } from "@/lib/agente-ia/casos.functions";

// Os antes e depois da biblioteca, para anexar na conversa com um toque.
//
// A foto é baixada pela URL assinada e entra como um anexo comum: a pessoa
// vê na bandeja, pode tirar, escrever junto e manda pelo mesmo caminho de
// "Fotos e Vídeos". Nada sai sem ela apertar enviar.

function extensao(tipo: string): string {
  if (tipo.includes("png")) return "png";
  if (tipo.includes("webp")) return "webp";
  return "jpg";
}

export function CasosParaEnviar({
  open,
  onOpenChange,
  onEscolher,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEscolher: (arquivo: File) => Promise<void>;
}) {
  const listar = useServerFn(listarCasosParaEnviar);
  const casos = useQuery({
    queryKey: ["casos-para-enviar"],
    queryFn: () => listar(),
    enabled: open,
    // As URLs assinadas valem 30 minutos; refaz antes disso.
    staleTime: 10 * 60_000,
  });
  const [baixando, setBaixando] = useState<string | null>(null);

  const escolher = async (caso: CasoParaEnviar) => {
    if (!caso.url || baixando) return;
    setBaixando(caso.id);
    try {
      const resposta = await fetch(caso.url);
      if (!resposta.ok) throw new Error("Não consegui baixar a foto do caso.");
      const blob = await resposta.blob();
      const tipo = blob.type || "image/jpeg";
      await onEscolher(new File([blob], `${caso.titulo}.${extensao(tipo)}`, { type: tipo }));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui anexar o caso.");
    } finally {
      setBaixando(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Casos de antes e depois</DialogTitle>
        </DialogHeader>
        {casos.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : casos.isError ? (
          <p className="py-8 text-center text-sm text-danger">
            {casos.error instanceof Error ? casos.error.message : "Não consegui carregar."}
          </p>
        ) : !casos.data?.length ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhum caso cadastrado ainda.</p>
            <Link
              to="/configuracoes/casos"
              className="mt-2 inline-block text-sm font-medium text-coral hover:underline"
            >
              Cadastrar casos
            </Link>
          </div>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {casos.data.map((caso) => (
              <button
                key={caso.id}
                type="button"
                disabled={!caso.url || !!baixando}
                onClick={() => void escolher(caso)}
                className="press group overflow-hidden rounded-2xl border border-border text-left transition-shadow hover:shadow-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
              >
                <div className="relative aspect-[4/3] bg-surface-subtle">
                  {caso.url && (
                    <img
                      src={caso.url}
                      alt={caso.titulo}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                  {baixando === caso.id && (
                    <span className="absolute inset-0 grid place-items-center bg-black/30">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </span>
                  )}
                </div>
                <div className="px-3 py-2">
                  <p className="truncate text-xs font-semibold">{caso.titulo}</p>
                  {caso.quandoUsar && (
                    <p className="truncate text-3xs text-muted-foreground">{caso.quandoUsar}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
