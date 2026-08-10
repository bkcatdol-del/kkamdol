# Supabase 백엔드 설정

이 폴더의 마이그레이션은 kkamdol 아카이브의 데이터베이스(테이블·RLS·RPC·Storage)를
정의합니다. **승인 코드와 관리자 키는 이 저장소 어디에도 평문으로 두지 않습니다** —
아래 시드 단계에서 bcrypt 해시로만 DB에 넣습니다.

## 1. 프로젝트 생성

1. <https://supabase.com> 에서 새 프로젝트 생성 (무료 티어).
2. Project Settings → API 에서 다음을 복사해 프론트엔드 `.env` 에 넣습니다
   (둘 다 공개되어도 되는 값 — 데이터는 RLS/RPC가 보호):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`  (anon **public** key)
   - ⚠️ `service_role` 키는 절대 프론트엔드/깃에 넣지 마세요.

## 2. 마이그레이션 실행

SQL Editor에서 `migrations/` 의 파일을 **번호 순서대로** 실행합니다:

```
0001_schema.sql   → 확장/테이블/인덱스
0002_rls.sql      → RLS(공개 읽기, 직접 쓰기 금지) + password_hash 숨긴 공개 뷰
0003_rpc_write.sql→ 승인코드 게이트 create_* + verify_code
0004_rpc_owner.sql→ 작성자 비번 기반 수정/삭제
0005_rpc_admin.sql→ 관리자 삭제/숨김/코드관리 + report_content
0006_storage.sql  → media 버킷 + 정책
```

(로컬 CLI를 쓴다면 `supabase db push` 로 한 번에 적용해도 됩니다.)

## 3. 승인 코드 & 관리자 키 시드 (수동 1회)

SQL Editor에서 아래를 실행합니다. `<...>` 자리에 **실제 값**을 넣으세요.
값은 여기(깃)에 저장하지 말고, 신뢰하는 사람에게만 따로 전달하세요.

```sql
-- 글쓰기 승인 코드 (사람들에게 배포)
insert into public.access_codes (code_hash, role, label)
values (crypt('<승인코드>', gen_salt('bf', 10)), 'writer', 'first batch');

-- 관리자 키 (본인만 보관 — 삭제/코드관리 권한)
insert into public.access_codes (code_hash, role, label)
values (crypt('<관리자키>', gen_salt('bf', 10)), 'admin', 'owner');
```

시드 후에는 사이트에서 처음 한 번만 코드/키를 입력하면 브라우저에 기억되어
다시 입력할 필요가 없습니다. 이후 코드 발급/회수는 관리자 페이지(`admin.html`)의
코드 관리 기능(또는 `admin_add_code` / `admin_revoke_code` RPC)으로 할 수 있습니다.

## 보안 요약

- anon 클라이언트는 **읽기만** 가능(공개 뷰, `status='visible'`). 직접 INSERT/UPDATE/DELETE 불가.
- 모든 쓰기는 `SECURITY DEFINER` RPC를 거치며, 서버에서 승인 코드/비번/관리자 키를 bcrypt로 검증.
- `access_codes` 테이블은 anon에 완전 비공개(RLS 정책 없음).
- `password_hash` / `code_hash` 는 공개 뷰·목록 RPC에서 절대 반환되지 않음.
