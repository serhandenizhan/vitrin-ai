FROM python:3.11-slim

WORKDIR /app

# libheif HEIC/HEIF decode için gerekli sistem kütüphanesi
RUN apt-get update && apt-get install -y --no-install-recommends \
    libheif1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --create-home --uid 1000 appuser
USER appuser

EXPOSE 8000

# `curl` eklemek yerine zaten image'da bulunan Python'un kendi HTTP
# istemcisi kullanılıyor — image'a ekstra bir sistem paketi eklemeden aynı
# kontrolü sağlıyor. `--start-period=10s`: uvicorn'un açılışı için pay;
# `/api/health` model yüklemesini TETİKLEMİYOR (bkz. health.py), bu yüzden
# BiRefNet'in ilk yüklemesi (~30-35sn) bu süreye dahil değil.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
