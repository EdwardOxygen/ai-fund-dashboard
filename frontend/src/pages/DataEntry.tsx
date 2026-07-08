import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Typography,
  message
} from "antd";
import { SaveOutlined } from "@ant-design/icons";
import {
  api,
  BankAccount,
  BankAccountPayload,
  ExpectedCollectionPayload,
  PaymentRequestPayload,
  Project,
  ProjectPayload
} from "../api";

type AccountFormValues = BankAccountPayload & {
  account_id: "new" | number;
};

type ProjectFormValues = ProjectPayload;
type CollectionFormValues = ExpectedCollectionPayload;
type PaymentFormValues = PaymentRequestPayload;

const accountInitialValues: Partial<AccountFormValues> = {
  account_id: "new",
  frozen_amount: 0
};

const projectInitialValues: Partial<ProjectFormValues> = {
  owner_type: "政府单位",
  confirmed_output: 0,
  billed_amount: 0,
  collected_amount: 0
};

const collectionInitialValues: Partial<CollectionFormValues> = {
  collection_stage: "已确权",
  invoice_status: "已开票",
  aging_days: 0,
  historical_delay_days: 0
};

const paymentInitialValues: Partial<PaymentFormValues> = {
  payment_type: "材料款",
  contract_amount: 0,
  settled_amount: 0,
  paid_amount: 0,
  is_rigid_payment: false,
  is_labor_payment: false,
  attachment_status: "完整"
};

function toMoney(value: number | null | undefined): number {
  return Number(value || 0);
}

