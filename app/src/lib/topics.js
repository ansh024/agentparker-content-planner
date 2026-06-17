export function getTopicStatus(topic, isRunning = false, latestRun = null) {
  if (isRunning || latestRun?.status === "queued" || latestRun?.status === "running") {
    return {
      label: latestRun?.status === "queued" ? "Queued" : "Searching",
      color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    };
  }
  if (latestRun?.status === "failed") {
    return {
      label: "Failed",
      color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };
  }
  if (!topic.active) {
    return {
      label: "Paused",
      color: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
    };
  }
  if (!topic.last_run_at) {
    return {
      label: "Ready to run",
      color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    };
  }

  const hoursSince = (Date.now() - new Date(topic.last_run_at).getTime()) / 3600000;
  if (hoursSince < 24) {
    return {
      label: "Up to date",
      color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    };
  }
  if (hoursSince < 48) {
    return {
      label: "Due soon",
      color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    };
  }
  return {
    label: "Overdue",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };
}

export async function createTopicAndSearch({ createTopic, runSearch }) {
  const topic = await createTopic();
  await runSearch(topic);
  return topic;
}

export function mergeTopicHits(existingHits = [], nextHits = []) {
  const merged = [...nextHits];
  const seen = new Set(nextHits.map((hit) => hit.id || hit.source_url));

  for (const hit of existingHits) {
    const key = hit.id || hit.source_url;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
  }

  return merged;
}

export function groupByTopic(rows = []) {
  return rows.reduce((acc, row) => {
    if (!row.topic_id) return acc;
    if (!acc[row.topic_id]) acc[row.topic_id] = [];
    acc[row.topic_id].push(row);
    return acc;
  }, {});
}

export function getLatestRun(runs = []) {
  return runs?.[0] || null;
}
