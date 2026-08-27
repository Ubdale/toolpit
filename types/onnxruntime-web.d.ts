/**
 * Minimal type declarations for onnxruntime-web 1.21.
 *
 * The version is pinned to 1.21.0 because @imgly/background-removal declares
 * it as an exact peer and loads ORT's JS from node_modules while fetching the
 * matching wasm binary from its own CDN — mismatch the two and the background
 * remover dies with "_OrtGetInputOutputMetadata is not a function".
 *
 * That version, however, ships an export map with no `types` condition on any
 * entry, so under `moduleResolution: "bundler"` TypeScript treats the whole
 * package as untyped. Its bundled `types.d.ts` cannot be referenced either: the
 * ambient blocks inside it re-export from `onnxruntime-common`, which is nested
 * out of reach and equally untyped.
 *
 * So this declares exactly the surface Toolpit uses, and nothing more. It is
 * deliberately narrow — a wrong guess here would be caught by the inpainting
 * tool's own tests rather than hidden behind a blanket `any`. Delete this file
 * if the pin ever moves to 1.29+, which carries proper `types` conditions.
 */
declare module 'onnxruntime-web' {
  export type TensorDataType = 'uint8' | 'float32' | 'int32' | 'int64' | 'bool';

  export class Tensor {
    constructor(type: TensorDataType, data: ArrayBufferView, dims: readonly number[]);
    readonly data: ArrayBufferView;
    readonly dims: readonly number[];
    readonly type: TensorDataType;
  }

  export interface InferenceSession {
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor | undefined>>;
    release(): Promise<void>;
  }

  export const InferenceSession: {
    create(
      model: ArrayBuffer | Uint8Array | string,
      options?: {
        executionProviders?: readonly ('wasm' | 'webgpu' | 'webgl' | 'cpu')[];
        graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
      },
    ): Promise<InferenceSession>;
  };

  export const env: {
    logLevel: 'verbose' | 'info' | 'warning' | 'error' | 'fatal';
    wasm: {
      /** Directory the .wasm and its loader .mjs are served from. */
      wasmPaths: string;
      numThreads: number;
    };
  };
}

/**
 * The same API with only the CPU backend registered. Importing the root entry
 * instead would pull the JSEP loader and a second, much larger binary that we
 * would then have to host, for no gain — inference here runs on wasm.
 */
declare module 'onnxruntime-web/wasm' {
  export * from 'onnxruntime-web';
}
