// runner for continuity unit tests using Next.js ts-node or compiled ts
import { execSync } from "child_process";

console.log("Compiling and running continuity tests...");
// We can run with tsx or node --import
try {
  const output = execSync("npx tsx src/lib/youtube/continuity.test.ts", {
    encoding: "utf-8",
    cwd: process.cwd(),
  });
  console.log(output);
} catch (err) {
  console.error("Test execution failed:", err.stdout || err.message);
  process.exit(1);
}
