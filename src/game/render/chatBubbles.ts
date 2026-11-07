import * as THREE from 'three';
import { BUBBLE_MS, wrapChat } from '../city/chat';

interface Bubble {
  who: string;
  sprite: THREE.Sprite;
  until: number;
  tex: THREE.CanvasTexture;
}

/** 캔버스 글자 크기 → 월드 높이 (작을수록 말풍선이 작다) */
const WORLD_PER_PX = 0.0058;

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

  add(who: string, name: string, text: string, now: number) {
    this.remove((b) => b.who === who);
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
