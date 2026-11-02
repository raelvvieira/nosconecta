import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Bloco } from "@/components/agente-ia/campos";
import { BlocoDeHorarios } from "@/components/settings/BlocoDeHorarios";
import {
  CamposDeArea,
  CamposDeAvaliacao,
  CamposDeIdentidade,
  CamposDePagamento,
  CamposDePoliticas,
  type Rascunho,
} from "@/components/settings/CamposDoConsultorio";
import {
  getConfigDoConsultorio,
  salvarConfigDoConsultorio,
} from "@/lib/settings/consultorio.functions";

export const Route = createFileRoute("/configuracoes/consultorio")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Consultório · Configurações · NÓS Conecta" },
      {
        name: "description",
        content: "Nome, área, pagamento, avaliação e políticas do consultório.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar o consultório"
      description="Houve uma falha ao buscar os dados. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: ConsultorioPage,
});

function ConsultorioPage() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(getConfigDoConsultorio);
  const salvar = useServerFn(salvarConfigDoConsultorio);
  const query = useQuery({ queryKey: ["config-do-consultorio"], queryFn: () => buscar() });
  const [r, setR] = useState<Rascunho | null>(null);
  const [mudou, setMudou] = useState<Rascunho>({});

  useEffect(() => {
    if (query.data && !r) setR(query.data);
  }, [query.data, r]);

  const mudar = (patch: Rascunho) => {
    setR((atual) => ({ ...atual, ...patch }));
    setMudou((m) => ({ ...m, ...patch }));
  };

  const gravar = useMutation({
    mutationFn: () => salvar({ data: mudou }),
    onSuccess: () => {
      setMudou({});
      queryClient.invalidateQueries({ queryKey: ["config-do-consultorio"] });
      toast.success("Salvo. A assistente usa na próxima resposta.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!r) {
    return (
      <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </main>
    );
  }
  const podeEditar = query.data?.isAdmin === true;
  const temMudanca = Object.keys(mudou).length > 0;

  return (
    <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Consultório</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            O que a assistente e as mensagens automáticas usam para falar em nome do consultório.
          </p>
        </div>
        <Button
          variant="premium"
          disabled={!podeEditar || !temMudanca || gravar.isPending}
          onClick={() => gravar.mutate()}
        >
          Salvar
        </Button>
      </header>
      {!podeEditar && (
        <p className="mt-4 rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Só quem administra o consultório muda estes dados.
        </p>
      )}

      {podeEditar && (
        <button
          type="button"
          className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={async () => {
            await salvar({ data: { reabrirOnboarding: true } });
            try {
              window.sessionStorage.removeItem("onboarding-fechado-nesta-sessao");
            } catch {
              // Sem armazenamento, nada a limpar.
            }
            await queryClient.invalidateQueries({ queryKey: ["config-do-consultorio"] });
            window.location.assign("/inicio");
          }}
        >
          Abrir de novo o guia de configuração
        </button>
      )}

      <fieldset disabled={!podeEditar} className="mt-6 grid gap-4 xl:grid-cols-2 xl:items-start">
        <div className="grid gap-4">
          <Bloco titulo="Identidade">
            <CamposDeIdentidade r={r} mudar={mudar} />
          </Bloco>
          <Bloco
            titulo="Área de atuação"
            descricao="Define as especialidades, o odontograma e o catálogo de procedimentos."
          >
            <CamposDeArea r={r} mudar={mudar} />
          </Bloco>
          <Bloco
            titulo="Horário de funcionamento"
            descricao="A agenda e a assistente só oferecem horários dentro destes."
          >
            <BlocoDeHorarios />
          </Bloco>
        </div>
        <div className="grid gap-4">
          <Bloco titulo="Como o paciente paga">
            <CamposDePagamento r={r} mudar={mudar} />
          </Bloco>
          <Bloco titulo="Avaliação">
            <CamposDeAvaliacao r={r} mudar={mudar} />
          </Bloco>
          <Bloco titulo="Políticas">
            <CamposDePoliticas r={r} mudar={mudar} />
          </Bloco>
        </div>
      </fieldset>
    </main>
  );
}
