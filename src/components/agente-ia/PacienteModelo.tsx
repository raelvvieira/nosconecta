import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { localDateStr } from "@/lib/date";
import { useAtendimento } from "./useAtendimento";
import { Bloco } from "./campos";

/**
 * A edição de paciente modelo que está aberta — ou não.
 *
 * ── Por que esta tela existe ────────────────────────────────────────────
 *
 * As duas colunas (`paciente_modelo_ate` e `paciente_modelo_texto`) já eram
 * lidas pela instrução da Luna desde que a seção de paciente modelo nasceu, e
 * não apareciam em lugar nenhum do sistema. O resultado, medido em 07/10/2026:
 * a data estava NULA enquanto a campanha de pacientes modelos rodava — então a
 * Luna recebia "NÃO há edição aberta, não ofereça, não cite valores" e recusava
 * justamente o que o anúncio estava vendendo. Ninguém tinha como ver nem mudar.
 *
 * ── Por que a data vem antes do texto ──────────────────────────────────
 *
 * Porque é ela que liga e desliga. A seção só entra na instrução quando a data
 * está no futuro E há texto; faltando um dos dois, a oferta fecha. Essa é a
 * razão de a tela dizer, em letra grande, se hoje a Luna está oferecendo ou não
 * — é a única informação da Luna que vence sozinha, e vencer calada foi o
 * defeito.
 */
export function PacienteModelo() {
  const { config, gravar } = useAtendimento();
  const [ate, setAte] = useState("");
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  const ateDoServidor = config?.pacienteModeloAte ?? "";
  const textoDoServidor = config?.pacienteModeloTexto ?? "";
  useEffect(() => setAte(ateDoServidor), [ateDoServidor]);
  useEffect(() => setTexto(textoDoServidor), [textoDoServidor]);

  const mudou = ate !== ateDoServidor || texto !== textoDoServidor;

  // O MESMO critério de `secaoDePacienteModelo`, e por isso a comparação é de
  // string: as duas datas são "AAAA-MM-DD", formato em que ordem alfabética e
  // ordem de calendário são a mesma coisa. Passar por `Date` traria fuso para
  // uma conta de calendário — e o último dia da edição ainda conta como aberto.
  const hoje = localDateStr();
  const aberta = Boolean(ateDoServidor && ateDoServidor >= hoje && textoDoServidor.trim());
  const venceu = Boolean(ateDoServidor && ateDoServidor < hoje);

  return (
    <Bloco
      titulo="Vaga de paciente modelo"
      descricao="A edição da mentoria que a Luna pode oferecer. Fora dela, ela não cita valor nenhum."
      acao={
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            aberta ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          {aberta ? "Oferecendo hoje" : "Não está oferecendo"}
        </span>
      }
    >
      <div className="flex items-start gap-2">
        <CalendarClock
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          {aberta ? (
            <>
              A Luna está oferecendo a vaga e pode citar os valores do texto abaixo.{" "}
              <strong>Depois do último dia ela para sozinha</strong> — você não precisa voltar aqui
              para desligar.
            </>
          ) : venceu ? (
            <>
              A última edição terminou e a Luna <strong>não</strong> oferece mais a vaga nem cita os
              valores. Para abrir a próxima, troque a data e revise o texto.
            </>
          ) : (
            <>
              Sem data e sem texto, a Luna responde que vai confirmar quando abre a próxima e passa
              a conversa para uma pessoa. Preencha os dois para ela voltar a oferecer.
            </>
          )}
        </p>
      </div>

      <div className="mt-4 grid gap-4">
        <div>
          <label htmlFor="pm-ate" className="text-sm font-medium">
            Último dia da edição
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            O último dia da mentoria. Até ele a Luna oferece; no dia seguinte, para.
          </p>
          <Input
            id="pm-ate"
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="mt-2 w-44"
          />
        </div>

        <div>
          <label htmlFor="pm-texto" className="text-sm font-medium">
            O que a Luna pode dizer
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cidade, dias, valores e como funciona a reserva. Estes valores são só da mentoria — a
            lista de preços da clínica continua valendo para todo mundo, e a Luna sabe separar as
            duas.
          </p>
          <Textarea
            id="pm-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={14}
            spellCheck={false}
            placeholder="Onde é, em que dias, os valores desta edição e como se reserva a vaga."
            className="mt-2 resize-y rounded-xl border-border font-mono text-xs leading-5"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant="premium"
          disabled={!mudou || salvando}
          onClick={async () => {
            setSalvando(true);
            await gravar({ pacienteModeloAte: ate, pacienteModeloTexto: texto });
            setSalvando(false);
          }}
        >
          {salvando ? "Salvando…" : "Salvar edição"}
        </Button>
        {mudou && (
          <button
            type="button"
            onClick={() => {
              setAte(ateDoServidor);
              setTexto(textoDoServidor);
            }}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Descartar mudanças
          </button>
        )}
      </div>
    </Bloco>
  );
}
