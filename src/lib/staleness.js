// A statement records a hash of every item it cites. If the item's text later
// changes, or the item is removed, the hashes no longer match and the statement
// is stale. This is a plain comparison: no AI decides what is stale.

import { createHash } from "node:crypto";
import { allItems } from "./model";

export function hashText(text) {
  const normalised = text.trim().replace(/\s+/g, " ");
  return createHash("sha256").update(normalised).digest("hex").slice(0, 16);
}

/** Hash the current text of each cited item. Unknown ids are skipped. */
export function snapshotHashes(pkg, itemIds) {
  const byId = new Map(allItems(pkg).map((i) => [i.id, i.text]));
  const hashes = {};
  for (const id of itemIds) {
    const text = byId.get(id);
    if (text !== undefined) hashes[id] = hashText(text);
  }
  return hashes;
}

export function staleReasons(hashes, latest) {
  const byId = new Map(allItems(latest).map((i) => [i.id, i.text]));
  const reasons = [];
  for (const [itemId, hash] of Object.entries(hashes)) {
    const text = byId.get(itemId);
    if (text === undefined) reasons.push({ itemId, reason: "removed" });
    else if (hashText(text) !== hash)
      reasons.push({ itemId, reason: "changed" });
  }
  return reasons;
}
