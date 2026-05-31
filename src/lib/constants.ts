/** Shared constants for the dashboard. */
export const REDESIGN_DATE = '2026-05-31';
export const BASELINE_WEEK = '2026-05-25';
export const SITE = 'theturfyard.com';

/** Friendly labels for keyword groups. */
export const GROUP_LABELS: Record<string, string> = {
  brand: 'Brand',
  calculator: 'Calculator',
  product: 'Products',
  phoenix_local: 'Phoenix Local',
  utah_local: 'Utah Local',
  high_intent: 'High Intent',
  gap_install_howto: 'Gap · Install How-to',
  gap_infill: 'Gap · Infill',
  gap_pet_turf: 'Gap · Pet Turf',
  gap_lifespan_roi: 'Gap · Lifespan/ROI',
  gap_putting_green: 'Gap · Putting Green',
  gap_playground: 'Gap · Playground',
  gap_commercial: 'Gap · Commercial',
  gap_az_cities: 'Gap · AZ Cities',
};

export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}
