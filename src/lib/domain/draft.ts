import {
  optionChoicesOf,
  optionNamesOf,
  selectedOptionsOf,
  variantsOf,
  type SizePolicy,
} from "@/lib/domain/catalog-options";

/**
 * Mutable order draft: the buyer may change any part of the order mid-
 * conversation. Slots stay the storage (jsonb, no migration); this module is
 * the pure reducer that applies a structured change, reports what changed,
 * and invalidates downstream state (summary, pin, negotiation) by rule.
 * Model proposes a change; this code decides its effect.
 */

export interface DraftItem {
  productId: string | null;
  productName: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  sizePolicy?: "required" | "none" | "options" | null;
  optionNames?: string[];
  optionChoices?: Record<string, string[]>;
  variants?: unknown[];
  selectedOptions?: Record<string, string>;
  variantId?: string | null;
}

export interface Draft {
  items: DraftItem[];
  customerName: string | null;
  phone: string | null;
  governorate: string | null;
  delegation: string | null;
  landmarks: Array<{ name: string; relation: string | null }>;
  floor: string | null;
  driverNote: string | null;
  draftVersion: number;
  summaryPending: boolean;
  confirmedAddressId: string | null;
  cancelled: boolean;
}

export type ChangeTarget =
  | "size"
  | "color"
  | "quantity"
  | "product"
  | "item"
  | "customerName"
  | "phone"
  | "governorate"
  | "landmark"
  | "address"
  | "order";

export interface ChangeRequest {
  target: ChangeTarget;
  operation: "replace" | "add" | "remove" | "cancel" | "increment" | "decrement";
  value?: string | number | null;
  productName?: string | null;
  itemIndex?: number;
  quantityDelta?: number;
}

export interface ChangeResult {
  slots: Record<string, unknown>;
  diffs: string[];
  invalidatedSummary: boolean;
  needsNewPin: boolean;
  resetNegotiation: boolean;
  cancelled: boolean;
}

function str(slots: Record<string, unknown>, key: string): string | null {
  const v = slots[key];
  return typeof v === "string" && v.trim() ? v : null;
}

function policyFields(source: Record<string, unknown>): Pick<
  DraftItem,
  "sizePolicy" | "optionNames" | "optionChoices" | "variants" | "selectedOptions" | "variantId"
> {
  const explicit = source.sizePolicy;
  const sizePolicy: SizePolicy | null =
    explicit === "none" || explicit === "options" || explicit === "required" ? explicit : null;
  return {
    sizePolicy,
    optionNames: optionNamesOf(source),
    optionChoices: optionChoicesOf(source),
    variants: variantsOf(source),
    selectedOptions: selectedOptionsOf(source),
    variantId: typeof source.variantId === "string" ? source.variantId : null,
  };
}

function itemsFromSlots(slots: Record<string, unknown>): DraftItem[] {
  const raw = slots.items;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
      .slice(0, 5)
      .map((i) => ({
        productId: typeof i.productId === "string" ? i.productId : null,
        productName: typeof i.productName === "string" ? i.productName : null,
        size: typeof i.size === "string" ? i.size : null,
        color: typeof i.color === "string" ? i.color : null,
        quantity: typeof i.quantity === "number" && i.quantity > 0 ? Math.floor(i.quantity) : 1,
        ...policyFields(i),
      }));
  }
  if (str(slots, "matchedProductId") || str(slots, "matchedProductName")) {
    return [
      {
        productId: str(slots, "matchedProductId"),
        productName: str(slots, "matchedProductName"),
        size: str(slots, "size"),
        color: str(slots, "color"),
        quantity: typeof slots.quantity === "number" && slots.quantity > 0 ? Math.floor(slots.quantity as number) : 1,
        ...policyFields(slots),
      },
    ];
  }
  return [];
}

