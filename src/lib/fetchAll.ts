// Supabase returns at most 1,000 rows per request, silently: a query for a month of submissions
// came back with only its first 1,000, so the dashboard showed nobody submitting after about the
// 23rd. Anything that may read more than that fetches it page by page through here.
//
// The query must have a stable order (e.g. `.order('id')`), or rows can repeat or go missing
// between pages.

const PAGE_SIZE = 1000

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

export async function fetchAllPages<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < PAGE_SIZE) return rows
  }
}
