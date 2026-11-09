import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Image as ImageIcon, Loader2, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { simularAtendimento } from "@/lib/agente-ia/agente.functions";
import { Bloco } from "./campos";

/**
 * A simulação.
 *
 * Passa pelo MESMO `atender` do webhook — filtros, modelo, segmentação e
 * ritmo. O que muda é só o destino: nada sai daqui para ninguém.
 *
 * É o que torna o atendimento testável de verdade. Sem isto, a única maneira
 * de saber o que a IA diria seria deixá-la dizer a um paciente.
 *
 * ── E o interruptor não atrapalha mais ──────────────────────────────────
 *
 * Com o agente desligado, esta tela devolvia "agente desligado" e mais nada,
 * porque é o primeiro filtro que `decidirSeResponde` checa. Ou seja: só
 * funcionava depois de você ter ligado a IA em cima das conversas reais — o
 * exato risco que ela existe para evitar. Agora a simulação passa por cima do
 * interruptor (e só ela) e avisa na tela que aquilo é prévia.
 */
type Fala = {
  deQuem: "clinica" | "paciente";
  texto: string;
  esperaMs?: number;
  /** O título do caso de antes e depois que iria junto desta bolha. */
  caso?: string | null;
};

export function Testar({
  semCartao = false,
  ofertaEmFoco,
  publicoFixo,
}: {
  semCartao?: boolean;
  /** Simula a conversa já com esta oferta em foco (id). Ausente = o normal. */
  ofertaEmFoco?: string;
  /** Fixa o público simulado (a ficha de uma oferta sabe qual é). */
  publicoFixo?: "atendimento" | "paciente_modelo" | "mentoria";
}) {
  const simular = useServerFn(simularAtendimento);
  const [texto, setTexto] = useState("");
  const [simulando, setSimulando] = useState(false);
  // A conversa fica na tela e vai inteira a cada mensagem: o módulo de
  // paciente modelo só faz sentido em várias trocas (qualificar, escolher
  // horário, dizer o nome, pagar).
  const [conversa, setConversa] = useState<Fala[]>([]);
  const [pacienteModelo, setPacienteModelo] = useState(false);
  const [aviso, setAviso] = useState<{ motivo?: string; desligado: boolean } | null>(null);

  const rodar = async () => {
    const mensagem = texto.trim();
    if (!mensagem) return;
    setSimulando(true);
    setAviso(null);
    const historico = conversa.map(({ deQuem, texto }) => ({ deQuem, texto }));
    setConversa((c) => [...c, { deQuem: "paciente", texto: mensagem }]);
    setTexto("");
    try {
      const r = await simular({
        data: {
          texto: mensagem,
          historico,
          publico: publicoFixo ?? (pacienteModelo ? "paciente_modelo" : undefined),
          ofertaEmFoco,
        },
      });
      setAviso({ motivo: r.respondeu ? undefined : r.motivo, desligado: r.desligado });
      if (r.respondeu) {
        setConversa((c) => [
          ...c,
          ...r.enviados.map((m) => ({
            deQuem: "clinica" as const,
            texto: m.texto,
            esperaMs: m.esperaMs,
            caso: m.caso ?? null,
          })),
        ]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "A simulação falhou.");
    } finally {
      setSimulando(false);
    }
  };

  const conteudo = (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {publicoFixo ? (
          <span className="text-xs text-muted-foreground">
            Conversa simulada com esta oferta em foco.
          </span>
        ) : (
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={pacienteModelo}
              onCheckedChange={(v) => {
                setPacienteModelo(v);
                setConversa([]);
                setAviso(null);
              }}
            />
            Simular como paciente modelo
          </label>
        )}
        {conversa.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-2xs"
            onClick={() => {
              setConversa([]);
              setAviso(null);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Nova conversa
          </Button>
        )}
      </div>

      {conversa.length > 0 && (
        <div className="mb-4 grid max-h-[50vh] gap-2 overflow-y-auto">
          {conversa.map((m, i) =>
            m.deQuem === "paciente" ? (
              <div key={i} className="flex justify-start">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-sm">
                  {m.texto}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-gradient-primary px-4 py-2.5 text-sm text-white">
                  {m.caso && (
                    <span className="mb-1.5 flex items-center gap-1.5 rounded-xl bg-white/15 px-2.5 py-1.5 text-xs font-medium">
                      <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                      Foto do caso: {m.caso}
                    </span>
                  )}
                  {m.texto}
                  {m.esperaMs !== undefined && (
                    <span className="mt-1 block text-2xs text-white/70">
                      após {(m.esperaMs / 1000).toFixed(1)}s digitando
                    </span>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && texto.trim() && !simulando && void rodar()}
          placeholder={
            pacienteModelo
              ? "Oi, vi que vocês procuram paciente modelo"
              : "Oi, quanto custa a limpeza?"
          }
        />
        <Button
          variant="premium"
          disabled={simulando || !texto.trim()}
          onClick={() => void rodar()}
        >
          {simulando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        </Button>
      </div>

      {aviso?.desligado && (
        <p className="mt-4 rounded-xl bg-surface px-3 py-2 text-xs leading-5 text-foreground-secondary">
          O agente está <strong>desligado</strong>. Isto é o que ele responderia se estivesse ligado
          — nenhum paciente recebeu nada.
        </p>
      )}

      {aviso?.motivo && (
        <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Não respondeu — {aviso.motivo}.
        </p>
      )}
    </>
  );

  // Dentro do pop-up (31/10) o cartão em volta seria uma moldura dentro de
  // outra; o título fica com o diálogo.
  if (semCartao) return <div>{conteudo}</div>;
  return (
    <Bloco titulo="Testar" descricao="Escreva como um paciente escreveria. Nada é enviado.">
      {conteudo}
    </Bloco>
  );
}
