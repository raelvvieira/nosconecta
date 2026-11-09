import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Campo } from "@/components/settings/CamposDoConsultorio";
import { cn } from "@/lib/utils";
import {
  LIMITE_DO_BLOCO,
  excluirConhecimento,
  reordenarConhecimento,
  salvarConhecimento,
  type Conhecimento as BlocoDeConhecimento,
} from "@/lib/agente-ia/ofertas.functions";

// O teto do total que entra numa conversa (`LIMITE_DO_CONHECIMENTO` em
// `_shared/mapa-de-ofertas.ts`): mostrado aqui para quem escreve ver quando passa.
const TETO_TOTAL = 12000;

const SUGESTOES: { titulo: string; quando: string }[] = [
  { titulo: "O que é", quando: "Quando a pessoa perguntar o que é a oferta ou como funciona" },
  {
    titulo: "Quem aplica e supervisiona",
    quando: "Quando perguntarem quem faz o procedimento ou se há supervisão",
  },
  { titulo: "Perguntas frequentes", quando: "Dúvidas comuns antes de decidir" },
  {
    titulo: "Objeções",
    quando: "Quando a pessoa disser que é caro, que tem medo ou que vai pensar",
  },
  { titulo: "Políticas", quando: "Cancelamento, falta, remarcação e contraindicações" },
  { titulo: "Como funciona a reserva", quando: "Quando a pessoa quiser garantir a vaga" },
];

type Rascunho = {
  id: string | null;
  titulo: string;
  quandoUsar: string;
  texto: string;
  ativo: boolean;
};

const novo = (titulo = "", quando = ""): Rascunho => ({
  id: null,
  titulo,
  quandoUsar: quando,
  texto: "",
  ativo: true,
});

/**
 * Os textos que a assistente consulta quando a conversa é sobre esta oferta.
 * Cada um tem um título, a situação em que serve e o texto. Só entram na
 * conversa quando a oferta está em foco; o resumo da oferta vai sempre.
 */
