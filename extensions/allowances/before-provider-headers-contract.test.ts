import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PI_DIST = join(
  process.cwd(),
  "node_modules/@earendil-works/pi-coding-agent/dist",
);

describe("Pi before_provider_headers contract", () => {
  it("is available in the installed Pi extension API", () => {
    const extensionTypes = readFileSync(
      join(PI_DIST, "core/extensions/types.d.ts"),
      "utf-8",
    );
    const runner = readFileSync(
      join(PI_DIST, "core/extensions/runner.js"),
      "utf-8",
    );
    const sdk = readFileSync(join(PI_DIST, "core/sdk.js"), "utf-8");

    expect(extensionTypes).toContain("BeforeProviderHeadersEvent");
    expect(extensionTypes).toContain('on(event: "before_provider_headers"');
    expect(runner).toContain("emitBeforeProviderHeaders");
    expect(sdk).toContain("before_provider_headers");
  });
});
