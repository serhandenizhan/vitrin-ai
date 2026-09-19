import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection, LegalTable } from "@/components/legal-page";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Gizlilik Politikası — Vitrin AI",
  description: "Vitrin AI gizlilik, fotoğraf işleme ve veri saklama politikası.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow={`Sürüm ${LEGAL_DOCUMENT_VERSION} · Yürürlük 18 Eylül 2026`}
      title="Gizlilik politikası"
      summary="Verinin cihazınızdan başlayıp arka plan kaldırma, çalışma geçmişi ve ödeme süreçlerinde nasıl hareket ettiğini sade ve doğrulanabilir biçimde açıklıyoruz."
    >
      <LegalSection title="Hızlı özet">
        <ul className="list-disc space-y-2 pl-5">
          <li>Özgün ürün fotoğrafı kalıcı çalışma geçmişine yazılmaz.</li>
          <li>Kesim sonucu, aynı işlemin ikinci kez kredi tüketmesini önlemek için en fazla 24 saat geçici ve özel depoda tutulur.</li>
          <li>Çalışma geçmişi açıksa sonuç ve küçük önizleme hesabınıza kaydedilir; bunları tek tek veya topluca silebilirsiniz.</li>
          <li>Kart bilgileri Vitrin AI tarafından saklanmaz; ödeme ekranı iyzico tarafından sağlanır.</li>
          <li>Reklam veya davranışsal takip çerezi kullanılmaz; zorunlu oturum çerezleri ve cihaz tercihleri kullanılır.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Fotoğrafın veri akışı">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Yükleme", "Özgün dosya güvenli bağlantıyla işlem servisine gönderilir ve bellekte çözülür."],
            ["2", "Kesim", "Arka plan kaldırılır; sonuç tekrar güvenliği için özel R2 alanında en fazla 24 saat tutulur."],
            ["3", "İsteğe bağlı geçmiş", "Geçmiş açıksa sonuç ve küçük önizleme hesabınıza bağlı ayrı kayıt olarak saklanır."],
          ].map(([step, title, text]) => (
            <div key={step} className="glass-panel-light rounded-2xl p-5">
              <span className="text-gold text-[0.75rem] font-semibold">{step}</span>
              <h3 className="mt-2 font-semibold text-[#1a1917]">{title}</h3>
              <p className="mt-2 text-[0.8125rem] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="Hangi sistem ne yapıyor?">
        <LegalTable
          headers={["Sistem", "Rolü", "İşlenen başlıca veri"]}
          rows={[
            ["Vitrin AI", "Uygulama ve veri sorumlusu", "Hesap, işlem, çalışma, abonelik, kota ve destek kayıtları."],
            ["Supabase", "Kimlik doğrulama ve veritabanı altyapısı", "Hesap, profil, oturum, çalışma ve uygulama kayıtları."],
            ["Cloudflare R2", "Özel nesne depolama", "24 saatlik geçici kesim sonucu; geçmiş açıksa sonuç ve küçük önizleme."],
            ["iyzico", "Ödeme ve abonelik altyapısı", "Ödeme formu, kart verisi, kimlik/fatura bilgileri ve ödeme referansları."],
            ["Barındırma ve e-posta sağlayıcıları", "Uygulamanın sunulması ve işlemsel bildirimler", "Teknik istek kayıtları ve gönderim için gerekli e-posta bilgisi."],
          ]}
        />
        <p>
          Sağlayıcılar yalnız hizmetin gerektirdiği kapsamda kullanılır. Üretim altyapısında
          yurt dışı aktarım oluşması hâlinde KVKK md. 9 kapsamındaki uygun güvence
          mekanizması uygulanır. Ayrıntılı hukuki açıklama için {" "}
          <Link href="/kvkk" className="underline underline-offset-4">KVKK aydınlatma metnini</Link> inceleyin.
        </p>
      </LegalSection>

      <LegalSection title="Cihazınızda tutulan veriler">
        <LegalTable
          headers={["Tür", "Amaç", "Silme yöntemi"]}
          rows={[
            ["Zorunlu Supabase oturum çerezleri", "Giriş durumunu güvenli biçimde sürdürmek ve token yenilemek.", "Çıkış yaptığınızda veya tarayıcı site verilerini temizlediğinizde."],
            ["Stüdyo ve erişilebilirlik tercihleri", "Son görünüm, geçmiş, kontrast ve hareket ayarlarını hatırlamak.", "Tarayıcının localStorage/site verilerini temizleyerek."],
            ["Logo ve logo yerleşimi", "Aynı cihazda yeni tasarımda markanızı yeniden kullanmak.", "Uygulamadaki logo sıfırlama işlemiyle veya site verilerini temizleyerek."],
            ["Geçici yönlendirme/karşılama kayıtları", "Çalışmayı doğru ekranda açmak ve tek seferlik bildirimleri yönetmek.", "Oturum sonunda veya site verilerini temizleyerek."],
          ]}
        />
        <p>
          Zorunlu olmayan analiz, hedefleme veya reklam çerezi eklenirse varsayılan olarak
          çalıştırılmayacak; yerleştirilmeden önce ayrı tercih ve açık rıza arayüzü sunulacaktır.
        </p>
      </LegalSection>

      <LegalSection title="Ödeme ve faturalama">
        <p>
          Paket satın alırken ad, soyad, GSM, T.C. kimlik numarası ve fatura adresi
          ödeme/abonelik kurulması amacıyla backend üzerinden iyzico’ya iletilir. Kart
          alanları iyzico’nun izole ödeme formunda işlenir; Vitrin AI kart numarası veya
          güvenlik kodunu saklamaz. Vitrin AI tarafında plan, tutar, işlem ve abonelik
          referansları ile ödeme durumu; hizmet, muhasebe, destek ve uyuşmazlık yönetimi
          için tutulur.
        </p>
      </LegalSection>

      <LegalSection title="Saklama ve silme">
        <p>
          Özgün fotoğraf işlem tamamlanınca uygulama belleğinde tutulmaz. Geçici sonuç
          en fazla 24 saat sonra bakım işiyle silinir. Kaydedilmiş çalışmalar siz silene,
          hesabınızı kapatana veya plan sınırı uygulanana kadar saklanır; ücretsiz planda
          en yeni 10 çalışma korunur. Hesap silme isteği, devam eden ödeme veya abonelik
          işlemleri güvenli biçimde sonuçlandıktan sonra R2 nesnelerini ve kimlik hesabını
          kaldırır. Kanunen saklanması gereken mali ve kabul kayıtları kimlikle bağlantısı
          azaltılarak zorunlu süre boyunca korunabilir.
        </p>
      </LegalSection>

      <LegalSection title="Güvenlik yaklaşımı">
        <p>
          Aktarımda HTTPS, veritabanında kullanıcı sahipliği ve RLS kontrolleri, depolamada
          özel bucket ve kısa ömürlü imzalı adresler, hassas sağlayıcı anahtarlarında sunucu
          tarafı erişim ve hesap değişimi yarışlarına karşı kullanıcı eşleştirme kontrolleri
          uygulanır. Hiçbir sistem mutlak güvenlik garantisi veremez; erişimler görevle
          sınırlanır ve şüpheli olaylar incelenir.
        </p>
      </LegalSection>

      <LegalSection title="Sizin kontrolleriniz">
        <ul className="list-disc space-y-2 pl-5">
          <li>Çalışma geçmişini Ayarlar’dan açabilir veya kapatabilirsiniz.</li>
          <li>Çalışmaları tek tek ya da tümünü birden silebilirsiniz.</li>
          <li>Hesabım sayfasından hesabın silinmesini başlatabilirsiniz.</li>
          <li>Ticari ileti tercihinizi geri alabilir ve KVKK kapsamındaki haklarınızı kullanabilirsiniz.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Çocuklar ve üçüncü kişi verileri">
        <p>
          Hizmet 18 yaş altındaki kişilere yönelik değildir. Ürün fotoğrafına gereksiz
          biçimde kişi, belge, plaka veya özel nitelikli veri girmemesini; üçüncü kişiye
          ait içerik yüklüyorsanız gerekli hak ve izinlere sahip olmanızı bekleriz.
        </p>
      </LegalSection>

      <LegalSection title="Değişiklikler ve iletişim">
        <p>
          Politika değiştiğinde sürüm ve yürürlük tarihi güncellenir; esaslı değişiklikler
          uygulama içinde ayrıca duyurulur. Veri sorumlusu, başvuru kanalı ve haklarınızın
          ayrıntıları {" "}
          <Link href="/kvkk" className="underline underline-offset-4">KVKK aydınlatma metninde</Link> yer alır.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
