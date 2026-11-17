export function escapeCsvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function ageBand(months) {
  if (months == null || (typeof months === "string" && !months.trim()) || !["number", "string"].includes(typeof months)) return "Age not recorded";
  const value = Number(months);
  if (!Number.isFinite(value) || value < 0) return "Age not recorded";
  if (value < 60) return "0–4 years";
  if (value < 180) return "5–14 years";
  if (value < 300) return "15–24 years";
  if (value < 540) return "25–44 years";
  if (value < 780) return "45–64 years";
  return "65+ years";
}

export function monthlyPeriod(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Choose a valid reporting month.");
  const [year, number] = month.split("-").map(Number);
  if (year < 2000 || year > 2100) throw new Error("Reporting month is outside the supported range.");
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { start: month + "-01", end: month + "-" + last };
}

export async function loadBoundedPages(fetchPage, limit = 10000, pageSize = 500) {
  const records = [];
  for (let offset = 0; offset <= limit; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error || !Array.isArray(data)) throw new Error("The complete reporting dataset could not be loaded.");
    if (records.length + data.length > limit) throw new Error("Reporting limit exceeded. Use an authorized server aggregate report.");
    records.push(...data);
    if (data.length < pageSize) return records;
  }
  throw new Error("Reporting completeness could not be confirmed.");
}
