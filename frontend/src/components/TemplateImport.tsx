import { useRef, useState } from "react";
import { Alert, Button, Modal, Space, Table, Typography, message } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import {
  csvEncode,
  csvParse,
  type TemplateColumn,
} from "../domain/templateImport";
export default function TemplateImport({
  title,
  columns,
  sample,
  onValidate,
  onImport,
  hint = "导入前请核对。已有记录不会被自动删除。",
}: {
  title: string;
  columns: TemplateColumn[];
  sample?: Record<string, unknown>[];
  onValidate: (rows: Record<string, unknown>[]) => void | Promise<unknown>;
  onImport: (rows: Record<string, unknown>[]) => void | Promise<unknown>;
  hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, context] = message.useMessage();
  function download() {
    const blob = new Blob(["\uFEFF" + csvEncode(columns, sample || [])], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}模板.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 30000);
  }
  async function read(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 5e6) throw new Error("文件不得超过5MB");
      const parsed = csvParse(await file.text(), columns);
      await onValidate(parsed);
      setRows(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "文件读取失败");
      setRows(null);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!rows) return;
    setBusy(true);
    try {
      await onValidate(rows);
      await onImport(rows);
      setRows(null);
      msg.success("已导入，请核对结果");
    } catch (e) {
      msg.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="template-tools">
      {context}
      <Space wrap>
        <Button icon={<DownloadOutlined />} onClick={download}>
          下载{title}模板
        </Button>
        <Button
          icon={<UploadOutlined />}
          loading={busy}
          onClick={() => ref.current?.click()}
        >
          导入{title}
        </Button>
        <Typography.Text type="secondary">
          Excel / WPS 填写后另存为 CSV UTF-8
        </Typography.Text>
      </Space>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label={`导入${title}CSV`}
        hidden
        ref={ref}
        onChange={(e) => {
          void read(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <Alert
          showIcon
          type="error"
          message={error}
          style={{ marginTop: 12 }}
        />
      )}
      <Modal
        title={`${title} · 校验通过，共${rows?.length || 0}行`}
        open={Boolean(rows)}
        width={1000}
        onCancel={() => setRows(null)}
        onOk={confirm}
        confirmLoading={busy}
        okText="确认导入"
        cancelText="取消"
      >
        <Alert className="page-section" showIcon type="info" message={hint} />
        <Table
          rowKey="__row"
          size="small"
          pagination={{ pageSize: 5 }}
          scroll={{ x: Math.max(650, columns.length * 135) }}
          dataSource={rows?.map((r, i) => ({ ...r, __row: i }))}
          columns={columns.map((c) => ({
            title: c.label,
            dataIndex: c.key,
            render: (value) =>
              typeof value === "boolean"
                ? value
                  ? "是"
                  : "否"
                : String(value ?? ""),
          }))}
        />
      </Modal>
    </div>
  );
}
