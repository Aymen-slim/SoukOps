"use client";

import { WorkspaceCalendar } from "@/components/calendar/workspace-calendar";

export default function ProCalendarPage() {
  return (
    <WorkspaceCalendar
      apiBase="/api/calendar"
      controlsApiBase="/api/ai-controls"
      mode="pro"
    />
  );
}
