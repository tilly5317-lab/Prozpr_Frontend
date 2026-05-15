import { useCallback, useEffect, useRef, useState } from "react";
import {
  searchMfFunds,
  type MfFundMetadataListItem,
  type MfFundMetadataSearchParams,
} from "@/lib/api";

const PAGE_SIZE = 20;

export interface MfFundsPagedState {
  items: MfFundMetadataListItem[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
}

export interface MfFundsPagedHandle extends MfFundsPagedState {
  loadMore: () => void;
  /**
   * Reset the feed and start a new query. Pass `null` to clear the list and
   * cancel any in-flight request without firing a new fetch (e.g. when the
   * user empties the search box).
   */
  reset: (params: Omit<MfFundMetadataSearchParams, "limit" | "offset"> | null) => void;
}

/**
 * Paginated infinite-scroll loader over `/mf/fund-metadata/search`.
 *
 * Loads {@link PAGE_SIZE} rows at a time. Uses an incrementing request id so
 * that fast-typed search keystrokes never let a stale page clobber a newer
 * one. Caller wires `loadMore` to an `IntersectionObserver` sentinel near the
 * end of the list so the next page is fetched while the current page is still
 * partially on screen.
 */
export function useMfFundsPaged(
  initial: Omit<MfFundMetadataSearchParams, "limit" | "offset"> | null = null,
): MfFundsPagedHandle {
  const [state, setState] = useState<MfFundsPagedState>({
    items: [],
    total: 0,
    loading: false,
    loadingMore: false,
    error: null,
    hasMore: false,
  });

  const paramsRef = useRef<Omit<MfFundMetadataSearchParams, "limit" | "offset"> | null>(initial);
  const offsetRef = useRef(0);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const hasMoreRef = useRef(false);

  const fetchPage = useCallback(async (isReset: boolean) => {
    if (inFlightRef.current) return;
    if (!isReset && !hasMoreRef.current) return;
    if (paramsRef.current == null) return;

    const myRequestId = ++requestIdRef.current;
    const offset = isReset ? 0 : offsetRef.current;
    inFlightRef.current = true;

    setState((s) => ({
      ...s,
      loading: isReset ? true : s.loading,
      loadingMore: isReset ? false : true,
      error: null,
    }));

    try {
      const res = await searchMfFunds({
        ...paramsRef.current,
        limit: PAGE_SIZE,
        offset,
      });
      // Stale-page guard — newer reset already fired.
      if (myRequestId !== requestIdRef.current) return;

      offsetRef.current = offset + res.items.length;
      hasMoreRef.current = res.has_more;
      setState((s) => ({
        items: isReset ? res.items : [...s.items, ...res.items],
        total: res.total,
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: res.has_more,
      }));
    } catch (e) {
      if (myRequestId !== requestIdRef.current) return;
      const msg = e instanceof Error ? e.message : "Failed to load funds";
      setState((s) => ({
        ...s,
        loading: false,
        loadingMore: false,
        error: msg,
      }));
    } finally {
      if (myRequestId === requestIdRef.current) {
        inFlightRef.current = false;
      }
    }
  }, []);

  const reset = useCallback(
    (params: Omit<MfFundMetadataSearchParams, "limit" | "offset"> | null) => {
      paramsRef.current = params;
      offsetRef.current = 0;
      hasMoreRef.current = false;
      // Bump the request id so any in-flight fetch becomes stale.
      requestIdRef.current++;
      inFlightRef.current = false;
      if (params == null) {
        setState({ items: [], total: 0, loading: false, loadingMore: false, error: null, hasMore: false });
        return;
      }
      void fetchPage(true);
    },
    [fetchPage],
  );

  const loadMore = useCallback(() => {
    void fetchPage(false);
  }, [fetchPage]);

  useEffect(() => {
    if (initial != null) {
      paramsRef.current = initial;
      void fetchPage(true);
    }
    // Initial config only — explicit reset() drives later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, loadMore, reset };
}

export const MF_FUNDS_PAGE_SIZE = PAGE_SIZE;
