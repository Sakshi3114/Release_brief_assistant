import { z } from "zod";
import { PackageInputSchema, respond } from "@/lib/http";
import {
  SAMPLE_2_NAME,
  SAMPLE_2_PACKAGE,
  SAMPLE_NAME,
  SAMPLE_PACKAGE,
} from "@/lib/sample";
import { createRelease, listReleases } from "@/lib/store";
import { emptyPackage } from "@/lib/model";

const Body = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  package: PackageInputSchema.optional(),
  sample: z.union([z.boolean(), z.literal(2)]).optional(),
});

export function GET() {
  return respond(() => listReleases());
}

export function POST(request) {
  return respond(async () => {
    const body = Body.parse(await request.json());
    if (body.sample === 2)
      return { id: await createRelease(SAMPLE_2_NAME, SAMPLE_2_PACKAGE) };
    if (body.sample) return { id: await createRelease(SAMPLE_NAME, SAMPLE_PACKAGE) };
    return {
      id: await createRelease(
        body.name ?? "Untitled release",
        body.package ?? emptyPackage(),
      ),
    };
  });
}
