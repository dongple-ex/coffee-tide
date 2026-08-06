const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env.local");
let key = process.env.GEMINI_API_KEY;

if (!key && fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/GEMINI_API_KEY=(.*)/);
  if (match) key = match[1].trim();
}

async function test() {
  const MODEL = "gemini-flash-latest";
  const systemInstruction = "당신은 AI 바리스타입니다.";
  const userText = "안녕";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
      }),
    }
  );
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response Text:", text);
}

test();
