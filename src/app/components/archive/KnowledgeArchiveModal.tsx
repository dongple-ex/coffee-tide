"use client";

import { useEffect, useRef, useState } from "react";
import type { KnowledgeArchiveDocument, KnowledgeArchiveSearchResult } from "@/lib/knowledge/archive";
import { loadArchivedDocument, searchArchivedDocuments } from "@/lib/knowledge/archiveClient";
import styles from "./KnowledgeArchiveModal.module.css";

interface Props {
  onClose: () => void;
  onOpenDocument: (document: KnowledgeArchiveDocument) => void;
  ownerScope: string;
  refreshToken?: number;
}

const DOC_LABELS: Record<KnowledgeArchiveDocument["docType"], string> = {
  doc: "일반 문서",
  report: "보고서",
  email: "이메일",
  meeting_note: "회의록",
  checklist: "체크리스트",
  code: "코드",
};

export function KnowledgeArchiveModal({ onClose, onOpenDocument, ownerScope, refreshToken = 0 }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeArchiveSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hasDriveArchive = results.some((result) => result.document.contentProvider === "google_drive");
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = async (nextQuery = query) => {
    setLoading(true);
    const response = await searchArchivedDocuments(nextQuery, ownerScope, 30);
    setResults(response.results);
    setCloudAvailable(response.cloudAvailable);
    setLoading(false);
  };

  const handleOpen = async (summary: KnowledgeArchiveDocument) => {
    setOpeningId(summary.id);
    setNotice(null);
    try {
      onOpenDocument(await loadArchivedDocument(summary, ownerScope));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "문서를 다시 열지 못했습니다.");
    } finally {
      setOpeningId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    searchArchivedDocuments("", ownerScope, 30).then((response) => {
      if (cancelled) return;
      setResults(response.results);
      setCloudAvailable(response.cloudAvailable);
      setLoading(false);
    });
    inputRef.current?.focus();
    return () => {
      cancelled = true;
    };
  }, [ownerScope, refreshToken]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-archive-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>RAG 문서 보관소</p>
            <h2 id="knowledge-archive-title">완료 문서 아카이브</h2>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="아카이브 닫기">
            ×
          </button>
        </header>

        <form
          className={styles.searchForm}
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="프로젝트명, 결정 사항, 회의 내용으로 검색"
            aria-label="완료 문서 검색어"
          />
          <button type="submit" disabled={loading}>검색</button>
        </form>

        <p className={styles.storageNote}>
          {cloudAvailable
            ? hasDriveArchive
              ? "Google Drive 원문과 Supabase 검색 인덱스를 사용하며, 이 기기에는 오프라인 캐시를 보관합니다."
              : "이 기기의 IndexedDB와 로그인된 Supabase 아카이브를 함께 검색합니다."
            : "현재는 이 기기의 IndexedDB 아카이브를 검색합니다. 로그인 및 서버 스키마 연결 시 클라우드 결과도 합쳐집니다."}
        </p>
        {notice && <p className={styles.errorNotice} role="status">{notice}</p>}

        <div className={styles.results} aria-live="polite">
          {loading ? (
            <div className={styles.empty}>아카이브 인덱스를 검색하고 있습니다…</div>
          ) : results.length === 0 ? (
            <div className={styles.empty}>
              {query.trim() ? "일치하는 완료 문서가 없습니다." : "아직 완료 처리한 문서가 없습니다."}
            </div>
          ) : (
            results.map((result) => (
              <article key={result.document.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <span className={styles.typeBadge}>{DOC_LABELS[result.document.docType]}</span>
                    <span className={styles.storageBadge}>
                      {result.document.contentProvider === "google_drive"
                        ? "Drive 원문"
                        : result.storage === "cloud" ? "클라우드" : "이 기기"}
                    </span>
                    <h3>{result.document.title}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleOpen(result.document)}
                    disabled={openingId === result.document.id}
                  >
                    {openingId === result.document.id ? "불러오는 중…" : "다시 열기"}
                  </button>
                </div>
                <p>{result.excerpt || "본문 미리보기가 없습니다."}</p>
                {result.document.keywords?.length > 0 && (
                  <div className={styles.keywords} aria-label="검색 핵심어">
                    {result.document.keywords.slice(0, 8).map((keyword) => (
                      <span key={keyword}>#{keyword}</span>
                    ))}
                  </div>
                )}
                <div className={styles.meta}>
                  <span>{new Date(result.document.archivedAt).toLocaleString("ko-KR")}</span>
                  <span>{result.document.chunkCount}개 청크</span>
                  <span>v{result.document.version}</span>
                  {result.document.driveUrl && (
                    <a href={result.document.driveUrl} target="_blank" rel="noreferrer">Drive에서 보기 ↗</a>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
