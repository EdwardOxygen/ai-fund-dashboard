import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { api, ProjectMaster, ProjectPayload, formatWan } from "../api";
import { riskColor } from "../components/RiskCard";

const initialValues: ProjectPayload = {
  project_name: "",
  owner_type: "政府单位",
  contract_amount: 0,
  confirmed_output: 0,
  billed_amount: 0,
  collected_amount: 0
};

function normalizeProjectPayload(values: ProjectPayload): ProjectPayload {
  return {
    project_name: values.project_name,
    owner_type: values.owner_type,
    contract_amount: Number(values.contract_amount || 0),
    confirmed_output: Number(values.confirmed_output || 0),
    billed_amount: Number(values.billed_amount || 0),
    collected_amount: Number(values.collected_amount || 0)
  };
}

export default function ProjectMasterData() {
  const [rows, setRows] = useState<ProjectMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectMaster | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<ProjectPayload>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.getProjectMasters());
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("fund-dashboard-refresh", refresh);
    return () => window.removeEventListener("fund-dashboard-refresh", refresh);
  }, [load]);

  function openCreateModal() {
    setEditingProject(null);
    form.setFieldsValue(initialValues);
    setModalOpen(true);
  }

  function openEditModal(project: ProjectMaster) {
    setEditingProject(project);
    form.setFieldsValue({
      project_name: project.project_name,
      owner_type: project.owner_type,
      contract_amount: project.contract_amount,
      confirmed_output: project.confirmed_output,
      billed_amount: project.billed_amount,
      collected_amount: project.collected_amount
    });
    setModalOpen(true);
  }

  async function submitProject(values: ProjectPayload) {
    setSaving(true);
    try {
      const payload = normalizeProjectPayload(values);
      if (editingProject) {
        await api.updateProjectMaster(editingProject.id, payload);
        messageApi.success("项目主数据已更新");
      } else {
        await api.createProjectMaster(payload);
        messageApi.success("项目主数据已新增");
      }
      setModalOpen(false);
      window.dispatchEvent(new Event("fund-dashboard-refresh"));
      await load();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject(project: ProjectMaster) {
    try {
      const result = await api.deleteProjectMaster(project.id);
      messageApi.success(result.message);
      window.dispatchEvent(new Event("fund-dashboard-refresh"));
      await load();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : "删除失败");
    }
  }

  const columns: ColumnsType<ProjectMaster> = [
    { title: "项目名称", dataIndex: "project_name", width: 230, fixed: "left" },
    { title: "业主类型", dataIndex: "owner_type", width: 110 },
    { title: "合同额", dataIndex: "contract_amount", width: 130, align: "right", render: (value: number) => formatWan(value) },
    { title: "确权产值", dataIndex: "confirmed_output", width: 130, align: "right", render: (value: number) => formatWan(value) },
    { title: "已开票", dataIndex: "billed_amount", width: 130, align: "right", render: (value: number) => formatWan(value) },
    { title: "已回款", dataIndex: "collected_amount", width: 130, align: "right", render: (value: number) => formatWan(value) },
    {
      title: "回款率",
      dataIndex: "collection_rate",
      width: 150,
      render: (value: number) => <Progress percent={Number((value * 100).toFixed(1))} size="small" />
    },
    {
      title: "风险",
      dataIndex: "risk_level",
      width: 90,
      render: (value: string) => <Tag color={riskColor(value)}>{value}</Tag>
    },
    { title: "预计回款", dataIndex: "expected_collection_count", width: 90, align: "right" },
    { title: "付款申请", dataIndex: "payment_request_count", width: 90, align: "right" },
    {
      title: "待付款金额",
      dataIndex: "unpaid_payment_amount",
      width: 130,
      align: "right",
      render: (value: number) => formatWan(value)
    },
    {
      title: "操作",
      key: "actions",
      width: 150,
      fixed: "right",
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            编辑
          </Button>
          <Popconfirm
            title="删除项目"
            description="仅无回款和付款数据的项目允许删除。"
            okText="删除"
            cancelText="取消"
            onConfirm={() => deleteProject(record)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <>
      {contextHolder}
      <div className="toolbar">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            项目主数据管理
          </Typography.Title>
          <Typography.Text type="secondary">
            统一维护项目名称、业主类型、合同额、确权产值、开票金额和已回款金额。
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          新增项目
        </Button>
      </div>

      {error ? <Alert type="error" showIcon message={error} className="page-section" /> : null}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1680 }}
      />

      <Modal
        title={editingProject ? "编辑项目主数据" : "新增项目主数据"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        width={860}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={initialValues} onFinish={submitProject}>
          <Row gutter={16}>
            <Col xs={24} md={16}>
              <Form.Item label="项目名称" name="project_name" rules={[{ required: true, message: "请输入项目名称" }]}>
                <Input placeholder="例如：市政快速路改造工程" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
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
            <Col xs={24} md={12}>
              <Form.Item label="合同额" name="contract_amount" rules={[{ required: true, message: "请输入合同额" }]}>
                <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="确权产值" name="confirmed_output">
                <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="已开票金额" name="billed_amount">
                <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="已回款金额" name="collected_amount">
                <InputNumber min={0} precision={2} addonAfter="元" className="full-width" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}
