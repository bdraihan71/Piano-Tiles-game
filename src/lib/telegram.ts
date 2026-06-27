import crypto from "crypto";

export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export function verifyTelegramAuth(
  initData: string,
  botToken: string | undefined
): { isValid: boolean; user?: TelegramUserData } {
  if (!initData) {
    return { isValid: false };
  }

  try {
    // If bot token is missing, bypass verification in development mode for offline testing.
    if (!botToken) {
      if (process.env.NODE_ENV === "development") {
        console.warn("TELEGRAM_BOT_TOKEN is missing. Allowing mock bypass in development mode.");
        const urlParams = new URLSearchParams(initData);
        const userJSON = urlParams.get("user");
        const user = userJSON ? JSON.parse(userJSON) : { id: 99999, first_name: "LocalRunner" };
        return { isValid: true, user };
      }
      console.error("TELEGRAM_BOT_TOKEN is missing. Verification rejected.");
      return { isValid: false };
    }

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    if (!hash) {
      return { isValid: false };
    }

    // Generate sorted data check string
    const keys = Array.from(urlParams.keys())
      .filter((k) => k !== "hash")
      .sort();

    const dataCheckString = keys
      .map((k) => `${k}=${urlParams.get(k)}`)
      .join("\n");

    // HMAC of botToken using "WebAppData"
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    // HMAC of dataCheckString using secretKey
    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (calculatedHash === hash) {
      const userJSON = urlParams.get("user");
      const user = userJSON ? JSON.parse(userJSON) : undefined;
      return { isValid: true, user };
    }
  } catch (e) {
    console.error("Auth verification failed:", e);
  }

  return { isValid: false };
}
