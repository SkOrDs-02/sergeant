/**
 * Tests for HubModuleStorageBoot — verifies that all seven module storage
 * boot hooks are called when the component mounts.
 *
 * Each boot hook is mocked at the module level so this test does not rely
 * on any SQLite / MMKV infra — it only verifies hook invocation order and
 * completeness.
 */

import { render } from "@testing-library/react-native";

const mockUseFinykDualWriteBoot = jest.fn();
const mockUseRoutineDualWriteBoot = jest.fn();
const mockUseFinykSqliteReadBoot = jest.fn();
const mockUseFinykMonoMirrorBoot = jest.fn();
const mockUseRoutineSqliteReadBoot = jest.fn();
const mockUseFizrukSqliteReadBoot = jest.fn();
const mockUseNutritionSqliteReadBoot = jest.fn();

jest.mock("@/modules/finyk/hooks/useFinykDualWriteBoot", () => ({
  useFinykDualWriteBoot: () => mockUseFinykDualWriteBoot(),
}));
jest.mock("@/modules/routine/hooks/useRoutineDualWriteBoot", () => ({
  useRoutineDualWriteBoot: () => mockUseRoutineDualWriteBoot(),
}));
jest.mock("@/modules/finyk/hooks/useFinykSqliteReadBoot", () => ({
  useFinykSqliteReadBoot: () => mockUseFinykSqliteReadBoot(),
}));
jest.mock("@/modules/finyk/hooks/useFinykMonoMirrorBoot", () => ({
  useFinykMonoMirrorBoot: () => mockUseFinykMonoMirrorBoot(),
}));
jest.mock("@/modules/routine/hooks/useRoutineSqliteReadBoot", () => ({
  useRoutineSqliteReadBoot: () => mockUseRoutineSqliteReadBoot(),
}));
jest.mock("@/modules/fizruk/hooks/useFizrukSqliteReadBoot", () => ({
  useFizrukSqliteReadBoot: () => mockUseFizrukSqliteReadBoot(),
}));
jest.mock("@/modules/nutrition/hooks/useNutritionSqliteReadBoot", () => ({
  useNutritionSqliteReadBoot: () => mockUseNutritionSqliteReadBoot(),
}));

import { HubModuleStorageBoot } from "./HubModuleStorageBoot";

beforeEach(() => {
  mockUseFinykDualWriteBoot.mockReset();
  mockUseRoutineDualWriteBoot.mockReset();
  mockUseFinykSqliteReadBoot.mockReset();
  mockUseFinykMonoMirrorBoot.mockReset();
  mockUseRoutineSqliteReadBoot.mockReset();
  mockUseFizrukSqliteReadBoot.mockReset();
  mockUseNutritionSqliteReadBoot.mockReset();
});

describe("HubModuleStorageBoot", () => {
  it("calls all seven boot hooks on mount", () => {
    render(<HubModuleStorageBoot />);

    // Write registrations (settings mutation paths)
    expect(mockUseFinykDualWriteBoot).toHaveBeenCalledTimes(1);
    expect(mockUseRoutineDualWriteBoot).toHaveBeenCalledTimes(1);

    // Read caches (Hub aggregators + settings read paths)
    expect(mockUseFinykSqliteReadBoot).toHaveBeenCalledTimes(1);
    expect(mockUseFinykMonoMirrorBoot).toHaveBeenCalledTimes(1);
    expect(mockUseRoutineSqliteReadBoot).toHaveBeenCalledTimes(1);
    expect(mockUseFizrukSqliteReadBoot).toHaveBeenCalledTimes(1);
    expect(mockUseNutritionSqliteReadBoot).toHaveBeenCalledTimes(1);
  });

  it("renders no visible output (returns null)", () => {
    const { toJSON } = render(<HubModuleStorageBoot />);
    expect(toJSON()).toBeNull();
  });
});
