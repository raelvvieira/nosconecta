import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderPlus, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { enviarParaBucket } from "@/lib/patients/upload";
import {
  excluirArquivo,
  getArquivos,
  registrarArquivo,
  type ArquivoDoPaciente,
  type FaseDaFoto,
} from "@/lib/patients/files.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Pastas de fotos antes e depois.
//
// A pasta é só um nome ("Ortodontia 2026", "Clareamento"), e cada foto dentro
// dela sabe de que lado está. Duas colunas lado a lado em vez de uma grade
// cronológica: a comparação é a razão de existir do álbum, e ordenar por data
// misturaria os dois lados.

const MAX_BYTES = 20 * 1024 * 1024;
const FASES: FaseDaFoto[] = ["antes", "depois"];

function quando(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function AlbunsDoPaciente({ patientId }: { patientId: string }) {
  const buscar = useServerFn(getArquivos);
  const registrar = useServerFn(registrarArquivo);
  const apagar = useServerFn(excluirArquivo);
  const queryClient = useQueryClient();

  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [pastasVazias, setPastasVazias] = useState<string[]>([]);
  const [enviandoEm, setEnviandoEm] = useState<string | null>(null);

  const arquivos = useQuery({
    queryKey: ["patient-files", patientId],
    queryFn: () => buscar({ data: { patientId } }),
    staleTime: 15_000,
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["patient-files", patientId] });

  const remover = useMutation({
    mutationFn: (id: string) => apagar({ data: { id } }),
    onSuccess: () => {
      toast.success("Foto removida");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const albuns = useMemo(() => {
    const mapa = new Map<string, ArquivoDoPaciente[]>();
    // Pastas recém-criadas ainda não têm foto nenhuma — sem elas na lista, a
    // pessoa criaria a pasta e não teria onde enviar a primeira foto.
    for (const nome of pastasVazias) mapa.set(nome, []);
    for (const a of arquivos.data?.arquivos ?? []) {
      if (!a.album) continue;
      mapa.set(a.album, [...(mapa.get(a.album) ?? []), a]);
    }
    return [...mapa.entries()].sort((x, y) => x[0].localeCompare(y[0], "pt-BR"));
  }, [arquivos.data, pastasVazias]);

  const enviar = async (album: string, phase: FaseDaFoto, files: FileList) => {
    setEnviandoEm(`${album}:${phase}`);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`"${file.name}" não é uma imagem.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`"${file.name}" passa de 20 MB.`);
          continue;
        }
        const caminho = await enviarParaBucket(file, "albuns");
        await registrar({
          data: {
            patientId,
            kind: "image",
            title: file.name,
            storagePath: caminho,
            mime: file.type || null,
            sizeBytes: file.size,
            album,
            phase,
          },
        });
      }
      toast.success("Fotos enviadas");
      invalidar();
    } catch (e) {
      toast.error(
        e instanceof Error ? `Falha ao enviar: ${e.message}` : "Falha ao enviar as fotos.",
      );
    } finally {
      setEnviandoEm(null);
    }
  };

  if (arquivos.data?.indisponivel) return null;

  return (
    <section className="space-y-4">
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-sm font-semibold">Pastas de fotos · antes e depois</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Uma pasta por tratamento, com as fotos de antes de um lado e as de depois do outro.
          </p>
        </div>
        {criando ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const nome = nomeNovo.trim();
              if (!nome) return;
              if (!pastasVazias.includes(nome)) setPastasVazias((p) => [...p, nome]);
              setNomeNovo("");
              setCriando(false);
            }}
          >
            <Input
              autoFocus
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              placeholder="Nome da pasta"
              className="h-10 w-48"
            />
            <Button type="submit" className="bg-gradient-primary text-white">
              Criar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCriando(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <Button variant="outline" onClick={() => setCriando(true)}>
            <FolderPlus className="mr-2 h-4 w-4" /> Nova pasta
          </Button>
        )}
      </div>

      {albuns.length === 0 ? (
        <p className="surface-card p-5 text-sm text-muted-foreground">
          Nenhuma pasta criada ainda. Crie uma pasta para começar a comparação.
        </p>
      ) : (
        albuns.map(([nome, fotos]) => (
          <article key={nome} className="surface-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="truncate text-sm font-semibold">{nome}</h3>
              <span className="text-2xs text-muted-foreground">
                {fotos.length} {fotos.length === 1 ? "foto" : "fotos"}
              </span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {FASES.map((fase) => (
                <Coluna
                  key={fase}
                  fase={fase}
                  fotos={fotos.filter((f) => f.phase === fase)}
                  enviando={enviandoEm === `${nome}:${fase}`}
                  onEnviar={(files) => void enviar(nome, fase, files)}
                  onExcluir={(id) => remover.mutate(id)}
                />
              ))}
            </div>
          </article>
        ))
      )}
    </section>
  );
}

function Coluna({
  fase,
  fotos,
  enviando,
  onEnviar,
  onExcluir,
}: {
  fase: FaseDaFoto;
  fotos: ArquivoDoPaciente[];
  enviando: boolean;
  onEnviar: (files: FileList) => void;
  onExcluir: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border border-border bg-surface-muted/50 p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {fase === "antes" ? "Antes" : "Depois"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) onEnviar(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={enviando}
          onClick={() => inputRef.current?.click()}
          className="press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:text-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {enviando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          {enviando ? "Enviando…" : "Adicionar"}
        </button>
      </div>

      {fotos.length === 0 ? (
        <p className="py-6 text-center text-2xs text-muted-foreground">Nenhuma foto ainda</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {fotos.map((f) => (
            <div key={f.id} className="group relative overflow-hidden rounded-xl bg-white">
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer">
                  <img
                    src={f.url}
                    alt={f.title}
                    loading="lazy"
                    className="h-28 w-full object-cover"
                  />
                </a>
              ) : (
                <div className="grid h-28 w-full place-items-center text-2xs text-muted-foreground">
                  Prévia indisponível
                </div>
              )}
              <p className="truncate px-2 py-1 text-2xs text-muted-foreground">
                {quando(f.createdAt)}
              </p>
              <button
                type="button"
                onClick={() => onExcluir(f.id)}
                aria-label={`Excluir ${f.title}`}
                className="press absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-muted-foreground shadow-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
