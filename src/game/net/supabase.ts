import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;

/**
 * Supabase 클라이언트. .env.local 에 URL·키가 없으면 null → 오프라인(브라우저 저장만).
 * (NEXT_PUBLIC_ 변수는 빌드 때 코드에 박히므로 그대로 써야 한다)
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
  return client;
}
