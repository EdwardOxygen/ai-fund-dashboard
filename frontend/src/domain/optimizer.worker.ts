import { optimizePayments } from './optimizer';
self.onmessage = (event) => {
  const { data, scenario, horizon, safety, start } = event.data;
  try { self.postMessage({ result: optimizePayments(data, scenario, horizon, safety, start) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : '方案求解失败' }); }
};
