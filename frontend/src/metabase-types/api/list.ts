/** The `{data, total}` envelope list endpoints return. */
export interface ListResponse<T> {
  data: T[];
  total: number;
}
