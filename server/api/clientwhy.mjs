/* v91.17.283 · INTEG (permanent check F4) · a reason a client reads is said in plain words, never as the raw exception text of a failed
   provider call ("Provider transport failure: fetch failed", "The operation was aborted due to timeout", ECONN..., stack fragments).
   clientWhy(x): x is an Error or a reason string; a reason that is already plain words is returned unchanged. */
const RAW = [
  [/quota|PROVIDER_QUOTA_EXHAUSTED|call_budget|429/i, 'the forecast provider’s daily allowance is used up; it is read again when the allowance resets'],
  [/time ?out|timed out|aborted|AbortError/i, 'the forecast provider did not answer in time; it is read again shortly'],
  [/Provider transport failure|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket|network|PROVIDER_UNAVAILABLE|\b5\d\d\b|unreachable/i, 'the forecast provider could not be reached; it is read again shortly'],
  [/Error\b|TypeError|SyntaxError|Unexpected token|JSON|\bat [\w.]+ \(/, 'the value could not be read; it is read again shortly'],
];
export function clientWhy(x) {
  const s = x == null ? '' : String((x && x.message) || x);
  if (!s) return 'not available';
  for (const [re, plain] of RAW) if (re.test(s)) return plain;
  return s;
}
