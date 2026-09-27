export const AUTH_COOKIE = "oc_auth";

/** Deterministic cookie value derived from the shared password; the raw password is never stored. */
export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`onechat:v1:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function passwordFromEnv(env: Record<string, string | undefined> = process.env): string | undefined {
  const pw = env.APP_PASSWORD;
  return pw && pw.length > 0 ? pw : undefined;
}
