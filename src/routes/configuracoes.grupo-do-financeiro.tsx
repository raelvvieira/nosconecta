import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquare, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listarGruposConhecidos,
  listarGruposDoFinanceiro,
  listarUltimosLancamentos,
  removerGrupoDoFinanceiro,
  salvarGrupoDoFinanceiro,
  type GrupoConhecido,
} from "@/lib/finance/grupo.functions";
import { getSettings } from "@/lib/settings/settings.functions";

export const Route = createFileRoute("/configuracoes/grupo-do-financeiro")({
  component: GrupoDoFinanceiroPage,
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      title="Não deu para abrir"
      description={error instanceof Error ? error.message : "Erro inesperado."}
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Não encontrado" description="Essa página não existe." />
  ),
});

const VAZIO: GrupoConhecido[] = [];

function GrupoDoFinanceiroPage() {
  const queryClient = useQueryClient();
  const buscarConhecidos = useServerFn(listarGruposConhecidos);
  const buscarCadastrados = useServerFn(listarGruposDoFinanceiro);
  const buscarLancamentos = useServerFn(listarUltimosLancamentos);
  const buscarCadastros = useServerFn(getSettings);
  const doSalvar = useServerFn(salvarGrupoDoFinanceiro);
  const doRemover = useServerFn(removerGrupoDoFinanceiro);

  const conhecidos = useQuery({
    queryKey: ["grupos-conhecidos"],
    queryFn: () => buscarConhecidos(),
  });
  const cadastrados = useQuery({
    queryKey: ["grupos-do-financeiro"],
    queryFn: () => buscarCadastrados(),
  });
  const lancamentos = useQuery({
    queryKey: ["lancamentos-do-grupo"],
    queryFn: () => buscarLancamentos(),
  });
  const cadastros = useQuery({
    queryKey: ["settings"],
    queryFn: () => buscarCadastros(),
    staleTime: 60_000,
  });
  // `useMemo` e não `?? []`: o array literal nasce novo a cada render e faria
  // o efeito abaixo rodar sempre, reescrevendo a unidade escolhida.
  const unidades = useMemo(() => cadastros.data?.units ?? [], [cadastros.data]);

  const [escolhido, setEscolhido] = useState("");
  const [apelido, setApelido] = useState("");
  const [unitId, setUnitId] = useState("");

  // Com uma unidade só, escolher não é decisão — é um campo a mais para
  // esquecer preenchido errado.
  useEffect(() => {
    if (!unitId && unidades.length === 1) setUnitId(String(unidades[0].id));
  }, [unidades, unitId]);

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["grupos-do-financeiro"] });
    void queryClient.invalidateQueries({ queryKey: ["grupos-conhecidos"] });
  };

  const salvar = useMutation({
    mutationFn: () => doSalvar({ data: { jid: escolhido, apelido: apelido || null, unitId } }),
    onSuccess: () => {
      toast.success("Pronto. Já pode escrever um gasto no grupo.");
      setEscolhido("");
      setApelido("");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: (id: string) => doRemover({ data: { id } }),
    onSuccess: () => {
      toast.success("Grupo removido. O robô para de ler.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grupos = (conhecidos.data ?? VAZIO).filter((g) => !g.cadastrado);
  const ativos = cadastrados.data ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-24 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Receipt className="h-5 w-5" />
          Grupo do financeiro
        </h1>
        <p className="text-sm text-muted-foreground">
          Escreva o gasto num grupo de WhatsApp e ele entra em Pagamentos. O robô responde no grupo
          com o que entendeu — se ele ficar calado, nada foi lançado.
        </p>
      </header>

      <section className="rounded-2xl border bg-surface p-4">
        <h2 className="text-sm font-medium">Como escrever</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Diga <strong>quanto</strong>, <strong>do quê</strong>, <strong>de qual conta</strong> e{" "}
          <strong>como pagou</strong>. Por exemplo:
        </p>
        <p className="mt-2 rounded-xl bg-background px-3 py-2 text-xs leading-5">
          “paguei 240 na conta de luz, pix do Inter”
          <br />
          “comprei a cadeira, 5.000 em 10x no cartão do Nubank”
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Faltou a data, a conta ou a forma de pagamento? Ele pergunta antes de lançar — nunca supõe
          que foi hoje, porque despesa no dia errado não acusa erro em lugar nenhum. Mandou foto do
          comprovante? Ele lê e pergunta se está certo. Errou? Responda <strong>“apaga”</strong>.
        </p>
      </section>

      {ativos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Grupos ligados</h2>
          {ativos.map((g) => (
            <article
              key={g.id}
              className="flex items-center justify-between gap-3 rounded-2xl border bg-surface p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{g.apelido ?? "Grupo do financeiro"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {g.unidade ?? "sem unidade"} · {g.jid.replace("@g.us", "")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remover.mutate(g.id)}
                aria-label="Remover grupo"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </article>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Ligar um grupo</h2>
          <p className="text-xs text-muted-foreground">
            O WhatsApp não mostra o nome do grupo para o sistema, então a lista vem pela última
            mensagem. Reconheça o seu pelo que foi escrito nele.
          </p>
        </div>

        {conhecidos.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : grupos.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            Nenhum grupo novo por aqui. Mande uma mensagem no grupo e recarregue — é assim que o
            sistema fica sabendo que ele existe.
          </p>
        ) : (
          <div className="space-y-2">
            {grupos.map((g) => (
              <button
                key={g.jid}
                type="button"
                onClick={() => setEscolhido(g.jid)}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                  escolhido === g.jid
                    ? "border-primary bg-primary-soft"
                    : "bg-surface hover:bg-muted"
                }`}
              >
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{g.ultimaMensagem ?? "(sem mensagens)"}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.ultimaEm ? new Date(g.ultimaEm).toLocaleString("pt-BR") : "sem data"}
                  </p>
                </div>
                {escolhido === g.jid && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        )}

        {escolhido && (
          <div className="space-y-3 rounded-2xl border bg-surface p-4">
            <div className="grid gap-2">
              <Label htmlFor="apelido">Nome do grupo</Label>
              <Input
                id="apelido"
                value={apelido}
                onChange={(e) => setApelido(e.target.value)}
                placeholder="#NÓS Floripa - Financeiro"
              />
              <p className="text-xs text-muted-foreground">
                Só para você reconhecer aqui. O WhatsApp não manda o nome do grupo.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="unidade">A despesa cai em</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger id="unidade">
                  <SelectValue placeholder="Escolha a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Vem do grupo, não da mensagem — ninguém precisa repetir a unidade em cada gasto.
              </p>
            </div>

            <Button
              variant="premium"
              className="w-full"
              disabled={salvar.isPending || !unitId}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending ? "Ligando…" : "Ligar este grupo"}
            </Button>
          </div>
        )}
      </section>

      {(lancamentos.data ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">O que o robô fez</h2>
          <p className="text-xs text-muted-foreground">
            Serve para conferir se ele está acertando antes de confiar nele de olhos fechados.
          </p>
          <div className="divide-y rounded-2xl border bg-surface">
            {(lancamentos.data ?? []).map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{l.descricao ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.quem ?? "alguém"} ·{" "}
                    {l.quando ? new Date(l.quando).toLocaleString("pt-BR") : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p>
                    {l.valor !== null
                      ? l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{l.estado}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
