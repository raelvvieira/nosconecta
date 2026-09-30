import { useAtendimento } from "./useAtendimento";
import { Bloco, Campo, Chave } from "./campos";

/**
 * O follow-up: a Luna voltando em quem sumiu.
 *
 * ── Por que este bloco explica tanto ───────────────────────────────────
 *
 * É a única coisa da tela que faz a Luna escrever para alguém SEM ninguém ter
 * escrito para ela. Todo o resto é reação; isto é iniciativa.
 *
 * E tem uma regra que a clínica precisa entender antes de ligar, senão vai
 * achar que está quebrado: **ligar não acorda o passado.** Medido em 30/09,
 * existem 262 conversas de clareamento paradas entre 7 e 30 dias. Se ligar a
 * chave mandasse mensagem para todas, seriam 262 mensagens de uma vez, muitas
 * sobre uma conversa que a pessoa já esqueceu — e o que isso produz é bloqueio,
 * que derruba a reputação do número e leva embora também as conversas que
 * funcionavam.
 *
 * Então o texto abaixo diz isso em português, no lugar onde a decisão é
 * tomada. Explicação que mora na documentação não é lida por quem clica.
 */
export function VoltarEmQuemSumiu() {
  const { config, gravar } = useAtendimento();
  const ligado = config?.followupLigado === true;

  return (
    <Bloco
      titulo="Voltar em quem sumiu"
      descricao="A Luna manda uma mensagem quando a pessoa para de responder. Dois toques, e depois ela para."
    >
      <div className="grid gap-4">
        <Chave
          rotulo="Voltar em quem parou de responder"
          dica="Só em conversa que veio de anúncio, e só se ninguém da clínica tiver assumido."
          ligada={ligado}
          onMudar={(v) => void gravar({ followupLigado: v })}
        />

        {ligado && (
          <>
            <Campo
              rotulo="Primeiro toque depois de"
              sufixo="horas de silêncio"
              valor={config?.followupHoras1 ?? 20}
              onSalvar={(v) => void gravar({ followupHoras1: v })}
            />
            <Campo
              rotulo="Segundo toque depois de"
              sufixo="horas do primeiro"
              valor={config?.followupHoras2 ?? 72}
              dica="Conta do primeiro toque, não do silêncio — senão os dois sairiam quase juntos."
              onSalvar={(v) => void gravar({ followupHoras2: v })}
            />

            <p className="rounded-2xl bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">
                Ligar não mexe nas conversas que já estavam paradas.
              </span>{" "}
              A Luna só volta no que parar de agora em diante
              {config?.followupLigadoDesde && (
                <> (ligado em {quando(config.followupLigadoDesde)})</>
              )}
              . Se ligasse para trás, dezenas de pessoas receberiam mensagem ao mesmo tempo sobre
              conversas que já esqueceram, e isso vira bloqueio no WhatsApp. Recuperar conversa
              antiga é coisa para alguém olhar uma por uma.
            </p>

            <p className="text-xs leading-relaxed text-foreground-subtle">
              Ela não manda de madrugada: só entre 9h e 19h, em dia que a clínica atende. E o envio
              entra na mesma cota diária do número que os disparos usam.
            </p>
          </>
        )}
      </div>
    </Bloco>
  );
}

/** "30/09 às 21h". Sem segundos e sem ano: quem lê quer saber se foi hoje. */
function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "há pouco";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}
