import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAtendimento } from "./useAtendimento";
import { Bloco } from "./campos";

/**
 * O manual de condução da Luna, escrito pela clínica.
 *
 * ── Por que ele é editável aqui ─────────────────────────────────────────
 *
 * Porque senão ele não existe para quem usa o sistema. O texto está numa coluna
 * do banco, é ele que decide como a IA fala com paciente, e sem esta tela a
 * única forma de mudar uma vírgula seria pedir para alguém mexer no código — o
 * que transforma "corrigir uma frase que soou mal" em tarefa de programador.
 *
 * ── Por que é um campo de texto, e não um formulário ────────────────────
 *
 * Porque o manual é um documento. Fatiá-lo em trinta campos daria uma tela de
 * cadastro em que ninguém consegue LER o que está escrito de ponta a ponta, e
 * ler de ponta a ponta é o que se faz com um manual antes de confiar nele.
 *
 * ── O que esta tela não mostra ──────────────────────────────────────────
 *
 * Preços, horários, paciente modelo e as regras invioláveis. Elas não estão aqui
 * porque não são texto: o sistema anexa cada uma a partir do dado vivo, e
 * deixá-las editáveis junto criaria uma segunda verdade ao lado do catálogo e da
 * agenda. Para ver a instrução COMPLETA, do jeito que a Luna recebe, use a
 * prévia.
 */
export function ManualDaLuna() {
  const { config, gravar } = useAtendimento();
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);

  // O texto do servidor manda enquanto ninguém digitou. Sem isto, abrir a tela
  // antes da resposta deixaria o campo vazio para sempre — e um campo vazio num
  // editor de manual convida a salvar por cima do manual.
  const doServidor = config?.instrucaoBase ?? "";
  useEffect(() => setRascunho(doServidor), [doServidor]);

  const mudou = rascunho !== doServidor;
  const linhas = rascunho.trim() ? rascunho.trim().split("\n").length : 0;

  return (
    <Bloco
      titulo="O manual da Luna"
      descricao="Como ela conduz a conversa. É este texto que vira a instrução dela."
      acao={
        <span className="shrink-0 text-xs text-muted-foreground">
          {linhas ? `${linhas} linhas` : "vazio"}
        </span>
      }
    >
      <div className="flex items-start gap-2">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <p className="text-xs leading-5 text-muted-foreground">
          Preços, horários e a oferta de paciente modelo <strong>não</strong> vêm daqui: o sistema
          anexa cada um a partir do catálogo e da agenda. Escrever um preço neste texto criaria uma
          segunda tabela, que ninguém manteria igual.
        </p>
      </div>

      <Textarea
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        rows={18}
        spellCheck={false}
        placeholder="Escreva como a Luna deve conduzir a conversa: quem ela é, o tom, as etapas, o que ela nunca faz."
        className="mt-4 resize-y rounded-xl border-border font-mono text-xs leading-5"
      />

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant="premium"
          disabled={!mudou || salvando}
          onClick={async () => {
            setSalvando(true);
            await gravar({ instrucaoBase: rascunho });
            setSalvando(false);
          }}
        >
          {salvando ? "Salvando…" : "Salvar manual"}
        </Button>
        {mudou && (
          <button
            type="button"
            onClick={() => setRascunho(doServidor)}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Descartar mudanças
          </button>
        )}
      </div>
    </Bloco>
  );
}
