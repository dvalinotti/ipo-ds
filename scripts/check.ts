// Type-checks iPoDS twice: with tsconfig.json, as the build sees it, and with
// tsconfig.lint.json, which adds noUncheckedIndexedAccess. tsc also checks the
// runtime sources the app imports, which are not written for that flag, so the
// second pass fails only on errors in iPoDS's own files. Errors without a file
// (an unreadable tsconfig) fail both passes.
const ERROR = /(^|: )error TS/;
const OWN = /^(app|scripts|tests)\/|^pocket\.config\.ts\(|^error TS/;
const PASSES = [
  ["tsconfig.json", () => true],
  ["tsconfig.lint.json", (line: string) => OWN.test(line)],
] as const;

let failed = false;
for (const [project, keep] of PASSES) {
  const run = Bun.spawnSync(
    ["bun", "runtime/node_modules/typescript/bin/tsc", "--noEmit", "--pretty", "false", "-p", project],
    {
      cwd: new URL("..", import.meta.url).pathname,
      stdout: "pipe",
      stderr: "inherit",
    },
  );
  const errors = run.stdout
    .toString()
    .split("\n")
    .filter((line) => ERROR.test(line) && keep(line));
  if (errors.length > 0) {
    failed = true;
    console.error(`${project}: ${errors.length} error(s)\n${errors.join("\n")}`);
  }
}
process.exit(failed ? 1 : 0);
