/**
 * Parola sifirlama akisinin sunucu ve istemcide ortak sabitleri.
 *
 * NEDEN AYRI BIR ISARET: `/auth/yeni-parola` sayfasi parolayi MEVCUT parolayi
 * sormadan degistiriyor (kullanici onu unuttugu icin oradadir). Sayfa yalnizca
 * "oturum var mi" diye baksaydi, oturumu acik kalmis bir bilgisayara oturan
 * biri adresi elle yazip hesabi ele gecirebilirdi; hesap sayfasindaki "mevcut
 * parolayi iste" korumasi boylece bosa cikardi (Faz 4 son incelemesinde
 * bulundu).
 *
 * Cozum: `/auth/callback`, sifirlama baglantisindaki kodu BASARIYLA oturuma
 * cevirdiginde kisa omurlu, `httpOnly` bir cerez yaziyor. Sayfa bu cerez
 * yoksa formu gostermiyor. `httpOnly` oldugu icin tarayici konsolundan
 * yazilamiyor; uretmenin tek yolu e-postadaki gecerli baglanti.
 */

/** Sifirlama baglantisinin acacagi sayfa. */
export const NEW_PASSWORD_PATH = "/auth/yeni-parola";

export const RECOVERY_COOKIE = "vitrin-ai-recovery";

/** Baglantidan sonra formun acik kalacagi sure (sn). */
export const RECOVERY_COOKIE_MAX_AGE = 10 * 60;
