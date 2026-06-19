"use client";

// An original, cheeky cartoon steam engine — the "face" of the landing hero.
// Deliberately NOT any trademarked train character: our own chunky blue
// locomotive with a smiley smokebox face.
export function TrainMascot({
  size = 200,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Thomas the train mascot"
    >
      {/* steam puffs */}
      <g className="origin-center">
        <circle
          cx="100"
          cy="26"
          r="9"
          fill="#e8edf5"
          className="animate-[float_4s_ease-in-out_infinite]"
        />
        <circle
          cx="118"
          cy="16"
          r="6"
          fill="#e8edf5"
          className="animate-[float_3.4s_ease-in-out_infinite]"
        />
        <circle
          cx="84"
          cy="14"
          r="5"
          fill="#e8edf5"
          className="animate-[float_3.8s_ease-in-out_infinite]"
        />
      </g>

      {/* funnel */}
      <path
        d="M82 56 L86 40 L114 40 L118 56 Z"
        fill="#1f2a44"
        stroke="#0f1830"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect x="80" y="52" width="40" height="8" rx="4" fill="#2b3a5e" stroke="#0f1830" strokeWidth="3" />

      {/* dome */}
      <path d="M128 58 q10 -14 22 0 Z" fill="#facc15" stroke="#0f1830" strokeWidth="3" strokeLinejoin="round" />

      {/* boiler / face plate */}
      <rect x="34" y="58" width="132" height="108" rx="30" fill="#2f6fed" stroke="#0f1830" strokeWidth="4" />
      <circle cx="100" cy="116" r="46" fill="#cfe0ff" stroke="#0f1830" strokeWidth="4" />

      {/* rivets */}
      <g fill="#7aa2f0">
        <circle cx="100" cy="72" r="2.5" />
        <circle cx="128" cy="80" r="2.5" />
        <circle cx="142" cy="104" r="2.5" />
        <circle cx="142" cy="130" r="2.5" />
        <circle cx="128" cy="152" r="2.5" />
        <circle cx="72" cy="80" r="2.5" />
        <circle cx="58" cy="104" r="2.5" />
        <circle cx="58" cy="130" r="2.5" />
        <circle cx="72" cy="152" r="2.5" />
      </g>

      {/* lamp */}
      <circle cx="100" cy="78" r="7" fill="#fde68a" stroke="#0f1830" strokeWidth="3" />

      {/* eyes */}
      <g>
        <circle cx="84" cy="110" r="12" fill="#ffffff" stroke="#0f1830" strokeWidth="3" />
        <circle cx="116" cy="110" r="12" fill="#ffffff" stroke="#0f1830" strokeWidth="3" />
        <circle
          cx="86"
          cy="112"
          r="5"
          fill="#0f1830"
          className="animate-[blink_4s_ease-in-out_infinite]"
        />
        <circle
          cx="114"
          cy="112"
          r="5"
          fill="#0f1830"
          className="animate-[blink_4s_ease-in-out_infinite]"
        />
        <circle cx="88" cy="109" r="1.6" fill="#ffffff" />
        <circle cx="116" cy="109" r="1.6" fill="#ffffff" />
      </g>

      {/* cheeks */}
      <circle cx="70" cy="128" r="6" fill="#f9a8d4" opacity="0.85" />
      <circle cx="130" cy="128" r="6" fill="#f9a8d4" opacity="0.85" />

      {/* smile */}
      <path
        d="M82 136 Q100 152 118 136"
        fill="none"
        stroke="#0f1830"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* buffer beam */}
      <rect x="40" y="166" width="120" height="14" rx="5" fill="#e23b3b" stroke="#0f1830" strokeWidth="4" />
      <circle cx="52" cy="173" r="6" fill="#d1d5db" stroke="#0f1830" strokeWidth="3" />
      <circle cx="148" cy="173" r="6" fill="#d1d5db" stroke="#0f1830" strokeWidth="3" />

      {/* wheels */}
      <circle cx="74" cy="184" r="12" fill="#1f2a44" stroke="#0f1830" strokeWidth="4" />
      <circle cx="126" cy="184" r="12" fill="#1f2a44" stroke="#0f1830" strokeWidth="4" />
      <circle cx="74" cy="184" r="4" fill="#e23b3b" />
      <circle cx="126" cy="184" r="4" fill="#e23b3b" />

      {/* a little brand sparkle */}
      <path
        d="M150 64 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z"
        fill="#a78bfa"
      />
    </svg>
  );
}
