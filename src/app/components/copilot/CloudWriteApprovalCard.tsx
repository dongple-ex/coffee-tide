"use client";

import type { CloudWriteApproval } from "@/lib/cloudTools/externalWrites";
import styles from "./cloudWriteApprovalCard.module.css";

interface Props {
  approval: CloudWriteApproval;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CloudWriteApprovalCard({ approval, busy, onConfirm, onCancel }: Props) {
  const expiresAt = new Date(approval.expiresAt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <section className={styles.card} aria-label="외부 서비스 변경 최종 승인">
      <div className={styles.header}>
        <div>
          <div className={styles.badge}>🔐 외부 변경 최종 승인</div>
          <strong>{approval.preview.title}</strong>
        </div>
        <span>Phase D</span>
      </div>
      <dl className={styles.details}>
        <div>
          <dt>도구</dt>
          <dd>{approval.toolId}</dd>
        </div>
        <div>
          <dt>대상</dt>
          <dd>{approval.preview.target}</dd>
        </div>
        {approval.preview.account && (
          <div>
            <dt>계정</dt>
            <dd>{approval.preview.account}</dd>
          </div>
        )}
        <div>
          <dt>변경 내용</dt>
          <dd>
            <ul>
              {approval.preview.changes.map((change) => <li key={change}>{change}</li>)}
            </ul>
          </dd>
        </div>
      </dl>
      <p className={styles.warning}>{approval.preview.warning}</p>
      <p className={styles.expiry}>이 승인은 {expiresAt}까지 한 번만 사용할 수 있습니다.</p>
      <div className={styles.actions}>
        <button type="button" onClick={onCancel} disabled={busy}>취소</button>
        <button type="button" className={styles.confirm} onClick={onConfirm} disabled={busy}>
          {busy ? "처리 중…" : "승인하고 실행"}
        </button>
      </div>
    </section>
  );
}
