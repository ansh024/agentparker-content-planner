import { useLocation } from "react-router-dom";
import { LifeBuoy } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { helpForPath } from "@/lib/help";

/**
 * Right-side help drawer. Reads the current route and renders its help entry.
 * Full-width on mobile (Sheet side="right" is w-full, sm:max-w-md).
 */
export default function HelpSheet({ open, onOpenChange }) {
  const { pathname } = useLocation();
  const help = helpForPath(pathname);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0">
        <SheetHeader>
          <div className="flex items-center gap-2 text-primary">
            <LifeBuoy className="h-5 w-5" />
            <SheetTitle>{help ? help.title : "Help"}</SheetTitle>
          </div>
          {help?.tagline && (
            <SheetDescription>{help.tagline}</SheetDescription>
          )}
        </SheetHeader>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="px-6 py-2">
            {help ? (
              <Accordion
                type="single"
                collapsible
                defaultValue="section-0"
                className="w-full"
              >
                {help.sections.map((s, i) => (
                  <AccordionItem key={i} value={`section-${i}`}>
                    <AccordionTrigger className="text-left">
                      {s.heading}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {s.body}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <p className="py-6 text-sm text-muted-foreground">
                No help is available for this page yet.
              </p>
            )}

            {help?.shortcuts?.length > 0 && (
              <div className="mt-6">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Keyboard shortcuts
                </h4>
                <ul className="space-y-2">
                  {help.shortcuts.map((sc) => (
                    <li
                      key={sc.label}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">{sc.label}</span>
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {sc.keys}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
