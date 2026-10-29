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
