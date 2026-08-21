import "../styles/main.css";
import { mountChrome } from "../components/layout";
import { listEvents, listMedia, type EventRow, type MediaRow } from "../lib/api";
import { isConfigured, mediaUrl } from "../lib/supabase";
import { escapeHTML, escapeMultiline, formatDate, url, notConfiguredNotice } from "../lib/dom";

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function matches(ev: EventRow, terms: string[]): boolean {
  if (!terms.length) return true;
  const hay = `${ev.title} ${ev.body ?? ""} ${ev.author_nick}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

async function main() {
  await mountChrome("home");
  const content = document.getElementById("content")!;
  if (!isConfigured) {
    content.innerHTML = notConfiguredNotice();
    return;
  }

  let events: EventRow[] = [];
  let byEvent = new Map<string, MediaRow[]>();
  try {
    const [evs, media] = await Promise.all([listEvents(2000), listMedia(500)]);
    events = evs;
    for (const m of media) {
      if (!m.event_id) continue;
      const arr = byEvent.get(m.event_id);
      if (arr) arr.push(m);
      else byEvent.set(m.event_id, [m]);
    }
  } catch {
    content.innerHTML = `<div class="notice">불러오지 못했어요.</div>`;
    return;
  }

  if (events.length === 0) {
    content.innerHTML = `
      <div class="empty">
        <div class="big">🖤💙</div>
        <p>아직 기록이 없어요. 첫 이벤트를 남겨보세요.</p>
        <p style="margin-top:16px"><a class="btn btn--primary" href="${url("new-event.html")}">기록하기</a></p>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div style="margin-bottom:16px">
      <input id="tl-search" type="search" placeholder="🔍 제목·내용·유형·작성자 검색 (예: 라방, 하민, weverse)" />
      <div class="hint" id="tl-count" style="margin-top:6px"></div>
    </div>
    <div class="timeline" id="tl-list"></div>`;

  const search = content.querySelector("#tl-search") as HTMLInputElement;
  const list = content.querySelector("#tl-list") as HTMLElement;
  const countEl = content.querySelector("#tl-count") as HTMLElement;

  function render() {
    const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = events.filter((ev) => matches(ev, terms));
    countEl.textContent = terms.length
      ? `${filtered.length}건 / 전체 ${events.length}건`
      : `전체 ${events.length}건`;
    list.innerHTML = "";
    if (filtered.length === 0) {
      list.innerHTML = `<p class="hint">검색 결과가 없어요.</p>`;
      return;
    }
    for (const ev of filtered) {
      const thumbs = (byEvent.get(ev.id) ?? [])
        .filter((m) => m.storage_path && (m.kind === "image" || m.kind === "gif"))
        .slice(0, 5)
        .map((m) => `<img src="${escapeHTML(mediaUrl(m.storage_path!))}" alt="" loading="lazy" />`)
        .join("");
      const card = document.createElement("a");
      card.className = "event-card glass";
      card.href = url(`event.html?id=${ev.id}`);
      card.style.display = "block";
      card.style.color = "inherit";
      card.innerHTML = `
        <h3>${escapeHTML(ev.heart || "💙")} ${escapeHTML(ev.title)}</h3>
        <div class="meta">
          <span>🗓 ${ev.event_date ? formatDate(ev.event_date) : formatDate(ev.created_at)}</span>
          <span>· ${escapeHTML(ev.author_nick)}</span>
        </div>
        ${ev.body ? `<div class="body">${escapeMultiline(truncate(ev.body, 220))}</div>` : ""}
        ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}`;
      list.appendChild(card);
    }
  }

  let t: number | undefined;
  search.addEventListener("input", () => {
    clearTimeout(t);
    t = window.setTimeout(render, 120);
  });
  render();
}

main();
