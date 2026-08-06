const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env.local");
let key = process.env.GEMINI_API_KEY;

if (!key && fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/GEMINI_API_KEY=(.*)/);
  if (match) key = match[1].trim();
}

console.log("API KEY Exists:", Boolean(key));

async function test() {
  const model = "gemini-flash-latest";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "안녕" }] }]
    })
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response:", text);
}

test();
