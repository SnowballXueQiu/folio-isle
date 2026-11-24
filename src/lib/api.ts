import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./perms";
import { log } from "./log";

/** Wrap a route handler: maps HttpError/ZodError to JSON responses and checks same-origin for mutations. */
export function handler<A extends unknown[]>(fn: (req: Request, ...a: A) => Promise<Response>) {
  return async (req: Request, ...a: A): Promise<Response> => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("origin");
        const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
        if (origin && host && new URL(origin).host !== host) {
          return NextResponse.json({ error: "跨站请求被拒绝" }, { status: 403 });
        }
      }
      return await fn(req, ...a);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: "参数错误", issues: e.issues }, { status: 400 });
      log.error("api.error", { path: new URL(req.url).pathname, error: e instanceof Error ? e.message : String(e) });
      return NextResponse.json({ error: "服务器错误" }, { status: 500 });
    }
  };
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
