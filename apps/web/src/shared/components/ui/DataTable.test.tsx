/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { DataTable, type DataTableColumn } from "./DataTable";

afterEach(cleanup);

interface Row {
  name: string;
  total: number;
}

const rows: Row[] = [
  { name: "Alpha", total: 1200 },
  { name: "Bravo", total: 34 },
];

const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Name", rowHeader: true, cell: (r) => r.name },
  { id: "total", header: "Total", numeric: true, cell: (r) => r.total },
];

/**
 * Contract tests for the DataTable primitive. Locks the accessibility
 * contract (row-header `<th scope="row">`, `<th scope="col">`), the
 * numeric-alignment class, the empty-state delegation and the
 * interactive-row callback.
 */
describe("DataTable", () => {
  it("renders a semantic table with column and row headers", () => {
    render(
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.name} />,
    );
    // Column headers.
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeTruthy();
    // Row headers use <th scope="row"> → exposed as rowheader role.
    expect(screen.getByRole("rowheader", { name: "Alpha" })).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "Bravo" })).toBeTruthy();
  });

  it("right-aligns numeric columns with tabular-nums", () => {
    render(
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.name} />,
    );
    const totalHeader = screen.getByRole("columnheader", { name: "Total" });
    expect(totalHeader.className).toContain("text-right");
    expect(totalHeader.className).toContain("tabular-nums");
    // A body cell in the numeric column inherits the same alignment.
    const cell = screen.getByText("1200");
    expect(cell.className).toContain("text-right");
    expect(cell.className).toContain("tabular-nums");
  });

  it("renders a sr-only caption when provided", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.name}
        caption="Merchants"
      />,
    );
    const caption = screen.getByText("Merchants");
    expect(caption.tagName.toLowerCase()).toBe("caption");
    expect(caption.className).toContain("sr-only");
  });

  it("applies the module header tone via the static class map", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.name}
        module="finyk"
      />,
    );
    // finyk header rides the strong companion in light, -300/70 in dark.
    const thead = screen
      .getByRole("columnheader", { name: "Name" })
      .closest("thead");
    expect(thead?.className).toContain("text-finyk-strong");
    expect(thead?.className).toContain("dark:text-finyk-300/70");
  });

  it("renders the string empty state when there are no rows", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.name}
        empty="Нічого немає"
      />,
    );
    expect(screen.getByText("Нічого немає")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders a custom empty node as-is", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.name}
        empty={<div data-testid="custom-empty">custom</div>}
      />,
    );
    expect(screen.getByTestId("custom-empty")).toBeTruthy();
  });

  it("still renders the table (not empty) when no empty slot is given", () => {
    render(
      <DataTable columns={columns} rows={[]} getRowKey={(r) => r.name} />,
    );
    // Header still present; just no body rows.
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("fires onRowClick with the row and index", () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.name}
        onRowClick={onRowClick}
      />,
    );
    fireEvent.click(screen.getByRole("rowheader", { name: "Bravo" }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(rows[1], 1);
  });

  it("opts into a sticky header only when asked", () => {
    const { rerender } = render(
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.name} />,
    );
    let thead = screen
      .getByRole("columnheader", { name: "Name" })
      .closest("thead");
    expect(thead?.className).not.toContain("sticky");

    rerender(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.name}
        stickyHeader
      />,
    );
    thead = screen
      .getByRole("columnheader", { name: "Name" })
      .closest("thead");
    expect(thead?.className).toContain("sticky");
    expect(thead?.className).toContain("z-sticky");
  });
});
