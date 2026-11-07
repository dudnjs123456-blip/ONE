/** 서버 시각 (모두가 같은 동네 시계를 쓰기 위한 기준) */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}
