"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ApartmentOutlined,
  DashboardOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileTextOutlined,
  FormOutlined,
  FundProjectionScreenOutlined,
  LineChartOutlined,
  MenuOutlined,
  OrderedListOutlined,
  ReadOutlined,
  ReloadOutlined,
  WarningOutlined,
  SettingOutlined
} from "@ant-design/icons";
import { Button, ConfigProvider, Drawer, Dropdown, Layout, Menu, Space, Tag, Typography, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import type { MenuProps } from "antd";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";

const AiReport = lazy(() => import("./pages/AiReport"));
const CashflowForecast = lazy(() => import("./pages/CashflowForecast"));
const DataEntry = lazy(() => import("./pages/DataEntry"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const PaymentPriority = lazy(() => import("./pages/PaymentPriority"));
const ProjectMasterData = lazy(() => import("./pages/ProjectMasterData"));
const ProjectRisk = lazy(() => import("./pages/ProjectRisk"));
const TechnicalPrinciples = lazy(() => import("./pages/TechnicalPrinciples"));
const Simulation = lazy(() => import("./pages/Simulation"));

const { Header, Sider, Content } = Layout;

const items: MenuProps["items"] = [
  { key: "overview", type: "group", label: "经营总览", children: [
    { key: "/", icon: <DashboardOutlined />, label: "首页驾驶舱" },
    { key: "/cashflow", icon: <LineChartOutlined />, label: "现金流预测" },
    { key: "/simulation", icon: <FundProjectionScreenOutlined />, label: "收支模拟与安排" },
    { key: "/payments", icon: <OrderedListOutlined />, label: "付款优先级" },
    { key: "/projects", icon: <WarningOutlined />, label: "项目风险" }
  ]},
  { key: "workspace", type: "group", label: "业务工作台", children: [
    { key: "/master-data/projects", icon: <ApartmentOutlined />, label: "项目主数据" },
    { key: "/entry", icon: <FormOutlined />, label: "数据填报" },
    { key: "/report", icon: <FileTextOutlined />, label: "资金分析报告" }
  ]},
  { key: "help", type: "group", label: "系统说明", children: [
    { key: "/principles", icon: <ReadOutlined />, label: "技术原理" }
  ]}
];

function AppShell() {
  const [recalculating, setRecalculating] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const location = useLocation();
  const navigate = useNavigate();
  const importInput = useRef<HTMLInputElement>(null);

  async function handleImport(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("备份文件不能超过5MB");
      const content = await file.text();
      if (!window.confirm("导入将替换本浏览器业务数据。请先导出当前备份，是否继续？")) return;
      api.importData(content);
      messageApi.success("备份已导入，计算结果已刷新");
    } catch (e) { messageApi.error(e instanceof Error ? e.message : "导入失败"); }
  }

  const activeLabel = useMemo(() => {
    const labels: Record<string, string> = { "/": "资金总览", "/cashflow": "现金流预测", "/simulation": "收支模拟与安排", "/payments": "付款优先级", "/projects": "项目风险", "/master-data/projects": "项目主数据", "/entry": "业务数据", "/report": "资金分析报告", "/principles": "模型与规则" };
    return labels[location.pathname] || "资金总览";
  }, [location.pathname]);

  function goTo(key: string) {
    navigate(key);
    setMobileMenuOpen(false);
  }

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      const result = await api.recalculate();
      messageApi.success(result.message);
      setLastSyncedAt(new Date());
      window.dispatchEvent(new Event("fund-dashboard-refresh"));
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "重算失败");
    } finally {
      setRecalculating(false);
    }
  }

  function handleClearData() {
    if (window.confirm("确定清空当前浏览器中的全部业务数据吗？建议先导出备份。")) {
      api.clearAllData();
      messageApi.success("数据已清空，请从数据填报开始录入真实数据");
    }
  }

  function handleExportData() {
    api.exportData();
    messageApi.success("数据备份文件已生成");
  }

  function handleExportRules() {
    api.exportPredictionRules();
    messageApi.success("预测数学规则文件已生成");
  }

  return (
    <Layout className="app-shell">
      {contextHolder}
      <input ref={importInput} type="file" accept=".json,application/json" hidden aria-label="导入数据备份" onChange={e => { void handleImport(e.target.files?.[0]); e.target.value = ""; }} />
      <Sider breakpoint="lg" collapsedWidth={0} width={232} className="app-sider">
        <div className="brand">
          <div className="brand-mark">AI</div>
          <div>
            <div className="brand-title">资金驾驶舱</div>
            <div className="brand-subtitle">建筑企业资金运营中枢</div>
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => goTo(String(key))}
        />
        <div className="sider-footer">
          <div className="sider-footer-icon"><SettingOutlined /></div>
          <div>
            <div className="sider-footer-title">规则引擎已启用</div>
            <div className="sider-footer-copy">现金流与付款评分实时联动</div>
          </div>
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="header-left">
            <Button className="mobile-menu-button" type="text" icon={<MenuOutlined />} onClick={() => setMobileMenuOpen(true)} aria-label="打开导航" />
            <div>
              <div className="header-kicker">资金运营中枢 / {activeLabel}</div>
              <Typography.Text className="header-title">项目资金预测与付款决策</Typography.Text>
            </div>
          </div>
          <Space size={12} className="header-actions">
            <Tag className="sync-tag">本机数据 · 请定期备份</Tag>
            <Dropdown menu={{ items: [
              { key: "export", label: "导出数据备份", icon: <DownloadOutlined />, onClick: handleExportData },
              { key: "import", label: "导入数据备份", onClick: () => importInput.current?.click() },
              { key: "rules", label: "导出计算规则", icon: <ReadOutlined />, onClick: handleExportRules },
              { type: "divider" },
              { key: "clear", label: "清空本机数据", danger: true, icon: <DeleteOutlined />, onClick: handleClearData }
            ] }}><Button aria-label="数据管理菜单">数据管理</Button></Dropdown>
            <Button type="primary" icon={<ReloadOutlined />} loading={recalculating} onClick={handleRecalculate}>
              重新计算
            </Button>
            {lastSyncedAt ? <span className="sync-time">刚刚更新</span> : null}
          </Space>
        </Header>
        <Content className="app-content">
          <div className="content-frame">
            <Suspense fallback={<div className="route-loading"><span className="loading-pulse" />正在加载模块…</div>}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/cashflow" element={<CashflowForecast />} />
                <Route path="/simulation" element={<Simulation />} />
                <Route path="/payments" element={<PaymentPriority />} />
                <Route path="/projects" element={<ProjectRisk />} />
                <Route path="/master-data/projects" element={<ProjectMasterData />} />
                <Route path="/entry" element={<DataEntry />} />
                <Route path="/report" element={<AiReport />} />
                <Route path="/principles" element={<TechnicalPrinciples />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
        </Content>
      </Layout>
      <Drawer title="资金驾驶舱" placement="left" open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} className="mobile-nav-drawer">
        <Menu mode="inline" selectedKeys={[location.pathname]} items={items} onClick={({ key }) => goTo(String(key))} />
      </Drawer>
    </Layout>
  );
}

export default function App() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mountTimer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(mountTimer);
  }, []);

  if (!mounted) {
    return <div className="app-loading">正在加载 AI资金驾驶舱…</div>;
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#236ba7",
          colorSuccess: "#1f9d73",
          colorWarning: "#d97706",
          colorError: "#d65353",
          borderRadius: 12,
          fontSize: 14,
          fontFamily: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"
        },
        components: {
          Card: { paddingLG: 22 },
          Button: { controlHeight: 40 },
          Table: { headerBg: "#f7f9fc" }
        }
      }}
    >
      <HashRouter>
        <AppShell />
      </HashRouter>
    </ConfigProvider>
  );
}
