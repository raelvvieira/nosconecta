import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PageHeading } from "@/components/layout/PageHeading";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  alternarProcedimentoDoAgente,
  getProcedimentosDoAgente,
} from "@/lib/agente-ia/agente.functions";

export const Route = createFileRoute("/agente-ia/procedimentos")({
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar os procedimentos"
      description="Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />,
  component: ProcedimentosPage,
});

const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function ProcedimentosPage() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(getProcedimentosDoAgente);
  const alternar = useServerFn(alternarProcedimentoDoAgente);

  const query = useQuery({ queryKey: ["agente-ia-procedimentos"], queryFn: () => buscar() });
  const [busca, setBusca] = useState("");
  const [emVoo, setEmVoo] = useState<string | null>(null);

  const lista = query.data ?? [];
  const filtrados = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    if (!q) return lista;
    return lista.filter(
      (p) =>
        p.nome.toLocaleLowerCase("pt-BR").includes(q) ||
        (p.categoria ?? "").toLocaleLowerCase("pt-BR").includes(q),
    );
  }, [lista, busca]);

  const liberados = lista.filter((p) => p.liberado).length;

  const trocar = async (id: string, liberado: boolean) => {
    setEmVoo(id);
    try {
      await alternar({ data: { procedureId: id, liberado } });
      await queryClient.invalidateQueries({ queryKey: ["agente-ia-procedimentos"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setEmVoo(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-10">
      <PageHeading
        icon={Stethoscope}
        kicker="Agente de IA"
        title="Procedimentos"
        subtitle="O que o agente pode citar e precificar."
      />

      {/* A consequência de deixar tudo desligado não é "nada acontece": o agente
          fica proibido de falar preço e passa a conversa adiante. Dizer isso
          aqui evita a leitura de que a lista é opcional. */}
      <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        {liberados === 0
          ? "Nenhum liberado — ele vai passar toda pergunta de preço para uma pessoa."
          : `${liberados} de ${lista.length} liberados. Fora da lista, ele chama uma pessoa.`}
      </p>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar procedimento"
          className="pl-10"
        />
      </div>

      {query.isPending ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : lista.length === 0 ? (
        <p className="mt-10 rounded-3xl border border-border bg-white/70 p-8 text-center text-sm text-muted-foreground">
          Nenhum procedimento cadastrado —{" "}
          <Link to="/configuracoes" className="underline underline-offset-2">
            cadastre em Configurações
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-white/70">
          {filtrados.map((p) => (
            <li key={p.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.nome}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {reais(p.preco)}
                  {p.duracaoMinutos > 0 && ` · ${p.duracaoMinutos} min`}
                  {p.categoria && ` · ${p.categoria}`}
                </p>
              </div>
              {emVoo === p.id ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  checked={p.liberado}
                  onCheckedChange={(v) => void trocar(p.id, v)}
                  aria-label={`Liberar ${p.nome} para o agente`}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
