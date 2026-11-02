"use client"

import { useEffect, useState, type ComponentProps } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import styles from "./admin.module.css"

/** A message's icon action: a ghost button with its label as a tooltip. */
export function MessageAction({
  label,
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            className={cn(styles.messageAction, className)}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="motion-reduce:animate-none">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** Copies the text, showing a check for two seconds. */
export function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <MessageAction
      label={copied ? "Copied" : "Copy"}
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          () => {}
        )
      }
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </MessageAction>
  )
}
