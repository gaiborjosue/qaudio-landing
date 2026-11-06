"use client"

import { useEffect, useState, type ComponentProps } from "react"
import { Check, Copy, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatCost, type ResponseUsage } from "@/lib/admin/response-usage"
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

/** Shows the models recorded for this reply, including after session replay. */
export function ModelInfoAction({
  messageId,
  getUsage,
}: {
  messageId: string
  getUsage: (id: string) => ResponseUsage
}) {
  const [usage, setUsage] = useState<ResponseUsage | null>(null)
  return (
    <Tooltip
      onOpenChange={(open) => {
        if (open) setUsage(getUsage(messageId))
      }}
    >
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Response info"
            className={styles.messageAction}
          />
        }
      >
        <Info aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent
        className={`${styles.usageTooltip} motion-reduce:animate-none`}
      >
        {usage && (
          <>
            <p>
              {usage.scope === "flow" ? "Flow" : "Response"}{" "}
              {usage.partial ? "recorded cost" : "total cost"}:{" "}
              <strong>
                {formatCost(usage.totalUsd)}
                {usage.partial && usage.totalUsd !== null ? "+" : ""}
              </strong>
            </p>
            {usage.models.length ? (
              <dl>
                {usage.models.map((entry) => (
                  <div key={entry.model}>
                    <dt>{entry.model}</dt>
                    <dd>
                      {formatCost(entry.costUsd)}
                      {entry.partial && entry.costUsd !== null ? "+" : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>Model unavailable</p>
            )}
            {usage.partial && <p>Some model costs weren’t recorded.</p>}
            <p>
              USD · Model and image calls. Routing, memory, and hosting charges
              aren’t included.
            </p>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
