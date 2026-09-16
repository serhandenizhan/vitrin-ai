"""Kullanıcıya giden işlemsel e-posta (şu an yalnızca ödeme alınamadı bildirimi).

NEDEN ayrı bir servis: Supabase Auth yalnızca kendi kimlik doğrulama
e-postalarını gönderiyor; uygulamanın kendi bildirimini oradan göndermenin bir
yolu yok. Sağlayıcı Resend'in HTTP API'si — yeni bir SMTP altyapısı kurmadan
tek bir POST isteğiyle çalışıyor.

Anahtar yapılandırılmamışsa e-posta SESSİZCE atlanmaz: çağıran taraf açık bir
`billing_alerts` kaydı yazar (bkz. `actions.py::run_action`). Gönderilmemiş bir
ödeme uyarısı, operatörün görmesi gereken bir durumdur.
"""

import httpx

from app.core.config import settings

EMAIL_TIMEOUT_SECONDS = 10

PAST_DUE_SUBJECT = "Ödemeniz alınamadı — kartınızı güncelleyin"
PAST_DUE_BODY = (
    "Merhaba,\n\n"
    "Aboneliğinizin bu dönemki ödemesi alınamadı. Erişiminiz 3 gün boyunca "
    "açık kalacak; bu süre içinde ödeme yönteminizi güncellemezseniz "
    "aboneliğiniz kapanır ve yeni kredi verilmez.\n\n"
    "Kartınızı güncellemek için hesabınızdaki Paketler sayfasından yeni bir "
    "satın alma başlatabilirsiniz.\n"
)


class EmailNotConfigured(RuntimeError):
    """Sağlayıcı anahtarı ya da gönderen adresi verilmemiş."""


class EmailDeliveryError(RuntimeError):
    """Sağlayıcı isteği reddetti ya da ulaşılamadı."""


class EmailService:
    def ensure_configured(self) -> None:
        if not settings.resend_api_key or not settings.billing_email_from:
            raise EmailNotConfigured(
                "E-posta gönderimi yapılandırılmamış; RESEND_API_KEY ve "
                "BILLING_EMAIL_FROM ayarlanmalı."
            )

    async def send(
        self, to: str, subject: str, text: str, idempotency_key: str | None = None
    ) -> None:
        """`idempotency_key`: Resend'in kendi `Idempotency-Key` başlığı.

        Gönderim timeout'a düşer ve kuyruk işi yeniden denerse, sağlayıcı aynı
        anahtarı gördüğü için ikinci bir e-posta göndermez. Anahtar kalıcı
        `provider_actions.id` olduğundan süreç yeniden başlasa da aynı kalır.
        """
        self.ensure_configured()
        headers = {"Authorization": f"Bearer {settings.resend_api_key}"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        try:
            async with httpx.AsyncClient(timeout=EMAIL_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    settings.resend_base_url.rstrip("/") + "/emails",
                    headers=headers,
                    json={
                        "from": settings.billing_email_from,
                        "to": [to],
                        "subject": subject,
                        "text": text,
                    },
                )
        except httpx.HTTPError as exc:
            raise EmailDeliveryError("E-posta sağlayıcısına ulaşılamadı.") from exc
        if response.status_code >= 400:
            # Yanıt gövdesi alıcı adresini içerebilir; hata metnine konmuyor.
            raise EmailDeliveryError(
                f"E-posta gönderilemedi (sağlayıcı yanıtı: {response.status_code})."
            )


def get_email_service() -> EmailService:
    return EmailService()
