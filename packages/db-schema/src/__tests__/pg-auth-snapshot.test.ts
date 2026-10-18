import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { account, session, user, verification } from "../pg/auth.js";

describe("pg/auth schema snapshot", () => {
  it("keeps Better Auth's singular table names and model columns", () => {
    expect(getTableConfig(user).name).toBe("user");
    expect(getTableConfig(session).name).toBe("session");
    expect(getTableConfig(account).name).toBe("account");
    expect(getTableConfig(verification).name).toBe("verification");

    expect(getTableConfig(user).columns.map((column) => column.name)).toEqual([
      "id",
      "name",
      "email",
      "emailVerified",
      "image",
      "createdAt",
      "updatedAt",
      "deletion_requested_at",
    ]);
    expect(
      getTableConfig(session).columns.map((column) => column.name),
    ).toEqual([
      "id",
      "expiresAt",
      "token",
      "createdAt",
      "updatedAt",
      "ipAddress",
      "userAgent",
      "userId",
    ]);
    expect(
      getTableConfig(account).columns.map((column) => column.name),
    ).toEqual([
      "id",
      "accountId",
      "providerId",
      "userId",
      "accessToken",
      "refreshToken",
      "idToken",
      "accessTokenExpiresAt",
      "refreshTokenExpiresAt",
      "scope",
      "password",
      "createdAt",
      "updatedAt",
    ]);
    expect(
      getTableConfig(verification).columns.map((column) => column.name),
    ).toEqual([
      "id",
      "identifier",
      "value",
      "expiresAt",
      "createdAt",
      "updatedAt",
    ]);
  });

  it("keeps the user id primary key, unique email, and nullable deletion marker", () => {
    const columns = Object.fromEntries(
      getTableConfig(user).columns.map((column) => [column.name, column]),
    );

    expect(columns["id"]!.primary).toBe(true);
    expect(columns["id"]!.notNull).toBe(true);
    expect(columns["email"]!.notNull).toBe(true);
    expect(columns["email"]!.isUnique).toBe(true);
    expect(columns["deletion_requested_at"]!.notNull).toBe(false);
    expect(columns["deletion_requested_at"]!.columnType).toBe("PgTimestamp");
  });

  it("keeps session tokens unique and session/account rows user-scoped", () => {
    const sessionConfig = getTableConfig(session);
    const accountConfig = getTableConfig(account);
    const token = sessionConfig.columns.find(
      (column) => column.name === "token",
    );

    expect(token?.notNull).toBe(true);
    expect(token?.isUnique).toBe(true);

    for (const foreignKey of [
      ...sessionConfig.foreignKeys,
      ...accountConfig.foreignKeys,
    ]) {
      const reference = foreignKey.reference();
      expect(reference.columns.map((column) => column.name)).toEqual([
        "userId",
      ]);
      expect(reference.foreignColumns.map((column) => column.name)).toEqual([
        "id",
      ]);
      expect(reference.foreignTable).toBe(user);
      expect(foreignKey.onDelete).toBe("cascade");
    }
    expect(sessionConfig.foreignKeys).toHaveLength(1);
    expect(accountConfig.foreignKeys).toHaveLength(1);
  });
});
