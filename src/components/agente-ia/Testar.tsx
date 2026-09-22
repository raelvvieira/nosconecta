import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 */
export function Testar() {
  const simular = useServerFn(simularAtendimento);
  const [texto, setTexto] = useState("");
  const [simulando, setSimulando] = useState(false);
  const [saida, setSaida] = useState<{
    respondeu: boolean;
    motivo?: string;
    enviados: { texto: string; esperaMs: number }[];
  } | null>(null);

  const rodar = async () => {
    setSimulando(true);
    setSaida(null);
    try {
      setSaida(await simular({ data: { texto } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "A simulação falhou.");
    } finally {
      setSimulando(false);
    }
  };

  return (
    <Bloco titulo="Testar" descricao="Escreva como um paciente escreveria. Nada é enviado.">
      <div className="flex gap-2">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && texto.trim() && void rodar()}
          placeholder="Oi, quanto custa a limpeza?"
        />
        <Button
          variant="premium"
          disabled={simulando || !texto.trim()}
          onClick={() => void rodar()}
        >
          {simulando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        </Button>
      </div>

      {saida && (
        <div className="mt-5">
          {saida.respondeu ? (
            <div className="grid gap-2">
              {saida.enviados.map((m, i) => (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl bg-gradient-primary px-4 py-2.5 text-sm text-white">
                    {m.texto}
                    <span className="mt-1 block text-2xs text-white/70">
                      após {(m.esperaMs / 1000).toFixed(1)}s digitando
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              Não respondeu — {saida.motivo}.
            </p>
          )}
        </div>
      )}
    </Bloco>
  );
}
