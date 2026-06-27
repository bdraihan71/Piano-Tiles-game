import { NextRequest, NextResponse } from "next/server";
import { verifyTelegramAuth } from "@/lib/telegram";
import { getDailyLeaderboard, submitDailyScore } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dateStr = new Date().toISOString().split("T")[0];
    const leaderboard = await getDailyLeaderboard(dateStr);
    return NextResponse.json({ success: true, leaderboard });
  } catch (e) {
    console.error("GET scores error:", e);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { initData, score } = body;

    if (!initData || typeof score !== "number") {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const authResult = verifyTelegramAuth(initData, botToken);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized / Invalid Signature" },
        { status: 401 }
      );
    }

    const user = authResult.user;
    // Fallback to name if username is missing
    const username = user.username ? `@${user.username}` : user.first_name;
    const dateStr = new Date().toISOString().split("T")[0];

    // Submit score
    await submitDailyScore(dateStr, username, score);

    // Fetch updated leaderboard
    const leaderboard = await getDailyLeaderboard(dateStr);

    return NextResponse.json({ success: true, leaderboard });
  } catch (e) {
    console.error("POST scores error:", e);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
