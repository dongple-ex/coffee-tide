export interface ExpenseDraft {
  amount?: string;
  currency: string;
  merchant?: string;
  category?: string;
  paymentMethod?: string;
  occurredAt?: string;
  relatedItemIds: string[];
  reimbursable?: boolean;
  confidence: Record<string, number>;
  sourceText: string;
}

const KOREAN_AMOUNT_UNITS: Record<string, number> = {
  억: 100_000_000,
  만: 10_000,
  천: 1_000,
  백: 100,
  십: 10,
};

function extractKrwAmount(text: string): { amount: string; expression: string } | undefined {
  const match = text.match(/((?:\d[\d,]*(?:\.\d+)?\s*(?:억|만|천|백|십)?\s*)+)원/);
  if (!match) return undefined;

  const expression = match[0];
  const numericExpression = match[1];
  const parts = [...numericExpression.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(억|만|천|백|십)?/g)];
  if (parts.length === 0) return undefined;

  const amount = parts.reduce((sum, part) => {
    const value = Number(part[1].replace(/,/g, ""));
    const multiplier = part[2] ? KOREAN_AMOUNT_UNITS[part[2]] : 1;
    return sum + value * multiplier;
  }, 0);

  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return { amount: String(amount), expression };
}

function extractMerchant(text: string, amountExpression?: string): string | undefined {
  const explicit = text.match(/(?:사용처|상호|가맹점)\s*[:：]?\s*([^,，/]+?)(?=\s+(?:에서|금액|결제|\d)|[,，/]|$)/i);
  if (explicit?.[1]) return explicit[1].trim();

  const location = text.match(/(?:^|\s)([가-힣A-Za-z0-9][가-힣A-Za-z0-9&.'·_-]{1,30})에서(?:\s|$)/);
  if (location?.[1]) return location[1];

  let remainder = amountExpression ? text.replace(amountExpression, " ") : text;
  remainder = remainder
    .replace(/(?:오늘|어제|내일|점심|저녁|아침|식사|식비|커피|카페|회식|택시비?|교통비?|주유|주차|버스|지하철|도서|서적|책|교재|사무용품|비품)/gi, " ")
    .replace(/(?:법인카드|법카|개인카드|신용카드|체크카드|현금|계좌이체)/gi, " ")
    .replace(/(?:USD|JPY|EUR|KRW|dollar|won|원|엔|유로)/gi, " ")
    .replace(/\b\d{1,2}[.:시]\d{0,2}\b/g, " ")
    .replace(/[,:，/()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!remainder || remainder.length > 30 || /^(비용|결제|사용)$/.test(remainder)) return undefined;
  return remainder;
}

/**
 * 자연어 텍스트(예: "오늘 점심 15000원 법인카드", "USD 25 택시비")에서 비용 정보를 추출합니다.
 */
export function parseExpenseText(sourceText: string): ExpenseDraft {
  const trimmed = sourceText.trim();
  const confidence: Record<string, number> = {};

  let currency = "KRW";
  confidence.currency = 0.8;

  if (/(?:usd|\$|\bdollar\b)/i.test(trimmed)) {
    currency = "USD";
    confidence.currency = 0.95;
  } else if (/(?:jpy|円|엔|¥)/i.test(trimmed)) {
    currency = "JPY";
    confidence.currency = 0.95;
  } else if (/(?:eur|유로|€)/i.test(trimmed)) {
    currency = "EUR";
    confidence.currency = 0.95;
  } else if (/(?:krw|원|\bwon\b)/i.test(trimmed)) {
    currency = "KRW";
    confidence.currency = 0.95;
  }

  // 금액 추출: 숫자 금액과 2만 3천원 같은 한국어 단위 표기를 모두 지원한다.
  let amount: string | undefined;
  let amountExpression: string | undefined;
  const krwAmount = extractKrwAmount(trimmed);
  if (krwAmount) {
    amount = krwAmount.amount;
    amountExpression = krwAmount.expression;
    confidence.amount = 0.95;
  } else {
    // 2. 통화 기호/문자 뒤/앞 숫자 (예: $25, USD 30, 50.50)
    const generalMatch = trimmed.match(/(?:[\$¥€]|usd|jpy|eur|krw)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/i);
    if (generalMatch && generalMatch[1]) {
      amount = generalMatch[1].replace(/,/g, "");
      confidence.amount = 0.85;
    }
  }

  // 결제 수단 추출
  let paymentMethod: string | undefined;
  if (/법인카드|법카/i.test(trimmed)) {
    paymentMethod = "법인카드";
    confidence.paymentMethod = 0.9;
  } else if (/개인카드|신용카드|체크카드/i.test(trimmed)) {
    paymentMethod = "개인카드";
    confidence.paymentMethod = 0.9;
  } else if (/현금|계좌이체/i.test(trimmed)) {
    paymentMethod = "현금";
    confidence.paymentMethod = 0.9;
  }

  // 분류 추출
  let category: string | undefined;
  if (/점심|저녁|식사|식비|커피|스타벅스|카페|회식/i.test(trimmed)) {
    category = "식비";
    confidence.category = 0.85;
  } else if (/택시|교통|ktx|주유|주차|버스|지하철/i.test(trimmed)) {
    category = "교통비";
    confidence.category = 0.85;
  } else if (/도서|서적|책|교재/i.test(trimmed)) {
    category = "도서구입비";
    confidence.category = 0.85;
  } else if (/사무용품|비품/i.test(trimmed)) {
    category = "사무용품비";
    confidence.category = 0.85;
  }

  // 사용처 추출: 명시 필드, '~에서' 표현, 금액·분류·결제수단을 제외한 상호 후보 순서로 찾는다.
  const merchant = extractMerchant(trimmed, amountExpression);
  if (merchant) confidence.merchant = 0.75;

  return {
    amount,
    currency,
    merchant,
    category,
    paymentMethod,
    occurredAt: new Date().toISOString(),
    relatedItemIds: [],
    reimbursable: paymentMethod === "개인카드",
    confidence,
    sourceText,
  };
}
