export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export type RiskLevel = "绿色" | "黄色" | "红色" | "重大风险";

export interface CashflowForecast {
  id: number;
  forecast_date: string;
  opening_balance: number;
  expected_collection: number;
  planned_payment: number;
  rigid_payment: number;
  ending_balance: number;
  risk_level: RiskLevel;
}

export interface BankAccount {
  id: number;
  account_name: string;
  bank_name: string;
  balance: number;
  available_balance: number;
  frozen_amount: number;
  updated_at: string;
}

export interface Project {
  id: number;
  project_name: string;
  owner_type: string;
  contract_amount: number;
  confirmed_output: number;
  billed_amount: number;
  collected_amount: number;
  risk_level: RiskLevel;
}

export interface ProjectMaster extends Project {
  collection_rate: number;
  expected_collection_count: number;
  payment_request_count: number;
  unpaid_payment_amount: number;
}

export interface PaymentPriority {
  id: number;
  project_name: string;
  payee_name: string;
  payment_type: string;
  amount: number;
  due_date: string;
  paid_ratio: number;
  ai_score: number;
  suggestion: string;
  risk_reason: string;
  risk_reasons: string[];
}

export interface ExpectedCollection {
  id: number;
  project_id: number;
  expected_date: string;
  amount: number;
  collection_stage: string;
  invoice_status: string;
  aging_days: number;
  historical_delay_days: number;
  ai_probability: number;
  risk_level: RiskLevel;
}

export interface PaymentRequest {
  id: number;
  project_id: number;
  payee_name: string;
  payment_type: string;
  amount: number;
  due_date: string;
  contract_amount: number;
  settled_amount: number;
  paid_amount: number;
  is_rigid_payment: boolean;
  is_labor_payment: boolean;
  attachment_status: string;
  ai_score: number;
  suggestion: string;
}

export interface ProjectRisk {
  id: number;
  project_name: string;
  owner_type: string;
  contract_amount: number;
  confirmed_output: number;
  billed_amount: number;
  collected_amount: number;
  collection_rate: number;
  risk_level: RiskLevel;
  collection_risk: string;
  payment_risk: string;
  ai_hint: string;
}

export interface DashboardSummary {
  current_available_funds: number;
  gap_7d: number;
  gap_30d: number;
  gap_90d: number;
  high_risk_project_count: number;
  pending_payment_amount: number;
  suggested_week_payment_amount: number;
  fund_risk_level: RiskLevel;
  safety_line: number;
  cashflow_trend: Array<{
    date: string;
    ending_balance: number;
    risk_level: RiskLevel;
  }>;
  top_payments: PaymentPriority[];
  high_risk_projects: ProjectRisk[];
  ai_summary: string;
}

export interface AiReport {
  generated_at: string;
  report: string;
  report_source: "local" | "external";
  provider: string;
  model: string;
  fallback_reason: string | null;
  metrics: {
    current_available_funds: number;
    gap_7d: number;
    gap_30d: number;
    high_risk_project_count: number;
  };
}

export interface AiProviderStatus {
  provider: string;
  minimax_configured: boolean;
  minimax_base_url: string;
  minimax_model: string;
  minimax_protocol: "anthropic" | "openai";
  runtime_configured: boolean;
}

export interface AiProviderConfigPayload {
  provider: "minimax";
  api_key?: string;
  base_url: string;
  model: string;
  timeout_seconds: number;
}

export interface BankAccountPayload {
  account_name: string;
  bank_name: string;
  balance: number;
  available_balance: number;
  frozen_amount: number;
}

export interface ProjectPayload {
  project_name: string;
  owner_type: string;
  contract_amount: number;
  confirmed_output: number;
  billed_amount: number;
  collected_amount: number;
}

export interface ExpectedCollectionPayload {
  project_id: number;
  expected_date: string;
  amount: number;
  collection_stage: string;
  invoice_status: string;
  aging_days: number;
  historical_delay_days: number;
}

export interface PaymentRequestPayload {
  project_id: number;
  payee_name: string;
  payment_type: string;
  amount: number;
  due_date: string;
  contract_amount: number;
  settled_amount: number;
  paid_amount: number;
  is_rigid_payment: boolean;
  is_labor_payment: boolean;
  attachment_status: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {})
    },
    ...options
  });
  if (!response.ok) {
    throw new Error(`接口请求失败：${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getDashboardSummary: () => request<DashboardSummary>("/api/dashboard/summary"),
  getCashflowForecast: (days: number) => request<CashflowForecast[]>(`/api/cashflow/forecast?days=${days}`),
  getPaymentsPriority: () => request<PaymentPriority[]>("/api/payments/priority"),
  getProjectsRisk: () => request<ProjectRisk[]>("/api/projects/risk"),
  getAiReport: (mode: "local" | "external" | "auto" = "local") => request<AiReport>(`/api/reports/ai-summary?mode=${mode}`),
  getAiProviderStatus: () => request<AiProviderStatus>("/api/ai/provider-status"),
  updateAiProviderConfig: (payload: AiProviderConfigPayload) =>
    request<AiProviderStatus>("/api/ai/provider-config", { method: "PUT", body: JSON.stringify(payload) }),
  getProjectMasters: () => request<ProjectMaster[]>("/api/master-data/projects"),
  createProjectMaster: (payload: ProjectPayload) =>
    request<ProjectMaster>("/api/master-data/projects", { method: "POST", body: JSON.stringify(payload) }),
  updateProjectMaster: (id: number, payload: ProjectPayload) =>
    request<ProjectMaster>(`/api/master-data/projects/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteProjectMaster: (id: number) =>
    request<{ success: boolean; message: string }>(`/api/master-data/projects/${id}`, { method: "DELETE" }),
  getDataEntryAccounts: () => request<BankAccount[]>("/api/data-entry/accounts"),
  getDataEntryProjects: () => request<Project[]>("/api/data-entry/projects"),
  createBankAccount: (payload: BankAccountPayload) =>
    request<BankAccount>("/api/data-entry/accounts", { method: "POST", body: JSON.stringify(payload) }),
  updateBankAccount: (id: number, payload: BankAccountPayload) =>
    request<BankAccount>(`/api/data-entry/accounts/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  createProject: (payload: ProjectPayload) =>
    request<Project>("/api/data-entry/projects", { method: "POST", body: JSON.stringify(payload) }),
  createExpectedCollection: (payload: ExpectedCollectionPayload) =>
    request<ExpectedCollection>("/api/data-entry/collections", { method: "POST", body: JSON.stringify(payload) }),
  createPaymentRequest: (payload: PaymentRequestPayload) =>
    request<PaymentRequest>("/api/data-entry/payments", { method: "POST", body: JSON.stringify(payload) }),
  recalculate: () => request<{ success: boolean; message: string; forecast_days: number }>("/api/recalculate", { method: "POST" })
};

export function formatWan(value: number): string {
  return `${(value / 10000).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} 万`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
