"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, Sprout, X } from "lucide-react";
import { avatarImageSource } from "./avatar-image";

export function Card({
  children,
  className = "",
  tone = "default",
  ...props
}: HTMLAttributes<HTMLElement> & { tone?: "default" | "raised" | "highlight" }) {
  return (
    <section className={`panel panel-${tone} ${className}`} {...props}>
      {children}
    </section>
  );
}
export function Badge({
  children,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  tone?: "default" | "primary" | "warning" | "danger";
  className?: string;
}) {
  return <span className={`badge badge-${tone} ${className}`}>{children}</span>;
}
export function StatusChip({
  status,
  tone = "default",
}: {
  status: string;
  tone?: "default" | "primary" | "warning" | "danger";
}) {
  return (
    <Badge tone={tone}>
      <span className="status-dot" aria-hidden="true" />
      {status}
    </Badge>
  );
}
export function Avatar({
  name,
  size = "md",
  imageUrl,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  imageUrl?: string | null;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = avatarImageSource(imageUrl);
  const showImage = Boolean(source && failedSource !== source);
  const pixelSize = size === "sm" ? 28 : size === "lg" ? 48 : 34;
  return (
    <span
      title={name}
      aria-label={name}
      className={`avatar avatar-${size}${showImage ? " avatar-with-image" : ""}`}
      style={
        {
          "--avatar-hue": `${([...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 100) + 120}deg`,
          overflow: "hidden",
        } as React.CSSProperties
      }
    >
      {source && showImage ? (
        // This private image requires the browser's session cookie; optimizer proxy requests
        // would lose that authorization. The upload is already normalized to avatar dimensions.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source}
          alt=""
          aria-hidden="true"
          width={pixelSize}
          height={pixelSize}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSource(source)}
          style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        ([...name][0]?.toUpperCase() ?? "H")
      )}
    </span>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}
export function StatCard({
  label,
  value,
  unit,
  source,
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  source?: string;
  children?: ReactNode;
}) {
  return (
    <Card className="stat-card">
      <h2 className="panel-title">{label}</h2>
      <div className="stat-value mono">
        {value}
        <span>{unit}</span>
      </div>
      {children}
      {source && <small className="data-source">{source}</small>}
    </Card>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Sprout size={32} strokeWidth={1.2} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function LoadingState({ label = "하이브 데이터를 불러오는 중" }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle size={24} className="loading-icon" />
      <span>{label}</span>
    </div>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="닫기">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className={description ? "dialog-description" : "sr-only"}>
            {description ?? title}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Drawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content drawer-content">
          <div className="dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="닫기">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{title} 메뉴</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { value: string; label: string; content: ReactNode }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div>
      <div className="tabs" role="tablist" aria-label="보기 선택">
        {items.map((item, i) => (
          <button
            key={item.value}
            ref={(element) => {
              buttons.current[i] = element;
            }}
            id={`${id}-tab-${item.value}`}
            aria-controls={`${id}-panel-${item.value}`}
            aria-selected={value === item.value}
            tabIndex={value === item.value ? 0 : -1}
            role="tab"
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => {
              let next = i;
              if (event.key === "ArrowRight") next = (i + 1) % items.length;
              else if (event.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = items.length - 1;
              else return;
              event.preventDefault();
              onChange(items[next].value);
              buttons.current[next]?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div
          key={item.value}
          id={`${id}-panel-${item.value}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${item.value}`}
          hidden={item.value !== value}
          tabIndex={0}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
