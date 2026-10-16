import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAtendimento } from "./useAtendimento";
import { Bloco, Chave } from "./campos";
import {
  gerarRelatorioDoOlho,
  getRelatoriosDoOlho,
  type RelatorioDoOlho,
} from "@/lib/agente-ia/olho.functions";

/**
 * O Olho de Deus: a semana da Luna somada, com o que mudar.
 *
 * ── Por que esta tela existe ────────────────────────────────────────────
 *
 * Porque `ai_agent_licoes` já tinha 117 lições em 16/10, cada uma com a
 * sugestão de mudança no manual — e ninguém lê 117 linhas. Agrupadas, 72 delas
 * diziam a MESMA coisa. O olho antigo não errava: faltava a soma.
 *
 * ── Por que o gargalo vem primeiro, e sozinho ───────────────────────────
 *
 * Porque a pergunta que esta tela responde é "se eu só puder mexer em uma
 * coisa esta semana, qual é?". Uma tela que abre com doze números e três
 * listas devolve a pergunta para quem perguntou.
 *
 * Os números ficam no fim, e ficam inteiros: é com eles que se confere o texto
 * de cima. Sem eles o relatório é opinião bem escrita.
 */
export function OlhoDeDeus() {
  const { config, gravar } = useAtendimento();
  const queryClient = useQueryClient();
  const buscar = useServerFn(getRelatoriosDoOlho);
  const gerar = useServerFn(gerarRelatorioDoOlho);
  const [aberto, setAberto] = useState<string | null>(null);

  const relatorios = useQuery({
    queryKey: ["olho-de-deus"],
    queryFn: () => buscar(),
    staleTime: 60_000,
  });

  const rodar = useMutation({
    mutationFn: () => gerar({ data: {} }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ["olho-de-deus"] });
      // O motivo é o que importa quando não gerou: um "pronto!" sobre um
      // relatório que não existe é pior que o erro.
      if (r.motivo) toast.message("O olho não gerou relatório", { description: r.motivo });
      else toast.success("Relatório da semana gerado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lista = relatorios.data ?? [];
  const atual = lista[0] ?? null;

  return (
    <Bloco
      titulo="Olho de Deus"
      descricao="Toda segunda ele lê a semana inteira da Luna — as conversas, as lições dela e os motivos de cada silêncio — e escreve o que mudar."
      acao={
        <Button
          type="button"
          variant="secondary"
          disabled={rodar.isPending}
          onClick={() => rodar.mutate()}
          className="shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${rodar.isPending ? "animate-spin" : ""}`} />
          {rodar.isPending ? "Lendo a semana…" : "Gerar agora"}
        </Button>
      }
    >
      <div className="grid gap-4">
        <Chave
          rotulo="Gerar o relatório toda segunda"
          dica="Desligado, ele só roda quando você clicar em Gerar agora. Cada rodada é uma leitura da semana inteira e custa uma chamada do modelo."
          ligada={config?.olhoLigado === true}
          onMudar={(v) => gravar({ olhoLigado: v })}
        />
        <Chave
          rotulo="Deixar ele buscar na internet"
          dica="Acrescenta uma seção de referência com boas práticas de fora, cada uma com a fonte. Depende de o modelo escolhido suportar busca; se não suportar, o relatório sai completo sem essa parte e diz o motivo."
          ligada={config?.olhoNaWeb === true}
          onMudar={(v) => gravar({ olhoNaWeb: v })}
        />
        <p className="text-xs text-muted-foreground">
          Ele usa o mesmo modelo da Luna
          {config?.modelo ? (
            <>
              {" "}
              (<span className="font-mono">{config.modelo}</span>)
            </>
          ) : null}
          . Para dar um modelo melhor só para ele, escolha em Chave da IA — ler a semana inteira e
          responder a um paciente são trabalhos diferentes.
        </p>
      </div>

      {relatorios.isPending ? (
        <p className="mt-6 text-sm text-muted-foreground">Carregando…</p>
      ) : !atual ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-5">
          <div className="flex items-start gap-3">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <div className="min-w-0 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Nenhum relatório ainda.</p>
              <p className="mt-1">
                Clique em <strong>Gerar agora</strong> para ele ler os últimos sete dias. Dá para
                fazer isso antes de ligar o automático — é justamente para ver como é.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <RelatorioNaTela r={atual} />
      )}

      {lista.length > 1 && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Semanas anteriores
          </p>
          <div className="mt-2 grid gap-1">
            {lista.slice(1).map((r) => (
              <div key={r.id}>
                <button
                  type="button"
                  onClick={() => setAberto(aberto === r.id ? null : r.id)}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-subtle"
                >
                  <span className="tabular-nums text-muted-foreground">
                    {diaMes(r.de)} a {diaMes(r.ate)}
                  </span>
                  <span className="ml-2">
                    {primeiraFrase(r.gargalo) || "(sem gargalo apontado)"}
                  </span>
                </button>
                {aberto === r.id && <RelatorioNaTela r={r} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </Bloco>
  );
}

function RelatorioNaTela({ r }: { r: RelatorioDoOlho }) {
  const n = r.numeros;

  return (
    <div className="mt-6 grid gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Semana de {diaMes(r.de)} a {diaMes(r.ate)} · confiança {r.confianca}
        </p>
        <button
          type="button"
          onClick={() => baixar(r)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          <Download className="h-3.5 w-3.5" />
          Baixar o relatório
        </button>
      </div>

      {/* O gargalo em destaque e sozinho: é a resposta da tela. */}
      {r.gargalo && (
        <div className="rounded-2xl bg-warning-soft p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-warning">
            O gargalo da semana
          </p>
          <p className="mt-1.5 text-sm leading-6">{r.gargalo}</p>
        </div>
      )}

      <Secao titulo="O que mudou desde a semana passada" texto={r.oQueMudou} />
      <Secao titulo="Como ela está conduzindo" texto={r.comoEstaConduzindo} />
      <Secao titulo="O que o sistema está impedindo" texto={r.oQueOSistemaImpede} />

      <Mudancas titulo="O que mudar no manual" itens={r.noManual} comSecao />
      <Mudancas titulo="O que mudar no sistema" itens={r.noSistema} />

      <Secao titulo="O que observar na semana que vem" texto={r.observarNaProxima} />

      {/* Os números por último, e inteiros: é com eles que se confere o resto. */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Os números, como foram contados
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero rotulo="Conversas" valor={n.conversas} />
          <Numero rotulo="Ela falou em" valor={n.conversasAtendidas} />
          <Numero rotulo="Ofereceu horário" valor={n.respostasComHorario} />
          <Numero rotulo="Citou preço" valor={n.respostasComPreco} />
          <Numero rotulo="Sem resposta" valor={n.mensagensIgnoradas} />
          <Numero rotulo="Assumidas por gente" valor={n.conversasAssumidas} />
          <Numero rotulo="Consultas criadas" valor={n.consultasCriadas} />
          <Numero
            rotulo="Consulta por conversa"
            valor={n.conversaoPorcento ?? undefined}
            sufixo="%"
          />
        </div>
      </div>

      <Contagens titulo="Por que ela não respondeu" itens={n.motivosDoSilencio} />
      <Contagens titulo="O que ela mesma sugeriu, por tema" itens={n.sugestoesPorTema} />

      {/* A referência de fora, no fim e rotulada. Ver o comentário em
          FORMATO_DAS_BOAS_PRATICAS: é hipótese para testar, não medição. */}
      {r.praticas.length > 0 && (
        <div className="rounded-2xl border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Referência: o que se faz fora daqui
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Isto não foi medido aqui. Onde contradisser os números acima, os números ganham.
          </p>
          <div className="mt-3 grid gap-3">
            {r.praticas.map((p, i) => (
              <div key={i} className="text-sm">
                <p className="font-medium">{p.pratica}</p>
                {p.oQueTestarAqui && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Como testar aqui: {p.oQueTestarAqui}
                  </p>
                )}
                <p className="mt-0.5 break-words text-xs text-muted-foreground">Fonte: {p.fonte}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {r.praticas.length === 0 && r.motivoSemPraticas && (
        <p className="text-xs text-muted-foreground">
          A busca na internet não rodou nesta semana: {r.motivoSemPraticas}
        </p>
      )}
    </div>
  );
}

function Secao({ titulo, texto }: { titulo: string; texto: string }) {
  if (!texto) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">{texto}</p>
    </div>
  );
}

const COR_DA_PRIORIDADE: Record<string, string> = {
  alta: "bg-destructive/10 text-destructive",
  media: "bg-warning-soft text-warning",
  baixa: "bg-muted text-muted-foreground",
};

function Mudancas({
  titulo,
  itens,
  comSecao,
}: {
  titulo: string;
  itens: { secao?: string; oQue: string; porque: string; prioridade: string }[];
  comSecao?: boolean;
}) {
  if (!itens.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <div className="mt-2 grid gap-2">
        {itens.map((m, i) => (
          <div key={i} className="rounded-xl border border-border p-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-3xs font-semibold uppercase ${
                  COR_DA_PRIORIDADE[m.prioridade] ?? COR_DA_PRIORIDADE.baixa
                }`}
              >
                {m.prioridade}
              </span>
              {comSecao && m.secao && (
                <span className="font-mono text-xs text-muted-foreground">§{m.secao}</span>
              )}
            </div>
            <p className="mt-1.5 leading-6">{m.oQue}</p>
            {m.porque && <p className="mt-1 text-xs text-muted-foreground">Porque: {m.porque}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  sufixo,
}: {
  rotulo: string;
  valor: number | undefined;
  sufixo?: string;
}) {
  return (
    <div className="rounded-xl bg-surface-subtle p-3">
      <p className="text-lg font-semibold tabular-nums">
        {valor === undefined ? "—" : `${valor}${sufixo ?? ""}`}
      </p>
      <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{rotulo}</p>
    </div>
  );
}

function Contagens({
  titulo,
  itens,
}: {
  titulo: string;
  itens: { rotulo: string; quantas: number }[] | undefined;
}) {
  if (!itens?.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <div className="mt-2 grid gap-1">
        {itens.map((i) => (
          <div key={i.rotulo} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">{i.rotulo}</span>
            <span className="shrink-0 font-semibold tabular-nums">{i.quantas}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Baixa o markdown que a função já montou.
 *
 * O arquivo NÃO é remontado aqui: ele vem pronto do servidor, onde os números
 * foram contados. Montar uma segunda versão no navegador daria dois documentos
 * para a mesma semana, e eles divergiriam no dia em que alguém mexesse num só.
 */
function baixar(r: RelatorioDoOlho) {
  try {
    const url = URL.createObjectURL(new Blob([r.markdown], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `olho-de-deus-${r.de}-a-${r.ate}.md`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    toast.error("Não deu para baixar aqui. Copie o texto da tela.");
  }
}

/** "2026-10-16" → "16/10". Sem `Date`: é rótulo de calendário, e `Date` traria
 *  fuso para uma data que já vem pronta. */
function diaMes(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}` : String(iso ?? "");
}

/** A primeira frase, para a lista de semanas anteriores caber numa linha. */
function primeiraFrase(texto: string): string {
  const t = String(texto ?? "").trim();
  if (!t) return "";
  const fim = t.search(/[.!?](\s|$)/);
  const frase = fim > 0 ? t.slice(0, fim + 1) : t;
  return frase.length > 120 ? `${frase.slice(0, 117)}…` : frase;
}
