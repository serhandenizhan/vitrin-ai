// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { FaqItem } from "@/components/marketing/faq-item";

describe("SSS satırı — yumuşak akordeon", () => {
  afterEach(() => cleanup());

  function ciz() {
    render(createElement(FaqItem, { question: "Ücretsiz deneyebilir miyim?", children: "Evet, ücretsiz." }));
    const soru = screen.getByRole("button", { name: "Ücretsiz deneyebilir miyim?" });
    const panel = document.getElementById(soru.getAttribute("aria-controls")!)!;
    return { soru, panel };
  }

  it("kapalı başlar: aria-expanded=false ve cevap `inert` (odaklanamaz, okuyucuya görünmez)", () => {
    const { soru, panel } = ciz();
    expect(soru.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hasAttribute("inert")).toBe(true);
  });

  it("tıklayınca açılır, tekrar tıklayınca kapanır", () => {
    const { soru, panel } = ciz();
    fireEvent.click(soru);
    expect(soru.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hasAttribute("inert")).toBe(false);
    fireEvent.click(soru);
    expect(soru.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hasAttribute("inert")).toBe(true);
  });

  it("geçiş süresi vardır (tak diye açılmaz): sınıf süre taşır", () => {
    const { panel } = ciz();
    expect(panel.className).toContain("duration-500");
  });
});
