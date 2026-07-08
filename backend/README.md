# 后端服务

FastAPI + SQLite 后端，提供建筑企业资金计划预测、回款可信度评分、付款优先级评分和AI资金分析报告接口。

## 启动

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python data/seed_data.py
uvicorn main:app --reload --port 8000
```

## 接口

- `GET /api/dashboard/summary`
- `GET /api/cashflow/forecast?days=7`
- `GET /api/cashflow/forecast?days=30`
- `GET /api/cashflow/forecast?days=90`
- `GET /api/payments/priority`
- `GET /api/projects/risk`
- `GET /api/reports/ai-summary`
- `POST /api/recalculate`

## MiniMax AI 报告

默认使用 `https://api.minimaxi.com/anthropic` 调用 `MiniMax-M3` 的 Anthropic-compatible Messages 接口。也可把 `MINIMAX_BASE_URL` 设置为 `https://api.minimaxi.com/v1`，后端会自动切换到 OpenAI-compatible Chat Completions。

```powershell
$env:AI_REPORT_PROVIDER="minimax"
$env:MINIMAX_API_KEY="你的MiniMax API Key"
$env:MINIMAX_MODEL="MiniMax-M3"
$env:MINIMAX_BASE_URL="https://api.minimaxi.com/anthropic"
```
