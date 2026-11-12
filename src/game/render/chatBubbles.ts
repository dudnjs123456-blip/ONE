import * as THREE from 'three';
import { BUBBLE_MS, EMOTE_MS, wrapChat } from '../city/chat';

interface Bubble {
  who: string;
  sprite: THREE.Sprite;
  until: number;
  tex: THREE.CanvasTexture;
  /** 감정 표현 (이모지만, 위로 떠오른다) */
  emote?: boolean;
}

/** 감정 표현 그림: 투명 바탕에 큰 이모지 + 흰 테두리 빛 */
function emoteTexture(e: string): THREE.CanvasTexture {
  const S = 160;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d')!;
  g.font = '110px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(255,255,255,0.9)';
  g.shadowBlur = 14;
  g.fillText(e, S / 2, S / 2 + 6);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 캔버스 픽셀 → 월드 크기. 글자가 이름표 글자와 비슷한 크기가 되게 (고해상도로 그리고 작게 줄여 또렷하게) */
const WORLD_PER_PX = 0.0019;
/** 이름·체력바 바로 위 (말풍선 꼬리 끝 높이) */
export const BUBBLE_Y = 2.0;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * 말풍선 그림: 흰 둥근 상자 + 작은 꼬리, 은은한 그림자. 이름은 바로 아래 이름표에 있으니 넣지 않는다.
 * 내 말은 왼쪽에 주황 점, 다른 사람 말은 하늘색 점으로만 구분한다.
 */
function bubbleTexture(text: string, mine: boolean): { tex: THREE.CanvasTexture; w: number; h: number } {
  const lines = wrapChat(text, 14);
  const font = '600 44px "Pretendard", "Malgun Gothic", "Noto Sans KR", sans-serif';
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const textW = Math.max(...lines.map((l) => probe.measureText(l).width));
  const padX = 30;
  const padY = 18;
  const lineH = 56;
  const dot = 22;
  const boxW = Math.ceil(Math.max(120, textW + padX * 2 + dot));
  const boxH = lines.length * lineH + padY * 2;
  const tail = 14;
  const margin = 14; // 그림자 자리
  const W = boxW + margin * 2;
  const H = boxH + tail + margin * 2;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const x0 = margin;
  const y0 = margin;
  const r = Math.min(boxH / 2, 34);
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.28)';
  g.shadowBlur = 12;
  g.shadowOffsetY = 3;
  g.fillStyle = '#ffffff';
  roundRect(g, x0, y0, boxW, boxH, r);
  g.fill();
  g.beginPath();
  g.moveTo(W / 2 - 11, y0 + boxH - 1);
  g.quadraticCurveTo(W / 2, y0 + boxH + 4, W / 2, y0 + boxH + tail);
  g.quadraticCurveTo(W / 2 + 3, y0 + boxH + 4, W / 2 + 11, y0 + boxH - 1);
  g.closePath();
  g.fill();
  g.restore();
  // 누가 한 말인지: 작은 색 점
  g.fillStyle = mine ? '#f59e0b' : '#38bdf8';
  g.beginPath();
  g.arc(x0 + padX + 5, y0 + padY + lineH / 2, 7, 0, Math.PI * 2);
  g.fill();
  g.font = font;
  g.fillStyle = '#1f2128';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const cx = x0 + dot / 2 + boxW / 2;
  lines.forEach((l, i) => g.fillText(l, cx, y0 + padY + lineH * i + lineH / 2 + 2));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, w: W, h: H };
}

/**
 * 채팅 말풍선: 말한 사람 머리 위를 따라다니다 몇 초 뒤 사라진다. 한 사람당 하나 (새 말이 오면 바꾼다)
 */
export class ChatBubbles {
  readonly layer = new THREE.Group();
  private items: Bubble[] = [];

  /** 감정 표현: 머리 위로 톡 떠올라 사라진다 (말풍선과 따로, 한 사람당 하나) */
  addEmote(who: string, e: string, now: number) {
    this.remove((b) => b.who === who && !!b.emote);
    const tex = emoteTexture(e);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.renderOrder = 11;
    sprite.userData.born = now;
    this.layer.add(sprite);
    this.items.push({ who, sprite, until: now + EMOTE_MS, tex, emote: true });
  }

  add(who: string, _name: string, text: string, now: number) {
    this.remove((b) => b.who === who && !b.emote);
    const { tex, w, h } = bubbleTexture(text, who === 'me');
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(w * WORLD_PER_PX, h * WORLD_PER_PX, 1);
    sprite.renderOrder = 10;
    // 나타날 때 살짝 커지며 튀어나온다
    sprite.userData.born = now;
    sprite.userData.base = { x: sprite.scale.x, y: sprite.scale.y };
    this.layer.add(sprite);
    this.items.push({ who, sprite, until: now + BUBBLE_MS, tex });
  }

  /** @param pos 말한 사람의 지금 위치 (안 보여야 하면 null) */
  update(now: number, pos: (who: string) => { x: number; z: number } | null) {
    this.remove((b) => now > b.until);
    for (const b of this.items) {
      const p = pos(b.who);
      b.sprite.visible = !!p;
      if (!p) continue;
      if (b.emote) {
        // 떠오르면서 톡 커졌다가, 끝에 흐려진다 (말풍선이 있으면 그 옆으로)
        const age = now - (b.sprite.userData.born as number);
        const t = Math.min(1, age / 220);
        const size = 0.5 * (0.6 + 0.4 * (1 - Math.pow(1 - t, 3)) + (t >= 1 ? 0.04 * Math.sin(age / 90) : 0));
        b.sprite.scale.set(size, size, 1);
        const beside = this.items.find((o) => o.who === b.who && !o.emote);
        b.sprite.position.set(p.x + (beside ? beside.sprite.scale.x / 2 + 0.3 : 0), BUBBLE_Y + 0.25 + Math.min(0.5, age / 2000), p.z);
        (b.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, (b.until - now) / 400);
        continue;
      }
      const base = b.sprite.userData.base as { x: number; y: number };
      const t = Math.min(1, (now - (b.sprite.userData.born as number)) / 180);
      const pop = 0.85 + 0.15 * (1 - Math.pow(1 - t, 3));
      b.sprite.scale.set(base.x * pop, base.y * pop, 1);
      b.sprite.position.set(p.x, BUBBLE_Y + b.sprite.scale.y / 2, p.z);
      // 사라지기 0.5초 전부터 흐려진다
      (b.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, (b.until - now) / 500);
    }
  }

  private remove(pred: (b: Bubble) => boolean) {
    this.items = this.items.filter((b) => {
      if (!pred(b)) return true;
      b.sprite.removeFromParent();
      b.tex.dispose();
      (b.sprite.material as THREE.SpriteMaterial).dispose();
      return false;
    });
  }

  dispose() {
    this.remove(() => true);
  }
}
