import { describe, expect, it } from "vitest";
import { isOffline } from "./is-offline";

describe("isOffline", () => {
  it("returns true when PI_OFFLINE is 1", () => {
    const original = process.env.PI_OFFLINE;
    process.env.PI_OFFLINE = "1";
    expect(isOffline()).toBe(true);
    process.env.PI_OFFLINE = original;
  });

  it("returns true when PI_OFFLINE is true", () => {
    const original = process.env.PI_OFFLINE;
    process.env.PI_OFFLINE = "true";
    expect(isOffline()).toBe(true);
    process.env.PI_OFFLINE = original;
  });

  it("returns true when PI_OFFLINE is yes", () => {
    const original = process.env.PI_OFFLINE;
    process.env.PI_OFFLINE = "yes";
    expect(isOffline()).toBe(true);
    process.env.PI_OFFLINE = original;
  });

  it("returns false when PI_OFFLINE is unset", () => {
    const original = process.env.PI_OFFLINE;
    delete process.env.PI_OFFLINE;
    expect(isOffline()).toBe(false);
    process.env.PI_OFFLINE = original;
  });

  it("returns false when PI_OFFLINE is 0", () => {
    const original = process.env.PI_OFFLINE;
    process.env.PI_OFFLINE = "0";
    expect(isOffline()).toBe(false);
    process.env.PI_OFFLINE = original;
  });

  it("returns false when PI_OFFLINE is false", () => {
    const original = process.env.PI_OFFLINE;
    process.env.PI_OFFLINE = "false";
    expect(isOffline()).toBe(false);
    process.env.PI_OFFLINE = original;
  });

  it("returns false when PI_OFFLINE is no", () => {
    const original = process.env.PI_OFFLINE;
    process.env.PI_OFFLINE = "no";
    expect(isOffline()).toBe(false);
    process.env.PI_OFFLINE = original;
  });

  it("returns false for other values", () => {
    const original = process.env.PI_OFFLINE;
    process.env.PI_OFFLINE = "maybe";
    expect(isOffline()).toBe(false);
    process.env.PI_OFFLINE = original;
  });
});
