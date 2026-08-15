// runner for continuity unit tests using vitest
import { execSync } from "child_process";

console.log("Running YouTube continuity tests with Vitest...");
try {
  const output = execSync("npx vitest run src/lib/youtube/continuity.test.ts", {
    encoding: "utf-8",
    cwd: process.cwd(),
  });
  console.log(output);
} catch (err) {
  console.error("Test execution failed:", err.stdout || err.message);
  process.exit(1);
}
