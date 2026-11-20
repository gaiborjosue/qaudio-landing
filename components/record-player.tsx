import {
  RECORD_PLANE,
  TONEARM_PIVOT,
  TONEARM_TIPS,
  TURNTABLE_FRAME,
  type TonearmTip,
} from "@/lib/turntable-geometry"

const viewBox = `0 0 ${TURNTABLE_FRAME.width} ${TURNTABLE_FRAME.height}`
const platter = {
  x: RECORD_PLANE.x,
  y: RECORD_PLANE.y + 4,
  rx: 265,
  ry: 265 * RECORD_PLANE.foreshortening,
}

function platterFrontEdge(offset: number) {
  const { x, y, rx, ry } = platter
  return `M${x - rx} ${y + offset}A${rx} ${ry} 0 0 0 ${x + rx} ${y + offset}`
}

export function RecordPlayer({
  variant = "animated",
}: {
  variant?: "animated" | "static"
}) {
  const id = `turntable-${variant}`
  return (
    <div
      className={`record-player record-player--${variant}`}
      role="img"
      aria-label="A black and silver record player with a straight tonearm, viewed from above and to the right"
    >
      <svg viewBox={viewBox} fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-deck`} x1="0" y1="0" x2=".28" y2="1">
            <stop stopColor="#4c4c4c" />
            <stop offset=".55" stopColor="#2e2e2e" />
            <stop offset="1" stopColor="#3b3b3b" />
          </linearGradient>
          <linearGradient id={`${id}-front`} x2="0" y2="1">
            <stop stopColor="#323232" />
            <stop offset=".65" stopColor="#242424" />
            <stop offset="1" stopColor="#171717" />
          </linearGradient>
          <linearGradient id={`${id}-side`} x2="1" y2=".6">
            <stop stopColor="#232323" />
            <stop offset="1" stopColor="#101010" />
          </linearGradient>
          <linearGradient id={`${id}-rim`} x1="0" x2="1" y2=".2">
            <stop stopColor="#7c7c7c" />
            <stop offset=".24" stopColor="#e6e6e6" />
            <stop offset=".56" stopColor="#d2d2d2" />
            <stop offset=".85" stopColor="#a8a8a8" />
            <stop offset="1" stopColor="#6f6f6f" />
          </linearGradient>
          <linearGradient id={`${id}-mat`} x2=".3" y2="1">
            <stop stopColor="#454545" />
            <stop offset=".6" stopColor="#2c2c2c" />
            <stop offset="1" stopColor="#1c1c1c" />
          </linearGradient>
          <linearGradient id={`${id}-feet`}>
            <stop stopColor="#111" />
            <stop offset=".27" stopColor="#383838" />
            <stop offset=".65" stopColor="#222" />
            <stop offset="1" stopColor="#0c0c0c" />
          </linearGradient>
          <linearGradient id={`${id}-steel`}>
            <stop stopColor="#707070" />
            <stop offset=".4" stopColor="#e6e6e6" />
            <stop offset="1" stopColor="#5e5e5e" />
          </linearGradient>
          <radialGradient id={`${id}-shadow`}>
            <stop stopColor="#000" stopOpacity=".24" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse
          cx="507"
          cy="221"
          rx="453"
          ry="58"
          transform="rotate(4 507 221)"
          fill={`url(#${id}-shadow)`}
        />
        <Foot x={137} y={193} fill={`url(#${id}-feet)`} />
        <Foot x={760} y={230} fill={`url(#${id}-feet)`} />
        <Foot x={909} y={114} fill={`url(#${id}-feet)`} />

        {/* The front and right edges are two faces of the same thin plinth. */}
        <path
          d="M50 177L824 223V245Q820 246 811 246L61 201Q50 200 50 192Z"
          fill={`url(#${id}-front)`}
        />
        <path
          d="M824 223L963 89V107Q963 111 959 115L832 241Q828 245 824 245Z"
          fill={`url(#${id}-side)`}
        />
        <path
          d="M50 177Q49 174 54 170L184 46Q188 42 196 43L955 86Q967 87 961 94L831 219Q826 224 817 223L58 179Q51 179 50 177Z"
          fill={`url(#${id}-deck)`}
          stroke="#5b5b5b"
        />
        <path d="M55 179L817 224Q826 225 832 219L958 97" stroke="#8b8b8b" />
        <path d="M58 198L814 243" stroke="#191919" />
        <text
          x="89"
          y="195"
          transform="rotate(3.4 89 195)"
          fill="#dbdbdb"
          fontFamily="var(--font-ui), Arial, sans-serif"
          fontSize="11"
          letterSpacing="2.5"
        >
          Q AUDIO
        </text>

        <ellipse
          cx={platter.x + 4}
          cy={platter.y + 17}
          rx={platter.rx + 13}
          ry={platter.ry + 2}
          fill={`url(#${id}-shadow)`}
        />
        <path
          d={`${platterFrontEdge(14)}v-14H${platter.x - platter.rx}Z`}
          fill={`url(#${id}-rim)`}
        />
        <path d={platterFrontEdge(11)} stroke="#4c4c4c" strokeWidth="2" />
        <path d={platterFrontEdge(5)} stroke="#eee" strokeOpacity=".7" />
        <ellipse
          cx={platter.x}
          cy={platter.y}
          rx={platter.rx}
          ry={platter.ry}
          fill={`url(#${id}-mat)`}
          stroke="#898989"
        />
        <ellipse
          cx={platter.x}
          cy={platter.y}
          rx={platter.rx - 5}
          ry={(platter.rx - 5) * RECORD_PLANE.foreshortening}
          stroke="#555"
        />
        {variant === "static" && <StaticRecord />}
        <path
          d="M410 113V99C410 95 418 95 418 99V113Z"
          fill={`url(#${id}-steel)`}
        />

        {/* The speed selector's mounting plate follows the deck's edges. */}
        <rect
          width="63"
          height="17"
          rx="2"
          transform="matrix(1 .06 -1.04 1 100 157)"
          fill="#171717"
          stroke="#646464"
        />
        <path d="M99 164V157H123V164C123 170 99 170 99 164Z" fill="#1a1a1a" />
        <ellipse
          cx="111"
          cy="157"
          rx="12"
          ry="4"
          fill="#4b4b4b"
          stroke="#717171"
        />
        <path d="M108 157L114 155" stroke="#ddd" strokeWidth="1.2" />
        <text
          x="126"
          y="168"
          transform="rotate(3.4 126 168)"
          fill="#bdbdbd"
          fontFamily="var(--font-ui), Arial, sans-serif"
          fontSize="7"
        >
          33 / 45
        </text>

        {/* Fixed bearing and arm rest sit behind the moving tube. */}
        <ellipse
          cx="834"
          cy="106"
          rx="39"
          ry="12"
          fill="#161616"
          stroke="#606060"
        />
        <path d="M814 66H854V102C854 112 814 112 814 102Z" fill="#1c1c1c" />
        <path
          d="M816 81C821 87 846 87 852 81M816 97C821 103 846 103 852 97"
          stroke="#545454"
        />
        <ellipse
          cx="784"
          cy="144"
          rx="13"
          ry="5"
          fill="#181818"
          stroke="#5f5f5f"
        />
        <path
          d="M784 110V142"
          stroke="#171717"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M778 107Q782 117 791 111"
          stroke="#6d6d6d"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M854 102L872 97L886 90"
          stroke="#aaa"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {variant === "static" && (
          <Tonearm id={id} tip={TONEARM_TIPS.outerGroove} />
        )}
      </svg>
    </div>
  )
}

function Foot({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-32 0H32V22C32 39-32 39-32 22Z" fill={fill} />
      <path d="M-30 23C-26 33 26 33 30 23" stroke="#4a4a4a" />
      <path d="M-24 29C-15 35 15 35 24 29" stroke="#111" strokeWidth="2" />
    </g>
  )
}

function StaticRecord() {
  const { x, y, radius, foreshortening } = RECORD_PLANE
  return (
    <g transform={`translate(${x} ${y}) scale(1 ${foreshortening})`}>
      <circle r={radius} fill="#101010" stroke="#515151" strokeWidth="3" />
      {[246, 230, 206, 168, 116].map((r) => (
        <circle key={r} r={r} stroke="#303030" strokeWidth="3" />
      ))}
      <circle r={radius * 0.32} fill="#e8e8e8" />
    </g>
  )
}

function Tonearm({ id, tip }: { id: string; tip: TonearmTip }) {
  const tubeId = `${id}-tube`
  const { x, y } = TONEARM_PIVOT
  return (
    <>
      <defs>
        <line
          id={tubeId}
          className="turntable-tube"
          x1={x}
          y1={y}
          x2={tip.x}
          y2={tip.y}
        />
      </defs>
      <path
        d="M834 62L859 49"
        stroke="#222"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M845 49L860 42Q864 40 869 44L875 53Q877 58 872 60L855 67Z"
        fill="#9a9a9a"
        stroke="#444"
      />
      <ellipse
        cx="851"
        cy="58"
        rx="8"
        ry="10"
        transform="rotate(-32 851 58)"
        fill="#343434"
        stroke="#aaa"
      />
      <use
        href={`#${tubeId}`}
        stroke="#131313"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <use
        href={`#${tubeId}`}
        y="-1.5"
        stroke="#424242"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <use
        href={`#${tubeId}`}
        y="-3.5"
        stroke="#878787"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <g
        className="turntable-headshell"
        transform={`translate(${tip.x} ${tip.y})`}
      >
        <path d="M-12 1L8 1L5 9L-7 10Z" fill="#171717" stroke="#636363" />
        <path d="M-17-1L-8-6L12-5L16 0L1 4Z" fill="#272727" stroke="#737373" />
        <path d="M-12-1L-7-3M0 0L5-2" stroke="#bcbcbc" strokeLinecap="round" />
        <path
          d="M12-3L20-7Q24-8 27-6"
          stroke="#686868"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M3 9L0 12" stroke="#aaa" strokeLinecap="round" />
      </g>
      <path
        d="M814 58H854V70C854 81 814 81 814 70Z"
        fill="#252525"
        stroke="#525252"
      />
      <ellipse cx={x} cy="58" rx="20" ry="8" fill="#484848" stroke="#828282" />
      <path d="M820 56Q834 50 848 56" stroke="#9a9a9a" strokeOpacity=".65" />
    </>
  )
}

/** A separate layer puts the needle above the animated record. */
export function RecordPlayerArm() {
  return (
    <div
      className="record-player record-player--arm-overlay"
      aria-hidden="true"
    >
      <svg viewBox={viewBox} fill="none">
        <Tonearm id="turntable-overlay" tip={TONEARM_TIPS.rest} />
      </svg>
    </div>
  )
}
