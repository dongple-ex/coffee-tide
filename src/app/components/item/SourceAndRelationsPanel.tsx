"use client";

import React, { useState } from "react";
import type { AiArtifact, ContentAsset, ItemRelation } from "@/lib/data/contracts";
import styles from "./SourceAndRelationsPanel.module.css";

interface SourceAndRelationsPanelProps {
  itemId: string;
  rawContent?: string;
  driveUrl?: string;
  assets?: ContentAsset[];
  relations?: ItemRelation[];
  artifacts?: AiArtifact[];
}

export const SourceAndRelationsPanel: React.FC<SourceAndRelationsPanelProps> = ({
  itemId,
  rawContent,
  driveUrl,
  assets = [],
  relations = [],
  artifacts = [],
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loadedAssets, setLoadedAssets] = useState<ContentAsset[]>(assets);
  const [loadedRelations, setLoadedRelations] = useState<ItemRelation[]>(relations);
  const [loadedArtifacts, setLoadedArtifacts] = useState<AiArtifact[]>(artifacts);
  const [loading, setLoading] = useState(false);

  const handleToggle = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    setLoading(true);
    void Promise.all([
      fetch(`/api/assets?itemId=${encodeURIComponent(itemId)}`).then((response) => response.ok ? response.json() : null),
      fetch(`/api/relations?itemId=${encodeURIComponent(itemId)}`).then((response) => response.ok ? response.json() : null),
      fetch(`/api/ai/artifacts?itemId=${encodeURIComponent(itemId)}`).then((response) => response.ok ? response.json() : null),
    ]).then(([assetData, relationData, artifactData]) => {
      if (assetData?.assets) setLoadedAssets(assetData.assets);
      if (relationData?.relations) setLoadedRelations(relationData.relations);
      if (artifactData?.artifacts) setLoadedArtifacts(artifactData.artifacts);
    }).finally(() => {
      setLoading(false);
    });
  };

  const openAsset = async (assetId: string) => {
    const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/download`);
    if (!response.ok) return;
    const data = await response.json();
    if (data.downloadUrl) window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  };

  const hasAnyData =
    Boolean(rawContent) ||
    Boolean(driveUrl) ||
    loadedAssets.length > 0 ||
    loadedRelations.length > 0 ||
    loadedArtifacts.length > 0 ||
    Boolean(itemId);

  if (!hasAnyData) return null;

  return (
    <div className={styles.container}>
      <button
        type="button"
        onClick={handleToggle}
        className={styles.toggleHeader}
        aria-expanded={isOpen}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
          <span>📎</span>
          원문·연관 자료 및 분석 정보
        </span>
        <span style={{ fontSize: "0.72rem", color: "var(--text-muted, #a1a1aa)" }}>
          {isOpen ? "▲ 접기" : "▼ 상세보기"}
        </span>
      </button>

      {isOpen && (
        <div className={styles.contentWrapper}>
          {loading && <div className={styles.sectionTitle}>연관 자료를 확인하고 있습니다…</div>}
          {/* 1. 원문 링크 및 텍스트 */}
          {(rawContent || driveUrl) && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>원문 정보</div>
              {driveUrl && (
                <div style={{ marginBottom: 4 }}>
                  <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--primary-light, #a5b4fc)", textDecoration: "underline", fontSize: "0.78rem" }}
                  >
                    Google Drive 백업 원문 열기 ↗
                  </a>
                </div>
              )}
              {rawContent && <div className={styles.rawTextSnippet}>{rawContent}</div>}
            </div>
          )}

          {/* 2. 첨부 및 자산 */}
          {loadedAssets.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>첨부 자산 ({loadedAssets.length}개)</div>
              <ul style={{ margin: 0, paddingLeft: 16, color: "var(--text-muted, #a1a1aa)" }}>
                {loadedAssets.map((asset) => (
                  <li key={asset.id} style={{ marginBottom: 2 }}>
                    <button type="button" onClick={() => void openAsset(asset.id)} className={styles.assetButton}>
                      {asset.kind === "audio" ? "음성 녹음" : "문서"} (
                      {asset.mimeType}
                      {asset.sizeBytes ? `, ${(asset.sizeBytes / 1024).toFixed(1)} KB` : ""})
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 3. 연관 자료 */}
          {loadedRelations.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>연관 자료 ({loadedRelations.length}건)</div>
              <ul style={{ margin: 0, paddingLeft: 16, color: "var(--text-muted, #a1a1aa)" }}>
                {loadedRelations.map((rel) => (
                  <li key={rel.id} style={{ marginBottom: 2 }}>
                    관계 유형: <strong>{rel.relationType}</strong>
                    {rel.confidence && ` (신뢰도 ${Math.round(rel.confidence * 100)}%)`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 4. AI 파생 결과 */}
          {loadedArtifacts.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>AI 분석 결과 ({loadedArtifacts.length}건)</div>
              {loadedArtifacts.map((art) => (
                <div
                  key={art.id}
                  style={{
                    background: "var(--bg-card-solid, #18181b)",
                    padding: 8,
                    borderRadius: 6,
                    marginBottom: 4,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: "0.76rem" }}>
                      {art.artifactType === "summary" ? "요약" : "전사"}
                    </span>
                    <span
                      className={`${styles.badge} ${
                        art.status === "stale" ? styles.badgeStale : styles.badgeCurrent
                      }`}
                    >
                      {art.status === "stale" ? "수정 필요 (Stale)" : "최신"}
                    </span>
                  </div>
                  {art.contentText && (
                    <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--text-muted, #a1a1aa)" }}>
                      {art.contentText}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
