
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import * as reportsService from "../services/reports.service.js";

export function reportsRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool },
): void {
  const { pool } = options;

  app.get('/reports/weekly', async (request: FastifyRequest) => {
    return reportsService.getWeeklyReport(pool, request.userId, request.log);
  });

  app.get('/reports/monthly', async (request: FastifyRequest) => {
    return reportsService.getMonthlyReport(pool, request.userId, request.log);
  });
}
