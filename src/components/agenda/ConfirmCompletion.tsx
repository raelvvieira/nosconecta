import { useId, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatBRL, parseBRLInput } from "@/lib/finance/format";
import { addMonths } from "@/lib/date";
import { podeConcluir, ehCortesia, recusaDoValor } from "@/lib/agenda/valor-ao-concluir";
import {
  FORMAS,
  MAX_PARCELAS,
  MIN_PARCELAS,
  pedeParcelas,
  recusaDoPagamento,
  rotuloDoPagamento,
  type FormaDePagamento,
} from "@/lib/agenda/forma-de-pagamento";

/**
 * Confirmar que o atendimento aconteceu — sempre com o valor cobrado junto.
 *
 * Antes isso era escolher "Concluído" num select entre outros seis status, e o
 * valor que ia para a Meta era o *previsto*, digitado semanas antes a partir do
 * preço de catálogo. São duas coisas diferentes: o previsto é uma estimativa, o
 * cobrado é o que a pessoa pagou — e é o cobrado que faz sentido como valor de
 * conversão.
 *
 * ── O valor é obrigatório. Zero é um valor ────────────────────────────
 *
 * O que o botão apagado recusa é o campo EM BRANCO, que significa "ninguém
 * disse quanto foi". Zero digitado é uma resposta: não entrou receita.
 *
 * Entre 01/10 e 05/10 o zero também foi recusado, com o argumento de que um
 * zero esquecido é indistinguível de uma cortesia de verdade. O argumento é
 * bom e o conserto estava errado — porque não existia o terceiro estado. Quem
 * atendeu de cortesia precisava do botão aceso e digitou **R$ 1,00**. Foram
 * quatro em setembro (Erick, Sérgio Menezes, Patricia Raimundo, Nicolle), e o
 * resultado é pior do que o zero que se queria evitar: R$ 4,00 de receita
 * inventada, espalhada em quatro atendimentos, num lugar onde ninguém procura.
 *
 * Recusar o zero não impede o descuido — empurra o descuido para um número que
 * parece intencional.
 *
 * E zero não contamina nada a jusante: não vira recebimento
 * (`createAppointmentReceivable` sai em `amount > 0`) nem vira compra na Meta
 * (`valeComoCompra` recusa Purchase de valor zero). Por isso a frase embaixo do
 * campo diz, em voz alta, que zero é aceito — sem ela, quem tem cortesia
 * desconfia e digita R$ 1,00 de novo.
 *
 * O botão fica desabilitado até o valor ser válido — e não só recusa no clique.
 * Botão que parece clicável e reclama depois ensina a tentar de novo; botão
 * apagado com a razão embaixo ensina o que falta.
 *
 * A trava de verdade é no servidor (`assertValorAoConcluir`): esta tela some
 * num app desatualizado, e a regra não pode sumir com ela.
 */
/** Prazos oferecidos para o retorno, em meses. `null` = data escolhida à mão. */
const PRAZOS: { label: string; meses: number | null }[] = [
  { label: "1 mês", meses: 1 },
  { label: "3 meses", meses: 3 },
  { label: "6 meses", meses: 6 },
  { label: "12 meses", meses: 12 },
  { label: "Outra data", meses: null },
];

export interface ConfirmacaoAtendimento {
  valor: number;
  /** Data do retorno em "YYYY-MM-DD", ou null quando não haverá retorno. */
  retornoEm: string | null;
  /** Gerar o recebimento no financeiro com o valor cobrado. */
  gerarCobranca: boolean;
  /**
   * O valor já entrou no caixa, na data do atendimento.
   *
   * Vem marcado: confirmar um atendimento é registrar que ele aconteceu e
   * foi pago. Desmarcado, o recebimento nasce em aberto — o caso do plano de
   * tratamento que será pago depois.
   */
  pagamentoRecebido: boolean;
  /**
   * Como foi pago. `null` quando ninguém informou — e isso é um estado
   * legítimo, não um campo esquecido: cortesia não teve pagamento, e
   * atendimento antigo sendo regularizado pode não ter mais a informação.
   */
  forma: FormaDePagamento | null;
  /** Em quantas vezes, quando foi cartão parcelado. */
  parcelas: number | null;
}

