import { PackageInputSchema, parseId, respond } from "@/lib/http";
import { saveVersion } from "@/lib/store";

export function POST(request, ctx) {
  return respond(async () => {
    const id = parseId((await ctx.params).id);
    const input = PackageInputSchema.parse(await request.json());
    return { number: await saveVersion(id, input) };
  });
}
