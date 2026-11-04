"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { VoiceRecorder } from "@/lib/admin/voice-recorder"
import styles from "./admin.module.css"

export function useVoiceInput(enabled: boolean, resetKey: number) {
  const [recorder] = useState(() => new VoiceRecorder())
  const state = useSyncExternalStore(
    recorder.subscribe,
    recorder.getSnapshot,
    recorder.getServerSnapshot
  )
  useEffect(() => {
    if (!enabled) recorder.cancel()
    const onHidden = () => {
      if (document.visibilityState !== "visible") recorder.cancel()
    }
    document.addEventListener("visibilitychange", onHidden)
    window.addEventListener("pagehide", recorder.cancel)
    return () => {
      document.removeEventListener("visibilitychange", onHidden)
      window.removeEventListener("pagehide", recorder.cancel)
      recorder.cancel()
    }
  }, [enabled, recorder, resetKey])
  return {
    ...state,
    start: recorder.start,
    stop: recorder.stop,
    cancel: recorder.cancel,
  }
}

const BAR_WIDTH = 2
const BAR_STEP = 3.5
const BAR_INTERVAL_MS = 50
const HISTORY_LIMIT = 2048

/** A scrolling history of microphone loudness, drawn without per-frame React updates. */
export function VoiceWaveform({
  stream,
  phase,
  seconds,
}: {
  stream: MediaStream | null
  phase: "requesting" | "recording" | "transcribing"
  seconds: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // Preserve both the history and its fractional scroll after Stop.
  const waveform = useRef({ bars: [] as number[], offset: 0, pending: 0 })

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext("2d")
    if (!element || !context) return
    let width = 0
    let height = 0
    let frame = 0
    let audio: AudioContext | undefined
    let source: MediaStreamAudioSourceNode | undefined
    let analyser: AnalyserNode | undefined
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")

    const draw = () => {
      if (!width || !height) return
      context.clearRect(0, 0, width, height)
      const { bars, offset, pending } = waveform.current
      const count = Math.ceil(width / BAR_STEP) + 1
      // The newest completed sample enters at the right; older samples move
      // left by a fixed distance, independent of canvas width or frame rate.
      for (let index = -1; index < count; index++) {
        const level = index === -1 ? pending : bars[bars.length - 1 - index]
        const x = width - BAR_WIDTH - index * BAR_STEP - offset
        const barHeight = Math.max(2, (level ?? 0) * (height - 8))
        context.fillStyle = level === undefined ? "#d5d5d5" : "#555"
        context.beginPath()
        context.roundRect(
          x,
          (height - barHeight) / 2,
          BAR_WIDTH,
          barHeight,
          BAR_WIDTH / 2
        )
        context.fill()
      }
    }
    const resize = () => {
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      width = rect.width
      height = rect.height
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      element.width = Math.round(width * scale)
      element.height = Math.round(height * scale)
      context.setTransform(scale, 0, 0, scale, 0, 0)
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()

    if (stream && phase === "recording") {
      try {
        audio = new AudioContext()
        source = audio.createMediaStreamSource(stream)
        analyser = audio.createAnalyser()
        analyser.fftSize = 1024
        source.connect(analyser)
        void audio.resume().catch(() => {})
      } catch {
        // Recording still works if this browser cannot draw a live waveform.
      }
    }
    const samples = new Float32Array(1024)
    let lastFrame: number | undefined
    let elapsed = 0
    const animate = (now: number) => {
      if (!analyser || motion.matches) return
      analyser.getFloatTimeDomainData(samples)
      let energy = 0
      for (const sample of samples) energy += sample * sample
      const rms = Math.sqrt(energy / samples.length)
      // Lift quiet speech while keeping silence as a fine baseline.
      const level = Math.min(1, Math.sqrt(Math.max(0, rms - 0.004)) * 3)
      const history = waveform.current
      history.pending = Math.max(history.pending, level)
      // Bound a delayed frame so resuming a stalled browser doesn't create
      // a long run of duplicate samples.
      elapsed += lastFrame === undefined ? 0 : Math.min(now - lastFrame, 100)
      lastFrame = now
      while (elapsed >= BAR_INTERVAL_MS) {
        history.bars.push(history.pending)
        if (history.bars.length > HISTORY_LIMIT) history.bars.shift()
        history.pending = level
        elapsed -= BAR_INTERVAL_MS
      }
      history.offset = (elapsed / BAR_INTERVAL_MS) * BAR_STEP
      draw()
      frame = requestAnimationFrame(animate)
    }
    const onMotion = () => {
      cancelAnimationFrame(frame)
      lastFrame = undefined
      if (!motion.matches) frame = requestAnimationFrame(animate)
    }
    motion.addEventListener("change", onMotion)
    if (!motion.matches) frame = requestAnimationFrame(animate)
    return () => {
      observer.disconnect()
      motion.removeEventListener("change", onMotion)
      cancelAnimationFrame(frame)
      source?.disconnect()
      if (audio && audio.state !== "closed") void audio.close().catch(() => {})
    }
  }, [stream, phase])

  return (
    <div className={styles.voiceWaveform} aria-hidden="true">
      <canvas ref={canvas} />
      <span className={styles.voiceTime}>
        {phase === "recording"
          ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
          : phase === "requesting"
            ? "Microphone…"
            : "Transcribing…"}
      </span>
    </div>
  )
}
