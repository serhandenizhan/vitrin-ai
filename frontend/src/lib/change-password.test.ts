import { describe, expect, it, vi } from "vitest";

import { changePassword } from "@/lib/change-password";

function fakeAuth({
  signInError = null,
  updateError = null,
}: { signInError?: { code: string } | null; updateError?: { code: string } | null } = {}) {
  return {
    signInWithPassword: vi.fn().mockResolvedValue({ error: signInError }),
    updateUser: vi.fn().mockResolvedValue({ error: updateError }),
  };
}

describe("changePassword", () => {
  it("mevcut parolayı Supabase sunucusuna da gönderir (current_password)", async () => {
    // /cso incelemesi: kontrol yalnız tarayıcıdaydı. Sunucu tarafı ayarı
    // ("Require current password") açıkken bu alan gönderilmezse Hesabım
    // sayfası da reddedilir.
    const auth = fakeAuth();

    const result = await changePassword(auth as never, "a@ornek.com", "Eski2026!", "Yeni2026!");

    expect(result).toBeNull();
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: "Yeni2026!",
      current_password: "Eski2026!",
    });
  });

  it("mevcut parola yanlışsa parolayı hiç değiştirmeye çalışmaz", async () => {
    const auth = fakeAuth({ signInError: { code: "invalid_credentials" } });

    const result = await changePassword(auth as never, "a@ornek.com", "yanlis", "Yeni2026!");

    expect(result).toBe("Mevcut parolanız hatalı.");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["current_password_mismatch", "Mevcut parolanız hatalı."],
    ["current_password_required", "Mevcut parolanızı yazın."],
    ["reauthentication_needed", "Güvenliğiniz için çıkış yapıp yeniden giriş yapın, sonra parolanızı değiştirin."],
  ])("sunucunun %s hatasını anlaşılır bir mesaja çevirir", async (code, message) => {
    const auth = fakeAuth({ updateError: { code } });

    expect(await changePassword(auth as never, "a@ornek.com", "Eski2026!", "Yeni2026!")).toBe(message);
  });
});
