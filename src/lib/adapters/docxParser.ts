// .docx (MS Word) 파일 텍스트 추출 파서 — mammoth 기반

import mammoth from "mammoth";

/**
 * .docx 버퍼 또는 ArrayBuffer에서 순수 텍스트를 추출
 */
export async function extractTextFromDocx(
  input: Buffer | ArrayBuffer
): Promise<string> {
  try {
    const buffer =
      input instanceof ArrayBuffer ? Buffer.from(input) : input;
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  } catch (err) {
    console.warn("[coffeeTide] .docx 파싱 실패:", err);
    return "";
  }
}
