import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getConsumoDaIa, salvarPrecoDoModelo } from "@/lib/agente-ia/agente.functions";
import { nomeDoMes, reaisLegiveis, tokensLegiveis } from "@/lib/agente-ia/consumo";
import { Bloco } from "./campos";
import { cn } from "@/lib/utils";

/**
 * Quanto a IA custou, por mês.
 *
 * ── O que este card tem de dizer, e o que não pode fingir ──────────────
 *
 * Ele mostra dinheiro, e número em reais numa tela é acreditado sem conferir.
 * Então três coisas aparecem SEMPRE que valem:
 *
 *   **"Não sei" não vira zero.** O modelo desta clínica não é de catálogo
 *   público. Sem preço cadastrado, o valor é um travessão e um convite a
 *   digitar o preço — nunca R$ 0,00, que diria que a IA é de graça.
 *
 *   **A estimativa se identifica.** O que rodou antes de a medição existir foi
 *   calculado por cima, e o mês que contém isso diz "inclui estimativa".
 *
 *   **A cotação mostra a data.** Uma cotação de duas semanas atrás
 *   apresentada como a de hoje é pior que nenhuma.
 *
 * ── Por que o mês mais recente é grande e o resto é lista ──────────────
 *
 * A pergunta é "quanto estou gastando", no presente. Os meses anteriores
 * existem para dar escala ao número de cima, e para isso uma linha basta.
 */
