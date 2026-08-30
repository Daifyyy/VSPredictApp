/** Zacatek predchoziho kalendarniho dne v Praze, vyjadreny jako UTC instant. */
export function pragueTwoDayStart(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const utcNoon = new Date(Date.UTC(value("year"), value("month") - 1, value("day") - 1, 12));
  const offsetName = new Intl.DateTimeFormat("en", { timeZone: "Europe/Prague", timeZoneName: "longOffset" }).formatToParts(utcNoon).find((part) => part.type === "timeZoneName")?.value ?? "GMT+01:00";
  const match = offsetName.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMinutes = match ? (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) : 60;
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day") - 1) - offsetMinutes * 60_000);
}

export function pragueDateBounds(dateKey: string): { start: Date; end: Date } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const offsetAt = (date: Date) => {
    const name = new Intl.DateTimeFormat("en", { timeZone: "Europe/Prague", timeZoneName: "longOffset" }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT+01:00";
    const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
    return match ? (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) : 60;
  };
  const startBase = Date.UTC(year, month - 1, day);
  const endBase = Date.UTC(year, month - 1, day + 1);
  return { start: new Date(startBase - offsetAt(new Date(startBase + 12 * 3600_000)) * 60_000), end: new Date(endBase - offsetAt(new Date(endBase + 12 * 3600_000)) * 60_000) };
}
