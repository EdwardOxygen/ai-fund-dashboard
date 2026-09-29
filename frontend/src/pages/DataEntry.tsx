import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Table,
  message,
} from "antd";
import { useNavigate } from "react-router-dom";
import {
  api,
  formatWan,
  type BankAccountPayload,
  type LocalStore,
} from "../api";
import DataTemplatePanel from "../components/DataTemplatePanel";
import PageHeader from "../components/PageHeader";

type Values = BankAccountPayload & { account_id: number | "new" };
const initial = { account_id: "new", scope: "unassigned", frozen_amount: 0 };
export default function DataEntry() {
  const [data, setData] = useState<LocalStore | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<Values>();
  const [msg, context] = message.useMessage();
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .getPlanningData()
        .then((d) => {
          if (active) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void load();
    window.addEventListener("fund-dashboard-refresh", load);
    return () => {
      active = false;
      window.removeEventListener("fund-dashboard-refresh", load);
    };
  }, []);
  function select(id: number | "new") {
    form.resetFields();
    if (id === "new") form.setFieldsValue(initial as Values);
    else {
      const account = data?.accounts.find((a) => a.id === id);
      if (account) form.setFieldsValue({ ...account, account_id: id });
    }
  }
  async function save(v: Values) {
    setBusy(true);
    try {
      const { account_id, ...payload } = v;
      if (account_id === "new") await api.createBankAccount(payload);
      else await api.updateBankAccount(account_id, payload);
      msg.success("账户已保存，公司测算已更新");
    } catch (e) {
      msg.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {context}
      <PageHeader
        title="账户与导入"
        description="公司期初取这里的可用账户余额；项目合同、产值、预付款与分包计划统一在项目内维护。金额录入单位：元。"
        actions={<Button onClick={() => navigate("/")}>维护项目与合同</Button>}
      />
      {error && <Alert type="error" message={error} />}
      <DataTemplatePanel />
      <Card className="page-section" title="公司资金账户">
        <Table
          rowKey="id"
          dataSource={data?.accounts}
          pagination={false}
          scroll={{ x: 650 }}
          columns={[
            { title: "账户", dataIndex: "account_name" },
            {
              title: "可用余额",
              dataIndex: "available_balance",
              render: formatWan,
            },
            {
              title: "用途",
              dataIndex: "scope",
              render: (v: string) =>
                (
                  ({
                    general: "一般资金",
                    payroll: "工资专户",
                    project: "项目专户",
                    unassigned: "待确认",
                  }) as Record<string, string>
                )[v] || "待确认",
            },
            {
              title: "操作",
              render: (_, a) => (
                <Button onClick={() => select(a.id)}>编辑</Button>
              ),
            },
          ]}
        />
      </Card>
      <Card title="新增或更新账户">
        <Form
          form={form}
          layout="vertical"
          initialValues={initial}
          onFinish={save}
        >
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                label="账户"
                name="account_id"
                rules={[{ required: true }]}
              >
                <Select
                  onChange={select}
                  options={[
                    { value: "new", label: "新增账户" },
                    ...(data?.accounts || []).map((a) => ({
                      value: a.id,
                      label: a.account_name,
                    })),
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label="账户名称"
                name="account_name"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label="开户银行"
                name="bank_name"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="用途" name="scope" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: "general", label: "一般资金" },
                    { value: "payroll", label: "工资专户" },
                    { value: "project", label: "项目专户" },
                    { value: "unassigned", label: "用途待确认（不参与调度）" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="绑定项目（项目专户必填）" name="project_id">
                <Select
                  allowClear
                  options={(data?.projects || []).map((p) => ({
                    value: p.id,
                    label: p.project_name,
                  }))}
                />
              </Form.Item>
            </Col>
            {(["balance", "available_balance", "frozen_amount"] as const).map(
              (name, i) => (
                <Col xs={24} md={8} key={name}>
                  <Form.Item
                    label={
                      ["账面余额（元）", "可用余额（元）", "冻结金额（元）"][i]
                    }
                    name={name}
                    rules={[{ required: true }]}
                  >
                    <InputNumber className="full-width" min={0} precision={2} />
                  </Form.Item>
                </Col>
              ),
            )}
          </Row>
          <Button type="primary" htmlType="submit" loading={busy}>
            保存账户
          </Button>
        </Form>
      </Card>
      <Alert
        className="page-section"
        type="info"
        message="旧版逐笔回款和付款数据未删除，仍保存在备份中。启用合同预测的项目只使用合同生成的收支，不重复汇总旧明细。"
      />
    </>
  );
}
