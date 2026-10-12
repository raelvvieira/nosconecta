import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Images, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CampoDeImagem,
  type ImagemDoDisparo,
} from "@/components/atendimentos/contacts/CampoDeImagem";
import { getSettings } from "@/lib/settings/settings.functions";
import {
  excluirCaso,
  listarCasos,
  salvarCaso,
  type CasoDaBiblioteca,
} from "@/lib/agente-ia/casos.functions";

const searchSchema = z.object({});

export const Route = createFileRoute("/configuracoes/casos")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Biblioteca de casos · Configurações · NÓS Conecta" },
      {
        name: "description",
        content: "Casos de antes e depois que a Luna pode enviar no WhatsApp.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar a biblioteca"
      description="Houve uma falha ao buscar os casos. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: CasosPage,
});

const SEM_CASOS: CasoDaBiblioteca[] = [];

function CasosPage() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(listarCasos);
  const buscarCadastros = useServerFn(getSettings);
  const doExcluir = useServerFn(excluirCaso);

  const [editando, setEditando] = useState<CasoDaBiblioteca | "novo" | null>(null);
  const [excluindo, setExcluindo] = useState<CasoDaBiblioteca | null>(null);

  const casosQuery = useQuery({ queryKey: ["casos-da-luna"], queryFn: () => buscar() });
  const casos = casosQuery.data ?? SEM_CASOS;

  // Os procedimentos vêm do mesmo cadastro da tela ao lado — a lista de
  // procedimentos não pode divergir entre as duas.
  const cadastrosQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => buscarCadastros(),
    staleTime: 60_000,
  });
  const procedimentos = cadastrosQuery.data?.procedures ?? [];

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["casos-da-luna"] });

  const excluirMutation = useMutation({
    mutationFn: (c: CasoDaBiblioteca) => doExcluir({ data: { id: c.id } }),
    onSuccess: () => {
      toast.success("Caso removido da biblioteca.");
      setExcluindo(null);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ativos = casos.filter((c) => c.ativo).length;

  return (
    <>
      <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold md:text-3xl">
              <Images className="h-[1.1em] w-[1.1em] shrink-0 text-pink" strokeWidth={1.75} />
              Biblioteca de casos
            </h1>
            <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
              Fotos de antes e depois que a Luna pode mandar quando a pessoa tem dúvida de
              resultado. Ela escolhe pelo título e pelo “quando usar”, manda no máximo uma por
              conversa, e nunca promete o mesmo resultado.
            </p>
          </div>
          <Button variant="premium" onClick={() => setEditando("novo")}>
            <Plus className="h-4 w-4" /> Novo caso
          </Button>
        </header>

        {/* O aviso fica na tela, não só no commit: a foto sai por decisão da
            IA, sozinha, para quem a clínica não conhece. */}
        <p className="mt-5 max-w-prose rounded-xl bg-warning-soft px-4 py-3 text-xs leading-5 text-warning">
          A Luna envia estas imagens sozinha, sem ninguém conferir antes. Suba apenas fotos que a
          paciente autorizou — o sistema registra quem autorizou, mas não verifica.
        </p>

        {casosQuery.isPending ? (
          <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>
        ) : casos.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <Images
              className="mx-auto h-8 w-8 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="mt-3 text-sm font-medium">Nenhum caso cadastrado</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Enquanto a biblioteca estiver vazia, a Luna fala de resultado só com palavras.
            </p>
            <Button variant="outline" className="mt-5" onClick={() => setEditando("novo")}>
              <Plus className="h-4 w-4" /> Adicionar o primeiro
            </Button>
          </div>
        ) : (
          <>
            <p className="mt-6 text-xs text-muted-foreground">
              {ativos} de {casos.length}{" "}
              {casos.length === 1 ? "caso disponível" : "casos disponíveis"} para a Luna
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {casos.map((c) => (
                <CartaoDeCaso
                  key={c.id}
                  caso={c}
                  onEditar={() => setEditando(c)}
                  onExcluir={() => setExcluindo(c)}
                />
              ))}
            </div>
          </>
        )}
      </main>

      <FormularioDeCaso
        caso={editando}
        procedimentos={procedimentos}
        onFechar={() => setEditando(null)}
        onSalvo={() => {
          setEditando(null);
          invalidar();
        }}
      />

      <AlertDialog open={Boolean(excluindo)} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{excluindo?.titulo}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A Luna deixa de poder mandar este caso. A imagem continua guardada, então dá para
              cadastrar de novo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              disabled={excluirMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (excluindo) excluirMutation.mutate(excluindo);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CartaoDeCaso({
  caso,
  onEditar,
  onExcluir,
}: {
  caso: CasoDaBiblioteca;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-white">
      {/* A miniatura vem de uma URL assinada curta, pedida na hora — guardar a
          URL faria a biblioteca encher de link morto. */}
      <Miniatura path={caso.mediaPath} titulo={caso.titulo} inativo={!caso.ativo} />
      <div className="space-y-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-sm font-semibold leading-snug">{caso.titulo}</h2>
          <div className="flex shrink-0 gap-0.5">
            <button
              type="button"
              onClick={onEditar}
              aria-label={`Editar ${caso.titulo}`}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onExcluir}
              aria-label={`Remover ${caso.titulo}`}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {caso.procedimento && <p className="text-xs text-muted-foreground">{caso.procedimento}</p>}
        {caso.quandoUsar && (
          <p className="text-xs leading-5 text-foreground-secondary">Usar {caso.quandoUsar}</p>
        )}
        {caso.autorizadaPor && (
          <p className="text-2xs text-muted-foreground">
            Autorizado por {caso.autorizadaPor}
            {caso.autorizadaEm ? ` em ${caso.autorizadaEm.split("-").reverse().join("/")}` : ""}
          </p>
        )}
      </div>
    </article>
  );
}

/** A miniatura, por URL assinada pedida na hora de mostrar. */
function Miniatura({ path, titulo, inativo }: { path: string; titulo: string; inativo: boolean }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.storage
        .from("crm-campaign-media")
        .createSignedUrl(path, 60 * 60);
      if (vivo) setUrl(data?.signedUrl ?? null);
    })();
    return () => {
      vivo = false;
    };
  }, [path]);

  return (
    <div className="relative aspect-[4/3] bg-surface">
      {url ? (
        <img
          src={url}
          alt={titulo}
          className={
            inativo ? "h-full w-full object-cover opacity-40" : "h-full w-full object-cover"
          }
          loading="lazy"
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-muted/50" />
      )}
      {inativo && (
        <span className="absolute left-2 top-2 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
          Desativado
        </span>
      )}
    </div>
  );
}

