import { supabase } from "./supabase";
import { validateFile, type MediaKind } from "./validation";

export interface UploadResult {
  storagePath: string;
  kind: MediaKind;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
}

function extFor(file: File): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop()! : "";
  if (fromName) return fromName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return map[file.type] ?? "bin";
}

async function imageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return null;
  return new Promise((resolve) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(objUrl);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(objUrl);
    };
    img.src = objUrl;
  });
}

/** Validate + upload a file to the public `media` bucket. */
export async function uploadFile(file: File): Promise<UploadResult> {
  const check = validateFile(file);
  if (!check.ok) throw new Error(check.error);

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const id = crypto.randomUUID();
  const path = `${yyyy}/${mm}/${id}.${extFor(file)}`;

  const { error } = await supabase.storage.from("media").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`업로드 실패: ${error.message}`);

  const dims = await imageDimensions(file);
  return {
    storagePath: path,
    kind: check.kind,
    mimeType: file.type,
    byteSize: file.size,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  };
}
