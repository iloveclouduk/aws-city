// Real street plans for tests: every Region with a baked map (shared/city-maps/) and the test-only fixtures converted
// from spike S1 (tests/fixtures/city-maps/: never shipped, never fetched).
import { decodeCityMap, mappedRegions, rawCityMap, type DecodedCityMap } from '@/world/citymap';
import { cityPlanFor, type CityPlan } from '@/world/plan';
import { zonePlan } from '@/world/zoning';

const FIXTURES = import.meta.glob('../fixtures/city-maps/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export interface SamplePlan {
  /** 'fixture:eu-west-2' or the Region code of a baked map. */
  name: string;
  region: string;
  raw: unknown;
  map: DecodedCityMap;
  plan: CityPlan;
}

let cache: SamplePlan[] | undefined;
/** Every real plan the tests can see: baked Regions first (as cityPlanFor builds them), then the fixtures. */
export function samplePlans(): SamplePlan[] {
  if (cache) return cache;
  const out: SamplePlan[] = [];
  for (const region of mappedRegions()) {
    const raw = rawCityMap(region);
    out.push({ name: region, region, raw, map: decodeCityMap(raw), plan: cityPlanFor(region) });
  }
  for (const [path, raw] of Object.entries(FIXTURES).sort(([a], [b]) => a.localeCompare(b))) {
    const map = decodeCityMap(raw);
    const plan = zonePlan(map, { id: `fixture:${map.region}` });
    if (!plan) throw new Error(`fixture ${path} doesn't zone`);
    out.push({ name: `fixture:${map.region}`, region: map.region, raw, map, plan });
  }
  return (cache = out);
}

/** A few plans for the slower tests: the first, middle and last. */
export function somePlans(n = 3): SamplePlan[] {
  const all = samplePlans();
  if (all.length <= n) return all;
  return Array.from({ length: n }, (_, i) => all[Math.round((i * (all.length - 1)) / (n - 1))]);
}
