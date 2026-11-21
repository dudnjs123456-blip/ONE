'use client';

import { useState } from 'react';
import type { PlayerProfile } from '@/game/core/profile';

/** 접속 버튼을 누른 뒤 화면이 깨지는 연출 시간 (ms) */
const GLITCH_MS = 900;

/**
 * 서울 내 집 컴퓨터 (E). 요즘 유행한다는 게임 DIMENSION 을 깔아 실행하면 다른 차원으로 빨려 들어간다.
 * 처음 켜면 인기 게임 소개(이야기의 시작)를 보고, 그다음부턴 바로 실행 화면.
 */
export default function HomePcPanel({ profile, onConnect, onClose }: { profile: PlayerProfile; onConnect: () => void; onClose: () => void }) {
  const visits = profile.dimension?.visits ?? 0;
  const [mail, setMail] = useState(visits === 0);
  const [going, setGoing] = useState(false);

  const connect = () => {
    if (going) return;
    setGoing(true);
    window.setTimeout(onConnect, GLITCH_MS);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-3" onClick={going ? undefined : onClose}>
      <div
        className={`max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-violet-300/30 bg-[#0d0a24]/95 text-white shadow-[0_0_40px_rgba(139,92,246,0.35)] ${going ? 'dim-glitch' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 창 제목줄 */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <div className="font-mono text-sm font-bold text-violet-200">🖥️ 내 컴퓨터</div>
          <button onClick={onClose} disabled={going} className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20 disabled:opacity-40">
            끄기
          </button>
        </div>

        {mail ? (
          // 요즘 유행한다는 게임: 커뮤니티 인기글을 보고 깔아 본다 (이야기의 시작)
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/60">
              <span className="rounded bg-rose-500 px-1.5 py-0.5 font-black text-white">HOT</span>
              <span>실시간 인기 게임 1위</span>
            </div>
            <div className="rounded-lg border border-cyan-300/20 bg-black/40 p-4">
              <div className="font-mono text-2xl font-black tracking-[0.3em] text-cyan-300">DIMENSION</div>
              <div className="mt-1 text-xs text-white/50">무료 · 제작사 정보 없음 · 다운로드 1,000만+</div>
              <p className="mt-3 text-sm leading-6 text-white/85">요즘 다들 이거 한다는 그 게임. 켜는 순간 진짜 그 세계에 들어간 것 같다는 후기가 쏟아지는 중.</p>
              <ul className="mt-3 space-y-1.5 text-xs leading-5 text-white/75">
                <li className="rounded bg-white/5 px-2 py-1">💬 그래픽이 아니라 진짜 공기 냄새가 남 ㄷㄷ</li>
                <li className="rounded bg-white/5 px-2 py-1">💬 켜고 나서 기억이 잘 안 나는데 재밌었던 건 확실함</li>
                <li className="rounded bg-white/5 px-2 py-1">💬 근데 제작사 어디임? 검색해도 안 나옴</li>
              </ul>
            </div>
            <button onClick={() => setMail(false)} className="mt-4 w-full rounded-lg bg-violet-500/30 py-2 text-sm font-bold hover:bg-violet-500/50">
              ⬇ 무료 설치하고 실행해 보기 ▸
            </button>
          </div>
        ) : (
          <div className="p-4">
            <div className="rounded-lg border border-cyan-300/20 bg-black/40 p-4 text-center">
              <div className="font-mono text-xl font-black tracking-widest text-cyan-300">DIMENSION.exe</div>
              <div className="mt-1 text-xs text-white/50">{visits > 0 ? `접속 기록 ${visits}회` : '처음 실행'}</div>
              <ul className="mt-3 space-y-1 text-left text-xs leading-5 text-white/70">
                <li>· {profile.dimension?.prologue ? '접속하면 경계 마을 포탈 앞에 도착해요' : '처음 실행하면 이야기가 시작돼요'}</li>
                <li>· 같은 차원에 접속한 사람들은 모두 같은 몬스터를 보고 같이 싸워요</li>
                <li>· 접속해 있는 동안 서울에서는 내 모습이 사라져요</li>
                <li>· 자동사냥(Z)으로 쉬지 않고 사냥할 수 있어요</li>
                <li>· 로그아웃하면 다시 이 컴퓨터 앞으로 돌아와요</li>
              </ul>
              <button
                onClick={connect}
                disabled={going}
                className="mt-4 w-full rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 py-2.5 font-black tracking-wider hover:brightness-110 disabled:opacity-70"
              >
                {going ? '접속 중…' : '🌀 접속하기'}
              </button>
            </div>
            {visits > 0 && (
              <button onClick={() => setMail(true)} className="mt-2 w-full text-xs text-white/45 hover:text-white/80">
                게임 소개 다시 보기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
