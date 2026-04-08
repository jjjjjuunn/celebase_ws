import { z } from 'zod';

// spec §4.1 Error Format
export const ApiErrorDetailSchema = z.object({
  field: z.string(),
  issue: z.string(),
});
export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.array(ApiErrorDetailSchema).optional(),
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// spec §4.1 Cursor-based pagination
export const CursorParamsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CursorParams = z.infer<typeof CursorParamsSchema>;

export interface ApiResponse<T> {
  data: T;
  error?: undefined;
}

export interface ApiErrorResponse {
  data?: undefined;
  error: ApiError;
}

export interface PaginatedResponse<T> {
  items: T[];
  has_next: boolean;
  next_cursor?: string;
}
