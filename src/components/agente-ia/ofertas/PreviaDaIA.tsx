import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { previaDaOferta } from "@/lib/agente-ia/ofertas.functions";

/**
 * Como a assistente recebe esta oferta: o bloco que vai em toda conversa e o
 * conhecimento que entra só quando ela está em foco. Confere antes de ligar.
 */
export function PreviaDaIA({ ofertaId }: { ofertaId: string }) {
  const buscar = useServerFn(previaDaOferta);
  const q = useQuery({
    queryKey: ["agente-oferta-previa", ofertaId],
    queryFn: () => buscar({ data: { id: ofertaId } }),
    // A prévia confere o que foi salvo: sempre fresca ao abrir a aba.
    staleTime: 0,
  });
  if (q.isLoading)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Montando a prévia
      </p>
    );
  if (q.error) return <p className="text-sm text-danger">Não deu para montar a prévia.</p>;
  const { bloco, conhecimento } = q.data ?? { bloco: "", conhecimento: "" };
  return (
    <div className="grid gap-5">
      <section>
        <h3 className="text-sm font-semibold">Em toda conversa</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          O bloco &ldquo;O que está valendo agora&rdquo;, como a assistente o lê quando esta oferta
          está aberta.
        </p>
        <pre className="custom-scroll mt-2 max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-xl bg-surface-subtle p-4 text-xs leading-5">
          {bloco}
        </pre>
      </section>
      <section>
        <h3 className="text-sm font-semibold">Só quando a conversa é sobre esta oferta</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          O conhecimento cadastrado. Sem textos ativos, nada entra.
        </p>
        <pre className="custom-scroll mt-2 max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-xl bg-surface-subtle p-4 text-xs leading-5">
          {conhecimento || "Nenhum texto de conhecimento ativo ainda."}
        </pre>
      </section>
    </div>
  );
}
