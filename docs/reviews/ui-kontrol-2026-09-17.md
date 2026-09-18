# UI kontrolü — 17 Eylül 2026

## Tamamlanan düzenlemeler

- Stüdyo tuvali ve alt dock ekran merkezinde; sağ denetçi için iki tarafta eşit pay ayrıldı.
- Stüdyo çalışma alanı ve kesim sonucu kartı beyaz. Navbar koyu, yüzen cam kapsül.
- Dock fotoğrafın altında ayrı satırda. Yerleşim ve Görünüm düğmeleri ortalı.
- Zemin etiketleri iki satıra yayılabiliyor; kaydırma çubuğuna ayrı alan ayrıldı.
- 93 katalog zemini önizlemeleri incelenerek renk/desenlerine göre adlandırıldı. Adlar kimliğe bağlı, liste sırasından bağımsız.
- Kategori sırası: Sade, Desen, Doğal, Lüks.
- Yansıma ekseni görünür ürün sınırlarına taşındı. Saydam boşluklu 1200×1600 örneğinde eski hesap 800, doğru hesap 550 veriyordu; regresyon testi önce başarısız, düzeltmeden sonra başarılı.
- Mobilde palet seçimi tüm sayfayı aşağı kaydırmıyor. Tuval ve dock kaydırma sırasında birbirini örtmüyor.
- Beyaz yüzey üzerindeki cam panellerin metin kontrastı iyileştirildi.

## İnceleme kapsamı

Tarayıcıda ana sayfa, kesim sonucu, stüdyo ve araçları, Paketler ve Katalog incelendi.
Stüdyo 1280×720, 1440×900 ve 390×844 boyutlarında kontrol edildi. 1440 px ekranda
Görünüm dock merkezinin 720 px olduğu ölçüldü. Fotoğraf ile dock arasında boşluk var;
yansımanın ana ürünün altında oluşup silikleştiği görsel olarak doğrulandı.

Stüdyo kontrolünde depodaki örnek kesim ve gerçek kataloğun yerel önizleme kopyaları
kullanıldı. Geçici test sayfası ve API yanıtı kontrol sonrasında kaldırıldı/geri alındı.
Bu kontrol canlı hesap, ödeme, modelin kesim kalitesi veya CMYK sunucu işlemi testi değildir.
Mobilde uzun paneller kaydırma gerektirir; tüm kontrollerin tek ekrana sığması hedeflenmedi.

## Ek bulgular — tamamlandı

### 1. Kategori menüsünde Escape katman önceliği

Kategori menüsü Escape olayını kendi kapsayıcısında durduruyor. İlk Escape yalnız
menüyü kapatıyor; ikinci Escape stüdyoyu kapatıyor. Regresyon testi olayın belge
dinleyicisine ulaşmadığını doğruluyor.

### 2. Stüdyo klavye odağı

Stüdyo açıldığında odak “Geri” düğmesine taşınıyor. Tab ve Shift+Tab stüdyo
içinde dönüyor; dialog dışındaki header, ana içerik ve footer `inert` oluyor.
Kapanışta önceki odağa geri dönülüyor. Birim testi ve gerçek tarayıcı kontrolü
başarılı; tarayıcıda ana içeriğin `inert` olduğu ve ileri/geri döngünün çalıştığı ölçüldü.

### 3. Paketler sayfasında kullanım hakkı

SSS artık plan kartıyla aynı `/api/plans` kaynağından Deneme kotasını okuyor.
Yerel API ayda 10 fotoğraf döndürdüğünde SSS de “ayda 10 fotoğraf” gösteriyor;
eski sınırsız kullanım metni kaldırıldı. API geçici olarak kullanılamazsa yanlış
bir sayı göstermek yerine kullanıcı plan kartına yönlendiriliyor.

## Son doğrulamalar

- ESLint: başarılı.
- Vitest: 38 dosyada 293 test başarılı.
- Üretim derlemesi (`npm run build`, Turbopack) ve TypeScript: başarılı.
- Katalog eşlemesi: 93/93 isim mevcut, eksik veya fazladan kimlik yok.
- `git diff --check`: temiz.
