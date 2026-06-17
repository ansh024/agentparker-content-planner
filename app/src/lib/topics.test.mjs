import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createTopicAndSearch, getLatestRun, getTopicStatus, groupByTopic, mergeTopicHits } from "./topics.js";

describe("getTopicStatus", () => {
  it("shows searching while a run is in progress", () => {
    const status = getTopicStatus({ active: true, last_run_at: null }, true);

    assert.equal(status.label, "Searching");
  });

  it("shows queued and failed run states", () => {
    assert.equal(getTopicStatus({ active: true }, false, { status: "queued" }).label, "Queued");
    assert.equal(getTopicStatus({ active: true }, false, { status: "failed" }).label, "Failed");
  });
});

describe("createTopicAndSearch", () => {
  it("runs the search after creating the topic", async () => {
    const calls = [];
    const topic = { id: "topic-1", name: "AI ads" };

    const created = await createTopicAndSearch({
      async createTopic() {
        calls.push("create");
        return topic;
      },
      async runSearch(createdTopic) {
        calls.push(["run", createdTopic.id]);
      },
    });

    assert.equal(created, topic);
    assert.deepEqual(calls, ["create", ["run", "topic-1"]]);
  });
});

describe("mergeTopicHits", () => {
  it("keeps prior hits while surfacing new ones first", () => {
    const merged = mergeTopicHits(
      [{ id: "1", title: "Old" }, { id: "2", title: "Older" }],
      [{ id: "2", title: "Duplicate" }, { id: "3", title: "New" }],
    );

    assert.deepEqual(
      merged.map((hit) => hit.id),
      ["2", "3", "1"],
    );
  });
});

describe("groupByTopic", () => {
  it("groups rows by topic id", () => {
    const grouped = groupByTopic([
      { id: "run-1", topic_id: "topic-1" },
      { id: "run-2", topic_id: "topic-1" },
      { id: "run-3", topic_id: "topic-2" },
    ]);

    assert.equal(grouped["topic-1"].length, 2);
    assert.equal(grouped["topic-2"].length, 1);
  });
});

describe("getLatestRun", () => {
  it("returns the first run from an already sorted list", () => {
    assert.deepEqual(getLatestRun([{ id: "new" }, { id: "old" }]), { id: "new" });
    assert.equal(getLatestRun([]), null);
  });
});
