// calc.ts
import type { Item, AppSettings, CalcResult } from './types'

// ===========================
// WEIGHT FORMULAS (LOCKED)
// ===========================
// Base grams for 0.263mm: (263/254) * D^2
// Thickness scaling: thickness / 0.263
//
// IMPORTANT (your rule):
// thickness input gets +0.003 tolerance
// 0.26 => 0.263, 0.33 => 0.333
function effectiveThicknessMm(inputMm: number): number {
  return inputMm + 0.003
}

export function circleWeightG(circleIn: number, thicknessMm: number): number {
  const base = (263 / 254) * circleIn * circleIn
  const scale = effectiveThicknessMm(thicknessMm) / 0.263
  return base * scale
}

// Polybag: size*size*gauge/3300
export function polybagWeightG(sizeIn: number, gauge: number): number {
  return (sizeIn * sizeIn * gauge) / 3300
}

// Pipe: width*length*gauge/3300
export function pipeWeightG(widthIn: number, lengthIn: number, gauge: number): number {
  return (widthIn * lengthIn * gauge) / 3300
}

function r2(n: number) { return Math.round(n * 100) / 100 }
function r3(n: number) { return Math.round(n * 1000) / 1000 }

// ===========================
// YOUR CORE RULE (FORWARD COSTING)
// ===========================
// - Actual wastage % is ONLY for grams/weight.
// - Costing is ONLY by:
//   Press: tut% + jobWastage%
//   Polish: tut% + wastage%
//   Packing: tut%
// - Tut gives scrap return credit (₹50/kg if enabled).
// - Pressing charge is on delivered kala (after tut & job-wastage).
// - Polishing charge is on delivered polished (after tut & polish wastage).
// - Packing charge is applied ONCE on final bag (bagKg), not per-part.
//   BUT packing tut scrap credit happens on metal parts (box & cover).
//
// NEW:
// - Optional Induction charge on delivered kala (after press).
//   If induction missing/disabled => 0 (no change).
//
// NEW (THIS CHANGE):
// - Circle rate can be different for box vs cover:
//   Use item.box.circleRatePerKg / item.cover.circleRatePerKg if present,
//   else fallback to settings circle rate.

type StageFlow = {
  circleKgIn: number
  kalaKgOut: number
  polishKgOut: number
  packedKgOut: number
  scrapKg: number
  scrapCredit: number
  costPress: number
  costPolish: number
  costInduction: number
}

type PartCostResult = {
  flow: StageFlow
  partCostExcludingFinalPackingCharge: number
  partRatePerKgPacked: number
  components: {
    circleCost: number
    pressCharge: number
    inductionCharge: number
    polishCharge: number
    scrapCreditPress: number
    scrapCreditPolish: number
    scrapCreditPacking: number
  }
}

function pct(x: number): number { return x / 100 }

