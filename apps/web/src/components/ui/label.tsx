import * as React from "react";

import { cn } from "cn";

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-xs font-medium text-muted-foreground leading-none", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";

export { Label };
