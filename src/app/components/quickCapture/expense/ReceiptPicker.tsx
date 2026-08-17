"use client";

import React, { useRef, useState } from "react";
import styles from "./ExpenseWorkspace.module.css";
import { UiIcon } from "../../UiIcon";

interface ReceiptPickerProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;

export const ReceiptPicker: React.FC<ReceiptPickerProps> = ({ onFileSelected, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("영수증 사진은 최대 4MB까지 첨부할 수 있습니다.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setError("JPG, PNG, WebP 이미지 파일만 선택할 수 있습니다.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    onFileSelected(file);
  };

  const handleClear = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
        disabled={disabled}
        style={{ display: "none" }}
      />
      {!previewUrl ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className={styles.secondaryButton}
          style={{ width: "100%", justifyContent: "center" }}
        >
          <UiIcon name="paperclip" size={18} />
          <span>영수증 사진 추가 (최대 4MB)</span>
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className={styles.receiptThumbnail}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="선택한 영수증 미리보기" />
          </div>
          <button
            type="button"
            onClick={handleClear}
            className={styles.secondaryButton}
            style={{ fontSize: "0.75rem", minHeight: 36, padding: "0 8px" }}
          >
            사진 제거
          </button>
        </div>
      )}
      {error && <div style={{ color: "var(--danger, #ef4444)", fontSize: "0.75rem" }}>{error}</div>}
    </div>
  );
};
