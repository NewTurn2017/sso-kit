declare namespace React {
  type ComponentType<P = {}> = (props: P) => unknown;
  type ReactNode = unknown;
}

declare module "react" {
  export type ReactNode = React.ReactNode;

  export function useRef<T>(initialValue: T | null): {
    current: T | null;
  };

  export function useState<S>(
    initialState: S | (() => S)
  ): [S, (value: S | ((previous: S) => S)) => void];
}
