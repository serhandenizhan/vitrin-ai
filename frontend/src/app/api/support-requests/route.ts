import { callBackend } from "@/lib/backend-proxy";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "İstek okunamadı." }, { status: 400 }); }
  const call = await callBackend("/api/support-requests", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    fallbackError: "Mesaj gönderilemedi.",
  });
  if (!call.ok) return call.response;
  return Response.json(await call.response.json(), { status: 201 });
}
