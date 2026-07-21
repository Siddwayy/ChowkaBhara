/** Safe-cell marker: house icon (imported vector), kept upright. */
export function SafeHouse({
  color = "#000000",
  heavy = false,
  rotation = 0,
}: {
  color?: string;
  heavy?: boolean;
  /** Board rotation (deg) to cancel out so the house stays upright. */
  rotation?: number;
}) {
  return (
    <svg
      viewBox="0 0 491.51999 476.06668"
      className={heavy ? "h-[70%] w-[70%]" : "h-[60%] w-[60%]"}
      aria-hidden="true"
      style={rotation ? { transform: `rotate(${-rotation}deg)` } : undefined}
    >
      <g transform="matrix(0.13333333,0,0,-0.13333333,0,476.06667)">
        <path
          d="M 593.949,1856.02 1804.48,3019.88 c 21.72,20.9 56.02,20.66 77.45,-0.22 l 0.02,-0.02 0.35,-0.32 1197.81,-1163.52 0.36,-0.35 39.14,-35.04 c 12.28,-10.98 18.53,-26.19 18.53,-41.45 h 0.23 V 55.8594 C 3138.37,25.0117 3113.36,0 3082.51,0 h -857.79 v 1047.71 c 0,30.84 -25.01,55.86 -55.86,55.86 h -651.32 c -30.85,0 -55.86,-25.02 -55.86,-55.86 V 0 H 603.883 c -30.848,0 -55.86,25.0117 -55.86,55.8594 V 1788.27 c 0,17.29 7.856,32.74 20.184,42.98 l 25.742,24.77"
          fill={color}
          fillRule="evenodd"
        />
        <path
          d="M 1843.2,3305.1 188.418,1733.69 c -44.625,-42.37 -115.2735,-40.63 -157.6992,3.97 -42.4454,44.61 -40.69927,115.36 3.9648,157.77 L 1766.33,3539.84 c 43.08,40.9 110.68,40.87 153.74,0 L 3651.71,1895.43 c 44.67,-42.41 46.42,-113.16 3.97,-157.77 -42.43,-44.6 -113.07,-46.34 -157.7,-3.97 L 1843.2,3305.1"
          fill={color}
          fillRule="evenodd"
        />
        <path
          d="M 852.398,2487.59 632.793,2173.11 H 436.094 v 966.78 h 554.758 v -631.93 l -138.454,-20.37"
          fill={color}
          fillRule="evenodd"
        />
      </g>
    </svg>
  );
}
