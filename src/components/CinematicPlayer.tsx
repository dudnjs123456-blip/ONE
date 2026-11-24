'use client';

import { useEffect, useRef, useState } from 'react';
import { cinematicShots, type CinematicId } from '@/game/data/cinematics';

/** 컷신을 막 띄운 순간의 키(대사 넘기기)로 바로 건너뛰지 않게 잠깐 키를 무시한다 */
const KEY_GRACE_MS = 700;
/** 컷이 끝나기 이만큼 전부터 어두워진다 (실제 시간, 초) — 컷이 뚝 끊기지 않게 */
const FADE_OUT_S = 0.35;

/**
 * 2D 컷신 재생기: 화면 위·아래에 검은 띠(영화 비율)를 두고 컷을 차례로 튼다.
 * 영상이 없거나 불러오지 못하면 그 컷은 건너뛴다. 다 끝나면(또는 건너뛰면) onEnd.
 */
export default function CinematicPlayer({ id, body, onEnd }: { id: CinematicId; body: string | undefined; onEnd: () => void }) {
  const [shots] = useState(() => cinematicShots(id, body) ?? []);
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const doneRef = useRef(false);
  const finish = useRef(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    endRef.current();
  }).current;
  const next = () => setIdx((i) => i + 1);

  useEffect(() => {
    if (idx >= shots.length) finish();
  }, [idx, shots.length, finish]);

  // 컷이 바뀔 때마다 검은 화면에서 살짝 밝아진다 (끝나기 직전엔 onTimeUpdate 가 다시 어둡게 한다)
  useEffect(() => {
    setFade(true);
    const t = window.setTimeout(() => setFade(false), 40);
    return () => window.clearTimeout(t);
  }, [idx]);

  useEffect(() => {
    const at = performance.now();
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || performance.now() - at < KEY_GRACE_MS) return;
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE' || e.code === 'KeyF') {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [finish]);

  const shot = shots[idx];
  const upcoming = shots[idx + 1];
  const nextVideo = upcoming && 'video' in upcoming ? upcoming.video : null;
  if (!shot) return <div className="absolute inset-0 z-40 bg-black" />;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black" data-cinematic={id}>
      <div className="relative aspect-video max-h-[82vh] w-full overflow-hidden">
        {'video' in shot ? (
          <video
            key={shot.video}
            src={shot.video}
            poster={shot.poster}
            className="h-full w-full object-cover"
            autoPlay
            muted
            playsInline
            onLoadedMetadata={(e) => {
              e.currentTarget.playbackRate = shot.rate ?? 1;
            }}
            onEnded={next}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              const end = Math.min(shot.until ?? Infinity, v.duration || Infinity);
              // 끝나기 직전부터 살짝 어두워진다
              if ((end - v.currentTime) / (shot.rate ?? 1) < FADE_OUT_S) setFade(true);
              // 한 번만 넘긴다 (timeupdate 는 여러 번 오고, 끝난 뒤 ended 도 온다)
              if (shot.until && v.currentTime >= shot.until && !v.dataset.done) {
                v.dataset.done = '1';
                v.pause();
                next();
              }
            }}
            onError={next}
          />
        ) : (
          <ImageShot key={shot.image} src={shot.image} ms={shot.ms} onDone={next} />
        )}
        <div className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`} />
        {/* 다음 영상을 미리 받아 둔다 (컷 사이에 검은 화면이 길어지지 않게) */}
        {nextVideo && <video key={'pre-' + nextVideo} src={nextVideo} preload="auto" muted className="hidden" />}
      </div>
      <button onClick={finish} className="absolute bottom-5 right-5 rounded bg-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/20 hover:text-white">
        건너뛰기 ▸
      </button>
    </div>
  );
}

/** 그림 한 장: ms 동안 천천히 확대되며 보인다 */
function ImageShot({ src, ms, onDone }: { src: string; ms: number; onDone: () => void }) {
  const [zoom, setZoom] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const a = window.setTimeout(() => setZoom(true), 30);
    const b = window.setTimeout(() => doneRef.current(), ms);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [ms]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={() => doneRef.current()}
      className="h-full w-full object-cover ease-out"
      style={{ transform: zoom ? 'scale(1.08)' : 'scale(1)', transition: `transform ${ms}ms` }}
    />
  );
}
