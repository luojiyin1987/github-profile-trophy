import { GithubRepository } from "../Repository/GithubRepository.ts";
import {
  GitHubUserActivity,
  GitHubUserIssue,
  GitHubUserPullRequest,
  GitHubUserRepository,
  UserInfo,
} from "../user_info.ts";
import {
  queryUserActivity,
  queryUserIssue,
  queryUserPullRequest,
  queryUserRepository,
} from "../Schemas/index.ts";
import { Retry } from "../Helpers/Retry.ts";
import { CONSTANTS } from "../utils.ts";
import { EServiceKindError, ServiceError } from "../Types/index.ts";
import { Logger } from "../Helpers/Logger.ts";
import { requestGithubData } from "./request.ts";

// Need to be here - Exporting from another file makes array of null
export const TOKENS = [
  Deno.env.get("GITHUB_TOKEN1"),
  Deno.env.get("GITHUB_TOKEN2"),
];

export class GithubApiService extends GithubRepository {
  async requestUserRepository(
    username: string,
  ): Promise<GitHubUserRepository | ServiceError> {
    let allNodes: GitHubUserRepository["repositories"]["nodes"] = [];
    let totalCount = 0;
    let after: string | null = null;

    do {
      const variables: Record<string, string> = { username };
      if (after) {
        variables.after = after;
      }

      const result = await this.executeQuery<{
        repositories: GitHubUserRepository["repositories"] & {
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      }>(queryUserRepository, variables);

      if (result instanceof ServiceError) {
        return result;
      }

      if (allNodes.length === 0) {
        totalCount = result.repositories.totalCount;
      }

      allNodes = allNodes.concat(result.repositories.nodes);
      after = result.repositories.pageInfo.hasNextPage
        ? result.repositories.pageInfo.endCursor
        : null;
    } while (after);

    return {
      repositories: {
        totalCount,
        nodes: allNodes,
      },
    };
  }
  async requestUserActivity(
    username: string,
  ): Promise<GitHubUserActivity | ServiceError> {
    return await this.executeQuery<GitHubUserActivity>(queryUserActivity, {
      username,
    });
  }
  async requestUserIssue(
    username: string,
  ): Promise<GitHubUserIssue | ServiceError> {
    return await this.executeQuery<GitHubUserIssue>(queryUserIssue, {
      username,
    });
  }
  async requestUserPullRequest(
    username: string,
  ): Promise<GitHubUserPullRequest | ServiceError> {
    return await this.executeQuery<GitHubUserPullRequest>(
      queryUserPullRequest,
      { username },
    );
  }
  async requestUserInfo(username: string): Promise<UserInfo | ServiceError> {
    const QUERY_DELAY_MS = 200;

    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const queries = [
      { name: "repository", fn: () => this.requestUserRepository(username) },
      { name: "activity", fn: () => this.requestUserActivity(username) },
      { name: "issue", fn: () => this.requestUserIssue(username) },
      { name: "pullRequest", fn: () => this.requestUserPullRequest(username) },
    ];

    const results: Record<string, unknown> = {};

    for (let i = 0; i < queries.length; i++) {
      if (i > 0) {
        await delay(QUERY_DELAY_MS);
      }

      const { name, fn } = queries[i];
      const result = await fn();

      if (result instanceof ServiceError) {
        Logger.error(
          `Failed to fetch ${name} for username: '${username}' - ${result.message}`,
        );
        return result;
      }

      results[name] = result;
    }

    return new UserInfo(
      results.activity as GitHubUserActivity,
      results.issue as GitHubUserIssue,
      results.pullRequest as GitHubUserPullRequest,
      results.repository as GitHubUserRepository,
    );
  }

  async executeQuery<T = unknown>(
    query: string,
    variables: { [key: string]: string },
  ) {
    try {
      const retry = new Retry(
        TOKENS.length,
        CONSTANTS.DEFAULT_GITHUB_RETRY_DELAY,
      );
      return await retry.fetch<Promise<T>>(async ({ attempt }) => {
        return await requestGithubData(
          query,
          variables,
          TOKENS[attempt],
        );
      });
    } catch (error) {
      if (error.cause instanceof ServiceError) {
        Logger.error(error.cause.message);
        return error.cause;
      }
      if (error instanceof Error && error.cause) {
        Logger.error(JSON.stringify(error.cause, null, 2));
      } else {
        Logger.error(error);
      }
      return new ServiceError("not found", EServiceKindError.NOT_FOUND);
    }
  }
}
