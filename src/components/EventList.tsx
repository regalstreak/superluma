import { useState } from "react";
import type {
  LumaEvent,
  SelectionState,
  FilterSelection,
  FilterPrice,
  SortBy,
} from "../types";
import EventCard from "./EventCard";

interface EventListProps {
  events: LumaEvent[];
  selections: Record<string, SelectionState>;
  onSelectionChange: (eventId: string, state: SelectionState) => void;
}

export default function EventList({
  events,
  selections,
  onSelectionChange,
}: EventListProps) {
  const [filterSelection, setFilterSelection] =
    useState<FilterSelection>("all");
  const [filterPrice, setFilterPrice] = useState<FilterPrice>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date");

  let filtered = events.filter((entry) => {
    const id = entry.event.api_id;
    const sel = selections[id] ?? "undecided";

    if (filterSelection !== "all" && sel !== filterSelection) return false;

    const isFree = entry.ticket_info?.is_free ?? false;
    if (filterPrice === "free" && !isFree) return false;
    if (filterPrice === "paid" && isFree) return false;

    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === "date") {
      return (
        new Date(a.event.start_at).getTime() -
        new Date(b.event.start_at).getTime()
      );
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

        <div className="filter-group">
          <label>Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            <option value="date">Date</option>
            <option value="guests">Guest Count</option>
          </select>
        </div>

        <span className="event-count">
          {filtered.length} of {events.length} events
        </span>
      </div>

      <div className="event-list">
        {filtered.map((entry) => (
          <EventCard
            key={entry.event.api_id}
            entry={entry}
            selection={selections[entry.event.api_id] ?? "undecided"}
            onSelectionChange={(state) =>
              onSelectionChange(entry.event.api_id, state)
            }
          />
        ))}
        {filtered.length === 0 && (
          <p className="no-events">No events match your filters.</p>
        )}
      </div>
    </div>
  );
}
