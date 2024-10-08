import { describe, it, expect } from "vitest";
import { isCell, isModule, CellProxy } from "../src/types.js";
import { lift, handler } from "../src/module.js";
import { cell } from "../src/cell-proxy.js";

describe("lift function", () => {
  it("creates a node factory", () => {
    const add = lift<{ a: number; b: number }, number>(({ a, b }) => a + b);
    expect(typeof add).toBe("function");
    expect(isModule(add)).toBe(true);
  });

  it("creates a cell proxy when called", () => {
    const add = lift<{ a: number; b: number }, number>(({ a, b }) => a + b);
    const result = add({ a: cell(1), b: cell(2) });
    expect(isCell(result)).toBe(true);
  });
});

describe("handler function", () => {
  it("creates a node factory for event handlers", () => {
    const clickHandler = handler<MouseEvent, { x: number; y: number }>(
      (event, props) => {
        props.x = event.clientX;
        props.y = event.clientY;
      }
    );
    expect(typeof clickHandler).toBe("function");
    expect(isModule(clickHandler)).toBe(true);
  });

  it("creates a cell proxy with stream when called", () => {
    const clickHandler = handler<MouseEvent, { x: number; y: number }>(
      (event, props) => {
        props.x = event.clientX;
        props.y = event.clientY;
      }
    );
    const stream = clickHandler({ x: cell(10), y: cell(20) });
    expect(isCell(stream)).toBe(true);
    const { value, nodes } = (
      stream as unknown as CellProxy<{ $stream: true }>
    ).export();
    expect(value).toEqual({ $stream: true });
    expect(nodes.size).toBe(1);
    expect([...nodes][0].module).toMatchObject({ wrapper: "handler" });
    expect([...nodes][0].inputs).toMatchObject({ $event: stream });
  });
});
