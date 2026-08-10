import "../styles/main.css";
import { mountChrome } from "../components/layout";
import { listEvents, type EventRow } from "../lib/api";
import { isConfigured } from "../lib/supabase";
import { escapeHTML, url, notConfiguredNotice } from "../lib/dom";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** The date bucket for an event: its event_date, else the created day. */
function dateKey(ev: EventRow): string {
  if (ev.event_date) return ev.event_date;
  return ev.created_at.slice(0, 10);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

async function main() {
  await mountChrome("calendar");
  const content = document.getElementById("content")!;
  if (!isConfigured) {
    content.innerHTML = notConfiguredNotice();
    return;
  }

  const events = await listEvents(1000).catch(() => [] as EventRow[]);
  const byDay = new Map<string, EventRow[]>();
  for (const ev of events) {
    const k = dateKey(ev);
    const arr = byDay.get(k);
    if (arr) arr.push(ev);
    else byDay.set(k, [ev]);
  }

  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth(); // 0-based
  let selected: string | null = null;

  content.innerHTML = `
    <div class="glass" style="padding:20px">
      <div class="cal-head">
        <button class="btn btn--sm" id="prev">‹</button>
        <div class="cal-title" id="cal-title"></div>
        <button class="btn btn--sm" id="next">›</button>
      </div>
      <div class="cal-weekdays">${WEEKDAYS.map((w) => `<span>${w}</span>`).join("")}</div>
      <div class="cal-grid" id="cal-grid"></div>
    </div>
    <div id="day-panel" class="section" style="margin-top:20px"></div>`;

  const titleEl = content.querySelector("#cal-title") as HTMLElement;
  const gridEl = content.querySelector("#cal-grid") as HTMLElement;
  const panelEl = content.querySelector("#day-panel") as HTMLElement;

  function renderDayPanel() {
    if (!selected) {
      panelEl.innerHTML = "";
      return;
    }
    const rows = byDay.get(selected) ?? [];
    const [y, m, d] = selected.split("-");
    const list = rows.length
      ? rows
          .map(
            (ev) => `
        <a class="event-card glass" style="display:block;color:inherit;padding:14px 16px"
           href="${url(`event.html?id=${ev.id}`)}">
          <h3 style="margin:0 0 4px;font-size:16px">${escapeHTML(ev.heart || "💙")} ${escapeHTML(ev.title)}</h3>
          <div class="meta" style="color:var(--text-faint);font-size:13px">${escapeHTML(ev.author_nick)} · 눌러서 기록 보기 →</div>
        </a>`
          )
          .join("")
      : `<p class="hint">이 날의 기록이 아직 없어요.</p>`;

    panelEl.innerHTML = `
      <div class="glass" style="padding:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h2 style="margin:0;font-size:18px">🗓 ${y}년 ${Number(m)}월 ${Number(d)}일</h2>
          <a class="btn btn--sm btn--primary" href="${url(`new-event.html?date=${selected}`)}">이 날 기록 추가</a>
        </div>
        <div class="timeline">${list}</div>
      </div>`;
  }

  function renderGrid() {
    titleEl.textContent = `${year}년 ${month + 1}월`;
    const first = new Date(year, month, 1);
    const startPad = first.getDay(); // 0 Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    const cells: string[] = [];
    for (let i = 0; i < startPad; i++) cells.push(`<div class="cal-cell empty-cell"></div>`);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${pad(month + 1)}-${pad(d)}`;
      const evs = byDay.get(key) ?? [];
      const count = evs.length;
      const hearts = evs.slice(0, 3).map((e) => e.heart || "💙").join("");
      const cls = [
        "cal-cell",
        count ? "has" : "",
        key === todayKey ? "today" : "",
        key === selected ? "sel" : "",
      ]
        .filter(Boolean)
        .join(" ");
      cells.push(`
        <button class="${cls}" data-key="${key}">
          <span class="d">${d}</span>
          ${count ? `<span class="dot" title="${count}건">${count > 3 ? `${hearts}+${count - 3}` : hearts}</span>` : ""}
        </button>`);
    }
    gridEl.innerHTML = cells.join("");
    gridEl.querySelectorAll(".cal-cell[data-key]").forEach((btn) =>
      btn.addEventListener("click", () => {
        selected = (btn as HTMLElement).dataset.key!;
        renderGrid();
        renderDayPanel();
      })
    );
  }

  content.querySelector("#prev")!.addEventListener("click", () => {
    month--;
    if (month < 0) {
      month = 11;
      year--;
    }
    renderGrid();
  });
  content.querySelector("#next")!.addEventListener("click", () => {
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
    renderGrid();
  });

  renderGrid();
}

main();
