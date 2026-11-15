import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { custoPorUnidade, emUnidades, rotuloDoSaldo } from "@/lib/estoque/estoque";
import {
  ajustarSaldoDeEstoque,
  atualizarItemDeEstoque,
  criarItemDeEstoque,
  registrarEntradaDeEstoque,
  registrarSaidaDeEstoque,
  type ItemDoEstoque,
} from "@/lib/estoque/estoque.functions";

// Os formulários do estoque. Cada um é uma folha lateral e todos terminam do
// mesmo jeito: gravam, avisam e mandam a lista se atualizar.

const moeda = (n: number, casas = 2) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: casas,
  }).format(n);

/** "1.234,5" ou "1234.5" → número. Vazio e lixo viram 0. */
function lerNumero(v: string): number {
  const t = String(v ?? "")
    .trim()
    .replace(/\s/g, "");
  if (!t) return 0;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function useDepoisDeGravar(aoFechar: () => void) {
  const queryClient = useQueryClient();
  return (mensagem: string) => {
    toast.success(mensagem);
    void queryClient.invalidateQueries({ queryKey: ["estoque"] });
    aoFechar();
  };
}

const mensagemDoErro = (e: unknown) =>
  e instanceof Error ? e.message : "Não foi possível salvar.";

interface UnidadeDaClinica {
  id: string;
  nome: string;
}

function Campo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{rotulo}</Label>
      {children}
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  );
}

/** Caixas + peças soltas, com o total em unidades logo abaixo. */
function Quantidade({
  item,
  caixas,
  avulsas,
  onCaixas,
  onAvulsas,
}: {
  item: ItemDoEstoque | null;
  caixas: string;
  avulsas: string;
  onCaixas: (v: string) => void;
  onAvulsas: (v: string) => void;
}) {
  const por = item?.unidadesPorEmbalagem ?? 1;
  const total = emUnidades(lerNumero(caixas), lerNumero(avulsas), por);
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-3">
        <Campo
          rotulo={`${item?.rotuloEmbalagem ?? "Caixas"}s`.replace(/^./, (c) => c.toUpperCase())}
        >
          <Input
            inputMode="decimal"
            value={caixas}
            onChange={(e) => onCaixas(e.target.value)}
            placeholder="0"
          />
        </Campo>
        <Campo
          rotulo={`${item?.rotuloUnidade ?? "Unidade"}s soltas`.replace(/^./, (c) =>
            c.toUpperCase(),
          )}
        >
          <Input
            inputMode="decimal"
            value={avulsas}
            onChange={(e) => onAvulsas(e.target.value)}
            placeholder="0"
          />
        </Campo>
      </div>
      {item && total > 0 && (
        <p className="text-xs text-muted-foreground">
          Total: {total.toLocaleString("pt-BR")} {item.rotuloUnidade}
          {total === 1 ? "" : "s"}
          {por > 1
            ? ` (${rotuloDoSaldo(total, por, item.rotuloEmbalagem, item.rotuloUnidade)})`
            : ""}
        </p>
      )}
    </div>
  );
}

