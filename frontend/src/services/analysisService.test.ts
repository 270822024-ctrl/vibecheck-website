import { afterEach, describe, expect, it, vi } from "vitest";

describe("checkApiHealth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("reports the API as online when the health endpoint responds", async () => {
    vi.stubEnv("VITE_API_URL", "http://localhost:8000/");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", rules: 20 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { checkApiHealth } = await import("./analysisService");

    await expect(checkApiHealth()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/health",
      expect.objectContaining({
        cache: "no-store",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("reports the API as offline when the health endpoint cannot be reached", async () => {
    vi.stubEnv("VITE_API_URL", "http://localhost:8000");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    vi.resetModules();

    const { checkApiHealth } = await import("./analysisService");

    await expect(checkApiHealth()).resolves.toBe(false);
  });

  it("does not report an unconfigured API as online or make a request", async () => {
    vi.stubEnv("VITE_API_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { checkApiHealth } = await import("./analysisService");

    await expect(checkApiHealth()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
