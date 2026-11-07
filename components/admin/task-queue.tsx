"use client"

import { memo } from "react"
import {
  Circle,
  CircleCheck,
  CircleDot,
  CirclePause,
  ListChecks,
  ListTodo,
} from "lucide-react"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import type { PlanTask, TaskPlan } from "@/lib/admin/task-plan"
import styles from "./admin.module.css"

const STATUS = {
  pending: { icon: Circle, label: "to do" },
  in_progress: { icon: CircleDot, label: "in progress" },
  completed: { icon: CircleCheck, label: "completed" },
  blocked: { icon: CirclePause, label: "blocked" },
} as const

function Task({ task, busy }: { task: PlanTask; busy: boolean }) {
  const { icon: Icon, label } = STATUS[task.status]
  return (
    <li aria-current={task.status === "in_progress" ? "step" : undefined}>
      <TraceLine
        className={styles.taskLine}
        status={busy && task.status === "in_progress" ? "running" : undefined}
      >
        <TraceIcon>
          <Icon />
        </TraceIcon>
        <TraceTitle className={styles.taskTitle}>
          {task.title}
          <span className="visually-hidden">, {label}</span>
        </TraceTitle>
      </TraceLine>
      {task.status === "blocked" && (
        <p className={styles.taskReason}>Blocked: {task.reason}</p>
      )}
    </li>
  )
}

export const TaskQueue = memo(function TaskQueue({
  plan,
  busy,
}: {
  plan: TaskPlan
  busy: boolean
}) {
  const remaining = plan.tasks.filter((task) => task.status !== "completed")
  const completed = plan.tasks.filter((task) => task.status === "completed")
  return (
    <div className={styles.flowBar}>
      <section className={styles.taskQueue} aria-label="Agent tasks">
        <p className={styles.taskProgress} role="status">
          {completed.length} of {plan.tasks.length} completed
        </p>
        <Trace>
          {[
            { tasks: remaining, label: "to do", icon: ListTodo, open: true },
            {
              tasks: completed,
              label: "completed",
              icon: ListChecks,
              open: false,
            },
          ].map(({ tasks, label, icon: Icon, open }) =>
            tasks.length > 0 ? (
              <TraceCollapsible key={label} defaultOpen={open}>
                <TraceCollapsibleTrigger>
                  <TraceLine className={styles.taskLine}>
                    <TraceIcon>
                      <Icon />
                    </TraceIcon>
                    <TraceTitle>
                      {tasks.length} {label}
                    </TraceTitle>
                  </TraceLine>
                </TraceCollapsibleTrigger>
                <TraceCollapsibleContent>
                  <ol
                    className={styles.taskList}
                    aria-label={label === "to do" ? "To do" : "Completed"}
                  >
                    {tasks.map((task) => (
                      <Task key={task.id} task={task} busy={busy} />
                    ))}
                  </ol>
                </TraceCollapsibleContent>
              </TraceCollapsible>
            ) : null
          )}
        </Trace>
      </section>
    </div>
  )
})
