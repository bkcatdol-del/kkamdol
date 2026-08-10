/** Modal to enter the writer approval code once. Verifies server-side, stores. */
import { verifyCode, storeCode, getStoredCode } from "../lib/access";
import { verifyAdmin, storeAdminKey, getStoredAdminKey } from "../lib/admin";

interface GateOptions {
  title: string;
  desc: string;
  placeholder: string;
  verify: (v: string) => Promise<boolean>;
  onOk: (v: string) => void;
}

function openGate(opts: GateOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal glass" role="dialog" aria-modal="true">
        <h2>${opts.title}</h2>
        <p>${opts.desc}</p>
        <input type="password" autocomplete="off" placeholder="${opts.placeholder}" />
        <div class="err notice" style="display:none;margin-top:12px"></div>
        <div class="row">
          <button class="btn btn--ghost cancel">취소</button>
          <button class="btn btn--primary ok">확인</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const input = backdrop.querySelector("input") as HTMLInputElement;
    const err = backdrop.querySelector(".err") as HTMLElement;
    const okBtn = backdrop.querySelector(".ok") as HTMLButtonElement;
    const cancelBtn = backdrop.querySelector(".cancel") as HTMLButtonElement;
    input.focus();

    const close = (val: string | null) => {
      backdrop.remove();
      resolve(val);
    };

    const submit = async () => {
      const val = input.value.trim();
      if (!val) return;
      okBtn.disabled = true;
      okBtn.textContent = "확인 중…";
      const ok = await opts.verify(val);
      if (ok) {
        opts.onOk(val);
        close(val);
      } else {
        err.textContent = "코드가 올바르지 않거나 만료되었습니다.";
        err.style.display = "block";
        okBtn.disabled = false;
        okBtn.textContent = "확인";
        input.select();
      }
    };

    okBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      if (e.key === "Escape") close(null);
    });
    cancelBtn.addEventListener("click", () => close(null));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(null);
    });
  });
}

/** Returns a valid writer code (from storage or by prompting), or null. */
export async function requireWriterCode(): Promise<string | null> {
  const existing = getStoredCode();
  if (existing) return existing;
  return openGate({
    title: "🖤💙 승인 코드 입력",
    desc: "글쓰기·업로드·댓글은 승인 코드가 필요해요. 이 기기에서는 한 번만 입력하면 됩니다.",
    placeholder: "승인 코드",
    verify: verifyCode,
    onOk: storeCode,
  });
}

/** Returns a valid admin key (from storage or by prompting), or null. */
export async function requireAdminKey(): Promise<string | null> {
  const existing = getStoredAdminKey();
  if (existing) return existing;
  return openGate({
    title: "🛡️ 관리자 키 입력",
    desc: "관리자만 사용하는 화면입니다. 이 기기에서는 한 번만 입력하면 됩니다.",
    placeholder: "관리자 키",
    verify: verifyAdmin,
    onOk: storeAdminKey,
  });
}
