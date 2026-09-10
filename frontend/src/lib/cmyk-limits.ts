/** Ana yukleme akisi ile ayni sinir; CMYK endpoint'i dogrudan da cagrilabilir. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Ana yukleme akisi ile ayni piksel siniri. */
export const MAX_INPUT_PIXELS = 40_000_000;

export function exceedsInputPixelLimit(
  width: number | undefined,
  height: number | undefined,
): boolean {
  return width !== undefined && height !== undefined && width * height > MAX_INPUT_PIXELS;
}
