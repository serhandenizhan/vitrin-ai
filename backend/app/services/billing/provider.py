"""iyzico v2 abonelik API'si. Kart verisi bu modüle hiçbir zaman gelmez."""

import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import quote, urlencode, urlsplit

import httpx
from app.core.config import settings


class ProviderError(RuntimeError):
    pass


class ProviderUnavailable(ProviderError):
    pass


class CheckoutAbsent(ProviderError):
    """Sağlayıcı checkout/abonelik oluşmadığını kesin olarak bildirdi."""

    pass


class EvidenceMismatch(ProviderError):
    pass


def minor_units(value):
    try:
        amount = Decimal(str(value)) * 100
        if not amount.is_finite() or amount < 0 or amount != amount.to_integral_value():
            raise ValueError()
        return int(amount)
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise EvidenceMismatch("invalid_amount") from exc


def provider_time(value):
    try:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError()
        return datetime.fromtimestamp(value / 1000, timezone.utc)
    except (ValueError, TypeError, OverflowError) as exc:
        raise EvidenceMismatch("invalid_period") from exc


def verify_webhook(payload, signature):
    # Resmî V3 abonelik örneğinin sırası: merchant + secret + event + sub + order + customer.
    fields = (
        "merchantId",
        "iyziEventType",
        "subscriptionReferenceCode",
        "orderReferenceCode",
        "customerReferenceCode",
    )
    if not settings.iyzico_secret_key or not settings.iyzico_merchant_id:
        return False
    if any(
        not isinstance(payload.get(f), (str, int)) or not str(payload[f])
        for f in fields
    ):
        return False
    if str(payload["merchantId"]) != settings.iyzico_merchant_id:
        return False
    message = (
        str(payload["merchantId"])
        + settings.iyzico_secret_key
        + "".join(str(payload[f]) for f in fields[1:])
    )
    expected = hmac.new(
        settings.iyzico_secret_key.encode(), message.encode(), hashlib.sha256
    ).hexdigest()
    return isinstance(signature, str) and hmac.compare_digest(
        expected.encode(), signature.lower().encode()
    )


class Iyzico:
    def ensure_configured(self):
        if not settings.iyzico_api_key or not settings.iyzico_secret_key:
            raise ProviderUnavailable("billing_not_ready")
        if settings.iyzico_base_url not in (
            "https://sandbox-api.iyzipay.com",
            "https://api.iyzipay.com",
        ):
            raise ProviderUnavailable("invalid_provider_origin")

    async def request(self, method, path, payload=None):
        self.ensure_configured()
        body = (
            json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            if payload is not None
            else ""
        )
        nonce = secrets.token_hex(16)
        digest = hmac.new(
            settings.iyzico_secret_key.encode(),
            (nonce + urlsplit(path).path + body).encode(),
            hashlib.sha256,
        ).hexdigest()
        auth = base64.b64encode(
            f"apiKey:{settings.iyzico_api_key}&randomKey:{nonce}&signature:{digest}".encode()
        ).decode()
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(10, connect=3), follow_redirects=False
            ) as client:
                response = await client.request(
                    method,
                    settings.iyzico_base_url + path,
                    content=body or None,
                    headers={
                        "Authorization": "IYZWSv2 " + auth,
                        "x-iyzi-rnd": nonce,
                        "Content-Type": "application/json",
                    },
                )
                response.raise_for_status()
                result = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderUnavailable("provider_unavailable") from exc
        if not isinstance(result, dict) or result.get("status") != "success":
            # Provider hata metni kişisel veri içerebilir; loga veya istemciye taşınmaz.
            raise ProviderError("provider_rejected")
        return result

    async def plan(self, reference):
        result = await self.request(
            "GET", "/v2/subscription/pricing-plans/" + quote(reference, safe="")
        )
        return result["data"]

    async def verify_plan(self, version, reference, trial_days=0):
        plan = await self.plan(reference)
        if (
            plan.get("referenceCode") != reference
            or plan.get("productReferenceCode")
            != version["iyzico_product_reference_code"]
            or minor_units(plan.get("price")) != version["price_minor_units"]
            or plan.get("currencyCode") != version["currency"]
            or plan.get("paymentInterval") != "MONTHLY"
            or plan.get("paymentIntervalCount") != 1
            or plan.get("planPaymentType") != "RECURRING"
            or plan.get("trialPeriodDays", 0) != trial_days
            or plan.get("status") != "ACTIVE"
        ):
            raise EvidenceMismatch("plan_mismatch")
        return plan

    async def initialize(self, session, customer):
        return await self.request(
            "POST",
            "/v2/subscription/checkoutform/initialize",
            {
                "locale": "tr",
                "conversationId": str(session["conversation_reference"]),
                "pricingPlanReferenceCode": session["pricing_plan_reference"],
                "subscriptionInitialStatus": "ACTIVE",
                "customer": customer,
                "callbackUrl": settings.billing_callback_url,
            },
        )

    async def checkout(self, token, conversation_reference):
        query = urlencode({"conversationId": str(conversation_reference)})
        return await self.request(
            "GET",
            "/v2/subscription/checkoutform/" + quote(token, safe="") + "?" + query,
        )

    async def subscription(self, reference):
        result = (
            await self.request(
                "GET", "/v2/subscription/subscriptions/" + quote(reference, safe="")
            )
        )["data"]
        # Dokümanın iki sürümünde tek nesne ve items zarfı var; her ikisinde kimlik zorunlu.
        if "items" in result:
            result = next(
                (r for r in result["items"] if r.get("referenceCode") == reference), {}
            )
        if result.get("referenceCode") != reference:
            raise EvidenceMismatch("subscription_mismatch")
        return result

    async def cancel(self, reference):
        # Önce uzak durum: başarı sonrası yerel commit kaybolursa tekrar iptal gerekmez.
        current = await self.subscription(reference)
        if current.get("subscriptionStatus") in ("CANCELED", "EXPIRED"):
            return
        await self.request(
            "POST",
            "/v2/subscription/subscriptions/" + quote(reference, safe="") + "/cancel",
            {},
        )

    async def refund(self, payment_id, amount, currency, action_id, ip):
        return await self.request(
            "POST",
            "/payment/refund",
            {
                "locale": "tr",
                "conversationId": str(action_id),
                "paymentTransactionId": payment_id,
                "price": str(Decimal(amount) / 100),
                "currency": currency,
                "ip": ip,
            },
        )

    async def payment(self, payment_id):
        return await self.request(
            "POST", "/payment/detail", {"locale": "tr", "paymentId": payment_id}
        )

    async def subscriptions(self, page=1):
        return (
            await self.request(
                "GET", f"/v2/subscription/subscriptions?page={page}&count=100"
            )
        )["data"]

    async def transactions(self, day, page=1):
        query = urlencode({"transactionDate": day.isoformat(), "page": page})
        return await self.request("GET", "/v2/reporting/payment/transactions?" + query)


def get_provider():
    return Iyzico()
