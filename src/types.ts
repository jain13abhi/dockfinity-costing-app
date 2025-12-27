// types.ts

export type ThicknessMm = number;

export type ScrapReturn = { enabled: boolean; ratePerKg: number }; // e.g. 50

// Press stage has both:
// - actualWastagePct: impacts grams per piece (material actually lost)
// - jobWastagePct: kept by job worker (not returned), impacts yield/costing
// - tutPct: breakage, you get scrap return
export type PressStage = {
  ratePerKg: number;            // charged on kala output received
  actualWastagePct: number;     // for grams/weight
  jobWastagePct: number;        // for costing (job worker keeps)
  tutPct: number;               // for costing (scrap)
  scrapReturn: ScrapReturn;
};

export type InductionStage = {
  enabled: boolean;
  ratePerKg: number;            // charged on kala kg (delivered after press)
};

export type PolishStage = {
  ratePerKg: number;           // charged on polished output received
  wastagePct: number;          // lost (no return)
  tutPct: number;              // scrap (return)
  scrapReturn: ScrapReturn;
};

export type PackingStage = {
  packingRatePerKg: number;    // charged on packed output (final)
  tutPct: number;              // sorting tut (scrap return)
  scrapReturn: ScrapReturn;
};

export type BagProfile = {
  name: 'heavy' | 'light' | 'custom';
  polybag: { sizeIn: number; gauge: number; ratePerKg: number };
  pipe: { widthIn: number; lengthIn: number; gauge: number; pcsPerPipe: number; ratePerKg: number };
};

export type KundaSpec = {
  enabled: boolean;
  weightG: number;          // 5 or 10
  ratePerKg: number;        // per kg
};

export type PartSpec = {
  label: 'box' | 'cover';
  circleSizeIn: number;
  thicknessMm: ThicknessMm;
  press: PressStage;
  induction?: InductionStage;   // optional for backward compatibility
};

export type Item = {
  id: string;
  name: string;
  box: PartSpec;
  cover: PartSpec;
  kunda: KundaSpec;
  bagProfile: BagProfile;
  polish: PolishStage;
  packing: PackingStage;
};

export type AppSettings = {
  circleBaseRate: number;       // e.g. 170
  circleAddPerKg: number;       // +5 always
  circleExtraAddPerKg: number;  // optional +5 for 0.33 etc (default 0)
  bagStandardKg: number;        // 80
};

export type CalcResult = {
  itemId: string;
  itemName: string;

  perPc: {
    boxG: number;
    coverG: number;
    kundaG: number;
    polybagG: number;
    pipeG: number;
    totalPackedG: number;
  };

  pcsPerBag: number;

  perKgRate: number;
  perPcRate: number;

  debug: {
    bagKg: number;
    pcs: number;
    circleKgInTotal: number;
    circleCost: number;
    pressCost: number;
    inductionCost: number;   // NEW
    polishCost: number;
    packingCost: number;
    kundaCost: number;
    plasticCost: number;
    scrapCredit: number;
    finalCost: number;
  };
};