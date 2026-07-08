# AI资金驾驶舱：建筑企业资金计划预测与付款优先级决策系统

本项目是一个本地化 Web 原型系统，面向建筑企业财务资金管理场景，展示项目资金预测、回款可信度评分、分包付款优先级排序、资金缺口预警和 AI 风险分析报告能力。

## 技术栈

- 前端：React + Vite + TypeScript + Ant Design + ECharts
- 后端：Python + FastAPI
- 数据库：SQLite
- 数据处理：Pandas / NumPy
- 评分逻辑：规则模型 + 简单评分模型，后续可扩展机器学习模型或大语言模型接口

## 后端启动

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python data/seed_data.py
uvicorn main:app --reload --port 8000
```

接口地址：`http://127.0.0.1:8000`

## 前端启动

```powershell
cd frontend
npm install
npm run dev
```

页面地址：`http://localhost:5173`

## 数据初始化

执行后端目录下的种子脚本：

```powershell
cd backend
python data/seed_data.py
```

脚本会重置并生成模拟数据：

- 3 个银行账户；
- 8 个建筑项目；
- 15 条预计回款；
- 20 条待付款申请；
- 未来 90 天现金流预测，其中前 30 天用于首页和现金流重点展示。

## 页面功能

- 首页 Dashboard：展示当前可用资金、7/30/90 日资金缺口、高风险项目、待审批付款金额、AI建议本周付款金额、资金风险等级、30 天余额趋势、付款优先级前 10 条和 AI 摘要。
- 现金流预测：支持查看未来 7 天、30 天、90 天现金流预测表和趋势图。
- 付款优先级：按 AI 评分展示分包付款、农民工工资、材料款、税款、机械租赁等付款申请。
- 项目风险：展示各项目合同额、确权产值、开票金额、已回款金额、回款率、回款风险、付款风险和 AI 提示。
- 项目主数据：维护项目名称、业主类型、合同额、确权产值、开票金额、已回款金额，支持新增、编辑和受保护删除。
- 数据填报：支持新增或更新资金账户，新增项目、预计回款和付款申请，提交后自动重算评分和未来现金流。
- AI报告：默认使用本地规则生成报告，也可配置 MiniMax 等外部 API 生成正式汇报文本。
- 技术原理：单独说明系统数据链路、评分模型、现金流预测和外部 AI 接入方式。

## 核心接口

- `GET /api/dashboard/summary`
- `GET /api/cashflow/forecast?days=7`
- `GET /api/cashflow/forecast?days=30`
- `GET /api/cashflow/forecast?days=90`
- `GET /api/payments/priority`
- `GET /api/projects/risk`
- `GET /api/reports/ai-summary?mode=local`
- `GET /api/reports/ai-summary?mode=external`
- `GET /api/ai/provider-status`
- `PUT /api/ai/provider-config`
- `GET /api/master-data/projects`
- `POST /api/master-data/projects`
- `PUT /api/master-data/projects/{project_id}`
- `DELETE /api/master-data/projects/{project_id}`
- `GET /api/data-entry/accounts`
- `POST /api/data-entry/accounts`
- `PUT /api/data-entry/accounts/{account_id}`
- `GET /api/data-entry/projects`
- `POST /api/data-entry/projects`
- `POST /api/data-entry/collections`
- `POST /api/data-entry/payments`
- `POST /api/recalculate`

## 外部 AI 报告配置

MiniMax 文本模型默认按 Anthropic-compatible Messages 方式接入，Base URL 为 `https://api.minimaxi.com/anthropic`，模型默认为 `MiniMax-M3`。如果需要复用 OpenAI-compatible Chat Completions，也可以把 Base URL 改为 `https://api.minimaxi.com/v1`，后端会自动识别协议。

可在“AI报告”页面的“MiniMax API配置”区域输入 API Key、模型、Base URL 和超时时间。页面保存的是后端运行时配置，不会把 API Key 回显到前端，也不会写入仓库文件；后端服务重启后如需继续使用，需要重新输入。

也可以通过环境变量预置：

```powershell
$env:AI_REPORT_PROVIDER="minimax"
$env:MINIMAX_API_KEY="你的MiniMax API Key"
$env:MINIMAX_MODEL="MiniMax-M3"
$env:MINIMAX_BASE_URL="https://api.minimaxi.com/anthropic"
```

如未配置或调用失败，系统会自动回退到本地规则报告，并在页面展示失败原因。

## 业务规则概览

- 回款可信度：基于确权状态、合同付款节点、开票状态、业主类型、账龄、历史延期天数计算 `ai_probability`。
- 付款优先级：工资、农民工工资、税款优先；劳务、材料、机械、专业分包按现场履约影响加分；逾期加分；付款比例过高、附件缺失、付款后低于安全线扣分。
- 付款建议：输出立即支付、优先支付、部分支付、暂缓支付、退回补充资料或不建议支付。
- 风险预警：资金余额高于安全线为绿色，接近安全线为黄色，低于安全线为红色，刚性支出无法覆盖时为重大风险。

## 后续可扩展方向

- 接入 ERP、资金系统、项目管理系统和电子发票数据；
- 引入真实银行流水和业主付款历史，训练回款预测模型；
- 引入付款审批工作流和多级权限；
- 接入大语言模型生成资金调度建议、催收策略和付款审批意见；
- 增加融资测算、票据池、保函保证金和项目现金流穿透分析；
- 支持 Docker Compose、权限登录和生产环境配置。
