import { SECTIONS } from "./model";

/** Compare two package versions item by item, matching on the stable item id. */
export function diffPackages(before, after) {
  const diffs = [];
  for (const { key } of SECTIONS) {
    const old = new Map(before[key].map((i) => [i.id, i.text]));
    const seen = new Set();
    for (const item of after[key]) {
      seen.add(item.id);
      const previous = old.get(item.id);
      if (previous === undefined) {
        diffs.push({
          id: item.id,
          section: key,
          status: "added",
          after: item.text,
        });
      } else if (previous.trim() !== item.text.trim()) {
        diffs.push({
          id: item.id,
          section: key,
          status: "modified",
          before: previous,
          after: item.text,
        });
      } else {
        diffs.push({
          id: item.id,
          section: key,
          status: "unchanged",
          before: previous,
          after: item.text,
        });
      }
    }
    for (const item of before[key]) {
      if (!seen.has(item.id)) {
        diffs.push({
          id: item.id,
          section: key,
          status: "removed",
          before: item.text,
        });
      }
    }
  }
  return diffs;
}
