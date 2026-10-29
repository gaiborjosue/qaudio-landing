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
      aria-label="A black and silver record player viewed from the front, at platter level"
    >
      <svg viewBox="0 0 1000 300" fill="none" aria-hidden="true">
        <defs>
          <linearGradient
            id={`${id}-body`}
            x1="500"
            y1="138"
            x2="500"
            y2="222"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#373737" />
            <stop offset=".13" stopColor="#171717" />
            <stop offset=".65" stopColor="#111" />
            <stop offset="1" stopColor="#252525" />
          </linearGradient>
          <linearGradient
            id={`${id}-metal`}
            x1="400"
            y1="96"
            x2="400"
            y2="124"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#f8f8f8" />
            <stop offset=".2" stopColor="#929292" />
            <stop offset=".4" stopColor="#e3e3e3" />
            <stop offset=".65" stopColor="#646464" />
            <stop offset=".85" stopColor="#bcbcbc" />
            <stop offset="1" stopColor="#494949" />
          </linearGradient>
          <linearGradient
            id={`${id}-trim`}
            x1="45"
            y1="0"
            x2="955"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#777" />
            <stop offset=".18" stopColor="#e3e3e3" />
            <stop offset=".45" stopColor="#f9f9f9" />
            <stop offset=".7" stopColor="#aaa" />
            <stop offset="1" stopColor="#5b5b5b" />
          </linearGradient>
          <linearGradient
            id={`${id}-feet`}
            x1="0"
            y1="219"
            x2="0"
            y2="249"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#080808" />
            <stop offset=".2" stopColor="#3c3c3c" />
            <stop offset=".45" stopColor="#181818" />
            <stop offset="1" stopColor="#070707" />
          </linearGradient>
          <radialGradient id={`${id}-shadow`}>
            <stop stopColor="#000" stopOpacity=".2" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient
            id={`${id}-knob`}
            x1="852"
            y1="163"
            x2="884"
            y2="193"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#eee" />
            <stop offset=".4" stopColor="#858585" />
            <stop offset=".6" stopColor="#dedede" />
            <stop offset="1" stopColor="#545454" />
          </linearGradient>
        </defs>

        <ellipse
          cx="500"
          cy="252"
          rx="487"
          ry="30"
          fill={`url(#${id}-shadow)`}
        />
        <rect
          x="119"
          y="216"
          width="95"
          height="31"
          rx="10"
          fill={`url(#${id}-feet)`}
        />
        <rect
          x="786"
          y="216"
          width="95"
          height="31"
          rx="10"
          fill={`url(#${id}-feet)`}
        />
        <path d="M126 236H207M793 236H874" stroke="#484848" />

        <path d="M45 140L67 119H933L955 140Z" fill="#232323" />
        <path d="M67 119H933" stroke="#4b4b4b" />
        <rect
          x="45"
          y="139"
          width="910"
          height="83"
          rx="8"
          fill={`url(#${id}-body)`}
        />
        <path d="M53 140H947" stroke={`url(#${id}-trim)`} strokeWidth="3" />
        <path d="M53 145H947" stroke="#070707" />
        <path d="M53 213H947" stroke="#444" />
        <path d="M61 219H939" stroke="#0a0a0a" strokeWidth="3" />

        <path
          d="M140 101V116C140 124 263 131 415 131S690 124 690 116V101Z"
          fill={`url(#${id}-metal)`}
        />
        <path
          d="M145 114C208 124 623 124 685 114"
          stroke="#f4f4f4"
          strokeWidth="1.5"
        />
        <path d="M145 119C208 129 623 129 685 119" stroke="#363636" />
        <ellipse
          cx="415"
          cy="101"
          rx="275"
          ry="16"
          fill="#272727"
          stroke="#9a9a9a"
        />
        <ellipse
          cx="415"
          cy="99"
          rx="268"
          ry="13"
          fill="#101010"
          stroke="#363636"
        />
        {variant === "static" && (
          <>
            <ellipse
              cx="415"
              cy="97"
              rx="265"
              ry="14"
              fill="#080808"
              stroke="#434343"
            />
            <ellipse cx="415" cy="97" rx="83" ry="4" fill="#e8e8e8" />
          </>
        )}
        <path d="M412 98V86Q415 82 418 86V98" fill={`url(#${id}-trim)`} />

        <ellipse
          cx="820"
          cy="119"
          rx="36"
          ry="10"
          fill="#070707"
          stroke="#555"
        />
        <path
          d="M799 68H841V115C841 122 799 122 799 115Z"
          fill={`url(#${id}-trim)`}
        />
        <rect
          x="856"
          y="64"
          width="56"
          height="24"
          rx="7"
          fill="#1b1b1b"
          stroke="#5e5e5e"
        />
        <path
          d="M861 67V85M866 66V86M871 66V86M876 66V86M881 66V86M886 66V86M891 66V86M896 66V86M901 66V86M906 67V85"
          stroke="#535353"
        />
        <path d="M819 76L862 76" stroke="#868686" strokeWidth="8" />
        {variant === "static" && (
          <>
            <Tonearm />
            <PivotCap />
          </>
        )}

        <text
          x="89"
          y="184"
          fill="#dfdfdf"
          fontFamily="var(--font-ui), Arial, sans-serif"
          fontSize="18"
          letterSpacing="5"
        >
          Q AUDIO
        </text>
        <path d="M89 195H207" stroke="#444" />
        <circle cx="871" cy="179" r="17" fill={`url(#${id}-knob)`} />
        <circle
          cx="871"
          cy="179"
          r="12.5"
          fill="#222"
          stroke="#bcbcbc"
          strokeWidth=".6"
        />
        <path d="M871 168V173" stroke="#e4e4e4" strokeWidth="1.5" />
        <circle cx="835" cy="179" r="2" fill="#eee" />
        <rect
          x="753"
          y="171"
          width="37"
          height="16"
          rx="2"
          fill="#0c0c0c"
          stroke="#606060"
        />
        <path d="M772 173V185" stroke="#999" />
        <text
          x="756"
          y="163"
          fill="#929292"
          fontFamily="var(--font-ui), Arial, sans-serif"
          fontSize="7"
          letterSpacing="1"
        >
          33⅓ / 45
        </text>
      </svg>
    </div>
  )
}

function Tonearm() {
  return (
    <g className="turntable-arm">
      <path
        d="M820 69L767 56Q752 52 740 59L623 99"
        stroke="#191919"
        strokeWidth="11"
        strokeLinecap="round"
      />
      <path
        d="M820 66L767 53Q752 49 740 56L623 96"
        stroke="#aaa"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M820 64L767 51Q752 47 740 54L623 94"
        stroke="#f0f0f0"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M603 88L631 79L646 90L614 102Z" fill="#181818" stroke="#666" />
      <path d="M608 88L632 82" stroke="#d4d4d4" />
      <path d="M615 100V106" stroke="#999" strokeWidth="2" />
      <path d="M612 107H618" stroke="#080808" />
    </g>
  )
}

function PivotCap() {
  return (
    <ellipse cx="820" cy="68" rx="21" ry="8" fill="#323232" stroke="#919191" />
  )
}

/** A separate layer lets the needle lower onto the record's upper face. */
export function RecordPlayerArm() {
  return (
    <div
      className="record-player record-player--arm-overlay"
      aria-hidden="true"
    >
      <svg viewBox="0 0 1000 300" fill="none">
        <Tonearm />
        <PivotCap />
      </svg>
    </div>
  )
}
