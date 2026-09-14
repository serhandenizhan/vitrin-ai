import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Gizlilik Politikası — Vitrin AI",
  description: "Vitrin AI gizlilik ve veri saklama politikası.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow={`Sürüm ${LEGAL_DOCUMENT_VERSION}`}
      title="Gizlilik politikası"
      summary="Hangi verinin nerede tutulduğunu ve kullanıcı olarak hangi kontrollerin sizde olduğunu sade biçimde anlatıyoruz."
    >
      <LegalSection title="Fotoğraflar ve çalışmalar">
        <p>
          Özgün ürün fotoğrafınız arka plan kaldırma işlemi için geçici olarak işlenir ve
          kalıcı depolamaya yazılmaz. Hesap geçmişi açıksa yalnızca ortaya çıkan sonuç
          görseli ve küçük önizlemesi özel Cloudflare R2 alanında saklanır. Bu nesneler
          herkese açık değildir; kısa süreli imzalı adreslerle sunulur.
        </p>
      </LegalSection>
      <LegalSection title="Hesap ve oturum">
        <p>
          Kimlik doğrulama Supabase tarafından yürütülür. Oturum tarayıcı çerezlerinde
          tutulur; parolayı Vitrin AI sunucuları görmez veya saklamaz. Profil alanları
          yalnızca hizmeti kişiselleştirmek ve destek için kullanılır, yetkilendirme
          kararı olarak kullanılmaz.
        </p>
      </LegalSection>
      <LegalSection title="Bu cihazda tutulanlar">
        <p>
          Stüdyo ayarları, hareket tercihi ve yüklediğiniz logo ile logo yerleşim ayarları
          tarayıcınızın localStorage alanında tutulabilir. Bunları site verilerini
          temizleyerek kaldırabilirsiniz. Oturum için zorunlu çerezler dışında reklam veya
          üçüncü taraf takip çerezi kullanılmaz.
        </p>
      </LegalSection>
      <LegalSection title="Silme ve güvenlik">
        <p>
          Çalışmaları tek tek veya topluca silebilirsiniz. Hesabı silme işlemi önce kayıtlı
          görselleri, sonra kimlik hesabını kaldırır. Aktarımda HTTPS, veritabanında
          kullanıcı sahipliği kontrolleri ve RLS, depolamada özel bucket ve süreli URL
          kullanılır.
        </p>
      </LegalSection>
      <LegalSection title="Ayrıntılı haklar">
        <p>
          İşlenen veri kategorileri, hukuki sebepler, aktarım tarafları ve başvuru
          hakları için KVKK Aydınlatma Metni’ni inceleyin.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
