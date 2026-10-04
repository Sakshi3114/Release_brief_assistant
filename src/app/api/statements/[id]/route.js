import { z } from "zod";
import { parseId, respond } from "@/lib/http";
import { updateStatement } from "@/lib/store";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["approve", "reject", "reset"]) }),
  z.object({
    action: z.literal("edit"),
    text: z.string().max(2000),
    citations: z.array(z.string().max(12)).max(30),
  }),
]);

// The only place a statement's status changes. It is called from the reviewer's
// buttons; the AI code path has no access to it.
export function PATCH(request, ctx) {
  return respond(async () => {
    const id = parseId((await ctx.params).id);
    updateStatement(id, Body.parse(await request.json()));
  });
}
