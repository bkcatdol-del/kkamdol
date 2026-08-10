import {
  listComments,
  createComment,
  deleteComment,
  updateComment,
  reportContent,
  adminDelete,
  type CommentRow,
} from "../lib/api";
import { escapeMultiline, escapeHTML, formatDateTime, toast } from "../lib/dom";
import { checkText } from "../lib/validation";
import { requireWriterCode } from "./access-gate";
import { getStoredAdminKey } from "../lib/admin";

type Target = { eventId?: string; mediaId?: string };

export async function mountComments(container: HTMLElement, target: Target): Promise<void> {
  container.innerHTML = `
    <h3 style="margin-bottom:12px">댓글</h3>
    <div class="comments-list section"></div>
    <form class="comment-form glass" style="padding:16px">
      <div class="field-row">
        <div><label>닉네임</label><input name="nick" maxlength="40" placeholder="닉네임" required /></div>
        <div><label>비밀번호</label><input name="password" type="password" maxlength="72"
              placeholder="수정·삭제용 비번" required /></div>
      </div>
      <label>댓글</label>
      <textarea name="body" maxlength="2000" placeholder="댓글을 남겨보세요" required></textarea>
      <div style="margin-top:12px;text-align:right">
        <button class="btn btn--primary" type="submit">댓글 남기기</button>
      </div>
    </form>`;

  const listEl = container.querySelector(".comments-list") as HTMLElement;
  const form = container.querySelector(".comment-form") as HTMLFormElement;

  async function reload() {
    const rows = await listComments(target).catch(() => [] as CommentRow[]);
    if (rows.length === 0) {
      listEl.innerHTML = `<p class="hint">🖤 아직 댓글이 없어요. 첫 댓글을 남겨보세요 💙</p>`;
      return;
    }
    listEl.innerHTML = "";
    for (const c of rows) listEl.appendChild(renderComment(c, reload));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const nick = String(fd.get("nick") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const body = String(fd.get("body") ?? "").trim();

    const bodyErr = checkText(body, 1, 2000, "댓글");
    if (bodyErr) return toast(bodyErr, "err");
    if (password.length < 4) return toast("비밀번호는 4자 이상이어야 해요.", "err");

    const code = await requireWriterCode();
    if (!code) return;

    const btn = form.querySelector("button") as HTMLButtonElement;
    btn.disabled = true;
    try {
      await createComment(code, { ...target, nick, password, body });
      (form.elements.namedItem("body") as HTMLTextAreaElement).value = "";
      toast("댓글을 남겼어요 💙");
      document.dispatchEvent(new Event("kkamdol:unlock-changed"));
      await reload();
    } catch (err: any) {
      toast(errorText(err), "err");
    } finally {
      btn.disabled = false;
    }
  });

  await reload();
}

function renderComment(c: CommentRow, reload: () => Promise<void>): HTMLElement {
  const el = document.createElement("div");
  el.className = "comment";
  const isAdmin = Boolean(getStoredAdminKey());
  el.innerHTML = `
    <div class="top">
      <span class="nick">${escapeHTML(c.author_nick)}</span>
      <span class="when">${formatDateTime(c.created_at)}</span>
    </div>
    <div class="text">${escapeMultiline(c.body)}</div>
    <div class="actions">
      <button data-act="edit">수정</button>
      <button data-act="del">삭제</button>
      <button data-act="report">신고</button>
      ${isAdmin ? `<button data-act="admin-del" style="color:var(--danger)">관리자 삭제</button>` : ""}
    </div>`;

  el.querySelector('[data-act="edit"]')?.addEventListener("click", () => {
    el.innerHTML = `
      <div class="top"><span class="nick">${escapeHTML(c.author_nick)}</span></div>
      <textarea class="edit-body" maxlength="2000" style="margin-top:8px">${escapeHTML(c.body)}</textarea>
      <div class="field-row" style="margin-top:8px">
        <input class="edit-pw" type="password" maxlength="72" placeholder="비밀번호" />
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn--sm btn--primary edit-save" type="button">저장</button>
          <button class="btn btn--sm btn--ghost edit-cancel" type="button">취소</button>
        </div>
      </div>`;
    (el.querySelector(".edit-body") as HTMLTextAreaElement).focus();
    el.querySelector(".edit-cancel")?.addEventListener("click", reload);
    el.querySelector(".edit-save")?.addEventListener("click", async () => {
      const next = (el.querySelector(".edit-body") as HTMLTextAreaElement).value.trim();
      const pw = (el.querySelector(".edit-pw") as HTMLInputElement).value;
      if (!next) return toast("내용을 입력해 주세요.", "err");
      if (!pw) return toast("비밀번호를 입력해 주세요.", "err");
      const ok = await updateComment(c.id, pw, next).catch(() => false);
      ok ? (toast("수정했어요"), reload()) : toast("비밀번호가 일치하지 않아요.", "err");
    });
  });

  el.querySelector('[data-act="del"]')?.addEventListener("click", async () => {
    const pw = prompt("이 댓글의 비밀번호를 입력하세요");
    if (!pw) return;
    const ok = await deleteComment(c.id, pw).catch(() => false);
    ok ? (toast("삭제했어요"), reload()) : toast("비밀번호가 일치하지 않아요.", "err");
  });

  el.querySelector('[data-act="report"]')?.addEventListener("click", async () => {
    await reportContent("comment", c.id).catch(() => {});
    toast("신고 접수됐어요. 감사합니다.");
  });

  el.querySelector('[data-act="admin-del"]')?.addEventListener("click", async () => {
    const key = getStoredAdminKey();
    if (!key) return;
    if (!confirm("관리자 권한으로 이 댓글을 삭제할까요?")) return;
    const ok = await adminDelete(key, "comment", c.id).catch(() => false);
    ok ? (toast("관리자 삭제 완료"), reload()) : toast("삭제 실패", "err");
  });

  return el;
}

export function errorText(err: any): string {
  const msg = String(err?.message ?? err ?? "");
  if (msg.includes("invalid_access_code")) return "승인 코드가 올바르지 않아요.";
  if (msg.includes("weak_password")) return "비밀번호는 4자 이상이어야 해요.";
  if (msg.includes("unauthorized")) return "권한이 없어요.";
  return "문제가 발생했어요. 잠시 후 다시 시도해 주세요.";
}
