import { describe, expect, it, vi } from "vitest";
import {
  ApiBaseUrlEditor,
  checkApiBase,
  normalizeApiBaseUrlInput,
} from "./api-base-url-editor";

const theme = {
  label: (t: string) => t,
  value: (t: string) => t,
  description: (t: string) => t,
  cursor: ">",
  hint: (t: string) => t,
};

function okFetch(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
}

describe("normalizeApiBaseUrlInput", () => {
  it("trims whitespace and trailing slashes", () => {
    expect(normalizeApiBaseUrlInput("  https://gw.example/v1/  ")).toBe(
      "https://gw.example/v1",
    );
    expect(normalizeApiBaseUrlInput("https://gw.example/v1///")).toBe(
      "https://gw.example/v1",
    );
  });
});

function makeEditor(initial: string) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const editor = new ApiBaseUrlEditor({
    initial,
    defaultBaseUrl: "https://api.example.com/v1",
    theme,
    requestRender: vi.fn(),
    onSubmit,
    onCancel,
  });
  return { editor, onSubmit, onCancel };
}

describe("checkApiBase", () => {
  it("passes when the endpoint returns a catalog", async () => {
    vi.stubGlobal("fetch", okFetch({ data: [{ id: "m" }] }));
    expect(await checkApiBase("https://gw.example/v1")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("fails on HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    expect(await checkApiBase("https://gw.example/v1")).toContain("HTTP 500");
    vi.unstubAllGlobals();
  });

  it("probes the endpoint and submits the normalized base", async () => {
    vi.stubGlobal("fetch", okFetch({ data: [] }));
    const { editor, onSubmit } = makeEditor("https://gw.example/v1/");
    editor.handleInput("\r");
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith("https://gw.example/v1");
    vi.unstubAllGlobals();
  });

  it("stays open with an error when the probe fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    const { editor, onSubmit } = makeEditor("https://bad.example/v1");
    editor.handleInput("\r");
    await vi.waitFor(() =>
      expect(editor.render(80).join("\n")).toContain("HTTP 404"),
    );
    expect(onSubmit).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("cancels on escape without submitting", () => {
    const { editor, onSubmit, onCancel } = makeEditor("https://gw.example/v1");
    editor.handleInput("\u001b");
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
