import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PROD = process.argv.includes("--prod");
const RESET = "\x1b[0m";

function loadDotEnv(): Record<string, string> {
  const file = join(ROOT, ".env");
  if (!existsSync(file)) {
    return {};
  }
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !match[1].startsWith("ANTHROPIC") && !match[1].startsWith("MB_LICENSE")) {
      values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return values;
}

const provisionerToken = process.env.PROVISIONER_TOKEN ?? randomBytes(24).toString("base64url");
const shared = { ...loadDotEnv(), ...process.env, PROVISIONER_TOKEN: provisionerToken };

type Proc = { name: string; color: string; cmd: string[] };

const PROCS: Proc[] = [
  { name: "provisioner", color: "\x1b[33m", cmd: ["node", "server/provisioner/main.ts"] },
  { name: "app", color: "\x1b[35m", cmd: ["node", "server/app/main.ts"] },
  ...(PROD ? [] : [{ name: "frontend", color: "\x1b[36m", cmd: ["npx", "vite"] }]),
];

function pipe(stream: NodeJS.ReadableStream, prefix: string, out: NodeJS.WriteStream) {
  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffered += chunk;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      out.write(`${prefix} ${line}\n`);
    }
  });
}

const children: ChildProcess[] = PROCS.map(({ name, color, cmd }) => {
  const child = spawn(cmd[0], cmd.slice(1), { cwd: ROOT, env: shared, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = `${color}[${name}]${RESET}`;
  pipe(child.stdout as NodeJS.ReadableStream, prefix, process.stdout);
  pipe(child.stderr as NodeJS.ReadableStream, prefix, process.stderr);
  child.on("exit", (code) => {
    if (!stopping) {
      process.stderr.write(`${name} exited with code ${code}; stopping.\n`);
      stopAll(code ?? 1);
    }
  });
  return child;
});

let stopping = false;
function stopAll(code: number) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 1000);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

process.stdout.write(PROD ? "app on http://localhost:3100\n" : "app on http://localhost:3000 (api on :3100)\n");
