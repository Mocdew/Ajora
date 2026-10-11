import {
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  ScrollText,
  Settings,
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
 * Primary navigation. Dashboard is live; the rest are routed stubs that map
 * to the deck's product surfaces (dedup, communal graph, audit, settings).
 */
export const navItems: NavItem[] = [
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
    comingSoon: true,
  },
  {
    title: "Communal",
    href: "/communal",
    icon: Users,
    description: "Ajo, dependents, lending & remittances",
  },
  {
    title: "Audit",
    href: "/audit",
    icon: ScrollText,
    description: "Append-only access log — auditable, never sold",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Consent, connections & preferences",
  },
];
