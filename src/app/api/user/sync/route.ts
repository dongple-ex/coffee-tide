import { NextResponse } from "next/server";
import { getCloudUserData, saveCloudUserData } from "@/lib/db/syncAdapter";
import { getActiveDbProvider } from "@/lib/db/client";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ success: false, error: "userId is required." }, { status: 400 });
  }

  const provider = getActiveDbProvider();
  if (provider === "guest") {
    return NextResponse.json({
      success: true,
      provider: "guest",
      message: "No cloud DB configured. Using guest local storage.",
      state: null,
    });
  }

  const state = await getCloudUserData(userId);
  return NextResponse.json({
    success: true,
    provider,
    state,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, state } = body;

    if (!userId || !state) {
      return NextResponse.json(
        { success: false, error: "userId and state are required." },
        { status: 400 }
      );
    }

    const provider = getActiveDbProvider();
    if (provider === "guest") {
      return NextResponse.json({
        success: true,
        provider: "guest",
        saved: false,
        message: "Guest mode. Saved to client local storage only.",
      });
    }

    const saved = await saveCloudUserData(userId, state);
    return NextResponse.json({
      success: true,
      provider,
      saved,
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Failed to sync user data.";
    return NextResponse.json(
      { success: false, error: errMessage },
      { status: 500 }
    );
  }
}
