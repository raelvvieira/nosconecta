import { Clock, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { horasAteVirarACota, type EstadoDoLote } from "@/lib/atendimentos/loteDeDisparo";

/**
 * Enviar um recorte grande em lotes, respeitando a cota do dia.
 *
 * Existe porque a cota diária e o tamanho da base não conversam: 808 contatos
 * do DDD 51 com limite de 200 são cinco dias. Sem isto, a pessoa seleciona os
 * 808, é recusada por "limite diário excedido", e tem que descobrir sozinha
 * como fatiar — marcando 200 na mão, e no dia seguinte lembrando quais já
 * foram.
 *
 * O lote não é um número fixo: é a cota que sobra. Coincide com 200 no caso
 * comum, mas segue a verdade quando parte do dia já foi gasta ou quando o
 * limite é alterado na tela de Campanhas.
 *
 * Quem já foi tratado não vem daqui — vem de `whatsapp_broadcast_targets`, o
 * mesmo dado do filtro "sem disparo recente". Por isso o progresso sobrevive a
 * recarregar a página, e o lote não depende da ordem da lista (que não é
 * estável: as páginas do CRM chegam em paralelo).
 */
export function LoteDeDisparo({
  estado,
  recorte,
  limite,
  usadoHoje,
  enviando,
  onEnviar,
}: {
  estado: EstadoDoLote;
  /** Como chamar o recorte na tela: "DDD 51", "Todos os contatos"… */
  recorte: string;
  /** Os dois números da cota, só para a mensagem de bloqueio dizer "200/200"
   *  em vez de "esgotada" — saber quanto era ajuda a decidir se vale subir. */
  limite: number;
  usadoHoje: number;
  enviando?: boolean;
  onEnviar: () => void;
}) {
  const { total, tratados, restantes, tamanho, motivo, cotaRestante, progresso } = estado;
  const pct = Math.round(progresso * 100);
  const horas = motivo === "cota" ? horasAteVirarACota() : 0;

  return (
    <section
      data-lote-disparo=""
      className="surface-card mt-3 space-y-3 p-4"
      aria-label={`Envio em lotes para ${recorte}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold">{recorte}</p>
        <p className="text-2xs tabular-nums text-muted-foreground" data-lote-progresso="">
          {tratados > 0 ? (
            <>
              <span className="font-semibold text-foreground">{tratados}</span> de {total} já
              {tratados === 1 ? " tratado" : " tratados"}
            </>
          ) : (
            <>{total} contatos, nenhum disparo ainda</>
          )}
        </p>
      </div>

      {/* A barra é o que transforma "5 dias" de promessa em progresso visível.
          `transition-[width]` e não uma animação de keyframes: o valor muda
          quando o dado muda, e precisa poder ser interrompido por outro dado. */}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso do envio para este recorte"
      >
        <div
          className="h-full rounded-full bg-gradient-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>

      {motivo === "cota" ? (
        <div className="flex gap-2.5 rounded-xl bg-surface px-3 py-2.5">
          <Clock className="mt-px h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
          <div className="min-w-0 text-2xs leading-4">
            <p className="font-semibold text-foreground">
              Cota de hoje esgotada · {usadoHoje}/{limite}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Faltam {restantes} de {total}. O próximo lote libera à meia-noite
              {horas > 0 ? `, daqui a ${horas}h` : ""} — ou agora, se você aumentar o limite
              diário em Campanhas.
            </p>
          </div>
        </div>
      ) : motivo === "carregando" ? (
        <p className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-2xs leading-4 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" strokeWidth={2} />
          A base ainda está carregando — o total ainda vai mudar. O lote espera para não
          fatiar em cima de um número que não parou de pé.
        </p>
      ) : motivo === "concluido" ? (
        <p className="rounded-xl bg-success-soft px-3 py-2.5 text-2xs leading-4 text-success">
          Todos os {total} deste recorte já receberam ou estão na fila.
        </p>
      ) : (
        <>
          <Button
            data-enviar-lote=""
            variant="premium"
            className="press h-12 w-full gap-2"
            disabled={enviando}
            onClick={onEnviar}
          >
            <Send className="h-4 w-4" />
            {enviando ? "Preparando…" : estado.rotulo}
          </Button>
          <p className="text-center text-2xs text-muted-foreground">
            {estado.ultimo ? (
              <>Fecha este recorte. Sobra {cotaRestante - tamanho} da cota de hoje.</>
            ) : (
              <>
                Sobram {restantes - tamanho} para os próximos dias · cota de hoje: {cotaRestante}
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}

/** Como chamar o recorte atual numa frase — é o título do cartão. */
export function nomeDoRecorte(ddds: Set<string>, busca: string): string {
  const temBusca = Boolean(busca.trim());
  if (ddds.size === 1) {
    const d = [...ddds][0];
    return temBusca ? `DDD ${d}, filtrado por "${busca.trim()}"` : `DDD ${d}`;
  }
  if (ddds.size > 1) {
    const lista = [...ddds].sort().join(", ");
    return `DDDs ${lista}`;
  }
  return temBusca ? `Busca "${busca.trim()}"` : "Todos os contatos";
}
