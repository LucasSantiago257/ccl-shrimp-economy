export type Num = number | string;
export interface Partner { id: number; name: string; phone: string; document: string; notes: string; active: boolean | number; balance: Num }
export interface Product { id: number; code: string; name: string; active: boolean | number; suggested_price: Num; minimum_stock: Num; quantity: Num; stock_value: Num; average_cost: Num }
export interface Trade { id: number; party_name: string; total: Num; quantity: Num; occurred_at: string; cost_total?: Num }
export interface TradeItem { id: number; product_name: string; quantity: Num; unit_price: Num; total: Num }
export interface Title { id: number; nature: string; party_name: string; amount: Num; paid: Num; outstanding: Num; due_date: string; sale_id?: number; purchase_id?: number; expense_id?: number }
export interface Settlement { id: number; amount: Num; direction: string; method: string; occurred_at: string; allocations: string }
export interface Movement { id: number; product_name: string; type: string; quantity_delta: Num; value_delta: Num; reason: string; occurred_at: string; created_by: string }
export interface Expense { id: number; category: string; description: string; total: Num; occurred_at: string }
export interface Report { from: string; to: string; metrics: Record<string, Num>; stock: { id: number; name: string; quantity: Num; stock_value: Num }[] }
export interface PeriodStatus { date: string; closed: boolean; closureId?: number }
export interface Closure { id: number; date_from: string; date_to: string; timezone: string; closed_at: string; closed_by: string; note: string; schema_version: number; snapshot_sha256: string }
export interface SnapshotRecord { [key: string]: string | number | null }
export interface ClosingDetail { metadata: Closure; snapshot: { schemaVersion: number; from: string; to: string; timezone: string; closedAt: string; closedBy: string; note: string; report: Report; records: Record<string, SnapshotRecord[]> } }
