/**
 * imagetracerjs ships as an untyped UMD bundle exporting one ready-made
 * instance. Only the entry point Toolpit calls is declared here.
 */
declare module 'imagetracerjs' {
  const ImageTracer: {
    imagedataToSVG: (data: ImageData, options?: Record<string, unknown> | string) => string;
  };
  export default ImageTracer;
}
