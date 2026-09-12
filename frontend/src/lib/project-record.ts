/**
 * Gecmis calisma kaydinin sekli ve backend yanitindan donusumu.
 *
 * Sunucu ve istemci ortak kullaniyor ("use client" YOK): vekil route'lari
 * backend'in `snake_case` yanitini burada arayuzun `camelCase` kaydina
 * ceviriyor; arayuz backend'in alan adlarini hic gormuyor.
 */

/** FastAPI `/api/projects` yanitindaki tek kayit (backend/app/api/routes/projects.py `_serialize`). */
export type BackendProject = {
  id: string;
  file_name: string;
  created_at: string;
  is_mocked: boolean;
  duration_seconds: number | null;
  result_url: string;
  thumbnail_url: string;
  expires_in: number;
};

export type WorkRecord = {
  id: string;
  fileName: string;
  /** Unix zamani (ms). */
  createdAt: number;
  isMocked: boolean;
  durationSeconds: number | null;
  /**
   * Sonuc gorselinin adresi — R2'nin imzali adresi DEGIL, ayni kokenden
   * vekil (`/api/projects/{id}/result`). Sebep: studyo gorseli tuvale ciziyor
   * ve baska kokenden gelen bir gorsel tuvali "kirletip" disa aktarmayi
   * bozuyor; ayni kokende bu sorun yok, R2 CORS kuralina da bagli degil.
   */
  resultUrl: string;
  /** Kucuk resim: dogrudan R2 imzali adresi (`<img>` icin CORS gerekmiyor). */
  thumbnailUrl: string;
  /** `thumbnailUrl`in gecerliliginin bittigi an (ms). */
  expiresAt: number;
};

const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vekil, istemciden gelen kimligi backend adresine eklemeden once dogruluyor:
 * `../` ya da `?` iceren bir deger backend'de baska bir yola gidebilirdi.
 */
export function isProjectId(value: string): boolean {
  return PROJECT_ID_PATTERN.test(value);
}

export function toWorkRecord(project: BackendProject, now = Date.now()): WorkRecord {
  return {
    id: project.id,
    fileName: project.file_name,
    createdAt: Date.parse(project.created_at),
    isMocked: project.is_mocked,
    durationSeconds: project.duration_seconds,
    resultUrl: `/api/projects/${encodeURIComponent(project.id)}/result`,
    thumbnailUrl: project.thumbnail_url,
    expiresAt: now + project.expires_in * 1000,
  };
}
