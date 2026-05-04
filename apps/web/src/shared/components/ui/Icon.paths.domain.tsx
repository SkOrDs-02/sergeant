/**
 * Domain icon paths (finance, fitness, nutrition, calendar, charts).
 * Виокремлено з Icon.tsx (initiative 0001 Phase 2 — module decomposition).
 */

import type { ReactNode } from "react";

export const DOMAIN_PATHS: Record<string, ReactNode> = {
  // Finance
  "credit-card": (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </>
  ),
  "piggy-bank": (
    <>
      <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-7.5-.5-10.5 1.5C4 10 3 12 3 13.5c0 1.5 1 3 2 4 .5.5 1 1 1 1.5v1h3v-1.5c1 .5 2 .5 3 .5s2 0 3-.5v1.5h3v-1c0-.5.5-1 1-1.5s1-1.5 1-3c0-2-1.5-4-3-5-.5-1-.5-2 0-2.5l-1-1.5z" />
    </>
  ),
  "hand-coins": (
    <>
      <circle cx="8" cy="7" r="4" />
      <path d="M3 21v-1a5 5 0 0 1 10 0v1" />
      <circle cx="17" cy="9" r="3" />
      <circle cx="17" cy="15" r="3" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
      <path d="M4 6v12a2 2 0 0 0 2 2h14v-4" />
      <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4z" />
    </>
  ),
  calculator: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="16" y1="14" x2="16" y2="18" />
      <line x1="8" y1="14" x2="8.01" y2="14" />
      <line x1="12" y1="14" x2="12.01" y2="14" />
      <line x1="8" y1="18" x2="8.01" y2="18" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </>
  ),
  // Fitness
  dumbbell: (
    <>
      <path d="M6 6v12M10 4v16M14 4v16M18 6v12M2 10v4M22 10v4" />
    </>
  ),
  activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  scale: (
    <>
      <path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z" />
      <path d="M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </>
  ),
  ruler: (
    <>
      <path d="M21.3 8.7l-9.6 9.6c-.4.4-1 .4-1.4 0L4.7 13c-.4-.4-.4-1 0-1.4l9.6-9.6c.4-.4 1-.4 1.4 0l5.6 5.6c.4.4.4 1 0 1.4z" />
      <path d="M7.5 10.5l2 2" />
      <path d="M10.5 7.5l2 2" />
      <path d="M13.5 4.5l2 2" />
      <path d="M4.5 13.5l2 2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  // Nutrition
  utensils: (
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2h2v11M7 2v13M17 2v20M21 15V2a4 4 0 0 0-4 4v7c0 1.1.9 2 2 2z" />
    </>
  ),
  droplet: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
  "shopping-cart": (
    <>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </>
  ),
  package: (
    <>
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </>
  ),
  // Calendar / time
  bell: (
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  "calendar-check": (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <polyline points="9 16 11 18 15 14" />
    </>
  ),
  "calendar-plus": (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="10" y1="16" x2="14" y2="16" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
  // Charts / trends
  "trending-up": (
    <>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="14 7 21 7 21 14" />
    </>
  ),
  "trending-down": (
    <>
      <polyline points="3 7 9 13 13 9 21 17" />
      <polyline points="14 17 21 17 21 10" />
    </>
  ),
};
