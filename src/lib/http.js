import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { HttpError } from "./store";
import { SECTIONS } from "./model";

const ItemInput = z.object({
  id: z.string().max(12).optional(),
  text: z.string().max(2000),
});

export const PackageInputSchema = z.object(
  Object.fromEntries(SECTIONS.map((s) => [s.key, z.array(ItemInput).max(50)])),
);

export function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id.");
  return id;
}

/** Run a handler and turn known errors into JSON responses. */
export async function respond(handler) {
  try {
    const data = await handler();
    return Response.json(data ?? { ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json(
        { error: "The request body is not valid." },
        { status: 400 },
      );
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json(
        {
          error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.",
        },
        { status: 502 },
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: "The AI service is rate limited. Try again shortly." },
        { status: 502 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json(
        { error: `The AI service returned an error: ${error.message}` },
        { status: 502 },
      );
    }
    console.error(error);
    const message =
      error instanceof Error ? error.message : "Unexpected error.";
    return Response.json({ error: message }, { status: 500 });
  }
}
