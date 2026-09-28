// A page's queries at a glance: still loading, or one of them failed —
// with a way to retry the failed ones. Pages return <PageLoading /> while
// loading and <LoadError /> when failed, so an error never looks like an
// empty page.
interface QueryLike {
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
}

export function queryState(...queries: QueryLike[]) {
  return {
    loading: queries.some((q) => q.isLoading),
    failed: queries.some((q) => q.isError),
    retry: () => {
      for (const q of queries) if (q.isError) q.refetch();
    },
  };
}
