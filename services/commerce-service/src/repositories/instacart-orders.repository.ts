import type pg from 'pg';

export interface InstacartOrder {
  id: string;
  user_id: string | null;
  meal_plan_id: string;
  instacart_order_id: string | null;
  status: 'pending' | 'submitted' | 'confirmed' | 'delivered' | 'cancelled';
  items: unknown;
  subtotal_usd: string | null;
  delivery_fee_usd: string | null;
  total_usd: string | null;
  delivery_address_id: string | null;
  scheduled_delivery: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateOrderParams {
  userId: string;
  mealPlanId: string;
  items: unknown;
}

interface UpdateOrderParams {
  orderId: string;
  instacartOrderId?: string;
  status?: 'pending' | 'submitted' | 'confirmed' | 'delivered' | 'cancelled';
  subtotalUsd?: number;
  deliveryFeeUsd?: number;
  totalUsd?: number;
  scheduledDelivery?: Date;
}

export async function createOrder(
  pool: pg.Pool,
  params: CreateOrderParams,
): Promise<InstacartOrder> {
  const { rows } = await pool.query<InstacartOrder>(
    `INSERT INTO instacart_orders (user_id, meal_plan_id, items, status)
     VALUES ($1, $2, $3::jsonb, 'pending')
     RETURNING *`,
    [params.userId, params.mealPlanId, JSON.stringify(params.items)],
  );
  if (!rows[0]) throw new Error('instacart_orders INSERT returned no row');
  return rows[0];
}

export async function updateOrder(
  pool: pg.Pool,
  params: UpdateOrderParams,
): Promise<InstacartOrder | null> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let idx = 1;

  if (params.instacartOrderId !== undefined) {
    setClauses.push(`instacart_order_id = $${String(idx++)}`);
    values.push(params.instacartOrderId);
  }
  if (params.status !== undefined) {
    setClauses.push(`status = $${String(idx++)}`);
    values.push(params.status);
  }
  if (params.subtotalUsd !== undefined) {
    setClauses.push(`subtotal_usd = $${String(idx++)}`);
    values.push(params.subtotalUsd);
  }
  if (params.deliveryFeeUsd !== undefined) {
    setClauses.push(`delivery_fee_usd = $${String(idx++)}`);
    values.push(params.deliveryFeeUsd);
  }
  if (params.totalUsd !== undefined) {
    setClauses.push(`total_usd = $${String(idx++)}`);
    values.push(params.totalUsd);
  }
  if (params.scheduledDelivery !== undefined) {
    setClauses.push(`scheduled_delivery = $${String(idx++)}`);
    values.push(params.scheduledDelivery);
  }

  values.push(params.orderId);
  const { rows } = await pool.query<InstacartOrder>(
    `UPDATE instacart_orders SET ${setClauses.join(', ')}
     WHERE id = $${String(idx)}
     RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function findByUserId(
  pool: pg.Pool,
  userId: string,
): Promise<InstacartOrder[]> {
  const { rows } = await pool.query<InstacartOrder>(
    'SELECT * FROM instacart_orders WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return rows;
}

export async function findById(
  pool: pg.Pool,
  id: string,
): Promise<InstacartOrder | null> {
  const { rows } = await pool.query<InstacartOrder>(
    'SELECT * FROM instacart_orders WHERE id = $1 LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}
