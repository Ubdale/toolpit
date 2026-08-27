// vtracer-webapp ships types for its bundler entry but not for the wasm-bindgen
// glue module, which lib/vector/trace.ts imports directly so it can instantiate
// the wasm itself. Only the members Toolpit touches are declared.
declare module 'vtracer-webapp/vtracer_webapp_bg.js' {
  export function __wbg_set_wasm(exports: unknown): void;

  interface Converter {
    init(): void;
    /** Returns true once the conversion is finished. */
    tick(): boolean;
    progress(): number;
    free(): void;
  }

  export const ColorImageConverter: { new_with_string(params: string): Converter };
  export const BinaryImageConverter: { new_with_string(params: string): Converter };
}
