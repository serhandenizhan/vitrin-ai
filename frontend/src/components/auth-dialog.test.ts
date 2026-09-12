// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kayit formunun hesap turu davranisi (kullanici karari 13.09.2026).
 *
 * Neden bilesen testi: 2. adima tarayicida parola yazmadan gecilemiyor;
 * bireysel/sirket ayriminin hangi alanlari gosterdigi ve Supabase'e NE
 * yazildigi burada, gercek bilesen uzerinden dogrulaniyor.
 */

const signUp = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp } }),
}));

vi.mock("@/components/workspace-provider", () => ({
  WELCOME_QUERY_PARAM: "hosgeldiniz",
  useWorkspace: () => ({
    isSignInOpen: true,
    closeSignIn: vi.fn(),
    isAuthConfigured: true,
    signInMode: "signup",
  }),
}));

async function renderDialog() {
  const { AuthDialog } = await import("@/components/auth-dialog");
  render(createElement(AuthDialog));
}

function change(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** 1. adimi gecerli bilgilerle doldurup 2. adima gecer. */
function completeAccountStep() {
  change("Ad", "Kaan");
  change("Soyad", "Şencan");
  change("E-posta", "kaan@ornek.com");
  change("Parola", "Kuyumcu2026");
  change("Parola (tekrar)", "Kuyumcu2026");
  fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
}

beforeEach(() => {
  signUp.mockReset();
  signUp.mockResolvedValue({ error: null });
});

afterEach(() => {
  cleanup();
});

describe("kayit: hesap turu", () => {
  it("sirket alanlari yalnizca Sirket secilince gorunuyor", async () => {
    await renderDialog();
    completeAccountStep();

    // "Hesap türü" hem baslikta hem ekran okuyucu icin gizli <legend>'da
    // geciyor; baslik rolüyle aranıyor.
    expect(screen.getByRole("heading", { name: "Hesap türü" })).toBeTruthy();
    expect(screen.queryByLabelText("Şirket adı")).toBeNull();

    fireEvent.click(screen.getByLabelText(/Şirket/));
    expect(screen.getByLabelText("Şirket adı")).toBeTruthy();
    expect(screen.getByLabelText("İşletme türü")).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Bireysel/));
    expect(screen.queryByLabelText("Şirket adı")).toBeNull();
  });

  it("bireysel hesapta sirket bilgisi Supabase'e YAZILMIYOR", async () => {
    await renderDialog();
    completeAccountStep();

    // Once sirket secip ad yazip sonra bireysele donmek: eski deger kalmamali.
    fireEvent.click(screen.getByLabelText(/Şirket/));
    change("Şirket adı", "Eski Şirket");
    fireEvent.click(screen.getByLabelText(/Bireysel/));
    change("Şehir", "İzmir");
    fireEvent.click(screen.getByLabelText(/Kullanım koşullarını/));
    fireEvent.click(screen.getByRole("button", { name: "Hesap oluştur" }));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    const data = signUp.mock.calls[0][0].options.data;
    expect(data).toMatchObject({
      first_name: "Kaan",
      account_type: "individual",
      business_name: null,
      business_type: null,
      city: "İzmir",
      marketing_opt_in: false,
    });
  });

  it("sirket hesabinda sirket adi ve turu zorunlu, sonra yaziliyor", async () => {
    await renderDialog();
    completeAccountStep();

    fireEvent.click(screen.getByLabelText(/Şirket/));
    change("Şehir", "İstanbul");
    fireEvent.click(screen.getByLabelText(/Kullanım koşullarını/));
    // Sirket adi ve turu bosken gonder dugmesi kapali.
    expect(
      (screen.getByRole("button", { name: "Hesap oluştur" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    change("Şirket adı", "Şencan Kuyumculuk");
    change("İşletme türü", "workshop");
    fireEvent.click(screen.getByRole("button", { name: "Hesap oluştur" }));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp.mock.calls[0][0].options.data).toMatchObject({
      account_type: "company",
      business_name: "Şencan Kuyumculuk",
      business_type: "workshop",
    });
  });

  it("hesap turu secilmeden gonderilemiyor", async () => {
    await renderDialog();
    completeAccountStep();

    change("Şehir", "Ankara");
    fireEvent.click(screen.getByLabelText(/Kullanım koşullarını/));

    expect(
      (screen.getByRole("button", { name: "Hesap oluştur" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(signUp).not.toHaveBeenCalled();
  });
});
