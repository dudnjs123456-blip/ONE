import { getSupabase } from './supabase';

/**
 * 아이디·비밀번호 로그인 (Supabase Auth).
 * Supabase 는 이메일 형식만 받으므로 아이디를 내부 이메일(아이디@players.ironfist.game)로 바꿔 쓴다.
 * 플레이어는 아이디만 보고, 이 주소로 메일이 가지는 않는다 (대시보드에서 Confirm email 을 꺼 둔다).
 */
export const LOGIN_DOMAIN = 'players.ironfist.game';

export interface Account {
  userId: string;
  username: string;
}

export const usernameToEmail = (id: string) => `${id.trim().toLowerCase()}@${LOGIN_DOMAIN}`;

/** 아이디 규칙: 영문 소문자·숫자·_ 3~16자. 문제가 있으면 안내 문구 */
export function checkUsername(id: string): string | null {
  const v = id.trim();
  if (v.length < 3 || v.length > 16) return '아이디는 3~16자로 해 주세요';
  if (!/^[a-zA-Z0-9_]+$/.test(v)) return '아이디는 영문·숫자·_ 만 쓸 수 있어요';
  return null;
}

export function checkPassword(pw: string): string | null {
  if (pw.length < 6) return '비밀번호는 6자 이상이어야 해요';
  return null;
}

/** Supabase 오류 → 한국어 안내 */
function explain(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return '아이디 또는 비밀번호가 틀렸어요';
  if (m.includes('already registered') || m.includes('already been registered')) return '이미 있는 아이디예요';
  if (m.includes('email not confirmed')) return '서버에서 이메일 확인(Confirm email)이 켜져 있어요 — 관리자가 꺼야 해요';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return '지금은 회원가입이 막혀 있어요';
  if (m.includes('password')) return '비밀번호가 너무 짧거나 약해요 (6자 이상)';
  if (m.includes('rate limit')) return '잠시 후 다시 시도해 주세요';
  if (m.includes('fetch')) return '서버에 연결할 수 없어요';
  return message;
}

function toAccount(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Account {
  const meta = user.user_metadata?.username;
  return { userId: user.id, username: typeof meta === 'string' ? meta : (user.email ?? '').split('@')[0] };
}

/** 이미 로그인돼 있으면 그 계정 (새로고침해도 유지) */
export async function currentAccount(): Promise<Account | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  // 예전 익명 계정은 로그인으로 치지 않는다
  if (!user || user.is_anonymous) return null;
  return toAccount(user);
}

export async function signIn(username: string, password: string): Promise<Account | { error: string }> {
  const sb = getSupabase();
  if (!sb) return { error: '서버 설정(.env.local)이 없어요' };
  const bad = checkUsername(username) ?? checkPassword(password);
  if (bad) return { error: bad };
  const { data, error } = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error || !data.user) return { error: explain(error?.message ?? '로그인 실패') };
  return toAccount(data.user);
}

export async function signUp(username: string, password: string): Promise<Account | { error: string }> {
  const sb = getSupabase();
  if (!sb) return { error: '서버 설정(.env.local)이 없어요' };
  const bad = checkUsername(username) ?? checkPassword(password);
  if (bad) return { error: bad };
  const name = username.trim();
  const { data, error } = await sb.auth.signUp({ email: usernameToEmail(name), password, options: { data: { username: name } } });
  if (error || !data.user) return { error: explain(error?.message ?? '가입 실패') };
  if (!data.session) return { error: explain('email not confirmed') };
  return toAccount(data.user);
}

export async function signOut() {
  await getSupabase()?.auth.signOut();
}
