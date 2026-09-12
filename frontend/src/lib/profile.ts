/**
 * Kullanici profili: kayit sorulari, dogrulamalari ve ekranda gorunen isim
 * (Faz 4, kullanici istegi 13.09.2026: "bir uygulamaya giris yaparken gereken
 * tum sorular, bizimkilere uygun sekilde").
 *
 * NE SORULUYOR, NEDEN:
 *  - Ad, soyad: hitap ("Hos geldiniz, Kaan") ve ileride fatura.
 *  - Isletme adi, isletme turu, sehir: urun kuyumculara yonelik; hangi tur
 *    isletmenin kullandigi paketlerin (Atolye/Magaza) ve zemin kutuphanesinin
 *    yonunu belirliyor.
 *  - Telefon (ISTEGE BAGLI): destek icin. Zorunlu tutmak icin bir sebep yok.
 *  - Kullanim kosullari + KVKK onayi (ZORUNLU), ticari ileti izni (ISTEGE
 *    BAGLI, AYRI): Turkiye'de ticari elektronik ileti izni zorunlu onaya
 *    baglanamiyor, ayri ve bos isaretli bir kutu olmali.
 *
 * NE SORULMUYOR, NEDEN: dogum tarihi, cinsiyet, T.C. kimlik no, adres. KVKK'nin
 * "amacla sinirli, olculu veri" ilkesi: bu urun icin hicbiri gerekli degil.
 * Fatura bilgileri odeme (Faz 5) geldiginde ve yalnizca ucretli planda sorulur.
 *
 * NEREDE TUTULUYOR: Supabase `user_metadata`. Ayri tablo acilmadi; alanlar
 * yalnizca GORUNUM ve iletisim icin.
 *
 * GUVENLIK / HUKUK SINIRI: `user_metadata` kullanicinin kendisi tarafindan
 * degistirilebilir (Supabase uyarisi). Bu yuzden:
 *  - Hicbir yetki karari bu alanlara dayanmiyor (yonetici: `admin_users`).
 *  - Onay kaydi (`terms_accepted_at`) burada yalnizca kolaylik icin duruyor;
 *    HUKUKEN ispat degeri icin onaylarin kullanicinin degistiremeyecegi bir
 *    tabloda (zaman, surum, IP) tutulmasi gerekiyor — Faz 7 / hukuki metinler
 *    yazilirken ele alinacak (bkz. ROADMAP).
 *  - Isim React ile metin olarak ciziliyor; icine yazilan etiket calismaz.
 */
import { TURKEY_CITIES, type TurkeyCity } from "@/lib/turkey-cities";

export const MAX_NAME_LENGTH = 50;
export const MAX_BUSINESS_NAME_LENGTH = 100;

/** Onaylanan kullanim kosullari + KVKK metninin surumu. Metin degisince artar. */
export const TERMS_VERSION = "2026-09";

/**
 * Hesap turu (kullanici karari 13.09.2026). Ileride paketler buna gore
 * ayrisacak (sirket: ekip / kurumsal fatura). Sirket hesabinda ekranda sirket
 * adi, bireysel hesapta kisinin adi gorunuyor (bkz. `displayName`).
 */
export const ACCOUNT_TYPES = [
  { id: "individual", label: "Bireysel", description: "Kendi adınıza kullanın." },
  { id: "company", label: "Şirket", description: "İşletmeniz adına kullanın." },
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number]["id"];

export function isAccountType(value: unknown): value is AccountType {
  return ACCOUNT_TYPES.some((type) => type.id === value);
}

export const BUSINESS_TYPES = [
  { id: "retail", label: "Perakende mağaza" },
  { id: "workshop", label: "Atölye / imalat" },
  { id: "wholesale", label: "Toptan satış" },
  { id: "online", label: "Online satış" },
  { id: "other", label: "Diğer" },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]["id"];

/**
 * Harfle baslar; harf, birlesik isaret, bosluk, kesme ve tire icerebilir.
 * `\p{L}` Turkce harfleri (ç, ğ, ı, İ, ö, ş, ü) kapsiyor.
 */
const NAME_PATTERN = /^\p{L}[\p{L}\p{M}' -]*$/u;

/** Harf ya da rakamla baslar; "Altın & Pırlanta Ltd. Şti." gibi adlar gecer. */
const BUSINESS_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} .,'&()/-]*$/u;

export type Profile = {
  firstName: string | null;
  lastName: string | null;
  /** Faz 4 oncesi ve hesap turu eklenmeden once acilan hesaplarda null. */
  accountType: AccountType | null;
  /** Yalnizca sirket hesabinda anlamli. */
  businessName: string | null;
  businessType: BusinessType | null;
  city: TurkeyCity | null;
  /** E.164 bicimi: +905xxxxxxxxx */
  phone: string | null;
  marketingOptIn: boolean;
  termsAcceptedAt: string | null;
};

