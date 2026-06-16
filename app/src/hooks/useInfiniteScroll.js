import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

/**
 * Infinite scroll hook for paginated data.
 * Fires onFetchMore when user scrolls near the bottom.
 *
 * Usage:
 *   const { data, loading, hasMore, loadMore } = useInfiniteScroll(fetchFn, { pageSize: 20 });
 */

export function useInfiniteScroll(fetchFn, { pageSize = 20, deps = [] } = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const sentinelRef = useState(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const result = await fetchFn(page * pageSize, pageSize);
    if (result.length < pageSize) setHasMore(false);
    setData((prev) => [...prev, ...result]);
    setPage((p) => p + 1);
    setLoading(false);
  }, [fetchFn, page, pageSize, loading, hasMore]);

  useEffect(() => {
    setData([]);
    setPage(0);
    setHasMore(true);
    setLoading(true);
    fetchFn(0, pageSize).then((result) => {
      if (result.length < pageSize) setHasMore(false);
      setData(result);
      setPage(1);
      setLoading(false);
    });
  }, deps);

  const reset = useCallback(() => {
    setData([]);
    setPage(0);
    setHasMore(true);
  }, []);

  return { data, loading, hasMore, loadMore, reset };
}
