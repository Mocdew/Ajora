import {
  Activity,
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  ScrollText,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** Not yet built — rendered as a disabled "soon" item. */
  comingSoon?: boolean;
};

/**
 * Primary navigation — the deck's product surfaces. All live.
 */
export const navItems: NavItem[] = [
  {
    title: "Overview",
    href: "/overview",
    icon: Activity,
    description: "Where Ajora stands this cycle",
  },
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Your true cashflow at a glance",
  },
  {
    title: "Transfers & Dedup",
    href: "/transfers",
    icon: ArrowLeftRight,
    description: "Phantom self-transfers, matched and removed",
  },
  {
    title: "Communal",
    href: "/communal",
    icon: Users,
    description: "Ajo, dependents, lending & remittances",
  },
  {
    title: "Audit Log",
    href: "/audit",
    icon: ScrollText,
    description: "Append-only access log — auditable, never sold",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: SlidersHorizontal,
    description: "Consent, connections & preferences",
  },
];
