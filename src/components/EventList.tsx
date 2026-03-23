import { useState } from "react";
import type {
  LumaEvent,
  EventEnrichment,
  SelectionState,
  FilterSelection,
  FilterPrice,
  FilterAudience,
  FilterFoodDrinks,
  SortBy,
} from "../types";
import EventCard from "./EventCard";

interface EventListProps {
  events: LumaEvent[];
  enrichments: Record<string, EventEnrichment>;
  selections: Record<string, SelectionState>;
  onSelectionChange: (eventId: string, state: SelectionState) => void;
}

export default function EventList({
  events,
  enrichments,
  selections,
  onSelectionChange,
}: EventListProps) {
  const [filterSelection, setFilterSelection] =
    useState<FilterSelection>("all");
  const [filterPrice, setFilterPrice] = useState<FilterPrice>("all");
  const [filterAudience, setFilterAudience] = useState<FilterAudience>("all");
  const [filterFoodDrinks, setFilterFoodDrinks] =
    useState<FilterFoodDrinks>("all");
  const [minRelevance, setMinRelevance] = useState(1);
  const [sortBy, setSortBy] = useState<SortBy>("date");

  const hasEnrichments = Object.keys(enrichments).length > 0;

  let filtered = events.filter((entry) => {
    const id = entry.event.api_id;
    const sel = selections[id] ?? "undecided";

    if (filterSelection !== "all" && sel !== filterSelection) return false;

    const isFree = entry.ticket_info?.is_free ?? false;
    if (filterPrice === "free" && !isFree) return false;
    if (filterPrice === "paid" && isFree) return false;

    // Enrichment-based filters
    const enrichment = enrichments[id];
    if (enrichment) {
      if (minRelevance > 1 && enrichment.relevance_score < minRelevance)
        return false;
      if (
        filterAudience !== "all" &&
        !enrichment.audience_categories.includes(filterAudience)
      )
        return false;
      if (filterFoodDrinks === "yes" && !enrichment.has_food_drinks)
        return false;
      if (filterFoodDrinks === "no" && enrichment.has_food_drinks)
        return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === "date") {
      return (
        new Date(a.event.start_at).getTime() -
        new Date(b.event.start_at).getTime()
      );
    }
    if (sortBy === "relevance") {
      const scoreA = enrichments[a.event.api_id]?.relevance_score ?? 0;
      const scoreB = enrichments[b.event.api_id]?.relevance_score ?? 0;
      return scoreB - scoreA;
    }
    return (b.guest_count ?? 0) - (a.guest_count ?? 0);
  });

  return (
    <div className="event-list-container">
      <div className="filters">
        <div className="filter-group">
          <label>Status:</label>
          <select
            value={filterSelection}
            onChange={(e) =>
              setFilterSelection(e.target.value as FilterSelection)
            }
          >
            <option value="all">All</option>
            <option value="going">Going</option>
            <option value="not_going">Not Going</option>
            <option value="undecided">Undecided</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Price:</label>
          <select
            value={filterPrice}
            onChange={(e) => setFilterPrice(e.target.value as FilterPrice)}
          >
            <option value="all">All</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        {hasEnrichments && (
          <>
            <div className="filter-group">
              <label>Min Relevance:</label>
              <select
                value={minRelevance}
                onChange={(e) => setMinRelevance(Number(e.target.value))}
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}+
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Audience:</label>
              <select
                value={filterAudience}
                onChange={(e) =>
                  setFilterAudience(e.target.value as FilterAudience)
                }
              >
                <option value="all">All</option>
                <option value="icp">ICP</option>
                <option value="investor">Investor</option>
                <option value="founder">Founder</option>
                <option value="technical">Technical</option>
                <option value="irrelevant">Irrelevant</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Food/Drinks:</label>
              <select
                value={filterFoodDrinks}
                onChange={(e) =>
                  setFilterFoodDrinks(e.target.value as FilterFoodDrinks)
                }
              >
                <option value="all">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </>
        )}

        <div className="filter-group">
          <label>Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            <option value="date">Date</option>
            <option value="guests">Guest Count</option>
            {hasEnrichments && <option value="relevance">Relevance</option>}
          </select>
        </div>

        <span className="event-count">
          {filtered.length} of {events.length} events
        </span>
      </div>

      <div className="event-list">
        {filtered.length === 0 && (
          <p className="no-events">No events match your filters.</p>
        )}
        {(() => {
          const grouped: { label: string; events: LumaEvent[] }[] = [];
          let currentLabel = "";
          for (const entry of filtered) {
            const d = new Date(entry.event.start_at);
            const label = d.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            });
            if (label !== currentLabel) {
              currentLabel = label;
              grouped.push({ label, events: [] });
            }
            grouped[grouped.length - 1].events.push(entry);
          }
          return grouped.map((group) => (
            <div key={group.label} className="date-section">
              <div className="date-header">
                <h2 className="date-label">{group.label}</h2>
                <span className="date-count">{group.events.length} event{group.events.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="date-events">
                {group.events.map((entry) => (
                  <EventCard
                    key={entry.event.api_id}
                    entry={entry}
                    enrichment={enrichments[entry.event.api_id]}
                    selection={selections[entry.event.api_id] ?? "undecided"}
                    onSelectionChange={(state) =>
                      onSelectionChange(entry.event.api_id, state)
                    }
                  />
                ))}
              </div>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}
