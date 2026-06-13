declare const process: {
  env: Record<string, string | undefined>;
};

declare module "next/link" {
  export default function Link(props: Record<string, unknown>): unknown;
}

declare module "@convex-dev/better-auth/nextjs" {
  import type { FunctionReference, FunctionReturnType } from "convex/server";

  type EmptyArgs = Record<string, never>;
  type AuthArgs<Query extends FunctionReference<"query">> =
    Query["_args"] extends EmptyArgs ? [args?: EmptyArgs] : [args: Query["_args"]];

  export function convexBetterAuthNextJs(config: {
    convexUrl: string;
    convexSiteUrl: string;
    basePath?: string;
  }): {
    handler: {
      GET(request: Request): Promise<Response>;
      POST(request: Request): Promise<Response>;
    };
    preloadAuthQuery: unknown;
    isAuthenticated(): Promise<boolean>;
    getToken(): Promise<string | undefined>;
    fetchAuthQuery<Query extends FunctionReference<"query">>(
      query: Query,
      ...args: AuthArgs<Query>
    ): Promise<FunctionReturnType<Query>>;
    fetchAuthMutation: unknown;
    fetchAuthAction: unknown;
  };
}

declare module "better-auth/react" {
  type AuthError = {
    message?: string;
    status?: number;
    statusText?: string;
  };

  type AuthResponse<Data extends object = {}> = Promise<{
    data: (Data & { url?: string }) | null;
    error: AuthError | null;
  }>;

  export function createAuthClient(config: Record<string, unknown>): {
    signIn: {
      email(input: {
        email: string;
        password: string;
        callbackURL?: string;
        rememberMe?: boolean;
      }): AuthResponse<{ redirect?: boolean; token?: string }>;
    };
    signUp: {
      email(input: {
        email: string;
        name: string;
        password: string;
        callbackURL?: string;
        rememberMe?: boolean;
      }): AuthResponse<{ token?: string | null }>;
    };
    signOut(): AuthResponse<{ success?: boolean }>;
  };
}

declare module "@convex-dev/better-auth/client/plugins" {
  export function convexClient(): unknown;
}

declare namespace JSX {
  type Element = unknown;
  interface IntrinsicElements {
    [elementName: string]: unknown;
  }
}
