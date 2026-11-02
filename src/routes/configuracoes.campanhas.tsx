import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Campo } from "@/components/settings/CamposDoConsultorio";
import { cn } from "@/lib/utils";
import { localDateStr } from "@/lib/date";
import {
  excluirCampanha,
  listarCampanhas,
  salvarCampanha,
  type Campanha,
  type ItemDeCampanha,
} from "@/lib/settings/consultorio.functions";

export const Route = createFileRoute("/configuracoes/campanhas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Campanhas · Configurações · NÓS Conecta" },
      { name: "description", content: "Preços especiais com período de validade." },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar as campanhas"
      description="Houve uma falha ao buscar os dados. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: CampanhasPage,
});

type Rascunho = Omit<Campanha, "id"> & { id: string | null };

function diaMes(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
function reais(v: number | null) {
  return v === null ? "—" : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
}

function situacao(c: Campanha, hoje: string): { rotulo: string; cor: string } {
  if (!c.ativo) return { rotulo: "Desligada", cor: "bg-muted text-muted-foreground" };
  if (hoje < c.inicio)
    return {
      rotulo: "Agendada",
      cor: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    };
  if (hoje > c.fim) return { rotulo: "Encerrada", cor: "bg-muted text-muted-foreground" };
  return {
    rotulo: "Valendo agora",
    cor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  };
}

function CampanhasPage() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(listarCampanhas);
  const doSalvar = useServerFn(salvarCampanha);
  const doExcluir = useServerFn(excluirCampanha);
  const query = useQuery({ queryKey: ["campanhas"], queryFn: () => buscar() });
  const [editando, setEditando] = useState<Rascunho | null>(null);
  const hoje = localDateStr();

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["campanhas"] });
  const salvarM = useMutation({
    mutationFn: (r: Rascunho) => doSalvar({ data: r }),
    onSuccess: () => {
      invalidar();
      setEditando(null);
      toast.success("Campanha salva. A assistente usa dentro do período.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const excluirM = useMutation({
    mutationFn: (id: string) => doExcluir({ data: { id } }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const nova = (): Rascunho => ({
    id: null,
    nome: "",
    inicio: hoje,
    fim: hoje,
    ativo: true,
    itens: [{ nome: "", precoVista: null, parcelas: null, valorParcela: null }],
    observacoes: null,
  });

  const lista = query.data ?? [];
  return (
    <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Campanhas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Preços especiais com início e fim. A assistente usa só dentro do período e para de citar
            no dia seguinte ao fim.
          </p>
        </div>
        <Button variant="premium" className="gap-1.5" onClick={() => setEditando(nova())}>
          <Plus className="h-4 w-4" />
          Nova campanha
        </Button>
      </header>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {lista.map((c) => {
          const s = situacao(c, hoje);
          return (
            <article
              key={c.id}
              className="rounded-3xl border border-border/70 bg-card p-5 shadow-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold">{c.nome}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    De {diaMes(c.inicio)} a {diaMes(c.fim)}
                  </p>
                </div>
                <span className={cn("rounded-full px-2.5 py-0.5 text-2xs font-semibold", s.cor)}>
                  {s.rotulo}
                </span>
              </div>
              <ul className="mt-3 grid gap-1 text-sm">
                {c.itens.map((i, k) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span className="truncate">{i.nome}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {reais(i.precoVista)}
                      {i.parcelas && i.valorParcela !== null
                        ? ` · ${i.parcelas}x ${reais(i.valorParcela)}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => setEditando({ ...c })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground hover:text-danger"
                  disabled={excluirM.isPending}
                  onClick={() => {
                    if (confirm(`Excluir a campanha "${c.nome}"?`)) excluirM.mutate(c.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </article>
          );
        })}
        {!lista.length && !query.isLoading && (
          <p className="rounded-3xl border border-dashed border-border p-6 text-sm text-muted-foreground lg:col-span-2">
            Nenhuma campanha ainda. Crie uma para a assistente oferecer um preço especial durante um
            período, como uma Black Friday.
          </p>
        )}
      </div>

      <Sheet open={editando !== null} onOpenChange={(o) => !o && setEditando(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="text-left">
            <SheetTitle>{editando?.id ? "Editar campanha" : "Nova campanha"}</SheetTitle>
            <SheetDescription>
              A assistente cita o nome da campanha e os valores, sem inventar urgência.
            </SheetDescription>
          </SheetHeader>
          {editando && (
            <FormDaCampanha
              r={editando}
              mudar={setEditando}
              salvando={salvarM.isPending}
              onSalvar={() => salvarM.mutate(editando)}
            />
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}

function numero(t: string): number | null {
  const s = t.replace(/\./g, "").replace(",", ".").trim();
  return s === "" || !Number.isFinite(Number(s)) ? null : Number(s);
}

function FormDaCampanha({
  r,
  mudar,
  salvando,
  onSalvar,
}: {
  r: Rascunho;
  mudar: (r: Rascunho) => void;
  salvando: boolean;
  onSalvar: () => void;
}) {
  const mudarItem = (i: number, patch: Partial<ItemDeCampanha>) =>
    mudar({ ...r, itens: r.itens.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <div className="mt-5 grid gap-4">
      <Campo rotulo="Nome">
        <Input
          value={r.nome}
          placeholder="Ex.: Black Estética"
          onChange={(e) => mudar({ ...r, nome: e.target.value })}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Começa em">
          <Input
            type="date"
            value={r.inicio}
            onChange={(e) => mudar({ ...r, inicio: e.target.value })}
          />
        </Campo>
        <Campo rotulo="Termina em">
          <Input type="date" value={r.fim} onChange={(e) => mudar({ ...r, fim: e.target.value })} />
        </Campo>
      </div>

      <div className="grid gap-2">
        <p className="text-[13px] font-medium">Procedimentos e preços</p>
        {r.itens.map((i, k) => (
          <div key={k} className="grid gap-2 rounded-2xl bg-muted/40 p-3">
            <Input
              value={i.nome}
              placeholder="Procedimento"
              onChange={(e) => mudarItem(k, { nome: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-2">
              <Input
                inputMode="decimal"
                placeholder="À vista"
                defaultValue={i.precoVista ?? ""}
                onChange={(e) => mudarItem(k, { precoVista: numero(e.target.value) })}
              />
              <Input
                inputMode="numeric"
                placeholder="Parcelas"
                defaultValue={i.parcelas ?? ""}
                onChange={(e) => mudarItem(k, { parcelas: numero(e.target.value) })}
              />
              <Input
                inputMode="decimal"
                placeholder="Valor da parcela"
                defaultValue={i.valorParcela ?? ""}
                onChange={(e) => mudarItem(k, { valorParcela: numero(e.target.value) })}
              />
            </div>
            {r.itens.length > 1 && (
              <button
                type="button"
                className="justify-self-end text-xs text-muted-foreground hover:underline"
                onClick={() => mudar({ ...r, itens: r.itens.filter((_, j) => j !== k) })}
              >
                Remover
              </button>
            )}
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start gap-1"
          onClick={() =>
            mudar({
              ...r,
              itens: [
                ...r.itens,
                { nome: "", precoVista: null, parcelas: null, valorParcela: null },
              ],
            })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Procedimento
        </Button>
      </div>

      <Campo
        rotulo="Observações para a assistente"
        ajuda="Opcional. Ex.: válido só para pacientes novos."
      >
        <Textarea
          rows={2}
          value={r.observacoes ?? ""}
          onChange={(e) => mudar({ ...r, observacoes: e.target.value })}
        />
      </Campo>
      <label className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3 text-sm">
        Ligada
        <Switch checked={r.ativo} onCheckedChange={(v) => mudar({ ...r, ativo: v })} />
      </label>
      <Button variant="premium" disabled={salvando} onClick={onSalvar}>
        Salvar campanha
      </Button>
    </div>
  );
}
