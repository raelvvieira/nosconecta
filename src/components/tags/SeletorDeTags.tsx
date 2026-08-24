import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Plus, Search, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CORES_DE_TAG, corDeTag } from "@/lib/tags/cores";
import {
  desmarcarTag,
  listarTags,
  marcarTag,
  salvarTag,
  tagsDoContato,
  type AlvoDaTag,
  type Tag,
} from "@/lib/tags/tags.functions";
import { Etiqueta, PontoDeCor } from "./Etiqueta";

const SEM_TAGS: Tag[] = [];

/**
 * Marcar e desmarcar as tags de uma pessoa, e criar tag nova sem sair daqui.
 *
 * Criar não é uma tela à parte: é o que sobra quando a busca não acha nada. O
 * caminho "não existe ainda → crio agora" é o mesmo gesto, e separá-lo em um
 * botão "nova tag" faria a pessoa digitar o nome duas vezes.
 */
export function SeletorDeTags({
  alvo,
  /** Rótulo do gatilho quando não há tag nenhuma. */
  vazio = "Adicionar tag",
  compacto = false,
  className,
}: {
  alvo: AlvoDaTag;
  vazio?: string;
  /** Para barras de altura fixa, como o cabeçalho da conversa: as etiquetas
   *  ficam numa faixa que rola de lado em vez de quebrar linha. Quebrar
   *  cresceria a altura do cabeçalho a cada tag; espremer sem rolagem comeria o
   *  nome do contato, que é a informação principal ali. */
  compacto?: boolean;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const buscarTags = useServerFn(listarTags);
  const buscarDoContato = useServerFn(tagsDoContato);
  const doMarcar = useServerFn(marcarTag);
  const doDesmarcar = useServerFn(desmarcarTag);
  const doSalvar = useServerFn(salvarTag);

  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [corNova, setCorNova] = useState(CORES_DE_TAG[0].chave);

  const temAlvo = Boolean(alvo.patientId || alvo.crmContactId);
  // A chave carrega as duas identidades: a mesma pessoa vista pela ficha e pela
  // conversa precisa compartilhar cache, senão marcar num lugar não reflete no
  // outro sem recarregar.
  const chaveDoContato = ["tags-do-contato", alvo.patientId ?? null, alvo.crmContactId ?? null];

  const tagsQuery = useQuery({
    queryKey: ["tags"],
    queryFn: () => buscarTags(),
    enabled: aberto,
    staleTime: 5 * 60_000,
  });

  const doContatoQuery = useQuery({
    queryKey: chaveDoContato,
    queryFn: () => buscarDoContato({ data: alvo }),
    enabled: temAlvo,
    staleTime: 60_000,
  });

  const marcadas = doContatoQuery.data ?? SEM_TAGS;
  const marcadasIds = useMemo(() => new Set(marcadas.map((t) => t.id)), [marcadas]);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: chaveDoContato });
    queryClient.invalidateQueries({ queryKey: ["tags"] });
    // As telas que filtram por tag leem o mapa inteiro de atribuições.
    queryClient.invalidateQueries({ queryKey: ["tags-atribuicoes"] });
  };

  const alternar = useMutation({
    mutationFn: async (tag: Tag) => {
      const jaTem = marcadasIds.has(tag.id);
      const fn = jaTem ? doDesmarcar : doMarcar;
      await fn({ data: { ...alvo, tagId: tag.id } });
      return { tag, removida: jaTem };
    },
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const criar = useMutation({
    mutationFn: async (nome: string) => {
      const tag = await doSalvar({ data: { name: nome, color: corNova } });
      // Criar e não marcar deixaria a pessoa com a tag pronta e o contato sem
      // ela — o gesto era "marcar esta pessoa com algo que ainda não existe".
      await doMarcar({ data: { ...alvo, tagId: tag.id } });
      return tag;
    },
    onSuccess: (tag) => {
      setBusca("");
      invalidar();
      toast.success(`Tag "${tag.name}" criada e aplicada`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const termo = busca.trim();
  const lista = tagsQuery.data ?? SEM_TAGS;
  const filtradas = useMemo(() => {
    const q = termo.toLocaleLowerCase("pt-BR");
    if (!q) return lista;
    return lista.filter((t) => t.name.toLocaleLowerCase("pt-BR").includes(q));
  }, [lista, termo]);

  const nomeJaExiste = lista.some(
    (t) => t.name.toLocaleLowerCase("pt-BR") === termo.toLocaleLowerCase("pt-BR"),
  );
  const podeCriar = termo.length > 0 && !nomeJaExiste;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        compacto ? "min-w-0 flex-nowrap" : "flex-wrap",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5",
          compacto ? "scrollbar-none min-w-0 max-w-[38vw] flex-nowrap overflow-x-auto" : "flex-wrap",
        )}
      >
        {marcadas.map((t) => (
          <Etiqueta
            key={t.id}
            nome={t.name}
            cor={t.color}
            className={compacto ? "shrink-0" : undefined}
            onRemover={() => alternar.mutate(t)}
          />
        ))}
      </div>

      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-abrir-tags=""
            disabled={!temAlvo}
            className={cn(
              "press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border",
              "px-3 text-2xs font-medium text-muted-foreground transition-colors",
              "hover:border-coral hover:text-coral disabled:opacity-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-1",
            )}
          >
            {marcadas.length > 0 ? <Plus className="h-3.5 w-3.5" /> : <TagIcon className="h-3.5 w-3.5" />}
            {marcadas.length > 0 ? "Tag" : vazio}
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && podeCriar && !criar.isPending) {
                    e.preventDefault();
                    criar.mutate(termo);
                  }
                }}
                placeholder="Buscar ou criar tag"
                className="h-9 rounded-lg border-none bg-surface pl-8 text-sm shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto overflow-x-hidden p-1.5">
            {tagsQuery.isLoading && (
              <p className="px-2 py-3 text-2xs text-muted-foreground">Carregando…</p>
            )}

            {!tagsQuery.isLoading && filtradas.length === 0 && !podeCriar && (
              <p className="px-2 py-3 text-2xs text-muted-foreground">
                {lista.length === 0
                  ? "Nenhuma tag ainda — digite um nome para criar a primeira."
                  : "Nada com esse nome."}
              </p>
            )}

            {filtradas.map((t) => {
              const marcada = marcadasIds.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  data-tag-opcao={t.name}
                  onClick={() => alternar.mutate(t)}
                  disabled={alternar.isPending}
                  className={cn(
                    "press flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                    "hover:bg-surface focus-visible:outline-none focus-visible:bg-surface",
                  )}
                >
                  <PontoDeCor cor={t.color} />
                  <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                  {typeof t.usos === "number" && t.usos > 0 && (
                    <span className="shrink-0 text-3xs tabular-nums text-muted-foreground">
                      {t.usos}
                    </span>
                  )}
                  <span
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
                      marcada ? "border-coral bg-coral text-white" : "border-border",
                    )}
                  >
                    {marcada && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}

            {/* Criar nasce da busca: o nome já foi digitado, só falta a cor. */}
            {podeCriar && (
              <div className="mt-1 rounded-lg border border-border p-2">
                <div className="flex items-center gap-1.5">
                  {CORES_DE_TAG.map((c) => (
                    <button
                      key={c.chave}
                      type="button"
                      onClick={() => setCorNova(c.chave)}
                      aria-label={c.rotulo}
                      aria-pressed={corNova === c.chave}
                      className={cn(
                        "h-6 w-6 shrink-0 rounded-full transition-transform",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                        corNova === c.chave
                          ? "ring-2 ring-foreground ring-offset-2"
                          : "hover:scale-110 motion-reduce:hover:scale-100",
                      )}
                      style={{ backgroundColor: c.ponto }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  data-criar-tag=""
                  disabled={criar.isPending}
                  onClick={() => criar.mutate(termo)}
                  className={cn(
                    "press mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                    "hover:bg-surface focus-visible:outline-none focus-visible:bg-surface",
                  )}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-coral" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    Criar{" "}
                    <Etiqueta
                      nome={termo}
                      cor={corNova}
                      className="ml-0.5 align-middle"
                    />
                  </span>
                </button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
