import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ComingSoon({ note }: { note?: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Construction className="h-6 w-6" aria-hidden />
        </span>
        <p className="font-display text-lg font-semibold text-foreground">
          Coming soon
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          {note ??
            "This surface is scaffolded and routed. The screen lands in a later phase."}
        </p>
      </CardContent>
    </Card>
  );
}
