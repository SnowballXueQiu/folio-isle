import { NextResponse } from "next/server";
import { authenticate, handleRpc } from "@/lib/mcp";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const unauthorized = () =>
  NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Missing or invalid project token. Create one in the project's settings → MCP 接入." } },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="folio-isle"' } }
  );

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await authenticate(slug, req.headers.get("authorization"));
  if (!ctx) return unauthorized();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as Parameters<typeof handleRpc>[1][];
  const out: object[] = [];
  for (const m of msgs.slice(0, 20)) {
    try {
      const r = await handleRpc(ctx, m);
      if (r) out.push(r);
    } catch (e) {
      log.error("mcp.error", { project: ctx.projectId, method: m?.method, error: String(e) });
      out.push({ jsonrpc: "2.0", id: m?.id ?? null, error: { code: -32603, message: "Internal error" } });
    }
    if (m?.method === "tools/call") log.info("mcp.call", { project: ctx.projectId, token: ctx.tokenId, tool: (m.params as { name?: string })?.name });
  }
  if (!out.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(batch ? out : out[0], { headers: { "Cache-Control": "no-store" } });
}

// Stateless server: no server-initiated stream and no sessions to end.
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
export const DELETE = GET;
