import type { Metadata } from "next";

import { LegalNotice, LegalPage, LegalSection, LegalTable } from "@/components/legal-page";
import {
  DATA_CONTROLLER_NAME,
  LEGAL_ADDRESS,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_IDENTITY_COMPLETE,
  LEGAL_KEP,
  LEGAL_PHONE,
  LEGAL_REGISTRY_NUMBER,
} from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni — Vitrin AI",
  description: "Vitrin AI kişisel veri işleme aydınlatma metni.",
};

const missing = "Canlı yayın öncesi yapılandırılacaktır";

export default function KvkkPage() {
  return (
    <LegalPage
      eyebrow={`Sürüm ${LEGAL_DOCUMENT_VERSION} · Yürürlük 18 Eylül 2026`}
      title="KVKK aydınlatma metni"
      summary="Bu metin; Vitrin AI hesabı, fotoğraf işleme, çalışma geçmişi, ödeme ve destek süreçlerinde kişisel verilerin nasıl işlendiğini açıklar."
    >
      {!LEGAL_IDENTITY_COMPLETE ? (
        <LegalNotice>
          <strong>Yayın öncesi kimlik doğrulaması gerekiyor.</strong> Bu geliştirme
          ortamında veri sorumlusunun zorunlu ticari iletişim bilgileri henüz
          yapılandırılmamıştır. Yasal kimlik bilgileri tamamlanmadan canlı yayın yapılamaz.
        </LegalNotice>
      ) : null}

      <LegalSection title="1. Veri sorumlusu ve iletişim">
        <dl className="grid gap-2 sm:grid-cols-[11rem_1fr]">
          <dt className="font-medium text-[#1a1917]">Veri sorumlusu</dt>
          <dd>{DATA_CONTROLLER_NAME}</dd>
          <dt className="font-medium text-[#1a1917]">Merkez/adres</dt>
          <dd>{LEGAL_ADDRESS ?? missing}</dd>
          <dt className="font-medium text-[#1a1917]">Başvuru e-postası</dt>
          <dd>
            {LEGAL_CONTACT_EMAIL ? (
              <a className="underline underline-offset-4" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
                {LEGAL_CONTACT_EMAIL}
              </a>
            ) : missing}
          </dd>
          <dt className="font-medium text-[#1a1917]">KEP</dt>
          <dd>{LEGAL_KEP ?? "Varsa canlı yayın öncesi yapılandırılacaktır"}</dd>
          <dt className="font-medium text-[#1a1917]">Telefon</dt>
          <dd>{LEGAL_PHONE ?? missing}</dd>
          <dt className="font-medium text-[#1a1917]">MERSİS/sicil/vergi no.</dt>
          <dd>{LEGAL_REGISTRY_NUMBER ?? missing}</dd>
        </dl>
      </LegalSection>

      <LegalSection title="2. İşlenen veriler, amaçlar ve hukuki sebepler">
        <LegalTable
          headers={["Veri kategorisi", "Örnekler ve amaç", "KVKK işleme şartı"]}
          rows={[
            ["Kimlik ve profil", "Ad, soyad, e-posta, şehir, isteğe bağlı telefon, hesap/işletme türü ve şirket adı; üyelik, hesap yönetimi, destek ve kişiselleştirme.", "Sözleşmenin kurulması veya ifası için gerekli olma (md. 5/2-c)."],
            ["Oturum ve güvenlik", "Oturum belirteçleri, IP ve teknik istek kayıtları, cihaz/tarayıcı bilgisi; oturumun sürdürülmesi, kötüye kullanımın önlenmesi ve hizmet güvenliği.", "Sözleşmenin ifası (md. 5/2-c), hakkın tesisi/korunması (md. 5/2-e) ve ölçülü meşru menfaat (md. 5/2-f)."],
            ["Görsel ve çalışma", "Yüklenen özgün ürün fotoğrafı, üretilen kesim, küçük önizleme, dosya adı, zemin seçimi ve işlem süresi; arka plan kaldırma, tekrar güvenliği ve isteğe bağlı çalışma geçmişi.", "Sözleşmenin kurulması veya ifası için gerekli olma (md. 5/2-c)."],
            ["Ödeme ve faturalama", "Ad, soyad, GSM, T.C. kimlik numarası, fatura adresi, plan, tutar, ödeme/abonelik referansları ve işlem durumu; ödeme, abonelik, fatura ve muhasebe süreçleri.", "Sözleşmenin ifası (md. 5/2-c), hukuki yükümlülük (md. 5/2-ç) ve hakkın tesisi/korunması (md. 5/2-e)."],
            ["Tercih ve onay kayıtları", "Görülen yasal belge sürümü, kabul/bildirim zamanı, pazarlama tercihi; hukuki bildirimlerin ispatı ve tercihlerinizin uygulanması.", "Hukuki yükümlülük (md. 5/2-ç), hakkın tesisi/korunması (md. 5/2-e); pazarlamada ayrıca geri alınabilir izin/açık rıza."],
            ["Destek ve iletişim", "Talebinizde paylaştığınız iletişim ve mesaj içeriği; sorunun çözülmesi, hizmet kalitesinin korunması ve uyuşmazlık yönetimi.", "Talebe göre sözleşmenin ifası (md. 5/2-c), hakkın tesisi/korunması (md. 5/2-e) veya meşru menfaat (md. 5/2-f)."],
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Toplama yöntemi">
        <p>
          Veriler; kayıt ve ödeme formları, yüklediğiniz dosyalar, hesap ve stüdyo
          işlemleri, destek iletişimi, zorunlu oturum çerezleri ve sunucu güvenlik
          kayıtları üzerinden elektronik ve çoğunlukla otomatik yollarla toplanır.
          Pazarlama tercihi hizmetin koşulu değildir ve ayrı seçimle alınır.
        </p>
      </LegalSection>

      <LegalSection title="4. Fotoğrafların işlenmesi ve saklama">
        <LegalTable
          headers={["Kayıt", "Saklama yaklaşımı"]}
          rows={[
            ["Özgün fotoğraf", "Arka plan kaldırma sırasında bellekte işlenir; çalışma geçmişine kaydedilmez."],
            ["Geçici kesim sonucu", "Yanıt kaybında aynı kredinin yeniden harcanmasını önlemek amacıyla özel R2 alanında en fazla 24 saat tutulur ve bakım işiyle silinir."],
            ["Çalışma geçmişi", "Geçmiş açıksa sonuç ve küçük önizleme kullanıcı silene veya hesap kapanana kadar saklanır. Ücretsiz planda en yeni 10 çalışma korunur; eski kayıtlar silme kuyruğuna alınır."],
            ["Hesap ve profil", "Hesap devam ettiği sürece; hesap silme talebinin tamamlanmasıyla birlikte operasyonel kayıtlar kaldırılır."],
            ["Mali, onay ve uyuşmazlık kayıtları", "İlgili vergi, tüketici, ticaret ve ispat mevzuatındaki zorunlu süreler ile zamanaşımı süreleri boyunca sınırlı erişimle saklanır; ardından silinir veya anonimleştirilir."],
            ["Teknik güvenlik kayıtları", "Güvenlik ve hata incelemesi için amaçla ölçülü süre boyunca; uyuşmazlık veya saldırı incelemesi varsa ilgili sürecin sonuna kadar saklanır."],
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Aktarım yapılan alıcı grupları">
        <ul className="list-disc space-y-2 pl-5">
          <li>Kimlik doğrulama ve veritabanı hizmeti için Supabase.</li>
          <li>Geçici sonuçlar, çalışmalar ve önizlemeler için Cloudflare R2.</li>
          <li>Ödeme ve abonelik işlemleri için iyzico; kart bilgileri iyzico tarafından işlenir.</li>
          <li>Teknik işletim için barındırma, e-posta ve destek sağlayıcıları.</li>
          <li>Hukuki yükümlülük hâlinde yetkili kamu kurumları, mahkemeler ve danışmanlar.</li>
        </ul>
        <p>
          Aktarım yalnız ilgili hizmetin sunulması ve güvenliği için gerekli veriyle
          sınırlandırılır. Bir sağlayıcının altyapısı nedeniyle yurt dışı aktarım
          oluştuğunda KVKK md. 9 kapsamındaki yeterlilik kararı, standart sözleşme
          veya diğer uygun güvence mekanizmalarından geçerli olanı uygulanır.
        </p>
      </LegalSection>

      <LegalSection title="6. KVKK md. 11 kapsamındaki haklarınız">
        <p>
          Kişisel verinizin işlenip işlenmediğini öğrenme; işlenmişse bilgi isteme;
          amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme; aktarıldığı
          üçüncü kişileri bilme; eksik veya yanlış verinin düzeltilmesini, şartları
          oluştuğunda silinmesini veya yok edilmesini ve bu işlemlerin aktarılanlara
          bildirilmesini isteme; yalnız otomatik sistemlerle analiz sonucuna itiraz
          etme ve kanuna aykırı işleme nedeniyle zararın giderilmesini talep etme
          haklarına sahipsiniz.
        </p>
      </LegalSection>

      <LegalSection title="7. Başvuru yöntemi">
        <p>
          Talebinizi kimliğinizi doğrulamaya yeterli bilgiler ve kullanmak istediğiniz
          hakkın açıklamasıyla yukarıdaki posta adresine, KEP adresine veya sistemimizde
          kayıtlı e-posta adresiniz üzerinden başvuru e-postasına iletebilirsiniz.
          Başvurular en kısa sürede ve en geç 30 gün içinde sonuçlandırılır. Hesabınızı
          ve çalışmalarınızı uygulamadaki Hesabım ve Çalışmalar alanlarından da
          silebilirsiniz.
        </p>
      </LegalSection>

      <LegalSection title="8. Metnin güncellenmesi">
        <p>
          İşleme amaçları veya veri akışı esaslı biçimde değişirse metin yeni sürüm ve
          yürürlük tarihiyle güncellenir; gerektiğinde uygulama içinden ayrıca bildirim
          veya yeniden kabul alınır.
        </p>
      </LegalSection>

      <p className="fine-print border-t border-black/10 pt-6">
        Başlıca dayanaklar: 6698 sayılı Kanun md. 5, 8, 9, 10, 11 ve 13;
        Aydınlatma Yükümlülüğü Tebliği; Veri Sorumlusuna Başvuru Usul ve Esasları
        Hakkında Tebliğ; Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale
        Getirilmesi Hakkında Yönetmelik.
      </p>
    </LegalPage>
  );
}
