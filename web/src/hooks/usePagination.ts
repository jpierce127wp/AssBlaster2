import { useState, useCallback } from 'react';

export function usePagination(pageSize = 20) {
  const [offset, setOffset] = useState(0);

  const nextPage = useCallback(() => {
    setOffset((o) => o + pageSize);
  }, [pageSize]);

  const prevPage = useCallback(() => {
    setOffset((o) => Math.max(0, o - pageSize));
  }, [pageSize]);

  const goToPage = useCallback(
    (page: number) => {
      setOffset(page * pageSize);
    },
    [pageSize],
  );

  const reset = useCallback(() => {
    setOffset(0);
  }, []);

  return {
    offset,
    limit: pageSize,
    page: Math.floor(offset / pageSize),
    nextPage,
    prevPage,
    goToPage,
    reset,
  };
}
