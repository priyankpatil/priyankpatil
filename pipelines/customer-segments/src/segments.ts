// Names and actions for the current model's segments, written after reading
// their profiles (mart_segment_profile, mart_segment_value). Segments are
// numbered by average revenue, highest first (model/model.py). Re-check these if the
// model is re-fitted with different features or k.

export interface SegmentMeta {
  name: string;
  tagline: string;
  action: string;
}

export const SEGMENTS: SegmentMeta[] = [
  {
    name: "Champions",
    tagline: "Order often, ordered recently, spend the most",
    action: "Protect the relationship: an account manager, early access to new ranges, ask for referrals.",
  },
  {
    name: "Slowing regulars",
    tagline: "Several orders, but the last one was about two months ago",
    action: "Check in before they lapse: reorder reminders, a call for the larger accounts.",
  },
  {
    name: "Newcomers",
    tagline: "First orders in the last few months",
    action: "Win the second and third order: onboarding, best sellers, a reorder reminder.",
  },
  {
    name: "Gone quiet",
    tagline: "One small order, months ago",
    action: "Low-cost reactivation by email; don't spend heavily here.",
  },
];
