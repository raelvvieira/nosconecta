import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CORES_DE_TAG } from "@/lib/tags/cores";
import { Etiqueta } from "@/components/tags/Etiqueta";
import { excluirTag, listarTags, salvarTag, type Tag } from "@/lib/tags/tags.functions";

const searchSchema = z.object({});

export const Route = createFileRoute("/configuracoes/tags")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Tags · Configurações · NÓS Conecta" },
      {
        name: "description",
        content: "Etiquetas para categorizar contatos e pacientes.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar as tags"
      description="Houve uma falha ao buscar as tags. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />,
  component: TagsPage,
});

const SEM_TAGS: Tag[] = [];

function TagsPage() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(listarTags);
  const doSalvar = useServerFn(salvarTag);
  const doExcluir = useServerFn(excluirTag);

  const [editando, setEditando] = useState<Tag | "nova" | null>(null);
  const [excluindo, setExcluindo] = useState<Tag | null>(null);

  const tagsQuery = useQuery({ queryKey: ["tags"], queryFn: () => buscar(), staleTime: 60_000 });
  const tags = tagsQuery.data ?? SEM_TAGS;

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["tags"] });
    // As tags de cada contato carregam nome e cor junto — renomear ou recolorir
    // aqui precisa refletir lá, senão a ficha continua mostrando o nome velho.
    queryClient.invalidateQueries({ queryKey: ["tags-do-contato"] });
    queryClient.invalidateQueries({ queryKey: ["tags-atribuicoes"] });
  };

  const excluirMutation = useMutation({
    mutationFn: (tag: Tag) => doExcluir({ data: { id: tag.id } }),
    onSuccess: (r) => {
      toast.success(
        r.contatosAfetados > 0
          ? `Tag excluída — saiu de ${r.contatosAfetados} contato${r.contatosAfetados === 1 ? "" : "s"}.`
          : "Tag excluída.",
      );
      setExcluindo(null);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold md:text-3xl">
              <TagIcon className="h-[1.1em] w-[1.1em] shrink-0 text-pink" strokeWidth={1.75} />
              Tags
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Etiquetas para categorizar contatos e pacientes à mão — o oposto das etapas dos funis,
              que são calculadas.
            </p>
          </div>
          <Button variant="premium" className="gap-2" onClick={() => setEditando("nova")}>
            <Plus className="h-4 w-4" />
            Nova tag
          </Button>
        </header>

        <section className="surface-card mt-6 divide-y divide-border overflow-hidden">
          {tagsQuery.isLoading && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Carregando…</p>
          )}

          {!tagsQuery.isLoading && tags.length === 0 && (
            <div className="grid min-h-40 place-items-center px-6 py-8 text-center">
              <div>
                <TagIcon className="mx-auto h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhuma tag ainda. Crie a primeira aqui, ou direto na ficha de um paciente.
                </p>
              </div>
            </div>
          )}

          {tags.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
              <Etiqueta nome={t.name} cor={t.color} />
              <span className="text-2xs tabular-nums text-muted-foreground">
                {t.usos === 0
                  ? "nenhum contato"
                  : `${t.usos} contato${t.usos === 1 ? "" : "s"}`}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`Editar a tag ${t.name}`}
                  onClick={() => setEditando(t)}
                  className="press grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Excluir a tag ${t.name}`}
                  onClick={() => setExcluindo(t)}
                  className="press grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </section>
      </main>

      <FormularioDeTag
        aberto={editando !== null}
        tag={editando === "nova" ? null : editando}
        onFechar={() => setEditando(null)}
        onSalvo={() => {
          setEditando(null);
          invalidar();
        }}
        salvar={doSalvar}
      />

      <AlertDialog open={Boolean(excluindo)} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a tag "{excluindo?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo?.usos
                ? `Ela sai de ${excluindo.usos} contato${excluindo.usos === 1 ? "" : "s"} — os contatos continuam, só perdem esta etiqueta. Não dá para desfazer.`
                : "Ela não está em nenhum contato. Não dá para desfazer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluirMutation.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              disabled={excluirMutation.isPending}
              onClick={() => excluindo && excluirMutation.mutate(excluindo)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FormularioDeTag({
  aberto,
  tag,
  onFechar,
  onSalvo,
  salvar,
}: {
  aberto: boolean;
  /** `null` = criando. */
  tag: Tag | null;
  onFechar: () => void;
  onSalvo: () => void;
  salvar: (args: { data: { id?: string | null; name: string; color: string } }) => Promise<Tag>;
}) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(CORES_DE_TAG[0].chave);
  // Recarrega os campos a cada abertura. Sem chave, reabrir para editar outra
  // tag mostraria os valores da anterior.
  const [chave, setChave] = useState("");
  const atual = `${aberto}:${tag?.id ?? "nova"}`;
  if (chave !== atual) {
    setChave(atual);
    setNome(tag?.name ?? "");
    setCor(tag?.color ?? CORES_DE_TAG[0].chave);
  }

  const mutation = useMutation({
    mutationFn: () => salvar({ data: { id: tag?.id ?? null, name: nome, color: cor } }),
    onSuccess: () => {
      toast.success(tag ? "Tag atualizada" : "Tag criada");
      onSalvo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle>{tag ? "Editar tag" : "Nova tag"}</SheetTitle>
          <SheetDescription>
            O nome aparece na etiqueta; a cor é o que faz reconhecer de longe.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="tag-nome">Nome</Label>
            <Input
              id="tag-nome"
              autoFocus
              value={nome}
              maxLength={32}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nome.trim() && !mutation.isPending) mutation.mutate();
              }}
              placeholder="Clareamento, Convênio, VIP…"
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {CORES_DE_TAG.map((c) => (
                <button
                  key={c.chave}
                  type="button"
                  onClick={() => setCor(c.chave)}
                  aria-label={c.rotulo}
                  aria-pressed={cor === c.chave}
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-full transition-transform",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                    cor === c.chave
                      ? "ring-2 ring-foreground ring-offset-2"
                      : "hover:scale-110 motion-reduce:hover:scale-100",
                  )}
                  style={{ backgroundColor: c.ponto }}
                />
              ))}
            </div>
            {/* A paleta é fechada de propósito: cor livre produz etiqueta
                ilegível sobre o branco das listas, e um quadro que fica sujo
                depois da décima tag. */}
            <p className="pt-1 text-2xs text-muted-foreground">
              Assim ela vai aparecer:{" "}
              <Etiqueta nome={nome.trim() || "Exemplo"} cor={cor} className="align-middle" />
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onFechar}>
              Cancelar
            </Button>
            <Button
              variant="premium"
              className="flex-1"
              disabled={!nome.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Salvando…" : tag ? "Salvar" : "Criar tag"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
