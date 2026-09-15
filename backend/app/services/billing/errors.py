from fastapi import HTTPException


def billing_error(code, message, status=409, retry=None):
    return HTTPException(
        status_code=status,
        detail={"code": code, "message": message},
        headers={"Retry-After": str(retry)} if retry else None,
    )
