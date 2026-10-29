// Supabase 실제 연결 확인: node scripts/supabase-check.mjs
// 익명 로그인 → 내 프로필 저장 → 다시 읽기 → 남의 데이터는 안 보이는지(RLS) 확인
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없습니다');

const sb = createClient(url, key, { auth: { persistSession: false } });
const step = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) process.exitCode = 1;
};

const { data: auth, error: authErr } = await sb.auth.signInAnonymously();
step(!authErr, `익명 로그인 ${authErr ? '— ' + authErr.message : auth.user.id}`);
if (authErr) process.exit(1);
const uid = auth.user.id;

const profile = {
  id: uid, nickname: '연결테스트', level: 3, exp: 42, gold: 777, kills: 12,
  save: { life: { fatigue: 10, hunger: 20, hp: 150 }, gear: { owned: ['cap'], equipped: { weapon: 'woodBat' } }, fridge: [], casino: { played: 1, won: 0, lost: 10, best: 0 } },
  saved_at: new Date().toISOString(),
};
const up = await sb.from('profiles').upsert(profile);
step(!up.error, `profiles 저장 ${up.error ? '— ' + up.error.message : ''}`);

const bc = await sb.from('boss_clears').upsert({ user_id: uid, boss_id: 'goblinKing', clears: 1, best_time: 61.5 });
step(!bc.error, `boss_clears 저장 ${bc.error ? '— ' + bc.error.message : ''}`);

const back = await sb.from('profiles').select('*').eq('id', uid).single();
step(!back.error && back.data.gold === 777, `profiles 다시 읽기 → Lv.${back.data?.level} gold=${back.data?.gold}`);
step(!back.error && back.data.save?.gear?.equipped?.weapon === 'woodBat', `save(jsonb) 다시 읽기 → 무기 ${back.data?.save?.gear?.equipped?.weapon ?? '(없음 — 0002 SQL 을 실행했나요?)'}`);

// RLS: 다른 사람의 행은 보이지 않아야 한다
const others = await sb.from('profiles').select('id').neq('id', uid).limit(5);
step(!others.error && others.data.length === 0, `다른 사용자 데이터 차단 (보인 행: ${others.data?.length ?? '?'})`);

const forge = await sb.from('profiles').upsert({ id: '00000000-0000-0000-0000-000000000000', level: 99 });
step(!!forge.error, `남의 id 로 쓰기 차단 ${forge.error ? '(' + forge.error.code + ')' : '— 막히지 않음!'}`);

console.log(`\n대시보드 Table Editor 에서 nickname='연결테스트' 행을 확인할 수 있습니다 (user ${uid}).`);
