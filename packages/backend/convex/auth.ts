import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { query } from "./_generated/server";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL ?? process.env.AUTH_ORIGIN ?? "http://auth.localhost:3000";
const cookieDomain = process.env.COOKIE_DOMAIN ?? "localhost";
const trustedOrigins = (process.env.TRUSTED_ORIGINS ??
  [
    "http://auth.localhost:3000",
    "http://chat.localhost:3001",
    "http://auth.lvh.me:3000",
    "http://chat.lvh.me:3001",
  ].join(","))
  .split(",")
  .map((origin: string) => origin.trim())
  .filter(Boolean);

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
        domain: cookieDomain,
      },
    },
    trustedOrigins,
    plugins: [convex({ authConfig })],
  });

export const getCurrentUser = query({
  args: {},
  handler: async (ctx: GenericCtx<DataModel>) => {
    return (await authComponent.safeGetAuthUser(ctx)) ?? null;
  },
});
