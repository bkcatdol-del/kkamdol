# 깜돌 kkamdol 아카이브 🖤💙

있었던 이슈·이벤트를 시간순으로 기록하고, 이미지·GIF·영상을 올리고, 서로 댓글을
남기는 **공개 아카이브**. 누구나 볼 수 있고, 글쓰기·업로드·댓글은 **승인 코드**를
받은 사람만, 삭제 전권은 **관리자**에게.

- **보기**: 누구나 (로그인 없음)
- **글쓰기 · 업로드 · 댓글**: 관리자가 나눠준 **승인 코드** 입력 (기기당 한 번)
- **본인 글 수정 · 삭제**: 작성 시 정한 닉네임+비밀번호
- **무엇이든 삭제 · 코드 관리**: 관리자 키

정적 프론트엔드(GitHub Pages, 무료) + Supabase 무료 티어(DB·Storage·RPC).
관리 서버가 없어 간단하고, 모든 쓰기는 서버 RPC가 승인 코드/비번/관리자 키를
bcrypt로 검증합니다.

## 기술 스택

- Vite + vanilla TypeScript (프레임워크 없음), 커스텀 CSS(글래스모피즘)
- `@supabase/supabase-js`
- GitHub Pages + GitHub Actions 배포

## 로컬 실행

```bash
npm install
cp .env.example .env   # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 채우기
npm run dev            # http://localhost:5173/kkamdol/
```

`npm run build` 로 정적 파일(`dist/`)을 만들고, `npm run preview` 로 미리봅니다.

## 백엔드 설정

Supabase 프로젝트 생성 → 마이그레이션 실행 → 승인 코드/관리자 키 시드까지의
단계는 [`supabase/README.md`](supabase/README.md) 를 따르세요. 코드/키는 저장소에
평문으로 두지 않고 bcrypt 해시로만 DB에 넣습니다.

## 배포 (GitHub Pages)

1. Settings → Pages → Source = **GitHub Actions**
2. Settings → Secrets and variables → Actions → **Variables** 에
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 추가
   (필요 시 커스텀 도메인은 `VITE_BASE=/`)
3. `main` 브랜치로 푸시하면 자동 빌드·배포

anon 키와 Supabase URL은 정적 번들에 포함되어도 되는 공개 값입니다. 데이터는
RLS와 쓰기 RPC가 보호합니다. **service_role 키·승인 코드·관리자 키는 절대
프론트엔드/저장소에 넣지 마세요.**

## 승인 코드 사용법 (무마찰)

- 처음 한 번만 코드를 입력하면 브라우저에 기억되어 다시 묻지 않습니다.
- 링크로도 해제 가능: `.../index.html#code=<승인코드>` (관리자: `#adminkey=<키>`).
  접속 즉시 저장 후 URL에서 제거됩니다. 이 링크를 북마크하면 타이핑 0회.
- 해제 상태는 헤더 아래 칩으로 표시되고, "잊기"로 언제든 해제합니다.

## 구조

```
index.html gallery.html event.html upload.html new-event.html admin.html
src/lib/        supabase · api · access · admin · upload · validation · dom
src/components/ layout · access-gate · comments · media-card
src/pages/      home · gallery · event · new-event · upload · admin
src/styles/     main.css (블랙+남색 글래스모피즘)
supabase/migrations/  0001~0006 (스키마·RLS·RPC·Storage)
.github/workflows/deploy.yml
```
