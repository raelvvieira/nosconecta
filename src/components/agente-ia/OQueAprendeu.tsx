import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getEstadoDoAgente,
  getInstrucaoDoAgente,
  salvarCorrecao,
} from "@/lib/agente-ia/agente.functions";
import {
  SECOES,
  foiCorrigido,
  textoDoCampo,
  type CampoDoManual,
  type EtapaDaConversa,
  type ManualDeVendas,
} from "@/lib/agente-ia/manual";
import { Bloco } from "./campos";

/**
 * O que a IA aprendeu lendo as conversas, e a correção de cada parte.
 *
 * ── A leitura vem antes da edição ──────────────────────────────────────
 *
 * Este bloco é lido muito mais vezes do que editado: alguém abre para conferir
 * se a IA entendeu o jeito da casa. Então o texto aprendido ocupa o lugar
 * principal, em coluna de medida confortável, e o que edita fica discreto ao
 * lado — presente, sem competir.
 *
 * Sem caixas empilhadas: dez cartões com borda viram uma grade que se lê como
 * formulário, e isto não é formulário, é um texto sobre como a clínica atende.
 * Os campos se separam por espaço e por um fio, que é o quanto basta.
 *
 * ── Correção nunca apaga o aprendido ───────────────────────────────────
 *
 * `salvarCorrecao` escreve só em `overrides`. O que a IA aprendeu continua
 * embaixo, intacto, e volta se a correção for apagada — por isso a marca
 * "Corrigido" importa: sem ela ninguém sabe mais o que é da IA e o que a
 * equipe escreveu.
 */
