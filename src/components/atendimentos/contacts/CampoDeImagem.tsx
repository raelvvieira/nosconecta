import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const BUCKET = "crm-campaign-media";
/** Só para a miniatura na tela, que vive enquanto o diálogo está aberto. Quem
 *  envia de verdade é a Edge Function, que baixa pelo caminho com service role
 *  — por isso o que sai daqui para o servidor é o `path`, nunca esta URL. */
const VALIDADE_DA_PREVIA = 60 * 60;

const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANHO_MAX_MB = 5;

export interface ImagemDoDisparo {
  /** Caminho no bucket. É isto que a fila guarda. */
  path: string;
  /** URL assinada curta, só para mostrar aqui. */
  previa: string;
  nome: string;
}

/**
 * A imagem que vai junto da mensagem, como legenda.
 *
 * Guardamos o CAMINHO e não a URL assinada — diferente do campo antigo do
 * formulário de campanhas, que assinava por dez anos e mandava a URL adiante.
 * Uma fila de 800 contatos com pausas pode levar mais de um dia até o último
 * alvo, e uma URL que expira no meio faria a imagem falhar só para o fim da
 * lista, do jeito mais difícil de perceber.
 */
export function CampoDeImagem({
  imagem,
  onChange,
  disabled,
}: {
  imagem: ImagemDoDisparo | null;
  onChange: (v: ImagemDoDisparo | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const escolher = async (file: File) => {
    if (!TIPOS.includes(file.type)) {
      toast.error("Formato não aceito — use JPG, PNG ou WebP.");
      return;
    }
    if (file.size > TAMANHO_MAX_MB * 1024 * 1024) {
      toast.error(`A imagem tem ${(file.size / 1024 / 1024).toFixed(1)} MB — o limite é ${TAMANHO_MAX_MB} MB.`);
      return;
    }
    setEnviando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData.user?.id;
      if (!ownerId) throw new Error("Sessão expirada — recarregue a página.");
      // Prefixo com o id do dono: é ele que a policy do bucket usa para separar
      // uma clínica da outra.
      const nomeSeguro = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${ownerId}/${crypto.randomUUID()}-${nomeSeguro}`;
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (erroUpload) throw erroUpload;

      const { data, error: erroAssinatura } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, VALIDADE_DA_PREVIA);
      if (erroAssinatura) throw erroAssinatura;

      onChange({ path, previa: data.signedUrl, nome: file.name });
    } catch (e) {
      toast.error(
        (e as Error).message?.includes("Bucket not found")
          ? "O bucket crm-campaign-media ainda não existe — crie em Cloud → Storage no Lovable."
          : `Falha ao enviar a imagem: ${(e as Error).message}`,
      );
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (imagem) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-white p-2">
        <img
          src={imagem.previa}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
        <p className="min-w-0 flex-1 truncate text-2xs text-foreground-secondary">{imagem.nome}</p>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-label="Remover imagem"
          className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={TIPOS.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) escolher(f);
        }}
      />
      <button
        type="button"
        data-anexar-imagem=""
        disabled={disabled || enviando}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "press flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border",
          "text-2xs font-medium text-muted-foreground transition-colors hover:border-coral hover:text-coral",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2",
        )}
      >
        {enviando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Enviando…
          </>
        ) : (
          <>
            <ImagePlus className="h-4 w-4" /> Anexar imagem
          </>
        )}
      </button>
    </>
  );
}
