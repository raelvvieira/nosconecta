import { useAtendimento } from "./useAtendimento";
import { Bloco, Campo, Chave } from "./campos";

/**
 * O ritmo da resposta.
 *
 * Não é enfeite: um agente que responde em 200 ms com oito parágrafos se
 * denuncia por melhor que seja o texto.
 */
export function Ritmo() {
  const { config, gravar } = useAtendimento();

  return (
    <Bloco
      titulo="Ritmo"
      descricao="O que faz parecer alguém digitando, e não um sistema respondendo."
    >
      <div className="grid gap-4">
        <Campo
          rotulo="Esperar antes de responder"
          sufixo="s"
          valor={config?.debounceSegundos ?? 5}
          dica="Deixa a pessoa terminar de escrever quando manda várias mensagens seguidas."
          onSalvar={(v) => void gravar({ debounceSegundos: v })}
        />
        <Chave
          rotulo="Quebrar respostas longas"
          dica="Em mensagens menores, como uma pessoa faria."
          ligada={config?.segmentar ?? true}
          onMudar={(v) => void gravar({ segmentar: v })}
        />
        {config?.segmentar && (
          <>
            <Campo
              rotulo="Máximo por mensagem"
              sufixo="caracteres"
              valor={config?.limite ?? 300}
              onSalvar={(v) => void gravar({ limite: v })}
            />
            <Campo
              rotulo="Mínimo por mensagem"
              sufixo="caracteres"
              valor={config?.minimo ?? 50}
              dica="Abaixo disso, o pedaço se junta ao anterior em vez de sair sozinho."
              onSalvar={(v) => void gravar({ minimo: v })}
            />
          </>
        )}
        <Campo
          rotulo="Tempo de digitação"
          sufixo="ms por caractere"
          valor={config?.msPorCaractere ?? 50}
          onSalvar={(v) => void gravar({ msPorCaractere: v })}
        />
      </div>
    </Bloco>
  );
}
