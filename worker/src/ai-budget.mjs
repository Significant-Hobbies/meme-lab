const RETRIEVAL_DIMENSIONS=5*768;
const MONTHLY_VECTORIZE_CAP=45_000_000;

export class BudgetUnavailableError extends Error {
  constructor(reason) {
    super('Shared inference budget is unavailable or exhausted.');
    this.reason=reason;
  }
}

export async function reserveRetrievalBudget(env) {
  const budget=env.NEURON_BUDGET;
  if(!budget) throw new BudgetUnavailableError('binding_missing');
  const monthKey=new Date().toISOString().slice(0,7);
  let response;
  try {
    // Reserve all five possible queries, including the legacy metadata fallback.
    // An unknown outcome is never retried because the first debit may have committed.
    response=await budget.get(budget.idFromName('global-budget')).fetch('https://internal.local/try-debit-vectorize',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({dimensions:RETRIEVAL_DIMENSIONS})
    });
  } catch {
    throw new BudgetUnavailableError('reservation_transport_error');
  }

  const receipt=await response.json().catch(()=>null);
  if(!response.ok) {
    const baselineUnavailable=response.status===503&&receipt?.error==='Verified monthly Vectorize baseline unavailable';
    throw new BudgetUnavailableError(baselineUnavailable?'verified_baseline_unavailable':'reservation_http_error');
  }
  if(!receipt||receipt.baselineVerified!==true||!/^\d{4}-\d{2}$/.test(receipt.monthKey)
    ||!Number.isSafeInteger(receipt.used)||receipt.used<0
    ||!Number.isSafeInteger(receipt.remaining)||receipt.remaining<0
    ||receipt.used+receipt.remaining!==MONTHLY_VECTORIZE_CAP) {
    throw new BudgetUnavailableError('invalid_reservation_receipt');
  }
  if(receipt.monthKey!==monthKey) throw new BudgetUnavailableError('reservation_period_mismatch');
  if(receipt.allowed===false&&receipt.remaining<RETRIEVAL_DIMENSIONS
    &&Number.isSafeInteger(receipt.retryAfter)&&receipt.retryAfter>0) {
    throw new BudgetUnavailableError('budget_exhausted');
  }
  if(receipt.allowed!==true||receipt.used<RETRIEVAL_DIMENSIONS||receipt.retryAfter!==0) {
    throw new BudgetUnavailableError('invalid_reservation_receipt');
  }
}
