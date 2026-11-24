import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { appUrl } from "@/lib/settings";

export async function POST() {
  await destroySession();
  return NextResponse.redirect(new URL("/", appUrl()), 303);
}
