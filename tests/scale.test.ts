import { describe, expect, it } from 'vitest';
import { AWS_SCALE, SCALE_FACTS } from '@/world/scale';
import { isSafeDocsUrl } from '@/app/runtime';

// AWS-scale numbers come from AWS pages (npm run aws-catalog, npm run region-facts), each with its source.
describe('AWS at scale', () => {
  it('has real numbers, each fact sourced on an AWS docs host', () => {
    expect(AWS_SCALE.services).toBeGreaterThanOrEqual(200);
    expect(AWS_SCALE.regions).toBeGreaterThan(25);
    expect(AWS_SCALE.azs).toBeGreaterThan(AWS_SCALE.regions * 3 - 1);
    expect(AWS_SCALE.edge.pops).toBeGreaterThan(AWS_SCALE.edge.edgeLocations - 1);
    for (const f of SCALE_FACTS) expect(isSafeDocsUrl(f.source), f.source).toBe(true);
  });
});
