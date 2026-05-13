import { describe, expect, it } from "vitest";
import { MCC_CATEGORIES_AI, getMccMap, lookupMccCategory } from "./mccMap.js";

describe("lookupMccCategory", () => {
  it("повертає 'groceries' для supermarket MCC", () => {
    expect(lookupMccCategory(5411)).toBe("groceries");
    expect(lookupMccCategory(5412)).toBe("groceries");
    expect(lookupMccCategory(5422)).toBe("groceries");
    expect(lookupMccCategory(5441)).toBe("groceries");
    expect(lookupMccCategory(5451)).toBe("groceries");
    expect(lookupMccCategory(5462)).toBe("groceries");
    expect(lookupMccCategory(5499)).toBe("groceries");
    expect(lookupMccCategory(5300)).toBe("groceries"); // Metro Cash & Carry
    expect(lookupMccCategory(5921)).toBe("groceries"); // Beer, wine & liquor
  });

  it("повертає 'transport' для fuel / taxi / car-rental MCC", () => {
    expect(lookupMccCategory(4111)).toBe("transport"); // Local commuter
    expect(lookupMccCategory(4121)).toBe("transport"); // Taxis
    expect(lookupMccCategory(4131)).toBe("transport"); // Bus
    expect(lookupMccCategory(4511)).toBe("transport"); // Airlines
    expect(lookupMccCategory(5541)).toBe("transport"); // Gas station
    expect(lookupMccCategory(5542)).toBe("transport"); // Auto fuel dispenser
    expect(lookupMccCategory(7512)).toBe("transport"); // Car rental
    expect(lookupMccCategory(7011)).toBe("transport"); // Hotels
  });

  it("повертає 'dining' для food-service MCC", () => {
    expect(lookupMccCategory(5811)).toBe("dining"); // Caterers
    expect(lookupMccCategory(5812)).toBe("dining"); // Restaurants
    expect(lookupMccCategory(5813)).toBe("dining"); // Bars
    expect(lookupMccCategory(5814)).toBe("dining"); // Fast food
  });

  it("повертає 'subscriptions' для digital-goods / cable / SaaS MCC", () => {
    expect(lookupMccCategory(4899)).toBe("subscriptions"); // Cable TV
    expect(lookupMccCategory(5815)).toBe("subscriptions"); // App Store / Steam
    expect(lookupMccCategory(5816)).toBe("subscriptions"); // Digital games
    expect(lookupMccCategory(5817)).toBe("subscriptions"); // Apps (non-game)
    expect(lookupMccCategory(7372)).toBe("subscriptions"); // SaaS / dev tools
    expect(lookupMccCategory(5735)).toBe("subscriptions"); // Music streaming
  });

  it("повертає 'utilities' для telecom / electric / govt MCC", () => {
    expect(lookupMccCategory(4814)).toBe("utilities"); // Telecom (Kyivstar, Vodafone)
    expect(lookupMccCategory(4900)).toBe("utilities"); // Utilities — electric, gas, water
    expect(lookupMccCategory(9311)).toBe("utilities"); // Tax payments
    expect(lookupMccCategory(9402)).toBe("utilities"); // Ukrposhta
  });

  it("повертає 'health' для аптек / клінік / госпіталів", () => {
    expect(lookupMccCategory(5122)).toBe("health"); // Drug wholesalers
    expect(lookupMccCategory(5912)).toBe("health"); // Drug stores & pharmacies
    expect(lookupMccCategory(8011)).toBe("health"); // Doctors
    expect(lookupMccCategory(8021)).toBe("health"); // Dentists
    expect(lookupMccCategory(8062)).toBe("health"); // Hospitals
    expect(lookupMccCategory(8099)).toBe("health"); // Medical services NEC
  });

  it("повертає 'shopping' для retail-clothing / electronics / hardware MCC", () => {
    expect(lookupMccCategory(5311)).toBe("shopping"); // Department stores
    expect(lookupMccCategory(5651)).toBe("shopping"); // Family clothing (Zara, H&M)
    expect(lookupMccCategory(5661)).toBe("shopping"); // Shoes
    expect(lookupMccCategory(5732)).toBe("shopping"); // Electronics (Allo)
    expect(lookupMccCategory(5251)).toBe("shopping"); // Hardware (Epicentr)
    expect(lookupMccCategory(5999)).toBe("shopping"); // Misc retail
  });

  it("повертає 'education' для шкіл / університетів / book stores", () => {
    expect(lookupMccCategory(5942)).toBe("education"); // Book stores
    expect(lookupMccCategory(8211)).toBe("education"); // Schools
    expect(lookupMccCategory(8220)).toBe("education"); // Universities
    expect(lookupMccCategory(8299)).toBe("education"); // Schools NEC
  });

  it("повертає 'entertainment' для cinema / sport / membership clubs", () => {
    expect(lookupMccCategory(7832)).toBe("entertainment"); // Movie theaters
    expect(lookupMccCategory(7922)).toBe("entertainment"); // Theatrical / concerts
    expect(lookupMccCategory(7941)).toBe("entertainment"); // Commercial sports
    expect(lookupMccCategory(7995)).toBe("entertainment"); // Betting & lottery
    expect(lookupMccCategory(7997)).toBe("entertainment"); // Membership clubs
  });

  it("повертає 'transfer' для ATM / wire / charity", () => {
    expect(lookupMccCategory(6011)).toBe("transfer"); // ATM cash
    expect(lookupMccCategory(6012)).toBe("transfer"); // Financial institutions
    expect(lookupMccCategory(6051)).toBe("transfer"); // Foreign currency / wire
    expect(lookupMccCategory(4829)).toBe("transfer"); // Wire transfer
    expect(lookupMccCategory(8398)).toBe("transfer"); // Charitable orgs
  });

  it("повертає null для MCC = 0", () => {
    expect(lookupMccCategory(0)).toBeNull();
  });

  it("повертає null для null / undefined", () => {
    expect(lookupMccCategory(null)).toBeNull();
    expect(lookupMccCategory(undefined)).toBeNull();
  });

  it("повертає null для невідомого MCC (fallthrough → AI)", () => {
    expect(lookupMccCategory(1234)).toBeNull();
    expect(lookupMccCategory(9000)).toBeNull();
    expect(lookupMccCategory(9999)).toBeNull();
    expect(lookupMccCategory(99999)).toBeNull();
    expect(lookupMccCategory(-1)).toBeNull();
  });

  it("повертає null для нецілочисельних значень", () => {
    expect(lookupMccCategory(5411.5)).toBeNull();
    expect(lookupMccCategory(Number.NaN)).toBeNull();
    expect(lookupMccCategory(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("покриття мапи: щонайменше 100 MCC", () => {
    const map = getMccMap();
    expect(Object.keys(map).length).toBeGreaterThanOrEqual(100);
  });

  it("кожен entry мапить на категорію з MCC_CATEGORIES_AI", () => {
    const allowed = new Set<string>(MCC_CATEGORIES_AI);
    const map = getMccMap();
    for (const [mcc, slug] of Object.entries(map)) {
      const code = Number(mcc);
      expect(Number.isInteger(code)).toBe(true);
      expect(code).toBeGreaterThan(0);
      expect(code).toBeLessThan(100_000);
      expect(allowed.has(slug)).toBe(true);
    }
  });

  it("getMccMap() повертає immutable snapshot — мутації не пройдуть в strict mode", () => {
    const map = getMccMap();
    expect(() => {
      (map as Record<number, string>)[5411] = "shopping";
    }).toThrow();
  });
});
