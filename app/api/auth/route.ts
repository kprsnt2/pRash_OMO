import { NextResponse } from "next/server";
import { AUTH_COOKIE, hashPassword, passwordFromEnv } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const password = passwordFromEnv();
  if (!password) return NextResponse.json({ ok: true, authRequired: false });

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  if (!body.password || (await hashPassword(body.password)) !== (await hashPassword(password))) {
    return NextResponse.json({ ok: false, error: "wrong password" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true, authRequired: true });
  response.cookies.set(AUTH_COOKIE, await hashPassword(password), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