function computePartForwardCost(
  requiredPackedKg: number,
  part: Item['box'],
  polish: Item['polish'],
  packing: Item['packing'],
  circleRatePerKg: number
): PartCostResult {
  const press = part.press

  // -----------------------
  // QUANTITY FLOW (from final required packed kg)
  // -----------------------
  // Packing tut happens at end on metal parts
  const packTutP = pct(packing.tutPct)
  const packingInputKg = requiredPackedKg / (1 - packTutP)
  const packingTutKg = packingInputKg - requiredPackedKg

  // Polish stage: tut + wastage allowed
  const polTutP = pct(polish.tutPct)
  const polWastP = pct(polish.wastagePct)

  const polishInputKalaKg = packingInputKg / ((1 - polTutP) * (1 - polWastP))
  const polishTutKg = polishInputKalaKg * polTutP

  const polishDeliveredKg =
    polishInputKalaKg * (1 - polTutP) * (1 - polWastP) // == packingInputKg

  // Press stage: tut + job wastage (NO actual wastage in costing)
  const pressTutP = pct(press.tutPct)
  const jobWastP = pct(press.jobWastagePct)

  const pressInputCircleKg = polishInputKalaKg / ((1 - pressTutP) * (1 - jobWastP))
  const pressTutKg = pressInputCircleKg * pressTutP
  const pressDeliveredKalaKg =
    pressInputCircleKg * (1 - pressTutP) * (1 - jobWastP) // == polishInputKalaKg

  // -----------------------
  // COSTS (FORWARD METHOD)
  // -----------------------
  const circleCost = pressInputCircleKg * circleRatePerKg

  // Press charge on delivered kala
  const pressCharge = pressDeliveredKalaKg * press.ratePerKg

  // Induction charge (optional) on delivered kala
  const inductionEnabled = !!part.induction?.enabled
  const inductionRate = part.induction?.ratePerKg ?? 0
  const inductionCharge =
    (inductionEnabled && inductionRate > 0)
      ? pressDeliveredKalaKg * inductionRate
      : 0

  // Polish charge on delivered polished
  const polishCharge = polishDeliveredKg * polish.ratePerKg

  // Scrap credits (only tut + packing tut)
  const scrapCreditPress =
    press.scrapReturn.enabled ? pressTutKg * press.scrapReturn.ratePerKg : 0

  const scrapCreditPolish =
    polish.scrapReturn.enabled ? polishTutKg * polish.scrapReturn.ratePerKg : 0

  const scrapCreditPacking =
    packing.scrapReturn.enabled ? packingTutKg * packing.scrapReturn.ratePerKg : 0

  const scrapCreditTotal = scrapCreditPress + scrapCreditPolish + scrapCreditPacking
  const scrapKgTotal = pressTutKg + polishTutKg + packingTutKg

  const partCost =
    circleCost +
    pressCharge +
    inductionCharge +
    polishCharge -
    scrapCreditTotal

  const partRatePerKgPacked = partCost / requiredPackedKg

  const flow: StageFlow = {
    circleKgIn: pressInputCircleKg,
    kalaKgOut: pressDeliveredKalaKg,
    polishKgOut: polishDeliveredKg,
    packedKgOut: requiredPackedKg,
    scrapKg: scrapKgTotal,
    scrapCredit: scrapCreditTotal,
    costPress: circleCost + pressCharge,
    costInduction: inductionCharge,
    costPolish: polishCharge
  }

  return {
    flow,
    partCostExcludingFinalPackingCharge: partCost,
    partRatePerKgPacked,
    components: {
      circleCost,
      pressCharge,
      inductionCharge,
      polishCharge,
      scrapCreditPress,
      scrapCreditPolish,
      scrapCreditPacking
    }
  }
}

function fallbackCircleRate(settings: AppSettings): number {
  return (
    settings.circleBaseRate +
    settings.circleAddPerKg +
    (settings.circleExtraAddPerKg || 0)
  )
}

function resolvePartCircleRatePerKg(part: Item['box'], settings: AppSettings): number {
  // If part has explicit rate, it wins.
  // Else fallback to settings (backward compatibility).
  const explicit = (part as any).circleRatePerKg
  if (typeof explicit === 'number' && isFinite(explicit) && explicit > 0) return explicit
  return fallbackCircleRate(settings)
}

