import { spawn } from "child_process";
import path from "path";

const testFiles = [
  "merge.test.ts",
  "split.test.ts",
  "rotate.test.ts",
  "deletePages.test.ts",
  "extractPages.test.ts",
  "reorderPages.test.ts",
  "watermark.test.ts",
  "protect.test.ts",
  "unlock.test.ts",
  "compress.test.ts",
  "pdfToJpg.test.ts",
];

async function runCommand(file: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const filePath = path.join(process.cwd(), "server/tests", file);
    const child = spawn("npx", ["tsx", filePath], {
      env: { ...process.env, NODE_ENV: "test" },
    });

    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.stderr.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        output,
      });
    });
  });
}

async function runAll() {
  console.log("=========================================================");
  console.log("🏆 NIKPDF V2 COMPLETE PDF SUITE REGRESSION TEST RUNNER");
  console.log("=========================================================\n");

  const start = Date.now();
  let passedCount = 0;
  let failedCount = 0;
  const reports: string[] = [];

  for (const file of testFiles) {
    console.log(`⏳ Running ${file}...`);
    const result = await runCommand(file);
    if (result.success) {
      console.log(`✅ ${file} PASSED`);
      passedCount++;
      reports.push(`✅ ${file}: PASS`);
    } else {
      console.log(`❌ ${file} FAILED`);
      failedCount++;
      reports.push(`❌ ${file}: FAIL\n--- OUTPUT ---\n${result.output}\n--------------`);
    }
  }

  const durationSec = ((Date.now() - start) / 1000).toFixed(2);

  console.log("\n=========================================================");
  console.log("📊 FINAL REGRESSION REPORT");
  console.log("=========================================================");
  reports.forEach((r) => console.log(r));
  console.log("---------------------------------------------------------");
  console.log(`Total Run Time: ${durationSec}s`);
  console.log(`Suite Status: ${failedCount === 0 ? "PASS" : "FAIL"}`);
  console.log(`Stats: ${passedCount} suites passed, ${failedCount} suites failed`);
  console.log("=========================================================");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll();
