import { assertEquals } from "../../../deps.ts";
import { safeErrorMessage } from "../safeErrorMessage.ts";

Deno.test("safeErrorMessage returns only the error message", () => {
  const token = "fake-token-safe-error-message";
  const error = Object.assign(new Error("Request failed"), {
    config: { headers: { Authorization: `bearer ${token}` } },
    cause: { token },
  });

  assertEquals(safeErrorMessage(error), "Request failed");
  assertEquals(safeErrorMessage({ message: token }), "Unknown error");
  assertEquals(safeErrorMessage(token), "Unknown error");
});

Deno.test("safeErrorMessage leaves tokens in Error.message unchanged", () => {
  const token = "fake-token-in-error-message";
  const message = `Request failed for bearer ${token}`;

  assertEquals(safeErrorMessage(new Error(message)), message);
});
