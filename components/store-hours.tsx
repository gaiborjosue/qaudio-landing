"use client"

import { useSyncExternalStore } from "react"
import Image from "next/image"
import { CalendarClock, Phone } from "lucide-react"
import { LiquidGlass } from "@/components/ui/liquid-glass"
import {
  PHONE_HOURS,
  WEEKDAYS,
  WEEKLY_HOURS,
  formatChangeDates,
  formatHours,
  formatMonthDay,
  hoursOn,
  storeClock,
  storeStatus,
  upcomingChanges,
  weekSchedule,
  weekdayIndex,
  type DayHours,
  type StoreClock,
} from "@/lib/store-hours"
import { cn } from "@/lib/utils"
import styles from "./visit-section.module.css"

// Time-dependent details render after hydration and refresh each minute.
function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, 15_000)
  return () => window.clearInterval(id)
}
const currentMinute = () => Math.floor(Date.now() / 60_000)
const serverMinute = () => null

/** Store-time clock on the client; null during server rendering. */
export function useStoreClock() {
  const minute = useSyncExternalStore(subscribe, currentMinute, serverMinute)
  return minute === null ? null : storeClock(new Date(minute * 60_000))
}

const REGULAR_WEEK = WEEKDAYS.map((name, index) => ({
  name,
  date: "",
  isToday: false,
  hours: WEEKLY_HOURS[index],
  change: undefined,
}))

function Hours({ hours }: { hours: DayHours }) {
  return (
    <span className={typeof hours === "object" ? undefined : styles.muted}>
      {formatHours(hours)}
    </span>
  )
}

function DayName({
  name,
  date,
  changed,
}: {
  name: string
  date: string
  changed: boolean
}) {
  return (
    <span className={styles.day}>
      {name}
      {changed && (
        <span className={styles.dateTag}>{formatMonthDay(date)}</span>
      )}
    </span>
  )
}

const Leader = () => <span className={styles.leader} aria-hidden="true" />

// Rim fringe plus a matching frost: yellow for notices, green open, red closed.
const NOTICE_GLASS = {
  redOffset: 300,
  greenOffset: 300,
  style: { backgroundColor: "rgb(255 245 205 / 0.48)" },
}
const OPEN_GLASS = {
  greenOffset: 360,
  style: { backgroundColor: "rgb(222 247 229 / 0.42)" },
}
const CLOSED_GLASS = {
  redOffset: 360,
  style: { backgroundColor: "rgb(255 226 218 / 0.36)" },
}

/** Today's hours and live status, shared by the hours list and the hero. */
export function TodayPill({
  clock,
  compact = false,
}: {
  clock: StoreClock
  compact?: boolean
}) {
  const { hours, change } = hoursOn(clock.date)
  const status = storeStatus(clock)
  return (
    <LiquidGlass
      className={cn(styles.today, compact && styles.todayCompact)}
      scale={70}
      aberration={0}
      bevelDepth={22}
      // Blur the busy hero dither so the compact pill reads cleanly.
      frost={compact ? 6 : 0}
      {...(status.open ? OPEN_GLASS : CLOSED_GLASS)}
    >
      <span className={styles.row}>
        <span className="visually-hidden">Today, </span>
        <DayName
          name={WEEKDAYS[weekdayIndex(clock.date)]}
          date={clock.date}
          changed={Boolean(change)}
        />
        <Leader />
        <Hours hours={hours} />
      </span>
      <span className={styles.status}>
        <span className={styles.eq} data-live={status.open} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        {compact ? status.brief : status.text}
      </span>
    </LiquidGlass>
  )
}

export function StoreHours() {
  const clock = useStoreClock()
  const rows = clock ? weekSchedule(clock.date) : REGULAR_WEEK
  const changes = clock ? upcomingChanges(clock.date) : []

  return (
    <div className={styles.hours}>
      <h3 className={styles.label}>Store hours</h3>
      {changes.length > 0 && (
        <LiquidGlass
          className={styles.notice}
          radius={24}
          scale={70}
          aberration={0}
          bevelDepth={22}
          frost={0}
          {...NOTICE_GLASS}
        >
          <aside
            className={styles.noticeBody}
            aria-labelledby="hours-changes-title"
          >
            <CalendarClock
              className={styles.noticeIcon}
              size={20}
              strokeWidth={1.4}
              aria-hidden="true"
            />
            <div>
              <h4 id="hours-changes-title">Schedule changes</h4>
              <ul>
                {changes.map((change) => (
                  <li key={change.start}>
                    <span>{formatChangeDates(change)}</span>
                    <Leader />
                    <span>
                      {typeof change.hours === "object"
                        ? `Open ${formatHours(change.hours)}`
                        : formatHours(change.hours)}
                    </span>
                    {change.note && (
                      <span className={styles.changeNote}>{change.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </LiquidGlass>
      )}
      <ul className={styles.week}>
        {rows.map((row) =>
          row.isToday && clock ? (
            <li key={row.name} className={styles.todayItem} aria-current="date">
              <TodayPill clock={clock} />
            </li>
          ) : (
            <li key={row.name} className={styles.row}>
              <DayName
                name={row.name}
                date={row.date}
                changed={Boolean(row.change)}
              />
              <Leader />
              <Hours hours={row.hours} />
            </li>
          )
        )}
      </ul>
      <p className={styles.note}>
        Need another time?{" "}
        <a className={styles.badge} href="tel:+16175472727">
          <Phone size={12} strokeWidth={1.8} aria-hidden="true" />
          Call
        </a>{" "}
        or{" "}
        <a className={styles.badge} href="mailto:info@qaudio.com">
          <Image src="/mail-icon.svg" alt="" width={13} height={13} />
          Email
        </a>{" "}
        and we’ll set up a visit. Phones are answered daily,{" "}
        <span className={styles.nowrap}>{PHONE_HOURS}</span>.
      </p>
    </div>
  )
}
