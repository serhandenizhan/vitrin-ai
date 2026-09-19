/**
 * Yönetim paneli (Faz 6, Kaan) — backend admin API'sinin tipleri ve vekillerin
 * ortak doğrulamaları.
 *
 * YETKİ BURADA DEĞİL: her admin ucu backend'de `require_admin` ile kontrol
 * ediliyor (`SECURITY.md` 3.2). Vekiller yalnızca adrese giden değeri
 * doğruluyor (kimlik bir UUID mi) ve gövdeyi bilinen alanlarla yeniden
 * kuruyor — istemcinin yolladığı fazladan alan backend'e hiç ulaşmıyor.
 * Sözleşme: `backend/app/api/routes/admin.py`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Backend sınırlarının aynası (`CreditGrantRequest`, `list_users`, `stats`). */
export const CREDIT_AMOUNT_MAX = 10_000;
export const CREDIT_REASON_MIN = 3;
export const CREDIT_REASON_MAX = 500;
export const USERS_PER_PAGE = 25;
export const STATS_DAY_OPTIONS = [7, 30, 90] as const;

export type AdminBilling = {
  status: string | null;
  access_until: string | null;
  deletion_requested_at: string | null;
  used_this_period: number | null;
  quota_snapshot: number | null;
  period_ends_at: string | null;
  plan_id: string | null;
  background_tier: string | null;
  bonus_available: number;
  project_count: number;
  last_usage_at: string | null;
  is_admin: boolean;
};

export type AdminUserRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  billing: AdminBilling | null;
};

export type AdminUserPage = { users: AdminUserRow[]; page: number; per_page: number };

export type CreditGrant = {
  id: string;
  amount: number;
  used: number;
  reason: string;
  granted_by?: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type AdminUserDetail = {
  account: Omit<AdminUserRow, "billing">;
  billing: AdminBilling | null;
  periods: {
    id: string;
    starts_at: string;
    ends_at: string;
    quota_snapshot: number;
    used_this_period: number;
    status: string;
    plan_id: string;
  }[];
  credit_grants: CreditGrant[];
  transactions: {
    id: string;
    type: string;
    status: string;
    amount_minor_units: number;
    currency: string;
    invoice_reference: string | null;
    created_at: string;
  }[];
  consents: {
    document_type: string;
    document_version: string;
    locale: string;
    source: string;
    recorded_at: string;
  }[];
  recent_usage: { created_at: string; event_type: string }[];
  open_actions: {
    id: string;
    kind: string;
    status: string;
    attempts: number;
    last_error: string | null;
    created_at: string;
  }[];
};

/** Zemin yönetim paneli satırı. Sözleşme: `GET /api/admin/backgrounds`. */
export type AdminBackground = {
  id: string;
  tier: "basic" | "full";
  is_active: boolean;
  created_at: string;
  url: string;
  thumbnail_url: string;
  expires_in: number;
};

export type AdminStats = {
  days: number;
  usage: { today: number; last_7_days: number; last_30_days: number; all_time: number };
  reservations: { consumed: number; released: number; pending: number };
  subscriptions_by_status: { status: string; count: number }[];
  active_periods_by_plan: { plan_id: string; count: number }[];
  revenue: {
    type: string;
    status: string;
    currency: string;
    count: number;
    amount_minor_units: number;
  }[];
  credit_grants: { granted: number; used: number; outstanding: number };
  daily_usage: { day: string; count: number }[];
  daily_signups: { day: string; count: number }[];
  operations: { open_alerts: number; open_actions: number; open_storage_jobs: number };
};

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Başarılı backend yanıtını önbelleğe alınmadan aynen iletir. */
export async function relayJson(response: Response, status = response.status): Promise<Response> {
  return Response.json(await response.json(), { status, headers: NO_STORE });
}
