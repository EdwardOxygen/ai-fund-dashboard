import {
  addDays,
  cents,
  localDate,
  makeEvents,
  SCENARIOS,
  simulate,
  sum,
  type CashEvent,
  type Scenario,
  type SimulationInput,
} from "./simulation";
import { projectFundingFloor } from "./projectPlanning";

export type ForecastScope =
  | { kind: "company" }
  | { kind: "project"; projectId: number };
/** A project selection changes the dataset, not merely the stress targets. */
export function forecastBasis(input: SimulationInput, scope: ForecastScope) {
  const projects =
    scope.kind === "company"
      ? input.projects
      : input.projects.filter((p) => p.id === scope.projectId);
  if (scope.kind === "project" && !projects.length)
    throw new Error("项目不存在");
  if (scope.kind === "project" && !projects[0].plan?.enabled)
    throw new Error(
      "请先在项目工作台设置并启用合同计划，再查看项目存贷差预测。",
    );
  const dates = [
    ...new Set(
      projects.filter((p) => p.plan?.enabled).map((p) => p.plan!.as_of),
    ),
  ];
  if (dates.length > 1)
    throw new Error(
      "项目基准日不一致，不能将不同日期的期初状态直接合并。请在项目合同中统一基准日、累计实收与期初存贷差。",
    );
  return dates[0] || localDate();
}
export interface ForecastDay {
  date: string;
  opening: number;
  inflow: number;
  outflow: number;
  ending: number;
  general?: number;
  floor?: number;
}
export interface ForecastView {
  scope: ForecastScope;
  start: string;
  end: string;
  days: ForecastDay[];
  events: CashEvent[];
  warnings: string[];
  opening: number;
  inflow: number;
  outflow: number;
  ending: number;
  minimum: number;
  fundingGap: number;
  reserveGap: number;
  peakAdvance: number;
  breachDate: string | null;
  projectRows: {
    id: number;
    name: string;
    inflow: number;
    outflow: number;
    net: number;
    unassigned: number;
  }[];
}
export function forecastView(
  input: SimulationInput,
  scope: ForecastScope,
  scenario: Scenario = SCENARIOS[0],
  horizon = 90,
  safety = 0,
): ForecastView {
  const start = forecastBasis(input, scope);
  const length = Math.max(1, Math.min(730, Math.floor(horizon)));
  const end = addDays(start, length - 1);
  let days: ForecastDay[],
    events: CashEvent[],
    warnings: string[],
    opening: number;
  let reserveGap = 0;
  if (scope.kind === "company") {
    const result = simulate(input, scenario, length, safety, start);
    opening = result.summary.opening;
    events = result.events;
    warnings = result.warnings;
    reserveGap = result.summary.gap;
    days = result.days.map((d) => ({
      date: d.forecast_date,
      opening: d.opening_balance,
      inflow: d.expected_collection,
      outflow: cents(d.rigid_payment + d.planned_payment),
      ending: d.ending_balance,
      general: d.general_balance,
    }));
    const legacy = input.projects.filter((p) => !p.plan?.enabled);
    if (legacy.length)
      warnings = [
        ...warnings,
        `${legacy.length}个项目仍使用历史逐笔计划，保留参与公司收支；请到项目工作台完善合同，迁移后历史明细不重复计入。`,
      ];
  } else {
    const project = input.projects.find((p) => p.id === scope.projectId)!;
    const selected = {
      ...input,
      projects: [project],
      collections: input.collections.filter((c) => c.project_id === project.id),
      payments: input.payments.filter((p) => p.project_id === project.id),
      planning_warnings: [],
    };
    const result = makeEvents(selected, scenario, start);
    events = result.events;
    warnings = result.warnings;
    opening = project.plan!.opening_balance;
    let balance = opening;
    days = Array.from({ length }, (_, i) => {
      const date = addDays(start, i),
        previous = balance;
      const matches = events.filter((e) => e.date === date);
      // Project ownership does not depend on the receiving bank account's classification.
      const inflow = sum(
        matches.filter((e) => e.direction === "in").map((e) => e.amount),
      );
      const outflow = sum(
        matches.filter((e) => e.direction === "out").map((e) => e.amount),
      );
      balance = cents(balance + inflow - outflow);
      return {
        date,
        opening: previous,
        inflow,
        outflow,
        ending: balance,
        floor: projectFundingFloor(project.plan!, date),
      };
    });
  }
  const inPeriod = events.filter((e) => e.date >= start && e.date <= end);
  const projectRows = input.projects
    .filter((p) => scope.kind === "company" || p.id === scope.projectId)
    .map((p) => {
      const own = inPeriod.filter((e) => e.project_id === p.id);
      const inflow = sum(
        own
          .filter(
            (e) =>
              e.direction === "in" &&
              (scope.kind === "project" || e.pool !== "unassigned"),
          )
          .map((e) => e.amount),
      );
      const outflow = sum(
        own.filter((e) => e.direction === "out").map((e) => e.amount),
      );
      return {
        id: p.id,
        name: p.project_name,
        inflow,
        outflow,
        net: cents(inflow - outflow),
        unassigned: sum(
          own
            .filter((e) => e.direction === "in" && e.pool === "unassigned")
            .map((e) => e.amount),
        ),
      };
    });
  const minimum = Math.min(opening, ...days.map((d) => d.ending));
  const minimumGeneral =
    scope.kind === "company"
      ? Math.min(
          sum(
            input.accounts
              .filter((a) => a.scope === "general")
              .map((a) => a.available_balance),
          ),
          ...days.map((d) => d.general!),
        )
      : 0;
  const openingBreach =
    scope.kind === "project" && opening < days[0].floor! - 0.01;
  return {
    scope,
    start,
    end,
    days,
    events,
    warnings,
    opening,
    inflow: sum(days.map((d) => d.inflow)),
    outflow: sum(days.map((d) => d.outflow)),
    ending: days[days.length - 1].ending,
    minimum,
    fundingGap:
      scope.kind === "company" ? cents(Math.max(0, -minimumGeneral)) : 0,
    reserveGap:
      scope.kind === "company"
        ? Math.max(reserveGap, cents(Math.max(0, safety - minimumGeneral)))
        : 0,
    peakAdvance: scope.kind === "project" ? cents(Math.max(0, -minimum)) : 0,
    breachDate: openingBreach
      ? start
      : days.find((d) => d.floor !== undefined && d.ending < d.floor - 0.01)
          ?.date || null,
    projectRows,
  };
}
