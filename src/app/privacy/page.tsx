import Link from "next/link";
import styles from "./privacy.module.css";

export const metadata = {
  title: "개인정보처리방침 | coffeeTide",
};

const contactName = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_NAME?.trim();
const contactEmail = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim();

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <article className={styles.policy}>
        <header>
          <Link href="/" className={styles.back}>← coffeeTide</Link>
          <h1>개인정보처리방침</h1>
          <p>시행일: 2026년 8월 17일</p>
        </header>

        <section>
          <h2>1. 처리하는 정보와 목적</h2>
          <ul>
            <li>Google 로그인 식별자와 이메일: 로그인, 사용자 구분, 기기 간 동기화</li>
            <li>업무·메모·위젯·규칙·설정·Spark 브리핑: 업무 화면과 AI 브리핑 제공</li>
            <li>선택한 외부 서비스의 접근·갱신 토큰: Gmail, Calendar, Drive, Outlook, Notion 기능 수행</li>
            <li>음성·회의 녹음, 전사 텍스트 및 회의 정보: 음성 인식, 회의록·요약·결정사항·할 일 생성</li>
            <li>알림 구독 정보: 사용자가 켠 브리핑 알림 발송</li>
          </ul>
          <p>
            게스트 이용과 PC 폴더·IndexedDB 원문 보관 데이터는 원칙적으로 해당 브라우저나
            기기에 남으며, 사용자가 클라우드 기능을 선택한 경우에만 서버로 전송됩니다.
          </p>
        </section>

        <section>
          <h2>2. 외부 서비스 이용</h2>
          <p>
            사용자가 연동하거나 기능을 실행할 때 Google, Microsoft, Notion, Supabase 및 설정된
            AI 제공자에게 필요한 범위의 정보가 전송될 수 있습니다. Google 로그인과
            Gmail·Calendar·Drive 연동은 서로 별도이며, 외부 서비스 권한은 설정에서 언제든
            해제할 수 있습니다.
          </p>
        </section>

        <section>
          <h2>3. 음성·회의록 기능에 관한 안내</h2>
          <ul>
            <li>
              사용자가 음성 인식이나 회의록 분석을 실행하면 녹음 구간과 전사 텍스트가
              Google Gemini API로 전송됩니다.
            </li>
            <li>
              무료 Gemini API를 사용하는 경우 전송한 콘텐츠가 Google의 정책에 따라 제품
              개선에 사용될 수 있습니다. 회사 기밀, 고객 정보, 인사·계약 정보 등 민감한
              내용을 전송하기 전에는 필요한 권한과 동의를 확인해야 합니다.
            </li>
            <li>
              Google Drive 저장형 회의록의 원본 음성, 구간별 전사, 전체 전사, 회의록,
              AI 요약 및 처리 상태는 사용자의 개인 Google Drive에 저장하며 Supabase에는
              저장하지 않습니다. Supabase에는 사용자 로그인 식별자와 암호화된 Drive 연결
              자격정보만 보관합니다.
            </li>
            <li>
              Drive 접근은 coffeeTide가 만들었거나 사용자가 선택한 파일에 한정되는 최소 권한을
              사용합니다. 분석 과정에서 Gemini의 임시 파일 저장 기능을 사용하는 경우 처리가
              끝난 뒤 삭제를 요청하며, Google 측 처리와 보관에는 Google의 정책이 적용됩니다.
            </li>
          </ul>
          <p>
            음성·회의록 분석은 선택 기능입니다. 사용하지 않으면 녹음이나 전사 텍스트를
            Gemini에 전송하지 않습니다.
          </p>
        </section>

        <section>
          <h2>4. 보관과 삭제</h2>
          <p>
            계정 데이터는 서비스 이용 중 보관하고 계정 삭제 시 Supabase의 사용자별 데이터와
            저장된 연동 자격정보를 함께 삭제합니다. 외부 서비스 토큰은 연동 해제 시 서버에서
            삭제합니다. 법령상 별도 보관 의무가 생기는 경우에는 해당 기간만 분리 보관합니다.
          </p>
          <p>
            개인 Google Drive에 저장된 회의 원본과 결과 파일은 사용자가 직접 관리하며,
            coffeeTide 계정을 삭제하거나 Drive 연동을 해제해도 자동으로 삭제되지 않습니다.
            해당 파일을 없애려면 Google Drive에서 직접 삭제해야 합니다.
          </p>
        </section>

        <section>
          <h2>5. 보호 조치</h2>
          <p>
            외부 서비스 자격정보는 서버에서 AES-256-GCM으로 암호화하며, 브라우저에서 접근할 수
            없는 서버 전용 권한으로 저장합니다. 전송 구간은 HTTPS를 사용합니다.
          </p>
        </section>

        <section>
          <h2>6. 이용자의 권리</h2>
          <p>
            설정에서 외부 서비스 연동을 해제하거나 계정을 삭제할 수 있습니다. 브라우저에 남은
            게스트·로컬 데이터는 브라우저의 사이트 데이터 삭제 기능으로 제거할 수 있습니다.
            Google Drive 연동을 해제하면 이후 회의 파일의 조회·저장과 분석 재개가 중단됩니다.
          </p>
        </section>

        <section>
          <h2>7. 개인정보 문의</h2>
          {contactName || contactEmail ? (
            <p>
              담당: {contactName || "coffeeTide 운영자"}
              {contactEmail && (
                <>
                  <br />
                  이메일: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                </>
              )}
            </p>
          ) : (
            <p className={styles.notice}>
              개인정보 문의: coffeeTide 서비스 운영자
            </p>
          )}
        </section>
      </article>
    </main>
  );
}
