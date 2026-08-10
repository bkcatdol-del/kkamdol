/** Shared header/footer chrome + magic-link capture + unlock chip. */
import { url } from "../lib/dom";
import { captureMagicLink, isUnlocked, clearCode } from "../lib/access";
import { captureAdminMagicLink } from "../lib/admin";

const LOGO = `${url("logo.svg")}`;

function headerHTML(active: string): string {
  const link = (href: string, label: string, key: string, cls = "") =>
    `<a class="${cls} ${active === key ? "active" : ""}" href="${url(href)}">${label}</a>`;
  return `
    <div class="bar">
      <a class="brand" href="${url("index.html")}">
        <img class="logo" src="${LOGO}" alt="" />
        <span class="ko">깜돌</span><span class="en">kkamdol</span>
      </a>
      <nav class="nav">
        ${link("index.html", "타임라인", "home")}
        ${link("calendar.html", "캘린더", "calendar")}
        ${link("gallery.html", "갤러리", "gallery")}
        ${link("new-event.html", "기록하기", "new-event")}
        ${link("upload.html", "업로드", "upload", "cta")}
      </nav>
    </div>`;
}

function footerHTML(): string {
  return `
    <div class="container">
      <div class="hearts">🖤💙</div>
      <div>깜돌 <b>kkamdol</b> 아카이브 — 함께 남기는 기록</div>
      <div style="margin-top:6px"><a href="${url("admin.html")}">관리자</a></div>
    </div>`;
}

function renderUnlockChip(): void {
  const host = document.getElementById("unlock-chip");
  if (!host) return;
  if (isUnlocked()) {
    host.innerHTML = `<span class="chip on">✍️ 쓰기 잠금 해제됨 <button type="button">잊기</button></span>`;
    host.querySelector("button")?.addEventListener("click", () => {
      clearCode();
      renderUnlockChip();
    });
  } else {
    host.innerHTML = `<span class="chip">🔒 보기 전용 · 쓰려면 승인 코드 필요</span>`;
  }
}

export async function mountChrome(active: string): Promise<void> {
  await captureMagicLink();
  await captureAdminMagicLink();

  const header = document.getElementById("site-header");
  if (header) header.innerHTML = headerHTML(active);
  const footer = document.getElementById("site-footer");
  if (footer) footer.innerHTML = footerHTML();

  renderUnlockChip();
  document.addEventListener("kkamdol:unlock-changed", renderUnlockChip);
}
