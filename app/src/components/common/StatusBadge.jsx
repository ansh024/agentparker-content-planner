import { cn } from "@/lib/utils";

// Single source of truth for the 5 idea statuses.
// Consolidates STATUS_COLORS previously duplicated across InboxPage & IdeaDetailPage.
export const IDEA_STATUSES = ["new", "planned", "drafting", "published", "archived"];

export const STATUS_LABELS = {
  new: "New",
  planned: "Planned",
  drafting: "Drafting",
  published: "Published",
  archived: "Archived",
};

const STATUS_STYLES = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  planned: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  drafting: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function statusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.new;
}

export default function StatusBadge({ status, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        statusStyle(status),
        className
      )}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}
