/** Zacatek predchoziho kalendarniho dne v Praze, vyjadreny jako UTC instant. */
export function pragueTwoDayStart(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const previous = new Date(Date.UTC(value("year"), value("month") - 1, value("day") - 1));
  return pragueDateBounds(previous.toISOString().slice(0, 10)).start;
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
  // Prague changes offset at 01:00 UTC, never at local midnight. UTC 00:00
  // still has midnight's offset; noon can already be on the other side of DST.
  return { start: new Date(startBase - offsetAt(new Date(startBase)) * 60_000), end: new Date(endBase - offsetAt(new Date(endBase)) * 60_000) };
}
