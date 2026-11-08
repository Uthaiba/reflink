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

export function getPreviousCompleteCalendarMonthRange(referenceDate = new Date(), monthsAgo = 1) {
  if (!(referenceDate instanceof Date) || !Number.isFinite(referenceDate.getTime())) {
    throw new TypeError("A valid reference date is required.");
  }
  if (!Number.isSafeInteger(monthsAgo) || monthsAgo < 1) {
    throw new TypeError("monthsAgo must be a positive safe integer.");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(referenceDate);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  const start = new Date(Date.UTC(year, month - 1 - monthsAgo, 1));
  const end = new Date(Date.UTC(year, month - monthsAgo, 0));
  const formatDate = (date) => [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");

  return { startDate: formatDate(start), endDate: formatDate(end) };
}
