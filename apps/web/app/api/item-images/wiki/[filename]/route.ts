import { getCatalogWikiImageResponse } from '../../../../../src/server/item-image-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: Promise<{ readonly filename: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { filename } = await context.params;
  return getCatalogWikiImageResponse(filename);
}
