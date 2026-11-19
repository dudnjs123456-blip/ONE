import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '개인정보 처리방침 · Together' };

/**
 * 개인정보 처리방침 (초안). 수집 항목은 코드에서 실제로 받는 값 기준.
 * [확인 필요] 표시는 운영자가 사실을 확인해 채워야 하는 곳.
 * 법률 자문이 아니다 — 공개 전에 전문가 검토를 받는 것이 좋다.
 */
export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-[#0b0d17] px-4 py-10 text-[15px] leading-relaxed text-white/85">
      <article className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-white">개인정보 처리방침</h1>
          <p className="text-sm text-white/50">초안 · 시행일 [확인 필요] · 운영자: [확인 필요: 개인 또는 사업자 이름]</p>
          <p>Together(이하 “게임”)는 「개인정보 보호법」에 따라 이용자의 개인정보를 아래와 같이 처리합니다.</p>
        </header>

        <Section n={1} title="수집하는 항목과 목적">
          <Table
            head={['항목', '언제', '목적']}
            rows={[
              ['아이디, 비밀번호(암호화 저장)', '회원가입·로그인', '계정 만들기, 본인 확인'],
              ['게임 기록(닉네임, 레벨, 경험치, 골드, 가방·옷·집·일 기록, NPC 호감도와 대화 요약 기억 등)', '게임 중 자동 저장', '진행 상황을 이어서 하기'],
              ['NPC에게 입력한 말과 최근 대화 내용(최대 20줄)', 'NPC와 대화할 때', 'AI가 NPC 대답을 만들기'],
              ['캐릭터 위치·모습·감정 표현, 마을 채팅 글', '마을에 접속해 있는 동안', '다른 이용자에게 내 캐릭터 보여주기 (저장하지 않음)'],
              ['마이크 음성, 접속 IP 주소', '음성 대화·전화를 켤 때', '이용자끼리 직접 음성 연결 (서버에 녹음·저장하지 않음)'],
              ['접속 IP 주소, 접속 시각', 'AI 대화 요청 시', '요청 횟수 제한(남용 방지)'],
            ]}
          />
          <p className="text-sm text-white/55">이메일·전화번호·실명은 받지 않습니다. 로그인용으로 아이디를 내부 주소(아이디@players.ironfist.game) 형태로 바꿔 쓰지만 실제 메일은 보내지 않습니다.</p>
        </Section>

        <Section n={2} title="보관 기간과 파기">
          <ul className="list-disc space-y-1 pl-5">
            <li>계정·게임 기록: 회원 탈퇴 시까지. 탈퇴하면 지체 없이 삭제합니다. [확인 필요: 탈퇴 방법 — 현재 게임 안 탈퇴 기능 없음, 문의처로 요청]</li>
            <li>AI 대화 내용: 게임 서버는 저장하지 않습니다. AI 회사는 아래 4번의 기간 동안 보관할 수 있습니다.</li>
            <li>요청 횟수 기록: 최대 하루가 지나면 자동으로 지워집니다.</li>
            <li>파기 방법: 전자 파일은 복구할 수 없는 방법으로 삭제합니다.</li>
          </ul>
        </Section>

        <Section n={3} title="처리 위탁">
          <Table
            head={['받는 곳', '맡기는 일']}
            rows={[
              ['Supabase Inc.', '회원 인증, 게임 기록 저장, 실시간 접속(마을·음성 연결 신호)'],
              ['Vercel Inc.', '웹사이트 호스팅, 서버 실행'],
              ['Anthropic PBC', 'NPC 대답 생성(AI)'],
              ['Google LLC', '음성 연결용 주소 확인(STUN 서버, IP 주소 처리)'],
            ]}
          />
        </Section>

        <Section n={4} title="개인정보의 국외 이전">
          <p>아래 회사는 해외에 있어, 서비스를 이용하면 정보가 해외로 전송됩니다. 이전을 원하지 않으면 해당 기능(NPC 대화, 음성 대화)을 쓰지 않거나 탈퇴할 수 있습니다. 다만 이 경우 그 기능을 이용할 수 없습니다.</p>
          <Table
            head={['받는 회사 (나라)', '보내는 항목', '언제·어떻게', '목적', '보관 기간']}
            rows={[
              ['Anthropic PBC (미국)', 'NPC에게 입력한 말, 최근 대화, 게임 상황(레벨·호감도 등)', 'NPC와 대화할 때마다 인터넷(암호화)으로', 'AI 대답 생성', '[확인 필요: Anthropic API 데이터 보관 정책 — 예: 최대 30일]'],
              ['Supabase Inc. (서버 위치 [확인 필요])', '아이디, 비밀번호(암호화), 게임 기록', '가입·저장 시', '계정·기록 저장', '탈퇴 시까지'],
              ['Vercel Inc. (미국)', '접속 IP, 요청 내용', '접속할 때', '호스팅', '[확인 필요]'],
              ['Google LLC (미국)', '접속 IP 주소', '음성 대화를 켤 때', '음성 연결', '[확인 필요]'],
            ]}
          />
          <p className="text-sm text-white/55">NPC 대화창에 이름·연락처 같은 개인정보를 입력하지 마세요.</p>
        </Section>

        <Section n={5} title="AI 이용 안내">
          <p>게임 속 일부 NPC(박 반장, 엄마)의 대답은 생성형 AI(Anthropic Claude)가 만든 것입니다. AI가 만든 대사에는 대화창에 “AI 생성” 표시가 붙습니다. AI 답변은 사실과 다르거나 어색할 수 있습니다.</p>
        </Section>

        <Section n={6} title="이용자의 권리">
          <p>이용자는 언제든 자신의 개인정보를 열람·정정·삭제하거나 처리 정지를 요구할 수 있습니다. 아래 문의처로 요청하면 지체 없이 처리합니다. 만 14세 미만은 [확인 필요: 가입 제한 또는 법정대리인 동의 절차].</p>
        </Section>

        <Section n={7} title="안전 조치">
          <ul className="list-disc space-y-1 pl-5">
            <li>비밀번호는 암호화해 저장하고, 통신은 HTTPS로 암호화합니다.</li>
            <li>데이터베이스는 본인 기록만 읽고 쓸 수 있게 접근을 제한합니다(행 단위 보안).</li>
          </ul>
        </Section>

        <Section n={8} title="개인정보 보호책임자 · 문의처">
          <p>이름: [확인 필요] · 이메일: [확인 필요]</p>
          <p className="text-sm text-white/55">개인정보 침해 신고·상담: 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이 118), 개인정보분쟁조정위원회(kopico.go.kr, 1833-6972)</p>
        </Section>

        <Section n={9} title="처리방침의 변경">
          <p>이 방침이 바뀌면 시행 7일 전부터 이 페이지로 알립니다.</p>
        </Section>

        <footer className="border-t border-white/10 pt-4 text-sm">
          <Link href="/" className="underline hover:text-white">← 게임으로 돌아가기</Link>
        </footer>
      </article>
    </main>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-white">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-white/5 text-white">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-white/10 align-top">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
