declare const process: {
  env: Record<string, string | undefined>;
};

declare module "convex/server" {
  export type AuthConfig = Record<string, unknown>;
  export function defineApp(): { use(plugin: unknown): void };
  export function httpRouter(): unknown;
}

declare module "@convex-dev/better-auth" {
  export type GenericCtx<T = unknown> = unknown;
  export function createClient<T = unknown>(component: unknown): {
    adapter(ctx: GenericCtx<T>): unknown;
    getAuthUser(ctx: GenericCtx<T>): unknown;
    safeGetAuthUser(ctx: GenericCtx<T>): unknown;
    registerRoutes(http: unknown, createAuth: unknown): void;
  };
}

declare module "@convex-dev/better-auth/convex.config" {
  const betterAuth: unknown;
  export default betterAuth;
}

declare module "@convex-dev/better-auth/auth-config" {
  export function getAuthConfigProvider(): unknown;
}

declare module "@convex-dev/better-auth/plugins" {
  export function convex(config: Record<string, unknown>): unknown;
}

declare module "better-auth/minimal" {
  export function betterAuth(config: Record<string, unknown>): unknown;
}