function SeletorDeItem({
  itens,
  valor,
  onMudar,
}: {
  itens: ItemDoEstoque[];
  valor: string;
  onMudar: (id: string) => void;
}) {
  return (
    <Select value={valor} onValueChange={onMudar}>
      <SelectTrigger>
        <SelectValue placeholder="Escolha o item" />
      </SelectTrigger>
      <SelectContent>
        {itens.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SeletorDeUnidade({
  unidades,
  valor,
  onMudar,
}: {
  unidades: UnidadeDaClinica[];
  valor: string;
  onMudar: (id: string) => void;
}) {
  if (unidades.length <= 1) return null;
  return (
    <Campo rotulo="Unidade">
      <Select value={valor} onValueChange={onMudar}>
        <SelectTrigger>
          <SelectValue placeholder="Escolha a unidade" />
        </SelectTrigger>
        <SelectContent>
          {unidades.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Campo>
  );
}

function Moldura({
  aberto,
  aoMudar,
  titulo,
  descricao,
  children,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={aberto} onOpenChange={aoMudar}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
          {descricao && <SheetDescription>{descricao}</SheetDescription>}
        </SheetHeader>
        <div className="mt-6 space-y-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

interface FolhaBase {
  aberto: boolean;
  aoFechar: () => void;
  itens: ItemDoEstoque[];
  unidades: UnidadeDaClinica[];
  /** A unidade em foco na página; vazia quando a pessoa vê todas somadas. */
  unidadeAtual: string | null;
}

/** A unidade em que o movimento vale: a da página, ou a única, ou a escolhida. */
function useUnidade(base: FolhaBase) {
  const inicial = base.unidadeAtual ?? (base.unidades.length === 1 ? base.unidades[0].id : "");
  const [unidade, setUnidade] = useState(inicial);
  useEffect(() => {
    if (base.aberto) setUnidade(inicial);
  }, [base.aberto, inicial]);
  return [unidade, setUnidade] as const;
}

// ── Entrada ────────────────────────────────────────────────────────────────

export function FolhaDeEntrada({
  itemInicial,
  ...base
}: FolhaBase & { itemInicial?: string | null }) {
  const gravar = useServerFn(registrarEntradaDeEstoque);
  const depois = useDepoisDeGravar(base.aoFechar);
  const [itemId, setItemId] = useState("");
  const [unidade, setUnidade] = useUnidade(base);
  const [caixas, setCaixas] = useState("");
  const [avulsas, setAvulsas] = useState("");
  const [valor, setValor] = useState("");
  const [valorEh, setValorEh] = useState<"total" | "caixa">("total");
  const [fornecedor, setFornecedor] = useState("");

  useEffect(() => {
    if (!base.aberto) return;
    setItemId(itemInicial ?? "");
    setCaixas("");
    setAvulsas("");
    setValor("");
    setFornecedor("");
    setValorEh("total");
  }, [base.aberto, itemInicial]);

  const item = base.itens.find((i) => i.id === itemId) ?? null;
  const unidades = emUnidades(
    lerNumero(caixas),
    lerNumero(avulsas),
    item?.unidadesPorEmbalagem ?? 1,
  );
  const pago = lerNumero(valor);
  const total = valorEh === "caixa" && item ? (unidades / item.unidadesPorEmbalagem) * pago : pago;
  const porPeca = pago > 0 && unidades > 0 ? custoPorUnidade(total, unidades) : null;

  const salvar = useMutation({
    mutationFn: () =>
      gravar({
        data: {
          itemId,
          unitId: unidade || null,
          caixas: lerNumero(caixas),
          avulsas: lerNumero(avulsas),
          ...(pago > 0
            ? valorEh === "total"
              ? { custoTotal: pago }
              : { custoPorEmbalagem: pago }
            : {}),
          fornecedor: fornecedor || null,
        },
      }),
    onSuccess: () => depois("Entrada registrada."),
    onError: (e) => toast.error(mensagemDoErro(e)),
  });

  return (
    <Moldura
      aberto={base.aberto}
      aoMudar={(v) => !v && base.aoFechar()}
      titulo="Dar entrada no estoque"
      descricao="Registre o que chegou. O preço pago alimenta o histórico de valores."
    >
      <Campo rotulo="Item">
        <SeletorDeItem itens={base.itens} valor={itemId} onMudar={setItemId} />
      </Campo>
      <SeletorDeUnidade unidades={base.unidades} valor={unidade} onMudar={setUnidade} />
      <Quantidade
        item={item}
        caixas={caixas}
        avulsas={avulsas}
        onCaixas={setCaixas}
        onAvulsas={setAvulsas}
      />
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <Campo rotulo="Valor pago (opcional)">
          <Input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
          />
        </Campo>
        <Select value={valorEh} onValueChange={(v) => setValorEh(v as "total" | "caixa")}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="total">no total</SelectItem>
            <SelectItem value="caixa">por {item?.rotuloEmbalagem ?? "caixa"}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {porPeca != null && (
        <p className="-mt-3 text-xs text-muted-foreground">
          Fica {moeda(porPeca, 4)} por {item?.rotuloUnidade ?? "unidade"} · {moeda(total)} no total.
        </p>
      )}
      <Campo rotulo="Fornecedor (opcional)">
        <Input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} maxLength={80} />
      </Campo>
      <Button
        variant="premium"
        className="w-full"
        disabled={!itemId || unidades <= 0 || salvar.isPending}
        onClick={() => salvar.mutate()}
      >
        {salvar.isPending ? "Registrando…" : "Registrar entrada"}
      </Button>
    </Moldura>
  );
}

// ── Saída e perda ──────────────────────────────────────────────────────────

export function FolhaDeSaida({
  itemInicial,
  ...base
}: FolhaBase & { itemInicial?: string | null }) {
  const gravar = useServerFn(registrarSaidaDeEstoque);
  const depois = useDepoisDeGravar(base.aoFechar);
  const [itemId, setItemId] = useState("");
  const [unidade, setUnidade] = useUnidade(base);
  const [tipo, setTipo] = useState<"saida" | "perda">("saida");
  const [caixas, setCaixas] = useState("");
  const [avulsas, setAvulsas] = useState("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!base.aberto) return;
    setItemId(itemInicial ?? "");
    setCaixas("");
    setAvulsas("");
    setMotivo("");
    setTipo("saida");
  }, [base.aberto, itemInicial]);

  const item = base.itens.find((i) => i.id === itemId) ?? null;
  const unidades = emUnidades(
    lerNumero(caixas),
    lerNumero(avulsas),
    item?.unidadesPorEmbalagem ?? 1,
  );

  const salvar = useMutation({
    mutationFn: () =>
      gravar({
        data: {
          itemId,
          unitId: unidade || null,
          caixas: lerNumero(caixas),
          avulsas: lerNumero(avulsas),
          tipo,
          motivo: motivo || null,
        },
      }),
    onSuccess: () => depois(tipo === "perda" ? "Perda registrada." : "Saída registrada."),
    onError: (e) => toast.error(mensagemDoErro(e)),
  });

  return (
    <Moldura
      aberto={base.aberto}
      aoMudar={(v) => !v && base.aoFechar()}
      titulo="Dar saída no estoque"
      descricao="Uso no dia a dia, ou perda (vencido, quebrado). As duas entram na previsão de quanto dura."
    >
      <div className="flex rounded-full border border-border/70 bg-card p-0.5" role="group">
        {(
          [
            ["saida", "Uso"],
            ["perda", "Perda"],
          ] as const
        ).map(([v, r]) => (
          <button
            key={v}
            type="button"
            aria-pressed={tipo === v}
            onClick={() => setTipo(v)}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              tipo === v
                ? "bg-foreground text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <Campo rotulo="Item">
        <SeletorDeItem itens={base.itens} valor={itemId} onMudar={setItemId} />
      </Campo>
      {item && (
        <p className="-mt-3 text-xs text-muted-foreground">Em estoque: {item.saldoEmTexto}</p>
      )}
      <SeletorDeUnidade unidades={base.unidades} valor={unidade} onMudar={setUnidade} />
      <Quantidade
        item={item}
        caixas={caixas}
        avulsas={avulsas}
        onCaixas={setCaixas}
        onAvulsas={setAvulsas}
      />
      <Campo rotulo="Motivo (opcional)">
        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          maxLength={400}
        />
      </Campo>
      <Button
        variant="premium"
        className="w-full"
        disabled={!itemId || unidades <= 0 || salvar.isPending}
        onClick={() => salvar.mutate()}
      >
        {salvar.isPending
          ? "Registrando…"
          : tipo === "perda"
            ? "Registrar perda"
            : "Registrar saída"}
      </Button>
    </Moldura>
  );
}

// ── Ajuste (contagem) ──────────────────────────────────────────────────────

export function FolhaDeAjuste({
  itemInicial,
  ...base
}: FolhaBase & { itemInicial?: string | null }) {
  const gravar = useServerFn(ajustarSaldoDeEstoque);
  const depois = useDepoisDeGravar(base.aoFechar);
  const [itemId, setItemId] = useState("");
  const [unidade, setUnidade] = useUnidade(base);
  const [caixas, setCaixas] = useState("");
  const [avulsas, setAvulsas] = useState("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!base.aberto) return;
    setItemId(itemInicial ?? "");
    setCaixas("");
    setAvulsas("");
    setMotivo("");
  }, [base.aberto, itemInicial]);

  const item = base.itens.find((i) => i.id === itemId) ?? null;
  const contado = emUnidades(
    lerNumero(caixas),
    lerNumero(avulsas),
    item?.unidadesPorEmbalagem ?? 1,
  );
  // O saldo que vale é o da unidade escolhida, não o somado da página.
  const saldoDaUnidade =
    item?.porUnidade.find((u) => u.unitId === unidade)?.saldo ?? (unidade ? 0 : (item?.saldo ?? 0));
  const diferenca = Math.round((contado - saldoDaUnidade) * 1000) / 1000;

  const salvar = useMutation({
    mutationFn: () =>
      gravar({
        data: {
          itemId,
          unitId: unidade || null,
          caixas: lerNumero(caixas),
          avulsas: lerNumero(avulsas),
          motivo: motivo || null,
        },
      }),
    onSuccess: () => depois("Estoque ajustado."),
    onError: (e) => toast.error(mensagemDoErro(e)),
  });

  return (
    <Moldura
      aberto={base.aberto}
      aoMudar={(v) => !v && base.aoFechar()}
      titulo="Ajustar o estoque"
      descricao="Contou e o número não bate? Informe o que existe de verdade; o sistema lança a diferença."
    >
      <Campo rotulo="Item">
        <SeletorDeItem itens={base.itens} valor={itemId} onMudar={setItemId} />
      </Campo>
      <SeletorDeUnidade unidades={base.unidades} valor={unidade} onMudar={setUnidade} />
      {item && (
        <p className="-mt-2 text-xs text-muted-foreground">
          O sistema tem:{" "}
          {rotuloDoSaldo(
            saldoDaUnidade,
            item.unidadesPorEmbalagem,
            item.rotuloEmbalagem,
            item.rotuloUnidade,
          )}
        </p>
      )}
      <Campo rotulo="Quanto existe de verdade">
        <Quantidade
          item={item}
          caixas={caixas}
          avulsas={avulsas}
          onCaixas={setCaixas}
          onAvulsas={setAvulsas}
        />
      </Campo>
      {item && (caixas || avulsas) && (
        <p
          className={cn(
            "text-sm font-medium",
            diferenca === 0
              ? "text-muted-foreground"
              : diferenca > 0
                ? "text-success"
                : "text-danger",
          )}
        >
          {diferenca === 0
            ? "Já está certo, nada a lançar."
            : `Vai ${diferenca > 0 ? "somar" : "tirar"} ${Math.abs(diferenca).toLocaleString("pt-BR")} ${item.rotuloUnidade}${Math.abs(diferenca) === 1 ? "" : "s"}.`}
        </p>
      )}
      <Campo rotulo="Motivo (opcional)">
        <Input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Contagem do estoque"
          maxLength={400}
        />
      </Campo>
      <Button
        variant="premium"
        className="w-full"
        disabled={!itemId || (!caixas && !avulsas) || diferenca === 0 || salvar.isPending}
        onClick={() => salvar.mutate()}
      >
        {salvar.isPending ? "Ajustando…" : "Ajustar estoque"}
      </Button>
    </Moldura>
  );
}

// ── Cadastro do item ───────────────────────────────────────────────────────

export function FolhaDeItem({
  aberto,
  aoFechar,
  item,
  categorias,
}: {
  aberto: boolean;
  aoFechar: () => void;
  /** Em branco = item novo. */
  item: ItemDoEstoque | null;
  categorias: string[];
}) {
  const criar = useServerFn(criarItemDeEstoque);
  const atualizar = useServerFn(atualizarItemDeEstoque);
  const depois = useDepoisDeGravar(aoFechar);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [embalagem, setEmbalagem] = useState("caixa");
  const [peca, setPeca] = useState("unidade");
  const [porEmbalagem, setPorEmbalagem] = useState("1");
  const [minimo, setMinimo] = useState("");
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    if (!aberto) return;
    setNome(item?.nome ?? "");
    setCategoria(item?.categoria ?? "");
    setEmbalagem(item?.rotuloEmbalagem ?? "caixa");
    setPeca(item?.rotuloUnidade ?? "unidade");
    setPorEmbalagem(item ? String(item.unidadesPorEmbalagem) : "1");
    setMinimo(item && item.minimoUnidades > 0 ? String(item.minimoUnidades) : "");
    setObservacoes(item?.observacoes ?? "");
  }, [aberto, item]);

  const dados = useMemo(
    () => ({
      nome,
      categoria: categoria || null,
      rotuloEmbalagem: embalagem,
      rotuloUnidade: peca,
      unidadesPorEmbalagem: lerNumero(porEmbalagem),
      minimoUnidades: lerNumero(minimo),
      observacoes: observacoes || null,
    }),
    [nome, categoria, embalagem, peca, porEmbalagem, minimo, observacoes],
  );

  const salvar = useMutation({
    mutationFn: async () => {
      if (item) await atualizar({ data: { id: item.id, ...dados } });
      else await criar({ data: dados });
    },
    onSuccess: () => depois(item ? "Item atualizado." : "Item cadastrado."),
    onError: (e) => toast.error(mensagemDoErro(e)),
  });
  const arquivar = useMutation({
    mutationFn: () => atualizar({ data: { id: item?.id ?? "", ...dados, arquivar: true } }),
    onSuccess: () => depois("Item arquivado."),
    onError: (e) => toast.error(mensagemDoErro(e)),
  });

  return (
    <Moldura
      aberto={aberto}
      aoMudar={(v) => !v && aoFechar()}
      titulo={item ? "Editar item" : "Cadastrar item"}
      descricao="Diga como o item é comprado e quantas peças vêm em cada embalagem. O saldo é sempre guardado em peças."
    >
      <Campo rotulo="Nome">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
          placeholder="Luva de procedimento M"
        />
      </Campo>
      <Campo rotulo="Categoria (opcional)">
        <Input
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          list="categorias-do-estoque"
          maxLength={60}
          placeholder="Descartáveis, anestésicos…"
        />
        <datalist id="categorias-do-estoque">
          {categorias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Vem em" dica="caixa, pacote, frasco, kit…">
          <Input value={embalagem} onChange={(e) => setEmbalagem(e.target.value)} maxLength={30} />
        </Campo>
        <Campo rotulo="Cada peça é" dica="unidade, seringa, par…">
          <Input value={peca} onChange={(e) => setPeca(e.target.value)} maxLength={30} />
        </Campo>
      </div>
      <Campo rotulo={`Quantas ${peca || "peças"}s em cada ${embalagem || "embalagem"}`}>
        <Input
          inputMode="decimal"
          value={porEmbalagem}
          onChange={(e) => setPorEmbalagem(e.target.value)}
        />
      </Campo>
      <Campo
        rotulo={`Avisar quando restar menos de (em ${peca || "peças"}s)`}
        dica="Opcional. Abaixo disto o item aparece como acabando."
      >
        <Input
          inputMode="decimal"
          value={minimo}
          onChange={(e) => setMinimo(e.target.value)}
          placeholder="0"
        />
      </Campo>
      <Campo rotulo="Observações (opcional)">
        <Textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={2}
          maxLength={400}
        />
      </Campo>
      <Button
        variant="premium"
        className="w-full"
        disabled={!nome.trim() || !(dados.unidadesPorEmbalagem > 0) || salvar.isPending}
        onClick={() => salvar.mutate()}
      >
        {salvar.isPending ? "Salvando…" : item ? "Salvar" : "Cadastrar item"}
      </Button>
      {item && (
        <Button
          variant="outline"
          className="w-full text-danger"
          disabled={arquivar.isPending}
          onClick={() => {
            if (
              window.confirm(
                `Arquivar "${item.nome}"? Ele sai da lista, mas o histórico fica guardado.`,
              )
            )
              arquivar.mutate();
          }}
        >
          Arquivar item
        </Button>
      )}
    </Moldura>
  );
}
