import type { ReactNode } from 'react'
import { joint } from './engine'

// The artwork from public/images/robot.svg and public/images/robot-set.svg,
// inlined and split into parts. (anime.js can't reach inside an <img>.) Shapes
// are copied as drawn; each part's pivot is the joint it turns about, in the
// robot's own coordinates. Parts nest so that the arms and head move with the
// torso, and the legs stay planted when the torso sways.

const GREY = '#8a8f98'

// Every set robot is drawn in a 200-wide cell; the original robot in 400 x 480.
const CELL = '0 0 200 235'

function Svg({ viewBox, children }: { viewBox: string; children: ReactNode }) {
  return (
    <svg viewBox={viewBox} className="block h-auto w-full overflow-visible" fill={GREY} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

// A drawn line (an arm, a leg, an antenna) rather than a filled shape.
const Line = ({ d, w }: { d: string; w: number }) => <path d={d} fill="none" stroke={GREY} strokeWidth={w} />

/** robot.svg: round head with two eyes, coil neck, noodle arms and boots. */
export function ClassicRig() {
  return (
    <Svg viewBox="0 0 400 480">
      <g data-part="flip" style={joint(200, 240)}>
        <g data-part="bob">
          <g data-part="sway" style={joint(200, 360)}>
            <g data-part="head" style={joint(200, 194)}>
              <g data-part="antenna" style={joint(200, 70)}>
                <Line d="M200 70 Q196 50 212 38" w={7} />
                <circle cx="214" cy="34" r="11" />
              </g>
              <rect x="102" y="112" width="22" height="34" rx="8" />
              <rect x="276" y="112" width="22" height="34" rx="8" />
              <path
                fillRule="evenodd"
                d="M158,70H242A40,40 0 0 1 282,110V154A40,40 0 0 1 242,194H158A40,40 0 0 1 118,154V110A40,40 0 0 1 158,70ZM141,128a24,24 0 1 0 48,0a24,24 0 1 0 -48,0ZM211,128a24,24 0 1 0 48,0a24,24 0 1 0 -48,0ZM186,162H214A6,6 0 0 1 220,168V168A6,6 0 0 1 214,174H186A6,6 0 0 1 180,168V168A6,6 0 0 1 186,162Z"
              />
              <g data-part="pupils">
                <circle cx="170" cy="122" r="11" />
                <circle cx="240" cy="122" r="11" />
              </g>
            </g>
            <rect x="178" y="196" width="44" height="8" rx="4" />
            <rect x="182" y="206" width="36" height="8" rx="4" />
            <rect x="178" y="216" width="44" height="8" rx="4" />
            <path
              fillRule="evenodd"
              d="M172,222H228A44,44 0 0 1 272,266V318A44,44 0 0 1 228,362H172A44,44 0 0 1 128,318V266A44,44 0 0 1 172,222ZM172,248H228A14,14 0 0 1 242,262V274A14,14 0 0 1 228,288H172A14,14 0 0 1 158,274V262A14,14 0 0 1 172,248ZM163,318a9,9 0 1 0 18,0a9,9 0 1 0 -18,0ZM191,318a9,9 0 1 0 18,0a9,9 0 1 0 -18,0ZM219,318a9,9 0 1 0 18,0a9,9 0 1 0 -18,0Z"
            />
            <g data-part="armL" style={joint(136, 250)}>
              <Line d="M136 250 Q92 270 90 322" w={14} />
              <circle cx="90" cy="332" r="17" />
            </g>
            <g data-part="armR" style={joint(264, 250)}>
              <Line d="M264 250 Q312 236 320 184" w={14} />
              <circle cx="321" cy="172" r="17" />
            </g>
          </g>
          <g data-part="legL" style={joint(172, 360)}>
            <Line d="M172 360 V418" w={16} />
            <path d="M144 440 Q144 412 172 412 Q196 412 196 440 Z" />
          </g>
          <g data-part="legR" style={joint(228, 360)}>
            <Line d="M228 360 V418" w={16} />
            <path d="M204 440 Q204 412 228 412 Q256 412 256 440 Z" />
          </g>
        </g>
      </g>
    </Svg>
  )
}

/** Set robot 1: the cyclops, a ring head around one big eye. */
export function CyclopsRig() {
  return (
    <Svg viewBox={CELL}>
      <g data-part="bob">
        <g data-part="sway" style={joint(100, 188)}>
          <g data-part="head" style={joint(100, 112)}>
            <g data-part="antenna" style={joint(100, 40)}>
              <Line d="M100 40 V22" w={6} />
              <circle cx="100" cy="18" r="8" />
            </g>
            <path fillRule="evenodd" d="M62,75a38,38 0 1 0 76,0a38,38 0 1 0 -76,0ZM80,75a20,20 0 1 0 40,0a20,20 0 1 0 -40,0Z" />
            <g data-part="pupils">
              <circle cx="104" cy="71" r="9" />
            </g>
          </g>
          <rect x="92" y="112" width="16" height="12" rx="3" />
          <path
            fillRule="evenodd"
            d="M88,120H112A22,22 0 0 1 134,142V168A22,22 0 0 1 112,190H88A22,22 0 0 1 66,168V142A22,22 0 0 1 88,120ZM89,138H111A5,5 0 0 1 116,143V143A5,5 0 0 1 111,148H89A5,5 0 0 1 84,143V143A5,5 0 0 1 89,138ZM89,156H111A5,5 0 0 1 116,161V161A5,5 0 0 1 111,166H89A5,5 0 0 1 84,161V161A5,5 0 0 1 89,156Z"
          />
          <g data-part="armL" style={joint(68, 135)}>
            <Line d="M68 135 Q44 150 46 178" w={10} />
            <circle cx="46" cy="184" r="10" />
          </g>
          <g data-part="armR" style={joint(132, 135)}>
            <Line d="M132 135 Q156 150 154 178" w={10} />
            <circle cx="154" cy="184" r="10" />
          </g>
        </g>
        <g data-part="legL" style={joint(86, 188)}>
          <Line d="M86 188 V214" w={12} />
          <rect x="70" y="210" width="30" height="15" rx="7" />
        </g>
        <g data-part="legR" style={joint(114, 188)}>
          <Line d="M114 188 V214" w={12} />
          <rect x="100" y="210" width="30" height="15" rx="7" />
        </g>
      </g>
    </Svg>
  )
}

/** Set robot 2: the box bot, twin antennas, hands on hips, rolling on a tread base. */
export function BoxbotRig() {
  return (
    <Svg viewBox={CELL}>
      <g data-part="bob">
        <g data-part="base" style={joint(100, 205)}>
          <path
            fillRule="evenodd"
            d="M68,184H132A20,20 0 0 1 152,204V205A20,20 0 0 1 132,225H68A20,20 0 0 1 48,205V204A20,20 0 0 1 68,184ZM60,204a10,10 0 1 0 20,0a10,10 0 1 0 -20,0ZM90,204a10,10 0 1 0 20,0a10,10 0 1 0 -20,0ZM120,204a10,10 0 1 0 20,0a10,10 0 1 0 -20,0Z"
          />
        </g>
        <g data-part="sway" style={joint(100, 186)}>
          <g data-part="head" style={joint(100, 102)}>
            <g data-part="antL" style={joint(78, 50)}>
              <Line d="M78 50 L70 26" w={5} />
              <circle cx="69" cy="22" r="6" />
            </g>
            <g data-part="antR" style={joint(122, 50)}>
              <Line d="M122 50 L130 26" w={5} />
              <circle cx="131" cy="22" r="6" />
            </g>
            <path
              fillRule="evenodd"
              d="M80,46H120A14,14 0 0 1 134,60V88A14,14 0 0 1 120,102H80A14,14 0 0 1 66,88V60A14,14 0 0 1 80,46ZM82,60H90A4,4 0 0 1 94,64V72A4,4 0 0 1 90,76H82A4,4 0 0 1 78,72V64A4,4 0 0 1 82,60ZM110,60H118A4,4 0 0 1 122,64V72A4,4 0 0 1 118,76H110A4,4 0 0 1 106,72V64A4,4 0 0 1 110,60ZM89,86H111A3,3 0 0 1 114,89V89A3,3 0 0 1 111,92H89A3,3 0 0 1 86,89V89A3,3 0 0 1 89,86Z"
            />
          </g>
          <rect x="92" y="102" width="16" height="12" />
          <path
            fillRule="evenodd"
            d="M78,112H122A16,16 0 0 1 138,128V158A16,16 0 0 1 122,174H78A16,16 0 0 1 62,158V128A16,16 0 0 1 78,112ZM86,143a14,14 0 1 0 28,0a14,14 0 1 0 -28,0Z"
          />
          <g data-part="armL" style={joint(64, 128)}>
            <Line d="M64 128 L36 150 L50 166" w={9} />
            <circle cx="52" cy="170" r="8" />
          </g>
          <g data-part="armR" style={joint(136, 128)}>
            <Line d="M136 128 L164 150 L150 166" w={9} />
            <circle cx="148" cy="170" r="8" />
          </g>
          <rect x="92" y="174" width="16" height="12" />
        </g>
      </g>
    </Svg>
  )
}

/** Set robot 3: the bean, one visor and a thruster instead of legs. */
export function RocketRig() {
  return (
    <Svg viewBox={CELL}>
      <g data-part="bob">
        <g data-part="tilt" style={joint(100, 120)}>
          <g data-part="antenna" style={joint(100, 40)}>
            <Line d="M100 40 Q108 26 100 14" w={5} />
            <circle cx="100" cy="12" r="6" />
          </g>
          <path
            fillRule="evenodd"
            d="M100 40 C140 40 150 110 146 140 C142 172 122 186 100 186 C78 186 58 172 54 140 C50 110 60 40 100 40 ZM88,72H112A16,16 0 0 1 128,88V90A16,16 0 0 1 112,106H88A16,16 0 0 1 72,90V88A16,16 0 0 1 88,72Z"
          />
          <g data-part="eyes" style={joint(100, 89)}>
            <circle cx="88" cy="89" r="7" />
            <circle cx="112" cy="89" r="7" />
          </g>
          <g data-part="armL" style={joint(54, 128)}>
            <Line d="M54 128 Q34 118 30 98" w={8} />
            <circle cx="29" cy="92" r="8" />
          </g>
          <g data-part="armR" style={joint(146, 128)}>
            <Line d="M146 128 Q166 138 168 156" w={8} />
            <circle cx="168" cy="162" r="8" />
          </g>
          <rect x="84" y="184" width="32" height="10" rx="3" />
          <g data-part="flame" style={joint(100, 198)}>
            <path d="M88 198 Q100 238 112 198 Z" opacity="0.5" />
            <path d="M93 198 Q100 222 107 198 Z" />
          </g>
        </g>
      </g>
    </Svg>
  )
}

/** Set robot 4: a TV for a head, a heart on its chest and one arm raised. */
export function HeartbotRig() {
  return (
    <Svg viewBox={CELL}>
      <g data-part="bob">
        <g data-part="sway" style={joint(100, 184)}>
          <g data-part="head" style={joint(100, 112)}>
            <Line d="M92 48 L74 20" w={5} />
            <Line d="M108 48 L126 20" w={5} />
            <circle cx="73" cy="18" r="6" />
            <circle cx="127" cy="18" r="6" />
            <path
              fillRule="evenodd"
              d="M70,46H130A12,12 0 0 1 142,58V100A12,12 0 0 1 130,112H70A12,12 0 0 1 58,100V58A12,12 0 0 1 70,46ZM76,54H108A10,10 0 0 1 118,64V94A10,10 0 0 1 108,104H76A10,10 0 0 1 66,94V64A10,10 0 0 1 76,54ZM125,68a5,5 0 1 0 10,0a5,5 0 1 0 -10,0ZM125,86a5,5 0 1 0 10,0a5,5 0 1 0 -10,0Z"
            />
            <g data-part="eyes" style={joint(92, 74)}>
              <circle cx="82" cy="74" r="5" />
              <circle cx="102" cy="74" r="5" />
            </g>
            <Line d="M84 88 Q92 96 100 88" w={4} />
          </g>
          <rect x="90" y="112" width="20" height="10" />
          <g data-part="chest" style={joint(100, 152)}>
            <path
              fillRule="evenodd"
              d="M80,120H120A10,10 0 0 1 130,130V174A10,10 0 0 1 120,184H80A10,10 0 0 1 70,174V130A10,10 0 0 1 80,120ZM100 166 C88 157 84 149 89 143 C93 139 98 140 100 145 C102 140 107 139 111 143 C116 149 112 157 100 166 Z"
            />
          </g>
          <g data-part="armL" style={joint(72, 132)}>
            <Line d="M72 132 L48 158" w={9} />
            <circle cx="45" cy="163" r="9" />
          </g>
          <g data-part="armR" style={joint(128, 132)}>
            <Line d="M128 132 L152 106" w={9} />
            <circle cx="155" cy="101" r="9" />
          </g>
        </g>
        <g data-part="legL" style={joint(86, 182)}>
          <Line d="M86 182 V212" w={10} />
          <rect x="72" y="210" width="28" height="15" rx="4" />
        </g>
        <g data-part="legR" style={joint(114, 182)}>
          <Line d="M114 182 V212" w={10} />
          <rect x="100" y="210" width="28" height="15" rx="4" />
        </g>
      </g>
    </Svg>
  )
}

/** Set robot 5: a canister with big eyes, cup hands and stubby legs. */
export function CanisterRig() {
  return (
    <Svg viewBox={CELL}>
      <g data-part="bob">
        <g data-part="spin" style={joint(100, 120)}>
          <g data-part="sway" style={joint(100, 198)}>
            <g data-part="antenna" style={joint(100, 44)}>
              <Line d="M100 44 V24" w={5} />
              <rect x="92" y="14" width="16" height="10" rx="3" />
            </g>
            <path
              fillRule="evenodd"
              d="M62 56 A38 12 0 0 1 138 56 V190 A38 12 0 0 1 62 190 ZM73,82a11,11 0 1 0 22,0a11,11 0 1 0 -22,0ZM105,82a11,11 0 1 0 22,0a11,11 0 1 0 -22,0ZM88,112H112A8,8 0 0 1 120,120V144A8,8 0 0 1 112,152H88A8,8 0 0 1 80,144V120A8,8 0 0 1 88,112Z"
            />
            <g data-part="eyes" style={joint(102, 84)}>
              <circle cx="86" cy="84" r="5" />
              <circle cx="118" cy="84" r="5" />
            </g>
            <rect x="88" y="120" width="24" height="5" rx="2" />
            <rect x="88" y="130" width="16" height="5" rx="2" />
            <rect x="88" y="140" width="20" height="5" rx="2" />
            <g data-part="armL" style={joint(64, 120)}>
              <Line d="M64 120 Q40 124 38 150" w={9} />
              <path d="M30 150 h16 v14 a8 8 0 0 1 -16 0 Z" />
            </g>
            <g data-part="armR" style={joint(136, 120)}>
              <Line d="M136 120 Q160 124 162 150" w={9} />
              <path d="M154 150 h16 v14 a8 8 0 0 1 -16 0 Z" />
            </g>
          </g>
          <g data-part="legL" style={joint(81, 198)}>
            <rect x="70" y="198" width="22" height="27" rx="11" />
          </g>
          <g data-part="legR" style={joint(119, 198)}>
            <rect x="108" y="198" width="22" height="27" rx="11" />
          </g>
        </g>
      </g>
    </Svg>
  )
}

/** Set robot 6: the heavy one, blocky shoulders and a glowing core. */
export function BruteRig() {
  return (
    <Svg viewBox={CELL}>
      <g data-part="bob">
        <g data-part="sway" style={joint(100, 166)}>
          <g data-part="head" style={joint(100, 72)}>
            <path
              fillRule="evenodd"
              d="M90,30H110A10,10 0 0 1 120,40V54A10,10 0 0 1 110,64H90A10,10 0 0 1 80,54V40A10,10 0 0 1 90,30ZM92,40H108A4,4 0 0 1 112,44V44A4,4 0 0 1 108,48H92A4,4 0 0 1 88,44V44A4,4 0 0 1 92,40Z"
            />
          </g>
          <rect x="94" y="64" width="12" height="8" />
          <path fillRule="evenodd" d="M44 72 H156 L140 150 H60 ZM84,104a16,16 0 1 0 32,0a16,16 0 1 0 -32,0Z" />
          <g data-part="core" style={joint(100, 104)}>
            <circle cx="100" cy="104" r="7" />
          </g>
          <rect x="28" y="70" width="30" height="30" rx="10" />
          <rect x="142" y="70" width="30" height="30" rx="10" />
          <g data-part="armL" style={joint(43, 88)}>
            <Line d="M40 100 V140" w={12} />
            <rect x="24" y="138" width="32" height="28" rx="8" />
          </g>
          <g data-part="armR" style={joint(157, 88)}>
            <Line d="M160 100 V140" w={12} />
            <rect x="144" y="138" width="32" height="28" rx="8" />
          </g>
          <rect x="66" y="150" width="68" height="16" rx="4" />
        </g>
        <g data-part="legL" style={joint(80, 166)}>
          <rect x="68" y="166" width="24" height="44" rx="6" />
          <rect x="58" y="206" width="40" height="19" rx="6" />
        </g>
        <g data-part="legR" style={joint(120, 166)}>
          <rect x="108" y="166" width="24" height="44" rx="6" />
          <rect x="102" y="206" width="40" height="19" rx="6" />
        </g>
      </g>
    </Svg>
  )
}
