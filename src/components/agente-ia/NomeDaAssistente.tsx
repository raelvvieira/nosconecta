import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarConfiguracaoDoAgente } from "@/lib/agente-ia/agente.functions";
import { Bloco } from "./campos";

/**
 * Como a assistente se chama. É o nome que ela usa para se apresentar no
 * manual padrão e o que as telas mostram ("a Luna respondeu…"). Cada
 * consultório escolhe o seu; "Luna" é o padrão.
 */
export function NomeDaAssistente({ nome }: { nome: string }) {
  const salvar = useServerFn(salvarConfiguracaoDoAgente);
  const queryClient = useQueryClient();
  const [valor, setValor] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const atual = valor ?? nome;

  async function gravar() {
    setSalvando(true);
    try {
      await salvar({ data: { nome: atual } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agente-ia"] }),
        queryClient.invalidateQueries({ queryKey: ["nome-da-assistente"] }),
      ]);
      setValor(null);
      toast.success("Nome salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Bloco
      titulo="Nome da assistente"
      descricao="Como ela se apresenta e como o sistema fala dela."
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={atual}
          maxLength={40}
          onChange={(e) => setValor(e.target.value)}
          className="min-w-0 flex-1"
          aria-label="Nome da assistente"
        />
        <Button
          type="button"
          variant="premium"
          disabled={salvando || valor === null || !atual.trim() || atual.trim() === nome}
          onClick={() => void gravar()}
        >
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </Bloco>
  );
}
