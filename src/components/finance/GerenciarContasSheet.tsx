import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  ArrowLeft,
  Banknote,
  CreditCard,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
} from "@/lib/finance/accounts.functions";
import {
  archiveCard,
  createCard,
  deleteCard,
  listCards,
  updateCard,
  type CartaoDeCredito,
} from "@/lib/finance/cards.functions";
import { faturaDaCompra, janelaDaFatura } from "@/lib/finance/fatura";
import { localDateStr } from "@/lib/date";
import { useUnitSelection } from "@/lib/settings/unit-context";
import { cn } from "@/lib/utils";

/**
 * Contas e cartões.
 *
 * ── Por que esta tela não existia ────────────────────────────────────────
 *
 * O botão "Gerenciar contas" estava ali desde sempre, sem `onClick`. A única
 * forma de criar conta era digitar um nome no combobox de dentro do formulário
 * de pagamento, que cria tudo como "banco" — o tipo `credit` existia no
 * servidor e era inalcançável pela interface.
 *
 * ── Duas telas numa, e por quê ───────────────────────────────────────────
 *
 * Cartão pertence a uma conta, então cadastrá-lo em outro lugar obrigaria a
 * pessoa a lembrar de onde. Aqui a conta abre e mostra os cartões dela dentro,
 * atrás de um switch — que é como o próprio usuário descreveu o fluxo.
 */

type Aba = "lista" | "conta" | "cartao";

const ICONES: Record<string, { Icon: typeof Landmark; classe: string }> = {
  pix: { Icon: Zap, classe: "bg-success-soft text-success" },
  cash: { Icon: Banknote, classe: "bg-info-soft text-info" },
  credit: { Icon: CreditCard, classe: "bg-coral-soft text-coral" },
  bank: { Icon: Landmark, classe: "bg-muted text-muted-foreground" },
};

const TIPOS = [
  { valor: "bank", rotulo: "Conta bancária" },
  { valor: "cash", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "Pix" },
  { valor: "credit", rotulo: "Cartão de crédito" },
] as const;

export function GerenciarContasSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <ContasECartoes ativo={open} comCabecalho />
      </SheetContent>
    </Sheet>
  );
}

/**
 * O miolo, sem a casca.
 *
 * Existe separado porque o mesmo painel mora em dois lugares: o atalho da
 * Visão Geral (dentro de um Sheet) e a página de Configurações → Contas e
 * cartões, que é onde as pessoas procuram cadastro. Duas implementações
 * divergiriam no dia em que alguém acrescentasse um campo numa delas.
 */
