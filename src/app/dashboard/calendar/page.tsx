"use client";

import { WorkspaceCalendar } from "@/components/calendar/workspace-calendar";

export default function DashboardCalendarPage() {
  return (
    <WorkspaceCalendar
      apiBase="/api/calendar"
      controlsApiBase="/api/ai-controls"
      mode="ecommerce"
    />
  );
}
