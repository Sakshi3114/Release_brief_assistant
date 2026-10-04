import { parseId, respond } from "@/lib/http";
import { getReleaseView } from "@/lib/store";

export function GET(_request, ctx) {
  return respond(async () => getReleaseView(parseId((await ctx.params).id)));
}
