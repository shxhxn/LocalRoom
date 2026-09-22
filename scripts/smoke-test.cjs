const assert = require('node:assert/strict');
const { detectRuntime, streamChat } = require('../dist-electron/runtimes.js');

async function main() {
  const runtime = {
    id: 'ollama-smoke',
    name: 'Ollama',
    type: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    enabled: true,
  };
  const models = await detectRuntime(runtime);
  assert.ok(models.length > 0, 'Ollama is running but no models were detected');
  assert.ok(models.every((model) => Array.isArray(model.capabilities)), 'Model capabilities were not detected');
  assert.ok(models.some((model) => Number.isFinite(model.contextLength) && model.contextLength > 0), 'No model context length was detected');

  const model = models.find((item) => !item.capabilities.includes('vision')) ?? models[0];
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), 500);
  try {
    await streamChat({
      runtime,
      model: model.id,
      messages: [{ role: 'user', content: 'Write a very long explanation of local inference so this request can be cancelled.' }],
      temperature: 0.2,
      signal: controller.signal,
      onChunk: () => undefined,
    });
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    clearTimeout(timer);
  }
  assert.equal(controller.signal.aborted, true, 'The cancellation signal did not fire');
  assert.ok(Date.now() - startedAt < 5000, 'The cancelled request did not settle promptly');
  process.stdout.write(`Smoke test passed: ${models.length} models detected, context metadata available, cancellation settled in ${Date.now() - startedAt}ms.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
