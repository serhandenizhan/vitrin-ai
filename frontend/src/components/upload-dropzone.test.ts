// @vitest-environment jsdom

import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UploadDropzone } from "@/components/upload-dropzone";

const dosya = () => new File(["x"], "yuzuk.png", { type: "image/png" });

describe("Yükleme alanı", () => {
  afterEach(() => cleanup());

  it("dosya seçilince ÜST bileşene bildirir ve aynı dosya tekrar seçilebilir (input sıfırlanır)", () => {
    const onFileSelected = vi.fn();
    const { container } = render(createElement(UploadDropzone, { onFileSelected }));
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [dosya()] } });
    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect(onFileSelected.mock.calls[0][0].name).toBe("yuzuk.png");
    expect(input.value).toBe("");
  });

  it("sürükle-bırak: üstüne gelince metin değişir, bırakınca dosya iletilir", () => {
    const onFileSelected = vi.fn();
    render(createElement(UploadDropzone, { onFileSelected }));
    const alan = screen.getByRole("button", { name: "Fotoğraf yükle" });
    expect(screen.getByText("Fotoğrafınızı bırakın.")).toBeTruthy();
    fireEvent.dragOver(alan);
    expect(screen.getByText("Bırakın, gerisini biz yapalım.")).toBeTruthy();
    const birak = createEvent.drop(alan);
    Object.defineProperty(birak, "dataTransfer", { value: { files: [dosya()] } });
    fireEvent(alan, birak);
    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Fotoğrafınızı bırakın.")).toBeTruthy(); // vurgu kalkar
  });

  it("devre dışıyken bırakılan dosya İLETİLMEZ ve alan odaklanamaz", () => {
    const onFileSelected = vi.fn();
    render(createElement(UploadDropzone, { onFileSelected, disabled: true }));
    const alan = screen.getByRole("button", { name: "Fotoğraf yükle" });
    expect(alan.getAttribute("aria-disabled")).toBe("true");
    expect(alan.getAttribute("tabindex")).toBe("-1");
    const birak = createEvent.drop(alan);
    Object.defineProperty(birak, "dataTransfer", { value: { files: [dosya()] } });
    fireEvent(alan, birak);
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it("klavye: Enter ve Boşluk dosya seçiciyi açar", () => {
    const { container } = render(createElement(UploadDropzone, { onFileSelected: vi.fn() }));
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const tik = vi.spyOn(input, "click");
    const alan = screen.getByRole("button", { name: "Fotoğraf yükle" });
    fireEvent.keyDown(alan, { key: "Enter" });
    fireEvent.keyDown(alan, { key: " " });
    expect(tik).toHaveBeenCalledTimes(2);
  });
});
