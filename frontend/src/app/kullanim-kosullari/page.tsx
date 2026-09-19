import type { Metadata } from "next";

import { LegalNotice, LegalPage, LegalSection } from "@/components/legal-page";
import {
  DATA_CONTROLLER_NAME,
  LEGAL_ADDRESS,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_IDENTITY_COMPLETE,
  LEGAL_PHONE,
  LEGAL_REGISTRY_NUMBER,
} from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Kullanım Koşulları — Vitrin AI",
  description: "Vitrin AI üyelik, plan, kredi ve hizmet kullanım koşulları.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow={`Sürüm ${LEGAL_DOCUMENT_VERSION} · Yürürlük 18 Eylül 2026`}
      title="Kullanım koşulları"
      summary="Bu koşullar Vitrin AI hesabını, fotoğraf işleme hizmetini, plan ve kredileri, kullanıcı içeriklerini ve tarafların sorumluluklarını düzenler."
    >
      {!LEGAL_IDENTITY_COMPLETE ? (
        <LegalNotice>
          Bu geliştirme ortamında hizmet sağlayıcının zorunlu ticari kimlik bilgileri
          henüz yapılandırılmamıştır. Bu bilgiler tamamlanmadan canlı yayın yapılamaz.
        </LegalNotice>
      ) : null}

      <LegalSection title="1. Taraflar ve hizmet sağlayıcı">
        <p>
          Bu sözleşme, Vitrin AI hizmetini kullanan kişi veya işletme ile {" "}
          <strong>{DATA_CONTROLLER_NAME}</strong> arasında kurulur. Hizmet sağlayıcının
          adresi {LEGAL_ADDRESS ?? "canlı yayın öncesi yapılandırılacaktır"}, telefonu {" "}
          {LEGAL_PHONE ?? "canlı yayın öncesi yapılandırılacaktır"}, sicil/MERSİS/vergi
          bilgisi {LEGAL_REGISTRY_NUMBER ?? "canlı yayın öncesi yapılandırılacaktır"} olarak
          yayımlanır.
        </p>
      </LegalSection>

      <LegalSection title="2. Hizmetin kapsamı">
        <p>
          Vitrin AI; ürün fotoğraflarının arka planını kaldırma, sonucu zemin, gölge,
          yansıma, logo ve metin araçlarıyla düzenleme, katalog kompozisyonu oluşturma ve
          çıktı indirme özellikleri sunar. Planların kapsamı, kredi adedi, fiyatı ve varsa
          kullanım sınırları satın alma anında yayımlanan plan ekranında gösterilir.
        </p>
      </LegalSection>

      <LegalSection title="3. Uygunluk ve temsil yetkisi">
        <p>
          Hesap açan kişinin en az 18 yaşında ve sözleşme kurma ehliyetine sahip olması
          gerekir. Bir işletme adına hesap açıyor veya satın alma yapıyorsanız işletmeyi
          bu koşullarla bağlamaya yetkili olduğunuzu beyan edersiniz. “Bireysel” veya
          “şirket” hesap seçimi tek başına tüketici sıfatını belirlemez; emredici tüketici
          hakları somut işlemin amacına göre uygulanır.
        </p>
      </LegalSection>

      <LegalSection title="4. Hesap ve güvenlik">
        <p>
          Doğru ve güncel bilgi vermek, parolanızı gizli tutmak ve yetkisiz kullanımı
          gecikmeden bildirmek sizin sorumluluğunuzdadır. Hesabınızı devredemez, başka
          kullanıcı adına işlem yapamaz veya güvenlik ve kota kontrollerini aşmaya
          çalışamazsınız. Şüpheli erişimde oturumlar sonlandırılabilir ve hesabın yeniden
          doğrulanması istenebilir.
        </p>
      </LegalSection>

      <LegalSection title="5. Planlar ve krediler">
        <ul className="list-disc space-y-2 pl-5">
          <li>Her başarılı arka plan kaldırma işlemi, plan ekranında belirtilen şekilde bir kredi tüketir.</li>
          <li>Kesin başarısızlıkta kredi iade edilir; sonucu belirsiz bir istekte ikinci tüketimi önlemek için aynı işlem anahtarı korunur.</li>
          <li>Yanıt kaybolursa başarılı sonuç en fazla 24 saat boyunca aynı işlem anahtarıyla yeniden alınabilir.</li>
          <li>Dönem kredilerinin devri, ek krediler ve plan sınırları satın alma anında gösterilen plan koşullarına tabidir.</li>
          <li>Ücretsiz plan çalışma geçmişinde en yeni 10 sonuç korunur; ücretli planların sınırları ilgili plan açıklamasında gösterilir.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Ücret, ödeme ve otomatik yenileme">
        <p>
          Ücretli planın vergiler dâhil toplam bedeli, dönem süresi ve yenileme bilgisi
          ödeme öncesinde gösterilir. Ödeme iyzico altyapısıyla alınır. Abonelik seçilen
          plana göre dönemsel olarak yenilenebilir; yenilemeyi Hesabım sayfasından
          kapatabilirsiniz. İptal, mevcut ödenmiş dönemin sonuna kadar erişimi sürdürür.
          Tahsilat başarısız olursa erişim üç günlük düzeltme süresi boyunca devam
          edebilir; ödeme tamamlanmazsa ücretli haklar askıya alınabilir.
        </p>
      </LegalSection>

      <LegalSection title="7. Tüketici ön bilgilendirmesi, cayma ve iade">
        <p>
          Tüketici sıfatıyla yapılan satın almalarda hizmetin temel özellikleri, sağlayıcı
          bilgileri, toplam fiyat, ödeme ve ifa koşulları, cayma hakkı/istisnaları ve hak
          arama yolları ödeme öncesindeki ön bilgilendirme ve mesafeli sözleşmede ayrıca
          sunulur. Hizmetin cayma süresi dolmadan başlamasını istemeniz veya dijital
          içeriğe anında erişmeniz hâlinde kanundaki istisnalar ancak gerekli ayrı
          bilgilendirme ve onay şartları sağlanmışsa uygulanır. Emredici tüketici hakları
          bu koşullarla sınırlandırılmaz; iade talepleri ödeme belgesi ve uygulanabilir
          mevzuat uyarınca değerlendirilir.
        </p>
      </LegalSection>

      <LegalSection title="8. Yüklediğiniz içerik ve lisans">
        <p>
          Yüklediğiniz fotoğraf, logo, metin ve diğer içeriği kullanma hakkına sahip
          olduğunuzu; içeriğin üçüncü kişi haklarını, kişilik haklarını veya mevzuatı
          ihlal etmediğini kabul edersiniz. İçeriğinizin mülkiyeti sizde kalır. Vitrin AI’ye
          yalnız talep ettiğiniz işlemi sunmak, sonucu geçici olarak korumak ve geçmişi
          seçtiyseniz hesabınızda saklamak için gerekli, sınırlı ve hizmet süresiyle bağlı
          bir kullanım izni verirsiniz.
        </p>
      </LegalSection>

      <LegalSection title="9. Vitrin AI içerikleri ve çıktılar">
        <p>
          Yazılım, arayüz, marka, şablonlar ve sağlanan zeminlerin hakları Vitrin AI’ye
          veya ilgili lisans sahiplerine aittir. Oluşturduğunuz çıktıyı kendi ürünlerinizi
          tanıtmak ve ticari içerik üretmek için kullanabilirsiniz; ancak Vitrin AI
          yazılımını, şablonlarını veya zemin arşivini ayrı bir ürün olarak dağıtamazsınız.
          Yapay zekâ çıktılarının benzersizliği veya üçüncü kişilerin benzer çıktı
          üretemeyeceği garanti edilmez.
        </p>
      </LegalSection>

      <LegalSection title="10. Yapay zekâ sonuçlarının sınırları">
        <p>
          Sonuç; çekim, ışık, yansıma, ürün yapısı ve ürünün başka bir nesneyle kapanma
          durumuna göre değişebilir. Görünmeyen bölüm yeniden üretilemez; el, askı veya
          destek nesnesi kesimde kalabilir. Çıktıyı yayımlamadan, müşteriye sunmadan veya
          baskıya göndermeden önce doğrulamak sizin sorumluluğunuzdadır. Hizmet, ürünün
          maddi özellikleri veya ticari uygunluğu hakkında garanti üretmez.
        </p>
      </LegalSection>

      <LegalSection title="11. Yasak kullanım">
        <ul className="list-disc space-y-2 pl-5">
          <li>Hukuka aykırı, yanıltıcı, zararlı veya üçüncü kişinin hakkını ihlal eden içerik yüklemek.</li>
          <li>Zararlı kod, otomatik saldırı, izinsiz tarama, tersine mühendislik veya kota/güvenlik önlemlerini aşma girişimi.</li>
          <li>Başka kullanıcının hesabına, verisine, ödemesine veya çıktısına erişmeye çalışmak.</li>
          <li>Hizmeti kişileri aldatmak, sahte ürün sunmak veya kimlik/kişilik hakkını ihlal etmek için kullanmak.</li>
        </ul>
      </LegalSection>

      <LegalSection title="12. Askıya alma ve sona erme">
        <p>
          Güvenlik riski, ödeme sorunu, ağır veya tekrarlanan ihlal ve hukuki zorunluluk
          hâlinde erişim ölçülü biçimde sınırlandırılabilir. Mümkün olduğunda gerekçe ve
          itiraz kanalı bildirilir. Hesabınızı istediğiniz zaman silebilirsiniz. Devam eden
          abonelik/ödeme işlemi güvenli biçimde sonuçlandırıldıktan sonra hesap ve çalışma
          görselleri kaldırılır; kanunen tutulması gereken mali ve ispat kayıtları zorunlu
          süre boyunca saklanabilir.
        </p>
      </LegalSection>

      <LegalSection title="13. Süreklilik ve sorumluluk">
        <p>
          Bakım, güvenlik, üçüncü taraf altyapısı, bağlantı sorunu veya mücbir sebeple
          hizmet geçici olarak kesilebilir. Makul özenle hizmeti sürdürmeye ve kullanıcı
          verisini korumaya çalışırız. Kasıt, ağır kusur, kişisel veri yükümlülükleri ve
          emredici tüketici hükümlerinden doğan sorumluluklar saklıdır. Ticari karar veya
          yayımlama öncesi doğrulama kullanıcıya aittir; mevzuatın izin vermediği ölçüde
          sorumluluk sınırlaması uygulanmaz.
        </p>
      </LegalSection>

      <LegalSection title="14. Değişiklikler ve bildirim">
        <p>
          Koşullar, hizmet veya mevzuattaki değişikliklere göre yeni sürüm ve yürürlük
          tarihiyle güncellenebilir. Esaslı değişiklikler uygulama içinden veya kayıtlı
          e-posta üzerinden bildirilir; gerekli hâllerde yeniden kabul alınır. Değişiklik
          öncesinde doğmuş tüketici hakları korunur.
        </p>
      </LegalSection>

      <LegalSection title="15. Uygulanacak hukuk ve başvuru yolları">
        <p>
          Türkiye hukuku uygulanır. Tüketiciler, yürürlükteki parasal sınırlar ve görev
          kuralları uyarınca tüketici hakem heyetlerine veya tüketici mahkemelerine
          başvurabilir. Ticari kullanıcılar bakımından emredici görev ve yetki kuralları
          saklıdır; gerçek hizmet sağlayıcı adresine göre sözleşmede belirtilen yetkili
          yer uygulanır.
        </p>
      </LegalSection>

      <LegalSection title="16. İletişim">
        <p>
          Sözleşme, fatura, abonelik veya şikâyet sorularınızı {" "}
          {LEGAL_CONTACT_EMAIL ? (
            <a className="underline underline-offset-4" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
              {LEGAL_CONTACT_EMAIL}
            </a>
          ) : (
            "canlı yayın öncesi yapılandırılacak destek adresine"
          )} iletebilirsiniz.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
