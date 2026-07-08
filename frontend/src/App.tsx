import { useState } from "react";
import {
  ApartmentOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FormOutlined,
  LineChartOutlined,
  OrderedListOutlined,
  ReadOutlined,
  ReloadOutlined,
  WarningOutlined
} from "@ant-design/icons";
import { Button, Layout, Menu, Space, Typography, message } from "antd";
import type { MenuProps } from "antd";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import AiReport from "./pages/AiReport";
import CashflowForecast from "./pages/CashflowForecast";
import DataEntry from "./pages/DataEntry";
import Dashboard from "./pages/Dashboard";
import PaymentPriority from "./pages/PaymentPriority";
import ProjectMasterData from "./pages/ProjectMasterData";
import ProjectRisk from "./pages/ProjectRisk";
import TechnicalPrinciples from "./pages/TechnicalPrinciples";

const { Header, Sider, Content } = Layout;

const items: MenuProps["items"] = [
  { key: "/", icon: <DashboardOutlined />, label: "首页驾驶舱" },
  { key: "/cashflow", icon: <LineChartOutlined />, label: "现金流预测" },
  { key: "/payments", icon: <OrderedListOutlined />, label: "付款优先级" },
  { key: "/projects", icon: <WarningOutlined />, label: "项目风险" },
  { key: "/master-data/projects", icon: <ApartmentOutlined />, label: "项目主数据" },
  { key: "/entry", icon: <FormOutlined />, label: "数据填报" },
  { key: "/report", icon: <FileTextOutlined />, label: "AI报告" },
  { key: "/principles", icon: <ReadOutlined />, label: "技术原理" }
];

function AppShell() {
  const [recalculating, setRecalculating] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const location = useLocation();
  const navigate = useNavigate();

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      const result = await api.recalculate();
      messageApi.success(result.message);
      window.dispatchEvent(new Event("fund-dashboard-refresh"));
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "重算失败");
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <Layout className="app-shell">
      {contextHolder}
      <Sider width={240} className="app-sider">
        <div className="brand">
          <div className="brand-title">AI资金驾驶舱</div>
          <div className="brand-subtitle">建筑企业资金计划预测</div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div>
            <Typography.Text className="header-title">建筑企业项目资金预测与付款优先级决策系统</Typography.Text>
            <div className="header-subtitle">回款预测 · 分包付款 · 农民工工资 · 税款 · 资金缺口 · 风险预警</div>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} loading={recalculating} onClick={handleRecalculate}>
              重新计算
            </Button>
          </Space>
        </Header>
        <Content className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/cashflow" element={<CashflowForecast />} />
            <Route path="/payments" element={<PaymentPriority />} />
            <Route path="/projects" element={<ProjectRisk />} />
            <Route path="/master-data/projects" element={<ProjectMasterData />} />
            <Route path="/entry" element={<DataEntry />} />
            <Route path="/report" element={<AiReport />} />
            <Route path="/principles" element={<TechnicalPrinciples />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
