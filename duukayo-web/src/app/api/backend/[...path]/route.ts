import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (path.some((p) => !p || p === ".." || p === "." || p.includes("/")))
    return new NextResponse("Invalid path", { status: 400 });
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const origin = process.env.WEB_ORIGIN || "http://localhost:3000";
  if (mutating && request.headers.get("origin") !== origin)
    return NextResponse.json(
      { detail: "Untrusted request origin" },
      { status: 403 },
    );
  const base = process.env.API_URL || "http://127.0.0.1:8000";
  const headers = new Headers({ "Content-Type": request.headers.get("content-type") || "application/json" });
  for (const key of ["cookie", "x-csrftoken", "x-cart-token", "origin", "referer"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const upstream = await fetch(
      `${base}/api/v1/${path.map(encodeURIComponent).join("/")}/${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body: mutating ? await request.arrayBuffer() : undefined,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(request.headers.get("content-type")?.includes("multipart/form-data") ? 210000 : 15000),
      },
    );
    const response = new NextResponse(
      upstream.status === 204 ? null : await upstream.text(),
      {
        status: upstream.status,
        headers: {
          "Content-Type":
            upstream.headers.get("content-type") || "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
    for (const cookie of upstream.headers.getSetCookie())
      response.headers.append("Set-Cookie", cookie);
    return response;
  } catch {
    return NextResponse.json(
      { detail: "The shop server is unavailable. Please try again." },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE, proxy as PUT };
