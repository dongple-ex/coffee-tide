import { receiveTradingAlert } from "@/lib/telegram/tradingAlerts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return receiveTradingAlert(request);
}
