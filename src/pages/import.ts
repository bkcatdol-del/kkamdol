import "../styles/main.css";
import * as XLSX from "xlsx";
import { mountChrome } from "../components/layout";
import { isConfigured } from "../lib/supabase";
import { createEventsBulk, type BulkRow } from "../lib/api";
import { requireWriterCode } from "../components/access-gate";
import { errorText } from "../components/comments";
import { escapeHTML, url, toast, notConfiguredNotice } from "../lib/dom";

// Accepted header names (Korean / English), matched case-insensitively.
const FIELD_KEYS: Record<keyof Omit<BulkRow, never>, string[]> = {
  title: ["제목", "title", "타이틀"],
  event_date: ["날짜", "일자", "date", "event_date"],
  body: ["내용", "본문", "설명", "body", "desc", "description"],
  heart: ["하트", "색", "heart", "color"],
  link: ["링크", "주소", "link", "url"],
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function normDate(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date && !isNaN(v.getTime())) return toYMD(v);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  if (/^\d{5,6}$/.test(s)) {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return toYMD(d);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : toYMD(d);
}

function normHeart(v: unknown): string {
  const s = String(v ?? "").trim();
  if (s.includes("🖤") || /검|블랙|black/i.test(s)) return "🖤";
  if (s.includes("💙") || /파|블루|blue/i.test(s)) return "💙";
  return "💙";
}

function pickHeaders(headers: string[]): Partial<Record<keyof BulkRow, string>> {
  const map: Partial<Record<keyof BulkRow, string>> = {};
  for (const field of Object.keys(FIELD_KEYS) as (keyof BulkRow)[]) {
    const keys = FIELD_KEYS[field].map((k) => k.toLowerCase());
    const found = headers.find((h) => keys.includes(String(h).trim().toLowerCase()));
    if (found) map[field] = found;
  }
  return map;
}

function parseRows(raw: Record<string, unknown>[]): BulkRow[] {
  if (!raw.length) return [];
  const cols = pickHeaders(Object.keys(raw[0]));
  return raw.map((r) => ({
    title: String(cols.title ? r[cols.title] ?? "" : "").trim(),
    body: String(cols.body ? r[cols.body] ?? "" : "").trim(),
    event_date: normDate(cols.event_date ? r[cols.event_date] : ""),
    heart: normHeart(cols.heart ? r[cols.heart] : ""),
    link: String(cols.link ? r[cols.link] ?? "" : "").trim(),
  }));
}

async function main() {
  await mountChrome("import");
  const content = document.getElementById("content")!;
  if (!isConfigured) {
    content.innerHTML = notConfiguredNotice();
    return;
  }

  content.innerHTML = `
    <div class="glass" style="padding:22px;max-width:720px">
      <p class="hint" style="margin-top:0">
        컬럼 이름은 <b>제목, 날짜, 내용, 하트, 링크</b> (영어 title/date/body/heart/link 도 가능).
        제목만 필수예요. 날짜는 <code>YYYY-MM-DD</code>, 하트는 <code>🖤</code>/<code>검정</code> 또는 <code>💙</code>/<code>파랑</code>.
      </p>
      <div style="margin:10px 0"><a id="tmpl" href="#" class="btn btn--sm">📄 CSV 템플릿 받기</a></div>
      <label>엑셀/CSV 파일</label>
      <input type="file" id="file" accept=".xlsx,.xls,.csv" />
      <div class="field-row" style="margin-top:8px">
        <div><label>작성자 닉네임 *</label><input id="nick" maxlength="40" placeholder="일괄 작성자" /></div>
        <div><label>비밀번호 * <span class="hint" style="display:inline">수정·삭제용</span></label>
          <input id="password" type="password" maxlength="72" placeholder="4자 이상" /></div>
      </div>
      <div id="preview" class="section" style="margin-top:16px"></div>
      <div style="margin-top:8px">
        <button class="btn btn--primary" id="import" disabled>등록하기</button>
        <a class="btn btn--ghost" href="${url("index.html")}">취소</a>
      </div>
    </div>`;

  let rows: BulkRow[] = [];
  const fileEl = content.querySelector("#file") as HTMLInputElement;
  const previewEl = content.querySelector("#preview") as HTMLElement;
  const importBtn = content.querySelector("#import") as HTMLButtonElement;

  content.querySelector("#tmpl")?.addEventListener("click", (e) => {
    e.preventDefault();
    const csv = "제목,날짜,내용,하트,링크\n버블 사태,2026-08-10,미친 버블,💙,https://x.com/...\n첫 오프,2026-07-01,즐거웠던 날,🖤,\n";
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kkamdol-template.csv";
    a.click();
  });

  fileEl.addEventListener("change", async () => {
    const file = fileEl.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      rows = parseRows(raw).filter((r) => r.title);
      renderPreview();
    } catch {
      toast("파일을 읽지 못했어요. 엑셀/CSV인지 확인해 주세요.", "err");
    }
  });

  function renderPreview() {
    if (!rows.length) {
      previewEl.innerHTML = `<p class="notice">제목이 있는 행을 찾지 못했어요. 컬럼 이름(제목/날짜/내용/하트/링크)을 확인해 주세요.</p>`;
      importBtn.disabled = true;
      return;
    }
    const head = rows.slice(0, 8);
    previewEl.innerHTML = `
      <p class="hint"><b>${rows.length}건</b> 인식됨 (아래는 미리보기)</p>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr>${["하트", "날짜", "제목", "링크"]
            .map((h) => `<th style="text-align:left;padding:6px;border-bottom:1px solid var(--glass-border)">${h}</th>`)
            .join("")}</tr></thead>
          <tbody>${head
            .map(
              (r) =>
                `<tr>
                  <td style="padding:6px">${r.heart}</td>
                  <td style="padding:6px;color:var(--text-faint)">${escapeHTML(r.event_date || "-")}</td>
                  <td style="padding:6px">${escapeHTML(r.title)}</td>
                  <td style="padding:6px;color:var(--text-faint)">${r.link ? "🔗" : ""}</td>
                </tr>`
            )
            .join("")}</tbody>
        </table>
      </div>
      ${rows.length > 8 ? `<p class="hint">…외 ${rows.length - 8}건</p>` : ""}`;
    importBtn.disabled = false;
  }

  importBtn.addEventListener("click", async () => {
    const nick = (content.querySelector("#nick") as HTMLInputElement).value.trim();
    const password = (content.querySelector("#password") as HTMLInputElement).value;
    if (!rows.length) return;
    if (!nick) return toast("작성자 닉네임을 입력해 주세요.", "err");
    if (password.length < 4) return toast("비밀번호는 4자 이상이어야 해요.", "err");

    const code = await requireWriterCode();
    if (!code) return;

    importBtn.disabled = true;
    importBtn.textContent = "등록 중…";
    try {
      const n = await createEventsBulk(code, nick, password, rows);
      document.dispatchEvent(new Event("kkamdol:unlock-changed"));
      toast(`${n}건 등록 완료 💙`);
      setTimeout(() => (location.href = url("index.html")), 900);
    } catch (err) {
      toast(errorText(err), "err");
      importBtn.disabled = false;
      importBtn.textContent = "등록하기";
    }
  });
}

main();
