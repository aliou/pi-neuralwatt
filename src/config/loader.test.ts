import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./defaults";
import { resolveApi } from "./loader";

describe("resolveApi", () => {
  it("defaults to openai-completions", () => {
    expect(DEFAULT_CONFIG.provider.api).toBe("openai-completions");
    expect(resolveApi(undefined)).toBe("openai-completions");
  });

  it("accepts the two known apis", () => {
    expect(resolveApi("openai-completions")).toBe("openai-completions");
    expect(resolveApi("anthropic-messages")).toBe("anthropic-messages");
  });

  it("falls back to the default for unknown values", () => {
    expect(resolveApi("responses")).toBe("openai-completions");
    expect(resolveApi("")).toBe("openai-completions");
  });
});
