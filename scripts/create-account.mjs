// 로그인 계정 만들기: node scripts/create-account.mjs <아이디> <비밀번호>
// (Supabase 대시보드에서 Authentication → Email 의 Confirm email 을 꺼 둬야 바로 로그인된다)
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [id, pw] = process.argv.slice(2);
if (!id || !pw) throw new Error('사용법: node scripts/create-account.mjs <아이디> <비밀번호>');
if (!/^[a-zA-Z0-9_]{3,16}$/.test(id)) throw new Error('아이디는 영문·숫자·_ 3~16자');
if (pw.length < 6) throw new Error('비밀번호는 6자 이상');

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const email = `${id.toLowerCase()}@players.ironfist.game`;

const up = await sb.auth.signUp({ email, password: pw, options: { data: { username: id } } });
if (up.error && !/already/i.test(up.error.message)) throw new Error('가입 실패: ' + up.error.message);
console.log(up.error ? `이미 있는 아이디: ${id}` : `가입 완료: ${id}`);

const login = await sb.auth.signInWithPassword({ email, password: pw });
if (login.error) throw new Error('로그인 확인 실패: ' + login.error.message + (/confirm/i.test(login.error.message) ? ' (Confirm email 을 꺼 주세요)' : ''));
const uid = login.data.user.id;
console.log(`로그인 확인 완료 — user ${uid}`);
// 게임 기록은 만들지 않는다: 처음 웹에서 로그인할 때 그 브라우저의 기록이 이 계정으로 올라간다
const mine = await sb.from('profiles').select('id, level').eq('id', uid);
console.log(`내 기록 읽기: ${mine.error ? '실패 — ' + mine.error.message : mine.data.length ? 'Lv.' + mine.data[0].level : '아직 없음 (첫 로그인 때 올라감)'}`);
const others = await sb.from('profiles').select('id').neq('id', uid).limit(5);
console.log(`다른 사람 기록 차단: ${!others.error && others.data.length === 0 ? '정상' : '확인 필요'}`);
const forge = await sb.from('profiles').upsert({ id: '00000000-0000-0000-0000-000000000000', level: 99 });
console.log(`남의 id 로 쓰기 차단: ${forge.error ? '정상' : '막히지 않음!'}`);
await sb.auth.signOut();
