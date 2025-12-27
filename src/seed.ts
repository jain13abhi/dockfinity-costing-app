// seed.ts
import type { Item, AppSettings } from './types'
import { defaultSettings } from './db'

export function makeId(prefix = 'it'): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

export const HEAVY_BAG_225_135 = (poly: number, pipeW: number): Item['bagProfile'] => ({
  name: 'heavy',
  polybag: { sizeIn: poly, gauge: 225, ratePerKg: 135 },
  pipe: { widthIn: pipeW, lengthIn: 25, gauge: 225, pcsPerPipe: 8, ratePerKg: 135 }
})

export const LIGHT_BAG_100_150 = (poly: number, pipeW: number): Item['bagProfile'] => ({
  name: 'light',
  polybag: { sizeIn: poly, gauge: 100, ratePerKg: 150 },
  pipe: { widthIn: pipeW, lengthIn: 25, gauge: 100, pcsPerPipe: 8, ratePerKg: 150 }
})

// Belly/plain circle mappings you locked earlier:
const bellyMap: Record<7 | 8 | 9 | 10, { box: number; cover: number; poly: number; pipe: number }> = {
  7: { box: 7.0, cover: 5.5, poly: 8, pipe: 7 },
  8: { box: 7.75, cover: 6.0, poly: 9, pipe: 8 },
  9: { box: 8.5, cover: 6.5, poly: 10, pipe: 9 },
  10: { box: 9.25, cover: 7.25, poly: 11, pipe: 10 }
}

const plainMap: Record<7 | 8 | 9 | 10, { box: number; cover: number; poly: number; pipe: number }> = {
  7: { box: 6.75, cover: 5.5, poly: 8, pipe: 7 },
  8: { box: 7.5, cover: 6.0, poly: 9, pipe: 8 },
  9: { box: 8.25, cover: 6.5, poly: 10, pipe: 9 },
  10: { box: 9.0, cover: 7.25, poly: 11, pipe: 10 }
}

// Default induction setup:
// - enabled: true
// - ratePerKg: 10
// You can disable per-item by setting enabled=false or ratePerKg=0 in editor later (we will add UI next).
const DEFAULT_INDUCTION = { enabled: false, ratePerKg: 10 }

function bellyItem(size: 7 | 8 | 9 | 10, bag: 'heavy' | 'light'): Item {
  const m = bellyMap[size]
  return {
    id: makeId(),
    name: `Belly ${size}" (${bag})`,
    box: {
      label: 'box',
      circleSizeIn: m.box,
      thicknessMm: 0.26,
      press: { ratePerKg: 20, actualWastagePct: 4, jobWastagePct: 8, tutPct: 3, scrapReturn: { enabled: true, ratePerKg: 50 } },
      induction: { ...DEFAULT_INDUCTION }
    },
    cover: {
      label: 'cover',
      circleSizeIn: m.cover,
      thicknessMm: 0.26,
      press: { ratePerKg: 14, actualWastagePct: 0, jobWastagePct: 6, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } },
      induction: { ...DEFAULT_INDUCTION }
    },
    kunda: { enabled: false, weightG: 0, ratePerKg: 205 },
    bagProfile: bag === 'heavy' ? HEAVY_BAG_225_135(m.poly, m.pipe) : LIGHT_BAG_100_150(m.poly, m.pipe),
    polish: { ratePerKg: 72, wastagePct: 2, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } },
    packing: { packingRatePerKg: 10, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } }
  }
}

function plainItem(size: 7 | 8 | 9 | 10, bag: 'heavy' | 'light'): Item {
  const m = plainMap[size]
  return {
    id: makeId(),
    name: `Plain ${size}" (${bag})`,
    box: {
      label: 'box',
      circleSizeIn: m.box,
      thicknessMm: 0.26,
      press: { ratePerKg: 16, actualWastagePct: 4, jobWastagePct: 8, tutPct: 3, scrapReturn: { enabled: true, ratePerKg: 50 } },
      induction: { ...DEFAULT_INDUCTION }
    },
    cover: {
      label: 'cover',
      circleSizeIn: m.cover,
      thicknessMm: 0.26,
      press: { ratePerKg: 14, actualWastagePct: 0, jobWastagePct: 6, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } },
      induction: { ...DEFAULT_INDUCTION }
    },
    kunda: { enabled: false, weightG: 0, ratePerKg: 205 },
    bagProfile: bag === 'heavy' ? HEAVY_BAG_225_135(m.poly, m.pipe) : LIGHT_BAG_100_150(m.poly, m.pipe),
    polish: { ratePerKg: 72, wastagePct: 2, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } },
    packing: { packingRatePerKg: 10, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } }
  }
}

