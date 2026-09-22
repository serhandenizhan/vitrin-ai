import { describe, expect, it, vi } from "vitest";

import { createSerialWriteQueue } from "@/lib/serial-write-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("createSerialWriteQueue", () => {
  it("a delayed draft finishes before the completion update starts", async () => {
    const enqueue = createSerialWriteQueue();
    const draft = deferred<boolean>();
    const calls: string[] = [];
    const save = enqueue(() => {
      calls.push("draft");
      return draft.promise;
    });
    const complete = enqueue(async () => {
      calls.push("completed");
      return true;
    });

    await Promise.resolve();
    expect(calls).toEqual(["draft"]);
    draft.resolve(true);
    expect(await save).toBe(true);
    expect(await complete).toBe(true);
    expect(calls).toEqual(["draft", "completed"]);
  });

  it("allows a retry after a failed write", async () => {
    const enqueue = createSerialWriteQueue();
    const failure = vi.fn(async () => { throw new Error("network"); });
    await expect(enqueue(failure)).rejects.toThrow("network");
    await expect(enqueue(async () => true)).resolves.toBe(true);
  });
});
