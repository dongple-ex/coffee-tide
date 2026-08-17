"use client";

import React, { useRef, useState } from "react";
import styles from "./ExpenseWorkspace.module.css";
import type { ContentAsset } from "@/lib/data/contracts";
import { UiIcon } from "../../UiIcon";

interface ReceiptGalleryProps {
  itemId: string;
  receipts: ContentAsset[];
  onAddReceipt: (itemId: string, file: File) => Promise<ContentAsset>;
  onDeleteReceipt: (assetId: string) => Promise<void>;
  disabled?: boolean;
}

export const ReceiptGallery: React.FC<ReceiptGalleryProps> = ({
  itemId,
  receipts,
  onAddReceipt,
  onDeleteReceipt,
  disabled,
}) => {
  const [selectedAsset, setSelectedAsset] = useState<ContentAsset | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [loadingView, setLoadingView] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenReceipt = async (asset: ContentAsset) => {
    setSelectedAsset(asset);
    setLoadingView(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${asset.id}/download`);
      if (!res.ok) throw new Error("영수증 다운로드 URL 발급에 실패했습니다.");
      const data = await res.json();
      setViewUrl(data.downloadUrl);
    } catch {
      setError("영수증을 불러오지 못했습니다.");
    } finally {
      setLoadingView(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedAsset(null);
    setViewUrl(null);
    setError(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      setError("영수증 사진은 최대 4MB까지 가능합니다.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      await onAddReceipt(itemId, file);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (assetId: string) => {
    if (!window.confirm("이 영수증 사진을 삭제할까요?")) return;
    setDeletingId(assetId);
    setError(null);
    try {
      await onDeleteReceipt(assetId);
      if (selectedAsset?.id === assetId) {
        handleCloseModal();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={handleFileChange}
        disabled={disabled || uploading || receipts.length >= 5}
        style={{ display: "none" }}
      />

      <div className={styles.receiptGallery}>
        {receipts.map((asset, idx) => (
          <button
            key={asset.id}
            type="button"
            className={styles.receiptThumbnail}
            onClick={() => handleOpenReceipt(asset)}
            disabled={disabled}
            title={`영수증 #${idx + 1} 보기`}
            aria-label={`영수증 #${idx + 1} 보기`}
          >
            <UiIcon name="paperclip" size={20} />
            <span style={{ fontSize: "0.6875rem", marginTop: 2 }}>#{idx + 1}</span>
          </button>
        ))}

        {receipts.length < 5 && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className={styles.receiptThumbnail}
            style={{ borderStyle: "dashed" }}
            title="영수증 추가"
            aria-label="영수증 추가"
          >
            <UiIcon name="plus" size={18} />
            <span style={{ fontSize: "0.625rem" }}>{uploading ? "업로드" : "추가"}</span>
          </button>
        )}
      </div>

      {error && <div style={{ color: "var(--danger, #ef4444)", fontSize: "0.75rem" }}>{error}</div>}

      {/* 영수증 확대 보기 모달 */}
      {selectedAsset && (
        <div className={styles.modalBackdrop} onClick={handleCloseModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>영수증 확인</h3>
              <button type="button" onClick={handleCloseModal} className={styles.iconButton} aria-label="닫기">
                ✕
              </button>
            </div>

            <div style={{ textAlign: "center", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {loadingView ? (
                <div>영수증 불러오는 중...</div>
              ) : viewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={viewUrl}
                  alt="영수증 원본 이미지"
                  style={{ maxWidth: "100%", maxHeight: "60vh", borderRadius: 8, objectFit: "contain" }}
                />
              ) : (
                <div>이미지를 불러올 수 없습니다.</div>
              )}
            </div>

            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", lineHeight: 1.4 }}>
              * 영수증 원본에는 상호, 가맹점 주소, 결제 정보 등 개인정보가 포함되어 있을 수 있습니다.
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => handleDelete(selectedAsset.id)}
                disabled={deletingId === selectedAsset.id}
                className={styles.secondaryButton}
                style={{ color: "var(--danger, #ef4444)", borderColor: "var(--danger, #ef4444)" }}
              >
                {deletingId === selectedAsset.id ? "삭제 중..." : "영수증 삭제"}
              </button>
              <button type="button" onClick={handleCloseModal} className={styles.primaryButton}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
