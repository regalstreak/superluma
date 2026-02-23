import { useEffect, useState } from "react";
import type { LumaEvent, SelectionState, EventEnrichment } from "./types";
import EventList from "./components/EventList";
import "./App.css";

const STORAGE_KEY = "luma-event-selections";

function loadSelections(): Record<string, SelectionState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSelections(selections: Record<string, SelectionState>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
}

export default function App() {
  const [events, setEvents] = useState<LumaEvent[]>([]);
  const [enrichments, setEnrichments] = useState<
    Record<string, EventEnrichment>
  >({});
  const [selections, setSelections] = useState<Record<string, SelectionState>>(
    loadSelections
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/events.json").then((res) => {
        if (!res.ok) throw new Error(`Failed to load events: ${res.status}`);
        return res.json();
      }),
      fetch("/enrichment.json")
        .then((res) => (res.ok ? res.json() : {}))
        .catch(() => ({})),
    ])
      .then(([eventsData, enrichmentData]) => {
        setEvents(eventsData);
        setEnrichments(enrichmentData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleSelectionChange = (eventId: string, state: SelectionState) => {
    setSelections((prev) => {
      const next = { ...prev };
      if (state === "undecided") {
        delete next[eventId];
      } else {
        next[eventId] = state;
      }
      saveSelections(next);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="app">
        <h1>Bay Area AI Events</h1>
        <p className="loading">Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <h1>Bay Area AI Events</h1>
        <p className="error">
          {error}. Run <code>npm run fetch</code> first to download events.
        </p>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Bay Area AI Events</h1>
      <EventList
        events={events}
        enrichments={enrichments}
        selections={selections}
        onSelectionChange={handleSelectionChange}
      />
    </div>
  );
}
