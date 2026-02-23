export interface LumaEvent {
  event: {
    api_id: string;
    name: string;
    description?: string;
    start_at: string;
    end_at: string;
    url: string;
    cover_url?: string;
    location_type?: string;
    geo_address_info?: {
      city?: string;
      address?: string;
      full_address?: string;
    };
  };
  guest_count?: number;
  ticket_info?: {
    is_free?: boolean;
    price?: {
      amount?: number;
      currency?: string;
    };
  };
}

export type SelectionState = "going" | "not_going" | "undecided";

export type FilterSelection = SelectionState | "all";
export type FilterPrice = "all" | "free" | "paid";
export type SortBy = "date" | "guests";
