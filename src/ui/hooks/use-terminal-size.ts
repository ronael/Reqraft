import { useState, useEffect } from "react";
import process from "node:process";

export interface TerminalSize {
  columns: number;
  rows: number;
}

export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState<TerminalSize>({
    columns: process.stdout.columns,
    rows: process.stdout.rows,
  });

  useEffect(() => {
    const handleResize = (): void => {
      setSize({
        columns: process.stdout.columns,
        rows: process.stdout.rows,
      });
    };

    process.stdout.on("resize", handleResize);
    return () => {
      process.stdout.off("resize", handleResize);
    };
  }, []);

  return size;
}
