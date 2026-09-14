/**
 * Supabase Auth hatalarini kullanici diline cevirir.
 *
 * KULLANICI NUMARALANDIRMASI (ROADMAP Faz 4): "bu e-posta kayitli degil" ile
 * "parola yanlis" ayri mesajlar olsaydi, formu deneyen biri hangi kuyumcunun
 * hesabi oldugunu tek tek ogrenebilirdi. Supabase ikisine de ayni kodu
 * (`invalid_credentials`) donuyor; burada da tek bir mesaj var. Ayni sebeple
 * kayitta "bu e-posta zaten kayitli" DENMIYOR (bkz. `auth-dialog.tsx`).
 *
 * Bilinmeyen bir kodda Supabase'in Ingilizce metni degil genel bir mesaj
 * gosteriliyor; ham hata ayrintisi kullaniciya bir sey anlatmiyor.
 */
export type AuthErrorLike = { code?: string | null; status?: number | null };

export const GENERIC_AUTH_ERROR =
  "Bir sorun oluştu. Birkaç saniye sonra tekrar deneyin.";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "E-posta ya da parola hatalı.",
  email_not_confirmed:
    "E-posta adresiniz henüz doğrulanmadı. Size gönderdiğimiz bağlantıya tıklayın.",
  weak_password:
    "Parola çok zayıf. En az 8 karakter kullanın; harf ve rakamı birlikte kullanmak daha güvenli.",
  same_password: "Yeni parola eskisiyle aynı olamaz.",
  // Sifirlama baglantisinin actigi oturum suresi dolmus ya da hic yok.
  session_not_found:
    "Oturumunuzun süresi doldu. Parola sıfırlama bağlantısını yeniden isteyin.",
  email_address_invalid: "Geçerli bir e-posta adresi yazın.",
  validation_failed: "Geçerli bir e-posta adresi yazın.",
  over_email_send_rate_limit:
    "Kısa sürede çok fazla e-posta istendi. Birkaç dakika sonra tekrar deneyin.",
  over_request_rate_limit:
    "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.",
  signup_disabled: "Şu anda yeni kayıt alınmıyor.",
  email_provider_disabled: "E-posta ile giriş şu anda kapalı.",
  user_banned: "Bu hesap kullanıma kapatılmış.",
};

export function authErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return GENERIC_AUTH_ERROR;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 429) return MESSAGES.over_request_rate_limit;
  return GENERIC_AUTH_ERROR;
}

/** Istemci tarafi on kontrol; asil sinir Supabase'in parola ayari. */
export const MIN_PASSWORD_LENGTH = 8;
