"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { comboKey, optionCombinations } from "@/lib/domain/catalog-options";

export interface SellerOption {
  name: string;
  values: string[];
}

export interface SellerVariant {
  optionValues: Record<string, string>;
  stock: number;
  priceMillimes: number | null;
  sku: string | null;
}

interface Row {
  name: string;
  valuesText: string;
}

function parseValues(text: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const part of text.split(",")) {
    const value = part.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values.slice(0, 20);
}

function rowsFromOptions(options: SellerOption[]): Row[] {
  return options.map((option) => ({ name: option.name, valuesText: option.values.join(", ") }));
}

export function OptionsEditor({
  initialOptions,
  initialVariants,
  onChange,
}: {
  initialOptions: SellerOption[];
  initialVariants: SellerVariant[];
  onChange: (next: { options: SellerOption[]; variants: SellerVariant[] }) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFromOptions(initialOptions));
  const [cells, setCells] = useState<Record<string, { stock: string; price: string }>>(() => {
    const next: Record<string, { stock: string; price: string }> = {};
    for (const variant of initialVariants) {
      next[comboKey(variant.optionValues)] = {
        stock: String(variant.stock),
        price: variant.priceMillimes == null ? "" : String(variant.priceMillimes / 1000),
      };
    }
    return next;
  });

  const options = useMemo(
    () => rows.map((row) => ({ name: row.name.trim(), values: parseValues(row.valuesText) })).filter((row) => row.name),
    [rows],
  );
  const combos = useMemo(() => optionCombinations(options).slice(0, 50), [options]);

  function publish(nextRows: Row[], nextCells: Record<string, { stock: string; price: string }>) {
    const nextOptions = nextRows
      .map((row) => ({ name: row.name.trim(), values: parseValues(row.valuesText) }))
      .filter((row) => row.name && row.values.length > 0);
    const nextCombos = optionCombinations(nextOptions).slice(0, 50);
    onChange({
      options: nextOptions,
      variants: nextCombos.map((optionValues) => {
        const cell = nextCells[comboKey(optionValues)];
        const priceDt = cell?.price.trim() ?? "";
        const priceMillimes = priceDt === "" ? null : Math.round(Number(priceDt) * 1000);
        return {
          optionValues,
          stock: Math.max(0, Math.floor(Number(cell?.stock ?? "0") || 0)),
          priceMillimes: priceMillimes != null && Number.isFinite(priceMillimes) ? priceMillimes : null,
          sku: null,
        };
      }),
    });
  }

  function updateRows(nextRows: Row[]) {
    setRows(nextRows);
    publish(nextRows, cells);
  }

  function updateCell(key: string, patch: Partial<{ stock: string; price: string }>) {
    const next = { ...cells, [key]: { stock: cells[key]?.stock ?? "0", price: cells[key]?.price ?? "", ...patch } };
    setCells(next);
    publish(rows, next);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-secondary/40 p-3 ring-1 ring-secondary">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-primary">Options</p>
          <p className="text-xs text-tertiary">Size, color, storage, scent — up to 3. Leave this empty for a simple product.</p>
        </div>
        <Button
          type="button"
          size="sm"
          color="secondary"
          isDisabled={rows.length >= 3}
          onClick={() => updateRows([...rows, { name: "", valuesText: "" }])}
        >
          Add option
        </Button>
      </div>
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`option-name-${index}`}>Option</Label>
            <Input
              id={`option-name-${index}`}
              value={row.name}
              placeholder="Size"
              aria-label="Option name"
              onChange={(value) => updateRows(rows.map((item, i) => (i === index ? { ...item, name: value } : item)))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`option-values-${index}`}>Values</Label>
            <Input
              id={`option-values-${index}`}
              value={row.valuesText}
              placeholder="S, M, L"
              aria-label="Option values"
              onChange={(value) =>
                updateRows(rows.map((item, i) => (i === index ? { ...item, valuesText: value } : item)))
              }
            />
          </div>
          <Button
            type="button"
            size="sm"
            color="tertiary"
            className="self-end"
            onClick={() => updateRows(rows.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      {combos.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-tertiary">
              <tr>
                <th className="py-1 pr-3 font-medium">Variant</th>
                <th className="py-1 pr-3 font-medium">Stock</th>
                <th className="py-1 font-medium">Price (DT, optional)</th>
              </tr>
            </thead>
            <tbody>
              {combos.map((combo) => {
                const key = comboKey(combo);
                const label = Object.entries(combo)
                  .map(([name, value]) => `${name} ${value}`)
                  .join(" / ");
                return (
                  <tr key={key} className="border-t border-secondary">
                    <td className="py-2 pr-3 text-primary">{label}</td>
                    <td className="py-2 pr-3">
                      <Input
                        value={cells[key]?.stock ?? "0"}
                        aria-label={`${label} stock`}
                        inputClassName="font-mono tabular-nums"
                        onChange={(value) => updateCell(key, { stock: value })}
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        value={cells[key]?.price ?? ""}
                        aria-label={`${label} price`}
                        placeholder="Product price"
                        inputClassName="font-mono tabular-nums"
                        onChange={(value) => updateCell(key, { price: value })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {optionCombinations(options).length > 50 ? (
            <p className="mt-2 text-xs text-error-primary">That is more than 50 variants. Remove a value.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
