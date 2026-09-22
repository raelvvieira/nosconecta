import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getEstadoDoAgente } from "@/lib/agente-ia/agente.functions";
import { useAtendimento } from "./useAtendimento";
import { Bloco } from "./campos";
import { cn } from "@/lib/utils";

/**
 * A chave da API de IA da clínica.
 *
 * ── Por que ela é um bloco próprio, e sempre visível ────────────────────
 *
 * Ela morava dentro de "Como ele responde", e só aparecia no modo
 * Inteligência. Duas coisas quebravam por causa disso:
 *
 * A clínica em modo "Frase fixa" — que é o padrão — não tinha onde cadastrar
 * a chave. Para chegar ao campo era preciso primeiro trocar o modo, ou seja,
 * mexer no comportamento do agente só para digitar uma senha.
 *
 * E a chave não é só do agente. As **sugestões de fala no chat** usam a mesma
 * chave e funcionam com o agente desligado — então esconder o campo atrás do
 * modo escondia também o que faz o card verde aparecer na conversa.
 *
 * ── O cuidado que não muda ──────────────────────────────────────────────
 *
 * A chave nunca volta inteira para a tela. O que sobe do servidor é
 * `••••••••` com os quatro últimos, igual ao token da Meta. Escrever é
 * possível; ler de volta, não.
 */
export function ChaveDaIa() {
  const { config, gravar } = useAtendimento();
  const buscarEstado = useServerFn(getEstadoDoAgente);
  const estadoQuery = useQuery({ queryKey: ["agente-ia"], queryFn: () => buscarEstado() });

  // Nasce e morre no formulário: o servidor nunca devolve a chave, então não
  // há o que preencher aqui ao abrir a tela.
  const [chave, setChave] = useState("");
  const [salvando, setSalvando] = useState(false);

  const semChave = estadoQuery.data && !estadoQuery.data.temChave;
  const temPropria = !!config?.temChavePropria;

  return (
    <Bloco
      titulo="A chave da IA"
      descricao="É ela que faz a IA pensar — tanto o agente quanto as sugestões no chat."
      acao={
        temPropria ? (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {config?.chaveResumida}
          </span>
        ) : null
      }
    >
      <div className="flex items-center gap-2">
        <KeyRound className={cn("h-4 w-4 shrink-0", semChave ? "text-warning" : "text-success")} />
        <p className="text-sm">
          {semChave
            ? "Nenhuma chave configurada."
            : temPropria
              ? "Chave desta clínica em uso."
              : "Em uso a chave configurada no servidor."}
        </p>
      </div>

      {semChave && (
        <p className="mt-2 text-xs leading-5 text-warning">
          Sem ela, a IA não responde e as sugestões não aparecem no chat.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          type="password"
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          placeholder={temPropria ? "Trocar a chave" : "Cole a chave aqui"}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 font-mono"
        />
        <Button
          type="button"
          variant="premium"
          disabled={!chave.trim() || salvando}
          onClick={async () => {
            setSalvando(true);
            await gravar({ chaveDaIa: chave.trim() });
            // Some do campo assim que sai daqui: deixá-la na tela só aumenta a
            // chance de ela aparecer num print.
            setChave("");
            setSalvando(false);
          }}
        >
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      <p className="mt-2 text-2xs leading-4 text-muted-foreground">
        Fica guardada nesta clínica e nunca volta inteira para a tela — nem para quem a digitou.
      </p>

      {temPropria && (
        <button
          type="button"
          onClick={() => void gravar({ chaveDaIa: "" })}
          className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
        >
          Remover a chave desta clínica
        </button>
      )}
    </Bloco>
  );
}
