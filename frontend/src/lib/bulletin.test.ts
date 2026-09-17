import { describe, expect, it } from "vitest";

import { POSTS, sortedPosts } from "@/lib/bulletin";

describe("bulten", () => {
  it("paylasimlar yeniden eskiye, kimlikler benzersiz", () => {
    const dates = sortedPosts().map((post) => post.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(new Set(POSTS.map((post) => post.id)).size).toBe(POSTS.length);
  });
});
