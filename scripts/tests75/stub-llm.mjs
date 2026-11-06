/* v91.17.75 · a tiny OpenAI-compatible model for reliability tests (no model, no GPU): GET /v1/models, POST /v1/chat/completions.
     node scripts/tests75/stub-llm.mjs [port=8813] [delayMs=800]
   The answer carries no digits (the slot firewall keeps it) and ends with a "Based on:" line. */
import http from 'node:http';
const PORT = Number(process.argv[2] || 8813), DELAY = Number(process.argv[3] || 800);
let calls = 0;
http.createServer((req, res) => {
  const send = (code, o) => { const b = Buffer.from(JSON.stringify(o)); res.writeHead(code, { 'content-type': 'application/json', 'content-length': b.length }); res.end(b); };
  if (req.method === 'GET' && /\/models$/.test(req.url)) return send(200, { object: 'list', data: [{ id: 'stub:1b', object: 'model' }, { id: 'stub-b:1b', object: 'model' }] });
  if (req.method === 'POST' && /\/chat\/completions$/.test(req.url)) {
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => { calls++; let model = 'stub:1b'; try { model = JSON.parse(body).model || model; } catch {}
      setTimeout(() => send(200, { id: 'stub-' + calls, object: 'chat.completion', model, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'The dashboard facts describe the conditions for this place and what to watch; the platform suggests checking drains and preparing for heat.\nBased on: dashboard, forecast' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), DELAY); });
    return;
  }
  send(404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log('stub-llm on ' + PORT + ' delay ' + DELAY + ' ms'));
