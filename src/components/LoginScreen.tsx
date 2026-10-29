'use client';

import { useState } from 'react';
import { signIn, signUp, type Account } from '@/game/net/auth';

/** 접속하면 처음 보는 화면: 아이디·비밀번호로 로그인 (또는 가입) */
export default function LoginScreen({ onLogin }: { onLogin: (acc: Account) => void }) {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (tab === 'signup' && pw !== pw2) return setError('비밀번호 확인이 달라요');
    setBusy(true);
    setError('');
    const res = tab === 'login' ? await signIn(id, pw) : await signUp(id, pw);
    setBusy(false);
    if ('error' in res) setError(res.error);
    else onLogin(res);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-zinc-950 via-[#0b0d17] to-black px-6 text-white">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-5xl font-black italic tracking-tight text-amber-300">IRON FIST</h1>
        <p className="mt-2 text-center text-sm text-white/50">로그인하면 내 캐릭터와 기록을 그대로 이어서 할 수 있어요</p>

        <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-black/40 p-1 text-sm">
            {(['login', 'signup'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setError('');
                }}
                className={`rounded-md py-2 font-bold ${tab === t ? 'bg-amber-400 text-black' : 'text-white/60 hover:text-white'}`}
              >
                {t === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="text-xs text-white/60">
              아이디
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="영문·숫자·_ 3~16자"
                className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2.5 text-base text-white outline-none focus:border-amber-300"
              />
            </label>
            <label className="text-xs text-white/60">
              비밀번호
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                placeholder="6자 이상"
                className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2.5 text-base text-white outline-none focus:border-amber-300"
              />
            </label>
            {tab === 'signup' && (
              <label className="text-xs text-white/60">
                비밀번호 확인
                <input
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2.5 text-base text-white outline-none focus:border-amber-300"
                />
              </label>
            )}
            {error && <div className="rounded bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</div>}
            <button
              type="submit"
              disabled={busy || !id || !pw}
              className="mt-2 rounded-md bg-amber-500 py-2.5 font-black text-black hover:bg-amber-400 disabled:opacity-40"
            >
              {busy ? '잠시만요…' : tab === 'login' ? '로그인' : '가입하고 시작하기'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