export function draftFromSlots(slots: Record<string, unknown>): Draft {
  const items = itemsFromSlots(slots);
  // The flat matched* slots are authoritative for the primary item (vision
  // writes them); keep a persisted cart from shadowing a newer match.
  const matchedId = str(slots, "matchedProductId");
  if (matchedId && items[0] && items[0].productId !== matchedId) {
    items[0] = {
      ...items[0],
      productId: matchedId,
      productName: str(slots, "matchedProductName") ?? items[0].productName,
      size: str(slots, "size") ?? items[0].size,
      color: str(slots, "color") ?? items[0].color,
    };
  }
  return {
    items,
    customerName: str(slots, "customerName"),
    phone: str(slots, "phone"),
    governorate: str(slots, "governorate"),
    delegation: str(slots, "delegation"),
    landmarks: Array.isArray(slots.landmarks)
      ? (slots.landmarks as Array<{ name: string; relation: string | null }>)
      : [],
    floor: str(slots, "floor"),
    driverNote: str(slots, "driverNote"),
    draftVersion: typeof slots.draftVersion === "number" ? slots.draftVersion : 0,
    summaryPending: slots.summaryPending === true,
    confirmedAddressId: str(slots, "confirmedAddressId"),
    cancelled: slots.draftCancelled === true,
  };
}

/** Mirrors the primary item back into the legacy flat slots every reader uses. */
function syncPrimary(slots: Record<string, unknown>, items: DraftItem[]): void {
  const primary = items[0];
  slots.items = items;
  if (primary?.productId) slots.matchedProductId = primary.productId;
  else delete slots.matchedProductId;
  if (primary?.productName) slots.matchedProductName = primary.productName;
  else delete slots.matchedProductName;
  if (primary?.size) slots.size = primary.size;
  else delete slots.size;
  if (primary?.color) slots.color = primary.color;
  else delete slots.color;
  slots.quantity = primary?.quantity ?? 1;
  if (primary?.sizePolicy === "none" || primary?.sizePolicy === "options" || primary?.sizePolicy === "required") {
    slots.sizePolicy = primary.sizePolicy;
  }
  if (primary?.optionNames && primary.optionNames.length > 0) slots.optionNames = primary.optionNames;
  if (primary?.optionChoices && Object.keys(primary.optionChoices).length > 0) slots.optionChoices = primary.optionChoices;
  if (primary?.variants && primary.variants.length > 0) slots.variants = primary.variants;
  if (primary?.selectedOptions && Object.keys(primary.selectedOptions).length > 0) {
    slots.selectedOptions = primary.selectedOptions;
  }
  if (primary?.variantId) slots.variantId = primary.variantId;
  else if (primary?.sizePolicy === "options" || primary?.sizePolicy === "none") delete slots.variantId;
}

const LABEL: Record<string, string> = {
  size: "el taille",
  color: "el loun",
  quantity: "el quantité",
  product: "el produit",
  customerName: "esm",
  phone: "numero el téléphone",
  governorate: "el wilaya",
  landmark: "el adresse",
  address: "el adresse",
};

