"use client";

import { useSyncExternalStore } from "react";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  AURORA_DEFAULT,
  AURORA_LEVELS,
  AURORA_STORAGE_KEY,
  isAuroraLevel,
  type AuroraLevel,
} from "@/lib/aurora";

const EVENT = "aurora-change";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function readLevel(): AuroraLevel {
  const value = document.documentElement.dataset.aurora;
  return isAuroraLevel(value) ? value : AURORA_DEFAULT;
}

function setLevel(level: AuroraLevel) {
  document.documentElement.dataset.aurora = level;
  try {
    localStorage.setItem(AURORA_STORAGE_KEY, level);
  } catch {
    // Sin almacenamiento (navegación privada): el cambio dura esta visita.
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Selector de intensidad de la aurora para los menús de usuario. Va dentro de
 * un DropdownMenuContent.
 */
export function AuroraMenuGroup() {
  const level = useSyncExternalStore(subscribe, readLevel, () => AURORA_DEFAULT);

  return (
    <>
      <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
        Fondo de aurora
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={level}
        onValueChange={(value) => {
          if (isAuroraLevel(value)) setLevel(value);
        }}
      >
        {AURORA_LEVELS.map((option) => (
          <DropdownMenuRadioItem
            key={option.value}
            value={option.value}
            closeOnClick={false}
          >
            {option.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
