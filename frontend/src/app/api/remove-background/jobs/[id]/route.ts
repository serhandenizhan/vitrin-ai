/**
 * Siradaki kesim isinin durumu ya da sonucu (Faz 7).
 *
 * Tarayici bunu birkac saniyede bir yokluyor (bkz. `lib/cutout-job.ts`).
 * Backend `202 {status}` (suruyor), `200 image/png` (bitti) ya da bir hata
 * (`code`, `retry_safe`) doner; hata eslemesi `callBackend`'de ortak. Sahiplik
 * backend'de: is kimligi `(oturumdaki kullanici, anahtar)`, baska bir
 * kullanicinin anahtari 404.
 */
import { callBackend, jsonError } from "@/lib/backend-proxy";

type Context = { params: Promise<{ id: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return jsonError("İşlem bulunamadı.", 404);

  const call = await callBackend(`/api/remove-background/jobs/${id}`, {
    fallbackError: "Arka plan kaldırma işlemi başarısız oldu.",
  });
  if (!call.ok) return call.response;

  const upstream = call.response;
  if (upstream.headers.get("content-type")?.startsWith("image/png")) {
    return new Response(await upstream.arrayBuffer(), {
      headers: {
        "Content-Type": "image/png",
        "X-Mock-Response": "false",
        // Kesim kullaniciya ozel; ara katmanlarda onbelleklenmemeli.
        "Cache-Control": "no-store",
      },
    });
  }

  const job = (await upstream.json().catch(() => null)) as { status?: string } | null;
  return Response.json(
    { status: job?.status ?? "queued" },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
