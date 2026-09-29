export interface TemplateColumn {
  key: string;
  label: string;
  type?: "number" | "boolean" | "date";
  optional?: boolean;
  values?: Record<string, string>;
}
export function csvEncode(
  columns: TemplateColumn[],
  rows: Record<string, unknown>[],
) {
  const escape = (value: unknown) => {
    let v = String(value ?? "");
    if (/^[=+@\t\r]/.test(v) || /^-\D/.test(v)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  };
  return [
    columns.map((c) => c.label),
    ...rows.map((row) =>
      columns.map((c) => {
        const value = row[c.key];
        return typeof value === "boolean"
          ? value
            ? "是"
            : "否"
          : c.values
            ? (Object.entries(c.values).find(([, v]) => v === value)?.[0] ??
              value)
            : value;
      }),
    ),
  ]
    .map((r) => r.map(escape).join(","))
    .join("\r\n");
}
export function csvParse(
  text: string,
  columns: TemplateColumn[],
): Record<string, unknown>[] {
  if (text.includes("\uFFFD"))
    throw new Error("编码不是UTF-8，请在Excel中另存为CSV UTF-8");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.trim());
      cell = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (quoted) throw new Error("CSV引号没有闭合");
  row.push(cell.trim());
  rows.push(row);
  const headers = rows.shift() || [];
  if (new Set(headers).size !== headers.length)
    throw new Error("模板存在重复列名");
  for (const col of columns)
    if (!headers.includes(col.label))
      throw new Error(`缺少列：${col.label}，请使用最新模板`);
  for (const header of headers)
    if (!columns.some((c) => c.label === header))
      throw new Error(`无法识别列：${header}`);
  const result: Record<string, unknown>[] = [];
  rows.forEach((values, index) => {
    if (values.every((v) => !v)) return;
    if (values.length !== headers.length)
      throw new Error(`第${index + 2}行列数不一致`);
    const record: Record<string, unknown> = {};
    for (const col of columns) {
      const value = values[headers.indexOf(col.label)]?.trim();
      if (!value) {
        if (!col.optional)
          throw new Error(`第${index + 2}行：${col.label}不能为空`);
        continue;
      }
      let parsed: unknown = value;
      if (col.type === "number") {
        parsed = Number(value);
        if (!Number.isFinite(parsed))
          throw new Error(
            `第${index + 2}行：${col.label}必须为数字，不带单位或百分号`,
          );
      }
      if (col.type === "boolean") {
        if (!["是", "否", "true", "false", "1", "0"].includes(value))
          throw new Error(`第${index + 2}行：${col.label}请填是或否`);
        parsed = ["是", "true", "1"].includes(value);
      }
      if (col.type === "date") {
        const normalized = value
          .replace(/\//g, "-")
          .replace(
            /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
            (_, y, m, d) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
          );
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
          !Number.isFinite(Date.parse(normalized)) ||
          new Date(normalized).toISOString().slice(0, 10) !== normalized
        )
          throw new Error(`第${index + 2}行：${col.label}请填YYYY-MM-DD`);
        parsed = normalized;
      }
      if (col.values) {
        if (!(value in col.values))
          throw new Error(
            `第${index + 2}行：${col.label}请选择${Object.keys(col.values).join("、")}`,
          );
        parsed = col.values[value];
      }
      record[col.key] = parsed;
    }
    result.push(record);
  });
  if (!result.length || result.length > 10000)
    throw new Error("导入数据须为1至10000行");
  return result;
}
