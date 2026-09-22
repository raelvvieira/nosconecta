import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useAtendimento } from "./useAtendimento";
import { Bloco, BotaoDeModo } from "./campos";

/**
 * Frase fixa ou Inteligência.
 *
 * Eco existe para provar o contrato antes de envolver o modelo: vínculo,
 * entrega, autenticação, criação da mensagem. Com isso de pé, trocar a frase
 * fixa pela IA é a parte fácil — e nunca se depura contrato e prompt ao mesmo
 * tempo.
 */
export function ComoResponde() {
  const { config, gravar } = useAtendimento();
  const [eco, setEco] = useState("");

  useEffect(() => {
    if (config) setEco(config.mensagemEco);
  }, [config]);

  const modoIa = config?.modo === "ia";

  return (
    <Bloco titulo="Como ela responde" descricao="O que sai quando ela decide falar.">
      <div className="grid gap-2 sm:grid-cols-2">
        <BotaoDeModo
          ativo={!modoIa}
          titulo="Frase fixa"
          descricao="Sempre a mesma resposta. Prova o caminho sem gastar IA."
          onClick={() => void gravar({ modo: "eco" })}
        />
        <BotaoDeModo
          ativo={modoIa}
          titulo="Inteligência"
          descricao="Responde pelo que ela aprendeu."
          onClick={() => void gravar({ modo: "ia" })}
        />
      </div>

      {!modoIa && (
        <div className="mt-4">
          <label className="text-xs font-medium text-muted-foreground">A frase</label>
          <Input
            value={eco}
            onChange={(e) => setEco(e.target.value)}
            onBlur={() => eco !== config?.mensagemEco && void gravar({ mensagemEco: eco })}
            className="mt-1.5"
          />
        </div>
      )}
    </Bloco>
  );
}
