import "../styles/main.css";
import { mountChrome } from "../components/layout";
import { listMedia } from "../lib/api";
import { isConfigured } from "../lib/supabase";
import { renderMediaCard } from "../components/media-card";
import { url, notConfiguredNotice } from "../lib/dom";

async function main() {
  await mountChrome("gallery");
  const content = document.getElementById("content")!;

  if (!isConfigured) {
    content.innerHTML = notConfiguredNotice();
    return;
  }

  try {
    const media = await listMedia(120);
    if (media.length === 0) {
      content.innerHTML = `
        <div class="empty">
          <div class="big">🖤💙</div>
          <p>아직 올라온 미디어가 없어요.</p>
          <p style="margin-top:16px"><a class="btn btn--primary" href="${url("upload.html")}">업로드하기</a></p>
        </div>`;
      return;
    }
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const m of media) grid.appendChild(renderMediaCard(m));
    content.innerHTML = "";
    content.appendChild(grid);
  } catch {
    content.innerHTML = `<div class="notice">불러오지 못했어요.</div>`;
  }
}

main();
