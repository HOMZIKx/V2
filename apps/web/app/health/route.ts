import { createHealthPayload } from '../../src/health';

export function GET() {
  return Response.json(createHealthPayload());
}