export function ContasECartoes({
  ativo = true,
  comCabecalho = false,
}: {
  /** Só busca quando está à vista — o Sheet passa `open`. */
  ativo?: boolean;
  comCabecalho?: boolean;
}) {
  const open = ativo;
  const queryClient = useQueryClient();
  const { selectedUnitId } = useUnitSelection();

  const buscarContas = useServerFn(listAccounts);
  const buscarCartoes = useServerFn(listCards);

  const contas = useQuery({
    queryKey: ["accounts", selectedUnitId],
    queryFn: () => buscarContas({ data: { unitId: selectedUnitId ?? undefined } }),
    enabled: open,
  });
  const cartoes = useQuery({
    queryKey: ["credit-cards", selectedUnitId],
    queryFn: () => buscarCartoes({ data: { unitId: selectedUnitId ?? undefined } }),
    enabled: open,
  });

  const [aba, setAba] = useState<Aba>("lista");
  const [contaEmEdicao, setContaEmEdicao] = useState<string | null>(null);
  const [cartaoEmEdicao, setCartaoEmEdicao] = useState<CartaoDeCredito | null>(null);
  const [contaDoCartao, setContaDoCartao] = useState<string | null>(null);

  // Abrir de novo sempre começa na lista: voltar e encontrar um formulário
  // meio preenchido de dias atrás é desorientador.
  useEffect(() => {
    if (open) {
      setAba("lista");
      setContaEmEdicao(null);
      setCartaoEmEdicao(null);
    }
  }, [open]);

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["credit-cards"] });
    queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
    queryClient.invalidateQueries({ queryKey: ["payables-overview"] });
  };

  const lista = contas.data ?? [];
  const listaDeCartoes = cartoes.data ?? [];

  const titulo =
    aba === "lista"
      ? "Contas e cartões"
      : aba === "conta"
        ? contaEmEdicao
          ? "Editar conta"
          : "Nova conta"
        : cartaoEmEdicao
          ? "Editar cartão"
          : "Novo cartão";

  return (
    <div>
      {(comCabecalho || aba !== "lista") && (
        <div className="mb-6 flex items-center gap-2">
          {aba !== "lista" && (
            <button
              type="button"
              onClick={() => setAba("lista")}
              aria-label="Voltar"
              className="press -ml-1 grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h2 className="text-lg font-semibold">{titulo}</h2>
        </div>
      )}

      {aba === "lista" && (
        <ListaDeContas
          contas={lista}
          cartoes={listaDeCartoes}
          carregando={contas.isPending}
          onNovaConta={() => {
            setContaEmEdicao(null);
            setAba("conta");
          }}
          onEditarConta={(id) => {
            setContaEmEdicao(id);
            setAba("conta");
          }}
          onNovoCartao={(contaId) => {
            setContaDoCartao(contaId);
            setCartaoEmEdicao(null);
            setAba("cartao");
          }}
          onEditarCartao={(c) => {
            setContaDoCartao(c.accountId);
            setCartaoEmEdicao(c);
            setAba("cartao");
          }}
          onMudou={recarregar}
        />
      )}

      {aba === "conta" && (
        <FormularioDeConta
          conta={lista.find((c) => c.id === contaEmEdicao) ?? null}
          cartoesDaConta={listaDeCartoes.filter((c) => c.accountId === contaEmEdicao)}
          unitId={selectedUnitId}
          onNovoCartao={(contaId) => {
            setContaDoCartao(contaId);
            setCartaoEmEdicao(null);
            setAba("cartao");
          }}
          onEditarCartao={(c) => {
            setContaDoCartao(c.accountId);
            setCartaoEmEdicao(c);
            setAba("cartao");
          }}
          onSalvo={() => {
            recarregar();
            setAba("lista");
          }}
        />
      )}

      {aba === "cartao" && (
        <FormularioDeCartao
          cartao={cartaoEmEdicao}
          contas={lista}
          contaPadrao={contaDoCartao}
          unitId={selectedUnitId}
          onSalvo={() => {
            recarregar();
            setAba("lista");
          }}
        />
      )}
    </div>
  );
}

// ── A lista ────────────────────────────────────────────────────────────────

function ListaDeContas({
  contas,
  cartoes,
  carregando,
  onNovaConta,
  onEditarConta,
  onNovoCartao,
  onEditarCartao,
  onMudou,
}: {
  contas: { id: string; name: string; type: string; last_digits: string | null }[];
  cartoes: CartaoDeCredito[];
  carregando: boolean;
  onNovaConta: () => void;
  onEditarConta: (id: string) => void;
  onNovoCartao: (contaId: string) => void;
  onEditarCartao: (c: CartaoDeCredito) => void;
  onMudou: () => void;
}) {
  const excluirConta = useServerFn(deleteAccount);
  const remover = useMutation({
    mutationFn: (id: string) => excluirConta({ data: { id } }),
    onSuccess: () => {
      toast.success("Conta excluída");
      onMudou();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (carregando) {
    return <p className="px-1 text-sm text-muted-foreground">Carregando…</p>;
  }

  if (contas.length === 0) {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Nenhuma conta cadastrada ainda. A conta é de onde o dinheiro sai e para onde entra — e é
          ela que paga a fatura do cartão.
        </p>
        <Button onClick={onNovaConta} className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Criar a primeira conta
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {contas.map((conta) => {
        const { Icon, classe } = ICONES[conta.type] ?? ICONES.bank;
        const doCartao = cartoes.filter((c) => c.accountId === conta.id);
        return (
          <div key={conta.id} className="rounded-2xl border border-border p-3">
            <div className="flex items-center gap-3">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", classe)}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{conta.name}</p>
                {conta.last_digits && (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    •••• {conta.last_digits}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onEditarConta(conta.id)}
                aria-label={`Editar ${conta.name}`}
                className="press grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remover.mutate(conta.id)}
                disabled={remover.isPending}
                aria-label={`Excluir ${conta.name}`}
                className="press grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {doCartao.length > 0 && (
              <ul className="mt-3 grid gap-1.5 border-t border-border/60 pt-3">
                {doCartao.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onEditarCartao(c)}
                      className="press flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left hover:bg-muted"
                    >
                      <CreditCard className="h-3.5 w-3.5 shrink-0 text-coral" />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                        {c.name}
                        {c.lastDigits && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · ••{c.lastDigits}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-2xs text-muted-foreground">
                        fecha {c.closingDay} · vence {c.dueDay}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => onNovoCartao(conta.id)}
              className="press mt-2 flex items-center gap-1.5 rounded-xl px-1 py-1 text-xs font-medium text-coral hover:underline"
            >
              <Plus className="h-3 w-3" />
              Adicionar cartão
            </button>
          </div>
        );
      })}

      <Button variant="outline" onClick={onNovaConta} className="w-full">
        <Plus className="mr-2 h-4 w-4" />
        Nova conta
      </Button>
    </div>
  );
}

// ── Formulário de conta ────────────────────────────────────────────────────

function FormularioDeConta({
  conta,
  cartoesDaConta,
  unitId,
  onNovoCartao,
  onEditarCartao,
  onSalvo,
}: {
  conta: { id: string; name: string; type: string; last_digits: string | null } | null;
  cartoesDaConta: CartaoDeCredito[];
  unitId: string | null;
  onNovoCartao: (contaId: string) => void;
  onEditarCartao: (c: CartaoDeCredito) => void;
  onSalvo: () => void;
}) {
  const criar = useServerFn(createAccount);
  const atualizar = useServerFn(updateAccount);

  const [nome, setNome] = useState(conta?.name ?? "");
  const [tipo, setTipo] = useState(conta?.type ?? "bank");
  const [digitos, setDigitos] = useState(conta?.last_digits ?? "");
  // Começa ligado quando a conta já tem cartão — o estado da tela conta a
  // verdade do cadastro, não o contrário.
  const [temCartao, setTemCartao] = useState(cartoesDaConta.length > 0);

  const salvar = useMutation({
    mutationFn: async () => {
      if (conta) {
        return atualizar({
          data: { id: conta.id, name: nome, type: tipo as any, last_digits: digitos || null },
        });
      }
      return criar({
        data: {
          name: nome,
          type: tipo as any,
          last_digits: digitos || null,
          unitId: unitId ?? undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(conta ? "Conta atualizada" : "Conta criada");
      onSalvo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="conta-nome">Nome da conta *</Label>
        <Input
          id="conta-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nubank PJ"
          autoFocus
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="conta-tipo">Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger id="conta-tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t.valor} value={t.valor}>
                  {t.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="conta-digitos">Últimos 4 dígitos</Label>
          <Input
            id="conta-digitos"
            value={digitos}
            onChange={(e) => setDigitos(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="4417"
            inputMode="numeric"
          />
        </div>
      </div>

      {/* O switch que o usuário desenhou. Só aparece para conta que já existe:
          o cartão precisa de uma conta com id para apontar, e criar os dois no
          mesmo envio esconderia qual dos dois falhou quando algo desse errado. */}
      {conta && (
        <div className="grid gap-3 border-t border-border pt-5">
          <div className="flex items-center justify-between">
            <Label htmlFor="tem-cartao" className="font-normal">
              Esta conta tem cartão de crédito
            </Label>
            <Switch
              id="tem-cartao"
              checked={temCartao}
              onCheckedChange={setTemCartao}
              disabled={cartoesDaConta.length > 0}
            />
          </div>

          {temCartao && (
            <div className="grid gap-2 rounded-xl bg-muted/40 p-3">
              {cartoesDaConta.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onEditarCartao(c)}
                  className="press flex items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-white"
                >
                  <CreditCard className="h-3.5 w-3.5 shrink-0 text-coral" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{c.name}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground">
                    fecha {c.closingDay} · vence {c.dueDay}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => onNovoCartao(conta.id)}
                className="press flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-medium text-coral hover:underline"
              >
                <Plus className="h-3 w-3" />
                Adicionar cartão
              </button>
            </div>
          )}
        </div>
      )}

      <Button type="submit" disabled={salvar.isPending} className="w-full">
        {salvar.isPending ? "Salvando…" : conta ? "Salvar alterações" : "Criar conta"}
      </Button>
    </form>
  );
}

// ── Formulário de cartão ───────────────────────────────────────────────────

function FormularioDeCartao({
  cartao,
  contas,
  contaPadrao,
  unitId,
  onSalvo,
}: {
  cartao: CartaoDeCredito | null;
  contas: { id: string; name: string }[];
  contaPadrao: string | null;
  unitId: string | null;
  onSalvo: () => void;
}) {
  const criar = useServerFn(createCard);
  const atualizar = useServerFn(updateCard);
  const arquivar = useServerFn(archiveCard);
  const excluir = useServerFn(deleteCard);

  const [contaId, setContaId] = useState(cartao?.accountId ?? contaPadrao ?? "");
  const [nome, setNome] = useState(cartao?.name ?? "");
  const [digitos, setDigitos] = useState(cartao?.lastDigits ?? "");
  const [fechamento, setFechamento] = useState(String(cartao?.closingDay ?? ""));
  const [vencimento, setVencimento] = useState(String(cartao?.dueDay ?? ""));

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        accountId: contaId,
        name: nome,
        lastDigits: digitos || null,
        closingDay: Number(fechamento),
        dueDay: Number(vencimento),
      };
      if (cartao) return atualizar({ data: { id: cartao.id, ...payload } });
      return criar({ data: { ...payload, unitId: unitId ?? undefined } });
    },
    onSuccess: () => {
      toast.success(
        cartao
          ? "Cartão atualizado. Os dias novos valem para compras a partir de agora — as faturas já criadas mantêm as datas delas."
          : "Cartão criado",
      );
      onSalvo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acaoDeRemover = useMutation({
    mutationFn: async (modo: "arquivar" | "excluir") =>
      modo === "arquivar"
        ? arquivar({ data: { id: cartao!.id, arquivar: true } })
        : excluir({ data: { id: cartao!.id } }),
    onSuccess: () => {
      toast.success("Cartão removido dos lançamentos");
      onSalvo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="cartao-nome">Nome do cartão *</Label>
        <Input
          id="cartao-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nubank PJ"
          autoFocus
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cartao-conta">Conta que paga a fatura *</Label>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger id="cartao-conta">
              <SelectValue placeholder="Escolha a conta" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cartao-digitos">Últimos 4 dígitos</Label>
          <Input
            id="cartao-digitos"
            value={digitos}
            onChange={(e) => setDigitos(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="4417"
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cartao-fechamento">Fecha todo dia *</Label>
          <Input
            id="cartao-fechamento"
            value={fechamento}
            onChange={(e) => setFechamento(e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="25"
            inputMode="numeric"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cartao-vencimento">Vence todo dia *</Label>
          <Input
            id="cartao-vencimento"
            value={vencimento}
            onChange={(e) => setVencimento(e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="5"
            inputMode="numeric"
          />
        </div>
      </div>

      <PreviaDoCiclo fechamento={Number(fechamento)} vencimento={Number(vencimento)} />

      <Button type="submit" disabled={salvar.isPending} className="w-full">
        {salvar.isPending ? "Salvando…" : cartao ? "Salvar alterações" : "Criar cartão"}
      </Button>

      {cartao && (
        <div className="grid gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={acaoDeRemover.isPending}
            onClick={() => acaoDeRemover.mutate("arquivar")}
            className="w-full"
          >
            <Archive className="mr-2 h-4 w-4" />
            Arquivar cartão
          </Button>
          <p className="px-1 text-2xs text-muted-foreground">
            Arquivar tira o cartão dos lançamentos novos e mantém o histórico de pé. Excluir de
            verdade só é possível enquanto ele nunca teve fatura.
          </p>
          <button
            type="button"
            disabled={acaoDeRemover.isPending}
            onClick={() => acaoDeRemover.mutate("excluir")}
            className="press rounded-xl px-1 py-1 text-xs font-medium text-danger hover:underline"
          >
            Excluir cartão
          </button>
        </div>
      )}
    </form>
  );
}

/**
 * A frase que impede o erro mais provável desta tela: digitar os dois dias
 * trocados.
 *
 * Explicar a regra por escrito ("se o vencimento for menor ou igual ao
 * fechamento, ele cai no mês seguinte") não ajuda ninguém a perceber que
 * errou. Mostrar o resultado com os números que a pessoa acabou de digitar,
 * sim: quem vê "vence em 05/11" e esperava outubro, corrige na hora.
 */
function PreviaDoCiclo({ fechamento, vencimento }: { fechamento: number; vencimento: number }) {
  const valido =
    Number.isFinite(fechamento) &&
    Number.isFinite(vencimento) &&
    fechamento >= 1 &&
    fechamento <= 31 &&
    vencimento >= 1 &&
    vencimento <= 31;

  if (!valido) {
    return (
      <p className="rounded-xl bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        Preencha os dois dias para ver em qual fatura uma compra de hoje cairia.
      </p>
    );
  }

  const hoje = localDateStr();
  const ciclo = faturaDaCompra(hoje, fechamento, vencimento);
  const janela = janelaDaFatura(ciclo.fechamento, fechamento);
  const dia = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
  const completa = (d: string) => d.split("-").reverse().join("/");

  return (
    <div className="rounded-xl bg-coral-soft/60 px-3 py-2.5 text-xs leading-relaxed text-foreground">
      Compras de <strong>{dia(janela.de)}</strong> a <strong>{dia(janela.ate)}</strong> entram na
      fatura que vence em <strong>{completa(ciclo.vencimento)}</strong>.
      <span className="mt-1 block text-muted-foreground">
        Uma compra feita hoje só sai do caixa nessa data.
      </span>
    </div>
  );
}