export function calculate(item: Item, settings: AppSettings): CalcResult {
  const bagKg = settings.bagStandardKg

  // ===========================
  // WEIGHT PER PC (grams)
  // ===========================
  const boxCircleG = circleWeightG(item.box.circleSizeIn, item.box.thicknessMm)
  const coverCircleG = circleWeightG(item.cover.circleSizeIn, item.cover.thicknessMm)

  const boxAfterPressG = boxCircleG * (1 - pct(item.box.press.actualWastagePct))
  const coverAfterPressG = coverCircleG * (1 - pct(item.cover.press.actualWastagePct))

  const boxAfterPolishG = boxAfterPressG * (1 - pct(item.polish.wastagePct))
  const coverAfterPolishG = coverAfterPressG * (1 - pct(item.polish.wastagePct))

  const kundaG = item.kunda.enabled ? item.kunda.weightG : 0
  const polybagG = polybagWeightG(item.bagProfile.polybag.sizeIn, item.bagProfile.polybag.gauge)
  const pipePerPcG =
    pipeWeightG(item.bagProfile.pipe.widthIn, item.bagProfile.pipe.lengthIn, item.bagProfile.pipe.gauge) /
    item.bagProfile.pipe.pcsPerPipe

  const totalPackedG = boxAfterPolishG + coverAfterPolishG + kundaG + polybagG + pipePerPcG

  const pcsPerBag = (bagKg * 1000) / totalPackedG
  const pcs = pcsPerBag

  // Packed kg split (final output, based on grams)
  const totalBoxKgPacked = (pcs * boxAfterPolishG) / 1000
  const totalCoverKgPacked = (pcs * coverAfterPolishG) / 1000

  // ===========================
  // RATES (box vs cover circle)
  // ===========================
  const boxCircleRate = resolvePartCircleRatePerKg(item.box, settings)
  const coverCircleRate = resolvePartCircleRatePerKg(item.cover, settings)

  const boxCostRes = computePartForwardCost(
    totalBoxKgPacked,
    item.box,
    item.polish,
    item.packing,
    boxCircleRate
  )

  const coverCostRes = computePartForwardCost(
    totalCoverKgPacked,
    item.cover,
    item.polish,
    item.packing,
    coverCircleRate
  )

  const boxCost = boxCostRes.partCostExcludingFinalPackingCharge
  const coverCost = coverCostRes.partCostExcludingFinalPackingCharge

  // Kunda cost (simple purchased input)
  const kundaKg = (pcs * kundaG) / 1000
  const kundaCost = item.kunda.enabled ? kundaKg * item.kunda.ratePerKg : 0

  // Plastic cost
  const polybagKg = (pcs * polybagG) / 1000
  const pipeKg = (pcs * pipePerPcG) / 1000
  const plasticCost =
    polybagKg * item.bagProfile.polybag.ratePerKg +
    pipeKg * item.bagProfile.pipe.ratePerKg

  // Final packing charge (ONCE) on full bag output
  const packingCost = bagKg * item.packing.packingRatePerKg

  // Totals (debug)
  const circleCost = boxCostRes.components.circleCost + coverCostRes.components.circleCost
  const pressCost = boxCostRes.components.pressCharge + coverCostRes.components.pressCharge
  const inductionCost = boxCostRes.components.inductionCharge + coverCostRes.components.inductionCharge
  const polishCost = boxCostRes.components.polishCharge + coverCostRes.components.polishCharge
  const scrapCredit = boxCostRes.flow.scrapCredit + coverCostRes.flow.scrapCredit

  const finalCost =
    boxCost +
    coverCost +
    kundaCost +
    plasticCost +
    packingCost

  const perKgRate = finalCost / bagKg
  const perPcRate = perKgRate * (totalPackedG / 1000)

  return {
    itemId: item.id,
    itemName: item.name,

    perPc: {
      boxG: r2(boxAfterPolishG),
      coverG: r2(coverAfterPolishG),
      kundaG: r2(kundaG),
      polybagG: r2(polybagG),
      pipeG: r2(pipePerPcG),
      totalPackedG: r2(totalPackedG)
    },

    pcsPerBag: r2(pcsPerBag),

    perKgRate: r2(perKgRate),
    perPcRate: r2(perPcRate),

    debug: {
      bagKg,
      pcs: r3(pcs),
      circleKgInTotal: r3(boxCostRes.flow.circleKgIn + coverCostRes.flow.circleKgIn),

      circleCost: r2(circleCost),
      pressCost: r2(pressCost),
      inductionCost: r2(inductionCost),
      polishCost: r2(polishCost),

      packingCost: r2(packingCost),
      kundaCost: r2(kundaCost),
      plasticCost: r2(plasticCost),
      scrapCredit: r2(scrapCredit),
      finalCost: r2(finalCost)
    }
  }
}