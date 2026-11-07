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

/** 캔버스 글자 크기 → 월드 높이 (작을수록 말풍선이 작다). 0.0058 은 캐릭터에 비해 커서 약 28% 줄임 */
const WORLD_PER_PX = 0.0042;

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
 * 말풍선 그림: 위에 말한 사람 이름표, 흰 둥근 상자 + 아래 꼬리, 은은한 그림자.
 * 내 말은 주황 테두리, 다른 사람 말은 하늘색 테두리.
 */
function bubbleTexture(name: string, text: string, mine: boolean): { tex: THREE.CanvasTexture; w: number; h: number } {
  const lines = wrapChat(text, 16);
  const font = '600 30px "Pretendard", "Noto Sans KR", sans-serif';
  const nameFont = '800 22px "Pretendard", "Noto Sans KR", sans-serif';
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const textW = Math.max(...lines.map((l) => probe.measureText(l).width));
  probe.font = nameFont;
  const nameW = probe.measureText(name).width;
  const pad = 22;
  const lineH = 38;
  const nameH = 30;
  const boxW = Math.ceil(Math.min(600, Math.max(110, textW + pad * 2, nameW + pad * 2)));
  const boxH = nameH + lines.length * lineH + 18;
  const tail = 16;
  const margin = 10; // 그림자 자리
  const W = boxW + margin * 2;
  const H = boxH + tail + margin * 2;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const accent = mine ? '#f59e0b' : '#38bdf8';
  const x0 = margin;
  const y0 = margin;
  // 그림자 + 상자 + 꼬리
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 10;
  g.shadowOffsetY = 3;
  g.fillStyle = 'rgba(255,255,255,0.96)';
  roundRect(g, x0, y0, boxW, boxH, 18);
  g.fill();
  g.beginPath();
  g.moveTo(W / 2 - 12, y0 + boxH - 1);
  g.lineTo(W / 2, y0 + boxH + tail);
  g.lineTo(W / 2 + 12, y0 + boxH - 1);
  g.closePath();
  g.fill();
  g.restore();
  // 테두리
  g.strokeStyle = accent;
  g.lineWidth = 3;
  roundRect(g, x0 + 1.5, y0 + 1.5, boxW - 3, boxH - 3, 17);
  g.stroke();
  // 이름표
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = nameFont;
  g.fillStyle = accent;
  g.fillText(name, x0 + pad, y0 + 8 + nameH / 2);
  // 말
  g.font = font;
  g.fillStyle = '#1c1c22';
  g.textAlign = 'center';
  lines.forEach((l, i) => g.fillText(l, W / 2, y0 + nameH + 6 + lineH * i + lineH / 2));
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

  add(who: string, name: string, text: string, now: number) {
    this.remove((b) => b.who === who && !b.emote);
    const { tex, w, h } = bubbleTexture(name, text, who === 'me');
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
        const size = 0.75 * (0.6 + 0.4 * (1 - Math.pow(1 - t, 3)) + (t >= 1 ? 0.04 * Math.sin(age / 90) : 0));
        b.sprite.scale.set(size, size, 1);
        const beside = this.items.some((o) => o.who === b.who && !o.emote);
        b.sprite.position.set(p.x + (beside ? 0.9 : 0), 2.45 + Math.min(0.5, age / 2000), p.z);
        (b.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, (b.until - now) / 400);
        continue;
      }
      const base = b.sprite.userData.base as { x: number; y: number };
      const t = Math.min(1, (now - (b.sprite.userData.born as number)) / 180);
      const pop = 0.85 + 0.15 * (1 - Math.pow(1 - t, 3));
      b.sprite.scale.set(base.x * pop, base.y * pop, 1);
      b.sprite.position.set(p.x, 2.5 + b.sprite.scale.y / 2, p.z);
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
