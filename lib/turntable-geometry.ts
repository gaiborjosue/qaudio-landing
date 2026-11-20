export const TURNTABLE_FRAME = { width: 1000, height: 300 }

// The deck is drawn in orthographic projection. Match the record's tilt to it.
export const RECORD_PLANE = {
  x: 414,
  y: 109,
  radius: 254,
  foreshortening: 0.24,
}

export const TONEARM_PIVOT = { x: 834, y: 62 }

export type TonearmTip = { x: number; y: number }

function tonearmTip(angle: number, lift = 0): TonearmTip {
  const radians = (angle * Math.PI) / 180
  const length = 370
  return {
    x: Math.round(TONEARM_PIVOT.x + length * Math.cos(radians)),
    y: Math.round(
      TONEARM_PIVOT.y +
        length * Math.sin(radians) * RECORD_PLANE.foreshortening -
        lift
    ),
  }
}

export const TONEARM_TIPS = {
  rest: tonearmTip(104, 5),
  outerGroove: tonearmTip(128),
  innerGroove: tonearmTip(143),
  lifted: tonearmTip(143, 15),
}
