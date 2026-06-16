import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Pull-to-refresh hook for mobile.
 * Returns { ref, refreshing, pullDistance } to attach to a scrollable container.
 *
 * Usage:
 *   const { containerRef, refreshing, pullDistance } = usePullToRefresh(onRefresh);
 *   <div ref={containerRef} style={pullDistance ? { transform: `translateY(${pullDistance}px)` } : {}}>
 */

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;

export function usePullToRefresh(onRefresh) {
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!pulling.current) return;
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, MAX_PULL));
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true);
      setPullDistance(MAX_PULL * 0.6);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPullDistance(0);
  }, [pullDistance, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, refreshing, pullDistance };
}
