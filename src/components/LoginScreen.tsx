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
    <main className="tg-sky flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="tg-title text-center text-7xl">Together</h1>
        <p className="tg-subtitle mt-4 text-center text-sm">로그인하면 내 캐릭터와 기록을 그대로 이어서 할 수 있어요</p>

        <div className="tg-card mt-8 p-6">
          <div className="tg-tabs mb-5">
            {(['login', 'signup'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setError('');
                }}
                data-on={tab === t}
                className="tg-tab"
              >
                {t === 'login' ? '로그인' : '회원가입 ✨'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="tg-muted text-xs font-bold">
              아이디
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="영문·숫자·_ 3~16자"
                className="tg-input"
              />
            </label>
            <label className="tg-muted text-xs font-bold">
              비밀번호
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                placeholder="6자 이상"
                className="tg-input"
              />
            </label>
            {tab === 'signup' && (
              <label className="tg-muted text-xs font-bold">
                비밀번호 확인
                <input
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  autoComplete="new-password"
                  className="tg-input"
                />
              </label>
            )}
            {error && <div className="rounded-xl bg-rose-500/20 px-3 py-2 text-sm text-rose-100">{error}</div>}
            <button
              type="submit"
              disabled={busy || !id || !pw}
              className="tg-cta mt-2"
            >
              {busy ? '잠시만요…' : tab === 'login' ? '로그인하고 놀러가기 💕' : '가입하고 시작하기 ✨'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
