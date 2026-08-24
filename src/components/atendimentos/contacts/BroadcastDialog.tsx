import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Gauge, Image as ImageIcon, Info, MessageCircle, UserX } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PhonePreview } from "@/components/atendimentos/campaigns/PhonePreview";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getMessageTemplates,
  saveMessageTemplate,
} from "@/lib/atendimentos/campaigns.functions";
import type { RitmoDoDisparo } from "@/lib/atendimentos/broadcast.functions";
import {
  VARIAVEIS_DE_DISPARO,
  aplicarVariaveis,
  variaveisDesconhecidas,
} from "@/lib/atendimentos/broadcastVars";
import { CampoDeImagem, type ImagemDoDisparo } from "./CampoDeImagem";
import type { ContatoSelecionado } from "./ContactsTab";

/**
 * Ritmos oferecidos. Faixa, e não valor único, porque cadência exata é o padrão
 * que sistemas antispam reconhecem como robô — 200 mensagens a cada 8 segundos
 * cravados não se parece com ninguém digitando.
 */
const RITMOS: { id: string; rotulo: string; nota: string; ritmo: RitmoDoDisparo }[] = [
  {
    id: "seguro",
    rotulo: "Seguro",
    nota: "5 a 10s, pausa a cada 50",
    ritmo: { minSegundos: 5, maxSegundos: 10, pausarACada: 50, retomarEmMinutos: 5 },
  },
  {
    id: "normal",
    rotulo: "Normal",
    nota: "5 a 10s, sem pausa",
    ritmo: { minSegundos: 5, maxSegundos: 10, pausarACada: 0, retomarEmMinutos: 0 },
  },
  {
    id: "rapido",
    rotulo: "Rápido",
    nota: "3 a 6s — mais risco",
    ritmo: { minSegundos: 3, maxSegundos: 6, pausarACada: 0, retomarEmMinutos: 0 },
  },
];

/** Duração da fila em minutos, pela média da faixa. Espelha
 *  `duracaoEstimadaMinutos` de `_shared/ritmo.ts` (Deno não é importável de
 *  `src/`) — prometer o melhor caso e entregar o pior seria pior do que
 *  prometer a média. Exportada para o teste conferir que as duas concordam:
 *  divergir faz a tela prometer um tempo e a fila levar outro.
 *  @internal */
export function duracaoMinutos(quantidade: number, r: RitmoDoDisparo): number {
  if (quantidade <= 1) return 0;
  const intervalos = quantidade - 1;
  const medio = (r.minSegundos + r.maxSegundos) / 2;
  const pausas = r.pausarACada > 0 ? Math.floor(intervalos / r.pausarACada) : 0;
  return Math.round((intervalos * medio + pausas * r.retomarEmMinutos * 60) / 60);
}