export function OQueAprendeu() {
  const queryClient = useQueryClient();
  const buscarEstado = useServerFn(getEstadoDoAgente);
  const buscarInstrucao = useServerFn(getInstrucaoDoAgente);
  const salvar = useServerFn(salvarCorrecao);

  const estadoQuery = useQuery({ queryKey: ["agente-ia"], queryFn: () => buscarEstado() });
  const estado = estadoQuery.data;

  const [editando, setEditando] = useState<CampoDoManual | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [verInstrucao, setVerInstrucao] = useState(false);

  const instrucaoQuery = useQuery({
    queryKey: ["agente-ia-instrucao"],
    queryFn: () => buscarInstrucao(),
    enabled: verInstrucao,
  });

  useEffect(() => {
    if (!editando || !estado) return;
    setRascunho(textoDoCampo(editando, estado.aprendido, estado.correcoes));
  }, [editando, estado]);

  const confirmar = async () => {
    if (!editando) return;
    setSalvando(true);
    try {
      await salvar({ data: { campo: editando, valor: rascunho } });
      await queryClient.invalidateQueries({ queryKey: ["agente-ia"] });
      await queryClient.invalidateQueries({ queryKey: ["agente-ia-instrucao"] });
      setEditando(null);
      toast.success("Correção salva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const fontes = Number(estado?.vendas ?? 0) + Number(estado?.conversas ?? 0);

  return (
    <Bloco
      titulo="O que ela aprendeu"
      descricao="O jeito desta clínica atender, tirado das conversas reais."
      acao={
        <Button variant="outline" size="sm" onClick={() => setVerInstrucao(true)}>
          Ver instrução
        </Button>
      }
    >
      {estadoQuery.isPending ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : fontes === 0 ? (
        <p className="max-w-[64ch] text-sm leading-7 text-muted-foreground">
          Ela ainda não leu nada. Use <strong>Aprender agora</strong>, ali em cima — ela vai ler as
          conversas do WhatsApp que tiveram troca dos dois lados, começando pelas de quem virou
          paciente, e escrever aqui o que encontrou.
        </p>
      ) : (
        /* Coluna de medida confortável: texto corrido em monitor largo passa
           dos 200 caracteres por linha e fica ilegível. */
        <div className="max-w-[70ch] divide-y divide-border">
          {SECOES.map(({ campo, titulo, pergunta }) => (
            <Secao
              key={campo}
              titulo={titulo}
              pergunta={pergunta}
              corrigido={estado ? foiCorrigido(campo, estado.correcoes) : false}
              onCorrigir={() => setEditando(campo)}
            >
              <Conteudo
                campo={campo}
                aprendido={estado?.aprendido ?? {}}
                correcoes={estado?.correcoes ?? {}}
              />
            </Secao>
          ))}
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{SECOES.find((s) => s.campo === editando)?.titulo}</DialogTitle>
            <DialogDescription>
              Sua correção fica por cima do que ela aprendeu e sobrevive às próximas leituras. O
              aprendido continua guardado embaixo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            rows={9}
            className="resize-none"
            placeholder="Escreva como a equipe realmente faz."
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button variant="premium" disabled={salvando} onClick={() => void confirmar()}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={verInstrucao} onOpenChange={setVerInstrucao}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-coral" />
              Instrução do agente
            </DialogTitle>
            <DialogDescription>
              O texto exato que ele recebe. As regras de segurança do fim não são editáveis.
            </DialogDescription>
          </DialogHeader>
          {instrucaoQuery.isPending ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-muted p-4 text-xs leading-5">
              {instrucaoQuery.data}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </Bloco>
  );
}

/** Uma parte do aprendizado. Sem moldura: separa por espaço e por um fio. */
function Secao({
  titulo,
  pergunta,
  corrigido,
  onCorrigir,
  children,
}: {
  titulo: string;
  pergunta: string;
  corrigido: boolean;
  onCorrigir: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="group py-7 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{titulo}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{pergunta}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Quem lê precisa saber o que é da IA e o que a equipe escreveu.
              Sem esta marca, uma correção some dentro do texto aprendido. */}
          {corrigido && (
            <span className="rounded-full bg-coral-soft px-2.5 py-0.5 text-2xs font-semibold text-coral">
              Corrigido
            </span>
          )}
          {/* Sempre visível, e não só no hover: hover não existe no celular, e
              esconder a única maneira de corrigir atrás dele tiraria a função
              de metade de quem usa. O que o hover faz é só realçar. */}
          <button
            type="button"
            onClick={onCorrigir}
            className="press grid h-8 w-8 place-items-center rounded-xl text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground group-hover:text-muted-foreground"
            aria-label={`Corrigir ${titulo}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * O texto do campo.
 *
 * As etapas ganham desenho próprio quando ainda são lista: elas são uma
 * SEQUÊNCIA, e lê-las numeradas é o que responde "em que altura a conversa
 * está". Achatadas em parágrafo viram uma lista de nomes sem ordem visível.
 *
 * Quando há correção humana, o campo vira texto puro — e aí cai no caminho
 * comum, que é o certo: a pessoa escreveu prosa, a prosa é mostrada.
 */
function Conteudo({
  campo,
  aprendido,
  correcoes,
}: {
  campo: CampoDoManual;
  aprendido: ManualDeVendas;
  correcoes: ManualDeVendas;
}) {
  const etapas = aprendido.etapas;
  const temCorrecao = typeof (correcoes as Record<string, unknown>)[campo] === "string";

  if (campo === "etapas" && !temCorrecao && Array.isArray(etapas) && etapas.length) {
    return (
      <ol className="space-y-3.5">
        {etapas
          .filter((e: EtapaDaConversa) => String(e?.nome ?? "").trim())
          .map((e: EtapaDaConversa, i: number) => (
            <li key={i} className="flex gap-3.5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium leading-6">{e.nome}</p>
                {String(e.sinais ?? "").trim() && (
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Reconhece por: {e.sinais}
                  </p>
                )}
                {String(e.proximo_passo ?? "").trim() && (
                  <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
                    Depois: {e.proximo_passo}
                  </p>
                )}
              </div>
            </li>
          ))}
      </ol>
    );
  }

  const texto = textoDoCampo(campo, aprendido, correcoes);
  if (!texto) {
    return <p className="text-[15px] leading-7 text-muted-foreground">Ainda não aprendido.</p>;
  }
  return <p className="whitespace-pre-wrap text-[15px] leading-7">{texto}</p>;
}
