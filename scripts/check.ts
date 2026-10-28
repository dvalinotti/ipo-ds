// Type-checks iPoDS twice: with tsconfig.json, as the build sees it, and with
// tsconfig.lint.json, which adds noUncheckedIndexedAccess. tsc also checks the
// runtime sources the app imports, which are not written for that flag, so the
// second pass fails only on errors in iPoDS's own files. Errors without a file
// (an unreadable tsconfig) fail both passes, and so does a tsc that exits
// non-zero without reporting an error (it did not run).
import { resolve } from "node:path";

const ERROR = /(^|: )error TS/;
const OWN = /^(app|scripts|tests)\/|^error TS/;
const PASSES = [
  ["tsconfig.json", () => true],
  ["tsconfig.lint.json", (line: string) => OWN.test(line)],
] as const;

let failed = false;
for (const [project, keep] of PASSES) {
  const run = Bun.spawnSync(
    [process.execPath, "runtime/node_modules/typescript/bin/tsc", "--noEmit", "--pretty", "false", "-p", project],
    {
      cwd: resolve(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "inherit",
    },
  );
  const output = run.stdout.toString();
  const all = output.split("\n").filter((line) => ERROR.test(line));
  const errors = all.filter(keep);
  if (run.exitCode !== 0 && all.length === 0) {
    failed = true;
    console.error(`${project}: tsc exited ${run.exitCode} without reporting an error\n${output}`);
  } else if (errors.length > 0) {
    failed = true;
    console.error(`${project}: ${errors.length} error(s)\n${errors.join("\n")}`);
  }
}
process.exit(failed ? 1 : 0);
