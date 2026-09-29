"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ApartmentOutlined,
  DashboardOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FormOutlined,
  FundProjectionScreenOutlined,
  OrderedListOutlined,
  ReadOutlined,
  ReloadOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import {
  Button,
  ConfigProvider,
  Dropdown,
  Layout,
  Menu,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import type { MenuProps } from "antd";
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api } from "./api";

const DataEntry = lazy(() => import("./pages/DataEntry"));
const ForecastWorkspace = lazy(() => import("./pages/ForecastWorkspace"));
const Allocation = lazy(() => import("./pages/Allocation"));
const ProjectMasterData = lazy(() => import("./pages/ProjectMasterData"));
const TechnicalPrinciples = lazy(() => import("./pages/TechnicalPrinciples"));
const ProjectWorkbench = lazy(() => import("./pages/ProjectWorkbench"));

const { Header, Content } = Layout;

const items: MenuProps["items"] = [
  { key: "/", icon: <ApartmentOutlined />, label: "项目与合同" },
  { key: "/company", icon: <DashboardOutlined />, label: "公司收支预测" },
  { key: "/allocation", icon: <OrderedListOutlined />, label: "公司付款统筹" },
  {
    key: "/simulation",
    icon: <FundProjectionScreenOutlined />,
    label: "情景对比",
  },
  {
    key: "settings",
    icon: <SettingOutlined />,
    label: "账户与导入",
    children: [
      { key: "/entry", icon: <FormOutlined />, label: "账户与数据导入" },
      {
        key: "/master-data/projects",
        icon: <ApartmentOutlined />,
        label: "项目基本信息",
      },
      { key: "/principles", icon: <ReadOutlined />, label: "计算规则与说明" },
    ],
  },
];

function AppShell() {
  const [recalculating, setRecalculating] = useState(false);
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
      if (
        !window.confirm(
          "导入将替换本浏览器业务数据。请先导出当前备份，是否继续？",
        )
      )
        return;
      api.importData(content);
      messageApi.success("备份已导入，计算结果已刷新");
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "导入失败");
    }
  }

  const activeLabel = useMemo(() => {
    const labels: Record<string, string> = {
      "/": "项目与合同",
      "/company": "公司收支预测",
      "/allocation": "公司付款统筹",
      "/cashflow": "现金流预测",
      "/simulation": "情景对比",
      "/payments": "付款优先级",
      "/projects": "项目工作台",
      "/project-risk": "项目风险明细",
      "/master-data/projects": "项目主数据",
      "/entry": "业务数据",
      "/report": "资金分析报告",
      "/principles": "模型与规则",
    };
    return labels[location.pathname] || "项目收支预测";
  }, [location.pathname]);

  function goTo(key: string) {
    if (
      document.body.dataset.projectDraft === "dirty" &&
      !window.confirm("项目计划尚未保存，是否放弃修改并离开？")
    )
      return;
    navigate(key);
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
    if (
      window.confirm("确定清空当前浏览器中的全部业务数据吗？建议先导出备份。")
    ) {
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
      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="导入数据备份"
        onChange={(e) => {
          void handleImport(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Layout>
        <Header className="app-header">
          <div className="header-left">
            <div className="brand-mark">
              <ApartmentOutlined />
            </div>
            <div>
              <Typography.Text className="header-title">
                资金驾驶舱
              </Typography.Text>
              <div className="header-kicker">
                PROJECT CASHFLOW / {activeLabel}
              </div>
            </div>
          </div>
          <Space size={12} className="header-actions">
            <Tag className="sync-tag">本机数据 · 请定期备份</Tag>
            <Dropdown
              menu={{
                items: [
                  {
                    key: "export",
                    label: "导出数据备份",
                    icon: <DownloadOutlined />,
                    onClick: handleExportData,
                  },
                  {
                    key: "import",
                    label: "导入数据备份",
                    onClick: () => importInput.current?.click(),
                  },
                  {
                    key: "rules",
                    label: "导出计算规则",
                    icon: <ReadOutlined />,
                    onClick: handleExportRules,
                  },
                  { type: "divider" },
                  {
                    key: "clear",
                    label: "清空本机数据",
                    danger: true,
                    icon: <DeleteOutlined />,
                    onClick: handleClearData,
                  },
                ],
              }}
            >
              <Button aria-label="数据管理菜单">数据管理</Button>
            </Dropdown>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={recalculating}
              onClick={handleRecalculate}
            >
              重新计算
            </Button>
            {lastSyncedAt ? <span className="sync-time">刚刚更新</span> : null}
          </Space>
        </Header>
        <nav className="top-navigation" aria-label="主导航">
          <Menu
            mode="horizontal"
            selectedKeys={[
              location.pathname.startsWith("/project/")
                ? "/"
                : location.pathname,
            ]}
            items={items}
            onClick={({ key }) => goTo(String(key))}
          />
        </nav>
        <Content className="app-content">
          <div className="content-frame">
            <Suspense
              fallback={
                <div className="route-loading">
                  <span className="loading-pulse" />
                  正在加载模块…
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<ProjectWorkbench />} />
                <Route
                  path="/company"
                  element={<ForecastWorkspace key="company" />}
                />
                <Route
                  path="/project/:projectId/forecast"
                  element={<ForecastWorkspace key="project" mode="project" />}
                />
                <Route path="/allocation" element={<Allocation />} />
                <Route
                  path="/cashflow"
                  element={<Navigate to="/company" replace />}
                />
                <Route
                  path="/simulation"
                  element={<ForecastWorkspace key="scenario" mode="scenario" />}
                />
                <Route
                  path="/payments"
                  element={<Navigate to="/allocation" replace />}
                />
                <Route path="/projects" element={<Navigate to="/" replace />} />
                <Route
                  path="/project-risk"
                  element={<Navigate to="/company" replace />}
                />
                <Route
                  path="/master-data/projects"
                  element={<ProjectMasterData />}
                />
                <Route path="/entry" element={<DataEntry />} />
                <Route
                  path="/report"
                  element={<Navigate to="/company" replace />}
                />
                <Route path="/principles" element={<TechnicalPrinciples />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
        </Content>
      </Layout>
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
          borderRadius: 16,
          fontSize: 14,
          fontFamily:
            "'Inter Variable', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif",
        },
        components: {
          Card: { paddingLG: 22 },
          Button: { controlHeight: 40 },
          Table: { headerBg: "#f7f9fc" },
        },
      }}
    >
      <HashRouter>
        <AppShell />
      </HashRouter>
    </ConfigProvider>
  );
}
