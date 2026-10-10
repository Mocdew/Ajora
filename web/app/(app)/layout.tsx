import { AppShell } from "@/components/shell/app-shell";
import { PersonaProvider } from "@/components/persona-context";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // PersonaProvider wraps the whole shell so the top-bar switcher and every
  // route read/flip the same active persona.
  return (
    <PersonaProvider>
      <AppShell>{children}</AppShell>
    </PersonaProvider>
  );
}
