import { type ChangeEvent } from 'react';

import { useNodeState } from '@/hooks/use-node-state';

function formatDateInputValue(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDefaultRunDateRange() {
  const today = new Date();
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(today.getMonth() - 3);

  return {
    defaultStartDate: formatDateInputValue(threeMonthsAgo),
    defaultEndDate: formatDateInputValue(today),
  };
}

export function useStartNodeRunDateRange(nodeId: string) {
  const { defaultStartDate, defaultEndDate } = getDefaultRunDateRange();
  const [startDate, setStartDate] = useNodeState(nodeId, 'startDate', defaultStartDate);
  const [endDate, setEndDate] = useNodeState(nodeId, 'endDate', defaultEndDate);

  return {
    startDate,
    endDate,
    defaultStartDate,
    defaultEndDate,
    handleStartDateChange: (event: ChangeEvent<HTMLInputElement>) => setStartDate(event.target.value),
    handleEndDateChange: (event: ChangeEvent<HTMLInputElement>) => setEndDate(event.target.value),
  };
}
