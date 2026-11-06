import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, FileUp, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NIVEIS, type NivelDeAcesso } from "@/lib/auth/niveis-de-acesso";
import { criarConvite, listarConvites } from "@/lib/settings/pessoal.functions";
import { importarPacientes } from "@/lib/patients/importar.functions";
import { lerPacientes } from "@/lib/patients/importar";

// Dois passos do guia de primeiro acesso: quem mais usa o sistema (links de
// convite com o nível de acesso já definido) e a lista de pacientes que o
// consultório já tem. Os dois são opcionais — "Configurar depois" está no guia.

const linkDoConvite = (token: string) => `${window.location.origin}/convite/${token}`;

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Link copiado.");
  } catch {
    toast.error("Não deu para copiar. Selecione o link e copie à mão.");
  }
}

export function PassoAcessos() {
  const criar = useServerFn(criarConvite);
  const listar = useServerFn(listarConvites);
  const convites = useQuery({ queryKey: ["convites-da-equipe"], queryFn: () => listar() });
  const [nivel, setNivel] = useState<NivelDeAcesso>("dentist");
  const [nome, setNome] = useState("");
  const gerar = useMutation({
    mutationFn: () => criar({ data: { nivel, nome } }),
    onSuccess: async (r) => {
      setNome("");
      await convites.refetch();
      await copiar(linkDoConvite(r.token));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const escolhido = NIVEIS.find((n) => n.valor === nivel);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Gere um link para cada pessoa. Quem abrir preenche os próprios dados e já entra com o nível
        que você escolher — sem fila de aprovação. O link vale 7 dias e serve para uma pessoa só.
      </p>
      <div className="flex flex-wrap gap-2">
        {NIVEIS.filter((n) => n.valor !== "finance").map((n) => (
          <button
            key={n.valor}
            type="button"
            onClick={() => setNivel(n.valor)}
            className={
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors " +
              (nivel === n.valor
                ? "border-foreground bg-foreground font-medium text-background"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {n.rotulo}
          </button>
        ))}
      </div>
      {escolhido && <p className="text-xs text-muted-foreground">{escolhido.resumo}</p>}
      <div className="flex gap-2">
        <Input
          placeholder="Nome da pessoa (opcional)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Button variant="premium" disabled={gerar.isPending} onClick={() => gerar.mutate()}>
          {gerar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Gerar link
        </Button>
      </div>
      {!!convites.data?.length && (
        <ul className="divide-y divide-border/70 rounded-2xl bg-muted/40 px-4">
          {convites.data.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0 truncate">
                {c.convidadoNome || "Convite"}{" "}
                <span className="text-muted-foreground">
                  · {NIVEIS.find((n) => n.valor === c.nivel)?.rotulo ?? c.nivel}
                </span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copiar(linkDoConvite(c.token))}
              >
                <Copy className="mr-1 h-4 w-4" /> Copiar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PassoPacientes() {
  const gravar = useServerFn(importarPacientes);
  const arquivo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const lidos = lerPacientes(texto);
  const importar = useMutation({
    mutationFn: () => gravar({ data: { pacientes: lidos } }),
    onSuccess: (r) => {
      setTexto("");
      toast.success(
        `${r.criados} paciente${r.criados === 1 ? "" : "s"} importado${r.criados === 1 ? "" : "s"}` +
          (r.repetidos
            ? ` · ${r.repetidos} já estava${r.repetidos === 1 ? "" : "m"} na lista`
            : ""),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Traga quem já é seu paciente. No Excel, selecione as colunas <strong>nome</strong>,{" "}
        <strong>telefone</strong> e <strong>e-mail</strong> e cole aqui, ou escolha um arquivo CSV.
        Quem já tem o mesmo telefone não é duplicado.
      </p>
      <Textarea
        rows={6}
        placeholder={"Nome\tTelefone\tE-mail\nAna Souza\t(48) 99999-1111\tana@email.com"}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={arquivo}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setTexto(await f.text());
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => arquivo.current?.click()}>
            <FileUp className="mr-1 h-4 w-4" /> Escolher arquivo CSV
          </Button>
          {!!lidos.length && (
            <span className="text-sm text-muted-foreground">
              {lidos.length} paciente{lidos.length === 1 ? "" : "s"} encontrado
              {lidos.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <Button
          variant="premium"
          size="sm"
          disabled={!lidos.length || importar.isPending}
          onClick={() => importar.mutate()}
        >
          {importar.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-1 h-4 w-4" />
          )}
          Importar
        </Button>
      </div>
    </div>
  );
}