export function applyDraftChange(
  current: Record<string, unknown>,
  change: ChangeRequest,
): ChangeResult {
  const slots: Record<string, unknown> = { ...current };
  const draft = draftFromSlots(current);
  const items = draft.items.map((i) => ({ ...i }));
  const diffs: string[] = [];
  const wasSummary = draft.summaryPending;
  let needsNewPin = false;
  let resetNegotiation = false;
  let cancelled = false;

  const invalidateSummary = () => {
    if (wasSummary) {
      slots.summaryPending = false;
      delete slots.summary;
    }
  };
  const diff = (target: string, from: unknown, to: unknown) => {
    diffs.push(`${LABEL[target] ?? target}: ${from ?? "—"} -> ${to ?? "—"}`);
  };

  if (change.operation === "cancel" || change.target === "order") {
    cancelled = true;
    slots.draftCancelled = true;
    slots.summaryPending = false;
    slots.items = [];
    delete slots.summary;
    delete slots.orderId;
    delete slots.matchedProductId;
    delete slots.matchedProductName;
    slots.draftVersion = draft.draftVersion + 1;
    return { slots, diffs: ["el commande tna7at"], invalidatedSummary: wasSummary, needsNewPin, resetNegotiation, cancelled };
  }

  if (change.target === "item" && change.operation === "remove") {
    const idx = change.itemIndex ?? items.length - 1;
    const removed = items[idx];
    if (removed) {
      diffs.push(`na7ina ${removed.productName ?? "produit"} mel commande`);
      items.splice(idx, 1);
    }
    invalidateSummary();
  } else if (change.target === "item" && change.operation === "add") {
    if (items.length < 5) {
      items.push({
        productId: typeof change.value === "string" ? change.value : null,
        productName: change.productName ?? (typeof change.value === "string" ? null : null),
        size: null,
        color: null,
        quantity: 1,
      });
      diffs.push(`zedna produit jdid lel commande (${items.length} produits)`);
    }
    invalidateSummary();
  } else if (change.target === "product") {
    const idx = change.itemIndex ?? 0;
    const prev = items[idx];
    diff("product", prev?.productName ?? str(slots, "matchedProductName"), change.productName ?? change.value ?? "produit jdid");
    items[idx] = {
      productId: null,
      productName: null,
      size: prev?.size ?? null,
      color: prev?.color ?? null,
      quantity: prev?.quantity ?? 1,
    };
    if (typeof change.value === "string" && change.value.trim()) {
      slots.productDescriptionEn = change.value;
      slots.pendingProductChange = change.value;
    }
    delete slots.matchedSimilarity;
    slots.visionStatus = "change_requested";
    resetNegotiation = true;
    invalidateSummary();
  } else if (change.target === "size" || change.target === "color") {
    const idx = change.itemIndex ?? 0;
    if (!items[idx]) items[idx] = { productId: null, productName: null, size: null, color: null, quantity: 1 };
    const key = change.target;
    diff(key, items[idx][key], change.value);
    items[idx][key] = typeof change.value === "string" ? change.value : null;
    invalidateSummary();
  } else if (change.target === "quantity") {
    const idx = change.itemIndex ?? 0;
    if (!items[idx]) items[idx] = { productId: null, productName: null, size: null, color: null, quantity: 1 };
    const prevQty = items[idx].quantity;
    const nextQty =
      change.operation === "increment"
        ? prevQty + (change.quantityDelta ?? 1)
        : change.operation === "decrement"
          ? prevQty - (change.quantityDelta ?? 1)
          : typeof change.value === "number"
            ? change.value
            : prevQty;
    items[idx].quantity = Math.min(20, Math.max(1, Math.floor(nextQty)));
    diff("quantity", prevQty, items[idx].quantity);
    invalidateSummary();
  } else if (change.target === "customerName" || change.target === "phone") {
    diff(change.target, slots[change.target], change.value);
    if (change.value) slots[change.target] = change.value;
    invalidateSummary();
  } else if (change.target === "governorate") {
    diff("governorate", slots.governorate, change.value);
    if (change.value) slots.governorate = change.value;
    delete slots.confirmedAddressId;
    delete slots.pendingAddress;
    slots.pinPending = false;
    needsNewPin = true;
    invalidateSummary();
  } else if (change.target === "landmark" || change.target === "address") {
    diff("landmark", draft.landmarks[0]?.name, change.value);
    if (typeof change.value === "string" && change.value.trim()) {
      slots.landmarks = [{ name: change.value, relation: "near" }];
    }
    delete slots.confirmedAddressId;
    delete slots.pendingAddress;
    delete slots.pendingLandmarkChoice;
    slots.pinPending = false;
    slots.pinReused = false;
    needsNewPin = true;
    invalidateSummary();
  }

  syncPrimary(slots, items);
  slots.draftVersion = draft.draftVersion + 1;
  slots.draftCancelled = false;
  return {
    slots,
    diffs,
    invalidatedSummary: wasSummary,
    needsNewPin,
    resetNegotiation,
    cancelled,
  };
}

/** Derja confirmation for an applied change. No amounts: totals are re-sent in the summary. */
export function buildChangeConfirmation(result: ChangeResult, nextQuestionText: string): string {
  if (result.cancelled) {
    return "Behi, annulna el commande. Ma t5awafch, ma tb3at chay. Ken t7eb t3awed commande jdida, ana houni.";
  }
  const head = result.diffs.length > 0 ? `Mrigel, beddalt (${result.diffs.join("; ")}).` : "Mrigel, beddalt.";
  const summaryNote = result.invalidatedSummary
    ? " El récap el 9dim tna7a, taw n3awdou b el ma3loumet el jdod."
    : "";
  const pinNote = result.needsNewPin ? " Lezem nakkedou el pin el jdid lel adresse el jdida." : "";
  return `${head}${summaryNote}${pinNote} ${nextQuestionText}`.trim();
}