export function ConhecimentoDaOferta({
  ofertaId,
  blocos,
}: {
  ofertaId: string;
  blocos: BlocoDeConhecimento[];
}) {
  const queryClient = useQueryClient();
  const salvar = useServerFn(salvarConhecimento);
  const excluir = useServerFn(excluirConhecimento);
  const reordenar = useServerFn(reordenarConhecimento);
  const [editando, setEditando] = useState<Rascunho | null>(null);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["agente-oferta", ofertaId] });
    queryClient.invalidateQueries({ queryKey: ["agente-ofertas"] });
  };
  const salvarM = useMutation({
    mutationFn: (r: Rascunho) =>
      salvar({
        data: {
          id: r.id,
          ofertaId,
          titulo: r.titulo,
          quandoUsar: r.quandoUsar || null,
          texto: r.texto,
          ativo: r.ativo,
        },
      }),
    onSuccess: () => {
      invalidar();
      setEditando(null);
      toast.success("Texto salvo. A assistente consulta quando a conversa for sobre esta oferta.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const excluirM = useMutation({
    mutationFn: (id: string) => excluir({ data: { id } }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });
  const ordemM = useMutation({
    mutationFn: (ids: string[]) => reordenar({ data: { ofertaId, ids } }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });
  const ligarM = useMutation({
    mutationFn: (b: BlocoDeConhecimento) =>
      salvar({
        data: {
          id: b.id,
          ofertaId,
          titulo: b.titulo,
          quandoUsar: b.quandoUsar,
          texto: b.texto,
          ativo: !b.ativo,
        },
      }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const mover = (i: number, d: -1 | 1) => {
    const ids = blocos.map((b) => b.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    ordemM.mutate(ids);
  };

  const usados = blocos.filter((b) => b.ativo).reduce((s, b) => s + b.texto.length, 0);
  const passou = usados > TETO_TOTAL;
  const jaTem = new Set(blocos.map((b) => b.titulo.toLowerCase()));

  return (
    <div className="grid gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Escreva aqui o que a assistente deve saber para vender esta oferta: o que é, quem faz,
        perguntas frequentes, objeções, políticas. Ela só consulta estes textos quando a conversa é
        sobre esta oferta, e responde com as próprias palavras. Dado cadastrado (preço, datas,
        vagas) sempre vale mais que o texto.
      </p>

      <div
        className={cn(
          "rounded-2xl px-4 py-2.5 text-xs",
          passou ? "bg-warning-soft text-warning" : "bg-muted/40 text-muted-foreground",
        )}
      >
        {usados.toLocaleString("pt-BR")} de {TETO_TOTAL.toLocaleString("pt-BR")} caracteres usados
        {passou &&
          ". O que passar do limite não chega à assistente: encurte ou desligue algum texto."}
      </div>

      <div className="grid gap-3">
        {blocos.map((b, i) => (
          <article
            key={b.id}
            className={cn(
              "rounded-3xl border border-border/70 bg-card p-5 shadow-1",
              !b.ativo && "opacity-60",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">{b.titulo}</p>
                {b.quandoUsar && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Quando usar: {b.quandoUsar}
                  </p>
                )}
              </div>
              <Switch
                checked={b.ativo}
                disabled={ligarM.isPending}
                onCheckedChange={() => ligarM.mutate(b)}
                aria-label={`Usar ${b.titulo}`}
              />
            </div>
            <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
              {b.texto}
            </p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-2xs tabular-nums text-muted-foreground">
                {b.texto.length.toLocaleString("pt-BR")} caracteres
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={i === 0 || ordemM.isPending}
                  onClick={() => mover(i, -1)}
                  aria-label="Subir"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={i === blocos.length - 1 || ordemM.isPending}
                  onClick={() => mover(i, 1)}
                  aria-label="Descer"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() =>
                    setEditando({
                      id: b.id,
                      titulo: b.titulo,
                      quandoUsar: b.quandoUsar ?? "",
                      texto: b.texto,
                      ativo: b.ativo,
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-danger"
                  disabled={excluirM.isPending}
                  onClick={() => {
                    if (confirm(`Excluir "${b.titulo}"?`)) excluirM.mutate(b.id);
                  }}
                  aria-label={`Excluir ${b.titulo}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </article>
        ))}

        {editando && (
          <article className="grid gap-4 rounded-3xl border border-primary/40 bg-card p-5 shadow-1">
            <Campo rotulo="Título">
              <Input
                value={editando.titulo}
                maxLength={80}
                placeholder="Ex.: Quem aplica e supervisiona"
                onChange={(e) => setEditando({ ...editando, titulo: e.target.value })}
              />
            </Campo>
            <Campo
              rotulo="Quando usar"
              ajuda="Em que situação a assistente deve consultar este texto."
            >
              <Input
                value={editando.quandoUsar}
                maxLength={200}
                placeholder="Ex.: Quando perguntarem quem faz o procedimento"
                onChange={(e) => setEditando({ ...editando, quandoUsar: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Texto">
              <Textarea
                rows={8}
                value={editando.texto}
                maxLength={LIMITE_DO_BLOCO}
                onChange={(e) => setEditando({ ...editando, texto: e.target.value })}
              />
              <span className="mt-1 block text-right text-2xs tabular-nums text-muted-foreground">
                {editando.texto.length.toLocaleString("pt-BR")} /{" "}
                {LIMITE_DO_BLOCO.toLocaleString("pt-BR")}
              </span>
            </Campo>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button
                variant="premium"
                disabled={salvarM.isPending}
                onClick={() => salvarM.mutate(editando)}
              >
                Salvar texto
              </Button>
            </div>
          </article>
        )}
      </div>

      {!editando && (
        <div className="grid gap-2">
          <Button
            variant="outline"
            className="justify-self-start gap-1.5 rounded-full"
            onClick={() => setEditando(novo())}
          >
            <Plus className="h-4 w-4" />
            Adicionar texto
          </Button>
          <div className="flex flex-wrap gap-2">
            {SUGESTOES.filter((s) => !jaTem.has(s.titulo.toLowerCase())).map((s) => (
              <button
                key={s.titulo}
                type="button"
                onClick={() => setEditando(novo(s.titulo, s.quando))}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                + {s.titulo}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
