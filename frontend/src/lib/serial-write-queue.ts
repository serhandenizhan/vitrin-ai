/** Aynı kayda ait yazıları, yanıtları dahil, gönderilme sırasıyla tamamlar. */
export function createSerialWriteQueue() {
  let tail: Promise<void> = Promise.resolve();
  return (write: () => Promise<boolean>): Promise<boolean> => {
    const result = tail.then(write, write);
    // Başarısız bir yazı, ardından gelen düzeltme/yeniden denemeyi engellemesin.
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
