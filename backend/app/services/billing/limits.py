"""Checkout oluşturma ve herkese açık ödeme yüzeyleri için dağıtık hız sınırı."""

from fastapi import Depends, Request
from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.services.rate_limit import RequestRateLimiter
from app.services.billing.errors import billing_error

checkout_limiter = RequestRateLimiter(10, 60, redis_url=settings.redis_url)
public_limiter = RequestRateLimiter(600, 60, redis_url=settings.redis_url)


async def limit_checkout(user: CurrentUser = Depends(get_current_user)):
    retry = await checkout_limiter.retry_after("billing:checkout:" + str(user.id))
    if retry:
        raise billing_error(
            "rate_limited", "Çok fazla satın alma isteği. Biraz bekleyin.", 429, retry
        )


async def limit_public(request: Request):
    retry = await public_limiter.retry_after(
        "billing:public:" + (request.client.host if request.client else "unknown")
    )
    if retry:
        raise billing_error(
            "rate_limited", "Çok fazla istek. Biraz bekleyin.", 429, retry
        )
