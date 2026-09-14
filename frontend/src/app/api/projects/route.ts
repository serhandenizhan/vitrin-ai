/**
 * Gecmis calismalar vekili: listele, kaydet, tumunu sil (Faz 4).
 *
 * FastAPI `/api/projects` uc noktalarinin karsiligi (bkz.
 * backend/app/api/routes/projects.py). Tarayici backend'e dogrudan gitmiyor;
 * token burada ekleniyor ve yanit arayuzun kayit sekline cevriliyor.
 */
import { authRequired, callBackend, jsonError } from "@/lib/backend-proxy";
import {
  toWorkRecord,
  type BackendProject,
  type BackendProjectPage,
} from "@/lib/project-record";
import { getAccessToken } from "@/lib/supabase/access-token";

/** Backend'in izin verdigi en buyuk sayfa (projects.py `MAX_LIST_LIMIT`). */
const LIST_LIMIT = 100;

export async function GET(request: Request): Promise<Response> {
  const cursor = new URL(request.url).searchParams.get("cursor");
  const query = new URLSearchParams({ limit: String(LIST_LIMIT) });
  if (cursor) query.set("cursor", cursor);
  const call = await callBackend(`/api/projects?${query}`, {
    fallbackError: "Çalışmalar yüklenemedi.",
  });
  if (!call.ok) return call.response;

  const page = (await call.response.json()) as BackendProjectPage;
  const now = Date.now();
  return Response.json({
    items: page.items.map((project) => toWorkRecord(project, now)),
    nextCursor: page.next_cursor,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  // Oturum GOVDEDEN ONCE (arka plan kaldirma vekiliyle ayni): giris yapmamis
  // birinin yuklemesi hic okunmuyor. `callBackend` token'i yeniden aliyor;
  // bu kontrol yalnizca gereksiz govde okumayi onluyor.
  if (!(await getAccessToken())) return authRequired();
  const expectedUserId = request.headers.get("X-Expected-User-Id");
  if (!expectedUserId) return jsonError("Oturum kimliği eksik.", 409);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("İstek okunamadı.", 400);
  }

  const result = form.get("result");
  const thumbnail = form.get("thumbnail");
  const fileName = form.get("fileName");
  if (!(result instanceof File) || !(thumbnail instanceof File) || typeof fileName !== "string") {
    return jsonError("Kaydedilecek çalışma eksik.", 400);
  }

  // Yalnizca bilinen alanlar yeniden paketleniyor; istemcinin ekledigi
  // baska bir alan backend'e hic ulasmiyor. Asil dogrulama (magic byte,
  // boyut, dosya adi uzunlugu) backend'de.
  const upstreamForm = new FormData();
  upstreamForm.append("result", result, "result.png");
  upstreamForm.append("thumbnail", thumbnail, "thumbnail.png");
  upstreamForm.append("file_name", fileName);
  upstreamForm.append("is_mocked", form.get("isMocked") === "true" ? "true" : "false");
  const duration = form.get("durationSeconds");
  if (typeof duration === "string" && duration !== "") {
    upstreamForm.append("duration_seconds", duration);
  }

  const call = await callBackend("/api/projects", {
    method: "POST",
    body: upstreamForm,
    headers: { "X-Expected-User-Id": expectedUserId },
    fallbackError: "Çalışma kaydedilemedi.",
  });
  if (!call.ok) return call.response;

  const project = (await call.response.json()) as BackendProject;
  return Response.json(toWorkRecord(project), {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE(request: Request): Promise<Response> {
  const expectedUserId = request.headers.get("X-Expected-User-Id");
  if (!expectedUserId) return jsonError("Oturum kimliği eksik.", 409);
  const call = await callBackend("/api/projects", {
    method: "DELETE",
    headers: { "X-Expected-User-Id": expectedUserId },
    fallbackError: "Çalışmalar silinemedi.",
  });
  if (!call.ok) return call.response;
  return new Response(null, { status: 204 });
}
