import "../styles/main.css";
import { mountChrome } from "../components/layout";
import { createEvent } from "../lib/api";
import { isConfigured } from "../lib/supabase";
import { requireWriterCode } from "../components/access-gate";
import { errorText } from "../components/comments";
import { checkText } from "../lib/validation";
import { url, toast, notConfiguredNotice, getParam } from "../lib/dom";

const HEARTS = ["💙", "🖤", "❤️", "🩷", "💜", "💚", "💛", "🧡", "🤍", "🩵"];

function prefillDate(): string {
  const d = getParam("date") ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

async function main() {
  await mountChrome("new-event");
  const content = document.getElementById("content")!;
  if (!isConfigured) {
    content.innerHTML = notConfiguredNotice();
    return;
  }

  content.innerHTML = `
    <form class="glass" style="padding:24px;max-width:640px">
      <label>제목 *</label>
      <input name="title" maxlength="200" placeholder="무슨 일이 있었나요?" required />
      <div class="field-row">
        <div><label>날짜</label><input name="event_date" type="date" value="${prefillDate()}" /></div>
        <div><label>닉네임 *</label><input name="nick" maxlength="40" placeholder="작성자" required /></div>
      </div>
      <label>하트 <span class="hint" style="display:inline">캘린더에 이 하트로 표시돼요</span></label>
      <div class="heart-pick">
        ${HEARTS.map(
          (h, i) =>
            `<button type="button" class="heart-opt${i === 0 ? " on" : ""}" data-heart="${h}">${h}</button>`
        ).join("")}
      </div>

      <label>내용</label>
      <textarea name="body" maxlength="5000" placeholder="자세한 기록을 남겨보세요" style="min-height:160px"></textarea>
      <label>링크 (선택) <span class="hint" style="display:inline">관련 게시물·페이지 주소</span></label>
      <input name="link" type="url" maxlength="500" placeholder="https://..." />
      <label>비밀번호 * <span class="hint" style="display:inline">나중에 수정·삭제할 때 필요해요</span></label>
      <input name="password" type="password" maxlength="72" placeholder="4자 이상" required />
      <div style="margin-top:20px;display:flex;gap:10px">
        <button class="btn btn--primary" type="submit">기록 남기기</button>
        <a class="btn btn--ghost" href="${url("index.html")}">취소</a>
      </div>
    </form>`;

  const form = content.querySelector("form") as HTMLFormElement;

  // Heart picker selection.
  let heart = HEARTS[0];
  content.querySelectorAll(".heart-opt").forEach((btn) =>
    btn.addEventListener("click", () => {
      heart = (btn as HTMLElement).dataset.heart!;
      content.querySelectorAll(".heart-opt").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
    })
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get("title") ?? "").trim();
    const body = String(fd.get("body") ?? "").trim();
    const nick = String(fd.get("nick") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const eventDate = String(fd.get("event_date") ?? "") || null;
    const link = String(fd.get("link") ?? "").trim();

    const tErr = checkText(title, 1, 200, "제목");
    if (tErr) return toast(tErr, "err");
    if (!nick) return toast("닉네임을 입력해 주세요.", "err");
    if (password.length < 4) return toast("비밀번호는 4자 이상이어야 해요.", "err");

    const code = await requireWriterCode();
    if (!code) return;

    const btn = form.querySelector("button") as HTMLButtonElement;
    btn.disabled = true;
    try {
      const id = await createEvent(code, { title, body, eventDate, nick, password, heart, link });
      document.dispatchEvent(new Event("kkamdol:unlock-changed"));
      toast("기록했어요 💙");
      setTimeout(() => (location.href = url(`event.html?id=${id}`)), 700);
    } catch (err) {
      toast(errorText(err), "err");
      btn.disabled = false;
    }
  });
}

main();
