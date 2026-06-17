import { useEffect, useState } from "react";
import {
  getBenchmarkHistory,
  listBenchmarks,
  type BenchmarkHistoryResponse,
  type BenchmarkSummary,
} from "@/lib/api";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Catalogue of benchmark indices (each with its latest EOD value). */
export function useBenchmarks(activeOnly = false): AsyncState<BenchmarkSummary[]> {
  const [state, setState] = useState<AsyncState<BenchmarkSummary[]>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    listBenchmarks(activeOnly)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((e) => {
        if (!cancelled)
          setState({
            data: null,
            loading: false,
            error: e instanceof Error ? e.message : "Failed to load benchmarks",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [activeOnly]);

  return state;
}

/** EOD value history for one benchmark index. Pass `null`/empty to skip. */
export function useBenchmarkHistory(
  code: string | null
): AsyncState<BenchmarkHistoryResponse> {
  const [state, setState] = useState<AsyncState<BenchmarkHistoryResponse>>({
    data: null,
    loading: !!code,
    error: null,
  });

  useEffect(() => {
    if (!code) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    getBenchmarkHistory(code)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((e) => {
        if (!cancelled)
          setState({
            data: null,
            loading: false,
            error: e instanceof Error ? e.message : "Failed to load benchmark history",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return state;
}
