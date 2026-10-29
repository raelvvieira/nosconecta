import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getRecovery,
  listarFigurinhas,
  removerFigurinha,
  salvarRecovery,
} from "@/lib/agente-ia/recovery.functions";
import {
  INTENSIDADES,
  MECANISMOS,
  NOME_DA_INTENSIDADE,
  NOME_DA_TRILHA,
  NOME_DO_MECANISMO,
  PRESETS,
  TRILHAS,
  instanteLocal,
  partesLocais,
  planejarSequencia,
  type ConfigDeRecuperacao,
  type EtapaConfig,
  type Trilha,
} from "@/lib/agente-ia/recovery";
import { Bloco, Chave } from "./campos";
import { useNomeDaAssistente } from "@/components/agente-ia/useNomeDaAssistente";

/**
 * O Recovery Engine: quando a Luna volta em quem parou de responder.
 *
 * ── O que esta tela controla, e o que não ──────────────────────────────
 *
 * Aqui mora o CALENDÁRIO: em quanto tempo cada retomada sai, em qual trilha, e
 * com qual abordagem sugerida. O que a Luna escreve continua vindo do manual
 * dela (Parte D). Os tempos citados no manual são referência; a fonte que vale
 * para o envio é esta tela, para não existirem duas regras de tempo.
 *
 * Edita um rascunho e grava tudo de uma vez. Gravar campo a campo, como o
 * resto da tela, salvaria uma cadência pela metade enquanto alguém ainda
 * está mexendo nela, e o motor roda a cada minuto.
 */
/**
 * O follow-up antigo só aparece enquanto o Recovery Engine está desligado.
 * Com os dois na tela e os dois ligados, a pessoa receberia retomada dobrada.
 */
export function SoSemRecovery({ children }: { children: React.ReactNode }) {
  const buscar = useServerFn(getRecovery);
  const query = useQuery({ queryKey: ["agente-ia-recovery"], queryFn: () => buscar() });
  if (!query.data || query.data.config.ligado) return null;
  return <>{children}</>;
}

