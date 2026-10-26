import {
  Pulse,
  SquaresFour,
  ArrowsLeftRight,
  Users,
  Scroll,
  SlidersHorizontal,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

export type NavItem = {
  title: string;
  href: string;
  icon: Icon;
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
    icon: Pulse,
    description: "How Ajora works",
  },
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: SquaresFour,
    description: "Your true cashflow at a glance",
  },
  {
    title: "Transfers & dedup",
    href: "/transfers",
    icon: ArrowsLeftRight,
    description: "Phantom self-transfers, matched and removed",
  },
  {
    title: "Communal",
    href: "/communal",
    icon: Users,
    description: "Ajo, dependents, lending & remittances",
  },
  {
    title: "Audit log",
    href: "/audit",
    icon: Scroll,
    description: "Every read of your data, never sold",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: SlidersHorizontal,
    description: "Connections, consent and appearance",
  },
];
