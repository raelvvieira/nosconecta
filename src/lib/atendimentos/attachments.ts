import type { PendingAttachment } from "@/components/atendimentos/chat/AttachmentTray";

// O arquivo trafega em base64 (server function e Edge Function só passam
// JSON), o que infla ~33%. O limite é conservador de propósito: o corpo
// ainda precisa caber no request da server function e da Edge Function.
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Não foi possível ler o arquivo ${file.name}.`));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      // readAsDataURL devolve "data:<tipo>;base64,<conteúdo>" — o CRM quer
      // só o conteúdo.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export async function fileToPendingAttachment(
  file: File,
  options: { isRecordedAudio?: boolean } = {},
): Promise<PendingAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `"${file.name}" tem ${(file.size / (1024 * 1024)).toFixed(1)} MB. O limite por arquivo é ${
        MAX_ATTACHMENT_BYTES / (1024 * 1024)
      } MB.`,
    );
  }
  const data = await readFileAsBase64(file);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    data,
    isRecordedAudio: options.isRecordedAudio,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
  };
}
