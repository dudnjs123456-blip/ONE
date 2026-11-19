'use client';

import { useState } from 'react';
import type { PlayerProfile } from '@/game/core/profile';

/** 접속 버튼을 누른 뒤 화면이 깨지는 연출 시간 (ms) */
const GLITCH_MS = 900;

/**
 * 서울 내 집 컴퓨터 (E). 어느 날 깔려 있던 프로그램으로 다른 차원에 접속한다.
 * 처음 켜면 누가 보냈는지 모를 메일(이야기의 시작)을 읽게 되고, 그다음부턴 바로 접속 화면.
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
          <div className="p-4">
            <div className="mb-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/60">
              <div>
                <span className="text-white/40">보낸 사람</span> <span className="font-mono text-violet-200">???@dimension.void</span>
              </div>
              <div className="mt-0.5">
                <span className="text-white/40">제목</span> <span className="font-bold text-white">[초대] 당신의 주먹이 필요합니다</span>
              </div>
            </div>
            <div className="space-y-2 text-sm leading-6 text-white/85">
              <p>이 메일을 보고 있다면, 당신은 선택받은 사람입니다.</p>
              <p>
                모니터 너머에는 서울과 닮은 또 하나의 세계가 있습니다. 그곳은 지금 <b className="text-lime-300">고블린</b>, <b className="text-amber-300">산적</b>,{' '}
                <b className="text-orange-300">오우거</b>, <b className="text-rose-300">흑기사</b> 같은 몬스터들로 가득합니다.
              </p>
              <p>골목에서 단련한 당신의 주먹이라면 버틸 수 있을 겁니다. 바탕화면에 접속 프로그램을 깔아 두었습니다.</p>
              <p className="text-white/60">— 차원 관리자</p>
            </div>
            <button onClick={() => setMail(false)} className="mt-4 w-full rounded-lg bg-violet-500/30 py-2 text-sm font-bold hover:bg-violet-500/50">
              바탕화면의 프로그램 열기 ▸
            </button>
          </div>
        ) : (
          <div className="p-4">
            <div className="rounded-lg border border-cyan-300/20 bg-black/40 p-4 text-center">
              <div className="font-mono text-xl font-black tracking-widest text-cyan-300">DIMENSION.exe</div>
              <div className="mt-1 text-xs text-white/50">{visits > 0 ? `접속 기록 ${visits}회` : '처음 실행'}</div>
              <ul className="mt-3 space-y-1 text-left text-xs leading-5 text-white/70">
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
                받은 메일 다시 읽기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
