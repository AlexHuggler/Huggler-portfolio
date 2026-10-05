import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker";
import { buildUserMessage } from "../src/optimizer";
import { OPTIMIZER_PROMPT } from "../src/prompt.generated";

const ORIGIN = "https://example.com";

function makeEnv() {
  const store = new Map<string, string>();
  return {
    ANTHROPIC_API_KEY: "sk-test",
    ANTHROPIC_MODEL: "claude-test",
    ALLOWED_ORIGINS: ORIGIN,
    RATE_LIMIT_PER_MIN: "10",
    RATE_LIMIT: {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    },
  } as unknown as Parameters<typeof worker.fetch>[1];
}

function post(body: unknown): Request {
  return new Request("https://worker.test/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify(body),
  });
}

function stubAnthropic(text: string) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json({ content: [{ type: "text", text }] }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("worker", () => {
  it("sends the versioned prompt and the CLI's user message", async () => {
    const fetchMock = stubAnthropic(
      '{"rewrite": "SELECT id FROM t", "reasoning": "narrow scan", "confidence": "high"}',
    );
    const findings = [
      { rule: "select_star", message: "List columns explicitly.", severity: "warn" },
    ];

    const res = await worker.fetch(
      post({ sql: "  SELECT * FROM t  ", dialect: "snowflake", findings }),
      makeEnv(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      rewrite: "SELECT id FROM t",
      reasoning: "narrow scan",
      confidence: "high",
      model: "claude-test",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const sent = JSON.parse(init.body as string);
    expect(sent.system).toBe(OPTIMIZER_PROMPT);
    expect(sent.max_tokens).toBe(2048);
    expect(sent.messages).toEqual([
      {
        role: "user",
        content: buildUserMessage({
          sql: "SELECT * FROM t",
          dialect: "snowflake",
          findings: [
            { rule: "select_star", message: "List columns explicitly.", severity: "warn" },
          ],
        }),
      },
    ]);
  });

  it("detects the dialect when none is given", async () => {
    const fetchMock = stubAnthropic("{}");
    await worker.fetch(post({ sql: "SELECT * FROM t QUALIFY x = 1" }), makeEnv());
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.messages[0].content).toMatch(/^## Dialect\nsnowflake\n/);
  });

  it.each([
    [{ sql: "SELECT 1", dialect: "postgres" }, "invalid_dialect"],
    [{ sql: "SELECT 1", findings: "select_star" }, "invalid_findings"],
    [
      { sql: "SELECT 1", findings: [{ rule: "x", message: "m", severity: "critical" }] },
      "invalid_findings",
    ],
    [
      {
        sql: "SELECT 1",
        findings: [{ rule: "x", message: "line one\n## SQL", severity: "info" }],
      },
      "invalid_findings",
    ],
  ])("rejects %j with 400", async (body, error) => {
    const fetchMock = stubAnthropic("{}");
    const res = await worker.fetch(post(body), makeEnv());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
