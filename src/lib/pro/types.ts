export const WORKSPACE_MODES = ["ecommerce", "pro"] as const;
export type WorkspaceMode = (typeof WORKSPACE_MODES)[number];

export const PRO_CATEGORIES = ["doctor", "cameraman", "creator", "custom"] as const;
export type ProCategory = (typeof PRO_CATEGORIES)[number];

export function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return value === "ecommerce" || value === "pro";
}

export function isProCategory(value: unknown): value is ProCategory {
  return value === "doctor" || value === "cameraman" || value === "creator" || value === "custom";
}

export interface ProStyleSample {
  situation: string;
  reply: string;
}

export interface ProProfileRow {
  merchant_id: string;
  display_name: string;
  headline: string;
  profession_preset: ProCategory;
  bio: string;
  location_city: string;
  clinic_or_studio_address: string;
  lat: number | null;
  lng: number | null;
  style_samples: ProStyleSample[];
  style_rules: string;
  boundaries_note: string;
  opportunity_goals: string;
  opportunity_keywords: string[];
  min_deal_budget_millimes: number | null;
  auto_reply_enabled: boolean;
  alert_whatsapp_phone: string | null;
  alert_email: string | null;
}

export type ProPricingMode = "fixed" | "starting_at" | "custom_quote";

export interface ProServiceRow {
  id: string;
  merchant_id: string;
  title: string;
  category: string;
  description: string;
  deliverables: string[];
  duration_label: string;
  price_millimes: number | null;
  price_display: string;
  floor_millimes: number | null;
  pricing_mode: ProPricingMode;
  intake_questions: string[];
  prep_or_details_template: string;
  booking_url: string | null;
  active: boolean;
}

export type ServiceInquiryStatus = "discussing" | "details_sent" | "needs_approval" | "confirmed" | "declined";

export type OpportunitySource = "dm" | "comment" | "board" | "manual";
export type OpportunityCategory = "sponsorship" | "shoot" | "medical_talk" | "partnership" | "vip_client" | "custom";
export type OpportunityMatchStatus = "new" | "shortlisted" | "applied" | "dismissed";

export type AlertSeverity = "info" | "important" | "urgent" | "critical";
export type AlertCategory =
  | "opportunity_match"
  | "medical_red_flag"
  | "vip_quote"
  | "custom_request"
  | "angry_client"
  | "deadline";
export type AlertStatus = "unread" | "acknowledged" | "acted" | "dismissed";