// 11" items
function item11(): Item {
  return {
    id: makeId(),
    name: `11" Items (0.26, light bag, kunda 5g)`,
    box: {
      label: 'box',
      circleSizeIn: 11,
      thicknessMm: 0.26,
      press: { ratePerKg: 20, actualWastagePct: 4, jobWastagePct: 8, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } },
      induction: { ...DEFAULT_INDUCTION }
    },
    cover: {
      label: 'cover',
      circleSizeIn: 8.5,
      thicknessMm: 0.26,
      press: { ratePerKg: 18, actualWastagePct: 3, jobWastagePct: 7, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } },
      induction: { ...DEFAULT_INDUCTION }
    },
    kunda: { enabled: true, weightG: 5, ratePerKg: 205 },
    bagProfile: {
      name: 'light',
      polybag: { sizeIn: 12, gauge: 100, ratePerKg: 150 },
      pipe: { widthIn: 12, lengthIn: 25, gauge: 100, pcsPerPipe: 6, ratePerKg: 150 }
    },
    polish: { ratePerKg: 72, wastagePct: 2, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } },
    packing: { packingRatePerKg: 15, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } }
  }
}

// Chennai pot 9/10 (two variants)
function chennaiPot(
  name: string,
  boxIn: number,
  coverIn: number,
  boxTh: number,
  coverTh: number,
  kundaG: number,
  kundaRate: number,
  bag: 'heavy' | 'light',
  bagPoly: number,
  bagPipe: number
): Item {
  return {
    id: makeId(),
    name,
    box: {
      label: 'box',
      circleSizeIn: boxIn,
      thicknessMm: boxTh,
      press: { ratePerKg: 20, actualWastagePct: 4, jobWastagePct: 8, tutPct: 3, scrapReturn: { enabled: true, ratePerKg: 50 } },
      induction: { ...DEFAULT_INDUCTION }
    },
    cover: {
      label: 'cover',
      circleSizeIn: coverIn,
      thicknessMm: coverTh,
      press: { ratePerKg: 18, actualWastagePct: 0, jobWastagePct: 0, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } },
      induction: { ...DEFAULT_INDUCTION }
    },
    kunda: { enabled: true, weightG: kundaG, ratePerKg: kundaRate },
    bagProfile: bag === 'heavy' ? HEAVY_BAG_225_135(bagPoly, bagPipe) : LIGHT_BAG_100_150(bagPoly, bagPipe),
    polish: { ratePerKg: 72, wastagePct: 2, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } },
    packing: { packingRatePerKg: 15, tutPct: 2, scrapReturn: { enabled: true, ratePerKg: 50 } }
  }
}

export const seedSettings: AppSettings = defaultSettings()

export const seedItems: Item[] = [
  bellyItem(7, 'heavy'), bellyItem(8, 'heavy'), bellyItem(9, 'heavy'), bellyItem(10, 'heavy'),
  bellyItem(7, 'light'), bellyItem(8, 'light'), bellyItem(9, 'light'), bellyItem(10, 'light'),

  plainItem(7, 'heavy'), plainItem(8, 'heavy'), plainItem(9, 'heavy'), plainItem(10, 'heavy'),
  plainItem(7, 'light'), plainItem(8, 'light'), plainItem(9, 'light'), plainItem(10, 'light'),

  item11(),

  chennaiPot('Chennai Pot 9" (all 0.33, kunda10g, heavy)', 8.25, 5.75, 0.33, 0.33, 10, 185, 'heavy', 9, 8),
  chennaiPot('Chennai Pot 10" (all 0.33, kunda10g, heavy)', 9.0, 6.25, 0.33, 0.33, 10, 185, 'heavy', 10, 9),

  chennaiPot('Chennai Pot 9" (box0.33 cover0.26, kunda5g, light)', 8.25, 5.75, 0.33, 0.26, 5, 205, 'light', 9, 8),
  chennaiPot('Chennai Pot 10" (box0.33 cover0.26, kunda5g, light)', 9.0, 6.25, 0.33, 0.26, 5, 205, 'light', 10, 9)
]