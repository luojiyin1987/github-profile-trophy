import { Retry } from "../Retry.ts";
import { Logger } from "../Logger.ts";
import {
  assertEquals,
  assertRejects,
  assertSpyCalls,
  spy,
  stub,
} from "../../../deps.ts";

type MockResponse = {
  value: number;
};

Deno.test("Retry.fetch", () => {
  const retryInstance = new Retry();
  const callback = spy(retryInstance, "fetch");

  retryInstance.fetch<MockResponse>(() => {
    return { value: 1 };
  });

  assertSpyCalls(callback, 1);
});

Deno.test("Should retry", async () => {
  let countErrors = 0;

  const callbackError = () => {
    countErrors++;
    throw new Error("Panic! Threw Error");
  };
  const retries = 3;
  const retryInstance = new Retry(retries);

  const error = await assertRejects(
    () => {
      return retryInstance.fetch<MockResponse>(callbackError);
    },
    Error,
    `Max retries (${retries}) exceeded.`,
  );

  assertEquals(countErrors, 3);
  assertEquals(error.cause instanceof Error, true);
  assertEquals((error.cause as Error).message, "Panic! Threw Error");
});

Deno.test("Should retry the asyncronous callback", async () => {
  let countErrors = 0;
  const callbackError = async () => {
    countErrors++;
    // Mock request in callback
    await new Promise((_, reject) => setTimeout(reject, 100));
  };

  const retries = 3;
  const retryInstance = new Retry(retries);

  await assertRejects(
    () => {
      return retryInstance.fetch(callbackError);
    },
    Error,
    `Max retries (${retries}) exceeded.`,
  );

  assertEquals(countErrors, 3);
});

Deno.test("Retry logs only the message of an HTTP error", async () => {
  const token = "fake-token-retry-log";
  const error = Object.assign(new Error("Request failed"), {
    config: { headers: { Authorization: `bearer ${token}` } },
    cause: { token },
  });
  const messages: unknown[] = [];
  const logStub = stub(Logger, "error", (message: unknown) => {
    messages.push(message);
  });

  try {
    await assertRejects(() =>
      new Retry(2, 0).fetch(() => {
        throw error;
      })
    );
    assertEquals(messages, ["Request failed"]);
    assertEquals(JSON.stringify(messages).includes(token), false);
  } finally {
    logStub.restore();
  }
});
