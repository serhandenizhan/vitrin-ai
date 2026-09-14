/** Yasal metinlerde tek yerden kullanilan veri sorumlusu bilgileri. */

export { LEGAL_DOCUMENT_VERSION } from "@/lib/legal-version";

export const DATA_CONTROLLER_NAME =
  process.env.NEXT_PUBLIC_DATA_CONTROLLER_NAME?.trim() || "Vitrin AI";

export const LEGAL_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim() || null;

const IS_PRODUCTION_DEPLOYMENT =
  process.env.VERCEL_ENV === "production" ||
  process.env.VITRIN_DEPLOY_ENV === "production";

if (
  IS_PRODUCTION_DEPLOYMENT &&
  (!process.env.NEXT_PUBLIC_DATA_CONTROLLER_NAME?.trim() || !LEGAL_CONTACT_EMAIL)
) {
  throw new Error(
    "Production yayini icin NEXT_PUBLIC_DATA_CONTROLLER_NAME ve " +
      "NEXT_PUBLIC_LEGAL_CONTACT_EMAIL zorunludur.",
  );
}
