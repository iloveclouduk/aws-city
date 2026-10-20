// Real brand names behind one switch (shared/brand.json). The player chose the Amazon Air hub with its real name and
// livery; a store build that can't use them flips `amazon` to false and every branded thing shows its generic name
// instead (a business's `nameUnbranded`, the airport's plain livery). Nothing else reads the brand.
import brandJson from '../../shared/brand.json' with { type: 'json' };

const BRAND = brandJson as { amazon: boolean };

/** Amazon's own names and liveries (Amazon Air) are on. */
export const BRAND_AMAZON = BRAND.amazon === true;

/** A name with a brand: the branded one when the brand is on, else the generic one. */
export const branded = (x: { name: string; nameUnbranded?: string; brand?: string }, on = BRAND_AMAZON) => (x.brand && !on ? (x.nameUnbranded ?? x.name) : x.name);
