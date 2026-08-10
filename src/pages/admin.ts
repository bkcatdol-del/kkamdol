import "../styles/main.css";
import { mountChrome } from "../components/layout";
import { isConfigured } from "../lib/supabase";
import { requireAdminKey } from "../components/access-gate";
import { clearAdminKey } from "../lib/admin";
import { adminListCodes, adminAddCode, adminRevokeCode, type CodeRow } from "../lib/api";
import { escapeHTML, formatDate, url, toast, notConfiguredNotice } from "../lib/dom";

async function main() {
  await mountChrome("admin");
  const content = document.getElementById("content")!;
  if (!isConfigured) {
    content.innerHTML = notConfiguredNotice();
    return;
  }

  const key = await requireAdminKey();
  if (!key) {
    content.innerHTML = `<div class="notice">관리자 키가 필요해요. 새로고침 후 다시 시도해 주세요.</div>`;
    return;
  }

  content.innerHTML = `
    <div class="chip on" style="margin-bottom:20px">🛡️ 관리자 잠금 해제됨 <button id="logout">잊기</button></div>

    <div class="glass" style="padding:20px;margin-bottom:20px">
      <h3 style="margin-top:0">삭제 · 숨김</h3>
      <p class="hint">타임라인·갤러리·이벤트·댓글 화면에 <b>[관리자삭제]</b> 버튼이 나타납니다(이 기기에서 관리자 잠금이 해제된 동안).
      바로 그 자리에서 어떤 콘텐츠든 삭제/숨김할 수 있어요.</p>
      <div style="display:flex;gap:10px;margin-top:12px">
        <a class="btn btn--sm" href="${url("index.html")}">타임라인</a>
        <a class="btn btn--sm" href="${url("gallery.html")}">갤러리</a>
      </div>
    </div>

    <div class="glass" style="padding:20px">
      <h3 style="margin-top:0">승인 코드 관리</h3>
      <form id="add-form" style="margin-bottom:18px">
        <div class="field-row">
          <div><label>새 코드</label><input name="code" placeholder="배포할 코드" required /></div>
          <div><label>역할</label><select name="role"><option value="writer">writer(글쓰기)</option><option value="admin">admin(관리자)</option></select></div>
        </div>
        <div class="field-row">
          <div><label>메모</label><input name="label" placeholder="예: 친구들 배치 8월" /></div>
          <div><label>만료일 (선택)</label><input name="expires" type="date" /></div>
        </div>
        <div style="margin-top:14px"><button class="btn btn--primary btn--sm" type="submit">코드 추가</button></div>
      </form>
      <div id="codes"></div>
    </div>`;

  document.getElementById("logout")?.addEventListener("click", () => {
    clearAdminKey();
    location.reload();
  });

  const codesEl = document.getElementById("codes")!;

  async function reloadCodes() {
    const rows = await adminListCodes(key!).catch(() => [] as CodeRow[]);
    if (rows.length === 0) {
      codesEl.innerHTML = `<p class="hint">아직 코드가 없어요.</p>`;
      return;
    }
    codesEl.innerHTML = rows
      .map(
        (c) => `
      <div class="comment" style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <span class="badge">${c.role}</span>
          <b style="margin-left:8px">${escapeHTML(c.label ?? "(메모 없음)")}</b>
          <span class="hint" style="display:inline;margin-left:8px">
            ${c.revoked ? "❌ 회수됨" : "✅ 유효"}${c.expires_at ? ` · ~${formatDate(c.expires_at)}` : ""}
            · 생성 ${formatDate(c.created_at)}
          </span>
        </div>
        ${c.revoked ? "" : `<button class="btn btn--sm btn--danger" data-revoke="${c.id}">회수</button>`}
      </div>`
      )
      .join("");
    codesEl.querySelectorAll("[data-revoke]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = (btn as HTMLElement).dataset.revoke!;
        if (!confirm("이 코드를 회수할까요? 해당 코드로는 더 이상 글을 쓸 수 없어요.")) return;
        const ok = await adminRevokeCode(key!, id).catch(() => false);
        ok ? (toast("회수했어요"), reloadCodes()) : toast("실패", "err");
      })
    );
  }

  const addForm = document.getElementById("add-form") as HTMLFormElement;
  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(addForm);
    const code = String(fd.get("code") ?? "").trim();
    const role = String(fd.get("role") ?? "writer") as "writer" | "admin";
    const label = String(fd.get("label") ?? "").trim();
    const expires = String(fd.get("expires") ?? "");
    if (code.length < 4) return toast("코드는 4자 이상이어야 해요.", "err");
    const expiresAt = expires ? new Date(expires + "T23:59:59").toISOString() : null;
    try {
      await adminAddCode(key!, { code, role, label, expiresAt });
      addForm.reset();
      toast("코드를 추가했어요 💙");
      await reloadCodes();
    } catch {
      toast("추가 실패", "err");
    }
  });

  await reloadCodes();
}

main();
