"""Admin eylemlerinin denetim izi (Faz 6).

Tablo yalnızca EKLEMEYE açık: migration 0007'deki `admin_audit_append_only`
trigger'ı her `UPDATE`/`DELETE`'i reddediyor. Yöneticinin sonradan
düzenleyebildiği bir kayıt, denetim sorusunu ("bu krediyi kim, ne zaman, neden
verdi") cevaplayamaz.

Satır, eylemi yapan işlemin KENDİ transaction'ında yazılır ve onunla birlikte
commit edilir: eylem geri alınırsa izi de geri alınır, böylece olmamış bir
işlem günlükte durmaz.
"""

import json
import uuid

from app.services.billing.db import execute

#: `admin_audit_log.action`. Veritabanı tarafında serbest metin (yeni bir eylem
#: migration gerektirmesin diye); yazım hatalarının sessizce yeni bir "eylem
#: türü" uydurmasını engellemek için tek doğru kaynak burası.
ACTIONS = (
    "credit_grant",
    "credit_revoke",
    "user_delete",
    "background_update",
    "background_delete",
    "admin_add",
    "admin_remove",
)


async def record(
    db,
    actor_id: uuid.UUID,
    action: str,
    subject_type: str,
    subject_id: str,
    detail: dict | None = None,
) -> None:
    # `assert` DEĞİL: Python `-O` ile çalıştırıldığında assert'ler tamamen
    # kaldırılır ve bu kontrol üretimde sessizce yok olurdu.
    if action not in ACTIONS:
        raise ValueError(f"Bilinmeyen denetim eylemi: {action!r}")
    await execute(
        db,
        """INSERT INTO admin_audit_log(actor_id,action,subject_type,subject_id,detail)
        VALUES(:actor,:action,:subject_type,:subject_id,CAST(:detail AS jsonb))""",
        actor=actor_id,
        action=action,
        subject_type=subject_type,
        subject_id=str(subject_id),
        detail=json.dumps(detail or {}),
    )
