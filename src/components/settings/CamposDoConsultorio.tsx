import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AREAS, type AreaDeAtuacao } from "@/lib/settings/catalogo-modelo";
import {
  FORMAS_DE_PAGAMENTO,
  type ConfigDoConsultorio,
  type FormaDePagamento,
} from "@/lib/settings/consultorio.functions";
import {
  CampoDeImagem,
  type ImagemDoDisparo,
} from "@/components/atendimentos/contacts/CampoDeImagem";

/**
 * Os campos do consultório, em grupos, usados pela tela de Configurações e
 * pelo onboarding. Cada grupo recebe o rascunho inteiro e devolve só o que
 * mudou, para as duas telas gravarem do mesmo jeito.
 */

export type Rascunho = Partial<ConfigDoConsultorio>;
type Mudar = (patch: Rascunho) => void;

export function Campo({
  rotulo,
  ajuda,
  children,
  className,
}: {
  rotulo: string;
  ajuda?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label className="text-[13px] font-medium">{rotulo}</Label>
      {children}
      {ajuda && <p className="text-xs leading-5 text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

/** Número que aceita vírgula e vazio (vazio = não cadastrado). */
function CampoNumero({
  valor,
  onMudar,
  placeholder,
  className,
}: {
  valor: number | null | undefined;
  onMudar: (v: number | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [texto, setTexto] = useState(valor === null || valor === undefined ? "" : String(valor));
  useEffect(() => {
    setTexto(valor === null || valor === undefined ? "" : String(valor).replace(".", ","));
  }, [valor]);
  return (
    <Input
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        const t = e.target.value.replace(/\./g, "").replace(",", ".").trim();
        onMudar(t === "" || !Number.isFinite(Number(t)) ? null : Number(t));
      }}
    />
  );
}

export function CamposDeIdentidade({ r, mudar }: { r: Rascunho; mudar: Mudar }) {
  const [logo, setLogo] = useState<ImagemDoDisparo | null>(
    r.logoPath ? { path: r.logoPath, previa: "", nome: "logo atual" } : null,
  );
  return (
    <div className="grid gap-4">
      <Campo rotulo="Nome do consultório">
        <Input
          value={r.nome ?? ""}
          placeholder="Ex.: Clínica Sorriso"
          onChange={(e) => mudar({ nome: e.target.value })}
        />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Cidade">
          <Input value={r.cidade ?? ""} onChange={(e) => mudar({ cidade: e.target.value })} />
        </Campo>
        <Campo rotulo="WhatsApp do consultório">
          <Input
            inputMode="tel"
            value={r.whatsapp ?? ""}
            placeholder="(48) 99999-9999"
            onChange={(e) => mudar({ whatsapp: e.target.value })}
          />
        </Campo>
      </div>
      <Campo
        rotulo="Quem faz a avaliação"
        ajuda='Como a assistente vai chamar: "Dra. Ana", "Dr. Paulo". Vazio, ela diz "a equipe".'
      >
        <Input
          value={r.responsavelAvaliacao ?? ""}
          placeholder="Dra. Ana"
          onChange={(e) => mudar({ responsavelAvaliacao: e.target.value })}
        />
      </Campo>
      <Campo rotulo="Logo" ajuda="Opcional. Aparece nos e-mails e na página do paciente.">
        <CampoDeImagem
          imagem={logo}
          onChange={(v) => {
            setLogo(v);
            mudar({ logoPath: v?.path ?? null });
          }}
        />
      </Campo>
    </div>
  );
}

export function CamposDeArea({ r, mudar }: { r: Rascunho; mudar: Mudar }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {AREAS.map((a) => {
        const ativo = r.area === a.id;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => mudar({ area: a.id as AreaDeAtuacao })}
            className={cn(
              "flex items-start justify-between gap-3 rounded-2xl border p-4 text-left transition",
              ativo
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-muted/40",
            )}
          >
            <span>
              <span className="block text-sm font-semibold">{a.rotulo}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{a.descricao}</span>
            </span>
            {ativo && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

export function CamposDePagamento({ r, mudar }: { r: Rascunho; mudar: Mudar }) {
  const formas = new Set<FormaDePagamento>(r.formas ?? []);
  const alternar = (f: FormaDePagamento) => {
    const n = new Set(formas);
    if (n.has(f)) n.delete(f);
    else n.add(f);
    mudar({ formas: [...n] });
  };
  const comJuros = r.jurosAPartir !== null && r.jurosAPartir !== undefined;
  return (
    <div className="grid gap-5">
      <Campo rotulo="Formas de pagamento">
        <div className="flex flex-wrap gap-2">
          {FORMAS_DE_PAGAMENTO.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => alternar(f.id)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition",
                formas.has(f.id)
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/40",
              )}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      </Campo>
      {formas.has("cartao") && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Parcelas no cartão, no máximo">
              <CampoNumero
                valor={r.parcelasMax}
                placeholder="Ex.: 12"
                onMudar={(v) => mudar({ parcelasMax: v })}
              />
            </Campo>
            <Campo rotulo="Parcela mínima (R$)" ajuda="Opcional.">
              <CampoNumero
                valor={r.parcelaMinima}
                placeholder="Ex.: 100"
                onMudar={(v) => mudar({ parcelaMinima: v })}
              />
            </Campo>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-4 py-3 text-sm">
            <span>
              Tem juros no parcelamento
              <span className="block text-xs text-muted-foreground">
                Desligado, a assistente diz "sem juros".
              </span>
            </span>
            <Switch
              checked={comJuros}
              onCheckedChange={(v) => mudar({ jurosAPartir: v ? 2 : null })}
            />
          </label>
          {comJuros && (
            <Campo
              rotulo="Juros a partir de quantas parcelas"
              ajuda="Ex.: 7 = sem juros até 6x e com juros a partir de 7x."
            >
              <CampoNumero
                className="w-32"
                valor={r.jurosAPartir}
                onMudar={(v) => mudar({ jurosAPartir: v ?? 2 })}
              />
            </Campo>
          )}
        </>
      )}
    </div>
  );
}

export function CamposDeAvaliacao({ r, mudar }: { r: Rascunho; mudar: Mudar }) {
  const gratuita = r.avaliacaoGratuita !== false;
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { v: true, t: "Gratuita", d: "A assistente diz que a avaliação é sem custo." },
          { v: false, t: "Tem valor", d: "A assistente informa o valor da avaliação." },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => mudar({ avaliacaoGratuita: o.v })}
            className={cn(
              "rounded-2xl border p-4 text-left transition",
              gratuita === o.v
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-muted/40",
            )}
          >
            <span className="block text-sm font-semibold">{o.t}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{o.d}</span>
          </button>
        ))}
      </div>
      {!gratuita && (
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <Campo rotulo="Valor da avaliação (R$)">
            <CampoNumero
              valor={r.avaliacaoValor}
              placeholder="Ex.: 150"
              onMudar={(v) => mudar({ avaliacaoValor: v })}
            />
          </Campo>
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-4 py-3 text-sm">
            Desconta do tratamento
            <Switch
              checked={r.avaliacaoAbate === true}
              onCheckedChange={(v) => mudar({ avaliacaoAbate: v })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export function CamposDePoliticas({ r, mudar }: { r: Rascunho; mudar: Mudar }) {
  return (
    <div className="grid gap-4">
      <Campo rotulo="Se o paciente faltar" ajuda="A assistente repete do jeito que está aqui.">
        <Textarea
          rows={2}
          value={r.politicaFalta ?? ""}
          placeholder="Ex.: pedimos que avise com 24h de antecedência."
          onChange={(e) => mudar({ politicaFalta: e.target.value })}
        />
      </Campo>
      <Campo rotulo="Cancelamento e remarcação">
        <Textarea
          rows={2}
          value={r.politicaCancelamento ?? ""}
          placeholder="Ex.: dá para remarcar sem custo até 24h antes."
          onChange={(e) => mudar({ politicaCancelamento: e.target.value })}
        />
      </Campo>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-4 py-3 text-sm">
        <span>
          A assistente pode dar preço de harmonização
          <span className="block text-xs text-muted-foreground">
            Só os valores da sua tabela e das campanhas. Desligado, ela leva para a avaliação.
          </span>
        </span>
        <Switch
          checked={r.precoHarmonizacao === true}
          onCheckedChange={(v) => mudar({ precoHarmonizacao: v })}
        />
      </label>
    </div>
  );
}