function textoDeDuracao(min: number): string {
  if (min < 1) return "menos de um minuto";
  if (min < 60) return `${min} minutos`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Revisão antes de disparar para uma seleção.
 *
 * A mensagem à vista, quantos vão, quanto sobra da cota. O que ele ganhou sobre
 * o diálogo de campanha que existiu antes é a divisão entre os dois caminhos de
 * envio — quem tem conversa aberta recebe por um caminho confirmado, quem não
 * tem depende de um endpoint do CRM que nunca foi testado. Dizer isso antes é o
 * que evita a pessoa achar que alcançou a base inteira.
 */
export function BroadcastDialog({
  contatos,
  usage,
  isPending,
  onOpenChange,
  onConfirm,
}: {
  /** `null` = fechado. */
  contatos: ContatoSelecionado[] | null;
  usage: { limit: number; usedToday: number };
  isPending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (dados: {
    message: string;
    ritmo: RitmoDoDisparo;
    mediaPath: string | null;
  }) => void;
}) {
  const [mensagem, setMensagem] = useState("");
  const [ritmoId, setRitmoId] = useState("seguro");
  const [imagem, setImagem] = useState<ImagemDoDisparo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvarComoModelo, setSalvarComoModelo] = useState(false);
  const [nomeDoModelo, setNomeDoModelo] = useState("");
  const caixaRef = useRef<HTMLTextAreaElement>(null);
  const aberto = Boolean(contatos?.length);

  const queryClient = useQueryClient();
  const buscarModelos = useServerFn(getMessageTemplates);
  const salvarModelo = useServerFn(saveMessageTemplate);

  const modelosQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => buscarModelos(),
    enabled: aberto,
    staleTime: 5 * 60_000,
  });

  const guardarModelo = useMutation({
    mutationFn: () =>
      salvarModelo({ data: { name: nomeDoModelo.trim(), content: mensagem.trim() } }),
    onSuccess: () => {
      toast.success("Modelo salvo");
      setSalvarComoModelo(false);
      setNomeDoModelo("");
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!aberto) return;
    setMensagem("");
    setRitmoId("seguro");
    setImagem(null);
    setErro(null);
    setSalvarComoModelo(false);
    setNomeDoModelo("");
  }, [aberto]);

  const { comConversa, semConversa, exemploDeNome } = useMemo(() => {
    const lista = contatos ?? [];
    return {
      comConversa: lista.filter((c) => c.conversationId).length,
      semConversa: lista.filter((c) => !c.conversationId).length,
      // A prévia usa alguém de verdade da seleção, não "Fulano": é assim que se
      // percebe que {{primeiro_nome}} num contato salvo como "Consultório
      // Centro" vai sair estranho.
      exemploDeNome: lista.find((c) => c.name)?.name ?? "",
    };
  }, [contatos]);

  const ritmo = RITMOS.find((r) => r.id === ritmoId)?.ritmo ?? RITMOS[0].ritmo;
  const total = contatos?.length ?? 0;
  const restante = Math.max(0, usage.limit - usage.usedToday);
  const estouraLimite = total > restante;
  const minutos = duracaoMinutos(total, ritmo);
  const desconhecidas = variaveisDesconhecidas(mensagem);
  const previa = aplicarVariaveis(mensagem, { nome: exemploDeNome });

  /** Insere a variável onde o cursor está, e devolve o foco — colar no fim
   *  obrigaria a pessoa a recortar e mover à mão. */
  const inserirVariavel = (chave: string) => {
    const el = caixaRef.current;
    const marca = `{{${chave}}}`;
    if (!el) {
      setMensagem((m) => m + marca);
      return;
    }
    const ini = el.selectionStart ?? mensagem.length;
    const fim = el.selectionEnd ?? mensagem.length;
    const novo = mensagem.slice(0, ini) + marca + mensagem.slice(fim);
    setMensagem(novo);
    setErro(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = ini + marca.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const confirmar = () => {
    if (!mensagem.trim()) {
      setErro("Escreva a mensagem que será enviada.");
      return;
    }
    setErro(null);
    onConfirm({ message: mensagem.trim(), ritmo, mediaPath: imagem?.path ?? null });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={(o) => !o && onOpenChange(false)}>
      <AlertDialogContent className="max-w-[640px]" data-disparo-revisao="">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Disparar para {total} contato{total === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Confira a mensagem antes de enviar. Depois de disparada, não há como recolher.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
          <div className="space-y-5">
            {/* ── Mensagem ─────────────────────────────────────────────── */}
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="disparo-msg" className="text-sm font-medium">
                  Mensagem
                </Label>
                {(modelosQuery.data ?? []).length > 0 && (
                  <Select
                    onValueChange={(id) => {
                      const m = (modelosQuery.data ?? []).find((t) => t.id === id);
                      if (m) {
                        setMensagem(m.content);
                        setErro(null);
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 w-48 rounded-full text-2xs">
                      <SelectValue placeholder="Usar um modelo salvo" />
                    </SelectTrigger>
                    <SelectContent>
                      {(modelosQuery.data ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <Textarea
                id="disparo-msg"
                ref={caixaRef}
                data-disparo-mensagem=""
                value={mensagem}
                onChange={(e) => {
                  setMensagem(e.target.value);
                  if (erro) setErro(null);
                }}
                placeholder="Oi {{primeiro_nome}}, tudo bem? Temos um horário…"
                className="min-h-28 rounded-xl bg-white"
              />

              {/* As variáveis ficam colados na caixa, não num painel à parte:
                  é aqui que se percebe que dá para chamar a pessoa pelo nome. */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-2xs text-muted-foreground">Inserir:</span>
                {VARIAVEIS_DE_DISPARO.map((v) => (
                  <button
                    key={v.chave}
                    type="button"
                    data-variavel={v.chave}
                    onClick={() => inserirVariavel(v.chave)}
                    className={cn(
                      "press h-8 rounded-full border border-border bg-white px-3 font-mono text-2xs",
                      "text-foreground-secondary transition-colors hover:border-coral hover:text-coral",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-1",
                    )}
                    title={`${v.rotulo} — ex.: ${v.exemplo}`}
                  >
                    {`{{${v.chave}}}`}
                  </button>
                ))}
              </div>

              {erro && (
                <p data-disparo-erro="" className="text-2xs text-danger">
                  {erro}
                </p>
              )}

              {desconhecidas.length > 0 && (
                <p className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-2xs leading-4 text-warning">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  {desconhecidas.map((d) => `{{${d}}}`).join(", ")}{" "}
                  {desconhecidas.length === 1 ? "não existe" : "não existem"} num disparo e{" "}
                  {desconhecidas.length === 1 ? "vai sair" : "vão sair"} escrito assim mesmo na
                  mensagem. Um disparo só conhece o nome do contato.
                </p>
              )}

              <label className="flex items-center gap-2 pt-0.5">
                <Checkbox
                  checked={salvarComoModelo}
                  onCheckedChange={(v) => setSalvarComoModelo(v === true)}
                  disabled={!mensagem.trim()}
                />
                <span className="text-2xs text-muted-foreground">Salvar como modelo</span>
              </label>
              {salvarComoModelo && (
                <div className="flex gap-2">
                  <Input
                    value={nomeDoModelo}
                    onChange={(e) => setNomeDoModelo(e.target.value)}
                    placeholder="Nome do modelo"
                    className="h-9 flex-1 text-2xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-2xs"
                    disabled={!nomeDoModelo.trim() || guardarModelo.isPending}
                    onClick={() => guardarModelo.mutate()}
                  >
                    {guardarModelo.isPending ? "Salvando…" : "Salvar"}
                  </Button>
                </div>
              )}
            </section>

            {/* ── Imagem ───────────────────────────────────────────────── */}
            <section className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                Imagem <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <CampoDeImagem imagem={imagem} onChange={setImagem} disabled={isPending} />
              {imagem && semConversa > 0 && (
                <p
                  data-imagem-limite=""
                  className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-2xs leading-4 text-warning"
                >
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  <span>
                    <strong>{semConversa}</strong> {semConversa === 1 ? "contato" : "contatos"} sem
                    conversa aberta {semConversa === 1 ? "recebe" : "recebem"} só o texto — a imagem
                    só pode ser anexada a uma conversa que já existe. Os {comConversa} com conversa
                    recebem a foto com a mensagem como legenda.
                  </span>
                </p>
              )}
            </section>

            {/* ── Ritmo ────────────────────────────────────────────────── */}
            <section className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                Ritmo do envio
              </Label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Ritmo do envio">
                {RITMOS.map((r) => {
                  const ativo = r.id === ritmoId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      data-ritmo={r.id}
                      onClick={() => setRitmoId(r.id)}
                      className={cn(
                        "press rounded-xl border px-3 py-2.5 text-left transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-1",
                        ativo
                          ? "border-coral bg-coral-soft"
                          : "border-border bg-white hover:border-foreground-secondary/40",
                      )}
                    >
                      <span
                        className={cn(
                          "block text-sm font-semibold",
                          ativo ? "text-coral" : "text-foreground",
                        )}
                      >
                        {r.rotulo}
                      </span>
                      <span className="mt-0.5 block text-2xs leading-4 text-muted-foreground">
                        {r.nota}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-2xs leading-4 text-muted-foreground">
                O intervalo sorteia dentro da faixa a cada mensagem — cadência exata é o que
                denuncia envio automático. A fila leva cerca de{" "}
                <strong className="text-foreground">{textoDeDuracao(minutos)}</strong> e continua
                mesmo com o aplicativo fechado.
              </p>
            </section>

            {/* ── Quem recebe e por onde ───────────────────────────────── */}
            <div className="space-y-1.5 rounded-xl bg-surface px-3 py-2.5 text-2xs leading-4">
              <p className="flex items-center gap-2 text-foreground-secondary">
                <MessageCircle className="h-3.5 w-3.5 shrink-0 text-success" />
                <span data-com-conversa="">
                  <strong>{comConversa}</strong> com conversa aberta — envio direto.
                </span>
              </p>
              {semConversa > 0 && (
                <p className="flex items-center gap-2 text-foreground-secondary">
                  <UserX className="h-3.5 w-3.5 shrink-0 text-warning" />
                  <span data-sem-conversa="">
                    <strong>{semConversa}</strong> sem conversa — tentamos abrir pelo contato, mas
                    esse caminho ainda não foi confirmado pelo CRM e pode falhar.
                  </span>
                </p>
              )}
            </div>

            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Sobra hoje</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  estouraLimite ? "text-danger" : "text-foreground",
                )}
              >
                {restante} de {usage.limit}
              </span>
            </div>

            {estouraLimite && (
              <p className="flex gap-2 rounded-xl bg-danger-soft px-3 py-2 text-2xs leading-4 text-danger">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                A seleção passa do limite diário. O disparo será recusado.
              </p>
            )}

            <p className="flex gap-2 rounded-xl bg-surface px-3 py-2 text-2xs leading-4 text-muted-foreground">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              A cota do dia é debitada inteira no disparo — cancelar no meio não devolve.
            </p>
          </div>

          <div className="sm:w-[210px]">
            {/* A prévia mostra a mensagem JÁ com as variáveis trocadas, pelo nome
                de alguém real da seleção — é o único jeito de perceber antes de
                disparar que {{primeiro_nome}} vai sair torto num contato salvo
                como "Consultório Centro". */}
            <PhonePreview content={previa} mediaUrl={imagem?.previa ?? null} />
            {exemploDeNome && mensagem.includes("{{") && (
              <p className="mt-2 text-center text-2xs leading-4 text-muted-foreground">
                Prévia com o nome de <strong className="text-foreground">{exemploDeNome}</strong>,
                da sua seleção.
              </p>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            data-disparo-confirmar=""
            className="bg-gradient-primary text-white hover:opacity-90"
            disabled={isPending || estouraLimite || !mensagem.trim()}
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
          >
            {isPending ? "Enfileirando..." : `Disparar para ${total}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
