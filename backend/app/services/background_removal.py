from functools import lru_cache

import rembg

# Sadece "CPUExecutionProvider" belirtiliyor: Apple Silicon'da onnxruntime
# varsayılan olarak CoreMLExecutionProvider'ı da otomatik seçiyor, bu da
# BiRefNet gibi CoreML'in desteklemediği çok sayıda op içeren bir grafiği
# yüzlerce küçük alt-grafiğe bölüp her birini ayrı ayrı derlemeye çalışıyor
# (gözlemlendi: tek bir görüntüde 600'ün üzerinde .mlmodelc alt-parçası,
# pratikte hiç bitmeyen bir derleme döngüsü). Üretim sunucusu Linux/CPU
# olduğu için (bkz. kök CLAUDE.md "Bilinen kısıt") ve ölçülen 12-14GB RAM /
# ~15sn rakamları CPU inference'a dayandığı için, geliştirme makinesi macOS
# olsa bile davranış tutarlı kalsın diye CPU sağlayıcısı açıkça zorlanıyor.
_PROVIDERS = ["CPUExecutionProvider"]


@lru_cache(maxsize=1)
def _get_session(model_name: str):
    return rembg.new_session(model_name, providers=_PROVIDERS)


class BackgroundRemovalService:
    def __init__(self, model_name: str):
        self._model_name = model_name

    def remove(self, image_bytes: bytes) -> bytes:
        session = _get_session(self._model_name)
        return rembg.remove(image_bytes, session=session)
