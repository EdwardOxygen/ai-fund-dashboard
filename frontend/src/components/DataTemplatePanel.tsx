import { useEffect, useState } from "react";
import { Alert, Card, Select, Table, Typography } from "antd";
import { api, type LocalStore } from "../api";
import { dataTemplates, type DataCategory } from "../domain/dataTemplates";
import TemplateImport from "./TemplateImport";
export default function DataTemplatePanel() {
  const [category, setCategory] = useState<DataCategory>("projects");
  const [data, setData] = useState<LocalStore | null>(null);
  const [error, setError] = useState("");
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
  return (
    <Card
      className="page-section"
      title="模板批量导入"
      extra={
        <Select
          aria-label="模板类型"
          style={{ width: 180 }}
          value={category}
          onChange={setCategory}
          options={Object.entries(dataTemplates).map(([value, t]) => ({
            value,
            label: t.title,
          }))}
        />
      }
    >
      <Typography.Paragraph type="secondary">
        新增留空编号，更新填写原编号。确认后整批保存，有一行错误则全部不写入。项目合同条款、逐月产值和分包计划模板在项目工作台内。
      </Typography.Paragraph>
      {error && <Alert type="error" message={error} />}
      <TemplateImport
        key={category}
        title={dataTemplates[category].title}
        columns={dataTemplates[category].columns}
        onValidate={(rows) => api.previewBatch(category, rows)}
        onImport={(rows) => api.importBatch(category, rows)}
        hint="新增或更新本浏览器数据，不删除其他记录。已有编号将更新对应记录；请先备份并核对。"
      />
      <details>
        <summary>查看已有编号（填写关联项目 / 收款账户时使用）</summary>
        <Table
          size="small"
          pagination={{ pageSize: 5 }}
          rowKey="id"
          dataSource={
            (category === "accounts"
              ? data?.accounts.map((a) => ({ id: a.id, name: a.account_name }))
              : data?.projects.map((p) => ({
                  id: p.id,
                  name: p.project_name,
                }))) || []
          }
          columns={[
            {
              title: category === "accounts" ? "账户编号" : "项目编号",
              dataIndex: "id",
            },
            { title: "名称", dataIndex: "name" },
          ]}
        />
        {category === "collections" && (
          <Typography.Paragraph>
            收款账户：
            {data?.accounts
              .map((a) => `${a.id} — ${a.account_name}`)
              .join("；")}
          </Typography.Paragraph>
        )}
      </details>
    </Card>
  );
}
