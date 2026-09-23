import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { enviarParaBucket } from "@/lib/patients/upload";
import { getFotoDoPaciente, salvarFotoDoPaciente } from "@/lib/patients/photo.functions";

// A foto do rosto, no lugar das iniciais.
//
// As iniciais continuam desenhadas por baixo: enquanto a foto carrega, quando
// não há foto e quando o link venceu, a ficha nunca mostra um buraco cinza.

const MAX_BYTES = 8 * 1024 * 1024;

export function FotoDoRosto({
  patientId,
  iniciais,
  nome,
}: {
  patientId: string;
  iniciais: string;
  nome: string;
}) {
  const buscar = useServerFn(getFotoDoPaciente);
  const salvar = useServerFn(salvarFotoDoPaciente);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const foto = useQuery({
    queryKey: ["patient-photo", patientId],
    queryFn: () => buscar({ data: { patientId } }),
    staleTime: 5 * 60_000,
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["patient-photo", patientId] });

  const remover = useMutation({
    mutationFn: () => salvar({ data: { patientId, storagePath: null } }),
    onSuccess: () => {
      toast.success("Foto removida");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const escolher = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha uma imagem (JPG, PNG ou WebP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("A imagem passa de 8 MB. Reduza antes de enviar.");
      return;
    }
    setEnviando(true);
    try {
      const caminho = await enviarParaBucket(file, "perfil");
      await salvar({ data: { patientId, storagePath: caminho } });
      toast.success("Foto atualizada");
      invalidar();
    } catch (e) {
      toast.error(e instanceof Error ? `Falha ao enviar: ${e.message}` : "Falha ao enviar a foto.");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const url = foto.data?.url ?? null;

  return (
    <div className="relative shrink-0">
      <span className="relative grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-violet-soft text-xl font-bold text-violet sm:h-20 sm:w-20 sm:text-2xl">
        {iniciais}
        {url && (
          <img
            src={url}
            alt={`Foto de ${nome}`}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </span>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void escolher(f);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={enviando}
        aria-label={url ? "Trocar foto do paciente" : "Adicionar foto do paciente"}
        className="press absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-border bg-white text-muted-foreground shadow-soft transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {enviando ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
      </button>

      {url && !enviando && (
        <button
          type="button"
          onClick={() => remover.mutate()}
          aria-label="Remover foto do paciente"
          className="press absolute -top-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-border bg-white text-muted-foreground shadow-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
