import assert from "node:assert/strict";
import { GeminiKeyPool } from "@workspace/gemini-key-pool";
import { EmbeddingError } from "../embeddings/errors";
import { embedBatchWithPool, type GeminiPoolEmbedClient } from "../embeddings/geminiEmbeddingProvider";

function rateLimitError(): Error {
  return new Error("429 RESOURCE_EXHAUSTED: quota exceeded for this project");
}

function authError(): Error {
  return Object.assign(new Error("API key not valid. Please pass a valid API key."), { status: 401 });
}

function badRequestError(): Error {
  return new Error("400 INVALID_ARGUMENT: contents must be non-empty");
}

function fakeClientFactory(behaviors: Record<string, Array<"success" | Error>>): {
  getClient: (keyState: { id: string; key: string }) => GeminiPoolEmbedClient;
  callCounts: Record<string, number>;
} {
  const callCounts: Record<string, number> = {};
  const getClient = (keyState: { id: string }): GeminiPoolEmbedClient => ({
    models: {
      embedContent: async () => {
        callCounts[keyState.id] = (callCounts[keyState.id] ?? 0) + 1;
        const queue = behaviors[keyState.id] ?? [];
        const next = queue.shift();
        if (next instanceof Error) throw next;
        return { embeddings: [{ values: [0.1, 0.2, 0.3] }] };
      },
    },
  });
  return { getClient, callCounts };
}

export async function run(): Promise<void> {
  // --- key 1 rate-limited, key 2 succeeds ------------------------------------
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: [rateLimitError()],
      gemini_key_2: ["success"],
    });

    const response = await embedBatchWithPool(["some legal text"], "document", "legalRag", {
      pool,
      model: "gemini-embedding-001",
      getClient,
    });

    assert.deepEqual(response.embeddings?.[0]?.values, [0.1, 0.2, 0.3]);
    assert.equal(callCounts.gemini_key_1, 1);
    assert.equal(callCounts.gemini_key_2, 1);
  }
  console.log("PASS embeddings: key 1 rate-limited, key 2 succeeds");

  // --- both keys rate-limited -> RATE_LIMITED thrown --------------------------
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const { getClient } = fakeClientFactory({
      gemini_key_1: [rateLimitError()],
      gemini_key_2: [rateLimitError()],
    });

    await assert.rejects(
      () => embedBatchWithPool(["text"], "document", "legalRag", { pool, model: "gemini-embedding-001", getClient }),
      (error: unknown) => error instanceof EmbeddingError && error.code === "RATE_LIMITED",
    );
    assert.deepEqual(pool.getEligibleKeysInOrder(), []);
  }
  console.log("PASS embeddings: both keys rate-limited exhausts the pool with RATE_LIMITED");

  // --- HTTP 400 does not rotate -------------------------------------------------
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: [badRequestError()],
      gemini_key_2: ["success"],
    });

    await assert.rejects(
      () => embedBatchWithPool(["text"], "document", "legalRag", { pool, model: "gemini-embedding-001", getClient }),
      (error: unknown) => error instanceof EmbeddingError && error.code === "PROVIDER_REQUEST_FAILED",
    );
    assert.equal(callCounts.gemini_key_1, 1);
    assert.equal(callCounts.gemini_key_2 ?? 0, 0, "a bad request never rotates to another key");
  }
  console.log("PASS embeddings: a malformed request (HTTP 400) never rotates and never cools down the key");

  // --- 401 rotates, but a key is never attempted twice in the same batch ------
  {
    const pool = new GeminiKeyPool(["k1", "k2", "k3"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: [authError()],
      gemini_key_2: [authError()],
      gemini_key_3: ["success"],
    });

    await embedBatchWithPool(["text"], "document", "legalRag", { pool, model: "gemini-embedding-001", getClient });
    assert.equal(callCounts.gemini_key_1, 1);
    assert.equal(callCounts.gemini_key_2, 1);
    assert.equal(callCounts.gemini_key_3, 1);
  }
  console.log("PASS embeddings: repeated auth failures rotate through each key exactly once");

  // --- diagnostics never include a raw key value -------------------------------
  {
    const pool = new GeminiKeyPool(["a-real-looking-embedding-secret"], 120);
    const { getClient } = fakeClientFactory({ gemini_key_1: [rateLimitError()] });

    const original = console.error;
    let logged = "";
    console.error = (...args: unknown[]) => {
      logged += args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    };
    try {
      await assert.rejects(() =>
        embedBatchWithPool(["text"], "document", "legalRag", { pool, model: "gemini-embedding-001", getClient }),
      );
    } finally {
      console.error = original;
    }
    assert.ok(!logged.includes("a-real-looking-embedding-secret"));
    assert.ok(logged.includes("gemini_key_1"));
    assert.ok(logged.includes("legalRag"));
  }
  console.log("PASS embeddings: rotation diagnostics never include a raw key value");

  console.log("PASS geminiEmbeddingProvider.keyPool.test.ts");
}

run();
