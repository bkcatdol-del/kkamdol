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
        <button class="btn btn--sm" id="ev-edit">수정(작성자)</button>
        <button class="btn btn--sm" id="ev-report">신고</button>
        <button class="btn btn--sm btn--danger" id="ev-del">삭제(작성자)</button>
        ${isAdmin ? `<button class="btn btn--sm btn--danger" id="ev-admin-del">관리자 삭제</button>` : ""}
      </div>
    </article>
    <section class="section glass" style="padding:22px;margin-top:22px" id="comments"></section>`;

  const mediaWrap = document.getElementById("ev-media")!;
  for (const m of media) mediaWrap.appendChild(renderMediaCard(m));

  document.getElementById("ev-edit")?.addEventListener("click", async () => {
    const title = prompt("제목 수정", ev.title);
    if (title === null) return;
    const body = prompt("내용 수정", ev.body ?? "");
    if (body === null) return;
    const pw = prompt("이 이벤트의 비밀번호를 입력하세요");
    if (!pw) return;
    const ok = await updateEvent(ev.id, pw, {
      title: title.trim(),
      body: body.trim(),
      eventDate: ev.event_date,
    }).catch(() => false);
    if (ok) {
      toast("수정했어요");
      setTimeout(() => location.reload(), 600);
    } else toast("비밀번호가 일치하지 않아요.", "err");
  });

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
