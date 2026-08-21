import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, HardDriveUpload, ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  BUCKET_ARQUIVOS,
  excluirArquivo,
  getArquivos,
  registrarArquivo,
  type ArquivoDoPaciente,
} from "@/lib/patients/files.functions";
import { Button } from "@/components/ui/button";

// Imagens e documentos do paciente, numa aba só.
//
// A referência separava em duas ("Imagens" e "Documentos"), mas a distinção é
// técnica: quem procura um raio-x e quem procura um termo assinado estão
// fazendo a mesma pergunta. Aqui é uma lista com dois grupos — grade para o
// que dá para ver, lista para o que se abre.

const MAX_BYTES = 20 * 1024 * 1024;

function tamanho(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function AindaNaoLigado() {
  return (
    <section className="surface-card p-5">
      <div className="flex items-start gap-3">
        <HardDriveUpload className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="text-sm font-medium text-foreground">Arquivos ainda não ativados</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Faltam dois passos no Lovable:{" "}
            <span className="font-medium text-foreground">Apply pending Supabase migrations</span> e
            criar o bucket <span className="font-medium text-foreground">{BUCKET_ARQUIVOS}</span> como
            privado em Cloud → Storage.
          </p>
        </div>
      </div>
    </section>
  );
}

function Cartao({ arquivo, onExcluir }: { arquivo: ArquivoDoPaciente; onExcluir: (id: string) => void }) {
  const ehImagem = arquivo.kind === "image";
  return (
    <div className="surface-card group relative overflow-hidden">
      {ehImagem ? (
        arquivo.url ? (
          <a href={arquivo.url} target="_blank" rel="noreferrer" className="block">
            <img
              src={arquivo.url}
              alt={arquivo.title}
              loading="lazy"
              className="h-32 w-full object-cover"
            />
          </a>
        ) : (
          // Registro existe, link não abriu. Mostrar o item mesmo assim é mais
          // honesto do que sumir com ele — some, e a pessoa acha que perdeu o
          // arquivo.
          <div className="grid h-32 w-full place-items-center bg-surface-muted text-2xs text-muted-foreground">
            Prévia indisponível
          </div>
        )
      ) : (
        <div className="grid h-32 w-full place-items-center bg-surface-muted">
          <FileText className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        </div>
      )}

      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          {arquivo.url ? (
            <a
              href={arquivo.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm font-medium text-foreground hover:underline"
            >
              {arquivo.title}
            </a>
          ) : (
            <p className="truncate text-sm font-medium text-foreground">{arquivo.title}</p>
          )}
          <p className="mt-0.5 truncate text-2xs text-muted-foreground">
            {quando(arquivo.createdAt)}
            {arquivo.sizeBytes ? ` · ${tamanho(arquivo.sizeBytes)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onExcluir(arquivo.id)}
          aria-label={`Excluir ${arquivo.title}`}
          className="press grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ArquivosDoPaciente({ patientId }: { patientId: string }) {
  const buscar = useServerFn(getArquivos);
  const registrar = useServerFn(registrarArquivo);
  const apagar = useServerFn(excluirArquivo);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const arquivos = useQuery({
    queryKey: ["patient-files", patientId],
    queryFn: () => buscar({ data: { patientId } }),
    staleTime: 15_000,
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["patient-files", patientId] });

  const remover = useMutation({
    mutationFn: (id: string) => apagar({ data: { id } }),
    onSuccess: () => {
      toast.success("Arquivo removido");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviar = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error(`"${file.name}" passa de 20 MB. Reduza antes de enviar.`);
      return;
    }
    setEnviando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData.user?.id;
      if (!ownerId) throw new Error("Sessão expirada — recarregue a página.");

      // Prefixo com o id do dono: é ele que permite uma policy de storage
      // separar uma clínica da outra dentro do mesmo bucket. Mesmo formato de
      // MediaUploadField.tsx.
      const nomeSeguro = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const caminho = `${ownerId}/${crypto.randomUUID()}-${nomeSeguro}`;
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET_ARQUIVOS)
        .upload(caminho, file, { cacheControl: "3600", upsert: false });
      if (erroUpload) throw erroUpload;

      await registrar({
        data: {
          patientId,
          kind: file.type.startsWith("image/") ? "image" : "document",
          title: file.name,
          storagePath: caminho,
          mime: file.type || null,
          sizeBytes: file.size,
        },
      });
      toast.success("Arquivo enviado");
      invalidar();
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Falha ao enviar: ${e.message}`
          : `Falha ao enviar — confira se o bucket ${BUCKET_ARQUIVOS} já foi criado no Lovable.`,
      );
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (arquivos.data?.indisponivel) return <div className="mt-5"><AindaNaoLigado /></div>;

  const lista = arquivos.data?.arquivos ?? [];
  const imagens = lista.filter((a) => a.kind === "image");
  const documentos = lista.filter((a) => a.kind === "document");

  return (
    <div className="mt-5 space-y-5">
      <section className="surface-card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-sm font-semibold">Arquivos do paciente</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Radiografias, fotos, contratos e termos. Até 20 MB por arquivo.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void enviar(f);
          }}
        />
        <Button
          className="bg-gradient-primary text-white"
          disabled={enviando}
          onClick={() => inputRef.current?.click()}
        >
          {enviando ? "Enviando…" : "Enviar arquivo"}
        </Button>
      </section>

      {arquivos.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando arquivos…</p>
      ) : !lista.length ? (
        <p className="surface-card p-5 text-sm text-muted-foreground">
          Nenhum arquivo enviado para este paciente.
        </p>
      ) : (
        <>
          {imagens.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-violet" />
                <h3 className="text-sm font-semibold">Imagens</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {imagens.map((a) => (
                  <Cartao key={a.id} arquivo={a} onExcluir={(id) => remover.mutate(id)} />
                ))}
              </div>
            </section>
          )}

          {documentos.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-info" />
                <h3 className="text-sm font-semibold">Documentos</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {documentos.map((a) => (
                  <Cartao key={a.id} arquivo={a} onExcluir={(id) => remover.mutate(id)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
