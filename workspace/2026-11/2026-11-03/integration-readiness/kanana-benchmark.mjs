import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const cases = [
  ['greeting', '안녕하세요. 한국어 한 문장으로 인사해 주세요.'],
  ['task-summary', '성능 시험용 가상 자료입니다. 오늘 업무: 보고서 검토, 테스트 결과 정리. 이 두 가지를 짧게 요약해 주세요.'],
  ['evidence', '성능 시험용 가상 자료: 회의는 오전 10시, 장소는 회의실 A입니다. 자료에 적힌 회의 시간과 장소만 답해 주세요.'],
];

function integer(value, fallback, minimum, maximum) {
  if (value === undefined || value === '') { return fallback; }
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error('Invalid benchmark limits.');
  }
  return Number(value);
}

export async function benchmarkKanana({ env = process.env, run = false, samples = 3, maxTokens = 64, fetcher = fetch } = {}) {
  const count = integer(samples, 3, 1, 6);
  const tokens = integer(maxTokens, 64, 32, 256);
  const timeoutMs = integer(env.KANANA_TIMEOUT_MS, 120_000, 1_000, 180_000);
  const plan = { dryRun: !run, syntheticDataOnly: true, sequentialRequests: count, maxOutputTokens: tokens, timeoutMs,
    contentAndCredentialsRecorded: false, firstTokenLatencyMeasured: false };
  if (!run) {
    return { ...plan, endpointConfigured: Boolean(env.KANANA_API_URL?.trim()), keyConfigured: Boolean(env.KANANA_API_KEY?.trim()) };
  }
  let url;
  try { url = new URL(env.KANANA_API_URL?.trim()); } catch { throw new Error('Configure the Kanana endpoint in the environment.'); }
  const localHttp = env.NODE_ENV === 'test' && !env.VERCEL && url.protocol === 'http:'
    && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((!localHttp && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTPS endpoint without URL credentials, query or fragment.');
  }
  const key = env.KANANA_API_KEY?.trim();
  if (!key || !/^[\x21-\x7e]+$/.test(key) || key.length > 4096) { throw new Error('Configure the Kanana API key in the environment.'); }
  const model = env.KANANA_MODEL?.trim() || 'kakaocorp/kanana-2-1.3b-instruct';
  if (model.length > 200 || /[\r\n]/.test(model)) { throw new Error('Invalid model setting.'); }
  const results = [];
  for (let index = 0; index < count; index++) {
    const [name, question] = cases[index % cases.length];
    const body = JSON.stringify({ model, stream: false, max_tokens: tokens, temperature: 0.2,
      messages: [{ role: 'system', content: '한국어로 짧게 답하세요. 내부 추론과 도구 호출 없이 제공된 가상 자료만 사용하세요.' }, { role: 'user', content: question }] });
    const started = performance.now();
    const signal = AbortSignal.timeout(timeoutMs);
    const result = { sample: index + 1, case: name, requestBytes: Buffer.byteLength(body), success: false };
    try {
      const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body, redirect: 'error', signal });
      result.httpHeaderMs = Math.round(performance.now() - started);
      result.httpStatus = response.status;
      if (!response.ok) {
        await response.body?.cancel();
        result.failure = [429, 503].includes(response.status) ? 'busy' : 'unavailable';
      } else {
        const reader = response.body?.getReader();
        if (!reader) { throw new Error('Invalid response'); }
        const chunks = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { break; }
            size += value.byteLength;
            if (size > 65_536) { await reader.cancel(); throw new Error('Oversized response'); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const choice = data?.choices?.[0];
        const message = choice?.message;
        const answer = typeof message?.content === 'string' ? message.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim() : '';
        if (message?.role !== 'assistant' || !answer || message.tool_calls?.length || message.function_call || choice.finish_reason === 'tool_calls') {
          throw new Error('Invalid response');
        }
        result.success = true;
        result.answerCharacters = answer.length;
        result.outputTruncated = choice.finish_reason === 'length';
        const used = data.usage?.completion_tokens;
        if (Number.isSafeInteger(used) && used >= 0) { result.completionTokens = used; }
      }
    } catch {
      result.failure = signal.aborted ? 'timeout' : 'invalid_or_unavailable';
    }
    result.totalMs = Math.round(performance.now() - started);
    results.push(result);
  }
  const successfulMs = results.filter(entry => entry.success).map(entry => entry.totalMs).sort((a, b) => a - b);
  const percentile = fraction => successfulMs.length ? successfulMs[Math.ceil(successfulMs.length * fraction) - 1] : null;
  return { ...plan, results, successCount: successfulMs.length, successfulMedianMs: percentile(0.5), successfulP95Ms: percentile(0.95),
    qualityReviewRequired: true, smallSampleOnly: true, productionReady: false };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node [--env-file=.env.local] kanana-benchmark.mjs [--run] [--samples=1..6] [--max-tokens=32..256]\nDefault: no network. --run sends sequential synthetic questions and reports timing without answer text.');
    return;
  }
  if (args.some(arg => arg !== '--run' && !/^--samples=\d+$/.test(arg) && !/^--max-tokens=\d+$/.test(arg))) { throw new Error('Invalid arguments; use --help.'); }
  const value = prefix => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
  const report = await benchmarkKanana({ run: args.includes('--run'), samples: value('--samples='), maxTokens: value('--max-tokens=') });
  console.log(JSON.stringify(report, null, 2));
  if (args.includes('--run') && report.successCount !== report.sequentialRequests) { process.exitCode = 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
