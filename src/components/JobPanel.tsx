'use client';

import { useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { JOB_TIERS, JOBS, ROBBER_TIERS, type JobTier } from '@/game/data/jobs';

/**
 * 일자리 창 (J 키 · 경비실에서 E): 상·중·하 등급별 일자리 목록.
 * 근무 중이면 현황과 조기 퇴근 버튼을 보여준다.
 */
export default function JobPanel({ world, onClose }: { world: CityWorld; onClose: () => void }) {
  const [tier, setTier] = useState<JobTier>('low');
  const [msg, setMsg] = useState('');
  const list = JOBS.filter((j) => j.tier === tier);
  const job = world.job;
  const records = world.profile.jobs ?? {};

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-[560px] max-w-full rounded-xl border border-white/20 bg-zinc-900/95 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xl font-bold">💼 일자리</div>
          <div className="text-xs text-white/50">J / Esc 닫기</div>
        </div>

        {job && (
          <div className="mb-4 rounded-lg border border-sky-400/40 bg-sky-900/30 p-3 text-sm">
            <div className="font-bold">
              {job.job.icon} {job.job.name} 근무 중
            </div>
            <div className="mt-1 text-white/80">
              남은 시간 {fmt(job.remainingFrames)} · 확인 {job.checked}명 · 지금 퇴근하면 {job.earnedBase + job.bonus}G
            </div>
            <button
              onClick={() => {
                world.quitJob();
                onClose();
              }}
              className="mt-2 rounded bg-white/15 px-3 py-1 text-xs hover:bg-white/25"
            >
              조기 퇴근하기 (일한 만큼만 받음, 개근 수당 없음)
            </button>
          </div>
        )}

        <div className="mb-3 flex gap-2">
          {JOB_TIERS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTier(t.id)}
              className={`flex-1 rounded-lg border px-3 py-2 text-left ${tier === t.id ? 'border-amber-300 bg-amber-300/15' : 'border-white/15 hover:bg-white/5'}`}
            >
              <div className="text-lg font-black">{t.label}</div>
              <div className="text-[11px] text-white/60">{t.title}</div>
            </button>
          ))}
        </div>
        <div className="mb-2 text-xs text-white/50">{JOB_TIERS.find((t) => t.id === tier)!.desc}</div>

        {list.length === 0 && <div className="rounded-lg border border-dashed border-white/15 p-6 text-center text-sm text-white/50">아직 이 등급의 일자리가 없어요 (준비 중)</div>}

        {list.map((j) => {
          const rec = records[j.id];
          return (
            <div key={j.id} className="rounded-lg border border-white/15 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold">
                    {j.icon} {j.name}
                  </div>
                  <div className="text-xs text-white/60">
                    📍 {j.place} · ⏱️ {j.shiftMinutes}분 · 💰 기본급 {j.basePay}G + 수당
                  </div>
                </div>
                {rec && (
                  <div className="text-right text-[11px] text-white/60">
                    근무 {rec.shifts}회
                    <br />
                    누적 {rec.earned}G
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm text-white/80">{j.desc}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-white/70">
                {j.duties.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <div className="mt-2 text-[11px] text-white/50">
                강도 출현 비율: {ROBBER_TIERS.map((r) => `${r.icon}${r.name} ${r.weight}%`).join(' · ')}
              </div>
              {!job && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      const err = world.startJob(j.id);
                      if (err) setMsg(err);
                      else onClose();
                    }}
                    className="rounded bg-amber-500 px-4 py-1.5 text-sm font-bold text-black hover:bg-amber-400"
                  >
                    근무 시작
                  </button>
                  <button
                    onClick={() => {
                      const poi = world.map.pois.find((p) => p.id === j.poiId)!;
                      const err = world.navigateTo(poi.x, poi.z, j.place);
                      if (err) setMsg(err);
                      else onClose();
                    }}
                    className="rounded bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20"
                  >
                    🧭 {j.place}로 이동
                  </button>
                </div>
              )}
              {msg && <div className="mt-2 text-sm font-bold text-red-300">{msg}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmt(frames: number) {
  const s = Math.ceil(frames / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
