/**
 * 서울 동네 채팅: 같은 마을(town 채널)에 접속한 사람끼리 주고받는다.
 * 서버(DB)에 저장하지 않으므로 접속해 있는 동안의 대화만 보인다.
 */

/** 한 번에 보낼 수 있는 글자 수 */
export const CHAT_MAX = 80;
/** 연달아 보낼 수 있는 간격 (도배 방지, ms) */
export const CHAT_GAP_MS = 1000;
/** 채팅 기록은 이만큼만 기억한다 */
export const CHAT_KEEP = 50;
/** 머리 위 말풍선이 떠 있는 시간 (ms) */
export const BUBBLE_MS = 5000;

export interface ChatLine {
  /** 보낸 사람 id (나는 'me') */
  from: string;
  name: string;
  text: string;
  /** 받은 시각 (ms) */
  at: number;
  me: boolean;
}

/** 심한 욕은 별표로 가린다 (가볍게: 띄어 쓰거나 기호를 섞은 것도 잡는다) */
const BAD = ['시발', '씨발', 'ㅅㅂ', '씹', '병신', 'ㅂㅅ', '개새끼', '좆', '지랄', '니애미', '느금', 'fuck', 'shit', 'bitch'];

export function cleanChat(raw: string): string {
  let t = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  for (const w of BAD) {
    // 글자 사이에 공백·기호가 끼어도 잡는다 (시 발, 시.발)
    const re = new RegExp(w.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s.\\-_*~!]*'), 'gi');
    t = t.replace(re, (m) => '*'.repeat(Math.max(2, m.replace(/[\s.\-_*~!]/g, '').length)));
  }
  return t;
}

/** 말풍선용 줄 나누기: 한 줄에 대략 max 글자, 최대 3줄 (넘치면 …) */
export function wrapChat(text: string, max = 14): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    let word = w;
    while (word.length > max) {
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      lines.push(word.slice(0, max));
      word = word.slice(max);
    }
    if (!cur) cur = word;
    else if ((cur + ' ' + word).length <= max) cur += ' ' + word;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) return [...lines.slice(0, 2), lines[2].slice(0, max - 1) + '…'];
  return lines;
}

/** 감정 표현: 머리 위에 잠깐 떠오르는 큰 이모지 (채팅 기록엔 남지 않는다) */
export const EMOTES = ['👋', '😂', '❤️', '👍', '😮', '😢', '🎉', '💢'] as const;
/** 감정 표현이 떠 있는 시간 (ms) */
export const EMOTE_MS = 2200;
/** 감정 표현 연달아 누르기 간격 (ms) */
export const EMOTE_GAP_MS = 600;
