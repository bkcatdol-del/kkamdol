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

  const events = await listEvents(2000).catch(() => []);
  events.sort((a, b) => (b.event_date ?? b.created_at).localeCompare(a.event_date ?? a.created_at));

  // Prefill event from ?event= (e.g. linked from an event page).
  const preId = new URLSearchParams(location.search).get("event");

  content.innerHTML = `
    <form class="glass" style="padding:24px;max-width:640px">
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button type="button" class="btn btn--sm tab tab-file" data-mode="file">📁 파일</button>
        <button type="button" class="btn btn--sm tab tab-embed btn--ghost" data-mode="embed">▶️ 영상 링크</button>
      </div>

      <div class="pane pane-file">
        <label>이미지 · GIF · 영상 파일 <span class="hint" style="display:inline">여러 장 한 번에 선택 가능</span></label>
        <input name="file" type="file" accept="image/*,video/mp4,video/webm" multiple />
        <div class="hint">이미지 ≤5MB · GIF ≤10MB · 영상 ≤25MB (큰 영상은 링크 권장) · 여러 개 선택 시 한꺼번에 업로드</div>
      </div>

      <div class="pane pane-embed" style="display:none">
        <label>유튜브 / 비메오 링크</label>
        <input name="embed" placeholder="https://youtu.be/... 또는 https://vimeo.com/..." />
        <div class="hint">해당 링크만 임베드됩니다.</div>
      </div>

      <label>설명 (선택)</label>
      <input name="caption" maxlength="500" placeholder="한 줄 설명" />

      <label>이벤트에 연결 <span class="hint" style="display:inline">날짜·제목으로 검색해서 선택</span></label>
      <div style="position:relative">
        <input id="ev-q" autocomplete="off" placeholder="예: 2023-06-12 또는 인터뷰" />
        <div id="ev-list" class="glass" style="position:absolute;z-index:40;left:0;right:0;top:100%;margin-top:4px;max-height:240px;overflow:auto;display:none;padding:6px"></div>
      </div>
      <div id="ev-selected" class="hint" style="margin-top:6px"></div>

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

  // Searchable event picker (connect media to the right event).
  let selectedEventId: string | null = null;
  const evq = content.querySelector("#ev-q") as HTMLInputElement;
  const evlist = content.querySelector("#ev-list") as HTMLElement;
  const evsel = content.querySelector("#ev-selected") as HTMLElement;

  function labelFor(e: { event_date: string | null; title: string }): string {
    return `${e.event_date ?? ""} · ${e.title}`.trim();
  }
  function pick(id: string) {
    const e = events.find((x) => x.id === id);
    if (!e) return;
    selectedEventId = id;
    evq.value = labelFor(e);
    evsel.textContent = "✅ 연결됨: " + labelFor(e);
    evlist.style.display = "none";
  }
  function renderEvList() {
    const q = evq.value.trim().toLowerCase();
    const hits = events
      .filter((e) => labelFor(e).toLowerCase().includes(q))
      .slice(0, 60);
    evlist.innerHTML = hits.length
      ? hits
          .map(
            (e) =>
              `<button type="button" class="ev-opt" data-id="${e.id}" style="display:block;width:100%;text-align:left;background:none;border:0;color:var(--text);padding:7px 8px;border-radius:8px;cursor:pointer;font:inherit;font-size:13px">${escapeHTML(labelFor(e))}</button>`
          )
          .join("")
      : `<div class="hint" style="padding:6px">결과 없음</div>`;
    evlist.style.display = "block";
    evlist.querySelectorAll(".ev-opt").forEach((b) =>
      b.addEventListener("click", () => pick((b as HTMLElement).dataset.id!))
    );
  }
  evq.addEventListener("focus", renderEvList);
  evq.addEventListener("input", () => {
    selectedEventId = null;
    evsel.textContent = "";
    renderEvList();
  });
  document.addEventListener("click", (e) => {
    if (!evlist.contains(e.target as Node) && e.target !== evq) evlist.style.display = "none";
  });
  if (preId && events.some((e) => e.id === preId)) pick(preId);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const nick = String(fd.get("nick") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const caption = String(fd.get("caption") ?? "").trim();
    const eventId = selectedEventId;
    if (!nick) return toast("닉네임을 입력해 주세요.", "err");
    if (password.length < 4) return toast("비밀번호는 4자 이상이어야 해요.", "err");

    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const embedRaw = String(fd.get("embed") ?? "").trim();

    // Pre-validate before prompting for the code.
    let embedUrl: string | null = null;
    const files = mode === "file" ? Array.from(fileInput.files ?? []) : [];
    if (mode === "file") {
      if (!files.length) return toast("파일을 선택해 주세요.", "err");
      for (const f of files) {
        const v = validateFile(f);
        if (!v.ok) return toast(`${f.name}: ${v.error}`, "err");
      }
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
        let done = 0;
        for (const f of files) {
          btn.textContent = `업로드 중… ${done + 1}/${files.length}`;
          const up = await uploadFile(f);
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
          done++;
        }
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
      toast(mode === "file" && files.length > 1 ? `${files.length}장 업로드 완료 💙` : "업로드 완료 💙");
      setTimeout(() => (location.href = url("gallery.html")), 700);
    } catch (err) {
      toast(errorText(err), "err");
      btn.disabled = false;
      btn.textContent = "업로드";
    }
  });
}

main();
