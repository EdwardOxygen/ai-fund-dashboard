const { test } = require('node:test');
const assert = require('node:assert/strict');
const { simulate, optimizePayments, makeEvents, SCENARIOS, addDays, attributeScenario } = require('../.artifacts/engine.cjs');
const start = '2026-09-29';
const account = (id, balance, scope='general', project_id) => ({id,account_name:'账户'+id,available_balance:balance,scope,project_id});
const payment = (id, amount, extra={}) => ({id,project_id:1,amount,due_date:start,payment_type:'材料款',payee_name:'分包商'+id,is_rigid_payment:false,attachment_status:'完整',ai_score:70,...extra});
const receipt = (id,amount,extra={}) => ({id,project_id:1,amount,expected_date:start,collection_stage:'已确权',historical_delay_days:0,receipt_account_id:1,...extra});
const input = (extra={}) => ({accounts:[account(1,1000)],projects:[{id:1,project_name:'项目一',owner_type:'企业'},{id:2,project_name:'项目二',owner_type:'企业'}],collections:[],payments:[],...extra});
const sim = (data,scenario=SCENARIOS[0],days=30,safety=0)=>simulate(data,scenario,days,safety,start);
const plan = (data,days=30,safety=0)=>optimizePayments(data,SCENARIOS[0],days,safety,start);
test('日期使用日历日，跨年与闰日正常',()=>{assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.equal(addDays('2028-02-28',1),'2028-02-29');});
test('合计余额每天满足期初+收款-全部付款=期末',()=>{
 const r=sim(input({accounts:[account(1,1000),account(2,800,'project',1)],collections:[receipt(1,500)],payments:[payment(1,2500)]}));
 for(const d of r.days) assert.equal(d.opening_balance+d.expected_collection-d.planned_payment-d.rigid_payment,d.ending_balance);
 assert.equal(r.days[0].general_balance,-200);
});
test('分期、质保金金额守恒，不随评分折减',()=>{
 const d=input({collections:[receipt(1,1000,{milestone_date:start,certification_days:2,payment_days:3,retention_ratio:10,first_receipt_ratio:50,installment_gap_days:10})]});
 const e=makeEvents(d,SCENARIOS[0],start).events;assert.equal(e.reduce((s,x)=>s+x.amount,0),1000);
 assert.equal(e[0].amount,450);assert.equal(e[0].date,'2026-10-04');assert.equal(e[2].date,'9999-12-31');
});
test('回款延迟移出预测期但应收保留',()=>{
 const d=input({collections:[receipt(1,1000)]});const base=sim(d);const stress=sim(d,SCENARIOS[1]);
 assert.equal(base.summary.inflow,1000);assert.equal(stress.summary.inflow,0);assert.equal(stress.summary.beyond_horizon_inflow,1000);
});
test('逾期付款全部结转首日，资料缺失不删除义务',()=>{
 const d=input({payments:[payment(1,500,{due_date:'2026-09-01',attachment_status:'缺失'})]});
 assert.equal(sim(d).summary.outflow,500);assert.equal(plan(d).unpaid,500);
});
test('未分类资金和未绑定收款不纳入可调度余额',()=>{
 const r=sim(input({accounts:[account(1,1000,'unassigned')],collections:[receipt(1,500)]}));
 assert.equal(r.summary.general_opening,0);assert.equal(r.summary.unassigned,1000);assert.equal(r.summary.inflow,0);
});
test('工资专户不能用于材料款',()=>{
 const d=input({accounts:[account(1,1000,'payroll')],payments:[payment(1,500)]});
 assert.equal(plan(d).scheduled,0);assert.equal(plan(d).unpaid,500);
});
test('项目专户不能支付其他项目',()=>{
 const d=input({accounts:[account(1,1000,'project',2)],payments:[payment(1,500)]});assert.equal(plan(d).scheduled,0);
});
test('工资可使用工资专户，安排与未覆盖金额守恒',()=>{
 const d=input({accounts:[account(1,500,'payroll')],payments:[payment(1,800,{payment_type:'农民工工资',allow_split:true})]});
 const p=plan(d);assert.equal(p.scheduled,500);assert.equal(p.unpaid,300);assert.equal(p.rows[0].allocations[0].pool,'payroll');
});
test('多笔付款不会重复占用资金，整笔付款不自动拆分',()=>{
 const p=plan(input({payments:[payment(1,800),payment(2,800)]}));
 assert.equal(p.scheduled,800);assert.equal(p.unpaid,800);assert.ok(p.rows.every(r=>r.scheduled===0||r.scheduled===800));
});
test('允许分期但低于最低分期金额时保留未付',()=>{
 const p=plan(input({accounts:[account(1,200)],payments:[payment(1,800,{allow_split:true,minimum_installment:300})]}));
 assert.equal(p.scheduled,0);assert.equal(p.unpaid,800);
});
test('付款窗口允许等待回款，刚性付款不擅自延期',()=>{
 const d=input({accounts:[account(1,0)],collections:[receipt(1,1000,{expected_date:addDays(start,2)})],payments:[payment(1,800,{latest_payment_date:addDays(start,4)})]});
 assert.equal(plan(d).scheduled,800);assert.equal(plan(d).rows[0].allocations[0].date,addDays(start,2));
 d.payments[0].is_rigid_payment=true;assert.equal(plan(d).scheduled,0);
});
test('7日安排不计入第8日，期外义务单列',()=>{
 const d=input({payments:[payment(1,500,{due_date:addDays(start,7)})]});
 assert.equal(plan(d).scheduled_week,0);assert.equal(plan(d,7).rows[0].status,'预测期外义务');
});
test('安全线为软约束，不掩盖已到期义务',()=>{
 const p=plan(input({payments:[payment(1,800)]}),7,900);
 assert.equal(p.scheduled,800);assert.equal(p.minimum_general_balance,200);assert.equal(p.below_safety_days,7);
});
test('压力只作用于所选项目，按同截止日解释净流量',()=>{
 const d=input({collections:[receipt(1,500),receipt(2,500,{project_id:2})],payments:[payment(1,300)]});
 const s={...SCENARIOS[3],project_ids:[1]};
 const b=sim(d),r=sim(d,s);assert.equal(r.summary.inflow,500);assert.equal(r.summary.outflow,315);
 const a=attributeScenario(b,r).find(x=>x.project_id===1);assert.equal(a.receipt_shift,500);assert.equal(a.cost_change,15);
});
test('无付款也可正常输出可行空方案',()=>{const p=plan(input());assert.equal(p.scheduled,0);assert.equal(p.unpaid,0);});
test('小数金额按分保留',()=>{const p=plan(input({accounts:[account(1,100.01)],payments:[payment(1,100.01)]}));assert.equal(p.scheduled,100.01);});
