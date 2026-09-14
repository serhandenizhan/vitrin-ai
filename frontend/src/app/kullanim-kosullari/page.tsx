import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";
import {
  DATA_CONTROLLER_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCUMENT_VERSION,
} from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Kullanım Koşulları — Vitrin AI",
  description: "Vitrin AI hizmet kullanım koşulları.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow={`Sürüm ${LEGAL_DOCUMENT_VERSION}`}
      title="Kullanım koşulları"
      summary="Vitrin AI hesabı açarak ve hizmeti kullanarak aşağıdaki koşulları kabul edersiniz."
    >
      <LegalSection title="1. Hizmet ve taraflar">
        <p>
          Hizmet sağlayıcı <strong>{DATA_CONTROLLER_NAME}</strong>; hizmet ise ürün
          fotoğraflarının arka planını yapay zekâyla kaldırmaya, düzenlemeye ve çıktı
          oluşturmaya yarayan Vitrin AI uygulamasıdır.
        </p>
      </LegalSection>
      <LegalSection title="2. Hesap güvenliği">
        <p>
          Doğru ve güncel bilgi vermek, parolanızı gizli tutmak ve hesabınızdaki yetkisiz
          kullanımı bildirmek sizin sorumluluğunuzdadır. Hesabınızı başkasına devredemez,
          hizmetin güvenlik veya kullanım sınırlarını aşmaya çalışamazsınız.
        </p>
      </LegalSection>
      <LegalSection title="3. Yüklediğiniz içerik">
        <p>
          Yüklediğiniz fotoğrafı kullanma hakkına sahip olduğunuzu ve içeriğin üçüncü kişi
          haklarını ihlal etmediğini kabul edersiniz. İçeriğinizin mülkiyeti sizde kalır;
          yalnızca istediğiniz işlemi yapmak ve seçtiyseniz sonucu hesap geçmişinde
          saklamak için sınırlı işleme izni verirsiniz.
        </p>
      </LegalSection>
      <LegalSection title="4. Yapay zekâ çıktıları">
        <p>
          Sonuç; çekim, ışık ve ürün yapısına göre değişebilir. El veya başka bir nesne
          ürünü kapatıyorsa görünmeyen bölüm yeniden üretilemez; elde tutulan ürünlerde el
          kesimde kalabilir. Çıktıyı yayımlamadan veya ticari baskıda kullanmadan önce
          doğrulamak kullanıcının sorumluluğundadır.
        </p>
      </LegalSection>
      <LegalSection title="5. Yasak kullanım">
        <ul className="list-disc space-y-2 pl-5">
          <li>Hukuka aykırı, yanıltıcı veya başkasının hakkını ihlal eden içerik.</li>
          <li>Zararlı kod, otomatik saldırı, kota aşma veya hizmeti tersine mühendislik.</li>
          <li>Başka kullanıcıların hesaplarına, verilerine veya çıktılarına erişme girişimi.</li>
        </ul>
      </LegalSection>
      <LegalSection title="6. Süreklilik ve sorumluluk">
        <p>
          Bakım, güvenlik veya teknik arıza nedeniyle hizmet geçici olarak kesilebilir.
          Emredici tüketici mevzuatından doğan haklar saklı kalmak üzere, dolaylı zararlar
          ve kullanıcının doğrulamadan yayımladığı çıktılar için sorumluluk kabul edilmez.
        </p>
      </LegalSection>
      <LegalSection title="7. Sona erme ve değişiklik">
        <p>
          Hesabınızı istediğiniz zaman silebilirsiniz. Esaslı değişiklikler yeni sürüm ve
          yürürlük tarihiyle yayımlanır; gerekiyorsa yeniden kabul alınır. Türkiye hukuku
          uygulanır ve emredici görev/yetki kuralları saklıdır.
        </p>
        {LEGAL_CONTACT_EMAIL ? (
          <p>
            Sorular: {" "}
            <a className="underline underline-offset-4" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
              {LEGAL_CONTACT_EMAIL}
            </a>
          </p>
        ) : null}
      </LegalSection>
    </LegalPage>
  );
}