export function ConsumoDaIa() {
  const buscar = useServerFn(getConsumoDaIa);
  const consultaDoConsumo = useQuery({ queryKey: ["consumo-da-ia"], queryFn: () => buscar() });
  const dados = consultaDoConsumo.data;
  const [mostrarPreco, setMostrarPreco] = useState(false);

  const mesAtual = dados?.meses[0] ?? null;
  const anteriores = dados?.meses.slice(1, 7) ?? [];
  const semPreco = !!dados && !dados.precoConhecido;

  return (
    <Bloco
      titulo="O que a IA custa"
      descricao="Somado por mês, contando tudo que usa a chave da OpenAI."
      acao={
        dados?.dolar ? (
          <span className="shrink-0 text-right text-xs text-muted-foreground">
            dólar{" "}
            <span className="tabular-nums text-foreground">
              {dados.dolar.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
            <br />
            {dados.dolarDe === hojeEmSaoPaulo() ? "de hoje" : `de ${dataCurta(dados.dolarDe)}`}
          </span>
        ) : null
      }
    >
      {consultaDoConsumo.isPending ? (
        <div className="h-24 animate-pulse rounded-2xl bg-muted/40" />
      ) : !mesAtual ? (
        <p className="text-sm text-muted-foreground">
          Nenhum consumo registrado ainda. O contador começa na primeira vez que a IA pensar.
        </p>
      ) : (
        <div className="grid gap-5">
          {/* ── O mês corrente, grande ────────────────────────────────── */}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {nomeDoMes(mesAtual.mes)}
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              <p
                className={cn(
                  "text-3xl font-semibold tracking-tight tabular-nums",
                  mesAtual.usd === null && "text-muted-foreground",
                )}
              >
                {reaisLegiveis(emReais(mesAtual.usd, dados?.dolar ?? null))}
              </p>
              {mesAtual.usd !== null && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  US$ {mesAtual.usd.toFixed(2)}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {tokensLegiveis(mesAtual.tokens)} tokens em {mesAtual.chamadas}{" "}
              {mesAtual.chamadas === 1 ? "chamada" : "chamadas"}
              {mesAtual.temEstimativa && " · inclui estimativa"}
            </p>
          </div>

          {/* ── Quem gastou ───────────────────────────────────────────── */}
          {mesAtual.porUso.length > 0 && (
            <div className="grid gap-1.5">
              {mesAtual.porUso.map((u) => (
                <div key={u.para} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm">{u.nome}</span>
                  {/* A barra é a proporção, e ela é o ponto: aqui uma linha
                      costuma valer 95% do total, e o número sozinho não passa
                      isso tão rápido quanto a largura. */}
                  <div className="flex shrink-0 items-center gap-2.5">
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-muted sm:w-24">
                      <div
                        className="h-full rounded-full bg-foreground/25"
                        style={{
                          width: `${Math.max(2, Math.round((u.tokens / Math.max(1, mesAtual.tokens)) * 100))}%`,
                        }}
                      />
                    </div>
                    <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
                      {tokensLegiveis(u.tokens)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── De onde vem o gasto ───────────────────────────────────────
              Não é curiosidade: a instrução da Luna é reenviada inteira em
              toda chamada, e por isso a entrada costuma ser mais de 99% do
              consumo. Quem vê isso sabe onde mexer para gastar menos. */}
          <p className="text-xs text-foreground-subtle">
            {tokensLegiveis(mesAtual.entrada + mesAtual.cache)} de entrada (o manual e a tabela de
            preços, reenviados a cada resposta) contra {tokensLegiveis(mesAtual.saida)} do que ela
            escreveu.
          </p>

          {/* ── Sem preço: o convite ──────────────────────────────────── */}
          {semPreco && (
            <div className="rounded-2xl bg-warning-soft px-4 py-3">
              <p className="text-sm">
                O modelo <span className="font-medium">{dados?.modelo ?? "em uso"}</span> não está
                na tabela de preços pública, então o valor em reais não dá para calcular. Os tokens
                continuam sendo contados.
              </p>
              <button
                type="button"
                className="mt-1.5 text-sm font-medium underline underline-offset-4"
                onClick={() => setMostrarPreco((v) => !v)}
              >
                {mostrarPreco ? "Deixar para depois" : "Informar o preço"}
              </button>
            </div>
          )}

          {(mostrarPreco || (!semPreco && dados?.precoProprio)) && (
            <FormularioDePreco
              modelo={dados?.modelo ?? ""}
              atual={dados?.precoConhecido ?? null}
              aoSalvar={() => setMostrarPreco(false)}
            />
          )}

          {/* ── Os meses anteriores ───────────────────────────────────── */}
          {anteriores.length > 0 && (
            <div className="grid gap-0.5 border-t border-border pt-4">
              {anteriores.map((m) => (
                <div key={m.mes} className="flex items-baseline justify-between gap-3 py-1">
                  <span className="text-sm text-muted-foreground">
                    {nomeDoMes(m.mes)}
                    {m.temEstimativa && (
                      <span className="ml-1.5 text-xs text-foreground-subtle">estimado</span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {reaisLegiveis(emReais(m.usd, dados?.dolar ?? null))}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {tokensLegiveis(m.tokens)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {!semPreco && !dados?.precoProprio && (
            <button
              type="button"
              className="justify-self-start text-xs text-muted-foreground underline underline-offset-4"
              onClick={() => setMostrarPreco((v) => !v)}
            >
              {mostrarPreco ? "Fechar" : "Corrigir o preço do modelo"}
            </button>
          )}
        </div>
      )}
    </Bloco>
  );
}

/** Reais a partir do dólar da chamada. Fora do componente porque `null` de um
 *  lado ou do outro tem de continuar `null` — e é fácil perder isso no meio do
 *  JSX. */
function emReais(usd: number | null, dolar: number | null): number | null {
  if (usd === null || dolar === null) return null;
  return usd * dolar;
}

function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function dataCurta(dia: string | null): string {
  if (!dia) return "—";
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano.slice(2)}`;
}

/**
 * Os três preços, em dólares por milhão de tokens.
 *
 * Por milhão porque é a unidade em que a OpenAI publica: quem está com a
 * página de preços aberta copia o número como está, sem dividir nada.
 */
function FormularioDePreco({
  modelo,
  atual,
  aoSalvar,
}: {
  modelo: string;
  atual: { entrada: number; cache: number | null; saida: number } | null;
  aoSalvar: () => void;
}) {
  const queryClient = useQueryClient();
  const salvar = useServerFn(salvarPrecoDoModelo);
  const [entrada, setEntrada] = useState(atual ? String(atual.entrada) : "");
  const [cache, setCache] = useState(atual?.cache != null ? String(atual.cache) : "");
  const [saida, setSaida] = useState(atual ? String(atual.saida) : "");

  const gravar = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          modelo,
          entrada: Number(entrada.replace(",", ".")),
          // Vazio é "não sei", e não zero: zero faria o cache sair de graça na
          // conta, e ele é a maior parte do consumo aqui.
          cache: cache.trim() ? Number(cache.replace(",", ".")) : null,
          saida: Number(saida.replace(",", ".")),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consumo-da-ia"] });
      toast.success("Preço gravado. Os meses anteriores foram recalculados.");
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valido = Number(entrada.replace(",", ".")) >= 0 && Number(saida.replace(",", ".")) >= 0;

  return (
    <div className="grid gap-3 rounded-2xl border border-border p-4">
      <p className="text-sm text-muted-foreground">
        Em dólares por milhão de tokens, como está na página de preços da OpenAI.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <CampoDePreco rotulo="Entrada" valor={entrada} onMudar={setEntrada} />
        <CampoDePreco rotulo="Cache" valor={cache} onMudar={setCache} opcional />
        <CampoDePreco rotulo="Saída" valor={saida} onMudar={setSaida} />
      </div>
      <Button
        variant="premium"
        className="justify-self-start"
        disabled={!valido || gravar.isPending}
        onClick={() => gravar.mutate()}
      >
        {gravar.isPending ? "Gravando…" : "Gravar preço"}
      </Button>
    </div>
  );
}

function CampoDePreco({
  rotulo,
  valor,
  onMudar,
  opcional,
}: {
  rotulo: string;
  valor: string;
  onMudar: (v: string) => void;
  opcional?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">
        {rotulo}
        {opcional && <span className="ml-1 text-foreground-subtle">(se houver)</span>}
      </span>
      <Input
        inputMode="decimal"
        placeholder="0,00"
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        className="tabular-nums"
      />
    </label>
  );
}
