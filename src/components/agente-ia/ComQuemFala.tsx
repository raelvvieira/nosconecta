import { useAtendimento } from "./useAtendimento";
import { Bloco, Campo, Chave } from "./campos";

/**
 * Quem a IA pode atender sozinha.
 *
 * É a pergunta mais importante desta tela, e por isso vem antes do ritmo:
 * ritmo errado soa estranho, destinatário errado é a IA falando com um
 * paciente em tratamento como se ele fosse um lead de anúncio.
 */
export function ComQuemFala() {
  const { config, gravar } = useAtendimento();

  return (
    <Bloco
      titulo="Com quem ela fala"
      descricao="Quem ficar de fora continua sendo atendido por uma pessoa, como hoje."
    >
      <div className="grid gap-4">
        <Chave
          rotulo="Só quem ainda não é paciente"
          dica="Quem já tem ficha tem tratamento em andamento e combinado com a recepção."
          ligada={config?.soParaNaoPaciente ?? true}
          onMudar={(v) => void gravar({ soParaNaoPaciente: v })}
        />
        <Chave
          rotulo="Só quem chegou agora"
          dica="Lead antigo já trocou mensagem com alguém daqui."
          ligada={config?.soParaConversaNova ?? true}
          onMudar={(v) => void gravar({ soParaConversaNova: v })}
        />

        {config?.soParaConversaNova !== false && (
          <Campo
            rotulo="Ainda conta como novo por"
            sufixo="dias"
            valor={config?.novoAteDias ?? 7}
            dica="Contado da primeira mensagem da pessoa, em qualquer conversa dela."
            onSalvar={(v) => void gravar({ novoAteDias: v })}
          />
        )}

        {config?.soParaNaoPaciente === false && (
          <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm">
            Ela vai responder também quem já é paciente da clínica.
          </p>
        )}
      </div>
    </Bloco>
  );
}
