/** @vitest-environment jsdom */
import { useRef } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useBottomInsetVar } from "./useBottomInsetVar";

const VAR = "--sgt-test-inset";

function Probe({ top, active = true }: { top: number; active?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useBottomInsetVar(ref, VAR, active);
  return (
    <div
      ref={(node) => {
        ref.current = node;
        if (!node) return;
        // jsdom не робить layout — підміняємо геометрію вручну.
        node.getBoundingClientRect = () => ({ top }) as unknown as DOMRect;
      }}
    />
  );
}

describe("useBottomInsetVar", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty(VAR);
  });

  it("публікує зайняту знизу смугу на <html>", () => {
    window.innerHeight = 800;
    render(<Probe top={732} />);
    expect(document.documentElement.style.getPropertyValue(VAR)).toBe("68px");
  });

  it("знімає змінну на unmount — інакше тост завис би над відсутньою навігацією", () => {
    window.innerHeight = 800;
    const view = render(<Probe top={732} />);
    view.unmount();
    expect(document.documentElement.style.getPropertyValue(VAR)).toBe("");
  });

  it("active=false (навігація зʼїхала під клавіатуру) → змінної немає", () => {
    window.innerHeight = 800;
    render(<Probe top={732} active={false} />);
    expect(document.documentElement.style.getPropertyValue(VAR)).toBe("");
  });

  it("елемент за межами вʼюпорта дає 0, а не відʼємне значення", () => {
    window.innerHeight = 800;
    render(<Probe top={900} />);
    expect(document.documentElement.style.getPropertyValue(VAR)).toBe("0px");
  });
});
