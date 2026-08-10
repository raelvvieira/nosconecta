import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const BUCKET = "crm-campaign-media";
// Bucket é PRIVADO (política do workspace bloqueia buckets públicos), então
// getPublicUrl() não resolve pra fora — precisa de signed URL. 10 anos é a
// validade mais longa que faz sentido aqui; ainda assim expira, então um
// template com imagem reaproveitado depois disso perde o anexo e precisa
// ser reanexado.
const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 365 * 10;

export function MediaUploadField({
  mediaUrl,
  onChange,
  disabled,
}: {
  mediaUrl: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData.user?.id;
      if (!ownerId) throw new Error("Sessão expirada — recarregue a página.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${ownerId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_EXPIRES_IN_SECONDS);
      if (signError || !data) throw signError ?? new Error("Falha ao gerar link da imagem.");
      onChange(data.signedUrl);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Falha ao enviar imagem: ${error.message}`
          : "Falha ao enviar imagem — verifique se o bucket crm-campaign-media já foi criado no Lovable.",
      );
    } finally {
      setUploading(false);
    }
  };

  if (disabled) {
    return (
      <p className="text-2xs text-muted-foreground">
        Anexo de imagem só está disponível ao criar uma mensagem nova (não dá pra anexar a um template já existente, pra
        não vazar mídia entre clínicas que compartilham o mesmo template).
      </p>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {mediaUrl ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-2">
          <img src={mediaUrl} alt="Anexo da mensagem" className="h-14 w-14 rounded-xl object-cover" />
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Imagem anexada</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
            aria-label="Remover imagem"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "flex w-full items-center gap-2 rounded-2xl border border-dashed border-border bg-white px-3 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted",
            uploading && "opacity-60",
          )}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {uploading ? "Enviando..." : "Anexar imagem, vídeo, áudio ou documento"}
        </button>
      )}
    </div>
  );
}
