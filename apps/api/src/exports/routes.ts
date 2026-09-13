import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { exportData, exportQuery } from "./data.js";
import { expenseWorkbook } from "./workbook.js";

export function registerExports(app: FastifyInstance, db: PrismaClient, clock: () => Date) {
  app.get("/exports/expenses.xlsx", async (request, reply) => {
    const input = exportQuery.parse(request.query);
    const data = await exportData(db, input, clock(), request.userId);
    const workbook = await expenseWorkbook(data);
    const filename = input.start_date ? `KharCha_${input.start_date}_to_${input.end_date}.xlsx` : "KharCha_all_expenses.xlsx";
    return reply.header("Cache-Control", "no-store")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(workbook);
  });
}
