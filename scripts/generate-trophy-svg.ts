import { parse } from "https://deno.land/std@0.203.0/flags/mod.ts";
import { dirname } from "https://deno.land/std@0.203.0/path/mod.ts";

type Options = {
  help: boolean;
  url?: string;
  username?: string;
  query?: string;
  output?: string;
  errors: string[];
};

function printHelp(): void {
  console.log(`Usage:
  deno run -A scripts/generate-trophy-svg.ts --url URL [--output PATH]
  deno run -A scripts/generate-trophy-svg.ts --username NAME [--query QUERY] [--output PATH]

Options:
  --url       Full request URL, including query string
  --username  GitHub username
  --query     Extra query string without the leading "?"
  --output    Output SVG path
  -h, --help  Show this help message
`);
}

function findMissingValues(args: string[]): string[] {
  const errors: string[] = [];
  const valueFlags = new Set(["--url", "--username", "--query", "--output"]);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--") {
      break;
    }
    if (!arg.startsWith("--")) {
      continue;
    }
    const [flag, inlineValue] = arg.split("=", 2);
    if (!valueFlags.has(flag)) {
      continue;
    }
    if (inlineValue !== undefined) {
      if (inlineValue.length === 0) {
        errors.push(`Missing value for: ${flag}`);
      }
      continue;
    }
    const next = args[i + 1];
    if (!next || next.startsWith("-")) {
      errors.push(`Missing value for: ${flag}`);
      continue;
    }
    i += 1;
  }
  return errors;
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    const last = value[value.length - 1];
    if (typeof last === "string") {
      return last;
    }
  }
  return undefined;
}

function parseArgs(args: string[]): Options {
  const parsed = parse(args, {
    boolean: ["help"],
    string: ["url", "username", "query", "output"],
    alias: { h: "help" },
  });

  const errors: string[] = [];
  const allowedKeys = new Set([
    "_",
    "help",
    "h",
    "url",
    "username",
    "query",
    "output",
  ]);
  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Unknown option: --${key}`);
    }
  }
  if (parsed._.length > 0) {
    for (const arg of parsed._) {
      errors.push(`Unknown argument: ${arg}`);
    }
  }
  errors.push(...findMissingValues(args));

  const options: Options = {
    help: Boolean(parsed.help),
    errors,
  };
  options.url = readString(parsed.url);
  options.username = readString(parsed.username);
  options.query = readString(parsed.query);
  options.output = readString(parsed.output);
  return options;
}

function buildUrl(options: Options): string | null {
  if (options.url) {
    return options.url;
  }
  if (!options.username) {
    return null;
  }
  const url = new URL("http://localhost/");
  url.searchParams.set("username", options.username);
  if (options.query) {
    const queryString = options.query.replace(/^\?/, "");
    const extraParams = new URLSearchParams(queryString);
    for (const [key, value] of extraParams.entries()) {
      if (key === "username") {
        continue;
      }
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

function resolveOutputPath(options: Options): string {
  if (options.output) {
    return options.output;
  }
  let username = options.username;
  if (!username && options.url) {
    try {
      username = new URL(options.url).searchParams.get("username") ?? undefined;
    } catch {
      username = undefined;
    }
  }
  if (username) {
    return `generated/${username}.svg`;
  }
  return "generated/trophy.svg";
}

async function loadHandler() {
  const module = await import("../api/index.ts");
  return module.default as (request: Request) => Promise<Response>;
}

export async function run(args: string[]): Promise<number> {
  const options = parseArgs(args);
  if (options.help) {
    printHelp();
    return 0;
  }
  if (options.url && options.username) {
    options.errors.push("Use either --url or --username, not both.");
  }
  if (!options.url && !options.username) {
    options.errors.push("Missing required --url or --username.");
  }
  if (options.errors.length > 0) {
    for (const error of options.errors) {
      console.error(error);
    }
    printHelp();
    return 1;
  }

  const url = buildUrl(options);
  if (!url) {
    console.error("Failed to build request URL.");
    return 1;
  }
  const outputPath = resolveOutputPath(options);

  const requestHandler = await loadHandler();
  const response = await requestHandler(new Request(url));
  if (!response.ok) {
    const body = await response.text();
    console.error(`Request failed with status ${response.status}.`);
    if (body) {
      console.error(body);
    }
    return 1;
  }

  const svg = await response.text();
  const outputDir = dirname(outputPath);
  if (outputDir !== ".") {
    await Deno.mkdir(outputDir, { recursive: true });
  }
  await Deno.writeTextFile(outputPath, svg);
  console.log(`Wrote ${outputPath}`);
  return 0;
}

if (import.meta.main) {
  const code = await run(Deno.args);
  Deno.exit(code);
}
