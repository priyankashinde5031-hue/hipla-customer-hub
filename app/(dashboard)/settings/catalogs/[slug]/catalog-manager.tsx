"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { CatalogConfig } from "@/lib/catalogs";
import { createCatalogItem, updateCatalogItem, setCatalogItemActive } from "../actions";

type CatalogItem = Record<string, unknown> & { id: string; active: boolean };

export function CatalogManager({
  catalog,
  items,
  canEdit,
  moduleOptions,
  mappingByEntrySource,
}: {
  catalog: CatalogConfig;
  items: CatalogItem[];
  canEdit: boolean;
  moduleOptions: { id: string; name: string }[];
  mappingByEntrySource: Record<string, string[]>;
}) {
  const [dialogItem, setDialogItem] = useState<CatalogItem | null | "new">(null);
  const [isPending, startTransition] = useTransition();

  const closeDialog = () => setDialogItem(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result =
        dialogItem === "new"
          ? await createCatalogItem(catalog.slug, formData)
          : await updateCatalogItem(catalog.slug, (dialogItem as CatalogItem).id, formData);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(dialogItem === "new" ? `${catalog.singular} added.` : `${catalog.singular} updated.`);
      closeDialog();
    });
  }

  function handleToggleActive(item: CatalogItem) {
    startTransition(async () => {
      const result = await setCatalogItemActive(catalog.slug, item.id, !item.active);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(item.active ? `${catalog.singular} deactivated.` : `${catalog.singular} activated.`);
    });
  }

  return (
    <div>
      {canEdit && (
        <div className="mb-4 flex justify-end">
          <Button
            className="bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={() => setDialogItem("new")}
          >
            Add {catalog.singular}
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              {catalog.fields.map((field) => (
                <TableHead key={field.key} className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {field.label}
                </TableHead>
              ))}
              {catalog.hasModuleMapping && (
                <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">Modules</TableHead>
              )}
              <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</TableHead>
              {canEdit && <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className={!item.active ? "opacity-50" : ""}>
                {catalog.fields.map((field) => (
                  <TableCell key={field.key} className="text-slate-700">
                    {String(item[field.key] ?? "—")}
                  </TableCell>
                ))}
                {catalog.hasModuleMapping && (
                  <TableCell className="text-slate-600">
                    {(mappingByEntrySource[item.id] ?? [])
                      .map((moduleId) => moduleOptions.find((m) => m.id === moduleId)?.name)
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </TableCell>
                )}
                <TableCell>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {item.active ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-3">
                      <Button variant="ghost" size="sm" onClick={() => setDialogItem(item)}>
                        Edit
                      </Button>
                      <Switch
                        checked={item.active}
                        disabled={isPending}
                        onCheckedChange={() => handleToggleActive(item)}
                      />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {items.length === 0 && (
          <p className="px-4 py-6 text-sm text-slate-500">
            No {catalog.label.toLowerCase()} yet{canEdit ? " — add the first one above." : "."}
          </p>
        )}
      </div>

      <Dialog open={dialogItem !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogItem === "new" ? `Add ${catalog.singular}` : `Edit ${catalog.singular}`}
            </DialogTitle>
            <DialogDescription>{catalog.description}</DialogDescription>
          </DialogHeader>

          <form
            action={handleSubmit}
            className="flex flex-col gap-4"
          >
            {catalog.fields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-red-500"> *</span>}
                </Label>
                {field.type === "select" ? (
                  <select
                    id={field.key}
                    name={field.key}
                    required={field.required}
                    defaultValue={
                      dialogItem && dialogItem !== "new" ? String(dialogItem[field.key] ?? "") : ""
                    }
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="" disabled>
                      Select {field.label.toLowerCase()}
                    </option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={field.key}
                    name={field.key}
                    type={field.type === "number" ? "number" : "text"}
                    required={field.required}
                    defaultValue={
                      dialogItem && dialogItem !== "new" ? String(dialogItem[field.key] ?? "") : ""
                    }
                  />
                )}
              </div>
            ))}

            {catalog.hasModuleMapping && (
              <div className="flex flex-col gap-1.5">
                <Label>Modules</Label>
                <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-2.5">
                  {moduleOptions.length === 0 && (
                    <p className="text-xs text-slate-400">No active modules yet.</p>
                  )}
                  {moduleOptions.map((mod) => {
                    const checkedIds =
                      dialogItem && dialogItem !== "new" ? mappingByEntrySource[dialogItem.id] ?? [] : [];
                    return (
                      <label key={mod.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          name="module_ids"
                          value={mod.id}
                          defaultChecked={checkedIds.includes(mod.id)}
                          className="size-3.5 rounded border-slate-300"
                        />
                        {mod.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <DialogFooter className="-mx-0 -mb-0 border-t-0 bg-transparent p-0 pt-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="bg-indigo-600 text-white hover:bg-indigo-700">
                {isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
