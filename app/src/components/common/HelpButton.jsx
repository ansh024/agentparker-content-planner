import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import HelpSheet from "./HelpSheet";

/**
 * "?" button that opens the contextual HelpSheet for the current route.
 * Drop it into any page header or the app top bar.
 */
export default function HelpButton({ className }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={className}
            aria-label="Help for this page"
            onClick={() => setOpen(true)}
          >
            <HelpCircle className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Help &amp; tips</TooltipContent>
      </Tooltip>
      <HelpSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