export function ConfirmCompletion({
  expectedRevenue,
  actualRevenue,
  appointmentDate,
  generateFinancial = true,
  isPending,
  onConfirm,
}: {
  expectedRevenue: number;
  /** Já confirmado: mostra o valor em vez da pergunta. */
  actualRevenue?: number | null;
  /** Data do atendimento, base para calcular o prazo do retorno. */
  appointmentDate: string;
  /** Preferência salva no agendamento; o interruptor começa por ela. */
  generateFinancial?: boolean;
  isPending?: boolean;
  onConfirm: (dados: ConfirmacaoAtendimento) => void;
}) {
  // id próprio: o mesmo bloco pode aparecer no formulário e na gaveta do
  // celular, e um id fixo faria o rótulo apontar para o campo errado.
  const campoId = useId();
  const [abrindo, setAbrindo] = useState(false);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // Segundo passo: o retorno. Só aparece depois que o valor está válido, para
  // não pedir duas decisões de uma vez — e porque o profissional só sabe se o
  // paciente precisa voltar depois de ter atendido.
  const [valorConfirmado, setValorConfirmado] = useState<number | null>(null);
  const [dataManual, setDataManual] = useState("");

  // O interruptor de cobrança morava no formulário de agendamento, semanas
  // antes de haver valor nenhum. A decisão é aqui: só depois de atender é que
  // se sabe se aquilo vira recebimento, e com qual valor.
  const [gerarCobranca, setGerarCobranca] = useState(generateFinancial);

  // Ligado por padrão, e é o ponto do pedido: o recebimento nascia pendente e
  // aparecia VERMELHO como "Atrasado" no mesmo minuto em que alguém registrou
  // que o atendimento foi pago — porque "atrasado" é derivado de pendente +
  // vencido, e o atendimento costuma ser de ontem.
  const [pagamentoRecebido, setPagamentoRecebido] = useState(true);

  // Como foi pago. Começa sem nada escolhido de propósito: um padrão aqui
  // seria gravado sem ninguém decidir, e "pix" chutado em cem atendimentos é
  // pior que cem atendimentos sem forma — o chute não se distingue da verdade
  // quando alguém for cruzar com o extrato da Stone.
  const [forma, setForma] = useState<FormaDePagamento | null>(null);
  const [parcelas, setParcelas] = useState<number | null>(null);

  if (actualRevenue !== null && actualRevenue !== undefined) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-success-soft px-3 py-2.5">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" strokeWidth={2} />
        <p className="text-sm text-foreground-secondary">
          Atendimento realizado · <span className="font-semibold">{formatBRL(actualRevenue)}</span>
        </p>
      </div>
    );
  }

  const confirmar = () => {
    // A MESMA função do botão e do servidor. Em 05/10 o botão passou a aceitar
    // zero e este clique continuou recusando: o botão acendia, a pessoa
    // clicava e lia "o valor precisa ser maior que zero". Duas regras para a
    // mesma pergunta, escritas em lugares diferentes, é como isso acontece.
    const n = parseBRLInput(valor);
    const recusa = recusaDoValor(Number.isNaN(n) ? null : n);
    if (recusa) {
      setErro(recusa.mensagem);
      return;
    }
    const pago = recusaDoPagamento(forma, parcelas);
    if (pago) {
      setErro(pago.mensagem);
      return;
    }
    setErro(null);
    setValorConfirmado(n);
  };

  // Passo do retorno: o valor já passou, falta decidir se o paciente volta.
  if (valorConfirmado !== null) {
    const confirmarCom = (retornoEm: string | null) =>
      onConfirm({
        valor: valorConfirmado,
        retornoEm,
        gerarCobranca,
        pagamentoRecebido,
        forma,
        parcelas,
      });
    return (
      <div className="space-y-2.5 rounded-xl border border-coral/30 bg-coral-soft px-3 py-3">
        <p className="text-sm font-medium text-foreground">
          Atendimento de {formatBRL(valorConfirmado)}
          {rotuloDoPagamento(forma, parcelas) && ` · ${rotuloDoPagamento(forma, parcelas)}`} ·
          deixar retorno pré-agendado?
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PRAZOS.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="outline"
              disabled={isPending}
              className="h-10 rounded-xl bg-white px-3 text-xs"
              onClick={() => {
                if (p.meses === null) {
                  // "Outra data": revela o campo em vez de confirmar já.
                  setDataManual(addMonths(appointmentDate, 1));
                  return;
                }
                confirmarCom(addMonths(appointmentDate, p.meses));
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>

        {dataManual && (
          <Input
            type="date"
            value={dataManual}
            min={appointmentDate}
            onChange={(e) => setDataManual(e.target.value)}
            className="rounded-xl border-border bg-white"
          />
        )}

        <div className="flex gap-2 pt-0.5">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            className="h-10 flex-1 rounded-xl bg-white"
            onClick={() => confirmarCom(null)}
          >
            Sem retorno
          </Button>
          {dataManual && (
            <Button
              type="button"
              variant="premium"
              disabled={isPending}
              className="h-10 flex-1 rounded-xl"
              onClick={() => confirmarCom(dataManual)}
            >
              {isPending ? "Salvando..." : "Agendar retorno"}
            </Button>
          )}
        </div>
        <p className="text-2xs leading-4 text-muted-foreground">
          O retorno fica marcado na agenda, mas o paciente não recebe confirmação agora — só os
          lembretes na véspera.
        </p>
      </div>
    );
  }

  if (!abrindo) {
    return (
      <div className="rounded-xl border border-coral/30 bg-coral-soft px-3 py-3">
        <p className="text-sm font-medium text-foreground">Este atendimento já aconteceu?</p>
        <p className="mt-0.5 text-2xs leading-4 text-muted-foreground">
          Confirmar registra o valor cobrado e envia a conversão.
        </p>
        <Button
          type="button"
          variant="premium"
          className="mt-2.5 h-10 w-full rounded-xl"
          onClick={() => {
            // Pré-preenche com o previsto: na maioria das vezes é o valor certo,
            // e quando não é, corrigir um número já digitado é mais rápido que
            // digitar do zero.
            setValor(expectedRevenue ? String(expectedRevenue).replace(".", ",") : "");
            setAbrindo(true);
          }}
        >
          Confirmar atendimento realizado
        </Button>
      </div>
    );
  }

  // Para o rótulo do interruptor E para habilitar o botão. A validação com as
  // mensagens continua em `confirmar`, e a do servidor é a que garante.
  const lido = parseBRLInput(valor);
  const valorDigitado = Number.isNaN(lido) ? null : lido;
  // A MESMA função do servidor (`valor-ao-concluir.ts`). Reimplementar "o que
  // vale" aqui é como as duas pontas divergem: a tela aceita, o servidor
  // recusa, e a pessoa vê um erro depois de um botão que estava aceso.
  const podeConfirmar = podeConcluir(valorDigitado);

  return (
    <div className="space-y-2 rounded-xl border border-coral/30 bg-coral-soft px-3 py-3">
      <Label htmlFor={campoId} className="text-sm text-foreground-secondary">
        Valor cobrado no atendimento *
      </Label>
      <Input
        id={campoId}
        data-valor-cobrado=""
        inputMode="decimal"
        placeholder="R$ 0,00"
        value={valor}
        autoFocus
        onChange={(e) => {
          setValor(e.target.value);
          if (erro) setErro(null);
        }}
        className="rounded-xl border-border bg-white"
      />
      {erro ? (
        <p className="text-2xs text-danger">{erro}</p>
      ) : ehCortesia(valorDigitado) ? (
        // Zero é uma resposta válida, e dizer isso em voz alta importa: sem a
        // frase, quem atendeu de cortesia desconfia do zero e digita R$ 1,00.
        <p className="text-2xs text-muted-foreground">
          Sem receita neste atendimento. Não vai gerar recebimento.
        </p>
      ) : podeConfirmar ? (
        <p className="text-2xs text-muted-foreground">Previsto era {formatBRL(expectedRevenue)}</p>
      ) : (
        // A razão embaixo do campo, e não só no clique: é o que explica o botão
        // apagado sem obrigar a pessoa a tentar para descobrir.
        <p className="text-2xs text-muted-foreground">
          Previsto era {formatBRL(expectedRevenue)}. Informe quanto foi pago — digite 0 se não
          entrou receita.
        </p>
      )}

      {/* ── Como foi pago ──────────────────────────────────────────────
          Fica depois do valor e antes da cobrança, que é a ordem da conversa
          no balcão: quanto foi, como pagou, e só então o que fazer com isso.

          Não aparece para cortesia: não houve pagamento, e oferecer "Pix ou
          cartão?" para um atendimento de R$ 0,00 é pedir uma resposta que não
          existe.

          É opcional, e por isso não tem asterisco nem bloqueia o botão. Quem
          não souber segue em frente, e a linha fica sem forma — que é
          verdade, e é melhor do que um "pix" chutado que ninguém consegue
          distinguir do verdadeiro quando for cruzar com o extrato. */}
      {!ehCortesia(valorDigitado) && (
        <div className="space-y-2 rounded-xl bg-white px-3 py-2.5">
          <p className="text-sm text-foreground-secondary">Como foi pago?</p>
          <div className="flex flex-wrap gap-1.5">
            {FORMAS.map((f) => (
              <button
                key={f.valor}
                type="button"
                onClick={() => {
                  // Clicar de novo na mesma desmarca: é o único jeito de
                  // voltar a "não informado" depois de ter clicado por engano.
                  const mesma = forma === f.valor;
                  setForma(mesma ? null : f.valor);
                  if (mesma || !f.pedeParcelas) setParcelas(null);
                  if (erro) setErro(null);
                }}
                aria-pressed={forma === f.valor}
                className={
                  forma === f.valor
                    ? "h-9 rounded-xl border border-coral bg-coral-soft px-3 text-xs font-medium text-foreground"
                    : "h-9 rounded-xl border border-border px-3 text-xs text-foreground-secondary hover:bg-muted/50"
                }
              >
                {f.rotulo}
              </button>
            ))}
          </div>

          {pedeParcelas(forma) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-xs text-muted-foreground">Em quantas vezes?</span>
              {Array.from(
                { length: MAX_PARCELAS - MIN_PARCELAS + 1 },
                (_, i) => i + MIN_PARCELAS,
              ).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setParcelas(n);
                    if (erro) setErro(null);
                  }}
                  aria-pressed={parcelas === n}
                  className={
                    parcelas === n
                      ? "h-8 w-9 rounded-lg border border-coral bg-coral-soft text-xs font-medium tabular-nums text-foreground"
                      : "h-8 w-9 rounded-lg border border-border text-xs tabular-nums text-foreground-secondary hover:bg-muted/50"
                  }
                >
                  {n}x
                </button>
              ))}
            </div>
          )}

          {/* A taxa da maquininha e a antecipação ainda não são descontadas em
              lugar nenhum. Dizer isso aqui evita que alguém leia o valor
              gravado como se fosse o que caiu na conta. */}
          {forma === "cartao_parcelado" && parcelas !== null && (
            <p className="text-2xs text-muted-foreground">
              O valor gravado é o cobrado da paciente. A taxa do cartão e a antecipação ainda não
              são descontadas.
            </p>
          )}
        </div>
      )}

      {/* Rótulo com o valor dentro: "gerar cobrança" é abstrato, "gerar
          recebimento de R$ 320,00" é a coisa que vai aparecer no financeiro. */}
      <label className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
        <span className="text-sm text-foreground-secondary">
          {ehCortesia(valorDigitado)
            ? "Gerar recebimento (nada a receber)"
            : `Gerar recebimento${valorDigitado !== null ? ` de ${formatBRL(valorDigitado)}` : ""}`}
        </span>
        <Switch checked={gerarCobranca} onCheckedChange={setGerarCobranca} />
      </label>

      {/* Aninhado, e não solto ao lado: dois interruptores lado a lado
          convidariam à combinação sem sentido "não gerar recebimento, mas
          pagamento recebido".

          O texto de apoio muda porque é ele que explica a consequência — o
          mesmo par que o funil já usa em ConfirmarGanho, para quem aprendeu
          num lugar reconhecer no outro. */}
      {gerarCobranca && (
        <label className="flex items-start justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
          <span className="min-w-0 text-sm text-foreground-secondary">
            Pagamento já recebido
            <span className="mt-0.5 block text-2xs leading-4 text-muted-foreground">
              {pagamentoRecebido
                ? `Entra como receita em ${appointmentDate.split("-").reverse().join("/")}.`
                : "Fica como cobrança em aberto, a receber."}
            </span>
          </span>
          <Switch
            data-pagamento-recebido=""
            checked={pagamentoRecebido}
            onCheckedChange={setPagamentoRecebido}
          />
        </label>
      )}

      <div className="flex gap-2 pt-0.5">
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1 rounded-xl bg-white"
          onClick={() => {
            setAbrindo(false);
            setErro(null);
          }}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="premium"
          className="h-10 flex-1 rounded-xl"
          disabled={isPending || !podeConfirmar}
          onClick={confirmar}
        >
          {isPending ? "Confirmando..." : "Confirmar e enviar"}
        </Button>
      </div>
    </div>
  );
}
