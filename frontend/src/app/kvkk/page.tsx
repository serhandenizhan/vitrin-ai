import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";
import {
  DATA_CONTROLLER_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCUMENT_VERSION,
} from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni — Vitrin AI",
  description: "Vitrin AI kişisel veri işleme aydınlatma metni.",
};

export default function KvkkPage() {
  return (
    <LegalPage
      eyebrow={`Sürüm ${LEGAL_DOCUMENT_VERSION}`}
      title="KVKK aydınlatma metni"
      summary="Bu metin, kişisel verilerin hangi amaçlarla ve hangi hukuki sebeplerle işlendiğini açıklar."
    >
      <LegalSection title="1. Veri sorumlusu">
        <p>
          6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu: {" "}
          <strong>{DATA_CONTROLLER_NAME}</strong>.
        </p>
        <p>
          Başvuru ve iletişim adresi: {" "}
          {LEGAL_CONTACT_EMAIL ? (
            <a className="underline underline-offset-4" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
              {LEGAL_CONTACT_EMAIL}
            </a>
          ) : (
            <strong>yayına alınmadan önce ilan edilecektir</strong>
          )}
          .
        </p>
      </LegalSection>

      <LegalSection title="2. İşlenen kişisel veriler">
        <ul className="list-disc space-y-2 pl-5">
          <li>Ad, soyad, e-posta, isteğe bağlı telefon ve şehir.</li>
          <li>Hesap türü; şirket hesabında şirket adı ve işletme türü.</li>
          <li>Hesap, oturum, güvenlik ve işlem kayıtları.</li>
          <li>Yüklenen ürün fotoğrafı ve hesapta saklanması seçilen sonuç görselleri.</li>
          <li>Kullanım koşulu sürümü, aydınlatma bildirimi ve ticari ileti tercihi.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Amaç ve hukuki sebepler">
        <p>
          Veriler; hesap oluşturmak, fotoğraf işleme ve geçmiş hizmetini sunmak,
          güvenliği sağlamak, destek vermek ve yasal yükümlülükleri yerine getirmek
          amacıyla işlenir. İşleme; sözleşmenin kurulması veya ifası, hukuki
          yükümlülük, bir hakkın tesisi/kullanılması ve meşru menfaat sebeplerine
          dayanır. Kampanya e-postaları yalnızca ayrı ve isteğe bağlı onayla gönderilir.
        </p>
      </LegalSection>

      <LegalSection title="4. Toplama yöntemi ve saklama">
        <p>
          Veriler kayıt formları, hesap işlemleri ve hizmet kullanımı sırasında otomatik
          yollarla toplanır. Özgün fotoğraf yalnızca işlem sırasında bellekte tutulur;
          hesap geçmişine yalnızca sonuç görseli kaydedilir. Hesap silindiğinde kayıtlı
          sonuçlar ve hesap verileri silinir; kanunen saklanması gereken kayıtlar ilgili
          süre boyunca sınırlı erişimle tutulur.
        </p>
      </LegalSection>

      <LegalSection title="5. Aktarım ve hizmet sağlayıcılar">
        <p>
          Veriler, hizmetin çalışması için gerekli ölçüde kimlik doğrulama ve veritabanı
          sağlayıcısı Supabase, nesne depolama sağlayıcısı Cloudflare R2 ve barındırma
          sağlayıcılarıyla paylaşılabilir. Kanunen zorunlu hâllerde yetkili kamu
          kurumlarına aktarılabilir. Yurt dışı aktarım gerekiyorsa KVKK madde 9’daki
          geçerli aktarım şartları ve güvenceler uygulanır.
        </p>
      </LegalSection>

      <LegalSection title="6. KVKK madde 11 kapsamındaki haklarınız">
        <p>
          Verinizin işlenip işlenmediğini öğrenme, bilgi isteme, amacına uygun kullanımı
          öğrenme, aktarılan tarafları bilme, düzeltme, silme veya yok etme, bu işlemlerin
          aktarılanlara bildirilmesini isteme, otomatik analiz sonucuna itiraz etme ve
          zararın giderilmesini talep etme haklarına sahipsiniz. Taleplerinizi yukarıdaki
          iletişim adresine iletebilirsiniz; hesabı doğrudan Hesabım sayfasından da
          silebilirsiniz.
        </p>
      </LegalSection>

      <p className="fine-print border-t border-black/10 pt-6">
        Dayanak: 6698 sayılı Kanun’un 5, 9, 10 ve 11. maddeleri ile Aydınlatma
        Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ.
      </p>
    </LegalPage>
  );
}
