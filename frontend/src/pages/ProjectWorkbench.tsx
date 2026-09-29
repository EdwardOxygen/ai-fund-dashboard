import { useEffect, useId, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api, formatWan, type LocalStore } from "../api";
import PageHeader from "../components/PageHeader";
import GettingStarted from "../components/GettingStarted";
import Chart from "../components/Chart";
import TemplateImport from "../components/TemplateImport";
import { localDate } from "../domain/simulation";
import {
  buildProjectSchedule,
  defaultProjectPlan,
  distributeOutput,
  validateProjectPlan,
  type ProjectPlan,
  type SubcontractPlan,
} from "../domain/projectPlanning";
import {
  outputColumns,
  planSections,
  subcontractColumns,
  planTemplateColumns,
  normalizeSubcontractRows,
} from "../domain/planningFields";
import type { TemplateColumn } from "../domain/templateImport";

function Field({
  column,
  value,
  onChange,
}: {
  column: TemplateColumn;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const c = column;
  const fieldId = useId();
  return (
    <div className="planning-field">
      <label htmlFor={fieldId} className="field-label">
        {c.label}
      </label>
      {c.values ? (
        <Select
          id={fieldId}
          className="full-width"
          value={value as string}
          options={Object.entries(c.values).map(([label, value]) => ({
            label,
            value,
          }))}
          onChange={onChange}
        />
      ) : c.type === "boolean" ? (
        <Switch id={fieldId} checked={Boolean(value)} onChange={onChange} />
      ) : c.type === "number" ? (
        <InputNumber
          id={fieldId}
          className="full-width"
          value={value as number}
          onChange={(v) => onChange(v ?? 0)}
        />
      ) : (
        <Input
          id={fieldId}
          type={c.type === "date" ? "date" : "text"}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
export default function ProjectWorkbench() {
  const [data, setData] = useState<LocalStore | null>(null);
  const [id, setId] = useState<number>();
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [sub, setSub] = useState<SubcontractPlan | null>(null);
  const [msg, context] = message.useMessage();
  const navigate = useNavigate();
  useEffect(() => {
    const load = () =>
      api
        .getPlanningData()
        .then(setData)
        .catch((e) => setError(e.message));
    void load();
    window.addEventListener("fund-dashboard-refresh", load);
    return () => window.removeEventListener("fund-dashboard-refresh", load);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    document.body.dataset.projectDraft = dirty ? "dirty" : "";
    return () => {
      delete document.body.dataset.projectDraft;
    };
  }, [dirty]);
  const project = data?.projects.find((p) => p.id === id);
  const change = (patch: Partial<ProjectPlan>) => {
    setPlan((p) => (p ? { ...p, ...patch } : p));
    setDirty(true);
  };
  const preview = useMemo(() => {
    if (!project || !plan) return null;
    try {
      return {
        schedule: buildProjectSchedule(project.contract_amount, plan),
        error: "",
      };
    } catch (e) {
      return { schedule: null, error: (e as Error).message };
    }
  }, [project, plan]);
  const monthly = useMemo(() => {
    if (!preview?.schedule || !plan) return [];
    const buckets = new Map<
      string,
      { month: string; receipt: number; payment: number }
    >();
    for (const [events, type] of [
      [preview.schedule.receipts, "receipt"],
      [preview.schedule.payments, "payment"],
    ] as const)
      for (const e of events) {
        const month = e.date.slice(0, 7);
        const bucket = buckets.get(month) || { month, receipt: 0, payment: 0 };
        bucket[type] += e.amount;
        buckets.set(month, bucket);
      }
    let balance = plan.opening_balance;
    return [...buckets.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => {
        balance += r.receipt - r.payment;
        return { ...r, balance };
      });
  }, [preview, plan]);
  function select(projectId: number) {
    if (dirty && !window.confirm("当前修改尚未保存，是否放弃修改并切换项目？"))
      return;
    const p = data!.projects.find((p) => p.id === projectId)!;
    setId(projectId);
    setPlan(
      structuredClone(
        p.plan ||
          defaultProjectPlan(
            p.contract_amount,
            p.confirmed_output,
            p.collected_amount,
            localDate(),
          ),
      ),
    );
    setDirty(false);
  }
  async function save() {
    if (!plan || !project) return;
    try {
      if (
        plan.enabled &&
        !project.plan?.enabled &&
        !window.confirm(
          "启用后，本项目的计算改用合同预测。原有逐笔收付款仍保留，但不重复计入；停用后恢复原口径。是否继续？",
        )
      )
        return;
      await api.saveProjectPlan(project.id, plan);
      setDirty(false);
      msg.success("项目计划已保存，公司预测已联动");
    } catch (e) {
      msg.error((e as Error).message);
    }
  }
  function newSub() {
    const p = plan!;
    setSub({
      id: `FB-${Date.now()}`,
      name: "",
      mode: "simple",
      payment_type: "专业分包",
      is_rigid_payment: false,
      amount: 0,
      paid: 0,
      entry_date: p.as_of,
      end_date: p.output_end,
      payment_days: 0,
      priority: 3,
      progress_ratio: 80,
      completion_ratio: 90,
      settlement_ratio: 97,
      completion_date: p.completion_date,
      settlement_date: p.settlement_date,
      retention_date: p.retention_date,
      allow_split: false,
      grace_days: 0,
      documents_ready: false,
    });
  }
  function saveSub() {
    if (!sub || !plan || !project) return;
    const next = [...plan.subcontracts.filter((s) => s.id !== sub.id), sub];
    try {
      validateProjectPlan(
        { ...plan, subcontracts: next },
        project.contract_amount,
      );
      change({ subcontracts: next });
      setSub(null);
    } catch (e) {
      msg.error((e as Error).message);
    }
  }
  if (!data)
    return (
      <Alert
        message={error || "正在读取项目…"}
        type={error ? "error" : "info"}
      />
    );
  return (
    <>
      {context}
      <PageHeader
        eyebrow="PROJECT WORKSPACE / 项目资金计划"
        title="从每一个项目，看清资金全局"
        description="每个项目独立维护业主收款、产值和分包付款；项目预测看存贷差，公司预测看银行资金，二者不混算。"
        actions={
          <Space>
            <Button
              onClick={() => {
                if (!dirty || window.confirm("放弃未保存修改并离开？"))
                  navigate("/master-data/projects");
              }}
              icon={<PlusOutlined />}
            >
              新增 / 管理项目
            </Button>
            <Button
              onClick={() => {
                if (!dirty || window.confirm("放弃未保存修改并离开？"))
                  navigate("/company");
              }}
            >
              公司收支预测 <ArrowRightOutlined />
            </Button>
          </Space>
        }
      />
      {!id && <GettingStarted />}
      <div className="project-overview page-section">
        <div>
          <span className="page-eyebrow">PROJECTS</span>
          <strong>
            {data.projects.length}
            <small>个项目</small>
          </strong>
        </div>
        <div>
          <span>已启用合同预测</span>
          <strong>
            {data.projects.filter((p) => p.plan?.enabled).length}
            <small>个项目</small>
          </strong>
        </div>
        <div>
          <span>合同总额</span>
          <strong>
            {formatWan(
              data.projects.reduce((s, p) => s + p.contract_amount, 0),
            )}
          </strong>
        </div>
        <div className="overview-note">
          一般资金统一调度
          <br />
          项目垫资单独控制
        </div>
      </div>
      {!id && (
        <>
          <div className="action-strip">
            <div>
              <span className="section-kicker">选择项目开始</span>
              <h3>项目资金工作台</h3>
            </div>
            <Tag>数据保存在当前浏览器，请定期备份</Tag>
          </div>
          <Row gutter={[20, 20]}>
            {data.projects.map((p, index) => (
              <Col xs={24} md={12} xl={8} key={p.id}>
                <Card className="project-tile">
                  <div className="project-tile-top">
                    <span className="project-symbol">
                      <ApartmentOutlined />
                    </span>
                    <Tag color={p.plan?.enabled ? "blue" : undefined}>
                      {p.plan?.enabled ? "合同预测已启用" : "沿用逐笔收支"}
                    </Tag>
                  </div>
                  <span className="project-number">
                    PROJECT {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3>{p.project_name}</h3>
                  <p>
                    {p.owner_type} · 合同额 {formatWan(p.contract_amount)}
                  </p>
                  <div className="project-tile-footer">
                    <span>重要系数 {p.plan?.importance || "待设置"}</span>
                    {p.plan?.enabled && <Button onClick={() => navigate(`/project/${p.id}/forecast`)}>项目预测</Button>}
                    <Button type="text" onClick={() => select(p.id)}>
                      填写 / 修改合同 <ArrowRightOutlined />
                    </Button>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
          {!data.projects.length && (
            <Empty description="请先新建项目或从账户与导入批量导入" />
          )}
        </>
      )}
      {project && plan && (
        <>
          <Card className="page-section project-context">
            <Space wrap>
              <Button
                onClick={() => {
                  if (
                    !dirty ||
                    window.confirm("放弃未保存修改并返回项目列表？")
                  ) {
                    setId(undefined);
                    setDirty(false);
                  }
                }}
              >
                全部项目
              </Button>
              <Select
                aria-label="当前项目"
                value={id}
                onChange={select}
                style={{ width: 300, maxWidth: "100%" }}
                options={data.projects.map((p) => ({
                  label: p.project_name,
                  value: p.id,
                }))}
              />
              <Tag>{formatWan(project.contract_amount)}合同额</Tag>
              <Tag color={dirty ? "orange" : "green"}>
                {dirty ? "草稿未保存" : "已同步"}
              </Tag>
            </Space>
            <Space wrap>
              <Switch
                aria-label="启用项目合同预测"
                checked={plan.enabled}
                onChange={(v) => change({ enabled: v })}
              />
              <span>启用合同预测</span>
              <Button type="primary" icon={<SaveOutlined />} onClick={save}>
                保存项目计划
              </Button>
            </Space>
          </Card>
          <Alert
            className="page-section"
            showIcon
            type="info"
            message="项目计划口径"
            description="启用合同预测后，该项目原有逐笔收付款仅保留备查，不参与重复汇总。期初实收实付已包含在账户余额中，不再计入未来现金流。设置完成后请保存；预览是未保存草稿。"
          />
          {!plan.subcontracts.length && <Alert className="page-section" type="warning" showIcon message="尚未录入分包：启用合同预测后，本项目付款预测将为0。请先补全分包计划，这不代表项目没有支出。" />}
          <Tabs
            defaultActiveKey="terms"
            items={[
              {
                key: "terms",
                label: "业主收款与预付款",
                children: (
                  <>
                    <Card className="page-section" title="合同条款模板">
                      <TemplateImport
                        title="项目合同条款"
                        columns={planTemplateColumns}
                        sample={[{ ...plan }]}
                        hint="覆盖当前项目的合同、基准和产值设置，保留分包和逐月产值明细。仅写入草稿，最后请保存项目计划。"
                        onValidate={(rows) => {
                          if (rows.length !== 1)
                            throw new Error("单项目合同条款模板只允许一行");
                          validateProjectPlan(
                            { ...plan, ...rows[0] } as ProjectPlan,
                            project.contract_amount,
                          );
                        }}
                        onImport={(rows) =>
                          change(rows[0] as Partial<ProjectPlan>)
                        }
                      />
                      <Typography.Paragraph type="secondary">
                        模板带入当前项目已有值。所有金额为元；比例填80而不是0.8。
                      </Typography.Paragraph>
                    </Card>
                    <Card className="page-section" title="回款归集账户">
                      <Select
                        aria-label="项目收款账户"
                        className="full-width"
                        value={plan.receipt_account_id}
                        placeholder="选择一般资金账户或本项目专户"
                        onChange={(v) => change({ receipt_account_id: v })}
                        options={data.accounts
                          .filter(
                            (a) =>
                              a.scope === "general" ||
                              (a.scope === "project" && a.project_id === id),
                          )
                          .map((a) => ({ label: a.account_name, value: a.id }))}
                      />
                    </Card>
                    {planSections.slice(1, 3).map((section) => (
                      <Card
                        key={section.title}
                        title={section.title}
                        className="page-section"
                      >
                        <Typography.Paragraph type="secondary">
                          {section.description}
                        </Typography.Paragraph>
                        <Row gutter={[22, 6]}>
                          {section.fields.map((c) => (
                            <Col xs={24} md={12} xl={8} key={c.key}>
                              <Field
                                column={c}
                                value={plan[c.key as keyof ProjectPlan]}
                                onChange={(v) => change({ [c.key]: v })}
                              />
                            </Col>
                          ))}
                        </Row>
                      </Card>
                    ))}
                  </>
                ),
              },
              {
                key: "output",
                label: "产值计划",
                children: (
                  <Card title="产值计划" className="page-section">
                    <Typography.Paragraph type="secondary">
                      {planSections[3].description}
                    </Typography.Paragraph>
                    <Row gutter={[22, 6]}>
                      {planSections[3].fields.map((c) => (
                        <Col xs={24} md={12} xl={6} key={c.key}>
                          <Field
                            column={c}
                            value={plan[c.key as keyof ProjectPlan]}
                            onChange={(v) => change({ [c.key]: v })}
                          />
                        </Col>
                      ))}
                    </Row>
                    <TemplateImport
                      title="逐月产值"
                      columns={outputColumns}
                      sample={(plan.output_mode === "manual"
                        ? plan.output_periods
                        : distributeOutput(
                            project.contract_amount - plan.opening_output,
                            plan.output_start,
                            plan.output_end,
                            plan.output_curve,
                          )
                      ).map((p) => ({ ...p }))}
                      hint="替换本项目草稿的逐月产值计划，并切换为逐月填写。保存后才影响公司预测。"
                      onValidate={(rows) =>
                        validateProjectPlan(
                          {
                            ...plan,
                            output_mode: "manual",
                            output_periods:
                              rows as unknown as ProjectPlan["output_periods"],
                          },
                          project.contract_amount,
                        )
                      }
                      onImport={(rows) =>
                        change({
                          output_mode: "manual",
                          output_periods:
                            rows as unknown as ProjectPlan["output_periods"],
                        })
                      }
                    />
                    {plan.output_mode === "manual" ? (
                      <>
                        <Table
                          rowKey={(_, i) => String(i)}
                          pagination={false}
                          dataSource={plan.output_periods}
                          columns={[
                            {
                              title: "月份 / 产值日期",
                              render: (_, r, i) => (
                                <Input
                                  type="date"
                                  aria-label={`第${i + 1}月产值日期`}
                                  value={r.date}
                                  onChange={(e) =>
                                    change({
                                      output_periods: plan.output_periods.map(
                                        (p, j) =>
                                          i === j
                                            ? { ...p, date: e.target.value }
                                            : p,
                                      ),
                                    })
                                  }
                                />
                              ),
                            },
                            {
                              title: "新增产值（元）",
                              render: (_, r, i) => (
                                <InputNumber
                                  aria-label={`第${i + 1}月产值金额`}
                                  min={0}
                                  value={r.amount}
                                  onChange={(v) =>
                                    change({
                                      output_periods: plan.output_periods.map(
                                        (p, j) =>
                                          i === j
                                            ? { ...p, amount: v || 0 }
                                            : p,
                                      ),
                                    })
                                  }
                                />
                              ),
                            },
                            {
                              title: "操作",
                              render: (_, r, i) => (
                                <Button
                                  danger
                                  onClick={() =>
                                    change({
                                      output_periods:
                                        plan.output_periods.filter(
                                          (_, j) => j !== i,
                                        ),
                                    })
                                  }
                                >
                                  移除
                                </Button>
                              ),
                            },
                          ]}
                        />
                        <Button
                          onClick={() =>
                            change({
                              output_periods: [
                                ...plan.output_periods,
                                { date: plan.output_start, amount: 0 },
                              ],
                            })
                          }
                        >
                          添加月份
                        </Button>
                        <Button
                          onClick={() =>
                            change({
                              output_periods: distributeOutput(
                                project.contract_amount - plan.opening_output,
                                plan.output_start,
                                plan.output_end,
                                plan.output_curve,
                              ),
                            })
                          }
                        >
                          按当前自动曲线填入
                        </Button>
                      </>
                    ) : (
                      <Table
                        rowKey="date"
                        pagination={{ pageSize: 12 }}
                        dataSource={preview?.schedule?.outputs || []}
                        columns={[
                          { title: "产值日期", dataIndex: "date" },
                          {
                            title: "当期产值",
                            dataIndex: "amount",
                            render: formatWan,
                          },
                        ]}
                      />
                    )}
                  </Card>
                ),
              },
              {
                key: "subcontracts",
                label: "分包付款",
                children: (
                  <Card
                    title="分包计划"
                    extra={
                      <Button icon={<PlusOutlined />} onClick={newSub}>
                        添加分包
                      </Button>
                    }
                  >
                    <Typography.Paragraph type="secondary">
                      简易模式将剩余估算金额在进场至完工之间按月分配。详细模式按分包产值均匀分配后乘累计比例，并在完工、结算及质保节点补差。各模式均支持已付金额、账期、优先系数和付款窗口。
                    </Typography.Paragraph>
                    <TemplateImport
                      title="分包计划"
                      columns={subcontractColumns}
                      sample={plan.subcontracts.map((s) => ({ ...s }))}
                      hint="按分包编号新增或更新，不删除其他分包。简易模式可留空比例与里程碑付款日期；详细模式须填全。导入后请保存项目计划。"
                      onValidate={(rows) => {
                        const imported = normalizeSubcontractRows(rows, plan);
                        validateProjectPlan(
                          {
                            ...plan,
                            subcontracts: [
                              ...plan.subcontracts.filter(
                                (s) => !imported.some((r) => r.id === s.id),
                              ),
                              ...imported,
                            ],
                          },
                          project.contract_amount,
                        );
                      }}
                      onImport={(rows) => {
                        const imported = normalizeSubcontractRows(rows, plan);
                        change({
                          subcontracts: [
                            ...plan.subcontracts.filter(
                              (s) => !imported.some((r) => r.id === s.id),
                            ),
                            ...imported,
                          ],
                        });
                      }}
                    />
                    <Table
                      rowKey="id"
                      dataSource={plan.subcontracts}
                      scroll={{ x: 850 }}
                      columns={[
                        { title: "分包", dataIndex: "name" },
                        {
                          title: "模式",
                          dataIndex: "mode",
                          render: (v) =>
                            v === "simple" ? "简易估算" : "详细比例",
                        },
                        {
                          title: "总额",
                          dataIndex: "amount",
                          render: formatWan,
                        },
                        { title: "进场日期", dataIndex: "entry_date" },
                        {
                          title: "综合系数",
                          render: (_, s) =>
                            `${plan.importance} × ${s.priority} = ${plan.importance * s.priority}`,
                        },
                        {
                          title: "操作",
                          render: (_, s) => (
                            <Space>
                              <Button onClick={() => setSub({ ...s })}>
                                编辑
                              </Button>
                              <Button
                                danger
                                onClick={() => {
                                  if (window.confirm("从草稿中移除此分包？"))
                                    change({
                                      subcontracts: plan.subcontracts.filter(
                                        (x) => x.id !== s.id,
                                      ),
                                    });
                                }}
                              >
                                移除
                              </Button>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </Card>
                ),
              },
              {
                key: "funding",
                label: "基准与垫资约束",
                children: (
                  <Card title={planSections[0].title}>
                    <Typography.Paragraph type="secondary">
                      {planSections[0].description}
                    </Typography.Paragraph>
                    <Row gutter={[22, 6]}>
                      {planSections[0].fields.map((c) => (
                        <Col xs={24} md={12} xl={8} key={c.key}>
                          <Field
                            column={c}
                            value={plan[c.key as keyof ProjectPlan]}
                            onChange={(v) => change({ [c.key]: v })}
                          />
                        </Col>
                      ))}
                    </Row>
                    <Alert
                      showIcon
                      type="warning"
                      message="到期须回正，额度不等于可用资金"
                      description="允许垫资期内，累计存贷差不得低于负的峰值上限；期限之外不得为负。项目正存贷差是资金归属记录，不额外增加公司银行余额。存贷差会随实际回款和付款变化，不随公司内部调拨重复增加。"
                    />
                  </Card>
                ),
              },
              {
                key: "preview",
                label: "项目收支预览",
                children: (
                  <>
                    {preview?.error ? (
                      <Alert type="warning" showIcon message={preview.error} />
                    ) : (
                      <>
                        <Row gutter={[16, 16]} className="page-section">
                          {[
                            [
                              "未来预计收款",
                              preview?.schedule?.receipts.reduce(
                                (s, e) => s + e.amount,
                                0,
                              ) || 0,
                            ],
                            [
                              "未来预计付款",
                              preview?.schedule?.payments.reduce(
                                (s, e) => s + e.amount,
                                0,
                              ) || 0,
                            ],
                            ["期初存贷差", plan.opening_balance],
                          ].map(([title, value]) => (
                            <Col xs={24} md={8} key={title}>
                              <Card>
                                <Statistic
                                  title={title}
                                  value={formatWan(Number(value))}
                                />
                              </Card>
                            </Col>
                          ))}
                        </Row>
                        <Card
                          className="page-section"
                          title="剩余全周期月度收支（当前项目草稿）"
                        >
                          <Chart
                            style={{ height: 360 }}
                            option={{
                              tooltip: { trigger: "axis" },
                              legend: { data: ["收款", "付款", "期末存贷差"] },
                              grid: { left: 65, right: 24, bottom: 45 },
                              xAxis: {
                                type: "category",
                                data: monthly.map((r) => r.month),
                              },
                              yAxis: { type: "value", name: "万元" },
                              series: [
                                {
                                  name: "收款",
                                  type: "bar",
                                  data: monthly.map((r) => r.receipt / 10000),
                                  itemStyle: {
                                    color: "#378d83",
                                    borderRadius: [4, 4, 0, 0],
                                  },
                                },
                                {
                                  name: "付款",
                                  type: "bar",
                                  data: monthly.map((r) => r.payment / 10000),
                                  itemStyle: {
                                    color: "#a2b1c9",
                                    borderRadius: [4, 4, 0, 0],
                                  },
                                },
                                {
                                  name: "期末存贷差",
                                  type: "line",
                                  data: monthly.map((r) => r.balance / 10000),
                                  color: "#2c63ad",
                                  smooth: false,
                                },
                              ],
                            }}
                          />
                          <Typography.Text type="secondary">
                            这是当前草稿从基准日至尾款收清的剩余全周期，不是未来30/90天的公司测算。月末存贷差不代表月内最低值。
                          </Typography.Text>
                        </Card>
                        <Space className="page-section"><Button type="primary" disabled={dirty || !project?.plan?.enabled} onClick={() => navigate(`/project/${project!.id}/forecast`)}>查看已保存项目的逐日预测</Button><span>{dirty ? '请先保存草稿' : '独立项目范围，核对每日垫资额度与期限'}</span></Space>
                        <Card title="逐笔合同收支">
                          <Table
                            rowKey={(_, i) => String(i)}
                            scroll={{ x: 900 }}
                            dataSource={[
                              ...(preview?.schedule?.receipts || []).map(
                                (r) => ({ ...r, direction: "收款" }),
                              ),
                              ...(preview?.schedule?.payments || []).map(
                                (r) => ({ ...r, direction: "付款" }),
                              ),
                            ].sort((a, b) => a.date.localeCompare(b.date))}
                            columns={[
                              { title: "日期", dataIndex: "date" },
                              { title: "收支", dataIndex: "direction" },
                              { title: "项目", dataIndex: "name" },
                              {
                                title: "金额",
                                dataIndex: "amount",
                                render: formatWan,
                              },
                              { title: "计算依据", dataIndex: "note" },
                            ]}
                          />
                        </Card>
                        {preview?.schedule?.warnings.map((w) => (
                          <Alert
                            key={w}
                            type="warning"
                            message={w}
                            style={{ marginTop: 12 }}
                          />
                        ))}
                      </>
                    )}
                  </>
                ),
              },
            ]}
          />
          {preview?.error && (
            <Alert
              className="page-section"
              type="warning"
              showIcon
              message={`当前草稿尚不能计算：${preview.error}`}
            />
          )}
          <Modal
            title={sub?.mode === "simple" ? "分包简易估算" : "分包详细合同计划"}
            open={Boolean(sub)}
            width={1000}
            onCancel={() => setSub(null)}
            onOk={saveSub}
            okText="加入项目草稿"
            cancelText="取消"
          >
            <Row gutter={[20, 4]}>
              {sub &&
                subcontractColumns
                  .filter(
                    (c) =>
                      sub.mode === "detailed" ||
                      ![
                        "progress_ratio",
                        "completion_ratio",
                        "completion_date",
                        "settlement_ratio",
                        "settlement_date",
                        "retention_date",
                      ].includes(c.key),
                  )
                  .map((c) => (
                    <Col xs={24} md={12} lg={8} key={c.key}>
                      <Field
                        column={c}
                        value={sub[c.key as keyof SubcontractPlan]}
                        onChange={(v) => setSub({ ...sub, [c.key]: v })}
                      />
                    </Col>
                  ))}
            </Row>
          </Modal>
        </>
      )}
    </>
  );
}
