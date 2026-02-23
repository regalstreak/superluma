import type { LumaEvent, EventEnrichment, SelectionState } from "../types";

interface EventCardProps {
  entry: LumaEvent;
  enrichment?: EventEnrichment;
  selection: SelectionState;
  onSelectionChange: (state: SelectionState) => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const AUDIENCE_LABELS: Record<string, string> = {
  icp: "ICP",
  investor: "Investor",
  founder: "Founder",
  technical: "Technical",
  irrelevant: "Irrelevant",
};

export default function EventCard({
  entry,
  enrichment,
  selection,
  onSelectionChange,
}: EventCardProps) {
  const { event } = entry;
  const isFree = entry.ticket_info?.is_free ?? false;
  const guestCount = entry.guest_count ?? 0;
  const city = event.geo_address_info?.city ?? "";
  const address = event.geo_address_info?.address ?? "";
  const lumaUrl = `https://lu.ma/${event.url}`;

  const cycle = () => {
    const next: Record<SelectionState, SelectionState> = {
      undecided: "going",
      going: "not_going",
      not_going: "undecided",
    };
    onSelectionChange(next[selection]);
  };

  const selectionLabel: Record<SelectionState, string> = {
    undecided: "Undecided",
    going: "Going",
    not_going: "Not Going",
  };

  const scoreClass = enrichment
    ? enrichment.relevance_score >= 7
      ? "score-high"
      : enrichment.relevance_score >= 4
        ? "score-mid"
        : "score-low"
    : "";

  return (
    <div className={`event-card ${selection}`}>
      {event.cover_url && (
        <img className="event-cover" src={event.cover_url} alt="" />
      )}
      <div className="event-body">
        <div className="event-header">
          <h3 className="event-name">
            <a href={lumaUrl} target="_blank" rel="noopener noreferrer">
              {event.name}
            </a>
          </h3>
          <button
            className={`selection-btn ${selection}`}
            onClick={cycle}
            title="Click to cycle: Undecided → Going → Not Going"
          >
            {selectionLabel[selection]}
          </button>
        </div>

        <div className="event-meta">
          <span className="event-date">{formatDate(event.start_at)}</span>
          {city && <span className="event-location">{city}</span>}
          <span className="event-guests">{guestCount} guests</span>
          <span className={`event-price ${isFree ? "free" : "paid"}`}>
            {isFree ? "Free" : "Paid"}
          </span>
        </div>

        {enrichment && (
          <div className="event-enrichment">
            <span className={`relevance-badge ${scoreClass}`}>
              {enrichment.relevance_score}/10
            </span>
            <span
              className={`networking-badge ${enrichment.networking_potential}`}
            >
              {enrichment.networking_potential}
            </span>
            {enrichment.audience_categories.map((cat) => (
              <span key={cat} className={`audience-tag tag-${cat}`}>
                {AUDIENCE_LABELS[cat] ?? cat}
              </span>
            ))}
            <span className="event-type-tag">{enrichment.event_type}</span>
            {enrichment.has_food_drinks && (
              <span
                className="food-badge"
                title={enrichment.food_drinks_details}
              >
                {enrichment.food_drinks_details || "Food/Drinks"}
              </span>
            )}
          </div>
        )}

        {enrichment?.why_attend && (
          <p className="event-why-attend">{enrichment.why_attend}</p>
        )}

        {address && <div className="event-address">{address}</div>}

        {event.description && (
          <p className="event-description">
            {event.description.length > 200
              ? event.description.slice(0, 200) + "..."
              : event.description}
          </p>
        )}
      </div>
    </div>
  );
}
