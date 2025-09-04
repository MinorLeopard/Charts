"use client";
import * as React from "react";
import clsx from "clsx";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary";
  size?: "sm" | "md";
};

export function Button({ className, variant = "default", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "rounded-md border px-2 py-1 text-xs",
        variant === "default" && "bg-white/10 hover:bg-white/15 border-white/20",
        variant === "secondary" && "bg-transparent hover:bg-white/5 border-white/20",
        size === "sm" && "px-2 py-1 text-xs",
        size === "md" && "px-3 py-1.5 text-sm",
        className
      )}
      {...props}
    />
  );
}
export default Button;
