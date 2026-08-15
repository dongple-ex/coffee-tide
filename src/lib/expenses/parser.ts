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

  // 금액 추출 정규식
  let amount: string | undefined;
  // 1. 숫자 + '원' (예: 15,000원, 12000원)
  const krwMatch = trimmed.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*(?:원)/i);
  if (krwMatch) {
    amount = krwMatch[1].replace(/,/g, "");
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

  // 사용처 추출
  let merchant: string | undefined;
  if (/스타벅스/i.test(trimmed)) merchant = "스타벅스";
  else if (/교보문고/i.test(trimmed)) merchant = "교보문고";
  else if (/카카오택시/i.test(trimmed)) merchant = "카카오택시";

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
