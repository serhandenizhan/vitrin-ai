/** Yasal metinlerde tek yerden kullanilan veri sorumlusu bilgileri. */

export { LEGAL_DOCUMENT_VERSION } from "@/lib/legal-version";

export const DATA_CONTROLLER_NAME =
  process.env.NEXT_PUBLIC_DATA_CONTROLLER_NAME?.trim() || "Vitrin AI";

export const LEGAL_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim() || null;

export const LEGAL_ADDRESS =
  process.env.NEXT_PUBLIC_LEGAL_ADDRESS?.trim() || null;

export const LEGAL_PHONE =
  process.env.NEXT_PUBLIC_LEGAL_PHONE?.trim() || null;

export const LEGAL_KEP =
  process.env.NEXT_PUBLIC_LEGAL_KEP?.trim() || null;

export const LEGAL_REGISTRY_NUMBER =
  process.env.NEXT_PUBLIC_LEGAL_REGISTRY_NUMBER?.trim() || null;

export const LEGAL_IDENTITY_COMPLETE = Boolean(
  process.env.NEXT_PUBLIC_DATA_CONTROLLER_NAME?.trim() &&
    LEGAL_CONTACT_EMAIL &&
    LEGAL_ADDRESS &&
    LEGAL_PHONE &&
    LEGAL_REGISTRY_NUMBER,
);

const IS_PRODUCTION_DEPLOYMENT =
  process.env.VERCEL_ENV === "production" ||
  process.env.VITRIN_DEPLOY_ENV === "production";

if (
  IS_PRODUCTION_DEPLOYMENT &&
  !LEGAL_IDENTITY_COMPLETE
) {
  throw new Error(
    "Production yayini icin NEXT_PUBLIC_DATA_CONTROLLER_NAME, " +
      "NEXT_PUBLIC_LEGAL_CONTACT_EMAIL, NEXT_PUBLIC_LEGAL_ADDRESS, " +
      "NEXT_PUBLIC_LEGAL_PHONE ve NEXT_PUBLIC_LEGAL_REGISTRY_NUMBER zorunludur.",
  );
}
