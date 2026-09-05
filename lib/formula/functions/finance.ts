import { numbersIn, toNumber } from '../coerce';
import { FormulaError, isError, type FormulaDef } from './shared';

/**
 * The handful of finance functions people actually reach for.
 *
 * Excel's sign convention is preserved: money paid out is negative, money
 * received is positive, which is why PMT on a loan returns a negative number.
 * That surprises people, so each summary says so rather than quietly
 * returning a sign they did not expect.
 */

/** Present-value factor, with the rate-of-zero case split out to avoid 0/0. */
function annuityFactor(rate: number, periods: number): number {
  return rate === 0 ? periods : (1 - (1 + rate) ** -periods) / rate;
}

export const FINANCE_FUNCTIONS: FormulaDef[] = [
  {
    name: 'PMT',
    category: 'Finance',
    summary: 'The repayment per period on a loan. Comes back negative - it is money leaving.',
    pattern: 'Repayment on {2} at {0} over {1} periods',
    popular: true,
    aliases: ['loan payment', 'mortgage', 'repayment', 'instalment', 'emi'],
    args: [
      { name: 'rate', mode: 'value', label: 'Rate per period', description: 'A yearly 6% paid monthly is 0.06/12.', accepts: 'number', placeholder: '0.05/12' },
      { name: 'periods', mode: 'value', label: 'Number of periods', description: 'Months, if the rate is monthly.', accepts: 'number', placeholder: '360' },
      { name: 'amount', mode: 'value', label: 'Loan amount', description: 'The sum borrowed.', accepts: 'number', placeholder: '250000' },
      { name: 'future', mode: 'value', label: 'Balance at the end', description: 'Usually 0.', accepts: 'number', optional: true, placeholder: '0' },
    ],
    example: 'PMT(0.05/12, 360, [Loan amount])',
    evaluate: (args) => {
      const rate = toNumber(args[0] ?? null);
      const periods = toNumber(args[1] ?? null);
      const present = toNumber(args[2] ?? null);
      const future = toNumber(args[3] ?? 0);
      if (isError(rate)) return rate;
      if (isError(periods)) return periods;
      if (isError(present)) return present;
      if (isError(future)) return future;
      if (periods === 0) return new FormulaError('#NUM!', 'There must be at least one period.');

      if (rate === 0) return -(present + future) / periods;
      return -(present + future * (1 + rate) ** -periods) / annuityFactor(rate, periods);
    },
  },
  {
    name: 'FV',
    category: 'Finance',
    summary: 'What a running investment is worth at the end.',
    pattern: 'Future value of {2} per period at {0} over {1}',
    aliases: ['future value', 'compound interest', 'savings'],
    args: [
      { name: 'rate', mode: 'value', label: 'Rate per period', description: 'For example 0.04/12.', accepts: 'number', placeholder: '0.04/12' },
      { name: 'periods', mode: 'value', label: 'Number of periods', description: 'How many payments.', accepts: 'number', placeholder: '120' },
      { name: 'payment', mode: 'value', label: 'Payment per period', description: 'Negative if you are paying it in.', accepts: 'number', placeholder: '-200' },
      { name: 'present', mode: 'value', label: 'Starting balance', description: 'Usually 0.', accepts: 'number', optional: true, placeholder: '0' },
    ],
    example: 'FV(0.04/12, 120, -200, 0)',
    evaluate: (args) => {
      const rate = toNumber(args[0] ?? null);
      const periods = toNumber(args[1] ?? null);
      const payment = toNumber(args[2] ?? 0);
      const present = toNumber(args[3] ?? 0);
      if (isError(rate)) return rate;
      if (isError(periods)) return periods;
      if (isError(payment)) return payment;
      if (isError(present)) return present;

      if (rate === 0) return -(present + payment * periods);
      const growth = (1 + rate) ** periods;
      return -(present * growth + payment * ((growth - 1) / rate));
    },
  },
  {
    name: 'PV',
    category: 'Finance',
    summary: 'What a stream of future payments is worth today.',
    pattern: 'Present value of {2} per period at {0} over {1}',
    aliases: ['present value', 'discounted', 'worth today'],
    args: [
      { name: 'rate', mode: 'value', label: 'Rate per period', description: 'The discount rate.', accepts: 'number', placeholder: '0.08' },
      { name: 'periods', mode: 'value', label: 'Number of periods', description: 'How many payments.', accepts: 'number', placeholder: '10' },
      { name: 'payment', mode: 'value', label: 'Payment per period', description: 'The recurring amount.', accepts: 'number', placeholder: '1000' },
      { name: 'future', mode: 'value', label: 'Final lump sum', description: 'Usually 0.', accepts: 'number', optional: true, placeholder: '0' },
    ],
    example: 'PV(0.08, 10, 1000)',
    evaluate: (args) => {
      const rate = toNumber(args[0] ?? null);
      const periods = toNumber(args[1] ?? null);
      const payment = toNumber(args[2] ?? 0);
      const future = toNumber(args[3] ?? 0);
      if (isError(rate)) return rate;
      if (isError(periods)) return periods;
      if (isError(payment)) return payment;
      if (isError(future)) return future;

      if (rate === 0) return -(future + payment * periods);
      return -(future * (1 + rate) ** -periods + payment * annuityFactor(rate, periods));
    },
  },
  {
    name: 'NPV',
    category: 'Finance',
    summary: 'Net present value of a series of cash flows.',
    pattern: 'Net present value of {1} discounted at {0}',
    aliases: ['net present value', 'discounted cash flow', 'dcf'],
    args: [
      { name: 'rate', mode: 'value', label: 'Discount rate', description: 'Per period, for example 0.1.', accepts: 'number', placeholder: '0.1' },
      { name: 'values', mode: 'range', label: 'Cash flows', description: 'A column of amounts, first period first.', accepts: 'number', variadic: true },
    ],
    example: 'NPV(0.1, Project[Cash flow])',
    evaluate: (args) => {
      const rate = toNumber(args[0] ?? null);
      if (isError(rate)) return rate;
      if (rate === -1) return new FormulaError('#DIV/0!');
      return numbersIn(args.slice(1)).reduce(
        (total, amount, index) => total + amount / (1 + rate) ** (index + 1),
        0,
      );
    },
  },
  {
    name: 'MARGIN',
    category: 'Finance',
    summary: 'Profit as a percentage of revenue.',
    pattern: 'Margin of {0} against {1}',
    popular: true,
    aliases: ['profit margin', 'markup', 'percentage of'],
    args: [
      { name: 'profit', mode: 'value', label: 'Profit', description: 'Revenue minus cost.', accepts: 'number' },
      { name: 'revenue', mode: 'value', label: 'Revenue', description: 'The total taken.', accepts: 'number' },
    ],
    example: 'MARGIN([Revenue] - [Cost], [Revenue])',
    evaluate: (args) => {
      const profit = toNumber(args[0] ?? null);
      const revenue = toNumber(args[1] ?? null);
      if (isError(profit)) return profit;
      if (isError(revenue)) return revenue;
      if (revenue === 0) return new FormulaError('#DIV/0!', 'Revenue is zero.');
      return profit / revenue;
    },
  },
  {
    name: 'GROWTH',
    category: 'Finance',
    summary: 'The percentage change from one number to another.',
    pattern: 'Growth from {0} to {1}',
    popular: true,
    aliases: ['percent change', 'increase', 'variance', 'delta', 'yoy'],
    args: [
      { name: 'from', mode: 'value', label: 'From', description: 'The earlier value.', accepts: 'number' },
      { name: 'to', mode: 'value', label: 'To', description: 'The later value.', accepts: 'number' },
    ],
    example: 'GROWTH([Last year], [This year])',
    evaluate: (args) => {
      const from = toNumber(args[0] ?? null);
      const to = toNumber(args[1] ?? null);
      if (isError(from)) return from;
      if (isError(to)) return to;
      if (from === 0) return new FormulaError('#DIV/0!', 'The starting value is zero.');
      return (to - from) / Math.abs(from);
    },
  },
];
