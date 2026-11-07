import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAtendimento } from "./useAtendimento";
import { Bloco } from "./campos";
import { useNomeDaAssistente } from "@/components/agente-ia/useNomeDaAssistente";
import {
  problemasDeVariaveis,
  VARIAVEIS_DA_INSTRUCAO,
} from "../../../supabase/functions/_shared/variaveis-da-instrucao.ts";

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
  const luna = useNomeDaAssistente();
  const { config, gravar } = useAtendimento();
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);

  // O texto do servidor manda enquanto ninguém digitou. Sem isto, abrir a tela
  // antes da resposta deixaria o campo vazio para sempre — e um campo vazio num
  // editor de manual convida a salvar por cima do manual.
  const doServidor = config?.instrucaoBase ?? "";
  useEffect(() => setRascunho(doServidor), [doServidor]);

  const mudou = rascunho !== doServidor;
  const problemas = problemasDeVariaveis(rascunho);
  const temProblema = problemas.desconhecidas.length > 0 || problemas.chavesSoltas;
  const linhas = rascunho.trim() ? rascunho.trim().split("\n").length : 0;

  return (
    <Bloco
      titulo={`O manual da ${luna}`}
      descricao="Como ela conduz a conversa: é este texto que vira a instrução dela. Preços, horários e a vaga de paciente modelo não vêm daqui — o sistema anexa do catálogo e da agenda."
      acao={
        <span className="shrink-0 text-xs text-muted-foreground">
          {linhas ? `${linhas} linhas` : "vazio"}
        </span>
      }
    >
      <Textarea
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        rows={18}
        spellCheck={false}
        placeholder={`Escreva como a ${luna} deve conduzir a conversa: quem ela é, o tom, as etapas, o que ela nunca faz.`}
        className="mt-4 resize-y rounded-xl border-border font-mono text-xs leading-5"
      />

      {temProblema && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-warning/40 bg-warning-soft px-3.5 py-2.5 text-xs leading-5 text-warning"
        >
          {problemas.desconhecidas.length > 0 && (
            <p>
              Variável que o sistema não conhece:{" "}
              <strong>{problemas.desconhecidas.map((v) => `{{${v}}}`).join(", ")}</strong>. Na hora
              de responder ela some, e a frase fica furada.
            </p>
          )}
          {problemas.chavesSoltas && (
            <p>
              Há chaves <strong>{"{{"}</strong> ou <strong>{"}}"}</strong> sem par no texto.
            </p>
          )}
          <p className="mt-1 text-muted-foreground">
            As variáveis que existem: {VARIAVEIS_DA_INSTRUCAO.map((v) => `{{${v}}}`).join(", ")}.
          </p>
        </div>
      )}

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
