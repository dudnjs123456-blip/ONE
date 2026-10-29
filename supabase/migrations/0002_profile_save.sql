-- IRON FIST: 게임 진행 전체 저장 (서울 라이프 추가분)
-- 0001 다음에 SQL Editor 에서 Run. 여러 번 실행해도 안전하다.
--
-- 레벨·골드처럼 랭킹·검증에 쓸 값은 지금처럼 컬럼에 두고,
-- 자주 바뀌는 생활 데이터(인벤토리·피로/배고픔·체력·장비·냉장고·근무 기록·카지노·게임 날짜)는
-- save(jsonb) 한 칸에 통째로 둔다. 나중에 필요해지면 컬럼으로 뽑아낸다.

alter table public.profiles
  add column if not exists save jsonb not null default '{}'::jsonb,
  -- 클라이언트가 마지막으로 저장한 시각 (기기 두 대가 충돌할 때 최신 쪽을 고른다)
  add column if not exists saved_at timestamptz not null default now();

comment on column public.profiles.save is '게임 진행 전체 (inventory, life, gear, fridge, jobs, workLog, casino, time)';
comment on column public.profiles.saved_at is '클라이언트 마지막 저장 시각';

-- 저장 데이터가 비정상적으로 커지지 않게 (약 512KB)
alter table public.profiles drop constraint if exists profiles_save_size;
alter table public.profiles add constraint profiles_save_size check (pg_column_size(save) < 524288);

-- ───────────────────────── 접근 권한 (Data API) ─────────────────────────
-- 프로젝트를 만들 때 "Automatically expose new tables" 를 껐어도 동작하도록 직접 준다.
-- 실제로 누가 어느 행을 보는지는 0001 의 RLS 정책(자기 행만)이 막는다.
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.boss_clears to authenticated;
