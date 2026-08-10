import "../styles/main.css";
import { mountChrome } from "../components/layout";
import { createMedia, listEvents } from "../lib/api";
import { isConfigured } from "../lib/supabase";
import { uploadFile } from "../lib/upload";
import { parseEmbed, validateFile } from "../lib/validation";
import { requireWriterCode } from "../components/access-gate";
import { errorText } from "../components/comments";
import { escapeHTML, url, toast, notConfiguredNotice } from "../lib/dom";

async function main() {
  await mountChrome("upload");
  const content = document.getElementById("content")!;
  if (!isConfigured) {
    content.innerHTML = notConfiguredNotice();
    return;
  }

  const events = await listEvents(100).catch(() => []);
  const eventOptions = events
    .map((e) => `<option value="${e.id}">${escapeHTML(e.title)}</option>`)
    .join("");

  content.innerHTML = `
    <form class="glass" style="padding:24px;max-width:640px">
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button type="button" class="btn btn--sm tab tab-file" data-mode="file">📁 파일</button>
        <button type="button" class="btn btn--sm tab tab-embed btn--ghost" data-mode="embed">▶️ 영상 링크</button>
      </div>

      <div class="pane pane-file">
        <label>이미지 · GIF · 영상 파일</label>
        <input name="file" type="file" accept="image/*,video/mp4,video/webm" />
        <div class="hint">이미지 ≤5MB · GIF ≤10MB · 영상 ≤25MB (큰 영상은 링크 권장)</div>
      </div>

      <div class="pane pane-embed" style="display:none">
        <label>유튜브 / 비메오 링크</label>
        <input name="embed" placeholder="https://youtu.be/... 또는 https://vimeo.com/..." />
        <div class="hint">해당 링크만 임베드됩니다.</div>
      </div>

      <label>설명 (선택)</label>
      <input name="caption" maxlength="500" placeholder="한 줄 설명" />

      <label>이벤트에 연결 (선택)</label>
      <select name="event_id"><option value="">연결 안 함</option>${eventOptions}</select>

      <div class="field-row">
        <div><label>닉네임 *</label><input name="nick" maxlength="40" required /></div>
        <div><label>비밀번호 *</label><input name="password" type="password" maxlength="72" placeholder="4자 이상" required /></div>
      </div>

      <div style="margin-top:20px;display:flex;gap:10px">
        <button class="btn btn--primary" type="submit">업로드</button>
        <a class="btn btn--ghost" href="${url("gallery.html")}">갤러리로</a>
      </div>
    </form>`;

  const form = content.querySelector("form") as HTMLFormElement;
  let mode: "file" | "embed" = "file";

  content.querySelectorAll(".tab").forEach((btn) =>
    btn.addEventListener("click", () => {
      mode = (btn as HTMLElement).dataset.mode as "file" | "embed";
      (content.querySelector(".pane-file") as HTMLElement).style.display = mode === "file" ? "" : "none";
      (content.querySelector(".pane-embed") as HTMLElement).style.display = mode === "embed" ? "" : "none";
      content.querySelector(".tab-file")!.classList.toggle("btn--ghost", mode !== "file");
      content.querySelector(".tab-embed")!.classList.toggle("btn--ghost", mode !== "embed");
    })
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const nick = String(fd.get("nick") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const caption = String(fd.get("caption") ?? "").trim();
    const eventId = String(fd.get("event_id") ?? "") || null;
    if (!nick) return toast("닉네임을 입력해 주세요.", "err");
    if (password.length < 4) return toast("비밀번호는 4자 이상이어야 해요.", "err");

    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const embedRaw = String(fd.get("embed") ?? "").trim();

    // Pre-validate before prompting for the code.
    let embedUrl: string | null = null;
    if (mode === "file") {
      if (!fileInput.files?.[0]) return toast("파일을 선택해 주세요.", "err");
      const v = validateFile(fileInput.files[0]);
      if (!v.ok) return toast(v.error, "err");
    } else {
      if (!embedRaw) return toast("링크를 입력해 주세요.", "err");
      embedUrl = parseEmbed(embedRaw);
      if (!embedUrl) return toast("유튜브/비메오 링크만 지원해요.", "err");
    }

    const code = await requireWriterCode();
    if (!code) return;

    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "업로드 중…";
    try {
      if (mode === "file") {
        const up = await uploadFile(fileInput.files![0]);
        await createMedia(code, {
          eventId,
          kind: up.kind,
          storagePath: up.storagePath,
          embedUrl: null,
          mimeType: up.mimeType,
          byteSize: up.byteSize,
          caption,
          nick,
          password,
        });
      } else {
        await createMedia(code, {
          eventId,
          kind: "video_embed",
          storagePath: null,
          embedUrl,
          mimeType: null,
          byteSize: null,
          caption,
          nick,
          password,
        });
      }
      document.dispatchEvent(new Event("kkamdol:unlock-changed"));
      toast("업로드 완료 💙");
      setTimeout(() => (location.href = url("gallery.html")), 700);
    } catch (err) {
      toast(errorText(err), "err");
      btn.disabled = false;
      btn.textContent = "업로드";
    }
  });
}

main();