export default function DataEntry() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const [accountForm] = Form.useForm<AccountFormValues>();
  const [projectForm] = Form.useForm<ProjectFormValues>();
  const [collectionForm] = Form.useForm<CollectionFormValues>();
  const [paymentForm] = Form.useForm<PaymentFormValues>();

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    setError(null);
    try {
      const [accountRows, projectRows] = await Promise.all([
        api.getDataEntryAccounts(),
        api.getDataEntryProjects()
      ]);
      setAccounts(accountRows);
      setProjects(projectRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "基础数据加载失败");
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    void loadOptions();
    const refresh = () => void loadOptions();
    window.addEventListener("fund-dashboard-refresh", refresh);
    return () => window.removeEventListener("fund-dashboard-refresh", refresh);
  }, [loadOptions]);

  function finishWrite(messageText: string) {
    messageApi.success(messageText);
    window.dispatchEvent(new Event("fund-dashboard-refresh"));
    void loadOptions();
  }

  function handleError(err: unknown) {
    messageApi.error(err instanceof Error ? err.message : "提交失败");
  }

  function handleAccountSelect(value: "new" | number) {
    if (value === "new") {
      accountForm.resetFields();
      accountForm.setFieldsValue(accountInitialValues);
      return;
    }

    const account = accounts.find((item) => item.id === value);
    if (!account) return;
    accountForm.setFieldsValue({
      account_id: account.id,
      account_name: account.account_name,
      bank_name: account.bank_name,
      balance: account.balance,
      available_balance: account.available_balance,
      frozen_amount: account.frozen_amount
    });
  }

  async function submitAccount(values: AccountFormValues) {
    setSubmitting("account");
    try {
      const payload: BankAccountPayload = {
        account_name: values.account_name,
        bank_name: values.bank_name,
        balance: toMoney(values.balance),
        available_balance: toMoney(values.available_balance),
        frozen_amount: toMoney(values.frozen_amount)
      };
      if (values.account_id === "new") {
        await api.createBankAccount(payload);
        accountForm.resetFields();
        accountForm.setFieldsValue(accountInitialValues);
        finishWrite("资金账户已新增，预测已重算");
      } else {
        await api.updateBankAccount(values.account_id, payload);
        finishWrite("资金账户已更新，预测已重算");
      }
    } catch (err) {
      handleError(err);
    } finally {
      setSubmitting(null);
    }
  }

  async function submitProject(values: ProjectFormValues) {
    setSubmitting("project");
    try {
      await api.createProject({
        ...values,
        contract_amount: toMoney(values.contract_amount),
        confirmed_output: toMoney(values.confirmed_output),
        billed_amount: toMoney(values.billed_amount),
        collected_amount: toMoney(values.collected_amount)
      });
      projectForm.resetFields();
      projectForm.setFieldsValue(projectInitialValues);
      finishWrite("项目已新增，评分已刷新");
    } catch (err) {
      handleError(err);
    } finally {
      setSubmitting(null);
    }
  }

  async function submitCollection(values: CollectionFormValues) {
    setSubmitting("collection");
    try {
      await api.createExpectedCollection({
        ...values,
        amount: toMoney(values.amount),
        aging_days: Number(values.aging_days || 0),
        historical_delay_days: Number(values.historical_delay_days || 0)
      });
      const projectId = values.project_id;
      collectionForm.resetFields();
      collectionForm.setFieldsValue({ ...collectionInitialValues, project_id: projectId });
      finishWrite("预计回款已填报，回款可信度和现金流已重算");
    } catch (err) {
      handleError(err);
    } finally {
      setSubmitting(null);
    }
  }

  async function submitPayment(values: PaymentFormValues) {
    setSubmitting("payment");
    try {
      await api.createPaymentRequest({
        ...values,
        amount: toMoney(values.amount),
        contract_amount: toMoney(values.contract_amount),
        settled_amount: toMoney(values.settled_amount),
        paid_amount: toMoney(values.paid_amount),
        is_rigid_payment: Boolean(values.is_rigid_payment),
        is_labor_payment: Boolean(values.is_labor_payment)
      });
      const projectId = values.project_id;
      paymentForm.resetFields();
      paymentForm.setFieldsValue({ ...paymentInitialValues, project_id: projectId });
      finishWrite("付款申请已填报，付款优先级和现金流已重算");
    } catch (err) {
      handleError(err);
    } finally {
      setSubmitting(null);
    }
  }

  const projectOptions = projects.map((project) => ({
    label: project.project_name,
    value: project.id
  }));

  return (
    <>
      {contextHolder}
      <div className="toolbar">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            数据填报
          </Typography.Title>
          <Typography.Text type="secondary">
            录入资金账户、项目、预计回款和付款申请，提交后自动刷新评分、预测和风险看板。
          </Typography.Text>
        </div>
      </div>

      {error ? <Alert type="error" showIcon message={error} className="page-section" /> : null}

      <Tabs
        className="entry-tabs"
        items={[
          {
            key: "account",
            label: "资金账户",
            children: (
              <Form
                form={accountForm}
                layout="vertical"
                initialValues={accountInitialValues}
                onFinish={submitAccount}
              >
                <Row gutter={16}>
                  <Col xs={24} md={12} xl={8}>
                    <Form.Item label="账户操作" name="account_id" rules={[{ required: true, message: "请选择账户操作" }]}>
                      <Select
                        loading={loadingOptions}
                        onChange={handleAccountSelect}
                        options={[
                          { label: "新增资金账户", value: "new" },
                          ...accounts.map((account) => ({
                            label: `${account.account_name} - ${account.bank_name}`,
                            value: account.id
                          }))
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} xl={8}>
                    <Form.Item label="账户名称" name="account_name" rules={[{ required: true, message: "请输入账户名称" }]}>
                      <Input placeholder="例如：项目监管专户" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} xl={8}>
                    <Form.Item label="开户银行" name="bank_name" rules={[{ required: true, message: "请输入开户银行" }]}>
                      <Input placeholder="例如：中国建设银行" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} xl={8}>
                    <Form.Item label="账户余额" name="balance" rules={[{ required: true, message: "请输入账户余额" }]}>
                      <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} xl={8}>
                    <Form.Item label="可用余额" name="available_balance" rules={[{ required: true, message: "请输入可用余额" }]}>
                      <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} xl={8}>
                    <Form.Item label="冻结金额" name="frozen_amount">
                      <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
                    </Form.Item>
                  </Col>
                </Row>
                <Space>
                  <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={submitting === "account"}>
                    保存账户
                  </Button>
                </Space>
              </Form>
            )
          },
          {
            key: "project",
            label: "项目基本信息",
            children: (
              <Form
                form={projectForm}
                layout="vertical"
                initialValues={projectInitialValues}
                onFinish={submitProject}
              >
                <Row gutter={16}>
                  <Col xs={24} xl={12}>
                    <Form.Item label="项目名称" name="project_name" rules={[{ required: true, message: "请输入项目名称" }]}>
                      <Input placeholder="例如：市政快速路改造工程" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} xl={6}>
                    <Form.Item label="业主类型" name="owner_type" rules={[{ required: true, message: "请选择业主类型" }]}>
                      <Select
                        options={[
                          { label: "政府单位", value: "政府单位" },
                          { label: "平台公司", value: "平台公司" },
                          { label: "国有企业", value: "国有企业" },
                          { label: "民营业主", value: "民营业主" }
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} xl={6}>
                    <Form.Item label="合同额" name="contract_amount" rules={[{ required: true, message: "请输入合同额" }]}>
                      <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="确权产值" name="confirmed_output">
                      <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="已开票金额" name="billed_amount">
                      <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="已回款金额" name="collected_amount">
                      <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
                    </Form.Item>
                  </Col>
                </Row>
                <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={submitting === "project"}>
                  保存项目
                </Button>
              </Form>
            )
          },
          {
            key: "collection",
            label: "预计回款",
            children: (
              <Form
                form={collectionForm}
                layout="vertical"
                initialValues={collectionInitialValues}
                onFinish={submitCollection}
              >
                {projects.length === 0 ? (
                  <Alert type="warning" showIcon message="请先填报项目，再录入预计回款。" className="page-section" />
                ) : null}
                <Row gutter={16}>
                  <Col xs={24} lg={12}>
                    <Form.Item label="所属项目" name="project_id" rules={[{ required: true, message: "请选择项目" }]}>
                      <Select loading={loadingOptions} options={projectOptions} showSearch optionFilterProp="label" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item label="预计回款日期" name="expected_date" rules={[{ required: true, message: "请选择日期" }]}>
                      <Input type="date" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item label="预计回款金额" name="amount" rules={[{ required: true, message: "请输入金额" }]}>
                      <InputNumber min={0.01} precision={2} addonAfter="元" className="full-width" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item label="回款阶段" name="collection_stage" rules={[{ required: true, message: "请选择回款阶段" }]}>
                      <Select
                        options={[
                          { label: "付款节点已达成", value: "付款节点已达成" },
                          { label: "已确权", value: "已确权" },
                          { label: "审计中", value: "审计中" },
                          { label: "未到节点", value: "未到节点" }
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item label="开票状态" name="invoice_status" rules={[{ required: true, message: "请选择开票状态" }]}>
                      <Select
                        options={[
                          { label: "已开票", value: "已开票" },
                          { label: "部分开票", value: "部分开票" },
                          { label: "未开票", value: "未开票" }
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item label="账龄天数" name="aging_days">
                      <InputNumber min={0} precision={0} addonAfter="天" className="full-width" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item label="历史延期天数" name="historical_delay_days">
                      <InputNumber min={0} precision={0} addonAfter="天" className="full-width" />
                    </Form.Item>
                  </Col>
                </Row>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  htmlType="submit"
                  disabled={projects.length === 0}
                  loading={submitting === "collection"}
                >
                  保存回款
                </Button>
              </Form>
            )
          },
          {
            key: "payment",
            label: "付款申请",
            children: (
              <Form
                form={paymentForm}
                layout="vertical"
                initialValues={paymentInitialValues}
                onFinish={submitPayment}
              >
                {projects.length === 0 ? (
                  <Alert type="warning" showIcon message="请先填报项目，再录入付款申请。" className="page-section" />
                ) : null}
                <Row gutter={16}>
                  <Col xs={24} lg={12}>
                    <Form.Item label="所属项目" name="project_id" rules={[{ required: true, message: "请选择项目" }]}>
                      <Select loading={loadingOptions} options={projectOptions} showSearch optionFilterProp="label" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item label="收款单位" name="payee_name" rules={[{ required: true, message: "请输入收款单位" }]}>
                      <Input placeholder="例如：华东劳务有限公司" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item label="付款类型" name="payment_type" rules={[{ required: true, message: "请选择付款类型" }]}>
                      <Select
                        options={[
                          { label: "农民工工资", value: "农民工工资" },
                          { label: "工资", value: "工资" },
                          { label: "税款", value: "税款" },
                          { label: "劳务分包", value: "劳务分包" },
                          { label: "材料款", value: "材料款" },
                          { label: "钢筋材料款", value: "钢筋材料款" },
                          { label: "混凝土材料款", value: "混凝土材料款" },
                          { label: "机械租赁", value: "机械租赁" },
                          { label: "专业分包", value: "专业分包" }
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item label="申请付款金额" name="amount" rules={[{ required: true, message: "请输入金额" }]}>
                      <InputNumber min={0.01} precision={2} addonAfter="元" className="full-width" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item label="付款到期日" name="due_date" rules={[{ required: true, message: "请选择日期" }]}>
                      <Input type="date" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="分包合同额" name="contract_amount">
                      <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="已结算金额" name="settled_amount">
                      <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="已支付金额" name="paid_amount">
                      <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="附件状态" name="attachment_status" rules={[{ required: true, message: "请选择附件状态" }]}>
                      <Select
                        options={[
                          { label: "完整", value: "完整" },
                          { label: "部分缺失", value: "部分缺失" },
                          { label: "待补充", value: "待补充" },
                          { label: "缺失", value: "缺失" }
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="刚性付款" name="is_rigid_payment" valuePropName="checked">
                      <Switch checkedChildren="是" unCheckedChildren="否" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="劳务/工资支付" name="is_labor_payment" valuePropName="checked">
                      <Switch checkedChildren="是" unCheckedChildren="否" />
                    </Form.Item>
                  </Col>
                </Row>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  htmlType="submit"
                  disabled={projects.length === 0}
                  loading={submitting === "payment"}
                >
                  保存付款申请
                </Button>
              </Form>
            )
          }
        ]}
      />
    </>
  );
}