export function RecoveryEngine() {
  const luna = useNomeDaAssistente();
  const queryClient = useQueryClient();
  const buscar = useServerFn(getRecovery);
  const salvar = useServerFn(salvarRecovery);
  const query = useQuery({ queryKey: ["agente-ia-recovery"], queryFn: () => buscar() });

  const [rascunho, setRascunho] = useState<ConfigDeRecuperacao | null>(null);
  const [trilha, setTrilha] = useState<Trilha>("INITIAL_NO_RESPONSE");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (query.data) setRascunho(structuredClone(query.data.config));
  }, [query.data]);

  const salvo = query.data?.config;
  const mudou = useMemo(
    () => !!rascunho && !!salvo && JSON.stringify(rascunho) !== JSON.stringify(salvo),
    [rascunho, salvo],
  );

  if (!rascunho) {
    return (
      <Bloco
        titulo="Recovery Engine"
        descricao={`Quando a ${luna} volta em quem parou de responder.`}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      </Bloco>
    );
  }

  const gravar = async (config: ConfigDeRecuperacao) => {
    setSalvando(true);
    try {
      await salvar({ data: { config } });
      await queryClient.invalidateQueries({ queryKey: ["agente-ia-recovery"] });
      await queryClient.invalidateQueries({ queryKey: ["agente-ia-atendimento"] });
      toast.success(
        config.ligado ? "Recovery Engine salvo." : "Salvo. O Recovery Engine está desligado.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const mudar = (f: (c: ConfigDeRecuperacao) => void) => {
    const c = structuredClone(rascunho);
    f(c);
    setRascunho(c);
  };
  const atual = rascunho.trilhas[trilha];
  const dias = query.data?.diasAbertos ?? [];

  return (
    <Bloco
      titulo="Recovery Engine"
      descricao={`Quando a ${luna} volta em quem parou de responder. Os tempos valem a partir da resposta dela que ficou sem retorno.`}
    >
      <div className="grid gap-5">
        <Chave
          rotulo="Ligar o Recovery Engine"
          dica={
            query.data?.followupAntigo
              ? "Ao ligar, o follow-up antigo (20h e 72h) é desligado, para a pessoa não receber retomada dobrada."
              : "Só age em conversa que parar depois de ligar. Conversas antigas não são acordadas."
          }
          ligada={rascunho.ligado}
          onMudar={(v) => void gravar({ ...rascunho, ligado: v })}
        />

        {/* ── Janela ───────────────────────────────────────────────────── */}
        <div className="grid gap-3 rounded-2xl bg-muted/40 p-4">
          <p className="text-sm font-medium">Quando pode sair mensagem</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-sm">
            <Hora
              rotulo="Das"
              valor={rascunho.janelaInicio}
              onMudar={(v) => mudar((c) => (c.janelaInicio = v))}
            />
            <Hora
              rotulo="às"
              valor={rascunho.janelaFim}
              onMudar={(v) => mudar((c) => (c.janelaFim = v))}
            />
            <span className="text-xs text-muted-foreground">
              em dia que o consultório atende ({nomesDosDias(dias)})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">Retomada depois da noite às</span>
              <Input
                type="time"
                value={rascunho.horaDaRetomada}
                onChange={(e) => mudar((c) => (c.horaDaRetomada = e.target.value))}
                className="w-28"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">Atraso tolerado</span>
              <Input
                type="number"
                min={1}
                max={120}
                value={rascunho.toleranciaMinutos}
                onChange={(e) => mudar((c) => (c.toleranciaMinutos = Number(e.target.value)))}
                className="w-20 text-right tabular-nums"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </label>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            As etapas que caírem fora do horário não são acumuladas para a manhã: viram no máximo
            uma retomada no dia seguinte, e só se aquele dia ainda não tiver a despedida. Etapa
            atrasada além do tolerado (servidor fora do ar, por exemplo) é descartada.
          </p>
        </div>

        <Figurinhas />

        {/* ── Trilhas ──────────────────────────────────────────────────── */}
        <div className="grid gap-3">
          <p className="text-sm font-medium">Trilhas</p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {TRILHAS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTrilha(t)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  t === trilha
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-white text-foreground-secondary hover:bg-muted",
                  !rascunho.trilhas[t].ligada && t !== trilha && "opacity-60",
                )}
              >
                {NOME_DA_TRILHA[t].nome}
              </button>
            ))}
          </div>

          <div className="grid gap-4 rounded-2xl border border-border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{NOME_DA_TRILHA[trilha].nome}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {NOME_DA_TRILHA[trilha].quando}
                </p>
              </div>
              {trilha !== "STOP" && (
                <Switch
                  checked={atual.ligada}
                  onCheckedChange={(v) => mudar((c) => (c.trilhas[trilha].ligada = v))}
                  aria-label="Trilha ligada"
                />
              )}
            </div>

            {trilha === "STOP" ? (
              <p className="text-xs text-muted-foreground">
                Quem recusa contato ou pede para parar nunca recebe retomada. Não há o que
                configurar aqui.
              </p>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Intensidade</span>
                  <Select
                    value={atual.intensidade}
                    onValueChange={(v) =>
                      mudar((c) => (c.trilhas[trilha].intensidade = v as typeof atual.intensidade))
                    }
                  >
                    <SelectTrigger className="h-9 w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTENSIDADES.filter((i) => i !== "STOP").map((i) => (
                        <SelectItem key={i} value={i}>
                          {NOME_DA_INTENSIDADE[i]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <ol className="grid gap-2">
                  {atual.etapas.map((e, i) => (
                    <Etapa
                      key={i}
                      numero={i + 1}
                      etapa={e}
                      onMudar={(nova) => mudar((c) => (c.trilhas[trilha].etapas[i] = nova))}
                      onRemover={() => mudar((c) => c.trilhas[trilha].etapas.splice(i, 1))}
                    />
                  ))}
                </ol>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={atual.etapas.length >= 8}
                    onClick={() =>
                      mudar((c) =>
                        c.trilhas[trilha].etapas.push({
                          momento: { tipo: "minutos", minutos: 60 },
                          mecanismo: "USEFUL_INFORMATION",
                          ativa: true,
                          condicional: false,
                        }),
                      )
                    }
                  >
                    <Clock className="h-4 w-4" /> Etapa em minutos
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={atual.etapas.length >= 8}
                    onClick={() =>
                      mudar((c) =>
                        c.trilhas[trilha].etapas.push({
                          momento: { tipo: "dia", dias: 1, hora: "16:00" },
                          mecanismo: "BREAKUP",
                          ativa: true,
                          condicional: false,
                        }),
                      )
                    }
                  >
                    <CalendarClock className="h-4 w-4" /> Etapa em outro dia
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      mudar((c) => (c.trilhas[trilha] = structuredClone(PRESETS[trilha])))
                    }
                  >
                    Voltar ao padrão
                  </Button>
                </div>

                <Previa config={rascunho} trilha={trilha} dias={dias} />
              </>
            )}
          </div>
        </div>

        {mudou && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => salvo && setRascunho(structuredClone(salvo))}
              disabled={salvando}
            >
              Descartar
            </Button>
            <Button
              type="button"
              variant="premium"
              onClick={() => void gravar(rascunho)}
              disabled={salvando}
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar Recovery Engine
            </Button>
          </div>
        )}
      </div>
    </Bloco>
  );
}

