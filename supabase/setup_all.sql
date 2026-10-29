-- IRON FIST: Supabase 처음 설정 (0001 + 0002 합본). SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전.

-- IRON FIST: 플레이어 성장 정보 (필드·보스 레이드 공유)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.

-- ───────────────────────── 프로필 ─────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text check (char_length(nickname) between 1 and 16),
  level       integer not null default 1 check (level >= 1),
  exp         integer not null default 0 check (exp >= 0),
  gold        bigint  not null default 0 check (gold >= 0),
  kills       integer not null default 0 check (kills >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is '플레이어 레벨·경험치·골드 (필드 사냥과 보스 레이드가 공유)';

-- ───────────────────────── 보스 클리어 기록 ─────────────────────────
create table if not exists public.boss_clears (
  user_id           uuid not null references auth.users (id) on delete cascade,
  boss_id           text not null,
  clears            integer not null default 0 check (clears >= 0),
  -- 최단 클리어 시간 (초). 랭킹용
  best_time         real check (best_time > 0),
  first_cleared_at  timestamptz not null default now(),
  last_cleared_at   timestamptz not null default now(),
  primary key (user_id, boss_id)
);

comment on table public.boss_clears is '보스별 클리어 횟수·최단 기록';

-- ───────────────────────── updated_at 자동 갱신 ─────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ───────────────────────── 접근 권한 (RLS) ─────────────────────────
-- 로그인한 사용자는 자기 행만 읽고 쓸 수 있다.
-- ※ 지금은 클라이언트가 직접 저장하는 단계. 게임 서버(검증)가 생기면
--   insert/update 정책을 지우고 서버(service role)만 쓰게 바꾼다.
alter table public.profiles enable row level security;
alter table public.boss_clears enable row level security;

drop policy if exists "own profile: read" on public.profiles;
create policy "own profile: read" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "own profile: insert" on public.profiles;
create policy "own profile: insert" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "own profile: update" on public.profiles;
create policy "own profile: update" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "own clears: read" on public.boss_clears;
create policy "own clears: read" on public.boss_clears
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "own clears: insert" on public.boss_clears;
create policy "own clears: insert" on public.boss_clears
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "own clears: update" on public.boss_clears;
create policy "own clears: update" on public.boss_clears
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

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
