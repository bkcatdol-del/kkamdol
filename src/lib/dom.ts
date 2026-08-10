/** Small DOM + string helpers (no framework). */

/** Escape user text before inserting as HTML. Always use this for user input. */
export function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape and convert newlines to <br> for multi-line user text. */
export function escapeMultiline(s: string): string {
  return escapeHTML(s).replace(/\n/g, "<br>");
}

export function $(sel: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector(sel);
}

export function getParam(name: string): string | null {
  return new URLSearchParams(location.search).get(name);
}

/** Human-friendly relative-ish date (Korean). */
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Build the base-aware href for internal links (respects Vite base path). */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}

export function notConfiguredNotice(): string {
  return `
    <div class="notice">
      <b>Supabase가 아직 연결되지 않았어요.</b><br />
      <code>.env</code> 에 <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> 를 넣고,
      <code>supabase/README.md</code> 의 설정 단계를 따라주세요.
    </div>`;
}

export function toast(message: string, kind: "ok" | "err" = "ok"): void {
  const t = document.createElement("div");
  t.className = `toast toast--${kind}`;
  t.textContent = message;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("toast--show"));
  setTimeout(() => {
    t.classList.remove("toast--show");
    setTimeout(() => t.remove(), 300);
  }, 3200);
}