function FormularioDeCaso({
  caso,
  procedimentos,
  onFechar,
  onSalvo,
}: {
  caso: CasoDaBiblioteca | "novo" | null;
  procedimentos: { id: string; name: string }[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const doSalvar = useServerFn(salvarCaso);
  const editando = caso && caso !== "novo" ? caso : null;
  const aberto = Boolean(caso);

  const [titulo, setTitulo] = useState("");
  const [quandoUsar, setQuandoUsar] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [autorizadaPor, setAutorizadaPor] = useState("");
  const [autorizadaEm, setAutorizadaEm] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [imagem, setImagem] = useState<ImagemDoDisparo | null>(null);

  // O formulário parte do que está gravado toda vez que abre — sem isto, abrir
  // um caso depois de outro traria os campos do anterior.
  useEffect(() => {
    if (!aberto) return;
    setTitulo(editando?.titulo ?? "");
    setQuandoUsar(editando?.quandoUsar ?? "");
    setProcedureId(editando?.procedureId ?? "");
    setAutorizadaPor(editando?.autorizadaPor ?? "");
    setAutorizadaEm(editando?.autorizadaEm ?? "");
    setAtivo(editando?.ativo ?? true);
    setImagem(editando ? { path: editando.mediaPath, previa: "", nome: "imagem atual" } : null);
  }, [aberto, editando]);

  const salvar = useMutation({
    mutationFn: () =>
      doSalvar({
        data: {
          id: editando?.id ?? null,
          titulo,
          mediaPath: imagem?.path ?? "",
          quandoUsar: quandoUsar || null,
          procedureId: procedureId || null,
          autorizadaPor: autorizadaPor || null,
          autorizadaEm: autorizadaEm || null,
          ativo,
        },
      }),
    onSuccess: () => {
      toast.success(editando ? "Caso atualizado." : "Caso adicionado à biblioteca.");
      onSalvo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle>{editando ? "Editar caso" : "Novo caso"}</SheetTitle>
          <SheetDescription>
            A Luna escolhe pelo título e pelo “quando usar”. Ela nunca vê o arquivo.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-2">
            <Label>Imagem *</Label>
            {editando && imagem?.path === editando.mediaPath ? (
              <div className="space-y-2">
                <Miniatura path={editando.mediaPath} titulo={editando.titulo} inativo={false} />
                <button
                  type="button"
                  onClick={() => setImagem(null)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Trocar a imagem
                </button>
              </div>
            ) : (
              <CampoDeImagem imagem={imagem} onChange={setImagem} />
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="caso-titulo">Título *</Label>
            <Input
              id="caso-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Clareamento, resultado natural"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="caso-procedimento">Procedimento</Label>
            <Select value={procedureId} onValueChange={setProcedureId}>
              <SelectTrigger id="caso-procedimento">
                <SelectValue placeholder="Selecione o procedimento" />
              </SelectTrigger>
              <SelectContent>
                {procedimentos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="caso-quando">Quando usar</Label>
            <Input
              id="caso-quando"
              value={quandoUsar}
              onChange={(e) => setQuandoUsar(e.target.value)}
              placeholder="quando a pessoa teme ficar artificial"
            />
            <p className="text-xs text-muted-foreground">
              É isto que faz a Luna escolher o caso que combina com o que a pessoa disse, em vez do
              primeiro da lista. Comece com “quando…”.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="caso-autor">Autorizado por</Label>
              <Input
                id="caso-autor"
                value={autorizadaPor}
                onChange={(e) => setAutorizadaPor(e.target.value)}
                placeholder="Nome da paciente"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="caso-data">Em</Label>
              <Input
                id="caso-data"
                type="date"
                value={autorizadaEm}
                onChange={(e) => setAutorizadaEm(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5">
            <span className="text-sm">
              Disponível para a Luna
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Desligado, fica guardado mas ela não manda.
              </span>
            </span>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </label>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onFechar}>
              Cancelar
            </Button>
            <Button
              variant="premium"
              className="flex-1"
              disabled={salvar.isPending || !titulo.trim() || !imagem?.path}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
