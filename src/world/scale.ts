// AWS at scale, from AWS's own pages: how many services AWS offers and how big its edge network is
// (shared/aws-catalog.json, npm run aws-catalog), and how many Regions and Availability Zones it runs (shared/region-facts.json).
// My City shows them beside what the player built, so "37 built" sits next to "over 200".
import catalog from '../../shared/aws-catalog.json' with { type: 'json' };
import { FACTS } from './regions';

const commercial = Object.values(FACTS.regions).filter((r) => r.partition === 'aws');

export const AWS_SCALE = {
  services: catalog.services.atLeast,
  servicesSource: catalog.services.source,
  regions: commercial.length,
  azs: commercial.reduce((n, r) => n + r.azIds.length, 0),
  edge: catalog.edge,
};

/** One-line facts, each with its AWS source. */
export const SCALE_FACTS: { text: string; source: string }[] = [
  { text: `AWS offers over ${AWS_SCALE.services} services. Your city teaches the ones most people start with.`, source: AWS_SCALE.servicesSource },
  { text: `AWS runs ${AWS_SCALE.regions} commercial Regions with ${AWS_SCALE.azs} Availability Zones between them, and every one is a city on your world map.`, source: 'https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-availability-zones.html' },
  { text: `CloudFront delivers from over ${AWS_SCALE.edge.pops} points of presence in over ${AWS_SCALE.edge.cities} cities across ${AWS_SCALE.edge.countries} countries.`, source: AWS_SCALE.edge.source },
];