function Hora({
  rotulo,
  valor,
  onMudar,
}: {
  rotulo: string;
  valor: number;
  onMudar: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-muted-foreground">{rotulo}</span>
      <Input
        type="number"
        min={0}
        max={24}
        value={valor}
        onChange={(e) => onMudar(Number(e.target.value))}
        className="w-16 text-right tabular-nums"
      />
      <span className="text-xs text-muted-foreground">h</span>
    </label>
  );
}

function Etapa({
  numero,
  etapa,
  onMudar,
  onRemover,
}: {
  numero: number;
  etapa: EtapaConfig;
  onMudar: (e: EtapaConfig) => void;
  onRemover: () => void;
}) {
  const luna = useNomeDaAssistente();
  const m = etapa.momento;
  return (
    <li
      className={cn(
        "grid gap-3 rounded-xl border border-border bg-white px-3 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center",
        !etapa.ativa && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <Switch
          checked={etapa.ativa}
          onCheckedChange={(v) => onMudar({ ...etapa, ativa: v })}
          aria-label={`Etapa ${numero} ativa`}
        />
        <span className="w-9 text-xs font-semibold tabular-nums">FU{numero}</span>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        {m.tipo === "minutos" && (
          <>
            <Input
              type="number"
              min={1}
              value={m.minutos}
              onChange={(e) =>
                onMudar({ ...etapa, momento: { tipo: "minutos", minutos: Number(e.target.value) } })
              }
              className="h-9 w-20 text-right tabular-nums"
              aria-label="Minutos"
            />
            <span className="text-xs text-muted-foreground">min após a resposta da {luna}</span>
          </>
        )}
        {m.tipo === "dia" && (
          <>
            <Input
              type="number"
              min={1}
              max={30}
              value={m.dias}
              onChange={(e) =>
                onMudar({ ...etapa, momento: { ...m, dias: Number(e.target.value) } })
              }
              className="h-9 w-16 text-right tabular-nums"
              aria-label="Dias depois"
            />
            <span className="text-xs text-muted-foreground">dia(s) depois, às</span>
            <Input
              type="time"
              value={m.hora}
              onChange={(e) => onMudar({ ...etapa, momento: { ...m, hora: e.target.value } })}
              className="h-9 w-28"
              aria-label="Hora"
            />
          </>
        )}
        {m.tipo === "retorno" && (
          <>
            <span className="text-xs text-muted-foreground">No dia combinado, às</span>
            <Input
              type="time"
              value={m.hora}
              onChange={(e) => onMudar({ ...etapa, momento: { ...m, hora: e.target.value } })}
              className="h-9 w-28"
              aria-label="Hora"
            />
          </>
        )}
        <Select
          value={etapa.mecanismo}
          onValueChange={(v) => onMudar({ ...etapa, mecanismo: v as EtapaConfig["mecanismo"] })}
        >
          <SelectTrigger className="h-9 w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MECANISMOS.map((mec) => (
              <SelectItem key={mec} value={mec}>
                {NOME_DO_MECANISMO[mec]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {m.tipo === "minutos" && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={etapa.condicional}
              onChange={(e) => onMudar({ ...etapa, condicional: e.target.checked })}
            />
            só se couber no horário
          </label>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemover}
        aria-label={`Remover etapa ${numero}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

/**
 * A sequência como o motor vai calcular: a MESMA função (`planejarSequencia`),
 * com os dias do consultório. Mostra o caso comum (resposta às 10h) e o caso
 * que costuma surpreender (resposta às 18h30).
 */
function Previa({
  config,
  trilha,
  dias,
}: {
  config: ConfigDeRecuperacao;
  trilha: Trilha;
  dias: number[];
}) {
  const luna = useNomeDaAssistente();
  const exemplos = useMemo(() => {
    const hoje = proximoDiaUtil(dias);
    if (!hoje) return [];
    return ["10:00", "18:30"].map((hora) => {
      const origem = instanteLocal(hoje, hora, config.fuso);
      const plano = planejarSequencia({
        origem,
        trilha: config.trilhas[trilha],
        config: { ...config, ligado: true },
        diasAbertos: dias,
        retornoEm: trilha === "PROMISED_CALLBACK" ? somarDias(hoje, 2) : null,
      });
      return {
        hora,
        linhas: plano.map((e) => ({
          quando: formatar(e.venceEm, origem, config.fuso),
          mecanismo: NOME_DO_MECANISMO[e.mecanismo],
          juntou: e.juntou,
        })),
      };
    });
  }, [config, trilha, dias]);

  if (!dias.length) {
    return (
      <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
        Nenhum dia de atendimento cadastrado: sem isso nenhuma retomada sai.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {exemplos.map((ex) => (
        <div key={ex.hora} className="rounded-xl bg-muted/40 p-3">
          <p className="text-xs font-semibold">
            Se a {luna} responder às {ex.hora.replace(":", "h")}
            {trilha === "PROMISED_CALLBACK" && " e o retorno for daqui a 2 dias"}
          </p>
          {ex.linhas.length ? (
            <ul className="mt-2 grid gap-1 text-xs">
              {ex.linhas.map((l, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="tabular-nums">{l.quando}</span>
                  <span className="truncate text-muted-foreground">
                    {l.mecanismo}
                    {l.juntou > 0 && " (no lugar das que a noite pegou)"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Nenhuma retomada.</p>
          )}
        </div>
      ))}
    </div>
  );
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function nomesDosDias(dias: number[]): string {
  if (!dias.length) return "nenhum dia cadastrado";
  return dias.map((d) => DIAS[d]).join(", ");
}

function somarDias(data: string, n: number): string {
  const t = new Date(`${data}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** O próximo dia (a partir de hoje) em que o consultório atende. */
function proximoDiaUtil(dias: number[]): string | null {
  const hoje = partesLocais(new Date(), "America/Sao_Paulo").data;
  for (let i = 0; i < 14; i++) {
    const d = somarDias(hoje, i);
    if (dias.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) return d;
  }
  return null;
}

/** "mesmo dia 10h20" ou "dia seguinte 16h00". */
function formatar(iso: string, origem: Date, fuso: string): string {
  const p = partesLocais(new Date(iso), fuso);
  const o = partesLocais(origem, fuso);
  const dias = Math.round(
    (Date.parse(`${p.data}T12:00:00Z`) - Date.parse(`${o.data}T12:00:00Z`)) / 86_400_000,
  );
  const quando = dias === 0 ? "mesmo dia" : dias === 1 ? "dia seguinte" : `+${dias} dias`;
  return `${quando} ${String(p.hora).padStart(2, "0")}h${String(p.minuto).padStart(2, "0")}`;
}

/**
 * As figurinhas que a Luna pode mandar na etapa de quebra de padrão.
 *
 * Aprovar é no chat (botão embaixo da figurinha); aqui se vê e se tira.
 * Sem nenhuma, a etapa sai em texto leve.
 */
function Figurinhas() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(listarFigurinhas);
  const remover = useServerFn(removerFigurinha);
  const query = useQuery({ queryKey: ["figurinhas-da-luna", "lista"], queryFn: () => buscar() });
  const lista = query.data ?? [];

  return (
    <div className="grid gap-3 rounded-2xl bg-muted/40 p-4">
      <div>
        <p className="text-sm font-medium">Figurinhas da quebra de padrão</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Uma por sequência, no máximo, e só em quem nunca respondeu, parou no meio da conversa ou
          não escolheu horário. Para incluir, mande a figurinha numa conversa e toque em &ldquo;Usar
          nos follow-ups&rdquo; embaixo dela.
        </p>
      </div>
      {query.isPending ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : lista.length ? (
        <div className="flex flex-wrap gap-2">
          {lista.map((f) => (
            <div key={f.id} className="group relative h-20 w-20 rounded-xl bg-white p-1.5">
              {f.url ? (
                <img
                  src={f.url}
                  alt="Figurinha aprovada"
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="grid h-full place-items-center text-3xs text-muted-foreground">
                  sem arquivo
                </span>
              )}
              <button
                type="button"
                aria-label="Tirar esta figurinha"
                onClick={async () => {
                  try {
                    await remover({ data: { id: f.id } });
                    await queryClient.invalidateQueries({ queryKey: ["figurinhas-da-luna"] });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Não foi possível tirar.");
                  }
                }}
                className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-border bg-white text-muted-foreground shadow-sm hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nenhuma aprovada ainda: a quebra de padrão sai em texto leve.
        </p>
      )}
    </div>
  );
}
