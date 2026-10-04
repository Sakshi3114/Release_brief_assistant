import { parseId, respond } from "@/lib/http";
import { getDiff } from "@/lib/store";

export function GET(request, ctx) {
  return respond(async () => {
    const id = parseId((await ctx.params).id);
    const query = new URL(request.url).searchParams;
    return getDiff(
      id,
      parseId(query.get("from") ?? ""),
      parseId(query.get("to") ?? ""),
    );
  });
}
