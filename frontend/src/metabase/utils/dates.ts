import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { t } from "ttag";

dayjs.extend(relativeTime);

/** "2 hours ago", "Yesterday", "3 days ago" -- relative to `now`. */
export function formatRelativeTime(value: string, now: dayjs.ConfigType = undefined): string {
  const date = dayjs(value);
  const reference = dayjs(now);
  const days = reference.startOf("day").diff(date.startOf("day"), "day");

  return days === 1 ? t`Yesterday` : date.from(reference);
}

/** "Dec 31, 2026". */
export function formatDate(value: string): string {
  return dayjs(value).format("MMM D, YYYY");
}
