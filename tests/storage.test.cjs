const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api } = require('../.artifacts/api.cjs');
let memory;
beforeEach(()=>{memory = new Map(); global.window = {localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},dispatchEvent:()=>{}};});
test('示例数据与看板/预测/报告口径一致',async()=>{
 const data=await api.getSimulationData();assert.equal(data.data_mode,'demo');assert.equal(data.accounts.length,3);
 const [d,rows,report]=await Promise.all([api.getDashboardSummary(),api.getCashflowForecast(30),api.getAiReport('local')]);
 assert.equal(d.gap_30d,Math.max(0,3000000-Math.min(...rows.map(r=>r.general_balance))));
 assert.equal(d.cashflow_trend[0].ending_balance,rows[0].general_balance);
 assert.equal(report.metrics.gap_30d,d.gap_30d);
});
test('合法备份可往返导入，金额与条数不变',async()=>{
 const d=await api.getSimulationData();api.importData(JSON.stringify(d));assert.deepEqual(await api.getSimulationData(),d);
});
test('无效金额、日期、项目引用、账户用途不能覆盖当前数据',async()=>{
 const d=await api.getSimulationData(),original=memory.get('ai-fund-dashboard-local-v3');
 const mutations=[x=>delete x.accounts[0].balance,x=>x.collections[0].expected_date='2026-02-31',x=>x.payments[0].project_id=999,x=>x.accounts[0].scope='all',x=>x.collections[0].retention_ratio='50',x=>x.accounts.push({...x.accounts[0]})];
 for(const mutate of mutations){const copy=structuredClone(d);mutate(copy);assert.throws(()=>api.importData(JSON.stringify(copy)));assert.equal(memory.get('ai-fund-dashboard-local-v3'),original);}
});
test('损坏的浏览器数据不被示例数据静默覆盖',async()=>{
 memory.set('ai-fund-dashboard-local-v3','{broken');
 await assert.rejects(api.getSimulationData());assert.equal(memory.get('ai-fund-dashboard-local-v3'),'{broken');
});
test('真实填报后标记本机业务数据并保留原账户',async()=>{
 const d=await api.getSimulationData();await api.createBankAccount({account_name:'测试账户',bank_name:'测试银行',balance:1000,available_balance:1000,frozen_amount:0,scope:'general'});
 const next=await api.getSimulationData();assert.equal(next.data_mode,'manual');assert.equal(next.accounts.length,d.accounts.length+1);
});
test('公开报告接口不开放外部调用，状态无密钥',()=>{
 const status=require('../api/ai/status.js'),report=require('../api/ai/report.js');
 const res={setHeader(){},status(s){this.code=s;return this;},json(x){this.body=x;return this;}};
 status({method:'GET'},res);assert.equal(res.code,200);assert.equal(res.body.minimax_configured,false);
 report({method:'POST',body:{}},res);assert.equal(res.code,503);
});

test('隐藏外部AI时不产生网络请求，external请求仍返回本地报告',async()=>{
 let calls=0;const original=global.fetch;global.fetch=async()=>{calls++;throw Error('不应请求网络');};
 try {const report=await api.getAiReport('external');const status=await api.getAiProviderStatus();assert.equal(report.report_source,'local');assert.equal(status.provider,'local');assert.equal(calls,0);} finally {global.fetch=original;}
});
