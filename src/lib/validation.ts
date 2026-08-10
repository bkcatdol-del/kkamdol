/** Client-side validation. The DB + storage bucket re-enforce these limits. */

export const LIMITS = {
  image: 5 * 1024 * 1024, // 5 MB
  gif: 10 * 1024 * 1024, // 10 MB
  video: 25 * 1024 * 1024, // 25 MB (prefer embeds instead)
} as const;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const GIF_TYPE = "image/gif";
export const VIDEO_TYPES = ["video/mp4", "video/webm"];

export type MediaKind = "image" | "gif" | "video_file" | "video_embed";

export function kindForFile(file: File): MediaKind | null {
  if (file.type === GIF_TYPE) return "gif";
  if (IMAGE_TYPES.includes(file.type)) return "image";
  if (VIDEO_TYPES.includes(file.type)) return "video_file";
  return null;
}

export function validateFile(file: File): { ok: true; kind: MediaKind } | { ok: false; error: string } {
  const kind = kindForFile(file);
  if (!kind) {
    return { ok: false, error: "지원하지 않는 형식입니다 (이미지·GIF·mp4/webm만 가능)." };
  }
  const cap = kind === "gif" ? LIMITS.gif : kind === "video_file" ? LIMITS.video : LIMITS.image;
  if (file.size > cap) {
    return { ok: false, error: `파일이 너무 큽니다. 최대 ${(cap / 1024 / 1024) | 0}MB.` };
  }
  return { ok: true, kind };
}

/**
 * Parse a YouTube / Vimeo URL into a canonical embed URL.
 * Only these hosts are allowed — never inject an arbitrary iframe src.
 */
export function parseEmbed(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return /^[\w-]{6,}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v");
    if (id && /^[\w-]{6,}$/.test(id)) return `https://www.youtube.com/embed/${id}`;
    const m = u.pathname.match(/^\/(embed|shorts)\/([\w-]{6,})/);
    if (m) return `https://www.youtube.com/embed/${m[2]}`;
    return null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(\d{6,})/);
    return m ? `https://player.vimeo.com/video/${m[1]}` : null;
  }
  return null;
}

export function checkText(value: string, min: number, max: number, label: string): string | null {
  const len = value.trim().length;
  if (len < min) return `${label}을(를) 입력해 주세요.`;
  if (len > max) return `${label}이(가) 너무 깁니다 (최대 ${max}자).`;
  return null;
}
