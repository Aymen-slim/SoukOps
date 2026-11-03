"use client";

import type { ReactNode } from "react";
import { X } from "@untitledui/icons";
import { Dialog as AriaDialog, Modal as AriaModal, ModalOverlay as AriaModalOverlay } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

export function Modal({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/60 p-4 backdrop-blur-sm sm:items-center"
    >
      <AriaModal className={cx("w-full max-w-md outline-none", className)}>
        <AriaDialog className="rounded-2xl bg-primary p-6 shadow-xl ring-1 ring-secondary outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-primary">{title}</h2>
              {description ? <p className="mt-1 text-sm text-tertiary">{description}</p> : null}
            </div>
            <Button
              color="tertiary"
              size="sm"
              aria-label="Close"
              onPress={() => onOpenChange(false)}
              iconLeading={<X data-icon className="size-4" />}
            />
          </div>
          {children ? <div className="mt-4 text-sm text-secondary">{children}</div> : null}
          {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
