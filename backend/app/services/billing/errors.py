from fastapi import HTTPException


def billing_error(code, message, status=409, retry=None, **extra):
    # `extra`: hatayı çözmek için istemcinin ihtiyaç duyduğu alanlar (ör. devam
    # eden satın almanın `checkout_url`'i). Mesaj metni tek başına kullanıcıyı
    # oraya götüremez.
    return HTTPException(
        status_code=status,
        detail={"code": code, "message": message, **extra},
        headers={"Retry-After": str(retry)} if retry else None,
    )
