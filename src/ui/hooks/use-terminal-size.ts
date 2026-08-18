import { useState, useEffect } from "react";
import process from "node:process";
import { normalizeSize, type TerminalSize } from "@/ui/layout/responsive.js";

function readSize(): TerminalSize {
  return normalizeSize({ columns: process.stdout.columns, rows: process.stdout.rows });
}

export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState<TerminalSize>(readSize);

  useEffect(() => {
    const handleResize = (): void => {
      setSize(readSize());
    };

    process.stdout.on("resize", handleResize);
    return () => {
      process.stdout.off("resize", handleResize);
    };
  }, []);

  return size;
}

export type { TerminalSize };
