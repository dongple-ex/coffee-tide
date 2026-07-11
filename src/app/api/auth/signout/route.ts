import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/cookies";

export async function GET(request: NextRequest) {
  return clearSession(NextResponse.redirect(new URL("/", request.url)));
}
