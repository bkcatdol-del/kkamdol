import "../styles/main.css";
import { mountChrome } from "../components/layout";
import { getEvent, listMediaForEvent, deleteEvent, updateEvent, adminDelete, reportContent } from "../lib/api";
import { isConfigured } from "../lib/supabase";
import { renderMediaCard } from "../components/media-card";
import { mountComments } from "../components/comments";
import { getStoredAdminKey } from "../lib/admin";
import { escapeHTML, escapeMultiline, formatDate, getParam, url, toast, notConfiguredNotice } from "../lib/dom";

async function main() {
  await mountChrome("home");
  const content = document.getElementById("content")!;

  if (!isConfigured) {
    content.innerHTML = notConfiguredNotice();
    return;
  }

  const id = getParam("id");
  if (!id) {
    content.innerHTML = `<div class="notice">잘못된 주소예요.</div>`;
    return;
  }

  const ev = await getEvent(id).catch(() => null);
  if (!ev) {
    content.innerHTML = `<div class="empty"><div class="big">🖤</div><p>이벤트를 찾을 수 없어요.</p>
      <p style="margin-top:16px"><a class="btn" href="${url("index.html")}">타임라인으로</a></p></div>`;
    return;
  }

  const media = await listMediaForEvent(id).catch(() => []);
  const isAdmin = Boolean(getStoredAdminKey());

  content.innerHTML = `
    <article class="glass" style="padding:26px">
      <a href="${url("index.html")}" style="font-size:13px">← 타임라인</a>
      <h1 class="page-title" style="margin-top:10px">${escapeHTML(ev.heart || "💙")} ${escapeHTML(ev.title)}</h1>
      <div class="meta" style="display:flex;gap:10px;color:var(--text-faint);font-size:14px;margin-bottom:16px">
        <span>🗓 ${ev.event_date ? formatDate(ev.event_date) : formatDate(ev.created_at)}</span>
        <span>· ${escapeHTML(ev.author_nick)}</span>
      </div>
      ${ev.body ? `<div class="body">${escapeMultiline(ev.body)}</div>` : ""}
      ${
        ev.link_url && /^https?:\/\//i.test(ev.link_url)
          ? `<div style="margin-top:16px"><a class="btn btn--sm" href="${escapeHTML(ev.link_url)}" target="_blank" rel="noopener noreferrer">🔗 링크 열기 ↗</a></div>`
          : ""
      }
      <div id="ev-media" class="grid" style="margin-top:22px"></div>
      <div class="actions" style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn btn--sm" href="${url(`upload.html?event=${ev.id}`)}">🖼 이미지 추가</a>
        <button class="btn btn--sm" id="ev-edit">수정(작성자)</button>
        <button class="btn btn--sm" id="ev-report">신고</button>
        <button class="btn btn--sm btn--danger" id="ev-del">삭제(작성자)</button>
        ${isAdmin ? `<button class="btn btn--sm btn--danger" id="ev-admin-del">관리자 삭제</button>` : ""}
      </div>
    </article>
    <section class="section glass" style="padding:22px;margin-top:22px" id="comments"></section>`;

  const mediaWrap = document.getElementById("ev-media")!;
  for (const m of media) mediaWrap.appendChild(renderMediaCard(m));

  document.getElementById("ev-edit")?.addEventListener("click", renderEditForm);

  function renderEditForm() {
    if (!ev) return;
    let heart = ev.heart || "💙";
    content.innerHTML = `
      <form class="glass" style="padding:24px;max-width:640px">
        <a href="#" id="edit-cancel-top" style="font-size:13px">← 취소</a>
        <h1 class="page-title" style="margin-top:10px">글 수정</h1>
        <label>제목 *</label>
        <input name="title" maxlength="200" value="${escapeHTML(ev.title)}" required />
        <div class="field-row">
          <div><label>날짜</label><input name="event_date" type="date" value="${ev.event_date ?? ""}" /></div>
          <div><label>하트</label>
            <div class="heart-pick">
              ${["🖤", "💙"]
                .map(
                  (h) =>
                    `<button type="button" class="heart-opt${h === (ev.heart || "💙") ? " on" : ""}" data-heart="${h}">${h}</button>`
                )
                .join("")}
            </div>
          </div>
        </div>
        <label>내용</label>
        <textarea name="body" maxlength="5000" style="min-height:160px">${escapeHTML(ev.body ?? "")}</textarea>
        <label>링크 (선택)</label>
        <input name="link" type="url" maxlength="500" value="${escapeHTML(ev.link_url ?? "")}" placeholder="https://..." />
        <label>비밀번호 * <span class="hint" style="display:inline">작성 시 정한 비번</span></label>
        <input name="password" type="password" maxlength="72" required />
        <div style="margin-top:20px;display:flex;gap:10px">
          <button class="btn btn--primary" type="submit">저장</button>
          <button class="btn btn--ghost" type="button" id="edit-cancel">취소</button>
        </div>
      </form>`;

    const form = content.querySelector("form") as HTMLFormElement;
    content.querySelectorAll(".heart-opt").forEach((btn) =>
      btn.addEventListener("click", () => {
        heart = (btn as HTMLElement).dataset.heart!;
        content.querySelectorAll(".heart-opt").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
      })
    );
    const cancel = (e?: Event) => {
      e?.preventDefault();
      location.reload();
    };
    document.getElementById("edit-cancel")?.addEventListener("click", cancel);
    document.getElementById("edit-cancel-top")?.addEventListener("click", cancel);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const title = String(fd.get("title") ?? "").trim();
      const body = String(fd.get("body") ?? "").trim();
      const eventDate = String(fd.get("event_date") ?? "") || null;
      const link = String(fd.get("link") ?? "").trim();
      const pw = String(fd.get("password") ?? "");
      if (!title) return toast("제목을 입력해 주세요.", "err");
      if (!pw) return toast("비밀번호를 입력해 주세요.", "err");
      const ok = await updateEvent(ev.id, pw, { title, body, eventDate, heart, link }).catch(() => false);
      if (ok) {
        toast("수정했어요");
        setTimeout(() => location.reload(), 600);
      } else toast("비밀번호가 일치하지 않아요.", "err");
    });
  }

  document.getElementById("ev-report")?.addEventListener("click", async () => {
    await reportContent("event", ev.id).catch(() => {});
    toast("신고 접수됐어요.");
  });

  document.getElementById("ev-del")?.addEventListener("click", async () => {
    const pw = prompt("이 이벤트의 비밀번호를 입력하세요");
    if (!pw) return;
    const ok = await deleteEvent(ev.id, pw).catch(() => false);
    if (ok) {
      toast("삭제했어요");
      setTimeout(() => (location.href = url("index.html")), 800);
    } else toast("비밀번호가 일치하지 않아요.", "err");
  });

  document.getElementById("ev-admin-del")?.addEventListener("click", async () => {
    const key = getStoredAdminKey();
    if (!key || !confirm("관리자 권한으로 이 이벤트를 삭제할까요?")) return;
    const ok = await adminDelete(key, "event", ev.id).catch(() => false);
    if (ok) {
      toast("관리자 삭제 완료");
      setTimeout(() => (location.href = url("index.html")), 800);
    } else toast("삭제 실패", "err");
  });

  await mountComments(document.getElementById("comments") as HTMLElement, { eventId: ev.id });
}

main();
