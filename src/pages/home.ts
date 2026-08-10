import "../styles/main.css";
import { mountChrome } from "../components/layout";
import { listEvents, listMedia, type MediaRow } from "../lib/api";
import { isConfigured, mediaUrl } from "../lib/supabase";
import { escapeHTML, escapeMultiline, formatDate, url, notConfiguredNotice } from "../lib/dom";

async function main() {
  await mountChrome("home");
  const content = document.getElementById("content")!;

  if (!isConfigured) {
    content.innerHTML = notConfiguredNotice();
    return;
  }

  try {
    const [events, media] = await Promise.all([listEvents(), listMedia(200)]);
    const byEvent = new Map<string, MediaRow[]>();
    for (const m of media) {
      if (!m.event_id) continue;
      (byEvent.get(m.event_id) ?? byEvent.set(m.event_id, []).get(m.event_id)!).push(m);
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

    const timeline = document.createElement("div");
    timeline.className = "timeline";
    for (const ev of events) {
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
        <h3>${escapeHTML(ev.title)}</h3>
        <div class="meta">
          <span>🗓 ${ev.event_date ? formatDate(ev.event_date) : formatDate(ev.created_at)}</span>
          <span>· ${escapeHTML(ev.author_nick)}</span>
        </div>
        ${ev.body ? `<div class="body">${escapeMultiline(truncate(ev.body, 220))}</div>` : ""}
        ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}`;
      timeline.appendChild(card);
    }
    content.innerHTML = "";
    content.appendChild(timeline);
  } catch (e) {
    content.innerHTML = `<div class="notice">불러오지 못했어요. Supabase 설정을 확인해 주세요.</div>`;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

main();