/** Bastaki/sondaki ve ic ice bosluklari toplar, Unicode bicimini esitler. */
export function normalizeName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

/** Gecersizse kullaniciya gosterilecek cumle; gecerliyse null. */
export function nameProblem(label: "Ad" | "Soyad", value: string): string | null {
  const name = normalizeName(value);
  if (!name) return `${label} boş bırakılamaz.`;
  if (name.length > MAX_NAME_LENGTH) {
    return `${label} en fazla ${MAX_NAME_LENGTH} karakter olabilir.`;
  }
  if (!NAME_PATTERN.test(name)) {
    return `${label} yalnızca harf, boşluk, kesme işareti ve tire içerebilir.`;
  }
  return null;
}

export function businessNameProblem(value: string): string | null {
  const name = normalizeName(value);
  if (name.length < 2) return "Şirket adını yazın.";
  if (name.length > MAX_BUSINESS_NAME_LENGTH) {
    return `Şirket adı en fazla ${MAX_BUSINESS_NAME_LENGTH} karakter olabilir.`;
  }
  if (!BUSINESS_NAME_PATTERN.test(name)) {
    return "Şirket adında kullanılamayan bir karakter var.";
  }
  return null;
}

export function isBusinessType(value: unknown): value is BusinessType {
  return BUSINESS_TYPES.some((type) => type.id === value);
}

export function isTurkeyCity(value: unknown): value is TurkeyCity {
  return (TURKEY_CITIES as readonly string[]).includes(value as string);
}

/**
 * Telefonu +90 ile baslayan 13 karakterlik bicime cevirir; gecersizse null.
 * Kabul: "0532 123 45 67", "532-123-4567", "+90 (532) 123 45 67".
 * Turkiye numaralari 2-5 ile basliyor (sabit hat 2-4, cep 5).
 */
export function normalizePhone(value: string): string | null {
  let digits = value.replace(/[\s()-]/g, "");
  if (digits.startsWith("+90")) digits = digits.slice(3);
  else if (digits.startsWith("90") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return /^[2-5]\d{9}$/.test(digits) ? `+90${digits}` : null;
}

/** Telefon isteğe bagli: bos gecerli. */
export function phoneProblem(value: string): string | null {
  if (!value.trim()) return null;
  return normalizePhone(value) ? null : "Telefon numarası geçerli değil. Örnek: 0532 123 45 67";
}

/** +905321234567 -> "0532 123 45 67" */
export function formatPhone(phone: string | null): string {
  if (!phone || !/^\+90\d{10}$/.test(phone)) return "";
  const d = phone.slice(3);
  return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
}

/**
 * `user_metadata`dan profili okur. Alan beklenen tipte ya da listede degilse
 * null — kullanici metadata'ya baska bir sey yazmis olabilir.
 */
export function readProfile(metadata: unknown): Profile {
  const record = (metadata ?? {}) as Record<string, unknown>;
  const text = (key: string) =>
    typeof record[key] === "string" && record[key] ? normalizeName(record[key] as string) : null;
  const phone = typeof record.phone === "string" ? normalizePhone(record.phone) : null;
  return {
    firstName: text("first_name"),
    lastName: text("last_name"),
    accountType: isAccountType(record.account_type) ? record.account_type : null,
    businessName: text("business_name"),
    businessType: isBusinessType(record.business_type) ? record.business_type : null,
    city: isTurkeyCity(record.city) ? record.city : null,
    phone,
    marketingOptIn: record.marketing_opt_in === true,
    termsAcceptedAt: typeof record.terms_accepted_at === "string" ? record.terms_accepted_at : null,
  };
}

/**
 * Ekranda gorunen isim ("Hos geldiniz, ...", ust cubuk):
 *  - Sirket hesabi -> sirket adi.
 *  - Bireysel (ya da turu belirsiz eski hesap) -> kisinin adi.
 *  - Ad da yoksa e-postanin @ oncesi, o da yoksa bos.
 * Turu belirsiz hesapta sirket adi olsa bile kisi adi gosteriliyor: hesap
 * turunu kullanici secmediyse onun yerine karar verilmiyor.
 */
export function displayName(user: {
  firstName: string | null;
  email: string | null;
  accountType?: AccountType | null;
  businessName?: string | null;
}): string {
  if (user.accountType === "company" && user.businessName) return user.businessName;
  if (user.firstName) return user.firstName;
  return user.email?.split("@")[0] ?? "";
}
