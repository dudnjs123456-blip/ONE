// 채팅 실제 확인용: 마을 채널(town:main)에 잠깐 붙어서 채팅을 받고, 한 번 보낸다.
// node --experimental-websocket scripts/chat-bot.mjs [기다릴 초=45] [보낼 때(초)=25]
// (presence 로 접속하지 않으므로 다른 사람 화면에 캐릭터로 나타나지 않는다)
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim().match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, '')]),
);
const [waitS = '45', sendAt = '25'] = process.argv.slice(2);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const ch = sb.channel('town:main', { config: { broadcast: { self: false } } });
ch.on('broadcast', { event: 'chat' }, ({ payload }) => console.log('받음:', JSON.stringify(payload)));
ch.subscribe((st) => console.log('채널:', st));
setTimeout(() => {
  void ch.send({ type: 'broadcast', event: 'chat', payload: { id: 'chat-test-bot', name: '테스트봇', text: '봇에서 보낸 채팅 테스트 👋' } });
  console.log('보냄');
}, Number(sendAt) * 1000);
setTimeout(() => {
  void sb.removeChannel(ch);
  process.exit(0);
}, Number(waitS) * 1000);
