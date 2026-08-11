import { NextRequest, NextResponse } from "next/server";
import { getFinanceSnapshot } from "@/lib/finance/snapshot";

export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  return NextResponse.json(await getFinanceSnapshot(forceRefresh));
}
