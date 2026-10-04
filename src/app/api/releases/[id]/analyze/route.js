import { parseId, respond } from "@/lib/http";
import { runAnalysis } from "@/lib/store";

export function POST(_request, ctx) {
  return respond(async () => runAnalysis(parseId((await ctx.params).id)));
}
