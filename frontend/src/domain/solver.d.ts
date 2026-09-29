declare module 'javascript-lp-solver' {
  const solver: { Solve(model: unknown): { feasible: boolean; bounded: boolean; result: number; [key: string]: number | boolean } };
  export default solver;
}
