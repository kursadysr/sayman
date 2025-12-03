// Loan calculation utilities

export interface AmortizationEntry {
  paymentNumber: number;
  paymentDate: Date;
  paymentAmount: number;
  principalAmount: number;
  interestAmount: number;
  remainingBalance: number;
}

/**
 * Calculate monthly payment for a loan using standard amortization formula
 */
export function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  termMonths: number
): number {
  if (annualRate === 0) {
    return principal / termMonths;
  }
  
  const monthlyRate = annualRate / 12;
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
                  (Math.pow(1 + monthlyRate, termMonths) - 1);
  
  return Math.round(payment * 100) / 100;
}

/**
 * Calculate payment amount based on frequency
 */
export function calculatePaymentAmount(
  principal: number,
  annualRate: number,
  termMonths: number,
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually'
): number {
  const monthlyPayment = calculateMonthlyPayment(principal, annualRate, termMonths);
  
  switch (frequency) {
    case 'weekly':
      return Math.round((monthlyPayment * 12 / 52) * 100) / 100;
    case 'biweekly':
      return Math.round((monthlyPayment * 12 / 26) * 100) / 100;
    case 'monthly':
      return monthlyPayment;
    case 'quarterly':
      return Math.round((monthlyPayment * 3) * 100) / 100;
    case 'annually':
      return Math.round((monthlyPayment * 12) * 100) / 100;
  }
}

/**
 * Generate full amortization schedule
 */
export function generateAmortizationSchedule(
  principal: number,
  annualRate: number,
  termMonths: number,
  startDate: Date,
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually' = 'monthly'
): AmortizationEntry[] {
  const schedule: AmortizationEntry[] = [];
  const monthlyPayment = calculateMonthlyPayment(principal, annualRate, termMonths);
  const monthlyRate = annualRate / 12;
  
  let balance = principal;
  let currentDate = new Date(startDate);
  
  // Adjust number of payments based on frequency
  let totalPayments = termMonths;
  let periodsPerYear = 12;
  
  switch (frequency) {
    case 'weekly':
      totalPayments = Math.ceil(termMonths * 52 / 12);
      periodsPerYear = 52;
      break;
    case 'biweekly':
      totalPayments = Math.ceil(termMonths * 26 / 12);
      periodsPerYear = 26;
      break;
    case 'quarterly':
      totalPayments = Math.ceil(termMonths / 3);
      periodsPerYear = 4;
      break;
    case 'annually':
      totalPayments = Math.ceil(termMonths / 12);
      periodsPerYear = 1;
      break;
  }
  
  const paymentAmount = calculatePaymentAmount(principal, annualRate, termMonths, frequency);
  const periodRate = annualRate / periodsPerYear;
  
  for (let i = 1; i <= totalPayments && balance > 0; i++) {
    const interestAmount = Math.round(balance * periodRate * 100) / 100;
    let principalAmount = Math.round((paymentAmount - interestAmount) * 100) / 100;
    
    // Adjust last payment to clear balance exactly
    if (principalAmount > balance) {
      principalAmount = balance;
    }
    
    balance = Math.round((balance - principalAmount) * 100) / 100;
    
    // Ensure balance doesn't go negative
    if (balance < 0) balance = 0;
    
    schedule.push({
      paymentNumber: i,
      paymentDate: new Date(currentDate),
      paymentAmount: principalAmount + interestAmount,
      principalAmount,
      interestAmount,
      remainingBalance: balance,
    });
    
    // Move to next payment date
    switch (frequency) {
      case 'weekly':
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case 'biweekly':
        currentDate.setDate(currentDate.getDate() + 14);
        break;
      case 'monthly':
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case 'quarterly':
        currentDate.setMonth(currentDate.getMonth() + 3);
        break;
      case 'annually':
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        break;
    }
  }
  
  return schedule;
}

/**
 * Calculate next payment details based on remaining balance
 */
export function calculateNextPayment(
  remainingBalance: number,
  annualRate: number,
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually',
  regularPayment: number
): { total: number; principal: number; interest: number } {
  let periodsPerYear = 12;
  
  switch (frequency) {
    case 'weekly': periodsPerYear = 52; break;
    case 'biweekly': periodsPerYear = 26; break;
    case 'quarterly': periodsPerYear = 4; break;
    case 'annually': periodsPerYear = 1; break;
  }
  
  const periodRate = annualRate / periodsPerYear;
  const interest = Math.round(remainingBalance * periodRate * 100) / 100;
  let principal = Math.round((regularPayment - interest) * 100) / 100;
  
  // Adjust if this would be the final payment
  if (principal > remainingBalance) {
    principal = remainingBalance;
  }
  
  return {
    total: Math.round((principal + interest) * 100) / 100,
    principal,
    interest,
  };
}

/**
 * Format frequency for display
 */
export function formatFrequency(frequency: string): string {
  switch (frequency) {
    case 'weekly': return 'Weekly';
    case 'biweekly': return 'Bi-weekly';
    case 'monthly': return 'Monthly';
    case 'quarterly': return 'Quarterly';
    case 'annually': return 'Annually';
    default: return frequency;
  }
}

