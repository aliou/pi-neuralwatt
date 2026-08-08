import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration } from "./duration";

describe("parseDuration", () => {
  it("parses milliseconds by default", () => {
    expect(parseDuration("30000")).toBe(30000);
  });

  it("parses seconds", () => {
    expect(parseDuration("30s")).toBe(30000);
    expect(parseDuration("30S")).toBe(30000);
    expect(parseDuration("30 sec")).toBe(30000);
  });

  it("parses minutes", () => {
    expect(parseDuration("30m")).toBe(30 * 60 * 1000);
    expect(parseDuration("30M")).toBe(30 * 60 * 1000);
    expect(parseDuration("30 min")).toBe(30 * 60 * 1000);
  });

  it("parses hours", () => {
    expect(parseDuration("2h")).toBe(2 * 60 * 60 * 1000);
    expect(parseDuration("2H")).toBe(2 * 60 * 60 * 1000);
    expect(parseDuration("2 hr")).toBe(2 * 60 * 60 * 1000);
  });

  it("handles decimal values", () => {
    expect(parseDuration("1.5h")).toBe(1.5 * 60 * 60 * 1000);
    expect(parseDuration("0.5m")).toBe(0.5 * 60 * 1000);
  });

  it("returns undefined for invalid input", () => {
    expect(parseDuration("")).toBeUndefined();
    expect(parseDuration("abc")).toBeUndefined();
    expect(parseDuration("-5m")).toBeUndefined();
    expect(parseDuration("0m")).toBeUndefined();
  });

  it("uses the default unit when no unit is provided", () => {
    expect(parseDuration("30", "m")).toBe(30 * 60 * 1000);
    expect(parseDuration("30", "s")).toBe(30 * 1000);
    expect(parseDuration("30", "h")).toBe(30 * 60 * 60 * 1000);
    expect(parseDuration("30")).toBe(30);
  });
});

describe("formatDuration", () => {
  it("formats seconds", () => {
    expect(formatDuration(30 * 1000)).toBe("30s");
  });

  it("formats minutes", () => {
    expect(formatDuration(30 * 60 * 1000)).toBe("30m");
  });

  it("formats hours", () => {
    expect(formatDuration(2 * 60 * 60 * 1000)).toBe("2h");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(90 * 60 * 1000)).toBe("1h 30m");
  });
});
