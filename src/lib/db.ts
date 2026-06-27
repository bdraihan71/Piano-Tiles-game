import fs from "fs";
import path from "path";

export interface ScoreEntry {
  user: string;
  score: number;
}

const LOCAL_DB_PATH = path.join(process.cwd(), ".next", "cybergrid_scores.json");

// Helper to read local scores file
function readLocalScores(): Record<string, ScoreEntry[]> {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Failed to read local scores JSON file:", e);
  }
  return {};
}

// Helper to write local scores file
function writeLocalScores(data: Record<string, ScoreEntry[]>) {
  try {
    const dir = path.dirname(LOCAL_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write local scores JSON file:", e);
  }
}

// REST call helper to Vercel KV (Upstash)
async function runKvCommand(command: any[]): Promise<any> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error("Vercel KV credentials missing");
  }

  const response = await fetch(`${url}/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    // Ensure Vercel function doesn't cache DB queries
    cache: "no-store",
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`KV command failed: ${response.statusText} (${errText})`);
  }

  const data = await response.json();
  return data.result;
}

export async function submitDailyScore(
  dateStr: string,
  username: string,
  score: number
): Promise<void> {
  const key = `leaderboard:${dateStr}`;

  // Try Redis KV
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      // ZADD with GT (Greater Than) flag - only update score if it is higher
      await runKvCommand(["ZADD", key, "GT", score, username]);
      return;
    } catch (e) {
      console.error("Vercel KV write error, falling back to local file storage:", e);
    }
  }

  // Fallback to Local JSON DB
  const scores = readLocalScores();
  if (!scores[key]) {
    scores[key] = [];
  }

  const existingEntry = scores[key].find((entry) => entry.user === username);
  if (existingEntry) {
    if (score > existingEntry.score) {
      existingEntry.score = score;
    }
  } else {
    scores[key].push({ user: username, score });
  }

  // Sort descending and keep top 100
  scores[key].sort((a, b) => b.score - a.score);
  scores[key] = scores[key].slice(0, 100);

  writeLocalScores(scores);
}

export async function getDailyLeaderboard(
  dateStr: string
): Promise<ScoreEntry[]> {
  const key = `leaderboard:${dateStr}`;

  // Try Redis KV
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      // Fetch user scores sorted in descending order
      const rawResult = await runKvCommand(["ZREVRANGE", key, 0, 9, "WITHSCORES"]);
      if (Array.isArray(rawResult)) {
        const leaderboard: ScoreEntry[] = [];
        for (let i = 0; i < rawResult.length; i += 2) {
          leaderboard.push({
            user: rawResult[i],
            score: parseInt(rawResult[i + 1], 10),
          });
        }
        return leaderboard;
      }
    } catch (e) {
      console.error("Vercel KV read error, falling back to local file storage:", e);
    }
  }

  // Fallback to Local JSON DB
  const scores = readLocalScores();
  const dayScores = scores[key] || [];
  return dayScores.slice(0, 10).map((entry) => ({
    user: entry.user,
    score: entry.score,
  }));
}
