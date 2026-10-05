import { z } from "zod";
import { parseId, respond } from "@/lib/http";
import { createBrief } from "@/lib/store";

const Body = z.object({ reviewer: z.string().trim().min(1).max(80) });

export function POST(request, ctx) {
  return respond(async () => {
    const id = parseId((await ctx.params).id);
    const { reviewer } = Body.parse(await request.json());
    await createBrief(id, reviewer);
  });
}
