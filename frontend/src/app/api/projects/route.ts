/**
 * Gecmis calismalar vekili: listele, kaydet, tumunu sil (Faz 4).
 *
 * FastAPI `/api/projects` uc noktalarinin karsiligi (bkz.
 * backend/app/api/routes/projects.py). Tarayici backend'e dogrudan gitmiyor;
 * token burada ekleniyor ve yanit arayuzun kayit sekline cevriliyor.
 */
import { callBackend, jsonError } from "@/lib/backend-proxy";
import { toWorkRecord, type BackendProject } from "@/lib/project-record";

/** Backend'in izin verdigi en buyuk sayfa (projects.py `MAX_LIST_LIMIT`). */
const LIST_LIMIT = 100;

export async function GET(): Promise<Response> {
  const call = await callBackend(`/api/projects?limit=${LIST_LIMIT}`, {
    fallbackError: "Çalışmalar yüklenemedi.",
  });
  if (!call.ok) return call.response;

  const projects = (await call.response.json()) as BackendProject[];
  const now = Date.now();
  return Response.json(
    projects.map((project) => toWorkRecord(project, now)),
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
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
    fallbackError: "Çalışma kaydedilemedi.",
  });
  if (!call.ok) return call.response;

  const project = (await call.response.json()) as BackendProject;
  return Response.json(toWorkRecord(project), {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE(): Promise<Response> {
  const call = await callBackend("/api/projects", {
    method: "DELETE",
    fallbackError: "Çalışmalar silinemedi.",
  });
  if (!call.ok) return call.response;
  return new Response(null, { status: 204 });
}
