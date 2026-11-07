import * as THREE from 'three';
import { BUBBLE_MS, wrapChat } from '../city/chat';

interface Bubble {
  who: string;
  sprite: THREE.Sprite;
  until: number;
  tex: THREE.CanvasTexture;
}

/** 말풍선 그림: 흰 둥근 상자 + 아래 꼬리, 글자는 최대 3줄 */
function bubbleTexture(text: string): { tex: THREE.CanvasTexture; aspect: number } {
  const lines = wrapChat(text);
  const font = '600 34px "Pretendard", "Noto Sans KR", sans-serif';
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const textW = Math.max(...lines.map((l) => probe.measureText(l).width));
  const W = Math.ceil(Math.min(560, Math.max(120, textW + 48)));
  const lineH = 42;
  const boxH = lines.length * lineH + 26;
  const H = boxH + 22;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const r = 22;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(r, 2);
  g.lineTo(W - r, 2);
  g.quadraticCurveTo(W - 2, 2, W - 2, r);
  g.lineTo(W - 2, boxH - r);
  g.quadraticCurveTo(W - 2, boxH, W - r, boxH);
  // 꼬리 (가운데 아래)
  g.lineTo(W / 2 + 14, boxH);
  g.lineTo(W / 2, H - 2);
  g.lineTo(W / 2 - 14, boxH);
  g.lineTo(r, boxH);
  g.quadraticCurveTo(2, boxH, 2, boxH - r);
  g.lineTo(2, r);
  g.quadraticCurveTo(2, 2, r, 2);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#1d1d1f';
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, W / 2, 13 + lineH * i + lineH / 2));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: W / H };
}

/**
 * 채팅 말풍선: 말한 사람 머리 위를 따라다니다 몇 초 뒤 사라진다. 한 사람당 하나 (새 말이 오면 바꾼다)
 */
export class ChatBubbles {
  readonly layer = new THREE.Group();
  private items: Bubble[] = [];

  add(who: string, text: string, now: number) {
    this.remove((b) => b.who === who);
    const { tex, aspect } = bubbleTexture(text);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const h = 0.8 + 0.38 * (wrapChat(text).length - 1);
    sprite.scale.set(h * aspect, h, 1);
    sprite.renderOrder = 10;
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
      b.sprite.position.set(p.x, 2.6 + b.sprite.scale.y / 2, p.z);
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
