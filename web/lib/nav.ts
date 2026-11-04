import {
  House,
  Users,
  ClockCounterClockwise,
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
 * Savings is the primary journey. Analytics remain available from Settings.
 */
export const navItems: NavItem[] = [
  {
    title: "Home",
    href: "/dashboard",
    icon: House,
    description: "Your next step towards saving",
  },
  {
    title: "My circles",
    href: "/circles",
    icon: Users,
    description: "Save together, one round at a time",
  },
  {
    title: "Activity",
    href: "/activity",
    icon: ClockCounterClockwise,
    description: "Contributions and payout records",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: SlidersHorizontal,
    description: "Appearance, privacy and insights",
  },
];
