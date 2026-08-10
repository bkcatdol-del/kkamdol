import type { MediaRow } from "../lib/api";
import { deleteMedia, adminDelete, reportContent } from "../lib/api";
import { mediaUrl } from "../lib/supabase";
import { escapeHTML, toast } from "../lib/dom";
import { getStoredAdminKey } from "../lib/admin";

const KIND_LABEL: Record<string, string> = {
  image: "이미지",
  gif: "GIF",
  video_file: "영상",
  video_embed: "영상",
};

function frameInner(m: MediaRow): string {
  if (m.kind === "video_embed" && m.embed_url) {
    return `<iframe src="${escapeHTML(m.embed_url)}" loading="lazy" allowfullscreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
  }
  if (m.kind === "video_file" && m.storage_path) {
    return `<video src="${escapeHTML(mediaUrl(m.storage_path))}" controls preload="metadata"></video>`;
  }
  if (m.storage_path) {
    return `<img src="${escapeHTML(mediaUrl(m.storage_path))}" alt="${escapeHTML(m.caption ?? "")}" loading="lazy" />`;
  }
  return "";
}

export function renderMediaCard(m: MediaRow): HTMLElement {
  const card = document.createElement("article");
  card.className = "media-card glass";
  const isAdmin = Boolean(getStoredAdminKey());
  card.innerHTML = `
    <div class="frame">${frameInner(m)}</div>
    <div class="cap">
      <span>${escapeHTML(m.caption ?? "")} <span class="hint" style="display:inline">· ${escapeHTML(m.author_nick)}</span></span>
      <span class="badge">${KIND_LABEL[m.kind] ?? ""}</span>
    </div>
    <div class="actions" style="padding:0 12px 12px;display:flex;gap:10px">
      <button data-act="report" style="background:none;border:0;color:var(--text-faint);font-size:12px;cursor:pointer;padding:0">신고</button>
      <button data-act="del" style="background:none;border:0;color:var(--text-faint);font-size:12px;cursor:pointer;padding:0">삭제</button>
      ${isAdmin ? `<button data-act="admin-del" style="background:none;border:0;color:var(--danger);font-size:12px;cursor:pointer;padding:0">관리자삭제</button>` : ""}
    </div>`;

  if ((m.kind === "image" || m.kind === "gif") && m.storage_path) {
    const img = card.querySelector(".frame img") as HTMLImageElement | null;
    if (img) {
      img.style.cursor = "zoom-in";
      img.addEventListener("click", () => openLightbox(mediaUrl(m.storage_path!)));
    }
  }

  card.querySelector('[data-act="report"]')?.addEventListener("click", async () => {
    await reportContent("media", m.id).catch(() => {});
    toast("신고 접수됐어요.");
  });
  card.querySelector('[data-act="del"]')?.addEventListener("click", async () => {
    const pw = prompt("이 미디어의 비밀번호를 입력하세요");
    if (!pw) return;
    const ok = await deleteMedia(m.id, pw).catch(() => false);
    ok ? (toast("삭제했어요"), card.remove()) : toast("비밀번호가 일치하지 않아요.", "err");
  });
  card.querySelector('[data-act="admin-del"]')?.addEventListener("click", async () => {
    const key = getStoredAdminKey();
    if (!key || !confirm("관리자 권한으로 삭제할까요?")) return;
    const ok = await adminDelete(key, "media", m.id).catch(() => false);
    ok ? (toast("관리자 삭제 완료"), card.remove()) : toast("삭제 실패", "err");
  });

  return card;
}

export function openLightbox(src: string): void {
  const box = document.createElement("div");
  box.className = "lightbox";
  box.innerHTML = `<img src="${escapeHTML(src)}" alt="" />`;
  box.addEventListener("click", () => box.remove());
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") {
      box.remove();
      document.removeEventListener("keydown", esc);
    }
  });
  document.body.appendChild(box);
}
