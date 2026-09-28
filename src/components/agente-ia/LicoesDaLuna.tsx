import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarLicoesDaLuna, type LicaoDaLuna } from "@/lib/agente-ia/agente.functions";
import { Bloco } from "./campos";
import { dataPorExtenso } from "@/lib/date";

/**
 * O que a Luna aprendeu com o desfecho das conversas.
 *
 * ── Por que isto é uma tela, e não só um prompt ──────────────────────────
 *
 * Porque quem muda o manual é uma pessoa. A lição existe para ser lida, conferida
 * e discordada: se a Luna conclui "ela parou no preço" e a conversa mostra outra
 * coisa, isso tem de ficar visível — senão a próxima versão do manual nasce de
 * uma leitura que ninguém viu.
 *
 * Ela NUNCA reescreve o manual sozinha. Seria a IA editando a própria instrução
 * a partir da avaliação que ela fez de si mesma.
 */
export function LicoesDaLuna() {
  const listar = useServerFn(listarLicoesDaLuna);
  const { data } = useQuery({ queryKey: ["licoes-da-luna"], queryFn: () => listar() });

  const total = (data?.fechou ?? 0) + (data?.naoFechou ?? 0);

  return (
    <Bloco
      titulo="O que ela aprendeu com o resultado"
      descricao="Cada conversa encerrada rende uma lição: o que funcionou, o que faltou e o que mudar no manual."
    >
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma conversa encerrada ainda. A primeira lição aparece aqui depois que ela conduzir
          uma conversa até o fim.
        </p>
      ) : (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <Numero valor={data?.fechou ?? 0} rotulo="fechou sozinha" bom />
            <Numero valor={data?.naoFechou ?? 0} rotulo="não fechou" />
          </div>

          {!!data?.motivos.length && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Por que não fechou</p>
              <ul className="mt-2 grid gap-1">
                {data.motivos.map((m) => (
                  <li key={m.motivo} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{m.motivo}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{m.quantas}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3">
            {data?.licoes.map((l) => (
              <Licao key={l.id} licao={l} />
            ))}
          </div>
        </div>
      )}
    </Bloco>
  );
}

function Numero({ valor, rotulo, bom }: { valor: number; rotulo: string; bom?: boolean }) {
  return (
    <div>
      <span
        className={`text-2xl font-semibold tabular-nums ${bom ? "text-success" : "text-foreground"}`}
      >
        {valor}
      </span>
      <span className="ml-1.5 text-sm text-muted-foreground">{rotulo}</span>
    </div>
  );
}

function Licao({ licao }: { licao: LicaoDaLuna }) {
  // Conversa curta não sustenta conclusão, e a própria Luna diz isso em
  // `confianca`. A lição continua na lista, mais apagada: esconder faria a
  // contagem acima não fechar com a lista.
  const fraca = licao.confianca === "baixa";

  return (
    <article className={`rounded-2xl border border-border/70 p-4 ${fraca ? "opacity-70" : ""}`}>
      <header className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            licao.fechou ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          {licao.fechou
            ? "Fechou sozinha"
            : licao.humanoAssumiu
              ? "Passou para alguém"
              : "Não fechou"}
        </span>
        <span className="text-sm font-medium">{licao.nome ?? "Sem nome"}</span>
        <span className="text-xs text-muted-foreground">
          {dataPorExtenso(licao.quando.slice(0, 10))} · {licao.mensagens} mensagens
        </span>
      </header>

      {licao.oQueFuncionou && (
        <p className="mt-2.5 text-sm">
          <span className="text-muted-foreground">Funcionou: </span>
          {licao.oQueFuncionou}
        </p>
      )}
      {licao.oQueFaltou && (
        <p className="mt-1.5 text-sm">
          <span className="text-muted-foreground">Faltou: </span>
          {licao.oQueFaltou}
        </p>
      )}
      {licao.sugestao && (
        <p className="mt-2.5 rounded-xl bg-muted/60 px-3 py-2 text-sm">{licao.sugestao}</p>
      )}
      {licao.momentoDecisivo && (
        <p className="mt-2 text-xs text-muted-foreground">{licao.momentoDecisivo}</p>
      )}
    </article>
  );
}
