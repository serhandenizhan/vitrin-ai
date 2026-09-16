-- Ödeme alınamadığında erişimin kesileceği an. Bir kez yazılır (COALESCE),
-- art arda gelen başarısız tahsilatlar pencereyi uzatmaz.
ALTER TABLE subscriptions ADD COLUMN past_due_access_until timestamptz;
-- statement
-- Arka plan kaldırmanın gerçek idempotency sözleşmesi: başarılı sonuç geçici
-- bir R2 nesnesinde saklanır ve aynı `Idempotency-Key` ile gelen istek
-- inference'ı YENİDEN ÇALIŞTIRMADAN aynı PNG'yi alır. Kredi anahtar başına
-- yalnızca bir kez tüketilir; yanıtı ağda kaybolan iş kurtarılabilir olur.
ALTER TABLE usage_reservations
 ADD COLUMN result_r2_key text,
 ADD COLUMN result_expires_at timestamptz,
 ADD CONSTRAINT usage_reservations_result_pairing
  CHECK ((result_r2_key IS NULL) = (result_expires_at IS NULL));
-- statement
-- Bakım işi süresi dolmuş sonuçları bu index üzerinden buluyor.
CREATE INDEX usage_reservations_result_expiry ON usage_reservations(result_expires_at)
 WHERE result_r2_key IS NOT NULL;
-- statement
-- "Ödemeniz alınamadı, kartınızı güncelleyin" bildirimi de kalıcı kuyruktan
-- gider; böylece bir kez gönderilmesi idempotency anahtarıyla garanti edilir.
ALTER TABLE provider_actions DROP CONSTRAINT provider_actions_kind_check;
-- statement
ALTER TABLE provider_actions ADD CONSTRAINT provider_actions_kind_check
 CHECK(kind IN ('cancel_subscription','refund_payment','suspend_entitlement','delete_account','dunning_email'));
-- statement
-- Silme koruması worker'daki belirsiz initialization koşulunu da uygulamalı:
-- initialize gönderilmiş ama provider referansı hiç alınamamış bir oturumda
-- uzakta abonelik açılmış OLABİLİR ve bu belirsizlik oturum 'expired'a
-- düştükten sonra da sürer. Yalnız 'pending' bakan eski koşul, panelden
-- yapılan silmede o aboneliği yetim bırakıyordu.
CREATE OR REPLACE FUNCTION public.billing_delete_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id=old.id AND provider_subscription_reference IS NOT NULL AND status NOT IN ('canceled','expired'))
 OR EXISTS(SELECT 1 FROM public.checkout_sessions WHERE user_id=old.id AND status='pending')
 OR EXISTS(SELECT 1 FROM public.checkout_sessions WHERE user_id=old.id AND initialization_started AND status<>'failed' AND provider_subscription_reference IS NULL)
 OR EXISTS(SELECT 1 FROM public.provider_actions WHERE user_id=old.id AND kind IN ('cancel_subscription','refund_payment') AND status<>'succeeded') THEN
 RAISE EXCEPTION 'billing cancellation must complete before account deletion';
 END IF;
 RETURN old;
END $$;
-- statement
-- Dönem snapshot'ı da değişmez kanıt kaydıdır: plan sürümü, provider
-- referansları, tarihler ve kota sonradan değiştirilemez. Yalnız yaşam
-- döngüsü alanları ve hesap silmede kimliğin kopması serbesttir.
CREATE OR REPLACE FUNCTION public.billing_immutable_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='plan_versions' THEN
  IF (to_jsonb(new)-'retired_at') IS DISTINCT FROM (to_jsonb(old)-'retired_at') THEN RAISE EXCEPTION 'plan version is immutable'; END IF;
 ELSIF TG_TABLE_NAME='billing_transactions' THEN
  IF (to_jsonb(new)-'user_id'-'invoice_reference') IS DISTINCT FROM (to_jsonb(old)-'user_id'-'invoice_reference')
   OR (new.user_id IS DISTINCT FROM old.user_id AND new.user_id IS NOT NULL)
   OR (old.invoice_reference IS NOT NULL AND new.invoice_reference IS DISTINCT FROM old.invoice_reference)
  THEN RAISE EXCEPTION 'financial transaction is immutable'; END IF;
 ELSIF TG_TABLE_NAME='subscription_periods' THEN
  IF (to_jsonb(new)-'status'-'closed_at'-'used_this_period'-'user_id') IS DISTINCT FROM (to_jsonb(old)-'status'-'closed_at'-'used_this_period'-'user_id')
   OR (new.user_id IS DISTINCT FROM old.user_id AND new.user_id IS NOT NULL)
  THEN RAISE EXCEPTION 'subscription period is immutable'; END IF;
 ELSIF TG_TABLE_NAME='user_consents' THEN
  IF (to_jsonb(new)-'user_id') IS DISTINCT FROM (to_jsonb(old)-'user_id')
   OR (new.user_id IS DISTINCT FROM old.user_id AND new.user_id IS NOT NULL)
  THEN RAISE EXCEPTION 'consent is immutable'; END IF;
 END IF;
 RETURN new;
END $$;
-- statement
CREATE TRIGGER period_snapshot BEFORE UPDATE ON subscription_periods FOR EACH ROW EXECUTE FUNCTION public.billing_immutable_snapshot();
-- statement
-- `billing_signup()` yayımlanmış ücretsiz sürümü ZORUNLU bekliyor; o sürüm
-- yanlışlıkla emekliye ayrılırsa bütün yeni kayıtlar kırılırdı. Kısıt DEFERRED:
-- yayınlama uç noktası önce eskiyi emekliye ayırıp sonra yenisini eklediği için
-- kontrol ifade sonunda değil, COMMIT anında yapılmalı.
CREATE FUNCTION public.billing_free_plan_available() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.plan_versions WHERE plan_id='deneme' AND published_at IS NOT NULL AND retired_at IS NULL) THEN
  RAISE EXCEPTION 'free plan must keep a published version';
 END IF;
 RETURN NULL;
END $$;
-- statement
CREATE CONSTRAINT TRIGGER plan_versions_free_available AFTER UPDATE OR DELETE ON plan_versions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (old.plan_id='deneme') EXECUTE FUNCTION public.billing_free_plan_available();
-- statement
REVOKE ALL ON FUNCTION public.billing_free_plan_available() FROM PUBLIC,anon,authenticated;
