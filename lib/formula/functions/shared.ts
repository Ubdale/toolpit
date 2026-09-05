/**
 * What every function module imports.
 *
 * The registry is split by category because a single file of sixty function
 * definitions is unreviewable, but they all satisfy one contract: metadata
 * rich enough to render the guided picker, plus the implementation. Keeping
 * those together is the point - a function cannot be added to the engine
 * without also describing itself to the UI.
 */

export {
  FormulaError,
  isError,
  type Column,
  type EvalContext,
  type FormulaValue,
  type FunctionDef as FormulaDef,
  type Scalar,
} from '../types';
