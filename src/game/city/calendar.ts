/**
 * 게임 달력: 1일째 = 2026년 11월 1일. 게임 속 '며칠째'를 실제 날짜로 바꾼다.
 */
const EPOCH = Date.UTC(2026, 10, 1);
const DAY_MS = 86_400_000;

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface GameDate {
  year: number;
  /** 0 = 1월 */
  month: number;
  date: number;
  /** 0 = 일요일 */
  dow: number;
}

export function dateOfDay(day: number): GameDate {
  const d = new Date(EPOCH + (day - 1) * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate(), dow: d.getUTCDay() };
}

export function dayOfDate(year: number, month: number, date: number): number {
  return Math.round((Date.UTC(year, month, date) - EPOCH) / DAY_MS) + 1;
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function formatDay(day: number) {
  const g = dateOfDay(day);
  return `${g.year}년 ${g.month + 1}월 ${g.date}일 (${WEEKDAYS[g.dow]})`;
}

/** 근무 기록 한 건 (근무를 시작한 날 기준) */
export interface WorkEntry {
  job: string;
  name: string;
  icon: string;
  pay: number;
  result: 'done' | 'quit' | 'down' | 'abandon' | 'fired';
  checked: number;
  robbers: number;
  /** 순찰 완료 횟수 */
  patrols?: number;
  /** 시작·끝 시각 (게임 분) */
  from: number;
  to: number;
}

export const RESULT_LABEL: Record<WorkEntry['result'], string> = {
  done: '근무 완료',
  quit: '조기 퇴근',
  down: '강도에게 당함',
  abandon: '무단 이탈',
  fired: '해고',
};

/** HUD 용 짧은 날짜: 11월 3일 (화) */
export function shortDay(day: number) {
  const g = dateOfDay(day);
  return `${g.month + 1}월 ${g.date}일 (${WEEKDAYS[g.dow]})`;
}
