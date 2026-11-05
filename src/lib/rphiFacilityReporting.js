export function isCompleteCalendarMonth(startDate, endDate) {
  if (
    typeof startDate !== "string" ||
    typeof endDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  ) {
    return false;
  }

  const [year, month, day] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return (
    start.getUTCFullYear() === year &&
    start.getUTCMonth() === month - 1 &&
    start.getUTCDate() === 1 &&
    end.getUTCFullYear() === endYear &&
    end.getUTCMonth() === endMonth - 1 &&
    end.getUTCDate() === lastDay &&
    year === endYear &&
    month === endMonth
  );
}
