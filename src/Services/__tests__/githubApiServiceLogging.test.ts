import { assertEquals, soxa, stub } from "../../../deps.ts";
import { Logger } from "../../Helpers/Logger.ts";
import { ServiceError } from "../../Types/index.ts";
import { GithubApiService } from "../GithubApiService.ts";

Deno.test("GithubApiService logs no HTTP request config or token", async () => {
  const token = "fake-token-service-log";
  const error = Object.assign(new Error("Request failed"), {
    config: { headers: { Authorization: `bearer ${token}` } },
    cause: { token },
  });
  const messages: unknown[] = [];
  const logStub = stub(Logger, "error", (message: unknown) => {
    messages.push(message);
  });
  const postStub = stub(soxa, "post", () => Promise.reject(error));

  try {
    const result = await new GithubApiService().executeQuery("query", {
      username: "test",
    });
    assertEquals(result instanceof ServiceError, true);
    assertEquals(messages, [
      "Request failed",
      "Request failed",
      "Request failed",
    ]);
    assertEquals(JSON.stringify(messages).includes(token), false);
  } finally {
    postStub.restore();
    logStub.restore();
  }
});
