import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./defaults";
import { resolveApi, resolveApiBaseUrl } from "./loader";

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

describe("resolveApiBaseUrl", () => {
  it("defaults when unset", () => {
    expect(resolveApiBaseUrl(undefined)).toBe(
      DEFAULT_CONFIG.provider.apiBaseUrl,
    );
    expect(resolveApiBaseUrl("")).toBe(DEFAULT_CONFIG.provider.apiBaseUrl);
    expect(resolveApiBaseUrl("   ")).toBe(DEFAULT_CONFIG.provider.apiBaseUrl);
  });

  it("trims whitespace and trailing slashes", () => {
    expect(resolveApiBaseUrl("https://gw.example/v1/")).toBe(
      "https://gw.example/v1",
    );
    expect(resolveApiBaseUrl("  https://gw.example/v1  ")).toBe(
      "https://gw.example/v1",
    );
  });

  it("accepts http and https", () => {
    expect(resolveApiBaseUrl("http://localhost:8080/v1")).toBe(
      "http://localhost:8080/v1",
    );
  });

  it("falls back for non-http and unparseable values", () => {
    expect(resolveApiBaseUrl("ftp://gw.example")).toBe(
      DEFAULT_CONFIG.provider.apiBaseUrl,
    );
    expect(resolveApiBaseUrl("not a url")).toBe(
      DEFAULT_CONFIG.provider.apiBaseUrl,
    );
  });
});
