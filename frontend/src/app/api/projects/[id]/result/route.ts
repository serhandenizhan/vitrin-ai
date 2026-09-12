/**
 * Kayitli bir calismanin sonuc gorselini AYNI KOKENDEN verir (Faz 4).
 *
 * Neden R2'nin imzali adresi dogrudan kullanilmiyor: gecmisten acilan sonuc
 * studyoda tuvale ciziliyor. Baska kokenden gelen gorsel tuvali "kirletiyor"
 * ve disa aktarma sessizce bos donuyor (kok CLAUDE.md, Konva tuzagi); bunu
 * onlemek R2 bucket'inda her ortam icin CORS kurali istiyordu (acik takip
 * maddesi 3). Gorsel sunucudan sunucuya cekilip buradan verilince CORS hic
 * devreye girmiyor.
 *
 * Imzali adres her istekte backend'den yeniden aliniyor; suresi dolmus bir
 * adres istemcide saklanmiyor. Sahiplik kontrolu backend'de.
 */
import { callBackend, jsonError } from "@/lib/backend-proxy";
import { isProjectId, type BackendProject } from "@/lib/project-record";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  if (!isProjectId(id)) return jsonError("Çalışma bulunamadı.", 404);

  const call = await callBackend(`/api/projects/${id}`, {
    fallbackError: "Çalışma açılamadı.",
  });
  if (!call.ok) return call.response;

  const project = (await call.response.json()) as BackendProject;

  let image: Response;
  try {
    image = await fetch(project.result_url, { cache: "no-store" });
  } catch {
    return jsonError("Görsel depolamaya ulaşılamadı.", 502);
  }
  if (!image.ok || !image.body) {
    return jsonError("Görsel depolamadan alınamadı.", 502);
  }

  return new Response(image.body, {
    headers: {
      "Content-Type": "image/png",
      // Kullaniciya ozel icerik; ara katmanlarda onbelleklenmemeli.
      "Cache-Control": "private, no-store",
    },
  });
}
